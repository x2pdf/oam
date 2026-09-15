import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { Text, TextInput, Button, useTheme, ActivityIndicator } from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../../context/AppContext';
import { finalizeArWallet, isPeerReencryptError } from '../../wallet/finalizeWallet';
import { setPendingNewPassword } from '../../wallet/verifiedEthPassword';
import { showAlert } from '../../../utils/alert';

type RoutePropType = RouteProp<RootStackParamList, 'ArweavePasswordSetup'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function ArweavePasswordSetupScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const { saveArProfile } = useAppContext();
  const { jwk, address } = route.params;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    if (password.length < 6) {
      showAlert(t('common.error'), t('form.payPasswordMinLength'));
      return;
    }
    if (password.length > 16) {
      showAlert(t('common.error'), t('form.payPasswordMaxLength'));
      return;
    }
    if (password !== confirmPassword) {
      showAlert(t('common.error'), t('form.payPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      setPendingNewPassword(password);
      await finalizeArWallet(jwk, address, saveArProfile, { isReplacement: true });
      showAlert(t('common.success'), t('arweave.replaceSuccessSharedPassword'), [
        {
          text: t('common.ok'),
          onPress: () => navigation.reset({
            index: 1,
            routes: [{ name: 'MainTabs' }, { name: 'ArweaveProfile' }],
          }),
        },
      ]);
    } catch (error) {
      console.error(error);
      if (isPeerReencryptError(error)) {
        showAlert(t('common.failed'), t('arweave.peerReencryptFailed'));
      } else {
        showAlert(t('common.failed'), t('arweave.setupFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          <Text variant="headlineSmall" style={styles.title}>{t('arweave.passwordSetupTitle')}</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>{t('arweave.passwordSetupSubtitle')}</Text>

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
              {t('arweave.passwordSetupHint')}
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={handleFinish}
            disabled={loading}
            style={styles.button}
            contentStyle={{ height: 48 }}
          >
            {loading ? <ActivityIndicator color="#fff" /> : t('arweave.passwordSetupButton')}
          </Button>
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { marginBottom: 8, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { marginBottom: 32, textAlign: 'center', opacity: 0.8 },
  input: { marginBottom: 20 },
  hintBox: { marginBottom: 32, paddingHorizontal: 4 },
  button: { marginTop: 8 },
});
