/* MAKE THE CUT — js/career-story-week.js (owner: carrera)
 * «Carrera con vida» (sprint 1.13.0, notes/carrera-vida.md §2 S2, paquete P2): Tu semana, Ánimo, Forma y Pacto con el entrenador.
 * Subsistema de VB.CareerStory (API en la cabecera de js/career-story.js). Sin DOM al cargar (los pintores devuelven HTML).
 *
 *  - Tu semana: 3 cartas por jornada de liga o copa con rng(c,'st-week',nk), de una bolsa de 16 (pesos 6/3/1: común, poco común,
 *    rara); «Descansar en casa» siempre está; no se repiten las de la jornada anterior; se elige 1 o ninguna (la que no se elige
 *    caduca sin efecto). No sale en 'off' ni 'pick' ni con banquillo previsto (playa). Acción 'st-wk-<i>'. Cada 2 cartas, 1 estrella.
 *  - Ánimo 0-100 (empieza en 60): solo en c.story, sin efecto en el campo. Cambia en onMatch (victoria, derrota, racha, nota,
 *    banquillo, fatiga, promesa incumplida, pacto) y tiende a 60 (2 por jornada). Guarda el porqué de los 5 últimos cambios.
 *    Llaves: ≤ 30 abre «Necesitas desconectar» y ≥ 90 «Te ves imparable» (mensajes con respuesta, una vez cada 6 jornadas).
 *  - Forma: derivada (no se guarda), igual que myForm6 de career.js: clamp((media de las 3 últimas notas de c.notes − 6,5) × 2, ±3).
 *  - Pacto: el entrenador ofrece 3 (Fácil, Normal, Difícil) en la jornada 1 ('join', 'newSeason') y a mitad de liga (onMatch, al
 *    llegar a MID_WEEK o midWeek6), de un catálogo de 18 filtrado por puesto, con rng(c,'st-pact',season,blk,rol). Acción
 *    'st-pact-<i>'. Si no eliges, no hay pacto ni efecto. Cumplido: Entrenador +5/+8/+12 y 3 estrellas; fallado: −2/−4/−6 (fx).
 *    Los partidos simulados cuentan (la nota, a mitad de peso).
 *  - Estado (c.story): wk {k, o:[ids], pick, prev:[ids]}, wkN, mood/moodLog (del núcleo), pact {s, blk, id, goal, x, base, until,
 *    diff, st, got, n, sum, w}|null, pactOff {s, blk, k, until, exp, o:[{id, d, goal, x}]}|null, pactK, pactLog [{s, blk, id, d,
 *    st, t}] (6), brokenS.
 *  - Para otros paquetes: la carta «Entrevista en Radio Arena FM» deja la marca 'pressForce' (flag del núcleo) para que P1 saque
 *    prensa la jornada siguiente. Las estrellas salen por fx({star}) (sys.fx de P4 si existe; si no, s.starQ): P4 no debe volver a
 *    contar ni el pacto cumplido ni la carta de la semana.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (!VB.CareerStory || !VB.CareerStory.use) return;
  var S = VB.CareerStory;

  function isH(c) { return !!(c && c.mode === 'hall'); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  function dec(n) { return (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }
  function sdec(n) { var r = Math.round(n * 10) / 10; return (r > 0 ? '+' : r < 0 ? '−' : '') + dec(Math.abs(r)); }
  function pl(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function E(c) { return S.K(c); }
  function wkKey(c) { try { return E(c)._wkKey(c); } catch (e) { return 0; } }
  function myClub(c) { try { return c && c.myClub >= 0 ? E(c).myClub(c) : null; } catch (e) { return null; } }

  var MOOD0 = 60, MOOD_DRIFT = 2, LOG_MAX = 5, PLOG_MAX = 6;
  var MOOD_TR = [[25, 'Por los suelos'], [45, 'Sin chispa'], [70, 'Con la cabeza en su sitio'], [90, 'Con ganas'], [101, 'En una nube']];   // (sin -o/-a: describen a tu jugador)
  var DIFF = ['Fácil', 'Normal', 'Difícil'], P_OK = [5, 8, 12], P_KO = [-2, -4, -6], P_STAR = 3;
  var W_RAR = [6, 3, 1];   // común, poco común, rara

  // ------------------------------------------------------------------ cartas (bolsa de 16)
  // r: rareza (0/1/2) · only: 'beach'|'hall' · need(c): condición · t/th: título (playa/pista) · x/xh: texto · e: efectos (fx)
  var CARDS = [
    { id: 'rest', r: 0, t: 'Descansar en casa', x: ['Sofá, manta y nada de vóley. El cuerpo te lo agradece.', 'Móvil en silencio y una siesta larga. Mañana se vuelve a sudar.'], e: { fatigue: -10, mood: 5 } },
    { id: 'extra', r: 0, t: 'Entrenar extra con {mate}', x: ['Una hora más de arena para pulir lo que peor os sale.', 'Saques y recepciones hasta que se pone el sol.'],
      xh: ['Una hora más de pabellón para afinar los tiempos.', 'Colocaciones y remates hasta que apagan las luces.'], e: { chem: 5, fatigue: 6 } },
    { id: 'gente', r: 0, t: 'Comer con tu gente', x: ['Mesa larga, sobremesa más larga y nadie te pregunta por el último partido.', 'Te ponen el plato de siempre y te preguntan cuándo vuelves.'], e: { fam: 8, mood: 3 } },
    { id: 'video', r: 0, t: 'Vídeo de {rival}', x: ['Tres partidos enteros con la libreta al lado. Ya sabes hacia dónde atacan cuando se ponen nerviosos.', 'Pausa, rebobinar, pausa. Ese equipo tiene manías y las has apuntado todas.'], e: { tpDef: 20, coach: 2 } },
    { id: 'cafe', r: 0, t: 'Café con {agent}', x: ['Repasáis contratos, rumores y el calendario. Siempre trae galletas.', 'Te cuenta qué clubes preguntan por ti. Sin prisa, pero con planes.'], e: { ag: 8 } },
    { id: 'juegos', r: 0, t: 'Noche de juegos con {mate}', th: 'Noche de juegos con el vestuario', x: ['Juegos de mesa, pizza y piques que no tienen nada que ver con el vóley.', 'Se acaba tarde y con una revancha pendiente.'], e: { chem: 3, mood: 4 } },
    { id: 'fotos', r: 1, t: 'Sesión de fotos para {sponsor}', need: function (c) { return !!(c.life && c.life.sponsor); },
      x: ['Focos, ropa nueva y sonreír sin parar. Cansa más que un partido, pero se paga bien.', 'Te hacen saltar cuarenta veces delante de un fondo blanco.'], e: { money: 0.3, fatigue: 4 } },
    { id: 'clinic', r: 1, t: 'Clínic en tu antiguo club', x: ['Peques con los ojos muy abiertos y preguntas que no te esperas.', 'Enseñas a sacar a un grupo que no se cansa nunca.'], e: { fame: 0.03, fam: 4 } },
    { id: 'yoga', r: 1, t: 'Yoga en la orilla', th: 'Piscina de recuperación', x: ['Respirar, estirar y escuchar las olas. Las piernas lo notan.'], xh: ['Agua caliente, chorros y estiramientos. Las piernas lo notan.'], e: { fatigue: -15 } },
    { id: 'radio', r: 1, t: 'Entrevista en Radio Arena FM', x: ['Media hora en directo. La próxima jornada la prensa querrá más.', 'Te preguntan por todo. Habrá preguntas también tras el próximo partido.'], e: { fame: 0.04, press: 1 } },
    { id: 'cena', r: 1, only: 'hall', t: 'Cena con la plantilla', x: ['Mesa reservada para todo el equipo. Alguien acaba cantando.', 'La capitanía invita a postre. Hay buen ambiente.'], e: { chem: 6 } },
    { id: 'paseo', r: 1, t: 'Paseo por {ciudad}', x: ['Sin reloj y sin plan. Descubres una heladería nueva.', 'Callejeas sin rumbo y vuelves con la cabeza despejada.'], e: { mood: 6, fatigue: -4 } },
    { id: 'benefico', r: 2, t: 'Torneo benéfico 3x3 en la plaza', x: ['Medio barrio mirando, música y una causa bonita. Acabas con agujetas.', 'Juegas tres partidos seguidos al sol por una buena causa.'], e: { fame: 0.08, fatigue: 12, mood: 6 } },
    { id: 'pod', r: 2, t: 'La Pausa Técnica te invita al pódcast', x: ['Una hora de charla sin cortes. Se escucha más de lo que crees.', 'Te ríes mucho y cuentas alguna anécdota de vestuario.'], e: { fame: 0.06 } },
    { id: 'leyenda', r: 2, t: 'Clase con una leyenda del vóley', x: ['Una figura retirada de las de antes te corrige dos detalles que nadie había visto.', 'Una mañana con alguien que lo ganó todo hace años. Te llevas deberes.'], e: { train: 40 } },
    { id: 'visita', r: 2, t: 'Visita a tu primer club', x: ['Siguen las mismas redes rotas y la misma entrenadora de la cantera. Te emocionas.', 'Tu foto está en la pared del bar del club. Nadie te deja pagar.'], e: { mood: 10 } }
  ];
  var CARD = {}; CARDS.forEach(function (x) { CARD[x.id] = x; });

  // ------------------------------------------------------------------ pactos (catálogo de 18)
  // kind: forma de medir · stat: estadística de sum.me · roles: puestos (playa atk/uni/cr; pista OH/S/OPP/MB/L) · x: umbral por
  // dificultad · g(n, d, per): objetivo con n = partidos del tramo · t(p, hasta): texto
  var PER = {   // estadística por partido (playa; pista a 15 puntos, × ptsF), aproximada a lo medido en career-life CH y CH6
    atk: { kills: 12, aces: 2.5, blocks: 1.5, digs: 5 }, uni: { kills: 9, aces: 2.5, blocks: 1, digs: 9 }, cr: { kills: 4, aces: 2, digs: 12, assists: 10 },
    OH: { kills: 5.5, digs: 6, aces: 0.4 }, OPP: { kills: 5.5, blocks: 0.4, digs: 5 }, MB: { kills: 2.2, blocks: 0.8, aces: 0.4 }, S: { assists: 20, digs: 1.3 }, L: { digs: 7 }
  };
  var STAT_K = [0.45, 0.65, 0.85];
  function frac(n, d, a) { return Math.max(1, Math.min(n, Math.round(n * a[d]))); }
  function statG(st) { return function (n, d, per) { var v = st === 'pts' ? (per.kills || 0) + (per.aces || 0) + (per.blocks || 0) : per[st] || 0; return Math.max(1, Math.round(v * n * STAT_K[d])); }; }
  function statOk(st) { return function (per) { var v = st === 'pts' ? (per.kills || 0) + (per.aces || 0) + (per.blocks || 0) : per[st] || 0; return v >= 0.3; }; }
  var PACTS = [
    { id: 'avg', kind: 'avg', x: [6.2, 6.7, 7.2], g: function (n) { return Math.min(4, n); }, t: function (p) { return 'Media de ' + dec(p.x) + ' o más en tus próximos ' + pl(p.goal, 'partido', 'partidos'); } },
    { id: 'big', kind: 'nota', x: [7.8, 8.3, 8.8], g: function () { return 1; }, t: function (p, h) { return 'Un partido de ' + dec(p.x) + ' o más ' + h; } },
    { id: 'notaN', kind: 'nota', x: [7.3, 7.5, 7.7], g: function (n, d) { return frac(n, d, [0.2, 0.35, 0.5]); }, t: function (p, h) { return (p.goal === 1 ? 'Un partido' : p.goal + ' partidos') + ' de ' + dec(p.x) + ' o más ' + h; } },
    { id: 'won', kind: 'won', g: function (n, d) { return frac(n, d, [0.3, 0.5, 0.7]); }, t: function (p, h) { return 'Ganar ' + pl(p.goal, 'partido', 'partidos') + ' ' + h; } },
    { id: 'away', kind: 'away', g: function (n, d) { return frac(Math.max(1, Math.floor(n / 2)), d, [0.35, 0.6, 0.85]); }, t: function (p, h) { return 'Ganar ' + pl(p.goal, 'partido', 'partidos') + ' fuera de casa ' + h; } },
    { id: 'home', kind: 'home', g: function (n, d) { return frac(Math.max(1, Math.floor(n / 2)), d, [0.4, 0.65, 0.9]); }, t: function (p, h) { return 'Ganar ' + pl(p.goal, 'partido', 'partidos') + ' en casa ' + h; } },
    { id: 'streak', kind: 'streak', g: function (n, d) { return Math.min(n, [2, 3, 4][d]); }, t: function (p, h) { return (p.goal === 1 ? 'Ganar un partido ' : 'Encadenar ' + p.goal + ' victorias seguidas ') + h; } },
    { id: 'ch', kind: 'ch', need: function () { return !!VB.CareerLife; }, min: 4, g: function (n, d) { return Math.min(n, [1, 2, 3][d]); }, t: function (p, h) { return 'Cumplir ' + pl(p.goal, 'reto', 'retos') + ' de la jornada ' + h; } },
    { id: 'kills', kind: 'stat', stat: 'kills', g: statG('kills'), ok: statOk('kills'), t: function (p, h) { return pl(p.goal, 'remate punto', 'remates punto') + ' ' + h; } },
    { id: 'aces', kind: 'stat', stat: 'aces', g: statG('aces'), ok: statOk('aces'), t: function (p, h) { return pl(p.goal, 'ace', 'aces') + ' ' + h; } },
    { id: 'blocks', kind: 'stat', stat: 'blocks', g: statG('blocks'), ok: statOk('blocks'), t: function (p, h) { return pl(p.goal, 'bloqueo punto', 'bloqueos punto') + ' ' + h; } },
    { id: 'digs', kind: 'stat', stat: 'digs', g: statG('digs'), ok: statOk('digs'), t: function (p, h) { return pl(p.goal, 'defensa', 'defensas') + ' ' + h; } },
    { id: 'assists', kind: 'stat', stat: 'assists', g: statG('assists'), ok: statOk('assists'), t: function (p, h) { return pl(p.goal, 'asistencia', 'asistencias') + ' ' + h; } },
    { id: 'pts', kind: 'stat', stat: 'pts', g: statG('pts'), ok: statOk('pts'), t: function (p, h) { return pl(p.goal, 'punto tuyo', 'puntos tuyos') + ' (remate, ace o bloqueo) ' + h; } },
    { id: 'clean', kind: 'clean', g: function (n, d) { return Math.min(n, [1, 2, 3][d]); }, t: function (p, h) { return 'Ganar ' + pl(p.goal, 'partido', 'partidos') + ' sin ceder un set ' + h; } },
    { id: 'tidy', kind: 'tidy', g: function (n, d) { return Math.min(n, [2, 3, 4][d]); }, t: function (p, h) { return (p.goal === 1 ? 'Un partido' : p.goal + ' partidos') + ' con ' + pl(p.x, 'error', 'errores') + ' o menos ' + h; } },
    { id: 'play', kind: 'play', g: function (n, d) { return Math.min(n, [3, 5, 7][d]); }, t: function (p) { return p.goal === 1 ? 'Jugar el próximo partido sin pasar por el banquillo' : 'Jugar ' + p.goal + ' partidos seguidos sin pasar por el banquillo'; } },
    { id: 'fat', kind: 'fat', x: [75, 60, 45], g: function () { return 1; }, t: function (p, h) { return 'Acabar el tramo con la fatiga por debajo de ' + p.x + ' (' + h + ')'; } }
  ];
  var PACT = {}; PACTS.forEach(function (x) { PACT[x.id] = x; });

  // ------------------------------------------------------------------ plantillas del feed (sin respuesta salvo las del ánimo)
  var TPL = {
    wkPactOffer: { k: 'coach', t: ['Charla con {coach}', '{coach} quiere hablar contigo', 'Cinco minutos con {coach}'],
      x: ['{coach}: «Tengo tres retos para este tramo. Elige el que quieras, o ninguno: si no eliges, no pasa nada.» Están en Jugador › Estado.',
        '{coach}: «Quiero verte apretar. Te propongo tres pactos: uno fácil, uno normal y uno difícil.» Míralos en Jugador › Estado.',
        '{coach}: «Si te comprometes, yo también. Escoge un pacto para este tramo.» En Jugador › Estado.'],
      xh: ['{coach}, en el despacho del pabellón: «Tengo tres retos para este tramo. Elige uno o ninguno.» Están en Jugador › Estado.',
        '{coach}: «Quiero que el equipo te vea apretar. Fácil, normal o difícil: tú eliges.» En Jugador › Estado.'] },
    wkPactOk: { k: 'coach', t: ['Pacto cumplido', 'Lo prometido', 'Así me gusta'],
      x: ['{coach}: «Lo prometido. Así me gusta.» ({pacto})', '{coach}: «Dijiste que lo harías y lo has hecho. Eso no se olvida.» ({pacto})', '{coach}: «Pacto cumplido. Sigue por ahí.» ({pacto})'] },
    wkPactKo: { k: 'coach', t: ['Pacto fallado', 'No ha salido', 'Una charla pendiente'],
      x: ['{coach}: «Hablamos de esto y no ha salido. Ya sé que puedes más.» ({pacto})', '{coach}: «No pasa nada, pero lo apunto. La próxima, a por ello.» ({pacto})', '{coach}: «Esta vez no. Quiero verte reaccionar.» ({pacto})'] },
    wkMoodLow: { k: 'fam', t: ['Necesitas desconectar', 'Tu gente te ve con mala cara', 'Un respiro'],
      x: ['Tu gente: «Te notamos con la cabeza en otra parte. ¿Te vienes un día a casa y te olvidas del vóley?»', 'Tu gente: «Últimamente no sonríes ni cuando ganas. Para un día, de verdad.»', 'Tu gente: «Tienes cara de no dormir. Un día fuera de la pista no le hace daño a nadie.»'],
      o: [{ t: 'Desconectar', e: { fatigue: -10, coach: -1, mood: 5 }, why: 'Un día para desconectar' }, { t: 'Seguir', e: {}, why: 'Sigues a lo tuyo' }],
      c: ['Tu gente: «Vale. Aquí estaremos cuando quieras.»', 'Tu gente: «Bueno, otro día será.»'] },
    wkMoodHigh: { k: 'mate', t: ['Te ves imparable', 'En una nube', 'Nadie te para'],
      x: ['{mate}: «Estás que te sales. ¿Bajamos un poco el ritmo o seguimos a tope?»', '{mate}: «Te veo volar. Cuidado con pasarte de rosca.»', '{mate}: «Así da gusto. ¿Apretamos más o guardamos algo?»'],
      o: [{ t: 'Bajar el ritmo', e: { fatigue: -6, mood: -3 }, why: 'Prefieres no pasarte' }, { t: 'A tope', e: { train: 15, fatigue: 5 }, why: 'A tope mientras dure' }],
      c: ['{mate}: «Vale, ya lo hablamos.»', '{mate}: «Como quieras, seguimos.»'] }
  };

  // ------------------------------------------------------------------ estado
  function ensureS(s) {
    var w = s.wk;
    if (!obj(w) || !num(w.k)) w = s.wk = { k: -1, o: [], pick: -1, prev: [] };
    w.o = Array.isArray(w.o) ? w.o.filter(function (id) { return !!CARD[id]; }).slice(0, 3) : [];
    w.prev = Array.isArray(w.prev) ? w.prev.filter(function (id) { return !!CARD[id]; }).slice(0, 3) : [];
    w.pick = num(w.pick) && w.pick >= 0 && w.pick < w.o.length ? w.pick | 0 : -1;
    s.wkN = num(s.wkN) && s.wkN >= 0 ? s.wkN | 0 : 0;
    var p = s.pact;
    if (!obj(p) || !PACT[p.id] || p.st !== 'open') s.pact = null;
    else {
      ['s', 'blk', 'goal', 'base', 'until', 'diff', 'got', 'n', 'sum', 'w', 'x'].forEach(function (k) { p[k] = num(p[k]) ? p[k] : 0; });
      p.diff = clamp(p.diff | 0, 0, 2);
    }
    var o = s.pactOff;
    if (!obj(o) || !Array.isArray(o.o) || !o.o.length) s.pactOff = null;
    else { o.o = o.o.filter(function (x) { return obj(x) && PACT[x.id] && num(x.goal); }).slice(0, 3); if (!o.o.length) s.pactOff = null; else { o.exp = num(o.exp) ? o.exp : 0; o.s = o.s | 0; o.blk = o.blk | 0; o.until = o.until | 0; } }
    if (typeof s.pactK !== 'string') s.pactK = '';
    s.pactLog = Array.isArray(s.pactLog) ? s.pactLog.filter(function (x) { return obj(x) && typeof x.t === 'string'; }).slice(-PLOG_MAX) : [];
    s.brokenS = num(s.brokenS) ? s.brokenS | 0 : 0;
  }
  function St(c) { return S.ensure(c); }

  // ------------------------------------------------------------------ Forma (derivada, como myForm6)
  function formOf(c) {
    var n = c && Array.isArray(c.notes) ? c.notes : []; if (!n.length) return 0;
    var k = Math.min(3, n.length), s = 0; for (var i = n.length - k; i < n.length; i++) s += +n[i].nota || 0;
    return clamp((s / k - 6.5) * 2, -3, 3);
  }
  function formName(f) { return f >= 2 ? 'En racha' : f >= 0.5 ? 'Al alza' : f > -0.5 ? 'Normal' : f > -2 ? 'A la baja' : 'Sin chispa'; }

  // ------------------------------------------------------------------ Ánimo
  function moodName(m) { for (var i = 0; i < MOOD_TR.length; i++) if (m < MOOD_TR[i][0]) return MOOD_TR[i][1]; return MOOD_TR[MOOD_TR.length - 1][1]; }
  function moodAdd(s, d, t) {
    var m0 = s.mood; s.mood = clamp(Math.round(s.mood + d), 0, 100);
    if (s.mood !== m0) { s.moodLog.push({ d: s.mood - m0, t: t, mN: s.mN }); if (s.moodLog.length > LOG_MAX) s.moodLog = s.moodLog.slice(-LOG_MAX); }
  }
  function streakOf(c) {
    if (c.life && num(c.life.streak)) return c.life.streak | 0;
    var n = c.notes || [], k = 0; for (var i = n.length - 1; i >= 0 && n[i].win; i--) k++; return k;
  }
  /** Lo que la jornada hace al ánimo: [{d, t}] (sin la tendencia a 60). Puro. */
  function moodParts(c, s, sum) {
    var p = [];
    if (sum.bench) p.push({ d: -5, t: 'Banquillo' });
    else {
      p.push(sum.win ? { d: 3, t: 'Victoria' } : { d: -3, t: 'Derrota' });
      if (sum.win && streakOf(c) >= 3) p.push({ d: 1, t: 'Racha de ' + streakOf(c) });
      if (num(sum.nota) && sum.nota >= 7.5) p.push({ d: 3, t: 'Nota de ' + dec(sum.nota) });
      else if (num(sum.nota) && sum.nota < 5) p.push({ d: -4, t: 'Nota de ' + dec(sum.nota) });
    }
    if ((c.fatigue | 0) >= 70) p.push({ d: -2, t: 'Fatiga alta' });
    if (c.broken && c.broken === sum.season && s.brokenS !== sum.season) p.push({ d: -8, t: 'Promesa incumplida', broken: 1 });
    return p;
  }
  function moodMatch(c, s, sum) {
    var m0 = s.mood;
    // tendencia a 60 proporcional (un 20 % de la distancia, al menos MOOD_DRIFT): con victorias normales se asienta hacia 75 y solo
    // una racha de notazas lo sube a «En una nube» (antes se quedaba en 95-100 casi toda la temporada)
    var gap = MOOD0 - s.mood, pull = gap > 0 ? Math.max(MOOD_DRIFT, Math.round(gap * 0.2)) : gap < 0 ? -Math.max(MOOD_DRIFT, Math.round(-gap * 0.2)) : 0;
    s.mood = gap > 0 ? Math.min(MOOD0, s.mood + pull) : Math.max(MOOD0, s.mood + pull);
    var drift = s.mood - m0;
    s.mood = m0;
    var parts = moodParts(c, s, sum), d = drift, ts = [];
    parts.forEach(function (x) { d += x.d; ts.push(x.t); if (x.broken) s.brokenS = sum.season; });
    moodAdd(s, d, ts.length ? ts.map(function (t, i) { return i ? t.charAt(0).toLowerCase() + t.slice(1) : t; }).join(', ') : 'Vuelves a tu punto');
  }

  // ------------------------------------------------------------------ Tu semana
  function rivalNext(c) {
    try {
      var K = E(c), me = myClub(c); if (!me) return '';
      if (!isH(c)) { var n = K.next(c); return n && n.rival ? n.rival.name : ''; }
      if (c.phase !== 'league' || !K.sched) return '';
      var wk = K.sched(c, me.lid)[c.week]; if (!wk) return '';
      for (var i = 0; i < wk.length; i++) if (wk[i][0] === me.id || wk[i][1] === me.id) { var k = K.club(c, wk[i][0] === me.id ? wk[i][1] : wk[i][0]); return k ? k.name : ''; }
    } catch (e) { }
    return '';
  }
  /** ¿Hay carta esta jornada? Liga, copa o eliminatoria, con club y sin banquillo previsto (playa). Sin escrituras. */
  function weekOpen(c) {
    if (!c || c.phase === 'off' || c.phase === 'pick' || !(c.myClub >= 0) || !c.contract) return false;
    if (!isH(c)) { try { var n = E(c).next(c); if (!n || n.bench) return false; } catch (e) { return false; } }
    return true;
  }
  function cardOk(c, x) { return (!x.only || x.only === (isH(c) ? 'hall' : 'beach')) && (!x.need || x.need(c)); }
  /** Reparte las 3 cartas de la jornada k (determinista: rng 'st-week', k). prev = las de la jornada anterior. */
  function deal(c, k, prev) {
    var r = S.rng(c, 'st-week', k), pool = CARDS.filter(function (x) { return x.id !== 'rest' && cardOk(c, x); });
    var fresh = pool.filter(function (x) { return prev.indexOf(x.id) < 0; });
    if (fresh.length >= 2) pool = fresh;
    var out = [];
    for (var j = 0; j < 2 && pool.length; j++) {
      var tot = pool.reduce(function (a, x) { return a + W_RAR[x.r]; }, 0), u = r() * tot, i = 0;
      for (; i < pool.length - 1; i++) { u -= W_RAR[pool[i].r]; if (u < 0) break; }
      out.push(pool[i].id); pool.splice(i, 1);
    }
    out.splice(Math.floor(r() * (out.length + 1)), 0, 'rest');
    return out;
  }
  function refreshWeek(c, s, k) {
    if (s.wk.k === k) return;
    var prev = s.wk.o.length ? s.wk.o.slice() : s.wk.prev.slice();
    s.wk = { k: k, o: weekOpen(c) ? deal(c, k, prev) : [], pick: -1, prev: prev };
  }
  function cardsNow(c) { var s = c && c.story; if (!s || !s.wk || s.wk.k !== wkKey(c) || !s.wk.o.length) return null; return s.wk; }
  function cardVars(c) { var v = {}, rv = rivalNext(c); v.rival = rv || 'tu próximo rival'; if (isH(c)) v.mate = 'quien coloca'; return S.vars(c, v); }
  function fill(t, v) { return String(t == null ? '' : t).replace(/\{(\w+)\}/g, function (m, n) { return v[n] != null ? v[n] : ''; }).replace(/[{}]/g, '').replace(/ {2,}/g, ' ').trim(); }
  function pickV(c, a, key) { if (!Array.isArray(a)) return a || ''; var r = S.rng(c, 'st-wkv', key); return a[Math.floor(r() * a.length)] || ''; }
  function cardText(c, id, k) {
    var x = CARD[id], H = isH(c), v = cardVars(c);
    return { t: fill(H && x.th ? x.th : x.t, v), x: fill(pickV(c, H && x.xh ? x.xh : x.x, [k, id]), v) };
  }
  function cardEff(s, id) { var e = {}, src = CARD[id].e; for (var q in src) e[q] = src[q]; if ((s.wkN + 1) % 2 === 0) e.star = 1; return e; }
  function pickCard(c, i) {
    var s = St(c), w = cardsNow(c); if (!w || w.pick >= 0 || !(i >= 0 && i < w.o.length)) return null;
    var id = w.o[i], e = cardEff(s, id), res = S.fx(c, e, cardText(c, id, w.k).t);
    w.pick = i; s.wkN++;
    return res;
  }

  // ------------------------------------------------------------------ Pacto
  function roleOf(c) { try { return isH(c) ? E(c).ctrlRole(c) : c.player && c.player.roleKey || 'uni'; } catch (e) { return 'uni'; } }
  function weeksOf(c) { if (!isH(c)) return E(c).WEEKS || 14; var k = myClub(c); try { return k ? E(c).weeksOf(c, k.lid) : 0; } catch (e) { return 0; } }
  function midOf(c) { if (!isH(c)) return E(c).MID_WEEK || 7; try { return E(c).midWeek(c) | 0; } catch (e) { return 0; } }
  function hasta(c, p) { return p.blk === 1 ? 'antes de la jornada ' + (p.until + 1) : 'antes de que acabe la liga'; }
  function pactText(c, p) { var d = PACT[p.id]; return d ? d.t(p, hasta(c, p)) : ''; }
  /** Oferta del entrenador para el tramo blk (1: jornada 1 a la mitad; 2: de la mitad al final de la liga). */
  function offerPact(c, s, blk) {
    if (!c || c.phase !== 'league' || !(c.myClub >= 0) || !c.contract) return null;
    var k = myClub(c); if (!k) return null;
    var mid = midOf(c), wks = weeksOf(c), until = blk === 1 ? mid : wks, n = until - (c.week | 0);
    if (mid <= 0 || n < 2) return null;
    var key = (c.season | 0) + ':' + blk + ':' + k.id;
    if (s.pactK === key || (s.pact && s.pact.s === c.season && s.pact.blk === blk)) return null;
    var rol = roleOf(c), per = {}, base = PER[rol] || PER.uni, f = isH(c) && VB.CareerLife && VB.CareerLife.ptsF ? VB.CareerLife.ptsF(c) : 1;
    for (var q in base) per[q] = base[q] * f;
    var r = S.rng(c, 'st-pact', c.season | 0, blk, rol);
    var pool = PACTS.filter(function (d) { return (!d.need || d.need()) && (!d.ok || d.ok(per)) && !(d.min > n); });
    var o = [];
    for (var d = 0; d < 3 && pool.length; d++) {
      var j = Math.floor(r() * pool.length), x = pool.splice(j, 1)[0];
      var xv = x.id === 'tidy' ? (isH(c) ? 1 : 3) : x.x ? x.x[d] : 0;
      o.push({ id: x.id, d: d, goal: x.g(n, d, per), x: xv });
    }
    s.pactK = key;
    s.pactOff = { s: c.season | 0, blk: blk, k: key, until: until, exp: s.mN + S.EXP_DEF, o: o };
    S.post(c, { b: 'wkPactOffer', k: 'coach' });
    return s.pactOff;
  }
  function acceptPact(c, i) {
    var s = St(c), o = s.pactOff; if (!o || !o.o[i] || s.mN > o.exp || o.s !== (c.season | 0) || s.pact) return null;
    var x = o.o[i];
    s.pact = { s: o.s, blk: o.blk, id: x.id, goal: x.goal, x: x.x, base: s.mN, until: o.until, diff: x.d, st: 'open', got: 0, n: 0, sum: 0, w: 0 };
    s.pactOff = null;
    return ['Pacto ' + DIFF[x.d].toLowerCase() + ': ' + pactText(c, s.pact)];
  }
  /** Suma la jornada al pacto abierto (puro sobre c.story: nada del núcleo). */
  function pactStep(c, p, sum, f) {
    var d = PACT[p.id], played = !sum.bench && num(sum.nota), w = sum.sim ? 0.5 : 1, me = sum.me || {};
    var home = f && f.home != null ? f.home === c.myClub : null;
    switch (d.kind) {
      case 'avg': if (played) { p.n++; p.sum += sum.nota * w; p.w += w; p.got = p.n; } break;
      case 'nota': if (played) { p.n++; if (sum.nota >= p.x) p.got += w; } break;
      case 'won': if (played) { p.n++; if (sum.win) p.got++; } break;
      case 'away': if (played) { p.n++; if (sum.win && home === false) p.got++; } break;
      case 'home': if (played) { p.n++; if (sum.win && home === true) p.got++; } break;
      case 'streak': if (played) { p.n++; p.sum = sum.win ? p.sum + 1 : 0; p.got = Math.max(p.got, p.sum); } break;
      case 'ch': if (played && !sum.sim) { p.n++; if (sum.life && sum.life.ch && sum.life.ch.ok) p.got++; } break;
      case 'stat': if (played) { p.n++; p.got += d.stat === 'pts' ? (me.kills | 0) + (me.aces | 0) + (me.blocks | 0) : me[d.stat] | 0; } break;
      case 'clean': if (played) { p.n++; if (sum.win && sum.sets && sum.sets[1] === 0) p.got++; } break;
      case 'tidy': if (played) { p.n++; if ((me.errors | 0) <= p.x) p.got++; } break;
      case 'play': if (sum.bench) p.got = 0; else { p.n++; p.got++; } break;
      case 'fat': p.n++; p.got = c.fatigue | 0; break;
    }
  }
  /** 'ok' | 'ko' | '' tras la jornada (past: se acabó el tramo). */
  function pactJudge(p, past) {
    var d = PACT[p.id];
    if (d.kind === 'avg') { if (p.n >= p.goal || past) return p.w > 0 && p.sum / p.w >= p.x ? 'ok' : 'ko'; return ''; }
    if (d.kind === 'fat') return past ? (p.got < p.x ? 'ok' : 'ko') : '';
    if (p.got >= p.goal) return 'ok';
    return past ? 'ko' : '';
  }
  function pactProg(c, p) {
    var d = PACT[p.id];
    if (d.kind === 'fat') return 'fatiga ' + (c.fatigue | 0) + ' de ' + p.x;
    if (d.kind === 'avg') return p.n + '/' + p.goal + (p.w > 0 ? ' (media ' + dec(p.sum / p.w) + ')' : '');
    return (Math.round(p.got * 10) / 10 === Math.floor(p.got) ? Math.floor(p.got) : dec(p.got)) + '/' + p.goal;
  }
  function pactClose(c, s, st, why) {
    var p = s.pact; if (!p) return null;
    var t = pactText(c, p), res = [];
    if (st === 'ok') { res = S.fx(c, { coach: P_OK[p.diff], star: P_STAR }, 'Pacto cumplido: ' + t); moodAdd(s, 6, 'Pacto cumplido'); }
    else if (st === 'ko') { res = S.fx(c, { coach: P_KO[p.diff] }, 'Pacto fallado: ' + t); moodAdd(s, -3, 'Pacto fallado'); }
    s.pactLog.push({ s: p.s, blk: p.blk, id: p.id, d: p.diff, st: st, t: t, mN: s.mN }); if (s.pactLog.length > PLOG_MAX) s.pactLog = s.pactLog.slice(-PLOG_MAX);
    if (st === 'ok' || st === 'ko') { S.post(c, { b: st === 'ok' ? 'wkPactOk' : 'wkPactKo', k: 'coach', vars: { pacto: t } }); S.flag(c, 'pact', st); }
    s.pact = null;
    return res;
  }

  // ------------------------------------------------------------------ ganchos
  function onMatch(c, sum, f, ctx) {
    var s = St(c);
    moodMatch(c, s, sum);
    // pacto abierto: progreso y cierre (el tramo acaba al llegar a until, al salir de la liga o al cambiar de temporada)
    var p = s.pact;
    if (p && p.s !== ctx.season) pactClose(c, s, 'ko');
    else if (p && ctx.phase === 'league') {
      pactStep(c, p, sum, f);
      var past = !(c.phase === 'league' && (c.season | 0) === p.s && (c.week | 0) < p.until);
      var st = pactJudge(p, past); if (st) pactClose(c, s, st);
    } else if (p && ctx.phase !== 'league') pactClose(c, s, 'ko');
    if (s.pactOff && (s.mN > s.pactOff.exp || s.pactOff.s !== (c.season | 0))) s.pactOff = null;
    // mitad de liga: nueva charla (tramo 2)
    if (c.phase === 'league' && ctx.phase === 'league' && (c.season | 0) === ctx.season && (c.week | 0) === midOf(c)) offerPact(c, s, 2);
    // llaves del ánimo (cuentan para el tope: post las rechaza sin hueco)
    if (s.mood <= 30 && !S.flagAt(c, 'wkMoodLow') && S.post(c, { b: 'wkMoodLow', k: 'fam', o: 1 })) S.flag(c, 'wkMoodLow');
    else if (s.mood >= 90 && !S.flagAt(c, 'wkMoodHigh') && S.post(c, { b: 'wkMoodHigh', k: 'mate', o: 1 })) S.flag(c, 'wkMoodHigh');
    refreshWeek(c, s, ctx.nk);
  }
  function startBlock(c) {
    var s = St(c);
    if (s.pact && s.pact.s !== (c.season | 0)) pactClose(c, s, 'ko');
    if (c.phase === 'league') offerPact(c, s, (c.week | 0) < midOf(c) ? 1 : 2);
    refreshWeek(c, s, wkKey(c));
  }
  function onJoin(c) {
    var s = St(c);
    if (c.phase === 'off') return;   // (fichaje de verano: la charla llega en 'newSeason')
    if (s.pact) pactClose(c, s, 'x');   // club nuevo: el pacto con el entrenador anterior se queda en nada (sin efecto)
    s.pactOff = null;
    startBlock(c);
  }
  function onNewSeason(c) { startBlock(c); }
  function onSeason(c) { var s = St(c); if (s.pact) pactClose(c, s, 'ko'); s.pactOff = null; }

  function onAct(c, a) {
    var parts = a.split('-'), seg = parts[1], i = +parts[2];
    if (seg === 'wk') { var r = pickCard(c, i); return r ? { render: true, fx: r } : null; }
    if (seg === 'pact') { var r2 = acceptPact(c, i); return r2 ? { render: true, fx: r2 } : null; }
    return null;
  }

  // ------------------------------------------------------------------ avisos (puros)
  function chips(c) {
    var s = c && c.story, out = []; if (!s || s.v !== 1) return out;
    if (s.pactOff && s.pactOff.s === (c.season | 0) && s.mN <= s.pactOff.exp && !s.pact) out.push({ p: 3, ic: '✎', t: 'Charla con ' + S.cast(c).coach, x: 'Elegir pacto', tab: 'player', s: 'train' });
    var w = cardsNow(c); if (w && w.pick < 0) out.push({ p: 4, ic: '☀', t: 'Tu semana: elige', x: 'Día libre', act: 'st-jump', to: '.st-week', tab: 'match' });
    if (s.pact) out.push({ p: 6, ic: '◎', t: 'Pacto ' + pactProg(c, s.pact), x: DIFF[s.pact.diff], tab: 'player', s: 'train' });
    var fm = Math.round(formOf(c)); if (Math.abs(fm) >= 2 && c.notes && c.notes.length >= 3) out.push({ p: 9, ic: fm > 0 ? '▲' : '▼', t: formName(fm) + ' ' + sgn(fm), tab: 'player', s: 'train' });
    return out;
  }

  // ------------------------------------------------------------------ pintores
  function escF(H) { return H && H.esc ? H.esc : function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }; }
  function hintOf(c, e) {
    var h = S.hint(c, e);
    if (e.tpDef) h.push(['Entreno de defensa', true]);
    if (e.press) h.push(['Prensa la próxima jornada', true]);
    return h;
  }
  function arrow(esc, h, H) { if (H && typeof H.arrow === 'function') return H.arrow(h); return h.map(function (x) { return '<span class="' + (x[1] ? 'st-up' : 'st-dn') + '">' + esc(x[0]) + ' ' + (x[1] ? '▲' : '▼') + '</span>'; }).join(' '); }
  /** Tarjeta «Tu semana» (pestaña Partido). '' si no hay cartas esta jornada. */
  function uiWeek(c, H) {
    var w = cardsNow(c); if (!w) return '';
    var esc = escF(H), s = c.story;
    var h = '<div class="card st-week"><h3>Tu semana</h3>';
    if (w.pick >= 0) {
      var ct = cardText(c, w.o[w.pick], w.k);
      return h + '<p><b>' + esc(ct.t) + '</b></p><p class="muted">' + esc(ct.x) + '</p></div>';
    }
    h += '<p class="muted">Un día libre: elige una actividad o ninguna. La que no elijas se pierde al jugar.</p><div class="acts st-stack" style="display:flex;flex-direction:column;gap:8px">';
    w.o.forEach(function (id, i) {
      var ct = cardText(c, id, w.k), hi = hintOf(c, cardEff(s, id)), rar = CARD[id].r;
      h += '<button data-act="st-wk-' + i + '">' + esc(ct.t) + (rar ? ' <span class="tag ' + (rar === 2 ? 'y' : 'g') + '">' + (rar === 2 ? 'Rara' : 'Poco común') + '</span>' : '') + (hi.length ? '<small>' + arrow(esc, hi, H) + '</small>' : '') + '</button>';
    });
    return h + '</div></div>';
  }
  /** Gráfica SVG de las 8 últimas notas (hueco: simulado). */
  function formSVG(c) {
    var n = (c.notes || []).slice(-8); if (!n.length) return '';
    var W = 168, Hh = 54, x0 = 8, step = n.length > 1 ? (W - 16) / (n.length - 1) : 0, y = function (v) { return Math.round((Hh - 6) - clamp(v, 0, 10) / 10 * (Hh - 12)); };
    var pts = n.map(function (o, i) { return Math.round(x0 + i * step) + ',' + y(+o.nota || 0); }).join(' ');
    var g = '<svg class="st-form" viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '" role="img" aria-label="Tus ' + n.length + ' últimas notas">' +
      '<line x1="4" x2="' + (W - 4) + '" y1="' + y(6.5) + '" y2="' + y(6.5) + '" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"/>' +
      (n.length > 1 ? '<polyline points="' + pts + '" fill="none" stroke="#ffd23f" stroke-width="2"/>' : '');
    n.forEach(function (o, i) { var v = +o.nota || 0; g += '<circle cx="' + Math.round(x0 + i * step) + '" cy="' + y(v) + '" r="3.5" fill="' + (o.sim ? 'none' : v >= 6.5 ? '#7be37b' : '#ff6b6b') + '" stroke="' + (v >= 6.5 ? '#7be37b' : '#ff6b6b') + '" stroke-width="1.5"/>'; });
    return g + '</svg>';
  }
  /** Ficha de Jugador › Estado: Ánimo (con sus porqués), Forma (con la gráfica) y Pacto. */
  function uiState(c, H) {
    var s = c && c.story; if (!s || s.v !== 1) return '';
    var esc = escF(H), h = '<div class="card st-state"><h3>Ánimo</h3>';
    h += '<p><b>' + esc(moodName(s.mood)) + '</b> <span class="muted">(' + s.mood + ' de 100)</span></p>' +
      '<div class="st-bar" role="meter" aria-label="Ánimo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + s.mood + '" style="height:10px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden;margin:4px 0 8px"><i style="display:block;height:100%;width:' + s.mood + '%;background:#ffd23f"></i></div>';
    if (s.moodLog.length) h += '<ul class="st-log">' + s.moodLog.slice().reverse().map(function (x) { return '<li><span class="' + (x.d > 0 ? 'st-up' : 'st-dn') + '">' + sgn(x.d) + '</span> ' + esc(x.t || 'Sin motivo concreto') + '</li>'; }).join('') + '</ul>';
    h += '<p class="muted">El ánimo no cambia cómo juegas: cambia lo que te pasa entre partidos.</p>';
    var f = formOf(c), nn = (c.notes || []).length;
    h += '<h3>Forma</h3><p><b>' + esc(formName(f)) + ' ' + sdec(f) + '</b>' + (nn ? ' <span class="muted">(media de tus ' + Math.min(3, nn) + ' últimas notas)</span>' : ' <span class="muted">(aún sin notas esta temporada)</span>') + '</p>' + formSVG(c) +
      (nn ? '<p class="muted">Tus ' + Math.min(8, nn) + ' últimas notas; un círculo hueco es un partido simulado.</p>' : '');
    h += '<h3>Pacto con ' + esc(S.cast(c).coach) + '</h3>';
    var o = s.pactOff;
    if (s.pact) {
      var p = s.pact;
      h += '<p><span class="tag">' + DIFF[p.diff] + '</span> <b>' + esc(pactText(c, p)) + '</b></p><p>Progreso: ' + esc(pactProg(c, p)) + '</p>' +
        '<p class="muted">Si se cumple, Entrenador ' + sgn(P_OK[p.diff]) + '; si no, ' + sgn(P_KO[p.diff]) + '.</p>';
    } else if (o && o.s === (c.season | 0) && s.mN <= o.exp) {
      h += '<p>' + esc(S.cast(c).coach) + ' te propone tres pactos para este tramo:</p><div class="acts st-stack" style="display:flex;flex-direction:column;gap:8px">' + o.o.map(function (x, i) {
        var t = pactText(c, { id: x.id, goal: x.goal, x: x.x, blk: o.blk, until: o.until });
        return '<button data-act="st-pact-' + i + '">' + esc(DIFF[x.d] + ': ' + t) + '<small><span class="st-up">Entrenador ' + sgn(P_OK[x.d]) + ' ▲</span> <span class="st-dn">si fallas ' + sgn(P_KO[x.d]) + ' ▼</span></small></button>';
      }).join('') + '</div><p class="muted">Si no eliges, no hay pacto ni efecto.</p>';
    } else {
      var last = s.pactLog.length ? s.pactLog[s.pactLog.length - 1] : null;
      h += last && last.st !== 'x' ? '<p>Último: <span class="tag ' + (last.st === 'ok' ? 'g' : 'r') + '">' + (last.st === 'ok' ? 'Cumplido' : 'Fallado') + '</span> ' + esc(last.t) + '</p>' : '';
      h += '<p class="muted">' + esc(S.cast(c).coach) + ' propone pactos en la jornada 1 y a mitad de liga.</p>';
    }
    return h + '</div>';
  }
  var CSS = [
    '#career .st-stack{display:flex;flex-direction:column;gap:6px}#career .st-stack>button{min-height:44px;text-align:left}',
    '#career .st-stack>button small{display:block;margin-top:2px}',
    '#career .st-bar{height:10px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;margin:4px 0 8px}#career .st-bar>i{display:block;height:100%;background:#ffd23f}',
    '#career .st-log{margin:4px 0 8px;padding-left:18px}#career .st-form{display:block;margin:4px 0}'
  ].join('\n');

  S.use({
    id: 'week', acts: ['wk', 'pact'], tpl: TPL,
    ensure: ensureS, onMatch: onMatch, onJoin: onJoin, onNewSeason: onNewSeason, onSeason: onSeason, onAct: onAct,
    fx: {
      // entreno de la carta «Vídeo de {rival}»: siempre al grupo de defensa (elección del jugador)
      tpDef: function (c, v) { if (!c.tp || typeof c.tp !== 'object') return null; c.tp.def = Math.min(99, (c.tp.def | 0) + (v | 0)); return 'Entreno de defensa +' + (v | 0); },
      // «Entrevista en Radio Arena FM»: marca para P1 (prensa la jornada siguiente)
      press: function (c) { S.flag(c, 'pressForce', 1); return 'La prensa querrá hablar contigo tras el próximo partido'; }
    },
    chips: chips,
    ui: { week: uiWeek, state: uiState, css: function () { return CSS; } },
    // (para las pruebas y para la UI de enlace)
    _t: { CARDS: CARDS, PACTS: PACTS, PER: PER, P_OK: P_OK, P_KO: P_KO, deal: deal, weekOpen: weekOpen, formOf: formOf, formName: formName, moodName: moodName, moodParts: moodParts,
      offerPact: offerPact, acceptPact: acceptPact, pactText: pactText, pactProg: pactProg, cardText: cardText, cardsNow: cardsNow, formSVG: formSVG }
  });
})();
