import type { BridgeMessage } from '../../shared/types';

type Handler = (message: BridgeMessage) => void;

const handlers = new Set<Handler>();

export function publishBridgeMessage(message: BridgeMessage): void {
  for (const handler of [...handlers]) handler(message);
}

export function onBridgeMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function resetBusForTests(): void {
  handlers.clear();
}
