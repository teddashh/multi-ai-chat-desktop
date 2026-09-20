import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { t } from '../i18n/t';
import { DiagnosticsSection } from '../ui/SettingsModal';
import { normalizeSettings } from '../ui/settingsModel';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useEffect: vi.fn(), useMemo: vi.fn(react.useMemo), useRef: vi.fn(react.useRef), useState: vi.fn(react.useState) };
});
vi.mock('../i18n/context', () => ({ useI18n: () => ({ t: (key: Parameters<typeof t>[0]) => t(key, 'en'), locale: 'en' }) }));
vi.mock('../ui/useEventLog', () => ({ useEventLog: () => [
  { ts: 1, provider: 'meta', kind: 'provider-state', summary: 'meta-only' },
  { ts: 2, provider: 'grok', kind: 'provider-state', summary: 'grok-only' },
] }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

type Props = { children?: ReactNode; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void };
function find(node: ReactNode, type: string, label?: string): ReactElement<Props> | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (node.type === type && (label === undefined || node.props.children === label)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = find(child, type, label);
    if (found) return found;
  }
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function harness(writeText = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const providerStates = Object.fromEntries(Object.keys(AI_PROVIDERS).map((provider) => [provider, {
    provider, webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1,
  }])) as Record<AIProvider, ProviderState>;
  const render = () => {
    let stateIndex = 0;
    let refIndex = 0;
    vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, (next: unknown) => void] => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    });
    vi.mocked(useRef).mockImplementation((initial) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }));
    vi.mocked(useMemo).mockImplementation((factory) => factory());
    vi.mocked(useEffect).mockImplementation(() => undefined);
    const tree = DiagnosticsSection({ providerStates, settings: normalizeSettings({}) });
    vi.mocked(useState).mockRestore();
    vi.mocked(useRef).mockRestore();
    vi.mocked(useMemo).mockRestore();
    return tree;
  };
  return { writeText, render,
    select: (provider: string) => find(render(), 'select')!.props.onChange!({ target: { value: provider } }),
    copy: () => {
      const tree = render();
      const btn = ['Copy log', 'Copied', 'Copy failed'].map((label) => find(tree, 'button', label)).find(Boolean);
      expect(btn).toBeDefined(); btn!.props.onClick!();
    },
    hasNotice: (label: string) => Boolean(find(render(), 'button', label)),
  };
}

describe('diagnostics copy completion scope', () => {
  it.each(['success', 'failure'] as const)('ignores old provider %s after the new provider copy has settled', async (oldResult) => {
    const old = deferred();
    const writeText = vi.fn().mockReturnValueOnce(old.promise);
    if (oldResult === 'success') writeText.mockRejectedValueOnce(new Error('current copy denied'));
    else writeText.mockResolvedValueOnce(undefined);
    const ui = harness(writeText);
    ui.select('meta'); ui.copy();
    ui.select('grok'); ui.copy();
    const currentNotice = oldResult === 'success' ? 'Copy failed' : 'Copied';
    await vi.waitFor(() => expect(ui.hasNotice(currentNotice)).toBe(true));
    if (oldResult === 'success') old.resolve();
    else old.reject(new Error('old copy denied'));
    await old.promise.catch(() => undefined);
    expect(ui.hasNotice(currentNotice)).toBe(true);
    expect(writeText.mock.calls[0][0]).toContain('meta-only');
    expect(writeText.mock.calls[0][0]).not.toContain('grok-only');
    expect(writeText.mock.calls[1][0]).toContain('grok-only');
    expect(writeText.mock.calls[1][0]).not.toContain('meta-only');
  });

  it('invalidates a pending copy even after switching away and back to the same provider', async () => {
    const old = deferred();
    const ui = harness(vi.fn().mockReturnValue(old.promise));
    ui.select('meta'); ui.copy();
    ui.select('grok'); ui.select('meta');
    old.resolve(); await old.promise;
    expect(ui.hasNotice('Copy log')).toBe(true);
  });

  it('clears an already completed copy notice when the provider changes', async () => {
    const ui = harness();
    ui.select('meta'); ui.copy();
    await vi.waitFor(() => expect(ui.hasNotice('Copied')).toBe(true));
    ui.select('grok');
    expect(ui.hasNotice('Copy log')).toBe(true);
  });

  it('keeps the newer copy notice when requests for the same provider settle out of order', async () => {
    const old = deferred();
    const ui = harness(vi.fn().mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('new copy denied')));
    ui.select('meta'); ui.copy(); ui.copy();
    await vi.waitFor(() => expect(ui.hasNotice('Copy failed')).toBe(true));
    old.resolve(); await old.promise;
    expect(ui.hasNotice('Copy failed')).toBe(true);
  });
});
