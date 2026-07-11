import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';

export type WebviewPresentationState = 'chip' | 'side' | 'center';
export type PresentationByProvider = Record<AIProvider, WebviewPresentationState>;

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];
const PRESENTATION_STATES = ['chip', 'side', 'center'] as const satisfies readonly WebviewPresentationState[];

export function isWebviewPresentationState(value: unknown): value is WebviewPresentationState {
  return typeof value === 'string' && PRESENTATION_STATES.includes(value as WebviewPresentationState);
}

export function defaultPresentation(): PresentationByProvider {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider, defaultPresentationState()])) as PresentationByProvider;
}

export function normalizePresentation(value: unknown, _fallback: PresentationByProvider = defaultPresentation()): PresentationByProvider {
  const input = value && typeof value === 'object' ? (value as Partial<Record<AIProvider, unknown>>) : {};
  const next = {} as PresentationByProvider;
  let centerSeen = false;

  for (const provider of PROVIDERS) {
    const candidate = isWebviewPresentationState(input[provider]) ? input[provider] : defaultPresentationState();
    if (candidate === 'center') {
      next[provider] = centerSeen ? 'side' : 'center';
      centerSeen = true;
    } else {
      next[provider] = candidate;
    }
  }

  return next;
}

function defaultPresentationState(): WebviewPresentationState {
  return 'side';
}

export function setProviderPresentation(
  current: PresentationByProvider,
  provider: AIProvider,
  state: WebviewPresentationState,
): PresentationByProvider {
  const normalized = normalizePresentation(current);
  const next = { ...normalized, [provider]: state };
  if (state === 'center') {
    for (const candidate of PROVIDERS) {
      if (candidate !== provider && next[candidate] === 'center') next[candidate] = 'side';
    }
  }
  return normalizePresentation(next);
}

export function centerPresentationProvider(presentation: PresentationByProvider): AIProvider | undefined {
  const normalized = normalizePresentation(presentation);
  return PROVIDERS.find((provider) => normalized[provider] === 'center');
}

export function chipProviders(
  presentation: PresentationByProvider,
  providers: readonly AIProvider[] = PROVIDERS,
): AIProvider[] {
  const normalized = normalizePresentation(presentation);
  return providers.filter((provider) => normalized[provider] === 'chip');
}

export function sideProviders(
  presentation: PresentationByProvider,
  providers: readonly AIProvider[] = PROVIDERS,
): AIProvider[] {
  const normalized = normalizePresentation(presentation);
  return providers.filter((provider) => normalized[provider] === 'side');
}

export function restorableOpenProviders(openProviders: readonly AIProvider[], presentation: PresentationByProvider): AIProvider[] {
  const normalized = normalizePresentation(presentation);
  return openProviders.filter((provider) => normalized[provider] !== 'chip');
}

export function centerHiddenProviders(
  presentation: PresentationByProvider,
  states: Record<AIProvider, ProviderState>,
  userHidden: ReadonlySet<AIProvider>,
  providers: readonly AIProvider[] = PROVIDERS,
  centerTransitionsInFlight: ReadonlySet<AIProvider> = new Set(),
): AIProvider[] {
  const normalized = normalizePresentation(presentation);
  const centered = centerPresentationProvider(normalized);
  if (!centered) return [];
  if (states[centered]?.webview !== 'loaded' && !centerTransitionsInFlight.has(centered)) return [];

  return providers.filter(
    (provider) =>
      provider !== centered &&
      normalized[provider] === 'side' &&
      states[provider]?.webview === 'loaded' &&
      !userHidden.has(provider),
  );
}
