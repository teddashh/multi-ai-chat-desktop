import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  commandPayload,
  contractVersion,
  launchLockPath,
  logPath,
  manifest,
  receiptPath,
  root,
  runtimeDir,
  statePath,
} from './contract.mjs';
import { collectEnvironmentChecks, resolvePnpmCommand } from './environment.mjs';
import { processAlive, processMatchesAgentScript } from './process-identity.mjs';
import { inspectRuntime, readinessWaitDecision } from './runtime-status.mjs';

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  emit(commandPayload('launch', {
    ok: false,
    outcome: 'invalid_usage',
    error: parsed.error,
    usage: 'node scripts/agent/launch.mjs [--json] [--dry-run | --wait [--timeout-ms 1000..1800000]]',
  }), parsed.jsonOutput, 2);
} else {
  let result;
  try {
    result = await launch(parsed);
  } catch (error) {
    result = commandFailure('internal', 1, error instanceof Error ? error.message : String(error));
  }
  emit(result.payload, parsed.jsonOutput, result.exitCode);
}

async function launch(options) {
  const checks = collectEnvironmentChecks();
  const prerequisitesOk = checks.every((check) => check.ok);
  const needsInstall = !existsSync(path.join(root, 'node_modules', '.modules.yaml'));
  const currentRuntime = inspectRuntime();

  if (options.dryRun) {
    return dryRunResult({ checks, currentRuntime, needsInstall, options, prerequisitesOk });
  }

  if (!prerequisitesOk) {
    return {
      exitCode: 1,
      payload: commandPayload('launch', {
        ok: false,
        outcome: 'blocked',
        stage: 'doctor',
        error: 'Development prerequisites are missing. The Agent Skill will not install host tools.',
        checks,
      }),
    };
  }

  const lockResult = acquireLaunchLock();
  if (!lockResult.ok) {
    return {
      exitCode: 1,
      payload: commandPayload('launch', {
        ok: false,
        outcome: 'busy',
        error: lockResult.error,
        lockPath: launchLockPath,
      }),
    };
  }

  let heldLock = lockResult.lock;
  try {
    const lockedRuntime = inspectRuntime();
    if (lockedRuntime.state === 'building' || lockedRuntime.state === 'ready') {
      releaseLaunchLock(heldLock);
      heldLock = undefined;
      if (options.wait) return waitForReadiness(options, lockedRuntime.startedAt);
      return {
        exitCode: 0,
        payload: commandPayload('launch', {
          ok: true,
          outcome: 'already_running',
          runtime: publicRuntime(lockedRuntime),
        }),
      };
    }

    if (lockedRuntime.state === 'foreign_process' || lockedRuntime.state === 'invalid_state') {
      return {
        exitCode: 1,
        payload: commandPayload('launch', {
          ok: false,
          outcome: 'refused',
          runtime: publicRuntime(lockedRuntime),
          error: lockedRuntime.error || 'Existing runtime state cannot be safely reused.',
        }),
      };
    }

    if (lockedRuntime.state === 'failed' || lockedRuntime.state === 'exited') rmSync(statePath, { force: true });

    const lockedNeedsInstall = !existsSync(path.join(root, 'node_modules', '.modules.yaml'));
    const pnpm = resolvePnpmCommand();
    const dependencyInstall = lockedNeedsInstall ? 'completed' : 'skipped';
    if (lockedNeedsInstall) {
      const install = runCommand(pnpm.command, [...pnpm.prefixArgs, 'install', '--frozen-lockfile'], options.jsonOutput);
      if (!install.ok) return commandFailure('dependency_install', install.status);
    }

    const injectedBuild = runCommand(pnpm.command, [...pnpm.prefixArgs, 'build:injected'], options.jsonOutput);
    if (!injectedBuild.ok) return commandFailure('injected_build', injectedBuild.status);

    mkdirSync(runtimeDir, { recursive: true });
    const startedAt = new Date().toISOString();
    const logFd = openSync(logPath, 'a');
    writeFileSync(logFd, `\n[${startedAt}] Launch requested by repository skill\n`);

    const runnerToken = randomUUID();
    const runnerPath = path.join(root, 'scripts', 'agent', 'runner.mjs');
    let child;
    try {
      child = spawn(process.execPath, [runnerPath, runnerToken, pnpm.command, ...pnpm.prefixArgs, 'tauri', 'dev'], {
        cwd: root,
        detached: true,
        env: { ...process.env, MAC_AGENT_LAUNCH: '1' },
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
      });
      child.unref();
    } catch (error) {
      closeSync(logFd);
      return commandFailure('process_start', 1, error instanceof Error ? error.message : String(error));
    }
    closeSync(logFd);

    if (!Number.isInteger(child.pid) || child.pid <= 0) {
      return commandFailure('process_start', 1, 'The launcher did not return a process ID.');
    }

    try {
      writeJson(statePath, {
        schemaVersion: 1,
        contractVersion,
        pid: child.pid,
        runnerToken,
        startedAt,
        root,
        logPath,
      });
      writeJson(receiptPath, {
        schemaVersion: 1,
        contractVersion,
        startedAt,
        root,
        outcome: 'accepted',
        process: { pid: child.pid, stateFile: manifest.runtime.stateFile, logFile: manifest.runtime.logFile },
        steps: {
          dependencyInstall,
          injectedBuild: 'completed',
          launcher: 'started',
        },
        declaredRepositoryEffects: manifest.sideEffects.repositoryLocal.map((effect) => effect.path),
        declaredUserCacheEffects: manifest.sideEffects.userCaches,
        hostChangesByScript: [],
      });
    } catch (error) {
      terminateNewProcess(child.pid);
      rmSync(statePath, { force: true });
      return commandFailure('runtime_receipt', 1, error instanceof Error ? error.message : String(error));
    }

    releaseLaunchLock(heldLock);
    heldLock = undefined;

    if (options.wait) return waitForReadiness(options, startedAt);

    return {
      exitCode: 0,
      payload: commandPayload('launch', {
        ok: true,
        outcome: 'accepted',
        state: 'building',
        ready: false,
        pid: child.pid,
        startedAt,
        logPath,
        message: 'The source launch was accepted. Use --wait or agent:status to verify control-pane readiness.',
      }),
    };
  } finally {
    if (heldLock) releaseLaunchLock(heldLock);
  }
}

async function waitForReadiness(options, launchStartedAt) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const runtime = inspectRuntime();
    const decision = readinessWaitDecision(runtime, launchStartedAt, Date.now() - Date.parse(launchStartedAt) > 5000);
    if (decision.kind !== 'pending') return readinessResult(decision, runtime);
    if (!options.jsonOutput) process.stderr.write(`WAITING state=${runtime.state} log=${runtime.logPath}\n`);
    await delay(1000);
  }

  const runtime = inspectRuntime();
  const finalDecision = readinessWaitDecision(runtime, launchStartedAt, true);
  if (finalDecision.kind !== 'pending') return readinessResult(finalDecision, runtime);
  return {
    exitCode: 3,
    payload: commandPayload('launch', {
      ok: false,
      outcome: 'timed_out',
      runtime: publicRuntime(runtime),
      timeoutMs: options.timeoutMs,
      error: 'Timed out before the control pane emitted its READY marker. The process was left running for inspection.',
    }),
  };
}

function readinessResult(decision, runtime) {
  if (decision.kind === 'ready') {
    return {
      exitCode: 0,
      payload: commandPayload('launch', { ok: true, outcome: 'ready', runtime: publicRuntime(runtime) }),
    };
  }
  return {
    exitCode: 1,
    payload: commandPayload('launch', {
      ok: false,
      outcome: decision.kind === 'refused' ? 'refused' : 'failed',
      runtime: publicRuntime(runtime),
      error: decision.error,
    }),
  };
}

function dryRunResult({ checks, currentRuntime, needsInstall, options, prerequisitesOk }) {
  let predictedOutcome;
  let plan;
  let ok = prerequisitesOk;

  if (!prerequisitesOk) {
    predictedOutcome = 'blocked';
    plan = [{ action: 'prerequisite gate', disposition: 'would_block' }];
  } else if (currentRuntime.state === 'foreign_process' || currentRuntime.state === 'invalid_state') {
    ok = false;
    predictedOutcome = 'refused';
    plan = [
      { action: 'acquire launch mutex', disposition: 'would_run' },
      { action: 'reuse runtime state', disposition: 'would_refuse' },
    ];
  } else if (currentRuntime.state === 'building' || currentRuntime.state === 'ready') {
    predictedOutcome = options.wait ? 'would_wait_for_existing' : 'already_running';
    plan = [
      { action: 'acquire launch mutex', disposition: 'would_run' },
      { action: 'existing identity-verified launcher', disposition: options.wait ? 'would_wait' : 'would_reuse' },
    ];
  } else {
    predictedOutcome = 'would_start';
    plan = [
      { action: 'acquire launch mutex', disposition: 'would_run' },
      ...(currentRuntime.state === 'failed' || currentRuntime.state === 'exited'
        ? [{ action: 'remove stale runtime state', disposition: 'would_run' }]
        : []),
      { action: 'pnpm install --frozen-lockfile', disposition: needsInstall ? 'would_run' : 'would_skip' },
      { action: 'pnpm build:injected', disposition: 'would_run' },
      { action: 'pnpm tauri dev', disposition: 'would_start' },
    ];
  }

  return {
    exitCode: ok ? 0 : 1,
    payload: commandPayload('launch', {
      ok,
      outcome: 'dry_run',
      predictedOutcome,
      root,
      prerequisitesOk,
      checks,
      currentRuntime: publicRuntime(currentRuntime),
      writesPerformed: [],
      plan,
    }),
  };
}

function acquireLaunchLock() {
  mkdirSync(runtimeDir, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID();
    let descriptor;
    try {
      descriptor = openSync(launchLockPath, 'wx');
      writeFileSync(descriptor, `${JSON.stringify({
        schemaVersion: 1,
        contractVersion,
        pid: process.pid,
        token,
        root,
        startedAt: new Date().toISOString(),
      }, null, 2)}\n`, 'utf8');
      closeSync(descriptor);
      return { ok: true, lock: { token } };
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          void 0;
        }
      }
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
        if (descriptor !== undefined) rmSync(launchLockPath, { force: true });
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }

      const existing = readJsonFile(launchLockPath);
      if (existing && Number.isInteger(existing.pid) && processAlive(existing.pid)) {
        const verifiedOwner = samePath(existing.root, root) && processMatchesAgentScript(existing.pid, 'launch.mjs');
        return {
          ok: false,
          error: verifiedOwner
            ? `Another repository launch command is active (pid=${existing.pid}).`
            : `A live process owns the launch mutex (pid=${existing.pid}); refusing to steal it because owner identity is unavailable.`,
        };
      }

      let ageMs = Number.POSITIVE_INFINITY;
      try {
        ageMs = Date.now() - statSync(launchLockPath).mtimeMs;
      } catch {
        void 0;
      }
      if (!existing && ageMs < 5000) {
        return { ok: false, error: 'Another launch command is creating the launch mutex; retry shortly.' };
      }
      rmSync(launchLockPath, { force: true });
    }
  }
  return { ok: false, error: 'Unable to acquire the repository launch mutex.' };
}

function releaseLaunchLock(lock) {
  const existing = readJsonFile(launchLockPath);
  if (existing?.token === lock.token) rmSync(launchLockPath, { force: true });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function terminateNewProcess(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { cwd: root, stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      void 0;
    }
  }
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}

function commandFailure(stage, status, error = `Command failed with exit code ${status ?? 1}.`) {
  return {
    exitCode: 1,
    payload: commandPayload('launch', {
      ok: false,
      outcome: 'failed',
      stage,
      error,
      exitCode: status ?? 1,
    }),
  };
}

function runCommand(command, args, jsonOutput) {
  const useCommandShell = process.platform === 'win32' && command !== process.execPath;
  const executable = useCommandShell ? process.env.ComSpec || 'cmd.exe' : command;
  const executableArgs = useCommandShell
    ? ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArgument).join(' ')]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    encoding: jsonOutput ? 'utf8' : undefined,
    stdio: jsonOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });
  if (jsonOutput) {
    if (result.stdout) process.stderr.write(String(result.stdout));
    if (result.stderr) process.stderr.write(String(result.stderr));
  }
  return { ok: result.status === 0, status: result.status ?? 1 };
}

function publicRuntime(runtime) {
  return {
    state: runtime.state,
    running: runtime.running,
    identityVerified: runtime.identityVerified,
    ready: runtime.ready,
    pid: runtime.pid ?? null,
    startedAt: runtime.startedAt ?? null,
    logPath: runtime.logPath,
    lastError: runtime.lastError ?? null,
    ...(runtime.error ? { error: runtime.error } : {}),
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function emit(payload, jsonOutput, exitCode) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (exitCode === 0) {
    process.stdout.write(`${String(payload.outcome || payload.state).toUpperCase()}${payload.pid ? ` pid=${payload.pid}` : ''}${payload.logPath ? ` log=${payload.logPath}` : ''}\n`);
    if (payload.runtime) {
      process.stdout.write(`STATE ${payload.runtime.state}${payload.runtime.pid ? ` pid=${payload.runtime.pid}` : ''} log=${payload.runtime.logPath}\n`);
    }
    if (payload.plan) {
      for (const step of payload.plan) process.stdout.write(`${step.disposition.toUpperCase()} ${step.action}\n`);
    }
    if (payload.message) process.stdout.write(`${payload.message}\n`);
  } else {
    process.stderr.write(`${String(payload.outcome || 'failed').toUpperCase()} ${payload.error || 'Agent launch failed.'}\n`);
    if (payload.usage) process.stderr.write(`${payload.usage}\n`);
  }
  process.exit(exitCode);
}

function parseArgs(args) {
  const options = { ok: true, jsonOutput: false, dryRun: false, wait: false, timeoutMs: 600000 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') options.jsonOutput = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--wait') options.wait = true;
    else if (arg === '--timeout-ms') {
      const timeoutMs = Number(args[index + 1]);
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) {
        return { ok: false, jsonOutput: options.jsonOutput, error: '--timeout-ms must be an integer from 1000 to 1800000.' };
      }
      options.timeoutMs = timeoutMs;
      index += 1;
    } else return { ok: false, jsonOutput: options.jsonOutput, error: `Unknown argument: ${arg}` };
  }
  if (options.dryRun && options.wait) {
    return { ok: false, jsonOutput: options.jsonOutput, error: '--dry-run and --wait cannot be used together.' };
  }
  return options;
}

function quoteWindowsArgument(value) {
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
