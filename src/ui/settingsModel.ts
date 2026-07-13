import type { AIProvider } from '../../shared/types';
import { AI_PROVIDERS } from '../../shared/constants';
import { DEFAULT_COLUMN_WIDTHS, type ColumnWidths, clampColumnWidths } from './dockLayout';
import { DEFAULT_FOCUS_PANE_WIDTH, clampFocusPaneWidth } from './focusLayout';
import {
  DEFAULT_SLOT_ASSIGNMENT,
  SLOT_IDS,
  type SlotAssignment,
  normalizeSlotAssignment,
} from './slotAssignment';
import { isSnapshotRedactionTier, type SnapshotRedactionTier } from '../workflow/snapshot/types';
import { defaultPresentation, normalizePresentation, type PresentationByProvider } from './presentation';
import { normalizeLanguageSetting, type LanguageSetting } from '../i18n/resolve';

export interface AppSettings {
  language: LanguageSetting;
  theme: 'light' | 'dark' | 'ai-sister';
  fontSize: number;
  layoutMode: 'focus';
  focusPaneWidth: number;
  columnWidths: ColumnWidths;
  slotAssignment: SlotAssignment;
  openProviders: AIProvider[];
  adapterBaseUrl: string;
  updaterChannel: string;
  portable: boolean;
  telemetry: 'none';
  snapshotPersistence: boolean;
  snapshotRedactionTier: SnapshotRedactionTier;
  presentation: PresentationByProvider;
}

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

export function defaultSettings(): AppSettings {
  return {
    language: 'system',
    theme: 'light',
    fontSize: DEFAULT_FONT_SIZE,
    layoutMode: 'focus',
    focusPaneWidth: DEFAULT_FOCUS_PANE_WIDTH,
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    slotAssignment: { ...DEFAULT_SLOT_ASSIGNMENT },
    openProviders: [],
    adapterBaseUrl: '',
    updaterChannel: 'stable',
    portable: false,
    telemetry: 'none',
    snapshotPersistence: false,
    snapshotRedactionTier: 'metadata-only',
    presentation: defaultPresentation(),
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function providerList(value: unknown): AIProvider[] {
  if (!Array.isArray(value)) return [];
  return value.filter((provider): provider is AIProvider => PROVIDERS.includes(provider));
}

function snapshotRedactionTier(value: unknown, fallback: SnapshotRedactionTier): SnapshotRedactionTier {
  return isSnapshotRedactionTier(value) ? value : fallback;
}

function theme(value: unknown, fallback: AppSettings['theme']): AppSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'ai-sister' ? value : fallback;
}

export const DEFAULT_FONT_SIZE = 16;
// 下限 10px，避免 UI 縮到無法操作；依需求不限制上限。
export const MIN_FONT_SIZE = 10;

function fontSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_FONT_SIZE ? value : DEFAULT_FONT_SIZE;
}

function columnWidths(value: unknown, fallback: ColumnWidths): ColumnWidths {
  if (!value || typeof value !== 'object') return { ...fallback };
  const input = value as Partial<Record<keyof ColumnWidths, unknown>>;
  return clampColumnWidths(
    {
      left: typeof input.left === 'number' ? input.left : fallback.left,
      right: typeof input.right === 'number' ? input.right : fallback.right,
    },
    1400,
  );
}

function legacyFocusPaneWidth(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Partial<Record<keyof ColumnWidths, unknown>>;
  return typeof input.left === 'number' ? input.left : undefined;
}

function focusPaneWidth(value: unknown, legacyColumnWidths: unknown, fallback: number): number {
  const candidate = typeof value === 'number' ? value : legacyFocusPaneWidth(legacyColumnWidths) ?? fallback;
  return clampFocusPaneWidth(candidate, 1400);
}

export function normalizeSettings(value: unknown): AppSettings {
  const defaults = defaultSettings();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Partial<Record<keyof AppSettings, unknown>>;
  const normalizedColumnWidths = columnWidths(input.columnWidths, defaults.columnWidths);

  return {
    language: normalizeLanguageSetting(input.language),
    theme: theme(input.theme, defaults.theme),
    fontSize: fontSize(input.fontSize),
    layoutMode: 'focus',
    focusPaneWidth: focusPaneWidth(input.focusPaneWidth, input.columnWidths, defaults.focusPaneWidth),
    columnWidths: normalizedColumnWidths,
    slotAssignment: normalizeSlotAssignment(input.slotAssignment, defaults.slotAssignment),
    openProviders: Array.from(new Set(providerList(input.openProviders))),
    adapterBaseUrl: stringValue(input.adapterBaseUrl, defaults.adapterBaseUrl),
    updaterChannel: stringValue(input.updaterChannel, defaults.updaterChannel),
    portable: input.portable === true,
    telemetry: 'none',
    snapshotPersistence: input.snapshotPersistence === true,
    snapshotRedactionTier: snapshotRedactionTier(input.snapshotRedactionTier, defaults.snapshotRedactionTier),
    presentation: normalizePresentation(input.presentation, defaults.presentation),
  };
}

export function mergeSettings(loaded: unknown, patch: Partial<AppSettings>): AppSettings {
  return normalizeSettings({ ...normalizeSettings(loaded), ...patch });
}

export function slotProviders(assignment: SlotAssignment, side: 'left' | 'right'): AIProvider[] {
  const slots = side === 'left' ? SLOT_IDS.slice(0, 2) : SLOT_IDS.slice(2);
  return slots.map((slot) => assignment[slot]);
}
