import { describe, expect, it } from 'vitest';
import {
  SESSION_SIDEBAR_COLLAPSED_STORAGE_KEY,
  loadSessionSidebarCollapsed,
  saveSessionSidebarCollapsed,
  type SessionSidebarPreferenceStorage,
} from '../ui/sessionSidebarPreference';

function memoryStorage(initial: string | null = null): SessionSidebarPreferenceStorage & { value: string | null } {
  return {
    value: initial,
    getItem(key) {
      expect(key).toBe(SESSION_SIDEBAR_COLLAPSED_STORAGE_KEY);
      return this.value;
    },
    setItem(key, value) {
      expect(key).toBe(SESSION_SIDEBAR_COLLAPSED_STORAGE_KEY);
      this.value = value;
    },
  };
}

describe('session sidebar preference', () => {
  it('round-trips collapsed and expanded values', () => {
    const storage = memoryStorage();

    expect(saveSessionSidebarCollapsed(true, storage)).toBe(true);
    expect(loadSessionSidebarCollapsed(storage)).toBe(true);
    expect(saveSessionSidebarCollapsed(false, storage)).toBe(true);
    expect(loadSessionSidebarCollapsed(storage)).toBe(false);
  });

  it('falls back safely when storage is unavailable or throws', () => {
    const throwingStorage: SessionSidebarPreferenceStorage = {
      getItem: () => {
        throw new Error('read denied');
      },
      setItem: () => {
        throw new Error('write denied');
      },
    };

    expect(loadSessionSidebarCollapsed(undefined)).toBe(false);
    expect(saveSessionSidebarCollapsed(true, undefined)).toBe(false);
    expect(loadSessionSidebarCollapsed(throwingStorage)).toBe(false);
    expect(saveSessionSidebarCollapsed(true, throwingStorage)).toBe(false);
  });
});
