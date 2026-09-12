import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Checkbox,
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
import {
  ExportAbortedError,
  fetchExportMessages,
} from '../export/fetchExportMessages';
import { buildExportHtml } from '../export/buildExportHtml';
import { buildExportFilename } from '../export/pdfTypes';
import { generatePdfFromHtml } from '../export/generatePdf';
import { savePdf } from '../adapter/savePdf';
import { ContentKind } from '../types';

const MIN_START_YMD = '2010-01-01';
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultStartYmd(): string {
  const now = new Date();
  const y = now.getFullYear() - 1;
  const m = now.getMonth();
  const d = now.getDate();
  const candidate = new Date(y, m, d);
  if (candidate.getMonth() !== m) {
    return formatYmd(new Date(y, m + 1, 0));
  }
  return formatYmd(candidate);
}

function defaultEndYmd(): string {
  return formatYmd(new Date());
}

function parseYmd(text: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(text.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return { y, m, d };
}

function startOfDayUnix(y: number, m: number, d: number): number {
  return Math.floor(new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000);
}

function endOfDayUnix(y: number, m: number, d: number): number {
  return Math.floor(new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000);
}

type ExportStatus = 'idle' | 'fetching' | 'generating' | 'saving';

function isTauriDesktop(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export default function ExportDataScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { fontScale } = useThemePreference();
  const { listContentStyle } = useListColumnLayout();
  const { state } = useAppContext();

  const [address, setAddress] = useState(state.profile?.address ?? '');
  const [startDateText, setStartDateText] = useState(defaultStartYmd);
  const [endDateText, setEndDateText] = useState(defaultEndYmd);
  const [decrypt, setDecrypt] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [startDateError, setStartDateError] = useState<string | null>(null);
  const [endDateError, setEndDateError] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState({ count: 0, page: 0 });
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

  const validateForm = useCallback((): {
    address: string;
    startTs: number;
    endTs: number;
  } | null => {
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

    const startParsed = parseYmd(startDateText);
    const endParsed = parseYmd(endDateText);
    if (!startParsed) {
      setStartDateError(t('export.dateInvalid'));
      ok = false;
    } else if (formatYmd(new Date(startParsed.y, startParsed.m - 1, startParsed.d)) < MIN_START_YMD) {
      setStartDateError(t('export.startDateTooEarly'));
      ok = false;
    } else {
      setStartDateError(null);
    }
    if (!endParsed) {
      setEndDateError(t('export.dateInvalid'));
      ok = false;
    } else {
      setEndDateError(null);
    }
    if (startParsed && endParsed) {
      const startYmd = formatYmd(new Date(startParsed.y, startParsed.m - 1, startParsed.d));
      const endYmd = formatYmd(new Date(endParsed.y, endParsed.m - 1, endParsed.d));
      if (startYmd > endYmd) {
        setStartDateError(t('export.dateOrderInvalid'));
        ok = false;
      }
    }
    if (!ok || !startParsed || !endParsed) return null;
    return {
      address: trimmed,
      startTs: startOfDayUnix(startParsed.y, startParsed.m, startParsed.d),
      endTs: endOfDayUnix(endParsed.y, endParsed.m, endParsed.d),
    };
  }, [address, endDateText, startDateText, t]);

  const runExport = useCallback(
    async (exportAddress: string, startTs: number, endTs: number) => {
      if (runningRef.current) return;
      runningRef.current = true;
      abortedRef.current = false;
      try {
        setStatus('fetching');
        setProgress({ count: 0, page: 0 });

        const items = await fetchExportMessages({
          address: exportAddress,
          startTs,
          endTs,
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

    void runExport(parsed.address, parsed.startTs, parsed.endTs);
  }, [decrypt, runExport, showMessage, t, validateForm]);

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
      if (parsed) void runExport(parsed.address, parsed.startTs, parsed.endTs);
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
  }, [password, passwordLocked, runExport, showMessage, t, validateForm]);

  const handleCancel = useCallback(() => {
    abortedRef.current = true;
  }, []);

  const statusText = useMemo(() => {
    if (status === 'fetching') {
      return t('export.fetching', {
        count: progress.count,
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
            {t('export.startDateLabel')}
          </Text>
          <TextInput
            mode="outlined"
            placeholder="YYYY-MM-DD"
            value={startDateText}
            onChangeText={(text) => {
              setStartDateText(text);
              if (startDateError) setStartDateError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            editable={!busy}
            error={!!startDateError}
            style={styles.input}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <HelperText type="error" visible={!!startDateError}>
            {startDateError}
          </HelperText>
          <HelperText type="info" visible={!startDateError}>
            {t('export.startDateHint')}
          </HelperText>

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
          >
            {t('export.endDateLabel')}
          </Text>
          <TextInput
            mode="outlined"
            placeholder="YYYY-MM-DD"
            value={endDateText}
            onChangeText={(text) => {
              setEndDateText(text);
              if (endDateError) setEndDateError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            editable={!busy}
            error={!!endDateError}
            style={styles.input}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <HelperText type="error" visible={!!endDateError}>
            {endDateError}
          </HelperText>
          <HelperText type="info" visible={!endDateError}>
            {t('export.endDateHint')}
          </HelperText>

          <View style={styles.checkboxRow}>
            <Checkbox.Android
              status={decrypt ? 'checked' : 'unchecked'}
              disabled={busy}
              onPress={() => {
                if (!busy) setDecrypt((v) => !v);
              }}
              uncheckedColor={theme.colors.outline}
            />
            <Text
              variant="bodyMedium"
              style={[styles.checkboxLabel, { color: theme.colors.onSurface }]}
              onPress={() => {
                if (!busy) setDecrypt((v) => !v);
              }}
            >
              {t('export.decryptLabel')}
            </Text>
          </View>
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

          {Platform.OS === 'web' && !isTauriDesktop() ? (
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 24 }}
            >
              {t('export.webPrintHint')}
            </Text>
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingRight: 8,
  },
  checkboxLabel: {
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  buttonGroup: {
    marginTop: 12,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
});
