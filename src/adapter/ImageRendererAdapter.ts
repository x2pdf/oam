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
}

export interface IImageRendererAdapter {
  Image: React.ComponentType<PlatformImageProps>;
}
