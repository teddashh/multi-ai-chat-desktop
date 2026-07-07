import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookRuntime = vi.hoisted(() => {
  let cursor = 0;
  let rerender = () => {};
  const initialized: boolean[] = [];
  const values: unknown[] = [];

  return {
    reset() {
      cursor = 0;
      rerender = () => {};
      initialized.length = 0;
      values.length = 0;
    },
    begin(nextRerender: () => void) {
      cursor = 0;
      rerender = nextRerender;
    },
    useState(initial: unknown) {
      const index = cursor;
      cursor += 1;
      if (!initialized[index]) {
        values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
        initialized[index] = true;
      }
      const setState = (next: unknown) => {
        values[index] = typeof next === 'function' ? (next as (current: unknown) => unknown)(values[index]) : next;
        rerender();
      };
      return [values[index], setState];
    },
    useRef(initial: unknown) {
      const index = cursor;
      cursor += 1;
      if (!initialized[index]) {
        values[index] = { current: initial };
        initialized[index] = true;
      }
      return values[index];
    },
    useEffect() {
      cursor += 1;
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: hookRuntime.useEffect,
    useRef: hookRuntime.useRef,
    useState: hookRuntime.useState,
  };
});

import { isValidElement } from 'react';
import { InputBar } from '../ui/InputBar';
import {
  ATTACHMENT_LIMIT_MESSAGE,
  BINARY_UNSUPPORTED_MESSAGE,
  MAX_ATTACHMENTS,
  formatInsertedFilesPrompt,
  type FileLike,
  type InsertedTextFile,
} from '../ui/fileInsert';

interface InputBarProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  disabled: boolean;
  isProcessing: boolean;
}

interface ElementProps {
  'aria-label'?: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onChange?: (event: unknown) => unknown;
  onClick?: () => void;
  onDragEnter?: (event: unknown) => void;
  onDragLeave?: (event: unknown) => void;
  onDrop?: (event: unknown) => void;
  role?: string;
  title?: string;
  type?: string;
}

interface Renderer {
  props: InputBarProps;
  tree: ReactElement;
  render(): void;
  update(props: Partial<InputBarProps>): void;
}

const encoder = new TextEncoder();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InputBar file acquisition', () => {
  it('turns a two-file drop into ready chips in FIFO order', async () => {
    const renderer = renderInputBar();

    dropFiles(renderer, [fileFromText('a.txt', 'alpha'), fileFromText('b.txt', 'beta')]);

    await vi.waitFor(() => {
      expect(chipNames(renderer)).toEqual(['a.txt', 'b.txt']);
      expect(readingChipCount(renderer)).toBe(0);
    });
  });

  it('disables Send while reading and enables it for ready attachments with empty text', async () => {
    const slow = deferredFile('slow.txt', 'slow content');
    const renderer = renderInputBar();

    dropFiles(renderer, [slow.file]);

    expect(chipNames(renderer)).toEqual(['slow.txt']);
    expect(readingChipCount(renderer)).toBe(1);
    expect(sendButton(renderer).disabled).toBe(true);

    slow.resolve();

    await vi.waitFor(() => expect(readingChipCount(renderer)).toBe(0));
    expect(sendButton(renderer).disabled).toBe(false);
  });

  it('sends the formatted ready-file payload and clears chips afterward', async () => {
    const onSend = vi.fn();
    const renderer = renderInputBar({ onSend });
    const files = [fileFromText('a.txt', 'alpha'), fileFromText('b.txt', 'beta')];

    dropFiles(renderer, files);
    await vi.waitFor(() => {
      expect(chipNames(renderer)).toEqual(['a.txt', 'b.txt']);
      expect(readingChipCount(renderer)).toBe(0);
    });
    changeText(renderer, '  Summarize both.  ');
    sendButton(renderer).onClick?.();

    expect(onSend).toHaveBeenCalledWith(
      formatInsertedFilesPrompt([insertedFile('a.txt', 'alpha'), insertedFile('b.txt', 'beta')], 'Summarize both.'),
    );
    expect(chipNames(renderer)).toEqual([]);
  });

  it('accepts multiple files from the picker path', async () => {
    const renderer = renderInputBar();

    await pickFiles(renderer, [fileFromText('one.txt', 'one'), fileFromText('two.txt', 'two')]);

    expect(chipNames(renderer)).toEqual(['one.txt', 'two.txt']);
    expect(readingChipCount(renderer)).toBe(0);
  });

  it('keeps the v1 single-file picker path as one chip', async () => {
    const renderer = renderInputBar();

    await pickFiles(renderer, [fileFromText('single.txt', 'single')]);

    expect(chipNames(renderer)).toEqual(['single.txt']);
  });

  it('shows per-file error chips and batch attachment errors', async () => {
    const perFile = renderInputBar();
    await pickFiles(perFile, [fileFromText('paper.pdf', 'plain text')]);

    expect(chipNames(perFile)).toEqual(['paper.pdf']);
    expect(renderedText(perFile)).toContain(BINARY_UNSUPPORTED_MESSAGE);

    const batch = renderInputBar();
    await pickFiles(
      batch,
      Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, index) => fileFromText(`f${index}.txt`, String(index))),
    );

    expect(chipNames(batch)).toHaveLength(MAX_ATTACHMENTS);
    expect(alertText(batch)).toContain(ATTACHMENT_LIMIT_MESSAGE);
  });

  it('rejects a second add attempt while a batch is in flight without clobbering the first batch', async () => {
    const first = deferredFile('first.txt', 'first');
    const second = fileFromText('second.txt', 'second');
    const renderer = renderInputBar();

    dropFiles(renderer, [first.file]);
    expect(chipNames(renderer)).toEqual(['first.txt']);
    expect(readingChipCount(renderer)).toBe(1);

    dropFiles(renderer, [second]);

    expect(chipNames(renderer)).toEqual(['first.txt']);
    first.resolve();

    await vi.waitFor(() => expect(readingChipCount(renderer)).toBe(0));
    expect(chipNames(renderer)).toEqual(['first.txt']);
    expect(sendButton(renderer).disabled).toBe(false);
  });

  it('adds no chips when a file is dropped while file acquisition is disabled', () => {
    const renderer = renderInputBar({ isProcessing: true });

    dropFiles(renderer, [fileFromText('blocked.txt', 'blocked')]);

    expect(chipNames(renderer)).toEqual([]);
  });

  it('uses containment rather than a drag-depth counter for drop highlighting', () => {
    class FakeNode {}
    vi.stubGlobal('Node', FakeNode);
    const renderer = renderInputBar();
    const relatedTarget = new FakeNode();
    const currentTarget = { contains: vi.fn(() => true) };

    dragEnter(renderer);
    expect(rootClassName(renderer)).toContain('border-emerald-500');

    propsOf(renderer.tree).onDragLeave?.({
      ...fileDragEvent([]),
      currentTarget,
      relatedTarget,
    });

    expect(currentTarget.contains).toHaveBeenCalledWith(relatedTarget);
    expect(rootClassName(renderer)).toContain('border-emerald-500');

    propsOf(renderer.tree).onDragLeave?.({
      ...fileDragEvent([]),
      currentTarget: { contains: vi.fn(() => false) },
      relatedTarget: null,
    });

    expect(rootClassName(renderer)).not.toContain('border-emerald-500');
  });
});

function renderInputBar(overrides: Partial<InputBarProps> = {}): Renderer {
  hookRuntime.reset();
  const renderer: Renderer = {
    props: {
      onSend: vi.fn(),
      onCancel: vi.fn(),
      disabled: false,
      isProcessing: false,
      ...overrides,
    },
    tree: undefined as unknown as ReactElement,
    render() {
      hookRuntime.begin(() => renderer.render());
      renderer.tree = InputBar(renderer.props);
    },
    update(props) {
      renderer.props = { ...renderer.props, ...props };
      renderer.render();
    },
  };
  renderer.render();
  return renderer;
}

function fileFromText(name: string, text: string, type = 'text/plain'): FileLike {
  const bytes = encoder.encode(text);
  return {
    name,
    size: bytes.byteLength,
    type,
    async arrayBuffer() {
      return copyBuffer(bytes);
    },
  };
}

function deferredFile(name: string, text: string) {
  const bytes = encoder.encode(text);
  let resolve!: () => void;
  const ready = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    file: {
      name,
      size: bytes.byteLength,
      type: 'text/plain',
      async arrayBuffer() {
        await ready;
        return copyBuffer(bytes);
      },
    } satisfies FileLike,
    resolve,
  };
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function insertedFile(name: string, content: string): InsertedTextFile {
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  return {
    name,
    size: encoder.encode(content).byteLength,
    extension,
    typeLabel: extension || 'text/plain',
    language: '',
    content,
  };
}

function fileDragEvent(files: readonly FileLike[]) {
  return {
    dataTransfer: {
      types: ['Files'],
      files,
      dropEffect: 'copy' as DataTransfer['dropEffect'],
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function dropFiles(renderer: Renderer, files: readonly FileLike[]) {
  propsOf(renderer.tree).onDrop?.(fileDragEvent(files));
}

function dragEnter(renderer: Renderer) {
  propsOf(renderer.tree).onDragEnter?.(fileDragEvent([]));
}

async function pickFiles(renderer: Renderer, files: readonly FileLike[]) {
  const currentTarget = { files, value: 'selected' };
  await fileInput(renderer).onChange?.({ currentTarget });
  expect(currentTarget.value).toBe('');
}

function changeText(renderer: Renderer, value: string) {
  textarea(renderer).onChange?.({ target: { value } });
}

function propsOf(element: ReactElement): ElementProps {
  return element.props as ElementProps;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(propsOf(node).children);
  return '';
}

function renderedText(renderer: Renderer): string {
  return textOf(renderer.tree);
}

function findAllElements(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAllElements(child, predicate));
  if (!isValidElement(node)) return [];

  const matches = predicate(node) ? [node] : [];
  return [...matches, ...findAllElements(propsOf(node).children, predicate)];
}

function firstElement(renderer: Renderer, predicate: (element: ReactElement) => boolean): ElementProps {
  const match = findAllElements(renderer.tree, predicate)[0];
  if (!match) throw new Error('Expected element was not found');
  return propsOf(match);
}

function buttonWithText(renderer: Renderer, text: string): ElementProps {
  return firstElement(renderer, (element) => element.type === 'button' && textOf(element).includes(text));
}

function sendButton(renderer: Renderer): ElementProps {
  return buttonWithText(renderer, 'Send');
}

function fileInput(renderer: Renderer): ElementProps {
  return firstElement(renderer, (element) => element.type === 'input' && propsOf(element).type === 'file');
}

function textarea(renderer: Renderer): ElementProps {
  return firstElement(renderer, (element) => element.type === 'textarea');
}

function chipNames(renderer: Renderer): string[] {
  return findAllElements(
    renderer.tree,
    (element) =>
      element.type === 'button' &&
      typeof propsOf(element)['aria-label'] === 'string' &&
      propsOf(element)['aria-label']!.startsWith('Remove '),
  ).map((element) => propsOf(element)['aria-label']!.replace(/^Remove /, ''));
}

function readingChipCount(renderer: Renderer): number {
  return findAllElements(renderer.tree, (element) => element.type === 'span' && textOf(element) === 'Reading...').length;
}

function alertText(renderer: Renderer): string {
  return textOf(firstElement(renderer, (element) => propsOf(element).role === 'alert').children);
}

function rootClassName(renderer: Renderer): string {
  return propsOf(renderer.tree).className ?? '';
}
