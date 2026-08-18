import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Checkbox, useTheme, Card } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function WalletDisclaimerScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  const disclaimers = [
    t('wallet.privateKeyDisclaimer5'), // Reusing some strings or mapping new ones
    '我理解如果我丢失了助记词，我将无法找回我的资产。',
    '我理解任何人如果获得了我的助记词，就可以完全控制并转移我的资产。',
    '我知晓应用不会在任何服务器上存储我的助记词或私钥，它们仅安全地存储在我的设备本地。',
    '我明白如果卸载应用且没有备份助记词，我的钱包数据将会永久丢失。',
  ];

  // Actually, I defined these in en.json/zh.json but I should use them.
  // Let's re-read the json to be sure.

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Text variant="headlineSmall" style={styles.title}>{t('wallet.privateKeyDisclaimerTitle')}</Text>

        <Card style={styles.card} mode="outlined">
          <Card.Content>
            {disclaimers.map((item, index) => (
              <View key={index} style={styles.disclaimerItem}>
                <Text variant="bodyLarge" style={styles.bullet}>•</Text>
                <Text variant="bodyMedium" style={styles.text}>{item}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        <View style={styles.checkboxContainer}>
          <Checkbox
            status={checked ? 'checked' : 'unchecked'}
            onPress={() => setChecked(!checked)}
          />
          <Text
            variant="bodyMedium"
            style={styles.checkboxLabel}
            onPress={() => setChecked(!checked)}
          >
            {t('wallet.privateKeyDisclaimerCheckbox')}
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={() => navigation.navigate('MnemonicBackup')}
          disabled={!checked}
          style={styles.button}
        >
          {t('wallet.privateKeyDisclaimerButton')}
        </Button>
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
    marginBottom: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  card: {
    marginBottom: 24,
    borderRadius: 12,
  },
  disclaimerItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  bullet: {
    marginRight: 10,
    fontSize: 20,
  },
  text: {
    flex: 1,
    lineHeight: 22,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    paddingRight: 20,
  },
  checkboxLabel: {
    flex: 1,
    marginLeft: 8,
  },
  button: {
    paddingVertical: 6,
  },
});
