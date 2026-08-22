import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import {
  Text,
  Card,
  Button,
  useTheme,
  IconButton,
  TextInput,
  Avatar,
  RadioButton,
  Snackbar,
  ActivityIndicator,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../context/AppContext';
import { useThemePreference, ThemeMode, FONT_SCALE_PRESETS } from '../context/ThemeContext';
import { RootStackParamList } from '../types';
import { LANGUAGE_KEY } from '../i18n';
import { CopyableAddress } from '../components/CopyableAddress';
import { AppModal } from '../components/AppModal';
import { withRpcFallback } from '../rpc/rpcClient';
import { fetchEthUsdPrice, formatUsd } from '../rpc/ethPrice';
import { formatEther } from 'ethers';
import appConfig from '../../app.json';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const APP_NAME = appConfig.expo.name;
const APP_FULL_NAME = appConfig.expo.description;
const APP_VERSION = appConfig.expo.version;

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function shortenAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function getPlatformLabel(t: (key: string) => string): string {
  switch (Platform.OS) {
    case 'ios':
      return t('profile.platformIos');
    case 'android':
      return t('profile.platformAndroid');
    case 'web':
      return t('profile.platformWeb');
    default:
      return t('profile.platformOther');
  }
}

/* ------------------------------------------------------------------ */
/*  "我的" 屏幕                                                        */
/* ------------------------------------------------------------------ */

export default function ProfileScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { state, setApiKey } = useAppContext();
  const { themeMode, setThemeMode, fontScale, setFontScale } = useThemePreference();
  const { t, i18n } = useTranslation();
  const { listContentStyle } = useListColumnLayout();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLanguageDialogVisible, setIsLanguageDialogVisible] = useState(false);
  const [isThemeDialogVisible, setIsThemeDialogVisible] = useState(false);
  const [isFontSizeDialogVisible, setIsFontSizeDialogVisible] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [balanceEth, setBalanceEth] = useState<string | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  const currentLanguage = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const platformLabel = useMemo(() => getPlatformLabel(t), [t]);

  const showLanguageDialog = useCallback(() => {
    setIsLanguageDialogVisible(true);
  }, []);

  const hideLanguageDialog = useCallback(() => {
    setIsLanguageDialogVisible(false);
  }, []);

  const showThemeDialog = useCallback(() => {
    setIsThemeDialogVisible(true);
  }, []);

  const hideThemeDialog = useCallback(() => {
    setIsThemeDialogVisible(false);
  }, []);

  const showFontSizeDialog = useCallback(() => {
    setIsFontSizeDialogVisible(true);
  }, []);

  const hideFontSizeDialog = useCallback(() => {
    setIsFontSizeDialogVisible(false);
  }, []);

  const changeLanguage = useCallback(async (lng: string) => {
    await i18n.changeLanguage(lng);
    await AsyncStorage.setItem(LANGUAGE_KEY, lng);
    hideLanguageDialog();
  }, [i18n, hideLanguageDialog]);

  const changeTheme = useCallback(async (mode: ThemeMode) => {
    await setThemeMode(mode);
    hideThemeDialog();
  }, [setThemeMode, hideThemeDialog]);

  const changeFontScale = useCallback(async (scale: number) => {
    await setFontScale(scale);
    hideFontSizeDialog();
  }, [setFontScale, hideFontSizeDialog]);

  const currentFontScaleLabel = useMemo(() => {
    const preset = FONT_SCALE_PRESETS.find((p) => p.value === fontScale)
      ?? FONT_SCALE_PRESETS.find((p) => p.value === 1.0)!;
    return t(preset.labelKey);
  }, [fontScale, t]);

  const handleAdd = useCallback(() => {
    navigation.navigate('AddInfoSelect');
  }, [navigation]);

  const handleEdit = useCallback(() => {
    if (state.profile) {
      navigation.navigate('AddAddressForm', {
        mode: 'edit',
        source: 'profile',
        subscription: state.profile,
      });
    }
  }, [navigation, state.profile]);

  const showApiKeyModal = useCallback(() => {
    setTempApiKey(state.apiKey || '');
    setIsModalVisible(true);
  }, [state.apiKey]);

  const hideApiKeyModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    await setApiKey(tempApiKey.trim());
    hideApiKeyModal();
  }, [tempApiKey, setApiKey, hideApiKeyModal]);

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarVisible(true);
  }, []);

  const loadBalance = useCallback(async (address: string) => {
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      const [balanceWei, price] = await Promise.all([
        withRpcFallback((provider) => provider.getBalance(address)),
        fetchEthUsdPrice(),
      ]);
      const ethStr = formatEther(balanceWei);
      setBalanceEth(ethStr);
      if (price != null) {
        setBalanceUsd(formatUsd(parseFloat(ethStr) * price));
      }
    } catch (err) {
      console.warn('loadBalance failed:', err);
      setBalanceError(true);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.profile?.address) {
      loadBalance(state.profile.address);
    }
  }, [state.profile?.address, loadBalance]);

  const balanceDisplayText = useMemo(() => {
    if (balanceLoading) return t('profile.balanceLoading');
    if (balanceError || balanceEth == null) return balanceError ? t('profile.balanceFailed') : '';
    const ethDisplay = parseFloat(balanceEth);
    const formatted = ethDisplay < 0.000001
      ? '< 0.000001'
      : ethDisplay.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return t('profile.balanceEthValue', { balance: formatted });
  }, [balanceLoading, balanceError, balanceEth, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* 内容区 */}
      <ScrollView
        style={[scrollFill, styles.content]}
        contentContainerStyle={[styles.scrollContent, listContentStyle]}
      >
        <ListColumn>
        {/* 1. 我的地址信息 */}
        {state.profile ? (
          <>
            <Card
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
              mode="elevated"
              onPress={handleEdit}
            >
              <Card.Content style={styles.cardContent}>
                <View style={styles.row}>
                  <Avatar.Icon
                    size={48}
                    icon="account"
                    style={{ backgroundColor: theme.colors.primaryContainer }}
                    color={theme.colors.primary}
                  />
                  <View style={styles.cardTextContainer}>
                    <View style={styles.row}>
                      <Text
                        variant="labelMedium"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {t('common.address')}
                      </Text>
                      {state.profile.walletType && (
                        <View style={[
                          styles.typeTag,
                          { backgroundColor: state.profile.walletType === 'write' ? theme.colors.primaryContainer : theme.colors.secondaryContainer }
                        ]}>
                          <Text style={[
                            styles.typeTagText,
                            { color: state.profile.walletType === 'write' ? theme.colors.primary : theme.colors.secondary, fontSize: Math.round(10 * fontScale) }
                          ]}>
                            {state.profile.walletType === 'write' ? t('profile.fullFunction') : t('profile.readOnly')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <CopyableAddress
                      address={state.profile.address}
                      variant="titleMedium"
                      style={[styles.addressText, { color: theme.colors.primary }]}
                      onCopied={showCopiedSnackbar}
                    >
                      {shortenAddress(state.profile.address)}
                    </CopyableAddress>
                    {state.profile.description ? (
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                        numberOfLines={1}
                      >
                        {state.profile.description}
                      </Text>
                    ) : null}
                    {/* Balance & USD estimate */}
                    <View style={styles.balanceRow}>
                      {balanceLoading ? (
                        <ActivityIndicator size={12} style={{ marginRight: 6 }} />
                      ) : null}
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
                        numberOfLines={1}
                      >
                        {balanceDisplayText}
                        {balanceUsd ? `  ·  ${t('profile.balanceUsdEstimate', { usd: balanceUsd })}` : ''}
                      </Text>
                      <IconButton
                        icon="refresh"
                        size={16}
                        onPress={() => state.profile?.address && loadBalance(state.profile.address)}
                        style={styles.refreshButton}
                        disabled={balanceLoading}
                      />
                    </View>
                    {balanceUsd ? (
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant, fontSize: Math.round(10 * fontScale) }}
                      >
                        {t('profile.balanceEstimateHint')}
                      </Text>
                    ) : null}
                  </View>
                  <IconButton icon="pencil" onPress={handleEdit} />
                </View>
              </Card.Content>
            </Card>
            <Button
              mode="outlined"
              icon="shield-key-outline"
              onPress={handleAdd}
              style={styles.upgradeButton}
            >
              {t('profile.upgradeWallet')}
            </Button>
          </>
        ) : (
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
            onPress={handleAdd}
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.row}>
                <Avatar.Icon
                  size={48}
                  icon="account-plus"
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  color={theme.colors.primary}
                />
                <View style={styles.cardTextContainer}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                    {t('common.noData')}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('profile.addHint')}
                  </Text>
                </View>
                <IconButton icon="plus" onPress={handleAdd} />
              </View>
            </Card.Content>
          </Card>
        )}

        {/* 2. 语言选择 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={showLanguageDialog}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="translate"
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                color={theme.colors.secondary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.language')}
                </Text>
                <Text variant="titleMedium">
                  {currentLanguage === 'zh' ? '简体中文' : 'English'}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={showLanguageDialog} />
            </View>
          </Card.Content>
        </Card>

        {/* 3. 我的本地收藏 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={() => navigation.navigate('LocalFavorites')}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="star-outline"
                style={{ backgroundColor: theme.colors.tertiaryContainer }}
                color={theme.colors.tertiary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.localFavorites')}
                </Text>
                <Text variant="titleMedium">
                  {t('favorites.count', { count: state.favorites.length })}
                </Text>
              </View>
              <IconButton
                icon="chevron-right"
                onPress={() => navigation.navigate('LocalFavorites')}
              />
            </View>
          </Card.Content>
        </Card>

        {/* 4. 外观 / 主题 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={showThemeDialog}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="theme-light-dark"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.appearance')}
                </Text>
                <Text variant="titleMedium">
                  {themeMode === 'dark' ? t('profile.themeDark') : t('profile.themeLight')}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={showThemeDialog} />
            </View>
          </Card.Content>
        </Card>

        {/* 4.5 字体大小 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={showFontSizeDialog}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="format-size"
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                color={theme.colors.secondary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.fontSize')}
                </Text>
                <Text variant="titleMedium">
                  {currentFontScaleLabel}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={showFontSizeDialog} />
            </View>
          </Card.Content>
        </Card>

        {/* 5. API Key */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={showApiKeyModal}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="key-variant"
                style={{ backgroundColor: theme.colors.tertiaryContainer }}
                color={theme.colors.tertiary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  Etherscan API Key
                </Text>
                <Text variant="titleMedium">
                  {state.apiKey
                    ? `${state.apiKey.slice(0, 6)}...${state.apiKey.slice(-4)}`
                    : t('profile.addApiKey')}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={showApiKeyModal} />
            </View>
          </Card.Content>
        </Card>

        {/* 6. 应用信息 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="information-outline"
                style={{ backgroundColor: theme.colors.surfaceVariant }}
                color={theme.colors.onSurfaceVariant}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.appInfo')}
                </Text>
                <Text variant="titleMedium">{APP_NAME}</Text>
                {APP_FULL_NAME ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {APP_FULL_NAME}
                  </Text>
                ) : null}
                <View style={styles.appInfoRows}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('profile.appVersion')}: {APP_VERSION}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('profile.platform')}: {platformLabel}
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={isModalVisible}
        onDismiss={hideApiKeyModal}
        title={t('profile.setApiKeyTitle')}
        actions={[
          { label: t('common.cancel'), onPress: hideApiKeyModal },
          { label: t('common.save'), onPress: handleSaveApiKey },
        ]}
      >
        <TextInput
          label="API Key"
          value={tempApiKey}
          onChangeText={setTempApiKey}
          mode="outlined"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </AppModal>

      <AppModal
        visible={isLanguageDialogVisible}
        onDismiss={hideLanguageDialog}
        title={t('profile.selectLanguage')}
        actions={[{ label: t('common.cancel'), onPress: hideLanguageDialog }]}
      >
        <RadioButton.Group
          onValueChange={changeLanguage}
          value={currentLanguage}
        >
          <RadioButton.Item
            label="简体中文"
            value="zh"
            style={styles.radioItem}
          />
          <RadioButton.Item
            label="English"
            value="en"
            style={styles.radioItem}
          />
        </RadioButton.Group>
      </AppModal>

      <AppModal
        visible={isThemeDialogVisible}
        onDismiss={hideThemeDialog}
        title={t('profile.selectAppearance')}
        actions={[{ label: t('common.cancel'), onPress: hideThemeDialog }]}
      >
        <RadioButton.Group
          onValueChange={(value) => changeTheme(value as ThemeMode)}
          value={themeMode}
        >
          <RadioButton.Item
            label={t('profile.themeLight')}
            value="light"
            style={styles.radioItem}
          />
          <RadioButton.Item
            label={t('profile.themeDark')}
            value="dark"
            style={styles.radioItem}
          />
        </RadioButton.Group>
      </AppModal>

      <AppModal
        visible={isFontSizeDialogVisible}
        onDismiss={hideFontSizeDialog}
        title={t('profile.selectFontSize')}
        actions={[{ label: t('common.cancel'), onPress: hideFontSizeDialog }]}
      >
        <RadioButton.Group
          onValueChange={(value) => changeFontScale(parseFloat(value))}
          value={String(fontScale)}
        >
          {FONT_SCALE_PRESETS.map((preset) => (
            <RadioButton.Item
              key={preset.value}
              label={t(preset.labelKey)}
              value={String(preset.value)}
              style={styles.radioItem}
            />
          ))}
        </RadioButton.Group>
      </AppModal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {t('common.copied')}
      </Snackbar>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  样式                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingTop: 16,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  addressText: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  sectionSpacer: {
    height: 12,
  },
  upgradeButton: {
    marginTop: 12,
    borderRadius: 12,
  },
  typeTag: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  appInfoRows: {
    marginTop: 4,
    gap: 2,
  },
  radioItem: {
    paddingHorizontal: 0,
    borderRadius: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  refreshButton: {
    margin: 0,
    marginLeft: 4,
    padding: 0,
  },
});
