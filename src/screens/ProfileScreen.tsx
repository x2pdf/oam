import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  IconButton,
  Modal,
  Portal,
  TextInput,
  Avatar,
  Dialog,
  RadioButton,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../context/AppContext';
import { RootStackParamList } from '../types';
import { LANGUAGE_KEY } from '../i18n';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function shortenAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function formatHeaderAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}....${address.slice(-6)}`;
}

/* ------------------------------------------------------------------ */
/*  "我的" 屏幕                                                        */
/* ------------------------------------------------------------------ */

export default function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { state, setApiKey } = useAppContext();
  const { t, i18n } = useTranslation();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isAddressDetailVisible, setIsAddressDetailVisible] = useState(false);
  const [isLanguageDialogVisible, setIsLanguageDialogVisible] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');

  const currentLanguage = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  const showLanguageDialog = useCallback(() => {
    setIsLanguageDialogVisible(true);
  }, []);

  const hideLanguageDialog = useCallback(() => {
    setIsLanguageDialogVisible(false);
  }, []);

  const showAddressDetail = useCallback(() => {
    setIsAddressDetailVisible(true);
  }, []);

  const hideAddressDetail = useCallback(() => {
    setIsAddressDetailVisible(false);
  }, []);

  const changeLanguage = useCallback(async (lng: string) => {
    await i18n.changeLanguage(lng);
    await AsyncStorage.setItem(LANGUAGE_KEY, lng);
    hideLanguageDialog();
  }, [i18n, hideLanguageDialog]);

  const handleAdd = useCallback(() => {
    navigation.navigate('AddInfoSelect');
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="plus"
          iconColor="#FFFFFF"
          onPress={handleAdd}
          accessibilityLabel={t('wallet.selectAddMethod')}
        />
      ),
    });
  }, [navigation, handleAdd, t]);

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

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      {/* 内容区 */}
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* 顶部地址展示 (非列表数据) */}
        {state.profile && (
          <View style={styles.headerInfo}>
            <Pressable onPress={showAddressDetail}>
              <Text variant="bodySmall" style={[styles.headerInfoText, { color: theme.colors.onSurfaceVariant }]}>
                {`${state.profile.description} (${formatHeaderAddress(state.profile.address)})`}
              </Text>
            </Pressable>
          </View>
        )}

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
                            { color: state.profile.walletType === 'write' ? theme.colors.primary : theme.colors.secondary }
                          ]}>
                            {state.profile.walletType === 'write' ? t('profile.fullFunction') : t('profile.readOnly')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      variant="titleMedium"
                      style={[styles.addressText, { color: theme.colors.primary }]}
                    >
                      {shortenAddress(state.profile.address)}
                    </Text>
                    {state.profile.description ? (
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                        numberOfLines={1}
                      >
                        {state.profile.description}
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

        {/* 3. API Key */}
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
      </ScrollView>

      {/* API Key 输入弹窗 */}
      <Portal>
        <Modal
          visible={isModalVisible}
          onDismiss={hideApiKeyModal}
          contentContainerStyle={[
            styles.modalContent,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text variant="titleMedium" style={styles.modalTitle}>
            {t('profile.setApiKeyTitle')}
          </Text>
          <TextInput
            label="API Key"
            value={tempApiKey}
            onChangeText={setTempApiKey}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <View style={styles.modalButtons}>
            <Button onPress={hideApiKeyModal} style={styles.modalButton}>
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveApiKey}
              style={styles.modalButton}
            >
              {t('common.save')}
            </Button>
          </View>
        </Modal>

        {/* 语言选择弹窗 */}
        <Dialog visible={isLanguageDialogVisible} onDismiss={hideLanguageDialog}>
          <Dialog.Title>{t('profile.selectLanguage')}</Dialog.Title>
          <Dialog.Content style={styles.languageDialogContent}>
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
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideLanguageDialog}>{t('common.cancel')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 地址详情弹窗 */}
        <Dialog visible={isAddressDetailVisible} onDismiss={hideAddressDetail}>
          <Dialog.Title>{t('common.address')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
              {state.profile?.description}
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.addressText, { color: theme.colors.primary }]}
              selectable
            >
              {state.profile?.address}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideAddressDetail}>{t('common.close')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
    paddingHorizontal: 16,
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
  headerInfo: {
    marginBottom: 16,
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerInfoText: {
    textAlign: 'center',
    opacity: 0.8,
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
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    marginLeft: 8,
  },
  languageDialogContent: {
    paddingHorizontal: 8,
    paddingBottom: 0,
  },
  radioItem: {
    paddingHorizontal: 16,
    borderRadius: 8,
  },
});
