import type { WorkflowGraph } from './types';

export const freeGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'free',
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
        status: { builder: 'status.free.targets' },
        prompt: { builder: 'free.input', args: [{ kind: 'input', name: 'question' }] },
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
