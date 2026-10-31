// Piece catalog (13 families, 37 fixed orientations; no rotation in play) and the hand generator.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Config = TB.Config, Board = TB.Board, RNG = TB.RNG;

  // base: cells as [row, col]; early/late: family weight at tier 0 / tier 1; color: palette index 0..7
  var FAMILIES = [
    { id: 'dot',    base: [[0, 0]],                                         early: 4, late: 2, color: 7 },
    { id: 'domino', base: [[0, 0], [0, 1]],                                 early: 6, late: 3, color: 1 },
    { id: 'bar3',   base: [[0, 0], [0, 1], [0, 2]],                         early: 8, late: 6, color: 0 },
    { id: 'corner', base: [[0, 0], [1, 0], [1, 1]],                         early: 8, late: 6, color: 2 },
    { id: 'bar4',   base: [[0, 0], [0, 1], [0, 2], [0, 3]],                 early: 7, late: 7, color: 4 },
    { id: 'sq2',    base: [[0, 0], [0, 1], [1, 0], [1, 1]],                 early: 7, late: 7, color: 3 },
    { id: 't',      base: [[0, 0], [0, 1], [0, 2], [1, 1]],                 early: 5, late: 7, color: 6 },
    { id: 'sz',     base: [[0, 1], [0, 2], [1, 0], [1, 1]],                 early: 4, late: 7, color: 5 },
    { id: 'lj',     base: [[0, 0], [1, 0], [2, 0], [2, 1]],                 early: 5, late: 7, color: 2 },
    { id: 'bar5',   base: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],         early: 3, late: 6, color: 4 },
    { id: 'bigl',   base: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],         early: 3, late: 6, color: 6 },
    { id: 'rect23', base: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], early: 4, late: 6, color: 0 },
    { id: 'sq3',    base: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], early: 2, late: 6, color: 3 }
  ];

  function normalize(cells) {
    var minR = Infinity, minC = Infinity;
    cells.forEach(function (p) { if (p[0] < minR) minR = p[0]; if (p[1] < minC) minC = p[1]; });
    return cells.map(function (p) { return [p[0] - minR, p[1] - minC]; })
      .sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]); });
  }
  function rotate(cells) { return normalize(cells.map(function (p) { return [p[1], -p[0]]; })); }
  function mirror(cells) { return normalize(cells.map(function (p) { return [p[0], -p[1]]; })); }
  function key(cells) { return cells.map(function (p) { return p[0] + ',' + p[1]; }).join(';'); }

  var CATALOG = [], byId = {}, byFamily = {};
  FAMILIES.forEach(function (fam) {
    var seen = {}, variants = [];
    var cur = normalize(fam.base);
    for (var m = 0; m < 2; m++) {
      for (var r = 0; r < 4; r++) {
        var k = key(cur);
        if (!seen[k]) { seen[k] = true; variants.push(cur); }
        cur = rotate(cur);
      }
      cur = mirror(normalize(fam.base));
    }
    byFamily[fam.id] = [];
    variants.forEach(function (cells, i) {
      var w = 0, h = 0;
      cells.forEach(function (p) { if (p[0] + 1 > h) h = p[0] + 1; if (p[1] + 1 > w) w = p[1] + 1; });
      var shape = { id: fam.id + '_' + i, family: fam.id, cells: cells, w: w, h: h, size: cells.length, color: fam.color };
      CATALOG.push(shape); byId[shape.id] = shape; byFamily[fam.id].push(shape);
    });
  });

  // Tier position 0..1 from the 1-based hand index (same in every mode).
  function tierT(handIndex) {
    var T = Config.TIERS;
    if (handIndex <= T.earlyUntilHand) return 0;
    if (handIndex >= T.lateFromHand) return 1;
    return (handIndex - T.earlyUntilHand) / (T.lateFromHand - T.earlyUntilHand);
  }
  // Big-piece cap per hand: early <=1 piece of >=5 cells; mid <=1 of >=6; late <=2 of >=6.
  function bigCap(t) { return t <= 0 ? { size: 5, max: 1 } : (t < 1 ? { size: 6, max: 1 } : { size: 6, max: 2 }); }
  function weightsAt(t) {
    return CATALOG.map(function (s) {
      var fam = FAMILIES.filter(function (f) { return f.id === s.family; })[0];
      return (fam.early + (fam.late - fam.early) * t) / byFamily[s.family].length;
    });
  }
  function drawOne(rng, weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    var x = rng.next() * total;
    for (i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return CATALOG[i]; }
    return CATALOG[CATALOG.length - 1];
  }
  function violatesCap(hand, shape, cap) {
    if (shape.size < cap.size) return false;
    var n = 1;
    for (var i = 0; i < hand.length; i++) if (byId[hand[i]].size >= cap.size) n++;
    return n > cap.max;
  }

  // drawHand(seed, handIndex, { board, stored, rules }) -> [id, id, id]
  // Fair redraw (silent, <= rules.fairRedraws) only when no piece fits AND no tilt is stored.
  function drawHand(seed, handIndex, opts) {
    opts = opts || {};
    var rng = RNG.handRng(seed, handIndex);
    var t = tierT(handIndex), weights = weightsAt(t), cap = bigCap(t);
    function attempt() {
      var hand = [];
      for (var i = 0; i < Config.HAND_SIZE; i++) {
        var s = drawOne(rng, weights);
        for (var tries = 0; tries < 20 && violatesCap(hand, s, cap); tries++) s = drawOne(rng, weights);
        hand.push(s.id);
      }
      return hand;
    }
    var hand = attempt();
    var redraws = opts.rules ? (opts.rules.fairRedraws | 0) : 0;
    if (opts.board && redraws > 0 && !(opts.stored > 0)) {
      for (var n = 0; n < redraws && !Board.anyFits(opts.board, hand.map(function (id) { return byId[id]; })); n++) hand = attempt();
    }
    return hand;
  }

  TB.Pieces = { FAMILIES: FAMILIES, CATALOG: CATALOG, byId: byId, byFamily: byFamily, tierT: tierT, bigCap: bigCap,
    weightsAt: weightsAt, drawHand: drawHand, get: function (id) { return byId[id] || null; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
