import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { saveImageToAlbum } from '../../../adapter';
import { openUrl } from '../../../adapter/openUrl';
import { truncateListText } from '../../../utils/text';
import { ContentCardImage } from '../../../components/ContentCardImage';
import { ExternalOpenCard } from '../../../components/ExternalOpenCard';
import { openImageLightbox } from '../../../components/ImageLightbox';
import { ArweaveContentItem } from '../types';
import { isHttpUrl, isImageMime, shouldDownload } from '../utils/mime';

interface Props {
  items: ArweaveContentItem[];
  truncate?: boolean;
  imageReloadToken?: number;
  cacheMap?: Record<string, string>;
}

export const ArweaveContentRenderer: React.FC<Props> = ({
  items,
  truncate = false,
  imageReloadToken,
  cacheMap,
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
        await openUrl(href);
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
              cacheMap={cacheMap}
              onOpen={() => handleOpenUrl(item.data)}
              onSaveImage={() => handleSaveImage(item.data)}
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
              cacheMap={cacheMap}
              tryImage={isImageMime(item.mime)}
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

function ImageOrExternalLink({
  uri,
  mime,
  label,
  download,
  reloadToken,
  cacheMap,
  tryImage = true,
  onOpen,
  onSaveImage,
}: {
  uri: string;
  mime: string;
  label: string;
  download?: boolean;
  reloadToken?: number;
  cacheMap?: Record<string, string>;
  tryImage?: boolean;
  onOpen: () => void;
  onSaveImage: () => void;
}) {
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
        cacheMap={cacheMap}
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
});
