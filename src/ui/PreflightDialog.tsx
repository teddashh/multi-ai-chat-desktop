import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';
import type { PreflightDialogModel } from './preflightModel';

export function PreflightDialog({
  model,
  onOpenLogin,
  onReassign,
  onSwitchMode,
  locale = 'en',
}: {
  model: PreflightDialogModel;
  onOpenLogin: (provider: AIProvider) => void;
  onReassign: () => void;
  onSwitchMode: () => void;
  locale?: Locale;
}) {
  const hasUnavailable = model.unavailable.length > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section className="w-full max-w-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{model.title}</h2>
        <div className="mt-3 space-y-2 text-sm">
          {model.unavailable.map((item) => (
            <div key={item.provider} className="flex items-center justify-between gap-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2">
              <div>
                <span style={{ color: AI_PROVIDERS[item.provider].color }}>{item.label}</span>
                <span className="text-zinc-600 dark:text-zinc-400"> - {item.reason}</span>
              </div>
              <button className="border border-emerald-300 dark:border-emerald-700 px-2 py-1 text-xs hover:bg-emerald-100 dark:hover:bg-emerald-950" onClick={() => onOpenLogin(item.provider)}>
                {t('preflight.openLogin', locale)}
              </button>
            </div>
          ))}
          {model.aliased.map((item) => (
            <div key={item.provider} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2">
              <span style={{ color: AI_PROVIDERS[item.provider].color }}>{item.label}</span>
              <span className="text-zinc-600 dark:text-zinc-400"> - {item.reason}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={`border px-3 py-2 text-xs ${
              hasUnavailable ? 'border-sky-300 dark:border-sky-700 hover:bg-sky-100 dark:hover:bg-sky-950' : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900'
            }`}
            onClick={onReassign}
          >
            {t('preflight.reassignRole', locale)}
          </button>
          <button className="border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900" onClick={onSwitchMode}>
            {t('preflight.switchMode', locale)}
          </button>
        </div>
      </section>
    </div>
  );
}
