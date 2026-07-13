import { describe, expect, it, vi } from 'vitest';
import { createSerialTaskQueue } from '../ui/serialTaskQueue';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('serial task queue', () => {
  it('does not start a newer settings write until the previous write settles', async () => {
    const enqueue = createSerialTaskQueue();
    const firstWrite = deferred<void>();
    const writes: number[] = [];

    const first = enqueue(async () => {
      writes.push(18);
      await firstWrite.promise;
    });
    const secondTask = vi.fn(async () => {
      writes.push(20);
    });
    const second = enqueue(secondTask);

    await vi.waitFor(() => expect(writes).toEqual([18]));
    expect(secondTask).not.toHaveBeenCalled();

    firstWrite.resolve();
    await Promise.all([first, second]);
    expect(writes).toEqual([18, 20]);
  });

  it('continues with the next task after a failed write', async () => {
    const enqueue = createSerialTaskQueue();
    const firstWrite = deferred<void>();
    const writes: number[] = [];

    const first = enqueue(async () => {
      writes.push(18);
      await firstWrite.promise;
    });
    const second = enqueue(async () => {
      writes.push(20);
    });

    firstWrite.reject(new Error('write failed'));
    await expect(first).rejects.toThrow('write failed');
    await expect(second).resolves.toBeUndefined();
    expect(writes).toEqual([18, 20]);
  });
});
