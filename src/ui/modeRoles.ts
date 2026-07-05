import type { AIProvider, ChatMode, ModeRoles } from '../../shared/types';
import {
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';

export type SerialMode = Exclude<ChatMode, 'free'>;

export const ROLE_KEYS: Record<SerialMode, string[]> = {
  debate: ['pro', 'con', 'judge', 'summary'],
  consult: ['first', 'second', 'reviewer', 'summary'],
  coding: ['planner', 'reviewer', 'coder', 'tester'],
  roundtable: ['first', 'second', 'third', 'fourth'],
};

export const ROLE_LABELS: Record<SerialMode, Record<string, string>> = {
  debate: { pro: 'Pro', con: 'Con', judge: 'Judge', summary: 'Summary' },
  consult: { first: 'First', second: 'Second', reviewer: 'Reviewer', summary: 'Summary' },
  coding: { planner: 'Planner', reviewer: 'Reviewer', coder: 'Coder', tester: 'Tester' },
  roundtable: { first: 'First', second: 'Second', third: 'Third', fourth: 'Fourth' },
};

export function isSerialMode(mode: ChatMode): mode is SerialMode {
  return mode !== 'free';
}

export function defaultRolesForMode(mode: SerialMode): ModeRoles {
  if (mode === 'debate') return { ...DEFAULT_DEBATE_ROLES };
  if (mode === 'consult') return { ...DEFAULT_CONSULT_ROLES };
  if (mode === 'coding') return { ...DEFAULT_CODING_ROLES };
  return { ...DEFAULT_ROUNDTABLE_ROLES };
}

export function updateModeRole(roles: ModeRoles, roleKey: string, provider: AIProvider): ModeRoles {
  return { ...roles, [roleKey]: provider } as ModeRoles;
}
