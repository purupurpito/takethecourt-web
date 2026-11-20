/* MAKE THE CUT — js/venues.js (owner: arena)
 * Registro de SEDES (mapas): datos puros, sin THREE. Lo leen arena.js (qué montar), ui.js (nombres y selector de
 * Ajustes · Imagen), main.js (validar los ajustes `mapHall` / `mapBeach` y ?map=) y career.js si quiere el nombre.
 *
 * kind = 'hall' | 'beach' es lo ÚNICO que llega a la sim (createGame({venue: kind})): el mapa solo cambia el escenario.
 * Cada sede: { kind, name (interfaz), short (selector de Ajustes), pad (protecciones de los postes y lonas, en mayúsculas), tier (1 regional .. 3 gran
 * cita), help (una línea para la ayuda del menú), sand [r,g,b] 0..1 (partículas de arena de fx.js; solo playa),
 * lights (modos de luz que admite el ajuste «Luz de playa»; sin lights = luz fija), night (sede de noche) }.
 *
 * Una sede está DISPONIBLE (sale en el selector y se puede elegir) cuando tiene constructor: las de serie (palau,
 * platja) siempre; las demás cuando su fichero js/venue-<id>.js llama VB.Arena.registerMap({id, …}) al cargar (ese
 * fichero va en index.html después de arena.js y antes de fx.js). Las sedes del plan sin fichero quedan aquí como
 * datos (nombre, nivel) pero list() no las devuelve. Añadir una sede = su entrada aquí (si no está) + su venue-<id>.js
 * + su <script>. Ver notes/arena.md «Sedes».
 *
 * SEDES GENERADAS (una por club, plan «sedes-gen» F1): VB.VenueGen.spec (js/venue-gen.js, receta pura) da la receta; forClub / ensure
 * la registran aquí (VB.VENUES[id] con gen: true) y en arena (VB.VenueGen.hallDef / beachDef → VB.Arena.registerMap). Cola LRU de 4
 * sedes generadas por tipo: la quinta olvida la más vieja (forget: VB.Arena.unregisterMap + fuera del registro), nunca la montada.
 * list() no las devuelve (el selector no se inunda); el ajuste admite 'club' (= una sede de club al azar). No se guarda nada: la sede
 * se deriva siempre del club. forMatch(next, kind) elige la sede de un partido de la Carrera (tabla EMBLEM, plan()); parse() lee
 * 'club:IT:PER', 'club:IT:PER:b', 'gen:h:123' y 'gen:b:7' (?map=).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  VB.VENUES = {
    palau: { kind: 'hall', name: 'Palau del Mar', short: 'Palau', pad: 'PALAU DEL MAR', tier: 2, builtin: true,
      help: 'Palau del Mar, pista cubierta de 18 × 9' },
    canrebot: { kind: 'hall', name: 'Poliesportiu Can Rebot', short: 'Can Rebot', pad: 'CAN REBOT', tier: 1, day: true,
      help: 'Can Rebot, el pabellón del barrio, pista de 18 × 9' },
    cupula: { kind: 'hall', name: 'Cúpula del Far', short: 'Cúpula', pad: 'CÚPULA DEL FAR', tier: 3, night: true,
      help: 'Cúpula del Far, la sede de las finales, pista de 18 × 9' },
    platja: { kind: 'beach', name: 'Platja Llarga', short: 'Platja', pad: 'PLATJA LLARGA', tier: 1, builtin: true, lights: ['dia', 'tarde'],
      sand: [0.98, 0.87, 0.66], help: 'Platja Llarga, vóley playa en pista de 16 × 8' },
    moll: { kind: 'beach', name: 'Moll de la Sorra', short: 'Moll', pad: 'MOLL DE LA SORRA', tier: 2, lights: ['dia', 'tarde'],
      sand: [0.9, 0.83, 0.68], help: 'Moll de la Sorra, vóley playa en el puerto, pista de 16 × 8' },
    fanals: { kind: 'beach', name: 'Cala dels Fanals', short: 'Fanals', pad: 'CALA DELS FANALS', tier: 3, night: true,
      sand: [0.73, 0.66, 0.56], help: 'Cala dels Fanals, vóley playa de noche, pista de 16 × 8' }
  };
  var DEF = { hall: 'palau', beach: 'platja' };
  var ready = { palau: true, platja: true };
  function kindOf(id) {
    if (id === 'beach' || id === 'playa') return 'beach';
    if (id === 'hall' || id === 'pabellon') return 'hall';
    var d = VB.VENUES[id]; if (d) return d.kind;
    // sede generada aún sin registrar: club:CC:SIGLAS[:b] y gen:h|b:n
    var m = /^club:[^:]+:[^:]+(?::(b|beach|h|hall))?$/i.exec(id || ''); if (m) return m[1] && /^b/i.test(m[1]) ? 'beach' : 'hall';
    m = /^gen:(h|b|hall|beach):/i.exec(id || ''); if (m) return /^b/i.test(m[1]) ? 'beach' : 'hall';
    return '';
  }
  function list(kind) {
    var out = [];
    for (var id in VB.VENUES) if (VB.VENUES[id].kind === kind && ready[id] && !VB.VENUES[id].gen) out.push(id);
    return out;
  }
  /** Semilla → índice (entero no negativo). Sin semilla, Math.random. */
  function pickIdx(n, seed) {
    if (!(n > 0)) return 0;
    if (seed == null || !isFinite(+seed)) return Math.floor(Math.random() * n) % n;
    var h = (+seed | 0) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12;
    return ((h % n) + n) % n;
  }
  // ------------------------------------------------------------------ sedes generadas
  var LRU_N = 4, SPEC_N = 64;
  var GEN = { hall: [], beach: [] };     // ids generados registrados, del más viejo al más nuevo
  var SPECS = {}, SPEC_ORDER = [];       // caché LRU de recetas (clave = club + tipo + opciones)
  function canGen(kind) { var G = VB.VenueGen; return !!(G && G.spec && (kind === 'beach' ? G.beachDef : G.hallDef)); }
  function specKey(club, kind, opt) {
    var k = club.kit || club.colors || {};
    return JSON.stringify([kind, club.cc || '', club.name || '', club.short || '', club.city || '', club.lvl, club.strength, club.ovr, club.beach || '', club.id, club.q,
      k.shirt || '', k.shirt2 || k.accent || '', k.libero || '', opt ? opt.stage || '' : '', opt && opt.salt != null ? String(opt.salt) : '']);
  }
  function specFor(club, kind, opt) {
    var key = specKey(club, kind, opt), sp = SPECS[key];
    if (sp) { SPEC_ORDER.splice(SPEC_ORDER.indexOf(key), 1); SPEC_ORDER.push(key); return sp; }
    sp = VB.VenueGen.spec(club, kind, opt);
    SPECS[key] = sp; SPEC_ORDER.push(key);
    while (SPEC_ORDER.length > SPEC_N) delete SPECS[SPEC_ORDER.shift()];
    return sp;
  }
  function mounted() { return VB.Arena && VB.Arena.map ? VB.Arena.map() : ''; }
  /** Olvida una sede generada (arena y registro). Nunca la montada. */
  function forget(id) {
    var d = VB.VENUES[id]; if (!d || !d.gen || id === mounted()) return false;
    if (VB.Arena && VB.Arena.unregisterMap) VB.Arena.unregisterMap(id);
    delete VB.VENUES[id]; delete ready[id];
    var L = GEN[d.kind], i = L.indexOf(id); if (i >= 0) L.splice(i, 1);
    return true;
  }
  /** Registra la sede de una receta (si no lo estaba) y la pone la última de la cola LRU. Devuelve el id ('' si no hay constructor). */
  function ensure(sp) {
    if (!sp || !sp.id) return '';
    var id = sp.id, kind = sp.kind === 'beach' ? 'beach' : 'hall', L = GEN[kind];
    if (VB.VENUES[id] && !VB.VENUES[id].gen) return id;   // (un id generado nunca pisa una sede a mano)
    if (!VB.VENUES[id]) VB.VENUES[id] = { kind: kind, name: sp.name, short: sp.short, pad: sp.pad, tier: sp.tier, help: sp.help, sand: sp.sand || undefined,
      lights: sp.lights || undefined, night: !!sp.night, gen: true };
    if (!ready[id] && VB.Arena && VB.Arena.registerMap && canGen(kind)) {
      var def = null;
      try { def = kind === 'beach' ? VB.VenueGen.beachDef(sp) : VB.VenueGen.hallDef(sp); } catch (e) { console.warn('[VB] venues: sede ' + id, e); }
      if (def) { def.id = id; def.kind = kind; def.gen = true; VB.Arena.registerMap(def); }
    }
    var i = L.indexOf(id); if (i >= 0) L.splice(i, 1);
    L.push(id);
    // más de LRU_N: fuera las más viejas (nunca la que se acaba de pedir ni la montada)
    for (var j = 0; L.length > LRU_N && j < L.length;) { if (L[j] === id || L[j] === mounted() || !forget(L[j])) j++; }
    return ready[id] ? id : '';
  }
  /** Sede del club (club = clubInfo / clubInfo6 / club de leagues.js; kind 'hall' | 'beach'; opt {stage?: 'intl', salt?}) → id registrado. */
  function forClub(club, kind, opt) {
    kind = kind === 'beach' ? 'beach' : 'hall';
    if (!club || !canGen(kind)) return '';
    try { return ensure(specFor(club, kind, opt || null)); } catch (e) { console.warn('[VB] venues: forClub', e); return ''; }
  }
  /** Club de VB.Leagues por país y siglas (con la fuerza y el nivel de su división). */
  function leagueClub(cc, short) {
    var L = VB.Leagues; if (!L || !L.regions) return null;
    cc = String(cc).toUpperCase(); short = String(short).toUpperCase();
    for (var r = 0; r < L.regions.length; r++) {
      var C = L.regions[r].countries || [];
      for (var c = 0; c < C.length; c++) {
        if (String(C[c].code).toUpperCase() !== cc) continue;
        var D = C[c].divisions || [];
        for (var d = 0; d < D.length; d++) {
          var K = D[d].clubs || [];
          for (var k = 0; k < K.length; k++) {
            var x = K[k];
            if (String(x.short || '').toUpperCase() === short) return { cc: cc, name: x.name, short: x.short, city: x.city, colors: x.colors, ovr: x.ovr, strength: D[d].strength, lvl: D[d].lvl };
          }
        }
      }
    }
    return null;
  }
  /** 'club:IT:PER' (pista), 'club:IT:PER:b' (playa), 'gen:h:123' / 'gen:b:123' (sede al azar con semilla) → id registrado o ''. */
  function parse(str) {
    str = String(str || '');
    var m = /^club:([^:]+):([^:]+)(?::(b|beach|h|hall))?$/i.exec(str);
    if (m) { var k = leagueClub(m[1], m[2]), kind = m[3] && /^b/i.test(m[3]) ? 'beach' : 'hall'; return k ? forClub(k, kind) : ''; }
    m = /^gen:(h|b|hall|beach):(\d+)$/i.exec(str);
    if (m) return randomGen(/^b/i.test(m[1]) ? 'beach' : 'hall', +m[2]);
    return '';
  }
  /** Sede de un club al azar (ajuste 'club', gen:h:n): con la semilla (la de la partida: la revancha repite sede) o al azar. */
  function randomGen(kind, seed) {
    if (!canGen(kind)) return '';
    var s = seed != null && isFinite(+seed) ? (+seed >>> 0) : Math.floor(Math.random() * 1e9);
    try { return ensure(VB.VenueGen.random(kind, s)); } catch (e) { console.warn('[VB] venues: random', e); return ''; }
  }
  var RAND_GEN = 4;   // «Al azar»: peso de las sedes de club frente a cada sede hecha a mano (pabellón: 3 a mano + 4 → ~57 % de club)
  function h32(s) { s = String(s); var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  // «Final» como palabra (no «Semifinal»); copa continental por la etiqueta si next() no trae comp
  var FINAL_RE = /\bfinal\b/i, INTL_RE = /\b(CEV|AVC|CSV|NORCECA|Champions|Challenge|Continental|Internacional|Intercontinental|Asian|Sudamericano)\b/i;
  var EMBLEM = { cupFinal: 'palau', intlFinal: 'cupula', fallback: 'palau', debut: 'canrebot', esLow: 0.2, beachOpen: ['platja', 'platja', 'moll', 'moll', 'fanals'], beachFinal: 'fanals' };
  /** Tabla EMBLEM: qué sede toca en un partido de la Carrera. n = VB.Career.next() ({kind: 'league' | 'cup' | 'ko', comp, round, label,
   *  week, me}); info = ficha del local (clubInfo / clubInfo6); season = temporada (para el debut). Pura (sin registrar nada):
   *  {id} (sede emblema), {club, kind, opt} (la sede generada de ese club) o null. Una emblema sin registrar cae en Palau / Platja. */
  function plan(n, kind, info, season) {
    if (!n) return null;
    kind = kind === 'beach' ? 'beach' : 'hall';
    var label = String(n.label || ''), fin = FINAL_RE.test(label);
    function emb(id) { return { id: ready[id] ? id : DEF[kind] }; }
    if (kind === 'beach') {
      if (n.kind === 'cup') {   // Open del circuito: 1-2 Platja, 3-4 Moll, 5 y la final Fanals
        var lv = n.me && n.me.lvl != null ? n.me.lvl | 0 : info && info.lvl != null ? info.lvl | 0 : 0;
        return emb(fin ? EMBLEM.beachFinal : EMBLEM.beachOpen[Math.max(0, Math.min(4, lv))]);
      }
      return info ? { club: info, kind: 'beach', opt: null } : null;
    }
    var intl = n.comp === 'intl' || ((n.kind === 'ko' || n.kind === 'cup') && n.comp !== 'cup' && INTL_RE.test(label));
    if (n.kind === 'ko' || n.kind === 'cup') {
      if (fin) return emb(intl ? EMBLEM.intlFinal : EMBLEM.cupFinal);
      return info ? { club: info, kind: 'hall', opt: intl ? { stage: 'intl' } : null } : null;
    }
    // liga: debut (temporada 1, jornada 1) y jornadas de 2.ª española en casa (20 %, por hash de la jornada) en Can Rebot
    if (n.kind === 'league' && ready[EMBLEM.debut]) {
      if ((season | 0) === 1 && (n.week | 0) === 0) return { id: EMBLEM.debut };
      if (info && String(info.cc || '').toUpperCase() === 'ES' && (info.lvl | 0) === 2 && h32('canrebot|' + (season | 0) + '|' + (n.week | 0)) % 100 < EMBLEM.esLow * 100) return { id: EMBLEM.debut };
    }
    return info ? { club: info, kind: 'hall', opt: null } : null;
  }
  /** Sede del partido de la Carrera → id registrado, o null (main.js usa entonces el tipo de siempre). Lee la ficha del local con
   *  VB.Career.clubInfo (pista: cc, lvl, strength, kit; playa: beach, city, lvl, kit). c = la Carrera (por defecto VB.Career.get()). */
  function forMatch(n, kind, c) {
    try {
      if (!n || !n.home) return null;
      var K = VB.Career, info = n.home, season = 0;
      if (K) {
        c = c || (K.get && K.get()); season = c ? c.season | 0 : 0;
        if (c && K.clubInfo) { try { info = K.clubInfo(c, n.home) || n.home; } catch (e) { info = n.home; } }
      }
      var p = plan(n, kind, info, season); if (!p) return null;
      if (p.id) return ready[p.id] ? p.id : null;
      return forClub(p.club, p.kind, p.opt) || null;
    } catch (e) { console.warn('[VB] venues: forMatch', e); return null; }
  }

  VB.Venues = {
    DEF: DEF,
    def: function (id) { return VB.VENUES[id] || null; },
    kindOf: kindOf,
    /** Sedes DISPONIBLES de un tipo, en el orden del registro (la de serie primero). */
    list: list,
    ready: function (id) { return !!ready[id]; },
    /** Lo llama VB.Arena.registerMap: la sede pasa a estar disponible. */
    markReady: function (id) { if (VB.VENUES[id]) ready[id] = true; },
    /** ¿Valor válido para el ajuste del tipo? (una sede a mano disponible de ese tipo, 'rand', o 'club' si hay generador) */
    valid: function (kind, v) { return v === 'rand' || (v === 'club' && canGen(kind)) || (ready[v] === true && kindOf(v) === kind && !VB.VENUES[v].gen); },
    forClub: forClub, ensure: ensure, forget: forget, forMatch: forMatch, plan: plan, parse: parse, randomGen: randomGen, EMBLEM: EMBLEM,
    /** Ids generados registrados de un tipo (del más viejo al más nuevo). */
    generated: function (kind) { return GEN[kind === 'beach' ? 'beach' : 'hall'].slice(); },
    name: function (id) { var d = VB.VENUES[id]; return d ? d.name : ''; },
    /** Id del mapa que toca: `x` es un id (?map=fanals) o un tipo ('hall' | 'beach'); con un tipo manda el ajuste
     *  (settings.mapHall / settings.mapBeach; 'rand' = al azar con `seed`). Lo desconocido vuelve a la sede de serie. */
    resolve: function (x, settings, seed) {
      if (VB.VENUES[x] && ready[x]) return x;
      var kind = kindOf(x) || (settings && settings.arena === 'beach' ? 'beach' : 'hall');
      var pref = settings ? settings[kind === 'beach' ? 'mapBeach' : 'mapHall'] : '';
      // «Al azar»: las hechas a mano y, si hay generador, también la sede de un club al azar (RAND_GEN huecos de más en el sorteo)
      if (pref === 'rand') {
        var L = list(kind), ng = canGen(kind) ? RAND_GEN : 0, n = L.length + ng;
        if (!n) return DEF[kind];
        var i = pickIdx(n, seed);
        return i < L.length ? L[i] : randomGen(kind, seed != null && isFinite(+seed) ? (+seed ^ 0x9e3779b9) >>> 0 : null) || L[0] || DEF[kind];
      }
      if (pref === 'club') return randomGen(kind, seed) || DEF[kind];
      if (pref && ready[pref] && kindOf(pref) === kind) return pref;
      return DEF[kind];
    }
  };
})();
