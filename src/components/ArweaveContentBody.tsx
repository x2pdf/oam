import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArweaveContentItem } from '../arweave/list/types';
import { ArweaveContentRenderer } from '../arweave/list/components/ArweaveContentRenderer';

type Props = {
  items: ArweaveContentItem[];
  truncate?: boolean;
};

/** Arweave 富文本正文：列表卡片与数据详情页共用。 */
export const ArweaveContentBody: React.FC<Props> = (props) => {
  return (
    <View style={styles.wrap}>
      <ArweaveContentRenderer {...props} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
