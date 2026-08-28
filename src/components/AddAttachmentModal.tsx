import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, RadioButton, Text, TextInput, useTheme } from 'react-native-paper';
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

const SOURCE_OPTIONS: { value: AttachmentSource; labelKey: string }[] = [
  { value: 'arweave-id', labelKey: 'send.attachmentSourceArweaveId' },
  { value: 'arweave-uri', labelKey: 'send.attachmentSourceArweaveUri' },
  { value: 'uri', labelKey: 'send.attachmentSourceUri' },
];

export function AddAttachmentModal({ visible, onDismiss, onConfirm }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [source, setSource] = useState<AttachmentSource>('arweave-id');
  const [fileType, setFileType] = useState<AttachmentFileType>('jpeg');
  const [input, setInput] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSource('arweave-id');
    setFileType('jpeg');
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
    const resolved = resolveAttachmentHref(source, input);
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
      input: input.trim(),
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
      <RadioButton.Group
        onValueChange={(value) => {
          setSource(value as AttachmentSource);
          setError(null);
        }}
        value={source}
      >
        {SOURCE_OPTIONS.map((option) => (
          <RadioButton.Item
            key={option.value}
            label={t(option.labelKey)}
            value={option.value}
            style={styles.radioItem}
          />
        ))}
      </RadioButton.Group>

      <Text variant="labelLarge" style={[styles.fieldLabel, styles.section, { color: theme.colors.onSurface }]}>
        {t('send.attachmentFileType')}
      </Text>
      <View style={styles.chipWrap}>
        {ATTACHMENT_FILE_TYPES.map((type) => {
          const selected = fileType === type;
          return (
            <Button
              key={type}
              mode={selected ? 'contained' : 'outlined'}
              compact
              onPress={() => setFileType(type)}
              style={styles.typeButton}
              labelStyle={styles.typeLabel}
            >
              {t(`send.attachmentType.${type}`)}
            </Button>
          );
        })}
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
  radioItem: {
    paddingLeft: 0,
    paddingVertical: 0,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    borderRadius: 8,
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
