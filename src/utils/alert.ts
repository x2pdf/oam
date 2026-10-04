import { Alert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Cross-platform alert that works on iOS / Android / Web (Tauri).
 *
 * React Native 的 `Alert.alert()` 在 Web 上是 no-op（只处理 ios / android）。
 * Tauri 桌面端的 WebView 中 `window.alert()` 同样不会弹出，因此走 dialog 插件的原生消息框；
 * 纯浏览器环境回退到 `window.alert()`。
 *
 * - 无 buttons 时：直接弹出提示。
 * - 有 buttons 时：native 走 Alert.alert 带回调；web 在提示关闭后触发第一个按钮。
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const onClose = () => buttons?.[0]?.onPress?.();
  if (isTauri()) {
    import('@tauri-apps/plugin-dialog')
      .then(({ message: showMessage }) =>
        showMessage(message ?? '', { title, okLabel: buttons?.[0]?.text }),
      )
      .catch((e) => console.error('showAlert failed', e))
      .finally(onClose);
    return;
  }
  window.alert(message ? `${title}\n\n${message}` : title);
  onClose();
}

/**
 * Cross-platform confirm dialog.
 *
 * - Native (iOS/Android): 使用 Alert.alert 带 cancel + confirm 两个按钮。
 * - Tauri: 使用 dialog 插件的原生确认框。
 * - Web: 使用 window.confirm()，返回 true/false。
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
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, [
      { text: cancelText ?? 'Cancel', style: 'cancel', onPress: onCancel },
      { text: confirmText ?? 'OK', style: 'destructive', onPress: onConfirm },
    ]);
    return;
  }
  if (isTauri()) {
    import('@tauri-apps/plugin-dialog')
      .then(({ ask }) =>
        ask(message, { title, kind: 'warning', okLabel: confirmText, cancelLabel: cancelText }),
      )
      .then((ok) => (ok ? onConfirm() : onCancel?.()))
      .catch((e) => {
        console.error('showConfirm failed', e);
        onCancel?.();
      });
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  if (window.confirm(text)) {
    onConfirm();
  } else {
    onCancel?.();
  }
}
