import { describe, expect, it } from 'vitest';
import {
  appendFilesToAttachments,
  hasReadingAttachment,
  readyAttachmentFiles,
  removeAttachment,
  removeReadingAttachmentIds,
  type AttachmentChip,
} from '../ui/fileAttachments';
import {
  ATTACHMENT_LIMIT_MESSAGE,
  BINARY_UNSUPPORTED_MESSAGE,
  FILE_TOO_LARGE_MESSAGE,
  MAX_ATTACHMENTS,
  MAX_TEXT_FILE_BYTES,
  type FileLike,
} from '../ui/fileInsert';

const encoder = new TextEncoder();

function fileFromBytes(name: string, bytes: Uint8Array, type = 'text/plain'): FileLike {
  return {
    name,
    size: bytes.byteLength,
    type,
    async arrayBuffer() {
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    },
  };
}

function fileFromText(name: string, text: string, type = 'text/plain'): FileLike {
  return fileFromBytes(name, encoder.encode(text), type);
}

function idFactory(prefix = 'chip'): () => string {
  let next = 0;
  return () => `${prefix}-${(next += 1)}`;
}

function phases(chips: readonly AttachmentChip[]): string[] {
  return chips.map((chip) => chip.phase);
}

describe('attachment chips', () => {
  it('adds ready chips and removes a chip by id', async () => {
    const result = await appendFilesToAttachments([], [fileFromText('notes.txt', 'alpha')], idFactory());

    expect(phases(result.chips)).toEqual(['ready']);
    expect(readyAttachmentFiles(result.chips).map((file) => file.name)).toEqual(['notes.txt']);
    expect(removeAttachment(result.chips, result.chips[0].id)).toEqual([]);
  });

  it('keeps partial batch errors as chips without blocking valid files', async () => {
    const result = await appendFilesToAttachments(
      [],
      [fileFromText('paper.pdf', 'plain bytes'), fileFromText('ok.txt', 'valid')],
      idFactory(),
    );

    expect(phases(result.chips)).toEqual(['error', 'ready']);
    expect(result.chips[0]).toMatchObject({
      phase: 'error',
      code: 'unsupported',
      message: BINARY_UNSUPPORTED_MESSAGE,
    });
    expect(readyAttachmentFiles(result.chips).map((file) => file.name)).toEqual(['ok.txt']);
  });

  it('allows duplicate filenames, preserves FIFO order, and gives each chip a distinct id', async () => {
    const result = await appendFilesToAttachments(
      [],
      [fileFromText('same.txt', 'one'), fileFromText('same.txt', 'two'), fileFromText('same.txt', 'three')],
      idFactory('dup'),
    );

    expect(result.chips.map((chip) => chip.id)).toEqual(['dup-1', 'dup-2', 'dup-3']);
    expect(new Set(result.chips.map((chip) => chip.id)).size).toBe(3);
    expect(readyAttachmentFiles(result.chips).map((file) => file.content)).toEqual(['one', 'two', 'three']);
  });

  it('rejects the ninth attachment without removing the first eight', async () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, index) => fileFromText(`f${index}.txt`, String(index)));
    const result = await appendFilesToAttachments([], files, idFactory('max'));

    expect(result.chips).toHaveLength(MAX_ATTACHMENTS);
    expect(phases(result.chips)).toEqual(Array.from({ length: MAX_ATTACHMENTS }, () => 'ready'));
    expect(result.error).toMatchObject({ code: 'too-large', message: ATTACHMENT_LIMIT_MESSAGE });

    const rejected = await appendFilesToAttachments(result.chips, [fileFromText('extra.txt', 'x')], idFactory('extra'));
    expect(rejected.chips).toEqual(result.chips);
    expect(rejected.error).toMatchObject({ code: 'too-large', message: ATTACHMENT_LIMIT_MESSAGE });
  });

  it('counts error chips toward the attachment limit until removed', async () => {
    const errorFiles = Array.from({ length: MAX_ATTACHMENTS }, (_, index) => fileFromText(`bad-${index}.pdf`, 'pdf'));
    const errors = await appendFilesToAttachments([], errorFiles, idFactory('err'));

    expect(errors.chips).toHaveLength(MAX_ATTACHMENTS);
    expect(phases(errors.chips)).toEqual(Array.from({ length: MAX_ATTACHMENTS }, () => 'error'));

    const rejected = await appendFilesToAttachments(errors.chips, [fileFromText('extra.txt', 'x')], idFactory('blocked'));
    expect(rejected.chips).toEqual(errors.chips);
    expect(rejected.error).toMatchObject({ code: 'too-large', message: ATTACHMENT_LIMIT_MESSAGE });

    const afterRemoval = await appendFilesToAttachments(
      removeAttachment(errors.chips, errors.chips[0].id),
      [fileFromText('extra.txt', 'x')],
      idFactory('allowed'),
    );
    expect(afterRemoval.chips).toHaveLength(MAX_ATTACHMENTS);
    expect(phases(afterRemoval.chips)).toEqual([
      ...Array.from({ length: MAX_ATTACHMENTS - 1 }, () => 'error'),
      'ready',
    ]);
  });

  it('removes a superseded batch reading chips instead of leaving orphans', () => {
    const chips: AttachmentChip[] = [
      { id: 'stale-1', phase: 'reading', name: 'a.txt', size: 1 },
      { id: 'ready-1', phase: 'ready', file: readyFile('kept.txt', 'kept') },
      { id: 'stale-2', phase: 'reading', name: 'b.txt', size: 1 },
    ];

    const cleaned = removeReadingAttachmentIds(chips, ['stale-1', 'stale-2']);

    expect(cleaned.map((chip) => chip.id)).toEqual(['ready-1']);
    expect(hasReadingAttachment(cleaned)).toBe(false);
  });

  it('rejects a file that would exceed the aggregate UTF-8 byte cap', async () => {
    const byteHeavyText = '€'.repeat(44_000);
    const result = await appendFilesToAttachments(
      [],
      [fileFromText('wide-a.txt', byteHeavyText), fileFromText('wide-b.txt', byteHeavyText)],
      idFactory('bytes'),
    );

    expect(phases(result.chips)).toEqual(['ready', 'error']);
    expect(result.chips[1]).toMatchObject({
      phase: 'error',
      code: 'too-large',
      message: ATTACHMENT_LIMIT_MESSAGE,
    });
    expect(result.error).toMatchObject({ code: 'too-large', message: ATTACHMENT_LIMIT_MESSAGE });
  });

  it('rejects a file that would exceed the aggregate character cap', async () => {
    const longText = 'a'.repeat(70_000);
    const result = await appendFilesToAttachments(
      [],
      [fileFromText('long-a.txt', longText), fileFromText('long-b.txt', longText)],
      idFactory('chars'),
    );

    expect(phases(result.chips)).toEqual(['ready', 'error']);
    expect(result.chips[1]).toMatchObject({
      phase: 'error',
      code: 'too-large',
      message: ATTACHMENT_LIMIT_MESSAGE,
    });
  });

  it('keeps the per-file size cap enforced before buffering', async () => {
    let buffered = false;
    const huge: FileLike = {
      name: 'huge.txt',
      size: MAX_TEXT_FILE_BYTES + 1,
      type: 'text/plain',
      async arrayBuffer() {
        buffered = true;
        return new ArrayBuffer(0);
      },
    };

    const result = await appendFilesToAttachments([], [huge], idFactory('huge'));

    expect(buffered).toBe(false);
    expect(result.chips[0]).toMatchObject({
      phase: 'error',
      code: 'too-large',
      message: FILE_TOO_LARGE_MESSAGE,
    });
  });
});

function readyFile(name: string, content: string) {
  const extension = name.slice(name.lastIndexOf('.'));
  return {
    name,
    size: encoder.encode(content).byteLength,
    extension,
    typeLabel: extension,
    language: '',
    content,
  };
}
