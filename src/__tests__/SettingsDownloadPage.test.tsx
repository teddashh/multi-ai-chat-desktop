import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { host } from '../host';
import { t } from '../i18n/t';
import { DownloadPageLink } from '../ui/SettingsModal';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useEffect: vi.fn(), useRef: vi.fn(react.useRef), useState: vi.fn(react.useState) };
});
vi.mock('../i18n/context', () => ({ useI18n: () => ({ t: (key: Parameters<typeof t>[0]) => t(key, 'en'), locale: 'en' }) }));
afterEach(() => vi.restoreAllMocks());

type ButtonProps = { children?: ReactNode; disabled?: boolean; onClick: () => void };
function button(node: ReactNode, label: string): ReactElement<ButtonProps> | undefined {
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (node.type === 'button' && node.props.children === label) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = button(child, label);
    if (found) return found;
  }
}
function harness(url = 'https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.9') {
  let state: unknown;
  const refs: { current: unknown }[] = [];
  let cleanup: (() => void) | undefined;
  let mounted = true;
  let effectRan = false;
  const updatesAfterUnmount = vi.fn();
  const render = () => {
    let index = 0;
    vi.mocked(useState).mockImplementationOnce(() => [state, (next) => {
      if (!mounted) updatesAfterUnmount();
      state = next;
    }]);
    vi.mocked(useRef).mockImplementation((initial) => refs[index++] ?? (refs[index - 1] = { current: initial }));
    vi.mocked(useEffect).mockImplementation((effect) => {
      if (effectRan) return;
      effectRan = true;
      cleanup = effect() || undefined;
    });
    const tree = DownloadPageLink({ url });
    vi.mocked(useRef).mockRestore();
    return tree;
  };
  return { render, url, updatesAfterUnmount,
    unmount: () => { mounted = false; cleanup?.(); },
    html: () => renderToStaticMarkup(render()),
    click: (label: string) => { const found = button(render(), label); expect(found).toBeDefined(); found!.props.onClick(); },
  };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('Settings download-page recovery', () => {
  it.each(['async', 'sync'] as const)('shows %s rejection and retries only the same download URL', async (kind) => {
    const version = vi.spyOn(host.app, 'version');
    const open = vi.spyOn(host.app, 'openExternal').mockResolvedValue(undefined).mockImplementationOnce(() => {
      if (kind === 'sync') throw new Error('private host details');
      return Promise.reject(new Error('private host details'));
    });
    const ui = harness();
    expect(() => ui.click(t('settings.downloadPage', 'en'))).not.toThrow();
    await vi.waitFor(() => expect(ui.html().includes('role="alert"')).toBe(true));
    expect(ui.html()).toContain('Couldn&#x27;t open the download page. Please try again.');
    expect(ui.html()).not.toContain('private host details');
    ui.click(t('provider.retry', 'en'));
    await vi.waitFor(() => expect(open.mock.calls).toEqual([[ui.url], [ui.url]]));
    expect(ui.html()).not.toContain('role="alert"');
    expect(version).not.toHaveBeenCalled();
  });

  it('coalesces rapid download and Retry clicks until each open completes', async () => {
    const first = deferred();
    const second = deferred();
    const open = vi.spyOn(host.app, 'openExternal').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = harness();
    const click = button(ui.render(), t('settings.downloadPage', 'en'))!.props.onClick;
    click(); click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(button(ui.render(), t('settings.downloadPage', 'en'))!.props.disabled).toBe(true);
    first.reject(new Error('denied'));
    await vi.waitFor(() => expect(ui.html().includes('role="alert"')).toBe(true));
    const retry = button(ui.render(), t('provider.retry', 'en'))!.props.onClick;
    retry(); retry();
    expect(open).toHaveBeenCalledTimes(2);
    second.resolve(); await second.promise;
    expect(button(ui.render(), t('settings.downloadPage', 'en'))!.props.disabled).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)('ignores late %s after the link unmounts', async (outcome) => {
    const pending = deferred();
    vi.spyOn(host.app, 'openExternal').mockReturnValue(pending.promise);
    const ui = harness();
    ui.click(t('settings.downloadPage', 'en'));
    ui.unmount();
    if (outcome === 'resolve') pending.resolve();
    else pending.reject(new Error('late denial'));
    await pending.promise.catch(() => undefined);
    expect(ui.updatesAfterUnmount).not.toHaveBeenCalled();
  });
});
