# Sandslide module contracts

Every file in `www/js/` is a classic script (no ES modules, no bundler) of the form

```js
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  // ... read earlier modules from TB, define exactly one TB.<Name> ...
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

Load order is fixed by `www/index.html`. Pure modules (config, i18n, rng, board, pieces, tilt, scoring, daily, game) never touch
`window`, `document`, `navigator`, `Date.now`, `performance` or `Math.random`; they must `require()` cleanly in Node
(see `test/helpers/load-engine.js`). Platform modules may use the DOM but must work when `window.Capacitor` is undefined
(web / file://) and must degrade to a no-op rather than throw.

Native plugins: `TB.Platform.plugin('AdMob' | 'Haptics' | 'Preferences' | 'Share' | 'Filesystem' | 'App' | 'SystemBars')`
returns the proxy injected by the Capacitor runtime (`window.Capacitor.Plugins.<Name>`) or `null`. Enum values are passed
as strings (`{ style: 'MEDIUM' }`, `'ADAPTIVE_BANNER'`, `'BOTTOM_CENTER'`), except AdMob `debugGeography` which is a number (EEA = 1).
`addListener` on these proxies returns a plain `{ remove() }` object synchronously (never `.then` it).
Storage keys are prefixed `sandslide.`. Language codes are `'en'` and `'zh-TW'`.

## Engine (already implemented; read the code in www/js)

- `TB.Config` — all tunables (see `config.js`). `TB.Config.PALETTE` has `bg, board, empty, grid, blocks[8], accent, accent2, danger, text, text2, ghost`.
- `TB.RNG` — `create(seed)`, `handRng(seed, handIndex)`, `hash(str)`.
- `TB.Board` — `create, clone, idx, count, canPlace, place, fitsAnywhere, anyFits, placements, rowCounts, colCounts, laneCounts, findFullLines, clearLines, fullestLines, toRows, fromRows`. Cells: `Uint8Array(64)`, `0` empty, `1..8` = colour index + 1.
- `TB.Pieces` — `CATALOG` (37 shapes `{id, family, cells:[[r,c]], w, h, size, color}`), `byId`, `byFamily`, `drawHand(seed, handIndex, {board, stored, rules})`.
- `TB.Tilt` — `DIRS = ['up','down','left','right']`, `tilt(cells, dir) -> {changed, moved, linesCleared, cellsCleared, clearSteps, steps}`,
  `previewLines`, `fitsAfterTilt`, `movingCells`. Animation script steps: `{t:'slide', dir, moves:[{from,to,color,dist}]}`,
  `{t:'clear', rows, cols, cells:[{idx,color}], lines, step}`, `{t:'settle'}`; placement scripts start with `{t:'place', cells:[idx], color, slot}`.
- `TB.Scoring`, `TB.Daily` — see files.
- `TB.Game.create({mode:'classic'|'daily'|'tutorial', seed, rules?, preset?, meta?})` returns a game `g` with state in `g.s`
  (`board, hand[3] (ids|null), locked[3], handIndex, score, combo, energy, stored, tiltsEarned, tiltsUsed, placements, linesTotal,
  bestTiltLines, bestCombo, allClears, rescuesUsed, extraTiltsUsed, over, completed, needsTilt, lastTilt, rules, mode, seed`)
  and methods `canPlace(i,r,c)`, `place(i,r,c)`, `tilt(dir)`, `nextCost()`, `arrowInfo() -> {up:{lines,fits,moving},...}`,
  `rescueAvailable()`, `rescue()`, `extraTiltAvailable()`, `addTilt()`, `handShapes()`, `fill()`, `isOver()`, `serialize()`;
  `TB.Game.restore(json)`.

## TB.I18N (`i18n.js`, pure)

```js
TB.I18N = {
  available: ['en', 'zh-TW'],
  strings: { en: {...}, 'zh-TW': {...} },   // identical key sets (unit test enforces parity)
  lang: 'en',                                // current language
  detect(navigatorLanguages /* array */, override /* 'auto'|'en'|'zh-TW' */) -> 'en'|'zh-TW',  // any zh* -> 'zh-TW'
  setLang(lang), t(key, params) -> string,  // {n}-style placeholders; missing key -> en fallback -> the key itself
  htmlLang() -> 'en' | 'zh-Hant-TW',
  fontStack: 'system-ui, "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif'
};
```
Required keys (English meaning in parentheses; zh-TW must read like a native Taiwanese casual game, not a translation):
`menu.play` (Play) `menu.continue` (Continue) `menu.newGame` (New game) `menu.daily` (Daily Slide) `menu.help` (How to play) `menu.settings` (Settings)
`menu.stats` (Stats) `menu.best` (Best) `menu.todayBest` (Today's best) `menu.abandonConfirm` (Abandon the current game?) `menu.tagline` (Tilt the board. Blocks slide like sand.)
`hud.score` `hud.best` `hud.combo` (Combo ×{n}) `hud.nextTilt` (Next Tilt: {n}) `hud.max` (MAX) `hud.tiltReady` (Tilt ready!) `hud.pause` `hud.hand` (Hand {n}/{total})
`tilt.needTilt` (No room — tilt toward a ✓!) `tilt.noHelp` (Even a tilt can't make room…) `tilt.arrowHint` (▼2 = tilting down clears 2 lines)
`tilt.haveTilt` (You have a Tilt — try swiping!) `tilt.banner` (SANDSLIDE ×{n}!) `tilt.allClear` (Board clear!) `tilt.noop` (Already packed!)
`tut.title` (How to play) `tut.step1` (Fill a line to clear it) `tut.step2` (Blocks fill the Tilt meter) `tut.step3` (Swipe down!) `tut.skip` (Skip) `tut.done` (That's it — play!)
`over.title` (No room left!) `over.dailyDone` (Daily complete!) `over.score` `over.best` `over.newBest` (New best!) `over.bestTilt` (Best tilt: {n} lines)
`over.bestCombo` (Longest combo ×{n}) `over.playAgain` (Play again) `over.home` (Home) `over.share` (Share) `over.rescueTitle` (Rescue?)
`over.rescueFree` (Free rescue (first time)) `over.rescueAd` (Watch ad to rescue) `over.rescueDesc` (Clears the 2 fullest rows + 2 columns, +1 Tilt, new pieces)
`over.noAd` (No ad available right now) `over.adNotFinished` (Ad not finished — no rescue) `over.rescued` (Rescued!) `over.noThanks` (No thanks) `over.hands` (Hands {n}/{total})
`chip.outOfEnergy` (Out of energy ▸ Watch ad for +1 Tilt) `chip.sheetTitle` (Refill a Tilt?) `chip.sheetBody` (Watch a short ad to get 1 Tilt (once per game)) `chip.watch` (Watch ad) `chip.gained` (+1 Tilt!)
`daily.title` (Daily Slide) `daily.number` (Daily #{n}) `daily.reminder` (One official score per day. No rescue.) `daily.practice` (Practice (not scored))
`daily.done` (Done for today) `daily.streak` (Streak: {n} days) `daily.bestStreak` (Best streak: {n}) `daily.calendar` (Last 30 days) `daily.play` (Play today's)
`daily.notToday` (Past puzzle — practice only) `daily.shareText` (Sandslide Daily #{n} · {score} · {hands}/{total} hands · best tilt {lines} lines\n{url})
`settings.title` `settings.sound` `settings.haptics` (Vibration) `settings.reducedMotion` (Reduce motion) `settings.largeText` (Large text) `settings.leftHanded` (Left-handed)
`settings.language` `settings.langAuto` (Auto) `settings.privacy` (Privacy settings) `settings.privacyPolicy` (Privacy policy) `settings.replayTutorial` (Replay tutorial)
`settings.version` (Version {v}) `settings.palette` (Board colours) `settings.locked` (Locked) `settings.unlockScore` (Best score {n}) `settings.unlockDays` ({n} play days)
`settings.back` `settings.on` `settings.off`
`help.title` (How to play) `help.rules` (the two-sentence rules) `help.tiltTitle` (Tilt) `help.tiltBody` (arrow numbers = lines that will clear; ✓ = a piece will fit after; opposite directions clear the same number of lines, only the pile side differs; a second tilt right after the first never clears lines — place something first; a 0-line tilt still removes every gap and can save a jammed board)
`help.scoringTitle` (Scoring) `help.scoringBody` (+1 per cell; n lines = 10·n(n+1)/2 × combo: 10/30/60/100/150/210/280; combo +1 per clearing move, survives one miss; board clear +500)
`help.fairTitle` (Fair play promise) `help.fairBody` (EN: "Fair play promise: every game starts from a fixed random seed, and the pieces you get come only from that sequence. Your score, your streak, your high score and ads never change which pieces appear. One exception: if none of the three pieces fits and you have no Tilt stored, the hand is silently redrawn up to 3 times." zh-TW: 「公平承諾：每一局都從固定的隨機種子開始，你拿到的方塊只來自這個序列。你的分數、連勝、最高分或廣告都不會改變出現的方塊。唯一例外：三個方塊都放不下、而且沒有存翻轉時，會靜默重抽最多 3 次。」)
`help.privacyTitle` (Privacy & ads) `help.privacyBody` (ads via Google AdMob; no accounts; stats stay on this device; link to the privacy policy)
`stats.title` `stats.games` `stats.placements` (Pieces placed) `stats.tilts` `stats.lines` (Lines cleared) `stats.bestScore` `stats.bestTilt` `stats.bestCombo` `stats.allClears` (Board clears)
`stats.days` (Play days) `stats.copy` (Copy diagnostics) `stats.copied` (Copied!)
`share.title` (Sandslide) `share.beatMe` (Beat my score!) `share.text` (I scored {score} in Sandslide — tilt the board, blocks slide like sand. {url}) `share.saved` (Image saved) `share.copied` (Text copied)
`common.ok` `common.cancel` `common.close` `common.loading` `common.offline` `common.resume` `common.quit` (Quit to menu) `common.paused` `common.unsupported` (This browser is too old to run Sandslide.)
`a11y.tiltReady` (Tilt ready) `a11y.noMoves` (No moves) `a11y.score` (Score {n}) `a11y.newBest` (New best score)
`palette.0` … `palette.6` (names of the default + 6 unlockable palettes).
Terminology: the resource/action is 「翻轉」/ "Tilt"; the celebration is "SANDSLIDE ×{n}!" / 「流沙 ×{n}！」; Daily is "Daily Slide" / 「每日流沙」; the game name is "Sandslide" / 「流沙方塊」.

## TB.Platform (`platform.js`)

```js
TB.Platform = {
  isNative: boolean, platform: 'android'|'ios'|'web', isFile: boolean /* file:// */,
  plugin(name) -> proxy|null,
  on(pluginName, eventName, cb) -> function unsubscribe,   // wraps proxy.addListener; no-op on web
  onPause(cb), onResume(cb),          // native App 'pause'/'resume' + document visibilitychange on web (deduplicated)
  onBackButton(cb),                   // Android hardware back; registering disables the default. no-op elsewhere
  minimizeApp(),
  getInsets() -> {top,right,bottom,left} in CSS px,   // from --safe-area-inset-* CSS vars injected by Capacitor, else env() probe, else 0
  onInsetsChange(cb),                  // MutationObserver on documentElement style + resize + resume
  setSystemBarsDark(),                 // SystemBars.setStyle({style:'DARK'}) when available
  now() -> ms (performance.now or Date.now),
  capabilities() -> {pointerEvents, audioContext, canvas}  // for the "too old" message
};
```

## TB.Storage (`storage.js`)

```js
TB.Storage = {
  init() -> Promise<void>,              // loads every doc into memory (Preferences on native, localStorage on web, in-memory fallback)
  get(doc) -> object|null,              // synchronous after init
  set(doc, value), update(doc, patch) -> object,   // debounced write (250 ms)
  flush() -> Promise<void>,             // immediate write; call on pause / game over / before showing an ad
  remove(doc),
  DOCS: ['profile','settings','daily','save','ads','stats']
};
```
Default documents (create on first `get` when missing): `profile {v:1, bestScore:0, bestCombo:0, bestTiltLines:0, gamesPlayed:0, totalLines:0, totalTilts:0,
firstPlayedAt:null, lastPlayedAt:null, tutorialDone:false, playDays:[], palettesUnlocked:[0], gameOvers:0, freeRescueUsed:false, bannerUnlocked:false}`,
`settings {v:1, sound:true, haptics:true, lang:'auto', reducedMotion:null /* null = follow prefers-reduced-motion */, largeText:false, leftHanded:false, palette:0}`,
`daily {v:1, results:{}, streak:{current:0,best:0,lastDate:null}}`, `save` (serialized game or null), `ads {v:1, sessions:0, lastInterstitialAt:0, gameOversSinceInterstitial:0,
interstitialsToday:{date:null,count:0}, consent:{canRequestAds:null, privacyOptionsRequired:false}, pendingReward:null}`, `stats` (see Stats).

## TB.Stats (`stats.js`)

```js
TB.Stats = {
  init(storage), record(event, props),  // events: game_start, game_over{score,lines,pieces,sec,tilts,revived,mode}, tilt{dir,lines}, rescue, extra_tilt, share, ad_* ...
  snapshot() -> stats doc,              // {firstOpen, sessions, games, placements, tilts, tiltLinesHist[8], gameMs:[], rescuesWatched, sharesTapped, lastErrors:[], version, platform}
  diagnosticsJSON() -> string,          // pretty JSON for the "Copy diagnostics" button
  installErrorHandlers()                // window.onerror / unhandledrejection -> lastErrors (max 5)
};
```

## TB.Audio (`audio.js`) — WebAudio synthesis, zero assets

```js
TB.Audio = {
  init(), unlock(),                     // call unlock() from pointerup / touchend / click / keydown handlers until running
  setEnabled(bool), isEnabled(),
  suspend(), resume(),                  // app pause/resume; idempotent
  play(name, opts)                      // names below; never throws; no-op when disabled or locked
};
```
Sounds: `pickup`, `drop`, `invalid`, `clear` ({lines, combo}: pentatonic notes rising with combo, one per line 40 ms apart), `comboUp`,
`ready` (tilt available), `whoosh` ({dir}: noise sweep, panned for left/right), `land` (thud), `banner` (major chord swell), `newBest` (fanfare),
`gameOver` (three descending notes), `tick` (UI), `denied` (dull thud), `refill` (triple pip), `allClear` (chord). 12-voice limit, master gain + compressor.

## TB.Haptics (`haptics.js`)

```js
TB.Haptics = { setEnabled(bool), isEnabled(), light(), medium(), heavy(), success(), warning(), error() };  // 40 ms throttle; web navigator.vibrate fallback in try/catch
```

## TB.Ads (`ads.js`) + TB.AdPolicy (pure, unit-tested)

```js
TB.AdPolicy = {
  interstitialGate(ctx, rules) -> {ok, reason},   // ctx: {lifetimeGameOvers, installAgeMin, sessionAgeSec, firstGameOverOfSession, gameOversSinceInterstitial,
                                                 //        secSinceFullscreenAd, gameDurationSec, piecesPlaced, rewardedWatchedThisGame, shownThisSession, shownToday, loaded, loadedAgeMin, online}
  bannerAllowed(ctx) -> boolean                   // {bannerUnlocked, inTutorial, firstGame, viewportHeight, consentOk, online}
};
TB.Ads = {
  init({ storage, stats, platform, i18n, hooks: { onBannerHeight(h), onFullscreenStart(), onFullscreenEnd(), isBusy() } }),
  ensureReady() -> Promise<void>,       // idempotent: requestConsentInfo -> (form deferred until allowed) -> initialize -> preload; throttled 60 s; never throws
  showConsentFormIfRequired() -> Promise<void>,   // call before the first results panel
  consentState() -> {canRequestAds, privacyOptionsRequired},
  showBanner(), hideBanner(), removeBanner(),
  showInterstitial(reason) -> Promise<boolean>,   // resolves when dismissed (or immediately false if gate fails / not loaded)
  isRewardedReady(kind /* 'rescue'|'tilt' */) -> boolean,
  showRewarded(kind) -> Promise<{rewarded:boolean, reason:string}>,   // event-driven (never awaits showRewardVideoAd's promise); 60 s watchdog; token de-dup
  privacyOptionsRequired() -> boolean, openPrivacyOptions() -> Promise<void>,
  notifySessionStart(), notifyGameStart(mode), notifyGameOver({mode, durationSec, piecesPlaced, rewardedWatched}),
  ids() -> the active id set (TB.ADS_IDS_TEST when TB.flags.env !== 'prod', else TB.ADS_IDS_PROD)
};
```
Uses `TB.Platform.plugin('AdMob')`; exact event names: `bannerAdSizeChanged`, `bannerAdLoaded`, `bannerAdFailedToLoad`, `interstitialAdLoaded`,
`interstitialAdFailedToLoad`, `interstitialAdShowed`, `interstitialAdFailedToShow`, `interstitialAdDismissed`, `onRewardedVideoAdLoaded`,
`onRewardedVideoAdFailedToLoad`, `onRewardedVideoAdShowed`, `onRewardedVideoAdFailedToShow`, `onRewardedVideoAdDismissed`, `onRewardedVideoAdReward`.
Methods: `requestConsentInfo`, `showConsentForm`, `showPrivacyOptionsForm`, `initialize`, `showBanner`, `hideBanner`, `resumeBanner`, `removeBanner`,
`prepareInterstitial`, `showInterstitial`, `prepareRewardVideoAd`, `showRewardVideoAd`. All rules/numbers come from `TB.Config.ADS`.

## TB.Share (`share.js`)

```js
TB.Share = {
  canShareFiles() -> boolean,
  dailyText({number, score, hands, total, lines, url, lang}) -> string,   // uses TB.I18N.t('daily.shareText')
  scoreText({score, url, lang}) -> string,
  renderCard({mode, score, best, dateKey, dailyNumber, bestTiltLines, hands, total, board /* Uint8Array */, palette, lang}) -> HTMLCanvasElement (1080x1350),
  share({ text, url, canvas }) -> Promise<{ok, method:'native'|'web'|'download'|'clipboard'|'none'}>
};
```

## Presentation (written by the integrator): `tween.js`, `particles.js`, `layout.js`, `renderer.js`, `ui.js`, `input.js`, `main.js`

`main.js` owns the state machine and calls the modules above exactly through the APIs listed here.
