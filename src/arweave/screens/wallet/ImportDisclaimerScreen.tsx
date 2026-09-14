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

export default function ImportDisclaimerScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();

  const disclaimers = useMemo(() => [
    t('arweave.importDisclaimer1'),
    t('arweave.importDisclaimer2'),
    t('arweave.importDisclaimer3'),
    t('arweave.importDisclaimer4'),
    t('arweave.importDisclaimer5'),
  ], [t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          <DisclaimerCard
            title={t('arweave.importDisclaimerTitle')}
            items={disclaimers}
            checkboxLabel={t('arweave.importDisclaimerCheckbox')}
            buttonLabel={t('arweave.importDisclaimerButton')}
            onContinue={() => navigation.navigate('ArweaveJwkInput')}
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
