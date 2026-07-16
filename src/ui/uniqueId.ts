let fallbackSequence = 0;

export function createUniqueSuffix(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;

    const values = new Uint32Array(4);
    globalThis.crypto?.getRandomValues?.(values);
    if (values.some((value) => value !== 0)) {
      return Array.from(values, (value) => value.toString(36)).join('-');
    }
  } catch {
    // Fall through to a process-local uniqueness suffix.
  }

  fallbackSequence += 1;
  return `${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}
