import React, { useCallback } from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { Text, Card, useTheme, Snackbar } from 'react-native-paper';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { AddressWithActions } from '../components/AddressWithActions';
import { RichContentRenderer } from '../components/RichContentRenderer';
import { CONTENT_KIND_I18N_KEY } from '../display';

type RouteProps = RouteProp<RootStackParamList, 'InputDataDetail'>;

export default function InputDataDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const { item } = route.params;
  const [snackbarVisible, setSnackbarVisible] = React.useState(false);

  const kind = item.contentKind ?? 'RAW';
  const rawHex = item.rawInput || item.description || '';

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarVisible(true);
  }, []);

  const renderBody = () => {
    if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
      return <RichContentRenderer items={item.oampItems} />;
    }

    if (kind === 'UTF-8' && item.textContent) {
      return (
        <Text variant="bodyMedium" style={styles.contentText}>
          {item.textContent}
        </Text>
      );
    }

    return (
      <View>
        {kind === 'OAMP_ENCRYPTED' ? (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}
          >
            {t('home.encryptedHint')}
          </Text>
        ) : null}
        <Text variant="bodyMedium" style={styles.rawHexText} selectable>
          {rawHex}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.metaRow}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('detail.txHash')}
              </Text>
              <Text variant="bodySmall" style={styles.monoText} selectable>
                {item.id}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('detail.time')}
              </Text>
              <Text variant="bodyMedium">{item.lastActive}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('detail.type')}
              </Text>
              <Text
                variant="labelSmall"
                style={[
                  styles.kindBadge,
                  { color: theme.colors.primary, borderColor: theme.colors.outline },
                ]}
              >
                {t(CONTENT_KIND_I18N_KEY[kind])}
              </Text>
            </View>

            {item.balance ? (
              <View style={styles.metaRow}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('detail.value')}
                </Text>
                <Text variant="bodyMedium">{item.balance}</Text>
              </View>
            ) : null}
          </Card.Content>
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              {t('detail.addresses')}
            </Text>
            {item.from ? (
              <AddressWithActions
                address={item.from}
                label={t('detail.from')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            ) : null}
            {item.to ? (
              <AddressWithActions
                address={item.to}
                label={t('detail.to')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            ) : null}
            {!item.from && !item.to ? (
              <AddressWithActions
                address={item.address}
                label={t('common.address')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            ) : null}
          </Card.Content>
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              {t('detail.content')}
            </Text>
            {renderBody()}
          </Card.Content>
        </Card>
      </ScrollView>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  metaRow: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginTop: 4,
  },
  kindBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  contentText: {
    lineHeight: 22,
  },
  rawHexText: {
    lineHeight: 20,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
