import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { host } from '../host';
import { SessionCheckpointNotice } from '../ui/SessionCheckpointNotice';
import {
  clearStartupSessionCheckpointNotice,
  loadStartupSessionCheckpointNotice,
  type StartupSessionCheckpointNotice,
} from '../ui/sessionCheckpointStartup';

vi.mock('../host', () => ({
  host: {
    sessionCheckpoint: {
      load: vi.fn(),
      clear: vi.fn(),
    },
    snapshot: {
      list: vi.fn(),
    },
  },
}));

interface ElementProps {
  children?: ReactNode;
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

function notice(): StartupSessionCheckpointNotice {
  return {
    checkpoint: {
      graphId: 'debate',
      graphVersion: 1,
      mode: 'debate',
      questionHash: 'hash-only',
      stepIndex: 2,
      startedAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:01:00.000Z',
    },
    replaySnapshot: {
      id: 'snapshot-debate',
      graphId: 'debate',
      createdAt: '2026-07-06T00:02:00.000Z',
    },
  };
}

describe('SessionCheckpointNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.sessionCheckpoint.load).mockResolvedValue(null);
    vi.mocked(host.sessionCheckpoint.clear).mockResolvedValue(undefined);
    vi.mocked(host.snapshot.list).mockResolvedValue([]);
  });

  it('loads a startup checkpoint and same-graph replay snapshot', async () => {
    vi.mocked(host.sessionCheckpoint.load).mockResolvedValueOnce(JSON.stringify(notice().checkpoint));
    vi.mocked(host.snapshot.list).mockResolvedValueOnce([
      { id: 'snapshot-free', graphId: 'free' },
      { id: 'snapshot-debate', graphId: 'debate' },
    ]);

    await expect(loadStartupSessionCheckpointNotice()).resolves.toMatchObject({
      checkpoint: { graphId: 'debate', questionHash: 'hash-only' },
      replaySnapshot: { id: 'snapshot-debate' },
    });
  });

  it('renders the startup notice and wires Dismiss and Replay actions', () => {
    const onDismiss = vi.fn();
    const onReplay = vi.fn();
    const tree = SessionCheckpointNotice({ notice: notice(), onDismiss, onReplay });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain('上次的 四方辯證 執行未正常結束');
    expect(html).toContain('Step 2');

    propsOf(firstElement(tree, (element) => element.type === 'button' && textOf(element).includes('Dismiss'))).onClick?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);

    propsOf(firstElement(tree, (element) => element.type === 'button' && textOf(element).includes('Replay'))).onClick?.();
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('clears the checkpoint when the startup notice is dismissed', async () => {
    await clearStartupSessionCheckpointNotice();

    expect(host.sessionCheckpoint.clear).toHaveBeenCalledTimes(1);
  });
});
