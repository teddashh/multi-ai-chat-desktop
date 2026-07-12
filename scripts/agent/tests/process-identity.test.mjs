import assert from 'node:assert/strict';
import test from 'node:test';
import { commandLineMatchesRunner, processKillErrorMeansAlive } from '../process-identity.mjs';

test('runner identity requires both runner path and exact token text', () => {
  const token = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(commandLineMatchesRunner(`node C:\\repo\\scripts\\agent\\runner.mjs ${token} pnpm tauri dev`, token), true);
  assert.equal(commandLineMatchesRunner(`/usr/bin/node /repo/scripts/agent/runner.mjs ${token} pnpm tauri dev`, token), true);
  assert.equal(commandLineMatchesRunner(`node C:\\repo\\scripts\\agent\\runner.mjs wrong-token`, token), false);
  assert.equal(commandLineMatchesRunner(`node C:\\repo\\scripts\\agent\\other.mjs ${token}`, token), false);
});

test('EPERM from signal zero still means the process exists', () => {
  assert.equal(processKillErrorMeansAlive({ code: 'EPERM' }), true);
  assert.equal(processKillErrorMeansAlive({ code: 'ESRCH' }), false);
  assert.equal(processKillErrorMeansAlive(undefined), false);
});
