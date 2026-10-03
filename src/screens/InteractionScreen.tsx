import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  TextInput,
  HelperText,
  ActivityIndicator,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { parseUnits, parseEther, formatUnits, formatEther } from 'ethers';
import { AppModal } from '../components/AppModal';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { useOutlineFrameStyle } from '../theme/surfaces';
import type { RootStackParamList } from '../types';
import {
  estimateSendFeeFromAddress,
  getFeeSuggestions,
  feeSuggestionsFromOption,
  FeeOption,
  FeeSuggestions,
  OAMPClient,
} from '../oamp/client';
import { BLACK_HOLE } from '../oamp/protocol';

import { fetchEthUsdPrice, ethToUsdDisplay } from '../rpc/ethPrice';
import { withRpcFallback, AllRpcFailedError, isFeeTooLowError } from '../rpc/rpcClient';
import {
  unlockSession,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
} from '../wallet/session';
import { usePasswordLockRemaining } from '../wallet/WalletSessionContext';
import { showAlert } from '../utils/alert';
import type { ContentItem } from '../mypayload';
import {
  buildInteractionContent,
  canInteractWith,
  InteractionType,
  interactionEmoji,
  interactionPreviewText,
} from '../utils/interactionContent';

type Step = 'compose' | 'fee' | 'password' | 'success';

type LikeMultiplier = 1 | 2 | 3 | 5 | 10;

const LIKE_MULTIPLIERS: LikeMultiplier[] = [1, 2, 3, 5, 10];

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Interaction'>;
type RouteProps = RouteProp<RootStackParamList, 'Interaction'>;

function wrapLongHex(value: string): string {
  return value.replace(/(.{8})/g, '$1\u200b');
}

/** 点赞小费展示/发送金额：下方 Approx 手续费 × 倍数（与 feeEstimate 同为 formatEther 风格）。 */
function tipFromFeeEstimate(feeEstimate: string, multiplier: number): string {
  if (multiplier === 1) return feeEstimate;
  return formatEther(parseEther(feeEstimate) * BigInt(multiplier));
}

export default function InteractionScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const item = route.params.item;
  const frameStyle = useOutlineFrameStyle();
  const { t } = useTranslation();
  const { fontScale } = useThemePreference();
  const { state } = useAppContext();
  const profile = state.profile;

  const [step, setStep] = useState<Step>('compose');
  // Paper Modal 关闭时会先淡出；淡出期间沿用上一步的内容，避免弹窗中途变形（闪屏）
  const lastDialogStepRef = useRef<Exclude<Step, 'compose'>>('password');
  if (step !== 'compose') lastDialogStepRef.current = step;
  const renderDialogStep = step === 'compose' ? lastDialogStepRef.current : step;

  const [action, setAction] = useState<InteractionType>('like');
  const [multiplier, setMultiplier] = useState<LikeMultiplier>(1);
  const [commentText, setCommentText] = useState('');

  const [feeEstimate, setFeeEstimate] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState(false);
  const [balanceEth, setBalanceEth] = useState<string | null>(null);
  const [insufficientBalance, setInsufficientBalance] = useState(false);
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);

  const [feeOption, setFeeOption] = useState<FeeOption | null>(null);
  const [feeSuggestions, setFeeSuggestions] = useState<FeeSuggestions | null>(null);
  const [customMaxFee, setCustomMaxFee] = useState('');
  const [customMaxPriority, setCustomMaxPriority] = useState('');
  const feeGasLimitRef = useRef<bigint | null>(null);
  const balanceWeiRef = useRef<bigint | null>(null);
  const feeOptionRef = useRef<FeeOption | null>(null);
  const feeUserTouchedRef = useRef(false);
  const estimateFeeRef = useRef<(manual?: FeeOption | null) => Promise<void>>(async () => {});

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState('');
  const passwordLockRemainingMs = usePasswordLockRemaining(step === 'password');
  const passwordLocked = passwordLockRemainingMs > 0;

  const authorAddress = useMemo(
    () => (item?.from || item?.address || '').trim(),
    [item?.from, item?.address],
  );

  const recipientAddress = useMemo(() => {
    if (action === 'like') {
      return authorAddress || BLACK_HOLE;
    }
    return BLACK_HOLE;
  }, [action, authorAddress]);

  // 展示：永远跟下方 Approx 手续费走，只乘倍数。
  const ethValueDisplay = useMemo(() => {
    if (action !== 'like' || !feeEstimate) return null;
    try {
      return tipFromFeeEstimate(feeEstimate, multiplier);
    } catch {
      return null;
    }
  }, [action, feeEstimate, multiplier]);

  // 实际上链附带的 ETH：点赞 = Approx × 倍数（自己赞自己也一样，小费回到自己地址）。
  const ethValueToSend = useMemo(() => {
    if (action !== 'like' || !feeEstimate) return 0n;
    try {
      return parseEther(feeEstimate) * BigInt(multiplier);
    } catch {
      return 0n;
    }
  }, [action, feeEstimate, multiplier]);

  // 上链内容不含小费金额（金额是交易本身的 value），估费与发送共用同一份。
  const contentItems = useMemo<ContentItem[]>(() => {
    return buildInteractionContent({ type: action, item, commentText });
  }, [action, item, commentText]);

  const composeContent = useMemo(() => interactionPreviewText(contentItems), [contentItems]);

  const canConfirmSend = useMemo(() => {
    if (feeLoading || feeError || !feeEstimate || insufficientBalance) return false;
    if (!canInteractWith(item)) return false;
    if (action === 'comment' && !commentText.trim()) return false;
    return true;
  }, [feeLoading, feeError, feeEstimate, insufficientBalance, action, commentText, item]);

  const syncCustomFeeInputsFromOption = useCallback((option: FeeOption) => {
    setCustomMaxFee(formatUnits(option.maxFeePerGas || option.gasPrice || 0n, 'gwei'));
    setCustomMaxPriority(formatUnits(option.maxPriorityFeePerGas || 0n, 'gwei'));
  }, []);

  const syncInsufficientBalance = useCallback((feeWeiValue: bigint, tipWei: bigint) => {
    const cachedBalance = balanceWeiRef.current;
    if (cachedBalance != null) {
      setInsufficientBalance(cachedBalance < feeWeiValue + tipWei);
    }
  }, []);

  const applyFeeOptionLocally = useCallback((option: FeeOption, tipWei = 0n): boolean => {
    const gasLimit = feeGasLimitRef.current;
    const maxFee = option.maxFeePerGas ?? option.gasPrice ?? 0n;
    if (gasLimit == null || maxFee === 0n) return false;
    const nextFeeWei = gasLimit * maxFee;
    feeOptionRef.current = option;
    setFeeOption(option);
    setFeeEstimate(formatEther(nextFeeWei));
    syncInsufficientBalance(nextFeeWei, tipWei);
    return true;
  }, [syncInsufficientBalance]);

  const estimateFee = useCallback(async (manualFeeOption?: FeeOption | null) => {
    if (!profile?.address || !item) return;
    setFeeLoading(true);
    setFeeError(false);
    setBalanceEth(null);
    setInsufficientBalance(false);
    try {
      const target = recipientAddress.trim() || BLACK_HOLE;
      const currentFeeOption = manualFeeOption !== undefined ? manualFeeOption : feeOptionRef.current;
      // 关键费估算始终 value=0：点赞小费 = 本结果 × 倍数，绝不能反哺进估算，否则会循环/归零。
      const [{ feeEth, gasLimit, usedFeeOption }, balanceWei, price] = await Promise.all([
        estimateSendFeeFromAddress(
          profile.address,
          target,
          contentItems,
          false,
          {
            encrypt: false,
            feeOption: currentFeeOption || undefined,
            value: 0n,
          },
        ),
        withRpcFallback((provider) => provider.getBalance(profile.address)),
        fetchEthUsdPrice(),
      ]);
      feeGasLimitRef.current = gasLimit;
      balanceWeiRef.current = balanceWei;
      setBalanceEth(formatEther(balanceWei));
      if (!feeOptionRef.current) {
        feeOptionRef.current = usedFeeOption;
        setFeeOption(usedFeeOption);
        setFeeSuggestions((prev) => prev ?? feeSuggestionsFromOption(usedFeeOption));
        if (!feeUserTouchedRef.current) {
          syncCustomFeeInputsFromOption(usedFeeOption);
        }
      }

      const tipWei =
        action === 'like'
          ? parseEther(feeEth) * BigInt(multiplier)
          : 0n;
      const optionToApply = currentFeeOption || feeOptionRef.current;
      if (!optionToApply || !applyFeeOptionLocally(optionToApply, tipWei)) {
        setFeeEstimate(feeEth);
        setInsufficientBalance(balanceWei < parseEther(feeEth) + tipWei);
      }
      if (price != null) setEthUsdPrice(price);
    } catch (error) {
      console.error('Interaction fee estimate error:', error);
      setFeeError(true);
      setFeeEstimate(null);
      feeGasLimitRef.current = null;
    } finally {
      setFeeLoading(false);
    }
  }, [
    profile?.address,
    item,
    recipientAddress,
    contentItems,
    action,
    multiplier,
    applyFeeOptionLocally,
    syncCustomFeeInputsFromOption,
  ]);

  estimateFeeRef.current = estimateFee;

  const loadFeeSuggestions = useCallback(async () => {
    try {
      const suggestions = await getFeeSuggestions();
      setFeeSuggestions(suggestions);
      const current = feeOptionRef.current;
      const canReplace =
        !current ||
        (!feeUserTouchedRef.current &&
          current.level === 'normal' &&
          (current.maxPriorityFeePerGas ?? 0n) === 0n);
      if (canReplace) {
        feeOptionRef.current = suggestions.normal;
        setFeeOption(suggestions.normal);
        if (step !== 'fee') {
          syncCustomFeeInputsFromOption(suggestions.normal);
        }
        // gasLimit 尚未就绪时这里会失败，等 estimateFee 完成后再写 feeEstimate
        applyFeeOptionLocally(suggestions.normal, ethValueToSend);
      }
    } catch (err) {
      console.warn('Failed to load fee suggestions', err);
    }
  }, [applyFeeOptionLocally, syncCustomFeeInputsFromOption, step, ethValueToSend]);

  useEffect(() => {
    void loadFeeSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅页面打开时初始化
  }, []);

  // 仅在影响 calldata / 收款方的输入变化时重估。
  useEffect(() => {
    const timer = setTimeout(() => {
      void estimateFeeRef.current(feeOptionRef.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [item.id, action, commentText, recipientAddress, multiplier, contentItems]);

  // 倍数变化时只重算余额是否够（小费变了），不必等下一次网络估费。
  useEffect(() => {
    if (!feeEstimate || balanceWeiRef.current == null) return;
    try {
      const feeWeiValue = parseEther(feeEstimate);
      const tipWei = action === 'like' ? feeWeiValue * BigInt(multiplier) : 0n;
      setInsufficientBalance(balanceWeiRef.current < feeWeiValue + tipWei);
    } catch {
      // ignore
    }
  }, [feeEstimate, multiplier, action]);

  const handleSelectFeeLevel = useCallback((level: 'slow' | 'normal' | 'fast') => {
    const base = feeOptionRef.current ?? feeOption;
    const suggestions = feeSuggestions ?? (base ? feeSuggestionsFromOption(base) : null);
    if (!suggestions) return;
    feeUserTouchedRef.current = true;
    const selected = suggestions[level];
    syncCustomFeeInputsFromOption(selected);
    if (!applyFeeOptionLocally(selected, ethValueToSend)) {
      feeOptionRef.current = selected;
      setFeeOption(selected);
      void estimateFee(selected);
    }
  }, [feeOption, feeSuggestions, applyFeeOptionLocally, syncCustomFeeInputsFromOption, estimateFee, ethValueToSend]);

  const handleApplyCustomFee = useCallback(() => {
    try {
      const maxFee = parseUnits(customMaxFee, 'gwei');
      const maxPriority = parseUnits(customMaxPriority, 'gwei');
      const selected: FeeOption = {
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPriority,
        level: 'custom',
      };
      feeUserTouchedRef.current = true;
      if (!applyFeeOptionLocally(selected, ethValueToSend)) {
        feeOptionRef.current = selected;
        setFeeOption(selected);
        void estimateFee(selected);
      }
      setStep('compose');
    } catch {
      showAlert(t('common.error'), t('send.invalidFeeInput'));
    }
  }, [customMaxFee, customMaxPriority, applyFeeOptionLocally, estimateFee, t, ethValueToSend]);

  const openFeeAdjustment = useCallback(() => {
    const current = feeOptionRef.current ?? feeOption ?? feeSuggestions?.normal ?? null;
    if (current) {
      syncCustomFeeInputsFromOption(current);
    }
    setStep('fee');
  }, [feeOption, feeSuggestions, syncCustomFeeInputsFromOption]);

  const retryFeeEstimate = useCallback(() => {
    void estimateFee(feeOptionRef.current);
  }, [estimateFee]);

  const handleConfirm = useCallback(() => {
    if (!canConfirmSend) return;
    setPasswordError(null);
    setStep('password');
  }, [canConfirmSend]);

  const handleSend = useCallback(async () => {
    if (passwordLocked) return;
    if (!password) {
      setPasswordError(t('send.passwordLabel'));
      return;
    }
    if (!item || !profile?.address) return;

    setLoading(true);
    setPasswordError(null);
    try {
      const wallet = await unlockSession(password);
      const client = new OAMPClient(wallet.privateKey);
      const items = contentItems;
      let hash = '';

      if (action === 'like') {
        hash = await client.sendUnencryptedMessage(recipientAddress, items, feeOption || undefined, ethValueToSend);
      } else {
        hash = await client.sendBroadcast(items, feeOption || undefined, 0n);
      }

      setLoading(false);
      setTxHash(hash);
      setPassword('');
      setStep('success');
    } catch (error: any) {
      console.error('Interaction send error:', error);
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
      if (isFeeTooLowError(error)) {
        showAlert(t('send.feeTooLowTitle'), t('send.feeTooLowMsg'), [
          {
            text: t('common.ok'),
            onPress: () => {
              setPassword('');
              setStep('compose');
            },
          },
        ]);
        return;
      }
      if (error instanceof AllRpcFailedError || error?.name === 'AllRpcFailedError') {
        showAlert(t('send.networkFaultTitle'), t('send.networkFaultMsg'), [
          {
            text: t('common.ok'),
            onPress: () => {
              setPassword('');
              setStep('compose');
            },
          },
        ]);
        return;
      }
      showAlert(t('common.error'), t('send.sendFailed', { error: error.message }), [
        {
          text: t('common.ok'),
          onPress: () => {
            setPassword('');
            setStep('compose');
          },
        },
      ]);
    }
  }, [
    action,
    contentItems,
    ethValueToSend,
    feeOption,
    item,
    password,
    passwordLocked,
    profile?.address,
    recipientAddress,
    t,
  ]);

  const leavePage = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // 弹窗（费用 / 密码 / 成功）的关闭：回到页面；成功后离开页面。
  const handleDialogDismiss = useCallback(() => {
    if (loading) return;
    if (step === 'success') {
      leavePage();
      return;
    }
    if (step === 'password') {
      setPassword('');
      setPasswordError(null);
    }
    setStep('compose');
  }, [loading, leavePage, step]);

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
  const tipUsdText = ethToUsdDisplay(ethValueDisplay, ethUsdPrice);

  const renderActionButton = (type: InteractionType, label: string) => {
    const selected = action === type;
    return (
      <Button
        key={type}
        mode={selected ? 'contained' : 'outlined'}
        compact
        onPress={() => {
          setAction(type);
          // 切回点赞时默认倍数 1
          if (type === 'like') setMultiplier(1);
        }}
        buttonColor={selected ? theme.colors.primary : undefined}
        textColor={selected ? '#FFFFFF' : undefined}
        style={styles.actionButton}
        labelStyle={[styles.actionButtonLabel, { fontSize: Math.round(12 * fontScale) }]}
      >
        {`${interactionEmoji(type)} ${label}`}
      </Button>
    );
  };

  const renderComposeContent = () => (
    <>
      <View style={styles.actionRow}>
        {renderActionButton('like', t('interaction.like'))}
        {renderActionButton('comment', t('interaction.comment'))}
        {renderActionButton('repost', t('interaction.repost'))}
      </View>

      {action === 'like' && (
        <View style={[frameStyle, styles.sectionFrame]}>
          <Text style={[styles.sectionLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('interaction.likeAmount')}
          </Text>
          <View style={styles.amountBlock}>
            {feeLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={[styles.amountValue, { fontSize: Math.round(16 * fontScale) }]}>
                {ethValueDisplay ? `${ethValueDisplay} ETH` : '—'}
              </Text>
            )}
            {tipUsdText && (
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), marginTop: 2 }}>
                {t('send.feeUsdValue', { usd: tipUsdText })}
              </Text>
            )}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 12, fontSize: Math.round(13 * fontScale) }]}>
            {t('interaction.likeMultiplier')}
          </Text>
          <View style={styles.multiplierRow}>
            {LIKE_MULTIPLIERS.map((m) => (
              <Button
                key={m}
                mode={multiplier === m ? 'contained' : 'outlined'}
                compact
                onPress={() => setMultiplier(m)}
                buttonColor={multiplier === m ? theme.colors.primary : undefined}
                textColor={multiplier === m ? '#FFFFFF' : undefined}
                style={styles.multiplierButton}
                labelStyle={[styles.multiplierButtonLabel, { fontSize: Math.round(12 * fontScale) }]}
              >
                {`${m}×`}
              </Button>
            ))}
          </View>
          <Text style={[styles.hintText, { color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale) }]}>
            {t('interaction.likeMultiplierHint')}
          </Text>
        </View>
      )}

      {action === 'comment' && (
        <View style={[frameStyle, styles.sectionFrame]}>
          <Text style={[styles.sectionLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('interaction.commentInputLabel')}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={t('interaction.commentInputPlaceholder')}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            numberOfLines={4}
            style={styles.commentInput}
            contentStyle={{ textAlignVertical: 'top', paddingTop: 8 }}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <HelperText type="info" visible style={{ fontSize: Math.round(12 * fontScale) }}>
            {t('send.charCount', { count: commentText.length })}
          </HelperText>
        </View>
      )}

      {(action === 'like' || action === 'repost') && (
        <View style={[frameStyle, styles.sectionFrame]}>
          <Text style={[styles.sectionLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('interaction.onChainPreview')}
          </Text>
          <TextInput
            mode="outlined"
            value={composeContent}
            editable={false}
            multiline
            numberOfLines={3}
            style={[styles.previewInput, styles.compactPreviewInput]}
            contentStyle={{ textAlignVertical: 'top', paddingTop: 8, color: theme.colors.onSurface }}
            outlineColor={theme.colors.outline}
          />
          <HelperText type="info" visible style={{ fontSize: Math.round(12 * fontScale) }}>
            {t('interaction.previewNotEditable')}
          </HelperText>
        </View>
      )}

      {action === 'comment' && (
        <View style={[frameStyle, styles.sectionFrame]}>
          <Text style={[styles.sectionLabel, { fontSize: Math.round(13 * fontScale) }]}>
            {t('interaction.onChainPreview')}
          </Text>
          <TextInput
            mode="outlined"
            value={composeContent}
            editable={false}
            multiline
            numberOfLines={6}
            style={styles.previewInput}
            contentStyle={{ textAlignVertical: 'top', paddingTop: 8, color: theme.colors.onSurface }}
            outlineColor={theme.colors.outline}
          />
          <HelperText type="info" visible style={{ fontSize: Math.round(12 * fontScale) }}>
            {t('interaction.previewNotEditable')}
          </HelperText>
        </View>
      )}

      <View style={[frameStyle, styles.confirmFrame]}>
        <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmRecipient')}</Text>
        <Text style={[styles.confirmValue, styles.addressText, { fontSize: Math.round(14 * fontScale) }]} selectable>
          {wrapLongHex(recipientAddress)}
        </Text>
      </View>

      {ethValueToSend > 0n && (
        <View style={[frameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmEthAmount')}</Text>
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale), color: theme.colors.primary, fontWeight: 'bold' }]}>
            {ethValueDisplay} ETH
          </Text>
        </View>
      )}

      <View style={[frameStyle, styles.confirmFrame]}>
        <Text style={[styles.confirmLabel, { fontSize: Math.round(13 * fontScale) }]}>{t('send.confirmBalance')}</Text>
        <View style={styles.feeRow}>
          {feeLoading && <ActivityIndicator size="small" style={styles.feeSpinner} />}
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>{balanceDisplay}</Text>
        </View>
        {balanceUsdText && (
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), marginTop: 2 }}>
            {t('send.balanceUsdValue', { usd: balanceUsdText })}
          </Text>
        )}
      </View>

      <View style={[frameStyle, styles.confirmFrame]}>
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
          {feeLoading && <ActivityIndicator size="small" style={styles.feeSpinner} />}
          <Text style={[styles.confirmValue, { fontSize: Math.round(14 * fontScale) }]}>{feeDisplay}</Text>
        </View>
        {feeUsdText && (
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), marginTop: 2 }}>
            {t('send.feeUsdValue', { usd: feeUsdText })}
          </Text>
        )}
      </View>

      {insufficientBalance && (
        <View style={[frameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
            {t('send.insufficientBalance')}
          </Text>
        </View>
      )}

      {feeError && !feeLoading && (
        <View style={[frameStyle, styles.confirmFrame]}>
          <Text style={[styles.confirmWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
            {t('send.feeEstimateFailedHint')}
          </Text>
          <Button mode="outlined" compact onPress={retryFeeEstimate} style={styles.feeRetryButton}>
            {t('send.feeRetry')}
          </Button>
        </View>
      )}
    </>
  );

  const renderDisclaimers = () => (
    <>
      <View style={[frameStyle, styles.confirmFrame]}>
        <Text style={[styles.feeDisclaimer, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
          {t('send.feeDisclaimer')}
        </Text>
      </View>

      <View style={[frameStyle, styles.confirmFrame]}>
        <Text style={[styles.feeDisclaimer, { color: theme.colors.error, fontSize: Math.round(13 * fontScale), lineHeight: Math.round(18 * fontScale) }]}>
          {t('send.submitNotMinedDisclaimer')}
        </Text>
      </View>

      <View style={[frameStyle, styles.confirmFrame]}>
        <Text style={[styles.safetyTip, { color: theme.colors.onSurfaceVariant, fontSize: Math.round(12 * fontScale), lineHeight: Math.round(17 * fontScale) }]}>
          {t('send.safetyTipMsg')}
        </Text>
      </View>
    </>
  );

  const renderFeeContent = () => (
    <>
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
      <Text style={[styles.sectionLabel, { marginTop: 16, fontSize: Math.round(13 * fontScale) }]}>{t('send.feeLevelCustom')}</Text>
      <TextInput
        mode="outlined"
        label={t('send.maxFeePerGas')}
        keyboardType="numeric"
        value={customMaxFee}
        onChangeText={(v) => {
          feeUserTouchedRef.current = true;
          setCustomMaxFee(v);
        }}
        style={styles.feeInput}
      />
      <TextInput
        mode="outlined"
        label={t('send.maxPriorityFeePerGas')}
        keyboardType="numeric"
        value={customMaxPriority}
        onChangeText={(v) => {
          feeUserTouchedRef.current = true;
          setCustomMaxPriority(v);
        }}
        style={styles.feeInput}
      />
    </>
  );

  const renderPasswordContent = () => (
    <>
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
    </>
  );

  const renderSuccessContent = () => (
    <>
      <Text variant="bodyMedium" style={styles.dialogBody} selectable>
        {t('send.txHash', { hash: txHash })}
      </Text>
      <Text variant="bodySmall" style={[styles.dialogHint, { color: theme.colors.onSurfaceVariant }]}>
        {t('send.submitNotMinedHint')}
      </Text>
    </>
  );

  const dialogTitle =
    renderDialogStep === 'fee'
      ? t('send.feeAdjustmentTitle')
      : renderDialogStep === 'password'
        ? t('send.passwordTitle')
        : t('send.sendSuccess');

  const dialogActions =
    renderDialogStep === 'success'
      ? [
          {
            label: t('common.copy'),
            onPress: async () => {
              await Clipboard.setStringAsync(txHash);
            },
          },
          { label: t('common.ok'), onPress: leavePage },
        ]
      : renderDialogStep === 'fee'
        ? [
            { label: t('common.cancel'), onPress: () => setStep('compose') },
            { label: t('common.ok'), onPress: handleApplyCustomFee },
          ]
        : [
            { label: t('common.cancel'), disabled: loading, onPress: handleDialogDismiss },
            {
              label: t('common.ok'),
              onPress: handleSend,
              loading,
              disabled: loading || passwordLocked,
            },
          ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={[scrollFill, styles.container]}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ListColumn>
          {renderComposeContent()}

          <View style={styles.buttonGroup}>
            <Button
              mode="contained"
              onPress={handleConfirm}
              disabled={!canConfirmSend}
              style={styles.button}
              buttonColor={theme.colors.primary}
              contentStyle={styles.buttonContent}
            >
              {t('send.confirmSendButton', { defaultValue: t('wallet.verifyButtonConfirm') })}
            </Button>
            <Button
              mode="outlined"
              onPress={leavePage}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              {t('common.cancel')}
            </Button>
          </View>

          <View style={styles.disclaimerGroup}>{renderDisclaimers()}</View>
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={step !== 'compose'}
        onDismiss={handleDialogDismiss}
        dismissable={!loading}
        title={dialogTitle}
        scrollable={renderDialogStep === 'fee'}
        actions={dialogActions}
      >
        {renderDialogStep === 'fee' && renderFeeContent()}
        {renderDialogStep === 'password' && renderPasswordContent()}
        {renderDialogStep === 'success' && renderSuccessContent()}
      </AppModal>
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
  buttonGroup: {
    marginTop: 24,
    gap: 12,
  },
  disclaimerGroup: {
    marginTop: 16,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
  },
  actionButtonLabel: {
    fontSize: 12,
    marginHorizontal: 4,
  },
  sectionFrame: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    opacity: 0.7,
  },
  amountBlock: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  multiplierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  multiplierButton: {
    flex: 1,
    borderRadius: 8,
  },
  multiplierButtonLabel: {
    fontSize: 12,
  },
  hintText: {
    marginTop: 8,
    fontSize: 12,
  },
  commentInput: {
    minHeight: 120,
  },
  previewInput: {
    minHeight: 280,
    backgroundColor: 'transparent',
  },
  compactPreviewInput: {
    minHeight: 140,
  },
  confirmFrame: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
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
  confirmWarning: {
    fontSize: 13,
    lineHeight: 18,
  },
  feeRetryButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  feeDisclaimer: {
    fontSize: 13,
    lineHeight: 18,
  },
  safetyTip: {
    fontSize: 12,
    lineHeight: 17,
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
});
