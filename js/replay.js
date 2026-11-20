/* MAKE THE CUT — js/replay.js (owner: ui_main)
 * VB.Replay: grabador y repetición (S3-C1 §2-§3, plan T18 con R10/R11/R12). No guarda poses: graba las ENTRADAS del humano por paso
 * de sim en un anillo (Float64Array para move: con Float32Array la resim se desincroniza, T1) y FOTOS de la partida (VB.Sim.copyGame
 * sobre partidas «sombra» creadas una vez en reset). La repetición resimula una sombra (el «corredor» R, R.replay = true) con las
 * entradas grabadas mientras la sim en vivo espera; Players/FX/cámara pintan R con su código de siempre.
 *  - Solo 2v2 humano (ni demo, ni ejercicio, ni espectador, ni 6v6; autopilot solo con reset(g, {force:true}) o &replay=1).
 *  - Sin guardado, sin red, sin THREE, sin DOM (los textos los pinta ui.js con info()/list()). Se carga en node (tools/replaytest.js).
 *  - Cero basura por frame en el grabador (arrays tipados y objetos reutilizados). La única memoria nueva: las sombras de reset() y
 *    los objetos de evento que la sim ya crea al resimular (igual que en vivo).
 *  - No toca la partida en vivo ni g.rng: solo la lee (copyGame(sombra, g) y stateHash(g)). La huella 2v2 no cambia.
 *  - Textos (R2): «Punto de set» / «Punto de partido» / «Mejores jugadas»; frase con VB.Recap.playPhrase (con guarda).
 * Orden en main.js (T22): Sim.step → Replay.onStep(simIn, g) en cada paso; tras drainEvents → Replay.onEvents(g, frameEvents) cada
 * frame; si Replay.autoReady(g) → Replay.start('auto'); con Replay.active() → gdtR = Replay.tick(realDt, evP, evF) y, si
 * Replay.runner() (= R), se pinta R en vez de g (orden de S3-C1 §3 main.js). Replay mantiene VB.ctx.replay (objeto reutilizado o null).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ constantes (S3-C1 §3, R12: TAIL = 156)
  var K = {
    LOG_CAP: 2400,        // pasos del anillo de entradas (20 s a 120 Hz)
    KF_EVERY: 360,        // foto clave cada 3 s dentro del peloteo (acota el avance rápido)
    KF_N: 5,              // fotos clave en anillo
    TAIL: 156,            // pasos que se siguen grabando tras el punto (1,3 s: firma y rabia de C2)
    CLIP_CAP: 1800,       // pasos de entradas de una mejor jugada
    BEST_N: 3,            // mejores jugadas guardadas
    SLOW: 0.5,            // ritmo del tramo lento (×0,5 a 60 fps = 1 paso por frame)
    AUTO_AFTER: 1.6,      // s (tiempo de juego en vivo) entre el punto y la repetición automática
    PREP_STEPS: 240,      // pasos de avance rápido por frame (escritorio)
    PREP_STEPS_MOBILE: 120,
    PRE: 72,              // margen antes del antepenúltimo toque (0,6 s)
    BACK: 840,            // el clip empieza como mucho 7 s antes del punto
    SLOW_PRE: 60,         // el tramo lento empieza 0,5 s antes del toque decisivo...
    SLOW_POST: 42,        // ...y acaba 0,35 s después del punto
    END_HOLD: 0.3,        // s quieto al final del clip
    RAMP: 0.15,           // s de rampa entre ritmo 1 y SLOW
    HITS_N: 16,           // anillo de toques
    MAX_STEPS: 12,        // pasos de R por frame como mucho (como MAX_STEPS de main.js)
    ME_BONUS: 0.12,       // puntuación extra de las jugadas de tu equipo
    AUTO_HL: 0.55         // highlight mínimo para repetir automáticamente un cierre de set que no sea ace/remate/dejada/bloqueo
  };
  // eventos de R que se reparten (evP para Players; evF = lo mismo sin point, para FX y Audio). Nunca a UI.ingest, Career ni Badges
  var PASS = { hit: 1, swing: 1, miss: 1, toss: 1, jump: 1, landPlayer: 1, dive: 1, block: 1, net: 1, netTouch: 1, land: 1, bounce: 1,
    feint: 1, dribble: 1, juggle: 1 };
  var DECISIVE = { ace: 1, kill: 1, tip: 1, block: 1 };
  var F_HIT = 1, F_JUMP = 2, F_JSET = 4, F_SW = 8, F_NULL = 16;
  // ONLINE (fase 6, notes/net.md): modo «dual» = graba las DOS entradas de cada paso de la partida CONFIRMADA (Sim.step(gc, STEP, ins)
  // con ins = [hueco 0, hueco 1]) con sus bits de red. Anillos y tramos aparte: el modo offline (mv/fl) no cambia de formato
  var F_CHAL = 32, F_SKIP = 64, F_TMO = 128, F_AI = 256;
  var TXT = { set: 'Punto de set', match: 'Punto de partido', best: 'Mejores jugadas', end: 'Fin de la repetición' };

  var STEP = 1 / 120;
  var CAP = K.LOG_CAP;
  var mv = new Float64Array(CAP * 2), fl = new Uint8Array(CAP);
  var mv2 = null, fl2 = null;   // dual: Float64Array(CAP * 4) [x0, y0, x1, y1] y Uint16Array(CAP * 2) (se crean en el primer partido online)

  function mkMeta() {
    return { team: 0, how: '', move: '', highlight: 0, savedSetPoint: false, digs: 0, rallyHits: 0, who: { num: 0, team: 0 },
      setNo: 1, score: [0, 0], sets: [0, 0], setWon: false, matchWon: false };
  }
  function copyMeta(d, s) {
    d.team = s.team; d.how = s.how; d.move = s.move; d.highlight = s.highlight; d.savedSetPoint = s.savedSetPoint; d.digs = s.digs;
    d.rallyHits = s.rallyHits; d.who.num = s.who.num; d.who.team = s.who.team; d.setNo = s.setNo;
    d.score[0] = s.score[0]; d.score[1] = s.score[1]; d.sets[0] = s.sets[0]; d.sets[1] = s.sets[1]; d.setWon = s.setWon; d.matchWon = s.matchWon;
  }
  /** Clip: tramo repetible. own = entradas propias (mejores jugadas) o del anillo (el último punto). Pasos = cuenta absoluta de pasos
   *  en vivo desde reset (k0 = paso de la foto g; start = inicio visible; pt = paso del punto; hashStep = paso de hashPt; end = fin). */
  function mkClip(own) {
    return { ok: false, own: own, g: null, mv: own ? new Float64Array(K.CLIP_CAP * 2) : null, fl: own ? new Uint8Array(K.CLIP_CAP) : null, mv2: null, fl2: null,
      k0: 0, start: 0, slowFrom: 0, slowTo: 0, pt: 0, hashStep: 0, hashPt: 0, end: 0, ptT: 0, score: 0, serial: 0, auto: false,
      fx: 0, fy: 0, fz: 0, meta: mkMeta() };
  }
  function copyClip(d, s) {
    d.ok = s.ok; d.k0 = s.k0; d.start = s.start; d.slowFrom = s.slowFrom; d.slowTo = s.slowTo; d.pt = s.pt; d.hashStep = s.hashStep;
    d.hashPt = s.hashPt; d.end = s.end; d.ptT = s.ptT; d.score = s.score; d.serial = s.serial; d.auto = s.auto;
    d.fx = s.fx; d.fy = s.fy; d.fz = s.fz; copyMeta(d.meta, s.meta);
  }

  // ------------------------------------------------------------------ estado del grabador
  var RP = {
    on: false, why: 'reset', g: null, force: false, headless: false, mobile: false,
    step: 0, tLast: -1, timerLast: 0,
    rec: false, tossStep: 0, nextKf: 0, kfI: 0, ptStep: -1, hashStep: -1, hashPt: 0, endStep: -1, ptT: 0,
    hit0: 0, hitsN: 0, overturned: false, skipSeen: false, serial: 0, autoDone: -1, desync: 0, prepMs: 0,
    dual: false, me: 0, vs: 0   // online: dual = dos entradas por paso; me = tu equipo canónico (puntuación extra); vs = 1 → se pinta girado (invitado)
  };
  var kfToss = null, kf = [], kfStep = new Float64Array(K.KF_N), R = null, PR = null, RV = null;   // RV = vista girada de R (invitado online)   // R = corredor; PR = la siguiente de la cola, preparándose
  var hits = [];
  for (var hi = 0; hi < K.HITS_N; hi++) hits.push({ step: 0, team: 0, kind: '', num: 0, x: 0, y: 0, z: 0 });
  var meta = mkMeta();
  var last = mkClip(false);
  var best = [];
  for (var bi = 0; bi < K.BEST_N; bi++) best.push(mkClip(true));
  var ord = [0, 0, 0], ordN = 0;   // orden de las mejores jugadas por puntuación (índices de best)

  // ------------------------------------------------------------------ estado de la reproducción
  var PL = {
    phase: null, kind: '', clip: null, qi: 0, qn: 0, n: 0, k: 0, acc: 0, rate: 1, holdT: 0, t: 0, token: 0, cancel: false,
    exitAll: false, bound: false, slowOn: true, onEnd: null, tStart: 0, nx: null, nxK: 0
  };
  var CR = { phase: 'prep', kind: 'set', i: 0, n: 1 };                         // VB.ctx.replay (objeto reutilizado)
  var CAM = { kind: 'set', slowFrom: -1, slowTo: -1, fx: 0, fy: 0, fz: 0 };     // CameraRig.replay(true, CAM)
  var INFO = { kind: '', i: 0, n: 0, title: '', pill: '', sub: '', phrase: '', aria: '', slow: false, t: 0, dur: 0, phase: '' };
  var IN = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false };
  var IN2 = [mkIn2(), mkIn2()];
  function mkIn2() { return { move: [0, 0], hit: false, jump: false, jset: false, chal: false, skip: false, tmo: false, ai: false, switchPlayer: false }; }
  function bits2(q) {
    return (q.hit ? F_HIT : 0) | (q.jump ? F_JUMP : 0) | (q.jset ? F_JSET : 0) | (q.switchPlayer ? F_SW : 0) | (q.chal ? F_CHAL : 0) |
      (q.skip ? F_SKIP : 0) | (q.tmo ? F_TMO : 0) | (q.ai ? F_AI : 0);
  }
  function unbits2(f, q) {
    q.hit = (f & F_HIT) !== 0; q.jump = (f & F_JUMP) !== 0; q.jset = (f & F_JSET) !== 0; q.switchPlayer = (f & F_SW) !== 0;
    q.chal = (f & F_CHAL) !== 0; q.skip = (f & F_SKIP) !== 0; q.tmo = (f & F_TMO) !== 0; q.ai = (f & F_AI) !== 0;
  }
  var EVT = [];

  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function S() { return VB.Sim; }
  function ctxOf() { return VB.ctx || null; }
  function call(mod, fn, a, b) {
    var m = VB[mod];
    if (!m || typeof m[fn] !== 'function') return undefined;
    try { return m[fn](a, b); } catch (e) { if (typeof console !== 'undefined') console.error('[VB][ERROR] Replay → ' + mod + '.' + fn + ': ' + (e && e.stack || e)); }
    return undefined;
  }
  function ordTxt(n) {
    if (VB.Recap && VB.Recap.ord) { try { return VB.Recap.ord(n); } catch (e) { } }
    n = n | 0; return n <= 0 ? '' : n + (n === 1 || n === 3 ? 'r' : 'º');
  }

  // ------------------------------------------------------------------ grabación
  function hitAt(j) { return hits[j % K.HITS_N]; }
  function stepOf(g, e) {
    var back = typeof e.t === 'number' ? Math.round((g.time - e.t) / STEP) : 0;
    return RP.step - (back > 0 ? back : 0);
  }
  function breakRally() { RP.rec = false; RP.ptStep = -1; last.ok = false; }

  function startRally(g) {
    S().copyGame(kfToss, g);
    RP.rec = true; RP.tossStep = RP.step; RP.nextKf = RP.step + K.KF_EVERY; RP.kfI = 0;
    RP.ptStep = -1; RP.hashStep = -1; RP.endStep = -1; RP.hit0 = RP.hitsN; RP.overturned = false; RP.skipSeen = false;
    last.ok = false;   // la foto del saque anterior ya no existe
  }

  /** Paso en vivo (main.js, tras cada Sim.step): entradas al anillo, foto clave y cierre del peloteo tras la cola. simIn null = paso
   *  sin entrada (Sim.step(g, dt, null)). Un paso que no pasó por aquí (avance rápido de main.js) rompe el peloteo en curso. */
  function onStep(simIn, g) {
    if (!RP.on) return;
    g = g || RP.g;
    if (g !== RP.g) return;
    if (RP.tLast >= 0 && Math.abs(g.time - RP.tLast - STEP) > 1e-6 && RP.rec) breakRally();
    var i = RP.step % CAP;
    if (RP.dual) {   // online: simIn = [entrada del hueco 0, entrada del hueco 1] (las de VB.Net, ya decodificadas)
      for (var h = 0; h < 2; h++) {
        var q = simIn && simIn[h], qm = q && q.move;
        mv2[4 * i + 2 * h] = qm ? +qm[0] || 0 : 0; mv2[4 * i + 2 * h + 1] = qm ? +qm[1] || 0 : 0;
        fl2[2 * i + h] = q ? bits2(q) : F_NULL;
      }
    } else if (simIn) {
      var m = simIn.move;
      mv[2 * i] = m ? +m[0] || 0 : 0; mv[2 * i + 1] = m ? +m[1] || 0 : 0;
      fl[i] = (simIn.hit ? F_HIT : 0) | (simIn.jump ? F_JUMP : 0) | (simIn.jset ? F_JSET : 0) | (simIn.switchPlayer ? F_SW : 0);
    } else { mv[2 * i] = 0; mv[2 * i + 1] = 0; fl[i] = F_NULL; }
    RP.step++; RP.tLast = g.time;
    // GOLPEAR en la pausa del punto (Sim.skipHold recorta g.timer fuera de step): no hay repetición automática de ese punto
    if ((g.mode === 'point' || g.mode === 'over') && g.timer < RP.timerLast - 1.5 * STEP) RP.skipSeen = true;
    RP.timerLast = g.timer;
    if (!RP.rec) return;
    if (RP.ptStep < 0) {
      if (RP.step >= RP.nextKf) {
        var j = RP.kfI % K.KF_N;
        S().copyGame(kf[j], g); kfStep[j] = RP.step; RP.kfI++; RP.nextKf = RP.step + K.KF_EVERY;
      }
      if (RP.step - RP.tossStep >= CAP) breakRally();   // peloteo más largo que el anillo: no repetible
    } else if (RP.step >= RP.endStep) closeRally(RP.endStep);
  }

  function pushHit(g, e, kind) {
    var st = stepOf(g, e);
    if (st < RP.tossStep) return;
    var h = hits[RP.hitsN % K.HITS_N], p = e.player;
    h.step = st; h.team = e.team | 0; h.kind = kind; h.num = p && p.num ? p.num | 0 : 0;
    h.x = +e.x || 0; h.y = +e.y || 0; h.z = +e.z || 0;
    RP.hitsN++;
  }

  /** Eventos del frame de la partida en vivo (tras drainEvents). Nunca los de la repetición (e.replay). */
  function onEvents(g, evs) {
    if (!RP.on || g !== RP.g || !evs) return;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (!e || e.replay) continue;
      var ty = e.type;
      if (ty === 'toss') {
        if (RP.rec && RP.ptStep >= 0) closeRally(RP.step);   // cola cortada por el saque siguiente
        startRally(g);
      } else if (ty === 'hit') { if (RP.rec && RP.ptStep < 0) pushHit(g, e, e.kind || 'hit'); }
      else if (ty === 'block') { if (RP.rec && RP.ptStep < 0) pushHit(g, e, e.result === 'stuff' ? 'stuff' : 'block'); }
      else if (ty === 'point') {
        if (e.penalty) continue;   // Ambiente de Carrera: el punto de castigo no es una jugada (sin repetición ni mejor jugada)
        if (!RP.rec || RP.ptStep >= 0) continue;
        var s = e.score || g.score;
        meta.team = e.team | 0; meta.how = e.how || ''; meta.move = e.move || ''; meta.highlight = +e.highlight || 0;
        meta.savedSetPoint = !!e.savedSetPoint; meta.digs = e.digs | 0; meta.rallyHits = e.rallyHits | 0;
        meta.setNo = g.setNo | 0; meta.score[0] = s[0] | 0; meta.score[1] = s[1] | 0; meta.sets[0] = g.sets[0] | 0; meta.sets[1] = g.sets[1] | 0;
        meta.setWon = !!e.setWon; meta.matchWon = !!e.matchWon; meta.who.num = 0; meta.who.team = meta.team;
        RP.ptStep = stepOf(g, e); RP.ptT = typeof e.t === 'number' ? e.t : g.time;
        RP.hashStep = RP.step; RP.hashPt = S().stateHash(g);
        RP.endStep = RP.ptStep + K.TAIL;
        RP.timerLast = g.timer; RP.skipSeen = false;
      } else if (ty === 'challengeResult') { if (e.overturned) overturn(); }
      else if (ty === 'newMatch') breakRally();
    }
    if (RP.rec && RP.ptStep >= 0 && RP.step >= RP.endStep) closeRally(RP.endStep);
  }

  /** Challenge acertado: el punto grabado se anula (ni repetición automática ni mejor jugada). */
  function overturn() {
    if (RP.rec && RP.ptStep >= 0) { RP.overturned = true; return; }
    if (last.serial === RP.serial) last.ok = false;
    for (var i = 0; i < K.BEST_N; i++) if (best[i].ok && best[i].serial === RP.serial) best[i].ok = false;
    sortBest();
  }

  function closeRally(endAt) {
    RP.rec = false;
    var c = last;
    c.ok = false;
    if (RP.ptStep < 0 || RP.overturned || endAt < RP.hashStep) { RP.ptStep = -1; return; }
    var n = RP.hitsN - RP.hit0, lo = Math.max(RP.hit0, RP.hitsN - K.HITS_N), j;
    var start = RP.tossStep;
    if (n > 0) { var a3 = hitAt(Math.max(lo, RP.hitsN - 3)); if (a3.step - K.PRE > start) start = a3.step - K.PRE; }
    if (RP.ptStep - K.BACK > start) start = RP.ptStep - K.BACK;
    // toque decisivo: el último del ganador si el punto es suyo (ace, remate, dejada, bloqueo); si no, el último toque
    var w = meta.team, dec = null;
    if (DECISIVE[meta.how] === 1) for (j = RP.hitsN - 1; j >= lo; j--) if (hitAt(j).team === w) { dec = hitAt(j); break; }
    if (!dec && n > 0) dec = hitAt(RP.hitsN - 1);
    // foto clave de mayor paso que sea <= start (la del saque si no hay otra)
    var kg = kfToss, k0 = RP.tossStep, m = Math.min(RP.kfI, K.KF_N);
    for (j = 0; j < m; j++) if (kfStep[j] <= start && kfStep[j] > k0) { kg = kf[j]; k0 = kfStep[j]; }
    if (endAt - k0 > CAP) { RP.ptStep = -1; return; }
    c.g = kg; c.k0 = k0; c.start = start; c.pt = RP.ptStep; c.hashStep = RP.hashStep; c.hashPt = RP.hashPt; c.end = endAt; c.ptT = RP.ptT;
    c.slowFrom = Math.max(start, (dec ? dec.step : RP.ptStep) - K.SLOW_PRE); c.slowTo = RP.ptStep + K.SLOW_POST;
    if (dec) { c.fx = dec.x; c.fy = dec.y; c.fz = dec.z; } else { c.fx = 0; c.fy = 0; c.fz = 1; }
    copyMeta(c.meta, meta);
    if (dec && dec.team === w && dec.num) { c.meta.who.num = dec.num; c.meta.who.team = w; }
    c.score = meta.highlight + (w === RP.me ? K.ME_BONUS : 0);
    c.serial = ++RP.serial;
    c.auto = (meta.setWon || meta.matchWon) && (DECISIVE[meta.how] === 1 || meta.highlight >= K.AUTO_HL);
    c.ok = true;
    RP.ptStep = -1;
    if (!(meta.how === 'error' && meta.rallyHits < 4) && endAt - k0 <= K.CLIP_CAP) offerBest(c);
  }

  /** Candidato a mejor jugada: si cabe o supera a la peor, se copia la foto y su tramo de entradas (sin memoria nueva). */
  function offerBest(c) {
    var slot = null, i;
    for (i = 0; i < K.BEST_N; i++) if (!best[i].ok) { slot = best[i]; break; }
    if (!slot) {
      for (i = 0; i < K.BEST_N; i++) if (!slot || best[i].score < slot.score) slot = best[i];
      if (!(c.score > slot.score)) return;
    }
    if (PL.phase && PL.clip === slot) return;   // (no se pisa la que se está viendo)
    S().copyGame(slot.g, c.g);
    if (RP.dual) {
      if (!slot.mv2) { slot.mv2 = new Float64Array(K.CLIP_CAP * 4); slot.fl2 = new Uint16Array(K.CLIP_CAP * 2); }
      for (var k2 = c.k0; k2 < c.end; k2++) {
        var a2 = k2 % CAP, b2 = k2 - c.k0;
        for (var j2 = 0; j2 < 4; j2++) slot.mv2[4 * b2 + j2] = mv2[4 * a2 + j2];
        slot.fl2[2 * b2] = fl2[2 * a2]; slot.fl2[2 * b2 + 1] = fl2[2 * a2 + 1];
      }
    } else for (var k = c.k0; k < c.end; k++) { var a = k % CAP, b = k - c.k0; slot.mv[2 * b] = mv[2 * a]; slot.mv[2 * b + 1] = mv[2 * a + 1]; slot.fl[b] = fl[a]; }
    copyClip(slot, c);
    sortBest();
  }
  function sortBest() {
    ordN = 0;
    for (var i = 0; i < K.BEST_N; i++) if (best[i].ok) ord[ordN++] = i;
    for (var a = 1; a < ordN; a++) {   // inserción (3 elementos): puntuación de mayor a menor; a igualdad, la más antigua
      var v = ord[a], b = a - 1;
      while (b >= 0 && (best[ord[b]].score < best[v].score || (best[ord[b]].score === best[v].score && best[ord[b]].serial > best[v].serial))) { ord[b + 1] = ord[b]; b--; }
      ord[b + 1] = v;
    }
  }

  // ------------------------------------------------------------------ reset / elegibilidad
  function blockedWhy(g, o) {
    var Sm = S();
    if (!Sm || !Sm.copyGame || !Sm.stateHash || !Sm.createGame || !Sm.step) return 'sim';
    if (!g) return 'nogame';
    if (o.fluida) return 'net';   // Online V2: la conexión Fluida no tiene repeticiones en la beta (cada máquina ve su propia partida)
    if (g.size !== 2) return '6v6';
    if (g.demo) return 'demo';
    if (g.drill) return 'drill';
    if (g.watch || g.watch0) return 'watch';
    var cx = ctxOf(), force = !!o.force || !!(cx && cx.params && cx.params.replay === '1');
    if (g.autopilot && !force) return 'autopilot';
    if (!o.headless && !(VB.Players && VB.Players.bindReplay && VB.CameraRig && VB.CameraRig.replay)) return 'modules';
    if (cx && cx.settings && cx.settings.replays === 'off') return 'off';
    return '';
  }
  /** Partido nuevo (startMatch/setGame): crea las 11 sombras (1 del saque, 5 fotos clave, 3 mejores jugadas, el corredor R y PR, la
   *  siguiente de la cola de mejores jugadas, que se prepara mientras acaba la anterior) con las
   *  mismas opts que g (stats:false). o = {force (autopilot en pruebas), headless (node: sin Players/CameraRig), mobile, gameOpts, fluida (online Fluida:
   *  nunca graba)}.
   *  → true si el partido graba. */
  function reset(g, o) {
    abort();
    o = o || {};
    RP.on = false; RP.g = g || null; RP.step = 0; RP.tLast = -1; RP.timerLast = 0; RP.rec = false; RP.ptStep = -1; RP.hashStep = -1;
    RP.endStep = -1; RP.kfI = 0; RP.hit0 = 0; RP.hitsN = 0; RP.overturned = false; RP.skipSeen = false; RP.serial = 0; RP.autoDone = -1;
    RP.desync = 0; RP.prepMs = 0;
    RP.dual = !!o.dual; RP.me = RP.dual && o.slot === 1 ? 1 : 0; RP.vs = RP.me; RV = null;
    if (RP.dual && !mv2) { mv2 = new Float64Array(CAP * 4); fl2 = new Uint16Array(CAP * 2); }
    last.ok = false; last.g = null;
    for (var i = 0; i < K.BEST_N; i++) best[i].ok = false;
    ordN = 0;
    var why = blockedWhy(g, o);
    RP.why = why;
    if (why) { kfToss = null; kf.length = 0; R = null; PR = null; for (i = 0; i < K.BEST_N; i++) best[i].g = null; return false; }
    RP.force = !!o.force; RP.headless = !!o.headless;
    var cx = ctxOf();
    RP.mobile = o.mobile != null ? !!o.mobile : !!(cx && cx.isMobile);
    STEP = 1 / ((VB.C && VB.C.SIM_HZ) || 120);
    var src = o.gameOpts || g.opts || {}, so = {}, k;
    for (k in src) so[k] = src[k];
    so.stats = false;
    var mk = function () { var s = S().createGame(so); s.replay = true; s.events.length = 0; return s; };
    try {
      kfToss = mk(); kf.length = 0;
      for (i = 0; i < K.KF_N; i++) kf.push(mk());
      for (i = 0; i < K.BEST_N; i++) best[i].g = mk();
      R = mk(); PR = mk();
      if (RP.vs === 1) { if (!(VB.NetView && VB.NetView.mirror)) throw new Error('falta VB.NetView'); RV = mk(); }
    } catch (e) {
      RP.why = 'create'; kfToss = null; kf.length = 0; R = null; PR = null; RV = null;
      if (typeof console !== 'undefined') console.error('[VB][ERROR] Replay.reset: ' + (e && e.stack || e));
      return false;
    }
    RP.on = true;
    return true;
  }
  function enabled() { return RP.on; }

  /** ¿Toca la repetición automática del último punto? (ajuste 'auto', sin «Menos movimiento», cierre de set o de partido con ace,
   *  remate, dejada, bloqueo o highlight ≥ 0,55; 1,6 s de juego tras el punto; con challenge posible o revisión se cancela; sin pausa
   *  saltada; partida en vivo en la pausa del punto y ctx.state 'playing'). Solo una vez por punto. */
  function autoReady(g) {
    if (!RP.on || PL.phase || g !== RP.g || !last.ok || !last.auto || RP.autoDone === last.serial || RP.skipSeen || RP.rec) return false;
    var cx = ctxOf();
    if (cx) {
      if (cx.state && cx.state !== 'playing') return false;
      if (cx.reduceMotion) return false;
      if (cx.settings && cx.settings.replays && cx.settings.replays !== 'auto') return false;
      if (cx.frozen) return false;
    }
    if (g.mode !== 'point' && g.mode !== 'over') return false;
    // con challenge posible (o revisión en curso) no hay repetición automática de ese punto: se cancela (S3-C1 §2.1; la jugada sigue
    // en Mejores jugadas). Antes solo esperaba y, en el punto de partido, salía tras el gameOver (la hoja llegaba ~16 s después).
    var Sm = S();
    if (g.review || g.cpuChal || (Sm.canChallenge && (Sm.canChallenge(g, 0) > 0 || Sm.canChallenge(g, 1) > 0))) { RP.autoDone = last.serial; return false; }
    // Ambiente de Carrera: con protesta, tarjeta o castigo en marcha no hay repetición automática de ese punto (sigue en Mejores jugadas)
    if (g.amb && (g.holdLock > g.time || (g.lastPoint && g.lastPoint.penalty))) { RP.autoDone = last.serial; return false; }
    var U = VB.UI; if (U && ((U.ambChoiceRect && U.ambChoiceRect()) || (U.cardRect && U.cardRect()))) { RP.autoDone = last.serial; return false; }
    if (g.time - last.ptT < K.AUTO_AFTER) return false;
    if (RP.step - last.k0 > CAP) return false;
    return true;
  }

  // ------------------------------------------------------------------ reproducción
  function setCtx() {
    var cx = ctxOf();
    if (!cx) return;
    if (PL.phase) { CR.phase = PL.phase; CR.kind = PL.kind; CR.i = PL.qi; CR.n = PL.n; cx.replay = CR; }
    else cx.replay = null;
  }
  function describe(c, kind, i, n, out) {
    var m = c.meta, v = RP.vs, sc = m.score[v] + '-' + m.score[1 - v], ph = '';   // (online: marcador desde tu lado)
    if (VB.Recap && VB.Recap.playPhrase) { try { ph = VB.Recap.playPhrase(m, RP.g) || ''; } catch (e) { ph = ''; } }
    if (!ph) ph = m.how === 'ace' ? 'Ace' : m.how === 'kill' ? 'Remate' : m.how === 'tip' ? 'Dejada' : m.how === 'block' ? 'Bloqueo' :
      'Peloteo de ' + Math.max(1, m.rallyHits) + (m.rallyHits === 1 ? ' toque' : ' toques');
    out.kind = kind; out.i = i; out.n = n; out.phrase = ph;
    if (kind === 'match') {
      out.title = TXT.match; out.pill = ''; out.sub = m.sets[v] + '-' + m.sets[1 - v] + ' | ' + sc; out.aria = 'Repetición: punto de partido';
    } else if (kind === 'set') {
      out.title = TXT.set; out.pill = ''; out.sub = ordTxt(m.setNo) + ' set | ' + sc; out.aria = 'Repetición: punto de set del ' + ordTxt(m.setNo) + ' set';
    } else {
      out.title = TXT.best; out.pill = (i + 1) + ' de ' + n; out.sub = ordTxt(m.setNo) + ' set | ' + sc;
      out.aria = 'Repetición: mejores jugadas, ' + (i + 1) + ' de ' + n + '. ' + ph;
    }
    return out;
  }

  /** Avanza G un paso con la entrada grabada k del clip c (eventos a EVT). */
  function stepG(G, c, k) {
    if (RP.dual) { stepG2(G, c, k); return; }
    var a, f, Ms = c.own ? c.mv : mv, Fs = c.own ? c.fl : fl;
    a = c.own ? k - c.k0 : k % CAP;
    f = Fs[a];
    var inp = null;
    if (!(f & F_NULL)) {
      IN.move[0] = Ms[2 * a]; IN.move[1] = Ms[2 * a + 1];
      IN.hit = (f & F_HIT) !== 0; IN.jump = (f & F_JUMP) !== 0; IN.jset = (f & F_JSET) !== 0; IN.switchPlayer = (f & F_SW) !== 0;
      inp = IN;
    }
    var Sm = S();
    Sm.step(G, STEP, inp);
    EVT.length = 0; Sm.drainEvents(G, EVT);
  }
  /** Online: avanza G un paso con las DOS entradas grabadas (las mismas que tuvo la partida confirmada). */
  function stepG2(G, c, k) {
    var Ms = c.own ? c.mv2 : mv2, Fs = c.own ? c.fl2 : fl2, a = c.own ? k - c.k0 : k % CAP, null2 = true;
    for (var h = 0; h < 2; h++) {
      var f = Fs[2 * a + h], q = IN2[h];
      if (!(f & F_NULL)) null2 = false;
      q.move[0] = Ms[4 * a + 2 * h]; q.move[1] = Ms[4 * a + 2 * h + 1]; unbits2(f & ~F_NULL, q);
    }
    var Sm = S();
    Sm.step(G, STEP, null2 ? null : IN2);
    EVT.length = 0; Sm.drainEvents(G, EVT);
  }
  /** Online, invitado: la partida que se pinta es RV (copia girada de R, como su vista espejo: VB.NetView) y los eventos se giran. */
  function viewSync(outP, outF) {
    if (!RV) return;
    var NV = VB.NetView;
    NV.mirror(RV, R, 1); RV.replay = true;
    var i;
    if (outP) for (i = 0; i < outP.length; i++) outP[i] = NV.mapEvent(outP[i], RV, 1);
    if (outF) for (i = 0; i < outF.length; i++) outF[i] = NV.mapEvent(outF[i], RV, 1);
  }
  /** Avanza R un paso (PL.k) en 'play'; out* = arrays de eventos a rellenar. → false si el hash del punto no cuadra. */
  function stepR(c, outP, outF) {
    var k = PL.k, Sm = S();
    stepG(R, c, k);
    PL.k = k + 1;
    if (outP || outF) for (var i = 0; i < EVT.length; i++) {
      var e = EVT[i], ty = e.type;
      if (ty === 'point') { e.replay = true; if (outP) outP.push(e); }
      else if (PASS[ty] === 1 || (typeof ty === 'string' && ty.charCodeAt(0) === 102 && ty.indexOf('fx:') === 0)) {
        e.replay = true; if (outP) outP.push(e); if (outF) outF.push(e);
      }
    }
    EVT.length = 0;
    if (PL.k === c.hashStep && Sm.stateHash(R) !== c.hashPt) {
      RP.desync++; c.ok = false;
      if (typeof console !== 'undefined') console.warn('[VB] repetición desincronizada');
      return false;
    }
    return true;
  }

  function loadClip(c) {
    S().copyGame(R, c.g);
    R.replay = true;
    PL.clip = c; PL.k = c.k0; PL.acc = 0; PL.rate = 1; PL.holdT = 0; PL.t = 0; PL.nx = null;
  }
  /** Cola de mejores jugadas: prepara la siguiente en PR (copia + avance rápido repartido) mientras acaba la actual. */
  function hasNext() { return PL.kind === 'best' && !PL.exitAll && PL.qi + 1 < PL.qn; }
  function prepNext(budget) {
    if (!hasNext()) return;
    var t0 = now();
    if (!PL.nx) { PL.nx = best[ord[PL.qi + 1]]; S().copyGame(PR, PL.nx.g); PR.replay = true; PL.nxK = PL.nx.k0; }
    var c = PL.nx, n = 0;
    while (PL.nxK < c.start && n < budget) { stepG(PR, c, PL.nxK); PL.nxK++; n++; }
    EVT.length = 0;
    var ms = now() - t0; if (ms > RP.prepMs) RP.prepMs = ms;
  }
  function camInfo(c) {
    var cx = ctxOf(), slow = PL.slowOn && !(cx && cx.reduceMotion);
    CAM.kind = PL.kind;
    // tiempos en R.time (tras la preparación R está en c.start)
    CAM.slowFrom = slow ? R.time + (c.slowFrom - PL.k) * STEP : -1;
    CAM.slowTo = slow ? R.time + (c.slowTo - PL.k) * STEP : -1;
    CAM.fx = RV ? -c.fx : c.fx; CAM.fy = RV ? -c.fy : c.fy; CAM.fz = c.fz;   // (invitado: punto de interés girado)
    return CAM;
  }
  function wipe(cb) {
    var u = VB.UI;
    if (RP.headless || !u || typeof u.replayWipe !== 'function') { cb(); return; }
    var r;
    try { r = u.replayWipe(cb); } catch (e) { r = false; }
    if (r === false) cb();
  }
  function bindAll(c, again) {
    viewSync(null, null);
    call('Players', 'bindReplay', RV || R);
    if (!again) { call('FX', 'replay', true); call('Audio', 'replay', true); }
    call('CameraRig', 'replay', true, camInfo(c));
    PL.bound = true;
  }
  function unbindAll() {
    if (!PL.bound) return;
    PL.bound = false;
    call('Players', 'bindReplay', null);
    call('FX', 'replay', false);
    call('CameraRig', 'replay', false);
    call('Audio', 'replay', false);
  }
  function teardown(notify) {
    unbindAll();
    var cb = PL.onEnd;
    PL.phase = null; PL.clip = null; PL.nx = null; PL.onEnd = null; PL.cancel = false; PL.exitAll = false; PL.token++;
    setCtx();
    if (notify && typeof cb === 'function') { try { cb(); } catch (e) { if (typeof console !== 'undefined') console.error('[VB][ERROR] Replay onEnd: ' + (e && e.stack || e)); } }
  }

  function begin(kind, c, qi, qn, n, onEnd) {
    var cx = ctxOf();
    PL.kind = kind; PL.qi = qi; PL.qn = qn; PL.n = n; PL.onEnd = onEnd || null; PL.cancel = false; PL.exitAll = false;
    PL.slowOn = !(cx && cx.reduceMotion);
    PL.token++;
    loadClip(c);
    describe(c, kind, qi, n, INFO);
    PL.phase = 'prep';
    setCtx();
    return true;
  }

  /** Repite el último punto: kind 'set' | 'match' | 'auto' (elige por el punto) | 'best' (= playBest(j)). onEnd opcional. */
  function start(kind, j, onEnd) {
    if (!RP.on || PL.phase || !R) return false;
    if (kind === 'best') return playBest(j, onEnd);
    if (!last.ok || RP.step - last.k0 > CAP) return false;
    if (kind !== 'set' && kind !== 'match') kind = last.meta.matchWon ? 'match' : 'set';
    RP.autoDone = last.serial;
    return begin(kind, last, 0, 1, 1, onEnd);
  }
  /** Mejores jugadas: i = una (índice de list()) o, sin i, todas en orden de puntuación con cortinilla entre ellas. */
  function playBest(i, onEnd) {
    if (!RP.on || PL.phase || !R || !ordN) return false;
    var q0 = 0, qn = ordN;
    if (i != null) { i = i | 0; if (i < 0 || i >= ordN) return false; q0 = i; qn = i + 1; }
    return begin('best', best[ord[q0]], q0, qn, ordN, onEnd);
  }

  function enterPlay(c) {
    var tk = PL.token;
    PL.phase = 'in'; setCtx();
    wipe(function () {
      if (tk !== PL.token || PL.phase !== 'in') return;
      if (PL.cancel) { teardown(true); return; }
      bindAll(c, false);
      PL.tStart = R.time;
      PL.phase = 'play'; setCtx();
    });
  }
  function finishClip() {
    var tk = PL.token;
    PL.phase = 'out'; setCtx();
    wipe(function () {
      if (tk !== PL.token || PL.phase !== 'out') return;
      if (hasNext()) {
        // siguiente jugada bajo la cortinilla: ya preparada en PR (lo que falte, de una vez: solo si se saltó al principio del clip)
        prepNext(1e9);
        var c = PL.nx, sw = R; R = PR; PR = sw;
        PL.qi++; PL.clip = c; PL.k = PL.nxK; PL.nx = null; PL.acc = 0; PL.rate = 1; PL.holdT = 0; PL.t = 0;
        describe(c, 'best', PL.qi, PL.n, INFO);
        bindAll(c, true);
        PL.tStart = R.time;
        PL.phase = 'play'; setCtx();
        return;
      }
      teardown(true);
    });
  }

  /** Cada frame mientras active(): prep (avance rápido repartido), play (pasos de R al ritmo, cámara lenta en el tramo decisivo).
   *  outP/outF: arrays que se vacían y se rellenan con los eventos de R (outP para Players con point; outF sin point, para FX y
   *  Audio), todos con e.replay = true. → dt de juego de R de este frame (0 fuera de 'play'). */
  function tick(realDt, outP, outF) {
    if (outP) outP.length = 0;
    if (outF) outF.length = 0;
    var c = PL.clip;
    if (!PL.phase || !c) return 0;
    realDt = realDt > 0 ? realDt : 0;
    var budget = RP.mobile ? K.PREP_STEPS_MOBILE : K.PREP_STEPS;
    if (PL.phase === 'prep') {
      var t0 = now(), n0 = 0;
      while (PL.k < c.start && n0 < budget) { stepG(R, c, PL.k); PL.k++; n0++; }
      EVT.length = 0;
      var ms = now() - t0; if (ms > RP.prepMs) RP.prepMs = ms;
      if (PL.k >= c.start) enterPlay(c);
      return 0;
    }
    if (PL.phase === 'out') { prepNext(budget); return 0; }
    if (PL.phase !== 'play') return 0;
    PL.t += realDt;
    var slowNow = PL.slowOn && PL.k >= c.slowFrom && PL.k < c.slowTo;
    var target = slowNow ? K.SLOW : 1, dr = realDt * (1 - K.SLOW) / K.RAMP;
    if (PL.rate > target) PL.rate = Math.max(target, PL.rate - dr); else if (PL.rate < target) PL.rate = Math.min(target, PL.rate + dr);
    if (PL.k >= c.end) {
      PL.holdT += realDt;
      prepNext(budget);
      if (PL.holdT >= K.END_HOLD) finishClip();
      return 0;
    }
    PL.acc += realDt * PL.rate;
    var n = 0, ok = true;
    while (PL.acc >= STEP - 1e-9 && n < K.MAX_STEPS && PL.k < c.end) {
      ok = stepR(c, outP, outF); PL.acc -= STEP; n++;
      if (!ok) break;
    }
    if (n === K.MAX_STEPS || PL.acc < 0) PL.acc = 0;
    if (RV && n) viewSync(outP, outF);
    if (!ok) { PL.exitAll = PL.kind !== 'best' || PL.exitAll; finishClip(); }
    return n * STEP;
  }

  /** Saltar: en una repetición de set/partido, salir; en mejores jugadas, la siguiente (all = salir de todas). */
  function skip(all) {
    if (!PL.phase) return false;
    if (all || PL.kind !== 'best') PL.exitAll = true;
    if (PL.phase === 'prep') { teardown(true); return true; }
    if (PL.phase === 'in') { PL.cancel = true; return true; }
    if (PL.phase === 'play') { finishClip(); return true; }
    return true;   // 'out': ya saliendo (exitAll marcado si all)
  }
  /** Fuera de golpe, sin cortinilla (toMenu, restart, partido nuevo): suelta los enlaces y ctx.replay = null. */
  function abort() {
    if (!PL.phase && !PL.bound) return;
    PL.onEnd = null;
    teardown(false);
  }
  function active() { return !!PL.phase; }
  /** La partida que hay que pintar en lugar de la viva (R) mientras los módulos están enlazados a ella; null si no. */
  function runner() { return PL.phase && PL.bound ? (RV || R) : null; }
  function info() {
    if (!PL.phase) return null;
    var c = PL.clip;
    INFO.phase = PL.phase;
    INFO.slow = PL.phase === 'play' && PL.rate < 0.999;
    INFO.t = PL.t;
    INFO.dur = c ? (Math.max(0, c.end - c.start) * STEP + (c.slowTo - c.slowFrom) * STEP * (PL.slowOn ? (1 / K.SLOW - 1) : 0) + K.END_HOLD) : 0;
    return INFO;
  }
  /** Mejores jugadas del partido en orden de puntuación (R10: la pestaña «Jugadas (n)»). Memoria nueva: se llama en la hoja final. */
  function list() {
    var out = [];
    for (var i = 0; i < ordN; i++) {
      var c = best[ord[i]], o = describe(c, 'best', i, ordN, {});
      var v = RP.vs, tm = c.meta.team;
      out.push({ i: i, title: o.phrase, phrase: o.phrase, sub: o.sub, pill: o.pill, aria: o.aria, setNo: c.meta.setNo,
        score: c.meta.score[v] + '-' + c.meta.score[1 - v], how: c.meta.how, team: v && (tm === 0 || tm === 1) ? 1 - tm : tm, highlight: c.meta.highlight, pts: c.score });
    }
    return out;
  }
  function bestCount() { return ordN; }
  /** Online: la partida grabada cambió fuera de Sim.step (reparación con foto, vuelta del invitado): el peloteo en curso no se repite. */
  function cut() { if (RP.on && RP.rec) breakRally(); }
  function desync() { return RP.desync; }
  function prepMs() { return RP.prepMs; }

  VB.Replay = {
    K: K, TXT: TXT, PASS: PASS,
    reset: reset, enabled: enabled, onStep: onStep, onEvents: onEvents, autoReady: autoReady, start: start, playBest: playBest,
    tick: tick, skip: skip, abort: abort, active: active, runner: runner, info: info, list: list, bestCount: bestCount,
    desync: desync, prepMs: prepMs, cut: cut,
    /** Pruebas (tools/replaytest.js): copia de lectura del estado interno. */
    _state: function () {
      return { on: RP.on, why: RP.why, step: RP.step, dual: RP.dual, vs: RP.vs, rec: RP.rec, serial: RP.serial, phase: PL.phase, k: PL.k, rate: PL.rate,
        last: last.ok ? { k0: last.k0, start: last.start, pt: last.pt, end: last.end, slowFrom: last.slowFrom, slowTo: last.slowTo, auto: last.auto, how: last.meta.how, score: last.score } : null,
        best: list().map(function (o) { return o.pts; }), clip: PL.clip ? { start: PL.clip.start, end: PL.clip.end, slowFrom: PL.clip.slowFrom, slowTo: PL.clip.slowTo, pt: PL.clip.pt, hashStep: PL.clip.hashStep } : null };
    },
    _R: function () { return R; }
  };
})();
