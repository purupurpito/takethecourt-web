/* =====================================================================
 * MAKE THE CUT — js/sim.js   (owner: sim)
 * Simulación pura del partido: física del balón, reglas, flujo del rally,
 * calidad de golpeo por tiempo (timing), saques, bloqueos, defensas en
 * plancha y marcador. SIN DOM, SIN THREE, SIN window (solo el objeto VB).
 * Se puede cargar en node (tools/simtest.js) con vm.
 *
 * COORDENADAS DE LA SIMULACIÓN (metros):
 *   x = largo de la pista. Red en x = 0. Equipo 0 (humano, rojo) en x > 0,
 *       equipo 1 (CPU, azul) en x < 0. Líneas de fondo en x = ±9.
 *   y = ancho de la pista. Líneas laterales en y = ±4.5.
 *   z = altura (arriba). Suelo z = 0. Borde superior de la red z = 2.43.
 * Three.js es Y-up: usar SIEMPRE VB.toThree(x, y, z, out) para convertir.
 *   three.x = sim.x ; three.y = sim.z ; three.z = -sim.y
 *
 * MODELO DE GOLPEO (humano):
 *   Pulsar GOLPEAR abre un "gesto" de g.tm.swing s (VB.TIMING según el nivel). El contacto ocurre cuando el
 *   balón está al alcance; si el momento ideal (balón a la altura de contacto
 *   de ese toque) llega en menos de g.tm.assist s, el gesto lo espera. La calidad
 *   sale del desfase con el momento ideal: |te| <= W_PERFECT -> 'perfect',
 *   <= W_GOOD -> 'good', si no 'poor'. La IA usa la MISMA función con un
 *   desfase aleatorio que depende de la dificultad.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  // ---------- Constantes ----------
  var C = VB.C = {
    G: 9,            // gravedad "de juego" (m/s²), algo menor que la real para dar tiempo
    NET_H: 2.43,     // altura de red masculina
    NET_LOW: 1.43,   // borde inferior de la malla (red de 1 m)
    ANT_TOP: 3.23,   // punta de las antenas (80 cm sobre la red)
    HL: 9,           // media longitud de pista
    HW: 4.5,         // media anchura
    // pista de VÓLEY PLAYA (createGame({venue:'beach'}) en 2v2 → g.beach): 16 × 8 m, misma red de 2,43. La pista de cada
    // partida está en g.HL / g.HW (y g.cs = escala respecto a 18 × 9: 8/9 en la playa, 1 en el pabellón). VB.Sim.court(g)
    BEACH: { HL: 8, HW: 4 },
    ATTACK: 3,       // línea de ataque (3 m)
    BR: 0.21,        // radio del balón (exagerado para legibilidad)
    SPEED: 5.6,      // velocidad de carrera
    JUMP_V: 4.4,     // velocidad inicial de salto
    REACH: 1.35,     // alcance horizontal para tocar
    DIVE: 0.8,       // alcance extra lanzándose en plancha (17-nov-2026, Ferran: «la plancha está muy OP»; antes 1,05)
    SIM_HZ: 120,     // paso fijo recomendado (main.js)
    // --- timing ---
    IN_TOL: 0.21,    // "dentro" (regla FIVB 8.3: el balón toca el suelo con CUALQUIER parte de él, líneas incluidas): el centro del
                     // balón cae como mucho un radio de balón (C.BR, el MISMO que se dibuja) fuera del borde exterior de la línea.
                     // 1 px de la huella sobre la línea = dentro. Antes 0,03 (huella del balón real): la huella dibujada en la
                     // revisión pisaba la línea y salía «OUT» (Ferran, 12-nov-2026). Es = C.BR (simtest lo comprueba)
    SWING: 0.30,     // duración del gesto de golpeo (ventana de contacto tras pulsar)
    WINDUP: 0.07,    // armado del brazo: lo ideal es PULSAR esto antes del contacto ideal (te = pulsación + WINDUP - ideal)
    ASSIST: 0.16,    // el gesto espera al momento ideal si llega antes de esto (el contacto se ve en su sitio)
    W_PERFECT: 0.035,// |desfase| máximo para 'perfect' (s)
    W_GOOD: 0.10,    // |desfase| máximo para 'good' (s)
    SWING_LOCK: 0.12,// bloqueo tras un gesto fallido (evita aporrear el botón)
    NET_TOUCH: 0.30, // un jugador en el aire a menos de esto de la red la toca
    SERVE_CLOCK: 8,  // regla de los 8 segundos para sacar (pabellón)
    SERVE_CLOCK_BEACH: 5, // vóley playa: 5 segundos para sacar (g.serveClockMax)
    // altura ideal de contacto sobre los pies del jugador, por tipo de toque
    ZC: { pass: 0.85, set: 2.2, free: 1.5, spike: 2.45, fserve: 2.55, jserve: 2.45 },
    // balón en la mano del sacador antes del lanzamiento: a la altura del pecho, delante del cuerpo
    // (hacia la red) y desplazado hacia la mano que NO golpea (izquierda; el golpeo es con la derecha)
    HOLD_Z: 1.28, HOLD_FWD: 0.35, HOLD_SIDE: 0.16
  };

  /* Perfiles de dificultad. Se aplican por equipo (g.prof[team]).
   *  react: retardo de reacción tras cada toque (s)      speed: fracción de la velocidad de carrera
   *  timing: desviación típica del desfase al golpear (s) err: multiplicador de dispersión
   *  block: prob. de cerrar el bloqueo                     dig: prob. base de defender un remate
   *  recv: prob. base de recibir un saque potente          spike: velocidad de remate (m/s)
   *  jserve: velocidad del saque en salto (m/s)            jumpServe: prob. de sacar en salto
   *  tip: prob. de dejada ante bloqueo                      aimNoise: ruido al elegir zona (m)
   *  netErr: prob. de no corregir la deriva hacia la red   blockReact: retardo del salto al bloqueo
 *  atkErr: prob. de error no forzado en ataque (fuera/red) srvErr: prob. de error de saque */
  /* Escalera de 4 niveles (revisión 2): el salto Fácil -> Normal era demasiado grande para un jugador real en
   * tercera persona. 'normal' es ahora un nivel intermedio; el Normal anterior pasa a 'hard' (Difícil) y el
   * Difícil anterior a 'expert' (Experto). */
  var DIFF = VB.DIFF = {
    easy:   { name: 'Fácil',   react: 0.30, speed: 0.82, timing: 0.11,  err: 1.35, block: 0.12, dig: 0.27, recv: 0.72, spike: 13.5, jserve: 12.0, jumpServe: 0.00, tip: 0.04, aimNoise: 4.0, netErr: 0.06,  blockReact: 0.18, atkErr: 0.11, srvErr: 0.12, seam: 0.00, srvNoise: 1.6, float: 0.75, jsetAI: 0.04 },
    normal: { name: 'Normal',  react: 0.18, speed: 0.90, timing: 0.07, err: 1.1,  block: 0.30, dig: 0.42, recv: 0.83, spike: 15.4, jserve: 14.0, jumpServe: 0.08, tip: 0.08, aimNoise: 1.9, netErr: 0.03, blockReact: 0.10, atkErr: 0.105, srvErr: 0.12, seam: 0.08, srvNoise: 1.4, float: 0.76, jsetAI: 0.12 },
    hard:   { name: 'Difícil', react: 0.13, speed: 0.94, timing: 0.05,  err: 0.9,  block: 0.40, dig: 0.48, recv: 0.89, spike: 16.2, jserve: 15.6, jumpServe: 0.18, tip: 0.12, aimNoise: 1.1, netErr: 0.018, blockReact: 0.065, atkErr: 0.09, srvErr: 0.10, seam: 0.18, srvNoise: 1.2, float: 0.8, jsetAI: 0.18 },
    expert: { name: 'Experto', react: 0.06, speed: 1.00, timing: 0.028, err: 0.55, block: 0.55, dig: 0.61, recv: 0.95, spike: 19.0, jserve: 18.0, jumpServe: 0.70, tip: 0.15, aimNoise: 0.4, netErr: 0.005, blockReact: 0.04, atkErr: 0.05, srvErr: 0.07, seam: 0.75, srvNoise: 0.6, float: 1.0, jsetAI: 0.25 },
    // demo del menú (CPU vs CPU), perfil propio (R6). Antes era el Difícil de la revisión 2 congelado (dig 0,51,
    // block 0,42, tip 0,12, atkErr 0,08, spike 16,6), valores afinados con el modelo de defensa de la revisión 1. La
    // revisión 2 (bloqueo geométrico con 'touch'/'soft' jugables, contacto con el cuerpo) alarga la defensa CPU vs CPU:
    // con esos valores la demo bajó de 48 % a 43 % de remates punto y quedó en el filo entre peloteos de 1 y 2 ataques
    // (mediana 5 u 8 s según la semilla). Solo la demo: defensa base 0,37, remate 17,4 m/s, más bloqueo directo (0,58),
    // más error de ataque (0,15) y pocas dejadas (0,04; se defienden siempre). Medido (105 semillas × 20 min):
    // mediana 5,0 s, 52 % de remates punto, 5,7 puntos/min. Ver notes/sim.md §R6.
    demo:   { name: 'Demo',    react: 0.12, speed: 0.95, timing: 0.045, err: 0.85, block: 0.58, dig: 0.37, recv: 0.90, spike: 17.4, jserve: 16.0, jumpServe: 0.20, tip: 0.04, aimNoise: 1.0, netErr: 0.015, blockReact: 0.06, atkErr: 0.15, srvErr: 0.10, seam: 0.2, srvNoise: 1.2, float: 0.8, jsetAI: 0.15 },
    // compañero IA del humano (y equipo 0 en autopilot): nivel fijo, el peso del partido lo lleva el humano
    mate:   { name: 'Compañero', react: 0.16, speed: 0.92, timing: 0.065, err: 1.0, block: 0.30, dig: 0.56, recv: 0.85, spike: 16.0, jserve: 14.5, jumpServe: 0.35, tip: 0.10, aimNoise: 1.6, netErr: 0.02, blockReact: 0.09, atkErr: 0.05, srvErr: 0.08, seam: 0.4, srvNoise: 1.0, float: 1.0, jsetAI: 0.15 }
  };
  /* E1 (sprint 5, «maestría»): campos de lectura y de jugada de la IA que solo se usan con g.mastery (partido humano 2v2; ver
   * VB.MASTERY). Sin mastery ninguno se lee, así que no cambian la huella. feintRead: s de más que tarda la CPU en leer una finta del
   * humano; tipRead: s de menos ante la dejada a la vista; roll: prob. de golpe colocado de la IA con el bloqueo arriba (tras el dado de
   * la dejada); zoneSet: prob. de que el colocador CPU coloque a un lado, lejos del bloqueador humano; feintBeat: prob. de que la defensa
   * CPU quede engañada por una finta hecha con su bloqueador en el aire (la reacción sola no bastaba: la dejada tarda ~1,2 s y llegaban). */
  var E1DIFF = { //        feintRead tipRead roll  zoneSet feintBeat
    easy:   [0.16, 0,    0.02, 0,    0.32],
    normal: [0.12, 0,    0.06, 0.15, 0.25],
    hard:   [0.08, 0.05, 0.10, 0.30, 0.25], // (feintBeat 0,17 → 0,20 el 18-nov-2026: sin el dado previo, la finta que no engaña ya no daba ningún punto; 0,20 → 0,25 en el afinado de EFFORT, 2ª ronda: con la lectura variable la finta que no engaña da aún menos, simtest E1 b2 quedaba en +9,5)
    expert: [0.05, 0.08, 0.14, 0.45, 0.11],
    demo:   [0,    0,    0,    0,    0],
    mate:   [0,    0,    0.08, 0,    0]
  };
  for (var e1k in E1DIFF) { var e1v = E1DIFF[e1k]; DIFF[e1k].feintRead = e1v[0]; DIFF[e1k].tipRead = e1v[1]; DIFF[e1k].roll = e1v[2]; DIFF[e1k].zoneSet = e1v[3]; DIFF[e1k].feintBeat = e1v[4]; }
  /** E1: constantes de la maestría (finta, golpe colocado, al filo / manos fuera, colocación dirigida). Ver notes/sim.md «E1 (sprint 5)». */
  var MASTERY = VB.MASTERY = {
    feint: { minT: 0.03, q: 0.92 }, // minT: s mínimos entre pulsar GOLPEAR y el cambio (con pulsación perfecta, ventana de 0,03 a 0,07 s)
    roll:  { spread: 0.6, clear: 1.85, digK: 0.95 }, // (digK 1 → 1,3 el 18-nov-2026, calibración de EFFORT: el colocado es blando y con el contacto lineal rendía 1,1-1,35× el remate perfecto; simtest E1 (c) pide 0,6-0,9×. 1,3 → 1,55 en la revisión: con el contacto más empinado, fC 1,4, rendía 0,95×. 1,55 → 1 en el afinado (2ª ronda): con fC 2,4 el colocado asequible casi nunca fallaba, 0,17×; con 0,95, ~0,7-0,8× (con 0,9 rozaba el 0,9×; con 1, el 0,6×))
    edge:  { d: 0.9, lim: 0.05, spr: 0.35, spd: 0.8, dig: 0.2, tool: 0.2, tag: 0.5 },
    // colocación por destino (C2, 15-nov-2026; notes/sim.md «Colocar por destino»): dirs = destino [D, L] de cada sector (0 ↑ … 7 ↖;
    // D = distancia a la red, L = lateral, + a la derecha del colocador; 's' = el lateral del colocador, 's±' = corta: ±corta m de él sin
    // pasar del destino de ←/→; 'lane' = tempo mínimo: tensa, cima >= laneMin, aunque el colocador esté cerca), en metros de pabellón (×g.cs);
    // neutral = sin dirección (alta a la 4). Cima = clamp(a0 + aS·s + aD·max(0, D − dD0), apexMin, apexMax) con s = distancia del toque
    // al destino; tempo 'quick' si s <= quickS y D <= quickD, 'high' con cima >= highApex, si no 'lane'. Error: σ ×(sprS0 + sprS·s) y
    // cima ±apErr·(1 − q)·ek (hash 0xE18). rho: lo que el tempo resta a la calidad que se arrastra al remate. zoneY: lado de la CPU (E1 e2)
    set:   { dead: 0.6, snap: 10, plantT: 0.6, posD: 0.6, towD: 0.08, towCos: 0.7, hw4: 1.75, hwT: 1.0,
             dirs: [[0.8, 's'], [0.9, 's+'], [1.0, 3.5, 'lane'], [2.6, 2.8], [3.0, 0], [2.6, -2.8], [1.0, -3.5, 'lane'], [0.9, 's-']],
             corta: 1.5, laneMin: 4.4,
             neutral: [1.0, -2.75], neutralApex: 5.8, a0: 3.3, aS: 0.45, aD: 1.2, dD0: 1.3, apexMin: 3.9, apexMax: 6.0,
             quickS: 1.6, quickD: 1.2, highApex: 5.1, quickBlk: 0.6, laneBlk: 0.25, laneBlkD: 1.2, rho: { quick: 1.3, lane: 1.1, high: 0.9 },
             qPow: 4, sprQ: 1.0, backD: 2.2, backBlk: 1.2,
             sprS0: 0.75, sprS: 0.1, apErr: 0.7, apFloor: 3.6, Dmin: 0.6, Dmax: 3.2, Lpad: 0.6, sClamp: 1.2, zoneY: 2.6,
             atkAp: { quick: 1.2, lane: 2.2, high: 2.8 }, atkMaxX: 6.5, atkSep: 1.6 },
    // tramo 2: jugada perfecta (recepción, colocación y remate perfectos seguidos, 2 o más del humano): defensa ×dig (con suelo minTight) y +spd m/s
    chain: { dig: 0.85, spd: 0.6, minTight: 0.6 }
  };
  /*  seam: prob. de sacar a la zona libre (entre receptores)   srvNoise: ruido del destino del saque (m)
   *  float: multiplicador del baile del saque flotante
 *  jsetAI: prob. de colocar en salto cuando se puede (2v2: pase bueno y cerca de la red, ver SETQ y ai.js) */

  var DIFF_ALIAS = { facil: 'easy', 'fácil': 'easy', easy: 'easy', normal: 'normal', medio: 'normal', dificil: 'hard', 'difícil': 'hard', hard: 'hard',
    experto: 'expert', expert: 'expert' };
  function normDiff(d) { return DIFF_ALIAS[String(d || 'normal').toLowerCase()] || 'normal'; }
  /** Orden de los niveles (para menús: VB.DIFF_ORDER.map(k => VB.DIFF[k].name)). */
  VB.DIFF_ORDER = ['easy', 'normal', 'hard', 'expert'];

  /* Ayuda de timing del humano según el nivel (revisión 2): en Fácil (y en el primer partido) una pulsación
   * algo pronta sigue haciendo contacto. La NOTA del toque es honesta en todos los niveles (sale del desfase
   * real con el momento ideal: perfect/good/poor); lo que cambia es cuánto espera el gesto y cuánto dura.
   *   assist: el gesto espera al momento ideal si llega antes de esto (s)
   *   swing:  duración del gesto (ventana de contacto tras pulsar)      lock: bloqueo tras un gesto fallido */
  var TIMING = VB.TIMING = {
    easy:   { assist: 0.28, swing: 0.42, lock: 0.06 },
    normal: { assist: 0.22, swing: 0.36, lock: 0.09 },
    hard:   { assist: 0.16, swing: 0.30, lock: 0.12 },
    expert: { assist: 0.14, swing: 0.27, lock: 0.14 },
    // ONLINE (fase 0 del online, notes/net.md): perfil común de los dos humanos = el de Normal (decisión D9 de Ferran)
    online: { assist: 0.22, swing: 0.36, lock: 0.09 }
  };

  /** Convierte coordenadas de la simulación (z arriba) a Three.js (y arriba).
   *  Si se pasa `out` con .set (THREE.Vector3) o un objeto {x,y,z}, se reutiliza. */
  VB.toThree = function (x, y, z, out) {
    if (out) {
      if (out.set) return out.set(x, z, -y);
      out.x = x; out.y = z; out.z = -y; return out;
    }
    return { x: x, y: z, z: -y };
  };
  /** Inversa: Three.js -> simulación. */
  VB.fromThree = function (tx, ty, tz, out) {
    out = out || {};
    out.x = tx; out.y = -tz; out.z = ty; return out;
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function side(t) { return t === 0 ? 1 : -1; } // equipo 0 en x > 0

  // PRNG determinista (mulberry32) para escenas de depuración y tests
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    var f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // S3-C1 (repetición): leer y fijar el estado (uint32) sin gastar azar; la secuencia es la de siempre (copyGame, stateHash)
    f.get = function () { return s; };
    f.set = function (v) { s = v >>> 0; };
    return f;
  }

  // ---------- Entidades ----------
  /** Jugador nuevo. base = separación de ids entre equipos (2 en 2v2: ids 0-3 como siempre; 16 en 6v6: plantillas de hasta
   *  16, ids 0-15 y 16-31; los .id son claves, no índices contiguos). */
  function mkPlayer(team, num, idx, base) {
    return dblFields({
      id: team * (base || 2) + idx, team: team, idx: idx, num: num,
      role: '', zone: 0, front: false, // 6v6: puesto ('S'|'OH'|'MB'|'OPP'|'L'), zona 1-6 y delantero (zonas 2-4); en 2v2 vacíos
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, // vx,vy = velocidad real del último paso (para animación)
      anim: 0,        // >0 mientras dura un gesto de golpeo/brazos arriba (s)
      cool: 0,        // enfriamiento tras tocar
      st: null, prof: null, ak: null, // atributos 1-99, perfil de IA y multiplicadores (applyAttrs; null = perfil del equipo)
      badges: null,   // insignias equipadas {id: nivel 1-3} (applyBadges; null = ninguna)
      bd: 0, bdT: 0.1,// temporizador de salto al bloqueo (IA)
      jvx: 0, jvy: 0, // deriva horizontal en el aire (impulso del despegue)
      // salto con impulso (solo con g.djump): media de la carrera en el suelo (DJ.tau), salto con dirección (1/0), deriva hacia la red del
      // despegue (m/s, ejes del equipo), punto de despegue (marca del pipe, fx.js) y s que quedan de aterrizaje duro
      avx: 0, avy: 0, dj: 0, jF: 0, tkX: 0, tkY: 0, landT: 0,
      lvx: 0, lvy: 0, // impulso de la plancha
      rvx: 0, rvy: 0, // velocidad de carrera (solo con atributos y Velocidad < 50: aceleración finita; si no, no se usa)
      down: 0,        // >0 = en el suelo tras una plancha (s): no se puede mover
      shot: '',       // subtipo del último toque ('tip', 'dive', 'jump', 'float', ...)
      grade: '',      // calidad del último toque ('perfect'|'good'|'poor')
      aiTe: 0, aiTeT: -1, aiJt: 0, aiDv: 0, // desfases de la IA (muestreados por toque; aiDv ya no se usa desde EFFORT, queda por compatibilidad)
      aiRk: 1,        // EFFORT: lectura del balón rival de este toque (×reacción; ai.js, muestreado con aiTe)
      e1T: -9, e1Until: -9, // E1 (g.mastery, ai.js): toque de la finta ya leído por este jugador y hasta cuándo sigue engañado (g.time)
      lastAction: '', // 'pass'|'set'|'spike'|'free'|'serve'|'block'|'swing'|'jump'|'toss'|'dive'
      pressEnd: -9,   // bloqueo activo: hasta cuándo (g.time) vale la pulsación de GOLPEAR en el aire contra el ataque rival (blockPress)
      actionT: 99,    // segundos desde lastAction
      onGround: true
    });
  }

  /** Crea un partido nuevo.
   *  opts: { demo:bool (CPU vs CPU), autopilot:bool (equipo humano lo lleva la IA
   *          pero la cámara/HUD son de partido), seed:int,
   *          difficulty:'easy'|'normal'|'hard' (también 'facil','dificil'): nivel de la CPU,
   *          serveClock:bool (regla de 8 s para el saque humano, 5 s en la playa: g.serveClockMax; por defecto true),
   *          ctrl:'both'|'one' (controlar a los dos jugadores o solo a uno; g.ctrlMode, por defecto 'both'),
   *          ctrlIdx:0|1 (modo 'one': a quién lleva el humano, 0 = teams[0][0] dorsal 1, 1 = teams[0][1] dorsal 2; g.ctrlIdx;
   *          el juego ya solo usa 0, el 1 queda para pruebas y &ctrlidx=),
   *          ctrlRole:'OH'|'S'|'OPP'|'MB' (6v6: puesto del jugador del humano, CTRL_ROLES6; el primero de ese puesto: OH1 n.º 2,
   *          S n.º 1, OPP n.º 4, MB1 n.º 3; g.ctrlRole, g.ctrlBase; ver setCtrlRole),
   *          stats:bool } */
  /** 6v6: puestos que puede llevar el humano, en el orden de la fila «Controlar» (Receptor, Colocador, Opuesto, Central). El líbero
   *  no se elige: cuando entra por el central del humano, el humano lo lleva a él hasta que su central vuelve (applyLibero, g.ctrlBase). */
  var CTRL_ROLES6 = ['OH', 'S', 'OPP', 'MB'];
  /** 6v6: el humano pasa a llevar el puesto role (CTRL_ROLES6). Deja g.ctrlRole, g.ctrlBase (su atleta: el primero de ese puesto en la
   *  alineación) y g.ctrl (el mismo, o el líbero si ahora está sustituyendo a su central). Devuelve g.ctrl, o null si no es 6v6 o el
   *  puesto no vale. ui.js lo llama al empezar el partido (fila Controlar); también sirve en caliente (pruebas, consola). */
  function setCtrlRole(g, role) {
    if (!g.rot || CTRL_ROLES6.indexOf(role) < 0) return null;
    var lu = g.lineup[0], base = null;
    for (var i = 0; i < lu.length; i++) if (lu[i].role === role) { base = lu[i]; break; }
    if (!base) return null;
    var wasH = g.mode === 'serve' && g.server ? isHuman(g, g.server) : false;
    g.ctrlRole = role; g.ctrlBase = base;
    g.ctrl = g.liberoFor[0] === base ? g.libero[0] : base;
    endSwing(g); g.defRole = '';
    // con el balón aún en la mano (serveState 'ready') y el sacador cambiando de manos, el saque se prepara otra vez como en setupServe: si
    // pasa a ser del humano, diana (serveAimReset) y sin ritual; si pasa a la IA, su ritual y la hora del lanzamiento. Sin esto el colocador
    // humano sacaba el 1r saque del partido (ui.js aplica el puesto justo después de empezar) con el ritual de la CPU congelado y sin diana
    if (g.mode === 'serve' && g.serveState === 'ready' && g.server && isHuman(g, g.server) !== wasH) {
      var sv = g.server, ti = ritualSetup(g, sv, !isHuman(g, sv));
      g.timer = ti > 0 ? ti : (g.demo ? 0.9 : 1.3); g.cpuTossIn = ti;
      serveAimReset(g, sv); holdPos(g, sv, g.ball);
    }
    return g.ctrl;
  }
  /** Puntos por set que se pueden elegir (Partido rápido). */
  var SET_POINTS = [11, 15, 21, 25];
  /** Puntos para ganar el set en curso: g.points, y el set decisivo (3r) a min(15, g.points). */
  function setTarget(g) { var p = g.points || 25; return g.setNo === 3 ? Math.min(15, p) : p; }
  function createGame(opts) {
    opts = opts || {};
    if (opts.online && !opts.demo) opts = onlineOpts(opts); // ONLINE: 1 contra 1 en 2v2 con dos huecos humanos (ver «Online»)
    // E6 (Entrenamiento): opts.drill = 'serve'|'recv'|'set'|'atk'|'block'|'free' (nunca en la demo; siempre 2v2). dkp = ejercicio con
    // repeticiones (todos menos el peloteo libre): control 'one' con el n.º 1, sin presentación larga, sin ayuda de primer partido ni error arbitral
    var dk = !opts.demo && typeof opts.drill === 'string' && DRILL.kinds.hasOwnProperty(opts.drill) ? opts.drill : null, dkp = !!dk && dk !== 'free';
    // formato (sprint 1 del 6v6): '2v2' por defecto (idéntico a siempre); '6v6' solo con opts.format === '6v6' (en pruebas:
    // ?format=6v6). El 6v6 aún NO tiene reglas ni IA propias (sprint 2): seis por equipo con la IA de 2v2 generalizada.
    var six = opts.format === '6v6' && !dk, size = six ? 6 : 2;
    // vóley playa (solo 2v2): pista 16×8, sets a 21 (3r a 15), cambio de campo cada 7 (5 en el 3r), el bloqueo cuenta
    // como toque, la dejada es de nudillos («pokey») y la colocación de dedos se pita más. Sin venue = pabellón byte a byte
    var beach = opts.venue === 'beach' && !six;
    var teams = six ? [mkTeam6(0), mkTeam6(1)] : [[mkPlayer(0, 1, 0), mkPlayer(0, 2, 1)], [mkPlayer(1, 3, 0), mkPlayer(1, 9, 1)]];
    // dorsales propios (Carrera): opts.nums = [[n1, n2], [n3, n9]] (cada hueco o equipo puede ser null = el de siempre). Solo cambia p.num.
    if (opts.nums) for (var nt = 0; nt < 2; nt++) for (var ni = 0; ni < teams[nt].length; ni++) {
      var nv = opts.nums[nt] && opts.nums[nt][ni];
      if (nv === (nv | 0) && nv >= 1 && nv <= 99) teams[nt][ni].num = nv;
    }
    var diff = normDiff(opts.difficulty);
    var seed = opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff);
    var g = {
      opts: opts,
      format: six ? '6v6' : '2v2',
      size: size,              // jugadores en pista por equipo (2 o 6): todo bucle sobre jugadores va con g.players.length
      // 6v6: rotación por equipo, rot[t][z - 1] = jugador en la zona z (rot[t][0] saca); lineup = la del inicio de set.
      // En 2v2, null (el sacador sale de serverIdx como siempre)
      rot: six ? [teams[0].slice(), teams[1].slice()] : null,
      lineup: six ? [teams[0].slice(), teams[1].slice()] : null,
      // 6v6 (sprint 2): libero[t] (rol 'L', en banquillo hasta que entra), liberoFor[t] = central al que sustituye ahora (o null),
      // roster[t] = los 7 (6 de la rotación + líbero; bench = true el que está fuera), setPlan[t] = decisión del colocador
      // en curso {to, tempo, x, y, apex, t} (VB.AI6). En 2v2, null
      libero: six ? [mkLibero(0), mkLibero(1)] : null,
      liberoFor: six ? [null, null] : null,
      roster: null,
      setPlan: six ? [null, null] : null,
      demo: !!opts.demo,
      autopilot: !!opts.autopilot,
      // control del humano: 'both' = el control pasa a quien da el siguiente toque; 'one' = siempre el mismo jugador
      // (teams[0][ctrlIdx]) y la IA lleva al compañero en todo, saque incluido
      // (6v6 con humano: siempre 'one', notes/diseno-6v6-carrera.md §1.5; la demo 6v6 sigue como estaba)
      ctrlMode: dkp || opts.ctrl === 'one' || (six && !opts.demo) ? 'one' : 'both',
      // 6v6: puesto del jugador del humano (CTRL_ROLES6; '' en 2v2). (La «posición asistida», g.assist6, se quitó el 11-nov-2026:
      // el humano solo se mueve con el stick, como en el 2v2.)
      ctrlRole: six ? (CTRL_ROLES6.indexOf(opts.ctrlRole) >= 0 ? opts.ctrlRole : 'OH') : '',
      ctrlBase: null,          // 6v6: el atleta del humano de verdad (g.ctrl es el líbero mientras sustituye a su central; applyLibero)
      // 6v6: falta de posición pitada al humano: puede moverse durante el saque (empieza en su sitio legal, placeServe) y, si al golpe de
      // saque está en un par solapado de su equipo, punto para el rival ('position'). En todos los niveles desde el 17-nov-2026 (Ferran:
      // «haz que se pueda mover»; antes solo Difícil/Experto); en Fácil/Normal fx.js le enseña su sitio legal durante el saque, en
      // Difícil/Experto no
      posRule6: six && !opts.demo,
      hAct: -9,                // 6v6: g.time de la última entrada del humano (stick o botón); el colocador no coloca al que está quieto
      ask6: -9,                // 6v6: g.time del último «¡Pídela!» del humano (CAMBIAR durante la jugada propia)
      // modo 'one': jugador del humano (0 = dorsal 1, 1 = dorsal 2); en 'both' siempre 0 (el control empieza en teams[0][0])
      ctrlIdx: !dkp && opts.ctrl === 'one' && +opts.ctrlIdx === 1 ? 1 : 0,
      difficulty: diff,
      // demo del menú: CPU vs CPU con el perfil DIFF.demo (peloteos vistosos con ritmo de partido real, ver R6)
      prof: opts.demo ? [DIFF.demo, DIFF.demo] : [DIFF.mate, rookieProf(DIFF[diff], !dkp && opts.rookie && (diff === 'easy' || diff === 'normal'), diff)], // equipo 0: compañero IA de nivel fijo
      // ayuda de timing del humano (VB.TIMING): el primer partido usa la de Fácil
      tm: opts.demo ? TIMING.hard : (!dkp && opts.rookie && (diff === 'easy' || diff === 'normal') ? TIMING.easy : TIMING[diff]),
      defRole: '',             // rol del humano mientras ataca la CPU: '' | 'dig' (defiende) | 'block' (bloquea) — ver updateDefense
      recvRisk: 0,             // dificultad (0..1+) del último saque para el receptor (ver serveRisk)
      courtSwap3: false,       // ya se cambió de campo a mitad del set decisivo (a los 8 si va a 15)
      // puntos por set (Partido rápido: 11 | 15 | 21 | 25); el set decisivo va a min(15, points). Ver setTarget.
      // La playa siempre a 21, salvo el partido a un solo set (opts.sets === 1: la prueba de la Carrera), que también acepta 11 o 15
      points: (beach && opts.sets !== 1) ? 21 : SET_POINTS.indexOf(+opts.points) >= 0 ? +opts.points : (beach ? 21 : 25),
      // pista de esta partida (ver C.BEACH): media longitud, media anchura y escala respecto a la de 18×9 (1 en el pabellón:
      // multiplicar por g.cs deja los números exactos y la huella 2v2 intacta)
      venue: beach ? 'beach' : 'hall', beach: beach,
      HL: beach ? C.BEACH.HL : C.HL, HW: beach ? C.BEACH.HW : C.HW, cs: beach ? C.BEACH.HL / C.HL : 1,
      courtSwapAt: 0,          // playa: suma de puntos del último cambio de campo (cada 7; cada 5 en el 3r set)
      antennaHit: null,        // {x,y,z} donde el balón tocó la antena en este punto (null si no)
      atkServe: null,          // {team, player}: toque por encima de la red sobre el saque rival en zona de ataque; es falta
                               // (13.3.4) solo si se COMPLETA como ataque: el balón cruza la red o lo toca el rival
      aimIn: [0, 0], aimOn: false, // dirección de apuntado de la entrada del último paso (mundo, normalizada)
      // 6v6: módulo del stick (0..1) en este paso y el del último apuntado del gesto en curso (processSwing): el carril del colocador
      // humano (VB.AI6.laneOf, D3) exige |stick| >= 0,4, y aim va normalizado desde 0,2. En 2v2 se quedan en 0
      aimLen: 0, swingLen: 0,
      rng: makeRng(seed),
      seed: seed | 0,          // semilla del partido (la presentación determinista la usa sin gastar g.rng: ritual SIM-04)
      serveNo: 0,              // saques puestos en este partido (cuenta serveReady)
      // ritual del sacador CPU (SIM-04), objeto persistente: on, phase ('none'|'wait'|'pre'|'dribble'|'post'|'done'), t (s desde
      // el silbato), dur (s silbato -> lanzamiento), bounces, n (botes hechos), u (0..1 del bote en curso), player, rx/ry
      // (punto del bote), cyc/td/tu (periodo, bajada, subida), v0/vu/vc/vi (empujón, subida, recogida, contra el suelo), press
      ritual: dblFields({ on: false, phase: 'none', t: 0.5, dur: 0.5, bounces: 0, n: 0, u: 0.5, player: null, rx: 0.5, ry: 0.5,
        pre: 0.5, post: 0.5, still: 0.5, cyc: 0.5, td: 0.5, tu: 0.5, v0: 0.5, vu: 0.5, vc: 0.5, vi: 0.5, press: false }),
      cpuTossIn: -1,           // s de juego hasta el lanzamiento programado de la CPU (0 = ya lanzado; -1 = humano / sin saque)
      time: 0,                 // tiempo de juego acumulado (s)
      teams: teams,
      players: teams[0].concat(teams[1]),
      ball: { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, held: null, spin: 0, speed: 0, dip: 0, wobA: 0, wobF: 0, wobP: 0 },
      mode: 'serve',           // 'serve' | 'rally' | 'point' | 'over'
      score: [0, 0], sets: [0, 0], setNo: 1, setScores: [],
      serving: 0, serverIdx: [0, 1],
      server: null,            // jugador que saca en este punto
      serveState: 'ready',     // 'ready' (balón en la mano) | 'toss' (balón lanzado)
      serveJump: false,        // saque en salto (true) o flotante (false)
      serveClock: beach ? C.SERVE_CLOCK_BEACH : C.SERVE_CLOCK, // segundos que quedan para sacar (regla de 8 s; 5 s en la playa; solo humano)
      serveClockMax: beach ? C.SERVE_CLOCK_BEACH : C.SERVE_CLOCK, // duración de esa cuenta en esta partida (UI: cuenta atrás y textos)
      serveT: 0, tossT: 0, jumpAt: 0, aiServeTe: 0, serveAuth: false, whistleAt: 0.7, // serveAuth: ya ha pitado el saque
      touchTeam: -1, touches: 0, lastPlayer: null, lastTeam: -1, lastKind: '', lastShot: '', lastQ: 1, // lastQ: calidad (0..1) del último toque (hit)
      lastTouchT: 0,           // g.time del último contacto (toque, bloqueo, saque)
      ctrl: teams[0][!dkp && opts.ctrl === 'one' && +opts.ctrlIdx === 1 ? 1 : 0], // jugador que controla el humano (g.ctrlIdx)
      jobs: [null, null],      // quién de cada equipo va al balón
      pr1: { x: 0, y: 0, z: 0, t: 0 }, pr3: { x: 0, y: 0, z: 0, t: 0 }, // predicciones de cruce a 1 m y 3 m
      blockOff: [0, 0], timer: 0, blockCD: 0,
      hitBuf: 0,               // > 0 mientras dura el gesto de golpeo del humano (s)
      jsetQ: 0,                // > 0: COLOCAR pulsado justo al despegar, pendiente de lanzarse en cuanto se pueda (s)
      swingLive: false, swingShot: '', swingLock: 0,
      swingAim: [0, 0], swingHasAim: false, // dirección dada durante el gesto (vale aunque se suelte antes del contacto)
      // C2 (colocar por destino): ventana de colocación del humano abierta (setWin), sector de la dirección pulsada sin soltar (-1 =
      // ninguna) y de dónde viene (setCarryK 1: de moverse hasta su sitio, neutra; 2: pulsada ya en su sitio) y dirección elegida
      // (grados, 0 = hacia la red, 90 = derecha; NaN = neutra: alta a la 4). Ver step
      setWinOn: false, setCarry: -1, setCarryK: 0, setDirA: NaN,
      lastGrade: '',           // calidad del último toque humano
      pendingSet: false, digOk: true, hardIn: false, finished: false,
      digK: 0, feintFool: false, // EFFORT: dificultad del balón para el dado de contacto de la IA; finta que engaña (lectura tardía)
      swingT0: 0,              // g.time de la pulsación que abrió el gesto humano en curso
      // E1 (maestría, solo con g.mastery): golpe con el que se abrió el gesto ('' = GOLPEAR), g.time del cambio de botón dentro del
      // gesto (finta), g.time del último toque que fue finta, etiqueta del último ataque ('' | 'feint' | 'roll' | 'edge' | 'quick'),
      // proximidad a la línea del último ataque humano (0..1, VB.Sim.edgeOf) y tempo de la última colocación ('' | 'quick' | 'lane' | 'high')
      swingShot0: '', swingSwapT: -9, feintT: -9, atkMove: '', atkEdge: 0, lastTempo: '',
      chain: 0, chainH: 0,     // E1 tramo 2 (jugada perfecta, g.mastery): toques perfectos seguidos del equipo 0 en la posesión y cuántos del humano
      prevKind: '',            // tipo del toque anterior al último
      atkTeam: -1, atkHow: '', atkHits: 0, // último ataque/saque (para atribuir kill/ace aunque el rival lo toque y no lo salve)
      atkSet: null,            // colocador (2º toque del mismo equipo) del último ataque, o null (point.assist)
      jobMem: [null, null], jobMemT: [-1, -1], jobSwT: [-9, -9], jobHop: [-1, -1], // IA: memoria de quién va al balón (histéresis)
      digMargin: 0,            // margen de defensa (s) del último remate (>0 el defensor llega con tiempo; <0 al hueco)
      lastPoint: null,         // {team, reason, text, how, highlight, digs, streak, savedSetPoint, clutch, signal, touchedOut, landSide, hold, setWon, matchWon}
      setPoint: -1, matchPoint: -1, // equipo con punto de set/partido en el saque actual (-1 nadie)
      rally: { t: 0, hits: 0, digs: 0 },// duración, toques y defensas de remate (SIM-01) del rally en curso
      // presentación (SIM-03): g.present = true (main.js, partidos humanos) alarga la pausa de los puntos grandes;
      // hold = duración (s) de la pausa del punto en curso (point.hold), para skipHold
      present: !!opts.present && !dkp, hold: 0,
      // Ambiente de Carrera (P3, notes/ambiente.md §4.5): amb = opts.amb (solo partidos jugados de Carrera; nunca demo, online ni
      // Entrenamiento); holdLock = g.time hasta el que skipHold no recorta (tarjeta en pantalla). Sin amb: Sim.holdFor/penalty no hacen nada
      amb: !!opts.amb && !opts.demo && !opts.online && !dk, holdLock: 0,
      streakTeam: -1, streakN: 0, // racha de puntos seguidos en el set (SIM-01)
      atkHuman: false, atkGrade: '', // quién/cómo fue el último ataque o saque (para 'kill perfecto del humano')
      // remate apuntado (A1-A3): mira libre del humano en el aire en el 3r toque; defensa más justa tras remate perfecto
      // saque dirigible: la misma diana con kind 'serve' mientras saca el humano (serveAimReset / updateServeAim)
      aim3: dblFields({ on: false, x: 0.5, y: 0.5, kind: '' }), digTight: false,
      // error arbitral + challenge (B1-B3): llamada del último bote, challenges por set, revisión en curso, petición de la CPU
      // opts.ref (Carrera, error arbitral por competición): {p1, p2, p3, d1?, d2?, d3?, chal} sobre VB.REF_ERR / CHAL.perSet
      refErr: dk ? refOf(NOREF) : refOf(opts.ref), chalPerSet: dk ? 0 : chalOf(opts.ref), lineJudges: !(opts.ref && opts.ref.judges === false), // jueces de línea en la pista (solo pintado: arena) // (E6: en el Entrenamiento el árbitro no falla ni hay challenge)
      call: null, challenges: [2, 2], review: null, cpuChal: null, _pendCall: null, _snap: null, _digWho: null,
      events: [],              // cola de eventos del paso (main.js la vacía cada frame)
      drill: null,             // E6 (Entrenamiento): estado del ejercicio (mkDrill) o null fuera del modo (siempre en el literal: misma forma)
      // salto con impulso (v1.12.0): en el literal para que g no cambie de forma al crearse (copyGame recorre g con for-in); valores abajo
      djump: false, jsetAim: false, jdF: 0.5, jdS: 0.5, jdM: 0.5, jdT: -9.5, aimCarry: 0, jsMv: 0, jsAimD: 0.5, djLast: null,
      replay: false,           // S3-C1: true solo en la partida sombra que pinta una repetición (VB.Replay); la sim no lo lee. En el
                               // literal para que la sombra tenga la misma forma que la partida en vivo; copyGame no lo copia
      stats: opts.stats ? {
        hits: { pass: 0, set: 0, spike: 0, free: 0, serve: 0 }, blocks: 0, points: 0, why: {}, rallies: [],
        grades: { perfect: 0, good: 0, poor: 0 }, hgrades: { perfect: 0, good: 0, poor: 0 }, shots: {},
        won: [0, 0], misses: 0, dives: 0, diveMiss: 0, blockKinds: { stuff: 0, soft: 0, tool: 0, touch: 0 },
        serves: [0, 0], aces: [0, 0], spikes: [0, 0], kills: [0, 0], stuffPts: [0, 0], faults: {}, body: 0, jsets: 0, courtChanges: 0,
        // E1: jugadas de maestría del humano, [usos, puntos] (tool = manos fuera con el remate al filo; lane/high = colocaciones dirigidas);
        // cpu: las de la CPU (golpe colocado [usos, puntos] y colocaciones a un lado). Solo cuentan con g.mastery
        mastery: { feint: [0, 0], roll: [0, 0], edge: [0, 0], tool: 0, quick: [0, 0], lane: 0, high: 0, cpu: { roll: [0, 0], lane: 0 } },
        _undo: null              // contadores del último punto que se pueden revocar con challenge (point → endReview)
      } : null
    };
    // E1: maestría (finta, golpe colocado, al filo, colocación dirigida y lo que lee la IA). Solo en partidos humanos 2v2: nunca en la
    // demo, con autopilot ni en 6v6. Se decide aquí una vez; cada rama nueva solo mira g.mastery. aimSet: colocación dirigida (por defecto sí)
    g.mastery = !!opts.mastery && !g.demo && !g.autopilot && !g.rot;
    // Finta (19-nov-2026): también en 6v6 (opts.feint, main.js) sin el resto de la maestría. g.feintOn = la finta del humano existe
    // (GOLPEAR y, después, SALTAR o COLOCAR): con g.mastery siempre; sin ella, solo la finta (etiqueta point.move 'feint' y lectura tardía de la IA)
    g.feintOn = (g.mastery || !!opts.feint) && !g.demo && !g.autopilot;
    g.aimSet = opts.aimSet !== false;
    // Salto con impulso (v1.12.0): g.djump = salto con dirección del humano (main.js/netlobby.js lo pasan; las huellas no); g.jsetAim =
    // colocación en salto con diana (ajuste; online por hueco, humans[i].jsetAim). Nunca en la demo ni con autopilot. Estado del humano
    // (hueco online, SLOT_S): jdF/jdS/jdM/jdT = última dirección del stick en ejes del equipo (F hacia la red, S = side·y), su módulo y
    // su g.time (búfer DJ.buf); aimCarry = la dirección del despegue aún no mueve la diana; jsMv/jsAimD = diana de colocación movida y
    // recorrido. djLast = último remate {team, mom, pipe} para las estadísticas (g.stats.dj)
    g.djump = opts.djump === true && !g.demo && !g.autopilot;
    g.jsetAim = opts.jsetAim === true && !g.demo && !g.autopilot;
    g.jdF = 0; g.jdS = 0; g.jdM = 0; g.jdT = -9; g.aimCarry = 0; g.jsMv = 0; g.jsAimD = 0;
    g.djLast = dblFields({ team: -1, mom: 0, pipe: 0 });
    if (g.djump && g.stats) g.stats.dj = { mom: [0, 0], pipe: [0, 0], jaim: 0 };
    // partido a un solo set (opts.sets === 1, la prueba de la Carrera): g.toWin = sets para ganar. Sin la opción el campo NO existe
    // (al mejor de 3, `g.toWin || 2`), para que la huella 2v2 no cambie. Con un set nunca hay 3r set (setTarget y los 8 intactos)
    if (opts.sets === 1) g.toWin = 1;
    if (opts.online) initOnline(g, opts); // ONLINE: perfil y timing comunes, huecos humanos g.hum (antes de los atributos)
    if (dk) g.drill = mkDrill(dk);
    dblFields(g); dblFields(g.ball); dblFields(g.pr1); dblFields(g.pr3); dblFields(g.rally);
    if (six) { g.roster = [teams[0].concat([g.libero[0]]), teams[1].concat([g.libero[1]])]; if (g.stats) { g.stats.overlap = [0, 0]; g.stats.liberoSwaps = 0; } }
    if (six) subsInit(g, opts, diff);   // banquillo y cambios (solo con opts.bench: g.subsOn; sin él, solo campos apagados)
    refreshTeams(g);
    applyAttrs(g, opts.attrs);
    applyBadges(g, opts.badges);
    if (six) { for (var ci = 0; ci < teams[0].length; ci++) if (teams[0][ci].role === g.ctrlRole) { g.ctrl = teams[0][ci]; break; } g.ctrlBase = g.ctrl; } // 6v6: el 1r de ese puesto (OH1, S, OPP, MB1)
    if (six) subsCtrl(g, opts);         // Carrera: tu atleta por meSlot (titular) o meBench (en el banquillo: g.ctrlOut)
    g.server = g.ctrl;
    newGame(g);
    return g;
  }

  /* ---------- Estadísticas de jugador (atributos 1-99, ver notes/diseno-6v6-carrera.md §2) ----------
   * opts.attrs = [[st n.º 1, st n.º 2], [st n.º 3, st n.º 9]] (cualquiera puede faltar). Un jugador sin atributos usa el
   * perfil de su equipo tal cual (g.prof[team]); con atributos, p.prof = statProf(perfil del equipo, st). 50 en todo = neutro
   * (idéntico al perfil base), así que sin opts.attrs la sim no cambia ni gasta azar. Al humano le llegan por p.ak:
   * ventanas de timing por toque, velocidad de remate/saque, dispersión de la diana, salto y carrera. */
  var ATTR_KEYS = VB.ATTR_KEYS = ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];
  function sAt(st, k) { var v = st && st[k]; return v == null || !isFinite(v) ? 0.5 : clamp((+v - 1) / 98, 0, 1); }
  /* Revisión «que se noten» (10-nov-2026): d = f − 0,5 (−0,5 con 1, 0 con 50, +0,5 con 99). Todos los efectos son 1 + c·d (o
   * c·d si suman), así que con 50 valen EXACTAMENTE 1 (o 0) y la sim es idéntica. Pendiente distinta por debajo y por encima de
   * 50 (aD/aU): bajar duele más que subir ayuda, para que un 15 se note de verdad sin que un 90 rompa el juego. Tablas medidas en
   * notes/sim.md («Atributos que se notan») y en simtest. */
  function sD(st, k) { return sAt(st, k) - 0.5; }
  function aK(d, aD, aU) { return 1 + (d < 0 ? aD : aU) * d; }
  var AK = VB.ATTR_K = {
    speed: [0.44, 0.36],   // velocidad máxima ×0,78-1,18 (humano y IA con atributos)
    accT: 0.9,             // s de 0 a la velocidad máxima por cada unidad de d por debajo de 50 (15 → 0,32 s); ≥ 50 instantáneo
    jump: [0.45, 0.24],    // velocidad de despegue ×0,775-1,12 (altura del salto ×0,60-1,25)
    wJmp: [0.6, 0.3],      // ventana de timing del remate y del bloqueo (salto): ×0,70-1,15
    win: [0.6, 0.44],      // ventanas de timing por toque (recepción, defensa, colocación, ataque, saque, bloqueo): ×0,70-1,22
    spike: 6, serve: 5,    // m/s de remate / saque en salto (±3 / ±2,5)
    spread: 0.8,           // dispersión de la diana (control / saque): ×1,4-0,6
    blk: 0.5, hands: 0.3,  // bloqueo: oficio del humano ×0,75-1,25; anchura de las manos ×0,85-1,15 (todos)
    rec: 0.6,              // reacción: lo que tarda en levantarse de una plancha y el bloqueo tras un gesto fallido ×1,3-0,7
    // precisión del toque del humano (integración, 10-nov-2026: la revisión midió que Recepción, Defensa, Colocación y Control
    // solo movían la ventana y el resultado no cambiaba): dispersión del balón que sale (er) ×1,5-0,6 y prob. de recepción
    // desviada / colocación que pasa la red ×1,5-0,6. Sin gasto de azar extra (mismos dados, otro umbral)
    err: [1.4, 1.0],
    reach: [0.16, 0.12],   // alcance del 1r toque del humano (Recepción / Defensa): ×0,94-1,05
    errQ: [0.5, 0.8]       // calidad del pase/colocación del humano: ×(1 − 0,5·(ek − 1)) por debajo de 50; + (1 − q)·(1 − ek)·0,8 por encima
  };
  function statProf(base, st) {
    var o = {}; for (var k in base) o[k] = base[k];
    var d = function (k) { return sD(st, k); };
    o.speed = base.speed * aK(d('speed'), AK.speed[0], AK.speed[1]);
    o.react = Math.max(0.03, base.react - 0.16 * d('react'));
    o.blockReact = Math.max(0.02, base.blockReact - 0.1 * d('react'));
    o.timing = base.timing * (1 - 0.8 * d('ctl'));
    o.recv = clamp(base.recv + 0.3 * d('recv'), 0.4, 0.98);
    o.dig = clamp(base.dig + 0.3 * d('dig'), 0.1, 0.8);
    o.block = clamp(base.block + 0.3 * d('block'), 0.05, 0.75);
    o.spike = base.spike + AK.spike * d('spike');
    o.atkErr = base.atkErr * (1 - 1.2 * d('ctl'));
    o.err = base.err * (1 - 0.6 * d('set'));
    o.jserve = base.jserve + AK.serve * d('serve');
    o.srvErr = base.srvErr * (1 - 0.8 * d('serve'));
    o.jumpServe = clamp(base.jumpServe + 0.5 * d('serve'), 0, 0.9);
    if (base.jsetAI != null) o.jsetAI = clamp(base.jsetAI * (1 + d('set')), 0, 0.5); // Colocación: 15 → ×0,65; 90 → ×1,4
    return o;
  }
  /** Multiplicadores del humano (y de la física de todos los que llevan atributos) a partir de los atributos; 50 en todo = 1
   *  (spike, serve y accT suman: 0). */
  function attrK(st) {
    var d = function (k) { return sD(st, k); }, w = function (k) { return aK(d(k), AK.win[0], AK.win[1]); }, ds = d('speed');
    return { jump: aK(d('jump'), AK.jump[0], AK.jump[1]), speed: aK(ds, AK.speed[0], AK.speed[1]), accT: ds < 0 ? -AK.accT * ds : 0,
      wJmp: aK(d('jump'), AK.wJmp[0], AK.wJmp[1]), wRecv: w('recv'), wDig: w('dig'), wSet: w('set'),
      wAtk: w('ctl'), wSrv: w('serve'), wBlk: w('block'), spike: AK.spike * d('spike'), serve: AK.serve * d('serve'),
      spread: 1 - AK.spread * d('ctl'), srvSpread: 1 - AK.spread * d('serve'),
      blk: 1 + AK.blk * d('block'), hands: 1 + AK.hands * d('block'), rec: 1 - AK.rec * d('react'),
      eRecv: e('recv'), eDig: e('dig'), eSet: e('set'), eAtk: e('ctl'),
      rRecv: aK(d('recv'), AK.reach[0], AK.reach[1]), rDig: aK(d('dig'), AK.reach[0], AK.reach[1]) };
    function e(k) { var v = d(k); return 1 - (v < 0 ? AK.err[0] : AK.err[1]) * v; }   // 1 con 50; 15 → ×1,5; 90 → ×0,6
  }
  /** Velocidad de despegue del salto del jugador p (C.JUMP_V × atributo Salto). */
  function jumpV(p) { var v = p && p.ak ? C.JUMP_V * p.ak.jump : C.JUMP_V; return p && p.tired > 0 ? v * (1 - SUBK.jump * p.tired) : v; } // (cansancio: solo con banquillo, g.subsOn)
  function applyAttrs(g, attrs) {
    if (!attrs || g.demo) return;
    for (var t = 0; t < 2; t++) for (var i = 0; i < g.teams[t].length; i++) {
      var st = attrs[t] && attrs[t][i]; if (!st) continue;
      attrOne(g, g.teams[t][i], st);
    }
  }
  /** Atributos de un jugador (applyAttrs; también los suplentes del banquillo, benchAttrs). */
  function attrOne(g, p, st) {
    var c = {}; for (var j = 0; j < ATTR_KEYS.length; j++) c[ATTR_KEYS[j]] = clamp(Math.round(+st[ATTR_KEYS[j]] || 50), 1, 99);
    p.st = c; p.prof = statProf(g.prof[p.team], c); p.ak = attrK(c);
  }
  function profOf(g, p) { return (p && p.prof) || g.prof[p.team]; }

  /* ---------- Insignias (badges) ----------
   * opts.badges = [[b n.º 1, b n.º 2], [b n.º 3, b n.º 9]], cada b = {idInsignia: nivel (1 bronce, 2 plata, 3 oro)} o null.
   * Queda en p.badges ({id: nivel} solo con ids conocidos y nivel 1-3; null si no lleva ninguna). Los efectos valen para el
   * jugador lo lleve el humano o la IA. Tablas por nivel [0, bronce, plata, oro] en VB.BADGE (solo lectura). Sin opts.badges
   * la sim es idéntica: todos los factores valen 1 (o 0 si suman) y solo 'rompemanos' tira un dado extra, y solo si lo lleva
   * el atacante. Ver notes/sim.md, «Insignias». */
  var BADGE_IDS = ['canon', 'mira', 'rompemanos', 'seda', 'bombardero', 'flotador', 'muro', 'ancla', 'red', 'motor', 'sangrefria', 'lider'];
  var BADGE = VB.BADGE = {
    canon: [0, 0.6, 1.2, 1.8],          // remate +m/s
    mira: [1, 0.88, 0.78, 0.68],        // dispersión de la diana del remate (humano)
    miraAI: [1, 0.9, 0.8, 0.7],         // atkErr (IA)
    rompemanos: [0, 0.08, 0.16, 0.24],  // +prob. (absoluta) de block-out si el remate toca el bloqueo
    sedaW: [1, 1.08, 1.16, 1.25],       // ventana de timing del remate siguiente del compañero (humano)
    sedaV: [0, 0.4, 0.8, 1.2],          // +m/s de ese remate
    sedaAI: [1, 0.85, 0.7, 0.55],       // atkErr de ese remate (IA)
    bombardero: [0, 0.7, 1.4, 2.1],     // saque en salto +m/s
    bombarderoAI: [0, 0.1, 0.2, 0.3],   // +prob. de saque en salto (IA)
    flotador: [1, 1.15, 1.3, 1.45],     // baile del flotante
    muroAI: [0, 0.04, 0.08, 0.12],      // +oficio del bloqueo (IA)
    muroQ: [1, 1.08, 1.16, 1.25],       // calidad del contacto del bloqueo (humano)
    anclaW: [1, 1.06, 1.12, 1.18],      // ventana de la recepción del saque (humano)
    anclaAI: [0, 0.02, 0.04, 0.06],     // +recv (IA)
    redR: [1, 1.05, 1.10, 1.15],        // alcance de defensa (1r toque) y de plancha
    redW: [1, 1.05, 1.10, 1.15],        // ventana de la defensa de remate (humano)
    motor: [1, 1.015, 1.03, 1.045],     // velocidad de carrera (peloteo); a la mitad en los arreglos finales (llega sola y era de las más fuertes)
    sangreW: [1, 1.08, 1.16, 1.25],     // con punto de set/partido: todas sus ventanas (humano)
    sangreAI: [1, 0.9, 0.8, 0.7],       // con punto de set/partido: timing (IA)
    liderReact: [0, 0.03, 0.06, 0.09],  // su compañero IA: −reacción (s) (subido en los arreglos finales: el oro casi no se notaba)
    liderT: [1, 0.92, 0.84, 0.76]       // su compañero IA: timing
  };
  function applyBadges(g, badges) {
    if (!badges || g.demo) return;
    for (var t = 0; t < 2; t++) for (var i = 0; i < g.teams[t].length; i++) {
      var b = badges[t] && badges[t][i]; if (!b || typeof b !== 'object') continue;
      g.teams[t][i].badges = badgeObj(b);
    }
  }
  /** {id: nivel 1-3} saneado (null si ninguna válida). */
  function badgeObj(b) {
    var o = null;
    for (var j = 0; j < BADGE_IDS.length; j++) {
      var lv = Math.round(+b[BADGE_IDS[j]] || 0); if (lv < 1) continue;
      (o = o || {})[BADGE_IDS[j]] = lv > 3 ? 3 : lv;
    }
    return o;
  }
  /** Nivel (0-3) de la insignia id del jugador p. */
  function bl(p, id) { var b = p && p.badges; return b ? (b[id] | 0) : 0; }
  /** ¿Punto de set o de partido en juego (de cualquiera)? (Sangre fría) */
  function clutchOn(g) { return g.setPoint !== -1 || g.matchPoint !== -1; }
  /** Factor de las ventanas de timing del humano por Sangre fría (1 sin ella o sin punto de set/partido). */
  function sangreW(g, p) { var l = bl(p, 'sangrefria'); return l && clutchOn(g) ? BADGE.sangreW[l] : 1; }
  /** Reacción y timing efectivos de la IA del jugador p (perfil + Líder del compañero + Sangre fría). Sin insignias = perfil. */
  function aiReact(g, p, pr) { var l = mateBadge(g, p, 'lider'); return l ? Math.max(0.02, pr.react - BADGE.liderReact[l]) : pr.react; }
  function aiTiming(g, p, pr) {
    var k = 1, l = mateBadge(g, p, 'lider'), s = bl(p, 'sangrefria');
    if (l) k *= BADGE.liderT[l];
    if (s && clutchOn(g)) k *= BADGE.sangreAI[s];
    return k === 1 ? pr.timing : pr.timing * k;
  }
  /** Alcance de toque del jugador p: C.REACH, ×Red de seguridad en la defensa (1r toque de su equipo que no es la recepción
   *  del saque; la recepción es cosa de Ancla). La plancha usa (REACH + DIVE) × redR en canDive. */
  function reachOf(g, p) {
    var l = bl(p, 'red'), first = g.touchTeam !== p.team, r = l && first && g.lastKind !== 'serve' ? C.REACH * BADGE.redR[l] : C.REACH;
    // atributos del humano (integración): alcance del 1r toque por Recepción (saque) o Defensa (lo demás), ×0,94-1,05
    if (p.ak && first && isHuman(g, p)) r *= g.lastKind === 'serve' ? p.ak.rRecv : p.ak.rDig;
    return r;
  }

  /** Primer partido (opts.rookie): la CPU saca más suave (sin saque en salto, flotante con menos baile).
   *  En Normal además remata algo más lento y menos fino, defiende y bloquea menos. En Fácil (ya blando de por sí)
   *  solo cambia el saque, que además falla menos: los puntos regalados por saques a la red no enseñan nada.
   *  Medido con el bot 'novato' de simtest (ver notes/sim.md): con los extras de peloteo también en Fácil el novato
   *  ganaba el 51-53 % de los puntos; así, 47-48 % (gana ~1 de cada 3 partidos). */
  function rookieProf(pr, on, diff) {
    if (!on) return pr;
    var o = {}; for (var k in pr) o[k] = pr[k];
    o.jumpServe = 0; o.float = pr.float * 0.6; o.seam = pr.seam * 0.4; o.srvSoft = 0.4; o.name = pr.name;
    if (diff === 'easy') { o.srvErr = pr.srvErr * 0.65; return o; }
    o.spike = pr.spike * 0.9; o.atkErr = pr.atkErr * 1.4; o.aimNoise = pr.aimNoise * 1.25; o.dig = pr.dig * 0.8; o.block = pr.block * 0.5;
    return o;
  }

  /** ¿Toque por encima de la red en salto (remate o dejada)? Lo comparten hit() y aimPoint() para que el aro
   *  de apuntado prediga el mismo tipo de golpe que luego se ejecuta. */
  function isAttackContact(p, b) { return p.z > 0.25 && Math.abs(b.x) < 3.8 && b.z > C.NET_H + 0.1; }

  /* Colocación en salto (solo el humano; input.jset = COLOCAR estando en el aire). Vale en el 2º toque y en el 1r si el
   * balón llega alto a la red (isAttackContact): el compañero ataca entonces en el 2º. Sale más tensa que la de suelo (cima
   * baja: llega antes al atacante), con la ventana de timing ÷win y, con mal timing, se pega a la red o se va larga.
   *  win: divisor de la ventana (1,2 = un 17 % más justa que una colocación de suelo)
   *  tx, tz: destino (m de la red, altura) como la colocación de suelo (1,35 / 3), algo más separada de la red
   *  rise/rise1: cima = contacto + rise (2º toque) / rise1 (1r toque, el compañero viene de más lejos), mínimo minApex
   *  err0/err1: dispersión (como la de suelo, 0,1 + 1,15·(1−q)); badQ/badP: por debajo de badQ, prob. (badQ+0,05−q)·badP
   *  de colocación mala (mitad pegada a la red, mitad larga); blk: el error de colocación del bloqueador rival (blockOff) crece
 *  ×(1 + blk·q): la rápida y bien dada le pilla peor colocado; dig: el dado de defensa del remate que sigue a una colocación en
 *  salto buena/perfecta del 2º toque ×dig (tempo rápido; el bloqueador CPU la lee y llega, ai.js, y sin esto no compensaba
 *  arriesgar); mate: |y| máximo del destino; buf: s que se guarda COLOCAR pulsado justo al despegar (g.jsetQ). */
  var JSET = VB.JSET = { win: 1.2, tx: 1.5, tz: 3, rise: 0.75, rise1: 1.15, minApex: 4.1, err0: 0.12, err1: 1.3, badQ: 0.45, badP: 1.5, blk: 0.6, dig: 0.8, mate: 3.6, buf: 0.2 };
  /* «Salto con impulso» (v1.12.0; notes/sim.md «Salto con impulso»). Todo detrás de g.djump (salto con dirección del humano: partidos
   * humanos con opts.djump, nunca demo ni autopilot) y g.jsetAim (colocación en salto con diana, ajuste): sin ellos la sim es la de
   * siempre bit a bit (huellas 2v2 y de maestría idénticas). La CPU no usa nada de esto (aiJump no cambia).
   *  DJ (despegue): dead = módulo mínimo del stick para saltar con dirección; buf = s que vale la última dirección (táctil: el pulgar se
   *    suelta al pulsar SALTAR); tau = constante de la media de la carrera (p.avx/avy, a = dt/(tau+dt): racional, igual en todas las
   *    plataformas); kR = parte de la carrera que pasa a la deriva; kS = deriva con el stick parado (×módulo, menos cuanto más corre);
   *    perp = parte de la carrera de lado que se conserva; cap = tope (×Salto), back = tope alejándose de la red, blk = tope en el
   *    bloqueo cerca de la red, lat = tope de la deriva a lo ancho (paralela a la red: perseguir la colocación de lado con el pulgar en
   *    el joystick no te lanza 1,8 m de lado); netX/oppX = seguro de red (cae a |x| >= netX en jugada propia, oppX con el balón rival); landJ/landT/
   *    landK = aterrizaje duro (deriva > landJ: landT s con la carrera ×landK); astK = adelanto de la batida asistida (assistMove);
   *    astF = lo que frena como mucho la asistencia corriendo hacia la red (×astF, al llegar a la batida y pasada ella).
   *  MOM (remate con impulso): j0..j1 = deriva hacia el golpe sin/con bonus completo; spd = m/s de más con bonus completo y q >= qHi (1,8: la SPEC daba 2,4 y su plan B 1,8 tras la matriz de simtest)
   *    (nada con q <= qLo); cap = velocidad máxima del remate; win = ventana de timing más justa (×1 + win); spr = dispersión
   *    ×(1 + spr·k); mis/misJ = dispersión extra al rematar cruzando la deriva (escala con la deriva hacia la red, p.jF).
   *  JD (diana de la colocación en salto, g.jsetAim): spd = m/s de la diana; mv = m de recorrido para darla por movida; caja de destino
   *    (dMin..dMax2/dMax6 m de la red, yIn m de las bandas); cima = clamp(contacto + ap0 + apS·s, apMin, apMax) (s = distancia del toque
   *    al destino); tempo: 'quick' si s <= qS y D <= qD, 'high' si cima >= hiAp, si no 'lane'; apErr = error de cima con mal timing
   *    (hash, no g.rng); erS0/erS1 = dispersión ×(erS0 + erS1·s); box6D/box6L = 6v6: margen alrededor del carril del atacante. */
  var DJ = VB.DJ = { dead: 0.30, buf: 0.10, tau: 0.12, kR: 0.32, kS: 0.60, perp: 0.15, cap: 1.8, back: 0.8, blk: 1.0, lat: 1.0, netX: 0.45, oppX: 0.40,
    landJ: 1.2, landT: 0.10, landK: 0.6, astK: 0.49, astF: 0.55 };
  var MOM = VB.MOM = { j0: 0.7, j1: 1.6, spd: 1.8, qLo: 0.35, qHi: 0.70, cap: 24, win: 0.15, spr: 0.30, mis: 0.60, misJ: 1.1 };
  var JD = VB.JD = { spd: 8, mv: 0.25, dMin: 0.5, dMax2: 3.2, dMax6: 4.2, yIn: 0.5, ap0: 0.55, apS: 0.25, apMin: 4.1, apMax: 5.6,
    qS: 1.8, qD: 1.4, hiAp: 5.1, erS0: 0.85, erS1: 0.08, apErr: 0.6, box6D: 0.8, box6L: 1.0 };
  /** El remate rival no se «coloca» desde el bloqueo: con un remate del otro equipo en camino COLOCAR no hace nada en el
   *  aire (bloquea como si no se hubiera pulsado) y la UI no lo ofrece. */
  function jsetVoid(g, p) { return g.touchTeam !== p.team && g.lastKind === 'spike'; }
  function canJset(g, p, count) { return p.z > 0.25 && !jsetVoid(g, p) && (count === 2 || (count === 1 && isAttackContact(p, g.ball))); }
  /** Para la UI (botón táctil COLOCAR, aviso «Rematar | Colocar») y la lectura del bloqueador CPU (ai.js): el jugador humano
   *  está en el aire, el balón le queda a < 3 m en un toque donde cabe la colocación en salto (2º, o 1r con el balón alto
   *  junto a la red) y el contacto previsto (hitWindow, el mismo que el aro) cumple lo que luego pide canJset: el jugador
   *  aún en el aire (> 0,25 m) y, en el 1r toque, el balón por encima de NET_H + 0,1 (isAttackContact). Así lo que se
   *  ofrece es lo que sale. Una llamada por paso (caché por g.time). */
  var _jw = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  var _jrG = null, _jrT = -1, _jrV = false, _jrP = null;
  function jsetReady(g) {
    if (g.mode !== 'rally' || g.demo || g.autopilot) return false;
    if (_jrG === g && _jrT === g.time && (!g.online || _jrP === g.ctrl)) return _jrV;
    _jrG = g; _jrT = g.time; _jrP = g.ctrl; _jrV = jsetReady0(g);
    return _jrV;
  }
  function jsetReady0(g) {
    var p = g.ctrl, b = g.ball, ht = g.online && p ? p.team : 0; // (ht: equipo del humano; 0 fuera del online)
    if (!p || p.team !== ht || !(p.z > 0.05) || p.down > 0 || b.held) return false;
    if (g.touchTeam === ht && (g.lastPlayer === p || g.lastKind === 'serve')) return false;
    if (jsetVoid(g, p)) return false;
    var count = g.touchTeam === ht ? g.touches + 1 : 1;
    if (count > 2 || Math.hypot(b.x - p.x, b.y - p.y) >= 3) return false;
    var w = hitWindow(g, p, _jw), t = Math.max(0, w.t);
    if (!(p.z + p.vz * t - 0.5 * C.G * t * t > 0.25)) return false;           // el contacto ya sería en el suelo
    if (count === 1 && !(Math.abs(w.x) < 3.8 && w.z > C.NET_H + 0.1 && w.x * side(p.team) > -0.5)) return false;
    return true;
  }
  /** E1: qué ofrece ahora el botón COLOCAR al humano en el aire: 'jset' (colocación en salto, = jsetReady), 'roll' (golpe colocado:
   *  g.mastery, 3r toque de su equipo, contacto de ataque previsto en el aire) o ''. Para input.js (botón táctil «COLOCADO») y ui.js.
   *  Una llamada por paso (caché por g.time), sin g.rng. */
  var _arG = null, _arT = -1, _arV = '', _arP = null, _aw = { t: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  function altReady(g) {
    if (g.mode !== 'rally' || g.demo || g.autopilot) return '';
    if (jsetReady(g)) return 'jset';
    if (!g.mastery) return '';
    if (_arG === g && _arT === g.time && (!g.online || _arP === g.ctrl)) return _arV;
    _arG = g; _arT = g.time; _arP = g.ctrl; _arV = altReady0(g) ? 'roll' : '';
    return _arV;
  }
  function altReady0(g) {
    var p = g.ctrl, b = g.ball, ht = g.online && p ? p.team : 0;
    if (!p || p.team !== ht || !(p.z > 0.05) || p.down > 0 || b.held) return false;
    if (!(g.touchTeam === ht && g.touches === 2 && g.lastPlayer !== p) || jsetVoid(g, p)) return false;
    if (Math.hypot(b.x - p.x, b.y - p.y) >= 3) return false;
    var w = hitWindow(g, p, _aw), t = Math.max(0, w.t);
    if (!(p.z + p.vz * t - 0.5 * C.G * t * t > 0.25)) return false;
    return Math.abs(w.x) < 3.8 && w.z > C.NET_H + 0.1;
  }
  /** C2 (colocar por destino): ventana de colocación del humano. Verdadera desde que sale el pase de un compañero hasta su toque
   *  (2º toque del equipo 0 por dar, no tras una colocación en salto), con la puerta de cada formato: 2v2 con g.mastery y g.aimSet
   *  (falso en demo, autopilot y 6v6), 6v6 con el humano (isHuman) dueño del 2º toque (g.jobs[0]). Pura, sin g.rng. Mientras está
   *  abierta, la dirección del humano es el destino de la colocación (g.setDirA, step) y main.js la pasa en ejes de la pista. */
  function setWin(g) { return setTurn(g) && (!!g.rot || g.aimSet); }
  /** C2: el 2º toque es del humano (setWin sin la opción «Colocación dirigida»: COLOCAR en el suelo coloca también con ella en No). */
  function setTurn(g) {
    if (g.mode !== 'rally' || g.ctrlOut) return false;
    var p = g.ctrl, ht = g.online && p ? p.team : 0;
    if (!p || p.team !== ht || !(g.touchTeam === ht && g.touches === 1 && g.lastPlayer !== p) || g.lastKind === 'set') return false;
    // (6v6: el 2º toque es suyo si se lo da el reparto o, siendo el colocador, si el balón le cae cerca o en la zona de ataque: humanOwns)
    if (g.rot) return !!VB.AI6 && isHuman(g, p) && (g.jobs[0] === p || (p.role === 'S' && VB.AI6.humanOwns(g, 0, p, g.pr1, 1, g.lastPlayer)));
    return !!g.mastery;
  }
  /** C2: sector (0 ↑ hacia la red, 1 ↗, 2 →, 3 ↘, 4 ↓, 5 ↙, 6 ←, 7 ↖) de un ángulo en grados. */
  function setSec(a) { return ((Math.round(a / 45) % 8) + 8) % 8; }
  /** C2: COLOCAR en el suelo coloca (no salta) si la ventana está abierta y el balón se juega desde el suelo (su punto más cercano
   *  no queda por encima del alcance de pie: con el balón alto en la red COLOCAR sigue saltando, «doble pulsación = salta y coloca»). */
  var _wG = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  function groundSet(g, p) {
    if (p !== g.ctrl || p.z !== 0 || p.vz !== 0 || !setTurn(g)) return false;
    var w = hitWindow(g, p, _wG);
    return !w.attack && w.dz < 2.7 - w.zc;
  }
  /** C2: vista previa de la colocación del humano (ventana setWin): el destino sin error con la dirección de ahora (g.setDirA),
   *  calculado desde el punto de toque previsto. Escribe en out {x, y (mundo), tempo ('quick'|'lane'|'high'), ok (el atacante llega
   *  a la batida a tiempo; solo informativo), to (el atacante), bx, by (su batida)} o devuelve null. 2v2 en el aire con colocación en
   *  salto posible: el destino de la colocación en salto (al compañero, tensa). 6v6: VB.AI6.previewSet. Pura, sin g.rng. */
  var _sp = { x: 0, y: 0, tempo: '', ok: true, to: null, bx: 0, by: 0 }, _wPv = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  var _ps6 = { to: null, tempo: '', kind: '', d: 0, yl: 0, apex: 0 };
  var _jaP = { on: false, x: 0, y: 0, ax: 0, ay: 0, tempo: '', apex: 0, moved: false, bx: 0, by: 0, ok: true };
  function setPreview(g, out) {
    if (!setWin(g)) return null;
    var p = g.ctrl, b = g.ball, sd = side(p.team), cs = g.cs || 1, M = MASTERY.set, at = null, D, apex, tempo;
    out = out || _sp;
    var w = hitWindow(g, p, _wPv), tc = Math.max(0, w.t), z0 = w.reach ? w.z : b.z, sx = w.reach ? w.x : p.x, sy = w.reach ? w.y : p.y;
    if (g.rot) {
      var r = VB.AI6.previewSet(g, p, _ps6);
      at = r.to; tempo = r.kind; D = r.d; apex = r.apex;
      out.x = sd * r.d; out.y = clamp(sd * r.yl, -4.2, 4.2);
    } else if (p.z > 0.05 && jsetReady(g)) {
      at = other(g, p); tempo = 'quick'; D = JSET.tx; apex = Math.max(JSET.minApex, b.z + JSET.rise);
      out.x = sd * JSET.tx; out.y = clamp(at.y, -JSET.mate, JSET.mate);
      var ja = g.jsetAim ? jsetAimInfo(g, _jaP) : null; // (salto con impulso: diana de colocación movida = el destino)
      if (ja && ja.moved) { tempo = ja.tempo; D = sd * ja.x / cs; apex = ja.apex; out.x = ja.x; out.y = ja.y; }
    } else {
      var st = setAim(g, p, true, _st, sx, sy);
      at = other(g, p); tempo = st.tempo; D = st.x / cs; apex = st.apex;
      out.x = sd * st.x; out.y = st.y;
    }
    out.tempo = tempo; out.to = at;
    out.bx = sd * Math.min((D + (M.atkAp[tempo] || M.atkAp.high)) * cs, M.atkMaxX * cs); out.by = out.y;
    if (!g.rot && at) { // 2v2: la batida, a >= atkSep m del toque (si no, el balón que sale de las manos le pasa al alcance y lo juega ya)
      var bdx = out.bx - sx, bdy = out.by - sy, bdl = Math.hypot(bdx, bdy), R = M.atkSep * cs;
      if (bdl < R) {
        if (bdl < 0.3 * cs) { bdx = 0; bdy = at.y >= sy ? 1 : -1; bdl = 1; } // (la rápida, delante del colocador: al lado del compañero)
        out.bx = sx + bdx / bdl * R; out.by = clamp(sy + bdy / bdl * R, -(g.HW - 0.3 * cs), g.HW - 0.3 * cs);
      }
    }
    var fl = Math.sqrt(2 * Math.max(0, apex - z0) / C.G) + Math.sqrt(2 * Math.max(0, apex - 3) / C.G);
    out.ok = !at || !(VB.AI && VB.AI.timeTo) || VB.AI.timeTo(g, at, out.bx, out.by) <= tc + fl - 0.25;
    return out;
  }
  /** ¿Toca atacar al equipo t en su siguiente toque? Tras su 2º toque o tras una colocación en salto en el 1r. */
  function atkPhase(g, t) { return g.touchTeam === t && (g.touches === 2 || (g.touches === 1 && g.lastKind === 'set')); }

  /* ---------- Equipos de N jugadores (sprint 1 del 6v6, notes/diseno-6v6-carrera.md §1.1) ----------
   * En 2v2 todo da exactamente lo de siempre: other() es «el compañero», mates() = [el compañero], nearestMate() = él.
   * Ninguna de estas funciones gasta g.rng ni asigna memoria por frame (mates() devuelve un array cacheado). */
  /** El compañero (2v2). Con más jugadores: el compañero en pista más cercano a p (vale de reserva donde la lógica de 2v2
   *  necesite «el otro»; la IA de 6v6 decide con sus propias tablas). */
  function other(g, p) {
    var t = g.teams[p.team];
    if (t.length === 2) return t[0] === p ? t[1] : t[0];
    return nearestMate(g, p, p.x, p.y);
  }
  /** Compañeros en pista de p (sin p), array cacheado en g._mates[team][idx]: no modificar. refreshTeams lo rehace. */
  function mates(g, p) { var m = g._mates && g._mates[p.team]; return (m && m[p.idx]) || EMPTY; }
  var EMPTY = [];
  /** Compañero en pista de p más cercano al punto (x, y) (por defecto, a p). null si juega solo. */
  function nearestMate(g, p, x, y) {
    var m = mates(g, p), best = null, bd = 1e9;
    if (x == null) { x = p.x; y = p.y; }
    for (var i = 0; i < m.length; i++) { var q = m[i], d = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  /** Nivel (0-3) más alto de la insignia id entre los compañeros de p (Líder). En 2v2, la del compañero. */
  function mateBadge(g, p, id) {
    var m = mates(g, p), lv = 0;
    for (var i = 0; i < m.length; i++) { var l = bl(m[i], id); if (l > lv) lv = l; }
    return lv;
  }
  /** Rehace las cachés de equipo tras crear el partido o cambiar quién está en pista (líbero, cambios: sprint 2):
   *  g.players, p.idx, g._mates y, en 6v6, p.zone/p.front desde g.rot. */
  function refreshTeams(g) {
    g.players = g.teams[0].concat(g.teams[1]);
    g._mates = [[], []];
    for (var t = 0; t < 2; t++) {
      var tm = g.teams[t];
      for (var i = 0; i < tm.length; i++) {
        tm[i].idx = i;
        var m = []; for (var j = 0; j < tm.length; j++) if (j !== i) m.push(tm[j]);
        g._mates[t].push(m);
      }
    }
    refreshZones(g);
  }
  /** Zonas reglamentarias (d = metros desde la red, yl = lateral LOCAL del equipo, + = su derecha). Índice = zona (1-6). */
  var ZONE = [null, { d: 7.5, yl: 3 }, { d: 1.5, yl: 3 }, { d: 1.5, yl: 0 }, { d: 1.5, yl: -3 }, { d: 7.5, yl: -3 }, { d: 7.5, yl: 0 }];
  /** Zona (1-6) de p según g.rot; 0 en 2v2 (sin rotación). */
  function zoneOf(g, p) { return g.rot ? (p.bench ? 0 : p.zone) : 0; }
  /** ¿Delantero (zona 2, 3 o 4)? En 2v2, false. */
  function isFront(g, p) { var z = zoneOf(g, p); return z >= 2 && z <= 4; }
  /** Punto base de la zona z del equipo t en coordenadas de la sim: x = side(t)·d, y = side(t)·yl (el equipo 0 mira a −x y su
   *  derecha es +y; el 1 mira a +x y su derecha es −y). out = {x, y} reutilizable (opcional). */
  function zonePos(t, z, out) {
    var Z = ZONE[z] || ZONE[6], sd = side(t); out = out || {};
    out.x = sd * Z.d; out.y = sd * Z.yl; return out;
  }
  function refreshZones(g) {
    if (!g.rot) return;
    for (var t = 0; t < 2; t++) for (var z = 0; z < g.rot[t].length; z++) {
      var p = g.rot[t][z]; p.zone = z + 1; p.front = z >= 1 && z <= 3;
      if (g.liberoFor && p === g.liberoFor[t]) { var l = g.libero[t]; l.zone = z + 1; l.front = p.front; } // el líbero ocupa su zona
    }
  }
  /** Rota el equipo t (6v6): el de zona 2 pasa a zona 1 y saca. */
  function rotate(g, t) {
    if (!g.rot) return;
    g.rot[t].push(g.rot[t].shift()); refreshZones(g);
  }
  /** Sacador del equipo t: rot[t][0] en 6v6; teams[t][serverIdx[t]] en 2v2. */
  function serverOf(g, t) { return g.rot ? g.rot[t][0] : g.teams[t][g.serverIdx[t]]; }
  /** Equipo de 6 (6v6) con la alineación 5-1 por defecto en orden de rotación desde zona 1: S, OH1, MB1, OPP, OH2, MB2.
   *  Dorsales 1-6 (equipo 0) y 7-12 (equipo 1); ids team·16 + idx. */
  var ROLES6 = ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'];
  function mkTeam6(team) {
    var a = [];
    for (var i = 0; i < 6; i++) { var p = mkPlayer(team, team * 6 + i + 1, i, 16); p.role = ROLES6[i]; mk6Fields(p); a.push(p); }
    return a;
  }
  /** Campos solo de 6v6 (no se añaden en 2v2: el objeto del 2v2 no cambia). fx/fy = sitio de la formación de recepción;
   *  toX = x del despegue del último salto (falta de ataque de zaguero); bench = en el banquillo (líbero o central sustituido). */
  function mk6Fields(p) { p.fx = 0.5; p.fx = 0; p.fy = 0.5; p.fy = 0; p.toX = 0.5; p.toX = 9; p.bench = false; return p; }
  /** Líbero del equipo t (6v6): dorsal 13 / 14, id team·16 + 6, rol 'L'. Empieza en el banquillo (applyLibero lo mete). */
  function mkLibero(team) { var p = mk6Fields(mkPlayer(team, 13 + team, 6, 16)); p.role = 'L'; p.bench = true; return p; }
  /** Jugador en pista en la zona z (1-6) del equipo t: el de la rotación o, si es el central sustituido, el líbero. */
  function onCourt(g, t, z) { var q = g.rot[t][z - 1]; return q === g.liberoFor[t] ? g.libero[t] : q; }
  /** Líbero (reglas FIVB 19.3): entra por el central que está en zaguero (zonas 5, 6, 1), salvo cuando ese central va a sacar
   *  (el líbero no saca: saca el central y el líbero vuelve a entrar al perder el saque). Se llama al preparar cada saque
   *  (setupServe, ya rotado). Cambia la referencia en teams[t] (mismo índice: el líbero ocupa el hueco del central) y deja
   *  bench = true al que sale. Evento {type:'libero', team, inP, outP} por cada entrada o salida. No cuenta como cambio.
   *  Humano central (control 'one', g.ctrlBase): cuando el líbero entra por él, el humano pasa a llevar al líbero (g.ctrl) y sigue
   *  jugando (recibe y defiende; no saca, no bloquea ni ataca por arriba: reglas del líbero); cuando su central vuelve, lo recupera.
   *  Sin eventos switch: el evento libero lleva human: true cuando le afecta. */
  function applyLibero(g) {
    if (!g.rot) return;
    var ch = false;
    for (var t = 0; t < 2; t++) {
      var lib = g.libero[t]; if (!lib) continue;
      var want = null;
      for (var k = 0; k < 3; k++) { var z = [0, 4, 5][k], q = g.rot[t][z]; if (q.role === 'MB') want = (z === 0 && g.serving === t) ? null : q; }
      var cur = g.liberoFor[t];
      if (want === cur) continue;
      var tm = g.teams[t], hb = t === 0 && g.ctrlMode === 'one' ? g.ctrlBase : null;
      if (cur) {
        tm[tm.indexOf(lib)] = cur; cur.bench = false; lib.bench = true; g.liberoFor[t] = null; cur.x = lib.x; cur.y = lib.y;
        if (cur === hb) { g.ctrl = cur; endSwing(g); }
        emit(g, { type: 'libero', team: t, inP: cur, outP: lib, human: cur === hb });
      }
      if (want) {
        tm[tm.indexOf(want)] = lib; lib.bench = false; want.bench = true; g.liberoFor[t] = want; lib.x = want.x; lib.y = want.y;
        if (want === hb) { g.ctrl = lib; endSwing(g); }
        emit(g, { type: 'libero', team: t, inP: lib, outP: want, human: want === hb });
      }
      ch = true;
    }
    if (ch) refreshTeams(g);
  }
  /** Falta de posición (reglas 7.4-7.5) en el momento del saque: pares delante/detrás (2-1, 3-6, 4-5: el zaguero más lejos de
   *  la red) y derecha/izquierda en cada fila (4-3-2 y 5-6-1, lateral LOCAL creciente). El sacador no cuenta (7.4.1). Devuelve cuántos
   *  pares están mal (0 = legal).
   *  CON LOS PIES (17-nov-2026, Ferran: «lo que debería de contar son los pies»; regla 7.4.3): cada jugador tiene dos pies (feet6):
   *  a ±FOOT_W m a lo ancho de su centro y, si se mueve, con la zancada abierta FOOT_STRIDE × (velocidad / FOOT_V) en la dirección de
   *  la marcha (un pie delante, otro detrás); cada pie es un disco de radio FOOT_R. 7.4.3.1: el delantero tiene que tener al menos parte
   *  de un pie más cerca de la red que LOS DOS pies de su zaguero; 7.4.3.2: el del lado, parte de un pie más cerca de su línea lateral
   *  que los dos pies del central de su fila. Quietos (pies simétricos) da lo mismo que comparar centros; moviéndose, cuenta la zancada.
   *  Sin g.rng ni memoria por llamada (pies en _ft). */
  var OVL_FB = [[2, 1], [3, 6], [4, 5]], OVL_LR = [[4, 3], [3, 2], [5, 6], [6, 1]];
  var FOOT_W = 0.17, FOOT_R = 0.12, FOOT_STRIDE = 0.45, FOOT_V = 5;
  var _ftA = { d0: 0, d1: 0, l0: 0, l1: 0 }, _ftB = { d0: 0, d1: 0, l0: 0, l1: 0 };
  /** Pies del jugador p del equipo de lado sd en coordenadas LOCALES: d (distancia a la red) y l (lateral local): extremos de los dos
   *  pies con su radio. out = {d0: lo más cerca de la red, d1: lo más lejos, l0: lo más a la izquierda (l menor), l1: lo más a la derecha}. */
  function feet6(p, sd, out) {
    var d = p.x * sd, l = p.y * sd, vd = (p.vx || 0) * sd, vl = (p.vy || 0) * sd, sp = Math.sqrt(vd * vd + vl * vl);
    var k = sp > 0.05 ? FOOT_STRIDE * 0.5 * Math.min(1, sp / FOOT_V) / sp : 0, sx = vd * k, sy = vl * k;   // media zancada en la marcha
    // pie izquierdo (l − FOOT_W) adelantado en la marcha y el derecho atrasado (el orden da igual: se miran los extremos de los dos)
    var aD = d + sx, aL = l - FOOT_W + sy, bD = d - sx, bL = l + FOOT_W - sy;
    out.d0 = Math.min(aD, bD) - FOOT_R; out.d1 = Math.max(aD, bD) + FOOT_R;
    out.l0 = Math.min(aL, bL) - FOOT_R; out.l1 = Math.max(aL, bL) + FOOT_R;
    return out;
  }
  /** ¿El par delante/detrás (front, back) está mal? 7.4.3.1: el delantero, parte de un pie más cerca de la red que los dos del zaguero. */
  function ovlFB(front, back, sd) { feet6(front, sd, _ftA); feet6(back, sd, _ftB); return !(_ftA.d0 < _ftB.d0); }
  /** ¿El par lateral (izquierda a, derecha b; uno de los dos es el central, OVL_LR) está mal? 7.4.3.2: el jugador del lado, parte de un pie
   *  más cerca de SU línea lateral que los dos pies del central. [4,3] y [5,6]: el del lado es a (izquierda); [3,2] y [6,1]: es b (derecha). */
  function ovlLR(a, b, sd, outerLeft) {
    feet6(a, sd, _ftA); feet6(b, sd, _ftB);
    return outerLeft ? !(_ftA.l0 < _ftB.l0) : !(_ftB.l1 > _ftA.l1);
  }
  function overlapCount(g, t) {
    if (!g.rot) return 0;
    var sd = side(t), sv = g.mode === 'serve' || g.lastKind === 'serve' ? g.server : null, n = 0, i, a, b;
    for (i = 0; i < 3; i++) { a = onCourt(g, t, OVL_FB[i][0]); b = onCourt(g, t, OVL_FB[i][1]); if (a !== sv && b !== sv && ovlFB(a, b, sd)) n++; }
    for (i = 0; i < 4; i++) { a = onCourt(g, t, OVL_LR[i][0]); b = onCourt(g, t, OVL_LR[i][1]); if (a !== sv && b !== sv && ovlLR(a, b, sd, i === 0 || i === 2)) n++; }
    return n;
  }
  /** Pares solapados (como overlapCount) en los que está el jugador p del equipo t: 0 = p está bien colocado (la falta, si la hay,
   *  es de otros). Para pitar la falta de posición solo cuando la comete el humano. */
  function overlapOf(g, t, p) {
    if (!g.rot || !p) return 0;
    var sd = side(t), sv = g.mode === 'serve' || g.lastKind === 'serve' ? g.server : null, n = 0, i, a, b;
    if (p === sv) return 0;
    for (i = 0; i < 3; i++) { a = onCourt(g, t, OVL_FB[i][0]); b = onCourt(g, t, OVL_FB[i][1]); if ((a === p || b === p) && a !== sv && b !== sv && ovlFB(a, b, sd)) n++; }
    for (i = 0; i < 4; i++) { a = onCourt(g, t, OVL_LR[i][0]); b = onCourt(g, t, OVL_LR[i][1]); if ((a === p || b === p) && a !== sv && b !== sv && ovlLR(a, b, sd, i === 0 || i === 2)) n++; }
    return n;
  }
  /** Compañero con el que está solapado el jugador p del equipo t (el del PRIMER par mal, en el orden de overlapOf: delante/detrás
   *  y luego laterales), o null. Para que el 2º árbitro señale a los dos jugadores tras la seña de posición (Guidelines 2025, 7.7).
   *  Solo lectura (como overlapOf: sin g.rng ni estado de la partida). */
  function overlapMate(g, t, p) {
    if (!g.rot || !p) return null;
    var sd = side(t), sv = g.mode === 'serve' || g.lastKind === 'serve' ? g.server : null, i, a, b;
    if (p === sv) return null;
    for (i = 0; i < 3; i++) { a = onCourt(g, t, OVL_FB[i][0]); b = onCourt(g, t, OVL_FB[i][1]); if ((a === p || b === p) && a !== sv && b !== sv && ovlFB(a, b, sd)) return a === p ? b : a; }
    for (i = 0; i < 4; i++) { a = onCourt(g, t, OVL_LR[i][0]); b = onCourt(g, t, OVL_LR[i][1]); if ((a === p || b === p) && a !== sv && b !== sv && ovlLR(a, b, sd, i === 0 || i === 2)) return a === p ? b : a; }
    return null;
  }
  /** Afinado del 6v6 (solo con g.rot; el 2v2 no lo lee). stuff: multiplicador de la prob. de bloqueo directo por contacto;
   *  dig: multiplicador de la prob. de defender un remate (digOk). */
  var SIX = VB.SIX = { stuff: 0.6, dig: 0.75 };
  function isHuman(g, p) { if (g.online) return humSlot(g, p) >= 0; return !g.demo && !g.autopilot && p.team === 0 && p === g.ctrl; }
  // Representación de campos en V8 (integración, ronda 2 de verificación): un campo numérico que nace entero (Smi: 0, -1, 99)
  // y luego recibe un double obliga a V8 a generalizar el mapa del objeto y deprecar todo su árbol de transiciones; eso,
  // en mitad del peloteo (primer bloqueo, primera plancha…), desoptimizaba de golpe el código caliente de TODOS los módulos
  // (notes/camera_input.md, ronda 2). Pasar cada campo entero por un double al crear el objeto hace esa generalización aquí,
  // al crear el partido, y una sola vez por sitio. La semántica no cambia (mismo valor; simtest da la misma salida).
  function dblFields(o) { for (var k in o) { var v = o[k]; if (typeof v === 'number' && (v | 0) === v) { o[k] = 0.5; o[k] = v; } } return o; }
  function emit(g, e) { e.t = g.time; dblFields(e); g.events.push(e); if (g.subsOn) subEv(g, e); return e; }
  function rnd(g, a) { return (g.rng() * 2 - 1) * a; }
  function gauss(g) { return (g.rng() + g.rng() + g.rng() + g.rng() - 2) * 1.732; } // ~N(0,1)

  // ---------- Calidad por timing ----------
  /** te = desfase (s) entre el contacto y el momento ideal (<0 pronto, >0 tarde) -> 0..1 */
  function timingQ(te) {
    var a = Math.abs(te || 0);
    if (a <= C.W_PERFECT) return 1 - 0.1 * a / C.W_PERFECT;
    if (a <= C.W_GOOD) return 0.9 - 0.4 * (a - C.W_PERFECT) / (C.W_GOOD - C.W_PERFECT);
    return Math.max(0.05, 0.5 - 0.45 * (a - C.W_GOOD) / 0.2);
  }
  function gradeOf(q) { return q >= 0.78 ? 'perfect' : q >= 0.45 ? 'good' : 'poor'; }
  /** Playa: prob. de que se piten dobles en una colocación de dedos del HUMANO (hit). te = desfase ya escalado por la ventana
   *  (atributos, insignias, ×JSET.win en salto), grade = nota del toque. 'perfect'/'good' nunca, ni |te| <= dblA0 (= C.W_GOOD).
   *  'poor': rampa lineal con |te| de BEACH.dblA0 (p dblP0) a BEACH.dblA1 (p dblP1) y plana después; en salto ×dblJump (tope dblMax). */
  function dblSetP(te, grade, jset) {
    var a = Math.abs(te || 0);
    if (grade !== 'poor' || a <= BEACH.dblA0) return 0; // mal toque por la distancia, no por el timing: no se pita
    var k = clamp((a - BEACH.dblA0) / (BEACH.dblA1 - BEACH.dblA0), 0, 1);
    var pr = BEACH.dblP0 + (BEACH.dblP1 - BEACH.dblP0) * k;
    return Math.min(BEACH.dblMax, jset ? pr * BEACH.dblJump : pr);
  }
  /** Dispersión (m, radio) del remate del HUMANO según la calidad q: perfecto (q >= 0,9) casi exacto (<= 0,1 m),
   *  0,78 ~0,28, 0,5 ~0,74, 0,2 ~1,3. Monótona decreciente. */
  function spikeSpread(q) {
    q = clamp(q || 0, 0, 1);
    var s = 1.7 * Math.pow(1 - q, 1.2);
    return q >= 0.9 ? Math.min(s, 1 - q) : s;
  }
  /** Dispersión (m, radio) del saque dirigido del HUMANO según la calidad q del timing. En salto (jump): perfecto casi
   *  exacto (q >= 0,9: <= 1 − q), 0,78 ~0,32, 0,5 ~0,87, 0,2 ~1,53. Flotante: siempre algo más (0,1 de base) con buen
   *  timing y algo menos con mal timing (0,78 ~0,36, 0,5 ~0,75, 0,2 ~1,27); además sigue bailando en el aire (wobA). */
  function serveSpread(q, jump) {
    q = clamp(q || 0, 0, 1);
    var u = Math.pow(1 - q, 1.2);
    if (jump) { var s = 2.0 * u; return q >= 0.9 ? Math.min(s, 1 - q) : s; }
    var f = 0.1 + 1.5 * u; return q >= 0.9 ? Math.min(f, 0.1 + (1 - q)) : f;
  }

  // ---------- Física del balón ----------
  function gEff(b) { return C.G + (b.dip || 0); }
  var _pr = { x: 0, y: 0, z: 0, t: 0 };
  /** Dónde cruza el balón la altura zt bajando. Escribe en `out` (sin asignaciones).
   *  Incluye el efecto liftado (b.dip); no incluye el baile del flotante (imprevisible). */
  function predict(g, zt, out) {
    var b = g.ball, x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, t = 0, dt = 1 / 100, G = gEff(b);
    for (var i = 0; i < 500; i++) {
      if (vz < 0 && z <= zt) break; if (z <= C.BR && vz < 0) break;
      vz -= G * dt; x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
    }
    out = out || _pr; out.x = x; out.y = y; out.z = z; out.t = t; return out;
  }
  /** Punto de caída al suelo (z = radio del balón). Útil para el aro de caída. */
  function predictLanding(g, out) { return predict(g, C.BR, out); }

  function launchApex(p, tx, ty, tz, apex) {
    var G = C.G;
    apex = Math.max(apex, p.z + 0.3, tz + 0.3);
    var vz = Math.sqrt(2 * G * (apex - p.z)), T = vz / G + Math.sqrt(2 * (apex - tz) / G);
    return [(tx - p.x) / T, (ty - p.y) / T, vz];
  }
  /** x del balón lanzado desde p con v cuando BAJA a la altura z (sin red ni rebotes). */
  function dropX(p, v, z) { var t = (v[2] + Math.sqrt(Math.max(0, v[2] * v[2] + 2 * C.G * (p.z - z)))) / C.G; return p.x + v[0] * t; }
  function clearsNet(p, v, G) {
    G = G || C.G;
    if (!v[0]) return true; var tn = -p.x / v[0]; if (tn <= 0) return true;
    return p.z + v[2] * tn - 0.5 * G * tn * tn > C.NET_H + 0.3;
  }
  function launchSafe(p, tx, ty, tz, apex) { // globo que pasa la red
    var v; for (var i = 0; i < 25; i++) { v = launchApex(p, tx, ty, tz, apex); if (clearsNet(p, v)) break; apex += 0.25; }
    return v;
  }
  /** Más velocidad con la MISMA trayectoria (Cañón, Manos de seda, Bombardero): la gravedad efectiva sube con (v'/v)², así el
   *  remate/saque que launchDirect frena para pasar la red sale de verdad más rápido (mismo dibujo en el aire, en menos tiempo). */
  function boostDip(dip, v0, v1) { var k = v1 / v0; return (C.G + dip) * k * k - C.G; }
  function launchDirect(p, tx, ty, tz, speed, G) { // remate: tenso, se frena lo justo para pasar la red
    G = G || C.G;
    var T = Math.max(0.25, Math.hypot(tx - p.x, ty - p.y) / speed), v;
    for (var i = 0; i < 30; i++) {
      v = [(tx - p.x) / T, (ty - p.y) / T, (tz - p.z + 0.5 * G * T * T) / T];
      if (clearsNet(p, v, G)) break; T *= 1.08;
    }
    return v;
  }

  /** 6v6, remate de la IA (17-nov-2026, Ferran: «en Hiperliga 2 no hay apenas remates, todo son rosquitas»): launchDirect frena el
   *  balón lo justo para pasar la red, y con la diana cerca de la red (openSpot a 2,2 m) y el contacto a ~1,6 m de ella el remate salía
   *  a < 8 m/s en el 40 % de los casos, también en la élite. Si se queda por debajo de DEEP_K de la velocidad pedida, la diana se alarga
   *  en la misma línea (pasos de DEEP_STEP m, hasta DEEP_MAX m de la red): un remate fuerte va al fondo. Sin azar. */
  var DEEP_K = 0.8, DEEP_STEP = 0.7, DEEP_MAX = 6.4;
  function deepSpike(o, tx, ty, spd, G, cs) {
    var v = launchDirect(o, tx, ty, 0, spd, G), dx = tx - o.x, dy = ty - o.y, L = Math.hypot(dx, dy) || 1, lim = DEEP_MAX * (cs || 1);
    for (var k = 0; k < 8 && Math.hypot(v[0], v[1]) < spd * DEEP_K; k++) {
      var f = (L + DEEP_STEP * (k + 1)) / L, nx = o.x + dx * f;
      if (Math.abs(nx) > lim) break;
      v = launchDirect(o, nx, o.y + dy * f, 0, spd, G);
    }
    return v;
  }
  function canReach(g, p) {
    if (g.fl && flNo(g, p, true)) return false; // fl
    var b = g.ball;
    if (g.mode === 'serve') return g.serveState === 'toss' && p === g.server && serveReach(g, p);
    if (b.held || g.mode !== 'rally' || p.down > 0) return false;
    if (g.lastKind === 'serve' && g.touchTeam === p.team) return false; // no se toca el propio saque
    if (g.touchTeam === p.team && g.lastPlayer === p) return false;    // ni dos toques seguidos
    var d = Math.hypot(b.x - p.x, b.y - p.y), rz = b.z - p.z;
    if (d > reachOf(g, p) || rz < 0.05 || rz > 2.7) return false;
    // penetración en el espacio contrario: solo se juega el balón que está (casi del todo) en el propio campo
    // (el bloqueo va aparte, en checkBlock)
    return b.x * side(p.team) > -C.BR * 0.5;
  }
  /** ¿Puede llegar lanzándose en plancha? (solo en el suelo, balón bajo) */
  function canDive(g, p) {
    if (g.fl && flNo(g, p, true)) return false; // fl
    var b = g.ball;
    if (b.held || g.mode !== 'rally' || p.down > 0 || p.z > 0 || p.vz > 0) return false;
    if (g.lastKind === 'serve' && g.touchTeam === p.team) return false;
    if (g.touchTeam === p.team && g.lastPlayer === p) return false;
    var d = Math.hypot(b.x - p.x, b.y - p.y), rl = bl(p, 'red'), dr = C.REACH + diveROf(g, p); // (IA: plancha según su Velocidad, EFFORT)
    if (d > (rl ? dr * BADGE.redR[rl] : dr) || b.z < 0.08 || b.z > 1.3) return false;
    return b.x * side(p.team) > 0.2;
  }
  function serveReach(g, p) {
    var b = g.ball, sd = side(p.team);
    var dx = b.x - (p.x - sd * 0.3), dy = b.y - p.y, dz = b.z - (p.z + C.ZC[g.serveJump ? 'jserve' : 'fserve']);
    return dx * dx + dy * dy + dz * dz < 0.85 * 0.85;
  }

  /** Tipo de toque que daría ahora el jugador p (para el timing y la UI). */
  function predictKind(g, p) {
    if (g.mode === 'serve') return g.serveJump ? 'jserve' : 'fserve';
    var count = g.touchTeam === p.team ? g.touches + 1 : 1;
    if ((p.z > 0.25 || p.vz > 0.5) && Math.abs(g.ball.x) < 3.8) return 'spike';
    if (count >= 3) return 'free';
    return count === 1 ? 'pass' : 'set';
  }

  /* Ventana de golpeo: busca en la trayectoria del balón (hacia atrás hasta el
   * último contacto y hacia delante 1.2 s) el instante en que está más cerca
   * del punto de contacto ideal del jugador (pies + ZC[kind], con su salto).
   * out = { t: s hasta el ideal (<0 = ya pasó), d: distancia horizontal en el
   *         ideal, dz: error vertical en el ideal, reach: alcanzable en el ideal,
   *         kind, zc, x,y,z: punto ideal del balón, active: gesto humano en curso,
   *         canReach: alcanzable ahora } */
  var _w = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  var _wPlant = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN }; // (E1: colocador plantado)
  function hitWindow(g, p, out) {
    p = p || g.ctrl; out = out || _w;
    var b = g.ball, kind = predictKind(g, p), zc = C.ZC[kind], G = gEff(b), PG = C.G;
    var sd = side(p.team), offx = g.mode === 'serve' ? -sd * 0.3 : 0;
    var air = p.z > 0 || p.vz > 0;
    // lanzamiento del saque: el contacto válido es con el balón BAJANDO (el cruce de subida no cuenta)
    var tossUp = g.mode === 'serve' && g.serveState === 'toss';
    var tb = -Math.min(0.35, Math.max(0, g.time - g.lastTouchT));
    var best = 1e9, bt = 0, bd = 9, bdz = 9, bx = b.x, by = b.y, bz = b.z, st = 1 / 120;
    for (var t = tb; t <= 1.2; t += st) {
      if (tossUp && b.vz - G * t > 0) continue;
      var x = b.x + b.vx * t, y = b.y + b.vy * t, z = b.z + b.vz * t - 0.5 * G * t * t;
      if (t > 0 && z < C.BR) break;
      var pz = air ? Math.max(0, p.z + p.vz * t - 0.5 * PG * t * t) : p.z;
      var dx, dy, dz = z - (pz + zc);
      if (air && p.dj) { dx = x - (p.x + p.jvx * t) - offx; dy = y - (p.y + p.jvy * t); } // salto con impulso: con la deriva del salto
      else { dx = x - p.x - offx; dy = y - p.y; }
      var D = 0.6 * (dx * dx + dy * dy) + dz * dz;
      if (D < best) { best = D; bt = t; bd = Math.sqrt(dx * dx + dy * dy); bdz = dz; bx = x; by = y; bz = z; }
      if (t > 0.3 && D > best + 4) break; // ya se aleja mucho: no hace falta seguir
    }
    out.t = bt; out.d = bd; out.dz = bdz; out.kind = kind; out.zc = zc; out.x = bx; out.y = by; out.z = bz;
    out.press = bt - C.WINDUP; // s hasta el momento ideal de PULSAR (0 = pulsa ya: 'perfect')
    out.reach = g.mode === 'serve' ? (bd < 0.85 && Math.abs(bdz) < 0.85) : (bd <= reachOf(g, p) && bdz > -zc + 0.05 && bdz < 2.7 - zc);
    out.active = g.hitBuf > 0 && g.swingLive; out.canReach = canReach(g, p);
    // ¿toca atacar? tiempo hasta el despegue ideal (para la UI: "¡salta!") o NaN
    out.attack = false; out.jumpT = NaN;
    if (g.mode === 'rally' && !air && atkPhase(g, p.team) && g.jobs[p.team] === p &&
        Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5) {
      var jv = jumpV(p), hz = C.ZC.spike + jv * jv / (2 * C.G), vz0 = b.vz, disc = vz0 * vz0 - 2 * G * (hz - b.z);
      if (disc >= 0) { out.attack = true; out.jumpT = (vz0 + Math.sqrt(disc)) / G - jv / C.G; }
    }
    return out;
  }

  function attackTarget(p, aim, dd, k) { // k = g.cs (escala de la pista: 1 en el pabellón)
    var sd = side(p.team);
    var tx = -sd * dd, ty = -Math.sign(p.y || 0.1) * 1.6; // sin apuntar: diagonal
    // apuntando: la dirección es un "joystick" sobre el campo rival (centro a 5 m de la red): adelante = fondo,
    // atrás = corta, izquierda/derecha = hasta las líneas laterales (paralela o diagonal, ambas posibles)
    if (aim) { tx = -sd * 5 + aim[0] * 3.0; ty = aim[1] * 3.7; }
    return [-sd * clamp(-sd * tx * k, 1.4 * k, 8.3 * k), clamp(ty * k, -3.9 * k, 3.9 * k)];
  }

  /** Margen de defensa (s) de un remate: tiempo de vuelo hasta el bote menos lo que tarda el defensor más
   *  rápido del equipo dt en plantarse allí (VB.AI.timeTo: aterrizar, levantarse, correr). >0 = llega con
   *  tiempo; <0 = al hueco. Balón que no entra en el campo: margen alto (no hace falta defenderlo). */
  function digMargin(g, dt, o, v, G) {
    var disc = v[2] * v[2] + 2 * G * Math.max(0, o.z - C.BR), ft = (v[2] + Math.sqrt(disc)) / G;
    var lx = o.x + v[0] * ft, ly = o.y + v[1] * ft;
    g._digWho = null; // defensor previsto (el que llega antes): con atributos, el dado de defensa usa SU perfil
    if (Math.abs(lx) > g.HL + 0.3 || Math.abs(ly) > g.HW + 0.3 || lx * side(dt) <= 0) return 2;
    var AI = VB.AI, best = 9;
    for (var i = 0; i < g.teams[dt].length; i++) {
      var q = g.teams[dt][i];
      var tq = AI && AI.timeTo ? AI.timeTo(g, q, lx, ly) : Math.hypot(q.x - lx, q.y - ly) / C.SPEED;
      if (tq < best) { best = tq; g._digWho = q; }
    }
    return ft - best;
  }

  function fastInFor(g) {
    var b = g.ball; return Math.hypot(b.vx, b.vy, b.vz);
  }

  /** Golpeo: el tipo de toque lo decide el juego según contexto.
   *  te: desfase con el momento ideal (s). shot: '' | 'tip' | 'dive'.
   *  tgt: [x,y] destino explícito (IA) o null para usar aim. */
  /** Defensa contra el remate rival desde el aire (ver hit): BLK_ZONE = |x| máximo de la zona de bloqueo (checkBlock), BLK_AIRQ =
   *  factor de calidad del toque en el aire más atrás. */
  var BLK_ZONE = 1.1, BLK_AIRQ = 0.6;
  /** Plancha en el 1r toque: prob. de que el balón salga desviado (×ek), 17-nov-2026. La plancha de la IA contra un remate, saque o
   *  bloqueo pasa por el dado de contacto de EFFORT (effortFail, con la plancha como estirón diveS); contra un balón libre, una dejada
   *  o un pase (g.digK 0, sin dado de contacto) sigue con DIVE_FAIL, como el humano. */
  var DIVE_FAIL = 0.35;
  /** MODELO DE ESFUERZO de la IA (18-nov-2026, Ferran: «Siento que los jugadores son super rapidos y llegan a todos los balones
   *  siempre que quieren ir, si no llegan son porque la IA "dejan que caiga". Preferiría sentir que la IA lo intente y si no llegan
   *  es por sus stats»). Antes un dado (g.digOk) en el momento del remate/saque decidía si la defensa IA «la sacaba» y, si no,
   *  el defensor iba tarde y lento a propósito (beaten; 6v6 BEAT6). Ahora:
   *   - La IA SIEMPRE va a por el balón al 100 % de sus stats: arranca tras su reacción (react efectiva = reactMin + reactK·react,
   *     + spikeRead ante un remate rival), acelera en accT s hasta su velocidad máxima (×(1/ak.speed)^accPow: Velocidad alta arranca
   *     antes) y se tira en plancha si el balón queda al límite (alcance de la plancha según su Velocidad, diveROf). Si ni así llega,
   *     se tira igual (plancha fallida, «lo intenta») cuando el balón cae a menos de missR m más allá de su plancha y por debajo de
   *     missZ m de altura. Que llegue o no lo decide solo la física.
   *   - El azar va EN EL CONTACTO (effortFail, 1r toque de la IA contra un remate, saque o bloqueo): prob. de que no la controle
   *     = f0·(1 − fC·base)^fPow cómoda (sale disparada: a la grada o rebota al suelo, shankFar) + fS·s·(1 − fSk·base) estirada (s =
   *     estirón 0..1 de stretchOf; plancha = diveS; sale desviada cerca), hasta fMax. base = Defensa del perfil DEL QUE LA TOCA ×
   *     g.digK (dificultad del balón: potencia, colocación, 6v6, maestría; la calcula el que golpea). Saque: la parte cómoda es
   *     recvK·recvFail(g.recvRisk) con la Recepción del que la toca (y el estirón ×recvS); bloqueo directo: 1 − g.digK (prob. de
   *     salvarla, stuffK·(1 − calidad del bloqueo)).
   *   - La finta (E1) que engaña (hk 0xE11 < feintBeat, g.feintFool) es LECTURA tardía: +feintReact s de reacción y digK ×feintK.
   *  g.digOk queda siempre true (compatibilidad: online, herramientas).
   *  CALIBRADO (18-nov-2026) con tools/effortstat.js contra el código de antes (61ac1f9, tools/out/effort-base.json): side-out, toques
   *  por rally y % de remates que acaban en punto cerca de la base en 2v2, 6v6 y playa, CPU y bot; «Defensa fuera» no por encima de
   *  la base; y los atributos que se notan (equipo a 30 frente a 80 en Velocidad, Reacción, Defensa y Recepción: en 2v2 le hacen
   *  punto en ~76 % frente a ~27 % de los remates; en 6v6, ~47 % frente a ~36 %; antes 77/44 y 44/34). Las razones de cada número,
   *  a su lado; las tablas, en notes/sim.md («IA (lo que se ve)»).
   *  REVISIÓN (18-nov-2026): plancha fallida de reflejo (missReact) y solo a balones que botan dentro (missIn); rescate del compañero
   *  que tiene el balón al alcance (ai.js rescue); Velocidad sin contar tres veces (accPow, divePow, diveMax) y Defensa/Recepción con
   *  más peso (digAttr); contacto menos desviado (f0, fC); 6v6 y playa recalibrados; DIVE_FAIL de la IA en balones sin dado de contacto;
   *  dado de contacto también en el 2º toque de playa tras el bloqueo propio.
   *  AFINADO (18-nov-2026, 2ª ronda): la revisión llegaba a casi todo y el punto salía de la desviada. Ahora la lectura de cada balón rival
   *  varía (reactSd, defMin/defK/defQ; ai.js p.aiRk): unas veces llega cómoda y la defiende bien, otras no llega aunque corra a tope; la
   *  cobertura del toque de bloqueo propio arranca y lee como contra un remate (blkTouchIn); contacto que desvía menos lo asequible (f0, fC,
   *  diveS) y plancha que a veces sale buena (diveQ); 6v6 sin sacar de reflejo lo que pasa lejos antes de leerlo (preR). Ver notes/sim.md.
   *  REVISIÓN 2 del afinado (18-nov-2026): sin la cola lenta de la lectura (rkHi), nunca deja botar sin gesto un balón que le pasa al
   *  alcance antes de leerlo (preT, ai.js), contra el remate del humano arranca peor en vez de leer más tarde (humAcc) y más planchas
   *  fallidas visibles en 6v6 y playa (missR). */
  var EFFORT = VB.EFFORT = {
    accT: 0.12, accPow: 1,        // s de 0 a la velocidad máxima de la IA con Velocidad 50 (antes instantáneo); Velocidad 90 → ×0,87, 15 → ×1,18 (+ p.ak.accT)
                                  // (accPow 2 → 1 en la revisión: la Velocidad ya cuenta en la velocidad punta y en la plancha)
    reactMin: 0.1, reactK: 0.65,  // reacción efectiva: Fácil 0,30 · Normal 0,22 · Difícil 0,18 · Experto 0,14 s (antes 0,30/0,18/0,13/0,06; con
                                  // 0,06 + 0,8·react Experto llegaba a casi todo; revisión: con 0,08 + 0,7·react Experto y Difícil llegaban a casi
                                  // todos los remates del humano en 2v2 y playa, y el punto solo salía del dado de contacto). Desde el afinado, solo
                                  // fuera de la defensa (recepción, juego propio, colocarse): la defensa va con defMin/defK/defQ
    defMin: 0.08, defK: 0.6,      // AFINADO (18-nov, 2ª ronda): lectura de un balón rival en defensa (preLate), mediana defMin + defK·react + defQ·react²
    defQ: 1.2,                    // → Fácil 0,37 · Normal 0,23 · Difícil 0,18 · Experto 0,12 s (ronda anterior 0,30/0,22/0,18/0,14; ninguna más
                                  // rápida de media, con reactSd). defQ: el lento lee mucho peor; sin él Fácil sacaba demasiado (el bot medio le
                                  // hacía punto en el 64 % de sus remates, antes 75)
    reactSd: 0.4,                 // AFINADO (18-nov, 2ª ronda): la lectura de cada balón rival varía, como la reacción del humano (ai.js: ×lognormal
                                  // de σ reactSd por toque; media ×1,08). Con una reacción fija casi todo llegaba «justo» (en plancha o estirado: defensa
                                  // mala o desviada) y no había ni defensas cómodas ni balones que pasaban; con la variación unas veces lo lee pronto y
                                  // la defiende bien y otras tarde y no llega aunque corra a tope (2v2 CPU: defensas buenas 8 % → 14 %, base 12-16)
    rkHi: 1.45,                   // REVISIÓN 2 (18-nov): tope de la lectura lenta (aiRk ≤ ×rkHi; antes ×2,2 a +2σ): la cola lenta dejaba al defensor
                                  // quieto casi todo el vuelo (azar, no stats; Experto contra el bot: quieto en 15-28 % de los que caían sin tocar,
                                  // base ~0). Media ×1,02 (antes ×1,08)
    f0: 0.9, fC: 2.4, fPow: 1,    // fallo llegando cómoda: f0·(1 − fC·base)^fPow (∝ base: el remate bueno del humano, de digK bajo, falla mucho más
                                  // que el de la CPU, y la Defensa se nota). Afinado: con 0,8 / 1,4 el buen defensor desviaba balones asequibles
                                  // (CPU contra CPU: desviadas 13 % de los remates, base 6-9); con 0,6 Fácil controlaba demasiado
    fS: 0.4, fSk: 0.5,            // + estirada al límite: fS·s·(1 − fSk·base)
    diveS: 0.55,                  // la plancha cuenta como un estirón de diveS (0,8 en la ronda anterior: casi la mitad de las planchas que llegaban
                                  // salían desviadas; con 1,25 más aún)
    diveQ: 0.8,                   // plancha de la IA contra remate o bloqueo: tope de calidad 0,45 + diveQ × base (diveCapAI; 0 = siempre 'poor',
                                  // como el humano). Afinado: la plancha al límite es un toque difícil pero a veces bueno (con buen timing y un
                                  // balón asequible para su Defensa); en la playa, ~1/3 de las defensas buenas de la CPU son en plancha
    diveK: [1, 0.3], divePow: 2,  // alcance extra de la plancha de la IA: C.DIVE × diveK (2v2, 6v6) × min(diveMax, (p.ak.speed)^divePow)
    diveMax: 1.2,                 // (Velocidad 30 → ×0,83, 80 → ×1,2 tope). 6v6: con la plancha entera (2,15 m de alcance al instante) seis
                                  // defensores lo tocaban todo. Revisión: con ^4 y sin tope la Velocidad contaba tres veces (velocidad,
                                  // arrancada y plancha: Velocidad 100 → 1,55 m de plancha, el doble que el humano, que tiene C.DIVE fijo)
                                  // y la Defensa casi no se notaba
    fMax: 0.85,
    touchK: 0.5,                  // digK tras un toque de bloqueo (antes un dado de 0,08 + Defensa: ~25 % de desviadas). Afinado: 0,7 → 0,5, ahora
                                  // que la cobertura del toque de bloqueo arranca y lee como contra un remate (blkTouchIn); con 0,7 y fC 2,4 el
                                  // toque de bloqueo del humano casi nunca acababa en punto (Experto: 6 de 70, antes 24)
    stuffRead: 0.2,               // s de más para leer el rebote de un bloqueo directo (sorpresa: baja a 6-9 m/s pegado a la red)
    stuffK: 0.3,                  // bloqueo directo: prob. de que la cobertura la controle si llega, ×(1 − calidad del bloqueo) (antes
                                  // un dado previo de 0,2·(1 − calidad) la daba por salvada; simtest: >= 60 % de directos son punto)
    recvS: 0.5,                   // saque: el estirón pesa la mitad (con el estirón entero los aces del flotante subían ~40 %)
    recvK: 1,                     // saque: ×recvFail (con 0,6 había ~1/3 menos de aces y recepciones malas que antes)
    feintReact: 0.8, feintK: 0.3, // finta que engaña: reacción + s (la dejada tarda ~1 s: con menos no valía, simtest E1 b2), digK ×
    feintFail: 0.6,               // ...y si llega, prob. mínima de no controlarla (cómoda)
    shankFar: [0.35, 0.35],       // desviada por el balón (shank): prob. de que salga a la grada (contra remate, resto); si no, rebota y cae
                                  // en su campo (con 0,9 «Defensa fuera» pasaba al 11-17 % de los puntos en 2v2; ahora por debajo de la base)
    missR: [1.4, 1.5], missZ: 0.3,// plancha fallida: hasta missR m más allá de su plancha (2v2, 6v6; playa: beach.missR), con el balón por debajo
                                  // de missZ m. Revisión: en 6v6 (plancha recortada, diveK) y en la playa (pista grande) casi todos los remates que
                                  // no tocaba caían a 1,5-2,5 m de él en ~0,3 s y no hacía ningún gesto. Afinado: 2v2 0,6 → 1,4 (no cambia ningún
                                  // resultado; de los remates del bot medio que caen sin tocar, con intento —plancha o carrera de 1 m— 52 → 75 %)
                                  // Revisión 2: 6v6 1,0 → 1,5 y playa 1,2 → 1,7 (tampoco cambia resultados): defensor quieto en 6v6 de ~40 a ~25 %
                                  // de los que caen sin tocar
    preR: [0, 0.65],              // antes de leer un balón rival (since < reacción) solo saca de reflejo lo que le llega a preR × su alcance (2v2,
                                  // 6v6; playa: beach.preR; 0 = todo); lo de más lejos le pilla sin reaccionar (plancha fallida tardía). Afinado, 6v6:
                                  // el zaguero quieto que aún no había leído el remate lo sacaba igual si le pasaba al alcance (estirado: desviada)
    preT: 0.22,                   // REVISIÓN 2: ...y si el balón le pasa al alcance antes de leerlo, se estira cuando le falten < preT s para botar
                                  // (ai.js: nunca lo deja botar al alcance sin gesto)
    missReact: 0.18,              // ...es un reflejo: se tira tras min(reacción, missReact) s (revisión: en 6v6 y playa la reacción se comía el
                                  // vuelo del remate y el defensor se quedaba quieto viéndolo pasar a 1 m)
    missIn: 0.1,                  // ...y solo si el balón bota dentro de la pista + missIn m (antes se tiraba a por remates que se iban fuera)
    spikeRead: [0, 0.06],         // s de más para leer un REMATE rival (2v2, 6v6). 2v2: 0 (la pista es grande, ya cuesta llegar). 6v6: 0,06
                                  // (con 0,2, reacción + lectura se comían casi todo el vuelo de 0,5 s y el defensor parecía quieto; 0,04 en la revisión)
    perfK: 0.7,                   // 2v2 y playa: digK ×perfK del remate perfecto del humano (además del ×0,8 de siempre). Revisión: sin esto el
                                  // buen rematador apenas sacaba ventaja al medio contra Experto (antes el dado se la daba)
    digAttr: 3.5,                 // los atributos Defensa y Recepción pesan ×(1 + digAttr) en el contacto (sobre la diferencia con el perfil:
                                  // Defensa 20 → 80 mueve la base ±0,4 y no ±0,09). Revisión: la Velocidad lo decidía casi todo y la Defensa de
                                  // 20 a 80 solo movía ~4 puntos de cada 100 remates (antes ~9-16); con 1,5, ~6
    humRead: [0.02, 0.08],        // + s ante cualquier remate del humano (2v2 y playa, 6v6), además de perfRead si es perfecto. Afinado: con la lectura
                                  // variable y el contacto nuevo, sin esto la CPU le sacaba al bot medio ~6 puntos de cada 100 remates más que antes
    humAcc: [0.3, 0],             // + s de arrancada (accTOf) ante un remate del humano (2v2, 6v6; playa: beach.humAcc). Revisión 2: en 2v2 y playa la mayor
                                  // parte de humRead/perfRead pasa aquí (0,06/0,08 → 0,02/0,04): arranca antes y se le ve ir, pero acelera peor
    perfRead: [0.04, 0.1],        // + s si es un remate PERFECTO del humano (2v2 y playa, 6v6): el buen golpe se lee tarde (antes iba en el
                                  // dado). Ronda anterior 0,05 en 2v2 y playa (el escenario 6 de tools/fluidtest iba justo en el suavizado del balón)
    // 6v6 (g.rot): con 6 en el campo el zaguero está a ~2 m del bote (en 2v2, ~3,5-4,5) y casi todo se alcanzaba: arranca peor (accTK,
    // igual para todos: no es un «perdido»), la plancha alcanza menos (diveK) y el contacto depende más de la Defensa (fC: si no, con
    // casi todo tocado los atributos apenas cambiaban nada; failK: escala)
    // Revisión (18-nov): con 2,1 el zaguero no arrancaba antes de que botara el remate (~0,4 s; quieto en ~64 % de los que no tocaba):
    // 1,0, con failK 1,9. Afinado (2ª ronda): con failK 1,9 desviaba el 24-35 % de los remates (base 10-18): «llega a todo y la desvía».
    // Ahora failK 0,9, arranca algo peor (accTK 1,4) y no saca lo que le pasa lejos antes de leerlo (preR): desviadas 13-14 % (CPU)
    six: { accTK: 1.4, failK: 0.9, fC: 2, shankFar: [0.45, 0.35] },
    // playa (g.beach): pista de 16 × 8 (los dos defensores cubren más) y arena: arranca peor (accTK) y lee el remate más tarde (read s).
    // Muy sensible: los partidos online a 21 de tools/fluidtest (bots de entrada con compañeros IA, tope de 900 s) van al límite de tiempo y
    // de tráfico también con el código de antes, y cualquier cambio que alargue los peloteos los mueve.
    // Revisión (18-nov): 1,35 / 0,06. Afinado (2ª ronda): con la lectura variable (reactSd) llega antes cómoda más veces: 1,2 / 0,035
    // (revisión 2: read 0,05 con defMin 0,08 y la cola lenta recortada; humAcc: arrancada de más contra el remate del humano, ver humAcc)
    // (defensas buenas de la CPU 9 % → ~22 %, base 24-32; con 1,0 / 0 subían al 25 % pero los peloteos se alargaban: 8,3 toques por punto)
    beach: { accTK: 1.2, read: 0.05, failK: 0.75, missR: 1.7, humAcc: 0.4 }
  };
  /** s que tarda p en ponerse a su velocidad máxima: Velocidad < 50 (p.ak.accT, humano e IA) + la arrancada de la IA (EFFORT) cuando
   *  el balón es del rival (defensa y recepción: arranca desde parado al leer el golpe; en el juego propio —colocar, batida, cobertura—
   *  se mueve anticipando, como antes; si ya va lanzado conserva su velocidad, ver stepPlayer). */
  function accTOf(g, p) {
    var a = p.ak && p.ak.accT > 0 ? p.ak.accT : 0;
    if (!isHuman(g, p) && (g.touchTeam !== p.team || blkTouchIn(g, p))) {
      a += EFFORT.accT * Math.pow(1 / (p.ak ? p.ak.speed : 1), EFFORT.accPow) * (g.rot ? EFFORT.six.accTK : g.beach ? EFFORT.beach.accTK : 1);
      // revisión 2: contra el remate del humano arranca más despacio (humAcc) en vez de leerlo más tarde: se le ve correr desde el
      // principio y no llega por poco (antes humRead + perfRead le retrasaban el primer paso y casi no corría)
      if (g.lastKind === 'spike' && g.atkHuman && g.touchTeam !== p.team) a += g.beach ? EFFORT.beach.humAcc : EFFORT.humAcc[g.rot ? 1 : 0];
    }
    return a;
  }
  /** ¿Le llega a p un remate rival que acaba de rozar el bloqueo de su propio equipo (toque de bloqueo, 'touch')? El balón ya es «suyo»
   *  (g.touchTeam), pero lo defiende como un remate: con la arrancada y la lectura variable (ai.js) de un balón
   *  rival. Antes de esto, tras el toque de bloqueo la cobertura reaccionaba sin lectura ni arrancada y lo sacaba casi todo. */
  function blkTouchIn(g, p) { return g.lastKind === 'block' && g.lastShot === 'touch' && g.touchTeam === p.team; }
  /** Reacción efectiva de la IA p (EFFORT) a partir de la del perfil (ya con Líder), con la lectura del remate rival (spikeRead) o del
   *  rebote de un bloqueo directo (stuffRead). */
  function aiReactEff(g, p, react) {
    var rd = g.touchTeam === p.team ? 0 : g.lastKind === 'spike' ? EFFORT.spikeRead[g.rot ? 1 : 0] + (g.beach ? EFFORT.beach.read : 0) +
      (g.atkHuman ? EFFORT.humRead[g.rot ? 1 : 0] + (g.atkGrade === 'perfect' ? EFFORT.perfRead[g.rot ? 1 : 0] : 0) : 0) :
      g.lastKind === 'block' && g.lastShot === 'stuff' ? EFFORT.stuffRead : 0;
    // (defensa de un balón rival por leer —remate, dejada o balón libre, bloqueo, o el que roza su bloqueo—: defMin/defK/defQ; el resto
    // —recepción, juego propio, colocarse— con la de la ronda anterior, reactMin/reactK)
    return (preLate(g, p) ? EFFORT.defMin + EFFORT.defK * react + EFFORT.defQ * react * react : EFFORT.reactMin + EFFORT.reactK * react) + rd;
  }
  /** Prob. de que la IA p no controle el 1r toque que va a dar a d m de su cuerpo (dive: en plancha; fool: viene de una finta que
   *  la engañó). Pura (no gasta g.rng). 0 si
   *  lo que llega no es un remate, saque o bloqueo (g.digK 0: balón libre, dejada, pase). */
  var effP0 = 0; // (effortFail: la parte «cómoda» de la última prob., ya escalada; el resto es por el estirón)
  function effortFail(g, p, d, dive, fool) {
    var pr = profOf(g, p), p0, sk; effP0 = 0;
    if (g.lastKind === 'serve') {
      var rp = pr, al = bl(p, 'ancla');
      if (al) rp = { recv: Math.min(0.99, pr.recv + BADGE.anclaAI[al]) }; // Ancla (IA)
      if (pr.recv !== g.prof[p.team].recv) rp = { recv: clamp(rp.recv + EFFORT.digAttr * (pr.recv - g.prof[p.team].recv), 0.4, 0.99) }; // (atributo Recepción, ×(1 + digAttr))
      p0 = EFFORT.recvK * recvFail(g.recvRisk || 0, rp); sk = rp.recv;
    } else if (g.lastKind === 'block' && g.lastShot === 'stuff') {
      p0 = 1 - clamp(g.digK, 0, 1); sk = 0;                          // directo: g.digK es directamente la prob. de salvarla
    } else {
      if (!(g.digK > 0)) return 0;
      sk = clamp((pr.dig + EFFORT.digAttr * (pr.dig - g.prof[p.team].dig)) * g.digK, 0, 1); p0 = EFFORT.f0 * Math.pow(clamp(1 - (g.rot ? EFFORT.six.fC : EFFORT.fC) * sk, 0, 1), EFFORT.fPow);
      if (fool) p0 = Math.max(p0, EFFORT.feintFail);                 // finta que engaña (g.feintFool del toque que llega)
    }
    var s = (dive ? EFFORT.diveS : stretchOf(g, p, d)) * (g.lastKind === 'serve' ? EFFORT.recvS : 1), k6 = g.lastKind === 'serve' ? 1 : g.rot ? EFFORT.six.failK : g.beach ? EFFORT.beach.failK : 1; // (la recepción, sin failK)
    effP0 = Math.min(p0 * k6, EFFORT.fMax);
    return clamp((p0 + EFFORT.fS * s * (1 - EFFORT.fSk * sk)) * k6, 0, EFFORT.fMax);
  }
  /** Tope de calidad (antes del ×0,7) de la plancha de la IA p contra un remate o un bloqueo (EFFORT.diveQ): 0,45 (siempre 'poor', como
   *  el humano) + diveQ × base, con base = su Defensa × g.digK como en effortFail. Así la plancha al límite es un toque difícil pero a
   *  veces bueno (balón asequible y buen defensor), no siempre una defensa mala. Saque y balón libre (g.digK 0): 0,45. Pura. */
  function diveCapAI(g, p) {
    if (!(EFFORT.diveQ > 0) || !(g.digK > 0) || g.lastKind === 'serve') return 0.45;
    var pr = profOf(g, p), sk = clamp((pr.dig + EFFORT.digAttr * (pr.dig - g.prof[p.team].dig)) * g.digK, 0, 1);
    return 0.45 + EFFORT.diveQ * sk;
  }
  /** m que la plancha alarga el alcance de p: el humano C.DIVE; la IA (EFFORT) C.DIVE × diveK (2v2, 6v6) × (multiplicador de su
   *  atributo Velocidad, p.ak.speed)^divePow: el contacto en plancha es instantáneo, así que su alcance decide si llega. Solo el
   *  atributo, no la dificultad (la dificultad ya va en la reacción, la velocidad y la Defensa del perfil). */
  function diveROf(g, p) {
    return isHuman(g, p) ? C.DIVE : C.DIVE * EFFORT.diveK[g.rot ? 1 : 0] * (p.ak ? Math.min(EFFORT.diveMax, Math.pow(p.ak.speed, EFFORT.divePow)) : 1);
  }
  /** ¿Plancha fallida «honesta»? Como canDive, pero con el balón entre su plancha y missR m más allá (no llega por poco). */
  function r3(v) { return Math.round(v * 1000) / 1000; } // (g.digK, g.digMargin, g.recvRisk: viajan online en flMeta; con 3 decimales el paquete es más corto)
  function missROf(g) { return g.beach ? EFFORT.beach.missR : EFFORT.missR[g.rot ? 1 : 0]; }
  /** EFFORT.preR del formato (0: sin límite antes de leer). */
  function preROf(g) { return g.beach ? EFFORT.beach.preR || 0 : EFFORT.preR[g.rot ? 1 : 0]; }
  /** ¿El balón que tiene p al alcance es un balón rival por leer (remate, bloqueo, dejada/balón libre, o el que acaba de rozar su
   *  bloqueo)? Solo entonces cuenta el límite de antes de reaccionar (preR); el saque y el juego propio, no. */
  function preLate(g, p) {
    return blkTouchIn(g, p) || (g.touchTeam !== p.team && (g.lastKind === 'spike' || g.lastKind === 'block' || g.lastKind === 'free'));
  }
  /** s que le faltan al balón para botar (parábola, sin rozamiento). Pura. */
  function ballLandT(g) { var b = g.ball, ge = gEff(b); return (b.vz + Math.sqrt(b.vz * b.vz + 2 * ge * Math.max(0, b.z))) / ge; }
  /** ¿El balón bota dentro de la pista (+ missIn)? Bote previsto por la parábola, como en canDiveMiss. */
  function missLands(g) {
    var b = g.ball, tl = ballLandT(g);
    return Math.abs(b.x + b.vx * tl) <= g.HL + EFFORT.missIn && Math.abs(b.y + b.vy * tl) <= g.HW + EFFORT.missIn;
  }
  function canDiveMiss(g, p) {
    if (g.fl && flNo(g, p, true)) return false; // fl
    var b = g.ball;
    if (b.held || g.mode !== 'rally' || p.down > 0 || p.z > 0 || p.vz > 0) return false;
    if (g.lastKind === 'serve' && g.touchTeam === p.team) return false;
    if (g.touchTeam === p.team && g.lastPlayer === p) return false;
    var d = Math.hypot(b.x - p.x, b.y - p.y), rl = bl(p, 'red'), dr = (C.REACH + diveROf(g, p)) * (rl ? BADGE.redR[rl] : 1);
    if (d <= dr || d > dr + missROf(g) || b.z < 0.08 || b.z > EFFORT.missZ) return false;
    if (b.x * side(p.team) <= 0.2) return false;
    // el balón que va a botar fuera no se persigue en plancha (antes se tiraba a por remates que acababan «fuera»): bote previsto por
    // la parábola (sin rozamiento: cae en < 0,25 s), dentro de la pista + missIn m
    var ge = gEff(b), tl = (b.vz + Math.sqrt(b.vz * b.vz + 2 * ge * b.z)) / ge;
    return Math.abs(b.x + b.vx * tl) <= g.HL + EFFORT.missIn && Math.abs(b.y + b.vy * tl) <= g.HW + EFFORT.missIn;
  }
  /** ESTIRÓN del 1r toque del HUMANO (17-nov-2026, Ferran: «Hay que "nerfear" la defensa. Si el balón va muy lejos de tu cuerpo, por
   *  mucho que hagas buen timing la pelota no va donde tú quieres exactamente»). s = (d / alcance − d0) / (1 − d0), entre 0 y 1, al
   *  cuadrado (casi nada a media distancia, todo al límite). Calidad ×(1 − q·s) (además del −30 % lineal de siempre) y dispersión del
   *  destino +er·s ×(1 + sp·dureza del balón que llega, 11 → 19 m/s), que el timing NO quita (los atributos sí, ×ek). Solo el humano:
   *  la IA ya juega sus 1.os toques con su error de perfil (prof.err). Ni la plancha (ya capada, DIVE_FAIL) ni el rebote en el cuerpo. */
  var STRETCH = { d0: 0.55, q: 0.2, er: 0.45, sp: 0.6 };
  function stretchOf(g, p, d) { var s = clamp((d / reachOf(g, p) - STRETCH.d0) / (1 - STRETCH.d0), 0, 1); return s * s; }
  // 6v6, 1r toque (17-nov-2026, pase más cerca de la red): el pase controlado baja a 1 m de alto (g.pr1, lo que lee la IA para ir
  // al balón) al menos PASS_KEEP m antes de la red. Si no, ai6.computeJob lo da por perdido (pr1 al otro lado) y se cuela por
  // debajo de la red sin que nadie lo toque. PASS_MIN: el destino (a 1,9 m de alto) nunca más cerca de la red que esto
  var PASS_KEEP = 0.4, PASS_MIN = 0.75;
  /** BLOQUEO ACTIVO (11-nov-2026, pedido de Ferran: «al presionar golpear, lo que haga el bloqueo sea bajar… si lo aprietas demasiado
   *  rápido puedes tocar la red y que sea falta; si no lo aprietas, el rebote es suave»). En el aire en la red (|x| <= BLK_ZONE) con el
   *  balón del rival, GOLPEAR ya no es un golpe: es «bajar» el bloqueo (manos por encima de la red empujando hacia abajo).
   *  El reloj de la pulsación es el GOLPE DEL REMATADOR (hitWindow del rival que va a atacar), no la llegada del balón: un remate
   *  tarda 0,05-0,1 s del golpe a la red, inalcanzable por reacción; hay que anticiparse viendo el armado (revisión 11-nov).
   *   - Sin pulsar: el contacto es un rebote SUAVE (amortiguado o toque; nunca directo).
   *   - Pulsado a tiempo: desde PRESS_EARLY s antes del golpe del rematador hasta que el balón llega (o con el ataque ya en vuelo):
   *     bloqueo FUERTE (directo mucho más probable; sigue dependiendo del contacto).
   *   - Pulsado pronto (entre PRESS_EARLY y PRESS_NET_T s antes del golpe): la pulsación se desperdicia (blockPress ok:false).
   *   - Pulsado demasiado pronto (más de PRESS_NET_T s antes, o el rival aún no ha colocado): con el cuerpo a < PRESS_NET m de la red y
   *     frente a ella, toque de red con prob. NET_PRESS[nivel] («puedes tocar la red»: nunca seguro); si no, se desperdicia.
   *  Un balón del rival que cruza sin ser atacado (overpass, balón libre) o ya en nuestro campo sigue siendo un golpe normal.
   *  Solo para el humano (la IA bloquea como siempre). Vale en 2v2 y 6v6. */
  var PRESS_EARLY = 0.30, PRESS_NET_T = 0.5, PRESS_NET = 0.9, NET_PRESS = { easy: 0.4, normal: 0.6, hard: 0.75, expert: 0.85 };
  var _bw = {};
  /** ¿GOLPEAR sería ahora una pulsación de bloqueo (true) o un golpe normal (false)? Sin efectos ni g.rng: lo usa también la UI
   *  (aviso «Al remate: ¡muro!»). */
  function blockPressCase(g, p) {
    var b = g.ball, sd = side(p.team);
    if (!p || !(p.z > 0.2) || Math.abs(p.x) > BLK_ZONE || g.touchTeam === p.team || g.mode !== 'rally') return false;
    // (side(t) = signo del campo propio: el balón viene hacia nosotros cuando vx tiene ese signo, como exige checkBlock)
    var spiked = g.lastKind === 'spike' || g.lastKind === 'free', toward = !b.held && b.vx * sd > 0.5;
    // balón ya en nuestro campo: golpe normal (un ataque en vuelo sigue siendo bloqueable mientras esté en la zona de checkBlock, |x| <= 0,6)
    if (b.x * sd > (spiked && toward ? 0.6 : 0.3)) return false;
    // overpass, balón que cruza sin atacar o saque que viene: golpe normal, esté donde esté, en 2v2 y 6v6 (revisión del 12-nov: con
    // |b.x| >= 0,6 el humano en la red que anticipaba el remate del overpass se comía un toque de red con lead = ∞). El overpass sigue
    // existiendo como error de recepción; solo cambia que GOLPEAR en el aire ante él es un golpe (Ferran, 12-nov)
    if (!spiked && toward) return false;
    return true;
  }
  function blockPress(g, p) {
    if (!blockPressCase(g, p)) return false;
    var b = g.ball, sd = side(p.team);
    var spiked = g.lastKind === 'spike' || g.lastKind === 'free', toward = !b.held && b.vx * sd > 0.5;
    var lead;   // s hasta el golpe del rematador (negativo = el ataque ya va en vuelo)
    if (spiked && toward) lead = -1;
    else if (g.touches < 2 && !g.rot) lead = Infinity;              // 2v2: aún no han colocado
    else {
      lead = Infinity;
      for (var i = 0; i < g.players.length; i++) { var q = g.players[i]; if (q.team === p.team) continue;
        var w = hitWindow(g, q, _bw); if (w.reach && w.t >= -0.05 && w.t < lead) lead = w.t; }
    }
    if (lead <= PRESS_EARLY) {
      var tArr = spiked && toward ? (b.x * sd < 0 ? Math.abs(b.x) / Math.abs(b.vx) : 0) : lead + 0.15;   // hasta que el balón llega a la red
      p.pressEnd = g.time + tArr + 0.2; emit(g, { type: 'blockPress', player: p, team: p.team, ok: true }); return true;
    }
    p.pressEnd = -9;
    if (lead > PRESS_NET_T && Math.abs(p.x) <= PRESS_NET && Math.abs(p.y) < g.HW + 0.5 && g.rng() < (NET_PRESS[g.difficulty] || 0.85)) {
      emit(g, { type: 'netTouch', player: p, x: p.x, y: p.y, z: p.z + 2.2 });   // demasiado pronto: los brazos a la red antes de tiempo
      if (g.fl && !g.fl.loc[g.fl.own]) flFq(g, p); else // fl
      fault(g, p.team, 'net', 'Toque de red', p);
    } else emit(g, { type: 'blockPress', player: p, team: p.team, ok: false });
    return true;
  }
  /** Calidad que se arrastra en el 2v2 (pase → colocación → ataque de la IA; ver hit y ai.js):
   *  pass: la colocación de la IA tras un pase de calidad c sale con q × (1 − pass·(1 − c))
   *  lo/hi: el remate de la IA tras una colocación de calidad c se resiente con k = (c − lo)/(hi − lo) en 0..1 (1 = como siempre):
   *    velocidad × (spd0 + (1 − spd0)·k), dispersión × (1 + er·(1 − k)), error no forzado × (1 + err·(1 − k))
   *  safeQ/safeP/safeLo: bola de seguridad de la IA (ai.js) con prob. safeP·(safeQ − c)/(safeQ − safeLo) (0 con c >= safeQ)
   *  jsQ/jsX/jsMate: colocación en salto de la IA (ai.js; prob. prof.jsetAI) solo con pase >= jsQ, balón a < jsX m de la red y el
   *  compañero a < jsMate s de su sitio de remate */
  /** Destino de la colocación de suelo en 2v2: escribe en out {x (distancia a la red), y (mundo), apex, tempo, s, D, L}. Sin
   *  g.mastery, o sin g.aimSet, el de siempre: x 1,35 al compañero (mate.y) con cima 5,3 y tempo ''. Con g.mastery:
   *   - humano (C2, colocar por destino; notes/sim.md): el destino sale de g.setDirA (la dirección de la ventana, step). Neutra (NaN):
   *     alta a la 4 (MASTERY.set.neutral, cima >= neutralApex, 'high'). Con dirección: la tabla MASTERY.set.dirs por sectores de 45°,
   *     interpolada por ángulo (imán de ±snap° a cada sector). La cima y el tempo salen de la distancia s del toque (sx, sy: punto de
   *     toque; sin él, el de hitWindow o la posición del jugador) al destino;
   *   - colocador CPU (equipo 1) con hk(g, 0xE13) < prof.zoneSet: 'lane' al lado contrario del jugador del humano (g.ctrl).
   *  El compañero IA del humano nunca (tiene que ser predecible). Pura: sin g.rng ni memoria nueva. */
  var _st = { x: 0, y: 0, apex: 0, tempo: '', s: 0, D: 0, L: 0 };
  /** C2: lateral L de una entrada de MASTERY.set.dirs (número, 's' = el del colocador, 's+'/'s-' = corta a ±corta m de él sin pasar
   *  del destino de →/←) con el colocador en sL (metros de pabellón, media anchura HW). */
  function setL(t, sL, HW, M) {
    if (typeof t === 'number') return t;
    var lim = HW - M.sClamp, c = clamp(sL, -lim, lim);
    if (t === 's') return c;
    var e = t === 's+' ? M.dirs[2][1] : M.dirs[6][1], v = t === 's+' ? Math.min(sL + M.corta, e) : Math.max(sL - M.corta, e);
    return clamp(v, -(HW - M.Lpad), HW - M.Lpad);
  }
  var _wSet = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  function setAim(g, p, human, out, sx, sy) {
    var M = MASTERY.set, sd = side(p.team), cs = g.cs || 1, mate = other(g, p);
    out.x = 1.35; out.y = clamp(mate.y, -3.6 * cs, 3.6 * cs); out.apex = 5.3; out.tempo = ''; out.s = 0; out.D = 1.35; out.L = sd * out.y / cs;
    if (!g.mastery) return out;
    if (human) {
      if (!g.aimSet) return out;
      if (sx == null) { var w = hitWindow(g, p, _wSet); if (w.reach) { sx = w.x; sy = w.y; } else { sx = p.x; sy = p.y; } }
      var sD = sd * sx / cs, sL = sd * sy / cs, HW = g.HW / cs, a = g.setDirA, neu = a !== a, D, L;
      if (neu) { D = M.neutral[0]; L = M.neutral[1]; }
      else {
        var th = ((a % 360) + 360) % 360, u = th / 45, n = Math.round(u), k, f;
        if (Math.abs(th - n * 45) <= M.snap) { k = n % 8; f = 0; } else { k = Math.floor(u) % 8; f = u - Math.floor(u); }
        var T0 = M.dirs[k], T1 = M.dirs[(k + 1) % 8];
        D = T0[0] + (T1[0] - T0[0]) * f; L = setL(T0[1], sL, HW, M) + (setL(T1[1], sL, HW, M) - setL(T0[1], sL, HW, M)) * f;
        var floor = (f < 0.5 ? T0 : T1)[2];
      }
      D = clamp(D, M.Dmin, M.Dmax); L = clamp(L, -(HW - M.Lpad), HW - M.Lpad);
      var s = Math.hypot(D - sD, L - sL), ap = clamp(M.a0 + M.aS * s + M.aD * Math.max(0, D - M.dD0), M.apexMin, M.apexMax);
      out.tempo = neu ? 'high' : s <= M.quickS && D <= M.quickD ? 'quick' : ap >= M.highApex ? 'high' : 'lane';
      if (!neu && floor === 'lane' && out.tempo === 'quick') { out.tempo = 'lane'; ap = Math.max(ap, M.laneMin); } // (←/→ siempre tensa o alta)
      if (neu) ap = Math.max(ap, M.neutralApex);
      out.x = D * cs; out.y = sd * L * cs; out.apex = ap; out.s = s; out.D = D; out.L = L;
    } else if ((g.online || p.team === 1) && hk(g, 0xE13) < (profOf(g, p).zoneSet || 0)) {
      var hc0 = g.online ? g.hum[1 - p.team].p : g.ctrl, hy = hc0 ? hc0.y : 0, sg = Math.abs(hy) > 0.2 ? (hy > 0 ? -1 : 1) : (hk(g, 0xE17) < 0.5 ? -1 : 1);
      out.tempo = 'lane'; out.y = sg * M.zoneY * cs;
    }
    return out;
  }
  /** 6v6 (17-nov-2026, Ferran: «con perfecto tampoco parece que mejore una locura»): tras una colocación perfecta (q >= q) del colocador
   *  humano, la defensa rival del remate ×dig. */
  var SET6_PERF = { q: 0.78, dig: 0.8 };
  var SETQ = VB.SETQ = { pass: 0.5, lo: 0.25, hi: 0.85, spd0: 0.85, er: 1.0, err: 1.0, safeQ: 0.45, safeP: 0.85, safeLo: 0.1, jsQ: 0.78, jsX: 2.4, jsMate: 0.75 };
  function hit(g, p, aim, te, shot, tgt) {
    if (g.fl && flNo(g, p, false)) return; // fl
    var t = p.team, sd = side(t), b = g.ball, prof = profOf(g, p);
    var inKind = g.lastKind, inShot = g.lastShot, inPrev = g.prevKind; // lo que llega (para contar defensas de remate)
    var inFool = g.feintFool; g.feintFool = false;                          // (EFFORT: solo vale durante el vuelo del toque que la puso)
    var prevPlayer = g.lastPlayer;                                          // autor del toque anterior (colocador: asistencia, Manos de seda)
    var prevQ = g.touchTeam === t ? g.lastQ : 1;                            // calidad del toque anterior del propio equipo (SETQ)
    if (g.touchTeam === t && g.lastPlayer === p) { fault(g, t, 'double', 'Dobles: el mismo jugador toca dos veces', p); return; }
    var count = g.touchTeam === t ? g.touches + 1 : 1;
    if (count > 3) { fault(g, t, 'four', '4 toques', p); return; }
    // Contra un remate rival en camino, el jugador en el aire NO ataca (antes GOLPEAR o la dejada en el bloqueo devolvían el
    // remate como un remate propio: 2v2, TRASPASO «GOLPEAR en el bloqueo»). En la red (|x| <= BLK_ZONE, donde vale el bloqueo)
    // no hay toque de brazos: decide checkBlock con la geometría de las manos (y GOLPEAR es «bajar» el bloqueo, blockPress).
    // Más atrás es una defensa en el aire (1r toque, calidad ×BLK_AIRQ). También en 6v6 (11-nov-2026: antes en 6v6 GOLPEAR en
    // el bloqueo devolvía el remate rival como un remate propio «más fuerte»)
    var vsAtk = jsetVoid(g, p) && isAttackContact(p, b);
    if (vsAtk && Math.abs(p.x) <= BLK_ZONE) return;
    var atkC0 = isAttackContact(p, b) && !vsAtk;
    // COLOCAR en el aire donde no cabe colocación en salto (3r toque, o 1r sin el balón alto en la red): dejada si es
    // un toque de ataque, si no el toque normal
    // (E1, con g.mastery: en el 3r toque COLOCAR es el golpe colocado, 'roll', no una dejada repetida)
    if (shot === 'jset' && !canJset(g, p, count)) shot = atkC0 ? (g.mastery ? 'roll' : 'tip') : '';
    if (vsAtk && (shot === 'tip' || shot === 'roll')) shot = '';
    if (shot === 'roll' && !atkC0) shot = ''; // (el golpe colocado solo existe como toque de ataque en el aire)
    var jset = shot === 'jset';
    // Regla 13.3.4: atacar el saque rival en zona de ataque con el balón entero por encima de la red. El golpe solo
    // es falta cuando se COMPLETA como ataque (el balón cruza entero el plano de la red o lo toca el rival): una
    // recepción alta dirigida al propio campo no lo es. Se anota aquí y se pita en stepBall/checkBlock.
    var atkSrv = shot !== 'body' && g.lastKind === 'serve' && g.lastTeam !== t && p.z > 0.25 && b.z - 0.1 > C.NET_H && Math.abs(b.x) < C.ATTACK;
    g.atkServe = atkSrv ? { team: t, player: p } : null;
    // 6v6 (reglas 13.2.2 y 19.3.1.3): el zaguero que despegó delante de la línea de 3 m, o el líbero desde cualquier sitio, no
    // puede golpear en el aire con el balón entero por encima de la red. Igual que el ataque sobre el saque, solo es falta si
    // el ataque se COMPLETA (cruza la red o lo toca el rival): se anota aquí con su motivo y se pita en stepBall/checkBlock
    if (g.rot && !atkSrv && shot !== 'body' && p.z > 0.25 && b.z - 0.1 > C.NET_H && (p.role === 'L' || (!p.front && Math.abs(p.toX) < C.ATTACK)))
      g.atkServe = { team: t, player: p, reason: 'backAttack', text: p.role === 'L' ? 'Ataque del líbero' : 'Ataque de zaguero' };
    var human = isHuman(g, p), mate = other(g, p);
    te = te || 0; shot = shot || '';
    // E1 (finta): el humano abrió el gesto con GOLPEAR (remate armado) y lo cambió a dejada o golpe colocado al menos
    // MASTERY.feint.minT s después: la CPU lo lee tarde (ai.js, feintRead). Cuesta algo de calidad (MASTERY.feint.q)
    var feint = g.feintOn && human && atkC0 && (shot === 'tip' || shot === 'roll') && g.swingShot0 === '' &&
      g.swingSwapT - g.swingT0 >= MASTERY.feint.minT;
    // (19-nov-2026) el timing de la finta sale del CAMBIO (SALTAR o COLOCAR), no de GOLPEAR: se arma pronto y se deja caer a tiempo. Antes
    // salía de GOLPEAR y había que cambiar entre 0,03 y 0,07 s después para no perder calidad: casi imposible a propósito
    if (feint) te += g.swingSwapT - g.swingT0;
    if (human && count === 1 && g.digTight) te *= 1.5; // A3: tras un remate perfecto rival la ventana es más justa
    var d = Math.hypot(b.x - p.x, b.y - p.y), inSp = fastInFor(g);
    var hardIn = g.lastKind === 'spike' || (g.lastKind === 'serve' && inSp > 13);
    if (human && p.ak) { // atributos: ventana de timing del toque (recepción/defensa, colocación, ataque) ±12 %
      var wk = jset ? p.ak.wSet : atkC0 ? p.ak.wAtk * p.ak.wJmp : count === 2 ? p.ak.wSet : g.lastKind === 'serve' ? p.ak.wRecv : p.ak.wDig;
      te /= wk; // remate: también el Salto (con poco salto la ventana es más justa; dependes más del timing)
    }
    // Manos de seda: remate del compañero tras una colocación buena o perfecta del que la lleva
    // (también el ataque del 2º toque tras una colocación en salto en el 1r)
    var setIn = inKind === 'set' && (count === 3 || (count === 2 && inShot === 'jump'));
    var sedaL = setIn && prevPlayer && prevPlayer !== p && prevPlayer.team === t && prevPlayer.grade !== 'poor' ? bl(prevPlayer, 'seda') : 0;
    if (human && p.badges) { // insignias: ventanas de timing del humano (Sangre fría, Manos de seda, Ancla, Red de seguridad)
      var bw = sangreW(g, p), atkC = atkC0;
      if (atkC && sedaL && shot !== 'tip') bw *= BADGE.sedaW[sedaL];
      if (count === 1 && !atkC) {
        if (inKind === 'serve') bw *= BADGE.anclaW[bl(p, 'ancla')];
        else if (inKind === 'spike' || (inKind === 'block' && inPrev === 'spike')) bw *= BADGE.redW[bl(p, 'red')];
      }
      if (bw !== 1) te /= bw;
    } else if (human && sedaL && shot !== 'tip' && atkC0) te /= BADGE.sedaW[sedaL];
    if (jset) te *= JSET.win; // colocación en salto: ventana más justa
    // salto con impulso: el remate con mucha deriva hacia la red tiene la ventana algo más justa (×1 + MOM.win)
    if (human && p.dj && atkC0 && !jset && shot !== 'tip' && shot !== 'roll' && shot !== 'dive' && shot !== 'body')
      te *= 1 + MOM.win * clamp((p.jF - MOM.j0) / (MOM.j1 - MOM.j0), 0, 1);
    // calidad: timing x distancia x dificultad de lo que llega
    var q = timingQ(te);
    q *= 1 - 0.3 * clamp((d / C.REACH - 0.55) / 0.45, 0, 1);
    if (hardIn) q *= 1 - 0.25 * clamp((inSp - 11) / 8, 0, 1);
    // estirón (STRETCH): el humano que llega al balón lejos del cuerpo en el 1r toque no lo controla del todo aunque clave el timing
    var strK = human && count === 1 && !atkC0 && !jset && shot !== 'dive' && shot !== 'body' ? stretchOf(g, p, d) : 0;
    // plancha (17-nov-2026, Ferran: «hay que hacer que sea más difícil salvar esas y que vayan bastante peor»): tope 0,45 × 0,7 = 0,32
    // (siempre 'poor'; antes 0,62 × 0,85 = 0,53, 'good') y, en el 1r toque, DIVE_FAIL de que salga desviada (abajo)
    // (IA, EFFORT.diveQ: la plancha al límite contra un balón asequible para su Defensa puede salir buena; ver diveCapAI)
    if (shot === 'dive') q = Math.min(q, human ? 0.45 : diveCapAI(g, p)) * 0.7;
    if (vsAtk) q *= BLK_AIRQ; // defensa en el aire de un remate: casi nunca sale limpia
    q = clamp(q, 0, 1);
    if (feint) q *= MASTERY.feint.q;
    var grade = gradeOf(q), mul = human ? 1 : prof.err;
    // atributos del humano: precisión del toque (VB.ATTR_K.err). Recepción (saque), Defensa (resto de 1.os toques), Colocación
    // (2º toque y colocación en salto) y Control (ataque): ×er y ×prob. de fallo gordo. 1 con 50 o sin atributos
    var ek = 1;
    if (human && p.ak) ek = jset ? p.ak.eSet : atkC0 ? p.ak.eAtk : count === 2 ? p.ak.eSet : count === 1 ? (inKind === 'serve' ? p.ak.eRecv : p.ak.eDig) : 1;
    mul *= ek;
    // ...y en la calidad del pase/colocación (no del ataque: ahí ya están la diana y la potencia). Con el timing clavado la
    // dispersión ya era mínima y el atributo no se notaba: bajo, la calidad se recorta (15 → ×0,75); alto, se acerca a la
    // perfecta (90 → recupera un tercio de lo que le falta)
    if (ek !== 1 && !atkC0 && shot !== 'body') {
      q = ek > 1 ? q * (1 - AK.errQ[0] * (ek - 1)) : q + (1 - q) * (1 - ek) * AK.errQ[1];
      grade = gradeOf(q);
    }
    if (strK > 0) { q *= 1 - STRETCH.q * strK; grade = gradeOf(q); } // estirón: después de los atributos (no lo deshacen del todo)
    // playa: la colocación de dedos se pita más (dobles). Solo en la playa: el pabellón no pasa por aquí.
    //  - HUMANO: colocación de dedos (2º toque con el balón alto, o colocación en salto en cualquier toque) con mal timing: falta
    //    con prob. dblSetP (crece con el desfase |te|, más en salto; nunca con 'perfect'/'good'). Azar hash01 (no g.rng): la
    //    secuencia de g.rng no cambia por esto (Ferran, 12-nov-2026)
    //  - IA: como antes, 2º toque de dedos 'poor' (no en salto) con prob. BEACH.dblSet × dblSetAI, con g.rng
    if (g.beach && shot !== 'body' && shot !== 'dive' && shot !== 'tip' && (jset || !atkC0)) { // (en salto el contacto es «de ataque» por la altura)
      if (human) {
        var pDbl = (jset || (count === 2 && b.z - p.z > 1.6)) ? dblSetP(te, grade, jset) : 0;
        if (pDbl > 0 && hash01(g.seed, Math.round(g.time * 1000), 0x0D0B1E + p.id * 7 + count) < pDbl) {
          fault(g, t, 'double', 'Dobles en la colocación de dedos', p); return;
        }
      } else if (count === 2 && grade === 'poor' && !jset && !atkC0 && b.z - p.z > 1.6 && g.rng() < BEACH.dblSet * BEACH.dblSetAI) {
        fault(g, t, 'double', 'Dobles en la colocación de dedos', p); return;
      }
    }
    // 2v2: la colocación de la IA hereda la calidad del pase que le llega (SETQ.pass). Un pase malo (del humano o de la IA) da
    // una colocación peor y, con ella, un ataque más flojo o una bola de seguridad del compañero IA (abajo y ai.js)
    if (!g.rot && !human && !jset && count === 2 && inKind === 'pass' && shot !== 'body' && prevQ < 1) {
      q *= 1 - SETQ.pass * (1 - prevQ); grade = gradeOf(q);
    }
    // E1 tramo 2 (jugada perfecta): racha de toques perfectos del equipo 0 en esta posesión (se corta con un toque no perfecto o al cambiar)
    var cT = g.online ? t : 0; // (online: la racha es del equipo que toca; fuera, solo la del equipo 0)
    if (g.mastery) {
      if (t !== cT || count === 1) { g.chain = 0; g.chainH = 0; }
      if (t === cT && grade === 'perfect' && shot !== 'body' && shot !== 'shank') { g.chain++; if (human) g.chainH++; } else { g.chain = 0; g.chainH = 0; }
    }
    // E1: la finta no se salta el timing: con un gesto malo ('poor') no engaña (sale una dejada vista, con su coste de calidad)
    if (feint && grade === 'poor') feint = false;
    var perfChain = g.mastery && human && atkC0 && shot === '' && grade === 'perfect' && g.chain === 3 && g.chainH >= 2;
    g.touchTeam = t; g.touches = count; g.lastPlayer = p; g.lastTeam = t; p.anim = 0.3; p.cool = 0.3;
    var prevTempo = g.lastTempo; g.lastTempo = ''; g.atkEdge = 0; // E1: tempo de la colocación que llega; filo de este toque
    var o = { x: b.x, y: b.y, z: b.z };
    var v, kind, at, er, power = 0, dip = 0, sub = shot, edge = 0, tempo = '', lq = NaN, laneB = false, hSet = false, backB = false; // (lq: calidad que se arrastra, C2)
    var momQ = 0, jaim = false; // salto con impulso: bonus del remate (0..1, hit.mom) y colocación en salto a la diana (hit.jaim)
    // EFFORT, playa: tras un toque de bloqueo propio el toque siguiente es el 2º (el bloqueo cuenta), pero sigue siendo la defensa de un
    // remate: también pasa por el dado de contacto (antes solo se tiraba con count 1 y la desviada del propio bloqueo salía siempre
    // limpia). Si falla, sale como la desviada del 1r toque (rama de abajo); si no, el 2º toque normal
    var effB = false, effBX = false;
    if (g.beach && !human && count === 2 && inKind === 'block' && inShot === 'touch' && !atkC0 && !jset && shot !== 'body' && shot !== 'shank') {
      var effPB = effortFail(g, p, d, shot === 'dive', false);
      if (effPB > 0) { var effRB = g.rng(); if (effRB < effPB) { effB = true; effBX = shot === 'dive' || effRB >= effP0; } }
    }
    if (shot === 'body') {
      // el balón da en el cuerpo sin gesto de golpeo (regla: cualquier parte del cuerpo vale como toque).
      // Rebota amortiguado hacia atrás y hacia arriba, con un desvío lateral: casi nunca controlado.
      // sale HACIA FUERA del cuerpo (por donde iba a salir de la "cápsula"), para que no vuelva a caerle encima
      var vin = Math.hypot(b.vx, b.vy, b.vz), ox = b.x - p.x, oy = b.y - p.y, ol = Math.hypot(ox, oy);
      if (ol < 0.05) { ox = -b.vx; oy = -b.vy; ol = Math.hypot(ox, oy) || 1; }
      if (ox * sd < 0) ox = -ox * 0.5; // el cuerpo amortigua: no sale disparado hacia la red (ni por debajo de ella)
      var kout = 1.5 + g.rng() * 1.3 + vin * 0.04;
      v = [ox / ol * kout - b.vx * 0.08, oy / ol * kout - b.vy * 0.08 + rnd(g, 0.4), Math.max(0, -b.vz) * 0.2 + 1.3 + g.rng() * 1.4 + vin * 0.04];
      kind = count === 1 ? 'pass' : count === 2 ? 'set' : 'free';
      q = Math.min(q, 0.12); grade = 'poor';
      g.hardIn = false; g.digOk = true;
      if (g.stats) g.stats.body++;
    } else if (jset) {
      // colocación en salto: hacia la zona de ataque del compañero, tensa (cima baja); con mal timing, pegada o larga
      er = (JSET.err0 + JSET.err1 * (1 - q)) * mul;
      var jx = JSET.tx, jy = clamp(mate.y, -JSET.mate, JSET.mate), jap = Math.max(JSET.minApex, b.z + (count === 1 ? JSET.rise1 : JSET.rise));
      // salto con impulso, colocación en salto con diana (g.jsetAim, diana movida): el destino es la diana (2v2) o, en 6v6, la diana
      // metida en la caja del atacante que le queda más cerca (VB.AI6.dianaPlan; chooseSet con ese carril y el mismo gasto de g.rng; el
      // plan se reorienta a ese destino y esa cima, planAt); cima y tempo por la distancia s del toque al destino REAL; error de cima con
      // mal timing por hash (no g.rng)
      jaim = human && g.aim3.on && g.aim3.kind === 'jset' && !!g.jsMv;
      if (jaim) { var jax = g.aim3.x, jay = g.aim3.y; jx = sd * jax; jy = jay; }
      // 6v6 (humano colocando en salto de 2º toque): al carril del atacante que elige VB.AI6.chooseSet (deja g.setPlan: ese atacante
      // va a por el 3r toque y el bloqueo rival lo lee), no al compañero más cercano
      // (colocador humano, C2: la dirección de la ventana elige atacante, VB.AI6.dirOf8; sin dirección, alta a la 4)
      // (pipe: la colocación en salto va detrás de la línea de 3 m, al destino del plan; si no, el zaguero no podría despegar detrás)
      var jPlan = false;
      if (g.rot && VB.AI6 && count === 2) {
        if (jaim && VB.AI6.dianaPlan) {
          var ln = VB.AI6.dianaPlan(g, p, jax, jay), js6a = VB.AI6.chooseSet(g, p, ln.lane, ln.pref, ln.apexD), P6 = g.setPlan[t];
          if (P6 && P6.to === ln.to) { jx = ln.d; jy = sd * ln.yl; } // (el atacante de la caja: su destino, el que enseña jsetAimInfo)
          else { // (chooseSet cayó a otro: su caja)
            var lo6 = js6a.d - JD.box6D; if (P6 && P6.tempo === 'pipe') lo6 = Math.max(lo6, VB.AI6.FORM.set.pipe.d);
            jx = clamp(jx, lo6, Math.max(lo6, js6a.d + JD.box6D)); jy = clamp(jy, sd * js6a.yl - JD.box6L, sd * js6a.yl + JD.box6L);
          }
          jPlan = true;
        } else { var jd8 = human ? VB.AI6.dirOf8(g, p) : null, js6 = VB.AI6.chooseSet(g, p, jd8 ? jd8.lane : null, jd8 ? jd8.pref : 0, jd8 ? jd8.apexD : 0); jy = clamp(sd * js6.yl, -JSET.mate, JSET.mate); if (g.setPlan[t] && g.setPlan[t].tempo === 'pipe') jx = js6.d; }
      }
      if (jaim) {
        var js = Math.hypot(sd * jx - o.x, jy - o.y), csj = g.cs || 1;
        var japx = clamp(b.z + JD.ap0 + JD.apS * js, JD.apMin, JD.apMax);
        tempo = (js <= JD.qS && jx <= JD.qD * csj) ? 'quick' : japx >= JD.hiAp ? 'high' : 'lane';
        jap = japx + JD.apErr * (1 - q) * ek * (2 * hk(g, 0xE1B) - 1);
        er *= JD.erS0 + JD.erS1 * js;
        if (jPlan && VB.AI6.planAt) VB.AI6.planAt(g, t, jx, sd * jy, japx);
      }
      if (q < JSET.badQ && g.rng() < (JSET.badQ + 0.05 - q) * JSET.badP) {
        if (g.rng() < 0.5) jx = 0.25 + g.rng() * 0.35;          // pegada a la red: toque de red o bloqueo fácil
        else { jx = 3.6 + g.rng() * 1.8; jap -= 0.35; }        // larga y baja: el atacante no llega a rematar
      }
      v = launchApex(o, sd * Math.max(0.15, jx + rnd(g, er * 0.5)), clamp(jy + rnd(g, er * 0.9), -4.2 * g.cs, 4.2 * g.cs), JSET.tz, jap);
      kind = 'set'; sub = 'jump';
      g.blockOff[1 - t] = rnd(g, (0.35 + 0.9 * (1 - g.prof[1 - t].block)) * (1 + JSET.blk * q)); // rápida: el bloqueo rival llega peor colocado
      g.hardIn = false; g.digOk = true;
      if (g.stats) g.stats.jsets = (g.stats.jsets || 0) + 1;
    } else if (atkC0) {
      if (shot === 'tip') { // dejada: suave, corta, por encima del bloqueo
        at = tgt || [-sd * (1.6 + (aim ? clamp(-sd * aim[0], -0.3, 1) : 0.3)), clamp(aim ? p.y + aim[1] * 2.6 : -p.y, -3.8 * g.cs, 3.8 * g.cs)];
        er = (0.25 + 0.9 * (1 - q)) * mul;
        // playa: la dejada con la yema de los dedos es falta, así que se juega de nudillos («pokey»): más tensa y baja (BEACH.pokeyUp)
        v = launchSafe(o, at[0] + rnd(g, er), at[1] + rnd(g, er), 0, g.beach ? Math.max(b.z + BEACH.pokeyUp, C.NET_H + BEACH.pokeyNet) : Math.max(b.z + 0.45, C.NET_H + 0.9));
        kind = 'free'; power = 0.1;
      } else if (shot === 'roll') { // E1: golpe colocado (solo con g.mastery): por encima de las manos del bloqueo, a la misma diana
        var free3r = human && !tgt && g.aim3.on && g.aim3.kind === 'spike';
        at = tgt || (free3r ? [g.aim3.x, g.aim3.y] : attackTarget(p, aim, 6.5, g.cs));
        if (human) edge = edgeOf(g, at[0], at[1]);
        // dispersión: la del remate libre ×MASTERY.roll.spread (humano: spikeSpread; IA: la de su remate), con los MISMOS dos dados
        var rr = (human ? spikeSpread(q) * (p.ak ? p.ak.spread : 1) * BADGE.mira[bl(p, 'mira')] : (0.25 + 1.5 * (1 - q)) * mul) *
          MASTERY.roll.spread * (1 + MASTERY.edge.spr * edge) * Math.sqrt(g.rng()), ra = g.rng() * 6.2832;
        v = launchApex(o, at[0] + rr * Math.cos(ra), at[1] + rr * Math.sin(ra), C.BR, Math.max(b.z + 0.3, C.NET_H + MASTERY.roll.clear));
        if (q < 0.45 && g.rng() < (0.48 - q) * 0.75 * ek) v[2] -= 1.4 + g.rng(); // mal timing: se queda corto, a la red
        kind = 'spike'; sub = 'roll'; power = 0.2;
      } else { // remate
        // 2v2: el remate de la IA depende de la colocación que le llega (SETQ): con una colocación mala sale más lento, más
        // disperso y con más error no forzado; con una buena (>= SETQ.hi), como siempre. Sin azar nuevo
        // (6v6, 17-nov-2026: también tras la colocación del humano —colocador—, para que el timing se note en el remate; CPU-CPU igual)
        var hSet6 = g.rot && setIn && prevPlayer && prevPlayer !== p && isHuman(g, prevPlayer);
        var sk = (!g.rot || hSet6) && !human && setIn && prevQ < SETQ.hi ? clamp((prevQ - SETQ.lo) / (SETQ.hi - SETQ.lo), 0, 1) : 1;
        var free3 = human && !tgt && g.aim3.on && g.aim3.kind === 'spike'; // A1: mira libre del humano ('jset': la diana de la colocación en salto no es la del remate)
        at = tgt || (free3 ? [g.aim3.x, g.aim3.y] : attackTarget(p, aim, 6, g.cs));
        var spd = human ? 13.5 + 5.5 * q + (p.ak ? p.ak.spike : 0) : prof.spike * (0.82 + 0.18 * q) * (SETQ.spd0 + (1 - SETQ.spd0) * sk);
        // E1 (al filo): la mira libre cerca de la línea da un remate más rápido y peor de defender, pero más disperso (más fuera)
        if (g.mastery && free3) { edge = edgeOf(g, at[0], at[1]); spd += MASTERY.edge.spd * edge; }
        if (perfChain) spd += MASTERY.chain.spd; // (tramo 2: jugada perfecta)
        var boost = p.badges || sedaL ? BADGE.canon[bl(p, 'canon')] + BADGE.sedaV[sedaL] : 0; // Cañón, Manos de seda (m/s)
        // salto con impulso (humano con salto con dirección): la deriva hacia donde va el remate le da hasta MOM.spd m/s (con buen
        // timing: nada con q <= qLo), tope MOM.cap; va por boost (misma trayectoria con boostDip, más rápido). Riesgo: dispersión
        // ×(1 + spr·k) y más si remata cruzando la deriva (momF). Sin azar nuevo
        var momF = 1;
        if (human && p.dj) {
          var mdx = at[0] - o.x, mdy = at[1] - o.y, mdl = Math.hypot(mdx, mdy) || 1, jvn = Math.hypot(p.jvx, p.jvy);
          var Jd = Math.max(0, (p.jvx * mdx + p.jvy * mdy) / mdl), mk = clamp((Jd - MOM.j0) / (MOM.j1 - MOM.j0), 0, 1);
          momQ = mk * clamp((q - MOM.qLo) / (MOM.qHi - MOM.qLo), 0, 1);
          boost += Math.min(MOM.spd * momQ, Math.max(0, MOM.cap - (spd + boost)));
          // (el castigo por cruzar la deriva solo cuenta la deriva hacia la red, p.jF: saltar de lado persiguiendo la colocación no castiga)
          momF = (1 + MOM.spr * mk) * (1 + MOM.mis * (1 - (jvn > 1e-9 ? Jd / jvn : 0)) * clamp((p.jF - MOM.j0) / MOM.misJ, 0, 1));
        }
        power = clamp((spd + boost - 11) / 8, 0, 1);
        er = (0.25 + 1.5 * (1 - q)) * mul * (1 + SETQ.er * (1 - sk)) * momF;
        dip = C.G * (0.15 + 0.3 * q); // liftado: el balón "cae" más
        if (boost > 0) { dip = boostDip(dip, spd, spd + boost); spd += boost; }
        if (free3) { // A2: dispersión según el timing, uniforme en un círculo de radio spikeSpread(q) (mismo gasto de azar)
          var sr = spikeSpread(q) * (p.ak ? p.ak.spread : 1) * BADGE.mira[bl(p, 'mira')] * Math.sqrt(g.rng()), sa = g.rng() * 6.2832;
          if (edge > 0) sr *= 1 + MASTERY.edge.spr * edge;
          sr *= momF;
          v = launchDirect(o, at[0] + sr * Math.cos(sa), at[1] + sr * Math.sin(sa), C.BR, spd, C.G + dip); // bota justo en la diana
        } else { var tx0 = at[0] + rnd(g, er), ty0 = at[1] + rnd(g, er); v = g.rot && !human ? deepSpike(o, tx0, ty0, spd, C.G + dip, g.cs) : launchDirect(o, tx0, ty0, 0, spd, C.G + dip); }
        if (q < 0.45 && g.rng() < (0.48 - q) * 0.75 * ek) v[2] -= 1.4 + g.rng(); // a la red (×ek: Control)
        else if (!human && g.rng() < prof.atkErr * BADGE.miraAI[bl(p, 'mira')] * BADGE.sedaAI[sedaL] * (1 + SETQ.err * (1 - sk))) aiError(g, o, v, spd, sd, C.G + dip); // error no forzado de la IA
        kind = 'spike'; sub = 'power';
      }
      // ¿defenderá la IA del otro equipo? Depende de la potencia y de la COLOCACIÓN: margen de tiempo entre el
      // vuelo del balón y lo que tarda el defensor más rápido en llegar al bote (remate al hueco = punto;
      // remate a las manos del defensor = defendible). Así apuntar compensa.
      g.hardIn = kind === 'spike';
      var dp = g.prof[1 - t]; // (con atributos, abajo: el perfil del defensor previsto)
      if (kind === 'spike') {
        g.digMargin = r3(digMargin(g, 1 - t, o, v, C.G + dip)); // (r3: viaja online en flMeta)
        if (g._digWho && g._digWho.prof) dp = g._digWho.prof;
        // A3: remate perfecto del humano -> la IA rival defiende peor (x0,8); remate perfecto contra el humano -> g.digTight
        var tightK = human && grade === 'perfect' ? 0.8 : 1;
        if (human && grade === 'perfect' && !g.rot) tightK *= EFFORT.perfK; // EFFORT (2v2, playa): el remate perfecto del humano, aún más difícil de controlar
        // remate tras una colocación en salto buena o perfecta en el 2º toque: el tempo rápido pilla a la defensa rival a
        // medio colocar. No tras la del 1r toque: ahí ya sale sola (balón regalado en la red) y con el ×dig colocar ganaba
        // más que rematarlo uno mismo
        if (setIn && count === 3 && inShot === 'jump' && prevPlayer && prevPlayer.grade !== 'poor') tightK *= JSET.dig;
        if (g.rot) tightK *= SIX.dig * (VB.AI6 ? VB.AI6.digK(g, t) : 1); // 6v6: con 3 zagueros el margen de defensa sale alto; en sistema, más
        if (hSet6 && prevQ >= SET6_PERF.q) tightK *= SET6_PERF.dig; // 6v6: colocación perfecta del humano: el remate es más difícil de defender
        if (g.mastery) { // E1: golpe colocado (MASTERY.roll.digK) y al filo (-MASTERY.edge.dig·e)
          if (sub === 'roll') tightK *= MASTERY.roll.digK;
          if (edge > 0) tightK *= 1 - MASTERY.edge.dig * edge;
          if (perfChain) tightK = Math.min(tightK, Math.max(MASTERY.chain.minTight, tightK * MASTERY.chain.dig));
        }
        // EFFORT: ya no se tira aquí un dado de «la saca / no la saca» (antes con el margen de tiempo, digMargin, y el defensor
        // perdido iba lento a propósito). Solo la dificultad del balón para el dado de CONTACTO (effortFail, con la Defensa del que
        // la toque); que llegue o no lo decide su carrera. (dp, digMargin y _digWho quedan para quien los lee: online, pruebas)
        g.digK = r3(tightK * clamp(1.55 - 0.9 * power, 0.3, 1.25)); g.digOk = true; // (r3: viaja online en flMeta; con 3 decimales, ~14 B menos por paquete)
        g.digTight = grade === 'perfect' && (g.online ? humOn(g, 1 - t) : 1 - t === 0) && !g.demo && !g.autopilot;
      } else { g.digOk = true; g.digTight = false; g.digK = 0; }
      // E1 (finta con el bloqueo rival en el aire: el bloqueador ya saltó contra el remate armado): la defensa CPU queda engañada con
      // prob. feintBeat del perfil rival (dado hk, sin g.rng): LEE TARDE (+EFFORT.feintReact s, ai.js) y, si llega, la controla peor
      // (digK ×feintK). Corre igual a por ella: el engaño se ve en la arrancada, no en un defensor lento
      g.feintFool = !!(feint && blkAir(g, 1 - t) && hk(g, 0xE11) < (g.prof[1 - t].feintBeat || 0));
      if (g.feintFool) g.digK = r3((g.digK || 1) * EFFORT.feintK);
    } else if (count === 3) {
      at = tgt || attackTarget(p, aim, 6.5, g.cs);
      er = (0.35 + 1.4 * (1 - q)) * mul;
      var ap = Math.max(4.4, b.z + 1);
      if (q < 0.4 && g.rng() < (0.42 - q) * 0.6) v = launchApex(o, at[0] + rnd(g, er), at[1] + rnd(g, er), 0, 2.9); // se queda en la red
      else v = launchSafe(o, at[0] + rnd(g, er), at[1] + rnd(g, er), 0, ap);
      kind = 'free'; sub = sub || (b.z - p.z > 1.6 ? 'overhead' : 'forearm');
      g.hardIn = false; g.digOk = true;
    } else if (count === 1 || effB) {
      er = (0.18 + 1.45 * (1 - q) + (hardIn ? 0.45 * (1 - q) : 0) + STRETCH.er * strK * (1 + STRETCH.sp * clamp((inSp - 11) / 8, 0, 1))) * mul; // (+ estirón)
      // EFFORT: la IA que llega a un remate/saque/bloqueo puede no controlarlo; se decide AQUÍ, en el contacto, según cómo llega
      // (cómoda, estirada, en plancha), el balón (g.digK / g.recvRisk) y su Defensa/Recepción. Si falla por el balón (la parte
      // «cómoda» del dado) sale disparada (shank); si falla por llegar estirada o en plancha, desviada cerca (a veces jugable)
      var effX = false, effP = 0;
      if (effB) { if (effBX) effX = true; else { shot = 'shank'; sub = 'shank'; } } // (playa tras el bloqueo: dado ya tirado arriba)
      else if (!human && shot !== 'shank' && shot !== 'body') {
        effP = effortFail(g, p, d, shot === 'dive', inFool); var effR = effP > 0 ? g.rng() : 1;
        if (effR < effP) { if (shot === 'dive' || effR >= effP0) effX = true; else { shot = 'shank'; sub = 'shank'; } }
      }
      if (shot === 'shank') { // la IA llega pero no la controla: el balón sale disparado (casi siempre injugable)
        // sale tenso y bajo: a la grada (prob. EFFORT.shankFar) o REBOTA en los brazos y cae al suelo cerca de ella, dentro de su
        // campo (calibración EFFORT, 18-nov-2026: con todo a la grada, «Defensa fuera» pasaba del 11-17 % de los puntos)
        var spk = g.lastKind === 'spike';
        var sy = (g.rng() < 0.5 ? -1 : 1), far = g.rng() < (g.rot ? EFFORT.six.shankFar : EFFORT.shankFar)[spk ? 0 : 1];
        var shA = spk ? 1.1 + g.rng() * 1.3 : 1.1 + g.rng() * 1.5, shU = g.rng(), shV = g.rng();
        if (far) v = launchApex(o, sd * (8.5 + shU * 6), sy * (5.6 + shV * 3.5), 0, Math.max(b.z + 0.3, shA));
        else v = launchApex(o, sd * clamp(sd * b.x - 1.2 + shU * 3, 1.2, g.HL - 0.5), clamp(b.y + sy * (0.6 + shV * 2), 0.4 - g.HW, g.HW - 0.4), 0, Math.max(b.z + 0.2, shA * 0.7));
        q = Math.min(q, 0.2); grade = 'poor';
      } else if (effX) { // IA (EFFORT) que llega estirada o en plancha y no la controla: desviada cerca, a veces jugable (más dentro del
        // campo que la de abajo: si no, media «Defensa fuera» salía de aquí)
        var ey = (g.rng() < 0.5 ? -1 : 1) * (1.5 + g.rng() * 2.6);
        v = launchApex(o, sd * (2.5 + g.rng() * 6), clamp(b.y * 0.5 + ey, -g.HW - 0.8, g.HW + 0.8), 0, 2.6 + g.rng() * 2); sub = 'shank';
      } else if ((shot === 'dive' && !(effP > 0) && g.rng() < DIVE_FAIL * ek) || (q < 0.3 && g.rng() < 0.55 * (0.3 - q) / 0.3 * ek)) { // recepción fallida (o plancha): sale desviada (×ek: Recepción/Defensa; la plancha de la IA, solo si no pasó por el dado de contacto: balón libre, dejada, pase)
        var wy = (g.rng() < 0.5 ? -1 : 1) * (3.5 + g.rng() * 2.5);
        v = launchApex(o, sd * (2.5 + g.rng() * 6), wy, 0, 2.6 + g.rng() * 2); sub = 'shank';
      } else if (g.rot && VB.AI6) { // 6v6: al punto de colocación (VB.AI6.passTarget), el error en profundidad sin pasar la red
        var pt = VB.AI6.passTarget(g, p, hardIn, q);
        var pd = Math.max(PASS_MIN, pt.d + rnd(g, er * 1.0)), py = clamp(sd * pt.yl + rnd(g, er * 1.3), -4.2, 4.2);
        v = launchApex(o, sd * pd, py, 1.9, pt.apex);
        // pase tenso desde el fondo: se aleja de 10 en 10 cm hasta que cae a 1 m en el propio campo (PASS_KEEP; sin g.rng)
        for (var pk = 0; pk < 15 && sd * dropX(o, v, 1) < PASS_KEEP; pk++) v = launchApex(o, sd * (pd += 0.1), py, 1.9, pt.apex);
      } else {
        v = launchApex(o, sd * (2 + rnd(g, er * 1.1)), clamp(mate.y, -2.5, 2.5) + rnd(g, er * 1.3), 1.9, hardIn ? 4.1 : 4.4);
      }
      kind = 'pass'; sub = sub || (hardIn ? 'dig' : 'forearm');
      g.hardIn = false; g.digOk = true;
    } else {
      er = (0.1 + 1.15 * (1 - q)) * mul;
      if (q < 0.35 && g.rng() < 0.12 * ek) v = launchApex(o, -sd * (1 + g.rng() * 2), b.y + rnd(g, 1.5), 0, 4.6); // pasa la red sin querer (×ek: Colocación)
      else if (g.rot && VB.AI6) { // 6v6: el colocador elige atacante y tempo (VB.AI6.chooseSet: bola alta, tensa, rápida o pipe); el
        // colocador humano (C2), el atacante con la dirección de la ventana (VB.AI6.dirOf8 lee g.setDirA: zona muerta 0,6, arrastre;
        // sin dirección, alta a la 4)
        var d8 = human ? VB.AI6.dirOf8(g, p) : null, sp = VB.AI6.chooseSet(g, p, d8 ? d8.lane : null, d8 ? d8.pref : 0, d8 ? d8.apexD : 0);
        v = launchApex(o, sd * Math.max(0.6, sp.d + rnd(g, er * 0.5)), clamp(sd * sp.yl + rnd(g, er * 0.9), -4.2, 4.2), 3, sp.apex);
      }
      else { // 2v2: al compañero (x 1,35, cima 5,3). E1 (g.mastery): la CPU que coloca a un lado; C2: el humano coloca por destino
        var st = setAim(g, p, human, _st, b.x, b.y), sap = st.apex, MS = MASTERY.set;
        tempo = st.tempo;
        if (g.mastery && g.aimSet && human) { // C2: timing (q) y Colocación (ek) deciden el error del destino, de la cima y del tempo
          er *= (MS.sprS0 + MS.sprS * st.s) * (1 + MS.sprQ * (1 - q));                          // larga o a destiempo: menos precisa
          sap = Math.max(MS.apFloor, b.z + 0.3, sap + (2 * hk(g, 0xE18) - 1) * MS.apErr * (1 - q) * ek); // cima: hash, no g.rng
          lq = q * (1 - (MS.rho[tempo] || 0) * (1 - q));                                         // riesgo del tempo para el remate
          laneB = tempo === 'lane' && st.D <= MS.laneBlkD; backB = st.D >= MS.backD; hSet = true;
        }
        v = launchApex(o, sd * (st.x + rnd(g, er * 0.5)), st.y + rnd(g, er * 0.9), 3, sap);
      }
      kind = 'set'; sub = sub || 'overhead';
      // error de colocación del bloqueador IA rival (el bloqueo es geométrico: peor bloqueador = manos más lejos del balón)
      g.blockOff[1 - t] = rnd(g, 0.35 + 0.9 * (1 - g.prof[1 - t].block));
      // (C2, colocación del humano por destino, hSet: la ventaja va con q^qPow —solo con buen timing— y la de atrás, backB, también)
      var qB = hSet ? Math.pow(q, MASTERY.set.qPow) : q;
      if (tempo === 'quick') g.blockOff[1 - t] *= 1 + MASTERY.set.quickBlk * qB; // rápida: el bloqueo rival llega peor colocado (como JSET.blk)
      else if (laneB) g.blockOff[1 - t] *= 1 + MASTERY.set.laneBlk * qB;         // C2: tensa junto a la red, algo menos
      else if (backB) g.blockOff[1 - t] *= 1 + MASTERY.set.backBlk * qB;         // C2: desde atrás, el bloqueo lee tarde
      g.lastTempo = tempo;
      if (tempo && g.stats) { var smt = g.stats.mastery; if (human) { if (tempo === 'lane') smt.lane++; else if (tempo === 'high') smt.high++; else smt.quick[0]++; } else if (tempo === 'lane') smt.cpu.lane++; }
      g.hardIn = false; g.digOk = true;
    }
    b.vx = v[0]; b.vy = v[1]; b.vz = v[2]; b.dip = dip; b.wobA = 0;
    if (kind !== 'spike') { g.digTight = false; if (!g.feintFool) g.digK = 0; } // (EFFORT: la dejada que engaña conserva su digK)
    if (g.online) aimOff(g); else g.aim3.on = false;
    g.prevKind = g.lastKind;
    g.lastKind = kind; g.lastShot = sub; g.lastQ = lq === lq ? lq : q; g.lastTouchT = g.time; g.netSince = false;
    g.atkEdge = edge;
    if (feint) g.feintT = g.time;
    if (kind === 'spike' || (kind === 'free' && sub === 'tip')) {
      g.atkTeam = t; g.atkHow = kind === 'spike' ? 'kill' : 'tip'; g.atkHits = g.rally.hits + 1; g.atkHuman = human; g.atkGrade = grade;
      if (g.mastery) { // E1: etiqueta del ataque (point.move): finta > colocado > al filo > tras una rápida
        g.atkMove = feint ? 'feint' : sub === 'roll' ? 'roll' : edge > MASTERY.edge.tag ? 'edge' : setIn && prevTempo === 'quick' ? 'quick' : '';
        // (la rápida se cuenta al colocarla: la remata quien sea)
        if (g.stats && g.atkMove && g.atkMove !== 'quick') { var sm = g.stats.mastery; if (human) sm[g.atkMove][0]++; else if (t === 1 && g.atkMove === 'roll') sm.cpu.roll[0]++; }
      } else if (g.feintOn) { // 6v6: solo la finta
        g.atkMove = feint ? 'feint' : '';
        if (feint && g.stats) g.stats.mastery.feint[0]++;
      }
      // colocador del ataque (point.assist): el 2º toque del mismo equipo, si el ataque es el 3r (o el 1r si colocó en salto
      // y el ataque es el 2º)
      g.atkSet = setIn && prevPlayer && prevPlayer !== p && prevPlayer.team === t ? prevPlayer : null;
      if (g.stats && kind === 'spike') g.stats.spikes[t]++;
    }
    // salto con impulso: pipe (6v6: remate de zaguero que despegó detrás de la línea de 3 m, golpee donde golpee; etiqueta sin azar, para
    // todos: también cuenta los pipes legales de la CPU, que golpean a ~3,4 m)
    var pipe = !!g.rot && !p.front && p.role !== 'L' && p.z > 0 && Math.abs(p.toX) >= C.ATTACK && kind === 'spike';
    if (kind === 'spike') { var dL = g.djLast; dL.team = t; dL.mom = momQ >= 0.5 ? 1 : 0; dL.pipe = pipe && human ? 1 : 0; }
    if (g.stats && g.stats.dj) {
      if (kind === 'spike' && momQ >= 0.5) g.stats.dj.mom[0]++;
      if (pipe && human) g.stats.dj.pipe[0]++;
      if (jaim) g.stats.dj.jaim++;
    }
    b.speed = Math.hypot(v[0], v[1], v[2]);
    p.lastAction = kind === 'free' && sub === 'tip' ? 'spike' : kind; p.actionT = 0; p.shot = sub; p.grade = grade;
    if (sub === 'body') p.anim = 0.12; // sin gesto de brazos: solo el rebote
    if (shot === 'dive') p.lastAction = 'dive';
    g.rally.hits++;
    // defensa de un remate (SIM-01): primer toque controlado (no desviado ni de rebote en el cuerpo) de un remate rival,
    // también si llega frenado por el propio bloqueo ('touch') o es la cobertura de un bloqueo directo rival ('stuff')
    if (kind === 'pass' && count === 1 && sub !== 'shank' && shot !== 'body' &&
        (inKind === 'spike' || (inKind === 'block' && inPrev === 'spike' && (inShot === 'touch' || inShot === 'stuff')))) g.rally.digs++;
    // hit.dig: defensa controlada de un remate RIVAL (1r toque; también el que llega frenado por el propio bloqueo, 'touch';
    // no la cobertura del propio remate tras un bloqueo directo rival, ni el desviado ni el rebote en el cuerpo)
    var isDig = kind === 'pass' && count === 1 && sub !== 'shank' && shot !== 'body' &&
      (inKind === 'spike' || (inKind === 'block' && inPrev === 'spike' && inShot === 'touch'));
    if (human) { if (g.online) hset(g, t, 'lastGrade', grade); else g.lastGrade = grade; }
    if (g.stats) {
      g.stats.hits[kind]++; g.stats.grades[grade]++; if (human) g.stats.hgrades[grade]++;
      g.stats.shots[sub] = (g.stats.shots[sub] || 0) + 1;
    }
    if (g.fl) flContact(g, sub === 'body' ? 'body' : 'hit'); // fl
    var hev = emit(g, { type: 'hit', kind: kind, player: p, team: t, touch: count, quality: q, grade: grade, timing: te,
      power: power, shot: sub, dive: shot === 'dive', aim: aim ? [aim[0], aim[1]] : null, target: at ? [at[0], at[1]] : null,
      x: b.x, y: b.y, z: b.z, speed: b.speed, human: human, dig: isDig, recv: count === 1 && inKind === 'serve', jset: jset,
      feint: feint, tempo: tempo, edge: edge, chain: g.mastery && t === cT ? g.chain : 0, mom: momQ, pipe: pipe, jaim: jaim });
    if (g.beach && kind === 'free' && sub === 'tip') hev.pokey = true; // playa: dejada de nudillos (UI: «Pokey»)
    if (feint) emit(g, { type: 'feint', player: p, team: t, shot: sub }); // E1: después del hit, en el mismo paso
    if (g.drill) drillOnHit(g, hev); // E6: nota del toque / fin de la repetición por toque
    endSwingX(g);
  }

  /** Error no forzado de la IA: remate largo, abierto o a la red (reescribe v). */
  function aiError(g, o, v, spd, sd, G) {
    var r = g.rng(), w;
    if (r < 0.4) w = launchDirect(o, -sd * (9.5 + g.rng() * 1.2) * g.cs, o.y * 0.3 + rnd(g, 2.5), 0, spd, G);           // largo
    else if (r < 0.75) w = launchDirect(o, -sd * (3 + g.rng() * 5) * g.cs, (g.rng() < 0.5 ? -1 : 1) * (4.9 + g.rng() * 1.2) * g.cs, 0, spd, G); // abierto
    else { w = v; w[2] -= 1.4 + g.rng(); }                                                                       // a la red
    v[0] = w[0]; v[1] = w[1]; v[2] = w[2];
  }

  function endSwing(g) { g.hitBuf = 0; g.swingLive = false; g.swingShot = ''; g.swingHasAim = false; }

  /* Volumen de las manos del bloqueador (revisión 2). El bloqueo es GEOMÉTRICO: si el balón entra en el
   * volumen, SIEMPRE hay contacto; el azar solo decide el resultado. Un bloqueo mal medido (lejos del punto
   * alto del salto, qb bajo) tiene las manos más bajas y más juntas: el balón pasa visiblemente por ENCIMA o
   * por el LADO, nunca a través.
   *   qb  = 1 en el punto alto del salto, ~0.2 subiendo/bajando rápido
   *   top = alcance de las manos sobre los pies; hw = media anchura de las manos (centro del balón)
   * Por debajo de las manos (pies + BLK_HANDS) está el cuerpo (cabeza/pecho), más estrecho (BLK_BODY). */
  var BLK_HANDS = 1.95, BLK_BODY = 0.3;
  // con Salto > 50 el que salta más alto también llega con las manos más abajo (lo que gana de salto): saltar más nunca hace que un
  // balón que antes daba en las manos pase a darle en el cuerpo. Con Salto <= 50 (o sin atributos), BLK_HANDS tal cual
  function blkHands(q) { if (!q.ak || q.ak.jump <= 1) return BLK_HANDS; var jv = C.JUMP_V * q.ak.jump; return BLK_HANDS - (jv * jv - C.JUMP_V * C.JUMP_V) / (2 * C.G); }
  function blockTop(qb) { return 2.5 + 0.3 * qb; }
  function blockHalfW(qb) { return 0.42 + 0.25 * qb; }
  // con atributos, qb se mide sobre SU velocidad de despegue y la ventana se estrecha o se abre con Salto (wJmp) y Bloqueo (wBlk):
  // el tiempo con qb alto es ∝ jump·wJmp·wBlk (15 en los dos: ×0,58; 90: ×1,35). Las manos, ×hands de ancho
  function blockQ(q) { return clamp(1 - Math.abs(q.vz) / (q.ak ? C.JUMP_V * q.ak.jump * q.ak.wJmp * q.ak.wBlk : C.JUMP_V) * 0.8, 0, 1); }
  /** ¿Está el balón dentro del volumen de bloqueo del jugador q? (no comprueba equipo ni dirección) */
  function inBlockVol(q, b) {
    var qb = blockQ(q);
    if (b.z < C.NET_H - 0.05 || b.z > q.z + blockTop(qb)) return false;
    return Math.abs(b.y - q.y) <= (b.z > q.z + blkHands(q) ? blockHalfW(qb) * (q.ak ? q.ak.hands : 1) : BLK_BODY);
  }

  /** Bloqueo ofensivo (ver checkBlock): directo = k·(a + b·cq), tope c (k = oficio del bloqueador, cq = calidad del contacto). Un balón que
   *  cruza sin atacar llega lento y alto: con buen contacto, el directo manda (como el remate del overpass que sustituye). */
  var OFE_STUFF = [0.2, 0.6, 0.75];
  /** ¿Tiene q (humano) un gesto de GOLPEAR en curso? (no la dejada ni la colocación en salto; online: el de su hueco) */
  function humSwing(g, q) {
    if (g.online) { var s = humSlot(g, q); return s >= 0 && !!hget(g, s, 'swingLive') && hget(g, s, 'swingShot') === ''; }
    return q === g.ctrl && !!g.swingLive && g.swingShot === '';
  }
  function checkBlock(g) {
    var b = g.ball;
    if (g.blockCD > 0 || Math.abs(b.x) > 0.6) return;
    for (var i = 0; i < g.players.length; i++) {
      var q = g.players[i], sq = side(q.team);
      if (g.fl && !g.fl.loc[q.team]) continue; // fl
      if (q.z < 0.15 || Math.abs(q.x) > 1.1 || g.lastTeam === q.team || Math.sign(b.vx) !== sq) continue;
      if (!inBlockVol(q, b)) continue;
      g.blockCD = 0.5; g.blockBy = q;
      if (g.lastKind === 'serve') { fault(g, q.team, 'block', 'Bloqueo del saque', q); return; }
      if (g.rot && !q.front) { fault(g, q.team, 'backBlock', q.role === 'L' ? 'Bloqueo del líbero' : 'Bloqueo de zaguero', q); return; } // 6v6: solo bloquean los delanteros (14.6.2, 19.3.1.3)
      if (g.atkServe) { fault(g, g.atkServe.team, g.atkServe.reason || 'attackServe', g.atkServe.text || 'Ataque sobre el saque', g.atkServe.player); return; } // lo toca el rival: ataque completado
      var human = isHuman(g, q), prof = profOf(g, q), kindB;
      var pressed = human && g.time <= q.pressEnd;   // bloqueo activo: GOLPEAR a tiempo = bajar el bloqueo (blockPress)
      // BLOQUEO OFENSIVO (17-nov-2026, Ferran: «si haces un "bloqueo ofensivo" el juego lo cuenta como remate»): ante un balón rival que
      // cruza sin ser atacado (overpass, colocación que se pasa, balón libre), GOLPEAR en el aire es un golpe normal (blockPressCase), pero
      // si las manos lo encuentran por encima de la red decide checkBlock: con el gesto en curso es un bloqueo pulsado (bajar las manos,
      // OFE_STUFF), y el gesto se gasta aquí. Antes el bloqueo salía siempre suave y el mismo gesto lo volvía a golpear desde el propio
      // campo como un remate (evento hit 'spike', remate en las estadísticas y punto 'kill'): un bloqueo contado como remate
      // (la dejada o el balón libre del rival ya tienen su pulsación, blockPress: con el gesto en curso cuentan como pulsados, sin OFE_STUFF)
      var swB = human && !pressed && g.lastKind !== 'spike' && humSwing(g, q), ofe = swB && g.lastKind !== 'free';
      if (swB) pressed = true;
      if (human) { q.pressEnd = -9; endSwingX(g); }   // (un gesto, un contacto: lo que quede del gesto no vuelve a golpear el balón bloqueado)
      var qb = blockQ(q), hands = b.z > q.z + blkHands(q), hw = hands ? blockHalfW(qb) * (q.ak ? q.ak.hands : 1) : BLK_BODY;
      var pw = clamp((b.speed - 11) / 8, 0, 1), spike = g.lastKind === 'spike';
      var cen = 1 - clamp(Math.abs(b.y - q.y) / hw, 0, 1);              // 1 = balón en el centro de las manos
      var cq = qb * (0.5 + 0.5 * cen) * (hands ? 1 : 0.45);              // calidad del contacto
      var ml = bl(q, 'muro');                                            // Muro: mejor contacto (humano) / más oficio (IA)
      if (ml && human) cq = Math.min(1, cq * BADGE.muroQ[ml]);
      var k = human ? (q.ak ? Math.min(0.95, 0.9 * q.ak.blk) : 0.9) : clamp(0.3 + prof.block + BADGE.muroAI[ml], 0.3, 0.95); // oficio del bloqueador
      // resultado (probabilidades condicionadas, en este orden): directo, amortiguado, block-out, toque que sigue
      var pStuff = spike ? clamp(k * (0.15 + 0.6 * cq) - 0.15 * pw, 0.03, 0.65) : 0.12 * k * cq;
      // humano (bloqueo activo): sin pulsar nunca es directo; pulsado a tiempo, el directo manda (sigue dependiendo del contacto cq)
      if (human) pStuff = !pressed ? 0 : spike ? clamp(k * (0.25 + 0.7 * cq) - 0.1 * pw, 0.08, 0.85) : ofe ? clamp(k * (OFE_STUFF[0] + OFE_STUFF[1] * cq), 0, OFE_STUFF[2]) : clamp(0.05 + 0.3 * k * cq, 0, 0.6);
      if (g.rot) pStuff *= SIX.stuff; // 6v6: con doble bloqueo hay más manos; el directo, menos probable por contacto
      // Salto del atacante (con atributos): el que remata desde abajo pega contra las manos (más directos); el que salta mucho
      // pega por encima de los dedos (menos). 15 → ×1,32; 90 → ×0,80; 50 o sin atributos, ×1
      var atkJ = spike && g.lastPlayer && g.lastPlayer.ak ? g.lastPlayer.ak.jump : 1;
      if (atkJ !== 1) pStuff = Math.min(0.75, pStuff * (1 + 2 * (1 - atkJ)));
      var pSoft = clamp(0.12 + 0.45 * k * cq + (spike ? 0 : 0.4), 0, 0.9);
      if (human) pSoft = !pressed ? clamp(0.55 + 0.35 * cq, 0, 0.92) : clamp(0.1 + 0.3 * k * cq, 0, 0.5);   // suave sin pulsar; pulsado, poco amortiguado
      var pTool = clamp(0.1 + 0.15 * pw + 0.25 * (1 - cen), 0, 0.5);
      // E1 (manos fuera): remate humano al filo (g.atkEdge) que da en el borde de las manos: más block-out (misma tirada, otra prob.)
      if (g.mastery && spike && g.atkHuman && g.atkEdge > 0) pTool = clamp(pTool + MASTERY.edge.tool * g.atkEdge * (1 - cen), 0, 0.6);
      // Rompemanos (atacante): +x de prob. ABSOLUTA de block-out. Dado previo con x / (1 − P(tool)) para que la prob. total
      // sea exactamente P(tool) + x (el dado extra solo se tira si el atacante lleva la insignia)
      var rk = spike ? bl(g.lastPlayer, 'rompemanos') : 0, forceTool = false;
      if (rk) {
        var pT0 = (1 - pStuff) * (1 - pSoft) * pTool, xr = Math.min(BADGE.rompemanos[rk], 0.95 - pT0);
        forceTool = xr > 0 && g.rng() < xr / (1 - pT0);
      }
      if (forceTool) {
        kindB = 'tool';
        var outF = g.rng() < 0.5 ? 1 : -1;
        b.x = sq * 0.3; b.vx = b.vx * 0.55; b.vy = outF * (2.5 + g.rng() * 3); b.vz = 1.5 + g.rng() * 2.5;
      } else if (g.rng() < pStuff) { // bloqueo directo ("muro"): hacia abajo y al campo del atacante, casi imposible de defender
        kindB = 'stuff';
        b.x = -sq * 0.25; b.vx = -sq * (2 + g.rng() * 2); b.vy = b.vy * 0.3 + rnd(g, 1.2); b.vz = -6 - g.rng() * 3;
      } else if (g.rng() < pSoft) { // bloqueo amortiguado: el balón queda jugable en el propio campo
        kindB = 'soft';
        b.x = sq * 0.3; b.vx = b.vx * 0.14 + sq * 0.6; b.vy = b.vy * 0.3 + rnd(g, 0.8); b.vz = 2.6 + g.rng() * 2;
      } else if (g.rng() < pTool) { // block-out: rebota en el borde de las manos y se va fuera
        kindB = 'tool';
        var out = g.rng() < 0.5 ? 1 : -1;
        b.x = sq * 0.3; b.vx = b.vx * 0.55; b.vy = out * (2.5 + g.rng() * 3); b.vz = 1.5 + g.rng() * 2.5;
      } else { // toque de bloqueo: el balón sigue a su campo, frenado, más alto y algo desviado (defendible)
        kindB = 'touch';
        var kv = 0.5 + 0.2 * g.rng() - 0.15 * cq;
        b.x = sq * 0.25; b.vx = b.vx * kv; b.vy = b.vy * 0.6 + rnd(g, 1.3); b.vz = Math.max(b.vz * 0.3, 0) + 1.2 + g.rng() * 2.2;
      }
      b.dip = 0; b.wobA = 0; b.speed = Math.hypot(b.vx, b.vy, b.vz);
      // El toque de bloqueo no cuenta como uno de los 3 toques del equipo; en la PLAYA sí (quedan 2, y el bloqueador puede
      // dar el siguiente: lastPlayer null)
      g.touchTeam = q.team; g.touches = g.beach ? 1 : 0; g.lastPlayer = null; g.lastTeam = q.team; q.anim = 0.3; g.prevKind = g.lastKind; g.lastKind = 'block'; g.digTight = false;
      g.lastShot = kindB; g.lastTouchT = g.time; g.hardIn = false; g.digOk = true; g.netSince = false; g.digK = 0; g.feintFool = false;
      // EFFORT: tras el bloqueo tampoco hay dado previo; la dificultad del balón para el dado de contacto (con la Defensa del que lo
      // toque, no la del bloqueador como antes)
      if (kindB === 'stuff') { // el atacante casi nunca la salva (balón hacia abajo y pegado a la red)
        g.hardIn = true; g.digK = r3(EFFORT.stuffK * (1 - qb));
        g.atkTeam = q.team; g.atkHow = 'block'; g.atkHits = g.rally.hits; g.atkHuman = human; g.atkGrade = gradeOf(qb);
      } else if (kindB === 'touch') { // el remate sigue vivo pero frenado: la defensa IA lo saca más que un remate limpio
        g.hardIn = true; g.digK = EFFORT.touchK;
      }
      q.lastAction = 'block'; q.actionT = 0; q.shot = kindB; q.grade = gradeOf(qb);
      if (g.stats) { g.stats.blocks++; g.stats.blockKinds[kindB]++; }
      emit(g, { type: 'block', player: q, team: q.team, x: b.x, y: b.y, z: b.z, result: kindB, quality: qb, human: human, pressed: pressed, ofe: ofe });
      if (g.fl) flContact(g, 'block'); // fl
      if (g.drill) drillOnBlock(g, kindB, q); // E6: el bloqueo cierra la repetición en Remate y Bloqueo
      return;
    }
  }

  /** Contacto con el cuerpo (revisión 2): si el balón entra en la "cápsula" del cuerpo de un jugador en su
   *  propio campo (radio BODY_R alrededor del eje, de 0,2 m a la cabeza) y nadie está jugando ese balón,
   *  es un toque (regla: cualquier parte del cuerpo). Antes atravesaba al jugador y contaba como ace. */
  var BODY_R = 0.3, BODY_Z0 = 0.2, BODY_Z1 = 1.85;
  /* El contacto se aplica en el ÚLTIMO instante en que el balón está dentro de la cápsula (va a salir por
   * abajo o por un lado en este subpaso): hasta entonces el jugador aún puede pulsar y jugarlo con un gesto
   * (algo tarde = toque 'good'/'poor' normal). Así un balón que cae encima del receptor no le "roba" el toque. */
  function checkBody(g, dt) {
    var b = g.ball;
    if (g.mode !== 'rally') return;
    for (var i = 0; i < g.players.length; i++) {
      var p = g.players[i], sd = side(p.team), dz = b.z - p.z;
      if (g.fl && !g.fl.loc[p.team]) continue; // fl
      if (p === g.blockBy && g.time - g.lastTouchT < 0.35) continue;      // el que acaba de bloquear
      if (b.x * sd < 0.25 || dz < BODY_Z0 || dz > BODY_Z1 || p.down > 0) continue;
      var dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy > BODY_R * BODY_R) continue;
      // ¿sigue dentro tras el próximo subpaso (solo se mueve el balón) Y tras un paso entero (se mueve también
      // el jugador)? Si en cualquiera de los dos sale, este es el último instante: contacto.
      var nx = dx + b.vx * dt, ny = dy + b.vy * dt, nz = dz + b.vz * dt;
      var mx2 = dx + (b.vx - p.vx) * 2 * dt, my2 = dy + (b.vy - p.vy) * 2 * dt, mz2 = dz + (b.vz - p.vz) * 2 * dt;
      if (nx * nx + ny * ny <= BODY_R * BODY_R && nz >= BODY_Z0 + 0.12 && nz <= BODY_Z1 &&
          mx2 * mx2 + my2 * my2 <= BODY_R * BODY_R && mz2 >= BODY_Z0 + 0.12 && mz2 <= BODY_Z1) continue; // aún dentro
      if (g.lastPlayer === p && g.time - g.lastTouchT < (g.lastShot === 'body' ? 1.2 : 0.5)) continue; // acaba de salir de sus manos / de rebotarle
      if (g.lastKind === 'serve' && g.touchTeam === p.team) continue;      // su propio saque
      // la IA aparta el cuerpo del balón que le costaría una falta (dobles: su propio toque que le vuelve a caer
      // encima; 4 toques: el equipo ya tocó tres veces) o que su compañero acaba de soltar a su lado (< 0,3 s: el
      // toque siguiente lo juega con un gesto, no "de rebote"). Antes, ~1 de cada 1.800 puntos la IA hacía dobles
      // o 4 toques así (recepción desviada que le cae encima; colocación que rebota en el compañero pegado).
      // El humano sigue expuesto a la regla: si el balón le da a él, es toque.
      if (!isHuman(g, p) && g.touchTeam === p.team &&
          (g.lastPlayer === p || g.touches >= 3 || g.time - g.lastTouchT < 0.3)) continue;
      if (isHuman(g, p)) { if (g.online ? hget(g, p.team, 'swingLive') : g.swingLive) continue; }                    // gesto en curso: lo resuelve processSwing
      else if (g.jobs[p.team] === p) continue;                            // la IA que va a jugarlo lo juega con un gesto (EFFORT: ya no hay «batida»)
      hit(g, p, null, 0.25, 'body', null);
      return;
    }
  }

  /** Balón en la mano del sacador (antes del lanzamiento): pecho, delante, hacia la mano izquierda.
   *  Un leve vaivén (el sacador "bota" el balón en la mano mientras se concentra). */
  function holdBase(g, p, out) {
    var sd = side(p.team);
    out.x = p.x - sd * C.HOLD_FWD;            // hacia la red (-sd)
    out.y = p.y - sd * C.HOLD_SIDE;           // izquierda del jugador mirando a la red
    out.z = p.z + C.HOLD_Z + Math.sin(g.time * 3.1) * 0.025;
    return out;
  }
  /** Punto de la MANO izquierda del sacador (players ancla ahí la palma con `_holdPos`). Fuera del ritual = balón en la
   *  mano (holdBase). Durante el ritual de la CPU (SIM-04): en 'pre'/'post' la mano lleva el balón (= posición del balón);
   *  en 'dribble' la mano se aparta a un lado mientras el balón bota y vuelve a recogerlo (ver ritualHand). */
  function holdPos(g, p, out) {
    var r = g.ritual;
    if (r && r.on && r.player === p && g.mode === 'serve' && g.serveState === 'ready') return ritualHand(g, p, r, out);
    return holdBase(g, p, out);
  }

  // ---------- Ritual del sacador CPU (SIM-04) ----------
  /* Entre el silbato y el lanzamiento, el sacador de la CPU bota el balón 1-3 veces con un estilo propio y un tiempo
   * previsible. Todo es presentación DETERMINISTA: no gasta el azar del partido (g.rng); los parámetros salen de un hash
   * de la semilla del partido, el jugador y el número de saque. Fases (r.phase): 'wait' (balón en la mano antes del
   * silbato) → 'pre' (baja el balón hasta la altura del bote) → 'dribble' (botes; r.n = botes ya hechos, r.u = 0..1 dentro
   * del bote en curso) → 'post' (lo recoge y lo sube a la mano) → 'done' (quieto, concentrado, hasta el lanzamiento).
   * El balón es una función pura de r.t (s desde el silbato). Cada contacto con el suelo emite `dribble`.
   *   relZ: altura del centro del balón al soltarlo/recogerlo (m)   fwd/side: punto del bote delante/izquierda del sacador
   *   e: restitución del bote (madera)   tossBy: el lanzamiento nunca después de esto desde serveReady (8 s de reglamento)
   *   minDur/maxDur: duración total del ritual (silbato → lanzamiento)   postMove: s que tarda en subir el balón a la mano */
  var RITUAL = VB.RITUAL = { minDur: 0.8, maxDur: 1.6, tossBy: 4.5, relZ: 1.0, fwd: 0.42, side: 0.12, e: 0.8,
    postMove: 0.22, minCyc: 0.32, hand: 0.30, dwell: 0.017, demoMax: 0.8, demoBounces: 1, demoWhistle: 0.2, demoHold: 1.65 };
  // demo del menú (ola 3): un solo bote firme, ritual de 0,8 s como mucho (minCyc puede alargarlo a ~0,84), silbato a los
  // demoWhistle s y pausa rutinaria demoHold s (no 1,9): el ritual no puede frenar la demo. Con 2 botes/1,1 s y silbato a 0,35 la
  // demo bajó de 113 a 108 puntos de media en 20 min (semillas 1-200) y 4 semillas no llegaban a 2 sets; así: 116 puntos, 0/200.
  // dwell: el balón se queda en contacto con el suelo ~1 frame de 60 Hz (aplastamiento), para que todo frame pintado vea el bote
  function hash01(a, b, c) { // [0,1) determinista (mezcla tipo murmur3)
    var h = Math.imul((a | 0) ^ 0x2545F491, 0x9E3779B1) ^ Math.imul((b | 0) + 0x632BE5AB, 0x85EBCA77) ^ Math.imul((c | 0) + 0x1B873593, 0xC2B2AE3D);
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** E1: azar de la maestría SIN g.rng (la secuencia de g.rng no cambia por decidir): [0,1) determinista por partido, set, marcador
   *  y toque del peloteo; un salt distinto por decisión (0xE11…0xE19). */
  function hk(g, salt) { return hash01(g.seed, (g.setNo * 64 + g.score[0] + g.score[1]) * 32 + g.rally.hits, salt); }
  /** E1: ¿hay un jugador del equipo t en el aire junto a la red (bloqueando)? */
  function blkAir(g, t) { var tm = g.teams[t]; for (var i = 0; i < tm.length; i++) if (tm[i].z > 0.15 && Math.abs(tm[i].x) < 1.2) return true; return false; }
  /** E1: proximidad del punto (x, y) a la línea más cercana del campo: 0 a MASTERY.edge.d m (×g.cs) o más, 1 sobre la línea. Pura. */
  function edgeOf(g, x, y) {
    var d = Math.min(g.HW - Math.abs(y), g.HL - Math.abs(x));
    return 1 - clamp(d / (MASTERY.edge.d * (g.cs || 1)), 0, 1);
  }
  /** Estilo fijo de cada jugador en el partido (personalidad): botes base y tempo. */
  function ritualStyle(g, p) {
    var a = hash01(g.seed, p.id, -1), b = hash01(g.seed, p.id, -2), c = hash01(g.seed, p.id, -3);
    return { n: a < 0.3 ? 1 : a < 0.75 ? 2 : 3, tempo: b, pre: 0.16 + 0.06 * c, still: 0.12 + 0.14 * hash01(g.seed, p.id, -4) };
  }
  /** Divide un bote de periodo T en bajada (td, empujado), contacto (RITUAL.dwell) y subida (tu) con restitución RITUAL.e. */
  function ritualSplit(r, T) {
    var d = RITUAL.relZ - C.BR, G = C.G, lim = Math.sqrt(2 * d / G) - 1e-3;
    T -= RITUAL.dwell;
    var lo = Math.max(0.05, T - lim), hi = Math.min(lim, T - 0.05), td = 0.5 * (lo + hi);
    for (var it = 0; it < 40; it++) { // e(td) crece con td: bisección
      td = 0.5 * (lo + hi);
      var tu = T - td, e = ((d + G * tu * tu / 2) / tu) / ((d + G * td * td / 2) / td);
      if (e < RITUAL.e) lo = td; else hi = td;
    }
    var tu2 = T - td;
    r.cyc = T + RITUAL.dwell; r.td = td; r.tu = tu2;
    r.v0 = (d - G * td * td / 2) / td;          // velocidad del empujón hacia abajo
    r.vu = (d + G * tu2 * tu2 / 2) / tu2;        // velocidad de subida tras el bote
    r.vc = r.vu - G * tu2;                       // velocidad (hacia arriba) al recogerlo
    r.vi = r.v0 + G * td;                        // velocidad contra el suelo
  }
  /** Prepara el ritual del sacador sv en setupServe (CPU) o lo apaga (humano). Devuelve s desde serveReady hasta el lanzamiento. */
  function ritualSetup(g, sv, cpu) {
    var r = g.ritual;
    r.on = false; r.phase = 'none'; r.t = 0; r.n = 0; r.u = 0; r.player = null; r.dur = 0; r.bounces = 0;
    if (!cpu || g.opts.ritual === false) return -1;               // opts.ritual:false = sin ritual (pruebas: flujo anterior)
    var st = ritualStyle(g, sv), sn = g.serveNo;
    var n = st.n, v = hash01(g.seed, sv.id, sn);
    if (v < 0.11) n--; else if (v > 0.89) n++;                       // a veces uno más o uno menos
    var press = g.setPoint >= 0 || g.matchPoint >= 0;                 // con punto de set/partido se toma su tiempo
    if (press) n++;
    n = clamp(n, 1, g.demo ? RITUAL.demoBounces : 3);
    var maxDur = g.demo ? RITUAL.demoMax : RITUAL.maxDur;
    var T = (n === 1 ? 0.50 : n === 2 ? 0.40 : 0.33) + (n === 1 ? 0.10 : n === 2 ? 0.06 : 0.04) * st.tempo;
    T *= 1 + 0.06 * (hash01(g.seed, sv.id, sn + 7777) * 2 - 1);
    var pre = st.pre, still = st.still + (press ? 0.12 : 0), post = RITUAL.postMove;
    var dur = pre + n * T + post + still;
    if (dur > maxDur) {                                               // demasiado largo: primero la pausa final, luego el tempo
      still = Math.max(0.08, still - (dur - maxDur)); dur = pre + n * T + post + still;
      if (dur > maxDur) { T = Math.max(RITUAL.minCyc, (maxDur - pre - post - still) / n); dur = pre + n * T + post + still; }
    }
    var minDur = Math.min(RITUAL.minDur, maxDur);
    if (dur < minDur) { still += minDur - dur; dur = minDur; }
    ritualSplit(r, T);
    var sd = side(sv.team);
    r.on = true; r.phase = 'wait'; r.player = sv; r.bounces = n; r.pre = pre; r.post = post; r.still = still; r.dur = dur;
    r.rx = sv.x - sd * RITUAL.fwd; r.ry = sv.y - sd * RITUAL.side; r.press = press;
    return Math.min(RITUAL.tossBy, g.whistleAt + dur);
  }
  function herm(a, b, ma, mb, s) { // Hermite cúbica: valores a,b y tangentes ma,mb (ya multiplicadas por la duración)
    var s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * a + (s3 - 2 * s2 + s) * ma + (-2 * s3 + 3 * s2) * b + (s3 - s2) * mb;
  }
  var _rH = { x: 0, y: 0, z: 0 };
  /* PLAYA (12-nov-2026, pedido de Ferran: «quita que el jugador bote el balón antes de sacar en la arena»): en la arena no se bota.
   * MISMAS fases y MISMOS tiempos que el bote (pre, n ciclos de r.cyc, post, still: silbato → lanzamiento idéntico, sin g.rng),
   * pero el balón no baja al suelo: en 'pre' pasa de la mano a delante del pecho (J) girándolo, en 'juggle' (en vez de 'dribble')
   * da n toquecitos hacia arriba con la izquierda y lo recoge en J (cada recogida emite `juggle`, no `dribble`), en 'post' vuelve a
   * la mano. BJ: punto J (respecto al sacador, hacia la red / izquierda / altura); dw: fracción del ciclo con el balón en la palma. */
  var BJ = VB.RITUAL_BEACH = { fwd: 0.32, side: 0.12, z: 0.98, dw: 0.1, cush: 0.035 };
  function beachJ(g, p, out) { var sd = side(p.team); out.x = p.x - sd * BJ.fwd; out.y = p.y - sd * BJ.side; out.z = p.z + BJ.z; return out; }
  var _rJ = { x: 0, y: 0, z: 0 };
  /** Vuelo de un toquecito de playa en un ciclo de periodo `cyc`: s en la palma al principio, s de vuelo y velocidad de salida. */
  function beachFlight(r) { var dw = Math.max(0.03, BJ.dw * r.cyc), tf = r.cyc - dw; return { dw: dw, tf: tf, v: C.G * tf / 2 }; }
  function ritualBallBeach(g, p, r, out, t, H) {
    var J = beachJ(g, p, _rJ), s, F = beachFlight(r);
    if (t < r.pre) {                                  // de la mano a delante del pecho (sube ya con el impulso del primer toque)
      s = t / r.pre;
      out.x = herm(H.x, J.x, 0, 0, s); out.y = herm(H.y, J.y, 0, 0, s); out.z = herm(H.z, J.z, 0, 0, s);
      return out;
    }
    var td = t - r.pre, nb = r.bounces * r.cyc;
    if (td < nb) {
      var k = Math.floor(td / r.cyc); if (k >= r.bounces) k = r.bounces - 1;
      var tau = td - k * r.cyc;
      out.x = J.x; out.y = J.y;
      if (tau < F.dw) out.z = J.z - BJ.cush * Math.sin(Math.PI * tau / F.dw);    // en la palma: la mano baja un poco y empuja
      else { var tt = tau - F.dw; out.z = J.z + F.v * tt - C.G * tt * tt / 2; }   // en el aire: vuelve a J al final del ciclo
      return out;
    }
    var tp = td - nb;
    if (tp < r.post) {
      s = tp / r.post;
      out.x = herm(J.x, H.x, 0, 0, s); out.y = herm(J.y, H.y, 0, 0, s); out.z = herm(J.z, H.z, 0, 0, s);
      return out;
    }
    out.x = H.x; out.y = H.y; out.z = H.z; return out;
  }
  /** Posición del balón durante el ritual: función pura del tiempo del ritual (r.t, o `at` si se pasa: mirar adelante). */
  function ritualBall(g, p, r, out, at) {
    var t = at != null ? at : r.t, H = holdBase(g, p, _rH), R0 = RITUAL.relZ + p.z, s, k;
    if (t <= 0) { out.x = H.x; out.y = H.y; out.z = H.z; return out; }
    if (g.beach) return ritualBallBeach(g, p, r, out, t, H);
    if (t < r.pre) {                                  // baja el balón: llega al punto del bote ya empujándolo
      s = t / r.pre;
      out.x = herm(H.x, r.rx, 0, 0, s); out.y = herm(H.y, r.ry, 0, 0, s); out.z = herm(H.z, R0, 0, -r.v0 * r.pre, s);
      return out;
    }
    var td = t - r.pre, nb = r.bounces * r.cyc;
    if (td < nb) {                                    // botes
      k = Math.floor(td / r.cyc); if (k >= r.bounces) k = r.bounces - 1;
      var tau = td - k * r.cyc;
      out.x = r.rx; out.y = r.ry;
      if (tau < r.td) out.z = R0 - r.v0 * tau - C.G * tau * tau / 2;
      else if (tau < r.td + RITUAL.dwell) out.z = p.z + C.BR;                       // en el suelo
      else { var tt = tau - r.td - RITUAL.dwell; out.z = p.z + C.BR + r.vu * tt - C.G * tt * tt / 2; }
      return out;
    }
    var tp = td - nb;                                 // lo recoge y lo sube a la mano
    if (tp < r.post) {
      s = tp / r.post;
      out.x = herm(r.rx, H.x, 0, 0, s); out.y = herm(r.ry, H.y, 0, 0, s); out.z = herm(R0, H.z, r.vc * r.post, 0, s);
      return out;
    }
    out.x = H.x; out.y = H.y; out.z = H.z; return out;
  }
  /** Mano izquierda durante el ritual: con el balón en 'pre'/'post'/'done'; en cada bote suelta el balón en el punto del
   *  bote, se aparta a un lado (RITUAL.hand m) mientras el balón baja y sube, y vuelve a por él al final del bote. */
  function ritualHand(g, p, r, out) {
    ritualBall(g, p, r, out);
    if (r.phase === 'juggle') { var bz = out.z; beachJ(g, p, out); if (bz < out.z) out.z = bz; return out; } // playa: palma en J (o bajo el balón)
    if (r.phase !== 'dribble') return out;
    var u = r.u, k = sstep01(u / 0.22) * (1 - sstep01((u - 0.76) / 0.24));
    out.x = r.rx; out.y = r.ry; out.z = RITUAL.relZ + p.z - 0.05 * k;
    out.y -= side(p.team) * RITUAL.hand * k;       // hacia la izquierda del sacador
    return out;
  }
  /** OPCIONAL (players, PLY-16): balón del ritual en el instante `t` (s desde el silbato) sin tocar nada; null si no hay ritual. */
  function ritualAt(g, t, out) {
    var r = g.ritual; if (!r || !r.on || !r.player) return null;
    return ritualBall(g, r.player, r, out || {}, t);
  }
  function endRitual(g) { var r = g.ritual; if (r.on) { r.on = false; r.phase = 'none'; } g.cpuTossIn = -1; }
  function sstep01(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  /** Avanza el ritual un paso: fase, avance del bote y evento `dribble` en cada contacto con el suelo. */
  function ritualStep(g, sv) {
    var r = g.ritual;
    if (!r.on) return;
    var t0 = r.t;
    if (g.serveAuth) r.t = Math.max(0, g.serveT - g.whistleAt);
    var t = r.t, td = t - r.pre, nb = r.bounces * r.cyc;
    if (!g.serveAuth) r.phase = 'wait';
    else if (t < r.pre) r.phase = 'pre';
    else if (td < nb) {
      r.phase = g.beach ? 'juggle' : 'dribble';
      var k = Math.min(r.bounces - 1, Math.floor(td / r.cyc));
      r.u = (td - k * r.cyc) / r.cyc;
      r.n = (td - k * r.cyc) >= (g.beach ? beachFlight(r).dw : r.td) ? k + 1 : k;
    } else { r.n = r.bounces; r.u = 1; r.phase = td - nb < r.post ? 'post' : 'done'; }
    if (g.beach) { // playa: sin botes; un `juggle` en cada recogida del toquecito (final de cada ciclo), en la mano del sacador
      for (var j = 0; j < r.bounces; j++) {
        var tj = r.pre + (j + 1) * r.cyc;
        if (t0 < tj && t >= tj) { var Jp = beachJ(g, sv, _rJ); emit(g, { type: 'juggle', player: sv, team: sv.team, x: Jp.x, y: Jp.y, z: Jp.z, n: j + 1, of: r.bounces, last: j === r.bounces - 1 }); }
      }
      return;
    }
    // contactos con el suelo cruzados en este paso
    for (var i = 0; i < r.bounces; i++) {
      var tc = r.pre + i * r.cyc + r.td;
      if (t0 < tc && t >= tc) {
        emit(g, { type: 'dribble', player: sv, team: sv.team, x: r.rx, y: r.ry, n: i + 1, of: r.bounces, speed: r.vi, last: i === r.bounces - 1 });
      }
    }
  }

  function stepBall(g, dt) {
    var b = g.ball, G = gEff(b);
    if (b.held) {
      var rt = g.ritual;
      if (rt.on && rt.player === b.held && g.mode === 'serve') { // ritual de la CPU: el balón sigue la función del bote
        var ox = b.x, oy = b.y, oz = b.z;
        ritualBall(g, b.held, rt, b);
        if (dt > 0) { b.vx = (b.x - ox) / dt; b.vy = (b.y - oy) / dt; b.vz = (b.z - oz) / dt; }
        if (rt.phase === 'dribble') b.spin += dt * 3;
      } else holdPos(g, b.held, b);
      return;
    }
    if (g.mode === 'serve') { // balón lanzado al aire para sacar
      b.vz -= C.G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.spin += dt * 2; return;
    }
    if (g.mode !== 'rally') { // balón muerto: bota y rueda
      b.vz -= C.G * dt; b.z += b.vz * dt;
      if (b.z < C.BR) {
        var sp = Math.abs(b.vz);
        b.z = C.BR; b.vz = sp * 0.45; if (b.vz < 0.7) b.vz = 0;
        if (sp > 1.2) emit(g, { type: 'bounce', x: b.x, y: b.y, speed: sp });
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - 1.2 * dt; b.vy *= 1 - 1.2 * dt; b.spin += dt * Math.hypot(b.vx, b.vy) * 2; return;
    }
    var px = b.x;
    if (b.wobA) { // flotante: baila de lado sin girar
      // aceleración lateral de media nula: desvío máximo ~2A/F² (~0.5 m), sin deriva acumulada
      var ph = b.wobF * (g.time - g.lastTouchT);
      if (g.fl) ph = b.wobF * g.fl.bAge; // fl
      b.vy += b.wobA * b.wobP * Math.cos(ph) * dt; b.vx += b.wobA * 0.25 * Math.sin(ph * 1.7) * dt;
    }
    b.vz -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (g.fl) g.fl.bAge += dt; // fl
    b.spin += dt * (b.wobA ? 0.5 : 9 + b.dip);
    if ((px > 0) !== (b.x > 0)) {
      var ay = Math.abs(b.y);
      if (b.z < C.NET_LOW - C.BR) { fault(g, g.lastTeam, 'under', 'Balón por debajo de la red'); return; }
      if (ay > g.HW - C.BR && ay <= g.HW + C.BR && b.z < C.ANT_TOP + C.BR) {
        g.antennaHit = { x: 0, y: (b.y < 0 ? -1 : 1) * (g.HW + ANT_Y), z: clamp(b.z, C.NET_LOW, C.ANT_TOP) };
        fault(g, g.lastTeam, 'antenna', 'Balón toca la antena'); return;
      }
      if (ay > g.HW) { fault(g, g.lastTeam, 'antenna', 'Balón por fuera de la antena'); return; }
      // por encima de la antena: el espacio de paso sigue la prolongación imaginaria de las antenas hasta el techo
      // (regla 8.4.4). Un balón que cruza en parte por fuera de ella es falta aunque su centro vaya por dentro.
      if (ay > g.HW - C.BR && b.z >= C.ANT_TOP + C.BR) { fault(g, g.lastTeam, 'antenna', 'Balón por fuera de la antena'); return; }
      if (b.z < C.NET_H + C.BR) { // red
        var tape = b.z > C.NET_H - 0.06;
        if (tape && b.z > C.NET_H + 0.02 && g.rng() < 0.55) { // en la cinta y pasa (balón "de red")
          b.vx *= 0.3; b.vy *= 0.6; b.vz = Math.abs(b.vz) * 0.2 + 0.9; b.dip = 0; b.wobA = 0;
        } else {
          b.x = px > 0 ? C.BR : -C.BR; b.vx = -b.vx * 0.25; b.vy *= 0.5; if (b.vz > 0) b.vz *= 0.3; b.dip = 0; b.wobA = 0;
        }
        g.netSince = true;
        emit(g, { type: 'net', x: 0, y: b.y, z: b.z, tape: tape });
        if (g.fl) flContact(g, tape ? 'tape' : 'net'); // fl
      }
      // ataque del saque completado: el balón cruza entero el plano de la red (también tras pasar por la cinta)
      if (g.atkServe && (px > 0) !== (b.x > 0)) { fault(g, g.atkServe.team, g.atkServe.reason || 'attackServe', g.atkServe.text || 'Ataque sobre el saque', g.atkServe.player); return; }
    }
    if (checkAntenna(g)) return;
    checkBlock(g);
    if (g.mode === 'rally') checkBody(g, dt);
    if (b.z <= C.BR && g.mode === 'rally') {
      b.z = C.BR; land(g);
      b.vz = Math.abs(b.vz) * 0.45; b.vx *= 0.5; b.vy *= 0.5; b.dip = 0; b.wobA = 0;
    }
  }
  /* Antena tocada SIN cruzar la red (regla 8.4.3: el balón que toca la antena es "fuera"). Antes solo se
   * pitaba al cruzar el plano de la red por fuera del espacio de paso; un balón que daba en la antena y volvía
   * a su campo seguía en juego. Antena: varilla vertical en x = 0, y = ±(HW + ANT_Y), de la parte baja de la red
   * (NET_LOW) a ANT_TOP (80 cm sobre la red), radio ANT_R. Falta del último equipo que tocó el balón (con un
   * bloqueo, del bloqueador: el balón que toca el bloqueo y luego la antena es punto del atacante). */
  var ANT_R = 0.01, ANT_Y = 0.005;
  function checkAntenna(g) {
    var b = g.ball;
    if (g.mode !== 'rally' || Math.abs(b.x) > C.BR + ANT_R || b.z < C.NET_LOW - C.BR || b.z > C.ANT_TOP + C.BR + ANT_R) return false;
    var dy = Math.abs(b.y) - (g.HW + ANT_Y), dz = b.z > C.ANT_TOP ? b.z - C.ANT_TOP : 0; // por encima: contra la punta
    if (b.x * b.x + dy * dy + dz * dz > (C.BR + ANT_R) * (C.BR + ANT_R)) return false;
    g.antennaHit = { x: b.x, y: (b.y < 0 ? -1 : 1) * (g.HW + ANT_Y), z: Math.min(b.z, C.ANT_TOP) };
    fault(g, g.lastTeam, 'antenna', 'Balón toca la antena');
    return true;
  }

  /** Texto del árbitro para un balón fuera, según el último toque (vocabulario FCVB): "Saque fuera",
   *  "Remate fuera", "Recepción fuera"... El equipo ya lo dice el marcador (antes: "La CPU manda el balón fuera"). */
  function outText(g) {
    var k = g.lastKind, sh = g.lastShot;
    if (k === 'serve') return 'Saque fuera';
    if (k === 'block') return 'Toca el bloqueo y sale fuera';
    if (sh === 'body') return 'Le da en el cuerpo y sale fuera';
    if (sh === 'tip') return g.beach ? 'Pokey fuera' : 'Dejada fuera';
    if (k === 'spike') return 'Remate fuera';
    if (k === 'pass') return g.prevKind === 'serve' ? 'Recepción fuera' : 'Defensa fuera';
    if (k === 'set') return 'Colocación fuera';
    return 'Balón fuera';
  }

  /* ---------- Error arbitral (B1) ----------
   * Distancia firmada (m) del borde de la huella del balón (radio C.IN_TOL = C.BR, el balón dibujado) al borde exterior de la
   * línea más cercana: > 0 la huella pisa la línea o cae dentro (cuánto la pisa), < 0 hueco entre la huella y la línea. Dentro
   * <=> dist >= 0, el mismo criterio para land(), el árbitro, el challenge, la CPU (B3, ai.js leaveServe) y la huella de fx.js. Con |dist| <= 0,10 el árbitro puede cantar al revés (REF_ERR),
   * sin avisar. Gasta g.rng solo en esos botes justos. */
  // Calibrado 9-nov-2026 (antes p 0.35/0.15/0.05): en partido casi no se veía (ver notes/sim.md, «error arbitral visible»).
  // La banda sigue en <= 10 cm; un árbitro solo, sin jueces de línea, con la huella a 1-2 cm de la línea es casi una moneda.
  // Es el error BASE (Partido rápido, sin modificador); los niveles de competición futuros lo escalarán.
  var REF_ERR = VB.REF_ERR = { d1: 0.02, p1: 0.45, d2: 0.05, p2: 0.30, d3: 0.10, p3: 0.15 };
  /** Distancia (m) del borde de la huella del bote (x, y) a la línea más cercana (+ dentro, − fuera; huella de radio C.IN_TOL).
   *  Las líneas son parte del campo: g.HL/g.HW miden hasta su borde EXTERIOR (arena.js las pinta por dentro). g = partida (su
   *  pista: 16×8 en la playa); sin g, la pista de 18×9. */
  function lineDist(x, y, g) {
    var hl = g ? g.HL : C.HL, hw = g ? g.HW : C.HW, ox = Math.abs(x) - hl, oy = Math.abs(y) - hw;
    // centro fuera por las dos líneas (esquina): hueco del DISCO de la huella a la esquina, no un cuadrado de lado R
    if (ox > 0 && oy > 0) return C.IN_TOL - Math.sqrt(ox * ox + oy * oy);
    return Math.min(hl + C.IN_TOL - Math.abs(x), hw + C.IN_TOL - Math.abs(y)); // resto: la línea más cercana (mismo redondeo que antes)
  }
  function refErrP(dist, g) {
    var R = (g && g.refErr) || REF_ERR, a = Math.abs(dist);
    return a < R.d1 ? R.p1 : a < R.d2 ? R.p2 : a <= R.d3 ? R.p3 : 0;
  }
  /** opts.ref → tabla de error arbitral propia (null = la de base, REF_ERR). Valores fuera de rango se ignoran. */
  function refOf(r) {
    if (!r || typeof r !== 'object') return null;
    var o = {}, k, ks = ['d1', 'p1', 'd2', 'p2', 'd3', 'p3'];
    for (var i = 0; i < ks.length; i++) { k = ks[i]; o[k] = typeof r[k] === 'number' && r[k] >= 0 && r[k] <= (k[0] === 'p' ? 1 : 0.5) ? r[k] : REF_ERR[k]; }
    return o;
  }
  /** Challenges por set con opts.ref.chal (0 = sin challenge); sin ella, CHAL.perSet. */
  function chalOf(r) { return r && typeof r.chal === 'number' && r.chal >= 0 ? Math.min(5, Math.floor(r.chal)) : null; }
  function perSet(g) { return g.chalPerSet != null ? g.chalPerSet : CHAL.perSet; }
  /** [ganador, motivo, texto] del punto de un bote según lo que se cante (inside). */
  function landOutcome(g, inside, st) {
    var netTxt = NET_TXT[g.lastKind === 'serve' ? 0 : 1];
    if (inside && st === g.lastTeam && g.netSince) return [1 - st, 'in', netTxt];
    if (inside) return [1 - st, 'in', st === 0 ? LAND_TXT[0] : LAND_TXT[1]];
    // da en la red y cae fuera en el propio campo: nunca cruzó, el árbitro canta "a la red", no "fuera"
    if (st === g.lastTeam && g.netSince) return [1 - g.lastTeam, 'out', netTxt];
    return [1 - g.lastTeam, 'out', outText(g)];
  }
  /** Textos del balón a la red que no pasa (landOutcome): point reconoce el del saque para la seña 'netBall' (FIVB 19: el 1r señala el lado de la red). */
  var NET_TXT = ['Saque a la red', 'Balón a la red'];
  /** ONLINE: los textos del punto que dependen del lado (landOutcome) vistos desde el otro equipo; el resto no cambia. */
  var LAND_TXT = ['El balón cae en tu campo', 'El balón cae en el campo rival'];
  function textMirror(t) { var i = LAND_TXT.indexOf(t); return i < 0 ? t : LAND_TXT[1 - i]; }
  function land(g) {
    var b = g.ball;
    // el balón toca el suelo justo debajo de su centro: dentro si su huella (radio C.BR, la que se ve) toca la línea (las líneas son parte del campo)
    var dist = lineDist(b.x, b.y, g), truthIn = dist >= 0, st = b.x > 0 ? 0 : 1;
    var oT = landOutcome(g, truthIn, st), calledIn = truthIn, oC = oT, oW = landOutcome(g, !truthIn, st);
    // B1: solo si cantar al revés cambia el punto (un balón que no cruzó la red da el mismo punto dentro o fuera)
    var pe = refErrP(dist, g);
    if (pe > 0 && oW[0] !== oT[0] && g.rng() < pe) { calledIn = !truthIn; oC = oW; }
    var inside = calledIn;
    g.lastLand = { x: b.x, y: b.y, inside: inside, t: g.time }; // primer bote (lo lee la cámara en escenas congeladas)
    emit(g, { type: 'land', x: b.x, y: b.y, inside: inside, team: st, speed: Math.abs(b.vz), dist: dist, truthIn: truthIn });
    // alt = lo que se pitaría con la llamada contraria (para anular el punto tras un challenge acertado)
    g._pendCall = { x: b.x, y: b.y, dist: dist, truthIn: truthIn, calledIn: calledIn, wrong: calledIn !== truthIn, team: 1 - oC[0], t: g.time,
      alt: calledIn !== truthIn ? oT : oW, used: oW[0] === oT[0] };
    point(g, oC[0], oC[1], oC[2]);
    cpuChallengeDecide(g);
  }
  function fault(g, t, reason, text, p, sig) { point(g, 1 - t, reason, text, p, sig); }

  /* ---------- Presentación del punto (SIM-01/02/03) ----------
   * Campos AÑADIDOS al evento `point` (y copiados en g.lastPoint) para que cámara, UI, audio, luces y jugadores
   * coincidan en cuánto vale un punto y qué señala el árbitro. Puros y deterministas: no gastan azar ni cambian
   * el flujo del partido (salvo la duración de la pausa con g.present = true). Ver notes/sim.md §P1. */
  /** Señal oficial del árbitro por motivo (reason 'out' y 'serve' se resuelven aparte, ver point()). */
  var SIGNAL = { in: 'in', out: 'out', four: 'four', double: 'double', net: 'net', under: 'under', antenna: 'antenna',
    attackServe: 'attackFault', block: 'attackFault', serve: 'serveFault', backAttack: 'attackFault', backBlock: 'attackFault',
    position: 'attackFault' }; // falta de posición (6v6, humano que recibe): arena.js mira reason y pinta la seña 13 (círculos con el índice)
  /** Pausa del punto con g.present (partido humano): normal, punto grande (highlight >= HOLD.bigAt), set, partido;
   *  `eight` se suma por el cambio de campo a los 8 del set decisivo. */
  var HOLD = VB.HOLD = { routine: 1.9, big: 2.4, bigAt: 0.55, set: 4.0, match: 4.2, eight: 1.4, skipAfter: 0.8, skipTo: 0.3 };
  /** Pausa clásica (demo, autopilot, tests sin g.present): la de siempre. */
  var HOLD_LEGACY = { routine: 1.9, set: 3.6, match: 2.2, eight: 1.4 };
  /** Reglas de VÓLEY PLAYA (g.beach; solo lectura para los demás). Cambio de campo cada `swap` puntos jugados (`swap3` en el 3r
   *  set) con `swapHold` s más de pausa (0 en la demo del menú); colocación de dedos: dobles del HUMANO con nota «poor» según el
   *  desfase |te| (dblSetP: de `dblP0` a |te| = `dblA0` hasta `dblP1` a `dblA1`, ×`dblJump` en salto, tope `dblMax`), la IA con
   *  prob. `dblSet`×`dblSetAI` en un 2º toque «poor» (no en salto); pokey (dejada de nudillos): cima sobre el contacto `pokeyUp` y mínima `pokeyNet` sobre la red.
   *  Sets a 21 y el 3r a 15 (g.points = 21, setTarget), pista 16×8 (C.BEACH), el bloqueo cuenta como toque. */
  var BEACH = VB.BEACH = { swap: 7, swap3: 5, swapHold: 1.0, dblSet: 0.3, dblSetAI: 0.5,
    dblA0: 0.10, dblA1: 0.30, dblP0: 0.08, dblP1: 0.40, dblJump: 1.6, dblMax: 0.7, pokeyUp: 0.25, pokeyNet: 0.6, points: 21, points3: 15 };
  /** Pesos de highlightOf (SIM-01, calibrados en SIM-05; ver notes/sim.md §P3). Solo lectura para los demás módulos. */
  var HL = VB.HL = { base: 0.15, rallyFrom: 4, rally: 0.025, rallyMax: 0.35, dig: 0.08, digMax: 0.3, playMax: 0.4,
    block: 0.4, ace: 0.25, perfectKill: 0.1, setPoint: 0.15, clutch: 0.28, clutchLast: 8, clutchGap: 2, matchPoint: 0.45,
    saved: 0.15, streakAt: 3, streak: 0.1, errorMax: 0.35 };
  /** "Lo grande que ha sido" un punto, 0..1 (SIM-01, calibrado en SIM-05). o = {how, rallyHits, digs, perfectKill, setPoint,
   *  matchPoint, clutch, saved, streak, setWon, matchWon}. Base 0,15 +
   *  - JUGADA (tope conjunto 0,4: con la base, una jugada épica sola ya llega a 0,55): peloteo largo +0,025 por toque a partir
   *    del 5º (máx. 0,35) y +0,08 por defensa de remate (máx. 0,3);
   *  - CÓMO: bloqueo directo +0,4 (un punto de bloqueo siempre es grande), ace +0,25, remate perfecto del humano +0,1;
   *  - PRESIÓN: punto de set +0,15, o final apretado (`clutch`: últimos 8 puntos del set con 2 o menos de diferencia) +0,28,
   *    lo que sea mayor (no se suman: el 24-23 no vale menos que el 23-22); punto de partido +0,45 más;
   *  - salvar un punto de set/partido +0,15; racha de 3 o más +0,1.
   *  Un error se queda en 0,35 como mucho salvo que cierre el set o el partido. Redondeado a milésimas. */
  function highlightOf(o) {
    var play = Math.min(HL.rallyMax, HL.rally * Math.max(0, (o.rallyHits || 0) - HL.rallyFrom)) + Math.min(HL.digMax, HL.dig * (o.digs || 0));
    var h = HL.base + Math.min(HL.playMax, play);
    if (o.how === 'block') h += HL.block;
    if (o.how === 'ace') h += HL.ace;
    if (o.perfectKill) h += HL.perfectKill;
    h += Math.max(o.setPoint ? HL.setPoint : 0, o.clutch ? HL.clutch : 0);
    if (o.matchPoint) h += HL.matchPoint;
    if (o.saved) h += HL.saved;
    if (o.streak >= HL.streakAt) h += HL.streak;
    if (o.how === 'error' && !o.setWon && !o.matchWon) h = Math.min(h, HL.errorMax);
    return Math.round(clamp(h, 0, 1) * 1000) / 1000;
  }
  /** Final apretado (SIM-05): con el marcador de ANTES del punto, el que va delante está en los últimos HL.clutchLast puntos
   *  del set (>= 17 de 25, >= 7 de 15) y la diferencia es de HL.clutchGap o menos. */
  function clutchOf(s0, s1, tgt) { return Math.max(s0, s1) >= tgt - HL.clutchLast && Math.abs(s0 - s1) <= HL.clutchGap; }

  /** Asigna punto. reason: 'in'|'out'|'antenna'|'under'|'double'|'four'|'net'|'serve'|'block'|'attackServe'.
   *  sig: señal del árbitro explícita (solo la falta de saque: 'delay8' | 'delay5' (playa) | 'serveFault'). */
  function point(g, w, reason, text, p, sig) {
    if (g.fl && !g.fl.app && !g.fl.loc[g.fl.own]) { g.fl.guard++; return; } // fl
    if (g.drill) return drillPoint(g, w, reason, text, p, sig); // E6: en el Entrenamiento el punto cierra la repetición (sin marcador)
    if (g.mode !== 'rally' && g.mode !== 'serve') { g._pendCall = null; return; }
    // B2: llamada de este punto (solo si acaba en bote) e instantánea del estado previo para poder anularlo
    g.call = g._pendCall; g._pendCall = null; g.cpuChal = null; g.digTight = false; if (g.online) { aimOff(g); g.skipReq[0] = g.skipReq[1] = false; } else g.aim3.on = false;
    if (g.call) { g.call.team = 1 - w; g.call.t = g.time; g.call.setNo = g.setNo; g._snap = snapOf(g); } else g._snap = null;
    if (g.fl && g.call) g.call.r = g.fl.r; // fl
    g.score[w]++; g.mode = 'point'; g.ball.held = null; endSwingX(g);
    if (g.fl && !g.fl.app) g.fl.pts.push({ r: g.fl.r, w: w, reason: reason, text: text, pid: p ? p.id : -1, sig: sig || null, T: g.fl.T, m: flMeta(g), hs: g.fl.hs, lf: g.fl.lf, lfp: g.fl.lfPar, cl: flCall(g.call) }); // fl
    if (g.subsOn) { g._subU = g._snap ? subUndo(g) : null; subCount(g); }   // banquillo: puntos en pista (g.meR, p.onR), del partido (g.rallyN) y cansancio
    var sideout = w !== g.serving;
    if (g.stats) { g.stats.points++; g.stats.won[w]++; g.stats.how = g.stats.how || {}; g.stats.why[text] = (g.stats.why[text] || 0) + 1; g.stats.rallies.push(g.rally.t); }
    // challenge: contadores que suma este punto, para que endReview los deshaga si se revoca (rutas en g.stats; solo estadísticas: sin g.rng ni estado)
    var su = g.stats && g._snap ? [['why', text]] : null; if (g.stats) g.stats._undo = su;
    emit(g, { type: 'whistle', reason: 'point' });
    // cómo se ganó (para UI/público): ace, kill (remate), tip (dejada), block, error, free
    var how = 'error';
    // (sin mirar g.netSince: un saque o remate que roza la cinta y cae dentro sin que nadie lo toque es ace/kill legal;
    //  el balón 'a la red' que cae en su propio campo ya tiene lastTeam !== w)
    if (reason === 'in' && g.lastTeam === w) {
      how = g.lastKind === 'serve' ? 'ace' : g.lastKind === 'block' ? 'block' : g.lastKind === 'spike' ? 'kill' : g.lastShot === 'tip' ? 'tip' : 'free';
    } else if ((reason === 'out' || reason === 'in') && g.lastKind === 'block' && g.lastTeam !== w && !g.netSince) how = 'kill'; // block-out / remate que pasa tocando el bloqueo
    // el rival tocó una sola vez el ataque/saque y no lo salvó (recepción/defensa desviada): mérito del que atacó/sacó
    if (how === 'error' && (reason === 'in' || reason === 'out') && g.atkTeam === w && g.lastTeam !== w && g.rally.hits - g.atkHits <= 1 &&
        g.lastPlayer && (g.lastShot === 'shank' || g.lastPlayer.grade === 'poor')) how = g.atkHow;
    // insignias: asistencia (colocador del remate que gana el punto) y block-out (remate que toca el bloqueo rival y sale)
    var assist = how === 'kill' && g.atkHow === 'kill' && g.atkTeam === w ? (g.atkSet || null) : null;
    var tool = g.lastKind === 'block' && g.prevKind === 'spike' && g.lastTeam !== w && (reason === 'out' || reason === 'antenna');
    if (g.subsOn) subPerf(g, w, how, p); // banquillo: rendimiento del set (p.perf) para el entrenador
    // E1: jugada de maestría con la que se ganó el punto ('' sin g.mastery): la etiqueta del último ataque del equipo que gana si el
    // punto es suyo (remate o dejada; también el block-out)
    var move = g.feintOn && g.atkTeam === w && (how === 'kill' || how === 'tip') ? g.atkMove : ''; // (g.feintOn: con g.mastery o la finta del 6v6)
    if (move && g.stats) { var sm = g.stats.mastery;
      if (move === 'quick') { if (w === 0) { sm.quick[1]++; if (su) su.push(['mastery', 'quick', 1]); } }
      else if (g.atkHuman) { sm[move][1]++; if (su) su.push(['mastery', move, 1]); if (tool && move === 'edge') { sm.tool++; if (su) su.push(['mastery', 'tool']); } }
      else if (w === 1 && move === 'roll') { sm.cpu.roll[1]++; if (su) su.push(['mastery', 'cpu', 'roll', 1]); } }
    // salto con impulso: punto del remate con impulso / pipe del humano (g.stats.dj; g.djLast lo deja hit)
    if (g.stats && g.stats.dj && how === 'kill' && g.atkHow === 'kill' && g.atkTeam === w && g.djLast.team === w) {
      if (g.djLast.mom) { g.stats.dj.mom[1]++; if (su) su.push(['dj', 'mom', 1]); }
      if (g.djLast.pipe) { g.stats.dj.pipe[1]++; if (su) su.push(['dj', 'pipe', 1]); }
    }
    if (g.stats) {
      var sk = how === 'ace' ? 'aces' : how === 'kill' ? 'kills' : how === 'block' ? 'stuffPts' : '';
      if (sk) { g.stats[sk][w]++; if (su) su.push([sk, w]); }
      if (p) { g.stats.faults[reason] = (g.stats.faults[reason] || 0) + 1; if (su) su.push(['faults', reason]); }
    }
    // ¿cierra el set / el partido? ¿cambio de campo a los 8 del set decisivo? (se decide aquí para que el evento lo lleve)
    var tgt = setTarget(g), a = g.score[0], bb = g.score[1], half = Math.ceil(tgt / 2);
    var setWon = g.score[w] >= tgt && g.score[w] - g.score[1 - w] >= 2, matchWon = setWon && (g.sets[w] === (g.toWin || 2) - 1 || !!g.bo1); // (g.bo1: online a un set; g.toWin 1: la prueba de la Carrera)
    var eight = !g.beach && !setWon && g.setNo === 3 && !g.courtSwap3 && g.score[w] === half && g.score[1 - w] < half;
    // playa: cambio de campo cada BEACH.swap puntos jugados (cada BEACH.swap3 en el 3r set), sin parar el juego
    var bswap = g.beach && !setWon && (a + bb) % (g.setNo === 3 ? BEACH.swap3 : BEACH.swap) === 0;
    // contexto (SIM-01): racha en el set, punto de set/partido salvado, defensas de remate del peloteo
    if (g.streakTeam === w) g.streakN++; else { g.streakTeam = w; g.streakN = 1; }
    var saved = g.setPoint === 1 - w, digs = g.rally.digs;
    var clutch = clutchOf(a - (w === 0 ? 1 : 0), bb - (w === 1 ? 1 : 0), tgt);
    var perfectKill = how === 'kill' && g.atkHow === 'kill' && g.atkHuman && g.atkGrade === 'perfect';
    var hl = highlightOf({ how: how, rallyHits: g.rally.hits, digs: digs, perfectKill: perfectKill, setPoint: g.setPoint !== -1,
      matchPoint: g.matchPoint !== -1, clutch: clutch, saved: saved, streak: g.streakN, setWon: setWon, matchWon: matchWon });
    var ll = g.lastLand, landSide = (reason === 'in' || reason === 'out') && ll && ll.t === g.time ? (ll.x > 0 ? 0 : 1) : -1;
    // señal oficial (SIM-02; Guidelines FIVB 2025, regla 28.11). 'touched' (balón tocado y fuera): sale FUERA en el campo del
    // último que lo tocó, que no es el sacador: el ataque rival cruzó y lo tocó la defensa (su bloqueo o su primer toque) y se va
    // fuera por detrás (28.11.2), o lo juega su equipo (1.º, 2.º o 3.er toque) y se le va fuera en su propio campo (28.11.3).
    // Si el balón vuelve tras el bloqueo y cae fuera en el campo del ATACANTE, es «fuera» (28.11.1): ya no es tocado
    var ownOut = reason === 'out' && landSide >= 0 && landSide === g.lastTeam && g.lastKind !== 'serve';
    // remate (o balón de ataque) a la red que cae fuera en su campo sin tocar el bloqueo: «fuera» y señalar al atacante (28.11.4)
    var netAtk = ownOut && g.netSince && (g.lastKind === 'spike' || g.lastKind === 'free');
    var touchedOut = ownOut && !netAtk;
    var signal = sig || (reason === 'out' ? (touchedOut ? 'touched' : 'out') : SIGNAL[reason] || reason);
    // SAQUE a la red que no pasa (cae en el propio campo, dentro o fuera): seña FIVB 19 (D11: «served ball fails to pass»), el 1r
    // señala el lado de la red. reason sigue siendo 'in'/'out' (lo leen las estadísticas, matchstats y rating). El resto de balones a la
    // red: dentro en su campo = «dentro»; fuera = el remate «fuera» + atacante (netAtk) y el pase o la colocación «tocado»
    var netBall = (reason === 'in' || reason === 'out') && g.lastKind === 'serve' && NET_TXT.indexOf(text) >= 0;
    if (netBall && !sig) signal = 'netBall';
    // quién comete la falta (para el árbitro): -1 = bote dentro/fuera normal, sin infractor; si no, el que pierde el punto. faultPlayer:
    // el infractor que viaja (p) o, si no viaja (bajo la red, antena, tocado, a la red), el último que tocó si es de ese equipo.
    // Falta de posición: players = [infractor, compañero del primer par solapado] (overlapMate). Solo lectura: sin g.rng ni estado
    var faultTeam = (reason === 'in' || reason === 'out') && !netBall && !touchedOut && !netAtk ? -1 : 1 - w;
    var faultPlayer = faultTeam < 0 ? null : p || (g.lastPlayer && g.lastPlayer.team === faultTeam ? g.lastPlayer : null);
    var posPl = reason === 'position' && p ? [p, overlapMate(g, p.team, p)] : null;
    if (posPl && !posPl[1]) posPl.length = 1;
    // pausa del punto (SIM-03): con g.present (partido humano) más larga para los momentos grandes; si no, la de siempre
    var hold;
    if (g.present) hold = matchWon ? HOLD.match : setWon ? HOLD.set : (hl >= HOLD.bigAt ? HOLD.big : HOLD.routine) + (eight ? HOLD.eight : 0) + (bswap ? BEACH.swapHold : 0);
    else hold = matchWon ? HOLD_LEGACY.match : setWon ? HOLD_LEGACY.set : (g.demo ? RITUAL.demoHold : HOLD_LEGACY.routine) + (eight ? HOLD_LEGACY.eight : 0) + (bswap && !g.demo ? BEACH.swapHold : 0);
    if (g.online && setWon && !matchWon) hold = ONLINE.setPause; // ONLINE: 10 s entre sets (los dos «Continuar» la saltan)
    g.timer = hold; g.hold = hold;
    var ev = emit(g, { type: 'point', team: w, reason: reason, text: text, how: how, score: [g.score[0], g.score[1]],
      sideout: sideout, rallyTime: g.rally.t, rallyHits: g.rally.hits, setWon: setWon, matchWon: matchWon, player: p || null,
      lastKind: g.lastKind, lastShot: g.lastShot,
      highlight: hl, digs: digs, streak: g.streakN, savedSetPoint: saved, clutch: clutch,
      signal: signal, touchedOut: touchedOut, landSide: landSide, hold: hold, assist: assist, tool: tool, move: move,
      faultTeam: faultTeam, faultPlayer: faultPlayer });
    if (posPl) ev.players = posPl;
    if (g.online) ev.text1 = textMirror(text); // ONLINE: el mismo texto visto desde el equipo 1 (el invitado); text es el del anfitrión
    if (reason === 'antenna') ev.antenna = g.antennaHit ? [g.antennaHit.x, g.antennaHit.y, g.antennaHit.z] : null; // null = por fuera de la antena
    g.lastPoint = { team: w, reason: reason, text: text, how: how, highlight: hl, digs: digs, streak: g.streakN, savedSetPoint: saved, clutch: clutch,
      signal: signal, touchedOut: touchedOut, landSide: landSide, hold: hold, setWon: setWon, matchWon: matchWon, assist: assist, tool: tool, move: move };
    if (g.stats) { g.stats.how[how] = (g.stats.how[how] || 0) + 1; if (su) su.push(['how', how]); }
    if (sideout) { // cambio de saque: rota el sacador del equipo que recupera el saque
      g.serving = w;
      if (g.rot) rotate(g, w); else g.serverIdx[w] = (g.serverIdx[w] + 1) % g.teams[w].length; // 6v6: rota el equipo
      emit(g, { type: 'sideout', team: w });
      if (g.rot) emit(g, { type: 'rotation', team: w, rot: g.rot[w].map(function (q) { return q.num; }), server: g.rot[w][0] }); // dorsales por zona 1-6
    }
    if (setWon) {
      g.sets[w]++; g.setScores.push([a, bb]);
      if (matchWon) {
        g.mode = 'over';
        emit(g, { type: 'set', team: w, setNo: g.setNo, score: [a, bb], sets: [g.sets[0], g.sets[1]] });
        emit(g, { type: 'match', team: w, sets: [g.sets[0], g.sets[1]], setScores: g.setScores.slice() });
      } else {
        g.pendingSet = true; // (la pausa ya incluye la del cambio de campo)
        emit(g, { type: 'set', team: w, setNo: g.setNo, score: [a, bb], sets: [g.sets[0], g.sets[1]] });
        courtChange(g, 'set');
      }
    } else if (eight) {
      // Regla 18.2.2: en el set decisivo, cuando un equipo llega a 8 puntos se cambia de campo (sin demora)
      g.courtSwap3 = true;
      courtChange(g, 'eight');
    } else if (bswap) {
      g.courtSwapAt = a + bb;
      courtChange(g, 'swap'); // playa (reglas de vóley playa 18.2): cada 7 / cada 5
    }
    if (g.fl) { g.fl.r++; g.fl.seq = 0; g.fl.par = 0; g.fl.khAt = -1; g.fl.lf = -1; g.fl.fqK.length = 0; } // fl
  }
  /* ---------- Entrenamiento (E6, sprint 5): ejercicios con repeticiones cortas y peloteo libre ----------
   * createGame({drill}) crea g.drill (mkDrill) y, en lugar del primer saque, drillStage monta la situación. Cada repetición acaba por
   * un punto (point → drillPoint: sin marcador, sin `point`/`whistle`/`gameOver`), por un toque (drillOnHit: recepción y bloqueo) o
   * por un bloqueo (drillOnBlock). La nota sale de VB.Sim.drillScore (pura). Tras DRILL.hold s, drillStage monta la siguiente; tras la
   * última, `drillEnd` y g.drill.done (modo 'point' quieto: main.js pasa a 'over'). Peloteo libre ('free'): partido normal sin marcador
   * con el saque alternando; cada punto da `drillRep {hits, best, isBest}`. Todo detrás de g.drill (null fuera del modo): la huella 2v2
   * no cambia. Coordenadas de la pista de 18×9 (equipo 0 en x > 0) multiplicadas por g.cs. Ver notes/sim.md «E6». */
  var NOREF = { d1: 0, p1: 0, d2: 0, p2: 0, d3: 0, p3: 0 };   // árbitro sin error (refOf)
  /** Datos de los ejercicios (solo lectura). medals = umbrales de bronce/plata/oro calibrados con los bots de simtest «Gimnasio» (5):
   *  la propuesta de E6 (12/18/24, bloqueo 10/16/22) regalaba la plata al novato en Recepción y Colocación y el bloqueo no lo pasaba
   *  nadie (los bots no bajan el bloqueo a tiempo como un humano, pero el perfecto con bloqueo activo saca 4-10). gym.js debe leer estos. */
  var DRILL = VB.DRILL = {
    hold: 1.1,                                    // s entre repeticiones (pausa del «punto»)
    order: ['serve', 'recv', 'set', 'atk', 'block', 'free'],
    kinds: {
      // diana del saque (fija en cada repetición) y radios de «¡Diana!» / «Cerca»; +1 al saque en salto perfecto que cae dentro
      serve: { of: 10, r: [0.8, 1.6], medals: [12, 18, 24],
        targets: [[-7.6, -3.4], [-7.6, 3.4], [-4.2, 0], [-8.2, 0], [-6, -3.8], [-6, 3.8], [-3.6, -3.2], [-3.6, 3.2], [-8.3, -3.9], [-8.3, 3.9]] },
      // zona del colocador y radios de «Perfecta» / «Buena»; tipo de saque de la CPU (1 = en salto) y error (m) de su diana sobre el humano
      recv: { of: 10, zone: [1.6, 0], r: [1.0, 2.2], medals: [18, 24, 28], srvJump: [false, false, true, false, true, false, true, true, false, true], jit: 1.2 },
      set: { of: 10, medals: [16, 22, 27] },
      // diana del remate (y × lado del ataque: diagonal corta, línea, fondo) y su radio; bloqueador CPU desde la repetición blockFrom (0-based)
      atk: { of: 10, r: 1.2, medals: [12, 18, 23], targets: [[-3.0, -3.2], [-7.2, 3.6], [-8, 0]], blockFrom: 5 },
      // lado del ataque de la CPU por repetición (-1 = izquierda del humano, y < 0; 1 = derecha); net = m de la red para «dejada leída»
      block: { of: 10, medals: [6, 11, 16], sides: [-1, 1, -1, -1, 1, 1, -1, 1, 1, -1], net: 2 },
      free: { of: 0 }
    }
  };
  /** Rótulo corto de cada resultado (drillRep.text; la UI añade «+3»). */
  var DRILL_TEXT = VB.DRILL.text = { bull: '¡Diana!', near: 'Cerca', in: 'Dentro', out: 'Fuera', net: 'A la red', perfect: 'Perfecta',
    good: 'Buena', fair: 'Justa', poor: 'Floja', miss: 'Fallo', ace: 'Ace', stuff: 'Bloqueo', soft: 'Amortiguado', touch: 'Toque',
    tool: 'Manos fuera', read: 'Leída', none: 'Sin bloqueo', tip: 'Dejada dentro' };
  function mkDrill(kind) {
    var K = DRILL.kinds[kind];
    return dblFields({
      kind: kind, n: 0, of: K.of, total: 0, pts: 0,
      last: null,                     // resultado de la última repetición {pts, res, text, d}
      target: null,                   // {x, y, r, r2} (diana / zona del ejercicio, mundo) o null: lo pinta fx.js
      idle: [false, false],           // equipo cuyos jugadores no juegan (salvo el del humano)
      cpu: '',                        // '' | 'block' (Remate desde la 6ª: el rival n.º 3 solo bloquea)
      mateIdle: false,                // el compañero no juega
      best: 0,                        // peloteo libre: peloteo más largo (toques del equipo 0); resto: mejor repetición
      done: false,
      srvJump: K.srvJump ? K.srvJump.slice() : null,
      reps: [],                       // puntos de cada repetición
      // estado interno de la repetición en curso
      _t: dblFields({ x: 0.5, y: 0.5, r: 0.5, r2: 0.5 }),
      side: 1, jumped: false, tip: false, grade: '', jset: false, jump: false, ak: '', blk: '', mateAtk: false, cnt: 0,
      recOn: false, recX: 0.5, recY: 0.5
    });
  }
  /** ¿p no juega en este ejercicio? (nunca el jugador del humano). Recepción: el compañero no recibe (sí coloca después). */
  function drillIdle(g, p) {
    var d = g.drill;
    if (p === g.ctrl) return false;
    if (p.team === 0) return d.mateIdle || (d.kind === 'recv' && g.touchTeam !== 0);
    if (d.idle[1]) return true;
    return d.cpu === 'block' && p !== g.teams[1][0];
  }
  /** Tras computeJob: si le toca a uno que no juega, va el del humano (equipo 0) o nadie (equipo 1). */
  function drillJobs(g) {
    var j0 = g.jobs[0], j1 = g.jobs[1];
    if (j0 && drillIdle(g, j0)) g.jobs[0] = g.ctrl;
    if (j1 && drillIdle(g, j1)) g.jobs[1] = null;
  }
  /** Monta la repetición en curso (o el saque del peloteo libre). Pública para las pruebas. Emite drillStage {kind, n, of, target}
   *  (target = [x, y, r] o null). */
  function drillStage(g) {
    var d = g.drill; if (!d || d.done) return;
    var k = d.kind, K = DRILL.kinds[k], n = d.n, cs = g.cs, t = d._t, i;
    d.jumped = false; d.tip = false; d.grade = ''; d.jset = false; d.jump = false; d.ak = ''; d.blk = ''; d.mateAtk = false; d.cnt = 0; d.recOn = false;
    d.idle[0] = false; d.idle[1] = k === 'serve' || k === 'recv' || k === 'set' || (k === 'atk' && n < K.blockFrom);
    d.cpu = k === 'atk' && n >= K.blockFrom ? 'block' : '';
    d.mateIdle = k === 'serve' || k === 'atk' || k === 'block';
    d.side = k === 'block' ? K.sides[n % K.sides.length] : n % 2 ? -1 : 1;
    d.target = null;
    if (k === 'serve') { var st = K.targets[n % K.targets.length]; t.x = st[0] * cs; t.y = st[1] * cs; t.r = K.r[0] * cs; t.r2 = K.r[1] * cs; d.target = t; }
    else if (k === 'recv') { t.x = K.zone[0] * cs; t.y = K.zone[1] * cs; t.r = K.r[0] * cs; t.r2 = K.r[1] * cs; d.target = t; }
    else if (k === 'atk') { var at = K.targets[n % K.targets.length]; t.x = at[0] * cs; t.y = at[1] * d.side * cs; t.r = K.r * cs; t.r2 = K.r * cs; d.target = t; }
    if (k === 'serve' || k === 'recv' || k === 'free') {
      if (k === 'serve') { g.serving = 0; g.serverIdx[0] = g.ctrl.idx; }
      else if (k === 'recv') { g.serving = 1; g.serverIdx[1] = 0; }
      setupServe(g);
      if (k === 'serve') for (i = 0; i < 2; i++) { var q = g.teams[1][i]; q.x = -4.5 * cs; q.y = (i ? 1 : -1) * (g.HW + 1.2); } // rivales en la banda
      // recepción: el compañero espera ya en la zona del colocador (la recepción va a su y: hit, clamp(mate.y)); no se mueve hasta que recibes
      if (k === 'recv') { var mr = other(g, g.ctrl); mr.x = K.zone[0] * cs + 0.4 * cs; mr.y = K.zone[1] * cs; }
    } else drillRally(g, k, d.side);
    emit(g, { type: 'drillStage', kind: k, n: n, of: d.of, target: d.target ? [t.x, t.y, t.r] : null });
  }
  /** Montaje de peloteo (Colocación, Remate, Bloqueo): el STAGE de tools/jsetdrill.js pasado a la sim, con el reseteo de setupServe. */
  function drillRally(g, k, s) {
    var cs = g.cs, h = g.ctrl, m = other(g, h), o0 = g.teams[1][0], o1 = g.teams[1][1], b = g.ball, i, p, v;
    for (i = 0; i < g.players.length; i++) {
      p = g.players[i]; p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; p.anim = 0; p.bd = 0; p.bdT = 0.12;
      p.onGround = true; p.lastAction = ''; p.actionT = 99; p.jvx = p.jvy = p.lvx = p.lvy = p.rvx = p.rvy = 0; p.down = 0; p.cool = 0; p.avx = p.avy = p.dj = p.jF = p.tkX = p.tkY = p.landT = 0;
      p.shot = ''; p.aiTeT = -1; p.tgTime = -9;
    }
    endRitual(g);
    g.mode = 'rally'; g.serveState = 'ready'; g.serveJump = false; g.timer = 0;
    g.lastLand = null; g.antennaHit = null; g.atkServe = null; g.call = null; g._pendCall = null; g.cpuChal = null;
    g.hardIn = false; g.digOk = true; g.digK = 0; g.feintFool = false; g.prevKind = ''; g.atkTeam = -1; g.atkHow = ''; g.atkHuman = false; g.atkGrade = ''; g.atkSet = null;
    g.rally.t = 0; g.rally.hits = 0; g.rally.digs = 0; g.jobs[0] = g.jobs[1] = null;
    endSwing(g); g.swingLock = 0; g.jsetQ = 0; g.setWinOn = false; g.setCarry = -1; g.setDirA = NaN; g.blockCD = 0; g.netSince = false; g.digTight = false; g.aim3.on = false; g.aim3.kind = ''; g.aimCarry = 0;
    g.atkMove = ''; g.atkEdge = 0; g.lastTempo = ''; g.feintT = -9; g.chain = 0; g.chainH = 0; g.defRole = '';
    g.blockOff[0] = g.blockOff[1] = 0;
    var sx = -4.5 * cs, sy = g.HW + 1.2; // banda rival (los que no juegan)
    o0.x = sx; o0.y = -sy; o1.x = sx; o1.y = sy;
    b.held = null; b.dip = 0; b.wobA = 0; b.spin = 0;
    if (k === 'set') { // el compañero recibe en (5,5 ; ∓1,4) y el balón sube alto hacia el humano en (2,1 ; ±0,6)
      m.x = 5.5 * cs; m.y = -1.4 * s * cs; h.x = 2.1 * cs; h.y = 0.6 * s * cs;
      b.x = m.x; b.y = m.y; b.z = 0.9;
      var vz = Math.sqrt(2 * C.G * (4.4 - 0.9)), T = vz / C.G + Math.sqrt(2 * (4.4 - 1.9) / C.G);
      b.vx = (1.9 * cs - b.x) / T; b.vy = (h.y - b.y) / T; b.vz = vz;
      g.touchTeam = 0; g.touches = 1; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'pass'; g.lastShot = 'forearm'; g.lastQ = 0.9;
    } else if (k === 'atk') { // el compañero coloca desde (1 ; 0) a (1,2 ; ±2,8) con cima 4,6; el humano en (3,4 ; ±2,6)
      m.x = 1.0 * cs; m.y = 0; h.x = 3.4 * cs; h.y = 2.6 * s * cs;
      b.x = m.x; b.y = m.y; b.z = 2.4;
      v = launchApex(b, 1.2 * cs, 2.8 * s * cs, 3.2, 4.6); b.vx = v[0]; b.vy = v[1]; b.vz = v[2];
      g.touchTeam = 0; g.touches = 2; g.lastPlayer = m; g.lastTeam = 0; g.lastKind = 'set'; g.lastShot = 'overhead'; g.lastQ = 0.9;
      if (g.drill.cpu === 'block') { o0.x = -1.2 * cs; o0.y = 1.0 * s * cs; g.blockOff[1] = rnd(g, 0.35 + 0.9 * (1 - g.prof[1].block)); }
    } else { // block: el colocador rival (n.º 9) coloca a su atacante (n.º 3) por un lado; el humano en la red, el compañero atrás
      o1.x = -1.0 * cs; o1.y = 0; o0.x = -4.6 * cs; o0.y = 2.6 * s * cs;
      h.x = 0.8 * cs; h.y = 0; m.x = 6.0 * cs; m.y = -1.5 * s * cs;
      b.x = o1.x; b.y = o1.y; b.z = 2.4;
      v = launchApex(b, -1.5 * cs, 2.6 * s * cs, 3.0, 5.0); b.vx = v[0]; b.vy = v[1]; b.vz = v[2];
      g.touchTeam = 1; g.touches = 2; g.lastPlayer = o1; g.lastTeam = 1; g.lastKind = 'set'; g.lastShot = 'overhead'; g.lastQ = 0.9;
      g.defRole = 'block';
    }
    b.speed = Math.hypot(b.vx, b.vy, b.vz);
    g.lastTouchT = g.time;
    refreshPred(g);
  }
  /** Puntos de una repetición (pura: solo lee ctx; devuelve un objeto nuevo {pts 0..3, res, text, d}). ctx por ejercicio:
   *  serve {land: {x, y, inside} | null (primer bote del saque; null = red, antena o falta), tx, ty, cs, jump, grade}
   *  recv  {touched, x, y (cruce a 1 m del balón tras la recepción), own (cae en el propio campo y es jugable), tx, ty, cs}
   *  set   {grade ('' sin colocación), jset, spikeIn}
   *  atk   {kind 'spike'|'tip'|'free'|'' (ataque del humano), land {x, y, inside} | null, block ''|'stuff'|'soft'|'tool'|'touch', tx, ty, cs}
   *  block {block ''|'stuff'|'soft'|'touch'|'tool', tip, jumped, read (la dejada cae a menos de DRILL.kinds.block.net m de la red o la toca el equipo 0)}
   *  res: 'bull'|'near'|'in'|'out'|'net'|'perfect'|'good'|'fair'|'poor'|'miss'|'ace'|'stuff'|'soft'|'touch'|'tool'|'read'|'none'|'tip';
   *  d = distancia (m) a la diana o a la zona (-1 si no aplica). */
  function drillScore(kind, c) {
    c = c || {};
    var K = DRILL.kinds[kind], pts = 0, res = 'miss', d = -1, cs = c.cs || 1;
    if (kind === 'serve') {
      var L = c.land;
      if (!L) res = 'net';
      else if (!(L.inside && L.x < 0)) res = 'out';
      else {
        d = Math.hypot(L.x - c.tx, L.y - c.ty);
        if (d <= K.r[0] * cs) { pts = 3; res = 'bull'; } else if (d <= K.r[1] * cs) { pts = 2; res = 'near'; } else { pts = 1; res = 'in'; }
        if (c.jump && c.grade === 'perfect') pts = Math.min(3, pts + 1);
      }
    } else if (kind === 'recv') {
      if (!c.touched) res = 'ace';
      else {
        d = Math.hypot(c.x - c.tx, c.y - c.ty);
        if (!c.own) res = 'miss';
        else if (d <= K.r[0] * cs) { pts = 3; res = 'perfect'; } else if (d <= K.r[1] * cs) { pts = 2; res = 'good'; } else { pts = 1; res = 'fair'; }
      }
    } else if (kind === 'set') {
      if (c.grade) {
        pts = c.grade === 'perfect' ? 2 : c.grade === 'good' ? 1 : 0;
        if (c.jset && c.grade === 'perfect') pts++;
        if (c.spikeIn) pts++;
        pts = Math.min(3, pts); res = c.grade;
      }
    } else if (kind === 'atk') {
      var A = c.land;
      if (c.block === 'stuff' || c.block === 'soft') res = c.block;
      else if (c.block === 'tool' || c.block === 'touch') { pts = 1; res = c.block; }
      else if (!c.kind) res = 'miss';
      else if (!A) res = 'net';
      else if (!(A.inside && A.x < 0)) res = 'out';
      else if (c.kind === 'spike') {
        d = Math.hypot(A.x - c.tx, A.y - c.ty);
        if (d <= K.r * cs) { pts = 3; res = 'bull'; } else { pts = 2; res = 'in'; }
      } else { pts = 1; res = c.kind === 'tip' ? 'tip' : 'in'; }
    } else if (kind === 'block') {
      var bk = c.block || '';
      pts = bk === 'stuff' ? 3 : bk === 'soft' ? 2 : bk === 'touch' ? 1 : 0;
      res = bk || 'none';
      if (c.tip && !c.jumped && c.read) { pts = Math.min(3, pts + 1); res = 'read'; }
    }
    return { pts: pts, res: res, text: DRILL_TEXT[res] || '', d: d };
  }
  var _dpr = { x: 0, y: 0, z: 0, t: 0 };
  /** Nota del toque (hit/doServe, tras emitir `hit`). Recepción: el 2º toque (el compañero coloca) cierra la repetición;
   *  Bloqueo: cualquier toque del equipo 0 la cierra (el ataque ya ha pasado); peloteo libre: cuenta los toques del equipo 0. */
  function drillOnHit(g, e) {
    var d = g.drill, k = d.kind, p = e.player;
    if (k === 'free') { if (e.team === 0 && e.kind !== 'serve') d.cnt++; return; }
    if (k === 'serve') { if (e.kind === 'serve') { d.jump = g.serveJump; d.grade = e.grade; } return; }
    if (k === 'recv') {
      if (e.team !== 0) return;
      if (e.touch === 1 && !d.recOn) { predict(g, 1, _dpr); d.recOn = true; d.recX = _dpr.x; d.recY = _dpr.y; d.grade = e.grade; }
      else if (e.touch >= 2) drillFinish(g, 0, 'drill', '');
      return;
    }
    if (k === 'set') {
      if (e.team !== 0) return;
      if (p === g.ctrl && !d.grade && e.kind === 'set') { d.grade = e.grade; d.jset = !!e.jset; }
      else if (p !== g.ctrl && d.grade && (e.kind === 'spike' || e.shot === 'tip')) d.mateAtk = true;
      return;
    }
    if (k === 'atk') {
      if (e.team === 0 && p === g.ctrl && !d.ak) d.ak = e.kind === 'spike' ? 'spike' : e.shot === 'tip' ? 'tip' : 'free';
      return;
    }
    if (k === 'block') {
      if (e.team === 1 && (e.kind === 'spike' || e.shot === 'tip')) d.tip = e.shot === 'tip';
      else if (e.team === 0) { d.recOn = true; drillFinish(g, 0, 'drill', ''); } // (recOn: el equipo 0 la ha tocado)
    }
  }
  /** Bloqueo durante el ejercicio (checkBlock, tras emitir `block`): cierra la repetición en Remate (bloqueo rival) y Bloqueo (el del humano). */
  function drillOnBlock(g, kindB, q) {
    var d = g.drill;
    if ((d.kind === 'atk' && q.team === 1) || (d.kind === 'block' && q.team === 0)) { d.blk = kindB; drillFinish(g, q.team, 'block', ''); }
  }
  /** point() con g.drill: cierra la repetición (o el peloteo del libre). */
  function drillPoint(g, w, reason, text, p, sig) {
    if (g.mode !== 'rally' && g.mode !== 'serve') { g._pendCall = null; return; }
    drillFinish(g, w, reason, text);
  }
  /** Cierre de repetición: modo 'point' DRILL.hold s, g.lastPoint neutro (how 'drill'), `drillRep` y, en la última, `drillEnd`.
   *  No toca marcador, sets, estadísticas ni challenge, ni emite `point`/`whistle`/`gameOver`. */
  function drillFinish(g, w, reason, text) {
    var d = g.drill, k = d.kind, K = DRILL.kinds[k], t = d._t, b = g.ball, ll = g.lastLand;
    var landNow = ll && ll.t === g.time && (reason === 'in' || reason === 'out') ? ll : null;
    g.call = null; g._pendCall = null; g.cpuChal = null; g.digTight = false; g.aim3.on = false;
    g.mode = 'point'; b.held = null; endSwing(g);
    g.timer = DRILL.hold; g.hold = DRILL.hold;
    g.lastPoint = { team: w, reason: reason, text: text || '', how: 'drill', highlight: 0, digs: 0, streak: 0, savedSetPoint: false, clutch: false,
      signal: '', touchedOut: false, landSide: landNow ? (landNow.x > 0 ? 0 : 1) : -1, hold: DRILL.hold, setWon: false, matchWon: false,
      assist: null, tool: false, move: '' };
    if (k === 'free') {
      var hits = d.cnt, isBest = hits > d.best;
      if (isBest) d.best = hits;
      emit(g, { type: 'drillRep', kind: k, n: d.n, of: 0, pts: 0, total: 0, res: '', text: text || '', x: b.x, y: b.y, d: -1, grade: '',
        hits: hits, best: d.best, isBest: isBest });
      d.n++;
      g.serving = 1 - g.serving; g.serverIdx[g.serving] = (g.serverIdx[g.serving] + 1) % g.teams[g.serving].length; // el saque alterna
      return;
    }
    var c;
    if (k === 'serve') c = { land: landNow && g.lastKind === 'serve' ? landNow : null, tx: t.x, ty: t.y, cs: g.cs, jump: d.jump, grade: d.grade };
    else if (k === 'recv') {
      var own = d.recOn && d.recX > 0.3 * g.cs && d.recX < g.HL + 0.5 && Math.abs(d.recY) < g.HW + 0.5;
      c = { touched: d.recOn, x: d.recX, y: d.recY, own: own, tx: t.x, ty: t.y, cs: g.cs };
    }
    else if (k === 'set') c = { grade: d.grade, jset: d.jset, spikeIn: d.mateAtk && !!landNow && landNow.inside && landNow.x < 0 && g.lastTeam === 0 && g.lastPlayer !== g.ctrl };
    else if (k === 'atk') c = { kind: d.ak, land: landNow && g.lastTeam === 0 && g.lastPlayer === g.ctrl ? landNow : null, block: d.blk, tx: t.x, ty: t.y, cs: g.cs };
    else c = { block: d.blk, tip: d.tip, jumped: d.jumped, read: d.recOn || !!(landNow && landNow.x > 0 && landNow.x < K.net * g.cs) };
    var r = drillScore(k, c);
    d.pts = r.pts; d.total += r.pts; d.last = r; d.reps.push(r.pts);
    if (r.pts > d.best) d.best = r.pts;
    emit(g, { type: 'drillRep', kind: k, n: d.n, of: d.of, pts: r.pts, total: d.total, res: r.res, text: r.text,
      x: landNow ? landNow.x : b.x, y: landNow ? landNow.y : b.y, d: r.d, grade: d.grade || '', hits: 0, best: d.best, isBest: false });
    d.n++;
    if (d.n >= d.of) {
      d.done = true; d.target = null;
      emit(g, { type: 'drillEnd', kind: k, total: d.total, reps: d.reps.slice(), best: d.best });
    }
  }

  /** Saltar la pausa del punto (SIM-03). En 'point'/'over', pasados HOLD.skipAfter (0,8 s) de la pausa, la recorta a
   *  HOLD.skipTo (0,3 s) como mucho; nunca a menos: el silbato, el cambio de campo y la vuelta al saque siguen su
   *  orden. Devuelve true si se ha aceptado (también si ya quedaban menos de 0,3 s). Sin efecto en 'serve'/'rally'
   *  ni con el partido ya terminado (gameOver emitido). Solo toca g.timer (y, en 'over', renuncia al challenge pendiente). */
  function skipHold(g) {
    if (g.review) return false;
    if (g.amb && g.holdLock > g.time) return false; // Ambiente: tarjeta o castigo en pantalla (Sim.holdFor con lock)
    if ((g.mode !== 'point' && g.mode !== 'over') || g.finished || !(g.timer > 0)) return false;
    if (g.hold - g.timer < HOLD.skipAfter) return false;
    if (g.timer > HOLD.skipTo) g.timer = HOLD.skipTo;
    if (g.mode === 'over' && g.call) g.call.waived = true; // saltar el final del partido renuncia al challenge pendiente
    return true;
  }
  /* ---------- Ambiente de Carrera (P3, notes/ambiente.md §4.5): 3 puertas, todas no-op sin g.amb y sin g.rng ----------
   * La sim no sabe nada de protestas ni tarjetas: el director (VB.Ambiente, main.js) le pide alargar la pausa del punto
   * (holdFor) y, con una roja, el punto de castigo (penalty), siempre con balón muerto (g.mode === 'point'). */
  /** Alarga la pausa del punto en curso a s segundos como mínimo (g.hold crece lo mismo: skipHold sigue midiendo desde el
   *  principio). lock: skipHold no recorta durante s. Devuelve true si se ha aplicado. */
  function holdFor(g, s, lock) {
    if (!g.amb || g.mode !== 'point' || g.finished || !(s > 0)) return false;
    if (g.timer < s) { g.hold += s - g.timer; g.timer = s; }
    if (lock) g.holdLock = Math.max(g.holdLock, g.time + s);
    return true;
  }
  /** ¿Se puede pitar un punto de castigo ahora? Balón muerto, sin revisión, sin set por empezar, sin cambios en marcha.
   *  team (opcional) = equipo sancionado: además, el punto no puede cerrar el set (§1: nunca se cierra un set con un castigo). */
  function canPenalty(g, team) {
    if (!g.amb || g.mode !== 'point' || g.review || g.pendingSet || g.finished || g.subWait) return false;
    if (team === 0 || team === 1) { var w = 1 - team, tgt = setTarget(g); if (g.score[w] + 1 >= tgt && g.score[w] + 1 - g.score[team] >= 2) return false; }
    return true;
  }
  /** Punto de castigo (tarjeta roja / castigo por retraso): team = equipo SANCIONADO, el punto es para 1 - team.
   *  o = { card: 'red'|'delayR', pid: id del sancionado (-1 entrenador o equipo) }. Cierra la ventana de challenge del punto
   *  anterior, suma el punto, cambia el saque (rotación en 6v6), racha y cambio de campo (8 del 3r set de pista / cada 7-5 en
   *  playa); emite whistle{reason:'penalty'} y point{reason:'penalty', penalty:true, ...}; pausa nueva. Devuelve el evento o null. */
  function penalty(g, team, o) {
    if ((team !== 0 && team !== 1) || !canPenalty(g, team)) return null;
    o = o || {};
    var w = 1 - team, card = o.card === 'delayR' ? 'delayR' : 'red', pid = o.pid == null ? -1 : o.pid, fp = null, i;
    if (pid >= 0) {
      for (i = 0; i < g.players.length && !fp; i++) if (g.players[i].id === pid) fp = g.players[i];
      if (!fp && g.roster) for (var rt = 0; rt < 2 && !fp; rt++) for (i = 0; i < g.roster[rt].length; i++) if (g.roster[rt][i].id === pid) { fp = g.roster[rt][i]; break; }
    }
    g.call = null; g._pendCall = null; g.cpuChal = null; g._snap = null; // el punto anterior ya no se puede revisar
    var text = 'Punto de castigo', sideout = w !== g.serving;
    g.score[w]++;
    if (g.stats) { g.stats.points++; g.stats.won[w]++; g.stats.why[text] = (g.stats.why[text] || 0) + 1; g.stats.how = g.stats.how || {}; g.stats.how.penalty = (g.stats.how.penalty || 0) + 1; }
    emit(g, { type: 'whistle', reason: 'penalty', team: team });
    var tgt = setTarget(g), a = g.score[0], bb = g.score[1], half = Math.ceil(tgt / 2);
    var eight = !g.beach && g.setNo === 3 && !g.courtSwap3 && g.score[w] === half && g.score[1 - w] < half;
    var bswap = g.beach && (a + bb) % (g.setNo === 3 ? BEACH.swap3 : BEACH.swap) === 0;
    if (g.streakTeam === w) g.streakN++; else { g.streakTeam = w; g.streakN = 1; }
    var saved = g.setPoint === team;
    var hold = (g.present ? HOLD.routine : HOLD_LEGACY.routine) + (eight ? (g.present ? HOLD.eight : HOLD_LEGACY.eight) : 0) + (bswap ? BEACH.swapHold : 0);
    if (g.timer > hold) hold = g.timer;   // (lo que quede de la pausa larga del punto anterior, p. ej. un cambio de campo, no se recorta)
    g.timer = hold; g.hold = hold; g.holdLock = 0;
    var ev = emit(g, { type: 'point', team: w, reason: 'penalty', text: text, how: 'penalty', score: [g.score[0], g.score[1]],
      sideout: sideout, rallyTime: 0, rallyHits: 0, setWon: false, matchWon: false, player: null, lastKind: '', lastShot: '',
      highlight: 0.2, digs: 0, streak: g.streakN, savedSetPoint: saved, clutch: false, signal: 'penalty', touchedOut: false, landSide: -1,
      hold: hold, assist: null, tool: false, move: '', faultTeam: team, faultPlayer: fp, penalty: true, card: card, pid: pid });
    g.lastPoint = { team: w, reason: 'penalty', text: text, how: 'penalty', highlight: 0.2, digs: 0, streak: g.streakN, savedSetPoint: saved, clutch: false,
      signal: 'penalty', touchedOut: false, landSide: -1, hold: hold, setWon: false, matchWon: false, assist: null, tool: false, move: '', penalty: true };
    if (sideout) {
      g.serving = w;
      if (g.rot) rotate(g, w); else g.serverIdx[w] = (g.serverIdx[w] + 1) % g.teams[w].length;
      emit(g, { type: 'sideout', team: w });
      if (g.rot) emit(g, { type: 'rotation', team: w, rot: g.rot[w].map(function (q) { return q.num; }), server: g.rot[w][0] });
    }
    if (eight) { g.courtSwap3 = true; courtChange(g, 'eight'); }
    else if (bswap) { g.courtSwapAt = a + bb; courtChange(g, 'swap'); }
    return ev;
  }
  /* ---------- Challenge (B2/B3, notes/challenge-fivb.md) ----------
   * 2 por set (g.challenges), solo dentro/fuera de un bote; ventana de CHAL.window s desde el punto y hasta que se saca la
   * siguiente jugada. Acertado: se conserva y el punto pasa al otro equipo (instantánea previa al punto); fallado: se pierde.
   * Durante la revisión (g.review) la simulación queda en espera sin cambiar g.mode. */
  var CHAL = VB.CHAL = { window: 7, dur: 4.5, perSet: 2, cpuNear: 0.05, cpuP: 0.6, cpuFarP: 0.25, cpuRightP: 0.07, cpuWrongP: 0.02, cpuMin: 1.5, cpuMax: 3 };
  function snapOf(g) {
    return { score: g.score.slice(), sets: g.sets.slice(), setNo: g.setNo, serving: g.serving, serverIdx: g.serverIdx.slice(),
      setScores: g.setScores.map(function (s) { return s.slice(); }), streakTeam: g.streakTeam, streakN: g.streakN, courtSwap3: g.courtSwap3,
      pendingSet: g.pendingSet, setPoint: g.setPoint, matchPoint: g.matchPoint, challenges: g.challenges.slice(), lastPoint: g.lastPoint };
  }
  /** Challenges que le quedaban a team en el set de la llamada c (si ya empezó el set siguiente, los de la instantánea). */
  function chalLeft(g, c, team) {
    if (c.setNo === undefined || c.setNo === g.setNo) return g.challenges[team];
    return g._snap ? g._snap.challenges[team] : 0;
  }
  /** s que quedan de ventana para que team pida challenge (0 si no puede). */
  function canChallenge(g, team) {
    var c = g.call;
    if (!c || c.used || g.review || g.finished || c.team !== team || !(chalLeft(g, c, team) > 0)) return 0;
    if (g.mode !== 'point' && g.mode !== 'over' && g.mode !== 'serve') return 0; // en 'rally' ya se ha sacado
    var left = CHAL.window - (g.time - c.t);
    return left > 0 ? left : 0;
  }
  function challenge(g, team) {
    if (!(canChallenge(g, team) > 0)) return false;
    var c = g.call; c.used = true; g.cpuChal = null;
    g.review = dblFields({ team: team, t: 0, dur: CHAL.dur, x: c.x, y: c.y, dist: c.dist, truthIn: c.truthIn, calledIn: c.calledIn, overturned: c.wrong });
    endSwingX(g);
    emit(g, { type: 'challenge', team: team, x: c.x, y: c.y });
    return true;
  }
  function endReview(g) {
    var r = g.review, c = g.call, setNo0 = g.setNo; g.review = null;
    if (r.overturned && g._snap) {
      var s = g._snap, wOld = 1 - c.team;
      g.score = s.score; g.sets = s.sets; g.setNo = s.setNo; g.serving = s.serving; g.serverIdx = s.serverIdx; g.setScores = s.setScores;
      g.streakTeam = s.streakTeam; g.streakN = s.streakN; g.courtSwap3 = s.courtSwap3; g.pendingSet = s.pendingSet;
      g.setPoint = s.setPoint; g.matchPoint = s.matchPoint; g.challenges = s.challenges; g.lastPoint = s.lastPoint;
      if (g.stats) { // el punto anulado no cuenta: ni el marcador ni su motivo, peloteo, cómo, saque/remate/bloqueo, falta o maestría
        g.stats.points--; g.stats.won[wOld]--;
        var su = g.stats._undo; g.stats._undo = null;
        // (_undo guarda rutas dentro de g.stats, no referencias: sigue valiendo si alguien copia g.stats con JSON)
        if (su) { g.stats.rallies.pop(); for (var ui = 0; ui < su.length; ui++) { var up = su[ui], uo = g.stats, uj = 0; for (; uj < up.length - 1; uj++) uo = uo[up[uj]];
          var uk = up[uj]; uo[uk]--; if (uo[uk] === 0 && (up[0] === 'why' || up[0] === 'how' || up[0] === 'faults')) delete uo[uk]; } }
      }
      if (g.subsOn) { g.rallyN--; if (g._meLast) g.meR--; subRedo(g, setNo0); } // banquillo: el punto anulado no cuenta (ni su rendimiento ni su cansancio: se vuelve a contar abajo)
      if (g.mode === 'serve') { endRitual(g); endSwingX(g); g.serveState = 'ready'; }
      // mismo bote (landSide del punto nuevo); si ya se preparó el saque siguiente, lastLand puede venir a null: se rehace con la llamada
      g.ball.held = null; if (g.lastLand) g.lastLand.t = g.time; else g.lastLand = { x: c.x, y: c.y, inside: c.truthIn, t: g.time };
      // se vuelve a pitar el punto con la llamada correcta (marcador, saque, set/partido y pausas como un punto normal)
      g.mode = 'rally';
      point(g, c.alt[0], c.alt[1], c.alt[2]);
      g.call = c; c.used = true; c.calledIn = c.truthIn; c.wrong = false; c.team = 1 - c.alt[0]; g._snap = null;
    } else {
      // se gasta del set de la llamada: si ya empezó el siguiente, ese set ya está cerrado y el nuevo conserva los suyos
      if (c.setNo === undefined || c.setNo === g.setNo) g.challenges[r.team] = Math.max(0, g.challenges[r.team] - 1);
      else if (g._snap) g._snap.challenges[r.team] = Math.max(0, g._snap.challenges[r.team] - 1);
      if ((g.mode === 'point' || g.mode === 'over') && g.timer < 1) g.timer = 1; // un respiro antes del saque
      else if (g.mode === 'serve') { endRitual(g); endSwingX(g); setupServe(g); } // se vuelve a autorizar el saque desde el principio
    }
    emit(g, { type: 'challengeResult', team: r.team, overturned: r.overturned, dist: r.dist, truthIn: r.truthIn, calledIn: r.calledIn,
      x: r.x, y: r.y, left: [g.challenges[0], g.challenges[1]] });
  }
  /** B3: la CPU decide si pide challenge al acabar el punto (gasta azar solo con un bote a <= 10 cm de la línea). */
  function cpuChallengeDecide(g) {
    var c = g.call; if (!c || c.used) return;
    var t = c.team, ai = g.online ? !!g.hum[t].ai : (t === 1 || g.demo || g.autopilot); // (online: solo el hueco que lleva la IA)
    if (!ai || !(g.challenges[t] > 0) || Math.abs(c.dist) > ((g.refErr || REF_ERR).d3)) return;
    // la CPU "lo ha visto": pide sobre todo cuando el árbitro se equivocó; con la llamada bien hecha, muy rara vez
    var near = Math.abs(c.dist) < CHAL.cpuNear;
    var pr = c.wrong ? (near ? CHAL.cpuP : CHAL.cpuFarP) : (near ? CHAL.cpuRightP : CHAL.cpuWrongP);
    if (g.rng() < pr) g.cpuChal = { team: t, at: g.time + CHAL.cpuMin + g.rng() * (CHAL.cpuMax - CHAL.cpuMin) };
  }

  /** Cambio de campo (reglas 18.2.1 y 18.2.2). Es PRESENTACIÓN: el humano sigue en x > 0 (controles relativos
   *  a la cámara); la UI muestra el aviso y arena/cámara pueden escenificarlo. */
  function courtChange(g, why) {
    if (g.stats) g.stats.courtChanges++;
    // why: 'set' (fin de set) | 'eight' (8 del set decisivo, pabellón) | 'swap' (playa: cada 7 puntos, cada 5 en el 3r; `every`)
    var ev = emit(g, { type: 'courtChange', setNo: g.setNo, why: why, score: [g.score[0], g.score[1]], sets: [g.sets[0], g.sets[1]], pause: why === 'set' ? 1.0 : why === 'swap' ? BEACH.swapHold : 1.4 });
    if (why === 'swap') ev.every = g.setNo === 3 ? BEACH.swap3 : BEACH.swap;
  }

  // ---------- Jugadores ----------
  /** Despegue. dj (salto con impulso, solo humanJump con g.djump): salto con dirección; deja p.dj y el evento lleva dir (unitario de la
   *  deriva, mundo) y jv (m/s). La altura y el tiempo en el aire no cambian. */
  function jump(g, p, jvx, jvy, dj) {
    if (p.z === 0 && p.vz === 0 && p.down <= 0) {
      p.vz = jumpV(p); p.onGround = false; p.lastAction = 'jump'; p.actionT = 0;
      if (jvx == null) { // impulso: parte de la velocidad de carrera, limitado
        jvx = p.vx * 0.3; jvy = p.vy * 0.3;
        var jl = Math.hypot(jvx, jvy); if (jl > 0.6) { jvx *= 0.6 / jl; jvy *= 0.6 / jl; }
      }
      p.jvx = jvx; p.jvy = jvy || 0;
      if (g.rot) p.toX = p.x; // 6v6: despegue (falta de ataque de zaguero)
      if (g.djump) p.dj = dj ? 1 : 0;
      if (dj) { var dl = Math.hypot(p.jvx, p.jvy); emit(g, { type: 'jump', player: p, dir: dl > 1e-9 ? [p.jvx / dl, p.jvy / dl] : [0, 0], jv: dl }); }
      else emit(g, { type: 'jump', player: p });
    }
  }
  function stepPlayer(g, p, dt, mx, my) {
    var air = p.z > 0 || p.vz > 0;
    if (air) {
      p.vz -= C.G * dt; p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0; p.vz = 0; p.onGround = true;
        // salto con impulso (g.djump): aterrizaje duro tras una deriva grande (DJ.landT s con la carrera ×DJ.landK) y la carrera se
        // vuelve a medir desde cero
        var hard = false;
        if (g.djump) {
          if (p.dj && Math.hypot(p.jvx, p.jvy) > DJ.landJ) { p.landT = DJ.landT; hard = true; }
          p.avx = p.avy = 0; p.dj = 0; p.jF = 0;
        }
        p.jvx = p.jvy = p.rvx = p.rvy = 0;
        if (hard) emit(g, { type: 'landPlayer', player: p, hard: true }); else emit(g, { type: 'landPlayer', player: p });
      }
    }
    var ox = p.x, oy = p.y;
    if (p.down > 0) { p.down -= dt; mx = my = 0; }
    if (p.landT > 0 && !air) { p.landT -= dt; mx *= DJ.landK; my *= DJ.landK; } // (solo con g.djump: si no, landT es siempre 0)
    if (p.tired > 0) { var tk = 1 - SUBK.speed * p.tired; mx *= tk; my *= tk; } // cansancio (solo con banquillo: p.tired no existe sin g.subsOn)
    if (air) { p.x += p.jvx * dt; p.y += p.jvy * dt; }
    else {
      var spk = p.ak && isHuman(g, p) ? p.ak.speed : 1;
      if (p.badges && g.mode === 'rally') spk *= BADGE.motor[bl(p, 'motor')]; // Motor (humano e IA)
      var hum = isHuman(g, p), aT = hum ? (p.ak && p.ak.accT > 0 ? p.ak.accT : 0) : accTOf(g, p);
      if (aT > 0) { // humano: Velocidad < 50 acelera en accT s hasta su máxima (≥ 50, instantáneo); IA: siempre arrancada (EFFORT.accT)
        // frenar y girar es al momento (integración, 10-nov-2026: con la rampa también al frenar se pasaba 0,74 m en un giro con
        // Velocidad 15 y se notaba como retraso del mando): solo cuenta la velocidad que ya lleva en la dirección que se pide, y
        // la rampa es solo para arrancar
        var tvx = mx * C.SPEED * spk, tvy = my * C.SPEED * spk, tl = Math.hypot(tvx, tvy);
        if (tl < 1e-6) p.rvx = p.rvy = 0;
        else {
          var vMax = hum ? C.SPEED * p.ak.speed : C.SPEED * profOf(g, p).speed * spk; // (la IA: su máxima con el perfil)
          var ux = tvx / tl, uy = tvy / tl, al = Math.min(tl, Math.max(0, p.rvx * ux + p.rvy * uy) + vMax / aT * dt);
          p.rvx = ux * al; p.rvy = uy * al;
        }
        p.x += p.rvx * dt; p.y += p.rvy * dt;
      } else {
        p.x += mx * C.SPEED * spk * dt; p.y += my * C.SPEED * spk * dt;
        p.rvx = mx * C.SPEED * spk; p.rvy = my * C.SPEED * spk; // (la velocidad que lleva: si entra en la rampa de EFFORT, parte de aquí)
      }
    }
    if (p.lvx || p.lvy) { // impulso de la plancha
      p.x += p.lvx * dt; p.y += p.lvy * dt; var k = Math.max(0, 1 - 7 * dt); p.lvx *= k; p.lvy *= k;
      if (Math.abs(p.lvx) + Math.abs(p.lvy) < 0.05) p.lvx = p.lvy = 0;
    }
    var sd = side(p.team), inAir = p.z > 0;
    // línea central: no se cruza (en el suelo); en el aire, el cuerpo no atraviesa la red
    p.x = sd * clamp(p.x * sd, inAir ? 0.2 : 0.35, g.mode === 'serve' ? 12 : 11); p.y = clamp(p.y, -6, 6);
    if (inAir && g.mode === 'rally' && Math.abs(p.x) < C.NET_TOUCH && Math.abs(p.y) < g.HW + 0.5) {
      var b = g.ball;
      if (Math.abs(b.x) < 4 && Math.abs(b.y - p.y) < 3/*fl*/ && !(g.fl && g.fl.fqK.indexOf(p.id) >= 0)/*lf*/) { // durante la acción de jugar el balón
        emit(g, { type: 'netTouch', player: p, x: p.x, y: p.y, z: p.z + 2.2 });
        if (g.fl && !g.fl.loc[g.fl.own]) flFq(g, p); else // fl
        fault(g, p.team, 'net', 'Toque de red', p);
      }
    }
    if (dt > 0) { p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt; }
    // salto con impulso: media de la carrera en el suelo (a = dt/(tau+dt), racional: igual en todas las plataformas); en el aire, quieta
    if (g.djump && p.z === 0 && p.vz === 0 && p.down <= 0) { var ea = dt / (DJ.tau + dt); p.avx += (p.vx - p.avx) * ea; p.avy += (p.vy - p.avy) * ea; }
    p.anim = Math.max(0, p.anim - dt); p.cool = Math.max(0, p.cool - dt); p.actionT += dt;
  }

  /** Plancha: se lanza hacia el balón y toca (calidad limitada); queda en el suelo un momento. */
  function dive(g, p, aim, te) {
    if (g.fl && flNo(g, p, false)) return; // fl
    var b = g.ball, dx = b.x - p.x, dy = b.y - p.y, dl = Math.hypot(dx, dy) || 1;
    var reachOut = Math.max(0, dl - C.REACH * 0.7);
    p.lvx = dx / dl * reachOut * 7; p.lvy = dy / dl * reachOut * 7; // desplaza ~reachOut en el gesto
    p.down = 0.9 * (p.ak ? p.ak.rec : 1); // Reacción: se levanta antes o después
    if (g.stats) g.stats.dives++;
    emit(g, { type: 'dive', player: p, x: b.x, y: b.y, z: b.z, dir: [dx / dl, dy / dl] });
    hit(g, p, aim, te, 'dive');
    p.lastAction = 'dive'; p.actionT = 0;
  }

  /** Plancha que no llega (IA): se lanza tarde, el balón pasa. Mismo evento `dive` (con miss:true), sin toque. */
  function diveMiss(g, p) {
    var b = g.ball, dx = b.x - p.x, dy = b.y - p.y, dl = Math.hypot(dx, dy) || 1;
    var reachOut = Math.max(0, dl - C.REACH * 0.7);
    p.lvx = dx / dl * reachOut * 6; p.lvy = dy / dl * reachOut * 6;
    p.down = 0.9 * (p.ak ? p.ak.rec : 1); p.anim = 0.3; p.lastAction = 'dive'; p.actionT = 0; p.shot = 'dive'; p.grade = 'poor';
    if (g.stats) { g.stats.dives++; g.stats.diveMiss++; }
    emit(g, { type: 'dive', player: p, x: b.x, y: b.y, z: b.z, dir: [dx / dl, dy / dl], miss: true });
  }

  /** Salto del humano. Cerca de la red (< 1,5 m) y con el balón del rival (cualquier número de toques, tras
   *  un bloqueo suyo, o el balón en su campo o yendo hacia la red), la inercia que añade el propio juego no le
   *  mete en la red: se limita la deriva hacia la red para caer a >= 0,40 m (la IA hace lo mismo). En el aire
   *  no hay control, así que un toque de red así sería culpa del juego, no del jugador. En jugada propia
   *  (ataque) la carrera sí puede llevarle a la red, como a la IA (netErr). */
  /*  Salto con impulso (g.djump; mx, my, ml = stick de mundo de este paso; plant = colocador C2 plantado, salta en vertical): con
   *  dirección (|stick| >= DJ.dead, o la última de hace <= DJ.buf s, g.jd*) la deriva sale de la carrera previa (p.avx/avy) en esa
   *  dirección y del propio stick: J = kR·carrera + kS·|stick|·(1 − carrera/SPEED), tope DJ.cap ×Salto (DJ.back hacia atrás, DJ.blk
   *  en el bloqueo cerca de la red) y el seguro de red de siempre para TODO salto con dirección (cae a >= DJ.netX m; DJ.oppX con el
   *  balón rival): despegar cerca de la red quita impulso, nunca da un toque de red. Sin dirección, sin g.djump o plantado: lo de
   *  siempre bit a bit. */
  function humanJump(g, p, mx, my, ml, plant) {
    var sd = side(p.team), b = g.ball;
    var oppBall = g.touchTeam !== p.team || b.x * sd < 0 || (b.vx * sd < 0 && g.touches === 0);
    var dir = g.djump && !plant && p.down <= 0 && ((ml || 0) >= DJ.dead || g.time - g.jdT <= DJ.buf);
    if (!dir) {
      var jvx = p.vx * 0.3, jvy = p.vy * 0.3, jl = Math.hypot(jvx, jvy);
      if (jl > 0.6) { jvx *= 0.6 / jl; jvy *= 0.6 / jl; }
      if (Math.abs(p.x) < 1.5 && oppBall && jvx * sd < 0) {
        var air = 2 * jumpV(p) / C.G, minX = 0.40;
        if ((p.x + jvx * air) * sd < minX) jvx = Math.min(0, (minX - p.x * sd) / air) * sd;
      }
      if (g.djump) g.aimCarry = 0;
      jump(g, p, jvx, jvy);
      return;
    }
    var ux, uy, m;
    if (ml >= DJ.dead) { ux = mx / ml; uy = my / ml; m = ml; } else { ux = -sd * g.jdF; uy = sd * g.jdS; m = g.jdM; }
    var vax = p.avx, vay = p.avy, vu = vax * ux + vay * uy, vAl = Math.max(0, vu);
    var J = DJ.kR * vAl + DJ.kS * m * (1 - Math.min(1, vAl / C.SPEED));
    var jx = J * ux + DJ.perp * (vax - vu * ux), jy = J * uy + DJ.perp * (vay - vu * uy);
    var cap = DJ.cap * (p.ak ? p.ak.jump : 1);
    if (-sd * jx < 0) cap = Math.min(cap, DJ.back);                        // alejándose de la red
    if (oppBall && Math.abs(p.x) < 1.5) cap = Math.min(cap, DJ.blk);      // bloqueo: desliz corto y legible
    var jn = Math.hypot(jx, jy); if (jn > cap) { jx *= cap / jn; jy *= cap / jn; }
    if (jy > DJ.lat) jy = DJ.lat; else if (jy < -DJ.lat) jy = -DJ.lat;     // a lo ancho, como mucho DJ.lat
    var airT = 2 * jumpV(p) / C.G, minX2 = oppBall ? DJ.oppX : DJ.netX;
    if (jx * sd < 0 && (p.x + jx * airT) * sd < minX2) jx = Math.min(0, (minX2 - p.x * sd) / airT) * sd; // seguro de red
    p.jF = -sd * jx; p.tkX = p.x; p.tkY = p.y;
    g.aimCarry = 1; g.jdF = -sd * ux; g.jdS = sd * uy; // la diana no se mueve con la dirección del despegue hasta que se suelte o gire
    jump(g, p, jx, jy, 1);
  }

  // ---------- Gesto de golpeo del humano ----------
  function startSwing(g, p, shot) {
    if (g.swingLive) { // durante el gesto, la última pulsación decide el golpe
      // E1 (finta): gesto abierto con GOLPEAR y cambiado a SALTAR (dejada) o COLOCAR (golpe colocado) antes del contacto
      if (g.feintOn && g.swingShot0 === '' && (shot === 'tip' || shot === 'jset')) g.swingSwapT = g.time;
      g.swingShot = shot || ''; return false;
    }
    if (g.swingLock > 0) return false;
    // en el mismo salto del bloqueo no hay otro golpe (17-nov-2026): el bloqueador no remata el balón que acaba de bloquear antes de caer
    // (antes, machacar GOLPEAR en el bloqueo sacaba un bloqueo y, detrás, un remate del mismo jugador desde su campo)
    if (p.z > 0 && p.lastAction === 'block' && g.mode === 'rally') return false;
    g.hitBuf = g.tm.swing; g.swingLive = true; g.swingShot = shot || ''; g.swingT0 = g.time;
    g.swingShot0 = g.swingShot; g.swingSwapT = -9;
    if (p.anim <= 0) { p.anim = 0.18; }
    if (p.lastAction !== 'jump' || p.z <= 0) { p.lastAction = 'swing'; p.actionT = 0; }
    emit(g, { type: 'swing', player: p, shot: g.swingShot });
    return true;
  }
  /** Resuelve el gesto en curso: contacto (con espera asistida), plancha, o fallo al expirar. */
  function processSwing(g, p, aim) {
    if (!g.swingLive) return;
    // apuntado: el de ahora; si ya no se pulsa dirección, el último que se dio durante el gesto
    if (aim) { g.swingAim[0] = aim[0]; g.swingAim[1] = aim[1]; g.swingHasAim = true; if (g.rot || g.mastery) g.swingLen = g.aimLen; } // (6v6: su módulo, para el carril; E1: para la colocación dirigida)
    else if (g.swingHasAim) aim = g.swingAim;
    var w, b = g.ball, te;
    if (canReach(g, p)) {
      w = hitWindow(g, p);
      var wait = w.t > 0 && w.t <= Math.min(g.tm.assist, g.hitBuf) && w.reach;
      // saque: con el balón aún subiendo no hay contacto (no vale golpear el lanzamiento de camino arriba)
      var rising = g.mode === 'serve' && b.vz > 0;
      if (!wait && !rising) {
        // desfase = (pulsación + armado del brazo) - momento ideal. Pulsar WINDUP antes del ideal = 'perfect'
        te = g.swingT0 + C.WINDUP - (g.time + w.t);
        if (g.mode === 'serve') doServe(g, p, aim, te, null);
        else hit(g, p, aim, te, g.swingShot);
        return;
      }
    } else if (g.mode === 'rally' && !g.swingShot && canDive(g, p)) {
      w = hitWindow(g, p);
      if (!w.reach || b.z < 0.6) { dive(g, p, aim, g.swingT0 + C.WINDUP - (g.time + w.t)); return; }
    }
    if (g.hitBuf <= 0) { // el gesto termina sin contacto
      w = hitWindow(g, p);
      var near = Math.hypot(b.x - p.x, b.y - p.y) < 3.2;
      if (near && (g.mode === 'rally' || g.mode === 'serve')) {
        if (g.stats) g.stats.misses++;
        emit(g, { type: 'miss', player: p, reason: w.t > 0 ? 'early' : (w.reach ? 'late' : 'far'), t2: w.t });
      }
      endSwing(g); g.swingLock = g.tm.lock * (p.ak ? p.ak.rec : 1); // Reacción: vuelve antes al gesto
    }
  }

  /** Asistencia de movimiento: cerca del punto de contacto, el jugador humano se
   *  "imanta" suavemente y frena al llegar (la colocación gruesa sigue siendo suya). */
  var _mv = [0, 0];
  // salto con impulso: carrera hacia la red con tiempo de sobra: la asistencia la regula (×_runF, >= DJ.astF) para llegar a la batida
  // adelantada cuando toca saltar (hitWindow.jumpT) en vez de llegar antes a la red; así el impulso no se pierde por arrancar pronto
  var _runF = 1, _wAs = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  function assistMove(g, p, mx, my, ring) {
    _runF = 1;
    var r = assistMove0(g, p, mx, my, ring);
    if (_runF < 1) { r[0] *= _runF; r[1] *= _runF; }
    return r;
  }
  function assistMove0(g, p, mx, my, ring) {
    _mv[0] = mx; _mv[1] = my;
    if (g.jobs[p.team] !== p || p.z > 0 || p.down > 0) return _mv;
    var sd = side(p.team), tx, ty, il = Math.hypot(mx, my), run = false;
    if (atkPhase(g, p.team) && Math.abs(g.pr3.x) < 3.8 && g.pr3.z > 2.5) {
      // salto con impulso (g.djump): corriendo hacia la red, la batida asistida se adelanta lo que va a derivar (astK) y frena menos
      // al llegar (hasta ×astF, para no perder la carrera); pasada esa batida, hasta la de siempre (pr3 + 0,35) la carrera se va frenando
      // hasta ×astF: saltar un pelín tarde aún da algo de impulso en vez de llegar a la red y que el seguro lo anule
      run = g.djump && il >= DJ.dead && -sd * mx / il > 0.5;
      tx = g.pr3.x + sd * (run ? 0.35 + DJ.kR * Math.max(0, -sd * p.avx) * DJ.astK : 0.35); ty = g.pr3.y;
      if (run) {
        var b0 = sd * g.pr3.x + 0.35, bA = sd * tx, px = sd * p.x;
        if (px < bA && Math.hypot(tx - p.x, ty - p.y) <= 1.8) {
          var fr = bA - b0 > 0.05 ? DJ.astF + (1 - DJ.astF) * clamp((px - b0) / (bA - b0), 0, 1) : DJ.astF;
          _mv[0] = mx * fr; _mv[1] = my * fr; return _mv;
        }
        var wA = hitWindow(g, p, _wAs); // (antes de la batida: ¿llega antes de tiempo a tope?)
        if (wA.attack && wA.jumpT > 0.05) _runF = clamp((px - bA) / (wA.jumpT * C.SPEED), DJ.astF, 1);
      }
    }
    else { tx = g.pr1.x + (ring ? 0 : sd * 0.15); ty = g.pr1.y; } // (ring: C2, ventana de colocación: al centro del aro amarillo)
    var dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy);
    if (dl > 1.8 || dl < 0.03) return _mv;
    // (6v6: el imán solo ayuda si el jugador ya empuja el stick —Ferran, 11-nov-2026: sin entrada el personaje no se mueve solo—; en el
    //  2v2 g.rot es null y sigue igual)
    if (g.rot && il < 0.2) return _mv;
    var dot = il > 0.05 ? (mx * dx + my * dy) / (il * dl) : 1;
    if (dot < -0.3) return _mv; // el jugador quiere ir a otro sitio: no se le lleva
    var s = 0.5 * Math.min(1, dl / 0.6);
    if (il > 0.2 && dl < 0.45 && dot > 0.5) { var fb = run ? Math.max(DJ.astF, dl / 0.45) : dl / 0.45; mx *= fb; my *= fb; } // frena al llegar
    mx += dx / dl * s; my += dy / dl * s;
    var l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    _mv[0] = mx; _mv[1] = my; return _mv;
  }

  /* (6v6: la «posición asistida» del sprint 3, assist6, se quitó el 11-nov-2026: Ferran no quiere que el personaje se mueva solo.
   * El humano del 6v6 se mueve solo con el stick: la ayuda corta de assistMove cerca del balón que es suyo solo actúa si ya empuja (il >= 0,2).
   * Su sitio lo marca fx.js con la marca de posición, VB.AI6.spot.) */

  // ---------- Flujo del partido ----------
  var _zp = { x: 0, y: 0 };
  /** 6v6: todos a su zona base (ZONE) y el sacador detrás de la línea de fondo, en su lado derecho. */
  function placeZones(g, t, sv) {
    for (var u = 0; u < 2; u++) for (var z = 0; z < g.rot[u].length; z++) {
      var p = g.rot[u][z]; zonePos(u, z + 1, _zp); p.x = _zp.x; p.y = _zp.y;
    }
    sv.x = side(t) * 10.3; sv.y = side(t) * 2.5;
  }
  function setupServe(g) {
    g.mode = 'serve';
    if (g.rot) { applyLibero(g); g.setPlan[0] = g.setPlan[1] = null; } // 6v6: entra/sale el líbero (ya rotado)
    var t = g.serving, sd = side(t), sv = serverOf(g, t), b = g.ball;
    if (!g.rot) {
      var mate = other(g, sv);
      sv.x = sd * (g.HL + 1.3); sv.y = g.serverIdx[t] ? 1.5 : -1.5; mate.x = sd * 3.5; mate.y = -sv.y * 1.3;
      for (var i = 0; i < 2; i++) { var q = g.teams[1 - t][i]; q.x = -sd * 6.5 * g.cs; q.y = (i ? 2.2 : -2.2) * g.cs; }
    } else if (VB.AI6 && VB.AI6.placeServe) VB.AI6.placeServe(g, t, sv); // 6v6: formaciones legales (saque y recepción)
    else placeZones(g, t, sv); // 6v6 sin ai6.js: cada uno en su zona base
    for (var j = 0; j < g.players.length; j++) {
      var p = g.players[j]; p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; p.anim = 0; p.bd = 0; p.bdT = 0.05 + g.rng() * 0.15;
      p.onGround = true; p.lastAction = ''; p.actionT = 99; p.jvx = p.jvy = p.lvx = p.lvy = p.rvx = p.rvy = 0; p.down = 0; p.cool = 0; p.avx = p.avy = p.dj = p.jF = p.tkX = p.tkY = p.landT = 0;
      p.shot = ''; p.aiTeT = -1;
    }
    g.lastLand = null; g.antennaHit = null; g.atkServe = null;
    g.server = sv; g.serveState = 'ready'; g.serveJump = false; g.serveClock = g.serveClockMax; g.serveT = 0; g.tossT = 0;
    g.serveNo++;
    g.serveAuth = false; g.whistleAt = g.demo ? RITUAL.demoWhistle : 0.7; // (también abajo, tras el serveReady: el ritual lo necesita ya)
    b.held = sv; b.vx = b.vy = b.vz = 0; b.dip = 0; b.wobA = 0;
    g.touchTeam = -1; g.touches = 0; g.lastPlayer = null; g.lastTeam = t; g.jobs[0] = g.jobs[1] = null; g.lastKind = ''; g.lastShot = '';
    g.hardIn = false; g.digOk = true; g.digK = 0; g.feintFool = false; g.prevKind = ''; g.atkTeam = -1; g.atkHow = '';
    var prevCtrl = g.ctrl;
    if (g.ctrlMode !== 'one') g.ctrl = t === 0 ? sv : g.teams[0][0]; // modo 'one': el humano sigue con su jugador (si saca el compañero, saca la IA)
    if (g.online) resetSlots(g); else { endSwing(g); g.swingLock = 0; g.defRole = ''; g.aimCarry = 0; }
    g.rally.t = 0; g.rally.hits = 0; g.rally.digs = 0; g.atkSet = null;
    serveAimReset(g, sv);
    // ¿Punto de set / punto de partido?
    var tgt = setTarget(g);
    g.setPoint = -1; g.matchPoint = -1;
    for (var k = 0; k < 2; k++) {
      if (g.score[k] >= tgt - 1 && g.score[k] - g.score[1 - k] >= 1) { g.setPoint = k; if (g.sets[k] === (g.toWin || 2) - 1 || g.bo1) g.matchPoint = k; }
    }
    // CPU: ritual con botes y lanzamiento a hora fija (g.timer = g.cpuTossIn = s hasta el lanzamiento); humano: sin ritual
    var tossIn = ritualSetup(g, sv, !isHuman(g, sv));
    g.timer = tossIn > 0 ? tossIn : (g.demo ? 0.9 : 1.3); g.cpuTossIn = tossIn;
    holdPos(g, sv, b); // en la mano ya en el frame de serveReady
    if (prevCtrl !== g.ctrl) emit(g, { type: 'switch', from: prevCtrl, to: g.ctrl, auto: true, reset: true });
    emit(g, { type: 'serveReady', team: t, player: sv, setPoint: g.setPoint, matchPoint: g.matchPoint });
    // el silbato de autorización llega un instante después (stepServe); desde él corren los 8 s
    g.serveAuth = false; g.whistleAt = g.demo ? RITUAL.demoWhistle : 0.7;
    if (g.fl) { g.fl.own = g.server.team; g.fl.bAge = 0; g.fl.frozen = false; g.fl.wait = 0; g.fl.peer = false; g.fl.sr = true; g.fl.srvR = g.fl.r; g.fl.khAt = -1; } // fl
  }

  /** Lanza el balón para sacar. jumpServe: toss alto y adelantado + carrera y salto automáticos. */
  function toss(g, sv, jumpServe) {
    var b = g.ball, sd = side(sv.team);
    var rt = g.ritual; if (rt.on) { rt.on = false; rt.phase = 'none'; }
    if (g.cpuTossIn > 0) g.cpuTossIn = 0;                  // CPU: lanzado (0 hasta que acaba el saque)
    b.held = null; g.serveState = 'toss'; g.serveJump = !!jumpServe; g.tossT = 0;
    holdPos(g, sv, b); // sale de la mano izquierda, a la altura del pecho
    var hx, hy = sv.y; // punto de contacto (sobre el hombro derecho, algo delante)
    if (jumpServe) {
      var apex = 4.6, vz0 = Math.sqrt(2 * C.G * (apex - b.z));
      var jv = jumpV(sv), hz = C.ZC.jserve + jv * jv / (2 * C.G);       // mano en lo alto del salto (con su salto)
      var tb = (vz0 + Math.sqrt(Math.max(0, vz0 * vz0 - 2 * C.G * (hz - b.z)))) / C.G;
      g.jumpAt = tb - jv / C.G - 0.02;                                     // despegue para coincidir
      hx = sv.x - sd * 1.35;                                               // carrera de 0,75 m + golpeo delante
      b.vz = vz0; b.vx = (hx - b.x) / tb; b.vy = (hy - b.y) / tb;
    } else {
      var top = 3.0, vz1 = Math.sqrt(2 * C.G * (top - b.z));
      var tf = (vz1 + Math.sqrt(2 * C.G * (top - (sv.z + C.ZC.fserve)))) / C.G; // cae a la altura del golpeo
      hx = sv.x - sd * 0.38;
      b.vz = vz1; b.vx = (hx - b.x) / tf; b.vy = (hy - b.y) / tf;
      g.jumpAt = 0;
    }
    g.lastTouchT = g.time;
    sv.lastAction = 'toss'; sv.actionT = 0; sv.anim = 0.3;
    if (!isHuman(g, sv)) { var pr = profOf(g, sv); g.aiServeTe = clamp(gauss(g) * aiTiming(g, sv, pr) * 0.9, -0.25, 0.2); } // tope tardío 0,2: con 0,25 la ventana de alcance (canReach, ~-0,23 s) se cerraba antes y la CPU dejaba caer su propio lanzamiento
    emit(g, { type: 'toss', player: sv, team: sv.team, jump: g.serveJump, human: isHuman(g, sv) });
  }

  function doServe(g, sv, aim, te, tgt) {
    var sd = side(sv.team), b = g.ball, prof = profOf(g, sv), human = isHuman(g, sv);
    var posFault = false;
    if (g.rot) { // 6v6: falta de posición en el golpe de saque. La IA nunca la comete (formaciones de VB.AI6): solo se cuenta; al humano
      // (Difícil/Experto, g.posRule6: ha podido moverse durante el saque) se le pita si él está en un par solapado (overlapOf), abajo.
      // Reglas FIVB 2025-2028 (7.4): el equipo que SACA puede colocarse donde quiera; solo el que RECIBE comete falta de posición (la
      // pita el 2º árbitro, 24.3.2.2). Con el humano sacando (sv.team === 0) no se pita nunca; g.overlap y stats.overlap siguen
      // contando los dos equipos (estadística)
      var ov0 = overlapCount(g, 0), ov1 = overlapCount(g, 1);
      g.overlap = [ov0, ov1];
      if (g.stats && g.stats.overlap) { g.stats.overlap[0] += ov0 ? 1 : 0; g.stats.overlap[1] += ov1 ? 1 : 0; }
      posFault = ov0 > 0 && sv.team !== 0 && g.posRule6 && g.ctrlMode === 'one' && !g.demo && !g.autopilot && g.ctrl && g.ctrl.team === 0 && overlapOf(g, 0, g.ctrl) > 0;
    }
    b.held = null;
    te = te || 0;
    if (human && sv.ak) te /= sv.ak.wSrv;
    if (human && sv.badges) { var sw = sangreW(g, sv); if (sw !== 1) te /= sw; } // Sangre fría
    var q = timingQ(te), grade = gradeOf(q), mul = human ? 1 : prof.err, v, power, er, tx, ty;
    // saque dirigible (humano): a la diana g.aim3, con una dispersión uniforme en un círculo de radio serveSpread(q)
    var aimed = human && !tgt && g.aim3.on && g.aim3.kind === 'serve', ox = 0, oy = 0;
    if (tgt) { tx = tgt[0]; ty = tgt[1]; }
    else if (aimed) {
      tx = g.aim3.x; ty = g.aim3.y;
      var srr = serveSpread(q, g.serveJump) * (sv.ak ? sv.ak.srvSpread : 1) * Math.sqrt(g.rng()), sra = g.rng() * 6.2832;
      ox = srr * Math.cos(sra); oy = srr * Math.sin(sra);
    }
    else {
      tx = -sd * 6; ty = 0;
      if (aim) { tx += aim[0] * 2.4; ty += aim[1] * 3.4; }
      tx = -sd * clamp(-sd * tx * g.cs, 2 * g.cs, 8.4 * g.cs); ty = clamp(ty * g.cs, -4 * g.cs, 4 * g.cs);
    }
    g.aim3.on = false;
    if (g.serveJump) { // saque en salto: potente y con liftado
      var spd = human ? 12.5 + 5 * q + (sv.ak ? sv.ak.serve : 0) : prof.jserve * (0.86 + 0.14 * q);
      var sboost = sv.badges ? BADGE.bombardero[bl(sv, 'bombardero')] : 0; // Bombardero (m/s)
      er = (0.3 + 1.5 * (1 - q)) * mul; power = clamp((spd + sboost - 10) / 8, 0, 1);
      b.dip = C.G * (0.12 + 0.25 * q);
      if (sboost > 0) { b.dip = boostDip(b.dip, spd, spd + sboost); spd += sboost; }
      if (aimed) v = launchDirect(b, tx + ox, ty + oy, C.BR, spd, C.G + b.dip); // bota en la diana (± dispersión)
      else v = launchDirect(b, tx + rnd(g, er), ty + rnd(g, er), 0, spd, C.G + b.dip);
      if (q < 0.45 && g.rng() < (0.5 - q) * 0.7) v[2] -= 1.1 + g.rng() * 0.8; // a la red
      b.wobA = 0;
    } else { // flotante: más lento, pero baila
      er = (0.3 + 1.3 * (1 - q)) * mul; power = 0.25 + 0.2 * q;
      var ap = Math.max(b.z + 0.35, 3.25 + (1 - q) * 0.4 + (human ? 0 : (prof.srvSoft || 0)));
      if (aimed) { // saque dirigible: el baile se decide antes de lanzar para que la diana marque dónde cae (FLOAT_DANCE de baile)
        var netBall = q < 0.45 && g.rng() < (0.5 - q) * 0.6;
        b.dip = 0; b.wobA = (2 + 4.2 * q) * BADGE.flotador[bl(sv, 'flotador')]; b.wobF = 3.6 + g.rng() * 2; b.wobP = g.rng() < 0.5 ? -1 : 1;
        if (netBall) v = launchApex(b, tx + ox, ty + oy, 0, 2.75); // se queda en la red
        else v = aimFloat(b, tx + ox, ty + oy, ap);
      } else {
        if (q < 0.45 && g.rng() < (0.5 - q) * 0.6) v = launchApex(b, tx + rnd(g, er), ty + rnd(g, er), 0, 2.75);
        else v = launchSafe(b, tx + rnd(g, er), ty + rnd(g, er), 0, ap);
        b.dip = 0; b.wobA = (2 + 4.2 * q) * (human ? 1 : prof.float); b.wobF = 3.6 + g.rng() * 2; b.wobP = g.rng() < 0.5 ? -1 : 1; // wobP = sentido
        if (sv.badges) b.wobA *= BADGE.flotador[bl(sv, 'flotador')];      // Hoja seca
      }
    }
    if (!human && !(g.drill && g.drill.kind === 'recv') && g.rng() < prof.srvErr) { // error de saque de la IA: a la red o largo (E6 recepción: nunca)
      if (g.rng() < 0.55) { v = launchApex(b, -sd * 3, b.y + rnd(g, 2), 0, 2.6); }
      else v = g.serveJump ? launchDirect(b, -sd * (9.6 + g.rng()) * g.cs, ty + rnd(g, 1.5), 0, b.speed || 15) : launchSafe(b, -sd * (9.7 + g.rng()) * g.cs, ty + rnd(g, 1.5), 0, 3.4);
      b.dip = 0; b.wobA = 0;
    }
    b.vx = v[0]; b.vy = v[1]; b.vz = v[2];
    b.speed = Math.hypot(v[0], v[1], v[2]);
    sv.anim = 0.35; sv.lastAction = 'serve'; sv.actionT = 0; sv.shot = g.serveJump ? 'jump' : 'float'; sv.grade = grade;
    g.lastKind = 'serve'; g.lastShot = sv.shot; g.mode = 'rally'; g.touchTeam = sv.team; g.touches = 3; g.lastPlayer = sv; g.lastTeam = sv.team;
    g.lastTouchT = g.time; g.hardIn = b.speed > 13; g.netSince = false; g.prevKind = '';
    g.atkTeam = sv.team; g.atkHow = 'ace'; g.atkHits = g.rally.hits; g.atkHuman = human; g.atkGrade = grade; g.atkSet = null;
    // ¿Recibirá bien la IA? Función CONTINUA de la dificultad del saque (velocidad, baile del flotante, zona y
    // carrera del receptor), escalada por la recepción del perfil. (Antes era un corte duro a 13 m/s: un
    // flotante sin apuntar nunca podía ser ace y su baile no contaba.)
    g.recvRisk = r3(serveRisk(g, 1 - sv.team)); // (r3: viaja online en flMeta; 3 decimales bastan y el paquete es más corto)
    // EFFORT: sin dado previo. recvFail(g.recvRisk) se tira en el CONTACTO con la Recepción (y el Ancla) del que la toca de verdad
    // (effortFail), no con la del receptor previsto
    g.digOk = true; g.digK = 0; g.feintFool = false;
    if (human) g.lastGrade = grade;
    if (g.stats) { g.stats.serves[sv.team]++; g.stats.hits.serve++; g.stats.grades[grade]++; if (human) g.stats.hgrades[grade]++; g.stats.shots[sv.shot] = (g.stats.shots[sv.shot] || 0) + 1; }
    var sev = emit(g, { type: 'hit', kind: 'serve', player: sv, team: sv.team, touch: 0, quality: q, grade: grade, timing: te,
      power: power, shot: sv.shot, dive: false, aim: aim ? [aim[0], aim[1]] : null, target: [tx, ty],
      x: b.x, y: b.y, z: b.z, speed: b.speed, human: human, dig: false, recv: false , feint: false, tempo: '', edge: 0, chain: 0});
    if (g.drill) drillOnHit(g, sev);
    endSwing(g);
    if (g.fl) flContact(g, 'serve'); // fl
    // 6v6: el humano solapado en el momento del golpe de saque (reglas 7.4-7.5): el saque sale, pero el árbitro pita en el acto
    if (posFault) fault(g, 0, 'position', 'Falta de posición', g.ctrl, SIGNAL.position);
  }

  /* Saque dirigible flotante: el baile (b.wobA/wobF/wobP ya decididos) desvía el balón de forma determinista. aimFloat lanza de
   * forma que el balón, bailando, caiga en la diana con un resto de FLOAT_DANCE del desvío (el flotante sigue bailando) y pase la
   * red con margen (el desvío hacia atrás del baile metía en la red los flotantes cortos). floatPath integra el vuelo como stepBall. */
  var FLOAT_DANCE = 0.25, _fp = { lx: 0, ly: 0, nz: 9, ny: 0 };
  function floatPath(b, v) {
    var x = b.x, y = b.y, z = b.z, vx = v[0], vy = v[1], vz = v[2], A = b.wobA, F = b.wobF, P = b.wobP, h = 1 / 240, t = 1 / 120;
    _fp.nz = 9; _fp.ny = 0;
    for (var i = 0; i < 1200; i++) {
      var ph = F * t, px = x;
      vy += A * P * Math.cos(ph) * h; vx += A * 0.25 * Math.sin(ph * 1.7) * h;
      vz -= C.G * h; x += vx * h; y += vy * h; z += vz * h; t += h;
      if ((px > 0) !== (x > 0)) { _fp.nz = z; _fp.ny = y; }
      if (z <= C.BR) break;
    }
    _fp.lx = x; _fp.ly = y; return _fp;
  }
  function aimFloat(b, tx, ty, ap) {
    var v = launchSafe(b, tx, ty, C.BR, ap), r = floatPath(b, v);
    var gx = tx + FLOAT_DANCE * (r.lx - tx), gy = ty + FLOAT_DANCE * (r.ly - ty), ax = tx, ay = ty, apex = ap;
    for (var it = 0; it < 24; it++) {
      if (r.nz < C.NET_H + C.BR + 0.12) apex += 0.25;                // roza la red: más alto (globo si es corto)
      else { var ex = gx - r.lx, ey = gy - r.ly; if (ex * ex + ey * ey < 0.0009) break; ax += ex; ay += ey; } // hacia el punto buscado
      v = launchSafe(b, ax, ay, C.BR, apex); r = floatPath(b, v);
    }
    return v;
  }

  function smooth01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  /** Dificultad del saque recién golpeado para el equipo receptor rt (0 = cómodo, ~1 = muy difícil).
   *  Suma: velocidad (desde 10 m/s), baile del flotante (desvío lateral ~2A/F²), margen de carrera del
   *  receptor más rápido hasta el bote (VB.AI.timeTo, con la lectura del saque), cerca de las líneas o corto,
   *  y "entre los dos" (zona de nadie). Un saque que cae fuera no exige recepción (0). */
  function serveRisk(g, rt) {
    var b = g.ball, G = gEff(b);
    var ft = (b.vz + Math.sqrt(b.vz * b.vz + 2 * G * Math.max(0, b.z - C.BR))) / G;
    var lx = b.x + b.vx * ft, ly = b.y + b.vy * ft, sr = side(rt);
    if (lineDist(lx, ly, g) < 0 || lx * sr <= 0) return 0; // fuera = lineDist < 0 (también en las esquinas)
    // ritmo: lo que cuenta para el receptor es el TIEMPO de vuelo (un flotante largo va más rápido solo
    // porque recorre más distancia: no por eso es más difícil); 1,0 s o menos = muy rápido
    var pace = smooth01((1.5 - ft) / 0.55);
    var dev = b.wobA ? 2 * b.wobA / (b.wobF * b.wobF) : 0, wob = smooth01(dev / 0.6);
    var AI = VB.AI, best = 9, mind = 9, who = null;
    for (var i = 0; i < g.teams[rt].length; i++) {
      var q = g.teams[rt][i], tq = AI && AI.timeTo ? AI.timeTo(g, q, lx, ly) : Math.hypot(q.x - lx, q.y - ly) / C.SPEED;
      if (tq < best) { best = tq; who = q; }
      var dq = Math.hypot(q.x - lx, q.y - ly); if (dq < mind) mind = dq;
    }
    var margin = ft - best - ((who && who.prof) || g.prof[rt]).react - 0.2;                 // 0,2 s: leer el saque
    var run = smooth01((0.5 - margin) / 0.8);                        // hay que correr (o tirarse) para llegar
    var move = smooth01((mind - 0.9) / 2.4);                         // lejos de las manos del receptor
    var depth = Math.abs(lx);
    var line = Math.max(smooth01((Math.abs(ly) - 2.7) / 1.4), smooth01((depth - 6.9) / 1.8), smooth01((5 - depth) / 2));
    var rc = g._rc || (g._rc = {});
    rc.pace = pace; rc.wob = wob; rc.run = run; rc.move = move; rc.line = line; rc.ft = ft; rc.who = who; // who: receptor previsto
    return RISK_W.pace * pace + RISK_W.wob * wob + RISK_W.run * run + RISK_W.move * move + RISK_W.line * line;
  }
  var RISK_W = { pace: 0.85, wob: 0.42, run: 0.35, move: 0.3, line: 0.27 };
  /** Probabilidad de que el receptor IA no controle un saque de dificultad `risk` (perfil de recepción rp.recv). */
  function recvFail(risk, rp) {
    var x = Math.max(0, risk - 0.25);
    return clamp(x * x * (0.14 + (1 - rp.recv) * 1.3), 0, 0.8);
  }

  function stepServe(g, dt, input, mx, my, aim, human) {
    var sv = g.server, b = g.ball, sd = side(sv.team), i, p;
    var hs = human && sv.team === (g.online ? g.hT : 0) && sv === g.ctrl; // saca el humano (modo 'one': solo si saca su jugador)
    g.serveT += dt;
    if (!g.serveAuth && g.serveT >= g.whistleAt/*fl*/ && (!g.fl || g.fl.peer || (g.fl.loc[0] && g.fl.loc[1]) || g.serveT >= g.whistleAt + 1.5)/*lf*/) { g.serveAuth = true; if (!g.drill) emit(g, { type: 'whistle', reason: 'serve' }); } // autorización del saque (E6: sin silbato en el Entrenamiento)
    if (g.serveState === 'ready') {
      if (hs) {
        // El sacador humano se desplaza a lo ancho de la zona de saque
        stepPlayer(g, sv, dt, 0, my * 0.8); sv.y = clamp(sv.y, -4.3 * g.cs, 4.3 * g.cs);
        if (g.serveAuth) { if (input.jump || input.jset) toss(g, sv, true); else if (input.hit) toss(g, sv, false); }
        if (g.serveState === 'ready' && g.serveAuth && g.opts.serveClock !== false && !(g.drill && g.drill.kind !== 'free')) { // (E6: sin regla de los 8 s en los ejercicios)
          g.serveClock -= dt;
          if (g.serveClock <= 0) { g.serveClock = 0; fault(g, sv.team, 'serve', g.beach ? 'Falta de saque: 5 segundos' : 'Falta de saque: 8 segundos', sv, g.beach ? 'delay5' : 'delay8'); return; } // playa: 5 s, cinco dedos (D9-11)
        }
      } else {
        stepPlayer(g, sv, dt, 0, 0);
        g.timer -= dt;
        if (g.cpuTossIn >= 0) g.cpuTossIn = g.timer > 0 ? g.timer : 0;
        if (g.serveAuth && g.opts.serveClock !== false) g.serveClock -= dt; // el reloj de 8 s corre para todos (la CPU lanza antes de 4,5 s)
        ritualStep(g, sv);
        if (g.timer <= 0 && g.serveAuth) toss(g, sv, g.drill && g.drill.srvJump ? g.drill.srvJump[g.drill.n % g.drill.srvJump.length] : g.rng() < profOf(g, sv).jumpServe + BADGE.bombarderoAI[bl(sv, 'bombardero')]); // (E6 recepción: tipo de saque fijo)
      }
    } else { // balón en el aire
      g.tossT += dt;
      if (hs) updateServeAim(g, sv, dt, mx, my); // saque dirigible: el stick mueve la diana durante el lanzamiento
      if (g.serveJump && sv.z === 0 && sv.vz === 0 && g.tossT < g.jumpAt + 0.05) {
        // carrera de saque en salto (automática): 2 pasos hacia la red, despegue detrás de la línea
        var run = g.tossT > 0.2 ? 0.75 / Math.max(0.2, g.jumpAt - 0.2) / C.SPEED : 0;
        stepPlayer(g, sv, dt, -sd * run, 0);
        if (g.tossT >= g.jumpAt) jump(g, sv, -sd * 0.55, 0);
      } else stepPlayer(g, sv, dt, 0, 0);
      if (hs) {
        if ((input.jump || input.jset) && !g.serveJump) jump(g, sv, 0, 0); // salto con toss bajo: flotante en salto
        if (input.hit) startSwing(g, sv, '');
        processSwing(g, sv, aim);
        if (g.mode === 'serve' && g.hitBuf <= 0 && g.swingLive) { endSwing(g); g.swingLock = g.tm.lock; }
      } else if (canReach(g, sv) && b.vz <= 0) { // la IA golpea siempre con el balón ya bajando
        var w = hitWindow(g, sv);
        if (w.t <= -g.aiServeTe || !w.reach || b.vz < -6) doServe(g, sv, null, -w.t, VB.AI && VB.AI.serveTarget ? VB.AI.serveTarget(g, sv) : null);
      }
      if (g.mode === 'serve' && b.vz < 0 && b.z < sv.z + 1.0) { // el balón cae sin golpearlo
        fault(g, sv.team, 'serve', 'Falta de saque: el balón cae sin golpearlo', sv, 'serveFault'); return;
      }
    }
    // 6v6 en Difícil/Experto (g.posRule6): el humano que no saca se coloca él durante el saque (puede solaparse: doServe se lo pita);
    // la marca de recepción (fx.js, VB.AI6.spot) le enseña su sitio legal. En Fácil/Normal, y en 2v2, nadie más se mueve
    var hm = g.posRule6 && human && !hs && g.ctrl.team === 0 && g.mode === 'serve' ? g.ctrl : null;
    if (hm && (mx || my)) g.hAct = g.time;
    for (i = 0; i < g.players.length; i++) { p = g.players[i]; if (p !== sv/*fl*/ && (!g.fl || mine(g, p))/*lf*/) stepPlayer(g, p, dt, p === hm ? mx : 0, p === hm ? my : 0); }
    stepBall(g, dt);
  }

  /** 6v6: al empezar set o partido, la rotación vuelve a la alineación inicial (g.lineup). Nada en 2v2. */
  function resetRot(g) {
    if (!g.rot) return;
    for (var t = 0; t < 2; t++) for (var z = 0; z < g.lineup[t].length; z++) g.rot[t][z] = g.lineup[t][z];
    refreshZones(g);
  }
  function nextSet(g) {
    g.pendingSet = false; g.setNo++; g.score = [0, 0]; g.serving = (g.setNo - 1) % 2; g.courtSwap3 = false; g.courtSwapAt = 0;
    g.streakTeam = -1; g.streakN = 0; // la racha es dentro del set
    g.challenges = [perSet(g), perSet(g)]; // los challenges no se acumulan entre sets
    g.serverIdx = g.serving === 0 ? [0, 1] : [1, 0];
    if (g.ctrlIdx) g.serverIdx[0] = 1 - g.serverIdx[0]; // modo 'one' con el n.º 2: el orden de saque del equipo 0, en espejo
    if (g.online) {
      if (g.hum[1].p.idx === 1) g.serverIdx[1] = 1 - g.serverIdx[1];
      g.tmoLeft[0] = g.tmoLeft[1] = g.tmoPer;
      for (var tq = 0; tq < 2; tq++) if (g.tmoReq[tq]) { g.tmoReq[tq] = false; emit(g, { type: 'timeoutCancel', team: tq }); } // no pasa al set siguiente
    }
    var lu = g.subsOn ? subsNewSet(g) : null; // banquillo: alineación del set (sin gastar cambios) y contadores a 0
    resetRot(g);
    emit(g, { type: 'newSet', setNo: g.setNo });
    if (lu) subsLineupEv(g, lu);
  }
  function newGame(g) {
    g.score = [0, 0]; g.sets = [0, 0]; g.setNo = 1; g.serving = 0; g.serverIdx = [0, 1]; g.setScores = [];
    // modo 'one' con el n.º 2 (ctrlIdx 1): orden de saque en espejo, así el jugador del humano saca primero como con el n.º 1
    if (g.ctrlIdx) g.serverIdx[0] = 1;
    if (g.online) { if (g.hum[1].p.idx === 1) g.serverIdx[1] = 0; g.tmoLeft[0] = g.tmoLeft[1] = g.tmoPer; g.tmo = null; g.tmoReq[0] = g.tmoReq[1] = false; }
    if (g.subsOn) subsNewSet(g, true); // banquillo: pista = alineación, contadores a 0 (también al volver a empezar la demo)
    resetRot(g);
    g.pendingSet = false; g.finished = false; g.lastPoint = null; g.courtSwap3 = false;
    g.challenges = [perSet(g), perSet(g)]; g.call = null; g.review = null; g.cpuChal = null; g._snap = null; g._pendCall = null;
    g.streakTeam = -1; g.streakN = 0;
    g.courtSwapAt = 0;
    emit(g, { type: 'newMatch', demo: g.demo, difficulty: g.difficulty, venue: g.venue });
    if (g.drill) drillStage(g); else setupServe(g); // E6: el montaje del ejercicio en lugar del primer saque
  }

  function dirLen(m) { return m ? Math.hypot(m[0], m[1]) : 0; }
  var NOIN = { move: [0, 0], hit: false, jump: false, switchPlayer: false };
  var _aim = [0, 0];

  /** Avanza la simulación dt segundos (paso fijo recomendado 1/120).
   *  input (mundo, solo equipo humano): {move:[wx,wy] (|v|<=1), hit, jump, switchPlayer}
   *  hit/jump/switchPlayer = "pulsado en este paso" (flanco).
   *  - Saque: mover = desplazarse a lo ancho; GOLPEAR = lanzar flotante, SALTAR = lanzar
   *    para saque en salto; luego GOLPEAR en el momento justo (dirección = apuntar).
   *  - Peloteo: GOLPEAR = toque (el juego decide recepción/colocación/remate);
   *    SALTAR en el suelo = salto (remate/bloqueo); SALTAR en el aire = dejada.
   *    jset (COLOCAR): en el suelo = SALTAR; en el aire = colocación en salto (2º toque, o 1r con el balón alto en la red). */
  function step(g, dt, input) {
    if (g.online) return /*fl*/g.fl && !g.fl.loc[1 - g.fl.me] ? stepFluid(g, dt, input) : /*lf*/stepOnline(g, dt, input); // ONLINE: input = [entrada del hueco 0, entrada del hueco 1]
    input = input || NOIN;
    var AI = VB.AI, b = g.ball;
    g.time += dt; g.blockCD -= dt; g.hitBuf -= dt; g.swingLock -= dt; g.jsetQ -= dt;
    var human = !g.demo && !g.autopilot && !g.ctrlOut; // (Carrera: con tu atleta en el banquillo, g.ctrlOut, la entrada no mueve nada)
    var mv = input.move || NOIN.move, ml = dirLen(mv);
    var mx = mv[0], my = mv[1];
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    var aim = null;
    if (ml > 0.2) { _aim[0] = mx / ml; _aim[1] = my / ml; aim = _aim; }
    g.aimOn = !!aim; if (aim) { g.aimIn[0] = aim[0]; g.aimIn[1] = aim[1]; } // para aimPoint (UI/FX)
    if (g.rot || g.mastery) g.aimLen = ml; // 6v6: el módulo del stick, que aim ya no lleva (carril del colocador humano, laneOf: |stick| < 0,4 = sin carril)
    var i, p;

    if (g.review) { // B2: revisión en curso: todo en espera (el reloj del punto no corre)
      g.review.t += dt;
      for (i = 0; i < g.players.length; i++) stepPlayer(g, g.players[i], dt, 0, 0);
      if (g.mode === 'point' || g.mode === 'over') stepBall(g, dt);
      if (g.review.t >= g.review.dur) endReview(g);
      return;
    }
    if (g.cpuChal && g.time >= g.cpuChal.at) { var cc = g.cpuChal; g.cpuChal = null; if (challenge(g, cc.team)) return; }

    if (g.mode === 'point' || g.mode === 'over') {
      for (i = 0; i < g.players.length; i++) stepPlayer(g, g.players[i], dt, 0, 0);
      if (g.subWait) subWalk(g, dt); // banquillo: el que entra camina desde la zona de cambio
      stepBall(g, dt);
      if (g.drill) { if (!g.drill.done) { g.timer -= dt; if (g.timer <= 0) drillStage(g); } return; } // E6: siguiente repetición (o quieto al acabar)
      g.timer -= dt;
      if (g.timer <= 0) {
        if (g.mode === 'over') {
          if (g.demo) { newGame(g); }
          else if (!(g.call && g.call.waived) && (canChallenge(g, 0) > 0 || canChallenge(g, 1) > 0 || g.cpuChal)) g.timer = 0; // B2: la ventana dura sus 7 s también en el punto de partido
          else if (!g.finished) { g.finished = true; emit(g, { type: 'gameOver', team: g.sets[0] > g.sets[1] ? 0 : 1, sets: [g.sets[0], g.sets[1]], setScores: g.setScores.slice() }); }
        } else {
          if (g.pendingSet) nextSet(g);
          // banquillo (g.subsOn): en balón muerto, antes del saque, los cambios pedidos y los del entrenador; con alguno, el saque espera
          // SUB_HOLD s (rótulo y paseo del que entra) y luego se prepara sin volver a mirar
          if (g.subsOn && !g.subWait && applySubs(g)) { g.subWait = true; g.timer = SUB_HOLD; }
          else { if (g.subsOn) { g.subWait = false; g.subWalkL.length = 0; } setupServe(g); }
        }
      }
      return;
    }
    if (g.mode === 'serve') {
      // 6v6: «¡Pídela!» durante el saque no vale (aún no hay jugada): se avisa igual (evento 'ask' sin ok)
      if (g.rot && human && input && input.switchPlayer) emit(g, { type: 'ask', player: g.ctrl, ok: false });
      stepServe(g, dt, input, mx, my, aim, human); if (g.mode !== 'serve') endRitual(g); refreshPred(g); return;
    }
    // ---- Peloteo ----
    g.rally.t += dt;
    // (g.pr1/g.pr3 ya están al día: se recalculan al final de cada paso, ver refreshPred)
    g.jobs[0] = AI.computeJob(g, 0); g.jobs[1] = AI.computeJob(g, 1);
    if (g.drill) drillJobs(g); // E6: los que no juegan no van al balón (el del humano va por ellos)
    var hp = null;
    if (!g.demo) {
      var cpuSet = updateDefense(g);
      // el control pasa solo al que le toca jugar el siguiente toque, salvo:
      //  - el humano eligió bloquear (defRole 'block'): sigue en el bloqueo hasta que el balón vuelva a ser nuestro;
      //  - balón rápido a menos de 0,6 s del contacto: un cambio ahí metería toda la ventana de defensa
      //    dentro del deslizamiento de la cámara. Juega el compañero IA y el control pasa en el siguiente toque.
      var fastLate = Math.hypot(b.vx, b.vy, b.vz) > 12 && g.pr1.t < 0.6;
      if (g.ctrlMode === 'one') {
        // modo 'one': nunca cambia el control; el compañero IA juega sus toques (AI.update)
        // 6v6: CAMBIAR es «¡Pídela!» (con el balón en nuestro campo antes de la colocación: el colocador te elige más; VB.AI6.chooseSet)
        // (solo vale con askOk: delantero y antes de nuestra colocación; si no, «Ahora no». El evento 'ask' lo pinta ui.js)
        if (g.rot && human && input.switchPlayer) { var ak = askOk(g); if (ak) g.ask6 = g.time; emit(g, { type: 'ask', player: g.ctrl, ok: ak }); }
      } else if (g.jobs[0] && g.jobs[0] !== g.ctrl) {
        // (bloqueo activo: con una pulsación de bloqueo viva el control no se va al compañero antes del contacto)
        if (!(g.defRole === 'block' && g.touchTeam === 1) && !fastLate && !(g.ctrl.pressEnd >= g.time)) { emit(g, { type: 'switch', from: g.ctrl, to: g.jobs[0], auto: true }); g.ctrl = g.jobs[0]; endSwing(g); }
      } else if (!g.jobs[0] && input.switchPlayer && human) {
        var o2 = other(g, g.ctrl); emit(g, { type: 'switch', from: g.ctrl, to: o2, auto: false }); g.ctrl = o2; endSwing(g);
        if (cpuSet) g.defRole = g.defRole === 'block' ? 'dig' : 'block'; // durante la colocación rival: cambia de rol
      }
    }
    if (human) {
      hp = g.ctrl;
      // C2 (colocar por destino): con la ventana de colocación abierta (setWin) la dirección es el destino (g.setDirA). Mover no es
      // apuntar (revisión C2):
      //  - la dirección que traía al abrirse la ventana y, fuera de su sitio (hitWindow sin .reach o a >= posD m del aro amarillo,
      //    focusPoint), cualquiera son movimiento: quedan de arrastre (setCarry, setCarryK 1) y, ya en su sitio, siguen siendo neutras
      //    hasta que las suelta (un sector vecino sin soltar, el stick que se desvía o la flecha de al lado, también);
      //  - en su sitio, una dirección nueva (setCarryK 2) es el destino, salvo si empuja hacia el aro estando a más de towD m de su
      //    centro (sTow: retocar la posición, o volver tras pasarse): eso también es movimiento y arrastre (setCarryK 1). En la ventana
      //    el imán lleva al centro del aro (assistMove con ring), así que ya colocado cualquier flecha apunta.
      // Durante el gesto, soltar conserva la última (como swingHasAim). Sin g.rng
      var sWin = setWin(g), MS = MASTERY.set, sPos = false, sTow = false;
      // (6v6 con la diana de colocación en salto, g.jsetAim: en el aire el stick mueve la diana y g.setDirA queda la del despegue)
      var sFrz = sWin && !!g.rot && g.jsetAim && hp.z > 0 && jsetReady(g);
      if (sWin && !sFrz) {
        var sdA = side(hp.team), sAng = aim ? (Math.atan2(sdA * aim[1], -sdA * aim[0]) * 57.29577951308232 + 360) % 360 : 0, sSec = setSec(sAng);
        var sHeld = !!aim && ml >= MS.dead, wP = hitWindow(g, hp, _wPlant);
        if (!g.setWinOn) { g.setWinOn = true; g.setCarry = sHeld ? sSec : -1; g.setCarryK = 1; g.setDirA = NaN; } // (la que traía al abrirse)
        var sFp = focusPoint(g), sFx = sFp.x - hp.x, sFy = sFp.y - hp.y, sFd = Math.hypot(sFx, sFy), sCd = (sSec - g.setCarry + 8) % 8;
        sPos = hp.z > 0 || (wP.reach && sFd < MS.posD); // (en el aire la dirección ya no mueve: colocación en salto, apunta)
        if (sHeld && hp.z === 0 && sFd > MS.towD) sTow = (mx * sFx + my * sFy) / (ml * sFd) > MS.towCos;
        if (!sHeld) { g.setCarry = -1; if (!g.swingLive) g.setDirA = NaN; }
        else if (!sPos) { g.setCarry = sSec; g.setCarryK = 1; if (!g.swingLive) g.setDirA = NaN; }
        else {
          if (g.setCarry < 0 || (sCd > 1 && sCd < 7)) { g.setCarry = sSec; g.setCarryK = sTow ? 1 : 2; }
          if (g.setCarryK === 1) { if (!g.swingLive) g.setDirA = NaN; }
          else g.setDirA = sAng;
        }
      } else if (!sWin && g.setWinOn) { g.setWinOn = false; g.setCarry = -1; g.setDirA = NaN; }
      // salto con impulso: búfer de la última dirección (ejes del equipo) y colocador plantado (C2: salta en vertical)
      if (g.djump && ml >= DJ.dead && hp.z === 0) { var sdJ = side(hp.team); g.jdF = -sdJ * mx / ml; g.jdS = sdJ * my / ml; g.jdM = ml; g.jdT = g.time; }
      var plantJ = sWin && sPos && !sTow;
      // C2: COLOCAR en el suelo, en la ventana y con el balón a la altura de colocar de pie, coloca (no salta)
      if (input.jset && g.mode === 'rally' && groundSet(g, hp)) startSwing(g, hp, '');
      else if (input.jump || input.jset) { // COLOCAR (jset) en el suelo salta como SALTAR
        if (hp.z === 0 && hp.vz === 0) humanJump(g, hp, mx, my, ml, plantJ);
        else if (input.jset && jsetVoid(g, hp)) { /* bloqueando un remate rival: COLOCAR no hace nada */ }
        else if (hp.z > 0.2 && hp.actionT > 0.12 && Math.hypot(b.x - hp.x, b.y - hp.y) < 3) startSwing(g, hp, input.jset ? 'jset' : 'tip'); // en el aire: colocación en salto / dejada
        else if (input.jset && hp.z > 0) g.jsetQ = JSET.buf; // recién despegado: COLOCAR se guarda JSET.buf s (doble pulsación rápida = salta y coloca)
      }
      if (g.jsetQ > 0 && hp.z > 0.2 && hp.actionT > 0.12 && Math.hypot(b.x - hp.x, b.y - hp.y) < 3 && !jsetVoid(g, hp)) { g.jsetQ = 0; startSwing(g, hp, 'jset'); }
      if (hp.z > 0) stepPlayer(g, hp, dt, 0, 0);
      else {
        // E1 (colocación dirigida): durante el gesto de la colocación de 2º toque desde el suelo el stick apunta y no mueve (si no, al elegir
        // la zona el colocador se iba del balón y la colocación salía mala o fallaba)
        // Solo mientras el stick elige zona (swingHasAim, módulo >= MASTERY.set.dead) Y el balón ya le llega desde donde está
        // (hitWindow .reach y a < 0,6 m): quien pulsa pronto aún corriendo al balón sigue corriendo (el stick es también el movimiento; plantarlo
        // ahí bajaba ~8 puntos la escala del novato en Normal). Plantado sigue el imán de la asistencia (assistMove con 0,0)
        // C2: también antes de pulsar, ya en su sitio (sPos) y sin retocar hacia el balón (sTow), con una dirección elegida, con el gesto
        // abierto o a <= MASTERY.set.plantT s del toque: ahí el imán le centra (2v2) y la flecha que pulse apunta en vez de moverle
        var plant = sWin && sPos && !sTow && (g.setDirA === g.setDirA || g.swingLive || _wPlant.t <= MS.plantT);
        var am = assistMove(g, hp, plant ? 0 : mx, plant ? 0 : my, sWin);
        stepPlayer(g, hp, dt, am[0], am[1]);
      }
      if (g.rot && (ml > 0.15 || input.hit || input.jump || input.jset || input.switchPlayer)) g.hAct = g.time; // 6v6: el humano juega (VB.AI6.setReady)
      updateAim3(g, hp, dt, mx, my);
      if (input.hit && g.mode === 'rally' && !blockPress(g, hp)) startSwing(g, hp, '');   // (en el bloqueo, GOLPEAR = bajar el bloqueo)
      if (g.mode === 'rally') processSwing(g, hp, aim);
      if (g.lastTouchT === g.time && g.mode === 'rally') refreshPred(g); // la IA de este paso ya ve el balón nuevo
    }
    for (i = 0; i < g.players.length; i++) {
      p = g.players[i]; if (p === hp || g.mode !== 'rally') continue;
      if (g.drill && drillIdle(g, p)) { stepPlayer(g, p, dt, 0, 0); continue; } // E6: no juega en este ejercicio
      AI.update(g, p, dt);
    }
    if (g.drill && g.ctrl.z > 0.05) g.drill.jumped = true; // E6 (Bloqueo): ¿ha saltado el humano en esta repetición?
    for (i = 0; i < 2 && g.mode === 'rally'; i++) stepBall(g, dt / 2);
    refreshPred(g);
  }

  /** A1: mira libre del remate. Atacante humano del 3r toque en el aire: g.aim3 empieza en el objetivo por defecto
   *  (diagonal) y la dirección (mundo) lo mueve a AIM3_SPEED m/s dentro del campo rival. Fuera de ese caso, off. */
  var AIM3_SPEED = 11;
  function updateAim3(g, p, dt, mx, my) {
    var ht = g.online ? p.team : 0, a = g.aim3, on = g.mode === 'rally' && p.team === ht && p.z > 0 && atkPhase(g, ht);
    // salto con impulso: la dirección del despegue (g.jdF/jdS) no mueve la diana hasta que se suelta o gira más de 67,5° (g.aimCarry)
    if (g.aimCarry) {
      var cl = Math.hypot(mx, my), sdc = side(p.team);
      if (cl < DJ.dead || (mx * (-sdc * g.jdF) + my * (sdc * g.jdS)) / cl < 0.383) g.aimCarry = 0;
      else { mx = 0; my = 0; }
    }
    if (!on) {
      if (g.jsetAim && g.mode === 'rally' && p.team === ht && p.z > 0 && jsetReady(g)) { jsetAimStep(g, p, a, dt, mx, my); return; }
      a.on = false; return;
    }
    var sd = side(p.team);
    if (!a.on || a.kind !== 'spike') { var d0 = attackTarget(p, null, 6, g.cs); a.x = d0[0]; a.y = d0[1]; a.on = true; a.kind = 'spike'; }
    // (E1, g.mastery: la diana llega hasta MASTERY.edge.lim de las líneas: se puede jugar al filo)
    var lx = g.mastery ? g.HL - MASTERY.edge.lim : 8.3 * g.cs, ly = g.mastery ? g.HW - MASTERY.edge.lim : 3.9 * g.cs;
    a.x = -sd * clamp(-sd * (a.x + mx * AIM3_SPEED * dt), 1.4 * g.cs, lx);
    a.y = clamp(a.y + my * AIM3_SPEED * dt, -ly, ly);
  }

  /** Salto con impulso, colocación en salto con diana (g.jsetAim): mientras el humano en el aire puede colocar en salto (jsetReady,
   *  fuera del ataque), g.aim3 = {on, kind 'jset', x, y}. Nace en el destino de siempre (2v2: JSET.tx al lado del compañero; 6v6:
   *  VB.AI6.previewSet) y lo sigue mientras no se mueva; el stick la lleva a JD.spd m/s dentro de la caja de JD (g.jsMv = 1 tras JD.mv
   *  m de recorrido). Sin g.rng. */
  function jsetAimStep(g, p, a, dt, mx, my) {
    var sd = side(p.team), cs = g.cs || 1;
    if (!a.on || a.kind !== 'jset') { a.on = true; a.kind = 'jset'; g.jsMv = 0; g.jsAimD = 0; }
    if (!g.jsMv) {
      if (g.rot && VB.AI6 && VB.AI6.previewSet) { var r = VB.AI6.previewSet(g, p, _ps6); a.x = sd * r.d; a.y = sd * r.yl; }
      else { var mt = other(g, p); a.x = sd * JSET.tx; a.y = clamp(mt.y, -JSET.mate, JSET.mate); }
    }
    var ddx = mx * JD.spd * dt, ddy = my * JD.spd * dt;
    if (ddx || ddy) {
      g.jsAimD += Math.hypot(ddx, ddy); if (g.jsAimD >= JD.mv) g.jsMv = 1;
      var dmax = (g.rot ? JD.dMax6 : JD.dMax2) * cs, ylim = g.HW - JD.yIn * cs;
      a.x = sd * clamp(sd * (a.x + ddx), JD.dMin * cs, dmax);
      a.y = clamp(a.y + ddy, -ylim, ylim);
    }
  }
  /** Lectura pura de la diana de la colocación en salto (g.jsetAim) para fx/ui/IA: out = {on, x, y (mundo), tempo ('quick'|'lane'|
   *  'high', con el toque previsto), apex, moved (la diana se ha movido: la colocación irá allí), bx, by (batida del atacante, como
   *  setPreview), ok (llega a tiempo, informativo)} o null si no hay diana. Sin g.rng. */
  var _dpJa = { lane: '', pref: 0, apexD: 0, to: null, d: 0, yl: 0 };
  var _ja = { on: false, x: 0, y: 0, ax: 0, ay: 0, tempo: '', apex: 0, moved: false, bx: 0, by: 0, ok: true }, _wJa = { t: 0, press: 0, d: 9, dz: 9, reach: false, kind: '', zc: 0, x: 0, y: 0, z: 0, active: false, canReach: false, attack: false, jumpT: NaN };
  function jsetAimInfo(g, out) {
    var a = g.aim3, p = g.ctrl;
    if (!g.jsetAim || !a.on || a.kind !== 'jset' || !p) return null;
    out = out || _ja;
    var b = g.ball, sd = side(p.team), cs = g.cs || 1, M = MASTERY.set;
    var w = hitWindow(g, p, _wJa), z0 = w.reach ? w.z : b.z, sx = w.reach ? w.x : b.x, sy = w.reach ? w.y : b.y;
    // destino real: la diana (2v2); 6v6 con la diana movida, la diana metida en la caja del atacante más cercano (VB.AI6.dianaPlan,
    // como hit); out.ax/ay = la diana tal cual (fx pinta la diana ahí y el marcador del tempo en x/y)
    var ex = a.x, ey = a.y;
    if (g.rot && g.jsMv && g.touchTeam === p.team && g.touches === 1 && VB.AI6 && VB.AI6.dianaPlan) { var dp = VB.AI6.dianaPlan(g, p, a.x, a.y, _dpJa); ex = sd * dp.d; ey = sd * dp.yl; }
    var s = Math.hypot(ex - sx, ey - sy), D = sd * ex;
    var apex = clamp(z0 + JD.ap0 + JD.apS * s, JD.apMin, JD.apMax);
    var tempo = (s <= JD.qS && D <= JD.qD * cs) ? 'quick' : apex >= JD.hiAp ? 'high' : 'lane';
    out.on = true; out.x = ex; out.y = ey; out.ax = a.x; out.ay = a.y; out.tempo = tempo; out.apex = apex; out.moved = !!g.jsMv;
    out.bx = sd * Math.min((D / cs + (M.atkAp[tempo] || M.atkAp.high)) * cs, M.atkMaxX * cs); out.by = ey;
    var at = g.rot ? null : other(g, p);
    if (at) { // 2v2: la batida, a >= atkSep m del toque (como setPreview)
      var bdx = out.bx - sx, bdy = out.by - sy, bdl = Math.hypot(bdx, bdy), R = M.atkSep * cs;
      if (bdl < R) {
        if (bdl < 0.3 * cs) { bdx = 0; bdy = at.y >= sy ? 1 : -1; bdl = 1; }
        out.bx = sx + bdx / bdl * R; out.by = clamp(sy + bdy / bdl * R, -(g.HW - 0.3 * cs), g.HW - 0.3 * cs);
      }
    }
    var fl = Math.sqrt(2 * Math.max(0, apex - z0) / C.G) + Math.sqrt(2 * Math.max(0, apex - JSET.tz) / C.G);
    out.ok = !at || !(VB.AI && VB.AI.timeTo) || VB.AI.timeTo(g, at, out.bx, out.by) <= Math.max(0, w.t) + fl - 0.25;
    return out;
  }
  /** Salto con impulso: dónde y cuándo aterriza p (pura): out = {x, y, t (s), net (aterriza a menos de NET_TOUCH + 0,1 de la red)}.
   *  En el suelo, su posición y t = 0. */
  var _lo = { x: 0, y: 0, t: 0, net: false };
  function landingOf(g, p, out) {
    out = out || _lo;
    var air = p.z > 0 || p.vz > 0, t = air ? (p.vz + Math.sqrt(p.vz * p.vz + 2 * C.G * Math.max(0, p.z))) / C.G : 0;
    out.t = t; out.x = p.x + (air ? p.jvx * t : 0); out.y = p.y + (air ? p.jvy * t : 0);
    out.net = Math.abs(out.x) < C.NET_TOUCH + 0.1;
    return out;
  }

  /* Saque dirigible (sprint Carrera): mientras saca el humano, g.aim3 = {on: true, kind: 'serve', x, y} en el campo rival.
   * Aparece con el balón en la mano (serveReady) en el centro del fondo rival (SERVE_AIM0) y queda quieta en 'ready', porque
   * ahí el stick mueve al sacador a lo ancho; en el lanzamiento ('toss') la dirección (mundo) la mueve a SERVE_AIM_SPEED m/s
   * por todo el campo rival, hasta las líneas (|x| SERVE_AIM_MIN..HL, |y| <= HW). doServe apunta a ella con serveSpread(q). */
  var SERVE_AIM0 = 7.0, SERVE_AIM_SPEED = 12, SERVE_AIM_MIN = 1.0;
  function serveAimReset(g, sv) {
    if (g.online) { // ONLINE: diana de saque en el hueco del sacador humano; los demás, apagadas
      for (var s = 0; s < 2; s++) { var a2 = g.hum[s].aim3, mine = g.hum[s].p === sv && isHuman(g, sv);
        a2.on = mine; a2.kind = mine ? 'serve' : ''; if (mine) { a2.x = -side(sv.team) * SERVE_AIM0 * g.cs; a2.y = 0; } }
      return;
    }
    var a = g.aim3;
    if (!isHuman(g, sv)) { a.on = false; a.kind = ''; return; }
    a.on = true; a.kind = 'serve'; a.x = -side(sv.team) * SERVE_AIM0 * g.cs; a.y = 0;
  }
  function updateServeAim(g, sv, dt, mx, my) {
    var a = g.aim3; if (!a.on || a.kind !== 'serve') return;
    var sd = side(sv.team);
    a.x = -sd * clamp(-sd * (a.x + mx * SERVE_AIM_SPEED * dt), SERVE_AIM_MIN, g.HL);
    a.y = clamp(a.y + my * SERVE_AIM_SPEED * dt, -g.HW, g.HW);
  }

  /** Predicciones de cruce (g.pr1 a 1 m, g.pr3 a 3 m) al día con el balón al FINAL del paso: lo que lee la
   *  UI/cámara/FX tras el paso (antes se calculaban al principio y tras un toque quedaban viejas un paso). */
  function refreshPred(g) {
    if (g.mode !== 'rally') return;
    predict(g, 1, g.pr1); predict(g, 3, g.pr3);
  }

  /** Rol defensivo del humano (revisión 2). El rol se decide ANTES del ataque, no después: en cuanto la CPU
   *  coloca para atacar (2º toque con el balón quedándose en su campo, ~1 s antes del remate), el humano pasa
   *  a DEFENDER: si su jugador es el que está más cerca de la red, el control se desliza al compañero de atrás
   *  (evento switch auto, reason 'defense') y el compañero IA bloquea. La cámara tiene tiempo de asentarse y
   *  el humano conserva defensa -> (colocación del compañero) -> remate. Mientras dura esa colocación, CAMBIAR
   *  intercambia los papeles (defRole 'block': el humano bloquea y defiende la IA).
   *  Antes el control saltaba del bloqueador al defensor ~0,43 s antes del contacto, en plena transición.
   *  Devuelve true durante la fase en la que se puede elegir rol (colocación rival, balón aún en su campo). */
  function updateDefense(g) {
    var ht = g.online ? g.hT : 0, op = 1 - ht, sh = side(ht); // (online: el humano del hueco activo; sh·x es exacto: sh = ±1)
    if (g.mode !== 'rally' || g.touchTeam !== op || g.lastKind === 'serve') { g.defRole = ''; return false; }
    var setPhase = atkPhase(g, op) && sh * g.ball.x < 0 && sh * g.pr3.x < -0.2 && sh * g.pr3.x > -4.2;
    if (setPhase && g.rot) {
      // 6v6: el reparto lo hace la formación (VB.AI6.blockPlan / defensa perímetro): el humano delantero bloquea, el zaguero defiende
      var bp6 = g.ctrl.front && VB.AI6 ? VB.AI6.blockPlan(g, 0) : null;
      g.defRole = bp6 && (bp6.a === g.ctrl || bp6.b === g.ctrl) ? 'block' : 'dig';
    } else if (setPhase && g.ctrlMode === 'one') {
      // modo 'one': sin cambio de control; bloquea el que esté más cerca de la red (el humano o su compañero IA).
      // El reparto se REVISA durante la colocación de la CPU: si el humano sube a la red (o salta cerca de ella), el
      // compañero IA se echa atrás a defender; si el humano se va al fondo, el compañero sube a bloquear. Con histéresis
      // (diferencia clara de posición) y congelado en el último tramo (sin tiempo para recolocarse) o con el compañero en el aire.
      var hc1 = g.ctrl, hm1 = other(g, hc1), hx = Math.abs(hc1.x), mx1 = Math.abs(hm1.x);
      if (!g.defRole) g.defRole = hx <= mx1 ? 'block' : 'dig';
      else if (g.pr3.t > 0.35 && hm1.z <= 0) {
        if (g.defRole === 'dig' && ((hx < 1.3 && hx < mx1 + 0.3) || hx < mx1 - 0.8 || (hc1.z > 0 && hx < 2))) g.defRole = 'block';
        else if (g.defRole === 'block' && hc1.z <= 0 && hx > 3.2 && hx > mx1 - 0.5) g.defRole = 'dig';
      }
    } else if (setPhase && !g.defRole && !(Math.hypot(g.ball.vx, g.ball.vy, g.ball.vz) > 12 && g.pr1.t < 0.6)) { // (balón rápido a < 0,6 s: se decide después, como fastLate)
      g.defRole = 'dig';
      var c = g.ctrl, m = other(g, c);
      if (Math.abs(c.x) < Math.abs(m.x)) { // el humano está más cerca de la red: defiende el otro, bloquea la IA
        emit(g, { type: 'switch', from: c, to: m, auto: true, reason: 'defense' }); g.ctrl = m; endSwing(g);
      }
    }
    return setPhase;
  }

  /** Vacía y devuelve la cola de eventos (main.js lo hace una vez por frame). */
  function drainEvents(g, out) {
    out = out || [];
    for (var i = 0; i < g.events.length; i++) out.push(g.events[i]);
    g.events.length = 0; return out;
  }

  /** Destino previsto del golpe del HUMANO con la dirección actual (para la retícula de apuntado de FX/UI).
   *  Mismas fórmulas que doServe (sin objetivo de IA) y hit (remate attackTarget dd 6, dejada, balón libre
   *  dd 6,5), SIN el error aleatorio de ejecución. move: [wx,wy] opcional (entrada de mundo de este frame); si
   *  no se pasa, la del último paso de la sim (g.aimIn) o, sin dirección, la que se dio durante el gesto.
   *  Devuelve out = {x, y, kind:'serve'|'spike'|'tip'|'free', mode: 1 (vista previa: saque aún sin lanzar) |
   *  2 (activo), aimed (hay dirección), spread (m: dispersión con un toque 'perfect'), spreadPoor (con 'poor')}
   *  o null si ahora no toca apuntar (CPU sacando, sin ataque propio, demo/autopilot). Sin asignaciones si se
   *  pasa out. */
  var _ap = { x: 0, y: 0, kind: '', mode: 0, aimed: false, spread: 0, spreadPoor: 0, spreadNow: 0 }, _apA = [0, 0];
  function aimPoint(g, out, move) {
    if (g.demo || g.autopilot) return null;
    out = out || _ap;
    out.edge = 0; // E1: proximidad de la diana a la línea (0..1, edgeOf), solo con g.mastery en la mira libre y el golpe colocado
    var a = null, b = g.ball, p, sd, tx, ty, kind, mode;
    if (move && move.length >= 2) {
      var ml = Math.hypot(move[0], move[1]);
      if (ml > 0.2) { _apA[0] = move[0] / ml; _apA[1] = move[1] / ml; a = _apA; }
    } else if (g.aimOn) a = g.aimIn;
    if (!a && g.swingLive && g.swingHasAim) a = g.swingAim;
    if (g.mode === 'serve') {
      p = g.server; if (!p || p.team !== (g.online ? g.hT : 0) || p !== g.ctrl || (g.online && g.hum[g.hT].ai)) return null; // modo 'one': no apunta el saque del compañero IA
      mode = g.serveState === 'toss' ? 2 : (g.serveAuth ? 1 : 0); if (!mode) return null;
      if (g.aim3.on && g.aim3.kind === 'serve') { // saque dirigible: la diana y su dispersión (radio) según el timing
        var jmp = g.serveState === 'toss' && g.serveJump, ssk = p.ak ? p.ak.srvSpread : 1;
        out.x = g.aim3.x; out.y = g.aim3.y; out.kind = 'serve'; out.mode = mode; out.aimed = true;
        out.spread = serveSpread(0.95, jmp) * ssk; out.spreadPoor = serveSpread(0.3, jmp) * ssk;
        out.spreadNow = g.serveState === 'toss' && b.vz <= 0 ? serveSpread(qNowServe(g, p), jmp) * ssk : out.spread + (out.spreadPoor - out.spread) * 0.5;
        return out;
      }
      sd = side(p.team); tx = -sd * 6; ty = 0;
      if (a) { tx += a[0] * 2.4; ty += a[1] * 3.4; }
      tx = -sd * clamp(-sd * tx, 2, 8.4); ty = clamp(ty, -4, 4); kind = 'serve';
      out.spread = 0.3 + 1.3 * 0.05; out.spreadPoor = 0.3 + 1.3 * 0.55; // flotante (el salto: algo más)
      if (g.serveJump) { out.spread = 0.3 + 1.5 * 0.05; out.spreadPoor = 0.3 + 1.5 * 0.55; }
    } else if (g.mode === 'rally') {
      p = g.ctrl; var ht = g.online ? g.hT : 0, sh = side(ht);
      if (!p || p.team !== ht || !atkPhase(g, ht) || sh * b.x < -0.2 || sh * b.x > 4.5 || (g.online && g.hum[ht].ai)) return null;
      mode = 2; sd = side(p.team);
      var air = isAttackContact(p, b);
      if (g.swingLive && g.swingShot === 'jset' && p.z > 0) { // colocando en salto: no hay retícula de ataque
        // (E1: en el 3r toque COLOCAR es el golpe colocado: su retícula, kind 'roll', a la misma diana con el radio ×MASTERY.roll.spread)
        if (!(g.mastery && air && g.touches === 2 && g.aim3.on && g.aim3.kind === 'spike')) return null;
        var rk = (p.ak ? p.ak.spread : 1) * BADGE.mira[bl(p, 'mira')] * MASTERY.roll.spread, re = edgeOf(g, g.aim3.x, g.aim3.y), rs = 1 + MASTERY.edge.spr * re;
        out.spread = spikeSpread(0.95) * rk * rs; out.spreadPoor = spikeSpread(0.3) * rk * rs; out.spreadNow = spikeSpread(qNow(g, p)) * rk * rs;
        out.x = g.aim3.x; out.y = g.aim3.y; out.kind = 'roll'; out.mode = mode; out.aimed = true; out.edge = re;
        return out;
      }
      if (air && g.swingShot === 'tip') {
        kind = 'tip';
        tx = -sd * (1.6 + (a ? clamp(-sd * a[0], -0.3, 1) : 0.3)); ty = clamp(a ? p.y + a[1] * 2.6 : -p.y, -3.8, 3.8);
        out.spread = 0.25 + 0.9 * 0.05; out.spreadPoor = 0.25 + 0.9 * 0.55;
      } else if (g.aim3.on && g.aim3.kind === 'spike' && (air || p.z > 0)) { // A1/A2: mira libre; el radio es la dispersión si golpeara AHORA
        tx = g.aim3.x; ty = g.aim3.y; kind = 'spike';
        var spk2 = p.ak ? p.ak.spread : 1;
        spk2 *= BADGE.mira[bl(p, 'mira')];
        if (g.mastery) { out.edge = edgeOf(g, tx, ty); spk2 *= 1 + MASTERY.edge.spr * out.edge; } // E1: al filo, más dispersión
        out.spread = spikeSpread(0.95) * spk2; out.spreadPoor = spikeSpread(0.3) * spk2;
        out.spreadNow = spikeSpread(qNow(g, p)) * spk2;
        out.x = tx; out.y = ty; out.kind = kind; out.mode = mode; out.aimed = true;
        return out;
      } else {
        var at = attackTarget(p, a, air ? 6 : 6.5, g.cs); tx = at[0]; ty = at[1];
        kind = air ? 'spike' : 'free';
        out.spread = air ? 0.25 + 1.5 * 0.05 : 0.35 + 1.4 * 0.05; out.spreadPoor = air ? 0.25 + 1.5 * 0.55 : 0.35 + 1.4 * 0.55;
      }
    } else return null;
    out.x = tx; out.y = ty; out.kind = kind; out.mode = mode; out.aimed = !!a;
    out.spreadNow = out.spread + (out.spreadPoor - out.spread) * 0.5;
    return out;
  }

  /** Calidad que tendría el golpe del humano si pulsara AHORA (o la del gesto en curso), como en processSwing/hit. */
  var _wq = {};
  function qNow(g, p) {
    var w = hitWindow(g, p, _wq), t0 = g.swingLive ? g.swingT0 : g.time;
    var te = t0 + C.WINDUP - (g.time + w.t);
    var q = timingQ(te) * (1 - 0.3 * clamp((w.d / C.REACH - 0.55) / 0.45, 0, 1));
    return clamp(q, 0, 1);
  }

  /** Calidad del saque del humano si pulsara AHORA (o la del gesto en curso), como en processSwing/doServe (sin distancia). */
  function qNowServe(g, p) {
    var w = hitWindow(g, p, _wq), t0 = g.swingLive ? g.swingT0 : g.time;
    var te = t0 + C.WINDUP - (g.time + w.t);
    if (p.ak) te /= p.ak.wSrv;
    if (p.badges) te /= sangreW(g, p);
    return timingQ(te);
  }

  /** Pista de la partida g (o del escenario 'beach'|'hall' si se pasa un texto, o la de 18×9 sin nada): {HL, HW, cs, beach}.
   *  Cámara, FX, arena y UI la leen para dibujar/encuadrar la pista de 16×8 de la playa. Devuelve un objeto cacheado (no modificar). */
  var _courtH = { HL: C.HL, HW: C.HW, cs: 1, beach: false }, _courtB = { HL: C.BEACH.HL, HW: C.BEACH.HW, cs: C.BEACH.HL / C.HL, beach: true };
  function court(g) { return (g && typeof g === 'object' ? g.beach : g === 'beach') ? _courtB : _courtH; }

  /** Objetivo útil para el HUD/aro: dónde jugará el balón el equipo humano. */
  /** 6v6: ¿vale ahora «¡Pídela!»? En el peloteo, con el humano atacante posible (delantero no líbero, VB.AI6.canAttack, o zaguero
   *  de pipe, canPipe) y antes de que su equipo coloque (el balón llega del rival o aún vamos por el 1r toque). Fuera de ahí la
   *  pulsación no hace nada. */
  function askOk(g) {
    var p = g.ctrl, A6 = VB.AI6;
    if (!(g.rot && p && g.mode === 'rally' && p.role !== 'L' && !p.bench)) return false;
    // colocador humano (17-nov-2026, Ferran: «que el colocador pueda pedir una colocación si el primer toque ha sido suyo»): solo
    // delantero, con el 1r toque suyo y antes de la colocación (la da el colocador de emergencia: VB.AI6.buildCand le acepta)
    if (p.role === 'S') return p.front && g.touchTeam === 0 && g.touches === 1 && g.lastPlayer === p && !atkPhase(g, 0);
    if (!(p.front || (A6 && A6.canPipe && A6.canPipe(p)))) return false;
    return !(g.touchTeam === 0 && g.touches >= 2) && !atkPhase(g, 0);
  }
  function focusPoint(g) {
    return atkPhase(g, g.online ? g.hT : 0) ? g.pr3 : g.pr1;
  }


  /* ---------- Banquillo y cambios (6v6; notes/titularidad-y-cambios.md §B e §I) ----------
   * Solo con createGame({format:'6v6', bench:[[B…],[B…]]}) (g.subsOn). Sin banquillo, el 6v6 y el 2v2 no cambian: ningún campo
   * nuevo de jugador, ningún gasto de g.rng (todo lo nuevo decide con hash01) y las mismas llamadas. Reglas FIVB 15.5-15.8:
   * 6 cambios por equipo y set; un titular sale y vuelve una vez y solo por quien le sustituyó; el suplente entra una vez y solo
   * sale por ese titular; el líbero no cuenta. Los cambios se aplican en balón muerto, antes del saque (applySubs): primero los
   * pedidos (requestSub, g.subQ) y luego los del entrenador CPU (VB.AI6.coachPlan). Entre sets, la alineación (g.lineup) puede
   * cambiar sin gastar cambios (VB.AI6.lineupPlan, evento 'lineup'). */
  var SUB_MAX = 6, SUB_HOLD = 1.8;
  /** Afinado del banquillo: efecto del cansancio en velocidad y salto, cansancio por punto en pista / salto / punto en el
   *  banquillo (recupera), umbral de descanso en la alineación del set, velocidad del paseo del que entra y zona de cambio
   *  (x desde la red, y = banda de la mesa). */
  var SUBK = VB.SUBK = { speed: 0.03, jump: 0.02, onPt: 0.006, jumpT: 0.003, rest: 0.02, restLineup: 0.75, walk: 3.4, zoneX: 2.0, zoneY: 5.3 };   // (zoneY: el lado de los banquillos, arena.js CREW_BENCH_Y > 0)
  var IQ_DIFF = { easy: 1, normal: 2, hard: 3, expert: 3 };
  var BENCH_ROLES = ['S', 'OPP', 'OH', 'MB'];
  function n2(o, k, v) { o[k] = 0.5; o[k] = v; }   // campo numérico que nace como double (dblFields)
  /** Configuración del entrenador de un equipo (contrato §I.1). */
  function coachOf(c, defIq) {
    c = c && typeof c === 'object' ? c : {};
    var iq = c.iq | 0; if (iq < 1 || iq > 3) iq = defIq;
    var o = { auto: c.auto !== false, iq: iq, me: null }, m = c.me;
    if (m && typeof m === 'object') o.me = { pullAt: +m.pullAt > 0 ? +m.pullAt : 99, enterLostSet: !!m.enterLostSet, enterBad: m.enterBad !== false,
      garbage: m.garbage !== false, backNextSet: !!m.backNextSet };
    return o;
  }
  /** createGame (6v6): nombres, banquillo (suplentes con id team·16 + 7 + i en g.roster) y estado de los cambios. */
  function subsInit(g, opts, diff) {
    var N = opts.names, t, i;
    if (N) for (t = 0; t < 2; t++) for (i = 0; i < 6; i++) { var nm = N[t] && N[t][i]; if (typeof nm === 'string' && nm) g.teams[t][i].name = nm.slice(0, 40); }
    var B = opts.bench && (Array.isArray(opts.bench[0]) || Array.isArray(opts.bench[1])) ? opts.bench : null;
    g.subsOn = !!B; g.ctrlOut = false; g.subWait = false;
    if (!B) return;
    n2(g, 'meR', 0); n2(g, 'rallyN', 0); g._meLast = false; g._subU = null;
    g.subs = [{ n: 0, pairs: [], dbl: false }, { n: 0, pairs: [], dbl: false }];
    n2(g.subs[0], 'n', 0); n2(g.subs[1], 'n', 0);
    g.subQ = [null, null]; g.subAtk = [null, null]; g.subWalkL = [];
    var co = opts.coach || [];
    g.coach = [coachOf(co[0], 2), coachOf(co[1], IQ_DIFF[diff] || 2)];
    for (t = 0; t < 2; t++) {
      var L = Array.isArray(B[t]) ? B[t] : [], k = 0;
      for (i = 0; i < L.length && k < 6; i++) {
        var b = L[i]; if (!b || BENCH_ROLES.indexOf(b.role) < 0) continue;
        var nb = b.num === (b.num | 0) && b.num >= 1 && b.num <= 99 ? b.num : 20 + t * 10 + k;
        var p = mk6Fields(mkPlayer(t, nb, 7 + k, 16)); p.role = b.role; p.bench = true; p.bi = i;
        p.name = typeof b.name === 'string' ? b.name.slice(0, 40) : '';
        if (b.st && typeof b.st === 'object' && !g.demo) attrOne(g, p, b.st);
        if (b.badges && typeof b.badges === 'object' && !g.demo) p.badges = badgeObj(b.badges);
        n2(p, 'fat0', clamp(+b.fat || 0, 0, 100) / 100);
        g.roster[t].push(p); k++;
      }
      for (i = 0; i < g.roster[t].length; i++) {
        var q = g.roster[t][i];
        if (typeof q.name !== 'string') q.name = '';
        n2(q, 'perf', 0); n2(q, 'tired', q.fat0 || 0); n2(q, 'onR', 0);
      }
    }
  }
  /** createGame (6v6): tu atleta. meSlot (0-5) = tu hueco en ROLES6; meBench = tu índice en bench[0] (empiezas en el banquillo:
   *  g.ctrlOut). Sin ninguno de los dos, el de hoy (el primero del puesto ctrlRole). */
  function subsCtrl(g, opts) {
    var ms = opts.meSlot, mb = opts.meBench, p = null;
    if (ms === (ms | 0) && ms >= 0 && ms < 6) p = g.teams[0][ms];
    else if (g.subsOn && mb === (mb | 0) && mb >= 0) {
      for (var i = 0; i < g.roster[0].length; i++) if (g.roster[0][i].bench && g.roster[0][i].bi === mb && g.roster[0][i].role !== 'L') p = g.roster[0][i];
      if (p) g.ctrlOut = true;
    }
    if (!p) return;
    g.ctrl = g.ctrlBase = p;
    if (CTRL_ROLES6.indexOf(p.role) >= 0) g.ctrlRole = p.role;
  }
  /** emit (solo con g.subsOn): rendimiento por toques (recepción perfecta o defensa +0,3), último rematador de cada equipo y
   *  cansancio por salto. */
  function subEv(g, e) {
    var p = e.player;
    if (e.type === 'hit') {
      if (e.kind === 'spike' && p) g.subAtk[p.team] = p;
      if (p && p.perf != null && (e.dig || (e.recv && e.grade === 'perfect'))) p.perf += 0.3;
    } else if (e.type === 'jump' && p && p.tired != null) p.tired = Math.min(1, p.tired + SUBK.jumpT);
  }
  /** point (solo con g.subsOn): puntos del partido, puntos con tu atleta en pista (también como líbero) y por jugador; cansancio. */
  function subCount(g) {
    g.rallyN++;
    var me = !g.ctrlOut && !!g.ctrl && g.players.indexOf(g.ctrl) >= 0;
    g._meLast = me; if (me) g.meR++;
    for (var t = 0; t < 2; t++) for (var i = 0; i < g.roster[t].length; i++) {
      var p = g.roster[t][i];
      if (p.bench) p.tired = Math.max(0, p.tired - SUBK.rest);
      else { p.onR++; p.tired = Math.min(1, p.tired + SUBK.onPt); }
    }
  }
  /** point con llamada que se puede pedir (g._snap): rendimiento, puntos en pista y cansancio de cada jugador antes del punto, para
   *  deshacerlos si el challenge lo anula (subRedo: el punto se vuelve a pitar y subCount / subPerf se cuentan otra vez). */
  function subUndo(g) {
    var v = [];
    for (var t = 0; t < 2; t++) for (var i = 0; i < g.roster[t].length; i++) { var p = g.roster[t][i]; v.push(p, p.perf, p.onR, p.tired); }
    return { set: g.setNo, v: v };
  }
  function subRedo(g, setNo0) {
    var u = g._subU; g._subU = null;
    if (!u || u.set !== setNo0) return;   // (si ya empezó otro set, subsNewSet puso el rendimiento a 0: no se toca)
    for (var i = 0; i < u.v.length; i += 4) { var p = u.v[i]; p.perf = u.v[i + 1]; p.onR = u.v[i + 2]; p.tired = u.v[i + 3]; }
  }
  /** point (solo con g.subsOn): rendimiento del set. +1 punto directo (ace, remate, bloqueo, dejada), −1 error o falta, −0,5 al
   *  que recibe el ace o al rematador bloqueado. */
  function subPerf(g, w, how, fp) {
    var lp = g.lastPlayer, l = 1 - w, a;
    if (how === 'ace') { // (ace sin tocar: el que tenía que recibir, g.jobs del equipo que recibe)
      if (g.server && g.server.team === w) g.server.perf += 1;
      a = lp && lp.team === l ? lp : g.jobs[l]; if (a && a.perf != null) a.perf -= 0.5;
    }
    else if (how === 'kill') { a = g.subAtk[w]; if (a) a.perf += 1; }
    else if (how === 'block') { if (lp && lp.team === w) lp.perf += 1; a = g.subAtk[l]; if (a) a.perf -= 0.5; }
    else if (how === 'tip' || how === 'free') { if (lp && lp.team === w) lp.perf += 1; }
    else { a = fp && fp.team === l ? fp : lp && lp.team === l ? lp : null; if (a && a.perf != null) a.perf -= 1; }
  }
  /** ¿Se puede cambiar out (en pista) por inn (del banquillo) en el equipo t? '' o el motivo: 'off' (sin banquillo), 'bench' (out no
   *  está en pista o inn no está en el banquillo), 'libero' (out está fuera por el líbero, o uno de los dos es el líbero), 'me' (tu
   *  jugador en el Partido rápido), 'max' (6 cambios), 'pair' (un suplente solo sale por su titular; un titular solo vuelve por su
   *  suplente), 'back' (ese titular ya volvió), 'used' (ese suplente ya entró y salió). coach = true: el entrenador CPU (sin 'me'). */
  function canSubX(g, t, out, inn, coach) {
    if (!g.subsOn) return 'off';
    if (!out || !inn || out.team !== t || inn.team !== t) return 'bench';
    if (out.role === 'L' || inn.role === 'L' || out === g.liberoFor[t]) return 'libero';
    if (g.rot[t].indexOf(out) < 0 || g.rot[t].indexOf(inn) >= 0 || g.roster[t].indexOf(inn) < 0) return 'bench';
    if (!coach && t === 0 && g.ctrlBase && (out === g.ctrlBase || inn === g.ctrlBase) && !g.demo) return 'me';
    var S = g.subs[t], P = S.pairs, i, q;
    if (S.n >= SUB_MAX) return 'max';
    for (i = 0; i < P.length; i++) {
      q = P[i];
      if (q.b === out && !q.back) return q.a === inn ? '' : 'pair';
      if (q.a === out && q.back) return 'back';
    }
    for (i = 0; i < P.length; i++) {
      q = P[i];
      if (q.a === inn) return 'pair';
      if (q.b === inn && q.back) return 'used';
    }
    // el humano solo cambia en el mismo puesto u OH↔OPP (la IA reparte todo por p.role); el entrenador CPU ya lo filtra
    if (!coach && !(out.role === inn.role || (out.role === 'OH' && inn.role === 'OPP') || (out.role === 'OPP' && inn.role === 'OH'))) return 'role';
    return '';
  }
  function canSub(g, t, out, inn) { return canSubX(g, t, out, inn, false); }
  /** Pide un cambio para el siguiente balón muerto ('' o el motivo de canSub). Sustituye al pedido anterior del equipo. */
  function requestSub(g, t, out, inn) {
    var r = canSubX(g, t, out, inn, false);
    if (!r) g.subQ[t] = { out: out, inn: inn };
    return r;
  }
  function cancelSub(g, t) { if (g.subsOn && g.subQ) g.subQ[t] = null; }
  function subsLeft(g, t) { return g.subsOn ? SUB_MAX - g.subs[t].n : 0; }
  /** Suplentes del equipo t que no están en pista (sin el líbero), en el orden del banquillo. */
  function benchOf(g, t) {
    var out = []; if (!g.subsOn) return out;
    for (var i = 0; i < g.roster[t].length; i++) { var p = g.roster[t][i]; if (p.role !== 'L' && g.rot[t].indexOf(p) < 0) out.push(p); }
    return out;
  }
  /** Estado de p en el set: 'starter' (en pista sin cambio), 'in' (suplente que entró), 'back' (titular que volvió), 'out'
   *  (titular cambiado, o suplente que ya entró y salió), 'bench' (sin jugar en el set). canOut / canIn: si puede salir / entrar. */
  function subInfo(g, t, p) {
    if (!g.subsOn || !p) return null;
    var on = g.rot[t].indexOf(p) >= 0, P = g.subs[t].pairs, st = on ? 'starter' : 'bench', used = false;
    for (var i = 0; i < P.length; i++) {
      var q = P[i];
      if (on) { if (q.b === p && !q.back) st = 'in'; else if (q.a === p && q.back) st = 'back'; }
      else if (q.a === p && !q.back) st = 'out';
      else if (q.b === p && q.back) { st = 'out'; used = true; }
    }
    var full = g.subs[t].n >= SUB_MAX;
    return { state: st, canOut: on && !full && st !== 'back' && p !== g.liberoFor[t] && p.role !== 'L', canIn: !on && !full && p.role !== 'L' && !used };
  }
  /** Banquillo neutro del Partido rápido: S, OPP, OH, MB, OH con 50 en todo, dorsales desde el 7 sin los de la pista ni el líbero. */
  var DEF_BENCH = ['S', 'OPP', 'OH', 'MB', 'OH'];
  function defaultBench(t) {
    var used = t === 1 ? [7, 8, 9, 10, 11, 12, 14] : [1, 2, 3, 4, 5, 6, 13], n = 7, out = [];
    for (var i = 0; i < DEF_BENCH.length; i++) {
      while (used.indexOf(n) >= 0) n++;
      var st = {}; for (var j = 0; j < ATTR_KEYS.length; j++) st[ATTR_KEYS[j]] = 50;
      out.push({ role: DEF_BENCH[i], st: st, num: n, name: '', fat: 0, badges: null }); n++;
    }
    return out;
  }
  /** Aplica el cambio out → inn del equipo t (ya validado): ocupa la zona en g.rot y el hueco en g.teams; el que entra sale de la
   *  zona de cambio y camina hasta el sitio del que sale (g.subWalkL, durante SUB_HOLD). Evento 'sub'. */
  function doSub(g, t, out, inn, why, src) {
    var z = g.rot[t].indexOf(out), ti = g.teams[t].indexOf(out), S = g.subs[t], P = S.pairs, pr = null;
    g.rot[t][z] = inn; if (ti >= 0) g.teams[t][ti] = inn;
    inn.bench = false; out.bench = true; out.zone = 0; out.front = false;
    var sd = side(t), tx = out.x, ty = out.y;
    inn.x = sd * SUBK.zoneX; inn.y = SUBK.zoneY; inn.z = 0; inn.vz = 0; inn.vx = inn.vy = 0; inn.down = 0; inn.anim = 0; inn.cool = 0;
    inn.jvx = inn.jvy = inn.lvx = inn.lvy = inn.rvx = inn.rvy = 0; inn.avx = inn.avy = inn.dj = inn.jF = inn.tkX = inn.tkY = inn.landT = 0; inn.onGround = true; inn.lastAction = ''; inn.actionT = 99;
    var dw = Math.hypot(tx - inn.x, ty - inn.y);
    g.subWalkL.push(dblFields({ p: inn, x: tx, y: ty, v: Math.max(SUBK.walk, dw / (SUB_HOLD - 0.3)) }));
    for (var i = 0; i < P.length; i++) if (P[i].b === out && !P[i].back) pr = P[i];
    if (pr) pr.back = true; else P.push({ a: out, b: inn, back: false, why: why, src: src || why });   // (src: regla del entrenador que lo decidió; p. ej. 'garbage' para tu entrada con el partido roto)
    S.n++;
    if (why === 'double') S.dbl = true;
    if (t === 0 && g.ctrlBase) {
      if (out === g.ctrlBase) { g.ctrlOut = true; g.ctrl = out; endSwing(g); }
      else if (inn === g.ctrlBase) { g.ctrlOut = false; g.ctrl = inn; endSwing(g); }
    }
    emit(g, { type: 'sub', team: t, inP: inn, outP: out, why: why, n: S.n, left: SUB_MAX - S.n, set: g.setNo, score: [g.score[0], g.score[1]],
      meIn: t === 0 && inn === g.ctrlBase, meOut: t === 0 && out === g.ctrlBase });
  }
  /** Balón muerto (antes de setupServe): cambios pedidos y del entrenador CPU. Devuelve true si hubo alguno. */
  function applySubs(g) {
    var any = false, A6 = VB.AI6;
    for (var t = 0; t < 2; t++) {
      var q = g.subQ[t], did = false;
      if (q) {
        g.subQ[t] = null;
        var why = canSubX(g, t, q.out, q.inn, false);
        if (!why) { doSub(g, t, q.out, q.inn, 'human'); did = true; }
        else emit(g, { type: 'subDenied', team: t, inP: q.inn, outP: q.out, why: why });
      }
      if (!did && g.coach[t].auto && A6 && A6.coachPlan) {
        var plan = A6.coachPlan(g, t);
        if (plan && plan.length === 1 && !canSubX(g, t, plan[0].out, plan[0].inn, true)) { doSub(g, t, plan[0].out, plan[0].inn, plan[0].why, plan[0].src); did = true; }
        else if (plan && plan.length === 2 && g.subs[t].n + 2 <= SUB_MAX && plan[0].out !== plan[1].out && plan[0].inn !== plan[1].inn &&
            !canSubX(g, t, plan[0].out, plan[0].inn, true) && !canSubX(g, t, plan[1].out, plan[1].inn, true)) {
          doSub(g, t, plan[0].out, plan[0].inn, plan[0].why); doSub(g, t, plan[1].out, plan[1].inn, plan[1].why); did = true;
        }
      }
      if (did) any = true;
    }
    if (any) refreshTeams(g);
    return any;
  }
  /** Paseo del que entra durante SUB_HOLD (balón muerto). */
  function subWalk(g, dt) {
    var L = g.subWalkL;
    for (var i = 0; i < L.length; i++) {
      var w = L[i], p = w.p, dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
      if (d < 0.03 || dt <= 0) { p.vx = p.vy = 0; continue; }
      var s = Math.min(d, w.v * dt); p.x += dx / d * s; p.y += dy / d * s; p.vx = dx / d * s / dt; p.vy = dy / d * s / dt;
    }
  }
  /** nextSet / newGame (solo con g.subsOn): alineación del set siguiente (VB.AI6.lineupPlan; sin gastar cambios; nada en un partido
   *  nuevo), el líbero fuera, pista = g.lineup, contadores y rendimiento a 0. Devuelve los cambios de alineación por equipo. */
  function subsNewSet(g, fresh) {
    var lu = [null, null], A6 = VB.AI6, hb = g.ctrlBase, wasOut = !!g.ctrlOut;
    for (var t = 0; t < 2; t++) {
      var L = g.lineup[t], ins = [], outs = [], i;
      var plan = !fresh && g.coach[t].auto && A6 && A6.lineupPlan ? A6.lineupPlan(g, t) : null;
      if (plan) for (i = 0; i < plan.length; i++) {
        var c = plan[i], k = L.indexOf(c.out);
        if (k < 0 || !c.inn || L.indexOf(c.inn) >= 0 || c.inn.role === 'L' || g.roster[t].indexOf(c.inn) < 0) continue;
        L[k] = c.inn; ins.push(c.inn); outs.push(c.out);
      }
      var lib = g.libero[t], cur = g.liberoFor[t], tm = g.teams[t];
      if (cur) { g.liberoFor[t] = null; emit(g, { type: 'libero', team: t, inP: cur, outP: lib, human: t === 0 && cur === hb }); }
      for (i = 0; i < g.roster[t].length; i++) g.roster[t][i].bench = true;
      tm.length = 0; for (i = 0; i < L.length; i++) { tm.push(L[i]); L[i].bench = false; }
      var S = g.subs[t]; S.n = 0; S.pairs.length = 0; S.dbl = false; g.subQ[t] = null;
      for (i = 0; i < g.roster[t].length; i++) g.roster[t][i].perf = 0;
      lu[t] = { ins: ins, outs: outs };
    }
    if (fresh) { g.meR = 0; g.rallyN = 0; for (var u = 0; u < 2; u++) for (var r = 0; r < g.roster[u].length; r++) { var q = g.roster[u][r]; q.onR = 0; q.tired = q.fat0 || 0; } }
    if (hb && hb.team === 0) {
      g.ctrlOut = g.lineup[0].indexOf(hb) < 0; g.ctrl = hb; endSwing(g);
      // entras o sales al empezar el set aunque la alineación no cambie (te sacaron y vuelves de inicio, o entraste y vuelves al
      // banquillo): el 'lineup' del equipo 0 lo dice igual (meIn / meOut), para que la Carrera y los avisos no se desincronicen
      var x0 = lu[0];
      x0.meIn = !g.ctrlOut && (wasOut || x0.ins.indexOf(hb) >= 0); x0.meOut = g.ctrlOut && (!wasOut || x0.outs.indexOf(hb) >= 0);
    }
    g.subWait = false; g.subWalkL.length = 0;
    refreshTeams(g);
    return lu;
  }
  /** Eventos 'lineup' (después de newSet, antes del primer serveReady). */
  function subsLineupEv(g, lu) {
    for (var t = 0; t < 2; t++) {
      var x = lu[t]; if (!x || (!x.ins.length && !x.meIn && !x.meOut)) continue;
      emit(g, { type: 'lineup', team: t, set: g.setNo, ins: x.ins.slice(), outs: x.outs.slice(), meIn: t === 0 && !!x.meIn, meOut: t === 0 && !!x.meOut });
    }
  }

  /* ---------- Repetición (S3-C1): copia de una partida en una partida sombra y huella del estado ----------
   * copyGame(dst, src) → dst: copia profunda del estado de src SOBRE dst, una partida creada antes con createGame y las mismas opts
   * (las «sombras» de VB.Replay). Sirve para todo lo que cuelga de g, en 2v2 y en 6v6, sin una lista de campos que se quede vieja:
   *  - Jugadores: los de src (g.players, g.roster con banquillo y líbero, g.libero) se emparejan con los de dst por p.id y se copian
   *    sobre los objetos de dst, así que TODA referencia a un jugador (players, teams, rot, lineup, roster, libero, liberoFor, ctrl,
   *    ctrlBase, server, jobs, jobMem, lastPlayer, blockBy, atkSet, ritual.player, subQ, subAtk, subWalkL, subs[t].pairs, _subU,
   *    atkServe.player, _digWho, lastPoint y cualquier campo nuevo) queda apuntando al jugador de dst con el mismo id.
   *  - El resto se copia por estructura, conservando los objetos de dst (no asigna en régimen). Dos campos de src que apuntan al mismo
   *    objeto apuntan al mismo objeto en dst (tabla de memoria CP_*). Un null/número de dst donde src tiene objeto crea uno nuevo (lo
   *    único que asigna); un campo de dst que src no tiene se pone a undefined (la sim no mira presencia de claves; sin delete, que
   *    pasaría el objeto a modo diccionario).
   *  - Constantes de módulo (perfiles DIFF.*, TIMING.*, objetos congelados) y los objetos que dst ya comparte con src: por referencia,
   *    nunca se escribe en ellos.
   *  - Excepciones: rng (se copia su estado con get/set), events (dst.events.length = 0), stats (se queda el de dst), replay (solo de
   *    dst) y opts (las de dst). Invalida las cachés de módulo (_jrG/_arG) si apuntaban a dst.
   *  No lee ni escribe nada fuera de dst, src y las tablas de memoria del módulo (que suelta al acabar). No gasta azar. */
  var CP_S = [], CP_D = [], CP_N = 0, CP_K = null;
  var CP_SKIP = { rng: 1, events: 1, stats: 1, replay: 1, opts: 1 };
  function cpConst(v) {
    if (!CP_K) { CP_K = []; var k; for (k in DIFF) if (DIFF[k] && typeof DIFF[k] === 'object') CP_K.push(DIFF[k]); for (k in TIMING) if (TIMING[k] && typeof TIMING[k] === 'object') CP_K.push(TIMING[k]); }
    for (var i = 0; i < CP_K.length; i++) if (CP_K[i] === v) return true;
    return Object.isFrozen(v);
  }
  function cpFind(s) { for (var i = 0; i < CP_N; i++) if (CP_S[i] === s) return CP_D[i]; return null; }
  function cpUsed(d) { for (var i = 0; i < CP_N; i++) if (CP_D[i] === d) return true; return false; }
  function cpAdd(s, d) { CP_S[CP_N] = s; CP_D[CP_N] = d; CP_N++; }
  function cpVal(dv, sv) {
    if (sv === null || typeof sv !== 'object') return sv;   // primitivos (y funciones, que no hay más que g.rng: por referencia)
    if (sv === dv || cpConst(sv)) return sv;
    var m = cpFind(sv); if (m) return m;
    var isA = Array.isArray(sv);
    if (dv === null || typeof dv !== 'object' || Array.isArray(dv) !== isA || cpUsed(dv) || cpConst(dv)) dv = isA ? [] : {};
    cpAdd(sv, dv);
    cpInto(dv, sv, null);
    return dv;
  }
  function cpInto(d, s, skip) {
    var k;
    if (Array.isArray(s)) {
      if (d.length !== s.length) d.length = s.length;
      for (var i = 0; i < s.length; i++) d[i] = cpVal(d[i], s[i]);
      return;
    }
    var ns = 0, nd = 0, v;
    for (k in s) {
      ns++;
      if (skip && skip[k] === 1) continue;
      v = s[k];
      d[k] = v !== null && typeof v === 'object' ? cpVal(d[k], v) : v;   // (primitivos sin leer d[k]: es el grueso del coste)
    }
    for (k in d) nd++;                       // tras la copia, d tiene todas las claves de s: solo sobran si hay más
    if (nd !== ns) for (k in d) if ((!skip || skip[k] !== 1) && d[k] !== undefined && !(k in s)) d[k] = undefined;
  }
  /** Jugadores de g (en pista, plantilla con banquillo y líberos) a la tabla de memoria, emparejados por id con los de dst. */
  function cpPairList(dst, L) {
    if (!L) return;
    for (var i = 0; i < L.length; i++) {
      var sp = L[i]; if (!sp || typeof sp !== 'object' || cpFind(sp)) continue;
      var dp = cpPlayerById(dst, sp.id); if (dp) cpAdd(sp, dp);
    }
  }
  function cpPlayerById(g, id) {
    var i, t, L = g.players;
    for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    if (g.roster) for (t = 0; t < 2; t++) { L = g.roster[t]; for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; }
    if (g.libero) for (t = 0; t < 2; t++) if (g.libero[t] && g.libero[t].id === id) return g.libero[t];
    return null;
  }
  function copyGame(dst, src) {
    if (!dst || !src || dst === src) return dst;
    CP_N = 0;
    cpPairList(dst, src.players);
    if (src.roster) { cpPairList(dst, src.roster[0]); cpPairList(dst, src.roster[1]); }
    cpPairList(dst, src.libero);
    var np = CP_N, i;
    for (i = 0; i < np; i++) cpInto(CP_D[i], CP_S[i], null);   // primero los jugadores, sobre sus objetos de dst
    cpInto(dst, src, CP_SKIP);
    if (dst.rng && dst.rng.set && src.rng && src.rng.get) dst.rng.set(src.rng.get());
    dst.events.length = 0;
    for (i = 0; i < CP_N; i++) { CP_S[i] = null; CP_D[i] = null; }   // suelta las referencias (sin encoger los arrays)
    CP_N = 0;
    if (_jrG === dst) _jrG = null;
    if (_arG === dst) _arG = null;
    return dst;
  }
  /** stateHash(g) → uint32: FNV-1a sobre (v·1e6)|0 del balón (x, y, z, vx, vy, vz), x/y/z de los jugadores en pista, marcador,
   *  sets, set en curso, modo, estado de g.rng y (g.time·120)|0. Puro y sin memoria nueva: la repetición lo compara en el punto. */
  var HASH_MODES = ['serve', 'rally', 'point', 'over'];
  function fnv(h, v) {
    v = v | 0;
    h = Math.imul(h ^ (v & 255), 16777619); h = Math.imul(h ^ ((v >>> 8) & 255), 16777619);
    h = Math.imul(h ^ ((v >>> 16) & 255), 16777619); return Math.imul(h ^ (v >>> 24), 16777619);
  }
  function fq(v) { return isFinite(v) ? (v * 1e6) | 0 : -1; }
  function stateHash(g) {
    var h = 2166136261 | 0, b = g.ball, i, P = g.players;
    h = fnv(h, fq(b.x)); h = fnv(h, fq(b.y)); h = fnv(h, fq(b.z)); h = fnv(h, fq(b.vx)); h = fnv(h, fq(b.vy)); h = fnv(h, fq(b.vz));
    for (i = 0; i < P.length; i++) { h = fnv(h, fq(P[i].x)); h = fnv(h, fq(P[i].y)); h = fnv(h, fq(P[i].z)); }
    h = fnv(h, g.score[0]); h = fnv(h, g.score[1]); h = fnv(h, g.sets[0]); h = fnv(h, g.sets[1]); h = fnv(h, g.setNo);
    var mi = HASH_MODES.indexOf(g.mode); h = fnv(h, mi < 0 ? 4 : mi);
    h = fnv(h, g.rng && g.rng.get ? g.rng.get() : 0);
    h = fnv(h, (g.time * 120) | 0);
    return h >>> 0;
  }

  /* ---------- ONLINE, fase 0: dos huecos humanos (uno por equipo) — notes/net.md ----------
   * createGame({online: true, humans: [h0, h1], even, venue, points (21 por defecto), bestOf (1 por defecto | 3), timeouts (false por defecto), seed, present, stats}) con h = {idx: 0|1 (jugador que lleva; por
   * defecto 0 = su n.º 1), aimSet (colocación dirigida, por defecto sí), attrs (atributos 1-99 de su jugador), badges (insignias)}.
   * Hueco s = equipo s (el anfitrión es el equipo 0). even = «Igualado»: sin atributos ni insignias. Siempre 2v2, control 'one'
   * (cada humano lleva a UN jugador y su compañero es la IA DIFF.mate), maestría, nivel 'normal' y timing común TIMING.online.
   * step(g, dt, [in0, in1]) con in = {move, hit, jump, jset, switchPlayer} + bits de partido:
   *   chal (flanco): challenge del equipo s;  tmo (flanco): pedir tiempo muerto (SOLO con opts.timeouts: true, desactivado por defecto
   *   porque Ferran no quiere pausas durante el juego; g.tmoPer = ONLINE.tmoPerSet por set; no se puede pedir en la pausa entre sets;
   *   entra cuando el balón está muerto y ya no queda ventana de challenge, dura ONLINE.tmoDur s y cualquiera lo reanuda desde
   *   ONLINE.tmoMin s con skip; si el set acaba con uno pedido, se anula: evento timeoutCancel);  skip (flanco): «Continuar» (la pausa del
   *   punto y la de entre sets, ONLINE.setPause s, solo se saltan cuando los DOS lo han pulsado; un hueco con la IA cuenta como sí);
   *   ai (nivel): el hueco pasa a la IA en ese paso y vuelve al humano en el siguiente balón muerto.
   * El estado del gesto de cada humano vive en g.hum[s] (SLOT_S y los objetos aim3/swingAim/aimIn); el del hueco ACTIVO (g.hT) está en
   * los campos de siempre de g (g.ctrl, g.hitBuf, g.aim3…), así todo el código del humano sirve sin cambios: useSlot(g, t) lo cambia.
   * Al acabar cada paso el activo es el 0 (g.ctrl = el jugador del anfitrión). Fuera del online nada de esto existe ni se lee. */
  var ONLINE = { setPause: 10, tmoDur: 30, tmoMin: 10, tmoPerSet: 1 };
  var SLOT_S = ['hitBuf', 'jsetQ', 'swingLive', 'swingShot', 'swingLock', 'swingHasAim', 'setWinOn', 'setCarry', 'setCarryK', 'setDirA',
    'lastGrade', 'swingT0', 'swingShot0', 'swingSwapT', 'defRole', 'aimOn', 'aimLen', 'swingLen', 'aimSet',
    'jdF', 'jdS', 'jdM', 'jdT', 'aimCarry', 'jsMv', 'jsAimD', 'jsetAim']; // (salto con impulso: búfer de dirección, arrastre de la diana, diana de colocación)
  function slotIdx(h) { return h && +h.idx === 1 ? 1 : 0; }
  function onlineOpts(o) {
    var n = {}, k, H = Array.isArray(o.humans) ? o.humans : [], even = !!o.even, t, A = null, B = null;
    for (k in o) n[k] = o[k];
    n.online = true; n.demo = false; n.autopilot = false; n.format = '2v2'; n.drill = null; n.bench = null; n.ctrl = 'one';
    n.difficulty = 'normal'; n.rookie = false; n.mastery = o.mastery !== false; n.ctrlIdx = slotIdx(H[0]);
    n.aimSet = !(H[0] && H[0].aimSet === false);
    n.jsetAim = !!(H[0] && H[0].jsetAim === true); // (colocación en salto con diana: por hueco, por defecto no)
    n.points = SET_POINTS.indexOf(+o.points) >= 0 ? +o.points : 21; // (a 21 por defecto; la playa siempre a 21)
    if (!even) for (t = 0; t < 2; t++) {
      var h = H[t], i = slotIdx(h);
      if (h && h.attrs && typeof h.attrs === 'object') { A = A || [[null, null], [null, null]]; A[t][i] = h.attrs; }
      if (h && h.badges && typeof h.badges === 'object') { B = B || [[null, null], [null, null]]; B[t][i] = h.badges; }
    }
    n.attrs = A; n.badges = B;
    return n;
  }
  function initOnline(g, opts) {
    var H = Array.isArray(opts.humans) ? opts.humans : [];
    g.online = true; g.prof = [DIFF.mate, DIFF.mate]; g.tm = TIMING.online; g.hT = 0;
    g.bo1 = +opts.bestOf !== 3; // 1 set (por defecto) o mejor de 3 (21-21-15)
    g.hum = [];
    for (var t = 0; t < 2; t++) {
      var s = { team: t, p: g.teams[t][slotIdx(H[t])], ai: false, aiBack: false,
        aim3: t ? dblFields({ on: false, x: 0.5, y: 0.5, kind: '' }) : g.aim3, swingAim: t ? [0, 0] : g.swingAim, aimIn: t ? [0, 0] : g.aimIn };
      for (var i = 0; i < SLOT_S.length; i++) s[SLOT_S[i]] = g[SLOT_S[i]];
      if (t) { s.aimSet = !(H[1] && H[1].aimSet === false); s.jsetAim = !!(H[1] && H[1].jsetAim === true); }
      g.hum.push(dblFields(s));
    }
    g.tmoPer = opts.timeouts === true ? ONLINE.tmoPerSet : 0; // tiempos muertos: desactivados por defecto (decisión 5: sin pausas en juego)
    g.skipReq = [false, false]; g.tmoReq = [false, false]; g.tmoLeft = [g.tmoPer, g.tmoPer]; g.tmo = null;
  }
  /** Hueco activo = t: guarda el gesto del activo en g.hum[g.hT] y carga el de t en los campos de g. */
  function act(g, t) {
    if (!g.online || g.hT === t) return;
    var a = g.hum[g.hT], b = g.hum[t], k;
    for (var i = 0; i < SLOT_S.length; i++) { k = SLOT_S[i]; a[k] = g[k]; g[k] = b[k]; }
    g.aim3 = b.aim3; g.swingAim = b.swingAim; g.aimIn = b.aimIn; g.ctrl = b.p; g.hT = t;
  }
  /** Fin del paso online: activo el hueco 0 y g.hum[0] al día (la foto no depende de quién leyó qué hueco entre pasos). */
  function fin(g) { act(g, 0); var h = g.hum[0]; for (var i = 0; i < SLOT_S.length; i++) h[SLOT_S[i]] = g[SLOT_S[i]]; }
  function hget(g, t, k) { return t === g.hT ? g[k] : g.hum[t][k]; }
  function hset(g, t, k, v) { if (t === g.hT) g[k] = v; else g.hum[t][k] = v; }
  /** ¿El equipo t tiene ahora un humano (hueco no traspasado a la IA)? Solo online. */
  function humOn(g, t) { return !!g.online && !g.hum[t].ai; }
  /** Hueco (0/1) del humano que lleva a p, o -1 (IA). Solo online. */
  function humSlot(g, p) { var h = g.hum; return h[0].p === p && !h[0].ai ? 0 : h[1].p === p && !h[1].ai ? 1 : -1; }
  function endSwingAll(g) {
    for (var s = 0; s < 2; s++) {
      if (s === g.hT) endSwing(g);
      else { var h = g.hum[s]; h.hitBuf = 0; h.swingLive = false; h.swingShot = ''; h.swingHasAim = false; }
    }
  }
  function endSwingX(g) { if (g.online) endSwingAll(g); else endSwing(g); }
  function aimOff(g) { g.hum[0].aim3.on = false; g.hum[1].aim3.on = false; }
  /** setupServe online: gesto, bloqueo del gesto y rol defensivo de los dos huecos a cero; «Continuar» también. */
  function resetSlots(g) {
    var prev = g.hT;
    for (var s = 0; s < 2; s++) { act(g, s); endSwing(g); g.swingLock = 0; g.defRole = ''; g.aimCarry = 0; }
    act(g, prev);
    g.skipReq[0] = g.skipReq[1] = false;
  }
  /** Lectura de la IA (ai.js, bloqueo ante la colocación en salto): el humano del equipo t si puede colocar en salto ahora (o null); su
   *  gesto queda en _jh {live, shot}. Fuera del online, lo de siempre (solo el equipo 0). */
  var _jh = { live: false, shot: '' };
  function jsetHum(g, t) {
    if (!g.online) { _jh.live = g.swingLive; _jh.shot = g.swingShot; return t === 0 && jsetReady(g) ? g.ctrl : null; }
    if (g.hum[t].ai) return null;
    var prev = g.hT; act(g, t);
    var r = jsetReady(g) ? g.ctrl : null; _jh.live = g.swingLive; _jh.shot = g.swingShot;
    act(g, prev);
    return r;
  }
  /** Traspaso del hueco s a la IA (on) o de vuelta al humano. Con el balón en la mano del sacador que cambia de manos, el saque se
   *  prepara otra vez (como setCtrlRole): ritual y hora de lanzamiento si pasa a la IA, diana si vuelve al humano. */
  function slotAI(g, s, on) {
    var h = g.hum[s], prev = g.hT, sv = g.server;
    if (!g.online || h.ai === !!on) return;
    var wasH = g.mode === 'serve' && sv ? isHuman(g, sv) : false;
    act(g, s); endSwing(g); g.defRole = ''; g.jsetQ = 0; g.setWinOn = false; g.setCarry = -1; g.setDirA = NaN; act(g, prev);
    h.ai = !!on; h.aiBack = false;
    emit(g, { type: 'slotAI', team: s, on: !!on });
    if (g.mode === 'serve' && g.serveState === 'ready' && sv && isHuman(g, sv) !== wasH) {
      var ti = ritualSetup(g, sv, !isHuman(g, sv));
      g.timer = ti > 0 ? ti : 1.3; g.cpuTossIn = ti;
      serveAimReset(g, sv); holdPos(g, sv, g.ball);
    }
  }
  function skipBoth(g) { return (g.skipReq[0] || g.hum[0].ai) && (g.skipReq[1] || g.hum[1].ai); }
  /** Bits de partido de las dos entradas (al principio del paso, hueco 0 y luego 1). */
  function netBits(g, ins) {
    for (var s = 0; s < 2; s++) {
      var inp = ins[s], h = g.hum[s];
      if (inp.ai && !h.ai) slotAI(g, s, true);
      h.aiBack = !inp.ai && h.ai;
      if (h.aiBack && (g.mode === 'point' || g.mode === 'over') && !g.review && !g.tmo) slotAI(g, s, false);
      if (inp.chal && !g.tmo) challenge(g, s);
      if (inp.tmo && !g.tmoReq[s] && !g.tmo && g.tmoLeft[s] > 0 && g.mode !== 'over' && !g.pendingSet && !g.finished) { g.tmoReq[s] = true; emit(g, { type: 'timeoutReq', team: s }); }
      if (inp.skip && !g.skipReq[s]) { g.skipReq[s] = true; emit(g, { type: 'skipReq', team: s }); }
    }
  }
  /** ¿Empieza ya el tiempo muerto pedido? Con el balón muerto, nunca en la pausa entre sets y solo cuando ya no queda ventana de
   *  challenge para nadie (ni challenge de la IA pendiente): así el tiempo muerto de uno nunca le quita el challenge al otro. */
  function tmoReady(g) {
    return (g.tmoReq[0] || g.tmoReq[1]) && !g.finished && !g.pendingSet && !g.cpuChal &&
      (g.mode === 'point' || (g.mode === 'serve' && g.serveState === 'ready')) && !(canChallenge(g, 0) > 0) && !(canChallenge(g, 1) > 0);
  }
  function startTmo(g) {
    var t = g.tmoReq[0] ? 0 : 1;
    g.tmoReq[t] = false; g.tmoLeft[t]--; g.skipReq[0] = g.skipReq[1] = false;
    g.tmo = dblFields({ team: t, t: 0, dur: ONLINE.tmoDur });
    if (g.mode === 'serve') { endRitual(g); resetSlots(g); }
    emit(g, { type: 'timeout', team: t, dur: ONLINE.tmoDur, left: [g.tmoLeft[0], g.tmoLeft[1]] });
  }
  function tmoStep(g, dt) {
    var m = g.tmo, i;
    m.t += dt;
    for (i = 0; i < g.players.length; i++) stepPlayer(g, g.players[i], dt, 0, 0);
    if (g.mode === 'point' || g.mode === 'over') stepBall(g, dt);
    if (m.t >= m.dur || (m.t >= ONLINE.tmoMin && (g.skipReq[0] || g.skipReq[1]))) {
      g.tmo = null; g.skipReq[0] = g.skipReq[1] = false;
      if (g.mode === 'serve') setupServe(g);          // se vuelve a autorizar el saque desde el principio
      else if (g.timer < 1) g.timer = 1;              // un respiro antes del saque
      emit(g, { type: 'timeoutEnd', team: m.team });
    }
  }
  var _inS = [null, null], _mxS = [0, 0], _myS = [0, 0], _mlS = [0, 0], _aimS = [[0, 0], [0, 0]], _aimOk = [false, false];
  /** step() del online (ver arriba). Mismo orden que el de siempre: bits, revisión, tiempo muerto, punto, saque y peloteo; en el peloteo
   *  los dos humanos (hueco 0 y luego 1) y después la IA, cada uno con su hueco activo. */
  function stepOnline(g, dt, inputs) {
    var AI = VB.AI, H = g.hum, s, i, p, inp;
    g.time += dt; g.blockCD -= dt;
    for (s = 0; s < 2; s++) {
      inp = (inputs && inputs[s]) || NOIN; _inS[s] = inp;
      act(g, s);
      g.hitBuf -= dt; g.swingLock -= dt; g.jsetQ -= dt;
      var mv = inp.move || NOIN.move, ml = dirLen(mv), mx = mv[0], my = mv[1];
      if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
      _mxS[s] = mx; _myS[s] = my; _mlS[s] = ml; _aimOk[s] = ml > 0.2;
      if (_aimOk[s]) { _aimS[s][0] = mx / ml; _aimS[s][1] = my / ml; }
      g.aimOn = _aimOk[s]; if (_aimOk[s]) { g.aimIn[0] = _aimS[s][0]; g.aimIn[1] = _aimS[s][1]; }
      if (g.mastery) g.aimLen = ml;
    }
    act(g, 0);
    netBits(g, _inS);
    if (g.review) {
      g.review.t += dt;
      for (i = 0; i < g.players.length; i++) stepPlayer(g, g.players[i], dt, 0, 0);
      if (g.mode === 'point' || g.mode === 'over') stepBall(g, dt);
      if (g.review.t >= g.review.dur) endReview(g);
      fin(g); return;
    }
    if (g.tmo) { tmoStep(g, dt); fin(g); return; }
    if (tmoReady(g)) { startTmo(g); fin(g); return; }
    if (g.cpuChal && g.time >= g.cpuChal.at) { var cc = g.cpuChal; g.cpuChal = null; if (challenge(g, cc.team)) { fin(g); return; } }

    if (g.mode === 'point' || g.mode === 'over') {
      if (skipBoth(g)) skipHold(g);
      for (i = 0; i < g.players.length; i++) stepPlayer(g, g.players[i], dt, 0, 0);
      stepBall(g, dt);
      g.timer -= dt;
      if (g.timer <= 0) {
        if (g.mode === 'over') {
          if (!(g.call && g.call.waived) && (canChallenge(g, 0) > 0 || canChallenge(g, 1) > 0 || g.cpuChal)) g.timer = 0;
          else if (!g.finished) { g.finished = true; emit(g, { type: 'gameOver', team: g.sets[0] > g.sets[1] ? 0 : 1, sets: [g.sets[0], g.sets[1]], setScores: g.setScores.slice() }); }
        } else {
          if (g.pendingSet) nextSet(g);
          setupServe(g);
        }
      }
      fin(g); return;
    }
    if (g.mode === 'serve') {
      var ts = g.server.team, ai0 = _aimOk[ts] ? _aimS[ts] : null;
      act(g, ts);
      stepServe(g, dt, _inS[ts], _mxS[ts], _myS[ts], ai0, !H[ts].ai); if (g.mode !== 'serve') endRitual(g); refreshPred(g);
      fin(g); return;
    }
    // ---- Peloteo ----
    g.rally.t += dt;
    act(g, 0); g.jobs[0] = AI.computeJob(g, 0);
    act(g, 1); g.jobs[1] = AI.computeJob(g, 1);
    for (s = 0; s < 2; s++) {
      act(g, s);
      if (H[s].ai) { g.defRole = ''; continue; }
      if (g.mode !== 'rally') continue;
      updateDefense(g);
      humanStep(g, dt, _inS[s], _mxS[s], _myS[s], _aimOk[s] ? _aimS[s] : null, _mlS[s]);
    }
    for (i = 0; i < g.players.length; i++) {
      p = g.players[i]; if (g.mode !== 'rally' || humSlot(g, p) >= 0) continue;
      act(g, p.team); AI.update(g, p, dt);
    }
    for (i = 0; i < 2 && g.mode === 'rally'; i++) stepBall(g, dt / 2);
    refreshPred(g);
    fin(g);
  }
  /* ==== FLUIDA (Online V2) ==== */
  /* Online V2 «Fluida» (notes/online-v2-spec.md §2). Todo lo de este bloque solo corre con g.fl, que crea flInit (nunca createGame ni
   * mkPlayer): sin g.fl la sim, la huella 2v2 y el online Precisa no cambian (tools/fluidsimtest.js lo comprueba).
   *
   * API para la sesión (js/netfluid.js), en VB.Sim. Coordenadas CANÓNICAS (equipo 0 = anfitrión en x > 0); dh = medio paso (1/240 s);
   * hs = índice absoluto de medio paso = 2·T + h (T = tic compartido, h ∈ {0, 1}); el balón del peloteo va en 2 medios pasos por tic.
   *   flInit(g, me) → g.fl                 crea el estado Fluida (me = equipo local: 0 anfitrión, 1 invitado). Campos (todo datos planos):
   *       me, loc[2] (equipo simulado aquí), own (dueño del balón y del peloteo), T (tic; lo escribe la sesión antes de cada step),
   *       r (rally: +1 en cada punto aplicado), seq/par (cadena de contactos del rally), kh (medios pasos de vuelo tras el contacto
   *       hasta el traspaso, -1 = no hay), khAt (hs absoluto del traspaso = hs del contacto + 1 + kh; -1 = ninguno), bAge (edad del
   *       balón desde el último contacto, s), app (aplicando un punto ajeno), catch (recuperando el pasado: nadie toca), peer (ya
   *       llegó el sr del rival en este rally), fq[] (peticiones de falta para el dueño: {r, reason:'net', pid, T}), pts[] (puntos
   *       producidos aquí: {r, w, reason, text, pid, sig, T, m}; m = metadatos del peloteo en el punto), dh, hs (último medio paso
   *       integrado; 2T-1 en la fase de jugadores), cT/cH (tic y h del último contacto; cH -1 = en la fase de jugadores), cFull (el
   *       último contacto fue el saque: su primer vuelo es un paso entero, como en stepServe), lf/lfPar (hs y par del primer toque
   *       local desde el último tc aplicado; lf -1 = ninguno: bifurcaciones), dirty ('' o el tipo del último contacto: la sesión
   *       manda el tc con g.fl.tc y lo borra), tc (flBundle tomado EN el contacto), sr (setupServe hecho: la sesión manda sr y lo
   *       borra), srvR (rally del último setupServe), wait (s esperando el sr del rival con el saque suyo), frozen (balón fantasma
   *       en el suelo), hand (traspasos), forks (bifurcaciones perdidas), late (recuperaciones de más de FL.CATCH_MAX medios pasos),
   *       guard (veces que saltó la guarda de point(): debe ser 0), fqK (ids con fq ya pedida en este rally).
   *   flTake(g)                            en solitario (rival perdido / contra la IA): loc = [true, true], el hueco rival a la IA,
   *       own = me; con el balón fantasma ya en el suelo, se vuelve a sacar sin punto. step() pasa a stepOnline (autoridad total).
   *       Ojo: en solitario la entrada del hueco rival debe llevar ai: true (si no, netBits le devuelve el hueco al humano).
   *   flFly(ball, age, nHalf, dt, out) → out   vuelo puro (sin reglas) de nHalf medios pasos de dt desde ball con edad age; out
   *       recibe x, y, z, vx, vy, vz, spin, speed, dip, wobA, wobF, wobP y age (para en el suelo, como el fantasma). Bit a bit igual
   *       que el vuelo de stepBall con g.fl.
   *   flOwnerCheck(b, own, canMore) → equipo   comprobación pura de la zona de traspaso: 1-own si el balón va hacia el otro equipo
   *       y |x| <= L (L = canMore ? clamp(0,12·|vx|, 0,25, 0,6) : 0,6), si no own (sin own: el equipo del que se aleja el balón).
   *   flBundle(g) → {r, s, par, T, h, kind, kh, khAt, own, full, b:[x,y,z,vx,vy,vz,spin,speed,dip,wobA,wobF,wobP], hd (id del que
   *       lo tiene en la mano o -1), bAge, mode, sv? (en el saque: serveState, serveJump, serveT, tossT, jumpAt, serveAuth, serveNo,
   *       whistleAt), m (metadatos del peloteo, ver flMeta; tiempos como EDADES: ltAge, feintAge, lastLand.age)}. El de cada
   *       contacto queda en g.fl.tc (el estado de después del paso ya no es el del contacto).
   *   flApplyTc(g, m, nowT, rewind) → 'ok' | 'fork' (aplicado: gana el contacto rival, anterior al mío) | 'lose' (rechazado: mi
   *       toque es anterior) | 'dup' | 'old' (m.r < r) | 'future' (m.r > r: la sesión lo guarda) | 'over' | 'bad'. Escribe balón y
   *       metadatos, own/khAt/seq y recupera desde el medio paso 2·m.T + m.h + 1 hasta el actual (2·nowT + 1; nowT por defecto
   *       g.fl.T) con flCatchUp. rewind(j, g), opcional: escribe la pose PASADA de mis jugadores en el tic floor(j/2) (anillo de la
   *       sesión); la sim guarda y restaura la presente (x, y, z, vx, vy, vz, onGround, pressEnd).
   *   flCatchUp(g, fromHs, nowT, rewind, full, cT) → medios pasos con reglas (o -n si pasaba de FL.CATCH_MAX y voló sin reglas:
   *       g.fl.late++). Por cada j: flHand; con el balón mío stepBall con g.fl.catch (bloqueo y cuerpo se juzgan, nadie toca), si no
   *       el fantasma; g.time = floor(j/2)·dt mientras dura. full: el primer vuelo es un paso entero (saque). cT: tic al que
   *       corresponden blockCD y rally.t del estado (por defecto el de fromHs).
   *   flApplyPt(g, m) → true (marcador igual a m.d) | false (distinto: la sesión lo cuenta y repara) | null (m.r ≠ r: guardarlo).
   *       m = {r, w, reason, text, pid, sig, m, d, cl}. Llama a point() con g.fl.app (mismos eventos, sin azar); cl = la llamada de
   *       línea del dueño (flCall de su g.call, con su error arbitral): queda en g.call igual que allí.
   *   flChallenge(g, team, r, force) → bool   challenge de team sobre la llamada del rally r (g.call.r = g.fl.r del punto). Lo acepta
   *       la máquina rival (sin force: ventana normal) y, con su «sí», lo aplica el que lo pidió (force: sin mirar la ventana). La
   *       revisión corre en las dos; si anula el punto, stepFluid lo vuelve a pitar con g.fl.app en las dos (r sube otra vez).
   *   flServe(g, force) → bool             setupServe (y nextSet si toca) con el punto ya en 'point' y su reloj a 0 (o force); una
   *       sola vez por rally.
   *   flSkip(g, t)                         «Continuar» del equipo t (skipReq y su evento).
   *   flPose(g, team, poses)               pose de los jugadores RIVALES (poses[i] = g.teams[team][i]): x, y, z, vx, vy, vz, jvx, jvy,
   *       anim, lastAction, actionT, shot, grade, onGround, down, pressEnd, cool (los que vengan) y, en el del humano, swingLive y
   *       swingShot en g.hum[team]. Lanza un error si el equipo se simula aquí.
   *   flDigest(g) → [r, score0, score1, sets0, sets1, setNo, serving, serverIdx0, serverIdx1, pendingSet ? 1 : 0]
   *   flMatch(g) → bloque del marcador; flMatch(g, blk) lo escribe (score, sets, setNo, setScores, serving, serverIdx, server (id),
   *       pendingSet, finished, setPoint, matchPoint, streakTeam/N, courtSwap3/At, r, challenges). Nunca toca jugadores.
   *   FL: constantes (zona, búsqueda de kh, tope de recuperación); mine(g, p). Internos para las pruebas: _flKh, _flGhost, _flHand,
   *   _flContact, _stepFluid, _stepBall. */
  var FL = { ZMIN: 0.25, ZMAX: 0.6, ZK: 0.12, KH_MAX: 960, CATCH_MAX: 72 };
  var NOIN_AI = { move: [0, 0], hit: false, jump: false, switchPlayer: false, ai: true };
  /** ¿Se simula aquí el jugador p? (sin g.fl, siempre) */
  function mine(g, p) { return !g.fl || g.fl.loc[p.team]; }
  /** ¿Le está vedado a p tocar el balón? (con los dos equipos aquí, en solitario, nunca; useCatch: también durante la recuperación) */
  function flNo(g, p, useCatch) {
    var F = g.fl;
    if (useCatch && F.catch) return true;
    if (F.loc[0] && F.loc[1]) return false;
    return F.own !== p.team || !F.loc[p.team];
  }
  function flInit(g, me) {
    me = me === 1 ? 1 : 0;
    g.fl = { me: me, loc: [me === 0, me === 1], own: g.server ? g.server.team : 0,
      T: 0, r: 0, seq: 0, par: 0, kh: -1, khAt: -1, bAge: 0,
      app: false, catch: false, peer: false, fq: [], pts: [],
      dh: 1 / 240, hs: -1, cT: 0, cH: -1, cFull: false, lf: -1, lfPar: 0, dirty: '', tc: null, sr: true, srvR: 0, wait: 0,
      frozen: false, gv: [0, 0, 0], hand: 0, forks: 0, late: 0, guard: 0, fqK: [] };
    return g.fl;
  }
  function flBy(g, id) { return id >= 0 ? cpPlayerById(g, id) : null; }
  function flId(p) { return p ? p.id : -1; }
  /** Equipo que sacará tras el punto en curso (point() ya cambió g.serving; nextSet lo recalcula al empezar set). */
  function flNextServer(g) { return g.pendingSet ? g.setNo % 2 : g.serving; }
  /** Vuelo de un medio paso: copia literal de la integración del peloteo de stepBall (con la edad del balón para el baile). */
  function flStep(b, age, dt) {
    var G = gEff(b);
    if (b.wobA) {
      var ph = b.wobF * age;
      b.vy += b.wobA * b.wobP * Math.cos(ph) * dt; b.vx += b.wobA * 0.25 * Math.sin(ph * 1.7) * dt;
    }
    b.vz -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += dt * (b.wobA ? 0.5 : 9 + b.dip);
  }
  /** Balón fantasma (dueño remoto): vuelo puro, sin reglas ni eventos; en el suelo se queda quieto hasta el tc/pt del dueño.
   *  F.gv guarda la velocidad de después del bote (la respuesta del suelo de stepBall: vz·0,45, vx/vy·0,5) para que, al llegar el pt,
   *  el balón muerto bote y ruede como en la máquina del dueño (y offline) en vez de quedarse clavado donde cayó. */
  function flGhost(g, dt) {
    var F = g.fl, b = g.ball;
    if (F.frozen) return;
    flStep(b, F.bAge, dt); F.bAge += dt;
    if (b.z <= C.BR) {
      if (!F.gv) F.gv = [0, 0, 0];
      F.gv[0] = b.vx * 0.5; F.gv[1] = b.vy * 0.5; F.gv[2] = Math.abs(b.vz) * 0.45;
      b.z = C.BR; b.vx = b.vy = b.vz = 0; b.dip = 0; b.wobA = 0; F.frozen = true;
    }
  }
  var FL_BK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'spin', 'speed', 'dip', 'wobA', 'wobF', 'wobP'];
  function flFly(ball, age, nHalf, dt, out) {
    out = out || {};
    if (out !== ball) for (var i = 0; i < FL_BK.length; i++) out[FL_BK[i]] = ball[FL_BK[i]] || 0;
    for (var k = 0; k < nHalf; k++) {
      if (out.z <= C.BR && !out.vx && !out.vy && !out.vz) break;
      flStep(out, age, dt); age += dt;
      if (out.z <= C.BR) { out.z = C.BR; out.vx = out.vy = out.vz = 0; break; }
    }
    out.age = age;
    return out;
  }
  function flZoneL(vx, canMore) { return canMore ? clamp(FL.ZK * Math.abs(vx), FL.ZMIN, FL.ZMAX) : FL.ZMAX; }
  function flInZone(b, so, canMore) { return (b.vx > 0 ? 1 : b.vx < 0 ? -1 : 0) === so && Math.abs(b.x) <= flZoneL(b.vx, canMore); }
  function flOwnerCheck(b, own, canMore) {
    if (own !== 0 && own !== 1) own = b.vx > 0 ? 1 : 0;
    if (canMore === undefined) canMore = true;
    return flInZone(b, side(1 - own), canMore) ? 1 - own : own;
  }
  /** kh del contacto recién hecho: medios pasos de vuelo hasta que el balón entra en la zona de traspaso del otro equipo (0 = ya está),
   *  o -1 si cae antes (el dueño lo pita) o no llega en FL.KH_MAX. El saque vuela su primer paso entero (stepServe). */
  var _flKb = {};
  function flKh(g) {
    var F = g.fl, own = F.own, so = side(1 - own), canMore = !(g.touchTeam === own && g.touches >= 3);
    var s = flFly(g.ball, 0, 0, 0, _flKb), age = F.bAge, dh = F.dh, k = 0;
    if (flInZone(s, so, canMore)) return 0;
    if (F.cFull) {
      flStep(s, age, 2 * dh); age += 2 * dh; k = 2;
      if (s.z <= C.BR) return -1;
      if (flInZone(s, so, canMore)) return k;
    }
    // atajo (mismo resultado, sin volar): sin baile (wobA 0) vx y la gravedad no cambian. Si el balón se aleja del otro equipo nunca
    // entra en su zona; si ya la pasó, tampoco; y si cae (cota por arriba, con margen) antes de poder llegar a ella (cota por abajo,
    // con margen), -1. El vuelo de abajo daría -1 tras hasta 960 medios pasos (el 60 % de los contactos propios).
    if (!s.wobA) {
      var dir = s.vx > 0 ? 1 : s.vx < 0 ? -1 : 0;
      if (dir !== so) return -1;
      var u0 = s.x * so, Lm = FL.ZMAX + 0.01;
      if (u0 > Lm) return -1;
      var Ge = gEff(s);
      if (Ge > 0) {
        var kz = u0 < -Lm ? (-Lm - u0) / (Math.abs(s.vx) * dh) : 0;
        var A = Ge * dh * dh / 2, B = dh * s.vz - A, c0 = s.z - (C.BR - 0.005);
        var kl = c0 <= 0 ? 0 : (B + Math.sqrt(B * B + 4 * A * c0)) / (2 * A);
        if (Math.ceil(kl) + 3 < kz - 3) return -1;
      }
    }
    while (k < FL.KH_MAX) {
      flStep(s, age, dh); age += dh; k++;
      if (s.z <= C.BR) return -1;
      if (flInZone(s, so, canMore)) return k;
    }
    return -1;
  }
  /** Cambio de dueño en el medio paso hs (igual en las dos máquinas: khAt viaja en el tc). */
  function flHand(g, hs) {
    var F = g.fl;
    if (F.khAt >= 0 && hs >= F.khAt) { F.own = 1 - F.own; F.khAt = -1; F.hand++; }
  }
  /** Contacto (toque, saque, bloqueo, red/cinta, cuerpo) hecho aquí por el dueño: cadena, edad, kh/khAt y el tc para la sesión. */
  function flContact(g, kind) {
    var F = g.fl;
    F.par = F.seq; F.seq++;
    if (kind !== 'net' && kind !== 'tape') F.bAge = 0;
    F.cT = F.T; F.cH = F.hs - 2 * F.T; F.cFull = kind === 'serve';
    if (F.lf < 0) { F.lf = F.hs; F.lfPar = F.par; }
    if (F.loc[0] && F.loc[1]) { F.kh = -1; F.khAt = -1; F.dirty = ''; return; } // en solitario no hay traspasos
    F.kh = flKh(g);
    F.khAt = F.kh < 0 ? -1 : F.hs + 1 + F.kh;
    F.dirty = kind;
    F.tc = flBundle(g);
  }
  /** Falta de red de un jugador mío con el balón del rival: petición al dueño (una por jugador y rally). */
  function flFq(g, p) {
    var F = g.fl;
    if (F.fqK.indexOf(p.id) >= 0) return;
    F.fqK.push(p.id);
    F.fq.push({ r: F.r, reason: 'net', pid: p.id, T: F.T });
  }
  /** Metadatos del peloteo en datos planos (jugadores por id; tiempos como edades respecto a g.time). */
  function flMeta(g) {
    var a = g.atkServe, rc = g._rc, ll = g.lastLand, ls = g.lastShot, ah = g.antennaHit, lp = g.lastPlayer;
    return {
      touchTeam: g.touchTeam, touches: g.touches, lp: flId(lp), lpGrade: lp ? lp.grade : '', lastTeam: g.lastTeam,
      lastKind: g.lastKind, lastShot: ls && typeof ls === 'object' ? JSON.parse(JSON.stringify(ls)) : ls, lastQ: g.lastQ,
      ltAge: g.time - g.lastTouchT, prevKind: g.prevKind, netSince: g.netSince, bb: flId(g.blockBy), blockCD: g.blockCD,
      atkServe: a ? { team: a.team, reason: a.reason, text: a.text, pid: flId(a.player) } : null,
      antennaHit: ah ? { x: ah.x, y: ah.y, z: ah.z } : null, digOk: g.digOk, digMargin: g.digMargin, dw: flId(g._digWho),
      hardIn: g.hardIn, digTight: g.digTight, recvRisk: g.recvRisk, digK: g.digK, feintFool: g.feintFool ? 1 : 0, // (feintFool 0/1: un byte en vez de «false»)
      rc: rc ? { pace: rc.pace, wob: rc.wob, run: rc.run, move: rc.move, line: rc.line, ft: rc.ft, who: flId(rc.who) } : null,
      blockOff: [g.blockOff[0], g.blockOff[1]], atkTeam: g.atkTeam, atkHow: g.atkHow, atkHits: g.atkHits, atkHuman: g.atkHuman,
      atkGrade: g.atkGrade, as: flId(g.atkSet), atkMove: g.atkMove, atkEdge: g.atkEdge, feintAge: g.time - g.feintT,
      lastTempo: g.lastTempo, chain: g.chain, chainH: g.chainH, rally: { t: g.rally.t, hits: g.rally.hits, digs: g.rally.digs },
      lastLand: ll ? { x: ll.x, y: ll.y, inside: ll.inside, age: g.time - ll.t } : null
    };
  }
  /** Escribe los metadatos (tNow = g.time de referencia de las edades). La nota del último toque solo en un jugador remoto. */
  function flSetMeta(g, mm, tNow) {
    if (!mm) return;
    var a = mm.atkServe, rc = mm.rc, ll = mm.lastLand, ah = mm.antennaHit, lp = flBy(g, mm.lp);
    g.touchTeam = mm.touchTeam; g.touches = mm.touches; g.lastPlayer = lp; g.lastTeam = mm.lastTeam; g.lastKind = mm.lastKind;
    g.lastShot = mm.lastShot && typeof mm.lastShot === 'object' ? JSON.parse(JSON.stringify(mm.lastShot)) : mm.lastShot;
    g.lastQ = mm.lastQ; g.lastTouchT = tNow - mm.ltAge; g.prevKind = mm.prevKind; g.netSince = mm.netSince;
    g.blockBy = flBy(g, mm.bb); g.blockCD = mm.blockCD;
    if (a) {
      g.atkServe = { team: a.team, player: flBy(g, a.pid) };
      if (a.reason !== undefined) g.atkServe.reason = a.reason;
      if (a.text !== undefined) g.atkServe.text = a.text;
    } else g.atkServe = null;
    g.antennaHit = ah ? { x: ah.x, y: ah.y, z: ah.z } : null;
    g.digOk = mm.digOk; g.digMargin = mm.digMargin; g._digWho = flBy(g, mm.dw); g.hardIn = mm.hardIn; g.digTight = mm.digTight;
    g.recvRisk = mm.recvRisk; g.digK = mm.digK || 0; g.feintFool = !!mm.feintFool;
    if (rc) {
      var o = g._rc || (g._rc = {});
      o.pace = rc.pace; o.wob = rc.wob; o.run = rc.run; o.move = rc.move; o.line = rc.line; o.ft = rc.ft; o.who = flBy(g, rc.who);
    }
    g.blockOff[0] = mm.blockOff[0]; g.blockOff[1] = mm.blockOff[1];
    g.atkTeam = mm.atkTeam; g.atkHow = mm.atkHow; g.atkHits = mm.atkHits; g.atkHuman = mm.atkHuman; g.atkGrade = mm.atkGrade;
    g.atkSet = flBy(g, mm.as); g.atkMove = mm.atkMove; g.atkEdge = mm.atkEdge; g.feintT = tNow - mm.feintAge;
    g.lastTempo = mm.lastTempo; g.chain = mm.chain; g.chainH = mm.chainH;
    g.rally.t = mm.rally.t; g.rally.hits = mm.rally.hits; g.rally.digs = mm.rally.digs;
    g.lastLand = ll ? { x: ll.x, y: ll.y, inside: ll.inside, t: tNow - ll.age } : null;
    if (lp && !g.fl.loc[lp.team] && mm.lpGrade !== undefined) lp.grade = mm.lpGrade;
  }
  function flBundle(g) {
    var F = g.fl, b = g.ball;
    var o = { r: F.r, s: F.seq, par: F.par, T: F.cT, h: F.cH, kind: F.dirty || '', kh: F.kh, khAt: F.khAt, own: F.own, full: F.cFull ? 1 : 0,
      b: [b.x, b.y, b.z, b.vx, b.vy, b.vz, b.spin, b.speed, b.dip, b.wobA, b.wobF, b.wobP], hd: flId(b.held), bAge: F.bAge,
      mode: g.mode, m: flMeta(g) };
    if (g.mode === 'serve') o.sv = { serveState: g.serveState, serveJump: g.serveJump, serveT: g.serveT, tossT: g.tossT, jumpAt: g.jumpAt,
      serveAuth: g.serveAuth, serveNo: g.serveNo, whistleAt: g.whistleAt };
    return o;
  }
  var FL_KIN = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'onGround', 'pressEnd'], _flSave = [];
  function flCatchUp(g, fromHs, nowT, rewind, full, cT) {
    var F = g.fl, dh = F.dh, dt = 2 * dh, me = F.me, P = g.players, i, k, j, t;
    if (nowT === undefined || nowT === null) nowT = F.T;
    var end = 2 * nowT + 1, n = end - fromHs + 1, late = n > FL.CATCH_MAX, tPrev = cT === undefined || cT === null ? fromHs >> 1 : cT;
    if (n <= 0) return 0;
    var t0 = g.time, T0 = F.T, hs0 = F.hs, ran = 0, rw = rewind && !late;
    if (rw) for (i = 0, k = 0; i < P.length; i++) if (F.loc[P[i].team]) {
      var sv = _flSave[k] || (_flSave[k] = []); for (j = 0; j < FL_KIN.length; j++) sv[j] = P[i][FL_KIN[j]]; k++;
    }
    F.catch = true;
    try {
      for (j = fromHs; j <= end && g.mode === 'rally'; j++) {
        t = j >> 1;
        if (t > tPrev) { g.blockCD -= dt * (t - tPrev); g.rally.t += dt * (t - tPrev); tPrev = t; }
        g.time = t * dt; F.T = t;
        if (rw) rewind(j, g);
        var h2 = full && j === fromHs, d = h2 ? dt : dh;
        if (h2) j++; else flHand(g, j);
        F.hs = j;
        if (!late && F.own === me) stepBall(g, d); else flGhost(g, d);
        ran++;
      }
    } finally {
      F.catch = false; g.time = t0; F.T = T0; F.hs = hs0;
      if (rw) for (i = 0, k = 0; i < P.length; i++) if (F.loc[P[i].team]) {
        var sr = _flSave[k]; for (j = 0; j < FL_KIN.length; j++) P[i][FL_KIN[j]] = sr[j]; k++;
      }
    }
    if (nowT > tPrev && g.mode === 'rally') { g.blockCD -= dt * (nowT - tPrev); g.rally.t += dt * (nowT - tPrev); }
    if (late) { F.late++; return -ran; }
    return ran;
  }
  function flApplyTc(g, m, nowT, rewind) {
    var F = g.fl, fork = false;
    if (!F || !m || !m.m || !m.b) return 'bad';
    if (m.r < F.r) return 'old';
    if (m.r > F.r) return 'future';
    if (m.par < F.seq) {
      if (F.lf < 0 || m.par < F.lfPar) return 'dup';
      var hm = 2 * m.T + m.h;                                   // bifurcación: gana el contacto anterior (empate: el del anfitrión)
      if (hm > F.lf || (hm === F.lf && F.me === 0)) return 'lose';
      fork = true;
    }
    if (g.mode === 'over') return 'over';
    if (g.mode === 'point') flServe(g, true);                   // el tc del saque llegó antes que mi setupServe
    if (g.mode === 'serve' && m.mode === 'rally') endRitual(g);
    if (m.mode === 'rally' || m.mode === 'serve') g.mode = m.mode;
    var b = g.ball, B = m.b, i, dt = 2 * F.dh;
    for (i = 0; i < FL_BK.length; i++) b[FL_BK[i]] = B[i];
    b.held = m.hd >= 0 ? flBy(g, m.hd) : null;
    flSetMeta(g, m.m, m.T * dt);
    if (m.sv) {
      var s = m.sv;
      g.serveState = s.serveState; g.serveJump = s.serveJump; g.serveT = s.serveT; g.tossT = s.tossT; g.jumpAt = s.jumpAt;
      g.serveAuth = s.serveAuth; g.serveNo = s.serveNo; g.whistleAt = s.whistleAt;
    }
    F.bAge = m.bAge; F.seq = m.s; F.par = m.par; F.own = m.own; F.khAt = m.khAt; F.kh = m.kh; F.frozen = false; F.lf = -1;
    if (fork) F.forks++;
    flCatchUp(g, 2 * m.T + m.h + 1, nowT, rewind, !!m.full, m.T);
    return fork ? 'fork' : 'ok';
  }
  /** Copia plana de una llamada de línea (g.call / pt.cl) sin los campos que pone point(): null si no hay. */
  function flCall(c) {
    if (!c || typeof c !== 'object' || !Array.isArray(c.alt)) return null;
    return { x: +c.x || 0, y: +c.y || 0, dist: +c.dist || 0, truthIn: !!c.truthIn, calledIn: !!c.calledIn, wrong: !!c.wrong,
      alt: c.alt.slice(0, 3), used: !!c.used };
  }
  /** Challenge online Fluida del equipo team sobre la llamada del rally r (g.call.r). Sin force, como challenge() (ventana de
   *  CHAL.window s); con force (el que lo pidió, al llegar el «sí» del otro) sin mirar la ventana: el otro ya la miró al aceptarlo. */
  function flChallenge(g, team, r, force) {
    var c = g.call;
    if (!g.fl || !c || c.r !== r) return false;
    if (!force) return challenge(g, team);
    if (c.used || g.review || g.finished || c.team !== team || !(chalLeft(g, c, team) > 0)) return false;
    if (g.mode !== 'point' && g.mode !== 'over' && g.mode !== 'serve') return false;
    var t0 = c.t; c.t = g.time;
    try { return challenge(g, team); } finally { c.t = t0; }
  }
  function flApplyPt(g, m) {
    var F = g.fl;
    if (!F || !m || m.r !== F.r) return null;
    flSetMeta(g, m.m, g.time);
    if (g.mode !== 'rally' && g.mode !== 'serve') g.mode = 'rally';
    g._pendCall = flCall(m.cl);   // la llamada de línea del dueño (con su error arbitral): el challenge es el mismo en las dos máquinas
    F.app = true;
    var gb = F.frozen && F.gv && g.mode === 'rally';   // el fantasma ya cayó: bota y rueda desde el suelo con la velocidad del bote
    try { point(g, m.w, m.reason, m.text, flBy(g, m.pid), m.sig || undefined); } finally { F.app = false; }
    if (gb && g.ball.held == null && g.ball.z <= C.BR) { g.ball.vx = F.gv[0]; g.ball.vy = F.gv[1]; g.ball.vz = F.gv[2]; F.frozen = false; }
    if (!m.d) return true;
    var d = flDigest(g);
    for (var i = 0; i < d.length; i++) if (d[i] !== m.d[i]) return false;
    return true;
  }
  function flServe(g, force) {
    var F = g.fl;
    if (!F || g.mode !== 'point' || F.srvR === F.r || (g.timer > 0 && !force)) return false;
    if (g.pendingSet) nextSet(g);
    setupServe(g);
    return true;
  }
  function flSkip(g, t) { if (!g.skipReq[t]) { g.skipReq[t] = true; emit(g, { type: 'skipReq', team: t }); } }
  var FL_POSE = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'jvx', 'jvy', 'anim', 'lastAction', 'actionT', 'shot', 'grade', 'onGround', 'down', 'pressEnd', 'cool'];
  function flPose(g, team, poses) {
    if (!g.fl || g.fl.loc[team]) throw new Error('flPose: el equipo ' + team + ' se simula aquí');
    var T = g.teams[team], h = g.hum[team], i, k, q, pz;
    for (i = 0; i < T.length && i < poses.length; i++) {
      q = T[i]; pz = poses[i]; if (!pz) continue;
      for (k = 0; k < FL_POSE.length; k++) if (pz[FL_POSE[k]] !== undefined) q[FL_POSE[k]] = pz[FL_POSE[k]];
      if (h.p === q) {
        if (pz.swingLive !== undefined) hset(g, team, 'swingLive', !!pz.swingLive);
        if (pz.swingShot !== undefined) hset(g, team, 'swingShot', pz.swingShot);
      }
    }
  }
  function flDigest(g) {
    return [g.fl ? g.fl.r : 0, g.score[0], g.score[1], g.sets[0], g.sets[1], g.setNo, g.serving, g.serverIdx[0], g.serverIdx[1], g.pendingSet ? 1 : 0];
  }
  function flMatch(g, blk) {
    var F = g.fl, i;
    if (!blk) {
      var ss = []; for (i = 0; i < g.setScores.length; i++) ss.push(g.setScores[i].slice());
      return { score: g.score.slice(), sets: g.sets.slice(), setNo: g.setNo, setScores: ss, serving: g.serving, serverIdx: g.serverIdx.slice(),
        server: flId(g.server), pendingSet: g.pendingSet, finished: g.finished, setPoint: g.setPoint, matchPoint: g.matchPoint,
        streakTeam: g.streakTeam, streakN: g.streakN, courtSwap3: g.courtSwap3, courtSwapAt: g.courtSwapAt, r: F ? F.r : 0,
        challenges: g.challenges.slice() };
    }
    g.score[0] = blk.score[0]; g.score[1] = blk.score[1]; g.sets[0] = blk.sets[0]; g.sets[1] = blk.sets[1]; g.setNo = blk.setNo;
    g.setScores.length = 0; for (i = 0; i < blk.setScores.length; i++) g.setScores.push(blk.setScores[i].slice());
    g.serving = blk.serving; g.serverIdx[0] = blk.serverIdx[0]; g.serverIdx[1] = blk.serverIdx[1];
    if (blk.server >= 0) g.server = flBy(g, blk.server) || g.server;
    g.pendingSet = !!blk.pendingSet; g.finished = !!blk.finished; g.setPoint = blk.setPoint; g.matchPoint = blk.matchPoint;
    g.streakTeam = blk.streakTeam; g.streakN = blk.streakN; g.courtSwap3 = !!blk.courtSwap3; g.courtSwapAt = blk.courtSwapAt;
    if (F && typeof blk.r === 'number') F.r = blk.r;
    if (Array.isArray(blk.challenges)) { g.challenges[0] = blk.challenges[0] | 0; g.challenges[1] = blk.challenges[1] | 0; }
    return blk;
  }
  function flTake(g) {
    var F = g.fl;
    if (!F) return;
    F.loc[0] = F.loc[1] = true; F.own = F.me; F.khAt = -1; F.catch = false;
    if (!g.hum[1 - F.me].ai) slotAI(g, 1 - F.me, true);
    if (g.mode === 'rally' && F.frozen) { F.frozen = false; setupServe(g); } // flReplay: el fantasma ya cayó sin punto: se vuelve a sacar
  }
  /** step() del online Fluida con el rival remoto: copia recortada de stepOnline solo para el equipo local. inputs = [in0, in1] con la
   *  entrada local en su hueco (el otro, NOIN). Los jugadores rivales nunca pasan por stepPlayer/AI.update/humanStep: los pone flPose. */
  function stepFluid(g, dt, inputs) {
    var AI = VB.AI, H = g.hum, F = g.fl, me = F.me, rm = 1 - me, P = g.players, s, i, p, inp;
    g.time = F.T * dt; g.blockCD -= dt; F.dh = dt / 2; F.hs = 2 * F.T - 1;
    inp = (inputs && inputs[me]) || NOIN; _inS[me] = inp; _inS[rm] = H[rm].ai ? NOIN_AI : NOIN;
    act(g, me);
    g.hitBuf -= dt; g.swingLock -= dt; g.jsetQ -= dt;
    var mv = inp.move || NOIN.move, ml = dirLen(mv), mx = mv[0], my = mv[1];
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    _mxS[me] = mx; _myS[me] = my; _mlS[me] = ml; _aimOk[me] = ml > 0.2;
    if (_aimOk[me]) { _aimS[me][0] = mx / ml; _aimS[me][1] = my / ml; }
    g.aimOn = _aimOk[me]; if (_aimOk[me]) { g.aimIn[0] = _aimS[me][0]; g.aimIn[1] = _aimS[me][1]; }
    if (g.mastery) g.aimLen = ml;
    _mxS[rm] = 0; _myS[rm] = 0; _mlS[rm] = 0; _aimOk[rm] = false;
    act(g, 0);
    netBits(g, _inS);
    if (g.review) {
      g.review.t += dt;
      for (i = 0; i < P.length; i++) if (mine(g, P[i])) stepPlayer(g, P[i], dt, 0, 0);
      if (g.mode === 'point' || g.mode === 'over') stepBall(g, dt);
      if (g.review.t >= g.review.dur) {
        // el punto anulado se vuelve a pitar en las dos máquinas (app: sin la guarda del dueño y sin mandarlo como pt)
        var r0 = F.r; F.app = true;
        try { endReview(g); } finally { F.app = false; }
        if (F.r !== r0) { F.peer = false; F.wait = 0; }   // (el sr que valía era el del punto anulado)
      }
      fin(g); return;
    }
    if (g.mode === 'point' || g.mode === 'over') {
      if (skipBoth(g)) skipHold(g);
      for (i = 0; i < P.length; i++) if (mine(g, P[i])) stepPlayer(g, P[i], dt, 0, 0);
      stepBall(g, dt);
      g.timer -= dt;
      if (g.timer <= 0) {
        if (g.mode === 'over') {
          if (!(g.call && g.call.waived) && (canChallenge(g, 0) > 0 || canChallenge(g, 1) > 0 || g.cpuChal)) g.timer = 0;
          else if (!g.finished) { g.finished = true; emit(g, { type: 'gameOver', team: g.sets[0] > g.sets[1] ? 0 : 1, sets: [g.sets[0], g.sets[1]], setScores: g.setScores.slice() }); }
        } else if (F.loc[flNextServer(g)] || F.peer) {   // saco yo, o el rival ya preparó su saque (su sr: la sesión pone g.fl.peer)
          if (g.pendingSet) nextSet(g);
          setupServe(g);
        } else { g.timer = 0; F.wait += dt; }     // saca el rival: esperamos su sr (o, a los 2 s, la sesión llama a flServe)
      }
      fin(g); return;
    }
    if (g.mode === 'serve') {
      var ts = g.server.team;
      if (F.loc[ts]) {
        act(g, ts);
        stepServe(g, dt, _inS[ts], _mxS[ts], _myS[ts], _aimOk[ts] ? _aimS[ts] : null, !H[ts].ai); if (g.mode !== 'serve') endRitual(g);
      } else {
        // saca el rival: sin stepServe, sin relojes ni faltas. Los míos como en el final de stepServe (en 2v2 nadie más se mueve)
        g.serveT += dt;
        for (i = 0; i < P.length; i++) if (mine(g, P[i])) stepPlayer(g, P[i], dt, 0, 0);
        stepBall(g, dt);                          // en la mano: holdPos con la pose del sacador remoto; lanzado: vuelo puro
      }
      refreshPred(g);
      fin(g); return;
    }
    // ---- Peloteo ----
    g.rally.t += dt;
    act(g, me); g.jobs[me] = AI.computeJob(g, me);   // (el job rival se queda como estaba)
    if (H[me].ai) g.defRole = '';
    else if (g.mode === 'rally') {
      updateDefense(g);
      humanStep(g, dt, _inS[me], _mxS[me], _myS[me], _aimOk[me] ? _aimS[me] : null, _mlS[me]);
    }
    for (i = 0; i < P.length; i++) {
      p = P[i]; if (g.mode !== 'rally' || !mine(g, p) || humSlot(g, p) >= 0) continue;
      act(g, p.team); AI.update(g, p, dt);
    }
    for (s = 0; s < 2 && g.mode === 'rally'; s++) {
      F.hs = 2 * F.T + s; flHand(g, F.hs);         // traspaso en khAt (las dos máquinas)
      if (F.own === me) stepBall(g, dt / 2); else flGhost(g, dt / 2);
    }
    refreshPred(g);
    fin(g);
  }
  /* ==== fin FLUIDA ==== */
  /** Bloque del humano del peloteo (el del step de siempre en modo 'one', sin 6v6 ni Entrenamiento) para el hueco activo. */
  function humanStep(g, dt, input, mx, my, aim, ml) {
    var hp = g.ctrl, b = g.ball;
    var sWin = setWin(g), MS = MASTERY.set, sPos = false, sTow = false;
    var sFrz = sWin && !!g.rot && g.jsetAim && hp.z > 0 && jsetReady(g);
    if (sWin && !sFrz) {
      var sdA = side(hp.team), sAng = aim ? (Math.atan2(sdA * aim[1], -sdA * aim[0]) * 57.29577951308232 + 360) % 360 : 0, sSec = setSec(sAng);
      var sHeld = !!aim && ml >= MS.dead, wP = hitWindow(g, hp, _wPlant);
      if (!g.setWinOn) { g.setWinOn = true; g.setCarry = sHeld ? sSec : -1; g.setCarryK = 1; g.setDirA = NaN; }
      var sFp = focusPoint(g), sFx = sFp.x - hp.x, sFy = sFp.y - hp.y, sFd = Math.hypot(sFx, sFy), sCd = (sSec - g.setCarry + 8) % 8;
      sPos = hp.z > 0 || (wP.reach && sFd < MS.posD);
      if (sHeld && hp.z === 0 && sFd > MS.towD) sTow = (mx * sFx + my * sFy) / (ml * sFd) > MS.towCos;
      if (!sHeld) { g.setCarry = -1; if (!g.swingLive) g.setDirA = NaN; }
      else if (!sPos) { g.setCarry = sSec; g.setCarryK = 1; if (!g.swingLive) g.setDirA = NaN; }
      else {
        if (g.setCarry < 0 || (sCd > 1 && sCd < 7)) { g.setCarry = sSec; g.setCarryK = sTow ? 1 : 2; }
        if (g.setCarryK === 1) { if (!g.swingLive) g.setDirA = NaN; }
        else g.setDirA = sAng;
      }
    } else if (!sWin && g.setWinOn) { g.setWinOn = false; g.setCarry = -1; g.setDirA = NaN; }
    if (g.djump && ml >= DJ.dead && hp.z === 0) { var sdJ = side(hp.team); g.jdF = -sdJ * mx / ml; g.jdS = sdJ * my / ml; g.jdM = ml; g.jdT = g.time; }
    var plantJ = sWin && sPos && !sTow;
    if (input.jset && g.mode === 'rally' && groundSet(g, hp)) startSwing(g, hp, '');
    else if (input.jump || input.jset) {
      if (hp.z === 0 && hp.vz === 0) humanJump(g, hp, mx, my, ml, plantJ);
      else if (input.jset && jsetVoid(g, hp)) { /* bloqueando un remate rival: COLOCAR no hace nada */ }
      else if (hp.z > 0.2 && hp.actionT > 0.12 && Math.hypot(b.x - hp.x, b.y - hp.y) < 3) startSwing(g, hp, input.jset ? 'jset' : 'tip');
      else if (input.jset && hp.z > 0) g.jsetQ = JSET.buf;
    }
    if (g.jsetQ > 0 && hp.z > 0.2 && hp.actionT > 0.12 && Math.hypot(b.x - hp.x, b.y - hp.y) < 3 && !jsetVoid(g, hp)) { g.jsetQ = 0; startSwing(g, hp, 'jset'); }
    if (hp.z > 0) stepPlayer(g, hp, dt, 0, 0);
    else {
      var plant = sWin && sPos && !sTow && (g.setDirA === g.setDirA || g.swingLive || _wPlant.t <= MS.plantT);
      var am = assistMove(g, hp, plant ? 0 : mx, plant ? 0 : my, sWin);
      stepPlayer(g, hp, dt, am[0], am[1]);
    }
    updateAim3(g, hp, dt, mx, my);
    if (input.hit && g.mode === 'rally' && !blockPress(g, hp)) startSwing(g, hp, '');
    if (g.mode === 'rally') processSwing(g, hp, aim);
    if (g.lastTouchT === g.time && g.mode === 'rally') refreshPred(g);
  }

  /* ---------- Foto serializable del estado (online: reparación por instantánea del anfitrión) ----------
   * serialize(g) → objeto JSON-able {v, rng, o}: el grafo de g con referencias {$r: i} (objetos compartidos y jugadores), perfiles y
   * timings del módulo por nombre {$c: 'DIFF.mate'}, -0 / NaN / ±Infinity como {$n} y undefined como {$u}. Sin rng (va su estado en
   * .rng), events, replay ni opts. stats SÍ va (lo que deja huella sale de la partida confirmada). deserialize(obj, dst): dst es una
   * partida creada con createGame y las MISMAS opts; la deja idéntica bit a bit a la original (copyGame sobre la foto decodificada:
   * mismos objetos de dst, jugadores emparejados por id) y le pone stats de la foto. Devuelve dst, o null si la versión no cuadra. */
  var SER_V = 2, SER_SKIP = { rng: 1, events: 1, replay: 1, opts: 1 };
  function serConst() {
    var L = [], k;
    for (k in DIFF) if (DIFF[k] && typeof DIFF[k] === 'object') L.push([DIFF[k], 'DIFF.' + k]);
    for (k in TIMING) if (TIMING[k] && typeof TIMING[k] === 'object') L.push([TIMING[k], 'TIMING.' + k]);
    return L;
  }
  function serialize(g) {
    if (g.online) fin(g); // foto canónica: hueco activo 0 (aunque la interfaz haya llamado a useSlot entre pasos); slotGet no cambia g
    var K = serConst(), ids = typeof Map === 'function' ? new Map() : null, objs = [];
    function cname(v) { for (var i = 0; i < K.length; i++) if (K[i][0] === v) return K[i][1]; return null; }
    function enc(v, top) {
      if (typeof v === 'number') return v === 0 && 1 / v < 0 ? { $n: '-0' } : isFinite(v) ? v : { $n: String(v) };
      if (v === undefined) return { $u: 1 };
      if (v === null || typeof v !== 'object') return typeof v === 'function' ? null : v;
      var c = cname(v); if (c) return { $c: c };
      var id = ids.get(v); if (id !== undefined) return { $r: id };
      id = objs.length; ids.set(v, id);
      var slot = Array.isArray(v) ? [] : {}, k; objs.push(slot);
      if (Array.isArray(v)) for (var i = 0; i < v.length; i++) slot.push(enc(v[i], false));
      else for (k in v) { if (top && SER_SKIP[k] === 1) continue; slot[k] = enc(v[k], false); }
      return { $r: id };
    }
    enc(g, true);
    return { v: SER_V, rng: g.rng && g.rng.get ? g.rng.get() : 0, o: objs };
  }
  function deserialize(obj, dst) {
    if (!obj || obj.v !== SER_V || !Array.isArray(obj.o) || !dst) return null;
    var K = serConst(), cm = {}, i, O = obj.o, out = new Array(O.length);
    for (i = 0; i < K.length; i++) cm[K[i][1]] = K[i][0];
    for (i = 0; i < O.length; i++) out[i] = Array.isArray(O[i]) ? [] : {};
    function dec(v) {
      if (v === null || typeof v !== 'object') return v;
      if (v.$r !== undefined) return out[v.$r];
      if (v.$c !== undefined) return cm[v.$c];
      if (v.$n !== undefined) return v.$n === '-0' ? -0 : Number(v.$n);
      if (v.$u !== undefined) return undefined;
      return v;
    }
    for (i = 0; i < O.length; i++) {
      var o = O[i], t = out[i], k;
      if (Array.isArray(o)) for (var j = 0; j < o.length; j++) t[j] = dec(o[j]);
      else for (k in o) t[k] = dec(o[k]);
    }
    var src = out[0], st = obj.rng >>> 0;
    src.rng = { get: function () { return st; } }; src.events = [];
    copyGame(dst, src);
    dst.stats = src.stats !== undefined ? src.stats : dst.stats;
    return dst;
  }

  VB.Sim = {
    createGame: createGame, step: step, drainEvents: drainEvents, setTarget: setTarget, SET_POINTS: SET_POINTS, court: court,
    predict: predict, predictLanding: predictLanding, focusPoint: focusPoint, askOk: askOk,
    canReach: canReach, other: other, isHuman: isHuman, side: side, clamp: clamp,
    // equipos de N jugadores (sprint 1 del 6v6): compañeros, zonas y rotación
    mates: mates, nearestMate: nearestMate, mateBadge: mateBadge, zoneOf: zoneOf, zonePos: zonePos, isFront: isFront, ZONE: ZONE,
    rotate: rotate, serverOf: serverOf, refreshTeams: refreshTeams,
    // 6v6 (sprint 2): líbero, falta de posición, jugador en pista por zona, puestos de la alineación 5-1
    applyLibero: applyLibero, overlapCount: overlapCount, overlapOf: overlapOf, feet6: feet6, FOOT: { W: FOOT_W, R: FOOT_R, STRIDE: FOOT_STRIDE, V: FOOT_V }, onCourt: onCourt, ROLES6: ROLES6,
    // 6v6 con humano: puestos jugables (fila Controlar) y cambio de puesto
    CTRL_ROLES6: CTRL_ROLES6, setCtrlRole: setCtrlRole,
    // añadidos (opcionales)
    hitWindow: hitWindow, aimPoint: aimPoint, predictKind: predictKind, canDive: canDive, canDiveMiss: canDiveMiss, missROf: missROf, diveROf: diveROf, accTOf: accTOf, aiReactEff: aiReactEff, blkTouchIn: blkTouchIn, preROf: preROf, preLate: preLate, missLands: missLands, landT: ballLandT, effortFail: effortFail, timingQ: timingQ, gradeOf: gradeOf,
    normDiff: normDiff, DIFF: DIFF, TIMING: TIMING,
    atkPhase: atkPhase, blockPressCase: blockPressCase, canJset: canJset, jsetReady: jsetReady, jsetVoid: jsetVoid, JSET: JSET, // colocación en salto
    // E1 (maestría, sprint 5): botón COLOCAR contextual, vista previa de la colocación dirigida, filo, azar sin g.rng, constantes
    jsetAimInfo: jsetAimInfo, landingOf: landingOf, DJ: DJ, MOM: MOM, JD: JD, _updateAim3: updateAim3, _hitWindow: hitWindow, _assistMove: assistMove, // salto con impulso
    altReady: altReady, setPreview: setPreview, setWin: setWin, setTurn: setTurn, setAim: setAim, edgeOf: edgeOf, hk: hk, MASTERY: MASTERY,
    // internos expuestos para la IA y los tests
    _aimFloat: aimFloat, _floatPath: floatPath,
    _hit: hit, _jump: jump, _dive: dive, _diveMiss: diveMiss, _humanJump: humanJump, _holdPos: holdPos, _holdBase: holdBase, _ritualBall: ritualBall, _ritualStyle: ritualStyle, _stepPlayer: stepPlayer, _emit: emit, _rnd: rnd, _gauss: gauss,
    _setupServe: setupServe, _newGame: newGame, _makeRng: makeRng, _toss: toss, _doServe: doServe, _fault: fault,
    _inBlockVol: inBlockVol, _serveRisk: serveRisk, _recvFail: recvFail, _refreshPred: refreshPred,
    // presentación del punto (SIM-01/03)
    skipHold: skipHold, highlightOf: highlightOf, clutchOf: clutchOf,
    // Ambiente de Carrera (P3): no-op sin g.amb
    holdFor: holdFor, canPenalty: canPenalty, penalty: penalty,
    // ritual del sacador CPU (SIM-04)
    ritualAt: ritualAt,
    // remate apuntado (A2) y challenge (B2)
    statProf: statProf, attrK: attrK, profOf: profOf, ATTR_KEYS: ATTR_KEYS, spikeSpread: spikeSpread, serveSpread: serveSpread,
    // insignias: ids, nivel de un jugador, reacción/timing efectivos de la IA (ai.js), alcance
    BADGE_IDS: BADGE_IDS, badgeLevel: bl, aiReact: aiReact, aiTiming: aiTiming, reachOf: reachOf, canChallenge: canChallenge, challenge: challenge, lineDist: lineDist, refErrP: refErrP, dblSetP: dblSetP,
    _land: land, _point: point,
    // E6 (Entrenamiento): montaje público (pruebas) y puntuación pura; datos en VB.DRILL
    drillStage: drillStage, drillScore: drillScore, _drillIdle: drillIdle,
    // banquillo y cambios (6v6 con opts.bench; notes/titularidad-y-cambios.md §B e §I.2)
    canSub: canSub, requestSub: requestSub, cancelSub: cancelSub, subsLeft: subsLeft, benchOf: benchOf, subInfo: subInfo,
    defaultBench: defaultBench, SUB_MAX: SUB_MAX, SUB_HOLD: SUB_HOLD, SUBK: SUBK, hash01: hash01,
    _canSubC: function (g, t, out, inn) { return canSubX(g, t, out, inn, true); }, _applySubs: applySubs,
    // repetición (S3-C1): copia sobre una partida sombra y huella del estado (g.rng.get/set en makeRng)
    copyGame: copyGame, stateHash: stateHash,
    // ONLINE (fase 0, notes/net.md): huecos humanos, bits de partido y foto serializable del estado
    ONLINE: ONLINE, useSlot: act, slotGet: hget, humOn: humOn, humSlot: humSlot, jsetHum: jsetHum, jsetHumSw: _jh, setSlotAI: slotAI,
    // ONLINE V2 «Fluida» (bloque FLUIDA, notes/online-v2-spec.md §2): todo detrás de g.fl (flInit) // fl-api
    flInit: flInit, flTake: flTake, flFly: flFly, flOwnerCheck: flOwnerCheck, flBundle: flBundle, flApplyTc: flApplyTc, // fl-api
    flApplyPt: flApplyPt, flChallenge: flChallenge, flServe: flServe, flSkip: flSkip, flPose: flPose, flDigest: flDigest, flMatch: flMatch, flCatchUp: flCatchUp, // fl-api
    FL: FL, mine: mine, _flKh: flKh, _flGhost: flGhost, _flHand: flHand, _flContact: flContact, _stepFluid: stepFluid, _stepBall: stepBall, // fl-api
    serialize: serialize, deserialize: deserialize, SER_V: SER_V
  };
})();
