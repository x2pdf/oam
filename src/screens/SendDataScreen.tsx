import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Card,
  IconButton,
  Portal,
  Dialog,
  TextInput as PaperTextInput,
  Snackbar,
  ActivityIndicator,
  RadioButton,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { unlockSession, INVALID_PASSWORD_ERROR, NO_KEYSTORE_ERROR } from '../wallet/session';
import { isAddress } from 'ethers';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { getImagePickerAdapter, getImageRendererAdapter } from '../adapter';
import { ContentItem, createJpegItem, createPngItem, createGifItem } from '../mypayload';
import { estimateSendFeeFromAddress, OAMPClient } from '../oamp/client';
import { BLACK_HOLE } from '../oamp/protocol';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';
import {
  lookupRecipientPublicKey,
  normalizePublicKeyInput,
  publicKeyMatchesAddress,
} from '../oamp/recoverPublicKey';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const PlatformImage = getImageRendererAdapter().Image;

interface ImageItem {
  uri: string;
  base64: string;
  name?: string;
  type: 'image/jpeg' | 'image/png' | 'image/gif';
}

const DATA_PREVIEW_MAX = 80;

export default function SendDataScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { profile } = state;

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [recipientAddress, setRecipientAddress] = useState(BLACK_HOLE);
  const [encryptEnabled, setEncryptEnabled] = useState(false);
  const [recipientPublicKey, setRecipientPublicKey] = useState<string | null>(null);
  const [pubkeyLookupVisible, setPubkeyLookupVisible] = useState(false);
  const [noPubkeyDialogVisible, setNoPubkeyDialogVisible] = useState(false);
  const [noPubkeyReason, setNoPubkeyReason] = useState<'no-history' | 'recover-failed'>('no-history');
  const [manualPubkey, setManualPubkey] = useState('');
  const [manualPubkeyError, setManualPubkeyError] = useState('');
  const [encryptUnavailableVisible, setEncryptUnavailableVisible] = useState(false);

  const isSelf = useMemo(() => {
    if (!profile?.address || !recipientAddress) return false;
    return recipientAddress.toLowerCase() === profile.address.toLowerCase();
  }, [profile?.address, recipientAddress]);

  const canChooseEncrypt = useMemo(() => {
    const target = recipientAddress.trim();
    if (!target || !isAddress(target)) return false;
    if (target.toLowerCase() === BLACK_HOLE.toLowerCase()) return false;
    if (isSelf) return false;
    return true;
  }, [recipientAddress, isSelf]);

  const sendModeLabel = useMemo(() => {
    const target = recipientAddress.trim() || BLACK_HOLE;
    if (isSelf) return t('send.confirmModePersonal');
    if (target.toLowerCase() === BLACK_HOLE.toLowerCase()) return t('send.confirmModeBroadcast');
    if (encryptEnabled) return t('send.confirmModeEncrypted');
    return t('send.confirmModeUnencrypted');
  }, [isSelf, recipientAddress, encryptEnabled, t]);

  const dataSummary = useMemo(() => {
    const lines: string[] = [];
    const trimmed = text.trim();
    if (trimmed) {
      const preview =
        trimmed.length > DATA_PREVIEW_MAX
          ? `${trimmed.slice(0, DATA_PREVIEW_MAX)}…`
          : trimmed;
      lines.push(t('send.confirmDataText', { text: preview }));
    } else {
      lines.push(t('send.confirmDataEmpty'));
    }
    if (images.length > 0) {
      lines.push(t('send.confirmDataImages', { count: images.length }));
    }
    return lines.join('\n');
  }, [text, images.length, t]);

  // Dialog states
  const [confirmSendVisible, setConfirmSendVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [imageNameDialogVisible, setImageNameDialogVisible] = useState(false);
  const [currentPickingImage, setCurrentPickingImage] = useState<ImageItem | null>(null);

  const [feeEstimate, setFeeEstimate] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState(false);

  const [loading, setLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const buildContentItems = useCallback((): ContentItem[] => {
    const items: ContentItem[] = [];
    if (text) {
      items.push({ type: 'text', content: text });
    }
    for (const img of images) {
      if (img.type === 'image/png') {
        items.push(createPngItem(img.base64, img.name));
      } else if (img.type === 'image/gif') {
        items.push(createGifItem(img.base64, img.name));
      } else {
        items.push(createJpegItem(img.base64, img.name));
      }
    }
    return items;
  }, [text, images]);

  useEffect(() => {
    setRecipientPublicKey(null);
  }, [recipientAddress]);

  useEffect(() => {
    if (!canChooseEncrypt && encryptEnabled) {
      setEncryptEnabled(false);
      setRecipientPublicKey(null);
    }
  }, [canChooseEncrypt, encryptEnabled]);

  const resetFeeState = () => {
    setFeeEstimate(null);
    setFeeLoading(false);
    setFeeError(false);
  };

  const disableEncryptionAndReturn = () => {
    setEncryptUnavailableVisible(false);
    setNoPubkeyDialogVisible(false);
    setManualPubkey('');
    setManualPubkeyError('');
    setRecipientPublicKey(null);
    setEncryptEnabled(false);
  };

  const closeConfirmDialog = () => {
    setConfirmSendVisible(false);
    resetFeeState();
  };

  const estimateFee = async (pubKey?: string | null) => {
    setFeeLoading(true);
    setFeeEstimate(null);
    setFeeError(false);
    try {
      const fromAddress = profile?.address;
      if (!fromAddress) {
        throw new Error(t('send.noPrivateKey'));
      }
      const items = buildContentItems();
      const target = recipientAddress.trim() || BLACK_HOLE;
      const resolvedKey = pubKey ?? recipientPublicKey;
      const { feeEth } = await estimateSendFeeFromAddress(
        fromAddress,
        DEFAULT_RPC_NODE,
        target,
        items,
        isSelf,
        {
          encrypt: encryptEnabled && !!resolvedKey,
          recipientPublicKey: resolvedKey || undefined,
        },
      );
      setFeeEstimate(feeEth);
    } catch (error) {
      console.error('Fee estimate error:', error);
      setFeeError(true);
    } finally {
      setFeeLoading(false);
    }
  };

  const openConfirmAndEstimate = (pubKey?: string | null) => {
    setConfirmSendVisible(true);
    estimateFee(pubKey);
  };

  const handleEncryptChange = (enabled: boolean) => {
    setEncryptEnabled(enabled);
    if (!enabled) {
      setRecipientPublicKey(null);
    }
  };

  const handleManualPubkeyConfirm = () => {
    const target = recipientAddress.trim();
    setManualPubkeyError('');
    try {
      const normalized = normalizePublicKeyInput(manualPubkey);
      if (!publicKeyMatchesAddress(normalized, target)) {
        setManualPubkeyError(t('send.publicKeyMismatch'));
        return;
      }
      setRecipientPublicKey(normalized);
      setNoPubkeyDialogVisible(false);
      setManualPubkey('');
      openConfirmAndEstimate(normalized);
    } catch {
      setManualPubkeyError(t('send.invalidPublicKey'));
    }
  };

  const handleNoPublicKey = () => {
    setNoPubkeyDialogVisible(false);
    setManualPubkey('');
    setManualPubkeyError('');
    setEncryptUnavailableVisible(true);
  };

  const pickImage = async () => {
    try {
      const adapter = getImagePickerAdapter();
      const result = await adapter.pickImage();

      if (result) {
        setCurrentPickingImage({
          uri: result.uri,
          base64: result.base64,
          name: result.name,
          type: result.type,
        });
        setImageNameDialogVisible(true);
      }
    } catch (error) {
      console.error('Pick image error:', error);
      setSnackbarMessage(t('send.pickImageFailed'));
      setSnackbarVisible(true);
    }
  };

  const handleImageNameConfirm = (attach: boolean) => {
    if (currentPickingImage) {
      const newImage = { ...currentPickingImage };
      if (!attach) {
        delete newImage.name;
      }
      setImages([...images, newImage]);
    }
    setImageNameDialogVisible(false);
    setCurrentPickingImage(null);
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const handleCancel = () => {
    if (text.length > 0 || images.length > 0) {
      setCancelConfirmVisible(true);
    } else {
      navigation.goBack();
    }
  };

  const confirmCancel = () => {
    setCancelConfirmVisible(false);
    setText('');
    setImages([]);
    navigation.goBack();
  };

  const handleSend = async () => {
    const target = recipientAddress.trim() || BLACK_HOLE;
    const useP2PEncrypt = encryptEnabled && !isSelf && target.toLowerCase() !== BLACK_HOLE.toLowerCase();

    if (useP2PEncrypt) {
      if (!isAddress(target)) {
        setSnackbarMessage(t('send.invalidAddress'));
        setSnackbarVisible(true);
        return;
      }
      if (!recipientPublicKey) {
        setPubkeyLookupVisible(true);
        try {
          const result = await lookupRecipientPublicKey(target, DEFAULT_RPC_NODE);
          setPubkeyLookupVisible(false);
          if (result.ok) {
            setRecipientPublicKey(result.publicKey);
            openConfirmAndEstimate(result.publicKey);
            return;
          }
          setNoPubkeyReason(result.reason);
          setManualPubkey('');
          setManualPubkeyError('');
          setNoPubkeyDialogVisible(true);
        } catch (error) {
          console.error('Public key lookup error:', error);
          setPubkeyLookupVisible(false);
          setNoPubkeyReason('recover-failed');
          setManualPubkey('');
          setManualPubkeyError('');
          setNoPubkeyDialogVisible(true);
        }
        return;
      }
    }

    openConfirmAndEstimate();
  };

  const startPasswordInput = () => {
    closeConfirmDialog();
    setPasswordVisible(true);
  };

  const executeSend = async () => {
    if (!password) {
      setSnackbarMessage(t('send.passwordLabel'));
      setSnackbarVisible(true);
      return;
    }

    setLoading(true);
    try {
      const wallet = await unlockSession(password);
      const client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
      const items = buildContentItems();

      let txHash = '';
      const target = recipientAddress.trim() || BLACK_HOLE;

      if (isSelf) {
        txHash = await client.sendPersonalNote(items);
      } else if (target.toLowerCase() === BLACK_HOLE.toLowerCase()) {
        txHash = await client.sendBroadcast(items);
      } else if (encryptEnabled) {
        if (!recipientPublicKey) {
          throw new Error(t('send.encryptUnavailableTitle'));
        }
        txHash = await client.sendP2PMessage(target, recipientPublicKey, items);
      } else {
        txHash = await client.sendUnencryptedMessage(target, items);
      }

      setLoading(false);
      setPasswordVisible(false);
      Alert.alert(t('send.sendSuccess'), t('send.txHash', { hash: txHash }), [
        { text: t('common.ok'), onPress: () => navigation.goBack() }
      ]);

      setText('');
      setImages([]);
    } catch (error: any) {
      console.error('Send error:', error);
      setLoading(false);
      const message =
        error?.name === NO_KEYSTORE_ERROR
          ? t('send.noPrivateKey')
          : error?.name === INVALID_PASSWORD_ERROR
            ? t('home.passwordIncorrect')
            : error.message;
      setSnackbarMessage(t('send.sendFailed', { error: message }));
      setSnackbarVisible(true);
    }
  };

  const feeDisplay = feeLoading
    ? t('send.feeEstimating')
    : feeError || !feeEstimate
      ? t('send.feeEstimateFailed')
      : t('send.feeEstimateValue', { fee: feeEstimate });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            multiline
            placeholder={t('send.inputPlaceholder')}
            value={text}
            onChangeText={setText}
            placeholderTextColor={theme.colors.onSurfaceVariant}
          />
        </Card>

        {images.map((img, index) => (
          <Card key={index} style={styles.imageListItem}>
            <View style={styles.imageCardContent}>
              <PlatformImage
                uri={img.uri}
                mimeType={img.type}
                style={styles.thumbnail}
                resizeMode="contain"
              />
              <View style={styles.imageInfo}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {img.name ? img.name : `数据摘要: ${img.base64.substring(0, 20)}...`}
                </Text>
              </View>
              <IconButton icon="close" size={20} onPress={() => removeImage(index)} />
            </View>
          </Card>
        ))}

        <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
          <Card style={styles.addImageCard}>
            <View style={styles.addImageContent}>
              <IconButton icon="image-plus" size={24} />
              <Text>{t('send.addImage')}</Text>
            </View>
          </Card>
        </TouchableOpacity>

        <Card style={styles.optionCard}>
          <Text style={styles.optionTitle}>接收地址</Text>
          <PaperTextInput
            mode="outlined"
            placeholder="0x..."
            value={recipientAddress}
            onChangeText={setRecipientAddress}
            style={styles.addressInput}
            dense
          />
          <View style={styles.shortcutRow}>
            <Button
              mode="outlined"
              compact
              onPress={() => setRecipientAddress(BLACK_HOLE)}
              style={styles.shortcutButton}
              labelStyle={{ fontSize: 12 }}
            >
              黑洞地址
            </Button>
            {profile?.address && (
              <Button
                mode="outlined"
                compact
                onPress={() => setRecipientAddress(profile.address)}
                style={styles.shortcutButton}
                labelStyle={{ fontSize: 12 }}
              >
                自己
              </Button>
            )}
          </View>
        </Card>

        {canChooseEncrypt && (
          <Card style={styles.optionCard}>
            <Text style={styles.optionTitle}>{t('send.encryptOption')}</Text>
            <RadioButton.Group
              onValueChange={(value) => handleEncryptChange(value === 'yes')}
              value={encryptEnabled ? 'yes' : 'no'}
            >
              <RadioButton.Item
                label={t('send.encryptNo')}
                value="no"
                style={styles.radioItem}
                labelStyle={styles.radioLabel}
              />
              <RadioButton.Item
                label={t('send.encryptYes')}
                value="yes"
                style={styles.radioItem}
                labelStyle={styles.radioLabel}
              />
            </RadioButton.Group>
          </Card>
        )}

        <Button
          mode="contained"
          onPress={handleSend}
          disabled={pubkeyLookupVisible}
          loading={pubkeyLookupVisible}
          style={styles.sendButton}
          contentStyle={styles.buttonContent}
        >
          {t('send.sendButton')}
        </Button>

        <Button
          mode="outlined"
          onPress={handleCancel}
          style={styles.cancelButton}
          contentStyle={styles.buttonContent}
        >
          {t('common.cancel')}
        </Button>
      </ScrollView>

      {/* Dialogs */}
      <Portal>
        {/* 图片名称确认 */}
        <Dialog visible={imageNameDialogVisible} onDismiss={() => setImageNameDialogVisible(false)}>
          <Dialog.Title>{t('send.imageNameDialogTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('send.imageNameDialogMsg')}</Text>
            {currentPickingImage?.name && (
              <Text style={{ marginTop: 8, fontWeight: 'bold' }}>{currentPickingImage.name}</Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => handleImageNameConfirm(false)}>{t('send.imageNameDialogNo')}</Button>
            <Button onPress={() => handleImageNameConfirm(true)}>{t('send.imageNameDialogYes')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 交易确认回显 */}
        <Dialog visible={confirmSendVisible} onDismiss={closeConfirmDialog}>
          <Dialog.Title>{t('send.confirmTxTitle')}</Dialog.Title>
          <Dialog.ScrollArea style={styles.confirmScrollArea}>
            <ScrollView>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('send.confirmRecipient')}</Text>
                <Text style={styles.confirmValue} selectable>
                  {recipientAddress.trim() || BLACK_HOLE}
                </Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('send.confirmMode')}</Text>
                <Text style={styles.confirmValue}>{sendModeLabel}</Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('send.confirmData')}</Text>
                <Text style={styles.confirmValue}>{dataSummary}</Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('send.confirmFee')}</Text>
                <View style={styles.feeRow}>
                  {feeLoading && (
                    <ActivityIndicator size="small" style={styles.feeSpinner} />
                  )}
                  <Text style={styles.confirmValue}>{feeDisplay}</Text>
                </View>
              </View>

              <Text style={[styles.feeDisclaimer, { color: theme.colors.error }]}>
                {t('send.feeDisclaimer')}
              </Text>

              <Text style={[styles.safetyTip, { color: theme.colors.onSurfaceVariant }]}>
                {t('send.safetyTipMsg')}
              </Text>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeConfirmDialog}>{t('common.cancel')}</Button>
            <Button onPress={startPasswordInput}>{t('wallet.verifyButtonConfirm')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 支付密码输入 */}
        <Dialog visible={passwordVisible} onDismiss={() => !loading && setPasswordVisible(false)}>
          <Dialog.Title>{t('send.passwordTitle')}</Dialog.Title>
          <Dialog.Content>
            <PaperTextInput
              label={t('send.passwordLabel')}
              secureTextEntry
              maxLength={16}
              value={password}
              onChangeText={setPassword}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={loading} onPress={() => setPasswordVisible(false)}>{t('common.cancel')}</Button>
            <Button loading={loading} disabled={loading} onPress={executeSend}>{t('common.ok')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 取消确认 */}
        <Dialog visible={cancelConfirmVisible} onDismiss={() => setCancelConfirmVisible(false)}>
          <Dialog.Title>{t('send.confirmCancelTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('send.confirmCancelMsg')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelConfirmVisible(false)}>{t('send.continueEdit')}</Button>
            <Button onPress={confirmCancel}>{t('common.ok')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 查询接收地址公钥 */}
        <Dialog visible={pubkeyLookupVisible} dismissable={false}>
          <Dialog.Title>{t('send.pubkeyLookupTitle')}</Dialog.Title>
          <Dialog.Content>
            <View style={styles.lookupRow}>
              <ActivityIndicator size="small" style={styles.feeSpinner} />
              <Text>{t('send.pubkeyLookupMsg')}</Text>
            </View>
          </Dialog.Content>
        </Dialog>

        {/* 无法从链上找到公钥：可手填 */}
        <Dialog visible={noPubkeyDialogVisible} dismissable={false}>
          <Dialog.Title>{t('send.noPubkeyTitle')}</Dialog.Title>
          <Dialog.ScrollArea style={styles.confirmScrollArea}>
            <ScrollView>
              <Text style={styles.dialogBody}>
                {noPubkeyReason === 'no-history'
                  ? t('send.noPubkeyMsg')
                  : t('send.noPubkeyRecoverFailed')}
              </Text>
              <Text style={[styles.dialogHint, { color: theme.colors.onSurfaceVariant }]}>
                {t('send.noPubkeyManualHint')}
              </Text>
              <PaperTextInput
                mode="outlined"
                multiline
                placeholder={t('send.noPubkeyPlaceholder')}
                value={manualPubkey}
                onChangeText={(value) => {
                  setManualPubkey(value);
                  if (manualPubkeyError) setManualPubkeyError('');
                }}
                style={styles.pubkeyInput}
                error={!!manualPubkeyError}
              />
              {!!manualPubkeyError && (
                <Text style={[styles.dialogError, { color: theme.colors.error }]}>
                  {manualPubkeyError}
                </Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={styles.dialogActionsWrap}>
            <Button onPress={handleNoPublicKey}>{t('send.noPubkeyNone')}</Button>
            <Button onPress={handleManualPubkeyConfirm}>{t('send.noPubkeyConfirm')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 没有公钥：无法启用加密，返回并取消加密选项 */}
        <Dialog visible={encryptUnavailableVisible} onDismiss={disableEncryptionAndReturn}>
          <Dialog.Title>{t('send.encryptUnavailableTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('send.encryptUnavailableMsg')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={disableEncryptionAndReturn}>{t('common.back')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  inputCard: {
    minHeight: 150,
    maxHeight: 300,
    marginBottom: 16,
    padding: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    textAlignVertical: 'top',
    color: '#000',
  },
  addImageButton: {
    marginBottom: 16,
  },
  addImageCard: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'transparent',
    elevation: 0,
  },
  addImageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  imageListItem: {
    marginBottom: 8,
  },
  imageCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  imageInfo: {
    flex: 1,
    marginLeft: 12,
  },
  optionCard: {
    padding: 16,
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  addressInput: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  shortcutButton: {
    marginRight: 8,
    marginTop: 4,
  },
  radioItem: {
    paddingLeft: 0,
    paddingVertical: 0,
  },
  radioLabel: {
    fontSize: 14,
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  dialogHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  pubkeyInput: {
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  dialogError: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  dialogActionsWrap: {
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  sendButton: {
    marginTop: 8,
    marginBottom: 12,
  },
  cancelButton: {
    marginBottom: 24,
  },
  buttonContent: {
    height: 48,
  },
  confirmScrollArea: {
    maxHeight: 360,
    paddingHorizontal: 0,
  },
  confirmRow: {
    marginBottom: 12,
  },
  confirmLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.7,
  },
  confirmValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feeSpinner: {
    marginRight: 8,
  },
  feeDisclaimer: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  safetyTip: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
});
