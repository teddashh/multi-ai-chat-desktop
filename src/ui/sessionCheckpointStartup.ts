import { host, type StoredSnapshotInfo } from '../host';
import { parseSessionCheckpoint, type SessionCheckpoint } from '../workflow/sessionCheckpoint';

export interface StartupSessionCheckpointNotice {
  checkpoint: SessionCheckpoint;
  replaySnapshot?: StoredSnapshotInfo;
}

export async function loadStartupSessionCheckpointNotice(): Promise<StartupSessionCheckpointNotice | undefined> {
  const raw = await host.sessionCheckpoint.load();
  if (!raw) return undefined;

  const checkpoint = parseSessionCheckpoint(raw);
  if (!checkpoint) return undefined;

  return {
    checkpoint,
    replaySnapshot: await matchingSnapshot(checkpoint.graphId),
  };
}

export async function clearStartupSessionCheckpointNotice(): Promise<void> {
  try {
    await host.sessionCheckpoint.clear();
  } catch {
    // Startup checkpoint dismissal is best-effort.
  }
}

async function matchingSnapshot(graphId: string): Promise<StoredSnapshotInfo | undefined> {
  try {
    const snapshots = await host.snapshot.list();
    return snapshots.find((snapshot) => snapshot.graphId === graphId);
  } catch {
    return undefined;
  }
}
