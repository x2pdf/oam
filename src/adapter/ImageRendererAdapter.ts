import React from 'react';
import { ImageStyle, StyleProp } from 'react-native';

export interface PlatformImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  /** Optional hint for file/content URIs that do not embed a MIME type. */
  mimeType?: string;
}

export interface IImageRendererAdapter {
  Image: React.ComponentType<PlatformImageProps>;
}
