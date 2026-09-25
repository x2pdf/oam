import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

export type AppModalAction = {
  label: string;
  onPress: () => void | Promise<void>;
  mode?: 'text' | 'contained' | 'outlined';
  loading?: boolean;
  disabled?: boolean;
  textColor?: string;
  style?: any;
};

type AppModalContentProps = {
  title: string;
  children?: React.ReactNode;
  actions?: AppModalAction[];
  scrollable?: boolean;
  scrollMaxHeight: number;
  clipOverflow?: boolean;
  onActionPress: (action: AppModalAction) => void;
};

export function AppModalContent({
  title,
  children,
  actions,
  scrollable = false,
  scrollMaxHeight,
  clipOverflow = true,
  onActionPress,
}: AppModalContentProps) {
  const lastIndex = (actions?.length ?? 0) - 1;
  const hasActions = !!actions && actions.length > 0;
  const stacked = (actions?.length ?? 0) >= 3;

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
      <View style={hasActions ? (clipOverflow ? styles.body : styles.bodyNoClip) : undefined}>
        {children}
      </View>
    )
  ) : null;

  return (
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
              onPress={() => onActionPress(action)}
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
  );
}

const styles = StyleSheet.create({
  modalInner: {
    width: '100%',
    flexShrink: 1,
  },
  body: {
    marginBottom: 16,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  bodyNoClip: {
    marginBottom: 16,
    maxWidth: '100%',
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
