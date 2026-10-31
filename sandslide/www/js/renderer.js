// Canvas renderer + FX (animation script player). Logical coordinates from TB.Layout; sprites cached per cell size.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Config = TB.Config, Layout = TB.Layout, Tween = TB.Tween, Particles = TB.Particles, Tilt = TB.Tilt;
  var A = Config.ANIM, N = 8;
  var canvas = null, ctx = null, palette = Config.PALETTE, paletteIndex = 0;
  var spriteCache = {}, bgCache = null, bgKey = '';
  var fontStack = g.__FONT_STACK || (TB.I18N && TB.I18N.fontStack) || 'system-ui, "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  var reduced = false, quality = 1;

  // ---------- FX state (read by draw functions, written by the script player) ----------
  var FX = {
    hidden: {},            // idx -> true while a settled cell must not be drawn (in flight)
    cellScale: {},         // idx -> scale for bump/squash
    flying: [],            // {x, y, color, scale}
    clearing: [],          // {idx, color, scale, alpha}
    flashLines: null,      // {rows, cols, alpha}
    texts: [],             // {x, y, text, alpha, scale, color, size}
    boardOffset: { x: 0, y: 0 },
    shake: { x: 0, y: 0 },
    banner: null,          // {text, alpha, scale}
    meterGlow: 0, pulse: 0,
    locked: false, lockUntil: 0
  };

  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, f) { var c = hexToRgb(h); return 'rgb(' + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v * f))); }).join(',') + ')'; }
  function withAlpha(h, a) { var c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  // Pre-rendered block sprite at device resolution for the given logical size.
  function blockSprite(colorIndex, size, variant) {
    var px = Math.max(2, Math.round(size * Layout.S * Layout.dpr));
    var key = colorIndex + ':' + px + ':' + (variant || '') + ':' + paletteIndex;
    if (spriteCache[key]) return spriteCache[key];
    var cv = document.createElement('canvas'); cv.width = px; cv.height = px;
    var c = cv.getContext('2d');
    var col = palette.blocks[colorIndex % 8];
    var gap = px * 0.07, r = px * 0.2;
    if (variant === 'ghost') {
      c.globalAlpha = 0.55; c.fillStyle = col; roundRect(c, gap, gap, px - 2 * gap, px - 2 * gap, r); c.fill();
      c.globalAlpha = 1; c.lineWidth = Math.max(1, px * 0.06); c.strokeStyle = col; roundRect(c, gap, gap, px - 2 * gap, px - 2 * gap, r); c.stroke();
    } else {
      c.fillStyle = shade(col, 0.72); roundRect(c, gap, gap, px - 2 * gap, px - 2 * gap, r); c.fill();              // shade
      c.fillStyle = col; roundRect(c, gap, gap, px - 2 * gap, px - 2 * gap - px * 0.08, r); c.fill();              // body
      c.fillStyle = 'rgba(255,255,255,0.28)'; roundRect(c, gap + px * 0.14, gap + px * 0.1, px - 2 * gap - px * 0.28, px * 0.14, px * 0.07); c.fill(); // gloss
      if (variant === 'bright') { c.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(c, gap, gap, px - 2 * gap, px - 2 * gap, r); c.fill(); }
    }
    spriteCache[key] = cv;
    return cv;
  }
  function drawBlock(colorIndex, x, y, size, scale, alpha, variant) {
    var sp = blockSprite(colorIndex, size, variant);
    var s = size * (scale || 1);
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp, x + (size - s) / 2, y + (size - s) / 2, s, s);
    if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
  }
  function drawShape(shape, x, y, cell, scale, alpha, variant) {
    for (var i = 0; i < shape.cells.length; i++) drawBlock(shape.color, x + shape.cells[i][1] * cell, y + shape.cells[i][0] * cell, cell, scale, alpha, variant);
  }

  function font(size, weight) { return (weight || 600) + ' ' + Math.round(size) + 'px ' + fontStack; }
  function text(str, x, y, opts) {
    opts = opts || {};
    ctx.font = font(opts.size || 16, opts.weight);
    ctx.fillStyle = opts.color || palette.text;
    ctx.textAlign = opts.align || 'left'; ctx.textBaseline = opts.baseline || 'middle';
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.maxWidth) ctx.fillText(str, x, y, opts.maxWidth); else ctx.fillText(str, x, y);
    if (opts.alpha != null) ctx.globalAlpha = 1;
  }
  function measure(str, size, weight) { ctx.font = font(size, weight); return ctx.measureText(str).width; }

  // ---------- setup ----------
  function init(cv) { canvas = cv; ctx = cv.getContext('2d', { alpha: false }); }
  function resize() {
    var dpr = Math.min(g.devicePixelRatio || 1, Config.FX.maxDpr) * (quality < 1 ? Config.FX.lowEndDpr / Config.FX.maxDpr : 1);
    var w = g.innerWidth, h = g.innerHeight;
    if (g.visualViewport) { w = Math.round(g.visualViewport.width); h = Math.round(g.visualViewport.height); }
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    Layout.resize(w, h, dpr);
    spriteCache = {}; bgCache = null;
  }
  function setPalette(index) {
    paletteIndex = index | 0;
    var base = Config.PALETTE;
    if (!paletteIndex) { palette = base; }
    else {
      // rotate block hues by 40° * k, keep the dark background family
      palette = Object.assign({}, base, { blocks: base.blocks.map(function (h) { return rotateHue(h, 40 * paletteIndex); }) });
    }
    spriteCache = {}; bgCache = null;
  }
  function rotateHue(hex, deg) {
    var c = hexToRgb(hex).map(function (v) { return v / 255; }), r = c[0], gg = c[1], b = c[2];
    var max = Math.max(r, gg, b), min = Math.min(r, gg, b), h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d) { s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((gg - b) / d + (gg < b ? 6 : 0)); else if (max === gg) h = (b - r) / d + 2; else h = (r - gg) / d + 4; h /= 6; }
    h = (h + deg / 360) % 1;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var out = [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); });
    return '#' + out.join('');
  }
  function setReduced(v) { reduced = !!v; }
  function setQuality(q) { quality = q; Particles.setQuality(q < 1 ? 0.5 : 1); }

  // ---------- frame ----------
  function begin() {
    var dpr = Layout.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * Layout.S, 0, 0, dpr * Layout.S, Layout.ox * dpr, Layout.oy * dpr);
    ctx.translate(FX.shake.x, FX.shake.y);
  }

  function drawBoardBase(game) {
    var b = Layout.rects.board, cell = b.cell;
    var ox = FX.boardOffset.x, oy = FX.boardOffset.y;
    ctx.save(); ctx.translate(ox, oy);
    // frame / meter ring
    ctx.fillStyle = palette.board; roundRect(ctx, b.x - 6, b.y - 6, b.w + 12, b.h + 12, 12); ctx.fill();
    // empty cells
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      ctx.fillStyle = palette.empty; roundRect(ctx, b.x + c * cell + 2, b.y + r * cell + 2, cell - 4, cell - 4, 6); ctx.fill();
    }
    ctx.restore();
  }
  function drawMeterRing(game) {
    if (!game) return;
    var b = Layout.rects.board, s = game.s, cost = game.nextCost();
    var frac = s.stored >= s.rules.storedCap ? 1 : Math.min(1, s.energy / cost);
    var perim = 2 * (b.w + 12) + 2 * (b.h + 12);
    ctx.save(); ctx.translate(FX.boardOffset.x, FX.boardOffset.y);
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    var full = s.stored >= s.rules.storedCap;
    ctx.strokeStyle = full ? palette.accent : withAlpha(palette.accent, 0.9);
    if (FX.meterGlow > 0) { ctx.shadowColor = palette.accent; ctx.shadowBlur = 12 * FX.meterGlow; }
    ctx.setLineDash([perim * frac, perim]);
    ctx.lineDashOffset = 0;
    roundRect(ctx, b.x - 6, b.y - 6, b.w + 12, b.h + 12, 12); ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    ctx.restore();
  }
  function drawCells(game) {
    if (!game) return;
    var b = Layout.rects.board, cell = b.cell, cells = game.s.board;
    ctx.save(); ctx.translate(FX.boardOffset.x, FX.boardOffset.y);
    for (var i = 0; i < 64; i++) {
      var v = cells[i]; if (!v || FX.hidden[i]) continue;
      var sc = FX.cellScale[i] || 1;
      drawBlock(v - 1, b.x + (i % N) * cell, b.y + Math.floor(i / N) * cell, cell, sc, 1);
    }
    // flash lines (about to clear)
    if (FX.flashLines && FX.flashLines.alpha > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * FX.flashLines.alpha) + ')';
      FX.flashLines.rows.forEach(function (r) { roundRect(ctx, b.x, b.y + r * cell, b.w, cell, 6); ctx.fill(); });
      FX.flashLines.cols.forEach(function (c) { roundRect(ctx, b.x + c * cell, b.y, cell, b.h, 6); ctx.fill(); });
    }
    // clearing cells (popping)
    for (var k = 0; k < FX.clearing.length; k++) {
      var q = FX.clearing[k];
      drawBlock(q.color, b.x + (q.idx % N) * cell, b.y + Math.floor(q.idx / N) * cell, cell, q.scale, q.alpha, 'bright');
    }
    // flying cells
    for (var f = 0; f < FX.flying.length; f++) {
      var fl = FX.flying[f];
      drawBlock(fl.color, fl.x - cell / 2, fl.y - cell / 2, cell, fl.scale || 1, 1);
    }
    ctx.restore();
  }
  // ghost: {shape, r, c, valid, lines:{rows, cols}}
  function drawGhost(ghost) {
    if (!ghost || !ghost.valid) return;
    var b = Layout.rects.board, cell = b.cell;
    ctx.save(); ctx.translate(FX.boardOffset.x, FX.boardOffset.y);
    if (ghost.lines) {
      ctx.strokeStyle = palette.text; ctx.lineWidth = 2;
      ghost.lines.rows.forEach(function (r) { roundRect(ctx, b.x + 1, b.y + r * cell + 1, b.w - 2, cell - 2, 6); ctx.stroke(); });
      ghost.lines.cols.forEach(function (c) { roundRect(ctx, b.x + c * cell + 1, b.y + 1, cell - 2, b.h - 2, 6); ctx.stroke(); });
    }
    drawShape(ghost.shape, b.x + ghost.c * cell, b.y + ghost.r * cell, cell, 1, 1, 'ghost');
    ctx.restore();
  }
  function arrowPath(cx, cy, dir, size) {
    var s = size / 2;
    ctx.beginPath();
    if (dir === 'up') { ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s * 0.6); ctx.lineTo(cx - s, cy + s * 0.6); }
    else if (dir === 'down') { ctx.moveTo(cx, cy + s); ctx.lineTo(cx + s, cy - s * 0.6); ctx.lineTo(cx - s, cy - s * 0.6); }
    else if (dir === 'left') { ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s * 0.6, cy - s); ctx.lineTo(cx + s * 0.6, cy + s); }
    else { ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s * 0.6, cy - s); ctx.lineTo(cx - s * 0.6, cy + s); }
    ctx.closePath();
  }
  // arrows: { info: game.arrowInfo(), stored, armed: dir|null, pulse: dir->bool, visible: bool }
  function drawArrows(arrows) {
    if (!arrows || !arrows.visible) return;
    var R = Layout.rects.arrows;
    Tilt.DIRS.forEach(function (d) {
      if (arrows.only && arrows.only !== d) return;
      var a = R[d], inf = arrows.info ? arrows.info[d] : null;
      var hasTilt = arrows.stored > 0;
      var armed = arrows.armed === d;
      var alpha = !hasTilt ? 0.2 : (inf && (inf.lines > 0 || inf.fits) ? 1 : 0.5);
      if (arrows.pulse && arrows.pulse[d]) alpha = 0.6 + 0.4 * Math.abs(Math.sin(FX.pulse * 6));
      var size = armed ? 24 * 1.3 : 24;
      var cx = a.cx, cy = a.cy;
      if (d === 'left') cx -= 2; if (d === 'right') cx += 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hasTilt ? palette.accent : palette.text2;
      arrowPath(cx, cy, d, size); ctx.fill();
      ctx.globalAlpha = 1;
      if (hasTilt && inf) {
        var label = inf.lines > 0 ? (inf.fits && arrows.showFits ? inf.lines + '✓' : String(inf.lines)) : (inf.fits ? '✓' : '');
        if (label) {
          var px, py;
          if (d === 'up' || d === 'down') { px = cx + 26; py = cy; } else { px = cx; py = cy + 28; }
          ctx.font = font(inf.lines > 0 ? 14 : 13, 800);
          var w = Math.max(20, ctx.measureText(label).width + 10);
          ctx.fillStyle = inf.lines > 0 ? palette.accent : withAlpha(palette.accent, 0.8);
          roundRect(ctx, px - w / 2, py - 10, w, 20, 10); ctx.fill();
          text(label, px, py + 0.5, { size: inf.lines > 0 ? 14 : 13, weight: 800, color: Config.PALETTE.bg, align: 'center' });
        }
      }
    });
  }
  function drawTray(tray) {
    if (!tray) return;
    var slots = Layout.rects.tray.slots, scale = Layout.rects.pieceScale, cell = Layout.rects.board.cell * scale;
    for (var i = 0; i < 3; i++) {
      var p = tray[i]; if (!p || !p.shape || p.hidden) continue;
      var w = p.shape.w * cell, h = p.shape.h * cell;
      var x = slots[i].cx - w / 2, y = slots[i].cy - h / 2 + (p.offsetY || 0);
      drawShape(p.shape, x, y, cell, p.scale || 1, p.alpha != null ? p.alpha : 1);
      if (p.locked) {
        ctx.fillStyle = 'rgba(15,18,51,0.55)'; roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 8); ctx.fill();
        text('🔒', slots[i].cx, slots[i].cy, { size: 18, align: 'center' });
      }
    }
  }
  // drag: {shape, x, y} top-left logical at board cell size
  function drawDrag(drag) {
    if (!drag) return;
    var cell = Layout.rects.board.cell;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 8;
    drawShape(drag.shape, drag.x, drag.y, cell, drag.scale || 1, 1);
    ctx.restore();
  }
  function drawFloatingTexts() {
    for (var i = 0; i < FX.texts.length; i++) {
      var t = FX.texts[i];
      text(t.text, t.x, t.y, { size: (t.size || 18) * (t.scale || 1), weight: 800, color: t.color || palette.accent2, align: 'center', alpha: t.alpha });
    }
  }
  function drawBanner() {
    var bn = FX.banner; if (!bn || bn.alpha <= 0) return;
    var b = Layout.rects.board;
    ctx.save(); ctx.globalAlpha = bn.alpha;
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(bn.scale, bn.scale);
    ctx.fillStyle = 'rgba(15,18,51,0.82)'; roundRect(ctx, -150, -34, 300, 68, 16); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = palette.accent; roundRect(ctx, -150, -34, 300, 68, 16); ctx.stroke();
    text(bn.text, 0, 0, { size: bn.small ? 22 : 28, weight: 900, color: palette.accent, align: 'center', maxWidth: 280 });
    ctx.restore();
  }
  function drawParticles() { Particles.draw(ctx, palette); }
  function drawDim(alpha) { ctx.fillStyle = 'rgba(15,18,51,' + alpha + ')'; ctx.fillRect(-2000, -2000, 4000, 4000); }

  // ---------- script player ----------
  // playScript(steps, { kind:'place'|'tilt'|'rescue', dir, now, onEvent(name, data), onDone })
  function playScript(steps, opts) {
    opts = opts || {};
    var cursor = 0, b = Layout.rects.board, cell = b.cell, k = reduced ? 0.45 : 1;
    var onEvent = opts.onEvent || function () {};
    var total = 0;
    steps.forEach(function (st) {
      if (st.t === 'place') {
        st.cells.forEach(function (idx) {
          FX.cellScale[idx] = 1.08;
          (function (ii) { Tween.add({ delay: cursor, dur: A.bumpMs * k, ease: 'outQuad', update: function (p) { FX.cellScale[ii] = 1.08 - 0.08 * p; }, done: function () { delete FX.cellScale[ii]; } }); })(idx);
        });
      } else if (st.t === 'slide') {
        var maxDur = 0;
        if (!reduced && opts.dir) {
          var jx = opts.dir === 'left' ? -A.tiltJoltPx : opts.dir === 'right' ? A.tiltJoltPx : 0;
          var jy = opts.dir === 'up' ? -A.tiltJoltPx : opts.dir === 'down' ? A.tiltJoltPx : 0;
          Tween.add({ delay: cursor, dur: A.tiltJoltMs, update: function (p) { FX.boardOffset.x = jx * p; FX.boardOffset.y = jy * p; },
            done: function () { Tween.add({ dur: A.tiltJoltBackMs, ease: 'outQuad', update: function (p) { FX.boardOffset.x = jx * (1 - p); FX.boardOffset.y = jy * (1 - p); } }); } });
        }
        Tween.after(cursor, function () { onEvent('slideStart', { dir: opts.dir }); });
        var landed = false;
        st.moves.forEach(function (m) {
          var dur = Tween.clamp(m.dist * A.slideMsPerCell, A.slideMinMs, A.slideMaxMs) * k;
          if (dur > maxDur) maxDur = dur;
          var from = Layout.cellCenter(m.from), to = Layout.cellCenter(m.to);
          var fl = { x: from.x, y: from.y, color: m.color, scale: 1 };
          FX.hidden[m.to] = true;
          Tween.add({ delay: cursor, dur: dur, ease: 'inQuad',
            update: function (p, tw) { if (!tw.started) { tw.started = true; FX.flying.push(fl); } fl.x = from.x + (to.x - from.x) * p; fl.y = from.y + (to.y - from.y) * p; },
            done: function () {
              var i = FX.flying.indexOf(fl); if (i >= 0) FX.flying.splice(i, 1);
              delete FX.hidden[m.to];
              if (!landed) { landed = true; onEvent('land', {}); }
              if (!reduced) { FX.cellScale[m.to] = 1.1; Tween.add({ dur: A.landSquashMs, update: function (p) { FX.cellScale[m.to] = 1.1 - 0.1 * p; }, done: function () { delete FX.cellScale[m.to]; } }); }
            } });
        });
        cursor += maxDur;
      } else if (st.t === 'clear') {
        var isTilt = opts.kind === 'tilt' || opts.kind === 'rescue';
        var flashMs = (isTilt ? A.lineFlashMs : A.clearFlashMs) * k;
        var rows = st.rows, cols = st.cols;
        Tween.add({ delay: cursor, dur: flashMs, update: function (p) { FX.flashLines = { rows: rows, cols: cols, alpha: 1 - p }; }, done: function () { FX.flashLines = null; } });
        cursor += flashMs;
        Tween.after(cursor, function () { onEvent('clear', { lines: st.lines, step: st.step, rescue: !!st.rescue }); });
        // pop order: tilt -> by line distance from the wall; place -> by distance from the piece
        var popMs = (isTilt ? A.linePopMs : A.clearPopMs) * k, maxStagger = 0;
        var wallDir = opts.dir;
        st.cells.forEach(function (c) {
          var r = Math.floor(c.idx / N), col = c.idx % N, stagger;
          if (isTilt) {
            var lineIndex = wallDir === 'down' ? (N - 1 - r) : wallDir === 'up' ? r : wallDir === 'right' ? (N - 1 - col) : col;
            stagger = Math.min(lineIndex, 7) * A.linePopStaggerMs * k;
          } else {
            var center = opts.center || { r: r, c: col };
            stagger = Math.min(A.clearStaggerMaxMs, (Math.abs(r - center.r) + Math.abs(col - center.c)) * A.clearStaggerMs) * k;
          }
          if (stagger > maxStagger) maxStagger = stagger;
          var q = { idx: c.idx, color: c.color, scale: 1, alpha: 1 };
          Tween.add({ delay: cursor + stagger, dur: popMs, ease: 'outQuad',
            update: function (p, tw) {
              if (!tw.started) { tw.started = true; FX.clearing.push(q); if (!reduced) { var cc = Layout.cellCenter(c.idx); Particles.burst(cc.x + FX.boardOffset.x, cc.y + FX.boardOffset.y, c.color, Config.FX.perClearedCell, { speed: 220 }); } }
              q.scale = p < 0.4 ? 1 + 0.3 * (p / 0.4) : 1.3 * (1 - (p - 0.4) / 0.6); q.alpha = 1 - p * 0.6;
            },
            done: function () { var i = FX.clearing.indexOf(q); if (i >= 0) FX.clearing.splice(i, 1); } });
        });
        if (isTilt && st.lines >= 1 && !reduced) shake(A.shakePx + Math.min(6, st.lines), A.shakeMs, cursor);
        cursor += popMs + maxStagger;
        // re-fall after a clear in a tilt is a uniform shift; animate the remaining cells sliding again happens via the next 'slide' step
      } else if (st.t === 'settle') {
        total = cursor;
      }
    });
    FX.locked = true;
    Tween.after(total, function () { FX.locked = false; if (opts.onDone) opts.onDone(); });
    return total;
  }
  function shake(px, ms, delay) {
    if (reduced) return;
    Tween.add({ delay: delay || 0, dur: ms, update: function (p) { var a = (1 - p) * px; FX.shake.x = (Math.random() * 2 - 1) * a; FX.shake.y = (Math.random() * 2 - 1) * a; }, done: function () { FX.shake.x = 0; FX.shake.y = 0; } });
  }
  function floatText(str, x, y, opts) {
    opts = opts || {};
    var t = { text: str, x: x, y: y, alpha: 1, scale: 1, color: opts.color, size: opts.size || 18 };
    FX.texts.push(t);
    Tween.add({ dur: (opts.dur || A.scorePopMs) * (reduced ? 0.6 : 1), ease: 'outQuad', update: function (p) { t.y = y - 28 * p; t.alpha = 1 - p; t.scale = 1 + 0.25 * p; }, done: function () { var i = FX.texts.indexOf(t); if (i >= 0) FX.texts.splice(i, 1); } });
  }
  function banner(str, small) {
    var bn = { text: str, alpha: 0, scale: 0.8, small: !!small };
    FX.banner = bn;
    var k = reduced ? 0.3 : 1;
    Tween.add({ dur: A.bannerInMs * k, ease: 'outBack', update: function (p) { bn.alpha = p; bn.scale = 0.8 + 0.2 * p; },
      done: function () { Tween.after(A.bannerHoldMs, function () { Tween.add({ dur: A.bannerOutMs * k, update: function (p) { bn.alpha = 1 - p; }, done: function () { if (FX.banner === bn) FX.banner = null; } }); }); } });
  }
  function nudge(dir, px) {
    if (reduced) return;
    var jx = dir === 'left' ? -px : dir === 'right' ? px : 0, jy = dir === 'up' ? -px : dir === 'down' ? px : 0;
    Tween.add({ dur: 60, update: function (p) { FX.boardOffset.x = jx * p; FX.boardOffset.y = jy * p; }, done: function () { Tween.add({ dur: 120, ease: 'outQuad', update: function (p) { FX.boardOffset.x = jx * (1 - p); FX.boardOffset.y = jy * (1 - p); } }); } });
  }
  function glowMeter() { Tween.add({ dur: 300, update: function (p) { FX.meterGlow = 1 - p; } }); }
  function resetFX() { FX.hidden = {}; FX.cellScale = {}; FX.flying.length = 0; FX.clearing.length = 0; FX.flashLines = null; FX.texts.length = 0; FX.boardOffset.x = FX.boardOffset.y = 0; FX.shake.x = FX.shake.y = 0; FX.banner = null; FX.locked = false; }

  TB.Renderer = {
    init: init, resize: resize, setPalette: setPalette, getPalette: function () { return palette; }, paletteIndex: function () { return paletteIndex; },
    setReduced: setReduced, isReduced: function () { return reduced; }, setQuality: setQuality,
    begin: begin, ctx: function () { return ctx; }, roundRect: function (x, y, w, h, r) { roundRect(ctx, x, y, w, h, r); },
    text: text, measure: measure, font: font, withAlpha: withAlpha, shade: shade,
    drawBoardBase: drawBoardBase, drawMeterRing: drawMeterRing, drawCells: drawCells, drawGhost: drawGhost, drawArrows: drawArrows,
    drawTray: drawTray, drawDrag: drawDrag, drawShape: drawShape, drawBlock: drawBlock, drawFloatingTexts: drawFloatingTexts, drawBanner: drawBanner,
    drawParticles: drawParticles, drawDim: drawDim,
    FX: FX, playScript: playScript, shake: shake, floatText: floatText, banner: banner, nudge: nudge, glowMeter: glowMeter, resetFX: resetFX
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
