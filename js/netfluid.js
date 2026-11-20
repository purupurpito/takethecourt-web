/* =====================================================================
 * MAKE THE CUT — js/netfluid.js   (owner: net)
 * Online V2 «Fluida» (notes/online-v2-spec.md §3-§8): sesión de dos pares SIN rollback. Cada máquina simula SOLO su equipo (sus dos
 * jugadores) y el balón mientras es suyo; los jugadores rivales llegan por fotos («S», 30 Hz) y se pintan algo en el pasado. El dueño
 * del balón (g.fl.own) decide contactos, bloqueos, red y puntos; el traspaso es en el medio paso khAt que viaja en cada contacto (tc).
 * SIN DOM y SIN THREE: funciona igual en el navegador y en Node (tools/fluidtest.js la carga con vm junto a sim.js).
 *
 * FACHADA (la misma que VB.Net.Session, main.js depende de ella; spec §3.1):
 *   new Session({slot, link, opts|null, name, rivalName, epoch, expect, warm, log})   (onTick y delay se ignoran)
 *     .advance(now ms, entrada) → {g (partida de PINTAR, gd), events, confirmed, app, status, tick, gcTick, ping, waitMs, unstable,
 *                                 canAI, goneIn, startIn, solo, valid, result, rivalSolo, gone, rivalLeft, info}
 *     .request('skip')   «Continuar» (bit de la entrada propia + sk {r}); .request('chal') challenge (ch {r} → chok/chno, 1.14.1);
 *                        'tmo' no hace nada en Fluida
 *     .setAway(bool)  .vsAI(force)  .quit()  .sendApp(obj)
 *     .predictedGame() = .confirmedGame() = la partida LOCAL g (su marcador es el bueno)   .stepInputs() → null   .initEvents
 *   Propiedades: status, opts, host, slot, back, epoch (se lee siempre this.epoch: el lobby la reescribe), adopt, rivalName, rivalLeft,
 *     result, valid, goneFlag, solo, rivalSolo, gcTick (= tic local), repaired (0), rsT, maxCatch, delay (0), rttSeq, rttLast, adv (0),
 *     cmpOk, cmpBad, model ('fluida'), stats, flStats (para js/netlog.js).
 *
 * SALUDO (copiado de net.js, no compartido: net.js no se toca): hello {v:'F1', m:'f', ver, name, back?}; una sesión Precisa rechaza
 *   v 'F1' y esta rechaza lo demás: los dos mandan bye 'version'. El invitado comprueba además que la sala anunciada (expect) es la
 *   que manda el anfitrión y que es Fluida (net 'fluida'): si no, bye 'mismatch'. 8 pings, desfase = mediana de los 3 mejores RTT,
 *   ready, start {t0 = ahora + 1,5 s}. Tic común T = floor((now - t0) / STEP_MS).
 *
 * CABLE: canal 'in' (no fiable): foto «S» binaria (tipo 2 | época << 4) y eco del tc (tipo 3 | época << 4 + JSON). Canal 'ctl'
 *   (fiable, en orden, JSON): tc, pt, pa, fq, fx, sr, sk, ch, chok, chno, ev, sb, sbok, rb, rs, rsok, solo, rejoin, fin, bye, app, ping,
 *   pong, hello, ready, start. pt lleva cl (la llamada de línea del dueño, con su error arbitral) para que el challenge sea igual. Ver codec y _onCtl.
 *
 * NOTAS (diferencias con la spec, comprobadas con tools/fluidtest.js):
 *   - El tc que llega de un tic que aún no he simulado (el reloj del otro va 1-3 tics por delante) espera en tcFut hasta ese tic: si
 *     se aplicaba ya, el fantasma volaba un tic de más (se veía como «deriva» de 5-25 cm incluso en el mismo motor).
 *   - Se manda g.fl.tc (el bulto tomado EN el contacto), no flBundle después del paso. m viaja por posición (M_KEYS) y el eco por
 *     'in' va sin eventos (llegan con el de 'ctl'): ~1 KB por contacto en vez de 3.
 *   - Foto de 65 B: sin jvx/jvy; en el peloteo el balón va en una de cada dos (y en las de contacto y traspaso).
 *   - Colchón del rival Dp = retraso medio de sus fotos + D, D = max(0,7·(percentil 95 del retraso − media), 2·variación) + intervalo
 *     (hasta ×2 con pérdida, lleno al 4 %; una foto que llega desordenada no cuenta como perdida) + 1, entre 6 y 18 tics; directo
 *     durante las 32 primeras fotos y luego como mucho 4 tics/s hacia arriba y 1 tic/s hacia abajo.
 *   - Reloj del balón pintado: tras un contacto rival que viene, off(t) = lag · (Te − t)/(Te − Tc) desde el contacto (Te = Th; en el
 *     saque, o un libre sin nadie mío junto a la red, un poco después; un libre con los míos junto a la red llega con hasta FREE_TOL m
 *     de retraso al traspaso); si no cabe en WARP_MAX salta solo lo que no se puede acelerar.
 *     Tras un contacto rival que se queda en su campo el lag sube hasta Dp con una curva suave (0,65 como poco); tras uno mío que se
 *     va, desde el traspaso y a 0,8 como poco (si cae antes, solo hasta la latencia de sus fotos menos LAND_HIDE). Mi toque con el
 *     lag aún bajando lo pone a 0 en el acto. Toda corrección de un tc aplicado se mezcla desde la trayectoria pintada (bJump); en el
 *     peloteo un salto de más de 3 m salta solo lo que pasa de 3 m y mezcla el resto (fuera del peloteo, de golpe).
 *     La posición sale de la cadena de contactos del rally (flFly sobre el bulto de cada contacto, míos y del rival).
 *   - Saque: hasta que llega la foto de saque del rival (F_TELE del r actual) sus fotos son del punto anterior: el rival se queda (en
 *     la sim y pintado) en la formación de mi setupServe, que es la misma que la suya.
 *   - Bifurcación por TIEMPO (gana lo que pasó antes; empate, el anfitrión): un tc rival contra mi punto sin confirmar compara su
 *     medio paso con lo primero de mi rama que él no vio (mis contactos con s > c.par, o mi punto, ph); dos pt del mismo rally, el
 *     comienzo de cada rama (pt.ph / pt.lf). El que pierde deshace su punto (pre = flMatch al hacer setupServe; nunca con el saque
 *     siguiente ya preparado ni el final presentado: entonces ptBad y sb) y quita de sus confirmados los contactos de su rama.
 *   - Pintar: no hay copia entera por frame; main.js copia a la vista con withDisplay (la pose pintada encima de la partida local
 *     mientras dura la copia). out.g sigue existiendo (la construye al leerla, para las pruebas).
 *   - Quien manda un rs descarta los mensajes de juego del rival (tc, pt, pa, fq, sr, sk, ev, sb, rb) hasta su rsok: son de su partida
 *     de antes del rs y aplicarlos aquí (sobre todo un pt) dejaría los marcadores distintos. El que recibe el rs manda el rsok y
 *     después el sr. Al deshacer un punto por bifurcación se usa el marcador guardado con ESE punto (ptPend.pre), no el último.
 *   - Un pt rival rechazado con rb se guarda (ptRej): si después llega su tc ganador (mi rama se pierde: myLastS = -1), se aplica;
 *     el otro no lo vuelve a mandar. Si el punto deshecho había cerrado el partido, se vuelve a 'playing' y se manda fin {x:1}
 *     (retira el fin anterior: el otro borra finIn).
 *   - fx (mi fq llegó cuando el dueño ya me había pasado el balón): la falta la pito yo en cuanto el balón es mío en ese rally
 *     (la sim ya no vuelve a mirar el toque de red de ese jugador: sin esto se perdía). El sb del anfitrión borra mis resúmenes
 *     pendientes (ptDig) anteriores al arreglo: el pa que le sigue ya no coincidiría y el partido quedaba sin verificar.
 *   - Un pt rival con su tc del mismo rally aún en tcFut (su reloj por delante): los eventos del tc se quedan (confirmados), el balón no.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var HZ = (VB.C && VB.C.SIM_HZ) || 120, STEP = 1 / HZ, STEP_MS = 1000 / HZ;
  var PROTO = 'F1';
  /** Constantes de la sesión (spec §10). Tiempos en ms salvo que diga tics (1/120 s) o s. */
  var C = {
    STEP_MS: STEP_MS, STEP: STEP,
    SNAP_RALLY: 4, SNAP_IDLE: 12, HEARTBEAT: 30,           // tics entre fotos (saque/peloteo, balón muerto, como mucho)
    SNAP_CATCH: 150,                                        // tics: recuperando más que esto tras un parón, sin fotos (T viejo). (La
                                                            // pestaña oculta avanza ~120 cada segundo: esas sí salen, como antes)
    D_MIN: 6, D_MAX: 18,                                    // colchón de interpolación del rival (tics), además de la latencia
    EXTRAP_MAX: 12,                                         // tics de extrapolación como mucho (100 ms)
    BLEND_P: 60, BLEND_B: 40,                               // semivida del error de jugadores / mezcla del balón al saltar (ms)
    BALL_TAU: 100, BALL_TAU_NEAR: 60,                       // decaimiento del error del balón (ms; cerca de los míos, más rápido)
    WARP_MAX: 2.0, LAG_UP: 0.35,                            // velocidad máxima del reloj del balón; lo que puede frenar (tic/tic)
    LAG_UP_RIV: 0.35,                                       // tras un contacto rival que se queda en su campo: lo que frena como mucho
                                                            // (el lag sube hasta Dp con una curva suave; antes 0,5 fijo: media velocidad)
    SERVE_EXT: 24,                                          // tics: lo que el saque rival puede tardar en alcanzar el presente tras el traspaso
    FREE_TOL: 0.3,                                          // m: lo que un libre puede ir por detrás en el traspaso con los míos junto a la red
    BLEND_B_FAR: 90,                                        // mezcla del salto del balón lejos de mis jugadores (ms; cerca, BLEND_B)
    LAND_HIDE: 4,                                           // tics de retraso de un tc rival que la mezcla del balón disimula (_lagOnMine)
    LAG_UP_MINE: 0.2,                                       // lo que frena tras MI contacto que se va (el balón a 0,8 como poco)
    CATCH_MAX: 72, POSE_RING: 48, SNAP_RING: 32, REBASE: 0.03,
    CH_MARGIN: 0.8,                                         // s de ventana de challenge que deben quedar para pedirlo (ida y vuelta)
    SR_FALLBACK: 2.0,                                       // s esperando el sr del rival antes de sacar igual
    UNSTABLE: 1000, WAIT: 1500, WAIT_OWN: 500, WAIT_AI: 10000, GONE: 60000, GAP_RS: 3000,
    RS_EVERY: 1500, RS_TRIES: 8, PA_TIMEOUT: 400, FIN_TIMEOUT: 3000,
    CONNECT_MS: 20000, CONNECT_CAP: 60000, ADOPT_MS: 40000, START_MS: 1500, WARM_CAP: 5000,
    MAXCATCH: 36, EDGE_TTL: 150, EV_EVERY: 2, MUTE_TICKS: 18,
    REWIND: true,                                           // recuperación con la pose pasada de mis jugadores (spec §4.4)
    BACHECK: false,                                         // pruebas: compara el cursor de _ballAt con el vuelo entero
    KHCHECK: false                                          // depuración: revuela cada tc rival para comprobar su traspaso (khCheckBad;
                                                            // las pruebas lo encienden: en el juego costaba hasta 7 ms al llegar un tc)
  };
  var NOIN = { move: [0, 0], hit: false, jump: false, jset: false, skip: false, ai: false };
  var AIIN = { move: [0, 0], hit: false, jump: false, jset: false, skip: false, ai: true };
  /** Mensajes de control que manda también un par aún sin reloj (recién recargado): no disparan el rs del anfitrión (_recv). */
  var NOSYNC = { hello: 1, ping: 1, pong: 1, ready: 1, start: 1, bye: 1, app: 1 };

  function Sim() { return VB.Sim; }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  /** Nombre del rival (igual que net.js cleanName: copia, no se comparte). */
  function cleanName(n) {
    var s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>"`]/g, '').replace(/\s+/g, ' ').trim();
    if (s.indexOf('@') >= 0) return '';
    var out = '', cs = Array.from(s);
    for (var i = 0; i < cs.length && out.length + cs[i].length <= 16; i++) out += cs[i];
    s = out.trim();
    return s.length >= 2 ? s : '';
  }
  /** ¿Las opciones del anfitrión son las de la sala anunciada, y la sala es Fluida? (net.js sameRoom + net 'fluida') */
  function sameRoomF(co, e) {
    if (!co || co.net !== 'fluida') return false;
    if (!e) return true;
    return !!co.even === !!e.even && (+co.bestOf === 3 ? 3 : 1) === (+e.bestOf === 3 ? 3 : 1) && (co.points | 0) === (e.points | 0) &&
      (co.venue === 'beach' ? 'beach' : 'hall') === (e.venue === 'beach' ? 'beach' : 'hall') && (co.net || '') === (e.net || co.net || '');
  }

  /* ---------- UTF-8 (eco del tc por 'in') ---------- */
  function utf8enc(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var u = unescape(encodeURIComponent(s)), a = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) a[i] = u.charCodeAt(i);
    return a;
  }
  function utf8dec(a, from) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(a.subarray(from));
    var s = ''; for (var i = from; i < a.length; i++) s += String.fromCharCode(a[i]);
    return decodeURIComponent(escape(s));
  }

  /* ---------- Códec de la foto «S» (spec §3.4) ----------
   * Cabecera 10 B: u8 tipo (2 | época << 4), u32 T, u16 r, u8 flags, u16 n.º de foto. flags: 1 balón, 2 ausente (mi humano en la IA),
   * 4 quieto (balón muerto), 8 en solitario, 16 skipReq propio, 32 teletransporte (setupServe desde la foto anterior).
   * Por jugador local (2, en orden de idx), 21 B: x, y, z (i16 mm), vx, vy, vz (i16 cm/s), anim (u8, 1/600 s), lastAction
   * (u8, ACTS), edad de la acción (u8 tics, satura en 255), shot (u8, SHOTS), grade (u8, GRADES), bits (u8: 1 en el suelo, 2 tirado,
   * 4 gesto vivo, 8 es el humano, 16 bloqueo activo, 32 enfriando), down (u8, 1/100 s), bloqueo restante (u8 tics), gesto (u8, SHOTS).
   * Balón 13 B (solo si es mío en saque/peloteo): x, y, z (i16 mm), vx, vy, vz (i16 cm/s), u8 seq de la cadena. Total 52 o 65 B.
   * (jvx/jvy no viajan: el rival nunca se simula aquí y su deriva en el aire ya está en vx/vy.) */
  var ACTS = ['', 'pass', 'set', 'spike', 'free', 'serve', 'block', 'swing', 'jump', 'toss', 'dive'];
  var SHOTS = ['', 'tip', 'roll', 'jset', 'body', 'float', 'jump', 'dive', 'tool', 'stuff', 'soft', 'feint', 'dig', 'hard', 'quick', 'power', 'kill', 'shank', 'over'];
  var GRADES = ['', 'perfect', 'good', 'poor'];
  var OTHER = 255;   // «otro»: el receptor deja el valor que tenía
  var S_HEAD = 10, S_PL = 21, S_BALL = 13, NPL = 2;
  var F_BALL = 1, F_AWAY = 2, F_IDLE = 4, F_SOLO = 8, F_SKIP = 16, F_TELE = 32;
  function enumIx(tab, v) { var i = tab.indexOf(v == null ? '' : v); return i < 0 ? OTHER : i; }
  function enumOf(tab, i) { return i < tab.length ? tab[i] : undefined; }
  function i16(v) { v = Math.round(v); return v !== v ? 0 : v > 32767 ? 32767 : v < -32768 ? -32768 : v; }
  function u8(v) { v = Math.round(v); return v !== v || v < 0 ? 0 : v > 255 ? 255 : v; }
  /** o = {ep, T, r, flags, seq, pl: [{x,y,z,vx,vy,vz,anim,act,age,shot,grade,bits,down,press,sw}×2], ball: {x,y,z,vx,vy,vz,seq}|null} */
  function encS(o) {
    var hasB = !!o.ball, n = S_HEAD + NPL * S_PL + (hasB ? S_BALL : 0), buf = new Uint8Array(n), dv = new DataView(buf.buffer), k = S_HEAD, i, p;
    buf[0] = 2 | ((o.ep & 15) << 4); dv.setUint32(1, o.T >>> 0, true); dv.setUint16(5, o.r & 65535, true);
    buf[7] = (o.flags & ~F_BALL) | (hasB ? F_BALL : 0); dv.setUint16(8, o.seq & 65535, true);
    for (i = 0; i < NPL; i++) {
      p = o.pl[i];
      dv.setInt16(k, i16(p.x * 1000), true); dv.setInt16(k + 2, i16(p.y * 1000), true); dv.setInt16(k + 4, i16(p.z * 1000), true);
      dv.setInt16(k + 6, i16(p.vx * 100), true); dv.setInt16(k + 8, i16(p.vy * 100), true); dv.setInt16(k + 10, i16(p.vz * 100), true);
      buf[k + 12] = u8(p.anim * 600); buf[k + 13] = p.act; buf[k + 14] = u8(p.age); buf[k + 15] = p.shot; buf[k + 16] = p.grade;
      buf[k + 17] = p.bits; buf[k + 18] = u8(p.down * 100); buf[k + 19] = u8(p.press); buf[k + 20] = p.sw;
      k += S_PL;
    }
    if (hasB) {
      var b = o.ball;
      dv.setInt16(k, i16(b.x * 1000), true); dv.setInt16(k + 2, i16(b.y * 1000), true); dv.setInt16(k + 4, i16(b.z * 1000), true);
      dv.setInt16(k + 6, i16(b.vx * 100), true); dv.setInt16(k + 8, i16(b.vy * 100), true); dv.setInt16(k + 10, i16(b.vz * 100), true);
      buf[k + 12] = b.seq & 255;
    }
    return buf;
  }
  function decS(buf) {
    if (!buf || buf.length < S_HEAD + NPL * S_PL || (buf[0] & 15) !== 2) return null;
    var u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), k = S_HEAD, i;
    var o = { ep: u[0] >> 4, T: dv.getUint32(1, true), r: dv.getUint16(5, true), flags: u[7], seq: dv.getUint16(8, true), pl: [], ball: null };
    if ((o.flags & F_BALL) && u.length < S_HEAD + NPL * S_PL + S_BALL) return null;
    for (i = 0; i < NPL; i++) {
      o.pl.push({ x: dv.getInt16(k, true) / 1000, y: dv.getInt16(k + 2, true) / 1000, z: dv.getInt16(k + 4, true) / 1000,
        vx: dv.getInt16(k + 6, true) / 100, vy: dv.getInt16(k + 8, true) / 100, vz: dv.getInt16(k + 10, true) / 100,
        anim: u[k + 12] / 600, act: u[k + 13], age: u[k + 14], shot: u[k + 15], grade: u[k + 16], bits: u[k + 17],
        down: u[k + 18] / 100, press: u[k + 19], sw: u[k + 20] });
      k += S_PL;
    }
    if (o.flags & F_BALL) o.ball = { x: dv.getInt16(k, true) / 1000, y: dv.getInt16(k + 2, true) / 1000, z: dv.getInt16(k + 4, true) / 1000,
      vx: dv.getInt16(k + 6, true) / 100, vy: dv.getInt16(k + 8, true) / 100, vz: dv.getInt16(k + 10, true) / 100, seq: u[k + 12] };
    return o;
  }
  /** Metadatos del peloteo (flBundle().m / pts[].m) por posición: sin los nombres de campo (un tc pasa de ~1,5 KB a ~1 KB). Un campo
   *  que no esté en la lista (la sim puede añadir más) viaja en un objeto al final. Los valores van tal cual (doubles exactos). */
  var M_KEYS = ['touchTeam', 'touches', 'lp', 'lpGrade', 'lastTeam', 'lastKind', 'lastShot', 'lastQ', 'ltAge', 'prevKind', 'netSince', 'bb', 'blockCD',
    'atkServe', 'antennaHit', 'digOk', 'digMargin', 'dw', 'hardIn', 'digTight', 'recvRisk', 'rc', 'blockOff', 'atkTeam', 'atkHow', 'atkHits',
    'atkHuman', 'atkGrade', 'as', 'atkMove', 'atkEdge', 'feintAge', 'lastTempo', 'chain', 'chainH', 'rally', 'lastLand',
    'digK', 'feintFool']; // (digK, feintFool: modelo de esfuerzo de la IA, VB.EFFORT, 18-nov-2026)
  var M_IX = {}; M_KEYS.forEach(function (k, i) { M_IX[k] = i; });
  function encM(m) {
    if (!m || typeof m !== 'object') return m;
    var a = new Array(M_KEYS.length + 1), x = null, k, u = [];
    for (var i = 0; i < M_KEYS.length; i++) { var v = m[M_KEYS[i]]; a[i] = v === undefined ? null : v; if (v === undefined) u.push(i); }
    for (k in m) if (M_IX[k] === undefined) (x || (x = {}))[k] = m[k];
    if (u.length) (x || (x = {})).$u = u;   // (los que eran undefined, para devolverlos igual)
    a[M_KEYS.length] = x;
    return a;
  }
  function decM(a) {
    if (!Array.isArray(a)) return a;
    var m = {}, i, k;
    for (i = 0; i < M_KEYS.length && i < a.length; i++) m[M_KEYS[i]] = a[i];
    var x = a[M_KEYS.length];
    if (x && typeof x === 'object') for (k in x) { if (k === '$u') { for (i = 0; i < x.$u.length; i++) m[M_KEYS[x.$u[i]]] = undefined; } else m[k] = x[k]; }
    return m;
  }
  /** Eco del tc por 'in': tipo 3 | época << 4 + JSON en UTF-8. */
  function encT(json, ep) { var b = utf8enc(json), out = new Uint8Array(b.length + 1); out[0] = 3 | ((ep & 15) << 4); out.set(b, 1); return out; }

  /* ---------- Eventos que viajan (ev / tc.ev) ----------
   * Los de point() y del ciclo del saque salen igual en las dos máquinas (marcador idéntico): no viajan. Los de los jugadores y el
   * balón de quien los simula, sí; con los jugadores por id ({$p: id}). */
  var NOSEND = { point: 1, sideout: 1, set: 1, match: 1, courtChange: 1, gameOver: 1, skipReq: 1, serveReady: 1, newSet: 1, newMatch: 1,
    rotation: 1, 'switch': 1, timeout: 1, timeoutReq: 1, timeoutEnd: 1, timeoutCancel: 1, challenge: 1, challengeResult: 1, sub: 1,
    subDenied: 1, libero: 1, lineup: 1, ask: 1, bounce: 1, drillEnd: 1, drillRep: 1, drillStage: 1 };
  // solo sonido/efecto: si llegan con más de 150 ms de retraso respecto a su momento de pintarse, no se presentan (net.js _present)
  var SENSORY = { hit: 1, block: 1, blockPress: 1, land: 1, landPlayer: 1, net: 1, netTouch: 1, bounce: 1, dive: 1, toss: 1, jump: 1, swing: 1, miss: 1, juggle: 1, dribble: 1, feint: 1, set: 1, whistle: 1 };
  // eventos de un contacto (los que se quitan de los confirmados de la rama perdida, y los que nunca se silencian por llegar tarde)
  var CONTACT = { hit: 1, block: 1, net: 1, tape: 1, body: 1 };
  function sendable(e) { return !NOSEND[e.type] && !(e.type === 'whistle' && e.reason !== 'serve'); }
  function isPlayer(v) { return v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'number' && (v.team === 0 || v.team === 1) && v.st !== undefined; }
  function encEv(e) {
    var o = {}, k, v;
    for (k in e) {
      v = e[k];
      if (k === '_tick') { o._T = v; continue; }
      if (k === '_conf' || k === '_o' || k === '_i' || typeof v === 'function') continue;
      if (isPlayer(v)) { o[k] = { $p: v.id }; continue; }
      if (v && typeof v === 'object') { try { o[k] = JSON.parse(JSON.stringify(v, function (kk, vv) { return isPlayer(vv) ? { $p: vv.id } : vv; })); } catch (err) { } continue; }
      o[k] = v;
    }
    return o;
  }
  function decEv(o, g) {
    var e = {}, k, v;
    for (k in o) {
      v = o[k];
      if (k === '_T') { e._tick = v; continue; }
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$p === 'number') { e[k] = byId(g, v.$p); continue; }
      e[k] = v;
    }
    return e;
  }
  function byId(g, id) { var P = g.players; for (var i = 0; i < P.length; i++) if (P[i].id === id) return P[i]; return null; }
  function evType(e) { return e && e.type; }

  /* ---------- Sesión ---------- */
  function Session(o) {
    o = o || {};
    this.model = 'fluida';
    this.slot = o.slot === 1 ? 1 : 0; this.host = this.slot === 0;
    this.link = o.link; this.name = String(o.name || ''); this.rivalName = cleanName(o.rivalName);
    this.epoch = Math.max(0, Math.min(1e6, o.epoch | 0)); this.appIn = []; this.rivalLeft = false;
    this.expect = o.expect && typeof o.expect === 'object' ? o.expect : null;
    this.log = typeof o.log === 'function' ? o.log : null;
    this.status = 'connecting';
    this.opts = null; this.g = null; this.gd = null;
    this.T = 0; this.gcTick = 0;
    this.edges = 0; this.edgesAt = -1; this.away = false; this.solo = false; this.valid = true; this.result = null;
    this.goneFlag = false; this.lostAt = -1; this.rivalSolo = false; this.soloEpoch = 0; this.rejoinEpoch = 0; this.rejoinAt = -1e9; this.lateAt = -1e9;
    this.adopt = this.host && !o.opts; this.back = !!o.back; this.hostBack = false;
    this.warmFn = typeof o.warm === 'function' ? o.warm : null; this.warmSince = -1; this.startPend = false;
    this.connAt = -1; this.heardAt = -1; this.rttFloor = -1e9;
    this.t0 = 0; this.off = 0; this.lastNow = 0; this.lastRecv = 0; this.started = false; this.gapBig = false; this._tgt = 0;
    this.helloAt = -1e9; this.gotHello = false; this.pings = []; this.pingAt = -1e9; this.pingId = 0; this.ready = false;
    this.rtt = 0; this.rttN = 0; this.rttMin = 1e9; this.rttSeq = 0; this.rttLast = 0;
    this.waitStart = -1; this.waitMs = 0; this.goneIn = 0;
    this.delay = 0; this.repaired = 0; this.adv = 0; this.cmpOk = 0; this.cmpBad = -1; this.sbAt = -1; this.maxCatch = 0;
    this.stats = { frames: 0, steps: 0, sent: 0, recv: 0, bytesOut: 0, waits: 0, resyncs: 0, rsIn: 0, depth: undefined, maxDepth: undefined };
    this.flStats = { snapOut: 0, snapIn: 0, kbOut: 0, kbIn: 0, interpMs: 0, extrapTicks: 0, stale: 0, hand: 0, forks: 0, late: 0, lateMaxMs: 0,
      warpMax: 1, snaps: 0, drift: 0, fqSent: 0, fqOk: 0, ptBad: 0, sbFix: 0, digestBad: 0, khCheckBad: 0,
      tcOut: 0, tcIn: 0, ptOut: 0, ptIn: 0, srFallback: 0, badIn: 0, dropped: 0, rb: 0, dispFrames: 0, chOut: 0, chOk: 0, chNo: 0 };
    this.rsT = -1; this.rsPend = null; this.rsId = 0; this.rsIn = 0;
    this.initEvents = [];
    this._out = { g: null, events: [], confirmed: [], app: [], status: '', tick: 0, gcTick: 0, ping: 0, waitMs: 0, unstable: false, canAI: false,
      goneIn: 0, startIn: 0, solo: false, valid: true, result: null, rivalSolo: false, gone: false, rivalLeft: false, info: null };
    this._pres = []; this._confOut = [];
    // partida de PINTAR: ya no se copia entera cada frame (main.js pinta con withDisplay sobre la partida local con la pose pintada
    // encima, y deshecha después); out.g la construye solo si alguien la lee (las pruebas)
    var self0 = this;
    Object.defineProperty(this._out, 'g', { enumerable: true, configurable: true, get: function () { return self0._gdGet(); }, set: function () { } });
    this._ov = { r: false, rm: 1, n: 0, p: [{}, {}], b: false, bv: false, bx: 0, by: 0, bz: 0, bvx: 0, bvy: 0, bvz: 0 };
    this._sv = { p: [{}, {}], b: [0, 0, 0, 0, 0, 0] }; this._shown = false; this._gdOk = false;
    this.warpL = [];   // (velocidades de las aceleraciones del balón pintado, para las pruebas)
    this._resetPlay();
    var self = this;
    this._rw = function (j, g) { self._rewind(j, g); };
    if (o.opts) this._setOpts(o.opts);
  }
  var SP = Session.prototype;
  SP._log = function (m) { if (this.log) this.log('[fluida ' + this.slot + '] ' + m); };
  /** Estado de juego de la sesión (fotos, anillos, cadena, colas): al crear la partida y tras un resync. */
  SP._resetPlay = function () {
    this.ring = new Array(C.POSE_RING); this.gRing = new Array(64);
    this.snaps = []; this.lastSnapAt = -1; this.lastSnapT = -1; this.lateE = -1; this.jitE = 0; this.Dc = C.D_MIN; this.Dp = -1;
    this.lateL = []; this.lateP = 0; this.lastSeq = -1; this.lossE = 0; this.teleR = -1;
    this.chain = []; this.curR = 0; this.chainS = -1; this.myLastS = -1; this.myLastTc = null; this.lastTcIn = -1; this.seenTc = {}; this.myTcs = [];
    this.lag = 0; this.lagPlan = null; this.lastHand = 0;
    this.bOff = { x: 0, y: 0, z: 0 }; this.bShown = null; this.bSrc = ''; this.bJump = false; this.lastTf = -1;
    this.chainPrev = []; this.bCh = null; this.bRaw = null;
    this.pOff = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]; this.pShown = [null, null]; this.pExt = [false, false];
    this.tcQ = []; this.ptQ = []; this.tcFut = []; this.skHeld = -1; this.peerSr = -1; this.fxHeld = []; this.chPend = -1;
    this.pre = null; this.ptPend = {}; this.ptDig = {}; this.ptRej = {};
    this.confBuf = {}; this.confR = -1; this.goPend = null; this.goSeen = false; this.evI = 0;
    this.evOut = []; this.evOutAt = 0; this.remPres = [];
    this.snapLastT = -1e9; this.snapSeq = 0; this.snapForce = false; this.tele = false;
    this.finSent = false; this.finIn = null; this.overAt = -1; this.overTeam = -1;
    this._poses = [{}, {}]; this._in = { move: [0, 0], hit: false, jump: false, jset: false, skip: false, ai: false };
    this._ins = [null, null]; this.Tr = 0; this.tauB = 0; this.tf = 0;
  };
  SP._setOpts = function (opts) {
    var S = Sim(), n = {}, k;
    for (k in opts) n[k] = opts[k];
    n.online = true; n.net = 'fluida'; n.timeouts = false;   // (spec §2.1: sin tiempos muertos; árbitro y challenge como en Precisa desde 1.14.1)
    this.opts = n;
    this.g = S.createGame(n); S.flInit(this.g, this.slot);
    this.initEvents.length = 0; S.drainEvents(this.g, this.initEvents);
    this.gd = S.createGame(n); this.gd.events.length = 0;
    this.T = 0; this.gcTick = 0;
    this._resetPlay();
    this.pre = S.flMatch(this.g);
  };
  SP.confirmedGame = function () { return this.g; };
  SP.predictedGame = function () { return this.g; };
  SP.stepInputs = function () { return null; };
  SP.request = function (what) {
    if (what === 'chal') { this._chalAsk(); return; }
    if (what !== 'skip') return;   // (Fluida: sin tiempos muertos)
    this.edges |= 16; if (this.edgesAt < 0) this.edgesAt = this.lastNow;
    if (this.g && this.g.fl && !this.solo && (this.status === 'playing' || this.status === 'waiting' || this.status === 'over')) this._ctl({ k: 'sk', r: this.g.fl.r });
  };
  /** Challenge (1.14.1): lo pide el que perdió el punto y lo acepta la otra máquina (la que saca: la ventana acaba con SU saque);
   *  con su chok los dos corren la misma revisión (Sim.flChallenge). Solo con margen para que la respuesta llegue dentro de la ventana. */
  SP._chalAsk = function () {
    var S = Sim(), g = this.g, me = this.slot, c = g && g.call;
    if (!g || !g.fl || !c || this.status !== 'playing' && this.status !== 'over') return;
    if (this.solo) { S.challenge(g, me); return; }   // contra la IA: la partida es solo mía
    if (this.chPend === c.r || !(S.canChallenge(g, me) > C.CH_MARGIN)) return;
    this.chPend = c.r; this._ctl({ k: 'ch', r: c.r }); this.flStats.chOut++;
  };
  SP.setAway = function (on) { this.away = !!on; };
  SP._ctl = function (m) {
    if (this.epoch) m.ep = this.epoch;
    var s; try { s = JSON.stringify(m); } catch (e) { return; }
    try { this.link.send('ctl', s); } catch (e) { }
    this.stats.sent++; this.stats.bytesOut += s.length; this.flStats.kbOut += s.length / 1024;
  };
  SP._sendIn = function (buf) {
    try { this.link.send('in', buf); } catch (e) { }
    this.stats.sent++; this.stats.bytesOut += buf.length; this.flStats.kbOut += buf.length / 1024;
  };
  SP.sendApp = function (d) { this._ctl({ k: 'app', d: d }); };
  SP.vsAI = function (force) {
    if (this.solo || this.status !== 'waiting' || (!force && this.waitMs <= C.WAIT_AI)) return false;
    this.solo = true; this.soloEpoch++;
    if (this.lostAt < 0) this.lostAt = this.waitStart >= 0 ? this.waitStart : this.lastNow;
    if (!this.host) this.valid = false;
    if (this.g) Sim().flTake(this.g);
    this.lagPlan = null; this.lag = 0;
    this._ctl({ k: 'solo' }); this._log('seguir contra la IA'); return true;
  };
  SP.quit = function () {
    if (this.status === 'ended') return;
    if (this.status === 'connecting' || this.status === 'starting') {
      this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; this.result = { why: 'cancel', win: false }; return;
    }
    if (this.status === 'over' || this.goneFlag) { this._ctl({ k: 'bye', why: 'left' }); this.status = 'ended'; return; }
    this._ctl({ k: 'bye', why: 'quit' });
    this.status = 'ended'; this.result = { why: 'quit', win: false };
  };
  SP._gone = function () {
    if (this.goneFlag) return;
    if (!this.solo) this.vsAI(true);
    this.goneFlag = true;
    if (this.host) this.result = { why: 'rivalGone', win: true };
    else { this.valid = false; this.result = { why: 'hostGone', win: false }; }
    this._ctl({ k: 'bye', why: 'gone' });
    this._log('el rival no volvió en ' + (C.GONE / 1000) + ' s');
  };
  SP._noShow = function (why) {
    if (this.status !== 'connecting' && this.status !== 'starting') return;
    this.status = 'ended'; this.result = { why: 'noShow', win: false }; this.rivalLeft = true;
    this._log('no hay partido: ' + why);
  };
  SP._late = function (now) { if (now - this.lateAt > 1000) { this.lateAt = now; this._ctl({ k: 'bye', why: 'late' }); } };
  SP._target = function (now) { return Math.floor((now - this.t0) / STEP_MS); };
  SP._hello = function (extra) {
    var m = { k: 'hello', v: PROTO, m: 'f', ver: VB.VERSION || '', name: this.name };
    if (extra) for (var k in extra) m[k] = extra[k];
    this._ctl(m);
  };

  /* ---- mensajes ---- */
  SP._recv = function (now) {
    var L = this.link.poll(now), i, sync = false;
    for (i = 0; i < L.length; i++) {
      var m = L[i];
      if (this.lastRecv && now - this.lastRecv > C.UNSTABLE) this.rttFloor = now;
      if (this.started && this.lastRecv && now - this.lastRecv > C.GAP_RS) this.gapBig = true;
      this.lastRecv = now; this.stats.recv++;
      if (m.ch === 'in') {
        var u0 = m.data && typeof m.data !== 'string' ? m.data : null;
        if (u0 && u0.length && (u0[0] >> 4) === (this.epoch & 15)) sync = true;
        this._onIn(m.data, now);
      } else {
        var c = null;
        if (typeof m.data === 'string') this.flStats.kbIn += m.data.length / 1024;
        try { c = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch (e) { }
        if (c && typeof c === 'object') {
          if ((c.ep | 0) === this.epoch && !NOSYNC[c.k]) sync = true;
          this._onCtl(c, now);
        }
      }
    }
    if (L.length && !this.host && this.solo && !this.goneFlag && this.status !== 'ended' && now - this.rejoinAt > 500) {
      this.rejoinAt = now; this._ctl({ k: 'rejoin', e: this.soloEpoch });
    }
    // el anfitrión vuelve a oír al invitado tras jugar solo (uno de los dos) o tras un corte largo: le manda su partida (rs). Solo con
    // un paquete que manda un par ya sincronizado (foto, tc, ev...): el hello/ping/pong/ready de un invitado que recargó la página
    // llegan antes de que mida su desfase, y un rs entonces le dejaba t0 en MI reloj (no avanzaba nunca); su 'ready' ya trae el rs.
    // gapBig se guarda hasta ese paquete (si lo primero que llega tras el corte es un ping, el rs no se perdía).
    if (sync) {
      if (this.host && !this.adopt && this.g && (this.solo || this.gapBig) && this.started && (this.status === 'playing' || this.status === 'waiting')) {
        if (this.goneFlag) this._late(now);
        else if (!this.rsPend || this.solo) this._resync(now);
      }
      this.gapBig = false;
    }
  };
  SP._onIn = function (data, now) {
    if (!data || typeof data === 'string') { this.flStats.badIn++; return; }
    var u = data instanceof Uint8Array ? data : new Uint8Array(data);   // (de otro contexto o un ArrayBuffer: se copia)
    if (!u.length) return;
    this.flStats.kbIn += u.length / 1024;
    var type = u[0] & 15;
    if ((u[0] >> 4) !== (this.epoch & 15) || (type !== 2 && type !== 3)) { this.flStats.badIn++; return; }   // (de otra época, o un paquete Precisa)
    if (!this.g || !this.started) return;
    this.heardAt = now;
    if (type === 2) { var s = decS(u); if (s) this._onSnap(s, now); else this.flStats.badIn++; return; }
    var c = null; try { c = JSON.parse(utf8dec(u, 1)); } catch (e) { }
    if (c && c.k === 'tc' && (c.ep | 0) === this.epoch && !this.solo && !this.rsPend) this._onTc(c, now);   // (como en _onCtl)
  };
  SP._onCtl = function (c, now) {
    var S = Sim(), g = this.g;
    if (c.k === 'bye' && (c.ep | 0) === this.epoch - 1 && (c.why === 'left' || c.why === 'quit' || c.why === 'gone')) { this._noShow('el rival se fue (época anterior)'); return; }
    if ((c.ep | 0) !== this.epoch) return;
    this.heardAt = now;
    switch (c.k) {
      case 'app': if (this.appIn.length < 64) this.appIn.push(c.d); break;
      case 'hello':
        if (!this.rivalName) this.rivalName = cleanName(c.name);
        if (c.v !== PROTO || c.m !== 'f' || c.ver !== (VB.VERSION || '')) { this._ctl({ k: 'bye', why: 'version', ver: VB.VERSION || '' }); this.status = 'ended'; this.result = { why: 'version', rv: String(c.ver || '') }; return; }
        if (this.host && this.adopt) {
          if (!this.gotHello && c.back && c.cfg && c.cfg.opts && !this.opts) { this.gotHello = true; this._setOpts(c.cfg.opts); this.pings.length = 0; this.pingAt = -1e9; }
        } else if (this.host) {
          var live = this.status === 'playing' || this.status === 'waiting' || this.status === 'starting';
          if (this.status === 'over' || this.status === 'ended') return;
          if (live && this.goneFlag) { this._ctl({ k: 'bye', why: 'late' }); return; }
          this._hello({ cfg: { opts: this.opts }, live: live });
        } else if (c.back) {
          if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); return; }
          if (!this.opts) { this._ctl({ k: 'bye', why: 'gone' }); this._noShow('los dos recargaron'); return; }
          this.rsIn = 0;
          if (this.status !== 'playing' && this.status !== 'waiting') return;
          this.hostBack = true;
          this._hello({ cfg: { opts: this.opts }, live: true, back: 1 });
        } else if (!this.gotHello) {
          this.gotHello = true;
          if (!this.opts) {
            var co = c.cfg && c.cfg.opts;
            if (!co || typeof co !== 'object' || !sameRoomF(co, this.expect)) {
              this._ctl({ k: 'bye', why: 'mismatch' }); this.status = 'ended'; this.result = { why: 'mismatch', win: false }; this._log('la sala no coincide con lo anunciado'); return;
            }
            this._setOpts(co);
          }
          this.pings.length = 0; this.pingAt = -1e9;
        }
        break;
      case 'ping': this._ctl({ k: 'pong', t: c.t, th: now, id: c.id }); break;
      case 'pong':
        var rtt = now - c.t;
        if (this.rttN && c.t < this.rttFloor) break;
        if (rtt < 3000 || !this.rttN) { this.rtt = this.rttN ? this.rtt * 0.8 + rtt * 0.2 : rtt; this.rttN++; }
        if (rtt < 3000) { this.rttLast = rtt; this.rttSeq = (this.rttSeq || 0) + 1; if (rtt < this.rttMin) this.rttMin = rtt; }
        if ((!this.host || this.adopt) && !this.ready && c.id < 1000) this.pings.push({ rtt: rtt, off: c.th - (c.t + now) / 2 });
        else if (!this.host && this.ready && this.started && rtt <= this.rttMin + 5) {   // deriva del reloj: como mucho 1 ms por pong, sin saltos
          var d = clampN(c.th - (c.t + now) / 2 - this.off, -1, 1); this.off += d; this.t0 -= d;
        }
        break;
      case 'ready':
        if (!this.host) {
          if (this.hostBack && !this.goneFlag && (this.status === 'playing' || this.status === 'waiting')) {
            this.hostBack = false; this.valid = true;   // (seguir contra la IA no cuenta si vuelve, como net.js: si no, el rs lo invalidaba en los dos)
            this._resync(now); this._log('el anfitrión vuelve: le mando mi partida');
          }
          break;
        }
        if (this.status === 'connecting') { if (!this._warmOk(now)) { this.startPend = true; break; } this._begin(now); }
        else if (this.status === 'starting') this._ctl({ k: 'start', t0: this.t0 });
        else if (this.status === 'playing' || this.status === 'waiting') { if (this.goneFlag) this._late(now); else this._resync(now); }
        break;
      case 'rejoin':
        if (!this.host || (this.status !== 'playing' && this.status !== 'waiting')) break;
        if (this.goneFlag) { this._late(now); break; }
        if ((c.e | 0) > this.rejoinEpoch) { this.rejoinEpoch = c.e | 0; this._resync(now); }
        break;
      case 'start':
        if (this.host || !this.ready) break;
        this.t0 = c.t0 - this.off; this.status = 'starting';
        break;
      case 'rs':
        var rid = c.id | 0;
        if (rid && rid <= this.rsIn) { this._ctl({ k: 'rsok', id: rid }); break; }
        if (this.host && !this.adopt) break;
        if (this.goneFlag) { this._ctl({ k: 'bye', why: 'gone' }); break; }
        // sin desfase medido (invitado que recargó, aún con pings) t0 quedaría en el reloj del otro: sin rsok, el otro lo repite y
        // su 'ready' (el mío) manda uno nuevo
        if (!this.ready) break;
        if (this._applyResync(c, now)) {
          if (rid) { this.rsIn = rid; this._ctl({ k: 'rsok', id: rid }); }
          if (this.g.mode === 'serve') this._ctl({ k: 'sr', r: this.g.fl.r });   // (después del rsok: antes, el otro aún lo descartaría)
        }
        break;
      case 'rsok': if (this.rsPend && (c.id | 0) === this.rsPend.m.id) { this.rsPend = null; this.cmpBad = -1; } break;
      case 'solo': this.rivalSolo = true; break;
      case 'bye':
        if (c.why === 'left' || c.why === 'quit' || c.why === 'gone' || c.why === 'late') this.rivalLeft = true;
        if (this.status === 'ended' || this.status === 'over') break;
        if ((this.status === 'connecting' || this.status === 'starting') && c.why !== 'version' && c.why !== 'mismatch') { this._noShow('el rival se fue antes de empezar'); break; }
        if (this.goneFlag || c.why === 'left') break;
        this.status = 'ended';
        this.result = c.why === 'quit' ? { why: 'rivalQuit', win: true } : c.why === 'gone' ? { why: 'rivalGone', win: true } :
          c.why === 'late' ? { why: 'late', win: false } : { why: c.why || 'bye', win: false };
        if (c.why === 'version') this.result.rv = String(c.ver || '');   // (versión del rival: main.js dice quién tiene que reiniciar)
        if (c.why === 'gone' && !this.host) { this.valid = false; this.result = { why: 'hostGone', win: false }; }
        break;
      default:
        if (!g || !g.fl) break;
        if (this.solo) break;   // contra la IA: lo del rival no cuenta (al volver, rs)
        // rs mandado y sin rsok: lo que llega es de su partida de ANTES del rs (ctl va en orden y el rsok llega detrás). Si se
        // aplicara (p. ej. un pt), el rs que está en camino lo borraría allí y aquí no: marcador distinto. Fuera hasta el rsok.
        if (this.rsPend && c.k !== 'fin') { this.flStats.dropped++; break; }
        switch (c.k) {
          case 'tc': this._onTc(c, now); break;
          case 'pt': this._onPt(c, now); break;
          case 'pa': this._onPa(c, now); break;
          case 'fq': this._onFq(c, now); break;
          case 'fx':   // mi fq llegó cuando el balón ya era mío (traspaso): ahora el dueño soy yo y la falta la doy yo (spec §4.1)
            if (typeof c.r === 'number' && c.r === g.fl.r && this.fxHeld.length < 8) { this.fxHeld.push({ r: c.r, pid: c.pid | 0, T: typeof c.T === 'number' ? c.T : -1 }); this._fxCheck(now); }
            break;
          case 'ch': {   // el rival pide challenge de la llamada del rally r: decido yo (aún no he sacado o la ventana sigue abierta)
            var chOk = typeof c.r === 'number' && S.flChallenge(g, 1 - this.slot, c.r, false);
            this._ctl({ k: chOk ? 'chok' : 'chno', r: c.r }); if (chOk) this.flStats.chOk++; else this.flStats.chNo++;
            break;
          }
          case 'chok': if (c.r === this.chPend) { this.chPend = -1; S.flChallenge(g, this.slot, c.r, true); } break;
          case 'chno': if (c.r === this.chPend) this.chPend = -1; break;
          case 'sr': if (typeof c.r === 'number' && c.r > this.peerSr) this.peerSr = c.r; if (this.peerSr === g.fl.r) g.fl.peer = true; break;
          case 'sk':
            if (c.r === g.fl.r) S.flSkip(g, 1 - this.slot);
            else if (c.r > g.fl.r) this.skHeld = c.r;
            this._post(now, g.fl.r);
            break;
          case 'ev': this._onEv(c, now); break;
          case 'sb':
            if (!this.host && c.blk) {
              // cruce: el sb es de un r anterior a un punto mío aún en camino (el anfitrión lo aplicará): se ignora, sin sbok; el
              // pa/pt siguiente del anfitrión manda un sb nuevo si sigue sin cuadrar. (Antes me devolvía a r sin mi punto: marcador distinto)
              var br = c.blk.r | 0, r0 = g.fl.r, pendB = false;
              for (var pk0 in this.ptPend) if (+pk0 >= br) pendB = true;
              if (br < r0 && pendB) { this.flStats.dropped++; break; }
              S.flMatch(g, c.blk); this.flStats.sbFix++; this.cmpBad = -1; this.pre = S.flMatch(g);
              if (br > r0) {   // el anfitrión va por delante: lo que esperaba a un r viejo ya no vale y el rally viejo se cierra
                var q2 = []; for (var qi = 0; qi < this.ptQ.length; qi++) if (this.ptQ[qi].r >= br) q2.push(this.ptQ[qi]); this.ptQ = q2;
                if (g.mode === 'rally' || g.mode === 'serve') { g.mode = 'point'; g.timer = 0; g.ball.held = null; }
              }
              // mis resúmenes pendientes son del marcador ANTES del arreglo: el pa que viene detrás (el anfitrión manda sb y luego pa)
              // ya no coincidiría y dejaba cmpBad puesto para siempre (partido no verificado aunque el marcador ya esté bien)
              for (var dk in this.ptDig) if (+dk < (c.blk.r | 0)) delete this.ptDig[dk];
              this._rChange(now);
              // mi fin ya mandado llevaba el marcador de antes del arreglo: otra vez, antes del sbok (el anfitrión espera el sbok
              // para cotejar el final)
              if (this.finSent && this.status === 'over') this._ctl({ k: 'fin', sets: g.sets.slice(), setScores: g.setScores.map(function (q) { return q.slice(); }), w: this.overTeam });
              this._ctl({ k: 'sbok', t: c.t | 0 });
            }
            break;
          case 'sbok': if (this.host && this.cmpBad >= 0 && typeof c.t === 'number' && c.t >= this.cmpBad) { this.cmpBad = -1; this.sbAt = -1; } break;
          case 'rb': if (c.tc) { this.flStats.rb++; this._onTc(c.tc, now, true); } break;
          case 'fin': this.finIn = c.x ? null : c; break;   // (x: el otro deshizo el punto que cerraba el partido)
        }
    }
  };

  /* ---- foto del rival ---- */
  SP._onSnap = function (s, now) {
    var g = this.g, F = g.fl, tf = (now - this.t0) / STEP_MS, L = this.snaps, i;
    this.flStats.snapIn++; this.lastSnapAt = now;
    if (s.T <= this.lastSnapT - C.SNAP_RING) return;
    for (i = 0; i < L.length; i++) if (L[i].T === s.T) return;   // repetida
    // latencia de las fotos (tics) y su variación: el colchón del rival (Dp = retraso + D)
    var lt = tf - s.T;
    // (tope: una foto muy vieja, p. ej. de las que esperaban en el enlace mientras esta página estaba parada, no es latencia)
    if (this.rttN) lt = Math.min(lt, this.rtt / STEP_MS + C.D_MAX + C.SNAP_CATCH);
    if (this.lateE < 0) { this.lateE = lt; this.jitE = 0; }
    else { this.jitE = this.jitE * 0.94 + Math.abs(lt - this.lateE) * 0.06; this.lateE = this.lateE * 0.97 + lt * 0.03; }
    this.lateL.push(lt); if (this.lateL.length > 64) this.lateL.shift();
    if (this.lastSeq >= 0 && s.seq !== this.lastSeq) {
      var gap = (s.seq - this.lastSeq - 1) & 65535;
      if (gap < 1000) this.lossE = this.lossE * 0.98 + Math.min(gap, 4) * 0.02;
      else if (((this.lastSeq - s.seq) & 65535) < 1000) this.lossE = Math.max(0, this.lossE - 0.02);   // (llegó tarde, no se perdió: se descuenta el hueco)
    }
    if (this.lastSeq < 0 || ((s.seq - this.lastSeq) & 65535) < 1000) this.lastSeq = s.seq;
    var nl = this.lateL.length, ls = this._lsc || (this._lsc = new Float64Array(64)), il;   // (sin copia ni comparador: orden numérico)
    for (il = 0; il < nl; il++) ls[il] = this.lateL[il];
    ls = ls.subarray(0, nl).sort();
    this.lateP = ls[Math.min(nl - 1, Math.floor(nl * 0.95))];
    if (s.T > this.lastSnapT) this.lastSnapT = s.T;
    // la foto de saque va por el canal que pierde: si se pierde, la primera foto viva del r actual hace de foto de saque (si no, el
    // rival se quedaba quieto en la formación todo su saque, sin andar ni lanzar, y saltaba al empezar el rally)
    if (!(s.flags & (F_TELE | F_IDLE)) && this.teleR !== s.r && this.g && this.g.fl && s.r === (this.g.fl.r & 65535)) s.flags |= F_TELE;
    if (s.flags & F_TELE) { this.teleR = s.r; var keep = []; for (i = 0; i < L.length; i++) if (L[i].T > s.T) keep.push(L[i]); L = this.snaps = keep; }
    else for (i = 0; i < L.length; i++) if ((L[i].flags & F_TELE) && L[i].T > s.T) return;   // anterior a un saque nuevo: ya no vale
    var at = L.length; while (at > 0 && L[at - 1].T > s.T) at--;
    L.splice(at, 0, s);
    while (L.length > C.SNAP_RING) L.shift();
    if (s.flags & F_SOLO) this.rivalSolo = true;
    // fantasma: si el balón del dueño se separa más de 3 cm del mío en ese tic (otro navegador, otra trigonometría), se rebasa
    var b = s.ball;
    if (b && F.own !== this.slot && !F.loc[F.own] && g.mode === 'rally' && !F.frozen && !g.ball.held && s.r === (F.r & 65535) && b.seq === (F.seq & 255)) {
      var gr = this.gRing[s.T & 63];
      if (gr && gr.T === s.T && gr.r === F.r && gr.seq === F.seq) {
        var dx = b.x - gr.x, dy = b.y - gr.y, dz = b.z - gr.z;
        if (dx * dx + dy * dy + dz * dz > C.REBASE * C.REBASE && this.T > s.T) {
          var S = Sim(), bb = g.ball, o = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, spin: bb.spin, speed: bb.speed, dip: bb.dip, wobA: bb.wobA, wobF: bb.wobF, wobP: bb.wobP };
          var n = (this.T - s.T) * 2, out = S.flFly(o, gr.age, n, STEP / 2, {});
          bb.x = out.x; bb.y = out.y; bb.z = out.z; bb.vx = out.vx; bb.vy = out.vy; bb.vz = out.vz;
          this.flStats.drift++; if (this.bSrc === 'sim') this.bJump = true;   // (pintando la cadena, lo pintado no cambia: sin salto)
          this._log('fantasma rebasado en el tic ' + s.T + ' (' + Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) * 100) + ' cm)');
        }
      }
    }
  };

  /* ---- tc: contacto del dueño rival ---- */
  SP._onTc = function (c, now, viaRb) {
    var S = Sim(), g = this.g, F = g.fl, me = this.slot;
    if (!c || typeof c.r !== 'number' || typeof c.s !== 'number' || !c.b || !c.m) return;
    if (Array.isArray(c.m)) c.m = decM(c.m);
    var key = c.r + ':' + c.s + ':' + c.T + ':' + c.h;
    if (this.seenTc[key]) {   // ya aplicado (por el eco sin eventos): solo faltan sus eventos
      if (this.seenTc[key] === 'e' && !c.ne && Array.isArray(c.ev)) { this.seenTc[key] = 1; for (var k0 = 0; k0 < c.ev.length && k0 < 64; k0++) this._remEv(c.ev[k0], 'b'); }
      return;
    }
    // contacto de un tic que aún no he simulado (el reloj del otro va un poco por delante): se aplica al llegar a él
    if (2 * c.T + c.h + 1 > 2 * this.T + 2) {
      for (var f0 = 0; f0 < this.tcFut.length; f0++) { var q0 = this.tcFut[f0]; if (q0.r === c.r && q0.s === c.s && q0.T === c.T) { if (q0.ne && !c.ne) this.tcFut[f0] = c; return; } }   // (el de 'ctl' trae los eventos)
      if (this.tcFut.length < 64) this.tcFut.push(c);
      return;
    }
    // bifurcación con un punto mío aún sin confirmar: si su contacto es anterior al primero mío, mi punto no valió (spec §4.3)
    // Gana lo que pasó antes (spec): su contacto contra lo primero de mi rama que él no había visto (mis contactos con s > c.par)
    // o mi punto. (Antes: pp.lf siempre -1, point() lo borra antes de leerlo, y el punto del dueño siempre perdía)
    if (c.r === F.r - 1 && this.ptPend[c.r] && c.s > this.ptPend[c.r].lt) {
      var pp = this.ptPend[c.r], hm = 2 * c.T + c.h, md = this._myDiv(pp.tcs, c.par | 0, pp.ph);
      var win = hm < md || (hm === md && me === 1);
      if (!win) { this.flStats.dropped++; return; }
      if (!this._undoPoint(c.r, now)) {   // ganaba su rama pero ya no se puede deshacer (saque siguiente o final ya puestos): no cuadra
        this.flStats.dropped++; this.flStats.ptBad++; this.cmpBad = this.T; if (this.host) this._sendSb(now); return;
      }
      this._dropMine(c.r, pp.tcs, c.par | 0);
    }
    var rk = F.r;
    var st = S.flApplyTc(g, c, this.T, C.REWIND ? this._rw : null);
    if (st === 'future') { if (this.tcQ.length < 64) this.tcQ.push(c); return; }
    if (st !== 'ok' && st !== 'fork') { if (st === 'lose') this.flStats.stale++; else this.flStats.dropped++; return; }
    this.seenTc[key] = c.ne ? 'e' : 1; this.flStats.tcIn++;
    if (c.s > this.lastTcIn) this.lastTcIn = c.s;
    if (c.s > this.chainS) this.chainS = c.s;
    var hc = 2 * c.T + c.h;
    if (st === 'fork') {
      this.flStats.forks++; this.myLastS = -1; this.myLastTc = null;
      var keep = []; for (var i = 0; i < this.chain.length; i++) if (this.chain[i].hc < hc) keep.push(this.chain[i]); this.chain = keep;
      // mi toque de la rama perdida no cuenta: fuera de mis confirmados (estadísticas iguales en los dos) y un «miss» en mi jugador
      var mt = []; for (i = 0; i < this.myTcs.length; i++) if (this.myTcs[i].hc < hc) mt.push(this.myTcs[i]);
      this._dropMine(F.r, this.myTcs, c.par | 0, hc, true); this.myTcs = mt;
    }
    this.chain.push({ hc: hc, b: c.b, bAge: c.bAge, full: !!c.full, team: 1 - me, s: c.s });
    if (this.chain.length > 40) this.chain.shift();
    // comprobación del traspaso (depuración, spec §2.10 flOwnerCheck): el balón del tc volado kh medios pasos está en la zona del otro
    if (C.KHCHECK && c.kh >= 0 && S.flOwnerCheck) {
      var B0 = c.b, o0 = { x: B0[0], y: B0[1], z: B0[2], vx: B0[3], vy: B0[4], vz: B0[5], spin: B0[6], speed: B0[7], dip: B0[8], wobA: B0[9], wobF: B0[10], wobP: B0[11] }, of = o0;
      if (c.kh > 0) { if (c.full && c.kh >= 2) { of = S.flFly(o0, c.bAge, 1, STEP, {}); of = S.flFly(of, of.age, c.kh - 2, STEP / 2, of); } else of = S.flFly(o0, c.bAge, c.kh, STEP / 2, {}); }
      var cm = !(c.m.touchTeam === c.own && c.m.touches >= 3);
      if (S.flOwnerCheck(of, c.own, cm) !== 1 - c.own) this.flStats.khCheckBad++;
    }
    // retraso de la recuperación
    var lateT = this.T - c.T;
    if (lateT * STEP_MS > this.flStats.lateMaxMs) this.flStats.lateMaxMs = lateT * STEP_MS;
    if (lateT * 2 > C.CATCH_MAX) this.flStats.late++;
    // eventos del contacto: se pintan cuando el balón pintado llega al contacto
    if (!c.ne && Array.isArray(c.ev)) for (var k = 0; k < c.ev.length && k < 64; k++) this._remEv(c.ev[k], 'b');
    // reloj del balón: si viene hacia mí (kh >= 0), acelera hasta el presente en khAt
    this._lagOnTc(c, now);
    this._post(now, rk);
    // su pt de este rally que rechacé con rb (mi contacto era más nuevo) vale si mi rama ya no existe (myLastS = -1 tras la
    // bifurcación o el punto deshecho): el otro no lo vuelve a mandar y sin esto el rally se quedaba esperando su punto para siempre
    var pj = this.ptRej[g.fl.r];
    if (pj && this.myLastS < 0) { delete this.ptRej[g.fl.r]; this._onPt(pj, now); }
  };
  /** Mi punto (r) no valió: marcador, r y modo de antes; fuera sus eventos sin confirmar. */
  /** Medio paso en que empieza mi rama para el rival: el primero de mis contactos (tcs) que no había visto (s > seen), o ph. */
  SP._myDiv = function (tcs, seen, ph) {
    var d = ph, i;
    if (tcs) for (i = 0; i < tcs.length; i++) if (tcs[i].s > seen && tcs[i].hc < d) d = tcs[i].hc;
    return d;
  };
  /** Mi rama del rally r no valió: mis eventos de contacto desde el primero que el rival no vio (o desde el medio paso fromHc) fuera
   *  de los confirmados y de los que aún no salieron; miss: un «miss» en el jugador del toque perdido (spec §4.3). */
  SP._dropMine = function (r, tcs, seen, fromHc, miss) {
    var me = this.slot, t0 = Infinity, i, p = null;
    if (tcs) for (i = 0; i < tcs.length; i++) if (tcs[i].s > seen && (fromHc === undefined || tcs[i].hc >= fromHc) && tcs[i].T < t0) t0 = tcs[i].T;
    if (t0 === Infinity) return;
    var drop = function (e) { return e._o === me && CONTACT[e.type] === 1 && e._tick >= t0; };
    var b = this.confBuf[r];
    if (b) { var kb = []; for (i = 0; i < b.length; i++) { if (drop(b[i])) { if (!p && b[i].player) p = b[i].player; } else kb.push(b[i]); } this.confBuf[r] = kb; }
    var ko = []; for (i = 0; i < this.evOut.length; i++) { var x = this.evOut[i]; if (!(x._r === r && CONTACT[x.type] === 1 && x._T >= t0)) ko.push(x); } this.evOut = ko;
    if (miss && p && this._pres) this._pres.push({ type: 'miss', player: p, reason: 'late', _tick: this.T, _o: me, _i: this.evI++ });
  };
  /** ¿Gana el pt rival c a mi rama (mis contactos tcs, mi punto en ph, lt = el último tc suyo que yo había aplicado)? Lo que pasó antes:
   *  su rama empieza en su punto, o en su primer toque desde su último tc aplicado si yo no lo apliqué (lfp + 1 > lt). Empate: anfitrión. */
  SP._ptWins = function (c, tcs, ph, lt) {
    var rd = typeof c.ph === 'number' ? c.ph : 2 * c.T + 1;
    if (typeof c.lf === 'number' && c.lf >= 0 && (c.lfp | 0) + 1 > lt && c.lf < rd) rd = c.lf;
    var md = this._myDiv(tcs, c.lt == null ? -1 : c.lt, ph);
    return rd < md || (rd === md && this.slot === 1);
  };
  SP._undoPoint = function (r, now) {
    var S = Sim(), g = this.g, pp = this.ptPend[r], pre = pp && pp.pre;
    // todo o nada: con el saque siguiente ya preparado (jugadores teletransportados, nextSet) o el final ya presentado no se puede
    // deshacer limpio; el que llama lo trata como un punto que no cuadra (ptBad, no verificado y sb del anfitrión)
    if (g.fl.srvR > r || this.goSeen) { this._log('bifurcación: mi punto ' + r + ' ya no se puede deshacer'); return false; }
    // el marcador de ANTES de ese punto (el pre del setupServe de r). this.pre no vale: si ya pasó el tiempo muerto (corte), es el
    // del saque siguiente y no desharía nada
    if (!pre || pre.r !== r) { this._log('bifurcación: no puedo deshacer mi punto ' + r); return false; }
    S.flMatch(g, pre); g.mode = 'rally'; g.finished = false; g.call = null; g._snap = null;   // (sin challenge de un punto deshecho)
    if (g.fl.srvR > r) g.fl.srvR = r;   // (si ya había preparado el saque de r + 1, flServe no volvería a prepararlo: saque atascado)
    this.pre = pre;
    delete this.ptPend[r]; delete this.ptDig[r];
    var b = this.confBuf[r], keep = [], i;
    if (b) for (i = 0; i < b.length; i++) if (b[i]._o !== this.slot || !(b[i].type in NOSEND) && !(b[i].type === 'whistle' && b[i].reason === 'point')) keep.push(b[i]);
    if (b) this.confBuf[r] = keep;
    delete this.confBuf[r + 1];
    this.curR = g.fl.r; this.myLastS = -1; this.myLastTc = null;
    if (this.goSeen || this.status === 'over') {   // (ese punto cerró el partido: el final no valía; el fin mandado se retira)
      this.goSeen = false; this.goPend = null; this.overAt = -1; this.overTeam = -1; this.result = null;
      if (this.status === 'over') this.status = 'playing';
      if (this.finSent) { this.finSent = false; this._ctl({ k: 'fin', x: 1 }); }
    }
    this.flStats.forks++;
    this._log('bifurcación: mi punto ' + r + ' no vale');
    void now;
    return true;
  };
  /* ---- pt: punto del otro ---- */
  SP._onPt = function (c, now) {
    var S = Sim(), g = this.g, F = g.fl;
    if (typeof c.r !== 'number') return;
    if (c.r > F.r) { if (this.ptQ.length < 16) this.ptQ.push(c); return; }
    // mi fq devuelto (fx) esperaba a que el balón volviera a ser mío y llega su punto: si mi toque de red fue antes que su punto, lo
    // que pasó primero manda: pito yo la falta (con el medio paso del toque) y su punto no se aplica; al llegarle el mío, lo deshace
    // (spec: gana lo anterior). Antes _rChange tiraba el fx y el rally se lo llevaba el punto de después
    if (c.r === F.r && this.fxHeld.length && g.mode === 'rally') {
      var cph = typeof c.ph === 'number' ? c.ph : 2 * c.T + 1;
      for (var fq = 0; fq < this.fxHeld.length; fq++) {
        var hq = this.fxHeld[fq], fp = byId(g, hq.pid);
        if (hq.r !== c.r || hq.T < 0 || 2 * hq.T - 1 >= cph || !fp || fp.team !== this.slot) continue;
        var rk0 = F.r, np0 = F.pts.length;
        F.own = this.slot; F.khAt = -1;   // (el rally acaba aquí: juzga quien tiene lo anterior)
        S._fault(g, fp.team, 'net', 'Toque de red', fp); this.flStats.fqOk++;
        if (F.pts.length > np0) F.pts[F.pts.length - 1].hs = 2 * hq.T - 1;
        this.fxHeld = []; this.flStats.dropped++;
        this._log('toque de red devuelto (fx) anterior a su punto: lo pito yo');
        this._post(now, rk0); return;
      }
    }
    if (c.r < F.r) {
      if (this.ptPend[c.r]) {   // los dos dimos el punto r: gana la rama que empezó antes (por tiempo)
        var pp = this.ptPend[c.r], clt = c.lt == null ? -1 : c.lt;
        if (!this._ptWins(c, pp.tcs, pp.ph, pp.lt)) {
          // gana mi rama: si tiene un contacto que él no vio, se lo mando (rb); si no, mi pt ya le llega y lo resuelve allí
          if (pp.myS > clt && pp.tc) { this.ptRej[c.r] = c; this._ctl({ k: 'rb', r: c.r, tc: pp.tc }); this.flStats.rb++; } else this.flStats.dropped++;
          return;
        }
        if (!this._undoPoint(c.r, now)) {   // (sin el marcador de antes no se puede deshacer: no verificado y el anfitrión manda el suyo)
          this.flStats.ptBad++; this.cmpBad = this.T; if (this.host) this._sendSb(now); return;
        }
        this._dropMine(c.r, pp.tcs, clt);
      } else return;
    } else if (this.myLastS >= 0 && this.myLastS > (c.lt == null ? -1 : c.lt) && this.myLastTc) {
      // su punto es de una rama que no ha visto mi último contacto: gana lo que pasó antes. Si es mi contacto, le mando el tc
      // ganador (rb); si su punto fue antes (p. ej. su propia falta justo antes del traspaso), vale y mi rama se pierde
      if (!this._ptWins(c, this.myTcs, Infinity, this.lastTcIn)) { this.ptRej[c.r] = c; this._ctl({ k: 'rb', r: c.r, tc: this.myLastTc }); this.flStats.rb++; return; }
      this._dropMine(c.r, this.myTcs, c.lt == null ? -1 : c.lt);
    }
    if (Array.isArray(c.m)) c.m = decM(c.m);
    // su contacto de este rally que aún esperaba en tcFut (su reloj va por delante): tras el punto ya no se aplicaría (r distinto) y
    // sus eventos (el golpe) se perdían aquí y en los confirmados (estadísticas distintas). Se quedan sus eventos; el balón, no
    if (this.tcFut.length) {
      var kf = [];
      for (var fi = 0; fi < this.tcFut.length; fi++) {
        var q = this.tcFut[fi], qk = q.r + ':' + q.s + ':' + q.T + ':' + q.h;
        if (q.r !== c.r) { kf.push(q); continue; }
        if (!this.seenTc[qk] && !q.ne && Array.isArray(q.ev)) { this.seenTc[qk] = 1; for (var qe = 0; qe < q.ev.length && qe < 64; qe++) this._remEv(q.ev[qe], 'b'); }
      }
      this.tcFut = kf;
    }
    var rk = F.r;
    var ok = S.flApplyPt(g, c);
    if (ok === null) return;
    this.flStats.ptIn++;
    this._post(now, rk);
    this._release(c.r);
    var d = S.flDigest(g);
    if (ok === false) {
      this.flStats.ptBad++; this.cmpBad = this.T;
      if (this.host) this._sendSb(now);
    } else this.cmpOk++;   // (cmpBad: el invitado lo borra con el sb; el anfitrión, con su sbok)
    this._ctl({ k: 'pa', r: c.r, d: d });
    this._rChange(now);
  };
  SP._onPa = function (c, now) {
    var S = Sim();
    var pd = this.ptDig[c.r];
    if (pd && Array.isArray(c.d)) {
      var same = pd.length === c.d.length; for (var i = 0; same && i < pd.length; i++) if (pd[i] !== c.d[i]) same = false;
      if (same) { this.cmpOk++; if (this.cmpBad >= 0 && this.host) this.cmpBad = -1; }
      else { this.flStats.digestBad++; this.cmpBad = this.T; if (this.host) this._sendSb(now); }
    }
    delete this.ptDig[c.r];
    if (this.ptPend[c.r]) { delete this.ptPend[c.r]; this._release(c.r); }
    void now;
  };
  /** Arreglo del marcador (anfitrión): el sb lleva el tic del desacuerdo; el invitado contesta sbok con él y entonces se borra cmpBad
   *  (como el snapok de net.js). Sin esto, si los puntos que quedaban eran del invitado, solo el anfitrión daba el partido por no válido. */
  SP._sendSb = function (now) {
    this._ctl({ k: 'sb', blk: Sim().flMatch(this.g), t: this.cmpBad }); this.sbAt = now;
  };
  SP._onFq = function (c, now) {
    var S = Sim(), g = this.g, F = g.fl, p = byId(g, c.pid | 0);
    if (g.mode === 'rally' && c.r === F.r && F.own === this.slot && p && p.team !== this.slot) {
      var rk = F.r, np = F.pts.length;
      S._fault(g, p.team, 'net', 'Toque de red', p); this.flStats.fqOk++;
      if (F.pts.length > np && typeof c.T === 'number') F.pts[F.pts.length - 1].hs = Math.min(2 * c.T - 1, 2 * F.T + 1);   // (el punto es del momento del toque de red)
      this._post(now, rk);
    } else this._ctl({ k: 'fx', r: c.r, pid: c.pid, T: c.T });
  };
  /** fq devueltos (fx) del rally actual: en cuanto el balón es mío y sigue el peloteo, falta de mi jugador (punto del rival). */
  SP._fxCheck = function (now) {
    var S = Sim(), g = this.g, F = g.fl, L = this.fxHeld, keep = [], i;
    if (!L.length) return;
    this.fxHeld = [];
    for (i = 0; i < L.length; i++) {
      var q = L[i];
      if (q.r !== F.r) continue;   // (el rally ya acabó: nada)
      if (g.mode !== 'rally' || F.own !== this.slot || !F.loc[this.slot]) { keep.push(q); continue; }
      var p = byId(g, q.pid);
      if (!p || p.team !== this.slot) continue;
      var rk = F.r, np = F.pts.length;
      S._fault(g, p.team, 'net', 'Toque de red', p); this.flStats.fqOk++;
      if (F.pts.length > np && q.T >= 0) F.pts[F.pts.length - 1].hs = Math.min(2 * q.T - 1, 2 * F.T + 1);
      this._log('toque de red devuelto (fx): lo pito yo');
      this.fxHeld = []; this._post(now, rk); return;
    }
    this.fxHeld = keep.concat(this.fxHeld);
  };
  SP._onEv = function (c, now) {
    if (!Array.isArray(c.l)) return;
    for (var i = 0; i < c.l.length && i < 200; i++) this._remEv(c.l[i], 'p');
    void now;
  };
  /** Evento remoto: al búfer del rally (confirmados) y a la cola de presentación ('b' = con el balón pintado, 'p' = con el rival). */
  SP._remEv = function (o, kind) {
    if (!o || typeof o !== 'object' || typeof o.type !== 'string') return;
    var e = decEv(o, this.g), r = typeof o._r === 'number' ? o._r : this.g.fl.r;
    delete e._r; e._o = 1 - this.slot; e._i = this.evI++;
    if (typeof e._tick !== 'number') e._tick = this.T;
    if (r <= this.confR) { e._conf = true; this._confOut.push(e); }
    else (this.confBuf[r] || (this.confBuf[r] = [])).push(e);
    var dt = kind === 'b' ? this.tauB : this.Tr;
    // (el bote del punto también va con el balón pintado: con el balón del rival este va Dp por detrás y el bote sonaba antes de que
    //  se le viera caer; tras el punto el reloj del balón alcanza el presente a velocidad doble, ver _dispBall)
    // muy tarde: sin sonido ni efecto. Salvo el contacto que acaba de cambiar el balón (bloqueo, red, golpe) del rally en juego: el
    // balón pintado salta o se mezcla ahora, y sin el evento el atacante (RTT 300) no veía ni oía el bloqueo
    if (SENSORY[e.type] === 1 && e._tick < dt - C.MUTE_TICKS && !(kind === 'b' && CONTACT[e.type] === 1 && r >= this.g.fl.r)) return;
    this.remPres.push({ k: kind, e: e });
  };

  /* ---- resync (rs): foto entera; solo tras jugar solo, un corte largo o la vuelta del anfitrión ---- */
  SP._resync = function (now) {
    var S = Sim(), g = this.g;
    if (this.status === 'starting' || !g || !g.fl) return;
    var F = g.fl, me = this.slot, rm = 1 - me;
    if (F.loc[rm]) {   // deshace el flTake: el rival vuelve a ser suyo
      F.loc[rm] = false; F.catch = false;
      if (g.hum[rm].ai) S.setSlotAI(g, rm, false);
      g.events.length = 0;
    }
    if (g.mode === 'rally' && F.khAt < 0 && !F.frozen && S._flKh) {   // balón en vuelo sin traspaso (jugado solo): se calcula ahora
      // en solitario no hay traspasos y own se queda en el del setupServe (puede ser el rival aunque el balón vaya a mi campo): el dueño
      // es quien tocó el último, hasta que el balón entra en la zona del otro
      if (g.touchTeam === 0 || g.touchTeam === 1) F.own = g.touchTeam;
      // ...y si ya la pasó (el balón está en el campo del otro: equipo 0 en x > 0), es del otro y sin traspaso: flKh no la encuentra
      // y el último que tocó la dejaba caer en el campo contrario sin que pudieran jugarla
      if (g.ball.x * (F.own === 0 ? 1 : -1) < 0) { F.own = 1 - F.own; F.khAt = -1; F.kh = -1; }
      else { var kh = S._flKh(g); if (kh >= 0) { F.khAt = 2 * this.T + 2 + kh; F.kh = kh; } }
    }
    var rm2 = { k: 'rs', id: ++this.rsId, T: this.T, d: S.serialize(g), t0: this.t0, valid: this.valid, se: this.soloEpoch };   // (t0 en mi reloj: el otro le resta su desfase, como net.js)
    this._ctl(rm2); this.rsPend = { m: rm2, at: now, n: 0 };
    this.solo = false; this.rivalSolo = false; this.lostAt = -1; this.waitStart = -1; this.stats.resyncs++;
    this.chain = []; this.lagPlan = null; this.gapBig = false;
    // el otro vuelve a numerar sus fotos desde 0 (_resetPlay): con mi lastSeq viejo, la pérdida se quedaba congelada tanto tiempo
    // como llevaba el partido
    this.lastSeq = -1; this.lossE = 0;
    this._log('resync: foto del tic ' + this.T);
  };
  SP._applyResync = function (c, now) {
    var S = Sim();
    if (!this.opts || !c.d || typeof c.T !== 'number') return false;
    if (!S.deserialize(c.d, this.g)) return false;
    var g = this.g, F = g.fl, me = this.slot;
    if (!F) F = S.flInit(g, me);
    F.me = me; F.loc = [me === 0, me === 1]; F.fq = []; F.pts = []; F.dirty = ''; F.tc = null; F.lf = -1; F.lfPar = 0;
    F.catch = false; F.app = false; F.wait = 0; F.sr = false; F.fqK = [];
    g.events.length = 0;
    this._resetPlay();
    this.T = c.T | 0; this.gcTick = this.T; F.T = this.T;
    if (typeof c.t0 === 'number') this.t0 = c.t0 - this.off;
    this.curR = F.r; this.confR = F.r - 1; this.pre = S.flMatch(g); this.teleR = F.r & 65535;   // (el rival ya preparó este saque: no manda otra foto de saque)
    if (g.mode === 'serve') { this.peerSr = F.r; F.peer = true; }   // (el sr lo manda _onCtl tras el rsok)
    this.solo = false; this.rivalSolo = false; this.lostAt = -1; this.waitStart = -1;
    this.valid = c.valid !== false;
    this.cmpBad = -1;   // (marcador idéntico al del otro: lo que no cuadraba antes ya no cuenta, como net.js)
    if (this.status !== 'over') { this.result = null; this.status = 'playing'; }
    this.started = true; this.stats.resyncs++; this.stats.rsIn++; this.rsT = this.T;
    if (this.adopt) { this.adopt = false; this.rejoinEpoch = Math.max(this.rejoinEpoch, c.se | 0); }
    this.back = false;
    this._log('resync aplicado: tic ' + this.T);
    void now;
    return true;
  };

  /* ---- reloj del balón pintado (spec §5.3) ----
   * lag = tics que el balón pintado va por detrás del presente. Con el balón del rival, Dp (el colchón del rival: así su mano y el
   * balón cuadran); con el mío, 0. Tras un contacto rival que viene hacia mí, el lag baja en línea recta hasta 0 en khAt (velocidad
   * 1 + lag/(Th - t) ≤ WARP_MAX; si no cabe, salto con mezcla de 40 ms). Tras un contacto mío que se va al rival, sube hasta Dp
   * (a 0,8 como poco; ver _lagOnMine). */
  SP._lagOnTc = function (c, now) {
    var tf = (now - this.t0) / STEP_MS, l0 = this.lag;
    // el tc aplicado puede haber cambiado el balón de la sim o la cadena: la corrección sale de la trayectoria pintada de antes y
    // decae (spec §5.3), también por los caminos sin plan (antes se tomaba el balón ya corregido: salto sin mezcla)
    this.bJump = true;
    if (c.kh >= 0 && c.khAt >= 0) {
      // spec §5.3: off(t) = lag · clamp((Th - t) / (Th - Tc)) desde el contacto Tc; lo que ya pasó al llegar el tc (la ida) es un
      // salto pequeño que se mezcla con el desplazamiento que decae
      var Th = c.khAt / 2, Tc = c.T + (c.h + 1) / 2, span = Th - Tc;
      // saque: nadie puede tocarlo junto a la red (sin bloqueo de saque) y el receptor está a 5-9 m: el lag acaba de bajar un poco
      // después del traspaso (como mucho 0,5·vuelo o SERVE_EXT tics). La aceleración baja de 1 + lag/vuelo a 1 + lag/(1,5·vuelo)
      // Igual con un balón libre si ninguno de mis jugadores está junto a la red (|x| < 2,5 m: nadie puede tocarlo en el traspaso)
      var ext = c.kind === 'serve' || (c.m && c.m.lastKind === 'free' && !this._mineNear(2.5)), Te = ext && span > 0 ? Th + Math.min(0.5 * span, C.SERVE_EXT) : Th;
      // libre (no la dejada) con alguno de los míos junto a la red: el lag no tiene que estar a 0 exacto en el traspaso, basta con que
      // el balón pintado vaya como mucho FREE_TOL m por detrás del real (un bloqueo de un libre se ve en su sitio). El plan lineal deja
      // en Th lag·(Te-Th)/(Te-Tc): con eso = res, Te - Th = res·span/(l0 - res). Antes: 1 + Dp/vuelo, hasta 1,85 con RTT 150 y variación 40
      if (!ext && span > 0 && l0 > 0.01 && c.m && c.m.lastKind === 'free' && c.m.lastShot !== 'tip') {
        var bh = this._ballAt(Th), vb = bh ? Math.sqrt(bh.vx * bh.vx + bh.vy * bh.vy + bh.vz * bh.vz) : 0;
        var res = vb > 0 ? Math.min(0.5 * l0, C.FREE_TOL / (vb * STEP)) : 0;
        if (res > 0.01) Te = Th + Math.min(C.SERVE_EXT, res * span / (l0 - res));
      }
      // (lag ya a 0: se queda a 0 hasta el traspaso; sin plan, la deriva lo subía hacia Dp con el balón viniendo hacia mí)
      if (l0 <= 0.01) { this.lagPlan = Th > tf ? { t0: tf, t1: Th + 1, l0: 0, l1: 0 } : null; return; }
      var sp = span > 0 && Th > tf ? 1 + l0 / (Te - Tc) : Infinity;
      if (sp > C.WARP_MAX) {
        // salto: solo lo que el reloj a WARP_MAX no puede absorber hasta Th; el resto se acelera. Hasta el traspaso el balón sigue
        // siendo del rival y la deriva volvía a subir el lag hacia Dp: el plan lo lleva a 0 en Th
        var lk = Th > tf ? Math.min(l0, (C.WARP_MAX - 1) * (Th - tf)) : 0;
        this.lag = lk; this.lagPlan = Th > tf ? (lk > 0.01 ? { t0: tf, t1: Th, l0: lk, l1: 0 } : { t0: tf, t1: Th + 1, l0: 0, l1: 0 }) : null;
        if (lk > 0.01 && C.WARP_MAX > this.flStats.warpMax) this.flStats.warpMax = C.WARP_MAX;
        this.flStats.snaps++; this.bSnap = true; return;
      }
      if (sp > this.flStats.warpMax) this.flStats.warpMax = sp;
      this.warpL.push({ sp: sp, k: c.kind === 'serve' ? 'serve' : c.m && c.m.lastKind, sh: c.m && c.m.lastShot, l0: l0, span: span, te: Te - Th }); if (this.warpL.length > 512) this.warpL.shift();
      this.lagPlan = { t0: Tc, t1: Te, l0: l0, l1: 0 };
    } else this._lagGrow(tf);
  };
  /** Contacto rival que se queda en su campo (kh < 0): el lag sube hacia Dp con una curva suave (smoothstep) cuya pendiente máxima
   *  es LAG_UP_RIV (el balón a 0,65 como poco, y solo un momento). Antes: sin plan, la deriva a 0,5 fija (media velocidad 0,4-0,7 s
   *  tras cada defensa o bloqueo rival). Lo que falte al llegar su contacto siguiente lo absorbe la aceleración de siempre. */
  /** ¿Alguno de mis jugadores a menos de d m de la red? */
  SP._mineNear = function (d) {
    var M = this.g.teams[this.slot], i;
    for (i = 0; i < M.length; i++) if (Math.abs(M[i].x) < d) return true;
    return false;
  };
  SP._lagGrow = function (tf) {
    var Dp = this.Dp > 0 ? this.Dp : C.D_MIN, l0 = this.lag, dl = Dp - l0;
    if (dl <= 0.25) { this.lagPlan = null; return; }
    this.lagPlan = { t0: tf, t1: tf + 1.5 * dl / C.LAG_UP_RIV, l0: l0, l1: Dp, ease: 1 };
  };
  SP._lagOnMine = function (tc, tf) {
    // Mi toque con el balón pintado aún por detrás (un libre que llega con hasta FREE_TOL de retraso, el resto de una bajada): el lag
    // pasa a 0 en el acto y la diferencia se mezcla como un salto (60 ms cerca de los míos). Si no, el balón pintado llegaba a mi
    // contacto tarde y, si la sim lo recoloca en la mano, saltaba sin mezcla (0,8-0,9 m en un frame)
    if (this.lag > 0.01 && this.lagPlan && this.lagPlan.l1 === 0) { this.lag = 0; this.lagPlan = null; this.bJump = true; }
    if (tc.kh < 0 || tc.khAt < 0) { this.lagPlan = null; return; }
    var Th = tc.khAt / 2, Dp = this.Dp > 0 ? this.Dp : C.D_MIN, l0 = this.lag;
    // el balón es mío hasta el traspaso (se pinta como se simula, spec §5.3): el lag empieza a subir en Th, y despacio (0,8 como poco;
    // antes desde el contacto y a la mitad: mi remate se veía a cámara lenta)
    var t0 = Math.max(tf, Th), t1 = t0 + Math.max(0, Dp - l0) / C.LAG_UP_MINE, Tl = this._landT(tc), nx;
    // Si cae antes de llegar a Dp, sube igual (a la misma pendiente) hasta lo que tarda en llegarme su tc (lateE, la latencia de sus
    // fotos; menos LAND_HIDE tics, que la mezcla del balón ya disimula), y se queda ahí hasta que cae: así su defensa de mi remate se
    // pinta en su sitio. Antes se quedaba a 0 y su defensa llegaba tarde: una corrección en el presente de 3-4,6 m, sin mezcla, con
    // RTT 250 (30-40 por partido). Con RTT bajo apenas frena
    var lc = Math.max(l0, Math.min(Dp, this.lateE >= 0 ? this.lateE - C.LAND_HIDE : Dp));
    if (Tl >= 0 && Tl < t1) {
      var lu = Math.min(lc, l0 + Math.max(0, Tl - t0) * C.LAG_UP_MINE), tu = t0 + (lu - l0) / C.LAG_UP_MINE;
      nx = Tl <= tf ? null : lu - l0 > 0.01 && Tl > t0 ? { t0: t0, t1: tu, l0: l0, l1: lu, next: Tl > tu ? { t0: tu, t1: Tl, l0: lu, l1: lu } : null } : { t0: tf, t1: Tl, l0: l0, l1: l0 };
    }
    else nx = t1 > tf ? { t0: t0, t1: t1, l0: l0, l1: Dp } : null;
    this.lagPlan = nx;
  };
  /** Tic (fraccionario) en que el balón de un contacto toca el suelo en vuelo libre, o -1 (más de 4 s). */
  var _fl3 = {}, _fl4 = {};
  SP._landT = function (tc) {
    var S = Sim(), B = tc.b, BR = (VB.C && VB.C.BR) || 0.21, o = _fl4, n = 0, age = tc.bAge || 0;
    if (!B || !S.flFly) return -1;
    o.x = B[0] || 0; o.y = B[1] || 0; o.z = B[2] || 0; o.vx = B[3] || 0; o.vy = B[4] || 0; o.vz = B[5] || 0; o.spin = B[6] || 0; o.speed = B[7] || 0;
    o.dip = B[8] || 0; o.wobA = B[9] || 0; o.wobF = B[10] || 0; o.wobP = B[11] || 0;
    while (n < 960) {   // (vuela en el sitio: antes copiaba out en o cada 8 medios pasos, ~33 KB por llamada)
      S.flFly(o, age, 8, STEP / 2, o); n += 8; age = o.age;
      if (o.z <= BR + 1e-6) return (2 * tc.T + tc.h + n) / 2;
    }
    return -1;
  };

  /* ---- un tic ---- */
  SP._tick = function (now, inp) {
    var S = Sim(), g = this.g, F = g.fl, me = this.slot, rm = 1 - me, T1 = this.T + 1;
    if (this.peerSr === F.r) F.peer = true;
    if (this.tcFut.length) {   // contactos del rival que ya tocan (antes de simular T1)
      var fut = this.tcFut, k2; this.tcFut = [];
      for (k2 = 0; k2 < fut.length; k2++) this._onTc(fut[k2], now);
    }
    F.T = T1;
    if (!F.loc[rm]) this._simPose(T1);
    var li = this._in;
    li.move = inp && inp.move ? inp.move : NOIN.move;
    li.hit = !!(this.edges & 1); li.jump = !!(this.edges & 2); li.jset = !!(this.edges & 4); li.skip = !!(this.edges & 16);
    li.ai = !!((inp && inp.ai) || this.away);
    this.edges = 0; this.edgesAt = -1;
    var ri = F.loc[rm] ? AIIN : NOIN;
    this._ins[me] = li; this._ins[rm] = ri;
    var rk = F.r, hand0 = F.hand;
    S.step(g, STEP, this._ins);
    this.T = T1; this.gcTick = T1; this.stats.steps++;
    if (F.wait >= C.SR_FALLBACK && g.mode === 'point') { if (S.flServe(g, true)) { this.flStats.srFallback++; this._log('sin sr del rival en 2 s: saco igual'); } }
    this._ringPut(T1);
    if (this.fxHeld.length) this._fxCheck(now);
    if (F.hand !== hand0) { this.snapForce = true; this.flStats.hand += F.hand - hand0; }
    this._post(now, rk);
    var gr = this.gRing[T1 & 63] || (this.gRing[T1 & 63] = {}), b = g.ball;
    gr.T = T1; gr.r = F.r; gr.seq = F.seq; gr.x = b.x; gr.y = b.y; gr.z = b.z; gr.age = F.bAge;
    this._snapMaybe(T1);
  };
  /** Pose de la SIM de los rivales (solo para mi IA): la última foto extrapolada al tic T, como mucho 12 tics (spec §5.2). */
  /** ¿Valen las fotos del rival para el rally actual? En el saque, hasta que llega su foto de saque (F_TELE, r actual) las fotos
   *  son del punto anterior: el rival se queda en la formación que puso mi setupServe (determinista, la misma que la suya). Antes se
   *  pintaba (y se simulaba, con el balón en la mano del sacador) donde estaba en el punto anterior y saltaba 2-10 m al llegar la foto. */
  SP._rivFresh = function () { var g = this.g; return g.mode !== 'serve' || this.teleR === (g.fl.r & 65535); };
  SP._simPose = function (T) {
    var L = this.snaps; if (!L.length || !this._rivFresh()) return;
    var s = L[L.length - 1], g = this.g, rm = 1 - this.slot, e = clampN(T - s.T, 0, C.EXTRAP_MAX) * STEP, G = (VB.C && VB.C.G) || 9;
    var P = this._poses, tau = 0.15, kk = tau * (1 - Math.exp(-e / tau)), i;
    for (i = 0; i < NPL; i++) {
      var q = s.pl[i], o = P[i] || (P[i] = {}), air = q.z > 0 || !(q.bits & 1);
      if (air) {
        o.x = q.x + q.vx * e; o.y = q.y + q.vy * e; o.z = q.z + q.vz * e - 0.5 * G * e * e; o.vz = q.vz - G * e;
        if (o.z <= 0) { o.z = 0; o.vz = 0; }
      } else { o.x = q.x + q.vx * kk; o.y = q.y + q.vy * kk; o.z = 0; o.vz = 0; }
      o.vx = q.vx; o.vy = q.vy; o.jvx = 0; o.jvy = 0;
      this._discrete(o, q, s.T, e, true);
    }
    Sim().flPose(g, rm, P);
  };
  /** Campos discretos de una foto en una pose (e = s desde la foto). sim: también pressEnd, cool y el gesto del humano. */
  SP._discrete = function (o, q, Ts, e, sim) {
    o.anim = Math.max(0, q.anim - e);
    o.lastAction = enumOf(ACTS, q.act);   // (undefined en vez de delete: la pose no pasa a modo diccionario; flPose se salta los undefined)
    o.actionT = q.age * STEP + e;
    o.shot = enumOf(SHOTS, q.shot);
    o.grade = enumOf(GRADES, q.grade);
    o.onGround = !!(q.bits & 1) && o.z <= 0;
    o.down = Math.max(0, q.down - e);
    if (sim) {
      o.pressEnd = (q.bits & 16) ? (Ts + q.press) * STEP : -9;
      o.cool = (q.bits & 32) ? Math.max(0, 0.1 - e) : 0;
      if (q.bits & 8) { o.swingLive = !!(q.bits & 4); var sw = enumOf(SHOTS, q.sw); o.swingShot = sw !== undefined ? sw : ''; }
      else { o.swingLive = undefined; o.swingShot = undefined; }
    }
  };
  /** Anillo de mis jugadores (x, y, z, vx, vy, vz, onGround, pressEnd) para la recuperación con rewind. */
  var KIN = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'onGround', 'pressEnd'];
  SP._ringPut = function (T) {
    var g = this.g, M = g.teams[this.slot], e = this.ring[T % C.POSE_RING] || (this.ring[T % C.POSE_RING] = { T: -1, p: [[], []] }), i, k;
    e.T = T;
    for (i = 0; i < M.length && i < 2; i++) for (k = 0; k < KIN.length; k++) e.p[i][k] = M[i][KIN[k]];
  };
  SP._rewind = function (j, g) {
    var t = j >> 1, e = this.ring[t % C.POSE_RING], M = g.teams[this.slot], i, k;
    if (!e || e.T !== t) return;
    for (i = 0; i < M.length && i < 2; i++) for (k = 0; k < KIN.length; k++) M[i][KIN[k]] = e.p[i][k];
  };

  /** Tras un paso o un mensaje aplicado: eventos, tc, sr, fq y pt de g.fl (spec §3.3). rk = r al empezar. */
  SP._post = function (now, rk) {
    var S = Sim(), g = this.g, F = g.fl, me = this.slot, E = g.events, i, e, T = this.T, sendOn = !this.solo && !F.loc[1 - me];
    for (i = 0; i < E.length; i++) {
      e = E[i]; e._tick = T; e._o = me; e._i = this.evI++;
      if (e.type === 'block') this.bJump = true;   // (el bloqueo recoloca el balón en la red, ±0,3 m: el salto se mezcla en vez de verse de golpe)
      if (e.type === 'gameOver') { if (!this.goSeen) { this.goSeen = true; this._pres.push(e); this._onOver(e, now); } continue; }
      this._pres.push(e);
      (this.confBuf[rk] || (this.confBuf[rk] = [])).push(e);
      if (sendOn && sendable(e)) { var x = encEv(e); x._r = rk; this.evOut.push(x); }
    }
    E.length = 0;
    if (F.dirty) {
      var tc = F.tc;
      F.dirty = '';
      if (tc && sendOn) {
        var now_ev = [], old = [];
        for (i = 0; i < this.evOut.length; i++) (this.evOut[i]._T === T ? now_ev : old).push(this.evOut[i]);
        this.evOut = old; this._flushEv();
        var m = {}, k; for (k in tc) m[k] = tc[k];
        m.k = 'tc'; m.m = encM(tc.m);
        if (this.epoch) m.ep = this.epoch;
        var js0 = JSON.stringify(m).slice(0, -1);   // (una sola vez: el eco y el de 'ctl' solo se diferencian en la cola)
        this._sendIn(encT(js0 + ',"ne":1}', this.epoch));   // eco por 'in' sin los eventos (llegan con el de 'ctl')
        m.ev = now_ev;
        var js = js0 + ',"ev":' + JSON.stringify(now_ev) + '}';
        try { this.link.send('ctl', js); } catch (er) { }
        this.stats.sent++; this.stats.bytesOut += js.length; this.flStats.kbOut += js.length / 1024;
        this.flStats.tcOut++;
        this.myLastS = tc.s; this.myLastTc = m; if (tc.s > this.chainS) this.chainS = tc.s;
        this.myTcs.push({ s: tc.s, hc: 2 * tc.T + tc.h, T: tc.T }); if (this.myTcs.length > 40) this.myTcs.shift();
        this.chain.push({ hc: 2 * tc.T + tc.h, b: tc.b, bAge: tc.bAge, full: !!tc.full, team: me, s: tc.s });
        if (this.chain.length > 40) this.chain.shift();
        this._lagOnMine(tc, (now - this.t0) / STEP_MS);
        this.snapForce = true;
      }
    }
    if (F.sr) {
      F.sr = false; this.tele = true; this.snapForce = true;
      this.pre = S.flMatch(g);
      if (sendOn) this._ctl({ k: 'sr', r: F.r });
    }
    if (F.fq.length) {
      if (sendOn) for (i = 0; i < F.fq.length; i++) { var q = F.fq[i]; this._ctl({ k: 'fq', r: q.r, reason: q.reason, pid: q.pid, T: q.T }); this.flStats.fqSent++; }
      F.fq.length = 0;
    }
    if (F.pts.length) {
      this._flushEv();   // (el bote y lo de antes llegan antes que el punto)
      for (i = 0; i < F.pts.length; i++) {
        var pt = F.pts[i], d = S.flDigest(g);
        if (sendOn) {
          // ph: medio paso del punto (el del toque de red de un fq aceptado: lo que pasó primero); lf/lfp: mi primer toque desde el
          // último tc aplicado (antes de que point() lo borre). Con ellos los dos lados deciden una bifurcación por tiempo
          var ph = typeof pt.hs === 'number' ? pt.hs : 2 * pt.T + 1, lf = typeof pt.lf === 'number' ? pt.lf : -1;
          this._ctl({ k: 'pt', r: pt.r, T: pt.T, w: pt.w, reason: pt.reason, text: pt.text, pid: pt.pid, sig: pt.sig, m: encM(pt.m), d: d, s: this.chainS, lt: this.lastTcIn, ph: ph, lf: lf, lfp: pt.lfp | 0, cl: pt.cl || null });
          this.flStats.ptOut++;
          this.ptPend[pt.r] = { at: now, ph: ph, myS: this.myLastS, tc: this.myLastTc, lt: this.lastTcIn, tcs: this.myTcs.slice(), pre: this.pre && this.pre.r === pt.r ? this.pre : null };
          this.ptDig[pt.r] = d;
        } else this._release(pt.r);
      }
      F.pts.length = 0;
    }
    if (F.r !== this.curR) this._rChange(now);
    if (this.evOut.length && T - this.evOutAt >= C.EV_EVERY) this._flushEv();
  };
  SP._flushEv = function () {
    if (!this.evOut.length) return;
    this._ctl({ k: 'ev', T: this.T, l: this.evOut });
    this.evOut = []; this.evOutAt = this.T;
  };
  /** Rally nuevo (punto aplicado o producido): cadena a cero y lo que esperaba a este r. */
  SP._rChange = function (now) {
    var g = this.g, F = g.fl, S = Sim(), i;
    if (F.r === this.curR) return;
    this.chainPrev = this.chain;   // (para pintar el final del vuelo tras el punto: _dispBall)
    this.curR = F.r; this.chain = []; this.chainS = -1; this.myLastS = -1; this.myLastTc = null; this.lastTcIn = -1; this.myTcs = [];
    for (var sk in this.seenTc) if ((sk.split(':')[0] | 0) < F.r - 2) delete this.seenTc[sk];
    for (var pk in this.ptRej) if (+pk < F.r) delete this.ptRej[pk];
    this.fxHeld = [];
    this.lagPlan = null;
    if (this.skHeld === F.r) { S.flSkip(g, 1 - this.slot); this.skHeld = -1; }
    if (this.peerSr === F.r) F.peer = true;
    var q = this.ptQ; this.ptQ = [];
    for (i = 0; i < q.length; i++) this._onPt(q[i], now);
    q = this.tcQ; this.tcQ = [];
    for (i = 0; i < q.length; i++) this._onTc(q[i], now);
  };
  /** Confirmados: el búfer de los rallies <= r, en orden (T, anfitrión primero, orden de llegada). */
  SP._release = function (r) {
    var out = [], k, i;
    for (k in this.confBuf) if (+k <= r) { out = out.concat(this.confBuf[k]); delete this.confBuf[k]; }
    out.sort(function (a, b) { return (a._tick - b._tick) || (a._o - b._o) || (a._i - b._i); });
    for (i = 0; i < out.length; i++) { out[i]._conf = true; this._confOut.push(out[i]); }
    if (r > this.confR) this.confR = r;
    this._goCheck();
  };
  SP._goCheck = function () {
    if (!this.goPend || this.confR < this.g.fl.r - 1) return;
    var e = this.goPend; this.goPend = null;
    this._release(this.g.fl.r);   // (lo de después del último punto)
    e._conf = true; this._confOut.push(e);
  };
  SP._onOver = function (e, now) {
    var g = this.g;
    this.status = 'over'; this.overAt = now; this.overTeam = e.team;
    this.goPend = e;
    if (this.solo && !this.goneFlag) this._gone();
    if (!this.solo && !this.finSent) { this.finSent = true; this._ctl({ k: 'fin', sets: g.sets.slice(), setScores: g.setScores.map(function (s) { return s.slice(); }), w: e.team }); }
    this._goCheck();
  };

  /* ---- foto propia ---- */
  SP._snapMaybe = function (T) {
    var g = this.g, F = g.fl, live = g.mode === 'serve' || g.mode === 'rally', every = live ? C.SNAP_RALLY : C.SNAP_IDLE;
    if (!this.snapForce && T - this.snapLastT < every) return;
    // recuperando tras un parón (página congelada, pestaña oculta): una foto de un tic viejo hacía que el otro midiera un retraso de
    // cientos de tics y su colchón Dp tardaba minutos en bajar. Solo sale la del final de la ráfaga (snapForce y tele se guardan)
    if (this._tgt - T > C.SNAP_CATCH) return;
    this.snapForceB = this.snapForce; this.snapLastT = T; this.snapForce = false;   // (en el peloteo el balón va en una foto de cada dos, y en las de un contacto)
    // (objetos de la foto reutilizados: encS los lee en el momento y solo se queda el buffer, que sí es nuevo cada vez)
    var me = this.slot, M = g.teams[me], h = g.hum[me], S = Sim(), sc = this._sScr, i;
    if (!sc) { sc = this._sScr = { o: { ep: 0, T: 0, r: 0, flags: 0, seq: 0, pl: [], ball: null }, b: {} }; for (i = 0; i < NPL; i++) sc.o.pl.push({}); }
    var pl = sc.o.pl;
    for (i = 0; i < NPL; i++) {
      var p = M[i], q = pl[i];
      if (!p) { q.x = q.y = q.z = q.vx = q.vy = q.vz = q.anim = q.act = 0; q.age = 255; q.shot = q.grade = 0; q.bits = 1; q.down = q.press = q.sw = 0; continue; }
      var isH = h.p === p, pr = p.pressEnd > g.time ? (p.pressEnd - g.time) * HZ : 0;
      var bits = (p.onGround ? 1 : 0) | (p.down > 0 ? 2 : 0) | (isH && S.slotGet(g, me, 'swingLive') ? 4 : 0) | (isH ? 8 : 0) | (pr > 0 ? 16 : 0) | (p.cool > 0 ? 32 : 0);
      q.x = p.x; q.y = p.y; q.z = p.z; q.vx = p.vx; q.vy = p.vy; q.vz = p.vz; q.anim = p.anim; q.act = enumIx(ACTS, p.lastAction);
      q.age = p.actionT * HZ; q.shot = enumIx(SHOTS, p.shot); q.grade = enumIx(GRADES, p.grade); q.bits = bits; q.down = p.down; q.press = pr;
      q.sw = isH ? enumIx(SHOTS, S.slotGet(g, me, 'swingShot')) : 0;
    }
    var b = g.ball, withB = null;
    if (live && F.own === me && !F.loc[1 - me] && (g.mode === 'serve' || (this.snapSeq & 1) === 0 || this.snapForceB)) {
      withB = sc.b; withB.x = b.x; withB.y = b.y; withB.z = b.z; withB.vx = b.vx; withB.vy = b.vy; withB.vz = b.vz; withB.seq = F.seq;
    }
    var flags = (this.away || g.hum[me].ai ? F_AWAY : 0) | (live ? 0 : F_IDLE) | (this.solo ? F_SOLO : 0) | (g.skipReq[me] ? F_SKIP : 0) | (this.tele ? F_TELE : 0);
    this.tele = false;
    var so = sc.o; so.ep = this.epoch; so.T = T; so.r = F.r; so.flags = flags; so.seq = this.snapSeq++; so.ball = withB;
    var buf = encS(so);
    this._sendIn(buf); this.flStats.snapOut++;
  };

  /* ---- un frame ---- */
  SP.advance = function (now, inp) {
    var out = this._out, i;
    this._gdOk = false;
    out.events = []; out.confirmed = []; out.app = this.appIn.length ? this.appIn.splice(0) : [];
    this._pres = out.events; this._confOut = out.confirmed;
    var dtF = this.lastNow ? now - this.lastNow : 0;
    this.lastNow = now;
    // muy por detrás (parón de más de 5 s): no se recupera más de 5 s de golpe. ANTES de _recv: el rs que manda _recv tras el corte
    // lleva ya el t0 y el T movidos (si se movía después, el otro rehacía el suyo con su propio «ahora» y su tic se quedaba la ida por
    // detrás para todo el partido). Se deja 0,5 s de margen para que quien aplica el rs no vuelva a pasar del tope.
    if (this.g && this.started && (this.status === 'playing' || this.status === 'waiting' || this.status === 'over') && this._target(now) - this.T > 600)
      this.t0 = now - (this.T + 540) * STEP_MS;
    if (this.link) this._recv(now);
    this.stats.frames++;
    if (inp) this.edges |= (inp.hit ? 1 : 0) | (inp.jump ? 2 : 0) | (inp.jset ? 4 : 0) | (inp.skip ? 16 : 0);

    // saludo, pings y reloj común (copia de net.js)
    if (this.connAt < 0) this.connAt = now;
    if (this.status === 'connecting' && now - Math.max(this.connAt, this.heardAt) > (this.adopt ? C.ADOPT_MS : C.CONNECT_MS)) this._noShow('sin noticias del rival en ' + (C.CONNECT_MS / 1000) + ' s');
    else if (this.status === 'connecting' && now - this.connAt > C.CONNECT_CAP) this._noShow('no se ha podido empezar en ' + (C.CONNECT_CAP / 1000) + ' s');
    if (this.rsPend) {
      if (this.goneFlag || this.status === 'ended' || this.status === 'over' || this.rsPend.n >= C.RS_TRIES) this.rsPend = null;
      else if (now - this.rsPend.at > C.RS_EVERY) { this.rsPend.at = now; this.rsPend.n++; this._ctl(this.rsPend.m); this._log('resync sin confirmar: lo repito'); }
    }
    if (this.status === 'connecting') {
      if ((!this.host || this.adopt) && !this.gotHello && now - this.helloAt > 500) { this.helloAt = now; this._hello(this.adopt ? { back: 1 } : null); }
      if ((!this.host || this.adopt) && this.gotHello && !this.ready) {
        if (this.pings.length < 8 && now - this.pingAt > 60) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: this.pingId++ }); }
        if ((this.pings.length >= 8 || (this.pings.length >= 3 && this.pingId > 30)) && this._warmOk(now)) {
          var best = this.pings.slice().sort(function (a, b) { return a.rtt - b.rtt; }).slice(0, 3);
          var offs = best.map(function (p) { return p.off; }).sort(function (a, b) { return a - b; });
          this.off = offs[offs.length >> 1]; this.ready = true; this._ctl({ k: 'ready' });
          this._log('reloj: desfase ' + this.off.toFixed(1) + ' ms, RTT ' + best[0].rtt.toFixed(1) + ' ms');
        } else if (this.pingId > 30 && this.pings.length < 3) { this.pingId = 0; this.pings.length = 0; }
      }
    }
    if (this.startPend && this.status === 'connecting' && this._warmOk(now)) { this.startPend = false; this._begin(now); }
    if (this.status === 'starting' && now >= this.t0) { this.status = 'playing'; this.started = true; this.back = false; this.lastRecv = now; }
    if (this.edges && this.edgesAt < 0) this.edgesAt = now;
    if (this.status === 'connecting' || this.status === 'starting' || (this.edges && now - this.edgesAt > C.EDGE_TTL)) this.edges = 0;
    if (!this.edges) this.edgesAt = -1;
    if ((this.status === 'playing' || this.status === 'waiting' || this.status === 'over') && now - this.pingAt > 1000) { this.pingAt = now; this._ctl({ k: 'ping', t: now, id: 1000 + (this.pingId++) }); }

    var playing = this.status === 'playing' || this.status === 'waiting' || this.status === 'over';
    if (playing && this.g) {
      var target = this._target(now), budget = this.maxCatch > 0 ? Math.min(this.maxCatch, 600) : C.MAXCATCH;
      this._tgt = target;
      while (this.T < target && budget-- > 0) this._tick(now, inp);
      if (target - this.T > 600) this.t0 = now - (this.T + 600) * STEP_MS;   // (red de seguridad: el tope de verdad va antes de _recv)
      // pendientes de confirmar: pa perdido con el rival vivo
      var paTo = Math.max(C.PA_TIMEOUT, 2 * this.rtt + 100);
      for (var pr in this.ptPend) if (now - this.ptPend[pr].at > paTo && now - this.lastRecv < paTo) { delete this.ptPend[pr]; this._release(+pr); }
      // final: los dos lados mandan fin; sin el del rival en 3 s, o distinto, o sin marcadores cotejados → no verificado. Con un sb
      // mandado y sin su sbok (anfitrión), se espera al sbok (el fin arreglado del invitado llega delante), como mucho FIN_TIMEOUT
      if (this.status === 'over' && !this.result && this.overAt >= 0) {
        var fi = this.finIn, g = this.g, sbWait = this.host && this.cmpBad >= 0 && this.sbAt >= 0 && now - this.sbAt < C.FIN_TIMEOUT;
        if ((fi && !sbWait) || now - this.overAt > C.FIN_TIMEOUT) {
          var agree = !!fi && JSON.stringify(fi.sets) === JSON.stringify(g.sets) && JSON.stringify(fi.setScores) === JSON.stringify(g.setScores) && fi.w === this.overTeam;
          this.result = { why: 'over', win: this.overTeam === this.slot };
          if (!agree || !this.cmpOk || this.cmpBad >= 0) { this.result.unverified = true; this._log('final sin cotejar o distinto: no válido'); }
        }
      }
      // partido acabado con el rival callado: el pa de mi último punto no va a llegar (y en 'over' no hay IA ni abandono). Sin esto el
      // gameOver confirmado y los eventos de ese rally no salían nunca (con la pestaña oculta, la pantalla no pasaba al final)
      if (this.status === 'over' && this.result) for (var pr2 in this.ptPend) if (now - this.ptPend[pr2].at > paTo) { delete this.ptPend[pr2]; this._release(+pr2); }
      this.flStats.hand = this.g.fl.hand; if (this.g.fl.late > this.flStats.late) this.flStats.late = this.g.fl.late;
      this._life(now);
      this._display(now, dtF);
      this._presentRemote();
    }
    out.status = this.status; out.tick = this.T; out.gcTick = this.T;
    out.ping = Math.round(this.rtt); out.waitMs = this.waitMs;
    out.unstable = (this.status === 'playing' || this.status === 'waiting') && !this.solo && now - this.lastRecv > C.UNSTABLE;
    out.canAI = this.status === 'waiting' && this.waitMs > C.WAIT_AI && !this.solo;
    out.goneIn = this.goneIn || 0;
    out.startIn = this.status === 'starting' ? Math.max(0, this.t0 - now) : 0;
    out.solo = this.solo; out.valid = this.valid; out.result = this.result; out.rivalSolo = this.rivalSolo; out.gone = this.goneFlag; out.rivalLeft = this.rivalLeft;
    void i;
    return out;
  };
  /** Esperando, IA, abandono por tiempo (spec §8). Mi lado nunca se congela. */
  SP._life = function (now) {
    if (this.status !== 'playing' && this.status !== 'waiting') { this.goneIn = 0; return; }
    var g = this.g, F = g.fl, quiet = now - this.lastRecv, Ls = this.snaps;
    // rival ausente (pestaña oculta: avanza a ráfagas de ~1 s): con su balón no se avisa a los 500 ms sino con el umbral general
    // (antes «Esperando…» parpadeaba cada segundo)
    var rAway = Ls.length && (Ls[Ls.length - 1].flags & F_AWAY), wOwn = rAway ? C.WAIT : C.WAIT_OWN;
    var starve = !this.solo && (quiet > C.WAIT || (F.own !== this.slot && !F.loc[F.own] && g.mode === 'rally' && quiet > wOwn));
    if (starve) { if (this.waitStart < 0) { this.waitStart = now; this.stats.waits++; } }
    else if (!this.solo) this.waitStart = -1;
    this.waitMs = this.waitStart >= 0 && !this.solo ? now - this.waitStart : 0;
    this.status = this.waitStart >= 0 && !this.solo ? 'waiting' : 'playing';
    var lostFor = this.solo ? (this.lostAt >= 0 ? now - this.lostAt : 0) : this.waitMs;
    if (lostFor > C.GONE && !this.goneFlag) this._gone();
    this.goneIn = lostFor > 0 && !this.goneFlag ? Math.max(0, C.GONE - lostFor) : 0;
  };
  SP._begin = function (now) {
    this.t0 = now + C.START_MS; this.status = 'starting';
    this._ctl({ k: 'start', t0: this.t0 }); this._log('empieza en ' + C.START_MS + ' ms');
  };
  SP._warmOk = function (now) {
    if (!this.warmFn) return true;
    if (this.warmSince < 0) this.warmSince = now;
    var ok = true; try { ok = !!this.warmFn(); } catch (e) { ok = true; }
    if (!ok && now - this.warmSince > C.WARM_CAP) { ok = true; this._log('sigo sin acabar de compilar en ' + C.WARM_CAP + ' ms: empiezo igual'); }
    if (ok) this.warmFn = null;
    return ok;
  };

  /* ---- partida de pintar (spec §5) ---- */
  SP._display = function (now, dtF) {
    var g = this.g, gd = this.gd, F = g.fl, me = this.slot, rm = 1 - me, i;
    this._ov.r = false; this._ov.b = false; this._shown = true; this._gdOk = false;
    var tf = Math.min((now - this.t0) / STEP_MS, this.T + 1);
    var dTick = this.lastTf >= 0 ? Math.max(0, tf - this.lastTf) : 0; this.lastTf = tf; this.tf = tf;
    // colchón del rival: retraso medio de sus fotos + D. D = lo que llegan tarde las peores (percentil 95 de las 64 últimas, sobre
    // la media) + el intervalo entre fotos + 1 tic, entre 6 y 18 tics; Dp cambia como mucho 1 tic por segundo (sin tirones)
    var lateT = this.lateE >= 0 ? this.lateE : this.rtt / 2 / STEP_MS;
    // (con pérdida, una foto perdida deja 8 tics sin datos: un intervalo más de colchón)
    var Dt = clampN(Math.max(0.7 * (this.lateP - lateT), 2 * this.jitE) + C.SNAP_RALLY * (1 + clampN(this.lossE * 25, 0, 1)) + 1, C.D_MIN, C.D_MAX), tgt = Math.max(0, lateT) + Dt, mx = (dtF || 0) / 1000;
    if (this.Dp < 0 || this.lateL.length < 32) this.Dp = tgt;   // (al principio, directo: aún no hay medida buena)
    else if (this.Dp - tgt > C.D_MAX) this.Dp = tgt;   // (muy por encima, p. ej. tras un parón: a 1 tic/s tardaba minutos)
    else this.Dp += clampN(tgt - this.Dp, -mx, 4 * mx);   // (sube más deprisa que baja: quedarse sin fotos se ve peor)
    this.Dc = Dt;
    var both = F.loc[0] && F.loc[1];
    this.Tr = tf - this.Dp;
    this.flStats.interpMs = Math.round(this.Dp * STEP_MS);
    if (!both) this._dispRivals(gd, rm, dtF);
    this._dispBall(gd, tf, dTick, dtF, both);
  };
  SP._dispRivals = function (gd, rm, dtF) {
    var L = this.snaps, Tr = this.Tr, T = this.g.teams[rm], G = (VB.C && VB.C.G) || 9, i, s0 = null, s1 = null, k, ov = this._ov;
    if (!L.length) return;
    if (!this._rivFresh()) {   // saque sin su foto de saque aún: la pose de la sim (la formación de mi setupServe), sin mezcla
      for (i = 0; i < NPL && i < T.length; i++) {
        var sh0 = this.pShown[i] || (this.pShown[i] = {}); sh0.x = T[i].x; sh0.y = T[i].y; sh0.z = T[i].z;
        this.pExt[i] = false; this.pOff[i].x = this.pOff[i].y = this.pOff[i].z = 0;
      }
      return;
    }
    for (k = L.length - 1; k >= 0; k--) if (L[k].T <= Tr) { s0 = L[k]; s1 = L[k + 1] || null; break; }
    if (!s0) { s1 = L[0]; }
    var decay = Math.pow(0.5, (dtF || 0) / C.BLEND_P), ext = !!s0 && !s1, live = this.g.mode === 'serve' || this.g.mode === 'rally';
    if (live) { this.flStats.dispFrames++; if (ext) this.flStats.extrapTicks++; }
    for (i = 0; i < NPL && i < T.length; i++) {
      var p = ov.p[i], o = this._dp || (this._dp = {}), q0, q1;
      if (s0 && s1) {
        q0 = s0.pl[i]; q1 = s1.pl[i];
        var hT = (s1.T - s0.T) * STEP, u = (Tr - s0.T) / (s1.T - s0.T), u2 = u * u, u3 = u2 * u;
        var h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        o.x = h00 * q0.x + h10 * hT * q0.vx + h01 * q1.x + h11 * hT * q1.vx;
        o.y = h00 * q0.y + h10 * hT * q0.vy + h01 * q1.y + h11 * hT * q1.vy;
        o.z = q0.z + (q1.z - q0.z) * u;
        if (q0.z > 0 && q1.z > 0) o.z += 0.5 * G * hT * hT * u * (1 - u);
        o.vx = q0.vx + (q1.vx - q0.vx) * u; o.vy = q0.vy + (q1.vy - q0.vy) * u; o.vz = q0.vz + (q1.vz - q0.vz) * u;
        this._discrete(o, q0, s0.T, (Tr - s0.T) * STEP, false);
      } else if (s0) {
        q0 = s0.pl[i];
        var e = clampN(Tr - s0.T, 0, C.EXTRAP_MAX) * STEP;
        o.x = q0.x + q0.vx * e; o.y = q0.y + q0.vy * e;
        o.z = q0.z > 0 ? Math.max(0, q0.z + q0.vz * e - 0.5 * G * e * e) : 0;
        o.vx = q0.vx; o.vy = q0.vy; o.vz = q0.vz;
        this._discrete(o, q0, s0.T, e, false);
      } else {
        q0 = s1.pl[i];
        o.x = q0.x; o.y = q0.y; o.z = q0.z; o.vx = q0.vx; o.vy = q0.vy; o.vz = q0.vz;
        this._discrete(o, q0, s1.T, 0, false);
      }
      // error al volver de extrapolar: se deshace con semivida de 60 ms; un salto de más de 1,2 m (o el saque) va sin mezcla
      var off = this.pOff[i], sh = this.pShown[i];
      if (sh && this.pExt[i] && !ext) {
        var ex = sh.x - o.x, ey = sh.y - o.y, ez = sh.z - o.z;
        if (ex * ex + ey * ey + ez * ez < 1.44 && !((s0 && (s0.flags & F_TELE)))) { off.x = ex; off.y = ey; off.z = ez; }
        else { off.x = off.y = off.z = 0; }
      }
      off.x *= decay; off.y *= decay; off.z *= decay;
      this.pExt[i] = ext;
      p.x = o.x + off.x; p.y = o.y + off.y; p.z = Math.max(0, o.z + off.z); p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
      p.lastAction = o.lastAction; p.shot = o.shot; p.grade = o.grade;   // (undefined: se deja el de la partida, _ovApply)
      p.anim = o.anim; p.actionT = o.actionT; p.onGround = o.onGround; p.down = o.down;
      if (!sh) sh = this.pShown[i] = {};
      sh.x = p.x; sh.y = p.y; sh.z = p.z;
    }
    ov.r = true; ov.rm = rm; ov.n = Math.min(NPL, T.length);
  };
  /** Pose pintada (rivales y balón de _display) sobre la partida G. save: guarda lo que había para _ovRestore. */
  var OVP = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'anim', 'actionT', 'onGround', 'down'], OVO = ['lastAction', 'shot', 'grade'];
  var hasOwn = Object.prototype.hasOwnProperty;
  SP._ovApply = function (G, save) {
    var ov = this._ov, sv = this._sv, i, k, q, w, s, key;
    if (ov.r) {
      var Tm = G.teams[ov.rm];
      for (i = 0; i < ov.n && i < Tm.length; i++) {
        q = Tm[i]; w = ov.p[i];
        if (save) {
          s = sv.p[i];
          for (k = 0; k < OVP.length; k++) s[OVP[k]] = q[OVP[k]];
          for (k = 0; k < OVO.length; k++) { key = OVO[k]; s['h' + k] = hasOwn.call(q, key); s[key] = q[key]; }
        }
        for (k = 0; k < OVP.length; k++) q[OVP[k]] = w[OVP[k]];
        for (k = 0; k < OVO.length; k++) if (w[OVO[k]] !== undefined) q[OVO[k]] = w[OVO[k]];
      }
    }
    if (ov.b) {
      var b = G.ball;
      if (save) { s = sv.b; s[0] = b.x; s[1] = b.y; s[2] = b.z; s[3] = b.vx; s[4] = b.vy; s[5] = b.vz; }
      b.x = ov.bx; b.y = ov.by; b.z = ov.bz;
      if (ov.bv) { b.vx = ov.bvx; b.vy = ov.bvy; b.vz = ov.bvz; }
    }
  };
  SP._ovRestore = function (G) {
    var ov = this._ov, sv = this._sv, i, k, q, s, key;
    if (ov.r) {
      var Tm = G.teams[ov.rm];
      for (i = 0; i < ov.n && i < Tm.length; i++) {
        q = Tm[i]; s = sv.p[i];
        for (k = 0; k < OVP.length; k++) q[OVP[k]] = s[OVP[k]];
        for (k = 0; k < OVO.length; k++) { key = OVO[k]; if (s['h' + k]) q[key] = s[key]; else if (hasOwn.call(q, key)) delete q[key]; }
      }
    }
    if (ov.b) { var b = G.ball; s = sv.b; b.x = s[0]; b.y = s[1]; b.z = s[2]; b.vx = s[3]; b.vy = s[4]; b.vz = s[5]; }
  };
  /** fn(a, partida, b) con la partida local mostrando la pose pintada; después todo vuelve a como estaba (main.js:
   *  withDisplay(NetView.mirror, vista, hueco)). Igual que fn(a, gd, b) con gd = copia + pose pintada, sin la copia entera. */
  SP.withDisplay = function (fn, a, b) {
    var g = this.g;
    if (!g || !this._shown) return fn(a, this.gd, b);
    this._ovApply(g, true);
    try { return fn(a, g, b); } finally { this._ovRestore(g); }
  };
  /** out.g: la partida de pintar como antes (copia de la local + pose pintada), solo si se lee; una vez por frame. */
  SP._gdGet = function () {
    if (!this.g || !this._shown) return this.gd;
    if (!this._gdOk) { Sim().copyGame(this.gd, this.g); this._ovApply(this.gd, false); this._gdOk = true; }
    return this.gd;
  };
  /** Posición del balón en el tic (fraccionario) tau según la cadena de contactos del rally: null si no la cubre. */
  var _fb = {}, _fb2 = {};
  // cursor del vuelo (_ballAt): el último estado volado por entrada de la cadena. Pedir la misma entrada más tarde sigue desde ahí
  // (age += dt paso a paso, como en un solo flFly: mismo resultado bit a bit) en vez de volar otra vez desde el contacto cada frame
  function _ballCopy(a, o) {
    o.x = a.x; o.y = a.y; o.z = a.z; o.vx = a.vx; o.vy = a.vy; o.vz = a.vz; o.spin = a.spin; o.speed = a.speed; o.dip = a.dip;
    o.wobA = a.wobA; o.wobF = a.wobF; o.wobP = a.wobP; o.age = a.age;
    return o;
  }
  SP._ballAt = function (tau, Ch) {
    Ch = Ch || this.chain;
    var J = Math.floor(2 * tau) + 1, k, c = null;
    for (k = Ch.length - 1; k >= 0; k--) if (Ch[k].hc <= J) { c = Ch[k]; break; }
    if (!c) return null;
    var S = Sim(), n = J - c.hc, dh = STEP / 2, K = this._bk || (this._bk = { c: null, full: false, p: 0, o: {} });
    // pasos hechos: el saque (full) vuela su primer paso entero (= 2 medios) y luego medios pasos; con n < 2, medios pasos desde el
    // principio (otro camino: sin cursor). Tope de 1920 medios pasos como antes
    var full = !!c.full && n >= 2, pt = full ? 2 + Math.min(n - 2, 1920) : Math.min(n, 1920);
    if (C.BACHECK) var ref = this._ballAt0(c, n);
    if (K.c === c && K.full === full && K.p <= pt && (full || !c.full)) {
      if (pt > K.p) S.flFly(K.o, K.o.age, pt - K.p, dh, K.o);
    } else {
      var B = c.b, o = _fb2;
      o.x = B[0]; o.y = B[1]; o.z = B[2]; o.vx = B[3]; o.vy = B[4]; o.vz = B[5]; o.spin = B[6]; o.speed = B[7]; o.dip = B[8]; o.wobA = B[9]; o.wobF = B[10]; o.wobP = B[11];
      if (full) { S.flFly(o, c.bAge, 1, STEP, K.o); S.flFly(K.o, K.o.age, pt - 2, dh, K.o); }
      else S.flFly(o, c.bAge, pt, dh, K.o);
      K.c = c; K.full = full;
    }
    K.p = pt;
    var r = _ballCopy(K.o, _fb);
    if (ref) { for (var q in ref) if (!Object.is(ref[q], r[q])) { this.flStats.baBad = (this.flStats.baBad || 0) + 1; break; } this.flStats.baN = (this.flStats.baN || 0) + 1; }
    return r;
  };
  /** _ballAt de antes (sin cursor): solo para la comprobación C.BACHECK de las pruebas. */
  SP._ballAt0 = function (c, n) {
    var S = Sim(), B = c.b, dh = STEP / 2, o = {}, out = {};
    o.x = B[0]; o.y = B[1]; o.z = B[2]; o.vx = B[3]; o.vy = B[4]; o.vz = B[5]; o.spin = B[6]; o.speed = B[7]; o.dip = B[8]; o.wobA = B[9]; o.wobF = B[10]; o.wobP = B[11];
    if (c.full && n >= 2) { S.flFly(o, c.bAge, 1, STEP, out); return _ballCopy(S.flFly(out, out.age, Math.min(n - 2, 1920), dh, out), {}); }
    return _ballCopy(S.flFly(o, c.bAge, Math.min(n, 1920), dh, out), {});
  };
  /** Balón de las fotos del rival en tau (solo las del rally r si se da), o null. */
  SP._snapBall = function (tau, r) {
    var L = this.snaps, s0 = null, s1 = null, k, rr = typeof r === 'number' ? r & 65535 : -1;
    for (k = L.length - 1; k >= 0; k--) if (L[k].ball && L[k].T <= tau && (rr < 0 || L[k].r === rr)) { s0 = L[k]; break; }
    if (!s0) return null;
    for (k = L.indexOf(s0) + 1; k < L.length; k++) if (L[k].ball && (rr < 0 || L[k].r === rr)) { s1 = L[k]; break; }
    var a = s0.ball, o = _fb;
    if (!s1) { o.x = a.x; o.y = a.y; o.z = a.z; return o; }
    var u = clampN((tau - s0.T) / (s1.T - s0.T), 0, 1), b = s1.ball;
    o.x = a.x + (b.x - a.x) * u; o.y = a.y + (b.y - a.y) * u; o.z = a.z + (b.z - a.z) * u;
    return o;
  };
  SP._dispBall = function (gd, tf, dTick, dtF, both) {
    var g = this.g, F = g.fl, me = this.slot, live = g.mode === 'rally' || g.mode === 'serve';
    // reloj del balón: plan (aceleración o frenada) o deriva hacia su objetivo
    if (both) { this.lag = 0; this.lagPlan = null; }
    else if (!live) {
      // tras el punto (o el final) el balón pintado iba aún Dp por detrás, en el aire: termina su vuelo (cadena del rally que acaba)
      // y alcanza el presente a velocidad doble, en vez de saltar al balón ya caído de la sim
      this.lagPlan = null; if (this.lag > 0) this.lag = Math.max(0, this.lag - dTick * (C.WARP_MAX - 1));
    } else if (this.lagPlan) {
      var P = this.lagPlan, u = P.t1 > P.t0 ? clampN((tf - P.t0) / (P.t1 - P.t0), 0, 1) : 1;
      this.lag = P.l0 + (P.l1 - P.l0) * (P.ease ? u * u * (3 - 2 * u) : u);
      if (u >= 1) this.lagPlan = P.next || null;
    } else {
      var tg = F.own === me ? 0 : this.Dp;
      if (this.lag < tg) this.lag = Math.min(tg, this.lag + dTick * C.LAG_UP);
      else this.lag = Math.max(tg, this.lag - dTick);
    }
    var tau = tf - this.lag; this.tauB = tau;
    var raw = null, src = 'sim', Ch = live ? this.chain : this.chainPrev;
    if (!both && this.lag > 0.01) {
      raw = this._ballAt(tau, Ch); src = 'chain';
      // antes del primer contacto del rally (el tc del saque rival llega con tau aún antes del golpe): las fotos del rival, no el
      // balón presente de la sim (iba lat tics por delante y luego volvía a la mano del sacador)
      if (!raw && live) { raw = this._snapBall(tau, F.r); src = 'snap'; }
      if (!raw) src = 'sim';
    }
    var b = g.ball, x, y, z, vx, vy, vz;
    if (raw) { x = raw.x; y = raw.y; z = raw.z; vx = raw.vx; vy = raw.vy; vz = raw.vz; } else { x = b.x; y = b.y; z = b.z; vx = b.vx; vy = b.vy; vz = b.vz; }
    var pr = this.bRaw, dS = (dtF || 0) / 1000;
    if (src === 'snap' || typeof vx !== 'number') {   // (las fotos no traen velocidad: diferencia con el frame anterior)
      if (pr && pr.src === src && dS > 0) { vx = (x - pr.x) / dS; vy = (y - pr.y) / dS; vz = (z - pr.z) / dS; } else { vx = vy = vz = 0; }
    }
    // salto de fuente o corrección: la diferencia EN ESTE INSTANTE entre donde pintaría la fuente de antes y la nueva pasa al
    // desplazamiento, que decae (100 ms; 60 cerca de los míos); más de 3 m, sin mezcla. (Antes se tomaba la posición pintada del
    // frame anterior: el error llevaba el avance de un frame y el balón se paraba un frame en cada traspaso.)
    var off = this.bOff, sh = this.bShown;
    if (sh && (src !== this.bSrc || this.bJump)) {
      var o = null, ox, oy, oz;
      if (!this.bJump) {
        if (this.bSrc === 'sim') o = b;
        else if (this.bSrc === 'chain') o = this._ballAt(tau, this.bCh || Ch);
        else if (this.bSrc === 'snap') o = this._snapBall(tau, F.r);
      }
      if (o) { ox = o.x; oy = o.y; oz = o.z; }
      else if (pr) { ox = pr.x + pr.vx * dS; oy = pr.y + pr.vy * dS; oz = pr.z + pr.vz * dS; }
      else { ox = sh.x - off.x; oy = sh.y - off.y; oz = sh.z - off.z; }
      var ex = ox + off.x - x, ey = oy + off.y - y, ez = oz + off.z - z;
      var e2 = ex * ex + ey * ey + ez * ez;
      if (e2 < 9) { off.x = ex; off.y = ey; off.z = ez; }
      else if (g.mode === 'rally' && e2 < 100) {
        // en pleno peloteo (un contacto rival que llega tarde, un salto de lo que no cabe en WARP_MAX): salta solo lo que pasa de 3 m
        // y el resto se mezcla como un salto (40 ms cerca de los míos, 90 lejos). Antes, más de 3 m: teletransporte de golpe (spec
        // §5.3), 9-20 por partido con RTT 250. Fuera del peloteo (el saque, tras el punto) sigue de golpe: ahí no hay vuelo que mezclar
        var kq = 3 / Math.sqrt(e2); off.x = ex * kq; off.y = ey * kq; off.z = ez * kq; this.bSnap = true;
        this.flStats.bTeleR = (this.flStats.bTeleR || 0) + 1;
      } else { off.x = off.y = off.z = 0; this.flStats.bTele = (this.flStats.bTele || 0) + 1; }
    }
    this.bJump = false; this.bSrc = src; this.bCh = src === 'chain' ? Ch : null;
    if (!pr) pr = this.bRaw = {};
    pr.x = x; pr.y = y; pr.z = z; pr.vx = vx || 0; pr.vy = vy || 0; pr.vz = vz || 0; pr.src = src;
    var near = false, M = g.teams[me];
    for (var i = 0; i < M.length; i++) if (Math.abs(M[i].x - x) + Math.abs(M[i].y - y) < 3) near = true;
    var tau0 = this.bSnap ? (near ? C.BLEND_B : C.BLEND_B_FAR) : near ? C.BALL_TAU_NEAR : C.BALL_TAU, dec = Math.exp(-(dtF || 0) / tau0);
    if (Math.abs(off.x) + Math.abs(off.y) + Math.abs(off.z) < 1e-4) this.bSnap = false;
    off.x *= dec; off.y *= dec; off.z *= dec;
    var gb = this._ov;
    gb.b = true; gb.bx = x + off.x; gb.by = y + off.y; gb.bz = z + off.z;
    gb.bv = !!(raw && src === 'chain'); if (gb.bv) { gb.bvx = vx; gb.bvy = vy; gb.bvz = vz; }
    if (!sh) sh = this.bShown = {};
    sh.x = gb.bx; sh.y = gb.by; sh.z = gb.bz;
  };
  /** Eventos remotos que ya tocan: los del contacto cuando el balón pintado llega a él; los del rival cuando su pose pintada. */
  SP._presentRemote = function () {
    var Q = this.remPres, keep = [], i;
    for (i = 0; i < Q.length; i++) {
      var q = Q[i], at = q.k === 'b' ? this.tauB : this.Tr;
      if (q.e._tick <= at || this.solo || this.status === 'over') this._pres.push(q.e); else keep.push(q);
    }
    this.remPres = keep;
  };

  VB.NetFluid = {
    Session: Session, PROTO: PROTO, C: C,
    codec: { encS: encS, decS: decS, encT: encT, ACTS: ACTS, SHOTS: SHOTS, GRADES: GRADES },
    sameRoomF: sameRoomF, encEv: encEv, decEv: decEv, evType: evType
  };
})();
