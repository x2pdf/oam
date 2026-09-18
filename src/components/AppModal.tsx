import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { isDesktopOs } from '../theme/layout';
import { getModalSurfaceColor } from '../theme';

const KEYBOARD_BOTTOM_PADDING = 16;
/** Title, action buttons, modal margin/padding, and scroll margin (not the scroll body). */
const MODAL_CHROME_ESTIMATE = 184;
const MIN_SCROLL_HEIGHT = 120;
const KEYBOARD_SCROLL_CONTENT_PADDING = 32;

function readKeyboardHeight(): number {
  const metrics = Keyboard.metrics();
  return metrics?.height ? Math.round(metrics.height) : 0;
}

export type AppModalAction = {
  label: string;
  onPress: () => void | Promise<void>;
  mode?: 'text' | 'contained' | 'outlined';
  loading?: boolean;
  disabled?: boolean;
  textColor?: string;
  style?: any;
};

type AppModalProps = {
  visible: boolean;
  title: string;
  children?: React.ReactNode;
  actions?: AppModalAction[];
  onDismiss?: () => void;
  dismissable?: boolean;
  scrollable?: boolean;
};

export function AppModal({
  visible,
  title,
  children,
  actions,
  onDismiss,
  dismissable = true,
  scrollable = false,
}: AppModalProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const centered = isDesktopOs() && width > height;
  const modalWidth = width * 0.4;
  const lastIndex = (actions?.length ?? 0) - 1;
  const hasActions = !!actions && actions.length > 0;
  const stacked = (actions?.length ?? 0) >= 3;

  // Avoid KeyboardAvoidingView inside a vertically-centered Modal: padding changes
  // content height → Modal recenters → KAV recalculates → visible jitter loop.
  // On iOS, anchor above the keyboard via wrapper flex-end + paddingBottom instead.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const resetKeyboardOffset = () => {
    Keyboard.dismiss();
    setKeyboardHeight(0);
  };

  const handleActionPress = (action: AppModalAction) => {
    resetKeyboardOffset();
    void action.onPress();
  };

  const anyActionLoading = actions?.some((action) => action.loading) ?? false;

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }

    const syncKeyboardHeight = () => {
      const next = readKeyboardHeight();
      if (next > 0) {
        setKeyboardHeight((prev) => (prev === next ? prev : next));
      }
    };

    // autoFocus can fire keyboardWillShow before listeners attach; read metrics directly.
    syncKeyboardHeight();
    const frameId = requestAnimationFrame(syncKeyboardHeight);
    const fallbackTimer = setTimeout(syncKeyboardHeight, 100);

    const showEvents =
      Platform.OS === 'ios' ? (['keyboardWillShow'] as const) : (['keyboardDidShow'] as const);
    const hideEvents =
      Platform.OS === 'ios'
        ? (['keyboardWillHide', 'keyboardDidHide'] as const)
        : (['keyboardDidHide'] as const);

    const subscriptions = [
      ...showEvents.map((event) =>
        Keyboard.addListener(event, (e) => {
          const next = Math.round(e.endCoordinates.height);
          setKeyboardHeight((prev) => (prev === next ? prev : next));
        }),
      ),
      ...hideEvents.map((event) =>
        Keyboard.addListener(event, () => {
          setKeyboardHeight(0);
        }),
      ),
    ];

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(fallbackTimer);
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [visible]);

  useEffect(() => {
    if (anyActionLoading) {
      resetKeyboardOffset();
    }
  }, [anyActionLoading]);

  useEffect(() => {
    if (!visible || !scrollable || keyboardHeight <= 0) return;
    const frameId = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [keyboardHeight, scrollable, visible]);

  // iOS does not resize the window for the keyboard; anchor the modal above it.
  // Android uses adjustResize, so the window height already shrinks — do not
  // apply an extra offset or the layout will fight and jitter.
  const keyboardOffset = Platform.OS === 'ios' ? keyboardHeight : 0;
  const iosKeyboardStyle =
    keyboardOffset > 0
      ? [styles.keyboardVisibleWrapper, { paddingBottom: keyboardOffset + KEYBOARD_BOTTOM_PADDING }]
      : undefined;
  const availableHeight = Math.max(height - keyboardOffset, 240);
  const scrollMaxFromChrome = availableHeight - MODAL_CHROME_ESTIMATE;
  const scrollMaxHeight = Math.max(
    MIN_SCROLL_HEIGHT,
    keyboardHeight > 0
      ? scrollMaxFromChrome
      : Math.min(scrollMaxFromChrome, availableHeight * 0.65),
  );
  const scrollContentStyle = [
    styles.scrollContent,
    keyboardHeight > 0 && { paddingBottom: KEYBOARD_SCROLL_CONTENT_PADDING },
  ];

  const modalSurfaceStyle = theme.dark
    ? {
        backgroundColor: getModalSurfaceColor(theme.colors, true),
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
      }
    : { backgroundColor: getModalSurfaceColor(theme.colors, false) };

  const body = children ? (
    scrollable ? (
      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={hasActions ? styles.body : undefined}>{children}</View>
    )
  ) : null;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        dismissable={dismissable}
        style={iosKeyboardStyle}
        contentContainerStyle={[
          styles.modalContent,
          modalSurfaceStyle,
          centered && {
            width: modalWidth,
            maxWidth: modalWidth,
            alignSelf: 'center',
            marginHorizontal: 0,
          },
        ]}
      >
        <View style={styles.modalInner}>
          <Text variant="titleMedium" style={styles.modalTitle}>
            {title}
          </Text>
          {body}
          {hasActions ? (
            <View style={[styles.modalButtons, stacked && styles.modalButtonsStacked]}>
              {actions.map((action, index) => (
                <Button
                  key={`${action.label}-${index}`}
                  mode={action.mode ?? (index === lastIndex ? 'contained' : 'text')}
                  onPress={() => handleActionPress(action)}
                  loading={action.loading}
                  disabled={action.disabled}
                  textColor={action.textColor}
                  style={[styles.modalButton, action.style, stacked && styles.modalButtonStacked]}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          ) : null}
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  keyboardVisibleWrapper: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 8,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  modalInner: {
    width: '100%',
    flexShrink: 1,
  },
  body: {
    marginBottom: 16,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  scroll: {
    marginBottom: 16,
  },
  scrollContent: {
    paddingBottom: 4,
    paddingRight: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButtonsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  modalButton: {
    marginLeft: 0,
    borderRadius: 8,
  },
  modalButtonStacked: {
    marginLeft: 0,
    width: '100%',
  },
});
