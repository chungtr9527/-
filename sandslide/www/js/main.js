// Bootstrap, app state machine, render loop, input wiring, game lifecycle, tutorial, ads/share/storage glue.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Config = TB.Config, Layout = TB.Layout, R = TB.Renderer, UI = TB.UI, Input = TB.Input, Tween = TB.Tween, Particles = TB.Particles;
  var Game = TB.Game, Pieces = TB.Pieces, Board = TB.Board, Tilt = TB.Tilt, Daily = TB.Daily;
  var I18N = TB.I18N, Platform = TB.Platform, Storage = TB.Storage, Stats = TB.Stats, Audio = TB.Audio, Haptics = TB.Haptics, Ads = TB.Ads, Share = TB.Share;
  var FX = R.FX, A = Config.ANIM, CELL = Layout.CELL;
  function t(k, p) { return I18N ? I18N.t(k, p) : k; }
  function has(mod, fn) { return !!(mod && typeof mod[fn] === 'function'); }
  function call(mod, fn) { if (!has(mod, fn)) return undefined; try { return mod[fn].apply(mod, Array.prototype.slice.call(arguments, 2)); } catch (e) { warn(fn, e); } }
  function warn() { if (g.console && g.console.warn) g.console.warn.apply(g.console, arguments); }

  var TUTORIAL_PRESET = { rows: ['........', '........', '..XX....', 'XX...XXX', '..X.X...', 'X..X....', '.X..X...', 'XXXXXXX.'], hand: ['dot_0', 'bar3_0', 'sq2_0'], energy: 53, locked: [false, false, true] };
  var TUT_STEPS = [null, { slot: 0, r: 7, c: 7, hint: 'tut.step1' }, { slot: 1, r: 6, c: 5, hint: 'tut.step2' }, { tilt: true, hint: 'tut.step3' }];

  var app = {
    screen: 'boot', game: null, profile: null, settings: null, dailyDoc: null, tutorial: null, toast: null, hint: '', confirm: null,
    gameOverInfo: null, dailyInfo: null, hasSave: false, chipVisible: false, rewardedReady: false, palettesUnlocked: [0], statsSnapshot: null,
    reducedMotionEffective: false, privacyOptionsRequired: false, online: true, adShowing: false, instantFx: false, query: {}, firstEverGame: false
  };
  var canvas, rafId = 0, lastNow = 0, frameTimes = [], boardVersion = 0, arrowCache = { v: -1, info: null };
  var drag = null, ghost = null, armedDir = null, pulseDirs = null, trayOffset = [0, 0, 0], gameStartedAt = 0, rewardedThisGame = false, pendingAdInset = null;
  var now = function () { return (g.performance && g.performance.now) ? g.performance.now() : Date.now(); };

  // ---------- storage docs ----------
  function doc(name, def) { var v = Storage ? Storage.get(name) : null; if (!v) { v = def; if (Storage) Storage.set(name, v); } return v; }
  function saveDoc(name, v) { if (Storage) Storage.set(name, v); }
  function todayKey() { return Daily.dateKey(new Date()); }

  // ---------- boot ----------
  function boot() {
    canvas = g.document.getElementById('game');
    var caps = call(Platform, 'capabilities') || { pointerEvents: !!g.PointerEvent, canvas: !!canvas.getContext };
    if (!caps.canvas || !caps.pointerEvents) { var ov = g.document.getElementById('overlay'); ov.hidden = false; ov.innerHTML = '<p>' + t('common.unsupported') + '</p>'; return; }
    R.init(canvas);
    parseQuery();
    var p = (Storage && has(Storage, 'init')) ? Storage.init() : Promise.resolve();
    p.then(boot2, function (e) { warn('storage init failed', e); boot2(); });
  }
  function parseQuery() {
    var q = {};
    try { (g.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1)); }); } catch (e) { /* ignore */ }
    app.query = q;
    app.debug = !!(TB.flags && TB.flags.debugHooks);
  }
  function boot2() {
    app.profile = doc('profile', { v: 1, bestScore: 0, bestCombo: 0, bestTiltLines: 0, gamesPlayed: 0, totalLines: 0, totalTilts: 0, firstPlayedAt: null, lastPlayedAt: null, tutorialDone: false, playDays: [], palettesUnlocked: [0], gameOvers: 0, freeRescueUsed: false, bannerUnlocked: false, seenTiltHint: false });
    app.settings = doc('settings', { v: 1, sound: true, haptics: true, lang: 'auto', reducedMotion: null, largeText: false, leftHanded: false, palette: 0 });
    app.dailyDoc = doc('daily', { v: 1, results: {}, streak: { current: 0, best: 0, lastDate: null } });
    app.palettesUnlocked = app.profile.palettesUnlocked || [0];
    applyLanguage();
    applySettings();
    call(Stats, 'init', Storage); call(Stats, 'installErrorHandlers');
    call(Platform, 'setSystemBarsDark');
    if (has(Platform, 'onInsetsChange')) Platform.onInsetsChange(function () { Layout.setInsets(Platform.getInsets()); relayout(); });
    if (has(Platform, 'getInsets')) Layout.setInsets(Platform.getInsets());
    if (has(Platform, 'onPause')) Platform.onPause(onAppPause);
    if (has(Platform, 'onResume')) Platform.onResume(onAppResume);
    if (has(Platform, 'onBackButton')) Platform.onBackButton(onBack);
    g.addEventListener('resize', relayout);
    if (g.visualViewport) g.visualViewport.addEventListener('resize', relayout);
    g.addEventListener('online', function () { app.online = true; call(Ads, 'ensureReady'); });
    g.addEventListener('offline', function () { app.online = false; });
    ['pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) { g.addEventListener(ev, function () { call(Audio, 'unlock'); }, { passive: true }); });
    g.addEventListener('keydown', onKey);
    Input.attach(canvas, inputHandlers);
    relayout();
    initAds();
    app.hasSave = !!(Storage && Storage.get('save'));
    consumePendingReward();
    if (app.debug) installDebugApi();
    if (app.debug && app.query.nofx) app.instantFx = true;
    if (app.debug && app.query.lang) { app.settings.lang = app.query.lang; applyLanguage(); }
    var wantsTutorial = !app.profile.tutorialDone;
    if (app.debug && app.query.tutorial === '0') wantsTutorial = false;
    if (app.debug && app.query.tutorial === '1') wantsTutorial = true;
    if (app.debug && app.query.mode) { startGame(app.query.mode, { seed: app.query.seed, dateKey: app.query.d, practice: app.query.mode === 'daily' && !!app.query.d }); return; }
    if (app.query.d && Daily.isValidKey(app.query.d) && !wantsTutorial) { startGame('daily', { dateKey: app.query.d, practice: app.query.d !== todayKey() }); return; }
    if (wantsTutorial) startTutorial(); else showMenu();
  }
  function applyLanguage() {
    if (!I18N) return;
    var langs = (g.navigator && (g.navigator.languages || [g.navigator.language])) || ['en'];
    I18N.setLang(I18N.detect(langs, app.settings.lang));
    try { g.document.documentElement.lang = I18N.htmlLang(); } catch (e) { /* ignore */ }
  }
  function applySettings() {
    var s = app.settings;
    call(Audio, 'setEnabled', !!s.sound); call(Haptics, 'setEnabled', !!s.haptics);
    var prefers = false; try { prefers = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }
    app.reducedMotionEffective = s.reducedMotion === null || s.reducedMotion === undefined ? prefers : !!s.reducedMotion;
    R.setReduced(app.reducedMotionEffective);
    R.setPalette(app.palettesUnlocked.indexOf(s.palette) >= 0 ? s.palette : 0);
  }
  function relayout() { R.resize(); arrowCache.v = -1; requestFrame(); }

  // ---------- ads glue ----------
  function initAds() {
    if (!has(Ads, 'init')) return;
    Ads.init({ storage: Storage, stats: Stats, platform: Platform, i18n: I18N, hooks: {
      onBannerHeight: function (h) { pendingAdInset = h; applyAdInsetIfIdle(); },
      onFullscreenStart: function () { app.adShowing = true; call(Audio, 'suspend'); call(Storage, 'flush'); Input.cancel(); },
      onFullscreenEnd: function () { app.adShowing = false; call(Audio, 'resume'); requestFrame(); },
      isBusy: function () { return Input.isBusy() || FX.locked; },
      nowEpochMs: function () { return Date.now(); }
    } });
    call(Ads, 'notifySessionStart');
    call(Ads, 'ensureReady');
    if (app.debug && app.query.fakeads && (!Ads.isNative || app.query.fakeads === 'force')) installFakeAds();
  }
  function applyAdInsetIfIdle() {
    if (pendingAdInset === null) return;
    if (Input.isBusy() || FX.locked) { Tween.after(300, applyAdInsetIfIdle); return; }
    var h = pendingAdInset; pendingAdInset = null;
    if (Layout.adInset !== h) { Layout.setAdInset(h); relayout(); }
  }
  function installFakeAds() {
    var ready = true;
    TB.Ads = Ads = { init: function () {}, ensureReady: function () { return Promise.resolve(); }, showConsentFormIfRequired: function () { return Promise.resolve(); },
      consentState: function () { return { canRequestAds: true, privacyOptionsRequired: true }; }, showBanner: function () { pendingAdInset = 60; applyAdInsetIfIdle(); }, hideBanner: function () {}, removeBanner: function () { pendingAdInset = 0; applyAdInsetIfIdle(); },
      showInterstitial: function () { toast('[fake interstitial]'); return new Promise(function (res) { setTimeout(function () { res(true); }, 400); }); },
      isRewardedReady: function () { return ready; }, showRewarded: function (kind) { toast('[fake rewarded ' + kind + ']'); return new Promise(function (res) { setTimeout(function () { res({ rewarded: app.query.fakeads !== 'dismiss', reason: 'fake' }); }, 400); }); },
      privacyOptionsRequired: function () { return true; }, openPrivacyOptions: function () { toast('[privacy options]'); return Promise.resolve(); },
      notifySessionStart: function () {}, notifyGameStart: function () {}, notifyGameOver: function () {}, ids: function () { return {}; } };
  }
  // A reward earned right before the process was killed: apply it now (rescue -> next rescue is free; tilt -> +1 on the saved game).
  function consumePendingReward() {
    var pr = has(Ads, 'consumePendingReward') ? Ads.consumePendingReward() : null;
    if (!pr) return;
    if (pr.kind === 'rescue') { app.profile.freeRescueUsed = false; saveDoc('profile', app.profile); }
    else if (pr.kind === 'tilt') { var save = Storage && Storage.get('save'); var gm = save ? Game.restore(save) : null; if (gm && !gm.isOver()) { gm.s.extraTiltsUsed = Math.max(0, gm.s.extraTiltsUsed - 1); gm.addTilt(); saveDoc('save', gm.serialize()); } }
  }
  function maybeShowBanner() { if (app.profile.bannerUnlocked && !app.firstEverGame && g.innerHeight >= Config.ADS.banner.minViewportHeight) call(Ads, 'showBanner'); }
  function rewardedReady(kind) { return !!(Ads && has(Ads, 'isRewardedReady') && Ads.isRewardedReady(kind)); }

  // ---------- render loop ----------
  function requestFrame() { if (!rafId) rafId = g.requestAnimationFrame(frame); }
  function needsLoop() {
    return Tween.count() > 0 || Particles.count() > 0 || !!drag || !!armedDir || !!app.toast || !!FX.banner || (app.tutorial && app.tutorial.finger) || (app.game && app.game.s.needsTilt && app.screen === 'play');
  }
  function frame(ts) {
    rafId = 0;
    var dt = lastNow ? Math.min(50, ts - lastNow) : 16; lastNow = ts;
    Tween.update(ts);
    Particles.update(dt);
    FX.pulse += dt / 1000;
    if (app.tutorial) updateFinger(ts);
    draw();
    frameTimes.push(dt); if (frameTimes.length > 60) { frameTimes.shift(); var avg = frameTimes.reduce(function (a, b) { return a + b; }, 0) / 60; if (avg > Config.FX.slowFrameMs && !app.lowQuality) { app.lowQuality = true; R.setQuality(0.75); relayout(); } }
    if (needsLoop()) requestFrame();
  }
  function arrowInfo() { if (arrowCache.v !== boardVersion && app.game) { arrowCache.v = boardVersion; arrowCache.info = app.game.arrowInfo(); } return arrowCache.info; }
  function trayModel() {
    var s = app.game.s, out = [];
    for (var i = 0; i < 3; i++) {
      var shape = s.hand[i] ? Pieces.byId[s.hand[i]] : null;
      out.push({ shape: shape, hidden: !!(drag && drag.slot === i), locked: s.locked[i], alpha: s.needsTilt ? 0.45 : 1, offsetY: trayOffset[i] });
    }
    return out;
  }
  function dragModel() {
    if (!drag) return null;
    var w = drag.shape.w * CELL, h = drag.shape.h * CELL;
    return { shape: drag.shape, x: drag.lx - w / 2, y: drag.ly - Config.INPUT.dragLiftPx - h };
  }
  function draw() {
    R.begin(); UI.beginFrame();
    var sc = app.screen;
    if (sc === 'menu') UI.drawMenu(app);
    else if (sc === 'daily') UI.drawDaily(app);
    else if (app.game) {
      R.drawBoardBase(app.game); R.drawMeterRing(app.game); R.drawCells(app.game);
      if (!FX.locked) R.drawGhost(ghost);
      var s = app.game.s;
      var onlyDown = app.tutorial && app.tutorial.step === 3;
      var info = arrowInfo();
      R.drawArrows({ info: info, stored: s.stored, armed: armedDir, pulse: pulseDirs, visible: !app.tutorial || app.tutorial.step === 3, only: onlyDown ? 'down' : null });
      UI.drawHUD(app);
      R.drawTray(trayModel());
      if (sc === 'play') { UI.drawChip(app); UI.drawBottomBar(app); }
      R.drawDrag(dragModel());
      UI.drawTutorialFinger(app);
      if (sc === 'pause') UI.drawPause(app);
      else if (sc === 'gameover') UI.drawGameOver(app);
      else if (sc === 'rescue') UI.drawRescue(app);
      else if (sc === 'chipSheet') UI.drawChipSheet(app);
      else if (sc === 'confirm') UI.drawConfirm(app);
      else if (sc === 'overDim') R.drawDim(app.dimAlpha || 0);
    }
    if (sc === 'confirm' && !app.game) UI.drawConfirm(app);
    R.drawParticles(); R.drawFloatingTexts(); R.drawBanner(); UI.drawToast(app);
    UI.syncA11y(onButton);
  }

  // ---------- helpers ----------
  function toast(text, ms) {
    var tt = { text: text, alpha: 1 }; app.toast = tt;
    Tween.add({ delay: ms || 1800, dur: 300, update: function (p) { tt.alpha = 1 - p; }, done: function () { if (app.toast === tt) app.toast = null; } });
    requestFrame();
  }
  function finishInstant() { if (!app.instantFx) return; var T = now() + 1e6; for (var k = 0; k < 12 && Tween.count() > 0; k++) { Tween.update(T); T += 1e6; } Particles.clear(); }
  function autosave() { if (!app.game || app.tutorial) return; if (app.game.isOver()) { saveDoc('save', null); app.hasSave = false; return; } saveDoc('save', app.game.serialize()); app.hasSave = true; }
  function showMenu() {
    app.screen = 'menu'; app.game = null; app.tutorial = null; drag = null; ghost = null; armedDir = null; R.resetFX();
    app.hasSave = !!(Storage && Storage.get('save'));
    app.dailyInfo = buildDailyInfo();
    UI.announce(t('menu.play'));
    requestFrame();
  }
  function buildDailyInfo() {
    var key = todayKey(), res = app.dailyDoc.results || {}, cal = [];
    for (var i = 29; i >= 0; i--) { var k = Daily.shiftKey(key, -i); cal.push({ key: k, score: res[k] ? res[k].score : null, today: i === 0 }); }
    var st = app.dailyDoc.streak || { current: 0, best: 0, lastDate: null };
    return { key: key, number: Daily.numberFor(key), done: !!res[key], score: res[key] ? res[key].score : null, streak: Daily.isAlive(st, key) ? st.current : 0, bestStreak: st.best, calendar: cal };
  }

  // ---------- game lifecycle ----------
  function startGame(mode, opts) {
    opts = opts || {};
    mode = mode === 'daily' ? 'daily' : 'classic';
    var meta = { mode: mode, startedAt: Date.now() }, seed;
    if (mode === 'daily') {
      var key = (opts.dateKey && Daily.isValidKey(opts.dateKey)) ? opts.dateKey : todayKey();
      var already = !!(app.dailyDoc.results && app.dailyDoc.results[key]);
      meta.dateKey = key; meta.practice = !!opts.practice || already || key !== todayKey(); seed = Daily.seedFor(key);
    } else {
      seed = opts.seed || ('c-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36));
    }
    app.game = Game.create({ mode: mode, seed: seed, meta: meta });
    beginPlay();
    if (mode === 'daily' && !meta.practice && !app.profile.seenDailyReminder) { app.profile.seenDailyReminder = true; saveDoc('profile', app.profile); toast(t('daily.reminder'), 2500); }
  }
  function resumeGame() {
    var save = Storage && Storage.get('save');
    var game = save ? Game.restore(save) : null;
    if (!game) { startGame('classic'); return; }
    app.game = game; beginPlay();
  }
  function beginPlay() {
    app.screen = 'play'; app.tutorial = null; app.gameOverInfo = null; drag = null; ghost = null; armedDir = null; pulseDirs = null; app.hint = '';
    R.resetFX(); boardVersion++; gameStartedAt = now(); rewardedThisGame = false; trayOffset = [0, 0, 0];
    app.firstEverGame = app.profile.gameOvers === 0;
    call(Ads, 'notifyGameStart', app.game.s.mode);
    call(Stats, 'record', 'game_start', { mode: app.game.s.mode });
    maybeShowBanner();
    updateChip(); autosave(); refreshStuck(); requestFrame();
  }
  function refreshStuck() {
    var s = app.game.s;
    if (s.needsTilt) {
      var info = arrowInfo(), any = Tilt.DIRS.some(function (d) { return info[d].fits; });
      pulseDirs = {}; Tilt.DIRS.forEach(function (d) { pulseDirs[d] = any ? info[d].fits : false; });
      app.hint = any ? t('tilt.needTilt') : t('tilt.noHelp');
      UI.announce(t('a11y.noMoves'));
    } else { pulseDirs = null; app.hint = ''; }
  }
  function updateChip() {
    app.rewardedReady = rewardedReady('tilt');
    app.chipVisible = !!(app.game && app.screen === 'play' && !app.tutorial && !app.firstEverGame && app.game.extraTiltAvailable() && app.rewardedReady);
  }
  function afterAction() {
    if (!app.game) return;
    var s = app.game.s;
    autosave();
    if (s.over) { onGameOver(); return; }
    refreshStuck(); updateChip(); requestFrame();
  }

  // place a piece from slot i at (r,c)
  function doPlace(i, r, c) {
    var game = app.game; if (!game || FX.locked) return false;
    var res = game.place(i, r, c);
    if (!res.ok) return false;
    boardVersion++; drag = null; ghost = null;
    call(Audio, 'play', 'drop'); call(Haptics, 'light');
    var b = Layout.rects.board, cx = b.x + c * CELL + 18, cy = b.y + r * CELL + 18;
    R.playScript(res.steps, { kind: 'place', center: { r: r, c: c }, onEvent: function (name, d) {
      if (name === 'clear') { call(Audio, 'play', 'clear', { lines: d.lines, combo: res.combo }); if (d.lines >= 2) call(Haptics, 'success'); }
    }, onDone: afterAction });
    R.floatText('+' + res.points, cx, cy - 10, { size: res.lines ? 22 : 16, color: res.lines ? R.getPalette().accent : R.getPalette().accent2 });
    if (res.lines && res.combo >= 2) { R.floatText(t('hud.combo', { n: res.combo }), 180, b.y - 6, { size: 16 }); call(Audio, 'play', 'comboUp'); }
    if (res.allClear) { Tween.after(200, function () { R.banner(t('tilt.allClear'), true); call(Audio, 'play', 'allClear'); }); }
    if (res.tiltsGained > 0) { R.glowMeter(); call(Audio, 'play', 'ready'); call(Haptics, 'light'); UI.announce(t('a11y.tiltReady'));
      if (!app.profile.seenTiltHint && !app.tutorial) { app.profile.seenTiltHint = true; saveDoc('profile', app.profile); toast(t('tilt.arrowHint'), 2500); } }
    if (res.refilled) { call(Audio, 'play', 'refill'); for (var k = 0; k < 3; k++) (function (kk) { trayOffset[kk] = 24; Tween.add({ delay: kk * A.refillStaggerMs, dur: A.refillMs, ease: 'outQuad', update: function (p) { trayOffset[kk] = 24 * (1 - p); } }); })(k); }
    call(Stats, 'record', 'placement', { lines: res.lines });
    if (app.tutorial) tutorialAfterPlace();
    finishInstant(); requestFrame();
    return true;
  }
  function doTilt(dir) {
    var game = app.game; if (!game || app.screen !== 'play' || FX.locked) return false;
    if (app.tutorial && !(app.tutorial.step === 3 && (dir === 'down' || dir === 'up'))) { R.nudge(dir, 6); return false; }
    if (game.s.stored < 1) { R.nudge(dir, 3); call(Audio, 'play', 'denied'); call(Haptics, 'warning'); updateChip(); requestFrame(); return false; }
    var res = game.tilt(dir);
    if (!res.ok) return false;
    boardVersion++;
    if (res.noop) { R.nudge(dir, 6); call(Audio, 'play', 'denied'); toast(t('tilt.noop'), 1200); return false; }
    call(Audio, 'play', 'whoosh', { dir: dir }); call(Haptics, 'medium');
    var b = Layout.rects.board;
    R.playScript(res.steps, { kind: 'tilt', dir: dir, onEvent: function (name, d) {
      if (name === 'land') { call(Audio, 'play', 'land'); call(Haptics, 'heavy'); }
      if (name === 'clear') { call(Audio, 'play', 'clear', { lines: d.lines, combo: res.combo }); R.floatText('+' + res.points, b.x + b.w / 2, b.y + b.h / 2, { size: 26 });
        if (res.banner) { R.banner(t('tilt.banner', { n: res.lines })); call(Audio, 'play', 'banner'); call(Haptics, 'heavy'); }
        if (res.allClear) Tween.after(500, function () { R.banner(t('tilt.allClear'), true); call(Audio, 'play', 'allClear'); }); }
    }, onDone: afterAction });
    call(Stats, 'record', 'tilt', { dir: dir, lines: res.lines });
    app.profile.totalTilts = (app.profile.totalTilts || 0) + 1;
    if (app.tutorial) tutorialAfterTilt();
    finishInstant(); requestFrame();
    return true;
  }

  function onGameOver() {
    var game = app.game, s = game.s, prof = app.profile;
    drag = null; ghost = null; armedDir = null; pulseDirs = null; app.chipVisible = false; app.hint = '';
    var isNewBest = s.score > (prof.bestScore || 0) && !(s.meta && s.meta.practice);
    var official = s.mode === 'daily' && !(s.meta && s.meta.practice);
    if (!(s.meta && s.meta.practice)) {
      prof.bestScore = Math.max(prof.bestScore || 0, s.score); prof.bestCombo = Math.max(prof.bestCombo || 0, s.bestCombo); prof.bestTiltLines = Math.max(prof.bestTiltLines || 0, s.bestTiltLines);
    }
    prof.totalLines = (prof.totalLines || 0) + s.linesTotal; prof.gamesPlayed = (prof.gamesPlayed || 0) + 1; prof.gameOvers = (prof.gameOvers || 0) + 1; prof.lastPlayedAt = Date.now();
    if (!prof.firstPlayedAt) prof.firstPlayedAt = Date.now();
    var tk = todayKey(); prof.playDays = prof.playDays || []; if (prof.playDays.indexOf(tk) < 0) { prof.playDays.push(tk); if (prof.playDays.length > 400) prof.playDays.shift(); }
    var unlocked = checkUnlocks();
    prof.bannerUnlocked = true;
    saveDoc('profile', prof);
    if (official) {
      app.dailyDoc.results[s.meta.dateKey] = { score: s.score, lines: s.linesTotal, tilts: s.tiltsUsed, hands: Math.min(s.handIndex, s.rules.hands), completed: !!s.completed, at: Date.now() };
      app.dailyDoc.streak = Daily.updateStreak(app.dailyDoc.streak, s.meta.dateKey);
      saveDoc('daily', app.dailyDoc);
    }
    saveDoc('save', null); app.hasSave = false;
    call(Stats, 'record', 'game_over', { score: s.score, lines: s.linesTotal, pieces: s.placements, sec: Math.round((now() - gameStartedAt) / 1000), tilts: s.tiltsUsed, revived: s.rescuesUsed > 0, mode: s.mode });
    call(Ads, 'notifyGameOver', { mode: s.mode, durationSec: Math.round((now() - gameStartedAt) / 1000), piecesPlaced: s.placements, rewardedWatched: rewardedThisGame });
    app.gameOverInfo = { mode: s.mode, score: s.score, best: prof.bestScore, isNewBest: isNewBest, bestTiltLines: s.bestTiltLines, bestCombo: s.bestCombo, completed: !!s.completed,
      hands: Math.min(s.handIndex, s.rules.hands || s.handIndex), total: s.rules.hands || 0, dailyNumber: s.meta && s.meta.dateKey ? Daily.numberFor(s.meta.dateKey) : 0,
      rescue: game.rescueAvailable() ? (prof.freeRescueUsed ? 'ad' : 'free') : 'none', unlocked: unlocked, practice: !!(s.meta && s.meta.practice) };
    call(Storage, 'flush');
    // game-over sequence: dim + piece shake, then rescue or results
    app.screen = 'overDim'; app.dimAlpha = 0;
    Tween.add({ dur: A.gameOverDimMs, update: function (p) { app.dimAlpha = 0.35 * p; } });
    call(Audio, 'play', 'gameOver');
    var proceed = function () {
      var next = function () {
        if (app.gameOverInfo.rescue !== 'none') { app.rewardedReady = rewardedReady('rescue'); app.screen = 'rescue'; if (app.gameOverInfo.rescue === 'ad' && !app.rewardedReady) retryRewardedReady('rescue'); }
        else showResults();
        requestFrame();
      };
      if (has(Ads, 'showConsentFormIfRequired')) Ads.showConsentFormIfRequired().then(next, next); else next();
    };
    if (app.instantFx) proceed(); else Tween.after(A.gameOverDimMs + 600, proceed);
    finishInstant(); requestFrame();
  }
  function retryRewardedReady(kind) { var tries = 0; var tick = function () { app.rewardedReady = rewardedReady(kind); requestFrame(); if (!app.rewardedReady && tries++ < 6 && (app.screen === 'rescue' || app.screen === 'chipSheet')) Tween.after(500, tick); }; Tween.after(500, tick); }
  function showResults() {
    var info = app.gameOverInfo; app.screen = 'gameover';
    if (info.isNewBest) { call(Audio, 'play', 'newBest'); call(Haptics, 'success'); if (!R.isReduced()) Particles.confetti(180, 120, 120); UI.announce(t('a11y.newBest')); }
    if (info.unlocked && info.unlocked.length) toast(t('settings.palette') + ': ' + info.unlocked.map(function (i) { return t('palette.' + i); }).join(', '), 2500);
    app.firstEverGame = false; maybeShowBanner();
    requestFrame();
  }
  function checkUnlocks() {
    var prof = app.profile, list = prof.palettesUnlocked || [0], added = [];
    Config.UNLOCKS.paletteScores.forEach(function (sc, i) { if (prof.bestScore >= sc && list.indexOf(i + 1) < 0) { list.push(i + 1); added.push(i + 1); } });
    Config.UNLOCKS.paletteDays.forEach(function (d, i) { if ((prof.playDays || []).length >= d && list.indexOf(5 + i) < 0) { list.push(5 + i); added.push(5 + i); } });
    prof.palettesUnlocked = list; app.palettesUnlocked = list;
    return added;
  }
  function doRescue(free) {
    var game = app.game; var res = game.rescue(); if (!res.ok) { showResults(); return; }
    boardVersion++;
    if (free) { app.profile.freeRescueUsed = true; saveDoc('profile', app.profile); }
    app.screen = 'play'; app.dimAlpha = 0; app.gameOverInfo = null;
    call(Audio, 'play', 'whoosh', { dir: 'down' }); call(Haptics, 'medium');
    R.playScript(res.steps, { kind: 'rescue', dir: 'down', onEvent: function (name) { if (name === 'clear') call(Audio, 'play', 'clear', { lines: 4, combo: 1 }); }, onDone: function () { toast(t('over.rescued'), 1200); afterAction(); } });
    call(Stats, 'record', 'rescue', { free: !!free });
    finishInstant(); requestFrame();
  }
  function leaveResults(thenFn) {
    var p = has(Ads, 'showInterstitial') ? Ads.showInterstitial('results') : Promise.resolve(false);
    p.then(function () { thenFn(); }, function () { thenFn(); });
  }
  function shareNow() {
    if (!Share) { toast(t('common.offline')); return; }
    var info = app.gameOverInfo || {}, s = app.game ? app.game.s : null, lang = I18N ? I18N.lang : 'en';
    var url = Platform && Platform.isNative ? Config.SHARE.play : Config.SHARE.web;
    var text = (s && s.mode === 'daily') ? Share.dailyText({ number: info.dailyNumber, score: info.score, hands: info.hands, total: info.total, lines: info.bestTiltLines, url: url, lang: lang })
      : Share.scoreText({ score: info.score, url: url, lang: lang });
    var cv = null; try { cv = Share.renderCard({ mode: s ? s.mode : 'classic', score: info.score, best: info.best, dateKey: s && s.meta ? s.meta.dateKey : null, dailyNumber: info.dailyNumber, bestTiltLines: info.bestTiltLines, hands: info.hands, total: info.total, board: s ? s.board : null, palette: R.getPalette(), lang: lang }); } catch (e) { warn('card', e); }
    call(Stats, 'record', 'share', { mode: s ? s.mode : 'classic' });
    Share.share({ text: text, url: url, canvas: cv }).then(function (r) { if (r && (r.method === 'clipboard' || r.method === 'download')) toast(t(r.method === 'clipboard' ? 'share.copied' : 'share.saved')); });
  }
  function shareDaily() {
    var key = todayKey(), res = app.dailyDoc.results[key]; if (!res) return;
    app.gameOverInfo = { mode: 'daily', score: res.score, best: app.profile.bestScore, bestTiltLines: 0, hands: res.hands, total: Config.RULES.daily.hands, dailyNumber: Daily.numberFor(key) };
    app.game = null; shareNow();
  }

  // ---------- tutorial ----------
  function startTutorial() {
    app.game = Game.create({ mode: 'tutorial', seed: 'tutorial', preset: TUTORIAL_PRESET });
    app.screen = 'play'; app.gameOverInfo = null; drag = null; ghost = null; armedDir = null; pulseDirs = null; R.resetFX(); boardVersion++;
    app.tutorial = { step: 1, hint: t(TUT_STEPS[1].hint), finger: { x: 0, y: 0, alpha: 0 }, t0: now() };
    app.chipVisible = false; requestFrame();
  }
  function tutorialAfterPlace() {
    var tut = app.tutorial, step = TUT_STEPS[tut.step];
    if (tut.step === 1 || tut.step === 2) { tut.step++; tut.hint = t(TUT_STEPS[tut.step].hint); tut.t0 = now(); boardVersion++; }
    void step;
  }
  function tutorialAfterTilt() { var tut = app.tutorial; tut.step = 4; tut.hint = t('tut.done'); tut.finger = null; Tween.after(app.instantFx ? 0 : 1400, finishTutorial); }
  function finishTutorial() {
    app.profile.tutorialDone = true; saveDoc('profile', app.profile); app.tutorial = null;
    startGame('classic');
  }
  function updateFinger(ts) {
    var tut = app.tutorial; if (!tut || !tut.finger) return;
    var step = TUT_STEPS[tut.step]; if (!step) return;
    var period = 2500, p = ((ts - tut.t0) % period) / period, f = tut.finger;
    var b = Layout.rects.board, from, to;
    if (step.tilt) { from = { x: b.x + b.w / 2, y: b.y + b.h / 2 - 50 }; to = { x: from.x, y: from.y + 130 }; }
    else { var sl = Layout.rects.tray.slots[step.slot], shape = Pieces.byId[TUTORIAL_PRESET.hand[step.slot]]; from = { x: sl.cx, y: sl.cy }; to = { x: b.x + step.c * CELL + shape.w * CELL / 2, y: b.y + step.r * CELL + shape.h * CELL / 2 + Config.INPUT.dragLiftPx }; }
    var q = p < 0.15 ? 0 : p < 0.7 ? (p - 0.15) / 0.55 : 1;
    q = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
    f.x = from.x + (to.x - from.x) * q; f.y = from.y + (to.y - from.y) * q;
    f.alpha = p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1;
    if (drag) f.alpha = 0;
  }

  // ---------- input handlers ----------
  var inputHandlers = {
    hitTest: function (lx, ly) {
      var id = UI.hitTest(lx, ly); if (id) return { kind: 'button', id: id };
      if (app.screen !== 'play' || !app.game) return { kind: 'none' };
      var tr = Layout.rects.tray, reach = Config.INPUT.trayDragReachPx;
      if (ly >= tr.y - reach && ly < tr.y + tr.h) { var slot = Math.min(2, Math.max(0, Math.floor(lx / 120))); return { kind: 'tray', slot: slot }; }
      var ar = Layout.rects.arrows;
      for (var i = 0; i < Tilt.DIRS.length; i++) if (Layout.inRect({ x: lx, y: ly }, ar[Tilt.DIRS[i]])) return { kind: 'arrow', dir: Tilt.DIRS[i] };
      if (Layout.inRect({ x: lx, y: ly }, Layout.rects.board)) return { kind: 'board' };
      return { kind: 'none' };
    },
    onActivity: function () { call(Audio, 'unlock'); },
    onTap: function (hit, lx, ly) {
      if (hit.kind === 'button') onButton(hit.id);
      else if (hit.kind === 'arrow') doTilt(hit.dir);
      else if (hit.kind === 'tray' && app.game && app.game.s.locked[hit.slot]) { R.nudge('down', 2); }
    },
    onDragStart: function (slot, lx, ly) {
      if (app.screen !== 'play' || !app.game || app.game.isOver()) return false;
      var s = app.game.s; if (!s.hand[slot] || s.locked[slot]) return false;
      if (app.tutorial && TUT_STEPS[app.tutorial.step] && TUT_STEPS[app.tutorial.step].slot !== slot) return false;
      drag = { slot: slot, shape: Pieces.byId[s.hand[slot]], lx: lx, ly: ly }; ghost = null;
      call(Audio, 'play', 'pickup'); requestFrame();
      return true;
    },
    onDragMove: function (slot, lx, ly) {
      if (!drag) return; drag.lx = lx; drag.ly = ly;
      var b = Layout.rects.board, shape = drag.shape;
      var x = lx - shape.w * CELL / 2, y = ly - Config.INPUT.dragLiftPx - shape.h * CELL;
      var c = Math.round((x - b.x) / CELL), r = Math.round((y - b.y) / CELL);
      var valid = app.game.canPlace(slot, r, c);
      if (valid && app.tutorial && TUT_STEPS[app.tutorial.step] && !TUT_STEPS[app.tutorial.step].tilt) { var st = TUT_STEPS[app.tutorial.step]; valid = (r === st.r && c === st.c); }
      var lines = null;
      if (valid) { var copy = Board.clone(app.game.s.board); Board.place(copy, shape, r, c, 0); lines = Board.findFullLines(copy); }
      ghost = { shape: shape, r: r, c: c, valid: valid, lines: lines };
      requestFrame();
    },
    onDragEnd: function (slot, lx, ly) {
      var gh = ghost; drag = null; ghost = null;
      if (gh && gh.valid && !FX.locked) { if (doPlace(slot, gh.r, gh.c)) return; }
      call(Audio, 'play', 'invalid'); requestFrame();
    },
    onDragCancel: function () { drag = null; ghost = null; requestFrame(); },
    onSwipeMove: function (dir, frac) {
      if (app.screen !== 'play' || !dir || FX.locked) return;
      var k = Config.INPUT.rubberBandMaxPx * Math.min(1, frac) * (app.reducedMotionEffective ? 0 : 1);
      FX.boardOffset.x = dir === 'left' ? -k : dir === 'right' ? k : 0; FX.boardOffset.y = dir === 'up' ? -k : dir === 'down' ? k : 0;
      requestFrame();
    },
    onSwipeArm: function (dir) { if (app.screen === 'play' && app.game && app.game.s.stored > 0 && !FX.locked) armedDir = dir; requestFrame(); },
    onSwipeDisarm: function () { armedDir = null; releaseRubber(); },
    onSwipeCommit: function (dir) { armedDir = null; releaseRubber(); doTilt(dir); }
  };
  function releaseRubber() { var ox = FX.boardOffset.x, oy = FX.boardOffset.y; if (!ox && !oy) return; Tween.add({ dur: 120, ease: 'outQuad', update: function (p) { FX.boardOffset.x = ox * (1 - p); FX.boardOffset.y = oy * (1 - p); } }); requestFrame(); }

  function onButton(id) {
    call(Audio, 'play', 'tick');
    switch (id) {
      case 'menu.play': case 'menu.newGame':
        if (app.hasSave) { app.confirm = { text: t('menu.abandonConfirm'), yes: function () { saveDoc('save', null); startGame('classic'); } }; app.screen = 'confirm'; }
        else startGame('classic'); break;
      case 'menu.continue': resumeGame(); break;
      case 'menu.daily': app.dailyInfo = buildDailyInfo(); app.screen = 'daily'; break;
      case 'menu.help': UI.openHelp(app, overlayAction); break;
      case 'menu.settings': case 'pause.settings': UI.openSettings(app, overlayAction); break;
      case 'menu.stats': app.statsSnapshot = call(Stats, 'snapshot') || {}; UI.openStats(app, overlayAction); break;
      case 'play.pause': if (app.screen === 'play') { Input.cancel(); drag = null; ghost = null; app.screen = 'pause'; call(Storage, 'flush'); } break;
      case 'pause.resume': app.screen = 'play'; break;
      case 'pause.quit': autosave(); call(Storage, 'flush'); showMenu(); break;
      case 'tut.skip': finishTutorial(); break;
      case 'rescue.accept':
        if (app.gameOverInfo.rescue === 'free') doRescue(true);
        else if (rewardedReady('rescue')) { rewardedThisGame = true; Ads.showRewarded('rescue').then(function (r) { if (r && r.rewarded) doRescue(false); else { toast(t('over.adNotFinished')); app.rewardedReady = rewardedReady('rescue'); requestFrame(); } }, function () { toast(t('over.noAd')); }); }
        break;
      case 'rescue.decline': showResults(); break;
      case 'over.again': leaveResults(function () { var s = app.gameOverInfo; startGame(s.mode, s.mode === 'daily' ? { practice: true } : {}); }); break;
      case 'over.home': leaveResults(showMenu); break;
      case 'over.share': shareNow(); break;
      case 'chip.open': app.rewardedReady = rewardedReady('tilt'); app.screen = 'chipSheet'; break;
      case 'chip.no': app.screen = 'play'; break;
      case 'chip.watch':
        app.screen = 'play';
        if (rewardedReady('tilt')) { rewardedThisGame = true; Ads.showRewarded('tilt').then(function (r) { if (r && r.rewarded && app.game) { app.game.addTilt(); boardVersion++; R.glowMeter(); toast(t('chip.gained')); afterAction(); } else toast(t('over.adNotFinished')); }, function () { toast(t('over.noAd')); }); }
        break;
      case 'daily.play': startGame('daily', { dateKey: todayKey() }); break;
      case 'daily.practice': startGame('daily', { dateKey: todayKey(), practice: true }); break;
      case 'daily.share': shareDaily(); break;
      case 'daily.back': showMenu(); break;
      case 'confirm.yes': var fn = app.confirm && app.confirm.yes; app.confirm = null; app.screen = app.game ? 'play' : 'menu'; if (fn) fn(); break;
      case 'confirm.no': app.confirm = null; app.screen = app.game ? 'play' : 'menu'; break;
      default: break;
    }
    requestFrame();
  }
  function overlayAction(action, el) {
    if (action === 'close') { UI.closeOverlay(); requestFrame(); return; }
    if (action === 'tutorial') { UI.closeOverlay(); if (app.game && !app.game.isOver()) autosave(); startTutorial(); return; }
    if (action === 'privacy') { call(Ads, 'openPrivacyOptions'); return; }
    if (action === 'copy') { var txt = call(Stats, 'diagnosticsJSON') || '{}'; try { g.navigator.clipboard.writeText(txt).then(function () { var st = g.document.getElementById('copy-status'); if (st) st.textContent = t('stats.copied'); }); } catch (e) { /* ignore */ } return; }
    if (action === 'palette') { var idx = +el.getAttribute('data-index'); if (app.palettesUnlocked.indexOf(idx) >= 0) { app.settings.palette = idx; saveDoc('settings', app.settings); applySettings(); UI.openSettings(app, overlayAction); requestFrame(); } return; }
    if (action === 'setting') {
      var key = el.getAttribute('data-setting');
      if (key === 'lang') app.settings.lang = el.value; else app.settings[key] = !!el.checked;
      saveDoc('settings', app.settings); applyLanguage(); applySettings();
      if (key === 'sound' && el.checked) call(Audio, 'unlock');
      if (key === 'lang') UI.openSettings(app, overlayAction);
      if (app.tutorial) app.tutorial.hint = t(TUT_STEPS[app.tutorial.step] ? TUT_STEPS[app.tutorial.step].hint : 'tut.done');
      requestFrame();
    }
  }
  function onKey(e) {
    if (UI.isOverlayOpen()) { if (e.key === 'Escape') UI.closeOverlay(); return; }
    if (app.screen === 'play') { var m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (m) { doTilt(m); e.preventDefault(); } else if (e.key === 'Escape' || e.key === 'p') onButton('play.pause'); }
    else if (app.screen === 'pause' && e.key === 'Escape') onButton('pause.resume');
  }
  function onBack() {
    if (UI.isOverlayOpen()) { UI.closeOverlay(); requestFrame(); return; }
    switch (app.screen) {
      case 'play': onButton('play.pause'); break;
      case 'pause': onButton('pause.resume'); break;
      case 'gameover': onButton('over.home'); break;
      case 'rescue': onButton('rescue.decline'); break;
      case 'chipSheet': onButton('chip.no'); break;
      case 'confirm': onButton('confirm.no'); break;
      case 'daily': showMenu(); break;
      case 'menu': call(Platform, 'minimizeApp'); break;
      default: break;
    }
  }
  function onAppPause() {
    Input.cancel(); drag = null; ghost = null; autosave(); call(Storage, 'flush'); call(Audio, 'suspend');
    if (app.screen === 'play' && !app.adShowing && !FX.locked) app.screen = 'pause';
    if (rafId) { g.cancelAnimationFrame(rafId); rafId = 0; }
  }
  function onAppResume() { call(Audio, 'resume'); lastNow = 0; if (has(Platform, 'getInsets')) Layout.setInsets(Platform.getInsets()); relayout(); call(Ads, 'ensureReady'); }

  function installDebugApi() {
    g.__TB = { app: app, layout: Layout, game: function () { return app.game; }, state: function () { return app.game ? app.game.serialize() : null; }, screen: function () { return app.screen; },
      startGame: startGame, place: doPlace, tilt: doTilt, button: onButton, hand: function () { return app.game ? app.game.s.hand.slice() : null; }, fx: FX, instant: function (v) { app.instantFx = !!v; },
      showMenu: showMenu, startTutorial: startTutorial, finishTutorial: finishTutorial, toast: toast, busy: function () { return FX.locked || Input.isBusy() || Tween.count() > 0; } };
  }

  if (g.document && g.document.readyState !== 'loading') boot(); else g.document.addEventListener('DOMContentLoaded', boot);
})(typeof globalThis !== 'undefined' ? globalThis : window);
