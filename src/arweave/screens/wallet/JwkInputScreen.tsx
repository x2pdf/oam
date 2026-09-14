import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { Text, TextInput, Button, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseJwkInput, validateJwk } from '../../wallet/jwk';
import { serializeJwk } from '../../wallet/jwk';
import { showAlert } from '../../../utils/alert';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function JwkInputScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    const parsed = parseJwkInput(input);
    if (!parsed.ok) {
      showAlert(t('common.error'), t('arweave.jwkInputInvalid'));
      return;
    }

    setLoading(true);
    try {
      const result = await validateJwk(parsed.jwk);
      if (!result.ok) {
        showAlert(t('common.error'), t('arweave.jwkInputInvalid'));
        return;
      }
      navigation.navigate('ArweaveJwkVerify', {
        jwk: serializeJwk(parsed.jwk),
        address: result.address,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          <Text variant="headlineSmall" style={styles.title}>{t('arweave.jwkInputTitle')}</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>{t('arweave.jwkInputSubtitle')}</Text>

          <TextInput
            label={t('arweave.jwkInputLabel')}
            value={input}
            onChangeText={setInput}
            mode="outlined"
            multiline
            numberOfLines={8}
            placeholder={t('arweave.jwkInputPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <View style={styles.hintBox}>
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              {t('arweave.jwkInputWarning')}
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={handleNext}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={{ height: 48 }}
          >
            {t('arweave.jwkInputButton')}
          </Button>
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  title: { marginBottom: 8, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { marginBottom: 24, textAlign: 'center', opacity: 0.8 },
  input: { marginBottom: 16 },
  hintBox: { marginBottom: 32 },
  button: { marginTop: 8 },
});
