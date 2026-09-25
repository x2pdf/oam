import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { RootStackParamList } from '../types';
import {
  ATTACHMENT_FILE_TYPES,
  AttachmentFileType,
  AttachmentSource,
  FILE_TYPE_TO_MIME,
  defaultLabelI18nKey,
  resolveAttachmentHref,
} from '../utils/attachment';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Always use the default keyboard for URI/ID fields.
 * - iOS: `url` is ASCII-only and can stick on the next field.
 * - Android: `url` maps to TYPE_TEXT_VARIATION_URI; OEM keyboards may still
 *   prefer Latin layout, and sibling re-renders can interrupt CJK IME on Fabric.
 */
const URI_INPUT_PROPS = {
  multiline: true,
  numberOfLines: 3,
  keyboardType: 'default' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  autoComplete: 'off' as const,
  spellCheck: false,
  importantForAutofill: 'no' as const,
};

const LABEL_INPUT_PROPS = {
  keyboardType: 'default' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  autoComplete: 'off' as const,
  spellCheck: false,
  importantForAutofill: 'no' as const,
};

const FOCUS_SCROLL_GAP = 16;
const FOCUS_SCROLL_DELAY_MS = Platform.OS === 'ios' ? 250 : 100;

type AttachmentUriInputProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
};

/** Isolated so label keystrokes do not re-render this multiline field (Fabric CJK IME on iOS/Android). */
const AttachmentUriInput = React.memo(function AttachmentUriInput({
  label,
  placeholder,
  value,
  onChangeText,
  onFocus,
}: AttachmentUriInputProps) {
  return (
    <TextInput
      mode="outlined"
      label={label}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      {...URI_INPUT_PROPS}
      onFocus={onFocus}
      style={styles.uriInput}
      contentStyle={styles.uriContent}
    />
  );
});

type AttachmentLabelInputProps = {
  label: string;
  placeholder: string;
  resetKey: number;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
};

/**
 * Paper's outlined TextInput is controlled and re-runs label animations on every
 * `value` change, which cancels CJK composition. Keep a native uncontrolled
 * field and only sync Paper after blur (IME already committed).
 */
const AttachmentLabelInput = React.memo(function AttachmentLabelInput({
  label,
  placeholder,
  resetKey,
  onChangeText,
  onFocus,
}: AttachmentLabelInputProps) {
  const draftRef = useRef('');

  useEffect(() => {
    draftRef.current = '';
  }, [resetKey]);

  return (
    <TextInput
      key={resetKey}
      mode="outlined"
      label={label}
      placeholder={placeholder}
      defaultValue=""
      {...LABEL_INPUT_PROPS}
      render={(props) => {
        const {
          value: _paperValue,
          onChangeText: paperOnChangeText,
          onBlur,
          onFocus: paperOnFocus,
          ...rest
        } = props;
        return (
          <RNTextInput
            {...rest}
            {...LABEL_INPUT_PROPS}
            onChangeText={(text) => {
              draftRef.current = text;
              onChangeText(text);
            }}
            onFocus={(e) => {
              paperOnFocus?.(e);
              onFocus?.();
            }}
            onBlur={(e) => {
              paperOnChangeText?.(draftRef.current);
              onBlur?.(e);
            }}
          />
        );
      }}
    />
  );
});

const SOURCE_OPTIONS: { value: AttachmentSource; labelKey: string; icon: string }[] = [
  { value: 'arweave-id', labelKey: 'send.attachmentSourceArweaveId', icon: 'identifier' },
  { value: 'arweave-uri', labelKey: 'send.attachmentSourceArweaveUri', icon: 'link' },
  { value: 'uri', labelKey: 'send.attachmentSourceUri', icon: 'web' },
];

type SelectionChipButtonProps = {
  selected: boolean;
  onPress: () => void;
  label: string;
  icon?: string;
};

function SelectionChipButton({ selected, onPress, label, icon }: SelectionChipButtonProps) {
  const theme = useTheme();

  return (
    <Button
      mode="outlined"
      compact
      icon={icon}
      onPress={onPress}
      buttonColor={selected ? theme.colors.primary : undefined}
      textColor={selected ? theme.colors.onPrimary : theme.colors.onSurface}
      style={[
        styles.typeButton,
        { borderColor: selected ? theme.colors.primary : theme.colors.outline },
      ]}
      labelStyle={styles.typeLabel}
    >
      {label}
    </Button>
  );
}

export default function AddAttachmentScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const [source, setSource] = useState<AttachmentSource>('arweave-id');
  const [fileType, setFileType] = useState<AttachmentFileType>('other');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [labelResetKey] = useState(0);
  const labelRef = useRef('');
  const scrollRef = useRef<ScrollView>(null);
  const uriWrapRef = useRef<View>(null);
  const labelWrapRef = useRef<View>(null);
  const focusedFieldRef = useRef<React.RefObject<View | null> | null>(null);
  const keyboardHeightRef = useRef(0);
  const scrollYRef = useRef(0);

  const ensureFieldVisible = useCallback((fieldRef: React.RefObject<View | null> | null) => {
    const node = fieldRef?.current;
    if (!node) return;
    node.measureInWindow((_x, y, _w, h) => {
      const windowH = Dimensions.get('window').height;
      const keyboardH =
        keyboardHeightRef.current || Math.round(Keyboard.metrics()?.height ?? 0);
      const visibleBottom = Platform.OS === 'ios' ? windowH - keyboardH : windowH;
      const overflow = y + h + FOCUS_SCROLL_GAP - visibleBottom;
      if (overflow > 0) {
        scrollRef.current?.scrollTo({
          y: Math.max(scrollYRef.current + overflow, 0),
          animated: true,
        });
      }
    });
  }, []);

  const scrollFieldIntoView = useCallback(
    (fieldRef: React.RefObject<View | null>) => {
      focusedFieldRef.current = fieldRef;
      setTimeout(() => ensureFieldVisible(fieldRef), FOCUS_SCROLL_DELAY_MS);
    },
    [ensureFieldVisible],
  );

  const handleUriFocus = useCallback(() => {
    scrollFieldIntoView(uriWrapRef);
  }, [scrollFieldIntoView]);

  const handleLabelFocus = useCallback(() => {
    scrollFieldIntoView(labelWrapRef);
  }, [scrollFieldIntoView]);

  useEffect(() => {
    const showEvents =
      Platform.OS === 'ios' ? (['keyboardWillShow'] as const) : (['keyboardDidShow'] as const);
    const hideEvents =
      Platform.OS === 'ios'
        ? (['keyboardWillHide', 'keyboardDidHide'] as const)
        : (['keyboardDidHide'] as const);

    const subscriptions = [
      ...showEvents.map((event) =>
        Keyboard.addListener(event, (e) => {
          keyboardHeightRef.current = Math.round(e.endCoordinates.height);
          requestAnimationFrame(() => ensureFieldVisible(focusedFieldRef.current));
        }),
      ),
      ...hideEvents.map((event) =>
        Keyboard.addListener(event, () => {
          keyboardHeightRef.current = 0;
        }),
      ),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [ensureFieldVisible]);

  const uriError = useMemo(() => {
    if (source === 'arweave-id' || !input.trim()) return null;
    const resolved = resolveAttachmentHref(source, input);
    if (resolved.ok) return null;
    if (resolved.error === 'invalid-url') return t('send.attachmentInvalidUrl');
    return null;
  }, [input, source, t]);

  const placeholder =
    source === 'arweave-id' ? t('send.attachmentIdPlaceholder') : t('send.attachmentUriPlaceholder');

  const uriFieldLabel =
    source === 'arweave-id' ? t('send.attachmentIdLabel') : t('send.attachmentUriLabel');

  const handleUriChange = useCallback((value: string) => {
    setInput(value);
    setError(null);
  }, []);

  const handleLabelChange = useCallback((value: string) => {
    labelRef.current = value;
  }, []);

  const handleConfirm = () => {
    const trimmedInput = input.trim();
    if (trimmedInput !== input) setInput(trimmedInput);

    const resolved = resolveAttachmentHref(source, trimmedInput);
    if (!resolved.ok) {
      if (resolved.error === 'empty') {
        setError(
          source === 'arweave-id' ? t('send.attachmentEmptyId') : t('send.attachmentEmptyUri'),
        );
      } else if (resolved.error === 'invalid-id') {
        setError(t('send.attachmentInvalidId'));
      } else {
        setError(t('send.attachmentInvalidUrl'));
      }
      return;
    }

    const mime = FILE_TYPE_TO_MIME[fileType];
    const trimmedLabel = labelRef.current.trim();
    navigation.navigate({
      name: 'SendData',
      params: {
        pendingAttachment: {
          source,
          fileType,
          input: trimmedInput,
          href: resolved.href,
          mime,
          label: trimmedLabel || t(defaultLabelI18nKey(fileType)),
          arId: resolved.arId,
        },
        pendingAttachmentNonce: Date.now(),
      },
      merge: true,
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={scrollFill}
        contentContainerStyle={[
          styles.content,
          listContentStyle,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
      >
        <ListColumn>
          <Text variant="labelLarge" style={[styles.fieldLabel, { color: theme.colors.onSurface }]}>
            {t('send.attachmentSource')}
          </Text>
          <View style={styles.chipWrap}>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectionChipButton
                key={opt.value}
                selected={source === opt.value}
                icon={opt.icon}
                onPress={() => {
                  setSource(opt.value);
                  setError(null);
                }}
                label={t(opt.labelKey)}
              />
            ))}
          </View>

          <Text
            variant="labelLarge"
            style={[styles.fieldLabel, styles.section, { color: theme.colors.onSurface }]}
          >
            {t('send.attachmentFileType')}
          </Text>
          <View style={styles.chipWrap}>
            {ATTACHMENT_FILE_TYPES.map((type) => (
              <SelectionChipButton
                key={type}
                selected={fileType === type}
                onPress={() => setFileType(type)}
                label={t(`send.attachmentType.${type}`)}
              />
            ))}
          </View>

          <View ref={uriWrapRef} collapsable={false}>
            <AttachmentUriInput
              label={uriFieldLabel}
              placeholder={placeholder}
              value={input}
              onChangeText={handleUriChange}
              onFocus={handleUriFocus}
            />
          </View>
          {source === 'arweave-id' && (
            <HelperText type="info" visible style={{ paddingHorizontal: 0 }}>
              {t('send.attachmentIdHint')}
            </HelperText>
          )}
          <HelperText type="error" visible={!!(error || uriError)}>
            {error || uriError || ' '}
          </HelperText>

          <View ref={labelWrapRef} collapsable={false}>
            <AttachmentLabelInput
              resetKey={labelResetKey}
              label={t('send.attachmentLabel')}
              placeholder={t('send.attachmentLabelPlaceholder')}
              onChangeText={handleLabelChange}
              onFocus={handleLabelFocus}
            />
          </View>

          <View style={styles.buttonGroup}>
            <Button mode="contained" onPress={handleConfirm} style={styles.button}>
              {t('common.confirm')}
            </Button>
            <Button mode="outlined" onPress={() => navigation.goBack()} style={styles.button}>
              {t('common.cancel')}
            </Button>
          </View>
        </ListColumn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  fieldLabel: {
    marginBottom: 4,
    fontWeight: '600',
  },
  section: {
    marginTop: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    borderRadius: 6,
  },
  typeLabel: {
    fontSize: 12,
    marginVertical: 2,
    marginHorizontal: 6,
  },
  uriInput: {
    minHeight: 88,
  },
  uriContent: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  buttonGroup: {
    marginTop: 32,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
});
