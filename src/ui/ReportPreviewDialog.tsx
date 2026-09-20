import { useEffect, useRef, useState } from 'react';
import type { AIProvider } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { t as translateKey } from '../i18n/t';
import { ModalDialog } from './ModalDialog';
import type { ReportDigest } from './reportBroken';

export function ReportPreviewDialog({
  preview,
  busy,
  onOpenIssue,
  onCancel,
  locale,
}: {
  preview: { provider: AIProvider; digest: ReportDigest; body: string };
  busy: boolean;
  onOpenIssue: () => void | Promise<void>;
  onCancel: () => void;
  locale: Locale;
}) {
  const digest = preview.digest;
  const [status, setStatus] = useState<'opening' | 'error'>();
  const inFlight = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  const cancel = () => {
    generation.current += 1;
    onCancel();
  };
  const openIssue = async () => {
    if (inFlight.current || busy || !digest.firstMissingField) return;
    inFlight.current = true;
    const request = ++generation.current;
    setStatus('opening');
    try {
      await onOpenIssue();
      if (request === generation.current) {
        setStatus(undefined);
        onCancel();
      }
    } catch {
      if (request === generation.current) setStatus('error');
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <ModalDialog
      titleId="report-preview-title"
      onEscape={cancel}
      onBackdrop={cancel}
      panelClassName="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-zinc-300 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
    >
        <div className="mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <h2 id="report-preview-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{translateKey('reportPreview.title', locale)}</h2>
        </div>
        <div className="grid gap-2 text-xs text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
          <div>
            {translateKey('reportPreview.provider', locale)}: {digest.displayName} ({digest.provider})
          </div>
          <div>
            {translateKey('reportPreview.adapterVersion', locale)}: {digest.adapterVersion}
          </div>
          <div>
            {translateKey('reportPreview.appVersion', locale)}: {digest.appVersion}
          </div>
          <div>
            {translateKey('reportPreview.path', locale)}: {digest.path}
          </div>
          <div className="sm:col-span-2">
            {translateKey('reportPreview.firstMissingField', locale)}: {digest.firstMissingField ?? translateKey('reportPreview.none', locale)}
          </div>
        </div>
        {!digest.firstMissingField ? (
          <div className="mt-4 border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            {translateKey('reportPreview.noStructuralFailure', locale)}
          </div>
        ) : null}
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
          {preview.body}
        </pre>
        {status === 'error' ? (
          <div role="alert" className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {translateKey('reportPreview.openFailed', locale)}
          </div>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <button type="button" className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={cancel}>
            {translateKey('reportPreview.cancel', locale)}
          </button>
          <button
            type="button"
            className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 px-3 py-1.5 text-sm text-emerald-700 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void openIssue()}
            disabled={busy || status === 'opening' || !digest.firstMissingField}
          >
            {translateKey(status === 'error' ? 'provider.retry' : 'reportPreview.openGithubIssue', locale)}
          </button>
        </div>
    </ModalDialog>
  );
}
