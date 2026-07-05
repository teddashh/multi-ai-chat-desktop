import type { AIProvider, ProviderState } from '../../../shared/types';
import { AI_PROVIDERS } from '../../../shared/constants';
import { sendWorkflowStatus } from '../events';
import { isSendable } from '../sendability';
import { sendAndWait } from '../sendAndWait';

export async function handleFreeMode(text: string, states: ProviderState[], targets?: AIProvider[]): Promise<void> {
  const sendable = states.filter(isSendable).map((state) => state.provider);
  const targetSet = targets === undefined ? sendable : targets.filter((provider) => sendable.includes(provider));
  if (targetSet.length === 0) {
    sendWorkflowStatus('');
    return;
  }
  const names = targetSet.map((provider) => AI_PROVIDERS[provider].name).join('、');
  sendWorkflowStatus(`⚡ ${names} 同時作答中...`);
  await Promise.all(targetSet.map((provider) => sendAndWait(provider, text).catch(() => undefined)));
  sendWorkflowStatus('');
}
