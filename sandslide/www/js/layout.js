// Logical layout (360 x 600..800) letterboxed into the usable viewport (viewport minus safe-area insets minus ad banner).
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var LW = 360, LMIN = 600, LMAX = 800, CELL = 36, N = 8;
  var L = {
    W: 360, H: 640, dpr: 1, S: 1, ox: 0, oy: 0, L: 640,
    insets: { top: 0, right: 0, bottom: 0, left: 0 }, adInset: 0, landscape: false,
    rects: {}, version: 0
  };

  function build() {
    var extra = L.L - 640, r = {};
    r.hud = { x: 0, y: 0, w: LW, h: 80 };
    r.board = { x: 36, y: 116, w: CELL * N, h: CELL * N, cell: CELL };
    var b = r.board, gutter = 36;
    r.arrows = {
      up: { x: b.x + b.w / 2 - 28, y: b.y - gutter, w: 56, h: gutter, cx: b.x + b.w / 2, cy: b.y - gutter / 2 },
      down: { x: b.x + b.w / 2 - 28, y: b.y + b.h, w: 56, h: 44, cx: b.x + b.w / 2, cy: b.y + b.h + 22 },
      left: { x: 0, y: b.y + b.h / 2 - 28, w: gutter, h: 56, cx: gutter / 2, cy: b.y + b.h / 2 },
      right: { x: b.x + b.w, y: b.y + b.h / 2 - 28, w: gutter, h: 56, cx: b.x + b.w + gutter / 2, cy: b.y + b.h / 2 }
    };
    r.chip = { x: 4, y: b.y + b.h + 4, w: 140, h: 36 };
    if (extra >= 0) {
      r.tray = { x: 0, y: 452 + extra * 0.5, w: LW, h: 132 };
      r.bottom = { x: 0, y: 596 + extra, w: LW, h: 44 };
    } else {
      var shrink = -extra; // up to 40
      r.tray = { x: 0, y: 452 - shrink * 0.5, w: LW, h: 132 - shrink * 0.5 };
      r.bottom = { x: 0, y: 596 - shrink, w: LW, h: 44 };
    }
    r.tray.slots = [0, 1, 2].map(function (i) { return { x: i * 120, y: r.tray.y, w: 120, h: r.tray.h, cx: i * 120 + 60, cy: r.tray.y + r.tray.h / 2 }; });
    r.pieceScale = extra >= 0 ? 0.5 : 0.45;
    L.rects = r;
    L.version++;
  }

  function recompute() {
    var ins = L.insets;
    var uw = Math.max(1, L.W - ins.left - ins.right);
    var uh = Math.max(1, L.H - ins.top - ins.bottom - L.adInset);
    L.landscape = uw > uh;
    var lh = TB.Tween.clamp(Math.round(uh / uw * LW), LMIN, LMAX);
    if (L.landscape) lh = LMIN;
    L.L = lh;
    L.S = Math.min(uw / LW, uh / lh);
    L.ox = ins.left + (uw - LW * L.S) / 2;
    L.oy = ins.top + (uh - lh * L.S) / 2;
    build();
  }

  function resize(cssW, cssH, dpr) { L.W = cssW; L.H = cssH; L.dpr = dpr; recompute(); }
  function setInsets(ins) { L.insets = { top: ins.top || 0, right: ins.right || 0, bottom: ins.bottom || 0, left: ins.left || 0 }; recompute(); }
  function setAdInset(px) { L.adInset = px || 0; recompute(); }
  function toLogical(cx, cy) { return { x: (cx - L.ox) / L.S, y: (cy - L.oy) / L.S }; }
  function toClient(lx, ly) { return { x: lx * L.S + L.ox, y: ly * L.S + L.oy }; }
  function inRect(p, r) { return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h; }
  function cellAt(lx, ly) {
    var b = L.rects.board;
    var c = Math.floor((lx - b.x) / b.cell), r = Math.floor((ly - b.y) / b.cell);
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return { r: r, c: c };
  }
  function boardCssWidth() { return L.rects.board.w * L.S; }
  function cellCenter(idx) { var b = L.rects.board; return { x: b.x + (idx % N) * b.cell + b.cell / 2, y: b.y + Math.floor(idx / N) * b.cell + b.cell / 2 }; }
  function boardEdgeMarginCss() { return Math.min(L.rects.board.x * L.S + L.ox, (LW - L.rects.board.x - L.rects.board.w) * L.S + (L.W - (L.ox + LW * L.S))); }

  L.resize = resize; L.setInsets = setInsets; L.setAdInset = setAdInset; L.toLogical = toLogical; L.toClient = toClient;
  L.inRect = inRect; L.cellAt = cellAt; L.boardCssWidth = boardCssWidth; L.cellCenter = cellCenter; L.boardEdgeMarginCss = boardEdgeMarginCss;
  L.LW = LW; L.CELL = CELL;
  recompute();
  TB.Layout = L;
})(typeof globalThis !== 'undefined' ? globalThis : window);
