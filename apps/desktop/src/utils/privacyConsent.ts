export const PRIVACY_POLICY_VERSION = '2026-10-27';

const KEY = 'openreel_privacy_agreed_version';

export function getAgreedVersion(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function hasAgreedPrivacy(): boolean {
  return getAgreedVersion() === PRIVACY_POLICY_VERSION;
}
export function agreePrivacy(): void {
  try { localStorage.setItem(KEY, PRIVACY_POLICY_VERSION); } catch {}
}
export function resetPrivacyForDebug(): void {
  try { localStorage.removeItem(KEY); } catch {}
}
