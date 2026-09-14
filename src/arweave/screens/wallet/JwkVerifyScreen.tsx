import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { Text, Button, Card, useTheme, Avatar } from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../../context/AppContext';
import { finalizeArWallet } from '../../wallet/finalizeWallet';
import { showAlert } from '../../../utils/alert';

type RoutePropType = RouteProp<RootStackParamList, 'ArweaveJwkVerify'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function JwkVerifyScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const { saveArProfile } = useAppContext();
  const { jwk, address } = route.params;
  const [finishing, setFinishing] = useState(false);

  const handleConfirm = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await finalizeArWallet(jwk, address, saveArProfile);
      showAlert(t('common.success'), t('arweave.importSuccessSharedPassword'), [
        {
          text: t('common.ok'),
          onPress: () => navigation.reset({
            index: 1,
            routes: [{ name: 'MainTabs' }, { name: 'ArweaveProfile' }],
          }),
        },
      ]);
    } catch (error) {
      console.error(error);
      showAlert(t('common.failed'), t('arweave.setupFailed'));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          <Text variant="headlineSmall" style={styles.title}>{t('arweave.jwkVerifyTitle')}</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>{t('arweave.jwkVerifySubtitle')}</Text>

          <Card style={styles.card} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.row}>
                <Avatar.Icon size={48} icon="wallet" />
                <View style={styles.textContainer}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('arweave.jwkVerifyLabel')}
                  </Text>
                  <Text variant="titleMedium" style={styles.addressText}>{address}</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <View style={styles.infoBox}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('arweave.jwkVerifyTip')}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={() => navigation.goBack()}
              disabled={finishing}
              style={styles.actionButton}
            >
              {t('arweave.jwkVerifyButtonBack')}
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirm}
              loading={finishing}
              disabled={finishing}
              style={styles.actionButton}
            >
              {t('arweave.jwkVerifyButtonConfirm')}
            </Button>
          </View>
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { marginBottom: 8, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { marginBottom: 32, textAlign: 'center', opacity: 0.8 },
  card: { marginBottom: 24, borderRadius: 12 },
  cardContent: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  textContainer: { flex: 1, marginLeft: 16 },
  addressText: { marginTop: 4, fontSize: 13, fontFamily: 'monospace' },
  infoBox: { marginBottom: 40, paddingHorizontal: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButton: { width: '48%' },
});
