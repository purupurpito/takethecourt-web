/* =====================================================================
 * MAKE THE CUT — js/net.js   (owner: net)
 * Modo online, fase 1 (notes/net.md): sesión con rollback entre dos pares, códec de entradas y transportes de prueba.
 * SIN DOM y SIN THREE: funciona igual en el navegador y en Node (tools/nettest.js lo carga con vm junto a sim.js).
 *
 * MODELO (diseño aprobado, notes/net.md): rollback simétrico. Cada máquina simula el partido entero; solo viajan las ENTRADAS con su
 * tic. La entrada propia se aplica con `delay` tics de retraso (2 = 17 ms). Hay dos partidas por máquina:
 *   gc = la CONFIRMADA: solo avanza con las entradas de los dos huecos para ese tic. Es la verdad (huella, estadísticas, final).
 *   gp = la PREDICHA: se pinta. Cada frame: copyGame(gp, gc) y se resimula hasta el tic actual con las entradas propias reales y las
 *        del rival predichas (su último `move`, los botones a falso y el bit `ai` como estaba).
 * El anfitrión (hueco 0 = equipo 0) solo tiene autoridad para REPARAR: cada HASH_EVERY tics confirmados los dos se mandan
 * Sim.stateHash(gc); si no cuadran, el anfitrión manda su foto (Sim.serialize) de ese tic y el invitado la adopta y resimula.
 *
 * API (VB.Net):
 *   new Session({slot: 0|1, link, opts (createGame; el invitado puede pasar null y adopta las del anfitrión), delay, name, record})
 *     .advance(now ms, entrada) → {g (gp), events (para presentar, sin repetir tras un rollback), confirmed (eventos de gc de este frame),
 *                                 status, tick, gcTick, ping, waitMs, unstable, canAI, info}
 *     .request('chal'|'skip'|'tmo')   flanco que viaja en la entrada del siguiente tic
 *     .setAway(bool)                  bit `ai` (nivel): tu jugador pasa a la IA (pestaña oculta)
 *     .vsAI()                         tras 10 s esperando: seguir contra la IA (el hueco del rival lo lleva la IA hasta que vuelva)
 *     .quit()                         abandonar (adiós fiable; el rival gana). Tras el final (o ya juzgado el abandono) solo avisa: no cambia el resultado.
 *                                     Antes de empezar (connecting / starting) no hay partido: result {why:'cancel'} y el rival queda en 'noShow'
 *   ANTES DE EMPEZAR (revisión F3): 20 s sin oír al rival mientras se conecta (CONNECT_MS), su adiós (también el de la época anterior,
 *     tras pedir la revancha) o su salida en la cuenta atrás → status 'ended', result {why:'noShow'} (no cuenta en el récord).
 *     El nombre del rival lo fija el lobby (o.rivalName); el del saludo solo si no había, y siempre limpio (cleanName).
 *   DESCONEXIÓN (notes/net.md «Desconexión y reconexión»): el rival tiene 60 s desde que se perdió para volver, elija quien elija la IA.
 *     Volver = resync del anfitrión (con su foto). Pasados 60 s cada lado juzga por su cuenta: el anfitrión gana (rivalGone) y el
 *     invitado se queda con «no cuenta» (hostGone, valid=false); los dos pueden seguir contra la IA sin que cambie. El invitado contra la IA
 *     no manda entradas: al oír de nuevo al anfitrión pide 'rejoin' y el anfitrión le manda el resync.
 *   VUELTA DEL ANFITRIÓN (fase 6, notes/net.md «Fase 6»): una sesión de hueco 0 SIN opciones (opts null) es un anfitrión que recargó la
 *     página y perdió su partida (adopt). Saluda como un invitado ({k:'hello', back:1}); el invitado, si sigue en partido y no lo ha
 *     dado por ido, contesta con sus opciones; el anfitrión mide el reloj con pings y manda 'ready'; el INVITADO manda entonces el
 *     resync con SU partida confirmada (la autoridad de la instantánea pasa al invitado solo en este caso) y el anfitrión la adopta.
 *     Después todo sigue como siempre (huellas comparadas, reparaciones con la foto del anfitrión). .back (lo pone el lobby) = aviso
 *     «Volviendo al partido…» mientras se conecta; se borra al empezar o al aplicar el resync.
 *     .confirmedGame() / .predictedGame()
 *   Entrada = {move:[x,y] (mundo canónico), hit, jump, jset, chal, skip, tmo, ai}. Se cuantiza ANTES de usarla también en local.
 *   memPair({lag (RTT ms), jit (± ms por sentido), loss (%), seed, clock}) → [linkA, linkB] (Node / pruebas)
 *   BcLink({room, slot, lag, jit, loss}) → enlace por BroadcastChannel (dos pestañas o dos páginas del mismo Chrome)
 *   Enlace = {send(ch, data), poll(now) → [{ch, data}], close()}; ch 'in' = no fiable (entradas), 'ctl' = fiable y en orden.
 *   bot(team, seed, prof) → function(g) → entrada (bot de solo entrada para pruebas; lee con useSlot y deja el hueco 0)
 *   AUDITORÍA (17-nov-2026, notes/net.md «Auditoría»): o.expect (invitado: opciones que anuncia la sala; si no cuadran → 'mismatch'),
 *     resync con id repetido hasta el 'rsok' (lo del canal fiable viejo se pierde al renegociar), los dos recargan → noShow, mensajes
 *     del rival acotados (hash, snapok, resync, delay), tope de 60 s en 'connecting'.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var HZ = (VB.C && VB.C.SIM_HZ) || 120, STEP = 1 / HZ, STEP_MS = 1000 / HZ;
  var PROTO = 1;                 // versión del protocolo (se compara junto con VB.VERSION en el saludo)
  var RING = 8192, RM = RING - 1; // historial de entradas por hueco (68 s)
  var MAXPRED = 24;              // tics de predicción como máximo (200 ms): más allá, la partida espera al rival
  var MAXCATCH = 40;             // tics propios por frame como máximo al ponerse al día
  var MAXSEND = 120;             // entradas por paquete como máximo (redundancia: todo lo que el otro aún no ha confirmado)
  var HASH_EVERY = 120;          // huella cada segundo de partido confirmado
  var START_MS = 1500;           // el tic 0 empieza 1,5 s después del «listo»
  var WARM_CAP_MS = 5000;        // 17-nov-2026: «listo» / arranque esperan a que ESTA máquina compile los gráficos del partido (o.warm), 5 s como mucho
  var REJOIN_MARGIN = 60;        // tics de IA que el anfitrión fija por delante al reconectar al invitado
  var WAIT_AI_MS = 10000, GONE_MS = 60000, UNSTABLE_MS = 1000, EV_PAST_TICKS = 18; // 150 ms
  var CONNECT_MS = 20000;        // revisión F3: sin oír al rival en 20 s mientras se conecta (antes del partido) → no hay partido ('noShow')
  var CONNECT_CAP_MS = 60000;   // auditoría: tope absoluto de 'connecting' desde que empezó (aunque lleguen saludos que no sirven)
  var RS_EVERY_MS = 1500, RS_TRIES = 8;   // auditoría: el resync se repite hasta que el otro lo confirma ('rsok'); lo del canal fiable viejo se pierde al renegociar
  var ADOPT_MS = 40000;          // fase 6: el anfitrión que vuelve tras recargar espera hasta 40 s al invitado (su relink reofrece cada 10 s)
  var EDGE_TTL_MS = 150;         // un botón que no entra en un tic en 150 ms (partida congelada o cuenta atrás) se descarta: nada de golpes «fantasma»
  var B = { hit: 1, jump: 2, jset: 4, chal: 8, skip: 16, tmo: 32, ai: 64 };
  var EDGE = B.hit | B.jump | B.jset | B.chal | B.skip | B.tmo;

  function Sim() { return VB.Sim; }
  /** Nombre del rival tal como lo limpia el lobby (VB.NetRoom.cleanName): sin < > comillas ni controles, nada con @ (nunca un correo),
   *  2-16 caracteres; '' si no vale. El saludo de un cliente modificado no puede poner otro nombre que el de la sala. */
  function cleanName(n) {
    var s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>"`]/g, '').replace(/\s+/g, ' ').trim();
    if (s.indexOf('@') >= 0) return '';
    var out = '', cs = Array.from(s);
    for (var i = 0; i < cs.length && out.length + cs[i].length <= 16; i++) out += cs[i];
    s = out.trim();
    return s.length >= 2 ? s : '';
  }
  function q16(v) { v = +v || 0; v = v > 1 ? 1 : v < -1 ? -1 : v; return Math.round(v * 32767); }
  function bitsOf(inp) {
    if (!inp) return 0;
    return (inp.hit ? B.hit : 0) | (inp.jump ? B.jump : 0) | (inp.jset ? B.jset : 0) | (inp.chal ? B.chal : 0) |
      (inp.skip ? B.skip : 0) | (inp.tmo ? B.tmo : 0) | (inp.ai ? B.ai : 0);
  }
  /** Entrada cuantizada → objeto de entrada de la sim (out se reutiliza). */
  function decode(x, y, b, out) {
    out = out || { move: [0, 0] };
    out.move[0] = x / 32767; out.move[1] = y / 32767;
    out.hit = !!(b & B.hit); out.jump = !!(b & B.jump); out.jset = !!(b & B.jset); out.chal = !!(b & B.chal);
    out.skip = !!(b & B.skip); out.tmo = !!(b & B.tmo); out.ai = !!(b & B.ai); out.switchPlayer = false;
    return out;
  }

  /* ---------- Historial de entradas de un hueco (anillo con etiqueta de tic) ---------- */
  function Ring() { this.X = new Int16Array(RING); this.Y = new Int16Array(RING); this.B = new Uint8Array(RING); this.T = new Int32Array(RING).fill(-1); }
  Ring.prototype.has = function (t) { return t >= 0 && this.T[t & RM] === t; };
  Ring.prototype.put = function (t, x, y, b) { var i = t & RM; this.T[i] = t; this.X[i] = x; this.Y[i] = y; this.B[i] = b; };
  Ring.prototype.dec = function (t, out) { var i = t & RM; return decode(this.X[i], this.Y[i], this.B[i], out); };
  /** Olvida todo lo guardado del tic t en adelante (tras un resync: lo de la partida contra la IA no vale). */
  Ring.prototype.clearFrom = function (t) { var T = this.T; for (var i = 0; i < RING; i++) if (T[i] >= t) T[i] = -1; };

  /* ---------- Paquete de entradas: [1, u32 primer tic, u8 n, n × (i16 x, i16 y, u8 bits), u32 ack, u32 tic del emisor] ---------- */
  // (fase 3: el primer byte lleva además la «época» de la sesión en los 4 bits altos: 1 | época << 4. Una revancha sobre el mismo
  //  enlace es la época siguiente y así un paquete del partido anterior que llegue tarde no se cuela; la época 0 es el byte 1 de siempre)
  function packInputs(ring, first, n, ack, tick, ep) {
    var buf = new Uint8Array(14 + n * 5), dv = new DataView(buf.buffer), o = 6;
    buf[0] = 1 | ((ep & 15) << 4); dv.setUint32(1, first); buf[5] = n;
    for (var k = 0; k < n; k++) { var i = (first + k) & RM; dv.setInt16(o, ring.X[i]); dv.setInt16(o + 2, ring.Y[i]); buf[o + 4] = ring.B[i]; o += 5; }
    dv.setUint32(o, ack); dv.setUint32(o + 4, tick >>> 0);
    return buf;
  }
  function unpackInputs(buf) {
    if (!buf || !buf.length || (buf[0] & 15) !== 1) return null;
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), n = u[5], o = 6, L = [];
    if (u.length < 14 + n * 5) return null;
    for (var k = 0; k < n; k++) { L.push(dv.getInt16(o), dv.getInt16(o + 2), u[o + 4]); o += 5; }
    return { first: dv.getUint32(1), n: n, v: L, ack: dv.getUint32(o), tick: dv.getUint32(o + 4), ep: u[0] >> 4 };
  }

  /* ---------- Sesión ---------- */
  /** Auditoría: ¿las opciones que manda el anfitrión son las que anunciaba la sala? (el invitado lo comprueba al saludar) */
  function sameRoom(co, e) {
    return !!co.even === !!e.even && (+co.bestOf === 3 ? 3 : 1) === (+e.bestOf === 3 ? 3 : 1) && (co.points | 0) === (e.points | 0) &&
      (co.venue === 'beach' ? 'beach' : 'hall') === (e.venue === 'beach' ? 'beach' : 'hall') && (co.net || '') === (e.net || '');   // (Online V2: el modelo de conexión también)
  }
  function Session(o) {
    o = o || {};
    this.slot = o.slot === 1 ? 1 : 0; this.host = this.slot === 0;
    this.link = o.link; this.name = String(o.name || ''); this.rivalName = cleanName(o.rivalName);   // (el del lobby manda; el saludo solo lo pone si no había)
    // fase 3: época (revancha n.º k sobre el mismo enlace: los mensajes de otra época se ignoran), mensajes de la interfaz ('app':
    // revancha, «Continuar»…) y si el rival ya se fue tras el final (bye 'left')
    this.epoch = Math.max(0, Math.min(1e6, o.epoch | 0)); this.appIn = []; this.rivalLeft = false;
    this.delay = Math.max(0, Math.min(8, o.delay == null ? 2 : o.delay | 0));
    this.record = !!o.record; this.rec = this.record ? [] : null;
    this.hashLog = Array.isArray(o.hashLog) ? o.hashLog : null;   // pruebas: [[tic, huella]] de todas las huellas propias
    this.onTick = typeof o.onTick === 'function' ? o.onTick : null; // pruebas: (tic, gc) tras cada paso confirmado
    this.rsPend = null; this.rsId = 0; this.rsIn = 0;   // auditoría: resync pendiente de confirmar, id del último mandado y del último aplicado
    this.expect = o.expect && typeof o.expect === 'object' ? o.expect : null;   // auditoría: invitado: lo que anuncia la sala (even, bestOf, points, venue)
    this.muteBefore = 0; this.syncFloor = -1;   // tras un resync: huellas y fotos de antes no cuentan
    this.log = typeof o.log === 'function' ? o.log : null;
    this.status = 'connecting';   // connecting | starting | playing | waiting | over | ended
    this.opts = null; this.gc = null; this.gp = null;
    this.mine = new Ring(); this.theirs = new Ring();
    this.localTick = 0; this.rHave = 0; this.remoteAck = 0; this.gcTick = 0;
    this.edges = 0; this.edgesAt = -1; this.away = false; this.solo = false; this.valid = true; this.result = null;
    this.goneFlag = false; this.lostAt = -1; this.rivalSolo = false; this.soloEpoch = 0; this.rejoinEpoch = 0; this.rejoinAt = -1e9;
    this.lateAt = -1e9; this.repInvalid = false;
    // fase 6: anfitrión que vuelve tras recargar (sin opciones: adopta la partida del invitado), aviso de vuelta (lo pone el lobby),
    // invitado que ha oído a su anfitrión volver (contesta a su 'ready' con el resync) y «no válido» que avisó el rival
    this.adopt = this.host && !o.opts; this.back = !!o.back; this.hostBack = false; this.rivInvalid = false;
    this.warmFn = typeof o.warm === 'function' ? o.warm : null; this.warmSince = -1; this.startPend = false;
    this.connAt = -1; this.heardAt = -1; this.rttFloor = -1e9;   // revisión F3: plazo de conexión (solo mensajes de esta época) y pongs de antes de un corte
    this.t0 = 0; this.off = 0; this.lastNow = 0; this.lastRecv = 0; this.started = false;
    this.helloAt = -1e9; this.gotHello = false; this.pings = []; this.pingAt = -1e9; this.pingId = 0; this.ready = false;
    this.rtt = 0; this.rttN = 0; this.remoteTick = 0; this.remoteTickAt = 0; this.adv = 0;
    this.waitStart = -1; this.waitMs = 0; this.myHash = {}; this.theirHash = {}; this.snaps = [];
    this.repairPending = false; this.repairs = []; this.mismatches = 0; this.repaired = 0;
    this.cmpOk = 0; this.cmpBad = -1;   // anti-trampas ligero: huellas que cuadraron y tic de la última que no (sin reparar aún)
    this.presTick = 0; this.presKeys = {}; this.presList = []; this.overSeen = false;
    this.stats = { frames: 0, maxDepth: 0, steps: 0, sent: 0, recv: 0, bytesOut: 0, waits: 0, resyncs: 0, rsIn: 0 }; this.rsT = -1;
    this.initEvents = []; this._cand = []; this._conf = [];
    this._ins = [{ move: [0, 0] }, { move: [0, 0] }]; this._pred = { move: [0, 0] };
    this._out = { g: null, events: [], confirmed: [], app: [], status: '', tick: 0, gcTick: 0, ping: 0, waitMs: 0, unstable: false, canAI: false, info: null };
    if (o.opts) this._setOpts(o.opts);
  }
  var SP = Session.prototype;
  SP._log = function (m) { if (this.log) this.log('[net ' + this.slot + '] ' + m); };
  SP._setOpts = function (opts) {
    var S = Sim(), n = {}, k;
    for (k in opts) n[k] = opts[k];
    n.online = true;
    this.opts = n;
    this.gc = S.createGame(n); this.gp = S.createGame(n);
    this.initEvents.length = 0; S.drainEvents(this.gc, this.initEvents); this.gp.events.length = 0;
    // tics 0..delay-1: entrada neutra para los dos (los dos lo saben, no viaja)
    for (var t = 0; t < this.delay; t++) { this.mine.put(t, 0, 0, 0); this.theirs.put(t, 0, 0, 0); }
    this.localTick = 0; this.rHave = this.delay; this.gcTick = 0;
  };
  SP.confirmedGame = function () { return this.gc; };
  SP.predictedGame = function () { return this.gp; };
  /** Fase 6 (repetición online): las dos entradas del último paso confirmado ([hueco 0, hueco 1], decodificadas; objeto reutilizado).
   *  Solo vale dentro de onTick (justo después del Sim.step de gc). */
  SP.stepInputs = function () { return this._ins; };
  SP.request = function (what) { if (B[what] & EDGE) { this.edges |= B[what]; if (this.edgesAt < 0) this.edgesAt = this.lastNow; } };
  SP.setAway = function (on) { this.away = !!on; };
  SP._ctl = function (m) { if (this.epoch) m.ep = this.epoch; try { this.link.send('ctl', JSON.stringify(m)); } catch (e) { } };
  /** Mensaje de la interfaz al rival (fiable, en orden; JSON pequeño): revancha y similares. Llega en r.app del otro lado. */
  SP.sendApp = function (d) { this._ctl({ k: 'app', d: d }); };
  /** Seguir contra la IA (solo esperando al rival y pasados 10 s; force = el abandono por tiempo). El rival puede volver hasta
   *  60 s después de perderse (lostAt). Del lado del invitado el partido no cuenta mientras no vuelva (el resync trae el valid del anfitrión). */
  SP.vsAI = function (force) {
    if (this.solo || this.status !== 'waiting' || (!force && this.waitMs <= WAIT_AI_MS)) return false;
    this.solo = true; this.soloEpoch++;
    if (this.lostAt < 0) this.lostAt = this.waitStart >= 0 ? this.waitStart : this.lastNow;
    if (!this.host) this.valid = false;
    this._ctl({ k: 'solo' }); this._log('seguir contra la IA'); return true;
  };
  SP.quit = function () {
    if (this.status === 'ended') return;
    if (this.status === 'connecting' || this.status === 'starting') {   // antes de empezar: no hay partido (ni derrota ni victoria)
      this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; this.result = { why: 'cancel', win: false }; return;
    }
    if (this.status === 'over' || this.goneFlag) {   // salir tras el final (o ya juzgado el abandono del otro): no es abandonar
      this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; return;
    }
    this._ctl({ k: 'bye', why: 'quit' });
    this.status = 'ended'; this.result = { why: 'quit', win: false };
  };
  /** Pasaron 60 s sin el rival: cada lado juzga por su cuenta (el anfitrión gana; el invitado, sin anfitrión, «no cuenta»). */
  SP._gone = function () {
    if (this.goneFlag) return;
    if (!this.solo) this.vsAI(true);
    this.goneFlag = true;
    if (this.host) this.result = { why: 'rivalGone', win: true };
    else { this.valid = false; this.result = { why: 'hostGone', win: false }; }
    this._ctl({ k: 'bye', why: 'gone' });   // (llega cuando vuelva la red: el otro ya no espera)
    this._log('el rival no volvió en ' + (GONE_MS / 1000) + ' s');
  };
  /** Antes de empezar (conectando o en la cuenta atrás) el rival se fue o no llegó: no hay partido. */
  SP._noShow = function (why) {
    if (this.status !== 'connecting' && this.status !== 'starting') return;
    this.status = 'ended'; this.result = { why: 'noShow', win: false }; this.rivalLeft = true;
    this._log('no hay partido: ' + why);
  };
  /** Anfitrión: el invitado vuelve cuando ya se le dio por ido. */
  SP._late = function (now) { if (now - this.lateAt > 1000) { this.lateAt = now; this._ctl({ k: 'bye', why: 'late' }); } };

  /* ---- reloj: tic objetivo según el t0 común ---- */
  SP._target = function (now) { return Math.floor((now - this.t0) / STEP_MS); };

  /* ---- mensajes ---- */
  SP._recv = function (now) {
    var L = this.link.poll(now), i;
    for (i = 0; i < L.length; i++) {
      var m = L[i];
      if (this.lastRecv && now - this.lastRecv > UNSTABLE_MS) this.rttFloor = now;   // tras un corte: los pongs de pings de antes no son el ping
      this.lastRecv = now; this.stats.recv++;
      if (m.ch === 'in') this._onInputs(m.data, now);
      else { var c = null; try { c = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (e) { } if (c) this._onCtl(c, now); }
    }
    // invitado contra la IA que vuelve a oír al anfitrión: pide volver (el anfitrión contesta con un resync, una vez por «época»)
    if (L.length && !this.host && this.solo && !this.goneFlag && this.status !== 'ended' && now - this.rejoinAt > 500) {
      this.rejoinAt = now; this._ctl({ k: 'rejoin', e: this.soloEpoch });
    }
  };
  SP._onInputs = function (data, now) {
    var p = unpackInputs(data); if (!p || !this.opts || p.ep !== (this.epoch & 15)) return;   // (de otra época: el partido anterior)
    this.heardAt = now;
    for (var k = 0; k < p.n; k++) {
      var t = p.first + k;
      if (t < this.gcTick - RING / 2 || this.theirs.has(t)) continue;
      if (this.solo) continue;   // contra la IA: lo que llegue del rival ya no cuenta (se reconecta con resync)
      this.theirs.put(t, p.v[k * 3], p.v[k * 3 + 1], p.v[k * 3 + 2]);
    }
    while (this.theirs.has(this.rHave)) this.rHave++;
    if (p.ack > this.remoteAck) this.remoteAck = p.ack;
    if (p.tick >= this.remoteTick) { this.remoteTick = p.tick; this.remoteTickAt = now; }
    if (this.host && this.solo) { if (this.goneFlag) this._late(now); else this._resync(now); }   // el invitado vuelve (el anfitrión siguió contra la IA)
  };
  SP._onCtl = function (c, now) {
    var S = Sim();
    // revisión F3: el rival se fue desde el partido anterior (pulsó «Revancha» y luego «Volver al menú» antes del «go»): su adiós es
    // de la época anterior, pero esta sesión aún no ha empezado y nunca llegará; sin esto se quedaba «conectando» para siempre
    if (c.k === 'bye' && (c.ep | 0) === this.epoch - 1 && (c.why === 'left' || c.why === 'quit' || c.why === 'gone')) { this._noShow('el rival se fue (época anterior)'); return; }
    if ((c.ep | 0) !== this.epoch) return;   // de otra época (el partido anterior a una revancha): no cuenta
    this.heardAt = now;
    switch (c.k) {
      case 'app': if (this.appIn.length < 64) this.appIn.push(c.d); break;
      case 'hello':
        if (!this.rivalName) this.rivalName = cleanName(c.name);
        if (c.v !== PROTO || c.ver !== (VB.VERSION || '')) { this._ctl({ k: 'bye', why: 'version', ver: VB.VERSION || '' }); this.status = 'ended'; this.result = { why: 'version', rv: String(c.ver || '') }; return; }
        if (this.host && this.adopt) {   // fase 6: el anfitrión vuelve; el invitado le da las opciones (y luego su partida)
          if (!this.gotHello && c.back && c.cfg && c.cfg.opts && !this.opts) {
            this.gotHello = true; this.delay = c.cfg.delay != null ? Math.max(0, Math.min(8, c.cfg.delay | 0)) : this.delay;
            this._setOpts(c.cfg.opts); this.pings.length = 0; this.pingAt = -1e9;
          }
        } else if (this.host) {
          var live = this.status === 'playing' || this.status === 'waiting' || this.status === 'starting';
          if (this.status === 'over' || this.status === 'ended') return;
          if (live && this.goneFlag) { this._ctl({ k: 'bye', why: 'late' }); return; }
          this._ctl({ k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, cfg: { opts: this.opts, delay: this.delay }, live: live });
        } else if (c.back) {   // fase 6: el anfitrión recargó y vuelve: si seguimos en partido, le damos las opciones
          if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); return; }
          // auditoría: el invitado también recargó (sin opciones): nadie tiene la partida → los dos acaban ya en «no hay partido»
          if (!this.opts) { this._ctl({ k: 'bye', why: 'gone' }); this._noShow('los dos recargaron'); return; }
          this.rsIn = 0;   // (el anfitrión que vuelve es una sesión nueva: sus resync empiezan otra vez en 1)
          if (!this.opts || (this.status !== 'playing' && this.status !== 'waiting')) return;
          this.hostBack = true;
          this._ctl({ k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, cfg: { opts: this.opts, delay: this.delay }, live: true, back: 1 });
        } else if (!this.gotHello) {
          this.gotHello = true;
          if (!this.opts) {
            var co = c.cfg && c.cfg.opts;
            if (!co || typeof co !== 'object' || (this.expect && !sameRoom(co, this.expect))) {   // auditoría: la sala anunciaba otra cosa («Igualado», sets, puntos, sede)
              this._ctl({ k: 'bye', why: 'mismatch' }); this.status = 'ended'; this.result = { why: 'mismatch', win: false }; this._log('la sala no coincide con lo anunciado'); return;
            }
            this.delay = c.cfg.delay != null ? Math.max(0, Math.min(8, c.cfg.delay | 0)) : this.delay; this._setOpts(co);
          }
          this.pings.length = 0; this.pingAt = -1e9;
        }
        break;
      case 'ping': this._ctl({ k: 'pong', t: c.t, th: now, id: c.id }); break;
      case 'pong':
        var rtt = now - c.t;
        if (this.rttN && c.t < this.rttFloor) break;   // (ping mandado antes de un corte: tras volver la red marcaba «673 ms» unos segundos)
        if (rtt < 3000 || !this.rttN) { this.rtt = this.rttN ? this.rtt * 0.8 + rtt * 0.2 : rtt; this.rttN++; }   // (un pong que llega tras un corte no es el ping: «4571 ms»)
        if (rtt < 3000) { this.rttLast = rtt; this.rttSeq = (this.rttSeq || 0) + 1; }   // (crudo, para el informe de red: js/netlog.js)
        if ((!this.host || this.adopt) && !this.ready && c.id < 1000) this.pings.push({ rtt: rtt, off: c.th - (c.t + now) / 2 });
        break;
      case 'ready':
        if (!this.host) {   // fase 6: el anfitrión que volvió ya tiene reloj: le mandamos NUESTRA partida (autoridad del invitado)
          if (this.hostBack && !this.goneFlag && (this.status === 'playing' || this.status === 'waiting')) {
            this.hostBack = false; this.valid = !this.repInvalid && !this.rivInvalid;   // (seguir contra la IA no cuenta si vuelve)
            this._resync(now); this._log('el anfitrión vuelve: le mando mi partida');
          }
          break;
        }
        if (this.status === 'connecting') {
          if (!this._warmOk(now)) { this.startPend = true; break; }   // (aún compilando: arranca en advance cuando acabe)
          this._begin(now);
        } else if (this.status === 'starting') this._ctl({ k: 'start', t0: this.t0 });
        else if (this.status === 'playing' || this.status === 'waiting') { if (this.goneFlag) this._late(now); else this._resync(now); }
        break;
      case 'rejoin':   // el invitado siguió contra la IA y vuelve a oírnos
        if (!this.host || (this.status !== 'playing' && this.status !== 'waiting')) break;
        if (this.goneFlag) { this._late(now); break; }
        if ((c.e | 0) > this.rejoinEpoch) { this.rejoinEpoch = c.e | 0; this._resync(now); }
        break;
      case 'start':
        if (this.host || !this.ready) break;
        this.t0 = c.t0 - this.off; this.status = 'starting';
        break;
      case 'hash':   // (auditoría: solo tics plausibles, múltiplos de HASH_EVERY y cerca del nuestro; si no, un rival podía llenar theirHash sin fin)
        var hk = c.t;
        if (typeof hk !== 'number' || (hk | 0) !== hk || hk % HASH_EVERY || hk <= this.gcTick - HASH_EVERY * 20 || hk > this.gcTick + RING / 2) break;
        this.theirHash[hk] = c.h >>> 0; this._checkHash(hk, now);
        break;
      case 'snap': if (!this.host) this._applySnap(c, now); break;
      case 'snapok':
        if (!this.host || !this.repairPending) break;   // (auditoría: solo si hay una reparación en curso)
        this.repairPending = false; if (this.cmpBad <= (c.t | 0)) this.cmpBad = -1;
        for (var ht in this.theirHash) if (+ht > c.t) this._checkHash(+ht, now);
        break;
      case 'resync':
        var rid = c.id | 0;
        if (rid && rid <= this.rsIn) { this._ctl({ k: 'rsok', id: rid }); break; }   // (auditoría: repetido: ya aplicado; se confirma otra vez)
        if (this.host && !this.adopt) break;   // (fase 6: el anfitrión que volvió adopta la del invitado, una vez)
        if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); break; }   // ya juzgado: no se vuelve
        if (this._applyResync(c, now) && rid) { this.rsIn = rid; this._ctl({ k: 'rsok', id: rid }); }
        break;
      case 'rsok': if (this.rsPend && (c.id | 0) === this.rsPend.m.id) this.rsPend = null; break;
      case 'solo': this.rivalSolo = true; break;   // el rival sigue contra la IA mientras espera: puede volver (rejoin / resync)
      case 'invalid': this.valid = false; this.rivInvalid = true; break;
      case 'bye':
        if (c.why === 'left' || c.why === 'quit' || c.why === 'gone' || c.why === 'late') this.rivalLeft = true;   // (la revancha ya no es posible)
        if (this.status === 'ended' || this.status === 'over') break;
        if ((this.status === 'connecting' || this.status === 'starting') && c.why !== 'version') { this._noShow('el rival se fue antes de empezar'); break; }
        if (this.goneFlag || c.why === 'left') break;   // ya juzgado por tiempo (se sigue contra la IA) / el rival solo se fue tras el final
        this.status = 'ended';
        this.result = c.why === 'quit' ? { why: 'rivalQuit', win: true } : c.why === 'gone' ? { why: 'rivalGone', win: true } :
          c.why === 'late' ? { why: 'late', win: false } : { why: c.why || 'bye', win: false };
        if (c.why === 'version') this.result.rv = String(c.ver || '');   // (versión del rival: main.js dice quién tiene que reiniciar)
        if (c.why === 'gone' && !this.host) { this.valid = false; this.result = { why: 'hostGone', win: false }; }
        break;
    }
  };

  /* ---- huella y reparación ---- */
  SP._hashTick = function () {
    var S = Sim(), t = this.gcTick, h = S.stateHash(this.gc) >>> 0;
    this.myHash[t] = h; if (!this.solo) this._ctl({ k: 'hash', t: t, h: h });   // (contra la IA las huellas no se comparan)
    if (this.hashLog) this.hashLog.push([t, h]);
    if (this.host) { this.snaps.push({ t: t, d: S.serialize(this.gc) }); if (this.snaps.length > 6) this.snaps.shift(); }
    // poda (≈ 20 s)
    var old = t - HASH_EVERY * 20;
    if (this.myHash[old] !== undefined) delete this.myHash[old];
    if (this.theirHash[old] !== undefined) delete this.theirHash[old];
    this._checkHash(t, this.lastNow);
  };
  SP._checkHash = function (t, now) {
    if (t <= this.syncFloor) return;
    var a = this.myHash[t], b = this.theirHash[t];
    if (a === undefined || b === undefined) return;
    if (a === b) { this.cmpOk++; if (t > this.cmpBad) this.cmpBad = -1; return; }
    if (t > this.cmpBad) this.cmpBad = t;
    if (!this.host) return;                 // el invitado espera la foto del anfitrión
    if (this.repairPending && now - this.repairAt < 3000) return;
    var sn = null; for (var i = 0; i < this.snaps.length; i++) if (this.snaps[i].t === t) sn = this.snaps[i];
    if (!sn) return;
    this.mismatches++; this.repairPending = true; this.repairAt = now;
    this._ctl({ k: 'snap', t: t, d: sn.d }); this._log('huella distinta en el tic ' + t + ': manda la foto');
  };
  SP._applySnap = function (c, now) {
    var S = Sim(), t = c.t | 0;
    if (t > this.gcTick || t < this.gcTick - RING / 2 || t < this.syncFloor) return;
    var to = this.gcTick;
    if (!S.deserialize(c.d, this.gc)) return;
    this.gcTick = t; this.mismatches++; this.repaired++; this.cmpBad = -1;
    this._confirm(to, true);               // resimula hasta donde estaba, con las entradas que ya tenía (sin presentar eventos)
    for (var k = t + HASH_EVERY; k <= this.gcTick; k += HASH_EVERY) if (this.myHash[k] !== undefined) this._ctl({ k: 'hash', t: k, h: this.myHash[k] });
    this._ctl({ k: 'snapok', t: t });
    this.repairs.push(now); while (this.repairs.length && now - this.repairs[0] > 60000) this.repairs.shift();
    if (this.repairs.length >= 3 && this.valid) { this.valid = false; this.repInvalid = true; this._ctl({ k: 'invalid' }); this._log('3 reparaciones en 60 s: partido no válido'); }
    this._log('reparado en el tic ' + t);
  };

  /* ---- reconexión: el anfitrión fija la IA en el hueco del invitado hasta F y le manda la foto de gc y las entradas desde ahí ---- */
  SP._resync = function (now) {
    var S = Sim(), sv = 1 - this.slot;
    if (this.status === 'starting') return;
    var F = this.localTick + this.delay + REJOIN_MARGIN;
    for (var t = this.rHave; t < F; t++) if (!this.theirs.has(t)) this.theirs.put(t, 0, 0, B.ai);
    while (this.theirs.has(this.rHave)) this.rHave++;
    this._confirm(this.localTick, false);
    var T = this.gcTick, mine = [], fab = [], k, i;
    for (k = T; this.mine.has(k); k++) { i = k & RM; mine.push(this.mine.X[i], this.mine.Y[i], this.mine.B[i]); }
    for (k = T; k < F; k++) { i = k & RM; fab.push(this.theirs.X[i], this.theirs.Y[i], this.theirs.B[i]); }
    this.solo = false; this.rivalSolo = false; this.lostAt = -1; this.waitStart = -1; this.stats.resyncs++; this.syncFloor = T; this.repairPending = false;
    this.theirHash = {}; this.cmpBad = -1;   // (las de antes y las de la partida del invitado contra la IA no valen)
    var rm = { k: 'resync', T: T, F: F, d: S.serialize(this.gc), t0: this.t0, mine: mine, fab: fab, valid: this.valid, se: this.soloEpoch, id: ++this.rsId };
    this._ctl(rm); this.rsPend = { m: rm, at: now, n: 0 };   // (auditoría: se repite hasta el 'rsok')
    this._log('resync: foto del tic ' + T + ', IA del rival hasta ' + F);
    void sv;
  };
  SP._applyResync = function (c, now) {
    var S = Sim(), T = c.T | 0, F = c.F | 0, k, j;
    // auditoría: un mensaje mal formado (o malicioso) no puede colgar la pestaña: arrays de verdad y de tamaño acotado
    if (!Array.isArray(c.mine) || !Array.isArray(c.fab) || c.mine.length > 3 * RING || c.fab.length > 3 * RING || F < T || F - T > RING) return false;
    if (!this.opts || !S.deserialize(c.d, this.gc)) return false;
    this.gcTick = T;
    this.mine.clearFrom(T); this.theirs.clearFrom(T);   // lo de la partida contra la IA (o de antes de cortarse) ya no vale
    for (k = T, j = 0; j < c.mine.length; k++, j += 3) this.theirs.put(k, c.mine[j], c.mine[j + 1], c.mine[j + 2]);
    for (k = T, j = 0; j < c.fab.length; k++, j += 3) this.mine.put(k, c.fab[j], c.fab[j + 1], c.fab[j + 2]);
    this.rHave = T; while (this.theirs.has(this.rHave)) this.rHave++;
    this.localTick = T; this.t0 = c.t0 - this.off; this.solo = false; this.rivalSolo = false; this.lostAt = -1;
    this.valid = c.valid !== false && !this.repInvalid;   // (las reparaciones propias ya se avisaron con 'invalid'; seguir contra la IA no cuenta si se vuelve)
    if (this.status !== 'over') this.result = null;
    this.edges = 0; this.edgesAt = -1;
    this.myHash = {}; this.theirHash = {}; this.syncFloor = T; this.cmpBad = -1;
    if (this.status !== 'over') this.status = 'playing';
    this.waitStart = -1; this.started = true; this.stats.resyncs++; this.stats.rsIn++; this.rsT = T;   // (rsIn / rsT: main.js rehace la hoja del lado que salta, auditoría)
    this.presTick = Math.max(T, this._target(now)); this.muteBefore = this.presTick; this.presKeys = {}; this.presList.length = 0;   // lo de antes de volver no suena
    this.remoteAck = Math.max(this.remoteAck, F);
    if (this.adopt) { this.adopt = false; this.rejoinEpoch = Math.max(this.rejoinEpoch, c.se | 0); }   // (fase 6: ya es un anfitrión normal)
    this.back = false;
    this._log('resync aplicado: tic ' + T + ', mando desde ' + F);
    return true;
  };

  /* ---- avance confirmado: gc mientras haya las dos entradas (hasta el tic `upTo`) ---- */
  SP._confirm = function (upTo, silent) {
    var S = Sim(), ins = this._ins, me = this.slot, ot = 1 - me;
    while (this.gcTick < upTo && this.mine.has(this.gcTick) && this.theirs.has(this.gcTick)) {
      var t = this.gcTick;
      this.mine.dec(t, ins[me]); this.theirs.dec(t, ins[ot]);
      if (this.rec && !silent) this._recIn(t);
      S.step(this.gc, STEP, ins);
      this.gcTick = t + 1; this.stats.steps++;
      if (this.onTick && !silent) this.onTick(this.gcTick, this.gc);
      var ev = this.gc.events;
      if (ev.length) {
        if (!silent) for (var i = 0; i < ev.length; i++) { ev[i]._tick = t; this._cand.push(ev[i]); this._conf.push(ev[i]); }
        ev.length = 0;
      }
      if (this.gcTick % HASH_EVERY === 0) {
        if (silent) this.myHash[this.gcTick] = S.stateHash(this.gc) >>> 0;
        else this._hashTick();
      }
    }
  };
  SP._recIn = function (t) {
    var a = this.slot === 0 ? this.mine : this.theirs, b = this.slot === 0 ? this.theirs : this.mine, i = t & RM;
    this.rec[t] = [a.X[i], a.Y[i], a.B[i], b.X[i], b.Y[i], b.B[i]];
  };

  /* ---- presentación de eventos: clave (tic, tipo, jugador, equipo); el punto por marcador; gameOver solo confirmado ---- */
  function evKey(e) {
    if (e.type === 'point') return 'P' + (e.score ? e.score.join('-') : '') + '/' + (e.sets ? e.sets.join('-') : '') + '/' + e.team;
    var pid = e.player && typeof e.player === 'object' ? e.player.id : -1;
    return e._tick + ':' + e.type + ':' + pid + ':' + (e.team == null ? '' : e.team);
  }
  // eventos de solo sonido/efecto: si aparecen tras un rollback de más de 150 ms no se presentan (los de marcador y partido, siempre)
  var SENSORY = { hit: 1, block: 1, blockPress: 1, land: 1, landPlayer: 1, net: 1, netTouch: 1, bounce: 1, dive: 1, toss: 1, jump: 1, swing: 1, miss: 1, juggle: 1, dribble: 1, feint: 1, set: 1, whistle: 1 };
  SP._present = function (out) {
    var C = this._cand, i;
    for (i = 0; i < C.length; i++) {
      var e = C[i], t = e._tick;
      if (e.type === 'gameOver' && !e._conf) continue;
      if (t < this.muteBefore && e.type !== 'gameOver') continue;   // tras una reconexión: lo de antes de volver no se presenta
      var k = evKey(e), seen = this.presKeys[k];
      // (un punto predicho que el rollback anuló no tapa otro punto con el mismo marcador más tarde: a más de 2 s es otro)
      if (seen !== undefined && !(e.type === 'point' && Math.abs(t - seen) > 240)) continue;
      if (t < this.presTick && this.presTick - t > EV_PAST_TICKS && SENSORY[e.type] === 1) { this.presKeys[k] = t; this.presList.push(k); continue; }   // golpe del pasado lejano: sin sonido ni efecto
      this.presKeys[k] = t; this.presList.push(k);
      out.push(e);
    }
    C.length = 0;
    if (this.presList.length > 400) {   // poda de claves viejas
      var lim = this.gcTick - 600, keep = [];
      for (i = 0; i < this.presList.length; i++) { var kk = this.presList[i]; if (this.presKeys[kk] >= lim) keep.push(kk); else delete this.presKeys[kk]; }
      this.presList = keep;
    }
  };

  /* ---- un frame ---- */
  SP.advance = function (now, inp) {
    var S = Sim(), out = this._out, i;
    out.events = []; out.confirmed = []; out.app = this.appIn.length ? this.appIn.splice(0) : [];
    this._cand = []; this._conf = [];
    if (this.link) this._recv(now);
    var dtF = this.lastNow ? now - this.lastNow : 0; this.lastNow = now;
    this.stats.frames++;
    if (inp) this.edges |= bitsOf(inp) & EDGE;

    // saludo, pings y reloj común
    if (this.connAt < 0) this.connAt = now;
    if (this.status === 'connecting' && now - Math.max(this.connAt, this.heardAt) > (this.adopt ? ADOPT_MS : CONNECT_MS)) this._noShow('sin noticias del rival en ' + (CONNECT_MS / 1000) + ' s');
    else if (this.status === 'connecting' && now - this.connAt > CONNECT_CAP_MS) this._noShow('no se ha podido empezar en ' + (CONNECT_CAP_MS / 1000) + ' s');
    if (this.rsPend) {   // auditoría: resync sin confirmar (se perdió con la conexión vieja): otra vez, hasta RS_TRIES
      if (this.goneFlag || this.status === 'ended' || this.status === 'over' || this.rsPend.n >= RS_TRIES) this.rsPend = null;
      else if (now - this.rsPend.at > RS_EVERY_MS) { this.rsPend.at = now; this.rsPend.n++; this._ctl(this.rsPend.m); this._log('resync sin confirmar: lo repito'); }
    }
    if (this.status === 'connecting') {
      if ((!this.host || this.adopt) && !this.gotHello && now - this.helloAt > 500) { this.helloAt = now; this._ctl(this.adopt ? { k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name, back: 1 } : { k: 'hello', v: PROTO, ver: VB.VERSION || '', name: this.name }); }
      if ((!this.host || this.adopt) && this.gotHello && !this.ready) {
        if (this.pings.length < 8 && now - this.pingAt > 60) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: this.pingId++ }); }
        if ((this.pings.length >= 8 || (this.pings.length >= 3 && this.pingId > 30)) && this._warmOk(now)) {
          var best = this.pings.slice().sort(function (a, b) { return a.rtt - b.rtt; }).slice(0, 3);
          var offs = best.map(function (p) { return p.off; }).sort(function (a, b) { return a - b; });
          this.off = offs[offs.length >> 1]; this.ready = true; this._ctl({ k: 'ready' });
          this._log('reloj: desfase ' + this.off.toFixed(1) + ' ms, RTT ' + best[0].rtt.toFixed(1) + ' ms');
        } else if (this.pingId > 30 && this.pings.length < 3) { this.pingId = 0; this.pings.length = 0; }   // reintento
      }
    }
    if (this.startPend && this.status === 'connecting' && this._warmOk(now)) { this.startPend = false; this._begin(now); }
    if (this.status === 'starting' && now >= this.t0) { this.status = 'playing'; this.started = true; this.back = false; this.lastRecv = now; }   // (auditoría: en la cuenta atrás no viaja nada: sin esto «Conexión inestable» parpadeaba al empezar)
    // botones: en la cuenta atrás no cuentan; si no entran en un tic en EDGE_TTL_MS (partida congelada) se descartan
    if (this.edges && this.edgesAt < 0) this.edgesAt = now;
    if (this.status === 'connecting' || this.status === 'starting' || (this.edges && now - this.edgesAt > EDGE_TTL_MS)) this.edges = 0;
    if (!this.edges) this.edgesAt = -1;
    // pings de RTT (cada segundo, los dos)
    if ((this.status === 'playing' || this.status === 'waiting') && now - this.pingAt > 1000) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: 1000 + (this.pingId++) }); }

    var playing = this.status === 'playing' || this.status === 'waiting' || this.status === 'over';
    if (playing && this.opts) {
      var target = this._target(now), budget = this.maxCatch > 0 ? Math.min(this.maxCatch, 600) : MAXCATCH, stalled = false;   // (maxCatch: pestaña oculta, main.js)
      if (this.solo) {   // contra la IA: el hueco del rival lo lleva la IA (bit ai) en todos los tics que hagan falta
        for (var ft = this.rHave; ft < this.localTick + this.delay + MAXCATCH + 1; ft++) if (!this.theirs.has(ft)) this.theirs.put(ft, 0, 0, B.ai);
        while (this.theirs.has(this.rHave)) this.rHave++;
      }
      var mv = inp && inp.move ? inp.move : null, mx = mv ? q16(mv[0]) : 0, my = mv ? q16(mv[1]) : 0;
      var lvl = (inp && inp.ai) || this.away ? B.ai : 0;
      while (this.localTick < target && budget-- > 0) {
        if (this.localTick - this.rHave >= MAXPRED) { stalled = true; break; }
        var st = this.localTick + this.delay;
        if (!this.mine.has(st)) { this.mine.put(st, mx, my, this.edges | lvl); this.edges = 0; this.edgesAt = -1; }
        this.localTick++;
      }
      if (stalled) {
        if (this.waitStart < 0) { this.waitStart = now; this.stats.waits++; }
        this.t0 = now - this.localTick * STEP_MS;   // el reloj se congela: al volver no hay ráfaga
      } else if (this.localTick - this.rHave < MAXPRED) this.waitStart = -1;   // (fase 3: con pantallas de más de 120 Hz un frame sin tic que hacer no es «ya no espero»: antes la espera parpadeaba y nunca llegaba a los 10 s)
      this.waitMs = this.waitStart >= 0 ? now - this.waitStart : 0;
      if (this.status !== 'over') this.status = this.waitStart >= 0 && this.waitMs > 100 ? 'waiting' : 'playing';
      // el rival no vuelve en 60 s desde que se perdió (esperando o ya contra la IA): abandono por tiempo
      var lostFor = this.solo ? (this.lostAt >= 0 ? now - this.lostAt : 0) : this.waitMs;
      if (lostFor > GONE_MS && !this.goneFlag && this.status !== 'over') this._gone();
      this.goneIn = lostFor > 0 && !this.goneFlag && this.status !== 'over' ? Math.max(0, GONE_MS - lostFor) : 0;   // (HUD: «si no vuelve en N s»)
      // entradas al rival: todo lo que aún no ha confirmado (redundancia contra la pérdida). Salen en cuanto se generan los tics de
      // este frame, ANTES de confirmar/predecir/presentar (17-nov-2026: antes iban al final del frame; < 1 ms, pero gratis)
      var have = this.localTick + this.delay, from = Math.max(this.remoteAck, have - MAXSEND * 8);
      if (this.solo && !this.host) { /* invitado contra la IA: no manda entradas (al volver pide 'rejoin') */ }
      else if (this.link && have > from) {
        for (var a = from, np = 0; a < have && np < 4; a += 255, np++) {
          var n = Math.min(255, have - a), pk = packInputs(this.mine, a, n, this.rHave, this.localTick, this.epoch);
          this.link.send('in', pk); this.stats.sent++; this.stats.bytesOut += pk.length;
        }
      } else if (this.link) { var pk0 = packInputs(this.mine, have, 0, this.rHave, this.localTick, this.epoch); this.link.send('in', pk0); }
      // ventaja de frames (GGPO): si vamos por delante del rival más de 1,5 tics de media, cedemos poco a poco
      if (this.rttN && this.remoteTickAt && !this.solo && !stalled) {
        var est = this.remoteTick + (now - this.remoteTickAt + this.rtt / 2) / STEP_MS, adv = this.localTick - est;
        this.adv = this.adv * 0.95 + adv * 0.05;
        if (this.adv > 1.5) this.t0 += STEP_MS * 0.125;
      }
      // confirmada y predicha
      this._confirm(this.localTick, false);
      for (i = 0; i < this._conf.length; i++) this._conf[i]._conf = true;
      if (this._conf.length) for (i = 0; i < this._conf.length; i++) {
        out.confirmed.push(this._conf[i]);
        if (this._conf[i].type === 'gameOver') {
          this.status = 'over';
          if (this.solo && !this.goneFlag) this._gone();   // acabó contra la IA sin que el rival volviera: abandono
          if (!this.result) {
            this.result = { why: 'over', win: this._conf[i].team === this.slot };
            // anti-trampas ligero (sin servidor no hay árbitro): el final solo cuenta si las huellas de los dos lados cuadraban al
            // acabar: alguna comparada y ninguna distinta sin reparar. Si no, «no válido» (NetRec: no suma ni resta)
            if (!this.cmpOk || this.cmpBad >= 0) { this.result.unverified = true; this._log('final sin huellas que cuadren: no válido'); }
          }
        }
      }
      this._predict();
      this._present(out.events);
      this.presTick = Math.max(this.presTick, this.localTick);
    }
    out.g = this.gp; out.status = this.status; out.tick = this.localTick; out.gcTick = this.gcTick;
    out.ping = Math.round(this.rtt); out.waitMs = this.waitMs;
    out.unstable = (this.status === 'playing' || this.status === 'waiting') && !this.solo && now - this.lastRecv > UNSTABLE_MS;
    out.canAI = this.status === 'waiting' && this.waitMs > WAIT_AI_MS && !this.solo;
    out.goneIn = this.goneIn || 0;
    out.startIn = this.status === 'starting' ? Math.max(0, this.t0 - now) : 0;
    out.solo = this.solo; out.valid = this.valid; out.result = this.result; out.rivalSolo = this.rivalSolo; out.gone = this.goneFlag; out.rivalLeft = this.rivalLeft;
    void dtF;
    return out;
  };
  /** Anfitrión: el tic 0 dentro de START_MS (los dos ya han compilado los gráficos del partido o se acabó WARM_CAP_MS). */
  SP._begin = function (now) {
    this.t0 = now + START_MS; this.status = 'starting';
    this._ctl({ k: 'start', t0: this.t0 }); this._log('empieza en ' + START_MS + ' ms');
  };
  /** ¿Ha acabado esta máquina de preparar el partido (programas compilados y primer dibujo)? Sin o.warm, siempre; con tope. */
  SP._warmOk = function (now) {
    if (!this.warmFn) return true;
    if (this.warmSince < 0) this.warmSince = now;
    var ok = true; try { ok = !!this.warmFn(); } catch (e) { ok = true; }
    if (!ok && now - this.warmSince > WARM_CAP_MS) { ok = true; this._log('sigo sin acabar de compilar en ' + WARM_CAP_MS + ' ms: empiezo igual'); }
    if (ok) this.warmFn = null;
    return ok;
  };
  SP._predict = function () {
    var S = Sim(), gp = this.gp, ins = this._ins, me = this.slot, ot = 1 - me, P = this._pred;
    S.copyGame(gp, this.gc);
    var depth = this.localTick - this.gcTick;
    if (depth > this.stats.maxDepth) this.stats.maxDepth = depth;
    this.stats.depth = depth;   // (rollback de este frame, para el informe de red: js/netlog.js)
    if (depth <= 0) return;
    // predicción del rival: su última entrada conocida, con los flancos a falso (el bit ai se mantiene)
    var lk = this.rHave - 1;
    if (lk >= 0 && this.theirs.has(lk)) { var j = lk & RM; decode(this.theirs.X[j], this.theirs.Y[j], this.theirs.B[j] & ~EDGE, P); }
    else decode(0, 0, 0, P);
    for (var t = this.gcTick; t < this.localTick; t++) {
      this.mine.dec(t, ins[me]);
      if (this.theirs.has(t)) this.theirs.dec(t, ins[ot]); else { var q = ins[ot]; q.move[0] = P.move[0]; q.move[1] = P.move[1]; q.hit = q.jump = q.jset = q.chal = q.skip = q.tmo = false; q.ai = P.ai; q.switchPlayer = false; }
      S.step(gp, STEP, ins);
      var ev = gp.events;
      if (ev.length) { for (var i = 0; i < ev.length; i++) { ev[i]._tick = t; this._cand.push(ev[i]); } ev.length = 0; }
    }
  };

  /* ---------- Simulador de red (latencia, variación, pérdida) común a MemLink y BcLink ---------- */
  function mulberry(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** Retraso de un sentido (ms) y pérdida: lag = RTT (ida = lag/2), jit = ± variación de un sentido, loss = % (solo canal 'in'). */
  function Shaper(o, seed) {
    this.lag = Math.max(0, +o.lag || 0); this.jit = Math.max(0, +o.jit || 0); this.loss = Math.max(0, Math.min(90, +o.loss || 0));
    this.r = mulberry(seed || 1); this.lastCtl = 0; this.down = 0;
  }
  Shaper.prototype.due = function (ch, now) {
    if (ch === 'in' && (now < this.down || this.r() * 100 < this.loss)) return -1;
    var d = this.lag / 2 + (this.jit ? (this.r() * 2 - 1) * this.jit : 0), at = now + Math.max(0, d);
    if (ch === 'ctl') { if (now < this.down) at = Math.max(at, this.down + this.lag / 2); at = Math.max(at, this.lastCtl); this.lastCtl = at; }   // fiable y en orden
    return at;
  };

  /** Par de enlaces en memoria (Node / pruebas). clock() = reloj común en ms (el de la prueba). down(ms) corta la red ms
   *  (las entradas se pierden; el control llega al volver, como un canal fiable). flush() vacía lo que está en vuelo. */
  function memPair(o) {
    o = o || {};
    var clock = o.clock || function () { return Date.now(); };
    var A = { q: [], shaper: new Shaper(o, (o.seed || 1) * 2 + 1) }, Bq = { q: [], shaper: new Shaper(o, (o.seed || 1) * 2 + 2) };
    function mk(self, peer) {
      return {
        send: function (ch, data) {
          var now = clock(), at = self.shaper.due(ch, now); if (at < 0) return;
          var d = data instanceof Uint8Array ? new Uint8Array(data) : data;
          peer.q.push({ at: at, ch: ch, data: d, n: peer.n = (peer.n || 0) + 1 });
        },
        poll: function () {
          var now = clock(), out = [], keep = [];
          peer.q; // (simetría)
          self.q.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
          for (var i = 0; i < self.q.length; i++) { var m = self.q[i]; if (m.at <= now) out.push({ ch: m.ch, data: m.data }); else keep.push(m); }
          self.q = keep; return out;
        },
        down: function (ms) { var t = clock() + ms; A.shaper.down = t; Bq.shaper.down = t; },
        flush: function () { A.q.length = 0; Bq.q.length = 0; },
        set: function (k, v) { A.shaper[k] = v; Bq.shaper[k] = v; },
        close: function () { }
      };
    }
    return [mk(A, Bq), mk(Bq, A)];
  }

  /** Enlace por BroadcastChannel entre dos pestañas / páginas del mismo origen, con el simulador de red (?lag=&jit=&loss=). */
  function BcLink(o) {
    o = o || {};
    var self = this, slot = o.slot === 1 ? 1 : 0;
    this.slot = slot; this.q = []; this.n = 0; this.shaper = new Shaper(o, (o.seed || 7) + slot * 31);
    this.now = function () { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); };
    this.bc = new BroadcastChannel('mtc-net-' + String(o.room || 'prueba'));
    // el retraso se aplica al RECIBIR (cada página con su reloj): así no hacen falta temporizadores
    this.bc.onmessage = function (ev) {
      var m = ev.data; if (!m || m.from === slot) return;
      var at = self.shaper.due(m.ch, self.now()); if (at < 0) return;
      self.q.push({ at: at, ch: m.ch, data: m.data, n: ++self.n });
    };
  }
  BcLink.prototype.send = function (ch, data) { try { this.bc.postMessage({ from: this.slot, ch: ch, data: data }); } catch (e) { } };
  BcLink.prototype.poll = function (now) {
    var out = [], keep = [], q = this.q; now = this.now();
    q.sort(function (a, b) { return a.at - b.at || a.n - b.n; });
    for (var i = 0; i < q.length; i++) { if (q[i].at <= now) out.push({ ch: q[i].ch, data: q[i].data }); else keep.push(q[i]); }
    this.q = keep; return out;
  };
  BcLink.prototype.down = function (ms) { this.shaper.down = this.now() + ms; };
  BcLink.prototype.close = function () { try { this.bc.close(); } catch (e) { } };

  /* ---------- Bot de solo entrada (pruebas: nettest, netdrive). Azar propio, nunca g.rng. Lee con useSlot y deja el hueco 0. ---------- */
  var BOT = {
    bueno: { sigma: 0.04, posErr: 0.35, react: 0.18, aim: 0.6, block: true, jumpServe: 0.5 },
    flojo: { sigma: 0.11, posErr: 1.1, react: 0.32, aim: 0.15, block: false, jumpServe: 0.05 }
  };
  function bot(team, seed, profName) {
    var S = Sim(), C = VB.C, prof = BOT[profName] || BOT.bueno;
    var r = mulberry(seed * 7919 + 13 + team * 104729), sd = S.side(team), w = {};
    var gauss = function () { return (r() + r() + r() + r() - 2) * 1.732; };
    var stamp = -9, lead = 0, jlead = 0, ex = 0, ey = 0, presses = 0, serveWait = 0, react = 0, aimv = [0, 0], useAim = false, blockT = -1, blockSeen = -9;
    return function (g) {
      var inp = { move: [0, 0], hit: false, jump: false, jset: false, skip: false };
      if (!g || !g.online) return inp;
      S.useSlot(g, team);
      try {
        var p = g.ctrl, b = g.ball;
        if (g.mode === 'point' || g.mode === 'over') { inp.skip = r() < 0.02; return inp; }
        if (g.mode === 'serve') {
          if (g.server !== p) return inp;
          if (g.serveState === 'ready') {
            if (g.serveT < 0.02) serveWait = 0.8 + r() * 1.5;
            if (g.serveAuth && g.serveT > serveWait) { if (r() < prof.jumpServe) inp.jump = true; else inp.hit = true; }
            return inp;
          }
          if (stamp !== g.lastTouchT) { stamp = g.lastTouchT; lead = C.WINDUP + gauss() * prof.sigma; presses = 0; }
          S.hitWindow(g, p, w);
          if (presses < 2 && !g.swingLive && w.t <= lead && b.vz <= 0.5) { inp.hit = true; presses++; }
          return inp;
        }
        if (g.mode !== 'rally') return inp;
        if (stamp !== g.lastTouchT) {
          stamp = g.lastTouchT; presses = 0; lead = C.WINDUP + gauss() * prof.sigma; jlead = gauss() * prof.sigma * 0.9;
          ex = gauss() * prof.posErr; ey = gauss() * prof.posErr; react = prof.react * (0.7 + 0.6 * r());
          var an = r() * 6.283; aimv = [Math.cos(an), Math.sin(an)]; useAim = r() < prof.aim;
        }
        var since = g.time - g.lastTouchT, job = g.jobs[team] === p;
        var attack = job && g.touchTeam === team && g.touches === 2 && Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5;
        var tx, ty;
        if (job) {
          var pr = attack ? g.pr3 : g.pr1, kk = Math.min(1, Math.max(0, pr.t) / 1.1) * 0.5;
          tx = pr.x + sd * (attack ? 0.35 : 0.15) + ex * kk; ty = pr.y + ey * kk;
        } else if (prof.block && g.touchTeam === 1 - team && g.touches >= 1 && g.pr3.x * sd < 0 && g.defRole !== 'dig') {
          tx = sd * 0.6; ty = g.pr3.y;
        } else { tx = sd * 5.5; ty = -S.other(g, p).y * 0.5; }
        if (since >= react && p.z === 0) {
          var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
          if (d > 0.1) { var f = Math.min(1, d / 0.3); inp.move = [dx / d * f, dy / d * f]; }
        }
        if (job && since >= react * 0.6) {
          S.hitWindow(g, p, w);
          if (attack && p.z === 0 && w.attack && w.jumpT <= jlead && Math.hypot(g.pr3.x + sd * 0.35 - p.x, g.pr3.y - p.y) < 1.3) inp.jump = true;
          var near = Math.hypot(b.x - p.x, b.y - p.y) < 2.6;
          if (near && !(attack && p.z === 0 && w.jumpT > -0.2) && presses < 2 && !g.swingLive && w.t <= lead) {
            inp.hit = true; presses++; if (useAim) inp.move = aimv;
          }
        }
        if (g.swingLive && p.z > 0 && useAim) inp.move = aimv;
        if (prof.block && !job && p.z === 0 && Math.abs(p.x) < 1.2 && g.touchTeam === 1 - team && g.touches === 2) {
          var att = false, T = g.teams[1 - team];
          for (var i = 0; i < T.length; i++) if (T[i].z > 0.35 && T[i].vz < 1.5 && Math.abs(T[i].x) < 4) att = true;
          if (att && blockSeen !== stamp) { blockSeen = stamp; blockT = g.time + Math.max(0, 0.06 + gauss() * prof.sigma); }
          if (att && g.time >= blockT) inp.jump = true;
        }
        return inp;
      } finally { S.useSlot(g, 0); }
    };
  }

  VB.Net = {
    Session: Session, memPair: memPair, BcLink: BcLink, bot: bot, BOT: BOT,
    decode: decode, q16: q16, bitsOf: bitsOf, packInputs: packInputs, unpackInputs: unpackInputs, mulberry: mulberry,
    PROTO: PROTO, BITS: B, cleanName: cleanName, CONNECT_MS: CONNECT_MS, STEP: STEP, STEP_MS: STEP_MS, MAXPRED: MAXPRED, HASH_EVERY: HASH_EVERY, WAIT_AI_MS: WAIT_AI_MS, GONE_MS: GONE_MS
  };
})();
