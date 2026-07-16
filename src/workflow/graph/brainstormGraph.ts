import type { WorkflowGraph } from './types';

export const brainstormGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'brainstorm',
  version: 1,
  mode: 'free',
  start: 'fanout',
  roles: {},
  preflight: { kind: 'free' },
  nodes: {
    fanout: {
      kind: 'fanout',
      over: { type: 'targets' },
      template: {
        provider: { type: 'target' },
        status: { builder: 'status.brainstorm.targets' },
        prompt: { builder: 'brainstorm.input', args: [{ kind: 'input', name: 'question' }] },
        output: 'response',
        policy: 'freeSendAndWait',
      },
      output: 'responses',
      join: 'all',
      errorPolicy: 'swallow',
    },
  },
  edges: [],
  onComplete: { status: '' },
};
