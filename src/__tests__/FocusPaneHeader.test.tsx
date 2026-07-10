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
}: {
  stateOverrides?: Partial<Record<AIProvider, Partial<ProviderState>>>;
  presentation?: PresentationByProvider;
}): string {
  return renderToStaticMarkup(
    <I18nProvider language="en">
      <FocusPane
        centeredProvider="chatgpt"
        states={states(stateOverrides)}
        presentation={presentation}
        centerSurface="text"
        centerTextFinal={false}
        userHidden={new Set()}
        presentationHidden={new Set()}
        setPaneRef={vi.fn()}
        setCenterStageRef={vi.fn()}
        openProvider={vi.fn().mockResolvedValue(undefined)}
        changeProviderPresentation={vi.fn().mockResolvedValue(undefined)}
        onManualFocusControl={vi.fn()}
        onEnlargeCenter={vi.fn()}
        onCollapseCenter={vi.fn()}
        onOpenLogin={vi.fn().mockResolvedValue(undefined)}
        syncBounds={vi.fn().mockResolvedValue(undefined)}
        reportProvider={vi.fn().mockResolvedValue(undefined)}
        reportBusy={false}
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

  it('renders a five-provider status strip with login and thinking states', () => {
    const html = renderFocusPane({
      presentation: setProviderPresentation(defaultPresentation(), 'chatgpt', 'center'),
      stateOverrides: {
        claude: { login: 'logged_out' },
        gemini: { thinking: true },
      },
    });

    expect(html.match(/role="button"/g) ?? []).toHaveLength(providers.length);
    expect(html).toContain('Claude: needs-login');
    expect(html).toContain('Gemini: Thinking');
    expect(html).toContain('aria-current="true"');
  });
});
