// Share: the result card (an offscreen 1080x1350 canvas, or 1080x1920 with { story: true }) and the share flow.
// Native: PNG -> Filesystem.writeFile(CACHE) -> Share.share({ files }); web: Web Share Level 2 (files) when the
// browser can share files, else a PNG download plus the text on the clipboard; file://: download only.
// Platform module: may touch document / navigator / the bridge, must never throw and degrades to
// { ok: false, method: 'none' } when nothing is available (plain web, file://, Node unit tests).
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var FILE_NAME = 'sandslide.png';
  var CACHE_PATH = 'share/' + FILE_NAME;
  var N = 8;
  var hasOwn = Object.prototype.hasOwnProperty;

  // English fallbacks for the i18n keys used here (TB.I18N may be absent in unit tests or when i18n failed to load).
  var FALLBACK = {
    'share.title': 'Sandslide',
    'share.beatMe': 'Beat my score!',
    'share.text': 'I scored {score} in Sandslide — tilt the board, blocks slide like sand. {url}',
    'daily.shareText': 'Sandslide Daily #{n} · {score} · {hands}/{total} hands · best tilt {lines} lines\n{url}',
    'over.share': 'Share',
    'over.best': 'Best',
    'over.newBest': 'New best!',
    'over.bestTilt': 'Best tilt: {n} lines',
    'over.hands': 'Hands {n}/{total}'
  };
  // Copy that lives on the image itself (design strings, bilingual by card language rather than by i18n table).
  var CARD = {
    en: { classic: 'Classic', daily: 'Daily #{n}', tagline: 'Tilt the board. Blocks slide like sand.' },
    'zh-TW': { classic: '經典模式', daily: '每日流沙 第 {n} 期', tagline: '滑動翻轉，流沙般消除' }
  };
  var DEFAULT_PALETTE = {
    bg: '#0F1233', board: '#1A1F4D', empty: '#0B0E2B', grid: '#2A3170',
    blocks: ['#E7AB4F', '#64CDFF', '#0AAC7F', '#F5F619', '#5476FC', '#EE4200', '#DC6BA7', '#E9EEF9'],
    accent: '#FFC857', accent2: '#FFF3C4', danger: '#FF5C5C', text: '#F4F5FA', text2: '#A9AECF', ghost: '#FFFFFF'
  };
  var DEFAULT_FONT = 'system-ui, sans-serif';
  // Vertical plan (centre lines, px) of each variant. The story keeps its content inside the 250 px top / bottom
  // bands that story UIs cover.
  var LAYOUT = {
    card:  { w: 1080, h: 1350, header: 132, mode: 238, score: 356, scoreSize: 184, boardTop: 480, cell: 72, chips: 1168, tagline: 1240, url: 1296 },
    story: { w: 1080, h: 1920, header: 300, mode: 420, score: 545, scoreSize: 200, boardTop: 680, cell: 88, chips: 1498, tagline: 1580, url: 1636 }
  };
  var ZH_TAG = /^(zh|cmn|yue|nan|hak)(?:[-_]|$)/;

  function noop() {}
  function config() { return TB.Config || {}; }
  function shareUrl() { var S = config().SHARE; return (S && S.web) || 'https://chungtr9527.github.io/sandslide/'; }
  function dailyHands() { var R = config().RULES; return (R && R.daily && R.daily.hands) || 20; }
  function fontStack() {
    try { if (TB.I18N && typeof TB.I18N.fontStack === 'string' && TB.I18N.fontStack) return TB.I18N.fontStack; } catch (e) {}
    return DEFAULT_FONT;
  }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : 0; }
  // 4230 -> '4,230' (locale independent, so the text is identical on every device)
  function fmt(v) {
    var n = Math.round(num(v)), s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (n < 0 ? '-' : '') + s + out;
  }
  function template(s, p) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return p && hasOwn.call(p, k) && p[k] != null ? String(p[k]) : m; });
  }
  // 'zh-TW' | 'en' for the card copy; defaults to the current i18n language.
  function cardLang(lang) {
    var l = lang;
    try { if (!l && TB.I18N) l = TB.I18N.lang; } catch (e) {}
    return ZH_TAG.test(String(l || '').trim().toLowerCase()) ? 'zh-TW' : 'en';
  }
  function card(lang, key, params) { return template(CARD[cardLang(lang)][key], params); }

  // tr(key, params, lang): TB.I18N.t when available (an explicit lang picks that language's table directly, so the
  // text can be built for a language other than the current one), else the English fallback above.
  function tr(key, params, lang) {
    var s = null;
    try {
      var I = TB.I18N;
      if (I) {
        var code = typeof lang === 'string' && lang && typeof I.detect === 'function' ? I.detect([lang]) : lang;
        var table = code && I.strings && hasOwn.call(I.strings, code) ? I.strings[code] : null;
        if (table && hasOwn.call(table, key)) s = table[key];
        else if (typeof I.t === 'function') { var r = I.t(key, params); if (typeof r === 'string' && r !== key) return r; }
      }
    } catch (e) { s = null; }
    if (s == null) s = hasOwn.call(FALLBACK, key) ? FALLBACK[key] : key;
    return template(s, params);
  }

  // ---- environment ----------------------------------------------------------------------------------------------
  // Resolved on every call: TB.Platform and the Capacitor bridge may appear after this file is evaluated.
  function plugin(name) {
    try {
      if (TB.Platform && typeof TB.Platform.plugin === 'function') return TB.Platform.plugin(name) || null;
      var cap = g.Capacitor, p = cap && cap.Plugins ? cap.Plugins[name] : null;
      return p && (typeof p === 'object' || typeof p === 'function') ? p : null;
    } catch (e) { return null; }
  }
  function isFile() {
    try {
      if (TB.Platform && typeof TB.Platform.isFile === 'boolean') return TB.Platform.isFile;
      var l = g.location; return !!(l && l.protocol === 'file:');
    } catch (e) { return false; }
  }
  function nav() { try { var n = g.navigator; return n && typeof n === 'object' ? n : null; } catch (e) { return null; } }
  function doc() { try { var d = g.document; return d && typeof d.createElement === 'function' ? d : null; } catch (e) { return null; } }
  function isThenable(x) { return !!x && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function'; }
  function settle(p, onOk, onFail) {
    try { if (isThenable(p)) return p.then(onOk, onFail); } catch (e) { return onFail(e); }
    return onOk(p);
  }
  function result(ok, method) { return { ok: !!ok, method: method }; }

  function canShareFiles() {
    try {
      if (plugin('Share') && plugin('Filesystem')) return true;
      if (isFile()) return false;
      var n = nav();
      if (!n || typeof n.share !== 'function' || typeof n.canShare !== 'function' || typeof g.File !== 'function') return false;
      return !!n.canShare({ files: [new g.File([''], FILE_NAME, { type: 'image/png' })] });
    } catch (e) { return false; }
  }

  // ---- texts ---------------------------------------------------------------------------------------------------
  // dailyText({ number, score, hands, total, lines, url, lang }) -> 'Sandslide Daily #12 · 4,230 · 20/20 hands · best tilt 3 lines\n<url>'
  function dailyText(o) {
    o = o || {};
    var total = o.total != null ? num(o.total) : dailyHands();
    var hands = o.hands != null ? num(o.hands) : total;
    return tr('daily.shareText', { n: o.number != null ? o.number : '?', score: fmt(o.score), hands: hands, total: total,
      lines: num(o.lines), url: o.url || shareUrl() }, o.lang);
  }
  // scoreText({ score, url, lang }) -> 'I scored 4,230 in Sandslide — tilt the board, blocks slide like sand. <url>'
  function scoreText(o) {
    o = o || {};
    return tr('share.text', { score: fmt(o.score), url: o.url || shareUrl() }, o.lang);
  }

  // ---- card ----------------------------------------------------------------------------------------------------
  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function fontStr(size, weight, stack) { return (weight || 600) + ' ' + Math.round(size) + 'px ' + stack; }
  function measure(c, str, size) {
    try { var m = c.measureText(str); if (m && typeof m.width === 'number') return m.width; } catch (e) {}
    return String(str).length * size * 0.6;
  }
  function text(c, str, x, y, o) {
    c.font = fontStr(o.size, o.weight, o.font);
    c.fillStyle = o.color; c.textAlign = o.align || 'left'; c.textBaseline = 'middle';
    if (o.alpha != null) c.globalAlpha = o.alpha;
    if (o.maxWidth) c.fillText(str, x, y, o.maxWidth); else c.fillText(str, x, y);
    if (o.alpha != null) c.globalAlpha = 1;
  }
  // Largest font size <= size at which str fits in maxW.
  function fitSize(c, str, size, maxW, weight, stack) {
    for (var i = 0; i < 8; i++) {
      c.font = fontStr(size, weight, stack);
      if (measure(c, str, size) <= maxW) break;
      size = Math.floor(size * 0.88);
    }
    return size;
  }
  function paletteOf(p) {
    var base = Object.assign({}, DEFAULT_PALETTE, config().PALETTE || {});
    var out = Object.assign({}, base, p && typeof p === 'object' ? p : {});
    if (!out.blocks || typeof out.blocks.length !== 'number' || out.blocks.length < 1) out.blocks = base.blocks;
    return out;
  }
  function displayUrl(u) { return String(u).replace(/^https?:\/\//, '').replace(/\/+$/, ''); }
  function seeded(s) {
    try { if (TB.RNG && typeof TB.RNG.create === 'function') { var r = TB.RNG.create(s); return function () { return r.next(); }; } } catch (e) {}
    var x = 2166136261;
    for (var i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
    return function () { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  }
  // The board to draw: the real one when given, else a deterministic decorative pile (blocks settled bottom-left,
  // as after a tilt) so a card shared later from the menu still shows the game.
  function boardCells(board, o) {
    if (board && typeof board.length === 'number' && board.length === N * N) return board;
    var cells = [], i;
    for (i = 0; i < N * N; i++) cells.push(0);
    var rnd = seeded('sandslide-card:' + (o.dailyNumber != null ? 'd' + o.dailyNumber : 's' + fmt(o.score)));
    var h = 6;
    for (var col = 0; col < N; col++) {
      for (var k = 0; k < h; k++) cells[(N - 1 - k) * N + col] = 1 + Math.floor(rnd() * N);
      if (rnd() < 0.65) h = Math.max(1, h - 1);
    }
    return cells;
  }
  function drawBlock(c, x, y, size, col) {
    var gap = size * 0.07, r = size * 0.2, inner = size - 2 * gap;
    c.fillStyle = col; roundRect(c, x + gap, y + gap, inner, inner, r); c.fill();
    c.globalAlpha = 0.3; c.fillStyle = '#000000'; roundRect(c, x + gap, y + gap, inner, inner, r); c.fill(); c.globalAlpha = 1;   // shade
    c.fillStyle = col; roundRect(c, x + gap, y + gap, inner, inner - size * 0.08, r); c.fill();                                 // body
    c.globalAlpha = 0.28; c.fillStyle = '#FFFFFF'; roundRect(c, x + gap + size * 0.14, y + gap + size * 0.1, inner - size * 0.28, size * 0.14, size * 0.07); c.fill(); c.globalAlpha = 1; // gloss
  }
  function drawBoard(c, cells, cx, top, cell, P) {
    var pad = Math.round(cell / 3), w = cell * N + pad * 2, x0 = cx - w / 2;
    c.fillStyle = P.board; roundRect(c, x0, top, w, w, 36); c.fill();
    c.strokeStyle = P.grid; c.lineWidth = 3; roundRect(c, x0 + 1.5, top + 1.5, w - 3, w - 3, 35); c.stroke();
    for (var r = 0; r < N; r++) {
      for (var k = 0; k < N; k++) {
        var v = cells[r * N + k] | 0, x = x0 + pad + k * cell, y = top + pad + r * cell;
        if (!v) { c.fillStyle = P.empty; roundRect(c, x + cell * 0.055, y + cell * 0.055, cell * 0.89, cell * 0.89, cell * 0.17); c.fill(); }
        else drawBlock(c, x, y, cell, P.blocks[(v - 1) % P.blocks.length]);
      }
    }
  }
  function drawChips(c, chips, cx, cy, P, stack, maxW) {
    if (!chips.length) return;
    var size = 36, padX = 34, gap = 20, h = 72, widths, total;
    for (var attempt = 0; attempt < 6; attempt++) {
      c.font = fontStr(size, 700, stack);
      widths = chips.map(function (ch) { return Math.ceil(measure(c, ch.label, size)) + padX * 2; });
      total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (chips.length - 1);
      if (total <= maxW) break;
      size = Math.round(size * 0.9); padX = Math.round(padX * 0.9);
    }
    var x = cx - total / 2;
    chips.forEach(function (ch, i) {
      var w = widths[i];
      c.fillStyle = ch.hot ? P.accent : P.board; roundRect(c, x, cy - h / 2, w, h, h / 2); c.fill();
      if (!ch.hot) { c.strokeStyle = P.grid; c.lineWidth = 2; roundRect(c, x + 1, cy - h / 2 + 1, w - 2, h - 2, h / 2 - 1); c.stroke(); }
      text(c, ch.label, x + w / 2, cy + 2, { size: size, weight: 700, color: ch.hot ? P.bg : P.text, align: 'center', font: stack });
      x += w + gap;
    });
  }
  function glow(c, x, y, radius, color, alpha) {
    try {
      var gr = c.createRadialGradient(x, y, 0, x, y, radius);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = alpha; c.fillStyle = gr; c.fillRect(x - radius, y - radius, radius * 2, radius * 2); c.globalAlpha = 1;
    } catch (e) { c.globalAlpha = 1; }
  }

  function draw(c, L, o) {
    var P = paletteOf(o.palette), lang = cardLang(o.lang), stack = fontStack();
    var W = L.w, H = L.h, cx = W / 2, daily = o.mode === 'daily';
    var score = num(o.score), best = o.best == null ? null : num(o.best);

    c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
    glow(c, cx, L.score, 520, P.accent, 0.14);

    // header: the brand, bilingual on every card
    text(c, 'Sandslide', 80, L.header, { size: 88, weight: 900, color: P.text, font: stack, align: 'left' });
    text(c, '流沙方塊', W - 80, L.header + 8, { size: 52, weight: 700, color: P.text2, font: stack, align: 'right' });
    c.fillStyle = P.accent; roundRect(c, 80, L.header + 62, 120, 6, 3); c.fill();

    // mode / date, then the score as the hero
    var mode = daily ? card(lang, 'daily', { n: o.dailyNumber != null ? o.dailyNumber : '?' }) : card(lang, 'classic');
    if (o.dateKey) mode += ' · ' + o.dateKey;
    text(c, mode, cx, L.mode, { size: 40, weight: 700, color: P.text2, font: stack, align: 'center', maxWidth: W - 160 });
    var scoreStr = fmt(score);
    text(c, scoreStr, cx, L.score, { size: fitSize(c, scoreStr, L.scoreSize, W - 120, 900, stack), weight: 900, color: P.accent, font: stack, align: 'center' });

    drawBoard(c, boardCells(o.board, o), cx, L.boardTop, L.cell, P);

    // stat chips
    var chips = [];
    var tiltLines = num(o.bestTiltLines);
    if (tiltLines > 0) chips.push({ label: tr('over.bestTilt', { n: tiltLines }, lang) });
    if (daily) {
      var total = o.total != null ? num(o.total) : dailyHands(), hands = o.hands != null ? num(o.hands) : total;
      chips.push({ label: tr('over.hands', { n: hands, total: total }, lang) });
    }
    if (best != null) {
      var newBest = o.isNewBest != null ? !!o.isNewBest : (score > 0 && score >= best);
      if (newBest) chips.push({ label: '★ ' + tr('over.newBest', null, lang), hot: true });
      else chips.push({ label: tr('over.best', null, lang) + ' ' + fmt(best) });
    }
    drawChips(c, chips, cx, L.chips, P, stack, W - 120);

    // footer
    text(c, card(lang, 'tagline'), cx, L.tagline, { size: 34, weight: 600, color: P.text2, font: stack, align: 'center', maxWidth: W - 120 });
    text(c, displayUrl(shareUrl()), cx, L.url, { size: 40, weight: 800, color: P.accent2, font: stack, align: 'center', maxWidth: W - 120 });
  }

  // renderCard({ mode, score, best, dateKey, dailyNumber, bestTiltLines, hands, total, board, palette, lang, story })
  // -> HTMLCanvasElement 1080x1350 (1080x1920 with story: true), or null when there is no canvas (Node).
  function renderCard(opts) {
    var o = opts || {}, cv = null, c = null;
    try {
      var d = doc();
      if (!d) return null;
      cv = d.createElement('canvas');
      if (!cv || typeof cv.getContext !== 'function') return null;
      var L = o.story ? LAYOUT.story : LAYOUT.card;
      cv.width = L.w; cv.height = L.h;
      c = cv.getContext('2d');
      if (!c) return null;
      draw(c, L, o);
      return cv;
    } catch (e) {
      return c ? cv : null;   // a partly drawn card is still worth sharing; a canvas we could not create is not
    }
  }

  // ---- share ---------------------------------------------------------------------------------------------------
  function pngBase64(canvas) {
    try {
      if (!canvas || typeof canvas.toDataURL !== 'function') return null;
      var d = canvas.toDataURL('image/png');
      if (typeof d !== 'string' || d.indexOf('data:') !== 0) return null;
      var i = d.indexOf(',');
      return i > 0 && i < d.length - 1 ? d.slice(i + 1) : null;
    } catch (e) { return null; }
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve) {
      try {
        if (!canvas || typeof canvas.toBlob !== 'function') return resolve(null);
        canvas.toBlob(function (blob) { resolve(blob || null); }, 'image/png');
      } catch (e) { resolve(null); }
    });
  }
  function includesUrl(text, url) { return !!(text && url && text.indexOf(url) >= 0); }

  // Native: the PNG goes to the cache dir (file:// uri the Share plugin accepts); without the Filesystem plugin or
  // a canvas the text is shared alone. The url is only passed separately when the text does not already carry it
  // (Android concatenates text + url).
  function shareNative(Share, Filesystem, text, url, canvas) {
    var payload = { title: tr('share.title'), dialogTitle: tr('over.share') };
    if (text) payload.text = text;
    if (url && !includesUrl(text, url)) payload.url = url;
    var written = Promise.resolve(null);
    if (canvas && Filesystem && typeof Filesystem.writeFile === 'function') {
      written = new Promise(function (resolve) {
        var b64 = pngBase64(canvas);
        if (!b64) return resolve(null);
        var p;
        try { p = Filesystem.writeFile({ path: CACHE_PATH, data: b64, directory: 'CACHE', recursive: true }); } catch (e) { return resolve(null); }
        settle(p, function (r) { resolve(r && r.uri ? String(r.uri) : null); }, function () { resolve(null); });
      });
    }
    return written.then(function (uri) {
      if (uri) payload.files = [uri];
      if (!payload.text && !payload.url && !payload.files) return result(false, 'none');
      var p;
      try { p = Share.share(payload); } catch (e) { return result(false, 'native'); }
      return settle(p, function () { return result(true, 'native'); }, function () { return result(false, 'native'); });
    });
  }

  function download(canvas) {
    try {
      var d = doc();
      if (!d || !canvas || typeof canvas.toDataURL !== 'function') return false;
      var href = canvas.toDataURL('image/png');
      if (typeof href !== 'string' || href.indexOf('data:image/png') !== 0) return false;
      var a = d.createElement('a');
      if (!a || typeof a.click !== 'function') return false;
      a.href = href; a.download = FILE_NAME; a.rel = 'noopener';
      if (a.style) a.style.display = 'none';
      var parent = d.body || d.documentElement;
      if (parent && typeof parent.appendChild === 'function') parent.appendChild(a);
      a.click();
      if (parent && typeof parent.removeChild === 'function') { try { parent.removeChild(a); } catch (e) {} }
      return true;
    } catch (e) { return false; }
  }
  function execCopy(text) {
    try {
      var d = doc();
      if (!d || typeof d.execCommand !== 'function') return false;
      var ta = d.createElement('textarea');
      if (!ta) return false;
      ta.value = text; ta.setAttribute('readonly', '');
      if (ta.style) ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      var parent = d.body || d.documentElement;
      parent.appendChild(ta);
      if (typeof ta.select === 'function') ta.select();
      if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, text.length);
      var ok = !!d.execCommand('copy');
      try { parent.removeChild(ta); } catch (e) {}
      return ok;
    } catch (e) { return false; }
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      try {
        var n = nav();
        if (n && n.clipboard && typeof n.clipboard.writeText === 'function') {
          return settle(n.clipboard.writeText(text), function () { resolve(true); }, function () { resolve(execCopy(text)); });
        }
      } catch (e) {}
      resolve(execCopy(text));
    });
  }
  // Download the PNG (when there is one) and put the text on the clipboard (never on file://, where the clipboard
  // is unavailable anyway). 'download' is reported whenever the image went out; 'clipboard' when only the text did.
  function fallback(text, canvas, file) {
    var downloaded = download(canvas);
    var copied = (!file && text) ? copyText(text) : Promise.resolve(false);
    return copied.then(function (ok) {
      var r = result(downloaded || ok, downloaded ? 'download' : ok ? 'clipboard' : 'none');
      r.downloaded = downloaded; r.copied = !!ok;
      return r;
    });
  }
  function shareWeb(text, url, canvas) {
    var file = isFile(), n = nav();
    var attempt = Promise.resolve(null);
    if (canvas && !file && n && typeof n.share === 'function' && typeof n.canShare === 'function' && typeof g.File === 'function') {
      attempt = canvasToBlob(canvas).then(function (blob) {
        if (!blob) return null;
        var f, ok = false;
        try { f = new g.File([blob], FILE_NAME, { type: 'image/png' }); ok = !!n.canShare({ files: [f] }); } catch (e) { ok = false; }
        if (!ok) return null;
        var data = { files: [f], title: tr('share.title') };
        if (text) data.text = text;
        if (url && !includesUrl(text, url)) data.url = url;
        var p;
        try { p = n.share(data); } catch (e) { return null; }   // e.g. no user activation left -> download instead
        return settle(p, function () { return result(true, 'web'); }, function (err) {
          return err && err.name === 'AbortError' ? result(false, 'web') : null;   // dismissed sheet: done; other failures fall back
        });
      });
    }
    return attempt.then(function (r) { return r || fallback(text, canvas, file); });
  }

  // share({ text, url, canvas }) -> Promise<{ ok, method: 'native' | 'web' | 'download' | 'clipboard' | 'none' }>; never rejects.
  function share(opts) {
    var o = opts || {};
    var text = o.text != null ? String(o.text) : '';
    var url = o.url != null ? String(o.url) : '';
    var canvas = o.canvas || null;
    return new Promise(function (resolve) {
      var done = false;
      function finish(r) { if (!done) { done = true; resolve(r || result(false, 'none')); } }
      try {
        var Share = plugin('Share');
        if (Share && typeof Share.share === 'function') {
          shareNative(Share, plugin('Filesystem'), text, url, canvas).then(finish, function () { finish(result(false, 'native')); });
          return;
        }
        if (!text && !canvas) return finish(result(false, 'none'));
        shareWeb(text, url, canvas).then(finish, function () { finish(result(false, 'none')); });
      } catch (e) { finish(result(false, 'none')); }
    });
  }

  TB.Share = { canShareFiles: canShareFiles, dailyText: dailyText, scoreText: scoreText, renderCard: renderCard, share: share };
})(typeof globalThis !== 'undefined' ? globalThis : window);
