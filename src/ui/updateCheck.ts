export const DEFAULT_RELEASE_REPO = 'teddashh/multi-ai-chat-desktop';

export interface LatestRelease {
  tagName: string;
  htmlUrl: string;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

export function compareVersions(current: string, latest: string): boolean {
  const currentVersion = parseVersion(current);
  const latestVersion = parseVersion(latest);
  if (!currentVersion || !latestVersion) return false;

  if (latestVersion.major !== currentVersion.major) return latestVersion.major > currentVersion.major;
  if (latestVersion.minor !== currentVersion.minor) return latestVersion.minor > currentVersion.minor;
  return latestVersion.patch > currentVersion.patch;
}

function isReleaseRepo(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function releaseFromJson(value: unknown): LatestRelease | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as Partial<Record<'tag_name' | 'html_url', unknown>>;
  if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') return null;

  try {
    const url = new URL(release.html_url);
    if (url.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  return { tagName: release.tag_name, htmlUrl: release.html_url };
}

export async function fetchLatestRelease(repo = DEFAULT_RELEASE_REPO): Promise<LatestRelease | null> {
  if (!isReleaseRepo(repo)) return null;

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    return releaseFromJson(data);
  } catch {
    return null;
  }
}
