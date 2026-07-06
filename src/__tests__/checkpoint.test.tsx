import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBusForTests } from '../bridge/bus';
import { awaitCheckpoint, resetCheckpointForTests, type PendingCheckpoint } from '../workflow/checkpoint';
import { resetCancelState } from '../workflow/cancel';
import { CheckpointCard } from '../ui/CheckpointCard';

interface ElementProps {
  children?: ReactNode;
  value?: string;
  onClick?: () => void;
  onChange?: (event: { currentTarget: { value: string } }) => void;
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

function pendingCheckpoint(overrides: Partial<PendingCheckpoint> = {}): PendingCheckpoint {
  return {
    nodeId: 'pro',
    sourceNodeId: 'question',
    provider: 'chatgpt',
    draft: 'original draft',
    ...overrides,
  };
}

describe('CheckpointCard', () => {
  beforeEach(() => {
    resetBusForTests();
    resetCancelState();
    resetCheckpointForTests();
  });

  afterEach(() => {
    resetCheckpointForTests();
    resetBusForTests();
    resetCancelState();
  });

  it('renders nothing when no checkpoint is pending', () => {
    expect(CheckpointCard({ checkpoint: undefined, draft: '', onDraftChange: vi.fn() })).toBeNull();
  });

  it('renders the draft and confirms the edited draft through the checkpoint registry', async () => {
    const checkpoint = pendingCheckpoint();
    const decision = awaitCheckpoint(checkpoint);
    const onDraftChange = vi.fn();
    const tree = CheckpointCard({ checkpoint, draft: 'edited draft', onDraftChange });

    expect(renderToStaticMarkup(tree)).toContain('edited draft');
    expect(renderToStaticMarkup(tree)).toContain('Step pro');
    const textarea = firstElement(tree, (element) => element.type === 'textarea');
    propsOf(textarea).onChange?.({ currentTarget: { value: 'new edit' } });
    expect(onDraftChange).toHaveBeenCalledWith('new edit');

    const confirm = firstElement(tree, (element) => element.type === 'button' && textOf(element).includes('Confirm'));
    propsOf(confirm).onClick?.();

    await expect(decision).resolves.toEqual({ action: 'confirm', draft: 'edited draft' });
  });

  it('resolves skip through the checkpoint registry', async () => {
    const checkpoint = pendingCheckpoint({ nodeId: 'con' });
    const decision = awaitCheckpoint(checkpoint);
    const tree = CheckpointCard({ checkpoint, draft: checkpoint.draft, onDraftChange: vi.fn() });
    const skip = firstElement(tree, (element) => element.type === 'button' && textOf(element).includes('Skip'));

    propsOf(skip).onClick?.();

    await expect(decision).resolves.toEqual({ action: 'skip' });
  });
});
