import {
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_FREE_TARGET_PROVIDERS,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';
import type { AIProvider, ChatMode, ModeRoles, WorkflowPresetId } from '../../shared/types';
import type { I18nKey } from '../i18n/keys';

export interface PresetCatalogEntry {
  id: WorkflowPresetId;
  graphId: ChatMode;
  displayNameKey: I18nKey;
  metaKey?: I18nKey;
  descriptionKey: I18nKey;
  costLabelKey: I18nKey;
  requiredProviders: AIProvider[];
  estMinutes: number;
  ramHint: 'low' | 'medium' | 'high';
  source: 'builtin' | 'imported' | 'community';
}

const DEFAULT_REQUIRED_PROVIDERS = [...DEFAULT_FREE_TARGET_PROVIDERS] as AIProvider[];

export const PRESET_CATALOG: PresetCatalogEntry[] = [
  {
    id: 'free',
    graphId: 'free',
    displayNameKey: 'preset.free.displayName',
    metaKey: 'preset.free.meta',
    descriptionKey: 'preset.free.description',
    costLabelKey: 'preset.free.costLabel',
    requiredProviders: [],
    estMinutes: 1,
    ramHint: 'low',
    source: 'builtin',
  },
  {
    id: 'debate',
    graphId: 'debate',
    displayNameKey: 'preset.debate.displayName',
    metaKey: 'preset.debate.meta',
    descriptionKey: 'preset.debate.description',
    costLabelKey: 'preset.debate.costLabel',
    requiredProviders: DEFAULT_REQUIRED_PROVIDERS,
    estMinutes: 4,
    ramHint: 'medium',
    source: 'builtin',
  },
  {
    id: 'consult',
    graphId: 'consult',
    displayNameKey: 'preset.consult.displayName',
    metaKey: 'preset.consult.meta',
    descriptionKey: 'preset.consult.description',
    costLabelKey: 'preset.consult.costLabel',
    requiredProviders: DEFAULT_REQUIRED_PROVIDERS,
    estMinutes: 2,
    ramHint: 'low',
    source: 'builtin',
  },
  {
    id: 'coding',
    graphId: 'coding',
    displayNameKey: 'preset.coding.displayName',
    metaKey: 'preset.coding.meta',
    descriptionKey: 'preset.coding.description',
    costLabelKey: 'preset.coding.costLabel',
    requiredProviders: DEFAULT_REQUIRED_PROVIDERS,
    estMinutes: 10,
    ramHint: 'high',
    source: 'builtin',
  },
  {
    id: 'roundtable',
    graphId: 'roundtable',
    displayNameKey: 'preset.roundtable.displayName',
    metaKey: 'preset.roundtable.meta',
    descriptionKey: 'preset.roundtable.description',
    costLabelKey: 'preset.roundtable.costLabel',
    requiredProviders: DEFAULT_REQUIRED_PROVIDERS,
    estMinutes: 12,
    ramHint: 'high',
    source: 'builtin',
  },
  {
    id: 'brainstorm',
    graphId: 'free',
    displayNameKey: 'preset.brainstorm.displayName',
    metaKey: 'preset.brainstorm.meta',
    descriptionKey: 'preset.brainstorm.description',
    costLabelKey: 'preset.brainstorm.costLabel',
    requiredProviders: DEFAULT_REQUIRED_PROVIDERS,
    estMinutes: 10,
    ramHint: 'medium',
    source: 'builtin',
  },
];

export function presetForId(presetId: WorkflowPresetId): PresetCatalogEntry {
  return PRESET_CATALOG.find((preset) => preset.id === presetId) ?? PRESET_CATALOG[0];
}

export function defaultRolesForPreset(mode: ChatMode, presetId?: WorkflowPresetId): ModeRoles | undefined {
  if (presetId === 'brainstorm') return { ...DEFAULT_ROUNDTABLE_ROLES };
  if (mode === 'free') return undefined;
  if (mode === 'debate') return { ...DEFAULT_DEBATE_ROLES };
  if (mode === 'consult') return { ...DEFAULT_CONSULT_ROLES };
  if (mode === 'coding') return { ...DEFAULT_CODING_ROLES };
  return { ...DEFAULT_ROUNDTABLE_ROLES };
}
