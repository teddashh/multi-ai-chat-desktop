// Cloudflare challenge detection shared by bootstrap and an already-running engine. Bootstrap
// remains passive while a challenge is present; the engine can report a later interstitial as
// blocked without changing bridge startup policy.

const CHALLENGE_MARKER_SELECTOR =
  '#challenge-running, #challenge-stage, #cf-challenge-running, form#challenge-form, .h-captcha, [data-hcaptcha-widget-id], iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"]';

export function hasCloudflareChallengeSignals(title: string, bodyText: string, challengeMarker: boolean): boolean {
  if (challengeMarker) return true;
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const normalizedBody = bodyText.trim().slice(0, 2_000).toLocaleLowerCase();
  const titleSignals = [
    'just a moment',
    'attention required',
    'security verification',
    '請稍候',
    '请稍候',
    '安全性驗證',
    '安全验证',
    'セキュリティ検証',
    'sicherheitsüberprüfung',
  ];
  const bodySignals = [
    'verifying you are human',
    'verify you are human',
    'performing security verification',
    'checking if the site connection is secure',
    'complete the security check',
    '驗證您是人類',
    '验证您是人类',
    '確認您是人類',
    '正在驗證您是否為真人',
    '正在執行安全驗證',
    '正在执行安全验证',
    '人間であることを確認しています',
    'sicherheitsüberprüfung',
  ];
  return titleSignals.some((signal) => normalizedTitle.includes(signal)) || bodySignals.some((signal) => normalizedBody.includes(signal));
}

export function isCloudflareChallengeActive(): boolean {
  if (document.querySelector(CHALLENGE_MARKER_SELECTOR)) return true;
  if (hasCloudflareChallengeSignals(document.title ?? '', '', false)) return true;
  return hasCloudflareChallengeSignals('', sampleBodyText(), false);
}

function sampleBodyText(maxChars = 2_000): string {
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
