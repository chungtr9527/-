'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

before(async () => { await H.start(); });
after(async () => { await H.stop(); });

test('boots into the tutorial on first launch without script errors', async () => {
  const page = await H.open('?tutorial=1');
  assert.equal(await page.api(() => window.__TB.screen()), 'play');
  assert.equal(await page.api(() => window.__TB.app.tutorial.step), 1);
  await page.shot('01-tutorial');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('tutorial completes with real drags and a swipe, then Classic starts', async () => {
  const page = await H.open('?tutorial=1');
  const L = await page.layout();
  await page.drag({ x: L.slots[0].cx, y: L.slots[0].cy }, page.target(L, 7, 7, 1, 1));
  await page.settle();
  assert.equal(await page.api(() => window.__TB.state().energy), 57);
  assert.equal(await page.api(() => window.__TB.app.tutorial.step), 2);
  await page.drag({ x: L.slots[1].cx, y: L.slots[1].cy }, page.target(L, 6, 5, 3, 1));
  await page.settle();
  assert.equal(await page.api(() => window.__TB.state().stored), 1);
  assert.equal(await page.api(() => window.__TB.app.tutorial.step), 3);
  // a horizontal swipe must be refused in step 3
  await page.swipe('left'); await page.settle();
  assert.equal(await page.api(() => window.__TB.state().stored), 1);
  await page.swipe('down');
  await page.waitForFunction(() => window.__TB.app.tutorial === null, null, { timeout: 8000 });
  assert.equal(await page.api(() => window.__TB.state().mode), 'classic');
  assert.equal(await page.api(() => window.__TB.app.profile.tutorialDone), true);
  await page.shot('02-classic-start');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('classic: swipe, arrow tap and keyboard tilts consume stored tilts; no-op tilt is free', async () => {
  const page = await H.open('?tutorial=0&mode=classic&seed=e2e-tilt&nofx=1');
  // earn a tilt by placing pieces
  await page.autoplay(14);
  await page.api(() => { const s = window.__TB.game().s; s.stored = 2; s.energy = 0; });
  const fill = await page.api(() => window.__TB.game().fill());
  assert.ok(fill > 0);
  await page.swipe('down', true); await page.settle();
  assert.equal(await page.api(() => window.__TB.state().stored), 1, 'swipe consumed a tilt');
  // packed board: tilting down again is a free no-op
  await page.swipe('down'); await page.settle();
  assert.equal(await page.api(() => window.__TB.state().stored), 1, 'no-op tilt is free');
  // tap the left arrow
  const ar = await page.api(() => window.__TB.layout.rects.arrows.left);
  const c = await page.toClient(ar.cx, ar.cy);
  await page.mouse.click(c.x, c.y); await page.settle();
  assert.equal(await page.api(() => window.__TB.state().stored), 0, 'arrow tap consumed a tilt');
  await page.keyboard.press('ArrowUp'); await page.settle();
  assert.equal(await page.api(() => window.__TB.state().stored), 0, 'no tilt left: keyboard tilt refused');
  await page.shot('03-after-tilts');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('game over flow: free rescue, results panel, play again and home', async () => {
  const page = await H.open('?tutorial=0&mode=classic&seed=e2e-over&nofx=1');
  let r = await page.autoplay(2000);
  assert.ok(r.over, 'bot reached game over');
  await page.waitForFunction(() => ['rescue', 'gameover'].includes(window.__TB.screen()), null, { timeout: 8000 });
  assert.equal(await page.api(() => window.__TB.screen()), 'rescue');
  assert.equal(await page.api(() => window.__TB.app.gameOverInfo.rescue), 'free');
  await page.shot('04-rescue');
  await page.api(() => window.__TB.button('rescue.accept'));
  await page.settle();
  assert.equal(await page.api(() => window.__TB.screen()), 'play');
  assert.ok(await page.api(() => window.__TB.state().stored >= 1));
  r = await page.autoplay(2000);
  await page.waitForFunction(() => window.__TB.screen() === 'gameover', null, { timeout: 8000 });
  await page.shot('05-results');
  const info = await page.api(() => window.__TB.app.gameOverInfo);
  assert.ok(info.score > 0);
  await page.api(() => window.__TB.button('over.again'));
  await page.waitForFunction(() => window.__TB.screen() === 'play' && window.__TB.state().placements === 0, null, { timeout: 8000 });
  await page.api(() => window.__TB.button('play.pause'));
  await page.api(() => window.__TB.button('pause.quit'));
  assert.equal(await page.api(() => window.__TB.screen()), 'menu');
  await page.shot('06-menu');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('daily slide: 20 hands, deterministic for the date, practice for past dates', async () => {
  const page = await H.open('?tutorial=0&mode=daily&nofx=1');
  const st = await page.api(() => window.__TB.state());
  assert.equal(st.rules.hands, 20);
  assert.equal(st.meta.practice, false);
  const hand = st.hand;
  const page2 = await H.open('?tutorial=0&d=2026-11-05&nofx=1');
  const st2 = await page2.api(() => window.__TB.state());
  assert.equal(st2.mode, 'daily'); assert.equal(st2.meta.dateKey, '2026-11-05'); assert.equal(st2.meta.practice, true);
  const page3 = await H.open('?tutorial=0&d=2026-11-05&nofx=1');
  assert.deepEqual(await page3.api(() => window.__TB.state().hand), await page2.api(() => window.__TB.state().hand));
  assert.ok(hand.length === 3);
  await page2.shot('07-daily');
  assert.deepEqual(page.errors, []);
  await page.context().close(); await page2.context().close(); await page3.context().close();
});

test('zh-TW renders Traditional Chinese UI', async () => {
  const page = await H.open('?tutorial=0&mode=classic&lang=zh-TW&nofx=1');
  assert.equal(await page.api(() => TB.I18N.lang), 'zh-TW');
  assert.equal(await page.api(() => document.documentElement.lang), 'zh-Hant-TW');
  assert.ok((await page.api(() => TB.I18N.t('hud.score'))).length > 0);
  await page.shot('08-zh-tw');
  await page.api(() => window.__TB.button('play.pause'));
  await page.shot('09-zh-tw-pause');
  await page.context().close();
});

test('resume: a saved game continues after reload', async () => {
  const page = await H.open('?tutorial=0&mode=classic&seed=e2e-resume&nofx=1');
  await page.autoplay(8);
  const before = await page.api(() => window.__TB.state());
  await page.api(() => TB.Storage.flush());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__TB && window.__TB.screen() === 'menu', null, { timeout: 10000 });
  assert.equal(await page.api(() => window.__TB.app.hasSave), true);
  await page.api(() => window.__TB.button('menu.continue'));
  await page.waitForFunction(() => window.__TB.screen() === 'play', null, { timeout: 8000 });
  const after = await page.api(() => window.__TB.state());
  assert.equal(after.score, before.score); assert.deepEqual(after.board, before.board); assert.deepEqual(after.hand, before.hand);
  await page.context().close();
});

test('small and landscape viewports keep the board away from the screen edges', async () => {
  for (const dev of ['small', 'landscape']) {
    const page = await H.open('?tutorial=0&mode=classic&nofx=1', dev);
    const m = await page.api(() => window.__TB.layout.boardEdgeMarginCss());
    assert.ok(m >= 32, dev + ' board edge margin ' + m);
    await page.shot('10-' + dev);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});
