import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrailingDebounce } from '../ui/trailingDebounce';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('trailing debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid updates and runs only the latest value', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const debounce = createTrailingDebounce(callback, 250);

    debounce.schedule(18);
    vi.advanceTimersByTime(100);
    debounce.schedule(20);
    vi.advanceTimersByTime(249);
    expect(callback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(20);
  });

  it('can flush on close or cancel when Save persists the full draft', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const debounce = createTrailingDebounce(callback, 250);

    debounce.schedule(18);
    await debounce.flush();
    expect(callback).toHaveBeenCalledWith(18);

    debounce.schedule(20);
    debounce.cancel();
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('waits for async persistence and exposes a close-time failure', async () => {
    vi.useFakeTimers();
    const write = deferred<void>();
    const callback = vi.fn(() => write.promise);
    const debounce = createTrailingDebounce(callback, 250);
    debounce.schedule(20);

    const flush = debounce.flush();
    let settled = false;
    void flush.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    write.reject(new Error('write failed'));
    await expect(flush).rejects.toThrow('write failed');
    await expect(debounce.flush()).resolves.toBeUndefined();
  });

  it('starts a newer callback even while the previous persistence is pending', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<void>();
    const callback = vi.fn((value: number) => (value === 18 ? firstWrite.promise : Promise.resolve()));
    const debounce = createTrailingDebounce(callback, 250);

    debounce.schedule(18);
    const first = debounce.flush();
    debounce.schedule(20);
    await vi.advanceTimersByTimeAsync(250);

    expect(callback.mock.calls.map(([value]) => value)).toEqual([18, 20]);
    firstWrite.resolve();
    await first;
  });
});
