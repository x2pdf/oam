import React from 'react';
import { ImageStyle, StyleProp } from 'react-native';

export interface PlatformImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  /** Optional hint for file/content URIs that do not embed a MIME type. */
  mimeType?: string;
  /** Called when the user long-presses the image. */
  onLongPress?: () => void;
  /** Called when the user taps the image. */
  onPress?: () => void;
  /** Android 原生图片渐显时长(ms)；0 表示关闭渐显。其他平台忽略。 */
  fadeDuration?: number;
  /** Called when the image fails to load. */
  onError?: () => void;
  /** Called when intrinsic dimensions are known (fallback when Image.getSize fails). */
  onLoadDimensions?: (size: { width: number; height: number }) => void;
}

export interface IImageRendererAdapter {
  Image: React.ComponentType<PlatformImageProps>;
}
