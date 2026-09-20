import { useEffect, useRef, useState } from 'react';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { formatI18n, t } from '../i18n/t';
import { ModalDialog } from './ModalDialog';
import type { PreflightDialogModel } from './preflightModel';

export function PreflightDialog({
  model,
  onOpenLogin,
  onClose,
  onSwitchMode,
  locale = 'en',
  hidden = false,
}: {
  model: PreflightDialogModel;
  onOpenLogin: (provider: AIProvider) => void | Promise<void>;
  onClose: () => void;
  onSwitchMode: () => void;
  locale?: Locale;
  hidden?: boolean;
}) {
  const [loginError, setLoginError] = useState<AIProvider>();
  const loginInFlight = useRef(false);
  const loginGeneration = useRef(0);
  useEffect(() => () => { loginGeneration.current += 1; }, []);

  const dismiss = (action: () => void) => {
    loginGeneration.current += 1;
    action();
  };
  const openLogin = async (provider: AIProvider) => {
    if (loginInFlight.current || !model.unavailable.some((item) => item.provider === provider)) return;
    loginInFlight.current = true;
    const generation = ++loginGeneration.current;
    setLoginError(undefined);
    try {
      await onOpenLogin(provider);
      if (generation === loginGeneration.current) onClose();
    } catch {
      if (generation === loginGeneration.current) setLoginError(provider);
    } finally {
      loginInFlight.current = false;
    }
  };

  // Keep request/error state while App temporarily clears the native overlay guard.
  if (hidden) return null;
  return (
    <ModalDialog
      titleId="preflight-title"
      onEscape={() => dismiss(onClose)}
      onBackdrop={() => dismiss(onClose)}
      panelClassName="w-full max-w-md rounded-lg border border-zinc-300 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
    >
        <h2 id="preflight-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{model.title}</h2>
        <div className="mt-3 space-y-2 text-sm">
          {model.unavailable.map((item) => (
            <div key={item.provider} className="flex items-center justify-between gap-3 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2">
              <div>
                <span style={{ color: AI_PROVIDERS[item.provider].color }}>{item.label}</span>
                <span className="text-zinc-600 dark:text-zinc-400"> - {item.reason}</span>
              </div>
              <button type="button" className="border border-emerald-300 dark:border-emerald-700 px-2 py-1 text-xs hover:bg-emerald-100 dark:hover:bg-emerald-950" onClick={() => void openLogin(item.provider)}>
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
        {loginError && model.unavailable.some((item) => item.provider === loginError) ? (
          <div role="alert" className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {formatI18n(t('provider.openFailed', locale), { provider: AI_PROVIDERS[loginError].name })}
            <button type="button" className="ml-3 border border-red-400 px-2 py-1 font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900" onClick={() => void openLogin(loginError)}>
              {t('provider.retry', locale)}
            </button>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="border border-zinc-300 px-3 py-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900" onClick={() => dismiss(onClose)}>
            {t('preflight.close', locale)}
          </button>
          <button type="button" className="border border-sky-300 px-3 py-2 text-xs hover:bg-sky-100 dark:border-sky-700 dark:hover:bg-sky-950" onClick={() => dismiss(onSwitchMode)}>
            {t('preflight.switchMode', locale)}
          </button>
        </div>
    </ModalDialog>
  );
}
