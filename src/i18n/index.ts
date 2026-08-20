import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import { migrateLegacyStorage } from '../storage/migrate';
import en from './locales/en.json';
import zh from './locales/zh.json';

const LANGUAGE_KEY = STORAGE_KEYS.LANGUAGE;

const resources = {
  en: { translation: en },
  zh: { translation: zh },
};

const initI18n = async () => {
  await migrateLegacyStorage();
  let savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);

  if (!savedLanguage) {
    savedLanguage = 'zh'; // Default to Chinese as per request context
  }

  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: savedLanguage,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
};

initI18n();

export default i18n;
export { LANGUAGE_KEY };
