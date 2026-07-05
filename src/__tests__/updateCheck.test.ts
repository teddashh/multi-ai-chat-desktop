import { describe, expect, it } from 'vitest';
import { compareVersions } from '../ui/updateCheck';

describe('update version comparison', () => {
  it('treats equal versions as not newer', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(false);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(false);
    expect(compareVersions('1.2.3', 'v1.2.3')).toBe(false);
  });

  it('detects newer patch, minor, and major releases', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(true);
    expect(compareVersions('1.2.3', '1.3.0')).toBe(true);
    expect(compareVersions('1.2.3', '2.0.0')).toBe(true);
  });

  it('does not report older versions as newer', () => {
    expect(compareVersions('1.2.3', '1.2.2')).toBe(false);
    expect(compareVersions('1.2.3', '1.1.9')).toBe(false);
    expect(compareVersions('1.2.3', '0.9.9')).toBe(false);
  });

  it('tolerates leading v prefixes', () => {
    expect(compareVersions('v1.2.3', 'v1.2.4')).toBe(true);
    expect(compareVersions('v1.2.3', 'v1.3.0')).toBe(true);
    expect(compareVersions('v1.2.3', 'v2.0.0')).toBe(true);
  });

  it('compares prerelease and build suffixes by numeric core', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.4-beta.1')).toBe(true);
    expect(compareVersions('1.2.3', '1.2.3-beta.1')).toBe(false);
    expect(compareVersions('1.2.3+build.1', '1.2.3+build.2')).toBe(false);
    expect(compareVersions('1.2.3-alpha.1', '1.3.0-alpha.1')).toBe(true);
  });

  it('treats malformed input as not newer', () => {
    expect(compareVersions('1.2.x', '1.2.4')).toBe(false);
    expect(compareVersions('1.2.3', 'latest')).toBe(false);
    expect(compareVersions('', '1.2.4')).toBe(false);
    expect(compareVersions('1.2.3.4', '1.2.5')).toBe(false);
  });
});
