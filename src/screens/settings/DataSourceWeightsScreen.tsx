import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, TextInput, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { dataSourceManager } from '../../datasource/DataSourceManager';
import { useDataSourceConnectivityProbe } from '../../hooks/useDataSourceConnectivityProbe';
import { RootStackParamList } from '../../types';
import { SettingsPageShell } from './SettingsPageShell';

type Props = NativeStackScreenProps<RootStackParamList, 'DataSourceWeights'>;

export default function DataSourceWeightsScreen({ navigation }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state, setDataSourceWeights } = useAppContext();
  const sources = useMemo(() => dataSourceManager.getSources(), []);
  const [localWeights, setLocalWeights] = useState<Record<string, number>>(() =>
    sources.reduce((acc, source) => {
      acc[source.name] = state.dataSourceWeights[source.name] ?? source.weight;
      return acc;
    }, {} as Record<string, number>),
  );

  const dataSourceProbeByName = useDataSourceConnectivityProbe(
    true,
    sources,
    state.profile?.address,
    state.apiKey ?? '',
  );

  const updateLocalWeight = (name: string, val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setLocalWeights((prev) => ({ ...prev, [name]: num }));
    } else if (val === '') {
      setLocalWeights((prev) => ({ ...prev, [name]: 0 }));
    }
  };

  const handleSave = useCallback(async () => {
    await setDataSourceWeights(localWeights);
    navigation.goBack();
  }, [localWeights, setDataSourceWeights, navigation]);

  return (
    <SettingsPageShell>
      {sources.map((source) => {
        const missingApiKey = source.requiresApiKey && !source.apiKey;
        return (
          <View key={source.name} style={styles.weightItem}>
            <View style={styles.weightHeader}>
              <View style={styles.weightHeaderLeft}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                  {source.name}
                </Text>
                {missingApiKey ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
                    ({t('profile.inactiveSource')})
                  </Text>
                ) : null}
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, flexShrink: 0, marginLeft: 8 }}
              >
                {(() => {
                  const probe = dataSourceProbeByName[source.name];
                  if (missingApiKey || probe?.kind === 'unconfigured') {
                    return t('profile.dataSourceUnconfigured');
                  }
                  if (probe?.kind === 'ok') {
                    return t('profile.dataSourceNetworkLatency', { ms: probe.latencyMs });
                  }
                  if (probe?.kind === 'timeout') {
                    return t('profile.dataSourceNetworkTimeout');
                  }
                  return t('profile.dataSourceNetworkChecking');
                })()}
              </Text>
            </View>
            <TextInput
              mode="outlined"
              dense
              label={t('profile.weightLabel')}
              value={String(localWeights[source.name] ?? source.weight)}
              onChangeText={(val) => updateLocalWeight(source.name, val)}
              keyboardType="numeric"
              style={styles.weightInput}
            />
            {missingApiKey ? (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 2 }}
              >
                {t('profile.requiresKeyHint')}
              </Text>
            ) : null}
          </View>
        );
      })}
      <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
        {t('profile.weightHint')}
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
  weightHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
    gap: 4,
  },
  weightInput: {
    height: 40,
  },
  saveButton: {
    marginTop: 16,
    borderRadius: 8,
  },
});
