import { host } from '../../host';
import { eventFromSnapshotPersistenceFailure } from '../../diagnostics/eventLog';
import { recordEventLog } from '../../diagnostics/eventLogStore';
import { redactSnapshot } from './redact';
import { isSnapshotRedactionTier, type ExecutionSnapshot, type SnapshotRedactionTier } from './types';

export interface SnapshotPersistenceOptions {
  enabled?: boolean;
  tier?: SnapshotRedactionTier;
}

export async function persistSnapshotIfEnabled(
  snapshot: ExecutionSnapshot,
  options: SnapshotPersistenceOptions | undefined,
): Promise<void> {
  if (options?.enabled !== true) return;
  const tier = isSnapshotRedactionTier(options.tier) ? options.tier : 'metadata-only';
  try {
    const redacted = await redactSnapshot(snapshot, tier);
    await host.snapshot.save(redacted.snapshotId, JSON.stringify(redacted));
  } catch (reason) {
    recordEventLog(eventFromSnapshotPersistenceFailure(snapshot.snapshotId, reason));
  }
}
