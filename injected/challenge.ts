// Cloudflare challenge detection shared by bootstrap and an already-running engine. Bootstrap
// remains passive while a challenge is present; the engine can report a later interstitial as
// blocked without changing bridge startup policy.

import challengeSignals from '../shared/challenge-signals.json';

export function hasCloudflareChallengeSignals(title: string, bodyText: string, challengeMarker: boolean): boolean {
  if (challengeMarker) return true;
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const normalizedBody = bodyText.trim().slice(0, challengeSignals.bodySampleChars).toLocaleLowerCase();
  return (
    challengeSignals.titleSignals.some((signal) => normalizedTitle.includes(signal)) ||
    challengeSignals.bodySignals.some((signal) => normalizedBody.includes(signal))
  );
}

export function isCloudflareChallengeActive(): boolean {
  if (document.querySelector(challengeSignals.markerSelector)) return true;
  if (hasCloudflareChallengeSignals(document.title ?? '', '', false)) return true;
  return hasCloudflareChallengeSignals('', sampleBodyText(), false);
}

export function isGoogleSorryChallenge(provider: string, hostname: string, pathname: string): boolean {
  if (provider !== 'gemini' || hostname.toLocaleLowerCase() !== 'www.google.com') return false;
  return pathname === '/sorry' || pathname.startsWith('/sorry/');
}

export function isProviderChallengeActive(provider: string): boolean {
  return isGoogleSorryChallenge(provider, location.hostname, location.pathname) || isCloudflareChallengeActive();
}

function sampleBodyText(maxChars = challengeSignals.bodySampleChars): string {
  if (!document.body) return '';
  const walker = document.createTreeWalker(document.body, 4);
  let sample = '';
  let node = walker.nextNode();
  while (node && sample.length < maxChars) {
    const text = node.nodeValue;
    if (text) sample += ` ${text.slice(0, maxChars - sample.length)}`;
    node = walker.nextNode();
  }
  return sample.slice(0, maxChars);
}
