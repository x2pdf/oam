import React from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import type { ImageGalleryPagerProps } from './ImageGalleryPager.types';

export type { ImageGalleryPagerProps };

const ImageGalleryPager: React.FC<ImageGalleryPagerProps> = ({
  initialPage, scrollEnabled, onPageSelected, children,
}) => (
  <PagerView
    style={styles.fill}
    initialPage={initialPage}
    scrollEnabled={scrollEnabled}
    offscreenPageLimit={1}
    onPageSelected={(event) => onPageSelected(event.nativeEvent.position)}
  >
    {React.Children.map(children, (child, index) => (
      <View key={index} collapsable={false} style={styles.fill}>
        {child}
      </View>
    ))}
  </PagerView>
);

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export default ImageGalleryPager;
