import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { host } from '../host';
import { t } from '../i18n/t';
import { FocusPane } from '../ui/FocusPane';
import { defaultPresentation } from '../ui/presentation';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useEffect: vi.fn(react.useEffect), useState: vi.fn(react.useState), useRef: vi.fn(react.useRef) };
});

vi.mock('../i18n/context', () => ({
  useI18n: () => ({ locale: 'en', t: (key: Parameters<typeof t>[0]) => t(key, 'en') }),
}));

afterEach(() => vi.restoreAllMocks());

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === 'button' && node.props.children === label) {
    return node as ReactElement<{ onClick: () => void }>;
  }
  for (const child of Children.toArray(node.props.children)) {
    const button = findButton(child, label);
    if (button) return button;
  }
  return undefined;
}

function findButtonByAria(
  node: ReactNode,
  ariaIncludes: string,
): ReactElement<{ onClick: () => void }> | undefined {
  if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string; onClick?: () => void }>(node)) {
    return undefined;
  }
  if (node.type === 'button' && (node.props['aria-label'] || '').includes(ariaIncludes)) {
    return node as ReactElement<{ onClick: () => void }>;
  }
  for (const child of Children.toArray(node.props.children)) {
    const button = findButtonByAria(child, ariaIncludes);
    if (button) return button;
  }
  return undefined;
}


function harness(
  onOpenLogin = vi.fn<(provider: AIProvider) => Promise<void>>(),
  {
    provider = 'meta',
    login = 'logged_out',
    stuckGrok = false,
  }: { provider?: AIProvider; login?: ProviderState['login']; stuckGrok?: boolean } = {},
) {
  // Retain the parent hooks across renders; child components use React's SSR hooks.
  let actionState: unknown;
  const generation = { current: 0 };
  const reportInFlight = { current: false };
  const reloadInFlight = { current: new Set<AIProvider>() };
  let cleanup: (() => void) | undefined;
  let mounted = true;
  let effectRan = false;
  const updatesAfterUnmount = vi.fn();
  const changeProviderPresentation = vi.fn().mockResolvedValue(undefined);
  const syncBounds = vi.fn().mockResolvedValue(undefined);
  const reportProvider = vi.fn().mockResolvedValue(undefined);
  const states = Object.fromEntries(Object.keys(AI_PROVIDERS).map((provider) => [provider, {
    provider, webview: 'loaded', dom: 'ready', login: 'logged_out',
    thinking: false, lastStatusAt: 1, bridge: 'ok', adapter: 'ok',
  }])) as Record<AIProvider, ProviderState>;
  states[provider].login = login;
  if (stuckGrok) {
    states.grok = {
      provider: 'grok',
      webview: 'loaded',
      dom: 'unknown',
      login: 'unknown',
      thinking: false,
      lastStatusAt: Date.now() - 50_001,
      bridge: 'ok',
      adapter: 'ok',
    };
  }
  const providers = stuckGrok
    ? (['chatgpt', 'claude', 'gemini', 'grok', provider === 'meta' ? 'meta' : 'chatgpt'] as AIProvider[])
    : (['chatgpt', 'claude', 'gemini', provider === 'meta' ? 'meta' : 'grok'] as AIProvider[]);
  const render = () => {
    vi.mocked(useState).mockImplementationOnce(() => [actionState, (next) => {
      if (!mounted) updatesAfterUnmount();
      actionState = next;
    }]);
    vi.mocked(useRef).mockReturnValueOnce(generation).mockReturnValueOnce(reportInFlight).mockReturnValueOnce(reloadInFlight);
    vi.mocked(useEffect).mockImplementationOnce((effect) => {
      if (effectRan) return;
      effectRan = true;
      cleanup = effect() || undefined;
    });
    const tree = FocusPane({
      centeredProvider: provider, states,
      presentation: { ...defaultPresentation(), grok: provider === 'meta' ? 'chip' : 'side', [provider]: 'center' },
      providers: [...new Set(providers)],
      centerSurface: 'native', centerTextFinal: false,
      userHidden: new Set(), presentationHidden: new Set(),
      setPaneRef: vi.fn(), setCenterStageRef: vi.fn(), changeProviderPresentation,
      onManualFocusControl: vi.fn(), onEnlargeCenter: vi.fn(), onCollapseCenter: vi.fn(),
      onOpenLogin, syncBounds,
      reportProvider, reportBusy: false,
    });
    vi.mocked(useEffect).mockReset();
    return tree;
  };
  const stage = () => render().props.children[0] as ReactElement<{
    onOpenLogin: (provider: AIProvider) => Promise<void>;
    activateProvider: (provider: AIProvider) => Promise<void>;
  }>;
  const retry = () => {
    const alert = render().props.children[1] as ReactElement<{ children: ReactElement[] }>;
    expect(alert).toBeTruthy();
    (alert.props.children[1] as ReactElement<{ onClick: () => void }>).props.onClick();
  };
  const clickStageButton = (label: string, moreMenuOpen = false) => {
    const element = stage();
    const closeMenu = vi.fn();
    vi.mocked(useState).mockReturnValueOnce([moreMenuOpen, closeMenu]);
    vi.mocked(useRef).mockReturnValueOnce({ current: null });
    vi.mocked(useEffect).mockImplementationOnce(() => undefined);
    const renderStage = element.type as (props: typeof element.props) => ReactElement;
    const button = findButton(renderStage(element.props), label);
    expect(button).toBeDefined();
    button!.props.onClick();
    if (moreMenuOpen) expect(closeMenu).toHaveBeenCalledWith(false);
  };
  const clickStuckRecover = (ariaIncludes = 'Click to reload and recover the connection') => {
    const pane = render();
    const stripEl = Children.toArray(pane.props.children).find(
      (child) => isValidElement(child) && typeof (child.props as { reconnectProvider?: unknown }).reconnectProvider === 'function',
    ) as ReactElement<{ reconnectProvider: (provider: AIProvider) => Promise<void> }> | undefined;
    expect(stripEl).toBeDefined();
    const strip = (stripEl!.type as (props: typeof stripEl.props) => ReactElement<{ children: ReactNode }>)(stripEl!.props);
    const grid = Children.toArray(strip.props.children)[1] as ReactElement<{ children: ReactNode }>;
    for (const item of Children.toArray(grid.props.children)) {
      if (!isValidElement(item)) continue;
      const chip = (item.type as (props: object) => ReactNode)(item.props as object);
      const button = findButtonByAria(chip, ariaIncludes);
      if (button) {
        button.props.onClick();
        return;
      }
    }
    expect(undefined).toBeDefined();
  };
  return {
    updatesAfterUnmount, unmount: () => { mounted = false; cleanup?.(); },
    render, stage, retry, onOpenLogin, changeProviderPresentation, syncBounds, states, reportProvider,
    report: () => clickStageButton('Report', true),
    reload: () => clickStageButton('Reload', true),
    openInBrowser: () => clickStageButton('Open in browser'),
    clickStuckRecover,
  };
}

describe('FocusPane provider action failure recovery', () => {
  it.each(['async', 'sync'] as const)('shows %s report failure and retries only report', async (kind) => {
    const ui = harness();
    ui.reportProvider.mockImplementationOnce(() => {
      if (kind === 'sync') throw new Error('host denied report');
      return Promise.reject(new Error('host denied report'));
    });
    expect(() => ui.report()).not.toThrow();
    await vi.waitFor(() => expect(renderToStaticMarkup(ui.render())).toContain('role="alert"'));
    expect(renderToStaticMarkup(ui.render())).toContain('Couldn&#x27;t prepare the report for Meta AI. Please try again.');
    ui.retry();
    await vi.waitFor(() => expect(ui.reportProvider.mock.calls).toEqual([['meta'], ['meta']]));
    expect(ui.onOpenLogin).not.toHaveBeenCalled();
    expect(ui.changeProviderPresentation).not.toHaveBeenCalled();
    expect(ui.syncBounds).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });

  it('ignores duplicate report and Retry clicks until the pending report settles', async () => {
    const ui = harness();
    let reject!: (reason: Error) => void;
    const first = new Promise<void>((_, fail) => { reject = fail; });
    let resolve!: () => void;
    const second = new Promise<void>((ok) => { resolve = ok; });
    ui.reportProvider.mockReturnValueOnce(first).mockReturnValueOnce(second);
    ui.report();
    ui.report();
    expect(ui.reportProvider).toHaveBeenCalledTimes(1);
    reject(new Error('report denied'));
    await vi.waitFor(() => expect(renderToStaticMarkup(ui.render())).toContain('role="alert"'));
    const alert = ui.render().props.children[1] as ReactElement<{ children: ReactElement[] }>;
    const retry = alert.props.children[1] as ReactElement<{ onClick: () => void }>;
    retry.props.onClick();
    retry.props.onClick();
    ui.report();
    expect(ui.reportProvider).toHaveBeenCalledTimes(2);
    resolve();
    await second;
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
    ui.report();
    expect(ui.reportProvider).toHaveBeenCalledTimes(3);
  });

  it.each(['grok', 'gemini'] as const)('retries only the browser action when opening %s externally is rejected', async (provider) => {
    const external = vi.spyOn(host.provider, 'openLoginExternal')
      .mockRejectedValueOnce(new Error('host rejected external login'))
      .mockResolvedValueOnce(undefined);
    const reload = vi.spyOn(host.provider, 'reload').mockResolvedValue(undefined);
    const ui = harness(undefined, { provider, login: 'blocked' });

    ui.openInBrowser();
    await vi.waitFor(() => expect(renderToStaticMarkup(ui.render()).includes('role="alert"')).toBe(true));
    expect(renderToStaticMarkup(ui.render())).toContain(`Couldn&#x27;t open ${AI_PROVIDERS[provider].name}. Please try again.`);
    ui.retry();
    await vi.waitFor(() => expect(external.mock.calls).toEqual([[provider], [provider]]));
    expect(reload).not.toHaveBeenCalled();
    expect(ui.onOpenLogin).not.toHaveBeenCalled();
    expect(ui.changeProviderPresentation).not.toHaveBeenCalled();
    expect(ui.syncBounds).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });

  it.each(['resolve', 'reject'] as const)('ignores reconnect %s after unmount while a new pane reconnects normally', async (outcome) => {
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
    const reconnect = vi.spyOn(host.provider, 'reconnect').mockResolvedValue(undefined).mockReturnValueOnce(pending);
    const oldPane = harness(undefined, { stuckGrok: true });
    oldPane.clickStuckRecover();
    oldPane.unmount();

    const newPane = harness(undefined, { stuckGrok: true });
    newPane.clickStuckRecover();
    await vi.waitFor(() => expect(newPane.changeProviderPresentation).toHaveBeenCalledWith('grok', 'center'));
    if (outcome === 'resolve') resolve();
    else reject(new Error('late reconnect rejection'));
    await pending.catch(() => undefined);
    await Promise.resolve();

    expect(oldPane.changeProviderPresentation).not.toHaveBeenCalled();
    expect(oldPane.syncBounds).not.toHaveBeenCalled();
    expect(oldPane.updatesAfterUnmount).not.toHaveBeenCalled();
    expect(newPane.changeProviderPresentation).toHaveBeenCalledTimes(1);
    expect(reconnect.mock.calls).toEqual([['grok'], ['grok']]);
  });

  it.each(['success', 'failure'] as const)('coalesces Reload and Retry clicks, then unlocks after reload %s', async (outcome) => {
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
    const reload = vi.spyOn(host.provider, 'reload').mockResolvedValue(undefined).mockReturnValueOnce(pending);
    const ui = harness();
    ui.reload(); ui.reload();
    expect(reload).toHaveBeenCalledTimes(1);
    if (outcome === 'success') resolve();
    else reject(new Error('reload denied'));
    await pending.catch(() => undefined);
    await Promise.resolve();

    let resolveRetry!: () => void;
    const retryPending = new Promise<void>((done) => { resolveRetry = done; });
    reload.mockReturnValueOnce(retryPending);
    if (outcome === 'failure') {
      await vi.waitFor(() => expect(renderToStaticMarkup(ui.render())).toContain('role="alert"'));
      const alert = ui.render().props.children[1] as ReactElement<{ children: ReactElement[] }>;
      expect(alert).toBeTruthy();
      const click = (alert.props.children[1] as ReactElement<{ onClick: () => void }>).props.onClick;
      click(); click();
    } else {
      ui.reload();
    }
    ui.reload();
    expect(reload.mock.calls).toEqual([['meta'], ['meta']]);
    resolveRetry(); await retryPending; await Promise.resolve();
    expect(ui.syncBounds).toHaveBeenCalledTimes(outcome === 'success' ? 2 : 1);
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });

  it.each(['success', 'failure'] as const)('keeps Reload guarded until bounds sync %s and releases it afterwards', async (outcome) => {
    const reload = vi.spyOn(host.provider, 'reload').mockResolvedValue(undefined);
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
    const ui = harness();
    ui.syncBounds.mockReturnValueOnce(pending);
    ui.reload();
    await vi.waitFor(() => expect(ui.syncBounds).toHaveBeenCalledTimes(1));
    ui.reload();
    expect(reload).toHaveBeenCalledTimes(1);
    if (outcome === 'success') resolve();
    else reject(new Error('bounds failed'));
    await pending.catch(() => undefined);
    await Promise.resolve();
    ui.reload();
    await vi.waitFor(() => expect(ui.syncBounds).toHaveBeenCalledTimes(2));
    expect(reload.mock.calls).toEqual([['meta'], ['meta']]);
  });

  it.each(['unmount', 'newer-action'] as const)('does not sync bounds after a pending Reload is invalidated by %s', async (action) => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    const reload = vi.spyOn(host.provider, 'reload').mockResolvedValue(undefined).mockReturnValueOnce(pending);
    const ui = harness();
    ui.reload();
    if (action === 'unmount') {
      ui.unmount();
    } else {
      // Start a newer provider action so generation advances while Reload is pending.
      ui.reportProvider.mockReturnValueOnce(new Promise(() => {}));
      ui.report();
    }
    resolve();
    await pending;
    await Promise.resolve();

    expect(ui.syncBounds).not.toHaveBeenCalled();
    expect(ui.updatesAfterUnmount).not.toHaveBeenCalled();
    const newPane = harness();
    newPane.reload();
    await vi.waitFor(() => expect(newPane.syncBounds).toHaveBeenCalledWith('meta'));
    expect(newPane.syncBounds).toHaveBeenCalledTimes(1);
    expect(reload.mock.calls).toEqual([['meta'], ['meta']]);
  });

  it.each(['reconnect', 'activate'])('retries status-strip reconnect after %s rejects without Login/Reload/browser', async (failure) => {
    const reconnect = vi.spyOn(host.provider, 'reconnect').mockResolvedValue(undefined);
    const reload = vi.spyOn(host.provider, 'reload').mockResolvedValue(undefined);
    const external = vi.spyOn(host.provider, 'openLoginExternal').mockResolvedValue(undefined);
    const ui = harness(undefined, { stuckGrok: true });
    if (failure === 'reconnect') reconnect.mockRejectedValueOnce(new Error('host rejected reconnect'));
    else ui.changeProviderPresentation.mockRejectedValueOnce(new Error('activate after reconnect rejected'));

    ui.clickStuckRecover();
    await vi.waitFor(() => expect(renderToStaticMarkup(ui.render()).includes('role="alert"')).toBe(true));
    expect(renderToStaticMarkup(ui.render())).toContain('Couldn&#x27;t open Grok. Please try again.');
    expect(ui.changeProviderPresentation).toHaveBeenCalledTimes(failure === 'reconnect' ? 0 : 1);

    ui.retry();
    await vi.waitFor(() => expect(ui.changeProviderPresentation).toHaveBeenCalledTimes(failure === 'reconnect' ? 1 : 2));
    expect(reconnect.mock.calls).toEqual([['grok'], ['grok']]);
    expect(ui.changeProviderPresentation).toHaveBeenLastCalledWith('grok', 'center');
    expect(ui.onOpenLogin).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
    expect(ui.syncBounds).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });

  it.each(['reload', 'bounds'])('retries Reload after %s rejects without reopening the provider', async (failure) => {
    const reload = vi.spyOn(host.provider, 'reload').mockResolvedValue(undefined);
    const ui = harness();
    if (failure === 'reload') reload.mockRejectedValueOnce(new Error('host rejected reload'));
    else ui.syncBounds.mockRejectedValueOnce(new Error('bounds sync rejected'));

    ui.reload();
    await vi.waitFor(() => expect(renderToStaticMarkup(ui.render()).includes('role="alert"')).toBe(true));
    expect(ui.syncBounds).toHaveBeenCalledTimes(failure === 'reload' ? 0 : 1);

    ui.retry();
    await vi.waitFor(() => expect(ui.syncBounds).toHaveBeenCalledTimes(failure === 'reload' ? 1 : 2));
    expect(reload.mock.calls).toEqual([['meta'], ['meta']]);
    expect(ui.syncBounds).toHaveBeenLastCalledWith('meta');
    expect(ui.onOpenLogin).not.toHaveBeenCalled();
    expect(ui.changeProviderPresentation).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });

  it.each(['standby provider', 'permission denied', 'navigation blocked'])(
    'shows a retryable error after host rejects Login: %s', async (reason) => {
      const onOpenLogin = vi.fn<(provider: AIProvider) => Promise<void>>()
        .mockRejectedValueOnce(new Error(reason))
        .mockResolvedValueOnce(undefined);
      const ui = harness(onOpenLogin);

      await expect(ui.stage().props.onOpenLogin('meta')).resolves.toBeUndefined();
      const failedHtml = renderToStaticMarkup(ui.render());
      expect(failedHtml).toContain('role="alert"');
      expect(failedHtml).toContain('Couldn&#x27;t open Meta AI. Please try again.');
      expect(failedHtml).toContain('Try again');

      ui.retry();
      await vi.waitFor(() => expect(onOpenLogin.mock.calls).toEqual([['meta'], ['meta']]));
      expect(ui.changeProviderPresentation).not.toHaveBeenCalled();
      expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
    },
  );

  it('keeps pane-open retry separate from Login retry', async () => {
    const ui = harness();
    ui.changeProviderPresentation.mockRejectedValueOnce(new Error('open failed'));
    await ui.stage().props.activateProvider('meta');
    expect(renderToStaticMarkup(ui.render())).toContain('role="alert"');
    ui.retry();
    await vi.waitFor(() => expect(ui.changeProviderPresentation.mock.calls).toEqual([
      ['meta', 'center'], ['meta', 'center'],
    ]));
    expect(ui.onOpenLogin).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });

  it('ignores an old Login rejection after a newer provider action succeeds', async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_, rejectPromise) => { reject = rejectPromise; });
    const ui = harness(vi.fn<(provider: AIProvider) => Promise<void>>()
      .mockReturnValueOnce(pending).mockResolvedValueOnce(undefined));
    const first = ui.stage().props.onOpenLogin('meta');
    await ui.stage().props.onOpenLogin('chatgpt');
    reject(new Error('late navigation rejection'));
    await expect(first).resolves.toBeUndefined();
    expect(renderToStaticMarkup(ui.render())).not.toContain('role="alert"');
  });
});
