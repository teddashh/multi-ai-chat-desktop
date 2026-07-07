import type { AIProvider } from '../../shared/types';
import { DOCK_SLOT_PROVIDERS } from '../../shared/constants';

export const SLOT_IDS = ['leftTop', 'leftBottom', 'rightTop', 'rightBottom'] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export type SlotAssignment = Record<SlotId, AIProvider>;

export const DEFAULT_SLOT_ASSIGNMENT: SlotAssignment = {
  leftTop: 'chatgpt',
  leftBottom: 'claude',
  rightTop: 'gemini',
  rightBottom: 'grok',
};

export function isProviderPermutation(providers: AIProvider[]): boolean {
  return (
    providers.length === DOCK_SLOT_PROVIDERS.length &&
    new Set(providers).size === DOCK_SLOT_PROVIDERS.length &&
    providers.every((provider) => (DOCK_SLOT_PROVIDERS as readonly AIProvider[]).includes(provider))
  );
}

export function normalizeSlotAssignment(value: unknown, fallback: SlotAssignment = DEFAULT_SLOT_ASSIGNMENT): SlotAssignment {
  if (!value || typeof value !== 'object') return { ...fallback };
  const input = value as Partial<Record<SlotId, unknown>>;
  const next: Partial<SlotAssignment> = {};
  const used = new Set<AIProvider>();

  for (const slot of SLOT_IDS) {
    const provider = input[slot];
    if (typeof provider === 'string' && (DOCK_SLOT_PROVIDERS as readonly string[]).includes(provider)) {
      const providerId = provider as AIProvider;
      if (!used.has(providerId)) {
        next[slot] = providerId;
        used.add(providerId);
      }
    }
  }

  for (const slot of SLOT_IDS) {
    if (next[slot]) continue;
    const provider = fallback[slot];
    if (!used.has(provider)) {
      next[slot] = provider;
      used.add(provider);
    }
  }

  for (const slot of SLOT_IDS) {
    if (next[slot]) continue;
    const provider = (DOCK_SLOT_PROVIDERS as readonly AIProvider[]).find((candidate) => !used.has(candidate));
    if (provider) next[slot] = provider;
  }

  return next as SlotAssignment;
}

export function assignSlotProvider(assignment: SlotAssignment, slot: SlotId, provider: AIProvider): SlotAssignment {
  if (!(DOCK_SLOT_PROVIDERS as readonly AIProvider[]).includes(provider)) return normalizeSlotAssignment(assignment);
  const currentProvider = assignment[slot];
  if (currentProvider === provider) return { ...assignment };

  const otherSlot = SLOT_IDS.find((candidate) => assignment[candidate] === provider);
  if (!otherSlot) return normalizeSlotAssignment({ ...assignment, [slot]: provider });

  return {
    ...assignment,
    [slot]: provider,
    [otherSlot]: currentProvider,
  };
}
