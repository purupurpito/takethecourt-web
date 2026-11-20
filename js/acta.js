/* MAKE THE CUT — js/acta.js (owner: ui_main)
 * VB.Acta: «Acta del partido». Convierte el registro de un partido 6v6 (VB.MatchStats.data(): plantilla, alineación de cada set,
 * rallies y lo que pasa a balón muerto) en un acta en el formato de emPat ("format": "empat/acta", versión 1), la app del acta
 * electrónica de vóley. emPat nunca guarda el estado: reconstruye el partido con su motor a partir de la lista de jugadas
 * (plays), así que aquí solo se escriben jugadas:
 *   roster (plantilla de cada lado) · toss (sorteo: set 1 y el decisivo) · lineup (seis iniciales de cada set, de la zona 1 a la 6)
 *   · startPeriod · rally {side: quien gana el punto} · substitution · liberoIn / liberoOut · actingCaptain · timeout
 *   · sanction {side, target: dorsal | 'coach' | 'team', level: warning|penalty|delayWarning|delayPenalty} (Ambiente de Carrera:
 *     el castigo da el punto al rival en el motor de emPat, así que el rally del punto de castigo no se apunta).
 * Local y visitante: en la Carrera, el que juega en casa (meta.atHome; si juegas fuera, tu equipo —el 0 de la sim— es el visitante);
 * fuera de la Carrera, tu equipo es el local. Dorsales en texto, como en emPat.
 * Capitán: el del club (meta.capt[t], dorsal, lo pone la Carrera: career.js capt6); sin él, el colocador. Si el capitán no está en la
 * pista (cambiado o con el líbero en su lugar), se apunta un capitán en juego: el colocador que esté en pista o, si no, el primero de
 * la rotación que no sea líbero.
 * Nombres: los de la sim / la Carrera; el que no tenga (Partido rápido, líberos) recibe uno inventado, fijo para el partido (semilla).
 * Árbitros: 1r árbitro, 2º árbitro y anotador designados al azar (fijo por partido) de la lista ARBITROS.
 * El líbero que rota a la delantera sale solo en emPat (salida automática, sin liberoExitConfirm): para no apuntar dos veces esa
 * salida, aquí se sigue la rotación igual que el motor de emPat y la salida del juego se omite cuando emPat ya la ha hecho.
 * Puro: build(data, meta) no toca el DOM ni la sim. Solo 6v6 (emPat es el acta de pista de 6). tools/actatest.js lo comprueba
 * contra el motor de emPat si está al lado (../acta-electronica).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var FRONT_ENTRY = 3;   // índice de la zona 4 en la rotación (zona 1 = índice 0): el líbero que llega ahí sale (FIVB 19.3.1.3)

  /** Colegio arbitral de Make the Cut (inventado). Cada partido designa tres distintos: 1r árbitro, 2º árbitro y anotador. */
  var ARBITROS = [
    'Aitana Roig Belda', 'Bernat Climent Sola', 'Carla Ivars Peiró', 'Damià Albors Pla', 'Elena Garrigues Mompó', 'Fermín Lacasa Ortiz',
    'Gemma Sancho Llorca', 'Héctor Revert Calabuig', 'Inés Marhuenda Coloma', 'Jaume Escrivà Tormo', 'Lidia Barceló Ferri',
    'Marcos Ventura Alapont', 'Neus Agulló Benavent', 'Óscar Penalva Císcar', 'Paula Grau Montaner', 'Quim Sorribes Vela',
    'Rosa Llinares Boix', 'Salva Moltó Ribelles', 'Tere Vañó Gisbert', 'Uxue Etxeberria Lasa', 'Vicent Ballester Puchol',
    'Xènia Rovira Oliver', 'Yolanda Cuenca Pardo', 'Àlex Mascarell Fuster', 'Berta Sendra Cervera', 'Cristian Lledó Zaragozà',
    'Dolors Pastor Insa', 'Edu Talens Navarro', 'Fina Cardona Vidal', 'Guillem Carbonell Tur'
  ];
  /** Nombres para los jugadores que la sim no nombra (Partido rápido y líberos). */
  var NOMBRES = ['Adrià', 'Bruno', 'Carles', 'Dani', 'Eloi', 'Fabio', 'Gerard', 'Hugo', 'Iker', 'Joel', 'Kilian', 'Lluc', 'Mateo', 'Nil',
    'Oriol', 'Pau', 'Quique', 'Roc', 'Sergi', 'Tomàs', 'Unai', 'Vicent', 'Xavi', 'Yago', 'Àlex', 'Biel', 'Ciro', 'Dídac', 'Enzo', 'Gael'];
  var APELLIDOS = ['Aleixandre', 'Benlloch', 'Camarasa', 'Domènech', 'Esteve', 'Folch', 'Gimeno', 'Huguet', 'Ibars', 'Juan', 'Llopis',
    'Miralles', 'Nebot', 'Olcina', 'Pons', 'Querol', 'Ribera', 'Segarra', 'Tarazona', 'Usach', 'Vidal', 'Xàtiva', 'Zamora', 'Bellver',
    'Carrasco', 'Durà', 'Escolano', 'Galiana', 'Hernández', 'Lozano', 'Montoliu', 'Pitarch', 'Sempere'];

  /** Entero sin signo determinista de una lista de valores (FNV-1a sobre su texto). */
  function hash() {
    var s = Array.prototype.join.call(arguments, '|'), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** ¿Se puede hacer acta de este registro? (6v6 con plantilla y al menos un punto jugado) */
  function available(d) {
    if (!d || d.size !== 6 || !d.sq || !d.lu || !d.lu[1]) return false;
    for (var i = 0; i < d.rallies.length; i++) if (d.rallies[i].w >= 0) return true;
    return false;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoAt(ms) { return new Date(ms).toISOString(); }
  function str(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

  /** Tres árbitros distintos de la lista, fijos para la semilla. */
  function designa(seed) {
    var pool = ARBITROS.slice(), out = [];
    for (var k = 0; k < 3; k++) out.push(pool.splice(hash('arb', seed, k) % pool.length, 1)[0]);
    return { referee1: out[0], referee2: out[1], scorer: out[2] };
  }

  /**
   * Acta de emPat a partir del registro. meta = {names: [equipo 0, equipo 1], atHome (¿el equipo 0 juega en casa? por defecto sí),
   * capt: [dorsal, dorsal], lib: [nombre del líbero, …], competition, category, venue, town, seed, id, now (ms)}.
   * Devuelve null si no hay 6v6 que apuntar.
   */
  function build(d, meta) {
    if (!available(d)) return null;
    meta = meta || {};
    var now = +meta.now || Date.now(), seed = meta.seed != null ? meta.seed : d.seed | 0;
    var SIDE = meta.atHome === false ? ['away', 'home'] : ['home', 'away'];   // SIDE[equipo de la sim]
    var tn = meta.names || [], names = [str(tn[0], 60) || 'Tu equipo', str(tn[1], 60) || 'Rival'];
    var setPts = d.points || 25, sets = [];
    for (var i = 0; i < d.rallies.length; i++) { var s0 = d.rallies[i].s | 0; if (d.rallies[i].w >= 0 && sets.indexOf(s0) < 0) sets.push(s0); }
    var bo1 = !!(d.bo1 || meta.bo1);
    var bestOf = bo1 ? 1 : 3;
    var settings = { bestOf: bestOf, setPoints: setPts, deciderPoints: bo1 ? setPts : Math.min(15, setPts), timeouts: 2, substitutions: 6,
      deciderSwitch: bo1 ? Math.ceil(setPts / 2) : 8, liberoAllowed: true, fullSetRule: false };
    // reloj de las jugadas: el partido «empieza» hace tantos rallies × 25 s como tiene, y cada jugada avanza 25 s (o 3 s a balón muerto)
    var clock = now - (d.rallies.length * 25 + d.ac.length * 3 + sets.length * 180) * 1000;
    var plays = [];
    function push(p, dt) { clock += (dt == null ? 25 : dt) * 1000; p.at = isoAt(clock); plays.push(p); }

    // plantillas: nombres (inventados si faltan, sin repetir dentro del equipo), líbero y capitán
    var libSet = [{}, {}], role = [{}, {}], capt = [0, 0];
    for (var t = 0; t < 2; t++) {
      var L = d.sq[t], players = [], seen = {}, used = {}, k;
      for (k = 0; k < L.length; k++) if (L[k].nm) used[L[k].nm] = 1;
      var want = meta.capt && meta.capt[t] | 0, cap = -1;
      for (k = 0; k < L.length && cap < 0; k++) if (want && (L[k].n | 0) === want && L[k].ro !== 'L') cap = k;
      for (k = 0; k < L.length && cap < 0; k++) if (L[k].ro === 'S') cap = k;
      for (k = 0; k < L.length && cap < 0; k++) if (L[k].ro !== 'L') cap = k;
      for (k = 0; k < L.length; k++) {
        var p = L[k], n = p.n | 0, sh = String(n);
        if (seen[sh]) continue; seen[sh] = 1;
        var nm = str(p.nm, 40);
        if (!nm && p.ro === 'L' && meta.lib && meta.lib[t]) nm = str(meta.lib[t], 40);
        for (var tries = 0; !nm || (tries && used[nm]); tries++) {
          nm = NOMBRES[hash('nom', seed, t, n, tries) % NOMBRES.length] + ' ' + APELLIDOS[hash('ape', seed, t, n, tries) % APELLIDOS.length];
          if (!used[nm]) break;
        }
        used[nm] = 1;
        var o = { shirt: sh, name: nm };
        if (k === cap) { o.captain = true; capt[t] = n; }
        if (p.ro === 'L') { o.libero = true; libSet[t][n] = 1; }
        role[t][n] = p.ro;
        players.push(o);
      }
      push({ kind: 'roster', side: SIDE[t], name: names[t], players: players, staff: [] }, 0);
    }
    function isLibero(t, n) { return !!libSet[t][n | 0]; }
    function onRoster(t, n) { return !!role[t].hasOwnProperty(n | 0); }

    // espejo de la rotación de emPat (salida automática del líbero y capitán en juego)
    var rot = [[], []], lib = [null, null], acting = [0, 0], serving = 0, setNo = 0, ai = 0, started = false;
    function visible(t) { return rot[t].map(function (n) { return lib[t] && lib[t].rep === n ? lib[t].sh : n; }); }
    function captains() {
      for (var t = 0; t < 2; t++) {
        var v = visible(t);
        if (acting[t] && (v.indexOf(capt[t]) >= 0 || v.indexOf(acting[t]) < 0)) acting[t] = 0;   // (emPat la borra igual)
        if (!capt[t] || v.indexOf(capt[t]) >= 0 || acting[t]) continue;
        var pick = 0, z;
        for (z = 0; z < 6 && !pick; z++) if (role[t][v[z]] === 'S' && !isLibero(t, v[z])) pick = v[z];
        for (z = 0; z < 6 && !pick; z++) if (!isLibero(t, v[z])) pick = v[z];
        if (!pick) continue;
        acting[t] = pick;
        push({ kind: 'actingCaptain', side: SIDE[t], shirt: String(pick) }, 0);
      }
    }
    function startSet(s) {
      var lu = d.lu[s] || d.lu[setNo] || d.lu[1];
      setNo = s;
      var decider = s === bestOf;
      if (s === 1 || decider) push({ kind: 'toss', server: SIDE[lu.sv], left: SIDE[0] }, 60);
      for (var t = 0; t < 2; t++) {
        rot[t] = lu.r[t].slice(); lib[t] = null; acting[t] = 0;
        push({ kind: 'lineup', side: SIDE[t], shirts: rot[t].map(String) }, 0);
      }
      serving = lu.sv;
      push({ kind: 'startPeriod' }, 60);
      started = true;
    }
    function action(a) {
      var t = a.t, side = SIDE[t];
      if (a.k === 'tmo') { push({ kind: 'timeout', side: side }, 30); return; }
      if (a.k === 'san') {   // Ambiente de Carrera: sanción (FIVB 16 y 21). El castigo da el punto en emPat: su rally no se apunta
        var tg = a.who === 'coach' ? 'coach' : a.who === 'team' || /^delay/.test(a.lv) || !a.n ? 'team' : String(a.n);
        if (tg !== 'team' && tg !== 'coach' && !onRoster(t, a.n)) tg = 'team';
        if (/enalty$/.test(a.lv)) { var pr = d.rallies[a.i]; if (!pr || !pr.pen) return; }   // roja sin punto en el juego: no cabe en el acta
        push({ kind: 'sanction', side: side, target: tg, level: a.lv }, 3);
        return;
      }
      if (a.k === 'sub') {
        var z = rot[t].indexOf(a.o);
        if (z >= 0) rot[t][z] = a.n;
        push({ kind: 'substitution', side: side, leaving: String(a.o), entering: String(a.n) }, 3);
        return;
      }
      // líbero: entra (n es el líbero) o sale (o es el líbero)
      var libIn = isLibero(t, a.n), libOut = isLibero(t, a.o);
      if (libIn && !libOut) {
        if (lib[t]) { if (lib[t].rep === a.o) return; push({ kind: 'liberoOut', side: side }, 3); lib[t] = null; }
        if (rot[t].indexOf(a.o) < 0) return;
        lib[t] = { sh: a.n, rep: a.o };
        push({ kind: 'liberoIn', side: side, libero: String(a.n), leaving: String(a.o) }, 3);
      } else if (libOut && !libIn) {
        if (!lib[t]) return;   // emPat ya lo sacó al rotar a la delantera (o al empezar el set)
        lib[t] = null;
        push({ kind: 'liberoOut', side: side }, 3);
      }
    }

    for (var j = 0; j < d.rallies.length; j++) {
      var r = d.rallies[j];
      if (r.w < 0) continue;
      if (!started || (r.s | 0) !== setNo) startSet(r.s | 0);
      while (ai < d.ac.length && d.ac[ai].i <= j) {
        var a = d.ac[ai++];
        if ((a.s | 0) === setNo || a.k === 'san') action(a);   // (una tarjeta tras el último punto de un set se apunta al empezar el siguiente)   // (lo de otro set: la limpieza del líbero entre sets, que emPat ya hace)
      }
      captains();
      if (!r.pen) push({ kind: 'rally', side: SIDE[r.w] });   // (punto de castigo: ya lo ha dado la sanción)
      if (r.w !== serving) {
        serving = r.w;
        rot[r.w].push(rot[r.w].shift());
        if (lib[r.w] && rot[r.w].indexOf(lib[r.w].rep) === FRONT_ENTRY) lib[r.w] = null;
      }
    }

    var dt = new Date(now - (d.rallies.length * 25 + sets.length * 180) * 1000), ref = designa(seed);
    var home = SIDE[0] === 'home' ? 0 : 1;
    var info = {
      competition: str(meta.competition, 80) || 'Make the Cut',
      category: str(meta.category, 40) || 'Sénior',
      homeName: names[home], awayName: names[1 - home],
      venue: str(meta.venue, 80), town: str(meta.town, 60),
      date: dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()),
      time: pad2(dt.getHours()) + ':' + pad2(dt.getMinutes()),
      referee1: ref.referee1, referee2: ref.referee2, scorer: ref.scorer
    };
    var id = meta.id || ('mtc-' + now.toString(36));
    return { format: 'empat/acta', version: 1, id: id, createdAt: isoAt(now), updatedAt: isoAt(now), stage: 'live',
      settings: settings, info: info, plays: plays };
  }

  VB.Acta = { available: available, build: build, ARBITROS: ARBITROS };
})();
