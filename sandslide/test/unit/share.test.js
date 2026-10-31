'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const TB = require('../helpers/load-engine');
const SHARE = path.join(__dirname, '..', '..', 'www', 'js', 'share.js');
const WEB_URL = TB.Config.SHARE.web;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function fresh() { delete require.cache[require.resolve(SHARE)]; require(SHARE); return globalThis.TB.Share; }
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- stubs -------------------------------------------------------------------------------------------------------
// A minimal TB.I18N following the contract (the real module is another file; only the documented API is relied on).
function stubI18N(lang) {
  const strings = {
    en: {
      'daily.shareText': 'Sandslide Daily #{n} · {score} · {hands}/{total} hands · best tilt {lines} lines\n{url}',
      'share.text': 'I scored {score} in Sandslide — tilt the board, blocks slide like sand. {url}',
      'share.title': 'Sandslide', 'over.share': 'Share', 'over.best': 'Best', 'over.newBest': 'New best!',
      'over.bestTilt': 'Best tilt: {n} lines', 'over.hands': 'Hands {n}/{total}'
    },
    'zh-TW': {
      'daily.shareText': '流沙方塊 每日流沙 #{n} · {score} 分 · {hands}/{total} 手 · 最大翻轉 {lines} 線\n{url}',
      'share.text': '我在《流沙方塊》拿到 {score} 分！{url}',
      'share.title': '流沙方塊', 'over.share': '分享', 'over.best': '最高分', 'over.newBest': '新紀錄！',
      'over.bestTilt': '最佳翻轉：{n} 線', 'over.hands': '手牌 {n}/{total}'
    }
  };
  const I = {
    available: ['en', 'zh-TW'], strings, lang: lang || 'en',
    detect: (langs) => (/^zh/i.test(String((langs && langs[0]) || '')) ? 'zh-TW' : 'en'),
    setLang(l) { I.lang = l; return l; },
    t(key, params) {
      const table = strings[I.lang] || strings.en;
      const s = hasOwn(table, key) ? table[key] : hasOwn(strings.en, key) ? strings.en[key] : key;
      if (params == null) return s;
      const p = typeof params === 'object' ? params : { n: params };
      return s.replace(/\{(\w+)\}/g, (m, k) => (hasOwn(p, k) && p[k] != null ? String(p[k]) : m));
    },
    htmlLang: () => 'en',
    fontStack: 'system-ui, "PingFang TC", "Noto Sans TC", sans-serif'
  };
  globalThis.TB.I18N = I;
  return I;
}

// A canvas whose 2d context records what the card draws.
function fakeCanvas(rec, opts) {
  opts = opts || {};
  const ctx = {};
  for (const m of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'stroke']) ctx[m] = () => { rec.push([m]); };
  ctx.fillText = (s) => { rec.push(['fillText', String(s)]); };
  ctx.measureText = (s) => ({ width: String(s).length * 22 });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  const proxy = new Proxy(ctx, { set(t, k, v) { if (k === 'fillStyle' || k === 'font') rec.push([k, v]); t[k] = v; return true; } });
  return {
    width: 300, height: 150,
    getContext(type) { return type === '2d' && !opts.noContext ? proxy : null; },
    toDataURL() { rec.push(['toDataURL']); if (opts.throwDataUrl) throw new Error('tainted'); return opts.dataUrl !== undefined ? opts.dataUrl : 'data:image/png;base64,QUJD'; },
    toBlob: opts.noBlob ? undefined : function (cb) { rec.push(['toBlob']); if (opts.throwBlob) throw new Error('no blob'); cb(opts.nullBlob ? null : new Blob(['png'], { type: 'image/png' })); }
  };
}
function fakeDocument(rec) {
  const anchors = [], textareas = [];
  const body = { children: [], appendChild(el) { this.children.push(el); }, removeChild(el) { this.children = this.children.filter((e) => e !== el); } };
  return {
    anchors, textareas, body, documentElement: body,
    createElement(tag) {
      if (tag === 'canvas') return fakeCanvas(rec);
      if (tag === 'a') { const a = { style: {}, clicks: 0, click() { this.clicks++; rec.push(['click', this.download]); } }; anchors.push(a); return a; }
      if (tag === 'textarea') { const ta = { style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, select() {}, setSelectionRange() {} }; textareas.push(ta); return ta; }
      return { style: {} };
    }
  };
}
function nativeBridge(plugins) { return { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins }; }
function fakeNative(opts) {
  opts = opts || {};
  const calls = [];
  const Filesystem = {
    writeFile(o) {
      calls.push(['writeFile', o]);
      if (opts.writeThrows) throw new Error('disk');
      return opts.writeRejects ? Promise.reject(new Error('disk')) : Promise.resolve({ uri: 'file:///data/user/0/app/cache/share/sandslide.png' });
    }
  };
  const Share = {
    share(o) {
      calls.push(['share', o]);
      if (opts.shareThrows) throw new Error('boom');
      return opts.shareRejects ? Promise.reject(new Error('Share canceled')) : Promise.resolve({ activityType: 'x' });
    }
  };
  return { calls, Filesystem, Share };
}

const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function setNavigator(v) { Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true, enumerable: true }); }
function installGlobals(obj) {
  for (const k of Object.keys(obj)) Object.defineProperty(globalThis, k, { value: obj[k], configurable: true, writable: true, enumerable: true });
}
afterEach(() => {
  for (const k of ['Capacitor', 'document', 'location']) delete globalThis[k];
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
  delete globalThis.TB.I18N;
});

const DAILY = { number: 12, score: 4230, hands: 20, total: 20, lines: 3, url: 'https://example.test/s/' };
const ROWS = ['........', '........', '..XX....', 'XX...XXX', '..X.X...', 'X..X....', '.X..X...', 'XXXXXXX.'];
const texts = (rec) => rec.filter((r) => r[0] === 'fillText').map((r) => r[1]);
const fills = (rec) => rec.filter((r) => r[0] === 'fillStyle').map((r) => r[1]);
const fonts = (rec) => rec.filter((r) => r[0] === 'font').map((r) => r[1]);

// ---- API surface / Node no-ops -------------------------------------------------------------------------------------
test('exposes the contract API and degrades to no-ops in Node (no DOM, no bridge, no Web Share)', async () => {
  const S = fresh();
  assert.deepEqual(Object.keys(S).sort(), ['canShareFiles', 'dailyText', 'renderCard', 'scoreText', 'share']);
  for (const k of Object.keys(S)) assert.equal(typeof S[k], 'function', k);
  assert.equal(S.canShareFiles(), false);
  assert.equal(S.renderCard(), null);
  assert.equal(S.renderCard({ mode: 'daily', score: 10, board: TB.Board.create() }), null);
  assert.deepEqual(await S.share(), { ok: false, method: 'none' });
  assert.deepEqual(await S.share(null), { ok: false, method: 'none' });
  assert.deepEqual(await S.share({}), { ok: false, method: 'none' });
  const r = await S.share({ text: 'hello', url: WEB_URL });
  assert.equal(r.ok, false); assert.equal(r.method, 'none');
  const r2 = await S.share({ text: 'hello', canvas: fakeCanvas([]) });
  assert.equal(r2.ok, false); assert.equal(r2.method, 'none');
});

// ---- text builders -----------------------------------------------------------------------------------------------
test('dailyText / scoreText fall back to English without TB.I18N and format the score with thousands separators', () => {
  const S = fresh();
  assert.equal(globalThis.TB.I18N, undefined);
  assert.equal(S.dailyText(DAILY), 'Sandslide Daily #12 · 4,230 · 20/20 hands · best tilt 3 lines\nhttps://example.test/s/');
  assert.equal(S.scoreText({ score: 1234567, url: 'https://example.test/' }), 'I scored 1,234,567 in Sandslide — tilt the board, blocks slide like sand. https://example.test/');
  // defaults: the web url from TB.Config, 20 hands from the daily rules, 0 lines
  assert.equal(S.dailyText({ number: 1, score: 950 }), `Sandslide Daily #1 · 950 · 20/20 hands · best tilt 0 lines\n${WEB_URL}`);
  assert.equal(S.dailyText({ number: 3, score: 0, hands: 7 }), `Sandslide Daily #3 · 0 · 7/20 hands · best tilt 0 lines\n${WEB_URL}`);
  assert.equal(S.scoreText({ score: 0 }), `I scored 0 in Sandslide — tilt the board, blocks slide like sand. ${WEB_URL}`);
  assert.equal(S.scoreText({ score: '2500' }).indexOf('2,500') >= 0, true, 'numeric strings are formatted too');
  assert.equal(S.scoreText({ score: NaN }).indexOf('I scored 0 ') === 0, true, 'garbage scores become 0');
  assert.equal(S.scoreText().indexOf(WEB_URL) >= 0, true);
  assert.equal(S.dailyText().indexOf('Daily #?') >= 0, true);
});

test('dailyText / scoreText use TB.I18N.t with the contract placeholders, honour the lang override and survive a broken i18n', () => {
  const S = fresh();
  const I = stubI18N('en');
  assert.equal(S.dailyText(DAILY), 'Sandslide Daily #12 · 4,230 · 20/20 hands · best tilt 3 lines\nhttps://example.test/s/');
  assert.equal(S.scoreText({ score: 4230, url: 'u' }), 'I scored 4,230 in Sandslide — tilt the board, blocks slide like sand. u');
  I.setLang('zh-TW');
  assert.equal(S.dailyText(DAILY), '流沙方塊 每日流沙 #12 · 4,230 分 · 20/20 手 · 最大翻轉 3 線\nhttps://example.test/s/');
  assert.equal(S.scoreText({ score: 4230, url: 'u' }), '我在《流沙方塊》拿到 4,230 分！u');
  // an explicit lang picks that table regardless of the current language
  I.setLang('en');
  assert.equal(S.dailyText(Object.assign({}, DAILY, { lang: 'zh-TW' })).indexOf('流沙方塊 每日流沙 #12'), 0);
  assert.equal(S.dailyText(Object.assign({}, DAILY, { lang: 'zh' })).indexOf('流沙方塊 每日流沙 #12'), 0, 'any zh tag -> zh-TW');
  assert.equal(S.scoreText({ score: 1, url: 'u', lang: 'zh-TW' }), '我在《流沙方塊》拿到 1 分！u');
  assert.equal(S.scoreText({ score: 1, url: 'u', lang: 'fr' }), 'I scored 1 in Sandslide — tilt the board, blocks slide like sand. u', 'unknown lang -> current language');
  // missing keys fall back to the built-in English, so the text is never a bare key
  delete I.strings.en['share.text']; delete I.strings['zh-TW']['share.text'];
  assert.equal(S.scoreText({ score: 5, url: 'u' }), 'I scored 5 in Sandslide — tilt the board, blocks slide like sand. u');
  I.t = () => { throw new Error('broken'); };
  I.strings = null;
  assert.equal(S.dailyText(DAILY), 'Sandslide Daily #12 · 4,230 · 20/20 hands · best tilt 3 lines\nhttps://example.test/s/');
});

// ---- card --------------------------------------------------------------------------------------------------------
test('renderCard draws a 1080x1350 card: bilingual title, mode line, big score, mini board from the palette, chips, footer', () => {
  const S = fresh();
  const I = stubI18N('en');
  const rec = [];
  installGlobals({ document: fakeDocument(rec) });
  const palette = Object.assign({}, TB.Config.PALETTE, { blocks: ['#123456', '#234567', '#345678', '#456789', '#56789A', '#6789AB', '#789ABC', '#89ABCD'] });
  const board = TB.Board.fromRows(ROWS, () => 0);   // every block uses colour 0
  const cv = S.renderCard({ mode: 'daily', score: 4230, best: 9000, dateKey: '2026-11-12', dailyNumber: 12, bestTiltLines: 3, hands: 20, total: 20, board, palette, lang: 'en' });
  assert.ok(cv, 'a canvas is returned');
  assert.equal(cv.width, 1080); assert.equal(cv.height, 1350);
  const t = texts(rec);
  assert.ok(t.includes('Sandslide') && t.includes('流沙方塊'), 'title in both languages');
  assert.ok(t.includes('Daily #12 · 2026-11-12'), 'mode/date line: ' + t.join(' | '));
  assert.ok(t.includes('4,230'), 'score');
  assert.ok(t.includes('Best tilt: 3 lines') && t.includes('Hands 20/20') && t.includes('Best 9,000'), 'chips: ' + t.join(' | '));
  assert.ok(t.includes('Tilt the board. Blocks slide like sand.'), 'tagline');
  assert.ok(t.includes(WEB_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '')), 'footer url without scheme');
  const f = fills(rec);
  assert.ok(f.includes('#123456'), 'filled cells use palette.blocks[value - 1]');
  assert.ok(!f.includes('#234567'), 'only colour 0 is on this board');
  assert.ok(f.includes(TB.Config.PALETTE.empty) && f.includes(TB.Config.PALETTE.bg) && f.includes(TB.Config.PALETTE.accent), 'bg / empty / accent');
  const filledCells = ROWS.join('').split('X').length - 1;
  assert.equal(f.filter((c) => c === '#123456').length, filledCells * 2, 'two colour fills per block (shade + body)');
  assert.equal(f.filter((c) => c === TB.Config.PALETTE.empty).length, 64 - filledCells, 'one fill per empty cell');
  assert.ok(fonts(rec).every((s) => s.indexOf(I.fontStack) > 0), 'TB.I18N.fontStack is used: ' + fonts(rec)[0]);
  assert.ok(fonts(rec).some((s) => /^900 \d+px /.test(s)), 'heavy weight for the score');
});

test('renderCard: story variant, language-specific copy, classic mode, new-best chip, and garbage input never throws', () => {
  const S = fresh();
  let rec = [];
  installGlobals({ document: fakeDocument(rec) });
  const story = S.renderCard({ mode: 'classic', score: 14230, best: 14230, bestTiltLines: 0, board: null, lang: 'zh-TW', story: true });
  assert.equal(story.width, 1080); assert.equal(story.height, 1920);
  let t = texts(rec);
  assert.ok(t.includes('經典模式'), 'classic label in zh-TW: ' + t.join(' | '));
  assert.ok(t.includes('滑動翻轉，流沙般消除'), 'zh-TW tagline');
  assert.ok(t.includes('★ New best!'), 'score >= best -> new best chip (English fallback without TB.I18N)');
  assert.ok(!t.some((s) => /Best tilt/.test(s)), 'no best-tilt chip when 0 lines');
  assert.ok(!t.some((s) => /Hands/.test(s)), 'no hands chip in classic');
  assert.ok(fonts(rec).every((s) => s.indexOf('system-ui, sans-serif') > 0), 'system-ui without TB.I18N');
  assert.equal(fills(rec).filter((c) => c === TB.Config.PALETTE.empty).length > 0, true, 'board: null still draws a board');
  // an explicit isNewBest flag wins; without best there is no best chip at all
  rec.length = 0;
  S.renderCard({ mode: 'classic', score: 50, best: 50, isNewBest: false, lang: 'en' });
  t = texts(rec);
  assert.ok(t.includes('Best 50') && !t.includes('★ New best!'));
  rec.length = 0;
  S.renderCard({ mode: 'classic', score: 50, lang: 'en' });
  assert.ok(!texts(rec).some((s) => /Best/.test(s)));
  // zh daily with the stubbed i18n chips
  stubI18N('zh-TW'); rec.length = 0;
  S.renderCard({ mode: 'daily', score: 100, best: 500, dailyNumber: 4, bestTiltLines: 2, hands: 20, total: 20, board: TB.Board.create() });
  t = texts(rec);
  assert.ok(t.includes('每日流沙 第 4 期') && t.includes('最佳翻轉：2 線') && t.includes('手牌 20/20') && t.includes('最高分 500'), t.join(' | '));
  // hostile input
  rec.length = 0;
  assert.doesNotThrow(() => {
    const cv = S.renderCard({ mode: 42, score: 'abc', best: 'x', board: new Uint8Array(10), palette: 'nope', lang: 7, dailyNumber: null, bestTiltLines: -3 });
    assert.ok(cv && cv.width === 1080);
  });
  assert.doesNotThrow(() => S.renderCard({ board: { length: 64 }, palette: { blocks: [] } }));
  // a canvas without a 2d context -> null, not a throw
  installGlobals({ document: { createElement: () => fakeCanvas([], { noContext: true }) } });
  assert.equal(S.renderCard({ score: 1 }), null);
  installGlobals({ document: { createElement: () => { throw new Error('no canvas'); } } });
  assert.equal(S.renderCard({ score: 1 }), null);
});

// ---- share(): native ----------------------------------------------------------------------------------------------
test('share(): native path writes the PNG to the cache dir and shares its uri through the Share plugin', async () => {
  const S = fresh();
  stubI18N('en');
  const n = fakeNative();
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share, Filesystem: n.Filesystem }) });
  assert.equal(S.canShareFiles(), true);
  const text = S.scoreText({ score: 4230, url: WEB_URL });
  const r = await S.share({ text, url: WEB_URL, canvas: fakeCanvas([]) });
  assert.deepEqual(r, { ok: true, method: 'native' });
  assert.equal(n.calls.length, 2);
  assert.deepEqual(n.calls[0], ['writeFile', { path: 'share/sandslide.png', data: 'QUJD', directory: 'CACHE', recursive: true }]);
  assert.deepEqual(n.calls[1], ['share', { title: 'Sandslide', dialogTitle: 'Share', text, files: ['file:///data/user/0/app/cache/share/sandslide.png'] }]);
  // the url is passed separately only when the text does not already carry it (Android appends it to the text)
  n.calls.length = 0;
  await S.share({ text: 'plain', url: WEB_URL, canvas: fakeCanvas([]) });
  assert.equal(n.calls[1][1].url, WEB_URL); assert.equal(n.calls[1][1].text, 'plain');
  // text only when there is no canvas
  n.calls.length = 0;
  assert.deepEqual(await S.share({ text, url: WEB_URL, canvas: null }), { ok: true, method: 'native' });
  assert.equal(n.calls.length, 1); assert.equal(n.calls[0][0], 'share'); assert.equal(n.calls[0][1].files, undefined);
  // nothing to share at all
  n.calls.length = 0;
  assert.deepEqual(await S.share({}), { ok: false, method: 'none' });
  assert.equal(n.calls.length, 0);
});

test('share(): native failures degrade (write fails -> text only; cancelled or throwing sheet -> ok:false, never a rejection)', async () => {
  const S = fresh();
  let n = fakeNative({ writeRejects: true });
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share, Filesystem: n.Filesystem }) });
  assert.deepEqual(await S.share({ text: 't', canvas: fakeCanvas([]) }), { ok: true, method: 'native' });
  assert.equal(n.calls[1][1].files, undefined);
  n = fakeNative({ writeThrows: true });
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share, Filesystem: n.Filesystem }) });
  assert.deepEqual(await S.share({ text: 't', canvas: fakeCanvas([]) }), { ok: true, method: 'native' });
  assert.equal(n.calls[1][1].files, undefined);
  // a canvas that cannot produce a data url
  n = fakeNative();
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share, Filesystem: n.Filesystem }) });
  assert.deepEqual(await S.share({ text: 't', canvas: fakeCanvas([], { throwDataUrl: true }) }), { ok: true, method: 'native' });
  assert.equal(n.calls.length, 1); assert.equal(n.calls[0][1].files, undefined);
  n = fakeNative({ shareRejects: true });
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share, Filesystem: n.Filesystem }) });
  assert.deepEqual(await S.share({ text: 't', canvas: fakeCanvas([]) }), { ok: false, method: 'native' });
  n = fakeNative({ shareThrows: true });
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share, Filesystem: n.Filesystem }) });
  assert.deepEqual(await S.share({ text: 't' }), { ok: false, method: 'native' });
  // Share without Filesystem: text-only native share; canShareFiles says no
  n = fakeNative();
  installGlobals({ Capacitor: nativeBridge({ Share: n.Share }) });
  assert.equal(S.canShareFiles(), false);
  assert.deepEqual(await S.share({ text: 't', canvas: fakeCanvas([]) }), { ok: true, method: 'native' });
  assert.equal(n.calls.length, 1); assert.equal(n.calls[0][1].files, undefined);
  // a bridge that throws is treated as absent
  installGlobals({ Capacitor: { get Plugins() { throw new Error('x'); } } });
  assert.equal(S.canShareFiles(), false);
  const r = await S.share({ text: 't' });
  assert.equal(r.ok, false); assert.equal(r.method, 'none');
});

// ---- share(): web -------------------------------------------------------------------------------------------------
test('share(): Web Share Level 2 with the PNG as a File when the browser can share files', async () => {
  const S = fresh();
  stubI18N('en');
  const shared = [];
  setNavigator({ canShare: (d) => !!(d && d.files && d.files.length), share: async (d) => { shared.push(d); } });
  const rec = [];
  installGlobals({ document: fakeDocument(rec) });
  assert.equal(S.canShareFiles(), true);
  const text = S.dailyText(DAILY);
  assert.deepEqual(await S.share({ text, url: DAILY.url, canvas: fakeCanvas(rec) }), { ok: true, method: 'web' });
  assert.equal(shared.length, 1);
  assert.equal(shared[0].text, text); assert.equal(shared[0].title, 'Sandslide'); assert.equal(shared[0].url, undefined);
  assert.ok(shared[0].files[0] instanceof File); assert.equal(shared[0].files[0].name, 'sandslide.png'); assert.equal(shared[0].files[0].type, 'image/png');
  assert.equal(globalThis.document.anchors.length, 0, 'no download when the share sheet opened');
  await S.share({ text: 'plain', url: 'https://u/', canvas: fakeCanvas(rec) });
  assert.equal(shared[1].url, 'https://u/');
  // dismissed sheet: AbortError -> ok:false, 'web', and nothing else happens
  const abort = new Error('cancelled'); abort.name = 'AbortError';
  setNavigator({ canShare: () => true, share: () => Promise.reject(abort), clipboard: { writeText: async () => { throw new Error('must not be called'); } } });
  assert.deepEqual(await S.share({ text: 'x', canvas: fakeCanvas(rec) }), { ok: false, method: 'web' });
  assert.equal(globalThis.document.anchors.length, 0);
  // any other failure (no activation, permission) falls back to download + clipboard
  const copies = [];
  const denied = new Error('no'); denied.name = 'NotAllowedError';
  setNavigator({ canShare: () => true, share: () => Promise.reject(denied), clipboard: { writeText: async (t) => { copies.push(t); } } });
  let r = await S.share({ text: 'x', canvas: fakeCanvas(rec) });
  assert.equal(r.ok, true); assert.equal(r.method, 'download'); assert.equal(r.copied, true);
  assert.equal(globalThis.document.anchors.length, 1); assert.deepEqual(copies, ['x']);
  setNavigator({ canShare: () => true, share: () => { throw denied; }, clipboard: { writeText: async (t) => { copies.push(t); } } });
  r = await S.share({ text: 'y', canvas: fakeCanvas(rec) });
  assert.equal(r.method, 'download'); assert.deepEqual(copies, ['x', 'y']);
  // files not shareable -> straight to the fallback
  setNavigator({ canShare: () => false, share: async () => { throw new Error('must not be called'); }, clipboard: { writeText: async (t) => { copies.push(t); } } });
  assert.equal(S.canShareFiles(), false);
  r = await S.share({ text: 'z', canvas: fakeCanvas(rec) });
  assert.equal(r.method, 'download'); assert.equal(copies[2], 'z');
  // toBlob yields nothing -> fallback as well
  setNavigator({ canShare: () => true, share: async () => { throw new Error('must not be called'); } });
  r = await S.share({ text: 'q', canvas: fakeCanvas(rec, { nullBlob: true }) });
  assert.equal(r.method, 'download');
  r = await S.share({ text: 'q', canvas: fakeCanvas(rec, { throwBlob: true }) });
  assert.equal(r.method, 'download');
});

test('share(): download + clipboard fallback (desktop web)', async () => {
  const S = fresh();
  const copies = [];
  setNavigator({ clipboard: { writeText: async (t) => { copies.push(t); } } });
  const rec = [];
  const d = fakeDocument(rec);
  installGlobals({ document: d });
  assert.equal(S.canShareFiles(), false);
  const r = await S.share({ text: 'hello https://x/', url: 'https://x/', canvas: fakeCanvas(rec) });
  assert.deepEqual(r, { ok: true, method: 'download', downloaded: true, copied: true });
  assert.equal(d.anchors.length, 1);
  assert.equal(d.anchors[0].download, 'sandslide.png'); assert.equal(d.anchors[0].clicks, 1);
  assert.ok(d.anchors[0].href.indexOf('data:image/png') === 0);
  assert.equal(d.body.children.length, 0, 'the anchor is removed again');
  assert.deepEqual(copies, ['hello https://x/']);
  // text only -> clipboard
  assert.deepEqual(await S.share({ text: 'only text' }), { ok: true, method: 'clipboard', downloaded: false, copied: true });
  assert.equal(d.anchors.length, 1);
  // clipboard rejected -> execCommand('copy') fallback when the document has it
  setNavigator({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
  let r2 = await S.share({ text: 'exec me' });
  assert.deepEqual(r2, { ok: false, method: 'none', downloaded: false, copied: false });
  d.execCommand = (cmd) => cmd === 'copy';
  r2 = await S.share({ text: 'exec me' });
  assert.deepEqual(r2, { ok: true, method: 'clipboard', downloaded: false, copied: true });
  assert.equal(d.textareas[0].value, 'exec me');
  assert.equal(d.body.children.length, 0);
  // no clipboard at all but a canvas -> the download alone is a success
  setNavigator({});
  d.execCommand = undefined;
  const r3 = await S.share({ text: 't', canvas: fakeCanvas(rec) });
  assert.deepEqual(r3, { ok: true, method: 'download', downloaded: true, copied: false });
  // a canvas that cannot export -> nothing
  const r4 = await S.share({ text: 't', canvas: fakeCanvas(rec, { dataUrl: 'not-a-data-url' }) });
  assert.deepEqual(r4, { ok: false, method: 'none', downloaded: false, copied: false });
});

test('share(): file:// downloads only (no Web Share, no clipboard)', async () => {
  const S = fresh();
  const rec = [];
  let shares = 0, copies = 0;
  installGlobals({ location: { protocol: 'file:' }, document: fakeDocument(rec) });
  setNavigator({ canShare: () => true, share: async () => { shares++; }, clipboard: { writeText: async () => { copies++; } } });
  assert.equal(S.canShareFiles(), false);
  const r = await S.share({ text: 'hi', url: 'https://x/', canvas: fakeCanvas(rec) });
  assert.deepEqual(r, { ok: true, method: 'download', downloaded: false || true, copied: false });
  assert.equal(shares, 0); assert.equal(copies, 0);
  assert.equal(globalThis.document.anchors.length, 1);
  assert.deepEqual(await S.share({ text: 'hi' }), { ok: false, method: 'none', downloaded: false, copied: false });
  installGlobals({ location: { protocol: 'https:' } });
  const r2 = await S.share({ text: 'hi' });
  assert.equal(r2.method, 'clipboard'); assert.equal(copies, 1);
});

test('share() never throws or rejects on hostile environments', async () => {
  const S = fresh();
  Object.defineProperty(globalThis, 'navigator', { get() { throw new Error('nope'); }, configurable: true });
  installGlobals({ document: { createElement() { throw new Error('no dom'); } }, location: { get protocol() { throw new Error('x'); } } });
  assert.equal(S.canShareFiles(), false);
  assert.deepEqual(await S.share({ text: 't', canvas: fakeCanvas([]) }), { ok: false, method: 'none', downloaded: false, copied: false });
  assert.deepEqual(await S.share(42), { ok: false, method: 'none' });
  assert.deepEqual(await S.share({ canvas: { toDataURL() { throw new Error('x'); }, toBlob() { throw new Error('x'); } } }), { ok: false, method: 'none', downloaded: false, copied: false });
  await tick();
});
