/* MAKE THE CUT — js/recap.js (owner: ui_main)
 * VB.Recap: el único módulo narrativo (plan S2-S4, R1). Puro: sin DOM, sin THREE, sin red; se carga en node (tools/recaptest.js).
 *  - Previa (B5): introPlan(info) → mini 2,5 s | corta 4,5 s | larga 6,0 s, con los beats A/B/C, el historial (history) y lo que
 *    está en juego (stake). trait() da el rasgo de la pareja o del equipo; ord() los ordinales «1r», «2º», «3r» (nunca «1.er»).
 *  - Cierre (B6 + C4): headline(d, seed) elige el titular con una tabla ordenada (R1), endModel(d) arma el modelo de la hoja final
 *    (bloques y botones) y tableSlice() corta la clasificación alrededor de ti con tu movimiento (move()).
 *  - Repetición (C1): playPhrase(meta, g) → «Remate del n.º 7 tras 3 defensas».
 * Terminología (R2): «punto de set» / «punto de partido», nunca «bola de set».
 * Nombres (C4): en la Carrera, el nombre (apellido en las frases); en Partido rápido, «tu n.º 1» / «el n.º 7».
 * La variante de texto sale de h01(seed, sal) (hash propio de g.seed, solo lectura), NUNCA de g.rng ni Math.random.
 * Textos: «·» no sale nunca; las listas internas usan « | » para que ui.js las parta con setSep(…, 'v').
 * VB.Look (Vestuario) es opcional: solo se usa para el nombre de los desbloqueos, con guarda.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ constantes
  var DUR = { mini: 2.5, short: 4.5, long: 6 };   // la larga es el tope de CameraRig.playIntro (6 s)
  var END_CELEB = 3;                               // s de celebración antes de la hoja (tiempo vivo, sin la repetición: R11)
  var BEAT_B = 2.2, BEAT_C = 4.0;
  // rasgo de la pareja/equipo: grupo → atributos que lo forman y texto del chip
  var TRAITS = [
    { k: 'spike', a: ['spike'], t: 'Pegan fuerte' },
    { k: 'serve', a: ['serve'], t: 'Sacan bien' },
    { k: 'block', a: ['block'], t: 'Buen muro' },
    { k: 'def', a: ['recv', 'dig'], t: 'Defienden todo' },
    { k: 'set', a: ['set', 'ctl'], t: 'Colocan fino' },
    { k: 'jump', a: ['jump'], t: 'Saltan mucho' },
    { k: 'speed', a: ['speed', 'react'], t: 'Muy rápidos' }
  ];
  var TRAIT_EVEN = { k: 'even', t: 'Equilibrados' }, TRAIT_GAP = 3;
  // beat C (lo que está en juego), por prioridad
  var STAKES = {
    final: { t1: 'Final del Open', t2: 'Gana y levantas el trofeo' },
    semi: { t1: 'Semifinal', t2: 'El que gane, a la final' },
    boss: { t1: 'Jefe: {nick}', t2: '{style}' },
    duel: { t1: 'Duelo con tu rival', t2: '{name} | {w}-{l} en duelos' },
    // ambiente de Carrera (career.js ambCtx → g.career.amb.tags): derbi de la ciudad, revancha y partido en la cumbre
    derby: { t1: 'DERBI', t2: '{city} se paraliza' },
    revancha: { t1: 'REVANCHA', t2: 'La última vez ganó {rival}' },
    cumbre: { t1: 'CUMBRE', t2: 'Los dos de arriba, cara a cara' },
    first: { t1: 'Empieza la temporada {season}', t2: '{league}' }
  };
  var STAKE_ORDER = ['final', 'semi', 'boss', 'duel', 'derby', 'revancha', 'cumbre', 'first'];
  var ORDW = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto'];
  var MEDAL = ['', 'bronce', 'plata', 'oro'];
  var TAB_LABEL = { sum: 'Resumen', stats: 'Estadísticas', plays: 'Jugadas' };

  // ------------------------------------------------------------------ utilidades
  /** Ordinal corto de la guía: «1r», «2º», «3r», «4º», «11º»… (el mismo criterio que ordn de career.js). '' con 0 o menos. */
  function ord(n) { n = n | 0; if (n <= 0) return ''; return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  function ordw(n) { n = n | 0; return ORDW[n] || ord(n); }
  /** Hash propio [0,1) (murmur3 corto) de una semilla y una sal: elige variantes de texto sin tocar g.rng. */
  function h01(seed, salt) {
    var h = (seed >>> 0) ^ 0x9e3779b9, s = String(salt == null ? '' : salt);
    for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995); h ^= h >>> 13; }
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function cap(s) { s = String(s || ''); var i = s.charAt(0) === '¡' || s.charAt(0) === '«' ? 1 : 0; return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1); }
  function low1(s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }
  /** «de» + «el» = «del» (y «a» + «el» = «al»), en cualquier punto de la frase. */
  function contract(s) { return String(s).replace(/(^|[\s(])([Dd])e el /g, '$1$2el ').replace(/(^|[\s(])([Aa]) el /g, '$1$2l '); }
  function fill(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return o[k] == null ? '' : String(o[k]); }); }
  function surname(n) { n = String(n || '').trim(); var p = n.split(/\s+/); return p[p.length - 1] || n; }
  function num(v) { v = Math.round(+v || 0); var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (v < 0 ? '−' : '') + s; }
  function dec1(v) { return (Math.round((+v || 0) * 10) / 10).toFixed(1).replace('.', ','); }
  function plural(n, one, many) { return (n | 0) + ' ' + ((n | 0) === 1 ? one : many); }
  function noDot(s) { return String(s == null ? '' : s).split(' · ').join(' | ').replace(/·/g, '|'); }
  /** Rival personal de la Carrera ({name, w, l}, de c.life.rival): career.rivalInfo (g.career.rival ya es la abreviatura del club). */
  function rivalInfo(cs) { var r = cs && (cs.rivalInfo || cs.lifeRival); return r && typeof r === 'object' && r.name ? r : null; }
  function isHall(cs) { return !!(cs && (cs.mode === 'hall' || cs.venue === 'hall')); }

  // ------------------------------------------------------------------ previa (B5)
  /** Movimiento en la tabla de p0 a p1 (posiciones, 1 = primero): {d, txt:'▲2'|'▼1'|'='}. Sin p0 (1ª jornada): {d:0, txt:''}. */
  function move(p0, p1) {
    p0 = p0 | 0; p1 = p1 | 0;
    if (p0 <= 0 || p1 <= 0) return { d: 0, txt: '' };
    var d = p0 - p1;
    return { d: d, txt: d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : '=' };
  }
  function attrMean(list, key) {
    var s = 0, n = 0;
    for (var i = 0; i < list.length; i++) { var v = list[i] && +list[i][key]; if (v > 0) { s += v; n++; } }
    return n ? s / n : 0;
  }
  /** Rasgo del atributo más alto de la media de la pareja (o de un array de atletas en stA): {k, t} | null sin atributos.
   *  Cada grupo vale lo que su mejor atributo; con menos de 3 entre el 1º y el 2º grupo, «Equilibrados». */
  function trait(stA, stB) {
    var list = Array.isArray(stA) ? stA.slice() : [stA];
    if (stB) list.push(stB);
    list = list.filter(function (x) { return x && typeof x === 'object'; });
    if (!list.length) return null;
    var best = null, bv = -1, sec = -1;
    for (var i = 0; i < TRAITS.length; i++) {
      var T = TRAITS[i], v = 0;
      for (var j = 0; j < T.a.length; j++) v = Math.max(v, attrMean(list, T.a[j]));
      if (v > bv) { sec = bv; bv = v; best = T; } else if (v > sec) sec = v;
    }
    if (!(bv > 0)) return null;
    if (bv - sec < TRAIT_GAP) return { k: TRAIT_EVEN.k, t: TRAIT_EVEN.t };
    return { k: best.k, t: best.t };
  }
  /** Etapa de copa a partir de career.stage o de la etiqueta («Final del Open», «Copa X · Semifinal»): 'final'|'semi'|'' */
  function stageOf(cs) {
    if (!cs) return '';
    if (cs.stage === 'final' || cs.stage === 'semi') return cs.stage;
    var L = String(cs.label || '');
    if (/semifinal/i.test(L)) return 'semi';
    if (/(^|[^a-záéíóú])final/i.test(L)) return 'final';
    return '';
  }
  /** Nombre de la competición de copa para el beat C: «Final del Open» en la playa; «Final: Copa X» en la pista. */
  function finalTitle(cs) {
    var L = String(cs && cs.label || '');
    if (L.indexOf(' · ') >= 0) { var p = L.split(' · '); return 'Final: ' + p[0]; }
    if (/^final /i.test(L)) return L;
    return STAKES.final.t1;
  }
  /** Textos del beat B (máx. 2, por prioridad). info: ver introPlan. */
  function history(info) {
    info = info || {};
    var out = [], cs = info.career;
    if (cs) {
      var duelRv = cs.duel ? rivalInfo(cs) : null;   // rival personal {name, w, l} (c.life.rival)
      if (duelRv && duelRv.name) out.push('Duelos con ' + duelRv.name + ': ' + (duelRv.w | 0) + '-' + (duelRv.l | 0));
      else {
        var h = cs.h2h;
        if (h && (h[0] | 0) > 0) {
          var t = 'Cara a cara: ' + (h[1] | 0) + '-' + (h[2] | 0);
          if (cs.last && cs.last.length === 2) t += ' | el último, ' + (cs.last[0] | 0) + '-' + (cs.last[1] | 0);
          out.push(t);
        } else if (cs.rivalName && !cs.trial) out.push(contract('Primera vez contra ' + cs.rivalName));   // (partidillo de prueba: es el club que te prueba, sin cara a cara)
      }
      if (cs.goal) out.push('Reto: ' + low1(cs.goal));
    } else {
      var dn = info.diffName || 'Normal', b = info.byD;
      if (b && ((b[0] | 0) + (b[1] | 0)) > 0) out.push('Tu balance en ' + dn + ': ' + (b[0] | 0) + '-' + (b[1] | 0));
      else out.push('Tu primer partido en ' + dn);
      if ((info.winRun | 0) >= 2) out.push('Llevas ' + (info.winRun | 0) + ' victorias seguidas');
    }
    return out.slice(0, 2);
  }
  /** Beat C: {k, t1, t2} | null. t2 puede llevar « | » (ui.js lo parte con setSep). Con partido marcado («Carrera con vida»,
   *  career.story = {tag, line}), su línea va de t1 (y la clave y el t2 de siempre, si los hay). */
  function stake(info) {
    var r = stake0(info), sl = info && info.career && info.career.story && info.career.story.tag ? String(info.career.story.line || '') : '';
    return sl ? { k: r ? r.k : 'story', t1: sl, t2: r ? r.t2 : '' } : r;
  }
  function stake0(info) {
    var cs = info && info.career; if (!cs) return null;
    var st = stageOf(cs), rv = rivalInfo(cs);
    for (var i = 0; i < STAKE_ORDER.length; i++) {
      var k = STAKE_ORDER[i], S = STAKES[k];
      if (k === 'final' && st === 'final') return { k: k, t1: finalTitle(cs), t2: S.t2 };
      if (k === 'semi' && st === 'semi') return { k: k, t1: S.t1, t2: S.t2 };
      if (k === 'boss' && cs.boss && (cs.boss.nick || cs.boss.name)) return { k: k, t1: fill(S.t1, { nick: cs.boss.nick || cs.boss.name }), t2: cs.boss.styleName || cs.boss.style || cs.boss.hint || '' };
      if (k === 'duel' && cs.duel && rv && rv.name) return { k: k, t1: S.t1, t2: fill(S.t2, { name: rv.name, w: rv.w | 0, l: rv.l | 0 }) };
      var tg = cs.amb && Array.isArray(cs.amb.tags) ? cs.amb.tags : null;
      if (k === 'derby' && tg && tg.indexOf('derbi') >= 0 && isHall(cs) && cs.amb.city) return { k: k, t1: S.t1, t2: fill(S.t2, { city: cs.amb.city }) };
      if (k === 'revancha' && tg && tg.indexOf('revancha') >= 0) return { k: k, t1: S.t1, t2: contract(fill(S.t2, { rival: cs.rivalName || 'el rival' })) };
      if (k === 'cumbre' && tg && tg.indexOf('cumbre') >= 0) return { k: k, t1: S.t1, t2: S.t2 };
      if (k === 'first' && (cs.first != null ? cs.first : cs.phase === 'league' && cs.week === 0)) return { k: k, t1: fill(S.t1, { season: cs.season | 0 || 1 }), t2: cs.league || cs.leagueName || '' };
    }
    return null;
  }
  function sideBlocks(info) {
    var cs = info.career, six = (info.size | 0) === 6, sh = !!info.short;
    var A = { nm: 'TÚ', sm: '', tr: null, pos: '' }, B = { nm: 'CPU', sm: six ? 'Equipo rival' : 'Pareja rival', tr: null, pos: '' };
    if (cs) {
      A.nm = (sh ? cs.me : cs.meName) || cs.meName || cs.me || 'TÚ';
      var rs = typeof cs.rival === 'string' ? cs.rival : '';
      B.nm = (sh && rs ? rs : cs.rivalName || rs) || 'Rival';
      if (isHall(cs) || six) A.sm = 'Tú: n.º ' + (cs.num | 0) + (cs.posName ? ', ' + low1(cs.posName) : '');
      else A.sm = cs.player && cs.mate ? cs.player + ' y ' + cs.mate : cs.player || '';
      var rv = rivalInfo(cs);
      if (cs.duel && rv && rv.name && !six) B.sm = 'Con ' + rv.name + ', tu rival';
      if (cs.phase === 'league' && (cs.week | 0) > 0) { A.pos = ord(cs.pos0); B.pos = ord(cs.rivalPos); }
    } else {
      var n = info.nums || [1, 2];
      if (six) A.sm = 'Tú: n.º ' + (n[0] | 0 || 1) + (info.posName ? ', ' + low1(info.posName) : '');
      else A.sm = info.ctrlOne ? 'Llevas al n.º ' + (n[0] | 0 || 1) : 'N.º ' + (n[0] | 0 || 1) + ' y N.º ' + (n[1] | 0 || 2);
    }
    A.tr = trait(info.stA, info.stA2);
    B.tr = cs && cs.boss && (cs.boss.styleName || cs.boss.style) ? { k: 'boss', t: cs.boss.styleName || cs.boss.style } : trait(info.stB, info.stB2);
    return [A, B];
  }
  /** Plan de la previa. info = {again, drill, kind (forzado), diff, diffName, byD:[g,p], winRun, size, ctrlOne, nums, posName,
   *  short (≤ 420 px de alto), stA/stA2 y stB/stB2 (atributos), career: g.career + {pos0, rivalPos, h2h, last, duel, rivalInfo
   *  {name,w,l}, first, boss, league, season}}.
   *  → {kind:'mini'|'short'|'long', dur, beats:[{at, id}], b:[≤2 textos], c:{k,t1,t2}|null, t:[bloque tú, bloque rival], sr} */
  function introPlan(info) {
    info = info || {};
    var cs = info.career, c = stake(info), kind;
    if (info.kind === 'mini' || info.kind === 'short' || info.kind === 'long') kind = info.kind;
    else if (info.again || info.drill) kind = 'mini';
    else if (cs && c) kind = 'long';
    else kind = 'short';
    var beats = [{ at: 0, id: 'A' }];
    if (kind !== 'mini') beats.push({ at: BEAT_B, id: 'B' });
    if (kind === 'long' && c) beats.push({ at: BEAT_C, id: 'C' });
    var t = sideBlocks(info);
    var sr = t[0].nm + ' contra ' + t[1].nm + (c ? '. ' + c.t1 : '');
    return { kind: kind, dur: Math.min(6, DUR[kind]), beats: beats, b: kind === 'mini' ? [] : history(info), c: kind === 'long' ? c : null, t: t, sr: noDot(sr) };
  }

  // ------------------------------------------------------------------ nombres (C4)
  /** Quién es p ({num, team, name}) en una frase. start: a principio de frase (mayúscula). */
  function whoName(p, d, start) {
    var cs = d.career, t = p.team | 0, n = p.num | 0, s;
    if (cs) {
      if (t === 0 && n === (cs.num | 0) && cs.player) s = surname(cs.player);
      else if (t === 0 && !isHall(cs) && n === (cs.mateNum | 0) && cs.mate) s = surname(cs.mate);
      else if (t === 1 && cs.rivalNum != null && n === (cs.rivalNum | 0) && cs.rivalP) s = surname(typeof cs.rivalP === 'string' ? cs.rivalP : cs.rivalP.name);
      else s = 'el n.º ' + n + (t === 1 && cs.rivalName ? ' de el ' + cs.rivalName : '');
    } else if (p.name) s = p.name;
    else s = t === 0 ? 'tu n.º ' + n : 'el n.º ' + n + ' de ' + low1(d.cpu || 'la CPU');
    s = contract(s);
    return start ? cap(s) : s;
  }
  var CLUB_ART = /^(Voley|Vóley|Club|Equipo|Real|Atlético|Deportivo|equipo|rival)(\s|$)/;
  /** El equipo t en una frase: «tu pareja» / «tu equipo» / «la CPU» / «el Voley Gandia». */
  function teamName(t, d, start) {
    var cs = d.career, s;
    if (cs) { s = t === 0 ? cs.meName || 'equipo' : cs.rivalName || 'rival'; if (CLUB_ART.test(s)) s = 'el ' + s; }   // «el Voley Gandia», pero «Sorra Brisamar Dunes»
    else s = t === 0 ? ((d.size | 0) === 6 ? 'tu equipo' : 'tu pareja') : low1(d.cpu || 'la CPU');
    return start ? cap(s) : s;
  }
  /** «Tu n.º 1» / nombre en la Carrera, para el MVP (nombre completo, no apellido). */
  function mvpName(p, d) {
    var cs = d.career, t = p.team | 0, n = p.num | 0;
    if (cs) {
      if (t === 0 && n === (cs.num | 0) && cs.player) return cs.player;
      if (t === 0 && !isHall(cs) && n === (cs.mateNum | 0) && cs.mate) return cs.mate;
      if (t === 1 && cs.rivalNum != null && n === (cs.rivalNum | 0) && cs.rivalP) return typeof cs.rivalP === 'string' ? cs.rivalP : cs.rivalP.name;
      return 'N.º ' + n + ' (' + (t === 0 ? cs.me || '' : typeof cs.rival === 'string' ? cs.rival : '') + ')';
    }
    return p.name || 'N.º ' + n;
  }

  // ------------------------------------------------------------------ titular (R1: tabla ordenada)
  function bestBy(pl, key, min) {
    var b = null;
    for (var i = 0; i < pl.length; i++) {
      var p = pl[i]; if (!p || (p[key] | 0) < min) continue;
      if (!b || (p[key] | 0) > (b[key] | 0) || ((p[key] | 0) === (b[key] | 0) && (p.team | 0) < (b.team | 0))) b = p;
    }
    return b;
  }
  /** Elige el momento: primero tu equipo, luego el ganador, luego el set más tardío. */
  function pickM(list, win) {
    var b = null, bs = -1e9;
    for (var i = 0; i < list.length; i++) {
      var m = list[i], s = (m.team === 0 ? 100 : 0) + (m.team === win ? 50 : 0) + (m.n | 0) + (m.setNo | 0) * 0.01;
      if (s > bs) { bs = s; b = m; }
    }
    return b;
  }
  function winnerOf(d) { var s = d.sets || [0, 0]; return (s[0] | 0) > (s[1] | 0) ? 0 : 1; }
  function scoreTxt(sc, w) { return w === 0 ? (sc[0] | 0) + '-' + (sc[1] | 0) : (sc[1] | 0) + '-' + (sc[0] | 0); }
  // cada regla: {k, test(d, w) → ctx|null, v:[variantes]}. {X} jugador, {T}/{t} equipo, {n}, {o} ordinal en palabra, {s} tanteo
  var RULES = [
    { k: 'spSave', v: ['¡{X} salva {n} puntos de set y se lleva el {o} set!', '{X} salva {n} puntos de set en el {o} set'],
      vm: ['¡{X} salva {n} puntos de partido y gana!', '{X} levanta {n} puntos de partido y gana'],
      test: function (d, w) {
        var L = (d.moments || []).filter(function (m) { return m.k === 'spSave' && (m.n | 0) >= 2 && m.won !== false; });
        if (!L.length && d.spSaved && (d.spSaved[w] | 0) >= 2) L = [{ k: 'spSave', team: w, n: d.spSaved[w] | 0, who: null, setNo: 0, match: false, total: true }];
        var m = pickM(L, w); if (!m) return null;
        var who = m.who || (m.total ? mvpOf(d, m.team) : null);
        return { m: m, X: who ? whoName(who, d, false) : teamName(m.team, d, false), match: !!m.match, total: !!m.total };
      } },
    { k: 'closeAce', v: ['¡{X} cierra el partido con un ace!', '{X} pone el punto final con un ace'],
      test: function (d) { var c = d.close; return c && c.how === 'ace' && c.who ? { X: whoName(c.who, d, false) } : null; } },
    { k: 'closeBlock', v: ['¡{X} cierra el partido con un muro!', '{X} cierra el partido con un bloqueo'],
      test: function (d) { var c = d.close; return c && c.how === 'block' && c.who ? { X: whoName(c.who, d, false) } : null; } },
    // ambiente de Carrera: tarjeta roja (d.amb o g.career.ambSum = VB.Ambiente.sum)
    { k: 'redCard', v: ['Roja a {X} y punto de castigo', 'Partido caliente: roja para {X}'],
      test: function (d) {
        var a = d.amb || (d.career && d.career.ambSum); if (!a || !Array.isArray(a.cards)) return null;
        var r = null; for (var i = 0; i < a.cards.length; i++) { var c = a.cards[i]; if (c && (c.color === 'red' || c.color === 'delayR')) { r = c; break; } }
        if (!r) return null;
        var X = r.who === 'coach' ? (r.team === 0 ? 'tu banquillo' : 'el banquillo rival') : r.who === 'team' ? teamName(r.team | 0, d, false) : r.name ? surname(r.name) : teamName(r.team | 0, d, false);
        return { X: X };
      } },
    { k: 'comebackSet', v: ['{T} remonta un set en contra', '{T} gana tras perder el primer set'],
      test: function (d, w) {
        var ss = d.setScores || [], s = d.sets || [0, 0];
        if (ss.length < 3 || Math.min(s[0] | 0, s[1] | 0) !== 1) return null;
        var s1 = ss[0]; if (!s1 || ((s1[w] | 0) > (s1[1 - w] | 0))) return null;
        return { T: teamName(w, d, false) };
      } },
    { k: 'comeback', v: ['Remontada de {n} puntos en el {o} set', '{T} remonta {n} puntos en el {o} set'],
      test: function (d, w) {
        var L = (d.moments || []).filter(function (m) { return m.k === 'comeback' && (m.n | 0) >= 4; });
        var m = pickM(L, w); return m ? { m: m, T: teamName(m.team, d, false) } : null;
      } },
    { k: 'aces', v: ['{X} firma {n} aces', '{X} hace daño con el saque: {n} aces'],
      test: function (d) { var p = bestBy(d.pl || [], 'aces', 3); return p ? { X: whoName(p, d, false), n: p.aces | 0, team: p.team | 0 } : null; } },
    { k: 'blocks', v: ['{X} levanta un muro: {n} puntos de bloqueo', '{X} manda en la red: {n} bloqueos'],
      test: function (d) { var p = bestBy(d.pl || [], 'blocks', 3); return p ? { X: whoName(p, d, false), n: p.blocks | 0, team: p.team | 0 } : null; } },
    { k: 'rally', v: ['Jugada de {n} toques en el {o} set, y se la lleva {t}', 'Una jugada de {n} toques para el recuerdo'],
      test: function (d, w) {
        var L = (d.moments || []).filter(function (m) { return m.k === 'rally' && (m.n | 0) >= 14; });
        if (!L.length && d.longest && typeof d.longest === 'object' && (d.longest.n | 0) >= 14) L = [{ k: 'rally', team: d.longest.team | 0, n: d.longest.n | 0, setNo: d.longest.setNo | 0 }];
        if (!L.length && typeof d.longest === 'number' && d.longest >= 14) L = [{ k: 'rally', team: -1, n: d.longest | 0, setNo: 0 }];
        var m = pickM(L, w); return m ? { m: m, t: m.team >= 0 ? teamName(m.team, d, false) : '', noTeam: m.team < 0 || !m.setNo } : null;
      } },
    { k: 'streak', v: ['{T} enlaza {n} puntos seguidos en el {o} set', 'Racha de {n} puntos seguidos de {t}'],
      test: function (d, w) {
        var L = (d.moments || []).filter(function (m) { return m.k === 'streak' && (m.n | 0) >= 6; });
        var m = pickM(L, w); return m ? { m: m, T: teamName(m.team, d, false), t: teamName(m.team, d, false), noSet: !m.setNo } : null;
      } },
    { k: 'tight', v: ['Final apretado en el tercer set ({s})', 'Se decide en el tercer set por la mínima: {s}'],
      test: function (d, w) {
        var ss = d.setScores || []; if (ss.length < 3) return null;
        var s3 = ss[2]; if (!s3 || Math.abs((s3[0] | 0) - (s3[1] | 0)) !== 2) return null;
        return { s: scoreTxt(s3, w) };
      } },
    { k: 'noChance', v: ['Sin dar opción: {s}', '{T} no da opción: {s}'],
      test: function (d, w) {
        var ss = d.setScores || [], s = d.sets || [0, 0], to = d.to | 0 || 21, thr = Math.round(to * 12 / 21);
        if (ss.length !== 2 || Math.min(s[0] | 0, s[1] | 0) !== 0) return null;
        for (var i = 0; i < 2; i++) if (!ss[i] || (ss[i][1 - w] | 0) > thr) return null;
        return { s: scoreTxt(ss[0], w) + ' y ' + scoreTxt(ss[1], w), T: teamName(w, d, false) };
      } }
  ];
  function mvpOf(d, team) {
    var pl = d.pl || [], b = null;
    for (var i = 0; i < pl.length; i++) { var p = pl[i]; if (!p || (team != null && (p.team | 0) !== team)) continue; if (!b || (p.pts | 0) > (b.pts | 0)) b = p; }
    return b;
  }
  /** Titular del resumen: la primera regla de RULES que se cumpla; '' si no hay nada destacable. Determinista con seed.
   *  d = {sets, setScores (equipo 0 primero), to, size, career (g.career | null), cpu ('la CPU' por defecto), pl:[{num, team, name?,
   *  pts, kills, blocks, aces}], spSaved:[n0,n1], moments:[{k:'spSave'|'comeback'|'rally'|'streak', team, n, setNo, who?, match?,
   *  won?}], close:{how, who:{num, team}}, longest (n | {n, team, setNo}), watch}. Devuelve el texto (sin comillas). */
  function headline(d, seed) {
    d = d || {}; if (d.watch) return '';
    var w = winnerOf(d), sd = seed == null ? d.seed : seed;
    for (var i = 0; i < RULES.length; i++) {
      var R = RULES[i], x = null;
      try { x = R.test(d, w); } catch (e) { x = null; }
      if (!x) continue;
      var vi = h01(sd >>> 0, R.k) < 0.5 ? 0 : 1, tpl = (x.match && R.vm ? R.vm : R.v)[vi], m = x.m || {};
      if (R.k === 'spSave' && x.total && !x.match) tpl = '{X} salva {n} puntos de set';
      if (R.k === 'rally' && x.noTeam) tpl = R.v[1];
      if (R.k === 'streak' && x.noSet) tpl = R.v[1];
      var o = { X: x.X, T: x.T, t: x.t, n: x.n != null ? x.n : m.n, o: ordw(m.setNo), s: x.s };
      var s = fill(tpl, o);
      // {X}/{T} en mitad de frase van en minúscula; a principio, mayúscula (también tras «¡»)
      return cap(contract(s));
    }
    return '';
  }

  // ------------------------------------------------------------------ repetición (C1)
  /** Frase de la jugada. meta = {team, how, move, digs, rallyHits, savedSetPoint, savedMatchPoint?, who:{num, team}|num, num?}.
   *  Nombre: en la Carrera, g.career.player / g.career.mate por dorsal; si no, «el n.º 7» («del n.º 7»). */
  function playPhrase(meta, g) {
    meta = meta || {};
    var cs = g && g.career, w = meta.who, n = typeof w === 'number' ? w : w && w.num != null ? w.num : meta.num;
    var team = w && w.team != null ? w.team | 0 : meta.team | 0, X = '';
    if (n != null && (n | 0) > 0) {
      n = n | 0;
      if (cs && team === 0 && n === (cs.num | 0) && cs.player) X = cs.player;
      else if (cs && team === 0 && !isHall(cs) && n === (cs.mateNum | 0) && cs.mate) X = cs.mate;
      else X = 'el n.º ' + n;
    }
    var how = meta.how, s;
    if (X && how === 'ace') s = 'Ace de ' + X;
    else if (X && how === 'kill') s = (meta.move === 'roll' ? 'Golpe colocado de ' : meta.move === 'feint' ? 'Finta de ' : 'Remate de ') + X;
    else if (X && how === 'tip') s = 'Dejada de ' + X;
    else if (X && how === 'block') s = 'Bloqueo de ' + X;
    else if (how === 'ace') s = 'Ace';
    else s = 'Peloteo de ' + plural(Math.max(1, meta.rallyHits | 0), 'toque', 'toques');
    var suf = [];
    if ((meta.digs | 0) >= 3) suf.push('tras ' + (meta.digs | 0) + ' defensas');
    if (meta.savedMatchPoint) suf.push('salvando un punto de partido');
    else if (meta.savedSetPoint) suf.push('salvando un punto de set');
    if (suf.length) s += ' ' + suf.join(', ');
    return contract(s);
  }

  // ------------------------------------------------------------------ clasificación
  /** 3 filas alrededor de ti. rows = VB.Career.table(…) (con pos o en orden), shortOf(id) opcional → abreviatura.
   *  → {rows:[{pos, posT, id, short, pts, me}], move:{d, txt}, pos} */
  function tableSlice(rows, myId, pos0, shortOf) {
    rows = Array.isArray(rows) ? rows : [];
    var mi = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id === myId) { mi = i; break; }
    if (mi < 0) return { rows: [], move: { d: 0, txt: '' }, pos: 0 };
    var a = Math.max(0, Math.min(mi - 1, rows.length - 3)), out = [];
    for (var j = a; j < Math.min(rows.length, a + 3); j++) {
      var r = rows[j], p = r.pos | 0 || j + 1, sh = r.short;
      if (!sh && typeof shortOf === 'function') { try { sh = shortOf(r.id); } catch (e) { sh = ''; } }
      out.push({ pos: p, posT: ord(p), id: r.id, short: String(sh || r.id), pts: r.pts | 0, me: r.id === myId });
    }
    var pos = rows[mi].pos | 0 || mi + 1;
    return { rows: out, move: move(pos0, pos), pos: pos };
  }

  // ------------------------------------------------------------------ hoja final (B6)
  function lookName(id) {
    if (id && typeof id === 'object') return id.name || String(id.id || '');
    try { if (typeof VB.Look !== 'undefined' && VB.Look && typeof VB.Look.name === 'function') { var n = VB.Look.name(id); if (n) return String(n); } } catch (e) { }
    return String(id || '');
  }
  function pointParts(p) {
    var a = [];
    if (p.kills | 0) a.push((p.kills | 0) + ' de ataque');
    if (p.blocks | 0) a.push((p.blocks | 0) + ' de bloqueo');
    if (p.aces | 0) a.push(plural(p.aces, 'ace', 'aces'));
    return a;
  }
  /** Partes de la línea de minutos (sum.part de la pista; mismo texto que partLine de main.js). */
  function partParts(pt) {
    if (!pt) return [];
    var pts = (pt.meR | 0) + ' de ' + (pt.rallies | 0) + ' puntos', a = [];
    if (pt.started) a.push('De inicio', pts);
    else if (pt.entered) a.push('Entraste en el ' + ord(pt.entered) + ' set', pts);
    else a.push(pt.status === 'out' ? 'Fuera de la convocatoria' : 'No llegaste a entrar');
    if (pt.pulled) a.push('Te cambiaron en el ' + ord(pt.pulled) + ' set');
    return a;
  }
  function cupLine(sum, cs, win) {
    var lab = String(sum && sum.label || cs && cs.label || ''), st = stageOf({ label: lab, stage: sum && sum.stage }), name = 'del Open';
    if (lab.indexOf(' · ') >= 0) { name = lab.split(' · ')[0]; name = (/^\S*a(\s|$)/.test(name) ? 'de la ' : 'del ') + name; }   // «de la Copa…», «del Open…»
    else if (/ del (.+)$/.test(lab)) name = 'del ' + lab.replace(/^.* del /, '');
    if (st === 'final') return win ? '¡Campeones ' + name + '!' : 'Subcampeones ' + name;
    if (st === 'semi') return win ? 'Pasas a la final' : 'Fuera en semifinales';
    if (/cuartos/i.test(lab)) return win ? 'Pasas a semifinales' : 'Fuera en cuartos';
    if (/octavos/i.test(lab)) return win ? 'Pasas a cuartos' : 'Fuera en octavos';
    return '';
  }
  function nextLabel(d, sum) {
    if ((sum && sum.review) || d.phase === 'off' || d.next === 'off') return 'Fin de temporada';
    var n = d.next;
    if (n === 'final') return 'Siguiente: final';
    if (n === 'semi') return 'Siguiente: semifinal';
    if (n === 'cuartos' || n === 'octavos') return 'Siguiente: ' + n;
    return 'Siguiente jornada';
  }
  /** Modelo de la hoja final (pura). d = el de headline más:
   *  {seed, win, kicker (array | texto), title, cpu, size, watch, drill, reto, sum (resumen de Carrera), aw:[{num, name?, xp, lvl,
   *  lvlUp, pts, cur, need}] (Partido rápido), bar:{cur, need} (Carrera), badges, unlocks:[ids | {id,name}], table:{rows, myId, pos0,
   *  shortOf}, first (1ª jornada), next:'league'|'semi'|'final'|'cuartos'|'octavos'|'off', phase, boss:{nick, win}, train:{t}|texto,
   *  retos:{pills:[{name, lvl, nw}], xp}, profile:{xp, lvl, lvlUp, prize}, plays (n de Replay.list), altDiffName}.
   *  → {kicker[], title, headline, score, mvp, mvpRival, nota, xp[], badges[], unlocks, table, cup, life[], chem, boss, train, retos,
   *  profile, part, buttons:{primary:{id,label}, rest:[…]} | null, tabs[], tabLabels, blocks[]} */
  function endModel(d) {
    d = d || {};
    var cs = d.career || null, sum = d.sum || null, life = sum && sum.life || d.life || null;
    var w = d.win != null ? (d.win ? 0 : 1) : winnerOf(d), win = w === 0, M = {};
    // antetítulo y título
    if (cs && cs.label) M.kicker = String(cs.label).split(' · ');
    else if (Array.isArray(d.kicker)) M.kicker = d.kicker.slice();
    else M.kicker = d.kicker ? String(d.kicker).split(' · ') : [];
    M.kicker = M.kicker.map(noDot);
    M.title = d.title || (win ? '¡Victoria!' : cs && cs.rivalName ? contract('Gana el ' + cs.rivalName) : 'Gana ' + low1(d.cpu || 'la CPU'));
    M.headline = noDot(headline(d, d.seed));
    M.score = { a: cs ? cs.me || 'TÚ' : 'TÚ', b: cs ? (typeof cs.rival === 'string' ? cs.rival : 'RIVAL') : 'CPU', sets: (d.sets || [0, 0]).slice(), setScores: (d.setScores || []).map(function (x) { return x.slice(); }) };
    // MVP (el de más puntos del partido): grande si es tuyo, pequeño si es del rival
    var mv = d.watch ? null : mvpOf(d, null);
    M.nota = cs && sum ? (sum.nota == null ? 's. c.' : dec1(sum.nota)) : '';
    M.mvp = null; M.mvpRival = null;
    if (mv && (mv.team | 0) === 0) {
      M.mvp = { name: mvpName(mv, d), num: mv.num | 0, pts: mv.pts | 0, ptsT: plural(mv.pts, 'punto', 'puntos'), parts: pointParts(mv), me: !!(cs && (mv.num | 0) === (cs.num | 0)) };
      if (M.mvp.me && M.nota) M.mvp.nota = 'Nota ' + M.nota;
    } else if (mv) {
      var ab = cs ? (typeof cs.rival === 'string' ? cs.rival : '') : '';
      var rn = cs ? mvpName(mv, d) : 'N.º ' + (mv.num | 0);
      if (cs && rn.indexOf('(') < 0 && ab) rn += ' (' + ab + ')';
      M.mvpRival = { name: rn, pts: mv.pts | 0, t: 'MVP rival: ' + rn + ', ' + plural(mv.pts, 'punto', 'puntos') };
    }
    // progreso
    M.xp = [];
    if (cs && sum) {
      var bar = d.bar && d.bar.need > 0 ? Math.max(0, Math.min(1, (+d.bar.cur || 0) / d.bar.need)) : null;
      M.xp.push({ name: cs.player || 'Tú', xp: sum.xp | 0, t: '+' + num(sum.xp | 0) + ' XP', lvlUp: !!sum.lvlUp, lvlT: sum.lvlUp ? '¡Nivel ' + (sum.lvl | 0) + '! +' + (sum.ptsGained | 0) + ' puntos' : '', bar: bar });
    } else if (Array.isArray(d.aw)) d.aw.forEach(function (a) {
      if (!a) return;
      M.xp.push({ name: a.name || 'N.º ' + (a.num | 0), xp: a.xp | 0, t: '+' + num(a.xp | 0) + ' XP', lvlUp: !!a.lvlUp, lvlT: a.lvlUp ? '¡Nivel ' + (a.lvl | 0) + '! +' + (a.pts | 0) + ' puntos' : '', bar: a.need > 0 ? Math.max(0, Math.min(1, (+a.cur || 0) / a.need)) : null });
    });
    M.badges = (d.badges || (sum && sum.badges) || []).slice();
    // desbloqueos (VB.Look, opcional): no se marcan como vistos
    var ul = (d.unlocks || []).filter(Boolean);
    M.unlocks = null;
    if (ul.length) {
      var names = ul.map(lookName);
      M.unlocks = { n: ul.length, t: 'Nuevo en tu vestuario: ' + (ul.length === 1 ? names[0] : ul.length + ' objetos'), chips: names.slice(0, 3), more: Math.max(0, ul.length - 3) };
    }
    // clasificación / copa
    M.table = null; M.cup = '';
    var ph = sum ? sum.phase : cs && cs.phase;
    if (cs) {
      if (ph === 'cup' || ph === 'ko') M.cup = cupLine(sum, cs, win);
      else if (sum && sum.review) M.cup = sum.review.pos ? 'Fin de la liga: ' + ord(sum.review.pos) : d.pos ? 'Fin de la liga: ' + ord(d.pos) : '';
      else if (d.table && d.table.rows) {
        var tb = tableSlice(d.table.rows, d.table.myId, d.first ? 0 : d.table.pos0, d.table.shortOf);
        if (tb.rows.length) M.table = tb;
      }
    }
    // vida (máx. 3 líneas)
    M.life = [];
    if (life) {
      if (life.ch) M.life.push((life.ch.ok ? '✓ Reto: ' : '✗ Reto: ') + life.ch.txt + (life.ch.prog ? ' (' + life.ch.prog + ')' : ''));
      if ((life.fans | 0) > 0) M.life.push('+' + num(life.fans) + ' seguidores');
      if (life.duel) M.life.push('Duelo con ' + life.duel.name + ': ' + (life.duel.win ? 'ganado' : 'perdido') + ' (' + (life.duel.w | 0) + '-' + (life.duel.l | 0) + ')');
      (life.ach || []).forEach(function (a) { M.life.push('Logro: ' + (a && a.name || a)); });
      M.life = M.life.slice(0, 3).map(noDot);
    }
    M.chem = life && life.chemUp && life.chemUp.name ? { name: life.chemUp.name, lv: life.chemUp.lv | 0, t: '▲ Química: ' + life.chemUp.name } : null;
    var bo = d.boss || (cs && cs.boss ? { nick: cs.boss.nick || cs.boss.name, win: win } : null);
    M.boss = bo && bo.nick ? { nick: bo.nick, win: !!bo.win, t: bo.win ? 'Has tumbado a ' + bo.nick : 'Jefe: ' + bo.nick + (bo.h2h ? ' (' + (bo.h2h[1] | 0) + '-' + (bo.h2h[2] | 0) + ')' : '') } : null;
    M.train = d.train ? { t: noDot(typeof d.train === 'string' ? d.train : d.train.t || '') } : null;
    if (M.train && !M.train.t) M.train = null;
    M.retos = null;
    if (d.retos && ((d.retos.pills && d.retos.pills.length) || d.retos.xp)) {
      var pills = (d.retos.pills || []).map(function (p) { return { name: p.name, lvl: p.lvl | 0, nw: !!p.nw, t: p.name + ': ' + (MEDAL[p.lvl | 0] || '') }; });
      M.retos = { pills: pills.slice(0, 3), more: Math.max(0, pills.length - 3), moreT: pills.length > 3 ? 'y ' + (pills.length - 3) + ' más' : '', xp: d.retos.xp | 0, xpT: d.retos.xp ? '+' + num(d.retos.xp) + ' de experiencia por retos' : '' };
    }
    M.profile = d.profile && (d.profile.xp | 0) > 0 ? { xp: d.profile.xp | 0, t: 'Perfil: +' + num(d.profile.xp) + ' XP', up: d.profile.lvlUp ? '¡Perfil Nv ' + (d.profile.lvl | 0) + '!' + (d.profile.prize ? ' Premio: ' + d.profile.prize : '') : '' } : null;
    var pp = sum && sum.part ? partParts(sum.part) : [];
    M.part = pp.length ? { parts: pp, t: pp.join(' | ') } : null;
    // botones
    if (d.watch) M.buttons = null;
    else if (cs) M.buttons = { primary: { id: 'next', label: nextLabel(d, sum) }, rest: [{ id: 'menu', label: 'Menú principal' }] };
    else if (d.reto) M.buttons = { primary: { id: 'again', label: 'Otra vez' }, rest: [{ id: 'retos', label: 'Retos' }, { id: 'menu', label: 'Menú principal' }] };
    else {
      var rest = [];
      if (d.altDiffName) rest.push({ id: 'againAlt', label: 'Revancha en ' + d.altDiffName });
      rest.push({ id: 'opts', label: 'Cambiar opciones' }, { id: 'menu', label: 'Menú principal' });
      M.buttons = { primary: { id: 'again', label: 'Revancha' }, rest: rest };
    }
    // pestañas: «Jugadas (n)» solo con jugadas, fuera del 6v6 y del Entrenamiento (R10)
    var np = d.plays | 0;
    M.tabs = ['sum', 'stats'];
    if (np > 0 && (d.size | 0) !== 6 && !d.drill && !d.watch) M.tabs.push('plays');
    M.tabLabels = { sum: TAB_LABEL.sum, stats: TAB_LABEL.stats, plays: TAB_LABEL.plays + ' (' + np + ')' };
    // bloques presentes, en el orden fijo del Resumen
    var B = [];
    if (M.headline) B.push('headline');
    if (M.mvp || M.mvpRival) B.push('mvp');
    var bossUp = !!(M.boss && M.boss.win);   // jefe tumbado: arriba, que no quede bajo el fundido del móvil
    if (bossUp) B.push('boss');
    if (M.xp.length) B.push('xp');
    if (M.badges.length) B.push('badges');
    if (M.unlocks) B.push('unlocks');
    if (M.table) B.push('table');
    if (M.cup) B.push('cup');
    if (M.life.length) B.push('life');
    if (M.chem) B.push('chem');
    if (M.boss && !bossUp) B.push('boss');
    if (M.train) B.push('train');
    if (M.retos) B.push('retos');
    if (M.profile) B.push('profile');
    if (M.part) B.push('part');
    M.blocks = B;
    M.heads = { mvp: 'MVP', xp: 'Progreso', unlocks: 'Vestuario', table: 'Clasificación', cup: 'Copa', life: 'Vida', chem: 'Química', boss: 'Jefe', train: 'Entreno', retos: 'Retos', profile: 'Perfil', part: 'Minutos' };
    return M;
  }

  VB.Recap = {
    ord: ord, move: move, trait: trait, introPlan: introPlan, history: history, stake: stake, headline: headline, playPhrase: playPhrase,
    tableSlice: tableSlice, endModel: endModel, DUR: DUR, END_CELEB: END_CELEB, TRAITS: TRAITS, STAKES: STAKES,
    // (pruebas y ui.js)
    h01: h01, RULES: RULES.map(function (r) { return r.k; }), ordw: ordw, partParts: partParts
  };
})();
