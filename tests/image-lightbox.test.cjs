const assert = require('node:assert/strict');
const test = require('node:test');
const loadTypeScript = require('./helpers/load-typescript.cjs');

// Exercise the real component's responder callbacks without a native renderer.
// Only React hooks, native animation, image loading and device services are stubbed.
function lightbox({ width = 400, height = 800, imageWidth = width, imageHeight = height } = {}) {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  let dirty = false;
  let tree;
  let now = 1000;
  let closes = 0;
  let saves = 0;
  let nextTimer = 1;
  const timers = new Map();
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (next) => {
        const value = typeof next === 'function' ? next(hooks[index]) : next;
        if (!Object.is(hooks[index], value)) { hooks[index] = value; dirty = true; }
      }];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
        hooks[index] = { deps, value: factory() };
      }
      return hooks[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
        const previous = hooks[index];
        hooks[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    interpolate(config) { return { source: this, config }; }
  }
  const animation = (value, { toValue }) => ({ start: () => value.setValue(toValue) });
  const Animated = {
    Value, View: 'Animated.View', spring: animation, timing: animation,
    parallel: (animations) => ({ start: () => animations.forEach((item) => item.start()) }),
  };
  const jsx = (type, props) => ({ type, props });
  const { ImageLightbox } = loadTypeScript('src/components/ImageLightbox.tsx', {
    imports: {
      react,
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': {
        Animated, BackHandler: { addEventListener: () => ({ remove() {} }) },
        Image: { getSize: (_uri, callback) => callback(imageWidth, imageHeight) },
        Modal: 'Modal', View: 'View', Platform: { OS: 'web' },
        PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
        StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
        useWindowDimensions: () => ({ width, height }),
      },
      'react-native-paper': {
        ActivityIndicator: 'ActivityIndicator', Snackbar: 'Snackbar', Text: 'Text',
        useTheme: () => ({ colors: { primary: '#fff' } }),
      },
      'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
      '../adapter': {
        getImageRendererAdapter: () => ({ Image: 'PlatformImage' }),
        peekCachedImagePath: () => null,
        saveImageToAlbum: async () => { saves++; },
      },
      '../hooks/useCachedRemoteImage': {
        useCachedRemoteImage: (uri) => ({ displayUri: uri, loading: false, failed: false }),
      },
      '../utils/attachment': { isHttpUrl: (uri) => /^https?:/.test(uri) },
    },
    globals: {
      Date: { now: () => now },
      setTimeout: (callback) => { const id = nextTimer++; timers.set(id, callback); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  const onClose = () => { closes++; };
  function render() {
    do {
      dirty = false;
      cursor = 0;
      tree = ImageLightbox({ uri: 'file:///photo.jpg', onClose });
      effects.splice(0).forEach((effect) => effect());
    } while (dirty);
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat()) {
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  const backdrop = () => find(tree, (node) => node.props?.onPanResponderGrant);
  const handlers = () => backdrop().props;
  const event = (x, y, touches = []) => ({ nativeEvent: { locationX: x, locationY: y, touches } });
  const gesture = (dx = 0, dy = 0) => ({ dx, dy });
  render();
  return {
    tap(x, y) {
      handlers().onPanResponderGrant(event(x, y, [{ pageX: x, pageY: y }]));
      handlers().onPanResponderRelease(event(x, y), gesture());
      now += 100;
      render();
    },
    doubleTap(x, y) { this.tap(x, y); this.tap(x, y); },
    wheel(deltaY) { handlers().onWheel({ deltaY, preventDefault() {} }); render(); },
    drag(dx, dy) {
      handlers().onPanResponderGrant(event(200, 400, [{ pageX: 200, pageY: 400 }]));
      handlers().onPanResponderMove(event(200 + dx, 400 + dy, [{ pageX: 200 + dx, pageY: 400 + dy }]), gesture(dx, dy));
      const backdropOffset = this.backdropDragOffset;
      handlers().onPanResponderRelease(event(200 + dx, 400 + dy), gesture(dx, dy));
      render();
      return backdropOffset;
    },
    pinch(factor) {
      handlers().onPanResponderGrant(event(150, 400, [{ pageX: 100, pageY: 400 }, { pageX: 200, pageY: 400 }]));
      handlers().onPanResponderMove(event(150, 400, [{ pageX: 100, pageY: 400 }, { pageX: 100 + factor * 100, pageY: 400 }]), gesture());
      handlers().onPanResponderRelease(event(150, 400), gesture());
      render();
    },
    longPress(x, y) {
      handlers().onPanResponderGrant(event(x, y, [{ pageX: x, pageY: y }]));
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      handlers().onPanResponderRelease(event(x, y), gesture());
      render();
    },
    transform() {
      const node = find(tree, (item) => item.props?.style?.some?.((style) => style?.transform));
      return Object.assign({}, ...node.props.style.find((style) => style?.transform).transform.map(
        (entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value.value])),
      ));
    },
    get closes() { return closes; },
    get saves() { return saves; },
    get backdropDragOffset() {
      return backdrop().props.style.find((style) => style?.backgroundColor?.source).backgroundColor.source.value;
    },
  };
}

test('double tap keeps the tapped image point fixed while zooming to 3x', () => {
  const viewer = lightbox();
  viewer.doubleTap(300, 500);
  const { translateX, translateY, scale } = viewer.transform();
  assert.equal(scale, 3);
  assert.equal(200 + (300 - 200) * scale + translateX, 300);
  assert.equal(400 + (500 - 400) * scale + translateY, 500);
  assert.equal(viewer.closes, 0);
});

test('double tap at the center retains the existing centered zoom', () => {
  const viewer = lightbox();
  viewer.doubleTap(200, 400);
  assert.deepEqual(viewer.transform(), { translateX: 0, translateY: 0, scale: 3 });
});

test('a zoomed image can be double tapped outside its original unscaled bounds to reset', () => {
  const viewer = lightbox({ imageWidth: 800, imageHeight: 400 });
  viewer.doubleTap(300, 450);
  viewer.doubleTap(100, 200);
  assert.equal(viewer.closes, 0);
  assert.deepEqual(viewer.transform(), { translateX: 0, translateY: 0, scale: 1 });
});

test('zoom and drag respect actual image bounds rather than the full-screen wrapper', () => {
  for (const [options, point, boundedAxis] of [
    [{ imageWidth: 800, imageHeight: 400 }, [300, 450], 'translateY'],
    [{ width: 800, height: 400, imageWidth: 400, imageHeight: 800 }, [450, 300], 'translateX'],
  ]) {
    const viewer = lightbox(options);
    viewer.doubleTap(...point);
    assert.equal(viewer.transform()[boundedAxis], 0);
    viewer.drag(1000, 1000);
    assert.equal(viewer.transform()[boundedAxis], 0);
    assert.equal(viewer.closes, 0);
  }
});

test('focal zoom and zoomed panning do not fade the dismissal backdrop', () => {
  const viewer = lightbox();
  viewer.doubleTap(300, 500);
  assert.equal(viewer.backdropDragOffset, 0);
  viewer.drag(0, 50);
  assert.equal(viewer.backdropDragOffset, 0);
});

test('shrinking a focal zoom keeps its translation within the new bounds', () => {
  const viewer = lightbox();
  viewer.doubleTap(390, 790);
  for (let i = 0; i < 8; i++) viewer.wheel(1);
  const { translateX, translateY, scale } = viewer.transform();
  assert.ok(scale > 1);
  assert.ok(Math.abs(translateX) <= (scale - 1) * 400 / 2 + 1e-9);
  assert.ok(Math.abs(translateY) <= (scale - 1) * 800 / 2 + 1e-9);
});

test('focal zoom works across viewport orientations and near each corner', () => {
  for (const [width, height] of [[400, 800], [800, 400]]) {
    for (const [xRatio, yRatio] of [[0.01, 0.01], [0.99, 0.01], [0.01, 0.99], [0.99, 0.99]]) {
      const viewer = lightbox({ width, height });
      const x = width * xRatio;
      const y = height * yRatio;
      viewer.doubleTap(x, y);
      const { translateX, translateY, scale } = viewer.transform();
      assert.equal(scale, 3);
      assert.ok(Math.abs(width / 2 + (x - width / 2) * scale + translateX - x) < 1e-9);
      assert.ok(Math.abs(height / 2 + (y - height / 2) * scale + translateY - y) < 1e-9);
    }
  }
});

test('dragging after focal zoom continues from the focal translation', () => {
  const viewer = lightbox();
  viewer.doubleTap(300, 500);
  const initial = viewer.transform();
  viewer.drag(50, 70);
  assert.deepEqual(viewer.transform(), {
    translateX: initial.translateX + 50, translateY: initial.translateY + 70, scale: 3,
  });
  viewer.doubleTap(200, 400);
  assert.deepEqual(viewer.transform(), { translateX: 0, translateY: 0, scale: 1 });
  viewer.doubleTap(100, 300);
  assert.deepEqual(viewer.transform(), { translateX: 200, translateY: 200, scale: 3 });
  assert.equal(viewer.closes, 0);
});

test('a single image tap still does not zoom, while a blank-area tap closes', () => {
  const viewer = lightbox({ imageWidth: 800, imageHeight: 400 });
  viewer.tap(200, 400);
  assert.equal(viewer.transform().scale, 1);
  assert.equal(viewer.closes, 0);
  viewer.tap(200, 100);
  assert.equal(viewer.closes, 1);
});

test('a blank-area tap uses the zoomed image bounds', () => {
  const viewer = lightbox({ imageWidth: 800, imageHeight: 400 });
  viewer.doubleTap(300, 450);
  viewer.tap(200, 50);
  assert.equal(viewer.closes, 1);
});

test('unzoomed swipe keeps backdrop feedback, spring-back and dismissal', () => {
  const viewer = lightbox();
  assert.equal(viewer.drag(0, 50), 50);
  assert.equal(viewer.backdropDragOffset, 0);
  assert.deepEqual(viewer.transform(), { translateX: 0, translateY: 0, scale: 1 });
  assert.equal(viewer.closes, 0);
  viewer.drag(0, 120);
  assert.equal(viewer.closes, 1);
});

test('pinch and wheel retain scale limits and restore translation at minimum scale', () => {
  const viewer = lightbox();
  viewer.doubleTap(300, 500);
  viewer.pinch(10);
  assert.equal(viewer.transform().scale, 6);
  viewer.wheel(-1);
  assert.equal(viewer.transform().scale, 6);
  viewer.pinch(0.01);
  assert.deepEqual(viewer.transform(), { translateX: 0, translateY: 0, scale: 1 });
  viewer.wheel(1);
  assert.equal(viewer.transform().scale, 1);
  assert.equal(viewer.closes, 0);
});

test('long press still saves without closing or counting as a double tap', () => {
  const viewer = lightbox();
  viewer.longPress(200, 400);
  viewer.tap(200, 400);
  assert.equal(viewer.saves, 1);
  assert.equal(viewer.closes, 0);
  assert.equal(viewer.transform().scale, 1);
});
