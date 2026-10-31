// Daily Slide: date keys, seeds, puzzle numbers, streaks. Pure (dates are passed in as local date parts).
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var EPOCH = TB.Config.DAILY_EPOCH;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // d: { y, m (1-12), d } or a Date-like object with getFullYear/getMonth/getDate (local time).
  function dateKey(d) {
    if (d && typeof d.getFullYear === 'function') return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return d.y + '-' + pad(d.m) + '-' + pad(d.d);
  }
  function isValidKey(k) {
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    var t = utc(k); if (isNaN(t)) return false;
    var d = new Date(t); // round-trip rejects rolled-over months/days such as 2026-13-01
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) === k;
  }
  function utc(k) { var p = k.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); }
  function shiftKey(k, days) { var t = new Date(utc(k) + days * 86400000); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function seedFor(k) { return 'sandslide-daily-' + k; }
  function numberFor(k) { return daysBetween(EPOCH, k) + 1; }
  // streak: { current, best, lastDate }. Called when the official daily attempt for `k` is completed.
  function updateStreak(streak, k) {
    var s = { current: (streak && streak.current) | 0, best: (streak && streak.best) | 0, lastDate: streak && streak.lastDate || null };
    if (s.lastDate === k) return s;
    s.current = (s.lastDate && shiftKey(s.lastDate, 1) === k) ? s.current + 1 : 1;
    if (s.current > s.best) s.best = s.current;
    s.lastDate = k;
    return s;
  }
  // A streak is still alive on day k if the last completion was k or the day before.
  function isAlive(streak, k) { return !!(streak && streak.lastDate && (streak.lastDate === k || shiftKey(streak.lastDate, 1) === k)); }

  TB.Daily = { EPOCH: EPOCH, dateKey: dateKey, isValidKey: isValidKey, seedFor: seedFor, numberFor: numberFor,
    daysBetween: daysBetween, shiftKey: shiftKey, updateStreak: updateStreak, isAlive: isAlive };
})(typeof globalThis !== 'undefined' ? globalThis : window);
