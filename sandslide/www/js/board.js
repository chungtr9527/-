// 8x8 board as Uint8Array(64): 0 = empty, 1..8 = block colour index + 1.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var N = 8;

  function create() { return new Uint8Array(N * N); }
  function clone(cells) { return new Uint8Array(cells); }
  function idx(r, c) { return r * N + c; }
  function count(cells) { var n = 0; for (var i = 0; i < N * N; i++) if (cells[i]) n++; return n; }

  function canPlace(cells, shape, r, c) {
    var sc = shape.cells;
    for (var i = 0; i < sc.length; i++) {
      var rr = r + sc[i][0], cc = c + sc[i][1];
      if (rr < 0 || rr >= N || cc < 0 || cc >= N || cells[rr * N + cc]) return false;
    }
    return true;
  }
  function place(cells, shape, r, c, colorIndex) {
    var written = [], sc = shape.cells, v = (colorIndex | 0) + 1;
    for (var i = 0; i < sc.length; i++) { var k = (r + sc[i][0]) * N + (c + sc[i][1]); cells[k] = v; written.push(k); }
    return written;
  }
  function fitsAnywhere(cells, shape) {
    for (var r = 0; r <= N - shape.h; r++) for (var c = 0; c <= N - shape.w; c++) if (canPlace(cells, shape, r, c)) return true;
    return false;
  }
  function anyFits(cells, shapes) {
    for (var i = 0; i < shapes.length; i++) if (shapes[i] && fitsAnywhere(cells, shapes[i])) return true;
    return false;
  }
  function placements(cells, shape) {
    var out = [];
    for (var r = 0; r <= N - shape.h; r++) for (var c = 0; c <= N - shape.w; c++) if (canPlace(cells, shape, r, c)) out.push([r, c]);
    return out;
  }
  function rowCounts(cells) {
    var out = new Array(N);
    for (var r = 0; r < N; r++) { var n = 0; for (var c = 0; c < N; c++) if (cells[r * N + c]) n++; out[r] = n; }
    return out;
  }
  function colCounts(cells) {
    var out = new Array(N);
    for (var c = 0; c < N; c++) { var n = 0; for (var r = 0; r < N; r++) if (cells[r * N + c]) n++; out[c] = n; }
    return out;
  }
  // Lanes along which blocks slide for a direction: columns for up/down, rows for left/right.
  function laneCounts(cells, dir) { return (dir === 'up' || dir === 'down') ? colCounts(cells) : rowCounts(cells); }

  function findFullLines(cells) {
    var rows = [], cols = [], rc = rowCounts(cells), cc = colCounts(cells);
    for (var i = 0; i < N; i++) { if (rc[i] === N) rows.push(i); if (cc[i] === N) cols.push(i); }
    return { rows: rows, cols: cols };
  }
  // Clears rows and columns simultaneously; an intersection cell is reported once.
  function clearLines(cells, lines) {
    var cleared = [], seen = {};
    for (var i = 0; i < lines.rows.length; i++) for (var c = 0; c < N; c++) mark(lines.rows[i] * N + c);
    for (var j = 0; j < lines.cols.length; j++) for (var r = 0; r < N; r++) mark(r * N + lines.cols[j]);
    function mark(k) { if (seen[k]) return; seen[k] = true; if (cells[k]) { cleared.push({ idx: k, color: cells[k] - 1 }); cells[k] = 0; } }
    return cleared;
  }
  // The n fullest rows and columns (by count, ties by index). Used by the rescue.
  function fullestLines(cells, nRows, nCols) {
    var rc = rowCounts(cells), cc = colCounts(cells);
    function top(counts, n) {
      var order = [];
      for (var i = 0; i < N; i++) order.push(i);
      order.sort(function (a, b) { return (counts[b] - counts[a]) || (a - b); });
      return order.slice(0, n).filter(function (i) { return counts[i] > 0; }).sort(function (a, b) { return a - b; });
    }
    return { rows: top(rc, nRows), cols: top(cc, nCols) };
  }
  function toRows(cells) {
    var rows = [];
    for (var r = 0; r < N; r++) { var s = ''; for (var c = 0; c < N; c++) s += cells[r * N + c] ? 'X' : '.'; rows.push(s); }
    return rows;
  }
  // rows: 8 strings of 8 chars, 'X' = filled. colorFn(r, c) -> colour index 0..7 (optional).
  function fromRows(rows, colorFn) {
    var cells = create();
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (rows[r] && rows[r][c] === 'X') cells[r * N + c] = (colorFn ? colorFn(r, c) : (r * 3 + c) % 8) + 1;
    return cells;
  }

  TB.Board = { N: N, create: create, clone: clone, idx: idx, count: count, canPlace: canPlace, place: place,
    fitsAnywhere: fitsAnywhere, anyFits: anyFits, placements: placements, rowCounts: rowCounts, colCounts: colCounts,
    laneCounts: laneCounts, findFullLines: findFullLines, clearLines: clearLines, fullestLines: fullestLines,
    toRows: toRows, fromRows: fromRows };
})(typeof globalThis !== 'undefined' ? globalThis : window);
