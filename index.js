import 'react-native-get-random-values';
import { Platform } from 'react-native';

// react-native-quick-crypto 依赖原生 TurboModule（QuickBase64），
// 在 Web 环境（浏览器 / Tauri 桌面）中 TurboModuleRegistry 不可用，
// 会导致白屏。Web 环境自带 crypto.subtle，无需 polyfill。
if (Platform.OS !== 'web') {
  const { subtle } = require('react-native-quick-crypto');
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    globalThis.crypto = { subtle };
  }
}
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
