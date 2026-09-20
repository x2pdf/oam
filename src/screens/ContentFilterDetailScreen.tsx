import React, { useLayoutEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ContentFilterRule, RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { getHeaderChrome } from '../theme';
import { useOutlineFrameStyle } from '../theme/surfaces';

type Props = NativeStackScreenProps<RootStackParamList, 'ContentFilterDetail'>;

export default function ContentFilterDetailScreen({ route, navigation }: Props) {
  const { filter: routeFilter } = route.params;
  const theme = useTheme();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const outlineFrameStyle = useOutlineFrameStyle();
  const { state } = useAppContext();

  const filter: ContentFilterRule = useMemo(
    () => state.contentFilters.find((f) => f.id === routeFilter.id) ?? routeFilter,
    [state.contentFilters, routeFilter],
  );

  const matchTypeLabel = (() => {
    switch (filter.matchType) {
      case 'text':
        return t('contentFilters.matchTypeText');
      case 'regex':
        return t('contentFilters.matchTypeRegex');
      case 'address':
        return t('contentFilters.matchTypeAddress');
      case 'image':
        return t('contentFilters.matchTypeImage');
    }
  })();

  const matchExpressionLabel = (() => {
    switch (filter.matchType) {
      case 'regex':
        return t('form.matchExpressionLabelRegex');
      case 'address':
        return t('form.matchExpressionLabelAddress');
      case 'text':
      case 'image':
      default:
        return t('form.matchExpressionLabelText');
    }
  })();

  useLayoutEffect(() => {
    const headerChrome = getHeaderChrome(theme);
    navigation.setOptions({
      title: filter.description || t('nav.contentFilterDetail'),
      headerRight: () => (
        <IconButton
          icon="pencil-outline"
          iconColor={headerChrome.tintColor}
          size={22}
          onPress={() =>
            navigation.navigate('ContentFilterForm', {
              mode: 'edit',
              filter,
            })
          }
        />
      ),
    });
  }, [navigation, filter, t, theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle]}>
        <ListColumn>
          <View style={outlineFrameStyle}>
            <View style={styles.frameInner}>
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
              >
                {t('form.matchType')}
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {matchTypeLabel}
              </Text>

              <Text
                variant="labelMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 16,
                  marginBottom: 4,
                }}
              >
                {matchExpressionLabel}
              </Text>
              <Text
                variant="bodyLarge"
                style={[styles.expression, { color: theme.colors.onSurface }]}
              >
                {filter.matchExpression}
              </Text>

              <Text
                variant="labelMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 16,
                  marginBottom: 4,
                }}
              >
                {t('common.description')}
              </Text>
              <Text
                variant="titleMedium"
                style={[styles.fieldValue, { color: theme.colors.onSurface }]}
              >
                {filter.description}
              </Text>
            </View>
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
    paddingBottom: 40,
  },
  frameInner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fieldValue: {
    fontWeight: '700',
  },
  expression: {
    fontFamily: 'monospace',
  },
});
