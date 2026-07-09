import type { ProviderState } from '../../shared/types';
import type { I18nKey } from '../i18n/keys';
import { isSendable } from '../workflow/sendability';
import type { WebviewPresentationState } from './presentation';

type Translate = (key: I18nKey) => string;

export function chipState(
  state: ProviderState,
  presentation: WebviewPresentationState = 'side',
  t: Translate,
): { label: string; className: string } {
  if (presentation === 'chip') return { label: t('connection.sessionReady'), className: 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300' };
  if (state.webview !== 'loaded') return { label: t('connection.noWebview'), className: 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400' };
  if (state.adapter === 'broken') return { label: t('connection.adapterBroken'), className: 'border-red-300 dark:border-red-700 text-red-700 dark:text-red-300' };
  if (state.bridge === 'degraded') return { label: t('connection.degraded'), className: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300' };
  if (state.login === 'logged_out' || state.login === 'blocked') {
    return { label: t('connection.needsLogin'), className: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300' };
  }
  if (!isSendable(state)) return { label: t('connection.stale'), className: 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300' };
  return { label: t('connection.ready'), className: 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300' };
}
