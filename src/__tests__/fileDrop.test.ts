import { describe, expect, it, vi } from 'vitest';
import { filesFromDataTransfer, isOsFileDrag, makeFileDragGuard, markFileDragCopy } from '../ui/fileDrop';
import type { FileLike } from '../ui/fileInsert';

function fileLike(name: string): FileLike {
  return {
    name,
    size: 1,
    type: 'text/plain',
    async arrayBuffer() {
      const bytes = new TextEncoder().encode(name);
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    },
  };
}

function domStringListLike(values: readonly string[]): DOMStringList {
  const list = {
    length: values.length,
    item(index: number) {
      return values[index] ?? null;
    },
  } as DOMStringList & Record<number, string>;

  values.forEach((value, index) => {
    list[index] = value;
  });

  return list;
}

function guardEvent({
  type = 'dragover',
  types = ['Files'],
  defaultPrevented = false,
  dropEffect = 'copy',
}: {
  type?: string;
  types?: readonly string[] | DOMStringList;
  defaultPrevented?: boolean;
  dropEffect?: DataTransfer['dropEffect'];
} = {}) {
  const event = {
    type,
    defaultPrevented,
    dataTransfer: { types, dropEffect },
    preventDefault: vi.fn(),
  };
  return event;
}

describe('file drop helpers', () => {
  it('detects OS file drags but ignores internal text drags', () => {
    expect(isOsFileDrag({ types: ['Files', 'text/uri-list'] })).toBe(true);
    expect(isOsFileDrag({ types: domStringListLike(['Files', 'text/uri-list']) })).toBe(true);
    expect(isOsFileDrag({ types: ['text/plain'] })).toBe(false);
    expect(isOsFileDrag(undefined)).toBe(false);
  });

  it('extracts files from a DataTransfer-like object', () => {
    const files = [fileLike('a.txt'), fileLike('b.txt')];

    expect(filesFromDataTransfer<FileLike>({ files })).toEqual(files);
    expect(filesFromDataTransfer<FileLike>({ files: null })).toEqual([]);
  });

  it('marks file drags as copy when the drop zone can accept them', () => {
    const event = {
      dataTransfer: { types: ['Files'], dropEffect: 'none' as const },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    markFileDragCopy(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('marks file drags as blocked when the drop zone cannot accept them', () => {
    const event = {
      dataTransfer: { types: ['Files'], dropEffect: 'copy' as DataTransfer['dropEffect'] },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    markFileDragCopy(event, false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.dataTransfer.dropEffect).toBe('none');
  });

  it('leaves non-file drags alone in the window guard', () => {
    const guard = makeFileDragGuard();
    const event = guardEvent({ types: ['text/plain'] });

    guard(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('does not clobber file drags already handled by the InputBar', () => {
    const guard = makeFileDragGuard();
    const event = guardEvent({ defaultPrevented: true, dropEffect: 'copy' });

    guard(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('blocks unhandled file dragover and drop defaults at window level', () => {
    const guard = makeFileDragGuard();
    const dragover = guardEvent({ type: 'dragover', dropEffect: 'copy' });
    const drop = guardEvent({ type: 'drop', dropEffect: 'copy' });

    guard(dragover);
    guard(drop);

    expect(dragover.preventDefault).toHaveBeenCalledOnce();
    expect(dragover.dataTransfer.dropEffect).toBe('none');
    expect(drop.preventDefault).toHaveBeenCalledOnce();
    expect(drop.dataTransfer.dropEffect).toBe('copy');
  });
});
