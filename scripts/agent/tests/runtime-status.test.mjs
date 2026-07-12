import assert from 'node:assert/strict';
import test from 'node:test';
import { readyMarker } from '../contract.mjs';
import { classifyRuntime, logSegmentForRun, readinessWaitDecision } from '../runtime-status.mjs';

test('a READY marker from an earlier run cannot satisfy a new run', () => {
  const oldStartedAt = '2026-01-01T00:00:00.000Z';
  const newStartedAt = '2026-01-02T00:00:00.000Z';
  const log = [
    `[${oldStartedAt}] Launch requested by repository skill`,
    readyMarker,
    `[${newStartedAt}] Launch requested by repository skill`,
    'Compiling multi-ai-chat-desktop',
  ].join('\n');
  const runLog = logSegmentForRun(log, newStartedAt);

  assert.doesNotMatch(runLog, /READY control-pane/);
  assert.equal(classifyRuntime({ running: true, identityMatches: true, runLog }), 'building');
});

test('current-run marker proves control-pane readiness', () => {
  const startedAt = '2026-01-02T00:00:00.000Z';
  const runLog = logSegmentForRun([
    `[${startedAt}] Launch requested by repository skill`,
    readyMarker,
  ].join('\n'), startedAt);

  assert.equal(classifyRuntime({ running: true, identityMatches: true, runLog }), 'ready');
});

test('dead launch distinguishes failure from a normal post-ready exit', () => {
  assert.equal(classifyRuntime({
    running: false,
    identityMatches: false,
    runLog: 'error: could not compile multi-ai-chat-desktop',
  }), 'failed');
  assert.equal(classifyRuntime({
    running: false,
    identityMatches: false,
    runLog: readyMarker,
  }), 'exited');
});

test('a live PID with the wrong runner identity is foreign', () => {
  assert.equal(classifyRuntime({ running: true, identityMatches: false, runLog: '' }), 'foreign_process');
});

test('readiness wait is bound to one launch and treats missing state as failure', () => {
  const expected = '2026-01-02T00:00:00.000Z';
  assert.deepEqual(readinessWaitDecision({ state: 'not_started' }, expected, false), {
    kind: 'failed',
    error: 'The runtime state disappeared before the control pane became ready.',
  });
  assert.deepEqual(readinessWaitDecision({
    state: 'ready',
    startedAt: '2026-01-03T00:00:00.000Z',
  }, expected, true), {
    kind: 'refused',
    error: 'Runtime state was replaced by a different launch.',
  });
  assert.deepEqual(readinessWaitDecision({ state: 'ready', startedAt: expected }, expected, true), { kind: 'ready' });
});
