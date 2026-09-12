import React, { useEffect, useState } from 'react';
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const next = Math.round(e.endCoordinates.height);
      setKeyboardHeight((prev) => (prev === next ? prev : next));
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [visible]);

  // iOS does not resize the window for the keyboard; shift the modal up once.
  // Android uses adjustResize, so the window height already shrinks — do not
  // apply an extra offset or the layout will fight and jitter.
  const keyboardOffset = Platform.OS === 'ios' ? keyboardHeight : 0;
  const availableHeight = Math.max(height - keyboardOffset, 240);
  const scrollMaxHeight = availableHeight * 0.5;

  const body = children ? (
    scrollable ? (
      <ScrollView
        style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
        contentContainerStyle={styles.scrollContent}
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
        contentContainerStyle={[
          styles.modalContent,
          { backgroundColor: theme.colors.surface },
          keyboardOffset > 0 && { marginBottom: keyboardOffset },
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
                  onPress={action.onPress}
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
