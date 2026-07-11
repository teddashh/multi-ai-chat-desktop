import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { buildDebugBundle, debugBundleFilename, pickDebugSettings } from '../diagnostics/debugBundle';
import { appendEvent, eventFromBridgeMessage, formatEventLogText, type EventLogEvent } from '../diagnostics/eventLog';

const providers = Object.keys(AI_PROVIDERS) as AIProvider[];

function state(provider: AIProvider, patch: Partial<ProviderState> = {}): ProviderState {
  return {
    provider,
    webview: 'loaded',
    dom: 'ready',
    login: 'logged_in',
    thinking: false,
    lastStatusAt: 1,
    bridge: 'ok',
    adapter: 'ok',
    ...patch,
  };
}

function baseBundle(overrides: Partial<Parameters<typeof buildDebugBundle>[0]> = {}): string {
  return buildDebugBundle({
    appVersion: '0.1.0',
    timestampMs: Date.parse('2026-07-05T01:02:03Z'),
    userAgent: 'Vitest UA',
    platform: 'Win32',
    providerStates: Object.fromEntries(providers.map((provider) => [provider, state(provider)])) as Record<
      AIProvider,
      ProviderState
    >,
    settings: {
      adapterBaseUrl: 'https://example.test/adapters',
      updaterChannel: 'stable',
      portable: true,
    },
    events: [],
    ...overrides,
  });
}

describe('debug bundle builder', () => {
  it('allowlists settings and does not include removed tokens or session-like secrets', () => {
    const legacyPublishTokenKey = ['hack', 'mdToken'].join('');
    const token = 'hmd_private_token_123';
    const cookie = 'sid=private-cookie';
    const session = 'private-session-data';
    const bundle = baseBundle({
      settings: {
        adapterBaseUrl: 'https://example.test/adapters',
        updaterChannel: 'stable',
        portable: false,
        [legacyPublishTokenKey]: token,
        cookies: cookie,
        session,
      },
      events: [
        {
          ts: 1,
          kind: 'workflow-step',
          summary: 'safe event',
          detail: {
            token,
            cookie,
            session,
            chars: 5,
          },
        },
      ],
    });

    expect(bundle).not.toContain(token);
    expect(bundle).not.toContain(cookie);
    expect(bundle).not.toContain(session);
    expect(bundle).not.toContain(legacyPublishTokenKey);
  });

  it('redacts credentials, query strings, and fragments from adapter base URLs', () => {
    const password = 'private-password';
    const token = 'secret-url-token';
    const bundle = baseBundle({
      settings: {
        adapterBaseUrl: `https://user:${password}@example.test/adapters/v1?token=${token}#debug`,
        updaterChannel: 'stable',
        portable: true,
      },
    });
    const parsed = JSON.parse(bundle) as { settings: ReturnType<typeof pickDebugSettings> };

    expect(parsed.settings.adapterBaseUrl).toBe('https://example.test/adapters/v1');
    expect(bundle).not.toContain(password);
    expect(bundle).not.toContain(token);
    expect(bundle).not.toContain('user:');
    expect(bundle).not.toContain('?token=');
    expect(bundle).not.toContain('#debug');
  });

  it('uses a safe placeholder for non-URL custom adapter base values', () => {
    const bundle = baseBundle({
      settings: {
        adapterBaseUrl: 'not a url with private words',
        updaterChannel: 'stable',
        portable: true,
      },
    });
    const parsed = JSON.parse(bundle) as { settings: ReturnType<typeof pickDebugSettings> };

    expect(parsed.settings.adapterBaseUrl).toBe('(custom, non-URL)');
    expect(bundle).not.toContain('private words');
  });

  it('does not serialize prompt, reply, or payload body text from raw event details', () => {
    const prompt = 'PRIVATE_PROMPT_BODY';
    const reply = 'PRIVATE_REPLY_BODY';
    const payload = 'PRIVATE_PAYLOAD_BODY';
    const bundle = baseBundle({
      events: [
        {
          ts: 1,
          provider: 'chatgpt',
          kind: 'response',
          summary: 'ChatGPT response done (18 chars)',
          detail: {
            prompt,
            reply,
            text: reply,
            body: reply,
            content: reply,
            payload,
            chars: 18,
          },
        },
      ],
    });
    const parsed = JSON.parse(bundle) as { eventLog: string };

    expect(bundle).toContain('"eventLog"');
    expect(parsed.eventLog).toContain('"chars":18');
    expect(bundle).not.toContain(prompt);
    expect(bundle).not.toContain(reply);
    expect(bundle).not.toContain(payload);
  });

  it('does not let provider-origin status values smuggle body text into logs or bundles', () => {
    const secret = 'sneaky secret body text';
    const reason = `status reason copied from prompt body ${secret}`;
    const event = eventFromBridgeMessage({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: {
        dom: secret,
        login: secret,
        bridge: secret,
        adapter: secret,
        reason,
        thinking: true,
      },
      transport: 'title',
    });
    const events = appendEvent([], event!, { now: () => 123 });
    const copiedLog = formatEventLogText(events);
    const poisonedState: ProviderState = {
      ...state('chatgpt'),
      bridge: secret as NonNullable<ProviderState['bridge']>,
      adapter: secret as NonNullable<ProviderState['adapter']>,
      login: secret as ProviderState['login'],
    };
    const bundle = baseBundle({
      providerStates: { chatgpt: poisonedState },
      events,
    });
    const parsed = JSON.parse(bundle) as {
      eventLog: string;
      providers: Array<{ provider: AIProvider; status: { bridge: string; adapter: string; login: string } }>;
    };
    const chatgpt = parsed.providers.find((provider) => provider.provider === 'chatgpt');

    expect(copiedLog).not.toContain(secret);
    expect(copiedLog).not.toContain(reason);
    expect(parsed.eventLog).not.toContain(secret);
    expect(parsed.eventLog).not.toContain(reason);
    expect(bundle).not.toContain(secret);
    expect(bundle).not.toContain(reason);
    expect(chatgpt?.status).toMatchObject({
      bridge: 'unknown',
      adapter: 'unknown',
      login: 'unknown',
    });
  });

  it('includes expected metadata, provider status, adapter versions, and debug filename shape', () => {
    const events: EventLogEvent[] = [
      {
        ts: 1,
        provider: 'chatgpt',
        kind: 'adapter-notice',
        summary: 'ChatGPT adapter update v7',
        detail: {
          adapterVersion: 7,
          schemaVersion: 1,
        },
      },
    ];
    const bundle = baseBundle({
      appVersion: '0.2.0',
      providerStates: {
        chatgpt: state('chatgpt', {
          bridge: 'degraded',
          adapter: 'broken',
          login: 'logged_out',
          thinking: true,
        }),
      },
      events,
    });
    const parsed = JSON.parse(bundle) as {
      generatedAt: string;
      app: { version: string };
      environment: { userAgent: string; platform: string };
      settings: ReturnType<typeof pickDebugSettings>;
      providers: Array<{
        provider: AIProvider;
        status: { bridge: string; adapter: string; login: string; thinking: boolean };
        adapterVersion?: number;
      }>;
      eventLog: string;
    };
    const chatgpt = parsed.providers.find((provider) => provider.provider === 'chatgpt');

    expect(parsed.generatedAt).toBe('2026-07-05T01:02:03.000Z');
    expect(parsed.app.version).toBe('0.2.0');
    expect(parsed.environment).toEqual({ userAgent: 'Vitest UA', platform: 'Win32' });
    expect(parsed.settings).toEqual({
      adapterBaseUrl: 'https://example.test/adapters',
      updaterChannel: 'stable',
      portable: true,
    });
    expect(chatgpt?.status).toEqual({
      bridge: 'degraded',
      adapter: 'broken',
      login: 'logged_out',
      thinking: true,
    });
    expect(chatgpt?.adapterVersion).toBe(7);
    expect(parsed.providers.map((provider) => provider.provider)).toEqual(providers);
    expect(parsed.eventLog).toContain('ChatGPT adapter update v7');
    expect(debugBundleFilename(new Date('2026-07-05T01:02:03Z'))).toBe('multi-ai-chat-debug-2026-07-05-01-02-03.txt');
  });
});
