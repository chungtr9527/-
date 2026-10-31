'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
const G = TB.Game, B = TB.Board, P = TB.Pieces;

const TUTORIAL_ROWS = ['........', '........', '..XX....', 'XX...XXX', '..X.X...', 'X..X....', '.X..X...', 'XXXXXXX.'];
function tutorialGame() {
  return G.create({ mode: 'tutorial', seed: 'tut', preset: { rows: TUTORIAL_ROWS, hand: ['dot_0', 'bar3_0', 'sq2_0'], energy: 53, locked: [false, false, true] } });
}
function playGreedyFirstFit(game, maxMoves) {
  let moves = 0;
  while (!game.isOver() && moves < maxMoves) {
    const s = game.s; let placed = false;
    for (let i = 0; i < 3 && !placed; i++) {
      if (!s.hand[i]) continue;
      const ps = B.placements(s.board, P.byId[s.hand[i]]);
      if (ps.length) { game.place(i, ps[0][0], ps[0][1]); placed = true; }
    }
    if (!placed) { if (s.stored > 0) game.tilt('down'); else break; }
    moves++;
  }
  return moves;
}

test('classic game starts with a hand, 30 energy and no stored tilt', () => {
  const g = G.create({ mode: 'classic', seed: 'a' });
  assert.equal(g.s.hand.filter(Boolean).length, 3);
  assert.equal(g.s.energy, 30); assert.equal(g.s.stored, 0); assert.equal(g.nextCost(), 60);
  assert.equal(g.s.handIndex, 1);
});

test('tutorial preset replays exactly as scripted', () => {
  const g = tutorialGame();
  assert.ok(!g.canPlace(2, 0, 0), 'locked decoy cannot be placed');
  let r = g.place(0, 7, 7);
  assert.ok(r.ok); assert.equal(r.lines, 1); assert.equal(g.s.energy, 57); assert.equal(g.s.combo, 1);
  assert.equal(g.s.score, 1 + 10);
  r = g.place(1, 6, 5);
  assert.ok(r.ok); assert.equal(r.lines, 0); assert.equal(g.s.stored, 1); assert.equal(g.s.energy, 0); assert.equal(g.s.tiltsEarned, 1);
  assert.equal(g.nextCost(), 75);
  const info = g.arrowInfo();
  assert.equal(info.down.lines, 2); assert.equal(info.up.lines, 2); assert.equal(info.left.lines, 0); assert.equal(info.right.lines, 0);
  r = g.tilt('down');
  assert.ok(r.ok && !r.noop); assert.equal(r.lines, 2); assert.ok(r.banner); assert.ok(r.allClear);
  assert.equal(g.fill(), 0); assert.equal(g.s.stored, 0); assert.equal(g.s.tiltsUsed, 1);
  assert.equal(g.s.score, 11 + 3 + 30 * 2 + 500); // dot, bar3, 2 lines at combo 2, all clear
  assert.equal(g.s.energy, 6); // +3 per tilt-cleared line
});

test('energy converts to stored tilts with escalating cost and freezes at MAX', () => {
  const g = G.create({ mode: 'classic', seed: 'energy' });
  g.s.energy = 0; g.s.stored = 0; g.s.tiltsEarned = 0;
  g._addEnergy(59); assert.equal(g.s.stored, 0); assert.equal(g.s.energy, 59);
  g._addEnergy(1); assert.equal(g.s.stored, 1); assert.equal(g.s.energy, 0); assert.equal(g.nextCost(), 75);
  g._addEnergy(80); assert.equal(g.s.stored, 2); assert.equal(g.s.energy, 5); assert.equal(g.nextCost(), 90);
  g._addEnergy(500); assert.equal(g.s.stored, 2); assert.equal(g.s.energy, 5, 'frozen at MAX');
});

test('tilt without a stored tilt is refused; a no-op tilt is free', () => {
  const g = G.create({ mode: 'classic', seed: 'noop' });
  assert.equal(g.tilt('down').ok, false);
  g.s.stored = 1;
  g.s.board = B.fromRows(['........', '........', '........', '........', '........', '........', '........', 'XX......']);
  const r = g.tilt('down');
  assert.ok(r.ok && r.noop); assert.equal(g.s.stored, 1); assert.equal(g.s.tiltsUsed, 0);
  const r2 = g.tilt('up');
  assert.ok(r2.ok && !r2.noop); assert.equal(g.s.stored, 0); assert.equal(g.s.tiltsUsed, 1);
  assert.deepEqual(B.toRows(g.s.board)[0], 'XX......');
});

test('game over only when nothing fits and no tilt is stored; needsTilt otherwise', () => {
  const g = G.create({ mode: 'classic', seed: 'over' });
  g.s.board = B.fromRows(['XXXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXX.']);
  g.s.hand = ['sq3_0', 'bar5_0', 'rect23_0'];
  g.s.stored = 1; g._updateStuck();
  assert.ok(g.s.needsTilt); assert.ok(!g.s.over);
  g.s.stored = 0; g._updateStuck();
  assert.ok(g.s.over);
});

test('rescue clears the fullest lines, grants a tilt and deals a fitting hand (classic only)', () => {
  const g = G.create({ mode: 'classic', seed: 'rescue' });
  g.s.board = B.fromRows(['XXXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXX.']);
  g.s.hand = ['sq3_0', 'bar5_0', 'rect23_0']; g.s.stored = 0; g._updateStuck();
  assert.ok(g.s.over && g.rescueAvailable());
  const before = g.s.score, energy = g.s.energy;
  const r = g.rescue();
  assert.ok(r.ok); assert.ok(!g.s.over); assert.equal(g.s.stored, 1); assert.equal(g.s.score, before); assert.equal(g.s.energy, energy);
  assert.ok(B.anyFits(g.s.board, g.handShapes()));
  assert.ok(!g.rescueAvailable());
  const d = G.create({ mode: 'daily', seed: 'd' });
  d.s.over = true; assert.ok(!d.rescueAvailable());
});

test('extra tilt chip conditions and effect', () => {
  const g = G.create({ mode: 'classic', seed: 'chip' });
  assert.ok(!g.extraTiltAvailable(), 'empty board');
  g.s.board = B.fromRows(['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', '........', '........']);
  g.s.energy = 10; g.s.stored = 0;
  assert.ok(g.extraTiltAvailable());
  const r = g.addTilt(); assert.ok(r.ok); assert.equal(g.s.stored, 1); assert.equal(g.nextCost(), 60, 'escalation untouched');
  assert.ok(!g.extraTiltAvailable());
});

test('serialize/restore round-trips and continues identically', () => {
  const a = G.create({ mode: 'classic', seed: 'rt' });
  playGreedyFirstFit(a, 25);
  const json = JSON.parse(JSON.stringify(a.serialize()));
  const b = G.restore(json);
  assert.deepEqual(b.serialize(), a.serialize());
  playGreedyFirstFit(a, 40); playGreedyFirstFit(b, 40);
  assert.deepEqual(b.serialize(), a.serialize());
});

test('daily ends after 20 hands and never redraws differently from classic for the same seed', () => {
  const d = G.create({ mode: 'daily', seed: 'daily-x' });
  assert.equal(d.s.rules.hands, 20);
  // fill the board minimally: place pieces anywhere until 20 hands are consumed, cheating with a board reset to keep it simple
  let guard = 0;
  while (!d.isOver() && guard++ < 500) {
    const s = d.s; let placed = false;
    for (let i = 0; i < 3 && !placed; i++) {
      if (!s.hand[i]) continue;
      const ps = B.placements(s.board, P.byId[s.hand[i]]);
      if (ps.length) { d.place(i, ps[0][0], ps[0][1]); placed = true; }
    }
    if (!placed) { if (s.stored > 0) d.tilt('down'); else { s.board.fill(0); d._updateStuck(); } }
  }
  assert.ok(d.s.completed || d.s.over);
  if (d.s.completed) assert.equal(d.s.handIndex, 20);
  const c = G.create({ mode: 'classic', seed: 'daily-x' });
  assert.deepEqual(c.s.hand, G.create({ mode: 'daily', seed: 'daily-x' }).s.hand);
});

test('a first-fit bot game terminates with sane statistics', () => {
  const g = G.create({ mode: 'classic', seed: 'bot' });
  playGreedyFirstFit(g, 5000);
  assert.ok(g.isOver());
  assert.ok(g.s.placements > 10);
  assert.equal(g.s.stored, 0);
});
