import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Checkbox, useTheme, Card } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function PrivateKeyDisclaimerScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  const disclaimers = [
    t('wallet.privateKeyDisclaimer1'),
    t('wallet.privateKeyDisclaimer2'),
    t('wallet.privateKeyDisclaimer3'),
    t('wallet.privateKeyDisclaimer4'),
    t('wallet.privateKeyDisclaimer5'),
  ];

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
          onPress={() => navigation.navigate('PrivateKeyInput')}
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
