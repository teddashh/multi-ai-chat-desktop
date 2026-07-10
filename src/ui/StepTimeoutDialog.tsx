import { useEffect, useState } from 'react';
import type { Locale } from '../i18n/resolve';
import { formatI18n, t } from '../i18n/t';
import type { StepTimeoutAction } from '../workflow/stepTimeout';
import { chooseTimeoutDialogAction } from './timeoutActions';
import { ModalDialog } from './ModalDialog';

export interface StepTimeoutDialogState {
  provider: string;
  remainingMs: number;
  timedOut: boolean;
}

export function StepTimeoutDialog({
  event,
  onClose,
  locale,
}: {
  event: StepTimeoutDialogState;
  onClose: () => void;
  locale: Locale;
}) {
  const [remainingMs, setRemainingMs] = useState(event.remainingMs);

  useEffect(() => {
    if (event.timedOut) return;
    const startedAt = Date.now();
    setRemainingMs(event.remainingMs);
    const timer = window.setInterval(() => {
      setRemainingMs(Math.max(0, event.remainingMs - (Date.now() - startedAt)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [event.provider, event.remainingMs, event.timedOut]);

  if (!event.timedOut) {
    return (
      <div className="mt-2 border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        {formatI18n(t('stepTimeout.waiting', locale), { provider: event.provider, seconds: Math.ceil(remainingMs / 1000) })}
      </div>
    );
  }

  const choose = (action: StepTimeoutAction) => {
    chooseTimeoutDialogAction(action, onClose);
  };

  return (
    <ModalDialog
      titleId="step-timeout-title"
      descriptionId="step-timeout-description"
      onEscape={() => choose('cancel')}
      panelClassName="w-full max-w-sm rounded-lg border border-amber-300 bg-white p-4 shadow-xl dark:border-amber-700 dark:bg-zinc-950"
    >
        <h2 id="step-timeout-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('stepTimeout.title', locale)}</h2>
        <p id="step-timeout-description" className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {formatI18n(t('stepTimeout.description', locale), { provider: event.provider })}
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="border border-emerald-300 dark:border-emerald-700 px-3 py-2 text-xs hover:bg-emerald-100 dark:hover:bg-emerald-950" onClick={() => choose('retry')}>
            {t('stepTimeout.retry', locale)}
          </button>
          <button type="button" className="border border-sky-300 dark:border-sky-700 px-3 py-2 text-xs hover:bg-sky-100 dark:hover:bg-sky-950" onClick={() => choose('skip')}>
            {t('stepTimeout.skip', locale)}
          </button>
          <button type="button" className="border border-red-300 dark:border-red-700 px-3 py-2 text-xs hover:bg-red-100 dark:hover:bg-red-950" onClick={() => choose('cancel')}>
            {t('stepTimeout.cancel', locale)}
          </button>
        </div>
    </ModalDialog>
  );
}
