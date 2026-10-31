'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
const B = TB.Board, P = TB.Pieces;

test('canPlace respects bounds and occupancy', () => {
  const cells = B.create();
  const bar = P.byId.bar3_0; // horizontal 1x3
  assert.equal(bar.w, 3); assert.equal(bar.h, 1);
  assert.ok(B.canPlace(cells, bar, 0, 5));
  assert.ok(!B.canPlace(cells, bar, 0, 6));
  B.place(cells, bar, 0, 5, 0);
  assert.ok(!B.canPlace(cells, bar, 0, 5));
  assert.ok(B.canPlace(cells, bar, 1, 5));
  assert.equal(B.count(cells), 3);
});

test('full row and column clear simultaneously; the intersection is cleared once', () => {
  const rows = ['XXXXXXXX', 'X.......', 'X.......', 'X.......', 'X.......', 'X.......', 'X.......', 'X.......'];
  const cells = B.fromRows(rows);
  const lines = B.findFullLines(cells);
  assert.deepEqual(lines, { rows: [0], cols: [0] });
  const cleared = B.clearLines(cells, lines);
  assert.equal(cleared.length, 15);
  assert.equal(B.count(cells), 0);
});

test('anyFits and placements', () => {
  const rows = ['XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXX.'];
  const cells = B.fromRows(rows);
  assert.ok(B.anyFits(cells, [P.byId.dot_0]));
  assert.ok(!B.anyFits(cells, [P.byId.domino_0, P.byId.domino_1]));
  assert.deepEqual(B.placements(cells, P.byId.dot_0), [[7, 7]]);
});

test('fullestLines picks the fullest rows and columns', () => {
  const rows = ['XXXXXXX.', '........', 'XXX.....', '........', '........', '........', '........', 'XXXXX...'];
  const cells = B.fromRows(rows);
  const f = B.fullestLines(cells, 2, 2);
  assert.deepEqual(f.rows, [0, 7]);
  assert.deepEqual(f.cols, [0, 1]);
});

test('toRows/fromRows round-trip', () => {
  const rows = ['X.X.X.X.', '.X.X.X.X', 'XX......', '......XX', 'X......X', '........', 'XXXXXXX.', '.XXXXXXX'];
  assert.deepEqual(B.toRows(B.fromRows(rows)), rows);
});
