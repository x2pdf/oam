import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, useTheme, ActivityIndicator } from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EthereumWalletManager, encryptWallet, saveEncryptedKeystore } from '../wallet/walletManager';
import { useAppContext } from '../context/AppContext';

type RoutePropType = RouteProp<RootStackParamList, 'PrivateKeySetup'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function PrivateKeySetupScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { saveProfile } = useAppContext();
  const { privateKey } = route.params;

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('form.walletNameRequired'));
      return;
    }
    if (name.length > 64) {
      Alert.alert(t('common.error'), t('form.walletNameMaxLength'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('common.error'), t('form.payPasswordMinLength'));
      return;
    }
    if (password.length > 16) {
      Alert.alert(t('common.error'), t('form.payPasswordMaxLength'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('form.payPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const walletInfo = EthereumWalletManager.importFromPrivateKey(privateKey);
      const keystoreJson = await encryptWallet(walletInfo, password);
      await saveEncryptedKeystore(keystoreJson);

      // 4. Update Profile in Context
      await saveProfile({
        id: Date.now().toString(),
        address: walletInfo.address,
        description: name.trim(),
        walletType: 'write',
      });

      Alert.alert(t('common.success'), t('wallet.setupSuccess'), [
        {
          text: t('common.ok'),
          onPress: () => navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          })
        }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.failed'), t('wallet.setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Text variant="headlineSmall" style={styles.title}>{t('wallet.setupTitle')}</Text>

        <TextInput
          label={t('form.walletName')}
          value={name}
          onChangeText={setName}
          mode="outlined"
          maxLength={64}
          placeholder={t('form.walletNamePlaceholder')}
          style={styles.input}
        />

        <TextInput
          label={t('form.payPassword')}
          value={password}
          onChangeText={setPassword}
          mode="outlined"
          secureTextEntry
          keyboardType="numeric"
          maxLength={16}
          placeholder={t('form.payPasswordPlaceholder')}
          style={styles.input}
        />

        <TextInput
          label={t('form.confirmPayPassword')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          mode="outlined"
          secureTextEntry
          keyboardType="numeric"
          maxLength={16}
          placeholder={t('form.confirmPayPasswordPlaceholder')}
          style={styles.input}
        />

        <View style={styles.hintBox}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('wallet.setupHint')}
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={handleFinish}
          disabled={loading}
          style={styles.button}
          contentStyle={{ height: 48 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : t('wallet.setupButtonRecover')}
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
    marginBottom: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  input: {
    marginBottom: 20,
  },
  hintBox: {
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  button: {
    marginTop: 8,
  },
});
