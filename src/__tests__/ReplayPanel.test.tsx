import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { host } from '../host';
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

    expect(renderToStaticMarkup(tree)).toContain('Replay last run');

    propsOf(buttonWithText(tree, 'Replay last run')).onClick?.();

    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenCalledWith(
        { snapshot },
        { replayWithCurrentGraph: undefined, onSnapshotComplete: undefined },
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

    propsOf(buttonWithText(tree, 'Replay')).onClick?.();
    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenCalledWith(
        { snapshotId: 'snapshot-new' },
        { replayWithCurrentGraph: undefined, onSnapshotComplete: undefined },
      ),
    );

    propsOf(buttonWithText(panel.render(), 'Delete')).onClick?.();
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

    propsOf(buttonWithText(panel.render(), 'Replay last run')).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const blockedTree = panel.render();
    expect(renderToStaticMarkup(blockedTree)).toContain('Original question required');
    propsOf(firstElement(blockedTree, (element) => element.type === 'input' && propsOf(element).placeholder === 'Original question')).onChange?.({
      target: { value: 'original question' },
    });
    propsOf(firstElement(panel.render(), (element) => element.type === 'form')).onSubmit?.({ preventDefault: vi.fn() });

    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenLastCalledWith(
        { snapshot, question: 'original question' },
        { replayWithCurrentGraph: undefined, onSnapshotComplete: undefined },
      ),
    );
  });

  it('confirms graph version mismatches before replaying with the current graph', async () => {
    const snapshot = buildSnapshot();
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

    propsOf(buttonWithText(panel.render(), 'Replay last run')).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const blockedTree = panel.render();
    expect(renderToStaticMarkup(blockedTree)).toContain('Graph version changed');
    propsOf(buttonWithText(blockedTree, 'Replay with current graph')).onClick?.();

    await vi.waitFor(() =>
      expect(replaySnapshot).toHaveBeenLastCalledWith(
        { snapshot },
        { replayWithCurrentGraph: true, onSnapshotComplete: undefined },
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
    const panel = new ReplayPanel({});

    propsOf(buttonWithText(panel.render(), 'Replay last run')).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const html = renderToStaticMarkup(panel.render());
    expect(html).toContain('Cannot start replay');
    expect(html).toContain('Claude unavailable');
    expect(html).toContain('Gemini unavailable');
    expect(replaySnapshot).toHaveBeenCalledTimes(1);
  });

  it('shows claude-code replay blocks through normal preflight and keeps replay available', async () => {
    const snapshot = buildSnapshot();
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot).mockResolvedValueOnce({
      ok: false,
      blocked: 'preflight',
      preflight: { ok: false, unavailable: ['claude-code'], aliased: [] },
    });
    const panel = new ReplayPanel({});

    propsOf(buttonWithText(panel.render(), 'Replay last run')).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    const blockedTree = panel.render();
    expect(renderToStaticMarkup(blockedTree)).toContain('Cannot start replay');
    expect(renderToStaticMarkup(blockedTree)).toContain('Claude Code unavailable');
    expect(propsOf(buttonWithText(blockedTree, 'Replay last run')).disabled).toBe(false);
    propsOf(buttonWithText(blockedTree, 'Open/Login')).onClick?.();
    expect(host.provider.openLogin).toHaveBeenCalledWith('claude-code');
  });

  it('shows missing snapshots as a small error line', async () => {
    const snapshot = buildSnapshot();
    vi.mocked(getLastSnapshot).mockReturnValue(snapshot);
    vi.mocked(replaySnapshot).mockResolvedValueOnce({ ok: false, blocked: 'not-found' });
    const panel = new ReplayPanel({});

    propsOf(buttonWithText(panel.render(), 'Replay last run')).onClick?.();
    await vi.waitFor(() => expect(replaySnapshot).toHaveBeenCalledTimes(1));

    expect(renderToStaticMarkup(panel.render())).toContain('Snapshot not found.');
  });
});

function buildSnapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return {
    snapshotId: 'snapshot-source',
    graphId: 'debate',
    graphVersion: 1,
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
