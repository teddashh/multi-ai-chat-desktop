import { describe, expect, it } from 'vitest';
import { isProviderAppHost } from '../../injected/bootstrap';

describe('bootstrap app-host gate', () => {
  it('keeps the legacy boot-everywhere behavior when no host list is configured', () => {
    expect(isProviderAppHost('auth.openai.com', undefined)).toBe(true);
    expect(isProviderAppHost('auth.openai.com', [])).toBe(true);
    expect(isProviderAppHost('auth.openai.com', 'chatgpt.com')).toBe(true);
  });

  it('boots on the provider app hosts, including subdomains, case-insensitively', () => {
    const hosts = ['chatgpt.com', 'chat.openai.com'];
    expect(isProviderAppHost('chatgpt.com', hosts)).toBe(true);
    expect(isProviderAppHost('www.chatgpt.com', hosts)).toBe(true);
    expect(isProviderAppHost('CHAT.OPENAI.COM', hosts)).toBe(true);
  });

  it('stays dormant on SSO and auth hosts so those documents remain stock', () => {
    const hosts = ['chatgpt.com', 'chat.openai.com'];
    expect(isProviderAppHost('auth.openai.com', hosts)).toBe(false);
    expect(isProviderAppHost('auth0.openai.com', hosts)).toBe(false);
    expect(isProviderAppHost('accounts.google.com', hosts)).toBe(false);
    expect(isProviderAppHost('challenges.cloudflare.com', hosts)).toBe(false);
  });

  it('rejects lookalike host suffixes and malformed entries', () => {
    expect(isProviderAppHost('evilchatgpt.com', ['chatgpt.com'])).toBe(false);
    expect(isProviderAppHost('chatgpt.com.attacker.example', ['chatgpt.com'])).toBe(false);
    expect(isProviderAppHost('chatgpt.com', ['', '   ', 'chatgpt.com'])).toBe(true);
    expect(isProviderAppHost('auth.openai.com', ['', '   '])).toBe(false);
  });
});
