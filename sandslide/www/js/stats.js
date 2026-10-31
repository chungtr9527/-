// Local-only telemetry: counters, a histogram of lines per tilt, a ring of the last 50 game durations and the last
// 5 errors, persisted as the 'stats' document through TB.Storage (debounced there). Nothing ever leaves the device;
// the Stats panel's "Copy diagnostics" button puts diagnosticsJSON() on the clipboard for bug reports.
// Platform module: may use Date / window; never throws; works before init() (in memory) and without a storage.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var HIST = 8;          // tiltLinesHist[0..7]: 7 = 7 or more lines
  var RING = 50;         // gameMs keeps the latest 50 games
  var MAX_ERRORS = 5;
  var MAX_KEYS = 64;     // bound for the adEvents / events / gamesByMode maps

  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  // Same shape as TB.Storage's 'stats' default.
  function defaults() {
    return { v: 1, firstOpen: null, sessions: 0, games: 0, gamesByMode: {}, placements: 0, tilts: 0, tiltLinesHist: zeros(HIST),
      gameMs: [], rescuesWatched: 0, rescuesFree: 0, extraTilts: 0, sharesTapped: 0, adEvents: {}, events: {}, lastErrors: [],
      version: null, platform: null };
  }

  var S = null;                 // the storage (TB.Storage or a compatible object)
  var doc = defaults();         // live stats document
  var inited = false, handlersInstalled = false;

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function numOrNull(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function str(v, max) { if (v === null || v === undefined) return null; try { return String(v).slice(0, max); } catch (e) { return null; } }
  function map(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function iso() { try { return new Date().toISOString(); } catch (e) { return null; } }
  function version() { try { return (TB.Config && TB.Config.VERSION) || null; } catch (e) { return null; } }
  function platformName() { try { return (TB.Platform && TB.Platform.platform) || 'web'; } catch (e) { return 'web'; } }
  function bump(m, key) {
    key = String(key);
    if (hasOwn(m, key)) m[key] = num(m[key]) + 1;
    else if (Object.keys(m).length < MAX_KEYS) m[key] = 1;
  }
  function pushRing(arr, v) { arr.push(v); while (arr.length > RING) arr.shift(); }

  // Coerces whatever was stored (older version, corrupt fields) into the current shape.
  function normalize(v) {
    var out = defaults();
    if (!v || typeof v !== 'object') return out;
    ['sessions', 'games', 'placements', 'tilts', 'rescuesWatched', 'rescuesFree', 'extraTilts', 'sharesTapped'].forEach(function (k) { out[k] = Math.max(0, Math.floor(num(v[k]))); });
    var hist = Array.isArray(v.tiltLinesHist) ? v.tiltLinesHist : [];
    for (var i = 0; i < HIST; i++) out.tiltLinesHist[i] = Math.max(0, Math.floor(num(hist[i])));
    out.gameMs = (Array.isArray(v.gameMs) ? v.gameMs : []).filter(function (x) { return typeof x === 'number' && isFinite(x); }).slice(-RING);
    out.lastErrors = (Array.isArray(v.lastErrors) ? v.lastErrors : []).filter(function (e) { return e && typeof e === 'object'; }).slice(-MAX_ERRORS);
    out.gamesByMode = map(v.gamesByMode); out.adEvents = map(v.adEvents); out.events = map(v.events);
    out.firstOpen = typeof v.firstOpen === 'string' ? v.firstOpen : null;
    out.version = typeof v.version === 'string' ? v.version : null;
    out.platform = typeof v.platform === 'string' ? v.platform : null;
    return out;
  }
  // Adds what was recorded before init() (in memory) to the stored document.
  function merge(into, pre) {
    ['sessions', 'games', 'placements', 'tilts', 'rescuesWatched', 'rescuesFree', 'extraTilts', 'sharesTapped'].forEach(function (k) { into[k] += pre[k]; });
    for (var i = 0; i < HIST; i++) into.tiltLinesHist[i] += pre.tiltLinesHist[i];
    pre.gameMs.forEach(function (ms) { pushRing(into.gameMs, ms); });
    pre.lastErrors.forEach(function (e) { into.lastErrors.push(e); });
    while (into.lastErrors.length > MAX_ERRORS) into.lastErrors.shift();
    [['gamesByMode'], ['adEvents'], ['events']].forEach(function (p) {
      var k = p[0];
      Object.keys(pre[k]).forEach(function (key) { for (var n = 0; n < num(pre[k][key]); n++) bump(into[k], key); });
    });
    if (!into.firstOpen) into.firstOpen = pre.firstOpen;
    return into;
  }

  function persist() {
    try { if (S && typeof S.set === 'function') S.set('stats', doc); } catch (e) {}
  }

  // init(storage): loads the stored document (merging anything recorded earlier), counts a session. Idempotent.
  function init(storage) {
    S = storage || TB.Storage || null;
    if (inited) return;
    inited = true;
    var stored = null;
    try { stored = S && typeof S.get === 'function' ? S.get('stats') : null; } catch (e) { stored = null; }
    doc = merge(normalize(stored), doc);
    if (!doc.firstOpen) doc.firstOpen = iso();
    doc.sessions++;
    doc.version = version();
    doc.platform = platformName();
    persist();
  }

  function pushError(info) {
    try {
      info = info || {};
      var msg = info.message;
      if (msg && typeof msg === 'object' && msg.message) msg = msg.message;
      var e = { message: str(msg, 300) || 'error', source: str(info.source, 200), line: numOrNull(info.line), col: numOrNull(info.col),
        stack: str(info.stack, 600), version: version(), platform: platformName(), time: iso(), count: 1 };
      var last = doc.lastErrors[doc.lastErrors.length - 1];
      if (last && last.message === e.message && last.source === e.source && last.line === e.line) {
        last.count = num(last.count) + 1; last.time = e.time;      // a throwing rAF loop stays one entry
      } else {
        doc.lastErrors.push(e);
        while (doc.lastErrors.length > MAX_ERRORS) doc.lastErrors.shift();
      }
      persist();
    } catch (e2) {}
  }

  function durationMs(props) {
    if (typeof props.ms === 'number' && isFinite(props.ms)) return Math.max(0, Math.round(props.ms));
    if (typeof props.sec === 'number' && isFinite(props.sec)) return Math.max(0, Math.round(props.sec * 1000));
    return null;
  }

  // record(event, props). Known events: game_start{mode}, game_over{score,lines,pieces,sec|ms,tilts,revived,mode},
  // place | placement, tilt{dir,lines}, rescue{free?}, extra_tilt, share, error{message,source,line,col,stack},
  // ad_* (counted in adEvents without the prefix); anything else is counted in events.
  function record(event, props) {
    if (typeof event !== 'string' || !event) return;
    props = props && typeof props === 'object' ? props : {};
    try {
      switch (event) {
        case 'game_start': doc.games++; if (props.mode) bump(doc.gamesByMode, props.mode); break;
        case 'game_over': { var ms = durationMs(props); if (ms !== null) pushRing(doc.gameMs, ms); break; }
        case 'place': case 'placement': doc.placements++; break;
        case 'tilt': { var n = Math.floor(num(props.lines)); doc.tilts++; doc.tiltLinesHist[n < 0 ? 0 : n >= HIST ? HIST - 1 : n]++; break; }
        case 'rescue': if (props.free) doc.rescuesFree++; else doc.rescuesWatched++; break;
        case 'extra_tilt': doc.extraTilts++; break;
        case 'share': doc.sharesTapped++; break;
        case 'error': pushError(props); return;              // pushError persists itself
        default:
          if (event.indexOf('ad_') === 0) bump(doc.adEvents, event.slice(3));
          else bump(doc.events, event);
      }
    } catch (e) {}
    persist();
  }

  // A copy: callers cannot mutate the live document.
  function snapshot() {
    try { return JSON.parse(JSON.stringify(doc)); } catch (e) {
      var out = {}; Object.keys(doc).forEach(function (k) { out[k] = doc[k]; }); return out;
    }
  }
  function safeGet(name) { try { return S && typeof S.get === 'function' ? S.get(name) : null; } catch (e) { return null; } }
  // Pretty JSON of snapshot() plus the profile (and settings) documents, for the "Copy diagnostics" button.
  function diagnosticsJSON() {
    var out = snapshot();
    out.profile = safeGet('profile');
    out.settings = safeGet('settings');
    try { out.env = TB.flags ? TB.flags.env : null; } catch (e) { out.env = null; }
    try { out.ua = g.navigator && g.navigator.userAgent ? String(g.navigator.userAgent) : null; } catch (e) { out.ua = null; }
    out.generatedAt = iso();
    try { return JSON.stringify(out, null, 2); } catch (e) { return '{}'; }
  }

  // window.onerror / window.onunhandledrejection -> lastErrors (max 5). Earlier handlers keep running. Idempotent.
  function installErrorHandlers() {
    if (handlersInstalled) return;
    handlersInstalled = true;
    try {
      var prevError = g.onerror;
      g.onerror = function (message, source, line, col, error) {
        try {
          var msg = message, stack = null;
          if (error && typeof error === 'object') { if (error.message) msg = error.message; if (error.stack) stack = error.stack; }
          if (msg && typeof msg === 'object' && msg.message) msg = msg.message;
          pushError({ message: msg, source: source, line: line, col: col, stack: stack });
        } catch (e) {}
        if (typeof prevError === 'function') { try { return prevError.apply(this, arguments); } catch (e) {} }
        return false;
      };
    } catch (e) {}
    try {
      var prevRejection = g.onunhandledrejection;
      g.onunhandledrejection = function (ev) {
        try {
          var r = ev && typeof ev === 'object' && 'reason' in ev ? ev.reason : ev;
          var msg = r && typeof r === 'object' && r.message ? r.message : String(r);
          pushError({ message: msg, source: 'unhandledrejection', stack: r && typeof r === 'object' && r.stack ? r.stack : null });
        } catch (e) {}
        if (typeof prevRejection === 'function') { try { return prevRejection.apply(this, arguments); } catch (e) {} }
      };
    } catch (e) {}
  }

  TB.Stats = { init: init, record: record, snapshot: snapshot, diagnosticsJSON: diagnosticsJSON, installErrorHandlers: installErrorHandlers };
})(typeof globalThis !== 'undefined' ? globalThis : window);
