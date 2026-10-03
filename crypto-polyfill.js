import { Platform } from 'react-native';

// react-native-quick-crypto 依赖原生 TurboModule（QuickBase64），
// 在 Web 环境（浏览器 / Tauri 桌面）中 TurboModuleRegistry 不可用，
// 会导致白屏。Web 环境自带 crypto.subtle，无需 polyfill。
//
// 必须作为独立模块、在 App 之前 import：ESM 的 import 会提升，
// 若 polyfill 写在 index.js 里，会在 App（及 arweave）加载之后才执行。
if (Platform.OS !== 'web') {
  const { install, scrypt: nativeScrypt } = require('react-native-quick-crypto');
  install();

  // ethers 的 keystore 加解密默认走纯 JS scrypt（N=131072 时在手机上要几十秒）。
  // 改用原生 scrypt；原生不可用时回退到 ethers 自带的 JS 实现。
  const { scrypt } = require('ethers');
  const jsScrypt = scrypt._;
  scrypt.register(
    (passwd, salt, N, r, p, dkLen, progress) =>
      new Promise((resolve) => {
        const fallback = () => resolve(jsScrypt(passwd, salt, N, r, p, dkLen, progress));
        try {
          nativeScrypt(
            passwd,
            salt,
            dkLen,
            // OpenSSL 需要 128 * N * r 字节工作内存，另留余量。
            { N, r, p, maxmem: 128 * N * r + 1024 * 1024 },
            (err, key) => (err || !key ? fallback() : resolve(new Uint8Array(key))),
          );
        } catch {
          fallback();
        }
      }),
  );
}
