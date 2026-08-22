import React, { useCallback, useLayoutEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Button, TextInput, useTheme, Snackbar, IconButton, HelperText } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList, Subscription } from '../types';
import { useAppContext } from '../context/AppContext';
import { AddressWithActions } from '../components/AddressWithActions';
import { AppModal } from '../components/AppModal';
import { getHeaderChrome } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionDetail'>;

export default function SubscriptionDetailScreen({ route, navigation }: Props) {
  const { subscription: routeSubscription } = route.params;
  const theme = useTheme();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const { state, updateSubscription } = useAppContext();
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // 置顶弹窗状态
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightError, setWeightError] = useState('');

  // 从 state 获取最新订阅数据
  const subscription: Subscription = useMemo(
    () => state.subscriptions.find((s) => s.id === routeSubscription.id) ?? routeSubscription,
    [state.subscriptions, routeSubscription],
  );
  const currentWeight = subscription.pinWeight ?? 0;
  const isPinned = currentWeight > 0;

  useLayoutEffect(() => {
    const headerChrome = getHeaderChrome(theme);
    navigation.setOptions({
      title: subscription.description || t('nav.subscriptionDetail'),
      headerRight: () => (
        <IconButton
          icon="pencil-outline"
          iconColor={headerChrome.tintColor}
          size={22}
          onPress={() =>
            navigation.navigate('SubscriptionForm', {
              mode: 'edit',
              source: 'subscriptions',
              subscription,
            })
          }
        />
      ),
    });
  }, [navigation, subscription, t, theme]);

  const handleViewAll = useCallback(() => {
    navigation.navigate('AddressDataList', {
      address: subscription.address,
      title: subscription.description,
    });
  }, [navigation, subscription]);

  const handleSendTo = useCallback(() => {
    navigation.navigate('SendData', { recipientAddress: subscription.address });
  }, [navigation, subscription.address]);

  const handleViewConversation = useCallback(() => {
    const profileAddress = state.profile?.address?.trim();
    if (!profileAddress) {
      Alert.alert(t('common.tip'), t('subscriptions.needProfileForConversation'), [
        { text: t('common.ok') },
      ]);
      return;
    }

    navigation.navigate('AddressDataList', {
      address: subscription.address,
      title: subscription.description,
      peerAddress: profileAddress,
    });
  }, [navigation, subscription, state.profile?.address, t]);

  /* ---------- 置顶功能 ---------- */
  const openPinModal = useCallback(() => {
    setWeightInput(isPinned ? String(currentWeight) : '');
    setWeightError('');
    setPinModalVisible(true);
  }, [isPinned, currentWeight]);

  const handleConfirmPin = useCallback(async () => {
    const val = parseInt(weightInput, 10);
    if (isNaN(val) || val < 1 || val > 1000) {
      setWeightError(t('subscriptions.pinInvalid'));
      return;
    }
    await updateSubscription({ ...subscription, pinWeight: val });
    setPinModalVisible(false);
  }, [weightInput, subscription, updateSubscription, t]);

  const handleQuickWeight = useCallback((val: number) => {
    setWeightInput(String(val));
    setWeightError('');
  }, []);

  const handleCancelPin = useCallback(async () => {
    await updateSubscription({ ...subscription, pinWeight: 0 });
    setPinModalVisible(false);
  }, [subscription, updateSubscription]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle]}>
        <ListColumn>
        <Text
          variant="titleMedium"
          style={[styles.description, { color: theme.colors.onSurface }]}
        >
          {subscription.description}
        </Text>

        <AddressWithActions
          address={subscription.address}
          label={t('common.address')}
          showFullAddress
          onCopied={() => setSnackbarVisible(true)}
          showInfo={false}
        />

        <View style={styles.buttonGroup}>
          {/* 1. 我和他/她的对话数据 */}
          <Button
            mode="contained"
            icon="message-text-outline"
            onPress={handleViewConversation}
            style={styles.button}
            buttonColor={theme.colors.primary}
            contentStyle={styles.buttonContent}
          >
            {t('subscriptions.viewConversation')}
          </Button>

          {/* 2. 给他/她发送 */}
          <Button
            mode="contained"
            icon="send"
            onPress={handleSendTo}
            style={styles.button}
            buttonColor={theme.colors.primary}
            contentStyle={styles.buttonContent}
          >
            {t('subscriptions.sendToThem')}
          </Button>

          {/* 3. 他/她的全部数据 */}
          <Button
            mode="contained"
            icon="swap-vertical"
            onPress={handleViewAll}
            style={styles.button}
            buttonColor={theme.colors.secondary}
            contentStyle={styles.buttonContent}
          >
            {t('subscriptions.viewAllData')}
          </Button>

          {/* 4. 置顶按钮 */}
          <Button
            mode={isPinned ? 'contained' : 'outlined'}
            icon="pin"
            onPress={openPinModal}
            style={styles.button}
            buttonColor={isPinned ? theme.colors.secondary : undefined}
            textColor={isPinned ? '#FFFFFF' : theme.colors.secondary}
            contentStyle={styles.buttonContent}
          >
            {isPinned
              ? t('subscriptions.pinned', { weight: currentWeight })
              : t('subscriptions.pin')}
          </Button>
        </View>
        </ListColumn>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {t('common.copied')}
      </Snackbar>

      {/* 置顶权重设置弹窗 */}
      <AppModal
        visible={pinModalVisible}
        title={t('subscriptions.pinTitle')}
        onDismiss={() => setPinModalVisible(false)}
        actions={[
          ...(isPinned
            ? [
                {
                  label: t('subscriptions.pinCancel'),
                  onPress: handleCancelPin,
                  mode: 'text' as const,
                },
              ]
            : []),
          {
            label: t('subscriptions.pinConfirm'),
            onPress: handleConfirmPin,
            mode: 'contained' as const,
          },
        ]}
      >
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          {t('subscriptions.pinHint')}
        </Text>

        {/* 快捷权重按钮 */}
        <View style={styles.quickWeightRow}>
          {[100, 500, 1000].map((w) => (
            <Button
              key={w}
              mode={weightInput === String(w) ? 'contained' : 'outlined'}
              compact
              onPress={() => handleQuickWeight(w)}
              style={styles.quickWeightButton}
            >
              {w}
            </Button>
          ))}
        </View>

        <TextInput
          mode="outlined"
          label={t('subscriptions.pinTitle')}
          value={weightInput}
          onChangeText={(text) => {
            setWeightInput(text.replace(/[^0-9]/g, ''));
            if (weightError) setWeightError('');
          }}
          keyboardType="number-pad"
          maxLength={4}
          error={!!weightError}
          style={{ marginTop: 12 }}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
        />
        <HelperText type="error" visible={!!weightError}>
          {weightError}
        </HelperText>
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
  description: {
    fontWeight: '700',
    marginBottom: 16,
  },
  buttonGroup: {
    marginTop: 24,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  quickWeightRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickWeightButton: {
    flex: 1,
    borderRadius: 8,
  },
});
