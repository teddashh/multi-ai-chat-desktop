import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { I18nProvider } from '../i18n/context';
import { FocusPane } from '../ui/FocusPane';
import { defaultPresentation } from '../ui/presentation';

const providers = Object.keys(AI_PROVIDERS) as AIProvider[];

function providerState(provider: AIProvider, login: ProviderState['login'] = 'logged_in'): ProviderState {
  return {
    provider,
    webview: 'loaded',
    dom: 'ready',
    login,
    thinking: false,
    lastStatusAt: 1,
  };
}

function states(login: ProviderState['login']): Record<AIProvider, ProviderState> {
  return Object.fromEntries(providers.map((provider) => [provider, providerState(provider, provider === 'chatgpt' ? login : 'logged_in')])) as Record<
    AIProvider,
    ProviderState
  >;
}

function renderHeader(login: ProviderState['login']): string {
  return renderToStaticMarkup(
    <I18nProvider language="en">
      <FocusPane
        centeredProvider="chatgpt"
        sideProviders={[]}
        chipProviders={[]}
        states={states(login)}
        presentation={defaultPresentation()}
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

describe('FocusPane provider header', () => {
  it('renders the login CTA only when the focused provider needs login', () => {
    expect(renderHeader('logged_out')).toContain('Login');
    expect(renderHeader('logged_in')).not.toContain('Login');
  });
});
