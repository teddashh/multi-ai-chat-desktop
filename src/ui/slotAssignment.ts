import type { AIProvider } from '../../shared/types';

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
  return providers.length === 4 && new Set(providers).size === 4;
}

export function normalizeSlotAssignment(value: unknown, fallback: SlotAssignment = DEFAULT_SLOT_ASSIGNMENT): SlotAssignment {
  if (!value || typeof value !== 'object') return { ...fallback };
  const input = value as Partial<Record<SlotId, unknown>>;
  const next: Partial<SlotAssignment> = {};
  const used = new Set<AIProvider>();

  for (const slot of SLOT_IDS) {
    const provider = input[slot];
    if (provider === 'chatgpt' || provider === 'claude' || provider === 'gemini' || provider === 'grok') {
      if (!used.has(provider)) {
        next[slot] = provider;
        used.add(provider);
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
    const provider = (['chatgpt', 'claude', 'gemini', 'grok'] as AIProvider[]).find((candidate) => !used.has(candidate));
    if (provider) next[slot] = provider;
  }

  return next as SlotAssignment;
}

export function assignSlotProvider(assignment: SlotAssignment, slot: SlotId, provider: AIProvider): SlotAssignment {
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
