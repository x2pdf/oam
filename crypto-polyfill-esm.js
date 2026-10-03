import { Platform } from 'react-native';
import { scrypt } from 'ethers';
import { registerNativeScrypt } from './scrypt-native';

// 必须排在 ./crypto-polyfill 之后 import（ESM 按顺序求值），
// 这样 ethers 的 lib.esm 加载时 crypto 已经装好。
// 这里注册的是 `import 'ethers'` 拿到的那份；`require('ethers')` 那份见 crypto-polyfill.js。
if (Platform.OS !== 'web') {
  registerNativeScrypt(scrypt, 'esm');
}
