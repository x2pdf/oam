import React, { useEffect, useRef } from 'react';
import {
  StyleProp,
  TextInput as RNTextInput,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { TextInput } from 'react-native-paper';

const CJK_SAFE_INPUT_PROPS = {
  keyboardType: 'default' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  autoComplete: 'off' as const,
  spellCheck: false,
  importantForAutofill: 'no' as const,
};

export type CjkSafeOutlinedTextInputProps = {
  placeholder?: string;
  /** Initial text; remount via resetKey when it must be replaced. */
  defaultValue?: string;
  /** Change to remount the native field (e.g. edit another filter). */
  resetKey: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<TextStyle>;
  outlineColor?: string;
  activeOutlineColor?: string;
};

/**
 * Paper outlined TextInput is controlled and re-runs chrome on every `value`
 * change, which cancels CJK composition on both iOS and Android (Fabric).
 * Keep a native uncontrolled field; sync Paper's internal value only on blur.
 *
 * Callers should keep style/contentStyle/onChangeText referentially stable
 * (useMemo / useCallback) so React.memo can skip re-renders while typing.
 */
function CjkSafeOutlinedTextInputImpl({
  placeholder,
  defaultValue = '',
  resetKey,
  onChangeText,
  maxLength,
  multiline = false,
  numberOfLines,
  error,
  style,
  contentStyle,
  outlineColor,
  activeOutlineColor,
}: CjkSafeOutlinedTextInputProps) {
  const draftRef = useRef(defaultValue);

  useEffect(() => {
    draftRef.current = defaultValue;
  }, [resetKey, defaultValue]);

  return (
    <TextInput
      key={resetKey}
      mode="outlined"
      placeholder={placeholder}
      defaultValue={defaultValue}
      maxLength={maxLength}
      multiline={multiline}
      numberOfLines={numberOfLines}
      error={error}
      style={style}
      contentStyle={contentStyle}
      outlineColor={outlineColor}
      activeOutlineColor={activeOutlineColor}
      {...CJK_SAFE_INPUT_PROPS}
      render={(props) => {
        const { value: _paperValue, onChangeText: paperOnChangeText, onBlur, ...rest } = props;
        return (
          <RNTextInput
            {...rest}
            {...CJK_SAFE_INPUT_PROPS}
            onChangeText={(text) => {
              draftRef.current = text;
              onChangeText(text);
            }}
            onBlur={(e) => {
              paperOnChangeText?.(draftRef.current);
              onBlur?.(e);
            }}
          />
        );
      }}
    />
  );
}

export const CjkSafeOutlinedTextInput = React.memo(
  CjkSafeOutlinedTextInputImpl,
  (prev, next) =>
    prev.resetKey === next.resetKey &&
    prev.defaultValue === next.defaultValue &&
    prev.placeholder === next.placeholder &&
    prev.onChangeText === next.onChangeText &&
    prev.maxLength === next.maxLength &&
    prev.multiline === next.multiline &&
    prev.numberOfLines === next.numberOfLines &&
    prev.error === next.error &&
    prev.style === next.style &&
    prev.contentStyle === next.contentStyle &&
    prev.outlineColor === next.outlineColor &&
    prev.activeOutlineColor === next.activeOutlineColor,
);
