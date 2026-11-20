/* MAKE THE CUT — js/profile.js (owner: ui_main)
 * Perfil (S4-D2 tanda A, T13): nivel de perfil global, hitos y álbum con huecos. Puro: sin DOM ni THREE; localStorage en try/catch
 * (sin almacenamiento funciona en memoria). index.html lo carga después de js/look.js y antes de js/venues.js (T15). Lee VB.Prog,
 * VB.Badges, VB.Gym, VB.Look, VB.Career.beach/hall.get(), VB.CareerLife.ACH_INFO, VB.VENUES y VB.Retos, siempre en diferido y con
 * guarda. No usa g.rng ni toca la sim (la huella 2v2 no cambia).
 *
 * XP total = max(px, base.xp + Σ dev[d].xp + derivada). Así nada cuenta dos veces aunque se juegue en dos dispositivos:
 *  - dev[devId]: contador por dispositivo (partidos humanos acabados); devId vive en 'make-the-cut.devid' y NUNCA sube a la nube.
 *  - derivada: medallas del Entrenamiento (VB.Gym), mejor nivel de cada insignia (bd), logros de Carrera de por vida (ach), títulos
 *    (car), sedes (ven), hitos (hit) y VB.Retos.profileXP().
 *  - base: relleno inicial (récord + Carreras actuales + Salón de la Fama), una vez, por máximo.
 *  - px: pico visto (por máximo): el nivel nunca baja.
 * Curva: need(l) = 60 + 20·l (Nv 2 = 80 XP, Nv 10 = 1 440, Nv 30 = 10 440, Nv 50 = 27 440; máximo 99). Sin moneda.
 *
 * Guardado 'make-the-cut.profile' v1 (< 4 KB con 24 dispositivos y 40 Carreras; por eso dev y car van en listas y las fechas en días):
 *   { v:1, base:{xp,m,w}, dev:{"<devId>":[xp,m,w,m2,m6,mc,gy]}, px, ven:{sede:día}, ach:{logro:día}, hit:{hito:día},
 *     bd:{insignia:1..3}, car:{"b:<seed>"|"h:<seed>":[p,w,tit,aw]} (≤ 40), ann, pin:[aid ≤ 3], pt (ms), seen:{aid:1} }
 *   día = floor(ms / 86 400 000) (el álbum solo enseña la fecha). clean() acepta también la forma con objetos y horas en ms.
 * Contrato D4: texto dañado → 'make-the-cut.profile.bak' + lost(); v < V → .bak {from, raw} y se migra; v > V → solo lectura
 * (readOnly(), save no escribe) y mergeRaw devuelve el lado de mayor v sin tocarlo.
 *
 * API (VB.Profile): V, KEY, DEV_KEY, HITOS, LVL_XP, need, levelOf, level, xp, stats, noteMatch (= addMatch), noteGym, check, album,
 * vitrina, pin, unpin, unseenCount, markSeen, nextPrize, footText, load, lost, readOnly, mergeRaw, clean, _reload, _devId.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var KEY = 'make-the-cut.profile', DEV_KEY = 'make-the-cut.devid', V = 1;
  var LVL_XP = { easy: 0.8, normal: 1, hard: 1.2, expert: 1.4 };
  var MAX_LVL = 99, MAX_CAR = 40, MAX_PIN = 3;
  var GYM_XP = [20, 30, 50], BD_XP = [15, 25, 40], ACH_XP = 30, TIT_XP = 50, VEN_XP = 20;
  var GYM_IDS = ['serve', 'recv', 'set', 'atk', 'block'];
  var GYM_NAMES = { serve: 'Saque', recv: 'Recepción', set: 'Colocación', atk: 'Remate', block: 'Bloqueo' };
  var TIER_NAMES = ['', 'Bronce', 'Plata', 'Oro'];
  // Hitos (S4-D2 §2.4): cada uno da XP una sola vez. how = la condición, texto exacto del pie.
  var HITOS = [
    { id: 'debut', name: 'Primer partido', how: 'Juega un partido', xp: 40 },
    { id: 'm25', name: 'Habitual', how: 'Juega 25 partidos', xp: 80 },
    { id: 'm100', name: 'Cien partidos', how: 'Juega 100 partidos', xp: 150 },
    { id: 'm300', name: 'Toda una vida', how: 'Juega 300 partidos', xp: 250 },
    { id: 'w10', name: 'Diez victorias', how: 'Gana 10 partidos', xp: 60 },
    { id: 'w100', name: 'Cien victorias', how: 'Gana 100 partidos', xp: 150 },
    { id: 'modos', name: 'De todo un poco', how: 'Juega Partido rápido, 6 contra 6, Carrera y Entrenamiento', xp: 100 },
    { id: 'gira', name: 'De gira', how: 'Juega en 3 sedes', xp: 60 },
    { id: 'sedes', name: 'Todas las sedes', how: 'Juega en todas las sedes', xp: 120 },
    { id: 'bd1', name: 'Primera insignia', how: 'Consigue una insignia', xp: 40 },
    { id: 'bd12', name: 'Colección completa', how: 'Consigue las 12 insignias', xp: 200 },
    { id: 'oro', name: 'Oro puro', how: 'Sube una insignia a oro', xp: 120 },
    { id: 'gym5', name: 'Medallista', how: 'Gana 5 medallas en el Entrenamiento', xp: 60 },
    { id: 'gymoro', name: 'Cinco oros', how: 'Oro en los 5 ejercicios', xp: 200 },
    { id: 'vida', name: 'Vida de deportista', how: 'Consigue 10 logros de Carrera', xp: 100 },
    { id: 'titulo', name: 'Primer título', how: 'Gana un título en la Carrera', xp: 100 }
  ];
  var HIT_BY = {}; HITOS.forEach(function (h) { HIT_BY[h.id] = h; });
  var SRC_TXT = { carrera: ' en la Carrera', boss: ' en la Carrera', tienda: ' en la tienda', gym: ' en el Entrenamiento',
    record: ' en Partido rápido', hito: ' por nivel de perfil', retos: ' en los Retos' };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  // iconos sencillos (SVG en línea; el color lo pone la UI con currentColor y la clase del nivel)
  var IC = {
    hit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>',
    ven: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    ach: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3h10v3h3v2a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V6h3zm-1 5a2 2 0 0 0 1 1.7V8zm12 0v1.7A2 2 0 0 0 18 8z"/></svg>',
    gym: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h4l1 4 1-4h4l-3 7.2A6 6 0 1 1 10 9.2zm5 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>'
  };

  // ---------------------------------------------------------------- utilidades
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function n0(v, hi) { v = +v; if (!isFinite(v) || v <= 0) return 0; v = Math.floor(v); return hi != null && v > hi ? hi : v; }
  function okKey(k) { return typeof k === 'string' && /^[A-Za-z0-9_:.\-]{1,40}$/.test(k); }
  function okCar(k) { return typeof k === 'string' && /^[bh]:[A-Za-z0-9_.\-]{1,30}$/.test(k); }
  function okDev(k) { return typeof k === 'string' && /^[A-Za-z0-9]{1,24}$/.test(k); }
  function now() { return Date.now(); }
  function tmin(a, b) { return a && b ? Math.min(a, b) : a || b || 0; }
  function sorted(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
  function LS() { try { return window.localStorage || null; } catch (e) { return null; } }
  function rd(k) { var s = LS(); if (!s) return null; try { return s.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { var s = LS(); if (!s) return false; try { s.setItem(k, v); return true; } catch (e) { return false; } }
  function pj(raw) { try { return JSON.parse(raw); } catch (e) { return undefined; } }

  // ---------------------------------------------------------------- curva
  /** XP para pasar del nivel l al l+1. */
  function need(l) { return 60 + 20 * l; }
  /** Nivel de una XP total: {lvl, into (XP dentro del nivel), next (XP del nivel; 0 en el máximo), total}. */
  function levelOf(xp) {
    var t = n0(xp), r = t, l = 1;
    while (l < MAX_LVL && r >= need(l)) { r -= need(l); l++; }
    return { lvl: l, into: l < MAX_LVL ? r : 0, next: l < MAX_LVL ? need(l) : 0, total: t };
  }

  // ---------------------------------------------------------------- saneado y fusión
  var DEV_F = ['xp', 'm', 'w', 'm2', 'm6', 'mc', 'gy'], CAR_F = ['p', 'w', 'tit', 'aw'], DAY = 864e5;
  function emptyDev() { return { xp: 0, m: 0, w: 0, m2: 0, m6: 0, mc: 0, gy: 0 }; }
  function today() { return Math.floor(now() / DAY); }
  function dayOf(v) { v = n0(v, 9e15); return v > 1e8 ? Math.floor(v / DAY) : v; }   // (ms → día; un día ya es < 1e8)
  function msOf(d) { return d > 0 ? d * DAY + DAY / 2 : 0; }
  function fields(e, F) { var r = {}; F.forEach(function (f, i) { r[f] = Array.isArray(e) ? e[i] : isObj(e) ? e[f] : 0; }); return r; }
  /** Perfil interno → objeto para guardar (dev y car en listas). */
  function pack(o) {
    var p = {}, k;
    for (k in o) p[k] = o[k];
    p.dev = {}; Object.keys(o.dev).forEach(function (d) { p.dev[d] = DEV_F.map(function (f) { return o.dev[d][f]; }); });
    p.car = {}; Object.keys(o.car).forEach(function (c) { p.car[c] = CAR_F.map(function (f) { return o.car[c][f]; }); });
    return p;
  }
  function txtOf(o) { return JSON.stringify(pack(o)); }
  function empty() {
    return { v: V, base: { xp: 0, m: 0, w: 0 }, dev: {}, px: 0, ven: {}, ach: {}, hit: {}, bd: {}, car: {}, ann: 1, pin: [], pt: 0, seen: {} };
  }
  function capCar(car) {
    var ks = Object.keys(car);
    if (ks.length <= MAX_CAR) return car;
    ks.sort(function (a, b) { return (car[b].p - car[a].p) || (a < b ? -1 : a > b ? 1 : 0); });
    var out = {}; ks.slice(0, MAX_CAR).forEach(function (k) { out[k] = car[k]; });
    return out;
  }
  /** Objeto cualquiera → perfil v1 limpio, con las claves ordenadas (forma canónica: dos limpiezas iguales dan el mismo texto). */
  function clean(o) {
    var out = empty();
    if (!isObj(o)) return out;
    var b = isObj(o.base) ? o.base : {};
    out.base = { xp: n0(b.xp, 1e9), m: n0(b.m, 1e7), w: n0(b.w, 1e7) };
    var d = isObj(o.dev) ? o.dev : {}, dv = {};
    Object.keys(d).forEach(function (k) {
      if (!okDev(k) || !(isObj(d[k]) || Array.isArray(d[k]))) return;
      var e = fields(d[k], DEV_F);
      dv[k] = { xp: n0(e.xp, 1e9), m: n0(e.m, 1e7), w: n0(e.w, 1e7), m2: n0(e.m2, 1e7), m6: n0(e.m6, 1e7), mc: n0(e.mc, 1e7), gy: n0(e.gy, 1e7) };
    });
    out.dev = sorted(dv);
    out.px = n0(o.px, 1e9);
    ['ven', 'ach', 'hit'].forEach(function (f) {
      var s = isObj(o[f]) ? o[f] : {}, r = {};
      Object.keys(s).forEach(function (k) { if (okKey(k) && (f !== 'hit' || HIT_BY[k]) && s[k]) r[k] = dayOf(s[k]) || 1; });
      out[f] = sorted(r);
    });
    var bd = isObj(o.bd) ? o.bd : {}, rb = {};
    Object.keys(bd).forEach(function (k) { var lv = n0(bd[k], 3); if (okKey(k) && lv) rb[k] = lv; });
    out.bd = sorted(rb);
    var car = isObj(o.car) ? o.car : {}, rc = {};
    Object.keys(car).forEach(function (k) {
      if (!okCar(k) || !(isObj(car[k]) || Array.isArray(car[k]))) return;
      var e = fields(car[k], CAR_F); rc[k] = { p: n0(e.p, 1e6), w: n0(e.w, 1e6), tit: n0(e.tit, 1e4), aw: n0(e.aw, 1e4) };
    });
    out.car = sorted(capCar(rc));
    out.ann = Math.max(1, n0(o.ann, MAX_LVL));
    var pin = Array.isArray(o.pin) ? o.pin : [];
    pin.forEach(function (a) { if (okKey(a) && out.pin.indexOf(a) < 0 && out.pin.length < MAX_PIN) out.pin.push(a); });
    out.pt = n0(o.pt, 9e15);
    var se = isObj(o.seen) ? o.seen : {}, rs = {};
    Object.keys(se).forEach(function (k) { if (okKey(k) && se[k]) rs[k] = 1; });
    out.seen = sorted(rs);
    return out;
  }
  /** Une dos perfiles limpios (conmutativa, idempotente y asociativa salvo el tope de 40 Carreras). */
  function mergeObj(A, B) {
    var o = empty();
    o.base = { xp: Math.max(A.base.xp, B.base.xp), m: Math.max(A.base.m, B.base.m), w: Math.max(A.base.w, B.base.w) };
    var dv = {};
    [A.dev, B.dev].forEach(function (X) {
      Object.keys(X).forEach(function (k) {
        var e = X[k], c = dv[k];
        if (!c) { dv[k] = { xp: e.xp, m: e.m, w: e.w, m2: e.m2, m6: e.m6, mc: e.mc, gy: e.gy }; return; }
        DEV_F.forEach(function (f) { if (e[f] > c[f]) c[f] = e[f]; });
      });
    });
    o.dev = sorted(dv);
    o.px = Math.max(A.px, B.px);
    ['ven', 'ach', 'hit'].forEach(function (f) {
      var r = {};
      [A[f], B[f]].forEach(function (X) { Object.keys(X).forEach(function (k) { r[k] = tmin(r[k], X[k]); }); });
      o[f] = sorted(r);
    });
    var rb = {};
    [A.bd, B.bd].forEach(function (X) { Object.keys(X).forEach(function (k) { rb[k] = Math.max(rb[k] | 0, X[k]); }); });
    o.bd = sorted(rb);
    var rc = {};
    [A.car, B.car].forEach(function (X) {
      Object.keys(X).forEach(function (k) {
        var e = X[k], c = rc[k];
        if (!c) { rc[k] = { p: e.p, w: e.w, tit: e.tit, aw: e.aw }; return; }
        ['p', 'w', 'tit', 'aw'].forEach(function (f) { if (e[f] > c[f]) c[f] = e[f]; });
      });
    });
    o.car = sorted(capCar(rc));
    o.ann = Math.max(A.ann, B.ann);
    // vitrina: gana la pt mayor; empate → el texto mayor (determinista en los dos órdenes)
    var useB = B.pt > A.pt || (B.pt === A.pt && JSON.stringify(B.pin) > JSON.stringify(A.pin));
    o.pin = (useB ? B : A).pin.slice(); o.pt = Math.max(A.pt, B.pt);
    var rs = {};
    [A.seen, B.seen].forEach(function (X) { Object.keys(X).forEach(function (k) { rs[k] = 1; }); });
    o.seen = sorted(rs);
    return o;
  }
  /** Une dos textos de 'make-the-cut.profile'. Devuelve texto (el local tal cual si no cambia nada). Si un lado trae v > V, gana entero el
   *  de mayor v (no se rebaja). Un lado ilegible no cuenta. */
  function mergeRaw(Lraw, Rraw) {
    var Lp = Lraw == null ? null : pj(Lraw), Rp = Rraw == null ? null : pj(Rraw);
    if (!isObj(Lp)) Lp = null; if (!isObj(Rp)) Rp = null;
    if (!Rp) return Lraw != null ? Lraw : Rraw;
    var lv = Lp ? +Lp.v || 0 : 0, rv = +Rp.v || 0;
    if (lv > V || rv > V) return rv > lv ? Rraw : Lraw;
    var B = clean(Rp);
    if (!Lp) return txtOf(B);
    var A = clean(Lp), txt = txtOf(mergeObj(A, B));
    return txt === txtOf(A) ? Lraw : txt;
  }

  // ---------------------------------------------------------------- lectores (diferidos y con guarda)
  function gymData() {
    var G = VB.Gym, out = {};
    GYM_IDS.forEach(function (id) {
      var e = null;
      if (G && typeof G.get === 'function') { try { e = G.get(id); } catch (er) { e = null; } }
      out[id] = e ? { m: e.m | 0, n: e.n | 0, t: e.t | 0 } : { m: 0, n: 0, t: 0 };
    });
    return out;
  }
  function careers() {   // [{c, pre}] de las dos Carreras que existan
    var C = VB.Career, out = [];
    [['b', 'beach'], ['h', 'hall']].forEach(function (p) {
      var E = C && C[p[1]], c = null;
      if (E && typeof E.get === 'function') { try { c = E.get(); } catch (e) { c = null; } }
      if (isObj(c)) out.push({ c: c, pre: p[0] });
    });
    return out;
  }
  function athletes() {
    var out = [];
    if (VB.Prog && typeof VB.Prog.squad === 'function') { try { (VB.Prog.squad() || []).forEach(function (a) { if (a) out.push(a); }); } catch (e) { } }
    careers().forEach(function (x) { if (isObj(x.c.player)) out.push(x.c.player); });
    return out;
  }
  function legendsList() {
    var CL = VB.CareerLife, a = null;
    if (CL && typeof CL.legends === 'function') { try { a = CL.legends(); } catch (e) { a = null; } }
    if (!Array.isArray(a)) { a = pj(rd('make-the-cut.legends') || 'null'); }
    return Array.isArray(a) ? a : [];
  }
  function retosXP() {
    var R = VB.Retos;
    if (!R || typeof R.profileXP !== 'function') return 0;
    try { return n0(R.profileXP(), 1e8); } catch (e) { return 0; }
  }
  function venAll() { return VB.VENUES && typeof VB.VENUES === 'object' ? Object.keys(VB.VENUES).length : 6; }
  function bdTotal() { return VB.Badges && VB.Badges.LIST ? VB.Badges.LIST.length : 12; }
  function achInfo() {
    var CL = VB.CareerLife;
    return CL && Array.isArray(CL.ACH_INFO) ? CL.ACH_INFO : null;
  }
  function carKey(pre, c) { var s = String(c.seed != null ? c.seed : c.created || '0').replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 30) || '0'; return pre + ':' + s; }
  function titles(c) { return (Array.isArray(c.trophies) ? c.trophies : []).filter(function (t) { return t && (t.kind === 'liga' || t.kind === 'copa' || t.kind === 'intl'); }).length; }

  // ---------------------------------------------------------------- estado
  var cur = null, curRaw, lostF = false, ro = false, stamp = 0, devMem = null, stash = [];
  function backfill() {
    var r = pj(rd('make-the-cut.record') || 'null'), played = 0, wins = 0, cp = 0, cw = 0, lp = 0;
    if (isObj(r)) { played = n0(r.played, 1e7); wins = n0(r.wins, 1e7); }
    careers().forEach(function (x) { var k = isObj(x.c.career) ? x.c.career : {}; cp += n0(k.played, 1e6); cw += n0(k.won, 1e6); });
    legendsList().forEach(function (l) { if (isObj(l)) lp += n0(l.played, 1e6); });
    return { xp: 25 * played + 15 * wins + 25 * (cp + lp), m: played + cp + lp, w: wins + cw };
  }
  function fresh() { var o = empty(); o.base = backfill(); return o; }
  /** Perfil vivo (relee si el texto guardado cambió, p. ej. tras una bajada de la cuenta). */
  function state() {
    var raw = rd(KEY);
    if (cur && raw === curRaw) return cur;
    curRaw = raw; ro = false; stamp++;   // (lostF se queda hasta _reload: la UI lo avisa una vez)
    if (raw == null) { cur = fresh(); return cur; }
    var o = pj(raw);
    if (!isObj(o)) {   // texto dañado: copia en .bak y se empieza en blanco
      lostF = true;
      if (rd(KEY + '.bak') !== raw) wr(KEY + '.bak', raw);
      cur = fresh(); return cur;
    }
    var v = +o.v || 0;
    if (v > V) { ro = true; cur = clean(o); cur.v = V; return cur; }
    if (v < V) { wr(KEY + '.bak', JSON.stringify({ from: v, raw: raw })); cur = clean(o); save(); return cur; }   // (MIG: no hay versiones anteriores a la 1)
    cur = clean(o);
    return cur;
  }
  function save() {
    if (ro || !cur) return false;
    var txt = txtOf(cur);
    if (txt === curRaw) return false;
    if (wr(KEY, txt)) curRaw = txt; else if (curRaw == null) curRaw = null;
    stamp++;
    return true;
  }
  function devId() {
    if (devMem) return devMem;
    var d = rd(DEV_KEY);
    if (!okDev(d)) {
      d = 'd' + Date.now().toString(36) + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4);
      d = d.slice(0, 24);
      wr(DEV_KEY, d);
    }
    devMem = d;
    return d;
  }

  // ---------------------------------------------------------------- XP y nivel
  function derived(s) {
    var x = 0, g = gymData();
    GYM_IDS.forEach(function (id) { for (var m = 1; m <= Math.min(3, g[id].m); m++) x += GYM_XP[m - 1]; });
    Object.keys(s.bd).forEach(function (k) { for (var l = 1; l <= s.bd[k]; l++) x += BD_XP[l - 1]; });
    x += ACH_XP * Object.keys(s.ach).length + VEN_XP * Object.keys(s.ven).length;
    Object.keys(s.car).forEach(function (k) { x += TIT_XP * s.car[k].tit; });
    Object.keys(s.hit).forEach(function (k) { x += HIT_BY[k] ? HIT_BY[k].xp : 0; });
    return x + retosXP();
  }
  function sumDev(s, f) { var t = 0; Object.keys(s.dev).forEach(function (k) { t += s.dev[k][f]; }); return t; }
  function rawTotal(s) { return s.base.xp + sumDev(s, 'xp') + derived(s); }
  function totalOf(s) { return Math.max(s.px, rawTotal(s)); }
  var lvCache = { k: null, v: null };
  /** {lvl, into, next, total}, cacheado por el texto del perfil, del Entrenamiento y de los Retos (barato para renderMenu). */
  function level() {
    var s = state(), k = stamp + '|' + (rd('make-the-cut.gym') || '') + '|' + (rd('make-the-cut.retos') || '');
    if (lvCache.k !== k || !lvCache.v) { lvCache.k = k; lvCache.v = levelOf(totalOf(s)); }
    var v = lvCache.v;
    return { lvl: v.lvl, into: v.into, next: v.next, total: v.total };
  }
  function xp() { return level().total; }
  /** {m, w, m2, m6, mc, gy, ven, venAll}: partidos y victorias de todos los modos humanos (base + dispositivos). */
  function stats(s) {
    s = s || state();
    return { m: s.base.m + sumDev(s, 'm'), w: s.base.w + sumDev(s, 'w'), m2: sumDev(s, 'm2'), m6: sumDev(s, 'm6'), mc: sumDev(s, 'mc'),
      gy: sumDev(s, 'gy'), ven: Object.keys(s.ven).length, venAll: venAll() };
  }

  // ---------------------------------------------------------------- premios por nivel (alternativa {lvl} de VB.Look, T9)
  var lvlOk = false;
  function lvlItems() {   // [{lvl, id}] ordenados por nivel (vacío si look.js aún no tiene la alternativa)
    var L = VB.Look, out = [];
    if (!L || !Array.isArray(L.CATALOG)) return out;
    L.CATALOG.concat(Array.isArray(L.PALETTE) ? L.PALETTE : []).forEach(function (it) {
      (Array.isArray(it.unlock) ? it.unlock : []).forEach(function (u) { if (u && +u.lvl > 0) out.push({ lvl: +u.lvl, id: it.id }); });
    });
    out.sort(function (a, b) { return a.lvl - b.lvl; });
    return out;
  }
  function lvlSupport() {
    if (lvlOk) return true;
    var L = VB.Look;
    lvlOk = !!(L && typeof L.checkGlobal === 'function' && lvlItems().length);
    return lvlOk;
  }
  function lookName(id) {
    var L = VB.Look;
    if (L && typeof L.name === 'function') { try { var n = L.name(id); if (typeof n === 'string' && n) return n; } catch (e) { } }
    return id;
  }
  function lookOwned(id) { var L = VB.Look; try { return !!(L && typeof L.owned === 'function' && L.owned(id)); } catch (e) { return false; } }
  /** Siguiente premio de nivel sin conseguir: {lvl, id, name} | null. */
  function nextPrize() {
    var lv = level().lvl, it = lvlItems();
    for (var i = 0; i < it.length; i++) if (it[i].lvl > lv && !lookOwned(it[i].id)) return { lvl: it[i].lvl, id: it[i].id, name: lookName(it[i].id) };
    return null;
  }
  function grantLevel(lv) {
    if (!lvlSupport()) return [];
    var r = [];
    // solo la alternativa de nivel: gym/récord vacíos, para no robarle avisos a lkCheckNew (Vestuario)
    try { r = VB.Look.checkGlobal({ lvl: lv, gym: {}, gymN: 0, rec: { wins: 0, played: 0, streak: 0 } }) || []; } catch (e) { r = []; }
    return Array.isArray(r) ? r.slice() : [];
  }

  // ---------------------------------------------------------------- escaneo
  function hitOk(id, st, s, g) {
    switch (id) {
      case 'debut': return st.m >= 1;
      case 'm25': return st.m >= 25;
      case 'm100': return st.m >= 100;
      case 'm300': return st.m >= 300;
      case 'w10': return st.w >= 10;
      case 'w100': return st.w >= 100;
      case 'modos': return st.m2 > 0 && st.m6 > 0 && st.mc > 0 && (st.gy > 0 || GYM_IDS.some(function (k) { return g[k].n > 0; }));
      case 'gira': return st.ven >= 3;
      case 'sedes': return st.venAll > 0 && st.ven >= st.venAll;
      case 'bd1': return Object.keys(s.bd).length >= 1;
      case 'bd12': return Object.keys(s.bd).length >= bdTotal();
      case 'oro': return Object.keys(s.bd).some(function (k) { return s.bd[k] >= 3; });
      case 'gym5': return GYM_IDS.reduce(function (a, k) { return a + g[k].m; }, 0) >= 5;
      case 'gymoro': return GYM_IDS.every(function (k) { return g[k].m >= 3; });
      case 'vida': return Object.keys(s.ach).length >= 10;
      case 'titulo': return Object.keys(s.car).some(function (k) { return s.car[k].tit > 0; });
    }
    return false;
  }
  /** Escanea insignias, Carreras y hitos; sella lo nuevo, sube el nivel avisado y concede los premios de nivel (VB.Look). Idempotente:
   *  guarda solo si cambia algo. Devuelve {lvlUp:[n], hitos:[ids], grants:[ids]}; incluye los hitos sellados por noteMatch/noteGym
   *  desde la última llamada (la hoja final ya enseña la XP, el nivel y el premio; los hitos los avisa el menú). */
  function check() {
    var s = state(), t = today(), hitos = [], lvlUp = [], ch = false;
    athletes().forEach(function (a) {
      var bd = isObj(a.bd) ? a.bd : {};
      Object.keys(bd).forEach(function (k) { var lv = n0(bd[k], 3); if (okKey(k) && lv > (s.bd[k] | 0)) { s.bd[k] = lv; ch = true; } });
    });
    careers().forEach(function (x) {
      var c = x.c, l = isObj(c.life) ? c.life : {}, ach = isObj(l.ach) ? l.ach : {}, k = isObj(c.career) ? c.career : {};
      Object.keys(ach).forEach(function (id) { if (ach[id] && okKey(id) && !s.ach[id]) { s.ach[id] = t; ch = true; } });
      var key = carKey(x.pre, c), e = s.car[key] || { p: 0, w: 0, tit: 0, aw: 0 };
      var nv = { p: Math.max(e.p, n0(k.played, 1e6)), w: Math.max(e.w, n0(k.won, 1e6)), tit: Math.max(e.tit, titles(c)), aw: Math.max(e.aw, Array.isArray(l.awards) ? l.awards.length : 0) };
      if (!s.car[key] || nv.p !== e.p || nv.w !== e.w || nv.tit !== e.tit || nv.aw !== e.aw) { s.car[key] = nv; ch = true; }
    });
    if (ch) { s.bd = sorted(s.bd); s.ach = sorted(s.ach); s.car = sorted(capCar(s.car)); }
    var st = stats(s), g = gymData();
    HITOS.forEach(function (h) { if (!s.hit[h.id] && hitOk(h.id, st, s, g)) { s.hit[h.id] = t; hitos.push(h.id); ch = true; } });
    if (hitos.length) s.hit = sorted(s.hit);
    var tot = rawTotal(s);
    if (tot > s.px) { s.px = tot; ch = true; }
    var L = levelOf(s.px);
    if (L.lvl > s.ann) { lvlUp.push(L.lvl); s.ann = L.lvl; ch = true; }   // (varios niveles de golpe: se avisa solo el último)
    var grants = grantLevel(L.lvl);
    if (ch) stamp++;
    save();   // (no escribe si el texto no cambia; recoge también lo que hayan sumado noteMatch/noteGym)
    var out = { lvlUp: lvlUp, hitos: hitos, grants: grants };
    if (stash.length) {
      stash.forEach(function (id) { if (out.hitos.indexOf(id) < 0) out.hitos.unshift(id); });
      stash = [];
    }
    return out;
  }
  function stashHitos(r) { (r.hitos || []).forEach(function (id) { if (stash.indexOf(id) < 0) stash.push(id); }); }
  /** Partido humano acabado. o = {mode:'2v2'|'6v6'|'career', win, setsWon, diff, venue}. La UI no lo llama en demo, espectador,
   *  autopilot, depuración ni Carrera simulada. Devuelve {xp, lvl0, lvl1, lvl, lvlUp, prize:[ids], prizeName, hitos}. */
  function noteMatch(o) {
    o = isObj(o) ? o : {};
    var s = state(), lv0 = levelOf(totalOf(s)).lvl;
    var win = !!o.win, sw = n0(o.setsWon, 5), D = LVL_XP[o.diff] || 1;
    var gain = Math.round((20 + (win ? 15 : 0) + 5 * sw) * D);
    var id = devId(), d = s.dev[id];
    if (!d) { d = s.dev[id] = emptyDev(); s.dev = sorted(s.dev); d = s.dev[id]; }
    d.xp += gain; d.m++; if (win) d.w++;
    if (o.mode === '6v6') d.m6++; else if (o.mode === 'career') d.mc++; else d.m2++;
    var ven = typeof o.venue === 'string' ? o.venue : '';
    if (okKey(ven) && !s.ven[ven]) { s.ven[ven] = today(); s.ven = sorted(s.ven); }
    stamp++;
    var r = check();
    stashHitos(r);
    var lv1 = levelOf(totalOf(s)).lvl;
    return { xp: gain, lvl0: lv0, lvl1: lv1, lvl: lv1, lvlUp: lv1 > lv0, prize: r.grants, prizeName: r.grants.length ? lookName(r.grants[0]) : '', hitos: r.hitos };
  }
  /** Sesión del Entrenamiento acabada (para el hito «modos»; la XP de las medallas es derivada de VB.Gym). */
  function noteGym(id) {
    var s = state(), dev = devId(), d = s.dev[dev];
    if (!d) { s.dev[dev] = emptyDev(); s.dev = sorted(s.dev); d = s.dev[dev]; }
    d.gy++; stamp++;
    var r = check(); stashHitos(r);
    return r;
  }

  // ---------------------------------------------------------------- álbum
  function fmtDate(t) { var d = new Date(t); return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear(); }
  /** Pie de un hueco del álbum: «Conseguido el 13 nov 2026 en la Carrera» / «Conseguido» / el «how» de un hueco. */
  function footText(it) {
    if (!it) return '';
    if (!it.have) return it.how || '';
    var s = 'Conseguido' + (it.t > 1e11 ? ' el ' + fmtDate(it.t) : '');
    return s + (SRC_TXT[it.src] || '');
  }
  function gymLabel(id) { var G = VB.Gym, d = G && typeof G.drill === 'function' ? G.drill(id) : null; return d && d.short ? d.short : GYM_NAMES[id]; }
  function lookTab(s) {
    var L = VB.Look, items = [];
    if (!L || !Array.isArray(L.CATALOG)) return null;
    var st = null; try { st = typeof L.load === 'function' ? L.load() : null; } catch (e) { st = null; }
    var own = st && isObj(st.own) ? st.own : {}, uns = [];
    try { uns = typeof L.unseen === 'function' ? L.unseen() : []; } catch (e) { uns = []; }
    L.CATALOG.concat(Array.isArray(L.PALETTE) ? L.PALETTE : []).forEach(function (it) {
      var id = it.id, start = false;
      try { start = typeof L.isStart === 'function' ? L.isStart(id) : !it.unlock; } catch (e) { start = true; }
      if (start) return;
      // icono vacío: L.art(id) es texto para frases («el gorro…») y L.stars, estrellas en texto; la UI pone el dibujo de la ranura
      var have = lookOwned(id), e = own[id] || {}, icon = '';
      var lt = ''; if (typeof L.lockText === 'function') { try { lt = L.lockText(id) || ''; } catch (er) { lt = ''; } }
      items.push({ aid: 'look:' + id, name: lookName(id), icon: icon, have: have, tier: +it.rarity || 0, t: have ? +e.t || 0 : 0,
        src: have ? e.s || 'carrera' : '', how: lt ? 'Cómo se gana: ' + lt : '', isNew: have && uns.indexOf(id) >= 0 });
    });
    return { id: 'vestuario', label: 'Vestuario', items: items };
  }
  function bdTab(s) {
    var B = VB.Badges, list = B && Array.isArray(B.LIST) ? B.LIST : Object.keys(s.bd).map(function (k) { return { id: k, name: k }; }), items = [];
    list.forEach(function (b) {
      var icon = b.icon || (B && typeof B.svg === 'function' ? B.svg(b.id) : '');
      for (var lv = 1; lv <= 3; lv++) {
        var aid = 'bd:' + b.id + ':' + lv, have = (s.bd[b.id] | 0) >= lv;
        items.push({ aid: aid, name: b.name + ' (' + TIER_NAMES[lv].toLowerCase() + ')', icon: icon, have: have, tier: lv, t: 0, src: have ? 'perfil' : '',
          how: (b.cond || b.desc || '') + (b.th ? ' (' + b.th[lv - 1] + ' ' + (b.unit ? b.unit[1] : '') + ')' : ''), isNew: have && !s.seen[aid] });
      }
    });
    return { id: 'insignias', label: 'Insignias', items: items };
  }
  function gymTab(s) {
    var g = gymData(), G = VB.Gym, items = [];
    GYM_IDS.forEach(function (id) {
      var th = G && typeof G.medalsOf === 'function' ? G.medalsOf(id) : null;
      for (var m = 1; m <= 3; m++) {
        var aid = 'gym:' + id + ':' + m, have = g[id].m >= m;
        items.push({ aid: aid, name: gymLabel(id) + ' (' + TIER_NAMES[m].toLowerCase() + ')', icon: IC.gym, have: have, tier: m, t: have && g[id].m === m ? g[id].t : 0,
          src: have ? 'gym' : '', how: 'Entrenamiento: ' + TIER_NAMES[m].toLowerCase() + ' en ' + gymLabel(id) + (th ? ' (' + th[m - 1] + ' puntos)' : ''), isNew: have && !s.seen[aid] });
      }
    });
    return { id: 'entreno', label: 'Entreno', items: items };
  }
  function achTab(s) {
    var info = achInfo(), items = [];
    if (!info) info = Object.keys(s.ach).map(function (k) { return { id: k, name: k, d: '' }; });
    info.forEach(function (a) {
      if (!a || !okKey(a.id)) return;
      var aid = 'ach:' + a.id, have = !!s.ach[a.id];
      items.push({ aid: aid, name: (a.name || a.id) + (a.only === 'hall' ? ' (pista)' : a.only === 'beach' ? ' (playa)' : ''), icon: IC.ach, have: have, tier: 0,
        t: have ? msOf(s.ach[a.id]) : 0, src: have ? 'carrera' : '', how: a.d || a.dh || '', isNew: have && !s.seen[aid] });
    });
    return { id: 'carrera', label: 'Carrera', items: items };
  }
  function venTab(s) {
    var VV = VB.VENUES && typeof VB.VENUES === 'object' ? VB.VENUES : {}, items = [];
    Object.keys(VV).forEach(function (id) {
      var aid = 'ven:' + id, have = !!s.ven[id], nm = VV[id] && VV[id].name || id;
      items.push({ aid: aid, name: nm, icon: IC.ven, have: have, tier: 0, t: have ? msOf(s.ven[id]) : 0, src: '', how: 'Juega un partido en ' + nm, isNew: have && !s.seen[aid] });
    });
    return { id: 'sedes', label: 'Sedes', items: items };
  }
  function hitTab(s) {
    return { id: 'hitos', label: 'Hitos', items: HITOS.map(function (h) {
      var aid = 'hit:' + h.id, have = !!s.hit[h.id];
      return { aid: aid, name: h.name, icon: IC.hit, have: have, tier: 0, t: have ? msOf(s.hit[h.id]) : 0, src: '', how: h.how + ' (+' + h.xp + ' XP)', isNew: have && !s.seen[aid] };
    }) };
  }
  function retosTab() {
    var R = VB.Retos;
    if (!R || typeof R.album !== 'function') return null;
    var t = null; try { t = R.album(); } catch (e) { t = null; }
    return isObj(t) && Array.isArray(t.items) ? t : null;
  }
  /** Álbum entero: {tabs:[{id, label, have, total, items:[{aid, name, icon, have, tier, t, src, how, isNew}]}], have, total}.
   *  Orden: Vestuario, Insignias, Entreno, Carrera, Retos (solo con VB.Retos), Sedes, Hitos. Solo al abrir el perfil (no por frame). */
  function album() {
    var s = state(), tabs = [lookTab(s), bdTab(s), gymTab(s), achTab(s), retosTab(), venTab(s), hitTab(s)].filter(Boolean), H = 0, T = 0;
    tabs.forEach(function (tb) {
      tb.total = tb.items.length; tb.have = tb.items.filter(function (i) { return i.have; }).length;
      H += tb.have; T += tb.total;
    });
    return { tabs: tabs, have: H, total: T };
  }

  // ---------------------------------------------------------------- vitrina y sellos
  function haveAid(s, aid) {
    if (typeof aid !== 'string') return false;
    var p = aid.split(':');
    switch (p[0]) {
      case 'look': return lookOwned(p.slice(1).join(':'));
      case 'bd': return (s.bd[p[1]] | 0) >= (+p[2] || 1);
      case 'gym': return gymData()[p[1]] ? gymData()[p[1]].m >= (+p[2] || 1) : false;
      case 'ach': return !!s.ach[p[1]];
      case 'ven': return !!s.ven[p[1]];
      case 'hit': return !!s.hit[p[1]];
      case 'reto': return !!(VB.Retos && typeof VB.Retos.level === 'function' && VB.Retos.level(p[1]) > 0);
    }
    return false;
  }
  /** Las 3 de la vitrina: las fijadas (que sigas teniendo) o, si no hay, las mejores: insignia de oro > medalla de oro > logro >
   *  objeto raro. */
  function vitrina() {
    var s = state(), pins = s.pin.filter(function (a) { return haveAid(s, a); });
    if (pins.length) return pins;
    var out = [], g = gymData();
    Object.keys(s.bd).forEach(function (k) { if (s.bd[k] >= 3) out.push('bd:' + k + ':3'); });
    GYM_IDS.forEach(function (k) { if (g[k].m >= 3) out.push('gym:' + k + ':3'); });
    Object.keys(s.ach).sort(function (a, b) { return s.ach[a] - s.ach[b]; }).forEach(function (k) { out.push('ach:' + k); });
    var L = VB.Look;
    if (out.length < MAX_PIN && L && Array.isArray(L.CATALOG)) {
      L.CATALOG.filter(function (it) { return (+it.rarity || 0) >= 2 && lookOwned(it.id) && !(L.isStart && L.isStart(it.id)); })
        .sort(function (a, b) { return (b.rarity | 0) - (a.rarity | 0); }).forEach(function (it) { out.push('look:' + it.id); });
    }
    return out.slice(0, MAX_PIN);
  }
  function pin(aid) {
    var s = state();
    if (ro || !okKey(aid) || !haveAid(s, aid) || s.pin.indexOf(aid) >= 0 || s.pin.length >= MAX_PIN) return false;
    s.pin.push(aid); s.pt = now(); stamp++; save(); return true;
  }
  function unpin(aid) {
    var s = state(), i = s.pin.indexOf(aid);
    if (ro || i < 0) return false;
    s.pin.splice(i, 1); s.pt = now(); stamp++; save(); return true;
  }
  function stampAids(s) {   // sellos propios del perfil (los del Vestuario y los Retos tienen sus avisos)
    var out = [], g = gymData();
    Object.keys(s.bd).forEach(function (k) { for (var l = 1; l <= s.bd[k]; l++) out.push('bd:' + k + ':' + l); });
    GYM_IDS.forEach(function (k) { for (var m = 1; m <= g[k].m; m++) out.push('gym:' + k + ':' + m); });
    ['ach', 'ven', 'hit'].forEach(function (f) { Object.keys(s[f]).forEach(function (k) { out.push(f + ':' + k); }); });
    return out;
  }
  function unseenCount() { var s = state(); return stampAids(s).filter(function (a) { return !s.seen[a]; }).length; }
  function markSeen(aids) {
    var s = state(), ch = false;
    (Array.isArray(aids) ? aids : [aids]).forEach(function (a) { if (okKey(a) && !s.seen[a]) { s.seen[a] = 1; ch = true; } });
    if (ch) { s.seen = sorted(s.seen); stamp++; save(); }
    return ch;
  }

  VB.Profile = {
    V: V, KEY: KEY, DEV_KEY: DEV_KEY, HITOS: HITOS, LVL_XP: LVL_XP, MAX_LVL: MAX_LVL, GYM_XP: GYM_XP, BD_XP: BD_XP,
    ACH_XP: ACH_XP, TIT_XP: TIT_XP, VEN_XP: VEN_XP,
    need: need, levelOf: levelOf, level: level, xp: xp, stats: function () { return stats(); },
    noteMatch: noteMatch, addMatch: noteMatch, noteGym: noteGym, check: check,
    album: album, vitrina: vitrina, pin: pin, unpin: unpin, unseenCount: unseenCount, markSeen: markSeen,
    nextPrize: nextPrize, footText: footText,
    load: function () { return JSON.parse(JSON.stringify(state())); },   // (forma interna: dev y car con objetos, fechas en días)
    pack: function (o) { return pack(clean(o)); },
    lost: function () { state(); return lostF; }, readOnly: function () { state(); return ro; },
    mergeRaw: mergeRaw, clean: clean,
    _reload: function () { cur = null; curRaw = undefined; devMem = null; lostF = false; stash = []; lvCache.k = null; lvlOk = false; return state(); },
    _devId: devId
  };
})();
