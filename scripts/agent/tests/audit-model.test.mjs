import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactSignature, isValidBeforeAudit, isValidLaunchReceipt } from '../audit-model.mjs';

const root = process.platform === 'win32' ? 'C:\\repo' : '/repo';
const valid = {
  schemaVersion: 1,
  contractVersion: '1.0.0',
  command: 'audit',
  phase: 'before',
  generatedAt: '2026-07-12T00:00:00.000Z',
  root,
  checks: [],
  artifacts: [],
};

test('after-audit comparison accepts only the matching before receipt', () => {
  assert.equal(isValidBeforeAudit(valid, '1.0.0', root), true);
  assert.equal(isValidBeforeAudit({ ...valid, command: 'status' }, '1.0.0', root), false);
  assert.equal(isValidBeforeAudit({ ...valid, phase: 'after' }, '1.0.0', root), false);
  assert.equal(isValidBeforeAudit({ ...valid, contractVersion: '2.0.0' }, '1.0.0', root), false);
  assert.equal(isValidBeforeAudit({ ...valid, root: `${root}-other` }, '1.0.0', root), false);
});

test('artifact signature includes evidence probes', () => {
  const base = {
    exists: true,
    kind: 'directory',
    size: 0,
    modifiedAt: '2026-07-12T00:00:00.000Z',
    evidence: [{ path: 'generated.js', exists: true, size: 1 }],
  };
  assert.notEqual(artifactSignature(base), artifactSignature({
    ...base,
    evidence: [{ path: 'generated.js', exists: true, size: 2 }],
  }));
});

test('audit accepts only a same-contract same-repository launch receipt', () => {
  const receipt = {
    schemaVersion: 1,
    contractVersion: '1.0.0',
    outcome: 'accepted',
    root,
    startedAt: '2026-07-12T00:00:00.000Z',
    process: {
      pid: 42,
      stateFile: '.agent-runtime/tauri-dev.json',
      logFile: '.agent-runtime/tauri-dev.log',
    },
    steps: {},
    declaredRepositoryEffects: [],
    declaredUserCacheEffects: [],
    hostChangesByScript: [],
  };
  assert.equal(isValidLaunchReceipt(receipt, '1.0.0', root), true);
  assert.equal(isValidLaunchReceipt({ ...receipt, root: `${root}-other` }, '1.0.0', root), false);
  assert.equal(isValidLaunchReceipt({ ...receipt, contractVersion: '2.0.0' }, '1.0.0', root), false);
  assert.equal(isValidLaunchReceipt({ ...receipt, process: { ...receipt.process, pid: 0 } }, '1.0.0', root), false);
});
