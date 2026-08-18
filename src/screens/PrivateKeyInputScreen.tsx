import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EthereumWalletManager } from '../wallet/walletManager';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function PrivateKeyInputScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [privateKey, setPrivateKey] = useState('');

  const handleNext = () => {
    const trimmedKey = privateKey.trim();
    if (!trimmedKey) {
      Alert.alert(t('common.error'), t('wallet.privateKeyInputError'));
      return;
    }

    try {
      // Validate private key format
      EthereumWalletManager.importFromPrivateKey(trimmedKey);
      navigation.navigate('PrivateKeyVerify', { privateKey: trimmedKey });
    } catch (error) {
      Alert.alert(t('wallet.privateKeyInputTitle'), t('wallet.privateKeyInputInvalid'));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Text variant="headlineSmall" style={styles.title}>{t('wallet.privateKeyInputTitle')}</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {t('wallet.privateKeyInputSubtitle')}
        </Text>

        <TextInput
          label={t('wallet.privateKeyInputLabel')}
          value={privateKey}
          onChangeText={setPrivateKey}
          mode="outlined"
          multiline
          numberOfLines={6}
          placeholder={t('wallet.privateKeyInputPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <View style={styles.hintBox}>
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {t('wallet.privateKeyInputWarning')}
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={handleNext}
          style={styles.button}
          contentStyle={{ height: 48 }}
        >
          {t('wallet.inputMnemonicButton')}
        </Button>
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
  input: {
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  hintBox: {
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  button: {
    marginTop: 8,
  },
});
