/* MAKE THE CUT — js/career-world.js (owner: ui_main)
 * «Mundo» de la Carrera (VB.CareerWorld, sprint 5): Faro, el mentor, con escenas cortas en los hitos (E4, tarea C1); noticias de
 * la liga (roundNews por jornada, seasonNews con los anales al acabar, summerNews en verano) y enciclopedia de clubes (lore,
 * clubRows, clubCard, cara a cara) (E5, tarea C2). Vale para las DOS Carreras: playa (5 circuitos, K().LEAGUES por nivel) y pista
 * (c.mode 'hall', ligas por país con id 'ES1'/'ES2'): las ligas salen de leaguesOf(c) (pista: las de tu país), los datos del motor de
 * la carrera concreta (E(c), como career-life.js) y los resultados de resOf (pista: solo los de tu liga, c.myRes).
 * Sin DOM (se carga en node: tools/careertest.js). Estado en c.world (ensure() lo crea al vuelo; sin subir VER).
 * Solo escribe en c.world y, para el mentor, en la bandeja (K()._msg con k 'mentor'). No toca nada que influya en partidos,
 * ofertas, XP ni dinero, y su azar no consume los generadores de career.js. career.js llama a hook(c, tipo, …) desde life(),
 * después de CareerLife (create, join, setup, match, season, newSeason). Sin este fichero, la Carrera queda igual.
 *
 * Bandeja (plan, conflicto 10): la escena se apunta en la bandeja SOLO si no se ve en pantalla: al saltarla («Saltar»), con las
 * escenas apagadas (Palmarés › Opciones) o si se cae de la cola (máx. 3). Así no se duplica lo que ya avisa CareerLife.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  function K() { return VB.Career; }
  function rngOf() { var C = K().beach || K(); return C._rng(C._hash.apply(null, arguments)); }   // (C2: azar propio de las noticias)
  // Motor de la carrera c (como career-life.js): la fachada VB.Career va a la Carrera ACTIVA, pero los ganchos reciben una concreta
  // (la de pista pasa por aquí al crearla, con la playa aún activa). Pista: vista «pista sobre playa» (league(lid, c), table, clubInfo…).
  var HV = null, HVsrc = null;
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function E(c) {
    var C = K(); if (!c || !C || !C.beach) return C;
    if (!isH(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function lvOf(k) { return k.lid != null ? k.lid : k.lvl; }
  /** Liga por su clave (playa: nivel 0-4; pista: id 'ES1') y la de un club. */
  function lgBy(c, lv) { return isH(c) ? E(c).league(lv, c) : E(c).league(lv); }
  function lgOf(c, k) { return lgBy(c, lvOf(k)); }
  function clubsIn(c, lv) { return isH(c) ? E(c).leagueClubs(c, lv) : E(c).clubsOf(c, lv); }
  /** Resultados de una liga por jornada ([jornada][partido] {a,b,s,sc}). Pista: solo se guardan los de tu liga (c.myRes). */
  function resOf(c, lv) { if (isH(c)) return c.myRes && c.myRes.lid === lv && Array.isArray(c.myRes.w) ? c.myRes.w : []; return c.res && c.res[lv] || []; }
  /** Altura de una liga (mayor = más arriba): playa, el nivel; pista, la división (1ª > 2ª). */
  function rankOf(c, lv) { if (!isH(c)) return lv; var L = lgBy(c, lv); return L ? -L.lvl : 0; }
  var ELITE = 84;   // pista: «élite» = 1ª con fuerza ≥ 84 (las de jueces de línea y challenge, ref 'top')
  function isTop(c, lv) { if (!isH(c)) return lv >= (K().beach || K()).LEAGUES.length - 1; var L = lgBy(c, lv); return !!(L && L.lvl === 1 && L.strength >= ELITE); }
  var Q_MAX = 3, LINE_MAX = 140;

  // ------------------------------------------------------------------ estado
  function ensure(c) {
    if (!c) return null;
    var w = c.world;
    if (!w || typeof w !== 'object' || Array.isArray(w)) { w = c.world = {}; backfill(c, w); }
    var m = w.mentor;
    if (!m || typeof m !== 'object') m = w.mentor = { on: 1, seen: {}, q: [] };
    m.on = m.on === 0 ? 0 : 1;
    if (!m.seen || typeof m.seen !== 'object') m.seen = {};
    if (!m.last || typeof m.last !== 'object') m.last = {};
    if (!Array.isArray(m.q)) m.q = [];
    m.q = m.q.filter(function (x) { return x && BEATS[x.id] && Array.isArray(x.l); }).slice(-Q_MAX);
    if (!w.h2h || typeof w.h2h !== 'object') w.h2h = {};
    if (!(w.since >= 1)) w.since = c.season | 0 || 1;
    // E5 (C2): noticias, anales, líder de cada liga y última variante de cada plantilla. Lo que no cuadra se descarta.
    if (!Array.isArray(w.news)) w.news = [];
    w.news = w.news.filter(function (x) { return x && typeof x.t === 'string' && x.id > 0; }).slice(-NEWS_MAX);
    w.news.forEach(function (x) { if (!Array.isArray(x.c)) x.c = []; x.s = x.s | 0; x.w = x.w | 0; });
    if (!(w.newsN >= 0)) w.newsN = w.news.reduce(function (m, x) { return Math.max(m, x.id); }, 0);
    if (!(w.newsSeen >= 0)) w.newsSeen = w.newsN;
    if (!Array.isArray(w.annals)) w.annals = [];
    w.annals = w.annals.filter(function (a) { return a && Array.isArray(a.lg) && Array.isArray(a.cup) && Array.isArray(a.up) && Array.isArray(a.dn); }).slice(-ANNALS_MAX);
    if (!w.lead || typeof w.lead !== 'object' || Array.isArray(w.lead)) w.lead = {};
    if (!w.tpl || typeof w.tpl !== 'object' || Array.isArray(w.tpl)) w.tpl = {};
    return w;
  }
  /** Guardado sin c.world (carrera empezada antes del sprint 5): cara a cara de la temporada en curso y hitos ya pasados vistos. */
  function backfill(c, w) {
    w.h2h = {}; w.since = c.season | 0 || 1;
    (c.notes || []).forEach(function (n) { if (n && n.s && n.rival != null) addH2h(w, n.rival, n.s, c.season); });
    w.mentor = { on: 1, seen: {}, q: [], last: {} };
    var T = c.career || {}, S = w.mentor.seen;
    if (c.myClub >= 0) S.hola = 1;   // carrera ya en marcha: Faro no se presenta a mitad
    if ((T.played | 0) > 0) { S.hola = S.debut = 1; }
    if ((T.won | 0) > 0) S.win1 = 1;
    if ((T.played | 0) - (T.won | 0) > 0) S.loss1 = 1;
    if ((T.bench | 0) > 0) S.bench1 = 1;
    if (c.life && c.life.rival) S.rival = 1;
    (c.trophies || []).forEach(function (t) { if (t.kind === 'liga' || t.kind === 'copa') S.title = 1; if (t.kind === 'ascenso') S.up = 1; if (t.kind === 'premio') S.award = 1; });
    (c.history || []).forEach(function (h) { if (h && h.move < 0) S.down = 1; if (h && isTop(c, isH(c) ? h.lid : h.lvl)) S.top = 1; });
    var me = c.myClub >= 0 && E(c).myClub(c); if (me && isTop(c, lvOf(me))) S.top = 1;
    if (c.player && (c.player.age | 0) >= 30) S.vet = 1;
    if ((c.history || []).some(function (h, i, a) { return i > 0 && h.club !== a[i - 1].club; })) S.move = 1;
  }
  function addH2h(w, id, s, season) {
    var h = w.h2h[id] || (w.h2h[id] = [0, 0, 0, 0, 0, 0]);   // [jugados, ganados, perdidos, sets a favor, sets en contra, temporada del último]
    h[0]++; if (s[0] > s[1]) h[1]++; else h[2]++; h[3] += s[0]; h[4] += s[1]; h[5] = season | 0;
  }

  // ------------------------------------------------------------------ mentor
  var MENTOR = { name: 'Álex Marí', nick: 'Faro', role: 'Tu mentor' };
  // Escenas: 1-3 frases cortas (≤ 140 caracteres). act: botón opcional ('tab:sub', career-ui ya lo entiende); al: su texto.
  var BEATS = {
    hola: { t: 'Faro se presenta', l: ['Soy Álex Marí, aunque en la arena todo el mundo me llama Faro.', 'Doce temporadas en el Circuito Mundial. Ahora me toca ver cómo empiezas tú.', 'Primer consejo: mira bien la pareja que te ofrece cada club. En la playa sois dos y no hay dónde esconderse.'] },
    debut: { t: 'Antes del debut', l: ['Primer partido con {club}. Los nervios son buena señal: quiere decir que te importa.', 'Mira el reto de la jornada. No es obligatorio, pero se nota cuando lo cumples.'] },
    win1: { t: 'Primera victoria', l: ['¡Esa es! La primera nunca se olvida.', 'Ahora viene lo difícil: que no sea la única.'] },
    loss1: { t: 'Primera derrota', l: ['Perder también se entrena. Mañana mira qué falló, no quién falló.'] },
    rival: { t: 'Tienes rival', l: ['{rival} va diciendo que es mejor que tú. Un rival te hace mejor o te vuelve loco. Tú eliges.'] },
    bench1: { t: 'Al banquillo', l: ['Duele ver la jornada desde fuera, lo sé. Tus notas son tu voz: súbelas y no podrán dejarte fuera.'], act: 'player:train', al: 'Ver entreno' },
    slump: { t: 'Mala racha', l: ['{n} derrotas seguidas. Todo el mundo pasa por esto, hasta en el Mundial.', '{tip}'], act: '{act}', al: '{al}', max: 3 },
    streak: { t: 'En racha', l: ['Cinco seguidas. Disfrútalo, pero no te lo creas: la arena siempre te baja los humos.'] },
    title: { t: 'Primer título', l: ['{title}. Esto ya nadie te lo quita.', 'Guárdate la sensación: es la que te va a hacer madrugar los próximos diez años.'] },
    award: { t: 'Primer premio', l: ['{award}. Te han visto, y eso en este circuito vale oro.'] },
    up: { t: 'Ascenso', l: ['¡Subís {toL}! Celebra hoy.', 'Mañana, a entrenar: arriba la IA perdona mucho menos y los clubes miran más.'] },
    down: { t: 'Descenso', l: ['Bajar duele. A mí me pasó dos veces y aquí sigo.', 'Una temporada abajo puede ser el mejor sitio para coger confianza.'] },
    move: { t: 'Club nuevo', l: ['Cambiar de club es empezar de cero con {mate}: la química no se ficha, se juega.'] },
    top: { t: 'En la élite', l: ['El Circuito Mundial. Aquí jugué yo doce años.', 'Ahora entiendes por qué te hacía repetir la recepción.'] },
    vet: { t: 'Treinta años', l: ['Treinta. Las piernas empiezan a hablar, la cabeza va mejor que nunca.', 'Tú decides cuándo parar. Lo verás en Fama › Legado.'], act: 'life:legacy', al: 'Ver legado' },
    // (sesiones de entrenamiento de la Carrera, career.js sessDo: gancho 'sess' con la primera sesión de la carrera)
    ses1: { t: 'El primer entreno', l: ['Primer entreno hecho. Puedes hacer hasta 3 antes de cada partido: suben un pelín, pero cansan.', 'Jugado de verdad rinde más que en rápido. Y tu entrenador se fija en cómo entrenas.'] }
  };
  // Carrera de pista: las frases que hablan de arena, pareja o del Circuito Mundial (mismo id, mismo título; el resto, igual).
  var BEATS_H = {
    hola: ['Soy Álex Marí, aunque en el pabellón todo el mundo me llama Faro.', 'Doce temporadas en las grandes ligas. Ahora me toca ver cómo empiezas tú.', 'Primer consejo: mira bien el rol que te ofrece cada club. Ser titular o ir a la rotación lo cambia todo.'],
    slump: ['{n} derrotas seguidas. Todo el mundo pasa por esto, hasta en las grandes ligas.', '{tip}'],
    streak: ['Cinco seguidas. Disfrútalo, pero no te lo creas: la pista siempre te baja los humos.'],
    move: ['Club nuevo, vestuario nuevo: la química no se ficha, se juega.'],
    top: ['{lg}: una de las grandes ligas del mundo. Ahí jugué yo doce años.', 'Ahora entiendes por qué te hacía repetir la recepción.'],
    ses1: ['Primer entreno hecho. Puedes hacer hasta 3 antes de cada partido: suben un pelín, pero cansan.', 'Jugado de verdad rinde más que en rápido. Y el entrenador mira los entrenos para elegir el seis.']
  };
  // (midLow del diseño, recortado por el plan: midWindow del entrenador ya cubre el ecuador)
  var BEAT_ORDER = ['hola', 'debut', 'win1', 'loss1', 'rival', 'bench1', 'slump', 'streak', 'title', 'award', 'up', 'down', 'move', 'top', 'vet', 'ses1'];
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (a, k) { return v && v[k] != null ? String(v[k]) : ''; }); }
  function inbox(c, q) { var B = BEATS[q.id]; if (B) K()._msg(c, 'mentor', 'Faro: ' + B.t.toLowerCase(), q.l.join(' ')); }
  /** Dispara una escena (una vez en la carrera; slump hasta 3 veces, una por temporada). Con escenas: a la cola; si no, a la bandeja. */
  function beat(c, id, v) {
    var w = ensure(c), m = w.mentor, B = BEATS[id]; if (!B) return false;
    var seen = m.seen[id] | 0;
    if (B.max ? seen >= B.max || m.last[id] === (c.season | 0) : seen) return false;
    m.seen[id] = seen + 1; if (B.max) m.last[id] = c.season | 0;
    var lines = (isH(c) && BEATS_H[id] || B.l).map(function (s) { return fill(s, v).slice(0, LINE_MAX); }).filter(function (s) { return s; });
    var q = { id: id, s: c.season | 0, l: lines, act: B.act ? fill(B.act, v) : '', al: B.al ? fill(B.al, v) : '' };
    if (!m.on) { inbox(c, q); return true; }
    m.q.push(q);
    while (m.q.length > Q_MAX) inbox(c, m.q.shift());   // la más vieja no se llega a ver: a la bandeja
    return true;
  }
  function slumpTip(c) {
    if ((c.fatigue | 0) > 40) return ['Vas con la fatiga por las nubes. Una semana de Descanso o el fisio y verás otra cosa.', 'player:train', 'Ver entreno'];
    if (isH(c) && (c.chem | 0) < 30) return ['El equipo aún no se entiende. Jugad los partidos, no los simuléis: la química sale en la pista.', '', ''];
    if (c.mate && (c.mate.chem | 0) < 30) return ['Con ' + c.mate.name + ' aún no os entendéis. Jugad juntos, no simuléis: la química sale en la arena.', '', ''];
    if (c.player && (c.player.pts | 0) > 0) return ['Tienes puntos de mejora sin gastar. Úsalos antes del próximo partido.', 'player:atk', 'Mejorar'];
    return ['Simplifica: saque seguro, recepción alta y remate a la línea. Lo bonito, después.', '', ''];
  }
  /** Escena en pantalla (la primera de la cola): {id, title, lines[], act, actLabel, who, left} o null. */
  function mentorScene(c) {
    var w = c && c.world; if (!w || !w.mentor || !w.mentor.on || !Array.isArray(w.mentor.q) || !w.mentor.q.length) return null;
    var q = w.mentor.q[0]; if (!q || !BEATS[q.id]) return null;
    return { id: q.id, title: BEATS[q.id].t, lines: q.l || [], act: q.act || '', actLabel: q.al || '', who: MENTOR, left: w.mentor.q.length - 1 };
  }
  /** Vista entera («Vale» en la última frase): sale de la cola sin ir a la bandeja. */
  function mentorDone() { var c = K().load(); if (!c) return false; var w = ensure(c); if (!w.mentor.q.length) return false; w.mentor.q.shift(); K().save(c); return true; }
  /** «Saltar»: la escena actual sale de la cola y queda en la bandeja para releerla. */
  function mentorSkip() { var c = K().load(); if (!c) return false; var w = ensure(c); if (!w.mentor.q.length) return false; inbox(c, w.mentor.q.shift()); K().save(c); return true; }
  function mentorSkipAll() { var c = K().load(); if (!c) return false; var w = ensure(c); w.mentor.q.forEach(function (q) { inbox(c, q); }); w.mentor.q = []; K().save(c); return true; }
  /** Escenas sí/no (Palmarés › Opciones). Al apagar, lo pendiente va a la bandeja. */
  function setMentor(on) {
    var c = K().load(); if (!c) return false; var w = ensure(c);
    w.mentor.on = on ? 1 : 0;
    if (!on) { w.mentor.q.forEach(function (q) { inbox(c, q); }); w.mentor.q = []; }
    K().save(c); return true;
  }
  function mentorOn(c) { var w = c && c.world; return !(w && w.mentor && w.mentor.on === 0); }

  // ------------------------------------------------------------------ noticias de la liga (E5a, tarea C2)
  // Ligas del modo, de abajo arriba. Playa: las 5 (índices de K().LEAGUES, 8 clubes, 14 jornadas, el open solo en tu liga). Pista:
  // las de tu país ([cc+'2', cc+'1'], o solo la 1ª), las de los anales y los ascensos; los anales guardan sus ids (an.l) por si cambias de país.
  function leaguesOf(c) {
    if (isH(c)) { var me = c.myClub >= 0 && E(c).myClub(c), L = me && lgOf(c, me), cc = L ? L.cc : c.cc; return [cc + '2', cc + '1'].filter(function (id) { return !!lgBy(c, id); }); }
    var out = []; for (var i = 0; i < (K().beach || K()).LEAGUES.length; i++) out.push(i); return out;
  }
  function topLv(c) { var l = leaguesOf(c); return l[l.length - 1]; }
  /** «Otra liga» de los titulares: la de arriba de tu país; si ya estás en ella, playa: la de debajo; pista: la 1ª más fuerte del mundo. */
  function otherLv(c, lv) {
    var lgs = leaguesOf(c), top = topLv(c);
    if (lv !== top) return top;
    if (!isH(c)) return lgs[lgs.indexOf(lv) - 1];
    var best = (c.leagues || []).filter(function (L) { return L.id !== lv && L.lvl === 1; }).sort(function (a, b) { return b.strength - a.strength || (a.id < b.id ? -1 : 1); })[0];
    return best ? best.id : null;
  }
  var NEWS_MAX = 60, ANNALS_MAX = 40, ROUND_MAX = 3, W_SUMMER = 0, W_END = 15;
  var STREAK_AT = { 4: 1, 6: 1, 8: 1, 11: 1, 14: 1 };   // rachas que son noticia (antes 4, 6, 8, 10, 12, 14: el colista salía cada dos jornadas)
  var MKT = true;   // mercado de verano inventado (pura ambientación; plan §3: apagable, lo decide Ferran)
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function ordn(n) { return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  // Plantillas (género neutro: «líder», «gana el Open», nunca «campeón»). {a}/{b} clubes, {sc} parciales, {L} «el Circuito…»,
  // {deL}/{enL}/{EnL} con artículo, {p} tú, {mate} tu pareja, {rv} tu rival, {nm} jugador inventado.
  var TPL = {
    upset: ['Campanada en {sede}: {a} tumba a {b}', '{b} tropieza contra {a}, {d} puntos de media por debajo', 'Nadie lo vio venir: {a} gana a {b} ({sc})', 'Sorpresa en {L}: {a} doblega a {b}'],
    rout: ['{a} pasa por encima de {b} ({sc})', 'Exhibición de {a}: {b} apenas suma {pts} puntos', '{b}, sin respuesta ante {a} ({sc})'],
    thriller: ['Infarto en el tercer set: {a} gana a {b} ({sc})', '{a} y {b} se van al tie-break y lo cierra {a} por la mínima', 'Partidazo en {sede}: {a} remonta y gana a {b} ({sc})'],
    leader: ['{a}, nuevo líder {deL}', 'Cambio arriba: {a} adelanta a {b} y manda {enL}', '{a} se sube al liderato tras la jornada {n}'],
    streak: ['{a} no para: {n} victorias seguidas', 'Racha de {a}: ya son {n} partidos sin perder', '¿Quién para a {a}? {n} triunfos seguidos'],
    skid: ['{a} no levanta cabeza: {n} derrotas seguidas', 'Crisis en {a}: {n} partidos sin ganar', 'Alarma en {sede}: {a} encadena {n} derrotas'],
    meWin: ['{p} firma {k} remates y {a} gana a {b}', '{a} gana a {b} con {p} como figura ({nota} de nota)', 'Gran partido de {p}: {a} {sc} {b}'],
    meUpset: ['{p} guía a {a} a una victoria de mérito contra {b}', 'Golpe de {a}: {p} y {mate} tumban a {b}'],
    rivalW: ['{rv} ({b}) responde: «La próxima vez no habrá suerte»', '{rv} se calla tras perder el duelo contra {p}'],
    rivalL: ['Duelo para {rv}: {b} gana a {a} y lo celebra en redes', '{rv} gana el duelo a {p} y presume en las entrevistas'],
    top: ['Mientras, {enL}: {a} sigue líder con {pts} puntos', '{EnL}, {a} gana a {b} ({sc}) y mira a todos desde arriba', 'Ojo a {a}: es la sensación {deL}'],
    mid: ['Ecuador {deL}: {a} manda con {pts} puntos', 'Media temporada {deL}: {a} líder, {b} colista'],
    champs: ['{a} gana {elL} en la temporada {n}'],
    open: ['{a} gana {elCup} ({sc})', '{a} se lleva {elCup} tras vencer a {b}'],
    cup: ['Título de {cup} para {a} tras ganar a {b} ({sc})', '{a} gana la final de {cup} a {b} ({sc})'],   // (pista: copa nacional e internacionales)
    moves: ['{txt}'],
    boss: ['{a} «{nick}» cae ante {p}'],   // (C3: la 1ª victoria jugada contra el jefe del circuito; newsBoss)
    mkt: ['Rumor de verano: {nm} deja {b} y ficha por {a}', '{a} ficha a {nm}, una de las promesas {deL}', '{nm} renueva con {a} hasta la temporada {n}']
  };
  /** Variante de la plantilla (nunca la misma dos veces seguidas en un tipo: w.tpl). okv(i): variantes que se pueden usar. */
  function tpl(c, key, r, v, okv) {
    var w = ensure(c), L = TPL[key], idx = [];
    for (var j = 0; j < L.length; j++) if (!okv || okv(j)) idx.push(j);
    if (!idx.length) idx.push(0);
    var i = idx[Math.floor(r() * idx.length) % idx.length];
    if (idx.length > 1 && w.tpl[key] === i) i = idx[(idx.indexOf(i) + 1) % idx.length];
    w.tpl[key] = i;
    return { t: fill(L[i], v), v: i };
  }
  function addNews(c, k, x, ids, me, wk) {
    var w = ensure(c), rv = c.life && c.life.rival;
    ids = (ids || []).filter(function (id) { return id != null && id >= 0; });
    if (!me) me = ids.indexOf(c.myClub) >= 0 ? 1 : rv && ids.indexOf(rv.club) >= 0 ? 2 : 0;
    w.news.push({ id: ++w.newsN, s: c.season | 0, w: wk | 0, k: k, v: x.v | 0, t: x.t, c: ids, me: me | 0 });
    if (w.news.length > NEWS_MAX) w.news = w.news.slice(-NEWS_MAX);
  }
  function scTxt(sc) { return (sc || []).map(function (x) { return x[0] + '-' + x[1]; }).join(', '); }
  function flip(sc) { return sc.map(function (x) { return [x[1], x[0]]; }); }
  function artL(L, cty) {
    var n = L.name + (cty ? ' (' + cty + ')' : '');   // (pista, liga de otro país: «en la IperLega (Italia)»)
    return { deL: (L.art === 'la' ? 'de la ' : 'del ') + n, enL: 'en ' + L.art + ' ' + n, EnL: 'En ' + L.art + ' ' + n, L: L.art + ' ' + n };
  }
  function sedeOf(k) { return k ? k.beach || k.city || k.name : ''; }
  /** «A y B» / «A, B e Ibiza» (y → e delante de i-/hi-). */
  function andList(a) {
    if (a.length < 2) return a.join('');
    var last = a[a.length - 1], y = /^(i|hi)(?!e)/i.test(String(last).normalize ? String(last).normalize('NFD').replace(/[̀-ͯ]/g, '') : last) ? ' e ' : ' y ';
    return a.slice(0, -1).join(', ') + y + last;
  }
  /** Racha actual de un club en su liga (+ victorias / − derrotas), hasta la jornada wk. */
  function streakOf(c, lvl, id, wk) {
    var n = 0, sign = 0, R = resOf(c, lvl);
    for (var i = Math.min(wk, R.length - 1); i >= 0; i--) {
      var m = (R[i] || []).filter(function (x) { return x && (x.a === id || x.b === id); })[0]; if (!m) break;
      var win = (m.a === id) === (m.s[0] > m.s[1]) ? 1 : -1;
      if (!sign) sign = win; if (win !== sign) break; n++;
    }
    return n * sign;
  }
  /** Titulares de la jornada que acaba de cerrarse: máx. 2 de tu liga (uno por tipo, los de más peso) y, una de cada tres
   *  jornadas, 1 de otra liga. Tu partido solo es noticia si lo has JUGADO y ganado (simulado o en el banquillo, no). */
  function roundNews(c, sum, f) {
    var H = isH(c), X = E(c), me = X.myClub(c); if (!me || !sum || sum.phase !== 'league' || (!H && !c.res)) return;
    // jornada: playa, la anterior a c.week; pista, la del partido (f.week: tras él, los descansos pueden adelantar c.week)
    var lvl = lvOf(me), L = lgOf(c, me), wk = H ? (f && f.kind === 'league' ? f.week | 0 : -1) : (c.phase === 'league' ? c.week : X.WEEKS) - 1, A = artL(L), r = rngOf(c.seed, 'news', c.season, wk);
    if (wk < 0) return;
    var res = resOf(c, lvl)[wk] || [], cand = [], w = ensure(c), J = wk + 1;
    res.forEach(function (m) {
      if (!m || !m.s || !m.sc) return;
      var win = m.s[0] > m.s[1], wa = X.club(c, win ? m.a : m.b), lb = X.club(c, win ? m.b : m.a), home = X.club(c, m.a);
      if (!wa || !lb) return;
      var sc = win ? m.sc : flip(m.sc), d = X.clubOvr(lb) - X.clubOvr(wa), mine = m.a === me.id || m.b === me.id;
      var v = { a: wa.name, b: lb.name, sc: scTxt(sc), sede: sedeOf(home), d: d, L: A.L, pts: sc.reduce(function (s, x) { return s + x[1]; }, 0) };
      if (mine) {
        if (sum.bench || sum.sim || !sum.win || wa.id !== me.id) return;
        v.p = c.player.name; v.k = (sum.me && sum.me.kills) | 0; v.nota = String(sum.nota).replace('.', ','); v.mate = c.mate ? c.mate.name : 'su pareja';
        cand.push({ sc: 6 + (d >= 4 ? 3 : 0), k: d >= 4 ? 'meUpset' : 'meWin', v: v, ids: [wa.id, lb.id], me: 1, okv: H && d >= 4 ? function (i) { return i !== 1; } : null });   // (pista: sin «{p} y {mate}»)
        return;
      }
      var blow = m.s[0] + m.s[1] === 2 && sc.every(function (x) { return x[0] - x[1] >= 8; });
      var tb = m.s[0] + m.s[1] === 3 && sc[2] && Math.abs(sc[2][0] - sc[2][1]) <= 2;
      if (d >= 6) cand.push({ sc: 5 + d / 3, k: 'upset', v: v, ids: [wa.id, lb.id] });
      else if (tb) cand.push({ sc: 4, k: 'thriller', v: v, ids: [wa.id, lb.id] });
      else if (blow) cand.push({ sc: 3, k: 'rout', v: v, ids: [wa.id, lb.id] });
    });
    // tabla: cambio de líder (desde la jornada 3, misma liga y temporada) y rachas de 4, 6, 8…
    var t = X.table(c, lvl); if (!t.length) return;
    var lead = t[0].id, pl = w.lead[lvl], prev = pl && pl[0] === (c.season | 0) ? pl[1] : null;
    if (wk >= 2 && prev != null && prev !== lead && X.club(c, prev)) cand.push({ sc: 5.5, k: 'leader', v: { a: X.club(c, lead).name, b: X.club(c, prev).name, deL: A.deL, enL: A.enL, n: J }, ids: [lead, prev] });
    w.lead[lvl] = [c.season | 0, lead];
    clubsIn(c, lvl).forEach(function (k) {
      var s = streakOf(c, lvl, k.id, wk);
      if (!STREAK_AT[Math.abs(s)]) return;
      if (s > 0) cand.push({ sc: 3.5 + s / 4, k: 'streak', v: { a: k.name, n: s }, ids: [k.id] });
      else cand.push({ sc: 3 - s / 4, k: 'skid', v: { a: k.name, n: -s, sede: sedeOf(k) }, ids: [k.id] });
    });
    // tu rival personal: el duelo de CareerLife (sum.life.duel; jugado o simulado, nunca en el banquillo)
    var rv = c.life && c.life.rival, du = sum.life && sum.life.duel, rk = rv && X.club(c, rv.club);
    if (rv && du && rk && !sum.bench) cand.push({ sc: 7, k: du.win ? 'rivalW' : 'rivalL', v: { rv: du.name || rv.name, b: rk.name, a: me.name, p: c.player.name }, ids: [rk.id], me: 2 });
    var mid = H ? (X.midWeek ? X.midWeek(c) : 0) : X.MID_WEEK;
    if (wk === mid - 1 && t.length > 1) cand.push({ sc: 6.5, k: 'mid', v: { a: X.club(c, lead).name, b: X.club(c, t[t.length - 1].id).name, pts: t[0].pts, deL: A.deL }, ids: [lead] });
    cand.sort(function (x, y) { return y.sc - x.sc; });
    // (lo que ya hay de esta jornada cuenta en el tope: la noticia del jefe, newsBoss, llega antes desde career-life.js)
    var used = {}, n = w.news.filter(function (x) { return x.s === (c.season | 0) && x.w === J; }).length;
    cand.forEach(function (x) {
      var g = x.k.indexOf('rival') === 0 ? 'rival' : x.k;
      if (n >= ROUND_MAX - 1 || used[g]) return; used[g] = 1; n++;
      addNews(c, x.k, tpl(c, x.k, r, x.v, x.okv), x.ids, x.me, J);
    });
    // otra liga, una de cada tres jornadas: el líder de la de arriba (playa: el Mundial; si ya estás arriba, la de debajo; pista: la 1ª
    // de tu país o, si ya juegas en ella, la 1ª más fuerte del mundo; de esa no hay partidos guardados: solo su líder)
    if (wk % 3 === 1 && n < ROUND_MAX) {
      var ol = otherLv(c, lvl);
      if (ol == null || (!H && !c.res[ol])) return;
      var OL = lgBy(c, ol); if (!OL) return;
      var ot = X.table(c, ol), lk = ot.length && X.club(c, ot[0].id); if (!lk) return;
      var om = (resOf(c, ol)[wk] || []).filter(function (x) { return x && (x.a === lk.id || x.b === lk.id); })[0], B = artL(OL, H && OL.cc !== L.cc ? OL.country : '');
      var ob = om && X.club(c, om.a === lk.id ? om.b : om.a), won = om && (om.a === lk.id) === (om.s[0] > om.s[1]);
      var ov = { a: lk.name, pts: ot[0].pts, enL: B.enL, EnL: B.EnL, deL: B.deL, b: ob ? ob.name : '', sc: om ? scTxt(om.a === lk.id ? om.sc : flip(om.sc)) : '' };
      addNews(c, 'top', tpl(c, 'top', r, ov, function (i) { return i !== 1 || (ob && won); }), [lk.id], 0, J);
    }
  }
  /** Fin de temporada: anales (clasificación final de cada liga, opens y movimientos) y titulares. Va en el gancho 'season'
   *  (endSeason), ANTES de applyMoves: k.lvl aún es el de la temporada que acaba. */
  function seasonNews(c) {
    var H = isH(c), X = E(c), w = ensure(c), me = X.myClub(c); if (!me || (!H && !c.res)) return;
    var r = rngOf(c.seed, 'news-season', c.season), lgs = leaguesOf(c), ml = lvOf(me), an = { s: c.season | 0, lg: [], cup: [], up: [], dn: [] };
    // pista: la copa nacional de tu país (c.kos, kind 'cup'): su campeón cuenta en la liga en la que juega (an.cn, su nombre)
    var nko = H ? (c.kos || []).filter(function (ko) { return ko && ko.kind === 'cup'; })[0] : null;
    if (H) { an.l = lgs.slice(); an.cn = nko ? nko.name : ''; }
    lgs.forEach(function (L) {
      var ids = X.table(c, L).map(function (x) { return x.id; });
      an.lg.push(ids);
      if (H) { var ck = nko && nko.champion >= 0 && X.club(c, nko.champion); an.cup.push(ck && ck.lid === L ? ck.id : -1); }
      else an.cup.push(c.cup && c.cup.lvl === L && c.cup.champion >= 0 ? c.cup.champion : ids.length >= 4 ? simOpen(c, L, ids) : -1);
    });
    var moves = c.review && Array.isArray(c.review.moves) ? c.review.moves : [];
    moves.forEach(function (mv) { var k = X.club(c, mv.id); if (k) (rankOf(c, mv.to) > rankOf(c, lvOf(k)) ? an.up : an.dn).push(mv.id); });
    w.annals.push(an); if (w.annals.length > ANNALS_MAX) w.annals = w.annals.slice(-ANNALS_MAX);
    // campeones: el de tu liga con nombre entero y, si es otra, el de la liga más alta («En el Mundial, …»); los ids empiezan por el
    // tuyo (la noticia abre su ficha). (Antes era una lista de códigos cortos, «MA1 (Hiperliga)», que el jugador no ve en ningún sitio)
    var mi = lgs.indexOf(ml), champs = an.lg.map(function (t) { return t[0]; }), ti = lgs.length - 1;
    var elL = function (L) { return (L.art === 'la' ? 'la ' : 'el ') + L.name; }, kName = function (id) { var k = X.club(c, id); return k ? k.name : '?'; };
    if (mi >= 0 && champs[mi] != null) {
      var cht = fill(TPL.champs[0], { a: kName(champs[mi]), elL: elL(lgBy(c, lgs[mi])), n: c.season });
      if (ti !== mi && champs[ti] != null) cht += '. En ' + elL(lgBy(c, lgs[ti])) + ', ' + kName(champs[ti]);
      addNews(c, 'champs', { t: cht, v: 0 }, [champs[mi]].concat(champs.filter(function (x, i) { return i !== mi; })), 0, W_END);
    }
    // la final de tu open (pista: la de cada copa de la temporada, la nacional y las internacionales de tu región)
    var cu = !H && c.cup && c.cup.final && c.cup.res && c.cup.res[1] && c.cup.res[1][0];
    if (cu && cu.s && cu.sc) {
      var win = cu.s[0] > cu.s[1], ka = X.club(c, win ? cu.a : cu.b), kb = X.club(c, win ? cu.b : cu.a), cup = lgOf(c, me).cup;
      if (ka && kb) addNews(c, 'open', tpl(c, 'open', r, { a: ka.name, b: kb.name, elCup: (/^(Final|Copa)/.test(cup) ? 'la ' : 'el ') + cup, sc: scTxt(win ? cu.sc : flip(cu.sc)) }), [ka.id, kb.id], 0, W_END);
    }
    if (H) (c.kos || []).slice(0, 3).forEach(function (ko) {
      var fr = ko && ko.rounds && ko.rounds.length && ko.res && ko.res[ko.rounds.length - 1], fm = fr && fr[0];
      if (!fm || !fm.s || !fm.sc || !(ko.champion >= 0)) return;
      var win = fm.s[0] > fm.s[1], ka = X.club(c, win ? fm.a : fm.b), kb = X.club(c, win ? fm.b : fm.a);
      if (ka && kb) addNews(c, 'cup', tpl(c, 'cup', r, { a: ka.name, b: kb.name, cup: ko.name, sc: scTxt(win ? fm.sc : flip(fm.sc)) }), [ka.id, kb.id], 0, W_END);
    });
    // ascensos y descensos: solo los de tu liga, en una frase
    var nm = function (ids) { return andList(ids.map(function (id) { var k = X.club(c, id); return k ? k.name : '?'; })); };
    var ups = an.up.filter(function (id) { var k = X.club(c, id); return k && lvOf(k) === ml; }), dns = an.dn.filter(function (id) { var k = X.club(c, id); return k && lvOf(k) === ml; });
    var upL = lgs.indexOf(ml) >= 0 && lgs.indexOf(ml) < lgs.length - 1 ? lgBy(c, lgs[lgs.indexOf(ml) + 1]) : null, dnL = lgs.indexOf(ml) > 0 ? lgBy(c, lgs[lgs.indexOf(ml) - 1]) : null, parts = [];
    if (ups.length && upL) parts.push('Suben ' + X.toL(upL) + ': ' + nm(ups));
    if (dns.length && dnL) parts.push((parts.length ? 'bajan ' : 'Bajan ') + X.toL(dnL) + ': ' + nm(dns));
    if (parts.length) addNews(c, 'moves', { t: parts.join('; '), v: 0 }, ups.concat(dns), 0, W_END);
  }
  /** Open de una liga que no es la tuya (career.js solo juega el de tu liga): 1-4 y 2-3, determinista, solo para los anales. */
  function simOpen(c, L, t) {
    var r = rngOf(c.seed, 'open-w', c.season, L), X = E(c), o = function (id) { var k = X.club(c, id); return (k ? X.clubOvr(k) : 50) + (r() - 0.5) * 4; };
    var win = function (a, b) { var q = X.quickSim(o(a), o(b), r, X.PTS); return q.sets[0] > q.sets[1] ? a : b; };
    return win(win(t[0], t[3]), win(t[1], t[2]));
  }
  /** Verano (gancho 'newSeason', ya en la temporada nueva): 2 rumores de mercado con jugadores inventados (ambientación). */
  function summerNews(c) {
    if (!MKT) return;
    var X = E(c), me = X.myClub(c); if (!me) return;
    var r = rngOf(c.seed, 'news-mkt', c.season), lvl = lvOf(me), A = artL(lgOf(c, me));
    var pool = clubsIn(c, lvl).filter(function (k) { return k.id !== me.id; });
    for (var i = 0; i < 2 && pool.length > 1; i++) {
      var a = pick(r, pool), b = pick(r, pool.filter(function (k) { return k.id !== a.id; })), nmx = isH(c) ? X._name(r) : X._newMate(c, a, r).name;
      addNews(c, 'mkt', tpl(c, 'mkt', r, { a: a.name, b: b.name, nm: nmx, deL: A.deL, n: (c.season | 0) + 1 + Math.floor(r() * 2) }), [a.id, b.id], 0, W_SUMMER);
    }
  }
  /** Noticias de la más nueva a la más vieja (temporada, jornada —verano 0, fin 15— y orden de llegada). */
  function news(c, n) {
    var w = c && c.world; if (!w || !Array.isArray(w.news)) return [];
    var l = w.news.slice().sort(function (a, b) { return b.s - a.s || b.w - a.w || b.id - a.id; });
    return n ? l.slice(0, n) : l;
  }
  function newsUnseen(c) { var w = c && c.world; if (!w || !Array.isArray(w.news)) return 0; var s = w.newsSeen | 0; return w.news.filter(function (x) { return x.id > s; }).length; }
  /** Al abrir Liga › Noticias. Devuelve cuántas había sin ver. */
  function markNewsSeen() { var c = K().load(); if (!c) return 0; var w = ensure(c), n = newsUnseen(c); if (n) { w.newsSeen = w.newsN; K().save(c); } return n; }
  /** Antetítulo de una noticia: «T3 J5», «T3 Verano», «T3 Open» (la final; pista: «T3 Copa») o «T3 Cierre» (campeones y movimientos). */
  function newsWhen(x) { return 'T' + x.s + ' ' + (x.w === W_SUMMER ? 'Verano' : x.w >= W_END ? (x.k === 'open' ? 'Open' : x.k === 'cup' ? 'Copa' : 'Cierre') : 'J' + x.w); }
  /** C3: noticia de la liga cuando tumbas al jefe del circuito (la llama career-life.js, con guarda, en la 1ª victoria jugada).
   *  boss = {name, nick, club, …}. Una por jefe y temporada. wk opcional (jornada; por defecto, la que se acaba de jugar). */
  function newsBoss(c, boss, wk) {
    if (!c || !boss || !boss.name || !c.player) return null;
    var w = ensure(c), s = c.season | 0, X = E(c);
    if (w.news.some(function (x) { return x.k === 'boss' && x.s === s && x.c[0] === boss.club; })) return null;
    if (wk == null) wk = isH(c) || c.phase === 'league' ? Math.max(1, c.week | 0) : (X && X.WEEKS) | 0 || W_END - 1;
    var t = fill(TPL.boss[0], { a: boss.name, nick: boss.nick || '', p: c.player.name }).replace(/ «»/, '');
    wk = Math.min(W_END - 1, Math.max(1, wk | 0));
    // como mucho ROUND_MAX noticias por jornada: si ya están, la del jefe ocupa el sitio de la menos tuya (ajena antes que del rival)
    var same = w.news.filter(function (x) { return x.s === s && x.w === wk; });
    if (same.length >= ROUND_MAX) {
      var drop = null; same.forEach(function (x) { if (x.me !== 1 && (!drop || (x.me | 0) < (drop.me | 0))) drop = x; });
      if (!drop) return null;   // (las 3 ya son tuyas: la del jefe no desplaza a ninguna)
      w.news = w.news.filter(function (x) { return x !== drop; });
    }
    addNews(c, 'boss', { t: t, v: 0 }, [boss.club, c.myClub], 1, wk);
    return w.news[w.news.length - 1];
  }

  // ------------------------------------------------------------------ enciclopedia de clubes (E5b)
  // Apodos de cosas del mar (no de personas): masculinos y femeninos sin marcar género de nadie.
  var NICKS = ['Los Cangrejos', 'La Marea', 'Las Gaviotas', 'Los Delfines', 'La Ola', 'Los Erizos', 'La Brisa', 'Las Medusas', 'Los Pelícanos', 'El Faro', 'La Espuma', 'Los Albatros',
    'Las Caracolas', 'El Oleaje', 'Los Tiburones', 'La Duna', 'Los Corsarios', 'La Resaca', 'Los Salinos', 'Las Mareas Vivas'];
  // Pista: apodos y lemas de pabellón (sin mar), con el mismo cuidado de no marcar el género de nadie.
  var NICKS6 = ['Los Halcones', 'La Muralla', 'Los Lobos', 'La Fortaleza', 'Las Águilas', 'El Muro', 'Los Toros', 'La Marea Roja', 'Los Linces', 'La Colmena',
    'El Vendaval', 'Los Búhos', 'La Forja', 'Los Cometas', 'La Tormenta', 'Los Osos', 'El Trueno', 'Las Panteras', 'Los Zorros', 'La Avalancha'];
  var MOTTOS6 = ['Ni un balón al suelo', 'La red es nuestra casa', 'Seis como uno', 'Bloqueo y corazón', 'Del barrio al mundo', 'Pabellón lleno, red alta', 'Nunca dejamos de saltar', 'Cada punto, una batalla'];
  var MOTTOS = ['Nacido en la orilla', 'Arena en las venas', 'Ni un balón al suelo', 'De la cala al mundo', 'Sol, sal y bloqueo', 'Siempre de cara al viento', 'La red es nuestra casa', 'Cada punto, una ola'];
  /** Historia inventada (pura, por semilla e id; no se guarda): fundación, apodo, lema y títulos de antes de tu carrera. */
  function lore(c, k) {
    if (!c || !k) return null;
    var H = isH(c), L = H && lgOf(c, k), r = rngOf(c.seed, 'lore', k.id), ym = /(\d{4})$/.exec(k.name || ''), lv = H ? (L ? Math.max(0, Math.min(4, Math.round((L.strength - 50) / 10))) : 0) : lvOf(k) | 0;
    var founded = ym ? +ym[1] : 1962 + Math.floor(r() * 50);
    var old = Math.max(0, Math.min(4, Math.round((k.q != null ? k.q : 0.5) * 3 * r() + lv * 0.6 * r() - 0.6)));
    var cups = Math.max(0, Math.min(4, Math.round(old * 0.8 * r() + r() - 0.4)));
    return { founded: founded, nick: pick(r, H ? NICKS6 : NICKS), motto: pick(r, H ? MOTTOS6 : MOTTOS), oldLg: old, oldCup: cups };
  }
  /** Filas de Liga › Clubes (orden de tabla): kit, posición, puntos, media, estrellas, cara a cara contigo y marcas. */
  function clubRows(c, lvl) {
    if (!c || !c.clubs) return [];
    var X = E(c), w = ensure(c), rv = c.life && c.life.rival;
    return X.table(c, lvl).map(function (row) {
      var k = X.club(c, row.id); if (!k) return null;
      var h = w.h2h[k.id];
      return { id: k.id, name: k.name, short: k.short, kit: k.kit, pos: row.pos, pts: row.pts, pj: row.pj, ovr: X.clubOvr(k), stars: X.clubInfo(c, k).stars,
        vs: h && h[0] ? { pj: h[0], g: h[1], p: h[2] } : null, mine: k.id === c.myClub, rival: !!(rv && rv.club === k.id) };
    }).filter(function (x) { return x; });
  }
  /** Ficha de un club: datos, historia inventada, palmarés de tu carrera (anales y, antes del sprint, tus trofeos con él),
   *  trayectoria (8 últimas temporadas), forma y cara a cara. null si el id no existe. */
  function clubCard(c, id) {
    if (!c || !c.clubs) return null;
    var X = E(c), w = ensure(c), k = X.club(c, id); if (!k) return null;
    var inf = X.clubInfo(c, k), lo = lore(c, k), lvl = lvOf(k), titles = [], path = [], lgs0 = leaguesOf(c), seenT = {};
    var addT = function (t) { var key = t.s + ':' + t.kind; if (seenT[key]) return; seenT[key] = 1; titles.push(t); };
    w.annals.forEach(function (a) {
      var lgs = Array.isArray(a.l) ? a.l : lgs0;   // (pista: los ids de las ligas de esa temporada)
      for (var i = 0; i < a.lg.length; i++) {
        var p = a.lg[i].indexOf(id); if (p < 0) continue;
        var L = lgs[i] != null ? lgs[i] : i, LL = lgBy(c, L), up = a.up.indexOf(id) >= 0, dn = a.dn.indexOf(id) >= 0; if (!LL) continue;
        path.push({ s: a.s, lvl: L, league: LL.short, pos: p + 1, move: up ? 1 : dn ? -1 : 0 });
        if (p === 0) addT({ s: a.s, kind: 'liga', name: LL.name });
        if (a.cup[i] === id) addT({ s: a.s, kind: 'copa', name: LL.cup || a.cn || 'Copa' });
        if (up && i < lgs.length - 1 && lgBy(c, lgs[i + 1])) addT({ s: a.s, kind: 'ascenso', name: 'Ascenso ' + X.toL(lgBy(c, lgs[i + 1])) });
      }
    });
    // temporadas de antes del sprint 5 (antes de w.since): tus trofeos con este club, «(contigo)»
    (c.trophies || []).forEach(function (t) {
      if (t && t.club === k.name && t.kind !== 'premio' && (t.season | 0) < (w.since | 0)) addT({ s: t.season | 0, kind: t.kind, name: t.name, you: 1 });
    });
    titles.sort(function (a, b) { return a.s - b.s; });
    var t = X.table(c, lvl), row = t.filter(function (x) { return x.id === id; })[0], h = w.h2h[id], rv = c.life && c.life.rival;
    var form = [], R = resOf(c, lvl), wk = Math.min(c.phase === 'league' ? c.week - 1 : R.length - 1, R.length - 1);
    for (var i = wk; i >= 0 && form.length < 5; i--) { var m = (R[i] || []).filter(function (x) { return x && (x.a === id || x.b === id); })[0]; if (m) form.unshift((m.a === id) === (m.s[0] > m.s[1]) ? 1 : 0); }
    var mySeasons = (c.history || []).filter(function (x) { return x && x.club === id; }).map(function (x) { return x.season; });
    if (c.myClub === id && mySeasons.indexOf(c.season) < 0) mySeasons.push(c.season);
    return { id: id, name: k.name, short: k.short, kit: k.kit, city: k.city, beach: k.beach || '', league: inf.league, lvl: lvl, stars: inf.stars, style: inf.style, ovr: inf.ovr,
      lore: lo, pos: row && row.pj ? row.pos : 0, pts: row ? row.pts : 0, pj: row ? row.pj : 0, form: form, titles: titles, path: path.slice(-8),
      vs: h && h[0] ? { pj: h[0], g: h[1], p: h[2], sf: h[3], sc: h[4], last: h[5] } : null,
      rival: rv && rv.club === id ? { name: rv.name, w: rv.w | 0, l: rv.l | 0 } : null, mine: c.myClub === id, mySeasons: mySeasons, since: w.since | 0 };
  }

  // ------------------------------------------------------------------ escudos paródicos (S2 B2b) y vitrina con huecos (B2c)
  // Escudo: forma, partición y emblema por un hash de cadenas (playa: la ciudad, que no cambia con los renombrados; pista: el nombre),
  // nunca g.rng. Colisiones: dentro de un grupo fijo (playa: los 40 clubes; pista: los de un país, que suben y bajan entre su 1ª y su 2ª)
  // no se repite la terna, así que tampoco dentro de una liga. Se resuelve recorriendo el grupo por id: determinista y estable.
  var CREST_SHAPES = ['clasico', 'redondo', 'frances', 'hex', 'moderno'], CREST_DIVS = ['liso', 'partido', 'tronchado', 'franja', 'cuartel'];
  var CREST_EMB = ['balon', 'estrella', 'ola', 'sol', 'red', 'torre', 'ancla', 'rayo'], CREST_EMB_H = ['balon', 'estrella', 'red', 'torre', 'ancla', 'rayo'];
  var CREST_SALT = {};   // nombre del club → sal (por si Ferran ve uno que «recuerda» a un escudo real)
  var CREST_INK = 0x1d1530, CREST_WHITE = 0xffffff, CREST_MIN = 0.18;
  /** Hash de una cadena (FNV-1a, el mismo que hash() de career.js con un argumento). */
  function hstr(s) { var h = 2166136261; s = String(s); for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619); } h ^= 124; return h >>> 0; }
  function colN(v, d) { if (typeof v === 'number' && isFinite(v)) return (v >>> 0) & 0xffffff; if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) return parseInt(v.replace('#', ''), 16); return d; }
  function lumC(h) { return (0.299 * (h >> 16 & 255) + 0.587 * (h >> 8 & 255) + 0.114 * (h & 255)) / 255; }
  function crestCols(k) {
    var kit = k && k.kit || {}, c1 = colN(kit.shirt, 0xd8262e), c2 = colN(kit.accent, CREST_WHITE), l1 = lumC(c1);
    if (Math.abs(l1 - lumC(c2)) < CREST_MIN) c2 = Math.abs(l1 - 1) >= Math.abs(l1 - lumC(CREST_INK)) ? CREST_WHITE : CREST_INK;
    return [c1, c2];
  }
  function crestSeed(k, hall) { return (hstr('crest|' + (hall ? 'h|' + k.name : 'b|' + (k.city || k.name))) + Math.imul(CREST_SALT[k.name] | 0, 2654435761)) >>> 0; }
  /** Terna base (sin resolver colisiones): índices de forma, partición y emblema. */
  function crestBase(k, hall) { var s = crestSeed(k, hall), nE = (hall ? CREST_EMB_H : CREST_EMB).length; return [s % 5, Math.floor(s / 5) % 5, Math.floor(s / 25) % nE]; }
  function crestMake(k, hall, t) {
    var cols = crestCols(k), E2 = hall ? CREST_EMB_H : CREST_EMB;
    return { shape: CREST_SHAPES[t[0]], div: CREST_DIVS[t[1]], emblem: E2[t[2]], c1: cols[0], c2: cols[1], txt: String(k.short || ''), year: 0 };
  }
  var crestCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  /** Escudos de un grupo (lista de clubes crudos) por id, con las colisiones resueltas. Caché por array de clubes y grupo. */
  function crestGroup(list, hall, gk) {
    var per = crestCache && crestCache.get(list);
    if (!per) { per = {}; if (crestCache) crestCache.set(list, per); }
    if (per[gk]) return per[gk];
    var ks = list.filter(function (k) { return k && (hall ? 'h|' + k.cc : 'b') === gk; }).sort(function (a, b) { return a.id - b.id; });
    var used = {}, out = {}, nE = (hall ? CREST_EMB_H : CREST_EMB).length, N = 25 * nE;
    ks.forEach(function (k) {
      var b = crestBase(k, hall), t = b;
      for (var i = 0; i < N; i++) {
        t = [(b[0] + Math.floor(i / (nE * 5))) % 5, (b[1] + Math.floor(i / nE)) % 5, (b[2] + i) % nE];
        if (!used[t.join()]) break;
      }
      used[t.join()] = 1; out[k.id] = crestMake(k, hall, t);
    });
    return (per[gk] = out);
  }
  /** La Carrera (playa o pista) guardada que tiene a este club, para resolver colisiones y el año sin que la UI pase c. */
  function crestCarrera(k, hall) {
    try {
      var X = K() && K()[hall ? 'hall' : 'beach'], c = X && X.load ? X.load() : null;
      return c && Array.isArray(c.clubs) && c.clubs[k.id] && c.clubs[k.id].name === k.name ? c : null;
    } catch (e) { return null; }
  }
  /** Escudo de un club → {shape, div, emblem, c1, c2, txt, year}. mode: la Carrera c (mejor), 'beach' | 'hall', o nada (pista si el
   *  club tiene lid). mates: lista de clubes opcional (si no, los de c o los de la Carrera guardada). Determinista; year = fundación. */
  function crestOf(k, mode, mates) {
    if (!k) return null;
    var c = mode && typeof mode === 'object' ? mode : null;
    var hall = c ? isH(c) : mode === 'hall' ? true : mode === 'beach' ? false : k.lid != null;
    if (!c && !Array.isArray(mates)) c = crestCarrera(k, hall);
    var list = Array.isArray(mates) ? mates : c && Array.isArray(c.clubs) ? c.clubs : null, raw = null;
    if (list) {
      raw = list[k.id] && list[k.id].id === k.id ? list[k.id] : list.filter(function (x) { return x && x.id === k.id; })[0];
      if (raw && raw.name !== k.name) raw = null;
    }
    var r = raw ? crestGroup(list, hall, hall ? 'h|' + raw.cc : 'b')[raw.id] : crestMake(k, hall, crestBase(k, hall));
    var y = /(\d{4})$/.exec(k.name || ''), year = y ? +y[1] : 0;
    if (!year && c && raw) { try { var lo = lore(c, raw); year = lo ? lo.founded | 0 : 0; } catch (e) { year = 0; } }
    return { shape: r.shape, div: r.div, emblem: r.emblem, c1: r.c1, c2: r.c2, txt: r.txt, year: year };
  }

  /** Premios de la gala (los de CareerLife si está; si no, copia de los ids y nombres). */
  var AW_FALLBACK = [{ id: 'mvp', name: 'MVP' }, { id: 'pts', name: 'Máximo anotador' }, { id: 'ace', name: 'Mejor sacador' }, { id: 'blk', name: 'Muro del año' },
    { id: 'dig', name: 'Mejor defensa' }, { id: 'set', name: 'Mejor colocador', only: 'hall' }, { id: 'rook', name: 'Revelación' }];
  var TC_GROUP_H = { liga: 'Liga', copa: 'Copa', intl: 'Internacional', ascenso: 'Ascenso' }, TC_OTHER = 'Otros títulos';
  var TC_NEED_H = { liga: 'Gana la liga', copa: 'Gana la copa', intl: 'Gana la competición', ascenso: 'Sube a la 1ª' };
  // Logros que Vestuario usa como desbloqueo y a qué huecos van ligados (solo lectura de VB.Look: el sistema de desbloqueos es el suyo)
  function tcTitle(s) { return s.kind === 'liga' || s.kind === 'copa' || s.kind === 'intl'; }
  var TC_ACH = { up: function (s) { return s.kind === 'ascenso'; }, t1: tcTitle, t5: tcTitle, mvp: function (s) { return s.id === 'aw-mvp'; }, aw1: function (s) { return s.kind === 'premio'; } };
  function tcUnlock(s, hall) {
    var Lk = VB.Look; if (!Lk || !Array.isArray(Lk.CATALOG)) return null;
    try {
      for (var i = 0; i < Lk.CATALOG.length; i++) {
        var it = Lk.CATALOG[i]; if (!it || !it.id || (it.venue === 'P' && !hall) || (it.venue === 'Y' && hall)) continue;
        var u = Array.isArray(it.unlock) ? it.unlock : [], hit = false;
        for (var j = 0; j < u.length && !hit; j++) hit = !!(u[j] && ((u[j].award && s.id === 'aw-' + u[j].award) || (u[j].ach && TC_ACH[u[j].ach] && TC_ACH[u[j].ach](s))));
        if (hit && !(typeof Lk.owned === 'function' && Lk.owned(it.id))) return { id: it.id, name: String(it.name || it.id) };
      }
    } catch (e) { }
    return null;
  }
  function byId(a, id) { for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  /** Vitrina de palmarés con huecos → {slots:[{id, group, kind, name, need, won:[{season, club, d}], unlock}], total, got, other:[…]}.
   *  Playa: 20 huecos fijos (por circuito Campeón, Open y Ascenso, menos el Ascenso del Mundial; y 6 premios). Pista: liga, copa,
   *  internacional (rangos 1 y 2) y ascenso de tu país, más las otras que hayas ganado, y 7 premios. Lo que no case va a other. */
  function trophyCase(c) {
    if (!c) return null;
    var hall = isH(c), X = E(c), slots = [], other = [], byKey = {};
    var add = function (id, group, kind, name, need) {
      var s = { id: id, group: group, kind: kind, name: String(name || ''), need: need || '', won: [], unlock: null };
      slots.push(s); if (kind !== 'premio') byKey[kind + '|' + s.name] = s; return s;
    };
    if (!hall) {
      var LG = (K().beach || K()).LEAGUES || [];
      LG.forEach(function (L, i) {
        add('b' + i + '-liga', L.short, 'liga', L.name, 'Gana el circuito');
        add('b' + i + '-copa', L.short, 'copa', L.cup, 'Gana el Open');
        if (i < LG.length - 1) add('b' + i + '-up', L.short, 'ascenso', 'Ascenso ' + X.toL(LG[i + 1]), 'Sube de circuito');
      });
    } else {
      var me = c.myClub >= 0 && X.myClub(c), cc = me ? me.cc : c.cc;
      var L1 = cc && lgBy(c, cc + '1'), L2 = cc && lgBy(c, cc + '2');
      if (L1) add('h-lg-' + L1.id, 'Liga', 'liga', L1.name, TC_NEED_H.liga);
      if (L2) add('h-lg-' + L2.id, 'Liga', 'liga', L2.name, TC_NEED_H.liga);
      if (cc) add('h-cup-' + cc, 'Copa', 'copa', c.cups && c.cups[cc] && c.cups[cc].name || 'Copa Nacional', TC_NEED_H.copa);
      var it = cc && X.intlFor ? X.intlFor(c, cc) : [];
      (it || []).forEach(function (cp) { if (cp && (cp.rank === 1 || cp.rank === 2)) add('h-intl-' + cp.rank, 'Internacional', 'intl', cp.name, TC_NEED_H.intl); });
      if (L1 && L2) add('h-up-' + cc, 'Ascenso', 'ascenso', 'Ascenso a la ' + L1.name, TC_NEED_H.ascenso);
    }
    var AW = (VB.CareerLife && Array.isArray(VB.CareerLife.AWARDS) ? VB.CareerLife.AWARDS : AW_FALLBACK).filter(function (a) { return !a.only || a.only === (hall ? 'hall' : 'beach'); });
    AW.forEach(function (a) { add('aw-' + a.id, 'Premios', 'premio', a.name, a.id === 'rook' ? 'Una vez, con 23 años o menos' : 'Premio de la gala'); });
    var tro = Array.isArray(c.trophies) ? c.trophies : [], aws = c.life && Array.isArray(c.life.awards) ? c.life.awards : [];
    var push = function (s, t) { s.won.push({ season: t.season | 0, club: t.club || '', d: t.d || '' }); };
    var toOther = function (t) {
      var key = t.kind + '|' + t.name, o = null;
      for (var i = 0; i < other.length; i++) if (other[i].key === key) o = other[i];
      if (!o) { o = { id: 'x-' + other.length, key: key, group: TC_OTHER, kind: t.kind || '', name: String(t.name || ''), need: '', won: [], unlock: null }; other.push(o); }
      push(o, t);
    };
    // premios: por id (c.life.awards); los trofeos 'premio' no cuentan dos veces (solo los que no tengan su award, por el nombre)
    aws.forEach(function (a) {
      if (!a) return;
      var s = byId(slots, 'aw-' + a.id), t = tro.filter(function (x) { return x && x.kind === 'premio' && (x.season | 0) === (a.season | 0) && x.name === a.name; })[0];
      if (s) push(s, { season: a.season, club: a.club, d: t && t.d }); else toOther({ kind: 'premio', name: a.name, season: a.season, club: a.club, d: t && t.d });
    });
    tro.forEach(function (t) {
      if (!t || !t.kind) return;
      if (t.kind === 'premio') {
        if (aws.some(function (a) { return a && (a.season | 0) === (t.season | 0) && a.name === t.name; })) return;
        var aw = AW.filter(function (a) { return t.name === a.name || String(t.name).indexOf(a.name + ' ') === 0; })[0];
        if (aw) push(byId(slots, 'aw-' + aw.id), t); else toOther(t);
        return;
      }
      var s = byKey[t.kind + '|' + t.name];
      if (!s && hall && TC_GROUP_H[t.kind]) s = add('h-x' + slots.length, TC_GROUP_H[t.kind], t.kind, t.name, TC_NEED_H[t.kind]);   // (liga de otro país, otra copa…)
      if (s) push(s, t); else toOther(t);
    });
    var got = 0;
    slots.forEach(function (s) { s.won.sort(function (a, b) { return a.season - b.season; }); if (s.won.length) got++; s.unlock = tcUnlock(s, hall); });
    other.forEach(function (o) { o.won.sort(function (a, b) { return a.season - b.season; }); delete o.key; });
    if (hall) {   // (pista: los grupos en su orden aunque se hayan añadido huecos al final)
      var GO = ['Liga', 'Copa', 'Internacional', 'Ascenso', 'Premios'];
      slots = slots.map(function (s, i) { return [s, i]; }).sort(function (a, b) { return GO.indexOf(a[0].group) - GO.indexOf(b[0].group) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    }
    return { slots: slots, total: slots.length, got: got, other: other, hall: hall };
  }

  // ------------------------------------------------------------------ ganchos de career.js (después de CareerLife)
  // ------------------------------------------------------------------ rivalidad (ambiente de Carrera, notes/ambiente.md §2D)
  // c.world.riv[clubId] = {h 0..1, m (cruces), w, l, last:{season, wk, r:'W'|'L'}, why:[≤4]}: sube con partidos apretados, tarjetas,
  // finales y derbis; baja ×0,6 al empezar temporada. Entra en el calor del partido (career.js ambCtx) y en los mensajes de la semana.
  var RIV_MAX = 40, RIV_DECAY = 0.6;
  function rivOf(w, id) {
    if (!w.riv || typeof w.riv !== 'object' || Array.isArray(w.riv)) w.riv = {};
    var r = w.riv[id];
    if (!r || typeof r !== 'object') r = w.riv[id] = { h: 0, m: 0, w: 0, l: 0, last: null, why: [] };
    if (!(r.h >= 0)) r.h = 0; if (!Array.isArray(r.why)) r.why = [];
    return r;
  }
  function rivAfter(c, w, sum, f) {
    if (!sum || sum.bench || !sum.sets || sum.rival == null) return;
    var S = VB.ctx && VB.ctx.settings; if (S && S.ambient === 'off') return;   // («Apagado»: c.world no cambia, como antes)
    var r = rivOf(w, sum.rival), a = sum.amb, add = 0, why = '';
    r.m = (r.m | 0) + 1; if (sum.win) r.w = (r.w | 0) + 1; else r.l = (r.l | 0) + 1;
    var ss = sum.setScores || [], tight = Math.min(sum.sets[0] | 0, sum.sets[1] | 0) > 0 || ss.some(function (x) { return x && Math.abs((x[0] | 0) - (x[1] | 0)) <= 2; });
    if (tight) { add += 0.08; why = 'apretado'; }
    if (a && a.cards) { var reds = a.cards.filter(function (x) { return x.color === 'red' || x.color === 'delayR'; }).length; if (reds) { add += 0.1 * reds; why = 'tarjetas'; } }
    var fin = a && a.tags && a.tags.indexOf('final') >= 0 || /final/i.test(String(sum.label || '')) && !/semi/i.test(String(sum.label || ''));
    if (fin) { add += 0.2; why = 'final'; }
    if (a && a.tags && a.tags.indexOf('derbi') >= 0) { r.h = Math.max(r.h, 0.3); if (!why) why = 'derbi'; }
    r.h = Math.min(1, Math.round((r.h + add) * 100) / 100);
    r.last = { season: sum.season | 0, wk: (f && (f.kind === 'league' ? f.week : f.round)) | 0, r: sum.win ? 'W' : 'L' };
    if (why) { r.why.push(why); if (r.why.length > 4) r.why = r.why.slice(-4); }
    // tope: se quedan las RIV_MAX de más rivalidad
    var ids = Object.keys(w.riv);
    if (ids.length > RIV_MAX) { ids.sort(function (x, y) { return (w.riv[x].h || 0) - (w.riv[y].h || 0); }); ids.slice(0, ids.length - RIV_MAX).forEach(function (id) { if (+id !== sum.rival) delete w.riv[id]; }); }
  }
  function rivSeason(c) {
    var w = ensure(c); if (!w.riv) return;
    Object.keys(w.riv).forEach(function (id) { var r = w.riv[id]; if (r) r.h = Math.round((+r.h || 0) * RIV_DECAY * 100) / 100; });
  }

  function afterMatch(c, sum, f) {
    if (!sum) return;
    var w = ensure(c), T = c.career || {};
    if (!sum.bench && sum.sets) addH2h(w, sum.rival, sum.sets, sum.season);
    try { rivAfter(c, w, sum, f); } catch (e) { try { console.error('CareerWorld riv', e); } catch (e2) { } }
    try { roundNews(c, sum, f); } catch (e) { try { console.error('CareerWorld roundNews', e); } catch (e2) { } }
    if (sum.bench) { beat(c, 'bench1'); return; }
    if (sum.win && (T.won | 0) === 1) beat(c, 'win1');
    if (!sum.win && (T.played | 0) - (T.won | 0) === 1) beat(c, 'loss1');
    if (c.life && c.life.rival && c.life.rival.name) beat(c, 'rival', { rival: c.life.rival.name });
    if (c.life && c.life.streak === 5) beat(c, 'streak');
    var ln = (c.notes || []).slice(-3);
    if (!sum.win && ln.length === 3 && ln.every(function (n) { return n && !n.win; })) { var tp = slumpTip(c); beat(c, 'slump', { n: 3, tip: tp[0], act: tp[1], al: tp[2] }); }
  }
  function cupTitle(cup) { return 'Título ' + (/^(Final|Copa)/.test(cup) ? 'de la ' : 'del ') + cup; }
  function seasonEnd(c) {
    var X = E(c), r = c.review || {}, me = X.myClub(c); if (!me) return;
    try { seasonNews(c); } catch (e) { try { console.error('CareerWorld seasonNews', e); } catch (e2) { } }
    var L = lgOf(c, me), lgs = leaguesOf(c), li = lgs.indexOf(lvOf(me));
    // pista: r.cups (copa nacional e internacionales) en vez de r.cup; «Título: Copa de la Corona»
    var myCup = isH(c) ? (r.cups || []).filter(function (x) { return x && x.champion === me.id; })[0] : null;
    if (r.champion || r.cup || myCup) beat(c, 'title', { title: r.champion ? 'Título ' + (L.art === 'la' ? 'de la ' : 'del ') + L.name : myCup ? 'Título: ' + myCup.name : cupTitle(L.cup) });
    if (r.awards && r.awards.length) beat(c, 'award', { award: r.awards[0] });
    var up = li >= 0 && li < lgs.length - 1 ? lgBy(c, lgs[li + 1]) : null;
    if (r.move > 0 && up) beat(c, 'up', { toL: X.toL(up) });
    if (r.move < 0) beat(c, 'down');
  }
  function seasonStart(c) {
    try { summerNews(c); } catch (e) { try { console.error('CareerWorld summerNews', e); } catch (e2) { } }
    try { rivSeason(c); } catch (e) { try { console.error('CareerWorld rivSeason', e); } catch (e2) { } }
    var me = E(c).myClub(c);
    if (me && isTop(c, lvOf(me))) beat(c, 'top', { lg: lgOf(c, me).name });
    if (c.player && (c.player.age | 0) >= 30) beat(c, 'vet');
  }
  function onJoin(c) {
    var T = c.career || {}, me = E(c).myClub(c); if (!me) return;
    if ((T.played | 0) === 0 && !(T.bench | 0)) beat(c, 'debut', { club: me.name });
    else beat(c, 'move', { mate: c.mate ? c.mate.name : 'tu pareja' });
  }
  function hook(c, kind, a, b) {
    if (!c) return;   // (las dos Carreras: playa y pista)
    if (kind === 'match') afterMatch(c, a, b);
    else if (kind === 'season') seasonEnd(c);
    else if (kind === 'newSeason') seasonStart(c);
    else if (kind === 'create') { ensure(c); beat(c, 'hola'); }
    else if (kind === 'join') onJoin(c, a);
    else if (kind === 'sess') beat(c, 'ses1');   // primera sesión de entrenamiento de la carrera (career.js sessDo)
  }

  VB.CareerWorld = {
    hook: hook, ensure: ensure, MENTOR: MENTOR, BEATS: BEATS, BEAT_ORDER: BEAT_ORDER, LINE_MAX: LINE_MAX, Q_MAX: Q_MAX,
    mentorScene: mentorScene, mentorDone: mentorDone, mentorSkip: mentorSkip, mentorSkipAll: mentorSkipAll, setMentor: setMentor, mentorOn: mentorOn,
    _beat: beat, _slumpTip: slumpTip,
    // E5 (C2): noticias y enciclopedia de clubes
    TPL: TPL, NEWS_MAX: NEWS_MAX, ANNALS_MAX: ANNALS_MAX, W_SUMMER: W_SUMMER, W_END: W_END, MKT: MKT,
    news: news, newsUnseen: newsUnseen, markNewsSeen: markNewsSeen, newsWhen: newsWhen,
    lore: lore, clubRows: clubRows, clubCard: clubCard, leaguesOf: leaguesOf, topLv: topLv, otherLv: otherLv, isTop: isTop, lgBy: lgBy, lgOf: lgOf, BEATS_H: BEATS_H,
    _andList: andList, _ordn: ordn,
    // ambiente de Carrera: rivalidad persistente (c.world.riv)
    rivOf: function (c, id) { var w = c && c.world; return w && w.riv && w.riv[id] || null; }, RIV_MAX: RIV_MAX, RIV_DECAY: RIV_DECAY,
    // S2-S4 (T11): escudos, vitrina y noticia del jefe
    crestOf: crestOf, trophyCase: trophyCase, newsBoss: newsBoss, CREST_SHAPES: CREST_SHAPES, CREST_DIVS: CREST_DIVS, CREST_EMB: CREST_EMB, CREST_EMB_H: CREST_EMB_H,
    CREST_MIN: CREST_MIN, CREST_SALT: CREST_SALT, _lum: lumC
  };
})();
