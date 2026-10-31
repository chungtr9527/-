'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
const S = TB.Scoring;

test('triangular line table times combo', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(n => S.clearPoints(n, 1)), [10, 30, 60, 100, 150, 210, 280]);
  assert.equal(S.clearPoints(3, 4), 240);
  assert.equal(S.clearPoints(1, 0), 10);
  assert.equal(S.placement(TB.Pieces.byId.sq3_0), 9);
});

test('combo increments on clears, survives one miss, resets on the second', () => {
  let st = { combo: 0, missStreak: 0 };
  st = S.afterEvent(st, 1, 'place'); assert.deepEqual(st, { combo: 1, missStreak: 0 });
  st = S.afterEvent(st, 2, 'tilt'); assert.deepEqual(st, { combo: 2, missStreak: 0 });
  st = S.afterEvent(st, 0, 'tilt'); assert.deepEqual(st, { combo: 2, missStreak: 0 });
  st = S.afterEvent(st, 0, 'place'); assert.deepEqual(st, { combo: 2, missStreak: 1 });
  st = S.afterEvent(st, 0, 'place'); assert.deepEqual(st, { combo: 0, missStreak: 2 });
  st = S.afterEvent(st, 1, 'place'); assert.deepEqual(st, { combo: 1, missStreak: 0 });
});
