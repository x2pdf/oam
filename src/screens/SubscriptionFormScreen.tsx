import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  TextInput,
  Button,
  Text,
  useTheme,
  HelperText,
} from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppContext } from '../context/AppContext';
import { RootStackParamList, Subscription } from '../types';
import { MAX_ADDRESS_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionForm'>;

/* ------------------------------------------------------------------ */
/*  表单屏幕（添加 / 编辑 共用）                                       */
/* ------------------------------------------------------------------ */

export default function SubscriptionFormScreen({ route, navigation }: Props) {
  const { mode, source, subscription } = route.params;
  const theme = useTheme();
  const {
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
      newErrors.address = '地址不能为空';
    } else if (address.length > MAX_ADDRESS_LENGTH) {
      newErrors.address = `地址不能超过 ${MAX_ADDRESS_LENGTH} 个字符`;
    }

    if (!description.trim()) {
      newErrors.description = '描述不能为空';
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      newErrors.description = `描述不能超过 ${MAX_DESCRIPTION_LENGTH} 个字符`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [address, description]);

  /* ---------- 保存 ---------- */
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    const item: Subscription = {
      id: subscription?.id ?? Date.now().toString(),
      address: address.trim(),
      description: description.trim(),
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
    addSubscription,
    updateSubscription,
    saveProfile,
    updateProfile,
    navigation,
  ]);

  /* ---------- 删除（仅编辑模式 + profile 来源） ---------- */
  const handleDelete = useCallback(() => {
    Alert.alert('确认删除', '确定要删除这条信息吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          if (source === 'profile') {
            await deleteProfile();
          } else if (subscription) {
            await deleteSubscription(subscription.id);
          }
          navigation.goBack();
        },
      },
    ]);
  }, [source, subscription, deleteProfile, deleteSubscription, navigation]);

  /* ---------- 取消 ---------- */
  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  /* ---------- 渲染 ---------- */
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* 地址输入 */}
      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
      >
        地址
      </Text>
      <TextInput
        mode="outlined"
        label="请输入地址"
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
        style={styles.counter}
      >
        {address.length} / {MAX_ADDRESS_LENGTH}
      </HelperText>

      {/* 描述输入 */}
      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
      >
        描述
      </Text>
      <TextInput
        mode="outlined"
        label="请输入描述"
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
        style={styles.counter}
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
          保存
        </Button>

        <Button
          mode="outlined"
          onPress={handleCancel}
          style={[styles.button, styles.outlinedButton]}
          contentStyle={styles.buttonContent}
        >
          取消
        </Button>

        {isEdit && (
          <Button
            mode="outlined"
            onPress={handleDelete}
            style={[styles.button, styles.deleteButton]}
            textColor="#D32F2F"
            contentStyle={styles.buttonContent}
          >
            删除
          </Button>
        )}
      </View>
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
