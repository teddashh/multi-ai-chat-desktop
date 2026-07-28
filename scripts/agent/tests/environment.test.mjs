import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupportedNodeVersion, supportedNodeRange } from '../environment.mjs';

test('Node prerequisite matches the package-manager and lint-tool intersection', () => {
  assert.equal(supportedNodeRange, '^22.13.0 || >=24.0.0');

  for (const version of ['22.13.0', 'v22.99.1', '24.0.0', '25.1.0']) {
    assert.equal(isSupportedNodeVersion(version), true, `${version} should be supported`);
  }

  for (const version of ['20.19.0', '22.12.9', '23.11.0', 'invalid']) {
    assert.equal(isSupportedNodeVersion(version), false, `${version} should be rejected`);
  }
});
