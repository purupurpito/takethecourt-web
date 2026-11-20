/* MAKE THE CUT — js/matchstats.js (owner: ui_main)
 * VB.MatchStats: «Estadística del partido» (al estilo de la pantalla Estadísticas de emPatData, solo el resultado).
 *
 * DOS PARTES
 *  1) Registro (ingest): durante TODO partido (2v2 playa y pista, 6v6, rápido, Carrera, reto) ui.js le pasa cada evento de la sim
 *     (onEvents, ingest de las escenas y del banquillo, netTally del online con los eventos confirmados). Guarda un log compacto por
 *     rally: quién saca, cada toque (tipo, equipo, jugador, nota, posición del balón), los bloqueos, el bote y cómo acabó el punto.
 *     Coste casi nulo: un objeto pequeño por toque, sin cálculos. Solo LEE la sim (nunca g.rng, nunca escribe en g ni en el evento).
 *     Se ignoran la demo, los ejercicios (g.drill) y las repeticiones (e.replay / g.replay).
 *  2) Cálculo y vista (compute / html): SOLO al pulsar «Estadística del partido» en la hoja final. compute(data, set) es puro y
 *     determinista (mismo log → mismo modelo) y no toca el DOM; html(model, team, opts) devuelve el HTML (cadena) de la pantalla.
 *
 * TRADUCCIÓN SIM → CÓDIGOS emPat (escala de Data Volley: # + ! − / =; en el modelo el «−» se guarda como '-')
 *  Fundamentos: S saque, R recepción, A ataque, B bloqueo, D defensa, E colocación, X faltas; F = balón libre (3r toque que pasa sin
 *  atacar: no tiene columna propia, pero sus puntos y errores cuentan en Pts y Err).
 *  Toques de la sim (evento 'hit'): serve → S; pass con recv (1r toque tras el saque) → R; pass resto → D; set → E;
 *  spike y la dejada (free con shot 'tip') → A; free resto → F. Evento 'block' → B.
 *  En juego (el rally sigue):
 *   R / D / E  # nota 'perfect' | + 'good' con calidad >= 0,6 | ! 'good' con calidad < 0,6 | − 'poor' o desviada (shank)
 *              / si el siguiente toque es del rival (pasa directa al otro campo)
 *   S          según la recepción rival: R# o R+ → S− | R! → S! | R− → S+ | R/ → S/ ; sin recepción → S! (salvo ace o error)
 *   A          bloqueo rival directo (stuff) → / | toque de bloqueo que sigue (soft, touch) → ! | block-out (tool) → + |
 *              defensa rival buena (perfect, good) → − | defensa rival mala o desviada → +
 *   B          directo (stuff) → + (si da el punto, #) | amortiguado (soft) → + | toque (touch) → ! | block-out (tool) → =
 *   F          !
 *  Cómo acaba el punto (evento 'point': team, how, reason, player) → UNA acción decide el rally (win +1 la de quien gana el punto
 *  por mérito propio, win −1 el error de quien lo pierde):
 *   reason 'serve' (falta de saque: reloj, el balón cae sin golpear)            → S= del sacador (decide)
 *   faltas con autor (reason net, double, four, block —bloquear el saque—, backBlock, attackServe, backAttack, position)
 *                                                                               → X del autor (decide). Tipo: net r (red),
 *                                                                                 double d (dobles), backBlock/backAttack/position
 *                                                                                 p (posición), resto o (otra)
 *   how 'ace'                    → S# del sacador (decide); el toque de recepción que no la salva → R= (no decide)
 *   how 'kill' / 'tip'           → A# del último ataque del que gana (decide); block-out → B= del bloqueador; defensa que no la
 *                                  salva → D= (no deciden)
 *   how 'block'                  → B# del último bloqueo del que gana (decide); el ataque bloqueado ya es A/
 *   how 'free'                   → # del último toque del que gana (un balón libre, una colocación o un pase que cae dentro: F#)
 *   how 'error'                  → = del último toque del que pierde (saque fuera o a la red S=, remate fuera A=, recepción R=,
 *                                  defensa D=, colocación E=, bloqueo B=, balón libre F=) (decide)
 *  Por eso: puntos de un equipo = acciones propias que deciden con win +1 + errores del rival que deciden (win −1). Un ataque
 *  bloqueado cuenta como punto de bloqueo del rival (no como error propio): en «Puntos regalados» solo entran los errores.
 *  Zonas 1-6 (mapas de saque y de ataque): en el campo del que recibe, por dónde toca el balón su primer toque (o donde bota si
 *  nadie lo toca). Delante (a 1/3 de la red: 3 m en pista) 4-3-2 y detrás 5-6-1, con 4 y 5 a la izquierda del que recibe. Fuera
 *  = 0. Bloqueado o a la red: sin zona.
 *  Rotación (solo 6v6): R1…R6 = zona del colocador (puesto 'S') de cada equipo al preparar el saque. K1 = el primer ataque del
 *  equipo que recibe sin que el rival haya tocado (K1+ tras recepción # o +, K1− tras ! o −); K2 = cualquier otro ataque.
 * LIMITACIONES: la sim no distingue el «!» (sin primer tiempo) de verdad: sale de la calidad del toque; el S+ / S− sale de la
 *  recepción y no de la intención; no hay colocaciones «a un atacante concreto» ni zonas de origen del ataque; la falta de pisada
 *  no existe (la falta de posición del 6v6 sí); el +/− del líbero sale de cuándo está dentro según la sim.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var cur = null;   // log del partido en curso (o del último acabado)

  // ------------------------------------------------------------------ registro
  function r1(v) { return Math.round((+v || 0) * 10) / 10; }
  function newLog(g) {
    return { size: (g && g.size) || 2, beach: !!(g && g.beach), HL: (g && g.HL) || 9, HW: (g && g.HW) || 4.5, points: (g && g.points) || 25,
      roster: {}, rallies: [], r: null, me: -1, meSet: false,
      // (6v6, para el acta de js/acta.js) plantilla completa, alineación y primer saque de cada set, y lo que pasa a balón muerto:
      // ac = [{i: rally antes del que pasa, k: 'sub'|'lib'|'tmo', s: set, t: equipo, o/n: dorsal que sale / entra}]
      // san = sanciones del Ambiente de Carrera (amb:card), en todos los formatos: [{i, s, t, lv, n (dorsal|0), who, rs, sc, pen}]
      // (en 6v6 también van en ac con k: 'san' para el acta: lv = nivel de emPat warning|penalty|delayWarning|delayPenalty)
      sq: null, lu: {}, ac: [], san: [], bo1: !!(g && g.bo1), seed: (g && g.seed) | 0 };
  }
  /** 6v6: plantilla de cada equipo (con banquillo y líbero) y alineación del set. Nada en 2v2. */
  function squadOf(g) {
    if (!g || g.size !== 6 || !g.teams) return null;
    var out = [[], []];
    for (var t = 0; t < 2; t++) {
      var L = (g.roster && g.roster[t]) || g.teams[t].concat(g.libero && g.libero[t] ? [g.libero[t]] : []);
      for (var i = 0; i < L.length; i++) if (L[i]) out[t].push({ n: L[i].num | 0, nm: typeof L[i].name === 'string' ? L[i].name : '', ro: L[i].role || '' });
    }
    return out;
  }
  function lineupOf(g, setNo) {
    if (!g || !g.lineup || !g.lineup[0] || !g.lineup[1]) return;
    cur.lu[setNo] = { r: [g.lineup[0].map(function (q) { return q.num | 0; }), g.lineup[1].map(function (q) { return q.num | 0; })], sv: g.serving | 0 };
  }
  /** Índice del rally antes del que pasa lo de balón muerto (el siguiente; o el abierto, si aún no se ha jugado nada en él). */
  function nextIdx() { var r = cur.r, n = cur.rallies.length; return r && r.w < 0 && !r.c.length ? n - 1 : n; }
  function pid(p) {
    if (!p || p.id == null) return -1;
    var R = cur.roster, k = p.id;
    if (!R[k]) R[k] = { n: p.num | 0, nm: typeof p.name === 'string' ? p.name : '', t: p.team | 0, ro: p.role || '' };
    return k;
  }
  /** Jugadores en pista (6v6: la rotación, con el líbero en lugar de su central) y zona del colocador de cada equipo. */
  function court(g) {
    if (!g || !g.rot || !g.rot[0] || !g.rot[1]) return null;
    var on = [[], []], rot = [0, 0];
    for (var t = 0; t < 2; t++) {
      var R = g.rot[t];
      for (var z = 0; z < R.length; z++) {
        var q = R[z];
        if (g.liberoFor && g.libero && q && q === g.liberoFor[t]) q = g.libero[t];
        on[t].push(pid(q));
        if (R[z] && R[z].role === 'S' && !rot[t]) rot[t] = z + 1;
      }
    }
    return { on: on, rot: rot };
  }
  function openRally(g, team, sv) {
    var r = cur.r;
    if (!(r && !r.c.length && r.w < 0)) { r = { s: 1, sv: 0, srv: -1, on: null, rot: null, c: [], L: null, w: -1, how: '', rs: '', fp: -1, lk: '', sc: null }; cur.rallies.push(r); cur.r = r; }
    r.s = (g && g.setNo) || 1; r.sv = team | 0; r.srv = pid(sv);
    var c = court(g); r.on = c ? c.on : null; r.rot = c ? c.rot : null;
    if (!cur.meSet && g) {   // tu jugador (para marcarlo en la tabla): el que llevas en 6v6 o con control 'one'
      cur.meSet = true;
      var me = !g.autopilot && !g.watch0 && !g.online ? (g.size === 6 ? (g.ctrlBase || g.ctrl) : g.ctrlMode === 'one' ? g.ctrl : null) : null;
      if (!me && g.career && g.career.num && g.teams && g.teams[0] && !g.watch0) for (var i = 0; i < g.teams[0].length; i++) if (g.teams[0][i].num === g.career.num) me = g.teams[0][i];   // Carrera: tu atleta
      cur.me = me && me.team === 0 ? pid(me) : -1;
    }
    return r;
  }
  var HK = { serve: 'S', pass: 'P', set: 'E', spike: 'A' };
  function ingest(e, g) {
    if (!e || e.replay || (g && (g.demo || g.drill || g.replay))) return;
    var ty = e.type;
    if (ty === 'newMatch') { cur = newLog(g); cur.sq = squadOf(g); lineupOf(g, 1); return; }
    if (ty === 'amb:card') {   // Ambiente de Carrera: tarjeta (antes del punto de castigo, si lo hay)
      if (!cur) cur = newLog(g);
      var lv = SAN_LV[e.color]; if (!lv) return;
      var sn = { i: nextIdx(), k: 'san', s: (g && g.setNo) | 0 || (e.set | 0) || 1, t: e.team | 0, lv: lv, n: e.who === 'player' ? e.num | 0 : 0,
        who: e.who === 'coach' ? 'coach' : e.who === 'team' ? 'team' : 'player', rs: e.reason || '', sc: e.score ? [e.score[0] | 0, e.score[1] | 0] : null, pen: !!e.penalty };
      cur.san.push(sn);
      if (g && g.size === 6) cur.ac.push(sn);
      return;
    }
    if (ty === 'newSet' || ty === 'sub' || ty === 'libero' || ty === 'timeout') {
      if (!cur || !g || g.size !== 6) return;
      if (ty === 'newSet') { lineupOf(g, e.setNo | 0); return; }
      var a = { i: nextIdx(), k: ty === 'sub' ? 'sub' : ty === 'libero' ? 'lib' : 'tmo', s: g.setNo | 0, t: e.team | 0 };
      if (ty !== 'timeout') { a.o = e.outP ? e.outP.num | 0 : 0; a.n = e.inP ? e.inP.num | 0 : 0; }
      cur.ac.push(a);
      return;
    }
    if (ty !== 'serveReady' && ty !== 'hit' && ty !== 'block' && ty !== 'land' && ty !== 'point') return;
    if (ty === 'point' && e.penalty && !cur) cur = newLog(g);
    if (!cur) cur = newLog(g);
    var r = cur.r;
    switch (ty) {
      case 'serveReady': openRally(g, e.team, e.player); return;
      case 'hit': {
        if (!r || r.w >= 0) { if (e.kind !== 'serve') return; r = openRally(g, e.team, e.player); }
        var k = HK[e.kind] || (e.shot === 'tip' ? 'T' : 'F');
        var c = { k: k, t: e.team | 0, p: pid(e.player), g: e.grade === 'perfect' ? 2 : e.grade === 'good' ? 1 : 0, q: Math.round((+e.quality || 0) * 100) / 100,
          rv: e.recv ? 1 : 0, sk: e.shot === 'shank' ? 1 : 0, x: r1(e.x), y: r1(e.y) };
        r.c.push(c); return;
      }
      case 'block':
        if (!r || r.w >= 0) return;
        r.c.push({ k: 'B', t: e.team | 0, p: pid(e.player), res: e.result || '', x: r1(e.x), y: r1(e.y) }); return;
      case 'land':
        if (r && r.w < 0 && !r.L) r.L = [r1(e.x), r1(e.y), e.inside ? 1 : 0];
        return;
      case 'point': {
        if (e.penalty) {   // punto de castigo (Ambiente): un rally propio, sin acciones; el acta lo da con la sanción
          var pr = { s: (g && g.setNo) || 1, sv: g ? (e.sideout ? 1 - (e.team | 0) : e.team | 0) : 0, srv: -1, on: null, rot: null, c: [], L: null, w: e.team | 0,
            how: 'penalty', rs: 'penalty', fp: e.faultPlayer ? pid(e.faultPlayer) : -1, lk: '', sc: e.score ? [e.score[0] | 0, e.score[1] | 0] : null, pen: 1 };
          cur.rallies.push(pr); cur.r = pr;
          return;
        }
        var tgt = r;
        if (!tgt) tgt = openRally(g, g ? g.serving : 1 - (e.team | 0), null);
        else if (tgt.w < 0 && !tgt.c.length && (e.reason === 'in' || e.reason === 'out') && cur.rallies.length > 1) tgt = cur.rallies[cur.rallies.length - 2]; // challenge acertado con el saque siguiente ya preparado: se vuelve a pitar el anterior
        // (con tgt.w >= 0: el mismo punto se vuelve a pitar tras un challenge acertado y lo sustituye)
        tgt.w = e.team | 0; tgt.how = e.how || 'error'; tgt.rs = e.reason || ''; tgt.fp = e.player ? pid(e.player) : -1; tgt.lk = e.lastKind || '';
        tgt.sc = e.score ? [e.score[0] | 0, e.score[1] | 0] : null;
        return;
      }
    }
  }
  function reset() { cur = null; }
  /** Log del último partido (o null). */
  function data() { return cur; }
  /** ¿Hay algo que enseñar? (al menos un rally acabado) */
  function ready() { if (!cur) return false; for (var i = 0; i < cur.rallies.length; i++) if (cur.rallies[i].w >= 0) return true; return false; }

  // ------------------------------------------------------------------ cálculo (solo al pulsar el botón)
  var CODES = ['#', '+', '!', '-', '/', '='];
  function fund() { return { t: 0, '#': 0, '+': 0, '!': 0, '-': 0, '/': 0, '=': 0 }; }
  function blank() { return { S: fund(), R: fund(), A: fund(), B: fund(), D: fund(), E: fund(), F: fund(), X: { t: 0 }, pts: 0, err: 0, on: 0, pm: 0 }; }
  var SAN_LV = { yellow: 'warning', red: 'penalty', expel: 'expulsion', dq: 'disqualification', delayY: 'delayWarning', delayR: 'delayPenalty' };
  var FX = { net: 'r', double: 'd', four: 'o', block: 'o', backBlock: 'p', attackServe: 'o', backAttack: 'p', position: 'p' };
  var BALL_RS = { 'in': 1, out: 1, antenna: 1, under: 1 };
  var S_FROM_R = { '#': '-', '+': '-', '!': '!', '-': '+', '/': '/', '=': '#' };
  var F_OF_K = { serve: 'S', pass: 'D', set: 'E', spike: 'A', free: 'F', block: 'B' };
  function zoneOf(x, y, team, D) {
    var s = team === 0 ? 1 : -1;
    if (x * s <= 0) return -1;
    var d = Math.abs(x), front = d <= D.HL / 3, l = -y * s, col = l > D.HW / 3 ? 0 : l < -D.HW / 3 ? 2 : 1;
    return front ? [4, 3, 2][col] : [5, 6, 1][col];
  }
  function passCode(x, nx) {
    if (nx && nx.t !== x.t) return '/';
    if (x.sk) return '-';
    return x.g === 2 ? '#' : x.g === 1 ? (x.q >= 0.6 ? '+' : '!') : '-';
  }
  /** Destino de un saque / ataque (zona 1-6 en el campo rival, 0 fuera, −1 sin zona: bloqueado, a la red). */
  function dest(r, i, D) {
    var c = r.c, x = c[i], opp = 1 - x.t, j = i + 1;
    while (c[j] && c[j].k === 'B' && c[j].t === opp && (c[j].res === 'soft' || c[j].res === 'touch')) j++;   // el toque de bloqueo que sigue en su campo
    var y = c[j];
    if (y) return y.t === opp && y.k !== 'B' ? zoneOf(y.x, y.y, opp, D) : -1;
    if (!r.L) return -1;
    var s = opp === 0 ? 1 : -1;
    if (r.L[0] * s <= 0) return -1;
    return r.L[2] ? zoneOf(r.L[0], r.L[1], opp, D) : 0;
  }
  /** Acciones de un rally con su código emPat; exactamente una lleva win (+1 / −1). */
  function rallyActs(r, D) {
    var c = r.c, n = c.length, acts = [], i, x, a, recvT = 1 - r.sv;
    for (i = 0; i < n; i++) {
      x = c[i];
      var f = x.k === 'S' ? 'S' : x.k === 'P' ? (x.rv ? 'R' : 'D') : x.k === 'E' ? 'E' : x.k === 'A' || x.k === 'T' ? 'A' : x.k === 'F' ? 'F' : 'B';
      acts.push({ f: f, r: '!', t: x.t, p: x.p, z: -1, ph: '', win: 0 });
    }
    var recCode = '';
    for (i = 0; i < n; i++) {
      a = acts[i]; x = c[i];
      if (a.f === 'R' || a.f === 'D' || a.f === 'E') { a.r = passCode(x, c[i + 1]); if (a.f === 'R' && !recCode && a.t === recvT) recCode = a.r; }
      else if (a.f === 'B') a.r = x.res === 'stuff' || x.res === 'soft' ? '+' : x.res === 'touch' ? '!' : '=';
      else if (a.f === 'A') {
        var y = c[i + 1];
        if (!y) a.r = '!';
        else if (y.t === x.t) a.r = '-';
        else if (y.k === 'B') a.r = y.res === 'stuff' ? '/' : y.res === 'tool' ? '+' : '!';
        else a.r = y.sk || y.g === 0 ? '+' : '-';
        a.z = dest(r, i, D);
      } else if (a.f === 'S') a.z = dest(r, i, D);
    }
    // saque según la recepción rival
    for (i = 0; i < n; i++) if (acts[i].f === 'S') { acts[i].r = recCode ? S_FROM_R[recCode] : '!'; break; }
    // fase del ataque (K1 / K2)
    var oppTouched = false, k1done = false;
    for (i = 0; i < n; i++) {
      a = acts[i];
      if (i > 0 && a.t === r.sv) oppTouched = true;
      if (a.f !== 'A') continue;
      if (a.t === recvT && !oppTouched && !k1done) { a.ph = recCode === '#' || recCode === '+' ? 'K1+' : recCode === '-' || recCode === '!' ? 'K1-' : 'K1?'; k1done = true; }
      else a.ph = 'K2';
    }
    // cómo acaba
    var w = r.w, L = 1 - w, how = r.how, rs = r.rs, dec = null, k, m;
    var lastOf = function (fn) { for (var j = acts.length - 1; j >= 0; j--) if (fn(acts[j])) return j; return -1; };
    if (rs === 'penalty') {   // punto de castigo: una falta del sancionado (o del equipo, sin jugador)
      dec = { f: 'X', r: 'o', t: L, p: r.fp, z: -1, ph: '', win: -1 }; acts.push(dec);
    } else if (rs === 'serve') {
      k = lastOf(function (q) { return q.f === 'S'; });
      if (k >= 0) dec = acts[k]; else { dec = { f: 'S', r: '=', t: L, p: r.fp >= 0 ? r.fp : r.srv, z: -1, ph: '', win: 0 }; acts.unshift(dec); }
      dec.r = '='; dec.win = -1;
    } else if (FX[rs] || (r.fp >= 0 && !BALL_RS[rs])) {
      dec = { f: 'X', r: FX[rs] || 'o', t: L, p: r.fp, z: -1, ph: '', win: -1 }; acts.push(dec);
    } else if (how === 'ace' || how === 'kill' || how === 'tip' || how === 'block' || how === 'free') {
      var want = how === 'ace' ? 'S' : how === 'block' ? 'B' : how === 'free' ? '' : 'A';
      k = lastOf(function (q) { return q.t === w && q.f !== 'X' && (!want || q.f === want); });
      if (k < 0) k = lastOf(function (q) { return q.t === w && q.f !== 'X'; });
      if (k >= 0) {
        dec = acts[k];
        if (how === 'free' && (dec.f === 'E' || dec.f === 'R' || dec.f === 'D')) dec.f = 'F';
        dec.r = '#'; dec.win = 1;
        for (m = k + 1; m < acts.length; m++) { var q2 = acts[m]; if (q2.t !== L) continue; if (q2.f === 'B') { if (q2.r !== '=') q2.r = '-'; } else q2.r = '='; }
      } else { dec = { f: how === 'ace' ? 'S' : how === 'block' ? 'B' : how === 'free' ? 'F' : 'A', r: '#', t: w, p: -1, z: -1, ph: '', win: 1 }; acts.push(dec); }
    } else {
      k = lastOf(function (q) { return q.t === L && q.f !== 'X'; });
      if (k >= 0) { dec = acts[k]; dec.r = '='; dec.win = -1; }
      else { dec = { f: F_OF_K[r.lk] || 'F', r: '=', t: L, p: -1, z: -1, ph: '', win: -1 }; acts.push(dec); }
    }
    return { acts: acts, dec: dec, rec: recCode };
  }
  function pct(a, b) { return b ? Math.round(a * 100 / b) : null; }
  /** Modelo de la pantalla para los dos equipos. set = 0 (todo el partido) o 1-3. Puro y determinista. */
  function compute(d, set) {
    d = d || cur; set = set | 0;
    var M = { set: set, sets: [], setScores: [], size: d ? d.size : 2, beach: d ? d.beach : false, teams: [null, null], mom: [], me: d ? d.me : -1, roster: d ? d.roster : {} };
    if (!d) return M;
    var D = { HL: d.HL, HW: d.HW }, done = [], i, t;
    for (i = 0; i < d.rallies.length; i++) if (d.rallies[i].w >= 0) done.push(d.rallies[i]);
    var bySet = {};
    done.forEach(function (r) { if (r.sc) bySet[r.s] = r.sc; });
    M.sets = Object.keys(bySet).map(Number).sort(function (a, b) { return a - b; });
    M.setScores = M.sets.map(function (s) { return bySet[s].slice(); });
    var R = done.filter(function (r) { return !set || r.s === set; });
    var teamPl = [[], []];
    Object.keys(d.roster).forEach(function (k) { var p = d.roster[k]; teamPl[p.t === 1 ? 1 : 0].push(+k); });
    for (t = 0; t < 2; t++) {
      M.teams[t] = { team: { ours: 0, rivalErr: 0, ourErr: 0, rivalPts: 0, soT: 0, soW: 0, brT: 0, brW: 0, rcT: 0, rcW: 0, fbW: 0, svErr: 0 },
        T: blank(), rows: {}, rot: {}, K: {}, errBy: {}, zones: { S: zmap(), A: zmap() }, pts: 0 };
    }
    var row = function (TT, p) { return TT.rows[p] || (TT.rows[p] = blank()); };
    R.forEach(function (r) {
      var X = rallyActs(r, D), dec = X.dec;
      M.mom.push({ s: r.s, d: r.sc ? r.sc[0] - r.sc[1] : 0, w: r.w });
      for (t = 0; t < 2; t++) {
        var TT = M.teams[t], tm = TT.team, won = r.w === t;
        if (won) TT.pts++;
        if (dec.win === 1) { if (dec.t === t) tm.ours++; else tm.rivalPts++; } else { if (dec.t === t) tm.ourErr++; else tm.rivalErr++; }
        var hasRec = false, fb = false;
        for (i = 0; i < X.acts.length; i++) if (X.acts[i].f === 'R' && X.acts[i].t === t) { hasRec = true; break; }
        fb = won && dec.f === 'A' && dec.win === 1 && dec.t === t && dec.ph.indexOf('K1') === 0;
        if (r.sv !== t) {
          tm.soT++; if (won) tm.soW++;
          if (hasRec) { tm.rcT++; if (won) tm.rcW++; if (fb) tm.fbW++; }
          else if (won && dec.f === 'S' && dec.win === -1) tm.svErr++;
        } else { tm.brT++; if (won) tm.brW++; }
        if (r.rot && r.rot[t]) {
          var o = TT.rot[r.rot[t]] || (TT.rot[r.rot[t]] = { soT: 0, soW: 0, brT: 0, brW: 0, w: 0, l: 0, rcT: 0, fbW: 0 });
          if (r.sv !== t) { o.soT++; if (won) o.soW++; if (hasRec) { o.rcT++; if (fb) o.fbW++; } } else { o.brT++; if (won) o.brW++; }
          if (won) o.w++; else o.l++;
        }
        // en pista: +/−
        var on = r.on ? r.on[t] : teamPl[t];
        for (i = 0; i < on.length; i++) if (on[i] >= 0) { var ro = row(TT, on[i]); ro.on++; ro.pm += won ? 1 : -1; }
      }
      X.acts.forEach(function (a) {
        var TT = M.teams[a.t], tg = [TT.T];
        if (a.p >= 0) tg.push(row(TT, a.p));
        for (var j = 0; j < tg.length; j++) {
          var b = tg[j][a.f]; b.t++; if (a.f !== 'X') b[a.r] = (b[a.r] || 0) + 1;
          if (a.win === 1) tg[j].pts++; if (a.win === -1) tg[j].err++;
        }
        if (a.win === -1) { var lb = a.f; TT.errBy[lb] = (TT.errBy[lb] || 0) + 1; }
        if (a.f === 'A' && a.ph) { var kk = TT.K[a.ph] || (TT.K[a.ph] = { t: 0, '#': 0, '=': 0, '/': 0 }); kk.t++; if (kk[a.r] != null) kk[a.r]++; }
        if (a.f === 'S' || a.f === 'A') {
          var zm = TT.zones[a.f]; zm.n++;
          if (a.z > 0) { zm.z[a.z].n++; if (a.r === '#') zm.z[a.z].g++; zm.inZ++; } else if (a.z === 0) zm.out++; else zm.none++;
        }
      });
    });
    // filas ordenadas por dorsal (y por id con dorsal repetido); solo quien ha jugado algún rally o tiene acciones
    for (t = 0; t < 2; t++) {
      var TT = M.teams[t], list = [];
      Object.keys(TT.rows).forEach(function (k) {
        var s = TT.rows[k], p = d.roster[k] || { n: 0, nm: '', t: t, ro: '' }, act = 0;
        'SRABDEFX'.split('').forEach(function (f) { act += s[f].t; });
        if (!s.on && !act) return;
        s.pid = +k; s.num = p.n; s.name = p.nm; s.role = p.ro; s.team = t; list.push(s);
      });
      list.sort(function (a, b) { return (a.num - b.num) || (a.pid - b.pid); });
      TT.list = list;
    }
    return M;
  }
  function zmap() { var z = {}; for (var i = 1; i <= 6; i++) z[i] = { n: 0, g: 0 }; return { n: 0, inZ: 0, out: 0, none: 0, z: z }; }

  // ------------------------------------------------------------------ vista (HTML en cadena; el DOM lo pone ui.js)
  var ROLE_AB = { S: 'Col', OPP: 'Opu', OH: 'Rec', MB: 'Cen', L: 'Líb' };
  var ERR_LBL = { S: 'Saque', R: 'Recepción', A: 'Ataque', B: 'Bloqueo', D: 'Defensa', E: 'Colocación', F: 'Balón libre', X: 'Faltas' };
  function escD(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pctS(a, b) { var v = pct(a, b); return v == null ? '–' : v + '%'; }
  function pctN(a, b) { return b ? '<span class="' + (b < 3 ? 'low' : '') + '">' + Math.round(a * 100 / b) + '%<span class="nn">' + b + '</span></span>' : '<span class="na">–</span>'; }
  function eff(n, dd) {
    if (!dd) return '<span class="na">–</span>';
    var v = Math.round(n * 100 / dd);
    return '<span class="' + (dd < 3 ? 'low' : '') + '"><span class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '') + '">' + (v > 0 ? '+' : '') + v + '%</span><span class="nn">' + dd + '</span></span>';
  }
  function z0(v) { return v ? String(v) : '<span class="na">0</span>'; }
  /** Nombre corto de un jugador para la tabla: «7 Nico» (Carrera) o «N.º 7». */
  function plName(s, o) {
    var nm = s.name || (o && o.pnames && o.pnames[s.team + ':' + s.num]) || '';
    return escD(nm);
  }
  function statRow(s, label, cls, noOn) {
    var S = s.S, Rr = s.R, A = s.A, pm = s.pm || 0;
    return '<tr class="' + (cls || '') + '"><th class="l" scope="row">' + label + '</th>' +
      (noOn ? '<td><span class="na">–</span></td><td><span class="na">–</span></td>' :
      '<td>' + (s.on || '<span class="na">0</span>') + '</td><td class="' + (pm > 0 ? 'pos' : pm < 0 ? 'neg' : '') + '">' + (s.on ? (pm > 0 ? '+' : pm < 0 ? '−' : '') + Math.abs(pm) : '<span class="na">–</span>') + '</td>') +
      '<td class="b">' + s.pts + '</td><td>' + z0(s.err) + '</td>' +
      '<td class="grp">' + z0(S.t) + '</td><td>' + z0(S['#']) + '</td><td>' + z0(S['=']) + '</td><td>' + eff(S['#'] + S['+'] + S['/'] - S['='] - S['-'], S.t) + '</td>' +
      '<td class="grp">' + z0(Rr.t) + '</td><td>' + pctN(Rr['#'] + Rr['+'], Rr.t) + '</td><td>' + pctN(Rr['#'], Rr.t) + '</td><td>' + z0(Rr['=']) + '</td>' +
      '<td class="grp">' + z0(A.t) + '</td><td>' + z0(A['#']) + '</td><td>' + z0(A['=']) + '</td><td>' + z0(A['/']) + '</td><td>' + pctN(A['#'], A.t) + '</td><td>' + eff(A['#'] - A['='] - A['/'], A.t) + '</td>' +
      '<td class="grp">' + z0(s.B['#']) + '</td><td>' + z0(s.D.t) + '</td><td>' + z0(s.X.t) + '</td></tr>';
  }
  /** «Quién iba por delante»: la línea en un SVG estirado (preserveAspectRatio none, trazo que no escala) y los rótulos en HTML
   *  encima, para que se lean igual a 390 px que a 1280 px. */
  function momentumSVG(M, team, names) {
    var ev = M.mom; if (ev.length < 2) return '';
    var sg = team === 0 ? 1 : -1, pts = [], seps = [], last = -1, mx = 4, n = ev.length;
    ev.forEach(function (e, i) { if (e.s !== last) { seps.push({ i: i, s: e.s }); last = e.s; } var v = e.d * sg; pts.push(v); if (Math.abs(v) > mx) mx = Math.abs(v); });
    var X = function (i) { return i * 1000 / (n - 1); }, Y = function (v) { return 50 - v * 46 / mx; };
    var segs = seps.map(function (s, k) {
      var end = k + 1 < seps.length ? seps[k + 1].i : n, p = '';
      for (var i = s.i; i < end; i++) p += (i === s.i ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(pts[i]).toFixed(2);
      var a = p + 'L' + X(end - 1).toFixed(1) + ' 50L' + X(s.i).toFixed(1) + ' 50Z';
      return '<path class="ar" d="' + a + '"/><path class="lu" vector-effect="non-scaling-stroke" d="' + p + '"/>';
    }).join('');
    var ax = seps.map(function (s) { return s.i ? '<line class="ax" vector-effect="non-scaling-stroke" x1="' + X(s.i).toFixed(1) + '" x2="' + X(s.i).toFixed(1) + '" y1="0" y2="100"/>' : ''; }).join('');
    var lab = seps.map(function (s) { return '<span class="ms-ml" style="--x:' + (X(s.i) / 1000).toFixed(4) + '">Set ' + s.s + '</span>'; }).join('');
    return '<div class="ms-mom t' + team + '" role="img" aria-label="Diferencia de puntos a lo largo ' + (M.set ? 'del set' : 'del partido') + ': por encima de la línea, ' + escD(names[team]) + ' iba por delante">' +
      '<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><line class="zero" vector-effect="non-scaling-stroke" x1="0" x2="1000" y1="50" y2="50"/>' + ax + segs + '</svg>' +
      lab + '<span class="ms-mt us" aria-hidden="true">+' + mx + ' ' + escD(names[team]) + '</span><span class="ms-mt them" aria-hidden="true">+' + mx + ' ' + escD(names[1 - team]) + '</span></div>';
  }
  function mapHTML(zm, kind, team, beach) {
    var tot = zm.inZ;
    var cell = function (z) {
      var c = zm.z[z], sh = tot ? c.n / tot : 0;
      return '<div class="mc" style="--a:' + Math.round(sh * 100) + '%"><span class="zn">' + z + '</span><b>' + (c.n || '') + '</b><span>' +
        (c.n ? (kind === 'S' ? pctS(c.n, tot) + (c.g ? '<i>' + c.g + (c.g === 1 ? ' ace' : ' aces') + '</i>' : '') : pctS(c.g, c.n) + ' punto') : '') + '</span></div>';
    };
    var cells = [1, 6, 5, 2, 3, 4].map(cell).join('');
    var foot = [];
    if (zm.out) foot.push(zm.out + ' fuera');
    if (zm.none) foot.push(zm.none + (kind === 'S' ? ' a la red' : ' bloqueados o a la red'));
    return '<div class="ms-map t' + team + (beach ? ' sand' : '') + '"><p class="ms-k">' + (kind === 'S' ? 'Saque' : 'Ataque') + '<small>' + zm.n + (kind === 'S' ? (zm.n === 1 ? ' saque' : ' saques') : (zm.n === 1 ? ' ataque' : ' ataques')) + '</small></p>' +
      '<div class="map">' + cells + '<div class="mnet">Red</div></div>' + (foot.length ? '<p class="ms-mf">' + foot.join(', ') + '</p>' : '') + '</div>';
  }
  function rotHTML(TT, six) {
    var R = TT.rot, K = TT.K, has = Object.keys(R).length, h = '';
    if (has) {
      var rows = [1, 2, 3, 4, 5, 6].map(function (n) {
        var o = R[n];
        if (!o) return '<tr><th class="l" scope="row"><b>R' + n + '</b></th><td colspan="5"><span class="na">–</span></td></tr>';
        var dd = o.w - o.l;
        return '<tr><th class="l" scope="row"><b>R' + n + '</b></th><td>' + pctN(o.soW, o.soT) + '</td><td>' + pctN(o.fbW, o.rcT) + '</td><td>' + pctN(o.brW, o.brT) + '</td><td>' + o.w + '-' + o.l + '</td><td class="' + (dd > 0 ? 'pos' : dd < 0 ? 'neg' : '') + '">' + (dd > 0 ? '+' : dd < 0 ? '−' : '') + Math.abs(dd) + '</td></tr>';
      }).join('');
      h += '<div class="ms-half"><p class="ms-k">Por rotación</p><div class="ms-tb"><table class="st rtab"><thead><tr><th class="l" scope="col">Rotación</th><th scope="col">Side-out</th><th scope="col">1r ataque</th><th scope="col">Break</th><th scope="col">G-P</th><th scope="col">+/−</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="ms-note">R1 a R6: dónde está el colocador al preparar el saque (R1 = zona 1).</p></div>';
    }
    var KL = [['K1+', 'K1 rec. buena'], ['K1-', 'K1 rec. mala'], ['K1?', 'K1 sin rec.'], ['K2', 'K2']];
    var kr = KL.filter(function (x) { return K[x[0]]; }).map(function (x) {
      var o = K[x[0]];
      return '<tr><th class="l" scope="row">' + x[1] + '</th><td>' + o.t + '</td><td>' + z0(o['#']) + '</td><td>' + z0(o['=']) + '</td><td>' + z0(o['/']) + '</td><td>' + pctN(o['#'], o.t) + '</td><td>' + eff(o['#'] - o['='] - o['/'], o.t) + '</td></tr>';
    }).join('');
    h += '<div class="ms-half' + (six ? '' : ' ms-solo') + '">' + (six ? '<p class="ms-k">Ataque por fase</p>' : '') + (kr ? '<div class="ms-tb"><table class="st ktab"><thead><tr><th class="l" scope="col">Fase</th><th scope="col">Tot</th><th scope="col">#</th><th scope="col">=</th><th scope="col">/</th><th scope="col">% #</th><th scope="col">Efic.</th></tr></thead><tbody>' + kr + '</tbody></table></div>' +
      '<p class="ms-note">K1: el primer ataque después de recibir (rec. buena = recepción # o +; mala = ! o −). K2: el contraataque, cualquier otro ataque (tras una defensa, un bloqueo o el saque propio).</p>' : '<p class="ms-empty">Sin ataques en esta selección.</p>') + '</div>';
    return h;
  }
  /** HTML del cuerpo de la pantalla para el equipo `team` (0/1). o = {names: [a, b], inl: [a, b] (dentro de una frase), pnames: {'equipo:dorsal': nombre} (jugadores sin nombre en la sim), sep(parts, kind) (separador de ui.js), you: 'Tú'}. */
  function html(M, team, o) {
    o = o || {};
    var names = o.names || ['Tu equipo', 'Rival'], inl = o.inl || names, sep = o.sep || function (p) { return p.filter(Boolean).join(', '); };
    var TT = M.teams[team]; if (!TT) return '<p class="ms-empty">Sin datos del partido.</p>';
    var t = TT.team, won = t.ours + t.rivalErr, lost = t.ourErr + t.rivalPts, h = '';
    var sec = function (id, title, body, cls) {
      return '<section class="ms-sec' + (cls ? ' ' + cls : '') + '" aria-labelledby="msh-' + id + '"><h3 class="ms-h" id="msh-' + id + '" tabindex="-1" data-focus>' + title + '</h3>' + body + '</section>';
    };
    var fig = function (cls, k, v, s) { return '<div class="ms-fig' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><b class="v">' + v + '</b><span class="s">' + s + '</span></div>'; };
    var figs = fig('us', 'Puntos ganados', won, sep([t.ours + (t.ours === 1 ? ' propio' : ' propios'), t.rivalErr + ' por error del rival'], 'v')) +
      fig('them', 'Puntos regalados', t.ourErr, lost ? pctS(t.ourErr, lost) + ' de los ' + lost + ' perdidos' : 'Ningún punto perdido') +
      fig('', 'Side-out', pctS(t.soW, t.soT), t.soW + ' de ' + t.soT + ' con saque del rival') +
      fig('', 'Break point', pctS(t.brW, t.brT), t.brW + ' de ' + t.brT + ' con saque propio') +
      fig('', 'Side-out recibiendo', pctS(t.rcW, t.rcT), t.rcT ? t.rcW + ' de ' + t.rcT + ' con recepción' + (t.svErr ? '<br>Sin contar ' + t.svErr + (t.svErr === 1 ? ' error' : ' errores') + ' de saque rival' : '') : 'Sin recepciones') +
      fig('', 'Al primer ataque', pctS(t.fbW, t.rcT), t.rcT ? t.fbW + ' de ' + t.rcT + ' recepciones acaban en punto en el K1' : 'Sin recepciones');
    // Móvil (.ph): las seis cifras en UNA pegatina (.sp-heros, 3 × 2) y el detalle de cada una detrás de la «i» (VB.Splat.info, la
    // enciende ui.js msRender); en PC siguen las tarjetas. Las dos versiones van en el HTML y el CSS enseña una (.ph-only / .ph-hide).
    var FD = [['us', 'Puntos ganados', won, sep([t.ours + (t.ours === 1 ? ' propio' : ' propios'), t.rivalErr + ' por error del rival'], 'v')],
      ['them', 'Puntos regalados', t.ourErr, lost ? pctS(t.ourErr, lost) + ' de los ' + lost + ' perdidos' : 'Ningún punto perdido'],
      ['', 'Side-out', pctS(t.soW, t.soT), t.soW + ' de ' + t.soT + ' con saque del rival'],
      ['', 'Break point', pctS(t.brW, t.brT), t.brW + ' de ' + t.brT + ' con saque propio'],
      ['', 'Side-out recibiendo', pctS(t.rcW, t.rcT), t.rcT ? t.rcW + ' de ' + t.rcT + ' con recepción' : 'Sin recepciones'],
      ['', 'Al primer ataque', pctS(t.fbW, t.rcT), t.rcT ? t.fbW + ' de ' + t.rcT + ' recepciones' : 'Sin recepciones']];
    var heros = '<div class="sp-heros ms-heros ph-only">' + FD.map(function (f) {
      return '<div' + (f[0] ? ' class="' + f[0] + '"' : '') + '><span class="sp-hn">' + f[2] + '</span><span class="sp-hl">' + f[1] + '</span></div>';
    }).join('') + '</div><dl class="sp-kv sp-help-full ms-figd ph-only">' + FD.map(function (f) { return '<dt>' + f[1] + '</dt><dd>' + f[3] + '</dd>'; }).join('') + '</dl>';
    h += '<section class="ms-sec ms-figsec" data-info-row aria-labelledby="msh-fig"><h3 class="ms-h" id="msh-fig" tabindex="-1" data-focus>Cifras clave</h3>' +
      '<span class="sp-info" role="button" aria-label="Ver el detalle de las cifras"><b aria-hidden="true">i</b></span>' +
      '<div class="ms-figs ph-hide">' + figs + '</div>' + heros + '</section>';
    var mom = momentumSVG(M, team, names);
    if (mom) h += sec('mom', 'Quién iba por delante, punto a punto', mom + '<p class="ms-note">Por encima de la línea central iba ganando ' + escD(inl[team]) + '. Cada set empieza de cero.</p>');
    h += sec('rot', M.size === 6 ? 'Rotaciones y fases' : 'Ataque por fase', M.size === 6 ? '<div class="ms-two">' + rotHTML(TT, true) + '</div>' : rotHTML(TT, false));
    h += sec('map', 'Mapas', '<p class="ms-note">Hacia dónde van los saques y los ataques de ' + escD(inl[team]) + ': el campo rival visto desde el propio, con la red abajo. Zona = donde toca el balón el rival (o donde bota).</p><div class="ms-two ms-maps">' +
      mapHTML(TT.zones.S, 'S', team, M.beach) + mapHTML(TT.zones.A, 'A', team, M.beach) + '</div>');
    var eb = Object.keys(TT.errBy).map(function (k) { return [ERR_LBL[k] || k, TT.errBy[k]]; }).sort(function (a, b) { return (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1); });
    var emx = 1; eb.forEach(function (x) { if (x[1] > emx) emx = x[1]; });
    h += sec('err', 'Dónde se falla', eb.length ? '<div class="ms-bars">' + eb.map(function (x) {
      return '<div class="ms-bar"><span>' + x[0] + '</span><span class="t"><i style="width:' + (x[1] * 100 / emx).toFixed(0) + '%"></i></span><b>' + x[1] + '</b></div>';
    }).join('') + '</div>' : '<p class="ms-empty">Ningún error que diera un punto.</p>');
    // tabla por jugador
    var you = o.you || 'Tú';
    var lbl = function (s) {
      var me = team === 0 && M.me >= 0 && s.pid === M.me;
      return '<span class="num"><span class="sr">N.º </span>' + s.num + '</span><span class="cl">' + plName(s, o) + (s.role && ROLE_AB[s.role] ? '<small>' + ROLE_AB[s.role] + '</small>' : '') + (me ? '<em>' + escD(you) + '</em>' : '') + '</span>';
    };
    var tb = '<div class="ms-tb ms-pl" tabindex="0" data-focus role="region" aria-label="Tabla por jugador (se desplaza a los lados)"><table class="st"><thead>' +
      '<tr class="g"><th class="l"></th><th colspan="2" class="grp">En pista</th><th colspan="2"></th><th colspan="4" class="grp">Saque</th><th colspan="4" class="grp">Recepción</th><th colspan="6" class="grp">Ataque</th><th colspan="3" class="grp">Otros</th></tr>' +
      '<tr><th class="l" scope="col">Jugador</th><th scope="col" title="Rallies jugados en pista">Rallies</th><th scope="col" title="Rallies ganados menos perdidos en pista">+/−</th><th scope="col">Pts</th><th scope="col">Err</th>' +
      '<th class="grp" scope="col">Tot</th><th scope="col">#</th><th scope="col">=</th><th scope="col">Efic.</th>' +
      '<th class="grp" scope="col">Tot</th><th scope="col">Pos.</th><th scope="col">Perf.</th><th scope="col">=</th>' +
      '<th class="grp" scope="col">Tot</th><th scope="col">#</th><th scope="col">=</th><th scope="col" title="Ataques bloqueados">Blq</th><th scope="col">% #</th><th scope="col">Efic.</th>' +
      '<th class="grp" scope="col" title="Bloqueos punto">Bloq.</th><th scope="col">Def.</th><th scope="col">Faltas</th></tr></thead><tbody>';
    TT.list.forEach(function (s) { tb += statRow(s, lbl(s), team === 0 && M.me >= 0 && s.pid === M.me ? 'me' : ''); });
    tb += statRow(TT.T, 'Equipo', 'tot', true) + '</tbody></table></div>';
    h += sec('pl', 'Por jugador', tb +
      '<p class="ms-note">Escala de Data Volley: <b>#</b> perfecto o punto, <b>+</b> positivo, <b>!</b> en juego, <b>−</b> negativo, <b>/</b> según el fundamento (en el saque, el rival lo devuelve sin atacar; en el ataque, bloqueado) y <b>=</b> error. ' +
      'Pts y Err: puntos ganados y errores que dieron el punto al rival. Eficacia de saque = (aces + positivos + devueltos sin ataque − errores − negativos) entre saques; de ataque = (puntos − errores − bloqueados) entre ataques. Recepción Pos. = perfectas y positivas; Perf. = perfectas. Blq = ataques bloqueados; Bloq. = bloqueos punto. El número pequeño es cuántas acciones hay detrás (atenuado si son menos de 3).</p>', 'ms-plsec');
    return h;
  }

  VB.MatchStats = {
    ingest: ingest, reset: reset, data: data, ready: ready, compute: compute, html: html,
    // (pruebas)
    _rallyActs: rallyActs, _zoneOf: zoneOf, CODES: CODES, ERR_LBL: ERR_LBL
  };
})();
