import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Button, Checkbox, useTheme, Card } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generate12WordMnemonic } from '../wallet/walletManager';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function MnemonicBackupScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();

  const [mnemonic, setMnemonic] = useState('');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setMnemonic(generate12WordMnemonic());
  }, []);

  const words = mnemonic.split(' ');

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}>
        <ListColumn>
        <Text variant="headlineSmall" style={styles.title}>{t('wallet.mnemonicTitle')}</Text>

        <Text variant="bodyMedium" style={styles.subtitle}>
          {t('wallet.mnemonicSubtitle')}
        </Text>

        <Card style={styles.mnemonicCard} mode="contained">
          <Card.Content style={styles.mnemonicGrid}>
            {words.map((word, index) => (
              <View key={index} style={styles.wordBox}>
                <Text style={[styles.wordIndex, { color: theme.colors.onSurfaceVariant }]}>
                  {index + 1}
                </Text>
                <Text style={styles.wordText}>{word}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        <View
          style={[
            styles.warningBox,
            {
              backgroundColor: theme.colors.errorContainer,
              borderColor: theme.colors.error,
            },
          ]}
        >
          <Text style={[styles.warningText, { color: theme.colors.error }]}>
            {t('wallet.mnemonicWarning')}
          </Text>
          <Text style={[styles.warningText, styles.noExportWarning, { color: theme.colors.error }]}>
            {t('wallet.mnemonicNoExportWarning')}
          </Text>
        </View>

        <View style={styles.checkboxContainer}>
          <Checkbox
            status={checked ? 'checked' : 'unchecked'}
            onPress={() => setChecked(!checked)}
          />
          <Text
            variant="bodyMedium"
            style={styles.checkboxLabel}
            onPress={() => setChecked(!checked)}
          >
            {t('wallet.mnemonicCheckbox')}
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={() => navigation.navigate('WalletSetup', { mnemonic })}
          disabled={!checked}
          style={styles.button}
        >
          {t('wallet.mnemonicButton')}
        </Button>
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    marginBottom: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.8,
  },
  mnemonicCard: {
    marginBottom: 24,
    borderRadius: 12,
  },
  mnemonicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 10,
  },
  wordBox: {
    width: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 4,
  },
  wordIndex: {
    fontSize: 10,
    width: 16,
  },
  wordText: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 24,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 'bold',
  },
  noExportWarning: {
    marginTop: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  checkboxLabel: {
    flex: 1,
    marginLeft: 8,
  },
  button: {
    paddingVertical: 6,
  },
});
