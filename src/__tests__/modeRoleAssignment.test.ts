import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODE_ROLE_ASSIGNMENTS,
  assignModeRole,
  normalizeModeRoleAssignments,
} from '../ui/modeRoleAssignment';
import { defaultRolesForPreset } from '../ui/presetCatalogData';

describe('normalizeModeRoleAssignments', () => {
  it('fills defaults for missing/garbage input', () => {
    expect(normalizeModeRoleAssignments(undefined)).toEqual(DEFAULT_MODE_ROLE_ASSIGNMENTS);
    expect(normalizeModeRoleAssignments({ debate: { pro: 'bogus' } }).debate.pro).toBe(
      DEFAULT_MODE_ROLE_ASSIGNMENTS.debate.pro,
    );
  });

  it('keeps valid overrides and allows the same provider in multiple roles', () => {
    const normalized = normalizeModeRoleAssignments({
      debate: { pro: 'gemini', con: 'claude', judge: 'gemini', summary: 'claude' },
    });
    expect(normalized.debate).toEqual({ pro: 'gemini', con: 'claude', judge: 'gemini', summary: 'claude' });
  });
});

describe('defaultRolesForPreset with custom assignments', () => {
  it('returns the customized roles for the mode', () => {
    const custom = assignModeRole(
      assignModeRole(DEFAULT_MODE_ROLE_ASSIGNMENTS, 'debate', 'pro', 'gemini'),
      'debate',
      'con',
      'claude',
    );
    expect(defaultRolesForPreset('debate', undefined, custom)).toMatchObject({ pro: 'gemini', con: 'claude' });
  });

  it('brainstorm preset uses the roundtable assignment', () => {
    const custom = assignModeRole(DEFAULT_MODE_ROLE_ASSIGNMENTS, 'roundtable', 'first', 'grok');
    expect(defaultRolesForPreset('free', 'brainstorm', custom)).toMatchObject({ first: 'grok' });
  });
});
