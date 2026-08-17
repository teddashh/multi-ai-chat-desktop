import { describe, expect, it } from 'vitest';
import { finalResponseText, serializeResponseText } from '../../injected/responseSerializer';

interface FakeNode {
  nodeType: number;
  tagName?: string;
  childNodes?: FakeNode[];
  attributes?: Record<string, string>;
  readonly textContent: string;
  getAttribute?: (name: string) => string | null;
}

function text(content: string): FakeNode {
  return { nodeType: 3, textContent: content };
}

function element(tag: string, children: FakeNode[] = [], attributes: Record<string, string> = {}): FakeNode {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    attributes,
    get textContent() {
      return children.map((child) => child.textContent).join('');
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

const serialize = (node: FakeNode) => serializeResponseText(node as unknown as Element);

describe('serializeResponseText', () => {
  it('keeps block boundaries and converts semantic inline markup', () => {
    const root = element('div', [
      element('h2', [text('Result')]),
      element('p', [text('First '), element('strong', [text('important')]), text(' line.')]),
      element('p', [text('Second'), element('br'), text('line with '), element('em', [text('emphasis')])]),
      element('a', [text('Source')], { href: 'https://example.com/docs' }),
    ]);

    expect(serialize(root)).toBe(
      '## Result\n\nFirst **important** line.\n\nSecond\nline with *emphasis*\n\n[Source](https://example.com/docs)',
    );
  });

  it('keeps ordered, unordered, and nested list structure', () => {
    const root = element('ul', [
      element('li', [text('one')]),
      element('li', [text('two'), element('ol', [element('li', [text('nested')])])]),
    ]);

    expect(serialize(root)).toBe('- one\n- two\n  1. nested');
  });

  it('converts only direct table rows and cells, escaping pipes without duplicating nested rows', () => {
    const nested = element('table', [element('tbody', [element('tr', [element('td', [text('inner|value')])])])]);
    const root = element('table', [
      element('thead', [element('tr', [element('th', [text('Name')]), element('th', [text('Value')])])]),
      element('tbody', [element('tr', [element('td', [text('outer')]), element('td', [text('cell '), nested])])]),
    ]);

    const serialized = serialize(root);
    expect(serialized).toBe('| Name | Value |\n| --- | --- |\n| outer | cell inner\\|value |');
    expect(serialized.split('\n')).toHaveLength(3);
  });

  it('converts tables whose rows are direct children of <table>', () => {
    const root = element('table', [
      element('tr', [element('th', [text('Name')]), element('th', [text('Value')])]),
      element('tr', [element('td', [text('a')]), element('td', [text('b')])]),
    ]);

    expect(serialize(root)).toBe('| Name | Value |\n| --- | --- |\n| a | b |');
  });

  it('uses fenced code while preserving indentation on the very first preformatted line', () => {
    const root = element('pre', [
      element('code', [text('    firstLine()\n  secondLine()')], { class: 'language-ts' }),
    ]);

    expect(serialize(root)).toBe('```ts\n    firstLine()\n  secondLine()\n```');
  });

  it('fences bare <pre> blocks that have no inner <code>', () => {
    const root = element('pre', [text('if x:\n    y()')]);

    expect(serialize(root)).toBe('```\nif x:\n    y()\n```');
  });

  it('recovers code-block line breaks from the rendered layout when the markup has none', () => {
    // A highlighter that wraps every line in its own element leaves no newline character in the
    // markup. textContent then joins the lines into one run-on string that still carries their
    // indentation, which flattens an ASCII diagram into a single unreadable line in the export.
    const lines = ['PostgreSQL', '├── users', '└── memories'];
    const code = Object.assign(
      element('code', lines.map((line) => element('span', [text(line)]))),
      { innerText: lines.join('\n') },
    );

    expect(serialize(element('pre', [code]))).toBe('```\nPostgreSQL\n├── users\n└── memories\n```');
  });

  it('keeps the literal markup when the code block already carries its own newlines', () => {
    // innerText reports what the layout shows, which can drop leading indentation. Markup that
    // already has the line breaks is the more faithful source, so it wins.
    const code = Object.assign(element('code', [text('first()\n    second()')]), {
      innerText: 'first()\nsecond()',
    });

    expect(serialize(element('pre', [code]))).toBe('```\nfirst()\n    second()\n```');
  });

  it('restores code blocks verbatim when they contain String.replace substitution patterns', () => {
    // $&, $' and $` are special inside a replacement string and rewrite the block with the
    // placeholder or the surrounding text. The result still looks like valid code, and it is
    // forwarded verbatim to the next AI in the workflow.
    const code = 'echo "$&" && echo \'$`\' && echo "$\'" && echo "100$$"';
    const root = element('div', [
      element('p', [text('Run this:')]),
      element('pre', [element('code', [text(code)])]),
    ]);

    expect(serialize(root)).toBe(`Run this:\n\n\`\`\`\n${code}\n\`\`\``);
  });

  it('ignores non-elements safely and falls back when childNodes is unavailable', () => {
    const root = element('div', [
      { nodeType: 8, textContent: 'hidden comment' },
      element('span', [text('visible')]),
      element('button', [text('Copy')]),
    ]);
    const bare = { nodeType: 1, tagName: 'DIV', textContent: ' native answer ' };

    expect(serialize(root)).toBe('visible');
    expect(serializeResponseText(bare as unknown as Element)).toBe('native answer');
  });
});

describe('finalResponseText', () => {
  it('uses the finish-time DOM read as authoritative and falls back only when it is absent', () => {
    expect(finalResponseText('opening line', 'opening line and the rest')).toBe('opening line and the rest');
    expect(finalResponseText('a longer streamed draft', 'short final answer')).toBe('short final answer');
    expect(finalResponseText('same length A', 'same length B')).toBe('same length B');
    expect(finalResponseText('the cached answer', null)).toBe('the cached answer');
  });
});
