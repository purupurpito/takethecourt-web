/* MAKE THE CUT — js/career.js (owner: ui_main)
 * Modo Carrera 2v2 de VÓLEY PLAYA: datos y lógica, sin DOM ni Three (se carga también en node: tools/careertest.js).
 *
 * Tu jugador es un atleta de VB.Prog (st, lvl, xp, pts, bp/bd/beq de VB.Badges) con su propio guardado ('make-the-cut.career').
 * Empiezas en un club modesto del circuito más bajo; el club te pone pareja. 5 circuitos de 8 clubes de vóley playa (inventados),
 * temporada = liga a doble vuelta (14 jornadas) + open de los 4 primeros (semifinales 1-4 y 2-3, final). Cada jornada juegas tu
 * partido de verdad en la arena (main.js lo arranca con matchSetup: reglas de playa, sets a 21 y el 3r a 15, pista 16×8) o lo
 * simulas; el resto se simula (quickSim). Nota del partido 1-10, objetivo del club, confianza del entrenador, ofertas (mitad y
 * final de temporada), ascensos y descensos. Diseño y calibrado en notes/carrera.md.
 *
 * Sprint playa (10-nov-2026, v3): la Carrera pasa del pabellón a la playa (venue 'beach' en matchSetup; quickSim a 21/15); los
 * clubes son de vóley playa (nombres, sede en una playa inventada; migrate() renombra los de los guardados v1/v2 sin tocar
 * resultados); el compañero tiene una media propia con horquilla ancha respecto al club (MATE_OFF: −9..+5, media −2, antes
 * siempre club + 3: nerf medido en notes/carrera.md), rol que se nota, puntos fuertes y flojos (mateProfile) y forma (m.form).
 *
 * API principal (VB.Career):
 *   exists(), get(), create(o), abandon(), save()
 *   next(c)            → próximo partido tuyo {kind, label, week, round, me, rival, home, away, ovrMe, ovrRival, diff} o null
 *   matchSetup(c)      → opciones para Sim.createGame + equipación (main.js)
 *   ingest(evs, g)     → cuenta tus estadísticas durante el partido (main.js, cada frame de un partido de Carrera)
 *   matchDone(r, st, g)→ cierra tu partido jugado (r = {sets, setScores, win}); devuelve el resumen (también en c.last)
 *   simulateNext(c)    → simula tu partido; devuelve el resumen
 *   table(c, lvl)      → clasificación;  bump(k) / toggleBadge(id) → mejoras del jugador
 *   acceptOffer(i, años), stay(años) → fin de temporada (o fichaje en la ventana de mitad de temporada)
 *   setDifficulty(k)   → cambia la dificultad de la Carrera entre partidos ('ok' | 'same' | 'bad' | 'match' | '')
 *   rivalAI(c, k)      → IA rival efectiva del club k en la dificultad de la Carrera {step, base, diff, soft, name}
 *
 * Dificultad de la Carrera (12-nov-2026): c.diff (easy/normal/hard/expert, Normal por defecto = la Carrera de siempre), tabla
 * CDIFF con todas las palancas (IA rival, atributos de los rivales, experiencia, entreno, entrenador, objetivo, ofertas) y c.dUse
 * (partidos de la temporada en cada nivel: el historial y el palmarés guardan la más fácil). notes/carrera.md §Dificultad.
 *
 * Gestión propia (v2, 10-nov-2026; notes/carrera.md §Gestión):
 *   - Inicio: tras crear el jugador NO hay club (phase 'pick'): llegan 3-4 ofertas del Circuito Regional (y quizá una prueba en el
 *     Nacional). acceptOffer(i, años) elige; rejectAll() trae ofertas peores; moreTime() (una vez) cambia una oferta por otra.
 *   - setTraining(k) enfoque semanal (bal/phys/def/atk/rest → mejoras gratis en ese grupo de atributos o descanso de la fatiga).
 *   - requestTransfer(on) declararte transferible; negotiate(i) pedir más rol en una oferta; stay(años) renueva si toca.
 *   - changeMate(i) cambiar de compañero entre los de la plantilla (c.squad); química con el compañero (c.mate.chem).
 *   - Bandeja de mensajes c.inbox (entrenador, ofertas, objetivos): readMsg(id), readAll(), unread(c).
 *   - En la Carrera solo controlas a tu jugador (ctrl siempre 'one'; los guardados con 'both' se migran).
 * Mundo de la Carrera (career-world.js, sprint 5): mentor, noticias y clubes (life() reparte el gancho; 'join' al final de joinClub).
 */
(function () {
  'use strict';
  /** Ordinal corto (estilo de Ferran): 1r, 2º, 3r, 4º… Nunca «1.er». */
  function ordn(n) { return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.career', VER = 3;   // v1 → v2: gestión (inicio sin club, contrato, entrenamiento, plantilla, bandeja); v2 → v3: playa; migrate()
  var KEYS = ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];
  var WEEKS = 14, MID_WEEK = 7, CLUBS_PER = 8;
  // vóley playa: todos los partidos de la Carrera (jugados y simulados) se juegan en la arena con sus reglas (sim: createGame({venue}))
  var VENUE = 'beach', PTS = VB.BEACH && VB.BEACH.points || 21, PTS3 = VB.BEACH && VB.BEACH.points3 || 15;

  // ------------------------------------------------------------------ ligas
  // ovr = media de atributos de los rivales [peor club, mejor club]; diff = perfil de la IA rival más habitual en la liga (el de
  // cada club sale de su media: difficultyFor / DIFF_AT).
  // xp = multiplicador de la experiencia. ref = error arbitral y challenge (tabla del TRASPASO; sim la aplica con createGame({ref}): g.refErr y g.chalPerSet).
  // Calibrado con la sim en autopilot (notes/carrera.md §Calibrado).
  var REF = {
    low: { p1: 0.55, p2: 0.40, p3: 0.22, d3: 0.25, chal: 0, judges: false, name: 'Error arbitral alto, sin challenge' },
    mid: { p1: 0.45, p2: 0.25, p3: 0.12, d3: 0.15, chal: 0, judges: false, name: 'Error arbitral medio, sin challenge' },
    high: { p1: 0.20, p2: 0.08, p3: 0.02, d3: 0.10, chal: 0, judges: true, name: 'Jueces de línea, sin challenge' },
    top: { p1: 0.20, p2: 0.08, p3: 0.02, d3: 0.10, chal: 2, judges: true, name: 'Jueces de línea y challenge' }
  };
  // Circuitos de vóley playa (sprint playa: antes «Liga Regional»… «Circuito Mundial»; los guardados viejos conservan en el
  // historial y el palmarés los nombres de entonces). La copa de los 4 primeros es el «Open» del circuito.
  var LEAGUES = [
    { lvl: 0, name: 'Circuito Regional', art: 'el', short: 'Regional', cup: 'Open Regional', diff: 'easy', ovr: [28, 40], xp: 1, ref: 'low' },
    { lvl: 1, name: 'Circuito Nacional', art: 'el', short: 'Nacional', cup: 'Open Nacional', diff: 'normal', ovr: [38, 50], xp: 1.5, ref: 'mid' },
    { lvl: 2, name: 'Hiperliga de Playa', art: 'la', short: 'Hiperliga', cup: 'Open de la Hiperliga', diff: 'normal', ovr: [48, 61], xp: 2.1, ref: 'mid' },
    { lvl: 3, name: 'Circuito Continental', art: 'el', short: 'Continental', cup: 'Open Continental', diff: 'hard', ovr: [58, 71], xp: 2.8, ref: 'high' },
    { lvl: 4, name: 'Circuito Mundial', art: 'el', short: 'Mundial', cup: 'Final a Cuatro Mundial', diff: 'hard', ovr: [68, 84], xp: 3.6, ref: 'top' }
  ];
  /** «el Circuito Regional» / «la Hiperliga de Playa» (art = artículo); toL: «al Circuito…» / «a la Hiperliga…». */
  function lname(L) { return L.art + ' ' + L.name; }
  function toL(L) { return (L.art === 'el' ? 'al ' : 'a la ') + L.name; }
  var POINTS = [PTS];   // (v1/v2 elegían 11/15/21/25; en la playa siempre a 21 y el 3r a 15)

  // ------------------------------------------------------------------ roles (desviaciones sobre la media; suman 0)
  // (vóley playa: la pareja es bloqueador + defensor; las claves atk/cr/uni se conservan en los guardados)
  var ROLES = {
    atk: { name: 'Bloqueador', hint: 'Remate, salto y bloqueo en la red', off: { jump: 6, speed: 0, react: 0, recv: -7, dig: -4, set: -10, spike: 7, ctl: 3, block: 4, serve: 1 } },
    uni: { name: 'Universal', hint: 'Un poco de todo', off: { jump: 1, speed: 2, react: 2, recv: 1, dig: 1, set: 0, spike: -1, ctl: -2, block: -3, serve: -1 } },
    cr: { name: 'Defensor', hint: 'Recepción, colocación y defensa en la arena', off: { jump: -5, speed: 1, react: 2, recv: 7, dig: 4, set: 9, spike: -8, ctl: 1, block: -7, serve: -4 } }
  };
  var MATE_ROLE = { atk: 'cr', cr: 'atk', uni: 'uni' };
  // Carrera de pista (6v6, lote C): puestos del 6v6 con su perfil (claves de sim.js: OH receptor, S colocador, OPP opuesto, MB central,
  // L líbero). genSt los entiende igual que los roles de playa (la playa nunca los pide: su 2v2 no cambia).
  var POS6 = {
    OH: { name: 'Receptor', hint: 'Recibe, defiende y remata por la izquierda', off: { jump: 3, speed: 0, react: 0, recv: 4, dig: 2, set: -9, spike: 4, ctl: 0, block: -4, serve: 0 } },
    S: { name: 'Colocador', hint: 'El segundo toque: reparte el juego', off: { jump: -2, speed: 2, react: 3, recv: -3, dig: 1, set: 10, spike: -7, ctl: 4, block: -4, serve: -4 } },
    OPP: { name: 'Opuesto', hint: 'Remate por la derecha y bloqueo', off: { jump: 5, speed: -1, react: 0, recv: -8, dig: -3, set: -6, spike: 8, ctl: 2, block: 3, serve: 0 } },
    MB: { name: 'Central', hint: 'Bloqueo y primer tiempo en el centro', off: { jump: 7, speed: -3, react: 3, recv: -9, dig: -6, set: -5, spike: 4, ctl: 0, block: 9, serve: 0 } },
    L: { name: 'Líbero', hint: 'Recepción y defensa, solo atrás', off: { jump: -8, speed: 4, react: 5, recv: 9, dig: 9, set: 2, spike: -10, ctl: 2, block: -10, serve: -3 } }
  };
  var START_OVR = 35;
  // Compañero: media = media del club + un desvío propio con horquilla ancha (MATE_OFF: −9..+5, media −2; reparto casi plano entre −6
  // y +1 con colas hasta los extremos: desviación 3,2, un 26 % de compañeros a ≤ −5 y un 9 % a ≥ +3). Antes era
  // siempre club + 3 y en el Circuito Nacional el compañero IA hacía más puntos que un jugador medio (16,6 contra 15,5 por
  // partido con el bot «medio» de simtest; con media −2: ~14,5 contra 15,4; medido en notes/carrera.md §Compañero). El club lo
  // renueva en verano si se queda a MATE_RENEW o más por debajo de la media del club.
  var MATE_OFF = [-9, 5], MATE_RENEW = 7;
  function mateOff(r) { return clampI(MATE_OFF[0] + (0.25 * r() + 0.75 * r()) * (MATE_OFF[1] - MATE_OFF[0]), MATE_OFF[0], MATE_OFF[1]); }
  // forma del compañero (−3..+3): paseo aleatorio tras cada partido tuyo, con vuelta hacia 0; suma a todos sus atributos en el
  // partido (matchSetup) y FORM_SIM × forma a la fuerza de la pareja en la simulación rápida
  var FORM_MAX = 3, FORM_SIM = 0.4;
  var FORM_TXT = ['Hundido', 'Flojo', 'Algo bajo', 'Normal', 'Bien', 'En racha', 'Imparable'];   // índice forma + 3

  // ------------------------------------------------------------------ gestión (v2)
  // Enfoque de entrenamiento semanal: cada partido (jugado o simulado) suma progreso al grupo; cada TRAIN_NEED de progreso sube
  // gratis el atributo más bajo del grupo. La fatiga sube con el entrenamiento y baja descansando; por encima de FAT_FREE resta
  // atributos en el partido (matchSetup) y fuerza en la simulación (teamOvr). Grupos = los de VB.Prog.GROUPS.
  // Integración (10-nov-2026, revisión de la Carrera): Equilibrado ya no cansa (con +4 por partido y sin recuperación hundía al
  // jugador para siempre: −4 permanente desde la 2ª temporada); los enfoques dan algo más (60) para que compense la fatiga, y en
  // verano la fatiga vuelve a 0 (newSeason).
  var TRAIN = {
    bal: { name: 'Equilibrado', hint: 'Un poco de todo, sin fatiga', prog: { phys: 15, def: 15, atk: 15 }, fat: 0 },
    phys: { name: 'Físico', hint: 'Salto, velocidad y reacción (cansa)', prog: { phys: 60 }, fat: 12 },
    def: { name: 'Defensa', hint: 'Recepción, defensa y bloqueo (cansa)', prog: { def: 60 }, fat: 12 },
    atk: { name: 'Ataque', hint: 'Colocación, potencia, control y saque (cansa)', prog: { atk: 60 }, fat: 12 },
    rest: { name: 'Descanso', hint: 'Sin progreso; recupera la fatiga', prog: {}, fat: -35 }
  };
  // estilo del club: sus entrenamientos suman STYLE_PROG de progreso por semana a un grupo (siempre, sea cual sea tu enfoque)
  var STYLE_TRAIN = { 'Ofensivo': 'atk', 'Defensivo': 'def', 'Saque y bloqueo': 'def', 'Juego rápido': 'phys', 'Equilibrado': '' }, STYLE_PROG = 6;
  var EARLY_COACH = 10;   // fichar por otro club con contrato en vigor (y sin ser transferible): el entrenador nuevo empieza con 10 menos
  var NEG_COACH = 8;      // negociación rechazada: si firmas igualmente, el entrenador empieza con 8 menos
  var TRAIN_KEYS = ['bal', 'phys', 'def', 'atk', 'rest'];
  var TGROUP = { phys: ['jump', 'speed', 'react'], def: ['recv', 'dig', 'block'], atk: ['set', 'spike', 'ctl', 'serve'] };
  var TRAIN_NEED = 100, FAT_FREE = 40;
  // química con el compañero (0-100): sube jugando juntos; da +0..3 en reacción, colocación y recepción a los dos (matchSetup)
  var CHEM_KEYS = ['react', 'set', 'recv'];
  var STYLES = ['Ofensivo', 'Defensivo', 'Equilibrado', 'Saque y bloqueo', 'Juego rápido'];
  var MATE_STYLES = { atk: ['Rematador potente', 'Saltador', 'Muro en la red'], cr: ['Colocador fino', 'Pulpo en la arena', 'Receptor seguro'], uni: ['Todoterreno', 'Jugador listo', 'Sacador'] };
  var ROLE_LV = ['Rotación', 'Titular', 'Titular indiscutible'];
  var ROLE_COACH = [45, 55, 65];   // confianza inicial del entrenador según el rol firmado
  var SALARY = [600, 1500, 4000, 9000, 20000];   // € al mes (ficticio) por liga, × nivel del club × rol

  // ------------------------------------------------------------------ nombres (inventados)
  var CITIES = [
    // nivel 0-2 (de casa)
    'Rocaverde', 'Puertoluz', 'Valdesol', 'Miraflor', 'Castelnube', 'Brisamar', 'Peñaclara', 'Arenalta',
    'Fuenteviva', 'Lomablanca', 'Riosereno', 'Campoalto', 'Salinera', 'Montecielo', 'Villaduna', 'Calarrosa',
    'Pinarejo', 'Torremar', 'Olivarda', 'Cuestaluna', 'Vegaclara', 'Sotoazul', 'Maresia', 'Altobrío',
    // nivel 3-4 (de fuera)
    'Brennvik', 'Solmara', 'Kastelheim', 'Ardenza', 'Velmora', 'Quintavalle', 'Marisport', 'Duneholm',
    'Altavera', 'Rivenza', 'Lunaport', 'Sankora', 'Teravento', 'Ombralia', 'Nevaro', 'Calyra'
  ];
  // clubes de vóley playa: «CV Platja Rocaverde», «Arena Puertoluz Sud», «Dunes Brisamar»… y su sede, una playa inventada
  // («Cala Rocaverde», «Platja de Puertoluz»). abbr() quita los prefijos (y los de los nombres de antes, por el historial)
  var PREFIX = ['CV Platja', 'Arena', 'Platja', 'Club Platja', 'Vóley Playa', 'Beach Vòlei', 'Sorra', 'Dunes', 'Litoral', 'Costa'];
  var SUFFIX = ['', '', '', ' Sud', ' Nord', ' Marina', ' Beach', ' Sand', ' 1998', ' Dunes'];
  var BEACHES = ['Cala {c}', 'Platja de {c}', 'Playa de {c}', 'Arenal de {c}', 'Platja Gran de {c}', 'Dunas de {c}', 'Cala Fonda de {c}', 'Playa Larga de {c}', 'Platja dels Pins de {c}', 'Caló de {c}'];
  var FIRST = ['Álex', 'Nico', 'Dani', 'Iker', 'Marc', 'Pablo', 'Leo', 'Hugo', 'Unai', 'Bruno', 'Raúl', 'Joel', 'Sergi', 'Ander', 'Rubén', 'Teo',
    'Lucas', 'Gael', 'Mateo', 'Íñigo', 'Pau', 'Óscar', 'Jon', 'Adri', 'Lars', 'Mikko', 'Tomás', 'Elio', 'Bastian', 'Kai'];
  var LAST = ['Arnedo', 'Vallés', 'Cortina', 'Molinar', 'Serrat', 'Ibarra', 'Quiles', 'Lasierra', 'Ferrán', 'Robledo', 'Almagro', 'Urquiza',
    'Sotelo', 'Pardiñas', 'Ocaña', 'Villar', 'Brandt', 'Lindqvist', 'Moretti', 'Kovač', 'Ferreira', 'Dubois', 'Halvorsen', 'Novák', 'Aranda', 'Belmonte'];
  // equipaciones con los valores del menú Ajustes · Equipación (players.js setKit los entiende igual)
  var SHIRTS = [0xff5a2c, 0xd8262e, 0xf2c230, 0x1f9a4a, 0x32b5e8, 0x7b3fd1, 0x22252c, 0xf2f4f8];
  var ACCENTS = [0xffb238, 0xffffff, 0x1a1c22, 0xd9a520, 0x8fd3ff, 0xff4040];
  var SHORTS = [0x191b22, 0xeceef2, 0x18244a, 0xb3161d, 0x5a606b];
  var PATTERNS = ['diag', 'liso', 'franjas', 'rayas'];

  // ------------------------------------------------------------------ utilidades
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampI(v, a, b) { v = Math.round(+v); return isFinite(v) ? clamp(v, a, b) : a; }
  function rng(seed) {   // mulberry32
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash() { var h = 2166136261; for (var i = 0; i < arguments.length; i++) { var s = String(arguments[i]); for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619); } h ^= 124; } return h >>> 0; }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function shuffle(r, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function P() { return VB.Prog || null; }
  function B() { return VB.Badges || null; }
  function ovrOf(st) { var s = 0; for (var i = 0; i < KEYS.length; i++) s += st[KEYS[i]]; return Math.round(s / KEYS.length); }
  function costOf(v) { var p = P(); return p && p.cost ? p.cost(v) : (v < 60 ? 1 : v < 70 ? 2 : v < 85 ? 3 : 4); }
  function round1(v) { return Math.round(v * 10) / 10; }

  /** Atributos de un jugador de media o y rol role (ruido determinista con r). La media sale exacta (±0,5). */
  function genSt(o, role, r) {
    var off = (ROLES[role] || POS6[role] || ROLES.uni).off, st = {}, k, sum = 0;
    var sc = clamp(0.7 + o / 100, 0.8, 1.5);   // los buenos están más especializados
    for (k = 0; k < KEYS.length; k++) { var key = KEYS[k]; st[key] = o + off[key] * sc + (r ? (r() - 0.5) * 6 : 0); sum += st[key]; }
    var d = o - sum / KEYS.length;
    for (k = 0; k < KEYS.length; k++) st[KEYS[k]] = clampI(st[KEYS[k]] + d, 1, 99);
    return st;
  }

  // ------------------------------------------------------------------ progresión propia de la Carrera
  // La experiencia de la Carrera es más generosa que la de Partido rápido (la temporada tiene 16-17 partidos y hay que llegar
  // a la élite en ~6-8 temporadas): ver notes/carrera.md §Progresión.
  var PTS_LVL = 4;
  function need(lvl) { return 140 + 6 * lvl; }
  // XP_K (15-nov-2026, Ferran: «tras terminar un partido ganas demasiada EXP, teniendo en cuenta que tus stats pueden ir subiendo con
  // los entrenamientos también»): × la XP de cada partido y de cada reto de jornada. Playa 0,6: jugando, la élite (~70) llega hacia la
  // 7ª-8ª temporada (con 1 era la 4ª-5ª, ~3 niveles y 12 puntos por partido); pista 0,8 (su ritmo ya era más lento: suplencias y
  // ligas de 50 a 95). Medido con 3 sesiones rápidas por jornada y la mejor oferta (notes/carrera.md §Progresión).
  var XP_K = 0.6, XP_K6 = 0.8;
  function addXP(a, xp) {
    var up = 0;
    a.xp += xp; a.matches = (a.matches | 0) + 1;
    while (a.xp >= need(a.lvl)) { a.xp -= need(a.lvl); a.lvl++; up++; a.pts += PTS_LVL; }
    return { xp: xp, lvlUp: up, pts: up * PTS_LVL, lvl: a.lvl };
  }

  // ------------------------------------------------------------------ almacenamiento
  var cur = null;
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function save(c) {
    c = c || cur; if (!c) return false;
    try { var s = store(); if (!s) return false; s.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
  }
  var lost = false;   // había una carrera guardada que no se ha podido recuperar (copia en KEY + '.bak'); la UI lo avisa
  function load() {
    if (cur) return cur;
    var o = null, raw = null, s = null;
    try { s = store(); raw = s ? s.getItem(KEY) : null; o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    cur = sane(o);
    if (!cur && raw) {
      lost = true;
      try { if (s) { s.setItem(KEY + '.bak', raw); s.removeItem(KEY); } } catch (e) { }
    }
    return cur;
  }
  function sane(o) {
    if (!o || typeof o !== 'object' || [1, 2, VER].indexOf(o.v) < 0 || !o.player || typeof o.player !== 'object' || !Array.isArray(o.clubs) || !o.clubs.length) return null;
    var p = P();
    if (p && p.saneAthlete) {
      var d = p.newAthlete({ num: o.player.num, role: o.player.role, name: o.player.name });
      o.player = (function (src, dst) { p.saneAthlete(src, dst); dst.roleKey = ROLES[src.roleKey] ? src.roleKey : 'uni'; dst.age = clampI(src.age, 15, 60); return dst; })(o.player, d);
    }
    o.player.roleKey = ROLES[o.player.roleKey] ? o.player.roleKey : 'uni'; o.player.role = ROLES[o.player.roleKey].name;   // (v3: «Bloqueador» / «Defensor»)
    o.points = PTS;   // vóley playa: sets a 21 (los guardados v1/v2 elegían 11-25)
    o.ctrl = 'one';   // en la Carrera solo se controla a tu jugador (los guardados con 'both' se migran)
    try { o = saneDeep(o); return o ? migrate(o) : null; } catch (e) { return null; }
  }
  /** v1 → v2 y huecos de la gestión: contrato, plantilla, química, entrenamiento, fatiga, bandeja. No toca el progreso (un jugador
   *  que ya estaba en un club sigue en él: no se le obliga a elegir de nuevo). Idempotente (se aplica también a guardados v2). */
  function migrate(o) {
    var num = function (v) { return typeof v === 'number' && isFinite(v); }, v0 = o.v | 0, old = v0 < 2, oldBeach = v0 < 3;
    o.v = VER;
    if (!Array.isArray(o.inbox)) o.inbox = [];
    // v2 → v3 (sprint playa): los clubes pasan a ser de vóley playa (nombre, abreviatura y sede nuevos; ids, nivel, nivel q,
    // equipación, calendario y resultados intactos: lo jugado se queda), los roles se llaman Bloqueador / Defensor y a partir de
    // ahora se juega en la arena a 21. El historial y el palmarés cambian el nombre del club (mismo club) y el mensaje lo cuenta
    if (oldBeach) { beachify(o); msg(o, 'club', 'La Carrera se muda a la playa', 'Desde ahora todos los partidos se juegan en la arena de Platja Llarga con reglas de vóley playa: pista de 16 × 8, sets a ' + PTS + ' y el tercero a ' + PTS3 + ', cambio de campo cada 7 puntos. Los clubes son de vóley playa (los tuyos, con otro nombre pero la misma plantilla y los mismos resultados) y las parejas son bloqueador y defensor. Los partidos ya jugados se quedan como estaban.'); }
    beachTrophies(o);
    var fixRole = function (m) { if (m && m.st) { m.roleKey = ROLES[m.roleKey] ? m.roleKey : 'uni'; m.role = ROLES[m.roleKey].name; if (!num(m.form)) m.form = 0; } };
    fixRole(o.mate); (Array.isArray(o.squad) ? o.squad : []).forEach(fixRole); (Array.isArray(o.offers) ? o.offers : []).forEach(function (x) { if (x) fixRole(x.mateP); });
    o.inbox = o.inbox.filter(function (m) { return m && typeof m.t === 'string'; }).slice(-INBOX_MAX);
    o.msgN = num(o.msgN) ? o.msgN | 0 : o.inbox.reduce(function (s, m) { return Math.max(s, (m.id | 0) + 1); }, 0);
    if (TRAIN_KEYS.indexOf(o.train) < 0) o.train = 'bal';
    if (!o.tp || typeof o.tp !== 'object') o.tp = {};
    ['phys', 'def', 'atk'].forEach(function (g) { o.tp[g] = num(o.tp[g]) ? clamp(o.tp[g], 0, TRAIN_NEED - 1) : 0; });
    o.fatigue = num(o.fatigue) ? clamp(Math.round(o.fatigue), 0, 100) : 0;
    o.listed = !!o.listed;
    o.money = num(o.money) ? Math.max(0, Math.round(o.money)) : 0;   // (11-nov-2026: el sueldo se cobra y se ahorra)
    // dificultad de la Carrera (12-nov-2026): lo que falta es Normal (la Carrera de antes). Idempotente
    if (CDIFF_KEYS.indexOf(o.diff) < 0) o.diff = 'normal';
    var hadUse = !!o.dUse && typeof o.dUse === 'object';
    if (!hadUse) o.dUse = {};
    CDIFF_KEYS.forEach(function (k) { o.dUse[k] = num(o.dUse[k]) ? Math.max(0, o.dUse[k] | 0) : 0; });
    if (!hadUse && o.stats && num(o.stats.played)) o.dUse.normal = Math.max(0, (o.stats.played | 0) + (num(o.stats.bench) ? o.stats.bench | 0 : 0));   // lo jugado esta temporada (y los banquillos) fue en Normal
    if (o.coachD != null && CDIFF_KEYS.indexOf(o.coachD) < 0) delete o.coachD;
    // objetivo sin sello (guardados de antes): el nivel más fácil con partidos esta temporada o, si no hay, el actual
    if (o.objective && typeof o.objective === 'object' && CDIFF_KEYS.indexOf(o.objective.d) < 0) o.objective.d = lowUse(o.dUse) || o.diff;
    (Array.isArray(o.history) ? o.history : []).forEach(function (h) { if (h && typeof h === 'object') { if (CDIFF_KEYS.indexOf(h.d) < 0) h.d = 'normal'; h.dm = !!h.dm; } });
    (Array.isArray(o.trophies) ? o.trophies : []).forEach(function (t) { if (t && typeof t === 'object' && CDIFF_KEYS.indexOf(t.d) < 0) t.d = 'normal'; });
    if (o.review && typeof o.review === 'object') {
      // resumen sin sello (o rehecho por saneDeep): el de esa temporada en el historial; si no, el de dUse (si venía guardado); si no, Normal
      if (CDIFF_KEYS.indexOf(o.review.d) < 0) {
        var hs = (Array.isArray(o.history) ? o.history : []).filter(function (h) { return h && typeof h === 'object' && h.season === o.review.season; }).pop();
        var sd0 = hs ? { d: hs.d, dm: hs.dm } : hadUse ? seasonDiff(o) : { d: 'normal', dm: false };
        o.review.d = sd0.d; o.review.dm = sd0.dm;
      }
      o.review.dm = !!o.review.dm;
    }
    sessSane(o);   // sesiones de entrenamiento (13-nov-2026): un guardado sin c.ts lo crea vacío (sin subir VER)
    if (o.phase === 'pick') return o;   // aún sin club: el resto llega al firmar
    if (num(o.mate.chem)) o.mate.chem = clamp(Math.round(o.mate.chem), 0, 100);
    else o.mate.chem = old ? clamp((o.stats && o.stats.played | 0) * 4, 0, 60) : 0;   // los que ya jugaban juntos no empiezan de cero
    if (typeof o.mate.style !== 'string') o.mate.style = mateStyle(o.mate, rng(hash(o.seed, 'mstyle', o.mate.name)));
    if (!Array.isArray(o.squad) || !o.squad.every(function (m) { return m && m.st && typeof m.name === 'string'; })) o.squad = genSquad(o, myClub(o), o.mate, rng(hash(o.seed, 'squad', o.season, o.myClub)));
    o.squad.forEach(function (m) { KEYS.forEach(function (k) { m.st[k] = clampI(m.st[k], 1, 99); }); m.chem = num(m.chem) ? clamp(m.chem, 0, 100) : 0; if (typeof m.style !== 'string') m.style = mateStyle(m, rng(1)); });
    var ct = o.contract;
    if (!ct || typeof ct !== 'object' || !num(ct.left) || !num(ct.years) || ROLE_LV.indexOf(ct.role) < 0) {
      var k = myClub(o), rl = o.coach >= 70 ? 2 : o.coach >= 45 ? 1 : 0;
      o.contract = { club: k.id, years: 2, left: 2, role: ROLE_LV[rl], salary: salaryOf(k.lvl, k.q, rl), since: o.season };
    } else { ct.left = clampI(ct.left, 0, 5); ct.years = clampI(ct.years, 1, 5); ct.club = o.myClub; if (!num(ct.salary)) ct.salary = salaryOf(myClub(o).lvl, myClub(o).q, ROLE_LV.indexOf(ct.role)); }
    if (old) msg(o, 'club', 'Novedades en la Carrera', 'Ahora puedes elegir el enfoque del entrenamiento semanal, cambiar de compañero entre los de la plantilla, pedir el traspaso y negociar las ofertas. Tu química con ' + o.mate.name + ' ya cuenta lo que habéis jugado juntos. En la Carrera solo controlas a tu jugador.');
    return o;
  }
  /** Repara lo reparable de un guardado tocado o a medias (antes solo se miraba el primer nivel y un `sched` o un `myClub` malos
   *  dejaban el hub vacío, con errores, o atascado sin partido). Lo irreparable (clubes) → null (y copia en KEY + '.bak'). */
  function saneDeep(o) {
    var arr = Array.isArray, num = function (v) { return typeof v === 'number' && isFinite(v); };
    // clubes: id, nivel, q y equipación válidos; 8 por liga
    var okClub = function (k) { return k && num(k.id) && num(k.lvl) && k.lvl >= 0 && k.lvl < LEAGUES.length && num(k.q) && typeof k.name === 'string' && k.kit && typeof k.kit === 'object'; };
    if (!o.clubs.every(okClub)) return null;
    for (var L = 0; L < LEAGUES.length; L++) if (clubsOf(o, L).length !== CLUBS_PER) return null;
    o.clubs.forEach(function (k) { k.q = clamp(k.q, 0.02, 0.98); if (typeof k.short !== 'string') k.short = abbr(k.name); if (typeof k.city !== 'string') k.city = ''; if (typeof k.beach !== 'string') k.beach = beachOf(k.city || k.name, rng(hash(o.seed, 'sede', k.id))); });
    o.seed = num(o.seed) ? o.seed >>> 0 : hash('reparado', o.created || 0);
    o.season = clampI(o.season, 1, 999);
    trialSaneT(o);   // prueba de mitad o fin de temporada (c.tst; 17-nov-2026)
    if (o.phase === 'pick') {   // aún eligiendo el primer club (v2): ofertas de inicio válidas o nuevas
      o.myClub = -1; o.mate = null; o.window = 'start';
      if (!o.pick || typeof o.pick !== 'object') o.pick = { round: 0, more: false };
      o.pick.round = clampI(o.pick.round, 0, 9); o.pick.more = !!o.pick.more;
      if (!arr(o.offers) || !o.offers.length || !o.offers.every(function (x) { var k = x && club(o, x.club); return k && k.lvl <= 1 && x.mateP && x.mateP.st; })) o.offers = genStartOffers(o, o.pick.round);
      trialSane(o);
      ['notes', 'history', 'trophies'].forEach(function (k) { if (!arr(o[k])) o[k] = []; });
      if (!o.stats || typeof o.stats !== 'object') o.stats = newSeasonStats();
      if (!o.career || typeof o.career !== 'object') o.career = newSeasonStats();
      if (!arr(o.sched) || o.sched.length !== LEAGUES.length) genSchedule(o);
      if (!arr(o.res) || o.res.length !== LEAGUES.length) o.res = LEAGUES.map(function () { return []; });
      o.coach = 50; o.week = 0; o.last = null; o.cup = null;
      return o;
    }
    if (!myClub(o)) return null;
    // compañero
    if (!o.mate || typeof o.mate !== 'object' || !o.mate.st || typeof o.mate.st !== 'object') o.mate = newMate(o, myClub(o), rng(hash(o.seed, 'mate', o.season)));
    KEYS.forEach(function (k) { o.mate.st[k] = clampI(o.mate.st[k], 1, 99); });
    if (typeof o.mate.name !== 'string') o.mate.name = 'Compañero';
    o.mate.num = clampI(o.mate.num, 1, 99);
    // calendario y resultados: 5 ligas × 14 jornadas × 4 partidos con ids de su liga
    var okSched = arr(o.sched) && o.sched.length === LEAGUES.length && o.sched.every(function (s, L) {
      var ids = clubsOf(o, L).map(function (k) { return k.id; });
      return arr(s) && s.length === WEEKS && s.every(function (wk) { return arr(wk) && wk.length === CLUBS_PER / 2 && wk.every(function (m) { return arr(m) && ids.indexOf(m[0]) >= 0 && ids.indexOf(m[1]) >= 0; }); });
    });
    if (!okSched) { genSchedule(o); o.week = 0; if (o.phase !== 'off') o.phase = 'league'; o.cup = null; }
    if (!arr(o.res) || o.res.length !== LEAGUES.length) o.res = LEAGUES.map(function () { return []; });
    o.res = o.res.map(function (lr) { return arr(lr) ? lr.map(function (wk) { return arr(wk) ? wk.map(function (m) { return m && arr(m.s) && arr(m.sc) ? m : null; }) : []; }) : []; });
    // listas y números sueltos
    ['notes', 'offers', 'history', 'trophies'].forEach(function (k) { if (!arr(o[k])) o[k] = []; });
    o.notes = o.notes.filter(function (n) { return n && num(n.nota); });
    o.offers = o.offers.filter(function (x) { return x && club(o, x.club); });
    if (!o.stats || typeof o.stats !== 'object') o.stats = newSeasonStats();
    if (!o.career || typeof o.career !== 'object') o.career = newSeasonStats();
    [o.stats, o.career].forEach(function (x) { var z = newSeasonStats(); for (var k in z) if (!num(x[k])) x[k] = 0; });
    o.coach = num(o.coach) ? clamp(Math.round(o.coach), 0, 100) : 50;
    if (!o.objective || typeof o.objective.text !== 'string' || !num(o.objective.pos)) o.objective = makeObjective(o);
    if (o.last && (!o.last.me || !arr(o.last.sets) || !arr(o.last.setScores))) o.last = null;
    if (o.window !== 'mid' && o.window !== 'end') o.window = '';
    // fase y jornada
    if (['league', 'cup', 'off'].indexOf(o.phase) < 0) o.phase = 'league';
    o.week = clampI(o.week, 0, WEEKS);
    if (o.phase === 'league' && o.week >= WEEKS) { cur = o; startCup(o); }
    if (o.phase === 'cup') {
      var cu = o.cup, okId = function (id) { var k = club(o, id); return k && k.lvl === myClub(o).lvl; };
      var okCup = cu && typeof cu === 'object' && arr(cu.semis) && cu.semis.length === 2 && cu.semis.every(function (m) { return arr(m) && okId(m[0]) && okId(m[1]); }) &&
        arr(cu.res) && (cu.round === 0 || (cu.round === 1 && arr(cu.final) && okId(cu.final[0]) && okId(cu.final[1])));
      if (!okCup) { cur = o; startCup(o); }
    }
    if (o.phase === 'off') {
      var me = myClub(o);
      if (!o.review || typeof o.review !== 'object') o.review = { season: o.season, pos: posOf(o, me.id), lvl: me.lvl, objective: o.objective.text, objOk: false, champion: false, cup: false, move: 0, nota: avgNota(o), coach: o.coach, moves: [] };
      if (!arr(o.pendingMoves)) o.pendingMoves = [];
      o.window = 'end';
    }
    if (o.phase !== 'off' && !myFixture(o) && o.phase === 'league') { genSchedule(o); o.week = 0; }   // sin partido tuyo: calendario nuevo
    return o;
  }
  function exists() { return !!load(); }
  function get() { return load(); }
  function abandon() { cur = null; M = null; lost = false; try { var s = store(); if (s) s.removeItem(KEY); } catch (e) { } return true; }

  // ------------------------------------------------------------------ clubes y calendario
  function league(lvl) { return LEAGUES[clamp(lvl | 0, 0, LEAGUES.length - 1)]; }
  function clubOvr(club) { var L = league(club.lvl); return Math.round(L.ovr[0] + (L.ovr[1] - L.ovr[0]) * club.q); }
  function club(c, id) { for (var i = 0; i < c.clubs.length; i++) if (c.clubs[i].id === id) return c.clubs[i]; return null; }
  function myClub(c) { return club(c, c.myClub); }
  function clubsOf(c, lvl) { return c.clubs.filter(function (k) { return k.lvl === lvl; }); }
  function abbr(name) {
    var w = name.replace(/^(CV Platja|Club Platja|Vóley Playa|Beach Vòlei|Arena|Platja|Sorra|Dunes|Litoral|Costa|CV|AD|Club Vóley|Real Club|Unión|Atlético|Deportivo|Vóley|Sporting|Olímpico)\s+/, '').split(/\s+/)[0];
    return w.normalize ? w.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase() : w.slice(0, 3).toUpperCase();
  }
  /** Nombre de club de vóley playa con la ciudad (único dentro de `used`). */
  function clubName(r, city, used) { var name; do { name = pick(r, PREFIX) + ' ' + city + pick(r, SUFFIX); } while (used[name]); used[name] = 1; return name; }
  /** Sede: la playa (inventada) del club, «Cala Rocaverde», «Platja de Puertoluz»… */
  function beachOf(city, r) { return pick(r, BEACHES).replace('{c}', city); }
  function uniqueShorts(clubs) { var seen = {}; clubs.forEach(function (k) { var a = k.short, n = 1; while (seen[a]) { a = k.short.slice(0, 2) + (n++); } seen[a] = 1; k.short = a; }); }
  function genClubs(r) {
    var out = [], used = {};
    for (var L = 0; L < LEAGUES.length; L++) {
      var qs = []; for (var i = 0; i < CLUBS_PER; i++) qs.push((i + 0.5) / CLUBS_PER);
      shuffle(r, qs);
      for (var j = 0; j < CLUBS_PER; j++) {
        var idx = L * CLUBS_PER + j, city = CITIES[idx], name = clubName(r, city, used);
        var shirt = pick(r, SHIRTS), acc = pick(r, ACCENTS), sh = pick(r, SHORTS);
        if (acc === shirt) acc = ACCENTS[(ACCENTS.indexOf(acc) + 1) % ACCENTS.length];
        out.push({ id: idx, name: name, city: city, beach: beachOf(city, r), short: abbr(name), lvl: L, q: round1(clamp(qs[j] + (r() - 0.5) * 0.08, 0.02, 0.98) * 10) / 10,
          kit: { shirt: shirt, accent: acc, shorts: sh, pattern: pick(r, PATTERNS) } });
      }
    }
    uniqueShorts(out);   // abreviaturas únicas
    return out;
  }
  /** Guardado v1/v2 (clubes de pabellón) → clubes de vóley playa: nombre, abreviatura y sede nuevos con una semilla propia; ids,
   *  nivel, q, equipación, calendario, resultados, contrato y mensajes intactos. El historial y el palmarés pasan al nombre nuevo
   *  del MISMO club (por id en el historial; por nombre en los trofeos). */
  function beachify(o) {
    var r = rng(hash(o.seed, 'playa')), used = {}, ren = {};
    o.clubs.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (k) {
      var city = typeof k.city === 'string' && k.city ? k.city : CITIES[k.id % CITIES.length], nm = clubName(r, city, used);
      ren[k.name] = nm; k.name = nm; k.city = city; k.beach = beachOf(city, r); k.short = abbr(nm);
    });
    uniqueShorts(o.clubs);
    (Array.isArray(o.history) ? o.history : []).forEach(function (h) { var k = h && club(o, h.club); if (k) h.clubName = k.name; });
    (Array.isArray(o.trophies) ? o.trophies : []).forEach(function (t) { if (t && ren[t.club]) t.club = ren[t.club]; });
    if (o.review && ren[o.review.clubName]) o.review.clubName = ren[o.review.clubName];
    if (o.last && ren[o.last.rivalName]) o.last.rivalName = ren[o.last.rivalName];
  }
  /** Palmarés de los guardados v1/v2: las competiciones de pabellón («Liga Regional», «Copa Nacional», «Ascenso a Superliga»…)
   *  pasan al circuito de playa del mismo nivel («Circuito Regional», «Open Nacional», «Ascenso a la Hiperliga de Playa»). El club
   *  ya lo renombra beachify. Idempotente (también arregla los guardados que ya migraron a v3 con el nombre viejo). */
  var OLD_LG = ['Liga Regional', 'Liga Nacional', 'Superliga', 'Liga Continental', 'Circuito Mundial'];
  var OLD_CUP = ['Copa Regional', 'Copa Nacional', 'Copa de la Superliga', 'Copa Continental', 'Final a Cuatro Mundial'];
  // (v3 llamaba «Superliga de Playa» al nivel 2; ahora es la Hiperliga: «Superliga de Playa» → «Hiperliga de Playa», «Open de la Superliga» → «Open de la Hiperliga»)
  var OLD_LG3 = { 'Superliga de Playa': 2 }, OLD_CUP3 = { 'Open de la Superliga': 2 };
  function oldIdx(arr, map, n) { var i = arr.indexOf(n); return i >= 0 ? i : Object.prototype.hasOwnProperty.call(map, n) ? map[n] : -1; }
  function beachTrophies(o) {
    (Array.isArray(o.trophies) ? o.trophies : []).forEach(function (t) {
      if (!t || typeof t.name !== 'string') return;
      var i = t.kind === 'liga' ? oldIdx(OLD_LG, OLD_LG3, t.name) : t.kind === 'copa' ? oldIdx(OLD_CUP, OLD_CUP3, t.name) : t.kind === 'ascenso' ? oldIdx(OLD_LG, OLD_LG3, t.name.replace(/^Ascenso a (la )?/, '')) : -1;
      if (i < 0) return;
      t.name = t.kind === 'liga' ? LEAGUES[i].name : t.kind === 'copa' ? LEAGUES[i].cup : 'Ascenso ' + toL(LEAGUES[i]);
    });
  }
  /** Liga a doble vuelta (método del círculo): 14 jornadas de 4 partidos [local, visitante]. */
  function roundRobin(ids, r) {
    var t = shuffle(r, ids.slice()), n = t.length, weeks = [];
    for (var w = 0; w < n - 1; w++) {
      var wk = [];
      for (var i = 0; i < n / 2; i++) { var a = t[i], b = t[n - 1 - i]; wk.push(w % 2 ? [b, a] : [a, b]); }
      weeks.push(wk);
      t.splice(1, 0, t.pop());   // rota todos menos el primero
    }
    var back = weeks.map(function (wk) { return wk.map(function (m) { return [m[1], m[0]]; }); });
    return weeks.concat(back);
  }
  function genSchedule(c) {
    var r = rng(hash(c.seed, 'sched', c.season)), sched = [], res = [];
    for (var L = 0; L < LEAGUES.length; L++) {
      sched.push(roundRobin(clubsOf(c, L).map(function (k) { return k.id; }), r));
      res.push([]);
    }
    c.sched = sched; c.res = res;
  }

  // ------------------------------------------------------------------ simulación rápida
  /** Partido al mejor de 3 punto a punto: prob. de ganar cada punto 0,5 + 0,009 × (oa − ob) (0,2-0,8). Playa: sets a 21 y el
   *  3r a 15 (points por defecto PTS; el tercero siempre a mín(PTS3, points)). */
  function quickSim(oa, ob, r, points) {
    points = points || PTS;
    var pA = clamp(0.5 + 0.009 * (oa - ob), 0.2, 0.8), sets = [0, 0], sc = [];
    while (sets[0] < 2 && sets[1] < 2) {
      var tgt = sets[0] + sets[1] === 2 ? Math.min(PTS3, points) : points, a = 0, b = 0;
      while (!((a >= tgt || b >= tgt) && Math.abs(a - b) >= 2)) { if (r() < pA) a++; else b++; }
      sc.push([a, b]); sets[a > b ? 0 : 1]++;
    }
    return { sets: sets, setScores: sc };
  }
  function setPts(s) { return s[0] === 2 ? (s[1] === 0 ? [3, 0] : [2, 1]) : (s[0] === 0 ? [0, 3] : [1, 2]); }

  // ------------------------------------------------------------------ jugador y compañero
  function playerOvr(c) { return ovrOf(c.player.st); }
  function mateOvr(c) { return ovrOf(c.mate.st); }
  /** Compañero del club k: media = la del club + un desvío propio (mateOff: −9..+5; antes siempre +3), rol complementario. ovr/role:
   *  los fija quien llama (plantilla). Lleva forma 0 y, en m.off, su desvío respecto al club (la ficha lo enseña). */
  function newMate(c, k, r, ovr, roleKey) {
    var role = roleKey && ROLES[roleKey] ? roleKey : MATE_ROLE[c.player.roleKey] || 'uni', base = clubOvr(k), o = clamp(ovr != null ? ovr : base + mateOff(r), 22, 92);
    var num; do { num = 1 + Math.floor(r() * 24); } while (num === c.player.num);
    if (c.player.num !== 2) num = 2; // el compañero lleva el 2 (como en Partido rápido); si es el tuyo, el sorteado (misma tirada)
    var m = { name: pick(r, FIRST) + ' ' + pick(r, LAST), num: num, roleKey: role, role: ROLES[role].name, st: genSt(o, role, r), chem: 0, form: 0 };
    m.style = mateStyle(m, r);
    return m;
  }
  function mateStyle(m, r) { var l = MATE_STYLES[m.roleKey] || MATE_STYLES.uni; return pick(r, l); }
  /** Puntos fuertes y flojos de un compañero (o de cualquier st): atributos a ≥ MP_D de su media, de mayor a menor desvío (hasta
   *  3 de cada). {ovr, strong: ['set', …], weak: ['spike', …]}. Sin DOM: la UI pone las etiquetas (VB.Prog.LABEL). */
  var MP_D = 4;
  function mateProfile(m) {
    var st = m && m.st ? m.st : m, o = ovrOf(st), d = KEYS.map(function (k) { return { k: k, d: st[k] - o }; });
    var strong = d.filter(function (x) { return x.d >= MP_D; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 3).map(function (x) { return x.k; });
    var weak = d.filter(function (x) { return x.d <= -MP_D; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 3).map(function (x) { return x.k; });
    return { ovr: o, strong: strong, weak: weak };
  }
  /** Texto de la forma del compañero (−3..+3): «Flojo», «Normal», «En racha»… */
  function formText(f) { return FORM_TXT[clampI((f | 0) + FORM_MAX, 0, FORM_TXT.length - 1)]; }
  /** Forma del compañero tras un partido tuyo: paseo aleatorio ±1 con vuelta hacia 0 (determinista por temporada y partido). */
  function mateFormStep(c) {
    var m = c.mate; if (!m) return 0;
    var r = rng(hash(c.seed, 'form', c.season, c.notes.length, m.name)), f = m.form | 0, u = r();
    f += u < 0.3 ? -1 : u < 0.6 ? 1 : 0;
    if (f && r() < 0.3) f += f > 0 ? -1 : 1;   // la racha se gasta
    return (m.form = clampI(f, -FORM_MAX, FORM_MAX));
  }
  /** Techo del compañero en el partido: su media + la racha nunca pasa de la del club + MATE_CAP (la racha positiva se recorta;
   *  la mala se queda). Con el desvío propio (hasta +5) ya rinde como un jugador medio de su circuito; con la racha encima rompía el
   *  equilibrio (pareja +8 sobre el club). k = club (por defecto el tuyo). */
  var MATE_CAP = 6;
  function mateFormCap(c, k, mf) {
    if (!(mf > 0) || !c.mate) return mf | 0;
    k = k || myClub(c); if (!k) return mf;
    return clampI(Math.min(mf, clubOvr(k) + MATE_CAP - mateOvr(c)), 0, FORM_MAX);
  }
  /** Plantilla: otros 2 compañeros posibles en el club (además del titular), con medias que se notan: uno del mismo rol y un
   *  universal (o un bloqueador si tu rol es universal); cada uno con su desvío propio (dentro de MATE_OFF), a ≥ 3 del titular y distintos entre sí para que cambiar
   *  signifique algo (changeMate). */
  function genSquad(c, k, mate, r) {
    var base = clubOvr(k), mr = mate && mate.roleKey || MATE_ROLE[c.player.roleKey] || 'uni', t = mate ? ovrOf(mate.st) - base : 0;
    var alt = mr === 'uni' ? (c.player.roleKey === 'uni' ? 'atk' : 'uni') : 'uni';
    // cada alternativa: dentro de MATE_OFF, a ≥ 3 del titular y distinta de la otra (antes, al deshacer el empate, la 2ª podía
    // caer encima del titular, y el clamp dejaba salir la plantilla a −10..+6). fit busca el valor válido más cercano, primero
    // alejándose del titular.
    var lo = MATE_OFF[0], hi = MATE_OFF[1], offs = [];
    function okOff(o, other) { return o >= lo && o <= hi && Math.abs(o - t) >= 3 && o !== other; }
    function fit(o, other, up) {
      for (var d = 0; d <= hi - lo + 8; d++) { var a = o + (up ? d : -d), b = o - (up ? d : -d); if (okOff(a, other)) return a; if (okOff(b, other)) return b; }
      return clampI(o, lo, hi);
    }
    [mr, alt].forEach(function (x, i) {
      var o = mateOff(r), up = o >= t;
      if (Math.abs(o - t) < 3) o = t + (up ? 3 : -3) + (r() < 0.5 ? 0 : (up ? 1 : -1));
      offs.push(fit(o, i ? offs[0] : NaN, up));
    });
    var out = [newMate(c, k, r, base + offs[0], mr), newMate(c, k, r, base + offs[1], alt)];
    out.forEach(function (m, i) { var n = m.num; while (n === c.player.num || n === 2 || (mate && n === mate.num) || (i && n === out[0].num)) n = 3 + Math.floor(r() * 20); m.num = n; });
    return out;
  }
  function salaryOf(lvl, q, rl) {
    var v = SALARY[clamp(lvl | 0, 0, SALARY.length - 1)] * (0.8 + 0.4 * (q || 0)) * [0.8, 1, 1.25][clamp(rl | 0, 0, 2)];
    return Math.round(v / 50) * 50;
  }
  function starsOf(lvl, q) { return clamp(1 + (lvl | 0) + (q > 0.6 ? 1 : 0), 1, 5); }
  function styleOf(k) { return STYLES[hash('estilo', k.name) % STYLES.length]; }
  /** Ficha de un club (para las ofertas y la pestaña Club): liga, prestigio (1-5 estrellas), media, estilo, ciudad. lvl/q: los de la
   *  temporada que viene si se pasan. */
  function clubInfo(c, k, lvl, q) {
    lvl = lvl != null ? lvl : k.lvl; q = q != null ? q : k.q;
    var L = league(lvl);
    return { id: k.id, name: k.name, short: k.short, city: k.city, beach: k.beach || '', kit: k.kit, lvl: lvl, league: L.name, art: L.art, stars: starsOf(lvl, q), style: styleOf(k),
      ovr: Math.round(L.ovr[0] + (L.ovr[1] - L.ovr[0]) * q) };
  }

  // ------------------------------------------------------------------ bandeja de mensajes
  var INBOX_MAX = 40;
  /** Mensaje en la bandeja: k = 'coach' | 'offer' | 'obj' | 'club' | 'train' | 'agent'. */
  function msg(c, k, t, x) {
    if (!c) return null;
    if (!Array.isArray(c.inbox)) c.inbox = [];
    var m = { id: (c.msgN = (c.msgN | 0) + 1), k: k, t: t, x: x, s: c.season | 0, w: (c.week | 0) + 1, ph: c.phase, r: 0 };
    c.inbox.push(m);
    if (c.inbox.length > INBOX_MAX) c.inbox = c.inbox.slice(-INBOX_MAX);
    return m;
  }
  function unread(c) { c = c || load(); return c && c.inbox ? c.inbox.filter(function (m) { return !m.r; }).length : 0; }
  function readMsg(id) { var c = load(); if (!c || !c.inbox) return false; var ok = false; c.inbox.forEach(function (m) { if (m.id === id && !m.r) { m.r = 1; ok = true; } }); if (ok) save(c); return ok; }
  function readAll() { var c = load(); if (!c || !c.inbox) return 0; var n = 0; c.inbox.forEach(function (m) { if (!m.r) { m.r = 1; n++; } }); if (n) save(c); return n; }

  // ------------------------------------------------------------------ química, fatiga y entrenamiento
  function chemBonus(c) { return c && c.mate ? Math.min(3, Math.floor(clamp(c.mate.chem | 0, 0, 100) / 30)) : 0; }   // 0..3 (30 → 1, 60 → 2, 90 → 3)
  function fatigueMalus(c) { var f = c ? c.fatigue | 0 : 0; return f <= FAT_FREE ? 0 : Math.min(4, Math.ceil((f - FAT_FREE) / 15)); }
  /** Una semana de entrenamiento (tras cada partido tuyo): progreso del enfoque, mejoras gratis y fatiga. */
  function trainWeek(c) {
    var T = TRAIN[c.train] || TRAIN.bal, gains = [], f0 = c.fatigue | 0, m0 = fatigueMalus(c), prog = {}, g, Dt = cd(c).train;
    for (g in T.prog) prog[g] = T.prog[g];
    var mk = myClub(c), sg = mk ? STYLE_TRAIN[styleOf(mk)] : '';
    if (sg && c.train !== 'rest') prog[sg] = (prog[sg] || 0) + STYLE_PROG;   // estilo del club (descansando no entrenas)
    for (g in prog) {
      c.tp[g] = (c.tp[g] || 0) + Math.round(prog[g] * Dt);   // × ritmo del entreno de la dificultad (Normal: 1)
      while (c.tp[g] >= TRAIN_NEED) {
        c.tp[g] -= TRAIN_NEED;
        var ks = TGROUP[g].filter(function (k) { return c.player.st[k] < 99; }).sort(function (a, b) { return c.player.st[a] - c.player.st[b]; });
        if (!ks.length) { c.tp[g] = 0; break; }
        c.player.st[ks[0]]++; gains.push(ks[0]);
      }
    }
    c.fatigue = clamp(f0 + T.fat, 0, 100);
    // aviso cada vez que la resta sube (antes solo una vez, al pasar de 60)
    if (fatigueMalus(c) > m0) msg(c, 'train', 'El preparador físico avisa', 'Llevas muchas semanas cargando: fatiga ' + c.fatigue + ' de 100. Con tanta fatiga rindes menos en los partidos (−' + fatigueMalus(c) + ' en todos tus atributos). Una semana de Descanso la baja mucho; con Equilibrado no sube.');
    return { focus: c.train, gains: gains, fatigue: c.fatigue, fat0: f0 };
  }

  // ------------------------------------------------------------------ sesiones de entrenamiento (13-nov-2026)
  // Petición de Ferran: «añadir los entrenamientos como parte del modo carrera, para poder subir estadísticas, con un límite de por
  // ejemplo 3 entrenamientos antes de la siguiente jornada. Que no suban mucho, que te den la posibilidad de subir un pelín. Así, un
  // jugador que acaba de unirse a un equipo mejor, puede llegar a ser titular demostrando su valía ahí.»
  // Entre jornada y jornada (playa y pista) hasta TRAIN_SESS sesiones. Cada una es un ejercicio del Entrenamiento (VB.Gym) que pega
  // con tu puesto (SESS_BY): jugado de verdad (main.js: startCareerDrill → drillSetup + startMatch({drill, careerDrill}); al acabar,
  // trainSession(id, 'play', total)) o «rápido» (sessQuick: determinista por semilla, temporada, jornada y sesión; según tu atributo,
  // nunca da oro: peor de media que jugarlo bien). Efecto de cada sesión (sessDo):
  //   - progreso en el ATRIBUTO del ejercicio (c.ts.p[k]; cada SESS_NEED, +1): SESS_MAX × (0,2 + 0,8 × calidad) × SESS_EFF[n.º de
  //     sesión] × fatiga × ritmo de la dificultad (cd(c).train). calidad = puntos / umbral del oro (tope 1).
  //   - fatiga +SESS_FAT[n] (3, 4 y 6: la tercera seguida se nota); con fatiga ≥ SESS_FAT_MAX no se entrena; por encima de FAT_FREE
  //     cada sesión rinde menos (sessFatK, hasta la mitad) y el ejercicio jugado lleva la resta de fatiga del partido.
  //   - impresión en el entrenador (c.ts.imp, 0-100): media móvil de la calidad de tus sesiones (SESS_IMP_A); una jornada sin
  //     entrenar la baja (× SESS_IMP_DECAY); al fichar vuelve a 0 y en verano se queda en la mitad. Pista: suma hasta SEL_IMP a tu
  //     `sel` en lineup6 (demostrar tu valía). Playa: cada sesión suma SESS_COACH × calidad / TRAIN_SESS de confianza (acumulada).
  // El contador (c.ts.n) se reinicia al cerrar tu jornada (sessClose: jugada, simulada, banquillo, fuera o descanso) y, de reserva,
  // si cambia la jornada (c.ts.wk).
  // MEDIDA (node, tools/careertest.js «Sesiones de entrenamiento» y una prueba aparte de 3 semillas por modo; Normal; con enfoque
  // Equilibrado y Descanso cuando la fatiga llega a 55): 3 oros por jornada dan como mucho 15 + 13 + 10 = 38 de progreso (≥ 2,6 jornadas
  // por punto). Una temporada de playa entera (14 jornadas + el Open, 42-48 sesiones) haciendo SIEMPRE 3 sesiones con oro del mismo
  // ejercicio sube ese atributo +4/+5 sobre no entrenar (≈ +1 cada 3-3,5 jornadas) y la media +0,2/+0,5 (las semanas de Descanso
  // quitan algo del entreno semanal); con 3 «rápidas» de un atributo de 50, +2. En la pista (9-11 jornadas de liga), +2/+4 con oro. La
  // experiencia y el entreno semanal dan ~16-24 puntos de atributo por temporada en ese tramo: las sesiones son un empujón, no otra
  // progresión. Lo que más pesa es la impresión en el entrenador (pista: ver SEL_IMP y lineup6).
  var TRAIN_SESS = 3, SESS_NEED = 100, SESS_MAX = 15, SESS_EFF = [1, 0.85, 0.7], SESS_FAT = [3, 4, 6], SESS_FAT_MAX = 80;
  var SESS_QUICK = [0.3, 0.85], SESS_IMP_A = 0.15, SESS_IMP_DECAY = 0.75, SESS_COACH = 1;
  // Entrenos al estilo EA FC (15-nov-2026, notes/pruebas-entrenos-spec.md P5): cada sesión puede ser Jugar, Rápido o Descansar.
  //   - Nota con letra (sessGrade) sobre q = puntos / oro: A+ con oro, A ≥ 0,85, B ≥ 0,70, C ≥ 0,55, D ≥ 0,35; por debajo, F.
  //   - Rápido = tu récord jugando en ese ejercicio (c.ts.best), nunca el oro (oro − 1) y menos 1 por punto de resta de fatiga; sin
  //     récord, D como mucho (SESS_QUICK_D del oro). Determinista. Rinde × SESS_QUICK_K y la impresión avanza a la mitad.
  //   - Jugar conserva la ganancia de siempre (× 1: en la práctica Jugar da SESS_PLAY_K = 1,25 veces el Rápido); la primera vez que
  //     juegas cada ejercicio, × SESS_FIRST; si el ejercicio es del grupo del Plan (c.train atk/def), × SESS_FOCUS.
  //   - Descansar (how 'rest'): gasta la sesión y baja SESS_REST de fatiga; ni sube atributos ni toca la impresión.
  //   - Plan del entrenador (sessPlan, guiado por c.train), recomendación (sessRecommend), «Simular jornada» (sessSimDay) y
  //     entreno automático (sessAuto, c.ts.auto, activado por defecto): al cerrar la jornada rellena en silencio las sesiones libres
  //     con Rápido del plan sin pasar nunca de SESS_AUTO_FAT de fatiga (no te mete en la resta de los partidos).
  var SESS_GRADE = [['A+', 1.0], ['A', 0.85], ['B', 0.70], ['C', 0.55], ['D', 0.35]];
  var SESS_PLAY_K = 1.25, SESS_FIRST = 1.5, SESS_FOCUS = 1.2, SESS_QUICK_K = 0.8, SESS_QUICK_D = 0.45, SESS_REST = 8, SESS_AUTO_FAT = FAT_FREE;
  var SESS_FOCUS_G = { atk: 'atk', def: 'def' };   // enfoque (c.train) → grupo de ejercicios (SESS_DRILL[id].g); phys, bal y rest no tienen
  var SESS_LOG_MAX = 6;
  // ejercicios con medallas de VB.Gym: atributo que sube (k), grupo (g) y umbrales de reserva (los de gym.js/sim, por si no están)
  var SESS_DRILL = {
    serve: { k: 'serve', g: 'atk', name: 'Saque a diana', short: 'Saque', help: '10 saques a la diana que se mueve', medals: [12, 18, 24] },
    recv: { k: 'recv', g: 'def', name: 'Recepción', short: 'Recepción', help: '10 saques de la CPU: déjala en la zona del colocador', medals: [18, 24, 28] },
    set: { k: 'set', g: 'atk', name: 'Colocación', short: 'Colocación', help: 'Coloca para el remate: de dedos o en salto', medals: [16, 22, 27] },
    atk: { k: 'spike', g: 'atk', name: 'Remate', short: 'Remate', help: 'Tu compañero te coloca: remata a la diana', medals: [12, 18, 23] },
    block: { k: 'block', g: 'def', name: 'Bloqueo', short: 'Bloqueo', help: 'La CPU ataca: salta a tiempo y cierra', medals: [6, 11, 16] }
  };
  // los que tienen sentido para tu rol (playa) o tu puesto (pista), el más propio primero
  var SESS_BY = { atk: ['atk', 'block', 'serve', 'recv'], cr: ['recv', 'set', 'serve', 'atk'], uni: ['serve', 'recv', 'set', 'atk', 'block'],
    OH: ['recv', 'atk', 'serve', 'block'], OPP: ['atk', 'block', 'serve'], MB: ['block', 'atk', 'serve'], S: ['set', 'serve', 'block'], L: ['recv', 'set'] };
  var ATTR_TXT = { jump: 'Salto', speed: 'Velocidad', react: 'Reacción', recv: 'Recepción', dig: 'Defensa', set: 'Colocación', spike: 'Potencia', ctl: 'Control', block: 'Bloqueo', serve: 'Saque' };
  function attrTxt(k) { var L = P() && P().LABEL; return (L && L[k]) || ATTR_TXT[k] || k; }
  function isHallC(c) { return !!(c && c.mode === 'hall'); }
  function sessKey(c) { return isHallC(c) ? wkKey6(c) : wkKey(c); }
  function sessMedals(id) {
    var G = VB.Gym; if (G && G.medalsOf) { try { var m = G.medalsOf(id); if (m) return m; } catch (e) { } }
    var k = VB.DRILL && VB.DRILL.kinds && VB.DRILL.kinds[id];
    return (k && k.medals) || SESS_DRILL[id].medals;
  }
  function sessMedal(id, t) { var m = sessMedals(id); return t >= m[2] ? 3 : t >= m[1] ? 2 : t >= m[0] ? 1 : 0; }
  function sessFatK(c) { return clamp(1 - Math.max(0, (c.fatigue | 0) - FAT_FREE) / 80, 0.5, 1); }
  /** Estado de las sesiones (c.ts), saneado (también para guardados viejos sin él). */
  function sessSane(o) {
    var num = function (v) { return typeof v === 'number' && isFinite(v); }, t = o.ts;
    if (!t || typeof t !== 'object') t = o.ts = {};
    t.n = clampI(num(t.n) ? t.n : 0, 0, TRAIN_SESS); if (!num(t.wk)) t.wk = null;
    t.imp = num(t.imp) ? clamp(round1(t.imp), 0, 100) : 0; t.cf = num(t.cf) ? clamp(t.cf, 0, 1) : 0;
    t.tot = num(t.tot) ? Math.max(0, t.tot | 0) : 0;
    // (sprint 2-4, fusión 15-nov) sesiones por medalla [sin, bronce, plata, oro]: logros ses10 y sesg5 de career-life.js
    var md = Array.isArray(t.md) ? t.md : []; t.md = [0, 1, 2, 3].map(function (i) { return num(md[i]) ? Math.max(0, md[i] | 0) : 0; });
    if (!t.p || typeof t.p !== 'object') t.p = {};
    Object.keys(SESS_DRILL).forEach(function (id) { var k = SESS_DRILL[id].k; t.p[k] = num(t.p[k]) ? clamp(Math.round(t.p[k]), 0, SESS_NEED - 1) : 0; });
    if (!t.last || typeof t.last !== 'object' || !SESS_DRILL[t.last.id]) t.last = null;
    // (15-nov-2026) récord jugando por ejercicio (0-30), ejercicios ya jugados alguna vez, entreno automático (por defecto sí, también
    // en los guardados viejos) y las sesiones de la jornada para el resumen (wkLog: se vacía al cerrar la jornada)
    var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
    if (!obj(t.best)) t.best = {};
    Object.keys(t.best).forEach(function (id) { if (!SESS_DRILL[id] || !num(t.best[id])) delete t.best[id]; else t.best[id] = clampI(t.best[id], 0, 30); });
    if (!obj(t.seen)) t.seen = {};
    Object.keys(t.seen).forEach(function (id) { if (!SESS_DRILL[id] || !t.seen[id]) delete t.seen[id]; else t.seen[id] = 1; });
    t.auto = typeof t.auto === 'boolean' ? t.auto : true;
    if (!Array.isArray(t.wkLog)) t.wkLog = [];
    t.wkLog = t.wkLog.filter(function (x) { return obj(x) && (x.id === 'rest' || SESS_DRILL[x.id]); }).slice(-SESS_LOG_MAX);
    return t;
  }
  function sessState(c) { var t = sessSane(c); if (t.wk != null && t.wk !== sessKey(c)) { t.n = 0; t.wk = null; t.wkLog = []; } return t; }
  function sessFixture(c) { return isHallC(c) ? (c.phase === 'league' || c.phase === 'ko') && !!myFixture6(c) : (c.phase === 'league' || c.phase === 'cup') && !!myFixture(c); }
  /** Ejercicios de tu puesto con lo que sube cada uno, tu récord jugando (best, con su letra), lo que daría el Rápido ahora (quick,
   *  con su letra) y si aún no lo has jugado nunca (first: la primera vez rinde × SESS_FIRST). */
  function sessDrills(c) {
    var pos = c && c.player ? c.player.roleKey : 'uni', ids = SESS_BY[pos] || SESS_BY.uni, G = VB.Gym, t = c && c.ts;
    return ids.map(function (id) {
      var D = SESS_DRILL[id], gd = G && G.drill ? G.drill(id) : null, b = t && t.best && typeof t.best[id] === 'number' ? t.best[id] : null;
      var qk = c && c.player && t ? sessQuick(c, id) : 0;
      return { id: id, name: gd ? gd.name : D.name, short: gd ? gd.short : D.short, help: gd ? gd.help : D.help, attr: D.k, attrName: attrTxt(D.k), group: D.g,
        medals: sessMedals(id).slice(), v: c && c.player ? c.player.st[D.k] | 0 : 0, prog: t && t.p ? t.p[D.k] | 0 : 0,
        best: b, bestGrade: b == null ? '' : sessGrade(id, b), quick: qk, quickGrade: sessGrade(id, qk), first: !(t && t.seen && t.seen[id]) };
    });
  }
  /** Lo que la UI necesita: { max, used, left, can, why ('' | 'none' | 'done' | 'fatiga'), canRest, fat, fatMax, nextFat, imp, last,
   *  drills, need, tot, auto, plan (3 ids, 'rest' = descansar), rec (enfoque recomendado), focus (c.train), log (sesiones de la jornada),
   *  wk (clave de la jornada), mode ('beach' | 'hall') }. */
  function sessInfo(c) {
    if (!c || !c.player) return null;
    var t = sessState(c), why = !myClub(c) || !sessFixture(c) ? 'none' : t.n >= TRAIN_SESS ? 'done' : (c.fatigue | 0) >= SESS_FAT_MAX ? 'fatiga' : '';
    return { max: TRAIN_SESS, used: t.n, left: TRAIN_SESS - t.n, can: !why, why: why, canRest: !why || why === 'fatiga', fat: c.fatigue | 0, fatMax: SESS_FAT_MAX, nextFat: SESS_FAT[Math.min(t.n, TRAIN_SESS - 1)],
      fatK: sessFatK(c), imp: t.imp, last: t.last, drills: sessDrills(c), need: SESS_NEED, tot: t.tot,
      auto: t.auto, autoFat: SESS_AUTO_FAT, plan: sessPlan(c), rec: sessRecommend(c), focus: TRAIN[c.train] ? c.train : 'bal', log: t.wkLog.slice(), rest: SESS_REST,
      wk: sessKey(c), mode: isHallC(c) ? 'hall' : 'beach' };
  }
  /** ¿Se puede hacer la sesión id? '' si sí; si no 'none' | 'done' | 'fatiga' | 'drill'. auto (entreno automático, al cerrar la
   *  jornada): no mira si queda partido (sessFixture), porque la jornada se está cerrando. */
  function sessOk(c, id, auto) {
    var inf = sessInfo(c); if (!inf) return 'none';
    if (!SESS_DRILL[id] || !inf.drills.some(function (d) { return d.id === id; })) return 'drill';
    if (auto) return !myClub(c) ? 'none' : inf.used >= TRAIN_SESS ? 'done' : inf.fat >= SESS_FAT_MAX ? 'fatiga' : '';
    return inf.why;
  }
  /** Letra de una sesión (A+ … F) por la fracción del oro (SESS_GRADE). */
  function sessGrade(id, total) {
    var m = sessMedals(id), q = m[2] > 0 ? (+total || 0) / m[2] : 0;
    for (var i = 0; i < SESS_GRADE.length; i++) if (q >= SESS_GRADE[i][1] - 1e-9) return SESS_GRADE[i][0];
    return 'F';
  }
  /** Resultado del «Entrenar rápido» (determinista, nunca g.rng):
   *  - con récord jugando (c.ts.best[id]): el récord, como mucho oro − 1, menos 1 por punto de resta de la fatiga (sin azar);
   *  - sin récord: la fórmula de antes (fracción del oro según tu atributo, 35 → 0,3; 85 → 0,8; ± 0,08; con la fatiga), como mucho
   *    SESS_QUICK_D del oro (una D). Nunca llega al oro. */
  function sessQuick(c, id) {
    var D = SESS_DRILL[id], m = sessMedals(id), t = sessState(c);
    var r = rng(hash(c.seed, 'sess', c.season, sessKey(c), t.n, id));
    var v = (c.player.st[D.k] | 0) - 2 * fatigueMalus(c);
    var f = clampI(m[2] * (clamp(SESS_QUICK[0] + (v - 35) / 100, SESS_QUICK[0], SESS_QUICK[1]) + (r() - 0.5) * 0.16), 0, 30);
    var d = Math.min(f, Math.floor(m[2] * SESS_QUICK_D));   // sin récord: la D como mucho
    // con récord: el récord (sin oro), pero nunca peor que sin haberlo jugado (jugarlo una vez y mal no debe castigar el Rápido)
    if (typeof t.best[id] === 'number') return clampI(Math.max(Math.min(t.best[id], m[2] - 1) - fatigueMalus(c), d), 0, 30);
    return d;
  }
  /** Una sesión: how 'play' (total del ejercicio jugado, 0-30) | 'quick' | 'rest' (id se ignora). Devuelve el resultado (también en
   *  c.ts.last, salvo el descanso) o { ok: false, why } ('none' | 'done' | 'fatiga' | 'drill'). No guarda: lo hace el motor
   *  (trainSession de BEACH / HALL). opt.auto: entreno automático (sin mirar sessFixture); opt.quiet: sin el mensaje de la bandeja
   *  (el automático deja uno solo, de resumen). Resultado jugado o rápido: { ok, id, how, total, medal, grade, q, gain, mul, first,
   *  focus, attr, prog0, prog, need, up, v, fat0, fat, imp0, imp, coach0, coach, n, max, s, wk } y, jugado, best0 (récord de antes o
   *  null) y best (pista: además stat0, stat, sel, gap). */
  function sessDo(c, id, how, total, opt) {
    opt = opt || {};
    if (how === 'rest') return sessRest(c, opt);
    var w = sessOk(c, id, opt.auto); if (w) return { ok: false, why: w };
    var t = sessState(c), D = SESS_DRILL[id], m = sessMedals(id), n = t.n, quick = how !== 'play';
    total = quick ? sessQuick(c, id) : clampI(total, 0, 30);
    var q = clamp(total / m[2], 0, 1), fk = sessFatK(c), first = !quick && !t.seen[id], focus = SESS_FOCUS_G[c.train] === D.g;
    var mul = (quick ? SESS_QUICK_K : 1) * (first ? SESS_FIRST : 1) * (focus ? SESS_FOCUS : 1);
    var gain = Math.max(1, Math.round(SESS_MAX * (0.2 + 0.8 * q) * SESS_EFF[n] * fk * cd(c).train * mul));
    var k = D.k, up = '', st = c.player.st, fat0 = c.fatigue | 0, imp0 = t.imp, coach0 = c.coach | 0, prog0 = t.p[k] | 0;
    t.p[k] = (t.p[k] | 0) + gain;
    if (t.p[k] >= SESS_NEED) { t.p[k] -= SESS_NEED; if (st[k] < 99) { st[k]++; up = k; } else t.p[k] = 0; }
    c.fatigue = clamp(fat0 + SESS_FAT[n], 0, 100);   // (la misma fatiga sea cual sea la nota)
    t.imp = round1(clamp(t.imp + SESS_IMP_A * (quick ? 0.5 : 1) * (100 * q - t.imp), 0, 100));   // (el Rápido, a la mitad)
    if (!isHallC(c)) {   // playa: la confianza del entrenador sube poco a poco (entera: se acumula la fracción)
      t.cf += SESS_COACH * q / TRAIN_SESS; var whole = Math.floor(t.cf + 1e-9);
      if (whole > 0) { t.cf -= whole; c.coach = clamp((c.coach | 0) + whole, 0, 100); }
    }
    t.n = n + 1; t.wk = sessKey(c); t.tot++;
    if (up && !opt.quiet) msg(c, 'train', 'Los entrenos dan fruto', '+1 en ' + attrTxt(k).toLowerCase() + ' (' + st[k] + ') gracias a las sesiones de ' + (SESS_DRILL[id].short).toLowerCase() + '.');
    var res = { ok: true, id: id, how: quick ? 'quick' : 'play', total: total, medal: sessMedal(id, total), grade: sessGrade(id, total), q: Math.round(q * 100) / 100, gain: gain,
      mul: Math.round(mul * 100) / 100, first: first, focus: focus, attr: k, prog0: prog0, prog: t.p[k], need: SESS_NEED,
      up: up, v: st[k], fat0: fat0, fat: c.fatigue, imp0: imp0, imp: t.imp, coach0: coach0, coach: c.coach | 0, n: t.n, max: TRAIN_SESS, s: c.season | 0, wk: t.wk };
    if (!quick) {   // jugado: récord y «ya lo has jugado»
      var b0 = typeof t.best[id] === 'number' ? t.best[id] : null;
      t.best[id] = Math.max(b0 == null ? 0 : b0, total); t.seen[id] = 1;
      res.best0 = b0; res.best = t.best[id]; res.bestGrade0 = b0 == null ? '' : sessGrade(id, b0); res.bestGrade = sessGrade(id, t.best[id]);
    }
    // pista: la impresión cuenta ya en el seis de esta jornada (y el entrenador avisa si cambia tu sitio). El automático no: la jornada
    // ya se está cerrando y el seis de la siguiente lo elige nextLine6
    if (isHallC(c) && c.sq6 && !opt.auto) {
      var st0 = c.sq6.stat; c.sq6.wk = null; var L = lineup6(c);
      res.stat0 = st0; res.stat = L ? L.stat : ''; res.sel = L ? L.imp : 0; res.gap = L ? L.gap : 0;
    }
    t.md[res.medal]++;
    t.wkLog.push({ id: id, how: res.how, total: total, grade: res.grade, gain: gain, attr: k, up: up });
    if (t.wkLog.length > SESS_LOG_MAX) t.wkLog = t.wkLog.slice(-SESS_LOG_MAX);
    t.last = res;
    if (!opt.auto) life(c, 'sess', res);   // la primera sesión que haces tú (el automático no cuenta): escena ses1 de Faro, una vez (career-world.js)
    return res;
  }
  /** Descansar en una sesión: la gasta y baja SESS_REST de fatiga (también con fatiga alta, que es cuando hace falta). Ni atributos
   *  ni impresión. { ok, id: 'rest', how: 'rest', fat0, fat, n, max, s, wk } o { ok: false, why } ('none' | 'done'). */
  function sessRest(c, opt) {
    if (!c || !c.player) return { ok: false, why: 'none' };
    var t = sessState(c);
    if (!myClub(c) || (!opt.auto && !sessFixture(c))) return { ok: false, why: 'none' };
    if (t.n >= TRAIN_SESS) return { ok: false, why: 'done' };
    var fat0 = c.fatigue | 0;
    c.fatigue = clamp(fat0 - SESS_REST, 0, 100);
    t.n++; t.wk = sessKey(c);
    t.wkLog.push({ id: 'rest', how: 'rest', total: 0, grade: '', gain: 0, attr: '', up: '' });
    if (t.wkLog.length > SESS_LOG_MAX) t.wkLog = t.wkLog.slice(-SESS_LOG_MAX);
    var res = { ok: true, id: 'rest', how: 'rest', fat0: fat0, fat: c.fatigue, n: t.n, max: TRAIN_SESS, s: c.season | 0, wk: t.wk };
    // pista: la fatiga cuenta en el seis de esta jornada (por debajo de FAT_REST ya no te sientan por cansancio), como en sessDo
    if (isHallC(c) && c.sq6 && !opt.auto) {
      var st0 = c.sq6.stat; c.sq6.wk = null; var L = lineup6(c);
      res.stat0 = st0; res.stat = L ? L.stat : ''; res.sel = L ? L.imp : 0; res.gap = L ? L.gap : 0;
    }
    return res;
  }
  /** Plan del entrenador para las 3 sesiones de la jornada (guiado por el enfoque c.train): primero los ejercicios de tu puesto del
   *  grupo del enfoque (atk: saque, colocación, remate; def: recepción, bloqueo), del atributo más bajo al más alto; luego el orden
   *  de tu puesto (se repite si no hay bastantes). Físico y Equilibrado: solo el orden del puesto. Descanso: ['rest', 'rest', 'rest']. */
  function sessPlan(c) {
    if (!c || !c.player) return [];
    if (c.train === 'rest') return ['rest', 'rest', 'rest'];
    var ds = sessDrills(c), g = SESS_FOCUS_G[c.train], out = [];
    if (g) out = ds.filter(function (d) { return d.group === g; }).sort(function (a, b) { return a.v - b.v || ds.indexOf(a) - ds.indexOf(b); }).map(function (d) { return d.id; });
    ds.forEach(function (d) { if (out.indexOf(d.id) < 0) out.push(d.id); });
    for (var i = 0; out.length && out.length < TRAIN_SESS; i++) out.push(out[i]);
    return out.slice(0, TRAIN_SESS);
  }
  /** Enfoque que recomienda el entrenador: con fatiga > 60, Descanso; si no, el grupo de tu puesto (bloqueador, opuesto, receptor y
   *  colocador → Ataque; defensor, líbero y central → Defensa; universal → Equilibrado), salvo que el grupo de atributos más flojo
   *  quede 6 o más por debajo de tu media: entonces, ese grupo. */
  function sessRecommend(c) {
    if (!c || !c.player) return 'bal';
    if ((c.fatigue | 0) > 60) return 'rest';
    var rk = c.player.roleKey, base = { atk: 'atk', OPP: 'atk', OH: 'atk', S: 'atk', cr: 'def', L: 'def', MB: 'def' }[rk] || 'bal';
    var st = c.player.st, avg = ovrOf(st), lo = '', gap = 0;
    Object.keys(TGROUP).forEach(function (g) {
      var s = 0; TGROUP[g].forEach(function (k) { s += st[k] | 0; });
      var d = avg - s / TGROUP[g].length; if (d > gap) { gap = d; lo = g; }
    });
    return lo && gap >= 6 ? lo : base;
  }
  /** «Simular jornada»: hace en Rápido (o descansando, si el plan lo dice) las sesiones que quedan del plan. Para en la primera que
   *  no se deje (fatiga). Devuelve { ok, done: [resultados], n, left, fat0, fat, ups: [atributos que suben], why } (why si no se ha
   *  hecho ninguna). No guarda: lo hace el motor. */
  function sessSimDay(c, opt) {
    opt = opt || {};
    var t = sessState(c), plan = sessPlan(c), done = [], ups = [], fat0 = c.fatigue | 0, why = '';
    // tope del automático: SESS_AUTO_FAT menos la fatiga que suma después el entreno semanal (trainWeek, según el enfoque)
    var capF = SESS_AUTO_FAT - Math.max(0, (TRAIN[c.train] || TRAIN.bal).fat);
    for (var i = t.n; i < TRAIN_SESS; i++) {
      var id = plan[i] || plan[0];
      if (opt.auto && id === 'rest') { why = 'rest'; break; }   // el automático solo hace Rápidos: descansar lo decides tú (el enfoque Descanso ya baja la fatiga en trainWeek)
      if (opt.auto && (c.fatigue | 0) + SESS_FAT[t.n] > capF) { why = 'fatiga'; break; }   // el automático no te mete en la resta de fatiga
      var r = sessDo(c, id, id === 'rest' ? 'rest' : 'quick', null, { auto: opt.auto, quiet: opt.quiet });
      if (!r.ok) { why = r.why; break; }
      done.push(r); if (r.up) ups.push(r.up);
    }
    return { ok: done.length > 0, done: done, n: t.n, left: TRAIN_SESS - t.n, fat0: fat0, fat: c.fatigue | 0, ups: ups, why: done.length ? '' : why || 'done' };
  }
  /** Entreno automático al cerrar la jornada (closeMine, benchNext y sus equivalentes de pista; justo antes de trainWeek): si c.ts.auto
   *  y no es una jornada de descanso (bye), rellena las sesiones libres con el Rápido del plan sin pasar de SESS_AUTO_FAT de fatiga
   *  (contando la que suma después el entreno semanal del enfoque). Nunca descansa por ti: con el enfoque Descanso no hace nada.
   *  En silencio: como mucho un mensaje de resumen si algún atributo sube. Devuelve el resumen de sessSimDay o null. */
  function sessAuto(c, bye) {
    if (bye || !c || !c.player || !myClub(c)) return null;
    var t = sessState(c); if (!t.auto || t.n >= TRAIN_SESS) return null;
    var r = sessSimDay(c, { auto: true, quiet: true });
    if (!r.ok) return null;
    if (r.ups.length) msg(c, 'train', 'Entreno automático', 'El cuerpo técnico ha completado tus sesiones libres de la jornada (' + plural(r.done.length, 'sesión', 'sesiones') + ' en Rápido): +1 en ' +
      r.ups.map(function (k) { return attrTxt(k).toLowerCase() + ' (' + c.player.st[k] + ')'; }).join(', ') + '. Jugar los ejercicios rinde más.');
    return r;
  }
  /** Cierre de tu jornada (jugada, simulada, banquillo, fuera; bye = descanso de una liga impar, sin decaer: no hubo ocasión de
   *  entrenar): sin ninguna sesión de entreno (descansar no cuenta), la impresión baja; el contador vuelve a 0. */
  function sessClose(c, bye) {
    var t = sessSane(c), rests = t.wkLog.filter(function (x) { return x.how === 'rest'; }).length;
    if (!bye && t.n - rests <= 0 && t.imp > 0) t.imp = round1(t.imp * SESS_IMP_DECAY);
    t.n = 0; t.wk = null; t.wkLog = [];
  }
  /** Camiseta de entreno: el color del club al 55 % con el gris (la misma fórmula que players.js scrimBase). */
  function trainShirt(shirt) {
    var a = typeof shirt === 'number' ? shirt : 0x8a8f98, b = 0x8a8f98, t = 0.55;
    var ch = function (s) { return Math.round((a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * t); };
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }
  var BIB_B = 0x9be52e;   // peto lima (players.js BIB.b), el del compañero de la CPU en los ejercicios
  /** Lo que main.js necesita para jugar un ejercicio de la Carrera con tu jugador: atributos (con la resta de la fatiga), tus
   *  insignias, la equipación de tu club, la sede de tu Carrera (venue), los petos de entreno (scrim: camiseta de entreno, tu peto
   *  del color del club y el lima para la CPU) y el n.º de sesión. null si no se puede entrenar ahora. */
  function drillSetup(c, id) {
    if (sessOk(c, id)) return null;
    var k = myClub(c), fm = fatigueMalus(c), me = copy(c.player.st), mate;
    KEYS.forEach(function (x) { me[x] = clampI(me[x] - fm, 1, 99); });
    if (!isHallC(c) && c.mate && c.mate.st) mate = copy(c.mate.st);
    else mate = genSt(clamp(isHallC(c) ? k.ovr : clubOvr(k), 1, 99), id === 'atk' ? 'S' : id === 'set' ? 'OH' : 'OH', rng(hash(c.seed, 'sessmate', c.season, k.id)));
    var bd = B() && B().forPlayer ? B().forPlayer(c.player) : null; if (bd && !Object.keys(bd).length) bd = null;
    var kt = k.kit || {}, t = sessState(c);
    return { id: id, mode: isHallC(c) ? 'hall' : 'beach', n: t.n + 1, max: TRAIN_SESS, attrs: [[me, mate], null], badges: bd ? [[bd, null], null] : null,
      kit: { kitShirt: kt.shirt, kitAccent: kt.accent, kitShorts: kt.shorts, kitPattern: kt.pattern }, player: c.player.name, club: k.name, attr: SESS_DRILL[id].k, attrName: attrTxt(SESS_DRILL[id].k),
      venue: isHallC(c) ? 'hall' : 'beach', scrim: { base: trainShirt(kt.shirt), shorts: kt.shorts, bib0: kt.shirt, bib1: BIB_B },
      best: typeof t.best[id] === 'number' ? t.best[id] : null, first: !t.seen[id], plan: sessPlan(c), fat: c.fatigue | 0 };
  }

  function badgePower(a) { var b = a.beq || [], s = 0; for (var i = 0; i < b.length; i++) s += (a.bd && a.bd[b[i]]) | 0; return s; }
  /** Fuerza de tu pareja para la simulación rápida: media de los dos + insignias + forma. */
  function teamOvr(c) {
    var f = form(c);
    // + química (0..3 → 0..1,5) − fatiga (la misma resta que en el partido, a la mitad porque solo es tu jugador) + forma del compañero
    return 0.5 * playerOvr(c) + 0.5 * mateOvr(c) + 0.35 * badgePower(c.player) + (f == null ? 0 : (f - 6.5) * 0.8) + 0.5 * chemBonus(c) - 0.5 * fatigueMalus(c) + FORM_SIM * mateFormCap(c, null, (c.mate && c.mate.form) | 0);
  }
  function form(c) { var n = c.notes || []; if (!n.length) return null; var s = 0, k = Math.min(3, n.length); for (var i = n.length - k; i < n.length; i++) s += n[i].nota; return s / k; }
  function avgNota(c) { var n = c.notes || []; if (!n.length) return null; var s = 0; n.forEach(function (x) { s += x.nota; }); return round1(s / n.length); }

  // ------------------------------------------------------------------ objetivos y entrenador
  function expectedPos(c, k) {
    var lst = clubsOf(c, k.lvl).map(clubOvr).sort(function (a, b) { return b - a; });
    return lst.indexOf(clubOvr(k)) + 1;
  }
  function makeObjective(c) { var o = objectiveFor(c, myClub(c)); o.d = diffOf(c); return o; }   // (d: nivel con el que se fijó; cuenta en el sello de la temporada)
  function objectiveFor(c, k) {
    // (dificultad: objE desplaza la posición esperada; + más blando, − más exigente. Normal: 0)
    var e = clamp(expectedPos(c, k) + cd(c).objE, 1, CLUBS_PER), top = k.lvl === LEAGUES.length - 1, low = k.lvl === 0;
    if (e <= 2) return top ? { pos: 1, text: 'Ganar el ' + league(k.lvl).name } : { pos: 2, text: 'Subir de categoría (quedar entre los 2 primeros)' };
    if (e <= 4) return { pos: 4, text: 'Quedar entre los 4 primeros (y jugar el Open)' };
    if (e <= 6) return { pos: 6, text: 'Terminar en mitad de tabla (entre los 6 primeros)' };
    return low ? { pos: 7, text: 'No acabar último' } : { pos: 6, text: 'Evitar el descenso' };
  }
  function coachText(v) { return v < 30 ? 'Descontento' : v < 50 ? 'Tiene dudas' : v < 70 ? 'Confía en ti' : v < 85 ? 'Pieza clave' : 'Intocable'; }
  var COACH_LINE = {
    'Descontento': 'No estoy contento con lo que veo. Necesito notas mejores o buscaré otras soluciones (y no podrás elegir compañero).',
    'Tiene dudas': 'Tienes condiciones, pero me faltan partidos buenos para fiarme del todo de ti.',
    'Confía en ti': 'Vas por buen camino. Sigue así y el equipo irá a más.',
    'Pieza clave': 'Eres una pieza clave del equipo. Los clubes de arriba empiezan a preguntar por ti.',
    'Intocable': 'Eres intocable. Este equipo se construye a tu alrededor.'
  };

  // ------------------------------------------------------------------ crear carrera
  function create(o) {
    o = o || {};
    var seed = (o.seed != null ? +o.seed : (Date.now() ^ (Math.random() * 1e9))) >>> 0, r = rng(seed);
    var roleKey = ROLES[o.role] ? o.role : 'atk', p = P();
    var name = String(o.name || '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Jugador';
    var num = clampI(o.num != null ? o.num : 1, 1, 99), st = genSt(START_OVR, roleKey, null);
    var player = p && p.newAthlete ? p.newAthlete({ num: num, role: ROLES[roleKey].name, name: name, st: st })
      : { num: num, role: ROLES[roleKey].name, name: name, lvl: 1, xp: 0, pts: 0, st: st, matches: 0, bp: {}, bd: {}, beq: [] };
    player.roleKey = roleKey; player.age = 18;
    var c = { v: VER, seed: seed, created: o.now || Date.now(), points: PTS, ctrl: 'one',   // (playa: siempre a 21, el 3r a 15)
      season: 1, week: 0, phase: 'pick', player: player, clubs: genClubs(r), myClub: -1, mate: null, sched: null, res: null,
      cup: null, notes: [], coach: 50, objective: null, offers: [], window: 'start', review: null, last: null,
      stats: newSeasonStats(), career: newSeasonStats(), history: [], trophies: [],
      pick: { round: 0, more: false }, inbox: [], msgN: 0, train: 'bal', tp: { phys: 0, def: 0, atk: 0 }, fatigue: 0, listed: false, squad: [], contract: null, money: 0,
      diff: CDIFF[o.diff] && CDIFF_KEYS.indexOf(o.diff) >= 0 ? o.diff : 'normal', dUse: dZeros() };   // dificultad (sin tiradas de r: misma semilla, misma carrera)
    genSchedule(c);
    // sin club: llegan las ofertas de inicio y eliges tú (acceptOffer). o.autoClub: el de antes (pruebas)
    c.offers = genStartOffers(c, 0);
    msg(c, 'agent', 'Tienes ' + c.offers.length + ' ofertas', 'Soy tu agente. Varios clubes de vóley playa quieren ' + (c.offers.some(function (x) { return x.trial; }) ? 'ficharte o probarte' : 'ficharte') +
      ' para la temporada 1. Compara las fichas (circuito, prestigio, compañero, objetivo, rol y sueldo) y fíjate en el compañero que te ofrecen: un buen compañero es medio partido. Si rechazas todas, llegarán otras de clubes más modestos (y se pierde la prueba, si la hay).');
    cur = c; M = null; lost = false;
    life(c, 'create');
    if (o.autoClub) { var i = 0, best = -1; c.offers.forEach(function (x, j) { if (!x.trial && (best < 0 || x.ovr < best)) { best = x.ovr; i = j; } }); joinClub(c, c.offers[i], c.offers[i].years); }
    save(c);
    return c;
  }

  // ------------------------------------------------------------------ inicio: ofertas y pruebas de clubes
  var ROLE_NEED = [0, 3, 8];   // interés mínimo para cada rol (Rotación / Titular / Titular indiscutible)
  /** Ofertas de inicio (sin club): 3-4 clubes del Circuito Regional (de los modestos; con cada rechazo, de los peores) y en la
   *  primera ronda quizá una prueba en el peor club del Circuito Nacional (te fichan si la superas). */
  function genStartOffers(c, round) {
    var r = rng(hash(c.seed, 'start', round)), reg = clubsOf(c, 0).sort(function (a, b) { return a.q - b.q; });
    var pool = round === 0 ? reg.slice(0, 6) : reg.slice(0, 3);
    shuffle(r, pool);
    var n = round === 0 ? 3 + (r() < 0.5 ? 1 : 0) : (round === 1 ? 3 : 2);
    var out = pool.slice(0, n).map(function (k) { return startOffer(c, k, 0, round, r, false); });
    if (round === 0 && r() < 0.75) {
      var nat = clubsOf(c, 1).sort(function (a, b) { return a.q - b.q; })[0];
      out.push(startOffer(c, nat, 1, round, r, true));
    }
    out.sort(function (a, b) { return (a.trial ? 1 : 0) - (b.trial ? 1 : 0) || b.ovr - a.ovr; });   // la prueba, la última
    return out;
  }
  function startOffer(c, k, lvl, round, r, trial) {
    var inf = clubInfo(c, k), it = round1(START_OVR - (inf.ovr - 5) + (r() - 0.5) * 8 + round * 2.5);   // los peores clubes te necesitan más
    var rl = trial ? 0 : it > ROLE_NEED[2] ? 2 : it > ROLE_NEED[1] ? 1 : 0;
    var mate = newMate(c, k, r);
    var o = { club: k.id, lvl: lvl, ovr: inf.ovr, interest: it, mate: ovrOf(mate.st), mateP: mate, role: ROLE_LV[rl], years: trial ? 1 : 1 + Math.floor(r() * 2),
      salary: salaryOf(lvl, k.q, rl) * (round ? 0.85 : 1) | 0, objective: objectiveFor(c, k).text, start: 1 };
    o.salary = Math.round(o.salary / 50) * 50;
    if (trial) { o.trial = true; o.chance = trialChance(c); }
    return o;
  }
  /** Probabilidad de superar la prueba del Circuito Nacional: con la media inicial ~30 %. */
  function trialChance(c) { return round1(clamp(0.3 + (playerOvr(c) - START_OVR) * 0.04, 0.1, 0.75) * 10) / 10; }
  /** Fase pick: prueba pendiente (c.pick.trial) que ya no cuadra con su oferta → no pendiente; resultado (c.pick.res) dañado → fuera.
   *  Sin ellos (guardados de antes del partidillo) la fase pick funciona igual. */
  function trialSane(o) {
    var p = o.pick, t = p.trial, x = t && typeof t === 'object' && o.offers[t.offer];
    if (t != null && !(x && x.trial && x.club === t.club && Array.isArray(t.goals))) p.trial = null;
    if (p.res != null && !(typeof p.res === 'object' && typeof p.res.letter === 'string')) p.res = null;
  }
  /** Firma por el club de la oferta o (inicio, mitad o fin de temporada): compañero anunciado, plantilla, contrato, objetivo. */
  function joinClub(c, o, years) {
    var k = club(c, o.club), r = rng(hash(c.seed, 'join', c.season, o.club));
    var rl = Math.max(0, ROLE_LV.indexOf(o.role));
    c.myClub = k.id;
    c.mate = o.mateP && o.mateP.st ? copy(o.mateP) : newMate(c, k, r, o.mate != null ? o.mate : null);
    c.mate.chem = 0; c.mate.form = 0; if (typeof c.mate.style !== 'string') c.mate.style = mateStyle(c.mate, r);
    c.squad = genSquad(c, k, c.mate, r);
    years = clampI(years != null ? years : o.years || 1, 1, 3);
    // since: al fichar a final de temporada el contrato empieza en la siguiente (joinClub va antes de c.season++)
    c.contract = { club: k.id, years: years, left: years, role: ROLE_LV[rl], salary: o.salary || salaryOf(k.lvl, k.q, rl), since: c.season + (c.phase === 'off' ? 1 : 0) };
    // confianza inicial: la del rol firmado, menos si saliste con contrato en vigor (o.early) o si te rechazaron la negociación
    c.coach = clamp(ROLE_COACH[rl] + cd(c).coach0 - (o.early ? EARLY_COACH : 0) - (o.negNo ? NEG_COACH : 0), 0, 100); c.listed = false; c.broken = 0;   // (+ coach0 de la dificultad)
    c.coachD = diffOf(c);   // nivel del coach0 aplicado: setDifficulty lo corrige si cambias antes de jugar (seasonDiff ve el objetivo)
    c.joinWk = c.phase === 'off' ? (c.season + 1) * 1000 : wkKey(c);   // tu primera jornada en el club: no te sientan
    sessSane(c).imp = 0; c.ts.cf = 0;   // entrenador nuevo: la impresión en los entrenos empieza de cero
    c.offers = []; c.window = '';
    if (c.phase === 'pick') { c.phase = 'league'; c.week = 0; c.pick = null; }
    if (c.phase !== 'off') { c.objective = makeObjective(c); welcome(c); }
    life(c, 'join', o);
  }
  function welcome(c) {
    var k = myClub(c), ct = c.contract;
    var d = mateOvr(c) - clubOvr(k);
    msg(c, 'coach', 'Bienvenido a ' + k.name, 'Aquí empiezas como ' + ct.role.toLowerCase() + ' (' + plural(ct.years, 'temporada', 'temporadas') + '). Tu compañero en la arena será ' + c.mate.name +
      ' (' + c.mate.role.toLowerCase() + ', ' + c.mate.style.toLowerCase() + ', media ' + mateOvr(c) + (d >= 3 ? ', por encima del nivel del club' : d <= -3 ? ', por debajo del nivel del club: tendrás que tirar tú del equipo' : '') + '). Objetivo del club: ' + c.objective.text.toLowerCase() + '. Cuanto más juguéis juntos, mejor os entenderéis.');
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  /** «Vida» de la Carrera (js/career-life.js: retos, fama, patrocinios, decisiones, rival, tienda, premios, logros, legado), mundo
   *  (career-world.js) y «Carrera con vida» (career-story.js, el último: lee sum.life). Sin los ficheros, nada cambia. */
  function life(c, kind, a, b) { [VB.CareerLife, VB.CareerWorld, VB.CareerStory].forEach(function (Lf) { if (!Lf || !Lf.hook) return; try { Lf.hook(c, kind, a, b); } catch (e) { try { console.error('Career hook ' + kind, e); } catch (e2) { } } }); }
  /** Inicio: rechazar todas → nuevas ofertas, peores (de los clubes más flojos de la Regional y sin prueba). */
  function rejectAll() {
    var c = load(); if (!c || c.phase !== 'pick') return false;
    trialStaleOn(c);
    c.pick.round = Math.min(9, c.pick.round + 1); c.pick.more = false;
    c.offers = genStartOffers(c, c.pick.round);
    msg(c, 'agent', 'Nuevas ofertas', 'Has rechazado todas las ofertas. Han llegado ' + c.offers.length + ' más, de clubes más modestos. Si rechazas otra vez seguirán siendo de los más flojos d' + lname(league(0)) + '.');
    save(c); return true;
  }
  /** Inicio: pedir más tiempo (una vez): el club con menos interés retira su oferta y llega otra de un club que aún no había llamado. */
  function moreTime() {
    var c = load(); if (!c || c.phase !== 'pick' || c.pick.more || !c.offers.length) return null;
    var r = rng(hash(c.seed, 'more', c.pick.round)), used = {}, lo = 0;
    c.offers.forEach(function (x, i) { used[x.club] = 1; if (!x.trial && x.interest < c.offers[lo].interest) lo = i; });
    if (c.offers[lo].trial) lo = c.offers.findIndex ? c.offers.findIndex(function (x) { return !x.trial; }) : 0;
    var cand = clubsOf(c, 0).filter(function (k) { return !used[k.id]; }).sort(function (a, b) { return a.q - b.q; }).slice(0, 6);
    if (!cand.length || lo < 0) return null;
    var gone = c.offers.splice(lo, 1)[0], nk = pick(r, cand), no = startOffer(c, nk, 0, c.pick.round, r, false);
    c.offers.push(no); c.pick.more = true;
    c.offers.sort(function (a, b) { return (a.trial ? 1 : 0) - (b.trial ? 1 : 0) || b.ovr - a.ovr; });
    var gk = club(c, gone.club);
    msg(c, 'agent', 'Una oferta menos, una más', gk.name + ' no quiere esperar y retira su oferta. A cambio ha llamado ' + nk.name + '.');
    save(c); return { gone: gone.club, added: nk.id };
  }
  function newSeasonStats() { return { played: 0, won: 0, sim: 0, bench: 0, pts: 0, kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0 }; }

  // ------------------------------------------------------------------ próximo partido
  function myFixture(c) {
    var k = myClub(c); if (!k) return null;
    if (c.phase === 'league') {
      var wk = c.sched[k.lvl] && c.sched[k.lvl][c.week]; if (!wk) return null;
      for (var i = 0; i < wk.length; i++) if (wk[i][0] === k.id || wk[i][1] === k.id) return { kind: 'league', week: c.week, i: i, home: wk[i][0], away: wk[i][1] };
      return null;
    }
    if (c.phase === 'cup' && c.cup) {
      var rd = c.cup.round, ms = rd === 0 ? c.cup.semis : [c.cup.final];
      for (var j = 0; j < ms.length; j++) if (ms[j] && (ms[j][0] === k.id || ms[j][1] === k.id) && !(c.cup.res[rd] && c.cup.res[rd][j])) return { kind: 'cup', round: rd, i: j, home: ms[j][0], away: ms[j][1] };
    }
    return null;
  }
  /** Perfil de la IA rival según la media del club (calibrado en notes/carrera.md: el perfil pesa mucho más que los atributos). */
  var DIFF_AT = [[80, 'expert'], [56, 'hard'], [38, 'normal'], [0, 'easy']];   // (Difícil desde 56, antes 52: ver §Escalón)
  // Escalón intermedio «Normal suave» (11-nov-2026, muro Regional → Nacional): la IA Normal con el perfil de principiante de la sim
  // (createGame({rookie}): saque sin salto, remate algo más lento, más error, menos defensa y bloqueo; y la ventana de timing amplia
  // para ti). Antes la Regional era toda Fácil (el bot «medio» de simtest ganaba el 99-100 % fuera cual fuera el compañero) y
  // la Nacional toda Normal (con la prueba superada a media 35, 0 de 8). Ahora: Regional < SOFT[0] Fácil, de SOFT[0] en adelante
  // suave (los 3-4 mejores clubes); Nacional < SOFT[1] suave (los 2-3 peores) y Normal desde ahí. Medido en notes/carrera.md §Escalón.
  var SOFT = { reg: 34, regNormal: 38, nat: 42 };
  function softFor(rival) {
    var o = clubOvr(rival), l = rival.lvl | 0;
    return l === 0 ? o >= SOFT.reg && o < SOFT.regNormal : l === 1 && o < SOFT.nat;
  }
  function difficultyFor(rival) {
    // en el Circuito Regional nunca más que Normal suave (con la IA Normal pura los mejores clubes eran un muro: el bot medio, con
    // tu media 35, ganaba el 10 %; el novato, el 0 %)
    if ((rival.lvl | 0) === 0) return clubOvr(rival) >= SOFT.reg ? 'normal' : 'easy';
    var o = clubOvr(rival);
    for (var i = 0; i < DIFF_AT.length; i++) if (o >= DIFF_AT[i][0]) return DIFF_AT[i][1];
    return 'easy';
  }
  /** Nombre de la IA rival para la UI: «Fácil», «Normal suave», «Normal», «Difícil», «Experto». */
  function diffLabel(rival) {
    var d = difficultyFor(rival), nm = VB.DIFF && VB.DIFF[d] && VB.DIFF[d].name || d;
    return softFor(rival) ? nm + ' suave' : nm;
  }

  // ------------------------------------------------------------------ dificultad de la Carrera (12-nov-2026; notes/carrera.md §Dificultad)
  // c.diff elige el nivel; CDIFF reúne TODAS las palancas. Con CDIFF.normal cada fórmula da exactamente lo de siempre (multiplicadores
  // 1, desvíos 0, mismos umbrales): NO tocar sus valores. difficultyFor / softFor / diffLabel siguen siendo la base Normal.
  var CDIFF_KEYS = ['easy', 'normal', 'hard', 'expert'];
  // Escalera de la IA rival: los 4 perfiles de la sim + «Normal suave» (Normal con rookie)
  var STEPS = [{ d: 'easy', soft: false }, { d: 'normal', soft: true }, { d: 'normal', soft: false }, { d: 'hard', soft: false }, { d: 'expert', soft: false }];
  //   shift      peldaños que se mueve la IA rival sobre el peldaño base del club     regEasy  Regional toda en Fácil puro
  //   noSoft     si cae en «Normal suave», sube a Normal                               gate     media mínima para SUBIR a ese perfil por desplazamiento
  //   attr       suma a la media del rival en tus partidos                             xp/train × experiencia de tus partidos / × progreso del entreno
  //   coachPivot nota desde la que el entrenador gana confianza (6,2)                  objWin/objLose confianza al cumplir / no cumplir el objetivo
  //   coach0     suma a la confianza inicial al fichar                                 objE     suma a la posición esperada (objetivo: + más blando)
  //   offer      suma al umbral de interés de las ofertas (+ = menos)                  midNota  suma a la nota mínima de las ofertas de mitad de temporada
  //   simAttr    suma a la media del rival al SIMULAR tus partidos y en el banquillo (en vez de attr: el simulado no ve la IA)
  //   topX       false: en el circuito más alto nadie sube a la IA Experto por desplazamiento (solo los clubes que ya lo son)
  //   attrTop    attr en el circuito más alto (si falta, attr): con attr entero, la élite Experto no se ganaba ni jugando muy bien
  //   shiftTop   shift en el circuito más alto (si falta, shift). Fácil −2: con −1 la élite del Mundial jugaba Difícil y el bot medio con
  //              media 85 no ganaba nada; con −2 (élite Normal, resto Normal suave) gana el Circuito 16 de 28 temporadas (calibrado, 12-nov)
  var CDIFF = {
    easy: { name: 'Fácil', hint: 'Rivales más flojos, más experiencia y un club con paciencia',
      shift: -1, shiftTop: -2, regEasy: true, noSoft: false, gate: {}, attr: -3, simAttr: 0, topX: true, xp: 1.25, train: 1.15,
      coachPivot: 5.8, objWin: 15, objLose: -10, coach0: 5, objE: 1, offer: -2, midNota: -0.3 },
    normal: { name: 'Normal', hint: 'La Carrera tal como está pensada',
      shift: 0, regEasy: false, noSoft: false, gate: {}, attr: 0, simAttr: 0, topX: true, xp: 1, train: 1,
      coachPivot: 6.2, objWin: 15, objLose: -15, coach0: 0, objE: 0, offer: 0, midNota: 0 },
    hard: { name: 'Difícil', hint: 'Rivales un escalón por encima y un club más exigente',
      shift: 1, regEasy: false, noSoft: true, gate: { hard: 46, expert: 76 }, attr: 3, attrTop: 1, simAttr: 3, topX: false, xp: 0.9, train: 0.9,
      coachPivot: 6.3, objWin: 15, objLose: -18, coach0: -3, objE: -1, offer: 2, midNota: 0 },
    expert: { name: 'Experto', hint: 'Para quien domina el juego: cada punto cuesta',
      shift: 2, regEasy: false, noSoft: true, gate: { hard: 38, expert: 66 }, attr: 4, attrTop: 2, simAttr: 4, topX: false, xp: 0.75, train: 0.85,
      coachPivot: 6.5, objWin: 12, objLose: -20, coach0: -6, objE: -2, offer: 4, midNota: 0 }
  };
  var DIFF_MSG = {
    easy: 'Desde el próximo partido juegas en Fácil: rivales más flojos, más experiencia y un club con más paciencia.',
    normal: 'Desde el próximo partido juegas en Normal: la Carrera tal como está pensada.',
    hard: 'Desde el próximo partido juegas en Difícil: rivales un escalón por encima, algo menos de experiencia y un club que exige más.',
    expert: 'Desde el próximo partido juegas en Experto: rivales dos escalones por encima, menos experiencia y un club que no perdona.'
  };
  function dZeros() { return { easy: 0, normal: 0, hard: 0, expert: 0 }; }
  /** Nivel más fácil con partidos en un dUse (null si ninguno). */
  function lowUse(u) { u = u || {}; for (var i = 0; i < CDIFF_KEYS.length; i++) if ((u[CDIFF_KEYS[i]] | 0) > 0) return CDIFF_KEYS[i]; return null; }
  /** Clave de dificultad de la carrera c (o la cargada); 'normal' si falta. */
  function diffOf(c) { c = c || load(); return c && CDIFF_KEYS.indexOf(c.diff) >= 0 ? c.diff : 'normal'; }
  /** Parámetros del nivel de la carrera c. */
  function cd(c) { return CDIFF[diffOf(c)]; }
  /** Desvío de la media del rival en tus partidos jugados: attr (attrTop en el circuito más alto, si el nivel lo fija). */
  function attrOf(c, rival) { var D = cd(c); return D.attrTop != null && (rival.lvl | 0) === LEAGUES.length - 1 ? D.attrTop : D.attr; }
  /** Peldaño base (Normal) de un club: 0 Fácil, 1 Normal suave, 2 Normal, 3 Difícil, 4 Experto (= difficultyFor + softFor). La
   *  única pieza que depende de la rama (en la de pista envuelve su difficultyFor / softFor). */
  function baseStep(rival) {
    var d = difficultyFor(rival);
    return d === 'expert' ? 4 : d === 'hard' ? 3 : d === 'normal' ? (softFor(rival) ? 1 : 2) : 0;
  }
  /** IA rival efectiva en la dificultad de la carrera c. Normal: la de siempre (difficultyFor, softFor, diffLabel). */
  function rivalAI(c, rival) {
    var D = cd(c), b = baseStep(rival), s, top = (rival.lvl | 0) === LEAGUES.length - 1;
    if (D.regEasy && (rival.lvl | 0) === 0) s = 0;
    else {
      s = clamp(b + (top && D.shiftTop != null ? D.shiftTop : D.shift), 0, STEPS.length - 1);
      if (D.noSoft && s === 1) s = 2;
      // subir a un perfil POR DESPLAZAMIENTO exige la media del club (gate); si no llega, un peldaño menos (nunca bajo la base)
      // (topX false: en el circuito más alto el desplazamiento no llega a Experto; con 4 u 8 clubes Experto el título no se gana)
      while (s > b) { var g = D.gate[STEPS[s].d]; if (STEPS[s].d === 'expert' && top && D.topX === false) { s--; continue; } if (g == null || STEPS[s].soft || clubOvr(rival) >= g) break; s--; }
      if (D.noSoft && s === 1) s = 2;
    }
    var st = STEPS[s], nm = (VB.DIFF && VB.DIFF[st.d] && VB.DIFF[st.d].name) || st.d;
    return { step: s, base: b, diff: st.d, soft: st.soft, name: st.soft ? nm + ' suave' : nm };
  }
  /** Dificultad de la temporada en curso para el historial y el palmarés: la más fácil entre las de tus partidos (jugados,
   *  simulados y banquillos) y la del objetivo del club (objective.d: con ella se fijaron objetivo y confianza inicial), o la actual
   *  si no hay nada, y si ha sido mixta. Así un título no se «blanquea» jugando la final en Experto ni fichando en Fácil. */
  function seasonDiff(c) {
    c = c || load(); var u = c && c.dUse || {}, d = null, n = 0;
    var od = c && c.objective && typeof c.objective === 'object' && CDIFF_KEYS.indexOf(c.objective.d) >= 0 ? c.objective.d : null;
    CDIFF_KEYS.forEach(function (k) { if ((u[k] | 0) > 0 || k === od) { n++; if (!d) d = k; } });
    return { d: d || diffOf(c), dm: n > 1 };
  }
  /** Nota media mínima para recibir ofertas a mitad de temporada (6,5 si eres transferible o te incumplieron la promesa). */
  function midNota(c) { c = c || load(); return round1((c && (c.listed || c.broken === c.season) ? 6.5 : 7) + cd(c).midNota); }
  /** Cambia la dificultad de la Carrera (entre partidos; en cualquier fase). Se aplica desde el siguiente cálculo que la use: IA,
   *  atributos, experiencia, entreno, entrenador y ofertas ya. Si aún no hay partidos tuyos esta temporada (liga, jornada 1),
   *  también el objetivo y la confianza inicial del fichaje (coachD); si ya los hay, el objetivo cambia la temporada que viene. */
  function setDifficulty(k) {
    var c = load(); if (!c) return '';
    if (CDIFF_KEYS.indexOf(k) < 0) return 'bad';
    if (M) return 'match';   // partido de Carrera a medias (main.js llama a abortMatch al salir)
    if (diffOf(c) === k) return 'same';
    var low = seasonDiff(c), used = CDIFF_KEYS.reduce(function (s, x) { return s + ((c.dUse && c.dUse[x]) | 0); }, 0), live = c.phase === 'league' || c.phase === 'cup';
    c.diff = k;
    var x = DIFF_MSG[k];
    if (myClub(c) && c.phase === 'league' && used === 0) {
      // aún sin partidos esta temporada: objetivo y confianza inicial se rehacen con el nivel nuevo (cambiar solo para fijarlos, en
      // verano o al fichar, y volver antes de jugar no deja nada a favor)
      var ob = c.objective && c.objective.text; c.objective = makeObjective(c);
      if (CDIFF[c.coachD]) { c.coach = clamp(c.coach + CDIFF[k].coach0 - CDIFF[c.coachD].coach0, 0, 100); c.coachD = k; }
      x += ' Aún no has jugado esta temporada: ' + (ob !== c.objective.text ? 'el objetivo del club pasa a ser ' + c.objective.text.toLowerCase() + '.' : 'el objetivo del club se mantiene.');
    } else if (myClub(c) && live) x += ' El objetivo del club no cambia hasta la temporada que viene.';
    // (solo con la temporada en juego: en verano la temporada ya está sellada y la siguiente empieza de cero)
    if (live && used > 0 && CDIFF_KEYS.indexOf(low.d) < CDIFF_KEYS.indexOf(k))
      x += ((c.dUse && c.dUse[low.d]) | 0) > 0 ? ' Esta temporada ya has jugado en ' + CDIFF[low.d].name + ': sus títulos contarán como ' + CDIFF[low.d].name + '.'
        : ' El objetivo de esta temporada se fijó en ' + CDIFF[low.d].name + ': sus títulos contarán como ' + CDIFF[low.d].name + '.';
    msg(c, 'club', 'Dificultad: ' + CDIFF[k].name, x);
    save(c); return 'ok';
  }
  function next(c) {
    c = c || load(); if (!c) return null;
    var f = myFixture(c); if (!f) return null;
    var me = myClub(c), riv = club(c, f.home === me.id ? f.away : f.home), L = league(me.lvl);
    var label = f.kind === 'league' ? L.name + ' · Jornada ' + (f.week + 1) + ' de ' + WEEKS
      : L.cup + ' · ' + (f.round === 0 ? 'Semifinal' : 'Final');
    // dificultad: IA rival efectiva (rivalAI) y media efectiva del rival (ovrRival = la del club + attr; ovrClub = la real)
    var ai = rivalAI(c, riv);
    return { kind: f.kind, week: f.week, round: f.round, i: f.i, label: label, home: club(c, f.home), away: club(c, f.away), me: me, rival: riv,
      atHome: f.home === me.id, ovrMe: Math.round(teamOvr(c)), ovrRival: clubOvr(riv) + attrOf(c, riv), ovrClub: clubOvr(riv), ovrSim: clubOvr(riv) + cd(c).simAttr, diff: ai.diff, soft: ai.soft, diffName: ai.name,
      cdiff: diffOf(c), bench: f.kind === 'league' && benchFor(c, f) };
  }

  /** Opciones del partido de Carrera para Sim.createGame (+ kit para Players.setKit y datos para la UI). */
  function matchSetup(c) {
    c = c || load(); var n = next(c); if (!n || n.bench) return null;   // en el banquillo no hay partido que jugar (benchNext)
    var r = rng(hash(c.seed, 'riv', c.season, c.phase, n.week, n.round, n.rival.id)), ro = n.ovrRival;
    var rivA = genSt(clamp(ro + 1, 1, 99), 'atk', r), rivB = genSt(clamp(ro - 1, 1, 99), 'cr', r);
    var bd = B() && B().forPlayer ? B().forPlayer(c.player) : null;
    if (bd && !Object.keys(bd).length) bd = null;
    var k = n.me.kit;
    // fatiga (resta a tus atributos), química (suma a los dos en reacción, colocación y recepción) y forma del compañero (suma o
    // resta en todo lo suyo): solo en este partido
    var stMe = copy(c.player.st), stMate = copy(c.mate.st), fm = fatigueMalus(c), ch = chemBonus(c), mf = clampI(c.mate.form | 0, -FORM_MAX, FORM_MAX);
    // techo del compañero: con su desvío (hasta +5) y la racha, nunca más de MATE_CAP sobre el club en el partido (la racha se
    // recorta; la química es de los dos y no cuenta). Puede ser mejor que el club, pero no llevarte en volandas
    mf = mateFormCap(c, n.me, mf);
    KEYS.forEach(function (key) { stMe[key] = clampI(stMe[key] - fm + (CHEM_KEYS.indexOf(key) >= 0 ? ch : 0), 1, 99); stMate[key] = clampI(stMate[key] + mf + (CHEM_KEYS.indexOf(key) >= 0 ? ch : 0), 1, 99); });
    var out = {
      attrs: [[stMe, stMate], [rivA, rivB]],
      badges: bd ? [[bd, null], null] : null,
      points: PTS, venue: VENUE, difficulty: n.diff, ctrl: 'one', ctrlIdx: 0,   // vóley playa (sets a 21, el 3r a 15); en la Carrera solo tu jugador
      rookie: !!n.soft, diffName: n.diffName,   // «Normal suave» = Normal + perfil de principiante (main.js lo pasa a createGame({rookie}))
      cdiff: n.cdiff,   // dificultad de la Carrera (la IA y los atributos de arriba ya la llevan)
      chem: ch, fatigue: fm, mateForm: mf,
      ref: copy(REF[league(n.me.lvl).ref]),
      kit: { kitShirt: k.shirt, kitAccent: k.accent, kitShorts: k.shorts, kitPattern: k.pattern },
      rivalKit: { kitShirt: n.rival.kit.shirt, kitAccent: n.rival.kit.accent, kitShorts: n.rival.kit.shorts, kitPattern: n.rival.kit.pattern },
      career: { season: c.season, phase: c.phase, week: n.week, round: n.round, label: n.label, me: n.me.short, rival: n.rival.short, venue: VENUE,
        meName: n.me.name, rivalName: n.rival.name, player: c.player.name, num: c.player.num, mate: c.mate.name, mateNum: c.mate.num, cdiff: n.cdiff, role: c.player.roleKey }
    };
    life(c, 'setup', out);   // material de la tienda, molestias y reto de la jornada (career-life.js)
    return out;
  }

  // ------------------------------------------------------------------ estadísticas del partido jugado
  var M = null;
  function newM(g) {
    var z = function () { return { kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0, recvP: 0, perfect: 0, good: 0, poor: 0, serves: 0 }; };
    // pista con cambios (titularidad): on = tu jugador en pista; meR = puntos con él en pista; sets en los que estuvo; started /
    // entered (set de tu primera entrada) / pulled (set del primer cambio que te saca); subEv = hubo eventos de cambio
    var on = !(g && g.career && g.career.meOn === false);
    // rt: nota en directo (js/rating.js; sin él, null y la nota final es la de rating())
    var hall = !!(g && g.size === 6), pos = g && (g.ctrlRole || g.career && (g.career.pos || g.career.role)) || 'uni';
    var rt = VB.Rating && g && g.career ? VB.Rating.create({ hall: hall, pos: pos, rol: hall ? RATE6[pos] || RATE6.OH : 1, points: g.points, toWin: g.toWin,
      trial: !!g.career.trial, on: on }) : null;
    if (rt) rt.gl = {};   // objetivos de la prueba ya sumados (id → 1)
    // co: consignas del entrenador en directo (js/consignas.js; g.career.calls = false las apaga: ajuste «Consignas»)
    var co = rt && VB.Consignas && g.career.calls !== false ? VB.Consignas.create({ hall: hall, role: pos, seed: g.seed, trial: !!g.career.trial, on: on }) : null;
    var m = { g: g, p: [z(), z()], last0: -1, lastTeam: -1, server: -1, setter: -1, cand: -1, blocker: -1, prevKind: '', prevTeam: -1, rallies: 0,
      on: on, meR: 0, setNo: 1, sets: on ? [1] : [], started: on, entered: 0, pulled: 0, pullWhy: '', subEv: false, rt: rt, co: co, coU: null, amb: null };
    m.amb = ambNew(g, m);
    return m;
  }
  // ------------------------------------------------------------------ ambiente de Carrera (js/ambiente.js, notes/ambiente.md)
  /** Director del ambiente del partido (VB.Ambiente) o null: solo partidos jugados de Carrera con «Ambiente de Carrera» ≠ Apagado
   *  (g.career.ambient lo pone main.js; sin él, como antes: careertest y los guardados no notan nada). La nota: tarjeta tuya con
   *  VB.Rating.sanction (o extra), «Cabeza fría» con VB.Rating.extra. */
  function ambNew(g, m) {
    var cs = g && g.career, A = VB.Ambiente;
    if (!A || !cs || g.demo || g.autopilot || cs._debug || !cs.ambient || cs.ambient === 'off') return null;
    var a = cs.amb || {}, hall = g.size === 6, W = VB.CareerWorld;
    var faro = false; try { var c0 = cs.mode === 'hall' ? load6() : load(); faro = !!(c0 && W && W.mentorOn && W.mentorOn(c0)); } catch (e) { faro = false; }
    var st = A.create({ seed: g.seed, hall: hall, level: a.level || (cs.ref && cs.ref.chal ? 'top' : 'mid'), mode: cs.ambient === 'calm' ? 'calm' : 'full', trial: !!cs.trial, amb: a,
      me: { name: cs.player || 'Tú', num: cs.num | 0 }, mate: hall ? null : { name: cs.mate || '', num: cs.mateNum | 0 },
      rivalP: cs.rivalP ? { name: String(cs.rivalP) } : null, boss: cs.boss ? { nick: cs.boss.nick || cs.boss.name } : null, faro: faro,
      club: a.short && a.short[0] || cs.meName || cs.me || '', rivalClub: a.short && a.short[1] || cs.rivalName || cs.rival || '',
      rate: function (k, v, txt) { ambRate(m, k, v, txt); } });
    return st;
  }
  function ambRate(m, k, v, txt) {
    var R = VB.Rating; if (!m || !m.rt || !R) return;
    if (k === 'sanction') { if (R.sanction) R.sanction(m.rt, v, txt); else if (R.extra) R.extra(m.rt, 'card', v === 'red' || v === 'delayR' ? -0.35 : -0.15, txt); }
    else if (k === 'cold' && R.extra) R.extra(m.rt, 'cold', +v || 0.05, txt || 'Cabeza fría');
  }
  /** Estado del ambiente del partido g (o null). */
  function amb(g) { return M && g && M.g === g ? M.amb : null; }
  function ambLevel(c, me) { return isHallC(c) ? ref6((lg6(c, me.lid) || {}).strength | 0) : league(me.lvl).ref; }
  /** cs.amb del próximo partido n de la Carrera c (cs: g.career del partido, para el duelo / el jefe / el acta; puede faltar). Solo lectura. */
  function ambCtx(c, n, cs) {
    if (!c || !n || !n.me || !n.rival) return null;
    var hall = isHallC(c), me = n.me, rv = n.rival, tags = [], lvl = ambLevel(c, me);
    var w = c.world && c.world.riv && c.world.riv[rv.id], h = w && +w.h || 0;
    var fin = false, semi = false;
    if (hall) {
      if (n.kind === 'ko' && c.kos && c.kos[n.ko]) { var rl = ((c.kos[n.ko].rounds || [])[n.round] || []).length; fin = rl === 1; semi = rl === 2; }
    } else if (n.kind === 'cup') { fin = n.round === 1; semi = n.round === 0; }
    var home = fin ? -1 : n.atHome ? 0 : 1, heat = { low: 0.25, mid: 0.35, high: 0.45, top: 0.55 }[lvl] || 0.35;
    if (!hall) heat -= 0.05;
    if (hall) {
      if (me.city && rv.city && me.city === rv.city) { tags.push('derbi'); heat += 0.25; }
      else if (me.cc && me.cc === rv.cc && w && (w.m | 0) >= 3 && h >= 0.4) { tags.push('clasico'); heat += 0.12; }
    } else if (cs && (cs.duel || cs.boss)) { tags.push('derbi'); tags.push(cs.boss ? 'jefe' : 'rival'); heat += 0.25; }
    if (fin) { tags.push('final'); heat += 0.25; } else if (semi) { tags.push('semi'); heat += 0.15; }
    if (n.kind === 'league') {
      var N = hall ? weeksOf6(c, me.lid) : WEEKS, wk = n.week | 0;
      var p0 = hall ? posOf6(c, me.id) : posOf(c, me.id), p1 = hall ? posOf6(c, rv.id) : posOf(c, rv.id), tb = hall ? table6(c, me.lid) : table(c, me.lvl), nc = tb ? tb.length : 0;
      if (wk >= N - 3 && nc > 3 && (p0 <= 2 || p0 >= nc - 1)) { tags.push(p0 <= 2 ? 'ascenso' : 'descenso'); heat += 0.15; }
      if (wk >= 3 && p0 > 0 && p0 <= 2 && p1 > 0 && p1 <= 2) { tags.push('cumbre'); heat += 0.1; }
    }
    // revancha: el último cruce de la temporada con este rival lo perdiste (c.notes: núcleo de la Carrera, igual con o sin career-world.js)
    var ln = null; (c.notes || []).forEach(function (x) { if (x && x.rival === rv.id) ln = x; });
    if (ln && !ln.win) { tags.push('revancha'); heat += 0.1; }
    // partidos marcados de career-story (sello del próximo partido: Derbi, Revancha, Duelo…): el ambiente dice lo mismo que el sello
    var SW = VB.CareerStoryWall, stg = '';
    try { stg = SW && SW.tagFor ? SW.tagFor(c) : ''; } catch (e) { stg = ''; }
    if ((stg === 'derby' || stg === 'duel' || stg === 'boss') && tags.indexOf('derbi') < 0) { tags.push('derbi'); if (!hall) tags.push(stg === 'boss' ? 'jefe' : 'rival'); heat += 0.25; }
    if (stg === 'rev' && tags.indexOf('revancha') < 0) { tags.push('revancha'); heat += 0.1; }
    if (stg === 'tv') heat += 0.05;
    if (cs && cs.first) tags.push('estreno');
    heat = Math.min(1, heat + 0.2 * h);
    var F = home === 0 ? [0.55, 0.15] : home === 1 ? [0.15, 0.55] : [0.3, 0.3], k = hall ? 1 : 0.8;
    var hk = home === 1 ? rv : me, nm = function (x) { var s0 = String(x.nameBase || x.name || ''); return s0.length <= 16 ? s0 : String(x.city || x.short || s0.slice(0, 16)); };   // (lo que canta la megafonía: el nombre corto del club o su ciudad)
    return { home: home, heat: Math.round(heat * 100) / 100, fans: [Math.round(F[0] * k * 100) / 100, Math.round(F[1] * k * 100) / 100], tags: tags, level: lvl,
      city: String(hk.city || ''), venue: hall ? String(hk.city || '') : String(hk.beach || hk.city || ''), short: [nm(me), nm(rv)],
      capt: cs && cs.acta && cs.acta.capt ? [cs.acta.capt[0] | 0, cs.acta.capt[1] | 0] : [0, 0], coach: ['', ''], riv: Math.round(h * 100) / 100 };
  }
  function slotOf(g, pl) {
    if (!pl || !g || !g.teams) return -1;
    if (g.size === 6) return pl === g.ctrl ? 0 : pl.team === 0 ? 1 : -1;   // pista (6v6): 0 = tu jugador, 1 = el resto de tu equipo
    var t = g.teams[0]; return t[0] === pl ? 0 : t[1] === pl ? 1 : -1;
  }
  /** Cuenta los eventos de un partido de Carrera (g.career). main.js la llama con los eventos de cada frame. */
  function ingest(evs, g) {
    if (!g || !g.career || g.demo || g.autopilot || !evs) return;
    var who = function (pl) { return slotOf(g, pl); };
    // punto anulado por challenge (sim, endReview): en el MISMO paso vuelve a pitar el punto ('point') y luego 'challengeResult' con
    // overturned (como en ui.js, onEvents/untally). Antes de ese 'point', las estadísticas y la nota en directo vuelven a como
    // estaban antes del punto anulado (con su set y su partido: VB.Rating.undo).
    var ovr = false;
    for (var oi = 0; oi < evs.length; oi++) if (evs[oi] && evs[oi].type === 'challengeResult' && evs[oi].overturned) ovr = true;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i]; if (!e) continue;
      if (e.type === 'newMatch') { var ka = M && M.g === g ? M.amb : null; M = newM(g); if (ka) M.amb = ka; continue; }
      if (!M || M.g !== g) M = newM(g);
      if (ovr && e.type === 'point') { ovr = false; unpoint(M); }
      // punto de castigo (tarjeta roja, Sim.penalty): ni estadísticas, ni jugada en la nota, ni consigna; la nota y el ambiente lo ven
      if (e.type === 'point' && e.penalty) { if (M.rt) VB.Rating.feed(M.rt, e, who); if (M.amb) VB.Ambiente.feed(M.amb, e, g); continue; }
      var s;
      if (e.type === 'hit') {
        if (e.team === 0) {
          s = slotOf(g, e.player); M.last0 = s; M.lastTeam = 0;
          if (s >= 0) {
            var q = M.p[s];
            if (e.human) { if (e.grade === 'perfect') q.perfect++; else if (e.grade === 'good') q.good++; else if (e.grade === 'poor') q.poor++; }
            if (e.kind === 'serve') { M.server = s; q.serves++; M.setter = -1; M.cand = -1; M.blocker = -1; }
            else {
              var recv = e.recv != null ? !!e.recv : (e.touch === 1 && M.prevKind === 'serve' && M.prevTeam === 1);
              var dig = e.dig != null ? !!e.dig : (e.touch === 1 && M.prevKind === 'spike' && M.prevTeam === 1 && e.shot !== 'shank');
              if (recv && e.grade === 'perfect') q.recvP++;
              if (dig) q.digs++;
              if (e.touch === 1) { M.setter = -1; M.cand = -1; }
              if (e.touch === 2 && e.kind !== 'spike') M.setter = s;
              if (e.kind === 'spike') M.cand = e.touch === 3 && M.setter >= 0 && M.setter !== s ? M.setter : -1;
            }
          }
        } else { M.lastTeam = 1; if (e.kind === 'serve') { M.server = -1; M.setter = -1; M.cand = -1; M.blocker = -1; } }
        M.prevKind = e.kind; M.prevTeam = e.team;
      } else if (e.type === 'block') {
        if (e.team === 0) M.blocker = slotOf(g, e.player);
        M.prevKind = 'block'; M.prevTeam = e.team;
      } else if (e.type === 'sub' || e.type === 'lineup') {   // cambios (pista): entras o sales
        M.subEv = true;
        if (e.meIn && !M.on) { M.on = true; if (!M.entered) M.entered = M.setNo; if (M.sets.indexOf(M.setNo) < 0) M.sets.push(M.setNo); }
        if (e.meOut && M.on) {
          M.on = false; if (!M.pulled) { M.pulled = M.setNo; M.pullWhy = String(e.why || ''); }
          // al empezar el set (lineup, antes del primer saque): newSet ya lo había apuntado y no lo has jugado
          if (e.type === 'lineup') { var si = M.sets.indexOf(M.setNo); if (si >= 0) M.sets.splice(si, 1); }
        }
      } else if (e.type === 'newSet') {
        M.setNo = e.setNo > 0 ? e.setNo | 0 : M.setNo + 1;
        if (M.on && M.sets.indexOf(M.setNo) < 0) M.sets.push(M.setNo);
      } else if (e.type === 'point') {
        // (y quién tocó qué en el peloteo: un challenge que da la vuelta a un remate «fuera» lo vuelve a pitar como punto en el mismo
        // paso, y sin esto el remate ya no tenía dueño —last0 = -1— y no contaba; VB.Rating sí lo restaura. 18-nov-2026)
        M.undo = { p: [Object.assign({}, M.p[0]), Object.assign({}, M.p[1])], rallies: M.rallies, meR: M.meR,
          tr: [M.last0, M.lastTeam, M.server, M.setter, M.cand, M.blocker, M.prevKind, M.prevTeam] };
        M.rallies++;
        if (M.on) M.meR++;
        if (e.team === 0) {
          if ((e.how === 'kill' || e.how === 'tip') && M.last0 >= 0) {
            M.p[M.last0].kills++;
            var as = e.assist !== undefined ? slotOf(g, e.assist) : M.cand;
            if (as >= 0 && as !== M.last0) M.p[as].assists++;
          } else if (e.how === 'ace' && M.server >= 0) M.p[M.server].aces++;
          else if (e.how === 'block' && M.blocker >= 0) M.p[M.blocker].blocks++;
        } else {
          var fp = e.player && e.player.team === 0 ? slotOf(g, e.player) : -1;
          if (fp >= 0) M.p[fp].errors++;
          else if (e.how === 'error' && M.lastTeam === 0 && M.last0 >= 0) M.p[M.last0].errors++;
        }
        M.last0 = -1; M.lastTeam = -1; M.server = -1; M.setter = -1; M.cand = -1; M.blocker = -1; M.prevKind = ''; M.prevTeam = -1;
      }
      // nota en directo: el mismo evento (los cambios ya los mira feed; setOn es idempotente) y, en la prueba, los objetivos «al menos»
      if (M.rt) {
        VB.Rating.feed(M.rt, e, who);
        if (e.type === 'sub' || e.type === 'lineup') VB.Rating.setOn(M.rt, M.on, M.rallies);
        if (e.type === 'point' && g.career.trial) trialGoalsLive(M, g.career.goals);
      }
      // consignas del entrenador: después de la nota (el 'point' ya ha guardado su instantánea para el challenge)
      if (M.co) {
        M.co.on = M.on;
        if (e.type === 'point') M.coU = VB.Consignas.snap(M.co);
        var cr = VB.Consignas.feed(M.co, e, who, g);
        if (cr && cr.ok && M.rt) { var cd = VB.Consignas.take(M.co); if (cd) VB.Rating.extra(M.rt, 'coach', cd, 'Consigna cumplida'); }
      }
      // ambiente de Carrera (grada, árbitro, tarjetas, diálogos): después de la nota y de las consignas
      if (M.amb) VB.Ambiente.feed(M.amb, e, g);
    }
  }
  /** Deshace el último 'point' contado (punto anulado por challenge): estadísticas, puntos y nota en directo. */
  function unpoint(m) {
    var u = m.undo; m.undo = null;
    if (u) {
      m.p[0] = u.p[0]; m.p[1] = u.p[1]; m.rallies = u.rallies; m.meR = u.meR;
      if (u.tr) { m.last0 = u.tr[0]; m.lastTeam = u.tr[1]; m.server = u.tr[2]; m.setter = u.tr[3]; m.cand = u.tr[4]; m.blocker = u.tr[5]; m.prevKind = u.tr[6]; m.prevTeam = u.tr[7]; }
    }
    if (m.rt) VB.Rating.undo(m.rt);
    if (m.co && m.coU) { VB.Consignas.restore(m.co, m.coU); m.coU = null; }
    if (m.amb && VB.Ambiente) VB.Ambiente.undo(m.amb);
  }
  /** Objetivos «al menos» de la prueba cumplidos durante el partidillo: su TRIAL_GOAL entra ya en la nota en directo (con aviso). Los
   *  «como mucho» se suman al final (trialGrade). */
  function trialGoalsLive(m, goals) {
    (goals || []).forEach(function (gl) {
      if (gl.op !== '>=' || m.rt.gl[gl.id] || (m.p[0][gl.stat] | 0) < gl.n) return;
      m.rt.gl[gl.id] = 1; VB.Rating.bonus(m.rt, 'goal', TRIAL_GOAL, 'Objetivo: ' + gl.txt);
    });
  }
  function abortMatch() { M = null; }
  /** Nota en directo del partido de Carrera g (ui.js, cada frame): { v, on, sc, seq, log, trial } (objeto reutilizado; log = el
   *  registro de avisos de VB.Rating, solo lectura) o null (sin rating.js, sin partido o de otra partida). sc: pista con cambios,
   *  menos de NOTA_MIN_R puntos en pista y sin ser titular en pista (aún sin nota: «s. c.»). */
  var LIVE = { v: 6, on: true, sc: false, seq: 0, log: [], trial: false, coach: null };
  function liveRating(g) {
    if (!M || !M.rt || !g || M.g !== g) return null;
    LIVE.v = M.rt.v; LIVE.on = M.rt.on; LIVE.seq = M.rt.seq; LIVE.log = M.rt.log; LIVE.trial = !!(g.career && g.career.trial);
    LIVE.coach = M.co ? M.co.c : null;   // consigna del punto: { id, txt, state: 'on'|'ok'|'miss'|'gone', seq } (solo lectura)
    // (titular en pista: con nota desde el primer punto; «s. c.» para quien sale del banquillo, o es cambiado, sin llegar a NOTA_MIN_R)
    LIVE.sc = g.size === 6 && (M.subEv || typeof g.meR === 'number') && M.meR < NOTA_MIN_SUB && !(M.started && M.on);
    return LIVE;
  }

  /** Resumen del ambiente del partido (VB.Ambiente.sum) o null; también en g.career.ambSum para el titular (recap.js). */
  function ambSum(m, g) {
    var s = m && m.amb && VB.Ambiente ? VB.Ambiente.sum(m.amb) : null;
    if (s && g && g.career) g.career.ambSum = s;
    return s;
  }
  /** Nota 1-10 del partido (estilo periódico deportivo). me = estadísticas de tu jugador; r = {win, sets}. */
  // Calibrado (arreglos finales del sprint): con control «uno» tu jugador remata casi todo (15-18 remates punto por partido), así
  // que con el remate a 0,32 la nota se iba casi siempre a 10. Pesos medidos con los bots de simtest en la Regional (temporada 1):
  // novato ~6,3, medio ~7,5, bueno ~8,5; por encima de 8,5 la nota se comprime (techo suave) para que 10 sea excepcional.
  var RATE_W = { kills: 0.055, aces: 0.2, blocks: 0.2, assists: 0.045, digs: 0.035, recvP: 0.03, perfect: 0.02, poor: -0.015, errors: -0.17 };
  function rating(me, r, rallies, kmul) {
    me = me || {};
    // kmul (pista, 6v6): en el 6v6 tu jugador toca muchos menos balones que en la pareja; la parte de estadísticas se escala por
    // puesto (RATE6). En la playa no se pasa (× 1, la nota de siempre)
    var k = 40 / Math.max(24, rallies || 40) * (kmul || 1);   // por cada 40 puntos jugados (partidos a 11 y a 25 comparables)
    var v = 0;
    for (var key in RATE_W) v += RATE_W[key] * (me[key] || 0);
    var res = r.win ? (r.sets && r.sets[1] === 0 ? 0.9 : 0.6) : (r.sets && r.sets[0] === 1 ? -0.3 : -0.6);
    var raw = 5.4 + v * k + res;
    if (raw > 8.5) raw = 8.5 + 1.5 * (1 - Math.exp(-(raw - 8.5) / 1.5));   // techo suave: 10 solo con un partido descomunal
    return round1(clamp(raw, 1, 10));
  }

  // ------------------------------------------------------------------ cerrar un partido tuyo
  function recordMine(c, f, sets, setScores) {
    var me = myClub(c), mine = f.home === me.id, s = mine ? sets : [sets[1], sets[0]], sc = setScores.map(function (x) { return mine ? x.slice() : [x[1], x[0]]; });
    var rec = { a: f.home, b: f.away, s: s, sc: sc, mine: 1 };
    if (f.kind === 'league') { (c.res[me.lvl][f.week] = c.res[me.lvl][f.week] || [])[f.i] = rec; }
    else { (c.cup.res[f.round] = c.cup.res[f.round] || [])[f.i] = rec; }
    return rec;
  }
  /** Simula lo que queda de la jornada (todas las ligas) y avanza. Devuelve los resultados de tu liga. */
  function finishRound(c) {
    var me = myClub(c), out = [];
    if (c.phase === 'league') {
      for (var L = 0; L < LEAGUES.length; L++) {
        var wk = c.sched[L][c.week], arr = c.res[L][c.week] = c.res[L][c.week] || [];
        for (var i = 0; i < wk.length; i++) {
          if (!arr[i]) {
            var a = club(c, wk[i][0]), b = club(c, wk[i][1]), r = rng(hash(c.seed, 'm', c.season, L, c.week, i));
            var q = quickSim(clubOvr(a) + (r() - 0.5) * 4, clubOvr(b) + (r() - 0.5) * 4, r, PTS);
            arr[i] = { a: a.id, b: b.id, s: q.sets, sc: q.setScores };
          }
          if (L === me.lvl) out.push(arr[i]);
        }
      }
      c.week++;
      c.offers = c.window === 'mid' ? [] : c.offers; if (c.window === 'mid') c.window = '';
      if (c.week === MID_WEEK) midWindow(c);
      if (c.week >= WEEKS) startCup(c);
    } else if (c.phase === 'cup') {
      var cu = c.cup, rd = cu.round, ms = rd === 0 ? cu.semis : [cu.final], ar = cu.res[rd] = cu.res[rd] || [];
      for (var j = 0; j < ms.length; j++) {
        if (!ar[j]) {
          var ca = club(c, ms[j][0]), cb = club(c, ms[j][1]), r2 = rng(hash(c.seed, 'cup', c.season, rd, j));
          var q2 = quickSim(clubOvr(ca) + (r2() - 0.5) * 4, clubOvr(cb) + (r2() - 0.5) * 4, r2, PTS);
          ar[j] = { a: ca.id, b: cb.id, s: q2.sets, sc: q2.setScores };
        }
        out.push(ar[j]);
      }
      if (rd === 0) { cu.final = [winnerOf(ar[0]), winnerOf(ar[1])]; cu.round = 1; }
      else { cu.champion = winnerOf(ar[0]); cu.round = 2; endSeason(c); }
      // sin ti en la final: se juega sola
      if (c.phase === 'cup' && cu.round === 1 && !myFixture(c)) return out.concat(finishRound(c));
    }
    return out;
  }
  function winnerOf(m) { return m.s[0] > m.s[1] ? m.a : m.b; }
  function startCup(c) {
    var me = myClub(c), t = table(c, me.lvl);
    c.phase = 'cup';
    c.cup = { lvl: me.lvl, semis: [[t[0].id, t[3].id], [t[1].id, t[2].id]], final: null, res: [], round: 0, champion: -1 };
    if (!myFixture(c)) finishRound(c);   // no clasificado: la copa se juega sola
  }

  /** Resumen común a partido jugado y simulado: nota, experiencia, entrenador, insignias, resto de la jornada. */
  function closeMine(c, f, res, me, sim, extra) {
    var win = res.sets[0] > res.sets[1], L = league(myClub(c).lvl), rival = club(c, f.home === c.myClub ? f.away : f.home), D = cd(c), dk = diffOf(c);
    // dificultad: el partido cuenta en su nivel (antes de finishRound, que puede cerrar la temporada)
    if (!c.dUse || typeof c.dUse !== 'object') c.dUse = dZeros();
    c.dUse[dk] = (c.dUse[dk] | 0) + 1;
    var nota = me.nota;
    var mpts = (me.kills || 0) + (me.aces || 0) + (me.blocks || 0);
    // tus puntos cuentan hasta 10 por partido (con control «uno» rematas casi todo y la XP jugada se disparaba)
    var xp = Math.round((40 + 22 * nota + (win ? 40 : 0) + 6 * Math.min(mpts, 10)) * L.xp * (sim ? 0.5 : 1) * D.xp * XP_K);   // (× xp de la dificultad y XP_K)
    var lv = addXP(c.player, xp);
    // entrenador
    var ct0 = coachText(c.coach);
    c.coach = clamp(Math.round(c.coach + (nota - D.coachPivot) * 2.5 + (win ? 1 : -1)), 0, 100);   // (pivote de la dificultad; Normal 6,2)
    coachFloor(c);   // titular indiscutible: la confianza no baja de ROLE_FLOOR
    pay(c); promoteCheck(c);   // sueldo de la jornada; de la rotación a titular con PROMOTE_AT
    if (coachText(c.coach) !== ct0) msg(c, 'coach', 'El entrenador: «' + coachText(c.coach) + '»', COACH_LINE[coachText(c.coach)] || '');
    // gestión: química con el compañero (jugando juntos; simulado cuenta menos), su forma y la semana de entrenamiento
    if (c.mate) c.mate.chem = clamp((c.mate.chem | 0) + (sim ? 3 : 5), 0, 100);
    var mf0 = c.mate ? c.mate.form | 0 : 0, mf = mateFormStep(c);
    var au = sessAuto(c);   // entreno automático: las sesiones libres de la jornada, en Rápido (antes del entreno semanal)
    var tr = trainWeek(c);
    // temporada
    var S = c.stats, T = c.career;
    [S, T].forEach(function (x) {
      x.played++; if (win) x.won++; if (sim) x.sim++;
      x.pts += mpts; x.kills += me.kills || 0; x.aces += me.aces || 0; x.blocks += me.blocks || 0; x.assists += me.assists || 0; x.digs += me.digs || 0; x.errors += me.errors || 0;
    });
    c.notes.push({ nota: nota, win: win ? 1 : 0, sim: sim ? 1 : 0, kind: f.kind, wk: f.kind === 'league' ? f.week : f.round, rival: rival.id, s: res.sets.slice() });
    var badges = extra && extra.badges || [];
    var label = f.kind === 'league' ? 'Jornada ' + (f.week + 1) : (f.round === 0 ? 'Semifinal del Open' : 'Final del Open');
    var phase0 = c.phase, season0 = c.season;
    sessClose(c);   // sesiones de entrenamiento: la jornada se cierra (contador a 0; sin sesiones, la impresión baja)
    recordMine(c, f, res.sets, res.setScores);
    var round = finishRound(c);
    var sum = { season: season0, phase: phase0, label: label, rival: rival.id, rivalName: rival.name, win: win, sets: res.sets.slice(), setScores: res.setScores.map(function (x) { return x.slice(); }),
      sim: !!sim, nota: nota, me: me, xp: xp, lvlUp: lv.lvlUp, lvl: lv.lvl, ptsGained: lv.pts, badges: badges, coach: c.coach, train: tr, auto: au, chem: c.mate ? c.mate.chem : 0, mateForm: mf, mateForm0: mf0,
      round: round.map(function (m) { return { a: m.a, b: m.b, s: m.s }; }), offers: c.window === 'mid' ? c.offers.length : 0, review: phase0 !== c.phase && c.phase === 'off' };
    if (extra && extra.rt) sum.rt = extra.rt;   // nota en directo: { nota, best, worst } (solo en c.last, no en c.notes)
    if (extra && extra.amb) sum.amb = extra.amb;   // ambiente: tarjetas, protestas, calor (career-life / career-world lo leen)
    life(c, 'match', sum, f);
    c.last = sum;
    save(c);
    return sum;
  }

  /** main.js, al llegar gameOver de un partido de Carrera: r = {sets:[tú, rival], setScores, win}. stats = tus números (opcional). */
  function matchDone(r, stats, g) {
    var c = load(); if (!c || !r || !r.sets) return null;
    var f = myFixture(c); if (!f) return null;
    var m = M && (!g || M.g === g) ? M : newM(g);
    var me = stats || m.p[0];
    var rallies = m.rallies || (r.setScores || []).reduce(function (s, x) { return s + x[0] + x[1]; }, 0);
    var res = { sets: [r.sets[0] | 0, r.sets[1] | 0], setScores: (r.setScores || []).map(function (x) { return [x[0] | 0, x[1] | 0]; }) };
    var win = res.sets[0] > res.sets[1];
    var mine = { kills: me.kills | 0, aces: me.aces | 0, blocks: me.blocks | 0, assists: me.assists | 0, digs: me.digs | 0, errors: me.errors | 0,
      recvP: me.recvP | 0, perfect: me.perfect | 0, good: me.good | 0, poor: me.poor | 0 };
    // con «Los dos» llevas a la pareja entera: la nota mide lo que hacen los dos (con «uno», solo tu jugador)
    // (v1 tenía control «Los dos» y sumaba lo de la pareja; en v2 la Carrera siempre es «uno»: la nota es solo tuya)
    // nota en directo (js/rating.js): la del partido es la que llevabas al final; sin ella (o con stats de fuera), rating()
    var rt = m === M && m.rt && !stats ? VB.Rating.close(m.rt, res) : null;
    mine.nota = rt ? rt.nota : rating(mine, { win: win, sets: res.sets }, rallies);
    // insignias (sus contadores los lleva VB.Badges con los eventos que le pasa ui.js; aquí se cierran sobre tu atleta)
    var badges = [];
    try { if (B() && B().endMatch && g) badges = B().endMatch(g, win, [c.player, null]) || []; } catch (e) { badges = []; }
    var asum = ambSum(m, g);
    M = null;
    return closeMine(c, f, res, mine, false, { badges: badges, rt: rt ? { nota: rt.nota, best: rt.best, worst: rt.worst } : null, amb: asum });
  }
  /** Simula tu partido (resultado según medias + forma; experiencia reducida). */
  function simulateNext(c) {
    c = c || load(); if (!c) return null;
    var f = myFixture(c); if (!f) return null;
    if (next(c).bench) return benchNext(c);   // en el banquillo: la jornada se juega sin ti
    var n = next(c), r = rng(hash(c.seed, 'mine', c.season, c.phase, f.week, f.round, c.notes.length));
    // (dificultad: el simulado usa ovrSim = club + simAttr; no ve la IA, así que en Fácil no se le regala el attr del jugado)
    var q = quickSim(teamOvr(c) + (r() - 0.5) * 4, n.ovrSim + (r() - 0.5) * 4, r, PTS), win = q.sets[0] > q.sets[1];
    var d = teamOvr(c) - n.ovrSim, sh = 0.5 + 0.5 * clamp((playerOvr(c) - mateOvr(c)) / 30 + 0.5, 0.2, 0.8);
    var tot = q.setScores.reduce(function (s, x) { return s + x[0]; }, 0), mp = Math.round(tot * 0.42 * sh);
    var kills = Math.round(mp * 0.72), aces = Math.round(mp * 0.12), blocks = Math.max(0, mp - kills - aces);
    var me = { kills: kills, aces: aces, blocks: blocks, assists: Math.round(tot * 0.2 * (1 - sh)), digs: Math.round(3 + r() * 5), errors: Math.round(1 + r() * 3), recvP: 0, perfect: 0, good: 0, poor: 0 };
    me.nota = round1(clamp(6.1 + d * 0.04 + (win ? 0.6 : -0.6) + (r() - 0.5) * 1.6, 3, 9.5));
    // insignias: los partidos simulados solo cuentan para «partidos jugados» y «victorias»
    var badges = [];
    var Bd = B();
    if (Bd && Bd.levelFor && Bd.LIST) {
      var a = c.player; a.bp = a.bp || {}; a.bd = a.bd || {}; a.beq = a.beq || [];
      a.bp.motor = (a.bp.motor | 0) + 1; if (win) a.bp.lider = (a.bp.lider | 0) + 1;
      ['motor', 'lider'].forEach(function (id) {
        var prev = (a.bd[id] | 0), lv = Bd.levelFor(id, a.bp[id] | 0);
        if (lv > prev) { a.bd[id] = lv; var eq = prev === 0 && Bd.equip ? Bd.equip(a, id) : a.beq.indexOf(id) >= 0;
          badges.push({ slot: 0, num: a.num, id: id, name: Bd.BY[id].name, lvl: lv, prev: prev, tier: Bd.TIERS[lv], eq: eq }); }
      });
    }
    return closeMine(c, f, { sets: q.sets, setScores: q.setScores }, me, true, { badges: badges });
  }

  // ------------------------------------------------------------------ clasificación
  function table(c, lvl) {
    c = c || load();
    var rows = {}, ids = clubsOf(c, lvl).map(function (k) { return k.id; });
    ids.forEach(function (id) { rows[id] = { id: id, pj: 0, g: 0, p: 0, sf: 0, sc: 0, pf: 0, pc: 0, pts: 0 }; });
    (c.res[lvl] || []).forEach(function (wk) {
      (wk || []).forEach(function (m) {
        if (!m || !rows[m.a] || !rows[m.b]) return;
        var A = rows[m.a], Bm = rows[m.b], pp = setPts(m.s);
        A.pj++; Bm.pj++; A.pts += pp[0]; Bm.pts += pp[1];
        if (m.s[0] > m.s[1]) { A.g++; Bm.p++; } else { Bm.g++; A.p++; }
        A.sf += m.s[0]; A.sc += m.s[1]; Bm.sf += m.s[1]; Bm.sc += m.s[0];
        m.sc.forEach(function (x) { A.pf += x[0]; A.pc += x[1]; Bm.pf += x[1]; Bm.pc += x[0]; });
      });
    });
    var arr = ids.map(function (id) { return rows[id]; });
    arr.sort(function (a, b) {
      return b.pts - a.pts || b.g - a.g || ((b.sf + 1) / (b.sc + 1)) - ((a.sf + 1) / (a.sc + 1)) || ((b.pf + 1) / (b.pc + 1)) - ((a.pf + 1) / (a.pc + 1)) || a.id - b.id;
    });
    arr.forEach(function (r, i) { r.pos = i + 1; });
    return arr;
  }
  function posOf(c, id) { var k = club(c, id), t = table(c, k.lvl); for (var i = 0; i < t.length; i++) if (t[i].id === id) return i + 1; return 0; }

  // ------------------------------------------------------------------ ofertas
  function offerScore(c) {
    var an = avgNota(c);
    return playerOvr(c) + (an == null ? 0 : (an - 6) * 6) + (c.coach - 50) / 10 + 0.5 * badgePower(c.player) + (c.listed ? LISTED_BONUS : 0) + (c.broken === c.season ? BROKEN_BONUS : 0) +
      (VB.CareerLife && VB.CareerLife.offerBonus ? VB.CareerLife.offerBonus(c) + (c.life && c.life.scout === c.season ? 2 : 0) : 0);   // fama, agente estrella y ojeador
  }
  var LISTED_BONUS = 5, LISTED_COACH = 8;   // transferible: más interés de los clubes, menos confianza del entrenador
  /** Liga de un club la temporada que viene (fin de temporada: con los ascensos y descensos ya decididos en c.pendingMoves). */
  function nextLvl(c, k) {
    var mv = (c.pendingMoves || []).filter(function (m) { return m.id === k.id; })[0];
    return mv ? mv.to : k.lvl;
  }
  /** Nivel de los clubes la temporada que viene: q de los que suben/bajan (entran abajo/arriba de su nueva liga) y paseo
   *  aleatorio del resto. Se decide al acabar la temporada (c.pendingQ) para que las ofertas enseñen la media REAL del club y del
   *  compañero de la temporada siguiente; applyMoves lo aplica tal cual. */
  function nextQs(c, moves) {
    var r = rng(hash(c.seed, 'moves', c.season)), out = {}, moved = {};
    (moves || []).forEach(function (mv) {
      var k = club(c, mv.id); if (!k) return;
      moved[k.id] = 1;
      out[k.id] = round1(clamp(mv.to > k.lvl ? 0.12 + r() * 0.3 : 0.55 + r() * 0.35, 0.02, 0.98) * 10) / 10;
    });
    c.clubs.forEach(function (k) {
      if (moved[k.id]) return;
      out[k.id] = Math.round(clamp(k.q + (r() - 0.5) * 0.24 + (0.5 - k.q) * 0.1, 0.02, 0.98) * 100) / 100;
    });
    return out;
  }
  function genOffers(c, mid) {
    var me = myClub(c), sc = offerScore(c), r = rng(hash(c.seed, 'off', c.season, mid ? 'mid' : 'end')), cand = [], an = avgNota(c) || 0;
    // a mitad de temporada solo si estás jugando muy bien (nota media ≥ 7; antes casi cualquiera recibía ofertas en la jornada 7)
    // (transferible: basta con 6,5; el club ya sabe que te quieres ir)
    // (dificultad: midNota(c) suma su desvío; el umbral de interés, D.offer)
    var D = cd(c);
    if (mid && an < midNota(c)) return [];
    // al final de la temporada las ofertas se miden con la liga y el nivel (q) de la temporada SIGUIENTE (antes un club que
    // descendía ofrecía «Liga Nacional» y fichabas por él en la Regional, y la media anunciada no era la real)
    var pq = !mid && c.pendingQ ? c.pendingQ : null;
    var lv = function (k) { return mid ? k.lvl : nextLvl(c, k); }, qOf = function (k) { return pq && pq[k.id] != null ? pq[k.id] : k.q; }, myL = lv(me), tc = null;
    c.clubs.forEach(function (k) {
      var kl = lv(k), L = league(kl), q = qOf(k);
      if (k.id === me.id || kl < myL || kl > myL + 1) return;
      if (kl === myL && q <= qOf(me) + 0.05) return;   // solo clubes mejores que el tuyo
      if (mid && kl > myL && an < 7.5 + D.midNota) return;   // a mitad de temporada, saltar de liga exige notas aún más altas
      var o = L.ovr[0] + (L.ovr[1] - L.ovr[0]) * q, thr = o - 5 + (kl > myL ? 2 : 0) + D.offer;
      var it = sc - thr + (r() - 0.5) * 8 - (mid ? 3 : 0);
      if (it > 0) { var rl = it > ROLE_NEED[2] ? 2 : it > ROLE_NEED[1] ? 1 : 0;
        cand.push({ club: k.id, lvl: kl, ovr: Math.round(o), q: q, interest: round1(it), mate: Math.round(o),
          role: ROLE_LV[rl], years: 1 + Math.floor(r() * 3), salary: salaryOf(kl, q, rl) }); }
      // (prueba, 17-nov-2026: el club mejor —liga de arriba o claramente más fuerte— que te quiere casi lo justo te invita a prueba)
      else if (it > -TRIAL_GAP && (kl > myL || q > qOf(me) + 0.15) && (!tc || it > tc.it)) tc = { k: k, kl: kl, q: q, o: o, it: it };
    });
    // las 3 mejores, con preferencia por los clubes de la liga de arriba; se muestran de mejor a peor club
    cand.sort(function (a, b) { return (b.interest + 4 * (b.lvl - myL)) - (a.interest + 4 * (a.lvl - myL)); });
    cand = cand.slice(0, 3);
    if (tc) cand.push({ club: tc.k.id, lvl: tc.kl, ovr: Math.round(tc.o), q: tc.q, interest: round1(tc.it), mate: Math.round(tc.o), role: ROLE_LV[0], years: 1,
      salary: salaryOf(tc.kl, tc.q, 0), trial: true, chance: trialChanceIt(tc.it) });   // invitación a prueba (una por ventana)
    // ficha completa: el compañero que tendrías (el mismo que te dan al firmar; media = la del club de la temporada que viene +
    // su desvío propio, mateOff) y el objetivo aproximado. Un club con buen compañero es un argumento para fichar
    cand.forEach(function (x) { var rm = rng(hash(c.seed, 'offmate', c.season, mid ? 'mid' : 'end', x.club)), mt = newMate(c, club(c, x.club), rm, clamp(x.ovr + mateOff(rm), 22, 92)); x.mateP = mt; x.mate = ovrOf(mt.st); });
    cand.sort(function (a, b) { return (a.trial ? 1 : 0) - (b.trial ? 1 : 0) || b.lvl - a.lvl || b.ovr - a.ovr; });   // (la prueba, la última)
    return cand;
  }
  function midWindow(c) {
    var o = genOffers(c, true);
    c.offers = o; c.window = o.length ? 'mid' : '';
    if (o.length) msg(c, 'offer', 'Ventana de fichajes: ' + plural(o.length, 'oferta', 'ofertas'), 'Tu agente ha recibido ' + plural(o.length, 'oferta', 'ofertas') + ' a mitad de temporada. Caducan al jugar o simular el siguiente partido. Míralas en Club › Ofertas.');
    // el entrenador repasa el objetivo a mitad de temporada
    var pos = posOf(c, c.myClub), okp = pos <= c.objective.pos;
    msg(c, 'obj', 'Mitad de temporada: ' + ordn(pos), okp ? 'Vamos ' + ordn(pos) + ' y el objetivo (' + c.objective.text.toLowerCase() + ') está a nuestro alcance. No bajemos el ritmo.'
      : 'Vamos ' + ordn(pos) + ' y así no llegamos al objetivo (' + c.objective.text.toLowerCase() + '). Necesito más de ti en la segunda vuelta.');
  }

  // ------------------------------------------------------------------ fin de temporada
  function endSeason(c) {
    var me = myClub(c), lvl = me.lvl, t = table(c, lvl), pos = posOf(c, me.id), L = league(lvl);
    var objOk = pos <= c.objective.pos;
    var D = cd(c), sd = seasonDiff(c);   // dificultad: premio/castigo del objetivo y sello de la temporada (la más fácil usada)
    c.coach = clamp(c.coach + (objOk ? D.objWin : D.objLose), 0, 100); coachFloor(c);
    var champ = t[0].id, cupWin = c.cup && c.cup.champion === me.id, cupFinal = c.cup && c.cup.final && (c.cup.final[0] === me.id || c.cup.final[1] === me.id);
    var cupSemi = c.cup && c.cup.semis.some(function (m) { return m[0] === me.id || m[1] === me.id; });
    // ascensos y descensos (los 2 primeros suben, los 2 últimos bajan)
    var moves = [];
    for (var Lv = 0; Lv < LEAGUES.length - 1; Lv++) {
      var up = table(c, Lv).slice(0, 2), down = table(c, Lv + 1).slice(-2);
      up.forEach(function (r) { moves.push({ id: r.id, to: Lv + 1 }); });
      down.forEach(function (r) { moves.push({ id: r.id, to: Lv }); });
    }
    var myMove = 0;
    moves.forEach(function (mv) { if (mv.id === me.id) myMove = mv.to > lvl ? 1 : -1; });
    if (champ === me.id) c.trophies.push({ season: c.season, kind: 'liga', name: L.name, club: me.name, d: sd.d });
    if (cupWin) c.trophies.push({ season: c.season, kind: 'copa', name: L.cup, club: me.name, d: sd.d });
    if (myMove > 0) c.trophies.push({ season: c.season, kind: 'ascenso', name: 'Ascenso ' + toL(league(lvl + 1)), club: me.name, d: sd.d });
    var an = avgNota(c);
    c.history.push({ season: c.season, club: me.id, clubName: me.name, lvl: lvl, pos: pos, pts: t[pos - 1].pts, objective: c.objective.text, objOk: objOk,
      cup: cupWin ? 'Campeón' : cupFinal ? 'Final' : cupSemi ? 'Semifinal' : '—', nota: an, played: c.stats.played, won: c.stats.won, ppts: c.stats.pts, move: myMove,
      ovr: playerOvr(c), lvlP: c.player.lvl, d: sd.d, dm: sd.dm });
    c.review = { season: c.season, pos: pos, lvl: lvl, objective: c.objective.text, objOk: objOk, champion: champ === me.id, cup: cupWin, move: myMove, nota: an,
      coach: c.coach, moves: moves, d: sd.d, dm: sd.dm };
    c.pendingMoves = moves;
    c.pendingQ = nextQs(c, moves);
    c.phase = 'off';
    c.offers = genOffers(c, false); c.window = 'end';
    // contrato: si era tu última temporada, el club propone renovar (rol según la confianza del entrenador)
    var ct = c.contract;
    if (ct && (ct.left | 0) <= 1) {
      var rl = c.coach >= 70 ? 2 : c.coach >= 45 ? 1 : 0, nq = c.pendingQ[me.id] != null ? c.pendingQ[me.id] : me.q;
      c.review.renew = { role: ROLE_LV[rl], salary: salaryOf(nextLvl(c, me), nq, rl), years: c.coach >= 45 ? 2 : 1 };
    }
    msg(c, 'club', 'Fin de la temporada ' + c.season + ': ' + ordn(pos), 'Objetivo ' + (objOk ? 'cumplido' : 'no cumplido') + ' (' + c.objective.text.toLowerCase() + ').' +
      (myMove > 0 ? ' ¡El club asciende!' : myMove < 0 ? ' El club desciende.' : '') + ' ' + (c.offers.length ? 'Tienes ' + plural(c.offers.length, 'oferta', 'ofertas') + ' de otros clubes.' : 'No han llegado ofertas de otros clubes.') +
      (c.review.renew ? ' Se te acaba el contrato: el club te ofrece renovar como ' + c.review.renew.role.toLowerCase() + '.' : ''));
    life(c, 'season');
    c.trophies.forEach(function (t) { if (t && t.season === c.season && !t.d) t.d = sd.d; });   // premios de career-life: su sello
  }
  function applyMoves(c) {
    var qs = c.pendingQ || nextQs(c, c.pendingMoves);   // guardados de antes de pendingQ: se calcula igual
    (c.pendingMoves || []).forEach(function (mv) { var k = club(c, mv.id); if (k) k.lvl = mv.to; });
    c.clubs.forEach(function (k) { if (qs[k.id] != null) k.q = qs[k.id]; });
    c.pendingMoves = null; c.pendingQ = null;
  }
  function newSeason(c, offer, years) {
    applyMoves(c);
    var r = rng(hash(c.seed, 'season', c.season + 1)), moved = offer && offer.club !== c.myClub, renew = c.review && c.review.renew;
    if (moved) joinClub(c, offer, years);
    else {
      // el club renueva tu compañero si se ha quedado muy por debajo de su nivel (MATE_RENEW; el nuevo tiene su propio desvío)
      var k = myClub(c);
      delete c.coachD;   // la confianza viene de la temporada pasada: cambiar de nivel ya no la corrige
      if (mateOvr(c) <= clubOvr(k) - MATE_RENEW) { c.mate = newMate(c, k, r); msg(c, 'club', 'Nuevo compañero', 'El club ha fichado a ' + c.mate.name + ' (' + c.mate.role.toLowerCase() + ', media ' + mateOvr(c) + ') para jugar contigo. Tendréis que haceros el uno al otro.'); }
      else if (c.mate) c.mate.form = 0;   // verano: la forma se reinicia
      c.squad = genSquad(c, k, c.mate, rng(hash(c.seed, 'squad', c.season + 1, k.id)));   // la plantilla cambia cada verano
      var ct = c.contract || { club: k.id, years: 1, left: 1, role: ROLE_LV[1], salary: salaryOf(k.lvl, k.q, 1), since: c.season };
      ct.left = Math.max(0, (ct.left | 0) - 1);
      if (ct.left <= 0) {   // renovación (stay(años)): rol y sueldo de la propuesta del club
        var y = clampI(years != null ? years : renew ? renew.years : 1, 1, 3);
        c.contract = { club: k.id, years: y, left: y, role: renew ? renew.role : ct.role, salary: renew ? renew.salary : ct.salary, since: c.season + 1 };
        msg(c, 'club', 'Contrato renovado', 'Has renovado con ' + k.name + ' por ' + plural(y, 'temporada', 'temporadas') + ' como ' + c.contract.role.toLowerCase() + '.');
      } else c.contract = ct;
    }
    if (!moved) { var tsv = sessSane(c); tsv.imp = round1(tsv.imp * 0.5); }   // verano: la impresión en los entrenos se queda en la mitad
    c.season++; c.week = 0; c.phase = 'league'; c.cup = null; c.notes = []; c.stats = newSeasonStats(); c.offers = []; c.window = ''; c.review = null; c.dUse = dZeros();
    c.player.age = (c.player.age | 0) + 1;
    // verano: la fatiga se recupera y la petición de traspaso caduca (antes seguía para siempre y no volvía a costar nada)
    var fat0 = c.fatigue | 0; c.fatigue = 0;
    if (fat0 > FAT_FREE) msg(c, 'train', 'Vacaciones', 'El verano te ha sentado bien: llegas a la pretemporada sin fatiga (tenías ' + fat0 + ').');
    if (c.listed) { c.listed = false; msg(c, 'agent', 'Traspaso', 'Tu petición de traspaso caduca con la temporada. Si quieres salir, vuelve a pedirlo.'); }
    genSchedule(c);
    c.objective = makeObjective(c);
    if (moved) welcome(c);
    else msg(c, 'obj', 'Objetivo de la temporada ' + c.season, 'El club quiere: ' + c.objective.text.toLowerCase() + '.');
    c.last = null;
    life(c, 'newSeason');
  }
  /** Acepta la oferta i (inicio: firmas por el club —o haces la prueba—; fin de temporada: empieza la siguiente en el club nuevo;
   *  mitad: cambias de club ya). years = duración del contrato que eliges (1-3; por defecto la de la oferta). Devuelve true si has
   *  firmado; false si no (en una prueba fallida c.pick.fail = id del club y la oferta desaparece). Una prueba aceptada así se
   *  simula (trialSim: la tirada con o.chance × TRIAL_SIM); jugarla es trialSetup + trialDone. */
  function acceptOffer(i, years) {
    var c = load(); if (!c || !c.offers || !c.offers[i]) return false;
    var o = c.offers[i];
    // invitación a prueba de mitad o fin de temporada (17-nov-2026): aceptarla sin jugarla es simularla
    if (c.phase !== 'pick' && o.trial) { i = trialStaleFix(c, i); if (i < 0 || !c.offers[i]) return false; var tm = trialSimOn(c, i, 1); return !!(tm && tm.pass); }
    if (c.phase === 'pick') {
      i = trialStaleFix(c, i); o = c.offers[i]; if (!o) return false;   // (una prueba dejada a medias se gasta antes)
      if (o.trial) { var ts = trialSimOn(c, i, years); return !!(ts && ts.pass); }   // prueba: aceptarla sin jugarla es simularla (trialSim)
      joinClub(c, o, years); save(c); return true;
    }
    // salir con contrato en vigor (te quedan más temporadas que esta) sin haberte declarado transferible: el club anterior pone
    // pegas y llegas con menos confianza del entrenador (EARLY_COACH). Los años del contrato ya cuentan para algo.
    o.early = earlyExit(c);
    if (o.early) msg(c, 'agent', 'Salida con contrato', club(c, c.myClub).name + ' no quería dejarte ir: aún te quedaban ' + plural((c.contract.left | 0) - (c.phase === 'off' ? 1 : 0), 'temporada', 'temporadas') + ' de contrato. Llegas a ' + club(c, o.club).name + ' con algo menos de confianza del entrenador.');
    if (c.window === 'end' && c.phase === 'off') { newSeason(c, o, years); save(c); return true; }
    if (c.window === 'mid') {
      joinClub(c, o, years);
      c.last = null;   // el último partido era de tu club anterior: la tarjeta «Jornada N» ya no tiene sentido bajo el club nuevo
      save(c); return true;
    }
    return false;
  }
  /** ¿Fichar ahora por otro club sería salir con contrato en vigor? (mitad de temporada: siempre que tengas contrato; fin de
   *  temporada: si te queda más de esta). Ser transferible lo evita. */
  function earlyExit(c) {
    if (!c || c.phase === 'pick' || c.listed || !c.contract || c.broken === c.season) return false;   // (promesa incumplida: te vas sin pegas)
    return (c.contract.left | 0) > (c.phase === 'off' ? 1 : 0);
  }
  /** Sigue en tu club: fin de temporada → empieza la siguiente (y renueva por `years` si se acababa el contrato); mitad → descarta
   *  las ofertas. */
  function stay(years) {
    var c = load(); if (!c || c.phase === 'pick') return false;
    if (c.phase === 'off') newSeason(c, null, years);
    else { c.offers = []; c.window = ''; }
    save(c); return true;
  }
  /** Negociar una oferta: pedir un rol más (y su sueldo). Sale si el interés del club da para ello (con algo de margen y azar); si
   *  no, la oferta queda «firme» (ya no negocian más). Devuelve 'ok' | 'no' | ''. */
  function negotiate(i) {
    var c = load(); if (!c || !c.offers || !c.offers[i]) return '';
    var o = c.offers[i], rl = ROLE_LV.indexOf(o.role);
    if (o.firm || o.trial || rl >= 2) return '';
    // integración (10-nov-2026): antes se aceptaba el 93 % y fallar no costaba nada. Ahora sale con un margen justo (+0..4 sobre
    // el interés) y, si no sale, el entrenador de ese club te recibirá con NEG_COACH menos de confianza si firmas igualmente
    var r = rng(hash(c.seed, 'neg', c.season, c.phase, o.club, c.week)), ok = o.interest + r() * 4 > ROLE_NEED[rl + 1];
    var k = club(c, o.club);
    if (ok) { o.role = ROLE_LV[rl + 1]; o.salary = salaryOf(o.lvl, o.q != null ? o.q : k.q, rl + 1); o.interest = round1(o.interest - 2); }
    else o.negNo = true;
    o.firm = true;
    msg(c, 'offer', ok ? 'Negociación: aceptada' : 'Negociación: rechazada', ok ? k.name + ' acepta: firmarías como ' + o.role.toLowerCase() + ' (' + o.salary + ' € al mes).' : k.name + ' no mejora su oferta y no le ha gustado que pidieras más: si firmas, el entrenador empezará con menos confianza.');
    save(c); return ok ? 'ok' : 'no';
  }

  // ------------------------------------------------------------------ rol prometido y sueldo (11-nov-2026)
  // Antes el rol solo fijaba la confianza inicial y el sueldo era texto. Ahora:
  //   - Rotación: si el entrenador te tiene por debajo de BENCH[0].coach, alguna jornada de liga te sienta (BENCH[0].p; nunca dos
  //     seguidas ni la primera en el club) y la juega tu pareja con uno de la plantilla. Con PROMOTE_AT de confianza pasas a titular
  //     (y cobras como tal).
  //   - Titular: solo te sienta si está descontento (< BENCH[1].coach). Si lo hace, INCUMPLE la promesa: en lo que queda de temporada
  //     puedes irte sin pegas (earlyExit no cuenta el contrato), los clubes lo saben (+BROKEN_BONUS de interés) y a mitad de temporada
  //     basta una nota media de 6,5 para recibir ofertas.
  //   - Titular indiscutible: juegas siempre y la confianza no baja de ROLE_FLOOR[2].
  //   - Sueldo: se cobra cada jornada tuya (PAY_WEEK del mensual: 7 sueldos por temporada) y se acumula en c.money. Sirve para el
  //     fisioterapeuta (physio(): −PHYSIO_FAT de fatiga, una vez por jornada, cuesta physioCost según el circuito).
  var BENCH = [{ coach: 60, p: 0.35 }, { coach: 30, p: 0.5 }, null], PROMOTE_AT = 70, ROLE_FLOOR = [0, 0, 35], BROKEN_BONUS = 3, BENCH_REST = 15;
  var PAY_WEEK = 0.5, PHYSIO_FAT = 30;
  var ROLE_HINT = [
    'Juegas cuando el entrenador confía en ti: por debajo de ' + BENCH[0].coach + ' de confianza te sienta alguna jornada. Con ' + PROMOTE_AT + ' pasas a titular.',
    'Juegas siempre, salvo que el entrenador esté descontento (menos de ' + BENCH[1].coach + '). Si te sienta, incumple la promesa y puedes irte sin pegas.',
    'Juegas siempre y la confianza del entrenador nunca baja de ' + ROLE_FLOOR[2] + '.'
  ];
  function roleIdx(c) { return c && c.contract ? Math.max(0, ROLE_LV.indexOf(c.contract.role)) : 1; }
  function wkKey(c) { return (c.season | 0) * 1000 + (c.phase === 'cup' ? 500 + (c.cup ? c.cup.round | 0 : 0) : c.week | 0); }
  /** ¿Te sienta el entrenador en la jornada f? (solo liga; determinista por temporada y jornada) */
  function benchFor(c, f) {
    if (!c || !c.contract || c.phase !== 'league' || !f || f.kind !== 'league') return false;
    var b = BENCH[roleIdx(c)]; if (!b || c.coach >= b.coach) return false;
    var k = wkKey(c);
    if (c.benchWk === k - 1 || c.joinWk === k) return false;   // nunca dos seguidas ni en tu primera jornada en el club
    return rng(hash(c.seed, 'bench', c.season, c.week, c.myClub))() < b.p;
  }
  function benchWhy(c) {
    var rl = roleIdx(c);
    return rl === 0 ? 'Firmaste para la rotación y aún no se fía del todo de ti (confianza ' + c.coach + ' de ' + BENCH[0].coach + ').'
      : 'Está descontento contigo (confianza ' + c.coach + '). Te prometió ser titular: si te sienta, incumple el contrato.';
  }
  function pay(c) { if (c.contract && c.contract.salary) c.money = Math.round((+c.money || 0) + c.contract.salary * PAY_WEEK); }
  /** La jornada en la que el entrenador te sienta: la juega tu pareja con el mejor de la plantilla (simulada). Sin nota ni
   *  experiencia; descansas (−BENCH_REST de fatiga), entrenas y cobras. Si eras titular, promesa incumplida (c.broken). */
  function benchNext(c) {
    c = c || load(); if (!c) return null;
    var f = myFixture(c), n = f && next(c); if (!n || !n.bench) return null;
    var r = rng(hash(c.seed, 'bench-m', c.season, f.week)), me = myClub(c);
    var alt = (c.squad || []).slice().sort(function (a, b) { return ovrOf(b.st) - ovrOf(a.st); })[0];
    var oa = 0.5 * mateOvr(c) + 0.5 * (alt ? ovrOf(alt.st) : clubOvr(me)) + FORM_SIM * mateFormCap(c, me, c.mate.form | 0);
    var q = quickSim(oa + (r() - 0.5) * 4, n.ovrSim + (r() - 0.5) * 4, r, PTS), win = q.sets[0] > q.sets[1];
    var rl = roleIdx(c), why = benchWhy(c), first = !(c.stats.bench | 0);
    c.benchWk = wkKey(c);
    // dificultad: la jornada sin ti también cuenta en su nivel (la media del rival y el entreno dependen de él; antes de finishRound)
    if (!c.dUse || typeof c.dUse !== 'object') c.dUse = dZeros();
    c.dUse[diffOf(c)] = (c.dUse[diffOf(c)] | 0) + 1;
    pay(c);
    var mf0 = c.mate.form | 0, mf = mateFormStep(c), au = sessAuto(c), tr = trainWeek(c);
    c.fatigue = clamp((c.fatigue | 0) - BENCH_REST, 0, 100);
    c.stats.bench = (c.stats.bench | 0) + 1; c.career.bench = (c.career.bench | 0) + 1;
    if (rl === 1 && c.broken !== c.season) {
      c.broken = c.season;
      msg(c, 'agent', 'Promesa incumplida', me.name + ' te fichó como titular y te ha dejado en el banquillo. Hasta final de temporada puedes irte sin pegas aunque tengas contrato, y los clubes lo saben: llegarán más ofertas (a mitad de temporada basta con una nota media de 6,5).');
    } else if (first) msg(c, 'coach', 'Esta jornada, al banquillo', why + ' Juega ' + c.mate.name + (alt ? ' con ' + alt.name : '') + '. Sube tus notas y volverás a jugar.');
    var rival = club(c, f.home === me.id ? f.away : f.home), phase0 = c.phase, season0 = c.season, label = 'Jornada ' + (f.week + 1);
    sessClose(c);
    recordMine(c, f, q.sets, q.setScores);
    var round = finishRound(c);
    var sum = { season: season0, phase: phase0, label: label, rival: rival.id, rivalName: rival.name, win: win, sets: q.sets.slice(), setScores: q.setScores.map(function (x) { return x.slice(); }),
      sim: true, bench: true, why: why, sub: alt ? alt.name : '', nota: null, me: { kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0 }, xp: 0, lvlUp: 0, lvl: c.player.lvl, ptsGained: 0, badges: [],
      coach: c.coach, train: tr, auto: au, chem: c.mate.chem | 0, mateForm: mf, mateForm0: mf0, round: round.map(function (m) { return { a: m.a, b: m.b, s: m.s }; }),
      offers: c.window === 'mid' ? c.offers.length : 0, review: phase0 !== c.phase && c.phase === 'off' };
    life(c, 'match', sum, f);
    c.last = sum;
    save(c);
    return sum;
  }
  function physioCost(c) { var k = c && myClub(c); return Math.round(SALARY[k ? k.lvl : 0] * 0.6 / 50) * 50; }
  /** Fisioterapeuta (lo pagas tú con lo ahorrado): −PHYSIO_FAT de fatiga, una vez por jornada. 'ok' | 'done' | 'none' | 'money' | ''. */
  function physio() {
    var c = load(); if (!c || c.phase === 'pick' || c.phase === 'off' || !c.contract) return '';
    if (c.physioWk === wkKey(c)) return 'done';
    if ((c.fatigue | 0) <= 0) return 'none';
    var cost = physioCost(c); if ((+c.money || 0) < cost) return 'money';
    c.money = Math.round(c.money - cost); c.fatigue = clamp((c.fatigue | 0) - PHYSIO_FAT, 0, 100); c.physioWk = wkKey(c);
    save(c); return 'ok';
  }
  /** Tras cada partido tuyo: si firmaste para la rotación y el entrenador ya confía en ti (PROMOTE_AT), pasas a titular. */
  function promoteCheck(c) {
    if (!c.contract || roleIdx(c) !== 0 || c.coach < PROMOTE_AT) return;
    var k = myClub(c), s = Math.max(c.contract.salary | 0, salaryOf(k.lvl, k.q, 1));
    c.contract.role = ROLE_LV[1]; c.contract.salary = s;
    msg(c, 'coach', 'Te has ganado la titularidad', 'Ya no eres de la rotación: desde hoy eres titular, y el club te sube el sueldo a ' + s + ' € al mes.');
  }
  function coachFloor(c) { c.coach = Math.max(c.coach, ROLE_FLOOR[roleIdx(c)] || 0); }

  // ------------------------------------------------------------------ gestión durante la temporada
  function setTraining(k) {
    var c = load(); if (!c || !TRAIN[k] || c.train === k) return false;
    c.train = k; save(c); return true;
  }
  /** Declararte transferible (on = true) o retirarlo. El entrenador pierde confianza; los clubes, más interesados. */
  function requestTransfer(on) {
    var c = load(); if (!c || c.phase === 'pick' || !!on === !!c.listed) return false;
    c.listed = !!on;
    if (on) { c.coach = clamp(c.coach - LISTED_COACH, 0, 100); msg(c, 'coach', 'Has pedido el traspaso', 'Entiendo que quieras jugar más arriba, pero no me gusta. Tu agente ya avisa a los clubes: llegarán más ofertas (a mitad de temporada basta con una nota media de 6,5).'); }
    else { c.coach = clamp(c.coach + 3, 0, 100); msg(c, 'coach', 'Sigues con nosotros', 'Me alegra que retires la petición de traspaso. A trabajar.'); }
    save(c); return true;
  }
  /** Cambiar de compañero por el i-ésimo de la plantilla (c.squad). Necesita la confianza del entrenador (≥ 40). La química se
   *  guarda con cada compañero (vuelve si regresas con él). Devuelve 'ok' | 'coach' (el entrenador no te deja) | ''. */
  var MATE_COACH = 40;
  function changeMate(i) {
    var c = load(); if (!c || c.phase === 'pick' || !c.squad || !c.squad[i]) return '';
    if (c.coach < MATE_COACH) { msg(c, 'coach', 'Cambio de compañero: no', 'Antes de pedirme cambios gánate la confianza del equipo en la pista.'); save(c); return 'coach'; }
    var nm = c.squad[i]; c.squad[i] = c.mate; c.mate = nm;
    msg(c, 'coach', 'Nuevo compañero: ' + nm.name, 'De acuerdo: desde la próxima jornada juegas con ' + nm.name + ' (' + nm.role.toLowerCase() + ', ' + nm.style.toLowerCase() + ').' + ((nm.chem | 0) < 30 ? ' Os costará entenderos al principio.' : ''));
    save(c); return 'ok';
  }

  // ------------------------------------------------------------------ jugador: mejoras e insignias
  function bump(k) {
    var c = load(); if (!c) return false;
    var a = c.player, p = P(), ok;
    if (p && p.athleteBump) ok = p.athleteBump(a, k, 1);
    else { var v = a.st[k]; ok = KEYS.indexOf(k) >= 0 && v < 99 && a.pts >= costOf(v); if (ok) { a.pts -= costOf(v); a.st[k] = v + 1; } }
    if (ok) save(c);
    return ok;
  }
  function toggleBadge(id) {
    var c = load(); if (!c || !B() || !B().toggle) return '';
    var r = B().toggle(c.player, id); if (r) save(c); return r;
  }
  /** ¿Es g un partido de Carrera? (ui.js/badges.js: no repartir al escuadrón de Partido rápido) */
  function owns(g) { return !!(g && g.career && !g.demo); }

  // =====================================================================================================================
  // CARRERA DE PISTA (6v6), lote C (11-nov-2026). Guardado aparte ('make-the-cut.career6'): la de playa no cambia (ni su guardado, ni su
  // migración, ni su API por defecto). Ligas por país y división con los datos de js/leagues.js (VB.Leagues; el guardado lleva una
  // copia de los clubes, así que cambiar los datos no rompe una carrera empezada), copa nacional, copas internacionales de la región,
  // ascensos y descensos, ojeadores y ofertas de clubes de ligas mejores, también extranjeras. Reutiliza de la playa: atleta y
  // progresión (addXP, bump, insignias), entrenamiento y fatiga (trainWeek), contrato, rol prometido y banquillo (benchFor, pay,
  // earlyExit), bandeja (msg), nota del partido (ingest, rating) y quickSim. Diseño en notes/carrera.md «Carrera de pista».
  var KEY6 = 'make-the-cut.career6', VER6 = 1, MODE_KEY = 'make-the-cut.career.mode';
  var START6 = 45;          // media inicial (los clubes reales de pista van de 50, en Filipinas o Perú, a 95 en la élite)
  // Datos reales (js/leagues.js): 28 países, 37 ligas de 8 a 12 clubes, 390 clubes. Hasta 8 clubes, liga a doble vuelta (14 jornadas:
  // Países Bajos, Austria, Eslovenia y Catar); con 9-10, a una vuelta (9 jornadas); con 11-12, a una vuelta (11 jornadas)
  var DOUBLE_MAX = 8;
  var POINTS6 = [15, 21, 25];
  // IA rival según la media del club, calibrada con los datos reales (11-nov-2026): < 56 Fácil (Filipinas, cola de Perú y Austria);
  // 56-61 Normal suave (perfil de principiante: la mitad baja de las ligas pequeñas); 62-75 Normal (lo alto de las pequeñas, España,
  // 2ªs de Alemania, Rusia, Turquía y Francia, mitad de la 2ª italiana); 76-87 Difícil (1ªs de Francia, Alemania, Rusia y Japón, lo alto
  // de las 2ªs de élite); ≥ 88 Experto (los grandes de Italia, Polonia, Turquía y Brasil). Antes: 54 / 60 / 72 / 86, con lo que la 2ª
  // italiana entera era Difícil desde la jornada 1 y casi ningún club era Fácil. Reparto de los 390 clubes: 18 Fácil, 81 Normal suave,
  // 182 Normal, 87 Difícil y 22 Experto (tools/careertest.js, «datos reales»).
  var DIFF6_AT = [[88, 'expert'], [76, 'hard'], [56, 'normal'], [0, 'easy']], SOFT6 = [56, 62];
  // Dificultad de la Carrera en la pista (15-nov-2026; Ferran: «metele la dificultad»). Las mismas palancas que la playa (CDIFF: IA
  // rival, atributos, experiencia, entreno, entrenador, objetivo y ofertas; CDIFF.normal = la Carrera de pista de siempre). Lo que
  // depende de la escala de la pista: GATE6 (media mínima para SUBIR de perfil por desplazamiento, con la misma distancia a los
  // cortes de DIFF6_AT que la playa a los suyos: Difícil 76 → 66/58, Experto 88 → 84/76), TOP6 (ligas de élite, fuerza ≥ 87:
  // Italia, Polonia, Brasil y Turquía, el «Mundial» de la pista para shiftTop/attrTop/topX) y regEasy (en Fácil, las 2ªs divisiones
  // juegan en Fácil puro, como el Circuito Regional de la playa).
  var GATE6 = { easy: {}, normal: {}, hard: { hard: 66, expert: 84 }, expert: { hard: 58, expert: 76 } }, TOP6 = 87;
  // nota del partido en 6v6: tu jugador toca menos balones que en la pareja; la parte de estadísticas se escala por puesto
  // medido (autopilot de la sim como receptor, 10 partidos a 15 por nivel): × 1 → 6,5 / 6,5 / 5,7 contra Fácil / Normal / Difícil; × 2,2 → 6,8 / 7,0 / 6,2.
  // Con × 3 el receptor queda ~7,3 contra Normal (el autopilot juega algo mejor que una persona media: ~6,5 jugando de verdad). Los
  // demás puestos, por analogía (sin medir: sim aún no los deja llevar)
  var RATE6 = { OH: 3.0, OPP: 2.8, MB: 3.4, S: 2.0, L: 4.0 };
  var SIM_SHARE6 = { OH: 0.16, OPP: 0.2, MB: 0.11, S: 0.04, L: 0 };   // simular: parte de los puntos del equipo que son tuyos
  var cur6 = null, lost6 = false;
  // Titularidad (13-nov-2026, notes/titularidad-y-cambios.md §A): el club tiene una plantilla con profundidad (c.sq6) y el entrenador
  // elige el seis inicial de cada jornada (lineup6). Sustituye en la pista al banquillo por confianza de la playa (BENCH/benchFor).
  var SQ_SIZE = { S: 2, OPP: 2, OH: 4, MB: 3, L: 1 }, SQ_BIG = 70, SQ_POS = ['S', 'OPP', 'OH', 'MB', 'L'];   // por puesto, contándote a ti
  var SLOTS6 = { S: 1, OPP: 1, OH: 2, MB: 2, L: 1 }, LIST6 = 13;   // plazas en el seis (+ líbero) y convocatoria (reglamento: hasta 14 con dos líberos; con uno, 13)
  var SEL_FORM = 0.8, SEL_CONF = 12, SEL_FAT0 = 50, SEL_FATK = 10, SEL_KEEP = 0.75, SEL_NOISE = 0.5;
  // Tu media cuenta más en la elección (meEdge6): el resto del equipo lo lleva la IA y tú lo juegas a mano. Con los datos reales un
  // jugador de Carrera va 6-12 por debajo de la media de su club las primeras temporadas (un novato de 45 empieza en clubes de 57-61):
  // con +8 un novato de la rotación no salía de inicio en toda la temporada; con +12 compite por el puesto y lo gana con buenas notas.
  // 13-nov-2026 (pregunta 9 de SIGUIENTE.md, Ferran: «fichar por un club mejor tiene que costar de verdad»): la ventaja baja con las
  // temporadas jugadas, ME_EDGE (12) en la 1ª, −ME_EDGE_STEP (2) cada temporada, hasta ME_EDGE_MIN (4) desde la 5ª. Por temporadas y
  // no por nivel: el nivel depende de la dificultad y de simular o jugar; la temporada es igual para todos y se entiende («llevas 3
  // temporadas: ya no eres un novato»). El novato sigue compitiendo en su primer club; un veterano que ficha por un club 6-10 por encima
  // empieza de suplente y se gana el sitio con forma, confianza y la impresión de los entrenos (SEL_IMP). Medidas en careertest
  // «Sesiones de entrenamiento» y en notes/carrera.md §Sesiones.
  var ME_EDGE = 12, ME_EDGE_STEP = 2, ME_EDGE_MIN = 4;
  // impresión en los entrenos (sesiones, c.ts.imp 0-100): suma hasta SEL_IMP a tu sel (0 sin entrenar: no castiga). Con 3 oros por
  // jornada llega a ~40 en la 1ª jornada, ~60 en la 2ª, ~85 en la 4ª. Medido (8 semillas por caso, media 55, Rotación, notas de 6,5):
  // veterano (T5, +4) que ficha por un club 8 por encima: entrenando con oro se gana el puesto (3 jornadas seguidas de inicio → Titular)
  // en la jornada 4-10 (mediana 5; 7 de 8), sin entrenar 0-2 de 8; T3 (+8) en un club 12 por encima: 3-10 (mediana 5) contra 0-2 de 8;
  // novato (T1, +12) en un club 16 por encima: 3-9 (mediana 4,5). En un club de su nivel el veterano sale de inicio casi siempre.
  var SEL_IMP = 4;
  // Nota del último partido en la elección del seis (16-nov-2026, Ferran: «si sacas muy mala nota no jugarás en el siguiente, y si
  // tienes la oportunidad de jugar algunos puntos, tienes también la oportunidad de destacar y tener más oportunidades»). Se suma
  // a la forma (media de las 3 últimas) solo en la jornada siguiente (c.ln6): muy mala nota de titular → casi seguro al banquillo;
  // destacar saliendo del banquillo → casi seguro de inicio. NOTA_MIN_SUB: puntos en pista para tener nota (antes NOTA_MIN_R, 12).
  var LAST_BAD = 5, LAST_BAD_SEL = -4, LAST_MEH = 6, LAST_MEH_SEL = -1.5, LAST_GOOD = 8, LAST_GOOD_SEL = 1.5, LAST_SUB = 7.5, LAST_SUB_SEL = 4, NOTA_MIN_SUB = 5;
  /** Peso de la nota del último partido en la elección del seis (0 sin nota). */
  function lastSel6(ln) {
    if (!ln || typeof ln.nota !== 'number') return 0;
    var n = ln.nota;
    if (n < LAST_BAD) return LAST_BAD_SEL;
    if (n < LAST_MEH) return LAST_MEH_SEL;
    if (ln.sub && n >= LAST_SUB) return LAST_SUB_SEL;
    return n >= LAST_GOOD ? LAST_GOOD_SEL : 0;
  }
  /** Ventaja de tu media en la elección del seis según la temporada (por defecto la actual). */
  function meEdge6(c, season) { var s = season != null ? season : c && c.season || 1; return Math.max(ME_EDGE_MIN, ME_EDGE - ME_EDGE_STEP * Math.max(0, (s | 0) - 1)); }
  var OUT_COACH = 20, FAT_REST = 80, FAT_REST_TOP = 85, TIT_BONUS = 3, STARTS_PROMOTE = 3, TIT_BROKEN = 2;
  var TRAIN_COACH = 1, IMPACT_COACH = 2, PULL_COACH = 2, FIT_START = 2, FIT_DEEP = 2, NOTA_MIN_R = 12, BENCH_XP = 20;
  var WHY6 = { form: 'llega en mejor forma', ovr: 'tiene más nivel ahora mismo', conf: 'el entrenador se fía más de su juego', fatiga: 'vas con mucha fatiga',
    'new': 'acabas de llegar y aún tienes que ganarte el sitio', nota: 'tu nota del último partido fue muy baja', coach: 'el entrenador no cuenta contigo', list: 'la convocatoria está llena' };
  var ROLE_HINT6 = [
    'Compites por el puesto: juega quien llegue mejor (media, forma, nota del último partido, confianza y fatiga). Si sales de inicio ' + STARTS_PROMOTE + ' jornadas seguidas, pasas a titular.',
    'El entrenador cuenta contigo de inicio salvo que estés muy por debajo o con mucha fatiga. Si te deja ' + TIT_BROKEN + ' jornadas en el banquillo, incumple la promesa y puedes irte sin pegas.',
    'Sales siempre de inicio (salvo con fatiga de ' + FAT_REST_TOP + ' o más) y no te cambian por jugar mal. La confianza del entrenador nunca baja de ' + ROLE_FLOOR[2] + '.'
  ];
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function yE(name) { return /^(h?[iíIÍ])/i.test(String(name || '')) && !/^h?i[aeoáéó]/i.test(String(name || '')) ? ' e ' : ' y '; }
  function myForm6(c) { var f = form(c); return f == null ? 0 : clamp((f - 6.5) * 2, -FORM_MAX, FORM_MAX); }
  function newSeasonStats6() { var s = newSeasonStats(); s.starts = 0; s.subIn = 0; s.mr = 0; s.rr = 0; return s; }

  // ---------------------------------------------------------------- puestos (los lee de sim.js: crecen solos cuando sim los añada)
  function positions6() {
    var l = (VB.Sim && VB.Sim.CTRL_ROLES6) || VB.CTRL_ROLES6 || ['OH'], out = [];
    for (var i = 0; i < l.length; i++) if (POS6[l[i]] && out.indexOf(l[i]) < 0) out.push(l[i]);
    return out.length ? out : ['OH'];
  }
  /** Orden de los 6 de la rotación en sim.js (mkTeam6): el humano va en el 1r hueco de su puesto. */
  function simRoles6() { var r = VB.Sim && VB.Sim.ROLES6; return Array.isArray(r) && r.length === 6 ? r : ['S', 'OH', 'MB', 'OPP', 'OH', 'MB']; }
  /** Puesto que llevas en el partido: el tuyo si sim lo permite; si no, el primero que haya (receptor). */
  function ctrlRole6(c) { var p = c && c.player && c.player.roleKey, l = positions6(); return l.indexOf(p) >= 0 ? p : l[0]; }

  // ---------------------------------------------------------------- datos (js/leagues.js)
  function regions6() {
    var L = VB.Leagues; if (!L) return [];
    var r = Array.isArray(L) ? L : Array.isArray(L.regions) ? L.regions : Array.isArray(L.countries) ? [L] : [];
    return r.filter(function (x) { return x && Array.isArray(x.countries); });
  }
  function divsOf6(co) {
    if (!co || !co.code || !Array.isArray(co.divisions)) return [];
    var ds = co.divisions.filter(function (d) { return d && (d.lvl === 1 || d.lvl === 2) && Array.isArray(d.clubs) && d.clubs.length >= 4; });
    if (!ds.some(function (d) { return d.lvl === 1; })) return [];
    return ds.slice().sort(function (a, b) { return a.lvl - b.lvl; });
  }
  /** Países con liga de pista: [{country, code, tier, region, divs}]. */
  function countries6() {
    var out = [];
    regions6().forEach(function (rg) {
      rg.countries.forEach(function (co) {
        var ds = divsOf6(co); if (!ds.length || out.some(function (x) { return x.code === co.code; })) return;
        out.push({ country: String(co.country || co.code), code: String(co.code), tier: co.tier | 0, region: regionOf6(co.code, rg.region), divs: ds.length });
      });
    });
    return out;
  }
  // Región (continente) de cada país por su código: los datos reales llegan en varios ficheros por zona («Élite europea…», «Europa
  // media…») y las copas internacionales se juegan por continente. Un código que no esté aquí usa el campo region del fichero.
  var CONT6 = { 'Europa': 'IT PL TR FR DE RU ES BE NL GR PT CH AT CZ RS SI RO HR HU SK BG UA FI SE NO DK GB IE LU BY EE LV LT IL CY MK BA ME AL IS',
    'América': 'BR AR US CA PE CL CO MX PR CU DO VE UY PY BO EC CR GT PA', 'Asia': 'JP KR CN IR QA PH TH TW KZ ID VN IN HK AE SA BH KW' };
  // Zonas dentro de una región (América: la copa del sur y la del norte; cada club solo juega la de su zona)
  var ZONE6 = { sur: 'BR AR PE CL CO VE UY PY BO EC', norte: 'US CA MX PR CU DO CR GT PA' };
  function regionOf6(code, def) {
    code = String(code || '');
    for (var r in CONT6) if ((' ' + CONT6[r] + ' ').indexOf(' ' + code + ' ') >= 0) return r;
    return String(def || '');
  }
  // Para reconocer la copa nacional de cada país en las competiciones de los datos reales (campo real o note) cuando no traen
  // country: nombre del país y del torneo en el idioma local.
  var CUP_ALIAS6 = { ES: 'España|Copa del Rey|Copa de la Reina', IT: 'Itali', PL: 'Polsk|Polonia|Poland', TR: 'Türk|Turqu|Turk', FR: 'France|Francia', DE: 'DVV|Deutsch|Alemania|German',
    RU: 'Rossi|Rusia|Russia', BE: 'Belgi|Bélgica', NL: 'Países Bajos|Nederland|Netherlands|Nationale Beker', GR: 'Grecia|Greek|Hellen|Ellad', PT: 'Portugal', CH: 'Swiss|Suiza|Schweiz',
    AT: 'ÖVV|Austria|Österreich', CZ: 'Český|Chequia|Czech', RS: 'Srbij|Serbia', SI: 'Slovenij|Eslovenia', RO: 'Român|Rumanía|Romania', BR: 'Brasil|Brazil', AR: 'ACLAV|Argentin',
    US: 'USA|Estados Unidos', CA: 'Canad', PE: 'Perú|Peru', JP: 'Emperor|Empress|Japón|Japan', KR: 'KOVO|Corea|Korea', CN: 'China', IR: 'Irán|Iran', QA: 'Qatar|Catar', PH: 'Filipinas|Philippine' };
  /** Qué es una competición de los datos: {kind:'intl', rank, zone} (copa de clubes del continente; rank 1 = la grande, 2 = la
   *  segunda), {kind:'cup', country} (copa nacional) o {kind:'skip'} (ligas, supercopas, selecciones, Mundial de Clubes…).
   *  Manda lo que diga la entrada (kind, rank, zone, country); si no, se deduce del nombre real. */
  function compKind6(x, codes) {
    var real = String(x.real || ''), txt = real + ' ' + String(x.note || ''), kind = x.kind, zone = null, i;
    if (Array.isArray(x.zone)) zone = x.zone.map(String); else if (typeof x.zone === 'string' && ZONE6[x.zone]) zone = ZONE6[x.zone].split(' ');
    if (kind === 'skip') return { kind: 'skip' };
    if (kind === 'cup' || (!kind && x.country)) return x.country ? { kind: 'cup', country: String(x.country) } : { kind: 'skip' };
    var intlRe = /\b(CEV|AVC|CSV|NORCECA|Asian|Sudamerican|South American|Champions League|Challenge Cup)\b/i, notRe = /\b(FIVB|World|Mundial|Nations|VNL|EuroVolley|Ol[ií]mpic|Juegos|selecciones)\b/i;
    if (kind === 'intl' || (!kind && intlRe.test(real) && !notRe.test(real))) {
      var rank = x.rank | 0 || (/Challenge/i.test(real) ? 3 : /\bCEV Cup\b/i.test(real) ? 2 : 1);
      if (!zone) zone = /Sudamerican|South American|\bCSV\b/i.test(real) ? ZONE6.sur.split(' ') : /NORCECA/i.test(real) ? ZONE6.norte.split(' ') : null;
      return { kind: 'intl', rank: rank, zone: zone };
    }
    if (kind) return { kind: 'skip' };
    if (!/(^|[^\wÀ-ž])(Cup|Copa|Coppa|Coupe|Pokal|Ta[çc]a|Puchar|Kupa|Kup|Kupok|poh[áa]r|Cupa|Beker)([^\wÀ-ž]|$)/i.test(real) || /Super|BeNe|MEVZA|Príncipe|Princesa|Superliga 2|Conference/i.test(real)) return { kind: 'skip' };
    for (i = 0; i < codes.length; i++) {
      var al = CUP_ALIAS6[codes[i].code], nm = codes[i].country;
      if ((al && new RegExp(al, 'i').test(real)) || (nm && real.indexOf(nm) >= 0)) return { kind: 'cup', country: codes[i].code };
    }
    for (i = 0; i < codes.length; i++) {   // y si no, en la nota
      var al2 = CUP_ALIAS6[codes[i].code];
      if (al2 && new RegExp(al2, 'i').test(txt)) return { kind: 'cup', country: codes[i].code };
    }
    return { kind: 'skip' };
  }
  function hexN(s, def) { var m = /^#?([0-9a-f]{6})$/i.exec(String(s == null ? '' : s).trim()); return m ? parseInt(m[1], 16) : def; }
  function lum6(h) { return (0.299 * (h >> 16 & 255) + 0.587 * (h >> 8 & 255) + 0.114 * (h & 255)) / 255; }
  function mix6(a, b, t) { var f = function (s) { return Math.round((a >> s & 255) * (1 - t) + (b >> s & 255) * t) << s; }; return (f(16) | f(8) | f(0)) >>> 0; }
  /** Equipación de un club de pista: MISMOS colores que el real (camiseta, segundo color, líbero); el diseño (franjas, cuello) lo
   *  pone el juego (pattern por el nombre, nunca el de la camiseta real). Mismos campos que los kits de playa (+ libero). */
  function kit6(name, sh, s2, lb) {
    var shorts = lum6(sh) > 0.7 || lum6(s2) < 0.3 ? s2 : mix6(sh, 0x0b0e17, 0.6);
    return { shirt: sh, accent: s2, shorts: shorts, pattern: PATTERNS[hash('kit6', name) % PATTERNS.length], libero: lb };
  }
  function artOf6(name) { return /^(Campeonato|Torneo|Circuito|Trofeo|Open)\b/.test(name) ? 'el' : 'la'; }
  /** Copia del mundo de pista en el guardado: ligas (país + división), clubes, copas nacionales e internacionales. */
  function buildWorld6(c) {
    var id = 0, leagues = [], clubs = [], cups = {}, intl = {};
    var allCodes = countries6().map(function (x) { return { code: x.code, country: x.country }; });
    regions6().forEach(function (rg) {
      var comps = (Array.isArray(rg.competitions) ? rg.competitions : []).filter(function (x) { return x && x.name; });
      var codes = rg.countries.filter(function (co) { return co && co.code; }).map(function (co) { return { code: String(co.code), country: String(co.country || '') }; });
      // copas: la nacional de cada país (la 1ª que se reconozca) y, por región y zona, la internacional grande (rank 1) y la 2ª
      comps.forEach(function (x) {
        var ck = compKind6(x, codes.concat(allCodes)), nm = String(x.name), sh = String(x.short || abbr(nm));
        if (ck.kind === 'cup') { if (!cups[ck.country]) cups[ck.country] = { name: nm, short: sh }; return; }
        if (ck.kind !== 'intl' || ck.rank > 2) return;
        var regs = {};
        if (ck.zone) ck.zone.forEach(function (cc) { var rr = regionOf6(cc, ''); if (rr) regs[rr] = 1; });
        if (!Object.keys(regs).length) codes.forEach(function (co) { regs[regionOf6(co.code, rg.region)] = 1; });
        Object.keys(regs).forEach(function (reg) {
          var L = intl[reg] = intl[reg] || [], zk = ck.zone ? ck.zone.join(' ') : '';
          if (L.some(function (y) { return y.rank === ck.rank && (y.zone ? y.zone.join(' ') : '') === zk; })) return;   // repetida en otro fichero: la 1ª
          L.push({ name: nm, short: sh, rank: ck.rank, zone: ck.zone });
        });
      });
      rg.countries.forEach(function (co) {
        var reg = regionOf6(co.code, rg.region);
        divsOf6(co).forEach(function (d) {
          var lid = String(co.code) + d.lvl;
          if (leagues.some(function (L) { return L.id === lid; })) return;
          var nm = String(d.name || 'Liga');
          leagues.push({ id: lid, cc: String(co.code), country: String(co.country || co.code), region: reg, tier: co.tier | 0, lvl: d.lvl, name: nm, art: artOf6(nm),
            short: String(d.short || abbr(nm)), strength: clampI(d.strength, 1, 100) });
          d.clubs.forEach(function (k) {
            if (!k || !k.name) return;
            var col = k.colors || {}, sh = hexN(col.shirt, 0xd8262e), s2 = hexN(col.shirt2, 0xffffff), lb = hexN(col.libero, mix6(sh, 0xffffff, 0.5)), o = clampI(k.ovr, 20, 99);
            // Patrocinador inventado (Ferran, 11-nov-2026): como en la realidad, el club se llama «patrocinador + nombre»; nameBase sin él.
            clubs.push({ id: id++, lid: lid, cc: String(co.code), name: (k.sponsor ? String(k.sponsor) + ' ' : '') + String(k.name), nameBase: String(k.name), sponsor: k.sponsor ? String(k.sponsor) : '', short: String(k.short || abbr(String(k.name))).slice(0, 4).toUpperCase(), city: String(k.city || ''),
              base: o, ovr: o, kit: kit6(String(k.name), sh, s2, lb), libEst: !!k.liberoEstimated });
          });
        });
      });
    });
    uniqueShorts(clubs);
    for (var rr in intl) intl[rr].sort(function (a, b) { return a.rank - b.rank; });
    c.leagues = leagues; c.clubs = clubs; c.cups = cups; c.intl = intl;
  }

  // ---------------------------------------------------------------- almacenamiento (guardado aparte del de playa)
  function save6(c) {
    c = c || cur6; if (!c) return false;
    try { var s = store(); if (!s) return false; s.setItem(KEY6, JSON.stringify(c)); return true; } catch (e) { return false; }
  }
  function load6() {
    if (cur6) return cur6;
    var o = null, raw = null, s = null;
    try { s = store(); raw = s ? s.getItem(KEY6) : null; o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    try { cur6 = sane6(o); } catch (e) { cur6 = null; }
    if (!cur6 && raw) { lost6 = true; try { if (s) { s.setItem(KEY6 + '.bak', raw); s.removeItem(KEY6); } } catch (e) { } }
    return cur6;
  }
  function abandon6() { cur6 = null; M = null; lost6 = false; try { var s = store(); if (s) s.removeItem(KEY6); } catch (e) { } return true; }
  /** Repara lo reparable de un guardado de pista; lo irreparable (ligas, clubes, tu club) → null (copia en KEY6 + '.bak'). */
  function sane6(o) {
    var arr = Array.isArray, num = function (v) { return typeof v === 'number' && isFinite(v); };
    if (!o || typeof o !== 'object' || o.v !== VER6 || !o.player || typeof o.player !== 'object' || !arr(o.leagues) || !o.leagues.length || !arr(o.clubs) || !o.clubs.length) return null;
    var lids = {}; o.leagues.forEach(function (L) { if (L && typeof L.id === 'string') lids[L.id] = L; });
    if (!o.leagues.every(function (L) { return L && lids[L.id] === L && typeof L.name === 'string' && num(L.strength) && (L.lvl === 1 || L.lvl === 2); })) return null;
    if (!o.clubs.every(function (k) { return k && num(k.id) && lids[k.lid] && typeof k.name === 'string' && num(k.ovr) && k.kit && typeof k.kit === 'object'; })) return null;
    o.leagues.forEach(function (L) { if (typeof L.short !== 'string') L.short = abbr(L.name); if (L.art !== 'el') L.art = 'la'; if (typeof L.country !== 'string') L.country = String(L.cc || ''); if (typeof L.region !== 'string') L.region = ''; });
    o.clubs.forEach(function (k) { k.ovr = clampI(k.ovr, 20, 99); k.base = num(k.base) ? clampI(k.base, 20, 99) : k.ovr; if (typeof k.short !== 'string') k.short = abbr(k.name); if (typeof k.city !== 'string') k.city = ''; k.cc = lids[k.lid].cc; });
    var p = P();
    if (p && p.saneAthlete) {
      var d = p.newAthlete({ num: o.player.num, role: o.player.role, name: o.player.name });
      p.saneAthlete(o.player, d); d.roleKey = POS6[o.player.roleKey] ? o.player.roleKey : 'OH'; d.age = clampI(o.player.age, 15, 60); o.player = d;
    }
    o.player.roleKey = POS6[o.player.roleKey] ? o.player.roleKey : 'OH'; o.player.role = POS6[o.player.roleKey].name;
    o.mode = 'hall'; o.ctrl = 'one'; o.mate = null;
    // vida de la Carrera (career-life.js): un guardado de pista de antes de la vida (sin c.life) la crea aquí, vacía (fama 0)
    if (VB.CareerLife && VB.CareerLife.ensure) { try { VB.CareerLife.ensure(o); } catch (e) { o.life = null; } }
    o.points = POINTS6.indexOf(o.points) >= 0 ? o.points : 15;
    o.seed = num(o.seed) ? o.seed >>> 0 : hash('reparado6', o.created || 0);
    o.season = clampI(o.season, 1, 999);
    if (!o.cups || typeof o.cups !== 'object') o.cups = {};
    if (!o.intl || typeof o.intl !== 'object') o.intl = {};
    ['notes', 'offers', 'history', 'trophies', 'inbox', 'kos'].forEach(function (k) { if (!arr(o[k])) o[k] = []; });
    if (!o.tab || typeof o.tab !== 'object') o.tab = {};
    if (!o.scouts || typeof o.scouts !== 'object') o.scouts = {};
    if (!o.stats || typeof o.stats !== 'object') o.stats = newSeasonStats6();
    if (!o.career || typeof o.career !== 'object') o.career = newSeasonStats6();
    [o.stats, o.career].forEach(function (x) { var z = newSeasonStats6(); for (var k in z) if (!num(x[k])) x[k] = 0; });
    o.inbox = o.inbox.filter(function (m) { return m && typeof m.t === 'string'; }).slice(-INBOX_MAX);
    o.msgN = num(o.msgN) ? o.msgN | 0 : o.inbox.reduce(function (s, m) { return Math.max(s, (m.id | 0) + 1); }, 0);
    if (TRAIN_KEYS.indexOf(o.train) < 0) o.train = 'bal';
    if (!o.tp || typeof o.tp !== 'object') o.tp = {};
    ['phys', 'def', 'atk'].forEach(function (g) { o.tp[g] = num(o.tp[g]) ? clamp(o.tp[g], 0, TRAIN_NEED - 1) : 0; });
    o.fatigue = num(o.fatigue) ? clamp(Math.round(o.fatigue), 0, 100) : 0;
    o.money = num(o.money) ? Math.max(0, Math.round(o.money)) : 0;
    o.chem = num(o.chem) ? clamp(Math.round(o.chem), 0, 100) : 0;
    o.coach = num(o.coach) ? clamp(Math.round(o.coach), 0, 100) : 50;
    o.listed = !!o.listed;
    var cos = countries6(); if (typeof o.cc !== 'string' || !o.leagues.some(function (L) { return L.cc === o.cc; })) o.cc = o.leagues[0].cc;
    o.notes = o.notes.filter(function (n) { return n && num(n.nota); });
    sessSane(o);   // sesiones de entrenamiento (13-nov-2026): un guardado sin c.ts lo crea vacío (sin subir VER6)
    trialSaneT(o);   // prueba de mitad o fin de temporada (c.tst; 17-nov-2026)
    saneDiff6(o);   // dificultad (15-nov-2026): sin diff → Normal, la Carrera de pista de antes (sin subir VER6)
    if (o.phase === 'pick') {
      o.myClub = -1; o.window = 'start';
      if (!o.pick || typeof o.pick !== 'object') o.pick = { round: 0, more: false };
      o.pick.round = clampI(o.pick.round, 0, 9); o.pick.more = !!o.pick.more;
      if (!o.offers.length || !o.offers.every(function (x) { var k = x && club(o, x.club); return k && k.cc === o.cc; })) o.offers = genStartOffers6(o, o.pick.round);
      trialSane(o);
      o.week = 0; o.last = null; o.kos = []; o.koI = 0; o.myRes = { lid: '', w: [] };
      return o;
    }
    var me = myClub(o); if (!me) return null;
    o.offers = o.offers.filter(function (x) { return x && club(o, x.club); });
    if (!o.myRes || typeof o.myRes !== 'object' || o.myRes.lid !== me.lid || !arr(o.myRes.w)) o.myRes = { lid: me.lid, w: arr(o.myRes && o.myRes.w) && o.myRes && o.myRes.lid === me.lid ? o.myRes.w : [] };
    var ct = o.contract;
    if (!ct || typeof ct !== 'object' || !num(ct.left) || !num(ct.years) || ROLE_LV.indexOf(ct.role) < 0) {
      var rl = o.coach >= 70 ? 2 : o.coach >= 45 ? 1 : 0;
      o.contract = { club: me.id, years: 2, left: 2, role: ROLE_LV[rl], salary: salary6(o, me, rl), since: o.season };
    } else { ct.left = clampI(ct.left, 0, 5); ct.years = clampI(ct.years, 1, 5); ct.club = o.myClub; if (!num(ct.salary)) ct.salary = salary6(o, me, ROLE_LV.indexOf(ct.role)); }
    if (!o.objective || typeof o.objective.text !== 'string' || !num(o.objective.pos)) o.objective = makeObjective6(o, me);
    // titularidad (13-nov-2026): un guardado sin plantilla (c.sq6) o con una dañada la crea aquí (sin subir VER6)
    var q6 = o.sq6;
    if (!q6 || typeof q6 !== 'object' || q6.club !== me.id || !arr(q6.list) || !q6.list.length || !q6.list.every(function (x) { return x && typeof x.id === 'string' && typeof x.name === 'string' && SQ_POS.indexOf(x.pos) >= 0 && num(x.ovr) && num(x.num); })) o.sq6 = null;
    else {
      q6.list.forEach(function (x) { x.ovr = clampI(x.ovr, 20, 99); x.form = clampI(x.form, -FORM_MAX, FORM_MAX); x.fat = clampI(x.fat, 0, 100); x.conf = num(x.conf) ? clampI(x.conf, 30, 75) : 50; x.ls = x.ls ? 1 : 0; });
      q6.run = clampI(q6.run, 0, 99); q6.titBench = clampI(q6.titBench, 0, 99); q6.meLs = q6.meLs ? 1 : 0; q6.fresh = q6.fresh ? 1 : 0; q6.outC = q6.outC ? 1 : 0;
      if (['start', 'sub', 'out'].indexOf(q6.stat) < 0) q6.stat = null;
      if (!q6.L || typeof q6.L !== 'object' || !arr(q6.L.start) || !arr(q6.L.bench) || !arr(q6.L.out)) { q6.L = null; q6.wk = null; }
    }
    var mig6 = !o.sq6;
    if (o.phase !== 'off') sq6(o); else if (!o.sq6) o.sq6 = newSq6(o, me, o.season);
    // (migrar no es fichar: «recién llegado» solo si fichaste en esta jornada o para la temporada que viene; y sigues de inicio si
    // la última jornada saliste de inicio)
    if (mig6 && o.sq6) {
      o.sq6.fresh = num(o.joinWk) && o.joinWk >= wkKey6(o) ? 1 : 0;
      o.sq6.meLs = !o.sq6.fresh && o.last && (o.last.part ? o.last.part.status === 'start' : !o.last.bench) ? 1 : 0;
    }
    if (o.last && (!o.last.me || !arr(o.last.sets) || !arr(o.last.setScores))) o.last = null;
    if (o.window !== 'mid' && o.window !== 'end') o.window = '';
    if (['league', 'ko', 'off'].indexOf(o.phase) < 0) o.phase = 'league';
    o.week = clampI(o.week, 0, weeksOf6(o, me.lid));
    o.koI = clampI(o.koI, 0, 9);
    cur6 = o;
    if (o.phase === 'league' && o.week >= weeksOf6(o, me.lid)) endLeague6(o);
    if (o.phase === 'ko') {
      var okKO = o.kos.every(function (ko) { return ko && arr(ko.rounds) && ko.rounds.length && arr(ko.res) && arr(ko.ids) && num(ko.round) && ko.rounds.every(function (rd) { return arr(rd) && rd.every(function (m) { return arr(m) && club(o, m[0]) && club(o, m[1]); }); }); });
      if (!okKO) { o.kos = buildKOs6(o); o.koI = 0; }
      advanceKO6(o);
    }
    if (o.phase === 'off') {
      if (!o.review || typeof o.review !== 'object') o.review = { season: o.season, pos: posOf6(o, me.id), lid: me.lid, objective: o.objective.text, objOk: false, champion: false, cups: [], move: 0, nota: avgNota(o), coach: o.coach, moves: [] };
      if (!arr(o.pendingMoves)) o.pendingMoves = [];
      o.window = 'end';
    }
    return o;
  }

  // ---------------------------------------------------------------- ligas, clubes y calendario
  function lg6(c, lid) { if (!c || !c.leagues) return null; for (var i = 0; i < c.leagues.length; i++) if (c.leagues[i].id === lid) return c.leagues[i]; return null; }
  function lgClubs6(c, lid) { return c.clubs.filter(function (k) { return k.lid === lid; }); }
  /** Jornadas de la liga lid: doble vuelta hasta DOUBLE_MAX clubes; a una vuelta con más (así la temporada no es eterna). */
  function weeksOf6(c, lid) { var n = lgClubs6(c, lid).length, m = n + (n % 2); return m < 2 ? 0 : n <= DOUBLE_MAX ? 2 * (m - 1) : m - 1; }
  function midWeek6(c) { var k = myClub(c); return k ? Math.floor(weeksOf6(c, k.lid) / 2) : 0; }
  var SC6 = {}, SC6n = 0;
  /** Calendario de la liga lid en la temporada (determinista: no se guarda). Con número impar de clubes, uno descansa cada jornada. */
  function sched6(c, lid) {
    var ids = lgClubs6(c, lid).map(function (k) { return k.id; }), key = c.seed + '|' + c.season + '|' + lid + '|' + ids.join(',');
    if (SC6[key]) return SC6[key];
    if (++SC6n > 400) { SC6 = {}; SC6n = 1; }
    var t = ids.slice(); if (t.length % 2) t.push(-1);
    if (t.length < 2) return (SC6[key] = []);
    var full = roundRobin(t, rng(hash(c.seed, 'sched6', c.season, lid))), W = ids.length <= DOUBLE_MAX ? full.length : full.length / 2;
    return (SC6[key] = full.slice(0, W).map(function (wk) { return wk.filter(function (m) { return m[0] >= 0 && m[1] >= 0; }); }));
  }
  function addRes6(c, lid, m) {
    var T = c.tab[lid] = c.tab[lid] || {}, pp = setPts(m.s);
    [m.a, m.b].forEach(function (id, s) {
      var row = T[id] = T[id] || [0, 0, 0, 0, 0, 0, 0, 0], my = m.s[s], ot = m.s[1 - s];
      row[0]++; if (my > ot) row[1]++; else row[2]++; row[3] += my; row[4] += ot; row[7] += pp[s];
      m.sc.forEach(function (z) { row[5] += z[s]; row[6] += z[1 - s]; });
    });
  }
  /** Clasificación de la liga lid (por defecto la tuya). Las de todas las ligas se guardan agregadas (c.tab), sin los partidos. */
  function table6(c, lid) {
    c = c || load6(); if (!c) return [];
    if (lid == null || !lg6(c, lid)) { var mk = myClub(c); lid = mk ? mk.lid : c.leagues[0].id; }
    var T = c.tab[lid] || {};
    var out = lgClubs6(c, lid).map(function (k) { var r = T[k.id] || [0, 0, 0, 0, 0, 0, 0, 0]; return { id: k.id, pj: r[0], g: r[1], p: r[2], sf: r[3], sc: r[4], pf: r[5], pc: r[6], pts: r[7] }; });
    out.sort(function (a, b) {
      return b.pts - a.pts || b.g - a.g || ((b.sf + 1) / (b.sc + 1)) - ((a.sf + 1) / (a.sc + 1)) || ((b.pf + 1) / (b.pc + 1)) - ((a.pf + 1) / (a.pc + 1)) || a.id - b.id;
    });
    out.forEach(function (r, i) { r.pos = i + 1; });
    return out;
  }
  function posOf6(c, id) { var k = club(c, id); if (!k) return 0; var t = table6(c, k.lid); for (var i = 0; i < t.length; i++) if (t[i].id === id) return i + 1; return 0; }
  function qOf6(c, k, lid) {
    var l = lgClubs6(c, lid || k.lid).map(function (x) { return x.ovr; }), lo = Math.min.apply(null, l), hi = Math.max.apply(null, l);
    return hi > lo ? clamp((k.ovr - lo) / (hi - lo), 0, 1) : 0.5;
  }
  /** Sueldo base del mes según la fuerza de la liga (ficticio): 400 € en una liga de 50, ~2.500 en una de 70, ~15.000 en la élite. */
  function salBase6(s) { return 400 * Math.exp((clamp(s, 30, 100) - 50) / 11); }
  function salary6(c, k, rl, lid) {
    var L = lg6(c, lid || k.lid), v = salBase6(L ? L.strength : 50) * (0.8 + 0.4 * qOf6(c, k, lid)) * [0.8, 1, 1.25][clamp(rl | 0, 0, 2)];
    return Math.round(v / 50) * 50;
  }
  function ref6(s) { return s < 60 ? 'low' : s < 72 ? 'mid' : s < 84 ? 'high' : 'top'; }
  function xpMul6(L) { return round1(clamp(1 + ((L ? L.strength : 50) - 50) / 14, 1, 4)); }
  function starsOf6(o) { return clamp(1 + Math.floor((o - 45) / 11), 1, 5); }
  /** Ficha de un club de pista (ofertas, pestaña Club): país, liga, prestigio, media, estilo, ciudad. lid/ovr: los de la temporada que viene si se pasan. */
  function clubInfo6(c, k, lid, ovr) {
    var L = lg6(c, lid || k.lid) || lg6(c, k.lid), o = ovr != null ? ovr : k.ovr;
    return { id: k.id, name: k.name, short: k.short, city: k.city, beach: '', kit: k.kit, libEst: !!k.libEst, cc: L.cc, country: L.country, region: L.region, lid: L.id, lvl: L.lvl,
      league: L.name, lgShort: L.short, art: L.art, strength: L.strength, stars: starsOf6(o), style: styleOf(k), ovr: o };
  }
  function expectedPos6(c, k, lid) {
    var l = lgClubs6(c, lid || k.lid).map(function (x) { return x.ovr; }).sort(function (a, b) { return b - a; });
    return l.indexOf(k.ovr) + 1 || l.length;
  }
  function objectiveFor6(c, k, lid) {
    lid = lid || k.lid;
    var L = lg6(c, lid), n = lgClubs6(c, lid).length, e = clamp(expectedPos6(c, k, lid) + cd(c).objE, 1, n), up = L.lvl === 2, down = L.lvl === 1 && !!lg6(c, L.cc + '2'), half = Math.ceil(n * 0.6);
    if (e <= 1 && !up) return { pos: 1, text: 'Ganar la ' + L.name };
    if (e <= 2) return up ? { pos: 2, text: 'Subir de categoría (quedar entre los 2 primeros)' } : { pos: 2, text: 'Quedar entre los 2 primeros (y jugar la copa internacional)' };
    if (e <= 4) return { pos: 4, text: 'Quedar entre los 4 primeros' };
    if (e <= half) return { pos: half, text: 'Terminar en mitad de tabla (entre los ' + half + ' primeros)' };
    return down ? { pos: n - 2, text: 'Evitar el descenso' } : { pos: n - 1, text: 'No acabar último' };
  }
  function difficultyFor6(k) { var o = k.ovr; for (var i = 0; i < DIFF6_AT.length; i++) if (o >= DIFF6_AT[i][0]) return DIFF6_AT[i][1]; return 'easy'; }
  function soft6(k) { return k.ovr >= SOFT6[0] && k.ovr < SOFT6[1]; }
  function diffLabel6(k) { var d = difficultyFor6(k), nm = VB.DIFF && VB.DIFF[d] && VB.DIFF[d].name || d; return soft6(k) ? nm + ' suave' : nm; }
  /** ¿El club juega en una liga de élite (TOP6)? */
  function top6(c, k) { var L = c && k ? lg6(c, k.lid) : null; return !!L && L.strength >= TOP6; }
  /** Peldaño base (Normal) de un club de pista: 0 Fácil, 1 Normal suave, 2 Normal, 3 Difícil, 4 Experto. */
  function baseStep6(k) { var d = difficultyFor6(k); return d === 'expert' ? 4 : d === 'hard' ? 3 : d === 'normal' ? (soft6(k) ? 1 : 2) : 0; }
  /** Desvío de la media del rival en tus partidos jugados (attrTop en la élite). */
  function attrOf6(c, k) { var D = cd(c); return D.attrTop != null && top6(c, k) ? D.attrTop : D.attr; }
  /** IA rival efectiva en la dificultad de la carrera c (como rivalAI de la playa, con GATE6, TOP6 y las 2ªs como «Regional»). */
  function rivalAI6(c, k) {
    var D = cd(c), G = GATE6[diffOf(c)] || {}, b = baseStep6(k), s, top = top6(c, k), L = lg6(c, k.lid);
    if (D.regEasy && L && L.lvl === 2) s = 0;
    else {
      s = clamp(b + (top && D.shiftTop != null ? D.shiftTop : D.shift), 0, STEPS.length - 1);
      if (D.noSoft && s === 1) s = 2;
      while (s > b) { var g = G[STEPS[s].d]; if (STEPS[s].d === 'expert' && top && D.topX === false) { s--; continue; } if (g == null || STEPS[s].soft || k.ovr >= g) break; s--; }
      if (D.noSoft && s === 1) s = 2;
    }
    var st = STEPS[s], nm = (VB.DIFF && VB.DIFF[st.d] && VB.DIFF[st.d].name) || st.d;
    return { step: s, base: b, diff: st.d, soft: st.soft, name: st.soft ? nm + ' suave' : nm };
  }
  function makeObjective6(c, k, lid) { var o = objectiveFor6(c, k, lid); o.d = diffOf(c); return o; }
  /** Cambiar la dificultad de la Carrera de pista (como setDifficulty de la playa, con su guardado). */
  function setDifficulty6(k) {
    var c = load6(); if (!c) return '';
    if (CDIFF_KEYS.indexOf(k) < 0) return 'bad';
    if (M) return 'match';
    if (diffOf(c) === k) return 'same';
    var low = seasonDiff(c), used = CDIFF_KEYS.reduce(function (s, x) { return s + ((c.dUse && c.dUse[x]) | 0); }, 0), live = c.phase === 'league' || c.phase === 'ko';
    c.diff = k;
    var x = DIFF_MSG[k];
    if (myClub(c) && c.phase === 'league' && used === 0) {
      var ob = c.objective && c.objective.text; c.objective = makeObjective6(c, myClub(c));
      if (CDIFF[c.coachD]) { c.coach = clamp(c.coach + CDIFF[k].coach0 - CDIFF[c.coachD].coach0, 0, 100); c.coachD = k; }
      x += ' Aún no has jugado esta temporada: ' + (ob !== c.objective.text ? 'el objetivo del club pasa a ser ' + c.objective.text.toLowerCase() + '.' : 'el objetivo del club se mantiene.');
    } else if (myClub(c) && live) x += ' El objetivo del club no cambia hasta la temporada que viene.';
    if (live && used > 0 && CDIFF_KEYS.indexOf(low.d) < CDIFF_KEYS.indexOf(k))
      x += ((c.dUse && c.dUse[low.d]) | 0) > 0 ? ' Esta temporada ya has jugado en ' + CDIFF[low.d].name + ': sus títulos contarán como ' + CDIFF[low.d].name + '.'
        : ' El objetivo de esta temporada se fijó en ' + CDIFF[low.d].name + ': sus títulos contarán como ' + CDIFF[low.d].name + '.';
    msg(c, 'club', 'Dificultad: ' + CDIFF[k].name, x);
    save6(c); return 'ok';
  }
  /** Migración de la dificultad en un guardado de pista (idempotente; como la de la playa): lo que falta es Normal. */
  function saneDiff6(o) {
    var num = function (v) { return typeof v === 'number' && isFinite(v); };
    if (CDIFF_KEYS.indexOf(o.diff) < 0) o.diff = 'normal';
    var hadUse = !!o.dUse && typeof o.dUse === 'object';
    if (!hadUse) o.dUse = {};
    CDIFF_KEYS.forEach(function (k) { o.dUse[k] = num(o.dUse[k]) ? Math.max(0, o.dUse[k] | 0) : 0; });
    if (!hadUse && o.stats && num(o.stats.played)) o.dUse.normal = Math.max(0, (o.stats.played | 0) + (num(o.stats.bench) ? o.stats.bench | 0 : 0));
    if (o.coachD != null && CDIFF_KEYS.indexOf(o.coachD) < 0) delete o.coachD;
    if (o.objective && typeof o.objective === 'object' && CDIFF_KEYS.indexOf(o.objective.d) < 0) o.objective.d = lowUse(o.dUse) || o.diff;
    (Array.isArray(o.history) ? o.history : []).forEach(function (h) { if (h && typeof h === 'object') { if (CDIFF_KEYS.indexOf(h.d) < 0) h.d = 'normal'; h.dm = !!h.dm; } });
    (Array.isArray(o.trophies) ? o.trophies : []).forEach(function (t) { if (t && typeof t === 'object' && CDIFF_KEYS.indexOf(t.d) < 0) t.d = 'normal'; });
    if (o.review && typeof o.review === 'object') {
      if (CDIFF_KEYS.indexOf(o.review.d) < 0) {
        var hs = (Array.isArray(o.history) ? o.history : []).filter(function (h) { return h && typeof h === 'object' && h.season === o.review.season; }).pop();
        var sd0 = hs ? { d: hs.d, dm: hs.dm } : hadUse ? seasonDiff(o) : { d: 'normal', dm: false };
        o.review.d = sd0.d; o.review.dm = sd0.dm;
      }
      o.review.dm = !!o.review.dm;
    }
  }
  function chemBonus6(c) { return c ? Math.min(3, Math.floor(clamp(c.chem | 0, 0, 100) / 30)) : 0; }
  /** Fuerza de tu equipo para la simulación: la del club, movida por tu media (un 30 %), insignias, forma, química y fatiga. */
  function teamOvr6(c) {
    var k = myClub(c); if (!k) return 0;
    var f = form(c);
    return k.ovr + 0.3 * (playerOvr(c) - k.ovr) + 0.35 * badgePower(c.player) + (f == null ? 0 : (f - 6.5) * 0.8) + 0.5 * chemBonus6(c) - 0.5 * fatigueMalus(c);
  }
  function wkKey6(c) { return (c.season | 0) * 1000 + (c.phase === 'ko' ? 500 + (c.koI | 0) * 10 + ((c.kos && c.kos[c.koI] && c.kos[c.koI].round) | 0) : c.week | 0); }
  function roundName6(pairs) { return pairs <= 1 ? 'Final' : pairs === 2 ? 'Semifinal' : pairs <= 4 ? 'Cuartos' : 'Octavos'; }
  // ---------------------------------------------------------------- plantilla con profundidad y seis inicial (titularidad)
  /** Puesto con el que compites en la plantilla: el que llevas en el partido (ctrlRole6). */
  function sqPos6(c) { return ctrlRole6(c); }
  /** Plantilla de un club (jugadores inventados, sin ti), determinista por semilla, club y temporada. SQ_SIZE por puesto contándote a
   *  ti en el tuyo (+1 receptor y +1 central en los clubes de SQ_BIG o más). Los dos primeros de cada puesto son los titulares
   *  naturales (media del club −3..+4); el resto, −9..−1; el líbero ±3 (dorsal 13). Dorsales únicos 1-20 sin el tuyo ni el 13. */
  function squad6(c, k, season, mePos) {
    if (mePos == null) mePos = sqPos6(c);   // ('' = club rival: sin hueco para ti)
    var r = rng(hash(c.seed, 'sq6', k.id, season)), pool = [], list = [], names = {}, ni = 0, big = k.ovr >= SQ_BIG;
    names[c.player.name] = names[String(c.player.name).split(' ')[0]] = 1;
    for (var n = 1; n <= 20; n++) if (n !== (c.player.num | 0) && n !== 13) pool.push(n);
    shuffle(r, pool);
    SQ_POS.forEach(function (pos) {
      var cnt = SQ_SIZE[pos] + (big && (pos === 'OH' || pos === 'MB') ? 1 : 0) - (pos === mePos ? 1 : 0);
      for (var i = 0; i < cnt; i++) {
        var fn, nm, g = 0; do { fn = pick(r, FIRST); nm = fn + ' ' + pick(r, LAST); } while ((names[nm] || names[fn]) && g++ < 30); names[nm] = names[fn] = 1;   // (sin nombres repetidos en la plantilla)
        var d = pos === 'L' ? -3 + 6 * r() : i < 2 ? -3 + 7 * r() : -9 + 8 * r(), o = clampI(k.ovr + d, 20, 99);
        list.push({ id: 'q' + list.length, name: nm, pos: pos, num: pos === 'L' ? 13 : pool[ni++ % pool.length], ovr: o, form: 0, fat: 0,
          conf: clampI(50 + 2 * (o - k.ovr), 30, 75), ls: i < SLOTS6[pos] ? 1 : 0 });
      }
    });
    return list;
  }
  function newSq6(c, k, season) {
    return { club: k.id, season: season, pos: sqPos6(c), kovr: k.ovr, list: squad6(c, k, season), stat: null, why: '', wk: null, ahead: [], run: 0, titBench: 0, fresh: 1, meLs: 0, outC: 0, L: null };
  }
  /** Plantilla de tu club (c.sq6): la crea si falta o si es de otro club o de otro puesto. */
  function sq6(c) {
    var k = myClub(c); if (!k) return null;
    var q = c.sq6;
    if (!q || typeof q !== 'object' || q.club !== k.id || q.pos !== sqPos6(c) || !Array.isArray(q.list) || !q.list.length) q = c.sq6 = newSq6(c, k, c.season + (c.phase === 'off' ? 1 : 0));
    return q;
  }
  /** Verano sin cambiar de club: los que siguen se mueven ±2 (y con la media del club), forma y fatiga a 0. */
  function sqSummer6(c) {
    var k = myClub(c), q = c.sq6; if (!k) return;
    if (!q || q.club !== k.id || q.pos !== sqPos6(c) || !Array.isArray(q.list)) { c.sq6 = newSq6(c, k, c.season); return; }
    var r = rng(hash(c.seed, 'sq6n', k.id, c.season)), dk = k.ovr - (q.kovr != null ? q.kovr : k.ovr);
    q.list.forEach(function (x) { x.ovr = clampI(x.ovr + dk - 2 + 4 * r(), 20, 99); x.form = 0; x.fat = 0; });
    q.kovr = k.ovr; q.season = c.season; q.run = 0; q.titBench = 0; q.outC = 0; q.wk = null; q.L = null;
  }
  function sqEntry6(c, q, id) {
    if (id === 'me') return { id: 'me', name: c.player.name, pos: sqPos6(c), num: c.player.num, ovr: playerOvr(c), form: Math.round(myForm6(c)), fat: c.fatigue | 0, me: true };
    for (var i = 0; i < q.list.length; i++) if (q.list[i].id === id) return q.list[i];
    return null;
  }
  /** El entrenador elige el seis de la jornada (una vez por jornada: caché en c.sq6 por wkKey6, rol, club y puesto). sel = media +
   *  0,8 × forma + (confianza − 50) / 12 − fatiga por encima de 50 / 10 + 0,75 si salió de inicio la anterior ± 0,5 (determinista).
   *  Tú: tu media + meEdge6 (12 de novato → 4 de veterano), la impresión de tus sesiones de entrenamiento (hasta SEL_IMP), forma de tus notas, la confianza del entrenador, tu fatiga; Titular +TIT_BONUS; Titular indiscutible
   *  siempre de inicio (salvo fatiga ≥ FAT_REST_TOP); con fatiga ≥ FAT_REST descansas; con confianza < OUT_COACH no te convoca.
   *  Devuelve { stat: 'start'|'sub'|'out', why, slot, start: [6 ids en orden ROLES6], bench: [ids], out: [ids], lib, rival, gap, ahead }. */
  function lineup6(c) {
    var q = sq6(c); if (!q) return null;
    var wk = wkKey6(c), rl = roleIdx(c), pos = sqPos6(c), key = wk + '|' + rl + '|' + q.club + '|' + pos;
    if (q.L && q.wk === key) return q.L;
    var noise = function (id) { return (rng(hash(c.seed, 'sel', wk, id))() - 0.5) * 2 * SEL_NOISE; };
    var ent = q.list.map(function (x) { return { id: x.id, pos: x.pos, ovr: x.ovr, form: x.form | 0, conf: x.conf, fat: x.fat | 0, keep: x.ls ? SEL_KEEP : 0, ls: x.ls }; });
    var me = { id: 'me', pos: pos, ovr: playerOvr(c) + meEdge6(c), form: myForm6(c), conf: c.coach, fat: c.fatigue | 0, keep: !q.fresh && q.meLs ? SEL_KEEP : 0, me: true, imp: SEL_IMP * (c.ts ? c.ts.imp || 0 : 0) / 100, last: lastSel6(c.ln6) };
    ent.push(me);
    ent.forEach(function (e) {
      e.t = { ovr: e.ovr, form: SEL_FORM * e.form, conf: (e.conf - 50) / SEL_CONF, fat: -Math.max(0, e.fat - SEL_FAT0) / SEL_FATK, imp: e.imp || 0, last: e.last || 0 };
      e.sel = e.t.ovr + e.t.form + e.t.conf + e.t.fat + e.t.imp + e.t.last + e.keep + noise(e.id);
    });
    if (rl === 1) me.sel += TIT_BONUS;
    // con confianza < OUT_COACH: la Rotación se queda fuera de la convocatoria, pero nunca dos jornadas seguidas (como benchFor en la
    // playa); el Titular nunca queda fuera por eso: va al banquillo ('coachSub', primer suplente de su puesto)
    var prevOut = !!q.outC;   // (squadWeek6: la jornada anterior te dejó fuera el entrenador)
    var force = c.coach < OUT_COACH && rl < 2 ? (rl === 0 && !prevOut ? 'coach' : 'coachSub') : (rl === 2 ? me.fat >= FAT_REST_TOP : me.fat >= FAT_REST) ? 'fatiga' : rl === 2 ? 'start' : '';
    var by = {}, out = [];
    SQ_POS.forEach(function (p) {
      by[p] = ent.filter(function (e) { return e.pos === p; }).sort(function (a, b) { return b.sel - a.sel || (a.id < b.id ? -1 : 1); });
    });
    var mine = by[pos], mi = mine.indexOf(me);
    mine.splice(mi, 1);
    if (force === 'start') mine.unshift(me);
    else if (force === 'coach') out.push(me);
    else if (force === 'fatiga' || force === 'coachSub') mine.splice(Math.min(mine.length, SLOTS6[pos]), 0, me);
    else mine.splice(mi, 0, me);
    var ord = mine.map(function (e) { return e.id; }); if (force === 'coach') ord.push('me');
    // convocatoria de LIST6 (13): fuera los peores de los puestos con más suplentes
    var n = ent.length - out.length, why = force === 'coach' || force === 'coachSub' ? 'coach' : force === 'fatiga' ? 'fatiga' : '';
    while (n > LIST6) {
      var bp = '', br = 0;
      ['S', 'OPP', 'OH', 'MB'].forEach(function (p) { var rs = by[p].length - SLOTS6[p]; if (rs > br || (rs === br && rs > 0 && by[p][by[p].length - 1].sel < by[bp][by[bp].length - 1].sel)) { bp = p; br = rs; } });
      if (!bp || br <= 0) break;
      var gone = by[bp].pop(); out.push(gone); n--;
      if (gone === me) why = 'list';
    }
    var R = simRoles6(), cnt = {}, start = R.map(function (p) { var i = cnt[p] = (cnt[p] || 0); cnt[p]++; return by[p][i] ? by[p][i].id : ''; });
    var bench = [];
    ['S', 'OPP', 'OH', 'MB'].forEach(function (p) { by[p].slice(SLOTS6[p]).forEach(function (e) { bench.push(e.id); }); });
    var slot = start.indexOf('me'), stat = slot >= 0 ? 'start' : out.indexOf(me) >= 0 ? 'out' : 'sub';
    if (stat === 'out' && !why) why = 'list';
    // rival de tu puesto: con 'start', el mejor suplente (quien te aprieta); si no, el titular más flojo (a quien tienes que superar)
    var starters = mine.slice(0, SLOTS6[pos]).filter(function (e) { return e !== me; }), reserves = mine.slice(SLOTS6[pos]).filter(function (e) { return e !== me; });
    var rv = stat === 'start' ? reserves[0] : starters[starters.length - 1];
    if (stat !== 'start' && !why) {
      if (q.fresh) why = 'new';
      else if (me.t.last <= LAST_BAD_SEL) why = 'nota';   // la nota muy mala del último partido
      else if (rv) { var bw = 'ovr', bd = -1e9; ['ovr', 'form', 'conf'].forEach(function (t) { var d = rv.t[t] - me.t[t]; if (d > bd) { bd = d; bw = t; } }); why = bw; }
      else why = 'ovr';
    }
    var L = { stat: stat, why: stat === 'start' ? '' : why, slot: slot, start: start, bench: bench, out: out.map(function (e) { return e.id; }), lib: by.L[0] ? by.L[0].id : '',
      rival: rv ? rv.id : '', gap: rv ? round1(me.sel - rv.sel) : stat === 'start' ? 9 : -9, ahead: stat === 'start' ? [] : starters.map(function (e) { return e.id; }),
      prevIn: '', ord: ord, imp: round1(me.t.imp), last: round1(me.t.last), lastNota: c.ln6 ? c.ln6.nota : null, edge: meEdge6(c) };
    if (stat === 'start') { var was = ent.filter(function (e) { return e.pos === pos && e.ls && e !== me && start.indexOf(e.id) < 0; })[0]; L.prevIn = was ? was.id : L.rival; }
    // mensajes del entrenador, solo al cambiar de estado (la primera elección en un club la explica la bienvenida)
    var prev = q.stat, prevWhy = q.why;
    q.wk = key; q.L = L; q.stat = stat; q.why = L.why; q.ahead = L.ahead.slice();
    if (prev && prev !== stat) coachLineMsg6(c, q, L, prev, prevWhy);
    return L;
  }
  function coachLineMsg6(c, q, L, prev, prevWhy) {
    var who = function (id) { var e = id && sqEntry6(c, q, id); return e ? e.name : 'otro ' + POS6[sqPos6(c)].name.toLowerCase(); };
    if (L.stat === 'start') {
      if (prevWhy === 'fatiga') msg(c, 'coach', 'Sales de inicio', 'Ya has descansado: el próximo partido vuelves al seis inicial.');
      else if (L.imp >= 0.5 && L.gap - L.imp < 0) msg(c, 'coach', 'Sales de inicio', 'Te has ganado el sitio en los entrenos: el próximo partido juegas de inicio en lugar de ' + who(L.prevIn) + '.');
      else msg(c, 'coach', 'Sales de inicio', 'Has convencido con tu juego: el próximo partido juegas de inicio en lugar de ' + who(L.prevIn) + '.');
    } else if (L.stat === 'out') msg(c, 'coach', 'Fuera de la convocatoria', 'Esta jornada no entras en la lista de ' + LIST6 + '. ' + cap1(WHY6[L.why] || WHY6.list) + '. Sigue entrenando y volverás.');
    else if (L.why === 'fatiga') msg(c, 'coach', 'Descansas de inicio', 'Vas con mucha fatiga (' + (c.fatigue | 0) + '). Empiezas en el banquillo para dosificarte.');
    else msg(c, 'coach', 'Empiezas en el banquillo', 'Esta semana sale de inicio ' + who(L.rival) + ': ' + (WHY6[L.why] || WHY6.ovr) + '. Estate a punto: si el partido lo pide, entras.' + (L.imp < SEL_IMP / 2 ? ' Y demuéstrame en los entrenos que mereces jugar.' : ''));
  }
  /** Texto del estado de la jornada (HALL.benchWhy): '' si sales de inicio. */
  function whyText6(c) {
    c = c || load6(); var L = c && myClub(c) ? lineup6(c) : null; if (!L || L.stat === 'start') return '';
    var q = c.sq6, rv = L.rival && sqEntry6(c, q, L.rival);
    if (L.stat === 'out') return cap1(WHY6[L.why] || WHY6.list) + '.';
    return (rv ? 'Sale de inicio ' + rv.name + ': ' : '') + (rv ? WHY6[L.why] || WHY6.ovr : cap1(WHY6[L.why] || WHY6.ovr)) + '.';
  }
  /** Tras cada jornada de tu equipo: forma de cada uno (paseo ±1 con vuelta a 0), fatiga (+12 de inicio, +6 si entró, −15 si no jugó),
   *  confianza ±1 según la forma. how: 'start' | 'in' | 'none' | 'out' (tú) o 'bye' (tu equipo descansa). Determinista. */
  function squadWeek6(c, how) {
    var q = c.sq6; if (!q || !Array.isArray(q.list)) return;
    var L = q.L, st = {}, r = rng(hash(c.seed, 'sqw', c.season, wkKey6(c), q.club)), bye = how === 'bye', rin = how === 'in' && L ? L.rival : '';
    if (L && !bye) { L.start.forEach(function (id) { st[id] = 1; }); if (L.lib) st[L.lib] = 1; }
    q.list.forEach(function (x) {
      var u = r(), f = x.form | 0; f += u < 0.3 ? -1 : u < 0.6 ? 1 : 0; if (f && r() < 0.3) f += f > 0 ? -1 : 1; x.form = clampI(f, -FORM_MAX, FORM_MAX);
      x.fat = clampI((x.fat | 0) + (!bye && st[x.id] ? (x.id === rin ? 6 : 12) : -15), 0, 100);
      if (!bye) x.ls = st[x.id] ? 1 : 0;
      x.conf = clampI(x.conf + (x.form > 0 ? 1 : x.form < 0 ? -1 : 0), 30, 75);
    });
    if (!bye) { q.meLs = how === 'start' ? 1 : 0; q.fresh = 0; q.outC = how === 'out' && L && L.why === 'coach' ? 1 : 0; }
  }
  /** Rol tras una jornada de liga: Rotación → Titular con STARTS_PROMOTE inicios seguidos; Titular que se queda TIT_BROKEN jornadas
   *  sin salir de inicio (no por fatiga) → promesa incumplida (c.broken). */
  function roleWeek6(c, f) {
    var q = c.sq6, L = q && q.L; if (!L || !f || f.kind !== 'league' || !c.contract) return;
    var rl = roleIdx(c);
    if (rl === 0) { q.run = L.stat === 'start' ? (q.run | 0) + 1 : 0; promoteCheck6(c); }
    else if (rl === 1 && L.stat !== 'start' && L.why !== 'fatiga') {
      q.titBench = (q.titBench | 0) + 1;
      if (q.titBench >= TIT_BROKEN && c.broken !== c.season) {
        c.broken = c.season;
        msg(c, 'agent', 'Promesa incumplida', myClub(c).name + ' te fichó como titular y ya te ha dejado ' + plural(q.titBench, 'jornada', 'jornadas') + ' sin salir de inicio. Hasta final de temporada puedes irte sin pegas aunque tengas contrato, y los clubes lo saben: llegarán más ofertas (a mitad de temporada basta con una nota media de 6,5).');
      }
    }
  }
  /** Plantilla del club para Club › Equipo y career-life (mate6): la de c.sq6 con tu fila (me) y el estado de la jornada; para otro
   *  club, la de squad6 sin guardar. Campos: name, pos, posName, ovr, num, me, form, stat ('start'|'sub'|'out'), slot (0-5 o −1). */
  function roster6(c, k) {
    k = k || myClub(c); if (!k) return [];
    var mine = k.id === c.myClub, q = mine ? sq6(c) : null, L = mine && c.phase !== 'off' && myFixture6(c) ? lineup6(c) : null;
    var list = mine ? q.list.slice() : squad6(c, k, c.season);
    if (mine) list.push({ id: 'me' });
    var R = simRoles6(), order = { S: 0, OPP: 1, OH: 2, MB: 3, L: 4 };
    var out = list.map(function (x) {
      var e = x.id === 'me' ? sqEntry6(c, q, 'me') : x, slot = L ? L.start.indexOf(x.id) : -1;
      var stat = L ? (slot >= 0 || L.lib === x.id ? 'start' : L.out.indexOf(x.id) >= 0 ? 'out' : 'sub') : (x.ls || (x.id === 'me' && q.meLs) ? 'start' : 'sub');
      return { id: e.id, name: e.name, pos: e.pos, posName: POS6[e.pos].name, ovr: e.ovr, num: e.num, me: x.id === 'me', form: e.form | 0, fat: e.fat | 0, stat: stat, slot: slot };
    });
    out.sort(function (a, b) { return order[a.pos] - order[b.pos] || (a.stat === 'start' ? 0 : a.stat === 'sub' ? 1 : 2) - (b.stat === 'start' ? 0 : b.stat === 'sub' ? 1 : 2) || b.ovr - a.ovr; });
    return out;
  }
  /** Tu sitio en el puesto (Club › Equipo): { k: 1.., n: jugadores del puesto, ahead: [nombres por delante] }. */
  function depthNow6(c) {
    var q = sq6(c); if (!q) return null;
    var pos = sqPos6(c), L = myFixture6(c) && c.phase !== 'off' ? lineup6(c) : null;
    var n = q.list.filter(function (x) { return x.pos === pos; }).length + 1;
    if (!L) return { k: 0, n: n, ahead: [] };
    var k = (L.ord || []).indexOf('me') + 1;
    return { k: k || n, n: n, ahead: L.ahead.map(function (id) { var e = sqEntry6(c, q, id); return e ? e.name : ''; }), stat: L.stat };
  }
  /** Profundidad de tu puesto en un club (ofertas): tu sel de recién llegado (sin SEL_KEEP, confianza del rol rl) contra su plantilla
   *  de esa temporada. { slots, ahead: [{name, ovr}], rank, start, gap }. k puede ser {id, ovr} con la media de la temporada que viene. */
  function depth6(c, k, lid, season, rl, o) {
    // o.merit: solo el nivel (sin las ventajas del rol: lo que usa el club para decidir qué rol puede prometer); si no, con el rol
    // ofrecido como en lineup6 (Titular +TIT_BONUS, Titular indiscutible siempre de inicio) y la confianza con la que llegarías
    // (o.pen: lo que resta una salida con contrato o una negociación rechazada), para que «Tu sitio» diga lo que pasará
    o = o || {}; rl = rl == null ? 1 : rl;
    var pos = sqPos6(c), list = squad6(c, k, season || c.season, pos).filter(function (x) { return x.pos === pos; });
    var me = playerOvr(c) + meEdge6(c, season || c.season) + SEL_FORM * myForm6(c) + (clamp(ROLE_COACH[rl] - (o.pen || 0), 0, 100) - 50) / SEL_CONF + (!o.merit && rl === 1 ? TIT_BONUS : 0);
    var s = list.map(function (x) { return { name: x.name, ovr: x.ovr, sel: x.ovr + (x.conf - 50) / SEL_CONF + (x.ls ? SEL_KEEP : 0) }; }).sort(function (a, b) { return b.sel - a.sel; });
    var slots = SLOTS6[pos], ahead = !o.merit && rl === 2 ? [] : s.filter(function (x) { return x.sel > me; }), ref = s[slots - 1];
    return { slots: slots, ahead: ahead.map(function (x) { return { name: x.name, ovr: x.ovr }; }), rank: ahead.length + 1, start: ahead.length < slots, gap: ref ? round1(me - ref.sel) : 9, rl: o.merit ? -1 : rl };
  }
  /** Profundidad de una oferta: la de su rol (o.depth, la que se enseña) y la de solo el nivel (o.dm, con la que el club decide qué
   *  rol puede prometer). Se rehace al cambiar el rol (negociación) o la confianza de llegada (negociación rechazada). */
  function offerDepth6(c, o, season) {
    var k = club(c, o.club); if (!k || !o.dm) return;
    o.depth = depth6(c, { id: k.id, ovr: o.ovr != null ? o.ovr : k.ovr }, o.lid, season != null ? season : o.dSeason, Math.max(0, ROLE_LV.indexOf(o.role)), { pen: (o.negNo ? NEG_COACH : 0) + (earlyExit(c) ? EARLY_COACH : 0) });
  }
  /** Rol que puede prometer un club según su plantilla: sin sitio y lejos (gap < −3) como mucho Rotación; sin sitio, como mucho
   *  Titular; indiscutible solo con sitio y gap ≥ 3. */
  function capRole6(rl, d) { if (!d) return rl; if (!d.start) return Math.min(rl, d.gap < -3 ? 0 : 1); return d.gap < 3 ? Math.min(rl, 1) : rl; }
  function fit6(d) { return d ? (d.start ? FIT_START : 0) - (d.rank >= 3 ? FIT_DEEP : 0) : 0; }

  // ---------------------------------------------------------------- crear
  function create6(o) {
    o = o || {};
    var seed = (o.seed != null ? +o.seed : (Date.now() ^ (Math.random() * 1e9))) >>> 0, p = P();
    var pos = POS6[o.pos] && positions6().indexOf(o.pos) >= 0 ? o.pos : positions6()[0];
    var name = String(o.name || '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Jugador';
    var num = clampI(o.num != null ? o.num : 1, 1, 99), st = genSt(START6, pos, null);
    var player = p && p.newAthlete ? p.newAthlete({ num: num, role: POS6[pos].name, name: name, st: st })
      : { num: num, role: POS6[pos].name, name: name, lvl: 1, xp: 0, pts: 0, st: st, matches: 0, bp: {}, bd: {}, beq: [] };
    player.roleKey = pos; player.age = 18;
    var c = { v: VER6, mode: 'hall', seed: seed, created: o.now || Date.now(), points: POINTS6.indexOf(+o.points) >= 0 ? +o.points : 15, ctrl: 'one',
      season: 1, week: 0, phase: 'pick', player: player, cc: '', leagues: [], clubs: [], cups: {}, intl: {}, myClub: -1, mate: null,
      tab: {}, myRes: { lid: '', w: [] }, kos: [], koI: 0, notes: [], coach: 50, objective: null, offers: [], window: 'start', review: null, last: null,
      stats: newSeasonStats6(), career: newSeasonStats6(), history: [], trophies: [], pick: { round: 0, more: false }, inbox: [], msgN: 0,
      train: 'bal', tp: { phys: 0, def: 0, atk: 0 }, fatigue: 0, listed: false, contract: null, money: 0, chem: 0, scouts: {},
      provisional: !!(VB.Leagues && VB.Leagues.provisional),
      diff: CDIFF_KEYS.indexOf(o.diff) >= 0 ? o.diff : 'normal', dUse: dZeros() };   // dificultad (15-nov-2026)
    buildWorld6(c);
    if (!c.leagues.length) return null;
    var cos = countries6();
    c.cc = cos.some(function (x) { return x.code === o.country; }) ? String(o.country) : cos.some(function (x) { return x.code === 'ES'; }) ? 'ES' : cos[0].code;
    c.offers = genStartOffers6(c, 0);
    var L0 = lg6(c, c.offers[0] ? club(c, c.offers[0].club).lid : c.cc + '1');
    msg(c, 'agent', 'Tienes ' + c.offers.length + ' ofertas', 'Soy tu agente. Varios clubes ' + (L0 ? 'de la ' + L0.name + ' (' + L0.country + ')' : '') + ' quieren ' + (c.offers.some(function (x) { return x.trial; }) ? 'ficharte o probarte' : 'ficharte') +
      ' para la temporada 1 como ' + POS6[pos].name.toLowerCase() + '. Compara las fichas (liga, prestigio, objetivo, rol y sueldo). Juega bien y los ojeadores de las ligas fuertes, también de fuera, vendrán a verte.');
    cur6 = c; M = null; lost6 = false;
    life(c, 'create');   // vida de la Carrera (career-life.js): c.life, con la fama heredada del Salón de la Fama
    if (o.autoClub) { var i = 0, best = -1; c.offers.forEach(function (x, j) { if (!x.trial && (best < 0 || x.ovr < best)) { best = x.ovr; i = j; } }); joinClub6(c, c.offers[i], c.offers[i].years); }
    save6(c);
    return c;
  }
  /** Ofertas de inicio: 3-4 clubes modestos de la división más baja de tu país y, en la 1ª ronda, quizá una prueba en el peor de la 1ª. */
  function genStartOffers6(c, round) {
    var r = rng(hash(c.seed, 'start6', round)), low = lg6(c, c.cc + '2') ? c.cc + '2' : c.cc + '1';
    var div = lgClubs6(c, low).sort(function (a, b) { return a.ovr - b.ovr || a.id - b.id; });
    var pool = round === 0 ? div.slice(0, 6) : div.slice(0, 3), avg = pool.reduce(function (s, k) { return s + k.ovr; }, 0) / Math.max(1, pool.length);
    shuffle(r, pool);
    var n = round === 0 ? 3 + (r() < 0.5 ? 1 : 0) : (round === 1 ? 3 : 2);
    var out = pool.slice(0, n).map(function (k) { return startOffer6(c, k, avg, round, r, false); });
    if (round === 0 && low !== c.cc + '1' && r() < 0.75) {
      var top = lgClubs6(c, c.cc + '1').sort(function (a, b) { return a.ovr - b.ovr || a.id - b.id; })[0];
      if (top) out.push(startOffer6(c, top, avg, round, r, true));
    }
    out.sort(function (a, b) { return (a.trial ? 1 : 0) - (b.trial ? 1 : 0) || b.ovr - a.ovr; });
    return out;
  }
  function startOffer6(c, k, avg, round, r, trial) {
    var d = depth6(c, k, k.lid, c.season, 1, { merit: true }), it = round1(8 + (avg - k.ovr) + (r() - 0.5) * 8 + round * 2.5 + fit6(d));   // (+2 si serías titular, −2 si 3º o peor)
    var rl = trial ? 0 : capRole6(it > ROLE_NEED[2] ? 2 : it > ROLE_NEED[1] ? 1 : 0, d);
    var o = { club: k.id, lid: k.lid, cc: k.cc, ovr: k.ovr, interest: it, role: ROLE_LV[rl], years: trial ? 1 : 1 + Math.floor(r() * 2),
      salary: Math.round(salary6(c, k, rl) * (round ? 0.85 : 1) / 50) * 50, objective: objectiveFor6(c, k).text, start: 1, foreign: false, dm: d, dSeason: c.season };
    offerDepth6(c, o);
    if (trial) { o.trial = true; o.chance = round1(clamp(0.3 + (playerOvr(c) - START6) * 0.04, 0.1, 0.75) * 10) / 10; }
    return o;
  }
  function joinClub6(c, o, years) {
    var k = club(c, o.club), rl = Math.max(0, ROLE_LV.indexOf(o.role));
    c.myClub = k.id; c.chem = 0; c.ln6 = null;   // (la nota del último partido no viaja al club nuevo)
    years = clampI(years != null ? years : o.years || 1, 1, 3);
    c.contract = { club: k.id, years: years, left: years, role: ROLE_LV[rl], salary: o.salary || salary6(c, k, rl), since: c.season + (c.phase === 'off' ? 1 : 0) };
    c.coach = clamp(ROLE_COACH[rl] + cd(c).coach0 - (o.early ? EARLY_COACH : 0) - (o.negNo ? NEG_COACH : 0), 0, 100); c.listed = false; c.broken = 0;   // (+ coach0 de la dificultad)
    c.coachD = diffOf(c);
    c.joinWk = c.phase === 'off' ? (c.season + 1) * 1000 : wkKey6(c);
    sessSane(c).imp = 0; c.ts.cf = 0;   // entrenador nuevo: la impresión en los entrenos empieza de cero
    c.sq6 = newSq6(c, k, c.season + (c.phase === 'off' ? 1 : 0));   // plantilla del club nuevo (titularidad)
    c.offers = []; c.window = '';
    if (c.phase === 'pick') { c.phase = 'league'; c.week = 0; c.pick = null; }
    if (c.phase !== 'off') {
      c.myRes = { lid: k.lid, w: [] };
      c.objective = makeObjective6(c, k);
      if (c.phase === 'league') { if (c.week >= weeksOf6(c, k.lid)) endLeague6(c); else skipBye6(c); }
      welcome6(c);   // (tras los descansos: la bienvenida ya sabe si sales de inicio en tu primer partido)
    }
    life(c, 'join', o);   // (como joinClub en la playa: Faro, «antes del debut» o «club nuevo»)
  }
  function welcome6(c) {
    var k = myClub(c), L = lg6(c, k.lid), ct = c.contract;
    msg(c, 'coach', 'Bienvenido a ' + k.name, 'Aquí empiezas como ' + ct.role.toLowerCase() + ' (' + plural(ct.years, 'temporada', 'temporadas') + ') y juegas de ' + POS6[c.player.roleKey].name.toLowerCase() +
      ' en la ' + L.name + ' (' + L.country + '). Objetivo del club: ' + c.objective.text.toLowerCase() + '. El equipo no te conoce: la química sube con cada partido juntos.' + aheadText6(c));
  }
  /** Bienvenida: si al llegar no sales de inicio, quién va por delante en tu puesto. */
  function aheadText6(c) {
    var L = myFixture6(c) ? lineup6(c) : null; if (!L || L.stat === 'start' || !L.ahead.length) return '';
    var a = L.ahead.map(function (id) { return sqEntry6(c, c.sq6, id); }).filter(Boolean), t = function (e) { return e.name + ' (' + e.ovr + ')'; };
    if (!a.length) return '';
    return ' Aquí tendrás que ganarte el puesto: por delante ' + (a.length === 1 ? 'está ' + t(a[0]) : 'están ' + a.slice(0, -1).map(t).join(', ') + yE(a[a.length - 1].name) + t(a[a.length - 1])) + '.';
  }

  // ---------------------------------------------------------------- jornada, copas y temporada
  function myFixture6(c) {
    var k = myClub(c); if (!k) return null;
    if (c.phase === 'league') {
      var wk = sched6(c, k.lid)[c.week]; if (!wk) return null;
      for (var i = 0; i < wk.length; i++) if (wk[i][0] === k.id || wk[i][1] === k.id) return { kind: 'league', week: c.week, i: i, home: wk[i][0], away: wk[i][1] };
      return null;
    }
    if (c.phase === 'ko') {
      var ko = c.kos && c.kos[c.koI]; if (!ko || ko.champion >= 0) return null;
      var rd = ko.round, ps = ko.rounds[rd] || [];
      for (var j = 0; j < ps.length; j++) if ((ps[j][0] === k.id || ps[j][1] === k.id) && !(ko.res[rd] && ko.res[rd][j])) return { kind: 'ko', ko: c.koI, round: rd, i: j, home: ps[j][0], away: ps[j][1] };
    }
    return null;
  }
  function next6(c) {
    c = c || load6(); if (!c) return null;
    var f = myFixture6(c); if (!f) return null;
    var me = myClub(c), riv = club(c, f.home === me.id ? f.away : f.home), L = lg6(c, me.lid), ko = f.kind === 'ko' ? c.kos[f.ko] : null;
    var label = ko ? ko.name + ' · ' + roundName6(ko.rounds[f.round].length) : L.name + ' · Jornada ' + (f.week + 1) + ' de ' + weeksOf6(c, me.lid);
    var lu = lineup6(c), rv = lu.rival ? sqEntry6(c, c.sq6, lu.rival) : null, ai = rivalAI6(c, riv);
    return { kind: f.kind, week: f.week, round: f.round, ko: f.ko, i: f.i, label: label, home: club(c, f.home), away: club(c, f.away), me: me, rival: riv, atHome: f.home === me.id,
      ovrMe: Math.round(teamOvr6(c)), ovrRival: riv.ovr + attrOf6(c, riv), ovrClub: riv.ovr, ovrSim: riv.ovr + cd(c).simAttr, diff: ai.diff, soft: ai.soft, diffName: ai.name, cdiff: diffOf(c), comp: ko ? ko.kind : 'league', compName: ko ? ko.name : L.name,
      foreign: riv.cc !== me.cc, rivalLeague: lg6(c, riv.lid), bench: lu.stat === 'out',
      // titularidad: 'start' (de inicio), 'sub' (empiezas en el banquillo: el partido se juega igual) o 'out' (fuera de la convocatoria)
      status: lu.stat, whyCode: lu.why, why: whyText6(c), gap: lu.gap, slot: lu.slot,
      rivalIn: rv ? { name: rv.name, pos: rv.pos, ovr: rv.ovr, form: rv.form | 0, num: rv.num } : null };
  }
  /** Capitán (dorsal) de una plantilla para el acta: por media, sin líberos, el primero que esté entre los dorsales convocados. */
  function capt6(list, nums) {
    var c6 = list.filter(function (x) { return x && x.pos !== 'L' && nums.indexOf(x.num) >= 0; }).sort(function (a, b) { return (b.ovr | 0) - (a.ovr | 0) || (a.num | 0) - (b.num | 0); });
    return c6.length ? c6[0].num | 0 : 0;
  }
  function iq6(d) { return d === 'easy' ? 1 : d === 'normal' ? 2 : 3; }
  /** Reglas del entrenador de tu club hacia ti en el partido (sim/ai6, §B.3): cuándo te saca y cuándo te mete. */
  function meRules6(c, L) {
    var rl = roleIdx(c), low = c.coach < 45;
    return { pullAt: rl === 2 ? 99 : rl === 1 ? (low ? 4 : 5) : (low ? 3 : 4), enterLostSet: L.gap >= -4, enterBad: true, garbage: true, backNextSet: c.coach >= 50 };
  }
  /** Opciones del partido de pista: 6v6 en el pabellón, tu puesto, atributos de los 12, colores de los dos clubes (con el líbero). */
  function matchSetup6(c) {
    c = c || load6(); var n = next6(c); if (!n || n.bench) return null;
    var R = simRoles6(), role = ctrlRole6(c), Lu = lineup6(c), q = c.sq6, meOn = Lu.stat === 'start', idx = meOn ? Lu.slot : -1;
    var r = rng(hash(c.seed, 'riv6', c.season, c.phase, n.week, n.round, n.ko, n.rival.id));
    var stMe = copy(c.player.st), fm = fatigueMalus(c), ch = chemBonus6(c);
    KEYS.forEach(function (key) { stMe[key] = clampI(stMe[key] - fm + (CHEM_KEYS.indexOf(key) >= 0 ? ch : 0), 1, 99); });
    var bd = B() && B().forPlayer ? B().forPlayer(c.player) : null; if (bd && !Object.keys(bd).length) bd = null;
    // tu equipo: el seis que eligió el entrenador (lineup6) y 5 suplentes; atributos por media + forma (+ química); tú, con fatiga y química
    var stOf = function (x, pos, chem) { var st = genSt(clamp(x.ovr + (x.form | 0), 1, 99), pos, r); if (chem) CHEM_KEYS.forEach(function (kk) { st[kk] = clampI(st[kk] + ch, 1, 99); }); return st; };
    var a0 = [], nums0 = [], names0 = [], b0 = [], meBench = -1;
    Lu.start.forEach(function (id, i) {
      if (id === 'me') { a0.push(stMe); nums0.push(c.player.num); names0.push(c.player.name); return; }
      var x = sqEntry6(c, q, id); a0.push(stOf(x, R[i], true)); nums0.push(x.num); names0.push(x.name);
    });
    Lu.bench.slice(0, 5).concat(!meOn && Lu.bench.length > 5 && Lu.bench.indexOf('me') >= 5 ? ['me'] : []).forEach(function (id) {
      if (b0.length >= 5) return;
      if (id === 'me') { meBench = b0.length; b0.push({ role: role, st: stMe, num: c.player.num, name: c.player.name, fat: c.fatigue | 0, badges: bd }); return; }
      var x = sqEntry6(c, q, id); b0.push({ role: x.pos, st: stOf(x, x.pos, true), num: x.num, name: x.name, fat: x.fat | 0, badges: null });
    });
    // el rival: su plantilla (squad6) con su seis por medias y 5 suplentes
    var rs = squad6(c, n.rival, c.season, ''), byp = {}, at = n.ovrRival - n.ovrClub, stR = function (x, p) { return stOf(at ? { ovr: x.ovr + at, form: x.form } : x, p, false); };   // (dificultad: attr)
    SQ_POS.forEach(function (p) { byp[p] = rs.filter(function (x) { return x.pos === p; }).sort(function (a, b) { return b.ovr - a.ovr; }); });
    var cnt = {}, a1 = [], nums1 = [], names1 = [], b1 = [];
    R.forEach(function (p) { var i = cnt[p] = (cnt[p] || 0); cnt[p]++; var x = byp[p][i]; a1.push(stR(x, p)); nums1.push(x.num); names1.push(x.name); });
    ['S', 'OPP', 'OH', 'MB'].forEach(function (p) { byp[p].slice(SLOTS6[p], SLOTS6[p] + (p === 'OH' || p === 'MB' ? 2 : 1)).forEach(function (x) { b1.push({ role: p, st: stR(x, p), num: x.num, name: x.name, fat: 0, badges: null }); }); });
    b1 = b1.slice(0, 4).concat(b1.slice(4).sort(function (a, b) { return ovrOf(b.st) - ovrOf(a.st); }).slice(0, 1));
    var L = lg6(c, n.me.lid), k = n.me.kit, rk = n.rival.kit;
    // acta del partido (js/acta.js): capitán de cada club (el de más media de la plantilla que no sea líbero; si hoy no está convocado,
    // el de más media de los convocados) y nombre de su líbero
    var meX = sqEntry6(c, q, 'me'), libOf = function (list, me) { if (me && me.pos === 'L') return me.name; for (var li = 0; li < list.length; li++) if (list[li].pos === 'L') return list[li].name; return ''; };
    var acta = { capt: [capt6(q.list.concat(meX ? [meX] : []), nums0.concat(b0.map(function (x) { return x.num; }))), capt6(rs, nums1.concat(b1.map(function (x) { return x.num; })))],
      lib: [libOf(q.list, meX), libOf(rs, null)] };
    var out = {
      format: '6v6', venue: 'hall', ctrlRole: role, ctrlIdx: idx, ctrl: 'one',
      attrs: [a0, a1], badges: bd ? [R.map(function (x, i) { return i === idx ? bd : null; }), null] : null, nums: [nums0, nums1],
      // titularidad y cambios (contrato §I.1): main.js lo pasa tal cual a Sim.createGame
      meOn: meOn, meSlot: idx, meBench: meOn ? -1 : meBench, names: [names0, names1], bench: [b0, b1],
      coach: [{ auto: true, iq: iq6(difficultyFor6(n.me)), me: meRules6(c, Lu) }, { auto: true, iq: iq6(n.diff) }],
      points: c.points, difficulty: n.diff, rookie: !!n.soft, diffName: n.diffName, cdiff: n.cdiff, chem: ch, fatigue: fm,
      ref: copy(REF[ref6(L.strength)]),
      kit: { kitShirt: k.shirt, kitAccent: k.accent, kitShorts: k.shorts, kitPattern: k.pattern, kitLibero: k.libero },
      rivalKit: { kitShirt: rk.shirt, kitAccent: rk.accent, kitShorts: rk.shorts, kitPattern: rk.pattern, kitLibero: rk.libero },
      career: { mode: 'hall', season: c.season, phase: c.phase, week: n.week, round: n.round, label: n.label, me: n.me.short, rival: n.rival.short, venue: 'hall',
        meName: n.me.name, rivalName: n.rival.name, player: c.player.name, num: c.player.num, pos: role, posName: POS6[role].name, mate: '', mateNum: 0,
        meOn: meOn, status: meOn ? 'start' : 'sub', cdiff: n.cdiff, atHome: !!n.atHome, acta: acta }
    };
    life(c, 'setup', out);   // material de la tienda y molestias (en tu hueco, ctrlIdx) y reto de la jornada (career-life.js)
    return out;
  }
  function simMatch6(c, a, b, sd) {
    var ka = club(c, a), kb = club(c, b), r = rng(sd), q = quickSim(ka.ovr + (r() - 0.5) * 4, kb.ovr + (r() - 0.5) * 4, r, c.points);
    return { a: a, b: b, s: q.sets, sc: q.setScores };
  }
  /** Una jornada w de una liga (los partidos que falten). Devuelve los de la liga (solo se guardan los de la tuya). */
  function playLeagueWeek6(c, L, w) {
    var wk = sched6(c, L.id)[w], out = []; if (!wk) return out;
    var mine = !!(c.myRes && c.myRes.lid === L.id), recs = mine ? (c.myRes.w[w] = c.myRes.w[w] || []) : null;
    wk.forEach(function (m, i) {
      var rec = recs ? recs[i] : null;
      if (!rec) { rec = simMatch6(c, m[0], m[1], hash(c.seed, 'm6', c.season, L.id, w, i)); addRes6(c, L.id, rec); if (recs) recs[i] = rec; }
      out.push(rec);
    });
    return out;
  }
  function weekAll6(c) { var me = myClub(c), out = []; c.leagues.forEach(function (L) { var r = playLeagueWeek6(c, L, c.week); if (me && L.id === me.lid) out = r; }); return out; }
  /** Jornadas de descanso (liga impar): el resto juega; tú entrenas, cobras y recuperas. */
  function skipBye6(c) {
    var me = myClub(c), g = 0; if (!me) return;
    while (c.phase === 'league' && c.week < weeksOf6(c, me.lid) && !myFixture6(c) && g++ < 4) {
      msg(c, 'club', 'Jornada ' + (c.week + 1) + ': descansas', 'Esta jornada a tu equipo le toca descansar. Entrenas, cobras y recuperas (fatiga −' + BENCH_REST + ').');
      trainWeek(c); pay(c); c.fatigue = clamp((c.fatigue | 0) - BENCH_REST, 0, 100);
      squadWeek6(c, 'bye'); sessClose(c, true);
      weekAll6(c); c.week++;
      if (c.week === midWeek6(c)) midWindow6(c);
    }
  }
  function finishRound6(c) {
    var me = myClub(c), out = [];
    if (c.phase === 'league') {
      out = weekAll6(c);
      c.week++;
      if (c.window === 'mid') { c.offers = []; c.window = ''; }
      if (c.week === midWeek6(c)) midWindow6(c);
      skipBye6(c);
      if (c.phase === 'league' && c.week >= weeksOf6(c, me.lid)) endLeague6(c);
    } else if (c.phase === 'ko') {
      var ko = c.kos[c.koI]; out = koRound6(c, ko); advanceKO6(c);
    }
    return out;
  }
  /** Fin de la liga regular: el resto de ligas acaban su calendario y empiezan las copas (nacional e internacionales de la región). */
  function endLeague6(c) {
    c.leagues.forEach(function (L) { for (var w = c.week, W = weeksOf6(c, L.id); w < W; w++) playLeagueWeek6(c, L, w); });
    if (c.window === 'mid') { c.offers = []; c.window = ''; }
    c.kos = buildKOs6(c); c.koI = 0; c.phase = 'ko';
    var mk = myClub(c), mine = c.kos.filter(function (ko) { return ko.ids.indexOf(mk.id) >= 0; });
    if (mine.length) msg(c, 'club', 'Copas: ' + mine.map(function (ko) { return ko.name; }).join(' y '), 'Acaba la liga regular. ' + mk.name + ' juega ' + mine.map(function (ko) { return 'la ' + ko.name + ' (' + plural(ko.ids.length, 'equipo', 'equipos') + ', eliminatoria a un partido)'; }).join(' y ') + '.');
    advanceKO6(c);
  }
  function pow2(n) { var p = 1; while (p * 2 <= n && p < 8) p *= 2; return p; }
  /** Eliminatoria a un partido: hasta 8 equipos (potencia de 2), cabezas de serie por media; si te has clasificado, entras siempre. */
  function mkKO6(c, kind, name, short, cand, meId) {
    var ids = cand.filter(function (id, i) { return club(c, id) && cand.indexOf(id) === i; }), B = pow2(ids.length);
    if (ids.length < 2) return null;
    ids.sort(function (a, b) { return club(c, b).ovr - club(c, a).ovr || a - b; });
    var take = ids.slice(0, B);
    if (ids.indexOf(meId) >= 0 && take.indexOf(meId) < 0) take[B - 1] = meId;
    var ps = []; for (var i = 0; i < B / 2; i++) ps.push([take[i], take[B - 1 - i]]);
    return { kind: kind, name: name, short: short, ids: take, rounds: [ps], res: [], round: 0, champion: -1 };
  }
  /** Copas internacionales que puede jugar un club del país cc: las de su región (y su zona), la grande (rank 1: 1º y 2º de cada 1ª)
   *  y la segunda (rank 2: 3º y 4º). Guardados de antes sin rank: por orden. */
  function intlFor6(c, cc) {
    var L1 = lg6(c, cc + '1') || lg6(c, cc + '2'), reg = L1 ? L1.region : '', out = [];
    (c.intl && c.intl[reg] || []).forEach(function (cp, i) {
      var rk = cp.rank | 0 || i + 1;
      if (rk > 2 || (Array.isArray(cp.zone) && cp.zone.indexOf(cc) < 0) || out.some(function (y) { return y.rank === rk; })) return;
      out.push({ name: cp.name, short: cp.short, rank: rk, zone: Array.isArray(cp.zone) ? cp.zone : null });
    });
    return out;
  }
  function buildKOs6(c) {
    var me = myClub(c), cc = me.cc, out = [], d1 = lg6(c, cc + '1') ? table6(c, cc + '1') : [], d2 = lg6(c, cc + '2') ? table6(c, cc + '2') : [];
    var cand = (d2.length ? d1.slice(0, 6).concat(d2.slice(0, 2)) : d1.slice(0, 8)).map(function (r) { return r.id; });
    var cn = c.cups && c.cups[cc] || { name: 'Copa Nacional', short: 'COP' };
    var cup = mkKO6(c, 'cup', cn.name, cn.short || 'COP', cand, me.id); if (cup) out.push(cup);
    var reg = lg6(c, me.lid).region, comps = intlFor6(c, me.cc);
    comps.forEach(function (cp) {
      var q = [], i = cp.rank - 1, firsts = c.leagues.filter(function (L) { return L.region === reg && L.lvl === 1 && (!cp.zone || cp.zone.indexOf(L.cc) >= 0); });
      firsts.forEach(function (L) { table6(c, L.id).slice(i * 2, i * 2 + 2).forEach(function (r) { q.push(r.id); }); });
      var ko = mkKO6(c, 'intl', cp.name, cp.short, q, me.id); if (ko) out.push(ko);
    });
    return out;
  }
  /** Cierra la ronda actual de la copa en curso (simula lo que falte) y prepara la siguiente o el campeón. */
  function koRound6(c, ko) {
    var rd = ko.round, ps = ko.rounds[rd], ar = ko.res[rd] = ko.res[rd] || [], out = [];
    ps.forEach(function (m, j) { if (!ar[j]) ar[j] = simMatch6(c, m[0], m[1], hash(c.seed, 'ko6', c.season, c.koI, rd, j)); out.push(ar[j]); });
    if (ps.length === 1) { ko.champion = winnerOf(ar[0]); c.koI++; }
    else { var w = ar.map(winnerOf), nx = []; for (var i = 0; i < w.length; i += 2) nx.push([w[i], w[i + 1]]); ko.rounds.push(nx); ko.round++; }
    return out;
  }
  /** Juega solas las rondas sin ti hasta tu próximo partido de copa o el fin de temporada. */
  function advanceKO6(c) {
    for (var g = 0; c.phase === 'ko' && g < 40; g++) {
      var ko = c.kos[c.koI];
      if (!ko) { endSeason6(c); return; }
      if (myFixture6(c)) return;
      koRound6(c, ko);
    }
  }
  function reachOf6(ko, id) {
    if (ko.champion === id) return 'Campeón';
    var last = -1; ko.rounds.forEach(function (rd, i) { if (rd.some(function (m) { return m[0] === id || m[1] === id; })) last = i; });
    return last < 0 ? '' : roundName6(ko.rounds[last].length);
  }
  function nextOvrs6(c, moves) {
    var r = rng(hash(c.seed, 'ovr6', c.season)), mv = {}, out = {};
    (moves || []).forEach(function (m) { var k = club(c, m.id); if (k) mv[m.id] = lg6(c, m.to).lvl < lg6(c, k.lid).lvl ? 2 : -2; });
    c.clubs.forEach(function (k) { out[k.id] = clampI(k.ovr + (k.base - k.ovr) * 0.25 + (r() - 0.5) * 4 + (mv[k.id] || 0), 20, 99); });
    return out;
  }
  function nextLid6(c, k) { var mv = (c.pendingMoves || []).filter(function (m) { return m.id === k.id; })[0]; return mv ? mv.to : k.lid; }
  function endSeason6(c) {
    var me = myClub(c), L = lg6(c, me.lid), t = table6(c, me.lid), pos = posOf6(c, me.id), n = t.length;
    var objOk = pos <= c.objective.pos;
    var D = cd(c), sd = seasonDiff(c);   // dificultad: premio/castigo del objetivo y sello de la temporada (la más fácil usada)
    c.coach = clamp(c.coach + (objOk ? D.objWin : D.objLose), 0, 100); coachFloor(c);
    var champ = t[0].id === me.id, cups = c.kos.map(function (ko) { return { kind: ko.kind, name: ko.name, short: ko.short, champion: ko.champion, mine: ko.ids.indexOf(me.id) >= 0, reach: reachOf6(ko, me.id) }; });
    // ascensos y descensos dentro de cada país con dos divisiones (2 si las ligas son de 6 y 4 clubes o más; si no, 1)
    var moves = [];
    c.leagues.forEach(function (L1) {
      if (L1.lvl !== 1) return; var L2 = lg6(c, L1.cc + '2'); if (!L2) return;
      var t1 = table6(c, L1.id), t2 = table6(c, L2.id), k = t1.length >= 6 && t2.length >= 4 ? 2 : 1;
      t2.slice(0, k).forEach(function (r) { moves.push({ id: r.id, to: L1.id }); });
      t1.slice(-k).forEach(function (r) { moves.push({ id: r.id, to: L2.id }); });
    });
    var myMove = 0; moves.forEach(function (m) { if (m.id === me.id) myMove = lg6(c, m.to).lvl < L.lvl ? 1 : -1; });
    if (champ) c.trophies.push({ season: c.season, kind: 'liga', name: L.name, club: me.name, d: sd.d });
    cups.forEach(function (x) { if (x.champion === me.id) c.trophies.push({ season: c.season, kind: x.kind === 'cup' ? 'copa' : 'intl', name: x.name, club: me.name, d: sd.d }); });
    if (myMove > 0) c.trophies.push({ season: c.season, kind: 'ascenso', name: 'Ascenso a la ' + lg6(c, L.cc + '1').name, club: me.name, d: sd.d });
    var an = avgNota(c), cupR = cups.filter(function (x) { return x.kind === 'cup' && x.mine; })[0], intR = cups.filter(function (x) { return x.kind === 'intl' && x.mine; })[0];
    c.history.push({ season: c.season, club: me.id, clubName: me.name, lid: me.lid, lgShort: L.short, country: L.country, pos: pos, pts: t[pos - 1].pts, objective: c.objective.text, objOk: objOk,
      cup: cupR ? cupR.reach : '—', intl: intR ? intR.name + ': ' + intR.reach : '', nota: an, played: c.stats.played, won: c.stats.won, ppts: c.stats.pts, move: myMove, ovr: playerOvr(c), lvlP: c.player.lvl, d: sd.d, dm: sd.dm });
    c.review = { season: c.season, pos: pos, n: n, lid: me.lid, objective: c.objective.text, objOk: objOk, champion: champ, cups: cups, move: myMove, nota: an, coach: c.coach, moves: moves, d: sd.d, dm: sd.dm };
    c.pendingMoves = moves; c.pendingOvr = nextOvrs6(c, moves);
    c.phase = 'off';
    c.offers = genOffers6(c, false); c.window = 'end';
    var ct = c.contract;
    if (ct && (ct.left | 0) <= 1) {
      var rl = c.coach >= 70 ? 2 : c.coach >= 45 ? 1 : 0;
      c.review.renew = { role: ROLE_LV[rl], salary: salary6(c, me, rl, nextLid6(c, me)), years: c.coach >= 45 ? 2 : 1 };
    }
    var cw = cups.filter(function (x) { return x.champion === me.id; }).map(function (x) { return x.name; });
    msg(c, 'club', 'Fin de la temporada ' + c.season + ': ' + ordn(pos), 'Objetivo ' + (objOk ? 'cumplido' : 'no cumplido') + ' (' + c.objective.text.toLowerCase() + ').' + (champ ? ' ¡Campeones de la ' + L.name + '!' : '') +
      (cw.length ? ' ¡Campeones de la ' + cw.join(' y de la ') + '!' : '') + (myMove > 0 ? ' ¡El club asciende!' : myMove < 0 ? ' El club desciende.' : '') + ' ' +
      (c.offers.length ? 'Tienes ' + plural(c.offers.length, 'oferta', 'ofertas') + ' de otros clubes' + (c.offers.some(function (x) { return x.foreign; }) ? ', también del extranjero' : '') + '.' : 'No han llegado ofertas de otros clubes.') +
      (c.review.renew ? ' Se te acaba el contrato: el club te ofrece renovar como ' + c.review.renew.role.toLowerCase() + '.' : ''));
    life(c, 'season');   // premios, títulos a fama, objetivo del patrocinador y logros
    c.trophies.forEach(function (t) { if (t && t.season === c.season && !t.d) t.d = sd.d; });   // premios de career-life: su sello
  }
  function applyMoves6(c) {
    var ov = c.pendingOvr || nextOvrs6(c, c.pendingMoves);
    (c.pendingMoves || []).forEach(function (m) { var k = club(c, m.id); if (k && lg6(c, m.to)) k.lid = m.to; });
    c.clubs.forEach(function (k) { if (ov[k.id] != null) k.ovr = ov[k.id]; });
    c.pendingMoves = null; c.pendingOvr = null;
  }
  function newSeason6(c, offer, years) {
    applyMoves6(c);
    var moved = offer && offer.club !== c.myClub, renew = c.review && c.review.renew;
    if (moved) joinClub6(c, offer, years);
    else {
      var k = myClub(c), ct = c.contract || { club: k.id, years: 1, left: 1, role: ROLE_LV[1], salary: salary6(c, k, 1), since: c.season };
      ct.left = Math.max(0, (ct.left | 0) - 1);
      if (ct.left <= 0) {
        var y = clampI(years != null ? years : renew ? renew.years : 1, 1, 3);
        c.contract = { club: k.id, years: y, left: y, role: renew ? renew.role : ct.role, salary: renew ? renew.salary : ct.salary, since: c.season + 1 };
        msg(c, 'club', 'Contrato renovado', 'Has renovado con ' + k.name + ' por ' + plural(y, 'temporada', 'temporadas') + ' como ' + c.contract.role.toLowerCase() + '.');
      } else c.contract = ct;
      delete c.coachD;   // la confianza viene de la temporada pasada
      c.chem = Math.round((c.chem | 0) * 0.6);   // verano: parte del equipo cambia, algo de química se pierde
    }
    if (!moved) { var tsv = sessSane(c); tsv.imp = round1(tsv.imp * 0.5); }   // verano: la impresión en los entrenos se queda en la mitad
    c.season++; c.week = 0; c.phase = 'league'; c.kos = []; c.koI = 0; c.notes = []; c.stats = newSeasonStats6(); c.offers = []; c.window = ''; c.review = null; c.dUse = dZeros();
    if (!moved) sqSummer6(c);   // la plantilla sigue (±2, forma y fatiga a 0); si fichaste, joinClub6 ya la hizo nueva
    c.tab = {}; c.myRes = { lid: myClub(c).lid, w: [] }; c.scouts = {};
    c.player.age = (c.player.age | 0) + 1;
    var fat0 = c.fatigue | 0; c.fatigue = 0;
    if (fat0 > FAT_FREE) msg(c, 'train', 'Vacaciones', 'El verano te ha sentado bien: llegas a la pretemporada sin fatiga (tenías ' + fat0 + ').');
    if (c.listed) { c.listed = false; msg(c, 'agent', 'Traspaso', 'Tu petición de traspaso caduca con la temporada. Si quieres salir, vuelve a pedirlo.'); }
    c.objective = makeObjective6(c, myClub(c));
    if (moved) welcome6(c);
    else msg(c, 'obj', 'Objetivo de la temporada ' + c.season, 'El club quiere: ' + c.objective.text.toLowerCase() + '.');
    c.last = null;
    life(c, 'newSeason');   // edad, patrocinios del verano y rival
    skipBye6(c);
  }

  // ---------------------------------------------------------------- ojeadores y ofertas (también del extranjero)
  /** Tras un buen partido (nota ≥ 7,3), a veces viene a verte un ojeador de un club de una liga mejor (también de fuera): ese club
   *  tendrá +SCOUT_BONUS de interés en las ofertas de la temporada (y a mitad de temporada le basta tu nota de 7). */
  var SCOUT_BONUS = 3;
  function scoutCheck6(c, nota) {
    if (!(nota >= 7.3) || Object.keys(c.scouts || {}).length >= 4) return null;
    var me = myClub(c), L = lg6(c, me.lid), r = rng(hash(c.seed, 'scout', c.season, c.notes.length)), sc = offerScore(c);
    if (r() > 0.4) return null;
    var cand = c.clubs.filter(function (k) { var kl = lg6(c, k.lid); return k.id !== me.id && !c.scouts[k.id] && kl.strength > L.strength && k.ovr > me.ovr + 2 && k.ovr <= sc + 10; });
    if (!cand.length) return null;
    var k = pick(r, cand), kl = lg6(c, k.lid);
    c.scouts[k.id] = c.season;
    msg(c, 'agent', 'Ojeadores en la grada', 'Un ojeador de ' + k.name + ' (' + kl.name + ', ' + kl.country + ') ha venido a verte. Si sigues así, puede llegar una oferta.');
    return k.id;
  }
  /** Ofertas de mitad (mid) o de fin de temporada: clubes mejores que el tuyo de ligas como la tuya o más fuertes, también de otros
   *  países. Las ligas fuertes piden más nivel (umbral = media del club − 5, +2 si es de fuera, + (fuerza − 70) / 5 en las de élite). */
  function genOffers6(c, mid) {
    var me = myClub(c), sc = offerScore(c), r = rng(hash(c.seed, 'off6', c.season, mid ? 'mid' : 'end')), an = avgNota(c) || 0, cand = [];
    if (mid && an < midNota(c)) return [];   // (dificultad: midNota suma su desvío; el umbral de interés, offer)
    var po = !mid && c.pendingOvr ? c.pendingOvr : null, ovr = function (k) { return po && po[k.id] != null ? po[k.id] : k.ovr; };
    var lidOf = function (k) { return mid ? k.lid : nextLid6(c, k); }, myL = lg6(c, lidOf(me)), myO = ovr(me), tc = null;
    c.clubs.forEach(function (k) {
      if (k.id === me.id) return;
      var L = lg6(c, lidOf(k)), o = ovr(k), foreign = L.cc !== me.cc, sct = !!(c.scouts && c.scouts[k.id]);
      if (o <= myO + 1 || L.strength < myL.strength - 6) return;
      if (mid && (foreign || L.strength > myL.strength + 2) && an < 7.5 && !sct) return;
      var thr = o - 5 + (foreign ? 2 : 0) + Math.max(0, (L.strength - 70) / 5) + cd(c).offer;
      var it = sc - thr + (r() - 0.5) * 8 - (mid ? 3 : 0) + (sct ? SCOUT_BONUS : 0);
      var yy = 1 + Math.floor(r() * 3);   // (se tira siempre: así la plantilla de un club no cambia el azar de los demás)
      if (it + FIT_START > 0) {
        var d = depth6(c, { id: k.id, ovr: o }, L.id, mid ? c.season : c.season + 1, 1, { merit: true });   // ¿jugarías? (la plantilla de la temporada en que llegas)
        it += fit6(d);
        if (it > 0) {
          var rl = capRole6(it > ROLE_NEED[2] ? 2 : it > ROLE_NEED[1] ? 1 : 0, d), q = qOf6(c, k, L.id);
          var of = { club: k.id, lid: L.id, cc: L.cc, ovr: o, q: q, interest: round1(it), role: ROLE_LV[rl], years: yy, salary: salary6(c, k, rl, L.id), foreign: foreign, scout: sct, dm: d, dSeason: mid ? c.season : c.season + 1 };
          offerDepth6(c, of); cand.push(of);
        }
        // (prueba, 17-nov-2026: el club mejor —liga más fuerte o +3 de media— que te quiere casi lo justo te invita a prueba)
        else if (it > -TRIAL_GAP && (L.strength > myL.strength || o > myO + 3) && (!tc || it > tc.it)) tc = { k: k, L: L, o: o, it: it, d: d, foreign: foreign, sct: sct };
      }
    });
    // de los clubes que te quieren, los 3 más atractivos: pesa sobre todo la liga y el club (con los datos reales hay 28 países y muchos
    // clubes modestos «mejores que el tuyo»: ordenar solo por interés llenaba la bandeja de un crack con clubes de Irán o Eslovenia).
    // El interés cuenta hasta 5 (más allá ya no cambia nada) y decide el rol prometido: la élite que apenas te quiere ofrece rotación.
    var appeal = function (x) { return Math.min(5, x.interest) + 0.5 * (lg6(c, x.lid).strength - myL.strength) + 0.25 * (x.ovr - myO); };
    cand.sort(function (a, b) { return appeal(b) - appeal(a); });
    cand = cand.slice(0, 3);
    if (tc) { var tof = { club: tc.k.id, lid: tc.L.id, cc: tc.L.cc, ovr: tc.o, q: qOf6(c, tc.k, tc.L.id), interest: round1(tc.it), role: ROLE_LV[0], years: 1, salary: salary6(c, tc.k, 0, tc.L.id),
      foreign: tc.foreign, scout: tc.sct, dm: tc.d, dSeason: mid ? c.season : c.season + 1, trial: true, chance: trialChanceIt(tc.it) }; offerDepth6(c, tof); cand.push(tof); }   // invitación a prueba
    cand.forEach(function (x) { var k = club(c, x.club), o0 = k.ovr; k.ovr = x.ovr; x.objective = objectiveFor6(c, k, x.lid).text; k.ovr = o0; });
    cand.sort(function (a, b) { return (a.trial ? 1 : 0) - (b.trial ? 1 : 0) || lg6(c, b.lid).strength - lg6(c, a.lid).strength || b.ovr - a.ovr; });   // (la prueba, la última)
    return cand;
  }
  function midWindow6(c) {
    var o = genOffers6(c, true);
    c.offers = o; c.window = o.length ? 'mid' : '';
    if (o.length) msg(c, 'offer', 'Ventana de fichajes: ' + plural(o.length, 'oferta', 'ofertas'), 'Tu agente ha recibido ' + plural(o.length, 'oferta', 'ofertas') + ' a mitad de temporada' + (o.some(function (x) { return x.foreign; }) ? ', también del extranjero' : '') + '. Caducan al jugar o simular el siguiente partido. Míralas en Club › Ofertas.');
    var pos = posOf6(c, c.myClub), okp = pos <= c.objective.pos;
    msg(c, 'obj', 'Mitad de temporada: ' + ordn(pos), okp ? 'Vamos ' + ordn(pos) + ' y el objetivo (' + c.objective.text.toLowerCase() + ') está a nuestro alcance. No bajemos el ritmo.'
      : 'Vamos ' + ordn(pos) + ' y así no llegamos al objetivo (' + c.objective.text.toLowerCase() + '). Necesito más de ti en la segunda vuelta.');
  }

  // ---------------------------------------------------------------- cerrar un partido tuyo (jugado, simulado o en el banquillo)
  function recordMine6(c, f, sets, setScores) {
    var me = myClub(c), mine = f.home === me.id, s = mine ? sets : [sets[1], sets[0]], sc = setScores.map(function (x) { return mine ? x.slice() : [x[1], x[0]]; });
    var rec = { a: f.home, b: f.away, s: s, sc: sc, mine: 1 };
    if (f.kind === 'league') { if (!c.myRes || c.myRes.lid !== me.lid) c.myRes = { lid: me.lid, w: [] }; (c.myRes.w[f.week] = c.myRes.w[f.week] || [])[f.i] = rec; addRes6(c, me.lid, rec); }
    else { var ko = c.kos[f.ko]; (ko.res[f.round] = ko.res[f.round] || [])[f.i] = rec; }
    return rec;
  }
  function labelOf6(c, f) { if (f.kind === 'league') return 'Jornada ' + (f.week + 1); var ko = c.kos[f.ko]; return ko.name + ' · ' + roundName6(ko.rounds[f.round].length); }
  /** Cierra un partido tuyo de pista (jugado o simulado). extra.part = minutos en pista (titularidad): { status: 'start'|'sub',
   *  started, entered, pulled, pullWhy, meR, rallies, share, sets }. Sin nota (me.nota null: no entraste o jugaste menos de
   *  NOTA_MIN_R puntos) → sum.bench, sin nota en c.notes y experiencia de banquillo (BENCH_XP). */
  function closeMine6(c, f, res, me, sim, extra) {
    var win = res.sets[0] > res.sets[1], mk = myClub(c), L = lg6(c, mk.lid), rival = club(c, f.home === c.myClub ? f.away : f.home), nota = me.nota;
    var part = extra && extra.part || { status: 'start', started: true, entered: 0, pulled: 0, pullWhy: '', meR: 0, rallies: 0, share: 1, sets: [] };
    var has = nota != null, played = extra && extra.part ? (part.meR | 0) > 0 : true, share = clamp(+part.share || 0, 0, 1), sub = part.status !== 'start', rl = roleIdx(c);
    var mpts = (me.kills || 0) + (me.aces || 0) + (me.blocks || 0), D = cd(c);
    if (!c.dUse || typeof c.dUse !== 'object') c.dUse = dZeros();
    c.dUse[diffOf(c)] = (c.dUse[diffOf(c)] | 0) + 1;   // dificultad: el partido cuenta en su nivel (antes de finishRound6)
    // experiencia: con nota, la de siempre × (0,35 + 0,65 × parte jugada); sin nota, la del banquillo
    var xp = has ? Math.round((40 + 22 * nota + (win ? 40 : 0) + 6 * Math.min(mpts, 10)) * xpMul6(L) * (sim ? 0.5 : 1) * (0.35 + 0.65 * share) * D.xp * XP_K6)
      : Math.round(BENCH_XP * xpMul6(L) * (sim ? 0.5 : 1) * D.xp * XP_K6);   // (× xp de la dificultad)
    var lv = addXP(c.player, xp), ct0 = coachText(c.coach);
    if (!played) c.player.matches = Math.max(0, (c.player.matches | 0) - 1);   // (addXP cuenta un partido: sin entrar no lo es)
    // confianza: la nota y el resultado pesan por la parte jugada; entrenar siendo suplente (+1), un buen cambio (+2), que te saquen (−2)
    var dc = has ? (nota - D.coachPivot) * 2.5 * share + (win ? 1 : -1) * share : 0, impact = false, pulledBad = false;
    if (sub && c.train !== 'rest') dc += TRAIN_COACH;
    if (sub && part.entered && has && nota >= 7) { dc += IMPACT_COACH; impact = true; }
    if (part.pulled && rl < 2 && /^(meOut|bad|sim)$/.test(part.pullWhy || '')) { dc -= PULL_COACH; pulledBad = true; }
    c.coach = clamp(Math.round(c.coach + dc), 0, 100);
    coachFloor(c); pay(c);
    if (coachText(c.coach) !== ct0) msg(c, 'coach', 'El entrenador: «' + coachText(c.coach) + '»', COACH_LINE[coachText(c.coach)] || '');
    var nt = has ? String(nota).replace('.', ',') : '';
    c.ln6 = has ? { nota: nota, sub: sub ? 1 : 0 } : null;   // la nota de hoy pesa en el seis del próximo partido (lastSel6)
    if (impact && nota >= LAST_SUB) msg(c, 'coach', 'Así se gana el puesto', 'Saliste desde el banquillo y destacaste (nota ' + nt + '). El próximo partido tienes muchas opciones de salir de inicio.');
    else if (impact) msg(c, 'coach', 'Buen cambio', 'Saliste desde el banquillo y cambiaste el partido (nota ' + nt + '). Sigue así y te ganarás el puesto.');
    else if (has && !sub && nota < LAST_BAD && !sim && !pulledBad) msg(c, 'coach', 'Así no', 'Con un ' + nt + ' no me sirves. El próximo partido seguramente empiezas en el banquillo: si sales, aprovecha los puntos que juegues.');
    else if (has && !sub && nota < LAST_MEH && !sim && !pulledBad) msg(c, 'coach', 'Partido flojo', 'Un ' + nt + ' es poco. Te juegas el puesto en el próximo partido.');
    if (pulledBad && (!has || nota < 6)) msg(c, 'coach', 'Te he cambiado', 'Hoy no era tu día y te senté en el ' + ordn(part.pulled) + ' set. La próxima, más concentración.');
    c.chem = clamp((c.chem | 0) + (played ? (sim ? 3 : 5) : 2), 0, 100);
    var au = sessAuto(c);   // entreno automático (antes del entreno semanal)
    var tr = trainWeek(c);
    if (!played) c.fatigue = clamp((c.fatigue | 0) - BENCH_REST, 0, 100);   // sin jugar, descansas
    [c.stats, c.career].forEach(function (x) {
      if (played) {
        x.played++; if (win) x.won++; if (sim) x.sim++;
        x.pts += mpts; x.kills += me.kills || 0; x.aces += me.aces || 0; x.blocks += me.blocks || 0; x.assists += me.assists || 0; x.digs += me.digs || 0; x.errors += me.errors || 0;
      } else x.bench = (x.bench | 0) + 1;
      if (!sub && played) x.starts = (x.starts | 0) + 1;
      if (sub && part.entered) x.subIn = (x.subIn | 0) + 1;
      x.mr = (x.mr | 0) + (part.meR | 0); x.rr = (x.rr | 0) + (part.rallies | 0);
    });
    if (has) c.notes.push({ nota: nota, win: win ? 1 : 0, sim: sim ? 1 : 0, kind: f.kind, wk: f.kind === 'league' ? f.week : f.round, rival: rival.id, s: res.sets.slice() });
    var scout = has ? scoutCheck6(c, nota) : null;
    var label = labelOf6(c, f), phase0 = c.phase, season0 = c.season;
    roleWeek6(c, f); squadWeek6(c, !sub ? 'start' : part.entered ? 'in' : 'none');
    sessClose(c);   // sesiones de entrenamiento (antes de elegir el seis de la siguiente: nextLine6)
    recordMine6(c, f, res.sets, res.setScores);
    var round = finishRound6(c);
    var sum = { mode: 'hall', season: season0, phase: phase0, label: label, rival: rival.id, rivalName: rival.name, win: win, sets: res.sets.slice(), setScores: res.setScores.map(function (x) { return x.slice(); }),
      sim: !!sim, nota: has ? nota : null, bench: !has, me: me, xp: xp, lvlUp: lv.lvlUp, lvl: lv.lvl, ptsGained: lv.pts, badges: extra && extra.badges || [], coach: c.coach, train: tr, auto: au, chem: c.chem, scout: scout,
      part: { status: sub ? 'sub' : 'start', started: !sub, entered: part.entered | 0, pulled: part.pulled | 0, meR: part.meR | 0, rallies: part.rallies | 0, share: Math.round(share * 100) / 100, sets: (part.sets || []).slice() },
      round: f.kind === 'league' ? round.map(function (m) { return { a: m.a, b: m.b, s: m.s }; }) : [], offers: c.window === 'mid' ? c.offers.length : 0, review: phase0 !== c.phase && c.phase === 'off' };
    if (has && extra && extra.rt) sum.rt = extra.rt;   // nota en directo: { nota, best, worst } (solo en c.last, no en c.notes)
    if (extra && extra.amb) sum.amb = extra.amb;   // ambiente: tarjetas, protestas, calor (career-life / career-world lo leen)
    life(c, 'match', sum, f);   // reto, fama, patrocinio, servicios, rival, decisión y logros (sum.life)
    c.last = sum;
    nextLine6(c);
    save6(c);
    return sum;
  }
  /** Tras cerrar una jornada: el entrenador ya elige el seis de la siguiente (y avisa si cambia tu estado). */
  function nextLine6(c) { if (c.phase !== 'off' && c.phase !== 'pick' && myFixture6(c)) lineup6(c); }
  /** Rotación con STARTS_PROMOTE jornadas de liga seguidas de inicio → titular (y sueldo de titular). Sustituye en la pista a PROMOTE_AT. */
  function promoteCheck6(c) {
    var q = c.sq6; if (!c.contract || roleIdx(c) !== 0 || !q || (q.run | 0) < STARTS_PROMOTE) return;
    var k = myClub(c), s = Math.max(c.contract.salary | 0, salary6(c, k, 1));
    c.contract.role = ROLE_LV[1]; c.contract.salary = s; q.run = 0;
    msg(c, 'coach', 'Te has ganado la titularidad', 'Ya no eres de la rotación: desde hoy eres titular, y el club te sube el sueldo a ' + s + ' € al mes.');
  }
  /** Insignias de un partido sin contadores (simulado, o tu puesto fuera de los huecos 0-1 de badges.js): partidos y victorias. */
  function simBadges6(c, win) {
    var out = [], Bd = B(); if (!(Bd && Bd.levelFor && Bd.LIST)) return out;
    var a = c.player; a.bp = a.bp || {}; a.bd = a.bd || {}; a.beq = a.beq || [];
    a.bp.motor = (a.bp.motor | 0) + 1; if (win) a.bp.lider = (a.bp.lider | 0) + 1;
    ['motor', 'lider'].forEach(function (id) {
      var prev = (a.bd[id] | 0), lv = Bd.levelFor(id, a.bp[id] | 0);
      if (lv > prev) { a.bd[id] = lv; var eq = prev === 0 && Bd.equip ? Bd.equip(a, id) : a.beq.indexOf(id) >= 0; out.push({ slot: 0, num: a.num, id: id, name: Bd.BY[id].name, lvl: lv, prev: prev, tier: Bd.TIERS[lv], eq: eq }); }
    });
    return out;
  }
  function matchDone6(r, stats, g) {
    var c = load6(); if (!c || !r || !r.sets) return null;
    var f = myFixture6(c); if (!f) return null;
    var m = M && (!g || M.g === g) ? M : newM(g), me = stats || m.p[0];
    var res = { sets: [r.sets[0] | 0, r.sets[1] | 0], setScores: (r.setScores || []).map(function (x) { return [x[0] | 0, x[1] | 0]; }) }, win = res.sets[0] > res.sets[1];
    var all = res.setScores.reduce(function (s, x) { return s + x[0] + x[1]; }, 0);
    // puntos jugados (contrato §I.3): g.meR de la sim; si no, los contados con los eventos; un partido sin cambios (ni eventos ni
    // g.meR, empezando en pista) es el de antes: todos los puntos y nota siempre
    var gm = g && typeof g.meR === 'number', legacy = !m.subEv && !gm && m.started;
    var rallies = (g && g.rallyN) || m.rallies || all;
    var meR = Math.max(0, gm ? g.meR | 0 : legacy ? rallies : m.meR | 0), share = rallies > 0 ? clamp(meR / rallies, 0, 1) : legacy ? 1 : 0;
    var mine = { kills: me.kills | 0, aces: me.aces | 0, blocks: me.blocks | 0, assists: me.assists | 0, digs: me.digs | 0, errors: me.errors | 0, recvP: me.recvP | 0, perfect: me.perfect | 0, good: me.good | 0, poor: me.poor | 0 };
    // nota en directo (js/rating.js) o, sin ella, rating(); con menos de NOTA_MIN_R puntos en pista, sin nota («s. c.»)
    var rt = m === M && m.rt && !stats ? VB.Rating.close(m.rt, res) : null;
    mine.nota = legacy || meR >= NOTA_MIN_SUB ? (rt ? rt.nota : rating(mine, { win: win, sets: res.sets }, legacy ? rallies : meR, RATE6[ctrlRole6(c)] || RATE6.OH)) : null;
    var badges = [];
    try {
      var ix = g && g.teams && g.ctrl ? g.teams[0].indexOf(g.ctrl) : -1;
      if (meR <= 0) badges = [];
      else if (B() && B().endMatch && g && (ix === 0 || ix === 1)) { var ath = [null, null]; ath[ix] = c.player; badges = B().endMatch(g, win, ath) || []; }
      else badges = simBadges6(c, win);
    } catch (e) { badges = []; }
    var part = { status: m.started ? 'start' : 'sub', started: m.started, entered: m.entered | 0, pulled: m.pulled | 0, pullWhy: m.pullWhy || '', meR: meR, rallies: rallies, share: share, sets: m.sets.slice() };
    var asum = ambSum(m, g);
    M = null;
    return closeMine6(c, f, res, mine, false, { badges: badges, part: part, rt: rt && mine.nota != null ? { nota: rt.nota, best: rt.best, worst: rt.worst } : null, amb: asum });
  }
  /** Simular tu partido. De inicio: como siempre (y, con nota < 5,5, alguna vez te cambian). Desde el banquillo: juega el titular de
   *  tu puesto; entras con pIn = 0,3 + 0,06 × (gap + 4) (0,1-0,6; +0,2 si perdéis un set que no es el último y gap ≥ −4): de inicio
   *  en el set siguiente al perdido (lo que queda de partido) o, si no, unos puntos del último set (8-30 %). */
  function simulateNext6(c) {
    c = c || load6(); if (!c) return null;
    var f = myFixture6(c); if (!f) return null;
    var n = next6(c); if (n.bench) return benchNext6(c);
    var Lu = lineup6(c), sub = Lu.stat !== 'start', rl = roleIdx(c), role = ctrlRole6(c);
    var r = rng(sub ? hash(c.seed, 'mine6', c.season, c.phase, f.week, f.round, f.ko, c.notes.length, 'sub') : hash(c.seed, 'mine6', c.season, c.phase, f.week, f.round, f.ko, c.notes.length)), to = teamOvr6(c);
    if (sub && n.rivalIn) to += 0.3 * (n.rivalIn.ovr - playerOvr(c));   // juega el titular de tu puesto
    var q = quickSim(to + (r() - 0.5) * 4, n.ovrSim + (r() - 0.5) * 4, r, c.points), win = q.sets[0] > q.sets[1];   // (dificultad: ovrSim)
    var tot = q.setScores.reduce(function (s, x) { return s + x[0]; }, 0), all = q.setScores.reduce(function (s, x) { return s + x[0] + x[1]; }, 0), ns = q.setScores.length;
    var share = 1, entered = 0, pulled = 0, pullWhy = '', sets = [];
    if (sub) {
      var lostAt = -1; q.setScores.forEach(function (x, i) { if (lostAt < 0 && x[0] < x[1]) lostAt = i; });
      // (calibrado con partidos jugados de verdad, entrenador CPU de ai6: casi siempre entras con el partido roto en el set que lo
      // decide, unos pocos puntos; o de inicio en el set siguiente a uno perdido si el entrenador te tiene cerca, enterLostSet)
      var nearL = Lu.gap >= -4, viaLost = nearL && lostAt >= 0 && lostAt + 1 < ns;
      var pIn = clamp(0.3 + 0.06 * (Lu.gap + 4), 0.1, 0.6) + (viaLost ? 0.2 : 0);
      if (r() < pIn) {
        if (viaLost) {
          entered = lostAt + 2; var rest = 0; for (var si = lostAt + 1; si < ns; si++) rest += q.setScores[si][0] + q.setScores[si][1];
          share = clamp(rest / Math.max(1, all) * (0.75 + 0.25 * r()), 0.1, 0.7);
        } else { entered = ns; share = 0.08 + 0.22 * r(); }
      } else share = 0;
      for (var i = entered; entered && i <= ns; i++) sets.push(i);
    } else for (var j = 1; j <= ns; j++) sets.push(j);
    var sh = (SIM_SHARE6[role] || 0.12) * (0.8 + 0.4 * clamp((playerOvr(c) - n.me.ovr + 10) / 20, 0, 1));
    var me = { kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0, recvP: 0, perfect: 0, good: 0, poor: 0 }, nota = null;
    if (share > 0) {
      var mp = Math.round(tot * sh * share), kills = Math.round(mp * (role === 'MB' ? 0.55 : 0.75)), aces = Math.round(mp * 0.1), blocks = Math.max(0, mp - kills - aces);
      me = { kills: kills, aces: aces, blocks: blocks, assists: Math.round(tot * share * (role === 'S' ? 0.45 : 0.03)), digs: Math.round((2 + r() * (role === 'L' || role === 'OH' ? 8 : 4)) * share), errors: Math.round((1 + r() * 3) * share), recvP: 0, perfect: 0, good: 0, poor: 0 };
      nota = round1(clamp(6.1 + (to - n.ovrSim) * 0.04 + (win ? 0.6 : -0.6) + (r() - 0.5) * 1.6, 3, 9.5));
      // de inicio con un partido flojo, a veces el entrenador te sienta (no siendo indiscutible)
      if (!sub && nota < 5.5 && rl < 2 && r() < 0.3) {
        share = 0.5 + 0.3 * r(); pulled = clamp(Math.floor(share * ns) + 1, 1, ns); pullWhy = 'sim'; sets = sets.slice(0, pulled);
        ['kills', 'aces', 'blocks', 'assists', 'digs', 'errors'].forEach(function (k) { me[k] = Math.round(me[k] * share); });
      }
    }
    var meR = Math.round(all * share);
    if (sub && meR < NOTA_MIN_SUB) nota = null;
    me.nota = nota;
    var part = { status: sub ? 'sub' : 'start', started: !sub, entered: entered, pulled: pulled, pullWhy: pullWhy, meR: meR, rallies: all, share: share, sets: sets };
    return closeMine6(c, f, { sets: q.sets, setScores: q.setScores }, me, true, { badges: meR > 0 ? simBadges6(c, win) : [], part: part });
  }
  /** Fuera de la convocatoria: la jornada se simula sin ti. Sin nota ni experiencia; descansas (−BENCH_REST de fatiga), entrenas y cobras. */
  function benchNext6(c) {
    c = c || load6(); if (!c) return null;
    var f = myFixture6(c), n = f && next6(c); if (!n || !n.bench) return null;
    var r = rng(hash(c.seed, 'bench6', c.season, f.week)), me = myClub(c);
    var q = quickSim(me.ovr - 1 + (r() - 0.5) * 4, n.ovrSim + (r() - 0.5) * 4, r, c.points), win = q.sets[0] > q.sets[1];
    var why = whyText6(c), all = q.setScores.reduce(function (s, x) { return s + x[0] + x[1]; }, 0);
    c.benchWk = wkKey6(c); pay(c);
    if (!c.dUse || typeof c.dUse !== 'object') c.dUse = dZeros();
    c.dUse[diffOf(c)] = (c.dUse[diffOf(c)] | 0) + 1;   // la jornada sin ti también cuenta en su nivel
    var au = sessAuto(c), tr = trainWeek(c);
    c.fatigue = clamp((c.fatigue | 0) - BENCH_REST, 0, 100);
    if (c.train !== 'rest') c.coach = clamp(c.coach + TRAIN_COACH, 0, 100);   // entrenar bien también cuenta
    c.stats.bench = (c.stats.bench | 0) + 1; c.career.bench = (c.career.bench | 0) + 1;
    var rival = club(c, f.home === me.id ? f.away : f.home), phase0 = c.phase, season0 = c.season, label = labelOf6(c, f);
    roleWeek6(c, f); squadWeek6(c, 'out');
    sessClose(c);
    recordMine6(c, f, q.sets, q.setScores);
    var round = finishRound6(c);
    var sum = { mode: 'hall', season: season0, phase: phase0, label: label, rival: rival.id, rivalName: rival.name, win: win, sets: q.sets.slice(), setScores: q.setScores.map(function (x) { return x.slice(); }),
      sim: true, bench: true, why: why, sub: '', nota: null, me: { kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0 }, xp: 0, lvlUp: 0, lvl: c.player.lvl, ptsGained: 0, badges: [],
      part: { status: 'out', started: false, entered: 0, pulled: 0, meR: 0, rallies: all, share: 0, sets: [] },
      coach: c.coach, train: tr, auto: au, chem: c.chem | 0, round: round.map(function (m) { return { a: m.a, b: m.b, s: m.s }; }), offers: c.window === 'mid' ? c.offers.length : 0, review: phase0 !== c.phase && c.phase === 'off' };
    life(c, 'match', sum, f);   // fuera de la convocatoria: patrocinio y servicios (sin reto)
    c.last = sum; nextLine6(c); save6(c);
    return sum;
  }

  // ---------------------------------------------------------------- acciones de gestión (pista)
  function acceptOffer6(i, years) {
    var c = load6(); if (!c || !c.offers || !c.offers[i]) return false;
    var o = c.offers[i];
    // invitación a prueba de mitad o fin de temporada (17-nov-2026): aceptarla sin jugarla es simularla
    if (c.phase !== 'pick' && o.trial) { i = trialStaleFix(c, i); if (i < 0 || !c.offers[i]) return false; var tm = trialSimOn(c, i, 1); return !!(tm && tm.pass); }
    if (c.phase === 'pick') {
      i = trialStaleFix(c, i); o = c.offers[i]; if (!o) return false;   // (una prueba dejada a medias se gasta antes)
      if (o.trial) { var ts = trialSimOn(c, i, years); return !!(ts && ts.pass); }   // prueba: aceptarla sin jugarla es simularla (trialSim)
      joinClub6(c, o, years); save6(c); return true;
    }
    o.early = earlyExit(c);
    if (o.early) msg(c, 'agent', 'Salida con contrato', club(c, c.myClub).name + ' no quería dejarte ir: aún te quedaban ' + plural((c.contract.left | 0) - (c.phase === 'off' ? 1 : 0), 'temporada', 'temporadas') + ' de contrato. Llegas a ' + club(c, o.club).name + ' con algo menos de confianza del entrenador.');
    if (o.foreign) { var L = lg6(c, o.lid); msg(c, 'agent', 'Fichaje internacional', 'Te vas a ' + L.country + ': ' + club(c, o.club).name + ', de la ' + L.name + '. Nueva liga, nuevo idioma y rivales más fuertes.'); }
    if (c.window === 'end' && c.phase === 'off') { newSeason6(c, o, years); save6(c); return true; }
    if (c.window === 'mid') { joinClub6(c, o, years); c.last = null; save6(c); return true; }
    return false;
  }
  function stay6(years) {
    var c = load6(); if (!c || c.phase === 'pick') return false;
    if (c.phase === 'off') newSeason6(c, null, years); else { c.offers = []; c.window = ''; }
    save6(c); return true;
  }
  function negotiate6(i) {
    var c = load6(); if (!c || !c.offers || !c.offers[i]) return '';
    var o = c.offers[i], rl = ROLE_LV.indexOf(o.role);
    if (o.firm || o.trial || rl >= 2) return '';
    var kk = club(c, o.club);
    var dm = o.dm || o.depth;
    if (dm && capRole6(rl + 1, dm) <= rl) {   // la plantilla manda: no prometen lo que no pueden cumplir (sin enfado)
      o.firm = true;
      var ah = dm.ahead.map(function (x) { return x.name; });
      msg(c, 'offer', 'Negociación: no puede ser', kk.name + ': «No podemos prometerte eso: ' + (ah.length ? 'por delante tienes a ' + (ah.length > 1 ? ah.slice(0, -1).join(', ') + yE(ah[ah.length - 1]) + ah[ah.length - 1] : ah[0]) : 'el puesto está muy disputado') + '.» La oferta sigue como estaba.');
      save6(c); return 'cap';
    }
    var r = rng(hash(c.seed, 'neg6', c.season, c.phase, o.club, c.week)), ok = o.interest + r() * 4 > ROLE_NEED[rl + 1], k = kk;
    if (ok) { o.role = ROLE_LV[rl + 1]; o.salary = salary6(c, k, rl + 1, o.lid); o.interest = round1(o.interest - 2); } else o.negNo = true;
    o.firm = true; offerDepth6(c, o);   // («Tu sitio» con el rol nuevo, o con la confianza de llegada más baja)
    msg(c, 'offer', ok ? 'Negociación: aceptada' : 'Negociación: rechazada', ok ? k.name + ' acepta: firmarías como ' + o.role.toLowerCase() + ' (' + o.salary + ' € al mes).' : k.name + ' no mejora su oferta y no le ha gustado que pidieras más: si firmas, el entrenador empezará con menos confianza.');
    save6(c); return ok ? 'ok' : 'no';
  }
  function rejectAll6() {
    var c = load6(); if (!c || c.phase !== 'pick') return false;
    trialStaleOn(c);
    c.pick.round = Math.min(9, c.pick.round + 1); c.pick.more = false;
    c.offers = genStartOffers6(c, c.pick.round);
    msg(c, 'agent', 'Nuevas ofertas', 'Has rechazado todas las ofertas. Han llegado ' + c.offers.length + ' más, de clubes más modestos.');
    save6(c); return true;
  }
  function moreTime6() {
    var c = load6(); if (!c || c.phase !== 'pick' || c.pick.more || !c.offers.length) return null;
    var r = rng(hash(c.seed, 'more6', c.pick.round)), used = {}, lo = -1;
    c.offers.forEach(function (x, i) { used[x.club] = 1; if (!x.trial && (lo < 0 || x.interest < c.offers[lo].interest)) lo = i; });
    var low = lg6(c, c.cc + '2') ? c.cc + '2' : c.cc + '1';
    var cand = lgClubs6(c, low).filter(function (k) { return !used[k.id]; }).sort(function (a, b) { return a.ovr - b.ovr; }).slice(0, 6);
    if (!cand.length || lo < 0) return null;
    var avg = cand.reduce(function (s, k) { return s + k.ovr; }, 0) / cand.length, gone = c.offers.splice(lo, 1)[0], nk = pick(r, cand);
    c.offers.push(startOffer6(c, nk, avg, c.pick.round, r, false)); c.pick.more = true;
    c.offers.sort(function (a, b) { return (a.trial ? 1 : 0) - (b.trial ? 1 : 0) || b.ovr - a.ovr; });
    msg(c, 'agent', 'Una oferta menos, una más', club(c, gone.club).name + ' no quiere esperar y retira su oferta. A cambio ha llamado ' + nk.name + '.');
    save6(c); return { gone: gone.club, added: nk.id };
  }
  function physioCost6(c) { var k = c && myClub(c), L = k && lg6(c, k.lid); return Math.round(salBase6(L ? L.strength : 50) * 0.6 / 50) * 50; }
  function physio6() {
    var c = load6(); if (!c || c.phase === 'pick' || c.phase === 'off' || !c.contract) return '';
    if (c.physioWk === wkKey6(c)) return 'done';
    if ((c.fatigue | 0) <= 0) return 'none';
    var cost = physioCost6(c); if ((+c.money || 0) < cost) return 'money';
    c.money = Math.round(c.money - cost); c.fatigue = clamp((c.fatigue | 0) - PHYSIO_FAT, 0, 100); c.physioWk = wkKey6(c);
    save6(c); return 'ok';
  }
  /** Cambiar de puesto (p. ej. cuando sim añada colocador, opuesto o central). Tus atributos no cambian: el perfil es el de origen. */
  function setPosition6(k) {
    var c = load6(); if (!c || !POS6[k] || positions6().indexOf(k) < 0 || c.player.roleKey === k) return false;
    c.player.roleKey = k; c.player.role = POS6[k].name;
    var mk = myClub(c); if (mk) { var st0 = c.sq6 && c.sq6.stat; c.sq6 = newSq6(c, mk, c.season + (c.phase === 'off' ? 1 : 0)); c.sq6.fresh = 0; c.sq6.stat = st0 || null; }   // plantilla con tu nuevo puesto
    msg(c, 'coach', 'Nuevo puesto: ' + POS6[k].name.toLowerCase(), 'De acuerdo: desde la próxima jornada juegas de ' + POS6[k].name.toLowerCase() + '. Tus atributos siguen siendo los tuyos; entrena lo que pide el puesto.');
    save6(c); return true;
  }
  function withC6(fn) { return function () { var c = load6(); if (!c) return false; var r = fn.apply(null, [c].concat([].slice.call(arguments))); if (r) save6(c); return r; }; }
  var setTraining6 = withC6(function (c, k) { if (!TRAIN[k] || c.train === k) return false; c.train = k; return true; });
  var requestTransfer6 = withC6(function (c, on) {
    if (c.phase === 'pick' || !!on === !!c.listed) return false;
    c.listed = !!on;
    if (on) { c.coach = clamp(c.coach - LISTED_COACH, 0, 100); msg(c, 'coach', 'Has pedido el traspaso', 'Entiendo que quieras jugar más arriba, pero no me gusta. Tu agente ya avisa a los clubes, también a los de fuera: llegarán más ofertas (a mitad de temporada basta con una nota media de 6,5).'); }
    else { c.coach = clamp(c.coach + 3, 0, 100); msg(c, 'coach', 'Sigues con nosotros', 'Me alegra que retires la petición de traspaso. A trabajar.'); }
    return true;
  });
  var bump6 = withC6(function (c, k) {
    var a = c.player, p = P();
    if (p && p.athleteBump) return p.athleteBump(a, k, 1);
    var v = a.st[k], ok = KEYS.indexOf(k) >= 0 && v < 99 && a.pts >= costOf(v); if (ok) { a.pts -= costOf(v); a.st[k] = v + 1; } return ok;
  });
  var toggleBadge6 = withC6(function (c, id) { return B() && B().toggle ? B().toggle(c.player, id) : ''; });
  function unread6(c) { c = c || load6(); return c && c.inbox ? c.inbox.filter(function (m) { return !m.r; }).length : 0; }
  var readMsg6 = withC6(function (c, id) { var ok = false; c.inbox.forEach(function (m) { if (m.id === id && !m.r) { m.r = 1; ok = true; } }); return ok; });
  var readAll6 = withC6(function (c) { var n = 0; c.inbox.forEach(function (m) { if (!m.r) { m.r = 1; n++; } }); return n; });

  // ---------------------------------------------------------------- prueba con partidillo (playa y pista; 15-nov-2026)
  // notes/pruebas-entrenos-spec.md P3. La prueba de la oferta de inicio ya no es solo una tirada: es un partidillo a un set a
  // TRIAL_PTS con petos (playa: tú y tu futura pareja contra una pareja del club; pista: tú con los suplentes contra los titulares).
  // El cuerpo técnico pone 3 objetivos según tu puesto (trialGoals); la nota del partido (la nota en directo de js/rating.js, o
  // rating() con la parte de estadísticas escalada a un set corto si no está) + TRIAL_GOAL por objetivo cumplido da una letra
  // (TRIAL_CUT): A+, A o B → te fichan; C → decide la tirada de siempre con o.chance + TRIAL_C_BONUS; D o F → no. Sin experiencia,
  // ni jornada, ni entrenador (no hay club todavía). Simularla (trialSim, y acceptOffer con una prueba) es la tirada de antes con
  // o.chance × TRIAL_SIM: jugarla siempre compensa.
  // Reiniciar o abandonar la gasta (15-nov-2026, notes/nota-en-directo-spec.md §5): empezar el partidillo es jugarlo. trialForfeit
  // (reiniciar 'restart', salir 'quit') y trialStale (cerraste o recargaste la pestaña a medias: 'left') la cuentan como suspendida
  // (letra F, se quita la oferta, como al sacar D o F). trialSetup marca la prueba en curso con live: 1; las pendientes guardadas con
  // la 1.2.0 (sin live) se pueden jugar una vez más sin gastarse.
  // Guardado (al elegir club; a mitad o fin de temporada, lo mismo en c.tst): c.pick.trial = { club, offer, goals, tries (siempre 1; compatibilidad), live } mientras está en curso; c.pick.res =
  // { letter, nota, pass, goals: [{id, ok}], sim, club, forfeit? } con el último resultado (la UI lo enseña en la fase pick; al
  // aprobar, joinClub borra c.pick).
  var TRIAL_PTS = 15, TRIAL_SIM = 0.7, TRIAL_C_BONUS = 0.15, TRIAL_GOAL = 0.25;
  // (17-nov-2026, fusión con main; Ferran: «jugadores mejores que tú, con buenos stats y dificultad 1 por encima de la tuya»; «cuenta la
  //  nota, pero ganar el mini-partido te da algo más de probabilidades»):
  //  - rivales con media max(club, la tuya + TRIAL_UP); la IA, un peldaño por encima de tu dificultad (Fácil → Normal, Normal → Difícil,
  //    Difícil/Experto → Experto) o del club si ya juega por encima, nunca «suave» (trialAIOf);
  //  - con C, ganar el partidillo suma TRIAL_WIN a la tirada (la nota ya lleva el resultado: +0,9 ganando 1-0, −0,3 perdiendo);
  //  - la prueba vale también a mitad y a fin de temporada: genOffers / genOffers6 invitan a prueba al club mejor que te quiere casi lo
  //    justo (interés entre −TRIAL_GAP y 0; o.chance = trialChanceIt), una por ventana y la última de la lista. Fuera de la fase pick el
  //    estado va en c.tst = { trial, res } (tst(c)), la «ronda» de las tiradas es temporada y ventana (tRound) y superarla ficha como
  //    acceptOffer (trialSign: al momento a mitad de temporada, la temporada que viene en verano; contrato de 1 temporada).
  var TRIAL_UP = 4, TRIAL_WIN = 0.1, TRIAL_GAP = 3, TRIAL_BASE = { easy: 0, normal: 2, hard: 3, expert: 4 };
  function tst(c) { if (c.phase === 'pick' && c.pick) return c.pick; if (!c.tst || typeof c.tst !== 'object') c.tst = { trial: null, res: null }; return c.tst; }
  function tRound(c) { return c.phase === 'pick' && c.pick ? c.pick.round | 0 : (c.season | 0) * 10 + (c.window === 'end' ? 2 : 1); }
  function trialAIOf(c, ai) {
    var s = Math.min(STEPS.length - 1, Math.max(ai.step, TRIAL_BASE[diffOf(c)] | 0) + 1); if (STEPS[s].soft) s = Math.min(STEPS.length - 1, s + 1);
    var st = STEPS[s]; return { step: s, diff: st.d, soft: false, name: (VB.DIFF && VB.DIFF[st.d] && VB.DIFF[st.d].name) || st.d };
  }
  /** Probabilidad de partida de una invitación a prueba a mitad o fin de temporada (interés it entre −TRIAL_GAP y 0). */
  function trialChanceIt(it) { return round1(clamp(0.45 + 0.1 * it, 0.15, 0.45)); }
  /** Firma tras superar una prueba de mitad o fin de temporada (la parte de acceptOffer sin la prueba). */
  function trialSign(c, o, hall) {
    o.years = 1;
    o.early = earlyExit(c);
    if (o.early) msg(c, 'agent', 'Salida con contrato', club(c, c.myClub).name + ' no quería dejarte ir: aún te quedaban ' + plural((c.contract.left | 0) - (c.phase === 'off' ? 1 : 0), 'temporada', 'temporadas') + ' de contrato. Llegas a ' + club(c, o.club).name + ' con algo menos de confianza del entrenador.');
    if (c.window === 'end' && c.phase === 'off') { if (hall) newSeason6(c, o, 1); else newSeason(c, o, 1); return; }
    if (hall) joinClub6(c, o, 1); else joinClub(c, o, 1);
    c.last = null;
  }
  /** Saneado del estado de una prueba fuera de la fase pick (c.tst). */
  function trialSaneT(o) {
    if (o.tst == null) return;
    if (typeof o.tst !== 'object' || o.phase === 'pick') { delete o.tst; return; }
    var t = o.tst.trial, offs = Array.isArray(o.offers) ? o.offers : [], x = t && typeof t === 'object' && offs[t.offer];
    if (t != null && !(x && x.trial && x.club === t.club && Array.isArray(t.goals))) o.tst.trial = null;
    if (o.tst.res != null && !(typeof o.tst.res === 'object' && typeof o.tst.res.letter === 'string')) o.tst.res = null;
  }
  var TRIAL_CUT = [['A+', 8.0], ['A', 7.2], ['B', 6.5], ['C', 5.8], ['D', 5.0]];   // por debajo, F
  var TRIAL_PASS = ['A+', 'A', 'B'];
  // objetivos por puesto: [stat de ingest (M.p[0]), operador, cantidad]
  var TRIAL_GOALS = {
    atk: [['kills', '>=', 2], ['blocks', '>=', 1], ['errors', '<=', 2]],
    cr: [['perfect', '>=', 2], ['digs', '>=', 3], ['errors', '<=', 2]],
    uni: [['kills', '>=', 2], ['perfect', '>=', 2], ['errors', '<=', 2]],
    OH: [['kills', '>=', 2], ['recvP', '>=', 2], ['errors', '<=', 2]],
    OPP: [['kills', '>=', 3], ['errors', '<=', 2], ['aces', '>=', 1]],
    MB: [['blocks', '>=', 1], ['kills', '>=', 1], ['errors', '<=', 1]],
    S: [['assists', '>=', 4], ['errors', '<=', 1], ['aces', '>=', 1]],
    L: [['perfect', '>=', 2], ['digs', '>=', 3], ['poor', '<=', 2]]
  };
  var TRIAL_WORD = { kills: ['remate ganado', 'remates ganados'], blocks: ['bloqueo punto', 'bloqueos punto'], errors: ['error', 'errores'],
    perfect: ['toque perfecto', 'toques perfectos'], digs: ['defensa', 'defensas'], recvP: ['recepción perfecta', 'recepciones perfectas'],
    aces: ['ace', 'aces'], assists: ['asistencia', 'asistencias'], poor: ['toque flojo', 'toques flojos'] };
  /** Los 3 objetivos de la prueba según tu puesto (deterministas): [{ id, txt, stat, op: '>=' | '<=', n }]. */
  function trialGoals(c, o) {
    var pos = isHallC(c) ? ctrlRole6(c) : c && c.player ? c.player.roleKey : 'uni', l = TRIAL_GOALS[pos] || TRIAL_GOALS[isHallC(c) ? 'OH' : 'uni'];
    return l.map(function (g) {
      var w = TRIAL_WORD[g[0]], t = plural(g[2], w[0], w[1]);
      return { id: g[0], txt: g[1] === '<=' ? 'Como mucho ' + t : t.charAt(0).toUpperCase() + t.slice(1), stat: g[0], op: g[1], n: g[2] };
    });
  }
  /** Letra de la nota de la prueba (TRIAL_CUT). */
  // Cortes por modalidad (17-nov-2026, calibrado con los bots de simtest en el partidillo de verdad, IA un nivel por encima): la nota
  // de la pista se escala por puesto y sale más alta; con los mismos cortes el medio aprobaba el 89 % en la pista y el 30 % en la
  // playa. TRIAL_CUT_D se suma a cada corte (playa −0,3: B desde 6,2; pista +0,5: B desde 7,0).
  var TRIAL_CUT_D = { beach: -0.3, hall: 0.5 };
  function trialLetter(nota, hall) {
    if (nota == null) return 'F';
    var dd = TRIAL_CUT_D[hall ? 'hall' : 'beach'];
    for (var i = 0; i < TRIAL_CUT.length; i++) if (nota >= TRIAL_CUT[i][1] + dd - 1e-9) return TRIAL_CUT[i][0];
    return 'F';
  }
  /** La oferta i, si es una prueba (o null): al elegir club o, desde el 17-nov, invitación a mitad o fin de temporada. */
  function trialOffer(c, i) { var o = c && c.offers ? c.offers[i] : null; return o && o.trial ? o : null; }
  /** Apunta la prueba en curso (c.pick.trial, live: 1): desde aquí, salir antes del final la gasta (trialForfeit / trialStale). */
  function trialMark(c, i, o, goals) {
    tst(c).trial = { club: o.club, offer: i, goals: goals.map(function (g) { return { id: g.id, stat: g.stat, op: g.op, n: g.n, txt: g.txt }; }), tries: 1, live: 1 };
  }
  /** ¿Hay un partidillo de prueba en marcha ahora mismo (M de una partida con career.trial sin acabar)? */
  function trialLive() { var g = M && M.g; return !!(g && g.career && g.career.trial && !g.finished); }
  /** Índice de la oferta de la prueba en curso p (c.pick.trial) o −1. */
  function trialIdx(c, p) {
    if (!p || !c.offers) return -1;
    if (c.offers[p.offer] && c.offers[p.offer].club === p.club && c.offers[p.offer].trial) return p.offer | 0;
    for (var j = 0; j < c.offers.length; j++) if (c.offers[j].club === p.club && c.offers[j].trial) return j;
    return -1;
  }
  /** Prueba suspendida por dejar el partidillo a medias (why: 'restart' | 'quit' | 'left'): letra F, se quita la oferta y queda
   *  c.pick.res.forfeit. La nota en directo de ese momento va solo como información. Devuelve el resultado (como trialDoneOn) o null
   *  si la oferta i no tiene una prueba en curso. */
  function trialForfeitOn(c, i, why) {
    var o = trialOffer(c, i), p = c && tst(c).trial;
    if (!o || !p || p.club !== o.club) return null;
    why = why === 'restart' || why === 'quit' ? why : 'left';
    var nota = M && M.rt && trialLive() && M.g.career.club === o.club ? VB.Rating.value(M.rt) : null, k = club(c, o.club);
    var goals = (Array.isArray(p.goals) && p.goals.length ? p.goals : trialGoals(c, o)).map(function (g) { return { id: g.id, txt: g.txt, stat: g.stat, op: g.op, n: g.n, v: null, ok: null }; });
    M = null;
    trialResolve(c, i, false, { letter: 'F', nota: nota, goals: goals, sim: false, forfeit: why });
    return { trial: true, forfeit: why, letter: 'F', nota: nota, pass: false, luck: false, goals: goals, met: 0, club: o.club, clubName: k.name,
      left: c.offers ? c.offers.length : 0, sim: false };
  }
  /** Prueba en curso (live) sin partidillo en marcha: cerraste o recargaste la pestaña a medias → suspendida ('left'). Las pendientes
   *  sin live (guardadas con la 1.2.0) no se gastan. Devuelve el resultado de trialForfeitOn o null. */
  function trialStaleOn(c) {
    var p = c && tst(c).trial;
    if (!p || !p.live || trialLive()) return null;
    var i = trialIdx(c, p);
    if (i < 0) { tst(c).trial = null; if (isHallC(c)) save6(c); else save(c); return null; }   // (la oferta ya no está)
    return trialForfeitOn(c, i, 'left');
  }
  /** trialStaleOn antes de usar la oferta i: devuelve el índice de esa misma oferta después (−1 si era la que se ha gastado). */
  function trialStaleFix(c, i) {
    var o = c && c.offers && c.offers[i], id = o ? o.club : null;
    if (!trialStaleOn(c) || id == null) return i;
    for (var j = 0; j < c.offers.length; j++) if (c.offers[j].club === id) return j;
    return -1;
  }
  /** Prueba pendiente de la carrera c: { club, offer, live } o null. */
  function trialPendingOn(c) { var p = c && tst(c).trial; return p ? { club: p.club, offer: trialIdx(c, p), live: !!p.live } : null; }
  /** Partidillo de la prueba en la playa (oferta i): tú y la pareja que te ofrecen (o.mateP) contra una pareja del club, a un set a
   *  TRIAL_PTS, con petos (scrim) y sin challenge. Opciones para Sim.createGame como matchSetup, con career.trial. No llama a life(),
   *  ni toca la jornada, la experiencia o el entrenador. null si la oferta no es una prueba. */
  function trialSetup(c, i) {
    c = c || load(); i = trialStaleFix(c, i); var o = trialOffer(c, i); if (!o) return null;
    var k = club(c, o.club), ko = Math.max(clubOvr(k), playerOvr(c) + TRIAL_UP), r = rng(hash(c.seed, 'trialp', o.club, tRound(c))), ai = trialAIOf(c, rivalAI(c, k));
    var rivA = genSt(clamp(ko + 1, 1, 99), 'atk', r), rivB = genSt(clamp(ko - 1, 1, 99), 'cr', r);
    var fm = fatigueMalus(c), stMe = copy(c.player.st), mate = o.mateP && o.mateP.st ? o.mateP : newMate(c, k, r, o.mate);
    KEYS.forEach(function (key) { stMe[key] = clampI(stMe[key] - fm, 1, 99); });
    var bd = B() && B().forPlayer ? B().forPlayer(c.player) : null; if (bd && !Object.keys(bd).length) bd = null;
    var kt = k.kit || {}, goals = trialGoals(c, o), ref = copy(REF[league(k.lvl).ref]); ref.chal = 0;
    var kit = { kitShirt: kt.shirt, kitAccent: kt.accent, kitShorts: kt.shorts, kitPattern: kt.pattern };
    trialMark(c, i, o, goals); M = null; save(c);
    return {
      attrs: [[stMe, copy(mate.st)], [rivA, rivB]], badges: bd ? [[bd, null], null] : null,
      sets: 1, points: TRIAL_PTS, venue: VENUE, difficulty: ai.diff, ctrl: 'one', ctrlIdx: 0, rookie: !!ai.soft, diffName: ai.name, cdiff: diffOf(c),
      ref: ref, kit: kit, rivalKit: copy(kit), scrim: { base: trainShirt(kt.shirt), shorts: kt.shorts },
      career: { trial: true, mode: 'beach', club: o.club, offer: i, goals: goals, role: c.player.roleKey, season: c.season, phase: c.phase, week: 0, round: tRound(c),
        label: 'Partidillo de prueba: ' + k.name, me: 'TÚ', rival: k.short, venue: VENUE, meName: 'Tu pareja de prueba', rivalName: k.name,
        clubName: k.name, player: c.player.name, num: c.player.num, mate: mate.name, mateNum: mate.num, cdiff: diffOf(c), sets: 1, points: TRIAL_PTS }
    };
  }
  /** Partidillo de la prueba en la pista (oferta i): tú (en tu puesto, ctrlRole6) con los suplentes del club contra sus titulares, a
   *  un set a TRIAL_PTS, con petos. La plantilla es la del club (squad6, determinista: la misma que verás si fichas): los titulares
   *  son los mejores de cada puesto en el orden de la rotación; tu equipo, el resto, y los huecos que falten se generan con la
   *  media del club − 4 (semilla 'trial6p'). Sin banquillo ni cambios. */
  function trialSetup6(c, i) {
    c = c || load6(); i = trialStaleFix(c, i); var o = trialOffer(c, i); if (!o) return null;
    var k = club(c, o.club), R = simRoles6(), role = ctrlRole6(c), r = rng(hash(c.seed, 'trial6p', o.club, tRound(c)));
    var idx = R.indexOf(role); if (idx < 0) idx = R.indexOf('OH') >= 0 ? R.indexOf('OH') : 0;
    var stMe = copy(c.player.st), fm = fatigueMalus(c);
    KEYS.forEach(function (key) { stMe[key] = clampI(stMe[key] - fm, 1, 99); });
    var bd = B() && B().forPlayer ? B().forPlayer(c.player) : null; if (bd && !Object.keys(bd).length) bd = null;
    var sq = squad6(c, k, c.season, ''), byp = {}, used = {}, names = {};
    used[c.player.num | 0] = 1; names[c.player.name] = 1;
    SQ_POS.forEach(function (p) { byp[p] = sq.filter(function (x) { return x.pos === p; }).sort(function (a, b) { return b.ovr - a.ovr; }); });
    sq.forEach(function (x) { used[x.num] = 1; names[x.name] = 1; });
    var cnt = {}, a1 = [], nums1 = [], names1 = [], a0 = [], nums0 = [], names0 = [];
    // titulares (rival): el n.º i de cada puesto en el orden de la rotación
    var meUp = playerOvr(c) + TRIAL_UP;   // (titulares nunca por debajo de tu media + TRIAL_UP)
    R.forEach(function (p) { var j = cnt[p] = (cnt[p] || 0); cnt[p]++; var x = byp[p][j]; a1.push(genSt(clamp(Math.max(x ? x.ovr : k.ovr, meUp), 1, 99), p, r)); nums1.push(x ? x.num : 0); names1.push(x ? x.name : ''); });
    // suplentes (tu equipo): los que quedan; tú en el 1r hueco de tu puesto
    var rest = {}; SQ_POS.forEach(function (p) { rest[p] = byp[p].slice(cnt[p] || 0); });
    R.forEach(function (p, j) {
      if (j === idx) { a0.push(stMe); nums0.push(c.player.num); names0.push(c.player.name); return; }
      var x = rest[p].shift();
      if (x) { a0.push(genSt(clamp(x.ovr, 1, 99), p, r)); nums0.push(x.num); names0.push(x.name); return; }
      var n = 1; while (used[n] || n === 13) n++; used[n] = 1;   // (hueco sin suplente: uno generado, con dorsal libre)
      var nm, g = 0; do { nm = pick(r, FIRST) + ' ' + pick(r, LAST); } while (names[nm] && g++ < 30); names[nm] = 1;
      a0.push(genSt(clamp(k.ovr - 4, 1, 99), p, r)); nums0.push(n); names0.push(nm);
    });
    var L = lg6(c, k.lid), kt = k.kit || {}, goals = trialGoals(c, o), ref = copy(REF[ref6(L ? L.strength : 50)]); ref.chal = 0;
    var kit = { kitShirt: kt.shirt, kitAccent: kt.accent, kitShorts: kt.shorts, kitPattern: kt.pattern, kitLibero: kt.libero };
    var tai = trialAIOf(c, rivalAI6(c, k));   // un peldaño por encima de tu dificultad (o del club, si ya está por encima)
    trialMark(c, i, o, goals); M = null; save6(c);
    return {
      format: '6v6', venue: 'hall', ctrlRole: role, ctrlIdx: idx, ctrl: 'one', attrs: [a0, a1],
      badges: bd ? [R.map(function (x, j) { return j === idx ? bd : null; }), null] : null, nums: [nums0, nums1], names: [names0, names1],
      meOn: true, meSlot: idx, meBench: -1, sets: 1, points: TRIAL_PTS, difficulty: tai.diff, rookie: !!tai.soft, diffName: tai.name, cdiff: diffOf(c),
      ref: ref, kit: kit, rivalKit: copy(kit), scrim: { base: trainShirt(kt.shirt), shorts: kt.shorts },
      career: { trial: true, mode: 'hall', club: o.club, offer: i, goals: goals, season: c.season, phase: c.phase, week: 0, round: tRound(c),
        label: 'Partidillo de prueba: ' + k.name, me: 'SUP', rival: 'TIT', venue: 'hall', meName: 'Suplentes', rivalName: 'Titulares',
        clubName: k.name, player: c.player.name, num: c.player.num, pos: role, posName: POS6[role].name, mate: '', mateNum: 0, meOn: true, status: 'start', sets: 1, points: TRIAL_PTS }
    };
  }
  /** Nota de la prueba: me = tus estadísticas (ingest), res = { sets: [tú, rival], setScores }, rallies = puntos jugados, goals = los
   *  objetivos (por defecto trialGoals), rt = la nota en directo (M.rt, opcional). Con rt: los objetivos que faltan entran en ella
   *  (VB.Rating.bonus) y la nota es la del cierre (base = sin objetivos). Sin rt, la de antes: rating() con la parte de estadísticas
   *  escalada a un set corto (kmul = max(24, R) / max(15, R); pista, × RATE6 del puesto). Cada objetivo cumplido suma TRIAL_GOAL
   *  (tope 10). { nota, base, letter, met, goals: [{ id, txt, stat, op, n, v, ok }], rt?: { nota, best, worst } }. */
  function trialGrade(c, me, res, rallies, goals, rt) {
    me = me || {}; res = res || {};
    var sets = res.sets || [0, 0], R = rallies || (res.setScores || []).reduce(function (s, x) { return s + (x[0] | 0) + (x[1] | 0); }, 0) || TRIAL_PTS;
    var gl = (goals || trialGoals(c)).map(function (g) {
      var v = me[g.stat] | 0; return { id: g.id, txt: g.txt, stat: g.stat, op: g.op, n: g.n, v: v, ok: g.op === '<=' ? v <= g.n : v >= g.n };
    });
    var met = gl.filter(function (g) { return g.ok; }).length;
    if (rt && VB.Rating) {
      if (!rt.gl) rt.gl = {};
      gl.forEach(function (g) { if (g.ok && !rt.gl[g.id]) { rt.gl[g.id] = 1; VB.Rating.bonus(rt, 'goal', TRIAL_GOAL, 'Objetivo: ' + g.txt); } });
      var out = VB.Rating.close(rt, { sets: sets, setScores: res.setScores || [] });
      return { nota: out.nota, base: out.base, letter: trialLetter(out.nota, isHallC(c)), met: met, goals: gl, rt: { nota: out.nota, best: out.best, worst: out.worst } };
    }
    var kmul = Math.max(24, R) / Math.max(15, R) * (isHallC(c) ? RATE6[ctrlRole6(c)] || RATE6.OH : 1);
    // a un set, perder 0-1 cuenta como un 1-2 (−0,3; rating miraría sets[0] === 1 y lo contaría como un 0-2, −0,6). Ganar 1-0 ya es +0,9
    var rs = sets[0] === 0 && sets[1] === 1 ? [1, 2] : sets;
    var base = rating(me, { win: sets[0] > sets[1], sets: rs }, R, kmul);
    var nota = round1(Math.min(10, base + TRIAL_GOAL * met));
    return { nota: nota, base: base, letter: trialLetter(nota, isHallC(c)), met: met, goals: gl };
  }
  /** Cierra la prueba de la oferta i (aprobada o no): es lo que antes hacía acceptOffer con la tirada. Aprobada: mensaje del agente y
   *  joinClub / joinClub6. Suspendida: se quita la oferta (c.pick.fail) y, si no quedan, llegan otras. Borra c.pick.trial y deja el
   *  resultado en c.pick.res. Guarda. */
  function trialResolve(c, i, pass, info) {
    var o = c.offers[i], k = club(c, o.club), hall = isHallC(c), L = info.letter;
    var nt = info.sim ? 'informe del cuerpo técnico: ' + L : 'nota ' + L;
    var T = tst(c), pk = c.phase === 'pick';
    T.trial = null;
    T.res = { letter: L, nota: info.nota == null ? null : info.nota, pass: !!pass, sim: !!info.sim, club: o.club,
      goals: (info.goals || []).map(function (g) { return { id: g.id, ok: g.ok == null ? null : !!g.ok }; }) };
    if (info.forfeit) T.res.forfeit = info.forfeit;   // suspendida por dejar el partidillo a medias ('restart' | 'quit' | 'left')
    if (pass) {
      if (!pk) {   // invitación a mitad o fin de temporada
        msg(c, 'agent', '¡Prueba superada!', k.name + ' te ficha tras la prueba (' + nt + '). Contrato de 1 temporada' + (c.phase === 'off' ? ', desde la temporada que viene.' : '.'));
        trialSign(c, o, hall); if (hall) save6(c); else save(c); return true;
      }
      msg(c, 'agent', '¡Prueba superada!', k.name + ' te ficha tras la prueba (' + nt + '). Empiezas en ' + (hall ? 'la ' + lg6(c, o.lid).name : lname(league(o.lvl))) + ', una categoría por encima.');
      if (hall) { joinClub6(c, o, info.years); save6(c); } else { joinClub(c, o, info.years); save(c); }
      return true;
    }
    c.offers.splice(i, 1); if (pk) c.pick.fail = o.club; else if (c.window === 'mid' && !c.offers.length) c.window = '';
    var left = c.offers.length ? 'Aún tienes ' + plural(c.offers.length, 'oferta', 'ofertas') + (hall || !pk ? '' : ' d' + lname(league(0))) + '.' : pk ? '' : 'No te quedan más ofertas.';
    if (info.forfeit) msg(c, 'agent', 'Prueba no superada', 'Dejaste el partidillo a medias y ' + k.name + ' no te espera. ' + left);
    else msg(c, 'agent', 'Prueba no superada', k.name + ' te ha visto en la prueba (' + nt + ') y prefiere esperar. ' + left);
    if (pk && !c.offers.length) c.offers = hall ? genStartOffers6(c, ++c.pick.round) : genStartOffers(c, ++c.pick.round);
    if (hall) save6(c); else save(c);
    return false;
  }
  /** Fin del partidillo jugado (main.js, con gameOver): res = { sets, setScores, win }; g = la partida (ingest ya ha contado tus
   *  estadísticas en M.p[0]). Sin closeMine: ni experiencia, ni jornada, ni entrenador. Devuelve { letter, nota, base, pass, luck (la
   *  C la decidió la tirada), goals, met, me, club, clubName, left (ofertas que quedan; 0 si te fichan), sim: false } o null. */
  function trialDoneOn(c, i, res, g) {
    var o = trialOffer(c, i); if (!o || !res || !res.sets) return null;
    var m = M && (!g || M.g === g) ? M : newM(g), me = m.p[0];
    var sets = [res.sets[0] | 0, res.sets[1] | 0], sc = (res.setScores || []).map(function (x) { return [x[0] | 0, x[1] | 0]; });
    var rallies = (isHallC(c) && g && g.rallyN) || m.rallies || sc.reduce(function (s, x) { return s + x[0] + x[1]; }, 0);
    var goals = tst(c).trial && tst(c).trial.club === o.club && Array.isArray(tst(c).trial.goals) && tst(c).trial.goals.length ? tst(c).trial.goals : trialGoals(c, o);
    var gr = trialGrade(c, me, { sets: sets, setScores: sc }, rallies, goals, m === M ? m.rt : null), pass = TRIAL_PASS.indexOf(gr.letter) >= 0, luck = false;
    if (gr.letter === 'C') { luck = true; pass = rng(hash(c.seed, isHallC(c) ? 'trial6' : 'trial', o.club, tRound(c)))() < o.chance + TRIAL_C_BONUS + (sets[0] > sets[1] ? TRIAL_WIN : 0); }
    var mine = { kills: me.kills | 0, aces: me.aces | 0, blocks: me.blocks | 0, assists: me.assists | 0, digs: me.digs | 0, errors: me.errors | 0,
      recvP: me.recvP | 0, perfect: me.perfect | 0, good: me.good | 0, poor: me.poor | 0 };
    var k = club(c, o.club); M = null;
    trialResolve(c, i, pass, { letter: gr.letter, nota: gr.nota, goals: gr.goals, sim: false });
    var out = { letter: gr.letter, nota: gr.nota, base: gr.base, pass: pass, luck: luck, goals: gr.goals, met: gr.met, me: mine, sets: sets, setScores: sc,
      club: o.club, clubName: k.name, left: c.offers ? c.offers.length : 0, sim: false };
    if (gr.rt) out.rt = gr.rt;   // nota en directo: { nota, best, worst } (hoja final)
    return out;
  }
  /** Simular la prueba de la oferta i: la tirada determinista de antes con o.chance × TRIAL_SIM. El informe dice C si apruebas y D si
   *  no (objetivos sin marca: ok null). Devuelve { letter, nota: null, pass, luck: false, goals, met: 0, club, clubName, left, sim:
   *  true } o null. years: los del contrato (acceptOffer). */
  function trialSimOn(c, i, years) {
    i = trialStaleFix(c, i); var o = trialOffer(c, i); if (!o) return null;
    var pass = rng(hash(c.seed, isHallC(c) ? 'trial6' : 'trial', o.club, tRound(c)))() < o.chance * TRIAL_SIM;
    var goals = trialGoals(c, o).map(function (g) { return { id: g.id, txt: g.txt, stat: g.stat, op: g.op, n: g.n, v: null, ok: null }; }), k = club(c, o.club), L = pass ? 'C' : 'D';
    M = null;
    trialResolve(c, i, pass, { letter: L, nota: null, goals: goals, sim: true, years: years });
    return { letter: L, nota: null, pass: pass, luck: false, goals: goals, met: 0, club: o.club, clubName: k.name, left: c.offers ? c.offers.length : 0, sim: true };
  }
  /** Probabilidad de aprobar simulando (para el botón «Simular (prob. N %)»): o.chance × TRIAL_SIM. */
  function trialSimChance(o) { return o && o.trial ? Math.round(o.chance * TRIAL_SIM * 100) / 100 : 0; }
  var TRIAL_API = { TRIAL_PTS: TRIAL_PTS, TRIAL_SIM: TRIAL_SIM, TRIAL_C_BONUS: TRIAL_C_BONUS, TRIAL_GOAL: TRIAL_GOAL, TRIAL_CUT: TRIAL_CUT, TRIAL_CUT_D: TRIAL_CUT_D, TRIAL_PASS: TRIAL_PASS, TRIAL_GOALS: TRIAL_GOALS,
    trialLetter: trialLetter, trialSimChance: trialSimChance, TRIAL_UP: TRIAL_UP, TRIAL_WIN: TRIAL_WIN, TRIAL_GAP: TRIAL_GAP, trialAIOf: trialAIOf };

  var HALL = {
    MODE: 'hall', VER: VER6, STORE: KEY6, START_OVR: START6, POS: POS6, POINTS: POINTS6, WEEKS: 99, DIFF_AT: DIFF6_AT, SOFT: SOFT6, RATE6: RATE6, DOUBLE_MAX: DOUBLE_MAX, SCOUT_BONUS: SCOUT_BONUS,
    exists: function () { return !!load6(); }, get: function () { return load6(); }, load: load6, lost: function () { return lost6; }, save: save6, create: create6, abandon: abandon6,
    positions: positions6, countries: countries6, available: function () { return countries6().length > 0; }, simRoles: simRoles6, ctrlRole: ctrlRole6, setPosition: setPosition6,
    league: function (lid, c) { return lg6(c || load6(), lid); }, intlFor: intlFor6, regionOf: regionOf6, _compKind: compKind6, leagueClubs: function (c, lid) { return lgClubs6(c, lid); }, weeksOf: weeksOf6, midWeek: midWeek6, sched: sched6, roundName: roundName6,
    clubOvr: function (k) { return k ? k.ovr : 0; }, table: table6, posOf: posOf6, clubInfo: clubInfo6, objectiveFor: objectiveFor6, roster: roster6, salary: salary6, xpMul: xpMul6, ref: ref6,
    next: next6, matchSetup: matchSetup6, matchDone: matchDone6, simulateNext: simulateNext6, benchNext: benchNext6, teamOvr: teamOvr6,
    difficultyFor: difficultyFor6, diffLabel: diffLabel6, softFor: soft6, chemBonus: chemBonus6, physio: physio6, physioCost: physioCost6,
    acceptOffer: acceptOffer6, stay: stay6, negotiate: negotiate6, rejectAll: rejectAll6, moreTime: moreTime6, changeMate: function () { return ''; },
    setTraining: setTraining6, requestTransfer: requestTransfer6, bump: bump6, toggleBadge: toggleBadge6, unread: unread6, readMsg: readMsg6, readAll: readAll6,
    _genOffers: genOffers6, _scout: scoutCheck6, _wkKey: wkKey6, _name: function (r) { return pick(r, FIRST) + ' ' + pick(r, LAST); },   // (vida de la Carrera)
    _reset: function () { cur6 = null; M = null; }, _buildWorld: buildWorld6, _endLeague: endLeague6,
    // titularidad (13-nov-2026): plantilla, seis de la jornada, profundidad en las ofertas y textos de rol de la pista
    ROLE_HINT: ROLE_HINT6, benchWhy: whyText6, whyText: whyText6, WHY: WHY6, lineup: lineup6, squad: squad6, squadWeek: squadWeek6, depth: depth6, depthNow: depthNow6,
    capRole: capRole6, meRules: meRules6, SQ_SIZE: SQ_SIZE, SQ_BIG: SQ_BIG, SLOTS: SLOTS6, LIST: LIST6, ME_EDGE: ME_EDGE, ME_EDGE_STEP: ME_EDGE_STEP, ME_EDGE_MIN: ME_EDGE_MIN, meEdge: meEdge6, SEL_IMP: SEL_IMP, OUT_COACH: OUT_COACH, FAT_REST: FAT_REST, FAT_REST_TOP: FAT_REST_TOP,
    TIT_BONUS: TIT_BONUS, STARTS_PROMOTE: STARTS_PROMOTE, TIT_BROKEN: TIT_BROKEN, TRAIN_COACH: TRAIN_COACH, IMPACT_COACH: IMPACT_COACH, FIT_START: FIT_START, FIT_DEEP: FIT_DEEP,
    NOTA_MIN_R: NOTA_MIN_R, NOTA_MIN_SUB: NOTA_MIN_SUB, lastSel: lastSel6, BENCH_XP: BENCH_XP, XP_K: XP_K6,
    // dificultad de la Carrera (15-nov-2026): mismas claves que la playa, con el guardado y la escala de la pista
    CDIFF: CDIFF, CDIFF_KEYS: CDIFF_KEYS, STEPS: STEPS, DIFF_MSG: DIFF_MSG, GATE6: GATE6, TOP6: TOP6, top: top6,
    diffOf: function (c) { return diffOf(c || load6()); }, rivalAI: rivalAI6, attrOf: attrOf6, baseStep: baseStep6,
    seasonDiff: function (c) { return seasonDiff(c || load6()); }, midNota: function (c) { return midNota(c || load6()); }, setDifficulty: setDifficulty6,
    // sesiones de entrenamiento (13-nov-2026): las mismas que la playa, con el guardado de pista
    trainInfo: function (c) { return sessInfo(c || load6()); }, trainSession: function (id, how, total) { var c = load6(); if (!c) return null; var r = sessDo(c, id, how, total); if (r.ok) save6(c); return r; },
    drillSetup: function (id) { var c = load6(); return c ? drillSetup(c, id) : null; }, trainQuick: sessQuick, _sessClose: sessClose,
    // entrenos con nota, Rápido = récord, plan del entrenador y automático (15-nov-2026)
    trainPlan: function (c) { return sessPlan(c || load6()); }, trainRecommend: function (c) { return sessRecommend(c || load6()); }, trainGrade: sessGrade,
    trainSimDay: function () { var c = load6(); if (!c) return null; var r = sessSimDay(c); if (r.ok) save6(c); return r; },
    setTrainAuto: function (b) { var c = load6(); if (!c) return false; sessSane(c).auto = !!b; save6(c); return true; },
    _sessAuto: sessAuto,
    // prueba con partidillo (15-nov-2026)
    trialSetup: function (i) { var c = load6(); return c ? trialSetup6(c, i) : null; }, trialDone: function (i, res, g) { var c = load6(); return c ? trialDoneOn(c, i, res, g) : null; },
    trialSim: function (i) { var c = load6(); return c ? trialSimOn(c, i) : null; }, trialGoals: function (c, o) { c = c || load6(); return c ? trialGoals(c, o) : []; },
    trialGrade: function (c, me, res, rallies, goals, rt) { return trialGrade(c || load6(), me, res, rallies, goals, rt); },
    // nota en directo y prueba gastada (15-nov-2026)
    liveRating: liveRating, trialForfeit: function (i, why) { var c = load6(); return c ? trialForfeitOn(c, i, why) : null; },
    trialPending: function () { return trialPendingOn(load6()); }, trialStale: function () { var c = load6(); return c ? trialStaleOn(c) : null; }
  };
  Object.keys(TRIAL_API).forEach(function (k) { HALL[k] = TRIAL_API[k]; });

  var BEACH = {
    VER: VER, STORE: KEY, KEYS: KEYS, LEAGUES: LEAGUES, ROLES: ROLES, REF: REF, POINTS: POINTS, WEEKS: WEEKS, MID_WEEK: MID_WEEK, START_OVR: START_OVR, PTS_LVL: PTS_LVL,
    // vóley playa (v3) y compañero con nivel propio
    VENUE: VENUE, PTS: PTS, PTS3: PTS3, MATE_OFF: MATE_OFF, MATE_RENEW: MATE_RENEW, FORM_MAX: FORM_MAX, FORM_SIM: FORM_SIM,
    lname: lname, toL: toL, mateProfile: mateProfile, formText: formText, _newMate: newMate, _mateOff: mateOff, _beachify: beachify,
    exists: exists, get: get, load: load, lost: function () { return lost; }, save: save, create: create, abandon: abandon,
    league: league, club: club, myClub: myClub, clubsOf: clubsOf, clubOvr: clubOvr, table: table, posOf: posOf,
    next: next, matchSetup: matchSetup, ingest: ingest, matchDone: matchDone, simulateNext: simulateNext, abortMatch: abortMatch, owns: owns,
    playerOvr: playerOvr, mateOvr: mateOvr, teamOvr: teamOvr, avgNota: avgNota, form: form, ovrOf: ovrOf, need: need, cost: costOf,
    coachText: coachText, difficultyFor: difficultyFor, DIFF_AT: DIFF_AT, rating: rating, quickSim: quickSim, setPts: setPts, genSt: genSt,
    acceptOffer: acceptOffer, stay: stay, bump: bump, toggleBadge: toggleBadge, offerScore: offerScore,
    // gestión (v2)
    TRAIN: TRAIN, TRAIN_KEYS: TRAIN_KEYS, TGROUP: TGROUP, TRAIN_NEED: TRAIN_NEED, FAT_FREE: FAT_FREE, CHEM_KEYS: CHEM_KEYS, ROLE_LV: ROLE_LV, MATE_COACH: MATE_COACH,
    rejectAll: rejectAll, moreTime: moreTime, negotiate: negotiate, setTraining: setTraining, requestTransfer: requestTransfer, changeMate: changeMate,
    clubInfo: clubInfo, objectiveFor: objectiveFor, chemBonus: chemBonus, fatigueMalus: fatigueMalus, trialChance: trialChance,
    earlyExit: earlyExit, ROLE_COACH: ROLE_COACH, STYLE_TRAIN: STYLE_TRAIN, STYLE_PROG: STYLE_PROG, EARLY_COACH: EARLY_COACH, NEG_COACH: NEG_COACH,
    unread: unread, readMsg: readMsg, readAll: readAll,
    // escalón Normal suave, rol prometido y sueldo (11-nov-2026)
    SOFT: SOFT, softFor: softFor, diffLabel: diffLabel, MATE_CAP: MATE_CAP, mateFormCap: mateFormCap, BENCH: BENCH, PROMOTE_AT: PROMOTE_AT, ROLE_FLOOR: ROLE_FLOOR, ROLE_HINT: ROLE_HINT,
    BROKEN_BONUS: BROKEN_BONUS, PAY_WEEK: PAY_WEEK, PHYSIO_FAT: PHYSIO_FAT, benchNext: benchNext, benchWhy: benchWhy, BENCH_REST: BENCH_REST, physio: physio, physioCost: physioCost, roleIdx: roleIdx, _beachTrophies: beachTrophies,
    // vida de la Carrera (career-life.js)
    _msg: msg, _addXP: addXP, _wkKey: wkKey, XP_K: XP_K,
    // jefes de la Carrera (career-life.js bossSt)
    _genSt: genSt,
    // dificultad de la Carrera (12-nov-2026)
    CDIFF: CDIFF, CDIFF_KEYS: CDIFF_KEYS, STEPS: STEPS, DIFF_MSG: DIFF_MSG, diffOf: diffOf, rivalAI: rivalAI, attrOf: attrOf, baseStep: baseStep, seasonDiff: seasonDiff, midNota: midNota, setDifficulty: setDifficulty,
    _M: function () { return M; }, _reset: function () { cur = null; M = null; }, _genOffers: genOffers, _rng: rng, _hash: hash,
    // sesiones de entrenamiento entre jornadas (13-nov-2026)
    TRAIN_SESS: TRAIN_SESS, SESS_NEED: SESS_NEED, SESS_MAX: SESS_MAX, SESS_EFF: SESS_EFF, SESS_FAT: SESS_FAT, SESS_FAT_MAX: SESS_FAT_MAX, SESS_QUICK: SESS_QUICK,
    SESS_IMP_A: SESS_IMP_A, SESS_IMP_DECAY: SESS_IMP_DECAY, SESS_COACH: SESS_COACH, SESS_DRILL: SESS_DRILL, SESS_BY: SESS_BY, sessMedal: sessMedal,
    trainInfo: function (c) { return sessInfo(c || load()); }, trainSession: function (id, how, total) { var c = load(); if (!c) return null; var r = sessDo(c, id, how, total); if (r.ok) save(c); return r; },
    drillSetup: function (id) { var c = load(); return c ? drillSetup(c, id) : null; }, trainQuick: sessQuick, _sessClose: sessClose,
    // entrenos con nota, Rápido = récord, plan del entrenador y automático (15-nov-2026)
    SESS_GRADE: SESS_GRADE, SESS_PLAY_K: SESS_PLAY_K, SESS_FIRST: SESS_FIRST, SESS_FOCUS: SESS_FOCUS, SESS_QUICK_K: SESS_QUICK_K, SESS_QUICK_D: SESS_QUICK_D, SESS_REST: SESS_REST, SESS_AUTO_FAT: SESS_AUTO_FAT,
    trainPlan: function (c) { return sessPlan(c || load()); }, trainRecommend: function (c) { return sessRecommend(c || load()); }, trainGrade: sessGrade,
    trainSimDay: function () { var c = load(); if (!c) return null; var r = sessSimDay(c); if (r.ok) save(c); return r; },
    setTrainAuto: function (b) { var c = load(); if (!c) return false; sessSane(c).auto = !!b; save(c); return true; },
    _sessAuto: sessAuto,
    // prueba con partidillo (15-nov-2026)
    trialSetup: function (i) { var c = load(); return c ? trialSetup(c, i) : null; }, trialDone: function (i, res, g) { var c = load(); return c ? trialDoneOn(c, i, res, g) : null; },
    trialSim: function (i) { var c = load(); return c ? trialSimOn(c, i) : null; }, trialGoals: function (c, o) { c = c || load(); return c ? trialGoals(c, o) : []; },
    trialGrade: function (c, me, res, rallies, goals, rt) { return trialGrade(c || load(), me, res, rallies, goals, rt); },
    // nota en directo y prueba gastada (15-nov-2026)
    liveRating: liveRating, trialForfeit: function (i, why) { var c = load(); return c ? trialForfeitOn(c, i, why) : null; },
    trialPending: function () { return trialPendingOn(load()); }, trialStale: function () { var c = load(); return c ? trialStaleOn(c) : null; }
  };
  Object.keys(TRIAL_API).forEach(function (k) { BEACH[k] = TRIAL_API[k]; });

  // =====================================================================================================================
  // VB.Career: fachada de las dos Carreras. Cada clave lleva a la Carrera ACTIVA ('beach' | 'hall'): las que la pista redefine van a
  // HALL; el resto (constantes y utilidades comunes) a la de playa. Sin nada guardado (o con solo la de playa) la activa es la playa:
  // careertest, los guardados de playa y su migración no notan nada. VB.Career.beach / .hall dan acceso directo a cada una.
  function modeStored() { try { var s = store(), v = s && s.getItem(MODE_KEY); return v === 'hall' || v === 'beach' ? v : ''; } catch (e) { return ''; } }
  /** Carrera activa: la elegida la última vez; si esa no existe y la otra sí, la otra. Por defecto, la playa. */
  function mode() {
    var m = modeStored() || 'beach';
    if (m === 'hall' && !load6() && load()) return 'beach';
    if (m === 'beach' && !load() && load6()) return 'hall';
    return m;
  }
  function setMode(m) { m = m === 'hall' ? 'hall' : 'beach'; try { var s = store(); if (s) s.setItem(MODE_KEY, m); } catch (e) { } return m; }
  function hasMode(m) { return m === 'hall' ? !!load6() : !!load(); }
  function eng() { return mode() === 'hall' ? HALL : BEACH; }
  var F = {
    beach: BEACH, hall: HALL, mode: mode, setMode: setMode, has: hasMode, POS6: POS6, ordn: ordn,   // (ordn: «1r, 2º, 3r», también para main.js)
    /** Crear: o.mode 'hall' → Carrera de pista (y pasa a ser la activa); 'beach' → la de playa; sin mode, la activa. */
    create: function (o) {
      var m = o && (o.mode === 'hall' || o.mode === 'beach') ? o.mode : mode();
      var c = (m === 'hall' ? HALL : BEACH).create(o);
      if (c) setMode(m);
      return c;
    },
    /** Al cerrar un partido: el de la Carrera a la que pertenece (g.career.mode), aunque la activa hubiera cambiado. */
    matchDone: function (r, st, g) { return (g && g.career && g.career.mode === 'hall' ? HALL : g && g.career ? BEACH : eng()).matchDone(r, st, g); },
    ingest: ingest, abortMatch: abortMatch, owns: owns,
    /** Fin de un ejercicio de Carrera jugado (main.js): a la Carrera del ejercicio (g.careerDrill.mode), aunque la activa hubiera cambiado. */
    drillDone: function (mode, id, total) { return (mode === 'hall' ? HALL : BEACH).trainSession(id, 'play', total); },
    /** Fin del partidillo de una prueba (main.js, g.career.trial): a la Carrera de la prueba (mode o g.career.mode). */
    trialDone: function (mode, i, res, g) { var m = mode || (g && g.career && g.career.mode) || 'beach'; return (m === 'hall' ? HALL : BEACH).trialDone(i, res, g); },
    /** Reiniciar ('restart') o abandonar ('quit') el partidillo de una prueba (main.js): la gasta, en la Carrera de la prueba. */
    trialForfeit: function (mode, i, why) { return (mode === 'hall' ? HALL : BEACH).trialForfeit(i, why); },
    liveRating: liveRating,
    // ambiente de Carrera (notes/ambiente.md §4.6): estado del partido g y contexto (cs.amb) del próximo partido de la Carrera c
    amb: amb, ambCtx: function (c, n, cs) { c = c || (mode() === 'hall' ? load6() : load()); if (!c) return null; n = n || (isHallC(c) ? next6(c) : next(c)); try { return ambCtx(c, n, cs); } catch (e) { try { console.error('Career.ambCtx', e); } catch (e2) { } return null; } },
    _reset: function () { cur = null; cur6 = null; M = null; }
  };
  var C = {};
  Object.keys(BEACH).concat(Object.keys(HALL)).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(F, k) || Object.prototype.hasOwnProperty.call(C, k)) return;
    Object.defineProperty(C, k, { enumerable: true, configurable: true, get: function () { var e = eng(); return k in e ? e[k] : BEACH[k]; } });
  });
  Object.keys(F).forEach(function (k) { C[k] = F[k]; });
  VB.Career = C;
})();
