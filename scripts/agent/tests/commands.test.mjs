import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { contractVersion, launchLockPath, statePath, root } from '../contract.mjs';

test('doctor emits the versioned JSON contract', () => {
  const result = runScript('doctor.mjs', ['--json']);
  assert.ok([0, 1].includes(result.status), result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.contractVersion, contractVersion);
  assert.equal(payload.command, 'doctor');
  assert.equal(payload.root, root);
  assert.ok(Array.isArray(payload.checks));
  assert.equal(payload.ok, payload.checks.every((check) => check.ok));
});

test('launch dry-run reports a plan without changing runtime state', () => {
  const beforeState = fileSnapshot(statePath);
  const beforeLock = fileSnapshot(launchLockPath);
  const result = runScript('launch.mjs', ['--dry-run', '--json']);
  const afterState = fileSnapshot(statePath);
  const afterLock = fileSnapshot(launchLockPath);

  assert.ok([0, 1].includes(result.status), result.stderr);
  assert.deepEqual(afterState, beforeState);
  assert.deepEqual(afterLock, beforeLock);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'launch');
  assert.equal(payload.outcome, 'dry_run');
  assert.deepEqual(payload.writesPerformed, []);
  if (payload.prerequisitesOk) {
    assert.equal(payload.predictedOutcome, 'would_start');
    assert.equal(payload.plan.some((step) => step.disposition === 'would_start'), true);
  } else {
    assert.equal(payload.predictedOutcome, 'blocked');
    assert.deepEqual(payload.plan, [{ action: 'prerequisite gate', disposition: 'would_block' }]);
  }
});

test('audit current is read-only and emits declared effects', () => {
  const beforeState = fileSnapshot(statePath);
  const result = runScript('audit.mjs', ['--phase', 'current', '--json']);
  const afterState = fileSnapshot(statePath);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(afterState, beforeState);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.command, 'audit');
  assert.equal(payload.phase, 'current');
  assert.ok(Array.isArray(payload.artifacts));
  assert.equal(payload.artifacts.every((artifact) => Array.isArray(artifact.evidence) && artifact.evidence.length > 0), true);
  assert.equal(payload.declaredSideEffects.hostConfigurationByScripts.startsWith('none'), true);
});

test('commands reject invalid usage with exit code 2', () => {
  const doctor = runScript('doctor.mjs', ['--json', '--unknown']);
  const launch = runScript('launch.mjs', ['--json', '--dry-run', '--wait']);
  const status = runScript('status.mjs', ['--json', '--lines', '0']);
  const audit = runScript('audit.mjs', ['--json', '--write']);
  const stop = runScript('stop.mjs', ['--json', '--unknown']);

  for (const result of [doctor, launch, status, audit, stop]) {
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, false);
  }
});

function runScript(name, args) {
  return spawnSync(process.execPath, [`scripts/agent/${name}`, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function fileSnapshot(filePath) {
  return existsSync(filePath) ? { exists: true, content: readFileSync(filePath, 'utf8') } : { exists: false };
}
