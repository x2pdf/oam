import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import {
  getHomeTabOrder,
  normalizeHomeTabWeights,
  type HomeTabId,
} from '../../constants';
import { RootStackParamList } from '../../types';
import { SettingsPageShell } from './SettingsPageShell';

const HOME_TAB_LABEL_KEYS: Record<HomeTabId, string> = {
  square: 'home.tabs.square',
  following: 'home.tabs.following',
  messages: 'home.tabs.messages',
  self: 'home.tabs.home',
};

type Props = NativeStackScreenProps<RootStackParamList, 'HomeTabWeights'>;

export default function HomeTabWeightsScreen({ navigation }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state, setHomeTabWeights } = useAppContext();
  const [localHomeTabWeights, setLocalHomeTabWeights] = useState(() =>
    normalizeHomeTabWeights(state.homeTabWeights),
  );
  const tabOrder = useMemo(
    () => getHomeTabOrder(localHomeTabWeights),
    [localHomeTabWeights],
  );

  const updateLocalHomeTabWeight = (id: HomeTabId, val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setLocalHomeTabWeights((prev) => ({ ...prev, [id]: num }));
    } else if (val === '') {
      setLocalHomeTabWeights((prev) => ({ ...prev, [id]: 1 }));
    }
  };

  const handleSave = useCallback(async () => {
    await setHomeTabWeights(normalizeHomeTabWeights(localHomeTabWeights));
    navigation.goBack();
  }, [localHomeTabWeights, setHomeTabWeights, navigation]);

  return (
    <SettingsPageShell>
      {tabOrder.map((id) => (
        <View key={id} style={styles.weightItem}>
          <View style={styles.weightHeader}>
            <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
              {t(HOME_TAB_LABEL_KEYS[id])}
            </Text>
          </View>
          <TextInput
            mode="outlined"
            dense
            label={t('profile.weightLabel')}
            value={String(localHomeTabWeights[id])}
            onChangeText={(val) => updateLocalHomeTabWeight(id, val)}
            keyboardType="numeric"
            style={styles.weightInput}
          />
        </View>
      ))}
      <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
        {t('profile.homeTabWeightHint')}
      </Text>
      <Button mode="contained" onPress={() => void handleSave()} style={styles.saveButton}>
        {t('common.save')}
      </Button>
    </SettingsPageShell>
  );
}

const styles = StyleSheet.create({
  weightItem: {
    marginBottom: 16,
  },
  weightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  weightInput: {
    height: 40,
  },
  saveButton: {
    marginTop: 16,
    borderRadius: 8,
  },
});
