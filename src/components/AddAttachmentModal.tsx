import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSource('arweave-id');
    setFileType('other');
    setInput('');
    setLabel('');
    setError(null);
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
    const trimmedLabel = label.trim();
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

      <TextInput
        mode="outlined"
        label={source === 'arweave-id' ? t('send.attachmentIdLabel') : t('send.attachmentUriLabel')}
        placeholder={placeholder}
        value={input}
        onChangeText={(value) => {
          setInput(value);
          setError(null);
        }}
        onBlur={() => setInput((value) => value.trim())}
        multiline
        numberOfLines={3}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        style={styles.uriInput}
        contentStyle={styles.uriContent}
      />
      <HelperText type="error" visible={!!(error || uriError)}>
        {error || uriError || ' '}
      </HelperText>

      <TextInput
        mode="outlined"
        label={t('send.attachmentLabel')}
        placeholder={t('send.attachmentLabelPlaceholder')}
        value={label}
        onChangeText={setLabel}
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
});
