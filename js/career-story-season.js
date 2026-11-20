/* MAKE THE CUT — js/career-story-season.js (owner: carrera)
 * «Carrera con vida» (notes/carrera-vida.md §S4, paquete P4): Figuras, Estadísticas y Camino de temporada. Subsistema 'season' de
 * VB.CareerStory (API en la cabecera de js/career-story.js). Vale para las dos Carreras (playa y pista). Sin DOM al cargar.
 *
 *  - Figura de la jornada: solo liga y solo partidos JUGADOS (ni simulados ni banquillo; en pista, con nota válida, NOTA_MIN_SUB).
 *    Tres figuras inventadas de tu liga (nombres de las plantillas) con nota 6,6 + 1,6·r() + 0,05·(media del club − 60) y
 *    rng(c, 'st-fj', temporada, jornada, liga). Si tu nota supera la mejor, eres Figura de la jornada; con nota ≥ 7,4, Equipo ideal.
 *  - Figura del mes: tramos de liga (playa J1-4, J5-8, J9-14 (un tramo final de menos de 3 jornadas se une al anterior); pista, weeksOf en 2 o 3 tramos). Hacen falta ≥ 3 partidos
 *    jugados. Las 2 figuras rivales salen al abrir el tramo (rng 'st-fm', 6,9 + 0,8·r() escalado con la liga), así el chip de
 *    candidatura (una jornada antes del cierre) es puro. Premio: estrellas, mensaje y publicación (ni fama, ni XP, ni trofeos).
 *  - Estadísticas (Palmarés): por temporada (c.history, c.stats, c.career), gráfica SVG de la nota (c.notes; las de temporadas
 *    pasadas quedan en s.ns), récords de un partido (s.rec) e historial de figuras.
 *  - Camino de temporada: 20 niveles de 3★ que se reinician en 'newSeason' (lo anterior, en s.pathHist). Premios SOLO cosméticos:
 *    títulos de perfil, fondos SPLAT para el ticket y prendas que ya existen en look.js (VB.Look.grant, solo ids del CATALOG que
 *    aún no tengas). Ni dinero, ni puntos, ni fama, ni c.trophies. Las estrellas de otros paquetes llegan por fx({star: n}).
 *
 * Regla de oro: este sistema SOLO escribe en c.story (y en el inventario global de VB.Look, que no es la carrera).
 * Estado: s.fj, s.fjH, s.mt, s.mo, s.mvpN, s.rec, s.pass, s.pathHist, s.title, s.titles, s.bg, s.bgs, s.ns (ver ensure).
 * Para la interfaz (career-story-ui.js): sys.ui.pass(c, HLP), sys.ui.stats(c, HLP), sys.chips(c) (candidatura), sys.ticketBg(c)
 * → {id, name, col}|null (fondo elegido para el ticket), sys.titleOf(c) → título de perfil elegido ('' si ninguno), sys.CSS.
 * Acciones: 'st-season-title-<i>' (i = índice en s.titles, −1 quita), 'st-season-bg-<i>' (−1 quita), 'st-season-view-<temporada>'.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (!VB.CareerStory || !VB.CareerStory.use) return;
  var S = VB.CareerStory;

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function nt(v) { return num(v) ? r1(v).toFixed(1).replace('.', ',') : '—'; }
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function K(c) { return S.K(c); }
  function ordn(n) { var C = VB.Career; return C && C.ordn ? C.ordn(n) : n + (n === 1 || n === 3 ? 'r' : 'º'); }

  var LV_MAX = 20, PER_LV = 3, ST_MAX = LV_MAX * PER_LV, IDEAL = 7.4, FJH_MAX = 40, NS_MAX = 8, HIST_MAX = 10, LOG_MAX = 6;
  var REC_K = ['nota', 'kills', 'aces', 'blocks', 'digs'];
  var REC_NAME = { nota: 'Mejor nota', kills: 'Más remates', aces: 'Más aces', blocks: 'Más bloqueos', digs: 'Más defensas' };

  // ------------------------------------------------------------------ premios del Camino (solo cosméticos)
  // look: candidatos de look.js por orden (se da el primero que exista en el CATALOG, se pueda ganar y aún no tengas; si no queda
  // ninguno, o no hay look.js, se da el fondo de reserva).
  var BGS = { naranja: { name: 'Tinta naranja', col: '#ff8040' }, lima: { name: 'Tinta lima', col: '#b6e33a' }, morada: { name: 'Tinta morada', col: '#8a4fd8' },
    turquesa: { name: 'Tinta turquesa', col: '#2ec4c4' }, dorada: { name: 'Tinta dorada', col: '#f2c14e' } };
  var PRIZES = {
    2: { k: 'title', t: 'Currante del año' },
    4: { k: 'look', ids: ['tiraNasal', 'cintaRizo', 'altosRayas', 'oscuras', 'tRosa'] },
    6: { k: 'bg', id: 'naranja' },
    8: { k: 'title', t: 'Showtime' },
    10: { k: 'look', ids: ['manguitoRayas', 'mallaLarga', 'conchas', 'tAzul', 'mitones', 'pescador'] },
    12: { k: 'bg', id: 'lima' },
    14: { k: 'title', t: 'Sangre fría' },
    16: { k: 'look', ids: ['manguitoCuadros', 'escarpines', 'cresta', 'licra', 'neon'] },
    18: { k: 'bg', id: 'dorada' },
    20: { k: 'title', t: 'Leyenda del Camino' }
  };
  var BG_SPARE = ['morada', 'turquesa'];
  var HOW = [['Reto de la jornada cumplido', 1], ['Duelo ganado a tu rival', 2], ['Partido marcado ganado', 2], ['Nota de 8 o más', 1], ['Figura de la jornada', 1],
    ['Figura del mes', 2], ['Pacto con el entrenador cumplido', 3], ['Rueda de prensa contestada', 1], ['Tu semana (1 de cada 2 cartas)', 1], ['Título o ascenso', 5]];

  // ------------------------------------------------------------------ plantillas (feed; sin respuesta: no gastan el tope)
  var TPL = {
    seFj: { k: 'press',
      t: ['Figura de la jornada', 'Eres la figura de la jornada', 'La jornada {w} lleva tu nombre', 'Figura de la jornada {w}', 'Nadie jugó mejor', 'Tu nombre, en portada'],
      x: ['{med} te elige figura de la jornada {w} con un {nota}. Detrás quedan {f1} ({v1}) y {f2} ({v2}).',
        'Nadie jugó mejor que tú en la jornada {w}: un {nota} de nota. {f1}, de {c1}, se queda a las puertas con {v1}.',
        'La votación de {med} no deja dudas: figura de la jornada {w} con un {nota}. Tu gente ya ha hecho captura de pantalla.',
        'Un {nota} en la jornada {w} y la figura es tuya. {f1} ({c1}) protesta con su {v1}, pero los números mandan.',
        'Figura de la jornada {w}: {nota}. {med} dice que fue «un partido para enseñar en las escuelas».',
        'Te llevas la figura de la jornada {w} con un {nota}. {f1} y {f2} tendrán que esperar a la próxima.'] },
    seIdeal: { k: 'press',
      t: ['Equipo ideal de la jornada', 'Entras en el equipo ideal', 'Te cuelan en el equipo ideal', 'Equipo ideal: tú'],
      x: ['Con tu {nota} entras en el equipo ideal de la jornada {w}. La figura se la lleva {f1} ({c1}) con un {v1}.',
        '{med} te mete en el equipo ideal de la jornada {w}. Por poco: {f1} firmó un {v1} y se queda la figura.',
        'Equipo ideal de la jornada {w} con un {nota}. Te falta un pelo para la figura: {f1} sacó un {v1}.',
        'Un {nota} da para el equipo ideal de la jornada {w}. La figura, para {f1}, de {c1}.'] },
    seMoWin: { k: 'press',
      t: ['Figura del mes', 'Eres la figura del mes', 'El mes es tuyo', 'Figura del mes: tú', 'Mes de los buenos'],
      x: ['{med} te nombra figura del mes con {avg} de media en {n} partidos. {f1} ({c1}) se queda con {v1}.',
        'Media de {avg} en {n} partidos: la figura del mes es tuya. {f1} y {f2} aplauden, con la boca pequeña.',
        'Ya es oficial: figura del mes con un {avg} de media. La peña del barrio ha pedido el trofeo de cartón para la vitrina.',
        'Nadie fue más regular este mes: {avg} de media. {med} lo resume en una palabra: «imparable».',
        'Figura del mes con {avg}. {f1}, de {c1}, se queda a {gap} décimas.'] },
    seMoLose: { k: 'press',
      t: ['Figura del mes: casi', 'Te quedas a las puertas', 'Otra vez será', 'La figura del mes se escapa'],
      x: ['{f1} ({c1}) se lleva la figura del mes con {v1} de media. Tu {avg} te deja entre las candidaturas.',
        'Tu media de {avg} no alcanza: la figura del mes es para {f1}, de {c1}, con {v1}.',
        '{med} elige a {f1} como figura del mes ({v1}). Tú te quedas con {avg} y ganas de revancha.',
        'Por poco: {f1} firma un {v1} de media y se lleva el mes. Tu {avg} queda en el historial.'] },
    seLv: { k: 'fan',
      t: ['Camino de temporada: nivel {lv}', 'Subes al nivel {lv} del Camino', 'Nivel {lv} del Camino', 'Camino: nivel {lv} desbloqueado'],
      x: ['Premio del nivel {lv}: {prize}. {how}', 'Llevas {st} estrellas esta temporada. Te toca: {prize}. {how}',
        'Nuevo premio en el Camino: {prize}. {how}', 'Nivel {lv} con {st} estrellas. Premio: {prize}. {how}'] }
  };

  // ------------------------------------------------------------------ estado
  function recOk(x) { return obj(x) && num(x.v) && num(x.s); }
  function ensureS(s, c) {
    var season = c && num(c.season) ? c.season | 0 : 0;
    if (!obj(s.fj) || !num(s.fj.k) || !Array.isArray(s.fj.top)) s.fj = null;
    if (!Array.isArray(s.fjH)) s.fjH = [];
    s.fjH = s.fjH.filter(function (x) { return obj(x) && num(x.s) && num(x.w) && num(x.v); }).slice(-FJH_MAX);
    if (!obj(s.mt) || !num(s.mt.s) || !num(s.mt.t) || !num(s.mt.to) || !Array.isArray(s.mt.top)) s.mt = null;
    else { s.mt.n = num(s.mt.n) && s.mt.n >= 0 ? s.mt.n | 0 : 0; s.mt.sum = num(s.mt.sum) ? s.mt.sum : 0; }
    if (!Array.isArray(s.mo)) s.mo = [];
    s.mo = s.mo.filter(function (x) { return obj(x) && num(x.s) && num(x.t) && num(x.me) && Array.isArray(x.top); });
    var maxS = s.mo.reduce(function (a, x) { return Math.max(a, x.s); }, season);
    s.mo = s.mo.filter(function (x) { return x.s > maxS - 3; });
    s.mvpN = num(s.mvpN) && s.mvpN >= 0 ? s.mvpN | 0 : 0;
    if (!obj(s.rec)) s.rec = {};
    REC_K.forEach(function (k) { if (!recOk(s.rec[k])) s.rec[k] = null; });
    for (var rk in s.rec) if (REC_K.indexOf(rk) < 0) delete s.rec[rk];
    var p = s.pass;
    if (!obj(p)) p = s.pass = { s: season, st: 0, lv: 0, got: [], lg: [] };
    p.s = num(p.s) ? p.s | 0 : season;
    p.st = num(p.st) ? clamp(p.st | 0, 0, ST_MAX) : 0;
    p.lv = Math.min(LV_MAX, Math.floor(p.st / PER_LV));
    if (!Array.isArray(p.got)) p.got = [];
    p.got = p.got.filter(function (x) { return obj(x) && num(x.lv) && typeof x.k === 'string'; });
    if (!Array.isArray(p.lg)) p.lg = [];
    p.lg = p.lg.filter(function (x) { return obj(x) && num(x.d) && typeof x.t === 'string'; }).slice(-LOG_MAX);
    if (!obj(s.pathHist)) s.pathHist = {};
    for (var hk in s.pathHist) if (!obj(s.pathHist[hk]) || !num(s.pathHist[hk].st)) delete s.pathHist[hk];
    if (!Array.isArray(s.titles)) s.titles = [];
    s.titles = s.titles.filter(function (t, i, a) { return typeof t === 'string' && t && a.indexOf(t) === i; });
    if (typeof s.title !== 'string' || s.titles.indexOf(s.title) < 0) s.title = '';
    if (!Array.isArray(s.bgs)) s.bgs = [];
    s.bgs = s.bgs.filter(function (t, i, a) { return typeof t === 'string' && BGS[t] && a.indexOf(t) === i; });
    if (typeof s.bg !== 'string' || s.bgs.indexOf(s.bg) < 0) s.bg = '';
    if (!obj(s.ns)) s.ns = {};
    for (var nk in s.ns) if (!Array.isArray(s.ns[nk])) delete s.ns[nk];
  }
  function St(c) { return S.ensure(c); }

  // ------------------------------------------------------------------ liga, clubes y nombres
  function myClub(c) { try { return c && c.myClub >= 0 ? K(c).myClub(c) : null; } catch (e) { return null; } }
  function lidOf(c, k) { return isH(c) ? k.lid : k.lvl | 0; }
  function lgClubs(c, k) {
    try { return isH(c) ? K(c).leagueClubs(c, k.lid) : K(c).clubsOf(c, k.lvl); } catch (e) { return []; }
  }
  function ovrOf(c, k) { try { var o = K(c).clubOvr(k); return num(o) ? o : 60; } catch (e) { return 60; } }
  var FIRST = ['Álex', 'Noa', 'Dani', 'Ari', 'Sam', 'Eli', 'Nico', 'Robin', 'Cris', 'Andy', 'Iza', 'Jona'];
  var LAST = ['Ríos', 'Prados', 'Vela', 'Costa', 'Arenas', 'Soler', 'Mena', 'Cano', 'Roca', 'Lago', 'Ibar', 'Fuentes'];
  /** Nombre de alguien de la plantilla del club k (pista: squad del juego; playa: el generador de nombres de career.js). */
  function nameFrom(c, k, r, season) {
    var C = VB.Career;
    if (isH(c)) {
      try { var q = K(c).squad(c, k, season, ''); if (q && q.length) return q[Math.floor(r() * q.length) % q.length].name; } catch (e) { }
    }
    try { if (C && C.hall && C.hall._name) return C.hall._name(r); } catch (e) { }
    return FIRST[Math.floor(r() * FIRST.length) % FIRST.length] + ' ' + LAST[Math.floor(r() * LAST.length) % LAST.length];
  }
  /** n clubes distintos de la liga (sin el tuyo), en orden de r (si no hay bastantes, se repiten). */
  function pickClubs(c, k, r, n) {
    var pool = lgClubs(c, k).filter(function (x) { return x && x.id !== k.id; }), out = [];
    if (!pool.length) pool = [k];
    pool = pool.slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    for (var m = 0; m < n; m++) out.push(pool[m % pool.length]);
    return out;
  }
  function figs(c, k, r, n, season, base, spread, kOvr) {
    var used = {}, out = pickClubs(c, k, r, n).map(function (x) {
      var nm, g = 0; do { nm = nameFrom(c, x, r, season); } while (used[nm] && g++ < 10); used[nm] = 1;
      var v = clamp(r1(base + spread * r() + kOvr * (ovrOf(c, x) - 60)), 4.5, 9.9);
      return { n: nm, club: x.name, v: v };
    });
    return out.sort(function (a, b) { return b.v - a.v; });
  }

  // ------------------------------------------------------------------ tramos de la Figura del mes
  /** {W, ends:[última jornada (0-based) de cada tramo]} de tu liga; null sin club. */
  function tramos(c, k) {
    if (!k) return null;
    var W = 0, ends = [], t;
    if (isH(c)) {
      try { W = K(c).weeksOf(c, k.lid) | 0; } catch (e) { W = 0; }
      if (W < 1) return null;
      var T = W >= 12 ? 3 : 2;
      for (t = 0; t < T; t++) ends.push(Math.max(0, Math.round(W * (t + 1) / T) - 1));
    } else {
      W = K(c).WEEKS | 0 || 14;
      for (t = 0; t * 4 < W; t++) ends.push(Math.min(W - 1, t * 4 + 3));
      // un último tramo de menos de 3 jornadas (J13-14 con 14) nunca llegaría a 3 partidos: se une al anterior
      if (ends.length > 1 && ends[ends.length - 1] - ends[ends.length - 2] < 3) { ends.splice(ends.length - 2, 1); }
    }
    return { W: W, ends: ends };
  }
  function tramoOf(T, w) { for (var i = 0; i < T.ends.length; i++) if (w <= T.ends[i]) return i; return T.ends.length - 1; }

  // ------------------------------------------------------------------ Camino: estrellas y premios
  function lookOk(id) {
    var X = VB.Look; if (!X || !Array.isArray(X.CATALOG)) return false;
    var it = null; for (var i = 0; i < X.CATALOG.length; i++) if (X.CATALOG[i].id === id) { it = X.CATALOG[i]; break; }
    if (!it) return false;
    try { if (X.isStart && X.isStart(id)) return false; if (X.owned && X.owned(id)) return false; } catch (e) { return false; }
    return true;
  }
  function lookName(id) { try { var n = VB.Look.name ? VB.Look.name(id) : ''; if (n) return n; } catch (e) { } for (var i = 0; i < VB.Look.CATALOG.length; i++) if (VB.Look.CATALOG[i].id === id) return VB.Look.CATALOG[i].name; return id; }
  /** Da el premio del nivel lv (si lo hay). Devuelve la entrada de got ({lv, k, id|t, name}) o null. */
  function prize(c, s, lv) {
    var P = PRIZES[lv]; if (!P) return null;
    var g = null;
    if (P.k === 'title') {
      g = { lv: lv, k: 'title', t: P.t, name: 'Título «' + P.t + '»' };
      if (s.titles.indexOf(P.t) < 0) s.titles.push(P.t);
    } else if (P.k === 'look') {
      var id = ''; for (var i = 0; i < P.ids.length && !id; i++) if (lookOk(P.ids[i])) id = P.ids[i];
      if (id) {
        var ok = false; try { ok = VB.Look.grant(id, 'carrera') === true; } catch (e) { ok = false; }
        if (ok) g = { lv: lv, k: 'look', id: id, name: lookName(id) };
      }
      if (!g) {   // sin look.js o ya lo tienes todo: un fondo de reserva
        var b = ''; for (var j = 0; j < BG_SPARE.length && !b; j++) if (s.bgs.indexOf(BG_SPARE[j]) < 0) b = BG_SPARE[j];
        b = b || BG_SPARE[0];
        g = { lv: lv, k: 'bg', id: b, name: 'Fondo ' + BGS[b].name };
        if (s.bgs.indexOf(b) < 0) s.bgs.push(b);
      }
    } else if (P.k === 'bg') {
      g = { lv: lv, k: 'bg', id: P.id, name: 'Fondo ' + BGS[P.id].name };
      if (s.bgs.indexOf(P.id) < 0) s.bgs.push(P.id);
    }
    if (g) s.pass.got.push(g);
    return g;
  }
  function resetPass(c, s) {
    var p = s.pass;
    if (p && (p.st > 0 || p.got.length)) {
      s.pathHist[p.s] = { st: p.st, lv: p.lv, got: p.got.length };
      var ks = Object.keys(s.pathHist).sort(function (a, b) { return +a - +b; });
      while (ks.length > HIST_MAX) delete s.pathHist[ks.shift()];
    }
    s.pass = { s: c.season | 0, st: 0, lv: 0, got: [], lg: [] };
  }
  /** Suma n estrellas al Camino de la temporada (reinicia si es de otra). Sube niveles, da premios y avisa (un mensaje). */
  function addStars(c, n, why) {
    var s = St(c); if (!s || !num(n) || n <= 0) return 0;
    n = n | 0;
    if (s.pass.s !== (c.season | 0)) resetPass(c, s);
    var p = s.pass, lv0 = p.lv, st0 = p.st;
    p.st = Math.min(ST_MAX, p.st + n);
    var d = p.st - st0; if (d <= 0) return 0;
    p.lg.push({ d: d, t: typeof why === 'string' ? why : '', mN: s.mN }); if (p.lg.length > LOG_MAX) p.lg = p.lg.slice(-LOG_MAX);
    p.lv = Math.min(LV_MAX, Math.floor(p.st / PER_LV));
    var last = null;
    for (var lv = lv0 + 1; lv <= p.lv; lv++) { var g = prize(c, s, lv); if (g) last = g; }
    if (last) S.post(c, { b: 'seLv', vars: { lv: last.lv, st: p.st, prize: last.name, how: last.k === 'look' ? 'Póntelo en Jugador › Vestuario.' : last.k === 'title' ? 'Elígelo en Fama › Camino.' : 'Elígelo en Fama › Camino para tu ticket.' } });
    return d;
  }

  // ------------------------------------------------------------------ figuras
  function figJ(c, sum, f, ctx) {
    var s = c.story, k = myClub(c); if (!k) return null;
    var r = S.rng(c, 'st-fj', ctx.season, f.week | 0, lidOf(c, k));
    var top = figs(c, k, r, 3, ctx.season, 6.6, 1.6, 0.05);
    var me = r1(sum.nota), won = me > top[0].v, ideal = me >= IDEAL;
    s.fj = { k: num(ctx.played.wk) ? ctx.played.wk : (ctx.season * 1000 + (f.week | 0)), s: ctx.season, w: f.week | 0, me: me, won: won ? 1 : 0, ideal: ideal ? 1 : 0, top: top };
    if (won || ideal) { s.fjH.push({ s: ctx.season, w: f.week | 0, v: me, f: won ? 1 : 0, i: ideal ? 1 : 0, rival: sum.rivalName || '' }); if (s.fjH.length > FJH_MAX) s.fjH = s.fjH.slice(-FJH_MAX); }
    var cs = S.cast(c), vars = { w: (f.week | 0) + 1, nota: nt(me), med: cs.media.diario, f1: top[0].n, v1: nt(top[0].v), c1: top[0].club, f2: top[1].n, v2: nt(top[1].v) };
    if (won) {
      S.post(c, { b: 'seFj', vars: vars });
      var yo = c.player && c.player.name || 'tú', FJW = [   // (la variante va por jornada, sin tirada: que no salga siempre la misma)
        'Figura de la jornada ' + vars.w + ': ' + yo + ', con un ' + vars.nota + '.',
        'Votación cerrada: la figura de la jornada ' + vars.w + ' es para ' + yo + ' (' + vars.nota + ').',
        'Jornada ' + vars.w + ': nadie jugó mejor que ' + yo + '. Un ' + vars.nota + ' de nota.',
        yo + ' se lleva la figura de la jornada ' + vars.w + ' con un ' + vars.nota + '. ' + vars.f1 + ' se queda con un ' + vars.v1 + '.'];
      S.pushWall(c, { a: cs.media.diario, t: FJW[vars.w % FJW.length], v: { k: 'fj' } });
    } else if (ideal) S.post(c, { b: 'seIdeal', vars: vars });
    return s.fj;
  }
  function newMes(c, season, t, k, T) {
    var r = S.rng(c, 'st-fm', season, t, lidOf(c, k));
    var l = lgClubs(c, k), avg = l.length ? l.reduce(function (a, x) { return a + ovrOf(c, x); }, 0) / l.length : 60;
    var sc = clamp(0.03 * (avg - 60), -0.8, 0.8);
    var top = figs(c, k, r, 2, season, 6.9 + sc, 0.8, 0);
    return { s: season, t: t, lid: lidOf(c, k), from: t ? T.ends[t - 1] + 1 : 0, to: T.ends[t], n: 0, sum: 0, top: top };
  }
  /** Cierra el tramo abierto: con ≥ 3 partidos jugados, se compara con las 2 figuras. Devuelve las estrellas ganadas. */
  function closeMes(c) {
    var s = c.story, m = s.mt; s.mt = null;
    if (!m || m.n < 3) return 0;
    var avg = r1(m.sum / m.n), won = avg > m.top[0].v;
    s.mo.push({ s: m.s, t: m.t, won: won ? 1 : 0, me: avg, n: m.n, top: m.top });
    s.mo = s.mo.filter(function (x) { return x.s > m.s - 3; });
    var cs = S.cast(c), vars = { avg: nt(avg), n: m.n, med: cs.media.digital, f1: m.top[0].n, v1: nt(m.top[0].v), c1: m.top[0].club, f2: m.top[1].n, gap: Math.max(1, Math.round((avg - m.top[0].v) * 10)) };
    if (won) {
      s.mvpN++;
      S.post(c, { b: 'seMoWin', vars: vars });
      S.pushWall(c, { a: cs.media.digital, t: 'Figura del mes: ' + (c.player && c.player.name || 'tú') + ' (' + vars.avg + ' de media en ' + m.n + ' partidos).', v: { k: 'fm' } });
      return 2;
    }
    S.post(c, { b: 'seMoLose', vars: vars });
    return 0;
  }
  function mesStep(c, sum, f, ctx, played) {
    var s = c.story, k = myClub(c), T = tramos(c, k); if (!T) return 0;
    var w = f.week | 0, t = tramoOf(T, w), lid = lidOf(c, k), st = 0;
    if (s.mt && (s.mt.s !== ctx.season || s.mt.t !== t || s.mt.lid !== lid)) st += closeMes(c);
    if (!s.mt) s.mt = newMes(c, ctx.season, t, k, T);
    if (played) { s.mt.n++; s.mt.sum = r1(s.mt.sum + sum.nota); }
    if (w >= s.mt.to) st += closeMes(c);
    return st;
  }

  // ------------------------------------------------------------------ récords
  function recStep(c, sum, ctx) {
    var s = c.story, me = sum.me || {};
    var val = { nota: r1(sum.nota), kills: me.kills | 0, aces: me.aces | 0, blocks: me.blocks | 0, digs: me.digs | 0 };
    REC_K.forEach(function (k) {
      var v = val[k]; if (!num(v) || v <= 0) return;
      var cur = s.rec[k]; if (cur && cur.v >= v) return;
      s.rec[k] = { v: v, s: ctx.season, w: String(sum.label || ''), rival: String(sum.rivalName || ''), sim: sum.sim ? 1 : 0 };
    });
  }

  // ------------------------------------------------------------------ ganchos
  function onMatch(c, sum, f, ctx) {
    var s = St(c); if (!s || !sum) return;
    if (s.starQ > 0) { var q = s.starQ; s.starQ = 0; addStars(c, q, 'Estrellas pendientes'); }
    var league = (f.kind || 'league') === 'league', hasNota = !sum.bench && num(sum.nota), played = hasNota && !sum.sim;
    var st = 0, why = [];
    if (hasNota) recStep(c, sum, ctx);
    var L = sum.life || {};
    if (L.ch && L.ch.ok) { st += 1; why.push('reto'); }
    var duelW = !!(L.duel && L.duel.win);
    if (duelW) { st += s.rel && s.rel.arch ? 4 : 2; why.push('duelo'); }
    var tag = ctx.played && typeof ctx.played.tag === 'string' ? ctx.played.tag : '';
    if (tag && sum.win && !(duelW && /duel/i.test(tag))) { st += 2; why.push('partido marcado'); }
    if (hasNota && sum.nota >= 8) { st += 1; why.push('nota de 8'); }
    if (league && played) { var fj = figJ(c, sum, f, ctx); if (fj && fj.won) { st += 1; why.push('figura de la jornada'); } }
    if (league) { var m = mesStep(c, sum, f, ctx, played); if (m) { st += m; why.push('figura del mes'); } }
    if (st) addStars(c, st, 'Jornada: ' + why.join(', '));
  }
  function onSeason(c, ctx) {
    var s = St(c); if (!s) return;
    var st = s.mt ? closeMes(c) : 0;
    var rv = c.review || {}, title = !!rv.champion || !!rv.cup || (rv.move | 0) > 0;
    if (!title && Array.isArray(rv.cups)) { var k = myClub(c); title = rv.cups.some(function (x) { return x && k && x.champion === k.id; }); }
    if (title) st += 5;
    if (Array.isArray(c.notes) && c.notes.length) {
      s.ns[ctx.season] = c.notes.filter(function (x) { return x && num(x.nota); }).slice(-40).map(function (x) { return Math.round(x.nota * 10); });
      var ks = Object.keys(s.ns).sort(function (a, b) { return +a - +b; });
      while (ks.length > NS_MAX) delete s.ns[ks.shift()];
    }
    if (st) addStars(c, st, title ? 'Fin de temporada: título o ascenso' : 'Fin de temporada: figura del mes');
  }
  function onNewSeason(c) {
    var s = St(c); if (!s) return;
    if (s.pass.s !== (c.season | 0)) resetPass(c, s);
    if (s.mt && s.mt.s !== (c.season | 0)) s.mt = null;
    s.mo = s.mo.filter(function (x) { return x.s > (c.season | 0) - 3; });
  }
  function onJoin(c) { var s = St(c); if (s && s.pass.s !== (c.season | 0) && !s.pass.st) s.pass.s = c.season | 0; }

  // ------------------------------------------------------------------ avisos (puro)
  function chips(c) {
    var s = c && c.story, m = s && s.mt;
    if (!m || c.phase !== 'league' || m.s !== (c.season | 0) || (c.week | 0) !== m.to || m.n < 2 || !m.top.length) return [];
    return [{ p: 6, ic: '★', t: 'Candidatura a Figura del mes: tu media ' + nt(m.sum / m.n) + '; ' + m.top[0].n + ' ' + nt(m.top[0].v), tab: 'honors', s: 'stats' }];
  }

  // ------------------------------------------------------------------ acciones
  var view = null;   // temporada que se mira en Estadísticas (solo interfaz)
  function onAct(c, a) {
    var s = St(c), p = a.split('-'), what = p[2], i = parseInt(p.slice(3).join('-'), 10);
    if (what === 'title') { s.title = i >= 0 && s.titles[i] ? s.titles[i] : ''; return { render: true }; }
    if (what === 'bg') { s.bg = i >= 0 && s.bgs[i] ? s.bgs[i] : ''; return { render: true }; }
    if (what === 'view') { view = num(i) ? i : null; return { render: true }; }
    return null;
  }
  function ticketBg(c) { var s = c && c.story; if (!s || !s.bg || !BGS[s.bg]) return null; return { id: s.bg, name: BGS[s.bg].name, col: BGS[s.bg].col }; }
  function titleOf(c) { var s = c && c.story; return s && typeof s.title === 'string' ? s.title : ''; }

  // ------------------------------------------------------------------ interfaz (SPLAT, notes/splat.md; móvil en §9)
  // Las hojas (.card) y su rótulo-pegatina ya los pone career-ui.js (SPLAT_CSS); aquí, lo propio de Camino y Cifras con el prefijo de
  // la Carrera (Q, 4 ids) y el del móvil (PQ, html.ph). Piezas del sistema: .sp-heros (cifras), .sp-bar (barra de pintura), .sp-btn
  // (selectores), .sp-chip, .sp-kv (récords) y .sp-tbl + VB.Splat.tbl (tabla: en el móvil, columnas reducidas y «Ver tabla completa»).
  var Q = ':root:not(#_):not(#_):not(#_) #career', PQ = Q.replace(':root', ':root.ph'), DQ = Q.replace(':root', ':root:not(.ph)');
  var KO = '1.5px 1.5px 0 var(--sp-ink),-1px -1px 0 var(--sp-ink),1px -1px 0 var(--sp-ink),-1px 1px 0 var(--sp-ink)';
  var CSS = [
    // cifras grandes (nivel, estrellas, lo que falta; totales de la carrera; figuras)
    Q + ' .ss-heros{max-width:560px;margin:8px 3px 12px}',
    Q + ' .ss-heros.ss-tint{background:var(--sp-ink2)}',
    Q + ' .ss-heros .sp-hn{font-size:30px}',
    Q + ' .ss-heros.ss-tint .sp-hn{font-size:26px}',
    Q + ' .ss-heros .sp-hl{font-size:12.5px}',
    // barra de pintura hasta el siguiente nivel (ui.js spBar, en dorado y a lo ancho)
    Q + ' .ss-pass .sp-bar{width:min(560px,calc(100% - 6px));height:12px;margin:4px 3px 8px;--sp-barf:var(--sp-gold)}',
    Q + ' .ss-goal{margin:0 0 6px;font:600 14px/1.35 var(--sp-ui);color:rgba(255,244,220,.92)}',
    Q + ' .ss-goal b{color:var(--sp-gold)}',
    Q + ' .ss-lbl{margin:10px 0 0;font:400 15px/1.1 var(--sp-pop);color:var(--sp-gold);text-shadow:' + KO + ';letter-spacing:.01em}',
    // pista de niveles: pegatinas que no se pulsan (tinta las que faltan, contorno dorado discontinuo si dan premio, oro las logradas
    // y tu nivel del color de tu club); inclinación y esquinas alternas, nunca una rejilla de casillas iguales
    Q + ' .ss-track{display:grid;grid-template-columns:repeat(auto-fill,minmax(max(76px,calc((100% - 90px) / 10)),1fr));gap:12px 10px;margin:12px 0 8px;padding:0 4px 4px;list-style:none}',
    Q + ' .ss-n{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50px;box-sizing:border-box;margin:0;padding:6px 6px 7px;border-radius:10px 14px 9px 13px/13px 9px 14px 10px;' +
      'background:rgba(255,244,220,.05);box-shadow:none;color:rgba(255,244,220,.66);text-align:center;transform:rotate(-1.2deg)}',
    Q + ' .ss-n:nth-child(2n){transform:rotate(1deg);border-radius:14px 9px 13px 10px/9px 14px 10px 13px}',
    Q + ' .ss-n:nth-child(3n){transform:rotate(-.4deg)}',
    // pendientes sin aro (no parecen botones) y con tonos repartidos: manchas tenues de turquesa y de tinta clara entre las crema
    Q + ' .ss-n:nth-child(4n+1){background:rgba(27,181,165,.12)}',
    Q + ' .ss-n:nth-child(4n+3){background:rgba(47,37,96,.7)}',
    Q + ' .ss-n b{display:block;font:400 18px/1 var(--sp-pop);letter-spacing:0}',
    Q + ' .ss-n small{display:block;margin-top:4px;font:700 12px/1.15 var(--sp-ui);color:var(--sp-gold);overflow-wrap:anywhere;hyphens:auto}',
    Q + ' .ss-n.pz{background:rgba(255,203,61,.1);box-shadow:none;color:var(--sp-cream);outline:2px dashed rgba(255,203,61,.75);outline-offset:-2px}',
    Q + ' .ss-n.on{background:var(--sp-gold);color:var(--sp-ink);outline:0;box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink)}',
    Q + ' .ss-n.on small{color:var(--sp-ink)}',
    Q + ' .ss-n.on.pz{background:var(--sp-cream)}',
    Q + ' .ss-n.cur{background:var(--sp-kit);color:var(--sp-kit-ink);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 5px var(--sp-gold),3px 4px 0 5px var(--sp-ink);z-index:1}',
    Q + ' .ss-n.cur small{color:inherit}',
    // selectores (título, fondo del ticket, temporada de la gráfica): pegatinas de pintura de 44 en fila
    Q + ' .ss-pick{display:flex;flex-wrap:wrap;align-items:center;gap:12px 14px;margin:8px 2px 6px}',
    Q + ' .ss-pick .sp-btn{--sp-h:44px;flex:0 1 auto;max-width:100%;min-width:0}',
    Q + ' .ss-pick .sp-btn .sp-t{white-space:normal;line-height:1.1}',
    Q + ' .ss-pick .ss-ok{margin-right:4px}',
    Q + ' .ss-sw{display:inline-block;width:18px;height:18px;border-radius:50%;box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 4px var(--sp-cream)}',
    Q + ' .card>h3.ss-h{display:inline-block;margin:16px 0 2px;padding:0;background:none;box-shadow:none;transform:rotate(-1.5deg);font:400 16px/1.1 var(--sp-pop);color:var(--sp-gold);text-shadow:' + KO + ';letter-spacing:.01em;text-transform:none}',
    // cómo se ganan: pegatina con las estrellas y el motivo
    Q + ' .ss-how{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px 18px;margin:6px 0 4px;padding:0;list-style:none}',
    Q + ' .ss-how li{display:flex;align-items:center;gap:10px;margin:0;font:600 13.5px/1.25 var(--sp-ui);color:rgba(255,244,220,.9)}',
    Q + ' .ss-how .sp-chip{flex:0 0 auto;min-width:40px;text-align:center;font-variant-numeric:tabular-nums}',
    // récords y caminos anteriores (.sp-kv)
    Q + ' .ss-kv{margin:6px 2px 2px;row-gap:8px}',
    Q + ' .ss-kv dd b{font:400 18px/1 var(--sp-pop);color:var(--sp-gold);margin-right:6px;font-variant-numeric:tabular-nums}',
    Q + ' .ss-kv dd .muted{font-size:13px}',
    // tabla por temporada (.sp-tbl)
    Q + ' .ss-tbl{overflow-x:auto}',
    Q + ' .ss-tbl table{width:100%}',
    Q + ' .ss-tbl th{font-size:12px;letter-spacing:.06em}',
    Q + ' .ss-tbl :is(th,td){text-align:right}',
    Q + ' .ss-tbl :is(th,td):first-child{text-align:left}',
    Q + ' .ss-tbl td.ss-c b{font:400 15px/1 var(--sp-pop);color:var(--sp-gold);margin-right:6px}',
    Q + ' .ss-tbl td.ss-c .ss-lg{display:block;margin-top:2px;font-size:12px}',
    Q + ' .ss-tbl td.ss-nt{font:400 16px var(--sp-pop);color:var(--sp-gold)}',
    DQ + ' .ss-tbl tr.sp-me td{background:rgba(255,203,61,.14)}',
    Q + ' .ss-tbl abbr{text-decoration:none}',
    Q + ' .ss-key{margin:6px 0 0;font-size:12.5px}',
    // gráfica de la nota
    Q + ' .ss-svg{display:block;width:100%;max-width:560px;height:auto;margin:6px 0 2px}',
    Q + ' .ss-pick+.ss-svg{margin-top:18px}',
    Q + ' .ss-leg{display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;margin:4px 0 0;font:600 12.5px/1.3 var(--sp-ui);color:rgba(255,244,220,.78)}',
    Q + ' .ss-leg span{display:inline-flex;align-items:center;gap:6px}',
    Q + ' .ss-dot{display:inline-block;width:11px;height:11px;border-radius:50%;box-sizing:border-box}',
    Q + ' .ss-dot.w{background:#8fe36e}' + Q + ' .ss-dot.l{background:#ff8a98}' + Q + ' .ss-dot.s{border:2px solid #ffcb3d}',
    Q + ' .ss-dash{display:inline-block;width:18px;border-top:2px dashed #1bb5a5}',
    Q + ' .ss-rec p,' + Q + ' .ss-fig p{margin:4px 0}',
    // — móvil (.ph) — (letra con los tokens --ph-*, nada < 12 px; toques de 44; sin desplazamiento lateral)
    PQ + ' .ss-heros{max-width:none}',
    PQ + ' .ss-heros .sp-hn{font-size:var(--ph-hero)}',
    PQ + ' .ss-heros.ss-tint .sp-hn{font-size:calc(var(--ph-hero) * .8)}',
    PQ + ' .ss-heros.ss-tint .sp-hl{font-size:var(--ph-cap)}',
    PQ + ' .ss-heros .sp-hl{font-size:var(--ph-label)}',
    PQ + ' .ss-pass .sp-bar{width:calc(100% - 6px);height:12px}',
    PQ + ' .ss-goal{font-size:var(--ph-body)}',
    PQ + ' .ss-lbl{font-size:var(--ph-row)}',
    PQ + ' .ss-track{grid-template-columns:repeat(auto-fill,minmax(max(84px,calc((100% - 108px) / 10)),1fr));gap:14px 12px}',
    PQ + ' .ss-n{min-height:56px}',
    PQ + ' .ss-n b{font-size:var(--ph-num)}',
    PQ + ' .ss-n small{font-size:var(--ph-cap)}',
    PQ + ' .ss-pick{gap:12px}',
    PQ + ' .ss-pick .sp-btn{--sp-h:44px}',
    PQ + ' .card>h3.ss-h{font-size:var(--ph-row)}',
    PQ + ' .ss-how{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px 18px}',
    PQ + ' .ss-how li{font-size:var(--ph-body)}',
    PQ + ' .ss-kv dt{font-size:var(--ph-label)}',
    PQ + ' .ss-kv dd{font-size:var(--ph-body)}',
    PQ + ' .ss-kv dd b{font-size:var(--ph-num)}',
    PQ + ' .ss-kv dd .muted{font-size:var(--ph-label)}',
    // tabla: solo las columnas de data-ph-cols (VB.Splat.tbl), el nombre parte en líneas y nada se desplaza de lado
    PQ + ' .ss-tbl{overflow:visible}',
    PQ + ' .ss-tbl table{border-spacing:0 5px;table-layout:auto}',
    PQ + ' .ss-tbl th{position:static;height:auto;padding:2px 8px;background:none;font:700 var(--ph-cap)/1.1 var(--sp-ui);letter-spacing:.02em;color:var(--sp-gold)}',
    PQ + ' .ss-tbl td{height:auto;padding:8px;font:700 var(--ph-row)/1.2 var(--sp-ui);white-space:nowrap;font-variant-numeric:tabular-nums}',
    PQ + ' .ss-tbl td.ss-c{width:100%;white-space:normal;overflow-wrap:anywhere}',
    PQ + ' .ss-tbl td.ss-c b{font-size:var(--ph-row)}',
    PQ + ' .ss-tbl td.ss-c .ss-lg{font-size:var(--ph-cap)}',
    PQ + ' .ss-tbl td.ss-nt{font-size:var(--ph-num)}',
    PQ + ' .ss-tbl tr.sp-me td :is(b,.ss-lg),' + PQ + ' .ss-tbl tr.sp-me td.ss-nt{color:inherit}',
    PQ + ' .ss-tbl>.sp-tbl-all{margin:12px 0 16px}',
    PQ + ' .ss-key{font-size:var(--ph-cap)}',
    PQ + ' .ss-svg{max-width:none}',
    PQ + ' .ss-leg{font-size:var(--ph-cap);gap:6px 16px}',
    PQ + ' .ss-dot{width:13px;height:13px}'
  ].join('\n');
  function css() {
    if (typeof document === 'undefined' || !document.createElement || !document.head) return;
    try { if (document.getElementById && document.getElementById('careerStorySeasonCss')) return; var el = document.createElement('style'); el.id = 'careerStorySeasonCss'; el.textContent = CSS; document.head.appendChild(el); } catch (e) { }
  }
  function H0(HLP) {
    var esc = HLP && HLP.esc ? HLP.esc : function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };
    var sp = HLP && HLP.sp ? HLP.sp : function (a) { return a.filter(function (x) { return x !== '' && x != null; }).join(', '); };
    var ph = !!(HLP && typeof HLP.ph === 'function' && HLP.ph());
    var q = HLP && typeof HLP.q === 'function' ? HLP.q : null;
    return { esc: esc, sp: sp, ph: ph, q: q };
  }
  /** Barra de pintura (la de ui.js spBar). */
  function bar(p) { return '<i class="sp-bar" aria-hidden="true"><i style="--w:' + Math.round(100 * clamp(p, 0, 1)) + '%"></i></i>'; }
  /** Cifras en una pegatina (.sp-heros): items = [[cifra, rótulo], …]. */
  function heros(items, cls, label) {
    return '<div class="sp-heros ss-heros' + (cls ? ' ' + cls : '') + '"' + (label ? ' role="group" aria-label="' + label + '"' : '') + '>' +
      items.map(function (x) { return '<span><b class="sp-hn">' + x[0] + '</b><small class="sp-hl">' + x[1] + '</small></span>'; }).join('') + '</div>';
  }
  /** Fila de selectores en pegatinas de pintura: opts = [{act, label (HTML), on, ic (HTML)}]. La elegida, dorada y con ✓. */
  var PICK_C = ['sp-cream', 'sp-teal', 'sp-alt'];
  function pick(opts, label) {
    var k = 0;
    return '<div class="ss-pick" data-nav data-sp-row role="group" aria-label="' + label + '">' + opts.map(function (o, i) {
      var col = o.on ? 'sp-gold' : PICK_C[k++ % PICK_C.length];
      return '<button type="button" class="sp-btn sp-sm ' + col + (o.on ? ' on' : '') + '" data-shape="' + (i + 2) + '" data-act="' + o.act + '" aria-pressed="' + (o.on ? 'true' : 'false') + '">' +
        (o.ic ? '<span class="sp-ic" aria-hidden="true">' + o.ic + '</span>' : '') + '<span class="sp-t">' + (o.on ? '<span class="ss-ok" aria-hidden="true">✓</span>' : '') + o.label + '</span></button>';
    }).join('') + '</div>';
  }
  function prizeShort(lv) {
    var P = PRIZES[lv]; if (!P) return '';
    return P.k === 'title' ? 'Título' : P.k === 'bg' ? 'Fondo' : 'Prenda';
  }
  var PASS_HELP = 'Premios solo de estética: títulos, fondos para tu ticket y prendas del Vestuario. Se reinicia cada temporada.';

  function uiPass(c, HLP) {
    css();
    var s = St(c), h = H0(HLP), e = h.esc, p = s.pass, cur = p.s === (c.season | 0) ? p : { st: 0, lv: 0, got: [], lg: [] };
    var nextAt = Math.min(ST_MAX, (cur.lv + 1) * PER_LV), left = nextAt - cur.st, out = '';
    out += '<div class="card ss-pass"><h3>Camino de temporada ' + (c.season | 0) + '</h3>' +
      heros([[cur.lv, 'nivel de ' + LV_MAX], [cur.st, 'estrellas de ' + ST_MAX], cur.lv < LV_MAX ? [left, left === 1 ? 'falta para el ' + (cur.lv + 1) : 'faltan para el ' + (cur.lv + 1)] : ['★', 'completo']],
        'sp-paper', 'Nivel ' + cur.lv + ' de ' + LV_MAX + ', ' + cur.st + ' de ' + ST_MAX + ' estrellas') +
      (cur.lv < LV_MAX ? bar((cur.st - cur.lv * PER_LV) / PER_LV) + '<p class="ss-goal">Siguiente nivel: <b>' + (left === 1 ? 'falta 1 estrella' : 'faltan ' + left + ' estrellas') + '</b>' + (PRIZES[cur.lv + 1] ? ' (premio: ' + prizeShort(cur.lv + 1).toLowerCase() + ')' : '') + '.</p>'
        : bar(1) + '<p class="ss-goal">Camino completo. Vuelve a empezar la temporada que viene.</p>') +
      (h.ph ? '' : '<p class="muted">' + PASS_HELP + '</p>');
    out += '<ol class="ss-track" aria-label="Niveles del Camino">';
    for (var lv = 1; lv <= LV_MAX; lv++) {
      var pz = PRIZES[lv], got = cur.got.filter(function (g) { return g.lv === lv; })[0];
      out += '<li class="ss-n' + (lv <= cur.lv ? ' on' : '') + (pz ? ' pz' : '') + (lv === cur.lv ? ' cur' : '') + '"><b>' + lv + '</b>' + (pz ? '<small>' + e(got ? got.name : prizeShort(lv)) + '</small>' : '') + '</li>';
    }
    out += '</ol>';
    if (cur.lg.length) out += '<p class="muted" style="margin:6px 0 0">Últimas estrellas: ' + cur.lg.slice(-3).reverse().map(function (x) { return '+' + x.d + ' ' + e(x.t.replace(/^Jornada: /, '')); }).join('; ') + '.</p>';
    out += '</div>';
    // títulos y fondos
    out += '<div class="card ss-prz"><h3>Tu título</h3>';
    if (!s.titles.length) out += '<p class="muted">Aún no tienes títulos de perfil. El primero llega en el nivel 2 del Camino.</p>';
    else out += pick([{ act: 'st-season-title--1', label: 'Sin título', on: !s.title }].concat(s.titles.map(function (t, i) { return { act: 'st-season-title-' + i, label: e(t), on: s.title === t }; })), 'Tu título');
    out += '<h3 class="ss-h">Fondo del ticket</h3>';
    if (!s.bgs.length) out += '<p class="muted">Los fondos de tinta para tu ticket salen en los niveles 6, 12 y 18.</p>';
    else out += pick([{ act: 'st-season-bg--1', label: 'El de siempre', on: !s.bg }].concat(s.bgs.map(function (b, i) {
      return { act: 'st-season-bg-' + i, label: e(BGS[b].name), on: s.bg === b, ic: '<span class="ss-sw" style="background:' + BGS[b].col + '"></span>' };
    })), 'Fondo del ticket');
    out += '</div>';
    // cómo se ganan
    out += '<div class="card"><h3>Cómo se ganan estrellas</h3>' + (h.ph && h.q ? h.q('Premios del Camino', PASS_HELP) : '') + '<ul class="ss-how">' + HOW.map(function (x) { return '<li><b class="sp-chip">+' + x[1] + '</b><span>' + e(x[0]) + '</span></li>'; }).join('') + '</ul></div>';
    var hk = Object.keys(s.pathHist).sort(function (a, b) { return +b - +a; });
    if (hk.length) out += '<div class="card"><h3>Caminos anteriores</h3><dl class="sp-kv ss-kv">' + hk.slice(0, 5).map(function (k) { var x = s.pathHist[k]; return '<dt>Temporada ' + e(k) + '</dt><dd><b>' + (x.lv | 0) + '</b><span class="muted">nivel, ' + (x.st | 0) + ' estrellas</span></dd>'; }).join('') + '</dl></div>';
    return out;
  }

  /** Gráfica SVG de notas (lista de {nota, win, sim}). Letra de 12 en unidades del dibujo (≥ 13 px a 360 px de ancho). */
  function chart(list, e, label) {
    if (!list.length) return '<p class="muted">Sin notas todavía.</p>';
    var W = 320, Hh = 130, pl = 24, pr = 8, pt = 9, pb = 9, lo = 3, hi = 10;
    var xs = function (i) { return list.length < 2 ? pl + (W - pl - pr) / 2 : pl + i * (W - pl - pr) / (list.length - 1); };
    var ys = function (v) { return pt + (hi - clamp(v, lo, hi)) * (Hh - pt - pb) / (hi - lo); };
    var g = '<svg class="ss-svg" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + e(label) + '"><title>' + e(label) + '</title>';
    [4, 6, 8, 10].forEach(function (v) { g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + ys(v).toFixed(1) + '" y2="' + ys(v).toFixed(1) + '" stroke="rgba(255,244,220,.14)" stroke-width="1"/><text x="2" y="' + (ys(v) + 4).toFixed(1) + '" fill="rgba(255,244,220,.7)" font-size="12" font-weight="700" font-family="Rubik, sans-serif">' + v + '</text>'; });
    g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + ys(IDEAL).toFixed(1) + '" y2="' + ys(IDEAL).toFixed(1) + '" stroke="#1bb5a5" stroke-dasharray="5 4" stroke-width="2"/>';
    g += '<polyline fill="none" stroke="#15102a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" points="' + list.map(function (x, i) { return xs(i).toFixed(1) + ',' + ys(x.nota).toFixed(1); }).join(' ') + '"/>';
    g += '<polyline fill="none" stroke="#ffcb3d" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + list.map(function (x, i) { return xs(i).toFixed(1) + ',' + ys(x.nota).toFixed(1); }).join(' ') + '"/>';
    list.forEach(function (x, i) {
      var col = x.win == null ? '#ffcb3d' : x.win ? '#8fe36e' : '#ff8a98';
      g += '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(x.nota).toFixed(1) + '" r="4.5" fill="' + (x.sim ? '#15102a' : col) + '" stroke="' + (x.sim ? col : '#15102a') + '" stroke-width="2"/>';
    });
    return g + '</svg><p class="ss-leg"><span><i class="ss-dot w"></i>Victoria</span><span><i class="ss-dot l"></i>Derrota</span><span><i class="ss-dot s"></i>Simulado</span><span><i class="ss-dash"></i>Equipo ideal (' + nt(IDEAL) + ')</span></p>';
  }
  function lgName(c, x) {
    if (x.lgShort) return x.lgShort;
    try { var L = K(c).league(x.lvl); return L && L.short ? L.short : ''; } catch (e) { return ''; }
  }
  function nP(n, a, b) { n = n | 0; return n + ' ' + (n === 1 ? a : b); }
  /** Tras pintar (la Carrera pone el HTML en el mismo turno): columnas del móvil en la tabla (VB.Splat.tbl). La Carrera se repinta
   *  entera al entrar o salir del móvil (vb:ph), así que no hace falta el gancho de tier de tbl (sería uno más por cada pintado).
   *  OJO: _spT es un nombre interno de splat.js (tbl(), «if (!w._spT) { w._spT = 1; phHooks.push(...) }», ~línea 510). Si splat.js lo
   *  cambia, cada pintado dejaría un gancho más sin aviso; lo limpio sería una opción de tbl (p. ej. tbl(w, {noHook:true})). */
  function tblLater() {
    if (typeof document === 'undefined' || typeof Promise === 'undefined') return;
    Promise.resolve().then(function () {
      var T = VB.Splat && VB.Splat.tbl, L = document.querySelectorAll ? document.querySelectorAll('#career .ss-tbl') : [];
      if (!T) return;
      for (var i = 0; i < L.length; i++) { try { L[i]._spT = 1; T(L[i]); } catch (e) { } }
    });
  }
  function uiStats(c, HLP) {
    css();
    var s = St(c), h = H0(HLP), e = h.esc, out = '', hist = Array.isArray(c.history) ? c.history : [];
    // por temporada
    var rows = hist.map(function (x) { return { s: x.season, club: x.clubName, lg: lgName(c, x), pos: x.pos, pl: x.played | 0, w: x.won | 0, nota: x.nota, pts: x.ppts | 0 }; });
    var inHist = hist.some(function (x) { return x.season === c.season; });
    if (!inHist && c.stats && (c.stats.played | 0) > 0) { var k = myClub(c), an = null; if (Array.isArray(c.notes) && c.notes.length) { var sm = 0, nn = 0; c.notes.forEach(function (x) { if (num(x.nota)) { sm += x.nota; nn++; } }); an = nn ? sm / nn : null; } rows.push({ s: c.season | 0, club: k ? k.name : '', lg: '', pos: 0, pl: c.stats.played | 0, w: c.stats.won | 0, nota: an, pts: c.stats.pts | 0, now: 1 }); }
    out += '<div class="card"><h3>Por temporada</h3>';
    if (!rows.length) out += '<p class="muted">Juega tu primera jornada y aquí saldrán tus números.</p>';
    else {
      // (móvil: Temporada, Puesto, PG y Nota; lo demás en «Ver tabla completa»)
      out += '<div class="sp-tbl ss-tbl" data-ph-cols="0,1,3,5" data-ph-title="Por temporada"><table><thead><tr><th>Temporada</th><th>Puesto</th><th><abbr title="Partidos jugados">PJ</abbr></th><th><abbr title="Partidos ganados">PG</abbr></th><th>Puntos</th><th>Nota</th></tr></thead><tbody>' +
        rows.slice().reverse().map(function (x) {
          return '<tr' + (x.now ? ' class="sp-me"' : '') + '><td class="ss-c"><b>T' + x.s + '</b>' + e(x.club || '') + (x.lg ? '<small class="muted ss-lg">' + e(x.lg) + '</small>' : '') + '</td><td>' + (x.now ? 'en juego' : x.pos ? ordn(x.pos) : '—') + '</td><td class="num">' + x.pl + '</td><td class="num">' + x.w + '</td><td class="num">' + x.pts + '</td><td class="num ss-nt">' + nt(x.nota) + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="muted ss-key">' + (h.ph ? 'PG: partidos ganados.' : 'PJ: partidos jugados. PG: partidos ganados.') + '</p>';
      tblLater();
    }
    var T = c.career || {};
    if ((T.played | 0) > 0) {
      out += '<p class="ss-lbl">En toda tu carrera</p>' + heros([[T.played | 0, (T.played | 0) === 1 ? 'partido' : 'partidos'], [T.won | 0, (T.won | 0) === 1 ? 'victoria' : 'victorias'], [T.pts | 0, (T.pts | 0) === 1 ? 'punto' : 'puntos'], [T.digs | 0, (T.digs | 0) === 1 ? 'defensa' : 'defensas']], 'ss-tint',
        'En toda tu carrera: ' + nP(T.played, 'partido', 'partidos') + ', ' + nP(T.won, 'victoria', 'victorias') + ', ' + nP(T.pts, 'punto', 'puntos') + ' y ' + nP(T.digs, 'defensa', 'defensas')) +
        '<p class="muted" style="margin:0">De tus puntos: ' + nP(T.kills, 'remate', 'remates') + ', ' + nP(T.aces, 'ace', 'aces') + ' y ' + nP(T.blocks, 'bloqueo', 'bloqueos') + '.</p>';
    }
    out += '</div>';
    // gráfica
    var seasons = Object.keys(s.ns).map(Number).filter(function (x) { return x !== (c.season | 0); }).sort(function (a, b) { return b - a; });
    var sel = num(view) && (view === (c.season | 0) || s.ns[view]) ? view : (c.season | 0);
    var list = sel === (c.season | 0) && Array.isArray(c.notes) && c.notes.length ? c.notes.filter(function (x) { return x && num(x.nota); }).map(function (x) { return { nota: x.nota, win: x.win, sim: x.sim }; })
      : (s.ns[sel] || []).map(function (v) { return { nota: v / 10, win: null, sim: 0 }; });
    out += '<div class="card"><h3>Tu nota, temporada ' + sel + '</h3>';
    if (seasons.length) out += pick([{ act: 'st-season-view-' + (c.season | 0), label: 'T' + (c.season | 0), on: sel === (c.season | 0) }].concat(seasons.slice(0, 5).map(function (x) { return { act: 'st-season-view-' + x, label: 'T' + x, on: sel === x }; })), 'Temporada de la gráfica');
    out += chart(list, e, 'Nota partido a partido, temporada ' + sel) + '</div>';
    // récords
    out += '<div class="card ss-rec"><h3>Récords de un partido</h3>';
    var recs = '';
    REC_K.forEach(function (k) {
      var r = s.rec[k]; if (!r) return;
      recs += '<dt>' + e(REC_NAME[k]) + '</dt><dd><b>' + (k === 'nota' ? nt(r.v) : r.v) + '</b><span class="muted">' + e((r.rival ? 'contra ' + r.rival + ', ' : '') + 'T' + r.s + (r.w ? ', ' + r.w : '') + (r.sim ? ' (simulado)' : '')) + '</span></dd>';
    });
    out += recs ? '<dl class="sp-kv ss-kv">' + recs + '</dl>' : '<p class="muted">Tus mejores partidos quedarán aquí.</p>';
    out += '</div>';
    // figuras
    var fjN = s.fjH.filter(function (x) { return x.f; }).length, idN = s.fjH.filter(function (x) { return x.i; }).length;
    out += '<div class="card ss-fig"><h3>Figuras</h3>' + heros([[fjN, 'Figura de la jornada'], [idN, 'Equipo ideal'], [s.mvpN, 'Figura del mes']], 'ss-tint',
      'Figura de la jornada: ' + fjN + (fjN === 1 ? ' vez' : ' veces') + '. Equipo ideal: ' + idN + '. Figura del mes: ' + s.mvpN);
    if (s.fj) {
      var fj = s.fj;
      out += '<p>Jornada ' + (fj.w + 1) + ' (T' + fj.s + '): ' + (fj.won ? '<b>figura de la jornada</b> con un ' + nt(fj.me) : fj.ideal ? 'Equipo ideal con un ' + nt(fj.me) + '; figura, ' + e(fj.top[0].n) + ' (' + nt(fj.top[0].v) + ')' : 'tu ' + nt(fj.me) + '; figura, ' + e(fj.top[0].n) + ' (' + e(fj.top[0].club) + ', ' + nt(fj.top[0].v) + ')') + '</p>';
    }
    if (s.mt && s.mt.s === (c.season | 0)) out += '<p class="muted">Figura del mes (jornadas ' + (s.mt.from + 1) + '-' + (s.mt.to + 1) + '): ' + (s.mt.n ? 'tu media ' + nt(s.mt.sum / s.mt.n) + ' en ' + s.mt.n + (s.mt.n === 1 ? ' partido' : ' partidos') : 'aún sin partidos jugados') + (s.mt.n < 3 ? ' (hacen falta 3 jugados)' : '') + '. Candidaturas: ' + s.mt.top.map(function (x) { return e(x.n) + ' ' + nt(x.v); }).join(', ') + '.</p>';
    if (s.mo.length) out += s.mo.slice().reverse().map(function (x) { return '<p class="muted">T' + x.s + ', tramo ' + (x.t + 1) + ': ' + (x.won ? '<b style="color:var(--sp-gold)">Figura del mes</b> con ' + nt(x.me) : 'media ' + nt(x.me) + '; se la llevó ' + e(x.top[0].n) + ' (' + nt(x.top[0].v) + ')') + '</p>'; }).join('');
    var fl = s.fjH.slice(-6).reverse();
    if (fl.length) out += fl.map(function (x) { return '<p class="muted">T' + x.s + ', jornada ' + (x.w + 1) + ': ' + (x.f ? 'figura' : 'Equipo ideal') + ' con ' + nt(x.v) + (x.rival ? ' contra ' + e(x.rival) : '') + '</p>'; }).join('');
    out += '</div>';
    return out;
  }

  var SYS = {
    id: 'season', tpl: TPL, ensure: ensureS,
    onMatch: onMatch, onSeason: onSeason, onNewSeason: onNewSeason, onJoin: onJoin, onAct: onAct, chips: chips,
    fx: { star: function (c, v, why) { var d = addStars(c, v, why || 'Elección'); return d ? '+' + d + (d === 1 ? ' estrella del Camino' : ' estrellas del Camino') : null; } },
    ui: { pass: uiPass, stats: uiStats },
    ticketBg: ticketBg, titleOf: titleOf, CSS: CSS,
    // (para pruebas y para la interfaz)
    addStars: addStars, tramos: function (c) { return tramos(c, myClub(c)); }, PRIZES: PRIZES, BGS: BGS, LV_MAX: LV_MAX, PER_LV: PER_LV, IDEAL: IDEAL
  };
  S.use(SYS);
})();
