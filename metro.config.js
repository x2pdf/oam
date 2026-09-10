const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { resolver } = config;
const defaultResolveRequest = resolver.resolveRequest;

const html2pdfFile = path.resolve(__dirname, 'node_modules/html2pdf.js/dist/html2pdf.js');
const html2canvasFile = path.resolve(__dirname, 'node_modules/html2canvas/dist/html2canvas.js');

const WEB_ONLY_MODULES = new Set([
  'html2pdf.js',
  'html2canvas',
  'jspdf',
  'canvg',
  'dompurify',
  '@tauri-apps/plugin-dialog',
  '@tauri-apps/plugin-fs',
  '@tauri-apps/api',
]);

config.resolver = {
  ...resolver,
  assetExts: [...resolver.assetExts, 'wasm'],
  extraNodeModules: {
    ...(resolver.extraNodeModules || {}),
    'html2pdf.js': path.resolve(__dirname, 'node_modules/html2pdf.js'),
    html2canvas: path.resolve(__dirname, 'node_modules/html2canvas'),
  },
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === 'canvg') {
      return { type: 'empty' };
    }
    if (
      platform !== 'web' &&
      (WEB_ONLY_MODULES.has(moduleName) || moduleName.startsWith('@tauri-apps/'))
    ) {
      return { type: 'empty' };
    }
    if (moduleName === 'html2pdf.js') {
      return { filePath: html2pdfFile, type: 'sourceFile' };
    }
    if (moduleName === 'html2canvas') {
      return { filePath: html2canvasFile, type: 'sourceFile' };
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
