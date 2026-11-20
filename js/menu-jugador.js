/* MAKE THE CUT — js/menu-jugador.js: portada «materiales del vóley» con el sistema SPLAT (owner: ui_main; por defecto desde el 17-nov-2026,
 * Ferran: «Me gusta. Diseña todos así»). ?menu=old deja la portada de antes (comparar): este fichero no hace nada.
 *
 * El partido de demo se queda de fondo, a la vista y sin velos. Reutiliza los MISMOS botones (ids y manejadores de ui.js): solo los pone en
 * filas dentro de .menu-col y les da las clases del sistema (index.html, bloque «SPLAT · PORTADA»; dibujo en js/splat.js):
 *   - JUGAR: .sp-patch (parche crema cosido con el gajo de TU equipación) y, en su esquina, el sello .sp-stamp del Reto del día (.sp-pair).
 *   - Jugadores y Vestuario: .sp-btn.sp-wide de la equipación y del contraste; Jugadores lleva tu camiseta con el dorsal y Vestuario tu cabeza
 *     (retrato recortado de VB.Doll.portrait con req.matte, pintado una vez por main.js).
 *   - Cómo se juega, Controles y Ajustes: tres .sp-btn.sp-sm de tinta con icono dorado.
 *   - Carrera: .sp-ticket (brochazo turquesa) con tu escudo y el del rival.
 * Filas con data-sp-row: ←/→ dentro de la fila y ↑/↓ de fila en fila (ui.js adjustFocused / navMove). Pruebas: &mjseed=1 (Carrera de muestra),
 * &mjfocus=<id> (enfoca ese botón). Datos vivos sin coste por frame: una firma, como mucho cada 1,2 s.
 */
(function () {
  'use strict';
  var Q = {};
  try { location.search.replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); Q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1)); }); } catch (e) { }
  if (Q.menu === 'old') return;
  var VB = window.VB = window.VB || {};
  var S = VB.Splat;
  var menu = document.getElementById('menu'), col = menu && menu.querySelector('.menu-col'), nav = col && col.querySelector('.mlist');
  if (!menu || !col || !nav || !S) return;
  var $ = function (id) { return document.getElementById(id); };
  function mk(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cls(b, c) { if (b) c.split(' ').forEach(function (k) { if (k) b.classList.add(k); }); }

  menu.classList.add('mj', 'sp-full');
  col.setAttribute('data-sp-full', '');   // (ui.js setPage: #menu.sp-full en las páginas con el sistema)

  // camiseta con dorsal (Jugadores): el color es el de tu equipación; el número, tu dorsal
  var JERSEY = '<svg class="mj-jy" viewBox="0 0 64 60" aria-hidden="true" focusable="false"><path class="j0" d="M22 3 6 11l5 13 6-2.5V57h30V21.5l6 2.5 5-13L42 3c-1.5 4.2-5.3 7-10 7S23.5 7.2 22 3z"/>' +
    '<path class="j1" d="M22 3c1.5 4.2 5.3 7 10 7s8.5-2.8 10-7"/><text class="j2" x="32" y="46" text-anchor="middle">1</text></svg>';

  // ---------------------------------------------------------------- DOM: nueva disposición de los mismos botones
  var brand = col.querySelector('.brand'), side = mk('div', 'mj-side');
  col.appendChild(side);
  if (brand) side.appendChild(brand);
  side.appendChild(nav);
  var bCont = $('btnCont'), bPlay = $('btnPlay'), bSq = $('btnSquad'), bLook = $('btnLook'), bTut = $('btnTut'), bCtl = $('btnControls'), bSet = $('btnSettings');
  var go = mk('div', 'mj-go sp-pair'), tape = mk('div', 'mj-tape'), strip = mk('div', 'mj-strip');
  [go, tape, strip].forEach(function (r) { r.setAttribute('data-sp-row', ''); });
  var stamp = mk('button', 'sp-stamp');
  stamp.type = 'button'; stamp.id = 'btnMjReto'; stamp.setAttribute('aria-label', 'Reto del día'); stamp.setAttribute('data-ring', 'RETO DEL DÍA ★ RETO DEL DÍA ★');
  stamp.innerHTML = '<span class="sp-sc" id="mjStampC"></span>';
  if (bPlay) {
    cls(bPlay, 'sp-patch');
    var ptx = bPlay.querySelector('.pl-tx'); cls(ptx, 'sp-l');
    if (ptx && ptx.firstElementChild) cls(ptx.firstElementChild, 'sp-t');
    cls($('playMainSub'), 'sp-s');
    go.appendChild(bPlay);
  }
  go.appendChild(stamp);
  /** Rótulo y línea pequeña de los .mi de siempre (<span>Texto</span><span class="mi-s">…</span>) con las clases del sistema. */
  function label(b) { if (!b) return; var f = b.querySelector(':scope>span:not(.mi-s)'); cls(f, 'sp-t'); cls(b.querySelector(':scope>.mi-s'), 'sp-s'); }
  if (bSq) { cls(bSq, 'sp-btn sp-wide sp-kit'); bSq.setAttribute('data-shape', '0'); label(bSq); bSq.insertAdjacentHTML('afterbegin', '<span class="mj-ic mj-jyw">' + JERSEY + '</span>'); tape.appendChild(bSq); }
  if (bLook) { cls(bLook, 'sp-btn sp-wide sp-alt'); bLook.setAttribute('data-shape', '1'); label(bLook); bLook.insertAdjacentHTML('afterbegin', '<span class="mj-ic mj-head"><img alt="" draggable="false" hidden></span>'); tape.appendChild(bLook); }
  [[bTut, S.ICONS.tut], [bCtl, S.ICONS.ctl], [bSet, S.ICONS.set]].forEach(function (p, i) {
    if (!p[0]) return;
    cls(p[0], 'sp-btn sp-sm sp-ink'); p[0].setAttribute('data-shape', String(i)); label(p[0]);
    p[0].insertAdjacentHTML('afterbegin', '<span class="sp-ic">' + p[1] + '</span>'); strip.appendChild(p[0]);
  });
  if (bCont) { cls(bCont, 'sp-ticket'); bCont.appendChild(mk('span', 'sp-tk', '')); nav.appendChild(bCont); }
  nav.appendChild(go); nav.appendChild(tape); nav.appendChild(strip);
  var sub = $('playMainSub'); if (sub) sub.textContent = 'Partido rápido, 6 contra 6 y entrenamiento';
  var lsub = bLook && bLook.querySelector('.mi-s'); if (lsub) lsub.textContent = 'Tu aspecto';
  S.decorate(menu);

  stamp.addEventListener('click', function () { var r = $('btnRetos'); if (r) r.click(); });
  // móvil (notes/ui_main.md «Móvil (v-next)»): el «?» de Controlar y Cámara en Partido rápido abre su ayuda en una hoja (VB.Splat.info)
  if (S.info && $('mpQuick')) S.info($('mpQuick'));
  // (el «⋯» del Vestuario ya va en index.html y su hoja la abre ui.js lkMoreSheet: WP6 del plan del Vestuario)
  var lkF = $('lkFoot'); if (lkF) S.decorate(lkF);

  // ---------------------------------------------------------------- datos vivos (sin coste por frame: firma, como mucho cada 1,2 s)
  function career() { try { var C = VB.Career; return C && C.get ? C.get() : null; } catch (e) { return null; } }
  function prog() { try { return VB.Prog && VB.Prog.get ? VB.Prog.get().a[0] : null; } catch (e) { return null; } }
  function crest(k, px, c) { try { var W = VB.CareerWorldUI; return k && W && W.crestSVG ? W.crestSVG(k, px, { c: c }) : ''; } catch (e) { return ''; } }
  var headKey = '', lastSig = '', ticketSig = '';
  function headReq(c) {
    var r = null;
    if (c && VB.CareerUI && VB.CareerUI.portraitReq) r = VB.CareerUI.portraitReq(c, 'me', 72, 'alegria');
    if (!r && VB.UI && VB.UI.portraitReqMatch) r = VB.UI.portraitReqMatch(0, 0, 72);
    if (!r) return null;
    var px = Math.max(128, Math.min(320, Math.ceil(($('btnLook') ? $('btnLook').getBoundingClientRect().height : 60) * 1.5 * (window.devicePixelRatio || 1) / 32) * 32));
    return Object.assign({}, r, { matte: true, bg: 0, pose: 'stand', face: 'alegria', yaw: -0.5, zoom: 1, size: px });
  }
  function setHead(url) {
    var img = bLook && bLook.querySelector('.mj-head img'); if (!img || !url || img.getAttribute('src') === url) return;
    img.onload = function () { img.hidden = false; bLook.classList.add('has-head'); };
    img.setAttribute('src', url);
  }
  function askHead(c) {
    var A = VB.ctx && VB.ctx.actions, req = headReq(c); if (!A || !A.portrait || !req) return;
    var r = null; try { r = A.portrait(req); } catch (e) { r = null; }
    if (!r || !r.key) return;
    headKey = r.key; if (r.url) setHead(r.url);
  }
  window.addEventListener('vb-portrait', function (ev) { var d = ev && ev.detail; if (d && d.key === headKey && d.url) setHead(d.url); });

  function ticket(c) {
    var t = bCont && bCont.querySelector('.sp-tk'); if (!t || !c) return;
    var H = null, n = null, me = null, K = VB.Career;
    try { H = VB.CareerUI && VB.CareerUI.heroData ? VB.CareerUI.heroData(c) : null; } catch (e) { H = null; }
    try { n = K && K.next ? K.next(c) : null; } catch (e) { n = null; }
    try { me = K && K.myClub ? K.myClub(c) : null; } catch (e) { me = null; }
    if (!H) return;
    var rv = n && n.rival, away = n && n.kind === 'league' && n.atHome === false;
    var crests = me ? '<span class="sp-crest">' + crest(me, 40, c) + '</span>' + (rv ? '<i class="sp-vs">' + (away ? 'en' : 'vs') + '</i><span class="sp-crest">' + crest(rv, 40, c) + '</span>' : '') : '<span class="sp-crest">' + S.BALL + '</span>';
    var k = rv ? 'Próximo partido' : 'Carrera · ' + H.kind, ttl = rv ? rv.name : H.title, ln = rv ? (H.chip ? H.chip + ' · ' : '') + 'Continuar carrera' : (H.chip ? H.chip + ' · ' : '') + (H.line || '');
    var h = '<span class="sp-tk-stub">' + crests + '</span><span class="sp-tk-main"><small class="sp-k">' + esc(k) + '</small><b class="sp-t">' + esc(ttl) + '</b><small class="sp-s">' + esc(ln) + '</small></span>' +
      '<span class="sp-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span>';
    var cmp = h.replace(/n\d+"/g, '"').replace(/n\d+\)/g, ')');
    if (cmp !== ticketSig) { ticketSig = cmp; t.innerHTML = h; }
  }
  function stampSync() {
    var R = VB.Retos, C = $('mjStampC');
    stamp.hidden = !R || !$('btnRetos');
    if (!R || !C) return;
    var ds = null, un = 0, dd = null; try { ds = R.dayState(); un = R.unseen().length; dd = R.daily ? R.daily() : null; } catch (e) { return; }
    var m = ds ? ds.m | 0 : 0, MED = ['', 'Bronce', 'Plata', 'Oro'];
    var h = m ? '<i class="sc-med t' + m + '"></i><b>' + MED[m] + '</b>' : S.BALL + '<b>Hoy</b>';
    if (C._h !== h) { C._h = h; C.innerHTML = h; }
    stamp.classList.toggle('sp-dot', un > 0);
    stamp.setAttribute('aria-label', 'Reto del día' + (dd && dd.mapName ? ' en ' + dd.mapName : '') + ', ' + (m ? 'hoy ' + MED[m].toLowerCase() : 'sin jugar'));
  }
  function sync(force) {
    if (!VB.ctx || VB.ctx.state !== 'menu') return;
    var c = career(), live = c && c.player ? c : null, a = prog();
    var num = a ? a.num : 1, lvl = a ? a.lvl : 1;
    if (live) { num = live.player.num | 0; lvl = (live.player.lvl | 0) || 1; }
    S.sync();   // colores de la equipación (Ajustes o el club de la Carrera) en :root
    stampSync();
    if (live) ticket(live);
    var hc = !!(bCont && !bCont.hidden); if (menu.classList.contains('has-cont-mj') !== hc) menu.classList.toggle('has-cont-mj', hc);
    var hb = bLook ? Math.round(bLook.getBoundingClientRect().height) : 0;
    var sig = [S.kit(), num, lvl, live ? 1 : 0, hb].join('|');
    if (!force && sig === lastSig && headKey) return;
    lastSig = sig;
    var jt = bSq && bSq.querySelector('.j2'); if (jt) { jt.textContent = String(num); jt.setAttribute('font-size', String(num).length > 1 ? '22' : '27'); }
    askHead(live);
  }
  function tick() { try { sync(false); } catch (e) { try { console.error('[VB][ERROR] menu-jugador: ' + (e && e.message || e)); } catch (e2) { } } }
  setInterval(tick, 1200);
  window.addEventListener('resize', function () { setTimeout(tick, 120); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(tick, 300); }); else setTimeout(tick, 300);

  // ---------------------------------------------------------------- pruebas (capturas): &mjseed=1 Carrera de muestra con club; &mjfocus=id enfoca
  if (Q.mjseed === '1') {
    setTimeout(function () {
      try {
        var C = VB.Career; if (!C || C.get()) return;
        var c = C.create({ name: 'Ares Belmonte', num: 7, role: 'cr', points: 21, seed: 4242, ctrl: 'one' });
        var oi = 0; (c.offers || []).some(function (o, i) { if (!o.trial) { oi = i; return true; } return false; });
        C.acceptOffer(oi, 2);
        for (var i = 0; i < 4 && C.simulateNext; i++) C.simulateNext(C.get());
        if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu();
        sync(true);
      } catch (e) { console.warn('[VB] mjseed: ' + e); }
    }, 900);
  }
  if (Q.mjfocus) setTimeout(function () { var b = $(Q.mjfocus); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { } b.classList.add('kf'); } }, 2600);
})();
