import { DEFAULT_ROUNDTABLE_ROLES } from '../../../shared/constants';
import type { GraphEdge, StepNode, WorkflowGraph } from './types';

export const ROUND_LABELS = ['開場立論', '交叉質疑', '攻防深化', '核心收斂', '真理浮現'];

const ROUND_COUNT = 5;
const SPEAKERS = ['first', 'second', 'third', 'fourth'] as const;
type RoundtableRole = (typeof SPEAKERS)[number];

function nodeId(round: number, role: RoundtableRole): string {
  return `round${round}_${role}`;
}

function makeRoundtableNode(round: number, role: RoundtableRole): StepNode {
  return {
    kind: 'step',
    provider: { type: 'role', role },
    role: `R${round}`,
    label: `第${round}輪`,
    status: {
      builder: 'status.roundtable.speaker',
      args: [
        { kind: 'literal', value: round },
        { kind: 'literal', value: ROUND_LABELS[round - 1] },
      ],
    },
    prompt: {
      builder: 'roundtable.buildPrompt',
      args: [
        { kind: 'input', name: 'question' },
        { kind: 'literal', value: round },
        { kind: 'providerName', provider: { type: 'role', role } },
        { kind: 'history', name: 'roundtable' },
      ],
    },
    output: `${nodeId(round, role)}Response`,
    policy: 'serialRunStep',
    appendHistory: {
      history: 'roundtable',
      value: {
        round: { kind: 'literal', value: round },
        text: { kind: 'selfOutput' },
      },
    },
  };
}

function orderedRoundtableNodeIds(): string[] {
  const ids: string[] = [];
  for (let round = 1; round <= ROUND_COUNT; round += 1) {
    SPEAKERS.forEach((speaker) => ids.push(nodeId(round, speaker)));
  }
  return ids;
}

function makeRoundtableNodes(): Record<string, StepNode> {
  const nodes: Record<string, StepNode> = {};
  for (let round = 1; round <= ROUND_COUNT; round += 1) {
    SPEAKERS.forEach((speaker) => {
      nodes[nodeId(round, speaker)] = makeRoundtableNode(round, speaker);
    });
  }
  return nodes;
}

function makeRoundtableEdges(ids: string[]): GraphEdge[] {
  return ids.slice(0, -1).map((from, index) => ({ from, to: ids[index + 1] }));
}

const roundtableOrder = orderedRoundtableNodeIds();

export const roundtableGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'roundtable',
  version: 1,
  mode: 'roundtable',
  start: roundtableOrder[0],
  roles: {
    first: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.first, uiLabel: 'First' },
    second: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.second, uiLabel: 'Second' },
    third: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.third, uiLabel: 'Third' },
    fourth: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.fourth, uiLabel: 'Fourth' },
  },
  preflight: {
    kind: 'serial',
    requiredRoles: ['first', 'second', 'third', 'fourth'],
    aliasRules: [{ roles: ['first', 'second', 'third', 'fourth'], unique: true, reason: 'seat' }],
  },
  nodes: makeRoundtableNodes(),
  edges: makeRoundtableEdges(roundtableOrder),
  onComplete: { status: '' },
};
