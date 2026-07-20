import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { I18nProvider } from '../i18n/context';
import { FocusPane } from '../ui/FocusPane';
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
  stageExpanded,
  stageToggleEnabled = true,
}: {
  stateOverrides?: Partial<Record<AIProvider, Partial<ProviderState>>>;
  presentation?: PresentationByProvider;
  centeredProvider?: AIProvider | null;
  stageExpanded?: boolean;
  stageToggleEnabled?: boolean;
}): string {
  return renderToStaticMarkup(
    <I18nProvider language="en">
      <FocusPane
        centeredProvider={centeredProvider ?? undefined}
        states={states(stateOverrides)}
        presentation={presentation}
        centerSurface="text"
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

  it('renders a four-provider status strip with login and thinking states', () => {
    const html = renderFocusPane({
      presentation: setProviderPresentation(defaultPresentation(), 'chatgpt', 'center'),
      stateOverrides: {
        claude: { login: 'logged_out' },
        gemini: { thinking: true },
      },
    });

    for (const provider of providers) expect(html).toContain(`aria-label="${AI_PROVIDERS[provider].name}:`);
    expect(html).toContain('Claude: Sign in');
    expect(html).toContain('Gemini: Thinking');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('role="button"');
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

  it('offers an honest browser escape hatch when Grok embedded login is blocked', () => {
    const html = renderFocusPane({
      centeredProvider: 'grok',
      stateOverrides: { grok: { login: 'blocked' } },
    });

    expect(html).toContain(
      'Security checks on this site prevent sign-in within the app. Use this AI in your browser, or retry this page later.',
    );
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
