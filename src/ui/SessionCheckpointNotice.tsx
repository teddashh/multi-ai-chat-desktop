import { modeName } from '../i18n/modes';
import type { Locale } from '../i18n/resolve';
import { formatI18n, t } from '../i18n/t';
import type { StartupSessionCheckpointNotice } from './sessionCheckpointStartup';

export function SessionCheckpointNotice({
  notice,
  replaying,
  onDismiss,
  onReplay,
  locale = 'en',
}: {
  notice: StartupSessionCheckpointNotice;
  replaying?: boolean;
  onDismiss: () => void;
  onReplay?: () => void;
  locale?: Locale;
}) {
  const displayMode = modeName(notice.checkpoint.mode, locale);
  return (
    <section className="mt-3 border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{formatI18n(t('sessionCheckpoint.interrupted', locale), { mode: displayMode })}</div>
          <div className="mt-1 text-amber-200">
            {t('sessionCheckpoint.step', locale)} {notice.checkpoint.stepIndex}
            {notice.checkpoint.pendingCheckpointNodeId ? ` · ${t('sessionCheckpoint.pending', locale)} ${notice.checkpoint.pendingCheckpointNodeId}` : ''}
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
              {t('sessionCheckpoint.replay', locale)}
            </button>
          ) : null}
          <button type="button" className="border border-amber-700 px-2 py-1 hover:bg-amber-900" onClick={onDismiss}>
            {t('sessionCheckpoint.dismiss', locale)}
          </button>
        </div>
      </div>
    </section>
  );
}
