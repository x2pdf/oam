import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import {
  ContentFilterMatchType,
  ContentFilterRule,
  contentFilterDedupeKey,
  RootStackParamList,
} from '../types';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_MATCH_EXPRESSION_LENGTH,
} from '../constants';

type Props = NativeStackScreenProps<RootStackParamList, 'ContentFilterForm'>;

/** 新建/编辑表单可选的匹配类型 */
const SELECTABLE_MATCH_TYPES: ContentFilterMatchType[] = [
  'text',
  'regex',
  'address',
  // TODO: 'image' — 等本地 AI 对图片暴力、成人内容识别更准确且更快后再开放
];

function MatchTypeChip({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Button
      mode="outlined"
      compact
      onPress={onPress}
      buttonColor={selected ? theme.colors.primary : undefined}
      textColor={selected ? theme.colors.onPrimary : theme.colors.onSurface}
      style={[
        styles.chip,
        { borderColor: selected ? theme.colors.primary : theme.colors.outline },
      ]}
      labelStyle={styles.chipLabel}
    >
      {label}
    </Button>
  );
}

function matchTypeI18nKey(matchType: ContentFilterMatchType): string {
  switch (matchType) {
    case 'text':
      return 'contentFilters.matchTypeText';
    case 'regex':
      return 'contentFilters.matchTypeRegex';
    case 'address':
      return 'contentFilters.matchTypeAddress';
    case 'image':
      return 'contentFilters.matchTypeImage';
  }
}

export default function ContentFilterFormScreen({ route, navigation }: Props) {
  const { mode, filter } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useThemePreference();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const {
    state,
    addContentFilter,
    updateContentFilter,
    deleteContentFilter,
  } = useAppContext();

  const isEdit = mode === 'edit';

  const [description, setDescription] = useState(filter?.description ?? '');
  const [matchType, setMatchType] = useState<ContentFilterMatchType>(
    filter?.matchType ?? 'text',
  );
  const [matchExpression, setMatchExpression] = useState(filter?.matchExpression ?? '');
  const [errors, setErrors] = useState<{
    description?: string;
    matchType?: string;
    matchExpression?: string;
  }>({});

  const validate = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!description.trim()) {
      newErrors.description = t('form.descriptionRequired');
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      newErrors.description = t('form.descriptionMaxLength', { max: MAX_DESCRIPTION_LENGTH });
    }

    if (!matchExpression.trim()) {
      newErrors.matchExpression = t('form.matchExpressionRequired');
    } else if (matchExpression.length > MAX_MATCH_EXPRESSION_LENGTH) {
      newErrors.matchExpression = t('form.matchExpressionMaxLength', {
        max: MAX_MATCH_EXPRESSION_LENGTH,
      });
    } else if (matchType === 'regex') {
      try {
        // eslint-disable-next-line no-new
        new RegExp(matchExpression.trim());
      } catch {
        newErrors.matchExpression = t('form.matchExpressionInvalidRegex');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [description, matchExpression, matchType, t]);

  const checkDuplicate = useCallback((): ContentFilterRule | null => {
    if (isEdit && filter) {
      const key = contentFilterDedupeKey(matchType, matchExpression);
      const selfKey = contentFilterDedupeKey(filter.matchType, filter.matchExpression);
      if (key === selfKey) return null;
    }
    const key = contentFilterDedupeKey(matchType, matchExpression);
    return (
      state.contentFilters.find(
        (f) => contentFilterDedupeKey(f.matchType, f.matchExpression) === key,
      ) ?? null
    );
  }, [isEdit, filter, matchType, matchExpression, state.contentFilters]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;

    const duplicate = checkDuplicate();
    if (duplicate) {
      showAlert(
        t('common.tip'),
        t('form.filterDuplicate', { desc: duplicate.description }),
        [{ text: t('common.ok') }],
      );
      return;
    }

    const item: ContentFilterRule = {
      id: filter?.id ?? Date.now().toString(),
      description: description.trim(),
      matchType,
      matchExpression: matchExpression.trim(),
    };

    if (isEdit) {
      await updateContentFilter(item);
    } else {
      await addContentFilter(item);
    }

    navigation.goBack();
  }, [
    validate,
    checkDuplicate,
    filter?.id,
    description,
    matchType,
    matchExpression,
    isEdit,
    updateContentFilter,
    addContentFilter,
    navigation,
    t,
  ]);

  const handleDelete = useCallback(() => {
    if (!filter) return;
    showConfirm(
      t('common.confirmDelete'),
      t('common.confirmDeleteMsg'),
      async () => {
        await deleteContentFilter(filter.id);
        navigation.goBack();
      },
      undefined,
      t('common.delete'),
      t('common.cancel'),
    );
  }, [filter, deleteContentFilter, navigation, t]);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={[scrollFill, styles.container]}
        contentContainerStyle={[
          styles.content,
          listContentStyle,
          { paddingBottom: insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ListColumn>
          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface }]}
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
          <HelperText
            type="info"
            visible
            style={[styles.counter, { fontSize: Math.round(12 * fontScale) }]}
          >
            {description.length} / {MAX_DESCRIPTION_LENGTH}
          </HelperText>

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
          >
            {t('form.matchType')}
          </Text>
          <View style={styles.chipWrap}>
            {SELECTABLE_MATCH_TYPES.map((type) => (
              <MatchTypeChip
                key={type}
                selected={matchType === type}
                label={t(matchTypeI18nKey(type))}
                onPress={() => setMatchType(type)}
              />
            ))}
          </View>
          {matchType === 'image' ? (
            <HelperText type="info" visible>
              {t('contentFilters.matchTypeImage')}
            </HelperText>
          ) : null}

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, { color: theme.colors.onSurface, marginTop: 8 }]}
          >
            {t('form.matchExpression')}
          </Text>
          <TextInput
            mode="outlined"
            placeholder={t('form.matchExpressionPlaceholder')}
            value={matchExpression}
            onChangeText={(text) => {
              setMatchExpression(text);
              if (errors.matchExpression) {
                setErrors((prev) => ({ ...prev, matchExpression: undefined }));
              }
            }}
            maxLength={MAX_MATCH_EXPRESSION_LENGTH}
            multiline
            numberOfLines={4}
            error={!!errors.matchExpression}
            style={styles.input}
            contentStyle={[
              { fontSize: Math.round(13 * fontScale) },
              Platform.OS === 'web'
                ? ({ wordBreak: 'break-all', overflowWrap: 'anywhere' } as object)
                : null,
            ]}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
          />
          <HelperText type="error" visible={!!errors.matchExpression}>
            {errors.matchExpression}
          </HelperText>
          <HelperText
            type="info"
            visible
            style={[styles.counter, { fontSize: Math.round(12 * fontScale) }]}
          >
            {matchExpression.length} / {MAX_MATCH_EXPRESSION_LENGTH}
          </HelperText>

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
    </View>
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 6,
  },
  chipLabel: {
    fontSize: 12,
    marginVertical: 2,
    marginHorizontal: 6,
  },
  input: {
    marginBottom: 0,
    width: '100%',
    maxWidth: '100%',
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
