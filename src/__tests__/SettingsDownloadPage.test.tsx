import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { host } from '../host';
import { t } from '../i18n/t';
import { DownloadPageLink, SettingsExternalLink } from '../ui/SettingsModal';

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

const links = [
  {
    kind: 'download',
    url: 'https://github.com/teddashh/multi-ai-chat-desktop/releases/tag/v1.8.9',
    label: t('settings.downloadPage', 'en'),
    error: "Couldn't open the download page. Please try again.",
    render: (url: string) => DownloadPageLink({ url }),
  },
  {
    kind: 'author',
    url: 'https://ted-h.com',
    label: t('settings.madeByTedH', 'en'),
    error: "Couldn't open this link. Please try again.",
    render: (url: string) => SettingsExternalLink({
      url,
      label: t('settings.madeByTedH', 'en'),
      errorMessage: t('settings.externalLinkFailed', 'en'),
      className: 'text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100',
    }),
  },
  {
    kind: 'sponsor',
    url: 'https://ai-sister.com',
    label: t('settings.sponsoredByAiSister', 'en'),
    error: "Couldn't open this link. Please try again.",
    render: (url: string) => SettingsExternalLink({
      url,
      label: t('settings.sponsoredByAiSister', 'en'),
      errorMessage: t('settings.externalLinkFailed', 'en'),
      className: 'text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100',
    }),
  },
] as const;

function harness(link: (typeof links)[number]) {
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
    // DownloadPageLink wraps SettingsExternalLink — unwrap once so hooks run in the leaf.
    let tree = link.render(link.url);
    if (link.kind === 'download' && isValidElement(tree) && typeof tree.type === 'function') {
      tree = (tree.type as (props: unknown) => ReactElement)(tree.props);
    }
    vi.mocked(useRef).mockRestore();
    return tree;
  };
  return {
    render, url: link.url, label: link.label, error: link.error, updatesAfterUnmount,
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

describe.each(links)('Settings $kind link recovery', (link) => {
  it.each(['async', 'sync'] as const)('shows %s rejection and retries only the same URL', async (kind) => {
    const version = vi.spyOn(host.app, 'version');
    const open = vi.spyOn(host.app, 'openExternal').mockResolvedValue(undefined).mockImplementationOnce(() => {
      if (kind === 'sync') throw new Error('private host details');
      return Promise.reject(new Error('private host details'));
    });
    const ui = harness(link);
    expect(() => ui.click(link.label)).not.toThrow();
    await vi.waitFor(() => expect(ui.html().includes('role="alert"')).toBe(true));
    expect(ui.html()).toContain(link.error.replace("'", '&#x27;'));
    expect(ui.html()).not.toContain('private host details');
    ui.click(t('provider.retry', 'en'));
    await vi.waitFor(() => expect(open.mock.calls).toEqual([[ui.url], [ui.url]]));
    expect(ui.html()).not.toContain('role="alert"');
    expect(version).not.toHaveBeenCalled();
  });

  it('coalesces rapid link and Retry clicks until each open completes', async () => {
    const first = deferred();
    const second = deferred();
    const open = vi.spyOn(host.app, 'openExternal').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = harness(link);
    const click = button(ui.render(), link.label)!.props.onClick;
    click(); click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(button(ui.render(), link.label)!.props.disabled).toBe(true);
    first.reject(new Error('denied'));
    await vi.waitFor(() => expect(ui.html().includes('role="alert"')).toBe(true));
    const retry = button(ui.render(), t('provider.retry', 'en'))!.props.onClick;
    retry(); retry();
    expect(open).toHaveBeenCalledTimes(2);
    second.resolve(); await second.promise;
    expect(button(ui.render(), link.label)!.props.disabled).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)('ignores late %s after the link unmounts', async (outcome) => {
    const pending = deferred();
    vi.spyOn(host.app, 'openExternal').mockReturnValue(pending.promise);
    const ui = harness(link);
    ui.click(link.label);
    ui.unmount();
    if (outcome === 'resolve') pending.resolve();
    else pending.reject(new Error('late denial'));
    await pending.promise.catch(() => undefined);
    expect(ui.updatesAfterUnmount).not.toHaveBeenCalled();
  });
});
