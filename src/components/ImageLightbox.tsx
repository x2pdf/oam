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
import { ActivityIndicator, Snackbar, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { getImageRendererAdapter, peekCachedRemoteImageUri, saveImageToAlbum } from '../adapter';
import { useCachedRemoteImage } from '../hooks/useCachedRemoteImage';
import { isHttpUrl } from '../utils/attachment';

const PlatformImage = getImageRendererAdapter().Image;

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_MOVE_THRESHOLD = 12;
const LONG_PRESS_MS = 400;

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
  const cached = isHttpUrl(uri) ? peekCachedRemoteImageUri(uri) : null;
  openLightbox?.(cached ?? uri);
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
  const { t } = useTranslation();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const { displayUri, loading, failed } = useCachedRemoteImage(uri);
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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const savingRef = useRef(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const saveTargetUri = displayUri ?? uri;
  const canSave = Boolean(
    saveTargetUri &&
      (saveTargetUri.startsWith('data:') ||
        saveTargetUri.startsWith('file:') ||
        saveTargetUri.startsWith('blob:') ||
        isHttpUrl(saveTargetUri)),
  );

  const handleSaveImage = useCallback(async () => {
    if (!saveTargetUri || !canSave || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSnackbarMessage(t('detail.savingImage'));
    setSnackbarVisible(true);
    try {
      await saveImageToAlbum(uri ?? saveTargetUri);
      setSnackbarMessage(t('detail.imageSaved'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSnackbarMessage(`${t('detail.imageSaveFailed')}: ${message}`);
    } finally {
      savingRef.current = false;
    }
  }, [saveTargetUri, uri, canSave, t]);

  const resetTransform = useCallback(() => {
    clearLongPress();
    longPressTriggered.current = false;
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
  }, [clearLongPress, scale, translateX, translateY]);

  useEffect(() => {
    resetTransform();
    if (displayUri) {
      Image.getSize(
        displayUri,
        (w, h) => setImageSize({ width: w, height: h }),
        () => setImageSize(null),
      );
    }
    return () => clearLongPress();
  }, [displayUri, resetTransform, clearLongPress]);

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
          longPressTriggered.current = false;
          clearLongPress();
          pinchStartDistance.current = 0;
          pinchStartScale.current = currentScale.current;
          if (evt.nativeEvent.touches.length >= 2) {
            pinchStartDistance.current = pinchDistance(evt.nativeEvent.touches);
          } else if (canSave) {
            longPressTimer.current = setTimeout(() => {
              longPressTriggered.current = true;
              handleSaveImage();
            }, LONG_PRESS_MS);
          }
        },
        onPanResponderMove: (evt, gesture) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            clearLongPress();
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

          if (Math.abs(gesture.dx) > TAP_MOVE_THRESHOLD || Math.abs(gesture.dy) > TAP_MOVE_THRESHOLD) {
            clearLongPress();
            moved.current = true;
          }

          if (currentScale.current > MIN_SCALE) {
            const next = clampTranslate(
              currentTranslate.current.x + gesture.dx,
              currentTranslate.current.y + gesture.dy,
              currentScale.current,
            );
            translateX.setValue(next.x);
            translateY.setValue(next.y);
          } else {
            translateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (evt, gesture) => {
          clearLongPress();

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
            !longPressTriggered.current &&
            !usedMultiTouch.current &&
            !moved.current &&
            Math.abs(gesture.dx) < TAP_MOVE_THRESHOLD &&
            Math.abs(gesture.dy) < TAP_MOVE_THRESHOLD;

          pinchStartDistance.current = 0;
          usedMultiTouch.current = false;
          moved.current = false;
          longPressTriggered.current = false;

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
          clearLongPress();
          longPressTriggered.current = false;
          pinchStartDistance.current = 0;
          usedMultiTouch.current = false;
          moved.current = false;
          if (currentScale.current === MIN_SCALE) {
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    [
      applyScale,
      canSave,
      clampTranslate,
      clearLongPress,
      getImageLayout,
      handleSaveImage,
      onClose,
      scale,
      translateX,
      translateY,
    ],
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
          {displayUri ? (
            <PlatformImage uri={displayUri} style={{ width, height }} resizeMode="contain" />
          ) : null}
        </Animated.View>
        {(loading || failed) && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            {loading ? (
              <>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text variant="bodyMedium" style={styles.loadingText}>
                  {t('detail.loadingImage')}
                </Text>
              </>
            ) : null}
          </View>
        )}
      </Animated.View>
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>
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
  snackbar: {
    marginBottom: 24,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 12,
  },
});
