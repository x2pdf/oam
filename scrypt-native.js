/**
 * Routes ethers' async scrypt through react-native-quick-crypto. Falls back to the
 * pure-JS implementation (tens of seconds at N=131072 on a phone) if native fails.
 *
 * Metro bundles ethers twice: `import 'ethers'` resolves lib.esm, `require('ethers')`
 * resolves lib.commonjs, and each copy has its own scrypt registry. Call this once per
 * copy (see crypto-polyfill.js and crypto-polyfill-esm.js), otherwise the copy the app
 * actually uses stays on the JS path.
 */
export function registerNativeScrypt(ethersScrypt, label) {
  const { scrypt: nativeScrypt } = require('react-native-quick-crypto');
  const jsScrypt = ethersScrypt._;
  ethersScrypt.register(
    (passwd, salt, N, r, p, dkLen, progress) =>
      new Promise((resolve) => {
        const fallback = (reason) => {
          console.warn(`[scrypt:${label}] native failed, falling back to JS (N=${N}):`, reason);
          resolve(jsScrypt(passwd, salt, N, r, p, dkLen, progress));
        };
        try {
          nativeScrypt(
            passwd,
            salt,
            dkLen,
            // OpenSSL 需要 128 * N * r 字节工作内存，另留余量。
            { N, r, p, maxmem: 128 * N * r + 1024 * 1024 },
            (err, key) => {
              if (err || !key) {
                fallback(err ?? 'empty key');
                return;
              }
              resolve(new Uint8Array(key));
            },
          );
        } catch (e) {
          fallback(e);
        }
      }),
  );
}
