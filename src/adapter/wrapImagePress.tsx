import React from 'react';
import { GestureResponderEvent, Platform, Pressable } from 'react-native';

type ImagePressHandlers = {
  onPress?: () => void;
  onLongPress?: () => void;
};

let imagePressLockUntil = 0;

export function wasRecentImagePress(): boolean {
  return Date.now() < imagePressLockUntil;
}

function lockCardPress() {
  imagePressLockUntil = Date.now() + 500;
}

export function wrapImagePress(
  inner: React.ReactElement,
  { onPress, onLongPress }: ImagePressHandlers,
): React.ReactElement {
  if (!onPress && !onLongPress) {
    return inner;
  }

  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation?.();
    lockCardPress();
    onPress?.();
  };

  const handleLongPress = () => {
    lockCardPress();
    onLongPress?.();
  };

  return (
    <Pressable
      style={{ width: '100%' }}
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={400}
      {...(Platform.OS === 'web' && onPress
        ? ({
            onClick: (event: { stopPropagation: () => void }) => {
              event.stopPropagation();
            },
          } as object)
        : {})}
    >
      {inner}
    </Pressable>
  );
}
