/* =====================================================================
 * MAKE THE CUT — js/netview.js   (owner: net)
 * Vista espejo del invitado (online, notes/net.md). La partida canónica pone al anfitrión en el equipo 0 (x > 0) y al invitado en el
 * equipo 1 (x < 0). La cámara, la interfaz, los efectos y el sonido dan por hecho que «tú» eres el equipo 0, así que el invitado
 * pinta una COPIA girada 180°: x → −x, y → −y en balón, jugadores y puntos; las parejas por equipo intercambiadas (marcador, sets,
 * challenges…); los índices de equipo cambiados (0 ↔ 1) y su hueco como hueco activo (g.ctrl = su jugador). Es solo de pintado:
 * nunca se avanza la vista con Sim.step. SIN DOM y SIN THREE (tools/viewtest.js la prueba en Node).
 *
 *   mirror(view, g, slot) → view: copyGame(view, g) y, con slot 1, flip(view). view = Sim.createGame con las MISMAS opciones.
 *   flip(v)                 gira en el sitio. Es una involución exacta: flip(flip(v)) deja v igual bit a bit (viewtest).
 *   mapEvents(evs, view, slot, out) eventos de la partida canónica → eventos para presentar en la vista (copias: jugadores de la
 *                           vista por id; con slot 1, girados y con los equipos cambiados; el punto con el texto del invitado).
 *   inputToWorld(inp, slot) la entrada se construye con la cámara de la VISTA: con slot 1 se gira move antes de mandarla.
 *   FIELDS / PLAYER / EVENT: clasificación CERRADA de todos los campos (viewtest falla si aparece uno sin clasificar).
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  // Clases: 'as' = tal cual · 'team' = índice de equipo (0 ↔ 1, -1 igual) · 'swap' = pareja por equipo [a, b] → [b, a] ·
  // 'swapneg' = pareja intercambiada y negada · 'pairs' = lista de parejas, cada una intercambiada · 'pos' = objeto con x, y (y vx, vy)
  // a negar · 'vec' = [x, y] a negar · 'ref' = referencia a un jugador (copyGame la empareja por id) · 'refs' = lista de jugadores
  // (solo eventos) · 'special' = lo hace flip a mano
  var FIELDS = {
    opts: 'as', format: 'as', size: 'as', rot: 'as', lineup: 'as', libero: 'as', liberoFor: 'as', roster: 'as', setPlan: 'as',
    demo: 'as', autopilot: 'as', ctrlMode: 'as', ctrlRole: 'as', ctrlBase: 'as', posRule6: 'as', hAct: 'as', ask6: 'as',
    ctrlIdx: 'special', difficulty: 'as', prof: 'swap', tm: 'as', recvRisk: 'as', courtSwap3: 'as', points: 'as', venue: 'as',
    beach: 'as', HL: 'as', HW: 'as', cs: 'as', courtSwapAt: 'as', antennaHit: 'pos', atkServe: 'special', rng: 'as', seed: 'as',
    serveNo: 'as', ritual: 'special', cpuTossIn: 'as', time: 'as', teams: 'special', players: 'special', ball: 'pos', mode: 'as',
    score: 'swap', sets: 'swap', setNo: 'as', setScores: 'pairs', serving: 'team', serverIdx: 'swap', server: 'ref', serveState: 'as',
    serveJump: 'as', serveClock: 'as', serveClockMax: 'as', serveT: 'as', tossT: 'as', jumpAt: 'as', aiServeTe: 'as', serveAuth: 'as',
    whistleAt: 'as', touchTeam: 'team', touches: 'as', lastPlayer: 'ref', lastTeam: 'team', lastKind: 'as', lastShot: 'as', lastQ: 'as',
    lastTouchT: 'as', ctrl: 'special', jobs: 'swap', pr1: 'pos', pr3: 'pos', blockOff: 'swapneg', timer: 'as', blockCD: 'as',
    pendingSet: 'as', digOk: 'as', digK: 'as', feintFool: 'as', hardIn: 'as', finished: 'as', feintT: 'as', atkMove: 'as', atkEdge: 'as', lastTempo: 'as',
    chain: 'as', chainH: 'as', prevKind: 'as', atkTeam: 'team', atkHow: 'as', atkHits: 'as', atkSet: 'ref', jobMem: 'swap',
    jobMemT: 'swap', jobSwT: 'swap', jobHop: 'swap', digMargin: 'as', lastPoint: 'special', setPoint: 'team', matchPoint: 'team',
    rally: 'as', present: 'as', hold: 'as', streakTeam: 'team', streakN: 'as', atkHuman: 'as', atkGrade: 'as', digTight: 'as',
    refErr: 'as', chalPerSet: 'as', lineJudges: 'as', call: 'special', challenges: 'swap', review: 'special', cpuChal: 'special',
    _pendCall: 'special', _snap: 'special', _digWho: 'ref', blockBy: 'ref', events: 'as', drill: 'as', replay: 'as', stats: 'as',
    mastery: 'as', feintOn: 'as', amb: 'as', holdLock: 'as', online: 'as', hT: 'as', bo1: 'as', hum: 'special', tmoPer: 'as', skipReq: 'swap', tmoReq: 'swap',
    tmoLeft: 'swap', tmo: 'special', _mates: 'swap', lastLand: 'pos', netSince: 'as', _rc: 'as', _lv: 'swap',
    fl: 'as',                // Online V2 «Fluida» (VB.Sim.flInit): estado canónico en datos planos; la vista no lo lee
    // gesto del hueco activo (SLOT_S de sim.js y aim3/swingAim/aimIn): pasan a ser los del invitado
    aim3: 'special', swingAim: 'special', aimIn: 'special', aimOn: 'slot', aimLen: 'slot', swingLen: 'slot', aimSet: 'slot',
    hitBuf: 'slot', jsetQ: 'slot', swingLive: 'slot', swingShot: 'slot', swingLock: 'slot', swingHasAim: 'slot', setWinOn: 'slot',
    setCarry: 'slot', setCarryK: 'slot', setDirA: 'slot', lastGrade: 'slot', swingT0: 'slot', swingShot0: 'slot', swingSwapT: 'slot',
    defRole: 'slot',
    // salto con impulso (v1.12.0): las puertas y la atribución del último remate tal cual; búfer de dirección (ejes del EQUIPO: F hacia
    // la red, S = sd·y, no cambian con el espejo), arrastre de la diana y diana de colocación, por hueco
    djump: 'as', djLast: 'as', jdF: 'slot', jdS: 'slot', jdM: 'slot', jdT: 'slot', aimCarry: 'slot', jsMv: 'slot', jsAimD: 'slot', jsetAim: 'slot'
  };
  var PLAYER = {
    id: 'as', team: 'team', idx: 'as', num: 'as', role: 'as', zone: 'as', front: 'as', x: 'neg', y: 'neg', z: 'as', vx: 'neg', vy: 'neg',
    vz: 'as', anim: 'as', cool: 'as', st: 'as', prof: 'as', ak: 'as', badges: 'as', bd: 'as', bdT: 'as', jvx: 'neg', jvy: 'neg',
    lvx: 'neg', lvy: 'neg', rvx: 'neg', rvy: 'neg', down: 'as', shot: 'as', grade: 'as', aiTe: 'as', aiTeT: 'as', aiJt: 'as',
    aiDv: 'as', aiRk: 'as', e1T: 'as', e1Until: 'as', lastAction: 'as', pressEnd: 'as', actionT: 'as', onGround: 'as', tgx: 'neg', tgy: 'neg',
    tgA: 'as', tgB: 'as', tgTime: 'as', aiPlT: 'as', aiPl: 'as',
    avx: 'neg', avy: 'neg', tkX: 'neg', tkY: 'neg', dj: 'as', jF: 'as', landT: 'as'   // (salto con impulso: carrera media, despegue; jF ya es «hacia la red»)
  };
  var EVENT = {
    type: 'as', t: 'as', _tick: 'as', _conf: 'as', team: 'team', landSide: 'team', setPoint: 'team', matchPoint: 'team', serving: 'team',
    x: 'neg', y: 'neg', z: 'as', vx: 'neg', vy: 'neg', aim: 'vec', target: 'vec', dir: 'vec', antenna: 'vec3',
    score: 'swap', sets: 'swap', left: 'swap', challenges: 'swap', setScores: 'pairs',
    player: 'ref', assist: 'ref', server: 'ref', text: 'text', text1: 'text',
    faultTeam: 'team', faultPlayer: 'ref', players: 'refs',   // (point: quién comete la falta; players = los solapados de la falta de posición)
    calledIn: 'as', chain: 'as', clutch: 'as', demo: 'as', difficulty: 'as', dig: 'as', digs: 'as', dist: 'as', dive: 'as', edge: 'as',
    every: 'as', feint: 'as', grade: 'as', highlight: 'as', hold: 'as', how: 'as', human: 'as', inside: 'as', jset: 'as', jump: 'as',
    kind: 'as', last: 'as', lastKind: 'as', lastShot: 'as', matchWon: 'as', miss: 'as', move: 'as', n: 'as', of: 'as', on: 'as',
    overturned: 'as', pause: 'as', pokey: 'as', power: 'as', ofe: 'as', pressed: 'as', quality: 'as', rallyHits: 'as', rallyTime: 'as',
    reason: 'as', recv: 'as', result: 'as', savedSetPoint: 'as', setNo: 'as', setWon: 'as', shot: 'as', sideout: 'as', signal: 'as',
    speed: 'as', streak: 'as', t2: 'as', tape: 'as', tempo: 'as', timing: 'as', tool: 'as', touch: 'as', touchedOut: 'as',
    truthIn: 'as', venue: 'as', why: 'as', dur: 'as', wrong: 'as', used: 'as', auto: 'as', reset: 'as', mode: 'as',
    jv: 'as', mom: 'as', pipe: 'as', hard: 'as', jaim: 'as',  // (salto con impulso; jump.dir ya es 'vec')
    ok: 'as'   // (blockPress: pulsación del bloqueo activo a tiempo o no; faltaba, viewtest lo vio el 18-nov-2026 al cambiar los partidos de bots)
  };
  // claves conocidas de los objetos anidados que flip toca o deja (viewtest falla si aparece otra: habría que clasificarla)
  var NESTED = {
    ball: 'x,y,z,vx,vy,vz,held,spin,speed,dip,wobA,wobF,wobP', pr1: 'x,y,z,t', pr3: 'x,y,z,t', aim3: 'on,x,y,kind', lastLand: 'x,y,inside,t',
    antennaHit: 'x,y,z', call: 'x,y,dist,truthIn,calledIn,wrong,team,t,alt,used,setNo,waived', _pendCall: 'x,y,dist,truthIn,calledIn,wrong,team,t,alt,used,setNo,waived',
    review: 'team,t,dur,x,y,dist,truthIn,calledIn,overturned', cpuChal: 'team,at', tmo: 'team,t,dur', atkServe: 'team,player,reason,text',
    ritual: 'on,phase,t,dur,bounces,n,u,player,rx,ry,pre,post,still,cyc,td,tu,v0,vu,vc,vi,press', rally: 't,hits,digs', tm: 'assist,swing,lock',
    _rc: 'pace,wob,run,move,line,ft,who',
    lastPoint: 'team,reason,text,how,highlight,digs,streak,savedSetPoint,clutch,signal,touchedOut,landSide,hold,setWon,matchWon,assist,tool,move',
    _snap: 'score,sets,setNo,serving,serverIdx,setScores,streakTeam,streakN,courtSwap3,pendingSet,setPoint,matchPoint,challenges,lastPoint',
    hum: 'team,p,ai,aiBack,aim3,swingAim,aimIn,hitBuf,jsetQ,swingLive,swingShot,swingLock,swingHasAim,setWinOn,setCarry,setCarryK,setDirA,lastGrade,swingT0,swingShot0,swingSwapT,defRole,aimOn,aimLen,swingLen,aimSet,jdF,jdS,jdM,jdT,aimCarry,jsMv,jsAimD,jsetAim'
  };
  var NOSLOT = { team: 1, p: 1, ai: 1, aiBack: 1, aim3: 1, swingAim: 1, aimIn: 1 };
  // textos del árbitro que dependen de quién mira (sim.js LAND_TXT): el invitado ve el otro
  var LAND_TXT = ['El balón cae en tu campo', 'El balón cae en el campo rival'];
  function textMirror(t) { var i = LAND_TXT.indexOf(t); return i < 0 ? t : LAND_TXT[1 - i]; }

  var seen = typeof Set === 'function' ? new Set() : null;
  function once(o) { if (!o || typeof o !== 'object' || seen.has(o)) return false; seen.add(o); return true; }
  function tf(t) { return t === 0 ? 1 : t === 1 ? 0 : t; }
  function negPos(o) { if (!once(o)) return; o.x = -o.x; o.y = -o.y; if ('vx' in o) { o.vx = -o.vx; o.vy = -o.vy; } }
  function negVec(a) { if (!once(a)) return; a[0] = -a[0]; a[1] = -a[1]; }
  function swap(a) { if (!once(a)) return; var t = a[0]; a[0] = a[1]; a[1] = t; }
  function swapNeg(a) { if (!once(a)) return; var t = a[0]; a[0] = -a[1]; a[1] = -t; }
  function pairs(a) { if (!once(a)) return; for (var i = 0; i < a.length; i++) swap(a[i]); }
  function callFlip(c) {
    if (!once(c)) return;
    c.x = -c.x; c.y = -c.y; c.team = tf(c.team);
    if (c.alt && once(c.alt)) { c.alt[0] = tf(c.alt[0]); if (typeof c.alt[2] === 'string') c.alt[2] = textMirror(c.alt[2]); }
  }
  function pointFlip(lp) {
    if (!once(lp)) return;
    lp.team = tf(lp.team); lp.landSide = tf(lp.landSide); if (typeof lp.text === 'string') lp.text = textMirror(lp.text);
  }

  /** Gira la partida v en el sitio (involución exacta). Solo para pintar. */
  function flip(v) {
    seen.clear();
    var k, i, c;
    for (k in v) {
      c = FIELDS[k];
      switch (c) {
        case 'team': v[k] = tf(v[k]); break;
        case 'swap': if (v[k]) swap(v[k]); break;
        case 'swapneg': if (v[k]) swapNeg(v[k]); break;
        case 'pairs': if (v[k]) pairs(v[k]); break;
        case 'pos': if (v[k]) negPos(v[k]); break;
      }
    }
    // jugadores: equipo cambiado y posición girada; equipos intercambiados y players = teams[0] + teams[1]
    var P = v.players;
    for (i = 0; i < P.length; i++) {
      var p = P[i]; if (!once(p)) continue;
      p.team = tf(p.team); p.x = -p.x; p.y = -p.y; p.vx = -p.vx; p.vy = -p.vy;
      p.jvx = -p.jvx; p.jvy = -p.jvy; p.lvx = -p.lvx; p.lvy = -p.lvy; p.rvx = -p.rvx; p.rvy = -p.rvy;
      if (p.tgx !== undefined) { p.tgx = -p.tgx; p.tgy = -p.tgy; }
    }
    var T = v.teams, t0 = T[0]; T[0] = T[1]; T[1] = t0;
    P.length = 0; for (i = 0; i < T[0].length; i++) P.push(T[0][i]); for (i = 0; i < T[1].length; i++) P.push(T[1][i]);
    // objetos con equipo y posición
    if (v.ritual && once(v.ritual)) { v.ritual.rx = -v.ritual.rx; v.ritual.ry = -v.ritual.ry; }
    if (v.atkServe && once(v.atkServe)) v.atkServe.team = tf(v.atkServe.team);
    if (v.cpuChal && once(v.cpuChal)) v.cpuChal.team = tf(v.cpuChal.team);
    if (v.tmo && once(v.tmo)) v.tmo.team = tf(v.tmo.team);
    if (v.review && once(v.review)) { var r = v.review; r.team = tf(r.team); r.x = -r.x; r.y = -r.y; }
    callFlip(v.call); callFlip(v._pendCall);
    pointFlip(v.lastPoint);
    var sn = v._snap;
    if (sn && once(sn)) {
      swap(sn.score); swap(sn.sets); swap(sn.serverIdx); swap(sn.challenges); pairs(sn.setScores);
      sn.serving = tf(sn.serving); sn.streakTeam = tf(sn.streakTeam); sn.setPoint = tf(sn.setPoint); sn.matchPoint = tf(sn.matchPoint);
      pointFlip(sn.lastPoint);
    }
    // huecos: el del invitado pasa a ser el 0 y el activo (sus campos a los de siempre de g)
    var H = v.hum;
    if (H && H.length === 2) {
      var h0 = H[0]; H[0] = H[1]; H[1] = h0;
      for (i = 0; i < 2; i++) { var h = H[i]; if (!once(h)) continue; h.team = tf(h.team); if (h.aim3) negPos(h.aim3); if (h.swingAim) negVec(h.swingAim); if (h.aimIn) negVec(h.aimIn); }
      var a = H[0];
      for (k in a) if (!NOSLOT[k]) v[k] = a[k];
      v.aim3 = a.aim3; v.swingAim = a.swingAim; v.aimIn = a.aimIn; v.ctrl = a.p;
      if (v.ctrl) v.ctrlIdx = v.ctrl.idx;
    } else {   // (sin huecos: partida offline, solo para pruebas)
      if (v.aim3) negPos(v.aim3); if (v.swingAim) negVec(v.swingAim); if (v.aimIn) negVec(v.aimIn);
    }
    seen.clear();
    return v;
  }

  /** view ← g (copia) y, para el invitado, girada. */
  function mirror(view, g, slot) {
    VB.Sim.copyGame(view, g);
    flRivalJob(view);
    if (slot === 1) flip(view);
    return view;
  }
  /* Online V2 «Fluida»: la sim local solo calcula g.jobs del equipo propio (el rival lo mueven sus fotos), pero players.js anima a los
   * rivales con g.jobs[equipo] (postura del que va al balón, gesto del compañero, «¡Mía!», clasificación del salto…). Solo en la VISTA
   * (antes de girar, con los índices canónicos) se calcula el job rival con las poses que se pintan; la memoria por trayectoria
   * (jobMem/jobMemT/jobSwT/jobHop del rival) se guarda aquí entre frames, así no salta de uno a otro. La partida de la sim no se toca. */
  var _rjMem = { id: -1, T: NaN, sw: -9, hop: NaN };
  function flRivalJob(v) {
    var F = v.fl, AI = VB.AI;
    if (!F || !F.loc || (F.loc[0] && F.loc[1]) || !AI || !AI.computeJob || !v.jobs) return;
    var rm = F.loc[0] ? 1 : 0, j = null, i, P = v.teams[rm];
    if (v.mode === 'rally') {
      if (v.jobMem && v.jobMemT && v.jobSwT) {
        var mp = null;
        if (_rjMem.id >= 0) for (i = 0; i < P.length; i++) if (P[i].id === _rjMem.id) mp = P[i];
        v.jobMem[rm] = mp; v.jobMemT[rm] = mp ? _rjMem.T : NaN; v.jobSwT[rm] = _rjMem.sw;
        if (v.jobHop) v.jobHop[rm] = _rjMem.hop;
      }
      try { j = AI.computeJob(v, rm); } catch (e) { j = null; }
      if (v.jobMem && v.jobMemT && v.jobSwT) {
        var m = v.jobMem[rm];
        _rjMem.id = m ? m.id : -1; _rjMem.T = v.jobMemT[rm]; _rjMem.sw = v.jobSwT[rm];
        if (v.jobHop) _rjMem.hop = v.jobHop[rm];
      }
    }
    v.jobs[rm] = j;
  }

  function byId(view, p) {
    if (!p || typeof p !== 'object' || p.id === undefined) return p;
    var L = view.players; for (var i = 0; i < L.length; i++) if (L[i].id === p.id) return L[i];
    return p;
  }
  /** Un evento de la partida canónica → copia para la vista (jugadores de la vista; con slot 1, girado). */
  function mapEvent(e, view, slot) {
    var o = {}, k, v, c, m = slot === 1;
    for (k in e) {
      v = e[k]; c = EVENT[k];
      if (c === 'ref' || (v && typeof v === 'object' && !Array.isArray(v) && v.id !== undefined && v.team !== undefined)) { o[k] = byId(view, v); continue; }
      if (c === 'refs') { o[k] = Array.isArray(v) ? v.map(function (q) { return byId(view, q); }) : v; continue; }   // lista de jugadores
      if (!m) { o[k] = Array.isArray(v) ? v.slice() : v; continue; }
      switch (c) {
        case 'team': o[k] = tf(v); break;
        case 'neg': o[k] = typeof v === 'number' ? -v : v; break;
        case 'vec': o[k] = Array.isArray(v) ? [-v[0], -v[1]] : v; break;
        case 'vec3': o[k] = Array.isArray(v) ? [-v[0], -v[1], v[2]] : v; break;
        case 'swap': o[k] = Array.isArray(v) && v.length === 2 ? [v[1], v[0]] : v; break;
        case 'pairs': o[k] = Array.isArray(v) ? v.map(function (q) { return Array.isArray(q) ? [q[1], q[0]] : q; }) : v; break;
        case 'text': o[k] = k === 'text' ? (e.text1 !== undefined ? e.text1 : textMirror(v)) : e.text; break;
        default: o[k] = Array.isArray(v) ? v.slice() : v;
      }
    }
    return o;
  }
  function mapEvents(evs, view, slot, out) {
    out = out || [];
    for (var i = 0; i < evs.length; i++) out.push(mapEvent(evs[i], view, slot));
    return out;
  }
  /** Entrada construida con la cámara de la vista → mundo canónico (el invitado gira move). Copia; no toca inp. */
  function inputToWorld(inp, slot) {
    var o = {}, k; for (k in inp) o[k] = inp[k];
    o.move = inp.move ? (slot === 1 ? [-inp.move[0], -inp.move[1]] : [inp.move[0], inp.move[1]]) : [0, 0];
    return o;
  }

  VB.NetView = { mirror: mirror, flip: flip, mapEvent: mapEvent, mapEvents: mapEvents, inputToWorld: inputToWorld, textMirror: textMirror,
    FIELDS: FIELDS, PLAYER: PLAYER, EVENT: EVENT, NESTED: NESTED, NOSLOT: NOSLOT };
})();
