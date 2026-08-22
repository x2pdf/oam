import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Button, TextInput, useTheme, HelperText } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { validateMnemonic } from '../wallet/walletManager';
import { ethers } from 'ethers';
import { showAlert } from '../utils/alert';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const VALID_COUNTS = [12, 15, 18, 21, 24];

export default function MnemonicInputScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const [mnemonic, setMnemonic] = useState('');

  // 健壮的代码：使用正则表达式切割，处理多个空格，并过滤空字符串
  const words = useMemo(() => {
    return mnemonic.trim().split(/\s+/).filter(w => w.length > 0);
  }, [mnemonic]);

  // 检查 BIP39 单词合法性
  const invalidWords = useMemo(() => {
    if (words.length === 0) return [];
    const wordlist = ethers.wordlists.en;
    return words.filter(word => {
      try {
        return wordlist.getWordIndex(word.toLowerCase()) === -1;
      } catch (e) {
        return true;
      }
    });
  }, [words]);

  const wordCountValid = VALID_COUNTS.includes(words.length);

  const handleNext = () => {
    const trimmedMnemonic = words.join(' ');

    if (!wordCountValid) {
      showAlert(t('common.tip'), t('wallet.inputMnemonicCountInvalid', { count: words.length }));
      return;
    }

    if (!validateMnemonic(trimmedMnemonic)) {
      showAlert(t('common.error'), t('wallet.inputMnemonicInvalid'));
      return;
    }

    navigation.navigate('WalletVerify', { mnemonic: trimmedMnemonic });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle, { paddingBottom: insets.bottom + 20 }]}>
        <ListColumn>
        <Text variant="headlineSmall" style={styles.title}>{t('wallet.inputMnemonicTitle')}</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {t('wallet.inputMnemonicSubtitle')}
        </Text>

        <TextInput
          mode="outlined"
          multiline
          numberOfLines={6}
          placeholder={t('wallet.inputMnemonicPlaceholder')}
          value={mnemonic}
          onChangeText={setMnemonic}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          error={invalidWords.length > 0 || (words.length > 0 && !wordCountValid)}
        />

        <View style={styles.tipContainer}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('wallet.inputMnemonicTip')}
          </Text>
        </View>

        {/* 单词预览与校验区域 */}
        {words.length > 0 && (
          <View style={[styles.validationArea, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text variant="labelMedium" style={{ marginBottom: 8 }}>
              {t('wallet.inputMnemonicDetection', { count: words.length })}
            </Text>
            <View style={styles.wordCloud}>
              {words.map((word, index) => {
                const isInvalid = ethers.wordlists.en.getWordIndex(word.toLowerCase()) === -1;
                return (
                  <View
                    key={index}
                    style={[
                      styles.wordTag,
                      { backgroundColor: isInvalid ? theme.colors.errorContainer : theme.colors.surfaceVariant }
                    ]}
                  >
                    <Text
                      style={{
                        color: isInvalid ? theme.colors.error : theme.colors.onSurfaceVariant,
                        fontSize: 12
                      }}
                    >
                      {word}
                    </Text>
                  </View>
                );
              })}
            </View>

            {invalidWords.length > 0 && (
              <HelperText type="error" visible={true} style={{ paddingHorizontal: 0 }}>
                {t('wallet.inputMnemonicInvalid')}
              </HelperText>
            )}

            {!wordCountValid && words.length > 0 && (
              <HelperText type="info" visible={true} style={{ paddingHorizontal: 0, color: theme.colors.tertiary }}>
                {t('wallet.inputMnemonicCountInvalid', { count: words.length })}
              </HelperText>
            )}
          </View>
        )}

        <View style={styles.hintContainer}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('wallet.inputMnemonicCheck')}
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={handleNext}
          disabled={words.length === 0}
          style={styles.button}
        >
          {t('wallet.inputMnemonicButton')}
        </Button>
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
    padding: 20,
  },
  title: {
    marginBottom: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.8,
  },
  input: {
    marginBottom: 8,
    height: 150,
  },
  tipContainer: {
    marginBottom: 16,
  },
  validationArea: {
    marginBottom: 24,
    padding: 12,
    borderRadius: 8,
  },
  wordCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  wordTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  hintContainer: {
    marginBottom: 32,
  },
  button: {
    paddingVertical: 6,
  },
});
