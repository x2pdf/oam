import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { Text, Button, Checkbox, useTheme, Card, Snackbar } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemePreference } from '../../../context/ThemeContext';
import { generateArweaveWallet } from '../../wallet/client';
import { serializeJwk } from '../../wallet/jwk';
import { showAlert } from '../../../utils/alert';
import { copyJwk } from '../../wallet/backup/copyJwk';
import { buildJwkFilename } from '../../wallet/backup/buildJwkFilename';
import { saveJwkJson } from '../../wallet/backup/saveJwkJson';
import { useAppContext } from '../../../context/AppContext';
import { finalizeArWallet } from '../../wallet/finalizeWallet';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function JwkBackupScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const { state, saveArProfile } = useAppContext();
  const isReplacement = !!state.arProfile;

  const [jwkJson, setJwkJson] = useState('');
  const [address, setAddress] = useState('');
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const showSnackbar = useCallback((message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { jwk, address: addr } = await generateArweaveWallet();
        setJwkJson(serializeJwk(jwk));
        setAddress(addr);
      } catch (error) {
        console.error(error);
        showAlert(t('common.error'), t('arweave.generateFailed'));
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation, t]);

  const handleCopy = useCallback(async () => {
    if (!jwkJson) return;
    await copyJwk(jwkJson);
    showSnackbar(t('common.copied'));
  }, [jwkJson, showSnackbar, t]);

  const handleSaveFile = useCallback(async () => {
    if (!jwkJson || saving) return;
    setSaving(true);
    try {
      const status = await saveJwkJson(jwkJson, buildJwkFilename(address));
      if (status === 'saved') {
        showSnackbar(t('arweave.jwkBackupSaveSuccess'));
      } else {
        showSnackbar(t('arweave.jwkBackupSaveCancelled'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showSnackbar(t('arweave.jwkBackupSaveFailed', { message }));
    } finally {
      setSaving(false);
    }
  }, [address, jwkJson, saving, showSnackbar, t]);

  const handleContinue = async () => {
    if (finishing) return;
    if (isReplacement) {
      navigation.navigate('ArweavePasswordSetup', { jwk: jwkJson, address });
      return;
    }
    setFinishing(true);
    try {
      await finalizeArWallet(jwkJson, address, saveArProfile);
      showAlert(t('common.success'), t('arweave.setupSuccessSharedPassword'), [
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
          <Text variant="headlineSmall" style={styles.title}>{t('arweave.jwkBackupTitle')}</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>{t('arweave.jwkBackupSubtitle')}</Text>

          <Card style={styles.jwkCard} mode="contained">
            <Card.Content>
              <Text
                selectable
                style={[
                  styles.jwkText,
                  {
                    color: theme.colors.onSurface,
                    fontSize: Math.round(11 * fontScale),
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  },
                ]}
              >
                {loading ? t('common.loading') : jwkJson}
              </Text>
            </Card.Content>
          </Card>

          <View style={styles.actionRow}>
            <Button
              mode="outlined"
              icon="content-copy"
              onPress={handleCopy}
              disabled={loading || !jwkJson}
              style={styles.actionButton}
            >
              {t('arweave.jwkBackupCopy')}
            </Button>
            <Button
              mode="outlined"
              icon="file-export-outline"
              onPress={handleSaveFile}
              disabled={loading || !jwkJson || saving}
              style={styles.actionButton}
            >
              {t('arweave.jwkBackupSaveFile')}
            </Button>
          </View>

          <View
            style={[
              styles.warningBox,
              {
                backgroundColor: theme.colors.errorContainer,
                borderColor: theme.colors.error,
              },
            ]}
          >
            <Text style={[styles.warningText, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
              {t('arweave.jwkBackupWarning')}
            </Text>
            <Text style={[styles.warningText, styles.noExportWarning, { color: theme.colors.error, fontSize: Math.round(13 * fontScale) }]}>
              {t('arweave.jwkBackupNoExportWarning')}
            </Text>
          </View>

          <View style={styles.checkboxContainer}>
            <Checkbox.Android
              status={checked ? 'checked' : 'unchecked'}
              onPress={() => setChecked(!checked)}
              uncheckedColor={theme.colors.outline}
            />
            <Text
              variant="bodyMedium"
              style={styles.checkboxLabel}
              onPress={() => setChecked(!checked)}
            >
              {t('arweave.jwkBackupCheckbox')}
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={handleContinue}
            disabled={!checked || loading || !jwkJson || finishing}
            loading={finishing}
            style={styles.button}
          >
            {t('arweave.jwkBackupButton')}
          </Button>
        </ListColumn>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2500}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { marginBottom: 8, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { marginBottom: 24, textAlign: 'center', opacity: 0.8 },
  jwkCard: { marginBottom: 16, borderRadius: 12 },
  jwkText: { lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionButton: { flex: 1 },
  warningBox: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 24 },
  warningText: { lineHeight: 18, fontWeight: 'bold' },
  noExportWarning: { marginTop: 8 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  checkboxLabel: { flex: 1, marginLeft: 8 },
  button: { paddingVertical: 6 },
});
