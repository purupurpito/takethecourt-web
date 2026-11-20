/* MAKE THE CUT — js/retos.js (owner: ui_main)
 * Retos (S4-D1, sin el torneo de la semana): 18 retos de maestría con bronce, plata y oro, medidos con los eventos de la sim que ya
 * existen, y un reto del día sembrado con la fecha LOCAL (sin servidor). Puro: sin DOM ni THREE; localStorage siempre en try/catch.
 * No toca g.rng, VB.Sim ni la semilla del partido: tiene su propio hash y su PRNG (mulberry32) para la fecha, así que la huella 2v2
 * no cambia. index.html lo carga después de js/badges.js (y antes de js/look.js y js/venues.js); lee VB.Prog, VB.Venues,
 * VB.VENUES, VB.DIFF_ORDER y VB.ctx de forma perezosa y con guarda. No usa VB.Look (el Vestuario lee VB.Retos, no al revés).
 *
 * API (VB.Retos):
 *   LIST [{id, grp, name, cond, help, kind:'max'|'min'|'sum'|'tier'|'set', th:[b,p,o], unit}], IDS, BY, GROUPS [{id, name}],
 *   TIERS ['', 'bronce', 'plata', 'oro'], XP [30,50,80], XP_DAY [20,35,60], MAPS {id:{kind, name, short}}, GOALS, KEY, VER
 *   ingest(e, g)              cuenta un evento (O(1), sin asignar). ui.js la llama tras VB.Badges.ingest.
 *   endMatch(g, info?, dry?)  cierra el partido: info = {win, map, sets}; idempotente por g (la 2ª llamada devuelve lo mismo).
 *                             → null si el partido no cuenta; si no {up:[{id,name,lvl,prev,tier}], xp, day, week:null, dry}
 *                             day = {key, medal, prev, newMedal, xp, goal:{id,n,txt,ok}, setsW} | null (solo con g.reto.kind 'day')
 *                             dry = calcula sin guardar ni dar XP (depuración; también se fuerza con VB.ctx.debug sin _force).
 *   chainOk(e, n?)            criterio de «Jugada perfecta» (R4): remate perfecto que cierra ≥ 3 toques perfectos seguidos
 *                             (n, si se da, sustituye a e.chain). ui.js (sello, :1183) lo usa con guarda.
 *   level(id), progress(id) → {v, lvl, next, frac, txt}, count() → 0..54, summary(), unseen(), markSeen(ids)
 *   today(now?) → AAAAMMDD, isoWeek(now?) → AAAAWW, dateLabel(k) → '13 nov'
 *   daily(k?, rookie?) → {key, six, map, mapWant, mapName, kind, difficulty, diffName, points, ctrl, mod, modName, goal:{id,n,txt},
 *                          tiers:[3 textos], bits:[datos para la fila], opts (para ctx.actions.startMatch)}
 *   dayState() → {key, m, n}
 *   profileXP() → XP de perfil derivada y monótona (D2), album() → pestaña del álbum (forma de S4-D2 §3), lookData() → datos para
 *   las alternativas {reto}/{retoN}/{dias} del Vestuario (T9).
 *   load(), save(o), clean(o), mergeRaw(Lraw, Rraw, remoteNewer?) → texto, reset(), lost(), readOnly()
 *   _cur(), _reset(), _force (pruebas: cuenta también en depuración y con autopilot)
 *
 * Guardado 'make-the-cut.retos' (v1; no se escribe hasta el primer endMatch que cuente):
 *   { v:1, gen:1, m:{id:{l, v, s?, t?}}, xp:{id:l}, d:{k, m, n, xp}, days:{AAAAMMDD:m}, old:{d:[n0,b,p,o], w:[n0,b,p,o]},
 *     w:{k, r, out, m, n, xp}, weeks:{AAAAWW:m}, seen:{id:l} }
 *   l nivel 0-3, v récord (max/min/tier) o suma (sum/set), s ids de sede, t ms de la primera medalla. days ≤ 400 (lo más viejo se
 *   pliega en old.d); w/weeks quedan listos para el torneo de la semana (siguiente sprint): se validan y se fusionan, nada más.
 *   'make-the-cut.retostab' (pestaña recordada) es del aparato y la lleva ui.js. Dañado → copia en 'make-the-cut.retos.bak' y lost();
 *   v mayor que VER → solo lectura y mergeRaw no lo rebaja (contrato D4).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var KEY = 'make-the-cut.retos', VER = 1, BAK = KEY + '.bak';
  var TIERS = ['', 'bronce', 'plata', 'oro'];
  var XP = [30, 50, 80], XP_DAY = [20, 35, 60];
  var PXP = [15, 25, 40], PXP_DAY = [0, 5, 10, 20];      // XP de perfil (D2): por nivel de reto y por medalla de día
  var DAYS_MAX = 400, WEEKS_MAX = 200;
  var DIFFS = ['easy', 'normal', 'hard', 'expert'];
  var DIFF_NAME = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', expert: 'Experto' };
  var MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // Sedes (tabla fija: el reto del día no depende de qué venue-*.js haya cargado; si falta, se usa la de serie del mismo tipo)
  var MAPS = {
    palau: { kind: 'hall', name: 'Palau del Mar', short: 'Palau' },
    canrebot: { kind: 'hall', name: 'Poliesportiu Can Rebot', short: 'Can Rebot' },
    cupula: { kind: 'hall', name: 'Cúpula del Far', short: 'Cúpula' },
    platja: { kind: 'beach', name: 'Platja Llarga', short: 'Platja' },
    moll: { kind: 'beach', name: 'Moll de la Sorra', short: 'Moll' },
    fanals: { kind: 'beach', name: 'Cala dels Fanals', short: 'Fanals' }
  };
  var MAP_IDS = ['palau', 'canrebot', 'cupula', 'platja', 'moll', 'fanals'], HALLS = ['palau', 'canrebot', 'cupula'];
  var MAP_DEF = { hall: 'palau', beach: 'platja' };

  // ---------------------------------------------------------------- catálogo (S4-D1 §2.2)
  var H_PAIR = 'En 2 contra 2 cuenta tu pareja; en 6 contra 6, solo tú', H_MINE = 'Solo los toques que das tú';
  var H_MAS = 'Con la maestría: finta, golpe colocado, al filo';
  var GROUPS = [{ id: 'atk', name: 'Ataque' }, { id: 'def', name: 'Defensa' }, { id: 'match', name: 'Partido' },
    { id: 'mas', name: 'Maestría' }, { id: 'world', name: 'Mundo' }];
  var LIST = [
    { id: 'r_aces', grp: 'atk', name: 'Lluvia de aces', cond: 'Aces en un partido', kind: 'max', th: [2, 4, 6], help: H_PAIR },
    { id: 'r_kills', grp: 'atk', name: 'Pegada', cond: 'Remates ganadores en un partido', kind: 'max', th: [8, 15, 22], help: H_PAIR },
    { id: 'r_blocks', grp: 'atk', name: 'Pared', cond: 'Puntos de bloqueo en un partido', kind: 'max', th: [2, 4, 6], help: H_PAIR },
    { id: 'r_digs', grp: 'def', name: 'Felino', cond: 'Defensas de remate en un partido', kind: 'max', th: [10, 20, 30], help: H_PAIR },
    { id: 'r_recv', grp: 'def', name: 'Pase al dedo', cond: 'Recepciones perfectas tuyas en un partido', kind: 'max', th: [4, 8, 12], help: H_MINE },
    { id: 'r_rally', grp: 'def', name: 'Peloteo eterno', cond: 'Jugada más larga de un partido', kind: 'max', th: [12, 20, 30], unit: ' toques', help: '' },
    { id: 'r_streak', grp: 'match', name: 'Rodillo', cond: 'Puntos seguidos en un set', kind: 'max', th: [4, 6, 9], help: H_PAIR },
    { id: 'r_win', grp: 'match', name: 'Escalera', cond: 'Gana un partido en Normal, Difícil y Experto', kind: 'tier', th: [1, 2, 3], help: 'Cada nivel, una dificultad' },
    { id: 'r_iron', grp: 'match', name: 'Set de hierro', cond: 'Gana un set a 21 o 25 dejando al rival en pocos puntos', kind: 'min', th: [12, 8, 5], help: H_PAIR },
    { id: 'r_comeback', grp: 'match', name: 'Remontada', cond: 'Gana un set después de ir perdiendo', kind: 'max', th: [4, 6, 8], unit: ' puntos', help: H_PAIR },
    { id: 'r_saved', grp: 'match', name: 'Sin temblar', cond: 'Salva puntos de set o de partido', kind: 'sum', th: [3, 10, 25], help: H_PAIR },
    { id: 'r_tidy', grp: 'match', name: 'Juego limpio', cond: 'Gana un partido con pocos errores', kind: 'min', th: [6, 3, 1], help: H_PAIR },
    { id: 'r_feint', grp: 'mas', name: 'Pillo', cond: 'Puntos con finta', kind: 'sum', th: [3, 15, 40], help: H_MAS },
    { id: 'r_roll', grp: 'mas', name: 'Al hueco', cond: 'Puntos con golpe colocado', kind: 'sum', th: [3, 15, 40], help: H_MAS },
    { id: 'r_edge', grp: 'mas', name: 'Al filo', cond: 'Puntos al filo de la línea', kind: 'sum', th: [3, 15, 40], help: H_MAS },
    { id: 'r_chain', grp: 'mas', name: 'Jugada perfecta', cond: 'Jugadas perfectas', kind: 'sum', th: [1, 10, 30], help: 'Tres toques perfectos seguidos acabados en remate' },
    { id: 'r_venues', grp: 'world', name: 'Trotamundos', cond: 'Gana en sedes distintas', kind: 'set', th: [2, 4, 6], help: 'Seis sedes: Palau, Can Rebot, Cúpula, Platja, Moll y Fanals' },
    { id: 'r_six', grp: 'world', name: 'Equipo completo', cond: 'Gana partidos de 6 contra 6', kind: 'sum', th: [1, 5, 15], help: '' }
  ];
  var BY = {}, IDS = [];
  for (var li = 0; li < LIST.length; li++) { BY[LIST[li].id] = LIST[li]; IDS.push(LIST[li].id); if (!LIST[li].unit) LIST[li].unit = ''; }
  var OF = LIST.length * 3;   // 54 medallas

  function levelFor(id, v) {
    var b = BY[id], l = 0; if (!b || v == null || !isFinite(v)) return 0;
    for (var i = 0; i < 3; i++) if (b.kind === 'min' ? v <= b.th[i] : v >= b.th[i]) l = i + 1;
    return l;
  }

  // ---------------------------------------------------------------- reto del día: objetivos de oro (S4-D1 §2.3)
  // n por dificultad [Normal, Difícil, Experto]; 0 = no sale (en 'clean', 1 = sale). sc = se escala con los puntos del set.
  var GOALS = [
    { id: 'aces', sc: true, n2: [3, 2, 1], n6: [1, 1, 1] },
    { id: 'kills', sc: true, n2: [14, 11, 6], n6: [7, 6, 4] },
    { id: 'blocks', sc: true, n2: [3, 2, 1], n6: [1, 1, 1] },
    { id: 'digs', sc: true, n2: [16, 12, 8], n6: [6, 5, 3] },
    { id: 'streak', sc: false, n2: [5, 4, 3], n6: [4, 3, 3] },
    { id: 'clean', sc: false, n2: [1, 1, 0], n6: [1, 0, 0] },
    { id: 'tidy', sc: true, zero: true, n2: [5, 4, 3], n6: [1, 1, 2] },
    { id: 'comeback', sc: false, n2: [4, 3, 3], n6: [3, 3, 0] },
    { id: 'rally', sc: false, n2: [16, 14, 12], n6: [14, 12, 0] },
    { id: 'mastery', sc: false, n2: [2, 2, 1], n6: [0, 0, 0] }
  ];
  function goalText(id, n) {
    switch (id) {
      case 'aces': return n === 1 ? 'Gana con un ace o más' : 'Gana con ' + n + ' aces o más';
      case 'kills': return n === 1 ? 'Gana con un remate ganador' : 'Gana con ' + n + ' remates ganadores';
      case 'blocks': return n === 1 ? 'Gana con un punto de bloqueo' : 'Gana con ' + n + ' puntos de bloqueo';
      case 'digs': return n === 1 ? 'Gana con una defensa' : 'Gana con ' + n + ' defensas';
      case 'streak': return 'Gana con una racha de ' + n + ' puntos';
      case 'clean': return 'Gana sin ceder un set';
      case 'tidy': return n === 0 ? 'Gana sin cometer ningún error' : n === 1 ? 'Gana con un error como mucho' : 'Gana con ' + n + ' errores o menos';
      case 'comeback': return 'Gana remontando ' + n + ' puntos en un set';
      case 'rally': return 'Gana con una jugada de ' + n + ' toques';
      case 'mastery': return n === 1 ? 'Gana con un punto de finta, colocado o al filo' : 'Gana con ' + n + ' puntos de finta, colocado o al filo';
    }
    return '';
  }
  function lc1(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  // ---------------------------------------------------------------- hash y PRNG propios (nunca g.rng)
  function hashStr(s) {
    var h = 0x811c9dc5 | 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

  // ---------------------------------------------------------------- fechas (locales)
  function validKey(k) { k = +k; if (!(k >= 19000101 && k <= 29991231) || k !== Math.floor(k)) return false; var m = Math.floor(k / 100) % 100, d = k % 100; return m >= 1 && m <= 12 && d >= 1 && d <= 31; }
  function keyOfDate(dt) { return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate(); }
  function paramDate() {
    var P = VB.ctx && VB.ctx.params, v = P && (P.retodate != null ? P.retodate : null);
    return v != null && validKey(+v) ? +v : 0;
  }
  /** Clave local AAAAMMDD. now = Date | ms | AAAAMMDD; sin now, ?retodate= (pruebas) o la hora del aparato. */
  function today(now) {
    if (now == null) { var p = paramDate(); if (p) return p; now = new Date(); }
    if (typeof now === 'number' && validKey(now)) return now;
    var dt = now instanceof Date ? now : new Date(+now);
    return keyOfDate(dt);
  }
  /** Semana ISO AAAAWW (lunes a domingo) de la fecha local; con Date.UTC para que el horario de verano no influya. */
  function isoWeek(now) {
    var k = today(now), Y = Math.floor(k / 10000), M = Math.floor(k / 100) % 100 - 1, D = k % 100;
    var t = Date.UTC(Y, M, D), dow = (new Date(t).getUTCDay() + 6) % 7;     // 0 = lunes
    var th = new Date(t + (3 - dow) * 864e5), y = th.getUTCFullYear();     // jueves de esa semana → año ISO
    var w = 1 + Math.floor((th.getTime() - Date.UTC(y, 0, 1)) / (7 * 864e5));
    return y * 100 + w;
  }
  function dateLabel(k) { k = +k; if (!validKey(k)) return ''; return (k % 100) + ' ' + MON[Math.floor(k / 100) % 100 - 1]; }

  // ---------------------------------------------------------------- lectura perezosa de otros módulos
  function diffOrder() { return (VB.DIFF_ORDER && VB.DIFF_ORDER.length) ? VB.DIFF_ORDER : DIFFS; }
  function recordWins() {
    try { var r = JSON.parse(root.localStorage.getItem('make-the-cut.record') || 'null'); return r && typeof r.wins === 'number' ? r.wins : 0; } catch (e) { return 0; }
  }
  function mapReady(id) {
    try { if (VB.Venues && typeof VB.Venues.ready === 'function') return !!VB.Venues.ready(id); } catch (e) { }
    return true;
  }
  function mapName(id) { var v = VB.VENUES && VB.VENUES[id]; return (v && v.name) || (MAPS[id] && MAPS[id].name) || ''; }

  /** Reto del día de la clave k (AAAAMMDD; por defecto hoy). rookie (por defecto record.wins < 3): Difícil/Experto → Normal y el
   *  objetivo con el n de Normal. Las extracciones van siempre en el mismo orden y gastan siempre un número (aunque no se use). */
  function daily(k, rookie) {
    k = k == null ? today() : today(k);
    if (rookie == null) rookie = recordWins() < 3;
    var rng = mulberry32(hashStr('mtc-dia-' + k));
    var six = rng() < 0.15;                                                   // 1
    var mapWant = pick(rng, six ? HALLS : MAP_IDS);                           // 2
    var x = rng(), dReal = x < 0.5 ? 'normal' : x < 0.9 ? 'hard' : 'expert'; // 3
    var kind = MAPS[mapWant].kind;
    var pp = pick(rng, [15, 15, 21, 25]);                                     // 4
    var points = kind === 'beach' ? 21 : six ? 15 : pp;
    var ctrlR = rng(), ctrl = six ? 'one' : ctrlR < 0.7 ? 'both' : 'one';     // 5
    var modR = rng(), mod = six ? null : modR < 0.6 ? null : modR < 0.8 ? 'sinInsignias' : 'parejos'; // 6
    var di = dReal === 'normal' ? 0 : dReal === 'hard' ? 1 : 2, valid = [];
    for (var i = 0; i < GOALS.length; i++) { var G = GOALS[i], col = six ? G.n6 : G.n2; if (col[di] > 0) valid.push(G); }
    var goalDef = pick(rng, valid);                                           // 7
    var diff = rookie && dReal !== 'normal' ? 'normal' : dReal;
    var col2 = six ? goalDef.n6 : goalDef.n2, n = col2[rookie ? 0 : di];
    if (goalDef.id === 'clean') n = 0;
    else if (goalDef.sc) n = goalDef.zero ? Math.max(0, Math.round(n * points / 25)) : Math.max(1, Math.round(n * points / 25));
    var map = mapReady(mapWant) ? mapWant : MAP_DEF[kind];
    var txt = goalText(goalDef.id, n);
    var bits = [];
    if (six) bits.push('6 contra 6');
    bits.push(mapName(map), DIFF_NAME[diff], 'Sets a ' + points);
    if (!six) bits.push(ctrl === 'both' ? 'A los dos' : 'Un jugador');
    var opts = { reto: { kind: 'day', key: k, goal: goalDef.id, n: n }, format: six ? '6v6' : '2v2', map: map, difficulty: diff,
      points: points, ctrl: ctrl, noIntro: false };
    if (mod === 'sinInsignias') opts.noBadges = true;
    if (mod === 'parejos') opts.noAttrs = true;
    return { key: k, six: six, map: map, mapWant: mapWant, mapName: mapName(map), kind: kind, difficulty: diff, diffReal: dReal,
      diffName: DIFF_NAME[diff], points: points, ctrl: ctrl, mod: mod, modName: mod === 'sinInsignias' ? 'Sin insignias' : mod === 'parejos' ? 'Atributos parejos' : '',
      rookie: !!rookie, goal: { id: goalDef.id, n: n, txt: txt },
      tiers: ['Bronce: gana un set', 'Plata: gana el partido', 'Oro: ' + lc1(txt)], bits: bits, opts: opts };
  }

  // ---------------------------------------------------------------- guardado
  var lostF = false, roF = false, rCache = null, rRaw = null;
  function num(v, lo, hi) { v = +v; if (!isFinite(v)) return lo; v = Math.floor(v); return v < lo ? lo : v > hi ? hi : v; }
  function empty() { return { v: VER, gen: 1, m: {}, xp: {}, d: null, days: {}, old: { d: [0, 0, 0, 0], w: [0, 0, 0, 0] }, w: null, weeks: {}, seen: {} }; }
  function validWeek(k) { k = +k; var w = k % 100; return k === Math.floor(k) && k >= 190001 && k <= 299953 && w >= 1 && w <= 53; }
  function foldMap(src, max, oldArr, valid) {
    var keys = [], out = {}, k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k) && valid(+k)) keys.push(+k);
    keys.sort(function (a, b) { return a - b; });
    var cut = keys.length > max ? keys.length - max : 0;
    for (var i = 0; i < keys.length; i++) { var m = num(src[keys[i]], 0, 3); if (i < cut) oldArr[m]++; else out[keys[i]] = m; }
    return out;
  }
  /** Valida cualquier objeto (guardado o cuenta) y devuelve uno limpio con las claves en orden fijo. */
  function clean(o) {
    var out = empty();
    if (!o || typeof o !== 'object') return out;
    out.gen = num(o.gen, 1, 1e6);
    var m = o.m && typeof o.m === 'object' ? o.m : {}, x = o.xp && typeof o.xp === 'object' ? o.xp : {}, se = o.seen && typeof o.seen === 'object' ? o.seen : {};
    for (var i = 0; i < LIST.length; i++) {
      var b = LIST[i], e = m[b.id];
      if (e && typeof e === 'object') {
        var r = { l: num(e.l, 0, 3) };
        if (b.kind === 'set') {
          var s = [], src = Array.isArray(e.s) ? e.s : [];
          for (var j = 0; j < MAP_IDS.length; j++) if (src.indexOf(MAP_IDS[j]) >= 0) s.push(MAP_IDS[j]);
          r.v = s.length; r.s = s;
        } else if (e.v != null && isFinite(+e.v)) r.v = num(e.v, 0, 1e7);
        if (e.t != null && +e.t > 0) r.t = num(e.t, 0, 9e15);
        if (r.l || r.v != null) out.m[b.id] = r;
      }
      var xv = num(x[b.id], 0, 3); if (xv) out.xp[b.id] = xv;
      var sv = num(se[b.id], 0, 3); if (sv) out.seen[b.id] = sv;
    }
    if (o.d && typeof o.d === 'object' && validKey(o.d.k)) out.d = { k: +o.d.k, m: num(o.d.m, 0, 3), n: num(o.d.n, 0, 1e6), xp: num(o.d.xp, 0, 3) };
    if (o.w && typeof o.w === 'object' && validWeek(o.w.k)) out.w = { k: +o.w.k, r: num(o.w.r, 0, 3), out: o.w.out ? 1 : 0, m: num(o.w.m, 0, 3), n: num(o.w.n, 0, 1e6), xp: num(o.w.xp, 0, 3) };
    var od = o.old && Array.isArray(o.old.d) ? o.old.d : [], ow = o.old && Array.isArray(o.old.w) ? o.old.w : [];
    for (var q = 0; q < 4; q++) { out.old.d[q] = num(od[q], 0, 1e6); out.old.w[q] = num(ow[q], 0, 1e6); }
    out.days = foldMap(o.days && typeof o.days === 'object' ? o.days : {}, DAYS_MAX, out.old.d, validKey);
    out.weeks = foldMap(o.weeks && typeof o.weeks === 'object' ? o.weeks : {}, WEEKS_MAX, out.old.w, validWeek);
    return out;
  }
  function rawGet() { try { return root.localStorage.getItem(KEY); } catch (e) { return null; } }
  function parseRaw(raw) {
    if (!raw) return { o: empty(), bad: false, newer: false };
    var p; try { p = JSON.parse(raw); } catch (e) { return { o: empty(), bad: true, newer: false }; }
    if (!p || typeof p !== 'object') return { o: empty(), bad: true, newer: false };
    if (+p.v > VER) return { o: clean(p), bad: false, newer: true };
    return { o: clean(p), bad: false, newer: false };
  }
  /** Copia validada del guardado (nueva cada vez: se puede modificar). Con un día de reloj atrasado (d.k > hoy) pasa a hoy. */
  function load() {
    var raw = rawGet(), r = parseRaw(raw);
    if (r.bad) {
      lostF = true;
      try { if (!root.localStorage.getItem(BAK)) root.localStorage.setItem(BAK, raw); } catch (e) { }
    }
    roF = r.newer;
    var o = r.o, t = today();
    if (o.d && o.d.k > t) { var mt = o.days[t] | 0; o.d = { k: t, m: mt, n: 0, xp: mt }; }
    return o;
  }
  /** Lectura para consultas (cacheada por el texto crudo; no modificar). */
  function read() {
    var raw = rawGet();
    if (rCache && raw === rRaw) return rCache;
    rRaw = raw; rCache = load(); return rCache;
  }
  function save(o) {
    if (roF) return false;
    try { var s = JSON.stringify(clean(o)); root.localStorage.setItem(KEY, s); rRaw = null; rCache = null; return true; } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- fusión con la cuenta (como mergeGym: nunca se pierde una medalla)
  function mxObj(a, b, out) { var k; for (k in a) out[k] = a[k]; for (k in b) if (!(k in out) || b[k] > out[k]) out[k] = b[k]; return out; }
  function mergeObj(A, B) {
    var o = empty(), i;
    o.gen = Math.max(A.gen, B.gen);
    for (i = 0; i < LIST.length; i++) {
      var b = LIST[i], a = A.m[b.id], c = B.m[b.id];
      if (!a && !c) continue;
      if (!a || !c) { o.m[b.id] = JSON.parse(JSON.stringify(a || c)); continue; }
      var r = { l: Math.max(a.l, c.l) };
      if (b.kind === 'set') {
        var s = [];
        for (var j = 0; j < MAP_IDS.length; j++) if ((a.s || []).indexOf(MAP_IDS[j]) >= 0 || (c.s || []).indexOf(MAP_IDS[j]) >= 0) s.push(MAP_IDS[j]);
        r.v = s.length; r.s = s;
      } else if (a.v != null || c.v != null) {
        r.v = a.v == null ? c.v : c.v == null ? a.v : b.kind === 'min' ? Math.min(a.v, c.v) : Math.max(a.v, c.v);
      }
      var t = a.t && c.t ? Math.min(a.t, c.t) : (a.t || c.t);
      if (t) r.t = t;
      o.m[b.id] = r;
    }
    for (i = 0; i < LIST.length; i++) {
      var id = LIST[i].id, xv = Math.max(A.xp[id] | 0, B.xp[id] | 0), sv = Math.max(A.seen[id] | 0, B.seen[id] | 0);
      if (xv) o.xp[id] = xv; if (sv) o.seen[id] = sv;
    }
    if (A.d && B.d) o.d = A.d.k === B.d.k ? { k: A.d.k, m: Math.max(A.d.m, B.d.m), n: Math.max(A.d.n, B.d.n), xp: Math.max(A.d.xp, B.d.xp) } : JSON.parse(JSON.stringify(A.d.k > B.d.k ? A.d : B.d));
    else if (A.d || B.d) o.d = JSON.parse(JSON.stringify(A.d || B.d));
    if (A.w && B.w) {
      if (A.w.k === B.w.k) {
        var hi = A.w.m !== B.w.m ? (A.w.m > B.w.m ? A.w : B.w) : (A.w.r >= B.w.r ? A.w : B.w);
        o.w = { k: A.w.k, r: hi.r, out: A.w.out && B.w.out ? 1 : 0, m: Math.max(A.w.m, B.w.m), n: Math.max(A.w.n, B.w.n), xp: Math.max(A.w.xp, B.w.xp) };
      } else o.w = JSON.parse(JSON.stringify(A.w.k > B.w.k ? A.w : B.w));
    } else if (A.w || B.w) o.w = JSON.parse(JSON.stringify(A.w || B.w));
    for (i = 0; i < 4; i++) { o.old.d[i] = Math.max(A.old.d[i], B.old.d[i]); o.old.w[i] = Math.max(A.old.w[i], B.old.w[i]); }
    o.days = mxObj(A.days, B.days, {}); o.weeks = mxObj(A.weeks, B.weeks, {});
    return clean(o);
  }
  /** Une el guardado local (texto) con el de la cuenta (texto). Devuelve el texto local TAL CUAL si no cambia nada. Un lado con
   *  v > VER gana entero (no se rebaja); un lado ilegible se ignora. remoteNewer (de account.js) no hace falta: todo es por máximo. */
  function mergeRaw(L, R) {
    var a = parseRaw(L || ''), b = parseRaw(R || '');
    if (a.newer) return L;
    if (b.newer) return R;
    if (b.bad || !R) return L;
    if (a.bad || !L) return R;
    var M = mergeObj(a.o, b.o), s = JSON.stringify(M);
    return s === JSON.stringify(a.o) ? L : s;
  }

  // ---------------------------------------------------------------- contar durante el partido (O(1), sin asignar)
  // Un único objeto preasignado; los campos numéricos nacen en 0.5 y se reasignan (CONTRACT §2: no cambiar de mapa a mitad).
  function mkCounters() {
    return { aces: 0.5, kills: 0.5, blocks: 0.5, digs: 0.5, recv: 0.5, rallyMax: 0.5, streakMax: 0.5, saved: 0.5, feint: 0.5,
      roll: 0.5, edge: 0.5, chain: 0.5, errs: 0.5, defCur: 0.5, cbBest: 0.5, iron: 0.5, setsW: 0.5, setsL: 0.5 };
  }
  var cur = mkCounters(), bak = mkCounters();
  cur.g = null; cur.six = false; cur.on = false; cur.over = 0.5; cur.win = 0.5; cur.gs0 = 0.5; cur.gs1 = 0.5;
  cur.hit0 = 0.5; cur.hit0Spk = 0.5; cur.server0 = 0.5; cur.blocker = 0.5; cur.prevKind = ''; cur.prevTeam = 0.5;
  var lastEndG = null, lastRes = null;
  var CNT = ['aces', 'kills', 'blocks', 'digs', 'recv', 'rallyMax', 'streakMax', 'saved', 'feint', 'roll', 'edge', 'chain', 'errs',
    'defCur', 'cbBest', 'iron', 'setsW', 'setsL'];
  function resetCur(g) {
    for (var i = 0; i < CNT.length; i++) { cur[CNT[i]] = 0; bak[CNT[i]] = 0; }
    cur.iron = 99; bak.iron = 99;
    cur.g = g; cur.six = !!(g && (g.size === 6 || (g.teams && g.teams[0] && g.teams[0].length > 2)));
    cur.on = true; cur.over = 0; cur.win = 0; cur.gs0 = 0; cur.gs1 = 0;
    cur.hit0 = -1; cur.hit0Spk = 0; cur.server0 = -1; cur.blocker = -1; cur.prevKind = ''; cur.prevTeam = -1;
  }
  function copyCnt(dst, src) { for (var i = 0; i < CNT.length; i++) dst[CNT[i]] = src[CNT[i]]; }
  function dbg() { return !!(VB.ctx && VB.ctx.debug); }
  function spectator(g) { return g.watch0 !== undefined ? !!g.watch0 : !!g.watch; }
  /** ¿Cuentan los eventos de este partido? Partidos humanos; no la demo, los ejercicios ni el espectador. El autopilot y la
   *  depuración no cuentan salvo con _force; una escena de depuración con g.reto cuenta, pero endMatch la cierra en seco (dry). */
  function counts(g) {
    if (!g || g.demo || g.drill || spectator(g)) return false;
    if (VB.Retos._force) return true;
    if (dbg()) return !!g.reto;
    return !g.autopilot;
  }
  /** 2v2: todo el equipo 0. 6v6: solo el jugador que controlas (g.ctrl, o su base si entra el líbero). */
  function mine(g, p) {
    if (!cur.six) return true;
    return !!p && (p === g.ctrl || p === g.ctrlBase || (typeof p !== 'object' && g.ctrl && g.ctrl.id === p));
  }
  function chainOk(e, n) {
    return !!e && e.kind === 'spike' && e.grade === 'perfect' && ((n != null ? n : e.chain) | 0) >= 3;
  }

  function ingest(e, g) {
    if (!e || !counts(g)) return;
    if (e.type === 'newMatch') { resetCur(g); if (lastEndG === g) { lastEndG = null; lastRes = null; } return; }
    if (lastEndG === g) return;               // partido ya cerrado (eventos tras gameOver)
    if (!cur.on || cur.g !== g) resetCur(g);
    switch (e.type) {
      case 'hit': {
        if (e.kind === 'serve') {
          cur.hit0 = -1; cur.blocker = -1;
          cur.server0 = e.team === 0 ? (mine(g, e.player) ? 1 : 0) : -1;
        } else if (e.team === 0) {
          var me = mine(g, e.player);
          var dig = e.dig != null ? !!e.dig : (e.touch === 1 && e.kind === 'pass' && cur.prevKind === 'spike' && cur.prevTeam === 1 && e.shot !== 'shank');
          var recv = e.recv != null ? !!e.recv : (e.touch === 1 && cur.prevKind === 'serve' && cur.prevTeam === 1);
          if (dig && me) cur.digs++;
          if (recv && e.grade === 'perfect' && e.human && me) cur.recv++;
          if (e.human && me && chainOk(e)) cur.chain++;
        }
        if (e.team === 0) { cur.hit0 = mine(g, e.player) ? 1 : 0; cur.hit0Spk = e.kind === 'spike' ? 1 : 0; }
        cur.prevKind = e.kind; cur.prevTeam = e.team;
        break;
      }
      case 'block':
        if (e.team === 0) cur.blocker = mine(g, e.player) ? 1 : 0;
        cur.prevKind = 'block'; cur.prevTeam = e.team;
        break;
      case 'point': {
        // punto anulado por challenge: la sim vuelve a pitar y ui.js marca el nuevo con _ovr → se deshace el anterior
        if (e._ovr) copyCnt(cur, bak); else copyCnt(bak, cur);
        var sc0 = e.score ? e.score[0] | 0 : 0, sc1 = e.score ? e.score[1] | 0 : 0;
        if ((e.rallyHits | 0) > cur.rallyMax) cur.rallyMax = e.rallyHits | 0;
        if (e.team === 0) {
          var spkMine = cur.hit0 === 1 && cur.hit0Spk === 1;
          if (e.how === 'ace' && cur.server0 === 1) cur.aces++;
          else if (e.how === 'kill' && spkMine) cur.kills++;
          else if (e.how === 'block' && cur.blocker === 1) cur.blocks++;
          if ((e.streak | 0) > cur.streakMax) cur.streakMax = e.streak | 0;
          if (e.savedSetPoint) cur.saved++;
          if (e.move && (!cur.six || cur.hit0 === 1)) {
            if (e.move === 'feint') cur.feint++; else if (e.move === 'roll') cur.roll++; else if (e.move === 'edge') cur.edge++;
          }
        } else if (e.team === 1 && e.how === 'error') {
          if (!cur.six || mine(g, e.player) || cur.hit0 === 1) cur.errs++;
        }
        var def = sc1 - sc0; if (def > cur.defCur) cur.defCur = def;
        if (e.setWon) {
          if (e.team === 0) {
            cur.setsW++;
            if (cur.defCur > cur.cbBest) cur.cbBest = cur.defCur;
            if (sc0 >= 21 && sc1 < cur.iron) cur.iron = sc1;
          } else cur.setsL++;
          cur.defCur = 0;
        }
        cur.hit0 = -1; cur.hit0Spk = 0; cur.blocker = -1; cur.prevKind = ''; cur.prevTeam = -1;
        break;
      }
      case 'gameOver':
        cur.over = 1; cur.win = e.team === 0 ? 1 : 0;
        if (e.sets) { cur.gs0 = e.sets[0] | 0; cur.gs1 = e.sets[1] | 0; }
        break;
    }
  }

  // ---------------------------------------------------------------- cerrar el partido
  function matchVal(id, win, g, info) {
    switch (id) {
      case 'r_aces': return cur.aces;
      case 'r_kills': return cur.kills;
      case 'r_blocks': return cur.blocks;
      case 'r_digs': return cur.digs;
      case 'r_recv': return cur.recv;
      case 'r_rally': return cur.rallyMax;
      case 'r_streak': return cur.streakMax;
      case 'r_win': return win ? Math.max(0, Math.min(3, diffOrder().indexOf(g.difficulty))) : 0;
      case 'r_iron': return cur.iron < 99 ? cur.iron : null;
      case 'r_comeback': return cur.cbBest;
      case 'r_saved': return cur.saved;
      case 'r_tidy': return win ? cur.errs : null;
      case 'r_feint': return cur.feint;
      case 'r_roll': return cur.roll;
      case 'r_edge': return cur.edge;
      case 'r_chain': return cur.chain;
      case 'r_six': return win && cur.six ? 1 : 0;
    }
    return 0;
  }
  function goalOk(id, n, win) {
    if (!win) return false;
    switch (id) {
      case 'aces': return cur.aces >= n;
      case 'kills': return cur.kills >= n;
      case 'blocks': return cur.blocks >= n;
      case 'digs': return cur.digs >= n;
      case 'streak': return cur.streakMax >= n;
      case 'clean': return cur.setsL === 0;
      case 'tidy': return cur.errs <= n;
      case 'comeback': return cur.cbBest >= n;
      case 'rally': return cur.rallyMax >= n;
      case 'mastery': return cur.feint + cur.roll + cur.edge >= n;
    }
    return false;
  }
  function payXP(x) {
    if (!x || !VB.Prog || !VB.Prog.addXP) return;
    try { VB.Prog.addXP(0, x); VB.Prog.addXP(1, x); } catch (e) { }
  }

  function endMatch(g, info, dry) {
    if (!g) return null;
    if (lastEndG === g) return lastRes;        // ya cerrado (dos llamadas para el mismo partido)
    if (!counts(g)) return null;
    if (!cur.on || cur.g !== g) resetCur(g);   // sin eventos: solo cuenta el resultado
    info = info || {};
    dry = !!dry || (dbg() && !VB.Retos._force);
    var win = info.win != null ? !!info.win : cur.win === 1;
    if (info.sets && info.sets.length === 2) { cur.gs0 = info.sets[0] | 0; cur.gs1 = info.sets[1] | 0; }
    var setsW = Math.max(cur.setsW, cur.gs0), o = load(), now = Date.now(), up = [], xp = 0, i, lv;
    for (i = 0; i < LIST.length; i++) {
      var b = LIST[i], id = b.id, e = o.m[id] || { l: 0 }, prev = e.l | 0, v;
      if (b.kind === 'set') {
        var s = e.s ? e.s.slice() : [];
        if (win && info.map && MAPS[info.map] && s.indexOf(info.map) < 0) s.push(info.map);
        var s2 = []; for (var j = 0; j < MAP_IDS.length; j++) if (s.indexOf(MAP_IDS[j]) >= 0) s2.push(MAP_IDS[j]);
        e.s = s2; e.v = s2.length;
      } else {
        v = matchVal(id, win, g, info);
        if (b.kind === 'sum') e.v = (e.v | 0) + (v | 0);
        else if (b.kind === 'min') { if (v != null) e.v = e.v == null ? v : Math.min(e.v, v); }
        else if (v != null && (e.v == null || v > e.v)) e.v = v;
      }
      lv = Math.max(prev, levelFor(id, e.v));
      if (lv > prev) { e.l = lv; if (!e.t) e.t = now; up.push({ id: id, name: b.name, lvl: lv, prev: prev, tier: TIERS[lv] }); }
      if (e.l || (e.v != null && (b.kind === 'min' || e.v > 0))) o.m[id] = e;
      var paid = o.xp[id] | 0;
      for (var k = paid + 1; k <= (e.l | 0); k++) xp += XP[k - 1];
      if ((e.l | 0) > paid) o.xp[id] = e.l;
    }
    var day = null, dxp = 0;
    var R = g.reto;
    if (R && R.kind === 'day' && validKey(R.key)) {
      var key = +R.key, gid = R.goal, gn = R.n;
      if (!gid || gn == null) { var dd = daily(key); gid = dd.goal.id; gn = dd.goal.n; }
      var ok = goalOk(gid, gn, win), medal = win ? (ok ? 3 : 2) : setsW >= 1 ? 1 : 0;
      var prevDay = o.days[key] != null ? o.days[key] | 0 : -1, pm = Math.max(0, prevDay), dpaid;
      if (!o.d || key > o.d.k) o.d = { k: key, m: pm, n: 0, xp: pm };
      if (o.d.k === key) {
        o.d.n++; dpaid = o.d.xp;
        if (medal > o.d.m) o.d.m = medal;
        for (lv = dpaid + 1; lv <= o.d.m; lv++) dxp += XP_DAY[lv - 1];
        if (o.d.m > dpaid) o.d.xp = o.d.m;
      } else {                                 // partido de un día ya pasado (empezó antes de medianoche): lo cobrado = su medalla
        for (lv = pm + 1; lv <= medal; lv++) dxp += XP_DAY[lv - 1];
      }
      o.days[key] = Math.max(pm, medal);
      day = { key: key, medal: medal, prev: pm, best: o.days[key], newMedal: medal > pm, xp: dxp,
        goal: { id: gid, n: gn, txt: goalText(gid, gn), ok: ok }, setsW: setsW };
    }
    var res = { up: up, xp: xp, day: day, week: null, dry: dry };
    if (!dry) { o.gen = o.gen | 0 || 1; save(o); payXP(xp + dxp); }
    lastEndG = g; lastRes = res; cur.on = false; cur.g = null;
    return res;
  }

  // ---------------------------------------------------------------- consultar
  function level(id) { var e = read().m[id]; return e ? e.l | 0 : 0; }
  function nameOfDiff(i) { return DIFF_NAME[diffOrder()[i]] || DIFF_NAME[DIFFS[i]] || ''; }
  function progress(id) {
    var b = BY[id]; if (!b) return null;
    var e = read().m[id] || { l: 0 }, lvl = e.l | 0, v = e.v == null ? null : e.v, next = lvl < 3 ? b.th[lvl] : null;
    var base = lvl > 0 ? b.th[lvl - 1] : (b.kind === 'min' ? b.th[0] * 2 : 0), frac = 1, txt;
    if (next != null) {
      if (b.kind === 'min') frac = v == null ? 0 : Math.max(0, Math.min(1, (base - v) / Math.max(1, base - next)));
      else frac = Math.max(0, Math.min(1, ((v || 0) - base) / Math.max(1, next - base)));
    }
    var tn = next != null ? TIERS[lvl + 1] : '';
    if (lvl >= 3) txt = '¡Oro!';
    else if (b.kind === 'min') txt = b.name + ': ' + (v == null ? 'sin marca' : 'mejor ' + v) + ', ' + tn + ' con ' + next + ' o menos';
    else if (b.kind === 'tier') txt = lvl ? 'Ganado en ' + nameOfDiff(lvl) + '; ' + tn + ' en ' + nameOfDiff(lvl + 1) : 'Bronce: gana en ' + nameOfDiff(1);
    else if (b.kind === 'set') txt = 'Sedes: ' + (v || 0) + ' de 6, ' + tn + ' con ' + next;
    else if (b.kind === 'max') txt = b.cond + ': récord ' + (v || 0) + b.unit + ', ' + tn + ' con ' + next;
    else txt = b.cond + ': ' + (v || 0) + ', ' + tn + ' con ' + next;
    return { v: v, lvl: lvl, next: next, frac: frac, txt: txt };
  }
  function count() { var o = read(), s = 0; for (var i = 0; i < LIST.length; i++) { var e = o.m[LIST[i].id]; if (e) s += e.l | 0; } return s; }
  function summary() {
    var o = read(), r = { b: 0, p: 0, o: 0, total: 0, of: OF, days: 0, daysGold: 0, weeks: 0, weeksWon: 0 }, k;
    for (var i = 0; i < LIST.length; i++) { var e = o.m[LIST[i].id], l = e ? e.l | 0 : 0; if (l >= 1) r.b++; if (l >= 2) r.p++; if (l >= 3) r.o++; }
    r.total = r.b + r.p + r.o;
    for (k in o.days) { if (o.days[k] >= 1) r.days++; if (o.days[k] >= 3) r.daysGold++; }
    r.days += o.old.d[1] + o.old.d[2] + o.old.d[3]; r.daysGold += o.old.d[3];
    for (k in o.weeks) { if (o.weeks[k] >= 1) r.weeks++; if (o.weeks[k] >= 3) r.weeksWon++; }
    r.weeks += o.old.w[1] + o.old.w[2] + o.old.w[3]; r.weeksWon += o.old.w[3];
    return r;
  }
  function unseen() { var o = read(), out = []; for (var i = 0; i < LIST.length; i++) { var id = LIST[i].id, e = o.m[id]; if (e && (e.l | 0) > (o.seen[id] | 0)) out.push(id); } return out; }
  function markSeen(ids) {
    var o = load(), ch = false; ids = ids || IDS;
    for (var i = 0; i < ids.length; i++) { var e = o.m[ids[i]]; if (e && (e.l | 0) > (o.seen[ids[i]] | 0)) { o.seen[ids[i]] = e.l; ch = true; } }
    return ch ? save(o) : false;
  }
  function dayState() { var o = read(), t = today(); return o.d && o.d.k === t ? { key: t, m: o.d.m, n: o.d.n } : { key: t, m: 0, n: 0 }; }
  /** XP de perfil (D2), derivada del guardado y monótona (todo se fusiona por máximo y nada baja). */
  function profileXP() {
    var o = read(), x = 0, i, k;
    for (i = 0; i < LIST.length; i++) { var e = o.m[LIST[i].id], l = e ? e.l | 0 : 0; for (var j = 0; j < l; j++) x += PXP[j]; }
    for (k in o.days) x += PXP_DAY[o.days[k] | 0];
    for (i = 1; i < 4; i++) x += o.old.d[i] * PXP_DAY[i];
    return x;
  }
  var MEDAL_COL = ['none', '#c9803d', '#c3ccd6', '#ffd23f'];
  function medalIcon(l) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 2h3l1 6-3 1zM16 2h-3l-1 6 3 1z" fill="#3a2f55"/>' +
      '<circle cx="12" cy="15" r="6.5" fill="' + MEDAL_COL[l | 0] + '" stroke="#1d1530" stroke-width="1.8"' + (l ? '' : ' stroke-dasharray="2 2"') + '/></svg>';
  }
  /** Pestaña de retos del álbum de perfil (forma de S4-D2 §3): un hueco por reto, tier = nivel. */
  function album() {
    var o = read(), items = [], have = 0;
    for (var i = 0; i < LIST.length; i++) {
      var b = LIST[i], e = o.m[b.id], l = e ? e.l | 0 : 0;
      if (l) have++;
      items.push({ aid: 'reto:' + b.id, name: b.name, icon: medalIcon(l), have: l > 0, tier: l, t: (e && e.t) || 0, src: 'retos',
        how: b.cond + ' (bronce con ' + b.th[0] + (b.kind === 'min' ? ' o menos' : '') + ')', isNew: l > (o.seen[b.id] | 0) });
    }
    return { id: 'retos', label: 'Retos', have: have, total: LIST.length, items: items };
  }
  /** Datos para las alternativas de desbloqueo del Vestuario: {reto:{id:lvl}, retoN: medallas, dias: días con oro, semana}. */
  function lookData() {
    var s = summary(), o = read(), r = {};
    for (var i = 0; i < LIST.length; i++) { var e = o.m[LIST[i].id]; r[LIST[i].id] = e ? e.l | 0 : 0; }
    return { reto: r, retoN: s.total, dias: s.daysGold, semana: s.weeksWon, retos: s };
  }

  VB.Retos = {
    LIST: LIST, IDS: IDS, BY: BY, GROUPS: GROUPS, TIERS: TIERS, XP: XP, XP_DAY: XP_DAY, MAPS: MAPS, GOALS: GOALS, KEY: KEY, VER: VER,
    ingest: ingest, endMatch: endMatch, chainOk: chainOk,
    level: level, levelFor: levelFor, progress: progress, count: count, summary: summary, unseen: unseen, markSeen: markSeen,
    today: today, isoWeek: isoWeek, dateLabel: dateLabel, daily: daily, dayState: dayState, goalText: goalText,
    profileXP: profileXP, album: album, lookData: lookData,
    load: load, save: save, clean: clean, mergeRaw: mergeRaw,
    reset: function () { try { root.localStorage.removeItem(KEY); } catch (e) { } rRaw = null; rCache = null; lostF = false; roF = false; },
    lost: function () { read(); return lostF; }, readOnly: function () { read(); return roF; },
    _cur: function () { return cur.on ? cur : null; }, _reset: function () { cur.on = false; cur.g = null; lastEndG = null; lastRes = null; },
    _hash: hashStr, _force: false
  };
})();
