import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { getImageRendererAdapter } from '../adapter';
import { PlatformImageProps } from '../adapter/ImageRendererAdapter';
import { useCachedRemoteImage } from '../hooks/useCachedRemoteImage';

const PlatformImage = getImageRendererAdapter().Image;

const MAX_DECODE_RETRIES = 2;

type Props = PlatformImageProps & {
  containerStyle?: StyleProp<ViewStyle>;
  /** 点击时传入已解析的本地/blob URI，避免全屏再次下载远程图 */
  onPressWithUri?: (resolvedUri: string) => void;
  /** 本地/blob 解析完成（用于宽高比探测） */
  onDisplayUri?: (resolvedUri: string) => void;
  /** 变化时即使上次失败也会重新拉取远程图 */
  reloadToken?: number;
};

export const CachedRemoteImage: React.FC<Props> = ({
  uri,
  style,
  containerStyle,
  resizeMode = 'contain',
  mimeType,
  onPress,
  onPressWithUri,
  onLongPress,
  onError,
  onLoadDimensions,
  onDisplayUri,
  reloadToken,
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { displayUri, loading, failed, retry, invalidate } = useCachedRemoteImage(
    uri,
    mimeType,
    reloadToken,
  );
  const [decodeRetries, setDecodeRetries] = useState(0);

  useEffect(() => {
    setDecodeRetries(0);
  }, [uri, reloadToken]);

  useEffect(() => {
    if (failed) {
      onError?.();
    }
  }, [failed, onError]);

  useEffect(() => {
    if (displayUri) {
      onDisplayUri?.(displayUri);
    }
  }, [displayUri, onDisplayUri]);

  const handleImageError = useCallback(async () => {
    // Native Image decoded the cached file unsuccessfully. Drop the cache and
    // try once more automatically before giving up and falling back to link.
    if (uri && decodeRetries < MAX_DECODE_RETRIES) {
      setDecodeRetries((n) => n + 1);
      await invalidate().catch(() => {});
      retry();
    }
    onError?.();
  }, [uri, decodeRetries, invalidate, retry, onError]);

  if (failed && decodeRetries >= MAX_DECODE_RETRIES) {
    return null;
  }

  if (loading || !displayUri) {
    return (
      <View
        style={[
          styles.placeholder,
          containerStyle,
          style,
          { backgroundColor: theme.dark ? '#262626' : '#F5F5F5' },
        ]}
      >
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text
          variant="bodySmall"
          style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('detail.loadingImage')}
        </Text>
      </View>
    );
  }

  const handlePress = () => {
    const resolved = displayUri ?? uri;
    if (onPressWithUri && resolved) {
      onPressWithUri(resolved);
      return;
    }
    onPress?.();
  };

  return (
    <PlatformImage
      uri={displayUri}
      style={style}
      resizeMode={resizeMode}
      mimeType={mimeType}
      onPress={onPress || onPressWithUri ? handlePress : undefined}
      onLongPress={onLongPress}
      onError={handleImageError}
      onLoadDimensions={onLoadDimensions}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
  },
});
