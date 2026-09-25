import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Portal, Snackbar, useTheme } from 'react-native-paper';
import { ContentItem } from '../mypayload';
import { saveImageToAlbum } from '../adapter';
import { openUrl } from '../adapter/openUrl';
import { useTranslation } from 'react-i18next';
import { truncateListText } from '../utils/text';
import { ContentCardImage } from './ContentCardImage';
import { ExternalOpenCard } from './ExternalOpenCard';
import { openImageLightbox } from './ImageLightbox';
import { SelectableText } from './SelectableText';
import { isHttpUrl, isImageMime } from '../utils/attachment';

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

  const handleSaveImage = useCallback(async (imageUri: string) => {
    if (saving) return;
    if (!imageUri.startsWith('data:') && !isHttpUrl(imageUri)) return;
    setSaving(true);
    setSnackbarMessage(t('detail.savingImage'));
    setSnackbarVisible(true);
    try {
      await saveImageToAlbum(imageUri);
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
      await openUrl(href);
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
          const textContent = truncate ? truncateListText(item.content) : item.content;
          return selectable ? (
            <SelectableText
              key={index}
              variant="bodyMedium"
              style={[styles.preText, { color: theme.colors.onSurface }]}
              value={textContent}
            />
          ) : (
            <Text
              key={index}
              variant="bodyMedium"
              style={[styles.preText, { color: theme.colors.onSurface }]}
            >
              {textContent}
            </Text>
          );
        }
        if (item.type === 'image') {
          if (isHttpUrl(item.data)) {
            return (
              <LinkAttachment
                key={index}
                href={item.data}
                mime="image/png"
                label={item.alt || item.data}
                onOpen={() => handleOpenUrl(item.data)}
                onSaveImage={() => handleSaveImage(item.data)}
              />
            );
          }
          return (
            <ContentCardImage
              key={index}
              uri={item.data}
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
              download={item.download}
              onOpen={() => handleOpenUrl(item.href)}
              onSaveImage={() => handleSaveImage(item.href)}
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
  download,
  onOpen,
  onSaveImage,
}: {
  href: string;
  mime: string;
  label: string;
  download?: boolean;
  onOpen: () => void;
  onSaveImage: () => void;
}) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = isImageMime(mime) && !imageFailed;
  const displayLabel = label || href;
  const tapHint = download ? t('detail.tapToOpenOrDownload') : t('detail.tapToOpen');

  if (showImage) {
    return (
      <ContentCardImage
        uri={href}
        mimeType={mime}
        onPressWithUri={(resolvedUri) => openImageLightbox(resolvedUri)}
        onLongPress={onSaveImage}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <ExternalOpenCard
      mime={mime}
      label={displayLabel}
      tapHint={tapHint}
      onOpen={onOpen}
    />
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
});
