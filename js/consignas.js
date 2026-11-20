/* MAKE THE CUT — js/consignas.js (owner: carrera)
 * Consignas del entrenador en directo (VB.Consignas) para los partidos JUGADOS de la Carrera. Al empezar algunos puntos (serveReady)
 * el entrenador da una indicación según el formato, tu puesto y quién saca («Saca a la zona 1», «Remata la primera en diagonal»,
 * «Juega la primera con el central», «Bloquea la línea»…). Si la cumples, la nota en directo sube un poco (career.js llama a
 * VB.Rating.extra al llegar el punto). Si no te llega la ocasión (remata tu compañero, no bloqueas…) la consigna caduca sin más.
 *
 * Puro: sin DOM, sin g.rng, sin Date ni Math.random, sin escribir en la partida (la huella de la sim no se mueve). El azar es un
 * hash de la semilla, el set y el número de punto: misma partida → mismas consignas.
 *
 * API: create(o) → st (o = { hall, role ('S'|'OH'|'OPP'|'MB' en pista), seed, trial });
 *   feed(st, e, who, g) por evento (who(jugador) → 0 tu jugador | 1 compañero | −1 rival; g para leer puestos y medidas de pista).
 *   Devuelve null o, al llegar el 'point', { ok: true|false, id, txt } si la consigna se resolvió en ese punto (ok = cumplida).
 *   snap(st) / restore(st, s) (punto anulado por challenge). cur(st) → { id, txt, state: 'on'|'ok'|'miss'|'gone', seq } o null.
 *   BONUS(trial) → lo que suma una consigna cumplida; CAP → tope por partido.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var CHANCE = 0.4;       // puntos con consigna
  var BONUS = 0.05, BONUS_TRIAL = 0.08, CAP = 0.5;
  // medidas en metros de pabellón (×g.cs en la playa)
  var SIDE_MIN = 1.2;     // remate desde un ala: |y| del golpe ≥ esto
  var LINE_DY = 1.6;      // línea: el destino se aparta menos que esto del carril del golpe
  var DIAG_DY = 2.5;      // diagonal: cruza al otro lado y se aparta al menos esto
  var CUT_X = 3.5;        // cortada: cae a menos de esto de la red (y en diagonal)
  var SHORT_X = 3.2;      // saque corto: a menos de esto de la red
  var DEEP_X = 3.0;       // zonas 1/5/6: detrás de esto
  var THIRD = 1.5;        // tercio lateral de la pista: |y| > esto

  // ------------------------------------------------------------------ catálogo
  // k: cuándo se puede dar. srv = sacas tú; rcv = saca el rival; blk = saca tu equipo (no tú) y estás delante; atk = cualquiera
  var C = {
    srv1: { k: 'srv', fmt: 'hall', txt: 'Saca a la zona 1' },
    srv5: { k: 'srv', fmt: 'hall', txt: 'Saca a la zona 5' },
    srv6: { k: 'srv', fmt: 'hall', txt: 'Saca a la zona 6, al fondo' },
    srvLine: { k: 'srv', fmt: 'beach', txt: 'Saca pegado a la línea' },
    srvSeam: { k: 'srv', fmt: 'beach', txt: 'Saca al centro, entre los dos' },
    srvP1: { k: 'srv', fmt: 'beach', txt: 'Saca a por el n.º 1' },
    srvP2: { k: 'srv', fmt: 'beach', txt: 'Saca a por el n.º 2' },
    srvShort: { k: 'srv', txt: 'Saque corto, cerca de la red' },
    srvJump: { k: 'srv', txt: 'Saque en salto' },
    srvFloat: { k: 'srv', txt: 'Saque flotante' },
    recv: { k: 'rcv', roles: { OH: 1 }, txt: 'Si te sacan a ti, recepción buena' },
    atkDiag: { k: 'atk', roles: { OH: 1, OPP: 1 }, txt: 'Remata la primera en diagonal' },
    atkLine: { k: 'atk', roles: { OH: 1, OPP: 1 }, txt: 'Remata la primera por la línea' },
    atkCut: { k: 'atk', fmt: 'beach', txt: 'La primera, cortada en diagonal' },
    atkTip: { k: 'atk', roles: { OH: 1, OPP: 1, MB: 1 }, txt: 'La primera, dejada' },
    atkMB: { k: 'atk', fmt: 'hall', roles: { MB: 1 }, txt: 'Pide la primera y remátala' },
    setMB: { k: 'atk', fmt: 'hall', roles: { S: 1 }, txt: 'Juega la primera con el central' },
    setOPP: { k: 'atk', fmt: 'hall', roles: { S: 1 }, txt: 'Primera bola al opuesto' },
    setOH: { k: 'atk', fmt: 'hall', roles: { S: 1 }, txt: 'Primera bola al receptor' },
    setPipe: { k: 'rcv', fmt: 'hall', roles: { S: 1 }, txt: 'Primera por el pipe' },
    blkLine: { k: 'blk', txt: 'Bloquea la línea' },
    blkDiag: { k: 'blk', txt: 'Bloquea la diagonal' }
  };

  function hash01(a, b, c) {   // [0,1) determinista: mezcla de las tres entradas y finalizador de murmur3
    var h = (Math.imul(a | 0, 0x9e3779b1) + Math.imul(b | 0, 0x85ebca77) + Math.imul(c | 0, 0xc2b2ae3d)) | 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function sgn(v) { return v < 0 ? -1 : 1; }

  function create(o) {
    o = o || {};
    return { hall: !!o.hall, role: o.role || '', seed: o.seed | 0, trial: !!o.trial, on: o.on !== false, n: 0, seq: 0, sum: 0, c: null, t: fresh() };
  }
  function fresh() { return { set: null, srvTeam: -1, rivDir: '', lastMe: -1, lastTeam: -1, myKind: '' }; }
  function cur(st) { return st && st.c; }

  /** Elige (o no) la consigna del punto que empieza. ctx: sirves (0 tú, 1 compañero, −1 rival), en pista delante o no. */
  function pick(st, srv, front, g) {
    st.n++;
    var h = hash01(st.seed, st.n, 0xC0C4);
    if (h >= CHANCE) return null;
    var k = srv === 0 ? 'srv' : srv === -1 ? 'rcv' : 'blk', ids = [], id, c;
    for (id in C) {
      c = C[id];
      if (c.fmt && c.fmt !== (st.hall ? 'hall' : 'beach')) continue;
      if (st.hall && c.roles && !c.roles[st.role]) continue;   // (en la playa no hay puestos: todas valen)
      if (c.k === 'srv' ? k !== 'srv' : c.k === 'rcv' ? k !== 'rcv' : c.k === 'blk' ? k !== 'blk' || !front : k === 'srv') continue;
      ids.push(id);
    }
    if (!ids.length) return null;
    id = ids[Math.floor(hash01(st.seed, st.n, 0xC0C5) * ids.length) % ids.length];
    st.seq++;
    return { id: id, txt: C[id].txt, state: 'on', seq: st.seq, ok: false };
  }

  // ------------------------------------------------------------------ medidas
  function cs(g) { return (g && g.cs) || 1; }
  /** 'line' | 'diag' | 'mid' de un ataque (golpe en e.y, destino e.target). */
  function dirOf(e, k) {
    var hy = +e.y || 0, tg = e.target || e.aim; if (!tg) return 'mid';
    var ty = tg[1], dy = Math.abs(ty - hy);
    if (Math.abs(hy) < SIDE_MIN * k) return dy >= DIAG_DY * k ? 'diag' : 'mid';
    if (sgn(ty) === sgn(hy) && dy < LINE_DY * k) return 'line';
    if (sgn(ty) !== sgn(hy) && dy >= DIAG_DY * k) return 'diag';
    return 'mid';
  }
  function isAtk(e) { return e.kind === 'spike' || e.shot === 'tip' || e.shot === 'roll'; }
  /** Zona del saque (pista, del lado del que recibe): 1 derecha, 5 izquierda, 6 centro; 0 si es corto. */
  function srvZone(e, k) {
    var tg = e.target; if (!tg) return -1;
    var tx = tg[0], ty = tg[1];
    if (Math.abs(tx) < DEEP_X * k) return 0;
    var r = ty * sgn(tx);   // derecha del que recibe (mira hacia la red): +y si está en x > 0
    return r > THIRD * k ? 1 : r < -THIRD * k ? 5 : 6;
  }
  function judgeServe(c, e, g, who) {
    var k = cs(g), tg = e.target || [0, 0], id = c.id;   // (who: sin usar; firma común)
    if (id === 'srvJump') return e.shot === 'jump';
    if (id === 'srvFloat') return e.shot !== 'jump';
    if (id === 'srvShort') return Math.abs(tg[0]) < SHORT_X * k;
    if (id === 'srv1') return srvZone(e, k) === 1;
    if (id === 'srv5') return srvZone(e, k) === 5;
    if (id === 'srv6') return srvZone(e, k) === 6;
    if (id === 'srvLine') return Math.abs(tg[1]) > 4.5 * k - 1.1 * k;
    if (id === 'srvSeam' || id === 'srvP1' || id === 'srvP2') {
      var R = g && g.teams && g.teams[1]; if (!R || R.length < 2) return false;
      var d0 = Math.hypot(R[0].x - tg[0], R[0].y - tg[1]), d1 = Math.hypot(R[1].x - tg[0], R[1].y - tg[1]);
      if (id === 'srvSeam') { var my = (R[0].y + R[1].y) / 2; return Math.abs(tg[1] - my) < 1.0 * k && Math.abs(R[0].y - R[1].y) > 1.5 * k; }
      var near = d0 <= d1 ? R[0] : R[1], num = near.num != null ? near.num : near.idx + 1;
      return (id === 'srvP1' ? 1 : 2) === num && Math.abs(d0 - d1) > 0.6 * k;
    }
    return false;
  }
  function judgeAtk(c, e, g) {
    var k = cs(g), d = dirOf(e, k), tg = e.target || [9, 0];
    switch (c.id) {
      case 'atkDiag': return e.kind !== 'spike' || d === 'mid' ? null : d === 'diag';
      case 'atkLine': return e.kind !== 'spike' || d === 'mid' ? null : d === 'line';
      case 'atkCut': return d === 'diag' && Math.abs(tg[0]) < CUT_X * k;
      case 'atkTip': return e.shot === 'tip';
      case 'atkMB': return true;
    }
    return null;
  }

  /** Un evento. Devuelve null o { ok, id, txt } al resolverse (en el 'point'). */
  function feed(st, e, who, g) {
    if (!st || !e) return null;
    var c = st.c, t = st.t, W = function (pl) { if (pl == null) return -1; var r = who ? who(pl) : pl; return r === 0 || r === 1 ? r : -1; };
    switch (e.type) {
      case 'newMatch': st.c = null; st.t = fresh(); st.sum = 0; return null;
      case 'serveReady': {
        st.t = fresh();
        var s = e.team === 0 ? W(e.player) : -1, me = g && g.ctrl, front = !(g && g.size === 6) || !!(me && me.front);
        st.c = st.on === false ? (st.n++, null) : pick(st, s, front, g);   // (en el banquillo, sin consignas; el azar sigue igual)
        return null;
      }
      case 'hit':
        if (e.team === 0) { t.lastTeam = 0; t.lastMe = W(e.player); if (t.lastMe === 0) t.myKind = e.kind; }
        else t.lastTeam = 1;
        if (!c || c.state !== 'on') return null;
        if (e.team === 0) {
          var mine = W(e.player) === 0, Ck = C[c.id].k;
          if (Ck === 'blk') { if (t.rivDir) resolve(c, null); return null; }   // (defendéis el remate sin bloquearlo tú: sin ocasión)
          if (e.kind === 'serve') { if (Ck === 'srv') resolve(c, mine ? judgeServe(c, e, g, who) : null); return null; }
          if (c.id === 'recv') { if (e.recv) resolve(c, mine ? e.grade === 'perfect' || e.grade === 'good' : null); return null; }
          if (c.id.slice(0, 3) === 'set') {
            if (!t.set) {
              if (e.touch === 2 && e.kind === 'set') { if (mine) t.set = { tempo: e.tempo || '' }; else resolve(c, null); }
              else if (isAtk(e)) resolve(c, null);
              return null;
            }
            if (isAtk(e) && !mine) {
              var r = e.player && e.player.role, ok;
              if (c.id === 'setMB') ok = r === 'MB'; else if (c.id === 'setOPP') ok = r === 'OPP'; else if (c.id === 'setOH') ok = r === 'OH';
              else ok = t.set.tempo === 'pipe';
              resolve(c, ok);
            } else resolve(c, null);
            return null;
          }
          if (Ck === 'atk' && isAtk(e)) resolve(c, mine ? judgeAtk(c, e, g) : null);
        } else if (Ck0(c) === 'blk') {
          if (e.kind === 'spike') t.rivDir = dirOf(e, cs(g));
          else if (t.rivDir) { resolve(c, null); }   // (el rival jugó otra cosa después del remate: sin bloqueo)
        }
        return null;
      case 'block':
        if (c && c.state === 'on' && Ck0(c) === 'blk' && t.rivDir) {
          if (e.team === 0 && W(e.player) === 0 && t.rivDir !== 'mid') resolve(c, t.rivDir === (c.id === 'blkLine' ? 'line' : 'diag'));
          else resolve(c, null);
        }
        return null;
      case 'point': {
        if (!c) { st.t = fresh(); return null; }
        var out = null;
        if (c.state === 'ok') {
          // cumplida, pero el punto se pierde por un error tuyo en esa acción (saque fuera, remate fuera…): no cuenta
          var mineErr = e.team === 1 && (W(e.player) === 0 || (e.how === 'error' && t.lastTeam === 0 && t.lastMe === 0));
          if (mineErr) c.state = 'miss';
        }
        if (c.state === 'on') c.state = 'gone';
        if (c.state === 'ok' || c.state === 'miss') out = { ok: c.state === 'ok', id: c.id, txt: c.txt };
        st.t = fresh();
        return out;
      }
    }
    return null;
  }
  function Ck0(c) { return C[c.id] ? C[c.id].k : ''; }
  function resolve(c, ok) { if (!c || c.state !== 'on') return; c.state = ok === true ? 'ok' : ok === false ? 'miss' : 'gone'; }

  /** Lo que suma la consigna cumplida que llega (con el tope del partido); 0 si ya no queda. Lo apunta en st.sum. */
  function take(st) {
    var d = st.trial ? BONUS_TRIAL : BONUS, left = CAP - st.sum;
    if (left <= 0.0001) return 0;
    d = Math.min(d, left); st.sum += d; return d;
  }
  function snap(st) { return { n: st.n, sum: st.sum, c: st.c ? Object.assign({}, st.c) : null, t: Object.assign({}, st.t) }; }
  function restore(st, s) { if (!st || !s) return; st.n = s.n; st.sum = s.sum; st.c = s.c; st.t = s.t; }

  VB.Consignas = { C: C, CHANCE: CHANCE, BONUS: BONUS, BONUS_TRIAL: BONUS_TRIAL, CAP: CAP, create: create, feed: feed, cur: cur, take: take,
    snap: snap, restore: restore, dirOf: dirOf, srvZone: srvZone, hash01: hash01 };
})();
