'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const TB = require('../helpers/load-engine');
const JS = path.join(__dirname, '..', '..', 'www', 'js');
const PLATFORM = path.join(JS, 'platform.js'), STORAGE = path.join(JS, 'storage.js');
const PREFIX = TB.Config.STORAGE_PREFIX;

// Fresh module state per test (the IIFEs keep the backend, the documents and the debounce timer in a closure).
function fresh() {
  for (const f of [PLATFORM, STORAGE]) delete require.cache[require.resolve(f)];
  require(PLATFORM); require(STORAGE);
  return globalThis.TB.Storage;
}
function fakeLocalStorage(opts) {
  opts = opts || {};
  const store = new Map(), log = [];
  return {
    store, log,
    getItem(k) { log.push(['get', k]); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) {
      log.push(['set', k, String(v)]);
      if (opts.throwOnSet && !k.endsWith('__probe')) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem(k) { log.push(['remove', k]); store.delete(k); },
    key(i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; },
    clear() { store.clear(); }
  };
}
function installLocalStorage(ls) {
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true, enumerable: true });
  return ls;
}
function installThrowingLocalStorage() {
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true, enumerable: true });
}
function fakePreferences(initial) {
  const store = Object.assign({}, initial || {}), calls = [];
  return {
    store, calls,
    get(o) { calls.push(['get', o.key]); return Promise.resolve({ value: Object.prototype.hasOwnProperty.call(store, o.key) ? store[o.key] : null }); },
    set(o) { calls.push(['set', o.key, o.value]); store[o.key] = o.value; return Promise.resolve(); },
    remove(o) { calls.push(['remove', o.key]); delete store[o.key]; return Promise.resolve(); }
  };
}
function nativeBridge(prefs) { return { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { Preferences: prefs } }; }
const writes = (ls) => ls.log.filter((e) => e[0] === 'set' && !e[1].endsWith('__probe'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => { delete globalThis.localStorage; delete globalThis.Capacitor; });

test('exposes the contract API; defaults are created on first get, carry v:1 and are not written by themselves', async () => {
  const ls = installLocalStorage(fakeLocalStorage());
  const S = fresh();
  assert.deepEqual(S.DOCS, ['profile', 'settings', 'daily', 'save', 'dailySave', 'ads', 'stats']);
  for (const k of ['init', 'get', 'set', 'update', 'flush', 'remove']) assert.equal(typeof S[k], 'function', k);
  await S.init();
  const p = S.get('profile');
  assert.deepEqual(p, { v: 1, bestScore: 0, bestCombo: 0, bestTiltLines: 0, gamesPlayed: 0, totalLines: 0, totalTilts: 0,
    firstPlayedAt: null, lastPlayedAt: null, tutorialDone: false, playDays: [], palettesUnlocked: [0], gameOvers: 0,
    freeRescueUsed: false, bannerUnlocked: false });
  assert.deepEqual(S.get('settings'), { v: 1, sound: true, haptics: true, lang: 'auto', reducedMotion: null, largeText: false, leftHanded: false, palette: 0 });
  assert.deepEqual(S.get('daily'), { v: 1, results: {}, streak: { current: 0, best: 0, lastDate: null } });
  assert.equal(S.get('save'), null);
  assert.equal(S.get('dailySave'), null, 'the Daily slot starts empty too');
  assert.deepEqual(S.get('ads'), { v: 1, sessions: 0, lastInterstitialAt: 0, gameOversSinceInterstitial: 0, interstitialsToday: { date: null, count: 0 },
    consent: { canRequestAds: null, privacyOptionsRequired: false }, pendingReward: null });
  const st = S.get('stats');
  assert.equal(st.v, 1);
  for (const k of ['firstOpen', 'sessions', 'games', 'placements', 'tilts', 'tiltLinesHist', 'gameMs', 'rescuesWatched', 'sharesTapped', 'lastErrors', 'version', 'platform']) assert.ok(k in st, k);
  assert.equal(st.tiltLinesHist.length, 8);
  assert.equal(S.get('profile'), p, 'get returns the live object');
  assert.equal(S.get('nope'), null);
  assert.equal(S.set('nope', { a: 1 }), null);
  assert.equal(S.update('nope', { a: 1 }), null);
  assert.doesNotThrow(() => S.remove('nope'));
  await S.flush();
  assert.equal(writes(ls).length, 0, 'untouched defaults are never written');
});

test('init loads stored documents with sandslide.-prefixed keys and merges defaults shallowly (new fields appear on old installs)', async () => {
  const ls = installLocalStorage(fakeLocalStorage());
  ls.store.set(PREFIX + 'settings', JSON.stringify({ v: 1, sound: false, palette: 3 }));
  ls.store.set(PREFIX + 'profile', JSON.stringify({ bestScore: 1234, playDays: ['2026-11-01'] }));   // old doc without v
  ls.store.set(PREFIX + 'save', JSON.stringify({ v: 1, mode: 'classic', seed: 'x' }));
  ls.store.set(PREFIX + 'daily', 'not json {');
  ls.store.set(PREFIX + 'ads', JSON.stringify([1, 2]));
  ls.store.set(PREFIX + 'stats', 'null');
  const S = fresh();
  await S.init();
  const s = S.get('settings');
  assert.equal(s.sound, false); assert.equal(s.palette, 3);
  assert.equal(s.haptics, true, 'missing field filled from the defaults'); assert.equal(s.lang, 'auto');
  const p = S.get('profile');
  assert.equal(p.bestScore, 1234); assert.deepEqual(p.playDays, ['2026-11-01']); assert.equal(p.v, 1); assert.equal(p.freeRescueUsed, false);
  assert.deepEqual(S.get('save'), { v: 1, mode: 'classic', seed: 'x' });
  assert.deepEqual(S.get('daily'), { v: 1, results: {}, streak: { current: 0, best: 0, lastDate: null } }, 'corrupt JSON -> defaults');
  assert.equal(S.get('ads').sessions, 0, 'wrong type -> defaults');
  assert.equal(S.get('stats').sessions, 0);
  assert.ok(ls.log.every((e) => e[1].startsWith(PREFIX)), 'every key is prefixed');
  assert.deepEqual(ls.log.filter((e) => e[0] === 'get' && !e[1].endsWith('__probe')).map((e) => e[1]).sort(), S.DOCS.map((d) => PREFIX + d).sort());
});

test('set / update debounce the write by 250 ms and coalesce; get stays synchronous', async () => {
  const ls = installLocalStorage(fakeLocalStorage());
  const S = fresh();
  await S.init();
  const p = S.update('profile', { bestScore: 10 });
  assert.equal(p.bestScore, 10);
  assert.equal(S.get('profile'), p, 'update returns the live document');
  S.update('profile', { bestScore: 20 });
  S.update('profile', { bestCombo: 3 });
  const settings = S.set('settings', { sound: false });
  assert.equal(settings.v, 1, 'set stamps v:1 on a document without one');
  assert.equal(S.get('settings'), settings);
  S.get('profile').totalLines = 7;                 // mutation of the live object rides along with the pending write
  assert.equal(writes(ls).length, 0, 'nothing written synchronously');
  await sleep(60);
  assert.equal(writes(ls).length, 0, 'still pending after 60 ms');
  await sleep(250);
  assert.equal(writes(ls).length, 2, 'one write per dirty document');
  const stored = JSON.parse(ls.store.get(PREFIX + 'profile'));
  assert.equal(stored.bestScore, 20); assert.equal(stored.bestCombo, 3); assert.equal(stored.totalLines, 7); assert.equal(stored.v, 1);
  assert.deepEqual(JSON.parse(ls.store.get(PREFIX + 'settings')), { sound: false, v: 1 });
  const save = S.update('save', { v: 1, mode: 'daily' });
  assert.equal(S.get('save'), save, 'update on a missing save creates it');
  assert.equal(save.mode, 'daily');
});

test('flush writes immediately (synchronously on localStorage), returns a promise and cancels the pending timer', async () => {
  const ls = installLocalStorage(fakeLocalStorage());
  const S = fresh();
  await S.init();
  S.update('daily', { streak: { current: 2, best: 2, lastDate: '2026-11-02' } });
  const p = S.flush();
  assert.ok(p && typeof p.then === 'function');
  assert.equal(writes(ls).length, 1, 'the localStorage write happens inside flush() itself');
  await p;
  assert.equal(JSON.parse(ls.store.get(PREFIX + 'daily')).streak.current, 2);
  await sleep(320);
  assert.equal(writes(ls).length, 1, 'the debounced write was cancelled by flush');
  await S.flush();
  assert.equal(writes(ls).length, 1, 'nothing dirty: nothing written');
});

test('remove deletes the key; get afterwards returns fresh defaults (null for save); set(save, null) removes too', async () => {
  const ls = installLocalStorage(fakeLocalStorage());
  const S = fresh();
  await S.init();
  S.set('save', { v: 1, mode: 'classic' });
  S.update('profile', { bestScore: 99 });
  await S.flush();
  assert.ok(ls.store.has(PREFIX + 'save'));
  assert.ok(ls.store.has(PREFIX + 'profile'));
  S.remove('save');
  S.remove('profile');
  assert.equal(S.get('save'), null);
  assert.equal(S.get('profile').bestScore, 0, 'defaults again, not the removed document');
  await S.flush();
  assert.equal(ls.store.has(PREFIX + 'save'), false);
  const raw = ls.store.get(PREFIX + 'profile');
  assert.ok(raw === undefined || JSON.parse(raw).bestScore === 0, 'the removed profile is gone or back to defaults');
  S.set('save', { v: 1, mode: 'daily' });
  await S.flush();
  assert.ok(ls.store.has(PREFIX + 'save'));
  S.set('save', null);
  await S.flush();
  assert.equal(ls.store.has(PREFIX + 'save'), false);
  assert.equal(S.get('save'), null);
});

test('falls back to memory when localStorage is missing or throws on access (file:// private mode)', async () => {
  installThrowingLocalStorage();
  const S = fresh();
  await assert.doesNotReject(S.init());
  S.update('profile', { bestScore: 7 });
  await assert.doesNotReject(S.flush());
  assert.equal(S.get('profile').bestScore, 7);
  delete globalThis.localStorage;
  const S2 = fresh();
  await S2.init();
  S2.set('settings', { sound: false });
  await S2.flush();
  assert.equal(S2.get('settings').sound, false);
  S2.remove('settings');
  await S2.flush();
  assert.equal(S2.get('settings').sound, true);
});

test('keeps data in memory when localStorage rejects writes (quota) and never rejects flush', async () => {
  const ls = installLocalStorage(fakeLocalStorage({ throwOnSet: true }));
  const S = fresh();
  await S.init();
  S.update('profile', { bestScore: 5 });
  await assert.doesNotReject(S.flush());
  assert.equal(S.get('profile').bestScore, 5);
  assert.equal(ls.store.has(PREFIX + 'profile'), false);
  await sleep(10);   // a stray rejection would fail the process
});

test('uses the Preferences plugin on native with sandslide.-prefixed keys; localStorage is left alone', async () => {
  const prefs = fakePreferences({ [PREFIX + 'profile']: JSON.stringify({ v: 1, bestScore: 42 }) });
  globalThis.Capacitor = nativeBridge(prefs);
  const ls = installLocalStorage(fakeLocalStorage());
  const S = fresh();
  assert.equal(globalThis.TB.Platform.isNative, true);
  await S.init();
  assert.equal(S.get('profile').bestScore, 42);
  assert.equal(S.get('profile').gamesPlayed, 0, 'defaults merged');
  assert.deepEqual(prefs.calls.filter((c) => c[0] === 'get').map((c) => c[1]).sort(), S.DOCS.map((d) => PREFIX + d).sort());
  S.update('profile', { bestScore: 50 });
  S.set('save', { v: 1 });
  assert.equal(prefs.calls.filter((c) => c[0] === 'set').length, 0, 'debounced');
  await S.flush();
  assert.equal(JSON.parse(prefs.store[PREFIX + 'profile']).bestScore, 50);
  assert.equal(prefs.store[PREFIX + 'save'], '{"v":1}');
  S.remove('save');
  await S.flush();
  assert.equal(Object.prototype.hasOwnProperty.call(prefs.store, PREFIX + 'save'), false);
  assert.deepEqual(prefs.calls.filter((c) => c[0] === 'remove'), [['remove', PREFIX + 'save']]);
  assert.equal(ls.log.length, 0, 'localStorage untouched on native');
});

test('survives a failing Preferences plugin (rejections and throws) with defaults and in-memory data', async () => {
  const prefs = {
    get() { return Promise.reject(new Error('bridge down')); },
    set() { throw new Error('bridge down'); },
    remove() { return Promise.reject(new Error('bridge down')); }
  };
  globalThis.Capacitor = nativeBridge(prefs);
  const S = fresh();
  await assert.doesNotReject(S.init());
  assert.equal(S.get('settings').sound, true);
  S.update('settings', { sound: false });
  S.remove('save');
  await assert.doesNotReject(S.flush());
  assert.equal(S.get('settings').sound, false);
  await sleep(10);
});

test('writes to one key stay ordered even when the backend settles them out of order', async () => {
  const prefs = fakePreferences();
  const applied = [];
  prefs.set = (o) => new Promise((resolve) => {
    const delay = JSON.parse(o.value).bestScore === 1 ? 40 : 1;   // the first write is the slow one
    setTimeout(() => { prefs.store[o.key] = o.value; applied.push(JSON.parse(o.value).bestScore); resolve(); }, delay);
  });
  globalThis.Capacitor = nativeBridge(prefs);
  const S = fresh();
  await S.init();
  S.update('profile', { bestScore: 1 });
  const f1 = S.flush();
  S.update('profile', { bestScore: 2 });
  const f2 = S.flush();
  await Promise.all([f1, f2]);
  assert.deepEqual(applied, [1, 2]);
  assert.equal(JSON.parse(prefs.store[PREFIX + 'profile']).bestScore, 2);
});

test('init is idempotent and a write made before the async load finishes wins over the stored value', async () => {
  const prefs = fakePreferences({ [PREFIX + 'settings']: JSON.stringify({ v: 1, sound: false, palette: 2 }) });
  globalThis.Capacitor = nativeBridge(prefs);
  const S = fresh();
  const p1 = S.init(), p2 = S.init();
  assert.equal(p1, p2);
  S.update('settings', { sound: true, haptics: false });   // the load has not resolved yet
  await p1;
  const s = S.get('settings');
  assert.equal(s.sound, true); assert.equal(s.haptics, false);
  assert.equal(s.palette, 0, 'a touched document is not replaced by the stored one');
  await S.flush();
});

test('dailySave is a second game-in-progress slot handled like save (null default, no default merge, independent of save)', async () => {
  const ls = installLocalStorage(fakeLocalStorage());
  ls.store.set(PREFIX + 'dailySave', JSON.stringify({ v: 1, mode: 'daily', seed: 'd-2026-11-01' }));
  ls.store.set(PREFIX + 'save', 'not json {');
  const S = fresh();
  await S.init();
  assert.deepEqual(S.get('dailySave'), { v: 1, mode: 'daily', seed: 'd-2026-11-01' });
  assert.equal(S.get('save'), null, 'the Classic slot is separate (and corrupt here)');
  S.set('save', { v: 1, mode: 'classic' });
  assert.equal(S.get('dailySave').mode, 'daily', 'writing the Classic save leaves the Daily one alone');
  const d = S.update('dailySave', { score: 99 });
  assert.equal(S.get('dailySave'), d, 'update returns the live document');
  await S.flush();
  assert.deepEqual(JSON.parse(ls.store.get(PREFIX + 'dailySave')), { v: 1, mode: 'daily', seed: 'd-2026-11-01', score: 99 });
  assert.deepEqual(JSON.parse(ls.store.get(PREFIX + 'save')), { v: 1, mode: 'classic' });
  S.remove('dailySave');
  assert.equal(S.get('dailySave'), null);
  assert.deepEqual(S.get('save'), { v: 1, mode: 'classic' }, 'removing the Daily save keeps the Classic one');
  await S.flush();
  assert.equal(ls.store.has(PREFIX + 'dailySave'), false);
  assert.ok(ls.store.has(PREFIX + 'save'));
  S.set('dailySave', null);
  await S.flush();
  assert.equal(S.get('dailySave'), null);
  assert.equal(ls.store.has(PREFIX + 'dailySave'), false);
  const u = S.update('dailySave', { v: 1, mode: 'daily' });
  assert.equal(S.get('dailySave'), u, 'update on a missing dailySave creates it');
  assert.equal(u.mode, 'daily');
});

test('a dailySave that is not an object (wrong type, corrupt JSON, empty) loads as null, never as merged defaults', async () => {
  for (const raw of ['42', '"daily"', 'null', 'true', 'not json {', '']) {
    const ls = installLocalStorage(fakeLocalStorage());
    ls.store.set(PREFIX + 'dailySave', raw);
    const S = fresh();
    await S.init();
    assert.equal(S.get('dailySave'), null, 'raw ' + JSON.stringify(raw));
    assert.equal(S.get('save'), null);
  }
});
