import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../shared/types';
import { host } from '../host';
import { t } from '../i18n/t';
import { ReplayPanel } from '../ui/ReplayPanel';
import { getLastSnapshot } from '../workflow/snapshot/recorder';
import { replaySnapshot } from '../workflow/snapshot/replay';
import type { ExecutionSnapshot, RedactedValueRef } from '../workflow/snapshot/types';

vi.mock('../host', () => ({
  host: {
    provider: {
      openLogin: vi.fn(),
    },
    snapshot: {
      list: vi.fn(),
      load: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../workflow/snapshot/recorder', () => ({
  getLastSnapshot: vi.fn(),
}));

vi.mock('../workflow/snapshot/replay', () => ({
  parseStoredSnapshot: vi.fn((json: string) => JSON.parse(json)),
  planReplay: vi.fn(() => undefined),
  replaySnapshot: vi.fn(),
}));

interface ElementProps {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  onChange?: (event: { target: { value: string } }) => void;
  placeholder?: string;
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

function buttonWithText(node: ReactNode, text: string): ReactElement {
  return firstElement(node, (element) => element.type === 'button' && textOf(element).includes(text));
}

describe('ReplayPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLastSnapshot).mockReturnValue(undefined);
    vi.mocked(host.snapshot.list).mockResolvedValue([]);
    vi.mocked(host.snapshot.load).mockResolvedValue(null);
    vi.mocked(host.snapshot.delete).mockResolvedValue(undefined);
    vi.mocked(host.provider.openLogin).mockResolvedValue(undefined);
    vi.mocked(replaySnapshot).mockResolvedValue({
      ok: true,
      plan: {
        roles: {},
        needsQuestion: false,
        textComparable: true,
      },
    });
  });

  it('renders Replay last run when a last snapshot exists and replays the in-memory snapshot', async () => {
    const snapshot = buildSnapshot({ snapshotId: 'snapshot-last' });
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    const panel = new ReplayPanel({});
    const tree = panel.render();

    expect(renderToStaticMarkup(tree)).toContain(t('replay.lastRun', 'en'));

    propsOf(buttonWithText(tree, t('replay.lastRun', 'en'))).onClick?.();

    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenCalledWith(
        { snapshot },
        { replayWithCurrentGraph: undefined, onSnapshotComplete: undefined, locale: 'en', responseLanguagePolicy: undefined },
      ),
    );
  });

  it('renders stored snapshots newest first and wires replay and delete actions', async () => {
    vi.mocked(host.snapshot.list).mockResolvedValue([
      { id: 'snapshot-old', graphId: 'free', createdAt: '2026-07-05T00:00:00.000Z' },
      { id: 'snapshot-new', graphId: 'debate', createdAt: '2026-07-06T00:00:00.000Z' },
    ]);
    const panel = new ReplayPanel({});

    await panel.refreshStoredSnapshots();
    const tree = panel.render();
    const html = renderToStaticMarkup(tree);

    expect(html.indexOf('snapshot-new')).toBe(-1);
    expect(html.indexOf('debate')).toBeLessThan(html.indexOf('free'));

    propsOf(buttonWithText(tree, t('replay.replay', 'en'))).onClick?.();
    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenCalledWith(
        { snapshotId: 'snapshot-new' },
        { replayWithCurrentGraph: undefined, onSnapshotComplete: undefined, locale: 'en', responseLanguagePolicy: undefined },
      ),
    );

    propsOf(buttonWithText(panel.render(), t('replay.delete', 'en'))).onClick?.();
    await vi.waitFor(() => expect(host.snapshot.delete).toHaveBeenCalledWith('snapshot-new'));
  });

  it('asks for the original question and re-invokes replay with the supplied question', async () => {
    const snapshot = buildSnapshot();
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot)
      .mockResolvedValueOnce({ ok: false, blocked: 'question-required' })
      .mockResolvedValueOnce({
        ok: true,
        plan: {
          roles: {},
          needsQuestion: true,
          textComparable: false,
          question: 'original question',
        },
      });
    const panel = new ReplayPanel({});

    propsOf(buttonWithText(panel.render(), t('replay.lastRun', 'en'))).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const blockedTree = panel.render();
    expect(renderToStaticMarkup(blockedTree)).toContain(t('replay.originalQuestionRequired', 'en'));
    propsOf(firstElement(blockedTree, (element) => element.type === 'input' && propsOf(element).placeholder === t('replay.originalQuestion', 'en'))).onChange?.({
      target: { value: 'original question' },
    });
    propsOf(firstElement(panel.render(), (element) => element.type === 'form')).onSubmit?.({ preventDefault: vi.fn() });

    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenLastCalledWith(
        { snapshot, question: 'original question' },
        { replayWithCurrentGraph: undefined, onSnapshotComplete: undefined, locale: 'en', responseLanguagePolicy: undefined },
      ),
    );
  });

  it('confirms graph version mismatches before replaying with the current graph', async () => {
    const snapshot = buildSnapshot({ graphVersion: 1 });
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot)
      .mockResolvedValueOnce({
        ok: false,
        blocked: 'graph-version-mismatch',
        detail: { snapshotVersion: 1, currentVersion: 2 },
      })
      .mockResolvedValueOnce({
        ok: true,
        plan: {
          roles: {},
          needsQuestion: false,
          textComparable: true,
        },
      });
    const panel = new ReplayPanel({});

    propsOf(buttonWithText(panel.render(), t('replay.lastRun', 'en'))).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const blockedTree = panel.render();
    expect(renderToStaticMarkup(blockedTree)).toContain(t('replay.graphVersionChanged', 'en'));
    propsOf(buttonWithText(blockedTree, t('replay.replayWithCurrentGraph', 'en'))).onClick?.();

    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenLastCalledWith(
        { snapshot },
        { replayWithCurrentGraph: true, onSnapshotComplete: undefined, locale: 'en', responseLanguagePolicy: undefined },
      ),
    );
  });

  it('shows preflight unavailable providers and does not re-invoke replay', async () => {
    const snapshot = buildSnapshot();
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false,
      blocked: 'preflight',
      preflight: { ok: false, unavailable: ['claude', 'gemini'], aliased: [] },
    });
    const onOpenLogin = vi.fn().mockResolvedValue(undefined);
    const panel = new ReplayPanel({ onOpenLogin });

    propsOf(buttonWithText(panel.render(), t('replay.lastRun', 'en'))).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const html = renderToStaticMarkup(panel.render());
    expect(html).toContain(t('replay.cannotStartReplay', 'en'));
    expect(html).toContain(`Claude ${t('replay.unavailable', 'en')}`);
    expect(html).toContain(`Gemini ${t('replay.unavailable', 'en')}`);
    expect(replaySnapshot).toHaveBeenCalledTimes(1);

    propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick?.();
    expect(onOpenLogin).toHaveBeenCalledWith('claude');
    expect(host.provider.openLogin).not.toHaveBeenCalled();
  });

  it.each(['host', 'callback', 'sync-callback'] as const)('shows a retryable login error via %s without restarting replay', async (path) => {
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false, blocked: 'preflight',
      preflight: { ok: false, unavailable: ['meta'], aliased: [] },
    });
    const onOpenLogin = vi.fn().mockResolvedValue(undefined);
    const login = path === 'host' ? vi.mocked(host.provider.openLogin) : onOpenLogin;
    login.mockImplementationOnce(() => {
      const error = new Error('login rejected by host');
      if (path === 'sync-callback') throw error;
      return Promise.reject(error);
    });
    const panel = new ReplayPanel({
      activeProviders: ['chatgpt', 'claude', 'gemini', 'meta'],
      onOpenLogin: path === 'host' ? undefined : onOpenLogin,
    });
    await panel.startReplay({ kind: 'last', snapshot: buildSnapshot() });

    expect(() => propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick?.()).not.toThrow();
    await vi.waitFor(() => expect(renderToStaticMarkup(panel.render()).includes('role="alert"')).toBe(true));
    expect(renderToStaticMarkup(panel.render())).toContain('Couldn&#x27;t open Meta AI. Please try again.');
    propsOf(buttonWithText(panel.render(), t('provider.retry', 'en'))).onClick?.();
    await vi.waitFor(() => expect(login.mock.calls).toEqual([['meta'], ['meta']]));
    expect(path === 'host' ? onOpenLogin : host.provider.openLogin).not.toHaveBeenCalled();
    expect(replaySnapshot).toHaveBeenCalledTimes(1);
    expect(panel.state.block?.reason).toBe('preflight');
    expect(renderToStaticMarkup(panel.render())).not.toContain('role="alert"');
  });

  it.each(['host', 'callback'] as const)('ignores duplicate Open Login and Retry clicks while %s login is pending', async (path) => {
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false, blocked: 'preflight',
      preflight: { ok: false, unavailable: ['meta'], aliased: [] },
    });
    let rejectFirst!: (reason: Error) => void;
    const first = new Promise<void>((_, reject) => { rejectFirst = reject; });
    let resolveRetry!: () => void;
    const retry = new Promise<void>((resolve) => { resolveRetry = resolve; });
    const onOpenLogin = vi.fn().mockResolvedValue(undefined);
    const login = path === 'host' ? vi.mocked(host.provider.openLogin) : onOpenLogin;
    login.mockReturnValueOnce(first).mockReturnValueOnce(retry);
    const panel = new ReplayPanel({ onOpenLogin: path === 'host' ? undefined : onOpenLogin });
    await panel.startReplay({ kind: 'last', snapshot: buildSnapshot() });
    const openClick = propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick!;

    openClick();
    openClick();
    expect(login).toHaveBeenCalledTimes(1);
    rejectFirst(new Error('login unavailable'));
    await vi.waitFor(() => expect(panel.state.notice?.kind).toBe('error'));
    const retryClick = propsOf(buttonWithText(panel.render(), t('provider.retry', 'en'))).onClick!;
    retryClick();
    retryClick();
    openClick();
    expect(login.mock.calls).toEqual([['meta'], ['meta']]);

    resolveRetry();
    await retry;
    openClick();
    expect(login.mock.calls).toEqual([['meta'], ['meta'], ['meta']]);
    expect(replaySnapshot).toHaveBeenCalledTimes(1);
    expect(path === 'host' ? onOpenLogin : host.provider.openLogin).not.toHaveBeenCalled();
    expect(panel.state.notice).toBeUndefined();
  });

  it('keeps a stale Login request guarded until it settles, then allows a new Login', async () => {
    vi.mocked(replaySnapshot).mockResolvedValue({
      ok: false, blocked: 'preflight',
      preflight: { ok: false, unavailable: ['meta'], aliased: [] },
    });
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_, fail) => { reject = fail; });
    const onOpenLogin = vi.fn().mockResolvedValue(undefined).mockReturnValueOnce(pending);
    const panel = new ReplayPanel({ onOpenLogin });
    const source = { kind: 'last' as const, snapshot: buildSnapshot() };
    await panel.startReplay(source);
    propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick?.();
    await panel.startReplay(source);
    const openClick = propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick!;
    openClick();
    expect(onOpenLogin).toHaveBeenCalledTimes(1);

    reject(new Error('stale login rejection'));
    await pending.catch(() => undefined);
    expect(panel.state.notice).toBeUndefined();
    openClick();
    expect(onOpenLogin.mock.calls).toEqual([['meta'], ['meta']]);
    expect(replaySnapshot).toHaveBeenCalledTimes(2);
  });

  it('removes Login retry when that provider becomes standby and guards an old retry click', async () => {
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false, blocked: 'preflight',
      preflight: { ok: false, unavailable: ['meta'], aliased: [] },
    });
    vi.mocked(host.provider.openLogin).mockRejectedValueOnce(new Error('login unavailable'));
    const activeProviders: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'meta'];
    const panel = new ReplayPanel({ activeProviders });
    await panel.startReplay({ kind: 'last', snapshot: buildSnapshot() });
    propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick?.();
    await vi.waitFor(() => expect(renderToStaticMarkup(panel.render()).includes('role="alert"')).toBe(true));
    const oldRetry = buttonWithText(panel.render(), t('provider.retry', 'en'));

    activeProviders.splice(activeProviders.indexOf('meta'), 1, 'grok');
    expect(findAllElements(panel.render(), (element) => element.type === 'button'
      && textOf(element).includes(t('provider.retry', 'en')))).toHaveLength(0);
    propsOf(oldRetry).onClick?.();
    await Promise.resolve();
    expect(host.provider.openLogin).toHaveBeenCalledTimes(1);
    expect(replaySnapshot).toHaveBeenCalledTimes(1);
  });

  it.each(['replay', 'delete'] as const)('does not replace a newer %s result with an old Login rejection', async (action) => {
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false, blocked: 'preflight',
      preflight: { ok: false, unavailable: ['meta'], aliased: [] },
    });
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_, fail) => { reject = fail; });
    const onOpenLogin = vi.fn().mockReturnValue(pending);
    const panel = new ReplayPanel({ onOpenLogin });
    const source = { kind: 'last' as const, snapshot: buildSnapshot() };
    await panel.startReplay(source);
    propsOf(buttonWithText(panel.render(), t('replay.openLogin', 'en'))).onClick?.();
    if (action === 'replay') await panel.startReplay(source);
    else await panel.deleteStoredSnapshot('snapshot-old');
    reject(new Error('late Login rejection'));
    await pending.catch(() => undefined);
    await Promise.resolve();

    expect(panel.state.notice?.kind).toBe('ok');
    if (action === 'replay') expect(panel.state.block).toBeUndefined();
    expect(renderToStaticMarkup(panel.render())).not.toContain('role="alert"');
  });

  it('does not offer login for an unavailable standby provider', async () => {
    const snapshot = buildSnapshot();
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false,
      blocked: 'preflight',
      preflight: { ok: false, unavailable: ['meta'], aliased: [] },
    });
    const onOpenLogin = vi.fn().mockResolvedValue(undefined);
    const panel = new ReplayPanel({
      activeProviders: ['chatgpt', 'claude', 'gemini', 'grok'],
      onOpenLogin,
    });

    propsOf(buttonWithText(panel.render(), t('replay.lastRun', 'en'))).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const tree = panel.render();
    expect(renderToStaticMarkup(tree)).toContain(`Meta AI ${t('replay.unavailable', 'en')}`);
    expect(findAllElements(
      tree,
      (element) => element.type === 'button' && textOf(element).includes(t('replay.openLogin', 'en')),
    )).toHaveLength(0);
    expect(onOpenLogin).not.toHaveBeenCalled();
    expect(host.provider.openLogin).not.toHaveBeenCalled();
  });

  it('shows missing snapshots as a small error line', async () => {
    const snapshot = buildSnapshot();
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot).mockResolvedValueOnce({ ok: false, blocked: 'not-found' });
    const panel = new ReplayPanel({});

    propsOf(buttonWithText(panel.render(), t('replay.lastRun', 'en'))).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    expect(renderToStaticMarkup(panel.render())).toContain(t('replay.snapshotNotFound', 'en'));
  });
});

function buildSnapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return {
    snapshotId: 'snapshot-source',
    graphId: 'debate',
    graphVersion: 2,
    appVersion: '0.0.0-test',
    createdAt: '2026-07-06T00:00:00.000Z',
    completedAt: '2026-07-06T00:01:00.000Z',
    adapterVersions: {},
    roleMap: { pro: 'chatgpt', con: 'claude', judge: 'grok', summary: 'gemini' },
    redactionTier: 'full-local',
    userQuestion: inlineRef('clean replay question'),
    steps: [],
    humanEdits: [],
    ...overrides,
  };
}

function inlineRef(text: string): RedactedValueRef {
  return {
    tier: 'full-local',
    kind: 'inline',
    text,
    byteLength: new TextEncoder().encode(text).byteLength,
  };
}
