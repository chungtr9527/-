// WebAudio synthesis, zero assets. One AudioContext created lazily on unlock() (which the integrator calls from
// pointerup / touchend / click / keydown until the context is running). Graph: voice -> [StereoPanner] -> master
// GainNode -> DynamicsCompressor -> destination. 12-voice limit (TB.Config.FX.maxVoices): when full, the oldest voice
// of the lowest priority is faded out and cut; a new voice that matters less than everything playing is skipped.
// Platform module: may touch window/Math.random, must never throw and must be a no-op without WebAudio.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  var MAX_VOICES = (TB.Config && TB.Config.FX && TB.Config.FX.maxVoices) || 12;
  var PRI = { low: 0, normal: 1, high: 2 };
  var PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319];   // C5 D5 E5 G5 A5 C6 D6 E6
  var MIN_GAIN = 0.0001;                                       // exponential ramps cannot reach 0
  var TAIL = 0.03;                                             // source stop() slack after the envelope ends (s)

  var enabled = true, inited = false, supported = false, Ctor = null;
  var ctx = null, master = null, comp = null, noiseBuf = null, silentBuf = null;
  var voices = [];            // active voices, oldest first
  var seq = 0, scheduled = 0; // scheduled: voices started by the current play() call
  var appSuspended = false;   // suspend() called (app pause / ad) and not yet resume()d
  var everRan = false;        // the context reached 'running' at least once (so resume() is allowed outside a gesture)

  function noop() {}
  function rand() { return Math.random(); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function swallow(p) { if (p && typeof p.then === 'function') p.then(noop, noop); }
  function setParam(p, v) { try { if (p && typeof p.value === 'number') p.value = v; } catch (e) {} }

  // ---- context -----------------------------------------------------------------------------------------------

  function init() {
    if (inited) return supported;
    inited = true;
    try { Ctor = g.AudioContext || g.webkitAudioContext || null; } catch (e) { Ctor = null; }
    supported = typeof Ctor === 'function';
    return supported;
  }

  function ensureContext() {
    if (ctx && ctx.state === 'closed') { ctx = null; master = null; comp = null; noiseBuf = null; silentBuf = null; voices = []; }
    if (ctx) return ctx;
    if (!enabled || !init()) return null;
    var c = null;
    try { c = new Ctor({ latencyHint: 'interactive' }); } catch (e) { try { c = new Ctor(); } catch (e2) { c = null; } }
    if (!c) return null;
    try {
      master = c.createGain();
      setParam(master.gain, 0.85);
      comp = c.createDynamicsCompressor();
      setParam(comp.threshold, -18); setParam(comp.knee, 20); setParam(comp.ratio, 6);
      setParam(comp.attack, 0.003); setParam(comp.release, 0.2);
      master.connect(comp);
      comp.connect(c.destination);
      try { c.onstatechange = function () { if (c.state === 'running') everRan = true; }; } catch (e) {}
      if (c.state === 'running') everRan = true;
      ctx = c;
    } catch (e) {
      try { if (typeof c.close === 'function') swallow(c.close()); } catch (e2) {}
      ctx = null; master = null; comp = null;
      return null;
    }
    return ctx;
  }

  function running() { return !!ctx && ctx.state === 'running' && !appSuspended; }

  // Call from a user-activation event. Returns true once the context is running; call again on the next event otherwise.
  function unlock() {
    if (!enabled) return false;
    var c = ensureContext();
    if (!c) return false;
    appSuspended = false;                       // the user is interacting, so the app is in the foreground
    if (c.state === 'running') { everRan = true; return true; }
    try { if (typeof c.resume === 'function') swallow(c.resume()); } catch (e) {}
    // Old iOS / WebView unlock: play a silent buffer inside the gesture (also makes Chrome auto-resume on activation).
    try {
      if (!silentBuf) silentBuf = c.createBuffer(1, 1, c.sampleRate || 44100);
      var src = c.createBufferSource();
      src.buffer = silentBuf;
      src.connect(c.destination);
      src.onended = function () { try { src.disconnect(); } catch (e) {} };
      src.start(0);
    } catch (e) {}
    if (c.state === 'running') everRan = true;
    return c.state === 'running';
  }

  // App pause (or an ad is showing): stop everything and let the hardware sleep. Idempotent, safe before init.
  function suspend() {
    appSuspended = true;
    cutAll();
    if (!ctx || ctx.state === 'closed') return;
    try { if (typeof ctx.suspend === 'function') swallow(ctx.suspend()); } catch (e) {}
  }

  // App resume. Idempotent, safe before init; a context that never ran stays locked until the next unlock().
  function resume() {
    appSuspended = false;
    if (!enabled || !ctx || ctx.state === 'closed' || !everRan) return;
    try { if (typeof ctx.resume === 'function') swallow(ctx.resume()); } catch (e) {}
  }

  function setEnabled(on) {
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    if (!on) {
      cutAll();
      if (ctx && ctx.state !== 'closed') { try { if (typeof ctx.suspend === 'function') swallow(ctx.suspend()); } catch (e) {} }
    } else if (ctx && ctx.state !== 'closed' && everRan && !appSuspended) {
      try { if (typeof ctx.resume === 'function') swallow(ctx.resume()); } catch (e) {}
    }
  }
  function isEnabled() { return enabled; }

  // ---- voices ------------------------------------------------------------------------------------------------

  function allocVoice(priority) {
    if (voices.length >= MAX_VOICES) {
      var victim = null;
      for (var i = 0; i < voices.length; i++) if (!victim || voices[i].pri < victim.pri) victim = voices[i];
      if (victim.pri > priority) return null;   // everything playing matters more: skip the new voice
      cut(victim);
    }
    var v = { id: ++seq, pri: priority, nodes: [], src: null, gain: null, done: false };
    voices.push(v);
    return v;
  }

  // Disconnect everything and forget the voice ('ended' handler, or error path).
  function finish(v) {
    if (v.done) return;
    v.done = true;
    for (var i = 0; i < v.nodes.length; i++) { try { v.nodes[i].disconnect(); } catch (e) {} }
    var k = voices.indexOf(v);
    if (k >= 0) voices.splice(k, 1);
  }

  // Fast fade then stop; the 'ended' handler disconnects. Leaves the active list immediately.
  function cut(v) {
    var k = voices.indexOf(v);
    if (k >= 0) voices.splice(k, 1);
    if (v.done) return;
    try {
      var now = ctx.currentTime;
      if (v.gain) {
        var p = v.gain.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(Math.max(MIN_GAIN, p.value || MIN_GAIN), now);
        p.exponentialRampToValueAtTime(MIN_GAIN, now + 0.012);
      }
      if (v.src) v.src.stop(now + 0.015);
    } catch (e) { finish(v); }
  }

  function cutAll() {
    var list = voices.slice();
    for (var i = 0; i < list.length; i++) { try { cut(list[i]); } catch (e) {} }
    voices = [];
  }

  // Connect nodes in series -> [panner] -> master.
  function chain(v, nodes, pan) {
    var last = nodes[nodes.length - 1];
    for (var i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    if (pan && typeof ctx.createStereoPanner === 'function') {
      var panner = ctx.createStereoPanner();
      setParam(panner.pan, clamp(pan, -1, 1));
      last.connect(panner);
      last = panner;
      nodes.push(panner);
    }
    last.connect(master);
    v.nodes = nodes;
  }

  // attack (linear) -> hold -> release (exponential), all inside [t0, t0 + dur].
  function envelope(gainNode, t0, dur, peak, attack, release) {
    var p = gainNode.gain;
    peak = Math.max(MIN_GAIN, peak);
    attack = clamp(attack, 0.001, dur * 0.5);
    release = clamp(release, 0.005, dur - attack);
    p.setValueAtTime(MIN_GAIN, t0);
    p.linearRampToValueAtTime(peak, t0 + attack);
    var holdEnd = t0 + dur - release;
    if (holdEnd > t0 + attack) p.setValueAtTime(peak, holdEnd);
    p.exponentialRampToValueAtTime(MIN_GAIN, t0 + dur);
  }

  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    var rate = ctx.sampleRate || 44100, len = Math.floor(rate);   // 1 s of white noise
    var buf = ctx.createBuffer(1, len, rate), data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = rand() * 2 - 1;
    noiseBuf = buf;
    return buf;
  }

  // ---- primitives (times in seconds; `at` is relative to ctx.currentTime) -----------------------------------

  // {type, f0, f1, dur, gain, attack, release, pan, at, sweep, priority}
  function tone(o) {
    var v = allocVoice(o.priority == null ? PRI.normal : o.priority);
    if (!v) return null;
    try {
      var t0 = ctx.currentTime + (o.at || 0), dur = Math.max(0.01, o.dur || 0.1);
      var osc = ctx.createOscillator(), gn = ctx.createGain();
      osc.type = o.type || 'sine';
      var f0 = Math.max(20, o.f0 || 440);
      osc.frequency.setValueAtTime(f0, t0);
      if (o.f1 && o.f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + (o.sweep || dur));
      envelope(gn, t0, dur, o.gain == null ? 0.2 : o.gain, o.attack == null ? 0.005 : o.attack, o.release == null ? dur * 0.5 : o.release);
      chain(v, [osc, gn], o.pan);
      v.src = osc; v.gain = gn;
      osc.onended = function () { finish(v); };
      osc.start(t0);
      osc.stop(t0 + dur + TAIL);
      scheduled++;
      return v;
    } catch (e) { finish(v); return null; }
  }

  // {dur, from, to, q, gain, attack, release, pan, at, priority}: cached white noise through a bandpass sweep.
  function noise(o) {
    var v = allocVoice(o.priority == null ? PRI.normal : o.priority);
    if (!v) return null;
    try {
      var t0 = ctx.currentTime + (o.at || 0), dur = Math.max(0.01, o.dur || 0.1);
      var src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = noiseBuffer();
      src.loop = true;
      flt.type = 'bandpass';
      var from = Math.max(20, o.from || 1000), to = Math.max(20, o.to || from);
      flt.frequency.setValueAtTime(from, t0);
      if (to !== from) flt.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      setParam(flt.Q, o.q == null ? 1 : o.q);
      envelope(gn, t0, dur, o.gain == null ? 0.2 : o.gain, o.attack == null ? 0.005 : o.attack, o.release == null ? dur * 0.5 : o.release);
      chain(v, [src, flt, gn], o.pan);
      v.src = src; v.gain = gn;
      src.onended = function () { finish(v); };
      src.start(t0);
      src.stop(t0 + dur + TAIL);
      scheduled++;
      return v;
    } catch (e) { finish(v); return null; }
  }

  // ---- recipes -----------------------------------------------------------------------------------------------

  function chord(freqs, o) {
    for (var i = 0; i < freqs.length; i++) {
      tone({ type: o.type || 'triangle', f0: freqs[i], dur: o.dur, gain: o.gain, attack: o.attack, release: o.release, at: o.at || 0, priority: o.priority });
    }
  }

  var RECIPES = {
    // soft pip when a piece is picked up
    pickup: function () {
      tone({ type: 'sine', f0: 740, f1: 880, dur: 0.045, gain: 0.08, attack: 0.004, priority: PRI.low });
    },
    // 'tok': triangle 440 -> 220 Hz (90 ms) + 20 ms noise click, +-3% random pitch
    drop: function () {
      var d = 1 + (rand() * 2 - 1) * 0.03;
      tone({ type: 'triangle', f0: 440 * d, f1: 220 * d, dur: 0.09, gain: 0.28, attack: 0.003, release: 0.05 });
      noise({ dur: 0.02, from: 2400, to: 1200, q: 0.7, gain: 0.18, attack: 0.002, release: 0.012, priority: PRI.low });
    },
    invalid: function () {
      tone({ type: 'sine', f0: 180, f1: 120, dur: 0.12, gain: 0.22, attack: 0.005, release: 0.06 });
    },
    // one pentatonic note per line, 40 ms apart, rising with the combo
    clear: function (o) {
      var lines = clamp(o.lines | 0, 1, 16), combo = Math.max(0, o.combo | 0);
      for (var k = 0; k < lines; k++) {
        var f = PENTA[Math.min(combo + k, 7)], at = k * 0.04;
        tone({ type: 'triangle', f0: f, dur: 0.35, gain: 0.2, attack: 0.006, release: 0.26, at: at });
        tone({ type: 'sine', f0: f / 2, dur: 0.35, gain: 0.1, attack: 0.006, release: 0.26, at: at, priority: PRI.low });
        tone({ type: 'sine', f0: f * 2, dur: 0.12, gain: 0.05, attack: 0.004, release: 0.09, at: at + 0.1, priority: PRI.low });
      }
    },
    // short rising arpeggio
    comboUp: function (o) {
      var base = Math.min(Math.max(0, (o.combo | 0) - 1), 3), notes = [659, 784, 988, 1319];
      for (var i = 0; i < notes.length; i++) {
        tone({ type: 'triangle', f0: notes[i] * Math.pow(1.0595, base), dur: 0.14, gain: 0.16, attack: 0.004, release: 0.1, at: i * 0.055 });
      }
    },
    // tilt available: two rising notes
    ready: function () {
      tone({ type: 'triangle', f0: 660, dur: 0.09, gain: 0.18, attack: 0.004, release: 0.05 });
      tone({ type: 'triangle', f0: 990, dur: 0.16, gain: 0.18, attack: 0.004, release: 0.11, at: 0.1 });
    },
    // tilt: noise sweep, panned toward the wall for left/right
    whoosh: function (o) {
      var pan = o.dir === 'left' ? -0.6 : o.dir === 'right' ? 0.6 : 0;
      noise({ dur: 0.28, from: 300, to: 2200, q: 0.8, gain: 0.35, attack: 0.03, release: 0.12, pan: pan });
    },
    // the pile hits the wall
    land: function () {
      tone({ type: 'sine', f0: 90, f1: 50, dur: 0.12, gain: 0.4, attack: 0.004, release: 0.08 });
    },
    // SANDSLIDE banner: major chord swell
    banner: function () {
      chord([523, 659, 784, 1047], { dur: 0.4, gain: 0.13, attack: 0.12, release: 0.2, priority: PRI.high });
    },
    // new best: 600 ms fanfare
    newBest: function () {
      var steps = [523, 659, 784];
      for (var i = 0; i < steps.length; i++) {
        tone({ type: 'triangle', f0: steps[i], dur: 0.12, gain: 0.18, attack: 0.004, release: 0.05, at: i * 0.12, priority: PRI.high });
      }
      tone({ type: 'triangle', f0: 1047, dur: 0.24, gain: 0.2, attack: 0.004, release: 0.16, at: 0.36, priority: PRI.high });
      tone({ type: 'sine', f0: 523, dur: 0.24, gain: 0.1, attack: 0.004, release: 0.16, at: 0.36, priority: PRI.normal });
    },
    // three descending notes, 300 ms each
    gameOver: function () {
      var notes = [392, 330, 262];
      for (var i = 0; i < notes.length; i++) {
        tone({ type: 'triangle', f0: notes[i], dur: 0.3, gain: 0.2, attack: 0.01, release: 0.18, at: i * 0.3, priority: PRI.high });
      }
    },
    // UI tick
    tick: function () {
      tone({ type: 'sine', f0: 900, dur: 0.03, gain: 0.1, attack: 0.002, release: 0.02, priority: PRI.low });
    },
    // dull thud
    denied: function () {
      tone({ type: 'sine', f0: 120, f1: 60, dur: 0.14, gain: 0.3, attack: 0.004, release: 0.09 });
      noise({ dur: 0.04, from: 200, to: 100, q: 1, gain: 0.15, attack: 0.003, release: 0.025, priority: PRI.low });
    },
    // +1 Tilt: triple pip
    refill: function () {
      var notes = [784, 880, 988];
      for (var i = 0; i < notes.length; i++) {
        tone({ type: 'sine', f0: notes[i], dur: 0.04, gain: 0.12, attack: 0.003, release: 0.025, at: i * 0.07 });
      }
    },
    // board clear: wide chord + sparkle
    allClear: function () {
      chord([523, 659, 784, 1047, 1319], { dur: 0.7, gain: 0.11, attack: 0.02, release: 0.45, priority: PRI.high });
      tone({ type: 'sine', f0: 1568, dur: 0.25, gain: 0.06, attack: 0.004, release: 0.2, at: 0.15, priority: PRI.low });
    }
  };

  // Never throws; no-op when disabled, locked, suspended or the name is unknown. Returns whether any voice was scheduled.
  function play(name, opts) {
    if (!enabled || !running()) return false;
    var recipe = RECIPES[name];
    if (!recipe) return false;
    scheduled = 0;
    try { recipe(opts || {}); } catch (e) {}
    return scheduled > 0;
  }

  TB.Audio = {
    init: init,
    unlock: unlock,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    suspend: suspend,
    resume: resume,
    play: play,
    // diagnostics / tests only
    _debug: function () {
      return { supported: supported, enabled: enabled, state: ctx ? ctx.state : 'none', voices: voices.length, appSuspended: appSuspended, maxVoices: MAX_VOICES };
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
