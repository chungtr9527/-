'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('../helpers/load-engine');
const HAPTICS = path.join(__dirname, '..', '..', 'www', 'js', 'haptics.js');

// Fresh module state per test (the IIFE keeps the throttle clock in a closure).
function fresh() {
  delete require.cache[require.resolve(HAPTICS)];
  require(HAPTICS);
  return globalThis.TB.Haptics;
}
function fakePlugin(opts) {
  const calls = [];
  return {
    calls,
    impact(o) { calls.push(['impact', o.style]); if (opts && opts.throws) throw new Error('boom'); return opts && opts.reject ? Promise.reject(new Error('nope')) : Promise.resolve(); },
    notification(o) { calls.push(['notification', o.type]); return Promise.resolve(); }
  };
}
function inject(plugin) { globalThis.Capacitor = { Plugins: { Haptics: plugin } }; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function setNavigator(v) { Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true, enumerable: true }); }
function restoreNavigator() { if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator; }

afterEach(() => { delete globalThis.Capacitor; restoreNavigator(); });

test('exposes the contract API and is a no-op without Capacitor or navigator.vibrate', () => {
  const H = fresh();
  for (const k of ['setEnabled', 'isEnabled', 'light', 'medium', 'heavy', 'success', 'warning', 'error']) assert.equal(typeof H[k], 'function', k);
  assert.equal(H.isEnabled(), true);
  assert.equal(H.light(), false); // Node's navigator has no vibrate, no plugin injected
});

test('routes impacts and notifications to a lazily resolved Capacitor plugin with string enums', async () => {
  const H = fresh();                 // loaded before the bridge exists...
  const p = fakePlugin(); inject(p); // ...and still finds it afterwards
  assert.equal(H.light(), true); await sleep(50);
  assert.equal(H.medium(), true); await sleep(50);
  assert.equal(H.heavy(), true); await sleep(50);
  assert.equal(H.success(), true); await sleep(50);
  assert.equal(H.warning(), true); await sleep(50);
  assert.equal(H.error(), true);
  assert.deepEqual(p.calls, [
    ['impact', 'LIGHT'], ['impact', 'MEDIUM'], ['impact', 'HEAVY'],
    ['notification', 'SUCCESS'], ['notification', 'WARNING'], ['notification', 'ERROR']
  ]);
});

test('throttles repeated effects inside 40 ms', async () => {
  const H = fresh(); const p = fakePlugin(); inject(p);
  assert.equal(H.light(), true);
  assert.equal(H.light(), false);
  assert.equal(H.medium(), true, 'a stronger effect inside the window still goes through');
  assert.equal(H.medium(), false);
  assert.equal(p.calls.length, 2);
  await sleep(60);
  assert.equal(H.light(), true);
  assert.equal(p.calls.length, 3);
});

test('inside the window only a stronger effect replaces the last one', async () => {
  const H = fresh(); const p = fakePlugin(); inject(p);
  assert.equal(H.light(), true);      // drop
  assert.equal(H.success(), true);    // clear in the same frame must not be swallowed
  assert.equal(H.light(), false);
  assert.equal(H.heavy(), false);     // same weight as success
  assert.equal(H.error(), true);
  assert.deepEqual(p.calls.map((c) => c[1]), ['LIGHT', 'SUCCESS', 'ERROR']);
});

test('setEnabled(false) silences everything; setEnabled(true) restores it', () => {
  const H = fresh(); const p = fakePlugin(); inject(p);
  H.setEnabled(false);
  assert.equal(H.isEnabled(), false);
  for (const k of ['light', 'medium', 'heavy', 'success', 'warning', 'error']) assert.equal(H[k](), false, k);
  assert.equal(p.calls.length, 0);
  H.setEnabled(true);
  assert.equal(H.isEnabled(), true);
  assert.equal(H.light(), true);
  assert.equal(p.calls.length, 1);
});

test('falls back to navigator.vibrate on the web, inside try/catch', async () => {
  const H = fresh();
  const patterns = [];
  setNavigator({ vibrate(p) { patterns.push(p); return true; } });
  assert.equal(H.light(), true); await sleep(50);
  assert.equal(H.medium(), true); await sleep(50);
  assert.equal(H.heavy(), true); await sleep(50);
  assert.deepEqual(patterns, [[20], [43], [61]]);
  H.setEnabled(false);
  assert.deepEqual(patterns[patterns.length - 1], 0, 'disabling cancels a running pattern');
  H.setEnabled(true);
  setNavigator({ vibrate() { throw new Error('denied'); } });
  assert.equal(H.light(), false);
  setNavigator({});
  await sleep(50);
  assert.equal(H.light(), false);
});

test('plugin failures are swallowed (sync throw and rejected promise)', async () => {
  const H = fresh();
  inject(fakePlugin({ throws: true }));
  assert.doesNotThrow(() => H.light());
  await sleep(50);
  inject(fakePlugin({ reject: true }));
  assert.equal(H.light(), true);
  await sleep(10); // an unhandled rejection would fail the process
});
