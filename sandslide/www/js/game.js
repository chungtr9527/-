// Game engine: pure, serializable, mode-aware (classic / daily / tutorial). No DOM, no Date, no Math.random.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Config = TB.Config, Board = TB.Board, Pieces = TB.Pieces, Tilt = TB.Tilt, Scoring = TB.Scoring;

  function shapesOf(hand) { return hand.map(function (id) { return id ? Pieces.byId[id] : null; }); }

  function Game(s) { this.s = s; }

  Game.prototype.nextCost = function () { var s = this.s; return s.rules.baseCharge + s.rules.chargeGrowth * s.tiltsEarned; };
  Game.prototype.isOver = function () { return this.s.over; };
  Game.prototype.handShapes = function () { return shapesOf(this.s.hand); };
  Game.prototype.fill = function () { return Board.count(this.s.board); };

  Game.prototype._addEnergy = function (n) {
    var s = this.s;
    if (n <= 0 || s.stored >= s.rules.storedCap) return 0; // frozen at MAX
    s.energy += n;
    while (s.stored < s.rules.storedCap && s.energy >= this.nextCost()) {
      s.energy -= this.nextCost();
      s.stored++; s.tiltsEarned++;
    }
    return n;
  };

  Game.prototype._deal = function (force) {
    var s = this.s;
    s.handIndex++;
    s.hand = Pieces.drawHand(s.seed, s.handIndex, { board: s.board, stored: force ? 0 : s.stored, rules: s.rules });
    s.locked = [false, false, false];
  };

  Game.prototype._updateStuck = function () {
    var s = this.s;
    var live = s.hand.filter(function (id, i) { return id && !s.locked[i]; }).map(function (id) { return Pieces.byId[id]; });
    var fits = live.length ? Board.anyFits(s.board, live) : true;
    s.needsTilt = !fits && s.stored > 0;
    if (!fits && s.stored === 0) s.over = true;
  };

  Game.prototype.canPlace = function (i, r, c) {
    var s = this.s;
    if (s.over || !s.hand[i] || s.locked[i]) return false;
    return Board.canPlace(s.board, Pieces.byId[s.hand[i]], r, c);
  };

  // Returns { ok, steps, points, lines, combo, allClear, refilled, over, needsTilt, energyGained, tiltsGained }
  Game.prototype.place = function (i, r, c) {
    var s = this.s;
    if (!this.canPlace(i, r, c)) return { ok: false };
    var shape = Pieces.byId[s.hand[i]];
    var written = Board.place(s.board, shape, r, c, shape.color);
    s.hand[i] = null; s.placements++;
    var points = Scoring.placement(shape);
    var lines = Board.findFullLines(s.board), n = lines.rows.length + lines.cols.length;
    var cleared = n ? Board.clearLines(s.board, lines) : [];
    var cs = Scoring.afterEvent(s, n, 'place'); s.combo = cs.combo; s.missStreak = cs.missStreak;
    if (n) { points += Scoring.clearPoints(n, s.combo); s.linesTotal += n; }
    var allClear = n > 0 && Board.count(s.board) === 0;
    if (allClear) { points += Scoring.allClear; s.allClears++; }
    s.score += points;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
    var storedBefore = s.stored;
    var gained = this._addEnergy(s.rules.energyPerCell * shape.size + s.rules.energyPerLine * n);
    var refilled = false;
    if (!s.hand[0] && !s.hand[1] && !s.hand[2]) {
      if (s.rules.hands && s.handIndex >= s.rules.hands) { s.over = true; s.completed = true; }
      else { this._deal(false); refilled = true; }
    }
    if (!s.over) this._updateStuck();
    var steps = [{ t: 'place', cells: written, color: shape.color, slot: i }];
    if (n) steps.push({ t: 'clear', rows: lines.rows, cols: lines.cols, cells: cleared, lines: n, step: 1 });
    steps.push({ t: 'settle' });
    return { ok: true, steps: steps, points: points, lines: n, combo: s.combo, allClear: allClear, refilled: refilled,
      over: s.over, completed: s.completed, needsTilt: s.needsTilt, energyGained: gained, tiltsGained: s.stored - storedBefore };
  };

  // Returns { ok, noop, steps, points, lines, combo, allClear, over, needsTilt, banner }
  Game.prototype.tilt = function (dir) {
    var s = this.s;
    if (s.over) return { ok: false, reason: 'over' };
    if (s.stored < 1) return { ok: false, reason: 'noTilt' };
    if (Tilt.DIRS.indexOf(dir) < 0) return { ok: false, reason: 'dir' };
    var res = Tilt.tilt(s.board, dir);
    if (!res.changed) return { ok: true, noop: true, steps: res.steps, lines: 0, points: 0, combo: s.combo, over: false, needsTilt: s.needsTilt, banner: false };
    s.stored--; s.tiltsUsed++; s.lastTilt = dir;
    var n = res.linesCleared;
    var cs = Scoring.afterEvent(s, n, 'tilt'); s.combo = cs.combo; s.missStreak = cs.missStreak;
    var points = n ? Scoring.clearPoints(n, s.combo) : 0;
    var allClear = n > 0 && Board.count(s.board) === 0;
    if (allClear) { points += Scoring.allClear; s.allClears++; }
    s.score += points; s.linesTotal += n;
    if (n > s.bestTiltLines) s.bestTiltLines = n;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
    this._addEnergy(s.rules.energyPerLine * n);
    this._updateStuck();
    return { ok: true, noop: false, steps: res.steps, points: points, lines: n, combo: s.combo, allClear: allClear,
      over: s.over, needsTilt: s.needsTilt, banner: n >= Config.SCORE.bannerMinLines };
  };

  Game.prototype.previewLines = function (dir) { return Tilt.previewLines(this.s.board, dir); };
  Game.prototype.fitsAfterTilt = function (dir) {
    var s = this.s, live = this.handShapes().filter(function (sh, i) { return sh && !s.locked[i]; });
    return live.length ? Tilt.fitsAfterTilt(s.board, dir, live) : true;
  };
  // Per-direction info for the arrows: { lines, fits, moving }
  Game.prototype.arrowInfo = function () {
    var out = {}, self = this;
    Tilt.DIRS.forEach(function (d) { out[d] = { lines: self.previewLines(d), fits: self.fitsAfterTilt(d), moving: Tilt.movingCells(self.s.board, d) }; });
    return out;
  };

  Game.prototype.rescueAvailable = function () { var s = this.s; return s.over && !s.completed && s.rescuesUsed < s.rules.rescuePerGame; };
  // Rewarded rescue: clear the fullest rows/cols (no score, no energy, no combo change), +1 stored tilt, fresh fitting hand.
  Game.prototype.rescue = function () {
    var s = this.s;
    if (!this.rescueAvailable()) return { ok: false };
    var lines = Board.fullestLines(s.board, Config.RESCUE.rows, Config.RESCUE.cols);
    var cleared = Board.clearLines(s.board, lines);
    s.rescuesUsed++; s.over = false; s.needsTilt = false;
    if (s.stored < 1) s.stored = 1;
    this._deal(true);
    this._updateStuck();
    return { ok: true, steps: [{ t: 'clear', rows: lines.rows, cols: lines.cols, cells: cleared, lines: lines.rows.length + lines.cols.length, step: 1, rescue: true }, { t: 'settle' }], over: s.over };
  };

  Game.prototype.extraTiltAvailable = function () {
    var s = this.s, E = Config.EXTRA_TILT;
    return !s.over && s.extraTiltsUsed < s.rules.extraTiltPerGame && s.stored === 0 &&
      s.energy < this.nextCost() * E.maxEnergyRatio && this.fill() >= E.minFill;
  };
  // Rewarded "+1 Tilt": one stored tilt, escalation counter untouched.
  Game.prototype.addTilt = function () {
    var s = this.s;
    if (s.over || s.extraTiltsUsed >= s.rules.extraTiltPerGame) return { ok: false };
    s.extraTiltsUsed++;
    if (s.stored < s.rules.storedCap) s.stored++;
    this._updateStuck();
    return { ok: true, stored: s.stored };
  };

  Game.prototype.serialize = function () {
    var s = this.s;
    return { v: 1, mode: s.mode, seed: s.seed, rules: s.rules, board: Array.prototype.slice.call(s.board), hand: s.hand.slice(), locked: s.locked.slice(),
      handIndex: s.handIndex, score: s.score, combo: s.combo, missStreak: s.missStreak, energy: s.energy, stored: s.stored,
      tiltsEarned: s.tiltsEarned, tiltsUsed: s.tiltsUsed, placements: s.placements, linesTotal: s.linesTotal, bestTiltLines: s.bestTiltLines,
      bestCombo: s.bestCombo, allClears: s.allClears, rescuesUsed: s.rescuesUsed, extraTiltsUsed: s.extraTiltsUsed,
      over: s.over, completed: s.completed, needsTilt: s.needsTilt, lastTilt: s.lastTilt, meta: s.meta || {} };
  };
  Game.prototype.snapshot = function () { return this.serialize(); };

  function baseState(mode, seed, rules) {
    return { mode: mode, seed: String(seed), rules: rules, board: Board.create(), hand: [null, null, null], locked: [false, false, false], handIndex: 0,
      score: 0, combo: 0, missStreak: 0, energy: rules.startEnergy, stored: 0, tiltsEarned: 0, tiltsUsed: 0, placements: 0, linesTotal: 0,
      bestTiltLines: 0, bestCombo: 0, allClears: 0, rescuesUsed: 0, extraTiltsUsed: 0, over: false, completed: false, needsTilt: false, lastTilt: null, meta: {} };
  }

  // create({ mode, seed, rules?, preset?, meta? })
  // preset: { rows: [8 strings], hand: [ids], energy?, locked?: [bool x3], stored? }
  function create(opts) {
    opts = opts || {};
    var mode = opts.mode || 'classic';
    var rules = Object.assign({}, Config.RULES[mode] || Config.RULES.classic, opts.rules || {});
    var s = baseState(mode, opts.seed != null ? opts.seed : 'seed', rules);
    if (opts.meta) s.meta = opts.meta;
    var game = new Game(s);
    if (opts.preset) {
      var p = opts.preset;
      if (p.rows) s.board = Board.fromRows(p.rows, p.colorFn);
      s.hand = (p.hand || [null, null, null]).slice();
      s.locked = (p.locked || [false, false, false]).slice();
      if (p.energy != null) s.energy = p.energy;
      if (p.stored != null) s.stored = p.stored;
      s.handIndex = p.handIndex || 1;
      game._updateStuck();
    } else {
      game._deal(false);
    }
    return game;
  }

  function restore(json) {
    if (!json || json.v !== 1) return null;
    var s = baseState(json.mode, json.seed, json.rules);
    Object.keys(s).forEach(function (k) { if (k in json && k !== 'board') s[k] = json[k]; });
    s.board = Uint8Array.from(json.board);
    s.hand = json.hand.slice(); s.locked = (json.locked || [false, false, false]).slice();
    return new Game(s);
  }

  TB.Game = { create: create, restore: restore, Game: Game };
})(typeof globalThis !== 'undefined' ? globalThis : window);
