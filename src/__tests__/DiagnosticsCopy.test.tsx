import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { host } from '../host';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { t } from '../i18n/t';
import { DiagnosticsSection } from '../ui/SettingsModal';
import { normalizeSettings } from '../ui/settingsModel';

vi.mock('../host', () => ({
  host: {
    app: { version: vi.fn().mockResolvedValue('1.8.9') },
    share: { exportMarkdown: vi.fn().mockResolvedValue('/tmp/debug.md') },
  },
}));
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

type Props = { children?: ReactNode; disabled?: boolean; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void };
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
  vi.stubGlobal('navigator', { clipboard: { writeText }, userAgent: 'test', platform: 'Linux' });
  vi.stubGlobal('window', { setInterval: vi.fn(() => 1), clearInterval: vi.fn(), setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const cleanups: Array<() => void> = [];
  let mounted = true;
  let mountEffectRan = false;
  const updatesAfterUnmount = vi.fn();
  const providerStates = Object.fromEntries(Object.keys(AI_PROVIDERS).map((provider) => [provider, {
    provider, webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1,
  }])) as Record<AIProvider, ProviderState>;
  const render = () => {
    let stateIndex = 0;
    let refIndex = 0;
    vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, (next: unknown) => void] => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next) => {
        if (!mounted) updatesAfterUnmount();
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    });
    vi.mocked(useRef).mockImplementation((initial) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }));
    vi.mocked(useMemo).mockImplementation((factory) => factory());
    vi.mocked(useEffect).mockImplementation((effect, deps) => {
      if (deps && deps.length !== 0) return;
      if (mountEffectRan) return;
      mountEffectRan = true;
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    });
    const tree = DiagnosticsSection({ providerStates, settings: normalizeSettings({}) });
    vi.mocked(useState).mockRestore();
    vi.mocked(useRef).mockRestore();
    vi.mocked(useMemo).mockRestore();
    return tree;
  };
  return { writeText, render, updatesAfterUnmount,
    unmount: () => { mounted = false; for (const cleanup of cleanups) cleanup(); },
    select: (provider: string) => find(render(), 'select')!.props.onChange!({ target: { value: provider } }),
    copy: () => {
      const tree = render();
      const btn = ['Copy log', 'Copied', 'Copy failed'].map((label) => find(tree, 'button', label)).find(Boolean);
      expect(btn).toBeDefined(); btn!.props.onClick!();
    },
    hasNotice: (label: string) => Boolean(find(render(), 'button', label)),
    exportButton: () => {
      const tree = render();
      const btn = find(tree, 'button', t('settings.exportDebugBundle', 'en')) ?? find(tree, 'button', t('settings.exporting', 'en'));
      expect(btn).toBeDefined();
      return btn!;
    },
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

describe('diagnostics export in-flight guard', () => {
  it.each(['saved', 'cancelled', 'failed'] as const)('coalesces clicks through version lookup and save, then unlocks after %s', async (outcome) => {
    vi.mocked(host.app.version).mockReset().mockResolvedValue('1.8.9');
    vi.mocked(host.share.exportMarkdown).mockReset().mockResolvedValue('/tmp/retry.md');
    let resolveVersion!: (value: string) => void;
    const versionPending = new Promise<string>((resolve) => { resolveVersion = resolve; });
    const version = vi.mocked(host.app.version).mockReturnValueOnce(versionPending);
    let resolveSave!: (value: string | null) => void;
    let rejectSave!: (reason: Error) => void;
    const savePending = new Promise<string | null>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
    const save = vi.mocked(host.share.exportMarkdown).mockReturnValueOnce(savePending);
    const ui = harness();
    const click = ui.exportButton().props.onClick!;
    click(); click();
    expect(version).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(ui.exportButton().props.disabled).toBe(true);

    resolveVersion('1.8.9');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    click();
    expect(version).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    if (outcome === 'failed') rejectSave(new Error('save denied'));
    else resolveSave(outcome === 'saved' ? '/tmp/first.md' : null);
    await vi.waitFor(() => expect(ui.exportButton().props.disabled).toBe(false));

    ui.exportButton().props.onClick!();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(version).toHaveBeenCalledTimes(2);
  });

  it('unlocks when version lookup fails before a save dialog opens', async () => {
    vi.mocked(host.app.version).mockReset().mockResolvedValue('1.8.9');
    vi.mocked(host.share.exportMarkdown).mockReset().mockResolvedValue(null);
    let rejectVersion!: (reason: Error) => void;
    const pending = new Promise<string>((_, reject) => { rejectVersion = reject; });
    const version = vi.mocked(host.app.version).mockReturnValueOnce(pending);
    const save = vi.mocked(host.share.exportMarkdown);
    const ui = harness();
    const click = ui.exportButton().props.onClick!;
    click(); click();
    expect(version).toHaveBeenCalledTimes(1);
    rejectVersion(new Error('version unavailable'));
    await vi.waitFor(() => expect(ui.exportButton().props.disabled).toBe(false));
    expect(save).not.toHaveBeenCalled();
    ui.exportButton().props.onClick!();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(version).toHaveBeenCalledTimes(2);
  });
});

describe('diagnostics export after Settings closes', () => {
  it.each(['resolve', 'reject'] as const)('ignores version %s after close and allows export in a reopened panel', async (outcome) => {
    vi.mocked(host.app.version).mockReset().mockResolvedValue('1.8.9');
    vi.mocked(host.share.exportMarkdown).mockReset().mockResolvedValue('/tmp/retry.md');
    let resolveVersion!: (value: string) => void;
    let rejectVersion!: (reason: Error) => void;
    const pending = new Promise<string>((resolve, reject) => { resolveVersion = resolve; rejectVersion = reject; });
    vi.mocked(host.app.version).mockReturnValueOnce(pending);
    const save = vi.mocked(host.share.exportMarkdown);
    const closed = harness();
    closed.exportButton().props.onClick!();
    expect(host.app.version).toHaveBeenCalledTimes(1);
    closed.unmount();
    const reopened = harness();
    reopened.exportButton().props.onClick!();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    if (outcome === 'resolve') resolveVersion('1.8.9');
    else rejectVersion(new Error('late version failure'));
    await pending.catch(() => undefined);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(closed.updatesAfterUnmount).not.toHaveBeenCalled();
    expect(reopened.exportButton().props.disabled).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)('ignores save %s after close', async (outcome) => {
    vi.mocked(host.app.version).mockReset().mockResolvedValue('1.8.9');
    vi.mocked(host.share.exportMarkdown).mockReset().mockResolvedValue('/tmp/retry.md');
    let resolveSave!: (value: string | null) => void;
    let rejectSave!: (reason: Error) => void;
    const pending = new Promise<string | null>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
    vi.mocked(host.share.exportMarkdown).mockReturnValueOnce(pending);
    const save = vi.mocked(host.share.exportMarkdown);
    const ui = harness();
    ui.exportButton().props.onClick!();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    ui.unmount();
    if (outcome === 'resolve') resolveSave('/tmp/late.md');
    else rejectSave(new Error('late save failure'));
    await pending.catch(() => undefined);
    await Promise.resolve();
    expect(ui.updatesAfterUnmount).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
