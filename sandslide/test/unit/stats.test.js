'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const TB = require('../helpers/load-engine');
const JS = path.join(__dirname, '..', '..', 'www', 'js');
const PLATFORM = path.join(JS, 'platform.js'), STATS = path.join(JS, 'stats.js');

// Fresh module state per test (the IIFE keeps the live document and the installed flags in a closure).
function fresh() {
  for (const f of [PLATFORM, STATS]) delete require.cache[require.resolve(f)];
  require(PLATFORM); require(STATS);
  return globalThis.TB.Stats;
}
// Minimal TB.Storage stand-in: synchronous get, every set recorded.
function fakeStorage(initial) {
  const docs = Object.assign({ profile: { v: 1, bestScore: 777 }, settings: { v: 1, sound: false } }, initial || {});
  const sets = [];
  return {
    docs, sets,
    get(doc) { return doc in docs ? docs[doc] : null; },
    set(doc, value) { sets.push([doc, value]); docs[doc] = value; return value; },
    update(doc, patch) { docs[doc] = Object.assign(docs[doc] || {}, patch); sets.push([doc, docs[doc]]); return docs[doc]; },
    flush() { return Promise.resolve(); }
  };
}

afterEach(() => { delete globalThis.onerror; delete globalThis.onunhandledrejection; delete globalThis.Capacitor; });

test('init loads the stored document, counts a session, stamps firstOpen / version / platform, and is idempotent', () => {
  const st = fakeStorage({ stats: { v: 1, sessions: 4, games: 2, firstOpen: '2026-10-01T00:00:00.000Z' } });
  const T = fresh();
  for (const k of ['init', 'record', 'snapshot', 'diagnosticsJSON', 'installErrorHandlers']) assert.equal(typeof T[k], 'function', k);
  T.init(st);
  const s = T.snapshot();
  assert.equal(s.sessions, 5); assert.equal(s.games, 2); assert.equal(s.firstOpen, '2026-10-01T00:00:00.000Z');
  assert.equal(s.version, TB.Config.VERSION); assert.equal(s.platform, 'web');
  assert.deepEqual(s.tiltLinesHist, [0, 0, 0, 0, 0, 0, 0, 0]); assert.deepEqual(s.gameMs, []); assert.deepEqual(s.lastErrors, []);
  assert.equal(s.placements, 0); assert.equal(s.tilts, 0); assert.equal(s.rescuesWatched, 0); assert.equal(s.sharesTapped, 0);
  T.init(st);
  assert.equal(T.snapshot().sessions, 5, 'init is idempotent');
  assert.equal(st.docs.stats.sessions, 5, 'persisted through storage.set');
  assert.deepEqual(st.sets[0][0], 'stats');

  const T2 = fresh(), st2 = fakeStorage();
  T2.init(st2);
  const s2 = T2.snapshot();
  assert.equal(s2.sessions, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(s2.firstOpen), 'fresh install: firstOpen is an ISO timestamp');
  assert.ok(Date.now() - Date.parse(s2.firstOpen) < 5000);
});

test('record updates the counters and persists the live document through storage', () => {
  const st = fakeStorage();
  const T = fresh();
  T.init(st);
  T.record('game_start', { mode: 'classic' }); T.record('game_start', { mode: 'daily' }); T.record('game_start', { mode: 'classic' });
  for (let i = 0; i < 4; i++) T.record('placement');
  T.record('place', { slot: 1 });
  T.record('tilt', { dir: 'down', lines: 0 }); T.record('tilt', { dir: 'up', lines: 2 }); T.record('tilt', { dir: 'left', lines: 2 });
  T.record('tilt', { dir: 'right', lines: 12 }); T.record('tilt');
  T.record('rescue'); T.record('rescue', { free: true }); T.record('extra_tilt'); T.record('share'); T.record('share');
  T.record('ad_interstitial_shown'); T.record('ad_interstitial_shown'); T.record('ad_rewarded_reward', { kind: 'rescue' });
  T.record('palette_unlock', { id: 3 });
  assert.doesNotThrow(() => { T.record(''); T.record(null); T.record(42); T.record('tilt', 'junk'); });
  const s = T.snapshot();
  assert.equal(s.games, 3); assert.deepEqual(s.gamesByMode, { classic: 2, daily: 1 });
  assert.equal(s.placements, 5);
  assert.equal(s.tilts, 6); assert.deepEqual(s.tiltLinesHist, [3, 0, 2, 0, 0, 0, 0, 1], 'lines >= 7 land in the last bucket');
  assert.equal(s.rescuesWatched, 1); assert.equal(s.rescuesFree, 1); assert.equal(s.extraTilts, 1); assert.equal(s.sharesTapped, 2);
  assert.deepEqual(s.adEvents, { interstitial_shown: 2, rewarded_reward: 1 });
  assert.deepEqual(s.events, { palette_unlock: 1 });
  assert.equal(st.docs.stats.games, 3, 'the storage holds the live document');
  assert.ok(st.sets.length >= 2 && st.sets.every((e) => e[0] === 'stats'));
});

test('gameMs is a ring of the last 50 durations (sec or ms); game_over without a duration adds nothing', () => {
  const T = fresh();
  T.init(fakeStorage());
  for (let i = 1; i <= 55; i++) T.record('game_over', { score: i * 10, sec: i, mode: 'classic' });
  T.record('game_over', { ms: 1234.4 });
  T.record('game_over', { score: 1 });
  const s = T.snapshot();
  assert.equal(s.gameMs.length, 50);
  assert.equal(s.gameMs[0], 7000, 'oldest entries dropped');
  assert.equal(s.gameMs[48], 55000);
  assert.equal(s.gameMs[49], 1234);
});

test('installErrorHandlers captures window.onerror / unhandledrejection into lastErrors (max 5) and chains earlier handlers', () => {
  const prev = [];
  globalThis.onerror = (...a) => { prev.push(a[0]); return true; };
  const T = fresh();
  T.init(fakeStorage());
  T.installErrorHandlers();
  T.installErrorHandlers();   // idempotent: one capture per error
  for (let i = 1; i <= 7; i++) globalThis.onerror('err ' + i, 'app.js', i, 2, new Error('err ' + i));
  let s = T.snapshot();
  assert.equal(s.lastErrors.length, 5);
  assert.deepEqual(s.lastErrors.map((e) => e.message), ['err 3', 'err 4', 'err 5', 'err 6', 'err 7']);
  const e = s.lastErrors[4];
  assert.equal(e.source, 'app.js'); assert.equal(e.line, 7); assert.equal(e.col, 2);
  assert.equal(e.version, TB.Config.VERSION); assert.equal(e.platform, 'web'); assert.equal(e.count, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(e.time)); assert.ok(e.stack.includes('err 7'));
  assert.deepEqual(prev, ['err 1', 'err 2', 'err 3', 'err 4', 'err 5', 'err 6', 'err 7'], 'the previous onerror still runs');

  globalThis.onerror('err 7', 'app.js', 7, 2, new Error('err 7'));   // a throwing rAF loop stays one entry
  s = T.snapshot();
  assert.equal(s.lastErrors.length, 5); assert.equal(s.lastErrors[4].count, 2); assert.equal(s.lastErrors[4].message, 'err 7');

  globalThis.onunhandledrejection({ reason: new Error('rejected') });
  globalThis.onunhandledrejection({ reason: 'plain string' });
  s = T.snapshot();
  assert.equal(s.lastErrors.length, 5);
  assert.equal(s.lastErrors[3].message, 'rejected'); assert.equal(s.lastErrors[3].source, 'unhandledrejection'); assert.ok(s.lastErrors[3].stack);
  assert.equal(s.lastErrors[4].message, 'plain string');

  T.record('error', { message: 'manual', source: 'ads.js' });
  assert.equal(T.snapshot().lastErrors[4].message, 'manual');
  globalThis.onerror('Script error.');
  const last = T.snapshot().lastErrors[4];
  assert.equal(last.message, 'Script error.'); assert.equal(last.line, null); assert.equal(last.source, null);
  assert.doesNotThrow(() => globalThis.onerror());
  assert.doesNotThrow(() => globalThis.onunhandledrejection());
  assert.equal(T.snapshot().lastErrors.length, 5);
});

test('what is recorded before init (errors, events) is merged into the stored document; works with no storage at all', () => {
  const T = fresh();
  T.installErrorHandlers();
  globalThis.onerror('early', 'boot.js', 1, 1);
  T.record('tilt', { lines: 3 }); T.record('ad_banner_loaded'); T.record('game_start', { mode: 'tutorial' });
  assert.equal(T.snapshot().lastErrors.length, 1);
  assert.equal(T.snapshot().sessions, 0);
  const st = fakeStorage({ stats: { v: 1, sessions: 1, tilts: 10, tiltLinesHist: [0, 0, 0, 5, 0, 0, 0, 0], lastErrors: [{ message: 'old' }],
    adEvents: { banner_loaded: 2 }, games: 1 } });
  T.init(st);
  const s = T.snapshot();
  assert.equal(s.sessions, 2); assert.equal(s.tilts, 11); assert.equal(s.tiltLinesHist[3], 6); assert.equal(s.games, 2);
  assert.deepEqual(s.lastErrors.map((e) => e.message), ['old', 'early']);
  assert.deepEqual(s.adEvents, { banner_loaded: 3 }); assert.deepEqual(s.gamesByMode, { tutorial: 1 });

  const T2 = fresh();
  assert.doesNotThrow(() => { T2.init(null); T2.record('share'); T2.installErrorHandlers(); });
  assert.equal(T2.snapshot().sharesTapped, 1);
  assert.equal(T2.snapshot().sessions, 1);
  assert.equal(JSON.parse(T2.diagnosticsJSON()).profile, null);
});

test('normalises a malformed stored document', () => {
  const st = fakeStorage({ stats: { v: 1, sessions: '3', games: -1, tiltLinesHist: [1, 2], gameMs: Array.from({ length: 70 }, (_, i) => i).concat(['x']),
    lastErrors: new Array(9).fill({ message: 'm' }).concat([null, 'str']), adEvents: null, events: [1], firstOpen: 5, version: 7 } });
  const T = fresh();
  T.init(st);
  const s = T.snapshot();
  assert.equal(s.sessions, 1); assert.equal(s.games, 0);
  assert.deepEqual(s.tiltLinesHist, [1, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(s.gameMs.length, 50); assert.equal(s.gameMs[0], 20); assert.equal(s.gameMs[49], 69);
  assert.equal(s.lastErrors.length, 5);
  assert.deepEqual(s.adEvents, {}); assert.deepEqual(s.events, {});
  assert.equal(typeof s.firstOpen, 'string'); assert.equal(s.version, TB.Config.VERSION);
  const T2 = fresh();
  T2.init(fakeStorage({ stats: 'garbage' }));
  assert.equal(T2.snapshot().sessions, 1);
});

test('snapshot is a copy; diagnosticsJSON is pretty JSON of the snapshot plus the profile (and settings)', () => {
  const st = fakeStorage();
  const T = fresh();
  T.init(st);
  T.record('tilt', { lines: 1 });
  const a = T.snapshot();
  a.games = 99; a.tiltLinesHist[1] = 99; a.adEvents.x = 1; a.lastErrors.push({});
  const b = T.snapshot();
  assert.equal(b.games, 0); assert.equal(b.tiltLinesHist[1], 1); assert.deepEqual(b.adEvents, {}); assert.deepEqual(b.lastErrors, []);
  const json = T.diagnosticsJSON();
  assert.ok(json.includes('\n  "'), 'pretty-printed');
  const d = JSON.parse(json);
  assert.equal(d.sessions, 1); assert.equal(d.tilts, 1); assert.equal(d.version, TB.Config.VERSION); assert.equal(d.platform, 'web');
  assert.deepEqual(d.profile, { v: 1, bestScore: 777 });
  assert.deepEqual(d.settings, { v: 1, sound: false });
  assert.equal(d.env, TB.flags.env);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(d.generatedAt));
});

test('platform and version come from TB.Platform / TB.Config', () => {
  globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
  const T = fresh();
  T.init(fakeStorage());
  T.installErrorHandlers();
  globalThis.onerror('x', 'y.js', 1, 1);
  const s = T.snapshot();
  assert.equal(s.platform, 'android');
  assert.equal(s.lastErrors[0].platform, 'android');
  assert.equal(s.lastErrors[0].version, TB.Config.VERSION);
});
