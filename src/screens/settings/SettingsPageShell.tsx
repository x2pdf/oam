import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scrollFill } from '../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../theme/layout';

export function SettingsPageShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[
          styles.content,
          listContentStyle,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <ListColumn>
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated">
            <Card.Content>{children}</Card.Content>
          </Card>
        </ListColumn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
});
