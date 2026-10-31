'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
const D = TB.Daily;

test('date keys, numbering and shifting', () => {
  assert.equal(D.dateKey({ y: 2026, m: 11, d: 1 }), '2026-11-01');
  assert.equal(D.dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(D.numberFor(D.EPOCH), 1);
  assert.equal(D.numberFor('2026-11-30'), 30);
  assert.equal(D.shiftKey('2026-12-31', 1), '2027-01-01');
  assert.equal(D.shiftKey('2027-03-01', -1), '2027-02-28');
  assert.equal(D.seedFor('2026-11-01'), 'sandslide-daily-2026-11-01');
  assert.ok(D.isValidKey('2026-11-01')); assert.ok(!D.isValidKey('2026-13-01')); assert.ok(!D.isValidKey('nope'));
});

test('streaks', () => {
  let s = D.updateStreak(null, '2026-11-01');
  assert.deepEqual(s, { current: 1, best: 1, lastDate: '2026-11-01' });
  s = D.updateStreak(s, '2026-11-01'); assert.equal(s.current, 1);
  s = D.updateStreak(s, '2026-11-02'); assert.equal(s.current, 2);
  assert.ok(D.isAlive(s, '2026-11-03')); assert.ok(!D.isAlive(s, '2026-11-04'));
  s = D.updateStreak(s, '2026-11-05'); assert.deepEqual(s, { current: 1, best: 2, lastDate: '2026-11-05' });
});
