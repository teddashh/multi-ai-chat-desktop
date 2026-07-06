import type { AIProvider, ModeRoles, ProviderState } from '../../../shared/types';
import { host } from '../../host';
import type { PreflightResult } from '../preflight';
import { isSendable } from '../sendability';
import type { GraphNode, ProviderRef, RoleKey, WorkflowGraph } from './types';

export async function preflightGraph(graph: WorkflowGraph, roles?: ModeRoles | Partial<Record<RoleKey, AIProvider>>): Promise<PreflightResult> {
  if (graph.preflight.kind === 'free') return { ok: true, unavailable: [], aliased: [] };

  const resolved = resolveGraphRoles(graph, roles);
  const requiredRoles = resolveRequiredRoles(graph);
  const snapshot = await host.connections.get();
  const byProvider = new Map<AIProvider, ProviderState>(snapshot.map((state) => [state.provider, state]));
  const unavailable = [
    ...new Set(
      requiredRoles
        .map((role) => providerForRequiredRole(graph, resolved, role))
        .filter((provider) => !isSendable(byProvider.get(provider) ?? missingState(provider))),
    ),
  ];
  const aliased = graph.preflight.aliasRules?.flatMap((rule) => aliasedProviders(resolved, rule.roles)) ?? [];
  return { ok: unavailable.length === 0 && aliased.length === 0, unavailable, aliased };
}

export function resolveGraphRoles(
  graph: WorkflowGraph,
  roles?: ModeRoles | Partial<Record<RoleKey, AIProvider>>,
): Map<RoleKey, AIProvider> {
  const supplied = roles as Partial<Record<RoleKey, AIProvider>> | undefined;
  const resolved = new Map<RoleKey, AIProvider>();
  Object.entries(graph.roles).forEach(([role, config]) => {
    const provider = supplied?.[role] ?? config.defaultProvider;
    if (provider) resolved.set(role, provider);
  });
  return resolved;
}

export function resolveRequiredRoles(graph: WorkflowGraph): RoleKey[] {
  const required = graph.preflight.requiredRoles;
  if (Array.isArray(required)) return [...required];
  if (required === 'allStaticAndPossibleRoles') {
    const roles = new Set<RoleKey>();
    Object.values(graph.nodes).forEach((node) => collectNodeRoles(node, roles));
    return [...roles];
  }
  return Object.keys(graph.roles);
}

function collectNodeRoles(node: GraphNode, roles: Set<RoleKey>): void {
  if (node.kind === 'step') {
    collectProviderRoles(node.provider, roles);
    collectPromptProviderRoles(node.prompt.args, roles);
    return;
  }
  if (node.kind === 'fanout') {
    if (node.over.type === 'roles') node.over.roles.forEach((role) => roles.add(role));
    collectProviderRoles(node.template.provider, roles);
    collectPromptProviderRoles(node.template.prompt.args, roles);
  }
}

function collectPromptProviderRoles(args: { kind: string; provider?: ProviderRef }[], roles: Set<RoleKey>): void {
  args.forEach((arg) => {
    if (arg.provider) collectProviderRoles(arg.provider, roles);
  });
}

function collectProviderRoles(ref: ProviderRef, roles: Set<RoleKey>): void {
  if (ref.type === 'role') roles.add(ref.role);
  else if (ref.type === 'select') ref.possibleRoles.forEach((role) => roles.add(role));
}

function providerForRequiredRole(graph: WorkflowGraph, resolved: Map<RoleKey, AIProvider>, role: RoleKey): AIProvider {
  const provider = resolved.get(role);
  if (!provider) throw new Error(`No provider configured for graph role "${role}" in graph "${graph.id}"`);
  return provider;
}

function aliasedProviders(resolved: Map<RoleKey, AIProvider>, roles: RoleKey[]): AIProvider[] {
  const providers = roles.map((role) => resolved.get(role)).filter((provider): provider is AIProvider => provider !== undefined);
  return providers.filter((provider, index) => providers.indexOf(provider) !== index);
}

function missingState(provider: AIProvider): ProviderState {
  return { provider, webview: 'none', dom: 'unknown', login: 'unknown', thinking: false, lastStatusAt: 0 };
}
