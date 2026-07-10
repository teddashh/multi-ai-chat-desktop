import type { ChatMode, ModeRoles } from '../../shared/types';
import {
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';

export type SerialMode = Exclude<ChatMode, 'free'>;

export function isSerialMode(mode: ChatMode): mode is SerialMode {
  return mode !== 'free';
}

export function defaultRolesForMode(mode: SerialMode): ModeRoles {
  if (mode === 'debate') return { ...DEFAULT_DEBATE_ROLES };
  if (mode === 'consult') return { ...DEFAULT_CONSULT_ROLES };
  if (mode === 'coding') return { ...DEFAULT_CODING_ROLES };
  return { ...DEFAULT_ROUNDTABLE_ROLES };
}
