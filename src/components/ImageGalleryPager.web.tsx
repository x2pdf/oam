import React from 'react';
import { View } from 'react-native';
import type { ImageGalleryPagerProps } from './ImageGalleryPager.types';

export type { ImageGalleryPagerProps };

/** Web 使用箭头和键盘切换，不依赖原生分页器；这里只渲染初始页。 */
const ImageGalleryPager: React.FC<ImageGalleryPagerProps> = ({ initialPage, children }) => (
  <View style={{ flex: 1 }}>{React.Children.toArray(children)[initialPage]}</View>
);

export default ImageGalleryPager;
