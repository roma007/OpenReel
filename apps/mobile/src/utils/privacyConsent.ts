import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRIVACY_POLICY_VERSION = '2026-10-27';
const KEY = '@openreel/privacy_agreed_version';

export async function getAgreedVersion(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY); } catch { return null; }
}
export async function hasAgreedPrivacy(): Promise<boolean> {
  return (await getAgreedVersion()) === PRIVACY_POLICY_VERSION;
}
export async function agreePrivacy(): Promise<void> {
  try { await AsyncStorage.setItem(KEY, PRIVACY_POLICY_VERSION); } catch {}
}
export async function resetPrivacyForDebug(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
