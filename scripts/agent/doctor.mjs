import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const jsonOutput = process.argv.includes('--json');
const checks = [];

checks.push({ name: 'repository', ok: existsSync(path.join(root, 'package.json')) && existsSync(path.join(root, 'src-tauri', 'Cargo.toml')), detail: root });
checks.push({ name: 'node', ok: Number(process.versions.node.split('.')[0]) >= 20, detail: process.version });
checks.push(commandCheck('pnpm', ['--version']));
checks.push(commandCheck('cargo', ['--version']));
checks.push(commandCheck('rustc', ['--version']));

if (process.platform === 'darwin') checks.push(commandCheck('xcode-select', ['-p'], 'xcode-command-line-tools'));
if (process.platform === 'linux') {
  checks.push({
    name: 'desktop-session',
    ok: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
    detail: process.env.WAYLAND_DISPLAY ? `WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY}` : process.env.DISPLAY ? `DISPLAY=${process.env.DISPLAY}` : 'No graphical desktop detected',
  });
  checks.push(commandCheck('pkg-config', ['--exists', 'webkit2gtk-4.1'], 'webkit2gtk-4.1'));
}

const ok = checks.every((check) => check.ok);
if (jsonOutput) {
  process.stdout.write(`${JSON.stringify({ ok, platform: process.platform, root, checks }, null, 2)}\n`);
} else {
  for (const check of checks) process.stdout.write(`${check.ok ? 'OK' : 'MISSING'}  ${check.name}: ${check.detail}\n`);
  if (!ok) process.stdout.write('Install the missing development prerequisite, then run this check again. No installer build is required.\n');
}

if (!ok) process.exitCode = 1;

function commandCheck(command, args, name = command) {
  const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : command;
  const executableArgs = process.platform === 'win32' ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = String(result.stdout || result.stderr || result.error?.message || '').trim().split(/\r?\n/, 1)[0];
  const detail = output || (result.status === 0 ? 'available' : 'not found');
  return { name, ok: result.status === 0, detail };
}
