import {
  ATTACHMENT_LIMIT_MESSAGE,
  FileInsertError,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  MAX_ATTACHMENT_TOTAL_CHARS,
  readTextFileForInsert,
  type FileLike,
  type InsertedTextFile,
} from './fileInsert';

export type AttachmentChip =
  | { id: string; phase: 'reading'; name: string; size: number }
  | { id: string; phase: 'ready'; file: InsertedTextFile }
  | { id: string; phase: 'error'; name: string; size: number; code: FileInsertError['code']; message: string };

export interface AttachmentReadJob {
  id: string;
  file: FileLike;
}

export type AttachmentReadResult =
  | { id: string; phase: 'ready'; file: InsertedTextFile }
  | { id: string; phase: 'error'; name: string; size: number; code: FileInsertError['code']; message: string };

export interface AttachmentBatchResult {
  chips: AttachmentChip[];
  error?: FileInsertError;
}

export interface BeginAttachmentBatchResult extends AttachmentBatchResult {
  jobs: AttachmentReadJob[];
}

let nextAttachmentId = 0;
const utf8Encoder = new TextEncoder();

export function makeAttachmentId(): string {
  nextAttachmentId += 1;
  return `attachment-${Date.now().toString(36)}-${nextAttachmentId.toString(36)}`;
}

export function attachmentChipName(chip: AttachmentChip): string {
  return chip.phase === 'ready' ? chip.file.name : chip.name;
}

export function attachmentChipSize(chip: AttachmentChip): number {
  return chip.phase === 'ready' ? chip.file.size : chip.size;
}

export function readyAttachmentFiles(chips: readonly AttachmentChip[]): InsertedTextFile[] {
  return chips.flatMap((chip) => (chip.phase === 'ready' ? [chip.file] : []));
}

export function hasReadingAttachment(chips: readonly AttachmentChip[]): boolean {
  return chips.some((chip) => chip.phase === 'reading');
}

export function removeAttachment(chips: readonly AttachmentChip[], id: string): AttachmentChip[] {
  return chips.filter((chip) => chip.id !== id);
}

export function removeReadingAttachmentIds(chips: readonly AttachmentChip[], ids: readonly string[]): AttachmentChip[] {
  if (ids.length === 0) return [...chips];
  const staleIds = new Set(ids);
  return chips.filter((chip) => chip.phase !== 'reading' || !staleIds.has(chip.id));
}

export function countAttachmentSlots(chips: readonly AttachmentChip[]): number {
  return chips.length;
}

export function insertedFileContentBytes(file: InsertedTextFile): number {
  return utf8Encoder.encode(file.content).byteLength;
}

export function beginAttachmentBatch(
  currentChips: readonly AttachmentChip[],
  files: readonly FileLike[],
  createId: () => string = makeAttachmentId,
): BeginAttachmentBatchResult {
  if (files.length === 0) return { chips: [...currentChips], jobs: [] };

  const availableSlots = Math.max(0, MAX_ATTACHMENTS - countAttachmentSlots(currentChips));
  const acceptedFiles = files.slice(0, availableSlots);
  const additions = acceptedFiles.map((file) => ({
    id: createId(),
    phase: 'reading' as const,
    name: file.name,
    size: file.size,
  }));
  const jobs = additions.map((chip, index) => ({ id: chip.id, file: acceptedFiles[index] }));
  const chips = additions.length > 0 ? [...currentChips, ...additions] : [...currentChips];
  const error =
    acceptedFiles.length < files.length ? new FileInsertError(ATTACHMENT_LIMIT_MESSAGE, 'too-large') : undefined;

  return { chips, jobs, error };
}

export async function readAttachmentJobs(jobs: readonly AttachmentReadJob[]): Promise<AttachmentReadResult[]> {
  return Promise.all(
    jobs.map(async (job) => {
      try {
        return { id: job.id, phase: 'ready', file: await readTextFileForInsert(job.file) } satisfies AttachmentReadResult;
      } catch (error) {
        return toAttachmentErrorResult(job.id, job.file, error);
      }
    }),
  );
}

export function settleAttachmentReadResults(
  currentChips: readonly AttachmentChip[],
  results: readonly AttachmentReadResult[],
): AttachmentBatchResult {
  const resultsById = new Map(results.map((result) => [result.id, result]));
  let aggregateBytes = 0;
  let aggregateChars = 0;
  let aggregateError: FileInsertError | undefined;

  const chips = currentChips.map((chip): AttachmentChip => {
    if (chip.phase === 'ready') {
      aggregateBytes += insertedFileContentBytes(chip.file);
      aggregateChars += chip.file.content.length;
      return chip;
    }
    if (chip.phase !== 'reading') return chip;

    const result = resultsById.get(chip.id);
    if (!result) return chip;
    if (result.phase === 'error') return result;

    const contentBytes = insertedFileContentBytes(result.file);
    const contentChars = result.file.content.length;
    if (
      aggregateBytes + contentBytes > MAX_ATTACHMENT_TOTAL_BYTES ||
      aggregateChars + contentChars > MAX_ATTACHMENT_TOTAL_CHARS
    ) {
      aggregateError ??= new FileInsertError(ATTACHMENT_LIMIT_MESSAGE, 'too-large');
      return {
        id: chip.id,
        phase: 'error',
        name: result.file.name,
        size: result.file.size,
        code: 'too-large',
        message: ATTACHMENT_LIMIT_MESSAGE,
      };
    }

    aggregateBytes += contentBytes;
    aggregateChars += contentChars;
    return result;
  });

  return { chips, error: aggregateError };
}

export async function appendFilesToAttachments(
  currentChips: readonly AttachmentChip[],
  files: readonly FileLike[],
  createId: () => string = makeAttachmentId,
): Promise<AttachmentBatchResult> {
  const begun = beginAttachmentBatch(currentChips, files, createId);
  if (begun.jobs.length === 0) return { chips: begun.chips, error: begun.error };

  const results = await readAttachmentJobs(begun.jobs);
  const settled = settleAttachmentReadResults(begun.chips, results);
  return { chips: settled.chips, error: settled.error ?? begun.error };
}

function toAttachmentErrorResult(id: string, file: FileLike, error: unknown): AttachmentReadResult {
  if (error instanceof FileInsertError) {
    return {
      id,
      phase: 'error',
      name: file.name,
      size: file.size,
      code: error.code,
      message: error.message,
    };
  }

  return {
    id,
    phase: 'error',
    name: file.name,
    size: file.size,
    code: 'unsupported',
    message: error instanceof Error ? error.message : String(error),
  };
}
