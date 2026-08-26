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
import { dataSourceManager } from '../datasource/DataSourceManager';
import {
  getHomeTabOrder,
  normalizeHomeTabWeights,
  type HomeTabId,
} from '../constants';
import { formatEther } from 'ethers';
import appConfig from '../../app.json';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const APP_NAME = appConfig.expo.name;
const APP_FULL_NAME = appConfig.expo.description;
const APP_VERSION = appConfig.expo.version;

const HOME_TAB_LABEL_KEYS: Record<HomeTabId, string> = {
  square: 'home.tabs.square',
  following: 'home.tabs.following',
  messages: 'home.tabs.messages',
  self: 'home.tabs.home',
};

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
  const { state, setApiKey, setDataSourceWeights, setHomeTabWeights } = useAppContext();
  const { themeMode, setThemeMode, fontScale, setFontScale } = useThemePreference();
  const { t, i18n } = useTranslation();
  const { listContentStyle } = useListColumnLayout();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLanguageDialogVisible, setIsLanguageDialogVisible] = useState(false);
  const [isThemeDialogVisible, setIsThemeDialogVisible] = useState(false);
  const [isFontSizeDialogVisible, setIsFontSizeDialogVisible] = useState(false);
  const [isWeightModalVisible, setIsWeightModalVisible] = useState(false);
  const [isHomeTabWeightModalVisible, setIsHomeTabWeightModalVisible] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({});
  const [localHomeTabWeights, setLocalHomeTabWeights] = useState<Record<HomeTabId, number>>(
    normalizeHomeTabWeights(),
  );
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

  const sources = useMemo(() => dataSourceManager.getSources(), []);

  const activeSourcesCount = useMemo(() => {
    return sources.filter((s) => !s.requiresApiKey || !!s.apiKey).length;
  }, [sources, state.apiKey]); // Re-calc when apiKey changes

  const showWeightModal = useCallback(() => {
    const currentWeights = sources.reduce((acc, s) => {
      acc[s.name] = state.dataSourceWeights[s.name] ?? s.weight;
      return acc;
    }, {} as Record<string, number>);
    setLocalWeights(currentWeights);
    setIsWeightModalVisible(true);
  }, [sources, state.dataSourceWeights]);

  const hideWeightModal = useCallback(() => {
    setIsWeightModalVisible(false);
  }, []);

  const handleSaveWeights = useCallback(async () => {
    await setDataSourceWeights(localWeights);
    hideWeightModal();
  }, [localWeights, setDataSourceWeights, hideWeightModal]);

  const showHomeTabWeightModal = useCallback(() => {
    setLocalHomeTabWeights(normalizeHomeTabWeights(state.homeTabWeights));
    setIsHomeTabWeightModalVisible(true);
  }, [state.homeTabWeights]);

  const hideHomeTabWeightModal = useCallback(() => {
    setIsHomeTabWeightModalVisible(false);
  }, []);

  const handleSaveHomeTabWeights = useCallback(async () => {
    await setHomeTabWeights(normalizeHomeTabWeights(localHomeTabWeights));
    hideHomeTabWeightModal();
  }, [localHomeTabWeights, setHomeTabWeights, hideHomeTabWeightModal]);

  const homeTabOrderPreview = useMemo(
    () => getHomeTabOrder(state.homeTabWeights)
      .map((id) => t(HOME_TAB_LABEL_KEYS[id]))
      .join(' · '),
    [state.homeTabWeights, t],
  );

  const modalHomeTabOrder = useMemo(
    () => getHomeTabOrder(localHomeTabWeights),
    [localHomeTabWeights],
  );

  const updateLocalWeight = (name: string, val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setLocalWeights((prev) => ({ ...prev, [name]: num }));
    } else if (val === '') {
      setLocalWeights((prev) => ({ ...prev, [name]: 0 }));
    }
  };

  const updateLocalHomeTabWeight = (id: HomeTabId, val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      setLocalHomeTabWeights((prev) => ({ ...prev, [id]: num }));
    } else if (val === '') {
      setLocalHomeTabWeights((prev) => ({ ...prev, [id]: 1 }));
    }
  };

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

        {/* 2. 我的本地收藏 */}
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

        {/* 3. 我的草稿 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={() => navigation.navigate('LocalDrafts')}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="file-document-edit-outline"
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                color={theme.colors.secondary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.localDrafts')}
                </Text>
                <Text variant="titleMedium">
                  {t('drafts.count', { count: state.drafts.length })}
                </Text>
              </View>
              <IconButton
                icon="chevron-right"
                onPress={() => navigation.navigate('LocalDrafts')}
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

        {/* 5. 首页标签排序 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={showHomeTabWeightModal}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="view-sequential"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.homeTabWeights')}
                </Text>
                <Text variant="titleMedium" numberOfLines={1}>
                  {homeTabOrderPreview}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={showHomeTabWeightModal} />
            </View>
          </Card.Content>
        </Card>

        {/* 6. 数据源权重 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={showWeightModal}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="sort-ascending"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t('profile.dataSourceWeights')}
                </Text>
                <Text variant="titleMedium">
                  {activeSourcesCount} / {sources.length} {t('profile.activeSource')}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={showWeightModal} />
            </View>
          </Card.Content>
        </Card>

        {/* 7. Etherscan API Key */}
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

        {/* 8. 字体大小 */}
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

        {/* 9. 语言选择 */}
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

        {/* 10. 应用信息 */}
        <View style={styles.sectionSpacer} />
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={() => navigation.navigate('AppInfo')}
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
              <IconButton icon="chevron-right" onPress={() => navigation.navigate('AppInfo')} />
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
          multiline
          numberOfLines={3}
          scrollEnabled={false}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          style={styles.apiKeyInput}
          contentStyle={[
            styles.apiKeyInputContent,
            { fontSize: Math.round(13 * fontScale) },
            Platform.OS === 'web'
              ? ({ wordBreak: 'break-all', overflowWrap: 'anywhere' } as object)
              : null,
          ]}
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

      <AppModal
        visible={isWeightModalVisible}
        onDismiss={hideWeightModal}
        title={t('profile.editDataSourceWeights')}
        actions={[
          { label: t('common.cancel'), onPress: hideWeightModal },
          { label: t('common.save'), onPress: handleSaveWeights },
        ]}
      >
        <ScrollView style={{ maxHeight: 400 }}>
          {sources.map((source) => {
            const isDisabled = source.requiresApiKey && !source.apiKey;
            return (
              <View key={source.name} style={styles.weightItem}>
                <View style={styles.weightHeader}>
                  <Text variant="titleSmall" style={{ color: isDisabled ? theme.colors.onSurfaceDisabled : theme.colors.onSurface }}>
                    {source.name}
                  </Text>
                  {isDisabled && (
                    <Text variant="bodySmall" style={{ color: theme.colors.error, fontSize: 10 }}>
                      ({t('profile.inactiveSource')})
                    </Text>
                  )}
                </View>
                <TextInput
                  mode="outlined"
                  dense
                  label={t('profile.weightLabel')}
                  value={String(localWeights[source.name] ?? source.weight)}
                  onChangeText={(val) => updateLocalWeight(source.name, val)}
                  keyboardType="numeric"
                  disabled={isDisabled}
                  style={styles.weightInput}
                />
                {isDisabled && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 2 }}>
                    {t('profile.requiresKeyHint')}
                  </Text>
                )}
              </View>
            );
          })}
          <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
            {t('profile.weightHint')}
          </Text>
        </ScrollView>
      </AppModal>

      <AppModal
        visible={isHomeTabWeightModalVisible}
        onDismiss={hideHomeTabWeightModal}
        title={t('profile.editHomeTabWeights')}
        actions={[
          { label: t('common.cancel'), onPress: hideHomeTabWeightModal },
          { label: t('common.save'), onPress: handleSaveHomeTabWeights },
        ]}
      >
        <ScrollView style={{ maxHeight: 400 }}>
          {modalHomeTabOrder.map((id) => (
            <View key={id} style={styles.weightItem}>
              <View style={styles.weightHeader}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                  {t(HOME_TAB_LABEL_KEYS[id])}
                </Text>
              </View>
              <TextInput
                mode="outlined"
                dense
                label={t('profile.weightLabel')}
                value={String(localHomeTabWeights[id])}
                onChangeText={(val) => updateLocalHomeTabWeight(id, val)}
                keyboardType="numeric"
                style={styles.weightInput}
              />
            </View>
          ))}
          <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
            {t('profile.homeTabWeightHint')}
          </Text>
        </ScrollView>
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
  weightItem: {
    marginBottom: 16,
  },
  weightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  weightInput: {
    height: 40,
  },
  apiKeyInput: {
    width: '100%',
    maxWidth: '100%',
  },
  apiKeyInputContent: {
    minHeight: 56,
    textAlignVertical: 'top',
    paddingTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
