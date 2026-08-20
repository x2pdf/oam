import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '../constants';

const KEY_PAIRS: Array<[string, string]> = [
  [LEGACY_STORAGE_KEYS.SUBSCRIPTIONS, STORAGE_KEYS.SUBSCRIPTIONS],
  [LEGACY_STORAGE_KEYS.PROFILE, STORAGE_KEYS.PROFILE],
  [LEGACY_STORAGE_KEYS.API_KEY, STORAGE_KEYS.API_KEY],
  [LEGACY_STORAGE_KEYS.THEME, STORAGE_KEYS.THEME],
  [LEGACY_STORAGE_KEYS.FAVORITES, STORAGE_KEYS.FAVORITES],
  [LEGACY_STORAGE_KEYS.LANGUAGE, STORAGE_KEYS.LANGUAGE],
];

let migratePromise: Promise<void> | null = null;

async function runMigration(): Promise<void> {
  const allKeys = KEY_PAIRS.flat();
  const entries = await AsyncStorage.multiGet(allKeys);
  const values = new Map(entries);

  const toSet: Array<[string, string]> = [];
  const toRemove: string[] = [];

  for (const [legacyKey, nextKey] of KEY_PAIRS) {
    const nextValue = values.get(nextKey);
    const legacyValue = values.get(legacyKey);
    if ((nextValue == null || nextValue === '') && legacyValue != null && legacyValue !== '') {
      toSet.push([nextKey, legacyValue]);
    }
    if (legacyValue != null) {
      toRemove.push(legacyKey);
    }
  }

  if (toSet.length > 0) {
    await AsyncStorage.multiSet(toSet);
  }
  if (toRemove.length > 0) {
    await AsyncStorage.multiRemove(toRemove);
  }
}

/** 将 `@onchaindata_*` 一次性搬到 `@oam_*`。多处启动读取共用同一 Promise。 */
export function migrateLegacyStorage(): Promise<void> {
  if (!migratePromise) {
    migratePromise = runMigration().catch((error) => {
      console.warn('Failed to migrate legacy storage keys:', error);
    });
  }
  return migratePromise;
}
