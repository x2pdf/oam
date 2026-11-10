const assert = require('node:assert/strict');
const test = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');

function gallery({ images = [{ uri: 'file:///a.jpg' }, { uri: 'file:///b.jpg' }, { uri: 'file:///c.jpg' }], initialIndex = 1, platform = 'web', host = false } = {}) {
  const hooks = [];
  const effects = [];
  const listeners = new Map();
  const timers = new Map();
  const animations = [];
  let cursor = 0;
  let dirty = false;
  let tree;
  let now = 0;
  let nextTimer = 0;
  let closes = 0;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      const setter = hooks[`setter${i}`] ??= (next) => {
        const value = typeof next === 'function' ? next(hooks[i]) : next;
        if (!Object.is(value, hooks[i])) { hooks[i] = value; dirty = true; }
      };
      return [hooks[i], setter];
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) hooks[i] = { value: factory(), deps };
      return hooks[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) {
        const previous = hooks[i];
        hooks[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); hooks[i].cleanup = callback(); });
      }
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    interpolate(config) { return { source: this, config }; }
  }
  const animation = (value, options) => ({ start: () => { animations.push({ value, ...options }); value.setValue(options.toValue); } });
  const jsx = (type, props, key) => ({ type, props, key });
  const module = loadTypeScript('src/components/ImageLightbox.tsx', {
    imports: {
      react,
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': {
        Animated: { Value, View: 'Animated.View', timing: animation, spring: animation },
        BackHandler: { addEventListener: () => ({ remove() {} }) },
        useWindowDimensions: () => ({ width: 400, height: 800 }),
        PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
        Image: { getSize: (_uri, callback) => callback(400, 800) },
        Modal: 'Modal', View: 'View', Pressable: 'Pressable', Platform: { OS: platform },
        StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
      },
      'react-native-paper': { Icon: 'Icon', Text: 'Text', useTheme: () => ({ colors: { primary: '#fff' } }) },
      'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
      '../adapter': { getImageRendererAdapter: () => ({ Image: 'PlatformImage' }), peekCachedImagePath: (uri) => uri === 'https://cached.test/image' ? 'file:///cached.jpg' : null },
      '../hooks/useCachedRemoteImage': { useCachedRemoteImage: (uri) => ({ displayUri: uri, loading: false, failed: false }) },
      '../utils/attachment': { isHttpUrl: (uri) => /^https?:/.test(uri) },
      './ImageGalleryPager': { default: 'ImageGalleryPager' },
    },
    globals: {
      window: {
        addEventListener: (type, callback) => listeners.set(type, callback),
        removeEventListener: (type, callback) => { if (listeners.get(type) === callback) listeners.delete(type); },
      },
      setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  const onClose = () => { closes++; };
  function render() {
    do {
      dirty = false;
      cursor = 0;
      tree = host ? module.ImageLightboxHost() : module.ImageLightbox({ uri: images[initialIndex]?.uri, images, initialIndex, onClose });
      effects.splice(0).forEach((effect) => effect());
    } while (dirty);
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  }
  render();
  return {
    get tree() { return tree; },
    get slide() { return find(tree, (node) => node.type === module.ImageLightboxSlide); },
    get closes() { return closes; },
    get animations() { return animations; },
    find(id) { return find(tree, (node) => node.props?.testID === id); },
    findBy(predicate) { return find(tree, predicate); },
    rerender() { render(); },
    key(key) { let prevented = false; listeners.get('keydown')?.({ key, preventDefault() { prevented = true; }, stopPropagation() {} }); render(); return prevented; },
    click(id) { this.find(id)?.props.onPress({ stopPropagation() {} }); render(); },
    move() { this.find('image-lightbox-overlay')?.props.onMouseMove(); render(); },
    event(id, event) { this.find(id)?.props[event]?.(); render(); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      render();
    },
    open(uri, options) { module.openImageLightbox(uri, options); render(); },
    unmount() { hooks.forEach((hook) => hook?.cleanup?.()); },
    get listenerCount() { return listeners.size; },
    get timerCount() { return timers.size; },
  };
}

test('gallery starts at clicked image and keyboard navigation stays inside record boundaries', () => {
  const viewer = gallery();
  assert.equal(viewer.slide?.props.uri, 'file:///b.jpg');
  const firstKey = viewer.slide.key;
  assert.equal(viewer.key('ArrowRight'), true);
  assert.equal(viewer.slide.props.uri, 'file:///c.jpg');
  assert.notEqual(viewer.slide.key, firstKey);
  viewer.key('ArrowRight');
  assert.equal(viewer.slide.props.uri, 'file:///c.jpg');
  viewer.key('ArrowLeft');
  viewer.key('ArrowLeft');
  viewer.key('ArrowLeft');
  assert.equal(viewer.slide.props.uri, 'file:///a.jpg');
  assert.equal(viewer.closes, 0);
});

test('desktop arrows hide after inactivity, mouse movement restores them and clicks navigate', () => {
  const viewer = gallery();
  assert.ok(viewer.find('image-next'), 'multiple images need navigation arrows');
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'box-none');
  viewer.advance(2100);
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'none');
  assert.equal(viewer.find('image-next').props.pointerEvents, 'none');
  assert.ok(viewer.find('image-next').props.style.some((style) => style.pointerEvents === 'none'));
  viewer.move();
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'box-none');
  assert.equal(viewer.find('image-next').props.pointerEvents, 'auto');
  viewer.click('image-next');
  assert.equal(viewer.slide.props.uri, 'file:///c.jpg');
  assert.equal(viewer.find('image-next').props.disabled, true);
  assert.equal(viewer.closes, 0);
  viewer.advance(2100);
  viewer.key('ArrowLeft');
  assert.equal(viewer.slide.props.uri, 'file:///b.jpg');
});

test('hovering or focusing arrows holds controls visible until interaction ends', () => {
  const viewer = gallery();
  viewer.event('image-next', 'onHoverIn');
  viewer.advance(5000);
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'box-none');
  viewer.key('Tab');
  viewer.event('image-next', 'onFocus');
  viewer.event('image-next', 'onHoverOut');
  viewer.advance(5000);
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'box-none');
  viewer.event('image-next', 'onBlur');
  viewer.advance(2100);
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'none');
});

test('changing images keeps the Modal and overlay animation stable, including duplicate URIs', () => {
  const viewer = gallery({ images: [{ uri: 'file:///a.jpg' }, { uri: 'file:///a.jpg' }], initialIndex: 0 });
  const modalType = viewer.tree.type;
  const overlayOpacity = viewer.find('image-lightbox-overlay').props.style[1].opacity;
  const slideKey = viewer.slide.key;
  viewer.key('ArrowRight');
  assert.equal(viewer.tree.type, modalType);
  assert.equal(viewer.find('image-lightbox-overlay').props.style[1].opacity, overlayOpacity);
  assert.equal(viewer.animations.filter((entry) => entry.value === overlayOpacity).length, 1);
  assert.notEqual(viewer.slide.key, slideKey, 'each position needs a fresh image transform');
});

test('mobile gallery has only a non-intercepting counter and single-image viewers have neither', () => {
  const mobile = gallery({ platform: 'ios' });
  assert.equal(mobile.find('image-next'), undefined);
  assert.equal(mobile.find('image-counter').props.children, '2 / 3');
  assert.equal(mobile.find('image-counter').props.pointerEvents, 'none');
  const single = gallery({ images: [{ uri: 'file:///only.jpg' }], initialIndex: 0, platform: 'ios' });
  assert.equal(single.find('image-counter'), undefined);
  assert.equal(single.find('image-navigation'), undefined);
  assert.equal(single.slide.props.pagerSwipe, undefined);
  assert.equal(single.key('ArrowRight'), false);
});

test('mobile gallery pre-mounts neighbouring slides in a pager and locks paging while zoomed', () => {
  const images = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ uri: `file:///${name}.jpg` }));
  const viewer = gallery({ images, initialIndex: 1, platform: 'ios' });
  const pager = () => viewer.findBy((node) => node.type === 'ImageGalleryPager');
  const slides = () => pager().props.children.filter((child) => child.type !== 'View');
  assert.equal(pager().props.initialPage, 1);
  assert.deepEqual(slides().map((slide) => slide.props.uri), ['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
  assert.ok(slides().every((slide) => slide.props.pagerSwipe));
  assert.equal(pager().props.scrollEnabled, true);

  slides()[1].props.onZoomChange(true);
  viewer.rerender();
  assert.equal(pager().props.scrollEnabled, false);
  slides()[1].props.onZoomChange(false);
  viewer.rerender();

  pager().props.onPageSelected(3);
  viewer.rerender();
  assert.deepEqual(slides().map((slide) => slide.props.uri), ['file:///c.jpg', 'file:///d.jpg', 'file:///e.jpg']);
  assert.equal(pager().props.initialPage, 1, 'the pager is uncontrolled after mount');
  assert.equal(viewer.find('image-counter').props.children, '4 / 5');
});

test('host forwards a gallery session and still supports old single-image callers', () => {
  const host = gallery({ host: true });
  assert.equal(host.tree, null);
  host.open('https://cached.test/image');
  assert.equal(host.tree.props.uri, 'https://cached.test/image');
  assert.equal(host.tree.props.images, undefined);
  const images = [{ uri: 'file:///first.jpg' }, { uri: 'https://source.test/b', cachedUri: 'blob:resolved', mimeType: 'image/png' }];
  host.open(images[1].uri, { images, initialIndex: 1 });
  assert.equal(host.tree.props.images, images);
  assert.equal(host.tree.props.initialIndex, 1);
  host.tree.props.onClose();
  host.advance(0);
  assert.equal(host.tree, null);
});

test('unmount cleans up desktop keyboard listeners and auto-hide timers', () => {
  const viewer = gallery();
  assert.equal(viewer.listenerCount, 1);
  assert.ok(viewer.timerCount > 0);
  viewer.unmount();
  assert.equal(viewer.listenerCount, 0);
  assert.equal(viewer.timerCount, 0);
});

test('Modal automatic focus does not pin arrows on screen before keyboard interaction', () => {
  const viewer = gallery();
  viewer.event('image-previous', 'onFocus');
  viewer.advance(2100);
  assert.equal(viewer.find('image-navigation').props.pointerEvents, 'none');
});
