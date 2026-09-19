import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ContentItem } from '../mypayload';
import { RichContentRenderer } from './RichContentRenderer';

type Props = {
  items: ContentItem[];
  selectable?: boolean;
  truncate?: boolean;
};

/** OAMP / 富文本正文：列表卡片与数据详情页共用，保证图片宽度自适应布局一致。 */
export const OampContentBody: React.FC<Props> = (props) => {
  return (
    <View style={styles.wrap}>
      <RichContentRenderer {...props} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
