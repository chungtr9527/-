'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TB = require('../helpers/load-engine');
const B = TB.Board, T = TB.Tilt;

function randomRestBoard(rng) {
  const density = 0.1 + rng.next() * 0.7;
  const cells = B.create();
  for (let i = 0; i < 64; i++) if (rng.next() < density) cells[i] = 1 + rng.int(8);
  // a rest-state board has no full lines (they would have been cleared on placement)
  B.clearLines(cells, B.findFullLines(cells));
  return cells;
}
function laneMultisets(cells, dir) {
  const out = [];
  for (let lane = 0; lane < 8; lane++) {
    const idx = T.laneIndices(dir, lane);
    out.push(idx.map(i => cells[i]).filter(Boolean));
  }
  return out;
}
function replay(before, steps) {
  const cells = B.clone(before);
  for (const st of steps) {
    if (st.t === 'slide') for (const m of st.moves) { cells[m.to] = cells[m.from]; cells[m.from] = 0; }
    else if (st.t === 'clear') for (const c of st.cells) cells[c.idx] = 0;
  }
  return cells;
}

test('compact preserves each lane as an ordered multiset and is idempotent', () => {
  const rng = TB.RNG.create('compact');
  for (let n = 0; n < 500; n++) {
    const cells = randomRestBoard(rng);
    for (const dir of T.DIRS) {
      const copy = B.clone(cells);
      const before = laneMultisets(copy, dir);
      T.compact(copy, dir);
      assert.deepEqual(laneMultisets(copy, dir), before);
      assert.equal(B.count(copy), B.count(cells));
      assert.equal(T.compact(copy, dir).length, 0);
      assert.equal(T.movingCells(copy, dir), 0);
    }
  }
});

test('tilt properties hold on 20,000 random rest-state boards', () => {
  const rng = TB.RNG.create('tilt-props');
  let checked = 0;
  for (let n = 0; n < 5000; n++) {
    const cells = randomRestBoard(rng);
    for (const dir of T.DIRS) {
      const vertical = dir === 'up' || dir === 'down';
      const counts = B.laneCounts(cells, dir);
      const minLane = Math.min(...counts);
      const before = B.clone(cells);
      const copy = B.clone(cells);
      const res = T.tilt(copy, dir);
      // (1) lines cleared == min lane count, and preview agrees
      assert.equal(res.linesCleared, minLane);
      assert.equal(T.previewLines(before, dir), minLane);
      // (2) never completes a perpendicular line; (3) at most one clear step
      for (const st of res.steps) if (st.t === 'clear') {
        if (vertical) assert.equal(st.cols.length, 0); else assert.equal(st.rows.length, 0);
      }
      assert.ok(res.clearSteps <= 1);
      // (5) script replay reproduces the engine board
      assert.deepEqual(Array.from(replay(before, res.steps)), Array.from(copy));
      // (4) a second tilt in any direction right after clears nothing
      for (const d2 of T.DIRS) assert.equal(T.tilt(B.clone(copy), d2).linesCleared, 0);
      checked++;
    }
  }
  assert.equal(checked, 20000);
});

test('fitsAfterTilt matches a simulated tilt', () => {
  const rng = TB.RNG.create('fits');
  const shapes = [TB.Pieces.byId.sq3_0, TB.Pieces.byId.bar5_0];
  for (let n = 0; n < 300; n++) {
    const cells = randomRestBoard(rng);
    for (const dir of T.DIRS) {
      const c = B.clone(cells); T.tilt(c, dir);
      assert.equal(T.fitsAfterTilt(cells, dir, shapes), B.anyFits(c, shapes));
    }
  }
});

test('tutorial preset: down tilt empties the board after the two scripted placements', () => {
  const rows = ['........', '........', '..XX....', 'XX...XXX', '..X.X...', 'X..X....', '.X..X...', 'XXXXXXX.'];
  const cells = B.fromRows(rows);
  assert.equal(B.count(cells), 20);
  B.place(cells, TB.Pieces.byId.dot_0, 7, 7, 0);
  B.clearLines(cells, B.findFullLines(cells));
  assert.equal(B.count(cells), 13);
  B.place(cells, TB.Pieces.byId.bar3_0, 6, 5, 0);
  assert.deepEqual(B.findFullLines(cells), { rows: [], cols: [] });
  assert.equal(B.count(cells), 16);
  assert.deepEqual(B.colCounts(cells), [2, 2, 2, 2, 2, 2, 2, 2]);
  assert.equal(T.previewLines(cells, 'down'), 2);
  assert.equal(T.previewLines(cells, 'up'), 2);
  assert.equal(T.previewLines(cells, 'left'), 0);
  assert.equal(T.previewLines(cells, 'right'), 0);
  const res = T.tilt(cells, 'down');
  assert.equal(res.linesCleared, 2);
  assert.equal(B.count(cells), 0);
});
