import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { AppModal } from './AppModal';
import { SendDraftAttachment } from '../types';
import {
  ATTACHMENT_FILE_TYPES,
  AttachmentFileType,
  AttachmentSource,
  FILE_TYPE_TO_MIME,
  defaultLabelI18nKey,
  resolveAttachmentHref,
} from '../utils/attachment';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (attachment: SendDraftAttachment) => void;
};

/**
 * Always use the default keyboard for URI/ID fields.
 * - iOS: `url` is ASCII-only and can stick on the next field in the same modal.
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
  multiline: true,
  numberOfLines: 2,
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
      style={styles.labelInput}
      contentStyle={styles.labelContent}
      render={(props) => {
        const { value: _paperValue, onChangeText: paperOnChangeText, onBlur, ...rest } = props;
        return (
          <RNTextInput
            {...rest}
            {...LABEL_INPUT_PROPS}
            style={[rest.style, styles.labelNative]}
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

export function AddAttachmentModal({ visible, onDismiss, onConfirm }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [source, setSource] = useState<AttachmentSource>('arweave-id');
  const [fileType, setFileType] = useState<AttachmentFileType>('other');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [labelResetKey, setLabelResetKey] = useState(0);
  const labelRef = useRef('');

  useEffect(() => {
    if (!visible) return;
    setSource('arweave-id');
    setFileType('other');
    setInput('');
    labelRef.current = '';
    setError(null);
    setLabelResetKey((key) => key + 1);
  }, [visible]);

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

  const attachmentLabelText = t('send.attachmentLabel');
  const attachmentLabelPlaceholder = t('send.attachmentLabelPlaceholder');

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
    onConfirm({
      source,
      fileType,
      input: trimmedInput,
      href: resolved.href,
      mime,
      label: trimmedLabel || t(defaultLabelI18nKey(fileType)),
      arId: resolved.arId,
    });
  };

  return (
    <AppModal
      visible={visible}
      title={t('send.addAttachment')}
      onDismiss={onDismiss}
      scrollable
      actions={[
        { label: t('common.cancel'), onPress: onDismiss, mode: 'text' },
        { label: t('common.confirm'), onPress: handleConfirm, mode: 'contained' },
      ]}
    >
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

      <Text variant="labelLarge" style={[styles.fieldLabel, styles.section, { color: theme.colors.onSurface }]}>
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
        label={attachmentLabelText}
        placeholder={attachmentLabelPlaceholder}
        onChangeText={handleLabelChange}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
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
  labelInput: {
    minHeight: 68,
  },
  labelContent: {
    minHeight: 52,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  labelNative: {
    minHeight: 52,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
});
