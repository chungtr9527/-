'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');

test('rng is deterministic for the same seed and differs across seeds', () => {
  const a = TB.RNG.create('seed-1'), b = TB.RNG.create('seed-1'), c = TB.RNG.create('seed-2');
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 20; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('rng state round-trips', () => {
  const a = TB.RNG.create('x');
  for (let i = 0; i < 7; i++) a.next();
  const st = a.state();
  const b = TB.RNG.create(st);
  assert.equal(a.next(), b.next());
  assert.equal(a.int(1000), b.int(1000));
});

test('rng values are in [0,1) with a sane mean', () => {
  const r = TB.RNG.create('dist');
  let sum = 0;
  for (let i = 0; i < 20000; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); sum += v; }
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.02);
});

test('handRng is independent per hand index', () => {
  const h1 = TB.RNG.handRng('s', 1), h1b = TB.RNG.handRng('s', 1), h2 = TB.RNG.handRng('s', 2);
  assert.equal(h1.next(), h1b.next());
  assert.notEqual(h1.next(), h2.next());
});
