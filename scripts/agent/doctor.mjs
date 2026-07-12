import { commandPayload, root } from './contract.mjs';
import { collectEnvironmentChecks } from './environment.mjs';

const args = process.argv.slice(2);
const invalidArgs = args.filter((arg) => arg !== '--json');
const jsonOutput = args.includes('--json');

if (invalidArgs.length > 0) {
  const payload = commandPayload('doctor', {
    ok: false,
    state: 'invalid_usage',
    error: `Unknown argument: ${invalidArgs[0]}`,
    usage: 'node scripts/agent/doctor.mjs [--json]',
  });
  if (jsonOutput) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stderr.write(`${payload.error}\n${payload.usage}\n`);
  process.exit(2);
}

const checks = collectEnvironmentChecks();
const ok = checks.every((check) => check.ok);
const payload = commandPayload('doctor', {
  ok,
  state: ok ? 'ready' : 'missing_prerequisites',
  platform: process.platform,
  root,
  checks,
});

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  for (const check of checks) process.stdout.write(`${check.ok ? 'OK' : 'MISSING'}  ${check.name}: ${check.detail}\n`);
  if (!ok) {
    process.stdout.write('Install the missing development prerequisite separately, then run this check again. The Agent Skill never changes host toolchains or security settings.\n');
  }
}

if (!ok) process.exitCode = 1;
