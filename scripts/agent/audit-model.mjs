import path from 'node:path';

export function isValidBeforeAudit(candidate, contractVersion, root, platform = process.platform) {
  return Boolean(
    candidate
    && candidate.schemaVersion === 1
    && candidate.contractVersion === contractVersion
    && candidate.command === 'audit'
    && candidate.phase === 'before'
    && typeof candidate.root === 'string'
    && samePath(candidate.root, root, platform)
    && Number.isFinite(Date.parse(candidate.generatedAt))
    && Array.isArray(candidate.checks)
    && Array.isArray(candidate.artifacts),
  );
}

export function isValidLaunchReceipt(candidate, contractVersion, root, platform = process.platform) {
  return Boolean(
    candidate
    && candidate.schemaVersion === 1
    && candidate.contractVersion === contractVersion
    && candidate.outcome === 'accepted'
    && typeof candidate.root === 'string'
    && samePath(candidate.root, root, platform)
    && Number.isFinite(Date.parse(candidate.startedAt))
    && Number.isInteger(candidate.process?.pid)
    && candidate.process.pid > 0
    && candidate.process.stateFile === '.agent-runtime/tauri-dev.json'
    && candidate.process.logFile === '.agent-runtime/tauri-dev.log'
    && candidate.steps
    && typeof candidate.steps === 'object'
    && !Array.isArray(candidate.steps)
    && Array.isArray(candidate.declaredRepositoryEffects)
    && Array.isArray(candidate.declaredUserCacheEffects)
    && Array.isArray(candidate.hostChangesByScript),
  );
}

export function artifactSignature(artifact) {
  return JSON.stringify({
    exists: artifact.exists,
    kind: artifact.kind,
    size: artifact.size,
    modifiedAt: artifact.modifiedAt,
    evidence: artifact.evidence,
  });
}

function samePath(left, right, platform) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const normalize = (value) => platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}
