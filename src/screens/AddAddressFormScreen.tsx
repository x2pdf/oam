import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { showConfirm } from '../utils/alert';
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

type Props = NativeStackScreenProps<RootStackParamList, 'AddAddressForm'>;

/* ------------------------------------------------------------------ */
/*  添加地址表单（仅查询）                                              */
/* ------------------------------------------------------------------ */

export default function AddAddressFormScreen({ route, navigation }: Props) {
  const { mode, subscription } = route.params;
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const {
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

  /* ---------- 保存 ---------- */
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    const item: Subscription = {
      id: subscription?.id ?? Date.now().toString(),
      address: address.trim(),
      description: description.trim(),
      chain: subscription?.chain ?? DEFAULT_CHAIN,
      walletType: isEdit ? subscription?.walletType : 'read',
    };

    if (isEdit) {
      await updateProfile(item);
    } else {
      await saveProfile(item);
    }

    navigation.goBack();
  }, [
    address,
    description,
    subscription,
    isEdit,
    validate,
    saveProfile,
    updateProfile,
    navigation,
  ]);

  /* ---------- 删除 ---------- */
  const handleDelete = useCallback(() => {
    showConfirm(
      t('common.confirmDelete'),
      t('common.confirmDeleteMsg'),
      async () => {
        await deleteProfile();
        navigation.goBack();
      },
      undefined,
      t('common.delete'),
      t('common.cancel'),
    );
  }, [deleteProfile, navigation, t]);

  /* ---------- 取消 ---------- */
  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <ScrollView
      style={[scrollFill, styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, listContentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      <ListColumn>
      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
      >
        {t('common.address')}
      </Text>
      <TextInput
        mode="outlined"
        placeholder={t('form.addressPlaceholder')}
        value={address}
        onChangeText={(text) => {
          setAddress(text);
          if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
        }}
        maxLength={MAX_ADDRESS_LENGTH}
        multiline
        numberOfLines={3}
        scrollEnabled={false}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        autoFocus={mode === 'add'}
        error={!!errors.address}
        style={styles.input}
        contentStyle={[
          styles.addressContent,
          { fontSize: Math.round(13 * fontScale) },
          Platform.OS === 'web'
            ? ({ wordBreak: 'break-all', overflowWrap: 'anywhere' } as object)
            : null,
        ]}
        outlineColor={theme.colors.outline}
        activeOutlineColor={theme.colors.primary}
      />
      <HelperText type="error" visible={!!errors.address}>
        {errors.address}
      </HelperText>

      <Text
        variant="labelLarge"
        style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
      >
        {t('common.description')}
      </Text>
      <TextInput
        mode="outlined"
        placeholder={t('form.descriptionPlaceholder')}
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

      <View style={styles.buttonGroup}>
        <Button
          mode="contained"
          onPress={handleSave}
          style={styles.button}
        >
          {t('common.save')}
        </Button>
        <Button
          mode="outlined"
          onPress={handleCancel}
          style={styles.button}
        >
          {t('common.cancel')}
        </Button>
        {isEdit && (
          <Button
            mode="outlined"
            onPress={handleDelete}
            style={[styles.button, styles.deleteButton]}
            textColor="#D32F2F"
          >
            {t('common.delete')}
          </Button>
        )}
      </View>
      </ListColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  fieldLabel: {
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    marginBottom: 0,
    width: '100%',
    maxWidth: '100%',
  },
  addressContent: {
    minHeight: 56,
    textAlignVertical: 'top',
    paddingTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttonGroup: {
    marginTop: 32,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
  deleteButton: {
    borderColor: '#D32F2F',
  },
});
