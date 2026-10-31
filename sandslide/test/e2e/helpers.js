'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const PORT = 4180 + Math.floor(Math.random() * 200);
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'test-results', 'e2e');
const SERVER_WAIT_MS = 5000, SERVER_POLL_MS = 100;
let server = null, browser = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// One GET of /index.html: true on a 200, false when the port is not listening yet (or the request stalls). Never rejects.
function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/index.html' }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}
// Polls the static server until it answers instead of trusting a fixed sleep (a loaded CI runner can take > 500 ms).
async function waitForServer(port) {
  const deadline = Date.now() + SERVER_WAIT_MS;
  for (;;) {
    if (await probe(port)) return;
    if (server && (server.exitCode !== null || server.signalCode !== null)) throw new Error(`static server exited early (code ${server.exitCode}, signal ${server.signalCode}) on port ${port}`);
    if (Date.now() >= deadline) throw new Error(`static server did not answer at http://127.0.0.1:${port}/index.html within ${SERVER_WAIT_MS} ms`);
    await sleep(SERVER_POLL_MS);
  }
}

async function start() {
  fs.mkdirSync(SHOTS, { recursive: true });
  server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'static-server.js'), path.join(ROOT, 'www'), String(PORT)], { stdio: 'ignore' });
  await waitForServer(PORT);
  browser = await chromium.launch();
}
async function stop() { if (browser) await browser.close(); if (server) server.kill(); }
const devices = {
  pixel: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
async function open(query, device) {
  const ctx = await browser.newContext(devices[device || 'pixel']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html${query || ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__TB && window.__TB.screen() !== 'boot', null, { timeout: 10000 });
  await page.waitForTimeout(150);
  page.errors = errors;
  page.shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
  page.api = (fn, arg) => page.evaluate(fn, arg);
  page.toClient = (lx, ly) => page.evaluate(([x, y]) => window.__TB.layout.toClient(x, y), [lx, ly]);
  page.drag = async (fromL, toL, steps) => {
    const a = await page.toClient(fromL.x, fromL.y), b = await page.toClient(toL.x, toL.y);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    const n = steps || 12;
    for (let i = 1; i <= n; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); await page.waitForTimeout(16); }
    await page.mouse.up();
  };
  page.swipe = async (dir, fast) => {
    const b = await page.evaluate(() => window.__TB.layout.rects.board);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, d = 110;
    const to = dir === 'down' ? { x: cx, y: cy + d } : dir === 'up' ? { x: cx, y: cy - d } : dir === 'left' ? { x: cx - d, y: cy } : { x: cx + d, y: cy };
    await page.drag({ x: cx, y: cy }, to, fast ? 4 : 10);
  };
  page.settle = () => page.waitForFunction(() => !window.__TB.busy(), null, { timeout: 8000 });
  page.layout = () => page.evaluate(() => ({ board: window.__TB.layout.rects.board, slots: window.__TB.layout.rects.tray.slots, lift: TB.Config.INPUT.dragLiftPx, S: window.__TB.layout.S, ox: window.__TB.layout.ox, W: window.__TB.layout.W }));
  page.target = (L, r, c, w, h) => ({ x: L.board.x + c * 36 + w * 18, y: L.board.y + r * 36 + h * 36 + L.lift });
  // place pieces through the engine API until the game is over (or n placements)
  page.autoplay = (n) => page.evaluate((n) => {
    const g = window.__TB.game(); const s = g.s; let placed = 0; window.__TB.instant(true);
    for (let k = 0; k < n && !g.isOver(); k++) {
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) { if (!s.hand[i]) continue; const ps = TB.Board.placements(s.board, TB.Pieces.byId[s.hand[i]]); if (ps.length) { ok = window.__TB.place(i, ps[0][0], ps[0][1]); placed++; } }
      if (!ok) { if (s.stored > 0) window.__TB.tilt('down'); else break; }
    }
    window.__TB.instant(false);
    return { placed, over: g.isOver(), score: s.score, screen: window.__TB.screen() };
  }, n);
  return page;
}
module.exports = { start, stop, open, SHOTS };
