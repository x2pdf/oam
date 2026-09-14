import React, { useCallback, useEffect, useState } from 'react';
import { Text, TextInput as PaperTextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../components/AppModal';
import {
  getEthPasswordLockRemainingMs,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
  verifyEthPassword,
} from '../wallet/ethPasswordVerify';

type EthPasswordGateModalProps = {
  visible: boolean;
  onDismiss: () => void;
  onVerified: (password: string) => void;
};

export function EthPasswordGateModal({ visible, onDismiss, onVerified }: EthPasswordGateModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [lockRemainingMs, setLockRemainingMs] = useState(0);

  const passwordLocked = lockRemainingMs > 0;

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setPasswordError(null);
      setVerifying(false);
      return;
    }
    setLockRemainingMs(getEthPasswordLockRemainingMs());
  }, [visible]);

  useEffect(() => {
    if (!visible || !passwordLocked) return;
    const timer = setInterval(() => {
      const remaining = getEthPasswordLockRemainingMs();
      setLockRemainingMs(remaining);
      if (remaining <= 0) {
        setPasswordError(null);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [visible, passwordLocked]);

  const handleDismiss = useCallback(() => {
    if (verifying) return;
    onDismiss();
  }, [onDismiss, verifying]);

  const handleVerify = useCallback(async () => {
    if (passwordLocked) return;
    if (!password) {
      setPasswordError(t('send.passwordLabel'));
      return;
    }

    setVerifying(true);
    setPasswordError(null);
    try {
      await verifyEthPassword(password);
      onVerified(password);
      setPassword('');
    } catch (e: any) {
      if (e?.name === NO_KEYSTORE_ERROR) {
        setPasswordError(t('send.noPrivateKey'));
      } else if (e?.name === PASSWORD_LOCKED_ERROR) {
        setLockRemainingMs(getEthPasswordLockRemainingMs());
        setPasswordError(null);
      } else if (e?.name === INVALID_PASSWORD_ERROR) {
        setPasswordError(t('home.passwordIncorrect'));
      } else {
        setPasswordError(t('home.passwordIncorrect'));
      }
    } finally {
      setVerifying(false);
    }
  }, [password, passwordLocked, onVerified, t]);

  return (
    <AppModal
      visible={visible}
      onDismiss={handleDismiss}
      dismissable={!verifying}
      title={t('send.passwordTitle')}
      actions={[
        { label: t('common.cancel'), onPress: handleDismiss, disabled: verifying },
        {
          label: t('common.ok'),
          onPress: handleVerify,
          loading: verifying,
          disabled: verifying || passwordLocked,
        },
      ]}
    >
      <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
        {t('arweave.ethPasswordGateHint')}
      </Text>
      <PaperTextInput
        label={t('send.passwordLabel')}
        secureTextEntry
        keyboardType="numeric"
        maxLength={16}
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (passwordError) setPasswordError(null);
        }}
        autoFocus
        error={!!passwordError || passwordLocked}
        disabled={verifying || passwordLocked}
      />
      {passwordLocked ? (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
          {t('home.passwordLocked', { seconds: Math.ceil(lockRemainingMs / 1000) })}
        </Text>
      ) : passwordError ? (
        <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
          {passwordError}
        </Text>
      ) : null}
    </AppModal>
  );
}
