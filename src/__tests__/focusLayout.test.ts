import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOCUS_PANE_WIDTH,
  clampFocusPaneWidth,
  dragFocusPaneWidth,
  focusGridTemplateColumns,
} from '../ui/focusLayout';
import { normalizeSettings } from '../ui/settingsModel';

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

  it('normalizes focus settings and migrates width from legacy left column', () => {
    expect(normalizeSettings({}).focusPaneWidth).toBe(DEFAULT_FOCUS_PANE_WIDTH);
    expect(normalizeSettings({ layoutMode: 'quadrant', focusPaneWidth: 700 }).layoutMode).toBe('focus');
    expect(normalizeSettings({ focusPaneWidth: 250 }).focusPaneWidth).toBe(420);
    expect(normalizeSettings({ columnWidths: { left: 500, right: 320 } }).focusPaneWidth).toBe(500);
  });
});
