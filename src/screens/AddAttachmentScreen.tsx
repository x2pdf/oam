import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { RootStackParamList } from '../types';
import {
  ATTACHMENT_FILE_TYPES,
  AttachmentFileType,
  AttachmentSource,
  FILE_TYPE_TO_MIME,
  defaultLabelI18nKey,
  resolveAttachmentHref,
} from '../utils/attachment';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Always use the default keyboard for URI/ID fields.
 * - iOS: `url` is ASCII-only and can stick on the next field.
 * - Android: `url` maps to TYPE_TEXT_VARIATION_URI; OEM keyboards may still
 *   prefer Latin layout, and sibling re-renders can interrupt CJK IME on Fabric.
 */
const URI_INPUT_PROPS = {
  multiline: true,
  numberOfLines: 3,
  keyboardType: 'default' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  autoComplete: 'off' as const,
  spellCheck: false,
  importantForAutofill: 'no' as const,
};

const LABEL_INPUT_PROPS = {
  keyboardType: 'default' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  autoComplete: 'off' as const,
  spellCheck: false,
  importantForAutofill: 'no' as const,
};

type AttachmentUriInputProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
};

/** Isolated so label keystrokes do not re-render this multiline field (Fabric CJK IME on iOS/Android). */
const AttachmentUriInput = React.memo(function AttachmentUriInput({
  label,
  placeholder,
  value,
  onChangeText,
}: AttachmentUriInputProps) {
  return (
    <TextInput
      mode="outlined"
      label={label}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      {...URI_INPUT_PROPS}
      style={styles.uriInput}
      contentStyle={styles.uriContent}
    />
  );
});

type AttachmentLabelInputProps = {
  label: string;
  placeholder: string;
  resetKey: number;
  onChangeText: (value: string) => void;
};

/**
 * Paper's outlined TextInput is controlled and re-runs label animations on every
 * `value` change, which cancels CJK composition. Keep a native uncontrolled
 * field and only sync Paper after blur (IME already committed).
 */
const AttachmentLabelInput = React.memo(function AttachmentLabelInput({
  label,
  placeholder,
  resetKey,
  onChangeText,
}: AttachmentLabelInputProps) {
  const draftRef = useRef('');

  useEffect(() => {
    draftRef.current = '';
  }, [resetKey]);

  return (
    <TextInput
      key={resetKey}
      mode="outlined"
      label={label}
      placeholder={placeholder}
      defaultValue=""
      {...LABEL_INPUT_PROPS}
      render={(props) => {
        const { value: _paperValue, onChangeText: paperOnChangeText, onBlur, ...rest } = props;
        return (
          <RNTextInput
            {...rest}
            {...LABEL_INPUT_PROPS}
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
});

const SOURCE_OPTIONS: { value: AttachmentSource; labelKey: string; icon: string }[] = [
  { value: 'arweave-id', labelKey: 'send.attachmentSourceArweaveId', icon: 'identifier' },
  { value: 'arweave-uri', labelKey: 'send.attachmentSourceArweaveUri', icon: 'link' },
  { value: 'uri', labelKey: 'send.attachmentSourceUri', icon: 'web' },
];

type SelectionChipButtonProps = {
  selected: boolean;
  onPress: () => void;
  label: string;
  icon?: string;
};

function SelectionChipButton({ selected, onPress, label, icon }: SelectionChipButtonProps) {
  const theme = useTheme();

  return (
    <Button
      mode="outlined"
      compact
      icon={icon}
      onPress={onPress}
      buttonColor={selected ? theme.colors.primary : undefined}
      textColor={selected ? theme.colors.onPrimary : theme.colors.onSurface}
      style={[
        styles.typeButton,
        { borderColor: selected ? theme.colors.primary : theme.colors.outline },
      ]}
      labelStyle={styles.typeLabel}
    >
      {label}
    </Button>
  );
}

export default function AddAttachmentScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const [source, setSource] = useState<AttachmentSource>('arweave-id');
  const [fileType, setFileType] = useState<AttachmentFileType>('other');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [labelResetKey] = useState(0);
  const labelRef = useRef('');

  const uriError = useMemo(() => {
    if (source === 'arweave-id' || !input.trim()) return null;
    const resolved = resolveAttachmentHref(source, input);
    if (resolved.ok) return null;
    if (resolved.error === 'invalid-url') return t('send.attachmentInvalidUrl');
    return null;
  }, [input, source, t]);

  const placeholder =
    source === 'arweave-id' ? t('send.attachmentIdPlaceholder') : t('send.attachmentUriPlaceholder');

  const uriFieldLabel =
    source === 'arweave-id' ? t('send.attachmentIdLabel') : t('send.attachmentUriLabel');

  const handleUriChange = useCallback((value: string) => {
    setInput(value);
    setError(null);
  }, []);

  const handleLabelChange = useCallback((value: string) => {
    labelRef.current = value;
  }, []);

  const handleConfirm = () => {
    const trimmedInput = input.trim();
    if (trimmedInput !== input) setInput(trimmedInput);

    const resolved = resolveAttachmentHref(source, trimmedInput);
    if (!resolved.ok) {
      if (resolved.error === 'empty') {
        setError(
          source === 'arweave-id' ? t('send.attachmentEmptyId') : t('send.attachmentEmptyUri'),
        );
      } else if (resolved.error === 'invalid-id') {
        setError(t('send.attachmentInvalidId'));
      } else {
        setError(t('send.attachmentInvalidUrl'));
      }
      return;
    }

    const mime = FILE_TYPE_TO_MIME[fileType];
    const trimmedLabel = labelRef.current.trim();
    navigation.navigate({
      name: 'SendData',
      params: {
        pendingAttachment: {
          source,
          fileType,
          input: trimmedInput,
          href: resolved.href,
          mime,
          label: trimmedLabel || t(defaultLabelI18nKey(fileType)),
          arId: resolved.arId,
        },
        pendingAttachmentNonce: Date.now(),
      },
      merge: true,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[
          styles.content,
          listContentStyle,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ListColumn>
          <Text variant="labelLarge" style={[styles.fieldLabel, { color: theme.colors.onSurface }]}>
            {t('send.attachmentSource')}
          </Text>
          <View style={styles.chipWrap}>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectionChipButton
                key={opt.value}
                selected={source === opt.value}
                icon={opt.icon}
                onPress={() => {
                  setSource(opt.value);
                  setError(null);
                }}
                label={t(opt.labelKey)}
              />
            ))}
          </View>

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, styles.section, { color: theme.colors.onSurface }]}
          >
            {t('send.attachmentFileType')}
          </Text>
          <View style={styles.chipWrap}>
            {ATTACHMENT_FILE_TYPES.map((type) => (
              <SelectionChipButton
                key={type}
                selected={fileType === type}
                onPress={() => setFileType(type)}
                label={t(`send.attachmentType.${type}`)}
              />
            ))}
          </View>

          <AttachmentUriInput
            label={uriFieldLabel}
            placeholder={placeholder}
            value={input}
            onChangeText={handleUriChange}
          />
          {source === 'arweave-id' && (
            <HelperText type="info" visible style={{ paddingHorizontal: 0 }}>
              {t('send.attachmentIdHint')}
            </HelperText>
          )}
          <HelperText type="error" visible={!!(error || uriError)}>
            {error || uriError || ' '}
          </HelperText>

          <AttachmentLabelInput
            resetKey={labelResetKey}
            label={t('send.attachmentLabel')}
            placeholder={t('send.attachmentLabelPlaceholder')}
            onChangeText={handleLabelChange}
          />

          <View style={styles.buttonGroup}>
            <Button mode="contained" onPress={handleConfirm} style={styles.button}>
              {t('common.confirm')}
            </Button>
            <Button mode="outlined" onPress={() => navigation.goBack()} style={styles.button}>
              {t('common.cancel')}
            </Button>
          </View>
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
    padding: 16,
  },
  fieldLabel: {
    marginBottom: 4,
    fontWeight: '600',
  },
  section: {
    marginTop: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    borderRadius: 6,
  },
  typeLabel: {
    fontSize: 12,
    marginVertical: 2,
    marginHorizontal: 6,
  },
  uriInput: {
    minHeight: 88,
  },
  uriContent: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  buttonGroup: {
    marginTop: 32,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
});
