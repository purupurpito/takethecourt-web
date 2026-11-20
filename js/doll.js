/* =====================================================================
 * MAKE THE CUT — js/doll.js   (owner: players; MODELO DE PERSONAJE del juego, fase 2 integrada el 10-nov-2026)
 * MUÑECO («doll»): figura redondeada y limpia de muñeco articulado (Switch Sports / Sackboy) con caricatura de
 * cómic (Windjammers 2 / Mario Strikers): cabeza grande sin cuello, cara enorme dibujada, tubos con bolas en las
 * articulaciones, manoplas y zapatones, ropa PINTADA en la textura, contorno de tinta de color y dos bandas de sombra.
 *
 * Este fichero construye la GEOMETRÍA (VB.Doll.geometry), el ATLAS/MATERIAL (VB.Doll.material) y las celdas de la cara
 * (VB.Doll.faceCells) de cada jugador; players.js monta el esqueleto con las longitudes de VB.Doll.dims() y lo anima
 * (IK con estirón cartoon, poses, celebraciones). Mismo esqueleto de 27 huesos, mismos nombres y orden: body, pelvis,
 * spine, chest, head, eyes, mouth, teeth, browL, browR, hair, [sh, up, el, hand, hip, th, kn, ft] × izquierda/derecha.
 * El ALCANCE con el brazo ESTIRADO (hombro + brazo×estirón + antebrazo×estirón + palma) es el del atleta TAJO para el
 * que se afinó la animación (REACH_WANT = 2,192 m); el brazo de reposo es corto y players.js lo estira en la IK.
 *
 * Espacio del cuerpo como en players: mira a +Z, +X es su IZQUIERDA, +Y arriba, origen entre los pies.
 * Equipaciones: los objetos de players.js (setKit / liberoKit: base, accent, dark, trim, shorts, pad, sole, numFill,
 * pattern, libero). Playa (`beach`): tirantes, malla corta, descalzo con pies de muñeco, visera / gorra / gafas / cinta.
 * La escena ?debug=doll (maqueta: VB.Doll.start desde main.js) sigue funcionando con sus 4 muñecos.
 * VESTUARIO (13-nov-2026, spec «Vestuario» §4): el aspecto L (VB.Look.resolve, o la L vieja {skin, hair, style, acc}) se normaliza
 * con normLook y lo dibujan las piezas por ranura (peinados, gorros, gafas, cuello, muñecas, manos, rodilleras, tobillera, zapatillas)
 * y el atlas (tiras por columna con la u propia del tubo, pintura de cara, marcas, gafas pintadas, barba, licra); todo en la misma
 * malla y el mismo atlas (cero dibujos y programas nuevos). VB.Doll.preview es la vista previa del menú y VB.Doll.lookSelfTest su
 * prueba en el navegador. Nada de esto toca la sim. Notas: notes/players.md § Vestuario.
 * T21 (sprint 2-4, notes/s234/T21.md): los 5 objetos de jefe con dibujo propio (misma geometría que su base; color por cara con
 * G.vc o atlas) y el encuadre del retrato según el tamaño (ptZoom: cara a 44 px, busto a 88 px).
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var THREE, ctx, PI = Math.PI;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mixHex(a, b, t) {
    var ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  }
  function lumHex(h) { return (0.2126 * (h >> 16 & 255) + 0.7152 * (h >> 8 & 255) + 0.0722 * (h & 255)) / 255; }
  function hexCss(h) { return '#' + ('000000' + h.toString(16)).slice(-6); }

  // ---------- Proporciones del muñeco (m): presets de cuerpo ----------
  // `chibi` (por defecto, 10-nov-2026, «¿más chibi?»): ~3,3 cabezas (cabeza 0,50 m, algo más ancha que alta), piernas 0,58 (zapatón
  // incluido), tronco 0,605 corto y redondo por abajo, hombros a 1,185, de pie 1,64 m. `v1` = la primera maqueta (4,4 cabezas, 1,86 m).
  // En los dos el ALCANCE con el brazo estirado es el del atleta (fitReach): lo que baja el hombro lo pone el brazo (de muñeco).
  // ?body=v1 lo elige en la escena; VB.Doll.setBody(nombre) cambia en caliente (pruebas y comparación antes/después).
  var BODIES = {
    v1: { ANKLE: 0.12, THIGH: 0.33, SHIN: 0.33, HIP_W: 0.085, SPINE_Y: 0.22, CHEST_Y: 0.22, SH_Y: 0.23, SH_X: 0.17, PALM: 0.10,
      HEAD_C: 0.20, HEAD_RX: 0.20, HEAD_RY: 0.21, HEAD_RZ: 0.195, TUBE_ARM: 0.047, TUBE_LEG: 0.054, BALL_SH: 0.08, BALL_EL: 0.056, BALL_KN: 0.066, BALL_HIP: 0.06,
      HAND_K: 1, FOOT_K: 1, TORSO_W: 1 },
    // ARM = hombro→muñeca en REPOSO (0,635 + palma 0,115 = 0,75 hombro→palma: la manopla cuelga a la altura de la cadera); lo que falta
    // hasta el alcance del atleta lo pone el ESTIRÓN cartoon de la IK (reachTo, hasta ×STRETCH_MAX ≈ 1,41). Sin ARM (v1): brazo a medida.
    // (11-nov-2026, Ferran: «los brazos largos no me convencen… en el momento normal»): ARM 0,635 → 0,47 (la manopla cuelga en la
    // cadera, no en la rodilla: el brazo era más largo que la pierna entera), tubo del brazo 0,05 → 0,06 y bolas de hombro y codo algo
    // mayores (brazo rechoncho de chibi, no palo). El estirón que cubre el alcance sube de ×1,4 a ×1,9 (solo en el contacto).
    chibi: { ANKLE: 0.12, THIGH: 0.23, SHIN: 0.23, HIP_W: 0.09, SPINE_Y: 0.2, CHEST_Y: 0.2, SH_Y: 0.205, SH_X: 0.175, PALM: 0.115, ARM: 0.47,
      HEAD_C: 0.205, HEAD_RX: 0.245, HEAD_RY: 0.25, HEAD_RZ: 0.235, TUBE_ARM: 0.06, TUBE_LEG: 0.058, BALL_SH: 0.095, BALL_EL: 0.07, BALL_KN: 0.07, BALL_HIP: 0.064,
      HAND_K: 1.15, FOOT_K: 1.15, TORSO_W: 1.12 }
  };
  var BODY = 'chibi';
  var ANKLE, THIGH, SHIN, HIP_H, HIP_W, SPINE_Y, CHEST_Y, SH_Y, SH_X, SH_Z = 0.0, SH_H, NECK_Y, PALM, UPPER, FORE;
  var HEAD_C, HEAD_RX, HEAD_RY, HEAD_RZ, TUBE_ARM, TUBE_LEG, BALL_SH, BALL_EL, BALL_KN, BALL_HIP, HAND_K, FOOT_K, TORSO_W;
  // derivados: FK = escala de la cara/pelo respecto a la cabeza de v1 (los rasgos se dibujan en metros de v1 y se escalan);
  // TORSO_K = escala vertical del perfil del tronco (diseñado para un tronco de 0,67); TR_Y0/1 = alturas de reposo que cubre la camiseta
  var HEAD_C0 = 0.20, HEAD_RY0 = 0.21, FK = 1, TORSO_K = 1, TR_Y0 = 0, TR_Y1 = 1;
  // REACH_WANT: alcance del atleta TAJO (cadera 1,042 + tronco 0,493 + brazo 0,3 + antebrazo 0,27 + palma 0,087) para el que
  // se afinó toda la animación de players.js: el muñeco estirado llega a lo mismo (constante: players ya no publica otro modelo)
  var REACH_WANT = 2.192, REACH = 0, REACH_REST = 0, STRETCH_MAX = 1, ARM_REST = 0;   // alcance del atleta; del muñeco estirado / en reposo; tope del estirón
  function applyDims(name) {
    var b = BODIES[name] || BODIES.chibi; BODY = BODIES[name] ? name : 'chibi';
    ANKLE = b.ANKLE; THIGH = b.THIGH; SHIN = b.SHIN; HIP_H = THIGH + SHIN + ANKLE; HIP_W = b.HIP_W;
    SPINE_Y = b.SPINE_Y; CHEST_Y = b.CHEST_Y; SH_Y = b.SH_Y; SH_X = b.SH_X; SH_H = HIP_H + SPINE_Y + CHEST_Y + SH_Y;
    NECK_Y = SH_Y;                           // la cabeza nace a la altura de los hombros (sin cuello)
    PALM = b.PALM;                           // muñeca → centro de la manopla (la palma se apoya en el balón)
    HEAD_C = b.HEAD_C; HEAD_RX = b.HEAD_RX; HEAD_RY = b.HEAD_RY; HEAD_RZ = b.HEAD_RZ;
    TUBE_ARM = b.TUBE_ARM; TUBE_LEG = b.TUBE_LEG; BALL_SH = b.BALL_SH; BALL_EL = b.BALL_EL; BALL_KN = b.BALL_KN; BALL_HIP = b.BALL_HIP;
    HAND_K = b.HAND_K; FOOT_K = b.FOOT_K; TORSO_W = b.TORSO_W;
    FK = HEAD_RY / HEAD_RY0; TORSO_K = (SPINE_Y + CHEST_Y + SH_Y) / 0.67;
    TR_Y0 = HIP_H - 0.13 * TORSO_K; TR_Y1 = HIP_H + 0.70 * TORSO_K;
    ARM_REST = b.ARM || 0;
    fitReach();
  }

  /** Alcance del atleta (VB.Players.dims().reach). Sin ARM en el preset, el brazo se hace a medida (hombro + brazo + antebrazo + palma =
   *  alcance, proporción 0,52/0,48) y no hay estirón. Con ARM (chibi), el brazo de reposo es corto y STRETCH_MAX es el factor de
   *  estiramiento de brazo + antebrazo que cubre el alcance: lo aplica reachTo cuando el objetivo queda fuera. */
  function fitReach() {
    var arm = ARM_REST > 0 ? ARM_REST : REACH_WANT - SH_H - PALM;
    UPPER = arm * 0.52; FORE = arm * 0.48;
    REACH_REST = SH_H + UPPER + FORE + PALM;
    STRETCH_MAX = Math.max(1, (REACH_WANT - SH_H - PALM) / (UPPER + FORE));
    REACH = SH_H + (UPPER + FORE) * STRETCH_MAX + PALM;
  }

  // ---------- Equipos (misma paleta que players) ----------
  var TEAMS = [
    { base: 0xff5a2c, accent: 0xffb238, dark: 0x6e1606, trim: 0xffffff, shorts: 0x191b22, pad: 0x1d1f26, sole: 0xff6a2a, numFill: '#ffffff' },
    { base: 0x3363ea, accent: 0xbcd8ff, dark: 0x0b2766, trim: 0xffffff, shorts: 0x0b0e17, pad: 0x141a2a, sole: 0x2f7bff, numFill: '#ffffff' }
  ];
  var INK = 0x1d1530;
  function inkHex(tc) { return mixHex(tc.dark, INK, 0.35); }
  function tajoFill(tc) { return lumHex(tc.base) > 0.62 ? tc.accent : 0xf8f8f4; }
  /** Color de la crema de zinc (playa): BLANCA de tiza, que es como se lee el zinc. Solo si el acento del equipo es frío o verde
   *  (de 0,16 a 0,9 de tono: amarillo verdoso, verde, cian, azul, violeta) y queda lejos de la piel, va en ese color llevado a neón.
   *  Los rojos y naranjas llevados a neón daban rosa salmón o melocotón: colorete o quemadura, y sobre piel morena ni se veía. */
  var ZINC_WHITE = 0xf7fafc;
  function zincHex(tc, skin) {
    var c = new THREE.Color(tc.accent), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    if (hsl.s < 0.25 || hsl.h < 0.16 || hsl.h > 0.9) return ZINC_WHITE;
    c.setHSL(hsl.h, 1, clamp(hsl.l, 0.5, 0.6));
    var z = c.getHex();
    return skin != null && hexDist(z, skin) < 170 ? ZINC_WHITE : z;
  }
  // las medidas son números puros: se calculan al cargar (players.js las lee en init con VB.Doll.dims(), antes de que haya THREE aquí)
  applyDims(BODY);

  // Aspectos de la maqueta (4 muñecos): piel, pelo, peinado, complemento, equipo, dorsal, expresión y pose
  var LOOKS = [
    { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: 'gorra', team: 0, num: 7, face: 'neutra', pose: 'idle' },
    { skin: 0x8a5638, hair: 0x241a14, style: 'afro', acc: 'cinta', team: 0, num: 11, face: 'concentrado', pose: 'recv' },
    { skin: 0xf0c6a4, hair: 0x7a3a16, style: 'coleta', acc: 'visera', team: 1, num: 3, face: 'grito', pose: 'spike' },
    { skin: 0xc68a5f, hair: 0x1e1612, style: 'mono', acc: 'gafas', team: 1, num: 9, face: 'alegria', pose: 'cel' }
  ];
  // (las listas de peinados y complementos son las de VB.Look: STYLES, items('head'); aquí ya no hay copias)

  // ---------- VESTUARIO (spec «Vestuario» §1-§4): lo que sabe dibujar el muñeco por ranura ----------
  // id → sede ('A' ambas, 'P' pista, 'Y' playa). El catálogo con nombres, rarezas y desbloqueos es de js/look.js (VB.Look); aquí solo
  // está lo que hace falta para DIBUJAR. La sede solo se impone donde cambia el sentido de la pieza (VENUE_STRICT: interior,
  // calcetines, tobillera y zapatillas); el resto se dibuja tal cual llega (la maqueta ?debug=doll lleva gorra y gafas en pista).
  var ARMS = { manguito: 'P', manguitoRayas: 'P', manguitoCuadros: 'P', manguitoLlamas: 'P', manguitoRayos: 'P', manguitoOro: 'P', kinesio: 'A', manguitoMazo: 'P',
    // (1.18, WP7: medio —solo el brazo—, de antebrazo, bicolor, degradado, de estrellas y con tu número)
    manguitoMedio: 'P', manguitoBajo: 'P', manguitoBicolor: 'P', manguitoFundido: 'P', manguitoEstrella: 'P', manguitoNumero: 'P' };   // manguitos solo en pista (1.1.1)
  var ITEMS = {
    // (1.18, WP2: los 10 de siempre rehechos con el casco nuevo y 22 nuevos; los dibuja HAIR_STYLES)
    style: { tupe: 'A', coleta: 'A', afro: 'A', flequillo: 'A', rapado: 'A', mono: 'A', trenzas: 'A', dosmonos: 'A', coletas: 'A', cresta: 'A',
      alCero: 'A', degradado: 'A', cepillo: 'A', undercut: 'A', crop: 'A', pinchos: 'A', rizosCortos: 'A', afroCorto: 'A', frohawk: 'A',
      melenita: 'A', despeinado: 'A', cortina: 'A', mullet: 'A', ondas: 'A', melena: 'A', coletaBaja: 'A', trenza: 'A', monoBajo: 'A',
      semirrecogido: 'A', twists: 'A', rastas: 'A', raices: 'A' },
    // (1.18, WP7: objetos nuevos que se leen de espaldas y de lejos; los de cada ranura van al final)
    head: { cinta: 'A', cintaRizo: 'A', bandana: 'A', gorra: 'Y', gorraAtras: 'Y', visera: 'Y', pescador: 'Y', corona: 'A', gorraMTC: 'A',
      diadema: 'A', pinzas: 'A', gorroPompon: 'P', pescadorCuadros: 'Y', viseraGafas: 'Y' },
    ears: { pendientes: 'A' },   // (WP7 ronda 1: ranura propia; antes iban en head y no cabían con ningún gorro)
    eyes: { frente: 'Y', pasta: 'A', oscuras: 'Y', deporte: 'A', espejo: 'Y', gafasRedondas: 'A', aviador: 'Y', gafasVentisca: 'Y' },
    paint: { zinc: 'Y', rayas: 'A', rayasEq: 'A', estrella: 'A', pinturaEquipo: 'A', rayoOjo: 'A' },
    marks: { pecas: 'A', tirita: 'A', tiraNasal: 'A', tiritaNariz: 'A' },
    beard: { bigote: 'A', perilla: 'A', tresDias: 'A', barba: 'A', bigote70: 'A' },   // (barba: 1.18, WP3)
    neck: { medalla: 'A', conchas: 'Y', bandanaCuello: 'A', silbato: 'A', cadenaPlata: 'A' },
    under: { termica: 'P', licra: 'Y', licraCorta: 'Y' },
    band: { capitan: 'A' },
    armL: ARMS, armR: ARMS,
    elbows: { coderas: 'P' },
    wristL: { muneq: 'A', reloj: 'A', munhCanon: 'A', cintaMuneca: 'A', muneqDoble: 'A' }, wristR: { muneq: 'A', reloj: 'A', munhCanon: 'A', cintaMuneca: 'A', muneqDoble: 'A' },
    hands: { dedos: 'A', mitones: 'Y', dedosMuro: 'A', dedosColor: 'A' },
    legs: { malla: 'A', mallaLarga: 'A', mallaUnLado: 'A', malla34: 'A' },
    knees: { cortas: 'P', altas: 'P', bajadas: 'P', rodiPulpo: 'P', rodillerasColor: 'P', rodilleraUna: 'P' },
    socks: { tobilleros: 'P', media: 'P', altos: 'P', altosRayas: 'P', desparejados: 'P', compresion: 'P', lunares: 'P', caido: 'P' },
    ankle: { blanca: 'P', tela: 'Y', pulseraTob: 'Y', escarpines: 'Y', tobiPulpo: 'Y', escarpinesNeo: 'Y', vendajeTob: 'Y', cuentasTob: 'Y' },
    shoes: { clasicas: 'P', negras: 'P', neon: 'P', doradas: 'P', botinAlto: 'P', suelaGorda: 'P', bicolor: 'P', retro: 'P' },
    hairFx: { raiz: 'A', puntas: 'A', mechas: 'A', flequilloFx: 'A', mitad: 'A' }   // efectos de pelo (fit.hairFx con fit.hair2, 1.18): por color de vértice
  };
  var LOOK_SLOTS = ['head', 'eyes', 'paint', 'marks', 'beard', 'neck', 'under', 'band', 'armL', 'armR', 'elbows', 'wristL', 'wristR',
    'hands', 'legs', 'knees', 'socks', 'ankle', 'shoes', 'ears'];
  var VENUE_STRICT = { under: 1, socks: 1, ankle: 1, shoes: 1 };
  // lo que lleva cada sede cuando el campo no llega (L viejas {skin, hair, style, acc} y NPC): exactamente lo de hoy
  var SLOT_DEF = { hall: { knees: 'cortas', socks: 'media', ankle: 'blanca', shoes: 'clasicas' }, beach: { paint: 'zinc', ankle: 'tela' } };
  // gorros de copa (clases CAP, CAPB y BUCKET de HAT_CLASS): el pelo solo asoma por debajo del borde; lo que cuelga sale por la abertura
  // o bajo el ala (1.18: ya no se prohíbe ningún peinado; HAIR_UNDER_CAP dice cuáles asoman enteros)
  var EAR_HAIR = { melena: 1, ondas: 1, melenita: 1, semirrecogido: 1 };   // peinados que tapan la oreja (los pendientes no se pintan)
  var HIDE_HAIR = { gorra: 1, gorraAtras: 1, pescador: 1, gorraMTC: 1, bandana: 1, gorroPompon: 1, pescadorCuadros: 1 };
  // gorros que llevan cB por vértice (1.18, WP3: tira de la gorra, franja de la cinta y de la visera, cinta del pescador; la MTC lleva
  // el color de sus letras. WP7: pompón del gorro de lana si se elige cB, damero del pescador de cuadros y franja de la visera con gafas)
  var HEAD_B = { gorra: 1, gorraAtras: 1, pescador: 1, visera: 1, cinta: 1, gorroPompon: 1, pescadorCuadros: 1, viseraGafas: 1 };
  var GOLD = 0xf2c14e, GOLD_HI = 0xfff1b0, GOLD_OC = 0xbe8e31, NEUTRAL_DK = 0x22222a, TAPE = 0xf4f2ea;
  // oro del manguito dorado (ronda 1 de WP5): más saturado y con más contraste que GOLD, que con las luces del pabellón se quedaba en
  // un amarillo pálido: sombra ocre tostado, medio naranja dorado y cara iluminada amarilla (el brillo sigue siendo GOLD_HI)
  var SLV_GOLD = 0xeea316, SLV_GOLD_SH = 0x9c5f0c, SLV_GOLD_LT = 0xffcc2e;
  // objetos de jefe (variantes de una pieza base con la MISMA geometría: color por vértice o atlas; VB.Look cae a «as» sin dibujo):
  // cañón (muñequera negra con aro de cA), hierro (esparadrapo gris acero con remaches), martillo (manguito oscuro con un mazo de cA)
  // y pulpo (rodilleras altas moradas / tobillera de cA, con ventosas)
  var STEEL = 0x9aa6b4, STEEL_DK = 0x4f5866, MAZO_DK = 0x2b2833, PULPO = 0x9a4fc4, PULPO_HI = 0xf0c8ff;
  var NEO = 0x23262d;   // neopreno de los escarpinesNeo (WP7)
  var KNEE_HI = { altas: 1, rodiPulpo: 1 }, TAPED = { dedos: TAPE, dedosMuro: STEEL, dedosColor: -1 };   // (dedosColor: cA, WP7)
  function slotVal(v, slot, bch) {
    var d = (bch ? SLOT_DEF.beach : SLOT_DEF.hall)[slot] || '', ven;
    if (v === '' && !(slot === 'shoes' && !bch)) return '';      // '' = nada (en pista las zapatillas no se quitan)
    if (typeof v !== 'string' || !ITEMS[slot][v]) return d;      // sin dato o id desconocido: lo de hoy
    ven = ITEMS[slot][v];
    if (VENUE_STRICT[slot] && ven !== 'A' && (ven === 'Y') !== bch) return d;
    return v;
  }
  function colOr(v) { return typeof v === 'number' && v >= 0 ? v : -1; }
  function hairOf(h) {
    if (typeof h === 'number') return h;
    try { var it = typeof h === 'string' && VB.Look && VB.Look.item ? VB.Look.item(h) : null; if (it && typeof it.hex === 'number') return it.hex; } catch (e) { }
    return 0x3a2416;
  }
  /** Aspecto NORMALIZADO para dibujar: acepta la L del Vestuario (§2.2, VB.Look.resolve) y las viejas {skin, hair, style, acc}.
   *  Un campo que no llega vale lo de hoy; `acc: 'gafas'` (NPC de playa) = gafas en la frente sin gorro; en playa `paint`
   *  sin definir = zinc. Los colores quedan en hex o -1 (= automático: lo resuelve cada pieza). */
  function normLook(L, bch) {
    L = L || {};
    var acc = L.acc != null ? L.acc : L.head, X = { skin: typeof L.skin === 'number' ? L.skin : 0xdba27a, hair: hairOf(L.hair) };
    X.style = typeof L.style === 'string' && ITEMS.style[L.style] ? L.style : 'tupe';
    for (var i = 0; i < LOOK_SLOTS.length; i++) { var s = LOOK_SLOTS[i]; X[s] = s === 'head' ? '' : slotVal(L[s], s, bch); }
    if (acc === 'gafas') { X.head = ''; if (L.eyes == null) X.eyes = 'frente'; }
    else X.head = typeof acc === 'string' && ITEMS.head[acc] ? acc : '';
    X.cA = colOr(L.cA); X.cB = colOr(L.cB); X.cSock = colOr(L.cSock); X.cShoe = colOr(L.cShoe); X.cGlass = colOr(L.cGlass); X.cPad = colOr(L.cPad);
    // 1.18 (WP1/WP2 del plan del Vestuario): segundo color de pelo (hex o -1 = sin él) y efecto de pelo ('' = nada): hairTone
    X.hair2 = L.hair2 == null || L.hair2 === '' || L.hair2 === -1 ? -1 : hairOf(L.hair2);
    X.hairFx = typeof L.hairFx === 'string' && ITEMS.hairFx[L.hairFx] ? L.hairFx : '';
    X.brow = typeof L.brow === 'number' ? L.brow : X.hair;   // cejas y barba: con tinte de fantasía, un natural (VB.Look.resolve)
    X.beach = !!bch;
    return X;
  }
  // colores automáticos (-1): los de hoy (acento del equipo, oscuro del equipo, calcetín del acento)
  function colA(X, tc) { return X.cA >= 0 ? X.cA : tc.accent; }
  function colB(X, tc) { return X.cB >= 0 ? X.cB : tc.dark; }
  /** Color de la camiseta interior (térmica de pista, licras de playa): cB si se elige; en automático el oscuro del equipo, salvo que
   *  se funda con la camiseta (marino sobre marino: parecía la manga de la propia camiseta) → blanco o casi negro (T6 del plan). */
  function underHex(X, tc) { return X.cB >= 0 ? X.cB : hexDist(tc.dark, tc.base) >= 140 ? tc.dark : pick(tc.dark, tc.base, tc, 140); }
  function colSock(X, tc) { return X.cSock >= 0 ? X.cSock : tc.accent; }
  var TC_GEO = ['base', 'accent', 'dark', 'shorts', 'pad', 'sole'], TC_ATLAS = ['base', 'accent', 'dark', 'trim', 'shorts', 'pad', 'numFill', 'pattern', 'libero', 'bib'];
  var TIES = { coleta: 1, mono: 1, trenzas: 1, dosmonos: 1, coletas: 1, coletaBaja: 1, trenza: 1, monoBajo: 1, semirrecogido: 1 };   // peinados con gomas de cA
  function armVc(a) { return ARMS[a] && a !== 'kinesio' && a !== 'manguitoOro' && a !== 'manguitoLlamas' && a !== 'manguitoMazo'; }   // manguito con la bola del codo de cA
  // (1.18, WP7) qué tapa cada manguito: el medio solo el brazo (del ribete al codo), el de antebrazo solo del codo a la muñeca; bicolor y
  // degradado llevan cB en la bola del codo (la mitad de abajo es cB)
  var SLV_UP_ONLY = { manguitoMedio: 1 }, SLV_FORE_ONLY = { manguitoBajo: 1 }, SLV_AB = { manguitoBicolor: 1, manguitoFundido: 1 };
  /** Licra de surf (playa): la de manga larga o la de manga corta (WP7): hombros, tronco y cuello alto en cB. */
  function isLicra(X) { return X.under === 'licra' || X.under === 'licraCorta'; }
  /** Manga larga en cB por todo el brazo (la térmica en pista, la licra larga en playa). */
  /** Segundo color de los manguitos de dos colores (WP7): cB, o lo que se distinga de cA (pick) si se parecen. */
  function slvB(X, tc) { var a = colA(X, tc), b = colB(X, tc); return hexDist(a, b) < 150 ? pick(b, a, tc) : b; }
  function longSleeve(X) { return X.beach ? X.under === 'licra' : X.under === 'termica'; }
  /** Malla que tapa la rodilla de la pierna k (0 izquierda): larga, 3/4 o la de un solo lado (la izquierda). k null: alguna pierna. */
  function kneeTights(X, k) { return X.legs === 'mallaLarga' || X.legs === 'malla34' || (X.legs === 'mallaUnLado' && k !== 1); }
  /** Color de las mallas que tapan la rodilla: la larga, cB (como siempre); la 3/4 y la de un lado (WP7), cB si se elige y, en automático,
   *  el primero de acento, base, oscuro, blanco o negro que se distinga del pantalón (luminancia ≥ 0,25 o color muy distinto) y de la
   *  piel: en cB automático —el oscuro del equipo, casi siempre como el pantalón— de espaldas no se veían. Solo equipación y piel (están
   *  en la firma de la malla: la bola de la rodilla lleva este color). */
  function tightsOf(X, tc) {
    if (X.legs === 'mallaLarga' || X.cB >= 0) return colB(X, tc);
    var top = X.beach ? tc.base : tc.shorts, c = [tc.accent, tc.base, tc.dark, 0xf4f4f4, NEUTRAL_DK], i;
    for (i = 0; i < c.length; i++) if (typeof c[i] === 'number' && (Math.abs(lumHex(c[i]) - lumHex(top)) >= 0.25 || hexDist(c[i], top) >= 260) && hexDist(c[i], X.skin) >= 120) return c[i];
    return colB(X, tc);
  }
  var SHOE_VC = { clasicas: 1, neon: 1, botinAlto: 1, suelaGorda: 1, bicolor: 1, retro: 1 };   // zapatillas que admiten cShoe (color por vértice)
  /** Firma de lo que cambia la MALLA (geometría y colores por vértice) de un muñeco con el aspecto L, la equipación tc y la sede.
   *  Un color entra solo si alguna pieza lo lleva por vértice (si no, cambiarlo es solo repintar el atlas). */
  // (justa: lo que no toca la malla —kinesio y malla corta, que van pintados— no entra, así que cambiarlos solo repinta el atlas; si una
  //  pieza pasa a la malla, lookSelfTest lo pilla: «geoSig no ve el cambio de malla». cPad (1.18, WP4) lo llevan por vértice las
  //  rodilleras cortas, altas y bajadas: su ficha de look.js con vc 'P')
  var PAD_VC = { cortas: 1, altas: 1, bajadas: 1, rodillerasColor: 1, rodilleraUna: 1 };   // rodilleras con cPad por vértice (la de pulpo es morada siempre); las coderas también (WP5)
  // (WP7) muñequeras que buscan contraste con el puño del manguito (cB) y piezas de cuello con cA
  var WRIST_BG = { muneq: 1, cintaMuneca: 1, muneqDoble: 1 }, NECK_A = { medalla: 1, bandanaCuello: 1, silbato: 1 };
  function armSig(a) { return a === 'kinesio' ? '' : a; }
  function geoSig(L, tc, bch) {
    var X = normLook(L, bch), p = [bch ? 'Y' : 'P', X.skin, X.hair, X.hair2, X.hairFx, X.style, X.head, X.eyes, X.neck, X.under, armSig(X.armL),
      armSig(X.armR), X.elbows, X.wristL, X.wristR, X.hands, kneeTights(X) ? X.legs : '', X.knees, X.ankle, X.shoes, X.ears];
    var uA = !!(X.head || X.eyes === 'deporte' || X.eyes === 'oscuras' || X.eyes === 'espejo' || X.eyes === 'gafasVentisca' || TIES[X.style] || armVc(X.armL) || armVc(X.armR) || X.elbows || X.wristL || X.wristR ||
      X.hands === 'mitones' || X.hands === 'dedosColor' || NECK_A[X.neck] || X.knees === 'rodillerasColor' ||
      (bch && (X.ankle === 'tela' || X.ankle === 'pulseraTob' || X.ankle === 'tobiPulpo' || X.ankle === 'escarpinesNeo' || X.ankle === 'cuentasTob')));
    // (malla larga: la bola de la rodilla sin rodillera va en cB y, con rodillera automática, su color depende de cB por el contraste)
    // (WP5: la cinta de la medalla es bicolor cA/cB; la muñequera busca contraste con el puño del manguito, que es cB)
    var uB = !!(HEAD_B[X.head] || (!bch && X.under === 'termica') || (bch && isLicra(X)) || kneeTights(X) || X.neck === 'medalla' ||
      SLV_AB[X.armL] || SLV_AB[X.armR] || X.wristL === 'muneqDoble' || X.wristR === 'muneqDoble' ||
      (WRIST_BG[X.wristL] && armVc(X.armL)) || (WRIST_BG[X.wristR] && armVc(X.armR)));
    p.push(uA ? X.cA : '', uB ? X.cB : '', bch && X.ankle === 'escarpines' ? X.cSock : '', !bch && SHOE_VC[X.shoes] ? X.cShoe : '', X.eyes ? X.cGlass : '',
      PAD_VC[X.knees] || X.elbows ? X.cPad : '');
    for (var i = 0; i < TC_GEO.length; i++) p.push(tc ? tc[TC_GEO[i]] : '');
    return p.join('|');
  }
  /** Firma de lo que se pinta en el ATLAS (ropa, dorsal, tiras, cara). */
  function atlasSig(L, tc, num, bch) {
    var X = normLook(L, bch), p = [bch ? 'Y' : 'P', num, X.skin, X.hair, X.brow, X.eyes, X.paint, X.marks, X.beard, X.under, X.band, X.armL, X.armR,
      X.legs, X.knees, X.socks, X.ankle, X.cA, X.cB, X.cSock, X.cGlass, X.cPad, bch ? '' : X.shoes + ':' + X.cShoe];   // (la zapatilla: alto del calcetín y su color)
    for (var i = 0; i < TC_ATLAS.length; i++) p.push(tc ? tc[TC_ATLAS[i]] : '');
    return p.join('|');
  }

  // =====================================================================
  //  GEOMETRÍA: acumulador (una malla con piel rígida por hueso, color por vértice, UV del atlas, peso de tinta `ow`)
  // =====================================================================
  // Modos de UV: 'flat' (texel blanco: color por vértice) · 'wrap' (tronco: u alrededor, v por la altura de reposo entre
  // yBot..yTop sobre las filas r0..r1 del atlas) · 'strip' (tubos: v de la primitiva sobre las filas r0..r1) · 'own' (UV propia).
  // El atlas se DISEÑA en 512 unidades (filas y celdas de abajo) pero se pinta a 1024² (PXK = 2): la cara es enorme y con 512 se veía
  // blanda en primer plano. Las UV se calculan en unidades de diseño (ATLAS = 512) y el lienzo lleva la escala.
  // PXK lo fija cada material (VB.Doll.material: 2 en el 2v2 en alta, 1 con 12 muñecos o en media/baja: 1 MB por atlas en vez de 4)
  var ATLAS = 512, PXK = 2, WHITE_V = 1 - 203.5 / ATLAS;
  // Columnas de las tiras (spec §4.1): cada tubo lee su columna con la u propia del tubo; gu = 0,5 mira hacia FUERA (el tubo se gira
  // TUBE_RY: el izquierdo hacia +X, el derecho hacia −X) y la costura queda por dentro. La columna del lado izquierdo va espejada
  // (su0 > su1): un dibujo asimétrico (llamas, kinesio) sale en espejo en los dos brazos, y lo que se lee (la «C» del brazalete) se
  // pinta volteado en la columna izquierda para que se lea bien desde fuera. [k] = 0 izquierdo, 1 derecho.
  var SU_ALL = [0, 1], COL_UP = [[0.25, 0], [0.25, 0.5]], COL_FORE = [[0.75, 0.5], [0.75, 1]], COL_TH = [[0.5, 0], [0.5, 1]], COL_SHN = [[0.5, 0], [0.5, 1]];
  var TUBE_RY = [-PI / 2, PI / 2];
  function Geo() { this.p = []; this.n = []; this.c = []; this.u = []; this.si = []; this.sw = []; this.i = []; this.o = []; this.k = 0; this.pre = null; this.bone = 0; this.bone2 = -1; this.w2 = null; this.owk = 1; this.mode = 'flat'; this.rows = null; this.yr = null; this.su = SU_ALL; this.vc = null; }
  Geo.prototype.add = function (geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) {
    if (this.vc && geo.index) { var g0 = geo; geo = g0.toNonIndexed(); g0.dispose(); }   // dibujo por cara: vértices propios, mismos triángulos
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    q.setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), q, new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    var m0 = this.w2 ? m.clone() : null;
    if (this.pre) m.premultiply(this.pre);
    nm.getNormalMatrix(m);
    var P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, col = new THREE.Color(hex == null ? 0xffffff : hex), i;
    // G.vc(cx, cy, cz, t): centro del triángulo t (en el orden de la primitiva) en sus coordenadas → hex, o null (= hex). Dibujo por
    // cara (bordes nítidos)
    var vc = this.vc, c0 = vc ? col.clone() : null, vh;
    for (i = 0; i < P.count; i++) {
      if (vc && i % 3 === 0) {
        vh = vc((P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3, i / 3);
        if (vh == null) col.copy(c0); else col.setHex(vh);
      }
      var w2 = 0; if (m0) { v.fromBufferAttribute(P, i).applyMatrix4(m0); w2 = this.w2(v.y); }
      var gv = U ? U.getY(i) : 0, gu = U ? U.getX(i) : 0;
      v.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      if (this.mode === 'wrap') { var t = clamp((v.y - this.yr[0]) / (this.yr[1] - this.yr[0]), 0, 1); this.u.push(gu, 1 - (this.rows[1] - (this.rows[1] - this.rows[0]) * t) / ATLAS); }
      else if (this.mode === 'strip') {   // u propia del tubo dentro de su columna [su0, su1] (espejada si su0 > su1), con margen contra los mipmaps
        var tv = clamp(gv, 0.03, 0.97), a0 = this.su[0], a1 = this.su[1], mg = a1 > a0 ? 0.006 : -0.006;
        this.u.push(a0 + mg + gu * (a1 - a0 - 2 * mg), 1 - (this.rows[1] - (this.rows[1] - this.rows[0]) * tv) / ATLAS);
      }
      else if (this.mode === 'own') this.u.push(gu, gv);
      else this.u.push(0.5, WHITE_V);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
      this.c.push(col.r, col.g, col.b); this.o.push(this.owk);
      if (w2 > 0) { this.si.push(this.bone, this.bone2, 0, 0); this.sw.push(1 - w2, w2, 0, 0); }
      else { this.si.push(this.bone, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    }
    if (geo.index) for (i = 0; i < geo.index.count; i++) this.i.push(geo.index.getX(i) + this.k);
    else for (i = 0; i < P.count; i++) this.i.push(this.k + i);
    this.k += P.count; geo.dispose(); return this;
  };
  Geo.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(this.sw), 4));
    g.setAttribute('ow', new THREE.Float32BufferAttribute(this.o, 1));
    g.setIndex(this.i);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0.2), 2.4);   // la piel no recalcula límites (salto, brazos arriba)
    return g;
  };

  // ---------- Primitivas con nivel de detalle ----------
  var LOD_K = [0.45, 0.65, 1], LODK = 1, LODR = 2;
  function sg(n, mn) { return Math.max(mn || 3, Math.round(n * LODK)); }
  function V2(x, y) { return new THREE.Vector2(x, y); }
  function sph(r, w, h, ps, pl, ts, tl) { return new THREE.SphereGeometry(r, sg(w || 16, 8), sg(h || 12, 5), ps || 0, pl == null ? PI * 2 : pl, ts || 0, tl == null ? PI : tl); }
  function cyl(rt, rb, h, seg, open) { return new THREE.CylinderGeometry(rt, rb, h, sg(seg || 16, 8), 1, !!open); }
  function torus(r, t, rs, ts) { return new THREE.TorusGeometry(r, t, sg(rs, 4), sg(ts, 10)); }
  // (un perfil que BAJA —cola de la coleta, trenzas, coletas— daba normales y caras hacia dentro: se veía el casco de la tinta en vez del
  //  pelo; se recorre siempre de abajo arriba: mismos triángulos)
  function lathe(pts, seg, mn) { if (pts.length > 1 && pts[pts.length - 1].y < pts[0].y) pts = pts.slice().reverse(); return new THREE.LatheGeometry(pts, sg(seg, mn || 8), 0, PI * 2); }
  function capsule(r, len, cs, rs) { return new THREE.CapsuleGeometry(r, len, Math.max(1, Math.round((cs || 3) * LODK)), sg(rs || 10, 5)); }
  /** Tubo de grosor uniforme que cuelga del origen hasta -len (v = 1 en el arranque, 0 en la punta). */
  function tube(r, len, seg) { return cyl(r, r, len, seg || 16, true); }

  // ---------- Cabeza: esfera deformada de cómic (cráneo grande, mejillas, mandíbula marcada y mentón) ----------
  // (x, y, z) dirección sobre la esfera unidad → punto en metros del hueso de la cabeza (centro en HEAD_C)
  function headShape(x, y, z, o) {
    var lo = y < 0 ? -y : 0, hi = y > 0 ? y : 0, fr = z > 0 ? z : 0;
    var jaw = Math.exp(-(y + 0.45) * (y + 0.45) / 0.03);                   // anillo de la mandíbula (ángulo marcado bajo las orejas)
    var X = x * HEAD_RX * (1 - 0.3 * lo * lo * lo) * (1 + 0.035 * hi) * (1 + 0.1 * jaw * (0.5 + 0.5 * fr));
    var Y = y * HEAD_RY * (y < 0 ? 0.95 : 1);
    var Z = z * HEAD_RZ * (z < 0 ? (1 - 0.12 * lo * lo) : (1 + 0.02 * hi)) * (1 + 0.05 * jaw * fr);
    Z += 0.04 * lo * lo * fr * fr;                                             // mentón que asoma
    Z -= 0.012 * fr * fr * fr * hi * hi;                                       // frente algo plana
    o.x = X; o.y = HEAD_C + Y; o.z = Z; return o;
  }
  var HS = null;
  /** Esfera deformada por headShape con normales calculadas sobre la forma. */
  function headSphere(w, h) {
    if (!HS) HS = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    var geo = new THREE.SphereGeometry(1, w, h), P = geo.attributes.position, N = geo.attributes.normal, d = HS[0], t1 = HS[1], t2 = HS[2], p0 = HS[3], p1 = HS[4], p2 = HS[5], q = HS[6], e = 0.002;
    for (var i = 0; i < P.count; i++) {
      d.fromBufferAttribute(P, i).normalize();
      t1.set(0, 1, 0); if (Math.abs(d.y) > 0.95) t1.set(1, 0, 0);
      t1.cross(d).normalize(); t2.crossVectors(d, t1).normalize();
      headShape(d.x, d.y, d.z, p0);
      q.copy(d).addScaledVector(t1, e).normalize(); headShape(q.x, q.y, q.z, p1);
      q.copy(d).addScaledVector(t2, e).normalize(); headShape(q.x, q.y, q.z, p2);
      p1.sub(p0); p2.sub(p0); q.crossVectors(p1, p2).normalize();
      if (q.dot(d) < 0) q.multiplyScalar(-1);
      P.setXYZ(i, p0.x, p0.y, p0.z); N.setXYZ(i, q.x, q.y, q.z);
    }
    return geo;
  }
  /** Lámina pegada a la cara (rejilla sobre headShape, dirección dx ∈ ±dxM, dy ∈ [dy0, dy1]) a fOff() por fuera, con UV en la
   *  celda 0 de su hoja (x0, y0, w, h en píxeles del atlas). xs / ys: número de casillas (reparto uniforme) o lista de dx / dy.
   *  opt.wrap: proyección que no se aplasta en el borde (más allá de r = WRAP_R0 el ángulo sigue creciendo en vez de pegarse a la
   *  silueta: la barba ya no se estira hacia la oreja). opt.skirt: lista de dy por DEBAJO de dy0 (faldón bajo la barbilla) que repite
   *  la última fila de texels: la barba (o la piel) sigue por debajo del mentón y desde abajo no asoma la piel en dientes de sierra. */
  // (1.18, WP3: el desfase depende del LOD —la rejilla de la lámina en LOD0 es gruesa y la piel la atravesaba con 2 mm—)
  // (1.18, WP3 ronda 1: rejillas a medida —las columnas de la lámina de boca son las de la de ojos, así casan en SPLIT_DY sin
  //  muesca—, filas más densas hacia la barbilla y el faldón)
  var F_OFF_LOD = [0.005, 0.0028, 0.002], F_PAD = 3, WRAP_R0 = 0.88, WRAP_MAX = 1.85;
  function fOff() { return F_OFF_LOD[LODR]; }
  function sheetDir(dx, dy, wrap, d) {
    var r = Math.sqrt(dx * dx + dy * dy);
    if (!wrap || r <= WRAP_R0) return d.set(dx, dy, Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy))).normalize();
    var th = Math.min(WRAP_MAX, Math.asin(WRAP_R0) + (r - WRAP_R0) / Math.sqrt(1 - WRAP_R0 * WRAP_R0)), k = Math.sin(th) / r;
    return d.set(dx * k, dy * k, Math.cos(th));
  }
  function spanList(n, a, b) { var L = [], i; for (i = 0; i <= n; i++) L.push(a + (b - a) * i / n); return L; }
  function faceSheet(xs, ys, dxM, dy0, dy1, x0, y0, w, h, opt) {
    opt = opt || {};
    if (typeof xs === 'number') xs = spanList(xs, -dxM, dxM);
    if (typeof ys === 'number') ys = spanList(ys, dy0, dy1);
    var rows = (opt.skirt || []).slice().sort(function (a, b) { return a - b; }).concat(ys), nx = xs.length - 1, ny = rows.length - 1;
    var geo = new THREE.BufferGeometry(), pos = [], nrm = [], uv = [], idx = [], i, j, wrap = !!opt.wrap;
    var d = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3(), p0 = {}, p1 = {}, p2 = {}, e = 0.002;
    var P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), vIn = 0.6 / ATLAS;
    for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) {
      var dx = xs[i], dy = rows[j];
      sheetDir(dx, dy, wrap, d);
      t1.set(0, 1, 0).cross(d); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize(); t2.crossVectors(d, t1).normalize();
      headShape(d.x, d.y, d.z, p0); P0.set(p0.x, p0.y, p0.z);
      q.copy(d).addScaledVector(t1, e).normalize(); headShape(q.x, q.y, q.z, p1); P1.set(p1.x, p1.y, p1.z).sub(P0);
      q.copy(d).addScaledVector(t2, e).normalize(); headShape(q.x, q.y, q.z, p2); P2.set(p2.x, p2.y, p2.z).sub(P0);
      q.crossVectors(P1, P2).normalize(); if (q.dot(d) < 0) q.multiplyScalar(-1);
      P0.addScaledVector(q, fOff());
      pos.push(P0.x, P0.y, P0.z); nrm.push(q.x, q.y, q.z);
      var fu = (dx + dxM) / (2 * dxM), fv = clamp((dy - dy0) / (dy1 - dy0), 0, 1);
      var vv = 1 - (y0 + F_PAD + (h - 2 * F_PAD) * (1 - fv)) / ATLAS;
      if (dy < dy0) vv += vIn;   // (faldón: medio texel hacia dentro, nunca la fila de relleno)
      uv.push((x0 + F_PAD + (w - 2 * F_PAD) * fu) / ATLAS, vv);
    }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { var a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, dd = c + 1; idx.push(a, b, dd, a, dd, c); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }
  /** Z de la superficie delantera de la cabeza en (x, y) del hueso. */
  function headFrontZ(x, y) {
    var dx = x / HEAD_RX, dy = (y - HEAD_C) / HEAD_RY, o = { x: 0, y: 0, z: 0 };
    for (var it = 0; it < 30; it++) {
      var dz = Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy));
      headShape(dx, dy, dz, o);
      dx += (x - o.x) / HEAD_RX * 0.8; dy += (y - o.y) / HEAD_RY * 0.8;
    }
    return o.z;
  }

  // =====================================================================
  //  ATLAS (512²): tronco con la ropa pintada, tiras de brazo/muslo/espinilla, texel blanco y HOJA DE CARAS
  // =====================================================================
  // Filas: 0-199 tronco (u alrededor: 0 delante, 0,25 izquierda, 0,5 espalda; v = altura; camiseta arriba, pantalón abajo)
  //        200-207 blanco · 208-247 brazo (manga → piel) · 250-289 muslo (pantalón → piel) · 292-331 espinilla (piel → calcetín)
  //        336-455 ojos+cejas: 8 celdas de 128×60 (4×2) · 456-511 bocas: 8 celdas de 64×56
  var TR_R = [0, 199], TR_SPLIT = 142, ARM_R = [208, 247], TH_R = [250, 289], SHN_R = [292, 331];
  var FE_W = 128, FE_H = 60, FE_Y = 336, FM_W = 64, FM_H = 56, FM_Y = 456;
  // alturas de reposo del tronco (espacio del cuerpo) que cubren las filas TR_R: del bajo del pantalón al domo de los hombros
  // (TR_Y0 / TR_Y1 los pone applyDims)
  // direcciones de las láminas de la cara (sobre la esfera unidad) y geometría de los rasgos (metros del hueso de la cabeza)
  // (1.18, WP3: las dos láminas se tocan en SPLIT_DY, sin solape, y la de boca es más ancha —FM_DX 0,56 → 0,84— para la pintura de
  //  mejilla y las barbas)
  var SPLIT_DY = -0.297, FE_DX = 0.8, FE_DY0 = SPLIT_DY, FE_DY1 = 0.64, FM_DX = 0.84, FM_DY0 = -0.92, FM_DY1 = SPLIT_DY;
  // rasgos en metros de la cabeza de v1 (centro HEAD_C0): faceCell los escala ×FK alrededor del centro de la cabeza activa
  var EYE_X = 0.078, EYE_Y = HEAD_C0 + 0.005, EYE_RX = 0.046, EYE_RY = 0.06, BROW_Y = HEAD_C0 + 0.095, MOUTH_Y = HEAD_C0 - 0.1;
  var NUM_FONT = '"Barlow Condensed","Arial Narrow","Arial Black",Impact,sans-serif';

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texOf(cv) { var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; return t; }

  /** Atlas entero del jugador: tronco con la ropa, tiras de las extremidades, blanco y hoja de caras. num = dorsal; beach = playa. */
  function paintAtlas(cv, tc, L, num, beach) {
    var g = cv.getContext('2d'), px = cv.width / ATLAS;
    PXK = px;
    g.setTransform(px, 0, 0, px, 0, 0);   // unidades de diseño (512) → píxeles del lienzo (512·PXK)
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS, ATLAS);
    var X = normLook(L, !!beach);
    paintBody(g, tc, X, num == null ? L.num : num, !!beach);
    paintLimbs(g, tc, X, !!beach, num == null ? L.num : num);
    paintFace(g, tc, X, !!beach);
  }
  /** Banda del «tajo» en zigzag con filo oscuro de (x0,y0) a (x1,y1), ancho w. */
  function tajoBand(g, x0, y0, x1, y1, w, fill, edge) {
    var dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy), nx = -dy / l, ny = dx / l;
    function band(hw, zz) {
      var n = Math.max(2, Math.round(l / 16)), i, t, o, pts = [];
      for (i = 0; i <= n; i++) { t = i / n; o = hw + (i % 2 ? zz : -zz); pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]); }
      for (i = n; i >= 0; i--) { t = i / n; o = -hw + (i % 2 ? -zz : zz); pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]); }
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill();
    }
    g.fillStyle = hexCss(edge); band(w / 2 + 6, 6);
    g.fillStyle = hexCss(fill); band(w / 2, 6);
  }
  /** Tronco: camiseta (filas 0..TR_SPLIT) con el tajo del hombro izquierdo a la cadera derecha, dorsal grande en la espalda y
   *  pequeño en el pecho; pantalón (TR_SPLIT..199) con cinturilla y paneles del acento. */
  //  Diseños (tc.pattern, Ajustes · Equipación): 'diag' = el tajo (por defecto), 'liso', 'franjas' (dos bandas), 'rayas' (verticales);
  //  el líbero (tc.libero) va liso. Playa: camiseta de TIRANTES (hombros y sisas de piel, espalda nadadora, cuello redondo con ribete)
  //  con el tajo bajo el dorsal grande del pecho, y malla corta del color de la camiseta con panel del acento.
  //  Vestuario: con la licra de surf (playa) la piel de los hombros, las sisas, el escote y la espalda pasa a cB (tirantes y dorsal encima).
  //  'peto' (partidillo y ejercicios de la Carrera, players.js scrimKits): sobre la camiseta de entreno (tc.base) un peto tc.bib con
  //  paneles delante y detrás unidos por los hombros, los COSTADOS ABIERTOS (u ≈ 0,25 y 0,75: se ve la camiseta) y el bajo algo más
  //  corto que la camiseta, todo con filo de tinta para que se lea en cartoon; escote redondo con ribete tc.dark y dorsal grande
  //  (tc.numFill) delante y detrás. En la playa el peto va sobre la camiseta de tirantes (tirantes del peto, sisas y escote de piel).
  //  El líbero lleva también el peto (players.js kitOf). Solo atlas: ni malla nueva ni dibujos.
  function paintBody(g, tc, L, numV, beach) {
    var W = ATLAS, S = TR_SPLIT, sk = hexCss(beach && isLicra(L) ? underHex(L, tc) : L.skin), pat = tc.pattern === 'peto' && tc.bib != null ? 'peto' : tc.libero ? 'liso' : (tc.pattern || 'diag');
    var bibEd = pat === 'peto' ? mixHex(tc.bib, INK, 0.55) : 0;
    g.save(); g.beginPath(); g.rect(0, TR_R[0], W, TR_R[1] - TR_R[0] + 1); g.clip();
    g.fillStyle = hexCss(tc.base); g.fillRect(0, 0, W, S);
    function wrap(fn) { fn(0); fn(W); fn(-W); }
    /** peto: todo el contorno en tc.bib desde la fila y0 hasta un poco antes del bajo, con filo de tinta abajo y los dos costados
     *  abiertos desde yo (hueco de ±0,04 de u con la camiseta y filo en los bordes) */
    function peto(y0, yo) {
      var y1 = S - 16, gw = 0.04 * W;
      g.fillStyle = hexCss(bibEd); g.fillRect(0, y0, W, y1 - y0 + 4);
      g.fillStyle = hexCss(tc.bib); g.fillRect(0, y0, W, y1 - y0);
      [0.25, 0.75].forEach(function (u) {
        var cx = u * W;
        function slot(hw) { g.beginPath(); g.moveTo(cx - hw, S + 2); g.lineTo(cx - hw, yo + hw); g.quadraticCurveTo(cx - hw, yo - hw * 0.2, cx, yo - hw * 0.2); g.quadraticCurveTo(cx + hw, yo - hw * 0.2, cx + hw, yo + hw); g.lineTo(cx + hw, S + 2); g.closePath(); g.fill(); }
        g.fillStyle = hexCss(bibEd); slot(gw + 4);
        g.fillStyle = hexCss(tc.base); slot(gw);
      });
    }
    if (beach) {
      // tajo bajo el dorsal del pecho (del centro a la cadera derecha); con peto, el peto entero (sisas y escote se recortan encima)
      if (pat === 'peto') peto(0, 52);
      else wrap(function (o) { tajoBand(g, o + 70, 72, o - 96, S + 10, 44, tajoFill(tc), tc.dark); });
      // hombros desnudos: las filas altas son piel salvo los dos tirantes (sobre los hombros, u ≈ 0,25 y 0,75)
      g.fillStyle = sk; g.fillRect(0, -2, W, 24);
      // sisas (piel) en los lados, más abiertas hacia la espalda (nadadora); escote delante y espalda baja
      var rib = hexCss(pat === 'peto' ? tc.dark : tc.accent);   // ribete de sisas y escote (con peto, oscuro: el filo del peto)
      [0.25, 0.75].forEach(function (u) { var cx = u * W; g.fillStyle = rib; g.beginPath(); g.ellipse(cx + (u < 0.5 ? 1 : -1) * 0, 8, 50, 46, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(cx, 6, 44, 40, 0, 0, PI * 2); g.fill(); });
      g.fillStyle = rib; g.beginPath(); g.ellipse(W / 2, 0, 50, 34, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(W / 2, -2, 44, 28, 0, 0, PI * 2); g.fill();   // espalda
      wrap(function (o) { g.fillStyle = rib; g.beginPath(); g.ellipse(o, 0, 60, 30, 0, 0, PI * 2); g.fill(); g.fillStyle = sk; g.beginPath(); g.ellipse(o, -3, 53, 24, 0, 0, PI * 2); g.fill(); });   // escote
      // tirantes del color de la camiseta sobre cada hombro (de la sisa al escote y a la espalda); con peto, los del peto
      g.fillStyle = hexCss(pat === 'peto' ? tc.bib : tc.base); [0.25, 0.75].forEach(function (u) { var cx = u * W; g.fillRect(cx - 86, -2, 34, 40); g.fillRect(cx + 52, -2, 34, 40); });
      if (isLicra(L)) {   // licra (WP5, T1; y la de manga corta, WP7): costura lateral bajo la sisa (de color) y la licra más oscura en el borde del cuello alto
        var lc = underHex(L, tc); g.fillStyle = hexCss(pick(colA(L, tc), lc, tc)); [0.25, 0.75].forEach(function (u) { g.fillRect(u * W - 2.5, 0, 5, 50); });
        g.fillStyle = hexCss(mixHex(lc, 0x000000, 0.3)); g.fillRect(0, 0, W, 4);
      }
    } else if (pat === 'peto') {
      peto(0, 30);
    } else if (pat === 'diag') {
      // tajo: del hombro izquierdo (u ≈ 0,18, arriba) a la cadera derecha (u ≈ -0,2, bajo de la camiseta), pasando por el pecho
      wrap(function (o) { tajoBand(g, o + 92, -10, o - 104, S + 10, 60, tajoFill(tc), tc.dark); });
    } else if (pat === 'franjas') {
      g.fillStyle = hexCss(tc.accent); g.globalAlpha = 0.92; g.fillRect(0, 78, W, 14); g.fillRect(0, 98, W, 7); g.globalAlpha = 1;
    } else if (pat === 'rayas') {
      g.fillStyle = hexCss(tc.accent); g.globalAlpha = 0.55; for (var rx = 8; rx < W; rx += 32) g.fillRect(rx, 18, 9, S - 28); g.globalAlpha = 1;
    }
    if (!beach) {
      // cuello redondo (ribete) y hombros: canesú oscuro ligero en la espalda
      if (pat !== 'peto') { g.fillStyle = hexCss(tc.dark); g.globalAlpha = 0.3; g.fillRect(170, 0, 172, 16); g.globalAlpha = 1; }
      // (con la térmica, lo que asoma por el cuello es la térmica: cB; el cuello alto es un aro de la malla, neckGeo)
      var skN = L.under === 'termica' ? hexCss(underHex(L, tc)) : sk;
      wrap(function (o) { g.fillStyle = hexCss(pat === 'peto' ? tc.dark : tc.trim); g.beginPath(); g.ellipse(o, 0, 62, 20, 0, 0, PI * 2); g.fill(); g.fillStyle = skN; g.beginPath(); g.ellipse(o, -3, 54, 15, 0, 0, PI * 2); g.fill(); });
    }
    // dorsales: grande en la espalda (u 0,5), pequeño en el pecho dentro del tajo (oscuro); playa: grande también delante
    var s = String(numV == null ? 0 : numV);
    function num(cx, cy, h, sx, dark) {
      g.save(); g.translate(cx, cy); g.scale(sx, 1); g.font = 'italic 900 ' + h + 'px ' + NUM_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (dark) { g.fillStyle = hexCss(tc.dark); g.fillText(s, 0, 0); }
      else { g.lineWidth = h * 0.12; g.strokeStyle = hexCss(pat === 'peto' ? bibEd : tc.dark); g.strokeText(s, 0, 0); g.fillStyle = tc.numFill || '#ffffff'; g.fillText(s, 0, 0); }
      g.restore();
    }
    if (pat === 'peto') {   // peto: dorsal grande detrás y mediano delante, los dos en el color del dorsal del peto
      num(W / 2, beach ? 76 : 70, beach ? 84 : 100, 1.0, false);
      wrap(function (o) { num(o, beach ? 68 : 66, beach ? 52 : 58, 1.2, false); });
    } else {
      num(W / 2, beach ? 70 : 62, beach ? 76 : 92, 1.0, false);
      if (beach) wrap(function (o) { num(o, 52, 56, 1.2, false); });
      else wrap(function (o) { num(o, 58, 44, 1.25, pat === 'diag'); });
    }
    // bajo de la camiseta (ribete fino) y pantalón (playa: malla corta del color de la camiseta)
    g.fillStyle = hexCss(beach ? tc.base : tc.shorts); g.fillRect(0, S, W, TR_R[1] - S + 1);
    g.fillStyle = hexCss(tc.accent); g.fillRect(0, S, W, 5);                                   // cinturilla
    g.fillStyle = hexCss(tc.dark); g.globalAlpha = 0.5; g.fillRect(0, S - 4, W, 4); g.globalAlpha = 1;   // ribete del bajo
    [0.25, 0.75].forEach(function (u) {                                                          // paneles laterales del acento
      var cx = u * W; g.fillStyle = hexCss(tc.accent); g.beginPath(); g.moveTo(cx - 14, S + 5); g.lineTo(cx + 14, S + 5); g.lineTo(cx + 22, TR_R[1] + 1); g.lineTo(cx - 22, TR_R[1] + 1); g.fill();
    });
    g.restore();
  }
  /** Tiras de las extremidades POR COLUMNA (spec §4.1): v = 1 (arranque, fila r0) → v = 0 (punta, fila r1); cada tubo lee su columna
   *  (COL_UP / COL_FORE / COL_TH / COL_SHN; la izquierda espejada). Con el aspecto de hoy el resultado es el de siempre: manga corta
   *  con ribete → piel, antebrazo de piel, pernera con ribete → piel, piel → calcetín del acento con franja; playa: brazos y espinillas
   *  de piel y malla corta. Encima, por capas: interior (térmica / licra), manguitos, brazalete, mallas, calcetines, rodilleras y
   *  escarpines. Tramos [fracción desde el arranque, color]: el mismo redondeo que las tiras de siempre. */
  function paintLimbs(g, tc, X, beach, numV) {
    var W = ATLAS, sk = X.skin, cA = colA(X, tc), cB = colB(X, tc), cU = underHex(X, tc), cS = colSock(X, tc), cB2 = slvB(X, tc), k, c;
    function col(r, su) { return { r: r, x0: Math.min(su[0], su[1]) * W, x1: Math.max(su[0], su[1]) * W, flip: su[0] > su[1] }; }
    function rowOf(c, f) { return c.r[0] + Math.round((c.r[1] - c.r[0] + 1) * f); }
    function band(c, f0, f1, hex) { var h = c.r[1] - c.r[0] + 1; g.fillStyle = hexCss(hex); g.fillRect(c.x0, c.r[0] + Math.round(h * f0), c.x1 - c.x0, Math.ceil(h * (f1 - f0)) + 1); }
    function segs(c, s) { for (var i = 0; i < s.length; i++) band(c, s[i][0], s[i + 1] ? s[i + 1][0] : 1, s[i][1]); }
    /** dibujo libre recortado a la columna entre las fracciones f0..f1: fn(xc, y0, y1, ax, w) en unidades de diseño; ax = unidades
     *  de u por fila a escala real del tubo (radio tr, largo len), para que las formas no salgan aplastadas */
    function draw(c, f0, f1, tr, len, fn) {
      var y0 = rowOf(c, f0), y1 = rowOf(c, f1) + 1, rows = c.r[1] - c.r[0] + 1, ax = ((c.x1 - c.x0) / (2 * PI * tr)) / (rows / len);
      g.save(); g.beginPath(); g.rect(c.x0, y0, c.x1 - c.x0, y1 - y0); g.clip();
      fn((c.x0 + c.x1) / 2, y0, y1, ax, c.x1 - c.x0);
      g.restore();
    }
    // ---- manguitos: cuerpo entre f0 y f1 de una columna (las llamas suben desde abajo: el codo en el brazo, la muñeca en el antebrazo)
    function sleeveFill(c, f0, f1, id, tr, len, part) {
      if (f1 <= f0) return;
      if (id === 'manguito' || id === 'manguitoMedio' || id === 'manguitoBajo') { band(c, f0, f1, cA); return; }
      // ---- WP7: bicolor (brazo cA, antebrazo cB), degradado (de cA en el hombro a cB en la muñeca, en escalones de cómic), estrellas y
      //      con tu número (grande, por fuera del brazo, como un dorsal; en el antebrazo, dos rayas finas)
      if (id === 'manguitoBicolor') {
        band(c, f0, f1, part === 'up' ? cA : cB2);
        if (part === 'up') band(c, Math.max(f0, f1 - 0.05), f1, mixHex(cA, 0x000000, 0.3));   // costura donde cambia de color (junto al codo)
        return;
      }
      if (id === 'manguitoFundido') {   // degradado continuo: de cA a la mitad en el brazo y de la mitad a cB en el antebrazo
        // (ronda 1 de WP7: eran 6 escalones por tramo y se veían bandas posterizadas; ahora un degradado del lienzo, fila a fila, que
        //  el filtrado de la textura suaviza)
        var gy0 = rowOf(c, f0), gy1 = rowOf(c, f1) + 1, i0 = part === 'up' ? 0 : 0.5, gr = g.createLinearGradient(0, gy0, 0, gy1);
        gr.addColorStop(0, hexCss(mixHex(cA, cB2, i0))); gr.addColorStop(0.5, hexCss(mixHex(cA, cB2, i0 + 0.25))); gr.addColorStop(1, hexCss(mixHex(cA, cB2, i0 + 0.5)));
        g.fillStyle = gr; g.fillRect(c.x0, gy0, c.x1 - c.x0, gy1 - gy0);
        return;
      }
      if (id === 'manguitoEstrella') {   // estrellas grandes de cinco puntas al tresbolillo (redondas: u por fila), con filo de tinta
        band(c, f0, f1, cA);
        var stc = lumHex(cA) > 0.6 ? mixHex(tc.dark, INK, 0.2) : 0xf8f8f4, sti = lumHex(cA) > 0.6 ? mixHex(cA, 0x000000, 0.25) : mixHex(cA, 0x000000, 0.5);   // (oscuras sobre un manguito claro)
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var H = y1 - y0, r = w * 0.11, dy = r / ax * 2.3, j = 0, y;
          for (y = y0 + dy * 0.45; y < y1 + r / ax; y += dy, j++) for (var i = -1; i <= 3; i++) {
            var x = xc + (i + (j % 2 ? 0.5 : 0)) * w / 3;
            g.save(); g.translate(x, y); g.scale(1, 1 / ax);
            star(g, 0, 0, r, j * 0.4 + i); g.fillStyle = hexCss(stc); g.fill(); g.strokeStyle = hexCss(sti); g.lineWidth = r * 0.16; g.stroke();
            g.restore();
          }
        });
        return;
      }
      if (id === 'manguitoNumero') {
        band(c, f0, f1, cA);
        if (part !== 'up') { band(c, f0 + (f1 - f0) * 0.18, f0 + (f1 - f0) * 0.24, cB2); band(c, f0 + (f1 - f0) * 0.3, f0 + (f1 - f0) * 0.34, cB2); return; }
        // (número blanco con filo oscuro sobre un manguito oscuro o medio; sobre uno claro —el amarillo—, oscuro con filo claro)
        var lt = lumHex(cA) > 0.6, nf = lt ? mixHex(tc.dark, INK, 0.3) : 0xf8f8f4, nk = lt ? mixHex(cA, 0xffffff, 0.5) : mixHex(cA, INK, 0.6), sN = String(numV == null ? 0 : numV);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax) {
          var H = y1 - y0, h = H * 0.96;
          g.save(); g.translate(xc, (y0 + y1) / 2 + H * 0.04); g.scale(c.flip ? -ax : ax, 1);   // (la columna izquierda va espejada)
          g.font = 'italic 900 ' + h + 'px ' + NUM_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
          g.lineWidth = h * 0.16; g.strokeStyle = hexCss(nk); g.strokeText(sN, 0, 0); g.fillStyle = hexCss(nf); g.fillText(sN, 0, 0);
          g.restore();
        });
        return;
      }
      if (id === 'manguitoOro') {      // oro de cómic (WP5, T7; ronda 1: más saturado): sombra tostada detrás, medio dorado y cara amarilla hacia
        // la luz con la raya GOLD_HI y el filo blanco, la línea oscura donde acaba la luz, un reflejo en la sombra, bordes marrones y un destello
        band(c, f0, f1, SLV_GOLD_SH);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var H = y1 - y0, e = Math.max(1, Math.min(2.2, H * 0.07));
          function vband(x, ww, hex) { g.fillStyle = hexCss(hex); g.fillRect(x, y0, ww, H); }
          vband(xc - w * 0.36, w * 0.62, SLV_GOLD);                 // medio (fuera y algo delante)
          vband(xc - w * 0.24, w * 0.3, SLV_GOLD_LT);               // cara que mira a la luz
          vband(xc - w * 0.16, w * 0.1, GOLD_HI);                   // raya de brillo
          vband(xc - w * 0.13, w * 0.025, 0xffffff);
          vband(xc + w * 0.24, w * 0.035, GOLD_DK);                 // donde acaba la luz
          vband(xc + w * 0.4, w * 0.04, mixHex(SLV_GOLD_SH, SLV_GOLD, 0.6));   // reflejo en la sombra
          g.fillStyle = hexCss(GOLD_DK); g.fillRect(c.x0, y0, c.x1 - c.x0, e); g.fillRect(c.x0, y1 - e, c.x1 - c.x0, e);   // bordes
          // destello: estrella de cuatro puntas blanca sobre la raya (redonda: u por fila)
          var sy = y0 + H * 0.38, r = Math.min(w * 0.09, H * 0.3 * ax);
          g.save(); g.translate(xc - w * 0.1, sy); g.scale(1, 1 / ax); g.fillStyle = '#ffffff';
          g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0); g.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
          g.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0); g.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r); g.fill(); g.restore();
        });
        return;
      }
      if (id === 'manguitoRayas') { band(c, f0, f1, cA); for (var f = f0 + 0.05; f < f1 - 0.02; f += 0.1) band(c, f, Math.min(f1, f + 0.05), cB); return; }
      if (id === 'manguitoCuadros') {  // damero de 4 casillas alrededor y casillas cuadradas a lo largo (u propia del tubo)
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var sw = w / 4, sh = Math.max(3, sw / ax), j = 0, y, i;
          for (y = y0; y < y1; y += sh, j++) for (i = 0; i < 4; i++) { g.fillStyle = hexCss((i + j) % 2 ? cB : cA); g.fillRect(c.x0 + i * sw, y, sw + 0.5, sh + 0.5); }
        });
        return;
      }
      if (id === 'manguitoLlamas') {   // llamas del acento (con el corazón más claro) sobre el oscuro del equipo
        band(c, f0, f1, tc.dark);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var H = y1 - y0, n = 8, tw = w / n, hs = [0.62, 0.86, 0.5, 0.95, 0.66, 0.8, 0.54, 0.9];
          function tongues(kk, hex) {
            g.fillStyle = hexCss(hex);
            for (var i = -1; i <= n; i++) {
              var x = c.x0 + (i + 0.5) * tw, h = H * hs[(i + n) % n] * kk;
              g.beginPath(); g.moveTo(x - tw * 0.62, y1); g.quadraticCurveTo(x - tw * 0.2, y1 - h * 0.55, x + tw * 0.12, y1 - h);
              g.quadraticCurveTo(x + tw * 0.05, y1 - h * 0.45, x + tw * 0.62, y1); g.closePath(); g.fill();
            }
          }
          tongues(1, cA); tongues(0.5, mixHex(cA, 0xffe27a, 0.6));
        });
        return;
      }
      if (id === 'manguitoRayos') {    // rayos amarillos sobre el acento: uno grande hacia fuera y otro por detrás
        // (WP5, T3: con un acento amarillo el rayo amarillo no se veía: pasa al oscuro del equipo o a blanco)
        var bolt = pick(0xffd23a, cA, tc);
        band(c, f0, f1, cA);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          var H = y1 - y0, s = H / 10;
          [xc, xc + w / 2 > c.x1 ? xc - w / 2 : xc + w / 2].forEach(function (bx) {
            g.save(); g.translate(bx, y0); g.scale(ax, 1);
            g.fillStyle = hexCss(bolt); g.strokeStyle = hexCss(mixHex(cA, 0x000000, 0.45)); g.lineWidth = 0.35; g.lineJoin = 'miter';
            g.beginPath(); g.moveTo(0.6 * s, 0.4 * s); g.lineTo(2.6 * s, 0.4 * s); g.lineTo(1.0 * s, 4.4 * s); g.lineTo(2.4 * s, 4.4 * s); g.lineTo(-1.6 * s, 9.6 * s);
            g.lineTo(-0.2 * s, 5.6 * s); g.lineTo(-1.6 * s, 5.6 * s); g.closePath(); g.fill(); g.stroke(); g.restore();
          });
        });
        return;
      }
      if (id === 'manguitoMazo') {     // jefe Martillo: oscuro, dos rayas cruzadas por detrás y un mazo de cA hacia fuera
        band(c, f0, f1, MAZO_DK);
        draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
          // medidas en u (alrededor) y filas (a lo largo) con la misma escala física (ax = u por fila): el mazo no sale estirado
          var H = y1 - y0, ink = mixHex(cA, 0x000000, 0.55), bx = xc + w / 2 > c.x1 ? xc - w / 2 : xc + w / 2;
          var hw = 0.36 * w, hh = 0.55 * hw / ax, hl = 1.7 * hh, k = Math.min(1, 0.9 * H / (hh + hl)); hw *= k; hh *= k; hl *= k;
          var top = y0 + (H - hh - hl) / 2, mw = hw * 0.24, lw = Math.max(0.5, 0.05 * hh);
          g.strokeStyle = hexCss(mixHex(MAZO_DK, cA, 0.4)); g.lineWidth = 0.1 * w; g.lineCap = 'butt';      // rayas cruzadas (detrás)
          g.beginPath(); g.moveTo(bx - 0.18 * w, y0); g.lineTo(bx + 0.18 * w, y1); g.moveTo(bx + 0.18 * w, y0); g.lineTo(bx - 0.18 * w, y1); g.stroke();
          g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = hexCss(ink);
          g.fillStyle = hexCss(mixHex(cA, 0xffffff, 0.3)); g.beginPath(); g.rect(xc - mw / 2, top + hh * 0.9, mw, hl); g.fill(); g.stroke();   // mango
          g.fillStyle = hexCss(cA); g.beginPath(); g.rect(xc - hw / 2, top, hw, hh); g.fill(); g.stroke();                                  // cabeza
          g.fillStyle = hexCss(mixHex(cA, 0xffffff, 0.55)); g.fillRect(xc - hw / 2 + hw * 0.08, top + hh * 0.14, hw * 0.84, hh * 0.18);    // brillo
        });
      }
    }
    /** ventosas del pulpo: dos filas de círculos claros con el centro hundido, por toda la vuelta del tubo (redondas: u propia) */
    function suckers(c, f0, f1, tr, len) {
      draw(c, f0, f1, tr, len, function (xc, y0, y1, ax, w) {
        var H = y1 - y0, n = 5, sw = w / n, r = Math.min(sw * 0.3, H * 0.22 * ax), j, i;
        for (j = 0; j < 2; j++) for (i = -1; i <= n; i++) {
          var x = c.x0 + (i + (j ? 0.5 : 0) + 0.25) * sw, y = y0 + H * (j ? 0.7 : 0.3);
          g.fillStyle = hexCss(PULPO_HI); g.beginPath(); g.ellipse(x, y, r, r / ax, 0, 0, PI * 2); g.fill();
          g.fillStyle = hexCss(mixHex(PULPO, 0x000000, 0.25)); g.beginPath(); g.ellipse(x, y, r * 0.45, r * 0.45 / ax, 0, 0, PI * 2); g.fill();
        }
      });
    }
    // ---- calcetines nuevos (WP7), en la columna c de la espinilla con el borde de arriba a la altura top (h sobre el tobillo):
    /** compresión: hasta debajo de la rodilla, canalé vertical, más oscuro hacia el tobillo (la presión) y un puño ancho de contraste */
    function compSock(c, top, sc, st) {
      var hs = Math.min(SHIN - kneeR(X), top), w0c = shoeTopH(X);
      for (var q = 0; q < 3; q++) band(c, legF(hs - 0.03 - q * 0.022), 1, mixHex(sc, 0x000000, 0.07 + q * 0.06));   // escalones de presión
      draw(c, legF(hs), 1, TUBE_LEG * 0.96, SHIN, function (xc, y0, y1, ax, w) {
        g.fillStyle = hexCss(mixHex(sc, 0x000000, 0.4));
        for (var i = 0; i < 10; i++) g.fillRect(c.x0 + (i + 0.5) * w / 10 - w * 0.012, y0, w * 0.024, y1 - y0);   // canalé
      });
      band(c, legF(hs), legF(hs - 0.022), st); band(c, legF(hs - 0.022), legF(hs - 0.027), mixHex(sc, INK, 0.5));       // puño
      band(c, legF(w0c + 0.03), legF(w0c + 0.02), st);                                                                 // franja del tobillo
    }
    /** de lunares (ronda 1 de WP7): hasta debajo de la rodilla, con lunares de contraste de 2,4 cm al tresbolillo (7 por vuelta y una
     *  fila cada 3,2 cm desde el borde), que tapan ≈ 30 % de la espinilla: antes iban a media espinilla, como «media», y con lunares de
     *  4 cm solo asomaba una fila de bultos blancos sobre el tobillo (no se distinguía de «media» ni de cerca). El puño, de contraste. */
    function dotSock(c, top, sc) {
      var dc = onCol(0xf4f4f4, sc, tc), hs = Math.min(SHIN - kneeR(X), top);   // (lunares blancos sobre un calcetín oscuro o medio, oscuros sobre uno claro)
      band(c, legF(hs), legF(hs - 0.012), dc); band(c, legF(hs - 0.012), legF(hs - 0.016), mixHex(sc, 0x000000, 0.3));   // puño
      draw(c, legF(hs - 0.016), 1, TUBE_LEG * 0.96, SHIN, function (xc, y0, y1, ax, w) {
        var rpm = (c.r[1] - c.r[0] + 1) / SHIN, r = 0.012 * rpm * ax, dy = 0.032 * rpm, j = 0, y;   // r en u (redondos), dy en filas
        g.fillStyle = hexCss(dc); g.strokeStyle = hexCss(mixHex(dc, sc, 0.5)); g.lineWidth = 0.6;
        for (y = y0 + 0.014 * rpm; y < y1 + r / ax; y += dy, j++) for (var i = -1; i <= 7; i++) { ell(g, c.x0 + (i + (j % 2 ? 0.5 : 0)) * w / 7, y, r, r / ax); g.fill(); g.stroke(); }
      });
    }
    /** caído (ronda 1 de WP7): calcetín largo arrugado casi hasta la rodilla: ACORDEÓN de rulos gordos (cada uno, sombra ancha
     *  debajo y luz encima, cada 1,5 cm, ondulados) y el borde de arriba ondulado y vuelto, más claro. Antes eran líneas finas sobre un
     *  calcetín liso a la altura de los tobilleros con tobillera: se leía como el tobillero. Ahora la masa es de rayas de sombra. */
    function slouchSock(c, top, sc, above) {
      var dk = mixHex(sc, INK, 0.62), md = mixHex(sc, 0x000000, 0.25), lt = mixHex(sc, 0xffffff, 0.38), w0c = shoeTopH(X);
      draw(c, legF(top + 0.012), 1, TUBE_LEG * 0.96, SHIN, function (xc, y0, y1, ax, w) {
        var rpm = (c.r[1] - c.r[0] + 1) / SHIN;
        function wave(h, amp, ph) {   // curva a la altura h (metros sobre el tobillo), amp en metros
          var yy = rowOf(c, legF(h)), a = amp * rpm; g.beginPath();
          for (var i = 0; i <= 28; i++) { var x = c.x0 + w * i / 28, y = yy + a * Math.sin(i / 28 * PI * 10 + ph); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        }
        g.lineCap = 'round'; g.lineJoin = 'round';
        wave(top, 0.004, 0); g.lineTo(c.x1, y0); g.lineTo(c.x0, y0); g.closePath(); g.fillStyle = hexCss(above); g.fill();   // borde ondulado
        for (var d = 0.011, i = 0; top - d > w0c - 0.01; d += 0.015, i++) {   // rulos: sombra ancha, medio tono y luz encima
          var h = top - d;
          wave(h, 0.003, i * 1.9); g.strokeStyle = hexCss(dk); g.lineWidth = 0.0062 * rpm; g.stroke();
          wave(h + 0.0048, 0.003, i * 1.9); g.strokeStyle = hexCss(lt); g.lineWidth = 0.0026 * rpm; g.stroke();
          wave(h - 0.0045, 0.003, i * 1.9); g.strokeStyle = hexCss(md); g.lineWidth = 0.0024 * rpm; g.stroke();
        }
        wave(top - 0.002, 0.004, 0); g.strokeStyle = hexCss(lt); g.lineWidth = 0.005 * rpm; g.stroke();   // el borde vuelto, claro
        wave(top + 0.0012, 0.004, 0); g.strokeStyle = hexCss(INK); g.lineWidth = 0.0016 * rpm; g.stroke();
      });
    }
    // ---- manguitos: puño de la muñeca a partir de la fracción f (con la térmica debajo, el manguito acaba antes y asoma la térmica)
    function cuff(c, id, f) { band(c, f, f + 0.09, id === 'manguitoOro' ? GOLD_DK : id === 'manguitoLlamas' || id === 'manguitoMazo' ? cA : SLV_AB[id] ? cuffHex(cB2) : cB); }
    /** kinesio de verdad (ronda 1 de WP5): cinta estrecha que sigue el músculo, como trazo con las puntas redondas por los puntos pts
     *  ([fracción a lo largo, du]: du = 0 fuera, + delante, − detrás, en vueltas del brazo) y de ancho wm metros: borde oscuro, cinta y
     *  un brillo por el centro. Se dibuja en metros reales (u por fila) para que la cinta no salga aplastada y se repite a ±1 vuelta
     *  por si cruza la costura de la columna. */
    /** costura lateral por fuera del tubo (du = 0, y repetida a ±1 vuelta): una tira de 1,2 cm a lo largo de toda la columna */
    function sideSeam(c, len, hex) {
      draw(c, 0, 1, TUBE_ARM, len, function (xc, y0, y1, ax) {
        var hw = Math.max(1.5, 0.006 * ax * (y1 - y0) / len);
        g.fillStyle = hexCss(hex); [-1, 0, 1].forEach(function (o) { g.fillRect(xc + o * (c.x1 - c.x0) - hw, y0, 2 * hw, y1 - y0); });
      });
    }
    function kTape(c, len, pts, wm, kc) {
      draw(c, 0, 1, TUBE_ARM, len, function (xc, y0, y1, ax, w) {
        var rpm = (y1 - y0) / len, uw = w / ax;   // filas por metro y una vuelta del brazo en «filas»
        g.save(); g.translate(xc, y0); g.scale(ax, 1); g.lineCap = 'round'; g.lineJoin = 'round';
        function path(o) { g.beginPath(); pts.forEach(function (p, i) { var x = p[1] * uw + o, y = p[0] * (y1 - y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); }
        [[mixHex(kc, 0x000000, 0.38), 1], [kc, 0.74], [mixHex(kc, 0xffffff, 0.4), 0.16]].forEach(function (L) {
          g.strokeStyle = hexCss(L[0]); g.lineWidth = wm * rpm * L[1];
          [-uw, 0, uw].forEach(function (o) { path(o); g.stroke(); });
        });
        g.restore();
      });
    }
    // color de lo que hay debajo del brazalete (fracción 0,49-0,83 del brazo): el manguito, la camiseta interior o la piel
    function armBg(arm, lsl) {
      if (ARMS[arm] && arm !== 'kinesio' && !SLV_FORE_ONLY[arm]) return arm === 'manguitoOro' ? SLV_GOLD : arm === 'manguitoLlamas' ? tc.dark : arm === 'manguitoMazo' ? MAZO_DK : cA;
      return lsl ? cU : sk;
    }
    // ---- brazos ([k] 0 izquierdo, 1 derecho): f0 = donde acaba la manga (o la licra) y empieza la piel
    // WP5 (T1): la licra de playa y la térmica de pista son de MANGA LARGA en cB por todo el brazo y el antebrazo, con un puño acanalado
    // más oscuro en la muñeca (antes la licra acababa debajo de la bola del hombro y solo se veían dos hombreras negras)
    // WP7: licra de manga CORTA (playa): la manga cB hasta media altura del brazo con un ribete más oscuro; el antebrazo, de piel
    var lsl = beach ? X.under === 'licra' : X.under === 'termica', cuffU = cuffHex(cU);
    for (k = 0; k < 2; k++) {
      var arm = k ? X.armR : X.armL, cu = col(ARM_R, COL_UP[k]), cf = col(ARM_R, COL_FORE[k]), f0 = beach ? 0.14 : 0.46, sl = ARMS[arm] && arm !== 'kinesio';
      if (beach && lsl) { segs(cu, [[0, cU]]); f0 = 0; }                                                // licra: manga larga
      else if (beach && X.under === 'licraCorta') { segs(cu, [[0, cU], [0.56, cuffU], [0.64, sk]]); f0 = 0.64; }   // licra de manga corta
      else if (beach) segs(cu, [[0, sk]]);                                                            // brazo desnudo
      else if (lsl) segs(cu, [[0, tc.base], [0.38, tc.accent], [0.46, cU]]);                          // manga corta → térmica
      else segs(cu, [[0, tc.base], [0.38, tc.accent], [0.46, sk]]);                                   // manga corta con ribete → piel
      if (lsl) { segs(cf, [[0, cU], [0.85, cuffU], [0.97, cU]]); band(cf, 0.885, 0.9, cU); band(cf, 0.925, 0.94, cU); }   // hasta la muñeca, puño acanalado
      // la licra de playa (manga larga), con la costura lateral de color por fuera del brazo, como la del costado: se distingue de la
      // térmica de pista, que es lisa con el puño acanalado
      if (beach && lsl) { var lsc = pick(cA, cU, tc); sideSeam(cu, UPPER, lsc); sideSeam(cf, FORE, lsc); }
      else if (!lsl) segs(cf, [[0, sk]]);                                                             // antebrazo de piel
      if (arm === 'kinesio') {
        // kinesio (WP5, T5; ronda 1): cinta estrecha a lo largo del músculo, no parches. En el brazo, una «Y» sobre el deltoides (el tallo
        // por fuera desde el codo y las dos colas que se abren hacia delante y hacia atrás: de espaldas en el partido se ve la de atrás) y
        // en el antebrazo, una tira larga por fuera y detrás, del codo a la muñeca. Del acento, o lo que se distinga de lo de debajo
        var kc = pick(cA, lsl ? cU : sk, tc, 130), ka = Math.max(f0, 0.14) + 0.06;
        kTape(cu, UPPER, [[0.9, -0.03], [0.7, -0.02], [ka + 0.03, 0.22]], 0.04, kc);   // tallo y cola de delante
        kTape(cu, UPPER, [[0.7, -0.02], [ka, -0.28]], 0.04, kc);                     // cola de detrás
        kTape(cf, FORE, [[0.12, -0.16], [0.5, -0.24], [0.84, -0.18]], 0.044, kc);   // antebrazo
      } else if (SLV_UP_ONLY[arm]) {   // WP7: manguito MEDIO: del ribete de la manga al codo y un palmo de antebrazo, con su puño cB
        sleeveFill(cu, f0, 1, arm, TUBE_ARM, UPPER, 'up');
        band(cu, f0, f0 + 0.07, cB2);                                                                 // puño de arriba (bajo el ribete)
        sleeveFill(cf, 0, 0.2, arm, TUBE_ARM, FORE, 'fore'); band(cf, 0.2, 0.29, cB2);
      } else if (SLV_FORE_ONLY[arm]) { // WP7: manguito de ANTEBRAZO: asoma por encima del codo y baja hasta la muñeca
        band(cu, 0.74, 0.8, cB2); sleeveFill(cu, 0.8, 1, arm, TUBE_ARM, UPPER, 'up');
        var fa = lsl && !beach ? 0.7 : 0.88;
        sleeveFill(cf, 0, fa - 0.09, arm, TUBE_ARM, FORE, 'fore'); band(cf, fa - 0.09, fa, cB2);
      } else if (sl) {
        sleeveFill(cu, f0, 1, arm, TUBE_ARM, UPPER, 'up');
        // con la térmica debajo el manguito acaba antes y asoma el puño de la térmica (capas: se ven las dos prendas)
        var fe = lsl && !beach ? 0.7 : 0.88;
        sleeveFill(cf, 0, fe - 0.09, arm, TUBE_ARM, FORE, 'fore'); cuff(cf, arm, fe - 0.09);
      }
      if (k === 0 && X.band === 'capitan') {   // brazalete con filetes y la «C» hacia fuera (volteada: la columna va espejada)
        // WP5: alrededor de todo el brazo, más alto (0,49-0,83: la bola del codo solo tapa el tubo desde ≈ 0,85 por fuera; en la ronda 1
        // subió de 0,51-0,8 porque en el primer plano se quedaba en 1,2 %) y separado del ribete de la manga (acaba en 0,46) por una raya
        // de piel; del acento salvo que se pierda contra lo de debajo (brazalete rojo sobre manguito rojo)
        // (pulido: en el manguito bicolor o fundido, que también se separe de la mitad de abajo; si no, el «pick» contra cA daba el
        //  oscuro de la equipación, igual que el antebrazo, y el brazalete se fundía con él y escondía las dos mitades)
        // (pulido 2: en el bicolor, el brazalete entero tapaba la mitad de arriba y de ella quedaba una raya: con él, algo más estrecho y
        //  centrado, asoma el color de arriba por encima y por debajo. Solo en ese manguito; lookvis mide el brazalete sin manguito)
        var b0 = arm === 'manguitoBicolor' ? 0.56 : 0.49, b1 = arm === 'manguitoBicolor' ? 0.76 : 0.83, bc = SLV_AB[arm] ? pick2(cA, arm === 'manguitoFundido' ? mixHex(cA, cB2, 0.3) : cA, cB2, tc) : pick(cA, armBg(arm, lsl), tc);
        var bdk = mixHex(bc, 0x000000, 0.38);
        band(cu, b0, b1, bc);
        draw(cu, b0, b1, TUBE_ARM, UPPER, function (xc, y0, y1, ax) {
          var H = y1 - y0, e = Math.max(0.8, H * 0.12), ink = lumHex(bc) > 0.55 ? faceInk(tc) : 0xffffff;
          g.fillStyle = hexCss(bdk); g.fillRect(cu.x0, y0, cu.x1 - cu.x0, e); g.fillRect(cu.x0, y1 - e, cu.x1 - cu.x0, e);
          g.save(); g.translate(xc, (y0 + y1) / 2); g.scale(cu.flip ? -ax : ax, 1);
          g.strokeStyle = hexCss(ink); g.lineWidth = H * 0.17; g.lineCap = 'round';
          g.beginPath(); g.arc(0, 0, H * 0.25, PI * 0.28, PI * 1.72); g.stroke(); g.restore();
        });
      }
    }
    // ---- muslos (WP4: la malla corta en su color —cB o uno que se distinga del pantalón—; las rodilleras altas siguen por fuera de la
    //      bola, así se ven. Ronda 1: con rodillera, la malla corta pasa por debajo y acaba en la espinilla con el bajo del acento: de
    //      espaldas en el partido el pantalón tapa el muslo entero y no se veía nada)
    var kr = kneeR(X), tiH = tightsHex(X, tc, beach), pad = padHex(X, tc), tLg = tightsOf(X, tc);
    for (k = 0; k < 2; k++) {
      c = col(TH_R, COL_TH[k]);
      var fs = beach ? 0.36 : 0.48;
      segs(c, beach ? [[0, tc.base], [0.3, tc.accent], [0.36, sk]] : [[0, tc.shorts], [0.42, tc.accent], [0.48, sk]]);   // malla corta / pernera → piel
      if (X.legs === 'malla') band(c, fs, 1, tiH);   // malla corta: hasta la bola de la rodilla (y, con rodillera, asoma por debajo)
      else if (kneeTights(X, k)) band(c, fs, 1, tLg);   // (larga, 3/4 y la de un lado —solo la pierna izquierda—, WP7)
      if (KNEE_HI[X.knees]) {
        var ft0 = thighF(kr + padUpH(X));
        band(c, ft0, 1, X.knees === 'rodiPulpo' ? PULPO : pad);
        if (X.knees === 'rodiPulpo') suckers(c, ft0, thighF(kr - 0.01), TUBE_LEG, THIGH);
      }
    }
    // WP7: la rodillera de dos colores y la de un lado asoman un poco por encima y por debajo de la bola (una funda corta, pintada): de
    // espaldas en el partido la bola sola daba 7 px; la de color lleva además la franja de cA en los dos bordes
    // (las cortas también, sin canto de color: de espaldas en el partido la bola sola daba 8 px y el umbral es 9)
    function sleevePad(c, thigh, k) {
      if (X.knees === 'cortas' && !kneeTights(X, k)) {
        if (thigh) band(c, thighF(kr + 0.022), 1, pad);   // (solo por encima: por debajo se comía la espinilla y parecían unas mallas)
        return;
      }
      if (!(X.knees === 'rodillerasColor' || (X.knees === 'rodilleraUna' && k !== 1))) return;
      // (la de color: funda lisa con solo el canto oscuro, que la almohadilla de color se lea sola; ronda 1 de WP7)
      var kst = X.knees === 'rodillerasColor' ? mixHex(pad, INK, lumHex(pad) < 0.2 ? 0 : 0.5) : onCol(tc.accent, pad, tc);
      if (thigh) { band(c, thighF(kr + 0.02), 1, pad); if (X.knees !== 'rodillerasColor' || kst !== pad) band(c, thighF(kr + 0.02), thighF(kr + 0.016), kst); }
      else { band(c, 0, legF(SHIN - kr - 0.026), pad); if (X.knees !== 'rodillerasColor' || kst !== pad) band(c, legF(SHIN - kr - 0.022), legF(SHIN - kr - 0.026), kst); }
    }
    for (k = 0; k < 2; k++) sleevePad(col(TH_R, COL_TH[k]), true, k);
    // ---- espinillas: todo por ALTURA sobre el tobillo (legF): el zapatón tapa lo de abajo y la bola de la rodilla lo de arriba
    var w0 = shoeTopH(X), w1 = SHIN - kr, brace = hasBrace(X, beach), cSk = sockHex(X, tc);
    for (k = 0; k < 2; k++) {
      c = col(SHN_R, COL_SHN[k]);
      var sock = beach ? '' : X.socks, sc = cSk, top = sockTopH(sock, k, brace, w0, w1, X), f;
      if (sock === 'desparejados') {   // el alto (k = 0) del color que más se distingue de la piel (blanco sobre piel clara no se ve); el corto, del otro
        var dHi = hexDist(cSk, sk) >= hexDist(cB, sk) ? cSk : cB;
        sc = k === 0 ? dHi : dHi === cSk ? cB : cSk;
        if (sc === cB && hexDist(cB, cSk) < 120) sc = onCol(tc.accent, cSk, tc);   // que se vean DOS colores
      }
      segs(c, [[0, sk]]);                                                                                          // piel
      // malla larga: hasta media espinilla; si el calcetín acaba más abajo, la malla baja hasta él (sin franja de piel entre los dos)
      // malla corta: con una rodillera que tapa la bola (cortas, altas, pulpo), asoma 2 cm por debajo, con el bajo del acento (la larga
      // baja hasta media espinilla); con la rodilla desnuda (bajadas, sin, playa) acaba encima de ella: malla · rodilla · malla no
      if (X.legs === 'malla' && (padOn(X, k) || X.knees === 'rodiPulpo')) {
        var mh = SHIN - kneeVis(X, TUBE_LEG * 0.96) - 0.02;
        // (bajo oscuro si la malla es del color del calcetín: con uno claro se leía como una raya más del calcetín)
        band(c, 0, legF(mh), tiH); band(c, legF(mh + 0.008), legF(mh), !beach && X.socks && hexDist(tiH, cSk) < 150 ? mixHex(tiH, INK, 0.6) : onCol(tc.accent, tiH, tc));
      }
      if (kneeTights(X, k)) {
        // WP7: la 3/4 acaba 3 cm por debajo de la rodilla (con el bajo del acento: se distingue de la larga) y la de un lado baja hasta el
        // calcetín o el tobillo (una pierna entera de color frente a la otra de piel: de espaldas se ve de lejos)
        var m34 = X.legs === 'malla34', mb = m34 ? SHIN - kneeVis(X, TUBE_LEG * 0.96) - 0.03 : X.legs === 'mallaUnLado' ? w0 - 0.01 : SHIN * 0.5;
        if (sock && top < mb) mb = top;
        band(c, 0, legF(mb), tLg); band(c, legF(mb + (m34 ? 0.012 : 0.009)), legF(mb), m34 ? onCol(tc.accent, tLg, tc) : mixHex(tLg, 0x000000, 0.3));
      }
      if (sock) {
        // rayas: blancas u oscuras, las que de lejos (mezcladas con el calcetín) se alejen más de la piel (rojo + blanco = rosa = piel clara)
        var st = onCol(tc.base, sc, tc), rD = mixHex(tc.dark, INK, 0.2), rib = hexDist(mixHex(sc, 0xf4f4f4, 0.4), sk) >= hexDist(mixHex(sc, rD, 0.4), sk) ? 0xf4f4f4 : rD;
        // con malla larga lo que toca el calcetín es la malla, no la piel: rayas que no sean de su color (ronda 2: rayas negras + malla
        // negra = la malla se leía como una raya más del calcetín)
        if (kneeTights(X, k) && hexDist(rib, tLg) < 150) rib = rib === 0xf4f4f4 ? rD : 0xf4f4f4;
        band(c, legF(top), 1, sc);
        // elegido a mano y del color del empeine: una raya oscura que separa el calcetín de la zapatilla (algo alta: por delante la
        // puntera tapa ≈ 2 cm por encima del borde)
        if (!brace && hexDist(sc, shoeUp(X)) < 150) band(c, legF(w0 + 0.03), legF(w0 + 0.019), mixHex(sc, 0x000000, 0.45));
        if (sock === 'tobilleros') band(c, legF(top), legF(top - 0.016), mixHex(sc, 0x000000, 0.28));             // puño vuelto, más oscuro
        else if (sock === 'media') { band(c, legF(top), legF(top - 0.007), mixHex(sc, 0x000000, 0.22)); band(c, legF(top - 0.016), legF(top - 0.03), st); }
        else if (sock === 'altos') { var ht = Math.min(w1, top); band(c, legF(ht - 0.012), legF(ht - 0.024), st); band(c, legF(ht - 0.034), legF(ht - 0.046), st); }
        else if (sock === 'altosRayas') { for (f = Math.min(w1, top) - 0.008; f > w0 - 0.01; f -= 0.024) band(c, legF(f), legF(f - 0.011), rib); }   // (desde el borde: con malla larga el calcetín acaba antes)
        else if (sock === 'desparejados') band(c, legF(top), legF(top - 0.008), mixHex(sc, 0x000000, 0.28));
        else if (sock === 'compresion') compSock(c, top, sc, st);
        else if (sock === 'lunares') dotSock(c, top, sc);
        else if (sock === 'caido') slouchSock(c, top, sc, kneeTights(X, k) ? tLg : sk);
      }
      if (KNEE_HI[X.knees]) {
        var fb = legF(SHIN - kr - padDnH(X));
        band(c, 0, fb, X.knees === 'rodiPulpo' ? PULPO : pad);
        if (X.knees === 'rodiPulpo') suckers(c, legF(SHIN - kr + 0.01), fb, TUBE_LEG * 0.96, SHIN);
      }
      sleevePad(c, false, k);
      if (beach && X.ankle === 'escarpines') band(c, 0.85, 1, cS);
      // WP7: escarpines de neopreno (caña alta oscura con el ribete de cA) y vendaje de tobillo (esparadrapo en ocho, del pie a 7 cm)
      else if (beach && X.ankle === 'escarpinesNeo') { var na = pick(cA, NEO, tc); band(c, legF(0.074), 1, NEO); band(c, legF(0.074), legF(0.062), na); band(c, legF(0.03), legF(0.024), mixHex(NEO, 0xffffff, 0.12)); }
      else if (beach && X.ankle === 'vendajeTob') {
        // (ronda 1 de WP7: sobre piel clara el blanco —ni el frío— no se veía: 7 px en LOD0 lejos; ahora esparadrapo NEGRO con las
        //  vueltas claras sobre piel clara o media y blanco con las vueltas oscuras sobre piel oscura: ankleTape)
        var tp = ankleTape(sk), tl = tp === TAPE ? mixHex(tp, INK, 0.3) : mixHex(tp, 0xffffff, 0.42);
        band(c, legF(0.07), 1, tp); band(c, legF(0.07), legF(0.064), tl);
        draw(c, legF(0.064), 1, TUBE_LEG * 0.96, SHIN, function (xc, y0, y1, ax, w) {   // vueltas en ocho: dos diagonales que se cruzan por fuera
          g.strokeStyle = hexCss(tl); g.lineWidth = 2;
          [-1, 1].forEach(function (d) { for (var o = -2; o <= 2; o++) { g.beginPath(); g.moveTo(xc + o * w / 3 - d * w * 0.18, y0); g.lineTo(xc + o * w / 3 + d * w * 0.18, y1); g.stroke(); } });
        });
      }
    }
  }

  // ---------- HOJA DE CARAS ----------
  // Ojos+cejas (8 celdas): 0 neutra · 1 parpadeo · 2 concentrado (párpado en diagonal, cejas en V) · 3 esfuerzo (apretados > <) ·
  //   4 alegría (^ ^ cerrados de risa) · 5 pena (párpados caídos, cejas hacia arriba por dentro) · 6 sorpresa (redondos enormes,
  //   pupila chica, cejas altas) · 7 grito/rabia (abiertos, cejas en V muy bajas).
  // Bocas (8 celdas): 0 neutra · 1 sonrisa grande con dientes · 2 grito en O · 3 dientes apretados · 4 pena · 5 «o» chica ·
  //   6 sonrisa con lengua · 7 línea tensa (concentración).
  var EXPR = { neutra: [0, 0], concentrado: [2, 7], esfuerzo: [3, 3], grito: [7, 2], alegria: [4, 1], pena: [5, 4], sorpresa: [6, 5], lengua: [4, 6] };
  function faceInk(tc) { return mixHex(tc.dark, INK, 0.55); }
  function faceHalo(L) { var lu = lumHex(L.skin); if (lu >= 0.42) return null; return hexCss(mixHex(L.skin, 0xffe6d2, clamp(0.38 + (0.42 - lu) * 1.6, 0.38, 0.6))); }
  /** Celda: recorte y transformación de metros del hueso de la cabeza (X, Y) a píxeles. */
  function faceCell(g, x0, y0, w, h, dxM, dy0, dy1, fn) {
    var X0 = -dxM * HEAD_RX, X1 = dxM * HEAD_RX, Y0 = HEAD_C + dy0 * HEAD_RY, Y1 = HEAD_C + dy1 * HEAD_RY;
    var a = (w - 2 * F_PAD) / (X1 - X0), d = -(h - 2 * F_PAD) / (Y1 - Y0);
    g.save(); g.beginPath(); g.rect(x0 + 1, y0 + 1, w - 2, h - 2); g.clip();
    g.setTransform(a * PXK, 0, 0, d * PXK, (x0 + F_PAD - a * X0) * PXK, (y0 + F_PAD - d * Y1) * PXK);
    g.translate(0, HEAD_C); g.scale(FK, FK); g.translate(0, -HEAD_C0);   // rasgos de v1 → cabeza activa (ojos y boca en proporción)
    g.lineCap = 'round'; g.lineJoin = 'round';
    fn();
    g.restore();
  }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, PI * 2); }
  function paintFace(g, tc, L, beach) {
    g.save();
    g.fillStyle = hexCss(L.skin); g.fillRect(0, FE_Y - 2, ATLAS, ATLAS - FE_Y + 2);
    var i;
    for (i = 0; i < 8; i++) faceCell(g, (i & 3) * FE_W, FE_Y + (i >> 2) * FE_H, FE_W, FE_H, FE_DX, FE_DY0, FE_DY1, function () { paintEyes(g, i, L, tc, beach); });
    for (i = 0; i < 8; i++) faceCell(g, i * FM_W, FM_Y, FM_W, FM_H, FM_DX, FM_DY0, FM_DY1, function () { paintMouth(g, i, L, tc); });
    g.restore();
  }
  // Pintura de mejilla, marcas, gafas y barbas (Vestuario; 1.18, WP3 del plan). Las láminas de ojos (dy SPLIT_DY..0,64) y de boca
  // (−0,92..SPLIT_DY) ya NO se solapan: se tocan en SPLIT_DY (antes compartían la franja −0,36..−0,30 a la misma distancia y lo que se
  // pintaba ahí parpadeaba; por eso la pintura y las marcas eran diminutas, metidas bajo los discos de los ojos). Ahora todo lo de
  // mejilla y nariz se pinta en las DOS hojas con las mismas coordenadas (metros de la cabeza de v1) y cada una enseña su mitad:
  // decorClip recorta por encima (celdas de ojos) o por debajo (celdas de boca) de SPLIT_Y. Las gafas quedan enteras en la de ojos.
  // (los rasgos que tocaban la franja se han ajustado: la O del grito y los ojos de la sorpresa acaban justo en SPLIT_Y)
  var SPLIT_Y = HEAD_C0 + SPLIT_DY * HEAD_RY0;
  function decorClip(g, part) { g.beginPath(); if (part === 'eye') g.rect(-0.3, SPLIT_Y, 0.6, 0.4); else g.rect(-0.3, -0.2, 0.6, SPLIT_Y + 0.2); g.clip(); }
  function star(g, x, y, r, rot) {
    g.beginPath();
    for (var i = 0; i < 10; i++) { var a = rot + i * PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.sin(a) * rr, y + Math.cos(a) * rr); }
    g.closePath();
  }
  function rrect(g, x, y, w, h, r) {   // rectángulo redondeado centrado en (x, y)
    var x0 = x - w / 2, y0 = y - h / 2; r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x0 + w - r, y0); g.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); g.lineTo(x0 + w, y0 + h - r);
    g.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); g.lineTo(x0 + r, y0 + h); g.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); g.lineTo(x0, y0 + r);
    g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath();
  }
  /** Pintura de cara (ranura paint) en la mejilla, GRANDE (se lee en el primer plano en las dos pieles): zinc (banda de crema neón
   *  por la nariz y los pómulos), rayas negras (2 × 6 cm bajo cada ojo, con borde claro en piel oscura), rayas del equipo y
   *  estrella del acento en el centro de la mejilla. part: 'eye' | 'mouth' (la mitad que toca a esa hoja). */
  function paintPaint(g, part, L, tc) {
    var s, k, p = L.paint, halo = faceHalo(L);
    if (!p) return;
    g.save(); decorClip(g, part);
    if (p === 'zinc') {   // banda que cruza la nariz y sube por los pómulos, más fina sobre la nariz, con el borde de abajo irregular
      var N = 24, x, i, top = [], bot = [];
      for (i = 0; i <= N; i++) {
        x = -0.152 + 0.304 * i / N;
        // (revisión final: subida al puente y los pómulos, justo bajo los ojos; a la altura de la nariz quedaba encima de la boca de
        // esta cara sin nariz y se leía como un bigote blanco, sobre todo en piel oscura)
        var yc = 0.1475 + 0.42 * x * x, h = 0.0062 + 0.0058 * sstep(0.02, 0.09, Math.abs(x));
        top.push([x, yc + h]); bot.push([x, yc - h - 0.0022 * Math.sin(i * 2.3) * sstep(0.03, 0.08, Math.abs(x))]);
      }
      g.beginPath(); g.moveTo(top[0][0], top[0][1]);
      for (i = 1; i <= N; i++) g.lineTo(top[i][0], top[i][1]);
      for (i = N; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
      g.closePath(); var zc = zincHex(tc, L.skin); g.fillStyle = hexCss(zc); g.fill();
      if (zc === ZINC_WHITE && lumHex(L.skin) > 0.55) { g.strokeStyle = 'rgba(70,96,128,0.6)'; g.lineWidth = 0.0035; g.stroke(); }   // filo frío: la crema blanca se separa de la piel clara
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.0035; g.lineCap = 'round';   // brillo de la crema
      for (s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * 0.07, 0.1475 + 0.42 * 0.0049 + 0.004); g.lineTo(s * 0.125, 0.1475 + 0.42 * 0.0156 + 0.005); g.stroke(); }
    } else if (p === 'rayas') {            // «eye black»: una franja negra de 2 × 6 cm bajo cada ojo, algo inclinada hacia el rabillo
      for (s = -1; s <= 1; s += 2) {
        // (bajo el RABILLO de fuera, en el pómulo, 4 cm por encima de la boca: en el centro de la mejilla quedaban a la altura de
        // las comisuras y, con la barba de tres días, parecían un bigote)
        // (revisión final: más arriba y más corta por el lado de la nariz, pegada al párpado de abajo y subiendo hacia la sien: de 3/4
        // la franja de cerca, larga y baja, quedaba junto a la sonrisa y se leía como un bigote negro)
        // (y como MEDIA LUNA que abraza el ojo por abajo y por fuera, a 3 mm del blanco: se ve entera —la franja recta quedaba medio
        // tapada por el ojo y no llegaba al 1,5 % del primer plano— y no baja hacia la boca)
        g.save(); g.translate(s * EYE_X, EYE_Y); g.scale(s, 1);
        var a0 = -1.5, a1 = 0.3;
        g.beginPath(); g.ellipse(0, 0, EYE_RX + 0.027, EYE_RY + 0.012, 0, a0, a1, false); g.ellipse(0, 0, EYE_RX + 0.003, EYE_RY + 0.003, 0, a1, a0, true); g.closePath();
        if (halo) { g.strokeStyle = halo; g.lineWidth = 0.006; g.stroke(); }
        g.fillStyle = '#17161d'; g.fill();
        g.restore();
      }
    } else if (p === 'rayasEq') {          // dos franjas por lado (base y acento del equipo) con filo de tinta: se leen sobre cualquier piel
      for (s = -1; s <= 1; s += 2) for (k = 0; k < 2; k++) {
        g.save(); g.translate(s * (0.096 + k * 0.004), 0.1335 - k * 0.0145); g.rotate(s * 0.13);
        rrect(g, 0, 0, 0.054, 0.0115, 0.004);
        g.fillStyle = hexCss(k ? tc.accent : tc.base); g.fill();
        g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.0022; g.stroke();
        g.restore();
      }
    } else if (p === 'estrella') {         // estrella del acento en el centro de la mejilla izquierda del muñeco (derecha de la imagen)
      star(g, 0.116, 0.106, 0.035, 0.2);
      if (halo) { g.strokeStyle = halo; g.lineWidth = 0.008; g.stroke(); }
      g.fillStyle = hexCss(colA(L, tc)); g.fill();
      g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.0035; g.lineJoin = 'round'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)'; ell(g, 0.108, 0.117, 0.006, 0.004, -0.5); g.fill();
    } else if (p === 'pinturaEquipo') {   // WP7 (ronda 1): MEDIA CARA de afición: la mitad izquierda del muñeco, de la frente a la mandíbula,
      // del color del equipo que más se distinga de la piel, con una franja del otro color por el centro de la cara y filo de tinta.
      // (antes eran dos parches en las mejillas y, con el kit blanco, la franja blanca desaparecía sobre la piel clara)
      // (el primero de base, acento y oscuro que se aleje ≥ 200 de la piel —el rojo del kit blanco, el amarillo del marino—; si no, el que más)
      var cc = [tc.base, tc.accent, tc.dark].filter(function (h) { return typeof h === 'number'; }), cb1 = -1, cb2, bd = -1;
      cc.forEach(function (h) { var d = hexDist(h, L.skin); if (cb1 < 0 && d >= 200) cb1 = h; });
      if (cb1 < 0) cc.forEach(function (h) { var d = hexDist(h, L.skin); if (d > bd) { bd = d; cb1 = h; } });
      cb2 = cc.filter(function (h) { return h !== cb1 && hexDist(h, cb1) >= 120; })[0];
      if (typeof cb2 !== 'number') cb2 = lumHex(cb1) > 0.5 ? NEUTRAL_DK : 0xf4f4f4;
      var half = function () {
        g.beginPath(); g.moveTo(0.004, 0.345); g.lineTo(0.12, 0.345); g.quadraticCurveTo(0.2, 0.33, 0.2, 0.2); g.quadraticCurveTo(0.2, 0.07, 0.15, 0.03);
        g.quadraticCurveTo(0.1, -0.005, 0.004, 0.0); g.closePath();
      };
      half(); if (halo) { g.strokeStyle = halo; g.lineWidth = 0.008; g.stroke(); }
      half(); g.fillStyle = hexCss(cb1); g.fill();
      g.save(); half(); g.clip(); g.fillStyle = hexCss(cb2); g.fillRect(0.004, -0.01, 0.022, 0.37); g.restore();   // franja del centro
      half(); g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.0035; g.lineJoin = 'round'; g.stroke();
      g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.0025; g.beginPath(); g.moveTo(0.026, 0.345); g.lineTo(0.026, 0.0); g.stroke();
    } else if (p === 'rayoOjo') {   // WP7: rayo del acento que cruza el ojo derecho del muñeco (de la ceja a la mejilla), con filo de tinta y brillo
      // (por el rabillo de fuera: el blanco del ojo, que va encima, no lo tapa)
      var RY = [[-0.07, 0.336], [-0.118, 0.336], [-0.156, 0.198], [-0.13, 0.198], [-0.146, 0.062], [-0.094, 0.218], [-0.12, 0.218]];
      var bolt = function () { g.beginPath(); RY.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); };
      bolt(); if (halo) { g.strokeStyle = halo; g.lineWidth = 0.01; g.stroke(); }
      g.fillStyle = hexCss(colA(L, tc)); g.fill();
      g.strokeStyle = hexCss(faceInk(tc)); g.lineWidth = 0.004; g.lineJoin = 'miter'; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.004; g.beginPath(); g.moveTo(-0.112, 0.325); g.lineTo(-0.142, 0.212); g.stroke();
    }
    g.restore();
  }
  /** Marcas (ranura marks), grandes: pecas (15 puntos de 8 mm por la nariz y los pómulos), tirita en X sobre el pómulo y tira nasal
   *  del acento en el puente de la nariz. part como en paintPaint. */
  var PECAS = [[0.082, 0.129, 1], [0.099, 0.119, 0.9], [0.117, 0.131, 1.05], [0.091, 0.106, 0.85], [0.124, 0.114, 1], [0.108, 0.098, 0.85], [0.136, 0.126, 0.8], [0.016, 0.131, 0.8]];
  function paintMarks(g, part, L, tc) {
    var m = L.marks, s, i, halo = faceHalo(L), ink = hexCss(faceInk(tc));
    if (!m) return;
    g.save(); decorClip(g, part);
    if (m === 'pecas') {
      g.fillStyle = hexCss(lumHex(L.skin) < 0.42 ? mixHex(L.skin, 0x1a0a04, 0.6) : mixHex(L.skin, 0x6a3418, 0.5));
      for (s = -1; s <= 1; s += 2) for (i = 0; i < PECAS.length; i++) {
        var P = PECAS[i]; if (i === PECAS.length - 1 && s < 0) { ell(g, -0.01, 0.124, 0.0066, 0.006); g.fill(); continue; }
        ell(g, s * P[0], P[1], 0.0085 * P[2], 0.0076 * P[2]); g.fill();
      }
    } else if (m === 'tirita') {   // tirita en X (dos tiras blancas cruzadas con su almohadilla) en el pómulo derecho del muñeco
      g.save(); g.translate(-0.112, 0.116);
      for (i = -1; i <= 1; i += 2) {
        g.save(); g.rotate(i * 0.62);
        rrect(g, 0, 0, 0.104, 0.025, 0.006);
        if (halo) { g.strokeStyle = halo; g.lineWidth = 0.005; g.stroke(); }
        g.fillStyle = '#e8f0fa'; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.004; g.stroke();
        g.strokeStyle = 'rgba(120,150,200,0.6)'; g.lineWidth = 0.0024; g.beginPath(); g.moveTo(-0.044, -0.0055); g.lineTo(0.044, -0.0055); g.moveTo(-0.044, 0.0055); g.lineTo(0.044, 0.0055); g.stroke();
        g.restore();
      }
      rrect(g, 0, 0, 0.026, 0.026, 0.005); g.fillStyle = '#e9d3b4'; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.0018; g.stroke();
      g.restore();
    } else if (m === 'tiraNasal') {   // tira nasal del acento sobre el puente de la nariz, entre los ojos
      var cA = colA(L, tc);
      g.beginPath(); g.moveTo(-0.052, 0.1235); g.quadraticCurveTo(0, 0.1325, 0.052, 0.1235); g.lineTo(0.052, 0.1445);
      g.quadraticCurveTo(0, 0.1535, -0.052, 0.1445); g.closePath();
      g.fillStyle = hexCss(cA); g.fill(); g.strokeStyle = hexCss(mixHex(cA, 0x000000, 0.45)); g.lineWidth = 0.0025; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.002; g.beginPath(); g.moveTo(-0.038, 0.143); g.quadraticCurveTo(0, 0.15, 0.038, 0.143); g.stroke();
    } else if (m === 'tiritaNariz') {   // WP7: tirita GRANDE cruzada sobre la nariz (algo ladeada), almohadilla en medio y agujeritos
      var tcol = lumHex(L.skin) > 0.62 ? '#eef3fb' : '#f0d9b5', tpad = lumHex(L.skin) > 0.62 ? '#d9c8b0' : '#fbf4e6';
      g.save(); g.translate(0.004, 0.131); g.rotate(-0.22);
      rrect(g, 0, 0, 0.15, 0.034, 0.014); if (halo) { g.strokeStyle = halo; g.lineWidth = 0.006; g.stroke(); }
      g.fillStyle = tcol; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.0035; g.stroke();
      rrect(g, 0, 0, 0.044, 0.026, 0.006); g.fillStyle = tpad; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.0018; g.stroke();
      g.fillStyle = 'rgba(120,100,80,0.45)'; for (i = 0; i < 4; i++) for (s = -1; s <= 1; s += 2) { ell(g, s * (0.036 + i * 0.01), (i % 2 ? 1 : -1) * 0.006, 0.0018, 0.0018); g.fill(); }
      g.restore();
    }
    g.restore();
  }
  /** Gafas pintadas (ranura eyes, salvo `frente`, que es de geometría), DESPUÉS de las cejas, en las 8 celdas de ojos: montura gruesa
   *  (0,016-0,02) de cGlass; oscuras y espejo OPACAS (alfa 0,96 / 0,97: no se ven las pupilas ni los iris) con un brillo en diagonal. */
  var GLASS_Y = EYE_Y + 0.009, GLASS_RX = EYE_RX * 1.32, GLASS_RY = 0.0625;
  function glassHex(L, tc) {
    if (L.cGlass >= 0) return L.cGlass;
    // (WP7: redondas de metal bronce, aviador dorado y la máscara de ventisca con el marco casi negro)
    return L.eyes === 'deporte' || L.eyes === 'frente' ? tc.accent : L.eyes === 'espejo' || L.eyes === 'aviador' ? GOLD : L.eyes === 'gafasRedondas' ? 0xb08a3c :
      L.eyes === 'oscuras' ? 0x1e1b24 : L.eyes === 'gafasVentisca' ? 0x24262e : 0x2a2230;
  }
  function lensGloss(g, cx, cy, rx, ry, a) {   // brillo diagonal dentro de la lente (dos franjas)
    g.save(); ell(g, cx, cy, rx, ry); g.clip();
    g.fillStyle = 'rgba(255,255,255,' + a + ')';
    g.beginPath(); g.moveTo(cx - rx * 0.9, cy - ry * 0.1); g.lineTo(cx - rx * 0.1, cy + ry * 1.0); g.lineTo(cx + rx * 0.25, cy + ry * 1.0); g.lineTo(cx - rx * 0.75, cy - ry * 0.55); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,' + (a * 0.6) + ')';
    g.beginPath(); g.moveTo(cx + rx * 0.05, cy - ry * 0.9); g.lineTo(cx + rx * 0.5, cy - ry * 0.05); g.lineTo(cx + rx * 0.68, cy - ry * 0.3); g.lineTo(cx + rx * 0.3, cy - ry * 0.95); g.closePath(); g.fill();
    g.restore();
  }
  function paintGlasses(g, cell, L, tc) {
    var e = L.eyes, s, fr = hexCss(glassHex(L, tc));
    if (!e || e === 'frente') return;
    g.save(); decorClip(g, 'eye'); g.lineJoin = 'round'; g.lineCap = 'round';
    if (e === 'deporte') {   // envolventes: una sola lente para los dos ojos, azulada y espejada arriba, con la montura arriba
      var y0 = SPLIT_Y + 0.006, y1 = GLASS_Y + EYE_RY * 1.12;
      g.beginPath(); g.moveTo(-0.16, y1 - 0.012); g.quadraticCurveTo(0, y1 + 0.012, 0.16, y1 - 0.012); g.lineTo(0.152, y0 + 0.022);
      g.quadraticCurveTo(0.09, y0 - 0.004, 0.03, y0 + 0.014); g.quadraticCurveTo(0, y0 + 0.032, -0.03, y0 + 0.014); g.quadraticCurveTo(-0.09, y0 - 0.004, -0.152, y0 + 0.022); g.closePath();
      var gd = g.createLinearGradient(0, y1, 0, y0);
      gd.addColorStop(0, 'rgba(60,120,210,0.82)'); gd.addColorStop(0.55, 'rgba(110,190,255,0.55)'); gd.addColorStop(1, 'rgba(170,225,255,0.4)');
      g.fillStyle = gd; g.fill();
      g.strokeStyle = fr; g.lineWidth = 0.009; g.stroke();
      g.beginPath(); g.moveTo(-0.16, y1 - 0.012); g.quadraticCurveTo(0, y1 + 0.012, 0.16, y1 - 0.012); g.lineWidth = 0.02; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.007;
      g.beginPath(); g.moveTo(-0.125, y1 - 0.03); g.lineTo(-0.09, y1 - 0.064); g.stroke();
      g.beginPath(); g.moveTo(0.06, y1 - 0.026); g.lineTo(0.08, y1 - 0.045); g.stroke();
      g.restore(); return;
    }
    if (e === 'gafasVentisca') {   // WP7: máscara de ventisca: UNA lente grande espejada (naranja → rosa → violeta, opaca) con marco grueso
      var vy0 = SPLIT_Y + 0.004, vy1 = GLASS_Y + EYE_RY * 1.2, vx = 0.168;
      var mask = function (k) {   // contorno: rectángulo redondeado con la muesca de la nariz abajo (k: margen hacia dentro)
        var x0 = vx - k, y0 = vy0 + k, y1 = vy1 - k, rr = 0.04 - k * 0.5;
        g.beginPath(); g.moveTo(-x0 + rr, y1); g.quadraticCurveTo(0, y1 + 0.008, x0 - rr, y1); g.quadraticCurveTo(x0, y1, x0, y1 - rr); g.lineTo(x0, y0 + rr);
        g.quadraticCurveTo(x0, y0, x0 - rr, y0); g.lineTo(0.042 - k * 0.3, y0); g.quadraticCurveTo(0, y0 + 0.04 - k, -0.042 + k * 0.3, y0); g.lineTo(-x0 + rr, y0);
        g.quadraticCurveTo(-x0, y0, -x0, y0 + rr); g.lineTo(-x0, y1 - rr); g.quadraticCurveTo(-x0, y1, -x0 + rr, y1); g.closePath();
      };
      mask(0); g.fillStyle = fr; g.fill();
      mask(0.014); var gv = g.createLinearGradient(0, vy1, 0, vy0);
      gv.addColorStop(0, 'rgba(255,150,40,0.98)'); gv.addColorStop(0.45, 'rgba(255,70,130,0.98)'); gv.addColorStop(1, 'rgba(120,60,210,0.98)');
      g.fillStyle = gv; g.fill();
      g.save(); mask(0.014); g.clip(); g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath(); g.moveTo(-0.15, vy1 - 0.03); g.lineTo(-0.09, vy1); g.lineTo(-0.06, vy1); g.lineTo(-0.13, vy1 - 0.075); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(0.02, vy1); g.lineTo(0.05, vy1); g.lineTo(-0.02, vy1 - 0.09); g.lineTo(-0.045, vy1 - 0.09); g.closePath(); g.fill();
      g.restore();
      g.restore(); return;
    }
    if (e === 'gafasRedondas' || e === 'aviador') {   // WP7: redondas de metal fino (lente apenas tintada) y aviador (gota, degradado oscuro)
      var av = e === 'aviador', fw2 = av ? 0.011 : 0.0105;
      var lensP = function (sx) {
        var cx = sx * EYE_X;
        if (!av) { ell(g, cx, GLASS_Y, GLASS_RY * 1.02, GLASS_RY * 1.02); return; }
        var t = GLASS_Y + GLASS_RY * 0.95, b = GLASS_Y - GLASS_RY * 1.12, o = cx + sx * GLASS_RX * 1.02, n = cx - sx * GLASS_RX * 0.86;   // gota: ancha arriba, la punta abajo y hacia la nariz
        g.beginPath(); g.moveTo(n, t - 0.004); g.quadraticCurveTo(cx, t + 0.012, o, t - 0.002); g.quadraticCurveTo(o + sx * 0.012, GLASS_Y - 0.02, cx + sx * 0.012, b);
        g.quadraticCurveTo(n - sx * 0.01, b + 0.01, n, GLASS_Y + 0.006); g.closePath();
      };
      for (s = -1; s <= 1; s += 2) {
        lensP(s);
        if (av) { var ga = g.createLinearGradient(0, GLASS_Y + GLASS_RY, 0, GLASS_Y - GLASS_RY * 1.1); ga.addColorStop(0, 'rgba(40,32,26,0.97)'); ga.addColorStop(1, 'rgba(120,92,58,0.93)'); g.fillStyle = ga; }
        else g.fillStyle = 'rgba(225,240,255,0.16)';
        g.fill();
        if (av) { g.save(); lensP(s); g.clip(); lensGloss(g, s * EYE_X, GLASS_Y, GLASS_RX, GLASS_RY, 0.34); g.restore(); }
        else { g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.006; g.beginPath(); g.arc(s * EYE_X, GLASS_Y, GLASS_RY * 0.66, PI * 0.6, PI * 0.92); g.stroke(); }
        lensP(s); g.strokeStyle = fr; g.lineWidth = fw2; g.stroke();
      }
      g.strokeStyle = fr; g.lineWidth = fw2;
      if (av) {   // doble puente: la barra de arriba recta y el puente bajo en arco
        g.beginPath(); g.moveTo(-EYE_X + GLASS_RX * 0.2, GLASS_Y + GLASS_RY * 0.95); g.lineTo(EYE_X - GLASS_RX * 0.2, GLASS_Y + GLASS_RY * 0.95); g.stroke();
        g.beginPath(); g.moveTo(-EYE_X + GLASS_RX * 0.86, GLASS_Y + 0.008); g.quadraticCurveTo(0, GLASS_Y + 0.022, EYE_X - GLASS_RX * 0.86, GLASS_Y + 0.008); g.stroke();
      } else { g.beginPath(); g.moveTo(-EYE_X + GLASS_RY, GLASS_Y + 0.006); g.quadraticCurveTo(0, GLASS_Y + 0.03, EYE_X - GLASS_RY, GLASS_Y + 0.006); g.stroke(); }   // puente en ojo de cerradura
      for (s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * (EYE_X + (av ? GLASS_RX : GLASS_RY)), GLASS_Y + 0.016); g.lineTo(s * 0.166, GLASS_Y + 0.022); g.stroke(); }
      g.restore(); return;
    }
    var fw = e === 'pasta' ? 0.02 : 0.017;
    for (s = -1; s <= 1; s += 2) {
      var cx = s * EYE_X;
      ell(g, cx, GLASS_Y, GLASS_RX, GLASS_RY);
      if (e === 'espejo') {   // espejo: degradado iridiscente en bandas (cielo arriba, rosa y naranja abajo), opaco: no se ven los iris
        var gr = g.createLinearGradient(0, GLASS_Y + GLASS_RY, 0, GLASS_Y - GLASS_RY);
        gr.addColorStop(0, 'rgba(48,86,220,0.97)'); gr.addColorStop(0.42, 'rgba(150,90,230,0.97)'); gr.addColorStop(0.62, 'rgba(255,96,150,0.97)'); gr.addColorStop(1, 'rgba(255,176,60,0.97)');
        g.fillStyle = gr;
      } else if (e === 'oscuras') {   // oscuras: casi negras (no se ven las pupilas), con un reflejo azulado abajo
        var go = g.createLinearGradient(0, GLASS_Y + GLASS_RY, 0, GLASS_Y - GLASS_RY);
        go.addColorStop(0, 'rgba(16,18,28,0.96)'); go.addColorStop(1, 'rgba(36,48,84,0.96)');
        g.fillStyle = go;
      } else g.fillStyle = 'rgba(225,240,255,0.14)';
      g.fill();
      if (e === 'oscuras' || e === 'espejo') lensGloss(g, cx, GLASS_Y, GLASS_RX, GLASS_RY, e === 'espejo' ? 0.5 : 0.32);
      else { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.006; g.beginPath(); g.arc(cx, GLASS_Y, GLASS_RX * 0.62, PI * 0.62, PI * 0.9); g.stroke(); }
      g.strokeStyle = fr; g.lineWidth = fw; ell(g, cx, GLASS_Y, GLASS_RX, GLASS_RY); g.stroke();
    }
    g.strokeStyle = fr; g.lineWidth = fw * 0.8;   // puente y arranque de las patillas
    g.beginPath(); g.moveTo(-EYE_X + GLASS_RX * 0.92, GLASS_Y + 0.014); g.quadraticCurveTo(0, GLASS_Y + 0.026, EYE_X - GLASS_RX * 0.92, GLASS_Y + 0.014); g.stroke();
    for (s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * (EYE_X + GLASS_RX), GLASS_Y + 0.016); g.lineTo(s * 0.166, GLASS_Y + 0.022); g.stroke(); }
    g.restore();
  }
  function paintEyes(g, cell, L, tc, beach) {
    var ink = hexCss(faceInk(tc)), brow = hexCss(mixHex(L.brow != null ? L.brow : L.hair, 0x000000, 0.2)), s;
    // pintura y marcas, ojos, cejas y gafas pintadas (en ese orden: la pintura queda bajo los ojos y las gafas encima de las cejas).
    // SIN halo claro alrededor de los ojos ni de las cejas en las pieles oscuras: los óvalos claros en los ojos y la boca de una piel
    // oscura repiten la caricatura racista del «blackface». El blanco del ojo con su filo de tinta ya se lee en cualquier piel; el
    // halo solo queda como FILO fino de pinturas, marcas y barbas (no rellena la piel).
    paintPaint(g, 'eye', L, tc);
    paintMarks(g, 'eye', L, tc);
    for (s = -1; s <= 1; s += 2) {
      var cx = s * EYE_X, cy = EYE_Y, rx = EYE_RX, ry = EYE_RY, pr = 0.027, py = -0.004, px = 0, lid = 0, tilt = 0, shut = 0;
      if (cell === 6) { rx *= 1.14; ry *= 1.05; pr = 0.016; px = 0; py = 0; }     // sorpresa: enormes, pupila chica (acaban en SPLIT_Y)
      if (cell === 7) { rx *= 1.05; pr = 0.022; py = 0.004; lid = 0.22; tilt = 0.55; }   // grito: ceja encima del ojo
      if (cell === 2) { lid = 0.42; tilt = 0.5; }                                  // concentrado: párpado en diagonal
      if (cell === 5) { lid = 0.4; tilt = -0.5; py = -0.014; px = s * 0.006; }   // pena: párpado caído, mirada baja
      if (cell === 1 || cell === 3 || cell === 4) shut = cell;
      g.lineWidth = 0.009; g.strokeStyle = ink;
      if (shut === 1) {                 // parpadeo: línea curva hacia abajo
        g.beginPath(); g.moveTo(cx - rx, cy + 0.004); g.quadraticCurveTo(cx, cy - 0.022, cx + rx, cy + 0.004); g.stroke();
      } else if (shut === 4) {          // alegría: arcos ^ ^
        g.lineWidth = 0.011;
        g.beginPath(); g.moveTo(cx - rx, cy - 0.012); g.quadraticCurveTo(cx, cy + 0.05, cx + rx, cy - 0.012); g.stroke();
      } else if (shut === 3) {          // esfuerzo: apretados > <
        g.lineWidth = 0.01;
        g.beginPath(); g.moveTo(cx - s * rx * 0.9, cy + 0.028); g.lineTo(cx + s * rx * 0.5, cy); g.lineTo(cx - s * rx * 0.9, cy - 0.028); g.stroke();
        g.beginPath(); g.moveTo(cx - s * rx * 0.3, cy + 0.03); g.quadraticCurveTo(cx + s * rx * 0.9, cy, cx - s * rx * 0.3, cy - 0.03); g.stroke();
      } else {
        g.save();
        ell(g, cx, cy, rx, ry); g.fillStyle = '#ffffff'; g.fill(); g.clip();
        ell(g, cx + px, cy + py, pr * 0.9, pr); g.fillStyle = ink; g.fill();                              // pupila
        g.fillStyle = '#ffffff';
        ell(g, cx + px - s * 0.009, cy + py + 0.012, pr * 0.34, pr * 0.36); g.fill();                     // brillo grande
        ell(g, cx + px + s * 0.008, cy + py - 0.011, pr * 0.16, pr * 0.17); g.fill();                     // brillo chico
        if (lid > 0) {                                                                                     // párpado (piel) con línea de tinta
          var ly = cy + ry - 2 * ry * lid, t = tilt * s;
          g.fillStyle = hexCss(L.skin); g.beginPath();
          g.moveTo(cx - rx * 1.4, ly - t * rx); g.lineTo(cx + rx * 1.4, ly + t * rx); g.lineTo(cx + rx * 1.4, cy + ry * 1.5); g.lineTo(cx - rx * 1.4, cy + ry * 1.5); g.closePath(); g.fill();
          g.strokeStyle = ink; g.lineWidth = 0.009; g.beginPath(); g.moveTo(cx - rx * 1.4, ly - t * rx); g.lineTo(cx + rx * 1.4, ly + t * rx); g.stroke();
        }
        g.restore();
        g.strokeStyle = ink; g.lineWidth = 0.0075; ell(g, cx, cy, rx, ry); g.stroke();
      }
    }
    for (s = -1; s <= 1; s += 2) {
      // cejas GRUESAS: llevan la expresión (bi interior, bo exterior, bm centro; Y en metros)
      var bi = BROW_Y, bo = BROW_Y - 0.012, bm = BROW_Y + 0.006, bw = 0.024;
      if (cell === 2) { bi = BROW_Y - 0.03; bo = BROW_Y + 0.004; bm = BROW_Y - 0.016; }            // V de concentración
      if (cell === 7) { bi = BROW_Y - 0.05; bo = BROW_Y + 0.0; bm = BROW_Y - 0.03; bw = 0.024; }    // V de grito
      if (cell === 3) { bi = BROW_Y - 0.038; bo = BROW_Y - 0.01; bm = BROW_Y - 0.03; }             // esfuerzo
      if (cell === 5) { bi = BROW_Y + 0.012; bo = BROW_Y - 0.03; bm = BROW_Y + 0.002; }            // pena: por dentro arriba
      if (cell === 4) { bi = BROW_Y + 0.02; bo = BROW_Y + 0.01; bm = BROW_Y + 0.03; }              // alegría: altas
      if (cell === 6) { bi = BROW_Y + 0.035; bo = BROW_Y + 0.022; bm = BROW_Y + 0.045; }           // sorpresa: muy altas
      g.strokeStyle = brow; g.lineWidth = bw;
      g.beginPath(); g.moveTo(s * 0.035, bi); g.quadraticCurveTo(s * 0.08, bm, s * 0.13, bo); g.stroke();
    }
    paintGlasses(g, cell, L, tc);
  }
  /** Barba (ranura beard) en la celda de boca, ANTES de la boca (la boca siempre encima): bigote de manillar con las puntas hacia
   *  arriba (enmarca la sonrisa en vez de ponerla triste), perilla en punta, separada de la boca y con puntas de pelo arriba (no se lee
   *  como una boca abierta), barba de tres días como máscara lisa de la mandíbula (alfa 0,35) y barba completa («barba», con el hueco
   *  de la boca). La barba y la de tres días acaban a los lados en una patilla dentada y siguen por debajo del borde de la lámina (el
   *  faldón de faceSheet repite esa última fila bajo el mentón): ni canto recto, ni degradado que se estire hacia la oreja.
   *  En piel oscura, todas llevan un borde claro (el color del halo) para que no desaparezcan. */
  function beardHex(L) { return mixHex(L.brow != null ? L.brow : L.hair, 0x000000, 0.1); }
  function paintBeard(g, cell, L, tc) {
    var b = L.beard, halo = faceHalo(L), BX = FM_DX * HEAD_RX / FK, MY = MOUTH_Y, YB = HEAD_C0 + FM_DY0 * HEAD_RY0;   // medio ancho y borde de abajo de la lámina (m de v1)
    if (!b) return;
    g.save(); decorClip(g, 'mouth');
    var col = beardHex(L), css = hexCss(col), r = col >> 16 & 255, gg = col >> 8 & 255, bb = col & 255, ink = hexCss(faceInk(tc));
    var edge = hexCss(mixHex(col, 0x000000, 0.4)), hiS = halo ? 'rgba(255,240,225,0.22)' : 'rgba(255,255,255,0.13)';
    function rgba(a) { return 'rgba(' + r + ',' + gg + ',' + bb + ',' + a + ')'; }
    var SX = BX - 0.014;   // patilla: x del borde de la barba (dentro de la lámina, sin tocar su canto)
    function jawPath(top) {   // contorno de la barba: arriba de pómulo a pómulo, patillas dentadas y por debajo del borde de la lámina
      g.beginPath(); g.moveTo(-SX, top);
      g.quadraticCurveTo(-0.1, MY + 0.02, -0.06, MY + 0.02); g.quadraticCurveTo(-0.03, MY + 0.036, 0, MY + 0.03); g.quadraticCurveTo(0.03, MY + 0.036, 0.06, MY + 0.02);
      g.quadraticCurveTo(0.1, MY + 0.02, SX, top);
      for (var k = 1; k <= 6; k++) { var y = top - (top - YB + 0.02) * k / 6; g.lineTo(SX + (k % 2 ? -0.006 : 0), y); }   // patilla derecha (dientes)
      g.lineTo(SX, YB - 0.05); g.lineTo(-SX, YB - 0.05);
      for (k = 6; k >= 1; k--) { var y2 = top - (top - YB + 0.02) * k / 6; g.lineTo(-SX - (k % 2 ? -0.006 : 0), y2); }
      g.closePath();
    }
    function mouthHole(hx, hy) { g.moveTo(hx, MY - 0.002); g.ellipse(0, MY - 0.002, hx, hy, 0, 0, PI * 2); }
    function strands(n, x0, x1, y0, y1) {   // mechones: trazos cortos algo más claros y más oscuros dentro
      g.lineWidth = 0.004;
      for (var i = 0; i < n; i++) {
        var x = x0 + (x1 - x0) * ((i * 0.618 + 0.1) % 1), y = y0 + (y1 - y0) * ((i * 0.381 + 0.2) % 1);
        g.strokeStyle = i % 2 ? hiS : 'rgba(0,0,0,0.2)';
        g.beginPath(); g.moveTo(x, y + 0.011); g.quadraticCurveTo(x + 0.004, y, x - 0.002, y - 0.011); g.stroke();
      }
    }
    if (b === 'bigote') {     // manillar: centro sobre el labio, alas que bajan un poco y puntas rizadas hacia ARRIBA
      g.translate(0, MY + 0.026); g.scale(1.2, 1.2); g.translate(0, -(MY + 0.018));   // (×1,2 y 8 mm más arriba: la sonrisa queda a la vista)
      g.beginPath(); g.moveTo(0, MY + 0.0245);
      for (var s = -1; s <= 1; s += 2) {
        if (s > 0) g.moveTo(0, MY + 0.0245);
        g.bezierCurveTo(s * 0.02, MY + 0.028, s * 0.042, MY + 0.025, s * 0.054, MY + 0.017);
        g.bezierCurveTo(s * 0.062, MY + 0.012, s * 0.07, MY + 0.017, s * 0.068, MY + 0.027);
        g.bezierCurveTo(s * 0.062, MY + 0.011, s * 0.046, MY + 0.007, s * 0.026, MY + 0.009);
        g.bezierCurveTo(s * 0.012, MY + 0.01, s * 0.004, MY + 0.012, 0, MY + 0.014);
        g.closePath();
      }
      if (halo) { g.strokeStyle = halo; g.lineWidth = 0.007; g.stroke(); }
      g.fillStyle = css; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.0028; g.stroke();
    } else if (b === 'bigote70') {   // WP7: bigote de herradura de los 70: barra gruesa sobre el labio que baja por los lados hasta la barbilla
      var hs = function () {
        g.beginPath(); g.moveTo(-0.07, MY - 0.064); g.lineTo(-0.07, MY + 0.004); g.quadraticCurveTo(-0.068, MY + 0.036, -0.03, MY + 0.038); g.quadraticCurveTo(0, MY + 0.044, 0.03, MY + 0.038);
        g.quadraticCurveTo(0.068, MY + 0.036, 0.07, MY + 0.004); g.lineTo(0.07, MY - 0.064); g.lineTo(0.05, MY - 0.064); g.lineTo(0.05, MY + 0.002);
        g.quadraticCurveTo(0.048, MY + 0.017, 0.02, MY + 0.018); g.quadraticCurveTo(0, MY + 0.021, -0.02, MY + 0.018); g.quadraticCurveTo(-0.048, MY + 0.017, -0.05, MY + 0.002); g.lineTo(-0.05, MY - 0.064); g.closePath();
      };
      hs(); if (halo) { g.strokeStyle = halo; g.lineWidth = 0.009; g.stroke(); }
      g.fillStyle = css; g.fill();
      g.save(); hs(); g.clip(); strands(14, -0.07, 0.07, MY - 0.06, MY + 0.036); g.restore();
      hs(); g.strokeStyle = edge; g.lineWidth = 0.003; g.stroke();
    } else if (b === 'perilla') {   // perilla de CANDADO: bigote fino unido por las comisuras a la mancha de la barbilla, un aro alrededor
      // de la boca (con su hueco) que baja bajo el mentón. Sin brillos claros dentro. (Antes, una mancha suelta bajo la boca: de frente
      // un goterón y desde abajo una segunda boca abierta con dientes)
      var pb = 0.036;
      var goatee = function () {
        g.beginPath(); g.moveTo(-0.052, MY + 0.02);
        g.quadraticCurveTo(-0.026, MY + 0.032, 0, MY + 0.027); g.quadraticCurveTo(0.026, MY + 0.032, 0.052, MY + 0.02);   // bigote
        g.quadraticCurveTo(0.06, MY - 0.004, 0.05, MY - 0.03);                                                             // comisura
        g.bezierCurveTo(0.046, MY - 0.05, pb + 0.004, YB + 0.02, pb, YB - 0.03);
        g.lineTo(-pb, YB - 0.03);
        g.bezierCurveTo(-pb - 0.004, YB + 0.02, -0.046, MY - 0.05, -0.05, MY - 0.03);
        g.quadraticCurveTo(-0.06, MY - 0.004, -0.052, MY + 0.02);
        g.closePath();
      };
      goatee();
      if (halo) { g.strokeStyle = halo; g.lineWidth = 0.007; g.stroke(); }   // (filo de fuera; el hueco de la boca, sin filo claro)
      g.save(); goatee(); mouthHole(0.04, 0.0145); g.clip('evenodd');
      g.fillStyle = css; g.fillRect(-0.2, -0.1, 0.4, 0.25);
      g.lineWidth = 0.004; for (var q = 0; q < 14; q++) {   // mechones: solo trazos más oscuros
        var sx = -0.045 + 0.09 * ((q * 0.618 + 0.1) % 1), sy = YB + (MY - YB) * ((q * 0.381 + 0.2) % 1);
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.moveTo(sx, sy + 0.01); g.quadraticCurveTo(sx + 0.004, sy, sx - 0.002, sy - 0.01); g.stroke();
      }
      g.restore();
      g.save(); goatee(); mouthHole(0.04, 0.0145); g.strokeStyle = edge; g.lineWidth = 0.003; g.stroke(); g.restore();
    } else if (b === 'tresDias') {  // máscara lisa de mandíbula y bigote (alfa 0,35) sin tapar la boca; sube por las mejillas
      g.save();
      jawPath(MY + 0.03); mouthHole(0.05, 0.016); g.clip('evenodd');
      g.fillStyle = rgba(halo ? 0.55 : 0.35); g.fillRect(-0.2, -0.1, 0.4, 0.25);   // (sin relleno claro debajo en piel oscura: ver paintEyes)
      g.restore();
    } else if (b === 'barba') {     // barba completa: de patilla a patilla por la barbilla, bigote incluido, con el hueco de la boca
      g.save();
      jawPath(MY + 0.034);
      if (halo) { g.strokeStyle = halo; g.lineWidth = 0.013; g.stroke(); }   // borde claro (piel oscura): solo el contorno de fuera, NUNCA un aro alrededor de la boca
      jawPath(MY + 0.034); mouthHole(0.046, 0.017);
      g.clip('evenodd');
      g.fillStyle = css; g.fillRect(-0.2, -0.1, 0.4, 0.25);
      strands(26, -SX + 0.006, SX - 0.006, YB, MY + 0.02);
      g.restore();
      g.save(); jawPath(MY + 0.034); g.strokeStyle = edge; g.lineWidth = 0.0035; g.stroke(); g.restore();
      g.beginPath(); g.ellipse(0, MY - 0.002, 0.046, 0.017, 0, 0, PI * 2); g.strokeStyle = ink; g.lineWidth = 0.0028; g.stroke();
    }
    g.restore();
  }
  function paintMouth(g, cell, L, tc) {
    var ink = hexCss(faceInk(tc)), cy = MOUTH_Y, inner = '#5a1620', tongue = '#ef6f78', teeth = '#fffaf0';   // (sin óvalo claro alrededor: ver paintEyes)
    paintPaint(g, 'mouth', L, tc);
    paintMarks(g, 'mouth', L, tc);
    paintBeard(g, cell, L, tc);
    g.strokeStyle = ink; g.lineWidth = 0.008;
    switch (cell) {
      case 1:   // sonrisa grande con dientes (D)
        g.save(); g.beginPath(); g.moveTo(-0.07, cy + 0.012); g.quadraticCurveTo(0, cy - 0.07, 0.07, cy + 0.012); g.closePath();
        g.fillStyle = inner; g.fill(); g.clip(); g.fillStyle = teeth; g.fillRect(-0.08, cy - 0.0, 0.16, 0.014);
        g.fillStyle = tongue; ell(g, 0.01, cy - 0.034, 0.03, 0.018); g.fill(); g.restore();
        g.beginPath(); g.moveTo(-0.07, cy + 0.012); g.quadraticCurveTo(0, cy - 0.07, 0.07, cy + 0.012); g.closePath(); g.stroke(); break;
      case 2:   // grito: O grande con dientes arriba y lengua (acaba en SPLIT_Y)
        g.save(); ell(g, 0, cy - 0.015, 0.048, 0.048); g.fillStyle = inner; g.fill(); g.clip();
        g.fillStyle = tongue; ell(g, 0, cy - 0.055, 0.036, 0.022); g.fill();
        g.fillStyle = teeth; g.fillRect(-0.06, cy + 0.017, 0.12, 0.014); g.restore();
        ell(g, 0, cy - 0.015, 0.048, 0.048); g.stroke(); break;
      case 3:   // dientes apretados
        g.fillStyle = teeth; ell(g, 0, cy, 0.056, 0.02); g.fill();
        g.lineWidth = 0.005; g.beginPath(); g.moveTo(-0.052, cy); g.lineTo(0.052, cy);
        for (var k = -2; k <= 2; k++) { g.moveTo(k * 0.02, cy - 0.018); g.lineTo(k * 0.02, cy + 0.018); }
        g.stroke(); g.lineWidth = 0.008; ell(g, 0, cy, 0.056, 0.02); g.stroke(); break;
      case 4:   // pena: arco hacia abajo
        g.beginPath(); g.moveTo(-0.045, cy - 0.022); g.quadraticCurveTo(0, cy + 0.016, 0.045, cy - 0.022); g.stroke(); break;
      case 5:   // «o» chica (sorpresa)
        ell(g, 0, cy - 0.004, 0.02, 0.023); g.fillStyle = inner; g.fill(); g.stroke(); break;
      case 6:   // sonrisa abierta con lengua fuera
        g.save(); g.beginPath(); g.moveTo(-0.06, cy + 0.012); g.quadraticCurveTo(0, cy - 0.06, 0.06, cy + 0.012); g.closePath();
        g.fillStyle = inner; g.fill(); g.clip(); g.fillStyle = teeth; g.fillRect(-0.07, cy - 0.0, 0.14, 0.012); g.restore();
        g.fillStyle = tongue; ell(g, 0.012, cy - 0.038, 0.026, 0.028); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-0.06, cy + 0.012); g.quadraticCurveTo(0, cy - 0.06, 0.06, cy + 0.012); g.closePath(); g.stroke(); break;
      case 7:   // línea tensa (concentración), ligeramente torcida
        g.beginPath(); g.moveTo(-0.045, cy - 0.004); g.lineTo(0.04, cy - 0.012); g.stroke(); break;
      default:  // neutra: sonrisa corta
        g.beginPath(); g.moveTo(-0.035, cy + 0.004); g.quadraticCurveTo(0, cy - 0.012, 0.035, cy + 0.004); g.stroke();
    }
  }

  // =====================================================================
  //  MATERIAL: toon de DOS bandas (solo la luz principal en bandas), ambiente teñido, brillo de borde, celdas de la cara
  // =====================================================================
  var GRAD = null, SHADE = [0.12, 0.09, 0.2], SHADE_SKIN = [0.18, 0.09, 0.1], TOON_CHUNK = null;
  function gradient2() {
    if (GRAD) return GRAD;
    // 10 texeles: 0-5 sombra (0,5), 6-9 luz: el terminador queda en N·L ≈ 0,2 (la sombra ocupa algo menos de media bola)
    var d = new Uint8Array(40); for (var i = 0; i < 10; i++) { var v = i < 6 ? 128 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    GRAD = new THREE.DataTexture(d, 10, 1, THREE.RGBAFormat); GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.generateMipmaps = false; GRAD.needsUpdate = true;
    return GRAD;
  }
  function toonLightsChunk() {
    if (TOON_CHUNK) return TOON_CHUNK;
    var src = THREE.ShaderChunk.lights_toon_pars_fragment, a = 'vec3 irradiance = getGradientIrradiance( geometry.normal, directLight.direction ) * directLight.color;';
    if (src.indexOf(a) < 0) return (TOON_CHUNK = src);
    return (TOON_CHUNK = src.replace(a, 'float vbL = dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) );\n' +
      '\tvec3 vbB = getGradientIrradiance( geometry.normal, directLight.direction );\n' +
      '\tvec3 vbS = vec3( 0.55 * saturate( dot( geometry.normal, directLight.direction ) ) );\n' +
      '\tvec3 irradiance = mix( vbS, vbB, smoothstep( 1.2, 2.4, vbL ) ) * directLight.color;'));
  }
  /** Material del muñeco: atlas propio (ropa, dorsal `num`, cara), toon de dos bandas, celdas de la cara por uniformes.
   *  px = escala del lienzo (2 → 1024², 1 → 512²); beach = versión de playa. */
  function dollMaterial(tc, L, num, beach, px) {
    var K = px === 1 ? 1 : 2, cv = canvas(ATLAS * K, ATLAS * K); paintAtlas(cv, tc, L, num, beach);
    var t = texOf(cv), m = new THREE.MeshToonMaterial({ map: t, vertexColors: true, gradientMap: gradient2() });
    // lo que hay pintado ahora (la vista previa del Vestuario repinta este mismo lienzo: el repintado de la fuente usa lo último)
    m.userData.paint = { tc: tc, L: L, num: num, beach: beach };
    var eyeOff = m.userData.eyeOff = new THREE.Vector2(), mouthOff = m.userData.mouthOff = new THREE.Vector2();
    var fe0 = (1 - (FE_Y + FE_H) / ATLAS - 0.004).toFixed(4), fe1 = (1 - FE_Y / ATLAS + 0.004).toFixed(4);
    var fm0 = (1 - (FM_Y + FM_H) / ATLAS - 0.004).toFixed(4), fm1 = (1 - FM_Y / ATLAS + 0.004).toFixed(4);
    var rim = new THREE.Color(0xfff1e0).multiplyScalar(0.14);
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uRim = { value: rim };
      sh.uniforms.uShade = { value: new THREE.Vector3(SHADE[0], SHADE[1], SHADE[2]) };
      sh.uniforms.uShadeSkin = { value: new THREE.Vector3(SHADE_SKIN[0], SHADE_SKIN[1], SHADE_SKIN[2]) };
      sh.uniforms.uEyeOff = { value: eyeOff }; sh.uniforms.uMouthOff = { value: mouthOff };
      sh.fragmentShader = 'uniform vec3 uRim;\nuniform vec3 uShade;\nuniform vec3 uShadeSkin;\nuniform vec2 uEyeOff;\nuniform vec2 uMouthOff;\nfloat vbFace = 0.0;\n' + sh.fragmentShader
        .replace('#include <lights_toon_pars_fragment>', toonLightsChunk())
        .replace('#include <map_fragment>', '#ifdef USE_UV\n  vec2 vbUv = vUv;\n' +
          '  float vbFE = step( ' + fe0 + ', vUv.y ) * step( vUv.y, ' + fe1 + ' );\n' +
          '  float vbFM = step( ' + fm0 + ', vUv.y ) * step( vUv.y, ' + fm1 + ' );\n' +
          '  vbFace = max( vbFE, vbFM );\n  vbUv += uEyeOff * vbFE + uMouthOff * vbFM;\n#endif\n' +
          THREE.ShaderChunk.map_fragment.replace(/vUv/g, 'vbUv'))
        .replace('#include <output_fragment>',
          'outgoingLight += diffuseColor.rgb * mix( uShade, uShadeSkin, vbFace );\n' +
          'float vbRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );\n' +
          'outgoingLight += uRim * smoothstep( 0.72, 0.78, vbRim );\n' +
          // blanco de los ojos y dientes con algo de luz propia: no se tiñe de violeta en la sombra
          'outgoingLight += diffuseColor.rgb * 0.5 * vbFace * smoothstep( 0.72, 0.92, min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) ) );\n' +
          '#include <output_fragment>');
    };
    m.customProgramCacheKey = function () { return 'vbDollToon'; };
    try { if (document.fonts && document.fonts.load) document.fonts.load('italic 900 100px "Barlow Condensed"').then(function () { var a = m.userData.paint; if (m.map === t && a) { paintAtlas(cv, a.tc, a.L, a.num, a.beach); t.needsUpdate = true; } }).catch(function () { }); } catch (e) { }
    return m;
  }
  // contorno de tinta de color: VB.TOON.outline de arena (grosor en píxeles, tope en metros, peso `ow` por vértice, color propio)
  var OUT_PX = 3.6, OUT_MAX = 0.06, OUT_MIN = 0.003;
  function ensureInk(r) {
    var T = VB.TOON; if (r.ink || !T || !T.outline) return;
    r.ink = T.outline(r.skin, OUT_MIN, { max: OUT_MAX, k: T.px ? OUT_PX / T.px : 1, color: inkHex(r.tc) });
    if (r.ink) r.ink.name = r.skin.name + 'Ink';
  }

  // =====================================================================
  //  PIEZAS (espacio del hueso; todas en la pose de reposo)
  // =====================================================================
  var TORSO_PROF = [[0, -0.13], [0.12, -0.12], [0.185, -0.06], [0.205, 0.04], [0.2, 0.16], [0.185, 0.3], [0.168, 0.44], [0.152, 0.56], [0.13, 0.64], [0.085, 0.69], [0, 0.705]];
  function torsoGeo(G, r) {
    // pera limpia: redonda por abajo (entre las piernas), más ancha en la barriga, se estrecha hacia el domo de los hombros
    // (perfil diseñado para un tronco de 0,67: TORSO_K lo estira/acorta; TORSO_W lo ensancha por abajo —chibi rechoncho— y nada arriba)
    var prof = TORSO_PROF;
    var pts = []; for (var i = 0; i < prof.length; i++) pts.push(V2(prof[i][0] * lerp(TORSO_W, 1, clamp((prof[i][1] + 0.13) / 0.7, 0, 1)), prof[i][1] * TORSO_K));
    // piel a dos huesos: la mitad alta sigue al pecho (flexión suave del tronco sin costura)
    G.bone2 = r.bones.indexOf(r.chest); G.w2 = function (y) { return sstep(0.1 * TORSO_K, 0.5 * TORSO_K, y); };
    G.mode = 'wrap'; G.rows = TR_R; G.yr = [TR_Y0, TR_Y1];
    G.add(lathe(pts, 30, 14), null, 0, 0, 0, 0, 0, 0, 1, 1, 0.86);
    G.mode = 'flat'; G.bone2 = -1; G.w2 = null;
  }
  /** Radios (x, z) del tronco a la altura `yp` del hueso de la pelvis (el mismo perfil que torsoGeo): para apoyar piezas encima. */
  function torsoR(yp) {
    var P = TORSO_PROF, y = yp / TORSO_K, i, t, rr;
    if (y <= P[0][1]) return [0, 0];
    for (i = 1; i < P.length; i++) if (y <= P[i][1] || i === P.length - 1) break;
    t = clamp((y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]), 0, 1); rr = lerp(P[i - 1][0], P[i][0], t) * lerp(TORSO_W, 1, clamp((y + 0.13) / 0.7, 0, 1));
    return [rr, rr * 0.86];
  }
  var QT = null;
  /** Ángulos (Euler XYZ, los de Geo.add) que llevan el eje `ax` ('y' | 'z') de una pieza a la dirección (dx, dy, dz). */
  function aim(dx, dy, dz, ax) {
    if (!QT) QT = { q: new THREE.Quaternion(), e: new THREE.Euler(), a: new THREE.Vector3(), d: new THREE.Vector3() };
    QT.a.set(0, ax === 'z' ? 0 : 1, ax === 'z' ? 1 : 0); QT.d.set(dx, dy, dz).normalize();
    QT.q.setFromUnitVectors(QT.a, QT.d); QT.e.setFromQuaternion(QT.q, 'XYZ');
    return [QT.e.x, QT.e.y, QT.e.z];
  }
  /** Pieza con su eje `ax` orientado a (dx, dy, dz). */
  function addAim(G, geo, hex, x, y, z, d, ax, sx, sy, sz) { var e = aim(d[0], d[1], d[2], ax); G.add(geo, hex, x, y, z, e[0], e[1], e[2], sx, sy, sz); }

  // bola del hombro un punto más oscura que la camiseta: se lee como pieza aparte aunque el tronco sea del mismo color
  // (playa: hombro de piel por los tirantes; con la licra de surf, del color de la licra)
  function shoulderGeo(G, tc, X, beach) { G.add(sph(BALL_SH, 16, 12), beach ? (isLicra(X) ? underHex(X, tc) : X.skin) : mixHex(tc.base, tc.dark, 0.14)); }
  /** Brazo k (0 izquierdo, 1 derecho): tubo en su columna de ARM_R, girado para que gu = 0,5 mire hacia fuera. */
  function upperGeo(G, k) { G.mode = 'strip'; G.rows = ARM_R; G.su = COL_UP[k]; G.add(tube(TUBE_ARM, UPPER), null, 0, -UPPER / 2, 0, 0, TUBE_RY[k], 0); G.mode = 'flat'; G.su = SU_ALL; }
  /** Color de la bola del codo del brazo k: piel; cB con la manga larga (térmica en pista, licra en playa); el del manguito de ese
   *  brazo; con coderas, la codera (la bola hace de manguito acolchado y encima va la concha). */
  function elbowHex(X, tc, k) { return X.elbows === 'coderas' ? elbowPadHex(X, tc, k) : underElbowHex(X, tc, k); }
  function underElbowHex(X, tc, k) {
    var arm = k ? X.armR : X.armL, c = X.skin;
    if (longSleeve(X)) c = colB(X, tc);
    if (ARMS[arm] && arm !== 'kinesio') c = arm === 'manguitoOro' ? SLV_GOLD : arm === 'manguitoLlamas' ? tc.dark : arm === 'manguitoMazo' ? MAZO_DK :
      arm === 'manguitoBicolor' ? slvB(X, tc) : arm === 'manguitoFundido' ? mixHex(colA(X, tc), slvB(X, tc), 0.5) : colA(X, tc);   // (WP7: bicolor y degradado)
    return c;
  }
  /** Color de la codera del brazo k (WP5, T8): cPad si se elige; si no, la de la equipación (tc.pad) salvo que se pierda contra lo
   *  de debajo (manguito, térmica o piel): entonces el oscuro del equipo, blanco o casi negro (pick). */
  function elbowPadHex(X, tc, k) { return X.cPad >= 0 ? X.cPad : pick(tc.pad, underElbowHex(X, tc, k), tc, 130); }
  var EL_PAD_TH = 1.2;   // abertura de la concha de la codera (rad desde su polo)
  /** Antebrazo k: bola del codo y tubo en su columna de ARM_R (la piel, la térmica o el manguito van pintados). Coderas (WP5): una
   *  concha acolchada sobre la punta del codo (detrás y algo por fuera: de espaldas es lo que se ve en el partido), más larga a lo largo
   *  del brazo, con el reborde del acento (o lo que se distinga de la concha). 84 / 40 / 40 triángulos por brazo. */
  function foreGeo(G, X, tc, k) {
    // (manguito dorado: la bola del codo también de oro de cómic, con el brillo arriba y fuera y la sombra ocre abajo)
    if ((k ? X.armR : X.armL) === 'manguitoOro' && X.elbows !== 'coderas') { var so = k ? -1 : 1; G.vc = function (px, py, pz) { var d = (px * so * 0.5 + py * 0.6 + pz * 0.62) / (Math.sqrt(px * px + py * py + pz * pz) || 1); return d > 0.7 ? GOLD_HI : d > 0.35 ? SLV_GOLD_LT : d < -0.3 ? SLV_GOLD_SH : null; }; }
    G.add(sph(BALL_EL, 14, 10), elbowHex(X, tc, k), 0, 0, 0, 0, 0, 0); G.vc = null;
    if (X.elbows === 'coderas') {
      var pc = elbowPadHex(X, tc, k), rim = pick(colA(X, tc), pc, tc), s = k ? -1 : 1, lim = EL_PAD_TH * 0.8;
      G.owk = 0.8;
      G.vc = function (px, py, pz) { return Math.acos(clamp(py / (Math.sqrt(px * px + py * py + pz * pz) || 1), -1, 1)) > lim ? rim : null; };
      // (rx = −π/2 lleva el polo +Y de la concha a −Z, la espalda, y su eje Z a lo largo del brazo: sz la alarga; ry la gira hacia fuera)
      G.add(new THREE.SphereGeometry(BALL_EL * 1.16, sg(12, 8), sg(4, 3), 0, PI * 2, 0, EL_PAD_TH), pc, 0, -0.006, 0, -PI / 2, s * 0.55, 0, 1, 1, 1.3);
      G.vc = null; G.owk = 1;
    }
    G.mode = 'strip'; G.rows = ARM_R; G.su = COL_FORE[k];
    G.add(tube(TUBE_ARM, FORE), null, 0, -FORE / 2, 0, 0, TUBE_RY[k], 0);
    G.mode = 'flat'; G.su = SU_ALL;
  }
  /** Color de lo que hay en la muñeca del brazo k (para que la muñequera no se pierda contra él): el puño del manguito, el de la manga
   *  larga o la piel. */
  function wristBg(X, tc, k) {
    var arm = k ? X.armR : X.armL, lsl = longSleeve(X);
    // (WP7: el manguito medio no llega a la muñeca; el de antebrazo acaba en un puño cB2, y bicolor y degradado en uno más oscuro)
    if (ARMS[arm] && arm !== 'kinesio' && !lsl && !SLV_UP_ONLY[arm]) return arm === 'manguitoOro' ? GOLD_DK : arm === 'manguitoLlamas' || arm === 'manguitoMazo' ? colA(X, tc) :
      SLV_FORE_ONLY[arm] ? slvB(X, tc) : SLV_AB[arm] ? cuffHex(slvB(X, tc)) : colB(X, tc);
    return lsl ? cuffHex(colB(X, tc)) : X.skin;
  }
  /** Muñequera (WP5, T10): banda de rizo gruesa (alto h) con dos rebordes, de revolución: 5 tramos × 16 (160 / 100 / 80). */
  function cuffLathe(r0, h) {
    var rr = r0 + 0.018, rm = r0 + 0.014, b = h / 2, m = b - 0.02;
    return lathe([V2(r0, -b), V2(rr, -b + 0.009), V2(rm, -m), V2(rm, m), V2(rr, b - 0.009), V2(r0, b)], 16, 8);
  }
  // centro de la muñequera sobre la muñeca y su alto (ronda 1 de WP5: de 6,4 a 7,8 cm y un punto más gruesa; en el primer plano del
  // torso se quedaba en 1,2 % de la caja, por debajo del 1,5 % del plan)
  var WRIST_Y = 0.047, WRIST_H = 0.078;
  /** Muñequera de rizo, la de cañón y reloj (ranuras wristL / wristR) en el hueso del ANTEBRAZO, junto a la muñeca: así heredan el
   *  estirón (se alargan y adelgazan con el antebrazo, como el resto del brazo cartoon); en la mano, que recupera su tamaño con la escala
   *  inversa, quedarían flotando y más anchas que la muñeca estirada. Todo por encima de la manopla (tapa el antebrazo hasta ≈ 1 cm
   *  sobre la muñeca). La esfera del reloj mira hacia fuera (sin marca). */
  function wristGeo(G, X, tc, k) {
    var w = k ? X.wristR : X.wristL, s = k ? -1 : 1, y = -FORE + WRIST_Y, r0 = TUBE_ARM + 0.001;
    if (w === 'muneq') {             // del acento (o lo que se distinga de lo de debajo), los rebordes un punto más oscuros
      var cm = pick(colA(X, tc), wristBg(X, tc, k), tc, 130), cr = mixHex(cm, 0x000000, 0.2);
      G.owk = 0.6; G.vc = function (px, py) { return Math.abs(py) > WRIST_H / 2 - 0.022 ? cr : null; };
      G.add(cuffLathe(r0, WRIST_H), cm, 0, y, 0); G.vc = null;
    } else if (w === 'munhCanon') {  // jefe Cañón: la misma banda, negra, con el reborde de la mano (la boca del cañón) de cA
      var ca = pick(colA(X, tc), NEUTRAL_DK, tc, 130);
      G.owk = 0.6; G.vc = function (px, py) { return py < 0.022 - WRIST_H / 2 ? ca : py > WRIST_H / 2 - 0.022 ? 0x3a3a46 : null; };
      G.add(cuffLathe(r0, WRIST_H), NEUTRAL_DK, 0, y, 0); G.vc = null;
    } else if (w === 'muneqDoble') { // WP7: muñequera DOBLE: dos bandas de rizo apiladas (cB junto a la mano, cA encima) con un surco entre ellas
      var bg = wristBg(X, tc, k), ua = pick(colA(X, tc), bg, tc, 130), ub = pick(slvB(X, tc), bg, tc, 130), hh = 0.112, b = hh / 2, rr = r0 + 0.018, rm = r0 + 0.015;
      if (hexDist(ua, ub) < 120) ub = pick(ub, ua, tc);
      G.owk = 0.6; G.vc = function (px, py) { return py < -0.002 ? (Math.abs(py) > b - 0.02 ? mixHex(ub, 0x000000, 0.2) : ub) : (py > b - 0.02 ? mixHex(ua, 0x000000, 0.2) : null); };
      G.add(lathe([V2(r0, -b), V2(rr, -b + 0.009), V2(rm, -0.008), V2(r0 + 0.007, 0), V2(rm, 0.008), V2(rr, b - 0.009), V2(r0, b)], 16, 8), ua, 0, y + 0.012, 0);
      G.vc = null;
    } else if (w === 'cintaMuneca') {   // WP7: esparadrapo de color: dos vueltas de cinta solapadas (la de arriba un punto más ancha y clara)
      var tb = pick(colA(X, tc), wristBg(X, tc, k), tc, 130), tl = mixHex(tb, 0xffffff, 0.22), ch = 0.074, cb = ch / 2;
      G.owk = 0.7; G.vc = function (px, py) { return py > 0.0 ? tl : null; };
      G.add(lathe([V2(r0 - 0.001, -cb), V2(r0 + 0.007, -cb + 0.004), V2(r0 + 0.007, -0.004), V2(r0 + 0.011, 0.0), V2(r0 + 0.011, cb - 0.004), V2(r0 + 0.002, cb)], 16, 8), tb, 0, y + 0.004, 0);
      G.vc = null;
    } else if (w === 'reloj') {      // correa ancha oscura y caja gorda del acento con la esfera blanca hacia fuera
      var rs = r0 + 0.002;
      G.owk = 0.5; G.add(lathe([V2(rs, -0.029), V2(rs + 0.009, -0.021), V2(rs + 0.009, 0.021), V2(rs, 0.029)], 16, 8), NEUTRAL_DK, 0, y, 0);   // correa
      G.owk = 0.7; G.add(cyl(0.044, 0.044, 0.028, 16), pick(colA(X, tc), NEUTRAL_DK, tc, 130), s * (rs + 0.018), y, 0, 0, 0, PI / 2);          // caja
      if (LODR > 0) { G.owk = 0; G.add(new THREE.CircleGeometry(0.033, sg(12, 8)), 0xf4f4f4, s * (rs + 0.0322), y, 0, 0, s * PI / 2, 0); }   // esfera (no en LOD0)
    }
    G.owk = 1;
  }
  /** Manopla grande y redonda (sin dedos) con el pulgar insinuado. Plano de la mano = Y-Z del hueso (grosor en X); en la esfera unidad
   *  de la manopla, y = −1 es la punta de los dedos y +1 la muñeca. Vestuario (WP5, por color de vértice, sin piezas aparte):
   *  - mitones (T9): guante SIN dedos: puntas de piel, cuerpo de cA y puño acanalado (gajos alternos) junto a la muñeca;
   *  - dedos vendados (T4): las puntas de piel, dos vueltas de esparadrapo con una raya entre ellas y el pulgar vendado; sobre piel
   *    clara el esparadrapo es blanco puro y la raya, sombra de la piel; el de hierro, gris acero con la raya oscura.
   *  Ronda 1 de WP5: las franjas se cortan por ANILLOS de la esfera (bandas de latitud enteras, según los anillos de este LOD) y los gajos
   *  por sus meridianos: con un umbral cualquiera en y, en cada cuadrilátero un triángulo caía a cada lado y salían dientes de sierra. */
  function handGeo(G, X, tc, s) {
    var K = HAND_K, tp = TAPED[X.hands], sk = X.skin, ca = colA(X, tc), mit = X.hands === 'mitones';
    if (tp === -1) tp = pick(colA(X, tc), sk, tc, 130);   // (WP7: dedos vendados de color: esparadrapo de cA, o lo que se distinga de la piel)
    // (T4: sobre piel clara el esparadrapo blanco se fundía con la mano y solo se veían las rayas grises: ahí va NEGRO, con la raya de
    //  piel entre vuelta y vuelta, como el vendaje de tobillo de playa)
    var lt = lumHex(sk) > 0.62, blk = tp === TAPE && lt; if (blk) tp = 0x26262e;
    var td = tp ? (tp === STEEL ? STEEL_DK : blk ? 0x5a5a66 : mixHex(tp, INK, lt ? 0.4 : 0.22)) : 0, cad = mixHex(ca, 0x000000, 0.28);
    var gap = tp === STEEL ? td : blk ? sk : lt ? mixHex(sk, INK, 0.5) : sk;
    var hs = sg(12, 5), ws = sg(16, 8), dA = PI / hs, dW = 2 * PI / ws;
    // anillo (0 = muñeca, hs − 1 = punta) del triángulo con centro en y: su centro siempre cae entre los dos anillos de su banda
    function ring(py) { return Math.min(hs - 1, Math.floor(Math.acos(clamp(py, -1, 1)) / dA)); }
    G.owk = 0.75;
    if (mit) {
      // (los dedos SALEN del guante: la mitad de la mano es piel y la tela acaba en un dobladillo oscuro. Con el 64 % de tela y una
      // puntita de piel parecía un guante de boxeo)
      var kTip = Math.round(hs * 0.38), kCuff = Math.round(hs * 0.17), hem = hs >= 8;
      G.vc = function (px, py, pz) {
        var r = ring(py);
        if (r >= kTip) return sk;
        if (hem && r === kTip - 1) return cad;   // dobladillo donde salen los dedos
        if (r < kCuff) return Math.floor((Math.atan2(px, pz) + PI * 2.5) / dW) % 2 ? cad : null;   // puño acanalado (un gajo de cada)
        return null;
      };
    } else if (tp) {
      // desde la punta: piel, vuelta, raya, vuelta (con pocos anillos, LOD0: piel y una vuelta ancha)
      var kT = hs >= 10 ? hs - 2 : hs - 1, many = hs >= 7;
      G.vc = function (px, py) {
        var r = ring(py);
        if (r >= kT) return null;
        if (r === kT - 1) return tp;
        if (many) return r === kT - 2 ? gap : r === kT - 3 ? tp : null;
        return r === kT - 2 ? tp : null;
      };
    }
    G.add(sph(1, 16, 12), mit ? ca : sk, 0, -PALM, 0.004, 0, 0, 0, 0.058 * K, 0.108 * K, 0.094 * K);
    // pulgar: la punta es su −Y (abajo y hacia delante). Casi solo asoma el casquete de la punta (el tubo queda dentro de la palma), así
    // que las franjas van por los ANILLOS de ese casquete, como en la palma (ronda 2 de WP5: con un umbral en y salía una estrella de
    // dientes de sierra). Casquete de capsule(1, 1,4, cs): de y = −0,7 a −1,7, con n = 2·cs bandas de latitud (Path.getPoints dobla las
    // divisiones de los arcos); cb = banda del triángulo, 0 junto al tubo y n − 1 la de la punta.
    var cs = Math.max(1, Math.round(2 * LODK)), nb = 2 * cs;
    function cb(py) { return py > -0.7 ? -1 : Math.min(nb - 1, Math.floor(Math.asin(clamp(-0.7 - py, 0, 1)) / (PI / 2 / nb))); }
    if (mit) G.vc = function (px, py) { return cb(py) >= 0 ? sk : null; };   // el pulgar, fuera del guante: todo el casquete de piel
    // vendado: punta de piel, vuelta, raya (la misma que entre las vueltas de los dedos) y vuelta; con pocas bandas (LOD0 y LOD1, los del
    // partido) como antes: casquete de esparadrapo y el tubo con la tira oscura, que es lo que más se distingue de la piel a esa distancia
    // (con la punta de piel y la raya, el pulgar vendado se perdía en el partido: playa 9 → 4 px)
    else if (tp) G.vc = nb >= 4 ? function (px, py) { var b = cb(py); return b === nb - 1 ? sk : b === nb - 3 ? gap : null; }
      : function (px, py) { return cb(py) < 0 ? td : null; };
    else G.vc = null;
    G.add(capsule(1, 1.4, 2, 8), mit ? ca : tp || sk, 0, -0.06 * K, 0.085 * K, -0.75, 0, 0, 0.034 * K, 0.034 * K, 0.034 * K);
    G.vc = null;
    G.owk = 1;
  }
  // ---------- PIERNAS Y PIES (WP4 del plan del Vestuario): lo que se VE ----------
  // La espinilla del chibi mide 0,23: el zapatón tapa los ~0,044 de abajo y la bola de la rodilla los ~0,073 de arriba, así que de
  // calcetín, tobillera y rodillera solo queda una ventana de ~0,11 (y en el partido el muñeco mide ~98 px y se ve de espaldas). Por
  // eso todo lo de la pierna se coloca por ALTURA sobre el tobillo (h) y se pasa a fracción de la tira: legF (0 rodilla, 1 tobillo) y
  // thighF (d = distancia sobre la rodilla; 0 cadera, 1 rodilla). Antes las bandas iban a fracciones fijas y caían dentro del zapatón
  // o de la bola (P1-P4 del plan).
  var KNEE_UP = 0.014, KNEE_DN = 0.022;   // lo que la rodillera alta sale de la bola por arriba (muslo) y por abajo (espinilla)
  // Con malla larga la funda alta se queda justo al borde de la bola que SE VE (solo asoman los aros): si no, entre la funda y el calcetín
  // no se veía la malla (ronda 1). Ojo: por delante, la bola tapa el tubo solo hasta kneeVis (donde la elipse de la bola corta la
  // superficie del tubo), no hasta kneeR (el polo de abajo, en el eje): en la chibi son 0,058 frente a 0,077.
  function kneeVis(X, r) { var ry = kneeR(X), rx = BALL_KN * 1.08 * (KNEE_HI[X.knees] ? 1.12 : 1), q = Math.min(0.95, r / rx); return ry * Math.sqrt(1 - q * q); }
  function padUpH(X) { return kneeTights(X, 0) ? kneeVis(X, TUBE_LEG) - kneeR(X) + 0.008 : KNEE_UP; }
  function padDnH(X) { return kneeTights(X, 0) ? kneeVis(X, TUBE_LEG * 0.96) - kneeR(X) + 0.012 : KNEE_DN; }
  // Tobillera acolchada de pista: su borde de arriba queda a la altura de siempre (la de las clásicas, BRACE_UP sobre su zapatón) o, si el
  // modelo es más alto (las neón, de suela gorda: lo tapaban todo menos el labio), BRACE_UP_HI sobre ese zapatón (por delante la puntera
  // tapa unos 2 cm más de lo que dice shoeTopH). Deja ver el calcetín encima.
  var BRACE_UP = 0.032, BRACE_UP_HI = 0.046;
  var ANKLET_H = 0.04;                   // altura de las tobilleras de playa (por encima del empeine descalzo, que llega a +0,017)
  /** Parte de arriba del zapatón (h sobre el tobillo) a la altura de la espinilla, según la FORMA del modelo puesto (SHOE_SHAPE: suela +
   *  empeine en z = 0; el empeine está centrado zc por delante). Ronda 1 de WP4: antes era siempre el clásico y las neón (suela gorda)
   *  tapaban la tobillera y el calcetín tobillero. */
  function shoeTopH(X) {
    var S = SHOE_SHAPE[X && SHOE_UP[X.shoes] ? X.shoes : 'clasicas'], q = 0.055 / S.rz;
    var t = -ANKLE + S.sole + S.hd * Math.sqrt(FOOT_K) * Math.sqrt(1 - q * q);
    return S.cuff ? Math.max(t, S.cuff) : t;   // (botín alto: el borde de la caña)
  }
  /** ¿Se ve la tobillera acolchada? (pista; con el botín alto va dentro de la caña: ronda 1 de WP7) */
  function hasBrace(X, beach) { return !beach && X.ankle === 'blanca' && !(SHOE_SHAPE[X.shoes] || {}).cuff; }
  function braceH(X) { var b = shoeTopH(null) + BRACE_UP, t = shoeTopH(X); return t + BRACE_UP_HI > b + 0.02 ? t + BRACE_UP_HI : b; }   // borde de arriba de la tobillera
  /** Color del calcetín: cSock; en automático (el acento), si se funde con el empeine (el amarillo con las doradas), el primero de
   *  base, blanco, oscuro o casi negro que se distinga de la zapatilla y de la piel. auto: el que tendría en automático (lo que mira la
   *  geometría —tobillera, rodillera bajada—: así cambiar cSock solo repinta el atlas, como cualquier color pintado). */
  // Ronda 2: el umbral contra el empeine es 200 (no 150): el amarillo del kit B y el oro de las doradas quedan a 160 y con la luz se
  // funden; con las doradas se mira también el brillo del oro (GOLD). Si nada se distingue de la zapatilla Y de la piel, el que más se
  // aleje de la zapatilla (antes volvía al acento: justo el que se quería evitar).
  function sockHex(X, tc, auto) {
    var c = auto ? tc.accent : colSock(X, tc), up = shoeUp(X), k = [tc.base, 0xf4f4f4, tc.dark, NEUTRAL_DK], i, b = -1, bd = -1, d;
    function vsShoe(h) { return Math.min(hexDist(h, up), X.shoes === 'doradas' ? hexDist(h, GOLD) : 1e9); }
    if ((!auto && X.cSock >= 0) || vsShoe(c) >= 200) return c;
    for (i = 0; i < k.length; i++) if (typeof k[i] === 'number' && vsShoe(k[i]) >= 200 && hexDist(k[i], X.skin) >= 150) return k[i];
    for (i = 0; i < k.length; i++) if (typeof k[i] === 'number' && (d = vsShoe(k[i])) > bd) { bd = d; b = k[i]; }
    return bd > vsShoe(c) ? b : c;
  }
  /** Color de la tobillera acolchada: blanca o casi negra (o el acento / base del equipo) que se distinga del empeine, del calcetín de
   *  encima (el automático) y de la piel (la casi negra sobre una piel oscura sin calcetín no se veía). */
  function braceHex(X, tc) {
    // (sin calcetín no hay que distinguirse de él: con la piel oscura y las neón la blanca quedaba descartada por un calcetín que no se
    //  lleva y salía la casi negra, que se perdía contra la piel; ronda 2)
    var up = shoeUp(X), so = X.socks ? sockHex(X, tc, true) : -1, c = lumHex(up) > 0.62 ? [0x2c2c34, 0xf4f4f4] : [0xf4f4f4, 0x2c2c34], i;
    c.push(tc.accent, tc.base);
    // (por orden: que se distinga de las tres cosas; si ninguno, de la zapatilla y el calcetín —lo normal en pista es llevarlo: va
    //  encima—; si no, de la zapatilla y la piel; si no, de la zapatilla)
    for (var pass = 0; pass < 4; pass++) for (i = 0; i < c.length; i++) {
      if (typeof c[i] === 'number' && hexDist(c[i], up) >= 200 && (pass === 1 || pass === 3 || hexDist(c[i], X.skin) >= 140) &&
        (pass > 1 || so < 0 || hexDist(c[i], so) >= 200)) return c[i];
    }
    return c[0];
  }
  function kneeR(X) { return BALL_KN * (X && KNEE_HI[X.knees] ? 1.1 : 1.04); } // radio vertical de la bola de la rodilla
  function legF(h) { return clamp(1 - h / SHIN, 0, 1); }
  function thighF(d) { return clamp(1 - d / THIGH, 0, 1); }
  /** Altura del borde de arriba del calcetín (h sobre el tobillo). w0..w1 = la ventana que se ve (zapatón..bola de la rodilla). */
  function sockTopH(sock, k, brace, w0, w1, X) {
    if (sock === 'tobilleros') return brace ? Math.min(braceH(X) + 0.05, w0 + 0.75 * (w1 - w0)) : w0 + 0.044;   // con tobillera asoma por encima
    // malla larga + calcetín alto: el calcetín se queda a media espinilla y entre él y la rodillera alta se ve la malla (ronda 1: con
    // rodilleras altas y calcetín hasta la rodilla no quedaba ni un píxel de malla)
    if (X && X.legs === 'mallaLarga' && (sock === 'altos' || sock === 'altosRayas')) return Math.max(w0 + (KNEE_HI[X.knees] ? 0.32 : 0.4) * (w1 - w0), brace ? braceH(X) + 0.022 : 0);   // (ronda 2: con funda alta, algo más abajo: la malla era una raya)
    if (X && X.legs === 'mallaLarga' && sock === 'media' && KNEE_HI[X.knees]) return Math.max(w0 + 0.3 * (w1 - w0), brace ? braceH(X) + 0.016 : 0);
    if (sock === 'media') return w0 + 0.84 * (w1 - w0);
    if (sock === 'altos' || sock === 'altosRayas') return w1 + 0.02;             // hasta debajo de la rodilla
    if (sock === 'desparejados') return k ? w0 + 0.62 * (w1 - w0) : w1 + 0.02;   // uno alto y otro a media espinilla
    if (sock === 'compresion') return w1 + 0.02;                                 // (WP7) hasta debajo de la rodilla
    if (sock === 'lunares') return w1 + 0.02;                                    // (ronda 1 de WP7: hasta la rodilla; a media espinilla era «media»)
    if (sock === 'caido') return w0 + 0.92 * (w1 - w0);                          // arrugado, casi hasta la rodilla (ronda 1 de WP7)
    return 0;
  }
  // un detalle de color c sobre el color bg: el pedido si se distingue; si no, el base del equipo y, si tampoco, oscuro o blanco
  function onCol(want, bg, tc) {
    if (hexDist(want, bg) >= 150) return want;
    if (tc && typeof tc.base === 'number' && hexDist(tc.base, bg) >= 220) return tc.base;
    return lumHex(bg) > 0.5 ? NEUTRAL_DK : 0xf4f4f4;
  }
  /** Puño de la manga larga (térmica, licra): más oscuro que la manga o, si la manga ya es muy oscura, más claro (negro sobre negro no se ve). */
  function cuffHex(c) { return lumHex(c) < 0.2 ? mixHex(c, 0xffffff, 0.28) : mixHex(c, 0x000000, 0.32); }
  /** Ayuda de contraste (WP5, T3/T4/T8): el color pedido si se distingue del de debajo (distancia ≥ d, 150 por defecto); si no, el
   *  oscuro del equipo, blanco o casi negro: el primero que se aleje d + 50, o el que más se aleje. Solo usa la equipación y constantes
   *  (nunca cB): así la firma de la malla no depende de más colores de los que ya lleva cada pieza. */
  function pick(want, bg, tc, d) {
    d = d || 150;
    if (hexDist(want, bg) >= d) return want;
    var c = [tc && tc.dark, 0xf8f8f4, NEUTRAL_DK], best = want, bd = -1, i, dd;
    for (i = 0; i < c.length; i++) { if (typeof c[i] !== 'number') continue; dd = hexDist(c[i], bg); if (dd >= d + 50) return c[i]; if (dd > bd) { bd = dd; best = c[i]; } }
    return best;
  }
  /** pick contra DOS fondos (lo de debajo y lo de al lado): el primero que se distinga de los dos o, si ninguno, el que más del peor. */
  function pick2(want, bg1, bg2, tc, d) {
    d = d || 150;
    var c = [want, 0xf8f8f4, tc && tc.base, tc && tc.dark, NEUTRAL_DK], best = want, bd = -1, i, dd;
    for (i = 0; i < c.length; i++) {
      if (typeof c[i] !== 'number') continue;
      dd = Math.min(hexDist(c[i], bg1), hexDist(c[i], bg2)); if (dd >= d) return c[i];
      if (dd > bd) { bd = dd; best = c[i]; }
    }
    return best;
  }
  /** Color de las rodilleras: el elegido (cPad) o, en automático, el de la equipación salvo que se pierda contra lo de debajo (la piel,
   *  o la malla larga): a menos de 0,15 de luminancia pasa a blanco, al acento o a casi negro (P6: negro sobre negro con malla larga). */
  function padHex(X, tc) {
    if (X.cPad >= 0) return X.cPad;
    var bg = kneeTights(X, 0) ? tightsOf(X, tc) : X.skin, c = [tc.pad, 0xf4f4f4, tc.accent, NEUTRAL_DK], i;
    // (la ALTA sube por el muslo hasta casi el pantalón: que tampoco sea de su color, o rodillera negra + pantalón negro se leía como
    //  unas mallas negras. P6 del plan)
    // (ni del color del calcetín, que va justo debajo: rodillera roja + calcetín rojo era un solo tubo rojo; contra la piel basta con que
    //  se distinga en luz o en color: el blanco sobre piel clara se ve)
    // (revisión final: la CORTA de serie también: negra con el pantalón negro del kit A se leía, de lejos, como un pantalón más largo)
    // (pulido: la blanca —o casi blanca— solo sobre piel oscura: sobre piel clara o media, rodillera blanca + espinilla clara + calcetín
    //  blanco se leían de lejos como un solo tubo blanco; entonces va la siguiente: el acento, el oscuro o el acento apagado)
    var sh = (KNEE_HI[X.knees] || X.knees === 'cortas') && typeof tc.shorts === 'number' ? tc.shorts : -1, so = sh >= 0 ? sockHex(X, tc, true) : -1;   // (el automático: no depende de si se llevan, la firma de malla no mira los calcetines)
    var wOk = lumHex(bg) < 0.55;
    var c2 = sh >= 0 ? c.concat([tc.dark, mixHex(tc.accent, 0x000000, 0.45)]) : c;   // (y, si nada de eso vale, el oscuro o el acento apagado)
    for (i = 0; i < c2.length; i++) if (typeof c2[i] === 'number' && sh >= 0 && (Math.abs(lumHex(c2[i]) - lumHex(bg)) >= 0.15 || hexDist(c2[i], bg) >= 120) &&
      hexDist(c2[i], sh) >= 120 && (so < 0 || hexDist(c2[i], so) >= 150) && (wOk || hexDist(c2[i], 0xf4f4f4) >= 130)) return c2[i];
    for (i = 0; i < c.length; i++) if (typeof c[i] === 'number' && Math.abs(lumHex(c[i]) - lumHex(bg)) >= 0.15) return c[i];
    return tc.pad;
  }
  /** Color de la malla corta: cB si se elige; en automático, el primero de oscuro, base, acento, blanco o negro del equipo que se
   *  distinga del pantalón (≥ 0,25 de luminancia o un color bien distinto: P5, antes iba del color del pantalón) y de la piel (el
   *  blanco sobre una piel clara no se ve). Ronda 1: en pista asoma bajo la rodillera, junto al calcetín: primero se busca uno que
   *  tampoco sea del color del calcetín (rojo sobre rojo se leía como un calcetín más alto), admitiendo también el acento o el base
   *  oscurecidos y un contraste con el pantalón algo menor (ya no es solo el muslo); si no hay, como antes. */
  function tightsHex(X, tc, beach) {
    if (X.cB >= 0) return X.cB;
    var top = beach ? tc.base : tc.shorts, c = [tc.dark, tc.base, tc.accent, 0xf4f4f4, NEUTRAL_DK], i, so = !beach && X.socks ? sockHex(X, tc) : -1, d;
    // (ronda 2: con rodillera que tapa la rodilla, la malla corta asoma justo encima y debajo de ella: blanca con la rodillera blanca era
    //  un solo tramo blanco del pantalón al calcetín)
    var pd = !beach && X.legs === 'malla' && (X.knees === 'cortas' || X.knees === 'altas' || X.knees === 'rodillerasColor' || X.knees === 'rodilleraUna') ? padHex(X, tc) : -1;
    function vsTop(h) { return Math.abs(lumHex(h) - lumHex(top)) >= 0.25 || hexDist(h, top) >= 260; }
    if (so >= 0) {
      d = c.concat([mixHex(tc.accent, 0x000000, 0.45), mixHex(tc.base, 0x000000, 0.45)]);
      for (i = 0; i < d.length; i++) if (typeof d[i] === 'number' && hexDist(d[i], so) >= 140 && hexDist(d[i], X.skin) >= 120 && (pd < 0 || hexDist(d[i], pd) >= 140) &&
        (vsTop(d[i]) || (i >= c.length && hexDist(d[i], top) >= 110))) return d[i];
    }
    for (i = 0; i < c.length; i++) if (typeof c[i] === 'number' && vsTop(c[i]) && hexDist(c[i], X.skin) >= 120) return c[i];
    return lumHex(top) > 0.5 ? NEUTRAL_DK : 0xf4f4f4;
  }
  function thighGeo(G, tc, X, beach, k) {
    G.add(sph(BALL_HIP, 12, 9), beach ? tc.base : tc.shorts);                // bola de la cadera (asoma al levantar la pierna); playa: malla
    G.mode = 'strip'; G.rows = TH_R; G.su = COL_TH[k]; G.add(tube(TUBE_LEG, THIGH), null, 0, -THIGH / 2, 0, 0, TUBE_RY[k], 0); G.mode = 'flat'; G.su = SU_ALL;
    // rodillera alta: la funda pintada sigue por el muslo y acaba en un aro (el borde se ve de lado y de espaldas)
    if (KNEE_HI[X.knees]) { G.owk = 0.5; G.add(cyl(TUBE_LEG + 0.0035, TUBE_LEG + 0.0035, 0.01, 14, true), padRim(X, tc), 0, -THIGH + kneeR(X) + padUpH(X) - 0.004, 0); G.owk = 1; }
  }
  /** Aro del borde de la rodillera alta: del acento del equipo (o lo que se distinga de la rodillera); la de pulpo, ventosa clara. */
  /** Rodillera BAJADA: el aro cae sobre el borde del calcetín (media): en automático, que no sea del color del calcetín (se leía como
   *  un calcetín más alto) ni de la piel. */
  function dropPadHex(X, tc, beach) {
    var p = padHex(X, tc), so, c, i;
    if (X.cPad >= 0 || beach) return p;
    // ronda 2: además de otro color, otro BRILLO (≥ 0,3): blanco sobre el amarillo del kit B seguía leyéndose como un puño de calcetín
    so = sockHex(X, tc, true);
    // (y que se separe de lo que tiene encima y debajo en la espinilla: la malla larga, si la hay —negra sobre negra se perdía—)
    var under = kneeTights(X, 0) ? tightsOf(X, tc) : -1;
    function vsSock(h) { return hexDist(h, so) >= 150 && Math.abs(lumHex(h) - lumHex(so)) >= 0.3 && (under < 0 || hexDist(h, under) >= 150); }
    if (vsSock(p)) return p;
    c = [tc.pad, tc.accent, tc.base, 0xf4f4f4, NEUTRAL_DK];
    for (i = 0; i < c.length; i++) if (typeof c[i] === 'number' && vsSock(c[i]) && Math.abs(lumHex(c[i]) - lumHex(X.skin)) >= 0.15) return c[i];
    for (i = 0; i < c.length; i++) if (typeof c[i] === 'number' && vsSock(c[i])) return c[i];   // (va SOBRE el calcetín: manda él)
    return p;
  }
  function padRim(X, tc) { return X.knees === 'rodiPulpo' ? PULPO_HI : onCol(tc.accent, padHex(X, tc), tc); }
  /** Bola de la rodilla: rodillera (cortas, altas: padHex) o rodilla desnuda (bajadas o sin; con malla larga, cB). */
  function kneeHex(X, tc, k) { return X.knees === 'rodiPulpo' ? PULPO : X.knees === 'rodillerasColor' ? cupHex(X, tc) : padOn(X, k) ? padHex(X, tc) : kneeTights(X, k) ? tightsOf(X, tc) : X.skin; }
  /** Rodillera de dos colores (WP7, ronda 1): la almohadilla (la bola) ENTERA de color —cA o lo primero que se distinga de la funda y
   *  del calcetín automático— y la funda de arriba y abajo del color de rodillera, lisa. Antes la bola llevaba una franja y la funda
   *  rayas: con calcetines de rayas todo era un solo tubo rayado y la rodillera no se leía. */
  function cupHex(X, tc) {
    var pd = padHex(X, tc), so = sockHex(X, tc, true), c = [colA(X, tc), tc.base, 0xf4f4f4, tc.dark, NEUTRAL_DK], i;
    for (i = 0; i < c.length; i++) if (typeof c[i] === 'number' && hexDist(c[i], pd) >= 150 && hexDist(c[i], so) >= 150) return c[i];
    return pick(colA(X, tc), pd, tc);
  }
  /** ¿Lleva la pierna k una rodillera que tapa la bola? (cortas, altas, de color y la de un lado —solo la izquierda—; la de pulpo aparte) */
  function padOn(X, k) { var n = X.knees; return n === 'cortas' || n === 'altas' || n === 'rodillerasColor' || (n === 'rodilleraUna' && k !== 1); }
  // ventosas de la rodillera de pulpo (solo LOD2, bola de 16 × 12): casillas [columna, fila] de la esfera, una cara doble cada una,
  // al tresbolillo por delante (+Z: columna 4 de 16 = 90°, filas 5-7 de 12 = el ecuador)
  var PULPO_Q = { '2,5': 1, '4,5': 1, '6,5': 1, '3,7': 1, '5,7': 1, '1,7': 1, '7,7': 1 };
  function pulpoDots(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1, ph = Math.atan2(z, -x); if (ph < 0) ph += PI * 2;
    return PULPO_Q[Math.floor(ph / (PI / 8)) + ',' + Math.floor(Math.acos(clamp(y / l, -1, 1)) / (PI / 12))] ? PULPO_HI : null;
  }
  function shinGeo(G, tc, X, beach, k) {
    // rodilla: bola = RODILLERA (padHex); en la playa, la rodilla desnuda (piel); altas: algo mayor
    var hi = !!KNEE_HI[X.knees], sr = TUBE_LEG * 0.96, yA = -SHIN;
    if (X.knees === 'rodiPulpo' && LODR === 2) G.vc = pulpoDots;   // ventosas por delante
    G.add(sph(BALL_KN, 16, 12), kneeHex(X, tc, k), 0, 0, 0.004, 0, 0, 0, hi ? 1.08 * 1.12 : 1.08, hi ? 1.1 : 1, hi ? 1.04 * 1.12 : 1.04);
    G.vc = null;
    G.mode = 'strip'; G.rows = SHN_R; G.su = COL_SHN[k]; G.add(tube(sr, SHIN), null, 0, -SHIN / 2, 0, 0, TUBE_RY[k], 0); G.mode = 'flat'; G.su = SU_ALL;
    if (hi) { G.owk = 0.5; G.add(cyl(sr + 0.0035, sr + 0.0035, 0.01, 14, true), padRim(X, tc), 0, -kneeR(X) - padDnH(X) + 0.004, 0); G.owk = 1; }   // borde de abajo de la funda
    else if (X.knees === 'bajadas') {   // rodillera BAJADA: la almohadilla resbalada a media espinilla, un aro gordo; la rodilla, de piel
      G.add(lathe([V2(sr + 0.001, -0.025), V2(0.013 + sr, -0.013), V2(0.013 + sr, 0.013), V2(sr + 0.001, 0.025)], 14, 6), dropPadHex(X, tc, beach), 0, -kneeR(X) - 0.03, 0);
    }
    if (hasBrace(X, beach)) {   // tobillera acolchada de pista: sale del zapatón (P1), con el borde de arriba del color del equipo
      // (oscura sobre un empeine claro —las clásicas blancas de serie, las neón— y blanca sobre uno oscuro: si no, se funde con la zapatilla)
      // (y que no se funda con el calcetín de encima: con las doradas y un calcetín blanco, la blanca no se veía)
      var bc = braceHex(X, tc), bt = onCol(tc.accent, bc, tc), br = sr + 0.0105, bh = braceH(X);
      G.vc = function (px, py) { return py > bh - 0.014 ? bt : null; };
      var b0 = -0.004;
      G.add(lathe([V2(br - 0.004, b0), V2(br + 0.002, b0 + 0.016), V2(br + 0.001, bh - 0.016), V2(br - 0.006, bh)], 14, 6), bc, 0, yA, 0);
      G.vc = null;
    }
    // tobilleras de playa (P2): alrededor de la espinilla, por encima del empeine descalzo (antes quedaban dentro del pie)
    if (beach && (X.ankle === 'tela' || X.ankle === 'tobiPulpo')) {
      var ra = sr + 0.004, ca = colA(X, tc);
      if (X.ankle === 'tobiPulpo') {   // jefe Pulpo: la de tela con ventosas claras alternas por fuera
        var ct = mixHex(ca, PULPO_HI, 0.7), st = 2 * PI / sg(16, 10);
        G.vc = function (px, py) { return Math.sqrt(px * px + py * py) > ra + 0.004 && Math.floor((Math.atan2(py, px) + PI) / st) % 2 === 0 ? ct : null; };
      }
      G.owk = 0.5; G.add(torus(ra, 0.012, 5, 16), ca, 0, yA + ANKLET_H, 0, PI / 2, 0, 0); G.vc = null; G.owk = 1;
    }
    else if (beach && X.ankle === 'cuentasTob') {   // WP7: tobillera de cuentas GORDAS de colores (en LOD2, bolitas; si no, un aro de gajos)
      var cq = [colA(X, tc), 0xf6f1e4, 0x2ec4c4, 0xff7a5a], cr = sr + 0.014, nq = 10;
      if (hexDist(cq[0], cq[2]) < 120) cq[2] = 0xffd23a;
      if (LODR === 2) {
        G.owk = 0.5; for (var q = 0; q < nq; q++) { var qa = 2 * PI * (q + 0.5) / nq; G.add(new THREE.IcosahedronGeometry(0.0158, 0), cq[q % 4], Math.cos(qa) * cr, yA + ANKLET_H + 0.003 * Math.sin(qa * 2), Math.sin(qa) * cr); }
      } else {
        var qs = 2 * PI / sg(14, 10);
        G.vc = function (px, py) { return cq[Math.floor((Math.atan2(py, px) + PI) / qs) % 4]; };
        G.owk = 0.4; G.add(torus(sr + 0.006, 0.012, 5, 14), cq[0], 0, yA + ANKLET_H, 0, PI / 2, 0, 0); G.vc = null;
      }
      G.owk = 1;
    }
    else if (beach && X.ankle === 'pulseraTob') {   // pulsera de cuentas (cA y blanco), algo ladeada (en LOD0 también: sg la simplifica)
      var pa = colA(X, tc), pb = onCol(0xf4f4f4, pa, tc), ps = 2 * PI / sg(14, 10);
      if (hexDist(pb, X.skin) < 150) pb = mixHex(pa, 0x000000, 0.45);   // (cuentas blancas sobre piel clara no se ven: del acento oscurecido)
      G.vc = function (px, py) { return Math.floor((Math.atan2(py, px) + PI) / ps) % 2 ? pb : null; };
      G.owk = 0.4; G.add(torus(sr + 0.005, 0.0095, 5, 14), pa, 0, yA + ANKLET_H - 0.004, 0, PI / 2 + 0.14, 0, 0); G.vc = null; G.owk = 1;
    }
  }
  /** Playa: pie DESCALZO de muñeco (empeine redondo de piel, planta con arena, dedo gordo insinuado); escarpines = pie de cSock. Las
   *  tobilleras (tela, pulsera, pulpo) van en la espinilla (shinGeo). La planta queda en -ANKLE como la suela del zapatón.
   *  s: 1 izquierdo, -1 derecho (el dedo gordo, hacia dentro). */
  var SAND_HEX = 0xe8cf9a;
  /** Esparadrapo del tobillo vendado (WP7, ronda 1): negro sobre piel clara o media, blanco sobre piel oscura (que se lea de lejos). */
  function ankleTape(sk) { return lumHex(sk) > 0.42 ? 0x2a2c33 : TAPE; }
  function footGeo(G, X, tc, s) {
    // (WP7: escarpines de neopreno —pie oscuro con la suela de cA, que de espaldas se ve— y vendaje: tobillo y empeine de esparadrapo, dedos libres)
    var K = FOOT_K, Y = -ANKLE + 0.062, esc = X.ankle === 'escarpines', neo = X.ankle === 'escarpinesNeo', tap = X.ankle === 'vendajeTob';
    var sk = esc ? colSock(X, tc) : neo ? NEO : X.skin, tp = ankleTape(X.skin);
    G.add(sph(0.05 * K, 12, 8), tap ? tp : sk, 0, -0.045, -0.012, 0, 0, 0, 1, 1.0, 1.1);                                    // tobillo y talón
    if (tap) G.vc = function (px, py, pz) { return pz < 0.25 ? tp : null; };
    G.add(sph(1, 16, 10, 0, PI * 2, 0, PI * 0.5), sk, 0, Y, 0.045 * K, 0, 0, 0, 0.078 * K, 0.07 * Math.sqrt(K), 0.14 * K);     // empeine (media esfera)
    G.vc = null;
    G.add(sph(1, 16, 6, 0, PI * 2, PI * 0.5, PI * 0.5), neo ? pick(colA(X, tc), NEO, tc) : mixHex(sk, SAND_HEX, esc ? 0.3 : 0.4), 0, Y, 0.045 * K, 0, 0, 0, 0.08 * K, 0.062, 0.142 * K); // planta con arena
    // (con los escarpines de neopreno, sin dedo gordo: era una bola oscura que asomaba en la puntera; ronda 1 de WP7)
    if (!neo) { G.owk = 0.5; G.add(sph(0.03 * K, 10, 7), sk, -s * 0.034 * K, Y + 0.004, 0.045 * K + 0.125 * K, 0, 0, 0, 1, 0.8, 1.1); }   // dedo gordo
    G.owk = 1;
  }
  /** Zapatón redondeado grande: empeine (media esfera con el polo delante) + suela (media esfera aplastada) + cuello y ribete; la planta
   *  queda en -ANKLE. WP4: cada modelo con su FORMA (lo de lado se distingue) y sus dibujos por color de vértice: puntera, franja lateral,
   *  talón y franja de la suela; cordones (3 cajas planas) solo en LOD2. Clásicas y neón admiten cShoe en el empeine.
   *  sole = alto de la suela (= Y del ecuador sobre la planta), hd = alto del empeine, rx/rz = ancho/largo (× FOOT_K). */
  // WP7: botín alto (caña hasta el tobillo con el borde acolchado de color), suela gorda (blanca y alta, empeine oscuro), bicolor (la
  // mitad de delante de color, la de atrás blanca) y retro (crema con dos franjas laterales y suela de goma marrón)
  var SHOE_UP = { clasicas: 0xf4f4f4, negras: NEUTRAL_DK, neon: 0xd8ff3a, doradas: 0xc98f1c, botinAlto: 0xf4f4f4, suelaGorda: 0x2d2f38, bicolor: 0xf4f4f4, retro: 0xf1ece0 };
  var SHOE_SHAPE = {
    clasicas: { sole: 0.075, hd: 0.088, rx: 0.092, rz: 0.158 },
    negras: { sole: 0.06, hd: 0.064, rx: 0.09, rz: 0.166 },    // bajas y planas
    neon: { sole: 0.1, hd: 0.076, rx: 0.095, rz: 0.156 },      // suela gorda
    doradas: { sole: 0.07, hd: 0.08, rx: 0.085, rz: 0.17 },    // estilizadas y largas
    botinAlto: { sole: 0.075, hd: 0.09, rx: 0.094, rz: 0.158, cuff: 0.12 },    // cuff: borde de la caña (h sobre el tobillo; ronda 1 de WP7: de 5,2 a 12 cm, media espinilla)
    suelaGorda: { sole: 0.125, hd: 0.07, rx: 0.1, rz: 0.162 },
    bicolor: { sole: 0.07, hd: 0.084, rx: 0.09, rz: 0.162 },
    retro: { sole: 0.058, hd: 0.07, rx: 0.088, rz: 0.174 }     // bajas y largas
  };
  /** Color del empeine (clásicas y neón admiten cShoe). */
  // (bicolor: cShoe es la mitad de delante; retro: las franjas. Lo de atrás —lo que toca el calcetín— es su color fijo)
  function shoeUp(X) { var sh = SHOE_UP[X.shoes] ? X.shoes : 'clasicas'; return SHOE_VC[sh] && sh !== 'bicolor' && sh !== 'retro' && X.cShoe >= 0 ? X.cShoe : SHOE_UP[sh]; }
  var NEON_TOE = 0xff3aa8, GOLD_DK = 0x7e500e, GOLD_TOE = 0xe3ac2c;   // oro de cómic: base ocre, brillo GOLD_HI y borde marrón
  // Empeine: media esfera con el POLO hacia delante (WP1 del plan del Vestuario): sus anillos son cortes verticales a lo ancho, así que la
  // puntera es un color por vértice de los SHOE_TOE primeros anillos (borde recto y limpio, sin la escalera de las dos esferas que se
  // cortaban) y sin pieza propia. 16 segmentos de lado a lado por encima y 14 de la punta al talón.
  var SHOE_TOE = 0.36;  // fracción de la longitud (polo → polo) que es puntera
  // distancia entre dos colores (RGB «redmean», 0-765): barata y bastante parecida a lo que ve el ojo
  function hexDist(a, b) {
    var r = ((a >> 16 & 255) + (b >> 16 & 255)) / 2, dr = (a >> 16 & 255) - (b >> 16 & 255), dg = (a >> 8 & 255) - (b >> 8 & 255), db = (a & 255) - (b & 255);
    return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
  }
  // color de un detalle (puntera, ribete) sobre el color c0 de debajo (el acento amarillo de un equipo sobre las neón, el blanco sobre
  // las clásicas): lo mismo que onCol
  function onShoe(want, c0, tc) { return onCol(want, c0, tc); }
  function shoeGeo(G, tc, X) {
    var K = FOOT_K, sh = SHOE_UP[X.shoes] ? X.shoes : 'clasicas', S = SHOE_SHAPE[sh], Y = -ANKLE + S.sole, hd = S.hd * Math.sqrt(K);
    var rx = S.rx * K, rz = S.rz * K, zc = 0.055 * K;
    var up = shoeUp(X);
    // colores de cada modelo: suela, franja de la suela (mid), puntera, franja lateral (side), talón (heel) y cordones (lace)
    var sole, mid, toe, side, heel, lace;
    if (sh === 'negras') { sole = 0x2e2e36; mid = 0xf4f4f4; toe = mixHex(up, 0xffffff, 0.16); side = 0xf4f4f4; heel = onCol(tc.accent, up, tc); lace = 0xf4f4f4; }
    else if (sh === 'neon') { sole = 0x1d1d22; mid = 0xf4f4f4; toe = onCol(NEON_TOE, up, tc); side = onCol(0x1d1d22, up, tc); heel = toe; lace = onCol(0x1d1d22, up, tc); }
    else if (sh === 'doradas') { sole = 0xf2ead2; mid = up; toe = GOLD_TOE; side = GOLD_HI; heel = GOLD_DK; lace = GOLD_HI; }
    else if (sh === 'suelaGorda') { sole = 0xf6f4ee; mid = onCol(tc.accent, sole, tc); toe = mixHex(up, 0xffffff, 0.14); side = onCol(tc.accent, up, tc); heel = side; lace = onCol(0xf4f4f4, up, tc); }
    else if (sh === 'bicolor') { var fc = X.cShoe >= 0 ? X.cShoe : onCol(tc.base, up, tc); sole = tc.sole; mid = onCol(0xf4f4f4, tc.sole, tc); toe = mixHex(fc, 0x000000, 0.18); side = fc; heel = fc; lace = 0xf4f4f4; }
    else if (sh === 'retro') { sole = 0xb5793a; mid = up; toe = 0xa59d8c; side = X.cShoe >= 0 ? X.cShoe : onCol(tc.accent, up, tc); heel = side; lace = up; }
    else { sole = tc.sole; mid = onCol(0xf4f4f4, tc.sole, tc); toe = onCol(tc.accent, up, tc); side = toe; heel = toe; lace = onCol(mixHex(up, INK, 0.55), up, tc); }
    // y de la primitiva = eje del polo (+1 la punta), x = a lo ancho, -z = hacia arriba. La puntera son los anillos enteros con
    // y > cos(kc·π/h) (el corte cae justo en la línea del anillo kc en cualquier LOD)
    // Franja lateral y brillo del oro: una «gajo» entero de la esfera (entre dos meridianos que van de la punta al talón, a una elevación
    // fija sobre el costado): bordes limpios en cualquier LOD (una diagonal por caras salía en escalera) y se estrecha sola hacia el talón
    var hs = sg(14, 5), kc = Math.max(1, Math.round(hs * SHOE_TOE)), ty = Math.cos(kc * PI / hs), ws = sg(16, 8), wa = PI / ws;
    var kS = Math.max(1, Math.round(ws * 0.15)), kG = Math.max(1, Math.round(ws * 0.3)), ty0 = Math.cos(Math.round(hs * 0.52) * PI / hs);
    G.vc = function (px, py, pz) {
      var h = -pz, band = Math.floor(Math.atan2(h, Math.abs(px)) / wa);   // gajo: 0 = el de abajo del costado … ws/2 = arriba
      if (py > ty) return toe;
      if (py < -0.8 && band > kS) return heel;                                       // talón (lo que más se ve: de espaldas), por gajos
      if (sh === 'doradas') return band === kG ? side : band === 0 ? GOLD_DK : null;  // brillo de oro arriba y borde oscuro abajo
      if (sh === 'bicolor') return py > ty0 ? side : null;                            // la mitad de delante (por anillos: corte recto)
      if (sh === 'retro') return (ws >= 12 ? band === kS || band === kS + 1 || band === kS + 3 || band === kS + 4 : band === kS) && py > -0.8 ? side : null;   // dos franjas anchas (una en LOD0)
      return band === kS && py > -0.8 ? side : null;
    };
    G.add(sph(1, 16, 14, PI, PI, 0, PI), up, 0, Y, zc, PI / 2, 0, 0, rx, rz, hd);   // empeine (media esfera, polo delante)
    // suela: la fila de arriba (el ecuador) es la franja de la suela
    G.vc = function (px, py) { return py > -0.24 ? mid : null; };
    G.add(sph(1, 18, 7, 0, PI * 2, PI * 0.5, PI * 0.5), sole, 0, Y, zc, 0, 0, 0, rx * 1.022, S.sole, rz * 1.013);
    G.vc = null;
    if (LODR === 2) {   // cordones: 3 cajas planas sobre la lengüeta, siguiendo la curva del empeine
      G.owk = 0;
      [-0.03, -0.006, 0.018].forEach(function (dz, i) {
        var q = clamp(dz / rz, -0.95, 0.95), sq = Math.sqrt(1 - q * q), yT = Y + hd * sq, sl = -hd * q / (rz * sq);
        G.add(new THREE.BoxGeometry(rx * (0.62 - i * 0.06), 0.006, 0.011), lace, 0, yT + 0.0015, zc + dz, -Math.atan(sl), 0, 0);
      });
      G.owk = 1;
    }
    if (S.cuff) {   // botín alto: caña hasta media espinilla, tira de velcro oscura y borde acolchado GORDO del acento (de espaldas y de lejos)
      // (ronda 1 de WP7: la caña de 5 cm quedaba bajo la tobillera y el calcetín: se leía como la zapatilla de serie con el cuello algo
      //  más alto. Ahora sube a 12 cm, la tobillera va dentro y la silueta es la de una bota: tubo blanco, franja oscura y rulo de color)
      var cc = onShoe(tc.accent, up, tc), sd = onShoe(NEUTRAL_DK, up, tc), yb = -0.03, r0 = 0.064 * K, r1 = 0.06 * K, cu = S.cuff;
      // (dibujo por cara: cada franja es un anillo entero del torno, así el centro de sus triángulos cae dentro y el borde sale recto)
      G.owk = 0.8; G.vc = function (px, py) { return py > cu - 0.024 ? cc : py > cu - 0.058 && py < cu - 0.04 ? sd : null; };
      G.add(lathe([V2(r0, yb), V2(r1, cu - 0.058), V2(r1, cu - 0.04), V2(r1, cu - 0.024), V2(r1 + 0.011, cu - 0.012), V2(r1 - 0.004, cu + 0.004)], 14, 8), up, 0, 0, -0.006); G.vc = null;   // caña, tira y borde
      G.owk = 0.4; G.add(new THREE.BoxGeometry(0.034, 0.05, 0.008), cc, 0, cu - 0.03, -0.006 - r1 - 0.003, 0, 0, 0); G.owk = 1;   // lengüeta del talón
    } else if (!(X.ankle === 'blanca')) {   // cuello bajo (con la tobillera acolchada no se ve: va dentro)
      G.add(cyl(0.05 * K, 0.056 * K, 0.06, 14, true), up, 0, -0.03, -0.005);                                    // cuello
      G.owk = 0;
      G.add(cyl(0.057 * K, 0.057 * K, 0.014, 14, true), onShoe(tc.accent, up, tc), 0, -0.012, -0.005);         // ribete del tobillo
      G.owk = 1;
    }
  }
  /** Marco del cuello en el hueso del pecho: un aro inclinado que se apoya en el domo de los hombros, por delante más bajo y por detrás
   *  debajo de la mandíbula, separado `off` del tronco. Devuelve centro (cy, cz), semiejes (ax, az), inclinación t y las alturas. */
  function neckFrame(off, dyf, dyb) {
    var co = SPINE_Y + CHEST_Y, hb = NECK_Y + HEAD_C - 0.95 * HEAD_RY, yf = hb + dyf, yb = hb + dyb;
    var rf = torsoR(yf + co), rb = torsoR(yb + co), zf = rf[1] + off, zb = rb[1] + off;
    var t = Math.atan2(yb - yf, zf + zb), cy = (yf + yb) / 2, cz = (zf - zb) / 2, az = Math.sqrt((yb - yf) * (yb - yf) + (zf + zb) * (zf + zb)) / 2;
    return { co: co, yf: yf, yb: yb, t: t, cy: cy, cz: cz, az: az, ax: torsoR(cy + co)[0] + off };
  }
  /** Cuello alto de la camiseta interior (WP5, T6): con la térmica (pista) o la licra (playa), un aro de revolución algo cónico en cB
   *  que sube del domo de los hombros hasta debajo de la cabeza, con tinta: así se lee como una camiseta y no como dos manguitos, y
   *  sigue viéndose con manguitos. 24 lados abiertos: 48 / 32 / 22 triángulos. */
  function collarGeo(G, X, tc) {
    var F = neckFrame(0.004, -0.062, 0.035), h = 0.05, lift = h * 0.32;
    G.owk = 0.9;
    G.vc = function (px, py) { return py > 0.3 ? mixHex(underHex(X, tc), 0x000000, 0.3) : null; };   // el borde de arriba, más oscuro
    G.add(cyl(0.86, 1, 1, 24, true), underHex(X, tc), 0, F.cy + Math.cos(F.t) * lift, F.cz + Math.sin(F.t) * lift, F.t, 0, 0, F.ax, h, F.az);
    G.vc = null; G.owk = 1;
  }
  /** Cuello (ranura neck) en el hueso del pecho. Medalla (WP5, T9): cinta bicolor cA/cB (de lado a lado del cordón) y un disco grande
   *  (r 0,045) de oro con el canto oscuro y el centro claro; collar de conchas: cordón (claro sobre piel oscura) + 5 conchas (LOD2).
   *  Medalla: 188 / 120 / 112 triángulos (cinta de 16 tramos y disco de 12 lados: ≤ 120 en LOD1, el presupuesto del plan). */
  function neckGeo(G, X, tc) {
    if (!X.neck) return;
    var hi = X.beach ? isLicra(X) : X.under === 'termica';   // con el cuello alto, por fuera de él
    var F = neckFrame(hi ? 0.02 : 0.012, -0.07, 0.03), t = F.t, cy = F.cy, cz = F.cz, ax = F.ax, az = F.az, co = F.co, cA0 = colA(X, tc), i, ph;
    function ringPt(p) { return [ax * Math.sin(p), cy - Math.sin(t) * az * Math.cos(p), cz + Math.cos(t) * az * Math.cos(p)]; }
    if (X.neck === 'medalla') {
      var c1 = colA(X, tc), c2 = colB(X, tc);
      if (hexDist(c1, c2) < 150) c2 = pick(c2, c1, tc);
      // (la cinta: en el toro, z > 0 es la mitad de abajo del cordón una vez girado: una franja de cada color a lo largo)
      G.owk = 0.5; G.vc = function (px, py, pz) { return pz > 0 ? c2 : null; };
      G.add(torus(1, 0.075, 4, 16), c1, 0, cy, cz, PI / 2 + t, 0, 0, ax, az, az); G.vc = null;                                  // cinta
      var dy = F.yf - 0.045, rd = torsoR(dy + co);
      G.owk = 0.7; G.vc = function (px, py) { return Math.abs(py) < 0.0049 ? GOLD_DK : null; };                                  // canto oscuro
      G.add(cyl(0.045, 0.045, 0.01, 12), GOLD, 0, dy, rd[1] + 0.012, PI / 2 - 0.22, 0, 0); G.vc = null;                         // medalla
      if (LODR > 0) { G.owk = 0; G.add(new THREE.CircleGeometry(0.03, sg(12, 8)), GOLD_HI, 0, dy + 0.0012, rd[1] + 0.0175, -0.22, 0, 0); }   // relieve (no en LOD0)
    } else if (X.neck === 'conchas') {
      G.owk = 0.3; G.add(torus(1, 0.05, 4, 24), lumHex(X.skin) < 0.45 ? 0xe6d6b2 : 0x6b4a2e, 0, cy, cz, PI / 2 + t, 0, 0, ax, az, az);   // cordón
      if (LODR === 2) for (i = -2; i <= 2; i++) {
        ph = i * 0.4; var p = ringPt(ph);
        G.owk = 0.6; G.add(sph(1, 8, 6), i % 2 ? 0xf2b9a0 : 0xfaf0dc, p[0], p[1] - 0.016, p[2] + 0.008, -0.4 - t, ph, 0, 0.031, 0.036, 0.014);
      }
    } else if (X.neck === 'bandanaCuello') {
      // WP7: pañuelo al cuello: rulo gordo de cA con lunares, el pico cayendo sobre el pecho y el NUDO con dos puntas en la nuca (de
      // espaldas es lo que se ve). ≈ 70 / 90 / 140 triángulos
      var bc = cA0, bd = lumHex(bc) > 0.6 ? mixHex(bc, 0x000000, 0.5) : 0xf6f1e4, ns = sg(16, 10), da = 2 * PI / ns;
      G.owk = 0.6;
      G.vc = function (px, py, pz) { var a = Math.atan2(py, px), s = Math.floor((a + PI) / da); return s % 3 === 1 && pz < 0.02 ? bd : null; };
      G.add(torus(1, 0.24, 4, 16), bc, 0, cy + 0.012, cz, PI / 2 + t, 0, 0, ax * 1.04, az * 1.04, az * 0.9);                  // rulo
      G.vc = null;
      var pf = ringPt(0), pb = ringPt(PI), shade = mixHex(bc, 0x000000, 0.16);
      G.vc = function (px, py, pz) { return Math.abs(px) < 0.12 && Math.abs(py + 0.1) < 0.12 && pz > 0 ? bd : null; };
      G.add(new THREE.ConeGeometry(0.085, 0.11, sg(6, 4), 1), bc, pf[0], pf[1] - 0.052, pf[2] + 0.012, PI - t * 0.6 - 0.22, 0, 0, 1, 1, 0.3);   // pico
      G.vc = null;
      G.owk = 0.8; G.add(new THREE.IcosahedronGeometry(1, 0), shade, pb[0], pb[1] + 0.004, pb[2] - 0.012, 0.4, 0.3, 0, 0.026, 0.022, 0.018);   // nudo
      for (var se = -1; se <= 1; se += 2) G.add(new THREE.ConeGeometry(0.016, 0.05, 4, 1), bc, pb[0] + se * 0.018, pb[1] - 0.02, pb[2] - 0.018, -0.25, 0, se * 0.55, 1, 1, 0.45);   // puntas
    } else if (X.neck === 'silbato') {
      // WP7: silbato de árbitro: cordón de cA por el cuello que baja en «V» hasta el silbato metálico del pecho (cuerpo, boquilla y anilla)
      // (silbato: de plástico casi negro sobre una camiseta clara y metálico sobre una oscura; con la playa, sobre la piel)
      var cc = thinHex(cA0), wy = F.yf - 0.088, wr = torsoR(wy + co), wz = wr[1] + 0.02, pl = ringPt(0.55), pr = ringPt(-0.55);
      var bgc = X.beach ? (isLicra(X) ? underHex(X, tc) : tc.base) : tc.base, wc = lumHex(bgc) > 0.55 ? 0x2a2c34 : STEEL, wd = wc === STEEL ? STEEL_DK : 0x101116, wh = wc === STEEL ? 0xe8eef6 : 0x5a5e6a;
      G.owk = 0.5; G.add(torus(1, 0.075, 4, 16), cc, 0, cy, cz, PI / 2 + t, 0, 0, ax, az, az);                                       // cordón
      rod(G, pl, [0.006, wy + 0.022, wz], 0.0065, cc); rod(G, pr, [-0.006, wy + 0.022, wz], 0.0065, cc);
      G.owk = 0.7; G.vc = function (px, py, pz) { return pz > 0.014 ? wh : py < -0.01 ? wd : null; };
      G.add(new THREE.BoxGeometry(0.084, 0.042, 0.038), wc, -0.01, wy, wz, -0.2, 0, 0.12); G.vc = null;                          // cuerpo
      G.add(cyl(0.024, 0.024, 0.046, 8), wc, -0.01, wy - 0.004, wz, PI / 2 - 0.2, 0, 0);                                            // tambor
      G.add(new THREE.BoxGeometry(0.046, 0.018, 0.024), wd, 0.04, wy + 0.007, wz, -0.2, 0, 0.12);                                // boquilla
    } else if (X.neck === 'cadenaPlata') {
      // WP7: cadena de plata: eslabones por color de vértice (claro / oscuro alternos) y una chapa con canto oscuro sobre el pecho
      // (ronda 1 de WP7: plata sobre la camiseta blanca no se veía —1,56 %—: sobre un pecho claro, acero oscuro con los eslabones
      //  claros, cordón más grueso y la chapa con el canto casi negro; sobre uno oscuro, la plata clara de antes)
      // (pulido: se leía como un cuello o una bufanda a cuadros grises. Ahora un eslabón claro de cada dos lleva un BRILLO casi blanco
      //  —ritmo claro, oscuro, brillo, oscuro: metal— y la chapa es más pequeña y cuelga más alta: ya no tapa el dorsal. Mismos triángulos)
      var lk = 2 * PI / sg(20, 12), lc = lumHex(tc.base) > 0.6 || (hi && lumHex(colB(X, tc)) > 0.6);
      var s1 = lc ? 0x48505d : 0xdfe5ec, s2 = lc ? 0x67717f : 0xaeb7c3, s3 = lc ? 0x8d97a5 : 0xd4dbe4, s4 = lc ? 0x23262d : 0x5a6470, sh2 = 0xf6f9fc;
      // (pulido 2: el aro grueso con eslabones claros y oscuros alternos seguía leyéndose como un cuello a cuadros y la chapa caía sobre
      //  el número. Ahora el cordón es fino, oscuro por debajo y con el brillo solo por arriba (una cadena, no una banda), y la chapa,
      //  más pequeña, cuelga del propio cordón: apenas baja de él y deja el dorsal entero. Mismos triángulos)
      G.owk = 0.6; G.vc = function (px, py, pz) { if (pz > -0.02) return null; var q = Math.floor((Math.atan2(py, px) + PI) / lk); return q % 4 === 0 ? sh2 : s2; };
      G.add(torus(1, 0.18, 4, 20), s1, 0, cy, cz, PI / 2 + t, 0, 0, ax, az, az); G.vc = null;
      var ty = F.yf - 0.012, rdT = torsoR(ty + co);
      G.owk = 0.7; G.vc = function (px, py) { return Math.abs(py) < 0.0025 ? s4 : null; };
      G.add(new THREE.BoxGeometry(0.05, 0.048, 0.01), lc ? 0x66707e : s3, 0, ty, rdT[1] + 0.014, -0.22, 0, 0); G.vc = null;                       // chapa
      if (LODR > 0) { G.owk = 0; G.add(new THREE.PlaneGeometry(0.009, 0.026), 0xf6f9fc, -0.006, ty + 0.004, rdT[1] + 0.0192, -0.22, 0, 0); }   // brillo
    }
    G.owk = 1;
  }
  // =====================================================================
  //  PELO (1.18, WP2 del plan del Vestuario): CASCO que sigue a headShape con su LÍNEA DE PELO, piezas y la tabla HAIR_STYLES
  // =====================================================================
  // Antes los 10 peinados salían del mismo casquete de esfera (cap): nuca calva bajo un corte recto, línea del pelo dentada contra la
  // lámina de la cara y todos iguales de espaldas. Ahora:
  //  - hairShell: rejilla (φ, θ) sobre headShape + normal × desfase. φ = acimut (0 delante, +π/2 la izquierda del muñeco, ±π la nuca),
  //    θ desde la coronilla (0 arriba, π/2 el ecuador). La línea de pelo depende del acimut (perfiles HL: entradas, patilla, arco sobre
  //    la oreja y nuca hasta θ ≈ 0,70-0,82π) y el borde se mete bajo el pelo pegado a la piel («tuck»): sin escalón de casco.
  //  - Delante de la cara (|φ| < FACE_PH) la línea no baja de la ceja (FACE_TH) y el pelo queda fOff() + 0,0025 por fuera de la lámina.
  //  - shellPt: punto y normal de la superficie del casco, para anclar mechones, moños, gomas, colas, la corona y las cintas.
  //  - Color por vértice (G.vc, 0 triángulos): brillo en la coronilla, degradados de laterales y los efectos de pelo (hairFx con hair2).
  //  - Lo que cuelga (colas, trenzas, rastas) mezcla el hueso de la cabeza con el del muelle del pelo (r.hair) y las melenas con el del
  //    pecho (G.bone2/G.w2): se mueven y no atraviesan los hombros al girar la cabeza. players.js (hairSpring) no cambia.
  //  - Gorros por CLASES (HAT_CLASS): ya no prohíben peinados, los adaptan (el casco solo asoma por debajo del borde, lo de arriba se
  //    quita y lo que cuelga sale por la abertura o por debajo del ala).
  // (ronda 1 de WP2: la frente se ve. Antes todos los perfiles bajaban a la ceja delante (θ 0,29-0,30π) y de frente todos los
  //  peinados parecían un tazón; ahora la línea de delante sube a θ ≈ 0,22-0,26π con ENTRADAS en las esquinas (φ ≈ 0,45-0,6, más
  //  arriba que el centro) y baja por la sien a la patilla. Solo el tazón (y los peinados con flequillo propio) tapan la frente.)
  var HL = {
    corto: [[0, .245], [.3, .25], [.55, .225], [.78, .29], [1.05, .45], [1.18, .555], [1.32, .565], [1.42, .45], [1.6, .405], [1.85, .425], [2.1, .53], [2.5, .64], [2.85, .69], [PI, .70]],
    recogido: [[0, .235], [.35, .24], [.6, .25], [.85, .33], [1.1, .45], [1.22, .52], [1.33, .51], [1.43, .42], [1.62, .395], [1.9, .425], [2.2, .55], [2.6, .66], [PI, .72]],
    tazon: [[0, .30], [.55, .305], [.95, .40], [1.25, .48], [1.6, .50], [1.95, .53], [2.4, .60], [PI, .63]],
    medio: [[0, .255], [.35, .26], [.6, .27], [.85, .37], [1.1, .55], [1.35, .62], [1.7, .64], [2.2, .72], [2.7, .79], [PI, .80]],
    largo: [[0, .275], [.4, .28], [.65, .29], [.88, .39], [1.1, .56], [1.35, .63], [1.7, .65], [2.2, .74], [2.7, .81], [PI, .82]],
    afro: [[0, .25], [.4, .255], [.65, .27], [.88, .36], [1.1, .48], [1.22, .56], [1.34, .555], [1.45, .45], [1.65, .43], [1.9, .47], [2.2, .58], [2.6, .67], [PI, .71]]
  };
  // la cara: entre ±FACE_PH la línea no baja de FACE_TH (la ceja neutra acaba en θ ≈ 0,32π) y el pelo queda por fuera de la lámina
  var FACE_PH = Math.asin(FE_DX) + 0.05, FACE_TH = 0.30 * PI, HAIR_OFF_LOD = [0.012, 0.005, 0.0005], HAIR_TUCK = 0.0015;
  function faceClear() { return fOff() + 0.0025; }
  function hlAt(prof, ph) {
    var a = Math.abs(ph); if (a > PI) a = 2 * PI - a;
    for (var i = 1; i < prof.length; i++) if (a <= prof[i][0] || i === prof.length - 1) {
      var p0 = prof[i - 1], p1 = prof[i], t = clamp((a - p0[0]) / Math.max(1e-6, p1[0] - p0[0]), 0, 1);
      return PI * (p0[1] + (p1[1] - p0[1]) * (1 - Math.cos(PI * t)) / 2);
    }
    return PI * 0.5;
  }
  function hdir(ph, th, o) { var s = Math.sin(th); o.x = s * Math.sin(ph); o.y = Math.cos(th); o.z = s * Math.cos(ph); return o; }
  /** φ y θ de un punto del espacio de la cabeza (aprox.: dirección desde el centro de la cabeza con los radios del cráneo). */
  function hAngles(x, y, z) {
    var dx = x / HEAD_RX, dy = (y - HEAD_C) / HEAD_RY, dz = z / HEAD_RZ, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return [Math.atan2(dx, dz), Math.acos(clamp(dy / l, -1, 1))];
  }
  var HPV = null;
  /** Punto de headShape en la dirección (φ, θ) desplazado `off` por su normal → o {x, y, z, nx, ny, nz}. */
  function headPt(ph, th, off, o) {
    if (!HPV) HPV = { d: new THREE.Vector3(), t1: new THREE.Vector3(), t2: new THREE.Vector3(), q: new THREE.Vector3(), a: {}, b: {}, c: {}, A: new THREE.Vector3(), B: new THREE.Vector3() };
    var V = HPV, d = V.d, e = 0.002;
    hdir(ph, th, d);
    V.t1.set(0, 1, 0); if (Math.abs(d.y) > 0.95) V.t1.set(1, 0, 0);
    V.t1.cross(d).normalize(); V.t2.crossVectors(d, V.t1).normalize();
    headShape(d.x, d.y, d.z, V.a);
    V.q.copy(d).addScaledVector(V.t1, e).normalize(); headShape(V.q.x, V.q.y, V.q.z, V.b);
    V.q.copy(d).addScaledVector(V.t2, e).normalize(); headShape(V.q.x, V.q.y, V.q.z, V.c);
    V.A.set(V.b.x - V.a.x, V.b.y - V.a.y, V.b.z - V.a.z); V.B.set(V.c.x - V.a.x, V.c.y - V.a.y, V.c.z - V.a.z);
    V.q.crossVectors(V.A, V.B).normalize(); if (V.q.dot(d) < 0) V.q.multiplyScalar(-1);
    o.x = V.a.x + V.q.x * off; o.y = V.a.y + V.q.y * off; o.z = V.a.z + V.q.z * off; o.nx = V.q.x; o.ny = V.q.y; o.nz = V.q.z;
    return o;
  }
  // bulto de la oreja (las orejas sobresalen ≈ 2 cm del cráneo): el pelo que la tapa se abomba por encima
  var EAR_PH = 1.61, EAR_TH = 1.59;
  function earBump(ph, th) { var a = Math.abs(ph) - EAR_PH, b = th - EAR_TH; return 0.03 * Math.exp(-(a * a) / (2 * 0.17 * 0.17) - (b * b) / (2 * 0.2 * 0.2)); }
  // ¿la dirección cae sobre la lámina de los ojos? (más un margen): ahí el pelo va faceClear() por fuera
  function onFace(ph, th) { var d = Math.sin(th), x = d * Math.sin(ph), y = Math.cos(th), z = d * Math.cos(ph); return z > 0 && Math.abs(x) < FE_DX + 0.08 && y < FE_DY1 + 0.08; }
  // columnas de la rejilla del casco, más densas sobre las orejas (ahí la línea de pelo cambia deprisa: patilla y arco)
  var HS_COLS = {};
  function hairCols(n) {
    if (HS_COLS[n]) return HS_COLS[n];
    var M = 720, cum = [0], acc = 0, i, j = 0, out = [];
    function rho(p) { var a = (Math.abs(p) - 1.45) / 0.42; return 1 + 1.3 * Math.exp(-a * a); }
    for (i = 1; i <= M; i++) { acc += rho(-PI + 2 * PI * (i - 0.5) / M); cum.push(acc); }
    for (var k = 0; k <= n; k++) {
      var tg = acc * k / n; while (j < M - 1 && cum[j + 1] < tg) j++;
      out.push(-PI + 2 * PI * (j + clamp((tg - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]), 0, 1)) / M);
    }
    out[0] = -PI; out[n] = PI;
    return (HS_COLS[n] = out);
  }
  /** Gorro que cubre la cabeza (clases CAP, CAPB, BUCKET y SCARF): copa elíptica (centro, giro en X, semiejes y apertura θ) para saber
   *  qué queda dentro. Son las medidas de las copas de headGeo. */
  // (1.18, WP3) las gorras se echan hacia atrás (giro −0,26, apertura 0,44π): el borde de delante queda justo ENCIMA de las cejas y la
  // visera (que nace con su cara de abajo en el borde) ya no las tapa («uniceja»); la gorra al revés, igual (la frente se ve con la tira de atrás). El pañuelo (bandana) es un
  // casquete de verdad (SCARF): cubre la coronilla y la nuca, de la frente (sobre las cejas) a la nuca; para el pelo cuenta como gorra.
  var HAT_CLASS = { gorra: 'CAP', gorraMTC: 'CAP', gorraAtras: 'CAPB', pescador: 'BUCKET', cinta: 'BAND', cintaRizo: 'BAND', bandana: 'SCARF', visera: 'BAND', corona: 'CROWN',
    gorroPompon: 'BEANIE', pescadorCuadros: 'BUCKET', viseraGafas: 'BAND', diadema: 'BAND' };   // (WP7: el gorro de lana, como la gorra para el pelo)
  var CAP_RX = -0.26, CAP_TL = 0.44 * PI, SCARF_RX = -0.5;
  function hatCup(head) {
    var R = HEAD_RX + 0.01, hc = HAT_CLASS[head];
    if (head === 'pescador' || head === 'pescadorCuadros') return { c: [0, HEAD_C + 0.02, -0.005], rx: 0.04, s: [R + 0.016, HEAD_RY + 0.034, HEAD_RZ + 0.022], tl: PI * 0.4 };
    if (hc === 'CAP' || hc === 'CAPB') return { c: [0, HEAD_C + 0.02, -0.005], rx: CAP_RX, s: [R + 0.012, HEAD_RY + 0.03, HEAD_RZ + 0.018], tl: CAP_TL };
    if (hc === 'SCARF') return { c: [0, HEAD_C + 0.02, -0.005], rx: SCARF_RX, s: [R + 0.01, HEAD_RY + 0.028, HEAD_RZ + 0.016], tl: PI * 0.5 };
    // gorro de lana (WP7): copa algo holgada y alta, delante sobre las cejas y detrás bajando a la nuca (como la gorra, sin visera)
    if (hc === 'BEANIE') return { c: [0, HEAD_C + 0.014, -0.006], rx: -0.2, s: [R + 0.016, HEAD_RY + 0.05, HEAD_RZ + 0.022], tl: 0.455 * PI };
    return null;
  }
  /** Punto de la copa (espacio de la cabeza) en la dirección local (φ, θ) de la esfera unidad (φ = 0 delante), por fuera `off`. */
  function cupPt(cup, ph, th, off) {
    var k = 1 + (off || 0) / cup.s[1], lx = Math.sin(th) * Math.sin(ph) * cup.s[0] * k, ly = Math.cos(th) * cup.s[1] * k, lz = Math.sin(th) * Math.cos(ph) * cup.s[2] * k;
    var cr = Math.cos(cup.rx), sr = Math.sin(cup.rx);
    return [cup.c[0] + lx, cup.c[1] + ly * cr - lz * sr, cup.c[2] + ly * sr + lz * cr];
  }
  function inCup(cup, x, y, z) {
    var qx = x - cup.c[0], qy = y - cup.c[1], qz = z - cup.c[2], cr = Math.cos(cup.rx), sr = Math.sin(cup.rx);
    var ly = (qy * cr + qz * sr) / cup.s[1], lz = (-qy * sr + qz * cr) / cup.s[2], lx = qx / cup.s[0], l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    return Math.acos(clamp(ly / l, -1, 1)) < cup.tl && l < 1.02;
  }
  var HPT = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  /** θ del borde del gorro en el acimut φ (primer θ de la cabeza que queda fuera de la copa). */
  function cupRim(cup, ph) {
    var a = 0, b = PI * 0.95;
    headPt(ph, b, 0.004, HPT); if (inCup(cup, HPT.x, HPT.y, HPT.z)) return b;
    for (var i = 0; i < 18; i++) { var m = (a + b) / 2; headPt(ph, m, 0.004, HPT); if (inCup(cup, HPT.x, HPT.y, HPT.z)) a = m; else b = m; }
    return b;
  }
  function hairLum(h) { return lumHex(h); }
  /** Color de lo RAPADO (pelo de 1-3 mm): del tono del pelo, oscurecido, con algo de piel debajo, y SIEMPRE más oscuro que la piel
   *  (≥ 0,13 de luminancia). Revisión final: era mitad piel, mitad pelo; con pelo rubio, o castaño sobre piel clara, los cortos se
   *  leían como una cabeza calva o un gorro de baño del color de la piel. k: cuánto pelo (0,72 por defecto; al cero, menos). */
  function stubHex(skin, hr, k) {
    var s = mixHex(skin, mixHex(hr, 0x000000, 0.3), k == null ? 0.72 : k), ls = lumHex(skin), i;
    // (al cero sobre piel oscura basta con 0,04: si no, quedaba tan negro como el rapado y de espaldas eran el mismo peinado)
    var d = k != null && ls < 0.4 ? 0.04 : 0.13;
    for (i = 0; i < 8 && lumHex(s) > ls - d; i++) s = mixHex(s, mixHex(hr, 0x000000, 0.6), 0.25);
    return s;
  }
  /** Segundo color AUTOMÁTICO (hairFx sin fit.hair2). Pulido: sobre pelo oscuro era un beis (0xf6e2a8) casi del color de la piel clara:
   *  las raíces se leían como una coronilla calva o un gorro de baño y «mitad» como media cabeza pelada. Ahora las RAÍCES son siempre
   *  más oscuras que el pelo (como las de verdad) y el resto de efectos, sobre pelo oscuro, un miel dorado que se separa de la piel en
   *  luminancia (>= 0,14). */
  function autoH2(hr, skin, fx) {
    var l = hairLum(hr);
    // (en el pelo castaño oscuro, casi negro; en el que ya es casi negro no hay raíz más oscura que se vea: ahí, el miel de los demás
    //  efectos, con el borde suave —raíces teñidas—, nunca el beis de piel de antes)
    if (fx === 'raiz' && l > 0.13) return l > 0.3 ? mixHex(hr, 0x1a100a, 0.6) : mixHex(hr, 0x05070c, 0.62);
    if (l > 0.45) return mixHex(hr, 0x2a1a10, 0.55);
    var c = mixHex(hr, 0xe2a848, 0.62), ls = lumHex(skin), i;
    for (i = 0; i < 6 && Math.abs(lumHex(c) - ls) < 0.14; i++) c = ls > lumHex(c) ? mixHex(c, hr, 0.3) : mixHex(c, 0xf2cf6a, 0.3);
    return c;
  }
  /** Contexto del pelo de un muñeco (H): colores, gorro, superficie del casco principal (H.surf) y utilidades para las piezas. */
  function hairCtx(G, X, tc, r) {
    var hr = X.hair, h2 = X.hair2 >= 0 ? X.hair2 : autoH2(hr, X.skin, X.hairFx);
    var hc = HAT_CLASS[X.head] || '', cup = hatCup(X.head);
    if (hc === 'SCARF' || hc === 'BEANIE') hc = 'CAP';   // el pelo, bajo el pañuelo o el gorro de lana, como bajo la gorra (lo que cuelga sale por detrás)
    var H = { G: G, X: X, st: HAIR_STYLES[X.style] || HAIR_STYLES.tupe, id: X.style, hr: hr, h2: h2, fx: X.hairFx || '', cA: colA(X, tc), hat: hc, cup: cup,
      stub: stubHex(X.skin, hr, (HAIR_STYLES[X.style] || HAIR_STYLES.tupe).stubK), r: r, surf: null, line: null, rim: {}, bandOff: 0, crownAt: null };
    H.covered = function (x, y, z) { return !!cup && inCup(cup, x, y, z); };
    H.rimAt = function (ph) { if (!cup) return 0; var k = Math.round(ph * 200); return H.rim[k] != null ? H.rim[k] : (H.rim[k] = cupRim(cup, ph)); };
    /** punto y normal de la superficie del casco principal en (φ, θ) + extra por la normal: [x, y, z, nx, ny, nz] */
    H.pt = function (ph, th, extra) { var o = {}; if (H.surf) H.surf(ph, th, o); else headPt(ph, th, 0.006, o); return [o.x + o.nx * (extra || 0), o.y + o.ny * (extra || 0), o.z + o.nz * (extra || 0), o.nx, o.ny, o.nz]; };
    /** ¿el punto queda dentro del gorro? (las piezas de arriba no se dibujan) */
    H.hid = function (p) { return !!cup && inCup(cup, p[0], p[1], p[2]); };
    return H;
  }
  /** Color de un trozo de pelo: efecto (hairFx con hair2), degradado del peinado y brillo de la coronilla. u = 0 en la raíz (arriba)
   *  → 1 en la línea de pelo / la punta; kind: 'shell' (casco) o 'piece' (mechones, colas: u a lo largo de la pieza).
   *  ex (opcional, pulido): { ur: «u» de la raíz en el espacio de la CABEZA (θ / línea de pelo: el casco y las piezas comparten la
   *  misma zona de raíces), ph: φ del efecto (el centro de la columna del casco o la raíz de la pieza: costuras rectas, sin dientes de
   *  sierra), mech: ¿es una mecha? (por columna del casco o por cara del tubo) }. */
  function hairTone(H, ph, th, u, kind, ex) {
    var c = H.hr, fx = hairFxOf(H), st = H.st, pf = ex && ex.ph != null ? ex.ph : ph;
    // raíces: la zona de arriba de la cabeza (θ hasta la mitad de la línea de pelo, más o menos), con borde suave en 2-3 filas. Antes: la
    // mitad del casco con un escalón recto y el primer cuarto de CADA pieza (en el tupé, dos manchas sueltas: la onda y el flequillo)
    if (fx === 'raiz') {
      var ur = ex && ex.ur != null ? ex.ur : kind === 'shell' ? u : (u < 0.25 ? 0 : 1), mr = 1 - sstep(0.3, 0.74, ur);
      if (mr > 0.02) c = mr > 0.98 ? H.h2 : mixHex(c, H.h2, mr);
    }
    else if (fx === 'puntas') { if (u > (kind === 'shell' ? 0.8 : 0.62)) c = H.h2; }
    else if (fx === 'mechas') {
      var mk = ex && ex.mech != null ? ex.mech : Math.floor((pf + PI) / (2 * PI) * 18 + 0.5) % 3 === 0;
      if (mk && u > (kind === 'shell' ? 0.26 : 0.12)) c = H.h2;   // (en el casco, desde un poco bajo la coronilla: si no, gajos de balón)
    }
    else if (fx === 'flequilloFx') { if (Math.abs(pf) < 1.0 && (kind === 'shell' ? th < 0.34 * PI && u > 0.45 : true)) c = H.h2; }
    else if (fx === 'mitad') { if (pf > 0) c = H.h2; }
    if (st.fade && kind === 'shell') { var f = st.fade(ph, th, u); if (f > 0) c = mixHex(c, H.stub, f); }
    // pelo claro a la distancia del partido (pulido; LOD0/LOD1): la nuca y el borde de abajo algo más oscuros, como la sombra del pelo de
    // verdad. Rubio sobre el parqué, de espaldas a 68 px, tenía el mismo tono que el suelo y solo lo separaba la tinta
    if (kind === 'shell' && LODR < 2 && u > 0.55) { var lh = hairLum(c); if (lh > 0.5) c = mixHex(c, 0x3a2414, (lh > 0.65 ? 0.45 : 0.3) * sstep(0.55, 0.85, u)); }
    // raya del peinado (st.part = φ): la columna del casco que la contiene, más oscura de la frente a la coronilla
    if (st.part != null && kind === 'shell' && ex && ex.ph != null && ex.cw && Math.abs(ex.ph - st.part) < ex.cw * 0.5 && th < 0.3 * PI) c = mixHex(c, 0x000000, hairLum(c) > 0.45 ? 0.3 : 0.4);
    // brillo: SUAVE (sube y baja en una franja ancha) y casi solo por delante. Revisión final: era un aro estrecho todo alrededor de la
    // coronilla y, de espaldas y desde arriba (la cámara del partido), se leía como un agujero claro en el pelo.
    if (kind === 'shell' && th > 0.08 * PI && th < 0.3 * PI && (st.shine == null || st.shine > 0)) {
      var lu = hairLum(c), bandK = sstep(0.08 * PI, 0.16 * PI, th) * (1 - sstep(0.2 * PI, 0.3 * PI, th));
      var kk = (st.shine == null ? 1 : st.shine) * clamp(0.3 - (lu - 0.12) * 0.36, 0.12, 0.3) * 0.8 * bandK * sstep(-0.2, 0.8, Math.cos(ph));
      if (kk > 0.004) c = mixHex(c, 0xffffff, kk);
    }
    return c;
  }
  /** Efecto de pelo que se pinta con este peinado ('' si el peinado no lo admite: HAIR_STYLES[id].noFx, true o {efecto: 1}). */
  function hairFxOf(H) { var fx = H.fx, nf = H.st.noFx; return fx && nf && (nf === true || nf[fx]) ? '' : fx; }
  /** CASCO de pelo. o: {line (perfil HL o función φ → θ), off, vol, volFn(φ, θ, u), lift, flat (altura sobre la coronilla a la que
   *  se corta plano), bump(φ, θ) (desfase extra: rizos, ondas), tuck (false = borde grueso, p. ej. el tazón), th0(φ) (empieza en ese θ:
   *  bandas), col(φ, θ, u) (color propio; si no, hairTone), main (es el casco principal: H.surf/H.line)}. Gorro de copa: solo la banda
   *  de debajo del borde (más un solape dentro de la copa), con el desfase limitado dentro. Coste ≈ el casquete de antes. */
  function hairShell(H, o) {
    var G = H.G, lineF = typeof o.line === 'function' ? o.line : (function (p) { return function (ph) { return hlAt(p, ph); }; })(HL[o.line || 'corto']);
    var nC = o.cols || sg(32, 16), nR = o.rows || sg(8, 4), cols = hairCols(nC), lod = LODR, cup = H.cup;
    // (desfase mínimo 4,5 mm: con menos, la piel asomaba a puntos entre los triángulos del casco y los de la cabeza)
    var off0 = Math.max(0.0045, o.off != null ? o.off : 0.006) + HAIR_OFF_LOD[lod], vol = o.vol || 0, lift = o.lift || 0;
    // gorro de copa (pulido; o.capTrim, solo los cortos: la melena bajo la gorra sigue enmarcando la cara): delante de la oreja, una
    // tira fina bajo el borde. La patilla entera (θ 0,56π) quedaba bajo la gorra como una cuña oscura que llegaba al ojo y, en el
    // primer plano del partido, se leía como un parche (la «cara vendada» de antes)
    function thMax(ph) {
      var t = lineF(ph);
      if (cup && o.capTrim) { var aa = Math.abs(ph); if (aa < 1.62) t = Math.min(t, H.rimAt(ph) + 0.035 * PI + 0.3 * PI * sstep(1.36, 1.62, aa)); }
      return Math.abs(ph) < FACE_PH ? Math.min(t, FACE_TH) : t;
    }
    function offAt(ph, th) {
      var tm = thMax(ph), u = clamp(th / tm, 0, 1), f = off0;
      if (vol) f += vol * (o.volFn ? o.volFn(ph, th, u) : 1 - Math.pow(sstep(0.62, 1.0, u), 1.4) * 0.9);
      if (lift) { var a = (th - (o.liftTh || 0.17) * PI) / (o.liftW || 0.16), b = ph / 0.55; f += lift * Math.exp(-a * a - b * b); }
      if (o.bump) f += o.bump(ph, th, u);
      if (o.ear !== false) f += earBump(ph, th);
      if (cup && o.hatClamp !== false) {   // dentro de la copa, pegado (no atraviesa el gorro); fuera, el volumen del peinado
        var rm = H.rimAt(ph), m = sstep(rm - 0.01 * PI, rm + 0.05 * PI, th);
        f = Math.min(f, off0 + 0.002) * (1 - m) + f * m;
      }
      if (onFace(ph, th)) f = Math.max(f, faceClear() + HAIR_OFF_LOD[lod]);
      return f;
    }
    var yFlat = o.flat ? HEAD_C + HEAD_RY + o.flat : 0;
    function surf(ph, th, out, tuck) {
      headPt(ph, th, tuck ? Math.max(HAIR_TUCK + HAIR_OFF_LOD[lod] * 0.7, onFace(ph, th) ? faceClear() + HAIR_OFF_LOD[lod] : 0) : offAt(ph, th), out);
      if (yFlat && out.y > yFlat) out.y = yFlat + (out.y - yFlat) * 0.12;
      return out;
    }
    // filas de cada columna: arriba fijas en θ (el brillo de 0,15-0,21π queda en una fila exacta), luego hasta la línea de pelo
    // cada vez más juntas, y la fila «tuck» (borde metido, pegado a la piel)
    var TOPR = lod > 0 ? [0, 0.075 * PI, 0.15 * PI, 0.21 * PI] : [0, 0.15 * PI, 0.21 * PI];
    // filas de una banda que no empieza en la coronilla (gorro de copa, th0): en LOD0 una menos, para que el pelo bajo el gorro no
    // cueste más que el peinado entero (la coronilla es un solo triángulo por columna; la banda, dos)
    var NB = lod > 0 ? nR + 2 : nR + 1;
    var rowsOf = function (ph) {
      var tm = thMax(ph), t0 = o.th0 ? o.th0(ph) : 0, out = [], i;
      if (cup) { var rm = H.rimAt(ph); t0 = Math.max(t0, rm - 0.07 * PI); }
      if (t0 > tm - 0.02) t0 = tm - 0.02;
      if (t0 <= 0) { for (i = 0; i < TOPR.length && TOPR[i] < tm - 0.06; i++) out.push(TOPR[i]); }
      var a = out.length ? out[out.length - 1] : t0, n = out.length ? nR : NB;
      for (i = out.length ? 1 : 0; i <= n; i++) { var s = i / n; out.push(a + (tm - a) * (1 - Math.pow(1 - s, 1.45))); }
      return out;
    };
    // todas las columnas con el mismo número de filas (las de arriba fijas se completan repitiendo θ = 0: triángulos vacíos que
    // se saltan)
    var R = [], maxN = 0, k, j;
    for (k = 0; k <= nC; k++) { R.push(rowsOf(cols[k])); maxN = Math.max(maxN, R[k].length); }
    for (k = 0; k <= nC; k++) while (R[k].length < maxN) R[k].splice(1, 0, R[k][0]);
    var nRow = maxN + 1, pos = [], nrm = [], idx = [], tcol = [], P = {}, Pa = {}, Pb = {}, e = 0.003;
    for (k = 0; k <= nC; k++) {
      var ph = cols[k];
      for (j = 0; j < nRow; j++) {
        var tuck = j === nRow - 1 && o.tuck !== false, th = tuck ? R[k][maxN - 1] + 0.004 : R[k][Math.min(j, maxN - 1)];
        if (j === nRow - 1 && o.tuck === false) { th = R[k][maxN - 1]; tuck = true; }   // borde grueso: la fila de abajo, metida
        surf(ph, th, P, tuck);
        pos.push(P.x, P.y, P.z);
        if (th < 0.02) { nrm.push(0, 1, 0); continue; }
        surf(ph + e, th, Pa, tuck); surf(ph, th + e, Pb, tuck);
        var ax = Pa.x - P.x, ay = Pa.y - P.y, az = Pa.z - P.z, bx = Pb.x - P.x, by = Pb.y - P.y, bz = Pb.z - P.z;
        var nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nx * P.nx + ny * P.ny + nz * P.nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (tuck) { nx = P.nx * 0.4 + nx * 0.6; ny = P.ny * 0.4 + ny * 0.6 - 0.5; nz = P.nz * 0.4 + nz * 0.6; nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl; }
        nrm.push(nx, ny, nz);
      }
    }
    for (k = 0; k < nC; k++) for (j = 0; j < nRow - 1; j++) {
      var a0 = k * nRow + j, a1 = a0 + 1, b0 = a0 + nRow, b1 = b0 + 1;
      var tA = R[k][Math.min(j, maxN - 1)], tA1 = R[k][Math.min(j + 1, maxN - 1)], tB = R[k + 1][Math.min(j, maxN - 1)], tB1 = R[k + 1][Math.min(j + 1, maxN - 1)];
      if (j < nRow - 2 && tA1 === tA && tB1 === tB) continue;          // filas repetidas (relleno)
      if (tA < 0.02 && tB < 0.02) { idx.push(a0, a1, b1); tcol.push(k); continue; }  // la coronilla: un triángulo por columna
      idx.push(a0, a1, b1, a0, b1, b0); tcol.push(k, k);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    // el color se decide con el θ del CENTRO de la banda de filas del triángulo (los dos de cada cuadro dan lo mismo): degradados y
    // brillo en bandas limpias que siguen las filas, sin dientes de sierra
    function snapTh(ph, th) {
      var tm = thMax(ph), t0 = o.th0 ? o.th0(ph) : 0, i;
      if (cup) t0 = Math.max(t0, H.rimAt(ph) - 0.07 * PI);
      if (th >= tm) return tm;
      var a = t0, n = NB;
      if (t0 <= 0) {
        var tops = []; for (i = 0; i < TOPR.length && TOPR[i] < tm - 0.06; i++) tops.push(TOPR[i]);
        a = tops[tops.length - 1]; n = nR;
        if (th < a) { for (i = 1; i < tops.length; i++) if (th < tops[i]) return (tops[i - 1] + tops[i]) / 2; }
      }
      var q = clamp((th - a) / Math.max(1e-6, tm - a), 0, 0.9999), sv = 1 - Math.pow(1 - q, 1 / 1.45), j = Math.floor(sv * n), sc = (j + 0.5) / n;
      return a + (tm - a) * (1 - Math.pow(1 - sc, 1.45));
    }
    // efectos por COLUMNA (pulido): φ del centro de la columna del triángulo (los dos de cada cuadro dan lo mismo), así las mechas y la
    // costura de «mitad» siguen los meridianos en rectas. Las mechas, una columna de cada tres, en espejo a los dos lados de la cara
    var ex = { ur: 0, ph: 0, mech: false, cw: 0 };
    var colF = o.col || function (ph, th, u) { ex.ur = u; return hairTone(H, ph, th, u, 'shell', ex); };
    G.vc = function (cx, cy, cz, t) {
      var an = hAngles(cx, cy, cz), tm = thMax(an[0]), ts = snapTh(an[0], an[1]), kc = tcol[t];
      if (kc == null) { ex.ph = null; ex.mech = null; }
      else { ex.ph = (cols[kc] + cols[kc + 1]) / 2; ex.cw = cols[kc + 1] - cols[kc]; var mc = kc < nC / 2 ? kc : nC - 1 - kc; ex.mech = mc % 3 === 1; }
      return colF(an[0], ts, clamp(ts / tm, 0, 1));
    };
    G.add(geo, H.hr);
    G.vc = null;
    if (o.main) {
      H.surf = function (ph, th, out) { return surf(ph, th, out, false); }; H.line = thMax; H.off = offAt;
      // ¿mecha en este φ? (la de la columna del casco principal: la melena sigue las franjas del casco)
      H.mechAt = function (ph) { var q; for (q = 0; q < nC - 1 && ph >= cols[q + 1]; q++); var mc = q < nC / 2 ? q : nC - 1 - q; return mc % 3 === 1; };
    }
    return geo;
  }
  var SWV = null;
  /** Barrido: anillos de nA lados (elipse rx × ry; ry hacia `ref`, la normal de la superficie o hacia fuera) por los puntos P.
   *  Radio 0 = punta cerrada. closed = bucle (cintas). Normales suaves, sin costura. */
  function sweep(P, Rr, nA, ref, closed) {
    if (!SWV) SWV = { T: new THREE.Vector3(), S: new THREE.Vector3(), B: new THREE.Vector3(), U: new THREE.Vector3() };
    var V = SWV, n = P.length, pos = [], idx = [], side = [], i, j;
    for (i = 0; i < n; i++) {
      var a = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)], b = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
      V.T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (typeof ref === 'function') ref(P[i], V.U, i); else V.U.set(ref[0], ref[1], ref[2]);
      V.S.crossVectors(V.T, V.U); if (V.S.lengthSq() < 1e-8) V.S.set(1, 0, 0).cross(V.T); V.S.normalize();
      V.B.crossVectors(V.S, V.T).normalize();
      var r = Rr[i], rx = typeof r === 'number' ? r : r[0], ry = typeof r === 'number' ? r : r[1];
      for (j = 0; j < nA; j++) {
        var an = 2 * PI * j / nA, c = Math.cos(an), s = Math.sin(an);
        pos.push(P[i][0] + V.S.x * c * rx + V.B.x * s * ry, P[i][1] + V.S.y * c * rx + V.B.y * s * ry, P[i][2] + V.S.z * c * rx + V.B.z * s * ry);
      }
    }
    var m = closed ? n : n - 1;
    for (i = 0; i < m; i++) for (j = 0; j < nA; j++) {
      var a0 = i * nA + j, a1 = i * nA + (j + 1) % nA, b0 = ((i + 1) % n) * nA + j, b1 = ((i + 1) % n) * nA + (j + 1) % nA;
      if (i === n - 2 && !closed && (typeof Rr[n - 1] === 'number' ? Rr[n - 1] : Rr[n - 1][0]) === 0) { if (j === 0 || true) idx.push(a0, b0, a1); side.push(j); continue; }   // punta: abanico
      idx.push(a0, b0, a1, a1, b0, b1); side.push(j, j);
    }
    var geo = new THREE.BufferGeometry(); geo.userData.side = side;   // (la cara de cada triángulo: mechas rectas a lo largo)
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  function outRef(p, U) { U.set(p[0], p[1] - HEAD_C, p[2]).normalize(); }
  /** Camino que cuelga: arranca en p0 con la dirección d0 y se dobla hacia abajo (droop 0-1) en n tramos de len. */
  function hangPath(p0, d0, len, n, droop, push) {
    var out = [p0.slice(0, 3)], x = p0[0], y = p0[1], z = p0[2], dx = d0[0], dy = d0[1], dz = d0[2], st = len / n, i;
    var l0 = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l0; dy /= l0; dz /= l0;
    for (i = 1; i <= n; i++) {
      var k = (droop == null ? 0.35 : droop);
      dx *= 1 - k * 0.5; dz *= 1 - k * 0.5; dy -= k; var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= l; dy /= l; dz /= l;
      x += dx * st; y += dy * st; z += dz * st;
      if (push) { var q = push(x, y, z); x = q[0]; y = q[1]; z = q[2]; }
      out.push([x, y, z]);
    }
    return out;
  }
  /** Lo que cuelga se mueve con el muelle del pelo: peso del hueso del pelo de 0 (en yTop) a wMax (en yBot). */
  function hangOn(H, yTop, yBot, wMax, bone) {
    var G = H.G, r = H.r; if (!r) return;
    var b = bone === 'chest' ? r.chest : r.hair; if (!b) return;
    G.bone2 = r.bones.indexOf(b); if (G.bone2 < 0) { G.bone2 = -1; return; }
    G.w2 = function (y) { return wMax * clamp((yTop - y) / Math.max(1e-4, yTop - yBot), 0, 1); };
  }
  function hangOff(H) { H.G.bone2 = -1; H.G.w2 = null; }
  /** Pieza de pelo con color por vértice a lo largo (u de 0 en la raíz a 1 en la punta, por la distancia a p0 sobre len). */
  //  Pulido: la raíz se decide en el espacio de la cabeza (ex.ur = θ / línea de pelo, como el casco), «mitad» con el φ de la raíz de la
  //  pieza (entera de un color: sin costura en zigzag por la cola) y las mechas por CARA del tubo (franjas rectas a lo largo)
  function hairPiece(H, geo, p0, len, ph) {
    var G = H.G, sd = geo.userData && geo.userData.side, ph0 = ph == null ? Math.atan2(p0[0], p0[2]) : ph;
    var k0 = Math.floor((ph0 + PI) / (2 * PI) * 18 + 0.5), ex = { ur: null, ph: ph0, mech: false };
    G.vc = function (cx, cy, cz, t) {
      var dx = cx - p0[0], dy = cy - p0[1], dz = cz - p0[2];
      if (H.line) { var an = hAngles(cx, cy, cz); ex.ur = an[1] / Math.max(0.1, H.line(an[0])); }
      ex.mech = sd && sd[t] != null ? (sd[t] + k0) % 3 === 0 : k0 % 3 === 0;
      return hairTone(H, ph == null ? Math.atan2(cx, cz) : ph, PI * 0.5, clamp(Math.sqrt(dx * dx + dy * dy + dz * dz) / len, 0, 1), 'piece', ex);
    };
    G.add(geo, H.hr); G.vc = null;
  }
  /** Goma del equipo (cA) en p, perpendicular a d, radio r. */
  function hairTie(H, p, d, r, tube) {
    var G = H.G; G.owk = 0.5;
    addAim(G, torus(r, tube || 0.011, 5, 12), H.cA, p[0], p[1], p[2], d, 'z');
    G.owk = 1;
  }
  /** Bola de pelo (moño, nudo): esfera aplastada en p, radios r × (ky en la normal). */
  function hairBall(H, p, n, r, ky, wseg, wound) {
    var G = H.G, geo = new THREE.SphereGeometry(1, sg(wseg || 16, 8), sg(Math.round((wseg || 16) * 0.75), 5));
    var e = aim(n[0], n[1], n[2], 'y');
    G.vc = function () { return hairTone(H, 0, PI * 0.5, 0.3, 'piece'); };
    // wound: moño ENROLLADO (revisión final): espiral de vueltas más oscuras alrededor del eje que mira hacia fuera; liso, el moño
    // bajo y el del semirrecogido se leían de espaldas como un disco plano pegado a la cabeza
    if (wound) {
      var base = hairTone(H, 0, PI * 0.5, 0.3, 'piece'), dk = mixHex(base, 0x000000, hairLum(base) > 0.4 ? 0.3 : 0.45);
      G.vc = function (x, y, z) {
        var t = Math.acos(clamp(y, -1, 1)) / PI, a = (Math.atan2(z, x) / (2 * PI) + 1) % 1;
        return t > 0.62 ? dk : Math.floor(t * 9 + a) % 2 ? dk : base;
      };
    }
    G.add(geo, H.hr, p[0], p[1], p[2], e[0], e[1], e[2], r, r * (ky || 1), r);
    G.vc = null;
  }
  /** Rizo: icosaedro (LOD0, 20 triángulos), dodecaedro (LOD1) o icosaedro subdividido (LOD2), con jitter determinista. */
  function hairCurl(H, p, r, round) {
    var G = H.G, geo = LODR === 2 ? new THREE.IcosahedronGeometry(1, 1) : LODR === 1 || round ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
    G.vc = function () { return hairTone(H, Math.atan2(p[0], p[2]), PI * 0.4, 0.4, 'piece'); };
    G.add(geo, H.hr, p[0], p[1], p[2], p[0] * 7, p[1] * 5, p[2] * 9, r, r * 0.92, r);
    G.vc = null;
  }
  function jit(i, k) { var x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
  /** Mechón plano que sale de la superficie del casco en (φ, θ) hacia `dir` (en el espacio de la cabeza), doblándose con droop. */
  function hairLock(H, ph, th, dir, len, w, t, droop, nA, ns, deep) {
    var p = H.pt(ph, th, -(deep || 0.006)); if (H.hid(p)) return;
    var path = hangPath(p, dir, len, ns || sg(4, 2), droop == null ? 0.15 : droop), Rr = [], n = path.length;
    for (var i = 0; i < n; i++) { var s = i / (n - 1); Rr.push(i === n - 1 ? 0 : [w * (1 - 0.65 * s * s) * (s < 0.15 ? 0.7 + 2 * s : 1), t * (1 - 0.5 * s)]); }
    hairPiece(H, sweep(path, Rr, nA || sg(5, 3), outRef), p, len, ph);
  }
  /** Línea del medio (cresta, raíces, frohawk): dirección con desplazamiento lateral l y ángulo a desde la coronilla (+ delante, − atrás). */
  function midDir(l, a) { var y = Math.cos(a), z = Math.sin(a), x = l, n = Math.sqrt(x * x + y * y + z * z); return hAnglesDir(x / n, y / n, z / n); }
  function hAnglesDir(x, y, z) { return [Math.atan2(x, z), Math.acos(clamp(y, -1, 1))]; }
  /** Melena (SKIRT): lámina con grosor que cae desde el borde del casco por los lados y la nuca hasta yBot(φ) (espacio de la cabeza),
   *  abierta delante (|φ| < ph0). o: {ph0, ySide, yBack, flare, thick, wave, hem}. Se mezcla con el pecho (no atraviesa los hombros). */
  function hairSkirt(H, o) {
    var G = H.G, ph0 = o.ph0 || 1.05, nC = sg(o.cols || 20, 8), nR = sg(o.rows || 5, 3), th = o.thick || 0.022, cols = [], k, j;
    var cup = H.cup;
    for (k = 0; k <= nC; k++) cols.push(ph0 + (2 * PI - 2 * ph0) * k / nC);   // de +ph0 a 2π−ph0 pasando por la nuca (π)
    var OUT = [], INN = [], P = {};
    for (k = 0; k <= nC; k++) {
      var ph = cols[k] > PI ? cols[k] - 2 * PI : cols[k], a = Math.abs(ph);
      // (ronda 1) MECHONES: columnas alternas más largas (puntas en pico) y abombadas (canal entre mechón y mechón): ya no es una
      // lámina recta. Los cantos de delante, sin pico. clump: 0 = lámina lisa
      var cl = o.clump == null ? 1 : o.clump, odd = k % 2 === 1 && k > 0 && k < nC, yb = lerp(o.ySide, o.yBack, sstep(1.35, 2.6, a)) + (o.hem ? o.hem(ph) : 0);
      if (odd) yb -= 0.026 * cl * FK;
      // nace dentro del casco por encima de lo más ancho de la cabeza (θ 0,5π), sale por lo más ancho (0,57π) y cae recta, abriéndose
      // un poco (con gorro de copa, por debajo del borde)
      var tTop = 0.5 * PI, tW = 0.57 * PI;
      if (cup) { var rmm = H.rimAt(ph); tTop = Math.max(tTop, rmm - 0.02 * PI); tW = Math.max(tW, rmm + 0.05 * PI); }
      H.surf ? H.surf(ph, tTop, P) : headPt(ph, tTop, 0.006, P);
      var top = [P.x - P.nx * 0.01, P.y - P.ny * 0.01, P.z - P.nz * 0.01];
      var wide = {}; if (H.surf) H.surf(ph, tW, wide); else headPt(ph, tW, 0.01, wide);
      // (sale enrasada con el casco: sin escalón en la sien; la caída se abre poco a poco con flare. Los cantos de delante, algo
      // metidos y más finos: el mechón se redondea hacia la cara)
      var edge = sstep(0, 0.35, Math.min(Math.abs(cols[k] - ph0), Math.abs(cols[k] - (2 * PI - ph0))));
      var rr = Math.sqrt(wide.x * wide.x + wide.z * wide.z) - 0.001 - 0.006 * (1 - edge), ux = Math.sin(ph), uz = Math.cos(ph);
      var O = [], I = [];
      for (j = 0; j <= nR; j++) {
        var s = j / nR, x, y, z, rad;
        if (s < 0.3) { var q = s / 0.3; y = lerp(top[1], wide.y, q); rad = lerp(Math.sqrt(top[0] * top[0] + top[2] * top[2]), rr, Math.sin(q * PI / 2)); }
        else { var q2 = (s - 0.3) / 0.7; y = lerp(wide.y, yb, q2); rad = rr + (o.flare || 0.02) * q2 * q2; }
        if (o.wave) rad += o.wave(ph, s);
        if (s > 0.3) { var q3 = (s - 0.3) / 0.7; rad += cl * (odd ? 0.007 : -0.002) * Math.sin(q3 * PI * 0.5) - cl * 0.012 * sstep(0.7, 1, q3) * (odd ? 1 : 0.4); }
        x = ux * rad; z = uz * rad;
        O.push([x, y, z]);
        var ti = th * (s < 0.15 ? s / 0.15 : 1) * (0.55 + 0.45 * edge);
        I.push([ux * (rad - ti), y + (j === nR ? 0.002 : 0), uz * (rad - ti)]);
      }
      OUT.push(O); INN.push(I);
    }
    // malla cerrada: fuera, dentro, bajo y los dos cantos de delante
    var pos = [], idx = [], W = nR + 1, nv = (nC + 1) * W;
    for (k = 0; k <= nC; k++) for (j = 0; j <= nR; j++) pos.push(OUT[k][j][0], OUT[k][j][1], OUT[k][j][2]);
    for (k = 0; k <= nC; k++) for (j = 0; j <= nR; j++) pos.push(INN[k][j][0], INN[k][j][1], INN[k][j][2]);
    var tcol = [];   // (columna de cada triángulo: mechas y «mitad» por columna, en rectas; los cantos, null)
    for (k = 0; k < nC; k++) for (j = 0; j < nR; j++) {
      var a0 = k * W + j, a1 = a0 + 1, b0 = a0 + W, b1 = b0 + 1;
      idx.push(a0, a1, b1, a0, b1, b0);                                  // fuera (normal hacia fuera)
      idx.push(nv + a0, nv + b1, nv + a1, nv + a0, nv + b0, nv + b1);    // dentro
      tcol.push(k, k, k, k);
    }
    for (k = 0; k < nC; k++) { var o0 = k * W + nR, o1 = o0 + W; idx.push(o0, nv + o0, nv + o1, o0, nv + o1, o1); tcol.push(k, k); }   // bajo
    for (j = 0; j < nR; j++) {                                                                                       // cantos
      var c0 = j, c1 = j + 1; idx.push(c0, nv + c1, c1, c0, nv + c0, nv + c1);
      var d0 = nC * W + j, d1 = d0 + 1; idx.push(d0, d1, nv + d1, d0, nv + d1, nv + d0);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    var yTop = HEAD_C - 0.05, yMin = Math.min(o.ySide, o.yBack);
    hangOn(H, yTop, yMin, 0.6, 'chest');
    var ex = { ur: 9, ph: null, mech: null };
    G.vc = function (cx, cy, cz, t) {
      var kc = tcol[t];
      if (kc == null) { ex.ph = null; ex.mech = null; }
      else { var pc = (cols[kc] + cols[kc + 1]) / 2; ex.ph = pc > PI ? pc - 2 * PI : pc; ex.mech = H.mechAt ? H.mechAt(ex.ph) : null; }
      return hairTone(H, Math.atan2(cx, cz), PI * 0.6, clamp(0.35 + 0.65 * (HEAD_C - cy) / (HEAD_C - yMin), 0, 1), 'piece', ex);
    };
    G.add(geo, H.hr); G.vc = null;
    hangOff(H);
  }
  /** Cola (coleta, coletas, coleta baja): nudo + goma + cola que cuelga en el muelle del pelo. */
  // o: {dir: dirección de salida de la cola (si no, la normal subida), ball: tamaño del nudo (0 = sin nudo: sale por la abertura de la
  //  gorra), tie: distancia de la goma}
  function hairTail(H, p, n, len, r0, droop, side, o) {
    var nk = [n[0], n[1], n[2]], ob = o || {}, bk = ob.ball == null ? 1 : ob.ball, td = ob.tie == null ? 0.035 : ob.tie;
    if (bk > 0) hairBall(H, [p[0] + nk[0] * 0.012, p[1] + nk[1] * 0.012, p[2] + nk[2] * 0.012], nk, 0.05 * FK * (r0 / 0.06) * bk, 0.8, 12);
    var tp = [p[0] + nk[0] * (td + 0.01), p[1] + nk[1] * (td + 0.01), p[2] + nk[2] * (td + 0.01)];
    hairTie(H, [p[0] + nk[0] * td, p[1] + nk[1] * td, p[2] + nk[2] * td], nk, 0.034 * FK * (r0 / 0.06), 0.012);
    var d0 = ob.dir || [nk[0] + (side || 0) * 0.4, nk[1] + 0.35, nk[2]];
    var ns = sg(7, 3), path = hangPath(tp, d0, len, ns, droop == null ? 0.3 : droop);
    var Rr = [], prof = [0.75, 1, 1.02, 0.92, 0.78, 0.6, 0.4, 0.2];
    for (var i = 0; i < path.length; i++) { var s = i / (path.length - 1); Rr.push(i === path.length - 1 ? 0 : r0 * lerp(prof[Math.floor(s * 7)], prof[Math.min(7, Math.floor(s * 7) + 1)], s * 7 - Math.floor(s * 7))); }
    hangOn(H, tp[1] + 0.02, tp[1] - len, 0.7, 'hair');
    hairPiece(H, sweep(path, Rr, sg(10, 5), [0, 0, -1]), tp, len);
    hangOff(H);
    return path[path.length - 1];
  }
  /** Trenza: tubo con bultos alternos (eslabones) que cuelga desde p; goma en la punta de verdad y un pincelito debajo. */
  function hairBraid(H, p, d, len, r0, droop, push) {
    var ns = sg(10, 5), path = hangPath(p, d, len * 0.86, ns, droop == null ? 0.22 : droop, push), Rr = [], P2 = [], i;
    for (i = 0; i < path.length; i++) {
      var s = i / (path.length - 1), w = r0 * (1 - 0.35 * s) * (i % 2 ? 1.0 : 0.72);
      P2.push(path[i]); Rr.push(i === path.length - 1 ? r0 * 0.45 : [w, w * 0.9]);
    }
    hangOn(H, p[1] + 0.02, p[1] - len, 0.7, 'hair');
    hairPiece(H, sweep(P2, Rr, sg(8, 4), [0, 0, -1]), p, len);
    var e = path[path.length - 1], e0 = path[path.length - 2], dd = [e[0] - e0[0], e[1] - e0[1], e[2] - e0[2]];
    hairTie(H, e, dd, r0 * 0.62, 0.009);
    var dl = Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]) || 1, tipL = len * 0.14;
    var t1 = [e[0] + dd[0] / dl * tipL, e[1] + dd[1] / dl * tipL, e[2] + dd[2] / dl * tipL];
    hairPiece(H, sweep([e, [(e[0] + t1[0]) / 2, (e[1] + t1[1]) / 2, (e[2] + t1[2]) / 2], t1], [r0 * 0.5, r0 * 0.62, 0], sg(6, 3), [0, 0, -1]), p, len);
    hangOff(H);
  }
  // empuja hacia fuera de la cabeza y de los hombros lo que cuelga por detrás o por los lados (espacio de la cabeza)
  function pushOut(x, y, z) {
    var dx = x / (HEAD_RX + 0.02), dy = (y - HEAD_C) / (HEAD_RY + 0.02), dz = z / (HEAD_RZ + 0.02), l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1 && l > 0) { var k = 1 / l; x *= k; z *= k; y = HEAD_C + (y - HEAD_C) * k; }
    if (y < 0.13) { var r2 = Math.sqrt(x * x + z * z), want = 0.2 + (0.13 - y) * 0.2; if (z < 0 && r2 < want) { var kk = want / (r2 || 1); x *= kk; z *= kk; } }
    for (var s = -1; s <= 1; s += 2) {   // las bolas de los hombros
      var ax = x - s * SH_X, l2 = Math.sqrt(ax * ax + y * y + z * z), rb = BALL_SH + 0.03;
      if (l2 < rb && l2 > 0) { var k2 = rb / l2; x = s * SH_X + ax * k2; y *= k2; z *= k2; }
    }
    return [x, y, z];
  }
  // degradado de laterales: 0 arriba → 1 (sombra de la piel) por debajo de θ1, en 3 escalones (cómic)
  function fadeSides(t0, t1, kMax, keepFront) {
    return function (ph, th) {
      var f = sstep(t0, t1, th); if (keepFront) f *= sstep(0.55, 1.2, Math.abs(ph));
      return Math.round(f * 3) / 3 * (kMax || 0.85);
    };
  }
  // laterales rapados (cresta, frohawk): lo que se aparta de la raya del medio más que w
  function fadeMid(w) { return function (ph, th) { var x = Math.abs(Math.sin(th) * Math.sin(ph)); return x > w + 0.07 ? 0.9 : x > w ? 0.5 : 0; }; }
  /** Cresta de rizos / tira de pinchos por la raya del medio: puntos de a0 (delante) a a1 (nuca) a la altura del casco. */
  function midPath(H, a0, a1, n, lift) {
    var out = [];
    for (var i = 0; i <= n; i++) { var a = lerp(a0, a1, i / n), d = midDir(0, a), p = H.pt(d[0], d[1], lift || 0); out.push(p); }
    return out;
  }
  // ---------- La tabla de peinados ----------
  // {line, off, vol, volFn, lift, flat, bump, tuck, shine, fade, crown:[φ, θ/π, extra, inclinación], hat:'show' (lo que lo distingue
  //  asoma con gorra de copa; si no, la UI avisa), parts(H) (piezas; cada una mira H.hid), extra(H) (más cascos)}. ids: los de siempre
  //  (nunca se borran) + los 22 de 1.18.
  var HAIR_STYLES = {
    // tupé (ronda 1): el volumen va DELANTE, sobre la frente (antes era un mechón enorme arriba y atrás que de frente parecía un
    // gorro de cocinero y de lado un moño). Casco con lift delante + una onda que sube desde la línea de pelo y se peina hacia atrás.
    tupe: { line: 'corto', vol: 0.01, lift: 0.024, liftTh: 0.2, liftW: 0.22, crown: [PI, 0.1, 0.0, -0.3],
      // over (1.18, WP3): lo que abulta la onda por encima del casco (las gafas en la frente se apoyan ENCIMA del tupé)
      over: function (ph, th) {
        var a = th / PI; if (a < 0.02 || a > 0.25) return 0;
        var s = Math.pow(clamp((0.232 - a) / 0.212, 0, 1), 1 / 0.85), w = 0.115 * FK * (1 - 0.5 * s), x = Math.abs(Math.sin(th) * Math.sin(ph)) * HEAD_RX;
        var h = 0.042 * FK * Math.pow(1 - s, 1.25) + 0.004, l = x / w; return l < 1 ? h * Math.sqrt(1 - l * l) : 0;
      },
      parts: function (H) {
        var n = sg(7, 4), P2 = [], Rr = [], i;
        for (i = 0; i <= n; i++) {
          var s = i / n, a = lerp(0.232, 0.02, Math.pow(s, 0.85)) * PI, d = midDir(0, a);
          // sección: ancha delante (la onda), más baja hacia la coronilla; el primer anillo, casi cerrado (sin borde abierto). El centro
          // sube media altura: el volumen queda por encima del casco y la onda vuela un poco sobre la frente
          var w = 0.115 * FK * (1 - 0.5 * s), h = 0.042 * FK * Math.pow(1 - s, 1.25) * (i === 0 ? 0.45 : 1) + 0.004;
          var p = H.pt(d[0], d[1], i === 0 ? 0.002 : h * 0.5); if (H.hid(p)) continue;
          P2.push(p); Rr.push(i === 0 ? [w * 0.45, 0.004] : [w, h]);   // (el primer anillo, chato y metido: cierra la onda sin borde abierto)
        }
        if (P2.length > 1) hairPiece(H, sweep(P2, Rr, sg(8, 5), outRef), P2[0], 0.25, 0);
      } },
    // coleta (ronda 1): sin gorro, la cola sale hacia ATRÁS y cae en arco (antes apuntaba arriba y en el partido se leía como un moño).
    // Gorra (CAP): sale por la abertura de atrás, justo en el borde, sin nudo (el nudo queda dentro) y cae; gorra al revés (CAPB): por
    // debajo de la visera de atrás; pescador (BUCKET): el nudo baja bajo el ala y la cola cae por la nuca.
    coleta: { line: 'recogido', off: 0.005, vol: 0.004, hat: 'show', crown: [0, 0.12, 0, 0],
      parts: function (H) {
        var p, n, len = 0.46 * FK;
        if (H.hat === 'CAP') {
          p = H.pt(PI, H.rimAt(PI) + 0.012 * PI, -0.012); n = [p[3], 0, p[5]];
          hairTail(H, p, n, len, 0.058, 0.32, 0, { ball: 0, tie: 0.016, dir: [n[0], -0.2, n[2]] });
        } else if (H.hat === 'CAPB') {
          p = H.pt(PI, H.rimAt(PI) + 0.05 * PI, -0.012); n = [p[3], p[4] * 0.3, p[5]];
          hairTail(H, p, n, len * 0.9, 0.056, 0.35, 0, { ball: 0.7, tie: 0.03, dir: [n[0] * 0.6, -0.7, n[2] * 0.6] });
        } else if (H.hat === 'BUCKET') {
          p = H.pt(PI, H.rimAt(PI) + 0.1 * PI, -0.012); n = [p[3], p[4] * 0.3, p[5]];
          hairTail(H, p, n, len * 0.85, 0.056, 0.35, 0, { ball: 0.8, tie: 0.03, dir: [n[0] * 0.5, -0.85, n[2] * 0.5] });
        } else {
          p = H.pt(PI, 0.37 * PI, -0.01); n = [p[3], p[4] * 0.4 + 0.08, p[5]];
          hairTail(H, p, n, len, 0.062, 0.3, 0, { dir: [n[0], n[1] * 0.4 + 0.1, n[2]] });
        }
      } },
    afro: { line: 'afro', off: 0.006, vol: 0.075, capVol: 0.03, crown: [0, 0.06, 0.0, 0],
      over: function (ph, th) { return th < 0.45 * PI ? 0.03 * FK : 0; },   // (los rizos sueltos asoman ≈ 3 cm sobre el casco)
      volFn: function (ph, th, u) { return (1 - Math.pow(sstep(0.55, 1, u), 1.6) * 0.92) * (0.9 + 0.1 * Math.cos(th)); },
      // (bultos y rizos SIMÉTRICOS: con la fase de antes y el reparto al azar, de frente toda la masa caía en una sien y la otra quedaba
      // casi calva)
      bump: function (ph, th, u) { return 0.012 * Math.max(0, Math.cos(Math.abs(ph) * 6) * Math.sin(th * 7.5)) * (1 - sstep(0.7, 1, u)); },
      parts: function (H) {
        var n = LODR === 0 ? 13 : 15, i;   // (el afro es el peinado más pesado en todos los LOD: lookSelfTest lo exige)
        var m = (n - 1) / 2;               // por parejas espejo (φ y −φ) y uno en la nuca: la misma masa a los dos lados de la cara
        for (i = 0; i < n; i++) {
          var k = i < m ? i : i - m, sd = i < m ? 1 : -1, ph, th;
          if (i === n - 1) { ph = PI; th = 0.42 * PI; }
          else {
            ph = sd * PI * (0.18 + 0.82 * (k + 0.5) / m) + sd * (jit(k, 1) - 0.5) * 0.18; th = (0.2 + 0.32 * jit(k, 2)) * PI;
            if (Math.abs(ph) < 0.9 && th > 0.25 * PI) th = 0.12 * PI + jit(k, 3) * 0.1 * PI;   // fuera de la cara
          }
          var p = H.pt(ph, th, -0.022); if (H.hid(p)) continue;
          // (pulido: bajo un gorro de copa, el casco se recorta delante de la oreja (capTrim) y apenas abulta (capVol); los rizos de los
          // lados quedaban sueltos bajo el borde, junto a la sien o detrás de la oreja, y se leían como unas gafas o un segundo par de
          // ojos. Solo quedan los de la nuca, bajo el borde de atrás)
          if (H.cup && Math.abs(ph) < 0.7 * PI) continue;
          hairCurl(H, p, (0.042 + 0.014 * jit(k, 4)) * FK, LODR === 0);
        }
      } },
    // flequillo (tazón): de espaldas, una SETA: el borde sube a la altura de la oreja y se engorda hacia abajo (alero), con la nuca de
    // piel debajo. (Antes bajaba a 0,63π y era la misma cúpula que otros ocho peinados en el partido)
    flequillo: { back: true, line: function (ph) { return hlAt(HL.tazon, ph) - 0.11 * PI * sstep(1.3, 2.6, Math.abs(ph)); }, vol: 0.026, tuck: false,
      volFn: function (ph, th, u) { return 1 + 0.75 * sstep(0.55, 1, u) * sstep(1.0, 1.8, Math.abs(ph)); }, crown: [0, 0.14, 0, 0] },
    // rapado: pelo de 3 mm: el tono queda a medio camino de la piel (al cero es casi piel; los cortos, el color entero)
    // (revisión final: arriba casi el color entero y la nuca rapada en una franja: de espaldas ya no es el mismo casco que al cero)
    // (pulido: sin «raíces», que en 3 mm no existen y se leían como una coronilla calva; el brillo, casi nada: era una placa clara)
    rapado: { line: 'corto', off: 0.003, shine: 0.06, noFx: { raiz: 1 }, crown: [0, 0.14, 0, 0],
      fade: function (ph, th, u) { return u > 0.72 ? 0.9 : 0.22; } },
    mono: { line: 'recogido', off: 0.005, vol: 0.005, crown: [0, 0.1, 0, 0.25],
      parts: function (H) {
        var p = H.pt(PI, 0.17 * PI, -0.01); if (H.hid(p)) return;
        var n = [p[3] * 0.6, p[4] + 0.3, p[5] * 0.6], r = 0.1 * FK;
        hairTie(H, [p[0] + p[3] * 0.012, p[1] + p[4] * 0.012, p[2] + p[5] * 0.012], n, 0.06 * FK, 0.013);
        hairBall(H, [p[0] + n[0] * 0.06, p[1] + n[1] * 0.06, p[2] + n[2] * 0.06], n, r, 0.86);
      } },
    trenzas: { line: 'recogido', off: 0.005, vol: 0.006, hat: 'show', crown: [0, 0.14, 0, 0],
      parts: function (H) {
        for (var s = -1; s <= 1; s += 2) {
          var ph = s * 2.05, th = Math.max(0.55 * PI, H.cup ? H.rimAt(ph) + 0.04 * PI : 0), p = H.pt(ph, th, -0.012);
          hairBraid(H, p, [p[3] * 0.7, -0.6, p[5] * 0.3], 0.36 * FK, 0.034 * FK, 0.25, pushOut);
        }
      } },
    dosmonos: { line: 'recogido', off: 0.005, vol: 0.006, crown: [0, 0.12, 0, 0.1],
      parts: function (H) {
        for (var s = -1; s <= 1; s += 2) {
          var p = H.pt(s * 1.75, 0.23 * PI, -0.012); if (H.hid(p)) continue;
          var n = [p[3], p[4] + 0.25, p[5]];
          hairTie(H, [p[0] + p[3] * 0.012, p[1] + p[4] * 0.012, p[2] + p[5] * 0.012], n, 0.05 * FK, 0.012);
          hairBall(H, [p[0] + p[3] * 0.06, p[1] + p[4] * 0.06, p[2] + p[5] * 0.06], n, 0.08 * FK, 0.95, 14);
        }
      } },
    coletas: { line: 'recogido', off: 0.005, vol: 0.006, hat: 'show', crown: [0, 0.12, 0, 0],
      fade: function (ph, th) { return Math.abs(ph) < 0.07 && th < 0.3 * PI ? 0.3 : 0; },
      parts: function (H) {
        for (var s = -1; s <= 1; s += 2) {
          var ph = s * 2.0, th = Math.max(0.4 * PI, H.cup ? H.rimAt(ph) + 0.03 * PI : 0), p = H.pt(ph, th, -0.01);
          // (salen hacia fuera y CAEN junto al cuello; antes quedaban en horizontal a la altura de la oreja, como alas)
          hairTail(H, p, [p[3], p[4] * 0.4 + 0.15, p[5] * 0.6], 0.3 * FK, 0.046, 0.62, 0, { dir: [p[3] * 0.7, -0.15, p[5] * 0.7 - 0.25] });
        }
      } },
    cresta: { line: 'corto', off: 0.004, shine: 0.6, fade: fadeMid(0.12), crown: [0, 0.03, 0, 0],   // (corona centrada: la cresta pasa por dentro del aro)
      parts: function (H) {
        var n = LODR === 0 ? 3 : 5, A = [0.1, -0.05, -0.2, -0.36, -0.5], L = [0.15, 0.2, 0.2, 0.17, 0.13];
        for (var i = 0; i < n; i++) {
          var k = n === 3 ? [0, 2, 4][i] : i, a = A[k] * PI, d = midDir(0, a), p = H.pt(d[0], d[1], -0.02); if (H.hid(p)) continue;
          var e = aim(p[3] + 0, p[4] + 0.2, p[5] - 0.25, 'y');
          H.G.vc = function () { return hairTone(H, 0, 0.3, 0.3, 'piece'); };
          H.G.add(tuftGeo(L[k] * FK, 0.075 * FK), H.hr, p[0], p[1], p[2], e[0], e[1], e[2], 0.5, 1, 1);
          H.G.vc = null;
        }
      } },
    // ---------- nuevos (1.18) ----------
    // al cero: todo del color de lo rapado, con más piel que los demás (stubK) pero más oscuro que ella
    alCero: { line: 'corto', off: 0.0025, shine: 0, stubK: 0.6, noFx: true, crown: [0, 0.14, 0, 0], fade: function () { return 1; } },
    degradado: { line: 'corto', off: 0.005, vol: 0.014, fade: fadeSides(0.33 * PI, 0.5 * PI, 0.8, true), crown: [0, 0.14, 0, 0],
      volFn: function (ph, th) { return 1 - sstep(0.3 * PI, 0.45 * PI, th); } },
    // cepillo: CAJA plana y alta arriba con los lados rapados (de espaldas, un bloque cuadrado sobre una nuca clara)
    cepillo: { line: 'corto', off: 0.005, vol: 0.068, flat: 0.042, fade: fadeSides(0.34 * PI, 0.48 * PI, 0.72, true), crown: [0, 0.1, 0.0, 0],
      volFn: function (ph, th) { return 1 - 0.9 * sstep(0.2 * PI, 0.36 * PI, th); } },
    undercut: { line: 'corto', off: 0.003, shine: 0, crown: [0, 0.12, 0.03, -0.2],
      col: function (H) { return mixHex(H.stub, H.hr, 0.25); },
      extra: function (H) {
        hairShell(H, { line: function (ph) { return Math.abs(ph) < 1 ? 0.3 * PI : lerp(0.3 * PI, 0.36 * PI, sstep(1, 1.6, Math.abs(ph))); }, off: 0.006, vol: 0.026, lift: 0.025, tuck: false,
          volFn: function () { return 1; }, ear: false, rows: sg(5, 3), main: true });
      } },
    crop: { capTrim: true, line: function (ph) { return Math.abs(ph) < 1 ? 0.305 * PI : hlAt(HL.corto, ph); }, off: 0.005, vol: 0.018, tuck: false, crown: [0, 0.12, 0, 0],
      volFn: function (ph, th) { return 1 - 0.75 * sstep(0.3 * PI, 0.5 * PI, th) * sstep(0.9, 1.3, Math.abs(ph)); },
      fade: fadeSides(0.42 * PI, 0.58 * PI, 0.7, true) },
    pinchos: { line: 'corto', off: 0.005, vol: 0.012, crown: [0, 0.1, 0.02, 0],
      parts: function (H) {
        var n = LODR === 0 ? 6 : 10, i;
        for (i = 0; i < n; i++) {
          var ph = PI * (-1 + 2 * (i + 0.5) / n) * 0.95 + (jit(i, 7) - 0.5) * 0.4, th = (0.1 + 0.26 * jit(i, 8)) * PI;
          if (i === 0) { ph = 0.15; th = 0.12 * PI; }
          var p = H.pt(ph, th, -0.012); if (H.hid(p)) continue;
          var e = aim(p[3] + (jit(i, 9) - 0.5) * 0.5, p[4] + 0.35, p[5] + (jit(i, 10) - 0.5) * 0.5, 'y'), len = (0.075 + 0.04 * jit(i, 11)) * FK;
          H.G.vc = function () { return hairTone(H, 0, 0.3, 0.5, 'piece'); };
          H.G.add(new THREE.ConeGeometry(0.03 * FK, len, sg(6, 4), 1, true), H.hr, p[0] + p[3] * len * 0.4, p[1] + p[4] * len * 0.4, p[2] + p[5] * len * 0.4, e[0], e[1], e[2]);
          H.G.vc = null;
        }
      } },
    rizosCortos: { line: 'corto', off: 0.005, vol: 0.02, crown: [0, 0.1, 0.01, 0],
      bump: function (ph, th, u) { return 0.006 * Math.max(0, Math.sin(ph * 8) * Math.sin(th * 10)) * (1 - u); },
      // (rizos más gordos y solo de la coronilla a media nuca: el contorno de arriba queda abollado, que es lo que lo distingue de
      // lejos; los que caían a la altura de la oreja eran dos orejeras)
      parts: function (H) {
        var n = LODR === 0 ? 7 : 12, i;
        for (i = 0; i < n; i++) {
          var ph = PI * (-1 + 2 * (i + 0.5) / n) + (jit(i, 5) - 0.5) * 0.35, th = (0.06 + 0.26 * jit(i, 6)) * PI;
          if (Math.abs(ph) < 0.9 && th > 0.2 * PI) th = 0.08 * PI + 0.1 * PI * jit(i, 12);
          if (Math.abs(ph) > 1.2 && Math.abs(ph) < 2.2) th = Math.min(th, 0.24 * PI);   // sobre la oreja, arriba
          var p = H.pt(ph, th, -0.014); if (H.hid(p)) continue;
          hairCurl(H, p, (0.044 + 0.008 * jit(i, 13)) * FK);
        }
      } },
    // afro corto: una BOLA arriba (más volumen que los cortos) que se estrecha hacia la nuca con los lados degradados: de espaldas, una
    // bola sobre una nuca clara (el afro grande baja redondo hasta la nuca)
    afroCorto: { line: 'afro', off: 0.006, vol: 0.064, capVol: 0.026, crown: [0, 0.08, 0.0, 0], fade: fadeSides(0.4 * PI, 0.55 * PI, 0.72, true),
      volFn: function (ph, th, u) { return 1 - Math.pow(sstep(0.45, 1, u), 1.3) * 0.9; },
      bump: function (ph, th, u) { return 0.009 * Math.max(0, Math.sin(ph * 7 + 1.1) * Math.sin(th * 9)) * (1 - sstep(0.7, 1, u)); } },
    frohawk: { line: 'corto', off: 0.004, shine: 0.5, fade: fadeMid(0.11), crown: [0, 0.03, 0, 0],
      parts: function (H) {
        var n = sg(12, 6), path = midPath(H, 0.24 * PI, -0.62 * PI, n, 0.0), Rr = [], P2 = [], i;
        for (i = 0; i <= n; i++) {
          var s = i / n, w = 0.05 * FK * (0.6 + 0.4 * Math.sin(s * PI)) * (i % 2 ? 1 : 0.84), hgt = 0.055 * FK * (0.55 + 0.45 * Math.sin(s * PI)) * (i % 2 ? 1 : 0.8);
          if (H.hid(path[i])) continue;
          P2.push(path[i]); Rr.push([w, hgt]);
        }
        if (P2.length < 2) return;
        hairPiece(H, sweep(P2, Rr, sg(8, 5), outRef), P2[0], 1);
      } },
    // melenita: media melena ROMA, un bloque recto hasta la mandíbula (sin picos y algo abierta abajo): de espaldas tapa el cuello
    melenita: { back: true, line: 'medio', vol: 0.02, tuck: false, hat: 'show', crown: [0, 0.14, 0, 0],
      volFn: function (ph, th, u) { return 1 - 0.3 * u; },
      parts: function (H) { hairSkirt(H, { ph0: 1.08, ySide: HEAD_C - 0.19, yBack: HEAD_C - 0.25, flare: 0.055, thick: 0.028, cols: 18, rows: 4, clump: 0.25 }); } },
    despeinado: { line: 'corto', off: 0.006, vol: 0.022, crown: [0, 0.12, 0.02, 0],
      parts: function (H) {
        var n = LODR === 0 ? 6 : 11, i;
        for (i = 0; i < n; i++) {
          var ph = PI * (-1 + 2 * (i + 0.5) / n) + (jit(i, 21) - 0.5) * 0.4, th = (0.12 + 0.42 * jit(i, 22)) * PI;
          if (Math.abs(ph) < 0.95 && th > 0.24 * PI) th = 0.24 * PI;
          // (mechones más gruesos, más cortos y que salen CASI por la normal, con la raíz bien metida en el casco: con el giro de
          // antes, de espaldas quedaban trazos finos sueltos en el aire)
          var p0 = H.pt(ph, th, 0), dir = [p0[3] + (jit(i, 23) - 0.5) * 0.6, p0[4] + 0.45 * jit(i, 24) - (Math.abs(ph) < 0.95 ? 0 : 0.1), p0[5] + (jit(i, 25) - 0.5) * 0.6];
          hairLock(H, ph, th, dir, (0.06 + 0.035 * jit(i, 26)) * FK, 0.036 * FK, 0.02, 0.3, null, null, 0.016);
        }
      } },
    // cortina: raya al medio delante y, detrás, el pelo hasta la nuca con las puntas VUELTAS hacia fuera (alas en la nuca)
    cortina: { back: true, line: 'medio', vol: 0.018, crown: [0, 0.1, 0, 0],
      bump: function (ph, th) { return th < 0.3 * PI ? -0.012 * Math.exp(-(ph * ph) / 0.01) : 0; },
      parts: function (H) {
        for (var s = -1; s <= 1; s += 2) {
          var p0 = H.pt(s * 0.12, 0.2 * PI, -0.004); if (H.hid(p0)) continue;
          var n = sg(6, 3), P2 = [], Rr = [];
          for (var i = 0; i <= n; i++) {
            var t = i / n, ph = s * lerp(0.12, 1.08, Math.pow(t, 0.8)), th = lerp(0.2, 0.36 + 0.12 * t, t) * PI, p = H.pt(ph, Math.min(th, ph * s < FACE_PH ? FACE_TH + 0.01 : 9), 0.006 + 0.008 * Math.sin(t * PI));
            P2.push(p); Rr.push(i === n ? 0 : [0.035 * FK * (1 - 0.5 * t), 0.009]);
          }
          hairPiece(H, sweep(P2, Rr, sg(5, 3), outRef), p0, 0.3);
        }
        hairSkirt(H, { ph0: 1.95, ySide: HEAD_C - 0.13, yBack: HEAD_C - 0.21, flare: 0.05, thick: 0.018, cols: 12, rows: 3,
          wave: function (ph, s) { return 0.028 * sstep(0.55, 1, s); } });
      } },
    // mullet: corto y con los lados degradados, y una CORTINA estrecha de pelo largo por la nuca hasta los omoplatos
    mullet: { back: true, line: 'corto', off: 0.005, vol: 0.016, hat: 'show', crown: [0, 0.12, 0.01, 0], fade: fadeSides(0.42 * PI, 0.54 * PI, 0.5, true),
      parts: function (H) { hairSkirt(H, { ph0: 2.15, ySide: HEAD_C - 0.28, yBack: HEAD_C - 0.5, flare: 0.016, thick: 0.024, cols: 12, rows: 5, hem: function (ph) { return 0.012 * Math.sin(ph * 9); } }); } },
    ondas: { line: 'medio', vol: 0.022, tuck: false, hat: 'show', crown: [0, 0.12, 0, 0],
      bump: function (ph, th, u) { return 0.006 * Math.sin(th * 14 + ph * 2) * u; },
      parts: function (H) {
        // (ondas: hasta los hombros y muy abierta abajo, en triángulo; la melena es larga y recta)
        hairSkirt(H, { ph0: 1.1, ySide: HEAD_C - 0.2, yBack: HEAD_C - 0.3, flare: 0.085, thick: 0.024, cols: 20, rows: 6,
          wave: function (ph, s) { return 0.02 * Math.sin(s * 9 + Math.abs(ph) * 3) * s; }, hem: function (ph) { return 0.02 * Math.sin(ph * 8); } });
      } },
    melena: { line: 'largo', vol: 0.018, tuck: false, hat: 'show', crown: [0, 0.12, 0, 0],
      parts: function (H) { hairSkirt(H, { ph0: 1.1, ySide: HEAD_C - 0.17, yBack: HEAD_C - 0.52, flare: 0.01, thick: 0.024, cols: 20, rows: 6 }); } },
    coletaBaja: { line: 'recogido', off: 0.005, vol: 0.005, hat: 'show', crown: [0, 0.12, 0, 0],
      parts: function (H) {
        var p = H.pt(PI, Math.max(0.63 * PI, H.cup ? H.rimAt(PI) + 0.04 * PI : 0), -0.01);
        hairTail(H, p, [p[3], p[4] * 0.3 - 0.05, p[5]], 0.27 * FK, 0.068, 0.42);   // (cola corta y GORDA: la trenza es larga y fina)
      } },
    // (pulido: de frente los tres recogidos bajos eran el mismo casco peinado hacia atrás: la trenza con la raya a un lado, el moño
    //  bajo con la raya al otro y la coleta baja sin raya —part: φ de la raya, por color de vértice, 0 triángulos—)
    trenza: { line: 'recogido', off: 0.005, vol: 0.005, hat: 'show', part: 0.42, crown: [0, 0.12, 0, 0],
      parts: function (H) {
        var p = H.pt(PI, Math.max(0.6 * PI, H.cup ? H.rimAt(PI) + 0.04 * PI : 0), -0.012);
        hairTie(H, [p[0] + p[3] * 0.01, p[1] + p[4] * 0.01, p[2] + p[5] * 0.01], [p[3], p[4], p[5]], 0.036 * FK, 0.011);
        hairBraid(H, [p[0] + p[3] * 0.02, p[1], p[2] + p[5] * 0.02], [p[3] * 0.6, -0.7, p[5] * 0.6], 0.5 * FK, 0.036 * FK, 0.3, pushOut);
      } },
    monoBajo: { line: 'recogido', off: 0.005, vol: 0.005, hat: 'show', part: -0.42, crown: [0, 0.12, 0, 0],
      parts: function (H) {
        var p = H.pt(PI, Math.max(0.56 * PI, H.cup ? H.rimAt(PI) + 0.05 * PI : 0), -0.01), n = [p[3], p[4] * 0.5, p[5]];
        hairTie(H, [p[0] + p[3] * 0.01, p[1] + p[4] * 0.01, p[2] + p[5] * 0.01], n, 0.05 * FK, 0.012);
        hairBall(H, [p[0] + p[3] * 0.055, p[1] + p[4] * 0.055, p[2] + p[5] * 0.055], n, 0.085 * FK, 0.78, 0, true);
      } },
    semirrecogido: { line: 'medio', vol: 0.018, tuck: false, hat: 'show', crown: [0, 0.12, 0, 0],
      parts: function (H) {
        hairSkirt(H, { ph0: 1.1, ySide: HEAD_C - 0.14, yBack: HEAD_C - 0.27, flare: 0.025, thick: 0.022, cols: 18, rows: 5 });
        var p = H.pt(PI, 0.32 * PI, -0.008); if (H.hid(p)) return;
        hairTie(H, [p[0] + p[3] * 0.01, p[1] + p[4] * 0.01, p[2] + p[5] * 0.01], [p[3], p[4], p[5]], 0.034 * FK, 0.011);
        hairBall(H, [p[0] + p[3] * 0.04, p[1] + p[4] * 0.04, p[2] + p[5] * 0.04], [p[3], p[4], p[5]], 0.05 * FK, 0.8, 12, true);
      } },
    // twists (ronda 1): cordones GRUESOS retorcidos (anillos alternos gordo/fino = las vueltas) que tapan la cabeza entera, en filas
    // al tresbolillo, cayendo hacia fuera y abajo; el casco va oscuro por dentro (la raíz entre cordones). Antes eran trazos finos.
    twists: { line: 'corto', off: 0.006, vol: 0.012, shine: 0, crown: [0, 0.08, 0.03, 0],
      col: function (H) { return mixHex(H.hr, 0x000000, 0.25); },
      parts: function (H) {
        var ROWS = LODR === 0 ? [[0.1, 5], [0.3, 7]] : [[0.06, 5], [0.22, 8], [0.38, 9], [0.52, 6]], k = 0, r, i;
        for (r = 0; r < ROWS.length; r++) {
          var th0 = ROWS[r][0] * PI, n = ROWS[r][1];
          for (i = 0; i < n; i++, k++) {
            var ph = PI * (-1 + 2 * (i + 0.5 * (r % 2) + 0.25) / n) + (jit(k, 31) - 0.5) * 0.2, th = th0 + (jit(k, 32) - 0.5) * 0.04 * PI;
            if (th > H.line(ph) - 0.06 * PI) continue;                       // la cara y la oreja, libres
            if (Math.abs(ph) < 0.95 && th > 0.16 * PI) continue;             // delante, solo arriba (caen sobre la frente)
            var p = H.pt(ph, th, -0.008); if (H.hid(p)) continue;
            var len = (0.1 + 0.035 * jit(k, 33)) * FK * (th < 0.15 * PI ? 0.85 : 1), rr = 0.024 * FK;
            var path = hangPath(p, [p[3] + 0.8 * Math.sin(ph), p[4] * 0.35, p[5] + 0.8 * Math.cos(ph)], len, sg(6, 3), 0.4, pushOut), Rr = [];   // (salen hacia fuera, no hacia arriba)
            for (var j = 0; j < path.length; j++) Rr.push(j === path.length - 1 ? 0 : rr * (1 - 0.25 * j / path.length) * (j % 2 ? 1 : 0.74));
            hairPiece(H, sweep(path, Rr, sg(6, 4), outRef), p, len, ph);
          }
        }
      } },
    rastas: { back: true, line: 'corto', off: 0.006, vol: 0.016, hat: 'show', crown: [0, 0.1, 0.02, 0],
      parts: function (H) {
        var n = LODR === 0 ? 10 : 16, i;
        for (i = 0; i < n; i++) {
          // (nacen MÁS ARRIBA, de la coronilla a media cabeza, y bajan pegadas al casco —pushOut las aparta de la cabeza y los hombros—:
          // antes salían del borde de un casco liso hacia fuera y de espaldas se abrían como palos)
          var ph = PI * (-1 + 2 * (i + 0.5) / n) + (jit(i, 41) - 0.5) * 0.25, th = (0.16 + 0.22 * jit(i, 42)) * PI;
          if (Math.abs(ph) < 1.05) continue;
          if (H.cup) th = Math.max(th, H.rimAt(ph) + 0.03 * PI);
          var p = H.pt(ph, th, -0.012), len = (0.34 + 0.1 * jit(i, 43)) * FK * (Math.abs(ph) > 2.2 ? 1.12 : 0.8);
          var path = hangPath(p, [p[3] * 0.3, -0.25, p[5] * 0.3], len, sg(5, 3), 0.55, pushOut), Rr = [];
          for (var j = 0; j < path.length; j++) Rr.push(j === path.length - 1 ? 0.012 * FK : 0.02 * FK * (j === 0 ? 1.05 : 1 - 0.15 * j / path.length));
          hangOn(H, p[1], p[1] - len, 0.6, 'chest');
          hairPiece(H, sweep(path, Rr, sg(5, 3), [0, 0, -1]), p, len, ph);
          hangOff(H);
        }
      } },
    raices: { line: 'recogido', off: 0.003, shine: 0, crown: [0, 0.14, 0.02, 0], fade: function () { return 0.5; },
      parts: function (H) {
        var L = LODR === 0 ? [-0.14, 0, 0.14] : [-0.17, -0.085, 0, 0.085, 0.17], n = sg(10, 5), i, j;
        for (i = 0; i < L.length; i++) {
          var P2 = [], Rr = [];
          for (j = 0; j <= n; j++) {
            var a = lerp(0.3 * PI, -0.7 * PI, j / n), d = midDir(L[i] * (1 + 0.6 * Math.max(0, -a / PI - 0.4)), a);
            if (d[1] > H.line(d[0]) - 0.01) continue;
            var p = H.pt(d[0], d[1], 0.002); if (H.hid(p)) continue;
            P2.push(p); Rr.push([0.016 * FK * (j % 2 ? 1 : 0.8), 0.011]);
          }
          if (P2.length > 1) hairPiece(H, sweep(P2, Rr, sg(5, 3), outRef), P2[0], 1);
        }
      } }
  };
  // con gorra de copa estos asoman enteros (la UI no avisa); en el resto lo que los distingue queda dentro del gorro
  var HAIR_UNDER_CAP = {};
  Object.keys(HAIR_STYLES).forEach(function (id) { if (HAIR_STYLES[id].hat === 'show') HAIR_UNDER_CAP[id] = 1; });
  /** mechón liso en lágrima (punta en +Y) */
  function tuftGeo(len, rr, seg) { return lathe([V2(0, 0), V2(rr * 0.8, len * 0.08), V2(rr, len * 0.3), V2(rr * 0.74, len * 0.62), V2(rr * 0.3, len * 0.9), V2(0, len)], seg || 10, 6); }
  /** Pelo entero de un muñeco: casco principal (con gorro de copa, solo lo de debajo del borde), cascos extra y piezas. Deja el
   *  contexto en H (la corona, las cintas y el pañuelo lo leen). */
  var SKIP_HAIR = false;   // solo lookSelfTest: mide un gorro de copa sin pelo (lo que cuesta el gorro por sí solo)
  function hairGeo(G, X, tc, r) { return hairGeoRest(hairGeoMain(G, X, tc, r)); }
  /** El pelo en dos pasos (pulido: la vista previa del Vestuario monta la malla entre frames y la cabeza con el pelo era el paso más
   *  caro, 20-40 ms en un móvil lento): hairGeoMain = contexto y casco principal; hairGeoRest = cascos extra, piezas y medidas. */
  function hairGeoMain(G, X, tc, r) {
    var H = hairCtx(G, X, tc, r), st = H.st;
    if (SKIP_HAIR) { H.line = function () { return 0.3 * PI; }; H.off = function () { return 0; }; H.crownAt = { p: [0, HEAD_C + HEAD_RY, 0], tilt: 0 }; H.skip = true; return H; }
    // (capVol: el volumen bajo un gorro de copa; el afro entero por debajo de la gorra eran dos bolas a los lados, como unos cascos de música)
    hairShell(H, { line: st.line, off: st.off, vol: H.cup && st.capVol != null ? st.capVol : st.vol, volFn: st.volFn, lift: st.lift, liftTh: st.liftTh, liftW: st.liftW, flat: st.flat, bump: st.bump, tuck: st.tuck, main: true,
      capTrim: st.capTrim != null ? st.capTrim : st.line === 'corto' || st.line === 'recogido' || st.line === 'afro',
      col: st.col ? (function (c) { return function () { return c; }; })(st.col(H)) : null });
    return H;
  }
  function hairGeoRest(H) {
    if (H.skip) return H;
    var st = H.st;
    if (st.extra) st.extra(H);
    if (st.parts) st.parts(H);
    // altura de la cinta (y del aro de la visera): lo que abulta el pelo a esa altura, para que el aro no se meta en él
    var thb = Math.acos(clamp(0.085 * FK / HEAD_RY, -1, 1)), mx = 0;
    for (var k = 0; k < 16; k++) { var ph = -PI + 2 * PI * k / 16; if (thb < H.line(ph)) mx = Math.max(mx, H.off(ph, thb)); }
    H.bandOff = mx;
    var c = st.crown || [0, 0.12, 0, 0], cp = H.pt(c[0], c[1] * PI, c[2]);
    H.crownAt = { p: cp, tilt: c[3] };
    return H;
  }
  // ---------- Objetos de cabeza (1.18, WP3 del plan del Vestuario) ----------
  // Antes: cintas como un toro circular que flotaba como un halo (el filete, dentro del toro), viseras de media esfera de una cara y
  // 1,6 cm de alto en el oscuro («uniceja», y desde abajo desaparecían), corona pequeña flotando sobre el tupé, gafas en la frente
  // enterradas en el pelo con las patillas en el aire, y nada de la cara se veía de espaldas. Ahora:
  //  - profSweep: barrido con PERFIL propio (cinta plana con franja de contraste, cinta de rizo con rayas, cordón, goma, corona) por
  //    un camino que sigue la cabeza o el pelo (bandPath, el aro de las cintas); cada lado del perfil se colorea entero (sin G.vc).
  //  - capBrim: visera GRUESA (3 → 2 cm), cerrada por abajo, con curva ligera: arriba cA, debajo cA × 0,8 (nunca el oscuro del equipo).
  var PS = null;
  /** Barrido con perfil: por los puntos P (normal de la superficie N) el perfil prof = [[v, n], …] (v hacia «arriba» sobre la superficie,
   *  n hacia fuera), o prof(i) → perfil del punto i. Solo los lados de `edges` (k → k+1, cerrado). Cada lado con sus vértices (aristas
   *  vivas en el perfil y lisas a lo largo); caras hacia fuera del perfil. closed: el camino es un bucle. */
  function profSweep(P, N, prof, edges, closed) {
    if (!PS) PS = { T: new THREE.Vector3(), U: new THREE.Vector3(), S: new THREE.Vector3(), B: new THREE.Vector3(), S0: new THREE.Vector3() };
    var n = P.length, F = [], i, pf = typeof prof === 'function' ? prof : function () { return prof; };
    for (i = 0; i < n; i++) {
      var a = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)], b = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
      PS.T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); PS.U.set(N[i][0], N[i][1], N[i][2]);
      PS.S.crossVectors(PS.T, PS.U); if (PS.S.lengthSq() < 1e-10) PS.S.set(0, 1, 0); PS.S.normalize();
      if (i === 0 ? PS.S.y < 0 : PS.S.dot(PS.S0) < 0) PS.S.negate();
      PS.S0.copy(PS.S);
      PS.B.crossVectors(PS.S, PS.T).normalize(); if (PS.B.dot(PS.U) < 0) PS.B.negate();
      F.push([PS.S.x, PS.S.y, PS.S.z, PS.B.x, PS.B.y, PS.B.z]);
    }
    var pos = [], idx = [];
    edges.forEach(function (k0) {
      var base = pos.length / 3, j;
      for (i = 0; i < n; i++) {
        var f = F[i], p = P[i], pr = pf(i), m = pr.length, q0 = pr[k0], q1 = pr[(k0 + 1) % m];
        pos.push(p[0] + f[0] * q0[0] + f[3] * q0[1], p[1] + f[1] * q0[0] + f[4] * q0[1], p[2] + f[2] * q0[0] + f[5] * q0[1],
          p[0] + f[0] * q1[0] + f[3] * q1[1], p[1] + f[1] * q1[0] + f[4] * q1[1], p[2] + f[2] * q1[0] + f[5] * q1[1]);
      }
      // orientación: la normal del primer cuadro hacia fuera del centro del perfil
      var pr0 = pf(0), m0 = pr0.length, cv = 0, cn = 0; for (j = 0; j < m0; j++) { cv += pr0[j][0] / m0; cn += pr0[j][1] / m0; }
      var mv = (pr0[k0][0] + pr0[(k0 + 1) % m0][0]) / 2 - cv, mn = (pr0[k0][1] + pr0[(k0 + 1) % m0][1]) / 2 - cn, f0 = F[0];
      var ox = f0[0] * mv + f0[3] * mn, oy = f0[1] * mv + f0[4] * mn, oz = f0[2] * mv + f0[5] * mn;
      var A = base * 3, B = (base + 2) * 3, C = (base + 1) * 3;
      var ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], vx = pos[C] - pos[A], vy = pos[C + 1] - pos[A + 1], vz = pos[C + 2] - pos[A + 2];
      var flip = (uy * vz - uz * vy) * ox + (uz * vx - ux * vz) * oy + (ux * vy - uy * vx) * oz < 0;
      for (i = 0; i < (closed ? n : n - 1); i++) {
        var a0 = base + 2 * i, b0 = base + 2 * ((i + 1) % n), c0 = a0 + 1, d0 = b0 + 1;
        if (flip) idx.push(a0, c0, b0, c0, d0, b0); else idx.push(a0, b0, c0, c0, b0, d0);
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  /** Camino que ABRAZA la cabeza (cintas, banda de la visera, goma de las gafas deportivas): a la altura yc (+ tilt·cos φ: delante más
   *  alto), por fuera de lo que haya (pelo con su volumen, piel o la lámina de la cara) y suavizado para que no salte donde empieza el
   *  pelo; hv = medio alto de la pieza (el desfase es el mayor de arriba, el centro y abajo: el pelo abulta más hacia abajo). Bucle
   *  entero, o abierto de φ = ph0 a ph1 (pasando por la nuca si ph1 > π). → {P, N, ph}. */
  function bandPath(H, yc, tilt, nSeg, extra, ph0, ph1, hv) {
    var open = ph0 != null, offs = [], ths = [], phs = [], o = {}, k, it, n = open ? nSeg + 1 : nSeg;
    for (k = 0; k < n; k++) {
      var ph = open ? ph0 + (ph1 - ph0) * k / nSeg : -PI + 2 * PI * (k + 0.5) / nSeg; if (ph > PI) ph -= 2 * PI;
      var y = yc + tilt * Math.cos(ph), th = Math.acos(clamp((y - HEAD_C) / HEAD_RY, -1, 1));
      phs.push(ph); ths.push(th);
      var f = 0;
      for (var q = -1; q <= 1; q++) {
        var tq = Math.acos(clamp((y + q * (hv || 0) - HEAD_C) / HEAD_RY, -1, 1)), fq = H.line && tq < H.line(ph) - 0.004 ? H.off(ph, tq) : HAIR_TUCK;
        if (onFace(ph, tq)) fq = Math.max(fq, faceClear() + 0.001);
        f = Math.max(f, fq - (q ? 0.002 : 0));
      }
      offs.push(f);
    }
    function nb(i, d) { return open ? offs[clamp(i + d, 0, n - 1)] : offs[(i + d + n) % n]; }
    for (it = 0; it < 2; it++) offs = offs.map(function (v, i) { return Math.max(v, nb(i, 1), nb(i, -1)); });
    for (it = 0; it < 3; it++) offs = offs.map(function (v, i) { return (nb(i, 1) + 2 * v + nb(i, -1)) / 4; });
    var P = [], N = [];
    for (k = 0; k < n; k++) { headPt(phs[k], ths[k], offs[k] + (extra || 0), o); P.push([o.x, o.y, o.z]); N.push([o.nx, o.ny, o.nz]); }
    return { P: P, N: N, ph: phs };
  }
  /** Punto (y normal) de un camino de bandPath cerrado en el acimut φ (interpolado). */
  function pathAt(bp, ph) {
    var n = bp.P.length, t = ((ph + PI) / (2 * PI)) * n - 0.5, i0 = Math.floor(t), u = t - i0, a = (i0 % n + n) % n, b = (a + 1) % n;
    var P = [0, 1, 2].map(function (j) { return lerp(bp.P[a][j], bp.P[b][j], u); }), N = [0, 1, 2].map(function (j) { return lerp(bp.N[a][j], bp.N[b][j], u); });
    return { p: P, n: N };
  }
  /** Luminancia tope (las piezas finas y saturadas no brillan como un neón). */
  function lumCap(c, mx) { var l = lumHex(c); return l > mx ? mixHex(c, 0x000000, 1 - mx / l) : c; }
  /** Color de las piezas finas (cintas, cordón, goma, colas del nudo): un acento muy saturado y claro (rojo, amarillo, naranja…) salía
   *  en las tiras finas con un halo de neón (comprobado con capturas: el blanco y el gris no lo hacen, y un rojo con el canal alto a 0,6
   *  ya no). Se baja el canal más alto según la saturación (0,85 en un gris → 0,6 en un color puro) sin cambiar el tono, además del tope
   *  de luminancia. (1.18, WP3 ronda 1) */
  function thinHex(c) {
    c = lumCap(c, 0.8);
    var r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    var top = lerp(0.85, 0.6, clamp(sat, 0, 1)), m = mx / 255, k = m > top ? top / m : 1;
    return Math.round(r * k) << 16 | Math.round(g * k) << 8 | Math.round(b * k);
  }
  /** Rejilla de puntos G2[i][j] → geometría (caras hacia `out` en el primer cuadro). */
  function gridGeo(G2, out) {
    var ni = G2.length, nj = G2[0].length, pos = [], idx = [], i, j;
    for (i = 0; i < ni; i++) for (j = 0; j < nj; j++) pos.push(G2[i][j][0], G2[i][j][1], G2[i][j][2]);
    var a = G2[0][0], b = G2[1][0], c = G2[0][1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var flip = (uy * vz - uz * vy) * out[0] + (uz * vx - ux * vz) * out[1] + (ux * vy - uy * vx) * out[2] < 0;
    for (i = 0; i < ni - 1; i++) for (j = 0; j < nj - 1; j++) {
      var p = i * nj + j, q = p + nj;
      if (flip) idx.push(p, p + 1, q, p + 1, q + 1, q); else idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  /** Visera gruesa y cerrada que nace en rim(φ) → {p, n} (borde del gorro o de la banda) entre φc − W y φc + W: planta en D (lo más
   *  largo en el centro; la cara de abajo nace en el borde), un poco caída (pitch) y con las alas curvadas hacia abajo; grosor de 3 cm en la raíz a 2 cm en la punta.
   *  Arriba cTop, debajo cTop × 0,8, canto cTop × 0,9. ≈ 100 triángulos en LOD2. */
  function capBrim(G, rim, phC, W, len, pitch, cTop) {
    var nc = sg(8, 5), rows = 2, TOP = [], BOT = [], i, j, dcx = Math.sin(phC), dcz = Math.cos(phC);
    for (i = 0; i <= nc; i++) {
      var s = -1 + 2 * i / nc, ph = phC + s * W, r = rim(ph), dx = Math.sin(ph) * 0.45 + dcx * 0.55, dz = Math.cos(ph) * 0.45 + dcz * 0.55, dl = Math.sqrt(dx * dx + dz * dz);
      dx /= dl; dz /= dl;
      var Ls = len * (0.22 + 0.78 * Math.sqrt(Math.max(0, 1 - s * s))), tr = [], br = [];
      for (j = 0; j <= rows; j++) {
        var t = j / rows, x = r.p[0] + dx * (Ls * t - 0.006), z = r.p[2] + dz * (Ls * t - 0.006);
        var y = r.p[1] + 0.002 - Math.tan(pitch) * Ls * t - 0.022 * FK * s * s * t * t, th = lerp(0.03, 0.02, t);
        tr.push([x, y + th, z]); br.push([x, y, z]);
      }
      TOP.push(tr); BOT.push(br);
    }
    var cu = mixHex(cTop, 0x000000, 0.2), ce = mixHex(cTop, 0x000000, 0.1);
    G.owk = 0.6;
    G.add(gridGeo(TOP, [0, 1, 0]), cTop);
    G.add(gridGeo(BOT, [0, -1, 0]), cu);
    var EDGE = [], S0 = [], S1 = [];
    for (i = 0; i <= nc; i++) EDGE.push([TOP[i][rows], BOT[i][rows]]);
    for (j = 0; j <= rows; j++) { S0.push([TOP[0][j], BOT[0][j]]); S1.push([TOP[nc][j], BOT[nc][j]]); }
    G.add(gridGeo(EDGE, [dcx, 0, dcz]), ce);
    var e0 = [Math.sin(phC - W) - dcx * 0.2, 0, Math.cos(phC - W) - dcz * 0.2], e1 = [Math.sin(phC + W) - dcx * 0.2, 0, Math.cos(phC + W) - dcz * 0.2];
    G.add(gridGeo(S0, e0), ce); G.add(gridGeo(S1, e1), ce);
    G.owk = 1;
  }
  /** «MTC» de la gorra del online (ONLINE, fase 3, especialista net): una tira de la misma copa de la gorra (un 1,5 % más grande) con
   *  una malla de 13 × 5 caras alineada con este dibujo de píxeles (M de 5, T y C de 3, separadas por 1): cada cara se pinta por
   *  vértice (G.vc) con la letra o con cA. Siempre 13 × 5 (130 triángulos en todos los LOD): con menos, no se lee. (1.18, WP3: sube
   *  para que la visera no corte las letras; sigue el giro de la copa) */
  var MTC_ROWS = ['X...X.XXX..XX', 'XX.XX..X..X..', 'X.X.X..X..X..', 'X...X..X..X..', 'X...X..X...XX'];
  var MTC_PHI0 = PI / 2 - 0.62, MTC_PHI = 1.24, MTC_TH0 = 0.66, MTC_TH = 0.56;   // (frontal, por encima de la visera)
  function mtcInk(cA) { return lumHex(cA) > 0.6 ? 0x1c2233 : 0xf6f3ea; }
  /** Tira de n casillas de esfera unidad (una fila, 2 triángulos por casilla; THREE.SphereGeometry pone como mínimo 3 × 2), con las
   *  coordenadas de SphereGeometry: x = −cos φ sen θ, y = cos θ, z = sen φ sen θ. */
  function sphPatch(n, ph0, phL, th0, thL) {
    var pos = [], idx = [], i, j;
    for (j = 0; j <= 1; j++) for (i = 0; i <= n; i++) {
      var ph = ph0 + phL * i / n, th = th0 + thL * j;
      pos.push(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
    }
    for (i = 0; i < n; i++) { var a = i, b = i + 1, c = n + 1 + i, d = c + 1; idx.push(a, c, b, b, c, d); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.slice(), 3));
    g.setIndex(idx);
    return g;
  }
  function mtcPanel(G, cA, cup) {
    // (1.18, WP3 ronda 1: solo las casillas de las letras —26 de 65—, en tramos seguidos por fila: lo demás ya es la copa de debajo, del
    //  mismo cA; mismo dibujo con 52 triángulos en vez de 130, y la gorra cabe en el presupuesto de objeto de cabeza)
    var ink = mtcInk(cA), cols = MTC_ROWS[0].length, rows = MTC_ROWS.length, k = 1.015, dp = MTC_PHI / cols, dt = MTC_TH / rows, r, c;
    G.owk = 0;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      if (MTC_ROWS[r].charAt(c) !== 'X') continue;
      var c1 = c; while (c1 + 1 < cols && MTC_ROWS[r].charAt(c1 + 1) === 'X') c1++;
      G.add(sphPatch(c1 - c + 1, MTC_PHI0 + c * dp, (c1 - c + 1) * dp, MTC_TH0 + r * dt, dt), ink,
        cup.c[0], cup.c[1], cup.c[2], cup.rx, 0, 0, cup.s[0] * k, cup.s[1] * k, cup.s[2] * k);
      c = c1;
    }
    G.owk = 1;
  }
  /** Gorra de copa (gorra, gorra al revés, gorra MTC): copa del acento con el giro de hatCup, visera gruesa (delante o detrás), botón
   *  arriba y TIRA de atrás (o de delante, al revés) en cB: la gorra se distingue también de espaldas. La MTC: botón y tira del color
   *  de las letras. */
  function capGeo(G, X, cA, cB) {
    var cup = hatCup(X.head), back = X.head === 'gorraAtras', mtc = X.head === 'gorraMTC', acc = mtc ? mtcInk(cA) : cB;
    G.add(new THREE.SphereGeometry(1, sg(22, 14), sg(9, 5), 0, PI * 2, 0, cup.tl), cA, cup.c[0], cup.c[1], cup.c[2], cup.rx, 0, 0, cup.s[0], cup.s[1], cup.s[2]);
    var phV = back ? PI : 0, phS = back ? 0 : PI;
    capBrim(G, function (ph) { return { p: cupPt(cup, ph, cup.tl, 0) }; }, phV, 1.02, 0.15 * FK, back ? 0.0 : 0.03, cA);
    // tira (cierre de atrás): tramo del borde de la copa por fuera, plano
    var nS = sg(8, 5), P = [], N = [], i;
    for (i = 0; i <= nS; i++) {
      var ph = phS - 0.55 + 1.1 * i / nS, p = cupPt(cup, ph, cup.tl - 0.05, 0.002), q = cupPt(cup, ph, cup.tl - 0.05, 0.02);
      P.push(p); N.push([q[0] - p[0], q[1] - p[1], q[2] - p[2]].map(function (v) { return v / 0.018; }));
    }
    G.owk = 0.5; G.add(profSweep(P, N, [[-0.011, 0], [-0.011, 0.004], [0.011, 0.004], [0.011, 0]], [0, 1, 2], false), acc);
    var tp = cupPt(cup, 0, 0, 0.004);
    G.owk = 0; G.add(new THREE.SphereGeometry(0.018, 6, 3), acc, tp[0], tp[1], tp[2]); G.owk = 1;   // botón (24 triángulos en todos los LOD)
    if (mtc) mtcPanel(G, cA, cup);
  }
  /** Pañuelo (bandana): casquete de la copa SCARF (frente sobre las cejas → nuca) en cA con lunares de verdad (hexágonos planos, del
   *  crema o del cA oscurecido) y un dobladillo; el nudo y las colas van en faceGeo (muelle del pelo). 300-450 triángulos. */
  function scarfGeo(G, X, cA) {
    var cup = hatCup('bandana'), dot = lumHex(cA) > 0.6 ? mixHex(cA, 0x000000, 0.5) : 0xf6f1e4, i;
    G.add(new THREE.SphereGeometry(1, sg(18, 12), sg(7, 5), 0, PI * 2, 0, cup.tl), cA, cup.c[0], cup.c[1], cup.c[2], cup.rx, 0, 0, cup.s[0], cup.s[1], cup.s[2]);
    // dobladillo: el borde de la copa por fuera (tubo plano), algo más oscuro
    var nH = sg(20, 10), P = [], N = [];
    for (i = 0; i < nH; i++) {
      var ph = -PI + 2 * PI * (i + 0.5) / nH, p = cupPt(cup, ph, cup.tl - 0.035, 0), q = cupPt(cup, ph, cup.tl - 0.035, 0.02);
      P.push(p); N.push([(q[0] - p[0]) / 0.02, (q[1] - p[1]) / 0.02, (q[2] - p[2]) / 0.02]);
    }
    G.owk = 0.4; G.add(profSweep(P, N, [[-0.013, -0.001], [-0.009, 0.005], [0.009, 0.005]], [0, 1], true), mixHex(cA, 0x000000, 0.18));
    // lunares: dos anillos (coronilla y laterales); en LOD0 solo el de abajo
    var R0 = LODR > 0 ? [[0.2 * PI, 5, 0.3], [0.37 * PI, 9, 0]] : [[0.36 * PI, 7, 0]];
    G.owk = 0;
    R0.forEach(function (rg) {
      for (var k = 0; k < rg[1]; k++) {
        var ph = -PI + 2 * PI * (k + 0.5) / rg[1] + rg[2], p = cupPt(cup, ph, rg[0], 0.0025), q = cupPt(cup, ph, rg[0], 0.02);
        addAim(G, new THREE.CircleGeometry(0.019 * FK, 6), dot, p[0], p[1], p[2], [q[0] - p[0], q[1] - p[1], q[2] - p[2]], 'z');
      }
    });
    G.owk = 1;
  }
  // ---------- Objetos de cabeza nuevos (1.18, WP7): que se lean de espaldas y desde arriba ----------
  /** Gorro de lana con pompón: copa de punto (canalé por gajos de la propia esfera), vuelta gruesa de cB doblada en el borde y un pompón
   *  GORDO de lana (icosaedro subdividido) en lo alto, algo hacia atrás: de espaldas y desde arriba es una silueta que no tiene nada más.
   *  ≈ 420 / 280 / 200 triángulos. */
  function beanieGeo(G, X, cA, cB, tc) {
    // (vuelta del mismo color, más oscura y acanalada; el pompón, crema —o cB si se elige— que contraste con la copa)
    var cup = hatCup(X.head), nS = sg(18, 12), nR = sg(7, 5), rib = mixHex(cA, 0x000000, 0.13), cf = mixHex(cA, 0x000000, 0.2), cfd = mixHex(cA, 0x000000, 0.36);
    var pom = X.cB >= 0 ? pick(cB, cA, tc) : pick(0xf6f1e4, cA, tc);
    G.vc = function (px, py, pz) { var f = Math.atan2(pz, -px); if (f < 0) f += 2 * PI; return Math.floor(f / (2 * PI / nS)) % 2 ? rib : null; };
    G.add(new THREE.SphereGeometry(1, nS, nR, 0, PI * 2, 0, cup.tl), cA, cup.c[0], cup.c[1], cup.c[2], cup.rx, 0, 0, cup.s[0], cup.s[1], cup.s[2]);
    var t1 = cup.tl - 0.21, tl = cup.tl, nV = sg(18, 12);
    G.vc = function (px, py, pz) { var f = Math.atan2(px, pz); if (f < 0) f += 2 * PI; return Math.floor(f / (2 * PI / nV)) % 2 ? cfd : null; };
    G.add(new THREE.LatheGeometry([V2(Math.sin(tl) * 0.985, Math.cos(tl) - 0.014), V2(Math.sin(tl) * 1.09, Math.cos(tl) + 0.004), V2(Math.sin(t1) * 1.08, Math.cos(t1)),
      V2(Math.sin(t1) * 0.995, Math.cos(t1) + 0.012)], nV, 0, PI * 2), cf, cup.c[0], cup.c[1], cup.c[2], cup.rx, 0, 0, cup.s[0], cup.s[1], cup.s[2]);   // vuelta
    G.vc = null;
    var tp = cupPt(cup, PI, 0.1, 0.03);
    G.owk = 0.8; G.add(new THREE.IcosahedronGeometry(0.055 * FK, LODR > 0 ? 1 : 0), pom, tp[0], tp[1], tp[2], 0.3, 0.5, 0);   // pompón
    G.owk = 1;
  }
  /** Diadema: arco plano de 2,2 cm de oreja a oreja por encima de la cabeza, algo echado hacia delante, apoyado en el pelo (o en lo que
   *  abulte: el tupé) y con los cantos más oscuros. Desde arriba y de espaldas cruza la coronilla. ≈ 108 / 80 / 54 triángulos. */
  function diademaGeo(G, H, c) {
    var n = sg(18, 9), a = -0.12, P = [], N = [], offs = [], dirs = [], k, it;   // (a < 0: inclinada hacia atrás, sobre la coronilla: se ve de espaldas y desde la cámara del partido)
    for (k = 0; k <= n; k++) {
      var u = -1.42 + 2.84 * k / n, dx = Math.sin(u), dy = Math.cos(u) * Math.cos(a), dz = Math.cos(u) * Math.sin(a);
      var ph = Math.atan2(dx, dz), th = Math.acos(clamp(dy, -1, 1));
      dirs.push([ph, th]); offs.push(0.0035 + (H && H.st && H.st.over ? H.st.over(ph, th) : 0));
    }
    for (it = 0; it < 2; it++) offs = offs.map(function (v, i) { return Math.max(v, offs[Math.max(0, i - 1)], offs[Math.min(n, i + 1)]); });
    for (k = 0; k <= n; k++) { var q = overPt(H, dirs[k][0], dirs[k][1], offs[k]); P.push(q.slice(0, 3)); N.push(q.slice(3, 6)); }
    // (2,4 cm de ancho y 1,2 cm de grueso: con 1,5 × 0,8 cm de espaldas en el partido era una raya fina que el pelo oscuro se comía)
    var w = 0.024 * FK, t = 0.012, prof = [[-w, 0.0005], [-w * 0.85, t], [w * 0.85, t], [w, 0.0005]];
    G.owk = 0.8;
    G.add(profSweep(P, N, prof, [1], false), c);
    G.add(profSweep(P, N, prof, [0, 2], false), mixHex(c, 0x000000, 0.32));
    // lazo a la izquierda del muñeco (dos lazadas aplastadas y el nudo): de espaldas y de lado da una silueta que la cinta no tiene
    var kb = Math.round(n * 0.78), B = P[kb], Nb = N[kb], T = [P[kb + 1][0] - P[kb - 1][0], P[kb + 1][1] - P[kb - 1][1], P[kb + 1][2] - P[kb - 1][2]], tl = Math.sqrt(T[0] * T[0] + T[1] * T[1] + T[2] * T[2]) || 1;
    T = [T[0] / tl, T[1] / tl, T[2] / tl];
    var F = [Nb[1] * T[2] - Nb[2] * T[1], Nb[2] * T[0] - Nb[0] * T[2], Nb[0] * T[1] - Nb[1] * T[0]], bo = 0.012;   // F: a lo ancho de la diadema
    [-1, 1].forEach(function (sd) {
      var q = [B[0] + Nb[0] * bo + F[0] * sd * 0.026 * FK, B[1] + Nb[1] * bo + F[1] * sd * 0.026 * FK, B[2] + Nb[2] * bo + F[2] * sd * 0.026 * FK];
      addAim(G, new THREE.IcosahedronGeometry(1, 0), c, q[0], q[1], q[2], F, 'y', 0.017 * FK, 0.028 * FK, 0.009 * FK);
    });
    G.add(new THREE.IcosahedronGeometry(0.011 * FK, 0), mixHex(c, 0x000000, 0.2), B[0] + Nb[0] * (bo + 0.002), B[1] + Nb[1] * (bo + 0.002), B[2] + Nb[2] * (bo + 0.002));
    G.owk = 1;
  }
  /** Pinzas de pelo: una PINZA GRANDE de garra en la nuca (cuerpo curvo del acento, lomo más oscuro y los dientes asomando: de espaldas
   *  es una mancha de color sobre el pelo que se ve en el partido) y un clip en cada sien, claros sobre pelo oscuro y oscuros sobre pelo
   *  claro. Todo apoyado en el pelo (o en lo que abulte). 60 triángulos en todos los LOD. */
  function pinzasGeo(G, H, X, tc) {
    var cA = thinHex(colA(X, tc)), hl = lumHex(X.hair), pc = hexDist(cA, X.hair) < 140 ? (hl < 0.4 ? mixHex(cA, 0xffffff, 0.45) : mixHex(cA, 0x000000, 0.45)) : cA;
    var c2 = hl < 0.45 ? pick(0xf6f1e4, pc, tc) : NEUTRAL_DK, ph = PI, th = 0.47 * PI, ov = H && H.st && H.st.over ? H.st.over(ph, th) : 0;
    var q = overPt(H, ph, th, 0.014 + ov), up = overPt(H, ph, th - 0.12, 0.014 + ov), n = [q[3], q[4], q[5]], u = [up[0] - q[0], up[1] - q[1], up[2] - q[2]];
    var ul = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]) || 1; u = [u[0] / ul, u[1] / ul, u[2] / ul];
    var e = aim(n[0], n[1], n[2], 'z');
    G.owk = 0.7;
    // (pinza de garra a escala: 11,4 × 5,8 cm y gruesa (4,4 cm: de lado no es una lámina), con el lomo arriba y los dientes a medio camino entre el color de la pinza y el
    // claro de las sienes, asomando por debajo. Antes era un bloque plano de 12 × 6 cm con una franja clara: se leía como una pegatina o una etiqueta)
    // (revisión final: de espaldas el bloque se leía como un rectángulo macizo. Ahora es la SILUETA de una pinza de garra: el lomo en
    //  ARCO (medio toro grueso) y cuatro dientes en punta que bajan hacia el pelo entre las patas del arco. Mismos 36 triángulos)
    // (pulido: un 15 % más grande; en el primer plano rozaba el 1,5 % de lookvis)
    var arc = new THREE.TorusGeometry(0.058 * FK, 0.02 * FK, 3, 4, PI); arc.translate(0, -0.013 * FK, 0.008);
    G.add(arc, pc, q[0], q[1], q[2], e[0], e[1], e[2]);                                                                                       // lomo en arco
    var tth = mixHex(pc, 0x000000, 0.22);
    for (var ti = 0; ti < 4; ti++) {                                                                                                          // dientes
      var cone = new THREE.ConeGeometry(0.0128 * FK, 0.056 * FK, 3, 1, true); cone.rotateZ(PI); cone.translate((-0.0336 + 0.0224 * ti) * FK, -0.025 * FK, 0.004);
      G.add(cone, tth, q[0], q[1], q[2], e[0], e[1], e[2]);
    }
    for (var s = -1; s <= 1; s += 2) {   // clips de las sienes
      var pt = s * 1.18, tt = 0.3 * PI, o2 = H && H.st && H.st.over ? H.st.over(pt, tt) : 0, a = overPt(H, pt, tt, 0.007 + o2), b = overPt(H, s * 1.45, tt - 0.06, 0.007 + o2);
      addAim(G, new THREE.BoxGeometry(0.026, 0.088 * FK, 0.015), c2, a[0], a[1], a[2], [b[0] - a[0], b[1] - a[1], b[2] - a[2]], 'y');
      addAim(G, new THREE.BoxGeometry(0.013, 0.076 * FK, 0.017), pc, a[0] + a[3] * 0.004, a[1] + a[4] * 0.004, a[2] + a[5] * 0.004, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], 'y');
    }
    G.owk = 1;
  }
  /** Pendientes: aros dorados GRANDES colgando del lóbulo (con brillo arriba y sombra abajo). 48 triángulos por oreja. */
  function earringGeo(G, X) {
    G.owk = 0.5;
    G.vc = function (px, py) { return py > 0.017 ? GOLD_HI : py < -0.019 ? GOLD_DK : null; };
    // (en LOD0, aros de 6 tramos: con su ranura propia se suman a cualquier gorro y cuentan en el peor caso; WP7 ronda 1)
    for (var s = -1; s <= 1; s += 2) G.add(new THREE.TorusGeometry(0.045 * FK, 0.0125, 3, LODR === 0 ? 6 : 8), GOLD, s * (HEAD_RX + 0.013), HEAD_C - 0.005 - 0.046 * FK * 0.9 - 0.04 * FK, -0.004, 0, PI / 2, 0);
    G.vc = null; G.owk = 1;
  }
  /** Gafas de sol APOYADAS en la banda de la visera (viseraGafas, playa): dos lentes espejadas azules con montura oscura, inclinadas
   *  hacia arriba sobre el frontal, puente y patillas por la banda. ≈ 90 triángulos. */
  function visorShades(G, X, tc, bp, h, t) {
    var FR = 0x22242c, LN = 0x2a5fbf, lens = [], s, k;
    for (s = -1; s <= 1; s += 2) {
      var q = pathAt(bp, s * 0.36), n = q.n, nl = Math.sqrt(n[0] * n[0] + n[2] * n[2]) || 1, tilt = 0.42;
      var d = [n[0] / nl * Math.cos(tilt), Math.sin(tilt), n[2] / nl * Math.cos(tilt)];
      // (de pie sobre el arranque de la visera, por DELANTE de la banda: el pelo de detrás no las tapa)
      var C = [q.p[0] + n[0] / nl * (t + 0.03), q.p[1] + h * 0.6 + 0.036 * FK, q.p[2] + n[2] / nl * (t + 0.03)];
      lens.push({ C: C, d: d, s: s, ux: [n[2] / nl, 0, -n[0] / nl] });
    }
    lens.forEach(function (L) {
      var rx = 0.05 * FK, ry = 0.036 * FK, f = 0.0018;
      G.owk = 0.7; addAim(G, new THREE.CircleGeometry(1, sg(12, 8)), FR, L.C[0], L.C[1], L.C[2], L.d, 'z', rx * 1.18, ry * 1.25, 1);   // montura
      G.owk = 0; addAim(G, new THREE.CircleGeometry(1, sg(12, 8)), LN, L.C[0] + L.d[0] * f, L.C[1] + L.d[1] * f, L.C[2] + L.d[2] * f, L.d, 'z', rx, ry, 1);   // lente
      if (LODR > 0) addAim(G, new THREE.CircleGeometry(1, 6), 0xdfe8ff, L.C[0] + L.d[0] * f * 2 - L.ux[0] * rx * 0.35, L.C[1] + L.d[1] * f * 2 + ry * 0.3, L.C[2] + L.d[2] * f * 2 - L.ux[2] * rx * 0.35, L.d, 'z', rx * 0.28, ry * 0.22, 1);   // brillo
    });
    var A = lens[0], B = lens[1], rx2 = 0.05 * FK;
    G.owk = 0.6;
    if (LODR > 0) rod(G, [A.C[0] + A.ux[0] * rx2, A.C[1], A.C[2] + A.ux[2] * rx2], [B.C[0] - B.ux[0] * rx2, B.C[1], B.C[2] - B.ux[2] * rx2], 0.005, FR);   // puente (no en LOD0)
    lens.forEach(function (L) {   // patillas: del canto de fuera hacia atrás por la banda
      var E = [L.C[0] + L.ux[0] * rx2 * 1.1 * L.s, L.C[1], L.C[2] + L.ux[2] * rx2 * 1.1 * L.s], pts = [E];
      // (en LOD0, un solo tramo)
      (LODR > 0 ? [0.85, 1.35] : [1.25]).forEach(function (a) { var q = pathAt(bp, L.s * a); pts.push([q.p[0] + q.n[0] * (t + 0.003), q.p[1] + h * 0.7, q.p[2] + q.n[2] * (t + 0.003)]); });
      for (k = 0; k < pts.length - 1; k++) rod(G, pts[k], pts[k + 1], 0.0045, FR);
    });
    G.owk = 1;
  }
  /** Cabeza, orejas, pelo (hairGeo) y gorro (hueso head). Los gorros de copa (CAP, CAPB, BUCKET, SCARF) dejan asomar el pelo por
   *  debajo; las cintas (BAND) abrazan lo que abulte el pelo (bandPath); la corona se apoya donde dice el peinado (crown). */
  var LAST_HAIR = null, LAST_BAND = null;
  var BAND_Y = 0.13, BAND_TILT = 0.06;   // altura de las cintas sobre el centro de la cabeza (× FK) y su caída hacia la nuca (× R)
  /** Cabeza y orejas (la piel). */
  function headBase(G, X) {
    var sk = X.skin, s;
    G.add(headSphere(sg(30, 16), sg(20, 12)), sk);
    // orejas sencillas (pulido: sin contorno de tinta y con las normales inclinadas hacia fuera, como la cabeza a esa altura: medio
    //  hundidas en ella, su contorno y el brillo del borde se cortaban contra la cabeza y de perfil la oreja era un disco con un aro
    //  discontinuo, claro sobre la piel oscura. Se sigue leyendo por su sombra)
    // (pulido 2: sin contorno, en el rapado de perfil la oreja se perdía en la piel y quedaba solo la muesca del pelo. Ahora es un
    //  punto más oscura y cálida que la cabeza: se lee por el tono, sin aro)
    G.owk = 0;
    var esk = mixHex(sk, 0x6a1e14, 0.16);
    for (s = -1; s <= 1; s += 2) {
      var eg = sph(0.046 * FK, 10, 8), en = eg.attributes.normal;
      for (var ei = 0; ei < en.count; ei++) { var ex = en.getX(ei) * 0.75 + s * 0.25, ey = en.getY(ei) * 0.75, ez = en.getZ(ei) * 0.75, el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1; en.setXYZ(ei, ex / el, ey / el, ez / el); }
      G.add(eg, esk, s * (HEAD_RX - 0.005), HEAD_C - 0.005, -0.01, 0, 0, 0, 0.45, 1, 0.85);
    }
    G.owk = 1;
  }
  /** Cabeza, pelo y lo que va en ella. H0: la cabeza y el casco principal ya montados (headBase + hairGeoMain, rigGeoBegin por pasos). */
  function headGeo(G, X, tc, r, H0) {
    var cA = colA(X, tc), cB = colB(X, tc);
    if (!H0) { headBase(G, X); H0 = hairGeoMain(G, X, tc, r); }
    var R = HEAD_RX + 0.01, H = LAST_HAIR = hairGeoRest(H0), hc = HAT_CLASS[X.head];
    LAST_BAND = null;
    // (WP7 ronda 1: ranura propia: con cualquier gorro). Revisión final: con el pelo largo que cae por encima de la oreja (EAR_HAIR) los
    // aros lo atravesaban; ahí no se pintan (como el pelo bajo la gorra: lo que tapa manda) y la UI lo avisa (look.js, hint)
    if (X.ears === 'pendientes' && !EAR_HAIR[X.style]) earringGeo(G, X);
    var cAt = thinHex(cA), cBt = thinHex(cB);   // (piezas finas: el acento no brilla como un neón)
    if (X.head === 'pescador' || X.head === 'pescadorCuadros') {   // gorro de pescador: copa de cA y ala caída alrededor (anillo cerrado que nace en el borde)
      // (la copa acaba por encima de las cejas y el ala cae poco: los ojos se siguen viendo)
      var cs = [R + 0.016, HEAD_RY + 0.034, HEAD_RZ + 0.022], tht = PI * 0.4, st = Math.sin(tht), ct = Math.cos(tht), cy0 = HEAD_C + 0.02, ry = 0.04;
      // (1.18, WP3 ronda 1: copa de 18 × 7 —antes 26 × 12, 774 triángulos en LOD2—: el gorro entero cabe en ≤ 450)
      // (WP7, estampado: damero de cA y su contraste en la copa —casillas de la propia esfera: sin dientes— y el ala a gajos; mismos triángulos)
      var est = X.head === 'pescadorCuadros', c2 = est ? pick(cB, cA, tc) : 0, nS = sg(18, 12), nR = sg(7, 5);
      // (ronda 1 de WP7: las casillas se estrechaban hacia la coronilla y desde arriba parecía un balón de playa: el casquete de arriba
      //  —la mitad de arriba de las filas de la copa— va liso de cA con un filo de c2, y el damero solo por los lados)
      if (est) G.vc = function (px, py, pz) {
        var l = Math.sqrt(px * px + py * py + pz * pz) || 1, f = Math.atan2(pz, -px), rg = Math.floor(Math.acos(clamp(py / l, -1, 1)) / (tht / nR)), r0 = Math.max(1, Math.round(nR * 0.5));
        if (f < 0) f += 2 * PI;
        return rg < r0 ? null : (Math.floor(f / (2 * PI / nS)) + rg) % 2 ? c2 : null;
      };
      G.add(new THREE.SphereGeometry(1, nS, nR, 0, PI * 2, 0, tht), cA, 0, cy0, -0.005, ry, 0, 0, cs[0], cs[1], cs[2]);
      var nB = sg(16, 8); G.vc = est ? function (px, py, pz) { var f = Math.atan2(px, pz); if (f < 0) f += 2 * PI; return Math.floor(f / (2 * PI / nB)) % 2 ? mixHex(c2, 0x000000, 0.12) : null; } : null;
      G.add(lathe([V2(st * 0.985, ct + 0.01), V2(st * 1.3, ct - 0.065), V2(st * 1.31, ct - 0.1), V2(st * 0.97, ct - 0.025), V2(st * 0.985, ct + 0.01)], 16, 8),
        mixHex(cA, 0x000000, 0.12), 0, cy0, -0.005, ry, 0, 0, cs[0], cs[1], cs[2]);
      G.vc = null;
      var bh = ct + 0.06, br = Math.sqrt(1 - bh * bh);
      G.owk = 0; G.add(torus(1, 0.03, 4, sg(24, 12)), est ? NEUTRAL_DK : thinHex(cB), 0, cy0 + cs[1] * bh * Math.cos(ry), -0.005 + cs[1] * bh * Math.sin(ry),
        PI / 2 + ry, 0, 0, cs[0] * br * 1.01, cs[2] * br * 1.01, 0.6); G.owk = 1;   // cinta de la copa
    } else if (hc === 'CAP' || hc === 'CAPB') capGeo(G, X, cA, cB);
    else if (hc === 'SCARF') scarfGeo(G, X, cA);
    else if (hc === 'BEANIE') beanieGeo(G, X, cA, cB, tc);
    else if (X.head === 'diadema') diademaGeo(G, H, pick(cAt, X.hair, tc, 170));   // (sobre el pelo: que se separe de él, también de espaldas)
    else if (X.head === 'pinzas') pinzasGeo(G, H, X, tc);
    else if (X.head === 'cinta' || X.head === 'visera' || X.head === 'viseraGafas') {
      // cinta plana de 3,8 cm pegada a la frente (por encima de las cejas) y al pelo, con una franja fina de contraste (cB) en medio;
      // la cinta lleva además un nudo con dos colas en la nuca (faceGeo, muelle del pelo) y la visera, el cierre de atrás: de espaldas
      // ya no son la misma raya (1.18, WP3 ronda 1)
      // (ronda 1 de WP7: con las gafas, la banda va a 24 tramos —12 en LOD0—: el gorro entero vuelve a caber en 250 / 450 triángulos)
      var h = 0.019, t = 0.007, bp = bandPath(H, HEAD_C + BAND_Y * FK, BAND_TILT * R, X.head === 'viseraGafas' ? sg(24, 12) : sg(32, 14), 0, null, null, h);
      var prof = [[-h, 0.0008], [-h * 0.86, t], [-h * 0.16, t], [h * 0.16, t], [h * 0.86, t], [h, 0.0008]];   // (franja estrecha: ancha, la cinta se leía como dos rayas)
      LAST_BAND = bp;
      G.owk = 1;
      G.add(profSweep(bp.P, bp.N, prof, [1, 3], true), cAt);
      G.add(profSweep(bp.P, bp.N, prof, [0, 4], true), mixHex(cAt, 0x000000, 0.35));   // cantos (arriba y abajo) más oscuros: no brillan
      G.add(profSweep(bp.P, bp.N, prof, [2], true), X.head === 'visera' ? mixHex(cAt, 0x000000, 0.18) : cBt);
      G.owk = 1;
      if (X.head === 'visera' || X.head === 'viseraGafas') {   // visera deportiva: la misma banda + la visera gruesa del acento que nace en su frente
        capBrim(G, function (ph) { var q = pathAt(bp, ph); return { p: [q.p[0] + q.n[0] * t, q.p[1] + h * 0.6, q.p[2] + q.n[2] * t] }; }, 0, 0.95, 0.14 * FK, 0.06, thinHex(cA));   // (visera fina: sin halo)
        // cierre de atrás: tira de velcro oscura más alta que la banda, con la lengüeta en cB (se lee de espaldas)
        var bq = pathAt(bp, PI), bn = bq.n, nl = Math.sqrt(bn[0] * bn[0] + bn[2] * bn[2]) || 1, ay = Math.atan2(bn[0] / nl, bn[2] / nl);
        G.owk = 0.8;
        G.add(new THREE.BoxGeometry(1, 1, 1), 0x2a2d36, bq.p[0] + bn[0] * t, bq.p[1], bq.p[2] + bn[2] * t, 0, ay, 0, 0.07 * FK, h * 2.6, 0.006);
        G.add(new THREE.BoxGeometry(1, 1, 1), cBt, bq.p[0] + bn[0] * (t + 0.004), bq.p[1], bq.p[2] + bn[2] * (t + 0.004), 0, ay, 0, 0.022 * FK, h * 1.5, 0.004);
        G.owk = 1;
        if (X.head === 'viseraGafas') visorShades(G, X, tc, bp, h, t);
      }
    } else if (X.head === 'cintaRizo') {   // cinta de rizo: tubo GORDO (5 cm × 4 cm) de rizo blanco/cA a bandas anchas: no es otra raya
      var rv = 0.026, rn = 0.02, rp = bandPath(H, HEAD_C + BAND_Y * FK, BAND_TILT * R, sg(24, 10), 0, null, null, rv), A = [-90, -62, -38, -14, 14, 38, 62, 90], pr = [];
      A.forEach(function (a) { var q = a * PI / 180; pr.push([rv * Math.sin(q), rn * Math.cos(q) + 0.0015]); });
      // franja central ancha en blanco roto (o en el oscuro del acento si cA ya es claro) y los bordes en cA: de frente y de espaldas
      // se ve un tubo a tres bandas, nada que ver con la cinta plana
      var stripe = lumHex(cA) > 0.6 ? mixHex(cA, 0x000000, 0.5) : 0xe8e4da;
      G.owk = 1;
      G.add(profSweep(rp.P, rp.N, pr, [0, 1, 5, 6], true), cAt);
      G.add(profSweep(rp.P, rp.N, pr, [2, 3, 4], true), stripe);
      G.owk = 1;
    } else if (X.head === 'corona') crownGeo(G, H);
    G.owk = 1;
  }
  /** Altura del pelo (o de la cabeza) en (x, z) del espacio de la cabeza: el θ del casco cuya distancia horizontal al eje es la de (x, z). */
  function surfY(H, x, z) {
    var ph = Math.atan2(x, z), rho = Math.sqrt(x * x + z * z), a = 0.01, b = 0.5 * PI, p = null;
    for (var i = 0; i < 16; i++) { var m = (a + b) / 2; p = H.pt(ph, m, 0); if (Math.sqrt(p[0] * p[0] + p[2] * p[2]) < rho) a = m; else b = m; }
    return H.pt(ph, (a + b) / 2, 0)[1];
  }
  /** Corona dorada GRANDE (×1,4, puntas ×1,6) APOYADA en el pelo: su borde de abajo sigue la superficie del casco alrededor del punto
   *  que dice el peinado (HAIR_STYLES[…].crown → H.crownAt), banda baja más oscura con gemas a los lados (rubí delante, zafiros a los
   *  lados) y una bolita en cada punta. 150-250 triángulos. */
  function crownGeo(G, H) {
    var at = H.crownAt, n = sg(16, 10), rr = 0.068 * FK * 1.4, hv = 0.034 * FK, ht = 0.1 * FK, hb = 0.022 * FK, P = [], N = [], Y = [], k;
    var cx = at ? at.p[0] : 0, cz = at ? at.p[2] : 0, rc = Math.sqrt(cx * cx + cz * cz), rcMax = 0.075 * FK;
    if (rc > rcMax) { cx *= rcMax / rc; cz *= rcMax / rc; }   // (que el aro no cuelgue por fuera de la cabeza: la cresta la pone de lado)
    for (k = 0; k < n; k++) {
      var a = 2 * PI * k / n, x = cx + rr * Math.sin(a), z = cz + rr * Math.cos(a);
      Y.push(surfY(H, x, z) - 0.006);
      P.push([x, 0, z]); N.push([Math.sin(a), 0, Math.cos(a)]);
    }
    // (suavizado: que el borde no copie los bultos del pelo)
    Y = Y.map(function (v, i) { return (Y[(i + 1) % n] + 2 * v + Y[(i - 1 + n) % n]) / 4; });
    P.forEach(function (p, i) { p[1] = Y[i]; });
    function prof(i) {
      var top = i % 2 === 0 ? ht : hv, lean = top * 0.12;
      return [[0, -0.002], [0, 0.007], [hb, 0.009], [top, 0.009 + lean], [top, 0.002 + lean], [0, -0.004]];
    }
    var GD = mixHex(GOLD, 0x8a5a10, 0.4);
    G.owk = 0.6;
    G.add(profSweep(P, N, prof, [0, 1, 4], true), GD);
    G.add(profSweep(P, N, prof, [2], true), GOLD);
    G.add(profSweep(P, N, prof, [3], true), GOLD_HI);
    G.owk = 0.4;
    for (k = 0; k < n; k += 2) {   // bolitas de las puntas
      var q = P[k], nn = N[k], tl = ht * 0.12 + 0.006;
      G.add(new THREE.OctahedronGeometry(0.012 * FK, 0), GOLD_HI, q[0] + nn[0] * tl, q[1] + ht + 0.004, q[2] + nn[2] * tl);
    }
    [[0, 0xe0383e, 0.017], [PI / 2, 0x2f6fe0, 0.013], [-PI / 2, 0x2f6fe0, 0.013]].forEach(function (gm) {   // gemas
      var a = gm[0], x = cx + (rr + 0.012) * Math.sin(a), z = cz + (rr + 0.012) * Math.cos(a), y = surfY(H, cx + rr * Math.sin(a), cz + rr * Math.cos(a)) - 0.006 + hb * 0.5;
      G.add(new THREE.OctahedronGeometry(1, 0), gm[1], x, y, z, 0, a, 0, gm[2] * FK, gm[2] * FK * 1.2, 0.007);
    });
    G.owk = 1;
  }
  /** Punto del pelo (si lo hay en (φ, θ)) o de la piel, `off` por fuera. */
  function overPt(H, ph, th, off) {
    if (H && H.line && th < H.line(ph) - 0.004) return H.pt(ph, th, off);
    var o = {}; headPt(ph, th, off, o); return [o.x, o.y, o.z, o.nx, o.ny, o.nz];
  }
  /** Si p queda dentro de la copa del gorro (la gorra al revés con las gafas en la frente), lo saca a su superficie + off. */
  function outCup(cup, p, off) {
    if (!cup) return p;
    var qx = p[0] - cup.c[0], qy = p[1] - cup.c[1], qz = p[2] - cup.c[2], cr = Math.cos(cup.rx), sr = Math.sin(cup.rx);
    var ly = (qy * cr + qz * sr) / cup.s[1], lz = (-qy * sr + qz * cr) / cup.s[2], lx = qx / cup.s[0], l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
    var want = 1 + off / cup.s[1];
    if (l >= want || Math.acos(clamp(ly / l, -1, 1)) > cup.tl + 0.06) return p;
    var k = want / l, X = lx * k * cup.s[0], Y = ly * k * cup.s[1], Z = lz * k * cup.s[2];
    return [cup.c[0] + X, cup.c[1] + Y * cr - Z * sr, cup.c[2] + Y * sr + Z * cr].concat(p.slice(3));
  }
  /** Varilla de 3 lados (6 triángulos) de A a B. */
  function rod(G, A, B, r, hex) {
    var L = Math.sqrt((B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1]) + (B[2] - A[2]) * (B[2] - A[2]));
    addAim(G, new THREE.CylinderGeometry(r, r, L, 3, 1, true), hex, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2, [B[0] - A[0], B[1] - A[1], B[2] - A[2]], 'y');
  }
  /** Gafas (hueso head). Las de la frente son de geometría; las pintadas (atlas) llevan aquí las patillas (también en LOD0: es lo único
   *  de las gafas que se ve de espaldas) y, según el modelo, la goma de las deportivas por la nuca o el cordón de las oscuras y las de
   *  espejo, en cA: se ven en el partido. */
  function eyesGeo(G, X, tc) {
    var s, gl = glassHex(X, tc), H = LAST_HAIR, cA = thinHex(colA(X, tc));
    if (X.eyes === 'frente') { frenteGeo(G, X, gl, H); return; }
    if (!X.eyes) return;
    if (X.eyes === 'gafasVentisca') { ventiscaStrap(G, X, tc, H); return; }   // (WP7: la correa ancha hace de patillas)
    // patillas: dos cuerdas pegadas a la cabeza (o al pelo), del borde de la lámina de ojos a la oreja, por encima de ella
    var ey = HEAD_C + (GLASS_Y + 0.022 - HEAD_C0) * FK, th = Math.acos(clamp((ey - HEAD_C) / HEAD_RY, -1, 1)), c = Math.sin(th);
    var pA = Math.asin(Math.min(0.99, FE_DX / c)) - 0.04, earY = HEAD_C - 0.005 + 0.046 * FK * 1.02, thE = Math.acos(clamp((earY - HEAD_C) / HEAD_RY, -1, 1));
    G.owk = 0;
    var ends = [];
    // (pulido: con pelo largo por los lados —melena, cortina, ondas…— la patilla se mete BAJO el pelo donde lo encuentra, como unas gafas
    //  de verdad; antes iba por encima del pelo hasta la nuca, una varilla dorada cruzando la melena)
    var hst = HAIR_STYLES[X.style] || {}, longSide = H && H.line && (hst.line === 'medio' || hst.line === 'largo' || EAR_HAIR[X.style]), phIn = 0;
    if (longSide) for (var q = pA; q < EAR_PH; q += 0.04) if (lerp(th, thE, clamp((q - pA) / (EAR_PH - pA), 0, 1)) < H.line(q) - 0.02) { phIn = q; break; }
    for (s = -1; s <= 1; s += 2) {
      var A = overPt(H, s * pA, th, Math.max(0.005, faceClear() + 0.002)), M, B;
      if (phIn && phIn < 1.2) {
        var pe = Math.min(EAR_PH, phIn + 0.14), te = lerp(th, thE, clamp((pe - pA) / (EAR_PH - pA), 0, 1));
        B = H.pt(s * pe, te, -0.004); M = overPt(H, s * lerp(pA, pe, 0.5), lerp(th, te, 0.5), 0.004);
      } else { M = overPt(H, s * 1.2, lerp(th, thE, 0.4), 0.006); B = overPt(H, s * EAR_PH, thE, 0.012); }
      rod(G, A, M, 0.0055, gl); rod(G, M, B, 0.0055, gl);
      ends.push(phIn && phIn < 1.2 ? overPt(H, s * EAR_PH, thE, 0.012) : B);   // (el cordón de las oscuras sale de la oreja, como antes)
    }
    if (X.eyes === 'deporte') {   // goma por la nuca, a la altura de las patillas: una tira plana de cA
      var gh = 0.012, gt = 0.004, gp = bandPath(H, ey, 0, sg(12, 8), 0.001, EAR_PH - 0.25, 2 * PI - EAR_PH + 0.25, gh);
      G.owk = 0.4; G.add(profSweep(gp.P, gp.N, [[-gh, 0], [-gh, gt], [gh, gt], [gh, 0]], [0, 1, 2], false), cA);
    } else if (X.eyes === 'oscuras' || X.eyes === 'espejo') {   // cordón que cuelga por detrás de la nuca, de oreja a oreja
      var nC = sg(8, 5), P = [], N = [], i;
      for (i = 0; i <= nC; i++) {
        var u = i / nC, ph = lerp(EAR_PH, 2 * PI - EAR_PH, u), sag = Math.sin(u * PI), thc = lerp(thE, 0.66 * PI, sag);
        if (ph > PI) ph -= 2 * PI;
        var q = overPt(H, ph, thc, 0.012 + 0.004 * sag);
        P.push(q.slice(0, 3)); N.push(q.slice(3, 6));
      }
      P[0] = ends[1].slice(0, 3); P[nC] = ends[0].slice(0, 3);
      G.owk = 0.4; G.add(profSweep(P, N, [[-0.01, 0], [0, 0.009], [0.01, 0]], [0, 1, 2], false), cA);
    }
    G.owk = 1;
  }
  /** Correa de la máscara de ventisca (WP7): banda ANCHA (3,4 cm) que rodea la cabeza por detrás a la altura de los ojos, de cA con una
   *  franja central clara y los cantos oscuros: de espaldas es lo que se ve. ≈ 160 / 120 / 80 triángulos. */
  function ventiscaStrap(G, X, tc, H) {
    var ey = HEAD_C + (GLASS_Y + 0.004 - HEAD_C0) * FK, gh = 0.017 * FK, gt = 0.005, cA = thinHex(colA(X, tc)), st = pick(0xf4f4f4, cA, tc);
    var gp = bandPath(H, ey, 0, sg(16, 8), 0.0015, EAR_PH - 0.62, 2 * PI - EAR_PH + 0.62, gh);
    var prof = [[-gh, 0.0005], [-gh * 0.88, gt], [-gh * 0.28, gt], [gh * 0.28, gt], [gh * 0.88, gt], [gh, 0.0005]];
    G.owk = 0.6;
    G.add(profSweep(gp.P, gp.N, prof, [1, 3], false), cA);
    G.add(profSweep(gp.P, gp.N, prof, [2], false), st);
    G.add(profSweep(gp.P, gp.N, prof, [0, 4], false), mixHex(cA, 0x000000, 0.35));
    G.owk = 1;
  }
  /** Gafas de sol subidas (ranura eyes = frente): dos lentes oscuras con montura de cGlass APOYADAS en el pelo (o en el tupé), inclinadas
   *  25° hacia atrás y empujadas hasta no meterse en el casco; patillas que rodean la cabeza por encima de las orejas. ≈ 250
   *  triángulos (antes 480-1040). */
  function frenteGeo(G, X, gl, H) {
    var LENS = 0x1a2340, rx = 0.05 * FK, ry = 0.038 * FK, th0 = 0.215 * PI, tilt = 25 * PI / 180, s, k, it, segs = sg(12, 8);
    var lens = [];
    for (s = -1; s <= 1; s += 2) {
      var ph = s * 0.3, c0 = outCup(H && H.cup, overPt(H, ph, th0, 0.004), 0.004), nL = [Math.sin(ph * 0.7) * Math.cos(tilt), Math.sin(tilt), Math.cos(ph * 0.7) * Math.cos(tilt)];
      var ux = [Math.cos(ph * 0.7), 0, -Math.sin(ph * 0.7)], vy = [nL[1] * ux[2] - nL[2] * ux[1], nL[2] * ux[0] - nL[0] * ux[2], nL[0] * ux[1] - nL[1] * ux[0]];
      if (vy[1] < 0) vy = vy.map(function (v) { return -v; });
      var C = c0.slice(0, 3);
      for (it = 0; it < 3; it++) {   // empuja la lente por su normal hasta que ningún punto de su borde quede dentro del pelo
        var need = 0;
        for (k = 0; k <= 8; k++) {
          var a = 2 * PI * k / 8, q = k === 8 ? C : [C[0] + ux[0] * rx * Math.cos(a) + vy[0] * ry * Math.sin(a), C[1] + ux[1] * rx * Math.cos(a) + vy[1] * ry * Math.sin(a), C[2] + ux[2] * rx * Math.cos(a) + vy[2] * ry * Math.sin(a)];
          var an = hAngles(q[0], q[1], q[2]), S = outCup(H && H.cup, overPt(H, an[0], an[1], 0.008 + (H && H.st.over && !H.cup ? H.st.over(an[0], an[1]) : 0)), 0.008);
          var rq = Math.sqrt(q[0] * q[0] + (q[1] - HEAD_C) * (q[1] - HEAD_C) + q[2] * q[2]), rs = Math.sqrt(S[0] * S[0] + (S[1] - HEAD_C) * (S[1] - HEAD_C) + S[2] * S[2]);
          var rad = [q[0] / rq, (q[1] - HEAD_C) / rq, q[2] / rq], cosr = Math.max(0.35, rad[0] * nL[0] + rad[1] * nL[1] + rad[2] * nL[2]);
          need = Math.max(need, (rs - rq) / cosr);
        }
        if (need <= 0.0005) break;
        C = [C[0] + nL[0] * need, C[1] + nL[1] * need, C[2] + nL[2] * need];
      }
      lens.push({ C: C, n: nL, u: ux, v: vy, s: s });
    }
    lens.forEach(function (L) {
      var ee = aim(L.n[0], L.n[1], L.n[2], 'y');
      G.owk = 0.6; G.add(new THREE.CylinderGeometry(1, 1, 1, segs, 1, false), gl, L.C[0], L.C[1], L.C[2], ee[0], ee[1], ee[2], rx * 1.16, 0.01, ry * 1.2);   // montura
      G.owk = 0;
      var f = 0.0065;
      G.add(new THREE.CylinderGeometry(1, 1, 1, segs, 1, false), LENS, L.C[0] + L.n[0] * f, L.C[1] + L.n[1] * f, L.C[2] + L.n[2] * f, ee[0], ee[1], ee[2], rx, 0.006, ry);   // lente
      var hp = [L.C[0] + L.n[0] * 0.0102 - L.u[0] * rx * 0.35 * L.s + L.v[0] * ry * 0.4, L.C[1] + L.n[1] * 0.0102 + L.v[1] * ry * 0.4, L.C[2] + L.n[2] * 0.0102 - L.u[2] * rx * 0.35 * L.s + L.v[2] * ry * 0.4];
      addAim(G, new THREE.CircleGeometry(0.011 * FK, 5), 0xdfe8ff, hp[0], hp[1], hp[2], L.n, 'z');   // brillo
    });
    // puente
    var iA = lens[0], iB = lens[1];
    G.owk = 0.6;
    rod(G, [iA.C[0] + iA.u[0] * rx * 0.95, iA.C[1] + iA.u[1] * rx * 0.95, iA.C[2] + iA.u[2] * rx * 0.95], [iB.C[0] - iB.u[0] * rx * 0.95, iB.C[1] - iB.u[1] * rx * 0.95, iB.C[2] - iB.u[2] * rx * 0.95], 0.007, gl);
    // patillas: del canto de fuera de cada lente hacia atrás por encima del pelo, hasta detrás de la oreja
    lens.forEach(function (L) {
      var sx = L.s, E = [L.C[0] + L.u[0] * rx * 1.12 * sx, L.C[1] + L.u[1] * rx * 1.12 * sx, L.C[2] + L.u[2] * rx * 1.12 * sx];
      var an = hAngles(E[0], E[1], E[2]), pts = [E], nn = sg(4, 3);
      for (k = 1; k <= nn; k++) { var u = k / nn, q = outCup(H && H.cup, overPt(H, sx * lerp(Math.abs(an[0]) + 0.25, 1.95, u), lerp(an[1], 0.4 * PI, u), 0.007), 0.007); pts.push(q.slice(0, 3)); }
      for (k = 0; k < pts.length - 1; k++) rod(G, pts[k], pts[k + 1], 0.006, gl);
    });
    G.owk = 1;
  }
  /** Láminas de la cara (sin contorno, UV propia) y, en el hueso del pelo (el muelle): el nudo y las colas del pañuelo. */
  function faceGeo(G, r, X, tc, on) {
    on(r.head); G.owk = 0; G.mode = 'own';
    var nx = Math.max(6, Math.round(12 * LODK + 0.5)), ny = Math.max(5, Math.round(7 * LODK + 0.5)), xs = spanList(nx, -FE_DX, FE_DX), ys = [], j;
    G.add(faceSheet(xs, ny, FE_DX, FE_DY0, FE_DY1, 0, FE_Y, FE_W, FE_H), 0xffffff);
    // lámina de boca (1.18, WP3 ronda 1): las MISMAS columnas que la de ojos (+ una a cada lado hasta FM_DX), así sus vértices casan
    // en SPLIT_DY; ≥ 5 filas también en LOD0, más juntas hacia la barbilla (donde la cabeza se curva), proyección que envuelve la
    // mandíbula y un faldón de 2 filas bajo el mentón (repite la última fila de texels: la barba sigue por debajo)
    for (j = 0; j <= ny; j++) ys.push(FM_DY0 + (FM_DY1 - FM_DY0) * Math.pow(j / ny, 1.45));
    G.add(faceSheet([-FM_DX].concat(xs, [FM_DX]), ys, FM_DX, FM_DY0, FM_DY1, 0, FM_Y, FM_W, FM_H,
      { wrap: true, skirt: [FM_DY0 - 0.12, FM_DY0 - 0.3] }), 0xffffff);
    G.mode = 'flat'; G.owk = 1;
    // posición del hueso del pelo en el espacio de la cabeza (pose de reposo): lo de la cabeza se pasa al hueso del pelo
    var mh = r.rest[r.bones.indexOf(r.head)].elements, mp = r.rest[r.bones.indexOf(r.hair)].elements;
    var hx = mp[12] - mh[12], hy = mp[13] - mh[13], hz = mp[14] - mh[14], cA = colA(X, tc);
    if (X.head === 'bandana') {   // pañuelo: nudo en el borde de atrás de la copa y dos colas planas que caen y se mueven con el muelle
      on(r.hair);
      var cup = hatCup('bandana'), kp = cupPt(cup, PI, cup.tl, 0.014), s;
      var ky = kp[1] - hy, kz = kp[2] - hz;
      G.owk = 0.6; G.add(sph(1, 8, 6), cA, -hx, ky, kz, 0, 0, 0, 0.036 * FK, 0.03 * FK, 0.026 * FK);
      for (s = -1; s <= 1; s += 2) {   // (las colas salen hacia los lados y caen: de espaldas se lee el lazo, no una corbata)
        var P = [], N = [], i;
        for (i = 0; i <= 3; i++) { var u = i / 3; P.push([-hx + s * (0.02 + 0.055 * u), ky - 0.008 - 0.075 * FK * u, kz - 0.012 - 0.01 * Math.sin(u * PI)]); N.push([0, 0, -1]); }
        G.add(profSweep(P, N, function (i) { var w = 0.024 * FK * (1 - 0.3 * i / 3); return [[-w, 0], [-w * 0.9, 0.007], [w * 0.9, 0.007], [w, 0]]; }, [0, 1, 2, 3], false), mixHex(cA, 0x000000, 0.06));
      }
      G.owk = 1;
    } else if (X.head === 'cinta' && LAST_BAND) {   // cinta: nudo en la nuca y dos colas cortas que cuelgan (de espaldas se distingue)
      on(r.hair);
      var bq = pathAt(LAST_BAND, PI), cAt = thinHex(cA), bn = bq.n, t = 0.009;
      var kx = bq.p[0] + bn[0] * t - hx, kyy = bq.p[1] - hy, kzz = bq.p[2] + bn[2] * t - hz;
      G.owk = 0.8; G.add(new THREE.SphereGeometry(1, 6, 4), mixHex(cAt, 0x000000, 0.1), kx, kyy, kzz, 0, 0, 0, 0.022 * FK, 0.02 * FK, 0.012 * FK);
      for (var sd = -1; sd <= 1; sd += 2) {   // colas: cintas planas que caen hacia los lados, algo abiertas, con la franja cB en la punta
        var Pc = [], Nc = [], ic;
        for (ic = 0; ic <= 3; ic++) { var uc = ic / 3; Pc.push([kx + sd * (0.008 + 0.03 * uc), kyy - 0.006 - 0.06 * FK * uc, kzz - 0.004 - 0.008 * Math.sin(uc * PI)]); Nc.push([0, 0, -1]); }
        G.add(profSweep(Pc, Nc, function () { var w = 0.015 * FK; return [[-w, 0], [-w * 0.9, 0.005], [w * 0.9, 0.005], [w, 0]]; }, [0, 1, 2, 3], false), cAt);
      }
      G.owk = 1;
    }
  }

  // =====================================================================
  //  RIG: mismo esqueleto que players.js (27 huesos, mismo orden)
  // =====================================================================
  /** Posiciones (espacio del hueso de la cabeza / del pecho) de los huesos vacíos de la cara y del pelo, para que players.js
   *  monte el mismo esqueleto: {eyes, mouth, teeth, browL, browR, hair} = [x, y, z]. */
  function boneLayout() {
    var fz = headFrontZ, eY = HEAD_C + (EYE_Y - HEAD_C0) * FK, mY = HEAD_C + (MOUTH_Y - HEAD_C0) * FK, bY = HEAD_C + (BROW_Y - HEAD_C0) * FK, eX = EYE_X * FK;
    return { eyes: [0, eY, fz(eX, eY)], mouth: [0, mY, fz(0, mY)], teeth: [0, mY, fz(0, mY)], browL: [eX, bY, fz(eX, bY)], browR: [-eX, bY, fz(eX, bY)], hair: [0, HEAD_C + HEAD_RY - 0.02, -0.06] };
  }
  /** Muñeco completo (esqueleto, malla y material). opt (vista previa del Vestuario): {tc, num, beach, px, lod}; sin opt, la maqueta
   *  (equipo TEAMS[L.team], dorsal L.num, L.beach, atlas de 1024² y la malla alta). */
  function buildRig(L, idx, opt) {
    opt = opt || {};
    return rigSkin(opt.rig || rigBones(L, idx, opt), opt);
  }
  /** Esqueleto y datos del muñeco, sin malla ni material (buildRig = rigBones + rigSkin; las miniaturas montan la malla por pasos). */
  function rigBones(L, idx, opt) {
    opt = opt || {};
    var tc = opt.tc || (DBG_TC && DBG_TC[L.team | 0]) || TEAMS[L.team | 0] || TEAMS[0], root = new THREE.Group(); root.name = 'doll' + idx;
    var bones = [];
    function bone(parent, x, y, z) { var b = new THREE.Bone(); b.position.set(x || 0, y || 0, z || 0); parent.add(b); bones.push(b); return b; }
    var body = bone(root);
    var pelvis = bone(body, 0, HIP_H, 0);
    var spine = bone(pelvis, 0, SPINE_Y, 0);
    var chest = bone(spine, 0, CHEST_Y, 0);
    var head = bone(chest, 0, NECK_Y, 0); head.rotation.order = 'YXZ';
    var fz = headFrontZ;
    // huesos de la cara (vacíos: la cara es una textura) en la cabeza activa (rasgos de v1 escalados ×FK)
    var eY = HEAD_C + (EYE_Y - HEAD_C0) * FK, mY = HEAD_C + (MOUTH_Y - HEAD_C0) * FK, bY = HEAD_C + (BROW_Y - HEAD_C0) * FK, eX = EYE_X * FK;
    var eyes = bone(head, 0, eY, fz(eX, eY)), mouth = bone(head, 0, mY, fz(0, mY)), teeth = bone(head, 0, mY, fz(0, mY));
    var browL = bone(head, eX, bY, fz(eX, bY)), browR = bone(head, -eX, bY, fz(eX, bY));
    var hair = bone(head, 0, HEAD_C + HEAD_RY - 0.02, -0.06);
    // medidas con las que se construyó ESTE muñeco (las poses y el balón las leen de aquí: así conviven v1 y chibi en la comparación)
    var D = { body: BODY, HIP_H: HIP_H, NECK_Y: NECK_Y, SH_X: SH_X, PALM: PALM, UPPER: UPPER, FORE: FORE, STRETCH: STRETCH_MAX, LEG: THIGH + SHIN, SH_H: SH_H, HEAD_C: HEAD_C, HEAD_RY: HEAD_RY, top: SH_H + HEAD_C + HEAD_RY, heads: (SH_H + HEAD_C + HEAD_RY) / (2 * HEAD_RY), reach: REACH, reachRest: REACH_REST };
    var r = { idx: idx, look: L, tc: tc, D: D, root: root, body: body, pelvis: pelvis, spine: spine, chest: chest, head: head, eyes: eyes, mouth: mouth, teeth: teeth, brow: [browL, browR], hair: hair,
      sh: [], up: [], el: [], hand: [], hip: [], th: [], kn: [], ft: [], face: 'neutra', faceE: 0, faceM: 0, blinkT: 1.5 + idx * 0.9, blinkOn: 0, pose: 'idle', t0: idx * 0.37, tFix: -1, ball: null, geos: [null, null, null], ink: null };
    for (var k = 0; k < 2; k++) {
      var s = k === 0 ? 1 : -1;
      var sh = bone(chest, s * SH_X, SH_Y, SH_Z), up = bone(sh), el = bone(up, 0, -UPPER, 0), hd = bone(el, 0, -FORE, 0);
      r.sh.push(sh); r.up.push(up); r.el.push(el); r.hand.push(hd);
      var hp = bone(pelvis, s * HIP_W, 0, 0), th = bone(hp), kn = bone(th, 0, -THIGH, 0), ft = bone(kn, 0, -SHIN, 0);
      r.hip.push(hp); r.th.push(th); r.kn.push(kn); r.ft.push(ft);
    }
    root.updateMatrixWorld(true);
    r.bones = bones; r.rest = [];
    for (k = 0; k < bones.length; k++) r.rest.push(bones[k].matrixWorld.clone());
    r.beach = opt.beach != null ? !!opt.beach : !!L.beach || DBG_BEACH; r.num = opt.num != null ? opt.num : L.num;
    return r;
  }
  /** Malla (la de r.geos si ya está), material (opt.mat o uno nuevo), esqueleto y tinta. */
  function rigSkin(r, opt) {
    var tc = r.tc, L = r.look, idx = r.idx, root = r.root, bones = r.bones;
    // (opt.mat: material de un muñeco anterior que se reutiliza con su atlas, lo repinta quien lo pasa; las miniaturas del Vestuario)
    var skin = new THREE.SkinnedMesh(rigGeometry(r, opt.lod != null ? opt.lod : LODR), opt.mat || dollMaterial(tc, L, r.num, r.beach, opt.px || 2));
    skin.castShadow = true; skin.receiveShadow = true; skin.name = 'dollSkin' + idx; skin.frustumCulled = false;
    root.add(skin); root.updateMatrixWorld(true);
    skin.bind(new THREE.Skeleton(bones), skin.matrixWorld);
    r.skin = skin;
    ensureInk(r);
    r.handL = r.hand[0]; r.handR = r.hand[1]; r.footL = r.ft[0]; r.footR = r.ft[1];
    return r;
  }
  /** Geometría del muñeco para un nivel de detalle (0 baja, 1 media, 2 alta), en la pose de reposo guardada (r.rest).
   *  El rig (de aquí o de players.js) trae: bones, rest, look (la L del Vestuario o la vieja {skin, hair, style, acc}: normLook),
   *  tc (equipación), beach, geos[3] y los
   *  huesos pelvis, chest, head, hair, sh/up/el/hand/th/kn/ft. Se guarda en r.geos[lod]. */
  function rigGeometry(r, lod) {
    if (r.geos[lod]) return r.geos[lod];
    return rigGeoRun(rigGeoBegin(r, lod), 0);
  }
  /** La malla por pasos (WP6, ronda 1: las miniaturas del Vestuario la montan en trozos de pocos ms por frame). rigGeoBegin prepara la
   *  lista de piezas; rigGeoRun hace pasos hasta el plazo (performance.now; 0 = todos) y devuelve la geometría al acabar (o null).
   *  rigGeometry hace todos de una vez: el mismo orden y el mismo resultado de siempre. */
  function rigGeoBegin(r, lod) {
    if (!THREE) THREE = window.THREE;
    var G = new Geo(), tc = r.tc, bch = !!r.beach, X = normLook(r.look, bch), st = { r: r, lod: lod, G: G, i: 0, steps: [] }, S = st.steps;
    function on(b) { var i = r.bones.indexOf(b); G.pre = r.rest[i]; G.bone = i; G.mode = 'flat'; G.owk = 1; G.su = SU_ALL; return G; }
    S.push(function () { torsoGeo(on(r.pelvis), r); });
    var hs = {};   // (la cabeza en dos pasos: piel y casco principal; luego el resto del pelo y lo que va en la cabeza)
    S.push(function () { headBase(on(r.head), X); hs.H = hairGeoMain(G, X, tc, r); });
    S.push(function () { on(r.head); headGeo(G, X, tc, r, hs.H); });
    S.push(function () {
      eyesGeo(G, X, tc); faceGeo(G, r, X, tc, on);
      if (bch ? isLicra(X) : X.under === 'termica') collarGeo(on(r.chest), X, tc);   // cuello alto de la camiseta interior
      if (X.neck) neckGeo(on(r.chest), X, tc);
    });
    [0, 1].forEach(function (k) {
      var s = k === 0 ? 1 : -1;
      S.push(function () { shoulderGeo(on(r.sh[k]), tc, X, bch); upperGeo(on(r.up[k]), k); });
      S.push(function () { foreGeo(on(r.el[k]), X, tc, k); wristGeo(G, X, tc, k); handGeo(on(r.hand[k]), X, tc, s); });
      S.push(function () { thighGeo(on(r.th[k]), tc, X, bch, k); shinGeo(on(r.kn[k]), tc, X, bch, k); });
      S.push(function () { if (bch) footGeo(on(r.ft[k]), X, tc, s); else shoeGeo(on(r.ft[k]), tc, X); });
    });
    S.push(function () { st.geo = G.build(); });
    return st;
  }
  function rigGeoRun(st, until) {
    if (st.geo) return st.geo;
    var keepK = LODK, keepR = LODR; LODK = LOD_K[st.lod]; LODR = st.lod;
    try {
      while (st.i < st.steps.length) { st.steps[st.i++](); if (until && performance.now() >= until && st.i < st.steps.length) break; }
    } finally { LODK = keepK; LODR = keepR; }
    if (st.geo) st.r.geos[st.lod] = st.geo;
    return st.geo || null;
  }
  function setLod(r, lod) {
    var g = rigGeometry(r, lod);
    if (r.skin.geometry !== g) { r.skin.geometry = g; if (r.ink) r.ink.geometry = g; }
  }
  function triCount(geo) { return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3; }

  // ---------- Cara: celdas → uniformes del material ----------
  /** Celda de ojos (0-7) y de boca (0-7) en un material del muñeco (dos uniformes; sin texturas ni mallas nuevas). */
  function faceCells(mat, e, m) {
    var ud = mat && mat.userData; if (!ud || !ud.eyeOff) return false;
    ud.eyeOff.set((e & 3) * FE_W / ATLAS, -(e >> 2) * FE_H / ATLAS);
    ud.mouthOff.set((m & 7) * FM_W / ATLAS, 0);
    return true;
  }
  function setFaceCells(r, e, m) { r.faceE = e; r.faceM = m; faceCells(r.skin.material, e, m); }
  function setFace(r, name) { var x = EXPR[name] || EXPR.neutra; r.face = EXPR[name] ? name : 'neutra'; setFaceCells(r, r.blinkOn > 0 ? 1 : x[0], x[1]); }
  /** Parpadeo: cada 2-5 s, 0,12 s con la celda 1 (no en las expresiones con los ojos ya cerrados). */
  function blink(r, dt) {
    var x = EXPR[r.face] || EXPR.neutra;
    if (r.blinkOn > 0) { r.blinkOn -= dt; if (r.blinkOn <= 0) { r.blinkOn = 0; setFaceCells(r, x[0], x[1]); } return; }
    r.blinkT -= dt;
    if (r.blinkT <= 0) { r.blinkT = 2 + Math.random() * 3; if (x[0] === 0 || x[0] === 2 || x[0] === 5 || x[0] === 6) { r.blinkOn = 0.12; setFaceCells(r, 1, x[1]); } }
  }

  // =====================================================================
  //  POSES (a mano, rotando huesos) y ANIMACIÓN DE DEMOSTRACIÓN (squash & stretch como escalas de huesos)
  // =====================================================================
  // Convenciones (huesos en reposo con la identidad; extremidades colgando en -Y): rotation.x < 0 lleva la mano/pie hacia
  // DELANTE (+Z); rotation.z > 0 lleva la mano hacia +X (la izquierda del muñeco). s = +1 lado izquierdo, -1 derecho.
  function rot(b, x, y, z) { b.rotation.set(x || 0, y || 0, z || 0); }
  function resetPose(r) {
    var i; for (i = 0; i < r.bones.length; i++) { r.bones[i].rotation.set(0, 0, 0); r.bones[i].scale.set(1, 1, 1); }
    r.body.position.set(0, 0, 0); r.pelvis.position.set(0, r.D.HIP_H, 0); r.head.position.set(0, r.D.NECK_Y, 0);
  }
  var POSES = {
    /** de pie, en reposo, con el balón en la mano derecha a la altura de la barriga */
    idle: function (r) {
      rot(r.pelvis, 0.02, 0, 0.02); rot(r.chest, 0, 0.06, -0.02); rot(r.head, 0.04, -0.14, -0.05);
      rot(r.up[0], -0.1, 0, 0.14); rot(r.el[0], -0.3, 0, 0.05);
      rot(r.up[1], -0.55, 0, -0.1); rot(r.el[1], -1.45, 0.0, 0); rot(r.hand[1], 0.3, 0, 0);
      rot(r.th[0], 0.02, 0, 0.06); rot(r.th[1], -0.02, 0, -0.1); rot(r.kn[1], 0.06, 0, 0); rot(r.ft[0], 0, 0.05, -0.06); rot(r.ft[1], -0.04, -0.1, 0.1);
    },
    /** recepción / plataforma: rodillas flexionadas, tronco adelante, brazos rectos y juntos, mirada al balón */
    recv: function (r) {
      var th = -1.0, kn = 1.35;
      r.pelvis.position.y = r.D.HIP_H - 0.26 * r.D.LEG;   // lo que acortan las rodillas flexionadas (pies en el suelo)
      rot(r.pelvis, 0.42, 0, 0); rot(r.chest, 0.22, 0, 0); rot(r.head, -0.62, 0, 0);
      for (var k = 0; k < 2; k++) {
        var s = k ? -1 : 1;
        rot(r.th[k], th, 0, s * 0.22); rot(r.kn[k], kn, 0, 0); rot(r.ft[k], -(th + kn) - 0.42, 0, -s * 0.22);
        rot(r.up[k], -0.78, 0, -s * 0.16); rot(r.el[k], 0.0, 0, -s * 0.06); rot(r.hand[k], 0.15, s * 1.3, 0);
      }
    },
    /** remate en el aire: brazo derecho armado, cuerpo arqueado, piernas recogidas (el estirón al golpe lo pone animate con reachTo) */
    spike: function (r) {
      r.body.position.y = 0.72;
      rot(r.pelvis, -0.22, 0.1, 0); rot(r.chest, -0.12, 0.25, 0.08); rot(r.head, -0.45, -0.12, 0);
      rot(r.up[1], -2.85, 0, -0.35); rot(r.el[1], -0.25, 0, 0); rot(r.hand[1], -0.55, 0, 0);
      rot(r.up[0], -0.95, 0, 0.45); rot(r.el[0], -1.1, 0, 0);
      rot(r.th[0], -0.55, 0, 0.12); rot(r.kn[0], 1.25, 0, 0); rot(r.ft[0], 0.45, 0, 0);
      rot(r.th[1], 0.35, 0, -0.12); rot(r.kn[1], 0.95, 0, 0); rot(r.ft[1], 0.5, 0, 0);
      r.body.scale.set(0.96, 1.08, 0.96);
    },
    /** bloqueo: en el aire, los dos brazos rectos arriba (animate los lleva con reachTo a los objetivos: estirón), rodillas recogidas */
    block: function (r) {
      r.body.position.y = 0.45;
      rot(r.pelvis, 0.08, 0, 0); rot(r.chest, 0.06, 0, 0); rot(r.head, -0.2, 0, 0);
      rot(r.up[0], -3.0, 0, 0.2); rot(r.up[1], -3.0, 0, -0.2); rot(r.hand[0], 0.25, 0, 0); rot(r.hand[1], 0.25, 0, 0);
      rot(r.th[0], -0.35, 0, 0.1); rot(r.kn[0], 0.8, 0, 0); rot(r.ft[0], 0.3, 0, 0);
      rot(r.th[1], -0.35, 0, -0.1); rot(r.kn[1], 0.8, 0, 0); rot(r.ft[1], 0.3, 0, 0);
    },
    /** celebración: brazos en V, una rodilla arriba, cabeza atrás */
    cel: function (r) {
      rot(r.pelvis, -0.1, 0, 0); rot(r.chest, -0.1, 0, 0); rot(r.head, -0.3, 0.1, 0.1);
      rot(r.up[0], -0.25, 0, 2.5); rot(r.el[0], 0, 0, 0.45); rot(r.hand[0], 0, 0, 0.3);
      rot(r.up[1], -0.25, 0, -2.5); rot(r.el[1], 0, 0, -0.45); rot(r.hand[1], 0, 0, -0.3);
      rot(r.th[0], -1.2, 0, 0.1); rot(r.kn[0], 1.5, 0, 0); rot(r.ft[0], 0.3, 0, 0);
      rot(r.th[1], 0.05, 0, -0.08); rot(r.ft[1], -0.05, 0, 0.08);
    }
  };
  // ---- Ganchos de squash & stretch (escalas de huesos; la fase 2 los llamará desde players.js) ----
  /** Estira (a > 0) o aplasta (a < 0) el cuerpo entero desde el suelo (hueso body): volumen casi constante. */
  function squash(r, a) { var sy = 1 + a, sx = 1 / Math.sqrt(sy); r.body.scale.set(sx, sy, sx); }
  /** Estirón del brazo k: brazo + antebrazo se alargan ×s desde el hombro (escala y del hueso del brazo) y adelgazan (volumen,
   *  ×1/√s); la bola del codo se desplaza con él; la MANO recupera su tamaño (escala inversa en el hueso de la mano). s = 1: reposo. */
  function stretchArm(r, k, s) {
    var q = Math.sqrt(s);
    r.up[k].scale.set(1 / q, s, 1 / q);
    r.hand[k].scale.set(q, 1 / s, q);
  }
  var DOWN = null, QA = null, TMP2 = null;
  /** IK de un hueso con estirón cartoon (gancho para la fase 2): lleva el centro de la PALMA del brazo k al punto `tw` (mundo) con el
   *  brazo recto apuntando a él. Si queda fuera del alcance de reposo, brazo + antebrazo se alargan lo que haga falta (tope r.D.STRETCH,
   *  que cubre el alcance del atleta). `w` (0..1, por defecto 1) = peso del estirón (0 = largo de reposo; valores < 0 lo encogen un poco:
   *  anticipación, mínimo ×0,9); `blend` (0..1, por defecto 1) = mezcla de la orientación con la pose actual del brazo (entrada suave).
   *  Devuelve el factor de estiramiento necesario (1 = llega sin estirar; > STRETCH = no llega ni estirado). */
  function reachTo(r, k, tw, w, blend) {
    if (!DOWN) { DOWN = new THREE.Vector3(0, -1, 0); QA = new THREE.Quaternion(); TMP2 = new THREE.Vector3(); }
    if (w == null) w = 1; if (blend == null) blend = 1;
    var sh = r.sh[k], up = r.up[k], el = r.el[k];
    r.root.updateMatrixWorld(true);
    TMP2.copy(tw); sh.worldToLocal(TMP2);
    var d = TMP2.length(), armL = r.D.UPPER + r.D.FORE, need = Math.max(0.2, (d - r.D.PALM) / armL);
    var sN = clamp(need, 1, r.D.STRETCH), s = Math.max(0.9, 1 + (sN - 1) * w);
    if (d > 1e-4) {
      TMP2.multiplyScalar(1 / d); QA.setFromUnitVectors(DOWN, TMP2);
      if (blend >= 1) up.quaternion.copy(QA); else up.quaternion.slerp(QA, blend);
      el.rotation.x *= 1 - blend; el.rotation.z *= 1 - blend;
    }
    stretchArm(r, k, s);
    return need;
  }
  /** Rebote de la cabeza (sube/baja y se inclina sin cuello: solo el hueso head). */
  function headBob(r, dy, pitch) { r.head.position.y = r.D.NECK_Y + dy; r.head.rotation.x += pitch || 0; }

  /** Bucle sencillo de la maqueta: cada muñeco repite su pose con vida (respiración, rebote de la cabeza, estirón, aplastamiento). */
  function animate(r, t) {
    resetPose(r);
    var P = POSES[r.pose] || POSES.idle; P(r);
    var w;
    switch (r.pose) {
      case 'idle':   // respiración + rebote de la cabeza al compás + el balón sube y baja con la mano
        w = Math.sin(t * 2.2);
        r.chest.scale.set(1 + 0.012 * w, 1 + 0.02 * w, 1 + 0.012 * w);
        headBob(r, 0.008 * Math.sin(t * 2.2 + 0.6), 0.03 * Math.sin(t * 2.2 + 0.6));
        r.el[1].rotation.x += 0.06 * Math.sin(t * 2.2 - 0.4);
        break;
      case 'recv':   // balanceo lateral del peso y cabeza que sigue al balón
        w = Math.sin(t * 1.7);
        r.pelvis.position.x = 0.03 * w; r.pelvis.rotation.z = -0.05 * w; r.head.rotation.y = 0.12 * w;
        headBob(r, 0.004 * Math.sin(t * 3.4), 0);
        break;
      case 'spike': {   // ciclo de 1,9 s: carrera (abajo, aplastado) → impulso (estirado) → golpe (estirón del brazo) → aterrizaje (aplastado) → rebote
        var T = (t % 1.9) / 1.9, air = sstep(0.1, 0.22, T) * (1 - sstep(0.62, 0.74, T)), h = Math.sin(clamp((T - 0.14) / 0.56, 0, 1) * PI);
        r.body.position.y = 0.78 * h;
        var a = 0;
        if (T < 0.14) a = -0.12 * Math.sin(T / 0.14 * PI);                         // anticipación: aplastado antes de saltar
        else if (T < 0.3) a = 0.1 * Math.sin((T - 0.14) / 0.16 * PI);              // despegue: estirado
        else if (T > 0.68 && T < 0.86) a = -0.14 * Math.sin((T - 0.68) / 0.18 * PI); // aterrizaje: aplastado
        else if (T >= 0.86) a = 0.03 * Math.sin((T - 0.86) / 0.14 * PI);           // rebote
        squash(r, a);
        r.up[1].rotation.x = lerp(-1.6, -2.85, sstep(0.18, 0.4, T)) + 0.5 * sstep(0.44, 0.6, T);   // armado → golpe → acompañamiento
        r.hand[1].rotation.x = -0.55 + 0.9 * sstep(0.42, 0.52, T);
        // ESTIRÓN cartoon (reachTo): el balón está a la altura del alcance del atleta sobre el salto (fuera del brazo corto de reposo).
        // Anticipación: el brazo se ENCOGE un poco (w < 0) justo antes; estirón en pocos fotogramas hasta el golpe; vuelve al soltar.
        var hitT = 0.42, ws = T < 0.3 ? 0 : T < 0.37 ? -0.3 * Math.sin((T - 0.3) / 0.07 * PI) : T < hitT ? sstep(0.37, hitT, T) : T < 0.48 ? 1 : 1 - sstep(0.48, 0.6, T);
        var bl = sstep(0.3, hitT, T) * (1 - sstep(0.5, 0.62, T));
        TMP.set(-r.D.SH_X - 0.1, 0.78 + r.D.reach - 0.03, 0.22); r.root.localToWorld(TMP);   // objetivo: palma a reach m sobre los pies, en el vértice del salto
        if (bl > 0) reachTo(r, 1, TMP, ws, bl);
        if (r.ball) {   // el balón del remate: llega, se golpea en hitT y sale disparado
          r.ball.visible = T > 0.26 && T < 0.64;
          if (r.ball.visible) { r.root.worldToLocal(r.ball.position.copy(TMP)); if (T < hitT) r.ball.position.y += 0.9 * (hitT - T) / 0.16; else { r.ball.position.z += 7 * (T - hitT); r.ball.position.y -= 3.5 * (T - hitT); } }
        }
        // en el suelo: piernas de carrera/caída en vez de recogidas
        var gnd = 1 - air;
        if (gnd > 0) { for (var k = 0; k < 2; k++) { r.th[k].rotation.x *= air; r.kn[k].rotation.x = r.kn[k].rotation.x * air + 0.9 * gnd * (T < 0.14 || T > 0.68 ? 1 : 0); r.ft[k].rotation.x *= air; } r.pelvis.position.y = r.D.HIP_H - 0.18 * r.D.LEG * gnd * (T < 0.14 || T > 0.68 ? 1 : 0); }
        headBob(r, -0.01 * a * 4, -0.12 * Math.max(0, ws));
        r.body.scale.y *= 1;   // (ya en squash)
        break; }
      case 'cel': {   // saltitos de alegría: parábola, brazos que bombean, aplastamiento al caer y rebote de la cabeza
        var Tc = (t % 1.1) / 1.1, hc = Math.sin(clamp((Tc - 0.1) / 0.5, 0, 1) * PI);
        r.body.position.y = 0.32 * hc;
        var ac = 0;
        if (Tc < 0.1) ac = -0.1 * Math.sin(Tc / 0.1 * PI); else if (Tc < 0.22) ac = 0.07 * Math.sin((Tc - 0.1) / 0.12 * PI);
        else if (Tc > 0.6 && Tc < 0.78) ac = -0.13 * Math.sin((Tc - 0.6) / 0.18 * PI); else if (Tc >= 0.78) ac = 0.03 * Math.sin((Tc - 0.78) / 0.22 * PI);
        squash(r, ac);
        var pump = Math.sin(Tc * 2 * PI);
        r.up[0].rotation.z += 0.25 * pump; r.up[1].rotation.z -= 0.25 * pump; r.el[0].rotation.z = 0.45 + 0.3 * pump; r.el[1].rotation.z = -0.45 - 0.3 * pump;
        var kneeUp = sstep(0.1, 0.3, Tc) * (1 - sstep(0.55, 0.7, Tc));
        r.th[0].rotation.x = -1.2 * kneeUp; r.kn[0].rotation.x = 1.5 * kneeUp; r.ft[0].rotation.x = 0.3 * kneeUp;
        if (kneeUp < 1) { var kb = (1 - kneeUp) * (Tc < 0.12 || Tc > 0.6 ? 1 : 0); r.kn[0].rotation.x += 0.8 * kb; r.kn[1].rotation.x = 0.8 * kb; r.th[0].rotation.x -= 0.4 * kb; r.th[1].rotation.x = -0.4 * kb; }
        headBob(r, -0.02 * ac * 3 + 0.01 * pump, 0.06 * pump);
        break; }
      case 'block': {   // ciclo de 1,6 s: agachado → salto con los brazos que se estiran hacia la cinta → aterrizaje
        var Tb = (t % 1.6) / 1.6, hb = Math.sin(clamp((Tb - 0.12) / 0.56, 0, 1) * PI);
        r.body.position.y = 0.45 * hb;
        var ab = 0;
        if (Tb < 0.12) ab = -0.1 * Math.sin(Tb / 0.12 * PI); else if (Tb < 0.26) ab = 0.08 * Math.sin((Tb - 0.12) / 0.14 * PI);
        else if (Tb > 0.66 && Tb < 0.84) ab = -0.12 * Math.sin((Tb - 0.66) / 0.18 * PI);
        squash(r, ab);
        var wb = sstep(0.2, 0.34, Tb) * (1 - sstep(0.6, 0.72, Tb)), blb = sstep(0.12, 0.3, Tb) * (1 - sstep(0.62, 0.74, Tb));
        for (var kb2 = 0; kb2 < 2; kb2++) {
          TMP.set((kb2 ? -1 : 1) * 0.24, 0.45 + r.D.reach - 0.05, 0.28); r.root.localToWorld(TMP);   // manos a reach m sobre los pies del vértice, por encima de la cinta
          if (blb > 0) reachTo(r, kb2, TMP, wb, blb);
          else { rot(r.up[kb2], -0.6 - 0.4 * Math.sin(Tb * PI), 0, (kb2 ? -1 : 1) * 0.25); rot(r.el[kb2], -0.9, 0, 0); }
        }
        var gb = Tb < 0.12 || Tb > 0.66 ? 1 : 0;
        if (gb) { for (var kb3 = 0; kb3 < 2; kb3++) { r.th[kb3].rotation.x = -0.5; r.kn[kb3].rotation.x = 1.0; r.ft[kb3].rotation.x = -0.5; } r.pelvis.position.y = r.D.HIP_H - 0.2 * r.D.LEG; }
        headBob(r, -0.015 * ab * 3, 0);
        break; }
    }
    // el balón va en la mano derecha del que está en reposo (apoyado en la manopla); en el remate lo mueve el bucle de arriba
    if (r.ball && r.pose !== 'spike') { r.ball.visible = r.pose === 'idle'; if (r.ball.visible) { r.root.updateMatrixWorld(true); r.hand[1].getWorldPosition(TMP); r.root.worldToLocal(TMP); r.ball.position.set(TMP.x - 0.02, TMP.y - r.D.PALM + 0.03 + BR * 0.95, TMP.z + 0.03); r.ball.rotation.y = t * 0.3; } }
  }
  var TMP = null, BR = 0.21;

  // ---------- Balón sencillo (toon + tinta) para la maqueta ----------
  function makeBall() {
    var S = 256, cv = canvas(S, S), g = cv.getContext('2d'), cols = ['#1cc4b4', '#fffaf0', '#0b8a86'];
    for (var i = 0; i < 3; i++) { g.fillStyle = cols[i]; g.fillRect(i * S / 3, 0, S / 3 + 1, S); }
    g.fillStyle = 'rgba(29,21,48,0.8)'; g.fillRect(S / 3 - 3, 0, 6, S); g.fillRect(2 * S / 3 - 3, 0, 6, S); g.fillRect(0, 0, S, 5); g.fillRect(0, S - 5, S, 5);
    var t = texOf(cv), m = VB.TOON && VB.TOON.toonMat ? VB.TOON.toonMat({ map: t }) : new THREE.MeshToonMaterial({ map: t });
    var b = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), m); b.name = 'dollBall'; b.castShadow = true;
    if (VB.TOON && VB.TOON.outline) VB.TOON.outline(b, OUT_MIN, { max: OUT_MAX, k: VB.TOON.px ? OUT_PX / VB.TOON.px : 1 });
    return b;
  }

  // =====================================================================
  //  ESCENA DE DEPURACIÓN ?debug=doll
  // =====================================================================
  var rigs = [], group = null, on = false, view = 'fila', tAnim = 0, hidden = [], styleEl = null, camSet = null, lodNow = 2;
  // ?debug=doll&scrim=1: la maqueta con los petos del partidillo (equipaciones de VB.Players con st.scrim; &shirt=RRGGBB = color del
  // club, rojo si falta); &map=beach la viste de playa. DBG_TC / DBG_BEACH los lee buildRig cuando no le pasan opt.tc / opt.beach.
  var DBG_TC = null, DBG_BEACH = false;
  var VIEWS = {
    // posiciones en coords de la SIM (x largo, y ancho), yaw de la sim (0 = mira a +x, hacia la cámara), cámara en Three.
    // Las alturas (y de cam/at) están pensadas para v1 (cabeza a 1,65, 1,86 de pie): applyCamera las escala con el cuerpo activo
    // (cuerpo entero: × alto/1,86; `face`: desplazadas con el centro de la cabeza); `fixed` no se toca (comparación antes/después).
    fila: { pos: [[3, -1.65], [3, -0.55], [3, 0.55], [3, 1.65]], yaw: [0, 0, 0, 0], cam: [7.4, 1.5, 0], at: [3, 1.2, 0], fov: 40 },
    poses: { pos: [[3, -1.8], [3, -0.6], [3, 0.6], [3, 1.8]], yaw: [0.5, 0.5, 0.5, 0.5], cam: [6.9, 2.7, 3.1], at: [3, 1.45, 0.1], fov: 46 },
    cara: { pos: [[3, -0.62], [3, 0], [3, 0.62]], yaw: [0, 0, 0], cam: [5.3, 1.66, 0], at: [3, 1.63, 0], fov: 30, faces: ['neutra', 'alegria', 'esfuerzo'], poses: ['stand', 'stand', 'stand'], face: true },
    cuerpo: { pos: [[3, -1.25], [3, 0], [3, 1.25]], yaw: [0, 0.78, PI], cam: [7.4, 1.25, 0], at: [3, 0.95, 0], fov: 32, poses: ['stand', 'stand', 'stand'] },
    // los otros peinados (rehace los tres primeros muñecos sin complemento): flequillo, rapado, trenzas + moño
    peinados: { pos: [[3, -1.05], [3, -0.35], [3, 0.35], [3, 1.05]], yaw: [0.25, 0.25, 0.25, 0.25], cam: [6.1, 1.75, 0.5], at: [3, 1.45, 0], fov: 32, poses: ['stand', 'stand', 'stand', 'stand'], faces: ['neutra', 'sorpresa', 'pena', 'lengua'], restyle: [['flequillo', ''], ['rapado', ''], ['trenzas', ''], ['mono', '']], face: true },
    // un solo muñeco de pie con cámara FIJA (misma para v1 y chibi): hoja antes/después
    solo: { pos: [[3, 0]], yaw: [0.12], cam: [7.2, 1.15, 0], at: [3, 0.98, 0], fov: 30, poses: ['stand'], faces: ['neutra'], fixed: true },
    // estirón del remate (el rematador solo, 3/4, cámara fija: 4 fotogramas con freeze) y bloqueo (dos muñecos)
    estiron: { pos: [null, null, [3, 0]], yaw: [0, 0, 0.55], cam: [6.7, 2.0, 2.3], at: [3, 1.65, 0.1], fov: 48, fixed: true },
    bloqueo: { pos: [null, null, [3, -0.55], [3, 0.55]], yaw: [0, 0, 0.3, 0.3], cam: [6.9, 1.9, 1.6], at: [3, 1.75, 0], fov: 44, poses: [null, null, 'block', 'block'], faces: [null, null, 'concentrado', 'esfuerzo'], fixed: true }
  };
  function viewY(V, y) {
    if (V.fixed) return y;
    var top = SH_H + HEAD_C + HEAD_RY, hc = SH_H + HEAD_C;
    return V.face ? y + (hc - 1.65) : y * top / 1.86;
  }
  POSES.stand = function (r) {   // de pie, neutro (hoja de cuerpo)
    rot(r.up[0], -0.05, 0, 0.12); rot(r.up[1], -0.05, 0, -0.12); rot(r.el[0], -0.15, 0, 0); rot(r.el[1], -0.15, 0, 0);
    rot(r.th[0], 0, 0, 0.05); rot(r.th[1], 0, 0, -0.05); rot(r.ft[0], 0, 0, -0.05); rot(r.ft[1], 0, 0, 0.05);
  };
  function hideObj(o) { if (o && o.visible) { o.visible = false; hidden.push(o); } }
  function hideGame() {
    if (!ctx || !ctx.scene) return;
    hideObj(ctx.scene.getObjectByName('players'));
    hideObj(ctx.scene.getObjectByName('contactBlobs'));
    try { if (VB.FX && VB.FX.ballObject) hideObj(VB.FX.ballObject()); } catch (e) { }
  }
  function placeView(name) {
    var V = VIEWS[name] || VIEWS.fila; view = VIEWS[name] ? name : 'fila';
    if (V.restyle) for (var k = 0; k < V.restyle.length; k++) if (rigs[k] && (rigs[k].look.style !== V.restyle[k][0] || rigs[k].look.acc !== V.restyle[k][1])) VB.Doll.restyle(k, V.restyle[k][0], V.restyle[k][1]);
    for (var i = 0; i < rigs.length; i++) {
      var r = rigs[i], p = V.pos[i];
      r.root.visible = !!p;
      if (!p) continue;
      r.root.position.set(p[0], 0, -p[1]);
      var yaw = V.yaw[i] || 0; r.root.rotation.y = Math.atan2(Math.cos(yaw), -Math.sin(yaw));
      r.pose = V.poses && V.poses[i] ? V.poses[i] : r.look.pose;
      setFace(r, V.faces && V.faces[i] ? V.faces[i] : r.look.face);
    }
    camSet = V;
  }
  function applyCamera() {
    var cam = ctx && ctx.camera, V = camSet; if (!cam || !V) return;
    cam.position.set(V.cam[0], viewY(V, V.cam[1]), V.cam[2]); cam.up.set(0, 1, 0); cam.lookAt(V.at[0], viewY(V, V.at[1]), V.at[2]);
    if (cam.fov !== V.fov) { cam.fov = V.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
  }
  function reachInfo() {
    var d = null; try { d = VB.Players && VB.Players.dims ? VB.Players.dims() : null; } catch (e) { }
    // `athlete` = alcance ESTIRADO del rig del juego (VB.Players.dims().reachMax; `reach` es el de reposo desde la fase 2)
    return { body: BODY, doll: +REACH.toFixed(4), rest: +REACH_REST.toFixed(4), stretch: +STRETCH_MAX.toFixed(3), athlete: d ? +(d.reachMax != null ? d.reachMax : d.reach).toFixed(4) : null, shoulder: +SH_H.toFixed(3), upper: +UPPER.toFixed(4), fore: +FORE.toFixed(4), palm: PALM, hip: +HIP_H.toFixed(3), head: +(2 * HEAD_RY).toFixed(3), headW: +(2 * HEAD_RX).toFixed(3), headTop: +(SH_H + HEAD_C + HEAD_RY).toFixed(3), heads: +((SH_H + HEAD_C + HEAD_RY) / (2 * HEAD_RY)).toFixed(2), handLow: +(SH_H - UPPER - FORE - PALM - 0.06 * HAND_K).toFixed(3) };
  }

  /** Libera todo lo de GPU de un muñeco de doll.js (atlas, material, mallas de los LOD, textura de huesos y contorno) y lo saca de
   *  la escena. El material del contorno es compartido (VB.TOON, uno por color): no se libera. */
  function freeRig(r, keepMat) {
    if (!r) return;
    if (r.root && r.root.parent) r.root.parent.remove(r.root);
    if (r.ink) { if (VB.TOON && VB.TOON.drop) VB.TOON.drop(r.ink); else if (r.ink.parent) r.ink.parent.remove(r.ink); r.ink = null; }
    try { var m = r.skin && r.skin.material; if (m && m !== keepMat) { if (m.map) m.map.dispose(); m.dispose(); } } catch (e) { }
    try { for (var i = 0; i < r.geos.length; i++) if (r.geos[i]) { r.geos[i].dispose(); r.geos[i] = null; } } catch (e) { }
    try { if (r.skin && r.skin.skeleton) r.skin.skeleton.dispose(); } catch (e) { }
  }

  // =====================================================================
  //  VISTA PREVIA DEL VESTUARIO (VB.Doll.preview; spec «Vestuario» §4.5)
  // =====================================================================
  // Un muñeco de muestra en ctx.scene, en la sede actual (three (5, 0, 0), mirando a la cámara), con el mismo renderer, luces y
  // programas que el juego (cero programas nuevos: 'vbDollToon' y la tinta de VB.TOON). main.js lo enciende con
  // ctx.actions.showroom (los atletas los oculta Players.showroom) y llama a update() después de CameraRig.update: aquí se anima y
  // se coloca ctx.camera. Un solo LOD (el de la calidad activa); set() solo rehace la malla si cambia geoSig (o la sede, o el lienzo):
  // si solo cambia el atlas, repinta el mismo lienzo. Al rehacer libera lo viejo (freeRig).
  var PV = null, PV_POS = [5, 0, 0], PV_FOV = 46;
  // ENCUADRES (WP6 del plan del Vestuario): cada uno es una CAJA del muñeco, medida en sus huesos de pie (pvMeasure, en metros del
  // muñeco sin la escala de altura): lo (abajo), hi (arriba), lat (medio ancho), up (altura de la cámara sobre el centro, × distancia),
  // fill (parte del alto libre que ocupa: los de cerca, menos; y nunca más de PV_PPM píxeles CSS por metro: en PC no sale gigante),
  // yaw (giro con el que se enseña: 0 = de frente; −π/2 = su lado izquierdo a cámara) y, si va, peek (giro al que se asoma un momento y
  // vuelve: la coleta y el moño se ven de espaldas). La cámara se aleja hasta que la caja cabe en el hueco libre que da la UI (place:
  // centro y medio ancho a lo ancho, franjas tapadas arriba y abajo) y se desplaza de lado para centrarla en él. Así el mismo encuadre
  // vale en apaisado, en vertical y en PC. frame(nombre) va a uno con transición (≈300 ms) y frameSlot(ranura) elige el de esa ranura.
  var PV_PPM = 340, PV_MINPX = 230;   // (lo pequeño, como los pies, puede salir algo más de cerca: hasta 230 px de alto)
  var PV_FRAMES = {
    cuerpo: function (m) { return { lo: -0.04, hi: m.top + 0.14, lat: SH_X + 0.2, up: 0.1, yaw: 0 }; },
    cabeza: function (m) { return { lo: m.chin - 0.24, hi: m.top + 0.12, lat: HEAD_RX + 0.2, up: 0.03, yaw: 0.55, fill: 0.86 }; },
    nuca: function (m) { return { lo: m.chin - 0.24, hi: m.top + 0.12, lat: HEAD_RX + 0.2, up: 0.06, yaw: 0.55, peek: 2.75, fill: 0.86 }; },
    // (lo que se lleva DETRÁS —coleta, trenza, moño, el pelo largo, la pinza—: de 3/4 de espaldas y se QUEDA ahí, con la cabeza y lo que
    //  cuelga hasta los hombros. Antes se asomaba 1,2 s y volvía de frente: al elegir la coleta no se veía la cola)
    detras: function (m) { return { lo: m.chin - 0.42, hi: m.top + 0.12, lat: HEAD_RX + 0.24, up: 0.1, yaw: 2.6, fill: 0.86 }; },
    perfil: function (m) { return { lo: m.chin - 0.24, hi: m.top + 0.14, lat: HEAD_RX + 0.32, up: 0.03, yaw: 1.05, fill: 0.86 }; },
    cara: function (m) { return { lo: m.chin - 0.06, hi: m.head + HEAD_RY + 0.06, lat: HEAD_RX + 0.08, up: 0, yaw: 0.12, fill: 0.8 }; },
    torso: function (m) { return { lo: m.hip - 0.16, hi: m.top + 0.12, lat: SH_X + 0.2, up: 0.08, yaw: 0.3 }; },
    brazos: function (m) { return { lo: m.hand - 0.14, hi: m.top + 0.1, lat: SH_X + 0.22, up: 0.06, yaw: 0 }; },
    brazoL: function (m) { return { lo: m.hand - 0.14, hi: m.top + 0.1, lat: 0.36, up: 0.06, yaw: -1.05 }; },
    brazoR: function (m) { return { lo: m.hand - 0.14, hi: m.top + 0.1, lat: 0.36, up: 0.06, yaw: 1.05 }; },
    manos: function (m) { return { lo: m.hand - 0.14, hi: m.el + 0.1, lat: SH_X + 0.22, up: 0.1, yaw: 0.35, fill: 0.86 }; },
    piernas: function (m) { return { lo: -0.05, hi: m.hip + 0.16, lat: HIP_W + 0.26, up: 0.12, yaw: 0.3 }; },
    rodillas: function (m) { return { lo: m.knee - 0.24, hi: m.knee + 0.24, lat: HIP_W + 0.22, up: 0.1, yaw: 0.4, fill: 0.86 }; },
    pies: function (m) { return { lo: -0.05, hi: m.ankle + 0.18, lat: HIP_W + 0.13, up: 0.3, yaw: 0.6, fill: 0.86 }; },
    // solo para las miniaturas de la rejilla (WP6, ronda 1): la cabeza con el pelo que cae (los peinados se distinguen a 72-96 px) y
    // el tobillo de cerca (la tobillera es una franja fina: con los dos pies enteros no se veía)
    peinado: function (m) { return { lo: m.chin - 0.16, hi: m.top + 0.08, lat: HEAD_RX + 0.1, up: 0.04, yaw: 1.0, fill: 0.9 }; },
    tobillo: function (m) { return { lo: m.ankle - 0.1, hi: m.ankle + 0.16, lat: HIP_W + 0.04, up: 0.2, yaw: 0.5, fill: 0.9 }; }
  };
  // ranura (o fila de la UI) → encuadre. Lo que no está aquí, 'cuerpo'. Los colores van a lo que pintan (WP1: VB.Look.uses)
  var PV_SLOT = {
    style: 'cabeza', hair: 'nuca', hair2: 'nuca', hairFx: 'cabeza', head: 'perfil', ears: 'perfil', eyes: 'cara', paint: 'cara', marks: 'cara', beard: 'cara',
    neck: 'torso', under: 'torso', band: 'brazoL', armL: 'brazoL', armR: 'brazoR', elbows: 'brazos', wristL: 'brazoL', wristR: 'brazoR',
    hands: 'manos', legs: 'piernas', knees: 'rodillas', socks: 'piernas', ankle: 'pies', shoes: 'pies',
    'c:sock': 'piernas', 'c:shoe': 'pies', 'c:glass': 'cara', 'c:pad': 'rodillas'
  };
  // Recorte del muñeco en vertical (place(..., clip)): capa 3 para el segundo pase (el muñeco, su tinta y las luces de la escena)
  var PV_CLIPL = 3, PV_HEADF = { cabeza: 1, nuca: 1, perfil: 1 };
  function pvClipOn() {
    return !!(PV && PV.clipB && PV.r && PV.r.skin);
  }
  function pvClipArm() {
    var r = PV.r, m = r && r.skin && r.skin.material; if (!m) return;
    var on = pvClipOn();
    PV.clipArmed = on;
    m.colorWrite = !on; m.depthWrite = !on;
    if (r.ink) { if (on) { if (PV.inkVis == null) PV.inkVis = r.ink.visible; r.ink.visible = false; } else if (PV.inkVis != null) { r.ink.visible = PV.inkVis; PV.inkVis = null; } }
  }
  function pvClipPass(c) {
    if (!PV || !PV.clipArmed) return;
    var r = PV.r, R = c && c.renderer, cam = c && c.camera, sc = c && c.scene, m = r && r.skin && r.skin.material;
    PV.clipArmed = false;
    if (m) { m.colorWrite = true; m.depthWrite = true; }
    if (r.ink && PV.inkVis != null) { r.ink.visible = PV.inkVis; PV.inkVis = null; }
    if (!R || !cam || !sc || !m) return;
    r.skin.layers.enable(PV_CLIPL); if (r.ink) r.ink.layers.enable(PV_CLIPL);
    if (!PV.lt || PV.ltS !== sc || (PV.ltF = (PV.ltF | 0) + 1) % 60 === 0) {   // (las luces de la sede: cada 60 frames o al cambiar de escena)
      PV.lt = true; PV.ltS = sc; sc.traverse(function (o) { if (o.isLight) o.layers.enable(PV_CLIPL); });
    }
    var W = (R.domElement && R.domElement.clientWidth) || c.width || 1, H = (R.domElement && R.domElement.clientHeight) || c.height || 1;
    var ac = R.autoClear, su = R.shadowMap.autoUpdate, bg = sc.background, mask = cam.layers.mask, sct = R.getScissorTest();
    try {
      R.setRenderTarget(null);
      R.autoClear = false; R.shadowMap.autoUpdate = false; sc.background = null; cam.layers.set(PV_CLIPL);
      R.setScissorTest(true); R.setScissor(0, PV.clipB * H, W, (1 - PV.clipB - (PV.clipT || 0)) * H);
      // con post-proceso (PC de calidad alta) la escena se pintó en otro destino: aquí no queda su profundidad (el muñeco va encima,
      // delante no hay nada) y se limpia la de la franja
      if (VB.Arena && VB.Arena.postActive && VB.Arena.postActive()) R.clearDepth();
      R.render(sc, cam);
    } finally {
      R.autoClear = ac; R.shadowMap.autoUpdate = su; sc.background = bg; cam.layers.mask = mask;
      R.setScissorTest(sct); R.setScissor(0, 0, W, H);
    }
  }
  /** Alturas del muñeco de pie (pelvis, hombro, codo, mano, rodilla, tobillo, centro de la cabeza, barbilla y lo más alto con pelo o
   *  gorro), en metros del muñeco. Una vez por malla (r._pvM), con la pose 'stand' del momento y la de antes devuelta. */
  function pvMeasure(r) {
    if (r._pvM) return r._pvM;
    if (!TMP) TMP = new THREE.Vector3();
    var v = TMP, p0 = r.pose, m = {};
    function y(b, dy) { v.set(0, dy || 0, 0); b.localToWorld(v); r.root.worldToLocal(v); return v.y; }
    r.pose = 'stand'; animate(r, 0); r.root.updateMatrixWorld(true);
    m.hip = y(r.pelvis); m.sh = (y(r.sh[0]) + y(r.sh[1])) / 2; m.el = (y(r.el[0]) + y(r.el[1])) / 2;
    m.hand = Math.min(y(r.hand[0], -PALM), y(r.hand[1], -PALM)); m.knee = (y(r.kn[0]) + y(r.kn[1])) / 2; m.ankle = (y(r.ft[0]) + y(r.ft[1])) / 2;
    m.head = y(r.head, HEAD_C); m.chin = m.head - HEAD_RY; m.top = y(r.head, HEAD_C + HEAD_RY + 0.1);
    r.pose = p0; animate(r, r.tFix >= 0 ? r.tFix : PV ? PV.t : 0); r.root.updateMatrixWorld(true);
    r._pvM = m;
    return m;
  }
  /** Ángulo a de vuelta al tramo (b − π, b + π]: para girar siempre por el camino corto. */
  function pvNear(a, b) { var T = PI * 2; return a - T * Math.round((a - b) / T); }
  function pvKit(o, prev) {
    if (o && o.tc) return o.tc;
    if (prev && prev.tc) return prev.tc;
    try { if (VB.Players && VB.Players.kit) { var k = VB.Players.kit(0); if (k && k.base != null) return k; } } catch (e) { }
    return TEAMS[0];
  }
  function pvBeach(o, prev) {
    if (o && o.beach != null) return !!o.beach;
    if (prev) return prev.beach;
    try { if (VB.Arena && VB.Arena.venue) return VB.Arena.venue() === 'beach'; } catch (e) { }
    return false;
  }
  /** Opciones completas de la vista previa: lo que no llega se queda como estaba (o el kit de tu equipo, la sede actual, dorsal 1). */
  function pvOpts(o, prev) {
    o = o || {};
    return { tc: pvKit(o, prev), num: o.num != null ? o.num : prev ? prev.num : 1, beach: pvBeach(o, prev), px: o.px != null ? (o.px === 1 ? 1 : 2) : prev ? prev.px : 2 };
  }
  // la vista previa del Vestuario va SIEMPRE en la malla alta (WP1 del plan del Vestuario): es un solo muñeco y es justo donde se mira
  // el detalle; con la calidad activa, el móvil (calidad media) veía la malla media facetada (casquetes del pelo, zapatillas)
  // PV_LOD: nivel forzado SOLO para herramientas (tools/lookvis.js mide el partido en LOD1 y LOD0 con la vista previa); el juego
  // nunca lo toca. null = LOD2
  var PV_LOD = null;
  function pvLod() { return PV_LOD != null ? PV_LOD : 2; }
  function pvHide() {
    if (!ctx || !ctx.scene) return;
    var list = [ctx.scene.getObjectByName('contactBlobs')];
    try { if (VB.FX && VB.FX.ballObject) list.push(VB.FX.ballObject()); } catch (e) { }
    if (!(VB.Players && VB.Players.showroom)) list.push(ctx.scene.getObjectByName('players'));   // sin showroom de players, se ocultan aquí
    for (var i = 0; i < list.length; i++) { var o = list[i]; if (o && o.visible) { o.visible = false; if (PV.hidden.indexOf(o) < 0) PV.hidden.push(o); } }
  }
  function pvBuild(L, op, rig, mat) {
    var r = buildRig(L, 90, { tc: op.tc, num: op.num, beach: op.beach, px: op.px, lod: PV.lod, rig: rig, mat: mat });
    r.root.name = 'dollPreview'; r.root.position.set(PV_POS[0], PV_POS[1], PV_POS[2]);
    // sin recibir sombras: el mapa de sombras de la pista está pensado para la cámara de partido y, a 1,85 m (y peor en calidad
    // media, la del móvil), salía a escalones sobre la cara y la camiseta. Es un uniform: no cambia de programa. Sigue dando sombra
    r.skin.receiveShadow = false;
    var h = typeof L.h === 'number' && L.h > 0.5 && L.h < 1.5 ? L.h : 1; r.root.scale.setScalar(h);
    r.pose = PV.pose; setFace(r, PV.face); r.blinkT = 2;
    ctx.scene.add(r.root);
    return r;
  }
  /** Malla nueva de la vista previa POR PASOS (pulido; preview.set con o.soon, lo pide el Vestuario): cada cambio de peinado o de
   *  pieza costaba 45-60 ms de golpe en un móvil lento (~3 veces 1.17.1; tirones de más de 100 ms). Ahora la geometría se monta en
   *  trozos de pocos ms por frame (rigGeoBegin/rigGeoRun, como las miniaturas), el material se reutiliza si el atlas no cambia (o se
   *  pinta en su propio frame) y el muñeco nuevo entra cuando está listo; mientras, se ve el de antes. */
  function pvJobStart(L, op) {
    var j = PV.job;
    if (j && j.gs === PV.gs && j.lod === PV.lod && j.beach === op.beach && j.px === op.px) { j.L = L; j.op = op; j.as = PV.as; return; }   // mismo peinado: el color, al final
    if (j && j.mat) { try { if (j.mat.map) j.mat.map.dispose(); j.mat.dispose(); } catch (e) { } }
    var r = rigBones(L, 90, { tc: op.tc, num: op.num, beach: op.beach, px: op.px, lod: PV.lod });
    PV.job = { gs: PV.gs, as: PV.as, lod: PV.lod, beach: op.beach, px: op.px, L: L, op: op, r: r, st: rigGeoBegin(r, PV.lod), mat: null };
  }
  function pvJobRun() {
    var j = PV.job; if (!j) return;
    var old = PV.r, t0 = performance.now();
    if (!j.st.geo) {
      var keepK = LODK, keepR = LODR;
      try { rigGeoRun(j.st, t0 + 4); } finally { LODK = keepK; LODR = keepR; }
      if (!j.st.geo) return;
      if (performance.now() - t0 > 4) return;   // (el material y el cambio, en el frame siguiente)
    }
    var om = old && old.skin && old.skin.material, reuse = om && om.map && PV.ras === j.as && PV.rpx === j.px && PV.rbeach === j.beach;
    if (!reuse && !j.mat) { j.r.look = j.L; j.mat = dollMaterial(j.op.tc, j.L, j.op.num, j.beach, j.px || 2); return; }
    if (j.mat && j.mat.userData && j.mat.userData.paint && j.mat.userData.paint.L !== j.L) {   // el color cambió mientras tanto
      j.mat.userData.paint = { tc: j.op.tc, L: j.L, num: j.op.num, beach: j.beach };
      paintAtlas(j.mat.map.image, j.op.tc, j.L, j.op.num, j.beach); j.mat.map.needsUpdate = true;
    }
    PV.job = null;
    j.r.look = j.L;
    var n = pvBuild(j.L, j.op, j.r, reuse ? om : j.mat);
    n.tFix = old ? old.tFix : -1; PV.r = n; PV.env = null; PV.ras = j.as; PV.rpx = j.px; PV.rbeach = j.beach;
    freeRig(old, reuse ? om : null);
  }
  function pvJobDrop() {
    var j = PV && PV.job; if (!j) return;
    PV.job = null;
    if (j.mat) { try { if (j.mat.map) j.mat.map.dispose(); j.mat.dispose(); } catch (e) { } }
  }
  // periodo (s) de la animación de cada pose de «Probar» (animate): pvEnv la recorre entera para medir hasta dónde llega
  var PV_CYCLE = { spike: 1.9, cel: 1.1, recv: 3.7, idle: 2.86, block: 1 };
  /** Caja de la pose animada en curso, en metros del muñeco (sin la escala de altura): {lo, hi, lat} = pies, lo más alto (manos,
   *  cabeza con gorro o peinado) y lo más lejos del eje vertical (brazos abiertos). Recorre un ciclo entero de animate (el remate
   *  salta 0,78 m y estira el brazo: con el encuadre 'cuerpo' fijo, la cabeza y la mano se salían por arriba y por la derecha). */
  function pvEnv(r) {
    // rlo / rhi: lo mismo respecto a la pelvis de ese momento (WP6: «Probar» encuadra el cuerpo a su tamaño y la cámara sigue el salto)
    var T = PV_CYCLE[r.pose] || 2, N = 32, v = TMP, e = { lo: 1e9, hi: -1e9, lat: 0, rlo: 1e9, rhi: -1e9 }, i, k, py = 0;
    function pt(b, y, rad) {
      v.set(0, y, 0); b.localToWorld(v); r.root.worldToLocal(v);
      e.lo = Math.min(e.lo, v.y - rad); e.hi = Math.max(e.hi, v.y + rad); e.lat = Math.max(e.lat, Math.sqrt(v.x * v.x + v.z * v.z) + rad);
      e.rlo = Math.min(e.rlo, v.y - rad - py); e.rhi = Math.max(e.rhi, v.y + rad - py);
    }
    for (i = 0; i < N; i++) {
      animate(r, T * i / N); r.root.updateMatrixWorld(true);
      v.set(0, 0, 0); r.pelvis.localToWorld(v); r.root.worldToLocal(v); py = v.y;
      pt(r.head, HEAD_C, HEAD_RX + 0.06); pt(r.head, HEAD_C + HEAD_RY + 0.08, 0.02);   // la cabeza y lo que lleve encima
      for (k = 0; k < 2; k++) { pt(r.el[k], 0, 0.08); pt(r.hand[k], -PALM, 0.09); pt(r.ft[k], 0, 0.06); pt(r.ft[k], -ANKLE, 0.03); }
    }
    e.lo = Math.min(e.lo, 0);   // los pies siempre en el suelo (o por encima)
    return e;
  }
  var preview = {
    /** Enciende la vista previa con el aspecto L (VB.Look.resolve, o una L vieja) y o = {tc, num, beach, px}. */
    start: function (c, L, o) {
      if (PV) this.stop();
      ctx = c; THREE = (c && c.THREE) || window.THREE; if (!TMP) TMP = new THREE.Vector3(); if (VB.C && VB.C.BR) BR = VB.C.BR;
      if (!ctx || !ctx.scene) return false;
      L = Object.freeze(Object.assign({}, L || {}));
      var op = pvOpts(o, null);
      // yaw = giro del dedo (arrastre, ⟲ ⟳, stick, giro solo); yawB = giro del encuadre, que va con suavidad a yawT (frameSlot, turn);
      // peekT = segundos que quedan asomado a la espalda (peek) antes de volver; sx/sy = desplazamiento suave de la cámara
      PV = { r: null, L: L, o: op, gs: geoSig(L, op.tc, op.beach), as: atlasSig(L, op.tc, op.num, op.beach), lod: pvLod(), hidden: [], yaw: 0, t: 0,
        yawB: 0, yawT: 0, peek: 0, peekT: 0, slot: '', fl: 0, flL: null,
        pose: 'stand', face: 'neutra', frame: 'cuerpo', cx: 0.68, half: 0, top: 0, bot: 0, cy: 0, cd: 0, sx: 0, sy: 0, snap: true,
        fov0: ctx.camera ? ctx.camera.fov : 0, film0: ctx.camera ? ctx.camera.filmOffset || 0 : 0 };
      PV.r = pvBuild(L, op); PV.ras = PV.as; PV.rpx = op.px; PV.rbeach = op.beach; PV.job = null;
      pvHide();
      return true;
    },
    /** Cambia el aspecto (y, si llegan, las opciones). Devuelve 'geo' si rehízo la malla (main avisa a la calidad adaptativa),
     *  'atlas' si solo repintó el lienzo y '' si no había nada que cambiar. */
    set: function (L, o) {
      if (!PV) return '';
      L = Object.freeze(Object.assign({}, L || {}));
      var op = pvOpts(o, PV.o), gs = geoSig(L, op.tc, op.beach), as = atlasSig(L, op.tc, op.num, op.beach), old = PV.r;
      if (gs !== PV.gs || op.beach !== PV.o.beach || op.px !== PV.o.px || pvLod() !== PV.lod) {
        PV.lod = pvLod(); PV.L = L; PV.o = op; PV.gs = gs; PV.as = as;
        if (o && o.soon) { pvJobStart(L, op); return 'geo'; }   // (por pasos: pvJobRun en update)
        pvJobDrop();
        var n = pvBuild(L, op);
        n.tFix = old.tFix; PV.r = n; PV.env = null; freeRig(old); PV.ras = as; PV.rpx = op.px; PV.rbeach = op.beach;
        return 'geo';
      }
      PV.L = L; PV.o = op;
      if (PV.job) { if (as !== PV.as) { PV.as = as; PV.job.L = L; PV.job.op = op; PV.job.as = as; } return as === PV.ras ? '' : 'atlas'; }   // (lo recoge la malla que se está montando)
      if (as === PV.as) return '';
      PV.as = as; PV.ras = as;
      var m = old.skin.material, cv = m.map && m.map.image;
      old.look = L; old.tc = op.tc; old.num = op.num;
      m.userData.paint = { tc: op.tc, L: L, num: op.num, beach: op.beach };
      paintAtlas(cv, op.tc, L, op.num, op.beach); m.map.needsUpdate = true;
      return 'atlas';
    },
    /** SOLO herramientas: fuerza el nivel de detalle de la vista previa (0, 1 o 2; otra cosa lo quita y vuelve a LOD2). Se aplica
     *  en el próximo start/set (rehace la malla). Devuelve el nivel que queda. */
    lod: function (n) { PV_LOD = n === 0 || n === 1 || n === 2 ? n : null; return pvLod(); },
    /** Pose del muñeco: 'idle' | 'spike' | 'cel' | 'recv' (y 'block', 'stand'). */
    pose: function (name) { if (!PV || !POSES[name]) return false; PV.pose = PV.r.pose = name; PV.env = null; return name; },
    /** Expresión: neutra | concentrado | esfuerzo | grito | alegria | pena | sorpresa | lengua. */
    face: function (expr) { if (!PV) return false; PV.face = EXPR[expr] ? expr : 'neutra'; setFace(PV.r, PV.face); return PV.face; },
    /** Gira el muñeco dRad (arrastre, botones ⟲ ⟳, stick derecho). Corta el asomo a la espalda (peek) si lo había. */
    spin: function (d) { if (!PV) return 0; PV.peekT = 0; PV.yaw = (PV.yaw + (+d || 0)) % (PI * 2); return PV.yaw + PV.yawB; },
    /** Fija el giro del muñeco (0 = de frente), al momento y sin el giro del encuadre (herramientas: yaw(π) = de espaldas). */
    yaw: function (rad) { if (!PV) return 0; PV.yaw = (+rad || 0) % (PI * 2); PV.yawB = PV.yawT = 0; PV.peekT = 0; return PV.yaw; },
    /** Da la vuelta (180°) con giro animado (botón «Dar la vuelta» del Vestuario). Devuelve el giro al que va. */
    turn: function () {
      if (!PV) return 0;
      PV.peekT = 0; PV.yawB += PV.yaw; PV.yaw = 0; PV.yawT = pvNear(PV.yawT, PV.yawB) + PI;
      return PV.yawT;
    },
    /** Hueco libre donde va el muñeco (fracciones de la ventana): cx = centro a lo ancho, half = medio ancho del hueco (0 = hasta el
     *  borde más cercano), top / bot = franjas tapadas por la UI arriba y abajo. Vale en apaisado y en vertical: la cámara se aleja
     *  hasta que la caja del encuadre cabe en ese hueco y se desplaza de lado (no gira) para centrarla en él. clip (vertical, WP6 ronda
     *  1): franja de abajo donde el muñeco NO se pinta (la de la lista): de cerca, el cuerpo ya no corre por detrás de las pestañas y las
     *  filas; queda un busto en la mitad de arriba (ver pass). clipT: lo mismo arriba (la cabecera: con las piernas o los pies
     *  encuadrados, el tronco no sube por detrás del título). */
    place: function (cx, half, top, bot, clip, clipT) {
      if (!PV) return 0; cx = +cx; PV.cx = cx > 0.2 && cx < 0.95 ? cx : 0.68;
      clip = +clip; PV.clipB = clip > 0.05 && clip < 0.9 ? clip : 0;
      clipT = +clipT; PV.clipT = PV.clipB && clipT > 0 && clipT < 0.5 ? clipT : 0;
      half = +half; PV.half = half > 0.02 && half <= 0.5 ? half : 0;
      top = +top; PV.top = top > 0 && top < 0.8 ? top : 0;
      bot = +bot; PV.bot = bot > 0 && bot < 0.8 ? bot : 0;
      if (PV.top + PV.bot > 0.85) { var k = 0.85 / (PV.top + PV.bot); PV.top *= k; PV.bot *= k; }
      PV.placed = true;
      return PV.cx;
    },
    /** Encuadre por nombre (PV_FRAMES: cuerpo, cabeza, nuca, perfil, cara, torso, brazos, brazoL, brazoR, manos, piernas, rodillas,
     *  pies). La cámara va hasta él con suavidad; el giro NO cambia (eso es frameSlot). */
    frame: function (name) { if (!PV || !PV_FRAMES[name]) return false; PV.frame = name; return name; },
    /** Encuadre y giro de una ranura del Vestuario (PV_SLOT; los colores con 'c:clave'). o = {back: el peinado lleva volumen detrás
     *  (se asoma a la espalda ~1 s y vuelve), keep: no tocar el giro, frame: forzar un encuadre, yaw: forzar el giro}. Pone el giro del encuadre (el del
     *  dedo vuelve a 0) y va hasta él por el camino corto en ≈300 ms. Devuelve el encuadre. */
    frameSlot: function (slot, o) {
      if (!PV) return false;
      o = o || {};
      var name = o.frame && PV_FRAMES[o.frame] ? o.frame : this.frameOf(slot, o);
      PV.frame = name; PV.slot = String(slot || '');
      if (!o.keep) {
        var b = PV_FRAMES[name](pvMeasure(PV.r));
        var by = typeof o.yaw === 'number' ? o.yaw : b.yaw;   // (o.yaw: giro propio, p. ej. «Probar» de 3/4)
        PV.yawB = pvNear(PV.yawB + PV.yaw, by); PV.yaw = 0; PV.yawT = by;
        PV.peek = b.peek || 0; PV.peekT = b.peek && !o.still ? 1.25 : 0;
      }
      return name;
    },
    /** Nombre del encuadre de una ranura (sin aplicarlo): lo usan las miniaturas de la rejilla del Vestuario. */
    frameOf: function (slot, o) { return (slot === 'style' || slot === 'head') && o && o.back ? 'detras' : PV_SLOT[slot] || 'cuerpo'; },
    /** Parpadeo de lo que pinta un color (el Vestuario, al cambiarlo): pinta el atlas con L2 durante s segundos (0,4 por defecto) y
     *  vuelve al aspecto de verdad. Solo si L2 cambia el atlas y no la malla (si no, nada). */
    flash: function (L2, s) {
      if (!PV || !L2 || PV.job) return false;
      var op = PV.o, r = PV.r; if (geoSig(L2, op.tc, op.beach) !== PV.gs || atlasSig(L2, op.tc, op.num, op.beach) === PV.as) return false;
      var m = r.skin.material, cv = m.map && m.map.image; if (!cv) return false;
      paintAtlas(cv, op.tc, L2, op.num, op.beach); m.map.needsUpdate = true;
      PV.fl = s > 0 ? s : 0.4; PV.flL = PV.as;
      return true;
    },
    /** Cada frame, después de CameraRig.update: anima, vuelve a ocultar balón y manchas y coloca ctx.camera. */
    update: function (dt) {
      if (!PV) return;
      if (PV.job) pvJobRun();
      dt = Math.min(0.05, Math.max(0, dt || 0)); PV.t += dt;
      var r = PV.r;
      animate(r, r.tFix >= 0 ? r.tFix : PV.t); blink(r, dt);
      if (r.pose === 'stand') {   // de pie con respiración (la pose 'stand' de las hojas de ?debug=doll va quieta)
        var w = Math.sin(PV.t * 2.2);
        r.chest.scale.set(1 + 0.012 * w, 1 + 0.02 * w, 1 + 0.012 * w);
        headBob(r, 0.008 * Math.sin(PV.t * 2.2 + 0.6), 0.03 * Math.sin(PV.t * 2.2 + 0.6));
      }
      // fin del parpadeo de un color: el atlas de verdad (si entretanto no se repintó por otro cambio)
      if (PV.fl > 0) {
        PV.fl -= dt;
        if (PV.fl <= 0 && PV.flL === PV.as) { var mf = r.skin.material, cvf = mf.map && mf.map.image; if (cvf) { paintAtlas(cvf, PV.o.tc, PV.L, PV.o.num, PV.o.beach); mf.map.needsUpdate = true; } }
      }
      // giro del encuadre: asomarse a la espalda un momento (peek) y volver; luego, con suavidad (≈300 ms), al giro que toca
      var yT = PV.yawT;
      if (PV.peekT > 0) { PV.peekT -= dt; yT = PV.peek; }
      PV.yawB += (pvNear(yT, PV.yawB) - PV.yawB) * (PV.snap ? 1 : 1 - Math.exp(-dt * (PV.peekT > 0 ? 6 : 9)));
      pvHide();
      var cam = ctx && ctx.camera; if (!cam) return;
      var asp = cam.aspect || 1, sc = r.root.scale.y, tq = Math.tan(PV_FOV * PI / 360), M = pvMeasure(r);
      var fn = PV.frame;
      if (PV.fbN !== fn || PV.fbR !== r) { PV.fb = (PV_FRAMES[fn] || PV_FRAMES.cuerpo)(M); PV.fbN = fn; PV.fbR = r; }   // (sin objetos nuevos por frame)
      var f = PV.fb, lo = f.lo, hi = f.hi, lat = f.lat;
      var follow = false;
      if (fn === 'cuerpo' && r.pose !== 'stand' && PV_CYCLE[r.pose]) {
        // «Probar» (U11): la caja es la del cuerpo en la pose (brazos arriba, piernas recogidas) respecto a la pelvis, y la cámara sigue
        // a la pelvis con retraso: el muñeco sale grande y el salto se nota (antes se encuadraba el ciclo entero y salía pequeño)
        if (!PV.env) { PV.env = pvEnv(r); animate(r, r.tFix >= 0 ? r.tFix : PV.t); r.root.updateMatrixWorld(true); }
        TMP.set(0, 0, 0); r.pelvis.localToWorld(TMP); r.root.worldToLocal(TMP);
        var E = PV.env, pyN = TMP.y;
        lo = pyN + E.rlo - 0.05; hi = pyN + E.rhi + 0.06; lat = Math.max(SH_X + 0.2, E.lat * 0.66); follow = true;
      }
      // hueco libre (place): a lo ancho [cx − half, cx + half] y a lo alto [top, 1 − bot]. Sin place: en apaisado a la derecha
      // (cx 0,68, hasta el borde); en vertical, la mitad de arriba
      var cx = PV.placed || asp >= 1 ? PV.cx : 0.5, half = PV.half || Math.min(cx, 1 - cx);
      var top = PV.top || 0, bot = PV.placed || asp >= 1 ? PV.bot || 0 : 0.5, fh = Math.max(0.15, 1 - top - bot);
      var ty = (lo + hi) * 0.5 * sc, hv = (hi - lo) * 0.5 * sc, hl = lat * sc;
      // distancia: que la caja quepa a lo alto y a lo ancho (con un 6 % de aire; los de cerca, f.fill del alto); nunca más cerca de
      // 0,55 m. Nunca más de PV_PPM píxeles CSS por metro del muñeco: en PC la cabeza salía de 600 px y los pies de 900
      // en vertical el hueco es bajo (≈ 180-200 px a 360×640): de cuerpo entero, menos aire arriba (la caja guarda 0,24 m sobre la
      // cabeza para el pelo alto) y casi todo el alto; así el muñeco sale ~20 % más grande sin cortarse
      if (asp < 1 && !f.fill && !follow) { hi -= 0.08; ty = (lo + hi) * 0.5 * sc; hv = (hi - lo) * 0.5 * sc; }
      // de cerca en vertical con recorte: la cabeza llena el hueco (menos cuello y hombros en la caja: el busto se corta por abajo)
      else if (asp < 1 && PV.clipB && PV_HEADF[fn]) { lo += 0.1; ty = (lo + hi) * 0.5 * sc; hv = (hi - lo) * 0.5 * sc; }
      var fill = f.fill || (asp < 1 ? 0.985 : 0.94), Hc = (ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.clientHeight) || ctx.height || 720;
      // (en vertical con recorte el tope se suelta: el hueco es bajo y lo de cerca tiene que llenarlo; lo que sobra no se pinta)
      fill = Math.min(fill, Math.max((asp < 1 && PV.clipB ? 1.6 : 1) * PV_PPM * (hi - lo), PV_MINPX) / (fh * Hc));
      var d = Math.max(0.55, hv / (tq * fh * fill), hl / (tq * asp * 2 * half * 0.94));
      var k = PV.snap ? 1 : 1 - Math.exp(-dt * 10), kf = follow && !PV.snap ? 1 - Math.exp(-dt * 4) : k; PV.snap = false;
      PV.cy += (ty - PV.cy) * kf; PV.cd += (d - PV.cd) * k;
      // desplazamiento de la cámara en fracciones del cuadro (se suaviza igual: al cambiar de hueco no salta)
      PV.sx += ((cx - 0.5) - PV.sx) * k; PV.sy += ((top + fh * 0.5 - 0.5) - PV.sy) * k;
      if (cam.fov !== PV_FOV || cam.filmOffset || cam.zoom !== 1 || cam.view) {   // sin el desplazamiento de lente ni el zoom de la cámara del menú
        cam.fov = PV_FOV; cam.filmOffset = 0; cam.zoom = 1; if (cam.view && cam.clearViewOffset) cam.clearViewOffset(); cam.updateProjectionMatrix();
      }
      var px = PV_POS[0], pz = PV_POS[2], cd = PV.cd, cy = PV.cy, upk = f.up != null ? f.up : 0.1;
      cam.up.set(0, 1, 0); cam.position.set(px + cd, cy + cd * upk, pz); cam.lookAt(px, cy, pz); cam.updateMatrixWorld(true);
      var e = cam.matrixWorld.elements;
      // la cámara se DESPLAZA de lado (no gira): girada, el muñeco quedaba en el borde del cono y más cerca en profundidad, y salía
      // un 15-20 % más grande y estirado que en el centro (a 844×390 se cortaba)
      var sh = cd * tq * asp * 2 * PV.sx, su = cd * tq * 2 * PV.sy;
      var ox = -e[0] * sh + e[4] * su, oy = -e[1] * sh + e[5] * su, oz = -e[2] * sh + e[6] * su;
      cam.position.set(px + cd + ox, cy + cd * upk + oy, pz + oz); cam.lookAt(px + ox, cy + oy, pz + oz);
      r.root.rotation.y = Math.atan2(cd, oz) + PV.yaw + PV.yawB;   // de frente a la cámara desplazada (0 de giro = mirando a cámara)
      cam.updateMatrixWorld(true);
      pvClipArm();
    },
    /** Después del render del frame (main.js): con clip (vertical), el muñeco se pinta aquí, solo en la parte de arriba (tijera). En el
     *  render normal va sin color ni profundidad (sí proyecta su sombra) y su tinta, oculta. Mismos programas: solo estado y capas. */
    pass: function (c) { pvClipPass(c || ctx); },
    /** Apaga la vista previa: libera el muñeco, vuelve a enseñar lo que ocultó y devuelve el fov y la lente de la cámara. */
    stop: function () {
      if (!PV) return false;
      pvJobDrop();
      freeRig(PV.r);
      for (var i = 0; i < PV.hidden.length; i++) PV.hidden[i].visible = true;
      var cam = ctx && ctx.camera; if (cam && PV.fov0) { cam.fov = PV.fov0; cam.filmOffset = PV.film0; cam.updateProjectionMatrix(); }
      PV = null;
      return true;
    },
    active: function () { return !!PV; },
    /** Estado para pruebas: LOD, triángulos, firmas y el rig. */
    info: function () { return PV ? { lod: PV.lod, tris: triCount(PV.r.skin.geometry), geo: PV.gs, atlas: PV.as, beach: PV.o.beach, frame: PV.frame, slot: PV.slot, clip: pvClipOn() ? PV.clipB : 0, clipT: pvClipOn() ? PV.clipT || 0 : 0, yaw: PV.yaw + PV.yawB, yawT: PV.yawT, cd: PV.cd, pose: PV.pose, rig: PV.r } : null; }
  };

  // =====================================================================
  //  PRUEBA DEL VESTUARIO EN EL NAVEGADOR (VB.Doll.lookSelfTest; spec §9; la usa tools/looktest.js --gl)
  // =====================================================================
  // Topes por muñeco con el look completo (§1.5) y triángulos EXACTOS de los looks de hoy [LOD0, LOD1, LOD2] (pista).
  // TRI_CAP es para el partido: hay 12 muñecos en el 6v6 del móvil. LOD0 NO se sube nunca; LOD1/LOD2 solo con una medida de fps del
  // 6v6 a 640x360 antes y después, apuntada en notes/players.md (plan del Vestuario, §3.2). lookSelfTest imprime el margen que queda.
  // TRI_TODAY (1.18, WP1): la puntera de la zapatilla por color de vértice ahorra 64/101/208 por pie (−128/−202/−416 en pista)
  // (WP4: la tobillera acolchada sale del zapatón —en lugar del cuello y el ribete, que ya no llevan tapas— y los cordones, solo en LOD2:
  //  −24/0/+72 en pista con el look de serie)
  var TRI_CAP = [4400, 6000, 12800];
  // TRI_TODAY (1.18, WP2): casco de pelo nuevo. El afro baja (−394/−349/−564 con gafas: rizos de 20-80 triángulos en vez de 19 esferas)
  // y el resto queda casi igual (rapado +26/+68/+34, gorra +42/+47/+2: el pelo de la nuca bajo la gorra)
  // (ronda 1 de WP2: la banda de pelo bajo un gorro de copa lleva una fila menos en LOD0 → gorra −32 en LOD0; así el pelo bajo el gorro
  //  nunca cuesta más que el peinado sin gorro, lo comprueba lookSelfTest 2c)
  // TRI_TODAY (1.18, WP3): láminas de la cara (LOD0 con una fila más y la de boca más ancha: +20/+16/+16), gafas en la frente rehechas
  // (−300/−332/−784) y gorra con la visera gruesa y la copa más ligera (+8/−87/−216)
  var TRI_TODAY = [
    { L: { style: 'rapado', acc: '' }, t: [2384, 3705, 8348], n: 'rapado sin complemento' },
    { L: { style: 'afro', acc: 'gafas' }, t: [3032, 4425, 9804], n: 'afro + gafas' },
    { L: { style: 'afro', acc: '', eyes: 'frente' }, t: [3032, 4425, 9804], n: 'afro + gafas en la frente (L nueva)' },
    { L: { style: 'tupe', acc: 'gorra' }, t: [2606, 3950, 8850], n: 'gorra' }
  ];
  // reglas de compatibilidad (las de VB.Look.CLASH; esta copia solo se usa si look.js no está cargado)
  var CLASH_FALLBACK = [
    { a: { slot: 'eyes', ids: ['frente'] }, b: { slot: 'head', ids: ['cinta', 'cintaRizo', 'bandana', 'gorra', 'visera', 'pescador', 'corona', 'gorraMTC', 'diadema', 'pinzas', 'gorroPompon', 'pescadorCuadros', 'viseraGafas'] } }
  ];
  /** Rig mínimo (esqueleto en reposo, sin material) para medir la geometría de un aspecto. */
  function testRig(L, bch, tc) {
    var root = new THREE.Group(), bones = [], bl = boneLayout();
    function bone(p, a, b, c) { var o = new THREE.Bone(); o.position.set(a || 0, b || 0, c || 0); p.add(o); bones.push(o); return o; }
    var body = bone(root), pelvis = bone(body, 0, HIP_H, 0), spine = bone(pelvis, 0, SPINE_Y, 0), chest = bone(spine, 0, CHEST_Y, 0), head = bone(chest, 0, NECK_Y, 0);
    ['eyes', 'mouth', 'teeth', 'browL', 'browR'].forEach(function (n) { bone(head, bl[n][0], bl[n][1], bl[n][2]); });
    var hair = bone(head, bl.hair[0], bl.hair[1], bl.hair[2]);
    var r = { bones: bones, pelvis: pelvis, chest: chest, head: head, hair: hair, sh: [], up: [], el: [], hand: [], th: [], kn: [], ft: [], look: L, tc: tc, beach: !!bch, geos: [null, null, null] };
    for (var k = 0; k < 2; k++) {
      var s = k ? -1 : 1, sh = bone(chest, s * SH_X, SH_Y, SH_Z), up = bone(sh), el = bone(up, 0, -UPPER, 0), hd = bone(el, 0, -FORE, 0);
      r.sh.push(sh); r.up.push(up); r.el.push(el); r.hand.push(hd);
      var hp = bone(pelvis, s * HIP_W, 0, 0), th = bone(hp), kn = bone(th, 0, -THIGH, 0), ft = bone(kn, 0, -SHIN, 0);
      r.th.push(th); r.kn.push(kn); r.ft.push(ft);
    }
    root.updateMatrixWorld(true); r.rest = bones.map(function (b) { return b.matrixWorld.clone(); });
    return r;
  }
  /** Triángulos [LOD0, LOD1, LOD2] y huella de la malla alta (posiciones, colores y UV) de un aspecto. */
  function measure(L, bch, tc, wantHash, onlyHi) {
    var r = testRig(L, bch, tc), t = [], h = 0, i;
    for (var l = onlyHi ? 2 : 0; l < 3; l++) {
      var g = rigGeometry(r, l); t.push(triCount(g));
      if (l === 2 && wantHash) ['position', 'color', 'uv', 'ow'].forEach(function (n) { var a = g.attributes[n].array; for (i = 0; i < a.length; i++) h = (Math.imul(h, 31) + Math.round(a[i] * 1e4)) | 0; });
      g.dispose(); r.geos[l] = null;
    }
    return { t: t, h: h };
  }
  function lookSelfTest() {
    if (!THREE) THREE = window.THREE;
    var t0 = Date.now(), fails = [], log = [], res = { ok: false, fails: fails, log: log, items: 0, today: [], worst: {}, budget: {}, styles: {}, tris: {}, draws: null, preview: null, ms: 0 };
    var tc = Object.assign({}, TEAMS[0]), hasCanvas = typeof document !== 'undefined' && !!document.createElement, cv = null, id;
    function fail(m) { fails.push(m); }
    function base(bch) { return { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: '' }; }
    function withSlot(L, slot, id) { var o = Object.assign({}, L); if (slot === 'style') o.style = id; else if (slot === 'head') o.acc = id; else o[slot] = id; return o; }
    if (hasCanvas) cv = canvas(ATLAS, ATLAS);
    // 0) el peto (partidillo) se pinta en las dos sedes y entra en la firma del atlas (no en la de la malla)
    var tcP = Object.assign({}, tc, { pattern: 'peto', bib: 0xff7a1a, numFill: '#1b1b1b' }), tcP2 = Object.assign({}, tcP, { bib: 0x9be52e }), LP = base(false);
    if (hasCanvas) [false, true].forEach(function (bch) { try { paintAtlas(cv, tcP, LP, 7, bch); } catch (e) { fail('atlas peto ' + (bch ? 'playa' : 'pista') + ': ' + (e && e.message || e)); } });
    if (atlasSig(LP, tcP, 7, false) === atlasSig(LP, tcP2, 7, false)) fail('atlasSig no ve el color del peto');
    if (geoSig(LP, tcP, false) !== geoSig(LP, tcP2, false)) fail('el color del peto cambia la malla (debería ir solo en el atlas)');
    // 1) el catálogo de look.js no trae nada que el muñeco no sepa dibujar (ni con otra sede)
    var CAT = VB.Look && VB.Look.CATALOG;
    if (CAT && CAT.length) CAT.forEach(function (it) {
      (it.slots || [it.slot]).forEach(function (sl) {
        if (sl === 'hairTint' || sl === 'color') return;
        // «as» (variantes como los objetos de jefe): sin dibujo propio, VB.Look.resolve pasa la pieza base (drawId de look.js)
        var did = ITEMS[sl] && !ITEMS[sl][it.id] && it.as ? it.as : it.id;
        if (!ITEMS[sl] || !ITEMS[sl][did]) fail('sin dibujo en doll.js: ' + sl + '=' + it.id + (did !== it.id ? ' (como ' + did + ')' : ''));
        else if (sl !== 'style' && did === it.id && (it.venue || 'A') !== ITEMS[sl][did]) fail('sede distinta en doll.js: ' + it.id + ' (' + it.venue + ' / ' + ITEMS[sl][did] + ')');
      });
    });
    // 2) cada objeto × sede × LOD se construye (y se pinta) sin errores; deltas sobre el muñeco base y geoSig fiel a la malla
    var delta = {}, itemD = {};   // itemD[id] = Δ [LOD0, LOD1, LOD2] sobre el muñeco base, el mayor de las dos sedes
    ['hall', 'beach'].forEach(function (v) {
      var bch = v === 'beach', B = base(bch), mb = measure(B, bch, tc, true), gb = geoSig(B, tc, bch);
      delta[v] = {}; res.styles[v] = {};
      ['style'].concat(LOOK_SLOTS).forEach(function (sl) {
        delta[v][sl] = [0, 0, 0];
        for (id in ITEMS[sl]) {
          var vn = ITEMS[sl][id]; if (vn !== 'A' && (vn === 'Y') !== bch) continue;
          var L = withSlot(B, sl, id), m = null; res.items++;
          try { m = measure(L, bch, tc, true); } catch (e) { fail('geometría ' + v + ' ' + sl + '=' + id + ': ' + (e && e.message || e)); continue; }
          if (hasCanvas) { try { paintAtlas(cv, tc, L, 7, bch); } catch (e) { fail('atlas ' + v + ' ' + sl + '=' + id + ': ' + (e && e.message || e)); } }
          for (var l = 0; l < 3; l++) delta[v][sl][l] = Math.max(delta[v][sl][l], m.t[l] - mb.t[l]);
          if (sl === 'style') res.styles[v][id] = m.t;
          var dk = itemD[id] || (itemD[id] = [0, 0, 0]); for (l = 0; l < 3; l++) dk[l] = Math.max(dk[l], m.t[l] - mb.t[l]);
          if (geoSig(L, tc, bch) === gb && m.h !== mb.h) fail('geoSig no ve el cambio de malla: ' + v + ' ' + sl + '=' + id);
          if (sl !== 'style' && sl !== 'head' && sl !== 'eyes') {   // un color que solo va en el atlas no cambia la malla
            ['cA', 'cB', 'cSock', 'cShoe', 'cGlass', 'cPad'].forEach(function (ck) {
              var L2 = Object.assign({}, L); L2[ck] = 0x8a4fd8;
              if (geoSig(L2, tc, bch) === geoSig(L, tc, bch)) { if (measure(L2, bch, tc, true, true).h !== m.h) fail('geoSig no ve ' + ck + ' con ' + sl + '=' + id + ' (' + v + ')'); }
            });
          }
        }
      });
    });
    // 2b) tris del catálogo de look.js al día (Δ medido sobre el muñeco base de su sede; los peinados, sobre el tupé). Margen: 40
    //     triángulos o el 15 % (los WP solo actualizan cifras cuando cambian una pieza de verdad); res.tris = lo medido, para copiarlo
    if (CAT && CAT.length) CAT.forEach(function (it) {
      var did = it.as && !(ITEMS[it.slot] && ITEMS[it.slot][it.id]) ? it.as : it.id, m = itemD[did];
      if (!m || !it.tris) return;
      var want = [Math.max(0, m[0]), Math.max(0, m[1]), Math.max(0, m[2])];
      res.tris[it.id] = want;
      for (var l = 0; l < 3; l++) if (Math.abs(want[l] - it.tris[l]) > Math.max(40, 0.15 * want[l])) { fail('tris desfasados en look.js: ' + it.id + ' [' + it.tris.join(', ') + '] (medido [' + want.join(', ') + '])'); break; }
    });
    // cada peinado ≤ el afro (el más pesado) en todos los LOD y en las dos sedes: así el peor caso de pelo es siempre el afro
    ['hall', 'beach'].forEach(function (v) {
      var S = res.styles[v], af = S && S.afro;
      if (!af) return;
      Object.keys(S).forEach(function (id) { for (var l = 0; l < 3; l++) if (S[id][l] > af[l]) { fail('el peinado ' + id + ' pesa más que el afro en ' + v + ' LOD' + l + ': ' + S[id][l] + ' > ' + af[l]); break; } });
    });
    // las firmas de malla de look.js (por fit) y de doll.js (por L) cambian a la vez: con cada objeto puesto sobre un muñeco mínimo
    // (tupé o rapado, nada más), cambiar cada hueco de color o el segundo color de pelo cambia las dos o ninguna. Si look.js dice
    // «misma malla» y doll.js la rehace, falta una letra en el vc del objeto; al revés, sobra
    if (VB.Look && VB.Look.geoSig && VB.Look.resolve && VB.Look.defaults && CAT) {
      var LK = VB.Look, KEYS = LK.COLOR_KEYS || [], CL_ = LK.COLOR_L || {}, nSig = 0, badSig = [];
      var minFit = function (ven, st) {
        var f = JSON.parse(JSON.stringify(LK.defaults(0))); f.style = st;
        (LK.SLOTS || []).forEach(function (s) { f.hall[s] = ''; f.beach[s] = ''; });
        f.hall.shoes = 'negras'; return f;   // (en pista siempre hay zapatillas: las negras no usan ningún color del fit)
      };
      ['hall', 'beach'].forEach(function (ven) {
        var bch = ven === 'beach';
        CAT.forEach(function (it) {
          if (it.slot === 'hairTint' || it.slot === 'color' || (it.venue !== 'A' && (it.venue === 'Y') !== bch)) return;
          var f = minFit(ven, it.slot === 'style' ? it.id : 'rapado');
          if (it.slot === 'shoes') f.hall.shoes = it.id;
          else if (it.slot !== 'style') it.slots.forEach(function (s) { f[ven][s] = it.id; });
          var vary = KEYS.map(function (k) { return ['colors', k]; }).concat([['hair2', null]]);
          vary.forEach(function (w) {
            var g = JSON.parse(JSON.stringify(f));
            if (w[0] === 'colors') g.colors[w[1]] = 'morado'; else g.hair2 = 'tRosa';
            var lookSame = LK.geoSig(f, ven) === LK.geoSig(g, ven);
            var dollSame = geoSig(LK.resolve(f, ven, tc), tc, bch) === geoSig(LK.resolve(g, ven, tc), tc, bch);
            nSig++;
            if (lookSame !== dollSame) badSig.push(ven + ' ' + it.id + ' ' + (w[1] || w[0]) + ' (look.js ' + (lookSame ? 'igual' : 'cambia') + ', doll.js ' + (dollSame ? 'igual' : 'cambia') + ')');
          });
        });
      });
      if (badSig.length) fail('geoSig de look.js y de doll.js no cuadran en ' + badSig.length + ' de ' + nSig + ' casos: ' + badSig.slice(0, 6).join(' | '));
    }
    // 2c) presupuesto del pelo bajo gorro de copa (plan WP2 §Presupuesto: «con gorra, el coste total ≤ el del peinado sin gorra»,
    //     contado sin el propio gorro): pelo(peinado + gorro) ≤ pelo(peinado). Lo que cuesta el gorro solo se mide sin pelo (SKIP_HAIR)
    ['hall', 'beach'].forEach(function (v) {
      var bch = v === 'beach', hats = Object.keys(ITEMS.head).filter(function (h) { var vh = ITEMS.head[h]; return hatCup(h) && (vh === 'A' || (vh === 'Y') === bch); });
      res.hatHair = res.hatHair || {};
      hats.forEach(function (h) {
        var hc;
        SKIP_HAIR = true;
        try { var a = measure({ skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: h }, bch, tc, false), b = measure({ skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: '' }, bch, tc, false); hc = [a.t[0] - b.t[0], a.t[1] - b.t[1], a.t[2] - b.t[2]]; }
        finally { SKIP_HAIR = false; }
        var worst = null;
        for (var sid in ITEMS.style) {
          var S = res.styles[v][sid]; if (!S) continue;
          var m = measure({ skin: 0xdba27a, hair: 0x3a2416, style: sid, acc: h }, bch, tc, false);
          for (var l = 0; l < 3; l++) {
            var over = m.t[l] - hc[l] - S[l];
            if (!worst || over > worst.over) worst = { over: over, id: sid, lod: l };
            if (over > 0) { fail('pelo bajo ' + h + ' (' + v + ') pesa más que sin gorro: ' + sid + ' LOD' + l + ' +' + over); break; }
          }
        }
        res.hatHair[v + '.' + h] = { hat: hc, worst: worst };
        if (worst) log.push('pelo bajo ' + h + ' (' + v + '): gorro ' + hc.join('/') + ', lo más justo ' + worst.id + ' LOD' + worst.lod + ' ' + (worst.over > 0 ? '+' : '') + worst.over);
      });
    });
    // 3) los looks de hoy, con los triángulos EXACTOS de siempre
    TRI_TODAY.forEach(function (d) {
      var m = measure(Object.assign({ skin: 0xdba27a, hair: 0x3a2416 }, d.L), false, tc, false);
      res.today.push({ n: d.n, t: m.t });
      if (m.t.join('/') !== d.t.join('/')) fail('triángulos de ' + d.n + ': ' + m.t.join('/') + ' (deben ser ' + d.t.join('/') + ')');
    });
    if (VB.Look && VB.Look.defaults && VB.Look.resolve) {   // los fits por defecto se ven (y miden) como los MY_LOOKS de hoy
      [[0, 'hall', { style: 'tupe', acc: '' }], [0, 'beach', { style: 'tupe', acc: 'gorra' }], [1, 'hall', { style: 'afro', acc: 'cinta' }], [1, 'beach', { style: 'afro', acc: 'visera' }]].forEach(function (d) {
        try {
          var Ln = VB.Look.resolve(VB.Look.defaults(d[0]), d[1], tc), bch = d[1] === 'beach', Lo = Object.assign({ skin: Ln.skin, hair: Ln.hair }, d[2]);
          var a = measure(Ln, bch, tc, true), b = measure(Lo, bch, tc, true);
          if (a.h !== b.h) fail('defaults(' + d[0] + ') en ' + d[1] + ' no da la malla de hoy (' + a.t.join('/') + ' frente a ' + b.t.join('/') + ')');
        } catch (e) { fail('defaults(' + d[0] + ') ' + d[1] + ': ' + (e && e.message || e)); }
      });
    }
    // 4) peor combinación permitida por sede: peinado × gorro × gafas a mano (con las reglas de compatibilidad) + el peor de cada ranura
    var CL = VB.Look && VB.Look.CLASH && VB.Look.CLASH.length ? VB.Look.CLASH : CLASH_FALLBACK;
    function clashes(L) {
      for (var i = 0; i < CL.length; i++) {
        var a = CL[i].a, b = CL[i].b, va = a.slot === 'head' ? L.acc : L[a.slot], vb = b.slot === 'head' ? L.acc : L[b.slot];
        if (a.ids.indexOf(va) >= 0 && b.ids.indexOf(vb) >= 0) return true;
      }
      return false;
    }
    ['hall', 'beach'].forEach(function (v) {
      var bch = v === 'beach', best = { t: [0, 0, 0], L: ['', '', ''] }, extra = [0, 0, 0], eyesIds = [''], sid, eid, l;
      LOOK_SLOTS.forEach(function (sl) { if (sl !== 'head' && sl !== 'eyes') for (l = 0; l < 3; l++) extra[l] += delta[v][sl][l]; });
      for (eid in ITEMS.eyes) { var ve = ITEMS.eyes[eid]; if (ve === 'A' || (ve === 'Y') === bch) eyesIds.push(eid); }
      var heads = [''].concat(Object.keys(ITEMS.head).filter(function (h) { var vh = ITEMS.head[h]; return vh === 'A' || (vh === 'Y') === bch; }));
      for (sid in ITEMS.style) heads.forEach(function (h) {
        var top = null;
        eyesIds.forEach(function (e) {
          var L = { skin: 0xdba27a, hair: 0x3a2416, style: sid, acc: h, eyes: e };
          if (clashes(L)) return;
          var m = measure(L, bch, tc, false);
          if (!top || m.t[2] > top.t[2]) top = { t: m.t, L: L };
        });
        if (!top) return;
        var tot = [top.t[0] + extra[0], top.t[1] + extra[1], top.t[2] + extra[2]];
        for (l = 0; l < 3; l++) if (tot[l] > best.t[l]) { best.t[l] = tot[l]; best.L[l] = top.L.style + '+' + (top.L.acc || '-') + '+' + (top.L.eyes || '-'); }
      });
      res.worst[v] = best;
      res.budget[v] = [0, 1, 2].map(function (l) { return { lod: l, t: best.t[l], cap: TRI_CAP[l], margin: TRI_CAP[l] - best.t[l], look: best.L[l] }; });
      res.budget[v].forEach(function (b) {
        log.push('margen ' + (bch ? 'playa' : 'pista') + ' LOD' + b.lod + ': ' + b.t + ' / ' + b.cap + ' (quedan ' + b.margin + ', ' + (100 * b.margin / b.cap).toFixed(1) + ' %) · ' + b.look + ' + lo peor de cada ranura');
      });
      for (l = 0; l < 3; l++) if (best.t[l] > TRI_CAP[l]) fail('tope de triángulos en ' + v + ' LOD' + l + ': ' + best.t[l] + ' > ' + TRI_CAP[l] + ' (' + best.L[l] + ' + lo peor de cada ranura)');
    });
    // 5) 3 dibujos por muñeco (piel + tinta + sombra) con el look más cargado de playa
    if (hasCanvas) {
      try {
        var LF = { skin: 0x8a5638, hair: 0x241a14, style: 'coletas', acc: 'gorraAtras', eyes: 'frente', neck: 'conchas', wristL: 'reloj', wristR: 'muneq', hands: 'dedos', ankle: 'pulseraTob', armL: 'manguitoLlamas', band: 'capitan', paint: 'estrella', beard: 'bigote' };
        var rr = buildRig(LF, 91, { tc: tc, beach: true, px: 1, lod: 2 }), meshes = 0, shadows = 0;
        rr.root.traverse(function (o) { if (o.isMesh) { meshes++; if (o.castShadow) shadows++; } });
        res.draws = meshes + shadows; freeRig(rr);
        if (res.draws !== 3) fail('dibujos por muñeco: ' + res.draws + ' (deben ser 3: piel, tinta y sombra)');
      } catch (e) { fail('muñeco completo: ' + (e && e.message || e)); }
    }
    // 6) vista previa: un cambio solo de atlas no crea mallas; 20 cambios de malla seguidos no dejan nada en la GPU
    var C = VB.ctx, R = C && C.renderer;
    if (hasCanvas && R && C.scene && C.camera && R.info && R.info.memory) {
      var was = !!PV, keepL = was ? PV.L : null, keepO = was ? PV.o : null, P = preview, pr = { atlas: '', geoN: 0, mem0: null, mem1: null, memOff: null, memEnd: null };
      var mem = function () { R.render(C.scene, C.camera); return [R.info.memory.geometries, R.info.memory.textures]; };
      try {
        pr.memOff = was ? null : mem();
        if (!was) P.start(C, base(false), { beach: false });
        var L0 = PV.L, bch0 = PV.o.beach;
        pr.mem0 = mem();
        var cands = [['cSock', 0x3fbf5a], ['paint', 'rayas'], ['marks', 'pecas'], ['beard', 'bigote'], ['band', 'capitan']], La = null;
        for (var ci = 0; ci < cands.length && !La; ci++) {
          var Lc = Object.assign({}, L0); Lc[cands[ci][0]] = L0[cands[ci][0]] === cands[ci][1] ? (typeof cands[ci][1] === 'number' ? 0x3a6cf0 : '') : cands[ci][1];
          if (geoSig(Lc, PV.o.tc, bch0) === PV.gs && atlasSig(Lc, PV.o.tc, PV.o.num, bch0) !== PV.as) La = Lc;
        }
        if (La) {
          pr.atlas = P.set(La);
          var ma = mem();
          if (pr.atlas !== 'atlas') fail('preview.set con un cambio solo de atlas devolvió «' + pr.atlas + '»');
          if (ma[0] !== pr.mem0[0] || ma[1] !== pr.mem0[1]) fail('preview.set de atlas cambió la memoria de GPU: ' + pr.mem0.join('/') + ' → ' + ma.join('/'));
        } else fail('vista previa: no encontré un cambio solo de atlas');
        var STY = ['afro', 'cresta'];
        for (var gi = 0; gi < 20; gi++) {
          var Lg = Object.assign({}, L0, { style: STY[gi % 2] === L0.style ? 'coletas' : STY[gi % 2] });
          if (P.set(Lg) === 'geo') pr.geoN++;
          mem();
        }
        P.set(L0); pr.mem1 = mem();
        if (pr.geoN !== 20) fail('vista previa: ' + pr.geoN + ' de 20 cambios de peinado rehicieron la malla');
        if (pr.mem1[0] !== pr.mem0[0] || pr.mem1[1] !== pr.mem0[1]) fail('fuga en la vista previa: geometrías/texturas ' + pr.mem0.join('/') + ' → ' + pr.mem1.join('/'));
      } catch (e) { fail('vista previa: ' + (e && e.message || e)); }
      try {
        if (!was) { P.stop(); pr.memEnd = mem(); if (pr.memOff && (pr.memEnd[0] !== pr.memOff[0] || pr.memEnd[1] !== pr.memOff[1])) fail('la vista previa deja memoria al pararla: ' + pr.memOff.join('/') + ' → ' + pr.memEnd.join('/')); }
        else if (PV) P.set(keepL, keepO);
      } catch (e) { fail('vista previa (al acabar): ' + (e && e.message || e)); }
      res.preview = pr;
    }
    res.ok = !fails.length; res.ms = Date.now() - t0;
    try {
      console.info('[VB] lookSelfTest: ' + (res.ok ? 'bien' : fails.length + ' fallos') + ' (' + res.items + ' objetos, ' + res.ms + ' ms); peor pista ' + (res.worst.hall && res.worst.hall.t.join('/')) + ', playa ' + (res.worst.beach && res.worst.beach.t.join('/')));
      log.forEach(function (s) { console.info('[VB]   ' + s); });
    } catch (e) { }
    return res;
  }

  // =====================================================================
  //  RETRATO DEL MUÑECO (VB.Doll.portrait; spec S2-B2B3 §2.1 y §3.1, sprint 2)
  // =====================================================================
  // Busto de tres cuartos con el aspecto del Vestuario, pintado con el MISMO renderer en la esquina inferior izquierda del lienzo
  // (tijera) y copiado con drawImage a un canvas 2D. main.js lo llama en el paso 4b, ANTES del render del frame, que tapa el recuadro
  // (sin destello y sin leer píxeles de la GPU). Escena propia PT.scene: las luces copian TIPO, NÚMERO y castShadow de las visibles
  // de ctx.scene (así comparten programa con el juego), con posiciones fijas; niebla del mismo tipo, lejísimos. El muñeco no da ni
  // recibe sombra (si no, programa de profundidad nuevo y el mapa de sombras vacío ensucia la luz). Temporales de módulo: draw no
  // asigna nada salvo cuando cambia la firma de luces o el muñeco.
  var PT = null, PT_V2 = null, PT_V4 = null, PT_SC = null, PT_FOV = 28, PT_LS = [];
  var PT_ST = { n: 0, ms: 0, last: '', progs: 0 };
  // posiciones fijas de las luces direccionales (cámara en +X; a la izquierda de quien mira = +Z): principal arriba, izquierda y
  // por delante; relleno a la derecha y bajo; borde por detrás
  var PT_DIR = [[3, 4.2, 2.4], [2.2, 1.2, -3], [-3, 2.6, -1.6], [-2, 3, 2.5]];
  var PT_DEF = { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: '' };   // = MY_LOOKS[0] de players (por si falta players.js)
  function ptLightPush(o) { if (o.isLight && !o.isRectAreaLight && !o.isLightProbe) PT_LS.push(o); }
  /** Firma de las luces visibles de la escena del juego (tipo + sombra, en orden); deja la lista en PT_LS. */
  function ptLightSig(sc) {
    var s = '';
    PT_LS.length = 0;
    sc.traverseVisible(ptLightPush);
    for (var i = 0; i < PT_LS.length; i++) s += PT_LS[i].type.charAt(0) + (PT_LS[i].castShadow ? '*' : '') + ',';
    return s;
  }
  function ptDropLights() {
    for (var i = 0; i < PT.lights.length; i++) { var o = PT.lights[i]; PT.scene.remove(o); if (o.shadow && o.shadow.map) o.shadow.dispose(); }
    PT.lights.length = 0;
  }
  /** Rehace las luces de PT.scene con la firma de ctx.scene (src = PT_LS, recién llenada por ptLightSig). */
  function ptLights(src) {
    var i, o, n, d = 0;
    ptDropLights();
    for (i = 0; i < src.length; i++) {
      o = src[i]; n = null;
      if (o.isHemisphereLight) { n = new THREE.HemisphereLight(0xffffff, 0x000000, 1); n.position.copy(o.position); if (n.position.lengthSq() < 1e-6) n.position.set(0, 1, 0); n.position.normalize(); }
      else if (o.isDirectionalLight) { n = new THREE.DirectionalLight(0xffffff, 1); var p = PT_DIR[d++ % PT_DIR.length]; n.position.set(p[0], p[1], p[2]); }
      else if (o.isAmbientLight) n = new THREE.AmbientLight(0xffffff, 1);
      else if (o.isSpotLight) { n = new THREE.SpotLight(0xffffff, 0); n.position.set(0, 6, 0); }
      else if (o.isPointLight) { n = new THREE.PointLight(0xffffff, 0); n.position.set(0, 6, 0); }
      if (!n) continue;
      if (o.castShadow && n.shadow) { n.castShadow = true; n.shadow.mapSize.set(64, 64); }
      n.userData.ptSrc = o; PT.lights.push(n); PT.scene.add(n);
    }
  }
  /** Color e intensidad de cada luz copiada (la playa cambia de luz en vivo sin recompilar: aquí igual). Focos y puntos van a 0. */
  function ptLightTone() {
    for (var i = 0; i < PT.lights.length; i++) {
      var n = PT.lights[i], o = n.userData.ptSrc; if (!o) continue;
      n.color.copy(o.color);
      if (!n.isSpotLight && !n.isPointLight) n.intensity = o.intensity;
      if (n.groundColor && o.groundColor) n.groundColor.copy(o.groundColor);
    }
  }
  function ptFog(c) {
    var f = c.scene && c.scene.fog, want = !f ? '' : f.isFogExp2 ? 'e' : 'l';
    if (want === PT.fogT) return;
    PT.fogT = want;
    PT.scene.fog = !want ? null : want === 'e' ? new THREE.FogExp2(0x000000, 1e-7) : new THREE.Fog(0x000000, 900, 1000);
  }
  function ptKit(req) {
    if (req && req.tc && req.tc.base != null) return req.tc;
    try { if (VB.Players && VB.Players.kit) { var k = VB.Players.kit(0); if (k && k.base != null) return k; } } catch (e) { }
    return TEAMS[0];
  }
  /** Aspecto del retrato: req.L (VB.Look.resolve o una L vieja); si no, req.fit (un fit del Vestuario, se resuelve aquí con la sede y
   *  el kit); si no, VB.Players.baseLook (el de hoy sin Vestuario; T2) con guarda; si tampoco, el n.º 1 de siempre. Congelado. */
  function ptLook(req, tc) {
    var L = req && req.L, bch = !!(req && req.beach);
    if (!L && req && req.fit && VB.Look && VB.Look.resolve) { try { L = VB.Look.resolve(req.fit, bch ? 'beach' : 'hall', tc); } catch (e) { L = null; } }
    if (!L && VB.Players && typeof VB.Players.baseLook === 'function') {
      try { L = VB.Players.baseLook({ team: 0, idx: req && req.idx != null ? req.idx | 0 : 0, num: req && req.num, role: req && req.role, beach: bch }); } catch (e) { L = null; }
    }
    if (!L) L = bch ? PT_DEF_B : PT_DEF;
    return Object.isFrozen(L) ? L : Object.freeze(Object.assign({}, L));
  }
  var PT_BMP = null;   // (promesa del ImageBitmap de portrait.snap)
  /** Suelta el material que portrait.prep montó para un trabajo que ya no se usa. */
  function ptJobMat(j) { var m = j && j.mat; if (!m) return; j.mat = null; try { if (m.map) m.map.dispose(); m.dispose(); } catch (e) { } }
  var PT_DEF_B = { skin: 0xdba27a, hair: 0x3a2416, style: 'tupe', acc: 'gorra' };
  function ptNum(req) { var n = req && req.num; return n != null && n !== '' ? n : 1; }
  function ptSize(req) { var s = +(req && req.size); return s > 8 ? Math.min(1024, Math.round(s)) : 256; }
  function ptBg(req) { var b = req && req.bg; return typeof b === 'number' && b >= 0 ? b & 0xffffff : 0x2a1f4a; }
  function ptYaw(req) { var y = req && req.yaw; return typeof y === 'number' && isFinite(y) ? y : 0.35; }
  function ptPose(req) { var p = req && req.pose; return p && POSES[p] ? p : 'stand'; }
  function ptFace(req) { var f = req && req.face; return f && EXPR[f] ? f : 'neutra'; }
  function ptInit(c) {
    if (!THREE) THREE = (c && c.THREE) || window.THREE;
    if (!THREE) return false;
    if (!PT_V2) { PT_V2 = new THREE.Vector2(); PT_V4 = new THREE.Vector4(); PT_SC = new THREE.Vector4(); }
    if (!PT) {
      PT = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(PT_FOV, 1, 0.1, 20), lights: [], sig: null, fogT: null, r: null, gs: '', as: '', bch: null, ty: 0, d: 0 };
      PT.scene.name = 'portrait'; PT.scene.background = new THREE.Color(0x2a1f4a);
    }
    ptFrame();
    return true;
  }
  /** Cámara del busto (medidas del muñeco activo): mira a la altura de los hombros + algo de cabeza, a la distancia en que caben la
   *  cabeza con gorro y los hombros. T21: el encuadre depende del tamaño (ptZoom): pequeño (cabecera de 44 px, 72 px) = la cabeza
   *  con el gorro entero, el cuello y un poco de hombros, más cerca y con aire arriba; grande (88 px y más) = el busto de siempre. */
  var PT_TY = 0.8, PT_D = 2.0, PT_UP = 0.05, PT_TY_H = 1.0, PT_D_H = 1.5, PT_UP_H = 0.02, PT_SIDE_H = 0.045;
  /** 0 = cara (lienzo ≤ 96 px: 44 px CSS a ×2), 1 = busto (≥ 176 px: 88 px CSS a ×2); req.zoom (0..1) lo fuerza. */
  function ptZoom(req) {
    var z = req && req.zoom;
    if (typeof z === 'number' && isFinite(z)) return clamp(z, 0, 1);
    return clamp((ptSize(req) - 96) / 80, 0, 1);
  }
  function ptFrame(z) {
    z = z == null ? 1 : z;
    var top = SH_H + HEAD_C + HEAD_RY, ty = SH_H + HEAD_C * lerp(PT_TY_H, PT_TY, z), d = lerp(PT_D_H, PT_D, z) * top / 1.64, up = lerp(PT_UP_H, PT_UP, z);
    var sz = -PT_SIDE_H * (1 - z) * top / 1.64;   // de cerca, el encuadre se corre a la derecha (−Z): cabe la visera, que sale por ese lado
    if (ty === PT.ty && d === PT.d) return;
    PT.cam.position.set(d, ty + up, sz); PT.cam.lookAt(0, ty, sz); PT.cam.updateMatrixWorld(true);
    PT.ty = ty; PT.d = d;
  }
  /** Miniaturas del Vestuario (req.frame = un encuadre de la vista previa, PV_FRAMES): la cámara del retrato encuadra esa caja del
   *  muñeco en el cuadrado (con un 8 % de aire), girada como la caja (salvo req.yaw). Devuelve la caja (o null). PT.ty/PT.d se borran
   *  para que el busto de siempre se recoloque luego. */
  function ptFrameBox(r, name) {
    var b = PV_FRAMES[name](pvMeasure(r)), tq = Math.tan(PT_FOV * PI / 360), hv = (b.hi - b.lo) * 0.5, ty = (b.hi + b.lo) * 0.5;
    var d = Math.max(0.4, Math.max(hv, b.lat) / (tq * 0.92)), up = b.up != null ? b.up : 0.1;
    PT.cam.position.set(d, ty + d * up, 0); PT.cam.lookAt(0, ty, 0); PT.cam.updateMatrixWorld(true);
    PT.ty = PT.d = NaN;
    return b;
  }
  /** Prepara la escena para req (luces, niebla, fondo, muñeco, pose y cara). Devuelve el rig. */
  function ptSetup(c, req) {
    var sig = c && c.scene ? ptLightSig(c.scene) : '';
    if (sig !== PT.sig) { PT.sig = sig; ptLights(PT_LS); }
    ptLightTone(); if (c && c.scene) ptFog(c);
    PT.scene.background.setHex(ptBg(req));
    var tc = ptKit(req), L = ptLook(req, tc), num = ptNum(req), bch = !!req.beach, gs = geoSig(L, tc, bch), as = atlasSig(L, tc, num, bch), r = PT.r;
    var lod = req.lod === 0 || req.lod === 1 ? req.lod : 2;   // (miniaturas del Vestuario: la malla media basta a 96 px y se monta antes)
    if (!r || gs !== PT.gs || bch !== PT.bch || lod !== PT.lod) {
      // WP6 (ronda 1): el material y su atlas se quedan de un muñeco al siguiente (solo cambia la malla; si el atlas también, se repinta
      // el mismo lienzo): una miniatura de la rejilla cuesta menos de la mitad (sin lienzo, textura ni material nuevos por ficha)
      var km = r && r.skin && r.skin.material && r.skin.material.map && r.skin.material.userData.paint ? r.skin.material : null;
      if (km) r.skin.material = null;
      else if (PT.job && PT.job.mat && PT.job.gs === gs && PT.job.as === as) { km = PT.job.mat; PT.as = as; }   // (el de prep, ya pintado)
      if (r) freeRig(r);
      // (portrait.prep ya montó el esqueleto y la malla de este aspecto por pasos: solo falta vestirlo)
      var pj = PT.job && PT.job.gs === gs && PT.job.lod === lod && PT.job.bch === bch && PT.job.as === as && PT.job.r.geos[lod] ? PT.job.r : null;
      if (PT.job && PT.job.mat && PT.job.mat !== km) ptJobMat(PT.job); PT.job = null;
      r = PT.r = buildRig(L, 97, { tc: tc, num: num, beach: bch, px: 1, lod: lod, mat: km, rig: pj }); PT.lod = lod;
      if (km && as !== PT.as) {
        r.look = L; r.tc = tc; r.num = num;
        km.userData.paint = { tc: tc, L: L, num: num, beach: bch };
        if (km.map.image) { paintAtlas(km.map.image, tc, L, num, bch); km.map.needsUpdate = true; }
      }
      r.root.name = 'dollPortrait';
      r.skin.castShadow = false; r.skin.receiveShadow = false;
      if (r.ink) { r.ink.castShadow = false; r.ink.receiveShadow = false; }
      PT.scene.add(r.root); PT.gs = gs; PT.as = as; PT.bch = bch;
    } else if (as !== PT.as) {   // solo el atlas: se repinta el mismo lienzo (como preview.set)
      var m = r.skin.material, cv = m.map && m.map.image;
      r.look = L; r.tc = tc; r.num = num;
      m.userData.paint = { tc: tc, L: L, num: num, beach: bch };
      if (cv) { paintAtlas(cv, tc, L, num, bch); m.map.needsUpdate = true; }
      PT.as = as;
    }
    r.pose = ptPose(req); r.blinkOn = 0; r.tFix = 0;
    var fb = req.frame && PV_FRAMES[req.frame] ? ptFrameBox(r, req.frame) : null;
    if (!fb) ptFrame(ptZoom(req));
    animate(r, 0); setFace(r, ptFace(req));
    r.root.rotation.y = PI / 2 + (fb && typeof req.yaw !== 'number' ? fb.yaw : ptYaw(req));
    r.root.updateMatrixWorld(true);
    return r;
  }
  var portrait = {
    /** Clave de caché: 'geoSig|atlasSig|pose|face|yaw|bg|size' (cambia sola si cambian el look, la equipación o el dorsal); con
     *  req.zoom, además '|z' + el encuadre. */
    key: function (req) {
      req = req || {};
      if (!THREE) THREE = window.THREE;
      var tc = ptKit(req), L = ptLook(req, tc), bch = !!req.beach;
      return geoSig(L, tc, bch) + '|' + atlasSig(L, tc, ptNum(req), bch) + '|' + ptPose(req) + '|' + ptFace(req) + '|' + ptYaw(req).toFixed(3) + '|' + ptBg(req).toString(16) + '|' + ptSize(req) + (req.zoom != null ? '|z' + ptZoom(req).toFixed(2) : '') + (req.matte ? '|m' : '') + (req.frame ? '|f' + req.frame + (req.lod != null ? req.lod : '') : '');   // (req.frame: miniatura del Vestuario; req.matte: recorte con fondo transparente, main.js ptMatte)
    },
    /** Pinta el retrato en out2d (canvas 2D; se escala a su tamaño). c = VB.ctx. Devuelve los ms, o -1 si no puede (sin renderer, sin
     *  lienzo, error). Guarda y restaura viewport, tijera y render target; no toca autoClear. */
    draw: function (c, req, out2d) {
      c = c || VB.ctx; req = req || {};
      var R = c && c.renderer;
      if (!R || !out2d || (out2d !== 'bitmap' && !out2d.getContext) || !ptInit(c)) return -1;
      var t0 = performance.now(), rt = R.getRenderTarget(), sct = R.getScissorTest(), T = VB.TOON, ok = false;
      R.getViewport(PT_V4); R.getScissor(PT_SC);
      try {
        R.getDrawingBufferSize(PT_V2);
        var S = Math.min(ptSize(req), PT_V2.x, PT_V2.y), pr = R.getPixelRatio(), w = S / pr;
        if (S >= 8) {
          ptSetup(c, req);
          if (T && T.frame) T.frame(PT.cam, S);   // grosor de la tinta para este lienzo (se devuelve abajo)
          if (rt) R.setRenderTarget(null);
          R.setScissorTest(true); R.setViewport(0, 0, w, w); R.setScissor(0, 0, w, w);
          R.render(PT.scene, PT.cam);
          // out2d = 'bitmap' (snap): copia en la GPU con createImageBitmap, sin leer los píxeles (ni esperar a la GPU) ni codificar PNG
          if (out2d === 'bitmap') { PT_BMP = createImageBitmap(R.domElement, 0, PT_V2.y - S, S, S); if (PT_BMP.catch) PT_BMP.catch(function () { }); }
          else out2d.getContext('2d').drawImage(R.domElement, 0, PT_V2.y - S, S, S, 0, 0, out2d.width, out2d.height);
          ok = true;
        }
      } catch (e) {
        try { console.error('[VB][ERROR] Doll.portrait.draw: ' + (e && e.message || e)); } catch (e2) { }
      } finally {
        R.setScissorTest(sct); R.setViewport(PT_V4); R.setScissor(PT_SC);
        if (rt) R.setRenderTarget(rt);
        if (T && T.frame && c.camera) T.frame(c.camera, c.height || 720);
      }
      if (!ok) return -1;
      var ms = performance.now() - t0;
      PT_ST.n++; PT_ST.ms = ms; PT_ST.last = portrait.key(req); PT_ST.progs = R.info && R.info.programs ? R.info.programs.length : 0;
      return ms;
    },
    /** Miniaturas del Vestuario (WP6, ronda 1): como draw, pero el resultado es una promesa de ImageBitmap (copia en la GPU tomada
     *  al momento). Sin el toBlob de draw, que leía el lienzo de vuelta y esperaba a la GPU: 10-18 ms por ficha en el mismo frame.
     *  Devuelve {ms, bmp} o null si no se puede (sin createImageBitmap: main.js usa draw). */
    /** Prepara por pasos (≤ ms por llamada, salvo una pieza que se pase) el muñeco de req: esqueleto y malla. true = listo (o nada
     *  que preparar: draw/snap lo harían igual); false = queda trabajo para el frame siguiente. Las miniaturas lo llaman antes de snap. */
    prep: function (c, req, ms) {
      req = req || {};
      if (!ptInit(c)) return true;
      var tc = ptKit(req), L = ptLook(req, tc), bch = !!req.beach, gs = geoSig(L, tc, bch), as = atlasSig(L, tc, ptNum(req), bch);
      var lod = req.lod === 0 || req.lod === 1 ? req.lod : 2;
      if (PT.r && PT.gs === gs && PT.bch === bch && PT.lod === lod) return true;
      // la primera de una tanda (sin muñeco del retrato): las luces y el material también por su lado (eran 10-14 ms de golpe)
      var sig = c && c.scene ? ptLightSig(c.scene) : '';
      if (sig !== PT.sig) { PT.sig = sig; ptLights(PT_LS); return false; }
      var j = PT.job;
      if (!j || j.gs !== gs || j.lod !== lod || j.bch !== bch || j.as !== as) {
        if (j) ptJobMat(j);
        j = PT.job = { gs: gs, as: as, lod: lod, bch: bch, r: rigBones(L, 97, { tc: tc, num: ptNum(req), beach: bch }), st: null };
        j.st = rigGeoBegin(j.r, lod);
      }
      if (!rigGeoRun(j.st, performance.now() + Math.max(0.5, +ms || 3))) return false;
      if (!(PT.r && PT.r.skin && PT.r.skin.material && PT.r.skin.material.map) && !j.mat) { j.mat = dollMaterial(tc, L, ptNum(req), bch, 1); return false; }
      // (y su atlas sube a la GPU en otro frame: initTexture)
      if (j.mat && !j.up) { j.up = true; try { if (c.renderer && c.renderer.initTexture) { c.renderer.initTexture(j.mat.map); return false; } } catch (e) { } }
      return true;
    },
    snap: function (c, req) {
      if (typeof createImageBitmap !== 'function') return null;
      PT_BMP = null;
      var ms = portrait.draw(c, req, 'bitmap'), b = PT_BMP; PT_BMP = null;
      return ms >= 0 && b ? { ms: ms, bmp: b } : null;
    },
    /** Libera el muñeco, las luces (mapas de sombra) y la escena. main.js lo llama 1 s después de vaciar la cola. */
    free: function () {
      if (!PT) return false;
      if (PT.job) ptJobMat(PT.job); PT.job = null;
      if (PT.r) freeRig(PT.r);
      ptDropLights();
      PT = null; PT_LS.length = 0;
      return true;
    },
    /** Escena lista con un muñeco por defecto (o el de req) para que main.js la precompile (compileAsync). → {scene, camera} | null. */
    warm: function (c, req) {
      c = c || VB.ctx;
      if (!ptInit(c)) return null;
      try { ptSetup(c, req || {}); } catch (e) { try { console.error('[VB][ERROR] Doll.portrait.warm: ' + (e && e.message || e)); } catch (e2) { } return null; }
      return { scene: PT.scene, camera: PT.cam };
    },
    /** Para pruebas: {n retratos pintados, ms del último, clave del último, programas del renderer tras él}. */
    stats: function () { return { n: PT_ST.n, ms: PT_ST.ms, last: PT_ST.last, progs: PT_ST.progs }; },
    /** Para pruebas: estado interno (firma de luces, niebla, muñeco vivo, encuadre). */
    info: function () { return PT ? { sig: PT.sig, fog: PT.fogT, rig: !!PT.r, lights: PT.lights.length, ty: PT.ty, d: PT.d } : null; }
  };

  VB.Doll = {
    rigs: rigs, LOOKS: LOOKS, EXPR: EXPR, POSES: POSES,
    /** Vestuario: lo que el muñeco sabe dibujar por ranura (id → sede 'A' | 'P' | 'Y') y los gorros que sustituyen al pelo. */
    ITEMS: ITEMS, HIDE_HAIR: HIDE_HAIR, HAT_CLASS: HAT_CLASS, HAIR_UNDER_CAP: HAIR_UNDER_CAP, HAIR_STYLES: HAIR_STYLES,
    /** Tobilleras que quedan bajo un calcetín que sube (WP4: ninguna; la tobillera va por fuera y el calcetín empieza encima). */
    UNDER_SOCK: {},
    /** Vestuario: firmas de lo que cambia la malla (geometría y color por vértice) y de lo que se pinta en el atlas. */
    geoSig: function (L, tc, beach) { return geoSig(L, tc || TEAMS[0], !!beach); },
    atlasSig: function (L, tc, num, beach) { return atlasSig(L, tc || TEAMS[0], num, !!beach); },
    /** Vista previa del Vestuario (ver arriba): start, set, pose, face, spin, yaw, turn, place, frame, frameSlot, flash, update, stop, active, info. */
    preview: preview,
    /** Retrato del muñeco (spec S2-B2B3 §3.1): key, draw, free, warm, stats (e info para pruebas). */
    portrait: portrait,
    /** Prueba del Vestuario en el navegador (spec §9): devuelve {ok, fails, items, today, worst, draws, preview, ms}. */
    lookSelfTest: lookSelfTest,
    squash: squash, stretchArm: stretchArm, reachTo: reachTo, headBob: headBob, setFaceOf: setFace,
    /** Dimensiones del muñeco (m), las que usa players.js para montar el esqueleto: longitudes, cabeza (centro y radios en el hueso
     *  de la cabeza), estirón máximo del brazo (STRETCH), alcance estirado (reach) y de reposo (reachRest), hombro, alto de pie (top). */
    dims: function () { return { HIP_H: HIP_H, HIP_W: HIP_W, THIGH: THIGH, SHIN: SHIN, ANKLE: ANKLE, SPINE_Y: SPINE_Y, CHEST_Y: CHEST_Y, SH_X: SH_X, SH_Y: SH_Y, SH_Z: SH_Z, NECK_Y: NECK_Y, UPPER: UPPER, FORE: FORE, PALM: PALM, HEAD_C: HEAD_C, HEAD_RX: HEAD_RX, HEAD_RY: HEAD_RY, HEAD_RZ: HEAD_RZ, HAND_K: HAND_K, FOOT_K: FOOT_K, TORSO_W: TORSO_W, STRETCH: STRETCH_MAX, reach: REACH, reachRest: REACH_REST, shoulder: SH_H, top: SH_H + HEAD_C + HEAD_RY }; },
    reach: reachInfo,
    boneLayout: boneLayout,
    /** JUEGO (players.js): geometría del nivel `lod` (0 baja, 1 media, 2 alta) para un rig con el esqueleto del muñeco (ver rigGeometry). */
    geometry: function (r, lod) { return rigGeometry(r, lod); },
    /** JUEGO (players.js): material con el atlas del jugador. tc = equipación de players (setKit / líbero), L = aspecto (la L del
     *  Vestuario, §2.2, o la vieja {skin, hair, style, acc}), num = dorsal, beach = playa, px = 1 | 2 (lienzo 512² | 1024²). */
    material: function (tc, L, num, beach, px) { if (!THREE) THREE = window.THREE; return dollMaterial(tc, L, num, beach, px); },
    /** JUEGO (players.js): celdas de ojos (0-7) y boca (0-7) de un material del muñeco (ver la hoja de caras). */
    faceCells: faceCells,
    /** Construye un muñeco (fuera de la escena de depuración: pruebas). L = {skin, hair, style, acc, team, num, beach?}. */
    build: function (L, idx) { if (!THREE) { THREE = window.THREE; ctx = VB.ctx; applyDims(BODY); } return buildRig(L, idx || 0); },
    /** Preset de cuerpo activo ('chibi' | 'v1') y nombres. */
    body: function () { return BODY; },
    bodies: function () { return Object.keys(BODIES); },
    /** Cambia el preset de cuerpo en caliente (rehace los muñecos de la escena con su mismo aspecto). */
    setBody: function (name) {
      if (!BODIES[name]) return false;
      applyDims(name);
      if (on) { for (var i = 0; i < rigs.length; i++) this.restyle(i, null, null); placeView(view); applyCamera(); }
      return BODY;
    },
    /** Arranca la escena de depuración (main.js, ?debug=doll). */
    start: function (c, g) {
      ctx = c; THREE = c.THREE; if (VB.C && VB.C.BR) BR = VB.C.BR; TMP = new THREE.Vector3();
      applyDims((ctx.params && ctx.params.body) || 'chibi');
      var Qp = ctx.params || {};
      DBG_BEACH = Qp.map === 'beach' || Qp.map === 'playa'; DBG_TC = null;
      if (Qp.scrim && VB.Players && VB.Players.setKit) {
        var csh = /^[0-9a-f]{6}$/i.test(Qp.shirt || '') ? parseInt(Qp.shirt, 16) : 0xd8262e;
        VB.Players.setKit({ kitShirt: csh, kitAccent: 0xffffff, kitShorts: 0x1b2b5a, scrim: Qp.scrim === 'club' ? { bib0: csh, bib1: VB.Players.BIB.b } : {} });
        DBG_TC = [VB.Players.kit(0), VB.Players.kit(1)];
      }
      if (group) { ctx.scene.remove(group); }
      group = new THREE.Group(); group.name = 'dolls'; ctx.scene.add(group); rigs.length = 0;
      for (var i = 0; i < LOOKS.length; i++) { var r = buildRig(LOOKS[i], i); rigs.push(r); group.add(r.root); }
      rigs[0].ball = makeBall(); rigs[0].root.add(rigs[0].ball);
      rigs[2].ball = makeBall(); rigs[2].root.add(rigs[2].ball);   // el balón del remate (lo mueve el bucle del estirón)
      hideGame();
      if (g) g.watch = true;   // sin galón ni halo del controlado
      // HUD fuera: solo el pabellón y los muñecos
      if (!styleEl) { styleEl = document.createElement('style'); styleEl.textContent = '#hud,#coach,#prompt,#banner,#callout,#guide,#touch,#touchbar,#offArrow,#stamp,#rally,#chal,#fps{display:none!important}'; document.head.appendChild(styleEl); }
      placeView((ctx.params && ctx.params.view) || 'fila');
      on = true; tAnim = 0;
      try { if (ctx.fixShadowDepth) ctx.fixShadowDepth(); } catch (e) { }
      var ri = reachInfo(), st = this.stats();
      console.info('[VB] doll (' + BODY + '): alcance ' + ri.doll + ' m (atleta ' + ri.athlete + '), hombro ' + ri.shoulder + ', cabeza ' + ri.head + ' m hasta ' + ri.headTop + ' m (' + ri.heads + ' cabezas); triángulos alta/media/baja ' + st.tris.join('/') + ', dibujos ' + st.draws);
    },
    /** Cada frame (main.js, solo en ?debug=doll, después de la cámara): animación de la maqueta y cámara fija. */
    update: function (g, dt) {
      if (!on) return;
      dt = Math.min(0.05, dt || 0); tAnim += dt;
      // nivel de detalle según la calidad activa (la maqueta no está en la lista de módulos de main.js: se mira aquí)
      var rk = ctx.quality && ctx.quality.rank != null ? ctx.quality.rank : 2; if (rk !== lodNow) { lodNow = rk; this.setLod(rk); }
      for (var i = 0; i < rigs.length; i++) { var r = rigs[i]; if (!r.root.visible) continue; animate(r, r.tFix >= 0 ? r.tFix : tAnim + r.t0); blink(r, dt); }
      for (var h = 0; h < hidden.length; h++) hidden[h].visible = false;
      applyCamera();
    },
    /** Cambia la vista: 'fila' | 'poses' | 'cara' | 'cuerpo'. */
    view: function (name) { if (!on) return false; placeView(name); applyCamera(); return view; },
    /** Expresión de un muñeco (0-3): neutra | concentrado | esfuerzo | grito | alegria | pena | sorpresa | lengua. */
    setFace: function (i, name) { var r = rigs[i]; if (!r) return false; setFace(r, name); return r.face; },
    /** Pose de un muñeco: idle | recv | spike | cel | stand. */
    setPose: function (i, name) { var r = rigs[i]; if (!r || !POSES[name]) return false; r.pose = name; return true; },
    /** Capturas reproducibles: congela el bucle de cada muñeco en un instante (s) — {idx: t}; t < 0 = vuelve a correr.
     *  Remate: el golpe está en t = 0,8 (ciclo de 1,9 s); celebración: en el aire en t = 0,38 (ciclo de 1,1 s). */
    freeze: function (map) { for (var k in map) if (rigs[k]) { rigs[k].tFix = map[k]; rigs[k].blinkOn = 0; } return true; },
    /** Rehace un muñeco con otro peinado / complemento (pruebas). Para probar otras ranuras del Vestuario: rigs[i].look = L nueva y
     *  restyle(i) (o VB.Doll.preview, que es la vista previa de verdad). */
    restyle: function (i, style, acc) {
      var r = rigs[i]; if (!r) return false;
      var L = Object.assign({}, r.look); if (style) L.style = style; if (acc != null) L.acc = acc;
      if (r.ball && r.ball.parent === r.root) r.root.remove(r.ball);
      var n = buildRig(L, i); n.pose = r.pose; n.ball = r.ball; n.tFix = r.tFix; if (r.ball) n.root.add(r.ball);
      n.root.position.copy(r.root.position); n.root.rotation.copy(r.root.rotation); setFace(n, r.face);
      freeRig(r);   // fuera de la escena y de la GPU (atlas, material, mallas, huesos y contorno)
      group.add(n.root); rigs[i] = n; return true;
    },
    /** Nivel de detalle de todos (0 baja, 1 media, 2 alta). */
    setLod: function (lod) { for (var i = 0; i < rigs.length; i++) setLod(rigs[i], lod); return lod; },
    setQuality: function (q) { var rk = q && q.rank != null ? q.rank : 2; if (on) this.setLod(rk); },
    /** Triángulos por nivel (muñeco 0) y dibujos por muñeco (piel + tinta + sombra). */
    stats: function () {
      var r = rigs[0]; if (!r) return null;
      var tris = [0, 1, 2].map(function (l) { return triCount(rigGeometry(r, l)); });
      return { tris: tris, draws: 1 + (r.ink ? 1 : 0) + 1, reach: reachInfo() };
    },
    active: function () { return on; }
  };
})();
