import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { ContentItem } from '../mypayload';
import { getImageRendererAdapter } from '../adapter';

const PlatformImage = getImageRendererAdapter().Image;

interface Props {
  items: ContentItem[];
}

export const RichContentRenderer: React.FC<Props> = ({ items }) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {items.map((item, index) => {
        if (item.type === 'text') {
          return (
            <Text
              key={index}
              variant="bodyMedium"
              style={[styles.preText, { color: theme.colors.onSurface }]}
            >
              {item.content}
            </Text>
          );
        } else if (item.type === 'image') {
          return (
            <PlatformImage
              key={index}
              uri={item.data}
              style={styles.image}
              resizeMode="contain"
            />
          );
        }
        return null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  preText: {
    fontFamily: 'System', // Use monospace if available, but "pre" usually just means preserve formatting
    marginVertical: 4,
    lineHeight: 20,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
    backgroundColor: '#f0f0f0',
  },
});
