import type { AIProvider, ChatMode, ModeRoles, ProviderState } from '../../shared/types';
import {
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';
import { host } from '../host';
import { isSendable } from './sendability';

export interface PreflightResult {
  ok: boolean;
  unavailable: AIProvider[];
  aliased: AIProvider[];
}

export async function preflightSerialMode(mode: Exclude<ChatMode, 'free'>, roles?: ModeRoles): Promise<PreflightResult> {
  // This is a t=0 start gate only; mid-run provider loss is handled by error-as-DONE and step timeout.
  const resolved = resolveRoles(mode, roles);
  const snapshot = await host.connections.get();
  const byProvider = new Map<AIProvider, ProviderState>(snapshot.map((state) => [state.provider, state]));
  const roleProviders = Object.values(resolved) as AIProvider[];
  const unavailable = [...new Set(roleProviders.filter((provider) => !isSendable(byProvider.get(provider) ?? missingState(provider))))];
  const aliased = parallelAliases(mode, resolved);
  return { ok: unavailable.length === 0 && aliased.length === 0, unavailable, aliased };
}

function missingState(provider: AIProvider): ProviderState {
  return { provider, webview: 'none', dom: 'unknown', login: 'unknown', thinking: false, lastStatusAt: 0 };
}

function resolveRoles(mode: Exclude<ChatMode, 'free'>, roles?: ModeRoles): ModeRoles {
  if (roles) return roles;
  if (mode === 'debate') return DEFAULT_DEBATE_ROLES;
  if (mode === 'consult') return DEFAULT_CONSULT_ROLES;
  if (mode === 'coding') return DEFAULT_CODING_ROLES;
  return DEFAULT_ROUNDTABLE_ROLES;
}

function parallelAliases(mode: Exclude<ChatMode, 'free'>, roles: ModeRoles): AIProvider[] {
  if (mode === 'consult') {
    const r = roles as typeof DEFAULT_CONSULT_ROLES;
    return r.first === r.second ? [r.first] : [];
  }
  // Roundtable seats may repeat a provider; only consult's parallel pair must differ.
  return [];
}
