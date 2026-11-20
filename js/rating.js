/* MAKE THE CUT — js/rating.js (owner: carrera)
 * Nota en directo de los partidos JUGADOS de la Carrera (VB.Rating), al estilo de EA SPORTS FC: empieza en 6,0, sube con lo bueno
 * que hace tu jugador, baja con lo malo y, muy poco a poco, sin participar. La nota final del partido es esta nota (career.js la usa
 * en lugar de rating() cuando este fichero está cargado). Diseño en notes/nota-en-directo-spec.md; calibrado en tools/ratingtest.js.
 *
 * Puro: sin DOM, sin g.rng, sin Date ni Math.random, sin escribir en la partida. Solo lee eventos de la sim (hit, block, point, set,
 * match, newSet, sub, lineup). Misma lista de eventos → mismo estado (la huella de la sim no se mueve).
 *
 *   nota = soft(6,0 + raw) + objetivos de la prueba            (se ve con un decimal)
 *   raw  = Σ tus acciones (W[acc] × K)                          (ACTS: lo que haces)
 *        + Σ puntos con tu jugador en pista (± TEAM_PT / E)     (cómo va el equipo; sin aviso)
 *        + sets y partido (RES, con aviso)
 *        − OFFSET / E por punto jugado en pista                 (deriva «sin balón»; sin aviso)
 *   K = 40 / E × KAPPA (KAPPA_TRIAL en la prueba) × rol          (rol = 1 en la playa; RATE6 del puesto en la pista)
 *   E = puntos esperados del partido (E_TABLE, medidos con los bots; o de lo que queda al entrar desde el banquillo)
 *
 * API: create(o) → st; feed(st, e, who) por evento (who(jugador) → 0 tu jugador | 1 compañero o resto del equipo | −1 rival);
 * bonus(st, id, d, txt) (objetivos de la prueba); setOn(st, on, jugados) (feed ya lo hace con sub/lineup: es idempotente);
 * close(st, res) final idempotente → { nota, base, raw, best, worst, acts }; undo(st) (punto anulado por challenge: vuelve a como
 * estaba antes del último 'point'); value(st); soft(x); fmt(d).
 * Registro de avisos st.log (las últimas 8): { seq, kind: 'play'|'set'|'match'|'goal', id, txt, d (a 0,1), v (nota tras el aviso) }.
 * Un aviso por punto (no por toque): la acción con más peso de la jugada y lo que mueve lo tuyo en ella (ya con el techo y el suelo
 * suaves: por encima de 8,5 un ace mueve menos, y el aviso dice lo que se mueve de verdad).
 * Participación parcial (pista con cambios): si te cambian y no juegas todos los puntos que podías, al cerrar la parte de acciones
 * se reescala por (puntos que podías jugar) / max(24, puntos jugados), como normalizaba rating() con meR.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ tabla de acciones (§3.2 de la especificación)
  // Pesos base = los de RATE_W de rating() (career.js), separados por tipo. toast: sale en el aviso de la jugada (con peso 0, no).
  // «Te bloquean» y «Recepción fallida» restan algo que rating() no contaba: el calibrado (abajo) dejó «Te bloquean» a 0 (con peso
  // movía la distribución sin mejorarla) y «Recepción fallida» en −0,03.
  var ACTS = {
    ace: { txt: 'Ace', w: 0.2, toast: true },
    kill: { txt: 'Remate ganado', w: 0.055, toast: true },
    tip: { txt: 'Dejada ganada', w: 0.055, toast: true },
    block: { txt: 'Bloqueo punto', w: 0.2, toast: true },
    assist: { txt: 'Asistencia', w: 0.045, toast: true },
    dig: { txt: 'Defensa', w: 0.035, toast: true },
    recvP: { txt: 'Recepción perfecta', w: 0.03, toast: true },
    perfect: { txt: 'Toque perfecto', w: 0.02, toast: false },
    poor: { txt: 'Toque flojo', w: -0.015, toast: false },
    srvErr: { txt: 'Error de saque', w: -0.17, toast: true },
    atkErr: { txt: 'Remate fuera', w: -0.17, toast: true },
    net: { txt: 'Toque de red', w: -0.17, toast: true },
    dbl: { txt: 'Dobles', w: -0.17, toast: true },
    four: { txt: 'Cuatro toques', w: -0.17, toast: true },
    pos: { txt: 'Falta de posición', w: -0.17, toast: true },
    err: { txt: 'Error', w: -0.17, toast: true },
    blocked: { txt: 'Te bloquean', w: 0, toast: true },
    recvErr: { txt: 'Recepción fallida', w: -0.03, toast: true }
  };
  var RATE6 = { OH: 3.0, OPP: 2.8, MB: 3.4, S: 2.0, L: 4.0 };   // (copia de RATE6 de career.js; career.js pasa o.rol)

  // ------------------------------------------------------------------ calibrado
  // Medido el 16-nov-2026 con tools/ratingtest.js (RATINGTEST_CAL=1): 360 partidos enteros con los bots novato, medio y bueno de
  // simtest (24 por casilla): playa Regional T1 (21/21/15, media 35 y pareja +3 contra clubes 28/34/40 en Fácil), pista de receptor
  // contra Normal a 25 y a 15, y la prueba (1 set a 15) en playa y en pista. Se compara, partido a partido, con la nota de hoy
  // (ingest + rating() / trialGrade) y se elige en rejilla (KAPPA 0,7-1,3, OFFSET 0,2-0,8, TEAM_PT 0,4-2,0, 7 parejas de RES, pesos de
  // las dos acciones nuevas 0/0,03/0,06/0,1; luego KAPPA_TRIAL y RES de la prueba) lo que cumple las tolerancias con menos error:
  //   media hoy → en directo: playa novato 6,12 → 6,06, medio 8,10 → 8,15, bueno 9,16 → 9,04; pista a 25 novato 6,91 → 7,01, medio
  //   8,87 → 8,85, bueno 9,50 → 9,46; a 15 6,73 → 6,75, 8,87 → 8,87, 9,38 → 9,34; prueba playa 6,31 → 6,36, 8,71 → 8,68, 9,47 → 9,38;
  //   prueba pista 7,07 → 7,17, 9,23 → 9,30, 9,72 → 9,72. Desviación entre ×0,85 y ×1,15, p10/p90 a ±0,3, Spearman 0,86-0,99, ningún
  //   10 fuera de la prueba (en la prueba, los objetivos van fuera del techo, como hoy: bueno en pista 15 → 16 de 24) y letras del
  //   bot medio a ±5 puntos (playa A+ 75 → 79 %, A 25 → 21 %; pista A+ 92 → 96 %; aprobado igual).
  // (Los valores de partida de la especificación, OFFSET 0,6 y TEAM_PT 1,6, dejaban al novato de playa 0,3 por debajo y al bueno con
  // la nota demasiado apretada: el equipo pesa menos y los sets algo más.)
  var P0 = {
    START: 6.0, OFFSET: 0.5, TEAM_PT: 0.6, KAPPA: 1.05, KAPPA_TRIAL: 1.0,
    RES: { match: { setW: 0.25, setL: -0.15, winW: 0.2, winL: -0.1 }, trial: { setW: 0.35, setL: -0.05, winW: 0.35, winL: -0.1 } },
    W: {}   // pesos que cambian sobre ACTS (id → w)
  };
  // puntos esperados por formato (playa b<puntos>, pista h<puntos>, prueba a un set tb / th): media de puntos jugados con los bots
  // (misma medida; h21, entre h15 y h25)
  var E_TABLE = { b21: 65, h25: 87, h21: 70, h15: 53, tb: 22, th: 25 };
  var LOG_MAX = 8;

  function round1(v) { return Math.round(v * 10) / 10; }
  function round2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /** Techo suave por encima de 8,5 (el de rating()) y suelo suave por debajo de 3; 0-10. */
  function soft(x) {
    if (x > 8.5) x = 8.5 + 1.5 * (1 - Math.exp(-(x - 8.5) / 1.5));
    else if (x < 3) x = 3 - 1.5 * (1 - Math.exp(-(3 - x) / 1.5));
    return clamp(x, 0, 10);
  }
  /** Cifra de un aviso: '+0,3', '−0,2' (signo menos de verdad); '' si redondea a 0,0. */
  function fmt(d) {
    var r = round1(+d || 0); if (!r) return '';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1).replace('.', ',');
  }
  /** Clave de E_TABLE del formato o = { hall, points, toWin, trial }. */
  function eKey(o) { o = o || {}; return o.trial || o.toWin === 1 ? (o.hall ? 'th' : 'tb') : (o.hall ? 'h' : 'b') + (o.points || (o.hall ? 25 : 21)); }
  /** Puntos esperados del partido: E_TABLE; si el formato no está, ≈ 1,75 × puntos por set × sets esperados (mínimo 24). */
  function E(o) {
    o = o || {};
    var k = eKey(o); if (E_TABLE[k]) return E_TABLE[k];
    var p = o.points || 25, tw = o.trial ? 1 : o.toWin || 2;
    var e = tw === 1 ? 1.75 * p : tw === 2 ? 1.75 * (2 * p + 0.4 * Math.min(15, p)) : 1.75 * (3 * p + 0.5 * p + 0.3 * Math.min(15, p));
    return Math.max(24, Math.round(e));
  }
  function params(o) {
    var q = o && o.P, P = { START: P0.START, OFFSET: P0.OFFSET, TEAM_PT: P0.TEAM_PT, KAPPA: P0.KAPPA, KAPPA_TRIAL: P0.KAPPA_TRIAL, RES: P0.RES, W: {} };
    var id; for (id in ACTS) P.W[id] = ACTS[id].w;
    for (id in P0.W) P.W[id] = P0.W[id];
    if (q) {
      ['START', 'OFFSET', 'TEAM_PT', 'KAPPA', 'KAPPA_TRIAL'].forEach(function (k) { if (typeof q[k] === 'number') P[k] = q[k]; });
      if (q.RES) P.RES = { match: q.RES.match || P0.RES.match, trial: q.RES.trial || P0.RES.trial };
      if (q.W) for (id in q.W) P.W[id] = q.W[id];
    }
    return P;
  }
  function scale(st, e) {
    st.E = e; st.K = 40 / e * (st.trial ? st.P.KAPPA_TRIAL : st.P.KAPPA) * st.rol;
    st._t.team = st.P.TEAM_PT / e; st._t.drift = st.P.OFFSET / e;
  }

  /** Estado nuevo. o = { hall, pos, rol (multiplicador del puesto; por defecto RATE6[pos] en la pista), points, toWin, trial, on,
   *  E (opcional), P (opcional: parámetros del calibrado) }. */
  function create(o) {
    o = o || {};
    var P = params(o), on = o.on !== false;
    var st = { v: P.START, raw: 0, bon: 0, K: 0, E: 0, on: on, meR: 0, rallies: 0, seq: 0, log: [], acts: {}, done: false, out: null,
      trial: !!(o.trial || o.toWin === 1), hall: !!o.hall, rol: 1, P: P,
      _u: null, part: 1, san: 0, sanLog: [],
      _t: { team: 0, drift: 0, ever: on, e0: 0, inSet: on, sets: 0, matched: false, play: 0, top: '', topA: 0, any: false,
        last0: -1, lastTeam: -1, server: -1, setter: -1, cand: -1, blocker: -1, prevKind: '', prevTeam: -1, myKind: '', myShot: '', atk0: -1, recv0: -1 } };
    st.rol = typeof o.rol === 'number' && o.rol > 0 ? o.rol : st.hall ? RATE6[o.pos] || RATE6.OH : 1;
    scale(st, typeof o.E === 'number' && o.E > 0 ? o.E : E(o));
    return st;
  }
  function value(st) { return round1(Math.min(10, soft(st.P.START + st.raw) + st.bon)); }
  /** Lo que mueve de verdad en la nota (sin redondear) una suma d que ya está en st.raw: con el techo y el suelo suaves. */
  function eff(st, d) { var x = st.P.START + st.raw; return soft(x) - soft(x - d); }
  function push(st, kind, id, txt, d) {
    st.v = value(st); st.seq++;
    st.log.push({ seq: st.seq, kind: kind, id: id, txt: txt, d: round1(d), v: st.v });
    if (st.log.length > LOG_MAX) st.log.shift();
  }
  // una acción tuya: suma W × K y la apunta en la jugada en curso (el aviso sale al llegar el punto)
  function act(st, id) {
    if (!st.on || st.done) return;
    var w = st.P.W[id]; if (w == null) return;
    var d = w * st.K, a = st.acts[id] || (st.acts[id] = { n: 0, d: 0 }), t = st._t;
    a.n++; a.d += d; st.raw += d; t.play += d;
    if (ACTS[id] && ACTS[id].toast && w !== 0) { t.any = true; if (Math.abs(d) > t.topA) { t.topA = Math.abs(d); t.top = id; } }
  }
  function res(st, kind, win) {
    var R = st.trial ? st.P.RES.trial : st.P.RES.match;
    var d = kind === 'set' ? (win ? R.setW : R.setL) : (win ? R.winW : R.winL);
    st.raw += d;
    if (d) push(st, kind, kind + (win ? 'W' : 'L'), kind === 'set' ? (win ? 'Set ganado' : 'Set perdido') : (win ? 'Victoria' : 'Derrota'), eff(st, d));
    else st.v = value(st);
  }
  /** Entrar (on) o salir de pista. Al entrar por primera vez desde el banquillo, K, la deriva y el equipo se reescalan con los
   *  puntos que quedan (Eleft = max(24, E − jugados)): una salida de 30 puntos pesa como una de 30 con rating(). Idempotente. */
  function setOn(st, on, played) {
    on = !!on; if (on === st.on) return;
    var t = st._t; st.on = on;
    if (on) { if (!t.ever && (played | 0) > 0) { scale(st, Math.max(24, st.E - (played | 0))); t.e0 = played | 0; } t.ever = true; t.inSet = true; }
  }
  // instantánea de antes de un 'point' (para undo): lo que el punto, su set y su partido cambian. No guarda en pista / reescalado
  // (on, ever, e0, E, K, equipo y deriva): un cambio entre el punto y el challenge no se deshace en la sim.
  function snap(st) {
    var a = {}, id; for (id in st.acts) a[id] = { n: st.acts[id].n, d: st.acts[id].d };
    var t = {}; for (id in st._t) t[id] = st._t[id];
    var gl = null; if (st.gl) { gl = {}; for (id in st.gl) gl[id] = st.gl[id]; }
    return { raw: st.raw, bon: st.bon, rallies: st.rallies, meR: st.meR, acts: a, t: t, log: st.log.slice(), gl: gl, san: st.san || 0 };
  }
  /** Punto anulado por challenge (sim, endReview: en el mismo paso vuelve a pitar el punto y emite 'challengeResult' con overturned).
   *  Antes de pasarle ese 'point' repetido: vuelve a como estaba antes del punto anulado (y de su set y su partido). seq sigue
   *  creciendo (los avisos del punto bueno salen como nuevos). Devuelve true si había algo que deshacer. */
  function undo(st) {
    var u = st && st._u; if (!u || st.done) return false;
    var t = st._t, keep = { team: t.team, drift: t.drift, ever: t.ever, e0: t.e0 }, id;
    st.raw = u.raw; st.bon = u.bon; st.rallies = u.rallies; st.meR = u.meR; st.acts = u.acts; st.log = u.log;
    for (id in u.t) t[id] = u.t[id];
    for (id in keep) t[id] = keep[id];
    if (u.gl && st.gl) { for (id in st.gl) if (!u.gl[id]) delete st.gl[id]; }
    // las tarjetas (sanction) NO las deshace el challenge: se vuelven a sumar con su aviso
    if (st.san && st.san !== u.san) {
      st.raw += st.san - (u.san || 0);
      for (var si = 0; si < st.sanLog.length; si++) if (st.log.indexOf(st.sanLog[si]) < 0) { st.log.push(st.sanLog[si]); if (st.log.length > LOG_MAX) st.log.shift(); }
    }
    st._u = null; st.v = value(st);
    return true;
  }
  function endRally(t) { t.last0 = -1; t.lastTeam = -1; t.server = -1; t.setter = -1; t.cand = -1; t.blocker = -1; t.prevKind = ''; t.prevTeam = -1; t.myKind = ''; t.myShot = ''; t.atk0 = -1; t.recv0 = -1; }
  var FAULT = { serve: 'srvErr', net: 'net', double: 'dbl', four: 'four', position: 'pos', backBlock: 'pos', block: 'pos', attackServe: 'pos' };
  function errOf(t) { return t.myKind === 'serve' ? 'srvErr' : t.myKind === 'spike' || t.myShot === 'tip' ? 'atkErr' : 'err'; }

  /** Un evento de la sim. who(jugador) → 0 | 1 | −1. Devuelve cuántas entradas nuevas hay en st.log (0 casi siempre). */
  function feed(st, e, who) {
    if (!st || !e || st.done) return 0;
    var t = st._t, s0 = st.seq, s;
    var W = function (pl) { if (pl == null) return -1; var r = who ? who(pl) : pl; return r === 0 || r === 1 ? r : -1; };
    switch (e.type) {
      case 'hit':
        if (e.team === 0) {
          s = W(e.player); t.last0 = s; t.lastTeam = 0;
          if (s === 0) { t.myKind = e.kind; t.myShot = e.shot || ''; if (e.human) { if (e.grade === 'perfect') act(st, 'perfect'); else if (e.grade === 'poor') act(st, 'poor'); } }
          if (e.kind === 'serve') { t.server = s; t.setter = -1; t.cand = -1; t.blocker = -1; }
          else if (s >= 0) {
            var recv = e.recv != null ? !!e.recv : (e.touch === 1 && t.prevKind === 'serve' && t.prevTeam === 1);
            var dig = e.dig != null ? !!e.dig : (e.touch === 1 && t.prevKind === 'spike' && t.prevTeam === 1 && e.shot !== 'shank');
            if (recv && t.recv0 < 0) t.recv0 = s;
            if (s === 0 && recv && e.grade === 'perfect') act(st, 'recvP');
            if (s === 0 && dig) act(st, 'dig');
            if (e.touch === 1) { t.setter = -1; t.cand = -1; }
            if (e.touch === 2 && e.kind !== 'spike') t.setter = s;
            if (e.kind === 'spike') { t.cand = e.touch === 3 && t.setter >= 0 && t.setter !== s ? t.setter : -1; t.atk0 = s; }
          }
        } else { t.lastTeam = 1; if (e.kind === 'serve') { t.server = -1; t.setter = -1; t.cand = -1; t.blocker = -1; } }
        t.prevKind = e.kind; t.prevTeam = e.team;
        break;
      case 'block':
        if (e.team === 0) t.blocker = W(e.player);
        t.prevKind = 'block'; t.prevTeam = e.team;
        break;
      case 'sub': case 'lineup':
        if (e.meIn) setOn(st, true, st.rallies);
        if (e.meOut) { setOn(st, false, st.rallies); if (e.type === 'lineup') t.inSet = false; }   // (al empezar el set: no lo juegas)
        break;
      case 'newSet':
        t.inSet = st.on;
        break;
      case 'point':
        if (e.penalty) { endRally(t); t.play = 0; t.top = ''; t.topA = 0; t.any = false; break; } // punto de castigo (Ambiente): sin acciones ni equipo
        st._u = snap(st);
        st.rallies++;
        if (e.team === 0) {
          if ((e.how === 'kill' || e.how === 'tip') && t.last0 >= 0) {
            if (t.last0 === 0) act(st, e.how === 'tip' ? 'tip' : 'kill');
            var as = e.assist !== undefined ? W(e.assist) : t.cand;
            if (as === 0 && t.last0 !== 0) act(st, 'assist');
          } else if (e.how === 'ace' && t.server === 0) act(st, 'ace');
          else if (e.how === 'block' && t.blocker === 0) act(st, 'block');
        } else {
          var fp = W(e.player);
          if (fp === 0) act(st, FAULT[e.reason] || errOf(t));
          else if (fp < 0 && e.how === 'error' && t.lastTeam === 0 && t.last0 === 0) act(st, errOf(t));
          else if (e.how === 'block' && t.atk0 === 0) act(st, 'blocked');
          else if (e.how === 'ace' && t.recv0 === 0) act(st, 'recvErr');
        }
        var dp = t.any ? eff(st, t.play) : 0;   // (lo que mueve lo tuyo, antes del equipo y la deriva)
        if (st.on) { st.meR++; st.raw += (e.team === 0 ? t.team : -t.team) - t.drift; }
        if (t.any) push(st, 'play', t.top, ACTS[t.top].txt, dp); else st.v = value(st);
        t.play = 0; t.top = ''; t.topA = 0; t.any = false;
        endRally(t);
        break;
      case 'set':
        t.sets++;
        if (t.inSet) res(st, 'set', e.team === 0);
        t.inSet = st.on;
        break;
      case 'match':
        if (!t.matched) { t.matched = true; if (t.ever) res(st, 'match', e.team === 0); }
        break;
    }
    return st.seq - s0;
  }
  /** Suma fuera de la tabla (objetivos de la prueba) con su aviso. Va fuera del techo suave (como TRIAL_GOAL con rating()). */
  function bonus(st, id, d, txt) {
    if (!st || st.done || !d) return 0;
    st.bon += d; push(st, 'goal', id || 'goal', txt || '', d);
    return 1;
  }
  /** Suma DENTRO de la nota (con el techo y el suelo suaves) con su aviso: consignas del entrenador cumplidas (js/consignas.js).
   *  Va en st.raw, así que el challenge (undo) la deshace con el punto. */
  function extra(st, id, d, txt) {
    if (!st || st.done || !d || !st.on) return 0;
    st.raw += d; push(st, 'coach', id || 'coach', txt || '', eff(st, d));
    return 1;
  }
  /** Tarjeta a tu jugador (Ambiente de Carrera, P3): amarilla −0,15, roja / expulsión −0,35 DENTRO de la nota (techo y suelo suaves)
   *  con aviso «Tarjeta amarilla» / «Tarjeta roja». A diferencia de extra(), el challenge no la deshace. color: 'yellow'|'red'|'expel'|'dq'
   *  (las de retraso son del equipo: no restan). Devuelve 1 si ha restado. */
  var SANCTION = { yellow: -0.15, red: -0.35, expel: -0.35, dq: -0.35 };
  function sanction(st, color, txt) {
    var d = SANCTION[color];
    if (!st || st.done || !d) return 0;
    st.raw += d; st.san = (st.san || 0) + d;
    push(st, 'card', 'card_' + color, txt || (color === 'yellow' ? 'Tarjeta amarilla' : 'Tarjeta roja'), eff(st, d));
    (st.sanLog || (st.sanLog = [])).push(st.log[st.log.length - 1]);
    return 1;
  }
  function list(st, sign) {
    var out = [];
    for (var id in st.acts) { var a = st.acts[id]; if (sign > 0 ? a.d > 0.0005 : a.d < -0.0005) out.push({ id: id, txt: ACTS[id] ? ACTS[id].txt : id, n: a.n, d: round2(a.d) }); }
    out.sort(function (a, b) { return sign > 0 ? b.d - a.d : a.d - b.d; });
    return out.slice(0, 5);
  }
  /** Final del partido (idempotente). res = { sets: [tú, rival], setScores }: aplica los sets y el partido que no llegaron por
   *  eventos (pruebas con eventos falsos, partidos cortados). → { nota, base (sin objetivos), raw, best, worst, acts }. */
  function close(st, r) {
    if (!st) return null;
    if (st.done && st.out) return st.out;
    var t = st._t;
    // participación parcial: te cambiaron y no jugaste todos los puntos que podías (desde el principio o desde que entraste)
    var can = st.rallies - t.e0, f = st.meR > 0 && st.meR < can ? Math.max(1, can / Math.max(24, st.meR)) : 1;
    if (f > 1) { var sa = 0; for (var k in st.acts) { sa += st.acts[k].d; st.acts[k].d *= f; } st.raw += sa * (f - 1); }
    st.part = f;
    if (r && r.sets && t.ever) {
      var sc = r.setScores || [];
      if (sc.length) { for (var j = t.sets; j < sc.length; j++) res(st, 'set', (sc[j][0] | 0) > (sc[j][1] | 0)); }
      else if (!t.sets) { for (var a = 0; a < (r.sets[0] | 0); a++) res(st, 'set', true); for (var b = 0; b < (r.sets[1] | 0); b++) res(st, 'set', false); }
      if (!t.matched) res(st, 'match', (r.sets[0] | 0) > (r.sets[1] | 0));
    }
    t.matched = true; st.v = value(st); st.done = true;
    var acts = {}; for (var id in st.acts) acts[id] = { n: st.acts[id].n, d: round2(st.acts[id].d) };
    st.out = { nota: st.v, base: round1(soft(st.P.START + st.raw)), raw: round2(st.raw), best: list(st, 1), worst: list(st, -1), acts: acts };
    return st.out;
  }

  VB.Rating = {
    START: P0.START, OFFSET: P0.OFFSET, TEAM_PT: P0.TEAM_PT, KAPPA: P0.KAPPA, KAPPA_TRIAL: P0.KAPPA_TRIAL, RES: P0.RES, E_TABLE: E_TABLE,
    ACTS: ACTS, RATE6: RATE6, LOG_MAX: LOG_MAX, P0: P0,
    E: E, eKey: eKey, create: create, feed: feed, bonus: bonus, extra: extra, sanction: sanction, SANCTION: SANCTION, setOn: setOn, close: close, undo: undo, value: value, soft: soft, fmt: fmt
  };
})();
