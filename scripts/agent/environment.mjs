import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './contract.mjs';

export function collectEnvironmentChecks() {
  const checks = [
    {
      name: 'repository',
      ok: existsSync(path.join(root, 'package.json')) && existsSync(path.join(root, 'src-tauri', 'Cargo.toml')),
      detail: root,
    },
    {
      name: 'node',
      ok: Number(process.versions.node.split('.')[0]) >= 20,
      detail: process.version,
    },
    resolvePnpmCheck(),
    commandCheck('cargo', ['--version']),
    commandCheck('rustc', ['--version']),
  ];

  if (process.platform === 'win32') checks.push(windowsMsvcCheck());
  if (process.platform === 'darwin') checks.push(commandCheck('xcode-select', ['-p'], 'xcode-command-line-tools'));
  if (process.platform === 'linux') {
    checks.push({
      name: 'desktop-session',
      ok: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
      detail: process.env.WAYLAND_DISPLAY
        ? `WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY}`
        : process.env.DISPLAY
          ? `DISPLAY=${process.env.DISPLAY}`
          : 'No graphical desktop detected',
    });
    checks.push(commandCheck('pkg-config', ['--exists', 'webkit2gtk-4.1'], 'webkit2gtk-4.1'));
  }

  return checks;
}

export function resolvePnpmCommand() {
  if (commandCheck('pnpm', ['--version']).ok) return { command: 'pnpm', prefixArgs: [] };
  return { command: 'corepack', prefixArgs: ['pnpm'] };
}

export function commandCheck(command, args, name = command) {
  const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : command;
  const executableArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArgument).join(' ')]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = String(result.stdout || result.stderr || result.error?.message || '').trim().split(/\r?\n/, 1)[0];
  const detail = output || (result.status === 0 ? 'available' : 'not found');
  return { name, ok: result.status === 0, detail };
}

function resolvePnpmCheck() {
  const direct = commandCheck('pnpm', ['--version']);
  if (direct.ok) return direct;

  const viaCorepack = commandCheck('corepack', ['pnpm', '--version'], 'pnpm');
  if (viaCorepack.ok) return { ...viaCorepack, detail: `${viaCorepack.detail} (via Corepack)` };

  return {
    name: 'pnpm',
    ok: false,
    detail: 'pnpm not found; install pnpm or enable Corepack',
  };
}

function windowsMsvcCheck() {
  const fromPath = commandCheck('where', ['cl'], 'msvc-cpp-build-tools');
  if (fromPath.ok) return fromPath;

  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const vswhere = programFilesX86 ? path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe') : '';
  if (vswhere && existsSync(vswhere)) {
    const result = spawnSync(vswhere, [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    const installationPath = String(result.stdout || '').trim();
    if (result.status === 0 && installationPath) {
      return { name: 'msvc-cpp-build-tools', ok: true, detail: installationPath };
    }
  }

  return {
    name: 'msvc-cpp-build-tools',
    ok: false,
    detail: 'Install Visual Studio Build Tools with Desktop development with C++',
  };
}

function quoteWindowsArgument(value) {
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
