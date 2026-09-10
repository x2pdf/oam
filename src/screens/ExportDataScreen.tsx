import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  HelperText,
  RadioButton,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { isAddress } from 'ethers';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { scrollFill } from '../theme/scroll';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { usePasswordLockRemaining } from '../wallet/WalletSessionContext';
import {
  getPasswordLockRemainingMs,
  getUnlockedWallet,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
  unlockSession,
} from '../wallet/session';
import { loadEncryptedKeystore } from '../wallet/walletManager';
import { AppModal } from '../components/AppModal';
import { MAX_ADDRESS_LENGTH } from '../constants';
import { CONTENT_KIND_I18N_KEY } from '../display';
import { BLACK_HOLE_ADDRESS } from '../utils/address';
import { showConfirm } from '../utils/alert';
import {
  ExportAbortedError,
  fetchExportMessages,
} from '../export/fetchExportMessages';
import { buildExportHtml } from '../export/buildExportHtml';
import { buildExportFilename, generatePdfFromHtml } from '../export/generatePdf';
import { savePdf } from '../adapter/savePdf';
import { ContentKind } from '../types';

const MIN_LIMIT = 1;
const MAX_LIMIT = 1_000_000;
const DEFAULT_LIMIT = '100';
const LARGE_LIMIT_WARN = 5000;

type ExportStatus = 'idle' | 'fetching' | 'generating' | 'saving';

export default function ExportDataScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { fontScale } = useThemePreference();
  const { listContentStyle } = useListColumnLayout();
  const { state } = useAppContext();

  const [address, setAddress] = useState(state.profile?.address ?? '');
  const [limitText, setLimitText] = useState(DEFAULT_LIMIT);
  const [decrypt, setDecrypt] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState({ count: 0, page: 0, limit: 100 });
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const abortedRef = useRef(false);
  const runningRef = useRef(false);
  const passwordLockRemainingMs = usePasswordLockRemaining(passwordVisible);
  const passwordLocked = passwordLockRemainingMs > 0;
  const busy = status !== 'idle';

  useEffect(() => {
    if (!address && state.profile?.address) {
      setAddress(state.profile.address);
    }
  }, [address, state.profile?.address]);

  useEffect(() => {
    abortedRef.current = false;
    return () => {
      abortedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      abortedRef.current = true;
    });
    return unsub;
  }, [navigation]);

  const showMessage = useCallback((message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  const parseLimit = useCallback((): number | null => {
    const num = parseInt(limitText, 10);
    if (!Number.isFinite(num) || num < MIN_LIMIT || num > MAX_LIMIT) {
      return null;
    }
    return num;
  }, [limitText]);

  const validateForm = useCallback((): { address: string; limit: number } | null => {
    const trimmed = address.trim();
    let ok = true;
    if (!trimmed) {
      setAddressError(t('export.emptyAddress'));
      ok = false;
    } else if (!isAddress(trimmed)) {
      setAddressError(t('export.invalidAddress'));
      ok = false;
    } else {
      setAddressError(null);
    }
    const limit = parseLimit();
    if (limit == null) {
      setLimitError(t('export.limitInvalid'));
      ok = false;
    } else {
      setLimitError(null);
    }
    if (!ok || limit == null) return null;
    return { address: trimmed, limit };
  }, [address, parseLimit, t]);

  const runExport = useCallback(
    async (exportAddress: string, limit: number) => {
      if (runningRef.current) return;
      runningRef.current = true;
      abortedRef.current = false;
      try {
        setStatus('fetching');
        setProgress({ count: 0, page: 0, limit });

        const items = await fetchExportMessages({
          address: exportAddress,
          limit,
          decrypt,
          userAddress: state.profile?.address,
          isAborted: () => abortedRef.current,
          onProgress: (info) => setProgress(info),
        });

        if (abortedRef.current) throw new ExportAbortedError();
        if (items.length === 0) {
          showMessage(t('export.noData'));
          return;
        }

        setStatus('generating');
        const kindLabels = {
          OAMP: t(CONTENT_KIND_I18N_KEY.OAMP),
          OAMP_ENCRYPTED: t(CONTENT_KIND_I18N_KEY.OAMP_ENCRYPTED),
          'UTF-8': t(CONTENT_KIND_I18N_KEY['UTF-8']),
          RAW: t(CONTENT_KIND_I18N_KEY.RAW),
        } as Record<ContentKind, string>;

        const addressNames: Record<string, string> = {};
        const profileAddr = state.profile?.address?.toLowerCase();
        if (profileAddr) addressNames[profileAddr] = t('send.recipientSelf');
        addressNames[BLACK_HOLE_ADDRESS.toLowerCase()] = t('send.recipientBlackHole');
        state.subscriptions.forEach((sub) => {
          addressNames[sub.address.toLowerCase()] = sub.description;
        });

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const timeLabel = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const html = await buildExportHtml(items, {
          title: t('export.title'),
          exportAddress,
          generatedAtLabel: t('export.generatedAt', { time: timeLabel }),
          itemCountLabel: t('export.itemCount', { count: items.length }),
          encryptedHint: t('home.encryptedHint'),
          kindLabels,
          selfLabel: t('send.recipientSelf'),
          blackHoleLabel: t('send.recipientBlackHole'),
          attachmentLabel: t('export.attachment'),
          addressNames,
        });

        if (abortedRef.current) throw new ExportAbortedError();

        const filename = buildExportFilename(exportAddress);
        const pdf = await generatePdfFromHtml(html, filename);
        if (abortedRef.current) throw new ExportAbortedError();

        setStatus('saving');
        const saveStatus = await savePdf(pdf, filename);
        if (saveStatus === 'cancelled') {
          showMessage(t('export.cancelled'));
          return;
        }
        if (saveStatus === 'printed') {
          showMessage(t('export.printed'));
          return;
        }
        showMessage(t('export.success'));
      } catch (e) {
        if (e instanceof ExportAbortedError || abortedRef.current) {
          showMessage(t('export.cancelled'));
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        showMessage(t('export.failed', { message }));
      } finally {
        runningRef.current = false;
        setStatus('idle');
      }
    },
    [decrypt, showMessage, state.profile?.address, state.subscriptions, t],
  );

  const startAfterUnlock = useCallback(
    (exportAddress: string, limit: number) => {
      if (limit >= LARGE_LIMIT_WARN) {
        showConfirm(
          t('export.largeLimitTitle'),
          t('export.largeLimitMsg', { limit }),
          () => {
            void runExport(exportAddress, limit);
          },
          undefined,
          t('common.confirm'),
          t('common.cancel'),
        );
        return;
      }
      void runExport(exportAddress, limit);
    },
    [runExport, t],
  );

  const handleStart = useCallback(async () => {
    const parsed = validateForm();
    if (!parsed) return;

    if (decrypt && !getUnlockedWallet()) {
      const keystore = await loadEncryptedKeystore();
      if (!keystore) {
        showMessage(t('home.readOnlyCannotDecrypt'));
        return;
      }
      setPassword('');
      setPasswordError(null);
      setPasswordVisible(true);
      return;
    }

    startAfterUnlock(parsed.address, parsed.limit);
  }, [decrypt, showMessage, startAfterUnlock, t, validateForm]);

  const handleUnlockAndExport = useCallback(async () => {
    if (passwordLocked) return;
    if (!password) {
      setPasswordError(t('send.passwordLabel'));
      return;
    }
    setUnlocking(true);
    try {
      await unlockSession(password);
      setPasswordVisible(false);
      setPassword('');
      setPasswordError(null);
      const parsed = validateForm();
      if (parsed) startAfterUnlock(parsed.address, parsed.limit);
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : '';
      if (name === PASSWORD_LOCKED_ERROR) {
        setPasswordError(
          t('home.passwordLocked', {
            seconds: Math.ceil(getPasswordLockRemainingMs() / 1000),
          }),
        );
      } else if (name === NO_KEYSTORE_ERROR) {
        setPasswordVisible(false);
        showMessage(t('send.noPrivateKey'));
      } else if (name === INVALID_PASSWORD_ERROR) {
        setPasswordError(t('home.passwordIncorrect'));
      } else {
        setPasswordError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setUnlocking(false);
    }
  }, [password, passwordLocked, showMessage, startAfterUnlock, t, validateForm]);

  const handleCancel = useCallback(() => {
    abortedRef.current = true;
  }, []);

  const statusText = useMemo(() => {
    if (status === 'fetching') {
      return t('export.fetching', {
        count: progress.count,
        limit: progress.limit,
        page: progress.page,
      });
    }
    if (status === 'generating') return t('export.generating');
    if (status === 'saving') return t('export.saving');
    return null;
  }, [progress, status, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        <ListColumn>
          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
          >
            {t('export.addressLabel')}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={t('export.addressPlaceholder')}
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              if (addressError) setAddressError(null);
            }}
            maxLength={MAX_ADDRESS_LENGTH}
            multiline
            numberOfLines={2}
            scrollEnabled={false}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            editable={!busy}
            error={!!addressError}
            style={styles.input}
            contentStyle={[
              styles.addressContent,
              { fontSize: Math.round(13 * fontScale) },
              Platform.OS === 'web'
                ? ({ wordBreak: 'break-all', overflowWrap: 'anywhere' } as object)
                : null,
            ]}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <HelperText type="error" visible={!!addressError}>
            {addressError}
          </HelperText>

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
          >
            {t('export.limitLabel')}
          </Text>
          <TextInput
            mode="outlined"
            value={limitText}
            onChangeText={(text) => {
              setLimitText(text.replace(/[^0-9]/g, ''));
              if (limitError) setLimitError(null);
            }}
            keyboardType="number-pad"
            editable={!busy}
            error={!!limitError}
            style={styles.input}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <HelperText type="error" visible={!!limitError}>
            {limitError}
          </HelperText>
          <HelperText type="info" visible>
            {t('export.limitHint')}
          </HelperText>

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
          >
            {t('export.decryptLabel')}
          </Text>
          <RadioButton.Group
            onValueChange={(value) => {
              if (!busy) setDecrypt(value === 'yes');
            }}
            value={decrypt ? 'yes' : 'no'}
          >
            <RadioButton.Item
              label={t('export.decryptYes')}
              value="yes"
              disabled={busy}
              style={styles.radioItem}
            />
            <RadioButton.Item
              label={t('export.decryptNo')}
              value="no"
              disabled={busy}
              style={styles.radioItem}
            />
          </RadioButton.Group>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('export.decryptHint')}
          </Text>

          {statusText ? (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurface }}>
                {statusText}
              </Text>
            </View>
          ) : null}

          <View style={styles.buttonGroup}>
            <Button
              mode="contained"
              onPress={() => void handleStart()}
              disabled={busy}
              loading={busy}
              style={styles.button}
            >
              {t('export.start')}
            </Button>
            {busy ? (
              <Button mode="outlined" onPress={handleCancel} style={styles.button}>
                {t('export.cancelExport')}
              </Button>
            ) : null}
          </View>
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={passwordVisible}
        onDismiss={() => {
          if (!unlocking) {
            setPasswordVisible(false);
            setPassword('');
            setPasswordError(null);
          }
        }}
        dismissable={!unlocking}
        title={t('send.passwordTitle')}
        actions={[
          {
            label: t('common.cancel'),
            disabled: unlocking,
            onPress: () => {
              setPasswordVisible(false);
              setPassword('');
              setPasswordError(null);
            },
          },
          {
            label: t('common.ok'),
            onPress: () => void handleUnlockAndExport(),
            loading: unlocking,
            disabled: unlocking || passwordLocked,
          },
        ]}
      >
        <TextInput
          mode="outlined"
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
          disabled={unlocking || passwordLocked}
          error={!!passwordError || passwordLocked}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        {passwordLocked ? (
          <HelperText type="error" visible>
            {t('home.passwordLocked', { seconds: Math.ceil(passwordLockRemainingMs / 1000) })}
          </HelperText>
        ) : passwordError ? (
          <HelperText type="error" visible>
            {passwordError}
          </HelperText>
        ) : null}
      </AppModal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3200}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  fieldLabel: {
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    marginBottom: 0,
    width: '100%',
    maxWidth: '100%',
  },
  addressContent: {
    minHeight: 56,
    textAlignVertical: 'top',
    paddingTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  radioItem: {
    paddingHorizontal: 0,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  buttonGroup: {
    marginTop: 32,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
});
