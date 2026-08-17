import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  IconButton,
  Modal,
  Portal,
  TextInput,
  Menu,
  Divider,
} from 'react-native-paper';
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

/* ------------------------------------------------------------------ */
/*  "我的" 屏幕                                                        */
/* ------------------------------------------------------------------ */

export default function ProfileScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { state, setApiKey } = useAppContext();
  const { t, i18n } = useTranslation();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const changeLanguage = useCallback(async (lng: string) => {
    await i18n.changeLanguage(lng);
    await AsyncStorage.setItem(LANGUAGE_KEY, lng);
    closeMenu();
  }, [i18n]);

  const handleAdd = useCallback(() => {
    navigation.navigate('SubscriptionForm', {
      mode: 'add',
      source: 'profile',
    });
  }, [navigation]);

  const handleEdit = useCallback(() => {
    if (state.profile) {
      navigation.navigate('SubscriptionForm', {
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* 顶部操作栏：右上角 语言切换 和 + 或 修改 */}
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />

        <Menu
          visible={menuVisible}
          onDismiss={closeMenu}
          anchor={
            <Button
              onPress={openMenu}
              mode="text"
              compact
              icon="translate"
              textColor={theme.colors.primary}
            >
              {i18n.language === 'zh' ? '简体中文' : 'English'}
            </Button>
          }
        >
          <Menu.Item onPress={() => changeLanguage('en')} title="English" />
          <Divider />
          <Menu.Item onPress={() => changeLanguage('zh')} title="简体中文" />
        </Menu>

        {!state.profile && (
          <IconButton
            icon="plus"
            size={24}
            iconColor={theme.colors.primary}
            onPress={handleAdd}
            style={[styles.topButton, { backgroundColor: theme.colors.primaryContainer, marginLeft: 8 }]}
          />
        )}
      </View>

      {/* 内容区 */}
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {state.profile ? (
          <View style={styles.mainContent}>
            <Card
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
              mode="elevated"
            >
              <Card.Content style={styles.cardContent}>
                <Text
                  variant="labelLarge"
                  style={[styles.fieldLabel, { color: theme.colors.primary }]}
                >
                  {t('common.address')}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[styles.addressText, { color: theme.colors.onSurface }]}
                  selectable
                >
                  {shortenAddress(state.profile.address)}
                </Text>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: theme.colors.outline + '30' },
                  ]}
                />

                <Text
                  variant="labelLarge"
                  style={[styles.fieldLabel, { color: theme.colors.primary }]}
                >
                  {t('common.description')}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurface }}
                >
                  {state.profile.description}
                </Text>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              onPress={handleEdit}
              style={[styles.editButton, { marginTop: 24 }]}
              contentStyle={styles.editButtonContent}
              buttonColor={theme.colors.primary}
            >
              {t('common.edit')}
            </Button>
          </View>
        ) : (
          <View style={[styles.emptyContainer, styles.mainContent]}>
            <Text
              variant="bodyLarge"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t('common.noData')}
            </Text>
            <Text
              variant="bodySmall"
              style={[{ color: theme.colors.onSurfaceVariant }, styles.emptyHint]}
            >
              {t('profile.addHint')}
            </Text>
          </View>
        )}

        {/* 底部操作区 */}
        <View style={styles.bottomSection}>
          <Button
            mode="outlined"
            onPress={showApiKeyModal}
            style={styles.apiKeyButton}
            textColor={theme.colors.primary}
          >
            {state.apiKey ? t('profile.updateApiKey') : t('profile.addApiKey')}
          </Button>
          {state.apiKey ? (
            <Text
              variant="bodySmall"
              style={[styles.apiKeyHint, { color: theme.colors.onSurfaceVariant }]}
            >
              {t('profile.apiKeySetLabel')}: {state.apiKey.slice(0, 6)}...{state.apiKey.slice(-4)}
            </Text>
          ) : null}
        </View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topBarSpacer: {
    flex: 1,
  },
  topButton: {
    borderRadius: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyHint: {
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 8,
  },
  fieldLabel: {
    marginBottom: 4,
    fontWeight: '600',
  },
  addressText: {
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginBottom: 12,
  },
  editButton: {
    borderRadius: 8,
    elevation: 2,
  },
  editButtonContent: {
    paddingVertical: 4,
  },
  mainContent: {
    flex: 1,
  },
  bottomSection: {
    marginTop: 40,
    marginBottom: 32,
    alignItems: 'center',
  },
  apiKeyButton: {
    borderRadius: 8,
    width: '100%',
  },
  apiKeyHint: {
    marginTop: 8,
    fontFamily: 'monospace',
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
});
