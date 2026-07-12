import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import Ajv from 'ajv';
import { manifest, root } from '../contract.mjs';

test('agent release manifest validates against its schema', () => {
  const schema = readJson(path.join(root, 'agent-release.schema.json'));
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addFormat('uri', {
    type: 'string',
    validate(value) {
      try {
        return Boolean(new URL(value));
      } catch {
        return false;
      }
    },
  });
  const validate = ajv.compile(schema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors, null, 2));
});

test('manifest entrypoints and package scripts stay aligned', () => {
  const packageJson = readJson(path.join(root, 'package.json'));
  for (const [name, entrypoint] of Object.entries(manifest.entrypoints)) {
    assert.equal(entrypoint.argv[0], 'node');
    assert.equal(existsSync(path.join(root, entrypoint.argv[1])), true, `${name} entrypoint is missing`);
    assert.equal(packageJson.scripts[`agent:${name}`], entrypoint.argv.join(' '));
  }
  assert.equal(packageJson.scripts['agent:verify'], 'node --test scripts/agent/tests/*.test.mjs');
  assert.match(packageJson.scripts.verify, /pnpm agent:verify/);
});

test('Codex and Claude skills share one maintained instruction body', () => {
  const codexSkill = parseSkill(readFileSync(path.join(root, manifest.skills.codex), 'utf8'));
  const claudeSkill = parseSkill(readFileSync(path.join(root, manifest.skills.claude), 'utf8'));
  const codexMetadata = readFileSync(path.join(root, manifest.skills.codexMetadata), 'utf8');

  assert.equal(codexSkill.body, claudeSkill.body);
  assert.match(codexSkill.frontmatter, /name:\s*launch-multi-ai-chat/);
  assert.doesNotMatch(codexSkill.frontmatter, /disable-model-invocation/);
  assert.match(claudeSkill.frontmatter, /disable-model-invocation:\s*true/);
  assert.match(codexMetadata, /allow_implicit_invocation:\s*false/);
  assert.equal(manifest.skills.implicitInvocation, false);
  assert.equal(manifest.skills.version, manifest.contractVersion);
});

test('contract declares explicit trust and host-change boundaries', () => {
  assert.equal(manifest.trust.invocation, 'explicit-only');
  assert.match(manifest.trust.warning, /JavaScript dependency lifecycle scripts/);
  assert.ok(manifest.permissions.requiresSeparateExplicitApproval.some((item) => item.includes('host toolchains')));
  assert.ok(manifest.permissions.requiresSeparateExplicitApproval.some((item) => item.includes('PATH')));
  assert.ok(manifest.permissions.deniedBySkill.some((item) => item.includes('automatic host rollback')));
  assert.equal(manifest.sideEffects.hostConfigurationByScripts.startsWith('none'), true);
  assert.equal(manifest.privacy.localOnly, true);
  assert.equal(manifest.runtime.launchLock, '.agent-runtime/launch.lock');
  assert.ok(manifest.entrypoints.stop.flags.includes('--clear-invalid-state'));
  for (const effect of manifest.sideEffects.repositoryLocal) {
    assert.ok(effect.evidence.length > 0);
    for (const evidencePath of effect.evidence) {
      const relative = path.relative(path.join(root, effect.path), path.join(root, evidencePath));
      assert.equal(relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)), true);
    }
  }
});

test('all localized READMEs expose the same Agent contract boundary', () => {
  for (const file of ['README.md', 'README.zh-TW.md', 'README.ja.md', 'README.de.md']) {
    const source = readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /agent-release\.json/);
    assert.match(source, /AGENT-READY-SOURCE-RELEASE\.md/);
    assert.match(source, /launch\.mjs --wait --timeout-ms 600000 --json/);
    assert.match(source, /Docker/i);
  }
});

test('lifecycle scripts contain no host package-manager or privilege escalation command', () => {
  const lifecycleFiles = ['doctor.mjs', 'audit.mjs', 'launch.mjs', 'status.mjs', 'stop.mjs'];
  const forbidden = /(?:winget\s+install|brew\s+install|apt(?:-get)?\s+install|rustup\s+install|npm\s+(?:install|i)\s+(?:--global|-g)|pnpm\s+(?:add|install)\s+(?:--global|-g)|\bsudo\b|Start-Process\s+[^\n]*-Verb\s+RunAs)/i;
  for (const file of lifecycleFiles) {
    const source = readFileSync(path.join(root, 'scripts', 'agent', file), 'utf8');
    assert.doesNotMatch(source, forbidden, `${file} must not mutate host prerequisites`);
  }
});

function parseSkill(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, 'SKILL.md must contain YAML frontmatter');
  return { frontmatter: match[1], body: match[2].trim() };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
