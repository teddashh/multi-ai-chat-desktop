import type { BridgeMessage } from '../../shared/types';
import { sanitizeResponseLanguagePolicyEcho } from './responseSanitizer';

type Handler = (message: BridgeMessage) => void;

const handlers = new Set<Handler>();

export function publishBridgeMessage(message: BridgeMessage): void {
  const sanitized = sanitizeResponseLanguagePolicyEcho(message);
  for (const handler of [...handlers]) handler(sanitized);
}

export function onBridgeMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function resetBusForTests(): void {
  handlers.clear();
}
