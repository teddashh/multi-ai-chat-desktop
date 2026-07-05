import { useEffect, useState } from 'react';
import type { StepTimeoutAction } from '../workflow/stepTimeout';
import { chooseTimeoutDialogAction } from './timeoutActions';

export interface StepTimeoutDialogState {
  provider: string;
  remainingMs: number;
  timedOut: boolean;
}

export function StepTimeoutDialog({
  event,
  onClose,
}: {
  event: StepTimeoutDialogState;
  onClose: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(event.remainingMs);

  useEffect(() => {
    if (event.timedOut) return;
    const startedAt = Date.now();
    setRemainingMs(event.remainingMs);
    const timer = window.setInterval(() => {
      setRemainingMs(Math.max(0, event.remainingMs - (Date.now() - startedAt)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [event.provider, event.remainingMs, event.timedOut]);

  if (!event.timedOut) {
    return (
      <div className="mt-2 border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
        Waiting on {event.provider}: {Math.ceil(remainingMs / 1000)}s
      </div>
    );
  }

  const choose = (action: StepTimeoutAction) => {
    chooseTimeoutDialogAction(action, onClose);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section className="w-full max-w-sm border border-amber-700 bg-zinc-950 p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-zinc-100">Step timed out</h2>
        <p className="mt-2 text-sm text-zinc-300">{event.provider} did not finish this workflow step.</p>
        <div className="mt-4 flex gap-2">
          <button className="border border-emerald-700 px-3 py-2 text-xs hover:bg-emerald-950" onClick={() => choose('retry')}>
            Retry
          </button>
          <button className="border border-sky-700 px-3 py-2 text-xs hover:bg-sky-950" onClick={() => choose('skip')}>
            Skip
          </button>
          <button className="border border-red-700 px-3 py-2 text-xs hover:bg-red-950" onClick={() => choose('cancel')}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
