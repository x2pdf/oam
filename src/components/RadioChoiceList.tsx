import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

export type RadioChoiceOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly RadioChoiceOption[];
  itemStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

/**
 * Cross-platform radio list.
 * Paper's iOS RadioButton is a checkmark with opacity 0 when unchecked, so rows
 * look blank. These View circles stay visible on iOS, Android, and web.
 */
export function RadioChoiceList({
  value,
  onValueChange,
  options,
  itemStyle,
  labelStyle,
}: Props) {
  const theme = useTheme();

  return (
    <View>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableRipple
            key={option.value}
            onPress={() => onValueChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            borderless
          >
            <View style={[styles.item, itemStyle]}>
              <Text
                variant="bodyLarge"
                style={[styles.label, { color: theme.colors.onSurface }, labelStyle]}
              >
                {option.label}
              </Text>
              <View
                style={[
                  styles.radioOuter,
                  {
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {selected ? (
                  <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />
                ) : null}
              </View>
            </View>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    minHeight: 48,
  },
  label: {
    flexShrink: 1,
    flexGrow: 1,
    paddingRight: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
