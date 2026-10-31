// Gravity tilt: per-cell "sand" compaction toward one edge, then simultaneous line clears, repeated until stable.
// Returns an animation script (plain data) that the renderer replays; the board passed in is mutated to the final state.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Board = TB.Board, N = 8;
  var DIRS = ['up', 'down', 'left', 'right'];

  // Indices of one lane ordered from the wall ("floor") outward.
  function laneIndices(dir, lane) {
    var out = new Array(N);
    for (var k = 0; k < N; k++) {
      var r, c;
      if (dir === 'up') { r = k; c = lane; }
      else if (dir === 'down') { r = N - 1 - k; c = lane; }
      else if (dir === 'left') { r = lane; c = k; }
      else { r = lane; c = N - 1 - k; }
      out[k] = r * N + c;
    }
    return out;
  }

  // Packs every lane toward the wall, preserving order inside the lane. Mutates; returns the moves.
  function compact(cells, dir) {
    var moves = [];
    for (var lane = 0; lane < N; lane++) {
      var idx = laneIndices(dir, lane), write = 0;
      for (var read = 0; read < N; read++) {
        var v = cells[idx[read]];
        if (!v) continue;
        if (read !== write) {
          cells[idx[write]] = v; cells[idx[read]] = 0;
          moves.push({ from: idx[read], to: idx[write], color: v - 1, dist: read - write });
        }
        write++;
      }
    }
    return moves;
  }

  function tilt(cells, dir) {
    var steps = [], linesCleared = 0, cellsCleared = 0, moved = false, clears = 0;
    for (var guard = 0; guard < 8; guard++) {
      var moves = compact(cells, dir);
      if (moves.length) { moved = true; steps.push({ t: 'slide', dir: dir, moves: moves }); }
      var lines = Board.findFullLines(cells);
      var n = lines.rows.length + lines.cols.length;
      if (!n) break;
      var cleared = Board.clearLines(cells, lines);
      clears++; linesCleared += n; cellsCleared += cleared.length;
      steps.push({ t: 'clear', rows: lines.rows, cols: lines.cols, cells: cleared, lines: n, step: clears });
    }
    steps.push({ t: 'settle' });
    return { changed: moved || linesCleared > 0, moved: moved, linesCleared: linesCleared, cellsCleared: cellsCleared, clearSteps: clears, steps: steps };
  }

  // Exact number of lines a tilt in `dir` would clear (simulated on a copy).
  function previewLines(cells, dir) { return tilt(Board.clone(cells), dir).linesCleared; }
  // Would any of these shapes fit after tilting in `dir`?
  function fitsAfterTilt(cells, dir, shapes) { var c = Board.clone(cells); tilt(c, dir); return Board.anyFits(c, shapes); }
  // Cells that would move in `dir` (0 when the board is already packed that way).
  function movingCells(cells, dir) { return compact(Board.clone(cells), dir).length; }

  TB.Tilt = { DIRS: DIRS, laneIndices: laneIndices, compact: compact, tilt: tilt, previewLines: previewLines, fitsAfterTilt: fitsAfterTilt, movingCells: movingCells };
})(typeof globalThis !== 'undefined' ? globalThis : window);
