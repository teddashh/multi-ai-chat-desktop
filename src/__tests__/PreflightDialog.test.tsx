import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreflightDialog } from '../ui/PreflightDialog';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useEffect: vi.fn(react.useEffect), useState: vi.fn(react.useState), useRef: vi.fn(react.useRef) };
});
afterEach(() => vi.restoreAllMocks());

function button(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === 'button' && node.props.children === label) return node as ReactElement<{ onClick: () => void }>;
  for (const child of Children.toArray(node.props.children)) {
    const found = button(child, label);
    if (found) return found;
  }
}

function harness(onOpenLogin: (provider: 'meta' | 'chatgpt' | 'claude' | 'gemini' | 'grok') => void | Promise<void>) {
  let state: unknown;
  const refs: { current: unknown }[] = [];
  let cleanup: (() => void) | undefined;
  const onClose = vi.fn();
  const onSwitchMode = vi.fn();
  const model = { title: 'Cannot start', unavailable: [{ provider: 'meta' as const, label: 'Meta AI', reason: 'Needs login' }], aliased: [] };
  const render = (hidden = false) => {
    let index = 0;
    vi.mocked(useState).mockImplementationOnce(() => [state, (next) => { state = next; }]);
    vi.mocked(useRef).mockImplementation((initial) => refs[index++] ?? (refs[index - 1] = { current: initial }));
    vi.mocked(useEffect).mockImplementationOnce((effect) => { cleanup = effect() || undefined; });
    const tree = PreflightDialog({ model, onOpenLogin, onClose, onSwitchMode, hidden });
    vi.mocked(useRef).mockRestore();
    vi.mocked(useEffect).mockReset();
    return tree;
  };
  return {
    render, onClose, onSwitchMode, model,
    click: (label: string) => { const found = button(render(), label); expect(found).toBeDefined(); found!.props.onClick(); },
    unmount: () => cleanup?.(),
    html: () => renderToStaticMarkup(render()),
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('PreflightDialog login recovery', () => {
  it.each(['async', 'sync'] as const)('shows %s rejection and retries only login', async (kind) => {
    const login = vi.fn().mockResolvedValue(undefined).mockImplementationOnce(() => {
      if (kind === 'sync') throw new Error('host denied');
      return Promise.reject(new Error('host denied'));
    });
    const ui = harness(login);
    expect(() => ui.click('Open/Login')).not.toThrow();
    await vi.waitFor(() => expect(ui.html()).toContain('role="alert"'));
    expect(ui.html()).toContain('Couldn&#x27;t open Meta AI. Please try again.');
    expect(ui.onClose).not.toHaveBeenCalled();
    ui.click('Try again');
    await vi.waitFor(() => expect(ui.onClose).toHaveBeenCalledTimes(1));
    expect(login.mock.calls).toEqual([['meta'], ['meta']]);
    expect(ui.onSwitchMode).not.toHaveBeenCalled();
  });

  it('ignores duplicate Open login and Retry clicks until the request settles', async () => {
    const first = deferred();
    const second = deferred();
    const login = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = harness(login);
    ui.click('Open/Login');
    ui.click('Open/Login');
    expect(login).toHaveBeenCalledTimes(1);
    first.reject(new Error('denied'));
    await vi.waitFor(() => expect(ui.html()).toContain('role="alert"'));
    const retry = button(ui.render(), 'Try again')!;
    retry.props.onClick();
    retry.props.onClick();
    ui.click('Open/Login');
    expect(login).toHaveBeenCalledTimes(2);
    second.resolve();
    await vi.waitFor(() => expect(ui.onClose).toHaveBeenCalledTimes(1));
  });

  it('retains the pending request and error while temporarily hidden for native login', async () => {
    const request = deferred();
    const login = vi.fn().mockReturnValue(request.promise);
    const ui = harness(login);
    const open = button(ui.render(), 'Open/Login')!;
    open.props.onClick();
    expect(ui.render(true)).toBeNull();
    open.props.onClick();
    expect(login).toHaveBeenCalledTimes(1);
    request.reject(new Error('host denied'));
    await request.promise.catch(() => undefined);
    expect(ui.html()).toContain('role="alert"');
    expect(button(ui.render(), 'Try again')).toBeDefined();
    expect(ui.onClose).not.toHaveBeenCalled();
  });

  it.each(['Back', 'Use Free mode', 'unmount'] as const)('ignores late rejection after %s', async (action) => {
    const request = deferred();
    const ui = harness(vi.fn().mockReturnValue(request.promise));
    ui.click('Open/Login');
    if (action === 'unmount') ui.unmount();
    else ui.click(action);
    request.reject(new Error('late rejection'));
    await request.promise.catch(() => undefined);
    expect(ui.html()).not.toContain('role="alert"');
    expect(ui.onClose).toHaveBeenCalledTimes(action === 'Back' ? 1 : 0);
    expect(ui.onSwitchMode).toHaveBeenCalledTimes(action === 'Use Free mode' ? 1 : 0);
  });
});