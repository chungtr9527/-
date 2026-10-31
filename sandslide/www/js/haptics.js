// Haptics: Capacitor Haptics plugin when running natively, navigator.vibrate on the web, nothing otherwise.
// One 40 ms throttle shared by every effect; inside the window only a stronger effect replaces the last one
// (so a drop's Light never swallows the clear's Success that follows it in the same frame).
// Platform module: must never throw and must degrade to a no-op without window.Capacitor.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var THROTTLE_MS = 40;
  var IMPACT = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
  var NOTIFY = { success: 'SUCCESS', warning: 'WARNING', error: 'ERROR' };
  var WEB = { light: [20], medium: [43], heavy: [61], success: [30, 40, 30], warning: [50, 40, 50], error: [60, 30, 60, 30, 60] };
  var WEIGHT = { light: 1, medium: 2, warning: 2, heavy: 3, success: 3, error: 4 };

  var enabled = true, last = -Infinity, lastWeight = 0;

  function noop() {}
  function swallow(p) { try { if (p && typeof p.then === 'function') p.then(noop, noop); } catch (e) {} }

  function now() {
    try {
      if (TB.Platform && typeof TB.Platform.now === 'function') return TB.Platform.now();
      if (g.performance && typeof g.performance.now === 'function') return g.performance.now();
    } catch (e) {}
    return Date.now();
  }

  // Resolved on every call: TB.Platform and the Capacitor bridge may appear after this file is evaluated.
  function plugin() {
    try {
      if (TB.Platform && typeof TB.Platform.plugin === 'function') {
        var p = TB.Platform.plugin('Haptics');
        if (p) return p;
      }
      var cap = g.Capacitor;
      return (cap && cap.Plugins && cap.Plugins.Haptics) || null;
    } catch (e) { return null; }
  }

  function vibrate(pattern) {
    try {
      var nav = g.navigator;
      if (nav && typeof nav.vibrate === 'function') { nav.vibrate(pattern); return true; }
    } catch (e) {}
    return false;
  }

  function fire(kind) {
    if (!enabled) return false;
    var t = now(), w = WEIGHT[kind] || 1;
    if (t - last < THROTTLE_MS && w <= lastWeight) return false;
    last = t; lastWeight = w;
    var p = plugin();
    if (p) {
      try {
        if (IMPACT[kind] && typeof p.impact === 'function') { swallow(p.impact({ style: IMPACT[kind] })); return true; }
        if (NOTIFY[kind] && typeof p.notification === 'function') { swallow(p.notification({ type: NOTIFY[kind] })); return true; }
      } catch (e) {}
    }
    return vibrate(WEB[kind]);
  }

  function setEnabled(on) {
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    last = -Infinity; lastWeight = 0;
    if (!on) vibrate(0);   // stop a running web vibration pattern
  }
  function isEnabled() { return enabled; }

  TB.Haptics = {
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    light: function () { return fire('light'); },
    medium: function () { return fire('medium'); },
    heavy: function () { return fire('heavy'); },
    success: function () { return fire('success'); },
    warning: function () { return fire('warning'); },
    error: function () { return fire('error'); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
