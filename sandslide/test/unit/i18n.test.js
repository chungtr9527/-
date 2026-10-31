'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
require('../../www/js/i18n.js');
const I = TB.I18N;

// Every key the contract (docs/CONTRACTS.md, "TB.I18N") requires.
const REQUIRED = `
menu.play menu.continue menu.newGame menu.daily menu.help menu.settings menu.stats menu.best menu.todayBest menu.abandonConfirm menu.tagline
hud.score hud.best hud.combo hud.nextTilt hud.max hud.tiltReady hud.pause hud.hand
tilt.needTilt tilt.noHelp tilt.arrowHint tilt.haveTilt tilt.banner tilt.allClear tilt.noop
tut.title tut.step1 tut.step2 tut.step3 tut.skip tut.done
over.title over.dailyDone over.score over.best over.newBest over.bestTilt over.bestCombo over.playAgain over.home over.share over.rescueTitle
over.rescueFree over.rescueAd over.rescueDesc over.noAd over.adNotFinished over.rescued over.noThanks over.hands
chip.outOfEnergy chip.sheetTitle chip.sheetBody chip.watch chip.gained
daily.title daily.number daily.reminder daily.practice daily.done daily.streak daily.bestStreak daily.calendar daily.play daily.notToday daily.shareText
settings.title settings.sound settings.haptics settings.reducedMotion settings.largeText settings.leftHanded settings.language settings.langAuto
settings.privacy settings.privacyPolicy settings.replayTutorial settings.version settings.palette settings.locked settings.unlockScore settings.unlockDays
settings.back settings.on settings.off
help.title help.rules help.tiltTitle help.tiltBody help.scoringTitle help.scoringBody help.fairTitle help.fairBody help.privacyTitle help.privacyBody
stats.title stats.games stats.placements stats.tilts stats.lines stats.bestScore stats.bestTilt stats.bestCombo stats.allClears stats.days stats.copy stats.copied
share.title share.beatMe share.text share.saved share.copied
common.ok common.cancel common.close common.loading common.offline common.resume common.quit common.paused common.unsupported
a11y.tiltReady a11y.noMoves a11y.score a11y.newBest
palette.0 palette.1 palette.2 palette.3 palette.4 palette.5 palette.6
`.split(/\s+/).filter(Boolean);

// Placeholders the contract names explicitly.
const PLACEHOLDERS = {
  'hud.combo': ['n'], 'hud.nextTilt': ['n'], 'hud.hand': ['n', 'total'],
  'tilt.banner': ['n'],
  'over.bestTilt': ['n'], 'over.bestCombo': ['n'], 'over.hands': ['n', 'total'],
  'daily.number': ['n'], 'daily.streak': ['n'], 'daily.bestStreak': ['n'],
  'daily.shareText': ['n', 'score', 'hands', 'total', 'lines', 'url'],
  'settings.version': ['v'], 'settings.unlockScore': ['n'], 'settings.unlockDays': ['n'],
  'share.text': ['score', 'url'],
  'a11y.score': ['n']
};

// Button / HUD labels that must stay short on a 360 px-wide canvas (zh-TW: at most 6 CJK characters).
const SHORT_ZH = `
menu.play menu.continue menu.newGame menu.daily menu.help menu.settings menu.stats menu.best menu.todayBest
hud.score hud.best hud.max hud.tiltReady hud.pause
tut.skip over.playAgain over.home over.share over.noThanks over.rescueAd over.score over.best over.newBest
chip.watch chip.gained daily.title daily.play daily.done daily.practice
settings.title settings.sound settings.haptics settings.reducedMotion settings.largeText settings.leftHanded settings.language settings.langAuto
settings.privacy settings.privacyPolicy settings.replayTutorial settings.palette settings.locked settings.back settings.on settings.off
help.title stats.title stats.copy stats.copied
common.ok common.cancel common.close common.loading common.resume common.quit common.paused
`.split(/\s+/).filter(Boolean);

const placeholdersOf = (s) => Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort();
const withLang = (lang, fn) => { const prev = I.lang; I.setLang(lang); try { return fn(); } finally { I.setLang(prev); } };

test('exposes exactly the contract API', () => {
  assert.deepEqual(I.available, ['en', 'zh-TW']);
  assert.deepEqual(Object.keys(I.strings).sort(), ['en', 'zh-TW']);
  assert.equal(I.lang, 'en');
  for (const fn of ['detect', 'setLang', 't', 'htmlLang']) assert.equal(typeof I[fn], 'function', fn);
  assert.equal(I.fontStack, 'system-ui, "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif');
});

test('both tables contain every required key and nothing differs between them', () => {
  const en = Object.keys(I.strings.en).sort(), zh = Object.keys(I.strings['zh-TW']).sort();
  const missingEn = REQUIRED.filter((k) => !(k in I.strings.en));
  const missingZh = REQUIRED.filter((k) => !(k in I.strings['zh-TW']));
  assert.deepEqual(missingEn, [], 'en is missing required keys');
  assert.deepEqual(missingZh, [], 'zh-TW is missing required keys');
  assert.deepEqual(zh, en, 'key sets differ between en and zh-TW');
  assert.equal(new Set(REQUIRED).size, REQUIRED.length, 'REQUIRED list has duplicates');
});

test('no empty strings, no untranslated leftovers, identical placeholders in both languages', () => {
  for (const lang of I.available) {
    for (const [k, v] of Object.entries(I.strings[lang])) {
      assert.equal(typeof v, 'string', `${lang}:${k} is not a string`);
      assert.ok(v.trim().length > 0, `${lang}:${k} is empty`);
      assert.equal(v, v.trim(), `${lang}:${k} has leading/trailing whitespace`);
    }
  }
  for (const k of Object.keys(I.strings.en)) {
    assert.deepEqual(placeholdersOf(I.strings['zh-TW'][k]), placeholdersOf(I.strings.en[k]), `placeholders differ for ${k}`);
    assert.ok(!/[一-鿿]/.test(I.strings.en[k]), `en:${k} contains CJK text`);
    assert.ok(!/\bTilt\b/.test(I.strings['zh-TW'][k]), `zh-TW:${k} still says "Tilt" instead of 翻轉`);
  }
  for (const [k, names] of Object.entries(PLACEHOLDERS)) {
    assert.deepEqual(placeholdersOf(I.strings.en[k]), names.slice().sort(), `en:${k} placeholders`);
  }
});

test('zh-TW button and HUD labels stay short', () => {
  for (const k of SHORT_ZH) {
    const v = I.strings['zh-TW'][k];
    assert.ok(Array.from(v).length <= 6, `zh-TW:${k} "${v}" is longer than 6 characters`);
  }
});

test('exact contract texts and consistent terminology', () => {
  const en = I.strings.en, zh = I.strings['zh-TW'];
  assert.equal(en['help.rules'], 'Drag the three pieces onto the 8×8 board; fill a whole row or column to clear it. Placing blocks fills your Tilt meter — when it’s full, swipe the board and every block slides to that side, clearing any lines that fill up; you lose when nothing fits and you have no Tilt left.');
  assert.equal(zh['help.rules'], '把三個方塊拖到 8×8 棋盤上，排滿一整行或一整列就消除。放方塊會存「翻轉」能量，存滿後滑動棋盤，所有方塊會倒向那一邊、排滿的線全部消除；方塊都放不下又沒有翻轉可用時，遊戲結束。');
  assert.equal(en['help.fairBody'], 'Fair play promise: every game starts from a fixed random seed, and the pieces you get come only from that sequence. Your score, your streak, your high score and ads never change which pieces appear. One exception: if none of the three pieces fits and you have no Tilt stored, the hand is silently redrawn up to 3 times.');
  assert.equal(zh['help.fairBody'], '公平承諾：每一局都從固定的隨機種子開始，你拿到的方塊只來自這個序列。你的分數、連勝、最高分或廣告都不會改變出現的方塊。唯一例外：三個方塊都放不下、而且沒有存翻轉時，會靜默重抽最多 3 次。');
  assert.equal(en['tilt.banner'], 'SANDSLIDE ×{n}!');
  assert.equal(zh['tilt.banner'], '流沙 ×{n}！');
  assert.equal(en['menu.daily'], 'Daily Slide');
  assert.equal(zh['menu.daily'], '每日流沙');
  assert.equal(zh['daily.title'], '每日流沙');
  assert.equal(en['share.title'], 'Sandslide');
  assert.equal(zh['share.title'], '流沙方塊');
  assert.equal(zh['over.rescueAd'], '看廣告救援');
  assert.equal(zh['over.playAgain'], '再玩一次');
  assert.equal(zh['over.home'], '回主畫面');
  assert.equal(zh['menu.tagline'], '翻轉棋盤，方塊像流沙一樣滑落。');
  for (const k of ['help.tiltBody', 'help.scoringBody', 'help.privacyBody']) {
    assert.ok(en[k].includes('\n') && zh[k].includes('\n'), `${k} should have a paragraph break`);
  }
  assert.ok(en['daily.shareText'].includes('\n{url}') && zh['daily.shareText'].includes('\n{url}'));
  assert.ok(/翻轉/.test(zh['help.tiltBody']) && /翻轉/.test(zh['hud.nextTilt']) && /翻轉/.test(zh['chip.gained']));
});

test('t() substitutes placeholders, leaves unknown ones alone and accepts a bare value for {n}', () => {
  assert.equal(I.t('hud.combo', { n: 3 }), 'Combo ×3');
  assert.equal(I.t('hud.hand', { n: 2, total: 20 }), 'Hand 2/20');
  assert.equal(I.t('hud.hand', { n: 0, total: 20 }), 'Hand 0/20');
  assert.equal(I.t('hud.hand', { n: 2 }), 'Hand 2/{total}');
  assert.equal(I.t('a11y.score', 120), 'Score 120');
  assert.equal(I.t('hud.combo'), 'Combo ×{n}');
  assert.equal(I.t('settings.version', { v: '0.1.0', extra: 'ignored' }), 'Version 0.1.0');
  assert.equal(I.t('daily.shareText', { n: 12, score: '4,230', hands: 20, total: 20, lines: 3, url: 'https://x.y/' }),
    'Sandslide Daily #12 · 4,230 · 20/20 hands · best tilt 3 lines\nhttps://x.y/');
  withLang('zh-TW', () => {
    assert.equal(I.t('tilt.banner', { n: 4 }), '流沙 ×4！');
    assert.equal(I.t('hud.nextTilt', { n: 75 }), '下次翻轉：75');
  });
});

test('t() falls back to en, then to the key itself', () => {
  assert.equal(I.t('nope.missing'), 'nope.missing');
  assert.equal(I.t('nope.missing', { n: 1 }), 'nope.missing');
  assert.equal(I.t(''), '');
  assert.equal(I.t(null), '');
  I.strings.en['test.enOnly'] = 'EN only {n}';
  try {
    withLang('zh-TW', () => {
      assert.equal(I.t('test.enOnly', { n: 7 }), 'EN only 7');
      assert.equal(I.t('menu.play'), '開始遊戲');
      assert.equal(I.t('nope.missing'), 'nope.missing');
    });
  } finally {
    delete I.strings.en['test.enOnly'];
  }
  // a language that is not in the tables (set by direct assignment) reads the en table
  const prev = I.lang;
  I.lang = 'fr';
  try { assert.equal(I.t('menu.play'), 'Play'); assert.equal(I.htmlLang(), 'en'); } finally { I.lang = prev; }
});

test('detect(): any Chinese tag -> zh-TW, everything else -> en', () => {
  for (const tag of ['zh-TW', 'zh-Hant', 'zh-HK', 'zh-MO', 'zh-CN', 'zh', 'zh-Hant-TW', 'zh_TW', 'ZH-tw', 'zh-Hans-CN']) {
    assert.equal(I.detect([tag]), 'zh-TW', tag);
    assert.equal(I.detect([tag], 'auto'), 'zh-TW', tag + ' (auto)');
  }
  for (const tag of ['en', 'en-US', 'en-GB', 'ja-JP', 'ko', 'fr-FR', 'de', 'es-419', 'th', '']) {
    assert.equal(I.detect([tag]), 'en', JSON.stringify(tag));
  }
  assert.equal(I.detect([]), 'en');
  assert.equal(I.detect(undefined), 'en');
  assert.equal(I.detect(null, 'auto'), 'en');
  assert.equal(I.detect('zh-TW'), 'zh-TW');          // a single navigator.language string also works
  assert.equal(I.detect(['ja-JP', 'zh-TW', 'en-US']), 'zh-TW'); // first recognised entry wins
  assert.equal(I.detect(['ja-JP', 'en-US', 'zh-TW']), 'en');
  assert.equal(I.detect([undefined, 42, 'zh-HK']), 'zh-TW');    // junk entries are skipped
});

test('detect(): an explicit override beats the navigator languages; auto/invalid overrides do not', () => {
  assert.equal(I.detect(['zh-TW'], 'en'), 'en');
  assert.equal(I.detect(['en-US'], 'zh-TW'), 'zh-TW');
  assert.equal(I.detect([], 'zh-TW'), 'zh-TW');
  assert.equal(I.detect(['zh-TW'], 'auto'), 'zh-TW');
  assert.equal(I.detect(['zh-TW'], undefined), 'zh-TW');
  assert.equal(I.detect(['zh-TW'], null), 'zh-TW');
  assert.equal(I.detect(['zh-TW'], 'klingon'), 'zh-TW');
  assert.equal(I.detect(['en-US'], 'zh-Hant'), 'zh-TW');   // overrides are normalised like tags
});

test('setLang() and htmlLang()', () => {
  const prev = I.lang;
  try {
    assert.equal(I.setLang('zh-TW'), 'zh-TW');
    assert.equal(I.lang, 'zh-TW');
    assert.equal(I.htmlLang(), 'zh-Hant-TW');
    assert.equal(I.t('menu.play'), '開始遊戲');
    assert.equal(I.setLang('xx'), 'zh-TW');     // unsupported: no-op
    assert.equal(I.setLang('auto'), 'zh-TW');   // 'auto' is not a language: no-op
    assert.equal(I.setLang(undefined), 'zh-TW');
    assert.equal(I.setLang('en'), 'en');
    assert.equal(I.htmlLang(), 'en');
    assert.equal(I.t('menu.play'), 'Play');
    assert.equal(I.setLang('zh-HK'), 'zh-TW');  // any zh* maps to zh-TW
  } finally {
    I.setLang(prev);
  }
});
