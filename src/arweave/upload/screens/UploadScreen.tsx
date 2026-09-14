import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  TextInput,
  Button,
  HelperText,
  ActivityIndicator,
  useTheme,
  Snackbar,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { useModalInsetFrameStyle } from '../../../theme/surfaces';
import { useThemePreference } from '../../../context/ThemeContext';
import { useAppContext } from '../../../context/AppContext';
import { RootStackParamList } from '../../../types';
import { AppModal } from '../../../components/AppModal';
import { decryptJwk, loadEncryptedArKeystore } from '../../wallet/keystore';
import { UploadFileType, UPLOAD_FILE_TYPE_TO_MIME } from '../constants';
import { FileTypeSelector } from '../components/FileTypeSelector';
import { PickedFileCard } from '../components/PickedFileCard';
import {
  pickUploadFileFromDocuments,
  pickUploadFileFromGallery,
  PickedUploadFile,
} from '../pickFile';
import {
  estimateUploadFeeAr,
  estimateUploadFeeWinston,
  getUploadWalletBalanceAr,
  getUploadWalletBalanceWinston,
  isUploadBalanceInsufficient,
  postUploadTransaction,
  uploadBase64ToUint8Array,
} from '../transaction';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function ArweaveUploadScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { fontScale } = useThemePreference();
  const { state } = useAppContext();
  const { listContentStyle } = useListColumnLayout();
  const modalInsetFrameStyle = useModalInsetFrameStyle();

  const arProfile = state.arProfile;

  const [note, setNote] = useState('');
  const [fileType, setFileType] = useState<UploadFileType>('other');
  const [pickedFile, setPickedFile] = useState<PickedUploadFile | null>(null);
  const [fileSourceDialogVisible, setFileSourceDialogVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [balanceDisplay, setBalanceDisplay] = useState('—');
  const [feeDisplay, setFeeDisplay] = useState('—');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState(false);
  const [insufficientBalance, setInsufficientBalance] = useState(false);

  const [successVisible, setSuccessVisible] = useState(false);
  const [successTxId, setSuccessTxId] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const hasContent = note.trim().length > 0 || pickedFile !== null;

  const loadFeeAndBalance = useCallback(async () => {
    if (!arProfile || !pickedFile) return;

    setBalanceLoading(true);
    setFeeLoading(true);
    setFeeError(false);
    setInsufficientBalance(false);

    try {
      const [balanceAr, feeAr, balanceWinston, feeWinston] = await Promise.all([
        getUploadWalletBalanceAr(arProfile.address),
        estimateUploadFeeAr(pickedFile.sizeBytes),
        getUploadWalletBalanceWinston(arProfile.address),
        estimateUploadFeeWinston(pickedFile.sizeBytes),
      ]);
      setBalanceDisplay(`${balanceAr} ${t('arweave.upload.feeUnit')}`);
      setFeeDisplay(`${feeAr} ${t('arweave.upload.feeUnit')}`);
      setInsufficientBalance(isUploadBalanceInsufficient(balanceWinston, feeWinston));
    } catch {
      setFeeError(true);
      setBalanceDisplay('—');
      setFeeDisplay('—');
    } finally {
      setBalanceLoading(false);
      setFeeLoading(false);
    }
  }, [arProfile, pickedFile, t]);

  useEffect(() => {
    if (confirmVisible) {
      void loadFeeAndBalance();
    }
  }, [confirmVisible, loadFeeAndBalance]);

  const applyPickedFile = useCallback((file: PickedUploadFile) => {
    setPickedFile(file);
    setFileType(file.fileType);
  }, []);

  const pickFromSource = useCallback(async (source: 'gallery' | 'documents') => {
    setFileSourceDialogVisible(false);
    try {
      const file = source === 'gallery'
        ? await pickUploadFileFromGallery()
        : await pickUploadFileFromDocuments();
      if (file) {
        applyPickedFile(file);
      }
    } catch (error) {
      console.error('File pick error:', error);
      setSnackbarMessage(t('arweave.upload.pickFailed'));
      setSnackbarVisible(true);
    }
  }, [applyPickedFile, t]);

  const handleUploadPress = useCallback(() => {
    if (!pickedFile) {
      setSnackbarMessage(t('arweave.upload.noFile'));
      setSnackbarVisible(true);
      return;
    }
    setConfirmVisible(true);
  }, [pickedFile, t]);

  const startPasswordInput = useCallback(() => {
    if (insufficientBalance || feeLoading || balanceLoading || feeError) return;
    setConfirmVisible(false);
    setPasswordError(null);
    setPasswordVisible(true);
  }, [insufficientBalance, feeLoading, balanceLoading, feeError]);

  const executeUpload = useCallback(async () => {
    if (!password) {
      setPasswordError(t('arweave.upload.passwordRequired'));
      return;
    }
    if (!pickedFile || !arProfile) return;

    setLoading(true);
    setPasswordError(null);
    try {
      const keystoreJson = await loadEncryptedArKeystore();
      if (!keystoreJson) {
        setPasswordError(t('arweave.upload.noKeystore'));
        setLoading(false);
        return;
      }

      const jwk = await decryptJwk(keystoreJson, password);
      const data = uploadBase64ToUint8Array(pickedFile.base64);
      const tags: { name: string; value: string }[] = [
        { name: 'Content-Type', value: UPLOAD_FILE_TYPE_TO_MIME[fileType] },
        { name: 'File-Name', value: pickedFile.fileName },
      ];
      const trimmedNote = note.trim();
      if (trimmedNote) {
        tags.push({ name: 'Note', value: trimmedNote });
      }

      const txId = await postUploadTransaction(jwk, data, tags);
      setLoading(false);
      setPasswordVisible(false);
      setPassword('');
      setSuccessTxId(txId);
      setSuccessVisible(true);
    } catch (error) {
      console.error('Upload error:', error);
      setLoading(false);
      setPasswordError(t('arweave.upload.wrongPassword'));
    }
  }, [password, pickedFile, arProfile, fileType, note, t]);

  const handleCancel = useCallback(() => {
    if (hasContent) {
      setCancelConfirmVisible(true);
      return;
    }
    navigation.goBack();
  }, [hasContent, navigation]);

  const canConfirmUpload = !insufficientBalance && !feeLoading && !balanceLoading && !feeError;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ListColumn>
          <Text variant="labelLarge" style={[styles.fieldLabel, { color: theme.colors.onSurface }]}>
            {t('arweave.upload.noteLabel')}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={t('arweave.upload.notePlaceholder')}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
            blurOnSubmit={false}
            scrollEnabled
            style={styles.textArea}
            contentStyle={[styles.textAreaContent, { color: theme.colors.onSurface }]}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />

          <FileTypeSelector value={fileType} onChange={setFileType} />

          <Button
            mode="outlined"
            icon="file-upload-outline"
            onPress={() => setFileSourceDialogVisible(true)}
            style={styles.selectFileButton}
          >
            {t('arweave.upload.selectFile')}
          </Button>

          {pickedFile ? (
            <PickedFileCard file={pickedFile} onRemove={() => setPickedFile(null)} />
          ) : null}
          <HelperText type="info" visible>
            {t('arweave.upload.selectFileHint')}
          </HelperText>
          <HelperText type="info" visible>
            {t('arweave.upload.fileSizeHint')}
          </HelperText>
          <HelperText type="info" visible>
            {t('arweave.upload.feeDisclaimer')}
          </HelperText>
          <HelperText type="info" visible>
            {t('arweave.upload.submitDisclaimer')}
          </HelperText>
          <HelperText type="info" visible>
            {t('arweave.upload.safetyTip')}
          </HelperText>

          <View style={styles.buttonGroup}>
            <Button
              mode="contained"
              onPress={handleUploadPress}
              style={styles.button}
              buttonColor={theme.colors.primary}
              contentStyle={styles.buttonContent}
            >
              {t('arweave.upload.uploadButton')}
            </Button>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              {t('arweave.upload.cancelButton')}
            </Button>
          </View>
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={fileSourceDialogVisible}
        onDismiss={() => setFileSourceDialogVisible(false)}
        title={t('arweave.upload.pickSourceTitle')}
      >
        <Button
          mode="outlined"
          icon="image"
          onPress={() => { void pickFromSource('gallery'); }}
          style={styles.sourceButton}
        >
          {t('arweave.upload.pickFromGallery')}
        </Button>
        <Button
          mode="outlined"
          icon="folder-open-outline"
          onPress={() => { void pickFromSource('documents'); }}
          style={styles.sourceButton}
        >
          {t('arweave.upload.pickFromFiles')}
        </Button>
      </AppModal>

      <AppModal
        visible={confirmVisible}
        onDismiss={() => setConfirmVisible(false)}
        title={t('arweave.upload.confirmTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: () => setConfirmVisible(false) },
          {
            label: t('arweave.upload.confirmButton'),
            onPress: startPasswordInput,
            disabled: !canConfirmUpload,
          },
        ]}
      >
        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.confirmFile')}
          </Text>
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>
            {pickedFile?.fileName ?? '—'}
          </Text>
        </View>

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.fileTypeLabel')}
          </Text>
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>
            {t(`arweave.upload.fileType.${fileType}`)}
          </Text>
        </View>

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.noteLabel')}
          </Text>
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>
            {note.trim() || t('arweave.upload.noNote')}
          </Text>
        </View>

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.balanceLabel')}
          </Text>
          <View style={styles.feeRow}>
            {balanceLoading && <ActivityIndicator size="small" style={styles.feeSpinner} />}
            <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>
              {balanceDisplay}
            </Text>
          </View>
        </View>

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.confirmFee')}
          </Text>
          <View style={styles.feeRow}>
            {feeLoading && <ActivityIndicator size="small" style={styles.feeSpinner} />}
            <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>
              {feeDisplay}
            </Text>
          </View>
        </View>

        {insufficientBalance && (
          <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
            <Text style={[styles.confirmWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
              {t('arweave.upload.insufficientBalance')}
            </Text>
          </View>
        )}

        {feeError && !feeLoading && (
          <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
            <Text style={[styles.confirmWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
              {t('arweave.upload.feeEstimateFailed')}
            </Text>
            <Button mode="outlined" compact onPress={() => { void loadFeeAndBalance(); }} style={styles.feeRetryButton}>
              {t('arweave.upload.feeRetry')}
            </Button>
          </View>
        )}

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.feeDisclaimer, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.feeDisclaimer')}
          </Text>
        </View>

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.feeDisclaimer, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
            {t('arweave.upload.submitDisclaimer')}
          </Text>
        </View>

        <View style={[modalInsetFrameStyle, styles.confirmFrame]}>
          <Text style={[styles.safetyTip, { color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale) }]}>
            {t('arweave.upload.safetyTip')}
          </Text>
        </View>
      </AppModal>

      <AppModal
        visible={passwordVisible}
        onDismiss={() => {
          if (!loading) {
            setPasswordVisible(false);
            setPassword('');
            setPasswordError(null);
          }
        }}
        dismissable={!loading}
        title={t('arweave.upload.passwordTitle')}
        actions={[
          {
            label: t('common.cancel'),
            disabled: loading,
            onPress: () => {
              setPasswordVisible(false);
              setPassword('');
              setPasswordError(null);
            },
          },
          {
            label: t('common.ok'),
            onPress: () => { void executeUpload(); },
            loading,
            disabled: loading,
          },
        ]}
      >
        <TextInput
          mode="outlined"
          label={t('arweave.upload.passwordLabel')}
          secureTextEntry
          keyboardType="numeric"
          maxLength={16}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError(null);
          }}
          autoFocus
          disabled={loading}
          error={!!passwordError}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        {passwordError ? (
          <HelperText type="error" visible>
            {passwordError}
          </HelperText>
        ) : null}
      </AppModal>

      <AppModal
        visible={cancelConfirmVisible}
        onDismiss={() => setCancelConfirmVisible(false)}
        title={t('arweave.upload.cancelConfirmTitle')}
        actions={[
          {
            label: t('arweave.upload.discardChanges'),
            onPress: () => {
              setCancelConfirmVisible(false);
              navigation.goBack();
            },
            mode: 'outlined',
          },
          {
            label: t('arweave.upload.continueEdit'),
            onPress: () => setCancelConfirmVisible(false),
          },
        ]}
      >
        <Text>{t('arweave.upload.cancelConfirmMsg')}</Text>
      </AppModal>

      <AppModal
        visible={successVisible}
        onDismiss={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
        title={t('arweave.upload.uploadSuccess')}
        actions={[
          {
            label: t('common.copy'),
            onPress: async () => {
              await Clipboard.setStringAsync(successTxId);
              setSnackbarMessage(t('common.copied'));
              setSnackbarVisible(true);
            },
          },
          {
            label: t('common.ok'),
            onPress: () => {
              setSuccessVisible(false);
              navigation.goBack();
            },
          },
        ]}
      >
        <Text variant="bodyMedium" style={styles.dialogBody} selectable>
          {t('arweave.upload.txId', { id: successTxId })}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
          {t('arweave.upload.submitHint')}
        </Text>
      </AppModal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  fieldLabel: { marginBottom: 6, fontWeight: '600' },
  textArea: { minHeight: 120, marginBottom: 16 },
  textAreaContent: { minHeight: 96, textAlignVertical: 'top', paddingTop: 8 },
  selectFileButton: { marginTop: 4, borderRadius: 8 },
  sourceButton: { marginTop: 8, borderRadius: 8 },
  buttonGroup: { marginTop: 32, gap: 12 },
  button: { borderRadius: 8 },
  buttonContent: { paddingVertical: 6 },
  confirmFrame: { marginBottom: 12 },
  confirmLabel: { fontWeight: '600', marginBottom: 4 },
  confirmValue: {},
  confirmWarning: { lineHeight: 18 },
  feeRow: { flexDirection: 'row', alignItems: 'center' },
  feeSpinner: { marginRight: 8 },
  feeRetryButton: { marginTop: 8, alignSelf: 'flex-start' },
  feeDisclaimer: { lineHeight: 18 },
  safetyTip: { lineHeight: 17 },
  dialogBody: { lineHeight: 22 },
});
