import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Checkbox, useTheme, Card } from 'react-native-paper';

interface DisclaimerCardProps {
  title: string;
  items: string[];
  checkboxLabel: string;
  buttonLabel: string;
  onContinue: () => void;
}

export default function DisclaimerCard({
  title,
  items,
  checkboxLabel,
  buttonLabel,
  onContinue,
}: DisclaimerCardProps) {
  const theme = useTheme();
  const [checked, setChecked] = useState(false);

  return (
    <>
      <Text variant="headlineSmall" style={styles.title}>{title}</Text>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          {items.map((item, index) => (
            <View key={index} style={styles.disclaimerItem}>
              <Text variant="bodyLarge" style={styles.bullet}>•</Text>
              <Text variant="bodyMedium" style={styles.text}>{item}</Text>
            </View>
          ))}
        </Card.Content>
      </Card>

      <View style={styles.checkboxContainer}>
        <Checkbox.Android
          status={checked ? 'checked' : 'unchecked'}
          onPress={() => setChecked(!checked)}
          uncheckedColor={theme.colors.outline}
        />
        <Text
          variant="bodyMedium"
          style={styles.checkboxLabel}
          onPress={() => setChecked(!checked)}
        >
          {checkboxLabel}
        </Text>
      </View>

      <Button
        mode="contained"
        onPress={onContinue}
        disabled={!checked}
        style={styles.button}
      >
        {buttonLabel}
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  card: {
    marginBottom: 24,
    borderRadius: 12,
  },
  disclaimerItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  bullet: {
    marginRight: 10,
    fontSize: 20,
  },
  text: {
    flex: 1,
    lineHeight: 22,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    paddingRight: 20,
  },
  checkboxLabel: {
    flex: 1,
    marginLeft: 8,
  },
  button: {
    paddingVertical: 6,
  },
});
