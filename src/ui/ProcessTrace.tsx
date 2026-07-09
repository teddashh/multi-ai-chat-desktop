import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';
import type { ProcessTraceState, ProcessTraceStepStatus } from './processTraceModel';

export function ProcessTrace({ trace, locale = 'en' }: { trace: ProcessTraceState; locale?: Locale }) {
  if (trace.steps.length === 0 && !trace.currentStatus) return null;

  return (
    <section aria-label={t('processTrace.title', locale)} className="mt-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase text-zinc-700 dark:text-zinc-300">{t('processTrace.title', locale)}</h2>
        <div className="min-w-0 text-right text-[11px] text-sky-700 dark:text-sky-200">{trace.currentStatus || t('processTrace.settled', locale)}</div>
      </div>
      {trace.steps.length > 0 ? (
        <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {trace.steps.map((step) => (
            <li key={step.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-2 text-xs">
              <span className={`font-medium uppercase ${statusClass(step.status)}`}>{statusLabel(step.status, locale)}</span>
              <span className="min-w-0">
                <span className="block truncate text-zinc-900 dark:text-zinc-100">{step.label}</span>
                {step.detail ? <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-500">{step.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-500">{t('processTrace.waitingEvents', locale)}</div>
      )}
    </section>
  );
}

function statusLabel(status: ProcessTraceStepStatus, locale: Locale): string {
  if (status === 'pending') return t('processTrace.pending', locale);
  if (status === 'active') return t('processTrace.active', locale);
  return t('processTrace.done', locale);
}

function statusClass(status: ProcessTraceStepStatus): string {
  if (status === 'pending') return 'text-zinc-500 dark:text-zinc-500';
  if (status === 'active') return 'text-sky-700 dark:text-sky-300';
  return 'text-emerald-700 dark:text-emerald-300';
}
