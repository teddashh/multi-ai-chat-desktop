import { DEFAULT_CONSULT_ROLES } from '../../../shared/constants';
import { SKIP_RESPONSE } from '../state';
import type { NodeId, TextCondition, WorkflowGraph } from './types';

const ERROR_RESPONSE_PATTERN = '^\\[Error:\\s*[\\s\\S]*?\\]$';

function notReady(node: NodeId): TextCondition {
  return {
    type: 'any',
    conditions: [
      { type: 'regex', ref: { kind: 'output', node }, pattern: ERROR_RESPONSE_PATTERN },
      { type: 'equals', left: { kind: 'output', node }, right: { kind: 'literal', text: SKIP_RESPONSE } },
    ],
  };
}

export const consultGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'consult',
  version: 2,
  mode: 'consult',
  start: 'first',
  roles: {
    first: { defaultProvider: DEFAULT_CONSULT_ROLES.first, uiLabel: 'First' },
    second: { defaultProvider: DEFAULT_CONSULT_ROLES.second, uiLabel: 'Second' },
    reviewer: { defaultProvider: DEFAULT_CONSULT_ROLES.reviewer, uiLabel: 'Reviewer' },
    summary: { defaultProvider: DEFAULT_CONSULT_ROLES.summary, uiLabel: 'Summary' },
  },
  preflight: {
    kind: 'serial',
    requiredRoles: ['first', 'second', 'reviewer', 'summary'],
    aliasRules: [{ roles: ['first', 'second'], unique: true, reason: 'parallel' }],
  },
  nodes: {
    first: {
      kind: 'step',
      provider: { type: 'role', role: 'first' },
      role: 'first',
      label: { builder: 'label.consult.first' },
      status: {
        builder: 'status.consult.initial',
        args: [
          { kind: 'providerName', provider: { type: 'role', role: 'first' } },
          { kind: 'providerName', provider: { type: 'role', role: 'second' } },
        ],
      },
      prompt: { builder: 'consult.first', args: [{ kind: 'input', name: 'question' }] },
      output: 'firstResponse',
      policy: 'serialRunStep',
      parallelGroup: 'initial',
    },
    second: {
      kind: 'step',
      provider: { type: 'role', role: 'second' },
      role: 'second',
      label: { builder: 'label.consult.second' },
      status: {
        builder: 'status.consult.initial',
        args: [
          { kind: 'providerName', provider: { type: 'role', role: 'first' } },
          { kind: 'providerName', provider: { type: 'role', role: 'second' } },
        ],
      },
      prompt: { builder: 'consult.second', args: [{ kind: 'input', name: 'question' }] },
      output: 'secondResponse',
      policy: 'serialRunStep',
      parallelGroup: 'initial',
    },
    reviewer: {
      kind: 'step',
      provider: { type: 'role', role: 'reviewer' },
      role: 'reviewer',
      label: { builder: 'label.consult.reviewer' },
      status: { builder: 'status.consult.reviewer' },
      prompt: {
        builder: 'consult.reviewer',
        args: [
          { kind: 'input', name: 'question' },
          { kind: 'output', node: 'first' },
          { kind: 'providerName', provider: { type: 'role', role: 'first' } },
          { kind: 'output', node: 'second' },
          { kind: 'providerName', provider: { type: 'role', role: 'second' } },
        ],
      },
      output: 'reviewerResponse',
      policy: 'serialRunStep',
    },
    summary: {
      kind: 'step',
      provider: { type: 'role', role: 'summary' },
      role: 'summary',
      label: { builder: 'label.consult.summary' },
      status: { builder: 'status.consult.summary' },
      prompt: {
        builder: 'consult.summary',
        args: [
          { kind: 'input', name: 'question' },
          { kind: 'output', node: 'first' },
          { kind: 'providerName', provider: { type: 'role', role: 'first' } },
          { kind: 'output', node: 'second' },
          { kind: 'providerName', provider: { type: 'role', role: 'second' } },
          { kind: 'output', node: 'reviewer' },
          { kind: 'providerName', provider: { type: 'role', role: 'reviewer' } },
        ],
      },
      output: 'summaryResponse',
      policy: 'serialRunStep',
    },
  },
  edges: [
    {
      from: ['first', 'second'],
      to: 'reviewer',
      when: { type: 'not', condition: { type: 'all', conditions: [notReady('first'), notReady('second')] } },
    },
    { from: 'reviewer', to: 'summary' },
  ],
  onComplete: { status: '' },
};
