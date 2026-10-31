// Balance simulation: greedy bots play Sandslide with the real engine.
//   node scripts/sim.js            (quick: 300 games per config)
//   node scripts/sim.js --games 1000
// Prints a markdown table; targets from the plan: classic median 150-400 placements, <2% games > 600,
// >= 70% of voluntary tilts clear >= 2 lines; daily early deaths < 10%.
'use strict';
const TB = require('../test/helpers/load-engine');
const B = TB.Board, P = TB.Pieces, T = TB.Tilt, G = TB.Game;
const args = process.argv.slice(2);
const GAMES = Number((args.find(a => a.startsWith('--games=')) || '').split('=')[1] || (args.includes('--games') ? args[args.indexOf('--games') + 1] : 300));
const CAP = 600;

function evaluate(cells, shape, r, c, rc, cc) {
  // lines completed by this placement
  const addR = new Map(), addC = new Map();
  for (const [dr, dc] of shape.cells) { addR.set(r + dr, (addR.get(r + dr) || 0) + 1); addC.set(c + dc, (addC.get(c + dc) || 0) + 1); }
  let lines = 0;
  for (const [row, n] of addR) if (rc[row] + n === 8) lines++;
  for (const [col, n] of addC) if (cc[col] + n === 8) lines++;
  // compactness: filled neighbours / walls around the placed cells
  let touch = 0;
  for (const [dr, dc] of shape.cells) {
    const rr = r + dr, c2 = c + dc;
    for (const [er, ec] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = rr + er, nc = c2 + ec;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) touch++;
      else if (cells[nr * 8 + nc]) touch++;
      else if (shape.cells.some(([a, b]) => r + a === nr && c + b === nc)) touch++;
    }
  }
  // isolated empties created next to the piece (holes)
  let holes = 0;
  const seen = new Set();
  for (const [dr, dc] of shape.cells) {
    for (const [er, ec] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr + er, nc = c + dc + ec;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      const k = nr * 8 + nc;
      if (cells[k] || seen.has(k) || shape.cells.some(([a, b]) => r + a === nr && c + b === nc)) continue;
      seen.add(k);
      let free = 0;
      for (const [fr, fc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const mr = nr + fr, mc = nc + fc;
        if (mr < 0 || mr >= 8 || mc < 0 || mc >= 8) continue;
        if (!cells[mr * 8 + mc] && !shape.cells.some(([a, b]) => r + a === mr && c + b === mc)) free++;
      }
      if (free === 0) holes++;
    }
  }
  return lines * 60 + touch * 2 - holes * 9;
}

function bestPlacement(game, rng, eps) {
  const s = game.s, cells = s.board;
  const rc = B.rowCounts(cells), cc = B.colCounts(cells);
  const options = [];
  for (let i = 0; i < 3; i++) {
    if (!s.hand[i]) continue;
    const shape = P.byId[s.hand[i]];
    for (const [r, c] of B.placements(cells, shape)) options.push({ i, r, c, v: evaluate(cells, shape, r, c, rc, cc) });
  }
  if (!options.length) return null;
  if (eps > 0 && rng.next() < eps) return options[rng.int(options.length)];
  let best = options[0];
  for (const o of options) if (o.v > best.v || (o.v === best.v && rng.next() < 0.5)) best = o;
  return best;
}

function bestDir(game, needFit) {
  const info = game.arrowInfo();
  let best = null;
  for (const d of T.DIRS) {
    const x = info[d];
    const score = (needFit && x.fits ? 1000 : 0) + x.lines * 10 + x.moving * 0.01;
    if (!best || score > best.score) best = { dir: d, score, lines: x.lines, fits: x.fits };
  }
  return best;
}

// policy: 'lazy' (tilt only when stuck) | 'sensible' (>=2 lines, or at MAX with >=1) | 'eager' (>=1 line)
function playGame(seedStr, mode, policy, eps, rulesOverride) {
  const game = G.create({ mode, seed: seedStr, rules: rulesOverride });
  const rng = TB.RNG.create('bot-' + seedStr);
  const stats = { placements: 0, tilts: 0, voluntary: 0, voluntary2: 0, stuckSaved: 0, capped: false };
  while (!game.isOver() && stats.placements < CAP) {
    const s = game.s;
    if (s.needsTilt) {
      const d = bestDir(game, true);
      game.tilt(d.dir); stats.tilts++; stats.stuckSaved++;
      continue;
    }
    if (s.stored > 0 && policy !== 'lazy') {
      const d = bestDir(game, false);
      const atMax = s.stored >= s.rules.storedCap;
      const want = policy === 'eager' ? d.lines >= 1 : (d.lines >= 2 || (atMax && d.lines >= 1));
      if (want) { const r = game.tilt(d.dir); if (!r.noop) { stats.tilts++; stats.voluntary++; if (r.lines >= 2) stats.voluntary2++; } continue; }
    }
    const mv = bestPlacement(game, rng, eps);
    if (!mv) break;
    game.place(mv.i, mv.r, mv.c); stats.placements++;
  }
  stats.capped = stats.placements >= CAP && !game.isOver();
  stats.score = game.s.score; stats.hands = game.s.handIndex; stats.completed = !!game.s.completed;
  return stats;
}

function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; }

function runConfig(name, mode, policy, eps, rules) {
  const all = [];
  for (let i = 0; i < GAMES; i++) all.push(playGame(name + '-' + i, mode, policy, eps, rules));
  const pl = all.map(s => s.placements), sc = all.map(s => s.score);
  const tilts = all.reduce((a, s) => a + s.tilts, 0), vol = all.reduce((a, s) => a + s.voluntary, 0), vol2 = all.reduce((a, s) => a + s.voluntary2, 0);
  const cappedPct = 100 * all.filter(s => s.capped).length / all.length;
  const row = {
    config: name, games: all.length,
    placementsMed: median(pl), placementsP90: pct(pl, 0.9), minutesMed: (median(pl) * 5 / 60).toFixed(1),
    scoreMed: median(sc), scoreP90: pct(sc, 0.9),
    tiltsPerGame: (tilts / all.length).toFixed(2), tiltsPer100: (100 * tilts / pl.reduce((a, b) => a + b, 0)).toFixed(1),
    voluntary2Pct: vol ? (100 * vol2 / vol).toFixed(0) : '-', cappedPct: cappedPct.toFixed(1)
  };
  if (mode === 'daily') row.earlyDeathPct = (100 * all.filter(s => !s.completed).length / all.length).toFixed(1);
  return row;
}

const configs = [
  ['classic growth15 sensible (greedy)', 'classic', 'sensible', 0, null],
  ['classic growth15 sensible eps0.1', 'classic', 'sensible', 0.1, null],
  ['classic growth15 sensible eps0.3', 'classic', 'sensible', 0.3, null],
  ['classic growth15 lazy (greedy)', 'classic', 'lazy', 0, null],
  ['classic growth15 eager eps0.1', 'classic', 'eager', 0.1, null],
  ['classic growth0 (flat 60) sensible eps0.1', 'classic', 'sensible', 0.1, { chargeGrowth: 0 }],
  ['classic growth10 sensible eps0.1', 'classic', 'sensible', 0.1, { chargeGrowth: 10 }],
  ['classic growth20 sensible eps0.1', 'classic', 'sensible', 0.1, { chargeGrowth: 20 }],
  ['classic no-tilt eps0.1 (reference)', 'classic', 'lazy', 0.1, { storedCap: 0, startEnergy: 0 }],
  ['daily 20 hands sensible eps0.1', 'daily', 'sensible', 0.1, null],
  ['daily 20 hands sensible eps0.3', 'daily', 'sensible', 0.3, null]
];
const t0 = Date.now();
const rows = configs.map(c => { const r = runConfig(...c); process.stderr.write('.'); return r; });
process.stderr.write('\n');
const cols = ['config', 'games', 'placementsMed', 'placementsP90', 'minutesMed', 'scoreMed', 'scoreP90', 'tiltsPerGame', 'tiltsPer100', 'voluntary2Pct', 'cappedPct', 'earlyDeathPct'];
console.log('| ' + cols.join(' | ') + ' |');
console.log('|' + cols.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + cols.map(c => r[c] == null ? '' : r[c]).join(' | ') + ' |');
console.log(`\n${GAMES} games per config, cap ${CAP} placements, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
