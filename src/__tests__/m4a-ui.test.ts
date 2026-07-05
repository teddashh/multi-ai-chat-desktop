import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, ProviderState } from '../../shared/types';
import {
  CHAT_MODES,
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';
import { defaultRolesForMode, updateModeRole } from '../ui/modeRoles';
import { OverlayGuardCounter } from '../ui/overlayGuard';
import { buildPreflightDialogModel } from '../ui/preflightModel';
import { preflightFromResult } from '../ui/preflightFromResult';
import { nextStepTimeoutState } from '../ui/stepTimeoutState';
import { defaultTargets, freeModeTargets, toggleTarget } from '../ui/targets';
import { processingAfterSend, processingAfterSettle, processingAfterWorkflowStatus } from '../ui/processing';
import { chooseTimeoutDialogAction } from '../ui/timeoutActions';
import { awaitStepTimeoutAction, resetStepTimeoutForTests } from '../workflow/stepTimeout';

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

function state(provider: AIProvider, sendable = true): ProviderState {
  return {
    provider,
    webview: sendable ? 'loaded' : 'none',
    dom: sendable ? 'ready' : 'unknown',
    login: sendable ? 'logged_in' : 'unknown',
    thinking: false,
    lastStatusAt: 1,
  };
}

function states(overrides: Partial<Record<AIProvider, ProviderState>> = {}): Record<AIProvider, ProviderState> {
  return Object.fromEntries(providers.map((provider) => [provider, overrides[provider] ?? state(provider)])) as Record<
    AIProvider,
    ProviderState
  >;
}

describe('M4a UI helpers', () => {
  beforeEach(() => {
    resetStepTimeoutForTests();
  });

  it('seeds each serial mode from its default roles and single-role updates only mutate that slot', () => {
    expect(defaultRolesForMode('debate')).toEqual(DEFAULT_DEBATE_ROLES);
    expect(defaultRolesForMode('consult')).toEqual(DEFAULT_CONSULT_ROLES);
    expect(defaultRolesForMode('coding')).toEqual(DEFAULT_CODING_ROLES);
    expect(defaultRolesForMode('roundtable')).toEqual(DEFAULT_ROUNDTABLE_ROLES);

    const updated = updateModeRole(DEFAULT_DEBATE_ROLES, 'con', 'gemini');
    expect(updated).toEqual({ ...DEFAULT_DEBATE_ROLES, con: 'gemini' });
    expect(DEFAULT_DEBATE_ROLES.con).toBe('claude');
  });

  it('hides loaded providers once for nested overlays and restores only at count zero', () => {
    const guard = new OverlayGuardCounter();
    const hide = vi.fn();
    const show = vi.fn();
    const host = { hide, show };

    guard.open(['chatgpt', 'claude'], host);
    guard.open(['gemini'], host);
    expect(hide.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'claude']);
    expect(show).not.toHaveBeenCalled();

    guard.close(host);
    expect(show).not.toHaveBeenCalled();

    guard.close(host);
    expect(show.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'claude']);
  });

  it('maps preflight unavailable and aliased providers to labelled dialog rows with reasons', () => {
    const model = buildPreflightDialogModel(
      'debate',
      { ok: false, unavailable: ['chatgpt', 'claude', 'gemini'], aliased: ['grok'] },
      states({
        chatgpt: state('chatgpt', false),
        claude: { ...state('claude'), login: 'logged_out' },
        gemini: { ...state('gemini'), dom: 'unknown' },
      }),
    );

    expect(model.title).toContain('Cannot start');
    expect(model.title).toContain(CHAT_MODES.debate.name);
    expect(model.unavailable.map((item) => [item.provider, item.reason])).toEqual([
      ['chatgpt', 'No webview'],
      ['claude', 'Needs login'],
      ['gemini', 'Stale'],
    ]);
    expect(model.aliased).toEqual([{ provider: 'grok', label: 'Grok', reason: 'two roles resolve to the same provider' }]);
  });

  it('keeps aliased-only preflight actionable through role reassignment', () => {
    const model = buildPreflightDialogModel('consult', { ok: false, unavailable: [], aliased: ['chatgpt'] }, states());

    expect(model.title).toContain(CHAT_MODES.consult.name);
    expect(model.unavailable).toEqual([]);
    expect(model.aliased).toEqual([{ provider: 'chatgpt', label: 'ChatGPT', reason: 'two roles resolve to the same provider' }]);
  });

  it('defaults free targets to all sendable providers and toggles the selected send list', () => {
    const snapshot = states({ claude: state('claude', false) });
    expect(defaultTargets(snapshot, providers)).toEqual(['chatgpt', 'gemini', 'grok']);
    expect(
      defaultTargets(
        states({
          chatgpt: state('chatgpt', false),
          claude: state('claude', false),
          gemini: state('gemini', false),
          grok: state('grok', false),
        }),
        providers,
      ),
    ).toEqual([]);

    let selected = defaultTargets(snapshot, providers);
    selected = toggleTarget(selected, 'gemini');
    expect(freeModeTargets(selected, snapshot)).toEqual(['chatgpt', 'grok']);
    selected = toggleTarget(selected, 'gemini');
    expect(freeModeTargets(selected, snapshot)).toEqual(['chatgpt', 'grok', 'gemini']);
    expect(freeModeTargets([], snapshot)).toEqual([]);
  });

  it('records timeout dialog retry, skip, and cancel actions', async () => {
    for (const action of ['retry', 'skip', 'cancel'] as const) {
      const onClose = vi.fn();
      chooseTimeoutDialogAction(action, onClose);
      expect(onClose).toHaveBeenCalledTimes(1);
      await expect(awaitStepTimeoutAction()).resolves.toBe(action);
    }
  });

  it('reduces step-timeout events into countdown, modal, and settled states', () => {
    const countdown = nextStepTimeoutState(undefined, { provider: 'chatgpt', remainingMs: 600_000, timedOut: false });
    expect(countdown).toEqual({ provider: 'chatgpt', remainingMs: 600_000, timedOut: false });

    const modal = nextStepTimeoutState(countdown, { provider: 'chatgpt', remainingMs: 0, timedOut: true });
    expect(modal).toEqual({ provider: 'chatgpt', remainingMs: 0, timedOut: true });
    expect(nextStepTimeoutState(modal, { type: 'settle' })).toEqual(modal);
    expect(nextStepTimeoutState(countdown, { type: 'settle' })).toBeUndefined();
  });

  it('reconciles loaded providers that appear while an overlay is open', () => {
    const guard = new OverlayGuardCounter();
    const hide = vi.fn();
    const show = vi.fn();
    const host = { hide, show };

    guard.open(['chatgpt'], host);
    guard.reconcile(['chatgpt', 'claude'], host);
    guard.reconcile(['chatgpt', 'claude'], host);
    expect(hide.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'claude']);

    guard.close(host);
    expect(show.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'claude']);
  });

  it('maps serial preflight workflow results and ignores successful or free results', () => {
    const preflight = { ok: false as const, unavailable: ['claude' as AIProvider], aliased: [] };

    expect(preflightFromResult('debate', { ok: false, preflight })).toEqual({ mode: 'debate', result: preflight });
    expect(preflightFromResult('free', { ok: false, preflight })).toBeUndefined();
    expect(preflightFromResult('debate', { ok: true })).toBeUndefined();
  });

  it('derives processing state from send, empty status, and workflow settle', () => {
    expect(processingAfterSend()).toBe(true);
    expect(processingAfterWorkflowStatus(true, 'Debate: pro')).toBe(true);
    expect(processingAfterWorkflowStatus(true, '')).toBe(false);
    expect(processingAfterSettle()).toBe(false);
  });
});
