import { describe, expect, it } from 'vitest';
import {
  BINARY_UNSUPPORTED_MESSAGE,
  FILE_TOO_LARGE_MESSAGE,
  MAX_TEXT_FILE_BYTES,
  MAX_TEXT_FILE_CHARS,
  fenceForContent,
  formatInsertedFilePrompt,
  languageFromExtension,
  readTextFileForInsert,
  type FileLike,
  type InsertedTextFile,
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

describe('file insert helpers', () => {
  it('formats file metadata, language fence, content, and current composer text deterministically', () => {
    const file: InsertedTextFile = {
      name: 'worker.ts',
      size: 21,
      extension: '.ts',
      typeLabel: '.ts',
      language: 'ts',
      content: 'export const ok = true;',
    };

    expect(formatInsertedFilePrompt(file, 'Explain the edge cases.')).toBe(
      [
        'Please use the attached file content below.',
        '',
        'Filename: worker.ts',
        'Type: .ts',
        'Size: 21 bytes',
        '',
        '```ts',
        'export const ok = true;',
        '```',
        '',
        'Explain the edge cases.',
      ].join('\n'),
    );
  });

  it('uses a fence longer than any backtick run so a Markdown file with its own ``` blocks survives', () => {
    expect(fenceForContent('no backticks here')).toBe('```');
    expect(fenceForContent('a ``` b')).toBe('````');
    expect(fenceForContent('a ```` b ``` c')).toBe('`````');

    const file: InsertedTextFile = {
      name: 'readme.md',
      size: 34,
      extension: '.md',
      typeLabel: '.md',
      language: 'markdown',
      content: 'Intro\n```js\nconst a = 1;\n```\nOutro',
    };
    const out = formatInsertedFilePrompt(file);
    // wrapping fence must be 4 backticks (content has a run of 3)
    expect(out).toContain('````markdown\n');
    expect(out.endsWith('````')).toBe(true);
    // the inner ```js block must survive intact
    expect(out).toContain('```js\nconst a = 1;\n```');
  });

  it('maps required extensions to Markdown fence languages', () => {
    expect(languageFromExtension('.ts')).toBe('ts');
    expect(languageFromExtension('.py')).toBe('python');
    expect(languageFromExtension('.rs')).toBe('rust');
    expect(languageFromExtension('.md')).toBe('markdown');
    expect(languageFromExtension('.unknown')).toBe('');
  });

  it('strips a leading UTF-8 BOM before formatting', async () => {
    const content = encoder.encode('# Notes');
    const bytes = new Uint8Array(3 + content.byteLength);
    bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(content, 3);

    const file = await readTextFileForInsert(fileFromBytes('notes.md', bytes, 'text/markdown'));

    expect(file.content).toBe('# Notes');
    expect(formatInsertedFilePrompt(file)).toContain('```markdown\n# Notes\n```');
  });

  it('rejects binary-looking content from NUL bytes and invalid UTF-8 decode failures', async () => {
    await expect(readTextFileForInsert(fileFromText('nul.txt', 'before\0after'))).rejects.toMatchObject({
      message: BINARY_UNSUPPORTED_MESSAGE,
      code: 'unsupported',
    });

    await expect(readTextFileForInsert(fileFromBytes('bad.txt', new Uint8Array([0xff])))).rejects.toMatchObject({
      message: BINARY_UNSUPPORTED_MESSAGE,
      code: 'unsupported',
    });
  });

  it('rejects extensions outside the text-like allowlist', async () => {
    await expect(readTextFileForInsert(fileFromText('paper.pdf', 'plain text bytes'))).rejects.toMatchObject({
      message: BINARY_UNSUPPORTED_MESSAGE,
      code: 'unsupported',
    });
  });

  it('rejects files over the character cap or UTF-8 byte cap', async () => {
    await expect(readTextFileForInsert(fileFromText('long.txt', 'a'.repeat(MAX_TEXT_FILE_CHARS + 1)))).rejects.toMatchObject({
      message: FILE_TOO_LARGE_MESSAGE,
      code: 'too-large',
    });

    const byteHeavyText = '€'.repeat(Math.floor(MAX_TEXT_FILE_BYTES / 3) + 1);
    expect(byteHeavyText.length).toBeLessThan(MAX_TEXT_FILE_CHARS);
    await expect(readTextFileForInsert(fileFromText('wide.txt', byteHeavyText))).rejects.toMatchObject({
      message: FILE_TOO_LARGE_MESSAGE,
      code: 'too-large',
    });
  });

  it('rejects oversized files by on-disk size before buffering the whole file', async () => {
    let buffered = false;
    const huge: FileLike = {
      name: 'huge.log',
      size: MAX_TEXT_FILE_BYTES + 1,
      type: 'text/plain',
      async arrayBuffer() {
        buffered = true;
        return new ArrayBuffer(0);
      },
    };

    await expect(readTextFileForInsert(huge)).rejects.toMatchObject({
      message: FILE_TOO_LARGE_MESSAGE,
      code: 'too-large',
    });
    expect(buffered).toBe(false);
  });

  it('sanitizes newlines in the filename so they cannot inject extra metadata lines', () => {
    const file: InsertedTextFile = {
      name: 'evil\nInjected: yes.txt',
      size: 3,
      extension: '.txt',
      typeLabel: '.txt',
      language: '',
      content: 'abc',
    };

    const out = formatInsertedFilePrompt(file);
    expect(out).toContain('Filename: evil Injected: yes.txt');
    expect(out).not.toContain('\nInjected: yes');
  });
});
