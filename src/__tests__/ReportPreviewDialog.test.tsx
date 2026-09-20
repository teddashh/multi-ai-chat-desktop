import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportPreviewDialog } from '../ui/ReportPreviewDialog';
import type { ReportDigest } from '../ui/reportBroken';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useEffect: vi.fn(react.useEffect), useState: vi.fn(react.useState), useRef: vi.fn(react.useRef) };
});
afterEach(() => vi.restoreAllMocks());

function button(node: ReactNode, label: string): ReactElement<{ onClick: () => void; disabled?: boolean }> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === 'button' && node.props.children === label) return node as ReactElement<{ onClick: () => void; disabled?: boolean }>;
  for (const child of Children.toArray(node.props.children)) {
    const found = button(child, label);
    if (found) return found;
  }
}

function harness(onOpenIssue: () => void | Promise<void>) {
  let state: unknown;
  const refs: { current: unknown }[] = [];
  let cleanup: (() => void) | undefined;
  const onCancel = vi.fn();
  const digest: ReportDigest = {
    provider: 'meta', displayName: 'Meta AI', adapterVersion: 1, appVersion: '1.8.9',
    path: '/', pageContext: 'unknown', composerHasText: false,
    fields: [], candidates: [], firstMissingField: 'inputSelectors',
  };
  const render = (busy = false) => {
    let index = 0;
    vi.mocked(useState).mockImplementationOnce(() => [state, (next) => { state = next; }]);
    vi.mocked(useRef).mockImplementation((initial) => refs[index++] ?? (refs[index - 1] = { current: initial }));
    vi.mocked(useEffect).mockImplementationOnce((effect) => { cleanup = effect() || undefined; });
    const tree = ReportPreviewDialog({ preview: { provider: 'meta', digest, body: 'Exact preview payload' }, busy, onOpenIssue, onCancel, locale: 'en' });
    vi.mocked(useRef).mockRestore();
    vi.mocked(useEffect).mockReset();
    return tree;
  };
  return {
    render, onCancel, digest, unmount: () => cleanup?.(), html: () => renderToStaticMarkup(render()),
    click: (label: string) => { const found = button(render(), label); expect(found).toBeDefined(); found!.props.onClick(); },
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('ReportPreviewDialog issue recovery', () => {
  it.each(['async', 'sync'] as const)('shows %s rejection inside the modal and retries opening the issue', async (kind) => {
    const openIssue = vi.fn().mockResolvedValue(undefined).mockImplementationOnce(() => {
      if (kind === 'sync') throw new Error('private host diagnostic');
      return Promise.reject(new Error('private host diagnostic'));
    });
    const ui = harness(openIssue);
    expect(() => ui.click('Open GitHub issue')).not.toThrow();
    await vi.waitFor(() => expect(ui.html().includes('role="alert"')).toBe(true));
    expect(ui.html()).toContain("Couldn&#x27;t open the GitHub issue. Please try again.");
    expect(ui.html()).toContain('Exact preview payload');
    expect(ui.html()).not.toContain('private host diagnostic');
    expect(ui.onCancel).not.toHaveBeenCalled();
    ui.click('Try again');
    await vi.waitFor(() => expect(ui.onCancel).toHaveBeenCalledTimes(1));
    expect(openIssue).toHaveBeenCalledTimes(2);
  });

  it('coalesces opening and retry clicks while each request is pending', async () => {
    const first = deferred();
    const second = deferred();
    const openIssue = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = harness(openIssue);
    const open = button(ui.render(), 'Open GitHub issue')!;
    open.props.onClick();
    open.props.onClick();
    expect(openIssue).toHaveBeenCalledTimes(1);
    expect(button(ui.render(), 'Open GitHub issue')!.props.disabled).toBe(true);
    first.reject(new Error('denied'));
    await vi.waitFor(() => expect(ui.html().includes('role="alert"')).toBe(true));
    const retry = button(ui.render(), 'Try again')!;
    retry.props.onClick();
    retry.props.onClick();
    expect(openIssue).toHaveBeenCalledTimes(2);
    second.resolve();
    await vi.waitFor(() => expect(ui.onCancel).toHaveBeenCalledTimes(1));
  });

  it('does not open an issue without a structural failure or while busy', () => {
    const openIssue = vi.fn();
    const ui = harness(openIssue);
    button(ui.render(true), 'Open GitHub issue')!.props.onClick();
    ui.digest.firstMissingField = undefined;
    const open = button(ui.render(), 'Open GitHub issue')!;
    expect(open.props.disabled).toBe(true);
    open.props.onClick();
    expect(openIssue).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'unmount'] as const)('ignores late completion after %s', async (action) => {
    const pending = deferred();
    const ui = harness(vi.fn().mockReturnValue(pending.promise));
    ui.click('Open GitHub issue');
    if (action === 'cancel') ui.click('Cancel');
    else ui.unmount();
    pending.resolve();
    await pending.promise;
    expect(ui.onCancel).toHaveBeenCalledTimes(action === 'cancel' ? 1 : 0);
  });
});
