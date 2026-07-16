import { DEFAULT_DEBATE_ROLES } from '../../../shared/constants';
import type { WorkflowGraph } from './types';

export const debateGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'debate',
  version: 2,
  mode: 'debate',
  start: 'pro',
  roles: {
    pro: { defaultProvider: DEFAULT_DEBATE_ROLES.pro, uiLabel: 'Pro' },
    con: { defaultProvider: DEFAULT_DEBATE_ROLES.con, uiLabel: 'Con' },
    judge: { defaultProvider: DEFAULT_DEBATE_ROLES.judge, uiLabel: 'Judge' },
    summary: { defaultProvider: DEFAULT_DEBATE_ROLES.summary, uiLabel: 'Summary' },
  },
  preflight: { kind: 'serial', requiredRoles: ['pro', 'con', 'judge', 'summary'] },
  nodes: {
    pro: {
      kind: 'step',
      provider: { type: 'role', role: 'pro' },
      role: 'pro',
      label: { builder: 'label.debate.pro' },
      status: { builder: 'status.debate.pro' },
      prompt: { builder: 'debate.pro', args: [{ kind: 'input', name: 'question' }] },
      output: 'proResponse',
      policy: 'serialRunStep',
    },
    con: {
      kind: 'step',
      provider: { type: 'role', role: 'con' },
      role: 'con',
      label: { builder: 'label.debate.con' },
      status: { builder: 'status.debate.con' },
      prompt: {
        builder: 'debate.con',
        args: [
          { kind: 'input', name: 'question' },
          { kind: 'output', node: 'pro' },
        ],
      },
      output: 'conResponse',
      policy: 'serialRunStep',
    },
    judge: {
      kind: 'step',
      provider: { type: 'role', role: 'judge' },
      role: 'judge',
      label: { builder: 'label.debate.judge' },
      status: { builder: 'status.debate.judge' },
      prompt: {
        builder: 'debate.judge',
        args: [
          { kind: 'input', name: 'question' },
          { kind: 'output', node: 'pro' },
          { kind: 'output', node: 'con' },
        ],
      },
      output: 'judgeResponse',
      policy: 'serialRunStep',
    },
    summary: {
      kind: 'step',
      provider: { type: 'role', role: 'summary' },
      role: 'summary',
      label: { builder: 'label.debate.summary' },
      status: { builder: 'status.debate.summary' },
      prompt: {
        builder: 'debate.summary',
        args: [
          { kind: 'input', name: 'question' },
          { kind: 'output', node: 'pro' },
          { kind: 'output', node: 'con' },
          { kind: 'output', node: 'judge' },
        ],
      },
      output: 'summaryResponse',
      policy: 'serialRunStep',
    },
  },
  edges: [
    { from: 'pro', to: 'con' },
    { from: 'con', to: 'judge' },
    { from: 'judge', to: 'summary' },
  ],
  onComplete: { status: '' },
};
