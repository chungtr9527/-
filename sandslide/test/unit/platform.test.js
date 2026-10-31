'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('../helpers/load-engine');
const PLATFORM = path.join(__dirname, '..', '..', 'www', 'js', 'platform.js');

// Fresh module state per test (the IIFE keeps lifecycle and inset watchers in a closure).
function fresh() { delete require.cache[require.resolve(PLATFORM)]; require(PLATFORM); return globalThis.TB.Platform; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeApp(opts) {
  opts = opts || {};
  const handlers = {}, calls = [];
  return {
    handlers, calls,
    addListener(evt, fn) {
      calls.push(['addListener', evt]);
      (handlers[evt] = handlers[evt] || []).push(fn);
      const h = { remove: () => { calls.push(['remove', evt]); handlers[evt] = handlers[evt].filter((f) => f !== fn); return Promise.resolve(); } };
      return opts.promise ? Promise.resolve(h) : h;    // native bridge: sync handle; JS proxies: a promise of one
    },
    emit(evt, data) { (handlers[evt] || []).slice().forEach((fn) => fn(data)); },
    minimizeApp() { calls.push(['minimizeApp']); return Promise.resolve(); }
  };
}
function fakeDocument() {
  const listeners = {};
  const el = () => ({ style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } });
  return {
    visibilityState: 'visible', documentElement: el(), body: el(), listeners,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    createElement(tag) { const e = el(); e.tag = tag; return e; },
    emit(t) { (listeners[t] || []).slice().forEach((fn) => fn({ type: t })); }
  };
}
function native(plugins) { return { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins || {} }; }
function installGlobals(obj) {
  for (const k of Object.keys(obj)) Object.defineProperty(globalThis, k, { value: obj[k], configurable: true, writable: true, enumerable: true });
}
const GLOBALS = ['Capacitor', 'document', 'getComputedStyle', 'MutationObserver', 'addEventListener', 'location', 'PointerEvent', 'AudioContext', 'webkitAudioContext'];
afterEach(() => { for (const k of GLOBALS) delete globalThis[k]; });

test('loads in Node without a window and exposes the contract API as no-ops', () => {
  const P = fresh();
  for (const k of ['plugin', 'on', 'onPause', 'onResume', 'onBackButton', 'minimizeApp', 'getInsets', 'onInsetsChange', 'setSystemBarsDark', 'now', 'capabilities']) {
    assert.equal(typeof P[k], 'function', k);
  }
  assert.equal(P.isNative, false); assert.equal(P.platform, 'web'); assert.equal(P.isFile, false);
  assert.equal(P.plugin('App'), null); assert.equal(P.plugin('AdMob'), null); assert.equal(P.plugin(), null);
  const off = P.on('App', 'pause', () => {});
  assert.equal(typeof off, 'function');
  assert.doesNotThrow(() => { off(); off(); });
  assert.equal(typeof P.onPause(() => {}), 'function'); assert.equal(typeof P.onResume(() => {}), 'function');
  assert.equal(typeof P.onBackButton(() => {}), 'function'); assert.equal(typeof P.onInsetsChange(() => {}), 'function');
  assert.equal(typeof P.onPause(null), 'function');
  assert.equal(P.minimizeApp(), false); assert.equal(P.setSystemBarsDark(), false);
  assert.deepEqual(P.getInsets(), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(typeof P.now(), 'number');
  assert.ok(Math.abs(P.now() - performance.now()) < 50, 'performance.now is used when available');
  assert.deepEqual(P.capabilities(), { pointerEvents: false, audioContext: false, canvas: false });
});

test('detects the native bridge lazily and reads platform / plugins from it; broken bridges degrade to web', () => {
  const P = fresh();
  const App = fakeApp(), styles = [];
  installGlobals({ Capacitor: native({ App, SystemBars: { setStyle(o) { styles.push(o); return Promise.resolve(); } } }) });
  assert.equal(P.isNative, true); assert.equal(P.platform, 'android');
  assert.equal(P.plugin('App'), App); assert.equal(P.plugin('Haptics'), null);
  assert.equal(P.minimizeApp(), true); assert.deepEqual(App.calls, [['minimizeApp']]);
  assert.equal(P.setSystemBarsDark(), true); assert.deepEqual(styles, [{ style: 'DARK' }]);
  installGlobals({ Capacitor: { Plugins: { App } } });               // a bridge without isNativePlatform is not native
  assert.equal(P.isNative, false); assert.equal(P.platform, 'web'); assert.equal(P.plugin('App'), App);
  installGlobals({ Capacitor: { isNativePlatform() { throw new Error('x'); }, getPlatform() { throw new Error('x'); }, Plugins: { App: 3 } } });
  assert.equal(P.isNative, false); assert.equal(P.platform, 'web'); assert.equal(P.plugin('App'), null);
  installGlobals({ Capacitor: native({ SystemBars: { setStyle() { throw new Error('x'); } }, App: { minimizeApp() { throw new Error('x'); } }, Pref: {} }) });
  assert.equal(P.setSystemBarsDark(), false); assert.equal(P.minimizeApp(), false);
  installGlobals({ location: { protocol: 'file:' } });
  assert.equal(P.isFile, true);
  installGlobals({ location: { protocol: 'https:' } });
  assert.equal(P.isFile, false);
});

test('on() wraps addListener (sync handle and Promise variant) and returns an idempotent unsubscribe', async () => {
  const P = fresh();
  const App = fakeApp();
  installGlobals({ Capacitor: native({ App }) });
  const got = [];
  const off = P.on('App', 'backButton', (ev) => got.push(ev));
  App.emit('backButton', { canGoBack: false });
  assert.deepEqual(got, [{ canGoBack: false }]);
  off();
  App.emit('backButton', { canGoBack: true });
  assert.equal(got.length, 1);
  assert.deepEqual(App.calls, [['addListener', 'backButton'], ['remove', 'backButton']]);
  off();
  assert.equal(App.calls.length, 2, 'unsubscribe is idempotent');

  const proxy = fakeApp(), seen = [];
  P.on(proxy, 'evt', (d) => seen.push(d));          // a proxy object instead of a name
  proxy.emit('evt', 7);
  assert.deepEqual(seen, [7]);

  const PApp = fakeApp({ promise: true });
  installGlobals({ Capacitor: native({ App: PApp }) });
  const got2 = [];
  const off2 = P.on('App', 'pause', () => got2.push(1));
  PApp.emit('pause');
  assert.equal(got2.length, 1);
  off2();
  PApp.emit('pause');
  assert.equal(got2.length, 1, 'events after unsubscribe are ignored even before the handle arrives');
  await sleep(0);
  assert.deepEqual(PApp.calls, [['addListener', 'pause'], ['remove', 'pause']], 'the late handle is removed');

  installGlobals({ Capacitor: native({ App: { addListener() { throw new Error('nope'); } } }) });
  assert.equal(typeof P.on('App', 'pause', () => {}), 'function');
  assert.equal(typeof P.on('App', 'pause', null), 'function');
  assert.equal(typeof P.on('Missing', 'pause', () => {}), 'function');
});

test('onPause / onResume: App events and visibilitychange are de-duplicated per transition', () => {
  const P = fresh();
  const App = fakeApp(), doc = fakeDocument();
  installGlobals({ Capacitor: native({ App }), document: doc });
  const log = [];
  const offPause = P.onPause(() => log.push('pause'));
  P.onResume(() => log.push('resume'));
  P.onPause(() => log.push('pause2'));
  assert.deepEqual(App.calls, [['addListener', 'pause'], ['addListener', 'resume']], 'native listeners installed once');
  assert.equal(doc.listeners.visibilitychange.length, 1);
  App.emit('pause');
  doc.visibilityState = 'hidden'; doc.emit('visibilitychange');
  App.emit('pause');
  assert.deepEqual(log, ['pause', 'pause2'], 'one transition, one callback each');
  doc.visibilityState = 'visible'; doc.emit('visibilitychange');
  App.emit('resume');
  assert.deepEqual(log, ['pause', 'pause2', 'resume']);
  App.emit('resume'); doc.emit('visibilitychange');
  assert.deepEqual(log, ['pause', 'pause2', 'resume'], 'resume while active is ignored');
  offPause();
  App.emit('pause');
  assert.deepEqual(log, ['pause', 'pause2', 'resume', 'pause2']);
  App.emit('resume');
  assert.equal(log.length, 5);
});

test('web only: visibilitychange drives pause / resume; a document hidden at load resumes first', () => {
  const P = fresh();
  const doc = fakeDocument();
  doc.visibilityState = 'hidden';
  installGlobals({ document: doc });
  const log = [];
  P.onPause(() => log.push('pause')); P.onResume(() => log.push('resume'));
  doc.visibilityState = 'visible'; doc.emit('visibilitychange');
  assert.deepEqual(log, ['resume']);
  doc.visibilityState = 'hidden'; doc.emit('visibilitychange');
  doc.emit('visibilitychange');
  assert.deepEqual(log, ['resume', 'pause']);
});

test('onBackButton registers the App backButton listener and is a no-op on the web', () => {
  const P = fresh();
  const got = [];
  assert.equal(typeof P.onBackButton((ev) => got.push(ev)), 'function');
  const App = fakeApp();
  installGlobals({ Capacitor: native({ App }) });
  const off = P.onBackButton((ev) => got.push(ev));
  assert.deepEqual(App.calls, [['addListener', 'backButton']]);
  App.emit('backButton', { canGoBack: false });
  App.emit('backButton');
  assert.deepEqual(got, [{ canGoBack: false }, {}]);
  off();
  App.emit('backButton', {});
  assert.equal(got.length, 2);
  assert.equal(typeof P.onBackButton(null), 'function');
});

test('getInsets reads the --safe-area-inset-* variables, else an env() probe element, else 0', () => {
  const P = fresh();
  const doc = fakeDocument(), vars = {};
  let probePad = null;
  installGlobals({
    document: doc,
    getComputedStyle: (el) => (el === doc.documentElement
      ? { getPropertyValue: (n) => (n in vars ? vars[n] : '') }
      : (probePad || { paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' }))
  });
  assert.deepEqual(P.getInsets(), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(doc.body.children.length, 1, 'probe element appended once');
  const probe = doc.body.children[0];
  assert.equal(probe.tag, 'div'); assert.equal(probe.attrs['aria-hidden'], 'true');
  for (const s of ['top', 'right', 'bottom', 'left']) assert.ok(probe.style.cssText.includes(`padding-${s}:env(safe-area-inset-${s},0px)`), s);
  probePad = { paddingTop: '20px', paddingRight: '0px', paddingBottom: '34.5px', paddingLeft: '' };
  assert.deepEqual(P.getInsets(), { top: 20, right: 0, bottom: 34.5, left: 0 });
  assert.equal(doc.body.children.length, 1, 'probe reused');
  Object.assign(vars, { '--safe-area-inset-top': ' 24px', '--safe-area-inset-bottom': '48px', '--safe-area-inset-left': 'garbage', '--safe-area-inset-right': '-3px' });
  assert.deepEqual(P.getInsets(), { top: 24, right: 0, bottom: 48, left: 0 }, 'variables win over the probe');
  installGlobals({ getComputedStyle: () => { throw new Error('no'); } });
  assert.deepEqual(P.getInsets(), { top: 0, right: 0, bottom: 0, left: 0 });
  installGlobals({ document: { documentElement: null } });
  assert.deepEqual(P.getInsets(), { top: 0, right: 0, bottom: 0, left: 0 });
});

test('onInsetsChange: MutationObserver on <html style> + resize + resume, debounced 100 ms, fires only on change', async () => {
  const P = fresh();
  const doc = fakeDocument(), vars = { '--safe-area-inset-top': '24px' }, observers = [], winListeners = {}, App = fakeApp();
  class MO { constructor(cb) { this.cb = cb; observers.push(this); } observe(target, opts) { this.target = target; this.opts = opts; } disconnect() {} }
  installGlobals({
    document: doc, MutationObserver: MO, Capacitor: native({ App }),
    getComputedStyle: () => ({ getPropertyValue: (n) => vars[n] || '' }),
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); }
  });
  const got = [];
  const off = P.onInsetsChange((i) => got.push(i));
  P.onInsetsChange(() => got.push('second'));
  assert.equal(observers.length, 1, 'one observer for every subscriber');
  assert.equal(observers[0].target, doc.documentElement);
  assert.deepEqual(observers[0].opts, { attributes: true, attributeFilter: ['style'] });
  assert.equal(winListeners.resize.length, 1);
  observers[0].cb([]); observers[0].cb([]); winListeners.resize[0]();
  await sleep(150);
  assert.deepEqual(got, [], 'unchanged insets do not fire');
  vars['--safe-area-inset-top'] = '48px';
  observers[0].cb([]);
  assert.deepEqual(got, [], 'debounced');
  await sleep(150);
  assert.deepEqual(got, [{ top: 48, right: 0, bottom: 0, left: 0 }, 'second']);
  vars['--safe-area-inset-bottom'] = '16px';
  App.emit('pause'); App.emit('resume');                 // resume re-reads
  await sleep(150);
  assert.equal(got.length, 4);
  assert.deepEqual(got[2], { top: 48, right: 0, bottom: 16, left: 0 });
  off();
  vars['--safe-area-inset-top'] = '0px';
  winListeners.resize[0](); winListeners.resize[0]();
  await sleep(150);
  assert.deepEqual(got.slice(4), ['second'], 'unsubscribed callback no longer runs; one debounced check per burst');
});

test('capabilities reflects PointerEvent, (webkit)AudioContext and canvas 2d', () => {
  const P = fresh();
  installGlobals({ PointerEvent: function () {}, webkitAudioContext: function () {}, document: { createElement: () => ({ getContext: (t) => (t === '2d' ? {} : null) }) } });
  assert.deepEqual(P.capabilities(), { pointerEvents: true, audioContext: true, canvas: true });
  installGlobals({ document: { createElement: () => { throw new Error('x'); } } });
  assert.equal(P.capabilities().canvas, false);
  delete globalThis.webkitAudioContext;
  installGlobals({ AudioContext: function () {} });
  assert.equal(P.capabilities().audioContext, true);
});
