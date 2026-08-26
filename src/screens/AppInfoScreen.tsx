import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Card, useTheme, Divider } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import appConfig from '../../app.json';

const APP_NAME = appConfig.expo.name;
const APP_FULL_NAME = appConfig.expo.description;
const APP_VERSION = appConfig.expo.version;

/* ------------------------------------------------------------------ */
/*  应用信息详情页                                                      */
/* ------------------------------------------------------------------ */

export default function AppInfoScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();

  const disclaimerItems = [
    {
      title: t('appInfo.disclaimerNotAdvice'),
      body: t('appInfo.disclaimerNotAdviceBody'),
    },
    {
      title: t('appInfo.disclaimerSecurity'),
      body: t('appInfo.disclaimerSecurityBody'),
    },
    {
      title: t('appInfo.disclaimerLegal'),
      body: t('appInfo.disclaimerLegalBody'),
    },
    {
      title: t('appInfo.disclaimerOnChain'),
      body: t('appInfo.disclaimerOnChainBody'),
    },
    {
      title: t('appInfo.disclaimerEncryption'),
      body: t('appInfo.disclaimerEncryptionBody'),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          {/* 应用基本信息 */}
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.appName, { color: theme.colors.primary }]}>
                {APP_NAME}
              </Text>
              {APP_FULL_NAME ? (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  {APP_FULL_NAME}
                </Text>
              ) : null}
              <View style={styles.infoRow}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('profile.appAuthor')}: Logan Cham
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('profile.appVersion')}: {APP_VERSION}
                </Text>
              </View>
            </Card.Content>
          </Card>

          {/* 免责声明 */}
          <View style={styles.sectionSpacer} />
          <Card
            style={[styles.card, { backgroundColor: theme.colors.errorContainer }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text
                variant="titleMedium"
                style={[styles.disclaimerTitle, { color: theme.colors.error }]}
              >
                {t('appInfo.disclaimerTitle')}
              </Text>

              <Text
                variant="bodyMedium"
                style={[styles.riskHint, { color: theme.colors.onErrorContainer }]}
              >
                {t('appInfo.disclaimerRiskHint')}
              </Text>

              <Divider style={[styles.divider, { borderColor: theme.colors.error + '30' }]} />

              {disclaimerItems.map((item, index) => (
                <View key={index} style={styles.disclaimerItem}>
                  <Text
                    variant="titleSmall"
                    style={[
                      styles.disclaimerItemTitle,
                      { color: theme.colors.onErrorContainer },
                    ]}
                  >
                    {index + 1}. {item.title}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.disclaimerItemBody,
                      { color: theme.colors.onErrorContainer },
                    ]}
                  >
                    {item.body}
                  </Text>
                </View>
              ))}

              <Divider style={[styles.divider, { borderColor: theme.colors.error + '30' }]} />

              <Text
                variant="bodyMedium"
                style={[
                  styles.agreeText,
                  { color: theme.colors.error },
                ]}
              >
                {t('appInfo.disclaimerAgree')}
              </Text>
            </Card.Content>
          </Card>
        </ListColumn>
      </ScrollView>
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
    padding: 20,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  appName: {
    fontWeight: '700',
  },
  infoRow: {
    marginTop: 8,
    gap: 4,
  },
  sectionSpacer: {
    height: 16,
  },
  disclaimerTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  riskHint: {
    lineHeight: 22,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 12,
  },
  disclaimerItem: {
    marginBottom: 14,
  },
  disclaimerItemTitle: {
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 20,
  },
  disclaimerItemBody: {
    lineHeight: 22,
  },
  agreeText: {
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
});
