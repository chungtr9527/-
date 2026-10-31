// Store assets: 6 phone screenshots (1080x1920) with bilingual captions, feature graphic 1024x500, icon 512.
//   node scripts/make-store-assets.js --lang zh-TW|en-US|all   (default all) -> docs/store/<lang>/01..06.png, docs/store/feature-1024x500.png, docs/store/icon-512.png
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'store');
const langsArg = (process.argv.indexOf('--lang') >= 0 ? process.argv[process.argv.indexOf('--lang') + 1] : 'all');
const LANGS = langsArg === 'all' ? ['zh-TW', 'en-US'] : [langsArg];
const PORT = 4400 + Math.floor(Math.random() * 100), FONT_PORT = PORT + 1;
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'noto-sans-tc');
const CAPTIONS = {
  'zh-TW': ['卡住了？翻轉它。', '方塊像流沙一樣滑落', '一次翻轉消 3 線：流沙 ×3！', '公平亂數，絕不發死牌', '沒有計時器 · 離線可玩', '每日流沙，和朋友比分'],
  'en-US': ['Stuck? Tilt it.', 'Blocks slide like sand.', '3 lines in one Tilt: SANDSLIDE ×3!', 'Fair random. Never rigged.', 'No timer. Plays offline.', 'Daily Slide. Beat your friends.']
};
const SUB = { 'zh-TW': 'Sandslide 流沙方塊', 'en-US': 'Sandslide · Block Puzzle' };
const FONT = '"Noto Sans TC", system-ui, sans-serif';

function serve(root, port) { return spawn(process.execPath, [path.join(ROOT, 'scripts', 'static-server.js'), root, String(port)], { stdio: 'ignore' }); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const servers = [serve(path.join(ROOT, 'www'), PORT), serve(FONT_DIR, FONT_PORT)];
  await sleep(600);
  const browser = await chromium.launch();
  try {
    for (const lang of LANGS) await screenshots(browser, lang);
    await graphics(browser);
  } finally { await browser.close(); servers.forEach(s => s.kill()); }
}

async function newPage(browser, query, lang) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang });
  const page = await ctx.newPage();
  if (lang === 'zh-TW') await page.addInitScript((font) => { window.__FONT_STACK = font; }, FONT);
  await page.goto(`http://127.0.0.1:${PORT}/index.html${query}&lang=${lang === 'zh-TW' ? 'zh-TW' : 'en'}`, { waitUntil: 'load' });
  await page.addStyleTag({ url: `http://127.0.0.1:${FONT_PORT}/index.css` });
  if (lang === 'zh-TW') await page.addStyleTag({ content: `body{font-family:${FONT}}` });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { await document.fonts.load('700 20px "Noto Sans TC"', '流沙方塊'); await document.fonts.load('900 28px "Noto Sans TC"'); });
  await page.waitForFunction(() => window.__TB && window.__TB.screen() !== 'boot');
  await page.evaluate(() => { window.__TB.layout.version++; window.__TB.app.toast = null; });
  await sleep(200);
  return page;
}
async function setBoard(page, rows, hand, stored, extra) {
  await page.evaluate(({ rows, hand, stored, extra }) => {
    const g = window.__TB.game(); const s = g.s;
    s.board = TB.Board.fromRows(rows, (r, c) => (r * 5 + c * 3) % 8);
    if (hand) s.hand = hand.slice();
    if (stored != null) s.stored = stored;
    Object.assign(s, extra || {});
    window.__TB.refresh();
  }, { rows, hand, stored, extra });
  await sleep(120);
}
const R = (s) => s.split('|');
async function screenshots(browser, lang) {
  const dir = path.join(OUT, lang); fs.mkdirSync(dir, { recursive: true });
  const shots = [];
  // 1. stuck with a tilt stored: nothing fits, ✓ arrows pulse
  let page = await newPage(browser, '?tutorial=0&mode=classic&seed=store1&nofx=1', lang);
  await setBoard(page, R('XX.XXX.X|X.XXX.XX|XXX.X.XX|.XXXX.XX|XX.X.XXX|XXX.XX.X|X.XXX.XX|XX.XX.XX'), ['sq3_0', 'bar5_0', 'rect23_0'], 1, { score: 2870, combo: 0 });
  await sleep(300); shots.push(await page.screenshot()); await page.context().close();
  // 2. mid-slide
  page = await newPage(browser, '?tutorial=0&mode=classic&seed=store2', lang);
  await setBoard(page, R('X..X.X..|.X...X.X|X.X.....|...X.X.X|.X...X..|X.X.X..X|...X...X|X...X.X.'), ['t_0', 'lj_2', 'sq2_0'], 1, { score: 1420, combo: 2 });
  await page.evaluate(() => window.__TB.tilt('down')); await sleep(130);
  shots.push(await page.screenshot()); await page.context().close();
  // 3. three-line tilt banner
  page = await newPage(browser, '?tutorial=0&mode=classic&seed=store3', lang);
  await setBoard(page, R('X.X.X.X.|.X.X.X.X|X.XX.X..|.X.X.XX.|XX.X.X.X|.XX.XX..|X.X.X.XX|.X.XX.X.'), ['corner_1', 'bar3_1', 'domino_0'], 1, { score: 3980, combo: 3 });
  await page.evaluate(() => window.__TB.tilt('down')); await sleep(560);
  shots.push(await page.screenshot()); await page.context().close();
  // 4. calm mid-game
  page = await newPage(browser, '?tutorial=0&mode=classic&seed=store4&nofx=1', lang);
  await setBoard(page, R('........|........|........|.XX.....|.XX..X..|XXXX.XX.|XXXXXXX.|XXX.XXXX'), ['bar3_0', 'lj_5', 'dot_0'], 0, { score: 640, combo: 2, energy: 41 });
  await sleep(200); shots.push(await page.screenshot()); await page.context().close();
  // 5. combo moment: place a piece that clears
  page = await newPage(browser, '?tutorial=0&mode=classic&seed=store5', lang);
  await setBoard(page, R('........|........|.X.X....|.XXX..X.|XXXXX.XX|XXXXX.XX|XXXXX.XX|XXXXX.XX'), ['bar4_1', 'sq2_0', 't_1'], 1, { score: 5120, combo: 4, energy: 52 });
  await page.evaluate(() => window.__TB.place(0, 4, 5)); await sleep(140);
  shots.push(await page.screenshot()); await page.context().close();
  // 6. daily screen with a filled calendar
  page = await newPage(browser, '?tutorial=0&nofx=1', lang);
  await page.evaluate(() => {
    const d = window.__TB.app.dailyDoc, today = TB.Daily.dateKey(new Date());
    for (let i = 1; i < 30; i++) if (i % 3 !== 0) d.results[TB.Daily.shiftKey(today, -i)] = { score: 800 + i * 37, hands: 20, completed: true };
    d.streak = { current: 2, best: 9, lastDate: TB.Daily.shiftKey(today, -1) };
    window.__TB.button('menu.daily');
  });
  await sleep(250); shots.push(await page.screenshot()); await page.context().close();
  // compose with captions
  const composer = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await composer.setContent(`<html><head><style>body{margin:0;background:#0F1233}</style></head><body><canvas id="c" width="1080" height="1920"></canvas></body></html>`);
  await composer.addStyleTag({ url: `http://127.0.0.1:${FONT_PORT}/index.css` });
  await composer.evaluate(async () => { await document.fonts.load('900 64px "Noto Sans TC"', '流沙方塊卡住了'); await document.fonts.load('600 34px "Noto Sans TC"', 'Sandslide'); });
  for (let i = 0; i < shots.length; i++) {
    const data = 'data:image/png;base64,' + shots[i].toString('base64');
    const png = await composer.evaluate(async ({ data, caption, sub, font }) => {
      const img = new Image(); img.src = data; await img.decode();
      const c = document.getElementById('c'), x = c.getContext('2d');
      const grad = x.createLinearGradient(0, 0, 0, 1920); grad.addColorStop(0, '#2B2C8F'); grad.addColorStop(0.35, '#0F1233'); grad.addColorStop(1, '#0B0A2E');
      x.fillStyle = grad; x.fillRect(0, 0, 1080, 1920);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = '#FFC857'; x.font = '900 68px ' + font; x.fillText(caption, 540, 150, 1000);
      x.fillStyle = '#A9AECF'; x.font = '600 34px ' + font; x.fillText(sub, 540, 232, 900);
      const sw = 900, sh = sw * 1920 / 1080, sx = (1080 - sw) / 2, sy = 300;
      x.save(); x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 60; x.shadowOffsetY = 24;
      const r = 48; x.beginPath(); x.moveTo(sx + r, sy); x.arcTo(sx + sw, sy, sx + sw, sy + sh, r); x.arcTo(sx + sw, sy + sh, sx, sy + sh, r); x.arcTo(sx, sy + sh, sx, sy, r); x.arcTo(sx, sy, sx + sw, sy, r); x.closePath();
      x.fillStyle = '#0F1233'; x.fill(); x.restore(); x.save(); x.clip(); x.drawImage(img, sx, sy, sw, sh); x.restore();
      x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,0.12)'; x.stroke();
      return c.toDataURL('image/png');
    }, { data, caption: CAPTIONS[lang][i], sub: SUB[lang], font: FONT });
    fs.writeFileSync(path.join(dir, `0${i + 1}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  await composer.close();
  console.log(`${lang}: ${shots.length} screenshots -> ${dir}`);
}
async function graphics(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.goto(`http://127.0.0.1:${PORT}/tools/icon.html`, { waitUntil: 'load' });
  await page.addStyleTag({ url: `http://127.0.0.1:${FONT_PORT}/index.css` });
  await page.evaluate(async () => { await document.fonts.load('900 96px "Noto Sans TC"', '流沙方塊'); await document.fonts.load('600 40px "Noto Sans TC"', 'Tilt'); });
  const icon512 = await page.evaluate(() => window.exportIcon('icon-only', 512));
  fs.writeFileSync(path.join(OUT, 'icon-512.png'), Buffer.from(icon512.split(',')[1], 'base64'));
  const iconData = await page.evaluate(() => window.exportIcon('icon-only', 1024));
  const feature = await page.evaluate(async ({ iconData, font }) => {
    const img = new Image(); img.src = iconData; await img.decode();
    const c = document.createElement('canvas'); c.width = 1024; c.height = 500; const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 1024, 500); grad.addColorStop(0, '#2B2C8F'); grad.addColorStop(1, '#0B0A2E');
    x.fillStyle = grad; x.fillRect(0, 0, 1024, 500);
    for (let i = 0; i < 12; i++) { x.fillStyle = ['#E7AB4F', '#64CDFF', '#0AAC7F', '#F5F619', '#5476FC', '#EE4200', '#DC6BA7', '#E9EEF9'][i % 8]; x.globalAlpha = 0.18; const s = 40 + (i * 37) % 60; x.fillRect(560 + (i * 83) % 420, 360 + (i * 51) % 120, s, s); }
    x.globalAlpha = 1;
    x.save(); x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 40; x.shadowOffsetY = 16; x.drawImage(img, 60, 70, 360, 360); x.restore();
    x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillStyle = '#FFC857'; x.font = '900 110px ' + font; x.fillText('Sandslide', 460, 170);
    x.fillStyle = '#F4F5FA'; x.font = '800 72px ' + font; x.fillText('流沙方塊', 466, 270);
    x.fillStyle = '#A9AECF'; x.font = '600 36px ' + font; x.fillText('Tilt the board. Blocks slide like sand.', 468, 350, 520);
    x.fillText('滑動翻轉棋盤，流沙般消除', 468, 400, 520);
    return c.toDataURL('image/png');
  }, { iconData, font: FONT });
  fs.writeFileSync(path.join(OUT, 'feature-1024x500.png'), Buffer.from(feature.split(',')[1], 'base64'));
  await page.close();
  console.log('feature graphic + icon-512 ->', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
