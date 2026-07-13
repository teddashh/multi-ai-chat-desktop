export interface TrailingDebounce<T> {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

export function createTrailingDebounce<T>(
  callback: (value: T) => void | Promise<void>,
  delayMs: number,
): TrailingDebounce<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: T | undefined;
  let active: Promise<void> | undefined;

  const clearTimer = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const runPending = (): Promise<void> => {
    if (pending === undefined) return active ?? Promise.resolve();
    const value = pending;
    pending = undefined;
    let result: Promise<void>;
    try {
      result = Promise.resolve(callback(value));
    } catch (reason) {
      result = Promise.reject(reason);
    }
    active = result;
    void result.then(
      () => {
        if (active === result) active = undefined;
      },
      () => {
        if (active === result) active = undefined;
      },
    );
    return result;
  };

  return {
    schedule: (value) => {
      pending = value;
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        void runPending().catch(() => undefined);
      }, delayMs);
    },
    flush: () => {
      clearTimer();
      return runPending();
    },
    cancel: () => {
      clearTimer();
      pending = undefined;
    },
  };
}
