import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { commandPayload, root, statePath } from './contract.mjs';
import { processAlive } from './process-identity.mjs';
import { inspectRuntime } from './runtime-status.mjs';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const clearInvalidState = args.includes('--clear-invalid-state');
const invalidArgs = args.filter((arg) => arg !== '--json' && arg !== '--clear-invalid-state');
if (invalidArgs.length > 0) {
  finish({
    exitCode: 2,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'invalid_usage',
      error: `Unknown argument: ${invalidArgs[0]}`,
      usage: 'node scripts/agent/stop.mjs [--json] [--clear-invalid-state]',
    }),
  });
}

let runtime = inspectRuntime();
if (runtime.state === 'not_started') {
  finish({ exitCode: 0, payload: commandPayload('stop', { ok: true, outcome: 'not_running' }) });
}
if (clearInvalidState && runtime.state !== 'invalid_state') {
  finish({
    exitCode: 1,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'refused',
      state: runtime.state,
      error: '--clear-invalid-state applies only to inspected invalid state and never stops a valid or foreign process.',
    }),
  });
}
if (runtime.state === 'invalid_state' && clearInvalidState) {
  rmSync(statePath, { force: true });
  finish({
    exitCode: 0,
    payload: commandPayload('stop', {
      ok: true,
      outcome: 'cleared_invalid_state',
      stateFileRemoved: true,
      warning: 'Only corrupt repository state was removed. No unknown process was terminated.',
    }),
  });
}
if (runtime.state === 'invalid_state' || runtime.state === 'foreign_process') {
  finish({
    exitCode: 1,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'refused',
      state: runtime.state,
      error: runtime.error || 'The recorded PID does not belong to this repository launcher.',
      ...(runtime.state === 'invalid_state'
        ? { recovery: 'After inspecting the state/log, explicitly run stop --clear-invalid-state to remove only the corrupt state file.' }
        : {}),
    }),
  });
}
if (runtime.state === 'failed' || runtime.state === 'exited') {
  rmSync(statePath, { force: true });
  finish({
    exitCode: 0,
    payload: commandPayload('stop', {
      ok: true,
      outcome: 'already_exited',
      pid: runtime.pid ?? null,
      stateFileRemoved: true,
    }),
  });
}

const confirmedRuntime = inspectRuntime();
if (confirmedRuntime.state === 'not_started') {
  finish({
    exitCode: 1,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'refused',
      pid: runtime.pid ?? null,
      error: 'Runtime state disappeared during stop verification; no process was terminated.',
    }),
  });
}
if (confirmedRuntime.state === 'failed' || confirmedRuntime.state === 'exited') {
  rmSync(statePath, { force: true });
  finish({
    exitCode: 0,
    payload: commandPayload('stop', {
      ok: true,
      outcome: 'already_exited',
      pid: runtime.pid ?? null,
      stateFileRemoved: true,
    }),
  });
}
if (
  (confirmedRuntime.state !== 'building' && confirmedRuntime.state !== 'ready')
  || !confirmedRuntime.identityVerified
  || confirmedRuntime.pid !== runtime.pid
  || confirmedRuntime.startedAt !== runtime.startedAt
) {
  finish({
    exitCode: 1,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'refused',
      state: confirmedRuntime.state,
      pid: confirmedRuntime.pid ?? runtime.pid ?? null,
      error: 'Runtime identity changed during stop verification; no process was terminated.',
    }),
  });
}
runtime = confirmedRuntime;

if (process.platform === 'win32') {
  const result = spawnSync('taskkill', ['/PID', String(runtime.pid), '/T', '/F'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 && processAlive(runtime.pid)) {
    finish({
      exitCode: 1,
      payload: commandPayload('stop', {
        ok: false,
        outcome: 'failed',
        pid: runtime.pid,
        error: String(result.stderr || result.stdout || 'Unable to stop the Tauri process.').trim(),
      }),
    });
  }
} else {
  signalProcessTree(runtime.pid, 'SIGTERM');
  const deadline = Date.now() + 3000;
  while (processAlive(runtime.pid) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (processAlive(runtime.pid)) signalProcessTree(runtime.pid, 'SIGKILL');
}

if (processAlive(runtime.pid)) {
  finish({
    exitCode: 1,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'failed',
      pid: runtime.pid,
      error: 'The identity-verified launcher process is still running.',
    }),
  });
}

const postKillRuntime = inspectRuntime();
let stateFileRemoved = false;
if (postKillRuntime.state === 'not_started') {
  stateFileRemoved = false;
} else if (
  postKillRuntime.pid === runtime.pid
  && postKillRuntime.startedAt === runtime.startedAt
  && (postKillRuntime.state === 'failed' || postKillRuntime.state === 'exited')
) {
  rmSync(statePath, { force: true });
  stateFileRemoved = true;
} else {
  finish({
    exitCode: 1,
    payload: commandPayload('stop', {
      ok: false,
      outcome: 'state_replaced',
      pid: runtime.pid,
      replacementState: postKillRuntime.state,
      replacementPid: postKillRuntime.pid ?? null,
      error: 'The verified process stopped, but runtime state changed before cleanup. The replacement state was preserved.',
    }),
  });
}
finish({
  exitCode: 0,
  payload: commandPayload('stop', {
    ok: true,
    outcome: 'stopped',
    pid: runtime.pid,
    stateFileRemoved,
  }),
});

function finish({ payload, exitCode }) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    const stream = exitCode === 0 ? process.stdout : process.stderr;
    stream.write(`${String(payload.outcome).toUpperCase()}${payload.pid ? ` pid=${payload.pid}` : ''}${payload.error ? ` ${payload.error}` : ''}\n`);
    if (payload.usage) stream.write(`${payload.usage}\n`);
    if (payload.recovery) stream.write(`${payload.recovery}\n`);
    if (payload.warning) stream.write(`${payload.warning}\n`);
  }
  process.exit(exitCode);
}

function signalProcessTree(pid, signal) {
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    void 0;
  }
  try {
    process.kill(pid, signal);
  } catch {
    void 0;
  }
}
