// Pointer input FSM: tray press -> drag with lift; board press -> arm on threshold, commit on release; taps elsewhere.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Config = TB.Config, Layout = TB.Layout;
  var I = Config.INPUT;
  var canvas = null, H = null, enabled = true;
  var st = { mode: 'idle', pointerId: null, slot: -1, hit: null, x0: 0, y0: 0, t0: 0, lx0: 0, ly0: 0, dir: null, samples: [], lastL: null };

  function now() { return (g.performance && g.performance.now) ? g.performance.now() : Date.now(); }
  function reset() { st.mode = 'idle'; st.pointerId = null; st.slot = -1; st.hit = null; st.dir = null; st.samples.length = 0; }
  function logical(e) { return Layout.toLogical(e.clientX, e.clientY); }

  function dirOf(dx, dy) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax >= ay * I.axisRatio) return dx > 0 ? 'right' : 'left';
    if (ay >= ax * I.axisRatio) return dy > 0 ? 'down' : 'up';
    return null;
  }
  function threshold() { return Math.max(I.swipeMinFrac * Layout.boardCssWidth(), I.swipeMinPx); }
  function velocity() {
    var s = st.samples; if (s.length < 2) return 0;
    var last = s[s.length - 1], i = s.length - 2;
    while (i > 0 && last.t - s[i].t < 60) i--;
    var dt = last.t - s[i].t; if (dt <= 0) return 0;
    return Math.hypot(last.x - s[i].x, last.y - s[i].y) / dt;
  }

  function onDown(e) {
    if (!enabled || st.pointerId !== null) return;
    if (e.button != null && e.button !== 0) return;
    H.onActivity && H.onActivity(e);
    st.pointerId = e.pointerId; st.x0 = e.clientX; st.y0 = e.clientY; st.t0 = now();
    var lp = logical(e); st.lx0 = lp.x; st.ly0 = lp.y; st.lastL = lp; st.samples.length = 0; st.samples.push({ t: st.t0, x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var hit = H.hitTest(lp.x, lp.y) || { kind: 'none' };
    st.hit = hit;
    if (hit.kind === 'tray' && H.onDragStart(hit.slot, lp.x, lp.y)) { st.mode = 'drag'; st.slot = hit.slot; }
    else st.mode = 'press';
    if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId !== st.pointerId) return;
    var lp = logical(e); st.lastL = lp;
    st.samples.push({ t: now(), x: e.clientX, y: e.clientY }); if (st.samples.length > 12) st.samples.shift();
    if (st.mode === 'drag') { H.onDragMove(st.slot, lp.x, lp.y); return; }
    if (st.mode !== 'press' && st.mode !== 'armed') return;
    var canSwipe = st.hit.kind === 'board' || st.hit.kind === 'arrow';
    if (!canSwipe) return;
    var dx = e.clientX - st.x0, dy = e.clientY - st.y0, dist = Math.hypot(dx, dy);
    var dir = dirOf(dx, dy), th = threshold();
    if (st.mode === 'press') {
      var armed = dir && (dist >= th || (velocity() >= I.flickMinVel && dist >= I.flickMinPx));
      H.onSwipeMove && H.onSwipeMove(dir, Math.min(1, dist / th));
      if (armed) { st.mode = 'armed'; st.dir = dir; H.onSwipeArm(dir); }
    } else {
      var along = st.dir === 'left' ? -dx : st.dir === 'right' ? dx : st.dir === 'up' ? -dy : dy;
      if (along < th * I.disarmFrac || (dir && dir !== st.dir && dist >= th)) { st.mode = 'press'; st.dir = null; H.onSwipeDisarm(); }
      else H.onSwipeMove && H.onSwipeMove(st.dir, 1);
    }
  }
  function onUp(e) {
    if (e.pointerId !== st.pointerId) return;
    H.onActivity && H.onActivity(e);
    var lp = logical(e), dt = now() - st.t0, dist = Math.hypot(e.clientX - st.x0, e.clientY - st.y0);
    var mode = st.mode, slot = st.slot, dir = st.dir, hit = st.hit;
    reset();
    if (mode === 'drag') { H.onDragEnd(slot, lp.x, lp.y); return; }
    if (mode === 'armed') { H.onSwipeCommit(dir); return; }
    if (mode === 'press') {
      H.onSwipeDisarm && H.onSwipeDisarm();
      if (dist <= I.tapMaxDist && dt <= I.tapMaxMs) H.onTap(hit, lp.x, lp.y);
    }
  }
  function onCancel(e) {
    if (e && e.pointerId != null && e.pointerId !== st.pointerId) return;
    var mode = st.mode, slot = st.slot;
    reset();
    if (mode === 'drag') H.onDragCancel(slot);
    else if (mode === 'armed') H.onSwipeDisarm();
  }

  function attach(cv, handlers) {
    canvas = cv; H = handlers;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('lostpointercapture', function (e) { if (st.pointerId !== null && e.pointerId === st.pointerId && st.mode !== 'idle') onCancel(e); });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    g.addEventListener('blur', function () { onCancel(); });
    if (g.document) g.document.addEventListener('visibilitychange', function () { if (g.document.hidden) onCancel(); });
  }
  TB.Input = { attach: attach, setEnabled: function (v) { enabled = !!v; if (!v) onCancel(); }, isDragging: function () { return st.mode === 'drag'; },
    isBusy: function () { return st.mode !== 'idle'; }, cancel: function () { onCancel(); }, state: st };
})(typeof globalThis !== 'undefined' ? globalThis : window);
