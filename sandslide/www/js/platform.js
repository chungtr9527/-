// Platform integration: Capacitor bridge detection, native plugin proxies, app lifecycle (pause / resume, Android
// back button), safe-area insets, system bars, the clock and capability checks for the "too old" message.
// Platform module: may touch window / document / the bridge, but must never throw and must degrade to a no-op when
// window.Capacitor is undefined (plain web, file://) or when there is no DOM at all (Node unit tests).
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var SIDES = ['top', 'right', 'bottom', 'left'];
  var INSETS_DEBOUNCE_MS = 100;

  function noop() {}
  function isThenable(x) { return !!x && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function'; }
  function swallow(p) { try { if (isThenable(p)) p.then(noop, noop); } catch (e) {} }
  // A listener that throws must not break the dispatch loop it runs in; re-throw later so window.onerror still sees it.
  function rethrowLater(e) { try { setTimeout(function () { throw e; }, 0); } catch (e2) {} }
  function safeCall(cb, args) { try { cb.apply(null, args || []); } catch (e) { rethrowLater(e); } }

  // ---- bridge ----------------------------------------------------------------------------------------------------
  // Resolved on every call: the native runtime injects window.Capacitor before any script runs, but tests (and a
  // late-loaded web runtime) may install it after this file is evaluated.
  function bridge() {
    try { var c = g.Capacitor; return c && (typeof c === 'object' || typeof c === 'function') ? c : null; } catch (e) { return null; }
  }
  function isNative() {
    var c = bridge();
    try { return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); } catch (e) { return false; }
  }
  function platformName() {
    var c = bridge();
    try { if (c && typeof c.getPlatform === 'function') { var p = c.getPlatform(); if (p === 'android' || p === 'ios') return p; } } catch (e) {}
    return 'web';
  }
  function isFile() { try { var l = g.location; return !!(l && l.protocol === 'file:'); } catch (e) { return false; } }
  // The proxy the runtime injected for a native plugin (window.Capacitor.Plugins.<Name>), or null.
  function plugin(name) {
    var c = bridge();
    try {
      var p = c && c.Plugins ? c.Plugins[name] : null;
      return p && (typeof p === 'object' || typeof p === 'function') ? p : null;
    } catch (e) { return null; }
  }

  // on(pluginName | proxy, eventName, cb) -> unsubscribe. Wraps proxy.addListener, which returns a plain { remove }
  // handle synchronously on the native bridge; a Promise-returning variant (Capacitor's JS proxies) is tolerated.
  // No-op (returns a function that does nothing) when the plugin is missing.
  function on(target, evt, cb) {
    var p = typeof target === 'string' ? plugin(target) : target;
    if (!p || typeof p.addListener !== 'function' || typeof cb !== 'function') return noop;
    var handle = null, removed = false;
    function release(h) { try { swallow(h && typeof h.remove === 'function' ? h.remove() : null); } catch (e) {} }
    try {
      var r = p.addListener(evt, function () { if (!removed) safeCall(cb, arguments); });
      if (r && typeof r.remove === 'function') handle = r;
      else if (isThenable(r)) r.then(function (h) { handle = h; if (removed) release(h); }, noop);
    } catch (e) { return noop; }
    return function unsubscribe() {
      if (removed) return;
      removed = true;
      if (handle) release(handle);
    };
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------------
  // Sources: the App plugin's 'pause' / 'resume' events (native) and document visibilitychange (web; the Android
  // WebView fires it too). Both can report one transition, so callbacks only run when the paused state flips.
  var life = { installed: false, paused: false, pause: [], resume: [] };

  function signal(paused) {
    if (life.paused === paused) return;
    life.paused = paused;
    var list = paused ? life.pause : life.resume;
    list.slice().forEach(function (cb) { safeCall(cb); });
  }
  function installLifecycle() {
    if (life.installed) return;
    life.installed = true;
    try {
      var doc = g.document;
      if (doc && typeof doc.addEventListener === 'function') {
        life.paused = doc.visibilityState === 'hidden';
        doc.addEventListener('visibilitychange', function () { signal(doc.visibilityState === 'hidden'); });
      }
    } catch (e) {}
    on('App', 'pause', function () { signal(true); });
    on('App', 'resume', function () { signal(false); });
  }
  function subscribe(list, cb) {
    if (typeof cb !== 'function') return noop;
    installLifecycle();
    list.push(cb);
    return function () { var i = list.indexOf(cb); if (i >= 0) list.splice(i, 1); };
  }
  function onPause(cb) { return subscribe(life.pause, cb); }
  function onResume(cb) { return subscribe(life.resume, cb); }

  // Android hardware back. Registering a 'backButton' listener disables Capacitor's default (history back / exit).
  // cb receives the event ({ canGoBack }). No-op without the App plugin (web, file://).
  function onBackButton(cb) {
    if (typeof cb !== 'function') return noop;
    return on('App', 'backButton', function (ev) { cb(ev || {}); });
  }
  // Sends the app to the background (Android). Returns whether the native call was issued.
  function minimizeApp() {
    var app = plugin('App');
    if (!app || typeof app.minimizeApp !== 'function') return false;
    try { swallow(app.minimizeApp()); return true; } catch (e) { return false; }
  }

  // ---- safe-area insets ------------------------------------------------------------------------------------------
  var probe = null;
  function zeroInsets() { return { top: 0, right: 0, bottom: 0, left: 0 }; }
  function px(v) {
    if (v === null || v === undefined) return null;
    var n = parseFloat(String(v).trim());
    if (isNaN(n) || !isFinite(n)) return null;
    return n < 0 ? 0 : n;
  }
  function computed(el) {
    try { return typeof g.getComputedStyle === 'function' ? g.getComputedStyle(el) : null; } catch (e) { return null; }
  }
  // CSS px from the --safe-area-inset-* custom properties the SystemBars plugin injects on <html>; when none is
  // defined, from a hidden probe element padded with env(safe-area-inset-*); else 0.
  function getInsets() {
    var out = zeroInsets(), doc = g.document;
    try {
      if (!doc || !doc.documentElement) return out;
      var cs = computed(doc.documentElement), found = false;
      if (cs && typeof cs.getPropertyValue === 'function') {
        SIDES.forEach(function (side) {
          var v = px(cs.getPropertyValue('--safe-area-inset-' + side));
          if (v !== null) { out[side] = v; found = true; }
        });
      }
      if (found) return out;
      if (!probe) {
        probe = doc.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.setAttribute('data-tb-probe', 'safe-area');
        probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          SIDES.map(function (s) { return 'padding-' + s + ':env(safe-area-inset-' + s + ',0px);'; }).join('');
        (doc.body || doc.documentElement).appendChild(probe);
      }
      var ps = computed(probe);
      if (ps) SIDES.forEach(function (side) { out[side] = px(ps['padding' + side.charAt(0).toUpperCase() + side.slice(1)]) || 0; });
    } catch (e) {}
    return out;
  }

  // onInsetsChange(cb): MutationObserver on <html style> (where the runtime writes the variables) + window resize +
  // app resume, debounced 100 ms; cb(insets) runs only when a value actually changed.
  var insets = { watching: false, timer: null, last: null, cbs: [] };
  function sameInsets(a, b) { return !!a && !!b && SIDES.every(function (s) { return a[s] === b[s]; }); }
  function checkInsets() {
    insets.timer = null;
    var cur = getInsets();
    if (sameInsets(cur, insets.last)) return;
    insets.last = cur;
    insets.cbs.slice().forEach(function (cb) { safeCall(cb, [cur]); });
  }
  function scheduleInsets() {
    try {
      if (insets.timer) clearTimeout(insets.timer);
      insets.timer = setTimeout(checkInsets, INSETS_DEBOUNCE_MS);
    } catch (e) {}
  }
  function watchInsets() {
    if (insets.watching) return;
    insets.watching = true;
    insets.last = getInsets();
    try {
      var doc = g.document;
      if (doc && doc.documentElement && typeof g.MutationObserver === 'function') {
        new g.MutationObserver(scheduleInsets).observe(doc.documentElement, { attributes: true, attributeFilter: ['style'] });
      }
    } catch (e) {}
    try { if (typeof g.addEventListener === 'function') g.addEventListener('resize', scheduleInsets); } catch (e) {}
    onResume(scheduleInsets);
  }
  function onInsetsChange(cb) {
    if (typeof cb !== 'function') return noop;
    watchInsets();
    insets.cbs.push(cb);
    return function () { var i = insets.cbs.indexOf(cb); if (i >= 0) insets.cbs.splice(i, 1); };
  }

  // ---- misc ------------------------------------------------------------------------------------------------------
  // Light icons on our dark background. Returns whether the native call was issued.
  function setSystemBarsDark() {
    var sb = plugin('SystemBars');
    if (!sb || typeof sb.setStyle !== 'function') return false;
    try { swallow(sb.setStyle({ style: 'DARK' })); return true; } catch (e) { return false; }
  }
  function now() {
    try { var p = g.performance; if (p && typeof p.now === 'function') return p.now(); } catch (e) {}
    return Date.now();
  }
  function capabilities() {
    var pointerEvents = false, audioContext = false, canvas = false;
    try { pointerEvents = typeof g.PointerEvent !== 'undefined'; } catch (e) {}
    try { audioContext = !!(g.AudioContext || g.webkitAudioContext); } catch (e) {}
    try {
      var doc = g.document;
      if (doc && typeof doc.createElement === 'function') {
        var c = doc.createElement('canvas');
        canvas = !!(c && typeof c.getContext === 'function' && c.getContext('2d'));
      }
    } catch (e) {}
    return { pointerEvents: pointerEvents, audioContext: audioContext, canvas: canvas };
  }

  var Platform = {
    plugin: plugin, on: on,
    onPause: onPause, onResume: onResume, onBackButton: onBackButton, minimizeApp: minimizeApp,
    getInsets: getInsets, onInsetsChange: onInsetsChange, setSystemBarsDark: setSystemBarsDark,
    now: now, capabilities: capabilities
  };
  // Read as plain values but evaluated on access, so a bridge installed after load is still seen.
  Object.defineProperty(Platform, 'isNative', { get: isNative, enumerable: true });
  Object.defineProperty(Platform, 'platform', { get: platformName, enumerable: true });
  Object.defineProperty(Platform, 'isFile', { get: isFile, enumerable: true });

  TB.Platform = Platform;
})(typeof globalThis !== 'undefined' ? globalThis : window);
