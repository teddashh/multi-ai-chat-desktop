import { spawnSync } from 'node:child_process';

export function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return processKillErrorMeansAlive(error);
  }
}

export function processKillErrorMeansAlive(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM');
}

export function processMatchesRunner(pid, runnerToken) {
  if (!Number.isInteger(pid) || pid <= 0 || typeof runnerToken !== 'string' || !runnerToken) return false;
  const commandLine = readCommandLine(pid);
  return commandLineMatchesRunner(commandLine, runnerToken);
}

export function commandLineMatchesRunner(commandLine, runnerToken) {
  if (typeof commandLine !== 'string' || typeof runnerToken !== 'string' || !runnerToken) return false;
  return commandLine.includes(runnerToken) && /(?:^|[\\/])runner\.mjs(?:\s|"|$)/i.test(commandLine);
}

export function processMatchesAgentScript(pid, scriptName) {
  if (!Number.isInteger(pid) || pid <= 0 || !/^[a-z0-9._-]+$/i.test(scriptName)) return false;
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\\\/])${escaped}(?:\\s|"|$)`, 'i').test(readCommandLine(pid));
}

function readCommandLine(pid) {
  if (process.platform === 'win32') {
    const script = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return result.status === 0 ? String(result.stdout || '').trim() : '';
  }

  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}
