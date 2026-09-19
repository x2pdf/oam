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
  /** Called when the image fails to load. */
  onError?: () => void;
  /** Called when intrinsic dimensions are known (fallback when Image.getSize fails). */
  onLoadDimensions?: (size: { width: number; height: number }) => void;
}

export interface IImageRendererAdapter {
  Image: React.ComponentType<PlatformImageProps>;
}
