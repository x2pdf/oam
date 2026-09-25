import React from 'react';
import { GestureResponderEvent, Pressable } from 'react-native';

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

  // Do not pass a custom onClick/onClickCapture on web. react-native-web
  // Pressable overwrites rest.onClick with its own handler, so a custom
  // onClick never runs; clearing onPress at the same time made taps a no-op.
  // Parent list cards are blocked via lockCardPress + wasRecentImagePress.
  return (
    <Pressable
      style={{ width: '100%' }}
      onPress={onPress ? handlePress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={400}
    >
      {inner}
    </Pressable>
  );
}
