import { useRef, useState, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { t } from '../i18n/t';
import { FocusPane } from '../ui/FocusPane';
import { defaultPresentation } from '../ui/presentation';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState), useRef: vi.fn(react.useRef) };
});

vi.mock('../i18n/context', () => ({
  useI18n: () => ({ locale: 'en', t: (key: Parameters<typeof t>[0]) => t(key, 'en') }),
}));

function harness(onOpenLogin = vi.fn<(provider: AIProvider) => Promise<void>>()) {
  // Retain the parent hooks across renders; child components use React's SSR hooks.
  let actionState: unknown;
  const generation = { current: 0 };
  const changeProviderPresentation = vi.fn().mockResolvedValue(undefined);
  const states = Object.fromEntries(Object.keys(AI_PROVIDERS).map((provider) => [provider, {
    provider, webview: 'loaded', dom: 'ready', login: 'logged_out',
    thinking: false, lastStatusAt: 1, bridge: 'ok', adapter: 'ok',
  }])) as Record<AIProvider, ProviderState>;
  const render = () => {
    vi.mocked(useState).mockImplementationOnce(() => [actionState, (next) => { actionState = next; }]);
    vi.mocked(useRef).mockReturnValueOnce(generation);
    return FocusPane({
      centeredProvider: 'meta', states,
      presentation: { ...defaultPresentation(), grok: 'chip', meta: 'center' },
      providers: ['chatgpt', 'claude', 'gemini', 'meta'],
      centerSurface: 'native', centerTextFinal: false,
      userHidden: new Set(), presentationHidden: new Set(),
      setPaneRef: vi.fn(), setCenterStageRef: vi.fn(), changeProviderPresentation,
      onManualFocusControl: vi.fn(), onEnlargeCenter: vi.fn(), onCollapseCenter: vi.fn(),
      onOpenLogin, syncBounds: vi.fn().mockResolvedValue(undefined),
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
  return { render, stage, retry, onOpenLogin, changeProviderPresentation };
}

describe('FocusPane Login failure recovery', () => {
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
