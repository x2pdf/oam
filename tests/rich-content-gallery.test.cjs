const assert = require('node:assert/strict');
const test = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');

// Render the real renderer and its private LinkAttachment; native leaves and
// device services are stubbed so we can exercise the actual thumbnail callbacks.
function renderer() {
  const states = new Map();
  const opens = [];
  const saves = [];
  const urls = [];
  let current;
  let cursor;
  const jsx = (type, props, key) => ({ type, props, key });
  const attachment = loadTypeScript('src/utils/attachment.ts', {
    imports: { '../config/arweaveGatewayConfig': { PRIMARY_ARWEAVE_GATEWAY: 'https://arweave.net/' } },
  });
  const { RichContentRenderer } = loadTypeScript('src/components/RichContentRenderer.tsx', {
    imports: {
      react: {
        useCallback: (callback) => callback,
        useState(initial) {
          const slots = states.get(current);
          const index = cursor++;
          if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
          return [slots[index], (next) => { slots[index] = next; }];
        },
      },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View: 'View', StyleSheet: { create: (styles) => styles } },
      'react-native-paper': {
        Text: 'Text', Portal: 'Portal', Snackbar: 'Snackbar',
        useTheme: () => ({ colors: { onSurface: '#000' } }),
      },
      'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
      '../adapter': { saveImageToAlbum: async (uri) => { saves.push(uri); } },
      '../adapter/openUrl': { openUrl: async (uri) => { urls.push(uri); } },
      '../utils/text': { truncateListText: (text) => text.slice(0, 12) },
      '../utils/attachment': attachment,
      './ContentCardImage': { ContentCardImage: 'ContentCardImage' },
      './ExternalOpenCard': { ExternalOpenCard: 'ExternalOpenCard' },
      './RefQuoteCard': { RefQuoteCard: 'RefQuoteCard' },
      './SelectableText': { SelectableText: 'SelectableText' },
      './ImageLightbox': { openImageLightbox: (...args) => opens.push(JSON.parse(JSON.stringify(args))) },
    },
  });
  function render(props, record = 'record') {
    const leaves = [];
    function visit(node, path) {
      if (Array.isArray(node)) {
        node.forEach((child, index) => visit(child, `${path}/${index}`));
      } else if (node && typeof node === 'object') {
        if (typeof node.type === 'function') {
          current = path;
          cursor = 0;
          if (!states.has(path)) states.set(path, []);
          visit(node.type(node.props), `${path}/render`);
        } else {
          leaves.push(node);
          visit(node.props.children, `${path}/children`);
        }
      }
    }
    visit(jsx(RichContentRenderer, props), record);
    return {
      images: leaves.filter((node) => node.type === 'ContentCardImage'),
      external: leaves.filter((node) => node.type === 'ExternalOpenCard'),
      leaves,
    };
  }
  return { render, opens, saves, urls };
}

const embedded = 'data:image/jpeg;base64,ZW1iZWRkZWQ=';
const remote = 'https://example.com/photo.png';
const linked = 'https://example.com/image-attachment';

test('remote image opens an ordered same-record gallery with resolved and cached URI hints', () => {
  const app = renderer();
  const cacheMap = { [remote]: 'file:///cached-photo.png', [linked]: 'file:///cached-attachment.webp' };
  const items = [
    { type: 'text', content: 'not an image' },
    { type: 'image', data: embedded, alt: 'embedded' },
    { type: 'link', href: 'https://example.com/document.png', mime: 'application/pdf', label: 'PDF' },
    { type: 'image', data: remote, alt: 'remote' },
    { type: 'ref', ref: 'reference', action: 'reply' },
    { type: 'link', href: linked, mime: 'image/webp', label: 'attachment' },
  ];
  const view = app.render({ items, cacheMap });
  assert.equal(view.images.length, 3);
  assert.equal(view.external.length, 1);
  assert.equal(view.images[1].props.cacheMap, cacheMap);
  view.images[1].props.onPressWithUri('file:///fresh-photo.png');
  assert.deepEqual(app.opens, [[remote, {
    images: [
      { uri: embedded, mimeType: 'image/jpeg' },
      { uri: remote, cachedUri: 'file:///fresh-photo.png', mimeType: 'image/png' },
      { uri: linked, cachedUri: 'file:///cached-attachment.webp', mimeType: 'image/webp' },
    ],
    initialIndex: 1,
  }]]);
  assert.equal(cacheMap[remote], 'file:///cached-photo.png');
  assert.equal(items[3].data, remote);
});

test('embedded image presses select their source position even for identical URIs', () => {
  const app = renderer();
  const view = app.render({ items: [
    { type: 'image', data: embedded },
    { type: 'text', content: 'between identical images' },
    { type: 'image', data: embedded },
    { type: 'image', data: remote },
  ] });
  view.images[1].props.onPress();
  assert.deepEqual(app.opens, [[embedded, {
    images: [
      { uri: embedded, mimeType: 'image/jpeg' },
      { uri: embedded, mimeType: 'image/jpeg' },
      { uri: remote, mimeType: 'image/png' },
    ],
    initialIndex: 1,
  }]]);
});

test('image MIME links keep duplicate positions and override only the clicked cache hint', () => {
  const app = renderer();
  const cacheMap = { [remote]: 'file:///shared-cache.png' };
  const view = app.render({ cacheMap, items: [
    { type: 'link', href: remote, mime: 'image/jpeg', label: 'first' },
    { type: 'ref', ref: 'reference', action: 'reply' },
    { type: 'link', href: remote, mime: 'image/webp', label: 'second' },
    { type: 'image', data: remote },
    { type: 'link', href: 'https://example.com/image.png', mime: 'text/html', label: 'page' },
    { type: 'link', href: 'https://example.com/video', mime: 'video/mp4', label: 'video' },
  ] });
  assert.equal(view.images.length, 3);
  assert.equal(view.external.length, 2);
  view.images[1].props.onPressWithUri('file:///clicked.webp');
  assert.deepEqual(app.opens[0], [remote, {
    images: [
      { uri: remote, cachedUri: 'file:///shared-cache.png', mimeType: 'image/jpeg' },
      { uri: remote, cachedUri: 'file:///clicked.webp', mimeType: 'image/webp' },
      { uri: remote, cachedUri: 'file:///shared-cache.png', mimeType: 'image/png' },
    ],
    initialIndex: 1,
  }]);
  view.images[0].props.onPressWithUri(remote);
  assert.equal(app.opens[1][1].initialIndex, 0);
  assert.equal(app.opens[1][1].images[1].cachedUri, 'file:///shared-cache.png');
  assert.equal(app.opens[0][1].images[1].cachedUri, 'file:///clicked.webp');
});

test('renderer instances and rerenders keep each thumbnail gallery scoped to its record snapshot', () => {
  const app = renderer();
  const items = [{ type: 'image', data: embedded }, { type: 'image', data: remote }];
  const cacheMap = { [remote]: 'file:///original-cache.png' };
  const first = app.render({ items, cacheMap }, 'first-record');
  const second = app.render({ items: [{ type: 'link', href: linked, mime: 'image/webp', label: '' }] }, 'second-record');
  items[1].data = 'https://example.com/replaced';
  cacheMap[remote] = 'file:///replaced-cache.png';
  app.render({ items: [{ type: 'image', data: 'data:image/png;base64,bmV3' }] }, 'first-record');
  first.images[0].props.onPress();
  second.images[0].props.onPressWithUri('file:///second-record.webp');
  assert.deepEqual(app.opens, [
    [embedded, {
      images: [
        { uri: embedded, mimeType: 'image/jpeg' },
        { uri: remote, cachedUri: 'file:///original-cache.png', mimeType: 'image/png' },
      ],
      initialIndex: 0,
    }],
    [linked, {
      images: [{ uri: linked, cachedUri: 'file:///second-record.webp', mimeType: 'image/webp' }],
      initialIndex: 0,
    }],
  ]);
});

test('long presses save source images and failed image links retain external-open fallback', async () => {
  const app = renderer();
  const props = { items: [
    { type: 'image', data: embedded },
    { type: 'image', data: remote },
    { type: 'link', href: linked, mime: 'image/webp', label: 'linked image', download: true },
    { type: 'link', href: 'https://example.com/document', mime: 'application/pdf', label: 'PDF' },
  ] };
  const view = app.render(props);
  await view.images[0].props.onLongPress();
  await view.images[1].props.onLongPress();
  await view.images[2].props.onLongPress();
  assert.deepEqual(app.saves, [embedded, remote, linked]);
  view.images[1].props.onError();
  view.images[2].props.onError();
  const failed = app.render(props);
  assert.equal(failed.images.length, 1);
  assert.equal(failed.external.length, 3);
  assert.equal(failed.external[1].props.label, 'linked image');
  assert.equal(failed.external[1].props.tapHint, 'detail.tapToOpenOrDownload');
  for (const node of failed.external) await node.props.onOpen();
  assert.deepEqual(app.urls, [remote, linked, 'https://example.com/document']);
  assert.deepEqual(app.opens, []);
});
