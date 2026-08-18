import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, useTheme, Avatar } from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EthereumWalletManager } from '../wallet/walletManager';

type RoutePropType = RouteProp<RootStackParamList, 'PrivateKeyVerify'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function PrivateKeyVerifyScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { privateKey } = route.params;

  const walletInfo = useMemo(() => {
    try {
      return EthereumWalletManager.importFromPrivateKey(privateKey);
    } catch (e) {
      return null;
    }
  }, [privateKey]);

  const handleConfirm = () => {
    navigation.navigate('PrivateKeySetup', { privateKey });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Text variant="headlineSmall" style={styles.title}>{t('wallet.verifyTitle')}</Text>

        <Text variant="bodyMedium" style={styles.subtitle}>
          {t('wallet.verifySubtitle')}
        </Text>

        <Card style={styles.card} mode="elevated">
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon size={48} icon="wallet" />
              <View style={styles.textContainer}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('wallet.verifyLabel')}
                </Text>
                <Text variant="titleMedium" style={styles.addressText}>
                  {walletInfo?.address || t('common.failed')}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.infoBox}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('wallet.verifyTip')}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            style={styles.actionButton}
          >
            {t('wallet.verifyButtonBack')}
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            disabled={!walletInfo}
            style={styles.actionButton}
          >
            {t('wallet.verifyButtonConfirm')}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    marginBottom: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 32,
    textAlign: 'center',
    opacity: 0.8,
  },
  card: {
    marginBottom: 24,
    borderRadius: 12,
  },
  cardContent: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
  },
  addressText: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  infoBox: {
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
  },
});
