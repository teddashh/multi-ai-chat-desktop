import { BRAINSTORM_ROUND_COUNT, DEFAULT_ROUNDTABLE_ROLES } from '../../../shared/constants';
import type { GraphEdge, StepNode, WorkflowGraph } from './types';

const SPEAKERS = ['first', 'second', 'third', 'fourth'] as const;
type BrainstormRole = (typeof SPEAKERS)[number];

function nodeId(round: number, role: BrainstormRole): string {
  return `round${round}_${role}`;
}

function speakersForRound(round: number): BrainstormRole[] {
  const offset = (round - 1) % SPEAKERS.length;
  return Array.from({ length: SPEAKERS.length }, (_, index) => SPEAKERS[(offset + index) % SPEAKERS.length]);
}

function makeBrainstormNode(round: number, role: BrainstormRole, speakerPosition: number): StepNode {
  return {
    kind: 'step',
    provider: { type: 'role', role },
    role: `B${round}`,
    label: {
      builder: 'label.brainstorm.round',
      args: [{ kind: 'literal', value: round }],
    },
    status: {
      builder: 'status.brainstorm.round',
      args: [
        { kind: 'literal', value: round },
        { kind: 'literal', value: speakerPosition },
      ],
    },
    prompt: {
      builder: 'brainstorm.buildPrompt',
      args: [
        { kind: 'input', name: 'question' },
        { kind: 'literal', value: round },
        { kind: 'literal', value: speakerPosition },
        { kind: 'history', name: 'brainstorm' },
      ],
    },
    output: `${nodeId(round, role)}Response`,
    policy: 'serialRunStep',
    appendHistory: {
      history: 'brainstorm',
      value: {
        round: { kind: 'literal', value: round },
        text: { kind: 'selfOutput' },
      },
    },
  };
}

function orderedBrainstormSeats(): { round: number; role: BrainstormRole; speakerPosition: number }[] {
  const seats: { round: number; role: BrainstormRole; speakerPosition: number }[] = [];
  for (let round = 1; round <= BRAINSTORM_ROUND_COUNT; round += 1) {
    speakersForRound(round).forEach((role, index) => {
      seats.push({ round, role, speakerPosition: index + 1 });
    });
  }
  return seats;
}

function makeBrainstormNodes(): Record<string, StepNode> {
  return Object.fromEntries(
    brainstormOrder.map(({ round, role, speakerPosition }) => [
      nodeId(round, role),
      makeBrainstormNode(round, role, speakerPosition),
    ]),
  );
}

function makeBrainstormEdges(): GraphEdge[] {
  const ids = brainstormOrder.map(({ round, role }) => nodeId(round, role));
  return ids.slice(0, -1).map((from, index) => ({ from, to: ids[index + 1] }));
}

const brainstormOrder = orderedBrainstormSeats();

export const brainstormGraph: WorkflowGraph = {
  schemaVersion: 1,
  id: 'brainstorm',
  version: 2,
  mode: 'free',
  start: nodeId(brainstormOrder[0].round, brainstormOrder[0].role),
  roles: {
    first: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.first, uiLabel: 'First' },
    second: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.second, uiLabel: 'Second' },
    third: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.third, uiLabel: 'Third' },
    fourth: { defaultProvider: DEFAULT_ROUNDTABLE_ROLES.fourth, uiLabel: 'Fourth' },
  },
  preflight: {
    kind: 'serial',
    // Seats may share a provider: only three providers have working default logins.
    requiredRoles: ['first', 'second', 'third', 'fourth'],
  },
  nodes: makeBrainstormNodes(),
  edges: makeBrainstormEdges(),
  onComplete: { status: '' },
};
