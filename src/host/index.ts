import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onBridgeMessage } from '../bridge/bus';
import type { AdapterNotice } from '../ui/reportBroken';

export interface StoredSnapshotInfo {
  id: string;
  graphId?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface NavBlockedPayload {
  provider: string;
  host: string;
}

const toBounds = (rect: DOMRectReadOnly) => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
});

const SNAPSHOT_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

function safeSnapshotId(snapshotId: string): string {
  if (!SNAPSHOT_ID_RE.test(snapshotId) || snapshotId === '.' || snapshotId === '..') {
    throw new Error('Invalid snapshot id');
  }
  return snapshotId;
}

export const host = {
  app: {
    version: (): Promise<string> => getVersion(),
    openExternal: (url: string): Promise<void> => invoke('open_external_url', { url }),
  },
  onNavBlocked: async (handler: (payload: NavBlockedPayload) => void): Promise<() => void> => {
    const unlisten = await listen<NavBlockedPayload>('nav://blocked', (event) => handler(event.payload));
    return unlisten;
  },
  provider: {
    open: (provider: AIProvider, bounds: DOMRectReadOnly): Promise<ProviderState> =>
      invoke('provider_open', { provider, bounds: toBounds(bounds) }),
    close: (provider: AIProvider): Promise<void> => invoke('provider_close', { provider }),
    show: (provider: AIProvider, focus = true): Promise<void> => invoke('provider_show', { provider, focus }),
    hide: (provider: AIProvider): Promise<void> => invoke('provider_hide', { provider }),
    park: async (provider: AIProvider, bounds: DOMRectReadOnly): Promise<void> => {
      await invoke('provider_set_bounds', { provider, bounds: toBounds(bounds) });
      await invoke('provider_show', { provider, focus: false });
    },
    eval: (provider: AIProvider, js: string): Promise<void> => invoke('provider_eval', { provider, js }),
    evalWithCallback: (provider: AIProvider, js: string): Promise<string> =>
      invoke('provider_eval_with_callback', { provider, js }),
    send: (provider: AIProvider, text: string): Promise<void> =>
      invoke('provider_eval', {
        provider,
        js: `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch(${JSON.stringify({
          v: 1,
          action: 'SEND_MESSAGE',
          provider,
          payload: { text },
        })});`,
      }),
    fill: (provider: AIProvider, text: string): Promise<void> =>
      invoke('provider_eval', {
        provider,
        js: `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch(${JSON.stringify({
          v: 1,
          action: 'FILL_DRAFT',
          provider,
          payload: { text },
        })});`,
      }),
    openLogin: (provider: AIProvider): Promise<void> => invoke('provider_open_login', { provider }),
    openLoginExternal: (provider: AIProvider): Promise<void> => invoke('provider_open_login_external', { provider }),
    reload: (provider: AIProvider): Promise<void> => invoke('provider_reload', { provider }),
  },
  adapter: {
    push: (provider: AIProvider, _cfg: unknown): Promise<void> => invoke('adapter_push', { provider }),
    reportBroken: (provider: AIProvider): Promise<string> => invoke('report_broken', { provider }),
    openIssue: (provider: AIProvider, body: string): Promise<void> =>
      invoke('open_adapter_issue', { provider, body }),
    onNotice: async (handler: (notice: AdapterNotice) => void): Promise<() => void> => {
      const unlisten = await listen<AdapterNotice>('adapter://notice', (event) => handler(event.payload));
      return unlisten;
    },
  },
  connections: {
    get: (): Promise<ProviderState[]> => invoke('connections_get'),
    onUpdate: async (handler: (state: ProviderState) => void): Promise<() => void> => {
      const unlisten = await listen<ProviderState>('connections://update', (event) => handler(event.payload));
      return unlisten;
    },
  },
  layout: {
    setBounds: (provider: AIProvider, rect: DOMRectReadOnly): Promise<void> =>
      invoke('provider_set_bounds', { provider, bounds: toBounds(rect) }),
  },
  bridge: {
    subscribeTitle: async (handler: (message: BridgeMessage) => void): Promise<() => void> => {
      const unlisten = await listen<BridgeMessage>('bridge://msg', (event) => handler(event.payload));
      return unlisten;
    },
    subscribe: async (handler: (message: BridgeMessage) => void): Promise<() => void> =>
      Promise.resolve(onBridgeMessage(handler)),
    onMessage: async (handler: (message: BridgeMessage) => void): Promise<() => void> => {
      return onBridgeMessage(handler);
    },
  },
  dev: {
    /** Dev-only: forward a line to the Rust stdout so headless harness runs can capture it. */
    log: (message: string): Promise<void> => invoke('dev_log', { message }),
  },
  settings: {
    get: (): Promise<unknown> => invoke('settings_get'),
    set: (settings: unknown): Promise<void> => invoke('settings_set', { settings }),
  },
  snapshot: {
    save: async (snapshotId: string, snapshotJson: string): Promise<void> =>
      invoke('snapshot_save', { snapshotId: safeSnapshotId(snapshotId), snapshotJson }),
    list: (): Promise<StoredSnapshotInfo[]> => invoke('snapshot_list'),
    load: async (snapshotId: string): Promise<string | null> =>
      invoke('snapshot_load', { snapshotId: safeSnapshotId(snapshotId) }),
    delete: async (snapshotId: string): Promise<void> => invoke('snapshot_delete', { snapshotId: safeSnapshotId(snapshotId) }),
  },
  sessionCheckpoint: {
    save: (json: string): Promise<void> => invoke('session_checkpoint_save', { json }),
    load: (): Promise<string | null> => invoke('session_checkpoint_load'),
    clear: (): Promise<void> => invoke('session_checkpoint_clear'),
  },
  share: {
    exportMarkdown: (suggestedName: string, content: string): Promise<string | null> =>
      invoke('export_markdown', { suggestedName, content }),
  },
};
