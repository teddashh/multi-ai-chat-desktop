import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { appendEvent, formatEventLogText, providerName, type EventLogEvent } from './eventLog';
import {
  normalizeAdapterStatus,
  normalizeBridgeStatus,
  normalizeLoginStatus,
  type DebugAdapterStatus,
  type DebugBridgeStatus,
} from './statusValues';

export const DEBUG_BUNDLE_SETTINGS_ALLOWLIST = [
  'language',
  'responseLanguage',
  'adapterBaseUrl',
  'updaterChannel',
  'portable',
] as const;

export type DebugBundleSettingKey = (typeof DEBUG_BUNDLE_SETTINGS_ALLOWLIST)[number];

export type DebugBundleSettings = Record<DebugBundleSettingKey, string | boolean | null>;

export interface DebugBundleInput {
  appVersion: string;
  timestampMs: number;
  userAgent: string;
  platform: string;
  providerStates: Partial<Record<AIProvider, ProviderState>> | readonly ProviderState[];
  settings: unknown;
  events: readonly EventLogEvent[];
}

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

interface DebugBundleProvider {
  provider: AIProvider;
  name: string;
  status: {
    bridge: DebugBridgeStatus;
    adapter: DebugAdapterStatus;
    login: ProviderState['login'] | 'unknown';
    thinking: boolean;
  };
  adapterVersion?: number;
}

interface DebugBundleReport {
  bundleVersion: 1;
  generatedAt: string;
  app: {
    version: string;
  };
  environment: {
    userAgent: string;
    platform: string;
  };
  settings: DebugBundleSettings;
  providers: DebugBundleProvider[];
  eventLog: string;
}

export function buildDebugBundle(input: DebugBundleInput): string {
  const events = sanitizeEvents(input.events);
  const report: DebugBundleReport = {
    bundleVersion: 1,
    generatedAt: new Date(input.timestampMs).toISOString(),
    app: {
      version: input.appVersion,
    },
    environment: {
      userAgent: input.userAgent,
      platform: input.platform,
    },
    settings: pickDebugSettings(input.settings),
    providers: buildProviderReports(input.providerStates, events),
    eventLog: formatEventLogText(events),
  };

  return `${JSON.stringify(report, null, 2)}\n`;
}

export function debugBundleFilename(date: Date): string {
  const stamp = date.toISOString().replace(/\.\d{3}Z$/, '').replace(/[:T]/g, '-');
  return `multi-ai-chat-debug-${stamp}.txt`;
}

export function pickDebugSettings(settings: unknown): DebugBundleSettings {
  const input = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  return {
    language: stringOrNull(input.language),
    responseLanguage: stringOrNull(input.responseLanguage),
    adapterBaseUrl: redactAdapterBaseUrl(input.adapterBaseUrl),
    updaterChannel: stringOrNull(input.updaterChannel),
    portable: typeof input.portable === 'boolean' ? input.portable : null,
  };
}

function buildProviderReports(
  providerStates: DebugBundleInput['providerStates'],
  events: readonly EventLogEvent[],
): DebugBundleProvider[] {
  const states = stateMap(providerStates);
  return PROVIDERS.map((provider) => {
    const state = states[provider];
    return {
      provider,
      name: providerName(provider),
      status: {
        bridge: normalizeBridgeStatus(state?.bridge),
        adapter: normalizeAdapterStatus(state?.adapter),
        login: normalizeLoginStatus(state?.login),
        thinking: state?.thinking ?? false,
      },
      ...adapterVersionPart(provider, events),
    };
  });
}

function stateMap(providerStates: DebugBundleInput['providerStates']): Partial<Record<AIProvider, ProviderState>> {
  if (isProviderStateList(providerStates)) {
    return Object.fromEntries(providerStates.map((state) => [state.provider, state])) as Partial<
      Record<AIProvider, ProviderState>
    >;
  }
  return providerStates;
}

function isProviderStateList(value: DebugBundleInput['providerStates']): value is readonly ProviderState[] {
  return Array.isArray(value);
}

function adapterVersionPart(provider: AIProvider, events: readonly EventLogEvent[]): { adapterVersion?: number } {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.provider !== provider) continue;
    const adapterVersion = numericDetail(event, 'adapterVersion') ?? numericDetail(event, 'version');
    if (adapterVersion != null) return { adapterVersion };
  }
  return {};
}

function sanitizeEvents(events: readonly EventLogEvent[]): EventLogEvent[] {
  return events.reduce<EventLogEvent[]>(
    (current, event) => appendEvent(current, event, { cap: Number.MAX_SAFE_INTEGER, now: () => event.ts }),
    [],
  );
}

function numericDetail(event: EventLogEvent, key: string): number | undefined {
  const value = event.detail?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function redactAdapterBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '(custom, non-URL)';
    return `${url.origin}${url.pathname}`;
  } catch {
    return '(custom, non-URL)';
  }
}
