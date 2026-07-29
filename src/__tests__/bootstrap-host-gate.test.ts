import { describe, expect, it } from 'vitest';
import { isProviderAppHost } from '../../injected/bootstrap';

describe('bootstrap app-host gate', () => {
  it('fails closed when the host list is missing or empty', () => {
    expect(isProviderAppHost('chatgpt.com', undefined)).toBe(false);
    expect(isProviderAppHost('chatgpt.com', [])).toBe(false);
    expect(isProviderAppHost('chatgpt.com', 'chatgpt.com')).toBe(false);
  });

  it('boots only on explicitly listed provider app hosts, case-insensitively', () => {
    const hosts = ['chatgpt.com', 'chat.openai.com'];
    expect(isProviderAppHost('chatgpt.com', hosts)).toBe(true);
    expect(isProviderAppHost('CHAT.OPENAI.COM', hosts)).toBe(true);
    expect(isProviderAppHost('www.chatgpt.com', hosts)).toBe(false);
  });

  it('stays dormant on SSO and auth hosts so those documents remain stock', () => {
    const hosts = ['chatgpt.com', 'chat.openai.com'];
    expect(isProviderAppHost('auth.openai.com', hosts)).toBe(false);
    expect(isProviderAppHost('auth0.openai.com', hosts)).toBe(false);
    expect(isProviderAppHost('accounts.google.com', hosts)).toBe(false);
    expect(isProviderAppHost('challenges.cloudflare.com', hosts)).toBe(false);
    expect(isProviderAppHost('auth.grok.com', ['grok.com'])).toBe(false);
  });

  it('rejects lookalikes and fails closed on every malformed list entry', () => {
    expect(isProviderAppHost('evilchatgpt.com', ['chatgpt.com'])).toBe(false);
    expect(isProviderAppHost('chatgpt.com.attacker.example', ['chatgpt.com'])).toBe(false);
    expect(isProviderAppHost('chatgpt.com', ['', 'chatgpt.com'])).toBe(false);
    expect(isProviderAppHost('chatgpt.com', ['chatgpt.com', 42])).toBe(false);
    expect(isProviderAppHost('chatgpt.com', ['chatgpt.com', null])).toBe(false);
    expect(isProviderAppHost('auth.openai.com', ['', '   '])).toBe(false);
  });
});
