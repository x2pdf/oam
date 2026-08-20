import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

export type AppModalAction = {
  label: string;
  onPress: () => void | Promise<void>;
  mode?: 'text' | 'contained' | 'outlined';
  loading?: boolean;
  disabled?: boolean;
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
  const lastIndex = (actions?.length ?? 0) - 1;
  const hasActions = !!actions && actions.length > 0;

  const body = children ? (
    scrollable ? (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
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
        ]}
      >
        <Text variant="titleMedium" style={styles.modalTitle}>
          {title}
        </Text>
        {body}
        {hasActions ? (
          <View style={styles.modalButtons}>
            {actions.map((action, index) => (
              <Button
                key={`${action.label}-${index}`}
                mode={action.mode ?? (index === lastIndex ? 'contained' : 'text')}
                onPress={action.onPress}
                loading={action.loading}
                disabled={action.disabled}
                style={styles.modalButton}
              >
                {action.label}
              </Button>
            ))}
          </View>
        ) : null}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 360,
    marginBottom: 16,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  modalButton: {
    marginLeft: 8,
  },
});
