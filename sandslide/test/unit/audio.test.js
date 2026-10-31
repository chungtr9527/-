'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const TB = require('../helpers/load-engine');
const AUDIO = path.join(__dirname, '..', '..', 'www', 'js', 'audio.js');
const MIN = 0.0001;

// ---- minimal WebAudio fake -------------------------------------------------------------------------------------
class FakeParam {
  constructor(v) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
}
class FakeNode {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.connections = []; this.disconnected = false; ctx.nodes.push(this); }
  connect(n) { this.connections.push(n); return n; }
  disconnect() { this.disconnected = true; }
}
class FakeSource extends FakeNode {
  constructor(ctx, kind) { super(ctx, kind); this.startAt = null; this.stopAt = null; this.onended = null; }
  start(t) { this.startAt = t; }
  stop(t) { this.stopAt = t; }
  end() { if (this.onended) this.onended(); }
}
class FakeCtx {
  constructor(opts) {
    FakeCtx.instances.push(this);
    this.opts = opts; this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 48000;
    this.nodes = []; this.resumeCalls = 0; this.suspendCalls = 0; this.onstatechange = null;
    this.destination = new FakeNode(this, 'destination');
  }
  resume() { this.resumeCalls++; if (this.resumeCalls >= FakeCtx.runOnResumeCall) this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(1); return n; }
  createOscillator() { const n = new FakeSource(this, 'osc'); n.type = 'sine'; n.frequency = new FakeParam(440); return n; }
  createBiquadFilter() { const n = new FakeNode(this, 'filter'); n.type = 'lowpass'; n.frequency = new FakeParam(350); n.Q = new FakeParam(1); return n; }
  createBufferSource() { const n = new FakeSource(this, 'buffer'); n.buffer = null; n.loop = false; return n; }
  createBuffer(ch, len, rate) { return { numberOfChannels: ch, length: len, sampleRate: rate, getChannelData() { return new Float32Array(len); } }; }
  createDynamicsCompressor() { const n = new FakeNode(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0); return n; }
  createStereoPanner() { const n = new FakeNode(this, 'panner'); n.pan = new FakeParam(0); return n; }
}
FakeCtx.instances = [];
FakeCtx.runOnResumeCall = 1;
class NoPanCtx extends FakeCtx {}
NoPanCtx.prototype.createStereoPanner = undefined;

function fresh(Ctor) {
  FakeCtx.instances = []; FakeCtx.runOnResumeCall = 1;
  if (Ctor) globalThis.AudioContext = Ctor; else delete globalThis.AudioContext;
  delete require.cache[require.resolve(AUDIO)];
  require(AUDIO);
  return TB.Audio;
}
function ctx() { return FakeCtx.instances[0]; }
function nodes(kind) { return ctx().nodes.filter((n) => n.kind === kind); }
function oscs(type) { return nodes('osc').filter((n) => !type || n.type === type); }
function noiseSrcs() { return nodes('buffer').filter((n) => n.buffer && n.buffer.length > 1); } // excludes the 1-frame unlock kick
function f0(osc) { return osc.frequency.events.find((e) => e[0] === 'set')[1]; }
function unlocked() { const A = fresh(FakeCtx); assert.equal(A.unlock(), true); return A; }

afterEach(() => { delete globalThis.AudioContext; delete globalThis.webkitAudioContext; });

test('exposes the contract API; without WebAudio everything is a silent no-op', () => {
  const A = fresh(null);
  for (const k of ['init', 'unlock', 'setEnabled', 'isEnabled', 'suspend', 'resume', 'play']) assert.equal(typeof A[k], 'function', k);
  assert.equal(A.init(), false);
  assert.equal(A.unlock(), false);
  assert.equal(A.play('tick'), false);
  assert.doesNotThrow(() => { A.suspend(); A.resume(); A.setEnabled(false); A.setEnabled(true); });
  assert.equal(A._debug().state, 'none');
});

test('one AudioContext, created lazily by unlock(), master gain -> compressor -> destination', () => {
  const A = fresh(FakeCtx);
  assert.equal(A.init(), true);
  assert.equal(A.init(), true, 'idempotent');
  assert.equal(FakeCtx.instances.length, 0, 'init() does not create the context');
  assert.equal(A.play('tick'), false, 'locked: nothing to play on');
  assert.equal(A.unlock(), true);
  assert.equal(A.unlock(), true);
  assert.equal(FakeCtx.instances.length, 1, 'a single context');
  const master = nodes('gain')[0], comp = nodes('comp')[0];
  assert.equal(master.connections[0], comp);
  assert.equal(comp.connections[0], ctx().destination);
  assert.ok(master.gain.value > 0 && master.gain.value <= 1);
  assert.ok(comp.threshold.value < 0 && comp.ratio.value > 1);
});

test('unlock() retries until the context is running and kicks a silent buffer meanwhile', () => {
  const A = fresh(FakeCtx);
  FakeCtx.runOnResumeCall = 2;
  assert.equal(A.unlock(), false);
  assert.equal(ctx().state, 'suspended');
  const kick = nodes('buffer')[0];
  assert.ok(kick && kick.startAt === 0 && kick.connections[0] === ctx().destination, 'silent buffer played inside the gesture');
  assert.equal(A.play('tick'), false, 'still locked');
  assert.equal(oscs().length, 0);
  assert.equal(A.unlock(), true);
  assert.equal(ctx().resumeCalls, 2);
  assert.equal(A.play('tick'), true);
  assert.equal(oscs().length, 1);
});

test('setEnabled(false) skips node creation entirely; re-enabling resumes', () => {
  const A = fresh(FakeCtx);
  A.setEnabled(false);
  assert.equal(A.isEnabled(), false);
  assert.equal(A.unlock(), false);
  assert.equal(FakeCtx.instances.length, 0, 'no context while disabled');
  assert.equal(A.play('tick'), false);
  A.setEnabled(true);
  assert.equal(A.unlock(), true);
  assert.equal(A.play('tick'), true);
  const before = ctx().nodes.length;
  A.setEnabled(false);
  assert.equal(A._debug().voices, 0, 'voices cut');
  assert.equal(ctx().suspendCalls, 1, 'context suspended while disabled');
  assert.equal(A.play('drop'), false);
  assert.equal(ctx().nodes.length, before, 'no nodes created while disabled');
  A.setEnabled(true);
  assert.equal(ctx().resumeCalls, 2);
  assert.equal(A.play('tick'), true);
});

test('a tone is osc -> gain -> master with an attack/hold/release envelope relative to currentTime', () => {
  const A = unlocked();
  ctx().currentTime = 2.5;
  assert.equal(A.play('tick'), true);
  const osc = oscs()[0], gain = osc.connections[0], master = nodes('gain')[0];
  assert.equal(osc.type, 'sine');
  assert.equal(f0(osc), 900);
  assert.equal(gain.kind, 'gain');
  assert.equal(gain.connections[0], master);
  assert.equal(osc.startAt, 2.5);
  assert.ok(osc.stopAt > 2.5 + 0.03 && osc.stopAt < 2.5 + 0.1, 'stops just after the 30 ms envelope');
  const ev = gain.gain.events;
  assert.deepEqual(ev[0], ['set', MIN, 2.5]);
  assert.equal(ev[1][0], 'lin'); assert.equal(ev[1][1], 0.1); assert.ok(ev[1][2] > 2.5 && ev[1][2] < 2.52);
  const last = ev[ev.length - 1];
  assert.equal(last[0], 'exp'); assert.equal(last[1], MIN); assert.ok(Math.abs(last[2] - 2.53) < 1e-9);
});

test('clear plays one pentatonic note per line, 40 ms apart, rising with the combo and capped at the top', () => {
  const A = unlocked();
  ctx().currentTime = 1;
  assert.equal(A.play('clear', { lines: 3, combo: 2 }), true);
  const notes = oscs('triangle');
  assert.deepEqual(notes.map(f0), [659, 784, 880]);
  assert.deepEqual(notes.map((o) => +(o.startAt - 1).toFixed(3)), [0, 0.04, 0.08]);
  const subs = oscs('sine').filter((o) => f0(o) < 500);
  assert.deepEqual(subs.map(f0), [329.5, 392, 440], 'sine one octave below each note');
  const sparkle = oscs('sine').filter((o) => f0(o) > 1000);
  assert.deepEqual(sparkle.map(f0), [1318, 1568, 1760]);
  assert.ok(Math.abs(sparkle[0].startAt - 1.1) < 1e-9, 'sparkle 100 ms after its note');
  for (const s of ctx().nodes.filter((n) => n.kind === 'osc')) s.end();
  assert.equal(A.play('clear', { lines: 2, combo: 7 }), true);
  assert.deepEqual(oscs('triangle').slice(3).map(f0), [1319, 1319]);
});

test('drop is a triangle 440 -> 220 Hz tok with +-3% random pitch plus a short noise click', () => {
  const A = unlocked();
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    assert.equal(A.play('drop'), true);
    for (const s of ctx().nodes.filter((n) => n.startAt != null && !n.disconnected)) s.end();
  }
  const toks = oscs('triangle');
  assert.equal(toks.length, 20);
  for (const o of toks) {
    const f = f0(o), ramp = o.frequency.events.find((e) => e[0] === 'exp');
    assert.ok(f >= 440 * 0.97 - 1e-9 && f <= 440 * 1.03 + 1e-9, 'f0 ' + f);
    assert.ok(Math.abs(ramp[1] / f - 0.5) < 1e-9, 'one octave down');
    seen.add(f);
  }
  assert.ok(seen.size > 1, 'pitch is randomised');
  const clicks = noiseSrcs();
  assert.equal(clicks.length, 20);
  const flt = clicks[0].connections[0];
  assert.equal(flt.kind, 'filter'); assert.equal(flt.type, 'bandpass');
  assert.equal(clicks[0].buffer.length, 48000, 'cached 1 s noise buffer');
  assert.equal(clicks[1].buffer, clicks[0].buffer);
});

test('whoosh is a 280 ms bandpass noise sweep panned by direction; the panner is feature-detected', () => {
  let A = unlocked();
  A.play('whoosh', { dir: 'left' });
  A.play('whoosh', { dir: 'right' });
  A.play('whoosh', { dir: 'down' });
  const srcs = noiseSrcs();
  assert.equal(srcs.length, 3);
  const flt = srcs[0].connections[0];
  assert.equal(flt.type, 'bandpass');
  assert.deepEqual(flt.frequency.events.map((e) => [e[0], e[1]]), [['set', 300], ['exp', 2200]]);
  assert.ok(Math.abs(flt.frequency.events[1][2] - 0.28) < 1e-9);
  assert.equal(flt.Q.value, 0.8);
  const gain = flt.connections[0];
  assert.equal(gain.gain.events[1][1], 0.35);
  assert.ok(Math.abs(gain.gain.events[1][2] - 0.03) < 1e-9, '30 ms attack');
  const panners = nodes('panner');
  assert.deepEqual(panners.map((p) => p.pan.value), [-0.6, 0.6]);
  assert.equal(gain.connections[0], panners[0]);
  assert.equal(panners[0].connections[0], nodes('gain')[0]);
  const third = srcs[2].connections[0].connections[0];
  assert.equal(third.connections[0], nodes('gain')[0], 'no panner for up/down');

  A = fresh(NoPanCtx); assert.equal(A.unlock(), true);
  assert.equal(A.play('whoosh', { dir: 'left' }), true);
  assert.equal(nodes('panner').length, 0);
  const g2 = noiseSrcs()[0].connections[0].connections[0];
  assert.equal(g2.connections[0], nodes('gain')[0], 'gain feeds master directly without StereoPannerNode');
});

test('every documented sound schedules something and unknown names are ignored', () => {
  const A = unlocked();
  const names = ['pickup', 'drop', 'invalid', 'clear', 'comboUp', 'ready', 'whoosh', 'land', 'banner', 'newBest', 'gameOver', 'tick', 'denied', 'refill', 'allClear'];
  for (const n of names) {
    const before = ctx().nodes.length;
    assert.equal(A.play(n, { lines: 2, combo: 3, dir: 'up' }), true, n);
    assert.ok(ctx().nodes.length > before, n + ' created nodes');
    for (const s of ctx().nodes.filter((x) => x.startAt != null && !x.disconnected)) s.end();
    assert.equal(A._debug().voices, 0);
  }
  assert.equal(A.play('nope'), false);
  assert.equal(A.play(), false);
  const over = oscs('triangle').filter((o) => [392, 330, 262].indexOf(f0(o)) >= 0);
  assert.deepEqual(over.map(f0), [392, 330, 262], 'gameOver: three descending notes');
  assert.deepEqual(over.map((o) => +o.startAt.toFixed(3)), [0, 0.3, 0.6]);
  const land = oscs('sine').find((o) => f0(o) === 90);
  assert.equal(land.frequency.events[1][1], 50);
});

test('12-voice limit: the oldest lowest-priority voice is faded and cut; a lesser newcomer is skipped', () => {
  const A = unlocked();
  assert.equal(A._debug().maxVoices, TB.Config.FX.maxVoices);
  ctx().currentTime = 3;
  for (let i = 0; i < 12; i++) A.play('tick');
  assert.equal(A._debug().voices, 12);
  const first = oscs()[0];
  assert.equal(A.play('tick'), true);
  assert.equal(A._debug().voices, 12);
  assert.equal(oscs().length, 13);
  const g = first.connections[0];
  assert.ok(g.gain.events.some((e) => e[0] === 'cancel' && e[1] === 3), 'scheduled values cancelled');
  assert.deepEqual(g.gain.events[g.gain.events.length - 1].slice(0, 2), ['exp', MIN], 'fade out');
  assert.ok(Math.abs(first.stopAt - 3.015) < 1e-9, 'stopped right after the fade');
  first.end();
  assert.ok(g.disconnected && first.disconnected, "nodes disconnect on 'ended'");
  assert.equal(A._debug().voices, 12);

  // Twelve high-priority voices: a low or normal newcomer is dropped, a high one cuts the oldest.
  for (const s of ctx().nodes.filter((x) => x.startAt != null && !x.disconnected)) s.end();
  assert.equal(A._debug().voices, 0);
  for (let i = 0; i < 3; i++) A.play('banner');  // 4 chord voices each
  assert.equal(A._debug().voices, 12);
  let n = oscs().length;
  A.play('tick'); assert.equal(oscs().length, n, 'low newcomer skipped');
  A.play('land'); assert.equal(oscs().length, n, 'normal newcomer skipped');
  A.play('gameOver'); assert.equal(oscs().length, n + 3, 'high newcomer cuts high voices');
  assert.equal(A._debug().voices, 12);
});

test("'ended' frees the slot and disconnects every node of the voice", () => {
  const A = unlocked();
  A.play('whoosh', { dir: 'right' });
  assert.equal(A._debug().voices, 1);
  const src = noiseSrcs()[0], flt = src.connections[0], gain = flt.connections[0], pan = gain.connections[0];
  src.end();
  assert.equal(A._debug().voices, 0);
  for (const n of [src, flt, gain, pan]) assert.equal(n.disconnected, true, n.kind);
  src.end();
  assert.equal(A._debug().voices, 0, 'double ended is harmless');
});

test('suspend()/resume() are idempotent, cut voices, and never resume a context that has not run yet', () => {
  let A = fresh(FakeCtx);
  assert.doesNotThrow(() => { A.suspend(); A.suspend(); A.resume(); A.resume(); });
  assert.equal(FakeCtx.instances.length, 0, 'safe before init: nothing created');

  FakeCtx.runOnResumeCall = 99;
  assert.equal(A.unlock(), false);
  A.resume();
  assert.equal(ctx().resumeCalls, 1, 'resume() outside a gesture does not poke a context that never ran');

  A = unlocked();
  A.play('tick');
  assert.equal(A._debug().voices, 1);
  A.suspend();
  assert.equal(A._debug().voices, 0);
  assert.equal(ctx().state, 'suspended');
  assert.equal(A._debug().appSuspended, true);
  assert.equal(A.play('tick'), false, 'silent while suspended');
  A.suspend();
  assert.equal(ctx().state, 'suspended');
  A.resume();
  assert.equal(ctx().state, 'running');
  assert.equal(A.play('tick'), true);
  A.resume();
  assert.equal(ctx().state, 'running');

  A.suspend();
  assert.equal(A.unlock(), true, 'a user gesture while suspended brings audio back');
  assert.equal(A.play('tick'), true);
});

test('never throws when the context misbehaves', () => {
  class Broken extends FakeCtx { createOscillator() { throw new Error('no osc'); } }
  let A = fresh(Broken);
  assert.equal(A.unlock(), true);
  assert.doesNotThrow(() => A.play('tick'));
  assert.equal(A.play('tick'), false);
  assert.equal(A._debug().voices, 0, 'failed voice released');
  assert.equal(A.play('whoosh', { dir: 'left' }), true, 'noise still works');
  class Dead { constructor() { throw new Error('no audio hardware'); } }
  A = fresh(Dead);
  assert.equal(A.init(), true);
  assert.doesNotThrow(() => A.unlock());
  assert.equal(A.unlock(), false);
  assert.equal(A.play('tick'), false);
  class NoGraph extends FakeCtx { createDynamicsCompressor() { throw new Error('nope'); } }
  A = fresh(NoGraph);
  assert.equal(A.unlock(), false);
  assert.equal(A._debug().state, 'none');
});
