import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Modal, Portal, useTheme } from 'react-native-paper';
import { isDesktopOs } from '../theme/layout';
import { getModalSurfaceColor } from '../theme';
import { AppModalContent, type AppModalAction } from './AppModalContent';

export type { AppModalAction };

const KEYBOARD_BOTTOM_PADDING = 16;

function readKeyboardHeight(): number {
  const metrics = Keyboard.metrics();
  return metrics?.height ? Math.round(metrics.height) : 0;
}

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

  // Avoid KeyboardAvoidingView inside a vertically-centered Modal: padding changes
  // content height → Modal recenters → KAV recalculates → visible jitter loop.
  // On iOS, anchor above the keyboard via wrapper flex-end + paddingBottom instead.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  // iOS does not resize the window for the keyboard; anchor the modal above it.
  // Android uses adjustResize, so the window height already shrinks — do not
  // apply an extra offset or the layout will fight and jitter.
  const keyboardOffset = Platform.OS === 'ios' ? keyboardHeight : 0;
  const iosKeyboardStyle =
    keyboardOffset > 0
      ? [styles.keyboardVisibleWrapper, { paddingBottom: keyboardOffset + KEYBOARD_BOTTOM_PADDING }]
      : undefined;
  const availableHeight = Math.max(height - keyboardOffset, 240);
  const scrollMaxHeight = availableHeight * 0.5;

  const modalSurfaceStyle = theme.dark
    ? {
        backgroundColor: getModalSurfaceColor(theme.colors, true),
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
      }
    : { backgroundColor: getModalSurfaceColor(theme.colors, false) };

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
        <AppModalContent
          title={title}
          actions={actions}
          scrollable={scrollable}
          scrollMaxHeight={scrollMaxHeight}
          onActionPress={handleActionPress}
        >
          {children}
        </AppModalContent>
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
});
