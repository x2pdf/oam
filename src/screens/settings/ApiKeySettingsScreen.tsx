import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { useThemePreference } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { SettingsPageShell } from './SettingsPageShell';

type Props = NativeStackScreenProps<RootStackParamList, 'ApiKeySettings'>;

export default function ApiKeySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { state, setApiKey } = useAppContext();
  const { fontScale } = useThemePreference();
  const [tempApiKey, setTempApiKey] = useState(state.apiKey || '');

  const handleSave = useCallback(async () => {
    await setApiKey(tempApiKey.trim());
    navigation.goBack();
  }, [tempApiKey, setApiKey, navigation]);

  return (
    <SettingsPageShell>
      <TextInput
        label="API Key"
        value={tempApiKey}
        onChangeText={setTempApiKey}
        mode="outlined"
        multiline
        numberOfLines={3}
        scrollEnabled={false}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        style={styles.apiKeyInput}
        contentStyle={[
          styles.apiKeyInputContent,
          { fontSize: Math.round(13 * fontScale) },
          Platform.OS === 'web'
            ? ({ wordBreak: 'break-all', overflowWrap: 'anywhere' } as object)
            : null,
        ]}
      />
      <Button mode="contained" onPress={() => void handleSave()} style={styles.saveButton}>
        {t('common.save')}
      </Button>
    </SettingsPageShell>
  );
}

const styles = StyleSheet.create({
  apiKeyInput: {
    width: '100%',
    maxWidth: '100%',
  },
  apiKeyInputContent: {
    minHeight: 56,
    textAlignVertical: 'top',
    paddingTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveButton: {
    marginTop: 16,
    borderRadius: 8,
  },
});
