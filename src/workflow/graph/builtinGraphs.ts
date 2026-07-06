import type { ChatMode } from '../../../shared/types';
import { codingGraph } from './codingGraph';
import { consultGraph } from './consultGraph';
import { debateGraph } from './debateGraph';
import { freeGraph } from './freeGraph';
import { roundtableGraph } from './roundtableGraph';
import type { WorkflowGraph } from './types';

export const workflowGraphs: Record<ChatMode, WorkflowGraph> = {
  free: freeGraph,
  debate: debateGraph,
  consult: consultGraph,
  coding: codingGraph,
  roundtable: roundtableGraph,
};
