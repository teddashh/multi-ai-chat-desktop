import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const manifestPath = path.join(root, 'agent-release.json');
export const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
export const contractVersion = manifest.contractVersion;
export const runtimeDir = resolveRepoPath(manifest.runtime.directory);
export const statePath = resolveRepoPath(manifest.runtime.stateFile);
export const launchLockPath = resolveRepoPath(manifest.runtime.launchLock);
export const logPath = resolveRepoPath(manifest.runtime.logFile);
export const receiptPath = resolveRepoPath(manifest.runtime.launchReceipt);
export const auditBeforePath = resolveRepoPath(manifest.runtime.auditBefore);
export const auditAfterPath = resolveRepoPath(manifest.runtime.auditAfter);
export const readyMarker = manifest.runtime.readyMarker;

export function resolveRepoPath(relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Agent manifest path escapes repository: ${relativePath}`);
  }
  return resolved;
}

export function commandPayload(command, payload) {
  return {
    schemaVersion: 1,
    contractVersion,
    command,
    ...payload,
  };
}
