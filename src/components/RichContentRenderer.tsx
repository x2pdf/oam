import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ContentItem } from '../mypayload';
import { getImageRendererAdapter, saveImageToAlbum } from '../adapter';
import { useTranslation } from 'react-i18next';
import { truncateListText } from '../utils/text';
import { openImageLightbox } from './ImageLightbox';

const PlatformImage = getImageRendererAdapter().Image;

interface Props {
  items: ContentItem[];
  selectable?: boolean;
  truncate?: boolean;
}

export const RichContentRenderer: React.FC<Props> = ({ items, selectable = false, truncate = false }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSaveImage = useCallback(async (dataUri: string) => {
    if (saving) return;
    setSaving(true);
    setSnackbarMessage(t('detail.savingImage'));
    setSnackbarVisible(true);
    try {
      await saveImageToAlbum(dataUri);
      setSnackbarMessage(t('detail.imageSaved'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSnackbarMessage(`${t('detail.imageSaveFailed')}: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [saving, t]);

  return (
    <View style={styles.container}>
      {items.map((item, index) => {
        if (item.type === 'text') {
          return (
            <Text
              key={index}
              variant="bodyMedium"
              style={[styles.preText, { color: theme.colors.onSurface }]}
              selectable={selectable}
            >
              {truncate ? truncateListText(item.content) : item.content}
            </Text>
          );
        } else if (item.type === 'image') {
          return (
            <PlatformImage
              key={index}
              uri={item.data}
              style={[styles.image, { backgroundColor: theme.colors.surfaceVariant }]}
              resizeMode="contain"
              onPress={() => openImageLightbox(item.data)}
              onLongPress={() => handleSaveImage(item.data)}
            />
          );
        }
        return null;
      })}

      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={2000}
        >
          {snackbarMessage}
        </Snackbar>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  preText: {
    fontFamily: 'System', // Use monospace if available, but "pre" usually just means preserve formatting
    marginVertical: 4,
    lineHeight: 20,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
  },
});
