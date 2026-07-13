import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FOCUS_PANE_WIDTH,
  clampFocusPaneWidth,
  dragFocusPaneWidth,
  driveCenteredProviderToStage,
  focusGridTemplateColumns,
  nonEmptyRect,
} from '../ui/focusLayout';
import { applyPresentationTransitionCommand, waitForPresentationTargetBounds, type PresentationCommandHost } from '../ui/presentationCommands';
import { normalizeSettings } from '../ui/settingsModel';

function rect(width: number, height: number): DOMRectReadOnly {
  return { x: 10, y: 20, width, height, top: 20, left: 10, right: 10 + width, bottom: 20 + height, toJSON: () => ({}) };
}

function commandHost(): PresentationCommandHost {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
    setBounds: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
  };
}

describe('focus layout helpers', () => {
  it('clamps focus pane width while preserving control-pane minimum space', () => {
    expect(clampFocusPaneWidth(100, 1400)).toBe(420);
    expect(clampFocusPaneWidth(620.4, 1400)).toBe(620);
    expect(clampFocusPaneWidth(1200, 1000)).toBe(634);
    expect(clampFocusPaneWidth(900, 700)).toBe(420);
  });

  it('emits the focus two-pane grid template string', () => {
    expect(focusGridTemplateColumns(620)).toBe('620px 6px minmax(360px, 1fr)');
    expect(focusGridTemplateColumns(620.6)).toBe('621px 6px minmax(360px, 1fr)');
  });

  it('clamps dragged focus pane width', () => {
    expect(dragFocusPaneWidth(620, -500, 420, 900)).toBe(420);
    expect(dragFocusPaneWidth(620, 500, 420, 900)).toBe(900);
    expect(dragFocusPaneWidth(620, 25, 420, 900)).toBe(645);
  });

  it('filters zero-area rectangles until layout has real bounds', () => {
    const zero = rect(0, 0);
    const zeroWidth = rect(0, 320);
    const zeroHeight = rect(420, 0);
    const real = rect(420, 320);

    expect(nonEmptyRect(null)).toBeUndefined();
    expect(nonEmptyRect(undefined)).toBeUndefined();
    expect(nonEmptyRect(zero)).toBeUndefined();
    expect(nonEmptyRect(zeroWidth)).toBeUndefined();
    expect(nonEmptyRect(zeroHeight)).toBeUndefined();
    expect(nonEmptyRect(real)).toBe(real);
  });

  it('waits past a first-boot 0x0 center rect before opening the provider', async () => {
    const host = commandHost();
    const zero = rect(0, 0);
    const real = rect(760, 440);
    const reads = [zero, real];

    const bounds = await waitForPresentationTargetBounds({
      getBounds: () => nonEmptyRect(reads.shift()),
      waitFrame: async () => {},
    });

    if (bounds) {
      await applyPresentationTransitionCommand({
        host,
        provider: 'grok',
        state: 'center',
        bounds,
        webview: 'none',
      });
    }

    expect(host.open).toHaveBeenCalledWith('grok', real);
    expect(host.open).not.toHaveBeenCalledWith('grok', zero);
    expect(host.setBounds).not.toHaveBeenCalledWith('grok', zero);
  });

  it('drives center-stage resize recovery with loaded-only setBounds and no provider open', async () => {
    const host = commandHost();
    const zero = rect(0, 0);
    const real = rect(760, 440);

    for (const webview of ['none', 'creating', 'loaded'] as const) {
      await driveCenteredProviderToStage({
        provider: 'grok',
        presentation: 'center',
        webview,
        bounds: real,
        setBounds: host.setBounds,
      });
    }

    await driveCenteredProviderToStage({
      provider: 'grok',
      presentation: 'center',
      webview: 'loaded',
      bounds: zero,
      setBounds: host.setBounds,
    });
    await driveCenteredProviderToStage({
      provider: 'grok',
      presentation: 'side',
      webview: 'loaded',
      bounds: real,
      setBounds: host.setBounds,
    });

    expect(host.setBounds).toHaveBeenCalledTimes(1);
    expect(host.setBounds).toHaveBeenCalledWith('grok', real);
    expect(host.setBounds).not.toHaveBeenCalledWith('grok', zero);
    expect(host.open).not.toHaveBeenCalled();
  });

  it('normalizes focus settings and migrates width from legacy left column', () => {
    expect(normalizeSettings({}).focusPaneWidth).toBe(DEFAULT_FOCUS_PANE_WIDTH);
    expect(normalizeSettings({ layoutMode: 'quadrant', focusPaneWidth: 700 }).layoutMode).toBe('focus');
    expect(normalizeSettings({ focusPaneWidth: 250 }).focusPaneWidth).toBe(420);
    expect(normalizeSettings({ columnWidths: { left: 500, right: 320 } }).focusPaneWidth).toBe(500);
  });

  it('normalizes font size: minimum 10, no upper limit, invalid falls back to default', () => {
    expect(normalizeSettings({}).fontSize).toBe(16);
    expect(normalizeSettings({ fontSize: 18 }).fontSize).toBe(18);
    expect(normalizeSettings({ fontSize: 72 }).fontSize).toBe(72);
    expect(normalizeSettings({ fontSize: 8 }).fontSize).toBe(16);
    expect(normalizeSettings({ fontSize: '18' }).fontSize).toBe(16);
    expect(normalizeSettings({ fontSize: Number.NaN }).fontSize).toBe(16);
  });
});
