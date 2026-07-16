import assert from 'node:assert/strict';
import test from 'node:test';
import { windowsShellCommand } from '../windows-command.mjs';

test('Windows agent commands accept only shell-safe tokens', () => {
  assert.equal(windowsShellCommand('pnpm', ['tauri', 'dev']), 'pnpm tauri dev');
  assert.equal(windowsShellCommand('corepack', ['pnpm', '--version']), 'corepack pnpm --version');

  for (const unsafe of ['space value', 'value&whoami', '%PATH%', '"quoted"', 'line\nbreak']) {
    assert.equal(windowsShellCommand('pnpm', [unsafe]), undefined);
  }
});
