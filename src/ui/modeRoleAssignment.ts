import type { AIProvider, CodingRoles, ConsultRoles, DebateRoles, RoundtableRoles } from '../../shared/types';
import {
  AI_PROVIDERS,
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';
import type { I18nKey } from '../i18n/keys';

// Per-mode role→provider assignments the user can customize in Settings.
// Roles may reuse the same provider (e.g. a two-AI debate) — the runtime
// preflight (parallelAliases) rejects only the parallel-role collisions.
export interface ModeRoleAssignments {
  debate: DebateRoles;
  consult: ConsultRoles;
  coding: CodingRoles;
  roundtable: RoundtableRoles;
}

export const DEFAULT_MODE_ROLE_ASSIGNMENTS: ModeRoleAssignments = {
  debate: { ...DEFAULT_DEBATE_ROLES },
  consult: { ...DEFAULT_CONSULT_ROLES },
  coding: { ...DEFAULT_CODING_ROLES },
  roundtable: { ...DEFAULT_ROUNDTABLE_ROLES },
};

// Role keys per mode, in execution order — drives the Settings UI rows.
export const MODE_ROLE_FIELDS = {
  debate: ['pro', 'con', 'judge', 'summary'],
  consult: ['first', 'second', 'reviewer', 'summary'],
  coding: ['planner', 'reviewer', 'coder', 'tester'],
  roundtable: ['first', 'second', 'third', 'fourth'],
} as const satisfies Record<keyof ModeRoleAssignments, readonly string[]>;

export const MODE_ROLE_MODE_LABEL_KEYS: Record<keyof ModeRoleAssignments, I18nKey> = {
  debate: 'preset.debate.displayName',
  consult: 'preset.consult.displayName',
  coding: 'preset.coding.displayName',
  roundtable: 'preset.roundtable.displayName',
};

export const MODE_ROLE_LABEL_KEYS: Record<keyof ModeRoleAssignments, Record<string, I18nKey>> = {
  debate: {
    pro: 'workflowRole.debate.pro',
    con: 'workflowRole.debate.con',
    judge: 'workflowRole.debate.judge',
    summary: 'workflowRole.debate.summary',
  },
  consult: {
    first: 'workflowRole.consult.first',
    second: 'workflowRole.consult.second',
    reviewer: 'workflowRole.consult.reviewer',
    summary: 'workflowRole.consult.summary',
  },
  coding: {
    planner: 'settings.modeRoles.coding.planner',
    reviewer: 'settings.modeRoles.coding.reviewer',
    coder: 'settings.modeRoles.coding.coder',
    tester: 'settings.modeRoles.coding.tester',
  },
  roundtable: {
    first: 'settings.modeRoles.roundtable.first',
    second: 'settings.modeRoles.roundtable.second',
    third: 'settings.modeRoles.roundtable.third',
    fourth: 'settings.modeRoles.roundtable.fourth',
  },
};

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

function isProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as AIProvider);
}

export function normalizeModeRoleAssignments(
  value: unknown,
  fallback: ModeRoleAssignments = DEFAULT_MODE_ROLE_ASSIGNMENTS,
): ModeRoleAssignments {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ModeRoleAssignments, unknown>>;
  const out = {} as Record<keyof ModeRoleAssignments, Record<string, AIProvider>>;

  (Object.keys(MODE_ROLE_FIELDS) as (keyof ModeRoleAssignments)[]).forEach((mode) => {
    const supplied = (input[mode] && typeof input[mode] === 'object' ? input[mode] : {}) as Record<string, unknown>;
    const defaults = fallback[mode] as unknown as Record<string, AIProvider>;
    const next: Record<string, AIProvider> = {};
    for (const role of MODE_ROLE_FIELDS[mode]) {
      next[role] = isProvider(supplied[role]) ? supplied[role] : defaults[role];
    }
    out[mode] = next;
  });

  return out as unknown as ModeRoleAssignments;
}

export function assignModeRole(
  assignments: ModeRoleAssignments,
  mode: keyof ModeRoleAssignments,
  role: string,
  provider: AIProvider,
): ModeRoleAssignments {
  return { ...assignments, [mode]: { ...assignments[mode], [role]: provider } };
}
