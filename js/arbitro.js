/* MAKE THE CUT — js/arbitro.js (owner: sim · Ambiente de Carrera, paquete P3; contrato en notes/ambiente.md §4.4 y §6)
 * El 1r árbitro ante las protestas (VB.Arbitro): detecta las decisiones discutibles de cada punto (bote al límite o mal pitado,
 * «tocado», red, antena, invasión, dobles, cuatro toques, falta de posición, challenge perdido), decide si la IA protesta, si se
 * ofrece la elección al jugador («Protestar» / «Dejarlo») y cómo responde el 1r: explicación, calma, amonestación verbal a través del
 * capitán, tarjeta amarilla (advertencia: sin punto), roja (castigo: punto y saque para el rival), expulsión (solo pista, casi
 * imposible; no en este sprint). Los colores de retraso (delayY / delayR) siguen en el contrato pero este árbitro no los pita: una
 * protesta repetida es mala conducta, no retraso. Escala FIVB 21.3 acumulativa por equipo y partido:
 * una amarilla por equipo; la siguiente mala conducta de cualquiera del equipo ya es roja. Nunca roja si el punto cerró set o partido.
 *
 * Puro: sin DOM, sin g.rng, sin Math.random, sin escribir en la partida. Azar = hash de (semilla, nº de decisión, sal): misma
 * partida + mismas elecciones → mismas decisiones. Lo usa VB.Ambiente (director, P1), que convierte el resultado en eventos amb:*.
 *
 * API:
 *   create(o) → st     o = { seed, hall, level:'low'|'mid'|'high'|'top', heat 0..1, mode:'full'|'calm', capt:[pid0,pid1] (-1 = no hay),
 *                            meTeam (0), mePid (tu atleta: nunca protesta solo) }
 *   feed(st, e, g) → null | D     con 'point' (lee g.call de ese mismo frame) o 'challengeResult'{overturned:false}.
 *        D = { id, team (el que la sufre), kind:'line'|'touch'|'net'|'antenna'|'under'|'fault'|'position'|'chal', strength 0..1, wrong,
 *              offer (ofrecer la elección al humano), auto:{pid, role}|null (protesta de la IA), canRed, sub (texto corto de contexto) }
 *   protest(st, D, who, human, canRed) → R = { res:'none'|'explain'|'calm'|'verbal'|'yellow'|'red'|'expel'|'delayY'|'delayR',
 *        card:{team,pid,num,name,who,color,reason}|null, penalty: -1 | equipo SANCIONADO (el punto va al otro) }
 *        who = { pid, role:'player'|'captain'|'coach', num, name } (o solo el pid)
 *   taunt(st, team, pid, heat, who) → R   (provocación «shh»: casi siempre 'none'; 15 % 'verbal'; rarísimo amarilla)
 *   undo(st)   cancela la disputa pendiente (punto anulado por challenge)
 *   state(st) → { verbal:[n0,n1], yellow:[bool,bool], red:[n0,n1], byPid:{pid:{y,r}}, delay:[0|1|2, 0|1|2], offers, protests }
 *   RATES (probabilidades; las calibra tools/arbitrotest.js), hash01.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var RATES = {
    near: 0.10,              // m: bote a esta distancia de la línea o menos = discutible
    floor: 0.35,             // fuerza mínima para que haya disputa
    str: { touch: 0.5, net: 0.4, antenna: 0.4, under: 0.4, fault: 0.35, position: 0.3, chal: 0.6 },
    wrongAdd: 0.3,           // decisión mal pitada de verdad
    // protesta automática = fuerza × (autoBase + autoHeat·heat) × nivel × (calm)
    autoBase: 0.25, autoHeat: 0.5, autoK: 1.25, calm: 0.5, cool: 6,
    autoTouch: 0.35,         // «tocado» (block-out): casi siempre se ve claro; la IA lo protesta mucho menos (medido con el circuito de la Carrera)
    level: { low: 1.1, mid: 1, high: 0.9, top: 0.8 },
    sev: { low: 0.8, mid: 1, high: 1.1, top: 1.25 },
    notCapt: 1.2, afterChal: 1.2, wrongK: 0.85,
    // quién protesta (pista): capitán / entrenador / otro
    who6: [0.7, 0.2, 0.1],
    // respuesta del 1r: [explain/calm, verbal, tarjeta] por estado del equipo
    clean: [0.55, 0.40, 0.05], withVerbal: [0.35, 0.12, 0.53], withYellow: [0.6, 0, 0.4], sameRed: [0.7, 0, 0.3],
    human: 7.0,              // el jugador que elige «Protestar» insiste a propósito: × esto la tarjeta en estado limpio
    humanV: 1.4,             // … y × esto con verbal previa
    expelHeat: 0.8,
    // elección del jugador
    // (crítica de juego: 2 por partido eran ~60 pausas iguales por temporada → como mucho 1, solo con bote ajustado o mal pitado, y no
    // siempre: offerP; ≈ 0,5-0,7 por partido)
    offerMax: 1, offerGap: 8, offerMin: 0.45, offerKinds: { line: 1, touch: 1 }, offerP: 0.7,
    again: 1.6,              // otra protesta del mismo equipo en el mismo punto: mala conducta reiterada (× severidad; no es «retraso»)
    // provocación
    tauntVerbal: 0.15, tauntYellow: 0.02
  };

  function hash01(a, b, c) {
    var h = Math.imul((a | 0) ^ 0x5bd1e995, 0x9E3779B1) ^ Math.imul((b | 0) + 0x27d4eb2d, 0x85EBCA77) ^ Math.imul((c | 0) + 0x165667b1, 0xC2B2AE3D);
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function rnd(st, salt) { st.k++; return hash01(st.seed, st.k, salt); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function create(o) {
    o = o || {};
    var lv = RATES.level[o.level] ? o.level : 'mid';
    return {
      seed: (o.seed | 0) ^ 0x41A2B, hall: !!o.hall, level: lv, heat: clamp01(+o.heat || 0), mode: o.mode === 'calm' ? 'calm' : 'full',
      capt: o.capt ? [o.capt[0] == null ? -1 : o.capt[0], o.capt[1] == null ? -1 : o.capt[1]] : [-1, -1],
      meTeam: o.meTeam === 1 ? 1 : 0, mePid: o.mePid == null ? -1 : o.mePid,
      k: 0, n: 0, did: 0, pend: null,
      verbal: [0, 0], yellow: [false, false], red: [0, 0], byPid: {}, delay: [0, 0],
      cool: [-99, -99], offers: 0, lastOffer: -99, protests: 0,
      ptTeam: [-1, -1]      // nº de punto de la última protesta de cada equipo (otra en el mismo punto: más severa, RATES.again)
    };
  }

  /** Tipo y fuerza de la disputa de un 'point' (o null). */
  function disputeOf(e, g) {
    if (!e || e.penalty || e.reason === 'penalty') return null;
    var r = e.reason, sig = e.signal, c = g && g.call;
    // nunca la falta de saque (8 s / 5 s en playa) ni el saque que no pasa
    if (r === 'serve' || sig === 'delay8' || sig === 'delay5' || sig === 'serveFault' || sig === 'netBall') return null;
    // «tocado» solo si lo que toca es el BLOQUEO (remate que roza las manos y se va fuera): la recepción de un ace o la defensa propia
    // que se va fuera no se discuten (crítica de juego del 18-nov: el 88 % de las disputas eran «tocado» sin sentido)
    if (sig === 'touched') return e.lastKind === 'block' ? { kind: 'touch', s: RATES.str.touch, wrong: false, dist: -1 } : null;
    if ((r === 'in' || r === 'out') && c && c.t === e.t) {
      var d = Math.abs(+c.dist || 0);
      if (d <= RATES.near || c.wrong) {
        var s = 0.5 + 0.5 * clamp01(1 - d / RATES.near) + (c.wrong ? RATES.wrongAdd : 0);
        return { kind: 'line', s: Math.min(1, s), wrong: !!c.wrong, dist: d, calledIn: !!c.calledIn };
      }
      return null;
    }
    if (r === 'net') return { kind: 'net', s: RATES.str.net, wrong: false, dist: -1 };
    if (r === 'antenna') return { kind: 'antenna', s: RATES.str.antenna, wrong: false, dist: -1 };
    if (r === 'under') return { kind: 'under', s: RATES.str.under, wrong: false, dist: -1 };
    if (r === 'double' || r === 'four') return { kind: 'fault', s: RATES.str.fault, wrong: false, dist: -1 };
    if (r === 'position') return { kind: 'position', s: RATES.str.position, wrong: false, dist: -1 };
    return null;
  }
  var SUB = { line: ['Balón dentro, dicen', 'Balón fuera, dicen'], touch: 'Tocado, dice el 1r', net: 'Red, dice el 1r', antenna: 'Antena, dice el 1r',
    under: 'Invasión, dice el 1r', fault: 'Falta de toque, dice el 1r', position: 'Falta de posición', chal: 'Challenge perdido' };

  /** ¿El punto de castigo contra team cerraría el set? (§1: nunca se cierra un set con un castigo; como Sim.canPenalty) */
  function closesSet(g, team) {
    if (!g || !g.score || !VB.Sim || !VB.Sim.setTarget) return false;
    var w = 1 - team, tgt = VB.Sim.setTarget(g); return g.score[w] + 1 >= tgt && g.score[w] + 1 - g.score[team] >= 2;
  }
  function teamPlayers(g, t) { var a = [], P = g && g.players ? g.players : []; for (var i = 0; i < P.length; i++) if (P[i].team === t) a.push(P[i]); return a; }

  /** ¿Quién de la IA protesta? (o null) */
  function autoWho(st, D, e, g) {
    var t = D.team, mine = t === st.meTeam, u = rnd(st, 0xA11), P = teamPlayers(g, t), i, cand = [];
    for (i = 0; i < P.length; i++) if (!(mine && P[i].id === st.mePid)) cand.push(P[i]);
    if (st.hall) {
      var cp = st.capt[t];
      if (mine && cp === st.mePid) cp = -1;                 // si el capitán eres tú, no hablas solo: entrenador u otro
      if (u < RATES.who6[0] && cp >= 0) return { pid: cp, role: 'captain' };
      if (u < RATES.who6[0] + RATES.who6[1] || !cand.length) return { pid: -1, role: 'coach' };
      var o = cand[Math.floor(rnd(st, 0xA12) * cand.length) % cand.length];
      return { pid: o.id, role: o.id === st.capt[t] ? 'captain' : 'player' };
    }
    // playa: el que perdió el punto (o su pareja); nunca tu atleta
    var fp = e && e.faultPlayer && e.faultPlayer.team === t ? e.faultPlayer : null;
    if (fp && !(mine && fp.id === st.mePid) && u < 0.7) return { pid: fp.id, role: 'player' };
    if (!cand.length) return null;
    return { pid: cand[Math.floor(rnd(st, 0xA13) * cand.length) % cand.length].id, role: 'player' };
  }

  function feed(st, e, g) {
    if (!st || !e) return null;
    var dsp = null, team, canRed;
    if (e.type === 'point') {
      if (e.penalty) return null;
      st.n++;
      dsp = disputeOf(e, g);
      if (!dsp) { st.pend = null; return null; }
      team = 1 - e.team; canRed = !e.setWon && !e.matchWon && !closesSet(g, team);
    } else if (e.type === 'challengeResult') {
      if (e.overturned) { st.pend = null; return null; }
      dsp = { kind: 'chal', s: RATES.str.chal, wrong: false, dist: -1 }; team = e.team;
      canRed = !(g && (g.pendingSet || g.mode === 'over' || g.finished)) && !closesSet(g, team);
    } else return null;
    if (dsp.s < RATES.floor) return null;
    var D = { id: ++st.did, team: team, kind: dsp.kind, strength: dsp.s, wrong: dsp.wrong, offer: false, auto: null, canRed: canRed,
      n: st.n, calledIn: !!dsp.calledIn, sub: dsp.kind === 'line' ? SUB.line[dsp.calledIn ? 0 : 1] : SUB[dsp.kind] };
    // protesta automática (no con challenge que pedir: ahí lo realista es pedirlo). Va antes que la elección: si salta alguien de tu
    // equipo (compañero/a, capitán, entrenador), ya ha protestado otro y no se te pregunta
    var mine = team === st.meTeam, chalLeft = false;
    if (g && VB.Sim && VB.Sim.canChallenge && dsp.kind === 'line') chalLeft = VB.Sim.canChallenge(g, team) > 0;
    if (!chalLeft && st.n - st.cool[team] >= RATES.cool) {
      var p = dsp.s * (RATES.autoBase + RATES.autoHeat * st.heat) * RATES.autoK * RATES.level[st.level] * (st.mode === 'calm' ? RATES.calm : 1) * (dsp.kind === 'touch' ? RATES.autoTouch : 1);
      if (rnd(st, 0xA10) < p) { D.auto = autoWho(st, D, e, g); if (D.auto) st.cool[team] = st.n; }
    }
    // elección del jugador: su equipo la sufre, nadie ha saltado antes, «Completo», ≤ 2 por partido separadas 8+ puntos, sin challenge
    if (mine && !D.auto && st.mode === 'full' && !(g && g.ctrlOut) && !chalLeft && st.offers < RATES.offerMax && st.n - st.lastOffer >= RATES.offerGap &&
        dsp.s >= RATES.offerMin && RATES.offerKinds[dsp.kind] && rnd(st, 0xA14) < RATES.offerP) {
      D.offer = true; st.offers++; st.lastOffer = st.n;
    }
    st.pend = D;
    return D;
  }

  function mkCard(st, team, who, color, reason) {
    var role = who.role || 'player';
    return { team: team, pid: who.pid == null ? -1 : who.pid, num: who.num == null ? 0 : who.num, name: who.name || '',
      who: color === 'delayY' || color === 'delayR' ? 'team' : role === 'coach' ? 'coach' : 'player', color: color, reason: reason };
  }
  function pick3(u, a) { var s = a[0] + a[1] + a[2]; u *= s; return u < a[0] ? 0 : u < a[0] + a[1] ? 1 : 2; }
  function scaled(row, k) { var c = Math.min(0.95, row[2] * k), rest = row[0] + row[1], f = rest > 0 ? (1 - c) / rest : 0; return [row[0] * f, row[1] * f, c]; }

  /** Respuesta del 1r a una protesta. */
  function protest(st, D, who, human, canRed) {
    var R = { res: 'none', card: null, penalty: -1 };
    if (!st || !D) return R;
    if (typeof who === 'number') who = { pid: who };
    who = who || { pid: -1, role: 'coach' };
    var t = D.team, role = who.role || (who.pid === -1 ? 'coach' : 'player'), pid = who.pid == null ? -1 : who.pid;
    if (role === 'player' && st.hall && pid >= 0 && pid === st.capt[t]) role = 'captain';
    who.role = role;
    if (canRed == null) canRed = D.canRed !== false;
    st.protests++;
    // otra protesta del mismo equipo en el mismo punto: mala conducta reiterada (FIVB 21.2), más severa. El retraso (21.4/16) castiga
    // demorar el juego, no protestar: este árbitro no lo pita (los colores delayY / delayR siguen en el contrato, sin uso)
    var again = st.ptTeam[t] === D.n && D.n > 0;
    st.ptTeam[t] = D.n;
    var sev = RATES.sev[st.level] * (again ? RATES.again : 1);
    if (st.hall && role === 'player') sev *= RATES.notCapt;
    if (role === 'coach') sev *= RATES.notCapt;           // el entrenador no puede protestar decisiones
    if (D.kind === 'chal') sev *= RATES.afterChal;
    if (D.wrong) sev *= RATES.wrongK;
    var bp = st.byPid[pid] || null, u = rnd(st, 0xB0 + (human ? 1 : 0)), u2 = rnd(st, 0xB2), k;
    if (bp && bp.r > 0) {                                   // ya con roja el mismo participante: la siguiente sería expulsión (FIVB 21.4.2)
      // Expulsión / descalificación: NO en este sprint (obligan a un cambio que la sim no hace y el acta de emPat la rechazaría
      // sin él). El 1r se queda en «calma» o en verbal: nunca otra roja a la misma persona (la escala no lo permite)
      k = pick3(u, RATES.sameRed);
      R.res = k === 2 ? 'verbal' : 'calm';
    } else if (st.yellow[t]) {                              // el equipo ya tiene amarilla: siguiente = roja
      k = pick3(u, scaled(RATES.withYellow, sev));
      R.res = k === 2 && canRed ? 'red' : 'verbal';
    } else if (st.verbal[t] > 0) {
      k = pick3(u, scaled(RATES.withVerbal, sev * (human ? RATES.humanV : 1)));
      R.res = k === 2 ? 'yellow' : k === 1 ? 'verbal' : (u2 < 0.5 ? 'explain' : 'calm');
    } else {
      k = pick3(u, scaled(RATES.clean, sev * (human ? RATES.human : 1)));
      R.res = k === 2 ? 'yellow' : k === 1 ? 'verbal' : (u2 < 0.6 ? 'explain' : 'calm');
    }
    applyRes(st, t, pid, who, R, 'protesta');
    return R;
  }
  function applyRes(st, t, pid, who, R, reason) {
    var bp;
    if (R.res === 'verbal') st.verbal[t]++;
    else if (R.res === 'yellow') { st.yellow[t] = true; bp = st.byPid[pid] = st.byPid[pid] || { y: 0, r: 0 }; bp.y++; R.card = mkCard(st, t, who, 'yellow', reason); }
    else if (R.res === 'red' || R.res === 'expel') {
      st.red[t]++; st.yellow[t] = true; bp = st.byPid[pid] = st.byPid[pid] || { y: 0, r: 0 }; bp.r++;
      R.card = mkCard(st, t, who, R.res, reason); R.penalty = R.res === 'red' ? t : -1;   // la expulsión no da punto (el jugador sale)
    }
  }

  /** Provocación («shh», celebración de cara al rival): el 1r casi siempre la deja pasar. */
  function taunt(st, team, pid, heat, who) {
    var R = { res: 'none', card: null, penalty: -1 };
    if (!st || (team !== 0 && team !== 1)) return R;
    who = who || { pid: pid == null ? -1 : pid, role: 'player' };
    var u = rnd(st, 0xC0), h = heat == null ? st.heat : heat;
    var pv = RATES.tauntVerbal * (0.5 + h), py = st.verbal[team] > 0 && !st.yellow[team] ? RATES.tauntYellow : 0;
    if (u < py) R.res = 'yellow'; else if (u < py + pv) R.res = 'verbal';
    applyRes(st, team, who.pid, who, R, 'provocacion');
    return R;
  }

  function undo(st) { if (st) st.pend = null; }
  function state(st) {
    return { verbal: st.verbal.slice(), yellow: st.yellow.slice(), red: st.red.slice(), byPid: st.byPid, delay: st.delay.slice(),
      offers: st.offers, protests: st.protests };
  }

  VB.Arbitro = { create: create, feed: feed, protest: protest, taunt: taunt, undo: undo, state: state, RATES: RATES, hash01: hash01, _disputeOf: disputeOf };
})();
