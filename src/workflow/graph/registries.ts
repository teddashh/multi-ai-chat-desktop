import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import type { AIProvider } from '../../../shared/types';
import type { PromptArg, TextCondition, TextRef, TextTemplate, WorkflowGraph } from './types';

export interface PromptBuilderContext {
  graph: WorkflowGraph;
  nodeId?: string;
  provider?: AIProvider;
}

export interface TextResolverContext {
  resolveTextRef: (ref: TextRef) => string;
}

type PromptBuilder = (args: string[], context: PromptBuilderContext) => string;
type TextConditionEvaluator = (condition: TextCondition, context: TextResolverContext) => boolean;

function providerName(provider?: AIProvider): string {
  return provider ? AI_PROVIDERS[provider].name : '';
}

function arg(args: string[], index: number): string {
  return args[index] ?? '';
}

export const promptBuilders: Record<string, PromptBuilder> = {
  'debate.pro': (args) => PROMPTS.debate.pro(arg(args, 0)),
  'debate.con': (args) => PROMPTS.debate.con(arg(args, 0), arg(args, 1)),
  'debate.judge': (args) => PROMPTS.debate.judge(arg(args, 0), arg(args, 1), arg(args, 2)),
  'debate.summary': (args) => PROMPTS.debate.summary(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'status.debate.pro': (_args, context) => `⚔️ 正方 ${providerName(context.provider)} 論述中...`,
  'status.debate.con': (_args, context) => `⚔️ 反方 ${providerName(context.provider)} 反駁中...`,
  'status.debate.judge': (_args, context) => `⚔️ 判官 ${providerName(context.provider)} 評析中...`,
  'status.debate.summary': (_args, context) => `⚔️ ${providerName(context.provider)} 歸納總結中...`,
};

export function hasPromptBuilder(key: string): boolean {
  return key in promptBuilders;
}

export function renderRegisteredTemplate(
  template: TextTemplate,
  args: string[],
  context: PromptBuilderContext,
): string {
  if (typeof template === 'string') return template;
  return renderRegisteredPrompt({ builder: template.builder, args: template.args ?? [] }, args, context);
}

export function renderRegisteredPrompt(
  prompt: { builder: string; args: PromptArg[] },
  args: string[],
  context: PromptBuilderContext,
): string {
  const builder = promptBuilders[prompt.builder];
  if (!builder) throw new Error(`Unknown prompt builder: ${prompt.builder}`);
  return builder(args, context);
}

function normalize(value: string, mode?: 'trim' | 'lower' | 'whitespace'): string {
  if (mode === 'trim') return value.trim();
  if (mode === 'lower') return value.toLowerCase();
  if (mode === 'whitespace') return value.replace(/\s+/g, ' ').trim();
  return value;
}

function tokenJaccard(left: string, right: string): number {
  const leftTokens = new Set(left.toLowerCase().split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.toLowerCase().split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export const textConditionEvaluators: Record<string, TextConditionEvaluator> = {
  always: () => true,
  textIncludes: (condition, context) => {
    if (condition.type !== 'textIncludes') return false;
    const haystack = context.resolveTextRef(condition.ref);
    if (condition.caseSensitive) return haystack.includes(condition.value);
    return haystack.toLowerCase().includes(condition.value.toLowerCase());
  },
  regex: (condition, context) => {
    if (condition.type !== 'regex') return false;
    return new RegExp(condition.pattern, condition.flags).test(context.resolveTextRef(condition.ref));
  },
  equals: (condition, context) => {
    if (condition.type !== 'equals') return false;
    const left = normalize(context.resolveTextRef(condition.left), condition.normalize);
    const right = normalize(context.resolveTextRef(condition.right), condition.normalize);
    return left === right;
  },
  similarityAtLeast: (condition, context) => {
    if (condition.type !== 'similarityAtLeast') return false;
    const left = context.resolveTextRef(condition.left);
    const right = context.resolveTextRef(condition.right);
    return tokenJaccard(left, right) >= condition.threshold;
  },
  all: (condition, context) => {
    if (condition.type !== 'all') return false;
    return condition.conditions.every((child) => evaluateTextCondition(child, context));
  },
  any: (condition, context) => {
    if (condition.type !== 'any') return false;
    return condition.conditions.some((child) => evaluateTextCondition(child, context));
  },
  not: (condition, context) => {
    if (condition.type !== 'not') return false;
    return !evaluateTextCondition(condition.condition, context);
  },
};

export function hasTextConditionEvaluator(type: string): boolean {
  return type in textConditionEvaluators;
}

export function evaluateTextCondition(condition: TextCondition, context: TextResolverContext): boolean {
  const evaluator = textConditionEvaluators[condition.type];
  if (!evaluator) throw new Error(`Unknown text condition: ${condition.type}`);
  return evaluator(condition, context);
}
