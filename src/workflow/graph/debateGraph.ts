import { DEFAULT_DEBATE_ROLES } from '../../../shared/constants';
import type { WorkflowGraph } from './types';

export const debateGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'debate',
  version: 2,
  mode: 'debate',
  start: 'pro',
  roles: {
    pro: { defaultProvider: DEFAULT_DEBATE_ROLES.pro, uiLabel: 'Pro', runtimeLabel: '正方' },
    con: { defaultProvider: DEFAULT_DEBATE_ROLES.con, uiLabel: 'Con', runtimeLabel: '反方' },
    judge: { defaultProvider: DEFAULT_DEBATE_ROLES.judge, uiLabel: 'Judge', runtimeLabel: '判官' },
    summary: { defaultProvider: DEFAULT_DEBATE_ROLES.summary, uiLabel: 'Summary', runtimeLabel: '總結' },
  },
  preflight: { kind: 'serial', requiredRoles: ['pro', 'con', 'judge', 'summary'] },
  nodes: {
    pro: {
      kind: 'step',
      provider: { type: 'role', role: 'pro' },
      role: 'pro',
      label: '正方',
      status: { builder: 'status.debate.pro' },
      prompt: { builder: 'debate.pro', args: [{ kind: 'input', name: 'question' }] },
      output: 'proResponse',
      policy: 'serialRunStep',
    },
    con: {
      kind: 'step',
      provider: { type: 'role', role: 'con' },
      role: 'con',
      label: '反方',
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
      label: '判官',
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
      label: '總結',
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
