/* MAKE THE CUT — js/career-life.js (owner: carrera)
 * «Vida» de la Carrera (VB.CareerLife): todo lo que pasa alrededor de los partidos para que la Carrera enganche.
 *  - Reto de la jornada: un objetivo por partido (aces, remates, nota, ganar sin ceder un set…) con premio. Solo jugando.
 *  - Fama: seguidores y escalones («Desconocido» → «Leyenda viva»). Suben con las notas, los títulos, los retos y los premios.
 *  - Patrocinadores INVENTADOS (gag constante de vóley, nunca marcas reales): pagan por jornada y dan un bonus por objetivo.
 *  - Decisiones: ruedas de prensa, fiestas, clínics, piques con tu rival… con efecto en entrenador, química, fama y fatiga.
 *  - Rival personal: un jugador de tu liga con el que llevas el cara a cara; los partidos contra su club son «duelo».
 *  - Tienda: material (bonus pequeño en el partido, como la química) y servicios por jornada (entrenador personal, nutricionista,
 *    agente estrella). Por fin hay en qué gastar el sueldo.
 *  - Premios de la temporada (MVP, máximo anotador, mejor sacador, muro, defensa, revelación) y logros de carrera con recompensa.
 *  - Legado: puntuación de leyenda, declive físico desde los 32 y retirada (desde los 30) al Salón de la Fama del dispositivo.
 *  - Vestuario (sprint «personaliza», spec §7): el aspecto de tu jugador en c.life.look (un «fit» de VB.Look, js/look.js); lo que
 *    ganas en la Carrera (fama, logros, premios) va al inventario GLOBAL (VB.Look.grant) y hay tienda de cosméticos (solo estética:
 *    nunca toca GEAR, gearBonus ni attrs; su gasto va en l.spentLook, no en l.spent). Sin look.js no hace nada.
 *  - Sprint 2-4: jefes del circuito (S3 C3, solo playa: l.boss, l.bossW, l.rival.style), química con nombre (S3 C5: chemLevel,
 *    chemInfo, chemCheck, 3 decisiones raras), logros ses10/sesg5 (sesiones de entrenamiento, c.ts.md) y boss3 al final de ACH y ACH_INFO (S4 D2). notes/s234/T10.md.
 * Sin DOM (se carga en node: tools/careertest.js, tools/lifetest.js). Guarda en c.life dentro de la carrera (sin cambiar su versión: todo tiene valor
 * por defecto y se crea al vuelo con ensure()). career.js llama a hook(c, tipo, …) en sus puntos clave; si este fichero no está,
 * la Carrera funciona igual que antes.
 * Vale para las DOS Carreras (12-nov-2026): playa (make-the-cut.career) y pista (make-the-cut.career6, c.mode 'hall'). En la pista: textos de
 * pabellón (escalones, legado, logros, eventos, patrocinadores), retos por puesto medidos en partidos 6v6 reales (CH6), premio de mejor
 * colocador y la química del equipo (c.chem) en lugar de la de la pareja.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  // Motor de la carrera c: la fachada VB.Career va a la Carrera ACTIVA, pero los ganchos reciben la carrera concreta (una de pista
  // puede pasar por aquí con la playa activa, p. ej. al crearla). Con c: el motor de playa o una vista «pista sobre playa» (las claves
  // que la pista redefine —league(lid, c), next, load, save, posOf, weeksOf…— y el resto, comunes, de la playa). Sin c: la fachada.
  var HV = null, HVsrc = null;
  function K(c) {
    var C = VB.Career; if (!c || !C || !C.beach) return C;
    if (!hall(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function eur(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function num(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function rngOf() { var a = Array.prototype.slice.call(arguments), C = VB.Career.beach || VB.Career; return C._rng(C._hash.apply(null, a)); }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function hall(c) { return !!(c && c.mode === 'hall'); }
  /** Nivel 0-4 de la liga de tu club. En la pista k.lvl es la división (1 = 1ª), no un nivel: se saca de la fuerza de la liga (54-90). */
  function lvlOfStrength(s) { return clamp(Math.round(((s || 50) - 50) / 10), 0, 4); }
  function lvlOf(c) {
    var k = c && c.myClub >= 0 && K(c).myClub(c); if (!k) return 0;
    if (hall(c)) { var Lg = K(c).league(k.lid, c); return lvlOfStrength(Lg && Lg.strength); }
    return clamp(k.lvl | 0, 0, 4);
  }
  function leagueOf(c) { var k = K(c).myClub(c); return hall(c) ? (k ? K(c).league(k.lid, c) : null) || c.leagues[0] : K(c).league(k ? k.lvl : 0); }
  /** Pista: los partidos son a 15, 21 o 25 (el 3r a 15) y los recuentos crecen con los puntos (medido: a 25, ~1,7 veces los de a 15). */
  function ptsF(c) { return hall(c) ? clamp((+c.points || 15) / 15, 1, 25 / 15) : 1; }
  /** Puesto que llevas en la pista (S/OPP/MB/OH; el de la ficha si sim aún no deja llevarlo, el que juegas). */
  function role6(c) { var H = VB.Career.hall; return H && H.ctrlRole ? H.ctrlRole(c) : (c.player && c.player.roleKey) || 'OH'; }
  function modeOk(d, c) { return !d.only || d.only === (hall(c) ? 'hall' : 'beach'); }

  var LV_MULT = [1, 2, 4, 8, 15];   // seguidores por liga: jugar en el Circuito Mundial se ve mucho más
  var SALARY = [600, 1500, 4000, 9000, 20000];

  // ------------------------------------------------------------------ estado
  var lookOk = null;   // último c.life.look ya saneado por ensure (VB.Look.sane)
  function ensure(c) {
    if (!c) return null;
    var l = c.life;
    if (!l || typeof l !== 'object') l = c.life = {};
    if (!(l.fame >= 0)) l.fame = 0;
    if (!(l.fameMax >= 0)) l.fameMax = l.fame;
    if (!l.gear || typeof l.gear !== 'object') l.gear = {};
    if (!l.svc || typeof l.svc !== 'object') l.svc = {};
    if (!l.ach || typeof l.ach !== 'object') l.ach = {};
    if (!Array.isArray(l.awards)) l.awards = [];
    if (!Array.isArray(l.spOffers)) l.spOffers = [];
    if (!Array.isArray(l.log)) l.log = [];
    ['chDone', 'chTried', 'streak', 'best', 'bestNota', 'evN', 'duelW', 'duelL', 'hurt', 'spent', 'earned', 'spentLook'].forEach(function (k) { if (!(+l[k] >= 0)) l[k] = 0; });
    if (l.sponsor && typeof l.sponsor !== 'object') l.sponsor = null;
    if (l.ev && (typeof l.ev !== 'object' || !EVENTS[l.ev.key])) l.ev = null;
    // celebración de firma (sprint 5, E2): '' = ninguna; celebAnn = último escalón ya avisado (las carreras viejas no reciben avisos atrasados)
    if (typeof l.celeb !== 'string') l.celeb = '';
    if (!(l.celebAnn >= 0)) l.celebAnn = tierIdx(l.fameMax);
    // Vestuario: el aspecto de esta Carrera (null = el de siempre: guardados de antes del Vestuario, hasta que guardes uno) y
    // lookAnn = 1 si ya se ha repasado lo ganado (0: guardado antiguo; su primer lookCheck da un solo resumen)
    if (!l.look || typeof l.look !== 'object') l.look = null;
    else if (l.look !== lookOk && VB.Look && VB.Look.sane) l.look = lookOk = VB.Look.sane(l.look, 0);   // (ensure se llama mucho: se sanea una vez por objeto)
    l.lookAnn = +l.lookAnn > 0 ? 1 : 0;
    // jefes del circuito (S3 C3, solo playa): l.boss = {clave: jefe}, l.bossW = jefes distintos tumbados jugando
    if (!l.boss || typeof l.boss !== 'object' || Array.isArray(l.boss)) l.boss = {};
    // química con nombre (S3 C5): jN = jornadas cerradas, rareJ = jornada de la última decisión rara, rareN = contador de las raras
    // (ids propios: no mueven evN), chemEv = nivel recién alcanzado que fuerza «pairSign», sign = saludo de pareja (1 = sí)
    ['bossW', 'jN', 'rareJ', 'rareN', 'chemEv'].forEach(function (k) { if (!(+l[k] >= 0)) l[k] = 0; });
    if (l.sign !== 0) l.sign = 1;
    if (l.rival && typeof l.rival === 'object' && !BOSS_STYLES[l.rival.style]) l.rival.style = rivalStyleOf(l.rival.name);
    // nivel de química ya avisado: se fija al cargar con el actual (sin avisos atrasados en guardados viejos)
    if (c.mate && typeof c.mate === 'object' && !(c.mate.chemLv >= 0)) c.mate.chemLv = chemLevel(c.mate.chem);
    if (hall(c) && !(c.chemLv >= 0)) c.chemLv = chemLevel(c.chem);
    return l;
  }

  // ------------------------------------------------------------------ fama
  // [seguidores, nombre en la playa, nombre en la pista (si cambia)]
  var TIERS = [[0, 'Desconocido'], [500, 'Promesa local'], [2000, 'Conocido en el circuito', 'Conocido en la liga'], [7000, 'Figura'], [20000, 'Estrella'], [50000, 'Ídolo', 'Ídolo de la grada'], [120000, 'Leyenda viva']];
  function tierIdx(f) { var i = 0; for (var j = 0; j < TIERS.length; j++) if (f >= TIERS[j][0]) i = j; return i; }
  function tierOf(c) { var l = ensure(c); return tierIdx(l.fame); }
  /** Nombre del escalón i (c: con la carrera de pista, el de pabellón). */
  function tierName(i, c) { var t = TIERS[clamp(i | 0, 0, TIERS.length - 1)]; return hall(c) && t[2] ? t[2] : t[1]; }
  /** Progreso hacia el siguiente escalón: {i, name, next, from, to, p 0..1}. */
  function fameInfo(c) {
    var l = ensure(c), i = tierIdx(l.fame), nx = TIERS[i + 1];
    return { fans: Math.round(l.fame), i: i, name: tierName(i, c), next: nx ? tierName(i + 1, c) : '', from: TIERS[i][0], to: nx ? nx[0] : TIERS[i][0], p: nx ? clamp((l.fame - TIERS[i][0]) / (nx[0] - TIERS[i][0]), 0, 1) : 1 };
  }
  /** Suma (o resta) seguidores; avisa al subir de escalón y abre patrocinios. Devuelve lo sumado. */
  function addFame(c, n, why) {
    var l = ensure(c), t0 = tierIdx(l.fame);
    n = Math.round(n);
    l.fame = Math.max(0, l.fame + n); l.fameMax = Math.max(l.fameMax, l.fame);
    var t1 = tierIdx(l.fame);
    if (t1 > t0 && l.fame >= l.fameMax) {
      var fl = hall(c) && FAME_LINE6[t1] || FAME_LINE[t1] || '';
      K(c)._msg(c, 'fans', 'Fama: «' + tierName(t1, c) + '»', 'Ya te siguen ' + num(l.fame) + ' personas. ' + fl + (t1 >= 1 ? ' Los patrocinadores empiezan a llamar a tu agente.' : ''));
      if (t1 >= 1) sponsorOffers(c, 'tier');
    }
    celebCheck(c);
    lookCheck(c);
    return n;
  }

  // ------------------------------------------------------------------ celebración de firma (sprint 5, E2 §2.8)
  // El catálogo de verdad es VB.Players.CELEBS (players.js, con los gestos); este es el de reserva para node o sin players.
  // tier = índice de TIERS que la desbloquea (por fameMax: nunca se pierde).
  var CELEB_DEF = [{ id: 'saludo', name: 'Saludo', tier: 1 }, { id: 'bailecito', name: 'Bailecito', tier: 2 }, { id: 'avion', name: 'Avioncito', tier: 3 },
    { id: 'arquero', name: 'Arquero', tier: 4 }, { id: 'silencio', name: 'Silencio', tier: 5 }, { id: 'rodillazo', name: 'Rodillazo', tier: 6 }];
  function celebTier(x) {
    if (typeof x.tier === 'number') return clamp(x.tier | 0, 0, TIERS.length - 1);
    for (var j = 0; j < TIERS.length; j++) if (TIERS[j][1] === x.tier) return j;
    return TIERS.length - 1;
  }
  function celebCat() {
    var P = VB.Players && VB.Players.CELEBS, out = [];
    if (Array.isArray(P)) P.forEach(function (x) { if (x && typeof x.id === 'string' && x.id) out.push({ id: x.id, name: String(x.name || x.id), tier: celebTier(x) }); });
    return out.length ? out : CELEB_DEF;
  }
  /** [{id, name, tier, tierName, open, on}] para Fama › Celebración. */
  function celebs(c) {
    var l = ensure(c), ti = tierIdx(l.fameMax);
    return celebCat().map(function (x) { return { id: x.id, name: x.name, tier: x.tier, tierName: tierName(x.tier), open: x.tier <= ti, on: l.celeb === x.id }; });
  }
  /** Elige la celebración ('' = ninguna). false si no existe o aún está bloqueada. */
  function setCeleb(id) {
    var c = K().load(); if (!c) return false; var l = ensure(c);
    id = typeof id === 'string' ? id : '';
    if (id) { var x = celebs(c).filter(function (e) { return e.id === id; })[0]; if (!x || !x.open) return false; }
    l.celeb = id; K().save(c); return true;
  }
  /** Firma del guardado de Carrera (también para Partido rápido, solo lectura); '' si no hay carrera, no hay firma o ya no vale. */
  function signatureNow() {
    try {
      var c = K() && K().load && K().load(); if (!c || !c.life || typeof c.life.celeb !== 'string' || !c.life.celeb) return '';
      var x = celebs(c).filter(function (e) { return e.id === c.life.celeb; })[0];
      return x && x.open ? x.id : '';
    } catch (e) { return ''; }
  }
  /** Aviso en la bandeja al desbloquear una celebración (una sola vez por escalón: l.celebAnn). */
  function celebCheck(c) {
    var l = ensure(c), ti = tierIdx(l.fameMax); if (ti <= l.celebAnn) return;
    var from = l.celebAnn; l.celebAnn = ti;
    celebCat().forEach(function (x) {
      if (x.tier > from && x.tier <= ti) K()._msg(c, 'fans', 'Celebración nueva: ' + x.name, 'Ya puedes elegirla en Fama › Celebración. La harás en tus puntos grandes.');
    });
  }
  var FAME_LINE = ['', 'En tu barrio ya te paran por la calle para pedirte una foto.', 'Los comentaristas del circuito saben pronunciar tu apellido. Casi siempre.',
    'Las gradas empiezan a llevar tu dorsal pintado en la cara.', 'Sales en los resúmenes de la tele y tus jugadas dan la vuelta a las redes.',
    'Hay peques que se cortan el pelo como tú. Tu nombre llena gradas.', 'Ya no eres un jugador: eres una referencia. Dentro de veinte años aún hablarán de ti.'];
  // pista (pabellón): las que cambian
  var FAME_LINE6 = ['', '', 'Los comentaristas de la liga saben pronunciar tu apellido. Casi siempre.', 'En el pabellón ya hay pancartas con tu dorsal.', '',
    'Hay peques que se cortan el pelo como tú. Cuando sales a calentar, el pabellón se pone en pie.', ''];
  /** Interés extra de los clubes por tu fama (career.js offerScore): hasta +3. */
  function offerBonus(c) { var l = c && c.life; if (!l) return 0; return round1(Math.min(3, tierIdx(l.fame || 0) * 0.5) + (l.svc && l.svc.agent ? 2 : 0)); }

  // ------------------------------------------------------------------ reto de la jornada
  // Umbrales medidos con el autopiloto (≈ jugador bueno) en partidos de Carrera de playa (12-nov-2026): remates 10-18, aces 2-5,
  // bloqueos 0,5-3, defensas 5-20, asistencias 10-12, errores ~4 y nota 6,5-7,8 por partido. Objetivo: el autopiloto cumple ~50 %
  // (una persona media, algo menos): un reto tiene que costar.
  var CH = {
    kills: { n: [13, 15, 16, 17, 18], txt: 'Consigue {n} remates punto', txt1: 'Consigue un remate punto', stat: 'kills' },
    aces: { n: [5, 4, 4, 3, 3], txt: 'Haz {n} aces', txt1: 'Haz un ace', stat: 'aces' },
    blocks: { n: [2, 3, 3, 3, 4], txt: 'Haz {n} bloqueos punto', txt1: 'Haz un bloqueo punto', stat: 'blocks', roles: ['atk', 'uni', 'MB', 'OPP', 'OH'] },
    digs: { n: [8, 12, 15, 18, 20], txt: 'Saca {n} defensas', txt1: 'Saca una defensa', stat: 'digs', roles: ['cr', 'uni', 'L', 'OH', 'S'] },
    assists: { n: [12, 13, 13, 14, 14], txt: 'Da {n} asistencias', txt1: 'Da una asistencia', stat: 'assists', roles: ['cr', 'S'] },
    nota: { n: [8.1, 7.9, 7.6, 7.4, 7.2], txt: 'Saca una nota de {n} o más' },
    clean: { txt: 'Gana sin ceder ningún set', minL: 1 },   // (en la Regional, contra la IA Fácil, casi siempre)
    tidy: { n: [1, 2, 2, 2, 2], txt: 'Gana con {n} errores o menos', txt1: 'Gana con un error como mucho', txt0: 'Gana sin cometer ningún error' },
    win: { txt: 'Gana el duelo' }
  };
  var CH_KEYS = ['kills', 'aces', 'blocks', 'digs', 'assists', 'nota', 'clean', 'tidy'];
  // Pista (6v6): umbrales por PUESTO y nivel 0-4 de la liga (null = ese reto no sale), para partidos a 15; los recuentos se escalan
  // con ptsF (a 21 y a 25 hay más puntos). Medido el 12-nov-2026 con partidos 6v6 de Carrera reales (js/sim.js + ai6.js, ligas reales,
  // matchSetup de la pista, tu equipo en autopilot ≈ jugador bueno, tus números contados por VB.Career.ingest como en el juego): 12
  // partidos a 15 por puesto y nivel (240), y 5 a 25 por nivel para OH y S (×1,6-1,8 los recuentos). Por partido a 15 (L0-L4):
  //   OH  remates 6,3/5,4/7,7/5,7/4,1 · defensas 6,1/5,7/7,8/6,9/3,6 · aces 0,2-0,3 · nota 7,6/7,7/8,1/6,9/6,0
  //   OPP remates 5,3/6,0/6,3/5,2/4,2 · defensas 3,3/5,0/6,3/5,8/3,7 · bloqueos 0,2-0,4 · nota 7,4/7,8/7,1/6,6/6,1
  //   MB  remates 1,6/2,0/1,8/2,8/2,3 · bloqueos 1,1/0,4/0,8/0,7/1,3 · aces 0,2-0,6 · nota 7,5/7,4/7,3/6,7/6,4
  //   S   asistencias 21,7/20,2/22,3/23,6/16,3 · defensas 0,8-1,8 · bloqueos 0,2-0,5 · remates 0 · nota 8,4/8,1/7,7/7,0/6,5
  //   errores 0,3-1 por partido; el autopilot gana casi siempre en L0-L2 (por eso «sin ceder un set» solo en L3) y pierde casi
  //   siempre en L4 (allí no hay retos de ganar, salvo el duelo).
  // Cada umbral es el que cumple el autopilot en ~33-50 % de los partidos de su nivel (una persona media, algo menos), como en la playa.
  // Un colocador no remata: sus retos son de asistencias (y defensa, bloqueo, ace, nota y limpieza); un central, de bloqueo y remate.
  var CH6 = {
    OH: { kills: [7, 6, 8, 7, 5], digs: [7, 7, 8, 8, 4], aces: [1, 1, 1, 1, 1], nota: [7.9, 7.9, 8.4, 7.0, 6.0], tidy: [0, 0, 0, 1, null], clean: [null, null, null, 1, null] },
    OPP: { kills: [6, 7, 7, 6, 5], blocks: [1, 1, 1, 1, 1], digs: [4, 6, 6, 7, 4], nota: [7.5, 7.9, 7.4, 6.9, 6.1], tidy: [0, 0, 0, 0, null], clean: [null, null, null, 1, null] },
    MB: { kills: [2, 3, 2, 4, 3], blocks: [2, 1, 1, 1, 2], aces: [1, 1, 1, 1, 1], nota: [7.6, 7.6, 7.4, 6.9, 6.4], tidy: [null, 0, 0, 0, null], clean: [null, null, null, 1, null] },
    S: { assists: [24, 21, 22, 24, 17], digs: [2, 2, 2, 2, 2], blocks: [1, 1, 1, 1, 1], aces: [1, 1, 1, 1, 1], nota: [8.6, 8.3, 7.9, 7.7, 6.3], tidy: [null, 0, 0, 1, null], clean: [null, null, null, 1, null] }
  };
  var CNT6 = { kills: 1, digs: 1, aces: 1, blocks: 1, assists: 1 };   // los que crecen con los puntos del set
  /** Retos posibles (id → n) para la carrera c en su nivel L. */
  function chOptions(c, L) {
    var out = {};
    if (hall(c)) {
      var T = CH6[role6(c)] || CH6.OH, f = ptsF(c);
      CH_KEYS.forEach(function (k) { var a = T[k]; if (!a || a[L] == null) return; out[k] = CNT6[k] ? Math.max(1, Math.round(a[L] * f)) : a[L]; });
      return out;
    }
    var role = (c.player && c.player.roleKey) || (c.player && c.player.pos) || 'uni';
    CH_KEYS.forEach(function (k) { var d = CH[k]; if ((!d.roles || d.roles.indexOf(role) >= 0) && !(d.minL > L)) out[k] = d.n ? d.n[L] : 0; });
    return out;
  }
  function chTxt(d, n) { return n === 0 && d.txt0 ? d.txt0 : n === 1 && d.txt1 ? d.txt1 : d.txt.replace('{n}', String(n).replace('.', ',')); }
  function isKO(phase) { return phase === 'cup' || phase === 'ko'; }
  // (playa: copa = 500 + ronda; pista: 500 + 10 × copa + ronda, como wkKey6)
  function chKey(season, phase, f) { return (season | 0) * 1000 + (isKO(phase) ? 500 + (f && f.ko | 0) * 10 + (f && f.round | 0) : (f && f.week | 0)); }
  /** Reto de un partido (determinista por semilla y jornada). f = {week, round, ko}, phase, season, rivalId. */
  function challengeAt(c, season, phase, f, rivalId) {
    var l = ensure(c), L = lvlOf(c), key = chKey(season, phase, f), r = rngOf(c.seed, 'reto', key);
    var duel = !!(l.rival && l.rival.club === rivalId);
    var opt = chOptions(c, L), ks = CH_KEYS.filter(function (k) { return k in opt; });
    var id = duel ? (r() < 0.5 ? 'win' : pick(r, ks)) : pick(r, ks);
    var d = CH[id], n = id === 'win' ? 0 : opt[id];
    var mult = (duel ? 2 : 1) * (isKO(phase) ? 1.5 : 1);
    var Lg = hall(c) ? leagueOf(c) : K(c).league(L);   // (en la pista league() busca por id, no por nivel)
    var xpm = hall(c) ? (K(c).xpMul ? K(c).xpMul(Lg) : 1) : (Lg && Lg.xp) || 1;
    return { key: key, id: id, n: n, duel: duel, txt: chTxt(d, n),
      fans: Math.round(60 * LV_MULT[L] * mult), xp: Math.round(45 * xpm * mult * (K(c).XP_K || 1)), money: Math.round(SALARY[L] * 0.4 * mult / 10) * 10 };
  }
  /** Reto del próximo partido (para la UI). null si no hay partido o te toca banquillo. */
  function challenge(c) {
    c = c || K().get(); if (!c || c.phase === 'pick' || c.phase === 'off') return null;
    var n = K(c).next(c); if (!n || n.bench) return null;
    return challengeAt(c, c.season, c.phase, { week: n.week, round: n.round, ko: n.ko }, n.rival.id);
  }
  function chOk(ch, me, res, nota) {
    var win = res.sets[0] > res.sets[1];
    switch (ch.id) {
      case 'nota': return nota >= ch.n;
      case 'clean': return win && res.sets[1] === 0;
      case 'tidy': return win && (me.errors | 0) <= ch.n;
      case 'win': return win;
      default: return (me[CH[ch.id].stat] | 0) >= ch.n;
    }
  }
  function chProgress(ch, me, res, nota) {
    if (ch.id === 'nota') return String(nota).replace('.', ',');
    if (ch.id === 'clean' || ch.id === 'win') return res.sets[0] + '-' + res.sets[1];
    if (ch.id === 'tidy') return plural(me.errors | 0, 'error', 'errores');
    return (me[CH[ch.id].stat] | 0) + ' de ' + ch.n;
  }

  // ------------------------------------------------------------------ patrocinadores (inventados: gag de vóley, sin marcas reales)
  var SPONSORS = ['Chanclas Voladoras', 'Cremas Quemadito', 'Horchatería El Bloqueo', 'Seguros Arena Mojada', 'Toallas Sin Arena', 'Marisquería El Pulpo Feliz',
    'Gafas Mediodía', 'Bocatas Remate', 'Helados Punto de Set', 'Sombrillas Tie-Break', 'Zumos La Dejada', 'Autoescuela Saque Flotante', 'Panadería La Colocadora',
    'Colchones El Banquillo', 'Peluquería Tie-Break', 'Fontanería Toque de Red', 'Croquetas Doble Contacto', 'Paellas Cambio de Campo', 'Ferretería El Muro', 'Gimnasio Salto Vertical'];
  var SP_PAY = [0, 120, 400, 1200, 3500, 9000, 20000];   // € por jornada según tu escalón de fama
  var SP_GOALS = [
    { stat: 'aces', per: 1.6, txt: '{n} aces en la temporada' },
    { stat: 'kills', per: 9, txt: '{n} remates punto en la temporada' },
    { stat: 'won', per: 0.55, txt: '{n} victorias en la temporada' },
    { stat: 'blocks', per: 1.1, txt: '{n} bloqueos punto en la temporada' },
    { stat: 'digs', per: 6, txt: '{n} defensas en la temporada' }
  ];
  // Pista (pabellón): patrocinadores INVENTADOS con gag de vóley de pabellón (nunca marcas reales; algunos, gags recurrentes del juego)
  var SPONSORS6 = ['Rodilleras Rodríguez', 'Chanclas Supersónicas', 'Seguros Tie-Break', 'Parqués El Bote', 'Bebidas Tiempo Muerto', 'Fisioterapia El Líbero',
    'Pizzería La Rotación', 'Talleres Primer Tiempo', 'Cafetería La Pipe', 'Churrería Saque en Salto', 'Ferretería La Antena', 'Academia Zona 4',
    'Lavandería Camiseta de Líbero', 'Mudanzas Cambio de Saque', 'Clínica Dental Remate Limpio', 'Hamburguesas Bola de Set', 'Zapatillas Suela Pegajosa',
    'Ópticas Línea de Fondo', 'Colchones El Banquillo', 'Cerrajería Doble Bloqueo'];
  // objetivos de temporada en la pista, por puesto (por partido a 15, × ptsF): ~3/4 de lo medido jugando (ver CH6), porque los partidos
  // simulados y las jornadas de descanso o de banquillo suman menos
  var SP_GOALS6 = {
    OH: [{ stat: 'kills', per: 4.5, txt: '{n} remates punto en la temporada' }, { stat: 'digs', per: 4.5, txt: '{n} defensas en la temporada' }, { stat: 'won', per: 0.55, txt: '{n} victorias en la temporada' }],
    OPP: [{ stat: 'kills', per: 4.2, txt: '{n} remates punto en la temporada' }, { stat: 'blocks', per: 0.45, txt: '{n} bloqueos punto en la temporada' }, { stat: 'won', per: 0.55, txt: '{n} victorias en la temporada' }],
    MB: [{ stat: 'kills', per: 1.7, txt: '{n} remates punto en la temporada' }, { stat: 'blocks', per: 0.65, txt: '{n} bloqueos punto en la temporada' }, { stat: 'won', per: 0.55, txt: '{n} victorias en la temporada' }],
    S: [{ stat: 'assists', per: 14, txt: '{n} asistencias en la temporada' }, { stat: 'won', per: 0.55, txt: '{n} victorias en la temporada' }]
  };
  /** Jornadas de liga que juega tu equipo (pista: según los clubes de tu liga; con un nº impar de clubes se quitan las
   *  jornadas de descanso, una por vuelta: weeks / n). */
  function seasonWeeks(c) {
    if (!hall(c)) return K(c).WEEKS || 14;
    var k = K(c).myClub(c), w = k && K(c).weeksOf ? K(c).weeksOf(c, k.lid) || 11 : 11, n = k && K(c).leagueClubs ? K(c).leagueClubs(c, k.lid).length : 0;
    return n > 1 && n % 2 ? w - w / n : w;
  }
  /** Llegan 2 ofertas de patrocinio (al subir de escalón o al empezar temporada). why: 'tier' | 'season'. */
  function sponsorOffers(c, why) {
    var l = ensure(c), t = tierIdx(l.fame); if (t < 1) return [];
    if (l.sponsor && l.sponsor.tier >= t && why === 'tier') return [];
    var r = rngOf(c.seed, 'spons', c.season, t, l.evN), used = {}; if (l.sponsor) used[l.sponsor.name] = 1;
    var out = [], names = hall(c) ? SPONSORS6 : SPONSORS, goals = hall(c) ? SP_GOALS6[role6(c)] || SP_GOALS6.OH : SP_GOALS, weeks = seasonWeeks(c);
    for (var i = 0; i < 2; i++) {
      var name; do { name = pick(r, names); } while (used[name]); used[name] = 1;
      var g = pick(r, goals), per = g.per * (hall(c) && g.stat !== 'won' ? ptsF(c) : 1), n = Math.max(3, Math.round(per * weeks * (0.8 + 0.3 * r())));
      var pay = Math.round(SP_PAY[t] * (i ? 0.75 : 1) / 10) * 10;
      out.push({ name: name, tier: t, pay: pay, goal: { stat: g.stat, n: n, txt: g.txt.replace('{n}', n), bonus: Math.round(pay * (i ? 14 : 8) / 50) * 50 } });
    }
    l.spOffers = out;
    K(c)._msg(c, 'fans', 'Ofertas de patrocinio', out.map(function (o) { return o.name + ' (' + eur(o.pay) + ' por jornada; bonus de ' + eur(o.goal.bonus) + ' si consigues ' + o.goal.txt + ')'; }).join('. ') + '. Míralas en Fama.');
    return out;
  }
  function signSponsor(i) {
    var c = K().load(); if (!c) return false; var l = ensure(c), o = l.spOffers[i]; if (!o) return false;
    var off = c.phase === 'off';   // firmado en verano: cuenta para la temporada que viene (antes no caducaba nunca)
    l.sponsor = { name: o.name, tier: o.tier, pay: o.pay, goal: o.goal, season: c.season + (off ? 1 : 0), base: off ? 0 : statBase(c, o.goal.stat) };
    l.spOffers = [];
    K(c)._msg(c, 'fans', 'Firmas con ' + o.name, 'Tu cara saldrá en sus anuncios' + (hall(c) ? ' y en las vallas del pabellón' : '') + '. Cobras ' + eur(o.pay) + ' por jornada y ' + eur(o.goal.bonus) + ' más si consigues ' + o.goal.txt + '.');
    check(c); K(c).save(c); return true;
  }
  function declineSponsors() { var c = K().load(); if (!c) return false; ensure(c).spOffers = []; K(c).save(c); return true; }
  function statBase(c, stat) { return (c.stats && c.stats[stat]) | 0; }
  function sponsorProgress(c) { var l = ensure(c), s = l.sponsor; if (!s) return 0; return s.season === c.season && c.phase !== 'off' || s.done ? Math.max(0, statBase(c, s.goal.stat) - (s.base | 0)) : 0; }

  // ------------------------------------------------------------------ tienda: material y servicios
  // Material: compra única por nivel (1-3); suma en el partido a dos atributos (como la química, sin tocar tu atleta).
  var GEAR = {
    eyes: { beach: 'Gafas de sol polarizadas', hall: 'Rodilleras de gel', keys: ['recv', 'dig'], hint: 'Recepción y defensa' },
    feet: { beach: 'Calcetines de arena', hall: 'Zapatillas de salto', keys: ['jump', 'speed'], hint: 'Salto y velocidad' },
    hands: { beach: 'Muñequeras de tacto', hall: 'Muñequeras de tacto', keys: ['set', 'ctl'], hint: 'Colocación y control' },
    power: { beach: 'Banda elástica de potencia', hall: 'Banda elástica de potencia', keys: ['spike', 'serve'], hint: 'Remate y saque' }
  };
  var GEAR_KEYS = ['eyes', 'feet', 'hands', 'power'], GEAR_PRICE = [1500, 6000, 24000], GEAR_MAX = 3;
  // Servicios: se pagan por jornada (los cancelas cuando quieras; sin dinero se cancelan solos).
  var SVC = {
    coach: { name: 'Entrenador personal', hint: '+25 de progreso por semana con enfoque (+8 en Equilibrado)', k: 0.25 },
    nutri: { name: 'Nutricionista', hint: '−5 de fatiga en cada jornada', k: 0.15 },
    agent: { name: 'Agente estrella', hint: 'Más interés de los clubes (+2) y mejores patrocinios', k: 0.2 }
  };
  var SVC_KEYS = ['coach', 'nutri', 'agent'];
  function gearName(c, id) { return GEAR[id][hall(c) ? 'hall' : 'beach']; }
  function gearPrice(c, id) { var lv = (ensure(c).gear[id] | 0); return lv >= GEAR_MAX ? 0 : GEAR_PRICE[lv]; }
  function svcCost(c, id) { return Math.round(SALARY[lvlOf(c)] * SVC[id].k / 10) * 10; }
  function buyGear(id) {
    var c = K().load(); if (!c || !GEAR[id]) return ''; var l = ensure(c), lv = l.gear[id] | 0;
    if (lv >= GEAR_MAX) return 'max';
    var p = GEAR_PRICE[lv]; if ((+c.money || 0) < p) return 'money';
    c.money = Math.round(c.money - p); l.gear[id] = lv + 1; l.spent += p;
    check(c); K(c).save(c); return 'ok';
  }
  function toggleSvc(id) {
    var c = K().load(); if (!c || !SVC[id]) return ''; var l = ensure(c);
    if (l.svc[id]) { delete l.svc[id]; K(c).save(c); return 'off'; }
    if ((+c.money || 0) < svcCost(c, id)) return 'money';
    l.svc[id] = 1; K(c).save(c); return 'on';
  }
  function gearBonus(c) {
    var l = c && c.life, out = {}; if (!l || !l.gear) return out;
    GEAR_KEYS.forEach(function (id) { var lv = l.gear[id] | 0; if (lv) GEAR[id].keys.forEach(function (k) { out[k] = (out[k] | 0) + lv; }); });
    return out;
  }

  // ------------------------------------------------------------------ rival personal
  function ensureRival(c) {
    var E = K(c), l = ensure(c), me = c.myClub >= 0 && E.myClub(c); if (!me) return null;
    var H6 = hall(c), sameLg = function (k) { return H6 ? k.lid === me.lid : k.lvl === me.lvl; };   // (pista: misma liga por id; los clubes no tienen lvl)
    var rv = l.rival, rk = rv && E.club(c, rv.club);
    if (rk && sameLg(rk) && rk.id !== me.id) return rv;
    var pool = (H6 ? E.leagueClubs(c, me.lid) : E.clubsOf(c, me.lvl)).filter(function (k) { return k.id !== me.id; }); if (!pool.length) return null;
    var r = rngOf(c.seed, 'rival', c.season, me.id, l.evN);
    var k = pick(r, pool);
    if (rv && rk && r() < 0.5) {   // tu rival te persigue: ficha por un club de tu nueva liga
      rv.club = k.id;
      E._msg(c, 'fans', rv.name + ' te sigue', 'Tu rival ' + rv.name + ' ha fichado por ' + k.name + '. Dice que viene a por ti. El cara a cara sigue: ' + rv.w + '-' + rv.l + '.');
      return rv;
    }
    var m;
    if (H6) {   // pista: un jugador de su plantilla, de tu puesto (dorsal sin el tuyo ni el 13 del líbero)
      var nm = E._name ? E._name(r) : 'Rival', nu; do { nu = 1 + Math.floor(r() * 20); } while (nu === c.player.num || nu === 13);
      m = { name: nm, num: nu };
    } else m = E._newMate(c, k, r);
    var off = Math.round(1 + r() * 4);
    l.rival = { name: m.name, num: m.num, club: k.id, off: off, w: 0, l: 0, since: c.season };
    var pos = H6 && E.POS && E.POS[role6(c)] ? E.POS[role6(c)].name.toLowerCase() : '';
    E._msg(c, 'fans', 'Tienes un rival: ' + m.name, m.name + ' (' + k.name + ') tiene tu edad, juega en tu liga' + (pos ? ', también de ' + pos + ',' : '') + ' y no para de decir en las entrevistas que es mejor que tú. Cada partido contra su club es un duelo: el reto vale el doble.');
    return l.rival;
  }
  function rivalOvr(c) { var l = c && c.life; return l && l.rival ? clamp(K(c).playerOvr(c) + (l.rival.off | 0), 1, 99) : 0; }

  // ------------------------------------------------------------------ decisiones (eventos con elección)
  // efectos: coach, chem, fame (proporción de tus seguidores, con mínimo fameMin), fatigue, money (× sueldo de la liga), form (pareja), tp (progreso de entreno), hurt
  var EVENTS = {
    pressLoss: { t: 'Rueda de prensa tras la derrota', x: '«¿Qué ha fallado hoy?», pregunta una periodista con muy mala idea.', when: function (c, s) { return !s.win && !s.bench; },
      o: [{ t: 'Asumir la culpa', e: { coach: 4, fame: 0.01 } }, { t: 'Culpar al árbitro', e: { coach: -4, fame: 0.05, fameMin: 40 } }, { t: 'El rival fue mejor', e: { coach: 2 } }] },
    pressWin: { t: 'Los periodistas te rodean', x: 'Has ganado y todo el mundo quiere una frase tuya para el titular.', when: function (c, s) { return s.win && s.nota >= 7; },
      o: [{ t: 'Todo es mérito del equipo', e: { chem: 8, coach: 1 } }, { t: '«Hoy he estado imparable»', e: { fame: 0.07, fameMin: 60, chem: -5 } }, { t: 'Ya pensamos en el siguiente', e: { coach: 3 } }] },
    party: { t: 'Fiesta en el chiringuito', th: 'Cena de equipo', x: 'La plantilla ha quedado para celebrar. Mañana hay entreno a primera hora.', when: function () { return true; },
      o: [{ t: 'Quedarte hasta tarde', e: { chem: 10, fatigue: 15, fame: 0.02, fameMin: 15 } }, { t: 'Un rato y a casa', e: { chem: 4 } }, { t: 'Quedarte entrenando', e: { tp: 35, fatigue: 6, coach: 2 } }] },
    clinic: { t: 'Clínic benéfico', x: 'Una escuela de tu ciudad te invita a entrenar con sus peques el día de descanso.', when: function () { return true; },
      o: [{ t: 'Ir toda la mañana', e: { fame: 0.06, fameMin: 50, fatigue: 5 } }, { t: 'Mandar una camiseta firmada', e: { fame: 0.02, fameMin: 15 } }, { t: 'Esta vez no puedo', e: {} }] },
    viral: { t: 'Reto viral en redes', x: 'Te retan a meter un saque dentro de una papelera a 9 metros. Medio vestuario ya lo ha intentado.', when: function (c) { return tierOf(c) >= 1; },
      o: [{ t: 'Grabar el vídeo', e: { fame: 0.1, coach: -2, fatigue: 3 } }, { t: 'Pasar', e: { coach: 1 } }] },
    rivalTalk: { t: 'Tu rival te pica', x: '{rival} ha dicho en una entrevista que «en la arena hay jugadores y luego hay gente que hace fotos». Todo el mundo sabe por quién lo dice.',
      xh: '{rival} ha dicho en una entrevista que «en el pabellón hay jugadores y luego hay gente que sale en los anuncios». Todo el mundo sabe por quién lo dice.', when: function (c) { return !!(c.life && c.life.rival); },
      o: [{ t: 'Responder con humor', e: { fame: 0.05, fameMin: 40 } }, { t: 'Contestar duro', e: { fame: 0.08, fameMin: 60, coach: -3 } }, { t: 'Ignorarle', e: { coach: 3 } }] },
    // (pista: sin pareja; la química es la del equipo, c.chem, y {mate} es un compañero de la plantilla)
    mateDown: { t: 'Tu compañero está de bajón', th: 'Un compañero está de bajón', x: '{mate} apenas habla en los entrenos desde hace días.', when: function (c) { return c.mate ? (c.mate.chem | 0) < 50 : hall(c) && (c.chem | 0) < 50; },
      o: [{ t: 'Invitar a cenar', e: { chem: 10, money: -0.15 } }, { t: 'Entrenar juntos extra', e: { chem: 6, fatigue: 8 } }, { t: '«Espabila, que nos jugamos mucho»', e: { chem: -6, form: 1 } }] },
    // solo en la pista: el vestuario de un equipo de seis (más el líbero y el banquillo)
    speech: { only: 'hall', t: 'Charla en el vestuario', x: 'El capitán está lesionado y el entrenador te pide que hables tú al equipo antes del próximo partido.', when: function (c) { return (c.coach | 0) >= 45; },
      o: [{ t: 'Discurso épico', e: { chem: 8, coach: 2, fame: 0.02, fameMin: 15 } }, { t: 'Cuatro frases y a jugar', e: { chem: 3 } }, { t: '«Que hable otro»', e: { coach: -3 } }] },
    video: { only: 'hall', t: 'Sesión de vídeo', x: 'El segundo entrenador ha preparado dos horas de vídeo del próximo rival. Tus compañeros ya bostezan.', when: function () { return true; },
      o: [{ t: 'Tomar apuntes', e: { coach: 3, tp: 20 } }, { t: 'Proponer verlo en la cafetería', e: { chem: 6, coach: -1 } }, { t: 'Dormir con los ojos abiertos', e: { fatigue: -6, coach: -2 } }] },
    tv: { t: 'Te invitan a la tele', x: 'Un programa de deportes quiere entrevistarte en directo esta noche.', when: function (c) { return tierOf(c) >= 2; },
      o: [{ t: 'Ir al plató', e: { fame: 0.12, fatigue: 6, money: 0.3 } }, { t: 'Mejor descansar', e: { fatigue: -10 } }] },
    ankle: { t: 'Molestias en el tobillo', x: 'Al bajar de un bloqueo has notado un pinchazo. No parece grave, pero molesta.', when: function (c) { return (c.fatigue | 0) >= 45; },
      o: [{ t: 'Parar y fisio', e: { fatigue: -20, money: -0.3 } }, { t: 'Jugar con molestias', e: { coach: 3, hurt: 1 } }, { t: 'Vendaje y a por ello', e: { fatigue: 4 } }] },
    scout: { t: 'Un ojeador en la grada', x: 'Tu agente te avisa: en el próximo partido habrá un ojeador de un club de arriba.', when: function (c, s) { return lvlOf(c) < 4 && s.nota >= 6.8; },
      o: [{ t: 'Darlo todo', e: { scout: 1, fatigue: 5 } }, { t: 'Como un partido más', e: { coach: 2 } }] },
    fans: { t: 'Pancarta de la afición', x: 'Un grupo de seguidores ha venido con una pancarta enorme con tu cara (no te han sacado muy favorecido).', when: function (c) { return tierOf(c) >= 1; },
      o: [{ t: 'Foto con todos', e: { fame: 0.04, fameMin: 30 } }, { t: 'Saludar de lejos', e: { fame: 0.01 } }] },
    sponsorShoot: { t: 'Rodaje del anuncio', x: '{sponsor} quiere grabar un anuncio contigo el día de descanso. El guion incluye un disfraz.', when: function (c) { return !!(c.life && c.life.sponsor); },
      o: [{ t: 'Ponerte el disfraz', e: { money: 0.5, fame: 0.04, fameMin: 30, fatigue: 5 } }, { t: 'Solo una foto', e: { money: 0.15 } }] },
    // química con nombre (S3 C5): decisiones RARAS, fuera de la bolsa normal (maybeEvent). pairSign es forzada (la jornada siguiente a
    // llegar al nivel 2 o 3 en la playa); pairClash y pairTrip, una tirada aparte de 0,1 tras fallar la normal y ≥ 5 jornadas entre dos.
    // th/xh: título y texto de pabellón; en las opciones, th = texto de pabellón de la opción
    pairSign: { rare: true, t: 'Una señal vuestra', th: 'Un grito de equipo', x: '{mate} propone inventar un saludo solo vuestro para los puntos grandes. Dice que ya tiene la coreografía.',
      xh: 'El vestuario quiere un grito propio antes de cada partido y te piden que lo estrenes tú.', when: function () { return true; },
      o: [{ t: 'Ensayarlo hasta que salga', e: { chem: 5, fatigue: 3, sign: 1 } }, { t: 'Algo sencillo y a jugar', e: { chem: 2, sign: 1 } }, { t: 'Mejor nos concentramos', e: { coach: 2, chem: -2, sign: 0 } }] },
    pairClash: { rare: true, t: 'Pique en el calentamiento', th: 'Bronca en el vestuario', x: 'Tras la derrota, {mate} y tú acabáis discutiendo por quién cubría la diagonal. Nadie se acuerda de quién empezó.',
      xh: 'Tras la derrota, dos veteranos acaban discutiendo y todo el vestuario te mira a ti.', when: function (c, s) { return !s.win && !s.bench && chemNow(c) >= 60; },
      o: [{ t: 'Hablarlo en frío', e: { chem: 4, coach: 1 } }, { t: 'Dejarlo correr', e: {} }, { t: 'Tenías tú la diagonal', th: 'Ponerte de un lado', e: { chem: -8, form: 1 } }] },
    pairTrip: { rare: true, t: 'Invitación al pueblo', th: 'Barbacoa del equipo', x: '{mate} te invita a pasar el día de descanso en su pueblo: fiesta mayor, paella y un torneo de vóley de barrio.',
      xh: 'El líbero organiza una barbacoa en su casa el día de descanso. Va toda la plantilla.', when: function (c) { return chemNow(c) >= 90; },
      o: [{ t: 'Ir y jugar el torneo', th: 'Ir y montar un partidillo', e: { chem: 4, fatigue: 6, fame: 0.03, fameMin: 20 } }, { t: 'Ir solo a la paella', th: 'Ir solo a comer', e: { chem: 3, fatigue: -6 } }, { t: 'Descansar en casa', e: { fatigue: -12 } }] }
  };
  var RARE_P = 0.1, RARE_GAP = 5;   // tirada rara (tras fallar la normal) y jornadas mínimas entre dos raras (la spec decía 0,15: medido, 7,8 % de las jornadas con química 95; con 0,1, 2-6 %)
  var EV_KEYS = Object.keys(EVENTS);
  var EV_P = 0.4;   // probabilidad de decisión tras cada jornada (si no hay otra pendiente)
  /** Un compañero de tu plantilla de pista (determinista por temporada), para los textos con {mate}. */
  function mate6(c) {
    try { var ro = (K(c).roster ? K(c).roster(c) : []).filter(function (p) { return !p.me; }); if (ro.length) return ro[rngOf(c.seed, 'mate6', c.season, (c.life && c.life.evN) | 0)() * ro.length | 0].name; } catch (e) { }
    return 'Un compañero';
  }
  function evText(c, s) {
    var l = ensure(c), sp = l.sponsor ? l.sponsor.name : 'Tu patrocinador';
    return String(s).replace('{rival}', l.rival ? l.rival.name : 'Tu rival').replace('{mate}', c.mate ? c.mate.name : hall(c) ? mate6(c) : 'Un compañero').replace('{sponsor}', sp);
  }
  function evTitle(c, E) { return hall(c) && E.th ? E.th : E.t; }
  /** Decisión tras la jornada. Orden (S3 C5): 1) la forzada pairSign si chemEv venía de ANTES de esta jornada (force); 2) la tirada
   *  normal, idéntica a la de siempre (mismo rng, misma bolsa sin las raras, mismo evN); 3) si falla, la tirada rara. Las raras llevan
   *  ids propios (rareN) y no tocan evN ni lastEv: la secuencia normal de decisiones, rivales y patrocinios no cambia. */
  function maybeEvent(c, sum, force) {
    var l = ensure(c);
    if (l.ev) { K(c)._msg(c, 'fans', 'Sin respuesta: ' + evTitle(c, EVENTS[l.ev.key]).toLowerCase(), 'No contestaste a tiempo. La vida sigue.'); l.ev = null; }
    if (c.phase === 'off' || c.phase === 'pick') return;
    if (force && l.chemEv) { l.chemEv = 0; l.ev = { key: 'pairSign', id: 100000 + (++l.rareN), rare: 1 }; return; }
    var r = rngOf(c.seed, 'ev', c.season, c.week, c.phase, l.evN);
    if (r() >= EV_P) { rareEvent(c, sum); return; }
    var ok = EV_KEYS.filter(function (k) { return !EVENTS[k].rare && k !== l.lastEv && modeOk(EVENTS[k], c) && EVENTS[k].when(c, sum); });
    if (!ok.length) return;
    var key = pick(r, ok);
    l.ev = { key: key, id: ++l.evN }; l.lastEv = key;
  }
  function rareEvent(c, sum) {
    var l = c.life; if ((l.jN | 0) - (l.rareJ | 0) < RARE_GAP) return;
    var r = rngOf(c.seed, 'evr', c.season, c.week, c.phase, l.evN);
    if (r() >= RARE_P) return;
    var ok = ['pairClash', 'pairTrip'].filter(function (k) { return modeOk(EVENTS[k], c) && EVENTS[k].when(c, sum || {}); });
    if (!ok.length) return;
    l.ev = { key: pick(r, ok), id: 100000 + (++l.rareN), rare: 1 }; l.rareJ = l.jN | 0;
  }
  /** Evento pendiente para la UI: {key, title, text, opts:[{t, hint}]}. */
  function pendingEvent(c) {
    var l = c && c.life; if (!l || !l.ev) return null;
    var E = EVENTS[l.ev.key], H6 = hall(c);
    return { key: l.ev.key, id: l.ev.id, rare: !!E.rare, title: evText(c, evTitle(c, E)), text: evText(c, H6 && E.xh ? E.xh : E.x), opts: E.o.map(function (o) { return { t: evText(c, optT(c, o)), hint: effHint(o.e, c) }; }) };
  }
  function optT(c, o) { return hall(c) && o.th ? o.th : o.t; }
  function effHint(e, c) {
    var h = [];
    if (e.coach) h.push(['Entrenador', e.coach > 0]);
    if (e.chem) h.push([hall(c) ? 'Química del equipo' : 'Química', e.chem > 0]);
    if (e.fame) h.push(['Fama', e.fame > 0]);
    if (e.fatigue) h.push(['Fatiga', e.fatigue < 0]);
    if (e.money) h.push(['Dinero', e.money > 0]);
    if (e.tp) h.push(['Entreno', true]);
    if (e.form && (!c || c.mate)) h.push(['Forma del compañero', true]);
    if (e.hurt) h.push(['Riesgo', false]);
    if (e.scout) h.push(['Ofertas', true]);
    if ('sign' in e && !hall(c)) h.push(['Celebración', e.sign > 0]);
    return h;
  }
  function answer(i) {
    var c = K().load(); if (!c) return null; var l = ensure(c); if (!l.ev) return null;
    var E = EVENTS[l.ev.key], o = E.o[i]; if (!o) return null;
    var res = applyEff(c, o.e);
    var cu = chemCheck(c); if (cu && cu.up) res.push('¡Nivel de química: ' + cu.name + '!');
    l.log.push({ s: c.season, t: evTitle(c, E), o: evText(c, optT(c, o)) }); if (l.log.length > 30) l.log = l.log.slice(-30);
    if (VB.CareerStory && VB.CareerStory.hook) try { VB.CareerStory.hook(c, 'answer', l.ev.key, i); } catch (e) { }   // (career-story.js: cadenas; solo escribe en c.story)
    l.ev = null;
    check(c); K(c).save(c);
    return res;
  }
  function applyEff(c, e) {
    var l = ensure(c), out = [];
    if (e.coach) { c.coach = clamp((c.coach | 0) + e.coach, 0, 100); out.push('Entrenador ' + (e.coach > 0 ? '+' : '−') + Math.abs(e.coach)); }
    if (e.chem && c.mate) { c.mate.chem = clamp((c.mate.chem | 0) + e.chem, 0, 100); out.push('Química ' + (e.chem > 0 ? '+' : '−') + Math.abs(e.chem)); }
    else if (e.chem && hall(c)) { c.chem = clamp((c.chem | 0) + e.chem, 0, 100); out.push('Química del equipo ' + (e.chem > 0 ? '+' : '−') + Math.abs(e.chem)); }   // (pista: la del equipo)
    if (e.fame) { var n = e.fame > 0 ? Math.max(e.fameMin || 10, l.fame * e.fame) : -l.fame * -e.fame; n = addFame(c, n); out.push((n >= 0 ? '+' : '−') + num(Math.abs(n)) + ' seguidores'); }
    if (e.fatigue) { c.fatigue = clamp((c.fatigue | 0) + e.fatigue, 0, 100); out.push('Fatiga ' + (e.fatigue > 0 ? '+' : '−') + Math.abs(e.fatigue)); }
    if (e.money) { var m = Math.round(SALARY[lvlOf(c)] * e.money / 10) * 10; c.money = Math.max(0, Math.round((+c.money || 0) + m)); if (m > 0) l.earned += m; out.push((m >= 0 ? '+' : '−') + eur(Math.abs(m))); }
    if (e.form && c.mate) { c.mate.form = clamp((c.mate.form | 0) + e.form, -3, 3); out.push('Forma de ' + c.mate.name.split(' ')[0] + ' +' + e.form); }
    if (e.tp && c.tp) { addTp(c, trainGroup(c), e.tp); out.push('Entreno +' + e.tp); }
    if (e.hurt) { l.hurt = 1; out.push('Juegas tocado el próximo partido que juegues (−2)'); }
    if (e.scout) { l.scout = c.season; out.push('Más interés de los clubes esta temporada'); }
    if ('sign' in e && !hall(c)) { l.sign = e.sign ? 1 : 0; out.push(e.sign ? 'Saludo de pareja: sí' : 'Saludo de pareja: no'); }
    return out;
  }
  function addTp(c, g, n) { c.tp[g] = Math.min(99, (c.tp[g] | 0) + n); }   // (migrate recorta a 99: lo que pase se perdería al recargar)
  function trainGroup(c) { var t = c.train; return t === 'phys' || t === 'def' || t === 'atk' ? t : ['phys', 'def', 'atk'][(c.week | 0) % 3]; }

  // ------------------------------------------------------------------ premios de la temporada
  // Rivales simulados de la liga: lo que necesitas para ganar cada premio (por partido de la temporada). Objetivo: el autopiloto
  // (≈ jugador bueno) gana 1-2 por temporada jugándolo todo; simulando más de media temporada, ninguno.
  var AWARDS = [
    { id: 'mvp', name: 'MVP', test: function (c, x) { return x.nota != null && x.nota >= 8 + 0.5 * x.r() - 0.15 * x.L && x.pos <= 2; } },
    // (h: el mismo premio en la pista, por partido a 15 y × ptsF; con lo medido para los retos —CH6— lo gana una temporada de las
    //  buenas del autopilot en su puesto: un receptor u opuesto, anotador o defensa; un central, muro; un colocador, mejor colocador)
    { id: 'pts', name: 'Máximo anotador', test: function (c, x) { return x.pp >= 18 + 4 * x.r() - 0.5 * x.L; }, h: function (c, x) { return x.pp >= (7 + 2 * x.r() - 0.3 * x.L) * x.f; } },
    { id: 'ace', name: 'Mejor sacador', test: function (c, x) { return x.per('aces') >= 4 + 1.2 * x.r() - 0.3 * x.L; }, h: function (c, x) { return x.per('aces') >= (0.7 + 0.4 * x.r()) * x.f; } },
    { id: 'blk', name: 'Muro del año', test: function (c, x) { return x.per('blocks') >= 2.4 + 1 * x.r() + 0.1 * x.L; }, h: function (c, x) { return x.per('blocks') >= (1 + 0.5 * x.r() + 0.05 * x.L) * x.f; } },
    { id: 'dig', name: 'Mejor defensa', test: function (c, x) { return x.per('digs') >= 11 + 6 * x.r() + 2.5 * x.L; }, h: function (c, x) { return x.per('digs') >= (7 + 3 * x.r() + 0.3 * x.L) * x.f; } },
    { id: 'set', name: 'Mejor colocador', only: 'hall', test: function () { return false; }, h: function (c, x) { return x.per('assists') >= (20 + 4 * x.r() - 0.5 * x.L) * x.f; } },
    { id: 'rook', name: 'Revelación', test: function (c, x) { return x.newLeague && (c.player.age | 0) <= 23 && x.nota != null && x.nota >= 7.5 && !c.life.awards.some(function (a) { return a.id === 'rook'; }); } }   // una vez en la carrera
  ];
  function seasonAwards(c) {
    var l = ensure(c), S = c.stats, n = Math.max(1, S.played | 0), real = (S.played | 0) - (S.sim | 0);
    if ((S.played | 0) < 6) return [];
    var me = K(c).myClub(c), L = lvlOf(c), Lg = leagueOf(c), r = rngOf(c.seed, 'awards', c.season);
    var prevL = (c.history || []).filter(function (h) { return h.season === c.season - 1; })[0];
    var x = { r: r, L: L, nota: K(c).avgNota(c), pos: K(c).posOf(c, me.id), pp: S.pts / n, per: function (k) { return (S[k] | 0) / n; }, newLeague: !prevL || (hall(c) ? prevL.lid !== me.lid : prevL.lvl !== me.lvl), f: ptsF(c) };
    var won = [];
    AWARDS.forEach(function (a) {
      if (!modeOk(a, c)) return;
      var ok = hall(c) && a.h ? a.h(c, x) : a.test(c, x);
      if (ok && real < (S.played | 0) * 0.5) ok = false;   // simulando más de media temporada no hay premios (no te han visto jugar)
      if (ok) won.push(a);
    });
    won.forEach(function (a) {
      var nm = a.name + ' ' + deL(Lg);
      l.awards.push({ season: c.season, id: a.id, name: nm, club: me.name });
      c.trophies.push({ season: c.season, kind: 'premio', name: nm, club: me.name });
      addFame(c, (a.id === 'mvp' ? 400 : 150) * LV_MULT[L]);
    });
    if (won.length) K(c)._msg(c, 'fans', won.length === 1 ? 'Premio: ' + won[0].name : plural(won.length, 'premio', 'premios') + ' de la temporada',
      'La gala ' + deL(Lg) + ' te ha dado ' + won.map(function (a) { return '«' + a.name + '»'; }).join(', ') + '. Ya están en tu palmarés.');
    return won;
  }
  function deL(L) { return (L.art === 'el' ? 'del ' : 'de la ') + L.name; }

  // ------------------------------------------------------------------ logros de carrera
  // v(c) = valor actual; n = objetivo; premio: pts (puntos de mejora), fans, money. nh/dh: nombre y descripción en la pista (pabellón);
  // only: 'hall' | 'beach' (solo en esa Carrera)
  function T(c) { return c.career || {}; }
  function trophiesOf(c, k) { return (c.trophies || []).filter(function (t) { return !k || t.kind === k; }).length; }
  var ACH = [
    { id: 'm1', name: 'Debut', d: 'Juega tu primer partido', n: 1, v: function (c) { return T(c).played; }, fans: 30 },
    { id: 'm50', name: 'Veterano de la arena', nh: 'Veterano del parqué', d: 'Juega 50 partidos', n: 50, v: function (c) { return T(c).played; }, pts: 2 },
    { id: 'm150', name: 'Incombustible', d: 'Juega 150 partidos', n: 150, v: function (c) { return T(c).played; }, pts: 4 },
    { id: 'w1', name: 'Primera victoria', d: 'Gana un partido', n: 1, v: function (c) { return T(c).won; }, fans: 50 },
    { id: 'w50', name: 'Ganador', d: 'Gana 50 partidos', n: 50, v: function (c) { return T(c).won; }, pts: 3 },
    { id: 'p500', name: 'Anotador', d: 'Suma 500 puntos', n: 500, v: function (c) { return T(c).pts; }, pts: 2 },
    { id: 'p2000', name: 'Máquina de puntos', d: 'Suma 2.000 puntos', n: 2000, v: function (c) { return T(c).pts; }, pts: 4 },
    { id: 'a50', name: 'Saque bomba', d: 'Haz 50 aces', n: 50, v: function (c) { return T(c).aces; }, pts: 2 },
    { id: 'b50', name: 'Muralla', d: 'Haz 50 bloqueos punto', n: 50, v: function (c) { return T(c).blocks; }, pts: 2 },
    { id: 'as1k', name: 'Director de orquesta', d: 'Da 1.000 asistencias', n: 1000, v: function (c) { return T(c).assists; }, pts: 3, only: 'hall' },   // (el logro del colocador)
    { id: 'n9', name: 'Partidazo', d: 'Saca un 9 o más en un partido', n: 9, v: function (c) { return c.life.bestNota; }, fans: 150, dec: true },
    { id: 's5', name: 'En racha', d: 'Gana 5 partidos seguidos', n: 5, v: function (c) { return c.life.best; }, pts: 1 },
    { id: 's10', name: 'Imparable', d: 'Gana 10 partidos seguidos', n: 10, v: function (c) { return c.life.best; }, pts: 3 },
    { id: 'ch10', name: 'Retador', d: 'Cumple 10 retos de jornada', n: 10, v: function (c) { return c.life.chDone; }, pts: 2 },
    { id: 'ch40', name: 'Sin miedo a nada', d: 'Cumple 40 retos de jornada', n: 40, v: function (c) { return c.life.chDone; }, pts: 4 },
    { id: 'duel5', name: 'Némesis', d: 'Gana 5 duelos a tu rival', n: 5, v: function (c) { return c.life.duelW; }, pts: 2 },
    { id: 'up', name: 'Subir de categoría', d: 'Consigue un ascenso', n: 1, v: function (c) { return trophiesOf(c, 'ascenso'); }, money: 2000 },
    { id: 't1', name: 'Campeón', d: 'Gana un título (liga u open)', dh: 'Gana un título (liga o copa)', n: 1, v: function (c) { return trophiesOf(c, 'liga') + trophiesOf(c, 'copa') + trophiesOf(c, 'intl'); }, pts: 2 },
    { id: 't5', name: 'Coleccionista', d: 'Gana 5 títulos', n: 5, v: function (c) { return trophiesOf(c, 'liga') + trophiesOf(c, 'copa') + trophiesOf(c, 'intl'); }, pts: 5 },
    { id: 'aw1', name: 'Gala de premios', d: 'Gana un premio individual', n: 1, v: function (c) { return c.life.awards.length; }, pts: 1 },
    { id: 'mvp', name: 'El mejor de todos', d: 'Gana un MVP', n: 1, v: function (c) { return c.life.awards.filter(function (a) { return a.id === 'mvp'; }).length; }, pts: 3 },
    { id: 'top', name: 'En la élite', d: 'Juega en la máxima categoría', dh: 'Juega en una liga de élite', ph: function (v) { return 'Tu liga: nivel ' + v + ' de 4 (por su fuerza)'; }, n: 4, v: function (c) { return c.myClub >= 0 ? lvlOf(c) : 0; }, fans: 2000 },
    { id: 'f1', name: 'Te conocen', d: 'Llega a «Conocido en el circuito»', dh: 'Llega a «Conocido en la liga»', n: 2000, v: function (c) { return c.life.fameMax; }, money: 1000 },
    { id: 'f2', name: 'Estrella', d: 'Llega a «Estrella»', n: 20000, v: function (c) { return c.life.fameMax; }, pts: 3 },
    { id: 'f3', name: 'Leyenda viva', d: 'Llega a «Leyenda viva»', n: 120000, v: function (c) { return c.life.fameMax; }, pts: 5 },
    { id: 'l10', name: 'Nivel 10', d: 'Llega al nivel 10', n: 10, v: function (c) { return c.player.lvl; }, money: 1500 },
    { id: 'l25', name: 'Nivel 25', d: 'Llega al nivel 25', n: 25, v: function (c) { return c.player.lvl; }, pts: 3 },
    { id: 'sp', name: 'Cara de anuncio', d: 'Firma con un patrocinador', n: 1, v: function (c) { return c.life.sponsor || c.life.spDone ? 1 : 0; }, fans: 100 },
    { id: 'gear', name: 'Equipado hasta arriba', d: 'Todo el material a nivel 3', n: 12, v: function (c) { var s = 0; GEAR_KEYS.forEach(function (k) { s += c.life.gear[k] | 0; }); return s; }, pts: 2 },
    // sprint 2-4 (SIEMPRE al final, para no mover índices): sesiones de entrenamiento (c.ts.md = [sin, bronce, plata, oro], career.js sessDo)
    // y jefes del circuito (l.bossW)
    { id: 'ses10', name: 'Siempre a punto', d: 'Acaba 10 sesiones de entrenamiento con plata u oro', n: 10, v: function (c) { var s = c.ts && c.ts.md; return Array.isArray(s) ? (+s[2] || 0) + (+s[3] || 0) : 0; }, pts: 1 },
    { id: 'sesg5', name: 'Matrícula de honor', d: 'Saca oro en 5 sesiones de entrenamiento', n: 5, v: function (c) { var s = c.ts && c.ts.md; return Array.isArray(s) ? +s[3] || 0 : 0; }, fans: 40 },
    { id: 'boss3', name: 'Cazajefes', d: 'Gana a 3 jefes distintos', n: 3, v: function (c) { return c.life.bossW | 0; }, pts: 3, only: 'beach' }
  ];
  /** Lista estática de los logros (sin funciones) para el álbum del perfil (S4 D2): cuenta ACH.length, nunca un número fijo. */
  var ACH_INFO = ACH.map(function (a) { var o = { id: a.id, name: a.name, d: a.d }; if (a.nh) o.nh = a.nh; if (a.dh) o.dh = a.dh; if (a.only) o.only = a.only; return o; });
  function achName(a, c) { return hall(c) && a.nh ? a.nh : a.name; }
  function achD(a, c) { return hall(c) && a.dh ? a.dh : a.d; }
  function achList(c) {
    ensure(c);
    return ACH.filter(function (a) { return modeOk(a, c); }).map(function (a) { var v = +a.v(c) || 0; return { id: a.id, name: achName(a, c), d: achD(a, c), n: a.n, v: Math.min(v, a.n), pt: hall(c) && a.ph ? a.ph(Math.min(v, a.n)) : '', dec: !!a.dec, done: !!c.life.ach[a.id], reward: rewardTxt(a) }; });
  }
  function rewardTxt(a) { return a.pts ? '+' + plural(a.pts, 'punto de mejora', 'puntos de mejora') : a.fans ? '+' + num(a.fans) + ' seguidores' : a.money ? '+' + eur(a.money) : ''; }
  /** Comprueba logros nuevos y da sus premios. Devuelve los conseguidos ahora. */
  function check(c) {
    var l = ensure(c), got = [];
    ACH.forEach(function (a) {
      if (l.ach[a.id] || !modeOk(a, c)) return;
      if ((+a.v(c) || 0) >= a.n) {
        l.ach[a.id] = c.season | 0; got.push(a);
        if (a.pts && c.player) c.player.pts = (c.player.pts | 0) + a.pts;
        if (a.money) c.money = Math.round((+c.money || 0) + a.money);
        if (a.fans) addFame(c, a.fans);
      }
    });
    if (got.length) K(c)._msg(c, 'fans', got.length === 1 ? 'Logro: ' + achName(got[0], c) : plural(got.length, 'logro nuevo', 'logros nuevos'), got.map(function (a) { return achName(a, c) + ' (' + achD(a, c).toLowerCase() + '): ' + rewardTxt(a); }).join('. ') + '.');
    lookCheck(c);
    return got;
  }
  /** Nombre del logro id para textos de fuera (VB.Look.lockText): el de pabellón (nh) en la pista; '' si no existe. */
  function achNameOf(id, h) { var a = ACH.filter(function (x) { return x.id === id; })[0]; return a ? (h && a.nh ? a.nh : a.name) : ''; }

  // ------------------------------------------------------------------ legado y retirada
  var LEG_KEY = 'make-the-cut.legends';
  var LEG_TIERS = [[0, 'Jugador de club'], [60, 'Referente'], [150, 'Ídolo del circuito', 'Ídolo del pabellón'], [300, 'Leyenda'], [500, 'Mito del vóley']];
  /** Nivel 0-4 de la competición de un título. Playa: por el nombre del circuito. Pista: por la fuerza de la liga que nombra (o, si es
   *  la copa de un país, la de su 1ª); las internacionales valen fijo. */
  function trophyLvl(c, t) {
    var lv = 0, nm = t && t.name || '';
    if (!hall(c)) { K(c).LEAGUES.forEach(function (L, i) { if (nm.indexOf(L.name) >= 0) lv = i; }); return lv; }
    var best = '';
    (c.leagues || []).forEach(function (L) { if (L.name && nm.indexOf(L.name) >= 0 && L.name.length > best.length) { best = L.name; lv = lvlOfStrength(L.strength); } });
    if (!best && t.kind === 'copa') Object.keys(c.cups || {}).forEach(function (cc) { var L1 = (c.leagues || []).filter(function (L) { return L.id === cc + '1'; })[0]; if (L1 && c.cups[cc].name === nm) lv = lvlOfStrength(L1.strength); });
    return lv;
  }
  function legacyScore(c) {
    var l = ensure(c), s = 0;
    (c.trophies || []).forEach(function (t) {
      var lv = trophyLvl(c, t);
      s += t.kind === 'liga' ? 10 + 6 * lv : t.kind === 'copa' ? 6 + 4 * lv : t.kind === 'intl' ? 25 : t.kind === 'premio' ? (/^MVP/.test(t.name) ? 12 : 5) + 2 * lv : 4;
    });
    s += Math.round(Math.log(1 + l.fameMax) * 4);
    s += Math.round(((c.career && c.career.won) | 0) / 5);
    s += Object.keys(l.ach).length * 2;
    return s;
  }
  /** Escalón de legado de s puntos (c: con la carrera de pista, los nombres de pabellón). next = [puntos, nombre] o null. */
  function legacyTier(s, c) {
    var i = 0, nmOf = function (t) { return hall(c) && t[2] ? t[2] : t[1]; }; for (var j = 0; j < LEG_TIERS.length; j++) if (s >= LEG_TIERS[j][0]) i = j;
    var nx = LEG_TIERS[i + 1];
    return { i: i, name: nmOf(LEG_TIERS[i]), next: nx ? [nx[0], nmOf(nx)] : null };
  }
  var RETIRE_AGE = 30, DECLINE_AGE = 32;
  function canRetire(c) { return !!(c && c.player && (c.player.age | 0) >= RETIRE_AGE && c.phase !== 'pick'); }
  function legends() { try { var s = root.localStorage && root.localStorage.getItem(LEG_KEY); var a = s ? JSON.parse(s) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  /** Te retiras: la carrera pasa al Salón de la Fama del dispositivo y se borra (como abandonar, pero con homenaje). */
  function retire() {
    var c = K().load(); if (!canRetire(c)) return null;
    var l = ensure(c), sc = legacyScore(c), lt = legacyTier(sc, c), k = K(c).myClub(c);
    var rec = { name: c.player.name, num: c.player.num, role: c.player.role, age: c.player.age, seasons: c.season, score: sc, tier: lt.name,
      titles: (c.trophies || []).filter(function (t) { return t.kind === 'liga' || t.kind === 'copa' || t.kind === 'intl'; }).length,
      awards: l.awards.length, fans: Math.round(l.fameMax), club: k ? k.name : '', ovr: K(c).playerOvr(c), played: (c.career && c.career.played) | 0, mode: hall(c) ? 'hall' : 'beach', date: Date.now() };
    var all = legends(); all.push(rec); all.sort(function (a, b) { return b.score - a.score; }); all = all.slice(0, 20);
    try { root.localStorage.setItem(LEG_KEY, JSON.stringify(all)); } catch (e) { }
    K(c).abandon();
    return rec;
  }
  /** Bonus de legado para una carrera nueva: la mejor leyenda del dispositivo da seguidores de salida («hijo/a de…» no: tu apellido suena). */
  function legacyStart() { var a = legends(); if (!a.length) return 0; var t = legacyTier(a[0].score).i; return t * 150; }
  /** Verano: un año más. Desde DECLINE_AGE el físico baja (salto, velocidad, reacción). */
  function ageing(c) {
    var a = c.player, age = a.age | 0; if (age < DECLINE_AGE) return null;
    var r = rngOf(c.seed, 'age', c.season), d = age >= 35 ? 2 : 1, lost = [];
    ['jump', 'speed', 'react'].forEach(function (k) { var x = d + (r() < 0.4 ? 1 : 0) - (r() < 0.3 ? 1 : 0); if (x > 0 && a.st[k] > 20) { a.st[k] = Math.max(20, a.st[k] - x); lost.push(k); } });
    if (lost.length) K(c)._msg(c, 'train', 'Los años pesan', 'Con ' + age + ' años el cuerpo ya no responde igual: pierdes algo de físico (' + lost.map(function (k) { return (VB.Prog && VB.Prog.LABEL && VB.Prog.LABEL[k] || k).toLowerCase(); }).join(', ') + '). Tu experiencia sigue intacta.' + (age >= RETIRE_AGE ? ' Puedes retirarte cuando quieras desde Fama › Legado.' : ''));
    return lost;
  }

  // ------------------------------------------------------------------ Vestuario (cosméticos; spec §7)
  // Todo con guarda: sin VB.Look (js/look.js) nada cambia. El inventario es GLOBAL (make-the-cut.look.own, de look.js): lo que ganas o
  // compras aquí vale también en Partido rápido y en la otra Carrera. Nada de esto entra en GEAR, gearBonus, attrs ni la sim.
  function LK() { var X = VB.Look; return X && Array.isArray(X.CATALOG) && X.grant && X.owned ? X : null; }
  function unlocksOf(x) { var u = x && x.unlock; return Array.isArray(u) ? u : u && typeof u === 'object' ? [u] : []; }
  function lookName(X, x) { var n = ''; try { n = X.name ? X.name(x.id) : ''; } catch (e) { n = ''; } return String(n || x.name || x.id); }
  /** Carrera nueva (gancho 'create', de playa o de pista): lleva el aspecto de tu n.º 1 de Partido rápido (VB.Look.fit(0)). */
  function initLook(c) {
    var l = ensure(c), X = VB.Look, f = null;
    try { f = X && X.fit ? X.fit(0) : null; } catch (e) { f = null; }
    l.look = f && typeof f === 'object' ? (X.sane ? X.sane(f, 0) : f) : null;
    l.lookAnn = 1;   // (carrera nueva: los avisos, uno a uno; nada atrasado que resumir)
    return l.look;
  }
  /** Motivo por el que la carrera c ya tiene el objeto x («Estrella», «Saque bomba», «MVP»); '' si aún no. Solo lo que mide la
   *  Carrera: fama (por fameMax, nunca se pierde), logros y premios. La tienda, el Entrenamiento y el récord van por otro lado. */
  function lookReason(c, x) {
    var l = c.life, ti = tierIdx(l.fameMax), u = unlocksOf(x);
    for (var i = 0; i < u.length; i++) {
      var o = u[i]; if (!o || typeof o !== 'object') continue;
      if (typeof o.fame === 'number' && ti >= o.fame) return tierName(o.fame, c);
      if (typeof o.ach === 'string' && l.ach[o.ach]) return achNameOf(o.ach, hall(c)) || o.ach;
      if (typeof o.award === 'string' && l.awards.some(function (a) { return a && a.id === o.award; })) {
        var aw = AWARDS.filter(function (a) { return a.id === o.award; })[0]; return aw ? aw.name : o.award;
      }
      if (typeof o.boss === 'string' && l.boss) {   // jefe del circuito de ese estilo ya tumbado jugando
        for (var bk in l.boss) { var bb = l.boss[bk]; if (bb && bb.beat > 0 && bb.style === o.boss) return 'Jefe: ' + bb.nick; }
      }
      if (typeof o.chem === 'number' && o.chem > 0 && chemLevel(c) >= o.chem) return 'Química: ' + chemName(chemLevel(c), c);   // (química de la pareja o del equipo)
    }
    return '';
  }
  function andList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }
  /** Da (VB.Look.grant) lo que la carrera c ya se ha ganado y avisa en la bandeja: «Nuevo en tu vestuario: …». Con más de 3 de golpe,
   *  con quiet o la primera vez en un guardado antiguo (lookAnn 0), un solo resumen. Devuelve los ids nuevos. Sin look.js, []. */
  function lookCheck(c, quiet) {
    var X = LK(); if (!X || !c) return [];
    var l = ensure(c), got = [];
    if (!l.lookAnn) { quiet = true; l.lookAnn = 1; }
    var cat = X.CATALOG.concat(Array.isArray(X.PALETTE) ? X.PALETTE.filter(function (p) { return p && unlocksOf(p).length; }) : []);
    cat.forEach(function (x) {
      if (!x || typeof x.id !== 'string') return;
      var why = lookReason(c, x); if (!why) return;   // (primero lo que mide la carrera, sin leer el guardado; luego el inventario)
      var have = false; try { have = !!X.owned(x.id); } catch (e) { have = true; } if (have) return;
      var nw = false; try { nw = X.grant(x.id, 'carrera') === true; } catch (e) { nw = false; }
      if (nw) got.push({ id: x.id, name: lookName(X, x), why: why });
    });
    if (!got.length) return [];
    var one = function (g) { K(c)._msg(c, 'fans', 'Nuevo en tu vestuario: ' + g.name, 'Lo ganaste con «' + g.why + '». Póntelo en Jugador › Vestuario.'); };
    if (got.length === 1) one(got[0]);
    else if (got.length > 3 || quiet) K(c)._msg(c, 'fans', 'Nuevo en tu vestuario: ' + got.length + ' objetos', 'Lo has ganado en tu carrera: ' + andList(got.map(function (g) { return g.name + ' («' + g.why + '»)'; })) + '. Pruébalos en Jugador › Vestuario.');
    else got.forEach(one);
    return got.map(function (g) { return g.id; });
  }
  /** Precio en la tienda del objeto x (su desbloqueo {shop: €}); 0 si no se vende. */
  function lookPrice(x) { var u = unlocksOf(x); for (var i = 0; i < u.length; i++) if (u[i] && +u[i].shop > 0) return Math.round(+u[i].shop); return 0; }
  /** Fama › Tienda › Vestuario: todo lo que se vende (sin rotación), por precio. [{id, name, slot, venue, rarity, price, owned}]. */
  function lookShop(c) {
    var X = LK(); if (!X) return [];
    var out = [];
    X.CATALOG.forEach(function (x) {
      var p = x && typeof x.id === 'string' ? lookPrice(x) : 0; if (!p) return;
      var own = false; try { own = !!X.owned(x.id); } catch (e) { own = false; }
      out.push({ id: x.id, name: lookName(X, x), slot: String(x.slot || ''), venue: x.venue === 'P' || x.venue === 'Y' ? x.venue : 'A', rarity: clamp(x.rarity | 0, 0, 3), price: p, owned: own });
    });
    return out.sort(function (a, b) { return a.price - b.price || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
  }
  /** Compra un cosmético con el dinero de la Carrera activa: 'ok' | 'money' | 'owned' | '' (no existe, no se vende o sin look.js).
   *  Va a l.spentLook (no a l.spent: no cuenta para ningún logro de gasto ni para «Equipado hasta arriba»). */
  function buyLook(id) {
    var X = LK(), c = K().load(); if (!X || !c) return '';
    var x = X.CATALOG.filter(function (e) { return e && e.id === id; })[0], p = lookPrice(x); if (!p) return '';
    var l = ensure(c);
    if (X.owned(id)) return 'owned';
    if ((+c.money || 0) < p) return 'money';
    try { X.grant(id, 'tienda'); } catch (e) { }
    if (!X.owned(id)) return '';   // (no se ha podido guardar el inventario: no se cobra)
    c.money = Math.round(c.money - p); l.spentLook += p;
    K(c).save(c); return 'ok';
  }
  /** Guarda el aspecto de la Carrera activa (desde el Vestuario). false sin carrera o sin look.js. */
  function setLook(fit) {
    var X = VB.Look, c = K().load(); if (!c || !X || !X.sane || !fit || typeof fit !== 'object') return false;
    var l = ensure(c); l.look = X.sane(fit, 0); K(c).save(c); return true;
  }
  /** Aspecto de la Carrera activa para el partido (main.js → VB.Look.matchLooks) y el Vestuario; null = el de siempre. */
  function lookNow() {
    try {
      var c = K() && K().load && K().load(); if (!c || !c.life || !c.life.look || typeof c.life.look !== 'object') return null;
      return VB.Look && VB.Look.sane ? VB.Look.sane(c.life.look, 0) : null;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ jefes del circuito (S3 C3; solo playa en esta fase)
  // Un jefe fijo por circuito de playa (clave 'b' + nivel), generado con la semilla de la carrera (rngOf: nunca el rng de career.js
  // ni g.rng). Juega en el club más fuerte de su liga (sin el tuyo ni el de tu rival). En los partidos contra su club, su n.º 1 lleva
  // atributos de jefe (bossSt: desvíos sobre la media, recentrada exacta) e insignias: solo attrs + badges, sin tocar sim.js ni ai.js.
  // Desvíos medidos con boss-exp.js / tools/lifetest.js (muro2 y remate2 de la spec; muro SIN 'rompemanos': tira un dado extra de g.rng).
  var BOSS_STYLES = {
    saque: { name: 'Cañón', nicks: ['Cañón', 'Bazuca', 'Misil'], hint: 'Saca en salto y muy fuerte: recibe atrás y sin prisa.', base: 'atk',
      d: { serve: 24, spike: 6, ctl: 4, recv: -10, dig: -8, block: -8, set: -8 }, badges: { bombardero: 2, flotador: 2 }, item: 'Muñequera de cañón', celeb: 'sopla', rage: 'manotazo' },
    muro: { name: 'Muro', nicks: ['Muro', 'Paredón', 'Frontón'], hint: 'Bloquea fuerte por su lado: ataca por el otro.', base: 'atk',
      d: { block: 30, jump: 16, spike: 4, recv: -14, dig: -12, serve: -8, speed: -8, set: -8 }, badges: { muro: 3 }, item: 'Dedos de hierro', celeb: 'muralla', rage: 'grito' },
    remate: { name: 'Martillo', nicks: ['Martillo', 'Mazo', 'Trueno'], hint: 'Remata durísimo: defiende atrás cuando ataque.', base: 'atk',
      d: { spike: 30, ctl: 18, jump: 10, recv: -16, dig: -14, set: -12, serve: -8, block: -8 }, badges: { canon: 3, mira: 3 }, item: 'Manguito del martillo', celeb: 'martillo', rage: 'rabia' },
    defensa: { name: 'Pulpo', nicks: ['Pulpo', 'Imán', 'Lapa'], hint: 'Lo saca todo, pero remata flojo: ten paciencia.', base: 'cr',
      d: { dig: 22, recv: 14, react: 14, speed: 10, spike: -16, block: -16, jump: -14, serve: -6 }, badges: { ancla: 2, red: 2, motor: 1 }, item: 'Tobillera de pulpo', celeb: 'escoba', rage: 'arena' }
  };
  var BOSS_KEYS = ['saque', 'muro', 'remate', 'defensa'];
  var BOSS_UP = 4, RIVAL_UP = 2, BOSS_FANS = 250;
  // compañero de playa: su estilo (career.js MATE_STYLES) → personalidad, firma y rabia en pista (players: setMate, S3 C2)
  var MATE_ANIM = {
    'Rematador potente': ['fuego', 'martillo', 'rabia'], 'Saltador': ['show', 'biceps', 'grito'], 'Muro en la red': ['fuego', 'muralla', 'manotazo'],
    'Colocador fino': ['calma', 'sien', 'headHands'], 'Pulpo en la arena': ['guason', 'escoba', 'arena'], 'Receptor seguro': ['calma', 'sien', 'jarras'],
    'Todoterreno': ['show', 'biceps', 'grito'], 'Jugador listo': ['guason', 'sien', 'headHands'], 'Sacador': ['fuego', 'sopla', 'rabia']
  };
  function rivalStyleOf(name) { return BOSS_KEYS[Math.floor(rngOf('rstyle', String(name || ''))() * 4) % 4]; }
  function engineGenSt() { var C = VB.Career, B = C && (C.beach || C); return B && (B.genSt || B._genSt); }
  /** Atributos de jefe: genSt(o, base) + desvíos del estilo, recentrados a la media o exacta (±0,5) y recortados a 1-99. */
  function bossSt(o, style, r) {
    var S = BOSS_STYLES[style] || BOSS_STYLES.saque, G = engineGenSt(), st = G(o, S.base, r), ks = Object.keys(st), k, i, it;
    for (i = 0; i < ks.length; i++) { k = ks[i]; st[k] = st[k] + (S.d[k] || 0); }
    // recentrar: se reparte la diferencia entre los que no están en el tope (unas pocas pasadas bastan)
    for (it = 0; it < 6; it++) {
      var sum = 0, free = 0;
      for (i = 0; i < ks.length; i++) { k = ks[i]; st[k] = clamp(st[k], 1, 99); sum += st[k]; }
      var d = o - sum / ks.length; if (Math.abs(d) < 0.05) break;
      for (i = 0; i < ks.length; i++) { k = ks[i]; if ((d > 0 && st[k] < 99) || (d < 0 && st[k] > 1)) free++; }
      if (!free) break;
      for (i = 0; i < ks.length; i++) { k = ks[i]; if ((d > 0 && st[k] < 99) || (d < 0 && st[k] > 1)) st[k] += d * ks.length / free; }
    }
    for (i = 0; i < ks.length; i++) { k = ks[i]; st[k] = clamp(Math.round(st[k]), 1, 99); }
    return st;
  }
  /** Clave del circuito de la carrera c ('b0'…'b4'); '' en la pista (fase 2) o sin club. */
  function bossKey(c) { return c && !hall(c) && c.myClub >= 0 && K(c).myClub(c) ? 'b' + lvlOf(c) : ''; }
  /** Club más fuerte de la liga lvl sin el tuyo ni el de tu rival personal (null si no hay). */
  function bossClub(c, lvl) {
    var E = K(c), l = c.life, rv = l && l.rival ? l.rival.club : -1;
    var pool = (E.clubsOf ? E.clubsOf(c, lvl) : []).filter(function (k) { return k.id !== c.myClub && k.id !== rv; });
    pool.sort(function (a, b) { return E.clubOvr(b) - E.clubOvr(a) || a.id - b.id; });
    return pool[0] || null;
  }
  /** Estilo del circuito lvl: una permutación de los 4 estilos por semilla (los 4 primeros circuitos, distintos; el 5º repite el 1º). */
  function bossStyleAt(c, lvl) {
    var r = rngOf(c.seed, 'bossperm'), p = BOSS_KEYS.slice();
    for (var i = p.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
    return p[(lvl | 0) % 4];
  }
  /** Crea o repasa el jefe de tu circuito (club que ya no vale → el más fuerte; reclub = true: se recoloca siempre, en verano). */
  function ensureBoss(c, reclub) {
    var key = bossKey(c); if (!key) return null;
    var l = ensure(c), E = K(c), lvl = lvlOf(c), b = l.boss[key];
    if (b && (typeof b !== 'object' || !BOSS_STYLES[b.style] || typeof b.name !== 'string')) b = null;   // dañado: se regenera igual (misma semilla)
    if (!b) {
      var r = rngOf(c.seed, 'boss', key), k0 = bossClub(c, lvl); if (!k0) return null;
      var style = bossStyleAt(c, lvl), S = BOSS_STYLES[style];
      var name = E._name ? E._name(r) : E._newMate ? E._newMate(c, k0, r).name : 'Jefe';
      var used = [c.player && c.player.num, c.mate && c.mate.num, l.rival && l.rival.num, 9, 13], num;
      var guard = 0; do { num = 1 + Math.floor(r() * 20); } while (used.indexOf(num) >= 0 && guard++ < 50);
      b = l.boss[key] = { k: key, name: name, nick: pick(r, S.nicks), style: style, num: num, club: k0.id, w: 0, l: 0, beat: 0, seen: 0 };
      return b;
    }
    var rv = l.rival ? l.rival.club : -1, kb = E.club(c, b.club);
    if (reclub || !kb || (kb.lvl | 0) !== lvl || b.club === c.myClub || b.club === rv) { var k1 = bossClub(c, lvl); if (k1) b.club = k1.id; }
    ['w', 'l', 'beat', 'seen', 'num'].forEach(function (x) { if (!(+b[x] >= 0)) b[x] = 0; });
    return b;
  }
  /** Jefe de tu circuito (o null: pista, sin club o sin liga). */
  function boss(c) { c = c || (K() && K().get && K().get()); try { return c ? ensureBoss(c) : null; } catch (e) { return null; } }
  function bossOf(c, key) { var l = c && c.life; return l && l.boss && l.boss[key] || null; }
  /** Jefe si el partido f / próximo partido n es contra su club (null si no). */
  function bossFor(c, rivalId) { var b = boss(c); return b && rivalId != null && b.club === rivalId ? b : null; }
  /** {estilo: 1} de los jefes ya tumbados jugando en la carrera c (para VB.Look: desbloqueo {boss: estilo}). */
  function bossBeaten(c) {
    c = c || (K() && K().get && K().get()); var out = {}, l = c && c.life;
    if (l && l.boss) Object.keys(l.boss).forEach(function (k) { var b = l.boss[k]; if (b && b.beat > 0 && BOSS_STYLES[b.style]) out[b.style] = 1; });
    return out;
  }
  /** Ficha del jefe para la UI y el partido: {name, nick, style, styleName, hint, num, club, h2h:[j, g, p], w, l, beat, first, item}. */
  function bossInfo(c, b) {
    var S = BOSS_STYLES[b.style];
    return { name: b.name, nick: b.nick, style: b.style, styleName: S.name, hint: S.hint, num: b.num, club: b.club, h2h: [b.w + b.l, b.w, b.l], w: b.w, l: b.l, beat: b.beat, first: !b.beat, item: bossItemName(c, b.style) };
  }
  /** Objeto de Vestuario de un estilo (desbloqueo {boss: estilo}); en la Carrera de playa, el de playa o de las dos sedes. */
  function bossItem(c, style) {
    var X = LK(); if (!X) return null;
    var want = hall(c) ? 'P' : 'Y', best = null, bs = -1;
    X.CATALOG.forEach(function (x) {
      if (!x || typeof x.id !== 'string') return;
      if (!unlocksOf(x).some(function (u) { return u && u.boss === style; })) return;
      var v = x.venue === 'P' || x.venue === 'Y' ? x.venue : 'A', s = v === want ? 2 : v === 'A' ? 1 : 0;   // su sede > las dos > la otra
      if (s > bs) { best = x; bs = s; }
    });
    return best;
  }
  function bossItemsOf(X, style) {
    var a = null; try { a = X.bossItems ? X.bossItems(style) : null; } catch (e) { a = null; }
    if (Array.isArray(a)) return a.filter(function (id) { return typeof id === 'string'; });
    return X.CATALOG.filter(function (x) { return x && typeof x.id === 'string' && unlocksOf(x).some(function (u) { return u && u.boss === style; }); }).map(function (x) { return x.id; });
  }
  function bossItemName(c, style) { var X = LK(), x = bossItem(c, style); return x ? lookName(X, x) : X ? BOSS_STYLES[style].item : ''; }
  /** Personalidad, firma y rabia del compañero en pista (players setMate): {num, pers, sig, rage}; null en la pista o sin compañero. */
  function mateAnim(c) {
    c = c || (K() && K().get && K().get()); if (!c || hall(c) || !c.mate) return null;
    var a = MATE_ANIM[c.mate.style]; if (!a) return null;
    return { num: c.mate.num | 0, pers: a[0], sig: a[1], rage: a[2] };
  }
  /** Gestos del jefe (players setBoss, sin idx/num/fit): {pers, style, sig, rage}. */
  function bossAnim(style) { var S = BOSS_STYLES[style]; return S ? { pers: 'fuego', style: style, sig: S.celeb, rage: S.rage } : null; }
  /** Fin de partido contra el jefe: cara a cara (también simulado) y, la 1ª victoria JUGADA, recompensa. Devuelve out.boss o null. */
  function bossAfter(c, sum, L) {
    if (hall(c) || sum.bench) return null;
    var b = bossFor(c, sum.rival); if (!b) return null;
    if (sum.win) b.w++; else b.l++;
    var first = false, fans = 0;
    if (sum.win && !sum.sim && !b.beat) {
      first = true; b.beat = c.season | 0 || 1;
      var l = c.life; l.bossW = Object.keys(l.boss).filter(function (k) { return l.boss[k] && l.boss[k].beat > 0; }).length;
      var X = LK(), x = bossItem(c, b.style), got = '';
      if (X && x) {
        // todos los objetos de ese estilo (defensa: rodilleras de pista y tobillera de playa); el aviso nombra el de tu sede
        bossItemsOf(X, b.style).forEach(function (id) {
          var own = false; try { own = !!X.owned(id); } catch (e) { own = true; }
          if (!own) { try { if (X.grant(id, 'boss') !== true && !X.owned(id)) X.grant(id, 'carrera'); } catch (e) { } }
        });
        got = lookName(X, x);
      }
      var k = K(c).club(c, b.club), Lg = leagueOf(c);
      K(c)._msg(c, 'boss', 'Has tumbado a ' + b.nick, b.name + ' (' + (k ? k.name : '') + ') era el jefe ' + deL(Lg) + '.' + (got ? ' Premio para tu vestuario: ' + got + '. Póntelo en Jugador › Vestuario.' : ''));
      try { if (VB.CareerWorld && VB.CareerWorld.newsBoss) VB.CareerWorld.newsBoss(c, b); } catch (e) { }
      fans = addFame(c, BOSS_FANS * LV_MULT[L]);   // (después del objeto: lookCheck de addFame ya lo encuentra en el inventario)
    }
    return { name: b.name, nick: b.nick, style: b.style, styleName: BOSS_STYLES[b.style].name, win: !!sum.win, w: b.w, l: b.l, h2h: [b.w + b.l, b.w, b.l], first: first, fans: fans };
  }

  // ------------------------------------------------------------------ química con nombre (S3 C5)
  // Niveles alineados con el bonus de career.js (chemBonus = min(3, floor(chem/30))): no cambia ninguna mecánica.
  var CHEM_LV = [[0, 'Conocidos'], [30, 'Buena sintonía'], [60, 'Compenetrados'], [90, 'Pareja de oro']];
  var CHEM_LV6 = ['Vestuario nuevo', 'Buen ambiente', 'Bloque sólido', 'Equipo de oro'];
  var CHEM_UP = [null,
    ['Con {mate} ya os entendéis sin hablar: +1 en reacción, colocación y recepción para los dos.', 'El vestuario empieza a funcionar: +1 en reacción, colocación y recepción para todo el equipo.'],
    ['{mate} y tú os buscáis sin mirar: +2 en reacción, colocación y recepción. En los puntos grandes lo celebraréis a vuestra manera.', 'Os movéis como un bloque: +2 en reacción, colocación y recepción para todo el equipo.'],
    ['Sois la pareja que todos quieren evitar: +3 en reacción, colocación y recepción, y un saludo que ya imitan en la grada.', 'Nadie quiere cruzarse con vosotros: +3 en reacción, colocación y recepción para todo el equipo.']];
  /** Química actual de la carrera c (la de la pareja en la playa, la del equipo en la pista). */
  function chemNow(c) { return clamp(hall(c) ? +c.chem || 0 : c && c.mate ? +c.mate.chem || 0 : 0, 0, 100); }
  /** Nivel 0-3 de una química v (número) o de la carrera c (objeto). */
  function chemLevel(v) { if (v && typeof v === 'object') v = chemNow(v); return Math.min(3, Math.floor(clamp(+v || 0, 0, 100) / 30)); }
  function chemName(lv, c) { lv = clamp(lv | 0, 0, 3); return hall(c) ? CHEM_LV6[lv] : CHEM_LV[lv][1]; }
  /** {v, lv, name, next, need, bonus, hall}: next = nombre del siguiente nivel ('' en el máximo), need = puntos que faltan. */
  function chemInfo(c) {
    var v = Math.round(chemNow(c)), lv = chemLevel(v), H6 = hall(c);
    return { v: v, lv: lv, name: chemName(lv, c), next: lv < 3 ? chemName(lv + 1, c) : '', need: lv < 3 ? CHEM_LV[lv + 1][0] - v : 0, bonus: lv, hall: H6 };
  }
  /** Compara el nivel de química con el último avisado. Al subir: mensaje 'chem' y (playa, nivel ≥ 2) chemEv para la decisión
   *  pairSign. Al bajar: se apunta sin aviso (volver a subir avisa otra vez). {lv, name, up} o null (sin química). */
  function chemCheck(c) {
    var l = ensure(c); if (!l) return null;
    var H6 = hall(c), o = H6 ? c : c.mate; if (!o) return null;
    if (Array.isArray(c.squad)) c.squad.forEach(function (p) { if (p && typeof p === 'object' && !(p.chemLv >= 0)) p.chemLv = chemLevel(p.chem); });
    var lv = chemLevel(c), up = lv > (o.chemLv | 0);
    if (lv !== (o.chemLv | 0)) o.chemLv = lv;
    if (up) {
      var name = chemName(lv, c), txt = CHEM_UP[lv][H6 ? 1 : 0].replace('{mate}', c.mate ? c.mate.name : 'Tu compañero');
      K(c)._msg(c, 'chem', 'Química: ' + name, txt);
      if (!H6 && lv >= 2) l.chemEv = lv;
      lookCheck(c);   // Vestuario: lo que se desbloquea con la química ({chem: n})
    }
    return { lv: lv, name: chemName(lv, c), up: up };
  }

  // ------------------------------------------------------------------ ganchos de career.js
  /** Tras cada jornada tuya (jugada, simulada o en el banquillo). f = partido, sum = resumen (se le añade sum.life). */
  function afterMatch(c, sum, f) {
    var l = ensure(c), L = lvlOf(c), out = { fans: 0, money: 0, xp: 0, ch: null, ach: [], duel: null };
    l.jN++;
    var chemEv0 = l.chemEv;   // (nivel alcanzado en una jornada ANTERIOR o en una decisión: pairSign sale en esta)
    // el reto y el duelo, con el rival de ANTES del partido (el que se enseñó en la tarjeta y en g.career.goal)
    var ch = sum.bench ? null : challengeAt(c, sum.season, sum.phase, f, sum.rival), rv0 = l.rival;
    // rival: se crea en tu primera jornada en una liga (o al cambiar de liga)
    ensureRival(c);
    if (!sum.bench) {
      // racha
      if (sum.win) { l.streak++; l.best = Math.max(l.best, l.streak); } else l.streak = 0;
      if (sum.nota != null && !sum.sim) l.bestNota = Math.max(l.bestNota, sum.nota);
      // seguidores por el partido (simulado: un tercio; nadie lo ha visto)
      var base = Math.max(0, (sum.nota - 5.5)) * 22 + (sum.win ? 18 : 0) + (isKO(sum.phase) ? 30 : 0);
      // pista con cambios: si jugaste solo una parte de los puntos (sum.part.share), la fama del partido escala con ella (mínimo 0,35)
      var shf = sum.part && sum.part.share < 1 ? Math.max(0.35, +sum.part.share || 0) : 1;
      var fans = Math.round(base * LV_MULT[L] * (sum.sim ? 0.33 : 1) * (1 + 0.05 * Math.min(l.streak, 6)) * shf);
      if (!sum.sim && sum.nota < 5) fans = -Math.round(l.fame * 0.02 * shf);
      out.fans += addFame(c, fans);
      // reto de la jornada (solo jugando)
      if (!sum.sim) {
        l.chTried++;
        var ok = chOk(ch, sum.me || {}, { sets: sum.sets }, sum.nota);
        out.ch = { txt: ch.txt, ok: ok, prog: chProgress(ch, sum.me || {}, { sets: sum.sets }, sum.nota), duel: ch.duel };
        if (ok) {
          l.chDone++;
          out.fans += addFame(c, ch.fans);
          c.money = Math.round((+c.money || 0) + ch.money); out.money += ch.money; l.earned += ch.money;
          var lv = K(c)._addXP(c.player, ch.xp); out.xp = ch.xp;
          c.player.matches = Math.max(0, (c.player.matches | 0) - 1);   // (addXP cuenta un partido: el reto no lo es)
          if (lv && lv.lvlUp) { sum.lvlUp = (sum.lvlUp | 0) + lv.lvlUp; sum.lvl = lv.lvl; sum.ptsGained = (sum.ptsGained | 0) + lv.pts; }
          sum.xp = (sum.xp | 0) + ch.xp;
        }
      }
      // duelo con tu rival
      if (ch.duel && rv0) { if (sum.win) { rv0.w++; l.duelW++; } else { rv0.l++; l.duelL++; } out.duel = { name: rv0.name, win: sum.win, w: rv0.w, l: rv0.l }; }
      if (l.hurt && !sum.sim) l.hurt = 0;
      // jefe del circuito: cara a cara y, la 1ª victoria jugada, objeto, seguidores, bandeja y noticia
      var bo = bossAfter(c, sum, L); if (bo) { out.boss = bo; out.fans += bo.fans; }
    }
    ensureBoss(c);   // (crea el de un circuito nuevo o un guardado antiguo; deterministas)
    // patrocinador y servicios (cada jornada, también en el banquillo)
    if (l.sponsor) { c.money = Math.round((+c.money || 0) + l.sponsor.pay); out.money += l.sponsor.pay; l.earned += l.sponsor.pay; }
    SVC_KEYS.forEach(function (id) {
      if (!l.svc[id]) return;
      var cost = svcCost(c, id);
      if ((+c.money || 0) < cost) { delete l.svc[id]; K(c)._msg(c, 'fans', 'Sin dinero: ' + SVC[id].name, 'No te llega para pagar ' + SVC[id].name.toLowerCase() + ' (' + eur(cost) + ' por jornada). Se cancela.'); return; }
      c.money = Math.round(c.money - cost); l.spent += cost; out.money -= cost;
      if (id === 'coach' && c.tp) addTp(c, trainGroup(c), c.train === 'rest' ? 0 : c.train === 'bal' ? 8 : 25);
      if (id === 'nutri') c.fatigue = clamp((c.fatigue | 0) - 5, 0, 100);
    });
    var cu = chemCheck(c); if (cu && cu.up) out.chemUp = { lv: cu.lv, name: cu.name };
    maybeEvent(c, sum, chemEv0 > 0);
    try { cardsAfter(c, l, sum, L, out); rivWeek(c, l); } catch (e) { try { console.error('CareerLife cards', e); } catch (e2) { } }
    out.ach = check(c).map(function (a) { return achName(a, c); });
    sum.life = out;
  }
  // ------------------------------------------------------------------ tarjetas (ambiente de Carrera, notes/ambiente.md §2C)
  // c.life.cards = {s: temporada, y, r (tuyas en la temporada), n (partidos con ambiente), tm (de tu equipo), tot:{y, r}, fair (premios),
  // warn (temporada del aviso del comité)}. Solo lo llenan los partidos jugados con «Ambiente de Carrera» encendido (sum.amb).
  var CARD_FAME = 0.03, FAIR_FANS = 120, COMITE_R = 3, FAIR_MIN = 5;
  function cardsOf(c) {
    var l = ensure(c), k = l.cards;
    if (!k || typeof k !== 'object' || Array.isArray(k)) k = l.cards = { s: c.season | 0, y: 0, r: 0, n: 0, tm: 0, tot: { y: 0, r: 0 }, fair: 0, warn: 0 };
    ['s', 'y', 'r', 'n', 'tm', 'fair', 'warn'].forEach(function (x) { if (!(+k[x] >= 0)) k[x] = 0; });
    if (!k.tot || typeof k.tot !== 'object') k.tot = { y: 0, r: 0 };
    k.tot.y = k.tot.y | 0; k.tot.r = k.tot.r | 0;
    return k;
  }
  /** Mensaje de la semana (una vez por partido): derbi (pista), revancha o cumbre del PRÓXIMO partido (career.js ambCtx). Solo lee el
   *  núcleo de la Carrera (ciudad, tabla, c.notes): igual con o sin career-world.js. l.rivMsg = el último enviado. */
  function rivWeek(c, l) {
    var F = VB.Career; if (!F || !F.ambCtx || c.phase === 'off' || c.phase === 'pick') return;
    var S = VB.ctx && VB.ctx.settings; if (S && S.ambient === 'off') return;   // («Apagado»: la Carrera, como antes)
    var n = null; try { n = K(c).next(c); } catch (e) { n = null; }
    if (!n || !n.rival || n.bench) return;
    var a = F.ambCtx(c, n, null); if (!a || !a.tags) return;
    var key = (c.season | 0) + ':' + c.phase + ':' + (n.week | 0) + ':' + (n.round | 0) + ':' + n.rival.id;
    if (l.rivMsg === key) return;
    var rn = n.rival.name, t = '', x = '';
    // derbi y revancha traen su mensaje de la semana desde career-story (preDerby / preRev); aquí solo la cumbre, y siempre igual
    // con o sin los ficheros story (storytest compara la Carrera con y sin ellos)
    if (a.tags.indexOf('cumbre') >= 0) { t = 'Partido en la cumbre'; x = rn + ' y tu equipo, arriba del todo. El próximo es de los que deciden la temporada.'; }
    if (!t) return;
    l.rivMsg = key;
    K(c)._msg(c, 'coach', t, x);
  }
  function cardsAfter(c, l, sum, L, out) {
    var a = sum && sum.amb; if (!a || sum.bench || sum.sim) return;
    var k = cardsOf(c);
    if ((k.s | 0) !== (sum.season | 0)) { k.s = sum.season | 0; k.y = 0; k.r = 0; k.n = 0; k.tm = 0; }
    k.n++;
    var my = a.myY | 0, mr = a.myR | 0, tm = (a.cards || []).filter(function (x) { return x.team === 0; }).length;
    k.y += my; k.r += mr; k.tot.y += my; k.tot.r += mr; k.tm += tm;
    out.cards = { y: my, r: mr, team: tm };
    if (mr) {
      out.fans += addFame(c, -Math.max(20, Math.round(l.fame * CARD_FAME)));
      K(c)._msg(c, 'coach', 'Tarjeta roja', 'El entrenador no quiere más protestas: «Una roja regala un punto. Cabeza fría y a jugar».');
      if (k.r >= COMITE_R && (k.warn | 0) !== (sum.season | 0)) {
        k.warn = sum.season | 0;
        K(c)._msg(c, 'coach', 'Aviso del comité', 'Llevas ' + k.r + ' tarjetas rojas esta temporada. El comité de competición te avisa: una más y estudiará tu caso.');
      }
    }
    // temporada cerrada con este partido: premio a la deportividad si no viste ninguna tarjeta (y jugaste con ambiente)
    if (sum.review && k.n >= FAIR_MIN && !k.y && !k.r) {
      k.fair++;
      out.fans += addFame(c, FAIR_FANS * LV_MULT[L]);
      K(c)._msg(c, 'fans', 'Premio a la deportividad', 'Toda la temporada sin una sola tarjeta. La liga te da el premio a la deportividad y la afición lo aplaude.');
      out.fair = true;
    }
  }
  /** Fin de temporada (después de career.js endSeason): premios, objetivo del patrocinador, títulos a fama, logros. */
  function seasonEnd(c) {
    var l = ensure(c), L = lvlOf(c), r = c.review || {};
    if (r.champion) addFame(c, 300 * LV_MULT[L]);
    if (r.cup === true) addFame(c, 150 * LV_MULT[L]);
    if (Array.isArray(r.cups)) r.cups.forEach(function (x) { if (x && x.champion === c.myClub) addFame(c, (x.kind === 'intl' ? 300 : 150) * LV_MULT[L]); });   // (pista: copa nacional e internacionales)
    if (r.move > 0) addFame(c, 200 * LV_MULT[L]);
    var aw = seasonAwards(c);
    r.awards = aw.map(function (a) { return a.name; });
    lookCheck(c);   // Vestuario: lo que dan los premios recién entregados (p. ej. el MVP)
    if (l.sponsor && l.sponsor.season <= c.season && !l.sponsor.done) {
      var got = sponsorProgress(c), s = l.sponsor;
      if (got >= s.goal.n) { c.money = Math.round((+c.money || 0) + s.goal.bonus); l.earned += s.goal.bonus; K(c)._msg(c, 'fans', 'Bonus de ' + s.name, 'Has cumplido el objetivo (' + s.goal.txt + '): ' + eur(s.goal.bonus) + ' para ti.'); r.spBonus = s.goal.bonus; }
      else K(c)._msg(c, 'fans', s.name + ': objetivo no cumplido', 'Te quedaste en ' + got + ' de ' + s.goal.n + ' (' + s.goal.txt + '). Sin bonus esta vez.');
      l.spDone = 1; l.sponsor.done = 1;   // los patrocinios son por temporada: se va en verano (seasonStart); el último partido aún cobra
    }
    r.fans = Math.round(l.fame); r.legacy = legacyScore(c);
    check(c);
  }
  /** Temporada nueva (después de career.js newSeason): edad, patrocinios, rival. */
  function seasonStart(c) {
    var l = ensure(c);
    ageing(c);
    l.scout = 0; l.hurt = 0; l.streak = l.streak | 0;
    if (l.sponsor && (l.sponsor.done || l.sponsor.season < c.season)) l.sponsor = null;
    if (tierOf(c) >= 1) sponsorOffers(c, 'season');
    ensureRival(c);
    ensureBoss(c, true);   // el jefe juega en el club más fuerte de su liga ESTA temporada
    chemCheck(c);   // (verano de la pista ×0,6 o compañero nuevo: si baja, se apunta sin aviso)
  }
  /** matchSetup: material (+ a dos atributos por pieza y nivel) y molestias (−2 a todo). Solo en el partido. */
  function setup(c, m) {
    var l = ensure(c), ix = m && m.format === '6v6' ? m.ctrlIdx | 0 : 0;   // (pista: tu jugador va en tu hueco de la rotación, ctrlIdx)
    // pista empezando en el banquillo (titularidad, 13-nov-2026): tu jugador va en bench[0][meBench]
    var bst = m && m.meOn === false && m.bench && m.bench[0] && m.bench[0][m.meBench | 0] ? m.bench[0][m.meBench | 0].st : null;
    if (!l || !m || (!bst && (!m.attrs || !m.attrs[0] || !m.attrs[0][ix]))) return;
    var st = bst || m.attrs[0][ix], gb = gearBonus(c), hurt = l.hurt ? 2 : 0;
    Object.keys(st).forEach(function (k) { st[k] = clamp(Math.round(st[k] + (gb[k] | 0) - hurt), 1, 99); });
    m.gear = gb; m.hurt = hurt;
    var ch = challenge(c); if (ch && m.career) { m.career.goal = ch.txt; m.career.duel = ch.duel; }
    // E2: dorsal del rival personal solo en el duelo (main.js lo pasa a nums[1] y a Players.setRival)
    if (ch && ch.duel && m.career && l.rival && l.rival.num >= 0) m.career.rivalNum = l.rival.num | 0;
    setupExtra(c, m, l, ch);
  }
  /** S3 (al FINAL de setup, sin tocar lo de arriba): jefe del circuito (playa), estilo del rival en el duelo, química y gestos.
   *  Sin jefe ni duelo, m.attrs/m.badges quedan exactamente como antes. */
  function setupExtra(c, m, l, ch) {
    var cs = m.career, n = null;
    try { n = K(c).next(c); } catch (e) { n = null; }
    if (!hall(c) && n && n.rival && m.attrs && m.attrs[1] && m.attrs[1][0]) {
      var b = bossFor(c, n.rival.id), r;
      if (b) {
        r = rngOf(c.seed, 'bossm', c.season, n.week | 0, n.round | 0);
        m.attrs[1][0] = bossSt(clamp((n.ovrRival | 0) + BOSS_UP, 1, 99), b.style, r);
        m.badges = m.badges || [null, null]; m.badges[1] = [copyObj(BOSS_STYLES[b.style].badges), null];
        if (cs) {
          var bi = bossInfo(c, b), an = bossAnim(b.style), fit = null;
          cs.boss = { name: bi.name, nick: bi.nick, style: bi.style, styleName: bi.styleName, hint: bi.hint, num: bi.num, h2h: bi.h2h, w: bi.w, l: bi.l, first: bi.first, item: bi.item };
          cs.bossNum = bi.num;
          try { fit = VB.Look && VB.Look.bossFit ? VB.Look.bossFit(b.style, hashName(b.name)) || null : null; } catch (e) { fit = null; }
          cs.bossAnim = { idx: 0, num: bi.num, fit: fit, style: b.style, pers: an.pers, sig: an.sig, rage: an.rage };
        }
      } else if (ch && ch.duel && l.rival && BOSS_STYLES[l.rival.style]) {
        // tu rival en el duelo: su estilo con RIVAL_UP y las insignias del estilo a nivel 1 (gestos: pique y rabia de siempre)
        r = rngOf(c.seed, 'rivalm', c.season, n.week | 0, n.round | 0);
        m.attrs[1][0] = bossSt(clamp((n.ovrRival | 0) + RIVAL_UP, 1, 99), l.rival.style, r);
        var b1 = {}; Object.keys(BOSS_STYLES[l.rival.style].badges).forEach(function (k) { b1[k] = 1; });
        m.badges = m.badges || [null, null]; m.badges[1] = [b1, null];
        if (cs) cs.rivalStyle = l.rival.style;
      }
    }
    if (cs) {
      var ci = chemInfo(c);
      cs.chemLv = ci.lv; cs.chemName = ci.name; cs.pairSign = l.sign;
      if (cs.rivalNum != null && l.rival) cs.rivalP = l.rival.name;
      cs.mateAnim = mateAnim(c);
    }
  }
  function copyObj(o) { var x = {}; for (var k in o) x[k] = o[k]; return x; }
  function hashName(s) { return Math.floor(rngOf('bossfit', String(s || ''))() * 4294967296) >>> 0; }
  function onCreate(c) { var f = legacyStart(); var l = ensure(c); if (f) { l.fame = l.fameMax = f; } initLook(c); lookCheck(c); }
  function hook(c, kind, a, b) {
    if (!c) return;
    if (kind === 'match') afterMatch(c, a, b);
    else if (kind === 'season') seasonEnd(c);
    else if (kind === 'newSeason') seasonStart(c);
    else if (kind === 'setup') setup(c, a);
    else if (kind === 'create') onCreate(c);
  }

  VB.CareerLife = {
    hook: hook, ensure: ensure, TIERS: TIERS, fameInfo: fameInfo, tierName: tierName, offerBonus: offerBonus, addFame: addFame,
    challenge: challenge, challengeAt: challengeAt, CH: CH, CH6: CH6, ptsF: ptsF, lvlOf: lvlOf,
    sponsorOffers: sponsorOffers, signSponsor: signSponsor, declineSponsors: declineSponsors, sponsorProgress: sponsorProgress, SPONSORS: SPONSORS, SPONSORS6: SPONSORS6, SP_GOALS6: SP_GOALS6, seasonWeeks: seasonWeeks,
    GEAR: GEAR, GEAR_KEYS: GEAR_KEYS, GEAR_MAX: GEAR_MAX, gearName: gearName, gearPrice: gearPrice, buyGear: buyGear, gearBonus: gearBonus,
    SVC: SVC, SVC_KEYS: SVC_KEYS, svcCost: svcCost, toggleSvc: toggleSvc,
    rivalOvr: rivalOvr, pendingEvent: pendingEvent, answer: answer, EVENTS: EVENTS,
    applyEff: applyEff, effHint: effHint,   // (career-story.js: efectos de las elecciones y lo que enseña cada botón)
    achList: achList, check: check, AWARDS: AWARDS,
    legacyScore: legacyScore, legacyTier: legacyTier, canRetire: canRetire, retire: retire, legends: legends, RETIRE_AGE: RETIRE_AGE, DECLINE_AGE: DECLINE_AGE,
    eur: eur, num: num,
    CELEB_DEF: CELEB_DEF, celebs: celebs, setCeleb: setCeleb, signatureNow: signatureNow,
    initLook: initLook, lookCheck: lookCheck, lookShop: lookShop, buyLook: buyLook, setLook: setLook, lookNow: lookNow, achName: achNameOf,
    // sprint 2-4: jefes del circuito (C3), química con nombre (C5), logros para el álbum (D2)
    BOSS_STYLES: BOSS_STYLES, BOSS_KEYS: BOSS_KEYS, BOSS_UP: BOSS_UP, RIVAL_UP: RIVAL_UP, BOSS_FANS: BOSS_FANS, MATE_ANIM: MATE_ANIM,
    boss: boss, bossOf: bossOf, bossFor: bossFor, bossSt: bossSt, bossInfo: bossInfo, bossBeaten: bossBeaten, bossKey: bossKey, bossItem: bossItem, ensureBoss: ensureBoss,
    mateAnim: mateAnim, bossAnim: bossAnim, rivalStyleOf: rivalStyleOf,
    CHEM_LV: CHEM_LV, CHEM_LV6: CHEM_LV6, chemLevel: chemLevel, chemInfo: chemInfo, chemName: chemName, chemCheck: chemCheck,
    ACH_INFO: ACH_INFO,
    // ambiente de Carrera: tarjetas de la temporada y de la carrera
    cardsOf: cardsOf, CARD_FAME: CARD_FAME, FAIR_FANS: FAIR_FANS, COMITE_R: COMITE_R, FAIR_MIN: FAIR_MIN
  };
})();
