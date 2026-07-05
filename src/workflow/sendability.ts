import type { ProviderState } from '../../shared/types';

export function isSendable(state: ProviderState): boolean {
  return state.webview === 'loaded' && state.dom === 'ready' && state.login === 'logged_in';
}
