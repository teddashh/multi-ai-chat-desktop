import { spawn } from 'node:child_process';
import { windowsShellCommand } from './windows-command.mjs';

const [, , runnerToken, command, ...commandArgs] = process.argv;
if (!runnerToken || !command) {
  process.stderr.write('Runner requires a token and command.\n');
  process.exit(2);
}

const windowsCommand = process.platform === 'win32' ? windowsShellCommand(command, commandArgs) : undefined;
if (process.platform === 'win32' && !windowsCommand) {
  process.stderr.write('Runner rejected an unsafe Windows command token.\n');
  process.exit(2);
}

const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : command;
const args = process.platform === 'win32'
  ? ['/d', '/v:off', '/s', '/c', windowsCommand]
  : commandArgs;
const child = spawn(executable, args, {
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  process.stderr.write(`[MAC_AGENT] EXIT error=${error.message}\n`);
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.stdout.write(`[MAC_AGENT] EXIT code=${code ?? 'none'} signal=${signal ?? 'none'}\n`);
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
