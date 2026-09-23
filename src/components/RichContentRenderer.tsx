import React, { useCallback, useState } from 'react';
import { Linking, View, StyleSheet } from 'react-native';
import { Text, Portal, Snackbar, Icon, useTheme } from 'react-native-paper';
import { ContentItem } from '../mypayload';
import { saveImageToAlbum } from '../adapter';
import { useTranslation } from 'react-i18next';
import { truncateListText } from '../utils/text';
import { ContentCardImage } from './ContentCardImage';
import { openImageLightbox } from './ImageLightbox';
import { SelectableText } from './SelectableText';
import { wrapImagePress } from '../adapter/wrapImagePress';
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
          return (
            <ContentCardImage
              key={index}
              uri={item.data}
              onPressWithUri={
                isHttpUrl(item.data)
                  ? (resolvedUri) => openImageLightbox(resolvedUri)
                  : undefined
              }
              onPress={
                isHttpUrl(item.data) ? undefined : () => openImageLightbox(item.data)
              }
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

function mimeToIcon(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith('video/')) return 'play-circle-outline';
  if (m === 'application/pdf') return 'file-pdf-box';
  if (m === 'application/zip') return 'folder-zip-outline';
  return 'file-outline';
}

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
  const theme = useTheme();
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

  return wrapImagePress(
    <View
      style={[
        styles.linkCard,
        { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant },
      ]}
      accessibilityRole="button"
      accessibilityLabel={displayLabel}
      accessibilityHint={tapHint}
    >
      <View style={styles.linkCardRow}>
        <Icon
          source={mimeToIcon(mime)}
          size={28}
          color={theme.colors.primary}
        />
        <View style={styles.linkCardContent}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }} numberOfLines={2}>
            {displayLabel}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
            numberOfLines={2}
          >
            {tapHint}
          </Text>
        </View>
        <Icon
          source="open-in-new"
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      </View>
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
  linkCard: {
    width: '100%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginVertical: 8,
  },
  linkCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkCardContent: {
    flex: 1,
    minWidth: 0,
  },
});
