const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { resolver } = config;

config.resolver = {
  ...resolver,
  assetExts: [...resolver.assetExts, 'wasm'],
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
