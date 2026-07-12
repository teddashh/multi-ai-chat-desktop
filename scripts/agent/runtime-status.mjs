import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { logPath as defaultLogPath, readyMarker, root, runtimeDir, statePath } from './contract.mjs';
import { processAlive, processMatchesRunner } from './process-identity.mjs';

const ansiColorPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const failurePattern = /(?:^|\s)(?:error(?:\[[^\]]+\])?:|failed\b|panic(?:ked)?\b|ELIFECYCLE\b|command failed\b|could not compile\b)/i;

export function inspectRuntime() {
  if (!existsSync(statePath)) return baseResult('not_started');

  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return baseResult('invalid_state', { error: 'Runtime state is not valid JSON.' });
  }

  if (typeof state.root !== 'string' || !state.root || !samePath(state.root, root)) {
    return baseResult('invalid_state', { error: 'Runtime state belongs to a different repository path.' });
  }
  if (
    !Number.isInteger(state.pid)
    || state.pid <= 0
    || typeof state.runnerToken !== 'string'
    || !state.runnerToken
    || typeof state.startedAt !== 'string'
    || !Number.isFinite(Date.parse(state.startedAt))
  ) {
    return baseResult('invalid_state', { error: 'Runtime state has an invalid process identity.' });
  }

  const resolvedLogPath = state.logPath ? path.resolve(String(state.logPath)) : defaultLogPath;
  if (!isInsideRuntimeDirectory(resolvedLogPath)) {
    return baseResult('invalid_state', {
      pid: state.pid,
      startedAt: state.startedAt,
      error: 'Runtime log path escapes .agent-runtime.',
    });
  }

  const log = existsSync(resolvedLogPath) ? stripAnsi(readFileSync(resolvedLogPath, 'utf8')) : '';
  const runLog = logSegmentForRun(log, state.startedAt);
  const running = processAlive(state.pid);
  const identityMatches = running ? processMatchesRunner(state.pid, state.runnerToken) : false;
  const stateName = classifyRuntime({ running, identityMatches, runLog, marker: readyMarker });
  const lastError = lastFailureLine(runLog);

  return baseResult(stateName, {
    running,
    identityVerified: running && identityMatches,
    ready: stateName === 'ready',
    pid: state.pid,
    startedAt: state.startedAt,
    logPath: resolvedLogPath,
    lastError,
    runLog,
  });
}

export function readinessWaitDecision(runtime, expectedStartedAt, foreignGraceExpired) {
  if (runtime.state === 'not_started') {
    return { kind: 'failed', error: 'The runtime state disappeared before the control pane became ready.' };
  }
  if (runtime.startedAt && runtime.startedAt !== expectedStartedAt) {
    return { kind: 'refused', error: 'Runtime state was replaced by a different launch.' };
  }
  if (runtime.state === 'ready') return { kind: 'ready' };
  if (['failed', 'exited', 'invalid_state'].includes(runtime.state)) {
    return {
      kind: 'failed',
      error: runtime.lastError || runtime.error || 'The launcher exited before the control pane became ready.',
    };
  }
  if (runtime.state === 'foreign_process' && foreignGraceExpired) {
    return { kind: 'refused', error: 'The recorded PID no longer matches this repository launcher.' };
  }
  return { kind: 'pending' };
}

export function classifyRuntime({ running, identityMatches, runLog, marker = readyMarker }) {
  if (running && !identityMatches) return 'foreign_process';
  if (running) return runLog.includes(marker) ? 'ready' : 'building';
  if (!runLog.includes(marker) && lastFailureLine(runLog)) return 'failed';
  return 'exited';
}

export function logSegmentForRun(log, startedAt) {
  if (typeof log !== 'string' || typeof startedAt !== 'string' || !startedAt) return '';
  const header = `[${startedAt}] Launch requested by repository skill`;
  const headerIndex = log.lastIndexOf(header);
  return headerIndex >= 0 ? log.slice(headerIndex) : '';
}

export function recentLogLines(runLog, lineCount) {
  if (!runLog) return [];
  return runLog.trimEnd().split(/\r?\n/).slice(-lineCount);
}

export function stripAnsi(value) {
  return String(value || '').replace(ansiColorPattern, '');
}

function lastFailureLine(runLog) {
  if (!runLog) return undefined;
  const lines = runLog.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (failurePattern.test(line)) return line;
  }
  return undefined;
}

function baseResult(state, values = {}) {
  return {
    state,
    running: false,
    identityVerified: false,
    ready: false,
    pid: undefined,
    startedAt: undefined,
    logPath: defaultLogPath,
    lastError: undefined,
    runLog: '',
    ...values,
  };
}

function isInsideRuntimeDirectory(candidate) {
  return samePath(candidate, runtimeDir) || normalized(candidate).startsWith(`${normalized(runtimeDir)}${path.sep}`);
}

function samePath(left, right) {
  return normalized(path.resolve(left)) === normalized(path.resolve(right));
}

function normalized(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
