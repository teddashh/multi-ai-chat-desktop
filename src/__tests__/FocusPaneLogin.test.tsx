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

function harness(
  onOpenLogin = vi.fn<(provider: AIProvider) => Promise<void>>(),
  { provider = 'meta', login = 'logged_out' }: { provider?: AIProvider; login?: ProviderState['login'] } = {},
) {
  // Retain the parent hooks across renders; child components use React's SSR hooks.
  let actionState: unknown;
  const generation = { current: 0 };
  const changeProviderPresentation = vi.fn().mockResolvedValue(undefined);
  const syncBounds = vi.fn().mockResolvedValue(undefined);
  const states = Object.fromEntries(Object.keys(AI_PROVIDERS).map((provider) => [provider, {
    provider, webview: 'loaded', dom: 'ready', login: 'logged_out',
    thinking: false, lastStatusAt: 1, bridge: 'ok', adapter: 'ok',
  }])) as Record<AIProvider, ProviderState>;
  states[provider].login = login;
  const render = () => {
    vi.mocked(useState).mockImplementationOnce(() => [actionState, (next) => { actionState = next; }]);
    vi.mocked(useRef).mockReturnValueOnce(generation);
    return FocusPane({
      centeredProvider: provider, states,
      presentation: { ...defaultPresentation(), grok: provider === 'meta' ? 'chip' : 'side', [provider]: 'center' },
      providers: ['chatgpt', 'claude', 'gemini', provider === 'meta' ? 'meta' : 'grok'],
      centerSurface: 'native', centerTextFinal: false,
      userHidden: new Set(), presentationHidden: new Set(),
      setPaneRef: vi.fn(), setCenterStageRef: vi.fn(), changeProviderPresentation,
      onManualFocusControl: vi.fn(), onEnlargeCenter: vi.fn(), onCollapseCenter: vi.fn(),
      onOpenLogin, syncBounds,
      reportProvider: vi.fn().mockResolvedValue(undefined), reportBusy: false,
    });
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
  return {
    render, stage, retry, onOpenLogin, changeProviderPresentation, syncBounds,
    reload: () => clickStageButton('Reload', true),
    openInBrowser: () => clickStageButton('Open in browser'),
  };
}

describe('FocusPane provider action failure recovery', () => {
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
