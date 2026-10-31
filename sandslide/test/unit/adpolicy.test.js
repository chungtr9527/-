'use strict';
const { test, describe, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const TB = require('../helpers/load-engine');
const ADS = path.join(__dirname, '..', '..', 'www', 'js', 'ads.js');
const PLATFORM = path.join(__dirname, '..', '..', 'www', 'js', 'platform.js');

require(ADS);
const { interstitialGate, bannerAllowed } = TB.AdPolicy;
const RULES = TB.Config.ADS.interstitial;
const TEST_IDS = TB.ADS_IDS_TEST.android;

// =====================================================================================================================
// TB.AdPolicy (pure)
// =====================================================================================================================

// A context that passes every rule with the shipped numbers.
function okCtx(over) {
  return Object.assign({
    lifetimeGameOvers: 5, installAgeMin: 30, sessionAgeSec: 600, firstGameOverOfSession: false, gameOversSinceInterstitial: 3,
    secSinceFullscreenAd: 600, gameDurationSec: 120, piecesPlaced: 30, rewardedWatchedThisGame: false, shownThisSession: 0,
    shownToday: 0, loaded: true, loadedAgeMin: 5, online: true
  }, over);
}

describe('AdPolicy.interstitialGate', () => {
  test('passing baseline', () => {
    assert.deepEqual(interstitialGate(okCtx(), RULES), { ok: true });
    assert.deepEqual(interstitialGate(okCtx()), { ok: true }, 'rules default to TB.Config.ADS.interstitial');
  });

  const variations = [
    ['minLifetimeGameOvers', { lifetimeGameOvers: 1 }],
    ['minInstallAgeMin', { installAgeMin: 7.9 }],
    ['minSessionAgeSec', { sessionAgeSec: 89 }],
    ['skipFirstGameOverOfSession', { firstGameOverOfSession: true }],
    ['everyNGameOvers', { gameOversSinceInterstitial: 2 }],
    ['minGapSec', { secSinceFullscreenAd: 179 }],
    ['minGameDurationSec', { gameDurationSec: 59 }],
    ['minPiecesPlaced', { piecesPlaced: 9 }],
    ['skipIfRewardedWatchedThisGame', { rewardedWatchedThisGame: true }],
    ['maxPerSession', { shownThisSession: 4 }],
    ['maxPerDay', { shownToday: 8 }],
    ['loaded', { loaded: false }],
    ['expireAfterMin', { loadedAgeMin: 55.5 }],
    ['online', { online: false }]
  ];
  for (const [reason, over] of variations) {
    test(`fails with reason '${reason}'`, () => {
      assert.deepEqual(interstitialGate(okCtx(over), RULES), { ok: false, reason });
    });
  }

  test('names the FIRST failing rule in config order', () => {
    assert.equal(interstitialGate(okCtx({ lifetimeGameOvers: 0, online: false, loaded: false }), RULES).reason, 'minLifetimeGameOvers');
    assert.equal(interstitialGate(okCtx({ shownToday: 99, loaded: false }), RULES).reason, 'maxPerDay');
    assert.equal(interstitialGate(okCtx({ loaded: false, online: false }), RULES).reason, 'loaded');
    assert.equal(interstitialGate(okCtx({ loadedAgeMin: 99, online: false }), RULES).reason, 'expireAfterMin');
  });

  test('boundaries are inclusive for minimums and exclusive for caps', () => {
    const edge = okCtx({ lifetimeGameOvers: 2, installAgeMin: 8, sessionAgeSec: 90, gameOversSinceInterstitial: 3, secSinceFullscreenAd: 180,
      gameDurationSec: 60, piecesPlaced: 10, shownThisSession: 3, shownToday: 7, loadedAgeMin: 55 });
    assert.deepEqual(interstitialGate(edge, RULES), { ok: true });
  });

  test('a full-screen ad that never happened (missing / Infinity gap) passes minGapSec', () => {
    const c = okCtx(); delete c.secSinceFullscreenAd;
    assert.equal(interstitialGate(c, RULES).ok, true);
    assert.equal(interstitialGate(okCtx({ secSinceFullscreenAd: Infinity }), RULES).ok, true);
  });

  test('an empty context is blocked (counts default to 0, loaded/online to false)', () => {
    assert.equal(interstitialGate({}, RULES).ok, false);
    assert.equal(interstitialGate(undefined, RULES).reason, 'minLifetimeGameOvers');
    assert.equal(interstitialGate({ lifetimeGameOvers: 9, installAgeMin: 99, sessionAgeSec: 999, gameOversSinceInterstitial: 9, gameDurationSec: 99, piecesPlaced: 99 }, RULES).reason, 'loaded');
  });

  test('rule overrides are honoured (A/B knobs)', () => {
    const relaxed = Object.assign({}, RULES, { skipFirstGameOverOfSession: false, everyNGameOvers: 1, skipIfRewardedWatchedThisGame: false });
    assert.equal(interstitialGate(okCtx({ firstGameOverOfSession: true, gameOversSinceInterstitial: 1, rewardedWatchedThisGame: true }), relaxed).ok, true);
    assert.equal(interstitialGate(okCtx(), Object.assign({}, RULES, { maxPerDay: 0 })).reason, 'maxPerDay');
  });

  // The plan's first-session timeline: install + first session at t = 0, one game every `gameMin` minutes, counters
  // maintained exactly like TB.Ads does (everyN counts game-overs since the last interstitial actually shown).
  function timeline(gameMin, upTo) {
    const out = [];
    let lastShownAt = null, lastShownK = 0, shown = 0;
    for (let k = 1; k <= upTo; k++) {
      const t = k * gameMin;
      const ctx = {
        lifetimeGameOvers: k, installAgeMin: t, sessionAgeSec: t * 60, firstGameOverOfSession: k === 1,
        gameOversSinceInterstitial: k - lastShownK,
        secSinceFullscreenAd: lastShownAt === null ? Infinity : (t - lastShownAt) * 60,
        gameDurationSec: gameMin * 60, piecesPlaced: 20, rewardedWatchedThisGame: false,
        shownThisSession: shown, shownToday: shown, loaded: true, loadedAgeMin: 1, online: true
      };
      const g = interstitialGate(ctx, RULES);
      out.push(g.ok ? 'show' : g.reason);
      if (g.ok) { shown++; lastShownAt = t; lastShownK = k; }
    }
    return out;
  }

  test('first session timeline: #1 and #2 blocked, #3 allowed after 8 minutes, then every 3rd, capped per session', () => {
    const r = timeline(3, 15);   // 3-minute games: #3 happens at minute 9
    assert.equal(r[0], 'minLifetimeGameOvers');
    assert.equal(r[1], 'minInstallAgeMin', 'minute 6: the install is not 8 minutes old yet');
    assert.equal(r[2], 'show');
    assert.equal(r[3], 'everyNGameOvers');
    assert.equal(r[4], 'everyNGameOvers');
    assert.equal(r[5], 'show');
    assert.equal(r[8], 'show');
    assert.equal(r[11], 'show');
    assert.equal(r[14], 'maxPerSession', '5th interstitial of the session is refused');
    assert.deepEqual(r.map((x, i) => x === 'show' ? i + 1 : null).filter(Boolean), [3, 6, 9, 12]);
    assert.deepEqual(timeline(5, 3), ['minLifetimeGameOvers', 'everyNGameOvers', 'show'], 'with longer games #2 is the every-3rd rule');
  });

  test('first session timeline with short games: #3 is still blocked until the install is 8 minutes old', () => {
    const r = timeline(2, 6);   // 2-minute games: #3 at minute 6, #4 at minute 8
    assert.deepEqual(r, ['minLifetimeGameOvers', 'minInstallAgeMin', 'minInstallAgeMin', 'show', 'everyNGameOvers', 'everyNGameOvers']);
  });
});

describe('AdPolicy.bannerAllowed', () => {
  const ok = { bannerUnlocked: true, inTutorial: false, firstGame: false, viewportHeight: 700, consentOk: true, online: true };
  test('passing baseline', () => { assert.equal(bannerAllowed(ok), true); });
  test('each blocker', () => {
    assert.equal(bannerAllowed(Object.assign({}, ok, { bannerUnlocked: false })), false);
    assert.equal(bannerAllowed(Object.assign({}, ok, { inTutorial: true })), false);
    assert.equal(bannerAllowed(Object.assign({}, ok, { firstGame: true })), false);
    assert.equal(bannerAllowed(Object.assign({}, ok, { viewportHeight: 599 })), false);
    assert.equal(bannerAllowed(Object.assign({}, ok, { consentOk: false })), false);
    assert.equal(bannerAllowed(Object.assign({}, ok, { online: false })), false);
  });
  test('viewport boundary and unknown viewport', () => {
    assert.equal(bannerAllowed(Object.assign({}, ok, { viewportHeight: TB.Config.ADS.banner.minViewportHeight })), true);
    const noH = Object.assign({}, ok); delete noH.viewportHeight;
    assert.equal(bannerAllowed(noH), true);
    assert.equal(bannerAllowed(undefined), false);
  });
});

// =====================================================================================================================
// TB.Ads with a fake AdMob plugin behind a fake Capacitor bridge
// =====================================================================================================================

function fakeAdMob(opts) {
  opts = opts || {};
  const calls = [], listeners = {};
  const ok = (v) => Promise.resolve(v);
  return {
    calls, listeners,
    names() { return calls.map((c) => c[0]); },
    count(name) { return calls.filter((c) => c[0] === name).length; },
    last(name) { const l = calls.filter((c) => c[0] === name); return l.length ? l[l.length - 1][1] : undefined; },
    emit(evt, data) { (listeners[evt] || []).slice().forEach((cb) => cb(data)); },
    addListener(evt, cb) {   // synchronous { remove } handle, like the native bridge proxy
      (listeners[evt] = listeners[evt] || []).push(cb);
      calls.push(['addListener', evt]);
      return { remove() { const a = listeners[evt] || []; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } };
    },
    requestConsentInfo(o) {
      calls.push(['requestConsentInfo', o]);
      return opts.consent ? opts.consent(o) : ok({ status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    },
    showConsentForm() {
      calls.push(['showConsentForm']);
      return opts.consentForm ? opts.consentForm() : ok({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' });
    },
    showPrivacyOptionsForm() { calls.push(['showPrivacyOptionsForm']); return ok(); },
    initialize(o) { calls.push(['initialize', o]); return opts.init ? opts.init(o) : ok(); },
    showBanner(o) { calls.push(['showBanner', o]); return ok(); },
    hideBanner() { calls.push(['hideBanner']); return ok(); },
    resumeBanner() { calls.push(['resumeBanner']); return ok(); },
    removeBanner() { calls.push(['removeBanner']); return ok(); },
    prepareInterstitial(o) { calls.push(['prepareInterstitial', o]); return opts.prepareInter ? opts.prepareInter(o) : ok({ adUnitId: o.adId }); },
    showInterstitial(o) { calls.push(['showInterstitial', o]); return opts.showInter ? opts.showInter(o) : ok(); },
    prepareRewardVideoAd(o) { calls.push(['prepareRewardVideoAd', o]); return opts.prepareRw ? opts.prepareRw(o) : ok({ adUnitId: o.adId }); },
    showRewardVideoAd(o) { calls.push(['showRewardVideoAd', o]); return opts.showRw ? opts.showRw(o) : new Promise(() => {}); }   // settles only on reward natively
  };
}

function fakeStorage(seed) {
  const docs = seed || {}, log = [];
  const copy = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
  return {
    docs, log,
    get(d) { return docs[d] || null; },
    set(d, v) { docs[d] = v; log.push(['set', d, copy(v)]); },
    update(d, patch) { docs[d] = Object.assign(docs[d] || {}, patch); log.push(['update', d, copy(patch)]); return docs[d]; },
    flush() { log.push(['flush']); return Promise.resolve(); },
    remove(d) { delete docs[d]; }
  };
}

function fakeStats() { return { events: [], record(ev, props) { this.events.push([ev, props]); }, has(ev) { return this.events.some((e) => e[0] === ev); }, last(ev) { const l = this.events.filter((e) => e[0] === ev); return l.length ? l[l.length - 1][1] : undefined; } }; }

// platform.js when it exists (it resolves plugins from globalThis.Capacitor on every call), else a minimal shim.
function loadPlatform() {
  if (fs.existsSync(PLATFORM)) {
    require(PLATFORM);
    if (TB.Platform && typeof TB.Platform.plugin === 'function') return TB.Platform;
  }
  TB.Platform = {
    get isNative() { const c = globalThis.Capacitor; return !!(c && c.isNativePlatform && c.isNativePlatform()); },
    get platform() { const c = globalThis.Capacitor; return c && c.getPlatform ? c.getPlatform() : 'web'; },
    isFile: false,
    plugin(name) { const c = globalThis.Capacitor; return (c && c.Plugins && c.Plugins[name]) || null; },
    on() { return () => {}; }, onPause() { return () => {}; }, onResume() { return () => {}; }, onBackButton() { return () => {}; },
    minimizeApp() {}, getInsets() { return { top: 0, right: 0, bottom: 0, left: 0 }; }, onInsetsChange() { return () => {}; },
    setSystemBarsDark() {}, now: () => Date.now(), capabilities() { return {}; }
  };
  return TB.Platform;
}

function fresh() { delete require.cache[require.resolve(ADS)]; require(ADS); return TB.Ads; }
const flushPromises = () => new Promise((r) => setImmediate(r));
const MIN = 60000;

let current = null, savedNow = null;
function setup(opts) {
  opts = opts || {};
  const fake = fakeAdMob(opts);
  if (!opts.web) globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { AdMob: fake } };
  const P = loadPlatform();
  const clock = { mono: 1000, epoch: new Date(2026, 10, 1, 12, 0, 0).getTime() };   // local noon, 2026-11-01
  if (savedNow === null) savedNow = P.now;
  P.now = () => clock.mono;
  const storage = fakeStorage(opts.docs);
  const stats = fakeStats();
  const hooks = {
    heights: [], fs: [],
    onBannerHeight(h) { hooks.heights.push(h); },
    onFullscreenStart() { hooks.fs.push('start'); },
    onFullscreenEnd() { hooks.fs.push('end'); },
    isBusy: () => false,
    nowEpochMs: () => clock.epoch
  };
  const Ads = fresh();
  Ads.init({ storage, stats, platform: P, i18n: null, hooks });
  current = { Ads, fake, storage, stats, hooks, clock, P };
  return current;
}
function advance(c, ms) { c.clock.mono += ms; c.clock.epoch += ms; }
function doc(c) { return c.storage.docs.ads; }

afterEach(() => {
  if (current) { current.Ads.dispose(); if (savedNow) current.P.now = savedNow; }
  current = null;
  delete globalThis.Capacitor;
  mock.timers.reset();
});

describe('TB.Ads without a bridge (web / file://)', () => {
  test('every method is a safe no-op and the counters still tick', async () => {
    const c = setup({ web: true });
    const { Ads } = c;
    for (const k of ['init', 'ensureReady', 'showConsentFormIfRequired', 'consentState', 'showBanner', 'hideBanner', 'removeBanner', 'showInterstitial',
      'isRewardedReady', 'showRewarded', 'privacyOptionsRequired', 'openPrivacyOptions', 'notifySessionStart', 'notifyGameStart', 'notifyGameOver', 'ids']) {
      assert.equal(typeof Ads[k], 'function', k);
    }
    assert.equal(await Ads.ensureReady(), undefined);
    assert.equal(await Ads.showConsentFormIfRequired(), undefined);
    assert.equal(await Ads.openPrivacyOptions(), undefined);
    assert.deepEqual(Ads.consentState(), { canRequestAds: null, privacyOptionsRequired: false });
    assert.equal(Ads.privacyOptionsRequired(), false);
    assert.doesNotThrow(() => { Ads.showBanner(); Ads.hideBanner(); Ads.removeBanner(); });
    assert.deepEqual(c.hooks.heights, []);
    assert.equal(await Ads.showInterstitial('playAgain'), false);
    assert.equal(Ads.isRewardedReady('rescue'), false);
    assert.deepEqual(await Ads.showRewarded('rescue'), { rewarded: false, reason: 'unavailable' });
    Ads.notifySessionStart();
    Ads.notifyGameStart('classic');
    Ads.notifyGameOver({ mode: 'classic', durationSec: 100, piecesPlaced: 12 });
    Ads.notifyGameOver({ mode: 'daily', durationSec: 100, piecesPlaced: 12 });
    const d = doc(c);
    assert.equal(d.sessions, 1);
    assert.equal(d.lifetimeGameOvers, 2);
    assert.equal(d.gameOversSinceInterstitial, 2);
    assert.equal(d.installAt, c.clock.epoch);
    assert.deepEqual(d.consent, { canRequestAds: null, privacyOptionsRequired: false });
    assert.equal(c.storage.log.some((e) => e[0] === 'flush'), true, 'game over flushes the store');
  });

  test('works without any storage at all', async () => {
    const Ads = fresh();
    delete globalThis.Capacitor;
    assert.doesNotThrow(() => Ads.init({}));
    Ads.notifySessionStart(); Ads.notifyGameOver({});
    assert.equal(await Ads.showInterstitial('home'), false);
    Ads.dispose();
  });

  test('ids() follows TB.flags.env and the platform', () => {
    const c = setup({ web: true });
    const saved = TB.flags;
    try {
      TB.flags = { env: 'test' };
      assert.equal(c.Ads.ids(), TB.ADS_IDS_TEST.android, 'web falls back to the android set');
      TB.flags = { env: 'prod' };
      assert.equal(c.Ads.ids(), TB.ADS_IDS_PROD.android);
      TB.flags = undefined;
      assert.equal(c.Ads.ids(), TB.ADS_IDS_TEST.android, 'no flags = never the production ids');
    } finally { TB.flags = saved; }
  });
});

describe('TB.Ads native boot (consent -> initialize -> preload)', () => {
  test('ensureReady runs the chain once, is throttled, and registers listeners before anything else', async () => {
    const c = setup();
    const { Ads, fake } = c;
    const names = fake.names();
    assert.equal(names.filter((n) => n === 'addListener').length, 14);
    assert.equal(names.every((n) => n === 'addListener'), true, 'init only registers listeners');
    await Ads.ensureReady();
    await flushPromises();
    assert.deepEqual(fake.last('requestConsentInfo'), { tagForUnderAgeOfConsent: false });
    assert.deepEqual(fake.last('initialize'), {
      maxAdContentRating: 'ParentalGuidance', tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false, initializeForTesting: true, testingDevices: []
    });
    assert.deepEqual(fake.last('prepareInterstitial'), { adId: TEST_IDS.interstitial, isTesting: true });
    assert.deepEqual(fake.last('prepareRewardVideoAd'), { adId: TEST_IDS.rwRescue, isTesting: true });
    assert.equal(fake.count('showConsentForm'), 0);
    assert.deepEqual(Ads.consentState(), { canRequestAds: true, privacyOptionsRequired: false });
    assert.deepEqual(doc(c).consent, { canRequestAds: true, privacyOptionsRequired: false });
    assert.equal(Ads.isRewardedReady('rescue'), true);
    assert.equal(Ads.isRewardedReady('tilt'), true, 'the demo units share one id, so one loaded slot serves both kinds');

    await Ads.ensureReady();   // throttled: nothing new
    assert.equal(fake.count('requestConsentInfo'), 1);
    assert.equal(fake.count('initialize'), 1);
    advance(c, TB.Config.ADS.ensureReadyThrottleSec * 1000);
    await Ads.ensureReady();
    await flushPromises();
    assert.equal(fake.count('requestConsentInfo'), 2, 'runs again after the throttle window');
    assert.equal(fake.count('initialize'), 1, 'the SDK is initialised once');
    assert.equal(fake.count('prepareInterstitial'), 1, 'already loaded: no second request');
    assert.equal(fake.count('prepareRewardVideoAd'), 1);
    assert.equal(c.stats.has('ad_consent'), true);
  });

  test('consent REQUIRED: the form is deferred to showConsentFormIfRequired, which then initialises', async () => {
    const c = setup({ consent: () => Promise.resolve({ status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }) });
    const { Ads, fake } = c;
    await Ads.ensureReady();
    await flushPromises();
    assert.equal(fake.count('showConsentForm'), 0, 'never shown from ensureReady');
    assert.equal(fake.count('initialize'), 0, 'cannot request ads yet');
    assert.deepEqual(Ads.consentState(), { canRequestAds: false, privacyOptionsRequired: true });
    assert.equal(Ads.privacyOptionsRequired(), true);
    assert.deepEqual(await Ads.showRewarded('rescue'), { rewarded: false, reason: 'notReady' });

    Ads.showBanner();   // wanted, but nothing can show yet
    assert.equal(fake.count('showBanner'), 0);
    await Ads.showConsentFormIfRequired();
    await flushPromises();
    assert.equal(fake.count('showConsentForm'), 1);
    assert.equal(fake.count('initialize'), 1, 'consent obtained -> initialise without waiting for the throttle');
    assert.equal(fake.count('prepareInterstitial'), 1);
    assert.equal(fake.count('showBanner'), 1, 'the wanted banner shows once the SDK is ready');
    assert.deepEqual(Ads.consentState(), { canRequestAds: true, privacyOptionsRequired: true });
    await Ads.showConsentFormIfRequired();
    assert.equal(fake.count('showConsentForm'), 1, 'not required any more');
  });

  test('requestConsentInfo rejection falls back to the stored canRequestAds', async () => {
    const stored = setup({ consent: () => Promise.reject(new Error('Unable to obtain consent info (offline)')),
      docs: { ads: { v: 1, consent: { canRequestAds: true, privacyOptionsRequired: false } } } });
    await stored.Ads.ensureReady();
    await flushPromises();
    assert.equal(stored.fake.count('initialize'), 1, 'previously allowed: initialise from the stored answer');
    assert.deepEqual(stored.Ads.consentState(), { canRequestAds: true, privacyOptionsRequired: false });
    stored.Ads.dispose();

    const unknown = setup({ consent: () => Promise.reject(new Error('offline')) });
    await unknown.Ads.ensureReady();
    await flushPromises();
    assert.equal(unknown.fake.count('initialize'), 0, 'never answered: no ads');
    assert.equal(unknown.stats.has('ad_consent_fail'), true);
  });

  test('initialize failure (Android view not ready) is swallowed and retried on the next ensureReady', async () => {
    let fail = true;
    const c = setup({ init: () => fail ? Promise.reject(new Error('AdMob initialized, but the banner parent view never appeared')) : Promise.resolve() });
    const { Ads, fake } = c;
    await Ads.ensureReady();
    await flushPromises();
    assert.equal(fake.count('initialize'), 1);
    assert.equal(fake.count('prepareInterstitial'), 0, 'nothing preloads before the SDK is ready');
    assert.equal(c.stats.has('ad_init_fail'), true);
    fail = false;
    advance(c, 61000);
    await Ads.ensureReady();
    await flushPromises();
    assert.equal(fake.count('initialize'), 2);
    assert.equal(fake.count('prepareInterstitial'), 1);
  });

  test('openPrivacyOptions shows the form and refreshes consent', async () => {
    const c = setup();
    await c.Ads.ensureReady();
    await c.Ads.openPrivacyOptions();
    assert.equal(c.fake.count('showPrivacyOptionsForm'), 1);
    assert.equal(c.fake.count('requestConsentInfo'), 2);
  });
});

describe('TB.Ads rewarded (event-driven)', () => {
  async function ready(opts) {
    mock.timers.enable({ apis: ['setTimeout'] });
    const c = setup(opts);
    await c.Ads.ensureReady();
    await flushPromises();
    return c;
  }

  test('reward event resolves {rewarded:true} once, persists pendingReward synchronously, then clears it', async () => {
    const c = await ready();
    const { Ads, fake, storage, hooks } = c;
    assert.equal(Ads.isRewardedReady('rescue'), true);
    const p = Ads.showRewarded('rescue');
    assert.deepEqual(fake.last('showRewardVideoAd'), { adId: TEST_IDS.rwRescue });
    assert.deepEqual(hooks.fs, ['start']);
    assert.equal(Ads.isShowingFullscreen(), true);
    assert.equal(Ads.isRewardedReady('rescue'), false, 'consumed');
    fake.emit('onRewardedVideoAdShowed');
    fake.emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });
    const persisted = storage.log.filter((e) => e[0] === 'update' && e[2].pendingReward);
    assert.equal(persisted.length, 1, 'written inside the reward callback');
    assert.equal(persisted[0][2].pendingReward.kind, 'rescue');
    assert.equal(typeof persisted[0][2].pendingReward.token, 'string');
    assert.equal(persisted[0][2].pendingReward.at, c.clock.epoch, 'carries the wall-clock timestamp');
    const persistedIdx = storage.log.indexOf(persisted[0]);
    assert.deepEqual(storage.log[persistedIdx + 1], ['flush'], 'flushed right after being written');
    assert.deepEqual(await p, { rewarded: true, reason: 'reward' });
    assert.deepEqual(doc(c).pendingReward && doc(c).pendingReward.kind, 'rescue', 'still there for the game\'s continuation');
    mock.timers.tick(0);
    assert.equal(doc(c).pendingReward, null, 'cleared after resolving');
    const clearedIdx = storage.log.findIndex((e, i) => i > persistedIdx && e[0] === 'update' && e[2].pendingReward === null);
    assert.ok(clearedIdx > persistedIdx, 'the clear is persisted');
    assert.deepEqual(storage.log[clearedIdx + 1], ['flush'], 'and flushed at once so a process kill cannot re-apply the reward');
    fake.emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });   // duplicate: ignored (token de-dup)
    assert.equal(storage.log.filter((e) => e[0] === 'update' && e[2].pendingReward).length, 1);
    assert.deepEqual(hooks.fs, ['start'], 'the ad is still on screen');
    fake.emit('onRewardedVideoAdDismissed');
    assert.deepEqual(hooks.fs, ['start', 'end']);
    assert.equal(Ads.isShowingFullscreen(), false);
    assert.equal(doc(c).lastFullscreenEndAt, c.clock.epoch);
    assert.equal(fake.count('prepareRewardVideoAd'), 1);
    mock.timers.tick(1000);
    assert.equal(fake.count('prepareRewardVideoAd'), 2, 're-prepared one second after dismissal');
    await flushPromises();
    assert.equal(Ads.isRewardedReady('rescue'), true);
    assert.equal(c.stats.has('ad_rw_reward'), true);
    assert.equal(c.stats.has('ad_rw_show'), true);
  });

  test('closing early resolves {rewarded:false, reason:dismissed}', async () => {
    const c = await ready();
    const { Ads, fake, hooks } = c;
    const p = Ads.showRewarded('tilt');
    assert.deepEqual(fake.last('showRewardVideoAd'), { adId: TEST_IDS.rwTilt });
    fake.emit('onRewardedVideoAdShowed');
    fake.emit('onRewardedVideoAdDismissed');
    assert.deepEqual(await p, { rewarded: false, reason: 'dismissed' });
    assert.deepEqual(hooks.fs, ['start', 'end']);
    assert.equal(doc(c).pendingReward, null);
    assert.equal(c.stats.has('ad_rw_dismiss'), true);
    fake.emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });   // late reward after the show ended: ignored
    assert.equal(doc(c).pendingReward, null);
  });

  test('FailedToShow after opting in grants the reward (goodwill)', async () => {
    const c = await ready();
    const p = c.Ads.showRewarded('rescue');
    c.fake.emit('onRewardedVideoAdFailedToShow', { code: 1, message: 'Ad has expired' });
    assert.deepEqual(await p, { rewarded: true, reason: 'failedToShow' });
    assert.deepEqual(c.hooks.fs, ['start', 'end']);
    assert.equal(doc(c).lastFullscreenEndAt, 0, 'nothing was watched: no gap timestamp');
    mock.timers.tick(1000);
    assert.equal(c.fake.count('prepareRewardVideoAd'), 2);
  });

  test('a rejected showRewardVideoAd (not prepared) is treated like FailedToShow', async () => {
    const c = await ready({ showRw: () => Promise.reject(new Error('No Reward Video Ad can be shown')) });
    assert.deepEqual(await c.Ads.showRewarded('rescue'), { rewarded: true, reason: 'failedToShow' });
    assert.deepEqual(c.hooks.fs, ['start', 'end']);
  });

  test('once the ad is on screen the watchdog is off: a reward arriving long after 60 s is still honoured', async () => {
    const c = await ready();
    const { Ads, fake, hooks } = c;
    const p = Ads.showRewarded('rescue');
    fake.emit('onRewardedVideoAdShowed');
    mock.timers.tick(TB.Config.ADS.rewarded.showWatchdogSec * 1000 * 5);   // a long ad: five watchdog windows go by
    assert.equal(Ads.isShowingFullscreen(), true, 'a visible ad is never timed out');
    assert.deepEqual(hooks.fs, ['start']);
    assert.equal(c.stats.has('ad_rw_timeout'), false);
    fake.emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });
    assert.deepEqual(await p, { rewarded: true, reason: 'reward' });
    assert.equal(doc(c).pendingReward && doc(c).pendingReward.kind, 'rescue');
    fake.emit('onRewardedVideoAdDismissed');
    assert.deepEqual(hooks.fs, ['start', 'end']);
    assert.equal(doc(c).lastFullscreenEndAt, c.clock.epoch);
    mock.timers.tick(1000);
    assert.equal(fake.count('prepareRewardVideoAd'), 2, 're-prepared one second after dismissal');
  });

  test('an ad that never appears times out after 60 s with {rewarded:false, reason:timeout}; the late dismissal only reloads', async () => {
    const c = await ready();
    const p = c.Ads.showRewarded('rescue');
    mock.timers.tick(TB.Config.ADS.rewarded.showWatchdogSec * 1000 - 1);
    assert.equal(c.Ads.isShowingFullscreen(), true, 'still waiting for the SDK');
    mock.timers.tick(1);
    assert.deepEqual(await p, { rewarded: false, reason: 'timeout' });
    assert.deepEqual(c.hooks.fs, ['start', 'end']);
    assert.equal(c.stats.has('ad_rw_timeout'), true);
    assert.equal(doc(c).lastFullscreenEndAt, 0, 'nothing was watched: no gap timestamp');
    c.fake.emit('onRewardedVideoAdDismissed');
    assert.deepEqual(c.hooks.fs, ['start', 'end'], 'no second end');
    mock.timers.tick(1000);
    assert.equal(c.fake.count('prepareRewardVideoAd') >= 2, true);
  });

  test('consumePendingReward hands back a reward the game never applied, once, and clears + flushes it at once', () => {
    const at = new Date(2026, 10, 1, 11, 59, 0).getTime();
    const c = setup({ docs: { ads: { v: 1, pendingReward: { token: 'rescue-7-' + at, kind: 'rescue', at } } } });
    const { Ads, storage } = c;
    const before = storage.log.length;
    assert.deepEqual(Ads.consumePendingReward(), { token: 'rescue-7-' + at, kind: 'rescue', at });
    assert.equal(doc(c).pendingReward, null);
    assert.deepEqual(storage.log.slice(before), [['update', 'ads', { pendingReward: null }], ['flush']], 'cleared and flushed, nothing else');
    assert.equal(Ads.consumePendingReward(), null, 'consumed: gone');
    assert.equal(storage.log.length, before + 2, 'nothing to clear: nothing written');
  });

  test('only one full-screen ad at a time', async () => {
    const c = await ready();
    const p = c.Ads.showRewarded('rescue');
    assert.deepEqual(await c.Ads.showRewarded('tilt'), { rewarded: false, reason: 'busy' });
    assert.equal(await c.Ads.showInterstitial('home'), false);
    c.fake.emit('onRewardedVideoAdDismissed');
    assert.deepEqual(await p, { rewarded: false, reason: 'dismissed' });
  });

  test('nothing loaded: waits loadWaitMs for a load, then gives up; load failures back off', async () => {
    let fail = true;
    const c = await ready({ prepareRw: (o) => fail ? Promise.reject(Object.assign(new Error('Network error'), { code: '2' })) : Promise.resolve({ adUnitId: o.adId }) });
    const { Ads, fake } = c;
    assert.equal(Ads.isRewardedReady('rescue'), false);
    assert.equal(fake.count('prepareRewardVideoAd'), 1);
    const p = Ads.showRewarded('rescue');          // triggers a load attempt right away
    assert.equal(fake.count('prepareRewardVideoAd'), 2);
    await flushPromises();                          // rejected -> waiter woken with false
    assert.deepEqual(await p, { rewarded: false, reason: 'notLoaded' });
    assert.deepEqual(c.hooks.fs, []);
    assert.equal(c.stats.has('ad_rw_load_fail'), true);
    fail = false;
    mock.timers.tick(TB.Config.ADS.interstitial.loadBackoffSec[1] * 1000);
    assert.equal(fake.count('prepareRewardVideoAd'), 3, 'background retry with backoff');
    const p2 = Ads.showRewarded('rescue');          // the retry's load is in flight: wait for it instead of giving up
    assert.equal(fake.count('prepareRewardVideoAd'), 3, 'no duplicate request while one is loading');
    await flushPromises();                          // the load resolves -> the waiting show starts
    assert.equal(Ads.isRewardedReady('rescue'), false, 'consumed by the show that just started');
    assert.deepEqual(fake.last('showRewardVideoAd'), { adId: TEST_IDS.rwRescue });
    fake.emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });
    assert.deepEqual(await p2, { rewarded: true, reason: 'reward' });
    fake.emit('onRewardedVideoAdDismissed');
  });
});

describe('TB.Ads interstitial (gate -> prepare -> show -> dismissed)', () => {
  async function ready(opts) {
    mock.timers.enable({ apis: ['setTimeout'] });
    const c = setup(opts);
    await c.Ads.ensureReady();
    await flushPromises();
    c.Ads.notifySessionStart();
    return c;
  }
  function playGame(c, over) {
    c.Ads.notifyGameStart('classic');
    advance(c, 5 * MIN);
    c.Ads.notifyGameOver(Object.assign({ mode: 'classic', durationSec: 300, piecesPlaced: 40 }, over));
  }

  test('first session: skipped with the gate reason, then shown on the 3rd game over and counted', async () => {
    const c = await ready();
    const { Ads, fake, hooks, stats } = c;
    playGame(c);
    assert.equal(await Ads.showInterstitial('home'), false);
    assert.equal(stats.last('ad_inter_skip').reason, 'minLifetimeGameOvers');
    assert.equal(fake.count('showInterstitial'), 0);
    playGame(c);
    assert.equal(await Ads.showInterstitial('playAgain'), false);
    assert.equal(stats.last('ad_inter_skip').reason, 'everyNGameOvers');
    playGame(c);
    assert.equal(doc(c).lifetimeGameOvers, 3);
    assert.equal(doc(c).gameOversSinceInterstitial, 3);

    const p = Ads.showInterstitial('playAgain');
    assert.deepEqual(hooks.fs, ['start'], 'audio pauses before the delay');
    assert.equal(fake.count('showInterstitial'), 0, 'tap-to-show delay');
    mock.timers.tick(TB.Config.ADS.interstitial.tapToShowDelayMs);
    assert.deepEqual(fake.last('showInterstitial'), { adId: TEST_IDS.interstitial });
    fake.emit('interstitialAdShowed');
    fake.emit('interstitialAdDismissed');
    assert.equal(await p, true);
    assert.deepEqual(hooks.fs, ['start', 'end']);
    const d = doc(c);
    assert.equal(d.gameOversSinceInterstitial, 0);
    assert.equal(d.interstitialsThisSession, 1);
    assert.deepEqual(d.interstitialsToday, { date: TB.Daily.dateKey(new Date(c.clock.epoch)), count: 1 });
    assert.equal(d.lastInterstitialAt, c.clock.epoch);
    assert.equal(d.lastFullscreenEndAt, c.clock.epoch);
    assert.equal(stats.has('ad_inter_show'), true);
    assert.equal(fake.count('prepareInterstitial'), 1);
    mock.timers.tick(1000);
    assert.equal(fake.count('prepareInterstitial'), 2, 're-prepared one second after dismissal');
    await flushPromises();

    playGame(c);                                    // game 4
    assert.equal(await Ads.showInterstitial('home'), false);
    assert.equal(stats.last('ad_inter_skip').reason, 'everyNGameOvers', 'counting restarts from the shown ad');
    playGame(c);                                    // game 5
    Ads.notifyGameStart('classic');                 // game 6: a rescue ad is watched mid-game
    const rw = Ads.showRewarded('rescue');
    fake.emit('onRewardedVideoAdReward', { type: 'coins', amount: 1 });
    fake.emit('onRewardedVideoAdDismissed');
    assert.equal((await rw).rewarded, true);
    advance(c, 5 * MIN);
    Ads.notifyGameOver({ mode: 'classic', durationSec: 300, piecesPlaced: 40 });   // no rewardedWatched flag on purpose
    assert.equal(doc(c).lifetimeGameOvers, 6);
    assert.equal(doc(c).gameOversSinceInterstitial, 3, 'every-3rd would allow it...');
    assert.equal(await Ads.showInterstitial('home'), false);
    assert.equal(stats.last('ad_inter_skip').reason, 'skipIfRewardedWatchedThisGame', '...but the rewarded ad is tracked internally');
  });

  test('FailedToShow resolves false and leaves the counters untouched', async () => {
    const c = await ready({ docs: { ads: { v: 1, lifetimeGameOvers: 9, gameOversSinceInterstitial: 2, installAt: 1 } } });
    const { Ads, fake } = c;
    advance(c, 10 * MIN);
    c.Ads.notifyGameOver({ mode: 'classic', durationSec: 300, piecesPlaced: 40 });   // 1st of the session: skipped
    assert.equal(await Ads.showInterstitial('home'), false);
    assert.equal(c.stats.last('ad_inter_skip').reason, 'skipFirstGameOverOfSession');
    c.Ads.notifyGameOver({ mode: 'daily', durationSec: 300, piecesPlaced: 40 });
    const p = Ads.showInterstitial('home');
    mock.timers.tick(400);
    fake.emit('interstitialAdFailedToShow', { code: 1, message: 'expired' });
    assert.equal(await p, false);
    assert.deepEqual(c.hooks.fs, ['start', 'end']);
    assert.equal(doc(c).gameOversSinceInterstitial, 4);
    assert.equal(doc(c).interstitialsThisSession, 0);
    assert.equal(c.stats.has('ad_inter_fail'), true);
    mock.timers.tick(1000);
    assert.equal(fake.count('prepareInterstitial'), 2);
  });

  test('not loaded (prepare rejected) -> false immediately, backoff retry', async () => {
    let fail = true;
    const c = await ready({ prepareInter: (o) => fail ? Promise.reject(Object.assign(new Error('No fill'), { code: '3' })) : Promise.resolve({ adUnitId: o.adId }),
      docs: { ads: { v: 1, lifetimeGameOvers: 9, gameOversSinceInterstitial: 5, installAt: 1 } } });
    const { Ads, fake } = c;
    advance(c, 10 * MIN);
    Ads.notifyGameOver({ durationSec: 300, piecesPlaced: 40 });
    Ads.notifyGameOver({ durationSec: 300, piecesPlaced: 40 });
    assert.equal(fake.count('prepareInterstitial'), 1, 'the preload failed once');
    assert.equal(await Ads.showInterstitial('home'), false);
    assert.equal(c.stats.last('ad_inter_skip').reason, 'loaded');
    assert.equal(fake.count('showInterstitial'), 0);
    assert.equal(fake.count('prepareInterstitial'), 2, 'a show attempt reloads right away instead of waiting for the retry');
    await flushPromises();
    mock.timers.tick(TB.Config.ADS.interstitial.loadBackoffSec[0] * 1000);
    assert.equal(fake.count('prepareInterstitial'), 2, 'second failure: the backoff grew to 30 s');
    mock.timers.tick(TB.Config.ADS.interstitial.loadBackoffSec[1] * 1000 - TB.Config.ADS.interstitial.loadBackoffSec[0] * 1000);
    assert.equal(fake.count('prepareInterstitial'), 3, 'second backoff step');
    await flushPromises();
    fail = false;
    mock.timers.tick(TB.Config.ADS.interstitial.loadBackoffSec[2] * 1000);
    assert.equal(fake.count('prepareInterstitial'), 4, 'third backoff step');
    await flushPromises();
    const p = Ads.showInterstitial('home');
    mock.timers.tick(400);
    assert.equal(fake.count('showInterstitial'), 1);
    fake.emit('interstitialAdDismissed');
    assert.equal(await p, true);
  });
});

describe('TB.Ads banner', () => {
  test('listeners first, adaptive bottom banner, height hook, failure backoff, hide / resume / remove', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const c = setup();
    const { Ads, fake, hooks } = c;
    Ads.showBanner();
    assert.equal(fake.count('showBanner'), 0, 'deferred until the SDK is ready');
    await Ads.ensureReady();
    await flushPromises();
    assert.equal(fake.count('showBanner'), 1, 'shown as soon as ensureReady completes');
    const names = fake.names();
    assert.equal(names.lastIndexOf('addListener') < names.indexOf('showBanner'), true, 'listeners registered before showBanner');
    assert.deepEqual(fake.last('showBanner'), { adId: TEST_IDS.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: true });

    fake.emit('bannerAdSizeChanged', { width: 360, height: 50 });
    fake.emit('bannerAdLoaded');
    assert.deepEqual(hooks.heights, [50]);
    fake.emit('bannerAdSizeChanged', { width: 360, height: 50 });
    assert.deepEqual(hooks.heights, [50], 'unchanged height is not re-reported');

    fake.emit('bannerAdSizeChanged', { width: 0, height: 0 });
    fake.emit('bannerAdFailedToLoad', { code: 3, message: 'No fill' });
    assert.deepEqual(hooks.heights, [50, 0]);
    assert.equal(fake.count('removeBanner'), 1, 'failed banner is removed');
    assert.equal(c.stats.has('ad_banner_fail'), true);
    mock.timers.tick(TB.Config.ADS.banner.retryBackoffSec[0] * 1000 - 1);
    assert.equal(fake.count('showBanner'), 1);
    mock.timers.tick(1);
    assert.equal(fake.count('showBanner'), 2, 'retry after 30 s');
    await flushPromises();
    fake.emit('bannerAdFailedToLoad', { code: 3, message: 'No fill' });
    mock.timers.tick(TB.Config.ADS.banner.retryBackoffSec[0] * 1000);
    assert.equal(fake.count('showBanner'), 2, 'second retry waits 60 s');
    mock.timers.tick(TB.Config.ADS.banner.retryBackoffSec[1] * 1000 - TB.Config.ADS.banner.retryBackoffSec[0] * 1000);
    assert.equal(fake.count('showBanner'), 3);
    await flushPromises();
    fake.emit('bannerAdSizeChanged', { width: 360, height: 60 });
    fake.emit('bannerAdLoaded');
    assert.deepEqual(hooks.heights, [50, 0, 60]);

    Ads.hideBanner();
    assert.equal(fake.count('hideBanner'), 1);
    assert.deepEqual(hooks.heights, [50, 0, 60, 0]);
    fake.emit('bannerAdSizeChanged', { width: 0, height: 0 });   // the native hide also reports 0: deduplicated
    assert.deepEqual(hooks.heights, [50, 0, 60, 0]);
    Ads.hideBanner();
    assert.equal(fake.count('hideBanner'), 1, 'idempotent');
    Ads.showBanner();
    assert.equal(fake.count('resumeBanner'), 1, 'a hidden banner is resumed, not recreated');
    assert.equal(fake.count('showBanner'), 3);
    fake.emit('bannerAdSizeChanged', { width: 360, height: 60 });
    assert.deepEqual(hooks.heights, [50, 0, 60, 0, 60]);

    Ads.removeBanner();
    assert.equal(fake.count('removeBanner'), 3);
    assert.deepEqual(hooks.heights, [50, 0, 60, 0, 60, 0]);
    mock.timers.tick(600000);
    assert.equal(fake.count('showBanner'), 3, 'removed: no retries');
  });

  test('failure retries wait while a full-screen ad is showing, and around the consent form the banner is hidden', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const c = setup({ consent: () => Promise.resolve({ status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }) });
    const { Ads, fake } = c;
    await Ads.ensureReady();
    await flushPromises();
    Ads.showBanner();
    await flushPromises();
    assert.equal(fake.count('showBanner'), 1);
    fake.emit('bannerAdLoaded');
    const rw = Ads.showRewarded('rescue');
    fake.emit('bannerAdFailedToLoad', { code: 2, message: 'Network error' });
    mock.timers.tick(TB.Config.ADS.banner.retryBackoffSec[0] * 1000);
    assert.equal(fake.count('showBanner'), 1, 'never under a full-screen ad');
    fake.emit('onRewardedVideoAdDismissed');
    assert.equal((await rw).reason, 'dismissed');
    mock.timers.tick(1000);
    assert.equal(fake.count('showBanner'), 2, 'retried once the ad is gone');
    await flushPromises();
    fake.emit('bannerAdLoaded');

    const form = Ads.showConsentFormIfRequired();
    assert.equal(fake.count('hideBanner'), 1, 'hidden under the UMP form');
    await form;
    await flushPromises();
    assert.equal(fake.count('showConsentForm'), 1);
    assert.equal(fake.count('resumeBanner'), 1, 'resumed after the form');
  });
});
