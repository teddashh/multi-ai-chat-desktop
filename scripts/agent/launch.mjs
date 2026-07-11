import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeDir = path.join(root, '.agent-runtime');
const statePath = path.join(runtimeDir, 'tauri-dev.json');
const logPath = path.join(runtimeDir, 'tauri-dev.log');
const dryRun = process.argv.includes('--dry-run');

const existing = readState();
if (existing?.pid && processAlive(existing.pid)) {
  process.stdout.write(`ALREADY_RUNNING pid=${existing.pid} log=${existing.logPath || logPath}\n`);
  process.exit(0);
}
if (existing) rmSync(statePath, { force: true });

run(process.execPath, [path.join(root, 'scripts', 'agent', 'doctor.mjs')]);

const needsInstall = !existsSync(path.join(root, 'node_modules', '.modules.yaml'));
if (dryRun) {
  process.stdout.write(`DRY_RUN root=${root}\n`);
  process.stdout.write(`${needsInstall ? 'WOULD_RUN' : 'SKIP'} pnpm install --frozen-lockfile\n`);
  process.stdout.write('WOULD_RUN pnpm build:injected\n');
  process.stdout.write('WOULD_START pnpm tauri dev\n');
  process.exit(0);
}

if (needsInstall) run('pnpm', ['install', '--frozen-lockfile']);
run('pnpm', ['build:injected']);

mkdirSync(runtimeDir, { recursive: true });
const logFd = openSync(logPath, 'a');
const startedAt = new Date().toISOString();
writeFileSync(logFd, `\n[${startedAt}] Launch requested by repository skill\n`);

const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';
const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm tauri dev'] : ['tauri', 'dev'];
const child = spawn(command, args, {
  cwd: root,
  detached: true,
  env: { ...process.env, MAC_AGENT_LAUNCH: '1' },
  stdio: ['ignore', logFd, logFd],
  windowsHide: true,
});
child.unref();
closeSync(logFd);

writeFileSync(
  statePath,
  `${JSON.stringify({ pid: child.pid, startedAt, root, logPath }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`STARTED pid=${child.pid} log=${logPath}\n`);
process.stdout.write('The Tauri window will open after the first Rust build finishes. Keep this repository folder available while it runs.\n');

function run(command, args) {
  const useCommandShell = process.platform === 'win32' && command !== process.execPath;
  const executable = useCommandShell ? process.env.ComSpec || 'cmd.exe' : command;
  const executableArgs = useCommandShell ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
