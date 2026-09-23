import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { formatUploadFileSize } from '../arweave/upload/format';
import { useRemoteContentLength } from '../hooks/useRemoteContentLength';
import { SendDraftAttachment } from '../types';
import { isImageAttachmentFileType } from '../utils/attachment';
import { CachedRemoteImage } from './CachedRemoteImage';
import { openImageLightbox } from './ImageLightbox';

type Props = {
  attachment: SendDraftAttachment;
  onRemove: () => void;
  wrapHref: (value: string) => string;
};

export function SendDraftAttachmentRow({ attachment, onRemove, wrapHref }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const sizeBytes = useRemoteContentLength(attachment.href);
  const showImagePreview = isImageAttachmentFileType(attachment.fileType);

  const metaLine = useMemo(() => {
    const typePart = `${attachment.label} · ${t(`send.attachmentType.${attachment.fileType}`)}`;
    if (sizeBytes === undefined) {
      return `${typePart} · ${t('send.attachmentSizeLoading')}`;
    }
    if (sizeBytes === null) {
      return `${typePart} · ${t('send.attachmentSizeUnknown')}`;
    }
    return `${typePart} · ${formatUploadFileSize(sizeBytes)}`;
  }, [attachment.fileType, attachment.label, sizeBytes, t]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outline + (theme.dark ? '50' : '40'),
        },
      ]}
    >
      {showImagePreview && (
        <View
          style={[
            styles.previewFrame,
            { backgroundColor: theme.dark ? '#262626' : '#F5F5F5' },
          ]}
        >
          <CachedRemoteImage
            uri={attachment.href}
            mimeType={attachment.mime}
            containerStyle={styles.previewContainer}
            style={styles.previewImage}
            resizeMode="contain"
            onPressWithUri={(resolvedUri) => openImageLightbox(resolvedUri)}
          />
        </View>
      )}

      <View style={styles.contentRow}>
        <View style={styles.info}>
          <Text variant="bodySmall" numberOfLines={2}>
            {metaLine}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={2}
            style={[styles.href, { color: theme.colors.onSurfaceVariant }]}
          >
            {wrapHref(attachment.href)}
          </Text>
        </View>
        <IconButton icon="close" size={20} onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  previewFrame: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.35)',
  },
  previewContainer: {
    width: '100%',
    height: 140,
  },
  previewImage: {
    width: '100%',
    height: 140,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 4,
  },
  info: {
    flex: 1,
    marginRight: 4,
  },
  href: {
    marginTop: 2,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 16,
  },
});
