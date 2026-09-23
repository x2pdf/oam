import React from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  TextInput,
  TextStyle,
} from 'react-native';
import { Text, useTheme } from 'react-native-paper';

type TextVariant =
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'displayLarge'
  | 'displayMedium'
  | 'displaySmall'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall';

interface SelectableTextProps {
  value: string;
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}

// react-native-paper Text variant 的近似字号/行高，用于在 TextInput 中保持视觉一致
const VARIANT_STYLES: Record<TextVariant, TextStyle> = {
  bodyLarge: { fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontSize: 14, lineHeight: 20 },
  bodySmall: { fontSize: 12, lineHeight: 16 },
  displayLarge: { fontSize: 57, lineHeight: 64 },
  displayMedium: { fontSize: 45, lineHeight: 52 },
  displaySmall: { fontSize: 36, lineHeight: 44 },
  headlineLarge: { fontSize: 32, lineHeight: 40 },
  headlineMedium: { fontSize: 28, lineHeight: 36 },
  headlineSmall: { fontSize: 24, lineHeight: 32 },
  labelLarge: { fontSize: 14, lineHeight: 20 },
  labelMedium: { fontSize: 12, lineHeight: 16 },
  labelSmall: { fontSize: 11, lineHeight: 16 },
  titleLarge: { fontSize: 22, lineHeight: 28 },
  titleMedium: { fontSize: 16, lineHeight: 24 },
  titleSmall: { fontSize: 14, lineHeight: 20 },
};

/**
 * 在 iOS/Android 使用只读多行 TextInput 实现稳定的文本选择（长按/双击后拖动选择部分文本并复制）。
 * web 端回退到 Paper Text 的 selectable，保留鼠标选择体验。
 */
export const SelectableText: React.FC<SelectableTextProps> = ({
  value,
  variant = 'bodyMedium',
  style,
  numberOfLines,
  selectable = true,
}) => {
  const theme = useTheme();

  if (!selectable || Platform.OS === 'web') {
    return (
      <Text variant={variant} style={style} selectable={selectable} numberOfLines={numberOfLines}>
        {value}
      </Text>
    );
  }

  const variantStyle = VARIANT_STYLES[variant] ?? VARIANT_STYLES.bodyMedium;

  return (
    <TextInput
      value={value}
      multiline
      readOnly
      scrollEnabled={false}
      showSoftInputOnFocus={false}
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="none"
      importantForAutofill="no"
      underlineColorAndroid="transparent"
      textAlignVertical="top"
      numberOfLines={numberOfLines}
      style={[
        styles.input,
        {
          color: theme.colors.onSurface,
          ...variantStyle,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 0,
  },
});
