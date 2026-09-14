import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DisclaimerCard from '../../components/DisclaimerCard';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function CreateDisclaimerScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();

  const disclaimers = useMemo(() => [
    t('arweave.createDisclaimer1'),
    t('arweave.createDisclaimer2'),
    t('arweave.createDisclaimer3'),
    t('arweave.createDisclaimer4'),
    t('arweave.createDisclaimer5'),
    t('arweave.createDisclaimer6'),
    t('arweave.createDisclaimer7'),
    t('arweave.createDisclaimer8'),
  ], [t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          <DisclaimerCard
            title={t('arweave.createDisclaimerTitle')}
            items={disclaimers}
            checkboxLabel={t('arweave.createDisclaimerCheckbox')}
            buttonLabel={t('arweave.createDisclaimerButton')}
            onContinue={() => navigation.navigate('ArweaveJwkBackup')}
          />
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
});
