import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, TextInput, Button, HelperText, useTheme, ActivityIndicator } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { showAlert } from '../utils/alert';
import {
  validatePaymentPassword,
  validatePaymentPasswordLength,
  PAYMENT_PASSWORD_MAX_LENGTH,
  PAYMENT_PASSWORD_KEYBOARD_TYPE,
} from '../wallet/passwordRules';
import {
  changePaymentPassword,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_CHANGE_INCOMPLETE_ERROR,
  PASSWORD_LOCKED_ERROR,
  PASSWORD_UNCHANGED_ERROR,
} from '../wallet/changePaymentPassword';
import { getEthPasswordLockRemainingMs } from '../arweave/wallet/ethPasswordVerify';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type FieldErrors = { old?: string; next?: string; confirm?: string };

export default function ChangePaymentPasswordScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  // Mirrors `loading` synchronously so goBack() right after success is not blocked
  // by a guard that has not been torn down by a re-render yet.
  const busyRef = useRef(false);

  // Keystores are being rewritten: do not let the user leave mid-operation.
  useEffect(
    () => navigation.addListener('beforeRemove', (e) => {
      if (busyRef.current) e.preventDefault();
    }),
    [navigation],
  );

  const clearError = (field: keyof FieldErrors) => {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!oldPassword) {
      next.old = t('form.oldPayPasswordRequired');
    } else {
      const oldLengthRuleKey = validatePaymentPasswordLength(oldPassword);
      if (oldLengthRuleKey) next.old = t(oldLengthRuleKey);
    }
    const ruleKey = validatePaymentPassword(newPassword);
    if (ruleKey) {
      next.next = t(ruleKey);
    } else if (newPassword === oldPassword) {
      next.next = t('form.newPayPasswordSameAsOld');
    }
    if (!next.next && newPassword !== confirmPassword) {
      next.confirm = t('form.payPasswordMismatch');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleConfirm = async () => {
    if (loading || !validate()) return;

    busyRef.current = true;
    setLoading(true);
    try {
      await changePaymentPassword(oldPassword, newPassword);
      busyRef.current = false;
      setLoading(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
      showAlert(t('common.success'), t('wallet.changePayPasswordSuccess'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      busyRef.current = false;
      setLoading(false);
      switch (error?.name) {
        case INVALID_PASSWORD_ERROR:
          setErrors({ old: t('home.passwordIncorrect') });
          break;
        case PASSWORD_LOCKED_ERROR:
          setErrors({
            old: t('home.passwordLocked', {
              seconds: Math.ceil(getEthPasswordLockRemainingMs() / 1000),
            }),
          });
          break;
        case NO_KEYSTORE_ERROR:
          showAlert(t('common.error'), t('send.noPrivateKey'));
          break;
        case PASSWORD_UNCHANGED_ERROR:
          setErrors({ next: t('form.newPayPasswordSameAsOld') });
          break;
        case PASSWORD_CHANGE_INCOMPLETE_ERROR:
          console.error(error);
          showAlert(t('common.failed'), t('wallet.changePayPasswordIncomplete'));
          break;
        default:
          console.error(error);
          showAlert(t('common.failed'), t('wallet.changePayPasswordFailed'));
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <ListColumn>
          <Text variant="headlineSmall" style={styles.title}>{t('wallet.changePayPasswordTitle')}</Text>

          <TextInput
            label={t('form.oldPayPassword')}
            value={oldPassword}
            onChangeText={(v) => { setOldPassword(v); clearError('old'); }}
            mode="outlined"
            secureTextEntry
            keyboardType={PAYMENT_PASSWORD_KEYBOARD_TYPE}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={PAYMENT_PASSWORD_MAX_LENGTH}
            placeholder={t('form.oldPayPasswordPlaceholder')}
            error={!!errors.old}
            disabled={loading}
            autoFocus
          />
          <HelperText type="error" visible={!!errors.old}>{errors.old}</HelperText>

          <TextInput
            label={t('form.newPayPassword')}
            value={newPassword}
            onChangeText={(v) => { setNewPassword(v); clearError('next'); }}
            mode="outlined"
            secureTextEntry
            keyboardType={PAYMENT_PASSWORD_KEYBOARD_TYPE}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={PAYMENT_PASSWORD_MAX_LENGTH}
            placeholder={t('form.newPayPasswordPlaceholder')}
            error={!!errors.next}
            disabled={loading}
          />
          <HelperText type="error" visible={!!errors.next}>{errors.next}</HelperText>

          <TextInput
            label={t('form.confirmNewPayPassword')}
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); clearError('confirm'); }}
            mode="outlined"
            secureTextEntry
            keyboardType={PAYMENT_PASSWORD_KEYBOARD_TYPE}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={PAYMENT_PASSWORD_MAX_LENGTH}
            placeholder={t('form.confirmPayPasswordPlaceholder')}
            error={!!errors.confirm}
            disabled={loading}
          />
          <HelperText type="error" visible={!!errors.confirm}>{errors.confirm}</HelperText>

          <View style={[styles.noticeBox, { backgroundColor: theme.colors.surfaceVariant }]}>
            {(['1', '2', '3', '4', '5'] as const).map((n) => (
              <Text
                key={n}
                variant="bodySmall"
                style={[styles.noticeLine, { color: theme.colors.onSurfaceVariant }]}
              >
                {`• ${t(`wallet.changePayPasswordNotice${n}`)}`}
              </Text>
            ))}
          </View>

          <View style={styles.buttonGroup}>
            <Button
              mode="contained"
              onPress={handleConfirm}
              disabled={loading}
              style={styles.button}
              contentStyle={{ height: 48 }}
            >
              {loading ? <ActivityIndicator color="#fff" /> : t('wallet.changePayPasswordButton')}
            </Button>
            <Button
              mode="outlined"
              onPress={() => navigation.goBack()}
              disabled={loading}
              style={styles.button}
              contentStyle={{ height: 48 }}
            >
              {t('common.cancel')}
            </Button>
          </View>
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { marginBottom: 24, fontWeight: 'bold', textAlign: 'center' },
  noticeBox: { marginTop: 8, padding: 14, borderRadius: 8, gap: 8 },
  noticeLine: { lineHeight: 20 },
  buttonGroup: { marginTop: 28, gap: 12 },
  button: { borderRadius: 8 },
});
