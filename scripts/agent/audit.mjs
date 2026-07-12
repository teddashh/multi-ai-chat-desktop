import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  auditAfterPath,
  auditBeforePath,
  commandPayload,
  manifest,
  receiptPath,
  resolveRepoPath,
  root,
  runtimeDir,
} from './contract.mjs';
import { artifactSignature, isValidBeforeAudit, isValidLaunchReceipt } from './audit-model.mjs';
import { collectEnvironmentChecks } from './environment.mjs';
import { inspectRuntime } from './runtime-status.mjs';

const options = parseArgs(process.argv.slice(2));
if (!options.ok) finish(commandPayload('audit', {
  ok: false,
  outcome: 'invalid_usage',
  error: options.error,
  usage: 'node scripts/agent/audit.mjs [--json] [--phase current|before|after] [--write]',
}), options.jsonOutput, 2);

const checks = collectEnvironmentChecks();
const artifacts = manifest.sideEffects.repositoryLocal.map((effect) => artifactRecord(effect));
const runtime = inspectRuntime();
const beforeAuditExists = options.phase === 'after' && existsSync(auditBeforePath);
const beforeAuditCandidate = beforeAuditExists ? readJson(auditBeforePath) : undefined;
const beforeAudit = isValidBeforeAudit(beforeAuditCandidate, manifest.contractVersion, root) ? beforeAuditCandidate : undefined;
const beforeAuditWarning = options.phase === 'after' && !beforeAudit
  ? beforeAuditExists
    ? 'The audit-before receipt is invalid or belongs to another contract/repository; comparison is unavailable.'
    : 'No audit-before receipt was found; comparison is unavailable.'
  : undefined;
const launchReceiptExists = existsSync(receiptPath);
const launchReceiptCandidate = launchReceiptExists ? readJson(receiptPath) : undefined;
const launchReceipt = isValidLaunchReceipt(launchReceiptCandidate, manifest.contractVersion, root)
  ? launchReceiptCandidate
  : undefined;
const generatedAt = new Date().toISOString();
const payload = commandPayload('audit', {
  ok: true,
  outcome: 'recorded',
  phase: options.phase,
  generatedAt,
  platform: process.platform,
  root,
  prerequisitesOk: checks.every((check) => check.ok),
  checks,
  declaredPermissions: manifest.permissions,
  declaredSideEffects: manifest.sideEffects,
  artifacts,
  runtime: publicRuntime(runtime),
  lastLaunchReceipt: launchReceipt ?? null,
  comparison: options.phase === 'after' ? compareAudits(beforeAudit, { checks, artifacts, runtime }) : null,
  ...(beforeAuditWarning ? { warning: beforeAuditWarning } : {}),
  ...(launchReceiptExists && !launchReceipt
    ? { receiptWarning: 'The last-launch receipt is invalid or belongs to another contract/repository; it was not accepted as audit evidence.' }
    : {}),
});

if (options.write) {
  const outputPath = options.phase === 'before' ? auditBeforePath : auditAfterPath;
  mkdirSync(runtimeDir, { recursive: true });
  payload.writtenTo = outputPath;
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

finish(payload, options.jsonOutput, 0);

function artifactRecord(effect) {
  const resolved = resolveRepoPath(effect.path);
  const evidence = effect.evidence.map((evidencePath) => evidenceRecord(evidencePath));
  if (!existsSync(resolved)) return { ...effect, exists: false, kind: null, size: null, modifiedAt: null, evidence };
  const stat = lstatSync(resolved);
  return {
    ...effect,
    exists: true,
    kind: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symbolic_link' : 'other',
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    evidence,
  };
}

function evidenceRecord(relativePath) {
  const resolved = resolveRepoPath(relativePath);
  if (!existsSync(resolved)) return { path: relativePath, exists: false, kind: null, size: null, modifiedAt: null };
  const stat = lstatSync(resolved);
  return {
    path: relativePath,
    exists: true,
    kind: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symbolic_link' : 'other',
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function compareAudits(before, after) {
  if (!before) return null;
  const beforeArtifacts = new Map((before.artifacts || []).map((artifact) => [artifact.path, artifact]));
  const artifactChanges = after.artifacts.flatMap((artifact) => {
    const previous = beforeArtifacts.get(artifact.path);
    if (!previous) return [{ path: artifact.path, change: 'new_contract_path' }];
    if (previous.exists !== artifact.exists) return [{ path: artifact.path, change: artifact.exists ? 'created' : 'removed' }];
    if (artifactSignature(previous) !== artifactSignature(artifact)) {
      return [{ path: artifact.path, change: 'metadata_changed' }];
    }
    return [];
  });
  const beforeChecks = new Map((before.checks || []).map((check) => [check.name, check]));
  const checkChanges = after.checks.flatMap((check) => {
    const previous = beforeChecks.get(check.name);
    if (!previous || previous.ok !== check.ok || previous.detail !== check.detail) {
      return [{ name: check.name, before: previous ?? null, after: check }];
    }
    return [];
  });
  return {
    beforeGeneratedAt: before.generatedAt ?? null,
    artifactChanges,
    checkChanges,
    runtimeState: { before: before.runtime?.state ?? null, after: after.runtime.state },
    hostRollbackPerformed: false,
  };
}

function publicRuntime(runtime) {
  return {
    state: runtime.state,
    running: runtime.running,
    identityVerified: runtime.identityVerified,
    ready: runtime.ready,
    pid: runtime.pid ?? null,
    startedAt: runtime.startedAt ?? null,
    logPath: runtime.logPath,
    lastError: runtime.lastError ?? null,
    ...(runtime.error ? { error: runtime.error } : {}),
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function finish(payload, jsonOutput, exitCode) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (exitCode === 0) {
    process.stdout.write(`AUDIT phase=${payload.phase} prerequisites=${payload.prerequisitesOk ? 'ready' : 'missing'} runtime=${payload.runtime.state}${payload.writtenTo ? ` written=${payload.writtenTo}` : ''}\n`);
    if (payload.warning) process.stdout.write(`${payload.warning}\n`);
    if (payload.receiptWarning) process.stdout.write(`${payload.receiptWarning}\n`);
  } else {
    process.stderr.write(`${payload.error}\n${payload.usage}\n`);
  }
  process.exit(exitCode);
}

function parseArgs(args) {
  const options = { ok: true, jsonOutput: false, phase: 'current', write: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') options.jsonOutput = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--phase') {
      const phase = args[index + 1];
      if (!['current', 'before', 'after'].includes(phase)) {
        return { ok: false, jsonOutput: options.jsonOutput, error: '--phase must be current, before, or after.' };
      }
      options.phase = phase;
      index += 1;
    } else return { ok: false, jsonOutput: options.jsonOutput, error: `Unknown argument: ${arg}` };
  }
  if (options.write && options.phase === 'current') {
    return { ok: false, jsonOutput: options.jsonOutput, error: '--write requires --phase before or --phase after.' };
  }
  return options;
}
