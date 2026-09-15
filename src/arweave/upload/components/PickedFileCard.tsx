import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text, useTheme } from 'react-native-paper';
import { getImageRendererAdapter } from '../../../adapter';
import { formatUploadFileSize } from '../format';
import { isUploadImageMime } from '../constants';
import type { PickedUploadFile } from '../pickFile';

const PlatformImage = getImageRendererAdapter().Image;

type Props = {
  file: PickedUploadFile;
  onRemove: () => void;
};

function buildImagePreviewUri(file: PickedUploadFile): string {
  if (file.previewUri) {
    return file.previewUri;
  }
  return `data:${file.mimeType};base64,${file.base64}`;
}

export function PickedFileCard({ file, onRemove }: Props) {
  const theme = useTheme();
  const showImage = isUploadImageMime(file.mimeType);
  const borderColor = theme.colors.outline + (theme.dark ? '50' : '40');

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor,
        },
      ]}
    >
      <View style={styles.content}>
        {showImage ? (
          <PlatformImage
            uri={buildImagePreviewUri(file)}
            mimeType={file.mimeType}
            style={styles.thumbnail}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.filePreview, { borderColor }]}>
            <Icon source="file-document-outline" size={22} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        <View style={styles.info}>
          <Text variant="bodySmall" numberOfLines={2}>
            {file.fileName}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {formatUploadFileSize(file.sizeBytes)}
          </Text>
        </View>
        <IconButton icon="close" size={20} onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 4,
  },
  thumbnail: { width: 48, height: 48, borderRadius: 4 },
  filePreview: {
    width: 48,
    height: 48,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, marginLeft: 12, marginRight: 4 },
});
