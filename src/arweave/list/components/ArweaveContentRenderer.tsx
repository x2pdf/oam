import React, { useCallback, useEffect, useState } from 'react';
import { Linking, View, StyleSheet, Pressable } from 'react-native';
import { Text, Portal, Snackbar, Icon, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { saveImageToAlbum } from '../../../adapter';
import { truncateListText } from '../../../utils/text';
import { ContentCardImage } from '../../../components/ContentCardImage';
import { openImageLightbox } from '../../../components/ImageLightbox';
import { wrapImagePress } from '../../../adapter/wrapImagePress';
import { ArweaveContentItem } from '../types';
import { isHttpUrl, isImageMime, mimeToIcon, shouldDownload } from '../utils/mime';

interface Props {
  items: ArweaveContentItem[];
  truncate?: boolean;
  selectable?: boolean;
  imageReloadToken?: number;
}

export const ArweaveContentRenderer: React.FC<Props> = ({
  items,
  truncate = false,
  selectable = false,
  imageReloadToken,
}) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSaveImage = useCallback(
    async (imageUri: string) => {
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
    },
    [saving, t],
  );

  const handleOpenUrl = useCallback(
    async (href: string) => {
      try {
        await Linking.openURL(href);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setSnackbarMessage(`${t('detail.openLinkFailed')}: ${message}`);
        setSnackbarVisible(true);
      }
    },
    [t],
  );

  return (
    <View style={styles.container}>
      {items.map((item, index) => {
        if (item.type === 'image') {
          const mime = item.mime || 'image/png';
          const label = item.alt || item.data;
          return (
            <ImageOrExternalLink
              key={index}
              uri={item.data}
              mime={mime}
              label={truncate ? truncateListText(label) : label}
              download={shouldDownload(mime)}
              reloadToken={imageReloadToken}
              onOpen={() => handleOpenUrl(item.data)}
              onSaveImage={() => handleSaveImage(item.data)}
              selectable={selectable}
            />
          );
        }
        if (item.type === 'link') {
          const label = truncate ? truncateListText(item.label) : item.label;
          return (
            <ImageOrExternalLink
              key={index}
              uri={item.href}
              mime={item.mime}
              label={label}
              download={item.download}
              reloadToken={imageReloadToken}
              tryImage={isImageMime(item.mime)}
              onOpen={() => handleOpenUrl(item.href)}
              onSaveImage={() => handleSaveImage(item.href)}
              selectable={selectable}
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

function ImageOrExternalLink({
  uri,
  mime,
  label,
  download,
  reloadToken,
  tryImage = true,
  onOpen,
  onSaveImage,
  selectable = false,
}: {
  uri: string;
  mime: string;
  label: string;
  download?: boolean;
  reloadToken?: number;
  tryImage?: boolean;
  onOpen: () => void;
  onSaveImage: () => void;
  selectable?: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = tryImage && isImageMime(mime) && isHttpUrl(uri) && !imageFailed;
  const displayLabel = label || uri;
  const tapHint = download ? t('detail.tapToOpenOrDownload') : t('detail.tapToOpen');

  useEffect(() => {
    setImageFailed(false);
  }, [reloadToken, uri]);

  if (showImage) {
    return (
      <ContentCardImage
        uri={uri}
        mimeType={mime}
        reloadToken={reloadToken}
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
      theme={theme}
      selectable={selectable}
    />
  );
}

function ExternalOpenCard({
  mime,
  label,
  tapHint,
  onOpen,
  theme,
  selectable = false,
}: {
  mime: string;
  label: string;
  tapHint: string;
  onOpen: () => void;
  theme: ReturnType<typeof useTheme>;
  selectable?: boolean;
}) {
  const cardStyle = [
    styles.linkCard,
    { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant },
  ];

  if (selectable) {
    return (
      <View style={cardStyle} accessibilityLabel={label} accessibilityHint={tapHint}>
        <View style={styles.linkCardRow}>
          <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={tapHint}>
            <Icon source={mimeToIcon(mime)} size={28} color={theme.colors.primary} />
          </Pressable>
          <View style={styles.linkCardContent}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurface }}
              numberOfLines={2}
              selectable
            >
              {label}
            </Text>
            <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={tapHint}>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                numberOfLines={2}
              >
                {tapHint}
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={tapHint}>
            <Icon source="open-in-new" size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>
    );
  }

  return wrapImagePress(
    <View
      style={cardStyle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={tapHint}
    >
      <View style={styles.linkCardRow}>
        <Icon source={mimeToIcon(mime)} size={28} color={theme.colors.primary} />
        <View style={styles.linkCardContent}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }} numberOfLines={2}>
            {label}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
            numberOfLines={2}
          >
            {tapHint}
          </Text>
        </View>
        <Icon source="open-in-new" size={20} color={theme.colors.onSurfaceVariant} />
      </View>
    </View>,
    { onPress: onOpen },
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
