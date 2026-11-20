/* MAKE THE CUT — js/career-story.js (owner: carrera)
 * «Carrera con vida» (sprint 1.13.0, notes/carrera-vida.md): núcleo VB.CareerStory. Entre partido y partido el mundo te pide 1-3
 * cosas pequeñas (mensajes con respuesta, prensa, tu semana, pacto, redes…). Este fichero NO trae contenido: es el contrato común
 * de los subsistemas (career-story-msgs.js, -week.js, -wall.js, -season.js) y de su interfaz (career-story-ui.js).
 * Sin DOM (se carga en node: tools/storytest.js, tools/careertest.js). Vale para las DOS Carreras (playa y pista, c.mode 'hall').
 * Sin este fichero (o sin los subsistemas) la Carrera queda exactamente igual.
 *
 * ================================================================== REGLAS (obligatorias para todos los subsistemas)
 *  - Regla de oro: solo una ELECCIÓN del jugador (responder, elegir carta, aceptar pacto, contestar a la prensa, publicar) toca el
 *    núcleo (c.coach, c.mate.chem / c.chem, c.fatigue, c.money, c.tp y la fama c.life.fame), y siempre a través de fx(). Todo lo
 *    pasivo vive en c.story. Nunca m.attrs, ofertas, c.trophies ni c.player.
 *  - Estado: solo c.story (lo crea y repara ensure(c), idempotente). No se sube VER ni VER6.
 *  - Azar: solo rng(c, 'st-<clave>', …) (= VB.Career.beach._rng(_hash(c.seed, …)), como rngOf en career-life.js). Nunca el azar
 *    del navegador ni los generadores de career.js / career-life.js. En el gancho 'create' no se tira nada (ni se despacha).
 *  - Jornada en 'match': life('match') corre DESPUÉS de finishRound (c.week ya es la siguiente). Usar sum.season, sum.phase, f y
 *    ctx (abajo); nunca c.week − 1. El núcleo lleva s.mN (jornadas cerradas, sube 1 en cada 'match', jugado, simulado o banquillo)
 *    y s.nk (clave de la PRÓXIMA jornada, K(c)._wkKey(c), recalculada al final de cada gancho).
 *  - Textos: castellano, género neutro, nada real. Ningún texto pintado con «{», «undefined», «NaN», «.er» ni «·».
 *  - El núcleo nunca guarda dentro de hook() (ya guarda el motor después); fuera del gancho (acciones de la UI: act) sí guarda.
 *
 * ================================================================== API (VB.CareerStory)
 *  hook(c, kind, a, b)   Lo llama life() de career.js (después de VB.CareerLife y VB.CareerWorld) y career-life.js answer().
 *                        kind: 'setup' (a = m, el partido de matchSetup) · 'match' (a = sum, b = f) · 'season' (aplazado: se despacha justo después del 'match' de ese último partido) · 'newSeason' ·
 *                        'join' (a = oferta firmada) · 'answer' (a = clave del EVENTS de career-life, b = opción i) · 'create'
 *                        (solo ensure: sin tiradas ni despacho) · 'sess' (ignorado). Despacha a los sistemas en el orden de use().
 *  ensure(c) -> s        Crea o repara c.story (ver «Estado» abajo) y llama a sys.ensure(s, c) de cada sistema. Sin tiradas.
 *  use(sys)              Registra (o sustituye, mismo id) un subsistema:
 *     sys = {
 *       id: 'msgs',                         // también enruta las acciones 'st-msgs-…' (y las de sys.acts: ['wk', 'pact'] → 'st-wk-…')
 *       acts: ['wk'],                       // (opcional) otros prefijos de acción que atiende onAct
 *       tpl: { beatId: { k, t, x, th?, xh?, o?: [{t, th?, e, why?}], c?, ch? } },   // plantillas de mensaje (ver text())
 *       ensure(s, c),                       // repara SUS campos de c.story (idempotente, sin tiradas)
 *       onSetup(c, m, ctx),                 // antes del partido jugado (m = matchSetup; m.career es la ficha del partido)
 *       onMatch(c, sum, f, ctx),            // tras cada jornada tuya (jugada, simulada o banquillo; sum.life ya está)
 *       onSeason(c, ctx), onNewSeason(c, ctx), onJoin(c, ctx),   // fin de temporada, verano → T+1, firmar club (ctx.offer)
 *       onAnswer(c, evKey, i),              // el jugador contestó la decisión de career-life (SOLO puede escribir en c.story)
 *       onReply(c, entry, i, res),          // (opcional) contestaste una entrada del feed de este sistema (res = textos de fx)
 *       onAct(c, act, b) -> res,            // acción de la UI 'st-<id>-…' (b = botón); el núcleo guarda después
 *       fx: { star: function (c, v, why) -> texto|null },   // (opcional) claves de efecto propias (p. ej. P4: estrellas)
 *       onWall(c, p),                       // (opcional, P3) recibe lo que otros publican con pushWall
 *       chips(c) -> [{p, ic, t, tab?, s?, act?}],           // avisos de Partido (puro: sin azar ni escrituras)
 *       ui: { inbox?, wall?, week?, state?, people?, pass?, stats?, opts? }      // pintores (los usa career-story-ui.js)
 *     }
 *  ctx (lo reciben los on*): { season, phase, week, kind, mN, nk, played: {tag, wk}, f?, offer? }
 *     En 'match': season = sum.season, phase = sum.phase, week = f.week (liga) o f.round (copa/KO), kind = f.kind, mN ya
 *     incrementado, nk = clave de la jornada SIGUIENTE, played.wk = clave de la jornada recién cerrada y played.tag = la etiqueta
 *     que P3 dejó en s.mk para esa clave ('' si no hay). En los demás ganchos: los de c (c.season, c.phase, c.week) y played vacío.
 *     ctx(c) devuelve el de ahora (para onAct o la UI).
 *  rng(c, 'st-…', …)     Generador determinista (función r() → [0,1)). Si la primera clave no empieza por 'st-' se le antepone.
 *  K(c)                  Motor de la carrera c (playa o vista «pista sobre playa»): K(c).save, K(c).myClub, K(c)._wkKey…
 *  cast(c)               Reparto inventado: {agent, coach, media:{diario, digital, radio, pod}, acc:{cronista, rumor, pena, hater},
 *                        fam, barrio}. Entrenador por club: hash(seed,'st-coachN',clubId) de COACH_N.
 *  freq(c) -> 0|1|2      «Cuánta vida» (Poca/Normal/Mucha). setFreq(v) la cambia en la carrera activa y guarda.
 *  budget(c) -> n        Huecos que quedan ESTA jornada para cosas que piden respuesta: CAP[freq] (1/3/4) − (1 si c.life.ev)
 *                        − entradas del feed con respuesta publicadas en este s.mN. El muro y la carta de la semana no cuentan.
 *  post(c, {k, b, vars, o, exp}) -> entry|null
 *                        Publica en el feed (tope FEED_MAX = 30, sale antes lo cerrado). b = id de plantilla (tpl de algún
 *                        sistema), k = remitente ('agent', 'coach', 'mate', 'fam', 'press', 'rival', 'sponsor', 'fan'…), vars =
 *                        variables propias del texto, o = 1 si pide respuesta (sale null si budget(c) ≤ 0), exp = jornada (mN) en
 *                        la que caduca (por defecto mN + 2). Entrada: {id, k, b, vars, o, ans:-1, exp, mN, s, w, ph, r:0, sys}.
 *                        ans: -1 abierta, i contestada, -2 caducada (sin efecto). r: 1 leída. Los textos NO se guardan.
 *  answer(c, id, i) -> [textos]|null   Aplica tpl.o[i].e con fx (why = tpl.o[i].why o el título), marca ans e r y llama a onReply.
 *                        No guarda (act sí). Null si no existe, no pide respuesta, ya está contestada o ha caducado.
 *  fx(c, e, why) -> [textos]           e con claves del núcleo (coach, chem, fatigue, money, fame, fameMin, tp o train) →
 *                        VB.CareerLife.applyEff; claves de story: mood (s.mood + s.moodLog), ag / fam / heat (s.rel + why), y las
 *                        de sys.fx (p. ej. star; sin dueño se acumulan en s.starQ). Cualquier otra clave se ignora.
 *  hint(c, e) -> [[etiqueta, bueno]]   Lo que enseña el botón (▲/▼), como effHint de career-life.
 *  flag(c, k, v) / flagAt(c, k) -> {mN, v}|null   Marcas con fecha (tope 12, caducan a las FLAG_LIFE = 6 jornadas).
 *  why(c, who, d, t)     Anota el porqué del último cambio de una relación: s.rel.why[who] = {d, t, mN}.
 *  pushWall(c, {a, t, v}) Publicación en Redes: a sys.onWall (P3) si existe; si no, a la cola s.wallQ (tope 10).
 *  text(c, entry) -> {t, x, o:[{t, hint}], c}   Textos de una entrada (ver «Plantillas»).
 *  vars(c, extra) -> {}  Variables por defecto del texto (abajo), con extra encima.
 *  act(act, b) -> res    Acción de la UI 'st-…' sobre la carrera activa: 'st-ans-<id>-<i>' (contestar), 'st-freq-<n>', 'st-read'
 *                        o 'st-<sysId|alias>-…' → sys.onAct. Guarda con K(c).save(c).
 *  chipsOf(c)            Avisos de todos los sistemas, ordenados por p (sin límite; la UI enseña 4). unread(c), readAll(c).
 *
 * ================================================================== Plantillas y text()
 *  tpl[beatId] = { k: remitente, t: título, x: cuerpo, th / xh: título / cuerpo de pista (si faltan, los de playa),
 *                  o: [{t: botón, th?: botón de pista, e: efectos, why?: porqué}], c / ch: línea de cierre al caducar }
 *  t, x, th, xh, c, ch y o[i].t pueden ser texto o lista de variantes (unas 8); la variante sale de hash(seed,'st-v',id,b), sin tirar.
 *  Variables {nombre}: primero entry.vars, después las de vars(c):
 *    {yo} tu nombre · {mate} pareja (playa) o «quien coloca» (pista) · {rival} entry.vars.rival o el rival del último partido
 *    (c.last.rivalName) o «el rival» · {rp} tu rival personal (c.life.rival) · {club} tu club · {ciudad} su ciudad · {sponsor} tu
 *    patrocinador (c.life.sponsor) o «tu patrocinador» · {coach} el entrenador del reparto · {agent} Cris Montoya · {season} la
 *    temporada. Una variable que no se conozca queda vacía (nunca sale «{»).
 *
 * ================================================================== Estado (c.story, del núcleo; cada sistema añade lo suyo)
 *  {v:1, n, mN, nk, sP, freq, feed:[], flags:{k:{mN,v}}, rel:{ag,fam,heat,arch,why:{}}, mood, moodLog:[{d,t,mN}], wallQ:[], starQ}
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  // Motor de la carrera c (como career-life.js): la fachada VB.Career va a la Carrera ACTIVA, pero los ganchos reciben una concreta.
  var HV = null, HVsrc = null;
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function K(c) {
    var C = VB.Career; if (!c || !C || !C.beach) return C;
    if (!isH(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function B() { return VB.Career && (VB.Career.beach || VB.Career); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function sgn(n) { return (n > 0 ? '+' : '−') + Math.abs(n); }

  var FEED_MAX = 30, FLAG_MAX = 12, FLAG_LIFE = 6, MOODLOG_MAX = 5, WALLQ_MAX = 10, EXP_DEF = 2;
  var CAP = [1, 3, 4];   // cosas que piden respuesta por jornada según «Cuánta vida» (Poca / Normal / Mucha)
  var CORE_K = ['coach', 'chem', 'fatigue', 'money', 'fame', 'tp'];   // claves del núcleo (regla de oro: solo por elección)
  var REL_K = { ag: 50, fam: 70, heat: 0 };

  // ------------------------------------------------------------------ reparto único inventado
  var AGENT = 'Cris Montoya';
  var COACH_N = ['Alex', 'Dani', 'Noa', 'Sam', 'Ariel', 'Eli', 'Nico', 'Robin'];
  var MEDIA = { diario: 'Diario La Red', digital: 'El Bloqueo Digital', radio: 'Radio Arena FM', pod: 'La Pausa Técnica' };

  // ------------------------------------------------------------------ azar
  function hashOf(c, keys) { var C = B(); return C._hash.apply(null, [c && num(c.seed) ? c.seed : 0].concat(keys)); }
  function rng(c) {
    var keys = Array.prototype.slice.call(arguments, 1);
    if (typeof keys[0] !== 'string' || keys[0].indexOf('st-') !== 0) keys.unshift('st-' + (keys.length ? keys.shift() : 'x'));
    return B()._rng(hashOf(c, keys));
  }
  function idx(c, keys, n) { return n > 1 ? (hashOf(c, keys) >>> 0) % n : 0; }

  // ------------------------------------------------------------------ sistemas
  var SYS = [], TPL = {}, OWN = {};
  function use(sys) {
    if (!sys || typeof sys.id !== 'string' || !sys.id) return null;
    for (var i = 0; i < SYS.length; i++) if (SYS[i].id === sys.id) { SYS.splice(i, 1); break; }
    SYS.push(sys);
    TPL = {}; OWN = {};
    SYS.forEach(function (s) { if (obj(s.tpl)) for (var k in s.tpl) { TPL[k] = s.tpl[k]; OWN[k] = s.id; } });
    return sys;
  }
  function sysOf(id) { for (var i = 0; i < SYS.length; i++) if (SYS[i].id === id || (Array.isArray(SYS[i].acts) && SYS[i].acts.indexOf(id) >= 0)) return SYS[i]; return null; }
  function call(s, fn, args) { if (!s || typeof s[fn] !== 'function') return undefined; try { return s[fn].apply(s, args); } catch (e) { try { console.error('CareerStory ' + s.id + '.' + fn, e); } catch (e2) { } return undefined; } }

  // ------------------------------------------------------------------ estado
  function wkKey(c) { try { var E = K(c); return E && E._wkKey ? E._wkKey(c) : 0; } catch (e) { return 0; } }
  function ensure(c) {
    if (!c || typeof c !== 'object') return null;
    var s = c.story;
    if (!obj(s)) s = c.story = {};
    s.v = 1;
    s.n = num(s.n) && s.n >= 0 ? s.n | 0 : 0;
    s.mN = num(s.mN) && s.mN >= 0 ? s.mN | 0 : 0;
    if (!num(s.nk)) s.nk = wkKey(c);
    s.freq = s.freq === 0 || s.freq === 2 ? s.freq : 1;
    if (!Array.isArray(s.feed)) s.feed = [];
    s.feed = s.feed.filter(function (x) { return obj(x) && num(x.id) && typeof x.b === 'string'; });
    s.feed.forEach(function (x) {
      x.o = x.o ? 1 : 0; x.ans = num(x.ans) ? x.ans | 0 : -1; x.mN = num(x.mN) ? x.mN | 0 : s.mN; x.exp = num(x.exp) ? x.exp | 0 : x.mN + EXP_DEF;
      x.r = x.r ? 1 : 0; if (!obj(x.vars)) x.vars = {}; if (typeof x.k !== 'string') x.k = '';
      if (x.q != null && !(num(x.q) && x.q >= 0)) delete x.q; else if (x.q != null) x.q = x.q | 0;
      if (x.id > s.n) s.n = x.id;
    });
    if (s.feed.length > FEED_MAX) s.feed = s.feed.slice(-FEED_MAX);
    if (!obj(s.flags)) s.flags = {};
    for (var fk in s.flags) if (!obj(s.flags[fk]) || !num(s.flags[fk].mN)) delete s.flags[fk];
    var r = s.rel; if (!obj(r)) r = s.rel = {};
    for (var rk in REL_K) r[rk] = num(r[rk]) ? clamp(Math.round(r[rk]), 0, 100) : REL_K[rk];
    r.arch = r.arch ? 1 : 0;
    if (!obj(r.why)) r.why = {};
    for (var wk in r.why) if (!obj(r.why[wk]) || !num(r.why[wk].d)) delete r.why[wk];
    s.mood = num(s.mood) ? clamp(Math.round(s.mood), 0, 100) : 60;
    if (!Array.isArray(s.moodLog)) s.moodLog = [];
    s.moodLog = s.moodLog.filter(function (x) { return obj(x) && num(x.d); }).slice(-MOODLOG_MAX);
    if (!Array.isArray(s.wallQ)) s.wallQ = [];
    s.wallQ = s.wallQ.filter(function (x) { return obj(x) && typeof x.t === 'string'; }).slice(-WALLQ_MAX);
    s.starQ = num(s.starQ) && s.starQ > 0 ? s.starQ | 0 : 0;
    s.sP = num(s.sP) && s.sP > 0 ? s.sP | 0 : 0;   // (fin de temporada aplazado al 'match' que viene: la temporada; ver hook)
    SYS.forEach(function (y) { call(y, 'ensure', [s, c]); });
    return s;
  }
  function St(c) { return c && obj(c.story) && c.story.v === 1 ? c.story : ensure(c); }

  // ------------------------------------------------------------------ ctx
  function ctxOf(c, extra) {
    var s = St(c), x = { season: c.season | 0, phase: c.phase, week: c.week | 0, kind: c.phase === 'cup' || c.phase === 'ko' ? c.phase : 'league', mN: s.mN, nk: s.nk, played: { tag: '', wk: null } };
    if (extra) for (var k in extra) x[k] = extra[k];
    return x;
  }

  // ------------------------------------------------------------------ gancho
  function prune(s) {
    for (var k in s.flags) if (s.mN - s.flags[k].mN > FLAG_LIFE) delete s.flags[k];
    // caducidad: lo que pedía respuesta y no se contestó se cierra sin efecto (la línea de cierre la da text() con tpl.c)
    s.feed.forEach(function (x) { if (x.o && x.ans === -1 && s.mN > x.exp) { x.ans = -2; x.r = 1; } });
  }
  function hook(c, kind, a, b) {
    if (!c || typeof c !== 'object') return;
    var s = ensure(c); if (!s) return;
    if (kind === 'create' || kind === 'sess') { s.nk = wkKey(c); return; }   // crear: sin tiradas ni despacho
    if (kind === 'answer') { SYS.forEach(function (y) { call(y, 'onAnswer', [c, a, b]); }); return; }
    // 'season' corre DENTRO de closeMine (finishRound → endSeason), ANTES del 'match' de ese último partido: se aplaza hasta después
    // de ese 'match' (s.sP) para que los sistemas cierren la temporada con la última jornada ya contada (pacto, figura del mes…).
    // Sin 'match' detrás (no pasa en career.js), sale al principio del siguiente gancho.
    if (kind === 'season') { s.sP = Math.max(1, c.season | 0); return; }
    if (s.sP && kind !== 'match') seasonNow(c, s);
    var ctx;
    if (kind === 'match') {
      var sum = a || {}, f = b || {}, wk0 = s.nk;
      s.mN++;
      prune(s);
      s.nk = wkKey(c);
      ctx = { season: num(sum.season) ? sum.season : c.season | 0, phase: sum.phase || c.phase, week: f.kind === 'league' || f.kind == null ? f.week | 0 : f.round | 0, kind: f.kind || 'league',
        mN: s.mN, nk: s.nk, played: { tag: obj(s.mk) && s.mk.k === wk0 && typeof s.mk.tag === 'string' ? s.mk.tag : '', wk: wk0 }, f: f };
      SYS.forEach(function (y) { call(y, 'onMatch', [c, sum, f, ctx]); });
      if (s.sP) seasonNow(c, s);
    } else if (kind === 'setup') {
      ctx = ctxOf(c); SYS.forEach(function (y) { call(y, 'onSetup', [c, a, ctx]); });
    } else if (kind === 'newSeason') {
      ctx = ctxOf(c); SYS.forEach(function (y) { call(y, 'onNewSeason', [c, ctx]); });
    } else if (kind === 'join') {
      ctx = ctxOf(c, { offer: a || null }); SYS.forEach(function (y) { call(y, 'onJoin', [c, ctx]); });
    }
    s.nk = wkKey(c);
  }
  /** Fin de temporada aplazado (ver hook): onSeason de cada sistema, una vez. */
  function seasonNow(c, s) { var ctx = ctxOf(c, { season: s.sP }); s.sP = 0; SYS.forEach(function (y) { call(y, 'onSeason', [c, ctx]); }); }

  // ------------------------------------------------------------------ reparto, frecuencia y tope
  function myClub(c) { try { return c && c.myClub >= 0 ? K(c).myClub(c) : null; } catch (e) { return null; } }
  function handle(s) { return String(s || '').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç]/g, ''); }
  function cast(c) {
    var k = myClub(c), city = k && k.city ? k.city : '';
    return {
      agent: AGENT,
      coach: COACH_N[idx(c, ['st-coachN', k ? k.id : -1], COACH_N.length)],
      media: { diario: MEDIA.diario, digital: MEDIA.digital, radio: MEDIA.radio, pod: MEDIA.pod },
      acc: { cronista: isH(c) ? '@CronistaDePabellón' : '@CronistaDeArena', rumor: '@ElOjoDeHalcón', pena: '@PeñaVoley' + (handle(city) || 'DelBarrio'), hater: '@NoMeConvence' },
      fam: 'Tu gente', barrio: 'La peña del barrio'
    };
  }
  function freq(c) { var s = St(c); return s ? s.freq : 1; }
  function setFreq(v) {
    var c = VB.Career && VB.Career.load ? VB.Career.load() : null; if (!c) return null;
    St(c).freq = v === 0 || v === 2 ? v : 1; K(c).save(c); return c.story.freq;
  }
  function budget(c) {
    var s = St(c); if (!s) return 0;
    var used = (c.life && c.life.ev ? 1 : 0) + s.feed.filter(function (x) { return x.o && x.mN === s.mN; }).length;
    return Math.max(0, CAP[s.freq] - used);
  }

  // ------------------------------------------------------------------ feed
  function post(c, p) {
    var s = St(c); if (!s || !p || typeof p.b !== 'string') return null;
    var o = p.o ? 1 : 0;
    if (o && budget(c) <= 0) return null;
    var tp = TPL[p.b];
    var e = { id: ++s.n, k: typeof p.k === 'string' ? p.k : tp && tp.k || '', b: p.b, vars: obj(p.vars) ? p.vars : {}, o: o, ans: -1, exp: num(p.exp) ? p.exp | 0 : s.mN + EXP_DEF,
      mN: s.mN, s: c.season | 0, w: c.week | 0, ph: c.phase || '', r: 0, sys: OWN[p.b] || '' };
    for (var pq = s.feed.length - 1; pq >= 0; pq--) if (s.feed[pq].b === p.b) break;
    e.q = pq >= 0 && num(s.feed[pq].q) ? (s.feed[pq].q + 1) % 997 : e.id % 997;   // (rotación de variantes, ver pickTxt; sin anterior, arranca según el id)
    s.feed.push(e);
    while (s.feed.length > FEED_MAX) {
      var j = -1; for (var i = 0; i < s.feed.length; i++) if (s.feed[i].ans !== -1 || !s.feed[i].o) { j = i; break; }
      s.feed.splice(j < 0 ? 0 : j, 1);
    }
    return e;
  }
  function entry(c, id) { var s = St(c); if (!s) return null; for (var i = 0; i < s.feed.length; i++) if (s.feed[i].id === id) return s.feed[i]; return null; }
  function answer(c, id, i) {
    var s = St(c), x = entry(c, +id); if (!x || !x.o || x.ans !== -1 || s.mN > x.exp) return null;
    var tp = TPL[x.b], op = tp && Array.isArray(tp.o) ? tp.o[i | 0] : null; if (!op) return null;
    var res = fx(c, op.e || {}, op.why || pickTxt(c, x, isH(c) && tp.th ? tp.th : tp.t, 't'));
    x.ans = i | 0; x.r = 1;
    var sy = sysOf(x.sys); if (sy) call(sy, 'onReply', [c, x, i | 0, res]);
    return res;
  }
  function unread(c) { var s = St(c); return s ? s.feed.filter(function (x) { return !x.r; }).length : 0; }
  /** Marca leído lo que no espera respuesta (lo que pregunta sigue sin leer hasta que contestas o caduca). */
  function readAll(c) { var s = St(c); if (s) s.feed.forEach(function (x) { if (!x.o || x.ans !== -1) x.r = 1; }); }

  // ------------------------------------------------------------------ efectos
  function fx(c, e, wy) {
    var s = St(c), out = []; if (!s || !obj(e)) return out;
    var core = {}, any = false;
    CORE_K.forEach(function (k) { if (num(e[k]) && e[k]) { core[k] = e[k]; any = true; } });
    if (num(e.train) && e.train) { core.tp = (core.tp || 0) + e.train; any = true; }
    if (any && num(e.fameMin)) core.fameMin = e.fameMin;
    if (any) {
      var L = VB.CareerLife;
      if (L && L.applyEff) out = out.concat(L.applyEff(c, core));
      else {   // (sin career-life: lo mínimo, sin fama, dinero ni entreno)
        if (core.coach) { c.coach = clamp((c.coach | 0) + core.coach, 0, 100); out.push('Entrenador ' + sgn(core.coach)); }
        if (core.chem && c.mate) { c.mate.chem = clamp((c.mate.chem | 0) + core.chem, 0, 100); out.push('Química ' + sgn(core.chem)); }
        else if (core.chem && isH(c)) { c.chem = clamp((c.chem | 0) + core.chem, 0, 100); out.push('Química del equipo ' + sgn(core.chem)); }
        if (core.fatigue) { c.fatigue = clamp((c.fatigue | 0) + core.fatigue, 0, 100); out.push('Fatiga ' + sgn(core.fatigue)); }
      }
    }
    var t = typeof wy === 'string' ? wy : '';
    if (num(e.mood) && e.mood) {
      var m0 = s.mood; s.mood = clamp(Math.round(s.mood + e.mood), 0, 100);
      if (s.mood !== m0) { s.moodLog.push({ d: s.mood - m0, t: t, mN: s.mN }); if (s.moodLog.length > MOODLOG_MAX) s.moodLog = s.moodLog.slice(-MOODLOG_MAX); }
      out.push('Ánimo ' + sgn(Math.round(e.mood)));
    }
    for (var rk in REL_K) if (num(e[rk]) && e[rk]) {
      var r0 = s.rel[rk]; s.rel[rk] = clamp(Math.round(r0 + e[rk]), 0, 100);
      if (s.rel[rk] !== r0) why(c, rk, s.rel[rk] - r0, t);
      out.push(REL_NAME[rk] + ' ' + sgn(Math.round(e[rk])));
    }
    // claves propias de los sistemas (sys.fx); la estrella sin dueño se acumula
    for (var k in e) {
      if (!num(e[k]) || !e[k] || CORE_K.indexOf(k) >= 0 || k in REL_K || k === 'mood' || k === 'train' || k === 'fameMin') continue;
      var done = false;
      for (var i = 0; i < SYS.length && !done; i++) if (obj(SYS[i].fx) && typeof SYS[i].fx[k] === 'function') {
        done = true; var tx = null; try { tx = SYS[i].fx[k](c, e[k], t); } catch (er) { tx = null; }
        if (typeof tx === 'string' && tx) out.push(tx);
      }
      if (!done && k === 'star') { s.starQ = Math.max(0, s.starQ + (e[k] | 0)); out.push(sgn(e[k] | 0) + (Math.abs(e[k] | 0) === 1 ? ' estrella' : ' estrellas')); }
    }
    return out;
  }
  var REL_NAME = { ag: 'Agente', fam: 'Tu gente', heat: 'Pique con tu rival' };
  function hint(c, e) {
    var h = []; if (!obj(e)) return h;
    var L = VB.CareerLife, core = {};
    CORE_K.forEach(function (k) { if (num(e[k]) && e[k]) core[k] = e[k]; });
    if (num(e.train) && e.train) core.tp = e.train;
    if (L && L.effHint) h = h.concat(L.effHint(core, c));
    if (num(e.mood) && e.mood) h.push(['Ánimo', e.mood > 0]);
    if (num(e.ag) && e.ag) h.push([REL_NAME.ag, e.ag > 0]);
    if (num(e.fam) && e.fam) h.push([REL_NAME.fam, e.fam > 0]);
    if (num(e.heat) && e.heat) h.push([REL_NAME.heat, e.heat > 0]);
    if (num(e.star) && e.star) h.push(['Estrellas', e.star > 0]);
    return h;
  }

  // ------------------------------------------------------------------ marcas, porqués y muro
  function flag(c, k, v) {
    var s = St(c); if (!s || typeof k !== 'string') return null;
    s.flags[k] = { mN: s.mN, v: v === undefined ? 1 : v };
    var ks = Object.keys(s.flags);
    if (ks.length > FLAG_MAX) { ks.sort(function (a, b) { return s.flags[a].mN - s.flags[b].mN; }); ks.slice(0, ks.length - FLAG_MAX).forEach(function (x) { delete s.flags[x]; }); }
    return s.flags[k];
  }
  function flagAt(c, k) { var s = St(c), f = s && s.flags[k]; return f && s.mN - f.mN <= FLAG_LIFE ? f : null; }
  function why(c, who, d, t) { var s = St(c); if (!s || typeof who !== 'string') return null; s.rel.why[who] = { d: +d || 0, t: typeof t === 'string' ? t : '', mN: s.mN }; return s.rel.why[who]; }
  function pushWall(c, p) {
    var s = St(c); if (!s || !p || typeof p.t !== 'string') return null;
    var q = { a: typeof p.a === 'string' ? p.a : '', t: p.t, v: obj(p.v) ? p.v : {}, mN: s.mN, s: c.season | 0 };
    for (var i = 0; i < SYS.length; i++) if (typeof SYS[i].onWall === 'function') { call(SYS[i], 'onWall', [c, q]); return q; }
    s.wallQ.push(q); if (s.wallQ.length > WALLQ_MAX) s.wallQ = s.wallQ.slice(-WALLQ_MAX);
    return q;
  }

  // ------------------------------------------------------------------ textos
  function vars(c, extra) {
    var k = myClub(c), l = c && c.life || {}, v = {
      yo: c && c.player && c.player.name || 'tu jugador', mate: isH(c) ? 'quien coloca' : c && c.mate && c.mate.name || 'tu pareja',
      rival: c && c.last && c.last.rivalName || 'el rival', rp: l.rival && l.rival.name || 'tu rival', club: k ? k.name : 'tu club', ciudad: k && k.city ? k.city : 'la ciudad',
      sponsor: l.sponsor && l.sponsor.name || 'tu patrocinador', coach: cast(c).coach, agent: AGENT, season: String(c && c.season | 0 || 1)
    };
    if (obj(extra)) for (var x in extra) if (extra[x] != null && extra[x] === extra[x]) v[x] = String(extra[x]);
    return v;
  }
  /** Variable al empezar frase (o tras «): con mayúscula («quien coloca: …» → «Quien coloca: …»). */
  function cap1(s, src, at) { var pre = src.slice(0, at); return s && (/^\s*$/.test(pre) || /(?:[.!?]\s+|«)$/.test(pre)) ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fill(s, v) {
    var src = String(s == null ? '' : s);
    return src.replace(/\{(\w+)\}/g, function (m, n, at) { return v[n] != null ? cap1(String(v[n]), src, at) : ''; }).replace(/[{}]/g, '').replace(/ {2,}/g, ' ').trim();
  }
  /** Variante de texto: hash fijo por entrada; con x.q (vuelta de post para el mismo beat) rota, así dos seguidas del mismo beat
   *  nunca repiten texto. Las entradas viejas sin q siguen con su hash de siempre (no cambia lo ya pintado). */
  function pickTxt(c, x, t, slot) {
    if (Array.isArray(t)) t = !t.length ? '' : num(x.q) ? t[(idx(c, ['st-v', x.b, slot], t.length) + x.q) % t.length] : t[idx(c, ['st-v', x.id, x.b, slot], t.length)];
    return typeof t === 'string' ? t : '';
  }
  function text(c, x) {
    var tp = x && TPL[x.b]; if (!tp) return { t: '', x: '', o: [], c: '' };
    var H = isH(c), v = vars(c, x.vars);
    return {
      t: fill(pickTxt(c, x, H && tp.th ? tp.th : tp.t, 't'), v),
      x: fill(pickTxt(c, x, H && tp.xh ? tp.xh : tp.x, 'x'), v),
      o: x.o && Array.isArray(tp.o) ? tp.o.map(function (op, i) { return { t: fill(pickTxt(c, x, H && op.th ? op.th : op.t, 'o' + i), v), hint: hint(c, op.e) }; }) : [],
      c: x.ans === -2 ? fill(pickTxt(c, x, H && tp.ch ? tp.ch : tp.c, 'c'), v) : ''
    };
  }

  // ------------------------------------------------------------------ avisos y acciones de la UI
  function chipsOf(c) {
    var out = []; if (!c) return out;
    SYS.forEach(function (y) { var a = call(y, 'chips', [c]); if (Array.isArray(a)) a.forEach(function (ch) { if (obj(ch) && typeof ch.t === 'string' && ch.t) out.push(ch); }); });
    return out.sort(function (a, b) { return (+a.p || 0) - (+b.p || 0); });
  }
  function act(a, b) {
    if (typeof a !== 'string' || a.indexOf('st-') !== 0) return null;
    var c = VB.Career && VB.Career.load ? VB.Career.load() : null; if (!c) return null;
    ensure(c);   // (repara siempre: un guardado con story v:1 pero estropeado no puede romper el clic)
    var parts = a.split('-'), seg = parts[1] || '', res = null;
    if (seg === 'ans') { var fx0 = answer(c, +parts[2], +parts[3]); res = fx0 ? { render: true, fx: fx0 } : null; }
    else if (seg === 'freq') { c.story.freq = +parts[2] === 0 || +parts[2] === 2 ? +parts[2] : 1; res = { render: true }; }
    else if (seg === 'read') { readAll(c); res = { render: true }; }
    else { var y = sysOf(seg); res = y ? call(y, 'onAct', [c, a, b]) : null; }
    try { K(c).save(c); } catch (e) { }
    return res === undefined ? null : res;
  }

  VB.CareerStory = {
    hook: hook, ensure: ensure, use: use, sys: sysOf, systems: function () { return SYS.slice(); }, tpl: function (id) { return TPL[id] || null; },
    ctx: ctxOf, rng: rng, K: K, cast: cast, freq: freq, setFreq: setFreq, budget: budget,
    post: post, entry: entry, answer: answer, unread: unread, readAll: readAll, fx: fx, hint: hint,
    flag: flag, flagAt: flagAt, why: why, pushWall: pushWall, text: text, vars: vars, act: act, chipsOf: chipsOf,
    AGENT: AGENT, COACH_N: COACH_N, MEDIA: MEDIA, CAP: CAP, FEED_MAX: FEED_MAX, FLAG_MAX: FLAG_MAX, FLAG_LIFE: FLAG_LIFE, EXP_DEF: EXP_DEF
  };
})();
