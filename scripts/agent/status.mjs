import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processAlive, processMatchesRunner } from './process-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeDir = path.join(root, '.agent-runtime');
const statePath = path.join(runtimeDir, 'tauri-dev.json');
const ansiColorPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const linesArgumentIndex = process.argv.indexOf('--lines');
const requestedLines = linesArgumentIndex >= 0 ? Number(process.argv[linesArgumentIndex + 1]) : 40;
const lineCount = Number.isFinite(requestedLines) ? Math.min(200, Math.max(1, requestedLines)) : 40;

try {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (path.resolve(String(state.root || '')) !== root) throw new Error('Runtime state belongs to a different repository');
  const running = processAlive(state.pid) && processMatchesRunner(state.pid, state.runnerToken);
  process.stdout.write(`${running ? 'RUNNING' : 'STOPPED'} pid=${state.pid} started=${state.startedAt} log=${state.logPath}\n`);
  const logPath = state.logPath ? path.resolve(String(state.logPath)) : '';
  if (logPath && logPath.startsWith(`${runtimeDir}${path.sep}`) && existsSync(logPath)) {
    const lines = readFileSync(logPath, 'utf8').replace(ansiColorPattern, '').trimEnd().split(/\r?\n/);
    process.stdout.write(`${lines.slice(-lineCount).join('\n')}\n`);
  }
  if (!running) process.exitCode = 1;
} catch {
  process.stdout.write('NOT_STARTED Run `node scripts/agent/launch.mjs` first.\n');
  process.exitCode = 1;
}
