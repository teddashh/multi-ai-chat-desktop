import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import type { PendingCheckpoint } from '../workflow/checkpoint';
import { resolveCheckpoint } from '../workflow/checkpoint';

export function CheckpointCard({
  checkpoint,
  draft,
  onDraftChange,
  onNativeEdit,
}: {
  checkpoint: PendingCheckpoint | undefined;
  draft: string;
  onDraftChange: (draft: string) => void;
  onNativeEdit?: (provider: AIProvider) => void;
}) {
  if (!checkpoint) return null;

  const providerName = AI_PROVIDERS[checkpoint.provider].name;
  const source = checkpoint.sourceNodeId && checkpoint.sourceNodeId !== checkpoint.nodeId ? `Source: ${checkpoint.sourceNodeId}` : 'Source: input';

  return (
    <section className="mt-3 border border-amber-800 bg-amber-950/40 p-3 text-sm text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">逐步確認 / Confirm each step</div>
          <div className="mt-1 text-xs text-amber-200">
            Step {checkpoint.nodeId} · {providerName} · {source}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => resolveCheckpoint(checkpoint.nodeId, { action: 'skip' })}
          >
            Skip
          </button>
          <button
            type="button"
            className="border border-sky-700 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-950"
            onClick={() => {
              try {
                onNativeEdit?.(checkpoint.provider);
              } catch {
                // Presentation is best-effort; checkpoint resolution owns workflow progress.
              }
              resolveCheckpoint(checkpoint.nodeId, { action: 'native-edit', draft });
            }}
          >
            Edit in provider
          </button>
          <button
            type="button"
            className="border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-900"
            onClick={() => resolveCheckpoint(checkpoint.nodeId, { action: 'confirm', draft })}
          >
            Confirm
          </button>
        </div>
      </div>
      <textarea
        className="mt-3 h-40 w-full resize-y border border-zinc-700 bg-zinc-950 p-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-amber-500"
        value={draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        aria-label={`Draft for ${providerName} step ${checkpoint.nodeId}`}
      />
    </section>
  );
}
