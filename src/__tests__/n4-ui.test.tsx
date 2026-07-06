import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CODING_ROLES, DEFAULT_CONSULT_ROLES, DEFAULT_DEBATE_ROLES, DEFAULT_ROUNDTABLE_ROLES } from '../../shared/constants';
import type { AIProvider, BridgeMessage } from '../../shared/types';
import { ModeSelector } from '../ui/ModeSelector';
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
  it('renders the five built-in cards with cost labels', () => {
    const tree = PresetCatalog({
      mode: 'free',
      onSelectPreset: vi.fn(),
      advancedOpen: false,
      onAdvancedOpenChange: vi.fn(),
    });
    const cardButtons = findAllElements(
      tree,
      (element) => element.type === 'button' && PRESET_CATALOG.some((preset) => textOf(element).includes(preset.displayName)),
    );

    expect(PRESET_CATALOG).toHaveLength(5);
    expect(cardButtons).toHaveLength(5);
    for (const preset of PRESET_CATALOG) {
      const card = cardButtons.find((button) => textOf(button).includes(preset.displayName));
      expect(card).toBeTruthy();
      expect(textOf(card)).toContain(preset.costLabel);
    }
  });

  it('selects the clicked mode and exposes default roles for preset selection', () => {
    const onSelectPreset = vi.fn();
    const tree = PresetCatalog({
      mode: 'free',
      onSelectPreset,
      advancedOpen: false,
      onAdvancedOpenChange: vi.fn(),
    });
    const debateCard = firstElement(tree, (element) => element.type === 'button' && textOf(element).includes('Debate'));

    propsOf(debateCard).onClick?.();

    expect(onSelectPreset).toHaveBeenCalledWith('debate');
    expect(defaultRolesForPreset('debate')).toEqual(DEFAULT_DEBATE_ROLES);
    expect(defaultRolesForPreset('consult')).toEqual(DEFAULT_CONSULT_ROLES);
    expect(defaultRolesForPreset('coding')).toEqual(DEFAULT_CODING_ROLES);
    expect(defaultRolesForPreset('roundtable')).toEqual(DEFAULT_ROUNDTABLE_ROLES);
    expect(defaultRolesForPreset('free')).toBeUndefined();
  });

  it('uses More to reveal the raw ModeSelector drawer', () => {
    const onAdvancedOpenChange = vi.fn();
    const closedTree = PresetCatalog({
      mode: 'free',
      onSelectPreset: vi.fn(),
      advancedOpen: false,
      onAdvancedOpenChange,
      children: <ModeSelector mode="free" onModeChange={vi.fn()} />,
    });
    const more = firstElement(closedTree, (element) => element.type === 'button' && textOf(element).includes('More'));
    const closedDrawer = firstElement(closedTree, (element) => propsOf(element).id === 'advanced-workflow-controls');

    propsOf(more).onClick?.();

    expect(onAdvancedOpenChange).toHaveBeenCalledWith(true);
    expect(propsOf(closedDrawer).hidden).toBe(true);

    const openTree = PresetCatalog({
      mode: 'free',
      onSelectPreset: vi.fn(),
      advancedOpen: true,
      onAdvancedOpenChange: vi.fn(),
      children: <ModeSelector mode="free" onModeChange={vi.fn()} />,
    });
    const openDrawer = firstElement(openTree, (element) => propsOf(element).id === 'advanced-workflow-controls');
    expect(propsOf(openDrawer).hidden).toBe(false);
    expect(renderToStaticMarkup(openTree)).toContain('自由模式');
  });
});

describe('N4 process trace', () => {
  it('reduces role assignments, workflow status, and responses into ordered step rows', () => {
    let trace = createProcessTrace('debate');
    trace = reduceProcessTraceEvent(trace, status('Debate: pro'));
    trace = reduceProcessTraceEvent(trace, role('chatgpt', 'pro', 'Pro', 1));
    trace = reduceProcessTraceEvent(trace, response('chatgpt', 'RESPONSE_DONE'));
    trace = reduceProcessTraceEvent(trace, status('Debate: con'));
    trace = reduceProcessTraceEvent(trace, role('claude', 'con', 'Con', 2));

    expect(trace.currentStatus).toBe('Debate: con');
    expect(trace.steps.map((step) => [step.label, step.status])).toEqual([
      ['Pro · ChatGPT', 'done'],
      ['Con · Claude', 'active'],
    ]);

    const html = renderToStaticMarkup(<ProcessTrace trace={trace} />);
    expect(html).toContain('Process trace');
    expect(html).toContain('Debate: con');
    expect(html).toContain('Pro · ChatGPT');
    expect(html).toContain('Done');
    expect(html).toContain('Active');
  });

  it('renders free fan-out as an aggregate row plus one response row per selected provider', () => {
    let trace = createProcessTrace('free', ['chatgpt', 'gemini']);

    expect(trace.steps.map((step) => [step.label, step.status])).toEqual([
      ['Fan-out', 'active'],
      ['ChatGPT response', 'pending'],
      ['Gemini response', 'pending'],
    ]);

    trace = reduceProcessTraceEvent(trace, response('chatgpt', 'RESPONSE_CHUNK'));
    trace = reduceProcessTraceEvent(trace, response('chatgpt', 'RESPONSE_DONE'));
    trace = reduceProcessTraceEvent(trace, response('gemini', 'RESPONSE_DONE'));

    expect(trace.steps.map((step) => [step.label, step.status])).toEqual([
      ['Fan-out', 'done'],
      ['ChatGPT response', 'done'],
      ['Gemini response', 'done'],
    ]);

    const html = renderToStaticMarkup(<ProcessTrace trace={trace} />);
    expect(html).toContain('Fan-out');
    expect(html).toContain('ChatGPT response');
    expect(html).toContain('Gemini response');
  });
});
