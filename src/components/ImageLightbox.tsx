import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Image,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { getImageRendererAdapter } from '../adapter';

const PlatformImage = getImageRendererAdapter().Image;

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_MOVE_THRESHOLD = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pinchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  const a = touches[0];
  const b = touches[1];
  if (!a || !b) {
    return 0;
  }
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type Props = {
  uri: string | null;
  onClose: () => void;
};

let openLightbox: ((uri: string) => void) | null = null;

export function openImageLightbox(uri: string) {
  openLightbox?.(uri);
}

export function ImageLightboxHost() {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    openLightbox = setUri;
    return () => {
      if (openLightbox === setUri) {
        openLightbox = null;
      }
    };
  }, []);

  return <ImageLightbox uri={uri} onClose={() => setUri(null)} />;
}

export const ImageLightbox: React.FC<Props> = ({ uri, onClose }) => {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const currentScale = useRef(1);
  const currentTranslate = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const usedMultiTouch = useRef(false);
  const moved = useRef(false);
  const lastTapTime = useRef(0);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const resetTransform = useCallback(() => {
    currentScale.current = 1;
    currentTranslate.current = { x: 0, y: 0 };
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    pinchStartDistance.current = 0;
    pinchStartScale.current = 1;
    usedMultiTouch.current = false;
    moved.current = false;
    setImageSize(null);
  }, [scale, translateX, translateY]);

  useEffect(() => {
    resetTransform();
    if (uri) {
      Image.getSize(
        uri,
        (w, h) => setImageSize({ width: w, height: h }),
        () => setImageSize(null),
      );
    }
  }, [uri, resetTransform]);

  useEffect(() => {
    if (!uri) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [uri, onClose]);

  const applyScale = useCallback(
    (next: number) => {
      const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
      currentScale.current = clamped;
      scale.setValue(clamped);
      if (clamped === MIN_SCALE) {
        currentTranslate.current = { x: 0, y: 0 };
        translateX.setValue(0);
        translateY.setValue(0);
      }
    },
    [scale, translateX, translateY],
  );

  const clampTranslate = useCallback(
    (x: number, y: number, nextScale: number) => {
      const maxX = ((nextScale - 1) * width) / 2;
      const maxY = ((nextScale - 1) * height) / 2;
      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [height, width],
  );

  const getImageLayout = useCallback(() => {
    const defaultLayout = { x: 0, y: 0, w: width, h: height };
    if (!imageSize) return defaultLayout;

    const screenRatio = width / height;
    const imageRatio = imageSize.width / imageSize.height;

    let w, h;
    if (imageRatio > screenRatio) {
      w = width;
      h = width / imageRatio;
    } else {
      h = height;
      w = height * imageRatio;
    }

    return {
      x: (width - w) / 2,
      y: (height - h) / 2,
      w,
      h,
    };
  }, [imageSize, width, height]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          usedMultiTouch.current = evt.nativeEvent.touches.length >= 2;
          moved.current = false;
          pinchStartDistance.current = 0;
          pinchStartScale.current = currentScale.current;
          if (evt.nativeEvent.touches.length >= 2) {
            pinchStartDistance.current = pinchDistance(evt.nativeEvent.touches);
          }
        },
        onPanResponderMove: (evt, gesture) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            usedMultiTouch.current = true;
            moved.current = true;
            if (pinchStartDistance.current <= 0) {
              pinchStartDistance.current = pinchDistance(touches);
              pinchStartScale.current = currentScale.current;
              return;
            }
            const dist = pinchDistance(touches);
            if (dist <= 0) {
              return;
            }
            applyScale(pinchStartScale.current * (dist / pinchStartDistance.current));
            return;
          }

          if (currentScale.current > MIN_SCALE) {
            if (Math.abs(gesture.dx) > TAP_MOVE_THRESHOLD || Math.abs(gesture.dy) > TAP_MOVE_THRESHOLD) {
              moved.current = true;
            }
            const next = clampTranslate(
              currentTranslate.current.x + gesture.dx,
              currentTranslate.current.y + gesture.dy,
              currentScale.current,
            );
            translateX.setValue(next.x);
            translateY.setValue(next.y);
          } else {
            if (Math.abs(gesture.dx) > TAP_MOVE_THRESHOLD || Math.abs(gesture.dy) > TAP_MOVE_THRESHOLD) {
              moved.current = true;
            }
            translateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (evt, gesture) => {
          if (currentScale.current > MIN_SCALE) {
            const next = clampTranslate(
              currentTranslate.current.x + gesture.dx,
              currentTranslate.current.y + gesture.dy,
              currentScale.current,
            );
            currentTranslate.current = next;
            translateX.setValue(next.x);
            translateY.setValue(next.y);
          } else {
            if (Math.abs(gesture.dy) > 100) {
              onClose();
              return;
            } else {
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }
          }

          const isTap =
            !usedMultiTouch.current &&
            !moved.current &&
            Math.abs(gesture.dx) < TAP_MOVE_THRESHOLD &&
            Math.abs(gesture.dy) < TAP_MOVE_THRESHOLD;

          pinchStartDistance.current = 0;
          usedMultiTouch.current = false;
          moved.current = false;

          if (isTap) {
            const { locationX, locationY } = evt.nativeEvent;
            const layout = getImageLayout();
            const isInside =
              locationX >= layout.x &&
              locationX <= layout.x + layout.w &&
              locationY >= layout.y &&
              locationY <= layout.y + layout.h;

            if (!isInside) {
              onClose();
            } else {
              const now = Date.now();
              if (now - lastTapTime.current < 300) {
                // Double tap
                if (currentScale.current > MIN_SCALE) {
                  Animated.spring(scale, { toValue: MIN_SCALE, useNativeDriver: true }).start();
                  Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
                  Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
                  currentScale.current = MIN_SCALE;
                  currentTranslate.current = { x: 0, y: 0 };
                } else {
                  Animated.spring(scale, { toValue: 3, useNativeDriver: true }).start();
                  currentScale.current = 3;
                }
                lastTapTime.current = 0;
              } else {
                lastTapTime.current = now;
              }
            }
          }
        },
        onPanResponderTerminate: () => {
          pinchStartDistance.current = 0;
          usedMultiTouch.current = false;
          moved.current = false;
          if (currentScale.current === MIN_SCALE) {
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    [applyScale, clampTranslate, onClose, translateX, translateY, width, height, imageSize, getImageLayout, scale],
  );

  const handleWheel = useCallback(
    (event: { nativeEvent?: { deltaY?: number }; deltaY?: number; preventDefault?: () => void }) => {
      event.preventDefault?.();
      const deltaY = event.nativeEvent?.deltaY ?? event.deltaY ?? 0;
      const factor = deltaY > 0 ? 0.92 : 1.08;
      applyScale(currentScale.current * factor);
    },
    [applyScale],
  );

  if (!uri) {
    return null;
  }

  const backgroundColor = translateY.interpolate({
    inputRange: [-height / 2, 0, height / 2],
    outputRange: ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.96)', 'rgba(0,0,0,0.5)'],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <Animated.View
        style={[styles.backdrop, { backgroundColor }]}
        {...panResponder.panHandlers}
        {...(Platform.OS === 'web' ? ({ onWheel: handleWheel } as object) : {})}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.imageWrap,
            {
              width,
              height,
              transform: [{ translateX }, { translateY }, { scale }],
            },
          ]}
        >
          <PlatformImage uri={uri} style={{ width, height }} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
