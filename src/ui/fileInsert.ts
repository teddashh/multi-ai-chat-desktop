export const BINARY_UNSUPPORTED_MESSAGE =
  "Binary/rich files (PDF, images, DOCX…) aren't supported yet — this milestone inserts text file content only.";
export const FILE_TOO_LARGE_MESSAGE =
  'Text files are limited to 262,144 UTF-8 bytes or 120,000 characters for this milestone. Choose a smaller file.';
export const ATTACHMENT_LIMIT_MESSAGE =
  'Text attachments are limited to 8 files and 262,144 UTF-8 bytes or 120,000 characters total for this milestone. Remove a file or choose smaller files.';

export const MAX_TEXT_FILE_BYTES = 256 * 1024;
export const MAX_TEXT_FILE_CHARS = 120_000;
export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_TOTAL_BYTES = MAX_TEXT_FILE_BYTES;
export const MAX_ATTACHMENT_TOTAL_CHARS = MAX_TEXT_FILE_CHARS;

export interface FileLike {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface InsertedTextFile {
  name: string;
  size: number;
  extension: string;
  typeLabel: string;
  language: string;
  content: string;
}

export class FileInsertError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'too-large',
  ) {
    super(message);
    this.name = 'FileInsertError';
  }
}

export const TEXT_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.rst',
  '.log',
  '.diff',
  '.patch',
  '.csv',
  '.tsv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.rb',
  '.sql',
  '.sh',
  '.ps1',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.env',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.scss',
] as const;

const TEXT_EXTENSION_SET = new Set<string>(TEXT_FILE_EXTENSIONS);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.c': 'c',
  '.cjs': 'javascript',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.csv': 'csv',
  '.diff': 'diff',
  '.env': 'dotenv',
  '.go': 'go',
  '.h': 'c',
  '.hpp': 'cpp',
  '.htm': 'html',
  '.html': 'html',
  '.ini': 'ini',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsonl': 'jsonl',
  '.jsx': 'jsx',
  '.kt': 'kotlin',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.patch': 'diff',
  '.php': 'php',
  '.ps1': 'powershell',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.scss': 'scss',
  '.sh': 'bash',
  '.sql': 'sql',
  '.swift': 'swift',
  '.toml': 'toml',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.tsv': 'tsv',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export function extensionFromFilename(name: string): string {
  const lowerName = name.toLowerCase();
  const dotIndex = lowerName.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return lowerName.slice(dotIndex);
}

export function languageFromExtension(extension: string): string {
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? '';
}

export function isAllowedTextExtension(extension: string): boolean {
  return TEXT_EXTENSION_SET.has(extension.toLowerCase());
}

export async function readTextFileForInsert(file: FileLike): Promise<InsertedTextFile> {
  const extension = extensionFromFilename(file.name);
  if (!isAllowedTextExtension(extension)) {
    throw new FileInsertError(BINARY_UNSUPPORTED_MESSAGE, 'unsupported');
  }

  // Reject oversized files by their on-disk size BEFORE buffering the whole thing into the
  // renderer — avoids loading a multi-hundred-MB pick into memory just to reject it.
  if (file.size > MAX_TEXT_FILE_BYTES) {
    throw new FileInsertError(FILE_TOO_LARGE_MESSAGE, 'too-large');
  }

  const bytes = await file.arrayBuffer();
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new FileInsertError(BINARY_UNSUPPORTED_MESSAGE, 'unsupported');
  }

  if (content.startsWith('\uFEFF')) content = content.slice(1);
  if (content.includes('\0')) {
    throw new FileInsertError(BINARY_UNSUPPORTED_MESSAGE, 'unsupported');
  }

  const utf8Length = new TextEncoder().encode(content).byteLength;
  if (utf8Length > MAX_TEXT_FILE_BYTES || content.length > MAX_TEXT_FILE_CHARS) {
    throw new FileInsertError(FILE_TOO_LARGE_MESSAGE, 'too-large');
  }

  return {
    name: file.name,
    size: file.size,
    extension,
    typeLabel: extension || file.type || 'text',
    language: languageFromExtension(extension),
    content,
  };
}

// Pick a code fence longer than any backtick run inside the content, so a file that itself
// contains ``` fences (e.g. a Markdown file with code blocks) can't prematurely close the block.
export function fenceForContent(content: string): string {
  const runs = content.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((run) => run.length)) : 0;
  return '`'.repeat(Math.max(3, longest + 1));
}

function formatInsertedFileBlock(file: InsertedTextFile): string {
  const language = file.language ? file.language : '';
  const content = file.content.endsWith('\n') ? file.content : `${file.content}\n`;
  const fence = fenceForContent(file.content);
  return [
    'Please use the attached file content below.',
    '',
    `Filename: ${file.name.replace(/[\r\n]+/g, ' ')}`,
    `Type: ${file.typeLabel}`,
    `Size: ${file.size} bytes`,
    '',
    `${fence}${language}`,
    `${content}${fence}`,
  ].join('\n');
}

export function formatInsertedFilePrompt(file: InsertedTextFile, composerText = ''): string {
  const formatted = formatInsertedFileBlock(file);
  const prompt = composerText.trim();

  return prompt ? `${formatted}\n\n${prompt}` : formatted;
}

export function formatInsertedFilesPrompt(files: readonly InsertedTextFile[], composerText = ''): string {
  const formatted = files.map((file) => formatInsertedFileBlock(file)).join('\n\n');
  const prompt = composerText.trim();
  if (!formatted) return prompt;
  return prompt ? `${formatted}\n\n${prompt}` : formatted;
}
