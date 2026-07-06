import type {
  ExecutionSnapshot,
  ExecutionSnapshotHumanEdit,
  ExecutionSnapshotStep,
  RedactedValueRef,
  SnapshotRedactionTier,
} from './types';

type RefVisibility = 'prompt-or-edit' | 'provider-output';

const ENCODER = new TextEncoder();

export async function redactSnapshot(
  snapshot: ExecutionSnapshot,
  tier: SnapshotRedactionTier,
): Promise<ExecutionSnapshot> {
  const steps = await Promise.all(snapshot.steps.map((step) => redactStep(step, tier)));
  const humanEdits = await Promise.all(snapshot.humanEdits.map((edit) => redactHumanEdit(edit, tier)));

  return {
    ...snapshot,
    adapterVersions: { ...snapshot.adapterVersions },
    roleMap: { ...snapshot.roleMap },
    redactionTier: tier,
    steps,
    humanEdits,
  };
}

async function redactStep(
  step: ExecutionSnapshotStep,
  tier: SnapshotRedactionTier,
): Promise<ExecutionSnapshotStep> {
  const [inputRef, outputRef] = await Promise.all([
    redactRef(step.inputRef, tier, 'prompt-or-edit'),
    redactRef(step.outputRef, tier, 'provider-output'),
  ]);
  return {
    ...step,
    inputRef,
    outputRef,
  };
}

async function redactHumanEdit(
  edit: ExecutionSnapshotHumanEdit,
  tier: SnapshotRedactionTier,
): Promise<ExecutionSnapshotHumanEdit> {
  const [beforeRef, afterRef] = await Promise.all([
    redactRef(edit.beforeRef, tier, 'prompt-or-edit'),
    redactRef(edit.afterRef, tier, 'prompt-or-edit'),
  ]);
  return {
    ...edit,
    beforeRef,
    afterRef,
  };
}

async function redactRef(
  ref: RedactedValueRef,
  tier: SnapshotRedactionTier,
  visibility: RefVisibility,
): Promise<RedactedValueRef> {
  if (tier === 'metadata-only') return omittedRef(ref, tier);
  if (tier === 'hashes') return hashRef(ref, tier);
  if (tier === 'prompt-text') {
    return visibility === 'provider-output' ? hashRef(ref, tier) : inlineRef(ref, tier);
  }
  return inlineRef(ref, tier);
}

function inlineRef(ref: RedactedValueRef, tier: SnapshotRedactionTier): RedactedValueRef {
  if (typeof ref.text !== 'string') return omittedRef(ref, tier);
  return {
    tier,
    kind: 'inline',
    text: ref.text,
    byteLength: ref.byteLength,
  };
}

async function hashRef(ref: RedactedValueRef, tier: SnapshotRedactionTier): Promise<RedactedValueRef> {
  if (typeof ref.text !== 'string') return omittedRef(ref, tier);
  return {
    tier,
    kind: 'hash',
    sha256: await sha256Hex(ref.text),
    byteLength: ref.byteLength,
  };
}

function omittedRef(ref: RedactedValueRef, tier: SnapshotRedactionTier): RedactedValueRef {
  if (tier === 'metadata-only') {
    return {
      tier,
      kind: 'omitted',
    };
  }
  return {
    tier,
    kind: 'omitted',
    byteLength: ref.byteLength,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', ENCODER.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
