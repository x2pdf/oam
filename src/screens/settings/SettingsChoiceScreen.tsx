import React, { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useThemePreference, ThemeMode, FONT_SCALE_PRESETS } from '../../context/ThemeContext';
import { LANGUAGE_KEY } from '../../i18n';
import { RootStackParamList } from '../../types';
import { RadioChoiceList } from '../../components/RadioChoiceList';
import { SettingsPageShell } from './SettingsPageShell';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsChoice'>;

export default function SettingsChoiceScreen({ route }: Props) {
  const { type } = route.params;
  const { t, i18n } = useTranslation();
  const { themeMode, setThemeMode, fontScale, setFontScale } = useThemePreference();
  const currentLanguage = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  const changeLanguage = useCallback(
    async (lng: string) => {
      await i18n.changeLanguage(lng);
      await AsyncStorage.setItem(LANGUAGE_KEY, lng);
    },
    [i18n],
  );

  if (type === 'language') {
    return (
      <SettingsPageShell>
        <RadioChoiceList
          value={currentLanguage}
          onValueChange={(lng) => {
            void changeLanguage(lng);
          }}
          options={[
            { value: 'zh', label: '简体中文' },
            { value: 'en', label: 'English' },
          ]}
        />
      </SettingsPageShell>
    );
  }

  if (type === 'appearance') {
    return (
      <SettingsPageShell>
        <RadioChoiceList
          value={themeMode}
          onValueChange={(next) => {
            void setThemeMode(next as ThemeMode);
          }}
          options={[
            { value: 'auto', label: t('profile.themeAuto') },
            { value: 'light', label: t('profile.themeLight') },
            { value: 'dark', label: t('profile.themeDark') },
          ]}
        />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell>
      <RadioChoiceList
        value={String(fontScale)}
        onValueChange={(next) => {
          void setFontScale(parseFloat(next));
        }}
        options={FONT_SCALE_PRESETS.map((preset) => ({
          value: String(preset.value),
          label: t(preset.labelKey),
        }))}
      />
    </SettingsPageShell>
  );
}
