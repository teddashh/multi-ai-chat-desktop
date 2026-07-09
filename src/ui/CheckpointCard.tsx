import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';
import type { PendingCheckpoint } from '../workflow/checkpoint';
import { resolveCheckpoint } from '../workflow/checkpoint';

export function CheckpointCard({
  checkpoint,
  draft,
  onDraftChange,
  onNativeEdit,
  locale = 'en',
}: {
  checkpoint: PendingCheckpoint | undefined;
  draft: string;
  onDraftChange: (draft: string) => void;
  onNativeEdit?: (provider: AIProvider) => void;
  locale?: Locale;
}) {
  if (!checkpoint) return null;

  const providerName = AI_PROVIDERS[checkpoint.provider].name;
  const source =
    checkpoint.sourceNodeId && checkpoint.sourceNodeId !== checkpoint.nodeId
      ? `${t('checkpoint.source', locale)} ${checkpoint.sourceNodeId}`
      : t('checkpoint.sourceInput', locale);

  return (
    <section className="mt-3 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-zinc-900 dark:text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{t('checkpoint.confirmEachStep', locale)}</div>
          <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            {t('checkpoint.step', locale)} {checkpoint.nodeId} · {providerName} · {source}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-zinc-400 dark:border-zinc-600 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => resolveCheckpoint(checkpoint.nodeId, { action: 'skip' })}
          >
            {t('checkpoint.skip', locale)}
          </button>
          <button
            type="button"
            className="border border-sky-300 dark:border-sky-700 px-3 py-1.5 text-xs text-sky-700 dark:text-sky-100 hover:bg-sky-100 dark:hover:bg-sky-950"
            onClick={() => {
              try {
                onNativeEdit?.(checkpoint.provider);
              } catch {
                // Presentation is best-effort; checkpoint resolution owns workflow progress.
              }
              resolveCheckpoint(checkpoint.nodeId, { action: 'native-edit', draft });
            }}
          >
            {t('checkpoint.editInProvider', locale)}
          </button>
          <button
            type="button"
            className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900"
            onClick={() => resolveCheckpoint(checkpoint.nodeId, { action: 'confirm', draft })}
          >
            {t('checkpoint.confirm', locale)}
          </button>
        </div>
      </div>
      <textarea
        className="mt-3 h-40 w-full resize-y border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500"
        value={draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        aria-label={`${t('checkpoint.draftFor', locale)} ${providerName} ${t('checkpoint.step', locale)} ${checkpoint.nodeId}`}
      />
    </section>
  );
}
