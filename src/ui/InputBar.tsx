import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  attachmentChipName,
  attachmentChipSize,
  beginAttachmentBatch,
  hasReadingAttachment,
  readAttachmentJobs,
  readyAttachmentFiles,
  removeAttachment,
  removeReadingAttachmentIds,
  settleAttachmentReadResults,
  type AttachmentChip,
} from './fileAttachments';
import { filesFromDataTransfer, isOsFileDrag, markFileDragCopy, preventFileDragDefaults } from './fileDrop';
import { formatInsertedFilesPrompt, TEXT_FILE_EXTENSIONS, type FileLike } from './fileInsert';

export function InputBar({
  onSend,
  onCancel,
  disabled,
  isProcessing,
}: {
  onSend: (text: string) => void;
  onCancel: () => void;
  disabled: boolean;
  isProcessing: boolean;
}) {
  const [text, setText] = useState('');
  const [attachmentChips, setAttachmentChips] = useState<AttachmentChip[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const [dropActive, setDropActive] = useState(false);
  const attachmentChipsRef = useRef<AttachmentChip[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchGeneration = useRef(0);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [text]);

  const commitAttachmentChips = (chips: AttachmentChip[]) => {
    attachmentChipsRef.current = chips;
    setAttachmentChips(chips);
  };

  const canAddFilesFromRef = () => !disabled && !isProcessing && !hasReadingAttachment(attachmentChipsRef.current);

  const addAttachmentFiles = async (files: readonly FileLike[]) => {
    if (files.length === 0) return;
    if (!canAddFilesFromRef()) return;

    // Guard against a stale earlier batch settling after the composer was cleared or a newer
    // batch was accepted, which would otherwise reattach stale content.
    const generation = (batchGeneration.current += 1);
    setAttachmentError(undefined);

    const begun = beginAttachmentBatch(attachmentChipsRef.current, files);
    commitAttachmentChips(begun.chips);
    if (begun.error) setAttachmentError(begun.error.message);
    if (begun.jobs.length === 0) return;

    const results = await readAttachmentJobs(begun.jobs);
    if (generation !== batchGeneration.current) {
      commitAttachmentChips(removeReadingAttachmentIds(attachmentChipsRef.current, begun.jobs.map((job) => job.id)));
      return;
    }

    const settled = settleAttachmentReadResults(attachmentChipsRef.current, results);
    commitAttachmentChips(settled.chips);
    if (settled.error) setAttachmentError(settled.error.message);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    await addAttachmentFiles(files);
  };

  const clearAttachments = () => {
    batchGeneration.current += 1;
    commitAttachmentChips([]);
    setAttachmentError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachmentChip = (id: string) => {
    commitAttachmentChips(removeAttachment(attachmentChipsRef.current, id));
    setAttachmentError(undefined);
  };

  const isReadingFile = hasReadingAttachment(attachmentChips);
  const readyFiles = readyAttachmentFiles(attachmentChips);
  const hasReadyAttachments = readyFiles.length > 0;
  const canAddFiles = !disabled && !isProcessing && !isReadingFile;

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && !hasReadyAttachments) || disabled || isProcessing || isReadingFile) return;
    onSend(hasReadyAttachments ? formatInsertedFilesPrompt(readyFiles, trimmed) : trimmed);
    setText('');
    clearAttachments();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!isOsFileDrag(event.dataTransfer)) return;
    const canAcceptFiles = canAddFilesFromRef();
    markFileDragCopy(event, canAcceptFiles);
    setDropActive(canAcceptFiles);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isOsFileDrag(event.dataTransfer)) return;
    const canAcceptFiles = canAddFilesFromRef();
    markFileDragCopy(event, canAcceptFiles);
    if (!canAcceptFiles) setDropActive(false);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isOsFileDrag(event.dataTransfer)) return;
    preventFileDragDefaults(event);
    if (dragLeaveStayedInside(event.currentTarget, event.relatedTarget)) return;
    setDropActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isOsFileDrag(event.dataTransfer)) return;
    const canAcceptFiles = canAddFilesFromRef();
    markFileDragCopy(event, canAcceptFiles);
    setDropActive(false);
    if (!canAcceptFiles) return;
    void addAttachmentFiles(filesFromDataTransfer(event.dataTransfer));
  };

  const placeholder = isProcessing ? 'Workflow running' : disabled ? 'Connect a provider to start' : 'Send to selected providers';
  const sendDisabled = disabled || isProcessing || isReadingFile || (!text.trim() && !hasReadyAttachments);
  const insertDisabled = disabled || isProcessing || isReadingFile;
  const showDropActive = dropActive && canAddFiles;

  return (
    <div
      className={`mt-3 space-y-2 rounded border p-2 transition-colors ${
        showDropActive ? 'border-emerald-500 bg-emerald-950/20' : 'border-transparent'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          className="min-h-12 flex-1 resize-none border border-zinc-700 bg-zinc-900 p-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
        />
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept={TEXT_FILE_EXTENSIONS.join(',')}
          multiple
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="border border-zinc-700 px-3 text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={insertDisabled}
        >
          {isReadingFile ? 'Reading...' : 'Insert file'}
        </button>
        {isProcessing ? (
          <button className="border border-red-700 bg-red-950 px-3 text-sm text-red-100 hover:bg-red-900" onClick={onCancel}>
            Stop
          </button>
        ) : null}
        <button
          className="border border-emerald-700 bg-emerald-900 px-4 text-sm hover:bg-emerald-800 disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600"
          onClick={submit}
          disabled={sendDisabled}
        >
          Send
        </button>
      </div>
      {attachmentChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachmentChips.map((chip) => (
            <div
              key={chip.id}
              className={`flex max-w-full items-center gap-2 border px-2 py-1 text-xs ${
                chip.phase === 'error'
                  ? 'border-red-800 bg-red-950 text-red-200'
                  : chip.phase === 'reading'
                    ? 'border-zinc-800 bg-zinc-950 text-zinc-500'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300'
              }`}
            >
              <span className="max-w-48 truncate" title={attachmentChipName(chip)}>
                {attachmentChipName(chip)}
              </span>
              <span className="shrink-0 text-zinc-500">{attachmentChipSize(chip)} bytes</span>
              {chip.phase === 'reading' ? <span className="shrink-0 text-zinc-500">Reading...</span> : null}
              {chip.phase === 'error' ? (
                <span className="max-w-64 truncate text-red-300" title={chip.message}>
                  {chip.message}
                </span>
              ) : null}
              <button
                type="button"
                className="shrink-0 text-base leading-none text-zinc-400 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => removeAttachmentChip(chip.id)}
                disabled={isProcessing}
                aria-label={`Remove ${attachmentChipName(chip)}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {attachmentError ? (
        <div className="border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200" role="alert">
          {attachmentError}
        </div>
      ) : null}
    </div>
  );
}

function dragLeaveStayedInside(currentTarget: HTMLDivElement, relatedTarget: EventTarget | null): boolean {
  if (!relatedTarget || typeof Node === 'undefined' || !(relatedTarget instanceof Node)) return false;
  return currentTarget.contains(relatedTarget);
}
