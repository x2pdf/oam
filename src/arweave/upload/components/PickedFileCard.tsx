import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Icon, IconButton, Text, useTheme } from 'react-native-paper';
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

  return (
    <Card mode="elevated" style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.content}>
        {showImage ? (
          <PlatformImage
            uri={buildImagePreviewUri(file)}
            mimeType={file.mimeType}
            style={styles.thumbnail}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.filePreview, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Icon source="file-document-outline" size={28} color={theme.colors.onSurfaceVariant} />
            <Text
              variant="bodySmall"
              numberOfLines={3}
              style={[styles.fileName, { color: theme.colors.onSurface }]}
            >
              {file.fileName}
            </Text>
          </View>
        )}
        <View style={styles.info}>
          {showImage ? (
            <Text variant="bodyMedium" numberOfLines={2}>{file.fileName}</Text>
          ) : null}
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formatUploadFileSize(file.sizeBytes)}
          </Text>
        </View>
        <IconButton icon="close" size={20} onPress={onRemove} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, marginBottom: 8 },
  content: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  thumbnail: { width: 72, height: 72, borderRadius: 6 },
  filePreview: {
    width: 120,
    minHeight: 72,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fileName: { marginTop: 4, textAlign: 'center' },
  info: { flex: 1, marginLeft: 12 },
});
