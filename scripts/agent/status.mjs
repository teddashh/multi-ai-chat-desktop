import { commandPayload } from './contract.mjs';
import { inspectRuntime, recentLogLines } from './runtime-status.mjs';

const result = parseArgs(process.argv.slice(2));
if (!result.ok) {
  emit(commandPayload('status', {
    ok: false,
    state: 'invalid_usage',
    error: result.error,
    usage: 'node scripts/agent/status.mjs [--json] [--lines 1..200]',
  }), result.jsonOutput, true);
  process.exit(2);
}

const runtime = inspectRuntime();
const recentLog = recentLogLines(runtime.runLog, result.lineCount);
const ok = runtime.state === 'building' || runtime.state === 'ready';
const payload = commandPayload('status', {
  ok,
  state: runtime.state,
  running: runtime.running,
  identityVerified: runtime.identityVerified,
  ready: runtime.ready,
  pid: runtime.pid ?? null,
  startedAt: runtime.startedAt ?? null,
  logPath: runtime.logPath,
  lastError: runtime.lastError ?? null,
  recentLog,
  ...(runtime.error ? { error: runtime.error } : {}),
});

emit(payload, result.jsonOutput, false);
if (!ok) process.exitCode = 1;

function emit(payloadValue, jsonOutput, errorOutput) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payloadValue, null, 2)}\n`);
    return;
  }

  const stream = errorOutput ? process.stderr : process.stdout;
  stream.write(`${String(payloadValue.state).toUpperCase()}${payloadValue.pid ? ` pid=${payloadValue.pid}` : ''}${payloadValue.startedAt ? ` started=${payloadValue.startedAt}` : ''} log=${payloadValue.logPath || ''}\n`);
  if (payloadValue.error) stream.write(`${payloadValue.error}\n`);
  if (payloadValue.lastError) stream.write(`LAST_ERROR ${payloadValue.lastError}\n`);
  if (payloadValue.recentLog?.length) stream.write(`${payloadValue.recentLog.join('\n')}\n`);
  if (payloadValue.usage) stream.write(`${payloadValue.usage}\n`);
}

function parseArgs(args) {
  let jsonOutput = false;
  let lineCount = 40;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      jsonOutput = true;
      continue;
    }
    if (arg === '--lines') {
      const requested = Number(args[index + 1]);
      if (!Number.isInteger(requested) || requested < 1 || requested > 200) {
        return { ok: false, jsonOutput, error: '--lines must be an integer from 1 to 200.' };
      }
      lineCount = requested;
      index += 1;
      continue;
    }
    return { ok: false, jsonOutput, error: `Unknown argument: ${arg}` };
  }
  return { ok: true, jsonOutput, lineCount };
}
