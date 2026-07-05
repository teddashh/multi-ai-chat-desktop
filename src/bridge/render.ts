import type { BridgeMessage } from '../../shared/types';

export function isRenderableResponseMessage(message: BridgeMessage): boolean {
  return (
    (message.action === 'RESPONSE_CHUNK' || message.action === 'RESPONSE_DONE') &&
    Boolean(message.provider) &&
    (message.transport === 'pull' || message.transport === 'local')
  );
}
