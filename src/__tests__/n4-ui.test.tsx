import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_FREE_TARGET_PROVIDERS,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { t } from '../i18n/t';
import { PresetCatalog } from '../ui/PresetCatalog';
import { ProcessTrace } from '../ui/ProcessTrace';
import { createProcessTrace, reduceProcessTraceEvent } from '../ui/processTraceModel';
import { defaultRolesForPreset, PRESET_CATALOG } from '../ui/presetCatalogData';

interface ElementProps {
  children?: ReactNode;
  id?: string;
  hidden?: boolean;
  onClick?: () => void;
}

function propsOf(element: ReactElement): ElementProps {
  return element.props as ElementProps;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(propsOf(node).children);
  return '';
}

function findAllElements(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAllElements(child, predicate));
  if (!isValidElement(node)) return [];

  const matches = predicate(node) ? [node] : [];
  return [...matches, ...findAllElements(propsOf(node).children, predicate)];
}

function firstElement(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement {
  const match = findAllElements(node, predicate)[0];
  if (!match) throw new Error('Expected element was not found');
  return match;
}

function status(text: string): BridgeMessage {
  return { v: 1, action: 'WORKFLOW_STATUS', payload: text, transport: 'local' };
}

function role(provider: AIProvider, roleName: string, label: string, turn: number): BridgeMessage {
  return { v: 1, action: 'ROLE_ASSIGNMENT', provider, payload: { role: roleName, label, turn }, transport: 'local' };
}

function response(provider: AIProvider, action: 'RESPONSE_CHUNK' | 'RESPONSE_DONE'): BridgeMessage {
  return { v: 1, action, provider, payload: `${provider} response`, transport: 'pull' };
}

describe('N4 preset catalog', () => {
  it.each(['en', 'zh-TW'] as const)('renders the five built-in cards with %s time meta only', (locale) => {
    const tree = PresetCatalog({
      mode: 'free',
      onSelectPreset: vi.fn(),
      locale,
    });
    const cardButtons = findAllElements(
      tree,
      (element) => element.type === 'button' && PRESET_CATALOG.some((preset) => textOf(element).includes(t(preset.displayNameKey, locale))),
    );

    expect(PRESET_CATALOG).toHaveLength(5);
    expect(cardButtons).toHaveLength(5);
    for (const preset of PRESET_CATALOG) {
      const card = cardButtons.find((button) => textOf(button).includes(t(preset.displayNameKey, locale)));
      expect(card).toBeTruthy();
      if (!preset.metaKey) throw new Error(`Missing meta key for ${preset.id}`);
      expect(textOf(card)).toContain(t(preset.metaKey, locale));
      expect(textOf(card)).not.toContain(t(preset.descriptionKey, locale));
      expect(textOf(card)).not.toContain(t(preset.costLabelKey, locale));
      expect(textOf(card)).not.toContain('RAM');
    }
    expect(PRESET_CATALOG.filter((preset) => preset.id !== 'free').map((preset) => preset.requiredProviders)).toEqual(
      Array.from({ length: 4 }, () => [...DEFAULT_FREE_TARGET_PROVIDERS]),
    );
  });

  it('selects the clicked mode and exposes default roles for preset selection', () => {
    const onSelectPreset = vi.fn();
    const tree = PresetCatalog({
      mode: 'free',
      onSelectPreset,
      locale: 'en',
    });
    const debateCard = firstElement(tree, (element) => element.type === 'button' && textOf(element).includes(t('preset.debate.displayName', 'en')));

    propsOf(debateCard).onClick?.();

    expect(onSelectPreset).toHaveBeenCalledWith('debate');
    expect(defaultRolesForPreset('debate')).toEqual(DEFAULT_DEBATE_ROLES);
    expect(defaultRolesForPreset('consult')).toEqual(DEFAULT_CONSULT_ROLES);
    expect(defaultRolesForPreset('coding')).toEqual(DEFAULT_CODING_ROLES);
    expect(defaultRolesForPreset('roundtable')).toEqual(DEFAULT_ROUNDTABLE_ROLES);
    expect(defaultRolesForPreset('free')).toBeUndefined();
  });

  it('renders the catalog as cards only without an advanced raw-controls drawer', () => {
    const tree = PresetCatalog({
      mode: 'free',
      onSelectPreset: vi.fn(),
      locale: 'en',
    });

    expect(findAllElements(tree, (element) => propsOf(element).id === 'advanced-workflow-controls')).toEqual([]);
    expect(findAllElements(tree, (element) => element.type === 'button')).toHaveLength(PRESET_CATALOG.length);
    expect(renderToStaticMarkup(tree)).not.toContain('More');
    expect(renderToStaticMarkup(tree)).not.toContain('raw controls');
  });

  it('uses a two-column compact layout inside the workflow sidebar', () => {
    const html = renderToStaticMarkup(
      <PresetCatalog mode="free" onSelectPreset={vi.fn()} locale="en" layout="sidebar" />,
    );

    expect(html).toContain('grid-cols-2');
    expect(html).toContain('min-h-12');
  });

  it('shows live readiness before the user selects a workflow', () => {
    const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];
    const states = Object.fromEntries(
      providers.map((provider, index) => [
        provider,
        {
          provider,
          webview: index < 2 ? 'loaded' : 'none',
          dom: index < 2 ? 'ready' : 'unknown',
          login: index < 2 ? 'logged_in' : 'unknown',
          thinking: false,
          lastStatusAt: 1,
        } satisfies ProviderState,
      ]),
    ) as Record<AIProvider, ProviderState>;

    const html = renderToStaticMarkup(
      <PresetCatalog mode="free" onSelectPreset={vi.fn()} locale="en" states={states} />,
    );

    expect(html).toContain('2 connected');
    expect(html).toContain('2/4 ready');
  });
});

describe('N4 process trace', () => {
  it.each(['en', 'zh-TW'] as const)('reduces role assignments, workflow status, and responses into ordered %s step rows', (locale) => {
    let trace = createProcessTrace('debate', [], locale);
    trace = reduceProcessTraceEvent(trace, status('Debate: pro'), locale);
    trace = reduceProcessTraceEvent(trace, role('chatgpt', 'pro', 'Pro', 1), locale);
    trace = reduceProcessTraceEvent(trace, response('chatgpt', 'RESPONSE_DONE'), locale);
    trace = reduceProcessTraceEvent(trace, status('Debate: con'), locale);
    trace = reduceProcessTraceEvent(trace, role('claude', 'con', 'Con', 2), locale);

    expect(trace.currentStatus).toBe('Debate: con');
    expect(trace.steps.map((step) => [step.label, step.status])).toEqual([
      ['Pro · ChatGPT', 'done'],
      ['Con · Claude', 'active'],
    ]);

    const html = renderToStaticMarkup(<ProcessTrace trace={trace} locale={locale} />);
    expect(html).toContain(t('processTrace.title', locale));
    expect(html).toContain('Debate: con');
    expect(html).toContain('Pro · ChatGPT');
    expect(html).toContain(t('processTrace.done', locale));
    expect(html).toContain(t('processTrace.active', locale));
  });

  it.each(['en', 'zh-TW'] as const)('renders %s free fan-out as an aggregate row plus one response row per selected provider', (locale) => {
    let trace = createProcessTrace('free', ['chatgpt', 'gemini'], locale);

    expect(trace.steps.map((step) => [step.label, step.status])).toEqual([
      [t('processTrace.fanout', locale), 'active'],
      [`ChatGPT ${t('processTrace.response', locale)}`, 'pending'],
      [`Gemini ${t('processTrace.response', locale)}`, 'pending'],
    ]);

    trace = reduceProcessTraceEvent(trace, response('chatgpt', 'RESPONSE_CHUNK'), locale);
    trace = reduceProcessTraceEvent(trace, response('chatgpt', 'RESPONSE_DONE'), locale);
    trace = reduceProcessTraceEvent(trace, response('gemini', 'RESPONSE_DONE'), locale);

    expect(trace.steps.map((step) => [step.label, step.status])).toEqual([
      [t('processTrace.fanout', locale), 'done'],
      [`ChatGPT ${t('processTrace.response', locale)}`, 'done'],
      [`Gemini ${t('processTrace.response', locale)}`, 'done'],
    ]);

    const html = renderToStaticMarkup(<ProcessTrace trace={trace} locale={locale} />);
    expect(html).toContain(t('processTrace.fanout', locale));
    expect(html).toContain(`ChatGPT ${t('processTrace.response', locale)}`);
    expect(html).toContain(`Gemini ${t('processTrace.response', locale)}`);
  });
});
