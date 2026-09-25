import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { RadioButton } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useThemePreference, ThemeMode, FONT_SCALE_PRESETS } from '../../context/ThemeContext';
import { LANGUAGE_KEY } from '../../i18n';
import { RootStackParamList } from '../../types';
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
        <RadioButton.Group onValueChange={changeLanguage} value={currentLanguage}>
          <RadioButton.Item label="简体中文" value="zh" style={styles.radioItem} />
          <RadioButton.Item label="English" value="en" style={styles.radioItem} />
        </RadioButton.Group>
      </SettingsPageShell>
    );
  }

  if (type === 'appearance') {
    return (
      <SettingsPageShell>
        <RadioButton.Group
          onValueChange={(value) => {
            void setThemeMode(value as ThemeMode);
          }}
          value={themeMode}
        >
          <RadioButton.Item label={t('profile.themeAuto')} value="auto" style={styles.radioItem} />
          <RadioButton.Item label={t('profile.themeLight')} value="light" style={styles.radioItem} />
          <RadioButton.Item label={t('profile.themeDark')} value="dark" style={styles.radioItem} />
        </RadioButton.Group>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell>
      <RadioButton.Group
        onValueChange={(value) => {
          void setFontScale(parseFloat(value));
        }}
        value={String(fontScale)}
      >
        {FONT_SCALE_PRESETS.map((preset) => (
          <RadioButton.Item
            key={preset.value}
            label={t(preset.labelKey)}
            value={String(preset.value)}
            style={styles.radioItem}
          />
        ))}
      </RadioButton.Group>
    </SettingsPageShell>
  );
}

const styles = StyleSheet.create({
  radioItem: {
    paddingHorizontal: 0,
    borderRadius: 8,
  },
});
