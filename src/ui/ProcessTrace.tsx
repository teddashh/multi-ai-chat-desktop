import type { ProcessTraceState, ProcessTraceStepStatus } from './processTraceModel';

export function ProcessTrace({ trace }: { trace: ProcessTraceState }) {
  if (trace.steps.length === 0 && !trace.currentStatus) return null;

  return (
    <section aria-label="Process trace" className="mt-3 border border-zinc-800 bg-zinc-900">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase text-zinc-300">Process trace</h2>
        <div className="min-w-0 text-right text-[11px] text-sky-200">{trace.currentStatus || 'Settled'}</div>
      </div>
      {trace.steps.length > 0 ? (
        <ol className="divide-y divide-zinc-800">
          {trace.steps.map((step) => (
            <li key={step.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-2 text-xs">
              <span className={`font-medium uppercase ${statusClass(step.status)}`}>{statusLabel(step.status)}</span>
              <span className="min-w-0">
                <span className="block truncate text-zinc-100">{step.label}</span>
                {step.detail ? <span className="block truncate text-[11px] text-zinc-500">{step.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-3 py-2 text-xs text-zinc-500">Waiting for workflow events.</div>
      )}
    </section>
  );
}

function statusLabel(status: ProcessTraceStepStatus): string {
  if (status === 'pending') return 'Pending';
  if (status === 'active') return 'Active';
  return 'Done';
}

function statusClass(status: ProcessTraceStepStatus): string {
  if (status === 'pending') return 'text-zinc-500';
  if (status === 'active') return 'text-sky-300';
  return 'text-emerald-300';
}
