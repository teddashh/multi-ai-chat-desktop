import { describe, expect, it } from 'vitest';
import { longerResponseText, serializeResponseText } from '../../injected/responseSerializer';

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

  it('restores code blocks verbatim when they contain String.replace substitution patterns', () => {
    // $&、$'、$` 在替換字串裡有特殊意義，會把整段程式碼換成佔位符或前後文，
    // 而且外觀正常看不出被竄改，還會原封不動餵進下一棒 AI。
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

describe('longerResponseText', () => {
  it('takes the freshly read DOM text only when it adds content to the cache', () => {
    // 串流是純附加，較長的那份才是完整的一份。
    expect(longerResponseText('opening line', 'opening line and the rest')).toBe('opening line and the rest');
    // 反向要守住：DOM 已被清空或換掉時不能拿短的那份蓋掉收齊的內容。
    expect(longerResponseText('the whole answer', 'the')).toBe('the whole answer');
    expect(longerResponseText('the whole answer', null)).toBe('the whole answer');
  });
});
