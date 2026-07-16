import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import type { AIProvider } from '../../../shared/types';
import type { I18nKey } from '../../i18n/keys';
import type { Locale } from '../../i18n/resolve';
import { formatI18n, t } from '../../i18n/t';
import type { HistoryItem, PromptArg, TextCondition, TextRef, TextTemplate, WorkflowGraph } from './types';

export interface PromptBuilderContext {
  graph: WorkflowGraph;
  nodeId?: string;
  provider?: AIProvider;
  targets?: AIProvider[];
  locale?: Locale;
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

const ROUNDTABLE_PHASE_KEYS = [
  'workflowRole.roundtable.phase1',
  'workflowRole.roundtable.phase2',
  'workflowRole.roundtable.phase3',
  'workflowRole.roundtable.phase4',
  'workflowRole.roundtable.phase5',
] as const satisfies readonly I18nKey[];

function uiLocale(context: PromptBuilderContext): Locale {
  return context.locale ?? 'en';
}

function translate(
  key: I18nKey,
  context: PromptBuilderContext,
  values: Record<string, string | number | undefined> = {},
): string {
  return formatI18n(t(key, uiLocale(context)), values);
}

function formatNameList(names: string[], locale: Locale): string {
  const filtered = names.filter(Boolean);
  if (filtered.length < 2) return filtered[0] ?? '';
  if (locale === 'ja') return filtered.join('、');
  const conjunction = locale === 'zh-TW' ? '與' : locale === 'de' ? 'und' : 'and';
  if (filtered.length === 2) return `${filtered[0]} ${conjunction} ${filtered[1]}`;
  const separator = locale === 'zh-TW' ? '、' : ', ';
  const prefix = filtered.slice(0, -1).join(separator);
  if (locale === 'en') return `${prefix}, ${conjunction} ${filtered[filtered.length - 1]}`;
  return `${prefix} ${conjunction} ${filtered[filtered.length - 1]}`;
}

function targetNames(context: PromptBuilderContext): string {
  return formatNameList((context.targets ?? []).map((provider) => AI_PROVIDERS[provider].name), uiLocale(context));
}

function roleLabel(key: I18nKey, context: PromptBuilderContext): string {
  return translate(key, context);
}

function providerStepStatus(icon: string, key: I18nKey, context: PromptBuilderContext): string {
  return translate('workflowStatus.providerStep', context, {
    icon,
    provider: providerName(context.provider),
    step: roleLabel(key, context),
  });
}

function numberedProviderStepStatus(number: number, key: I18nKey, context: PromptBuilderContext): string {
  return translate('workflowStatus.numberedProviderStep', context, {
    number,
    total: 8,
    provider: providerName(context.provider),
    step: roleLabel(key, context),
  });
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
  'status.brainstorm.targets': (_args, context) => translate('workflowStatus.brainstormTargets', context, { providers: targetNames(context) }),
  'free.input': (args) => arg(args, 0),
  'status.free.targets': (_args, context) => translate('workflowStatus.freeTargets', context, { providers: targetNames(context) }),
  'debate.pro': (args) => PROMPTS.debate.pro(arg(args, 0)),
  'debate.con': (args) => PROMPTS.debate.con(arg(args, 0), arg(args, 1)),
  'debate.judge': (args) => PROMPTS.debate.judge(arg(args, 0), arg(args, 1), arg(args, 2)),
  'debate.summary': (args) => PROMPTS.debate.summary(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'label.debate.pro': (_args, context) => roleLabel('workflowRole.debate.pro', context),
  'label.debate.con': (_args, context) => roleLabel('workflowRole.debate.con', context),
  'label.debate.judge': (_args, context) => roleLabel('workflowRole.debate.judge', context),
  'label.debate.summary': (_args, context) => roleLabel('workflowRole.debate.summary', context),
  'status.debate.pro': (_args, context) => providerStepStatus('⚔️', 'workflowRole.debate.pro', context),
  'status.debate.con': (_args, context) => providerStepStatus('⚔️', 'workflowRole.debate.con', context),
  'status.debate.judge': (_args, context) => providerStepStatus('⚔️', 'workflowRole.debate.judge', context),
  'status.debate.summary': (_args, context) => providerStepStatus('⚔️', 'workflowRole.debate.summary', context),
  'consult.first': (args) => PROMPTS.consult.first(arg(args, 0)),
  'consult.second': (args) => PROMPTS.consult.second(arg(args, 0)),
  'consult.reviewer': (args) => PROMPTS.consult.reviewer(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4)),
  'consult.summary': (args) =>
    PROMPTS.consult.summary(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4), arg(args, 5), arg(args, 6)),
  'label.consult.first': (_args, context) => roleLabel('workflowRole.consult.first', context),
  'label.consult.second': (_args, context) => roleLabel('workflowRole.consult.second', context),
  'label.consult.reviewer': (_args, context) => roleLabel('workflowRole.consult.reviewer', context),
  'label.consult.summary': (_args, context) => roleLabel('workflowRole.consult.summary', context),
  'status.consult.initial': (args, context) =>
    translate('workflowStatus.consultInitial', context, {
      providers: formatNameList([arg(args, 0), arg(args, 1)], uiLocale(context)),
    }),
  'status.consult.reviewer': (_args, context) => providerStepStatus('🔍', 'workflowRole.consult.reviewer', context),
  'status.consult.summary': (_args, context) => providerStepStatus('🔍', 'workflowRole.consult.summary', context),
  'coding.plannerSpec': (args) => PROMPTS.coding.plannerSpec(arg(args, 0)),
  'coding.reviewerSpec': (args) => PROMPTS.coding.reviewerSpec(arg(args, 0), arg(args, 1), arg(args, 2)),
  'coding.coderV1': (args) => PROMPTS.coding.coderV1(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4)),
  'coding.reviewerCode': (args) => PROMPTS.coding.reviewerCode(arg(args, 0), arg(args, 1), arg(args, 2)),
  'coding.testerCases': (args) => PROMPTS.coding.testerCases(arg(args, 0), arg(args, 1), arg(args, 2)),
  'coding.coderV2': (args) => PROMPTS.coding.coderV2(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3), arg(args, 4), arg(args, 5)),
  'coding.plannerAcceptance': (args) => PROMPTS.coding.plannerAcceptance(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'coding.coderFinal': (args) => PROMPTS.coding.coderFinal(arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)),
  'label.coding.plannerSpec': (_args, context) => roleLabel('workflowRole.coding.plannerSpec', context),
  'label.coding.reviewerSpec': (_args, context) => roleLabel('workflowRole.coding.reviewerSpec', context),
  'label.coding.coderV1': (_args, context) => roleLabel('workflowRole.coding.coderV1', context),
  'label.coding.reviewerCode': (_args, context) => roleLabel('workflowRole.coding.reviewerCode', context),
  'label.coding.testerCases': (_args, context) => roleLabel('workflowRole.coding.testerCases', context),
  'label.coding.coderV2': (_args, context) => roleLabel('workflowRole.coding.coderV2', context),
  'label.coding.plannerAcceptance': (_args, context) => roleLabel('workflowRole.coding.plannerAcceptance', context),
  'label.coding.coderFinal': (_args, context) => roleLabel('workflowRole.coding.coderFinal', context),
  'status.coding.plannerSpec': (_args, context) => numberedProviderStepStatus(1, 'workflowRole.coding.plannerSpec', context),
  'status.coding.reviewerSpec': (_args, context) => numberedProviderStepStatus(2, 'workflowRole.coding.reviewerSpec', context),
  'status.coding.coderV1': (_args, context) => numberedProviderStepStatus(3, 'workflowRole.coding.coderV1', context),
  'status.coding.reviewerCode': (_args, context) => numberedProviderStepStatus(4, 'workflowRole.coding.reviewerCode', context),
  'status.coding.testerCases': (_args, context) => numberedProviderStepStatus(5, 'workflowRole.coding.testerCases', context),
  'status.coding.coderV2': (_args, context) => numberedProviderStepStatus(6, 'workflowRole.coding.coderV2', context),
  'status.coding.plannerAcceptance': (_args, context) => numberedProviderStepStatus(7, 'workflowRole.coding.plannerAcceptance', context),
  'status.coding.coderFinal': (_args, context) => numberedProviderStepStatus(8, 'workflowRole.coding.coderFinal', context),
  'roundtable.buildPrompt': (args) =>
    PROMPTS.roundtable.buildPrompt(arg(args, 0), numberArg(args, 1), arg(args, 2), historyArg(args, 3)),
  'label.roundtable.round': (args, context) =>
    translate('workflowRole.roundtable.round', context, { round: numberArg(args, 0) }),
  'status.roundtable.speaker': (args, context) => {
    const round = numberArg(args, 0);
    const phaseKey = ROUNDTABLE_PHASE_KEYS[round - 1] ?? ROUNDTABLE_PHASE_KEYS[0];
    return translate('workflowStatus.roundtableSpeaker', context, {
      round,
      phase: roleLabel(phaseKey, context),
      provider: providerName(context.provider),
    });
  },
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
