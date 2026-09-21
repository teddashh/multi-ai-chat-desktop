import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS, DEFAULT_FREE_TARGET_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { I18nProvider } from '../i18n/context';
import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';
import { FocusPane, type CenterSurface } from '../ui/FocusPane';
import { defaultPresentation, setProviderPresentation, type PresentationByProvider } from '../ui/presentation';

const providers = Object.keys(AI_PROVIDERS) as AIProvider[];

function providerState(provider: AIProvider, overrides: Partial<ProviderState> = {}): ProviderState {
  const webview = overrides.webview ?? 'loaded';
  return {
    provider,
    webview,
    dom: webview === 'loaded' ? 'ready' : 'unknown',
    login: webview === 'loaded' ? 'logged_in' : 'unknown',
    thinking: false,
    lastStatusAt: 1,
    bridge: 'ok',
    adapter: 'ok',
    ...overrides,
  };
}

function states(overrides: Partial<Record<AIProvider, Partial<ProviderState>>> = {}): Record<AIProvider, ProviderState> {
  return Object.fromEntries(providers.map((provider) => [provider, providerState(provider, overrides[provider])])) as Record<AIProvider, ProviderState>;
}

function renderFocusPane({
  stateOverrides,
  presentation = defaultPresentation(),
  centeredProvider = 'chatgpt',
  scrollFocusedProvider,
  stageExpanded,
  stageToggleEnabled = true,
  activeProviders,
  language = 'en',
  centerSurface = 'text',
}: {
  stateOverrides?: Partial<Record<AIProvider, Partial<ProviderState>>>;
  presentation?: PresentationByProvider;
  centeredProvider?: AIProvider | null;
  scrollFocusedProvider?: AIProvider;
  stageExpanded?: boolean;
  stageToggleEnabled?: boolean;
  activeProviders?: readonly AIProvider[];
  language?: Locale;
  centerSurface?: CenterSurface;
}): string {
  return renderToStaticMarkup(
    <I18nProvider language={language}>
      <FocusPane
        centeredProvider={centeredProvider ?? undefined}
        scrollFocusedProvider={scrollFocusedProvider}
        states={states(stateOverrides)}
        presentation={presentation}
        centerSurface={centerSurface}
        centerTextFinal={false}
        userHidden={new Set()}
        presentationHidden={new Set()}
        setPaneRef={vi.fn()}
        setCenterStageRef={vi.fn()}
        changeProviderPresentation={vi.fn().mockResolvedValue(undefined)}
        onManualFocusControl={vi.fn()}
        onEnlargeCenter={vi.fn()}
        onCollapseCenter={vi.fn()}
        onOpenLogin={vi.fn().mockResolvedValue(undefined)}
        syncBounds={vi.fn().mockResolvedValue(undefined)}
        reportProvider={vi.fn().mockResolvedValue(undefined)}
        reportBusy={false}
        stageExpanded={stageExpanded}
        onToggleStageExpanded={stageExpanded === undefined || !stageToggleEnabled ? undefined : vi.fn()}
        providers={activeProviders}
      />
    </I18nProvider>,
  );
}

function renderHeader(login: ProviderState['login']): string {
  return renderFocusPane({ stateOverrides: { chatgpt: { login } } });
}

describe('FocusPane provider header', () => {
  it('renders the login CTA only when the focused provider needs login', () => {
    expect(renderHeader('logged_out')).toContain('Login');
    expect(renderHeader('logged_in')).not.toContain('Login');
  });

  it('explains Meta email/mobile login limits without gating a usable guest composer', () => {
    const renderMeta = (login: ProviderState['login']) => renderFocusPane({
      centeredProvider: 'meta',
      activeProviders: ['chatgpt', 'claude', 'gemini', 'meta'],
      presentation: { ...defaultPresentation(), grok: 'chip', meta: 'center' },
      stateOverrides: { meta: { login } },
    });

    for (const login of ['logged_out', 'blocked'] as const) {
      const html = renderMeta(login);
      expect(html).toContain('Complete guest, email/mobile, or Facebook/Instagram sign-in in this window');
      expect(html).toContain('A login in another browser cannot return here');
    }
    expect(renderMeta('logged_in')).not.toContain('Use guest chat or email/mobile login');
    expect(renderHeader('logged_out')).not.toContain('Use guest chat or email/mobile login');
  });

  it.each(['text', 'native'] as const)('keeps translated Meta login guidance outside the webview bounds in %s view', (centerSurface) => {
    for (const language of ['en', 'zh-TW', 'ja', 'de'] as const) {
      const guidance = renderToStaticMarkup(<>{t('provider.metaLoginGuidance', language)}</>);
      const loginLabel = renderToStaticMarkup(<>{t('provider.login', language)}</>);
      const renderMeta = (login: ProviderState['login']) => renderFocusPane({
        language,
        centerSurface,
        centeredProvider: 'meta',
        activeProviders: ['chatgpt', 'claude', 'gemini', 'meta'],
        presentation: { ...defaultPresentation(), grok: 'chip', meta: 'center' },
        stateOverrides: { meta: { login } },
      });

      for (const login of ['logged_out', 'blocked'] as const) {
        const html = renderMeta(login);
        expect(html).toContain(`>${loginLabel}</button>`);
        expect(html).toContain(guidance);
        // The native webview overlays its anchor; guidance must precede that region.
        const anchor = html.indexOf('<div class="flex min-h-0 flex-1 flex-col">');
        expect(anchor).toBeGreaterThan(html.indexOf(guidance));
      }
      for (const login of ['logged_in', 'unknown'] as const) {
        const html = renderMeta(login);
        expect(html).not.toContain(guidance);
        expect(html).not.toContain(`>${loginLabel}</button>`);
      }
    }
  });

  it('renders a four-provider status strip with login and thinking states', () => {
    const html = renderFocusPane({
      presentation: setProviderPresentation(defaultPresentation(), 'chatgpt', 'center'),
      stateOverrides: {
        claude: { login: 'logged_out' },
        gemini: { thinking: true },
      },
    });

    for (const provider of DEFAULT_FREE_TARGET_PROVIDERS) expect(html).toContain(`aria-label="${AI_PROVIDERS[provider].name}:`);
    expect(html).not.toContain('aria-label="Meta AI:');
    expect(html).toContain('Claude: Sign in');
    expect(html).toContain('Gemini: Thinking');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('role="button"');
  });

  it('shows Meta AI only when it replaces the selected standby provider', () => {
    const html = renderFocusPane({
      activeProviders: ['chatgpt', 'claude', 'gemini', 'meta'],
      presentation: { ...defaultPresentation(), grok: 'chip', meta: 'side' },
    });

    expect(html).toContain('aria-label="Meta AI: Ready"');
    expect(html).not.toContain('aria-label="Grok:');
  });

  it('renders a clear first-run provider picker instead of an empty stage', () => {
    const html = renderFocusPane({
      centeredProvider: null,
      stateOverrides: Object.fromEntries(providers.map((provider) => [provider, { webview: 'none' }])) as Partial<
        Record<AIProvider, Partial<ProviderState>>
      >,
    });

    expect(html).toContain('Choose an AI to get started');
    expect(html).toContain('Open ChatGPT');
    expect(html).toContain('Open Grok');
  });

  it('announces the provider that matches the transcript reading position', () => {
    const html = renderFocusPane({ scrollFocusedProvider: 'claude' });

    expect(html).toContain('aria-label="Claude: Ready · Currently reading"');
    expect(html).toContain('title="Claude: Ready · Currently reading"');
    expect(html).not.toContain('aria-label="ChatGPT: Ready · Currently reading"');
  });

  it('exposes the explicit recovery action for an expired Grok bridge', () => {
    const html = renderFocusPane({
      stateOverrides: {
        grok: { dom: 'unknown', login: 'unknown', lastStatusAt: 1 },
      },
    });

    expect(html).toContain('aria-label="Grok: Checking… · Click to reload and recover the connection"');
  });

  it('points the user at the in-pane challenge when Grok is blocked, keeping the browser as a fallback only', () => {
    const html = renderFocusPane({
      centeredProvider: 'grok',
      stateOverrides: { grok: { login: 'blocked' } },
    });

    expect(html).toContain(
      'This site is running a security check. Complete it in this pane; if the status does not update afterwards, reload.',
    );
    // The challenge is solvable in the embedded webview now that the app keeps
    // script evaluation out of challenge documents. Copy that sends the user to
    // the browser instead makes them abandon a login that would have worked.
    expect(html).not.toContain('Use this AI in your browser');
    expect(html).toContain('Open in browser');
  });

  it('keeps system-browser guidance when Gemini embedded login is blocked', () => {
    const html = renderFocusPane({
      centeredProvider: 'gemini',
      stateOverrides: { gemini: { login: 'blocked' } },
    });

    expect(html).toContain(
      'Security checks on this site prevent sign-in within the app. Use this AI in your browser, or retry this page later.',
    );
    expect(html).not.toContain('Complete it in this pane');
    expect(html).toContain('Open in browser');
  });

  it('hides the connection strip while the stage is temporarily expanded so the webview gets the full pane', () => {
    const collapsed = renderFocusPane({ stageExpanded: false });
    const expanded = renderFocusPane({ stageExpanded: true });

    expect(collapsed).toContain('Expand');
    expect(collapsed).toContain('AI connections');
    expect(expanded).toContain('Restore');
    expect(expanded).not.toContain('AI connections');
  });

  it('ignores an expanded state when no restore callback is available', () => {
    const html = renderFocusPane({ stageExpanded: true, stageToggleEnabled: false });

    expect(html).not.toContain('Restore');
    expect(html).toContain('AI connections');
  });

  it('uses a fixed-px stage floor that cannot out-grow the connection strip at large font sizes', () => {
    // min-h-40 (10rem) would scale with the user-configurable, unbounded root font-size
    // and eventually exceed the old 280px floor, pushing the connection strip off-screen again.
    const centered = renderFocusPane({ centeredProvider: 'chatgpt' });
    const firstRun = renderFocusPane({
      centeredProvider: null,
      stateOverrides: Object.fromEntries(providers.map((provider) => [provider, { webview: 'none' }])) as Partial<
        Record<AIProvider, Partial<ProviderState>>
      >,
    });

    for (const html of [centered, firstRun]) {
      expect(html).toContain('min-h-[160px]');
      expect(html).not.toMatch(/min-h-40(?!\d)/);
    }
  });
});
