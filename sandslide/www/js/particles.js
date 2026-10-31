// Pooled particle system (typed arrays, zero allocation in the hot path). Logical coordinates.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var MAX = TB.Config.FX.particleMax;
  var x = new Float32Array(MAX), y = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  var life = new Float32Array(MAX), ttl = new Float32Array(MAX), size = new Float32Array(MAX), rot = new Float32Array(MAX), vr = new Float32Array(MAX);
  var color = new Uint8Array(MAX), kind = new Uint8Array(MAX);
  var alive = 0, quality = 1, fx = TB.RNG.create('fx');
  function rnd(a, b) { return a + (b - a) * fx.next(); }
  // burst(cx, cy, colorIndex, n, opts{speed, gravity, size, kind})
  function burst(cx, cy, colorIndex, n, opts) {
    opts = opts || {};
    n = Math.round(n * quality);
    for (var i = 0; i < n && alive < MAX; i++) {
      var k = alive++;
      var a = rnd(0, Math.PI * 2), sp = rnd(0.3, 1) * (opts.speed || 180);
      x[k] = cx; y[k] = cy; vx[k] = Math.cos(a) * sp; vy[k] = Math.sin(a) * sp - (opts.lift || 60);
      life[k] = 0; ttl[k] = rnd(400, 700); size[k] = rnd(3, 7) * (opts.size || 1); rot[k] = rnd(0, Math.PI); vr[k] = rnd(-6, 6);
      color[k] = colorIndex; kind[k] = opts.kind || 0;
    }
  }
  function confetti(cx, cy, n) {
    for (var i = 0; i < n && alive < MAX; i++) {
      var k = alive++;
      x[k] = cx + rnd(-120, 120); y[k] = cy; vx[k] = rnd(-80, 80); vy[k] = rnd(-420, -220);
      life[k] = 0; ttl[k] = rnd(900, 1300); size[k] = rnd(4, 8); rot[k] = rnd(0, Math.PI); vr[k] = rnd(-8, 8);
      color[k] = i % 8; kind[k] = 1;
    }
  }
  function update(dtMs) {
    var dt = dtMs / 1000, grav = 900;
    for (var i = 0; i < alive; i++) {
      life[i] += dtMs;
      if (life[i] >= ttl[i]) { alive--; if (i !== alive) { x[i] = x[alive]; y[i] = y[alive]; vx[i] = vx[alive]; vy[i] = vy[alive]; life[i] = life[alive]; ttl[i] = ttl[alive]; size[i] = size[alive]; rot[i] = rot[alive]; vr[i] = vr[alive]; color[i] = color[alive]; kind[i] = kind[alive]; } i--; continue; }
      vy[i] += grav * dt * (kind[i] === 1 ? 0.6 : 1); x[i] += vx[i] * dt; y[i] += vy[i] * dt; rot[i] += vr[i] * dt;
    }
  }
  function draw(ctx, palette) {
    for (var i = 0; i < alive; i++) {
      var p = life[i] / ttl[i];
      ctx.globalAlpha = 1 - p * p;
      ctx.fillStyle = palette.blocks[color[i] % 8];
      ctx.save(); ctx.translate(x[i], y[i]); ctx.rotate(rot[i]);
      var s = size[i] * (1 - p * 0.5);
      ctx.fillRect(-s / 2, -s / 2, s, kind[i] === 1 ? s * 0.6 : s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  TB.Particles = { burst: burst, confetti: confetti, update: update, draw: draw, count: function () { return alive; }, clear: function () { alive = 0; },
    setQuality: function (q) { quality = q; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
