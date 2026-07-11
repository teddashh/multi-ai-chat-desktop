import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processAlive, processMatchesRunner } from './process-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const statePath = path.join(root, '.agent-runtime', 'tauri-dev.json');

let state;
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'));
} catch {
  process.stdout.write('NOT_RUNNING No repository-launched Tauri process was found.\n');
  process.exit(0);
}

if (path.resolve(String(state.root || '')) !== root) {
  process.stderr.write('REFUSED Runtime state belongs to a different repository path.\n');
  process.exit(1);
}

if (!Number.isInteger(state.pid) || state.pid <= 0 || !processAlive(state.pid)) {
  rmSync(statePath, { force: true });
  process.stdout.write('STOPPED The recorded process had already exited.\n');
  process.exit(0);
}

if (!processMatchesRunner(state.pid, state.runnerToken)) {
  process.stderr.write('REFUSED The recorded PID no longer belongs to this repository launcher.\n');
  process.exit(1);
}

if (process.platform === 'win32') {
  const result = spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 && processAlive(state.pid)) {
    process.stderr.write(`${String(result.stderr || result.stdout || 'Unable to stop the Tauri process.').trim()}\n`);
    process.exit(1);
  }
} else {
  signalProcessTree(state.pid, 'SIGTERM');

  const deadline = Date.now() + 3000;
  while (processAlive(state.pid) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (processAlive(state.pid)) signalProcessTree(state.pid, 'SIGKILL');
}

rmSync(statePath, { force: true });
process.stdout.write(`STOPPED pid=${state.pid}\n`);

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
