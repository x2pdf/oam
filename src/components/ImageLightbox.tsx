import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
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
  }, [scale, translateX, translateY]);

  useEffect(() => {
    resetTransform();
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
          } else if (Math.abs(gesture.dx) > TAP_MOVE_THRESHOLD || Math.abs(gesture.dy) > TAP_MOVE_THRESHOLD) {
            moved.current = true;
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (currentScale.current > MIN_SCALE) {
            const next = clampTranslate(
              currentTranslate.current.x + gesture.dx,
              currentTranslate.current.y + gesture.dy,
              currentScale.current,
            );
            currentTranslate.current = next;
            translateX.setValue(next.x);
            translateY.setValue(next.y);
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
            if (currentScale.current > MIN_SCALE) {
              applyScale(MIN_SCALE);
            } else {
              onClose();
            }
          }
        },
        onPanResponderTerminate: () => {
          pinchStartDistance.current = 0;
          usedMultiTouch.current = false;
          moved.current = false;
        },
      }),
    [applyScale, clampTranslate, onClose, translateX, translateY],
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
      <View
        style={styles.backdrop}
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
      </View>
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
