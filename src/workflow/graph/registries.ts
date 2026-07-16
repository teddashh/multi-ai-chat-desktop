import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import type { AIProvider } from '../../../shared/types';
import type { HistoryItem, PromptArg, TextCondition, TextRef, TextTemplate, WorkflowGraph } from './types';

export interface PromptBuilderContext {
  graph: WorkflowGraph;
  nodeId?: string;
  provider?: AIProvider;
  targets?: AIProvider[];
}

export interface TextResolverContext {
  resolveTextRef: (ref: TextRef) => string;
}

type PromptBuilderArg = string | number | HistoryItem[] | undefined;
type PromptBuilder = (args: PromptBuilderArg[], context: PromptBuilderContext) => string;
type TextConditionEvaluator = (condition: TextCondition, context: TextResolverContext) => boolean;

function providerName(provider?: AIProvider): string {
  return provider ? AI_PROVIDERS[provider].name : '';
}

function arg(args: PromptBuilderArg[], index: number): string {
  const value = args[index];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function numberArg(args: PromptBuilderArg[], index: number): number {
  const value = args[index];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function historyArg(args: PromptBuilderArg[], index: number): { name: string; round: number; text: string }[] {
  const value = args[index];
  if (!Array.isArray(value)) return [];
  return value as { name: string; round: number; text: string }[];
}

export const promptBuilders: Record<string, PromptBuilder> = {
  'brainstorm.input': (args, context) =>
    PROMPTS.brainstorm.buildPrompt(arg(args, 0), context.provider ?? 'chatgpt'),
  'status.brainstorm.targets': (_args, context) => {
    const targets = context.targets ?? [];
    const names = targets.map((provider) => AI_PROVIDERS[provider].name).join('、');
    return targets.length > 0 ? `✨ ${names} 腦力激盪中...` : '';
  },
  'free.input': (args) => arg(args, 0),
  'status.free.targets': (_args, context) => {
    const targets = context.targets ?? [];
    const names = targets.map((provider) => AI_PROVIDERS[provider].name).join('、');
    return targets.length > 0 ? `⚡ ${names} 同時作答中...` : '';
  },
  'debate.pro': (args) => PROMPTS.debate.pro(arg(args, 0)),
  'debate.con': (args) => PROMPTS.debate.con(arg(args, 0), arg(args, 1)),
  'debate.judge': (args) => PROMPTS.debate.judge(arg(args, 0), arg(args, 1), arg(args, 2)),
  'debate.summary': (args) => PROMPTS.debate.summary(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'status.debate.pro': (_args, context) => `⚔️ 正方 ${providerName(context.provider)} 論述中...`,
  'status.debate.con': (_args, context) => `⚔️ 反方 ${providerName(context.provider)} 反駁中...`,
  'status.debate.judge': (_args, context) => `⚔️ 判官 ${providerName(context.provider)} 評析中...`,
  'status.debate.summary': (_args, context) => `⚔️ ${providerName(context.provider)} 歸納總結中...`,
  'consult.first': (args) => PROMPTS.consult.first(arg(args, 0)),
  'consult.second': (args) => PROMPTS.consult.second(arg(args, 0)),
  'consult.reviewer': (args) => PROMPTS.consult.reviewer(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4)),
  'consult.summary': (args) =>
    PROMPTS.consult.summary(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4), arg(args, 5), arg(args, 6)),
  'status.consult.initial': (args) => `🔍 ${arg(args, 0)} 與 ${arg(args, 1)} 同時回答中...`,
  'status.consult.reviewer': (_args, context) => `🔍 ${providerName(context.provider)} 審查中...`,
  'status.consult.summary': (_args, context) => `🔍 ${providerName(context.provider)} 總結中...`,
  'coding.plannerSpec': (args) => PROMPTS.coding.plannerSpec(arg(args, 0)),
  'coding.reviewerSpec': (args) => PROMPTS.coding.reviewerSpec(arg(args, 0), arg(args, 1), arg(args, 2)),
  'coding.coderV1': (args) => PROMPTS.coding.coderV1(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4)),
  'coding.reviewerCode': (args) => PROMPTS.coding.reviewerCode(arg(args, 0), arg(args, 1), arg(args, 2)),
  'coding.testerCases': (args) => PROMPTS.coding.testerCases(arg(args, 0), arg(args, 1), arg(args, 2)),
  'coding.coderV2': (args) => PROMPTS.coding.coderV2(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4), arg(args, 5)),
  'coding.plannerAcceptance': (args) => PROMPTS.coding.plannerAcceptance(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'coding.coderFinal': (args) => PROMPTS.coding.coderFinal(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'status.coding.plannerSpec': (_args, context) => `💻 Step 1/8 — ${providerName(context.provider)} 撰寫規格中...`,
  'status.coding.reviewerSpec': (_args, context) => `💻 Step 2/8 — ${providerName(context.provider)} 審查規格中...`,
  'status.coding.coderV1': (_args, context) => `💻 Step 3/8 — ${providerName(context.provider)} 撰寫 v1 中...`,
  'status.coding.reviewerCode': (_args, context) => `💻 Step 4/8 — ${providerName(context.provider)} Code Review 中...`,
  'status.coding.testerCases': (_args, context) => `💻 Step 5/8 — ${providerName(context.provider)} 測試分析中...`,
  'status.coding.coderV2': (_args, context) => `💻 Step 6/8 — ${providerName(context.provider)} 修正 → v2 中...`,
  'status.coding.plannerAcceptance': (_args, context) => `💻 Step 7/8 — ${providerName(context.provider)} 驗收中...`,
  'status.coding.coderFinal': (_args, context) => `💻 Step 8/8 — ${providerName(context.provider)} 最終修正中...`,
  'roundtable.buildPrompt': (args) =>
    PROMPTS.roundtable.buildPrompt(arg(args, 0), numberArg(args, 1), arg(args, 2), historyArg(args, 3)),
  'status.roundtable.speaker': (args, context) =>
    `🔄 第${numberArg(args, 0)}輪「${arg(args, 1)}」— ${providerName(context.provider)} 發言中...`,
};

export function hasPromptBuilder(key: string): boolean {
  return key in promptBuilders;
}

export function renderRegisteredTemplate(
  template: TextTemplate,
  args: PromptBuilderArg[],
  context: PromptBuilderContext,
): string {
  if (typeof template === 'string') return template;
  return renderRegisteredPrompt({ builder: template.builder, args: template.args ?? [] }, args, context);
}

export function renderRegisteredPrompt(
  prompt: { builder: string; args: PromptArg[] },
  args: PromptBuilderArg[],
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
