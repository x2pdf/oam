import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { ActivityIndicator, Icon, Snackbar, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { getImageRendererAdapter, peekCachedImagePath, saveImageToAlbum } from '../adapter';
import { useCachedRemoteImage } from '../hooks/useCachedRemoteImage';
import { isHttpUrl } from '../utils/attachment';
import ImageGalleryPager from './ImageGalleryPager';

const PlatformImage = getImageRendererAdapter().Image;

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_MOVE_THRESHOLD = 12;
const LONG_PRESS_MS = 400;
const FADE_IN_MS = 180;
const CONTROLS_HIDE_MS = 2000;
/** 图片 onLoad 迟迟不触发时的兜底显示时间，避免一直不可见。 */
const REVEAL_FALLBACK_MS = 800;

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

export type ImageLightboxItem = {
  uri: string;
  cachedUri?: string;
  mimeType?: string;
};

type GalleryOptions = {
  images: readonly ImageLightboxItem[];
  initialIndex: number;
};

type Props = {
  uri: string | null;
  images?: readonly ImageLightboxItem[];
  initialIndex?: number;
  onClose: () => void;
};

type SlideProps = {
  uri: string | null;
  cachedUri?: string;
  mimeType?: string;
  onClose: () => void;
  /** 原生分页器接管水平滑动；此时未缩放的水平手势交给分页器，不在这里处理。 */
  pagerSwipe?: boolean;
  /** 缩放状态变化时通知外层，放大时需要锁住分页器。 */
  onZoomChange?: (zoomed: boolean) => void;
};

type LightboxSession = { uri: string } & Partial<GalleryOptions>;
let openLightbox: ((session: LightboxSession) => void) | null = null;

export function openImageLightbox(uri: string, options?: GalleryOptions) {
  openLightbox?.({ uri, ...options });
}

export function ImageLightboxHost() {
  const [session, setSession] = useState<LightboxSession | null>(null);

  useEffect(() => {
    openLightbox = setSession;
    return () => {
      if (openLightbox === setSession) {
        openLightbox = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => setSession(null), []);

  if (!session) {
    return null;
  }
  return <ImageLightbox {...session} onClose={handleClose} />;
}

export const ImageLightbox: React.FC<Props> = ({
  uri, images, initialIndex = 0, onClose,
}) => {
  const { t } = useTranslation();
  const gallery = useMemo(() => images?.length ? images : uri ? [{ uri }] : [], [images, uri]);
  const [index, setIndex] = useState(() => clamp(initialIndex, 0, Math.max(0, gallery.length - 1)));
  const startIndex = useRef(index).current;
  const [zoomed, setZoomed] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const current = gallery[index];
  const hasMultiple = gallery.length > 1;
  const desktopControls = Platform.OS === 'web' && hasMultiple;
  const usePager = Platform.OS !== 'web' && hasMultiple;
  const onPageSelected = useCallback((position: number) => {
    setIndex(clamp(position, 0, gallery.length - 1));
    setZoomed(false);
  }, [gallery.length]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsHovered = useRef(false);
  const controlsFocused = useRef(false);
  const keyboardFocus = useRef(false);
  const clearControlsTimer = useCallback(() => {
    if (controlsTimer.current !== null) {
      clearTimeout(controlsTimer.current);
      controlsTimer.current = null;
    }
  }, []);
  const showControls = useCallback(() => {
    if (!desktopControls) return;
    setControlsVisible(true);
    clearControlsTimer();
    if (!controlsHovered.current && !controlsFocused.current) {
      controlsTimer.current = setTimeout(() => {
        controlsTimer.current = null;
        setControlsVisible(false);
      }, CONTROLS_HIDE_MS);
    }
  }, [clearControlsTimer, desktopControls]);
  const showPointerControls = useCallback(() => {
    keyboardFocus.current = false;
    controlsFocused.current = false;
    showControls();
  }, [showControls]);
  const onNavigate = useCallback((direction: -1 | 1) => {
    setIndex((previous) => clamp(previous + direction, 0, gallery.length - 1));
    showControls();
  }, [gallery.length, showControls]);

  useEffect(() => {
    showControls();
    return clearControlsTimer;
  }, [showControls, clearControlsTimer]);

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [controlsOpacity, controlsVisible]);

  // 切图只重挂载图片层；Modal 和遮罩始终保留，不再重复淡入。
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [overlayOpacity]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hasMultiple || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Tab') {
        keyboardFocus.current = true;
        showControls();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(event.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMultiple, onNavigate, showControls]);

  if (!current) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <Animated.View
        testID="image-lightbox-overlay"
        style={[styles.fill, { opacity: overlayOpacity }]}
        {...(Platform.OS === 'web' ? ({ onMouseMove: showPointerControls } as object) : {})}
      >
        {usePager ? (
          <ImageGalleryPager
            initialPage={startIndex}
            scrollEnabled={!zoomed}
            onPageSelected={onPageSelected}
          >
            {gallery.map((item, i) => (
              // 只挂载当前页和相邻页：相邻图提前加载，滑动时已拼接好。
              Math.abs(i - index) <= 1 ? (
                <ImageLightboxSlide
                  key={`${i}:${item.uri}`}
                  {...item}
                  onClose={onClose}
                  pagerSwipe
                  onZoomChange={i === index ? setZoomed : undefined}
                />
              ) : (
                <View key={`${i}:${item.uri}`} />
              )
            ))}
          </ImageGalleryPager>
        ) : (
          <ImageLightboxSlide
            key={`${index}:${current.uri}`}
            {...current}
            onClose={onClose}
          />
        )}
        {desktopControls && (
          <Animated.View
            testID="image-navigation"
            pointerEvents={controlsVisible ? 'box-none' : 'none'}
            style={[StyleSheet.absoluteFillObject, { opacity: controlsOpacity }]}
          >
            {([-1, 1] as const).map((direction) => (
              <Pressable
                key={direction}
                testID={direction === -1 ? 'image-previous' : 'image-next'}
                accessibilityRole="button"
                accessibilityLabel={t(direction === -1 ? 'detail.previousImage' : 'detail.nextImage')}
                accessibilityState={{ disabled: direction === -1 ? index === 0 : index === gallery.length - 1 }}
                pointerEvents={controlsVisible ? 'auto' : 'none'}
                disabled={direction === -1 ? index === 0 : index === gallery.length - 1}
                style={[
                  styles.arrow,
                  direction === -1 ? styles.previousArrow : styles.nextArrow,
                  {
                    pointerEvents: controlsVisible ? 'auto' : 'none',
                    opacity: (direction === -1 ? index === 0 : index === gallery.length - 1) ? 0.32 : 1,
                  },
                ]}
                onHoverIn={() => { controlsHovered.current = true; showPointerControls(); }}
                onHoverOut={() => { controlsHovered.current = false; showControls(); }}
                // Modal 的自动聚焦不能让箭头常驻；只有用户按 Tab 聚焦才保持显示。
                onFocus={() => { controlsFocused.current = keyboardFocus.current; showControls(); }}
                onBlur={() => { controlsFocused.current = false; showControls(); }}
                onPress={(event) => { event.stopPropagation(); onNavigate(direction); }}
              >
                <Icon source={direction === -1 ? 'chevron-left' : 'chevron-right'} size={32} color="#FFFFFF" />
              </Pressable>
            ))}
            <Text testID="image-counter" pointerEvents="none" style={styles.counter}>
              {`${index + 1} / ${gallery.length}`}
            </Text>
          </Animated.View>
        )}
        {hasMultiple && !desktopControls && (
          <Text testID="image-counter" pointerEvents="none" style={styles.counter}>
            {`${index + 1} / ${gallery.length}`}
          </Text>
        )}
      </Animated.View>
    </Modal>
  );
};

export const ImageLightboxSlide: React.FC<SlideProps> = ({
  uri, cachedUri, mimeType, onClose, pagerSwipe = false, onZoomChange,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const cached = cachedUri ?? (uri && isHttpUrl(uri) ? peekCachedImagePath(uri) : undefined);
  // 已解析的本地/blob 地址直接交给加载器，Web 异步解析不能再替换回远程 URL。
  const { displayUri, loading, failed } = useCachedRemoteImage(cached || uri, {
    mimeHint: mimeType,
  });
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // 仅下拉关闭手势影响遮罩，焦点缩放产生的位移不应让背景变透明。
  const dismissTranslateY = useRef(new Animated.Value(0)).current;
  /** 图片加载完成后再淡入，避免黑屏后图片突然跳出。 */
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const imageRevealed = useRef(false);
  const currentScale = useRef(1);
  const currentTranslate = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const usedMultiTouch = useRef(false);
  const gestureAxis = useRef<'x' | 'y' | null>(null);
  const gestureStartedZoomed = useRef(false);
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
    dismissTranslateY.setValue(0);
    pinchStartDistance.current = 0;
    pinchStartScale.current = 1;
    usedMultiTouch.current = false;
    moved.current = false;
  }, [clearLongPress, dismissTranslateY, scale, translateX, translateY]);

  const revealImage = useCallback(() => {
    if (imageRevealed.current) {
      return;
    }
    imageRevealed.current = true;
    Animated.timing(imageOpacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [imageOpacity]);

  const handleImageLoadDimensions = useCallback(
    (size: { width: number; height: number }) => {
      setImageSize((prev) =>
        prev && prev.width === size.width && prev.height === size.height ? prev : size,
      );
      revealImage();
    },
    [revealImage],
  );

  useEffect(() => {
    resetTransform();
    if (!displayUri) {
      return () => clearLongPress();
    }

    let cancelled = false;
    imageRevealed.current = false;
    imageOpacity.setValue(0);
    Image.getSize(
      displayUri,
      (w, h) => {
        if (!cancelled) {
          handleImageLoadDimensions({ width: w, height: h });
        }
      },
      () => {
        if (!cancelled) {
          revealImage();
        }
      },
    );
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) {
        revealImage();
      }
    }, REVEAL_FALLBACK_MS);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      clearLongPress();
    };
  }, [
    displayUri,
    resetTransform,
    clearLongPress,
    imageOpacity,
    handleImageLoadDimensions,
    revealImage,
  ]);

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

  const clampTranslate = useCallback(
    (x: number, y: number, nextScale: number) => {
      const layout = getImageLayout();
      // contain 的留白不属于图片；不足一屏的轴保持居中，避免放大后露出更多空白。
      const maxX = Math.max(0, (layout.w * nextScale - width) / 2);
      const maxY = Math.max(0, (layout.h * nextScale - height) / 2);
      return {
        x: maxX > 0 ? clamp(x, -maxX, maxX) : 0,
        y: maxY > 0 ? clamp(y, -maxY, maxY) : 0,
      };
    },
    [getImageLayout, height, width],
  );

  const applyScale = useCallback(
    (next: number) => {
      const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
      const position = clampTranslate(
        currentTranslate.current.x,
        currentTranslate.current.y,
        clamped,
      );
      currentScale.current = clamped;
      currentTranslate.current = position;
      scale.setValue(clamped);
      translateX.setValue(position.x);
      translateY.setValue(position.y);
      onZoomChange?.(clamped > MIN_SCALE);
    },
    [clampTranslate, onZoomChange, scale, translateX, translateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          usedMultiTouch.current = evt.nativeEvent.touches.length >= 2;
          gestureAxis.current = null;
          gestureStartedZoomed.current = currentScale.current > MIN_SCALE;
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
          } else if (!usedMultiTouch.current && !gestureStartedZoomed.current) {
            if (pagerSwipe) {
              if (!gestureAxis.current && moved.current) {
                if (Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2) gestureAxis.current = 'x';
                else if (Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2) gestureAxis.current = 'y';
              }
              // 水平滑动由原生分页器跟手滚动，这里不再平移图片。
              if (gestureAxis.current !== 'y') return;
            }
            translateY.setValue(gesture.dy);
            dismissTranslateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (evt, gesture) => {
          clearLongPress();

          if (gestureAxis.current === 'x') {
            gestureAxis.current = null;
            lastTapTime.current = 0;
            return;
          }

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
            if (
              !usedMultiTouch.current && !gestureStartedZoomed.current &&
              (!pagerSwipe || gestureAxis.current === 'y') &&
              Math.abs(gesture.dy) > 100
            ) {
              onClose();
              return;
            } else {
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
              Animated.spring(dismissTranslateY, {
                toValue: 0,
                useNativeDriver: false,
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
            // 命中检测需还原缩放和平移，不能继续使用放大前的图片边界。
            const imageX =
              (locationX - width / 2 - currentTranslate.current.x) / currentScale.current + width / 2;
            const imageY =
              (locationY - height / 2 - currentTranslate.current.y) / currentScale.current + height / 2;
            const isInside =
              imageX >= layout.x &&
              imageX <= layout.x + layout.w &&
              imageY >= layout.y &&
              imageY <= layout.y + layout.h;

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
                  onZoomChange?.(false);
                } else {
                  const nextScale = 3;
                  // 默认绕容器中心缩放，用位移补偿让双击处的图片内容留在原位。
                  const next = clampTranslate(
                    (width / 2 - locationX) * (nextScale - 1),
                    (height / 2 - locationY) * (nextScale - 1),
                    nextScale,
                  );
                  currentScale.current = nextScale;
                  currentTranslate.current = next;
                  onZoomChange?.(true);
                  Animated.parallel([
                    Animated.spring(scale, { toValue: nextScale, useNativeDriver: true }),
                    Animated.spring(translateX, { toValue: next.x, useNativeDriver: true }),
                    Animated.spring(translateY, { toValue: next.y, useNativeDriver: true }),
                  ]).start();
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
          gestureAxis.current = null;
          longPressTriggered.current = false;
          pinchStartDistance.current = 0;
          usedMultiTouch.current = false;
          moved.current = false;
          if (currentScale.current === MIN_SCALE) {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(dismissTranslateY, { toValue: 0, useNativeDriver: false }).start();
          }
        },
      }),
    [
      applyScale,
      canSave,
      clampTranslate,
      clearLongPress,
      dismissTranslateY,
      getImageLayout,
      handleSaveImage,
      height,
      onClose,
      onZoomChange,
      pagerSwipe,
      scale,
      translateX,
      translateY,
      width,
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

  const backgroundColor = dismissTranslateY.interpolate({
    inputRange: [-height / 2, 0, height / 2],
    outputRange: ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.96)', 'rgba(0,0,0,0.5)'],
    extrapolate: 'clamp',
  });

  return (
    <>
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
              opacity: imageOpacity,
              transform: [{ translateX }, { translateY }, { scale }],
            },
          ]}
        >
          {displayUri ? (
            <PlatformImage
              uri={displayUri}
              style={{ width, height }}
              resizeMode="contain"
              fadeDuration={0}
              onLoadDimensions={handleImageLoadDimensions}
            />
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
    </>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    marginHorizontal: 6,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(32,32,32,0.65)',
  },
  previousArrow: {
    left: 16,
  },
  nextArrow: {
    right: 16,
  },
  counter: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    color: '#FFFFFF',
    backgroundColor: 'rgba(32,32,32,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
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
