import { Alert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

/**
 * Cross-platform alert that works on iOS / Android / Web (Tauri).
 *
 * React Native 的 `Alert.alert()` 在 Web 上是 no-op（只处理 ios / android），
 * 因此在 Web / Tauri 环境下回退到浏览器原生 `window.alert()`。
 *
 * - 无 buttons 时：直接弹出提示。
 * - 有 buttons 时：native 走 Alert.alert 带回调；web 走 window.alert 后自动触发第一个按钮。
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    window.alert(text);
    // web 的 window.alert 没有按钮回调，自动触发第一个按钮的 onPress
    if (buttons && buttons.length > 0 && buttons[0].onPress) {
      buttons[0].onPress();
    }
  } else {
    Alert.alert(title, message, buttons);
  }
}

/**
 * Cross-platform confirm dialog.
 *
 * - Native (iOS/Android): 使用 Alert.alert 带 cancel + confirm 两个按钮。
 * - Web/Tauri: 使用 window.confirm()，返回 true/false。
 *
 * @param onConfirm  用户确认时执行的回调
 * @param onCancel   用户取消时执行的回调（可选）
 */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  confirmText?: string,
  cancelText?: string,
): void {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    if (window.confirm(text)) {
      onConfirm();
    } else {
      onCancel?.();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelText ?? 'Cancel', style: 'cancel', onPress: onCancel },
      { text: confirmText ?? 'OK', style: 'destructive', onPress: onConfirm },
    ]);
  }
}
