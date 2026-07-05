/// <reference types="vite/client" />

import type { BridgeMessage } from '../shared/types';

declare global {
  interface Window {
    __MAC_PROVIDER__?: string;
    __MAC_BRIDGE__?: {
      version: 1;
      bootId: string;
      emit(message: unknown): void;
      dispatch(message: BridgeMessage): void;
      onDispatch(handler: (message: BridgeMessage) => void): void;
      emitTitle(action: string, payload?: unknown, options?: { immediate?: boolean }): void;
      enqueueBulk(message: unknown): unknown;
      peekOutbox(): BridgeMessage[];
      ackBulk(maxMid: number): void;
      sendBulk(action: string, payload?: unknown): Promise<void>;
    };
    __MAC_ENGINE__?: {
      bootId: string;
      adapterVersion: number;
      stop?: () => void;
    };
  }
}
