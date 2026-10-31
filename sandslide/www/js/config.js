// Every tunable number in one place. Pure data: no DOM, no Date, no Math.random.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var CLASSIC_RULES = {
    energyPerCell: 1,       // energy per placed cell
    energyPerLine: 3,       // energy per cleared line, placement or tilt
    startEnergy: 30,        // first tilt arrives around the 2nd hand
    baseCharge: 60,         // cost of the 1st tilt earned this game
    chargeGrowth: 15,       // k-th tilt costs baseCharge + chargeGrowth * (k - 1)  (live A/B knob: 10 / 15 / 20)
    storedCap: 2,           // tilts that can be banked; bar freezes at MAX when full
    fairRedraws: 3,         // silent redraws when no hand piece fits and no tilt is stored (all modes)
    hands: 0,               // 0 = endless
    rescuePerGame: 1,       // rewarded (first ever is free)
    extraTiltPerGame: 1     // rewarded "+1 Tilt" chip
  };

  TB.Config = Object.freeze({
    VERSION: '0.1.0',
    GRID: 8,
    HAND_SIZE: 3,

    RULES: {
      classic: CLASSIC_RULES,
      daily: Object.assign({}, CLASSIC_RULES, { chargeGrowth: 0, storedCap: 3, hands: 20, rescuePerGame: 0, extraTiltPerGame: 0 }),
      tutorial: Object.assign({}, CLASSIC_RULES, { startEnergy: 53, fairRedraws: 0 })
    },

    // Piece tiers are a function of the hand index (1-based), identical in every mode.
    TIERS: { earlyUntilHand: 12, lateFromHand: 31 },

    SCORE: {
      perCell: 1,
      lineBase: 10,           // n lines in one event: lineBase * n(n+1)/2 * combo
      allClear: 500,
      comboMissGrace: 1,      // combo survives this many consecutive non-clearing placements
      bannerMinLines: 2       // "SANDSLIDE xk" banner threshold (lines in one tilt)
    },

    RESCUE: { rows: 2, cols: 2 },                      // clears the N fullest rows and columns
    EXTRA_TILT: { minFill: 39, maxEnergyRatio: 0.5 },  // chip shows when 0 stored, energy < 50% of next cost, fill >= 39

    INPUT: {
      tapMaxDist: 10, tapMaxMs: 300,
      swipeMinFrac: 0.12, swipeMinPx: 32,       // slow swipe: >= max(12% of board css width, 32 css px)
      flickMinVel: 0.8, flickMinPx: 32,         // fast flick: >= 0.8 css px/ms and >= 32 css px
      axisRatio: 1.4, disarmFrac: 0.6,
      rubberBandFactor: 0.25, rubberBandMaxPx: 12,
      dragLiftPx: 56,                           // piece bottom edge this far above the finger (logical px)
      trayDragReachPx: 12                       // presses this far above the tray still start a drag
    },

    ANIM: {
      pickupMs: 90, snapMs: 60, bumpMs: 90, returnMs: 180, scorePopMs: 500,
      clearFlashMs: 50, clearPopMs: 160, clearStaggerMs: 12, clearStaggerMaxMs: 300,
      refillMs: 160, refillStaggerMs: 50,
      tiltArrowFlashMs: 80, tiltJoltMs: 50, tiltJoltBackMs: 120, tiltJoltPx: 8,
      slideMsPerCell: 40, slideMinMs: 80, slideMaxMs: 260, landSquashMs: 70,
      lineFlashMs: 80, linePopMs: 160, linePopStaggerMs: 40,
      lockMinMs: 480, lockMaxMs: 700, lockBigMaxMs: 900,
      bannerInMs: 120, bannerHoldMs: 600, bannerOutMs: 200,
      shakePx: 2, shakeMs: 80, nudgePx: 6, gaugeShakeMs: 200,
      confettiMs: 1200, gameOverDimMs: 300, gameOverPieceShakeMs: 120
    },

    FX: { particleMax: 300, perClearedCell: 6, perClearCap: 96, maxDpr: 2, lowEndDpr: 1.5, slowFrameMs: 24, maxVoices: 12 },

    ADS: {
      banner: { unlockAtGameOver: 1, gapPx: 24, retryBackoffSec: [30, 60, 120, 300], minViewportHeight: 600 },
      interstitial: {
        minLifetimeGameOvers: 2, minInstallAgeMin: 8, minSessionAgeSec: 90, skipFirstGameOverOfSession: true,
        everyNGameOvers: 3, minGapSec: 180, minGameDurationSec: 60, minPiecesPlaced: 10,
        skipIfRewardedWatchedThisGame: true, maxPerSession: 4, maxPerDay: 8, expireAfterMin: 55,
        tapToShowDelayMs: 400, loadBackoffSec: [15, 30, 60, 120, 300]
      },
      rewarded: { showWatchdogSec: 60, pendingRewardGraceMs: 3000, loadWaitMs: 3000 },
      sdk: { maxAdContentRating: 'ParentalGuidance', npa: false, immersiveMode: false },
      ensureReadyThrottleSec: 60
    },

    SHARE: {
      web: 'https://chungtr9527.github.io/sandslide/',
      play: 'https://play.google.com/store/apps/details?id=io.github.chungtr9527.sandslide'
    },
    DAILY_EPOCH: '2026-11-01',
    CONTACT_EMAIL: 'REPLACE@example.com',
    DEVELOPER_NAME: 'REPLACE',
    STORAGE_PREFIX: 'sandslide.',

    UNLOCKS: { paletteScores: [1000, 2500, 5000, 10000], paletteDays: [7, 30] },

    PALETTE: {
      bg: '#0F1233', board: '#1A1F4D', empty: '#0B0E2B', grid: '#2A3170',
      blocks: ['#E7AB4F', '#64CDFF', '#0AAC7F', '#F5F619', '#5476FC', '#EE4200', '#DC6BA7', '#E9EEF9'],
      accent: '#FFC857', accent2: '#FFF3C4', danger: '#FF5C5C', text: '#F4F5FA', text2: '#A9AECF', ghost: '#FFFFFF'
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
