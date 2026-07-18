// Cloudflare challenge detection shared by bootstrap (defer the title bridge while a challenge
// is up) and engine (report login: 'blocked' so the UI can explain the embedded-webview block).
// Kept side-effect free so both bundles can import it without re-running bootstrap.

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
  return hasCloudflareChallengeSignals(
    document.title,
    document.body?.textContent ?? '',
    Boolean(document.querySelector(CHALLENGE_MARKER_SELECTOR)),
  );
}
