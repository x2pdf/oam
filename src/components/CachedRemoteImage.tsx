import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { getImageRendererAdapter } from '../adapter';
import { PlatformImageProps } from '../adapter/ImageRendererAdapter';
import { useCachedRemoteImage } from '../hooks/useCachedRemoteImage';

const PlatformImage = getImageRendererAdapter().Image;

type Props = PlatformImageProps & {
  containerStyle?: StyleProp<ViewStyle>;
  /** 点击时传入已解析的本地/blob URI，避免全屏再次下载远程图 */
  onPressWithUri?: (resolvedUri: string) => void;
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
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { displayUri, loading, failed } = useCachedRemoteImage(uri, mimeType);

  useEffect(() => {
    if (failed) {
      onError?.();
    }
  }, [failed, onError]);

  if (failed) {
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
      onError={onError}
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
