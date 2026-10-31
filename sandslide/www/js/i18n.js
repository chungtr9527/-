// Strings and language selection for en / zh-TW. Pure: no DOM, no navigator (language tags are passed in), no Date.
// Terminology: the resource/action is "Tilt" / 「翻轉」; the celebration is "SANDSLIDE ×n!" / 「流沙 ×n！」;
// the daily mode is "Daily Slide" / 「每日流沙」; the game is "Sandslide" / 「流沙方塊」; rescue = 救援; meter/energy = 能量.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var EN = {
    // --- main menu ---
    'menu.play': 'Play',
    'menu.continue': 'Continue',
    'menu.newGame': 'New game',
    'menu.daily': 'Daily Slide',
    'menu.help': 'How to play',
    'menu.settings': 'Settings',
    'menu.stats': 'Stats',
    'menu.best': 'Best',
    'menu.todayBest': "Today's best",
    'menu.abandonConfirm': 'Abandon the current game?',
    'menu.tagline': 'Tilt the board. Blocks slide like sand.',

    // --- in-game HUD ---
    'hud.score': 'Score',
    'hud.best': 'Best',
    'hud.combo': 'Combo ×{n}',
    'hud.nextTilt': 'Next Tilt: {n}',
    'hud.max': 'MAX',
    'hud.tiltReady': 'Tilt ready!',
    'hud.pause': 'Pause',
    'hud.hand': 'Hand {n}/{total}',

    // --- tilt prompts ---
    'tilt.needTilt': 'No room — tilt toward a ✓!',
    'tilt.noHelp': 'Even a tilt can’t make room…',
    'tilt.arrowHint': '▼2 = tilting down clears 2 lines',
    'tilt.haveTilt': 'You have a Tilt — try swiping!',
    'tilt.banner': 'SANDSLIDE ×{n}!',
    'tilt.allClear': 'Board clear!',
    'tilt.noop': 'Already packed!',

    // --- tutorial ---
    'tut.title': 'How to play',
    'tut.step1': 'Fill a line to clear it',
    'tut.step2': 'Blocks fill the Tilt meter',
    'tut.step3': 'Swipe down!',
    'tut.skip': 'Skip',
    'tut.done': 'That’s it — play!',

    // --- game over / results ---
    'over.title': 'No room left!',
    'over.dailyDone': 'Daily complete!',
    'over.score': 'Score',
    'over.best': 'Best',
    'over.newBest': 'New best!',
    'over.bestTilt': 'Best tilt: {n} lines',
    'over.bestCombo': 'Longest combo ×{n}',
    'over.playAgain': 'Play again',
    'over.home': 'Home',
    'over.share': 'Share',
    'over.rescueTitle': 'Rescue?',
    'over.rescueFree': 'Free rescue (first time)',
    'over.rescueAd': 'Watch ad to rescue',
    'over.rescueDesc': 'Clears the 2 fullest rows + 2 columns, +1 Tilt, new pieces',
    'over.noAd': 'No ad available right now',
    'over.adNotFinished': 'Ad not finished — no rescue',
    'over.rescued': 'Rescued!',
    'over.noThanks': 'No thanks',
    'over.hands': 'Hands {n}/{total}',

    // --- "+1 Tilt" rewarded chip ---
    'chip.outOfEnergy': 'Out of energy ▸ Watch ad for +1 Tilt',
    'chip.sheetTitle': 'Refill a Tilt?',
    'chip.sheetBody': 'Watch a short ad to get 1 Tilt (once per game)',
    'chip.watch': 'Watch ad',
    'chip.gained': '+1 Tilt!',

    // --- Daily Slide ---
    'daily.title': 'Daily Slide',
    'daily.number': 'Daily #{n}',
    'daily.reminder': 'One official score per day. No rescue.',
    'daily.practice': 'Practice (not scored)',
    'daily.done': 'Done for today',
    'daily.streak': 'Streak: {n} days',
    'daily.bestStreak': 'Best streak: {n}',
    'daily.calendar': 'Last 30 days',
    'daily.play': 'Play today’s',
    'daily.notToday': 'Past puzzle — practice only',
    'daily.shareText': 'Sandslide Daily #{n} · {score} · {hands}/{total} hands · best tilt {lines} lines\n{url}',

    // --- settings ---
    'settings.title': 'Settings',
    'settings.sound': 'Sound',
    'settings.haptics': 'Vibration',
    'settings.reducedMotion': 'Reduce motion',
    'settings.largeText': 'Large text',
    'settings.leftHanded': 'Left-handed',
    'settings.language': 'Language',
    'settings.langAuto': 'Auto',
    'settings.privacy': 'Privacy settings',
    'settings.privacyPolicy': 'Privacy policy',
    'settings.replayTutorial': 'Replay tutorial',
    'settings.version': 'Version {v}',
    'settings.palette': 'Board colours',
    'settings.locked': 'Locked',
    'settings.unlockScore': 'Best score {n}',
    'settings.unlockDays': '{n} play days',
    'settings.back': 'Back',
    'settings.on': 'On',
    'settings.off': 'Off',

    // --- help ---
    'help.title': 'How to play',
    'help.rules': 'Drag the three pieces onto the 8×8 board; fill a whole row or column to clear it. Placing blocks fills your Tilt meter — when it’s full, swipe the board and every block slides to that side, clearing any lines that fill up; you lose when nothing fits and you have no Tilt left.',
    'help.tiltTitle': 'Tilt',
    'help.tiltBody': 'The number on an arrow is how many lines that tilt will clear; a ✓ means one of your pieces will fit afterwards.\n' +
      'Opposite directions always clear the same number of lines — only the side the blocks pile up on differs. ' +
      'A second tilt right after the first never clears a line, so place something first. ' +
      'Even a 0-line tilt removes every gap, which can save a jammed board.',
    'help.scoringTitle': 'Scoring',
    'help.scoringBody': '+1 point per cell placed. Clearing 1–7 lines in one move scores 10 / 30 / 60 / 100 / 150 / 210 / 280, multiplied by your combo.\n' +
      'Your combo rises by 1 with every clearing move and survives a single miss. Clearing the whole board adds +500.',
    'help.fairTitle': 'Fair play promise',
    'help.fairBody': 'Fair play promise: every game starts from a fixed random seed, and the pieces you get come only from that sequence. Your score, your streak, your high score and ads never change which pieces appear. One exception: if none of the three pieces fits and you have no Tilt stored, the hand is silently redrawn up to 3 times.',
    'help.privacyTitle': 'Privacy & ads',
    'help.privacyBody': 'Ads are served by Google AdMob, which may use your device’s advertising ID. No accounts, no sign-in: your scores, streaks and stats stay on this device.\n' +
      'See the privacy policy for details, or change your ad privacy options in Settings.',

    // --- stats ---
    'stats.title': 'Stats',
    'stats.games': 'Games',
    'stats.placements': 'Pieces placed',
    'stats.tilts': 'Tilts',
    'stats.lines': 'Lines cleared',
    'stats.bestScore': 'Best score',
    'stats.bestTilt': 'Best tilt (lines)',
    'stats.bestCombo': 'Best combo',
    'stats.allClears': 'Board clears',
    'stats.days': 'Play days',
    'stats.copy': 'Copy diagnostics',
    'stats.copied': 'Copied!',

    // --- share ---
    'share.title': 'Sandslide',
    'share.beatMe': 'Beat my score!',
    'share.text': 'I scored {score} in Sandslide — tilt the board, blocks slide like sand. {url}',
    'share.saved': 'Image saved',
    'share.copied': 'Text copied',

    // --- common ---
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading…',
    'common.offline': 'You’re offline',
    'common.resume': 'Resume',
    'common.quit': 'Quit to menu',
    'common.paused': 'Paused',
    'common.unsupported': 'This browser is too old to run Sandslide.',

    // --- screen reader ---
    'a11y.tiltReady': 'Tilt ready',
    'a11y.noMoves': 'No moves',
    'a11y.score': 'Score {n}',
    'a11y.newBest': 'New best score',

    // --- board palettes (default + 6 unlockable hue shifts) ---
    'palette.0': 'Dune',
    'palette.1': 'Oasis',
    'palette.2': 'Jungle',
    'palette.3': 'Reef',
    'palette.4': 'Glacier',
    'palette.5': 'Twilight',
    'palette.6': 'Nebula'
  };

  var ZH = {
    // --- 主選單 ---
    'menu.play': '開始遊戲',
    'menu.continue': '繼續遊戲',
    'menu.newGame': '新遊戲',
    'menu.daily': '每日流沙',
    'menu.help': '玩法說明',
    'menu.settings': '設定',
    'menu.stats': '統計',
    'menu.best': '最高分',
    'menu.todayBest': '今日最佳',
    'menu.abandonConfirm': '放棄目前這局？',
    'menu.tagline': '翻轉棋盤，方塊像流沙一樣滑落。',

    // --- 遊戲中 HUD ---
    'hud.score': '分數',
    'hud.best': '最高分',
    'hud.combo': '連擊 ×{n}',
    'hud.nextTilt': '下次翻轉：{n}',
    'hud.max': 'MAX',
    'hud.tiltReady': '可以翻轉了！',
    'hud.pause': '暫停',
    'hud.hand': '手牌 {n}/{total}',

    // --- 翻轉提示 ---
    'tilt.needTilt': '沒地方放了，往有 ✓ 的方向翻！',
    'tilt.noHelp': '翻轉也救不了這局…',
    'tilt.arrowHint': '▼2＝往下倒會消 2 條線',
    'tilt.haveTilt': '你有翻轉可用，滑動棋盤試試！',
    'tilt.banner': '流沙 ×{n}！',
    'tilt.allClear': '棋盤全清！',
    'tilt.noop': '方塊都靠邊了！',

    // --- 教學 ---
    'tut.title': '玩法說明',
    'tut.step1': '填滿一線就消除',
    'tut.step2': '放方塊，存能量',
    'tut.step3': '往下滑！',
    'tut.skip': '跳過',
    'tut.done': '就這麼簡單，開始吧！',

    // --- 結算 ---
    'over.title': '沒地方放了！',
    'over.dailyDone': '今日挑戰完成！',
    'over.score': '分數',
    'over.best': '最高分',
    'over.newBest': '新紀錄！',
    'over.bestTilt': '最佳翻轉：{n} 線',
    'over.bestCombo': '最長連擊 ×{n}',
    'over.playAgain': '再玩一次',
    'over.home': '回主畫面',
    'over.share': '分享',
    'over.rescueTitle': '要救援嗎？',
    'over.rescueFree': '免費救援（首次）',
    'over.rescueAd': '看廣告救援',
    'over.rescueDesc': '清除最滿的 2 行＋2 列，+1 翻轉，換新方塊',
    'over.noAd': '目前沒有可用的廣告',
    'over.adNotFinished': '廣告未看完，未獲得救援',
    'over.rescued': '救援成功！',
    'over.noThanks': '不用了',
    'over.hands': '手牌 {n}/{total}',

    // --- 「+1 翻轉」獎勵晶片 ---
    'chip.outOfEnergy': '能量用完了 ▸ 看廣告 +1 次翻轉',
    'chip.sheetTitle': '補一次翻轉？',
    'chip.sheetBody': '看一段短廣告，獲得 1 次翻轉（每局限一次）',
    'chip.watch': '看廣告',
    'chip.gained': '+1 翻轉！',

    // --- 每日流沙 ---
    'daily.title': '每日流沙',
    'daily.number': '第 {n} 期',
    'daily.reminder': '每天只有一次正式成績，沒有救援。',
    'daily.practice': '不計分練習',
    'daily.done': '今日已完成',
    'daily.streak': '連續 {n} 天',
    'daily.bestStreak': '最長連續：{n} 天',
    'daily.calendar': '最近 30 天',
    'daily.play': '挑戰今日',
    'daily.notToday': '之前的題目，只能練習',
    'daily.shareText': '流沙方塊 每日流沙 #{n} · {score} 分 · {hands}/{total} 手 · 最大翻轉 {lines} 線\n{url}',

    // --- 設定 ---
    'settings.title': '設定',
    'settings.sound': '音效',
    'settings.haptics': '震動',
    'settings.reducedMotion': '減少動態效果',
    'settings.largeText': '大字體',
    'settings.leftHanded': '左手模式',
    'settings.language': '語言',
    'settings.langAuto': '自動',
    'settings.privacy': '隱私設定',
    'settings.privacyPolicy': '隱私權政策',
    'settings.replayTutorial': '重看教學',
    'settings.version': '版本 {v}',
    'settings.palette': '棋盤配色',
    'settings.locked': '未解鎖',
    'settings.unlockScore': '最高分達 {n}',
    'settings.unlockDays': '遊玩滿 {n} 天',
    'settings.back': '返回',
    'settings.on': '開',
    'settings.off': '關',

    // --- 說明 ---
    'help.title': '玩法說明',
    'help.rules': '把三個方塊拖到 8×8 棋盤上，排滿一整行或一整列就消除。放方塊會存「翻轉」能量，存滿後滑動棋盤，所有方塊會倒向那一邊、排滿的線全部消除；方塊都放不下又沒有翻轉可用時，遊戲結束。',
    'help.tiltTitle': '翻轉',
    'help.tiltBody': '箭頭上的數字＝往那邊翻會消幾條線，✓ 代表翻完後手上有方塊放得下。\n' +
      '相反方向消的線數永遠一樣，差別只在方塊最後堆在哪一邊。' +
      '連翻兩次（中間沒放方塊）第二次一定消 0 線，先放個方塊再翻。' +
      '就算消 0 線，翻轉也會把所有空隙清掉，卡住時常常是對的選擇。',
    'help.scoringTitle': '計分',
    'help.scoringBody': '放方塊每格 +1 分。一次消 1～7 線：10 / 30 / 60 / 100 / 150 / 210 / 280 分，再乘上連擊倍數。\n' +
      '每次有消線的動作連擊 +1，失誤一次不會斷；整個棋盤清空再加 500 分。',
    'help.fairTitle': '公平承諾',
    'help.fairBody': '公平承諾：每一局都從固定的隨機種子開始，你拿到的方塊只來自這個序列。你的分數、連勝、最高分或廣告都不會改變出現的方塊。唯一例外：三個方塊都放不下、而且沒有存翻轉時，會靜默重抽最多 3 次。',
    'help.privacyTitle': '隱私與廣告',
    'help.privacyBody': '廣告由 Google AdMob 提供，可能會使用你裝置的廣告 ID。不需要帳號、不用登入，分數、連續天數和統計都只存在這台裝置上。\n' +
      '詳細內容請看隱私權政策，廣告隱私選項可以在設定裡調整。',

    // --- 統計 ---
    'stats.title': '統計',
    'stats.games': '遊戲局數',
    'stats.placements': '放置方塊數',
    'stats.tilts': '翻轉次數',
    'stats.lines': '消除線數',
    'stats.bestScore': '最高分',
    'stats.bestTilt': '單次翻轉最多線',
    'stats.bestCombo': '最長連擊',
    'stats.allClears': '全清次數',
    'stats.days': '遊玩天數',
    'stats.copy': '複製診斷資料',
    'stats.copied': '已複製！',

    // --- 分享 ---
    'share.title': '流沙方塊',
    'share.beatMe': '你能贏我嗎？',
    'share.text': '我在《流沙方塊》拿到 {score} 分！翻轉棋盤，方塊像流沙一樣滑落。{url}',
    'share.saved': '圖片已儲存',
    'share.copied': '文字已複製',

    // --- 共用 ---
    'common.ok': '確定',
    'common.cancel': '取消',
    'common.close': '關閉',
    'common.loading': '載入中…',
    'common.offline': '目前離線中',
    'common.resume': '繼續',
    'common.quit': '回主畫面',
    'common.paused': '暫停中',
    'common.unsupported': '這個瀏覽器太舊了，沒辦法玩流沙方塊。',

    // --- 螢幕閱讀器 ---
    'a11y.tiltReady': '翻轉就緒',
    'a11y.noMoves': '沒地方放了',
    'a11y.score': '分數 {n}',
    'a11y.newBest': '新的最高分',

    // --- 棋盤配色（預設 + 6 組可解鎖） ---
    'palette.0': '沙丘',
    'palette.1': '綠洲',
    'palette.2': '叢林',
    'palette.3': '珊瑚礁',
    'palette.4': '冰川',
    'palette.5': '暮色',
    'palette.6': '星雲'
  };

  var AVAILABLE = ['en', 'zh-TW'];
  var STRINGS = { en: EN, 'zh-TW': ZH };
  var hasOwn = Object.prototype.hasOwnProperty;
  var ZH_TAG = /^(zh|cmn|yue|nan|hak)(?:[-_]|$)/; // any Chinese tag (zh-TW, zh-Hant, zh-HK, zh-MO, zh-CN, zh, zh_TW, …) -> zh-TW
  var EN_TAG = /^en(?:[-_]|$)/;

  // BCP 47 / Java-style language tag -> supported language code, or null when not recognised.
  function normalize(tag) {
    if (typeof tag !== 'string') return null;
    var s = tag.trim().toLowerCase();
    if (!s) return null;
    if (ZH_TAG.test(s)) return 'zh-TW';
    if (EN_TAG.test(s)) return 'en';
    return null;
  }

  // detect(navigatorLanguages, override): override 'en' | 'zh-TW' wins; 'auto' (or anything unrecognised) falls back to the
  // first recognised entry of navigatorLanguages (array, array-like or a single string); everything else -> 'en'.
  function detect(languages, override) {
    var forced = override === 'auto' ? null : normalize(override);
    if (forced) return forced;
    var list = typeof languages === 'string' ? [languages] : languages;
    if (list && typeof list.length === 'number') {
      for (var i = 0; i < list.length; i++) {
        var l = normalize(list[i]);
        if (l) return l;
      }
    }
    return 'en';
  }

  // Unsupported / 'auto' values are ignored (no-op); returns the language now in use.
  function setLang(lang) {
    var l = normalize(lang);
    if (l) I18N.lang = l;
    return I18N.lang;
  }

  function lookup(key) {
    var table = hasOwn.call(STRINGS, I18N.lang) ? STRINGS[I18N.lang] : EN;
    if (hasOwn.call(table, key)) return table[key];
    if (hasOwn.call(EN, key)) return EN[key];
    return key;
  }

  // t(key, params): {name}-style placeholders. params may be an object ({n: 3}) or a bare value, which fills {n}.
  // Placeholders without a value are left as-is. Missing key -> en fallback -> the key itself.
  function t(key, params) {
    if (key == null) return '';
    var s = lookup(String(key));
    if (params == null) return s;
    var p = typeof params === 'object' ? params : { n: params };
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return hasOwn.call(p, name) && p[name] != null ? String(p[name]) : m;
    });
  }

  function htmlLang() { return I18N.lang === 'zh-TW' ? 'zh-Hant-TW' : 'en'; }

  var I18N = {
    available: AVAILABLE,
    strings: STRINGS,
    lang: 'en',
    detect: detect,
    setLang: setLang,
    t: t,
    htmlLang: htmlLang,
    fontStack: 'system-ui, "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif'
  };
  TB.I18N = I18N;
})(typeof globalThis !== 'undefined' ? globalThis : window);
