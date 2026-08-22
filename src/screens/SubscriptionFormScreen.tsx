import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { showAlert, showConfirm } from '../utils/alert';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import {
  TextInput,
  Button,
  Text,
  useTheme,
  HelperText,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { RootStackParamList, Subscription } from '../types';
import { MAX_ADDRESS_LENGTH, MAX_DESCRIPTION_LENGTH, DEFAULT_CHAIN } from '../constants';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionForm'>;

/* ------------------------------------------------------------------ */
/*  表单屏幕（添加 / 编辑 共用）                                       */
/* ------------------------------------------------------------------ */

export default function SubscriptionFormScreen({ route, navigation }: Props) {
  const { mode, source, subscription } = route.params;
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const {
    state,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    saveProfile,
    updateProfile,
    deleteProfile,
  } = useAppContext();

  const isEdit = mode === 'edit';

  /* ---------- 表单状态 ---------- */
  const [address, setAddress] = useState(subscription?.address ?? '');
  const [description, setDescription] = useState(subscription?.description ?? '');
  const [errors, setErrors] = useState<{ address?: string; description?: string }>({});

  /* ---------- 校验 ---------- */
  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!address.trim()) {
      newErrors.address = t('form.addressRequired');
    } else if (address.length > MAX_ADDRESS_LENGTH) {
      newErrors.address = t('form.addressMaxLength', { max: MAX_ADDRESS_LENGTH });
    }

    if (!description.trim()) {
      newErrors.description = t('form.descriptionRequired');
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      newErrors.description = t('form.descriptionMaxLength', { max: MAX_DESCRIPTION_LENGTH });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [address, description, t]);

  /* ---------- 地址查重 ---------- */
  const checkDuplicate = useCallback((): Subscription | null => {
    if (isEdit) return null;
    const trimmed = address.trim().toLowerCase();
    if (!trimmed) return null;
    return state.subscriptions.find(
      (s) => s.address.toLowerCase() === trimmed,
    ) ?? null;
  }, [isEdit, address, state.subscriptions]);

  /* ---------- 保存 ---------- */
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    // 新增时检查地址是否已存在
    const duplicate = checkDuplicate();
    if (duplicate) {
      showAlert(
        t('common.tip'),
        t('form.addressDuplicate', { desc: duplicate.description }),
        [{ text: t('common.ok') }],
      );
      return;
    }

    const item: Subscription = {
      id: subscription?.id ?? Date.now().toString(),
      address: address.trim(),
      description: description.trim(),
      chain: subscription?.chain ?? DEFAULT_CHAIN,
    };

    if (source === 'subscriptions') {
      if (isEdit) {
        await updateSubscription(item);
      } else {
        await addSubscription(item);
      }
    } else {
      // profile
      if (isEdit) {
        await updateProfile(item);
      } else {
        await saveProfile(item);
      }
    }

    navigation.goBack();
  }, [
    address,
    description,
    subscription,
    source,
    isEdit,
    validate,
    checkDuplicate,
    addSubscription,
    updateSubscription,
    saveProfile,
    updateProfile,
    navigation,
  ]);

  /* ---------- 删除（仅编辑模式 + profile 来源） ---------- */
  const handleDelete = useCallback(() => {
    showConfirm(
      t('common.confirmDelete'),
      t('common.confirmDeleteMsg'),
      async () => {
        if (source === 'profile') {
          await deleteProfile();
        } else if (subscription) {
          await deleteSubscription(subscription.id);
        }
        navigation.goBack();
      },
      undefined,
      t('common.delete'),
      t('common.cancel'),
    );
  }, [source, subscription, deleteProfile, deleteSubscription, navigation, t]);

  /* ---------- 取消 ---------- */
  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  /* ---------- 渲染 ---------- */
  return (
    <ScrollView
      style={[scrollFill, styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, listContentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      <ListColumn>
      {/* 地址输入 */}
      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
      >
        {t('common.address')}
      </Text>
      <TextInput
        mode="outlined"
        label={t('form.addressPlaceholder')}
        value={address}
        onChangeText={(text) => {
          setAddress(text);
          if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
        }}
        maxLength={MAX_ADDRESS_LENGTH}
        autoFocus={mode === 'add'}
        error={!!errors.address}
        style={styles.input}
        outlineColor={theme.colors.outline}
        activeOutlineColor={theme.colors.primary}
      />
      <HelperText type="error" visible={!!errors.address}>
        {errors.address}
      </HelperText>
      <HelperText
        type="info"
        visible
        style={[styles.counter, { fontSize: Math.round(12 * fontScale) }]}
      >
        {address.length} / {MAX_ADDRESS_LENGTH}
      </HelperText>

      {/* 描述输入 */}
      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
      >
        {t('common.description')}
      </Text>
      <TextInput
        mode="outlined"
        label={t('form.descriptionPlaceholder')}
        value={description}
        onChangeText={(text) => {
          setDescription(text);
          if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
        }}
        maxLength={MAX_DESCRIPTION_LENGTH}
        multiline
        numberOfLines={2}
        error={!!errors.description}
        style={[styles.input, { textAlignVertical: 'top' }]}
        outlineColor={theme.colors.outline}
        activeOutlineColor={theme.colors.primary}
      />
      <HelperText type="error" visible={!!errors.description}>
        {errors.description}
      </HelperText>
      <HelperText
        type="info"
        visible
        style={[styles.counter, { fontSize: Math.round(12 * fontScale) }]}
      >
        {description.length} / {MAX_DESCRIPTION_LENGTH}
      </HelperText>

      {/* 操作按钮 */}
      <View style={styles.buttonGroup}>
        <Button
          mode="contained"
          onPress={handleSave}
          style={[styles.button, styles.primaryButton]}
          buttonColor={theme.colors.primary}
          contentStyle={styles.buttonContent}
        >
          {t('common.save')}
        </Button>

        <Button
          mode="outlined"
          onPress={handleCancel}
          style={[styles.button, styles.outlinedButton]}
          contentStyle={styles.buttonContent}
        >
          {t('common.cancel')}
        </Button>

        {isEdit && (
          <Button
            mode="outlined"
            onPress={handleDelete}
            style={[styles.button, styles.deleteButton]}
            textColor="#D32F2F"
            contentStyle={styles.buttonContent}
          >
            {t('common.delete')}
          </Button>
        )}
      </View>
      </ListColumn>
    </ScrollView>
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
    padding: 16,
    paddingBottom: 40,
  },
  fieldLabel: {
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    marginBottom: 0,
  },
  counter: {
    textAlign: 'right',
    fontSize: 12,
  },
  buttonGroup: {
    marginTop: 32,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
  primaryButton: {
    elevation: 2,
  },
  outlinedButton: {
    borderColor: '#BDBDBD',
  },
  deleteButton: {
    borderColor: '#D32F2F',
  },
  buttonContent: {
    paddingVertical: 4,
  },
});
