import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const statePath = path.join(root, '.agent-runtime', 'tauri-dev.json');
const ansiColorPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

try {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const running = processAlive(state.pid);
  process.stdout.write(`${running ? 'RUNNING' : 'STOPPED'} pid=${state.pid} started=${state.startedAt} log=${state.logPath}\n`);
  if (state.logPath) {
    const lines = readFileSync(state.logPath, 'utf8').replace(ansiColorPattern, '').trimEnd().split(/\r?\n/);
    process.stdout.write(`${lines.slice(-30).join('\n')}\n`);
  }
  if (!running) process.exitCode = 1;
} catch {
  process.stdout.write('NOT_STARTED Run `node scripts/agent/launch.mjs` first.\n');
  process.exitCode = 1;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
