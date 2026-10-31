// Scoring and combo rules. Pure functions over TB.Config.SCORE.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var S = TB.Config.SCORE;

  function placement(shape) { return S.perCell * shape.size; }
  // n lines cleared in one event at combo c (c >= 1): lineBase * n(n+1)/2 * c
  function clearPoints(n, combo) { return S.lineBase * (n * (n + 1) / 2) * Math.max(1, combo); }
  // Combo transition. kind: 'place' | 'tilt'. Returns the new {combo, missStreak}; score the clear with the NEW combo.
  function afterEvent(state, linesCleared, kind) {
    var combo = state.combo | 0, miss = state.missStreak | 0;
    if (linesCleared > 0) return { combo: combo + 1, missStreak: 0 };
    if (kind === 'place') { miss++; if (miss > S.comboMissGrace) combo = 0; return { combo: combo, missStreak: miss }; }
    return { combo: combo, missStreak: miss }; // non-clearing tilt is neutral
  }

  TB.Scoring = { placement: placement, clearPoints: clearPoints, afterEvent: afterEvent, allClear: S.allClear };
})(typeof globalThis !== 'undefined' ? globalThis : window);
