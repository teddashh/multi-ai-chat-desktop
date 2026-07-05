import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { formatInsertedFilePrompt, readTextFileForInsert, TEXT_FILE_EXTENSIONS, type InsertedTextFile } from './fileInsert';

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
  const [selectedFile, setSelectedFile] = useState<InsertedTextFile | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();
  const [isReadingFile, setIsReadingFile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickGeneration = useRef(0);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [text]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    // Guard against a stale earlier read settling after a newer pick and clobbering it
    // (which could otherwise show the wrong file and broadcast the wrong content).
    const generation = (pickGeneration.current += 1);
    setSelectedFile(undefined);
    setFileError(undefined);
    if (!file) return;

    setIsReadingFile(true);
    try {
      const result = await readTextFileForInsert(file);
      if (generation === pickGeneration.current) setSelectedFile(result);
    } catch (error) {
      if (generation === pickGeneration.current) {
        setFileError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (generation === pickGeneration.current) setIsReadingFile(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(undefined);
    setFileError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && !selectedFile) || disabled || isProcessing || isReadingFile) return;
    onSend(selectedFile ? formatInsertedFilePrompt(selectedFile, trimmed) : trimmed);
    setText('');
    clearSelectedFile();
  };

  const placeholder = isProcessing ? 'Workflow running' : disabled ? 'Connect a provider to start' : 'Send to selected providers';
  const sendDisabled = disabled || isProcessing || isReadingFile || (!text.trim() && !selectedFile);
  const insertDisabled = disabled || isProcessing || isReadingFile;

  return (
    <div className="mt-3 space-y-2">
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
        <input ref={fileInputRef} className="hidden" type="file" accept={TEXT_FILE_EXTENSIONS.join(',')} onChange={handleFileChange} />
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
      {selectedFile ? (
        <div className="flex items-center justify-between gap-2 border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <span className="min-w-0 truncate">
            {selectedFile.name} · {selectedFile.size} bytes
          </span>
          <button type="button" className="text-zinc-400 hover:text-zinc-100" onClick={clearSelectedFile} disabled={isProcessing}>
            Remove
          </button>
        </div>
      ) : null}
      {fileError ? (
        <div className="border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200" role="alert">
          {fileError}
        </div>
      ) : null}
    </div>
  );
}
