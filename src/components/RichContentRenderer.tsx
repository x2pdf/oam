import React, { useCallback, useState } from 'react';
import { Linking, View, StyleSheet } from 'react-native';
import { Text, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ContentItem } from '../mypayload';
import { getImageRendererAdapter, saveImageToAlbum } from '../adapter';
import { useTranslation } from 'react-i18next';
import { truncateListText } from '../utils/text';
import { openImageLightbox } from './ImageLightbox';
import { wrapImagePress } from '../adapter/wrapImagePress';
import { isImageMime } from '../utils/attachment';

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
    if (!dataUri.startsWith('data:')) return;
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

  const handleOpenUrl = useCallback(async (href: string) => {
    try {
      await Linking.openURL(href);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSnackbarMessage(`${t('detail.openLinkFailed')}: ${message}`);
      setSnackbarVisible(true);
    }
  }, [t]);

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
        }
        if (item.type === 'image') {
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
        if (item.type === 'link') {
          return (
            <LinkAttachment
              key={index}
              href={item.href}
              mime={item.mime}
              label={item.label}
              onOpen={() => handleOpenUrl(item.href)}
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

function LinkAttachment({
  href,
  mime,
  label,
  onOpen,
}: {
  href: string;
  mime: string;
  label: string;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = isImageMime(mime) && !imageFailed;

  if (showImage) {
    return (
      <PlatformImage
        uri={href}
        style={[styles.image, { backgroundColor: theme.colors.surfaceVariant }]}
        resizeMode="contain"
        onPress={() => openImageLightbox(href)}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return wrapImagePress(
    <View
      style={[
        styles.linkCard,
        { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant },
      ]}
    >
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }} numberOfLines={2}>
        {label || href}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }} numberOfLines={1}>
        {mime}
      </Text>
    </View>,
    { onPress: onOpen },
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  preText: {
    fontFamily: 'System',
    marginVertical: 4,
    lineHeight: 20,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
  },
  linkCard: {
    width: '100%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginVertical: 8,
  },
});
