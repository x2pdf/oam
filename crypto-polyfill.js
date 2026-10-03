import { Platform } from 'react-native';

// react-native-quick-crypto 依赖原生 TurboModule（QuickBase64），
// 在 Web 环境（浏览器 / Tauri 桌面）中 TurboModuleRegistry 不可用，
// 会导致白屏。Web 环境自带 crypto.subtle，无需 polyfill。
//
// 必须作为独立模块、在 App 之前 import：ESM 的 import 会提升，
// 若 polyfill 写在 index.js 里，会在 App（及 arweave）加载之后才执行。
if (Platform.OS !== 'web') {
  const { install } = require('react-native-quick-crypto');
  install();

  // ethers 的 keystore 加解密默认走纯 JS scrypt（N=131072 时在手机上要几十秒）。
  // 这里注册 `require('ethers')`（lib.commonjs）那份；App 里 `import 'ethers'`
  // 拿到的是 lib.esm 另一份，见 crypto-polyfill-esm.js。
  const { registerNativeScrypt } = require('./scrypt-native');
  registerNativeScrypt(require('ethers').scrypt, 'cjs');
}
