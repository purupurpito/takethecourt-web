/* =====================================================================
 * MAKE THE CUT — js/netrec.js   (owner: net)
 * Modo online, fase 3 (notes/net.md «Fase 3»): el RÉCORD ONLINE (aparte del de Partido rápido) y la única recompensa del online, la
 * gorra «Online Beta Tester» (decisión 4 de Ferran: sin experiencia, insignias ni retos por el online). SIN DOM y SIN THREE: se
 * prueba en Node con vm (tools/netrectest.js). localStorage siempre dentro de try/catch.
 *
 * Guardado 'make-the-cut.online' (JSON, v1): { v:1, played, wins, losses, quits, nc, streak, best, last:[{n, w, s, t}] (10 como mucho) }
 *   played = partidos que cuentan (ganados + perdidos); quits = cuántas de las derrotas fueron por abandonar (o tardar en volver);
 *   nc = partidos que no cuentan (se cayó quien creó la sala, otra versión, partido no válido por reparaciones o final con huellas
 *   que no cuadraban: result.unverified → «no válido»).
 *   last: n = NOMBRE del rival (lo único que se sabe de él; nunca IP ni correo), w = 1 ganado / 0 perdido / -1 no cuenta,
 *   s = '2-1' (sets) o 'abandono' / 'abandonó' / 'no volvió' / 'no cuenta', t = ms.
 * Abandonar = derrota (D11): quit() o tardar más de 60 s en volver. Cerrar la pestaña en pleno partido también: al empezar se deja
 * una marca 'make-the-cut.online.pend' y, si al cargar la página sigue ahí, cuenta como abandono (begin / end / boot).
 *
 * API (VB.NetRec):
 *   outcome(result, valid) → {w: 1|0|-1, kind}  (result = r.result de VB.Net.Session; valid = r.valid)
 *   begin(rivalName)       marca de partido en curso (cerrar la pestaña = abandono); beat() la renueva cada 10 s
 *   end(rivalName, result, valid, sets) → {rec, entry, cap: true si la gorra es nueva}  una vez por partido; quita la marca
 *   resume()               vuelta tras recargar: el siguiente begin() hereda la marca reciente de la página anterior
 *   boot()                 al cargar: una marca que quedó (sin latido en 90 s) = abandono (devuelve la entrada o null). Las marcas
 *                          son una lista (una por página); begin/beat/end también barren las viejas de otras páginas (90 s sin latido)
 *   get() → récord saneado · line(rec) → «3 ganados de 5» · CAP = 'gorraMTC'
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.online', PEND = 'make-the-cut.online.pend', CAP = 'gorraMTC', MAX_LAST = 10, STALE_MS = 90000;

  function LS() { try { return root.localStorage || null; } catch (e) { return null; } }
  function rd(k) { var l = LS(); try { return l ? l.getItem(k) : null; } catch (e) { return null; } }
  function wr(k, v) { var l = LS(); try { if (!l) return false; if (v == null) l.removeItem(k); else l.setItem(k, v); return true; } catch (e) { return false; } }
  function n0(v) { v = Math.floor(+v); return isFinite(v) && v > 0 ? Math.min(v, 1e7) : 0; }
  function ms(v) { v = Math.floor(+v); return isFinite(v) && v > 0 ? Math.min(v, 9e15) : 0; }
  function cleanName(s) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>"'`]/g, '').replace(/\s+/g, ' ').trim();
    if (s.indexOf('@') >= 0) s = '';   // (nunca algo con pinta de correo)
    return s.slice(0, 16) || 'Rival';
  }
  function empty() { return { v: 1, played: 0, wins: 0, losses: 0, quits: 0, nc: 0, streak: 0, best: 0, last: [] }; }
  function sane(o) {
    var r = empty();
    if (!o || typeof o !== 'object') return r;
    r.wins = n0(o.wins); r.losses = n0(o.losses); r.played = r.wins + r.losses; r.quits = Math.min(n0(o.quits), r.losses);
    r.nc = n0(o.nc); r.streak = Math.min(n0(o.streak), r.wins); r.best = Math.max(Math.min(n0(o.best), r.wins), r.streak);
    if (Array.isArray(o.last)) o.last.slice(0, MAX_LAST).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var w = e.w === 1 ? 1 : e.w === 0 ? 0 : -1;
      r.last.push({ n: cleanName(e.n), w: w, s: String(e.s || '').replace(/[^\w\- áéíóúñ]/gi, '').slice(0, 16), t: ms(e.t) });
    });
    return r;
  }
  function get() { var o = null; try { o = JSON.parse(rd(KEY) || 'null'); } catch (e) { o = null; } return sane(o); }
  function put(r) { return wr(KEY, JSON.stringify(sane(r))); }

  /** Cómo cuenta un resultado de la sesión: w 1 (ganado), 0 (perdido) o -1 (no cuenta), y kind para el texto. */
  function outcome(res, valid) {
    var why = res && res.why;
    if (!why || why === 'version' || why === 'hostGone' || why === 'bye') return { w: -1, kind: why || 'none' };
    if (why === 'noShow' || why === 'cancel') return { w: -1, kind: 'bye' };   // (antes de empezar: no hubo partido; main.js ni siquiera lo apunta)
    if (valid === false) return { w: -1, kind: 'invalid' };
    if (why === 'over' && res.unverified) return { w: -1, kind: 'unverified' };   // (las huellas no cuadraban al final: «no válido»)
    if (why === 'quit' || why === 'late') return { w: 0, kind: 'quit' };
    if (why === 'rivalQuit') return { w: 1, kind: 'rivalQuit' };
    if (why === 'rivalGone') return { w: 1, kind: 'rivalGone' };
    return { w: res.win ? 1 : 0, kind: 'over' };
  }
  var S_TXT = { quit: 'abandono', rivalQuit: 'abandonó', rivalGone: 'no volvió', invalid: 'no cuenta', unverified: 'no válido', hostGone: 'no cuenta', version: 'no cuenta', bye: 'no cuenta', none: 'no cuenta' };
  /** ¿Terminaste el partido? (para la gorra: sí si se jugó hasta el final o el rival se fue; no si abandonaste tú). */
  function finished(o) { return o.kind === 'over' || o.kind === 'rivalQuit' || o.kind === 'rivalGone' || o.kind === 'hostGone' || o.kind === 'invalid' || o.kind === 'unverified'; }

  function grantCap() {
    var L = VB.Look; if (!L || !L.grant) return false;
    try { return !!L.grant(CAP, 'online'); } catch (e) { return false; }
  }
  /* Marcas de partido en curso (PEND): una lista [{id, n, t}] (antes un solo objeto: se sigue leyendo). Cada página solo toca la
   * suya (cur); las de otras páginas sin latido en STALE_MS son partidos abandonados (pestaña cerrada) y cuentan al barrer
   * (boot, begin, beat y end): así reabrir el juego antes de 90 s y empezar otro partido ya no borra el abandono anterior. */
  var cur = '';
  function marks() {
    var p = null; try { p = JSON.parse(rd(PEND) || 'null'); } catch (e) { p = null; }
    if (!p) return [];
    if (!Array.isArray(p)) p = [p];
    var out = [];
    for (var i = 0; i < p.length && out.length < 8; i++) if (p[i] && typeof p[i] === 'object') out.push({ id: String(p[i].id || 'old' + i).slice(0, 24), n: cleanName(p[i].n), t: ms(p[i].t) });
    return out;
  }
  function putMarks(L) { wr(PEND, L.length ? JSON.stringify(L) : null); }
  /** Cuenta como abandono las marcas de otras páginas sin latido reciente (devuelve las entradas que añadió). */
  function sweep() {
    var L = marks(), keep = [], old = [], now = Date.now(), i;
    for (i = 0; i < L.length; i++) { if (L[i].id !== cur && now - L[i].t >= STALE_MS) old.push(L[i]); else keep.push(L[i]); }
    if (!old.length) return [];
    putMarks(keep);
    var got = [];
    for (i = 0; i < old.length; i++) got.push(settle(old[i].n, { why: 'quit', win: false }, true, null).entry);
    return got;
  }
  /* Vuelta al partido tras recargar (notes/net.md «Robustez y privacidad»): resume() apunta la marca reciente que dejó la página
   * anterior (latido de hace < 90 s); el begin() del partido recuperado la hereda en vez de crear otra. Si la vuelta no llega a
   * jugarse, la marca se queda sin latido y a los 90 s cuenta como abandono, como siempre (recargar no sale gratis). */
  var resumeId = '';
  function resume() {
    var L = marks(), now = Date.now(), best = null;
    for (var i = 0; i < L.length; i++) if (L[i].id !== cur && now - L[i].t < STALE_MS && (!best || L[i].t > best.t)) best = L[i];
    resumeId = best ? best.id : '';
    return best ? { n: best.n, t: best.t } : null;
  }
  function begin(name) {
    sweep();
    var L = marks();
    if (resumeId) {
      var rid = resumeId; resumeId = '';
      for (var j = 0; j < L.length; j++) if (L[j].id === rid) { cur = rid; L[j].t = Date.now(); putMarks(L); return; }
    }
    cur = 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    L.push({ id: cur, n: cleanName(name), t: Date.now() }); putMarks(L.slice(-8));
  }
  /** Latido de la marca (main.js cada 10 s): otra pestaña del juego abierta a la vez no la toma por un partido abandonado. */
  function beat() {
    sweep();
    var L = marks(), now = Date.now(), hit = false;
    for (var i = 0; i < L.length; i++) if (L[i].id === cur) { L[i].t = now; hit = true; }
    if (hit) putMarks(L);
  }
  function end(name, res, valid, sets) {
    if (cur) putMarks(marks().filter(function (m) { return m.id !== cur; }));   // (solo la marca de esta página)
    cur = '';
    sweep();
    return settle(name, res, valid, sets);
  }
  function settle(name, res, valid, sets) {
    var o = outcome(res, valid), r = get(), s = o.kind === 'over' && sets ? (sets[0] | 0) + '-' + (sets[1] | 0) : S_TXT[o.kind] || '';
    if (o.w === 1) { r.wins++; r.streak++; if (r.streak > r.best) r.best = r.streak; }
    else if (o.w === 0) { r.losses++; r.streak = 0; if (o.kind === 'quit') r.quits++; }
    else r.nc++;
    var entry = { n: cleanName(name), w: o.w, s: s, t: Date.now() };
    r.last.unshift(entry); r.last = r.last.slice(0, MAX_LAST);
    put(r);
    var cap = finished(o) ? grantCap() : false;
    return { rec: get(), entry: entry, cap: cap, outcome: o };
  }
  /** Al cargar: una marca de partido que quedó (se cerró la pestaña en pleno partido) cuenta como abandono. */
  function boot() {
    var got = sweep();
    return got.length ? got[got.length - 1] : null;
  }
  function line(r) {
    r = r || get();
    if (!r.played && !r.nc) return '';
    return r.wins + (r.wins === 1 ? ' ganado' : ' ganados') + ' de ' + r.played + (r.quits ? ' (' + r.quits + (r.quits === 1 ? ' abandono)' : ' abandonos)') : '');
  }

  VB.NetRec = { KEY: KEY, PEND: PEND, CAP: CAP, get: get, outcome: outcome, begin: begin, beat: beat, end: end, boot: boot, resume: resume, line: line, _sane: sane };
})();
