import { describe, expect, it } from 'vitest';
import { redactSnapshot } from '../workflow/snapshot/redact';
import type { ExecutionSnapshot, RedactedValueRef } from '../workflow/snapshot/types';

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const HASH_PATTERN = /^[a-f0-9]{64}$/;

describe('snapshot redaction transform', () => {
  it('drops all ref content and byte lengths at metadata-only', async () => {
    const snapshot = buildFullLocalSnapshot();
    const original = structuredClone(snapshot);

    const redacted = await redactSnapshot(snapshot, 'metadata-only');

    expect(redacted.redactionTier).toBe('metadata-only');
    for (const [, ref] of pairedRefs(original, redacted)) {
      expect(ref).toEqual({ tier: 'metadata-only', kind: 'omitted' });
      expect(ref.byteLength).toBeUndefined();
      expect(ref).not.toHaveProperty('text');
      expect(ref).not.toHaveProperty('sha256');
    }
    expect(snapshot).toEqual(original);
  });

  it('hashes all refs without retaining text at the hashes tier', async () => {
    const snapshot = buildFullLocalSnapshot();
    const original = structuredClone(snapshot);

    const redacted = await redactSnapshot(snapshot, 'hashes');

    expect(redacted.redactionTier).toBe('hashes');
    for (const [source, ref] of pairedRefs(original, redacted)) {
      expect(ref.kind).toBe('hash');
      expect(ref.tier).toBe('hashes');
      expect(ref.byteLength).toBe(source.byteLength);
      expect(ref.byteLength).toBeDefined();
      expect(ref.sha256).toMatch(HASH_PATTERN);
      expect(ref).not.toHaveProperty('text');
    }
    expect(redacted.steps[0].inputRef.sha256).toBe(HELLO_SHA256);
    expect(snapshot).toEqual(original);
  });

  it('keeps prompts and human edits inline but hashes provider outputs at prompt-text', async () => {
    const snapshot = buildFullLocalSnapshot();
    const original = structuredClone(snapshot);

    const redacted = await redactSnapshot(snapshot, 'prompt-text');

    expect(redacted.redactionTier).toBe('prompt-text');
    expect(redacted.userQuestion).toEqual({
      tier: 'prompt-text',
      kind: 'inline',
      text: 'raw user question',
      byteLength: byteLength('raw user question'),
    });
    expect(redacted.steps.map((step) => step.inputRef)).toEqual([
      { tier: 'prompt-text', kind: 'inline', text: 'hello', byteLength: byteLength('hello') },
      { tier: 'prompt-text', kind: 'inline', text: 'follow up prompt', byteLength: byteLength('follow up prompt') },
    ]);
    for (const step of redacted.steps) {
      expect(step.outputRef.kind).toBe('hash');
      expect(step.outputRef.tier).toBe('prompt-text');
      expect(step.outputRef.sha256).toMatch(HASH_PATTERN);
      expect(step.outputRef).not.toHaveProperty('text');
    }
    expect(redacted.humanEdits[0].beforeRef).toEqual({
      tier: 'prompt-text',
      kind: 'inline',
      text: 'draft before edit',
      byteLength: byteLength('draft before edit'),
    });
    expect(redacted.humanEdits[0].afterRef).toEqual({
      tier: 'prompt-text',
      kind: 'inline',
      text: 'draft after edit',
      byteLength: byteLength('draft after edit'),
    });
    for (const [source, ref] of pairedRefs(original, redacted)) {
      expect(ref.byteLength).toBe(source.byteLength);
    }
    expect(snapshot).toEqual(original);
  });

  it('keeps all available text inline at full-local', async () => {
    const snapshot = buildFullLocalSnapshot();
    const original = structuredClone(snapshot);

    const redacted = await redactSnapshot(snapshot, 'full-local');

    expect(redacted.redactionTier).toBe('full-local');
    for (const [source, ref] of pairedRefs(original, redacted)) {
      expect(ref).toEqual({
        tier: 'full-local',
        kind: 'inline',
        text: source.text,
        byteLength: source.byteLength,
      });
    }
    expect(snapshot).toEqual(original);
  });

  it('omits refs without text instead of fabricating hashes or inline text', async () => {
    const snapshot = buildFullLocalSnapshot();
    snapshot.steps[0].inputRef = { tier: 'metadata-only', kind: 'omitted', byteLength: 5 };
    const original = structuredClone(snapshot);

    const redacted = await redactSnapshot(snapshot, 'hashes');

    expect(redacted.redactionTier).toBe('hashes');
    expect(redacted.steps[0].inputRef).toEqual({ tier: 'hashes', kind: 'omitted', byteLength: 5 });
    expect(redacted.steps[0].inputRef).not.toHaveProperty('text');
    expect(redacted.steps[0].inputRef).not.toHaveProperty('sha256');
    expect(snapshot).toEqual(original);
  });
});

function buildFullLocalSnapshot(): ExecutionSnapshot {
  return {
    snapshotId: 'snapshot-redact-test',
    graphId: 'debate',
    graphVersion: 1,
    appVersion: '0.0.0-test',
    createdAt: '2026-07-06T00:00:00.000Z',
    completedAt: '2026-07-06T00:01:00.000Z',
    adapterVersions: { chatgpt: 3, claude: 4 },
    roleMap: { pro: 'chatgpt', con: 'claude' },
    redactionTier: 'full-local',
    userQuestion: inlineRef('raw user question'),
    steps: [
      {
        nodeId: 'pro',
        provider: 'chatgpt',
        inputRef: inlineRef('hello'),
        outputRef: inlineRef('chatgpt output one'),
        status: 'done',
        startedAt: '2026-07-06T00:00:01.000Z',
        completedAt: '2026-07-06T00:00:10.000Z',
      },
      {
        nodeId: 'con',
        provider: 'claude',
        inputRef: inlineRef('follow up prompt'),
        outputRef: inlineRef('claude output two'),
        status: 'done',
        startedAt: '2026-07-06T00:00:11.000Z',
        completedAt: '2026-07-06T00:00:20.000Z',
      },
    ],
    humanEdits: [
      {
        checkpointId: 'relay-1',
        sourceNodeId: 'pro',
        targetNodeId: 'con',
        beforeRef: inlineRef('draft before edit'),
        afterRef: inlineRef('draft after edit'),
        editedAt: '2026-07-06T00:00:30.000Z',
      },
    ],
  };
}

function inlineRef(text: string): RedactedValueRef {
  return {
    tier: 'full-local',
    kind: 'inline',
    text,
    byteLength: byteLength(text),
  };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function pairedRefs(
  source: ExecutionSnapshot,
  target: ExecutionSnapshot,
): Array<readonly [RedactedValueRef, RedactedValueRef]> {
  const sourceRefs = snapshotRefs(source);
  const targetRefs = snapshotRefs(target);
  expect(targetRefs).toHaveLength(sourceRefs.length);
  return sourceRefs.map((sourceRef, index) => [sourceRef, targetRefs[index]] as const);
}

function snapshotRefs(snapshot: ExecutionSnapshot): RedactedValueRef[] {
  return [
    snapshot.userQuestion,
    ...snapshot.steps.flatMap((step) => [step.inputRef, step.outputRef]),
    ...snapshot.humanEdits.flatMap((edit) => [edit.beforeRef, edit.afterRef]),
  ];
}
