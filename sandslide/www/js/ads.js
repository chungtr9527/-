// Ads layer: TB.AdPolicy (pure gate logic, unit-tested) and TB.Ads (Google AdMob through @capacitor-community/admob
// 8.x on the Capacitor bridge). Platform module: must never throw and degrades to a no-op when window.Capacitor or
// the AdMob proxy is missing (web / file:// builds simply have no ads; the counters still tick so stats stay honest).
//
// Capacitor AdMob surface used (proxy from TB.Platform.plugin('AdMob'); enum values are passed as strings):
//   consent     : requestConsentInfo({tagForUnderAgeOfConsent}) -> {status, isConsentFormAvailable, canRequestAds,
//                 privacyOptionsRequirementStatus}; showConsentForm() -> same shape after the form; showPrivacyOptionsForm()
//   sdk         : initialize({maxAdContentRating, tagForChildDirectedTreatment, tagForUnderAgeOfConsent, initializeForTesting,
//                 testingDevices}) — on Android it resolves only once the banner parent view exists and rejects after 5 s
//                 otherwise, so it runs in try/catch and is retried on the next ensureReady().
//   banner      : showBanner({adId, adSize:'ADAPTIVE_BANNER', position:'BOTTOM_CENTER', margin:0, isTesting}), hideBanner(),
//                 resumeBanner(), removeBanner(); events bannerAdSizeChanged {width,height} (0 = hidden / removed / failed),
//                 bannerAdLoaded, bannerAdFailedToLoad {code,message}
//   interstitial: prepareInterstitial({adId, isTesting}) (rejects on load failure), showInterstitial({adId});
//                 events interstitialAdLoaded, interstitialAdFailedToLoad, interstitialAdShowed, interstitialAdFailedToShow,
//                 interstitialAdDismissed
//   rewarded    : prepareRewardVideoAd({adId, isTesting}) (rejects on load failure), showRewardVideoAd({adId}) — its promise
//                 settles only when the reward is earned (never when the user closes early), so it is never awaited;
//                 events onRewardedVideoAdLoaded, onRewardedVideoAdFailedToLoad, onRewardedVideoAdShowed,
//                 onRewardedVideoAdFailedToShow, onRewardedVideoAdDismissed, onRewardedVideoAdReward {type, amount}
// The native side keeps exactly one prepared ad per ad unit id and drops it on dismiss / failed-to-show, so the two
// rewarded kinds share one loaded slot whenever they share an id (Google's demo units do).
// All numbers come from TB.Config.ADS. "Online" is not navigator.onLine (only an explicit `false` counts as offline):
// it is derived from load failures + backoff, as the plan asks.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var CFG = (TB.Config && TB.Config.ADS) || {};
  var INTER = CFG.interstitial || {};
  var BANNER = CFG.banner || {};
  var REWARDED = CFG.rewarded || {};
  var SDK = CFG.sdk || {};
  var ENSURE_THROTTLE_MS = (typeof CFG.ensureReadyThrottleSec === 'number' ? CFG.ensureReadyThrottleSec : 60) * 1000;
  var REPREPARE_MS = 1000;            // re-prepare a full-screen ad this long after it was dismissed
  var SHOW_WATCHDOG_MS = 15000;       // interstitial: no Showed / FailedToShow / Dismissed at all after show() -> give up
  var DOC = 'ads';

  function noop() {}
  function num(v, dflt) { return typeof v === 'number' && !isNaN(v) ? v : dflt; }
  function isThenable(x) { return !!x && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function'; }
  function swallow(p) { try { if (isThenable(p)) p.then(noop, noop); } catch (e) {} }
  function safe(fn, args) { try { return typeof fn === 'function' ? fn.apply(null, args || []) : undefined; } catch (e) { return undefined; } }
  function later(fn, ms) { try { return g.setTimeout(fn, ms); } catch (e) { return null; } }
  function cancel(t) { try { if (t !== null && t !== undefined) g.clearTimeout(t); } catch (e) {} }
  function errCode(err) { return err && (err.code !== undefined ? err.code : err.errorCode); }
  function errMsg(err) { return String((err && (err.message || err.errorMessage)) || err || ''); }

  // ================================================================================================================
  // TB.AdPolicy — pure, no state. Rules default to TB.Config.ADS; every value may be overridden for tests / A-B.
  // ================================================================================================================

  // ctx: {lifetimeGameOvers, installAgeMin, sessionAgeSec, firstGameOverOfSession, gameOversSinceInterstitial,
  //       secSinceFullscreenAd, gameDurationSec, piecesPlaced, rewardedWatchedThisGame, shownThisSession, shownToday,
  //       loaded, loadedAgeMin, online}. Counts include the game-over that just happened. Returns {ok:true} or
  // {ok:false, reason} naming the FIRST failing rule, in the order the rules are listed in TB.Config.ADS.interstitial.
  function interstitialGate(ctx, rules) {
    ctx = ctx || {};
    rules = rules || INTER;
    var fail = function (reason) { return { ok: false, reason: reason }; };
    if (num(ctx.lifetimeGameOvers, 0) < num(rules.minLifetimeGameOvers, 0)) return fail('minLifetimeGameOvers');
    if (num(ctx.installAgeMin, 0) < num(rules.minInstallAgeMin, 0)) return fail('minInstallAgeMin');
    if (num(ctx.sessionAgeSec, 0) < num(rules.minSessionAgeSec, 0)) return fail('minSessionAgeSec');
    if (rules.skipFirstGameOverOfSession && ctx.firstGameOverOfSession) return fail('skipFirstGameOverOfSession');
    if (num(ctx.gameOversSinceInterstitial, 0) < Math.max(1, num(rules.everyNGameOvers, 1))) return fail('everyNGameOvers');
    if (num(ctx.secSinceFullscreenAd, Infinity) < num(rules.minGapSec, 0)) return fail('minGapSec');
    if (num(ctx.gameDurationSec, 0) < num(rules.minGameDurationSec, 0)) return fail('minGameDurationSec');
    if (num(ctx.piecesPlaced, 0) < num(rules.minPiecesPlaced, 0)) return fail('minPiecesPlaced');
    if (rules.skipIfRewardedWatchedThisGame && ctx.rewardedWatchedThisGame) return fail('skipIfRewardedWatchedThisGame');
    if (num(ctx.shownThisSession, 0) >= num(rules.maxPerSession, Infinity)) return fail('maxPerSession');
    if (num(ctx.shownToday, 0) >= num(rules.maxPerDay, Infinity)) return fail('maxPerDay');
    if (!ctx.loaded) return fail('loaded');
    if (num(ctx.loadedAgeMin, 0) > num(rules.expireAfterMin, Infinity)) return fail('expireAfterMin');
    if (!ctx.online) return fail('online');
    return { ok: true };
  }

  // ctx: {bannerUnlocked, inTutorial, firstGame, viewportHeight, consentOk, online}. The tutorial and the first game
  // after install never show a banner; small viewports (< minViewportHeight CSS px) keep the tray instead.
  function bannerAllowed(ctx, rules) {
    ctx = ctx || {};
    rules = rules || BANNER;
    if (!ctx.bannerUnlocked) return false;
    if (ctx.inTutorial) return false;
    if (ctx.firstGame) return false;
    if (typeof ctx.viewportHeight === 'number' && ctx.viewportHeight < num(rules.minViewportHeight, 0)) return false;
    if (!ctx.consentOk) return false;
    if (!ctx.online) return false;
    return true;
  }

  TB.AdPolicy = { interstitialGate: interstitialGate, bannerAllowed: bannerAllowed };

  // ================================================================================================================
  // TB.Ads
  // ================================================================================================================

  var deps = { storage: null, stats: null, platform: null, i18n: null };
  var hooks = { onBannerHeight: noop, onFullscreenStart: noop, onFullscreenEnd: noop, isBusy: null, nowEpochMs: null };
  var pl = null;                 // the AdMob proxy once found
  var listeners = [];            // unsubscribe functions
  var memDoc = null;             // the 'ads' document when TB.Storage is unavailable
  var tokenSeq = 0;
  var sdk = { ready: false, initializing: null };
  var consent = { canRequestAds: null, privacyOptionsRequired: false, status: 'UNKNOWN', formAvailable: false, formInProgress: null };
  var ensure = { running: null, lastAt: -Infinity };
  var net = { offlineUntil: 0, failures: 0 };
  var session = { startMono: null, gameOvers: 0, rewardedThisGame: false, game: null, lastGame: null, lastFullscreenEndMono: null };
  var banner = { wanted: false, shown: false, hidden: false, showing: false, backoffIdx: 0, retryTimer: null, lastHeight: 0 };
  var inter = { adId: null, loaded: false, loading: false, loadedAt: 0, backoffIdx: 0, retryTimer: null };
  var rwSlots = {};              // adId -> { adId, loaded, loading, loadedAt, backoffIdx, retryTimer, waiters[] }
  var fullscreen = null;         // the full-screen ad in flight: { kind:'interstitial'|'rewarded', ... }
  var KIND_ID = { rescue: 'rwRescue', tilt: 'rwTilt' };

  // ---- environment -----------------------------------------------------------------------------------------------

  function platformObj() { return deps.platform || TB.Platform || null; }
  function isTesting() { return !(TB.flags && TB.flags.env === 'prod'); }
  function platformName() {
    try { var P = platformObj(); if (P && (P.platform === 'ios' || P.platform === 'android')) return P.platform; } catch (e) {}
    return 'android';
  }
  // The active id set: Google's demo units unless this is a prod build (ads-ids.test.js is absent from release builds).
  function ids() {
    var set = isTesting() ? TB.ADS_IDS_TEST : TB.ADS_IDS_PROD;
    if (!set || typeof set !== 'object') return {};
    return set[platformName()] || set.android || {};
  }
  // Resolved lazily: TB.Platform and the bridge exist before this file runs on device, but tests install them later.
  function plugin() {
    try {
      var P = platformObj();
      if (P && typeof P.plugin === 'function') { var p = P.plugin('AdMob'); if (p) return p; }
      var cap = g.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.AdMob && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return cap.Plugins.AdMob;
    } catch (e) {}
    return null;
  }
  function getPlugin() {
    if (pl) return pl;
    pl = plugin();
    if (pl) attach(pl);
    return pl;
  }
  // Promise-wrapped plugin call: a synchronous throw becomes a rejection, a non-promise result resolves.
  function call(p, method, args) {
    return new Promise(function (resolve, reject) {
      var r;
      try { r = args === undefined ? p[method]() : p[method](args); } catch (e) { reject(e); return; }
      if (isThenable(r)) r.then(resolve, reject); else resolve(r);
    });
  }
  function on(p, evt, cb) {
    var handle = null, removed = false;
    function release(h) { try { if (h && typeof h.remove === 'function') swallow(h.remove()); } catch (e) {} }
    try {
      var r = p.addListener(evt, function () { if (!removed) safe(cb, arguments); });
      if (r && typeof r.remove === 'function') handle = r;
      else if (isThenable(r)) r.then(function (h) { handle = h; if (removed) release(h); }, noop);
    } catch (e) { return noop; }
    return function () { if (removed) return; removed = true; release(handle); };
  }
  function busy() { return !!safe(hooks.isBusy); }

  // ---- clocks ----------------------------------------------------------------------------------------------------
  // mono(): TB.Platform.now (performance.now) for durations inside this process. epoch(): wall-clock ms for persisted
  // timestamps, from hooks.nowEpochMs() when the integrator provides it, else Date.now().
  function mono() {
    try { var P = platformObj(); if (P && typeof P.now === 'function') { var v = P.now(); if (typeof v === 'number') return v; } } catch (e) {}
    try { if (g.performance && typeof g.performance.now === 'function') return g.performance.now(); } catch (e) {}
    return Date.now();
  }
  function epoch() {
    if (typeof hooks.nowEpochMs === 'function') { var v = safe(hooks.nowEpochMs); if (typeof v === 'number' && v > 0) return v; }
    return Date.now();
  }
  function todayKey(ms) {
    var d = new Date(ms);
    try { if (TB.Daily && typeof TB.Daily.dateKey === 'function') return TB.Daily.dateKey(d); } catch (e) {}
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // ---- 'ads' document --------------------------------------------------------------------------------------------

  function defaultsDoc() {
    return {
      v: 1, sessions: 0, lastInterstitialAt: 0, lastFullscreenEndAt: 0, gameOversSinceInterstitial: 0, lifetimeGameOvers: 0,
      interstitialsToday: { date: null, count: 0 }, interstitialsThisSession: 0, installAt: 0,
      consent: { canRequestAds: null, privacyOptionsRequired: false }, pendingReward: null
    };
  }
  function store() { return deps.storage || TB.Storage || null; }
  function save(patch) {
    var s = store();
    if (s && typeof s.update === 'function') {
      try { var r = s.update(DOC, patch); if (r && typeof r === 'object') return r; } catch (e) {}
      try { var d = s.get(DOC); if (d && typeof d === 'object') return d; } catch (e2) {}
    }
    memDoc = Object.assign(memDoc || defaultsDoc(), patch);
    return memDoc;
  }
  // The document, created with defaults when missing and back-filled with fields older versions did not have.
  function doc() {
    var s = store(), d = null;
    if (s && typeof s.get === 'function') { try { d = s.get(DOC); } catch (e) { d = null; } } else d = memDoc;
    if (!d || typeof d !== 'object') {
      d = defaultsDoc();
      if (s && typeof s.set === 'function') { try { s.set(DOC, d); } catch (e2) {} } else memDoc = d;
      return d;
    }
    var def = defaultsDoc(), patch = null;
    for (var k in def) if (Object.prototype.hasOwnProperty.call(def, k) && d[k] === undefined) { if (!patch) patch = {}; patch[k] = def[k]; }
    return patch ? save(patch) : d;
  }
  function flush() { var s = store(); if (s && typeof s.flush === 'function') { try { swallow(s.flush()); } catch (e) {} } }
  function record(ev, props) {
    var st = deps.stats || TB.Stats;
    if (st && typeof st.record === 'function') { try { st.record(ev, props || {}); } catch (e) {} }
  }

  // ---- online / backoff ------------------------------------------------------------------------------------------

  function online() {
    try { var n = g.navigator; if (n && n.onLine === false) return false; } catch (e) {}
    return !net.offlineUntil || mono() >= net.offlineUntil;
  }
  // AdMob's ERROR_CODE_NETWORK_ERROR is 2 on both platforms; messages cover the bridge's own failures.
  function isNetworkError(err) {
    var code = errCode(err);
    if (code === 2 || code === '2') return true;
    return /network|offline|internet|unreachable|timed? ?out/i.test(errMsg(err));
  }
  function backoffMs(list, idx) {
    var arr = list && list.length ? list : [30];
    return num(arr[Math.min(idx, arr.length - 1)], 30) * 1000;
  }
  function noteLoadFailure(err) {
    if (!isNetworkError(err)) return;
    net.offlineUntil = mono() + backoffMs(INTER.loadBackoffSec, net.failures++);
  }
  function noteLoadSuccess() { net.offlineUntil = 0; net.failures = 0; }

  // ---- listeners -------------------------------------------------------------------------------------------------

  function detach() { var L = listeners; listeners = []; L.forEach(function (off) { safe(off); }); }
  // Registered once, before any showBanner / prepare call (the size event may fire during showBanner itself).
  function attach(p) {
    detach();
    var L = listeners;
    L.push(on(p, 'bannerAdSizeChanged', function (info) { reportBannerHeight(info ? info.height : 0); }));
    L.push(on(p, 'bannerAdLoaded', function () { banner.backoffIdx = 0; banner.shown = true; noteLoadSuccess(); }));
    L.push(on(p, 'bannerAdFailedToLoad', function (err) { onBannerFailed(err); }));
    L.push(on(p, 'interstitialAdLoaded', function () { inter.loaded = true; inter.loading = false; inter.loadedAt = mono(); }));
    L.push(on(p, 'interstitialAdFailedToLoad', function () { inter.loaded = false; }));   // retries ride on the prepare promise
    L.push(on(p, 'interstitialAdShowed', function () { if (fullscreen && fullscreen.kind === 'interstitial') fullscreen.showed = true; }));
    L.push(on(p, 'interstitialAdFailedToShow', function (err) { finishInterstitial(false, 'failedToShow', err); }));
    L.push(on(p, 'interstitialAdDismissed', function () { finishInterstitial(true, 'dismissed'); }));
    L.push(on(p, 'onRewardedVideoAdLoaded', function (info) {
      var s = info && rwSlots[info.adUnitId];
      if (s) { s.loaded = true; s.loading = false; s.loadedAt = mono(); }
    }));
    L.push(on(p, 'onRewardedVideoAdFailedToLoad', noop));                                 // retries ride on the prepare promise
    // Once content is on screen the SDK guarantees a Dismissed / FailedToShow, so the "nothing appeared" watchdog is
    // cancelled here: a reward may then arrive however long the ad takes.
    L.push(on(p, 'onRewardedVideoAdShowed', function () {
      if (fullscreen && fullscreen.kind === 'rewarded') { fullscreen.showed = true; cancel(fullscreen.watchdog); fullscreen.watchdog = null; }
    }));
    L.push(on(p, 'onRewardedVideoAdFailedToShow', function (err) { onRewardedFailedToShow(err); }));
    L.push(on(p, 'onRewardedVideoAdDismissed', function () { onRewardedDismissed(); }));
    L.push(on(p, 'onRewardedVideoAdReward', function (item) { onRewardedReward(item); }));
  }

  // ---- consent + SDK ---------------------------------------------------------------------------------------------

  function consentOptions() {
    var o = { tagForUnderAgeOfConsent: false };
    // Optional QA override (never set by the build): TB.flags.consentDebug = { debugGeography: 1 /* EEA */, testDeviceIdentifiers: [...] }
    var dbg = TB.flags && TB.flags.consentDebug;
    if (dbg && typeof dbg === 'object') {
      if (typeof dbg.debugGeography === 'number') o.debugGeography = dbg.debugGeography;
      if (Array.isArray(dbg.testDeviceIdentifiers)) o.testDeviceIdentifiers = dbg.testDeviceIdentifiers;
    }
    return o;
  }
  function applyConsentInfo(info) {
    info = info && typeof info === 'object' ? info : {};
    consent.status = typeof info.status === 'string' ? info.status : 'UNKNOWN';
    consent.formAvailable = !!info.isConsentFormAvailable;
    consent.canRequestAds = !!info.canRequestAds;
    consent.privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    save({ consent: { canRequestAds: consent.canRequestAds, privacyOptionsRequired: consent.privacyOptionsRequired } });
    record('ad_consent', { status: consent.status, canRequestAds: consent.canRequestAds, privacyOptionsRequired: consent.privacyOptionsRequired });
  }
  function loadStoredConsent() {
    var c = doc().consent || {};
    consent.canRequestAds = c.canRequestAds === true ? true : (c.canRequestAds === false ? false : null);
    consent.privacyOptionsRequired = !!c.privacyOptionsRequired;
  }
  function refreshConsent(p) {
    return call(p, 'requestConsentInfo', consentOptions()).then(applyConsentInfo, function (err) {
      // Offline / UMP error: decide from the last stored answer (a previously obtained consent keeps ads running).
      loadStoredConsent();
      record('ad_consent_fail', { message: errMsg(err) });
    });
  }
  function initSdk(p) {
    if (sdk.ready || consent.canRequestAds !== true) return Promise.resolve();
    if (sdk.initializing) return sdk.initializing;
    sdk.initializing = call(p, 'initialize', {
      maxAdContentRating: SDK.maxAdContentRating || 'ParentalGuidance',
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      initializeForTesting: isTesting(),
      testingDevices: []
    }).then(function () { sdk.ready = true; record('ad_init'); },
      function (err) { record('ad_init_fail', { message: errMsg(err) }); })   // retried by the next ensureReady()
      .then(function () { sdk.initializing = null; });
    return sdk.initializing;
  }
  function preload() {
    if (!sdk.ready) return;
    if (inter.loaded && mono() - inter.loadedAt > num(INTER.expireAfterMin, 55) * 60000) inter.loaded = false;   // stale
    prepareInterstitial();
    prepareRewarded('rescue');
    if (session.game && session.game.mode === 'classic') prepareRewarded('tilt');
  }
  function afterReady() { if (sdk.ready && banner.wanted && !banner.shown && !banner.showing) showBanner(); }

  // Idempotent and throttled: consent -> (form deferred to showConsentFormIfRequired) -> initialize -> preload.
  // Never rejects. Called by the game on boot, 'online', resume and every game over.
  function ensureReady() {
    var p = getPlugin();
    if (!p) return Promise.resolve();
    if (ensure.running) return ensure.running;
    var t = mono();
    if (t - ensure.lastAt < ENSURE_THROTTLE_MS) return Promise.resolve();
    ensure.lastAt = t;
    net.offlineUntil = 0;   // an explicit retry (e.g. the 'online' event) may probe the network again
    ensure.running = refreshConsent(p)
      .then(function () { return initSdk(p); })
      .then(function () { preload(); afterReady(); })
      .then(noop, noop)
      .then(function () { ensure.running = null; });
    return ensure.running;
  }

  // The UMP form (EEA / UK only) — shown when the game decides (before the first results panel), never on boot.
  function showConsentFormIfRequired() {
    var p = getPlugin();
    if (!p) return Promise.resolve();
    if (consent.formInProgress) return consent.formInProgress;
    if (!(consent.status === 'REQUIRED' && consent.formAvailable)) return Promise.resolve();
    var wasVisible = banner.shown && !banner.hidden;
    if (wasVisible) hideBanner();
    consent.formInProgress = call(p, 'showConsentForm')
      .then(applyConsentInfo, function (err) { record('ad_consent_form_fail', { message: errMsg(err) }); })
      .then(function () {
        consent.formInProgress = null;
        if (wasVisible) showBanner();                     // resumes the hidden banner
        if (consent.canRequestAds === true && !sdk.ready) return initSdk(p).then(function () { preload(); afterReady(); });
      })
      .then(noop, noop);
    return consent.formInProgress;
  }
  function consentState() { return { canRequestAds: consent.canRequestAds, privacyOptionsRequired: consent.privacyOptionsRequired }; }
  function privacyOptionsRequired() { return !!consent.privacyOptionsRequired; }
  function openPrivacyOptions() {
    var p = getPlugin();
    if (!p) return Promise.resolve();
    var wasVisible = banner.shown && !banner.hidden;
    if (wasVisible) hideBanner();
    return call(p, 'showPrivacyOptionsForm')
      .then(noop, function (err) { record('ad_privacy_form_fail', { message: errMsg(err) }); })
      .then(function () { return call(p, 'requestConsentInfo', consentOptions()).then(applyConsentInfo, noop); })   // consent may have changed
      .then(function () { if (wasVisible) showBanner(); })
      .then(noop, noop);
  }

  // ---- banner ----------------------------------------------------------------------------------------------------

  function reportBannerHeight(h) {
    h = typeof h === 'number' && h > 0 && isFinite(h) ? h : 0;
    if (h === banner.lastHeight) return;
    banner.lastHeight = h;
    safe(hooks.onBannerHeight, [h]);
  }
  function bannerOptions() {
    var o = { adId: ids().banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: isTesting() };
    if (SDK.npa) o.npa = true;
    return o;
  }
  function cancelBannerRetry() { cancel(banner.retryTimer); banner.retryTimer = null; }
  // Wanted from now on; shown as soon as consent + SDK allow it (ensureReady calls back in through afterReady()).
  function showBanner() {
    banner.wanted = true;
    cancelBannerRetry();
    var p = getPlugin();
    if (!p || !sdk.ready || consent.canRequestAds !== true) return;
    if (banner.shown) {
      if (banner.hidden) { banner.hidden = false; swallow(call(p, 'resumeBanner')); }
      return;
    }
    if (banner.showing) { banner.hidden = false; return; }
    var opts = bannerOptions();
    if (!opts.adId) return;
    banner.showing = true;
    banner.hidden = false;
    call(p, 'showBanner', opts).then(function () {
      banner.showing = false;
      banner.shown = true;
      if (!banner.wanted) removeBanner();
      else if (banner.hidden) swallow(call(p, 'hideBanner'));
    }, function (err) {
      banner.showing = false;
      banner.shown = false;
      onBannerFailed(err);
    });
  }
  function onBannerFailed(err) {
    banner.shown = false; banner.showing = false; banner.hidden = false;
    reportBannerHeight(0);
    record('ad_banner_fail', { code: errCode(err), message: errMsg(err) });
    noteLoadFailure(err);
    var p = getPlugin();
    if (p) swallow(call(p, 'removeBanner'));
    scheduleBannerRetry();
  }
  function scheduleBannerRetry() {
    cancelBannerRetry();
    if (!banner.wanted) return;
    banner.retryTimer = later(bannerRetryTick, backoffMs(BANNER.retryBackoffSec, banner.backoffIdx++));
  }
  function bannerRetryTick() {
    banner.retryTimer = null;
    if (!banner.wanted || banner.shown || banner.showing) return;
    if (fullscreen || busy()) { banner.retryTimer = later(bannerRetryTick, 1000); return; }   // never under a full-screen ad
    showBanner();
  }
  function hideBanner() {
    if (banner.hidden) return;
    var p = getPlugin();
    if (!p || !(banner.shown || banner.showing)) return;
    banner.hidden = true;
    reportBannerHeight(0);
    if (banner.shown) swallow(call(p, 'hideBanner'));   // a show in flight is hidden once it resolves
  }
  function removeBanner() {
    banner.wanted = false;
    cancelBannerRetry();
    var p = getPlugin(), had = banner.shown;
    banner.shown = false; banner.hidden = false;
    reportBannerHeight(0);
    if (p && had) swallow(call(p, 'removeBanner'));   // a show in flight is removed once it resolves
  }

  // ---- interstitial ----------------------------------------------------------------------------------------------

  function fullscreenAdOptions(adId) {
    var o = { adId: adId, isTesting: isTesting() };
    if (SDK.npa) o.npa = true;
    if (SDK.immersiveMode) o.immersiveMode = true;
    return o;
  }
  function scheduleInterRePrepare(ms) {
    cancel(inter.retryTimer);
    inter.retryTimer = later(function () { inter.retryTimer = null; prepareInterstitial(); }, ms);
  }
  // Keeps exactly one interstitial loaded. prepareInterstitial rejects on load failure -> backoff 15/30/60/120/300 s.
  function prepareInterstitial() {
    var p = getPlugin();
    if (!p || !sdk.ready) return;
    cancel(inter.retryTimer); inter.retryTimer = null;
    if (inter.loading || inter.loaded) return;
    var adId = ids().interstitial;
    if (!adId) return;
    inter.loading = true;
    inter.adId = adId;
    call(p, 'prepareInterstitial', fullscreenAdOptions(adId)).then(function () {
      inter.loading = false; inter.loaded = true; inter.loadedAt = mono(); inter.backoffIdx = 0;
      noteLoadSuccess();
    }, function (err) {
      inter.loading = false; inter.loaded = false;
      noteLoadFailure(err);
      record('ad_inter_load_fail', { code: errCode(err), message: errMsg(err) });
      scheduleInterRePrepare(backoffMs(INTER.loadBackoffSec, inter.backoffIdx++));
    });
  }
  function interstitialContext() {
    var d = doc(), e = epoch(), t = mono(), lg = session.lastGame || {};
    var sinceFs = session.lastFullscreenEndMono !== null ? (t - session.lastFullscreenEndMono) / 1000
      : (d.lastFullscreenEndAt > 0 ? (e - d.lastFullscreenEndAt) / 1000 : Infinity);
    var today = todayKey(e);
    return {
      lifetimeGameOvers: d.lifetimeGameOvers | 0,
      installAgeMin: d.installAt > 0 ? (e - d.installAt) / 60000 : 0,
      sessionAgeSec: session.startMono !== null ? (t - session.startMono) / 1000 : 0,
      firstGameOverOfSession: session.gameOvers <= 1,
      gameOversSinceInterstitial: d.gameOversSinceInterstitial | 0,
      secSinceFullscreenAd: sinceFs,
      gameDurationSec: num(lg.durationSec, 0),
      piecesPlaced: lg.piecesPlaced | 0,
      rewardedWatchedThisGame: !!lg.rewardedWatched,
      shownThisSession: d.interstitialsThisSession | 0,
      shownToday: d.interstitialsToday && d.interstitialsToday.date === today ? (d.interstitialsToday.count | 0) : 0,
      loaded: !!inter.loaded,
      loadedAgeMin: inter.loaded ? (t - inter.loadedAt) / 60000 : 0,
      online: online()
    };
  }
  // The only interstitial trigger: leaving the results panel. Resolves true once the ad was dismissed, false right away
  // when the gate fails or nothing is loaded, false on FailedToShow. Counters are marked only when the ad was shown.
  function showInterstitial(reason) {
    var p = getPlugin();
    if (!p || fullscreen) return Promise.resolve(false);
    var gate = interstitialGate(interstitialContext(), INTER);
    if (!gate.ok) {
      record('ad_inter_skip', { reason: gate.reason, trigger: reason });
      if (gate.reason === 'expireAfterMin') inter.loaded = false;
      if (gate.reason === 'expireAfterMin' || gate.reason === 'loaded') prepareInterstitial();
      return Promise.resolve(false);
    }
    return new Promise(function (resolve) {
      var fs = fullscreen = { kind: 'interstitial', token: ++tokenSeq, resolve: resolve, done: false, showed: false, trigger: reason, timer: null, watchdog: null };
      safe(hooks.onFullscreenStart);
      flush();
      fs.timer = later(function () {   // the button keeps its pressed state for tapToShowDelayMs before the ad covers it
        fs.timer = null;
        if (fs.done) return;
        inter.loaded = false;          // consumed: the native side drops it on dismiss / failed-to-show
        call(p, 'showInterstitial', { adId: inter.adId }).then(noop, function (err) { finishInterstitial(false, 'showRejected', err); });
        fs.watchdog = later(function () { fs.watchdog = null; if (!fs.showed) finishInterstitial(false, 'timeout'); }, SHOW_WATCHDOG_MS);
      }, num(INTER.tapToShowDelayMs, 0));
    });
  }
  function finishInterstitial(shown, why, err) {
    var fs = fullscreen;
    if (!fs || fs.kind !== 'interstitial' || fs.done) {
      if (!fs || fs.kind !== 'interstitial') { inter.loaded = false; scheduleInterRePrepare(REPREPARE_MS); }   // stray event: keep the pipeline alive
      return;
    }
    fs.done = true;
    cancel(fs.timer); cancel(fs.watchdog);
    fullscreen = null;
    inter.loaded = false;
    if (shown) {
      var e = epoch(), d = doc(), today = todayKey(e);
      var todayCount = d.interstitialsToday && d.interstitialsToday.date === today ? (d.interstitialsToday.count | 0) : 0;
      save({
        lastInterstitialAt: e, lastFullscreenEndAt: e, gameOversSinceInterstitial: 0,
        interstitialsThisSession: (d.interstitialsThisSession | 0) + 1,
        interstitialsToday: { date: today, count: todayCount + 1 }
      });
      session.lastFullscreenEndMono = mono();
      flush();
      record('ad_inter_show', { trigger: fs.trigger });
    } else {
      record('ad_inter_fail', { why: why, code: errCode(err), message: errMsg(err), trigger: fs.trigger });
    }
    safe(hooks.onFullscreenEnd);
    scheduleInterRePrepare(REPREPARE_MS);
    fs.resolve(!!shown);
  }

  // ---- rewarded --------------------------------------------------------------------------------------------------

  function rwAdId(kind) { var k = KIND_ID[kind]; return k ? ids()[k] : undefined; }
  function slotFor(kind) {
    var adId = rwAdId(kind);
    if (!adId) return null;
    return rwSlots[adId] || (rwSlots[adId] = { adId: adId, loaded: false, loading: false, loadedAt: 0, backoffIdx: 0, retryTimer: null, waiters: [] });
  }
  function slotFresh(s) { return !!s && s.loaded && mono() - s.loadedAt <= num(INTER.expireAfterMin, 55) * 60000; }
  function wakeWaiters(s, ok) { var ws = s.waiters; s.waiters = []; ws.forEach(function (w) { safe(w, [ok]); }); }
  function prepareSlot(s) {
    var p = getPlugin();
    if (!p || !sdk.ready || !s) return;
    cancel(s.retryTimer); s.retryTimer = null;
    if (s.loaded && !slotFresh(s)) s.loaded = false;
    if (s.loading || s.loaded) return;
    s.loading = true;
    call(p, 'prepareRewardVideoAd', { adId: s.adId, isTesting: isTesting() }).then(function () {
      s.loading = false; s.loaded = true; s.loadedAt = mono(); s.backoffIdx = 0;
      noteLoadSuccess();
      wakeWaiters(s, true);
    }, function (err) {
      s.loading = false; s.loaded = false;
      noteLoadFailure(err);
      record('ad_rw_load_fail', { adId: s.adId, code: errCode(err), message: errMsg(err) });
      s.retryTimer = later(function () { s.retryTimer = null; prepareSlot(s); }, backoffMs(INTER.loadBackoffSec, s.backoffIdx++));
      wakeWaiters(s, false);
    });
  }
  function prepareRewarded(kind) { prepareSlot(slotFor(kind)); }
  function isRewardedReady(kind) { return slotFresh(slotFor(kind)); }
  // "Watch ad" tapped while nothing is loaded: load now and wait up to loadWaitMs before giving up.
  function waitForLoad(s) {
    prepareSlot(s);
    if (slotFresh(s)) return Promise.resolve(true);
    if (!s.loading) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var done = false, timer = null;
      var w = function (ok) { if (done) return; done = true; cancel(timer); resolve(!!ok); };
      timer = later(function () { if (done) return; done = true; var i = s.waiters.indexOf(w); if (i >= 0) s.waiters.splice(i, 1); resolve(false); }, num(REWARDED.loadWaitMs, 3000));
      s.waiters.push(w);
    });
  }
  function showRewarded(kind) {
    var p = getPlugin(), s = slotFor(kind);
    if (!p || !s) return Promise.resolve({ rewarded: false, reason: 'unavailable' });
    if (fullscreen) return Promise.resolve({ rewarded: false, reason: 'busy' });
    if (!sdk.ready) return Promise.resolve({ rewarded: false, reason: 'notReady' });
    if (slotFresh(s)) return present(p, kind, s);
    return waitForLoad(s).then(function (loaded) {
      if (!loaded) return { rewarded: false, reason: 'notLoaded' };
      if (fullscreen) return { rewarded: false, reason: 'busy' };
      return present(p, kind, s);
    });
  }
  // Event-driven show: one token per show; resolved exactly once by the reward / dismissed / failed-to-show events or
  // the watchdog (show() called but nothing appeared within showWatchdogSec), never by showRewardVideoAd's promise.
  function present(p, kind, s) {
    return new Promise(function (resolve) {
      var fs = fullscreen = {
        kind: 'rewarded', rwKind: kind, slot: s, token: kind + '-' + (++tokenSeq) + '-' + epoch(),
        resolve: resolve, done: false, showed: false, rewarded: false, watchdog: null
      };
      safe(hooks.onFullscreenStart);
      flush();
      record('ad_rw_show', { kind: kind });
      s.loaded = false;   // consumed: the native side drops the prepared ad on dismiss / failed-to-show
      var pr;
      try { pr = p.showRewardVideoAd({ adId: s.adId }); } catch (e) { onRewardedFailedToShow(e); return; }
      // Only a rejection (not prepared / activity gone) is informative; a resolution duplicates the reward event.
      if (isThenable(pr)) pr.then(noop, function (err) { if (fullscreen === fs && !fs.done && !fs.showed) onRewardedFailedToShow(err); });
      fs.watchdog = later(function () {   // cancelled by onRewardedVideoAdShowed: a visible ad is never timed out
        fs.watchdog = null;
        if (fs.showed || fs.done) return;
        record('ad_rw_timeout', { kind: kind });
        settleRewarded(fs, { rewarded: false, reason: 'timeout' });
        endRewarded(fs);
      }, num(REWARDED.showWatchdogSec, 60) * 1000);
    });
  }
  function settleRewarded(fs, result) {
    if (fs.done) return;
    fs.done = true;
    cancel(fs.watchdog); fs.watchdog = null;
    fs.resolve(result);
  }
  // The full-screen ad is gone (or given up on): restore the game and re-prepare the slot after a beat.
  function endRewarded(fs) {
    if (fullscreen !== fs) return;
    fullscreen = null;
    var s = fs.slot;
    s.loaded = false;
    if (fs.showed || fs.rewarded) {
      save({ lastFullscreenEndAt: epoch() });
      session.lastFullscreenEndMono = mono();
    }
    safe(hooks.onFullscreenEnd);
    cancel(s.retryTimer);
    s.retryTimer = later(function () { s.retryTimer = null; prepareSlot(s); }, REPREPARE_MS);
  }
  function strayRewardedEnd() {   // an end event after the watchdog already settled the show: just reload the slots
    for (var id in rwSlots) if (Object.prototype.hasOwnProperty.call(rwSlots, id)) {
      var s = rwSlots[id];
      s.loaded = false;
      cancel(s.retryTimer);
      s.retryTimer = later((function (slot) { return function () { slot.retryTimer = null; prepareSlot(slot); }; })(s), REPREPARE_MS);
    }
  }
  function onRewardedReward(item) {
    var fs = fullscreen;
    if (!fs || fs.kind !== 'rewarded' || fs.rewarded) return;   // one reward per token
    fs.rewarded = true;
    session.rewardedThisGame = true;
    // Persisted synchronously inside the callback so a process death before the game applies it can still honour it.
    save({ pendingReward: { token: fs.token, kind: fs.rwKind, at: epoch() } });
    flush();
    record('ad_rw_reward', { kind: fs.rwKind, type: item && item.type, amount: item && item.amount });
    settleRewarded(fs, { rewarded: true, reason: 'reward' });
    later(function () {   // cleared after the game's continuation ran, and flushed so a process kill cannot re-apply it
      var d = doc();
      if (d.pendingReward && d.pendingReward.token === fs.token) { save({ pendingReward: null }); flush(); }
    }, 0);
  }
  function onRewardedDismissed() {
    var fs = fullscreen;
    if (!fs || fs.kind !== 'rewarded') { strayRewardedEnd(); return; }
    if (!fs.rewarded) record('ad_rw_dismiss', { kind: fs.rwKind });
    settleRewarded(fs, { rewarded: false, reason: 'dismissed' });   // no-op when the reward already settled it
    endRewarded(fs);
  }
  function onRewardedFailedToShow(err) {
    var fs = fullscreen;
    if (!fs || fs.kind !== 'rewarded') { strayRewardedEnd(); return; }
    record('ad_rw_fail', { kind: fs.rwKind, code: errCode(err), message: errMsg(err) });
    // Goodwill (plan §5.4): the player opted in and the failure is ours, so the reward is granted anyway.
    settleRewarded(fs, { rewarded: true, reason: 'failedToShow' });
    endRewarded(fs);
  }
  // A reward whose callback ran but which the game never applied (process died in between), or null. Clears it.
  function consumePendingReward() {
    var d = doc(), pr = d.pendingReward || null;
    if (pr) { save({ pendingReward: null }); flush(); }   // flushed at once: a process kill must not re-apply it
    return pr;
  }

  // ---- session / game counters -----------------------------------------------------------------------------------

  function notifySessionStart() {
    var d = doc();
    session.startMono = mono();
    session.gameOvers = 0;
    session.rewardedThisGame = false;
    session.game = null;
    session.lastGame = null;
    var patch = { sessions: (d.sessions | 0) + 1, interstitialsThisSession: 0 };
    if (!(d.installAt > 0)) patch.installAt = epoch();
    save(patch);
  }
  function notifyGameStart(mode) {
    mode = mode || 'classic';
    session.game = { mode: mode, startMono: mono() };
    session.rewardedThisGame = false;
    if (mode === 'classic') prepareRewarded('tilt');   // the +1 Tilt chip may appear this game (no-op until the SDK is ready)
  }
  function notifyGameOver(info) {
    info = info || {};
    var d = doc();
    session.gameOvers++;
    var mode = info.mode || (session.game && session.game.mode) || 'classic';
    var dur = typeof info.durationSec === 'number' ? info.durationSec : (session.game ? (mono() - session.game.startMono) / 1000 : 0);
    session.lastGame = { mode: mode, durationSec: dur, piecesPlaced: info.piecesPlaced | 0, rewardedWatched: !!info.rewardedWatched || session.rewardedThisGame };
    session.game = null;
    save({ lifetimeGameOvers: (d.lifetimeGameOvers | 0) + 1, gameOversSinceInterstitial: (d.gameOversSinceInterstitial | 0) + 1 });
    flush();
  }

  // ---- init ------------------------------------------------------------------------------------------------------

  function init(opts) {
    opts = opts || {};
    deps.storage = opts.storage || null;
    deps.stats = opts.stats || null;
    deps.platform = opts.platform || null;
    deps.i18n = opts.i18n || null;
    var h = opts.hooks || {};
    hooks.onBannerHeight = typeof h.onBannerHeight === 'function' ? h.onBannerHeight : noop;
    hooks.onFullscreenStart = typeof h.onFullscreenStart === 'function' ? h.onFullscreenStart : noop;
    hooks.onFullscreenEnd = typeof h.onFullscreenEnd === 'function' ? h.onFullscreenEnd : noop;
    hooks.isBusy = typeof h.isBusy === 'function' ? h.isBusy : null;
    hooks.nowEpochMs = typeof h.nowEpochMs === 'function' ? h.nowEpochMs : null;
    if (session.startMono === null) session.startMono = mono();
    var d = doc();
    if (!(d.installAt > 0)) save({ installAt: epoch() });
    loadStoredConsent();
    pl = null;
    getPlugin();
  }
  // Cancels every timer and listener (tests, hot reload). The counters in the 'ads' document are untouched.
  function dispose() {
    detach();
    cancelBannerRetry();
    cancel(inter.retryTimer); inter.retryTimer = null;
    for (var id in rwSlots) if (Object.prototype.hasOwnProperty.call(rwSlots, id)) { cancel(rwSlots[id].retryTimer); rwSlots[id].retryTimer = null; rwSlots[id].waiters = []; }
    if (fullscreen) { cancel(fullscreen.timer); cancel(fullscreen.watchdog); fullscreen = null; }
    pl = null;
  }

  TB.Ads = {
    init: init,
    ensureReady: ensureReady,
    showConsentFormIfRequired: showConsentFormIfRequired,
    consentState: consentState,
    showBanner: showBanner, hideBanner: hideBanner, removeBanner: removeBanner,
    showInterstitial: showInterstitial,
    isRewardedReady: isRewardedReady,
    showRewarded: showRewarded,
    privacyOptionsRequired: privacyOptionsRequired,
    openPrivacyOptions: openPrivacyOptions,
    notifySessionStart: notifySessionStart, notifyGameStart: notifyGameStart, notifyGameOver: notifyGameOver,
    ids: ids,
    // extras (not in the contract): see api_notes
    isShowingFullscreen: function () { return !!fullscreen; },
    consumePendingReward: consumePendingReward,
    dispose: dispose
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
