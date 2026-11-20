/* MAKE THE CUT — js/ambiente-ui.js (owner: ui_main; paquete P1 del «Ambiente de Carrera», notes/ambiente.md §2E)
 * VB.AmbienteUI: los diálogos del ambiente de Carrera en pantalla. Lee los eventos `amb:say` del frame (los genera VB.Ambiente) y los
 * pinta como bocadillo pequeño sobre la cabeza de quien habla (si es un atleta y está en cuadro) o, si no (árbitro, megafonía, TV,
 * banquillo, Faro, o el atleta fuera de cuadro), como subtítulo arriba en el centro (30 % del alto, debajo de la cinta si está).
 * Crea su propio DOM (#ambSay dentro de #hud) y su <style>. Nunca en la franja inferior (stick, botones), nunca sobre el marcador,
 * los botones del HUD, el challenge, la franja del entrenador, las fichas de elección ni el rótulo de tarjeta (VB.UI.ambChoiceRect /
 * cardRect, con guarda) ni sobre el balón (el subtítulo se aparta de él: en el plano de recepción de pista el sacador rival bota y
 * lanza justo al 30 % del alto). Con el sacador listo (serveReady) lo que quede del subtítulo se acorta a 0,9 s. Letra ≥ 12 px (el
 * texto 13 px, × --hs). «Menos movimiento»: solo fundidos. Se apagan en el golpe de saque, fuera del partido y durante la repetición.
 * API: init(ctx), update(g, dt, ev), clear(), rect() → zona ocupada {x, y, w, h} en px CSS o null, onState(s), onGameStart(g).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (typeof document === 'undefined') { VB.AmbienteUI = { init: function () { }, update: function () { }, clear: function () { }, rect: function () { return null; } }; return; }

  var ctx = null, layer = null, sub = null, styled = false;
  var POOL = 2, B = [], SUBQ = [], subCur = null, avoid = [], avoidT = 0, v3 = null, lastRect = { x: 0, y: 0, w: 0, h: 0 }, avoidEl = [];
  var BALL = { x: 0, y: 0, w: 0, h: 0, on: false }, BP = { x: 0, y: 0 };
  var HEAD = 2.05, GAP = 10, FADE_IN = 0.18, FADE_OUT = 0.28;
  var AVOID_SEL = ['#sb', '.hud-btns', '#chal', '#coach', '#banner', '#guide', '#callout', '#touchbar', '#zmHint'];
  var COL = { me: 'var(--gold,#ffd23f)', mate: 'var(--gold,#ffd23f)', team: 'var(--gold,#ffd23f)', coach: 'var(--amber,#ffb238)', rival: '#ff8a7a', rivalCoach: '#ff8a7a',
    ref: '#ffffff', speaker: 'var(--sky,#86c8ff)', tv: 'var(--ok,#4be0a0)', faro: '#c9a7ff' };

  var CSS = '#ambSay{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden}' +
    '#ambSay .as-b{position:absolute;left:0;top:0;max-width:min(240px,46vw);box-sizing:border-box;padding:5px 10px 6px;border-radius:12px;' +
    'background:var(--glass2,rgba(14,22,40,.92));border:2px solid var(--tk,rgba(0,0,0,.55));box-shadow:0 3px 0 var(--tk,rgba(0,0,0,.45));' +
    'color:var(--fg,#f7f2ea);font:600 calc(13px * var(--hs,1))/1.22 var(--ui,system-ui,sans-serif);opacity:0;visibility:hidden;will-change:transform,opacity}' +
    '#ambSay .as-b.on{visibility:visible}' +
    '#ambSay .as-b i{display:block;font:800 calc(12px * var(--hs,1))/1.1 var(--display,system-ui,sans-serif);letter-spacing:.03em;font-style:normal;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#ambSay .as-b span{display:block}' +
    '#ambSay .as-b::after{content:"";position:absolute;left:var(--tx,50%);bottom:-8px;width:12px;height:8px;margin-left:-6px;background:inherit;clip-path:polygon(0 0,100% 0,50% 100%);border:0}' +
    '#ambSay .as-b.nt::after{display:none}' +
    '#ambSay .as-s{position:absolute;left:50%;top:30%;max-width:min(560px,calc(100% - 48px));box-sizing:border-box;padding:6px 14px 7px;border-radius:10px;transform:translateX(-50%);' +
    'background:rgba(8,13,24,.86);border:2px solid var(--tk,rgba(0,0,0,.5));color:var(--fg,#f7f2ea);font:600 calc(14px * var(--hs,1))/1.25 var(--ui,system-ui,sans-serif);text-align:center;opacity:0;visibility:hidden}' +
    '#ambSay .as-s.on{visibility:visible}' +
    '#ambSay .as-s i{font:800 calc(12px * var(--hs,1))/1 var(--display,system-ui,sans-serif);letter-spacing:.03em;font-style:normal;margin-right:8px;vertical-align:1px}';

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function ensure() {
    if (layer && layer.isConnected) return true;
    var hud = document.getElementById('hud'); if (!hud) return false;
    if (!styled) { var s = el('style'); s.id = 'ambSayCss'; s.textContent = CSS; document.head.appendChild(s); styled = true; }
    layer = el('div', '', hud); layer.id = 'ambSay'; layer.setAttribute('aria-hidden', 'true');
    B.length = 0;
    for (var i = 0; i < POOL; i++) { var b = el('div', 'as-b', layer), n = el('i', '', b), t = el('span', '', b); B.push({ el: b, n: n, t: t, on: false, age: 0, dur: 0, pid: -1, pri: 0, w: 0, h: 0, x: -999, y: -999, team: 0, who: '' }); }
    sub = { el: el('div', 'as-s', layer), on: false, age: 0, dur: 0, pri: 0 };
    sub.n = el('i', '', sub.el); sub.t = el('span', '', sub.el);
    return true;
  }
  function rm() { return !!(ctx && ctx.reduceMotion); }
  function W() { return ctx && ctx.width || window.innerWidth; }
  function H() { return ctx && ctx.height || window.innerHeight; }
  function touch() { var a = document.getElementById('app'); return !!((a && a.classList.contains('is-touch')) || (ctx && ctx.isTouch)); }
  /** Franja inferior prohibida (mandos táctiles / avisos de abajo): todo lo nuestro termina antes de H − esto. */
  function bottomBand() { return touch() ? Math.max(150, H() * 0.36) : 96; }

  // ------------------------------------------------------------------ zonas que no se pisan
  // (sin basura por frame: los elementos se buscan una vez por capa; los rectángulos, al llegar una frase y luego cada 0,6 s)
  function refreshAvoid(force) {
    var now = performance.now(); if (!force && now - avoidT < 600) return; avoidT = now;
    avoid.length = 0;
    var app = layer ? layer.getBoundingClientRect() : { left: 0, top: 0 };
    if (!avoidEl.length || !avoidEl[0] || !avoidEl[0].isConnected) { avoidEl.length = 0; for (var k = 0; k < AVOID_SEL.length; k++) avoidEl.push(document.querySelector(AVOID_SEL[k])); }
    for (var i = 0; i < avoidEl.length; i++) {
      var e = avoidEl[i]; if (!e || !e.isConnected) continue;
      var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      var cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
      if (e.id === 'coach' && e.classList.contains('off')) continue;
      avoid.push({ x: r.left - app.left - 4, y: r.top - app.top - 4, w: r.width + 8, h: r.height + 8 });
    }
    var U = VB.UI;
    avoidFn(U && U.ambChoiceRect); avoidFn(U && U.cardRect);
  }
  function avoidFn(f) { if (typeof f !== 'function') return; try { var r2 = f(); if (r2 && r2.width > 0) avoid.push({ x: r2.x - 6, y: r2.y - 6, w: r2.width + 12, h: r2.height + 12 }); } catch (e) { } }
  /** Caja del balón en pantalla (con margen; más alta por encima: el lanzamiento del saque sube). BALL.on = false si no se ve. */
  function ballBox(g) {
    BALL.on = false;
    var b = g && g.ball; if (!b || !ctx.camera || !VB.toThree || !ctx.THREE) return;
    if (!v3) v3 = new ctx.THREE.Vector3();
    VB.toThree(b.x, b.y, b.z || 0, v3); v3.project(ctx.camera);
    if (!(v3.z > -1 && v3.z < 1)) return;
    BP.x = (v3.x + 1) * 0.5 * W(); BP.y = (1 - v3.y) * 0.5 * H();
    BALL.x = BP.x - 44; BALL.y = BP.y - 120; BALL.w = 88; BALL.h = 160; BALL.on = true;
  }
  function overBall(x, y, w, h) { return BALL.on && x < BALL.x + BALL.w && x + w > BALL.x && y < BALL.y + BALL.h && y + h > BALL.y; }
  function hits(x, y, w, h) {
    for (var i = 0; i < avoid.length; i++) { var a = avoid[i]; if (x < a.x + a.w && x + w > a.x && y < a.y + a.h && y + h > a.y) return a; }
    return null;
  }

  // ------------------------------------------------------------------ colocación
  function headOf(g, pid) {
    if (!g || !g.teams || pid < 0) return null;
    for (var t = 0; t < 2; t++) { var T = g.teams[t]; for (var i = 0; i < T.length; i++) if (T[i] && T[i].id === pid) return T[i]; }
    return null;
  }
  function project(p, g, out) {
    if (!ctx.camera || !VB.toThree || !ctx.THREE) return false;
    if (!v3) v3 = new ctx.THREE.Vector3();
    var k = g && g.cs ? g.cs : 1;
    VB.toThree(p.x, p.y, (p.z || 0) + HEAD, v3); void k;
    v3.project(ctx.camera);
    if (!(v3.z > -1 && v3.z < 1)) return false;
    out.x = (v3.x + 1) * 0.5 * W(); out.y = (1 - v3.y) * 0.5 * H();
    return out.x > 8 && out.x < W() - 8 && out.y > 8 && out.y < H() - 8;
  }
  var P = { x: 0, y: 0 };
  /** Sitio del bocadillo b con la cabeza en (hx, hy): encima, sin salirse, sin pisar nada. false → mejor subtítulo. */
  function place(b, hx, hy) {
    var w = b.w, h = b.h, Wd = W(), lim = H() - bottomBand(), x = hx - w / 2, y = hy - GAP - h - 8;
    x = Math.max(10, Math.min(Wd - 10 - w, x));
    var tail = true;
    if (y + h > lim) { y = lim - h; tail = false; }
    if (y < 8) return false;
    var a = hits(x, y, w, h), n = 0;
    while (a && n++ < 3) {   // debajo de lo que pisa (si cabe antes de la franja de abajo) o, si no, a un lado
      var y2 = a.y + a.h + 4;
      if (y2 + h <= lim) { y = y2; tail = false; }
      else { var x2 = a.x + a.w + 4; if (x2 + w <= Wd - 10) x = x2; else { x2 = a.x - w - 4; if (x2 >= 10) x = x2; else return false; } tail = false; }
      a = hits(x, y, w, h);
    }
    if (a) return false;
    for (var i = 0; i < B.length; i++) { var o = B[i]; if (o !== b && o.on && x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) { y = o.y - h - 6; tail = false; if (y < 8 || hits(x, y, w, h)) return false; } }
    b.x = x; b.y = y;
    b.el.classList.toggle('nt', !tail);
    if (tail) b.el.style.setProperty('--tx', Math.round(Math.max(14, Math.min(w - 14, hx - x))) + 'px');
    return true;
  }

  // ------------------------------------------------------------------ mostrar
  function showSub(e) {
    if (!sub) return;
    if (sub.on && sub.pri > (e.pri | 0) && sub.age < sub.dur - 0.3) { if (SUBQ.length < 2) SUBQ.push(e); return; }
    sub.n.textContent = e.name || ''; sub.n.style.color = COL[e.who] || '#fff'; sub.n.hidden = !e.name;
    sub.t.textContent = e.text || '';
    sub.on = true; sub.age = 0; sub.dur = +e.dur || 2.4; sub.pri = e.pri | 0;
    sub.el.classList.add('on');
    placeSub();
  }
  function placeSub() {
    var r = sub.el.getBoundingClientRect(), top = H() * 0.3, h = r.height || 30, w = r.width || 200, x = W() / 2 - w / 2;
    var a = hits(x, top, w, h), n = 0;
    while (a && n++ < 4) { top = a.y + a.h + 4; a = hits(x, top, w, h); }
    if (top + h > H() - bottomBand()) top = Math.max(8, H() * 0.3 - h - 40);
    // el balón (saque rival en el plano de recepción): por encima de su caja si cabe sin pisar nada; si no, por debajo
    if (overBall(x, top, w, h)) {
      var up = BALL.y - h - 6, dn = BALL.y + BALL.h + 6;
      if (up >= 8 && !hits(x, up, w, h)) top = up;
      else if (dn + h <= H() - bottomBand() && !hits(x, dn, w, h)) top = dn;
    }
    sub.el.style.top = Math.round(top) + 'px';
    sub.y = top; sub.h = h; sub.w = w; sub.x = x;
  }
  function showBubble(e, g) {
    var p = headOf(g, e.pid | 0);
    if (!p) return false;
    // el mismo que ya habla: se reutiliza su bocadillo; si no, uno libre o el de menos prioridad
    var b = null, i;
    for (i = 0; i < B.length; i++) if (B[i].on && B[i].pid === p.id) b = B[i];
    if (!b) for (i = 0; i < B.length; i++) if (!B[i].on) { b = B[i]; break; }
    if (!b) { b = B[0]; for (i = 1; i < B.length; i++) if (B[i].pri < b.pri || (B[i].pri === b.pri && B[i].age > b.age)) b = B[i]; if (b.pri > (e.pri | 0)) return false; }
    b.n.textContent = e.name || ''; b.n.style.color = COL[e.who] || '#fff';
    b.t.textContent = e.text || '';
    b.el.classList.add('on'); b.el.style.opacity = '0';
    b.w = b.el.offsetWidth; b.h = b.el.offsetHeight;
    if (!project(p, g, P) || !place(b, P.x, P.y)) { b.el.classList.remove('on'); return false; }
    if (g.mode === 'serve') { ballBox(g); if (overBall(b.x, b.y, b.w, b.h)) { b.el.classList.remove('on'); return false; } }   // (no sobre el saque)
    b.on = true; b.age = 0; b.dur = +e.dur || 2.4; b.pid = p.id; b.pri = e.pri | 0; b.who = e.who;
    apply(b);
    return true;
  }
  function apply(b) {
    var t = b.age, a = t < FADE_IN ? t / FADE_IN : t > b.dur - FADE_OUT ? Math.max(0, (b.dur - t) / FADE_OUT) : 1;
    var dy = rm() ? 0 : (1 - Math.min(1, t / FADE_IN)) * 6;
    b.el.style.opacity = a.toFixed(3);
    b.el.style.transform = 'translate3d(' + Math.round(b.x) + 'px,' + Math.round(b.y + dy) + 'px,0)';
  }
  function hideB(b) { b.on = false; b.el.classList.remove('on'); b.el.style.opacity = '0'; b.pid = -1; }
  function hideSub() { if (!sub) return; sub.on = false; sub.el.classList.remove('on'); sub.el.style.opacity = '0'; SUBQ.length = 0; }
  function clear() { for (var i = 0; i < B.length; i++) hideB(B[i]); hideSub(); }

  function live(g) {
    if (!ctx || !g || !g.career || g.demo) return false;
    if (ctx.replay || (VB.Replay && VB.Replay.active && VB.Replay.active())) return false;
    if (ctx.state === 'playing') return true;
    return ctx.state === 'over' && !!ctx.endHold;
  }

  // ------------------------------------------------------------------ API
  function anyOn() { for (var i = 0; i < B.length; i++) if (B[i].on) return true; return false; }
  function update(g, dt, ev) {
    if (!ctx) return;
    if (!live(g)) { if (layer) clear(); return; }
    var i, e, n = ev ? ev.length : 0, any = false;
    for (i = 0; i < n; i++) { e = ev[i]; if (e && (e.type === 'amb:say' || e.type === 'serveReady' || (e.type === 'hit' && e.kind === 'serve'))) { any = true; break; } }
    if (!any && !(sub && sub.on) && !anyOn()) return;
    if (!ensure()) return;
    if (sub && sub.on) ballBox(g);
    if (any) {
      refreshAvoid(true);
      for (i = 0; i < n; i++) {
        e = ev[i]; if (!e) continue;
        if (e.type === 'hit' && e.kind === 'serve') { clear(); continue; }   // nada vivo después del golpe de saque
        // sacador listo: lo que quede del subtítulo, 0,9 s como mucho (y nada en cola): el saque es del que saca
        if (e.type === 'serveReady') { if (sub && sub.on) sub.dur = Math.min(sub.dur, sub.age + 0.9); SUBQ.length = 0; continue; }
        if (e.type !== 'amb:say' || !e.text) continue;
        var anch = e.pid >= 0 && (e.who === 'me' || e.who === 'mate' || e.who === 'team' || e.who === 'rival');
        if (!anch || !showBubble(e, g)) showSub(e);
        if ((e.pri | 0) >= 2 && VB.UI && typeof VB.UI.srSay === 'function') { try { VB.UI.srSay((e.name ? e.name + ': ' : '') + e.text); } catch (er) { } }
      }
    } else refreshAvoid(false);
    var rdt = Math.min(0.1, ctx.realDt || dt || 0.016);
    for (i = 0; i < B.length; i++) {
      var b = B[i]; if (!b.on) continue;
      b.age += rdt;
      if (b.age >= b.dur) { hideB(b); continue; }
      var p = headOf(g, b.pid);
      // fuera de cuadro o sin sitio (corte de cámara, cinta nueva…): lo que queda de la frase pasa a subtítulo
      if (!p || !project(p, g, P) || !place(b, P.x, P.y)) { var rest = b.dur - b.age; if (rest > 0.8) showSub({ name: b.n.textContent, who: b.who, text: b.t.textContent, dur: rest, pri: b.pri }); hideB(b); continue; }
      apply(b);
    }
    if (sub && sub.on) {
      if (overBall(sub.x, sub.y, sub.w, sub.h)) placeSub();
      sub.age += rdt;
      var a = sub.age < FADE_IN ? sub.age / FADE_IN : sub.age > sub.dur - FADE_OUT ? Math.max(0, (sub.dur - sub.age) / FADE_OUT) : 1;
      sub.el.style.opacity = a.toFixed(3);
      if (sub.age >= sub.dur) { sub.on = false; sub.el.classList.remove('on'); if (SUBQ.length) showSub(SUBQ.shift()); }
    }
  }
  function rect() {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
    for (var i = 0; i < B.length; i++) { var b = B[i]; if (!b.on) continue; any = true; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    if (sub && sub.on) { any = true; x0 = Math.min(x0, sub.x); y0 = Math.min(y0, sub.y); x1 = Math.max(x1, sub.x + sub.w); y1 = Math.max(y1, sub.y + sub.h); }
    if (!any) return null;
    lastRect.x = x0; lastRect.y = y0; lastRect.w = x1 - x0; lastRect.h = y1 - y0;
    return lastRect;
  }
  VB.AmbienteUI = {
    init: function (c) { ctx = c; },
    update: update, clear: function () { if (layer) clear(); }, rect: rect,
    onState: function (s) { if (s !== 'playing' && s !== 'over' && layer) clear(); },
    onGameStart: function () { if (layer) clear(); },
    _state: function () { return { bubbles: B.filter(function (b) { return b.on; }).map(function (b) { return { who: b.who, pid: b.pid, x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h, text: b.t.textContent }; }), sub: sub && sub.on ? { text: sub.t.textContent, y: Math.round(sub.y) } : null }; }
  };
})();
