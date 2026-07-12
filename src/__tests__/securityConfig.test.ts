import { describe, expect, it } from 'vitest';
import capability from '../../src-tauri/capabilities/default.json';
import tauriConfig from '../../src-tauri/tauri.conf.json';

describe('Tauri control-pane security boundary', () => {
  it('grants IPC only to the local main webview', () => {
    expect(capability).toMatchObject({ webviews: ['main'] });
    expect(capability).not.toHaveProperty('windows');
    expect(capability).not.toHaveProperty('remote');
  });

  it('enables a production CSP while leaving Vite development usable', () => {
    expect(tauriConfig.app.security).toMatchObject({
      csp: {
        'default-src': "'self'",
        'connect-src': 'ipc: http://ipc.localhost https://api.github.com',
        'img-src': "'self' asset: http://asset.localhost blob: data:",
        'style-src': "'self' 'unsafe-inline'",
      },
      devCsp: null,
    });
  });
});
