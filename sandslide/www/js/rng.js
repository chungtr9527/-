// Seeded PRNG: cyrb128 hash -> sfc32. Serializable state. Pure (no Math.random, no Date).
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});

  function hash(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762, k;
    for (var i = 0; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  // seed: string | number (hashed) or a 4-element state array (restored verbatim).
  function create(seed) {
    var fromState = Array.isArray(seed);
    var s = fromState ? seed : hash(String(seed));
    var a = s[0] | 0, b = s[1] | 0, c = s[2] | 0, d = s[3] | 0;
    var rng = {
      next: function () {
        var t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ (b >>> 9);
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
      },
      int: function (n) { return Math.floor(rng.next() * n); },
      pick: function (arr) { return arr[rng.int(arr.length)]; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) { var j = rng.int(i + 1); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
        return arr;
      },
      state: function () { return [a >>> 0, b >>> 0, c >>> 0, d >>> 0]; },
      restore: function (st) { a = st[0] | 0; b = st[1] | 0; c = st[2] | 0; d = st[3] | 0; return rng; }
    };
    if (!fromState) for (var i = 0; i < 12; i++) rng.next();
    return rng;
  }

  // One independent generator per hand, so redraws in hand N never change hand N+1.
  function handRng(seed, handIndex) { return create(String(seed) + '#' + handIndex); }

  TB.RNG = { hash: hash, create: create, handRng: handRng };
})(typeof globalThis !== 'undefined' ? globalThis : window);
