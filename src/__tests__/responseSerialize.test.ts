import { describe, expect, it } from 'vitest';
import { serializeResponseText } from '../../injected/engine';

interface FakeNode {
  nodeType: number;
  tagName?: string;
  childNodes?: FakeNode[];
  readonly textContent: string;
  querySelectorAll?: (selector: string) => FakeNode[];
}

function text(content: string): FakeNode {
  return { nodeType: 3, textContent: content };
}

function el(tag: string, children: FakeNode[] = []): FakeNode {
  const node: FakeNode = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    get textContent() {
      return children.map((child) => child.textContent).join('');
    },
    querySelectorAll(selector: string) {
      const tags = selector.split(',').map((part) => part.trim().toUpperCase());
      const found: FakeNode[] = [];
      const walk = (parent: FakeNode) => {
        for (const child of parent.childNodes ?? []) {
          if (child.tagName && tags.includes(child.tagName)) found.push(child);
          walk(child);
        }
      };
      walk(node);
      return found;
    },
  };
  return node;
}

const serialize = (node: FakeNode) => serializeResponseText(node as unknown as Element);

describe('serializeResponseText', () => {
  it('keeps paragraph breaks instead of flattening blocks', () => {
    const root = el('div', [el('p', [text('第一段')]), el('p', [text('第二段')])]);
    expect(serialize(root)).toBe('第一段\n\n第二段');
  });

  it('puts list items on their own lines', () => {
    const root = el('ul', [el('li', [text('one')]), el('li', [text('two')])]);
    expect(serialize(root)).toBe('one\n\ntwo');
  });

  it('turns <br> into a line break', () => {
    const root = el('p', [text('a'), el('br'), text('b')]);
    expect(serialize(root)).toBe('a\nb');
  });

  it('converts tables to markdown and escapes pipes', () => {
    const root = el('table', [
      el('tr', [el('th', [text('名稱')]), el('th', [text('值')])]),
      el('tr', [el('td', [text('a|b')]), el('td', [text('  多  空白 ')])]),
    ]);
    expect(serialize(root)).toBe('| 名稱 | 值 |\n| --- | --- |\n| a\\|b | 多 空白 |');
  });

  it('preserves code indentation inside <pre>', () => {
    const root = el('div', [el('pre', [text('if x:\n    y()')])]);
    expect(serialize(root)).toBe('if x:\n    y()');
  });

  it('falls back to textContent when childNodes is unavailable', () => {
    const bare = { nodeType: 1, tagName: 'DIV', textContent: 'native answer' };
    expect(serializeResponseText(bare as unknown as Element)).toBe('native answer');
  });
});
