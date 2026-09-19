import { describe, expect, it } from 'vitest';
import { DEFAULT_FREE_TARGET_PROVIDERS, DEFAULT_STANDBY_PROVIDER } from '../../shared/constants';
import {
  DEFAULT_MODE_ROLE_ASSIGNMENTS,
  replaceModeRoleProvider,
} from '../ui/modeRoleAssignment';
import {
  activeProvidersForStandby,
  defaultSettings,
  normalizeSettings,
} from '../ui/settingsModel';

describe('optional standby provider', () => {
  it('keeps the original four providers active and Meta AI on standby by default', () => {
    const settings = defaultSettings();

    expect(settings.standbyProvider).toBe(DEFAULT_STANDBY_PROVIDER);
    expect(activeProvidersForStandby(settings.standbyProvider)).toEqual(DEFAULT_FREE_TARGET_PROVIDERS);
    expect(settings.presentation.meta).toBe('chip');
  });

  it('repairs invalid standby values to Meta AI and excludes standby from restore-open providers', () => {
    const settings = normalizeSettings({
      standbyProvider: 'not-a-provider',
      openProviders: ['chatgpt', 'meta'],
    });

    expect(settings.standbyProvider).toBe('meta');
    expect(settings.openProviders).toEqual(['chatgpt']);
  });

  it('activates Meta AI when a core provider becomes standby and repairs its workflow seats', () => {
    const settings = normalizeSettings({
      settingsSchemaVersion: 2,
      standbyProvider: 'grok',
      modeRoles: DEFAULT_MODE_ROLE_ASSIGNMENTS,
      openProviders: ['grok', 'meta'],
    });

    expect(activeProvidersForStandby(settings.standbyProvider)).toEqual([
      'chatgpt',
      'claude',
      'gemini',
      'meta',
    ]);
    expect(settings.openProviders).toEqual(['meta']);
    expect(settings.presentation.grok).toBe('chip');
    expect(settings.presentation.meta).toBe('side');
    expect(JSON.stringify(settings.modeRoles)).not.toContain('grok');
    for (const roles of Object.values(settings.modeRoles)) {
      expect(new Set(Object.values(roles))).toEqual(new Set(['chatgpt', 'claude', 'gemini', 'meta']));
    }
  });

  it('does not let a stale standby center consume the active provider center slot', () => {
    const settings = normalizeSettings({
      standbyProvider: 'grok',
      presentation: {
        chatgpt: 'side',
        claude: 'side',
        gemini: 'side',
        grok: 'center',
        meta: 'center',
      },
    });

    expect(settings.presentation.grok).toBe('chip');
    expect(settings.presentation.meta).toBe('center');
  });

  it('moves every seat owned by the newly selected standby to the previous standby', () => {
    const swapped = replaceModeRoleProvider(DEFAULT_MODE_ROLE_ASSIGNMENTS, 'grok', 'meta');

    expect(JSON.stringify(swapped)).not.toContain('grok');
    expect(JSON.stringify(swapped)).toContain('meta');
    expect(DEFAULT_MODE_ROLE_ASSIGNMENTS.debate.judge).toBe('grok');
  });
});
