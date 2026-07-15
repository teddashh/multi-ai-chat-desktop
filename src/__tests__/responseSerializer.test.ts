import { describe, expect, it } from 'vitest';
import { serializeResponseText } from '../../injected/responseSerializer';

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

  it('uses fenced code while preserving indentation on the very first preformatted line', () => {
    const root = element('pre', [
      element('code', [text('    firstLine()\n  secondLine()')], { class: 'language-ts' }),
    ]);

    expect(serialize(root)).toBe('```ts\n    firstLine()\n  secondLine()\n```');
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
