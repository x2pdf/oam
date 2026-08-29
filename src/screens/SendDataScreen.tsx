import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import {
  Text,
  Button,
  useTheme,
  Card,
  IconButton,
  TextInput,
  Snackbar,
  ActivityIndicator,
  RadioButton,
  HelperText,
  Searchbar,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { unlockSession, INVALID_PASSWORD_ERROR, NO_KEYSTORE_ERROR, PASSWORD_LOCKED_ERROR } from '../wallet/session';
import { usePasswordLockRemaining } from '../wallet/WalletSessionContext';
import { isAddress, parseEther, formatEther, parseUnits, formatUnits, Wallet } from 'ethers';
import { RootStackParamList, SendDraft, SendDraftAttachment, Subscription } from '../types';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { getImagePickerAdapter, getImageRendererAdapter } from '../adapter';
import { ContentItem, createJpegItem, createPngItem, createGifItem, createLinkItem } from '../mypayload';
import { AddAttachmentModal } from '../components/AddAttachmentModal';
import { estimateSendFeeFromAddress, OAMPClient, getFeeSuggestions, FeeOption, FeeSuggestions, intrinsicGas } from '../oamp/client';
import { BLACK_HOLE } from '../oamp/protocol';
import {
  lookupRecipientPublicKey,
  normalizePublicKeyInput,
  publicKeyMatchesAddress,
} from '../oamp/recoverPublicKey';
import { AppModal } from '../components/AppModal';
import { AllRpcFailedError, withRpcFallback } from '../rpc/rpcClient';
import { fetchEthUsdPrice, ethToUsdDisplay } from '../rpc/ethPrice';
import { showAlert } from '../utils/alert';
import * as Clipboard from 'expo-clipboard';
import { shortenAddress } from '../utils/address';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'SendData'>;

const PlatformImage = getImageRendererAdapter().Image;

interface ImageItem {
  uri: string;
  base64: string;
  name?: string;
  type: 'image/jpeg' | 'image/png' | 'image/gif';
}

const DATA_PREVIEW_MAX = 80;

function wrapLongHex(value: string): string {
  return value.replace(/(.{8})/g, '$1\u200b');
}

function draftImageToItem(img: SendDraft['images'][number]): ImageItem {
  return {
    uri: `data:${img.type};base64,${img.base64}`,
    base64: img.base64,
    name: img.name,
    type: img.type,
  };
}

function sortSubscriptions(items: Subscription[]): Subscription[] {
  return [...items].sort((a, b) => {
    const wa = a.pinWeight ?? 0;
    const wb = b.pinWeight ?? 0;
    const aPinned = wa > 0;
    const bPinned = wb > 0;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (aPinned && bPinned) {
      if (wa !== wb) return wb - wa;
      return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
    }
    return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
  });
}

export default function SendDataScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const { state, upsertDraft, deleteDraft } = useAppContext();
  const { profile, subscriptions } = state;
  const routeDraftId = route.params?.draftId;
  const initialDraft = useMemo(
    () => (routeDraftId ? state.drafts.find((d) => d.id === routeDraftId) : undefined),
    // 仅用于首屏回填，避免草稿列表后续变化重置正在编辑的内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [text, setText] = useState(initialDraft?.text ?? '');
  const [images, setImages] = useState<ImageItem[]>(() =>
    (initialDraft?.images ?? []).map(draftImageToItem),
  );
  const [attachments, setAttachments] = useState<SendDraftAttachment[]>(
    () => initialDraft?.attachments ?? [],
  );
  const [recipientAddress, setRecipientAddress] = useState(
    initialDraft?.recipientAddress || route.params?.recipientAddress || profile?.address || BLACK_HOLE,
  );
  const [encryptEnabled, setEncryptEnabled] = useState(initialDraft?.encryptEnabled ?? false);
  const [currentDraftId, setCurrentDraftId] = useState(routeDraftId);
  const appliedDraftRef = useRef(!!initialDraft);
  const [recipientPublicKey, setRecipientPublicKey] = useState<string | null>(null);
  const [pubkeyLookupVisible, setPubkeyLookupVisible] = useState(false);
  const [noPubkeyDialogVisible, setNoPubkeyDialogVisible] = useState(false);
  const [noPubkeyReason, setNoPubkeyReason] = useState<'no-history' | 'recover-failed'>('no-history');
  const [manualPubkey, setManualPubkey] = useState('');
  const [manualPubkeyError, setManualPubkeyError] = useState('');
  const [encryptUnavailableVisible, setEncryptUnavailableVisible] = useState(false);

  useEffect(() => {
    if (route.params?.recipientAddress) {
      setRecipientAddress(route.params.recipientAddress);
    }
  }, [route.params?.recipientAddress]);

  const recipientKey = recipientAddress.trim().toLowerCase();

  const isSelf = useMemo(() => {
    if (!profile?.address || !recipientKey) return false;
    return recipientKey === profile.address.toLowerCase();
  }, [profile?.address, recipientKey]);

  const isBlackHoleRecipient = useMemo(
    () => recipientKey === BLACK_HOLE.toLowerCase(),
    [recipientKey],
  );

  const isFollowingRecipient = useMemo(() => {
    if (!recipientKey || isBlackHoleRecipient || isSelf) return false;
    return subscriptions.some((s) => s.address.toLowerCase() === recipientKey);
  }, [recipientKey, isBlackHoleRecipient, isSelf, subscriptions]);

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

  const openFollowList = () => {
    navigation.navigate('FollowListSelection');
  };

  const handleRandomAddress = () => {
    try {
      const randomWallet = Wallet.createRandom();
      setRecipientAddress(randomWallet.address);
    } catch (e) {
      console.error('Failed to generate random address', e);
    }
  };

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
    if (attachments.length > 0) {
      lines.push(t('send.confirmDataAttachments', { count: attachments.length }));
    }
    return lines.join('\n');
  }, [text, images.length, attachments.length, t]);

  // Dialog states
  const [confirmSendVisible, setConfirmSendVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordLockRemainingMs = usePasswordLockRemaining(passwordVisible);
  const passwordLocked = passwordLockRemainingMs > 0;
  const [imageNameDialogVisible, setImageNameDialogVisible] = useState(false);
  const [imageSourceDialogVisible, setImageSourceDialogVisible] = useState(false);
  const [attachmentDialogVisible, setAttachmentDialogVisible] = useState(false);
  const [currentPickingImage, setCurrentPickingImage] = useState<ImageItem | null>(null);

  const [feeEstimate, setFeeEstimate] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState(false);
  const [feeEstimatePubKey, setFeeEstimatePubKey] = useState<string | null | undefined>(undefined);
  const [balanceEth, setBalanceEth] = useState<string | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState(false);
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);

  const [feeOption, setFeeOption] = useState<FeeOption | null>(null);
  const [feeSuggestions, setFeeSuggestions] = useState<FeeSuggestions | null>(null);
  const [feeAdjustmentVisible, setFeeAdjustmentVisible] = useState(false);
  const [customMaxFee, setCustomMaxFee] = useState('');
  const [customMaxPriority, setCustomMaxPriority] = useState('');

  const [loading, setLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const [sendSuccessVisible, setSendSuccessVisible] = useState(false);
  const [sendSuccessHash, setSendSuccessHash] = useState('');

  const [hexSendVisible, setHexSendVisible] = useState(false);
  const [hexData, setHexData] = useState('');
  const [hexSendLoading, setHexSendLoading] = useState(false);

  const [ethSendVisible, setEthSendVisible] = useState(false);
  const [ethAmount, setEthAmount] = useState('');
  const [ethAmountError, setEthAmountError] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [ethBalanceLoading, setEthBalanceLoading] = useState(false);
  const [fastFeeWei, setFastFeeWei] = useState<bigint>(0n);

  const [passwordAction, setPasswordAction] = useState<'send' | 'hexSend' | 'ethSend'>('send');

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
    for (const att of attachments) {
      items.push(
        createLinkItem({
          href: att.href,
          mime: att.mime,
          label: att.label,
          arId: att.arId,
        }),
      );
    }
    return items;
  }, [text, images, attachments]);

  // Default to own address when profile becomes available (profile loads async)
  useEffect(() => {
    if (
      profile?.address &&
      !route.params?.recipientAddress &&
      !routeDraftId &&
      recipientAddress.toLowerCase() === BLACK_HOLE.toLowerCase()
    ) {
      setRecipientAddress(profile.address);
    }
  }, [profile?.address]);

  useEffect(() => {
    if (appliedDraftRef.current) return;
    if (!routeDraftId) return;
    const draft = state.drafts.find((d) => d.id === routeDraftId);
    if (!draft) return;
    appliedDraftRef.current = true;
    setText(draft.text);
    setImages(draft.images.map(draftImageToItem));
    setAttachments(draft.attachments ?? []);
    setRecipientAddress(draft.recipientAddress || BLACK_HOLE);
    setEncryptEnabled(!!draft.encryptEnabled);
    setCurrentDraftId(draft.id);
  }, [routeDraftId, state.drafts]);

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
    setFeeEstimatePubKey(undefined);
    setBalanceEth(null);
    setInsufficientBalance(false);
    setFeeOption(null);
    setFeeSuggestions(null);
  };

  const ethValueToSend = useMemo(() => {
    try {
      return ethAmount ? parseEther(ethAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [ethAmount]);

  const canConfirmSend = useMemo(
    () => !feeLoading && !feeError && !!feeEstimate && !insufficientBalance,
    [feeLoading, feeError, feeEstimate, insufficientBalance],
  );

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

  const estimateFee = async (pubKey?: string | null, manualFeeOption?: FeeOption | null) => {
    setFeeLoading(true);
    setFeeError(false);
    // Don't clear feeEstimate immediately to avoid flickering if it's the same
    setBalanceEth(null);
    setInsufficientBalance(false);
    try {
      const fromAddress = profile?.address;
      if (!fromAddress) {
        throw new Error(t('send.noPrivateKey'));
      }
      const items = buildContentItems();
      const target = recipientAddress.trim() || BLACK_HOLE;
      const resolvedKey = pubKey ?? recipientPublicKey;

      // Use the manual option if provided, otherwise fall back to the state
      const currentFeeOption = manualFeeOption !== undefined ? manualFeeOption : feeOption;

      const [{ feeEth }, balanceWei, price] = await Promise.all([
        estimateSendFeeFromAddress(
          fromAddress,
          target,
          items,
          isSelf,
          {
            encrypt: encryptEnabled && !!resolvedKey,
            recipientPublicKey: resolvedKey || undefined,
            feeOption: currentFeeOption || undefined,
            value: ethValueToSend,
          },
        ),
        withRpcFallback((provider) => provider.getBalance(fromAddress)),
        fetchEthUsdPrice(),
      ]);
      setFeeEstimate(feeEth);
      setBalanceEth(formatEther(balanceWei));
      setInsufficientBalance(balanceWei < (parseEther(feeEth) + ethValueToSend));
      if (price != null) setEthUsdPrice(price);
    } catch (error) {
      console.error('Fee estimate error:', error);
      setFeeError(true);
      setFeeEstimate(null);
    } finally {
      setFeeLoading(false);
    }
  };

  const loadFeeSuggestions = async () => {
    try {
      const suggestions = await getFeeSuggestions();
      setFeeSuggestions(suggestions);
      if (!feeOption) {
        setFeeOption(suggestions.normal);
      }
    } catch (err) {
      console.warn('Failed to load fee suggestions', err);
    }
  };

  const openConfirmAndEstimate = (pubKey?: string | null) => {
    setFeeEstimatePubKey(pubKey);
    setConfirmSendVisible(true);
    estimateFee(pubKey);
    loadFeeSuggestions();
  };

  const openEthSendModal = async () => {
    setEthSendVisible(true);
    setEthBalanceLoading(true);
    setEthAmount('');
    setEthBalance(null);
    setFastFeeWei(0n);
    try {
      const fromAddress = profile?.address;
      if (!fromAddress) return;

      const [balanceWei, suggestions, { built }] = await Promise.all([
        withRpcFallback((provider) => provider.getBalance(fromAddress)),
        getFeeSuggestions(),
        estimateSendFeeFromAddress(
          fromAddress,
          recipientAddress.trim() || BLACK_HOLE,
          buildContentItems(),
          isSelf,
          { encrypt: encryptEnabled && !!recipientPublicKey, recipientPublicKey: recipientPublicKey || undefined }
        ),
      ]);

      setEthBalance(balanceWei);
      const gasLimit = intrinsicGas(built.data);
      const fastFee = gasLimit * (suggestions.fast.maxFeePerGas || suggestions.fast.gasPrice || 20000000000n);
      setFastFeeWei(fastFee);
    } catch (err) {
      console.warn('Failed to fetch balance or fee for ETH send', err);
    } finally {
      setEthBalanceLoading(false);
    }
  };

  const startEthSendConfirm = () => {
    if (ethAmountError) return;
    const amountWei = ethValueToSend;
    if (amountWei > 0n && ethBalance != null) {
      const maxAvailable = ethBalance > fastFeeWei ? ethBalance - fastFeeWei : 0n;
      if (amountWei > maxAvailable) {
        setSnackbarMessage(t('send.insufficientBalance'));
        setSnackbarVisible(true);
        return;
      }
    }
    setEthSendVisible(false);
    handleSend();
  };
  const handleFeeLevelSelect = (level: 'slow' | 'normal' | 'fast') => {
    if (!feeSuggestions) return;
    const selected = feeSuggestions[level];
    setFeeOption(selected);

    // Also update the custom input fields so the user sees the Gwei values change
    setCustomMaxFee(formatUnits(selected.maxFeePerGas || 0n, 'gwei'));
    setCustomMaxPriority(formatUnits(selected.maxPriorityFeePerGas || 0n, 'gwei'));

    // Explicitly pass the new selection because state update is async
    estimateFee(feeEstimatePubKey, selected);
  };

  const handleApplyCustomFee = () => {
    try {
      const maxFee = parseUnits(customMaxFee, 'gwei');
      const maxPriority = parseUnits(customMaxPriority, 'gwei');
      const selected: FeeOption = {
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriority,
        level: 'custom',
      };
      setFeeOption(selected);
      setFeeAdjustmentVisible(false);
      estimateFee(feeEstimatePubKey, selected);
    } catch (err) {
      showAlert(t('common.error'), t('send.invalidFeeInput'));
    }
  };

  const openFeeAdjustment = () => {
    const current = feeOption;
    if (current) {
      setCustomMaxFee(formatUnits(current.maxFeePerGas || current.gasPrice || 0n, 'gwei'));
      setCustomMaxPriority(formatUnits(current.maxPriorityFeePerGas || 0n, 'gwei'));
    }
    setFeeAdjustmentVisible(true);
  };

  const retryFeeEstimate = () => {
    estimateFee(feeEstimatePubKey);
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

  const applyPickedImage = (result: {
    uri: string;
    base64: string;
    name?: string;
    type: ImageItem['type'];
  }) => {
    setCurrentPickingImage({
      uri: result.uri,
      base64: result.base64,
      name: result.name,
      type: result.type,
    });
    setImageNameDialogVisible(true);
  };

  const pickImageFromSource = async (source: 'library' | 'files') => {
    setImageSourceDialogVisible(false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const adapter = getImagePickerAdapter();
      const result =
        source === 'files'
          ? await adapter.pickImageFromFiles()
          : await adapter.pickImage();

      if (result) {
        applyPickedImage(result);
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

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    if (text.length > 0 || images.length > 0 || attachments.length > 0) {
      setCancelConfirmVisible(true);
    } else {
      navigation.goBack();
    }
  };

  const confirmCancel = () => {
    setCancelConfirmVisible(false);
    setText('');
    setImages([]);
    setAttachments([]);
    setEthAmount('');
    navigation.goBack();
  };

  const persistDraft = useCallback(async () => {
    const id = currentDraftId ?? Date.now().toString();
    await upsertDraft({
      id,
      text,
      images: images.map(({ base64, name, type }) => ({ base64, name, type })),
      attachments,
      recipientAddress: recipientAddress.trim() || BLACK_HOLE,
      encryptEnabled,
      updatedAt: Date.now(),
    });
    setCurrentDraftId(id);
    return id;
  }, [attachments, currentDraftId, encryptEnabled, images, recipientAddress, text, upsertDraft]);

  const saveAsDraft = async () => {
    if (draftSaving) return;
    setDraftSaving(true);
    try {
      await persistDraft();
      setCancelConfirmVisible(false);
      navigation.goBack();
    } catch (error) {
      console.error('Save draft error:', error);
      setSnackbarMessage(t('send.draftSaveFailed'));
      setSnackbarVisible(true);
    } finally {
      setDraftSaving(false);
    }
  };

  const autoSaveDraftOnSendFailure = async (): Promise<boolean> => {
    if (text.length === 0 && images.length === 0 && attachments.length === 0) return false;
    try {
      await persistDraft();
      return true;
    } catch (error) {
      console.error('Auto-save draft error:', error);
      return false;
    }
  };

  const handleSend = async () => {
    if (text.trim().length === 0 && images.length === 0 && attachments.length === 0) {
      setSnackbarMessage(t('send.emptyContent'));
      setSnackbarVisible(true);
      return;
    }

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
          const result = await lookupRecipientPublicKey(target);
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
    if (!canConfirmSend) return;
    closeConfirmDialog();
    setPasswordError(null);
    setPasswordAction('send');
    setPasswordVisible(true);
  };

  const startHexPasswordInput = () => {
    const trimmedHex = hexData.trim();
    if (!trimmedHex || !trimmedHex.startsWith('0x')) {
      setSnackbarMessage(t('send.hexSendInvalid'));
      setSnackbarVisible(true);
      return;
    }
    setHexSendVisible(false);
    setPasswordError(null);
    setPasswordAction('hexSend');
    setPasswordVisible(true);
  };

  const executeSend = async () => {
    if (passwordLocked) return;
    if (!password) {
      setPasswordError(t('send.passwordLabel'));
      return;
    }

    setLoading(true);
    setPasswordError(null);
    try {
      const wallet = await unlockSession(password);
      const client = new OAMPClient(wallet.privateKey);
      const items = buildContentItems();

      let txHash = '';
      const target = recipientAddress.trim() || BLACK_HOLE;

      if (isSelf) {
        txHash = await client.sendPersonalNote(items, feeOption || undefined, ethValueToSend);
      } else if (target.toLowerCase() === BLACK_HOLE.toLowerCase()) {
        txHash = await client.sendBroadcast(items, feeOption || undefined, ethValueToSend);
      } else if (encryptEnabled) {
        if (!recipientPublicKey) {
          throw new Error(t('send.encryptUnavailableTitle'));
        }
        txHash = await client.sendP2PMessage(target, recipientPublicKey, items, feeOption || undefined, ethValueToSend);
      } else {
        txHash = await client.sendUnencryptedMessage(target, items, feeOption || undefined, ethValueToSend);
      }

      setLoading(false);
      setPasswordVisible(false);
      setSendSuccessHash(txHash);
      setSendSuccessVisible(true);

      setText('');
      setImages([]);
      setAttachments([]);
      setEthAmount('');
      setPassword('');
      if (currentDraftId) {
        await deleteDraft(currentDraftId);
      }
    } catch (error: any) {
      console.error('Send error:', error);
      setLoading(false);

      const isAuthError =
        error?.name === NO_KEYSTORE_ERROR ||
        error?.name === INVALID_PASSWORD_ERROR ||
        error?.name === PASSWORD_LOCKED_ERROR;

      let draftSaved = false;
      if (!isAuthError) {
        draftSaved = await autoSaveDraftOnSendFailure();
      }

      if (error?.name === PASSWORD_LOCKED_ERROR) {
        setPassword('');
        return;
      }

      if (error?.name === NO_KEYSTORE_ERROR || error?.name === INVALID_PASSWORD_ERROR) {
        setPasswordError(
          error?.name === NO_KEYSTORE_ERROR ? t('send.noPrivateKey') : t('home.passwordIncorrect'),
        );
        setPassword('');
        return;
      }

      const message = error.message;

      if (!isAuthError && (error instanceof AllRpcFailedError || error?.name === 'AllRpcFailedError')) {
        showAlert(
          t('send.networkFaultTitle'),
          draftSaved ? t('send.networkFaultMsgDraftSaved') : t('send.networkFaultMsg'),
          [
            {
              text: t('common.ok'),
              onPress: () => {
                setPasswordVisible(false);
                setPassword('');
              },
            },
          ],
        );
        return;
      }

      setPassword('');
    }
  };

  const executeHexSend = async () => {
    if (passwordLocked) return;
    if (!password) {
      setPasswordError(t('send.passwordLabel'));
      return;
    }

    const trimmedHex = hexData.trim();
    if (!trimmedHex.startsWith('0x')) {
      setSnackbarMessage(t('send.hexSendInvalid'));
      setSnackbarVisible(true);
      return;
    }

    setLoading(true);
    setPasswordError(null);
    try {
      const wallet = await unlockSession(password);
      const client = new OAMPClient(wallet.privateKey);

      const target = recipientAddress.trim() || BLACK_HOLE;
      const txHash = await client.sendRawHex(target, trimmedHex, feeOption || undefined, ethValueToSend);

      setLoading(false);
      setPasswordVisible(false);
      setHexSendVisible(false);
      setSendSuccessHash(txHash);
      setSendSuccessVisible(true);

      setHexData('');
      setEthAmount('');
      setPassword('');
    } catch (error: any) {
      console.error('Hex send error:', error);
      setLoading(false);

      if (error?.name === PASSWORD_LOCKED_ERROR) {
        setPassword('');
        return;
      }

      if (error?.name === NO_KEYSTORE_ERROR || error?.name === INVALID_PASSWORD_ERROR) {
        setPasswordError(
          error?.name === NO_KEYSTORE_ERROR ? t('send.noPrivateKey') : t('home.passwordIncorrect'),
        );
        setPassword('');
        return;
      }

      setSnackbarMessage(t('send.sendFailed', { error: error.message }));
      setSnackbarVisible(true);
      setPassword('');
    }
  };

  const feeDisplay = feeLoading
    ? t('send.feeEstimating')
    : feeError || !feeEstimate
      ? t('send.feeEstimateFailed')
      : t('send.feeEstimateValue', { fee: feeEstimate });

  const balanceDisplay = feeLoading
    ? t('send.feeEstimating')
    : balanceEth
      ? t('send.balanceValue', { balance: balanceEth })
      : '—';

  const balanceUsdText = ethToUsdDisplay(balanceEth, ethUsdPrice);
  const feeUsdText = feeEstimate ? ethToUsdDisplay(feeEstimate, ethUsdPrice) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={[scrollFill, styles.container]}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ListColumn>
        <Text
          variant="labelLarge"
          style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
        >
          {t('send.contentTitle')}
        </Text>
        <TextInput
          mode="outlined"
          placeholder={t('send.inputPlaceholder')}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={6}
          blurOnSubmit={false}
          scrollEnabled={true}
          style={styles.textArea}
          contentStyle={[styles.textAreaContent, { color: theme.colors.onSurface }]}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        <HelperText type="info" visible style={[styles.counter, { fontSize: Math.round(12 * fontScale) }]}>
          {t('send.charCount', { count: text.length })}
        </HelperText>

        {images.map((img, index) => (
          <Card
            key={index}
            mode="elevated"
            style={[styles.imageListItem, { backgroundColor: theme.colors.surface }]}
          >
            <View style={styles.imageCardContent}>
              <PlatformImage
                uri={img.uri}
                mimeType={img.type}
                style={styles.thumbnail}
                resizeMode="contain"
              />
              <View style={styles.imageInfo}>
                <Text variant="bodySmall" numberOfLines={2}>
                  {img.name
                    ? img.name
                    : `${t('send.imageDigest')}: ${img.base64.substring(0, 20)}...`}
                </Text>
              </View>
              <IconButton icon="close" size={20} onPress={() => removeImage(index)} />
            </View>
          </Card>
        ))}

        <Button
          mode="outlined"
          icon="image-plus"
          onPress={() => setImageSourceDialogVisible(true)}
          style={styles.addImageButton}
        >
          {t('send.addImage')}
        </Button>
        <HelperText type="info" visible>
          {t('send.addImageHint')}
        </HelperText>

        {attachments.map((att, index) => (
          <Card
            key={`att-${index}`}
            mode="elevated"
            style={[styles.imageListItem, { backgroundColor: theme.colors.surface }]}
          >
            <View style={styles.imageCardContent}>
              <View style={styles.imageInfo}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {att.label} · {t(`send.attachmentType.${att.fileType}`)}
                </Text>
                <Text variant="bodySmall" numberOfLines={2} style={{ marginTop: 2 }}>
                  {wrapLongHex(att.href)}
                </Text>
              </View>
              <IconButton icon="close" size={20} onPress={() => removeAttachment(index)} />
            </View>
          </Card>
        ))}

        <Button
          mode="outlined"
          icon="paperclip"
          onPress={() => setAttachmentDialogVisible(true)}
          style={styles.addImageButton}
        >
          {t('send.addAttachment')}
        </Button>
        <HelperText type="info" visible>
          {t('send.addAttachmentHint')}
        </HelperText>

        <Text
          variant="labelLarge"
          style={[styles.fieldLabel, styles.sectionLabel, { color: theme.colors.onSurface }]}
        >
          {t('send.confirmRecipient')}
        </Text>
        <TextInput
          mode="outlined"
          placeholder={t('send.recipientPlaceholder')}
          value={recipientAddress}
          onChangeText={setRecipientAddress}
          multiline
          numberOfLines={2}
          scrollEnabled={false}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          style={styles.input}
          contentStyle={styles.addressContent}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        <View style={styles.shortcutRow}>
          <Button
            mode={isBlackHoleRecipient ? 'contained' : 'outlined'}
            compact
            onPress={() => setRecipientAddress(BLACK_HOLE)}
            buttonColor={isBlackHoleRecipient ? theme.colors.primary : undefined}
            textColor={isBlackHoleRecipient ? '#FFFFFF' : undefined}
            style={styles.shortcutButton}
            labelStyle={[styles.shortcutLabel, { fontSize: Math.round(12 * fontScale) }]}
          >
            {t('send.recipientBlackHole')}
          </Button>
          {profile?.address && (
            <Button
              mode={isSelf ? 'contained' : 'outlined'}
              compact
              onPress={() => setRecipientAddress(profile.address)}
              buttonColor={isSelf ? theme.colors.primary : undefined}
              textColor={isSelf ? '#FFFFFF' : undefined}
              style={styles.shortcutButton}
              labelStyle={[styles.shortcutLabel, { fontSize: Math.round(12 * fontScale) }]}
            >
              {t('send.recipientSelf')}
            </Button>
          )}
          <Button
            mode={isFollowingRecipient ? 'contained' : 'outlined'}
            compact
            onPress={openFollowList}
            buttonColor={isFollowingRecipient ? theme.colors.primary : undefined}
            textColor={isFollowingRecipient ? '#FFFFFF' : undefined}
            style={styles.shortcutButton}
            labelStyle={[styles.shortcutLabel, { fontSize: Math.round(12 * fontScale) }]}
          >
            {t('send.recipientFollowing')}
          </Button>
          <Button
            mode="outlined"
            compact
            onPress={handleRandomAddress}
            style={styles.shortcutButton}
            labelStyle={[styles.shortcutLabel, { fontSize: Math.round(12 * fontScale) }]}
          >
            {t('send.recipientRandom')}
          </Button>
        </View>

        {isSelf && (
          <HelperText type="info" visible style={{ marginTop: 4, paddingHorizontal: 0 }}>
            {t('send.selfNoteHint')}
          </HelperText>
        )}

        {canChooseEncrypt && (
          <View style={styles.encryptSection}>
            <Text
              variant="labelLarge"
              style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
            >
              {t('send.encryptOption')}
            </Text>
            <RadioButton.Group
              onValueChange={(value) => handleEncryptChange(value === 'yes')}
              value={encryptEnabled ? 'yes' : 'no'}
            >
              <RadioButton.Item
                label={t('send.encryptNo')}
                value="no"
                style={styles.radioItem}
                labelStyle={[styles.radioLabel, { fontSize: Math.round(14 * fontScale) }]}
              />
              <RadioButton.Item
                label={t('send.encryptYes')}
                value="yes"
                style={styles.radioItem}
                labelStyle={[styles.radioLabel, { fontSize: Math.round(14 * fontScale) }]}
              />
            </RadioButton.Group>
          </View>
        )}

        <View style={styles.buttonGroup}>
          <View>
            <HelperText type="info" visible style={styles.payloadHintText}>
              {t('send.payloadSizeHint')}
            </HelperText>
            <View style={styles.secondaryActionsRow}>
              <Button
                mode="outlined"
                compact
                onPress={() => setHexSendVisible(true)}
                style={[styles.hexSendButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}
                labelStyle={[styles.hexSendBtnLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                {t('send.hexSendButton')}
              </Button>
              <Button
                mode="outlined"
                compact
                onPress={openEthSendModal}
                style={[styles.hexSendButton, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}
                labelStyle={[styles.hexSendBtnLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                {t('send.ethSendButton')}
              </Button>
            </View>
          </View>
          <Button
            mode="contained"
            onPress={handleSend}
            disabled={pubkeyLookupVisible}
            loading={pubkeyLookupVisible}
            style={styles.button}
            buttonColor={theme.colors.primary}
            contentStyle={styles.buttonContent}
          >
            {t('send.sendButton')}
          </Button>
          <Button
            mode="outlined"
            onPress={handleCancel}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            {t('common.cancel')}
          </Button>
        </View>
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={imageSourceDialogVisible}
        onDismiss={() => setImageSourceDialogVisible(false)}
        title={t('send.pickImageSourceTitle')}
      >
        <Button
          mode="outlined"
          icon="image"
          onPress={() => {
            void pickImageFromSource('library');
          }}
          style={styles.sourceButton}
        >
          {t('send.pickImageFromLibrary')}
        </Button>
        <Button
          mode="outlined"
          icon="folder-open-outline"
          onPress={() => {
            void pickImageFromSource('files');
          }}
          style={styles.sourceButton}
        >
          {t('send.pickImageFromFiles')}
        </Button>
      </AppModal>

      <AddAttachmentModal
        visible={attachmentDialogVisible}
        onDismiss={() => setAttachmentDialogVisible(false)}
        onConfirm={(attachment) => {
          setAttachments((prev) => [...prev, attachment]);
          setAttachmentDialogVisible(false);
        }}
      />

      <AppModal
        visible={imageNameDialogVisible}
        onDismiss={() => setImageNameDialogVisible(false)}
        title={t('send.imageNameDialogTitle')}
        actions={[
          { label: t('send.imageNameDialogNo'), onPress: () => handleImageNameConfirm(false) },
          { label: t('send.imageNameDialogYes'), onPress: () => handleImageNameConfirm(true) },
        ]}
      >
        <Text>{t('send.imageNameDialogMsg')}</Text>
        {currentPickingImage?.name && (
          <Text style={{ marginTop: 8, fontWeight: 'bold' }}>{currentPickingImage.name}</Text>
        )}
      </AppModal>

      <AppModal
        visible={confirmSendVisible}
        onDismiss={closeConfirmDialog}
        title={t('send.confirmTxTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: closeConfirmDialog },
          {
            label: t('wallet.verifyButtonConfirm'),
            onPress: startPasswordInput,
            disabled: !canConfirmSend,
          },
        ]}
      >
        <View style={styles.confirmRow}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmRecipient')}</Text>
          <Text style={[styles.confirmValue, styles.addressText, { fontSize: Math.round(14 * fontScale) }]} selectable>
            {wrapLongHex(recipientAddress.trim() || BLACK_HOLE)}
          </Text>
        </View>

        <View style={styles.confirmRow}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmMode')}</Text>
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>{sendModeLabel}</Text>
        </View>

        <View style={styles.confirmRow}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmData')}</Text>
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>{dataSummary}</Text>
        </View>

        <View style={styles.confirmRow}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmBalance')}</Text>
          <View style={styles.feeRow}>
            {feeLoading && (
              <ActivityIndicator size="small" style={styles.feeSpinner} />
            )}
            <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>{balanceDisplay}</Text>
          </View>
          {balanceUsdText && (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), marginTop: 2 }}>
              {t('send.balanceUsdValue', { usd: balanceUsdText })}
            </Text>
          )}
        </View>

        <View style={styles.confirmRow}>
          <View style={styles.confirmLabelRow}>
            <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmFee')}</Text>
            {!feeLoading && !feeError && (
              <Button
                mode="text"
                compact
                onPress={openFeeAdjustment}
                labelStyle={{ fontSize: Math.round(12 * fontScale) }}
              >
                {t('send.feeSettings')}
              </Button>
            )}
          </View>
          <View style={styles.feeRow}>
            {feeLoading && (
              <ActivityIndicator size="small" style={styles.feeSpinner} />
            )}
            <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>{feeDisplay}</Text>
          </View>
          {feeUsdText && (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), marginTop: 2 }}>
              {t('send.feeUsdValue', { usd: feeUsdText })}
            </Text>
          )}
        </View>

        {insufficientBalance && (
          <Text style={[styles.confirmWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
            {t('send.insufficientBalance')}
          </Text>
        )}

        {feeError && !feeLoading && (
          <>
            <Text style={[styles.confirmWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
              {t('send.feeEstimateFailedHint')}
            </Text>
            <Button
              mode="outlined"
              compact
              onPress={retryFeeEstimate}
              style={styles.feeRetryButton}
            >
              {t('send.feeRetry')}
            </Button>
          </>
        )}

        <Text style={[styles.feeDisclaimer, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
          {t('send.feeDisclaimer')}
        </Text>

        <Text style={[styles.feeDisclaimer, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
          {t('send.submitNotMinedDisclaimer')}
        </Text>

        <Text style={[styles.safetyTip, { color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), lineHeight: Math.round(17 * fontScale) }]}>
          {t('send.safetyTipMsg')}
        </Text>
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
        title={t('send.passwordTitle')}
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
            onPress: passwordAction === 'hexSend' ? executeHexSend : executeSend,
            loading,
            disabled: loading || passwordLocked,
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
          disabled={loading || passwordLocked}
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

      <AppModal
        visible={cancelConfirmVisible}
        onDismiss={() => {
          if (!draftSaving) setCancelConfirmVisible(false);
        }}
        dismissable={!draftSaving}
        title={t('send.confirmCancelTitle')}
        actions={[
          {
            label: t('send.saveAsDraft'),
            onPress: saveAsDraft,
            mode: 'contained',
            loading: draftSaving,
            disabled: draftSaving,
          },
          {
            label: t('send.discardChanges'),
            onPress: confirmCancel,
            mode: 'outlined',
            disabled: draftSaving,
          },
          {
            label: t('send.continueEdit'),
            onPress: () => setCancelConfirmVisible(false),
            mode: 'text',
            disabled: draftSaving,
          },
        ]}
      >
        <Text>{t('send.confirmCancelMsg')}</Text>
      </AppModal>

      <AppModal
        visible={pubkeyLookupVisible}
        dismissable={false}
        title={t('send.pubkeyLookupTitle')}
      >
        <View style={styles.lookupRow}>
          <ActivityIndicator size="small" style={styles.feeSpinner} />
          <Text>{t('send.pubkeyLookupMsg')}</Text>
        </View>
      </AppModal>

      <AppModal
        visible={noPubkeyDialogVisible}
        dismissable={false}
        title={t('send.noPubkeyTitle')}
        scrollable
        actions={[
          { label: t('send.noPubkeyNone'), onPress: handleNoPublicKey },
          { label: t('send.noPubkeyConfirm'), onPress: handleManualPubkeyConfirm },
        ]}
      >
        <Text style={[styles.dialogBody, { fontSize: Math.round(14 * fontScale), lineHeight: Math.round(20 * fontScale) }]}>
          {noPubkeyReason === 'no-history'
            ? t('send.noPubkeyMsg')
            : t('send.noPubkeyRecoverFailed')}
        </Text>
        <Text style={[styles.dialogHint, { color: theme.colors.onSurfaceVariant, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
          {t('send.noPubkeyManualHint')}
        </Text>
        <TextInput
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
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        {!!manualPubkeyError && (
          <Text style={[styles.dialogError, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
            {manualPubkeyError}
          </Text>
        )}
      </AppModal>

      <AppModal
        visible={encryptUnavailableVisible}
        onDismiss={disableEncryptionAndReturn}
        title={t('send.encryptUnavailableTitle')}
        actions={[{ label: t('common.back'), onPress: disableEncryptionAndReturn }]}
      >
        <Text>{t('send.encryptUnavailableMsg')}</Text>
      </AppModal>

      <AppModal
        visible={feeAdjustmentVisible}
        onDismiss={() => setFeeAdjustmentVisible(false)}
        title={t('send.feeAdjustmentTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: () => setFeeAdjustmentVisible(false) },
          { label: t('common.ok'), onPress: handleApplyCustomFee },
        ]}
      >
        <View style={styles.feeLevelGroup}>
          <Button
            mode={feeOption?.level === 'slow' ? 'contained' : 'outlined'}
            onPress={() => handleSelectFeeLevel('slow')}
            style={styles.feeLevelButton}
          >
            {t('send.feeLevelSlow')}
          </Button>
          <Button
            mode={feeOption?.level === 'normal' ? 'contained' : 'outlined'}
            onPress={() => handleSelectFeeLevel('normal')}
            style={styles.feeLevelButton}
          >
            {t('send.feeLevelNormal')}
          </Button>
          <Button
            mode={feeOption?.level === 'fast' ? 'contained' : 'outlined'}
            onPress={() => handleSelectFeeLevel('fast')}
            style={styles.feeLevelButton}
          >
            {t('send.feeLevelFast')}
          </Button>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('send.feeLevelCustom')}</Text>
        <TextInput
          mode="outlined"
          label={t('send.maxFeePerGas')}
          keyboardType="numeric"
          value={customMaxFee}
          onChangeText={setCustomMaxFee}
          style={styles.feeInput}
        />
        <TextInput
          mode="outlined"
          label={t('send.maxPriorityFeePerGas')}
          keyboardType="numeric"
          value={customMaxPriority}
          onChangeText={setCustomMaxPriority}
          style={styles.feeInput}
        />
      </AppModal>

      <AppModal
        visible={sendSuccessVisible}
        onDismiss={() => {
          setSendSuccessVisible(false);
          navigation.goBack();
        }}
        title={t('send.sendSuccess')}
        actions={[
          {
            label: t('common.copy'),
            onPress: async () => {
              await Clipboard.setStringAsync(sendSuccessHash);
              setSnackbarMessage(t('common.copied'));
              setSnackbarVisible(true);
            },
          },
          {
            label: t('common.ok'),
            onPress: () => {
              setSendSuccessVisible(false);
              navigation.goBack();
            },
          },
        ]}
      >
        <Text variant="bodyMedium" style={styles.dialogBody} selectable>
          {t('send.txHash', { hash: sendSuccessHash })}
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.dialogHint, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('send.submitNotMinedHint')}
        </Text>
      </AppModal>

      <AppModal
        visible={hexSendVisible}
        onDismiss={() => setHexSendVisible(false)}
        title={t('send.hexSendTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: () => setHexSendVisible(false) },
          { label: t('send.sendButton'), onPress: startHexPasswordInput },
        ]}
      >
        <TextInput
          mode="outlined"
          placeholder={t('send.hexSendPlaceholder')}
          value={hexData}
          onChangeText={setHexData}
          multiline
          numberOfLines={4}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.hexInput}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        <HelperText type="info" visible style={styles.hexHint}>
          {t('send.hexSendHint')}
        </HelperText>
      </AppModal>

      <AppModal
        visible={ethSendVisible}
        onDismiss={() => setEthSendVisible(false)}
        title={t('send.ethSendTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: () => setEthSendVisible(false) },
          {
            label: t('common.ok'),
            onPress: startEthSendConfirm,
            disabled: ethBalanceLoading || !ethBalance,
          },
        ]}
      >
        <View style={{ marginBottom: 16 }}>
          <Text variant="labelLarge" style={styles.fieldLabel}>
            {t('send.ethSendBalance')}
          </Text>
          {ethBalanceLoading ? (
            <ActivityIndicator size="small" style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Text variant="bodyLarge">
              {ethBalance ? formatEther(ethBalance) : '0'} ETH
            </Text>
          )}
        </View>

        <TextInput
          mode="outlined"
          label={t('send.ethSendAmount')}
          placeholder="0.0"
          keyboardType="numeric"
          value={ethAmount}
          onChangeText={(val) => {
            setEthAmount(val);
            try {
              if (val) parseEther(val);
              setEthAmountError(false);
            } catch {
              setEthAmountError(true);
            }
          }}
          disabled={ethBalanceLoading || !ethBalance}
          error={ethAmountError}
          style={{ marginBottom: 8 }}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        {ethAmountError && (
          <HelperText type="error" visible>
            {t('send.invalidFeeInput')}
          </HelperText>
        )}

        {ethValueToSend > 0n && (
          <HelperText type="info" visible style={{ color: theme.colors.error, paddingHorizontal: 0 }}>
            {t('send.ethSendDisclaimer')}
          </HelperText>
        )}
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
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  fieldLabel: {
    marginBottom: 6,
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: 16,
  },
  input: {
    marginBottom: 0,
  },
  textArea: {
    minHeight: 210,
  },
  textAreaContent: {
    minHeight: 180,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  addressContent: {
    minHeight: 48,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  counter: {
    textAlign: 'right',
    fontSize: 12,
  },
  addImageButton: {
    marginTop: 4,
    borderRadius: 8,
  },
  sourceButton: {
    marginTop: 8,
    borderRadius: 8,
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
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  shortcutButton: {
    marginRight: 8,
    marginTop: 4,
    borderRadius: 8,
  },
  shortcutLabel: {
    fontSize: 12,
  },
  encryptSection: {
    marginTop: 16,
  },
  radioItem: {
    paddingLeft: 0,
    paddingVertical: 0,
  },
  radioLabel: {
    fontSize: 14,
  },
  buttonGroup: {
    marginTop: 32,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 4,
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
    marginBottom: 4,
  },
  dialogError: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
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
  confirmLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  confirmValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  addressText: {
    width: '100%',
    flexShrink: 1,
    fontFamily: 'monospace',
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feeSpinner: {
    marginRight: 8,
  },
  feeLevelGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  feeLevelButton: {
    flex: 1,
  },
  feeInput: {
    marginBottom: 12,
  },
  confirmWarning: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  feeRetryButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
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
  payloadHintText: {
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  hexSendButton: {
    marginTop: 0,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 0,
    marginRight: 8,
  },
  hexSendBtnLabel: {
    fontSize: 10,
    marginVertical: 2,
    marginHorizontal: 8,
  },
  hexInput: {
    marginTop: 8,
    minHeight: 100,
  },
  hexHint: {
    paddingHorizontal: 0,
    marginTop: 8,
  },
});
