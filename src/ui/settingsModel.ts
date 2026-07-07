import type { AIProvider } from '../../shared/types';
import { DEFAULT_COLUMN_WIDTHS, type ColumnWidths, clampColumnWidths } from './dockLayout';
import {
  DEFAULT_SLOT_ASSIGNMENT,
  SLOT_IDS,
  type SlotAssignment,
  normalizeSlotAssignment,
} from './slotAssignment';
import { isSnapshotRedactionTier, type SnapshotRedactionTier } from '../workflow/snapshot/types';
import { defaultPresentation, normalizePresentation, type PresentationByProvider } from './presentation';

export interface AppSettings {
  hackmdToken: string;
  columnWidths: ColumnWidths;
  slotAssignment: SlotAssignment;
  openProviders: AIProvider[];
  adapterChannel: string;
  adapterBaseUrl: string;
  updaterChannel: string;
  portable: boolean;
  telemetry: 'none';
  snapshotPersistence: boolean;
  snapshotRedactionTier: SnapshotRedactionTier;
  presentation: PresentationByProvider;
}

const PROVIDERS: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

export function defaultSettings(): AppSettings {
  return {
    hackmdToken: '',
    columnWidths: { ...DEFAULT_COLUMN_WIDTHS },
    slotAssignment: { ...DEFAULT_SLOT_ASSIGNMENT },
    openProviders: [],
    adapterChannel: 'stable',
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

export function normalizeSettings(value: unknown): AppSettings {
  const defaults = defaultSettings();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Partial<Record<keyof AppSettings, unknown>>;

  return {
    hackmdToken: stringValue(input.hackmdToken, defaults.hackmdToken),
    columnWidths: columnWidths(input.columnWidths, defaults.columnWidths),
    slotAssignment: normalizeSlotAssignment(input.slotAssignment, defaults.slotAssignment),
    openProviders: Array.from(new Set(providerList(input.openProviders))),
    adapterChannel: stringValue(input.adapterChannel, defaults.adapterChannel),
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
