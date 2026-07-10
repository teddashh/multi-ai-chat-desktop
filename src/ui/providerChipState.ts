import type { ProviderState } from '../../shared/types';
import type { I18nKey } from '../i18n/keys';
import { isSendable } from '../workflow/sendability';
import type { WebviewPresentationState } from './presentation';

type Translate = (key: I18nKey) => string;

export function chipState(
  state: ProviderState,
  presentation: WebviewPresentationState = 'side',
  t: Translate,
): { label: string; className: string; dotClassName: string } {
  if (state.webview === 'creating') {
    return {
      label: t('connection.connecting'),
      className: 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300',
      dotClassName: 'animate-pulse bg-sky-500 dark:bg-sky-400',
    };
  }
  if (state.webview !== 'loaded') {
    return {
      label: t('connection.noWebview'),
      className: 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400',
      dotClassName: 'bg-zinc-400 dark:bg-zinc-500',
    };
  }
  if (state.adapter === 'broken') {
    return {
      label: t('connection.adapterBroken'),
      className: 'border-red-300 dark:border-red-700 text-red-700 dark:text-red-300',
      dotClassName: 'bg-red-500 dark:bg-red-400',
    };
  }
  if (state.bridge === 'degraded') {
    return {
      label: t('connection.degraded'),
      className: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300',
      dotClassName: 'bg-amber-500 dark:bg-amber-400',
    };
  }
  if (state.login === 'logged_out' || state.login === 'blocked') {
    return {
      label: t('connection.needsLogin'),
      className: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300',
      dotClassName: 'bg-amber-500 dark:bg-amber-400',
    };
  }
  if (state.thinking) {
    return {
      label: t('connection.thinking'),
      className: 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300',
      dotClassName: 'animate-pulse bg-blue-500 dark:bg-blue-400',
    };
  }
  if (!isSendable(state)) {
    return {
      label: t('connection.stale'),
      className: 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300',
      dotClassName: 'bg-sky-500 dark:bg-sky-400',
    };
  }
  if (presentation === 'chip') {
    return {
      label: t('connection.sessionReady'),
      className: 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300',
      dotClassName: 'bg-zinc-400 dark:bg-zinc-500',
    };
  }
  return {
    label: t('connection.ready'),
    className: 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300',
    dotClassName: 'bg-emerald-500 dark:bg-emerald-400',
  };
}
