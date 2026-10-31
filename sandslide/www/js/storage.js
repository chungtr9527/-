// Persistence: seven JSON documents held in memory (synchronous get after init) and written through one backend —
// the Capacitor Preferences plugin on native, localStorage on the web, an in-memory map when neither works
// (file:// private mode, blocked site data). set / update / remove are debounced 250 ms; flush() writes at once
// (synchronously on the web) and resolves when every pending write has settled. Defaults are merged shallowly on
// load so fields added in a later version appear on old installs. Platform module: never throws.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var PREFIX = (TB.Config && TB.Config.STORAGE_PREFIX) || 'sandslide.';
  var DEBOUNCE_MS = 250;
  var DOCS = ['profile', 'settings', 'daily', 'save', 'dailySave', 'ads', 'stats'];
  var SAVE_DOCS = ['save', 'dailySave'];   // game-in-progress slots: null when absent, never merged with defaults

  // Fresh objects on every call (nested defaults must never be shared between documents).
  var DEFAULTS = {
    profile: function () {
      return { v: 1, bestScore: 0, bestCombo: 0, bestTiltLines: 0, gamesPlayed: 0, totalLines: 0, totalTilts: 0,
        firstPlayedAt: null, lastPlayedAt: null, tutorialDone: false, playDays: [], palettesUnlocked: [0], gameOvers: 0,
        freeRescueUsed: false, bannerUnlocked: false };
    },
    settings: function () {
      return { v: 1, sound: true, haptics: true, lang: 'auto', reducedMotion: null, largeText: false, leftHanded: false, palette: 0 };
    },
    daily: function () { return { v: 1, results: {}, streak: { current: 0, best: 0, lastDate: null } }; },
    save: function () { return null; },
    dailySave: function () { return null; },   // the Daily game in progress, kept apart from the Classic save
    ads: function () {
      return { v: 1, sessions: 0, lastInterstitialAt: 0, gameOversSinceInterstitial: 0, interstitialsToday: { date: null, count: 0 },
        consent: { canRequestAds: null, privacyOptionsRequired: false }, pendingReward: null };
    },
    // Same shape as TB.Stats' defaults (stats.js normalises it again on init).
    stats: function () {
      return { v: 1, firstOpen: null, sessions: 0, games: 0, gamesByMode: {}, placements: 0, tilts: 0, tiltLinesHist: [0, 0, 0, 0, 0, 0, 0, 0],
        gameMs: [], rescuesWatched: 0, rescuesFree: 0, extraTilts: 0, sharesTapped: 0, adEvents: {}, events: {}, lastErrors: [],
        version: null, platform: null };
    }
  };

  function noop() {}
  function isThenable(x) { return !!x && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function'; }
  function valid(doc) { return DOCS.indexOf(doc) >= 0; }
  function isSaveDoc(doc) { return SAVE_DOCS.indexOf(doc) >= 0; }

  // ---- backends: get(key) -> string|null (or a Promise of one), set(key, string), remove(key); may throw/reject ----
  function preferencesBackend(p) {
    function call(fn, arg) { try { return Promise.resolve(fn.call(p, arg)); } catch (e) { return Promise.reject(e); } }
    return {
      name: 'preferences',
      get: function (key) { return call(p.get, { key: key }).then(function (r) { return r && typeof r.value === 'string' ? r.value : null; }); },
      set: function (key, value) { return call(p.set, { key: key, value: value }); },
      remove: function (key) { return call(p.remove, { key: key }); }
    };
  }
  function localBackend(ls) {
    return {
      name: 'localStorage',
      get: function (key) { var v = ls.getItem(key); return typeof v === 'string' ? v : null; },
      set: function (key, value) { ls.setItem(key, value); },
      remove: function (key) { ls.removeItem(key); }
    };
  }
  function memoryBackend() {
    var map = {};
    return {
      name: 'memory',
      get: function (key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null; },
      set: function (key, value) { map[key] = String(value); },
      remove: function (key) { delete map[key]; }
    };
  }
  // localStorage can be absent, throw on access (file:// private mode) or throw on write (quota, blocked data).
  function detectLocalStorage() {
    try {
      var ls = g.localStorage;
      if (!ls || typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function') return null;
      var probe = PREFIX + '__probe';
      ls.setItem(probe, '1');
      var ok = ls.getItem(probe) === '1';
      ls.removeItem(probe);
      return ok ? ls : null;
    } catch (e) { return null; }
  }
  function preferencesPlugin() {
    try {
      var P = TB.Platform, p = null;
      if (P && typeof P.plugin === 'function') p = P.plugin('Preferences');
      if (!p && g.Capacitor && g.Capacitor.Plugins) p = g.Capacitor.Plugins.Preferences || null;
      return p && typeof p.get === 'function' && typeof p.set === 'function' && typeof p.remove === 'function' ? p : null;
    } catch (e) { return null; }
  }
  function isNativeRuntime() {
    try {
      var P = TB.Platform;
      if (P && 'isNative' in P) return !!P.isNative;
      var c = g.Capacitor;
      return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
    } catch (e) { return false; }
  }
  function chooseBackend() {
    var pref = isNativeRuntime() ? preferencesPlugin() : null;
    if (pref) return preferencesBackend(pref);
    var ls = detectLocalStorage();
    return ls ? localBackend(ls) : memoryBackend();
  }

  // ---- state -----------------------------------------------------------------------------------------------------
  var docs = {};        // doc -> value (undefined = not loaded / missing, null = explicitly empty)
  var touched = {};     // doc -> true once written in memory (a late load must not overwrite it)
  var dirty = {};       // doc -> true while a write is pending
  var busy = {};        // doc -> number of in-flight async writes
  var chain = {};       // doc -> promise of the last write (writes to one key stay ordered)
  var backend = null, timer = null, initPromise = null;

  function ensureBackend() { if (!backend) backend = chooseBackend(); return backend; }

  function normalize(doc, v) {
    if (isSaveDoc(doc)) return v && typeof v === 'object' ? v : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;     // -> defaults
    var out = DEFAULTS[doc]();
    Object.keys(v).forEach(function (k) { out[k] = v[k]; });
    if (typeof out.v !== 'number') out.v = 1;
    return out;
  }
  function parse(doc, raw) {
    if (typeof raw !== 'string' || raw === '') return undefined;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return undefined; }           // corrupt -> defaults
    return normalize(doc, v);
  }
  function adopt(doc, raw) {
    if (touched[doc]) return;
    var v = parse(doc, raw);
    if (v !== undefined) docs[doc] = v;
  }

  // Loads every document. Idempotent; resolves even when the backend fails (missing docs become defaults).
  function init() {
    if (initPromise) return initPromise;
    var b = ensureBackend(), waits = [];
    DOCS.forEach(function (doc) {
      var r;
      try { r = b.get(PREFIX + doc); } catch (e) { r = null; }
      if (isThenable(r)) waits.push(r.then(function (raw) { adopt(doc, raw); }, function () { adopt(doc, null); }));
      else adopt(doc, r);
    });
    initPromise = (waits.length ? Promise.all(waits) : Promise.resolve()).then(noop, noop);
    return initPromise;
  }

  // Synchronous. Returns the live object (mutations are persisted by a later set/update); null for a missing save.
  function get(doc) {
    if (!valid(doc)) return null;
    var v = docs[doc];
    if (v === undefined || v === null) {
      if (isSaveDoc(doc)) return null;
      v = docs[doc] = DEFAULTS[doc]();
    }
    return v;
  }

  function markDirty(doc) {
    touched[doc] = true;
    dirty[doc] = true;
    try {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; flush(); }, DEBOUNCE_MS);
    } catch (e) {}
  }
  function set(doc, value) {
    if (!valid(doc)) return null;
    if (value === undefined) value = null;
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.v !== 'number') value.v = 1;
    docs[doc] = value;
    markDirty(doc);
    return value;
  }
  function update(doc, patch) {
    if (!valid(doc)) return null;
    var cur = get(doc);
    if (!cur || typeof cur !== 'object') { cur = {}; docs[doc] = cur; }
    if (patch && typeof patch === 'object') Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    if (typeof cur.v !== 'number') cur.v = 1;
    markDirty(doc);
    return cur;
  }
  function remove(doc) {
    if (!valid(doc)) return;
    docs[doc] = undefined;
    markDirty(doc);
  }

  function writeDoc(doc) {
    dirty[doc] = false;
    var b = ensureBackend(), key = PREFIX + doc, v = docs[doc], payload;
    if (v === undefined || v === null) payload = null;
    else { try { payload = JSON.stringify(v); } catch (e) { payload = undefined; } }
    if (payload !== null && typeof payload !== 'string') return Promise.resolve();   // unserialisable: keep in memory only
    function run() {
      var r;
      try { r = payload === null ? b.remove(key) : b.set(key, payload); } catch (e) { return Promise.resolve(); }
      return isThenable(r) ? r.then(noop, noop) : Promise.resolve();
    }
    var p = busy[doc] > 0 ? chain[doc].then(run, run) : run();
    busy[doc] = (busy[doc] | 0) + 1;
    p = p.then(function () { busy[doc]--; }, function () { busy[doc]--; });
    chain[doc] = p;
    return p;
  }
  // Writes every dirty document now. Resolves when they (and any earlier in-flight writes) have settled; never rejects.
  function flush() {
    if (timer) { try { clearTimeout(timer); } catch (e) {} timer = null; }
    var ps = [];
    DOCS.forEach(function (doc) {
      if (dirty[doc]) ps.push(writeDoc(doc));
      else if (busy[doc] > 0 && chain[doc]) ps.push(chain[doc]);
    });
    return Promise.all(ps).then(noop, noop);
  }

  TB.Storage = { init: init, get: get, set: set, update: update, flush: flush, remove: remove, DOCS: DOCS.slice() };
})(typeof globalThis !== 'undefined' ? globalThis : window);
