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
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
