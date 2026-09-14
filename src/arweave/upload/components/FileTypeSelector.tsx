import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { UPLOAD_FILE_TYPES, UploadFileType } from '../constants';

type Props = {
  value: UploadFileType;
  onChange: (type: UploadFileType) => void;
};

function TypeChip({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Button
      mode="outlined"
      compact
      onPress={onPress}
      buttonColor={selected ? theme.colors.primary : undefined}
      textColor={selected ? theme.colors.onPrimary : theme.colors.onSurface}
      style={[
        styles.chip,
        { borderColor: selected ? theme.colors.primary : theme.colors.outline },
      ]}
      labelStyle={styles.chipLabel}
    >
      {label}
    </Button>
  );
}

export function FileTypeSelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View>
      <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurface }]}>
        {t('arweave.upload.fileTypeLabel')}
      </Text>
      <View style={styles.wrap}>
        {UPLOAD_FILE_TYPES.map((type) => (
          <TypeChip
            key={type}
            selected={value === type}
            label={t(`arweave.upload.fileType.${type}`)}
            onPress={() => onChange(type)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderRadius: 6 },
  chipLabel: { fontSize: 12, marginVertical: 2, marginHorizontal: 6 },
});
