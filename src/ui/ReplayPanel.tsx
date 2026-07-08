import { Component, type ChangeEvent, type FormEvent } from 'react';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import type { I18nKey } from '../i18n/keys';
import type { Locale } from '../i18n/resolve';
import { formatI18n, t } from '../i18n/t';
import { host, type StoredSnapshotInfo } from '../host';
import { getLastSnapshot } from '../workflow/snapshot/recorder';
import {
  parseStoredSnapshot,
  planReplay,
  replaySnapshot,
  type ReplayBlockReason,
  type ReplayPlan,
  type ReplayResult,
} from '../workflow/snapshot/replay';
import type { ExecutionSnapshot } from '../workflow/snapshot/types';

export type ReplaySource =
  | { kind: 'last'; snapshot: ExecutionSnapshot }
  | { kind: 'stored'; snapshotId: string; info?: StoredSnapshotInfo };

interface ReplayRunOptions {
  question?: string;
  replayWithCurrentGraph?: boolean;
}

interface ReplayBlockState {
  reason: ReplayBlockReason;
  source: ReplaySource;
  detail?: unknown;
  preflight?: Extract<ReplayResult, { ok: false }>['preflight'];
}

interface ReplayNotice {
  kind: 'ok' | 'error';
  text: string;
}

export interface ReplayPanelProps {
  locale?: Locale;
  onReplayWillRun?: (plan: ReplayPlan) => void;
  onReplaySettled?: () => void;
  onSnapshotComplete?: (snapshot: ExecutionSnapshot) => void | Promise<void>;
}

interface ReplayPanelState {
  storedSnapshots: StoredSnapshotInfo[];
  loadingStored: boolean;
  listError?: string;
  busyKey?: string;
  block?: ReplayBlockState;
  question: string;
  notice?: ReplayNotice;
}

const initialState: ReplayPanelState = {
  storedSnapshots: [],
  loadingStored: false,
  question: '',
};

export function sortStoredSnapshotsNewestFirst(snapshots: StoredSnapshotInfo[]): StoredSnapshotInfo[] {
  return [...snapshots].sort((a, b) => snapshotTime(b) - snapshotTime(a));
}

export class ReplayPanel extends Component<ReplayPanelProps, ReplayPanelState> {
  state: ReplayPanelState = initialState;

  private mounted = false;

  componentDidMount(): void {
    this.mounted = true;
    void this.refreshStoredSnapshots();
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  async refreshStoredSnapshots(): Promise<void> {
    this.updateState({ loadingStored: true, listError: undefined });
    try {
      const storedSnapshots = sortStoredSnapshotsNewestFirst(await host.snapshot.list());
      this.updateState({ storedSnapshots, loadingStored: false });
    } catch (error) {
      this.updateState({
        loadingStored: false,
        listError: errorMessage(error),
      });
    }
  }

  async startReplay(source: ReplaySource, options: ReplayRunOptions = {}): Promise<ReplayResult | undefined> {
    const busyKey = sourceKey(source);
    const question = options.question?.trim();
    this.updateState({ busyKey, notice: undefined, block: undefined });

    let planned: ReplayPlan | undefined;
    let willRun = false;
    try {
      planned = await this.planReplayForSource(source, options);
      if (planned && !planned.blocked && (!planned.needsQuestion || question)) {
        willRun = true;
        this.props.onReplayWillRun?.({
          ...planned,
          question: planned.question ?? question,
        });
      }

      const result = await replaySnapshot(this.inputForSource(source, question), {
        replayWithCurrentGraph: options.replayWithCurrentGraph,
        onSnapshotComplete: this.props.onSnapshotComplete,
      });

      if (result.ok) {
        if (!willRun) this.props.onReplayWillRun?.(result.plan);
        this.updateState({
          block: undefined,
          question: '',
          notice: {
            kind: 'ok',
            text: result.newSnapshotId
              ? formatI18n(this.t('replay.completedWithSnapshot'), { snapshotId: result.newSnapshotId })
              : this.t('replay.completed'),
          },
        });
        await this.refreshStoredSnapshots();
        return result;
      }

      this.showBlockedResult(source, result);
      return result;
    } catch (error) {
      this.updateState({
        notice: { kind: 'error', text: errorMessage(error) },
      });
      return undefined;
    } finally {
      this.updateState({ busyKey: undefined });
      this.props.onReplaySettled?.();
    }
  }

  async deleteStoredSnapshot(snapshotId: string): Promise<void> {
    const busyKey = `delete:${snapshotId}`;
    this.updateState({ busyKey, notice: undefined });
    try {
      await host.snapshot.delete(snapshotId);
      this.updateState({ notice: { kind: 'ok', text: this.t('replay.snapshotDeleted') } });
      await this.refreshStoredSnapshots();
    } catch (error) {
      this.updateState({ notice: { kind: 'error', text: errorMessage(error) } });
    } finally {
      this.updateState({ busyKey: undefined });
    }
  }

  render() {
    const lastSnapshot = getLastSnapshot();
    const { storedSnapshots, loadingStored, listError, busyKey, block, question, notice } = this.state;

    return (
      <section aria-label={this.t('replay.snapshotReplay')} className="mt-4 border-t border-zinc-800 pt-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">{this.t('replay.snapshotReplay')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {this.t('replay.description')}
          </p>
        </div>

        <div className="grid gap-3">
          <section className="border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold uppercase text-zinc-300">{this.t('replay.lastRun')}</h4>
                <p className="mt-1 text-xs text-zinc-500">
                  {lastSnapshot ? `${lastSnapshot.graphId} - ${lastSnapshot.createdAt}` : this.t('replay.noInMemorySnapshot')}
                </p>
              </div>
              {lastSnapshot ? (
                <button
                  type="button"
                  className="border border-emerald-700 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={Boolean(busyKey)}
                  onClick={() => void this.startReplay({ kind: 'last', snapshot: lastSnapshot })}
                >
                  {this.t('replay.lastRun')}
                </button>
              ) : null}
            </div>
          </section>

          <section className="border border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold uppercase text-zinc-300">{this.t('replay.storedSnapshots')}</h4>
                <p className="mt-1 text-xs text-zinc-500">{this.t('replay.durableSnapshotsOptIn')}</p>
              </div>
              <button
                type="button"
                className="border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loadingStored || Boolean(busyKey)}
                onClick={() => void this.refreshStoredSnapshots()}
              >
                {this.t('replay.refresh')}
              </button>
            </div>

            {listError ? <div className="mb-2 border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">{listError}</div> : null}

            {loadingStored ? <div className="text-xs text-zinc-500">{this.t('replay.loadingStoredSnapshots')}</div> : null}
            {!loadingStored && storedSnapshots.length === 0 ? (
              <div className="border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500">
                {this.t('replay.noStoredSnapshots')}
              </div>
            ) : null}
            {!loadingStored && storedSnapshots.length > 0 ? (
              <div className="divide-y divide-zinc-800 border border-zinc-800">
                {storedSnapshots.map((snapshot) => {
                  const replaySource: ReplaySource = { kind: 'stored', snapshotId: snapshot.id, info: snapshot };
                  return (
                    <div key={snapshot.id} className="grid gap-2 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-100">{snapshot.graphId ?? this.t('replay.unknownGraph')}</div>
                        <div className="truncate text-zinc-500">{snapshot.createdAt ?? this.t('replay.createdTimeUnknown')}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="border border-emerald-700 px-2 py-1 text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={Boolean(busyKey)}
                          onClick={() => void this.startReplay(replaySource)}
                        >
                          {this.t('replay.replay')}
                        </button>
                        <button
                          type="button"
                          className="border border-red-800 px-2 py-1 text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={Boolean(busyKey)}
                          onClick={() => void this.deleteStoredSnapshot(snapshot.id)}
                        >
                          {this.t('replay.delete')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        {notice ? <div className={`mt-3 border px-3 py-2 text-xs ${noticeClass(notice.kind)}`}>{notice.text}</div> : null}
        {block ? this.renderBlock(block, question, busyKey) : null}
      </section>
    );
  }

  private renderBlock(block: ReplayBlockState, question: string, busyKey: string | undefined) {
    if (block.reason === 'question-required') {
      return (
        <section className="mt-3 border border-amber-900 bg-amber-950 p-3 text-xs text-amber-100">
          <h4 className="font-semibold">{this.t('replay.originalQuestionRequired')}</h4>
          <p className="mt-1 text-amber-200">
            {formatI18n(this.t('replay.originalQuestionDescription'), { source: sourceLabel(block.source, this.locale()) })}
          </p>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => this.submitQuestion(event, block)}>
            <input
              className="min-w-0 flex-1 border border-amber-800 bg-zinc-950 px-2 py-1.5 text-zinc-100"
              value={question}
              onChange={(event) => this.updateQuestion(event)}
              placeholder={this.t('replay.originalQuestion')}
            />
            <button
              type="submit"
              className="border border-emerald-700 px-3 py-1.5 text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={Boolean(busyKey) || question.trim().length === 0}
            >
              {this.t('replay.replay')}
            </button>
          </form>
        </section>
      );
    }

    if (block.reason === 'graph-version-mismatch') {
      const detail = versionMismatchDetail(block.detail);
      return (
        <section className="mt-3 border border-amber-900 bg-amber-950 p-3 text-xs text-amber-100">
          <h4 className="font-semibold">{this.t('replay.graphVersionChanged')}</h4>
          <p className="mt-1 text-amber-200">
            {formatI18n(this.t('replay.graphVersionMismatch'), {
              snapshotVersion: detail.snapshotVersion,
              currentVersion: detail.currentVersion,
            })}
          </p>
          <button
            type="button"
            className="mt-3 border border-emerald-700 px-3 py-1.5 text-emerald-100 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={Boolean(busyKey)}
            onClick={() => void this.startReplay(block.source, { replayWithCurrentGraph: true })}
          >
            {this.t('replay.replayWithCurrentGraph')}
          </button>
        </section>
      );
    }

    if (block.reason === 'preflight') {
      const unavailable = block.preflight?.unavailable ?? [];
      const aliased = block.preflight?.aliased ?? [];
      return (
        <section className="mt-3 border border-amber-900 bg-amber-950 p-3 text-xs text-amber-100">
          <h4 className="font-semibold">{this.t('replay.cannotStartReplay')}</h4>
          <p className="mt-1 text-amber-200">{this.t('replay.preflightHelp')}</p>
          {unavailable.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {unavailable.map((provider) => (
                <div key={provider} className="flex items-center justify-between gap-3 border border-amber-800 bg-zinc-950 px-2 py-1.5">
                  <span>{providerName(provider)} {this.t('replay.unavailable')}</span>
                  <button
                    type="button"
                    className="border border-emerald-700 px-2 py-1 text-emerald-100 hover:bg-emerald-950"
                    onClick={() => void host.provider.openLogin(provider)}
                  >
                    {this.t('replay.openLogin')}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {aliased.length > 0 ? <div className="mt-2 text-amber-200">{this.t('replay.aliasedRoles')} {aliased.map(providerName).join(', ')}</div> : null}
        </section>
      );
    }

    if (block.reason === 'not-found') {
      return <div className="mt-3 border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">{this.t('replay.snapshotNotFound')}</div>;
    }

    if (block.reason === 'unknown-graph') {
      const detail = unknownGraphDetail(block.detail);
      return (
        <div className="mt-3 border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">
          {this.t('replay.snapshotGraphUnavailable')}{detail.graphId ? `: ${detail.graphId}` : ''}.
        </div>
      );
    }

    return (
      <div className="mt-3 border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">
        {this.t('replay.blocked')} {block.reason}.
      </div>
    );
  }

  private locale(): Locale {
    return this.props.locale ?? 'en';
  }

  private t(key: I18nKey): string {
    return t(key, this.locale());
  }

  private async planReplayForSource(source: ReplaySource, options: ReplayRunOptions): Promise<ReplayPlan | undefined> {
    try {
      if (source.kind === 'last') return planReplay(source.snapshot, { replayWithCurrentGraph: options.replayWithCurrentGraph });
      const json = await host.snapshot.load(source.snapshotId);
      if (json === null) return undefined;
      return planReplay(parseStoredSnapshot(json), { replayWithCurrentGraph: options.replayWithCurrentGraph });
    } catch {
      return undefined;
    }
  }

  private inputForSource(source: ReplaySource, question?: string): Parameters<typeof replaySnapshot>[0] {
    if (source.kind === 'last') return question ? { snapshot: source.snapshot, question } : { snapshot: source.snapshot };
    return question ? { snapshotId: source.snapshotId, question } : { snapshotId: source.snapshotId };
  }

  private showBlockedResult(source: ReplaySource, result: Extract<ReplayResult, { ok: false }>): void {
    this.updateState({
      block: {
        reason: result.blocked,
        source,
        detail: result.detail,
        preflight: result.preflight,
      },
      question: result.blocked === 'question-required' ? this.state.question : '',
    });
  }

  private submitQuestion(event: FormEvent<HTMLFormElement>, block: ReplayBlockState): void {
    event.preventDefault();
    const question = this.state.question.trim();
    if (!question) return;
    void this.startReplay(block.source, { question });
  }

  private updateQuestion(event: ChangeEvent<HTMLInputElement>): void {
    this.updateState({ question: event.target.value });
  }

  private updateState(patch: Partial<ReplayPanelState>): void {
    if (this.mounted) {
      this.setState(patch as ReplayPanelState);
      return;
    }
    this.state = { ...this.state, ...patch };
  }
}

function sourceKey(source: ReplaySource): string {
  return source.kind === 'last' ? `last:${source.snapshot.snapshotId}` : `stored:${source.snapshotId}`;
}

function sourceLabel(source: ReplaySource, locale: Locale): string {
  return source.kind === 'last' ? t('replay.sourceLastRun', locale) : source.snapshotId;
}

function snapshotTime(snapshot: StoredSnapshotInfo): number {
  const value = Date.parse(snapshot.createdAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function providerName(provider: AIProvider): string {
  return AI_PROVIDERS[provider].name;
}

function noticeClass(kind: ReplayNotice['kind']): string {
  return kind === 'error' ? 'border-red-900 bg-red-950 text-red-200' : 'border-emerald-900 bg-emerald-950 text-emerald-200';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function versionMismatchDetail(detail: unknown): { snapshotVersion?: number; currentVersion?: number } {
  if (!isRecord(detail)) return {};
  return {
    snapshotVersion: typeof detail.snapshotVersion === 'number' ? detail.snapshotVersion : undefined,
    currentVersion: typeof detail.currentVersion === 'number' ? detail.currentVersion : undefined,
  };
}

function unknownGraphDetail(detail: unknown): { graphId?: string } {
  if (!isRecord(detail)) return {};
  return { graphId: typeof detail.graphId === 'string' ? detail.graphId : undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
