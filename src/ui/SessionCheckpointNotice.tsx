import { CHAT_MODES } from '../../shared/constants';
import type { StartupSessionCheckpointNotice } from './sessionCheckpointStartup';

export function SessionCheckpointNotice({
  notice,
  replaying,
  onDismiss,
  onReplay,
}: {
  notice: StartupSessionCheckpointNotice;
  replaying?: boolean;
  onDismiss: () => void;
  onReplay?: () => void;
}) {
  const modeName = CHAT_MODES[notice.checkpoint.mode]?.name ?? notice.checkpoint.mode;
  return (
    <section className="mt-3 border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">上次的 {modeName} 執行未正常結束</div>
          <div className="mt-1 text-amber-200">
            Step {notice.checkpoint.stepIndex}
            {notice.checkpoint.pendingCheckpointNodeId ? ` · pending ${notice.checkpoint.pendingCheckpointNodeId}` : ''}
          </div>
        </div>
        <div className="flex gap-2">
          {notice.replaySnapshot && onReplay ? (
            <button
              type="button"
              className="border border-emerald-700 px-2 py-1 text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onReplay}
              disabled={replaying}
            >
              Replay
            </button>
          ) : null}
          <button type="button" className="border border-amber-700 px-2 py-1 hover:bg-amber-900" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
