import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@openreel/privacy_agreed_v1';

export async function hasAgreedPrivacy(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function agreePrivacy(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {}
}

export async function resetPrivacyForDebug(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
