// Time-based tweens and a tiny timeline. Durations in ms; `now` is injected by the loop (performance.now).
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var active = [];
  var Ease = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1; }
  };
  // add({ delay, dur, ease, update(p, tween), done() }) -> tween handle
  function add(spec) {
    var tw = { t0: null, delay: spec.delay || 0, dur: Math.max(0, spec.dur || 0), ease: Ease[spec.ease] || spec.ease || Ease.linear,
      update: spec.update, done: spec.done, finished: false, cancel: function () { tw.finished = true; } };
    active.push(tw);
    return tw;
  }
  function after(delay, fn) { return add({ delay: delay, dur: 0, done: fn }); }
  function update(now) {
    for (var i = 0; i < active.length; i++) {
      var tw = active[i];
      if (tw.finished) continue;
      if (tw.t0 === null) tw.t0 = now + tw.delay;
      if (now < tw.t0) continue;
      var p = tw.dur > 0 ? Math.min(1, (now - tw.t0) / tw.dur) : 1;
      if (tw.update) tw.update(tw.ease(p), tw);
      if (p >= 1) { tw.finished = true; if (tw.done) tw.done(); }
    }
    for (var j = active.length - 1; j >= 0; j--) if (active[j].finished) active.splice(j, 1);
  }
  function clear() { active.length = 0; }
  function count() { return active.length; }
  TB.Tween = { Ease: Ease, add: add, after: after, update: update, clear: clear, count: count, clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); }, lerp: function (a, b, t) { return a + (b - a) * t; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
