// Immediate-mode canvas UI (buttons registered per frame for hit testing + accessible DOM mirrors) and DOM overlays for long text.
(function (g) {
  'use strict';
  var TB = g.TB || (g.TB = {});
  var Config = TB.Config, Layout = TB.Layout, R = TB.Renderer, Tilt = TB.Tilt;
  var P = function () { return R.getPalette(); };
  var buttons = [], lastA11yKey = '';
  function t(key, params) { return TB.I18N ? TB.I18N.t(key, params) : key; }
  function textScale(app) { return app.settings && app.settings.largeText ? 1.3 : 1; }

  function beginFrame() { buttons.length = 0; }
  // button(id, rect, label, {primary, disabled, size, sub, color, ghost})
  function button(id, rect, label, opts) {
    opts = opts || {};
    var pal = P(), c = R.ctx();
    buttons.push({ id: id, rect: rect, label: label, disabled: !!opts.disabled });
    var bg = opts.primary ? pal.accent : (opts.ghost ? 'rgba(255,255,255,0.06)' : pal.board);
    var fg = opts.primary ? Config.PALETTE.bg : pal.text;
    if (opts.disabled) { bg = 'rgba(255,255,255,0.08)'; fg = pal.text2; }
    c.fillStyle = bg; R.roundRect(rect.x, rect.y, rect.w, rect.h, 12); c.fill();
    if (!opts.primary && !opts.disabled) { c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; R.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 12); c.stroke(); }
    var size = opts.size || 17;
    R.text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 - (opts.sub ? 8 : 0), { size: size, weight: 700, color: fg, align: 'center', maxWidth: rect.w - 16 });
    if (opts.sub) R.text(opts.sub, rect.x + rect.w / 2, rect.y + rect.h / 2 + 11, { size: 12, weight: 600, color: opts.primary ? 'rgba(15,18,51,0.75)' : pal.text2, align: 'center', maxWidth: rect.w - 16 });
  }
  function panel(rect, opts) {
    opts = opts || {};
    var c = R.ctx(), pal = P();
    c.fillStyle = opts.color || 'rgba(26,31,77,0.98)'; R.roundRect(rect.x, rect.y, rect.w, rect.h, 18); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1; R.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 18); c.stroke();
    void pal;
  }
  function hitTest(lx, ly) {
    for (var i = buttons.length - 1; i >= 0; i--) { var b = buttons[i]; if (Layout.inRect({ x: lx, y: ly }, b.rect)) return b.disabled ? null : b.id; }
    return null;
  }
  // Mirror canvas buttons as real DOM buttons (keyboard / screen readers). Positions in CSS px.
  function syncA11y(onButton) {
    var host = g.document && g.document.getElementById('a11y-buttons'); if (!host) return;
    var key = buttons.map(function (b) { return b.id + ':' + b.label + ':' + Math.round(b.rect.x) + ':' + Math.round(b.rect.y) + ':' + (b.disabled ? 1 : 0); }).join('|') + '@' + Layout.version + ':' + Layout.S.toFixed(3);
    if (key === lastA11yKey) return; lastA11yKey = key;
    host.innerHTML = '';
    buttons.forEach(function (b) {
      var el = g.document.createElement('button');
      el.type = 'button'; el.textContent = b.label; el.disabled = b.disabled; el.setAttribute('data-id', b.id);
      var p = Layout.toClient(b.rect.x, b.rect.y);
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.width = (b.rect.w * Layout.S) + 'px'; el.style.height = (b.rect.h * Layout.S) + 'px';
      el.addEventListener('click', function (ev) { ev.preventDefault(); onButton(b.id); });
      host.appendChild(el);
    });
  }
  function announce(text) { var el = g.document && g.document.getElementById('a11y-live'); if (el) { el.textContent = ''; el.textContent = text; } }

  // ---------- screens ----------
  function drawTitle(app, y) {
    R.text('Sandslide', 180, y, { size: 42, weight: 900, color: P().accent, align: 'center' });
    R.text('流沙方塊', 180, y + 38, { size: 22, weight: 700, color: P().text, align: 'center' });
  }
  function drawMiniBoard(x, y, cell) {
    // decorative tilted 3x3 heap like the icon
    var c = R.ctx();
    c.save(); c.translate(x, y); c.rotate(12 * Math.PI / 180);
    c.fillStyle = P().board; R.roundRect(-cell * 1.7, -cell * 1.7, cell * 3.4, cell * 3.4, 10); c.fill();
    var cells = [[2, 0, 3], [2, 1, 3], [2, 2, 3], [1, 1, 1], [1, 2, 6], [0, 2, 5]];
    cells.forEach(function (q) { R.drawBlock(q[2], -cell * 1.5 + q[1] * cell, -cell * 1.5 + q[0] * cell, cell, 1, 1); });
    c.restore();
  }
  function drawMenu(app) {
    var pal = P(), ts = textScale(app);
    drawTitle(app, 92);
    drawMiniBoard(180, 212, 30);
    R.text(t('menu.tagline'), 180, 290, { size: 14 * ts, weight: 600, color: pal.text2, align: 'center', maxWidth: 320 });
    var best = app.profile ? app.profile.bestScore : 0;
    R.text(t('menu.best') + ' ' + best.toLocaleString(), 180, 322, { size: 16 * ts, weight: 700, color: pal.text, align: 'center' });
    var y = 352, h = 52, gap = 12;
    if (app.hasSave) { button('menu.continue', { x: 40, y: y, w: 280, h: h }, t('menu.continue'), { primary: true, size: 19 }); y += h + gap; button('menu.newGame', { x: 40, y: y, w: 280, h: h }, t('menu.newGame'), { size: 18 }); }
    else { button('menu.play', { x: 40, y: y, w: 280, h: h }, t('menu.play'), { primary: true, size: 19 }); }
    y += h + gap;
    button('menu.daily', { x: 40, y: y, w: 280, h: h }, t('menu.daily'), { size: 18, sub: app.dailyInfo ? t('daily.number', { n: app.dailyInfo.number }) + (app.dailyInfo.done ? ' · ' + t('daily.done') : '') : '' });
    y += h + gap;
    var w3 = (280 - 2 * gap) / 3;
    button('menu.help', { x: 40, y: y, w: w3, h: 44 }, t('menu.help'), { size: 14 });
    button('menu.settings', { x: 40 + w3 + gap, y: y, w: w3, h: 44 }, t('menu.settings'), { size: 14 });
    button('menu.stats', { x: 40 + 2 * (w3 + gap), y: y, w: w3, h: 44 }, t('menu.stats'), { size: 14 });
    if (Layout.L >= 640) R.text('v' + Config.VERSION, 180, Layout.L - 14, { size: 11, color: pal.text2, align: 'center' });
  }

  function drawHUD(app) {
    var game = app.game, pal = P(), ts = textScale(app); if (!game) return;
    var s = game.s, hud = Layout.rects.hud;
    if (app.tutorial && app.tutorial.hint) {
      R.text(app.tutorial.hint, 180, 40, { size: 20 * ts, weight: 800, color: pal.accent2, align: 'center', maxWidth: 340 });
      return;
    }
    R.text(t('hud.score'), 16, 22, { size: 12 * ts, weight: 700, color: pal.text2 });
    R.text(String(s.score), 16, 48, { size: 28 * ts, weight: 900, color: pal.text });
    var bestRef = s.mode === 'daily' ? (app.profile ? app.profile.bestDaily || 0 : 0) : (app.profile ? app.profile.bestScore || 0 : 0);
    var best = (s.meta && s.meta.practice) ? bestRef : Math.max(bestRef, s.score);
    R.text(t('hud.best'), 180, 22, { size: 12 * ts, weight: 700, color: pal.text2, align: 'center' });
    R.text(String(best), 180, 46, { size: 18 * ts, weight: 800, color: pal.text, align: 'center' });
    if (s.mode === 'daily') R.text(t('hud.hand', { n: Math.min(s.handIndex, s.rules.hands), total: s.rules.hands }), 180, 66, { size: 12 * ts, weight: 700, color: pal.text2, align: 'center' });
    else if (s.combo >= 2) {
      var c = R.ctx(); c.fillStyle = pal.accent; R.roundRect(140, 58, 80, 20, 10); c.fill();
      if (s.missStreak > 0) { c.fillStyle = 'rgba(15,18,51,0.35)'; R.roundRect(140, 58, 80, 20, 10); c.fill(); }
      R.text(t('hud.combo', { n: s.combo }), 180, 68, { size: 12, weight: 800, color: Config.PALETTE.bg, align: 'center' });
    }
    // tilt pips + next cost
    var cap = s.rules.storedCap, full = s.stored >= cap;
    for (var i = 0; i < cap; i++) {
      var x = 344 - (cap - 1 - i) * 22, y = 24;
      var cc = R.ctx(); cc.save(); cc.translate(x, y); cc.rotate(Math.PI / 4);
      cc.fillStyle = i < s.stored ? pal.accent : 'rgba(255,255,255,0.12)';
      if (i < s.stored) { cc.shadowColor = pal.accent; cc.shadowBlur = 8; }
      cc.fillRect(-7, -7, 14, 14); cc.restore();
    }
    R.text(full ? t('hud.max') : t('hud.nextTilt', { n: game.nextCost() - s.energy }), 344, 50, { size: 12 * ts, weight: 700, color: full ? pal.accent : pal.text2, align: 'right' });
    if (!full) {
      var frac = Math.min(1, s.energy / game.nextCost()), bx = 240, bw = 104;
      var c2 = R.ctx(); c2.fillStyle = 'rgba(255,255,255,0.12)'; R.roundRect(bx, 62, bw, 8, 4); c2.fill();
      c2.fillStyle = pal.accent; R.roundRect(bx, 62, Math.max(8, bw * frac), 8, 4); c2.fill();
    }
  }

  function drawBottomBar(app) {
    var b = Layout.rects.bottom, pal = P();
    if (app.tutorial) { button('tut.skip', { x: b.x + b.w - 100, y: b.y, w: 92, h: b.h }, t('tut.skip'), { ghost: true, size: 15 }); return; }
    var lh = !!(app.settings && app.settings.leftHanded);
    button('play.pause', { x: lh ? b.x + b.w - 64 : b.x + 8, y: b.y, w: 56, h: b.h }, '❚❚', { ghost: true, size: 18 });
    if (app.hint) R.text(app.hint, 200, b.y + b.h / 2, { size: 13 * textScale(app), weight: 700, color: pal.text2, align: 'center', maxWidth: 240 });
  }
  function drawChip(app) {
    if (!app.chipVisible) return;
    var r = Layout.rects.chip;
    if (app.settings && app.settings.leftHanded) r = { x: Layout.LW - r.x - r.w, y: r.y, w: r.w, h: r.h };
    button('chip.open', r, t('chip.outOfEnergy'), { primary: true, size: 12 });
  }
  function drawToast(app) {
    if (!app.toast) return;
    var pal = P(), c = R.ctx(), b = Layout.rects.board;
    var w = Math.min(340, R.measure(app.toast.text, 15, 700) + 28);
    var overPanel = ['rescue', 'chipSheet', 'gameover', 'confirm', 'menu', 'daily'].indexOf(app.screen) >= 0;
    var ty = overPanel ? 48 : b.y + b.h / 2;
    c.globalAlpha = app.toast.alpha != null ? app.toast.alpha : 1;
    c.fillStyle = 'rgba(15,18,51,0.92)'; R.roundRect(180 - w / 2, ty - 20, w, 40, 12); c.fill();
    c.strokeStyle = pal.accent; c.lineWidth = 1.5; R.roundRect(180 - w / 2, ty - 20, w, 40, 12); c.stroke();
    R.text(app.toast.text, 180, ty, { size: 15, weight: 700, color: pal.text, align: 'center', maxWidth: w - 20 });
    c.globalAlpha = 1;
  }

  function centerPanel(h) { var y = Math.max(96, Layout.rects.board.y + (Layout.rects.board.h - h) / 2); return { x: 24, y: y, w: 312, h: h }; }
  function drawPause(app) {
    R.drawDim(0.6);
    var p = centerPanel(250); panel(p);
    R.text(t('common.paused'), 180, p.y + 36, { size: 24, weight: 900, color: P().text, align: 'center' });
    button('pause.resume', { x: p.x + 24, y: p.y + 70, w: p.w - 48, h: 50 }, t('common.resume'), { primary: true });
    button('pause.settings', { x: p.x + 24, y: p.y + 130, w: p.w - 48, h: 46 }, t('menu.settings'));
    button('pause.quit', { x: p.x + 24, y: p.y + 186, w: p.w - 48, h: 46 }, t('common.quit'));
  }
  function drawConfirm(app) {
    R.drawDim(0.6);
    var p = centerPanel(170); panel(p);
    R.text(app.confirm.text, 180, p.y + 48, { size: 18, weight: 800, color: P().text, align: 'center', maxWidth: p.w - 32 });
    button('confirm.yes', { x: p.x + 24, y: p.y + 96, w: 124, h: 48 }, t('common.ok'), { primary: true });
    button('confirm.no', { x: p.x + p.w - 148, y: p.y + 96, w: 124, h: 48 }, t('common.cancel'));
  }
  function drawRescue(app) {
    R.drawDim(0.55);
    var info = app.gameOverInfo, p = centerPanel(260); panel(p);
    R.text(t('over.rescueTitle'), 180, p.y + 38, { size: 24, weight: 900, color: P().accent, align: 'center' });
    R.text(t('over.rescueDesc'), 180, p.y + 80, { size: 14, weight: 600, color: P().text2, align: 'center', maxWidth: p.w - 32 });
    var free = info.rescue === 'free', ready = info.rescue === 'free' || (info.rescue === 'ad' && app.rewardedReady);
    var label = free ? t('over.rescueFree') : (ready ? '▶ ' + t('over.rescueAd') : t('over.noAd'));
    button('rescue.accept', { x: p.x + 24, y: p.y + 120, w: p.w - 48, h: 52 }, label, { primary: true, disabled: !ready, size: 17 });
    button('rescue.decline', { x: p.x + 24, y: p.y + 186, w: p.w - 48, h: 50 }, t('over.noThanks'), { size: 17 });
  }
  function drawChipSheet(app) {
    R.drawDim(0.55);
    var p = centerPanel(230); panel(p);
    R.text(t('chip.sheetTitle'), 180, p.y + 38, { size: 22, weight: 900, color: P().accent, align: 'center' });
    R.text(t('chip.sheetBody'), 180, p.y + 78, { size: 14, weight: 600, color: P().text2, align: 'center', maxWidth: p.w - 32 });
    button('chip.watch', { x: p.x + 24, y: p.y + 110, w: p.w - 48, h: 50 }, '▶ ' + t('chip.watch'), { primary: true, disabled: !app.rewardedReady });
    button('chip.no', { x: p.x + 24, y: p.y + 170, w: p.w - 48, h: 46 }, t('over.noThanks'));
  }
  function drawGameOver(app) {
    var info = app.gameOverInfo, pal = P();
    R.drawDim(0.7);
    var p = { x: 20, y: 72, w: 320, h: Math.min(Layout.L - 110, 352) }; panel(p);
    var title = info.isNewBest ? t('over.newBest') : (info.mode === 'daily' && info.completed ? t('over.dailyDone') : t('over.title'));
    R.text(title, 180, p.y + 36, { size: 24, weight: 900, color: info.isNewBest ? pal.accent : pal.text, align: 'center', maxWidth: 300 });
    if (info.mode === 'daily') R.text(t('daily.number', { n: info.dailyNumber }) + ' · ' + t('over.hands', { n: info.hands, total: info.total }), 180, p.y + 64, { size: 13, weight: 700, color: pal.text2, align: 'center' });
    R.text(t('over.score'), 180, p.y + 92, { size: 13, weight: 700, color: pal.text2, align: 'center' });
    R.text(String(info.score), 180, p.y + 128, { size: 44, weight: 900, color: pal.accent, align: 'center' });
    R.text(t(info.mode === 'daily' ? 'over.bestDaily' : 'over.best') + ' ' + info.best, 180, p.y + 164, { size: 15, weight: 700, color: pal.text, align: 'center' });
    R.text(t('over.bestTilt', { n: info.bestTiltLines }) + '  ·  ' + t('over.bestCombo', { n: info.bestCombo }), 180, p.y + 190, { size: 13, weight: 600, color: pal.text2, align: 'center', maxWidth: 300 });
    var y = p.y + 220;
    button('over.again', { x: p.x + 24, y: y, w: p.w - 48, h: 52 }, t(info.mode === 'daily' && info.completed ? 'daily.practice' : 'over.playAgain'), { primary: true, size: 18 }); y += 62;
    button('over.share', { x: p.x + 24, y: y, w: (p.w - 48 - 12) / 2, h: 48 }, t('over.share'));
    button('over.home', { x: p.x + 24 + (p.w - 48 - 12) / 2 + 12, y: y, w: (p.w - 48 - 12) / 2, h: 48 }, t('over.home'));
  }
  function drawDaily(app) {
    var d = app.dailyInfo, pal = P(), ts = textScale(app);
    R.text(t('daily.title'), 180, 60, { size: 30, weight: 900, color: pal.accent, align: 'center' });
    R.text(t('daily.number', { n: d.number }), 180, 96, { size: 18 * ts, weight: 800, color: pal.text, align: 'center' });
    R.text(t('daily.reminder'), 180, 124, { size: 13 * ts, weight: 600, color: pal.text2, align: 'center', maxWidth: 320 });
    R.text((d.streak === 1 ? t('daily.streakOne') : t('daily.streak', { n: d.streak })) + '  ·  ' + t('daily.bestStreak', { n: d.bestStreak }), 180, 154, { size: 14 * ts, weight: 700, color: pal.text, align: 'center' });
    // calendar: last 30 days, 10 per row
    R.text(t('daily.calendar'), 180, 190, { size: 12 * ts, weight: 700, color: pal.text2, align: 'center' });
    var c = R.ctx();
    for (var i = 0; i < 30; i++) {
      var day = d.calendar[i]; var x = 40 + (i % 10) * 29, y = 206 + Math.floor(i / 10) * 29;
      c.fillStyle = day && day.score != null ? pal.accent : 'rgba(255,255,255,0.1)'; R.roundRect(x, y, 23, 23, 6); c.fill();
      if (day && day.today) { c.strokeStyle = pal.text; c.lineWidth = 2; R.roundRect(x, y, 23, 23, 6); c.stroke(); }
    }
    var y2 = 320;
    if (d.done) {
      R.text(t('over.score') + ' ' + d.score, 180, y2, { size: 18 * ts, weight: 800, color: pal.text, align: 'center' }); y2 += 34;
      button('daily.share', { x: 40, y: y2, w: 280, h: 50 }, t('over.share'), { primary: true }); y2 += 60;
      button('daily.practice', { x: 40, y: y2, w: 280, h: 48 }, t('daily.practice')); y2 += 58;
    } else if (d.canContinue) {
      button('daily.continue', { x: 40, y: y2, w: 280, h: 52 }, t('daily.continue'), { primary: true, size: 18 }); y2 += 62;
    } else if (d.started) {
      button('daily.practice', { x: 40, y: y2, w: 280, h: 52 }, t('daily.practice'), { primary: true, size: 18 }); y2 += 62;
    } else {
      button('daily.play', { x: 40, y: y2, w: 280, h: 52 }, t('daily.play'), { primary: true, size: 18 }); y2 += 62;
    }
    button('daily.back', { x: 40, y: y2, w: 280, h: 46 }, t('settings.back'));
  }
  function drawTutorialFinger(app) {
    var f = app.tutorial && app.tutorial.finger; if (!f || f.alpha <= 0) return;
    var c = R.ctx(); c.save(); c.globalAlpha = f.alpha;
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(f.x, f.y, 14, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P().accent; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, 20, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  // ---------- DOM overlays ----------
  function overlay() { return g.document.getElementById('overlay'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function para(s) { return esc(s).split('\n').map(function (l) { return '<p>' + l + '</p>'; }).join(''); }
  function openOverlay(html, onAction) {
    var el = overlay(); el.innerHTML = '<button class="close" data-action="close" aria-label="' + esc(t('common.close')) + '">✕</button>' + html; el.hidden = false; el.scrollTop = 0;
    el.onclick = function (ev) { var a = ev.target.closest('[data-action]'); if (!a) return; ev.preventDefault(); onAction(a.getAttribute('data-action'), a); };
    el.onchange = function (ev) { var a = ev.target.closest('[data-setting]'); if (!a) return; onAction('setting', a); };
    var first = el.querySelector('button'); if (first) first.focus();
  }
  function closeOverlay() { var el = overlay(); el.hidden = true; el.innerHTML = ''; }
  function isOverlayOpen() { var el = overlay(); return el && !el.hidden; }
  function openHelp(app, onAction) {
    var html = '<h1>' + esc(t('help.title')) + '</h1>' + para(t('help.rules')) +
      '<h2>' + esc(t('help.tiltTitle')) + '</h2>' + para(t('help.tiltBody')) +
      '<h2>' + esc(t('help.scoringTitle')) + '</h2>' + para(t('help.scoringBody')) +
      '<h2>' + esc(t('help.fairTitle')) + '</h2>' + para(t('help.fairBody').replace(/^(Fair play promise: |公平承諾：)/, '')) +
      '<h2>' + esc(t('help.privacyTitle')) + '</h2>' + para(t('help.privacyBody')) +
      '<p><a href="privacy.html" target="_blank" rel="noopener">' + esc(t('settings.privacyPolicy')) + '</a></p>' +
      '<p><button class="close" data-action="tutorial">' + esc(t('settings.replayTutorial')) + '</button></p>';
    openOverlay(html, onAction);
  }
  function openSettings(app, onAction) {
    var s = app.settings, rows = '';
    function toggle(key, label, val) { return '<label class="row"><span>' + esc(label) + '</span><input type="checkbox" data-setting="' + key + '"' + (val ? ' checked' : '') + '></label>'; }
    rows += toggle('sound', t('settings.sound'), s.sound);
    rows += toggle('haptics', t('settings.haptics'), s.haptics);
    rows += toggle('reducedMotion', t('settings.reducedMotion'), app.reducedMotionEffective);
    rows += toggle('largeText', t('settings.largeText'), s.largeText);
    rows += toggle('leftHanded', t('settings.leftHanded'), s.leftHanded);
    rows += '<label class="row"><span>' + esc(t('settings.language')) + '</span><select data-setting="lang"><option value="auto"' + (s.lang === 'auto' ? ' selected' : '') + '>' + esc(t('settings.langAuto')) + '</option><option value="en"' + (s.lang === 'en' ? ' selected' : '') + '>English</option><option value="zh-TW"' + (s.lang === 'zh-TW' ? ' selected' : '') + '>繁體中文</option></select></label>';
    var pals = '';
    for (var i = 0; i < 7; i++) {
      var unlocked = app.palettesUnlocked.indexOf(i) >= 0;
      var hint = unlocked ? '' : (i <= 4 ? t('settings.unlockScore', { n: Config.UNLOCKS.paletteScores[i - 1] }) : t('settings.unlockDays', { n: Config.UNLOCKS.paletteDays[i - 5] }));
      pals += '<button class="pal' + (s.palette === i ? ' sel' : '') + '" data-action="palette" data-index="' + i + '"' + (unlocked ? '' : ' disabled') + '>' + esc(t('palette.' + i)) + (unlocked ? '' : '<br><small>' + esc(hint) + '</small>') + '</button>';
    }
    var html = '<h1>' + esc(t('settings.title')) + '</h1>' + rows + '<h2>' + esc(t('settings.palette')) + '</h2><div class="pals">' + pals + '</div>' +
      (app.privacyOptionsRequired ? '<p><button class="close" data-action="privacy">' + esc(t('settings.privacy')) + '</button></p>' : '') +
      '<p><a href="privacy.html" target="_blank" rel="noopener">' + esc(t('settings.privacyPolicy')) + '</a></p>' +
      '<p><button class="close" data-action="tutorial">' + esc(t('settings.replayTutorial')) + '</button></p>' +
      '<p class="muted">' + esc(t('settings.version', { v: Config.VERSION })) + '</p>';
    openOverlay(html, onAction);
  }
  function openStats(app, onAction) {
    var st = app.statsSnapshot || {}, pr = app.profile || {};
    function row(label, val) { return '<div class="row"><span>' + esc(label) + '</span><b>' + esc(val) + '</b></div>'; }
    var html = '<h1>' + esc(t('stats.title')) + '</h1>' +
      row(t('stats.games'), st.games || 0) + row(t('stats.placements'), st.placements || 0) + row(t('stats.tilts'), st.tilts || 0) + row(t('stats.lines'), pr.totalLines || 0) +
      row(t('stats.bestScore'), pr.bestScore || 0) + row(t('stats.bestTilt'), pr.bestTiltLines || 0) + row(t('stats.bestCombo'), pr.bestCombo || 0) + row(t('stats.allClears'), pr.allClears || st.allClears || 0) +
      row(t('stats.days'), (pr.playDays || []).length) +
      '<p><button class="close" data-action="copy">' + esc(t('stats.copy')) + '</button> <span id="copy-status"></span></p>';
    openOverlay(html, onAction);
  }

  TB.UI = { beginFrame: beginFrame, button: button, panel: panel, hitTest: hitTest, syncA11y: syncA11y, announce: announce, t: t,
    drawMenu: drawMenu, drawHUD: drawHUD, drawBottomBar: drawBottomBar, drawChip: drawChip, drawToast: drawToast, drawPause: drawPause, drawConfirm: drawConfirm,
    drawRescue: drawRescue, drawChipSheet: drawChipSheet, drawGameOver: drawGameOver, drawDaily: drawDaily, drawTutorialFinger: drawTutorialFinger,
    openHelp: openHelp, openSettings: openSettings, openStats: openStats, closeOverlay: closeOverlay, isOverlayOpen: isOverlayOpen, buttons: buttons };
})(typeof globalThis !== 'undefined' ? globalThis : window);
