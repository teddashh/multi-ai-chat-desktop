import { spawn } from 'node:child_process';

const [, , runnerToken, command, ...commandArgs] = process.argv;
if (!runnerToken || !command) {
  process.stderr.write('Runner requires a token and command.\n');
  process.exit(2);
}

const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : command;
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', [command, ...commandArgs].map(quoteWindowsArgument).join(' ')]
  : commandArgs;
const child = spawn(executable, args, {
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

function quoteWindowsArgument(value) {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
