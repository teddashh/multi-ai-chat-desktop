import { host } from './host';

export async function getRuntimeAppVersion(): Promise<string | undefined> {
  try {
    const version = await host.app.version();
    const normalized = version.trim();
    return normalized || undefined;
  } catch {
    return undefined;
  }
}
