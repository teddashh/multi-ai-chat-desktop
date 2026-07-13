import { useEffect, useState } from 'react';
import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';
import { AiSisterAvatar } from './AiSisterTheme';
import { ModalDialog } from './ModalDialog';
import { MarkdownText } from './MarkdownText';
import type { ProcessTraceState, ProcessTraceStep, ProcessTraceStepStatus } from './processTraceModel';

export function ProcessTrace({
  trace,
  locale = 'en',
  onDetailOpenChange,
}: {
  trace: ProcessTraceState;
  locale?: Locale;
  onDetailOpenChange?: (open: boolean) => void;
}) {
  const [detailStep, setDetailStep] = useState<ProcessTraceStep | undefined>();

  useEffect(() => () => onDetailOpenChange?.(false), [onDetailOpenChange]);

  if (trace.steps.length === 0 && !trace.currentStatus) return null;

  const closeDetail = () => {
    setDetailStep(undefined);
    onDetailOpenChange?.(false);
  };

  return (
    <>
      <section aria-label={t('processTrace.title', locale)} className="ai-sister-process-trace mt-2 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800">
          <h2 className="text-[0.6875rem] font-semibold uppercase text-zinc-700 dark:text-zinc-300">{t('processTrace.title', locale)}</h2>
          <div className="min-w-0 truncate text-right text-[0.6875rem] text-sky-700 dark:text-sky-200">{trace.currentStatus || t('processTrace.settled', locale)}</div>
        </div>
        {trace.steps.length > 0 ? (
          <ol className="max-h-36 divide-y divide-zinc-200 overflow-auto dark:divide-zinc-800">
            {trace.steps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  className="grid w-full grid-cols-[auto_6rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-white disabled:cursor-default dark:hover:bg-zinc-950"
                  disabled={!step.content}
                  onClick={() => {
                    if (!step.content) return;
                    setDetailStep(step);
                    onDetailOpenChange?.(true);
                  }}
                  title={step.content || step.detail || step.label}
                >
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className={`h-2 w-2 rounded-full ${statusDotClass(step.status)}`} />
                    {step.provider ? <AiSisterAvatar provider={step.provider} size="xs" active={step.status === 'active'} /> : null}
                  </span>
                  <span className={`truncate text-[0.6875rem] font-medium uppercase ${statusClass(step.status)}`}>{statusLabel(step.status, locale)}</span>
                  <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
                    <span className="font-medium">{step.label}</span>
                    {step.detail ? <span className="text-zinc-500 dark:text-zinc-400"> — {step.detail}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="px-2.5 py-2 text-xs text-zinc-500 dark:text-zinc-500">{t('processTrace.waitingEvents', locale)}</div>
        )}
      </section>
      {detailStep?.content ? (
        <ModalDialog
          titleId="process-trace-detail-title"
          onEscape={closeDetail}
          onBackdrop={closeDetail}
          panelClassName="max-h-[82vh] w-full max-w-3xl overflow-auto rounded-lg border border-zinc-300 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <div>
              <h2 id="process-trace-detail-title" className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {detailStep.provider ? <AiSisterAvatar provider={detailStep.provider} size="md" active={detailStep.status === 'active'} /> : null}
                <span>{detailStep.label}</span>
              </h2>
              <div className={`mt-1 text-xs uppercase ${statusClass(detailStep.status)}`}>{statusLabel(detailStep.status, locale)}</div>
            </div>
            <button type="button" className="border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={closeDetail}>
              {t('settings.close', locale)}
            </button>
          </div>
          <div className="mt-4 text-sm text-zinc-800 dark:text-zinc-200">
            <MarkdownText text={detailStep.content} />
          </div>
        </ModalDialog>
      ) : null}
    </>
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

function statusDotClass(status: ProcessTraceStepStatus): string {
  if (status === 'pending') return 'bg-zinc-400';
  if (status === 'active') return 'bg-sky-500';
  return 'bg-emerald-500';
}
