import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const portablePackScript = readFileSync(
  new URL('../../scripts/pack-portable.mjs', import.meta.url),
  'utf8',
);

describe('portable package instructions', () => {
  it('points users to releases instead of update controls hidden in portable mode', () => {
    expect(portablePackScript).toContain(
      'https://github.com/teddashh/multi-ai-chat-desktop/releases/latest',
    );
    expect(portablePackScript).not.toContain('Settings -> Check for updates');
  });
});
