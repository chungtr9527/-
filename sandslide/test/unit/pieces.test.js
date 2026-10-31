'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
const P = TB.Pieces, B = TB.Board;

test('catalog has 37 unique normalized shapes in 13 families', () => {
  assert.equal(P.CATALOG.length, 37);
  const expected = { dot: 1, domino: 2, bar3: 2, corner: 4, bar4: 2, sq2: 1, t: 4, sz: 4, lj: 8, bar5: 2, bigl: 4, rect23: 2, sq3: 1 };
  for (const f of Object.keys(expected)) assert.equal(P.byFamily[f].length, expected[f], f);
  const keys = new Set();
  for (const s of P.CATALOG) {
    const k = s.cells.map(c => c.join(',')).join(';');
    assert.ok(!keys.has(k), 'duplicate shape ' + s.id); keys.add(k);
    assert.equal(s.size, s.cells.length);
    assert.ok(s.w <= 5 && s.h <= 5);
    assert.ok(s.cells.some(c => c[0] === 0) && s.cells.some(c => c[1] === 0), 'normalized ' + s.id);
    for (let i = 1; i < s.cells.length; i++) assert.ok(s.cells[i - 1][0] < s.cells[i][0] || (s.cells[i - 1][0] === s.cells[i][0] && s.cells[i - 1][1] < s.cells[i][1]), 'sorted ' + s.id);
  }
  assert.deepEqual(P.byId.bar3_0.cells, [[0, 0], [0, 1], [0, 2]]);
  assert.deepEqual(P.byId.bar3_1.cells, [[0, 0], [1, 0], [2, 0]]);
});

test('family weights interpolate from early to late', () => {
  const sum = (w, fam) => P.CATALOG.reduce((a, s, i) => a + (s.family === fam ? w[i] : 0), 0);
  const w0 = P.weightsAt(0), w1 = P.weightsAt(1);
  for (const f of P.FAMILIES) {
    assert.ok(Math.abs(sum(w0, f.id) - f.early) < 1e-9, f.id);
    assert.ok(Math.abs(sum(w1, f.id) - f.late) < 1e-9, f.id);
  }
  assert.equal(P.tierT(1), 0); assert.equal(P.tierT(12), 0); assert.equal(P.tierT(31), 1); assert.equal(P.tierT(100), 1);
  assert.ok(P.tierT(21) > 0.4 && P.tierT(21) < 0.6);
});

test('drawHand is deterministic and hands are independent of earlier hands', () => {
  assert.deepEqual(P.drawHand('seed', 1), P.drawHand('seed', 1));
  const full = B.fromRows(Array(8).fill('XXXXXXXX'));
  const empty = B.create();
  const rules = TB.Config.RULES.classic;
  // hand 1 on a full board triggers redraws; hand 2 must be identical regardless of hand 1's board
  P.drawHand('seed', 1, { board: full, stored: 0, rules });
  assert.deepEqual(P.drawHand('seed', 2, { board: empty, stored: 0, rules }), P.drawHand('seed', 2, { board: full, stored: 1, rules }));
});

test('big-piece caps hold per tier', () => {
  for (let h = 0; h < 400; h++) {
    const early = P.drawHand('cap' + h, 1).map(id => P.byId[id].size);
    assert.ok(early.filter(s => s >= 5).length <= 1, 'early ' + early);
    const late = P.drawHand('cap' + h, 40).map(id => P.byId[id].size);
    assert.ok(late.filter(s => s >= 6).length <= 2, 'late ' + late);
  }
});

test('fair redraw only when nothing fits and no tilt is stored', () => {
  // board where only a single cell is free: only the dot fits
  const rows = ['XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXX.'];
  const board = B.fromRows(rows);
  const rules = TB.Config.RULES.classic;
  let fixed = 0, skipped = 0;
  for (let i = 0; i < 300; i++) {
    const raw = P.drawHand('fr' + i, 1);
    if (raw.includes('dot_0')) continue;
    const withTilt = P.drawHand('fr' + i, 1, { board, stored: 1, rules });
    assert.deepEqual(withTilt, raw); // stored tilt: never redraw
    const redrawn = P.drawHand('fr' + i, 1, { board, stored: 0, rules });
    if (redrawn.includes('dot_0')) fixed++; else skipped++;
  }
  assert.ok(fixed > 0, 'at least one redraw produced a fitting hand');
});
