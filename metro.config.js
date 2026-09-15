const path = require('path');

// Polyfill Array.prototype.toReversed for Node < 20
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function() {
    return [...this].reverse();
  };
}

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { resolver } = config;
const defaultResolveRequest = resolver.resolveRequest;

const WEB_ONLY_MODULES = new Set([
  '@tauri-apps/plugin-dialog',
  '@tauri-apps/plugin-fs',
  '@tauri-apps/api',
]);

config.resolver = {
  ...resolver,
  assetExts: [...resolver.assetExts, 'wasm'],
  resolveRequest: (context, moduleName, platform) => {
    if (
      platform !== 'web' &&
      (WEB_ONLY_MODULES.has(moduleName) || moduleName.startsWith('@tauri-apps/'))
    ) {
      return { type: 'empty' };
    }
    // arweave 的 react-native 入口依赖 Node crypto；原生端改用 web 构建
    if (platform !== 'web' && moduleName === 'arweave') {
      return context.resolveRequest(
        context,
        path.resolve(__dirname, 'node_modules/arweave/web/index.js'),
        platform,
      );
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, _metroServer) => {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      // credentialless is recommended by expo-sqlite; require-corp breaks cross-origin assets.
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
