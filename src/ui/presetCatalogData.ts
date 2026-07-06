import { AI_PROVIDERS, DEFAULT_CODING_ROLES, DEFAULT_CONSULT_ROLES, DEFAULT_DEBATE_ROLES, DEFAULT_ROUNDTABLE_ROLES } from '../../shared/constants';
import type { AIProvider, ChatMode, ModeRoles } from '../../shared/types';

export interface PresetCatalogEntry {
  id: ChatMode;
  graphId: ChatMode;
  displayName: string;
  description: string;
  costLabel: string;
  requiredProviders: AIProvider[];
  estMinutes: number;
  ramHint: 'low' | 'medium' | 'high';
  source: 'builtin' | 'imported' | 'community';
}

const ALL_PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

export const PRESET_CATALOG: PresetCatalogEntry[] = [
  {
    id: 'free',
    graphId: 'free',
    displayName: 'Free fan-out',
    description: 'Use this when you want quick independent answers from the AI you pick. Good for comparison, brainstorming, or a fast second opinion.',
    costLabel: '選定的 AI · <1 min · 低 RAM',
    requiredProviders: [],
    estMinutes: 1,
    ramHint: 'low',
    source: 'builtin',
  },
  {
    id: 'debate',
    graphId: 'debate',
    displayName: 'Debate',
    description: 'Use this when a question needs opposing arguments and a neutral synthesis. You get pro, con, judge, and summary passes.',
    costLabel: '4 AI · 4 logins · 3–5 min · 中 RAM',
    requiredProviders: ALL_PROVIDERS,
    estMinutes: 4,
    ramHint: 'medium',
    source: 'builtin',
  },
  {
    id: 'consult',
    graphId: 'consult',
    displayName: 'Consult',
    description: 'Use this for research-style questions. Two AIs answer first, another checks them, and one produces a concise combined answer.',
    costLabel: '4 AI · ~2 min · 低 RAM',
    requiredProviders: ALL_PROVIDERS,
    estMinutes: 2,
    ramHint: 'low',
    source: 'builtin',
  },
  {
    id: 'coding',
    graphId: 'coding',
    displayName: 'Coding',
    description: 'Use this for implementation work. The run plans, reviews, writes, tests, revises, and finishes a concrete answer.',
    costLabel: '4 AI · 4 logins · 8–12 min · 高 RAM',
    requiredProviders: ALL_PROVIDERS,
    estMinutes: 10,
    ramHint: 'high',
    source: 'builtin',
  },
  {
    id: 'roundtable',
    graphId: 'roundtable',
    displayName: 'Roundtable',
    description: 'Use this when you want a slower multi-round discussion. Four AIs revisit the question across five rounds and converge on takeaways.',
    costLabel: '4 AI · 4 logins · 10–15 min · 高 RAM',
    requiredProviders: ALL_PROVIDERS,
    estMinutes: 12,
    ramHint: 'high',
    source: 'builtin',
  },
];

export function defaultRolesForPreset(mode: ChatMode): ModeRoles | undefined {
  if (mode === 'free') return undefined;
  if (mode === 'debate') return { ...DEFAULT_DEBATE_ROLES };
  if (mode === 'consult') return { ...DEFAULT_CONSULT_ROLES };
  if (mode === 'coding') return { ...DEFAULT_CODING_ROLES };
  return { ...DEFAULT_ROUNDTABLE_ROLES };
}
