/* MAKE THE CUT — js/venue-gen.js (owner: arena)
 * Generador de SEDES por club, fase F0: RECETA PURA (sin THREE ni DOM; se carga igual en el navegador que en node).
 * VB.VenueGen.spec(club, kind, opt) → la receta («spec») de la sede de ese club: arquetipo, colores, ejes numéricos, nombre…
 * Los constructores (venue-gen-hall.js / venue-gen-beach.js, fases F2-F4) convierten la spec en una def de VB.Arena.
 *
 * Reglas de la receta:
 *  - determinista: semilla = fnv1a('v' + V + '|' + kind + '|' + cc + '|' + norm(nombre) + '|' + norm(ciudad)); cada eje tira de su
 *    propio sub-flujo sfc32 (rng(seed, 'roof'), rng(seed, 'stand')…), así añadir un eje no reordena los demás. Sin Math.random ni
 *    Date ni orden de claves; los números van redondeados a 2 decimales.
 *  - los clubes de VB.Leagues se calculan POR PAÍS y a demanda: la primera sede que se pide de un país calcula ese país entero
 *    (roster + reparación de gemelos + nombres, pista y playa, en el orden de leagues.js) y lo cachea; el resultado no depende del
 *    orden en que se pidan. Los nombres no chocan entre países porque cada núcleo de topónimo tiene un único dueño (país + lengua).
 *  - sin VB.Leagues todavía (venue-gen.js va antes que leagues.js en index.html) no se cachea nada: las specs pedidas antes de
 *    tiempo no envenenan la sesión.
 *  - un club que no está en VB.Leagues (guardado viejo, renombrado, Carrera de playa) cae en una plantilla por hash: sigue siendo
 *    determinista.
 *  - nombres inventados por idioma: [tipo de recinto] + [topónimo neutro]; la CIUDAD nunca va en el nombre (solo en help), sin
 *    personas, marcas ni patrocinadores (club.sponsor se ignora), lista de bloqueo DENY y cánticos impersonales.
 *  - OVERRIDES ({'PL:LKS': {arch: 'H6'}}, 'cc:SHORT:b' para la playa) es la ÚNICA vía para corregir sedes concretas.
 * Diseño completo: plan «sedes-gen» (arquitectura, parámetros, nombres, variedad). Prueba: node tools/venuegen-test.js.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  // globales como locales: más rápido en contextos vm de node (pruebas) y sin cambio en el navegador
  var Math = root.Math, String = root.String, JSON = root.JSON, Object = root.Object, parseInt = root.parseInt, isFinite = root.isFinite;
  var V = 1;

  // ------------------------------------------------------------------ utilidades puras
  function fnv(s) { s = String(s); var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function sfc(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  /** Sub-flujo del eje `axis` para la semilla `seed`. */
  function mix32(h) { h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
  function rng(seed, axis) {
    var h = fnv(seed + '|' + axis), r = sfc(h, mix32(h ^ 0x9e3779b9), mix32(h + 0x6a09e667), mix32(h ^ 0xbb67ae85));
    for (var i = 0; i < 8; i++) r();
    return r;
  }
  function R2(x) { return Math.round(x * 100) / 100; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rr(r, a, b) { return R2(a + (b - a) * r()); }
  function ri(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  /** Elección ponderada: opts = [[valor, peso], …] (array: no depende del orden de claves). */
  function wpick(r, opts) {
    var tot = 0, i; for (i = 0; i < opts.length; i++) tot += Math.max(0, opts[i][1]);
    if (!(tot > 0)) return opts.length ? opts[0][0] : null;
    var x = r() * tot; for (i = 0; i < opts.length; i++) { x -= Math.max(0, opts[i][1]); if (x < 0) return opts[i][0]; }
    return opts[opts.length - 1][0];
  }
  function fold(s) {
    return String(s == null ? '' : s).replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/ß/g, 'ss').replace(/ı/g, 'i').replace(/ø/g, 'o')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  /** Clave normalizada: sin acentos, minúsculas, sin «voley/volley/vc/cv». */
  var MEMO = { n: {}, f: {}, size: 0 };
  function memo(tab, s, fn) {
    var v = tab[s]; if (v !== undefined) return v;
    if (++MEMO.size > 6000) { MEMO.n = {}; MEMO.f = {}; MEMO.size = 0; tab = fn === normRaw ? MEMO.n : MEMO.f; }
    return (tab[s] = fn(s));
  }
  function norm(s) { return memo(MEMO.n, String(s == null ? '' : s), normRaw); }
  function normRaw(s) { return (' ' + fold(s).replace(/[^a-z0-9]+/g, ' ') + ' ').replace(/ (voley|volley|vc|cv)(?= )/g, ' ').replace(/\s+/g, ' ').trim(); }
  /** Para la lista de bloqueo: solo letras y números, sin espacios. */
  function flat(s) { return memo(MEMO.f, String(s == null ? '' : s), flatRaw); }
  function flatRaw(s) { return fold(s).replace(/[^a-z0-9]+/g, ''); }

  // ------------------------------------------------------------------ color
  function toRGB(x) {
    if (typeof x === 'number' && isFinite(x)) return [((x >> 16) & 255) / 255, ((x >> 8) & 255) / 255, (x & 255) / 255];
    if (typeof x === 'string') {
      var m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(x.trim()); if (!m) return null;
      var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    return null;
  }
  function hex(c) { var s = '#'; for (var i = 0; i < 3; i++) { var v = Math.round(clamp(c[i], 0, 1) * 255).toString(16); s += v.length < 2 ? '0' + v : v; } return s; }
  function rgb2hsl(c) {
    var r = c[0], g = c[1], b = c[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 1e-9) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, clamp(s, 0, 1), l];
  }
  function hsl2rgb(q) {
    var h = ((q[0] % 360) + 360) % 360, s = q[1], l = q[2], C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2, r, g, b;
    if (h < 60) { r = C; g = X; b = 0; } else if (h < 120) { r = X; g = C; b = 0; } else if (h < 180) { r = 0; g = C; b = X; }
    else if (h < 240) { r = 0; g = X; b = C; } else if (h < 300) { r = X; g = 0; b = C; } else { r = C; g = 0; b = X; }
    return [r + m, g + m, b + m];
  }
  function hslHex(q) { return hex(hsl2rgb(q)); }
  function hexHsl(h) { return rgb2hsl(toRGB(h)); }
  function linRaw(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  var LIN8 = []; for (var li = 0; li < 256; li++) LIN8.push(linRaw(li / 255));
  // (tabla para los valores de 8 bits, que son casi todos: apart y ballD convierten a Lab cientos de candidatos por sede)
  function lin(v) { var k = v * 255, i = Math.round(k); return Math.abs(k - i) < 1e-6 && i >= 0 && i < 256 ? LIN8[i] : linRaw(v); }
  /** Luminancia relativa (sRGB) 0..1. */
  function lum(h) { var c = typeof h === 'string' ? toRGB(h) : h; return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) { return Math.abs(lum(a) - lum(b)); }
  function hueD(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function isYellow(h) { return h >= 40 && h <= 70; }
  function mixHex(a, b, t) { var x = toRGB(a), y = toRGB(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
  function neutral(q) { return q[1] < 0.12 || q[2] > 0.94 || q[2] < 0.06; }

  // ------------------------------------------------------------------ países
  // clima, style (pesos de arquetipo y flavor regional), lang (idioma por defecto; ver langOf), coast, hues (paleta del país para
  // clubes de colores neutros).
  function E(clima, style, lang, coast, hues) { return { clima: clima, style: style, lang: lang, coast: coast, hues: hues }; }
  var ENV = {
    IT: E('med', 'med', 'it', true, [140, 0, 210]), ES: E('med', 'med', 'es', true, [0, 45, 20]), GR: E('med', 'med', 'el', true, [210, 200, 190]),
    PT: E('med', 'med', 'pt', true, [140, 0, 50]), TR: E('med', 'med', 'tr', true, [0, 355, 15]), FR: E('oce', 'med', 'fr', true, [225, 0, 210]),
    BE: E('oce', 'alpnord', 'nl', true, [45, 0, 30]), NL: E('oce', 'alpnord', 'nl', true, [25, 210, 0]), PL: E('cont', 'east', 'pl', true, [355, 0, 210]),
    DE: E('cont', 'alpnord', 'de', true, [45, 0, 30]), CZ: E('cont', 'east', 'cs', false, [215, 0, 200]), RS: E('cont', 'east', 'sr', false, [0, 215, 350]),
    SI: E('cont', 'east', 'sl', true, [215, 0, 120]), RO: E('cont', 'east', 'ro', true, [220, 50, 0]), AT: E('cont', 'alpnord', 'de', false, [0, 350, 20]),
    CH: E('cont', 'alpnord', 'de', false, [0, 355, 210]), RU: E('cold', 'east', 'ru', true, [215, 0, 200]), CA: E('cold', 'alpnord', 'enca', true, [0, 355, 15]),
    BR: E('trop', 'trop', 'ptbr', true, [140, 50, 215]), PH: E('trop', 'trop', 'enph', true, [220, 0, 50]), AR: E('templ', 'latam', 'esar', true, [200, 210, 45]),
    US: E('templ', 'us', 'enus', true, [220, 0, 210]), JP: E('templ', 'jpkr', 'ja', true, [355, 0, 210]), KR: E('templ', 'jpkr', 'ko', true, [215, 0, 350]),
    CN: E('templ', 'jpkr', 'zh', true, [0, 45, 10]), IR: E('arid', 'gulf', 'fa', true, [140, 0, 120]), QA: E('arid', 'gulf', 'ar', true, [340, 330, 320]),
    PE: E('arid', 'trop', 'espe', true, [0, 355, 20]),
    XX: E('med', 'med', 'es', true, [200, 15, 45])   // playa de la Carrera
  };
  var CCS = ['IT', 'ES', 'GR', 'PT', 'TR', 'FR', 'BE', 'NL', 'PL', 'DE', 'CZ', 'RS', 'SI', 'RO', 'AT', 'CH', 'RU', 'CA', 'BR', 'PH', 'AR', 'US', 'JP', 'KR', 'CN', 'IR', 'QA', 'PE'];
  var CAT_CITIES = ['barcelona', 'girona', 'lleida', 'tarragona', 'sabadell', 'terrassa', 'manresa', 'mataro', 'granollers', 'badalona', 'reus', 'vic',
    'sant cugat', 'palma', 'manacor', 'ciutadella', 'menorca', 'ibiza', 'eivissa', 'valencia', 'castellon', 'alicante', 'benidorm', 'gandia', 'andorra', 'xativa'];
  /** ¿La ciudad contiene alguna de las palabras o secuencias completas de la lista? (sin prefijos: 'palma' no casa con «Las Palmas»). */
  function hasAny(city, list) { var c = ' ' + norm(city) + ' '; for (var i = 0; i < list.length; i++) if (c.indexOf(' ' + list[i] + ' ') >= 0) return true; return false; }
  /** Idioma de los nombres según país y ciudad. */
  function langOf(cc, city, seed) {
    var h = fnv('lang|' + norm(city));
    switch (cc) {
      case 'ES': return hasAny(city, CAT_CITIES) ? 'ca' : 'es';
      case 'XX': return (seed & 1) ? 'ca' : 'es';
      case 'BE': return hasAny(city, ['charleroi', 'chapelle', 'liege', 'namur', 'mons', 'tournai', 'wavre', 'arlon', 'verviers', 'nivelles']) ? 'fr'
        : hasAny(city, ['bruselas', 'bruxelles']) ? (h & 1 ? 'fr' : 'nl') : 'nl';
      case 'CH': return hasAny(city, ['ginebra', 'geneve', 'neuchatel', 'lausana', 'lausanne', 'chene', 'sion', 'montreux', 'yverdon', 'delemont']) ? 'fr'
        : hasAny(city, ['lugano', 'bellinzona', 'locarno', 'mendrisio']) ? 'it' : hasAny(city, ['dudingen', 'schonenwerd', 'amriswil', 'nafels']) ? 'de'
        : hasAny(city, ['friburgo', 'fribourg', 'biel', 'bienne']) ? (h % 2 ? 'fr' : 'de') : 'de';
      case 'CA': return hasAny(city, ['montreal', 'quebec', 'sherbrooke', 'gatineau', 'laval', 'trois rivieres', 'saguenay']) ? 'fr' : 'enca';
      default: return (ENV[cc] || ENV.XX).lang;
    }
  }

  // ------------------------------------------------------------------ nombres
  // T: topónimos neutros (forma corta = `short`, ≤ 12); w: guiños de vóley ('!' = nombre completo «!PalaBagher|Bagher»);
  // k: [plantilla, tier mínimo, tier máximo] ({T} tal cual, {dT} con la preposición de la lengua); b: plantillas de playa por escenario;
  // j: unión con preposición; ch: cánticos (siempre impersonales, con las siglas {S}).
  function sp(s) { return s.split('|'); }
  var JOIN = {
    id: function (t) { return t; },
    es: function (t) {
      if (/^El /.test(t)) return 'del ' + t.slice(3); if (/^La /.test(t)) return 'de la ' + t.slice(3);
      if (/^Los /.test(t)) return 'de los ' + t.slice(4); if (/^Las /.test(t)) return 'de las ' + t.slice(4); return 'de ' + t;
    },
    ca: function (t) {
      if (/^El /.test(t)) return 'del ' + t.slice(3); if (/^Els /.test(t)) return 'dels ' + t.slice(4);
      if (/^La /.test(t)) return 'de la ' + t.slice(3); if (/^Les /.test(t)) return 'de les ' + t.slice(4);
      if (/^L'/.test(t)) return "de l'" + t.slice(2); return /^Can /.test(t) ? t : (/^[AEIOUÀÈÉÍÒÓÚH]/.test(t) ? "d'" + t : 'de ' + t);
    },
    it: function (t) {
      if (/^Il /.test(t)) return 'del ' + t.slice(3); if (/^Lo /.test(t)) return 'dello ' + t.slice(3); if (/^La /.test(t)) return 'della ' + t.slice(3);
      if (/^L'/.test(t)) return "dell'" + t.slice(2); if (/^I /.test(t)) return 'dei ' + t.slice(2); if (/^Gli /.test(t)) return 'degli ' + t.slice(4);
      if (/^Le /.test(t)) return 'delle ' + t.slice(3); return t;
    },
    pt: function (t) {
      if (/^O /.test(t)) return 'do ' + t.slice(2); if (/^A /.test(t)) return 'da ' + t.slice(2); if (/^Os /.test(t)) return 'dos ' + t.slice(3);
      if (/^As /.test(t)) return 'das ' + t.slice(3); return t;
    },
    fr: function (t) {
      if (/^Le /.test(t)) return 'du ' + t.slice(3); if (/^La /.test(t)) return 'de la ' + t.slice(3); if (/^Les /.test(t)) return 'des ' + t.slice(4);
      if (/^L'/.test(t)) return "de l'" + t.slice(2); return /^[AEIOUÉÈÂÎH]/.test(t) ? "d'" + t : 'de ' + t;
    }
  };
  var LANG = {
    es: {
      T: sp('Los Olmos|La Alameda|El Molino|Los Pinos|La Ribera|El Faro|Las Acacias|El Puente|La Estación|Los Sauces|El Mirador|La Vega|Las Moreras|El Pinar|La Dehesa|Los Tilos|El Cerro|La Noria|Los Robles|El Encinar|La Fuente|Las Eras|El Arenal|La Loma|Los Chopos|El Soto|La Rambla|Las Palmeras|El Olivar|La Huerta|Los Castaños|El Viento|La Solana|Las Lomas|El Cañaveral|La Cantera|Los Fresnos|El Torreón|La Atalaya|El Pozo|La Pradera|Los Prados|El Rompeolas|La Marina|El Algarrobo|La Calzada|Barrio Alto|Las Higueras|Monte Claro|Las Adelfas'),
      w: sp('La Red|El Bloqueo|El Remate|La Finta|El Saque|La Recepción'),
      k: [['Pabellón {T}', 0, 3], ['Polideportivo {T}', 0, 1], ['Palacio de los Deportes {T}', 3, 3], ['Pabellón Municipal {T}', 1, 2]],
      b: { open: ['Playa {dT}'], cove: ['Cala {dT}'], port: ['Muelle {dT}'], lake: ['Laguna {dT}'], plaza: ['Plaza {dT}'], river: ['Ribera {dT}'], desert: ['Dunas {dT}'], dunes: ['Dunas {dT}'], tropical: ['Playa {dT}'] },
      j: 'es', ch: sp('¡VAMOS {S}!|¡AÚPA {S}!|¡ARRIBA {S}!|¡TODOS CON {S}!')
    },
    ca: {
      T: sp('Les Moreres|El Pinar|La Sínia|El Molí|Els Pins|La Riera|El Far|Les Oliveres|El Pont|La Font|Els Til·lers|La Rambla|El Turó|Les Eres|La Pineda|Els Àlbers|La Bassa|El Mirador|Les Salines|La Marina|El Camp|La Serra|Els Xiprers|El Roure|La Plana|Les Hortes|El Garrofer|La Torre|Els Prats|El Rec|La Muntanya|Les Palmeres|El Raval|La Vinya|El Bosc|Les Dunes|Mar Blava|El Safareig|La Bòbila|Les Roques'),
      w: sp('El Bloqueig|La Xarxa|La Rematada|Can Toc|El Servei'),
      k: [['Pavelló {dT}', 0, 3], ['Poliesportiu {dT}', 0, 2], ['Palau dels Esports {dT}', 3, 3]],
      b: { open: ['Platja {dT}'], cove: ['Cala {dT}'], port: ['Moll {dT}'], lake: ['Estany {dT}'], plaza: ['Plaça {dT}'], river: ['Riba {dT}'], desert: ['Dunes {dT}'], dunes: ['Dunes {dT}'], tropical: ['Platja {dT}'] },
      j: 'ca', ch: sp('AMUNT {S}!|SOM-HI {S}!|ENDAVANT {S}!')
    },
    it: {
      T: sp('La Pineta|Borgo Nuovo|I Tigli|Il Mulino|Le Querce|Colle Verde|I Gelsi|Le Fornaci|Il Faro|Val Fiorita|Prato Lungo|Le Vigne|La Stazione|Rio Secco|Belvedere|Poggio Alto|Le Torri|Il Ponte|I Platani|La Fontana|Le Acacie|I Castagni|La Rocca|Il Porto|Le Mura|Le Logge|La Darsena|Il Canneto|I Pioppi|Monte Alto|La Collina|Le Saline|Il Vento|La Lanterna|Gli Ulivi|I Salici|Le Cave|Pian Grande|Il Rione|La Bastia|Il Frantoio|La Chiusa|Il Cerreto|Le Ginestre'),
      w: ['!PalaSchiacciata|Schiacciata', '!PalaBagher|Bagher', '!PalaMuro|Muro', 'Il Pallonetto', 'La Rete'],
      k: [['Palestra {dT}', 0, 0], ['Palazzetto {dT}', 0, 2], ['PalaSport {dT}', 1, 3], ['Palazzo dello Sport {dT}', 3, 3]],
      b: { open: ['Spiaggia {dT}'], cove: ['Cala {dT}'], port: ['Molo {dT}'], lake: ['Lido {dT}'], plaza: ['Piazza {dT}'], river: ['Riva {dT}'], desert: ['Dune {dT}'], dunes: ['Dune {dT}'], tropical: ['Spiaggia {dT}'] },
      j: 'it', ch: sp('FORZA {S}|SEMPRE {S}|ALÈ {S}|DAI {S}!')
    },
    pt: {
      T: sp('Os Pinheiros|A Ribeira|O Moinho|Vale Verde|As Oliveiras|O Farol|A Estação|Os Choupos|A Fonte|O Mirante|Monte Alto|A Quinta|Os Loureiros|O Pinhal|A Lagoa|O Cais|A Marina|Os Plátanos|A Colina|Bairro Novo|A Azenha|As Dunas|O Outeiro|A Várzea|Os Carvalhos|A Ponte|O Areal|A Torre|Ribamar|Pedra Alta|Os Moinhos|A Encosta|O Souto|As Salinas|O Pomar'),
      w: sp('A Manchete|O Bloqueio|O Remate|O Serviço'),
      k: [['Pavilhão {dT}', 0, 3], ['Ginásio {dT}', 0, 1], ['Pavilhão Municipal {dT}', 1, 2], ['Pavilhão Multiusos {dT}', 3, 3]],
      b: { open: ['Praia {dT}'], cove: ['Enseada {dT}'], port: ['Cais {dT}'], lake: ['Lagoa {dT}'], plaza: ['Praça {dT}'], river: ['Ribeira {dT}'], desert: ['Dunas {dT}'], dunes: ['Dunas {dT}'], tropical: ['Praia {dT}'] },
      j: 'pt', ch: sp('FORÇA {S}|VAMOS {S}!|ALLEZ {S}')
    },
    ptbr: {
      T: sp('O Ipê|Os Coqueiros|A Mangueira|Jacarandá|O Cajueiro|A Lagoa|Vila Nova|O Mirante|Morro Alto|Os Ipês|A Cachoeira|O Buriti|Bela Vista|Recanto|Areia Branca|A Palmeira|O Pontal|Sol Nascente|Vale do Sol|A Restinga|O Jatobá|A Figueira|Beira-Rio|O Farol|As Acácias|Vila Verde|Os Pinheiros|A Represa|O Cerrado|Brisa do Mar|Pedra Branca|O Coreto|Cidade Nova|Lagoa Azul|Serra Verde|O Engenho|A Ponte|O Cais|O Manacá|A Pitanga'),
      w: sp('A Manchete|O Bloqueio|A Cortada|O Saque'),
      k: [['Ginásio {dT}', 0, 3], ['Ginásio Poliesportivo {dT}', 1, 3], ['Ginásio Municipal {dT}', 0, 2], ['Arena {dT}', 3, 3]],
      b: { open: ['Praia {dT}'], cove: ['Enseada {dT}'], port: ['Cais {dT}'], lake: ['Lagoa {dT}'], plaza: ['Praça {dT}'], river: ['Orla {dT}'], desert: ['Dunas {dT}'], dunes: ['Dunas {dT}'], tropical: ['Praia {dT}'] },
      j: 'pt', ch: sp('VAI {S}!|É {S}!|VAMOS {S}!|RAÇA {S}!')
    },
    fr: {
      T: sp('Les Tilleuls|Le Moulin|La Gare|Les Saules|Les Mimosas|Les Pins|La Prairie|Le Pont|Les Chênes|La Colline|Le Vallon|Les Acacias|Les Platanes|La Source|Le Port|Les Vignes|Le Plateau|Les Hêtres|Le Belvédère|La Roseraie|Les Ormes|Le Bocage|La Pinède|Les Charmes|Le Marais|Les Dunes|La Falaise|Les Érables|Le Canal|Le Clos|La Lande|Les Genêts|Le Verger|Les Coteaux|La Fontaine|Les Bruyères|La Digue|Le Bourg|Les Roseaux|La Butte|Les Lilas|Le Mistral|Les Sorbiers|La Clairière|Le Tertre|Les Iris'),
      w: sp('Le Smash|La Manchette|Le Contre|La Feinte'),
      k: [['Gymnase {dT}', 0, 1], ['Salle des Sports {dT}', 0, 2], ['Complexe Sportif {dT}', 1, 3], ['Palais des Sports {dT}', 3, 3]],
      b: { open: ['Plage {dT}'], cove: ['Crique {dT}'], port: ['Quai {dT}'], lake: ['Lac {dT}'], plaza: ['Place {dT}'], river: ['Berges {dT}'], desert: ['Dunes {dT}'], dunes: ['Dunes {dT}'], tropical: ['Plage {dT}'] },
      j: 'fr', ch: sp('ALLEZ {S} !|ALLEZ LES {S} !|TOUS AVEC {S}')
    },
    de: {
      T: sp('Lindenhof|Seeblick|Mühlbach|Eichengrund|Sonnenhang|Talwiese|Brückenfeld|Ahornpark|Windeck|Kiefernhain|Auwald|Erlenbruch|Bergfried|Rosenau|Weidenhof|Steinbruch|Felsenkeller|Altmühle|Neumühle|Bachgrund|Heideland|Birkenhain|Lerchenfeld|Tannenhöhe|Wiesengrund|Hafenkante|Uferpark|Leuchtturm|Schlossberg|Kastanienhof|Fuchsbau|Eulenberg|Ostwind|Weinberg|Sandgrube|Fliederweg|Kirschgarten|Morgenrot|Hochfeld|Brunnenhof|Lindenau|Holzmarkt|Sonnenwiese|Erlengrund|Rabenhorst|Schilfufer|Mühlenteich|Ginsterweg'),
      w: sp('Netzkante|Aufschlag|Blockwand|Baggerfeld'),
      k: [['{T}-Turnhalle', 0, 1], ['{T}-Sporthalle', 0, 2], ['Sporthalle {T}', 1, 2], ['Sportpark {T}', 2, 3], ['{T}-Arena', 3, 3]],
      b: { open: ['{T}-Strand'], cove: ['{T}-Bucht'], port: ['{T}-Hafen'], lake: ['Strandbad {T}'], plaza: ['{T}-Platz'], river: ['{T}-Ufer'], desert: ['Strand {T}'], dunes: ['Strand {T}'], tropical: ['{T}-Strand'] },
      j: 'id', ch: sp('AUF GEHT\'S {S}!|HOPP {S}!|VORWÄRTS {S}!')
    },
    nl: {
      T: sp('De Linden|Molenwijk|De Wieken|Het Baken|Duinzicht|De Polder|Het Veer|De Eik|Rietland|De Vijver|Hoogveld|De Brug|Zeezicht|De Beuken|Het Bos|De Kade|Waterkant|De Dijk|Het Ven|De Meent|Bloemhof|De Hoeve|Berkenhof|Heidezoom|De Esch|Lindehof|De Akker|Laagland|Vlietzicht|De Schans|Oeverland|De Sluis|Wilgenhof|De Wetering|Het Anker'),
      w: sp('Het Net|De Smash|Het Blok'),
      k: [['Sporthal {T}', 0, 2], ['Sportcentrum {T}', 1, 3], ['Sportpaleis {T}', 3, 3]],
      b: { open: ['Strand {T}'], cove: ['Strand {T}'], port: ['Haven {T}'], lake: ['Plas {T}'], plaza: ['Plein {T}'], river: ['Oever {T}'], desert: ['Duinen {T}'], dunes: ['Duinen {T}'], tropical: ['Strand {T}'] },
      j: 'id', ch: sp('HUP {S}!|KOM OP {S}!|ALLEZ {S}')
    },
    pl: {
      T: sp('Pod Lipami|Nadrzeczna|Pod Dębami|Na Skarpie|Przy Młynie|Nad Stawem|Pod Sosnami|Wrzosowa|Jarzębinowa|Kasztanowa|Leśna Polana|Pod Brzozami|Na Wzgórzu|Słoneczna|Nad Zalewem|Przy Latarni|Wiatraki|Zielony Gaj|Pod Wierzbą|Stary Młyn|Klonowa|Akacjowa|Grabowa|Topolowa|Na Polanie|Pod Kopcem|Modrzewiowa|Złoty Łan|Przy Moście|Bukowa|Jaśminowa|Nad Jeziorem|Cicha Dolina|Pod Skałą|Zacisze|Ogrodowa|Wydmy|Lipowy Dwór|Nad Potokiem|Pod Topolami|Przy Źródle|Na Grobli|Przy Stawie|Pod Olchami|Pod Klonem|Pod Jodłami|Na Błoniach|Przy Tamie|Pod Wiązami|Rybaczówka|Nad Strugą|Pod Lasem|Na Łąkach'),
      w: sp('Zagrywka|Pod Siatką'),
      k: [['Hala Sportowa {T}', 0, 2], ['Hala {T}', 0, 1], ['Hala Widowiskowa {T}', 3, 3], ['Arena {T}', 2, 3]],
      b: { open: ['Plaża {T}'], cove: ['Zatoka {T}'], port: ['Przystań {T}'], lake: ['Kąpielisko {T}'], plaza: ['Plac {T}'], river: ['Bulwar {T}'], desert: ['Wydmy {T}'], dunes: ['Wydmy {T}'], tropical: ['Plaża {T}'] },
      j: 'id', ch: sp('NAPRZÓD {S}!|DO BOJU {S}!|JAZDA {S}!')
    },
    tr: {
      T: sp('Çınarlı|Yeşilvadi|Kavaklı|Değirmen|Fener|Köprübaşı|Rüzgarlı|Yalı|Gülbahçe|Akasya|Ilıca|Çamlık|Söğütlü|Meşelik|Zeytinlik|Lalezar|Sahil|Liman|Tepeüstü|Kumsal|Bağlar|Ihlamur|Menekşe|Papatya|Mavi Koy|Kuyulu|Taşocak|Bayır|Selvi|Palmiye|Kayalık|İskele|Yamaç|Ova|Ardıç|Kestane|Erguvan|Defne|Martı|Dalgalı'),
      w: sp('Smaç|Filedibi'),
      k: [['{T} Spor Salonu', 0, 3], ['{T} Kapalı Spor Salonu', 2, 3], ['{T} Spor Kompleksi', 2, 3], ['{T} Arena', 3, 3]],
      b: { open: ['{T} Plajı'], cove: ['{T} Koyu'], port: ['{T} İskelesi'], lake: ['{T} Gölü'], plaza: ['{T} Meydanı'], river: ['{T} Kıyısı'], desert: ['{T} Kumulları'], dunes: ['{T} Kumulları'], tropical: ['{T} Plajı'] },
      j: 'id', ch: sp('HAYDİ {S}!|HAYDİ {S} HAYDİ|ŞAMPİYON {S}')
    },
    ru: {
      T: sp('Berezka|Rodnik|Zarechye|Mayak|Rassvet|Ryabinka|Topolya|Lesnaya|Solnechny|Rechnoy|Kedr|Yolochka|Severny|Zarya|Volna|Prichal|Klyonovy|Lipki|Ivushka|Polyana|Ozyorny|Gorka|Mostovoy|Vesna|Ogonyok|Dubrava|Lukomorye|Tikhy Bereg|Rosinka|Chaika|Sinyaya Reka|Kamyshi|Pristan|Okolitsa|Sosnovka|Medvezhy|Zvezdochka|Vetrovoy'),
      w: [],
      k: [['Sportzal {T}', 0, 1], ['Sportkompleks {T}', 1, 3], ['Dvorets Sporta {T}', 3, 3], ['Manezh {T}', 2, 3]],
      b: { open: ['Plyazh {T}'], cove: ['Plyazh {T}'], port: ['Prichal {T}'], lake: ['Bereg {T}'], plaza: ['Gorodskoy Plyazh {T}'], river: ['Bereg {T}'], desert: ['Plyazh {T}'], dunes: ['Plyazh {T}'], tropical: ['Plyazh {T}'] },
      j: 'id', ch: sp('VPERYOD {S}!|DAVAI {S}!|{S} CHEMPION')
    },
    el: {
      T: sp('Elies|Platanos|Pefka|Akrogiali|Fanari|Mylos|Lofos|Ammoudia|Dafni|Kastro|Limani|Anemomylos|Plakes|Perivolia|Agnantio|Votsalo|Lefkes|Rodies|Kampos|Prinos|Vrysi|Pigadi|Kalamies|Galini|Asteria|Thalassa|Ampelia|Kerasies|Mouries|Krini|Ammos|Kymata'),
      w: [],
      k: [['Gymnastirio {T}', 0, 1], ['Kleisto Gymnastirio {T}', 1, 3], ['Athlitiko Kentro {T}', 2, 3]],
      b: { open: ['Paralia {T}'], cove: ['Ormos {T}'], port: ['Limani {T}'], lake: ['Limni {T}'], plaza: ['Plateia {T}'], river: ['Ochthi {T}'], desert: ['Ammolofi {T}'], dunes: ['Ammolofi {T}'], tropical: ['Paralia {T}'] },
      j: 'id', ch: sp('PAME {S}!|OLOI {S}!|EMPROS {S}')
    },
    cs: {
      T: sp('Na Výsluní|U Lip|Pod Lesem|Na Kopci|U Mlýna|Lipová|Za Řekou|Na Stráni|U Rybníka|Pod Hájem|Březiny|Na Vyhlídce|U Jezu|Topoly|Na Ostrově|Pod Skalou|Habrovka|U Mostu|Na Louce|Javorová|Dubina|U Studánky|Olšiny|Na Hrázi|Větrník|Kaštany|Vinice|Pod Vrchem|Na Pískách'),
      w: [],
      k: [['Sportovní hala {T}', 0, 3], ['Tělocvična {T}', 0, 0], ['Městská hala {T}', 1, 2]],
      b: { open: ['Pláž {T}'], cove: ['Zátoka {T}'], port: ['Přístav {T}'], lake: ['Koupaliště {T}'], plaza: ['Náměstí {T}'], river: ['Nábřeží {T}'], desert: ['Duny {T}'], dunes: ['Duny {T}'], tropical: ['Pláž {T}'] },
      j: 'id', ch: sp('DO TOHO {S}!|JEDEM {S}!|VPŘED {S}')
    },
    sr: {
      T: sp('Lipe|Breza|Vidikovac|Kej|Topola|Vrelo|Hrastovac|Vetrenjača|Kestenje|Obala|Brdo|Lug|Bagrem|Livade|Vinogradi|Izvor|Most|Sunčani Breg|Ribnjak|Vrbak|Gaj|Pristanište|Mlin|Javor|Borik|Jorgovan|Kod Česme|Dolina|Jasenje'),
      w: [],
      k: [['Sportski centar {T}', 0, 3], ['Hala sportova {T}', 1, 3], ['Sala {T}', 0, 1]],
      b: { open: ['Plaža {T}'], cove: ['Uvala {T}'], port: ['Pristan {T}'], lake: ['Jezero {T}'], plaza: ['Trg {T}'], river: ['Plaža {T}', 'Kej {T}'], desert: ['Dine {T}'], dunes: ['Dine {T}'], tropical: ['Plaža {T}'] },
      j: 'id', ch: sp('HAJDE {S}!|NAPRED {S}!|IDEMO {S}')
    },
    sl: {
      T: sp('Pod Lipo|Brezje|Ob Potoku|Na Gmajni|Gaj|Log|Vrtača|Ob Jezeru|Pod Gradom|Pri Mlinu|Ob Reki|Na Klancu|Vinograd|Svetilnik|Lipovec|Hrastje|Ob Mostu|Na Travniku|Pod Skalo|Bukovje|Vetrnica|Smrečje|Javorje|Kostanj|Na Produ'),
      w: [],
      k: [['Športna dvorana {T}', 0, 3], ['Telovadnica {T}', 0, 0], ['Dvorana {T}', 1, 3]],
      b: { open: ['Plaža {T}'], cove: ['Zaliv {T}'], port: ['Pomol {T}'], lake: ['Kopališče {T}'], plaza: ['Trg {T}'], river: ['Nabrežje {T}'], desert: ['Sipine {T}'], dunes: ['Sipine {T}'], tropical: ['Plaža {T}'] },
      j: 'id', ch: sp('GREMO {S}!|NAPREJ {S}!|DAJMO {S}')
    },
    ro: {
      T: sp('Teiul|Lunca|Izvor|Plopi|Salcia|Dealul Mare|Codrul|Morii|Valea Lină|Stejarul|Fântâna|Podul Vechi|Farul|Livada|Brazii|Castanii|Moara Veche|Zăvoi|Poiana|Arinii|Salcâmi|Răsărit|Colina|Viile|Pescăruș'),
      w: [],
      k: [['Sala Sporturilor {T}', 0, 3], ['Sala de Sport {T}', 0, 1], ['Sala Polivalentă {T}', 2, 3]],
      b: { open: ['Plaja {T}'], cove: ['Golful {T}'], port: ['Debarcaderul {T}'], lake: ['Lacul {T}'], plaza: ['Piața {T}'], river: ['Faleza {T}'], desert: ['Dunele {T}'], dunes: ['Dunele {T}'], tropical: ['Plaja {T}'] },
      j: 'id', ch: sp('HAI {S}!|HAIDE {S}!|ÎNAINTE {S}')
    },
    enus: {
      T: sp('Maple Grove|Cedar Creek|Riverside|Oak Hollow|Pine Ridge|Willow Bend|Lakeview|Mill Pond|Elm Park|Fox Run|Stone Bridge|Harbor Point|Bluebird|Aspen Hill|Prairie Wind|Sycamore|Red Rock|Hickory Lane|Juniper|Cottonwood|Sandpiper|Shady Oaks|Magnolia|Granite Peak|Canyon View|Eagle Crest|Brookside|Meadowlark|Driftwood|Lighthouse|Sunset Hill|Tall Pines|Cypress Bay|Fairview|Birch Hollow|Quarry Hill'),
      w: sp('Set Point|Side Out|Pancake Hill'),
      k: [['{T} Gym', 0, 1], ['{T} Rec Center', 0, 2], ['{T} Fieldhouse', 1, 3], ['{T} Arena', 3, 3]],
      b: { open: ['{T} Beach'], cove: ['{T} Cove'], port: ['{T} Pier'], lake: ['{T} Lakefront'], plaza: ['{T} Plaza'], river: ['{T} Riverbank'], desert: ['{T} Sands'], dunes: ['{T} Dunes'], tropical: ['{T} Beach'] },
      j: 'id', ch: sp('GO {S}!|LET\'S GO {S}!|{S} ALL THE WAY')
    },
    enca: {
      T: sp('Birchwood|Maple Bay|Spruce Hill|Loon Lake|Pine Bluff|Beaver Creek|Cedar Ridge|Northwind|Elk Meadow|Aurora|Tamarack|Willow Park|Moose Hollow|Hemlock|Lakeshore|Ironwood|Juniper Bay|Red Pine|Snowberry|Larch Hill|Riverbend|Silver Birch|Pinecrest|Blue Heron|Caribou Bend|Fir Point'),
      w: sp('Set Point|Side Out'),
      k: [['{T} Community Centre', 0, 1], ['{T} Sports Centre', 1, 3], ['{T} Fieldhouse', 2, 3]],
      b: { open: ['{T} Beach'], cove: ['{T} Cove'], port: ['{T} Wharf'], lake: ['{T} Lakefront'], plaza: ['{T} Square'], river: ['{T} Riverbank'], desert: ['{T} Sands'], dunes: ['{T} Dunes'], tropical: ['{T} Beach'] },
      j: 'id', ch: sp('GO {S} GO!|LET\'S GO {S}!|ALLEZ {S}')
    },
    enph: {
      T: sp('Narra|Sampaguita|Bagong Bayan|Kalachuchi|Acacia|Molave|Ilog|Dalampasigan|Kawayan|Bayanihan|Mabuhay|Liwayway|Bituin|Silangan|Banaba|Ilang-Ilang|Masagana|Dagat|Bulaklak|Hangin|Bukid|Mangga|Niyog|Anahaw|Alon|Buhangin'),
      w: sp('Set Point|Side Out'),
      k: [['{T} Covered Court', 0, 1], ['{T} Gym', 0, 2], ['{T} Sports Complex', 1, 3], ['{T} Coliseum', 2, 3]],
      b: { open: ['{T} Beach'], cove: ['{T} Cove'], port: ['{T} Pier'], lake: ['{T} Lakeside'], plaza: ['{T} Plaza'], river: ['{T} Riverside'], desert: ['{T} Sands'], dunes: ['{T} Dunes'], tropical: ['{T} Beach'] },
      j: 'id', ch: sp('LABAN {S}!|GO {S}!|KAYA {S}!')
    },
    ja: {
      T: sp('Sakura-dai|Kawabe|Matsu-hama|Minato-hama|Kaze-no-oka|Hoshino-oka|Momiji-dai|Kita-hama|Umi-no-mori|Midori-dai|Hikari-machi|Ume-zono|Tsubaki-dai|Hinode-cho|Shiomi-dai|Aoba-dai|Wakaba-dai|Nami-no-hana|Tsuki-no-oka|Kiri-no-sato|Yanagi-cho|Kawa-machi|Shin-machi|Higashi-oka|Nishi-hama|Sora-no-oka|Take-no-sato|Hasu-ike|Kaede-dai|Yume-no-oka|Haru-kaze|Suzukaze|Mizuho-dai|Fuyo-dai|Hotaru-gawa|Isago-hama|Tomoe-dai|Kusunoki|Oka-no-ue|Kaigara-cho'),
      w: [],
      k: [['{T} Taiikukan', 0, 2], ['{T} Sogo Taiikukan', 2, 3], ['{T} Arena', 3, 3]],
      b: { open: ['{T} Kaigan'], cove: ['{T} Irie'], port: ['{T} Hatoba'], lake: ['{T} Kohan'], plaza: ['{T} Hiroba'], river: ['{T} Kasenjiki'], desert: ['{T} Sakyu'], dunes: ['{T} Sakyu'], tropical: ['{T} Kaigan'] },
      j: 'id', ch: sp('GANBARE {S}!|IKE {S}!|FAITO {S}!')
    },
    ko: {
      T: sp('Sonamu|Eunhaeng|Haenuri|Nuri|Gangbyeon|Dongsan|Bitgaram|Hanbit|Saetbyeol|Maru|Doldam|Haneul|Sopung|Badaro|Gaeul|Chorok|Saemteo|Deulmaru|Areum|Moraesil|Naru|Gureum|Hayan Dol|Baram|Sinnamu|Pureunsol'),
      w: [],
      k: [['{T} Cheyukgwan', 0, 2], ['{T} Silnae Cheyukgwan', 2, 3], ['{T} Arena', 3, 3]],
      b: { open: ['{T} Haebyeon'], cove: ['{T} Haebyeon'], port: ['{T} Budu'], lake: ['{T} Hosu'], plaza: ['{T} Gwangjang'], river: ['{T} Gangbyeon'], desert: ['{T} Moraeeondeok'], dunes: ['{T} Moraeeondeok'], tropical: ['{T} Haebyeon'] },
      j: 'id', ch: sp('HWAITING {S}!|{S} HWAITING|GAJA {S}!')
    },
    zh: {
      T: sp('Songlin|Liushu|Hepan|Qingshan|Meihua|Zhuyuan|Fengqiao|Taohua|Baita|Lanting|Yuehu|Qinghe|Huaishu|Yinxing|Shuiwan|Lingfeng|Chunfeng|Haibin|Shanyin|Hongye|Luming|Yunhai|Baihe|Lianhua|Xingguang|Cuiping'),
      w: [],
      k: [['{T} Tiyuguan', 0, 3], ['{T} Tiyu Zhongxin', 2, 3]],
      b: { open: ['{T} Haitan'], cove: ['{T} Wan'], port: ['{T} Matou'], lake: ['{T} Hupan'], plaza: ['{T} Guangchang'], river: ['{T} Hebin'], desert: ['{T} Shaqiu'], dunes: ['{T} Shaqiu'], tropical: ['{T} Haitan'] },
      j: 'id', ch: sp('JIAYOU {S}!|{S} JIAYOU|CHONG A {S}!')
    },
    fa: {
      T: sp('Chenar|Sarv|Bagh-e Anar|Kuhsar|Nasim|Abshar|Narvan|Sepidar|Darya|Kooh-e Sabz|Rudkenar|Nakhlestan|Bidestan|Anar|Sahel|Chaman|Kuhpaye|Golzar|Sabzeh|Ab-shirin|Tappeh|Pol-e Sang|Asiab|Darreh|Kaj'),
      w: [],
      k: [['Salon-e Varzeshi {T}', 0, 3], ['Majmue-ye Varzeshi {T}', 2, 3]],
      b: { open: ['Plazh-e {T}'], cove: ['Khalij-e {T}'], port: ['Eskele-ye {T}'], lake: ['Daryacheh-ye {T}'], plaza: ['Meydan-e {T}'], river: ['Kenar-e {T}'], desert: ['Kavir-e {T}'], dunes: ['Tapeh-ye {T}'], tropical: ['Plazh-e {T}'] },
      j: 'id', ch: sp('BEZAN {S}!|BEZAN BERIM {S}|{S} GHAHREMAN')
    },
    ar: {
      T: sp('al-Nakheel|al-Bahr|al-Waha|al-Manara|al-Sidra|al-Ghaf|al-Murjan|al-Rimal|al-Nasim|al-Yasmin|al-Fanar|al-Bustan|al-Marsa|al-Jisr|al-Qamar|al-Sahil|al-Shuruq|al-Hadiqa|al-Najma|al-Wadi|al-Tal|al-Mawj'),
      w: [],
      k: [["Qa'at {T}", 0, 3], ["Majma' {T}", 2, 3]],
      b: { open: ['Shaati {T}'], cove: ['Khaleej {T}'], port: ['Marsa {T}'], lake: ['Buhayrat {T}'], plaza: ['Sahat {T}'], river: ['Diffat {T}'], desert: ['Kuthban {T}'], dunes: ['Kuthban {T}'], tropical: ['Shaati {T}'] },
      j: 'id', ch: sp('YALLA {S}!|YALLA YA {S}|{S} BATAL')
    },
    esar: {
      T: sp('Los Ceibos|El Ombú|La Ribera|Los Aromos|Las Tipas|El Algarrobo|Los Talas|La Costanera|El Mirador|Las Acacias|El Molino|Los Paraísos|La Cañada|El Pucará|Los Sauces|La Loma|El Jacarandá|Las Lomas|El Bajo|Los Álamos|La Barranca|El Quebracho|La Laguna|Los Pinos|El Espinillo|Las Toscas'),
      w: sp('La Red|El Bloqueo|El Remate'),
      k: [['Microestadio {T}', 1, 3], ['Polideportivo {T}', 0, 2], ['Estadio Cubierto {T}', 2, 3]],
      b: { open: ['Balneario {T}'], cove: ['Bahía {dT}'], port: ['Muelle {dT}'], lake: ['Laguna {dT}'], plaza: ['Plaza {dT}'], river: ['Costanera {dT}'], desert: ['Médanos {dT}'], dunes: ['Médanos {dT}'], tropical: ['Playa {dT}'] },
      j: 'es', ch: sp('¡VAMOS {S}!|¡DALE {S}!|¡AGUANTE {S}!')
    },
    espe: {
      T: sp('Los Molles|La Huaca|El Algarrobo|Los Pinos|El Mirador|Las Lomas|La Chacra|Los Ficus|El Huarango|La Rinconada|Los Cedros|El Sauce|Las Palmas|La Pampa|El Olivar|Los Jazmines|La Quebrada|El Tambo|Las Retamas|Los Laureles|El Cóndor|Las Totoras'),
      w: sp('La Red|El Bloqueo|El Remate'),
      k: [['Coliseo {T}', 0, 3], ['Polideportivo {T}', 0, 1], ['Complejo Deportivo {T}', 2, 3]],
      b: { open: ['Playa {dT}'], cove: ['Caleta {dT}'], port: ['Muelle {dT}'], lake: ['Laguna {dT}'], plaza: ['Plaza {dT}'], river: ['Ribera {dT}'], desert: ['Dunas {dT}'], dunes: ['Dunas {dT}'], tropical: ['Playa {dT}'] },
      j: 'es', ch: sp('¡VAMOS {S}!|¡ARRIBA {S}!|¡FUERZA {S}!')
    }
  };

  // Lista de bloqueo (subcadena normalizada, sin espacios): sedes reales, marcas y palabras de género. También las sedes emblema
  // del juego (las generadas no deben llamarse igual).
  var DENY = sp('palau del mar|can rebot|cupula del far|platja llarga|moll de la sorra|cala dels fanals|' +
    'palabarton|palapanini|palaverde|palaevangelisti|palaruffini|paladozza|palalottomatica|palaeur|palabigi|palayamamay|palaigor|palaflorio|palacalafiore|palalido|palageorge|paladesio|palatrento|palasavena|palamaggio|palabanca|palaolimpia|palaprometeo|palamazzola|kioene|unipol|mediolanum|blm group|' +
    'atlas arena|spodek|ergo arena|hala stulecia|torwar|arena gliwice|tauron|netto arena|hala azoty|podpromie|hala orbita|hala urania|hala mosir|arena ursynow|' +
    'burhan felek|sinan erdem|ulker|abdi ipekci|ankara arena|ahmet comert|' +
    'maracanazinho|ibirapuera|mineirinho|nilson nelson|riachuelo|geraldo magalhaes|' +
    'ariake|yoyogi|saitama super|osaka-jo|osakajo|edion|jamsil|gocheok|chungmu|' +
    'ahoy|ziggo|lotto arena|sportpaleis antwerpen|antwerps sportpaleis|topsportcentrum|maaspoort|ethias|' +
    'max-schmeling|maxschmeling|schmeling|mercedes|barclays|lanxess|sap arena|uber arena|zf arena|swiss life|ovb arena|' +
    'accor|bercy|coubertin|kindarena|arena loire|palais des sports de beaulieu|' +
    'madison square|staples|crypto|pauley|cameron indoor|rupp arena|allen fieldhouse|hinkle|gampel|' +
    'luzhniki|olimpiyskiy|druzhba|megasport|krylatskoye|sibur|basket-hall|tatneft|dinamo|lokomotiv|spartak|zenit|cska|' +
    'pionir|stark arena|kombank|aleksandar nikolic|stozice|hala tivoli|hala tivoli|' +
    'azadi|aspire|ali bin hamad|lusail|duhail|' +
    'mall of asia|araneta|filoil|philsports|ninoy aquino|cuneta|' +
    'luna park|obras sanitarias|islas malvinas|eduardo dibos|amauta|manuel bonilla|videna|' +
    'o2 arena|wembley|palau sant jordi|fuente de san luis|wizink|movistar|pabellon principe felipe|' +
    'red bull|coca cola|cocacola|pepsi|nike|adidas|mikasa|molten|allianz|generali|samsung|toyota|panasonic|suntory|hyundai|kia arena|emirates|qatar airways|turkish airlines|ziraat|halkbank|vakifbank|fenerbahce|galatasaray|besiktas|sada cruzeiro|minas tenis|itambe|trentino|lube|asseco|jastrzebski|skra|zaksa|asahi|bridgestone|honda|sony|yamaha|' +
    'chicos|chicas|ragazzi|ragazze|herren|damen|femenino|masculino|femminile|maschile|women|ladies|girls|boys|damas|senoras|kobiet|mezczyzn|femmes|hommes|garcons|filles|kadin|erkek|mulheres|homens|meninas|meninos|frauen|manner|feminino|chicos|nois|noies').map(flat);
  var GENDER = sp('chicos|chicas|ragazzi|ragazze|herren|damen|women|ladies|girls|boys|damas|senoras|femmes|hommes|garcons|filles|kadin|erkek|mulheres|homens|frauen|manner|hosi|holky|nois|noies|muchachos|muchachas|meninos|meninas|kobiety|panowie|devojke|momci|fetes|baieti');
  function denied(name) { var f = flat(name); for (var i = 0; i < DENY.length; i++) if (DENY[i] && f.indexOf(DENY[i]) >= 0) return DENY[i]; return ''; }
  function gendered(txt) { var w = ' ' + norm(txt) + ' '; for (var i = 0; i < GENDER.length; i++) if (w.indexOf(' ' + GENDER[i] + ' ') >= 0) return GENDER[i]; return ''; }

  function up(s) { return String(s).toUpperCase(); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function typeWord(fmt) { return norm(fmt.replace(/\{d?T\}/g, ' ').replace(/[-']/g, ' ')).split(' ')[0] || ''; }
  // Núcleo del topónimo: sin el artículo inicial («Los Olmos» → «Olmos», «Gli Ulivi» → «Ulivi», «al-Bahr» → «Bahr»). El pad es el
  // núcleo en mayúsculas y la clave de unicidad es su forma plana (así «La Marina» y «A Marina» cuentan como el mismo).
  function core(T) { return String(T).replace(/^(L'|al-)/, '').replace(/^(El|La|Los|Las|Els|Les|Il|Lo|I|Gli|Le|O|A|Os|As|Het|De|The)\s+/, ''); }
  function coreKey(T) { return flat(core(T)); }
  function rawT(raw) { return raw.charAt(0) === '!' ? (raw.slice(1).split('|')[1] || raw.slice(1)) : raw; }
  /** Pad de una playa que repite el topónimo de la pista del mismo club: el nombre entero sin artículos ni preposiciones. */
  var PREP = { de: 1, del: 1, dels: 1, la: 1, las: 1, los: 1, el: 1, els: 1, les: 1, le: 1, di: 1, dei: 1, degli: 1, della: 1, delle: 1, dello: 1, il: 1, lo: 1, i: 1, gli: 1,
    des: 1, du: 1, do: 1, da: 1, dos: 1, das: 1, o: 1, a: 1, os: 1, as: 1, der: 1, die: 1, het: 1, the: 1, of: 1 };
  function stripFull(full) {
    return String(full).replace(/(^|\s)(dell|l|d|de l)'/gi, ' ').replace(/-/g, ' ').split(/\s+/).filter(function (w) { return w && !PREP[w.toLowerCase()]; }).join(' ');
  }
  // Topónimos marítimos (fuera en países sin costa) y urbanos (fuera en playas naturales: «Cala Barrio Alto», «Playa La Estación»).
  var MARITIME = {}, URBAN = {};
  sp('El Faro|El Rompeolas|La Marina|El Far|Mar Blava|Les Salines|Il Faro|Il Porto|La Darsena|La Lanterna|Le Saline|O Farol|O Cais|A Marina|Brisa do Mar|' +
    'Le Port|La Digue|La Falaise|Hafenkante|Leuchtturm|Zeezicht|Het Anker|De Kade|Het Baken|Przy Latarni|Fener|Liman|İskele|Mavi Koy|Martı|Mayak|Prichal|' +
    'Pristan|Lukomorye|Chaika|Fanari|Limani|Thalassa|Pristanište|Kej|Svetilnik|Farul|Pescăruș|Harbor Point|Lighthouse|Cypress Bay|Sandpiper|Dagat|' +
    'Dalampasigan|Minato-hama|Kaigara-cho|al-Bahr|al-Manara|al-Fanar|al-Marsa|al-Murjan|Darya|Sahel|Haibin|Badaro').forEach(function (t) { MARITIME[t] = 1; });
  sp('Barrio Alto|La Estación|La Calzada|El Raval|La Bòbila|El Safareig|Borgo Nuovo|La Stazione|Il Rione|Le Mura|Le Logge|Le Fornaci|Le Torri|A Estação|' +
    'Bairro Novo|A Torre|Vila Nova|Cidade Nova|O Coreto|Vila Verde|La Gare|Le Bourg|Le Clos|Holzmarkt|Brückenfeld|Brunnenhof|Molenwijk|Hikari-machi|' +
    'Shin-machi|Kawa-machi|Yanagi-cho|Hinode-cho|Bagong Bayan|Elm Park|Most|U Mostu|Ob Mostu|Pod Gradom|Przy Moście|Podul Vechi|La Torre|El Torreón').forEach(function (t) { URBAN[t] = 1; });
  var NATURAL = { open: 1, cove: 1, tropical: 1, desert: 1, dunes: 1, lake: 1 };
  /** ¿Encaja el topónimo con el tipo de sede, el escenario y la costa del país? */
  function fitsT(lang, kind, scen, T, coast) {
    if (!coast && MARITIME[T]) return false;
    if (kind !== 'hall') {
      if (NATURAL[scen] && URBAN[T]) return false;
      // pl/cs: los topónimos adjetivos («Lipowa», «Lipová») concuerdan con «Hala», no con «Plac» o «Koupaliště»
      if ((lang === 'pl' && /a$/.test(T) || lang === 'cs' && /á$/.test(T)) && T.indexOf(' ') < 0) return false;
    }
    return true;
  }
  function fmtName(L, f, T) { var join = JOIN[L.j] || JOIN.id; return cap(f.replace('{T}', T).replace('{dT}', join(T))); }
  /** Nombre de la sede. o = {lang, kind, tier, scen, seed, coast, own (núcleo → 'cc|lang') y cc, used {núcleo: 1} del país (pista y playa),
   *  names {nombre: 1} y pads {pad: 1} del país, reuse (topónimo de la pista del mismo club, para su playa)}.
   *  Devuelve {name, short, pad, tries, deny, wink}. */
  function makeName(o) {
    var lang = o.lang, kind = o.kind, tier = o.tier, scen = o.scen, seed = o.seed, L = LANG[lang] || LANG.es, denyN = 0, mine = o.cc + '|' + lang;
    var fmts, f, full, pad, r;
    // playa: primero el topónimo de la pista del mismo club («Polideportivo El Bajo» → «Balneario El Bajo»)
    if (kind !== 'hall' && o.reuse && fitsT(lang, kind, scen, o.reuse, o.coast)) {
      r = rng(seed, 'name#reuse'); fmts = L.b[scen] || L.b.open; f = pick(r, fmts);
      var twr = typeWord(f);
      full = fmtName(L, f, o.reuse); pad = up(stripFull(full));
      if (!(twr.length >= 3 && flat(o.reuse).indexOf(twr) >= 0) && full.length <= 30 && pad.length <= 18 && !(o.names && o.names[full]) && !(o.pads && o.pads[pad]) && !denied(full)) {
        return { name: full, short: o.reuse, pad: pad, tries: 0, deny: 0, wink: false };
      }
    }
    // pase 0: núcleo propio y libre; pase 1 (solo si el país agotó sus núcleos): núcleo propio aunque lo lleve otro club del país,
    // con el nombre entero sin artículos como pad. Nunca se usa un núcleo de otro país (los nombres del mundo no pueden chocar).
    for (var pass = 0; pass < 2; pass++) {
      for (var n = 0; n < 400; n++) {
        r = rng(seed, 'name#' + n + (pass ? '#dup' : ''));
        var wink = kind === 'hall' && L.w.length && r() < (tier <= 1 ? 0.22 : 0.12), raw = wink ? pick(r, L.w) : pick(r, L.T), T = rawT(raw), key = coreKey(T);
        if (T.length > 12) continue;
        if (o.own && o.own[key] !== mine) continue;          // núcleo de otro país (o del mismo país en otra lengua)
        if (!pass && o.used && o.used[key]) continue;
        if (raw.charAt(0) === '!') {
          if (kind !== 'hall') continue;
          full = raw.slice(1).split('|')[0]; pad = up(full).length <= 18 ? up(full) : up(core(T));
        } else {
          if (!fitsT(lang, kind, scen, T, o.coast)) continue;
          if (kind === 'hall') {
            fmts = L.k.filter(function (k) { return tier >= k[1] && tier <= k[2]; }).map(function (k) { return k[0]; });
            if (!fmts.length) fmts = L.k.map(function (k) { return k[0]; });
          } else fmts = L.b[scen] || L.b.open;
          f = pick(r, fmts);
          var tw = typeWord(f);
          if (tw.length >= 3 && flat(T).indexOf(tw) >= 0) continue;
          full = fmtName(L, f, T);
          for (var q = 0; full.length > 30 && q < fmts.length; q++) full = fmtName(L, fmts[q], T);
          pad = up(core(T));
          if (pass) { pad = up(stripFull(full)); if (pad.length > 18) continue; }
        }
        if (full.length > 30) continue;
        if (o.names && o.names[full]) continue;
        if (o.pads && o.pads[pad]) continue;
        if (denied(full)) { denyN++; continue; }
        if (o.used) o.used[key] = 1;
        return { name: full, short: T, pad: pad.slice(0, 18), tries: n + pass * 400, deny: denyN, wink: !!wink };
      }
    }
    var fT = String(seed % 997), fF = kind === 'hall' ? L.k[0][0] : (L.b[scen] || L.b.open)[0];
    return { name: fmtName(L, fF, fT), short: fT, pad: up(stripFull(fmtName(L, fF, fT))).slice(0, 18), tries: 800, deny: denyN, wink: false };
  }
  // Reparto de núcleos entre países que comparten lengua (es/esar/espe/ca, de AT CH, fr BE CH CA, nl BE, it CH, pt/ptbr…): cada núcleo
  // tiene UN dueño (país + lengua), así los nombres y pads de dos países no pueden coincidir y cada país se calcula solo, sin mirar a
  // los demás. Reparto voraz por necesidad (clubes del país en esa lengua), en el orden fijo de LANG y de los pools.
  function langsOf(cc) { return cc === 'ES' ? ['es', 'ca'] : cc === 'BE' ? ['nl', 'fr'] : cc === 'CH' ? ['de', 'fr', 'it'] : cc === 'CA' ? ['enca', 'fr'] : [(ENV[cc] || ENV.XX).lang]; }
  var OWN = null;
  function ownership() {
    if (OWN) return OWN;
    var I = leagueIndex(), need = {}, cnt = {}, byLang = {}, own = {};
    CCS.forEach(function (cc) { langsOf(cc).forEach(function (l) { var p = cc + '|' + l; need[p] = 0; cnt[p] = 0; (byLang[l] = byLang[l] || []).push(p); }); });
    I._order.forEach(function (cc) { (I[cc] || []).forEach(function (k) { var p = cc + '|' + langOf(cc, k.city, 0); if (need[p] != null) need[p]++; }); });
    var langsByKey = {}, keys = [];
    Object.keys(LANG).forEach(function (l) {
      LANG[l].T.concat(LANG[l].w).forEach(function (raw) { var k = coreKey(rawT(raw)); if (!langsByKey[k]) { langsByKey[k] = []; keys.push(k); } if (langsByKey[k].indexOf(l) < 0) langsByKey[k].push(l); });
    });
    keys.forEach(function (k) {
      var best = null, bestS = -1;
      langsByKey[k].forEach(function (l) { (byLang[l] || []).forEach(function (p) { var s = (2 * need[p] + 3) / (cnt[p] + 1); if (s > bestS) { bestS = s; best = p; } }); });
      if (best) { own[k] = best; cnt[best]++; }
    });
    if (I._ready) OWN = own;
    return own;
  }
  function chantOf(lang, short, seed) {
    var L = LANG[lang] || LANG.es, r = rng(seed, 'chant');
    for (var n = 0; n < 8; n++) { var c = pick(r, L.ch).replace('{S}', up(short)); if (!gendered(c)) return c; }
    return up(short);
  }

  // ------------------------------------------------------------------ arquetipos de pista
  var ARCH = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9'];
  var ALLOW = [['H1', 'H2', 'H3', 'H4', 'H5'], ['H1', 'H2', 'H3', 'H4', 'H5', 'H7'], ['H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'], ['H6', 'H7', 'H8', 'H9']];
  var STYLE_W = {
    east: { H2: 2, H4: 2 }, alpnord: { H5: 2.5 }, med: { H2: 1.5, H7: 1.5 }, trop: { H3: 1.5, H6: 1.5 }, jpkr: { H1: 2, H6: 1.5 },
    gulf: { H6: 2, H9: 2 }, us: { H1: 2, H3: 2 }, latam: { H2: 1.5, H3: 1.5, H7: 1.5 }
  };
  var PALAU = { H8: 1, H9: 1 };
  // Arquetipos sin constructor propio: se montarían con el más cercano. F3: los nueve tienen constructor (H1-H7 en
  // js/venue-gen-hall.js, H8/H9 piel de Palau), así que la tabla queda VACÍA (sirve para arquetipos futuros). Solo la leen el
  // constructor y la prueba de variedad; la receta NO depende de ella.
  var BUILD_AS = {};
  /** Arquetipo que se construye de verdad para una receta de pista (el suyo, o el de BUILD_AS si aún no tuviera constructor). */
  function builtArch(sp) { var b = BUILD_AS[sp.arch]; return !b ? sp.arch : typeof b === 'string' ? b : b[sp.p.roof] || b[Object.keys(b)[0]]; }
  function allowed(tier, intl) { var a = ALLOW[clamp(tier, 0, 3)].slice(); if (intl && a.indexOf('H9') < 0) a.push('H9'); return a; }
  function archW(style, a) { var w = STYLE_W[style]; return (w && w[a]) || 1; }
  var STANDS_BY_TIER = [['none', 'one'], ['one', 'two'], ['two', 'U'], ['bowl']];
  function backOpts(arch, style) {
    if (PALAU[arch]) return ['led', 'pena', 'mural'];
    var o = ['mural', 'letters', 'pena'];
    if (arch === 'H1' || arch === 'H2' || arch === 'H3' || arch === 'H4') o.push('wallbars');
    if (arch === 'H5' || arch === 'H6' || style === 'alpnord') o.push('view');
    if (style === 'jpkr') o.push('stage');
    return o;
  }
  function roofOpts(arch) { return arch === 'H3' ? ['gable', 'flat'] : arch === 'H7' ? ['octagon', 'domelow'] : [{ H1: 'saw', H2: 'barrel', H4: 'folded', H5: 'glulam', H6: 'louvre', H8: 'palau', H9: 'dome' }[arch]]; }
  function lightOpts(tier, arch, clima) {
    var sunny = clima === 'med' || clima === 'trop' || clima === 'arid' ? 2 : clima === 'templ' ? 1.4 : 0.8;
    var cloudy = clima === 'oce' || clima === 'cold' ? 1.6 : clima === 'cont' ? 1.2 : 0.6;
    var o = [['sun', PALAU[arch] ? 0 : sunny], ['cloudy', PALAU[arch] ? 0 : cloudy], ['sodium', tier <= 1 ? 1 : 0.5], ['led', tier >= 2 ? 1.6 : 0.8]];
    if (tier >= 3) o.push(['show', PALAU[arch] ? 2 : 1]);
    return o;
  }
  function drawHallTpl(r, tier, env, onlyArchs) {
    var al = allowed(tier).filter(function (a) { return !onlyArchs || onlyArchs.indexOf(a) >= 0; });
    if (!al.length) al = allowed(tier);
    var arch = wpick(r, al.map(function (a) { return [a, archW(env.style, a)]; }));
    return { arch: arch, tier: tier, flavor: r() < 0.6 ? env.style : '', back: pick(r, backOpts(arch, env.style)),
      light: wpick(r, lightOpts(tier, arch, env.clima)), roof: pick(r, roofOpts(arch)), stands: PALAU[arch] ? 'bowl' : pick(r, STANDS_BY_TIER[tier]) };
  }
  function tplDist(a, b) {
    return (a.arch !== b.arch ? 3 : 0) + (a.back !== b.back ? 2 : 0) + (a.light !== b.light ? 2 : 0) + (a.flavor !== b.flavor ? 1 : 0) +
      (a.roof !== b.roof ? 1 : 0) + (a.stands !== b.stands ? 1 : 0);
  }

  // ------------------------------------------------------------------ escenarios de playa
  var SCEN_BY_CLIMA = {
    med: ['open', 'cove', 'port', 'plaza', 'river'], oce: ['dunes', 'port', 'lake', 'plaza', 'open'], cold: ['dunes', 'port', 'lake', 'plaza', 'open'],
    cont: ['lake', 'river', 'plaza', 'port'], trop: ['tropical', 'open', 'cove', 'port', 'plaza'], arid: ['desert', 'open', 'port', 'plaza'],
    templ: ['open', 'port', 'cove', 'river', 'plaza']
  };
  var LAKE_CC = { AT: 1, CH: 1, CZ: 1, RS: 1 };
  var VEG_BY_CLIMA = { med: ['palm', 'pine', 'olive'], oce: ['pine', 'duneGrass', 'birch'], cont: ['birch', 'reeds', 'pine'], cold: ['birch', 'pine', 'reeds'],
    trop: ['palm', 'palm', 'agave'], arid: ['agave', 'palm'], templ: ['palm', 'pine', 'duneGrass'] };
  var HUTS = ['wood', 'container', 'straw', 'kiosk', 'tent'];
  var LAYERS_BY_SCEN = {
    open: ['city', 'mountain', 'islands', 'cliff'], cove: ['cliff', 'mountain', 'islands'], port: ['city', 'mountain'], lake: ['mountain', 'city'],
    plaza: ['city', 'city2'], river: ['city', 'mountain'], tropical: ['jungle', 'mountain', 'islands'], dunes: ['dunes', 'city'], desert: ['dunes', 'city', 'mountain']
  };
  function scenAllowed(cc, env) {
    var a = (SCEN_BY_CLIMA[env.clima] || SCEN_BY_CLIMA.med).slice();
    if (!env.coast) a = a.filter(function (s) { return s !== 'open' && s !== 'cove' && s !== 'dunes' && s !== 'tropical'; });
    return a;
  }
  function drawBeachTpl(r, tier, cc, env, onlyScen, lvlXX) {
    var al = scenAllowed(cc, env).filter(function (s) { return !onlyScen || onlyScen.indexOf(s) >= 0; });
    if (!al.length) al = scenAllowed(cc, env);
    var scen = wpick(r, al.map(function (s) {
      var w = 1;
      if (lvlXX != null) { if (lvlXX <= 1 && (s === 'open' || s === 'river' || s === 'plaza')) w = 2; if (lvlXX >= 3 && (s === 'port' || s === 'cove')) w = 2; }
      return [s, w];
    }));
    var night = (lvlXX != null ? lvlXX >= 4 : tier >= 3) && r() < 0.4;
    var lay = LAYERS_BY_SCEN[scen], nL = ri(r, 2, Math.min(4, lay.length + 1)), layers = [];
    for (var i = 0; i < nL; i++) layers.push(lay[(i + Math.floor(r() * lay.length)) % lay.length]);
    layers = layers.filter(function (x, i) { return layers.indexOf(x) === i; }).sort();
    if (layers.length < 2) layers = [lay[0], lay[1] || 'mountain'].sort();
    var veg = scen === 'desert' ? 'agave' : scen === 'dunes' ? 'duneGrass' : scen === 'lake' || scen === 'river' ? pick(r, ['reeds', 'birch', 'pine']) : pick(r, VEG_BY_CLIMA[env.clima] || VEG_BY_CLIMA.med);
    var hut = env.clima === 'trop' ? pick(r, ['straw', 'wood', 'kiosk']) : env.clima === 'arid' ? pick(r, ['tent', 'kiosk']) : scen === 'port' ? pick(r, ['container', 'kiosk']) : pick(r, HUTS);
    return { scen: scen, tier: tier, hour: night ? 'noche' : (r() < 0.6 ? 'dia' : 'tarde'), backdrop: layers.join('+'), veg: veg, hut: hut };
  }
  function tplDistB(a, b) {
    return (a.scen !== b.scen ? 3 : 0) + (a.backdrop !== b.backdrop ? 2 : 0) + (a.hour !== b.hour ? 2 : 0) + (a.veg !== b.veg ? 1 : 0) + (a.hut !== b.hut ? 1 : 0);
  }

  // ------------------------------------------------------------------ club → datos normalizados
  function kitOf(club) {
    var k = club.kit || {}, c = club.colors || {};
    var h1 = toRGB(k.shirt != null ? k.shirt : c.shirt) || [0.85, 0.15, 0.18];
    var h2 = toRGB(k.accent != null ? k.accent : k.shirt2 != null ? k.shirt2 : c.shirt2 != null ? c.shirt2 : c.accent) || [1, 1, 1];
    var a = toRGB(k.libero != null ? k.libero : c.libero) || null;
    return { h1: hex(h1), h2: hex(h2), a: a ? hex(a) : '' };
  }
  function tierOfP(p) { return p < 62 ? 0 : p < 74 ? 1 : p < 85 ? 2 : 3; }
  // Rango de media de cada circuito de playa (copia de VB.Career.beach.LEAGUES[l].ovr; la prueba comprueba que coinciden). Sirve para
  // sacar q de la ficha (clubInfo da ovr = L.ovr[0] + (L.ovr[1] − L.ovr[0])·q, pero no q).
  var XX_OVR = [[28, 40], [38, 50], [48, 61], [58, 71], [68, 84]];
  function beachQ(club) {
    if (club.q != null && isFinite(+club.q)) return clamp(+club.q, 0, 1);
    var R = XX_OVR[clamp(+club.lvl | 0, 0, 4)]; return isFinite(+club.ovr) && club.ovr != null ? clamp((+club.ovr - R[0]) / (R[1] - R[0]), 0, 1) : 0.5;
  }
  function prestige(club, kind) {
    if (kind === 'beach' && club.cc == null && club.lvl != null) return clamp(20 * clamp(+club.lvl | 0, 0, 4) + 10 * beachQ(club), 0, 100);
    var s = isFinite(+club.strength) && club.strength != null ? +club.strength : null, o = isFinite(+club.ovr) && club.ovr != null ? +club.ovr : null;
    if (s == null && o == null) return 60;
    if (s == null) s = o; if (o == null) o = s;
    return 0.5 * s + 0.5 * o;
  }
  function sanitize(s) { return String(s).replace(/[^A-Za-z0-9]+/g, '').slice(0, 8) || 'X'; }

  // ------------------------------------------------------------------ índice de VB.Leagues y mundo
  var IDX = null;   // {cc: [{cc, name, base, sponsor, short, city, lvl, strength, ovr, colors, key, order}]}
  function leagueIndex() {
    if (IDX) return IDX;
    // Sin VB.Leagues (venue-gen.js se carga antes que leagues.js) se devuelve un índice vacío SIN guardarlo: una spec pedida antes de
    // tiempo no envenena la caché, y en cuanto llega leagues.js los clubes se reconocen igual que en cualquier otra sesión.
    var L = VB.Leagues, order = 0, I = { _order: [], _ready: false };
    if (!L || !L.regions || !L.regions.length) return I;
    IDX = I; I._ready = true;
    L.regions.forEach(function (rg) {
      (rg.countries || []).forEach(function (co) {
        var cc = String(co.code);
        if (!IDX[cc]) { IDX[cc] = []; IDX._order.push(cc); }
        (co.divisions || []).forEach(function (d) {
          (d.clubs || []).forEach(function (k) {
            if (!k || !k.name) return;
            IDX[cc].push({ cc: cc, base: String(k.name), sponsor: k.sponsor ? String(k.sponsor) : '', short: String(k.short || '').toUpperCase(), city: String(k.city || ''),
              lvl: d.lvl | 0, strength: +d.strength, ovr: +k.ovr, colors: k.colors || {}, key: cc + ':' + String(k.short || '').toUpperCase(), order: order++,
              nBase: norm(k.name), nFull: norm((k.sponsor ? k.sponsor + ' ' : '') + k.name), nCity: norm(k.city) });
          });
        });
      });
    });
    return IDX;
  }
  var FIND = {};
  /** Club de VB.Leagues que corresponde a una ficha (nombre con o sin patrocinador; las siglas pueden venir cambiadas). */
  function findClub(club) {
    var mk = (club.cc || '') + '|' + (club.name || '') + '|' + (club.city || '') + '|' + (club.short || '');
    if (Object.prototype.hasOwnProperty.call(FIND, mk)) return FIND[mk];
    var I = leagueIndex(), cc = club.cc ? String(club.cc).toUpperCase() : '', lists = cc ? [I[cc] || []] : I._order.map(function (c) { return I[c]; });
    var n = norm(club.name), city = norm(club.city), sh = String(club.short || '').toUpperCase(), best = null, bestL = 0;
    for (var li = 0; li < lists.length && !best; li++) {
      var L = lists[li];
      for (var i = 0; i < L.length; i++) {
        var k = L[i], b = k.nBase;
        if (city && k.nCity !== city) continue;
        if (n === b || n === k.nFull) { best = k; bestL = 1e9; break; }
        if (b && b.length > bestL && n.slice(-b.length - 1) === ' ' + b) { best = k; bestL = b.length; }
      }
    }
    if (!best && cc && sh) { var L2 = I[cc] || []; for (var j = 0; j < L2.length; j++) if (L2[j].short === sh && (!city || L2[j].nCity === city)) { best = L2[j]; break; } }
    if (I._ready) FIND[mk] = best;
    return best;
  }
  function seedOf(kind, cc, name, city, salt) { return fnv('v' + V + '|' + kind + '|' + cc + '|' + norm(name) + '|' + norm(city) + (salt ? '|' + salt : '')); }

  /** Roster de plantillas de un país (pista o playa), con el tier de cada club. Cacheado. */
  var ROSTER = {};
  function rosterOf(cc, kind) {
    var key = cc + '|' + kind; if (ROSTER[key]) return ROSTER[key];
    var I = leagueIndex(), clubs = I[cc] || [], env = ENV[cc] || ENV.XX, n = clubs.length;
    // tier de cada club + empuje relativo (los 2 mejores ovr del país, como mínimo tier 2)
    var tiers = clubs.map(function (k) { return tierOfP(0.5 * k.strength + 0.5 * k.ovr); });
    var byOvr = clubs.map(function (k, i) { return i; }).sort(function (a, b) { return clubs[b].ovr - clubs[a].ovr || a - b; });
    for (var t = 0; t < Math.min(2, byOvr.length); t++) tiers[byOvr[t]] = Math.max(2, tiers[byOvr[t]]);
    var K = Math.max(6, Math.ceil(n / 2));
    var sorted = clubs.map(function (k, i) { return i; }).sort(function (a, b) { return tiers[b] - tiers[a] || a - b; });
    var r = rng(fnv('roster|v' + V + '|' + key), 'tpl'), tpls = [], per = Math.max(4, Math.floor(200 / K)), distinct = {}, nd = 0;
    var need = kind === 'hall' ? 5 : Math.min(5, scenAllowed(cc, env).length);
    for (var j = 0; j < K; j++) {
      var tier = n ? tiers[sorted[Math.min(n - 1, Math.floor((j + 0.5) * n / K))]] : 1, best = null, bestD = -1;
      var only = null;
      if (nd < need) {
        var pool = kind === 'hall' ? allowed(tier) : scenAllowed(cc, env);
        only = pool.filter(function (a) { return !distinct[a]; });
        if (!only.length) only = null;
      }
      if (kind === 'beach' && LAKE_CC[cc] && j === 0) only = ['lake'];
      for (var a = 0; a < per; a++) {
        var c = kind === 'hall' ? drawHallTpl(r, tier, env, only) : drawBeachTpl(r, tier, cc, env, only, null), d = 99;
        for (var q = 0; q < tpls.length; q++) d = Math.min(d, kind === 'hall' ? tplDist(c, tpls[q]) : tplDistB(c, tpls[q]));
        if (d > bestD) { best = c; bestD = d; }
        if (d >= 5) break;
      }
      var ak = kind === 'hall' ? best.arch : best.scen;
      if (!distinct[ak]) { distinct[ak] = 1; nd++; }
      tpls.push(best);
    }
    var R = { cc: cc, kind: kind, K: K, tpls: tpls, tiers: tiers, clubs: clubs };
    if (I._ready) ROSTER[key] = R;
    return R;
  }
  function compatible(tpl, tier, kind) {
    if (kind === 'hall') return allowed(tier).indexOf(tpl.arch) >= 0;
    return tpl.hour !== 'noche' || tier >= 3;
  }

  // ------------------------------------------------------------------ paleta
  function palette(kit, env, city, seed) {
    var q1 = hexHsl(kit.h1), q2 = hexHsl(kit.h2), qa = kit.a ? hexHsl(kit.a) : null, cols = [];
    if (!neutral(q1)) cols.push(q1); if (!neutral(q2)) cols.push(q2);
    var fromCountry = false;
    if (!cols.length) { var hh = env.hues[fnv('hue|' + norm(city)) % env.hues.length]; cols.push([hh, 0.55, 0.42]); fromCountry = true; }
    var main = cols.length > 1 && cols[1][1] > cols[0][1] ? cols[1] : cols[0], other = cols.length > 1 ? (main === cols[0] ? cols[1] : cols[0]) : (qa && !neutral(qa) ? qa : null);
    return { main: main, other: other, q1: q1, q2: q2, qa: qa, fromCountry: fromCountry, kits: [kit.h1, kit.h2, kit.a].filter(Boolean) };
  }
  /** Color de superficie: tono del club con S y L acotadas, nunca idéntico al kit. */
  function surf(q, sMin, sMax, lMin, lMax, kits) {
    var c = [q[0], clamp(q[1], sMin, sMax), clamp(q[2], lMin, lMax)];
    if (isYellow(c[0]) && c[2] > 0.48) c[2] = 0.48;
    var h = hslHex(c);
    for (var i = 0; i < 4 && kits.indexOf(h) >= 0; i++) { c[2] = clamp(c[2] + (c[2] > (lMin + lMax) / 2 ? -0.03 : 0.03), 0, 1); h = hslHex(c); }
    return h;
  }
  /** CIELAB (D65) de un color [r, g, b] 0..1 (sRGB) y ΔE76 entre dos Lab. */
  function labRGB(c) {
    var r = lin(c[0]), g = lin(c[1]), b = lin(c[2]), x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fy = f(y); return [116 * fy - 16, 500 * (f(x) - fy), 200 * (fy - f(z))];
  }
  function dLab(A, B) { var a = A[0] - B[0], b = A[1] - B[1], c = A[2] - B[2]; return Math.sqrt(a * a + b * b + c * c); }
  function dE76(a, b) { return dLab(labRGB(toRGB(a)), labRGB(toRGB(b))); }
  /** Superficie SEPARADA de las camisetas (F2, revisión): si el color queda a ΔE76 < want de alguna (shirt, shirt2), se busca el
   *  más parecido (mismo tono; desaturar o mover L dentro de sus rangos, y si no basta, girar el tono hasta ±16°) que llegue a
   *  want; si ninguno llega, el más alejado. Pura y determinista (no tira del PRNG: no mueve ningún otro eje). */
  var APART = {};   // (memo: la misma búsqueda se repite al recalcular las sedes de un país para los gemelos)
  function apart(h, shirts, want, sMin, sMax, lMin, lMax, extra, wantX, tintX) {
    var key = [h, shirts.join(), want, sMin, sMax, lMin, lMax, extra ? extra.join() : '', wantX, tintX ? tintX.join() : ''].join('|');
    if (Object.prototype.hasOwnProperty.call(APART, key)) return APART[key];
    return (APART[key] = apartRaw(h, shirts, want, sMin, sMax, lMin, lMax, extra, wantX, tintX));
  }
  function apartRaw(h, shirts, want, sMin, sMax, lMin, lMax, extra, wantX, tintX) {
    // (tintX: luz de la sede [r, g, b]; la distancia a extra se mide con los dos colores bajo esa luz: con sodio un cian se ve verde agua)
    function tn(c) { return tintX ? [c[0] * tintX[0], c[1] * tintX[1], c[2] * tintX[2]] : c; }
    var SL = shirts.map(function (x) { return labRGB(toRGB(x)); }), XL = (extra || []).map(function (x) { return labRGB(tn(toRGB(x))); }), wx = wantX || want;
    function mdOf(L, A) { var m = 1e9; for (var i = 0; i < A.length; i++) m = Math.min(m, dLab(L, A[i])); return m; }
    // (con extra: la nota es la peor de las dos razones distancia/umbral; ≥ 1 = vale)
    function md(c) { var a = SL.length ? mdOf(labRGB(c), SL) / want : 1e9, b = XL.length ? mdOf(labRGB(tn(c)), XL) / wx : 1e9; return Math.min(a, b) * want; }
    if ((!SL.length && !XL.length) || md(toRGB(h)) >= want) return h;
    var q = hexHsl(h), best = null, bestC = 1e9, far = h, farD = md(toRGB(h));
    for (var dh = 0; dh <= 16; dh += 4) for (var sg = -1; sg <= 1; sg += 2) {
      if (!dh && sg > 0) continue;
      var hh = (q[0] + sg * dh + 360) % 360;
      for (var S = sMin; S <= sMax + 1e-9; S += 0.05) for (var Lq = lMin; Lq <= lMax + 1e-9; Lq += 0.02) {
        if (isYellow(hh) && Lq > 0.48) continue;
        var cost = Math.abs(S - q[1]) + 2 * Math.abs(Lq - q[2]) + dh / 40 + (XL.length && Lq > q[2] ? 4 * (Lq - q[2]) : 0);   // (lejos de la pelota, mejor más oscuro que más claro)
        if (cost >= bestC) continue;
        var rgb = toRGB(hex(hsl2rgb([hh, S, Lq]))), d = md(rgb);   // (redondeado a 8 bits: lo que se pinta)
        if (d >= want) { bestC = cost; best = [hh, S, Lq]; } else if (d > farD) { farD = d; far = hex(rgb); }
      }
      if (best) return hslHex(best);
    }
    return far;
  }
  /** PELOTA (15-nov-2026, tools/balltest.js; «¿hay algún pabellón en el que se vea mal la pelota?»): el balón clásico es turquesa
   *  #1cc4b4 / turquesa oscuro #0b8a86 / crema. Las superficies grandes que quedan DETRÁS de la pelota en la cámara de juego (pista,
   *  zona libre, pared, zócalo, asientos y franja de letras del fondo) se mantienen a ΔE76 ≥ SEP.ball de los dos turquesas: una pista
   *  verde menta (JP:BRH #2dd2ab), una zona libre verde con sodio (ES:NIV, ES:VEG, AR:FOR) o una franja de letras turquesa (GR:DKS)
   *  dejaban la pelota con solo su contorno. */
  // (el turquesa claro y el medio entre él y el oscuro, GR:DKS #35a0b6; el oscuro #0b8a86 no: es el panel pequeño y con él los verdes
  // oscuros, que se ven bien, huían a un verde menta claro, que se ve peor: CN:FUJ, CA:SAS, PT:LEA)
  var BALL = ['#1cc4b4', '#14a79d'];
  function ballD(h, tint) {
    function tn(c) { return tint ? [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]] : c; }
    var L = labRGB(tn(toRGB(h))), m = 1e9; for (var i = 0; i < BALL.length; i++) m = Math.min(m, dLab(L, labRGB(tn(toRGB(BALL[i]))))); return m;
  }
  var SODIUM = [1, 0.81, 0.54];   // (#ffcf8a, la luz de sodio de hallSpec)
  var NEUTRAL_FREE = [['#5d6b7a', 210], ['#3f7f5a', 145], ['#9a7450', 30], ['#6b6f75', 220]];

  // ------------------------------------------------------------------ spec de pista
  var SEP = { court: 26, seat: 14, ball: 26, ballC: 22, ballP: 16, ballD: 20, ballW: 32 };   // ΔE76 mínimo contra las camisetas del club (pista; asientos de la grada) y contra la pelota
  // (BALL: zona libre 26, pared 32; asientos y acento 22; pista 16, solo si casi calca la pelota: al huir, un verde se iba a menta claro; que son el color del club y solo se tocan si casi calcan la pelota; zócalo 20)
  function sector(h) { return Math.floor((((h % 360) + 360) % 360) / 45); }
  function lBucket(l) { return l < 0.37 ? 0 : l < 0.45 ? 1 : 2; }
  function hallSpec(c, tpl, salt) {
    var s = c.seed, sx = salt ? '#' + salt : '', env = c.env, tier = c.tier, arch = tpl.arch, palau = !!PALAU[arch], p = c.p;
    var pal = palette(c.kit, env, c.city, s), kits = pal.kits, bt = tpl.light === 'sodium' ? SODIUM : null;   // (bt: luz para la distancia a la pelota)
    // reparación de gemelos (salt > 0): pista con el otro color del club (impares) y otro fondo rival (desde 2)
    if (salt % 2 === 1 && pal.other && !neutral(pal.other)) { var tmp = pal.main; pal.main = pal.other; pal.other = tmp; }
    var back = salt >= 2 ? pick(rng(s, 'back' + sx), backOpts(arch, env.style)) : tpl.back;
    // planta
    var rp = rng(s, 'plan'), wx = palau ? 30 : tier === 0 ? rr(rp, 19.5, 22) : tier === 1 ? rr(rp, 22, 26) : rr(rp, 25, 30);
    var wy = R2(Math.max(10, wx * rr(rp, 0.62, 0.78))), eave = tier <= 1 ? rr(rp, 7.5, 11) : rr(rp, 10, 16);
    // techo
    var rf = rng(s, 'roof' + sx), roof = tpl.roof, roofN = 0, pitch = 0, rise = 0;
    if (roof === 'saw') roofN = ri(rf, 4, 8); else if (roof === 'barrel') { rise = rr(rf, 2, 4.5); roofN = ri(rf, 6, 12); }
    else if (roof === 'gable') { pitch = ri(rf, 12, 25); roofN = ri(rf, 5, 11); } else if (roof === 'flat') roofN = ri(rf, 5, 11);
    else if (roof === 'folded') roofN = ri(rf, 6, 12); else if (roof === 'glulam') roofN = ri(rf, 4, 8); else if (roof === 'louvre') roofN = ri(rf, 10, 20);
    else if (roof === 'octagon') roofN = 8; else if (roof === 'domelow') roofN = ri(rf, 12, 16); else if (roof === 'dome') roofN = ri(rf, 12, 24);
    // suelo
    var rfl = rng(s, 'floor' + sx), mats = tier <= 1 ? ['synth', 'synth2', 'multi', 'maple', 'oak'] : tier === 2 ? ['maple', 'oak', 'synth', 'synth2'] : ['maple', 'oak', 'darkwood', 'synth'];
    if (tpl.flavor === 'jpkr') mats = ['maple', 'maple', 'oak'];
    var floorMat = pick(rfl, mats), multiA = floorMat === 'multi' ? rr(rfl, 0.3, 0.5) : 0, floorLogo = rfl() < 0.5;
    var shirts = [c.kit.h1, c.kit.h2].filter(Boolean);   // (las camisetas: la sede nunca se les parece; floorAdjust ya no salta con la propia)
    var rc = rng(s, 'color'), court = apart(surf(pal.main, 0.35, 0.65, 0.30, 0.52, kits), shirts, SEP.court, 0.35, 0.65, 0.30, 0.52, BALL, SEP.ballP, bt), cq = hexHsl(court), free;
    // F6 (hoja de contactos): con luz de sodio (#ffcf8a, poco azul) una pista fría (verde azulado, azul, violeta) se ve casi negra si es
    // oscura (FR:CLP, RO:GLT) o gris verdosa si está apagada (CN:BEI): S ≥ 0,55 y L entre 0,42 y 0,52, otra vez separada de las camisetas
    if (tpl.light === 'sodium' && cq[0] >= 160 && cq[0] <= 290 && (cq[2] < 0.42 || cq[1] < 0.55)) {
      court = apart(hslHex([cq[0], Math.max(cq[1], 0.55), clamp(cq[2], 0.42, 0.52)]), shirts, SEP.court, 0.55, 0.65, 0.42, 0.52, BALL, SEP.ballP, bt); cq = hexHsl(court);
    }
    var oq = pal.other ? [pal.other[0], clamp(pal.other[1], 0.35, 0.7), clamp(pal.other[2], 0.28, 0.55)] : null;
    if (oq && Math.abs(oq[2] - cq[2]) >= 0.08 && hueD(oq[0], cq[0]) >= 25 && ballD(surf(oq, 0.35, 0.7, 0.28, 0.55, kits), bt) >= SEP.ball) free = surf(oq, 0.35, 0.7, 0.28, 0.55, kits);
    else {
      // (F6: y bien separada de la pista; una verde azulada sobre verde se confundía, JP:LAF)
      var nf = NEUTRAL_FREE.filter(function (x) { return hueD(x[1], cq[0]) >= 25 && dE76(x[0], court) >= 22 && ballD(x[0], bt) >= SEP.ball; });   // (y lejos de la pelota: el verde #3f7f5a, no)
      free = pick(rc, nf.length ? nf : NEUTRAL_FREE)[0];
    }
    var line = contrast(court, '#ffffff') >= 0.35 ? '#ffffff' : contrast(court, '#1b1b1b') >= 0.35 ? '#1b1b1b' : '#ffe14d';
    // gradas y público
    var rs = rng(s, 'stand'), stands = tpl.stands, rows = palau ? 18 : stands === 'none' ? 0 : clamp(Math.round(3 + p / 100 * 15) + ri(rs, -2, 2), 2, 18);
    var standRise = rr(rs, 0.38, 0.5);
    var stTypes = tier === 0 ? ['tele', 'bleacher'] : tier === 1 ? ['tele', 'concrete', 'bleacher'] : tier === 2 ? ['concrete', 'tele'] : ['concrete', 'vip'];
    if (tpl.flavor === 'us') stTypes = ['bleacher'];
    var standType = palau ? 'palau' : stands === 'none' ? 'none' : pick(rs, stTypes);
    var seatOpts = ['solid', 'alt', 'grad', 'greyacc']; if (rows >= 8) seatOpts.push('mosaic');
    var seats = stands === 'none' ? 'none' : pick(rs, seatOpts);
    var rcw = rng(s, 'crowd'), crowd = R2(clamp(0.2 + 0.75 * Math.pow(p / 100, 1.4) + (rcw() * 2 - 1) * 0.08, 0.15, 0.95));
    if (stands === 'none') crowd = R2(Math.min(crowd, 0.3));
    var crowdMax = palau ? 0 : Math.min(650, Math.round(rows * ({ none: 0.5, one: 1, two: 2, U: 3, bowl: 4 }[stands]) * 22)) || 40;
    var kitShare = rr(rcw, 0.4, 0.7);
    var props = env.clima === 'cold' ? 'scarves' : /^(TR|RS|GR|AR)$/.test(c.cc) ? 'flags' : /^(ES|IT)$/.test(c.cc) ? 'fans' : env.style === 'jpkr' ? 'balloons' : '';
    // paredes
    var rw = rng(s, 'wall'), wallOpts = { H1: ['brick-red', 'block2', 'metal', 'concrete'], H2: ['brick-red', 'brick-yellow'], H3: ['block2', 'concrete', 'brick-yellow', 'metal'],
      H4: ['concrete'], H5: ['wood', 'stucco', 'concrete'], H6: ['concrete', 'metal'], H7: ['stucco', 'concrete', 'brick-red', 'tile'], H8: ['palau'], H9: ['palau'] }[arch];
    if (tpl.flavor === 'med' && !palau) wallOpts = ['stucco']; if (tpl.flavor === 'gulf' && !palau) wallOpts = ['tile'];
    var wall = pick(rw, wallOpts), dado = rr(rw, 1.2, 2.4), wallTint = rr(rw, 0.15, 0.3);
    var WALLC = { 'brick-red': '#9c4a36', 'brick-yellow': '#c9a66b', concrete: '#a7a59f', block2: '#bfc3c7', metal: '#8f98a3', wood: '#b0844f', stucco: '#e3dccd', tile: '#d9e4e6', palau: '#2a2d36' };
    var wallHex = mixHex(WALLC[wall], hslHex([pal.main[0], 0.5, 0.45]), wallTint);
    // (pelota: si el tinte del club acerca la pared a los turquesas, menos tinte; PL:OLS, JP:BRH)
    for (var wt = wallTint; ballD(wallHex, bt) < SEP.ballW && wt > 0.001; ) { wt = Math.max(0, wt - 0.05); wallHex = mixHex(WALLC[wall], hslHex([pal.main[0], 0.5, 0.45]), wt); }
    // ventanas y vista
    var rwi = rng(s, 'win' + sx), win = { H1: pick(rwi, ['band', 'none']), H2: 'skylight', H3: pick(rwi, ['band', 'none', 'skylight']), H4: 'band', H5: 'arches', H6: 'glass', H7: 'ring', H8: 'none', H9: 'none' }[arch];
    if (!palau && tpl.flavor === 'gulf') win = 'lattice'; if (!palau && tpl.flavor === 'trop') win = 'brise';
    var views = { med: ['city', 'mountains', 'harbor', 'palms'], oce: ['city', 'harbor'], cont: ['city', 'mountains'], cold: ['snow', 'city', 'mountains'], trop: ['palms', 'city', 'harbor'],
      templ: ['city', 'mountains', 'harbor'], arid: ['desert', 'city'] }[env.clima].slice();
    if (!env.coast) views = views.filter(function (v) { return v !== 'harbor'; });
    if (tpl.flavor === 'alpnord') views = env.clima === 'cold' ? ['snow', 'mountains'] : ['mountains'];
    var view = win === 'none' ? 'none' : views[(fnv('view|' + norm(c.city)) + Math.floor(rwi() * 7)) % views.length];
    // luz
    var rl = rng(s, 'light'), light = tpl.light, temps = { sun: [4800, 6500], cloudy: [5500, 6500], sodium: [2700, 3200], led: [5000, 6500], show: [4500, 6000] }[light];
    var tempK = Math.round(temps[0] + (temps[1] - temps[0]) * rl()), sunAz = rr(rl, 0, 360), sunEl = rr(rl, 30, 70), hemiK = rr(rl, 1.6, 2.6), floorK = rr(rl, 0.95, 1.15);
    var night = light === 'sodium' || light === 'led' || light === 'show', crowdDim = night ? rr(rl, 0.2, 0.35) : rr(rl, 0.1, 0.25);
    var lightColor = light === 'sodium' ? '#ffcf8a' : night ? '#eef4ff' : '';
    // marcador
    var rsc = rng(s, 'score' + sx), scoreOpts = tier === 0 ? (env.style === 'us' || env.style === 'latam' ? ['flip', 'segments'] : (arch === 'H1' || arch === 'H7' ? ['segments'] : ['segments', 'flip']))
      : tier === 1 ? ['led', 'segments'] : tier === 2 ? ['led'] : ['cube', 'led'];
    if (palau) scoreOpts = ['cube'];
    var score = pick(rsc, scoreOpts);
    // pancartas y banderines
    var rb = rng(s, 'banner'), nb = clamp(2 + tier * 2 + ri(rb, 0, 1), 2, 8), pennants = clamp(Math.round(((c.ovr || p) - 70) / 5) + ri(rb, -1, 1), 0, 5);
    // colores restantes
    var seatA = apart(surf(pal.main, 0.35, 0.7, 0.3, 0.55, kits), shirts, SEP.seat, 0.3, 0.7, 0.26, 0.6, BALL, SEP.ballC, bt), seatB = pal.other ? apart(surf(pal.other, 0.35, 0.7, 0.3, 0.55, kits), shirts, SEP.seat, 0.3, 0.7, 0.26, 0.6, BALL, SEP.ballC, bt) : '#7d838c';
    var accent = pal.qa && !neutral(pal.qa) ? surf(pal.qa, 0.35, 0.7, 0.3, 0.55, kits) : (pal.other ? seatB : surf([(pal.main[0] + 180) % 360, 0.5, 0.45], 0.35, 0.7, 0.3, 0.55, kits));
    accent = apart(accent, [], SEP.ballC, 0.35, 0.7, 0.3, 0.55, BALL, SEP.ballC, bt);   // (pancartas, carteles y peña del fondo: US:ORL #28a7a5)
    var dadoHex = apart(surf([pal.main[0], pal.main[1] * 0.5, 0.38], 0.12, 0.4, 0.3, 0.45, kits), [], SEP.ballD, 0.12, 0.4, 0.3, 0.45, BALL, SEP.ballD, bt);
    var sigA = [arch, tpl.flavor || '-', back, light, floorMat + '/' + sector(cq[0]) + '/' + lBucket(cq[2]), stands, roof, score, win + '/' + view];
    return {
      arch: arch, flavor: tpl.flavor || '', night: night, lights: null, sand: null,
      pal: { court: court, free: free, line: line, dado: dadoHex, wall: wallHex, seatA: seatA, seatB: seatB, accent: accent, tape: '#ffffff' },
      p: { skin: palau ? 'palau' : '', wx: wx, wy: wy, eave: eave, roof: roof, roofN: roofN, pitch: pitch, rise: rise, oculus: arch === 'H9',
        back: back, floorMat: floorMat, multiA: multiA, floorLogo: floorLogo, stands: stands, rows: rows, standRise: standRise, standType: standType, seats: seats,
        crowd: crowd, crowdMax: crowdMax, kitShare: kitShare, props: props, wall: wall, dado: dado, wallTint: wallTint, win: win, view: view,
        light: light, tempK: tempK, sunAz: sunAz, sunEl: sunEl, hemiK: hemiK, floorK: floorK, crowdDim: crowdDim, lightColor: lightColor,
        score: score, pennants: pennants, balcony: arch === 'H7' ? ri(rs, 1, 2) : 0 },
      nb: nb, sig: sigA
    };
  }

  // ------------------------------------------------------------------ spec de playa
  var SANDS = { golden: [0.96, 0.85, 0.64], coral: [0.98, 0.95, 0.88], ocre: [0.88, 0.72, 0.50], river: [0.78, 0.74, 0.66], atlantic: [0.90, 0.86, 0.74] };
  var WATER = { open: ['#1f6fa8', '#4fb3d9', '#f4fbff'], cove: ['#17607f', '#38b6c9', '#eefcff'], tropical: ['#0f7fa0', '#5fe0e0', '#ffffff'], lake: ['#2d5f5a', '#5c8f80', '#dfeee8'],
    river: ['#4a6b5a', '#7f9a7d', '#e3ece0'], port: ['#25506b', '#4a8096', '#e6f0f4'], dunes: ['#3b5f73', '#7aa3ad', '#f1f6f7'], desert: ['#1d6f8f', '#6cc6d4', '#f6fbfc'], plaza: ['#3f6f86', '#6aa0b0', '#eaf3f6'] };
  var CITY_TOP = { med: 'dome', gulf: 'minaret', jpkr: 'pagoda' };
  function hslL(rgb) { return rgb2hsl(rgb)[2]; }
  function beachSpec(c, tpl, salt) {
    var s = c.seed, sx = salt ? '#' + salt : '', env = c.env, tier = c.tier, scen = tpl.scen, pal = palette(c.kit, env, c.city, s), kits = pal.kits;
    var night = tpl.hour === 'noche';
    var rsd = rng(s, 'sand' + sx), cand = scen === 'tropical' ? ['coral'] : scen === 'desert' ? ['ocre'] : scen === 'dunes' ? ['atlantic'] : scen === 'lake' || scen === 'river' ? ['river', 'golden']
      : env.clima === 'oce' || env.clima === 'cold' ? ['atlantic', 'golden'] : env.clima === 'arid' ? ['ocre', 'golden'] : env.clima === 'trop' ? ['coral', 'golden'] : ['golden', 'atlantic'];
    var sandType = pick(rsd, cand), sand = SANDS[sandType].map(function (v) { return R2(clamp(v + (rsd() * 2 - 1) * 0.03, 0, 1)); });
    var water = WATER[scen], surfV = scen === 'open' || scen === 'dunes' || scen === 'tropical' ? rr(rsd, 0.6, 1) : scen === 'cove' || scen === 'desert' ? rr(rsd, 0.2, 0.5) : 0;
    var rv = rng(s, 'veg'), vegN = scen === 'plaza' ? ri(rv, 0, 8) : scen === 'port' ? ri(rv, 4, 16) : ri(rv, 6, 30);
    var rst = rng(s, 'stand'), blocks = clamp(tier + ri(rst, 0, 1), 0, 4), rows = blocks ? ri(rst, 2, Math.min(8, 3 + tier * 2)) : 0;
    var caps = rr(rst, 0.2, 0.6), crowd = R2(clamp(0.2 + 0.75 * Math.pow(c.p / 100, 1.4) + (rst() * 2 - 1) * 0.08, 0.15, 0.95));
    var rlg = rng(s, 'life' + sx), lifeguard = scen === 'lake' || scen === 'plaza' ? 'none' : pick(rlg, ['chair', 'tower', 'hut']);
    var rl = rng(s, 'light'), sunAz = rr(rl, 0, 360);
    // cinta: A si contrasta con la arena (ΔL ≥ 0,2); si no H1; si no, azul o coral de reserva. Nunca idéntica al kit (±0,03 de L).
    var sL = hslL(sand), tape = '';
    [c.kit.a, c.kit.h1].concat(sL > 0.62 ? ['#1f5fbf', '#c8323c'] : ['#1f5fbf', '#f0f0f0']).some(function (h) {
      if (!h) return false;
      var q = hexHsl(h), lq = q[2] > sL ? clamp(q[2] - 0.03, 0, 1) : clamp(q[2] + 0.03, 0, 1);
      if (Math.abs(lq - sL) < 0.2) { lq = q[2] > sL ? clamp(q[2] + 0.03, 0, 1) : clamp(q[2] - 0.03, 0, 1); }
      var cand2 = hslHex([q[0], q[1], lq]);
      if (kits.indexOf(cand2) >= 0) return false;
      if (Math.abs(hexHsl(cand2)[2] - sL) >= 0.2) { tape = cand2; return true; }
      return false;
    });
    if (!tape) tape = '#1f5fbf';
    var tq = hexHsl(tape), veg = tpl.veg, hut = tpl.hut, backdrop = tpl.backdrop;
    if (salt) {   // reparación de gemelos: otra vegetación, otro chiringuito y (desde 2) otro telón
      var rx = rng(s, 'fix' + sx);
      if (scen !== 'desert' && scen !== 'dunes') veg = pick(rx, scen === 'lake' || scen === 'river' ? ['reeds', 'birch', 'pine'] : VEG_BY_CLIMA[env.clima] || VEG_BY_CLIMA.med);
      hut = pick(rx, HUTS);
      if (salt >= 2) { var lay = LAYERS_BY_SCEN[scen], l2 = [lay[Math.floor(rx() * lay.length)], lay[Math.floor(rx() * lay.length)]]; if (l2[0] === l2[1]) l2[1] = l2[0] === 'mountain' ? 'city' : 'mountain'; backdrop = l2.sort().join('+'); }
    }
    var layers = backdrop.split('+'), rbk = rng(s, 'backdrop'), hasCity = layers.indexOf('city') >= 0 || layers.indexOf('city2') >= 0;
    var mountainH = layers.indexOf('mountain') >= 0 ? rr(rbk, 15, 60) : 0, cityDensity = hasCity ? rr(rbk, 0.2, 1) : 0, cityH = hasCity ? rr(rbk, 10, 120) : 0;
    var cityTop = hasCity ? (CITY_TOP[env.style] || 'belfry') : '';
    var sandHex = hex(sand), freeHex = hex(sand.map(function (v) { return v * 0.9; }));
    var sigA = [scen, tpl.hour, backdrop, sandType, scen === 'plaza' ? 'none' : scen, veg, hut, tq[1] < 0.12 ? 'n' + lBucket(tq[2]) : String(sector(tq[0]))];
    return {
      arch: scen, flavor: '', night: night, lights: night ? null : (tpl.hour === 'tarde' ? ['tarde', 'dia'] : ['dia', 'tarde']), sand: sand,
      pal: { court: sandHex, free: freeHex, line: tape, dado: surf(pal.main, 0.35, 0.7, 0.3, 0.55, kits), wall: pal.other ? surf(pal.other, 0.35, 0.7, 0.3, 0.55, kits) : '#e9e4d8',
        seatA: surf(pal.main, 0.35, 0.7, 0.3, 0.55, kits), seatB: pal.other ? surf(pal.other, 0.35, 0.7, 0.3, 0.55, kits) : '#f2f2f2',
        accent: pal.qa && !neutral(pal.qa) ? surf(pal.qa, 0.35, 0.7, 0.3, 0.55, kits) : surf([(pal.main[0] + 180) % 360, 0.55, 0.45], 0.35, 0.7, 0.3, 0.55, kits), tape: tape },
      p: { scen: scen, hour: tpl.hour, deep: water[0], shal: water[1], foam: water[2], surf: surfV, backdrop: backdrop, layers: layers.length, mountainH: mountainH,
        cityDensity: cityDensity, cityH: cityH, cityTop: cityTop, veg: veg, vegN: vegN, blocks: blocks, rows: rows, caps: caps, crowd: crowd,
        hut: hut, lifeguard: lifeguard, sunAz: sunAz },
      nb: clamp(2 + tier + ri(rst, 0, 1), 2, 8), sig: sigA
    };
  }

  // ------------------------------------------------------------------ firma y distancia
  var WH = [3, 1, 2, 2, 2, 1, 1, 1, 1], WB = [3, 2, 2, 2, 1, 1, 1, 1];
  function sigOf(x) { return x && x.sig ? x.sig : x; }
  function dist(a, b) {
    var A = sigOf(a), B = sigOf(b); if (!A || !B) return 0;
    if (A.length !== B.length) return 99;
    var hall = A.length === 9, W = hall ? WH : WB, d = 0;
    for (var i = 0; i < A.length; i++) {
      if (hall && i === 4) { var fa = A[4].split('/'), fb = B[4].split('/'); d += (fa[0] !== fb[0] ? 0.5 : 0) + (fa[1] !== fb[1] ? 1 : 0) + (fa[2] !== fb[2] ? 0.5 : 0); }
      else if (A[i] !== B[i]) d += W[i];
    }
    return d;
  }
  function sigKey(x) { var s = sigOf(x); return s ? s.join('|') : ''; }

  // ------------------------------------------------------------------ montaje de la spec
  var STATS = { deny: [], tries: [], att: [] };
  function assemble(c, body, nm, kind, chant) {
    var short = c.short, banners = [nm.pad, up(short), chant, up(c.base || c.name).slice(0, 18), chantOf(c.lang, short, c.seed + 7)];
    banners = banners.filter(function (b, i) { return b && banners.indexOf(b) === i; }).slice(0, Math.max(2, body.nb));
    var id = 'g-' + c.cc + '-' + sanitize(c.idShort || short) + (c.idHash ? '-' + c.idHash : '') + (c.idSalt ? '-s' + c.idSalt : '') + '-' + (kind === 'hall' ? 'h' : 'b') + (c.intl ? 'x' : '');
    var help = nm.name + (c.city ? ' · ' + c.city : '') + (kind === 'hall' ? ' · pista de 18 × 9' : ' · vóley playa, pista de 16 × 8');
    return {
      v: V, id: id, kind: kind, seed: c.seed, cc: c.cc, arch: body.arch, flavor: body.flavor, tier: c.tier, name: nm.name, short: nm.short, pad: nm.pad, help: help,
      night: body.night, lights: body.lights, sand: body.sand, pal: body.pal, p: body.p, txt: { banners: banners, chant: chant }, sig: body.sig
    };
  }
  function clubCtx(club, kind, opt) {
    var known = findClub(club), cc = (known ? known.cc : club.cc ? String(club.cc).toUpperCase() : 'XX'), env = ENV[cc] || ENV.XX;
    var name = known ? known.base : String(club.name || club.short || 'Club'), city = known ? known.city : String(club.city || '');
    var seed = seedOf(kind, cc, name, city, opt && opt.salt);
    var p = known ? 0.5 * known.strength + 0.5 * known.ovr : prestige(club, kind);
    var c = { known: known, cc: cc, env: env, name: name, base: name, city: city, seed: seed, p: p, tier: tierOfP(p), ovr: known ? known.ovr : +club.ovr || 0,
      short: known ? known.short : String(club.short || name.slice(0, 3)).toUpperCase(), kit: known ? kitOf({ colors: known.colors }) : kitOf(club),
      lang: langOf(cc, city, seed), lvl: club.lvl, q: club.q, id: club.id };
    c.idShort = c.short;
    if (!known) c.idHash = (seed & 0xffff).toString(16);
    // con sal, otra receta: el id lo dice (si no, el registro serviría la def equivocada para el mismo id)
    if (opt && opt.salt != null && opt.salt !== '') c.idSalt = ('000' + (fnv('salt|' + opt.salt) & 0xffff).toString(16)).slice(-4);
    return c;
  }

  // ------------------------------------------------------------------ OVERRIDES coherentes
  // El override no se copia a ciegas encima de la plantilla: si cambia arch (o scen) se vuelven a sacar los ejes que dependen de él
  // (techo, fondo rival, gradas, luz; en playa telón, vegetación y chiringuito) con el sub-flujo del club, y los valores imposibles
  // (un techo que no es de ese arquetipo, H9 fuera de tier 3, noche fuera de tier 3, un escenario que el clima no permite) se
  // rechazan y se anotan en OVERRIDE_ERRORS. La ventana sale del arquetipo en hallSpec, así que siempre encaja.
  var OVERRIDE_ERRORS = [];
  function overrideTpl(tpl, ov, kind, tier, cc, env, seed, key) {
    var t = clone(tpl), r = rng(seed, 'override');
    function bad(f, why) { var m = key + '.' + f + ': ' + why; if (OVERRIDE_ERRORS.indexOf(m) < 0) OVERRIDE_ERRORS.push(m); }
    function has(f) { return Object.prototype.hasOwnProperty.call(ov, f) && ov[f] != null; }
    if (kind === 'hall') {
      if (has('arch')) {
        if (ARCH.indexOf(ov.arch) < 0) bad('arch', ov.arch + ' no existe');
        else if (ov.arch === 'H9' && tier < 3) bad('arch', 'H9 solo en tier 3 (el club es t' + tier + ')');
        else t.arch = ov.arch;
      }
      if (has('flavor')) { if (ov.flavor === '' || ov.flavor === env.style) t.flavor = ov.flavor; else bad('flavor', ov.flavor + ' no es de ' + cc); }
      var ro = roofOpts(t.arch), bo = backOpts(t.arch, env.style);
      if (has('roof') && ro.indexOf(ov.roof) < 0) bad('roof', ov.roof + ' no encaja con ' + t.arch);
      t.roof = has('roof') && ro.indexOf(ov.roof) >= 0 ? ov.roof : ro.indexOf(t.roof) >= 0 ? t.roof : pick(r, ro);
      if (has('back') && bo.indexOf(ov.back) < 0) bad('back', ov.back + ' no encaja con ' + t.arch);
      t.back = has('back') && bo.indexOf(ov.back) >= 0 ? ov.back : bo.indexOf(t.back) >= 0 ? t.back : pick(r, bo);
      var so = PALAU[t.arch] ? ['bowl'] : tier >= 3 ? ['two', 'U', 'bowl'] : ['none', 'one', 'two', 'U'];
      if (has('stands') && so.indexOf(ov.stands) < 0) bad('stands', ov.stands + ' no encaja con ' + t.arch + '/t' + tier);
      t.stands = has('stands') && so.indexOf(ov.stands) >= 0 ? ov.stands : so.indexOf(t.stands) >= 0 ? t.stands : PALAU[t.arch] ? 'bowl' : pick(r, STANDS_BY_TIER[clamp(tier, 0, 2)]);
      var lo = lightOpts(tier, t.arch, env.clima).filter(function (x) { return x[1] > 0; }), ln = lo.map(function (x) { return x[0]; });
      if (has('light') && ln.indexOf(ov.light) < 0) bad('light', ov.light + ' no encaja con ' + t.arch + '/t' + tier);
      t.light = has('light') && ln.indexOf(ov.light) >= 0 ? ov.light : ln.indexOf(t.light) >= 0 ? t.light : wpick(r, lo);
    } else {
      var sa = scenAllowed(cc, env);
      if (has('scen')) {
        if (sa.indexOf(ov.scen) < 0) bad('scen', ov.scen + ' no lo permite el clima de ' + cc);
        else if (ov.scen !== t.scen) { var d = drawBeachTpl(r, tier, cc, env, [ov.scen], null); d.hour = t.hour; t = d; }
      }
      if (has('hour')) { if (['dia', 'tarde', 'noche'].indexOf(ov.hour) < 0 || (ov.hour === 'noche' && tier < 3)) bad('hour', ov.hour + ' (noche solo en tier 3)'); else t.hour = ov.hour; }
      if (has('veg')) { if (RANGES.beach.veg.indexOf(ov.veg) < 0) bad('veg', ov.veg); else t.veg = ov.veg; }
      if (has('hut')) { if (HUTS.indexOf(ov.hut) < 0) bad('hut', ov.hut); else t.hut = ov.hut; }
      if (has('backdrop')) {
        var ls = String(ov.backdrop).split('+'), okL = ls.length >= 2 && ls.every(function (x) { return LAYERS_BY_SCEN[t.scen].indexOf(x) >= 0; });
        if (okL) t.backdrop = ls.sort().join('+'); else bad('backdrop', ov.backdrop + ' no encaja con ' + t.scen);
      }
    }
    for (var f in ov) if (Object.prototype.hasOwnProperty.call(ov, f) && !(f in t)) bad(f, 'campo desconocido');
    return t;
  }

  // ------------------------------------------------------------------ mundo, por país y a demanda
  // Cada país se calcula entero (roster + reparación de gemelos + nombres, pista y playa) la primera vez que se pide una sede suya, en
  // el orden de leagues.js, y se cachea. Los nombres y pads no chocan entre países porque cada núcleo de topónimo tiene un único
  // dueño (ownership), así que la pista de un país no depende de ningún otro: la primera spec cuesta un país (~25 clubes), no el
  // mundo entero. La única dependencia es la de las firmas de playa (ver bodies): los cuerpos de playa de los países anteriores.
  var CW = {}, BODY = {}, BSIG = {};
  /** Cuerpos (receta sin nombre) de las sedes de un país y tipo, en el orden de leagues.js, con la reparación de gemelos. */
  function bodies(cc, kind) {
    var bk = cc + '|' + kind; if (BODY[bk]) return BODY[bk];
    var I = leagueIndex(), forbid = null;
    // playa: 0 firmas completas repetidas en el mundo. Su espacio de firmas es pequeño, así que cada país evita las firmas de los países
    // ANTERIORES en el orden fijo de leagues.js (solo los cuerpos de playa, sin nombres: es barato). La pista no lo necesita (su espacio
    // es mucho mayor) y la prueba lo vigila.
    if (kind === 'beach' && I._ready) {
      var pos = I._order.indexOf(cc);
      for (var pi = 0; pi < pos; pi++) bodies(I._order[pi], 'beach');
      forbid = BSIG;
    }
    var R = rosterOf(cc, kind), done = [], uses = R.tpls.map(function () { return 0; }), cityArch = {}, ptr = 0, out = [];
    var orderI = R.clubs.map(function (k, i) { return i; }).sort(function (a, b) { return R.clubs[a].lvl - R.clubs[b].lvl || a - b; });
    orderI.forEach(function (i) {
      var k = R.clubs[i], tier = R.tiers[i];
      var c = clubCtx({ name: k.base, city: k.city, cc: cc }, kind, null); c.tier = tier;
      var okey = k.key + (kind === 'beach' ? ':b' : ''), ov = Object.prototype.hasOwnProperty.call(OVERRIDES, okey) ? OVERRIDES[okey] : null;
      // plantilla: mismo tier, menos usada, arquetipo distinto al de los clubes de la misma ciudad; empate por puntero con salto primo
      var cands = R.tpls.map(function (t, j) { return j; }).filter(function (j) { return compatible(R.tpls[j], tier, kind); });
      if (!cands.length) cands = R.tpls.map(function (t, j) { return j; });
      var ck = norm(k.city.replace(/\(.*\)/, '')), seenA = cityArch[ck] || {};
      function score(j) { var t = R.tpls[j]; return (t.tier === tier ? 0 : 100) + uses[j] * 10 + (seenA[kind === 'hall' ? t.arch : t.scen] ? 50 : 0) + ((j - ptr + R.K * 4) % R.K) * 0.01; }
      cands.sort(function (a, b) { return score(a) - score(b); });
      ptr = (ptr + 7) % R.K;
      var best = null, bestJ = cands[0];
      // misma ciudad: arquetipo distinto mientras queden permitidos (si ninguna plantilla sirve, una extra solo para este club)
      var avoid = kind === 'hall' && Object.keys(seenA).length ? allowed(tier).filter(function (a) { return !seenA[a]; }) : [], extra = null;
      if (avoid.length && !cands.some(function (j) { return !seenA[R.tpls[j].arch]; })) extra = drawHallTpl(rng(c.seed, 'citytpl'), tier, c.env, avoid);
      var plan = [], top = Math.min(cands.length, 4), si, ci, thr = kind === 'hall' ? 4 : 3, bestV = -1;
      if (extra) for (si = 0; si < 8; si++) plan.push([-1, si]);
      for (si = 0; si < 8; si++) for (ci = 0; ci < top; ci++) plan.push([cands[ci], si]);
      for (ci = top; ci < cands.length; ci++) plan.push([cands[ci], 0]);
      for (var att = 0; att < plan.length; att++) {
        var j = plan[att][0], salt = plan[att][1];
        var tpl = j < 0 ? extra : R.tpls[j]; if (ov) tpl = overrideTpl(tpl, ov, kind, tier, cc, c.env, c.seed, okey);
        var body = kind === 'hall' ? hallSpec(c, tpl, salt) : beachSpec(c, tpl, salt), md = 99;
        for (var q = 0; q < done.length; q++) md = Math.min(md, dist(body, done[q]));
        if (forbid && forbid[sigKey(body)]) md = 0;
        var clash = avoid.length > 0 && !!seenA[body.arch], val = (clash ? 0 : 100) + Math.min(md, thr + 1);
        if (val > bestV) { best = body; bestV = val; bestJ = j; }
        STATS.att.push(att);
        if (md >= thr && !clash) break;
      }
      if (bestJ >= 0) uses[bestJ]++;
      seenA[best.arch] = 1; cityArch[ck] = seenA;
      done.push(best);
      out.push({ k: k, tier: tier, c: c, body: best, tpl: bestJ });
    });
    if (I._ready) { BODY[bk] = out; if (kind === 'beach') out.forEach(function (o) { BSIG[sigKey(o.body)] = 1; }); }
    return out;
  }
  function country(cc) {
    if (CW[cc]) return CW[cc];
    var I = leagueIndex(), W = { hall: {}, beach: {}, names: {}, pads: {}, used: {}, core: {} };
    if (!I[cc]) return W;
    var own = ownership();
    ['hall', 'beach'].forEach(function (kind) {
      bodies(cc, kind).forEach(function (o) {
        var c = o.c, k = o.k;
        var nm = makeName({ lang: c.lang, kind: kind, tier: o.tier, scen: o.body.p.scen, seed: c.seed, coast: c.env.coast, own: own, cc: cc,
          used: W.used, names: W.names, pads: W.pads, reuse: kind === 'beach' ? W.core[k.key] : null });
        W.names[nm.name] = 1; W.pads[nm.pad] = 1; STATS.deny.push(nm.deny); STATS.tries.push(nm.tries);
        if (kind === 'hall' && !nm.wink) W.core[k.key] = nm.short;
        var sp2 = assemble(c, o.body, nm, kind, chantOf(c.lang, c.short, c.seed));
        sp2.tpl = o.tpl;
        W[kind][k.key] = sp2;
      });
    });
    if (I._ready) CW[cc] = W;
    return W;
  }
  /** Todas las sedes de VB.Leagues (para las pruebas y la hoja de contactos). */
  function buildWorld() {
    var I = leagueIndex(), out = { hall: {}, beach: {} };
    I._order.forEach(function (cc) { var W = country(cc); ['hall', 'beach'].forEach(function (kd) { for (var k in W[kd]) out[kd][k] = W[kd][k]; }); });
    return out;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** Nombre de una sede que no es de un club de VB.Leagues (club desconocido, con sal o al azar): núcleos del país y nunca el nombre
   *  de una sede de club de ese país. Entre dos de estas sí puede repetirse (son funciones puras de su semilla, sin registro común). */
  function looseName(c, kind, scen) {
    var W = c.cc !== 'XX' ? country(c.cc) : null;
    return makeName({ lang: c.lang, kind: kind, tier: c.tier, scen: scen, seed: c.seed, coast: c.env.coast, own: W ? ownership() : null, cc: c.cc,
      used: null, names: W ? W.names : null, pads: null, reuse: null });
  }

  /** Receta de la sede de un club. club = clubInfo/clubInfo6 o club de leagues.js; kind 'hall' | 'beach'; opt {stage?: 'intl', salt?}. */
  function spec(club, kind, opt) {
    kind = kind === 'beach' ? 'beach' : 'hall'; club = club || {}; opt = opt || {};
    var known = findClub(club), salted = opt.salt != null && opt.salt !== '', out;
    if (known && !salted) {
      out = clone(country(known.cc)[kind][known.key]);
      if (kind === 'beach' && club.beach) out = withBeachName(out, club);
    } else {
      var c = clubCtx(club, kind, opt);
      if (kind === 'beach' && c.cc === 'XX') out = careerBeach(c, club);
      else {
        var R = rosterOf(c.cc, kind), cands = R.tpls.filter(function (t) { return compatible(t, c.tier, kind); }), tpl;
        if (cands.length) tpl = cands[c.seed % cands.length];
        else tpl = kind === 'hall' ? drawHallTpl(rng(c.seed, 'tpl'), c.tier, c.env, null) : drawBeachTpl(rng(c.seed, 'tpl'), c.tier, c.cc, c.env, null, null);
        var body = kind === 'hall' ? hallSpec(c, tpl, 0) : beachSpec(c, tpl, 0);
        out = assemble(c, body, looseName(c, kind, body.p.scen), kind, chantOf(c.lang, c.short, c.seed));
        if (kind === 'beach' && club.beach) out = withBeachName(out, club);
      }
    }
    if (kind === 'hall' && opt.stage === 'intl' && (club.lvl === 1 || (known && known.lvl === 1)) && !PALAU[out.arch]) out = intlOf(out, club, opt);
    return out;
  }
  /** Copa internacional: la sede del local pasa a tier 3 con piel de Palau (H8/H9); mismo nombre, id con sufijo 'x'. */
  function intlOf(base, club, opt) {
    var c = clubCtx(club, 'hall', opt && opt.salt != null && opt.salt !== '' ? { salt: opt.salt } : null); c.tier = 3; c.intl = true;
    var tpl = { arch: (c.seed & 1) ? 'H9' : 'H8', tier: 3, flavor: base.flavor, back: 'led', light: 'show', roof: '', stands: 'bowl' };
    tpl.roof = roofOpts(tpl.arch)[0];
    var body = hallSpec(c, tpl, 0), out = assemble(c, body, { name: base.name, short: base.short, pad: base.pad }, 'hall', base.txt.chant);
    return out;
  }
  function beachShort(b) {
    var s = String(b).replace(/^(Platja Gran|Playa Larga|Platja dels Pins|Cala Fonda|Platja|Playa|Arenal|Dunas|Cala|Caló)( de| del| dels)?\s+/, '');
    return s.slice(0, 12);
  }
  function withBeachName(out, club) {
    out.name = String(club.beach); out.short = beachShort(club.beach); out.pad = (up(out.name).length <= 18 ? up(out.name) : up(out.short)).slice(0, 18);
    out.help = out.name + (club.city ? ' · ' + club.city : '') + ' · vóley playa, pista de 16 × 8';
    out.txt.banners[0] = out.pad;
    return out;
  }
  /** Playa de la Carrera: 8 plantillas por circuito (semilla del circuito); el club usa la de su puesto (id % 8). */
  var XXR = {};
  function xxRoster(lvl) {
    lvl = clamp(lvl | 0, 0, 4); if (XXR[lvl]) return XXR[lvl];
    var r = rng(fnv('xx|v' + V + '|' + lvl), 'tpl'), tpls = [], distinct = {}, nd = 0, tier = lvl >= 4 ? 3 : lvl >= 3 ? 2 : lvl >= 1 ? 1 : 0;
    for (var j = 0; j < 8; j++) {
      var only = nd < 5 ? scenAllowed('XX', ENV.XX).filter(function (s) { return !distinct[s]; }) : null, best = null, bestD = -1;
      for (var a = 0; a < 25; a++) {
        var c = drawBeachTpl(r, tier, 'XX', ENV.XX, only && only.length ? only : null, lvl), d = 99;
        for (var q = 0; q < tpls.length; q++) d = Math.min(d, tplDistB(c, tpls[q]));
        if (d > bestD) { best = c; bestD = d; } if (d >= 4) break;
      }
      if (!distinct[best.scen]) { distinct[best.scen] = 1; nd++; }
      tpls.push(best);
    }
    return (XXR[lvl] = tpls);
  }
  /** Playa de la Carrera: p = 20·lvl + 10·q (q sale de la ficha: ovr dentro del rango del circuito), así el circuito 5 llega a tier 3
   *  y sus plantillas de noche se respetan; por debajo de tier 3 la noche pasa a tarde. */
  function careerBeach(c, club) {
    var lvl = clamp(+club.lvl || 0, 0, 4), T = xxRoster(lvl), j = isFinite(+club.id) && club.id != null ? ((+club.id % 8) + 8) % 8 : c.seed % 8;
    c.tier = tierOfP(c.p);
    var tpl = T[j];
    if (tpl.hour === 'noche' && c.tier < 3) { tpl = clone(tpl); tpl.hour = 'tarde'; }   // noche solo en tier 3
    var body = beachSpec(c, tpl, 0), nm = makeName({ lang: c.lang, kind: 'beach', tier: c.tier, scen: body.p.scen, seed: c.seed, coast: true, own: null, cc: 'XX' });
    var out = assemble(c, body, nm, 'beach', chantOf(c.lang, c.short, c.seed));
    if (club.beach) out = withBeachName(out, club);
    return out;
  }

  /** Sede al azar (partido rápido, ?map=gen:h:123): club sintético determinista a partir de la semilla. */
  var RPAL = ['#d8262e', '#1f9a4a', '#32b5e8', '#7b3fd1', '#ff5a2c', '#f2c230', '#0b3d91', '#e5007e', '#00843d', '#111111', '#ffffff', '#ff8000', '#6ec1e4', '#550000'];
  function random(kind, seed) {
    kind = kind === 'beach' ? 'beach' : 'hall'; seed = (+seed >>> 0) || 0;
    var r = rng(fnv('rand|v' + V + '|' + kind + '|' + seed), 'club'), cc = CCS[Math.floor(r() * CCS.length) % CCS.length], i1 = ri(r, 0, RPAL.length - 1), i2 = (i1 + ri(r, 1, RPAL.length - 1)) % RPAL.length;
    var p = rr(r, 45, 95), env = ENV[cc];
    var c = { known: null, cc: cc, env: env, name: 'r' + seed, base: '', city: '', seed: fnv('v' + V + '|' + kind + '|rand|' + seed), p: p, tier: tierOfP(p), ovr: p,
      short: 'R' + (seed % 1000), kit: { h1: RPAL[i1], h2: RPAL[i2], a: RPAL[(i2 + 3) % RPAL.length] }, lang: '' };
    c.lang = langOf(cc, 'r' + seed, c.seed);
    var tpl = kind === 'hall' ? drawHallTpl(rng(c.seed, 'tpl'), c.tier, env, null) : drawBeachTpl(rng(c.seed, 'tpl'), c.tier, cc, env, null, null);
    var body = kind === 'hall' ? hallSpec(c, tpl, 0) : beachSpec(c, tpl, 0), nm = looseName(c, kind, body.p.scen);
    var out = assemble(c, body, nm, kind, chantOf(c.lang, nm.short.slice(0, 3), c.seed));
    out.id = 'g-r-' + seed + '-' + (kind === 'hall' ? 'h' : 'b');
    out.help = nm.name + (kind === 'hall' ? ' · pista de 18 × 9' : ' · vóley playa, pista de 16 × 8');
    out.txt.banners = out.txt.banners.filter(function (b) { return b !== 'R' + (seed % 1000); });
    if (out.txt.banners.length < 2) out.txt.banners.push(up(nm.short));
    return out;
  }

  /** Roster público (para pruebas y la hoja de contactos): plantillas y tier por club. */
  function roster(cc, kind) { var R = rosterOf(String(cc).toUpperCase(), kind === 'beach' ? 'beach' : 'hall'); return clone({ K: R.K, tpls: R.tpls, tiers: R.tiers }); }

  // ------------------------------------------------------------------ planta de pista (F2: pura; la usan el constructor y el coste)
  // Paredes, gradas, alero, techo EFECTIVO (el del arquetipo construido: BUILD_AS), marcador, ventanales y rejilla de focos.
  // Medidas en metros, coordenadas de la simulación (x a lo largo de la pista, y a lo ancho; −y = lado del 1r árbitro).
  var SAW_EAVE = 9.0;   // alero mínimo con techo de dientes de sierra: cordón inferior de la cercha (alero − 0,95) por encima de la cámara de TV del 6v6 (z 7,8)
  var PV0 = 11.9, PVE = 17.4, LAMP_MID = 8.3;   // primera fila de las gradas laterales (tras banquillos y cámara) y de las de los fondos (tras la tarima); altura mínima de la fila central de focos
  function planRoof(A, p) {
    if (A === 'H1') return { t: 'saw', n: clamp(p.roof === 'saw' ? p.roofN : Math.round((p.roofN || 6) / 2), 4, 8) };
    if (A === 'H2') return { t: 'barrel', n: clamp(p.roofN || 8, 4, 12), rise: p.rise > 0 ? p.rise : 3.2 };
    if (A === 'H4') return { t: 'folded', n: clamp(p.roofN || 8, 6, 12) };
    if (A === 'H5') return { t: 'glulam', n: clamp(p.roofN || 6, 4, 8) };
    if (A === 'H6') return { t: 'louvre', n: clamp(p.roofN || 14, 10, 20) };
    if (A === 'H7') return p.roof === 'domelow' ? { t: 'domelow', n: clamp(p.roofN || 14, 12, 16) } : { t: 'octagon', n: 8 };
    return p.roof === 'gable' ? { t: 'gable', n: clamp(p.roofN, 5, 11), pitch: p.pitch || 16 } : { t: 'flat', n: clamp(p.roofN || 7, 5, 11) };
  }
  /** Coronación del techo efectivo (la seña de los fondos no la pasa). */
  function roofTopOf(rf, eave, hs) {
    return rf.t === 'saw' ? eave + rf.rise + 0.3 : rf.t === 'gable' ? eave + hs * Math.tan(rf.pitch * Math.PI / 180)
      : rf.t === 'barrel' || rf.t === 'folded' || rf.t === 'glulam' || rf.t === 'domelow' ? eave + rf.rise : rf.t === 'louvre' ? eave + 1.2 : eave + 1.4;
  }
  function plan(sp) {
    var p = sp.p, A = builtArch(sp), rf = planRoof(A, p), st = p.stands === 'bowl' ? 'U' : p.stands;
    var type = p.standType === 'concrete' || p.standType === 'vip' ? 'concrete' : p.standType === 'bleacher' ? 'bleacher' : 'tele';
    var RD = type === 'concrete' ? 0.85 : type === 'bleacher' ? 0.72 : 0.8, RZ = p.standRise || 0.42;
    var rows = clamp(p.rows || 0, 2, 12), rowsE = Math.min(rows, 6);
    var S1 = st !== 'none', S2 = st === 'two', SE = st === 'U';
    // H6 MODERNO: grada asimétrica (la de enfrente, con la mitad de filas)
    var rowsN = S2 && A === 'H6' ? Math.max(2, Math.round(rows / 2)) : rows;
    var topS = S1 ? 0.12 + (rows - 1) * RZ : 0, topN = S2 ? 0.12 + (rowsN - 1) * RZ : 0, topE = SE ? 0.12 + (rowsE - 1) * RZ : 0;
    var WX = Math.max(p.wx, 19.5, SE ? PVE + rowsE * RD + 0.7 : 0);
    var BXH = SE ? 16.4 : Math.min(WX - 2.6, 15.5);
    var ys = Math.max(p.wy, 12.8, S1 ? PV0 + rows * RD + 0.5 : 0), yn = S2 ? Math.max(p.wy * (A === 'H6' ? 0.8 : 1), 12.8, PV0 + rowsN * RD + 0.5) : clamp(p.wy * 0.8, 13.4, 16.5);
    // flavor jpkr: escenario con telón en el fondo −x (el que ve la cámara de juego; el otro conserva su fondo rival); con 'stage' en la receta, en los dos (2)
    var stageE = p.back === 'stage' ? 2 : sp.flavor === 'jpkr' && !SE && p.back !== 'view' ? 1 : 0;
    var dado = p.dado || 1.2, zSc = SE ? Math.max(4.6, topE + 2.6) : (stageE ? 6.9 : p.back === 'mural' || p.back === 'letters' ? Math.max(5.4, dado + 3.0 + 0.925) : 4.6);
    // (dientes de sierra: las cerchas cuelgan 0,95 m bajo el alero, a lo ancho de la nave; por debajo de la cámara de televisión del
    // 6v6 —x 14,2, z 7,8, js/camera.js tvShot— una de ellas cruzaba el encuadre: CZ:FIE, PE:REM, TR:ANG, ES:SRQ, JP:SPZ. tools/cam6clip.js)
    var eave = Math.max(p.eave, topS + 3.6, topN + 3.6, zSc + 2.2, rf.t === 'saw' ? SAW_EAVE : rf.t === 'flat' || rf.t === 'louvre' || rf.t === 'octagon' ? 7.2 : 7.5);
    WX = R2(WX); eave = R2(eave);
    var hs = (R2(yn) + R2(ys)) / 2;
    if (rf.t === 'saw') rf.rise = R2(clamp(2 * WX / rf.n * 0.3, 1.8, 3));
    if (rf.t === 'folded') rf.rise = R2(clamp(2 * WX / rf.n * 0.45, 1.0, 2.2));
    if (rf.t === 'glulam') rf.rise = R2(clamp(hs * 0.2, 2.4, 4.5));
    if (rf.t === 'domelow') rf.rise = R2(clamp(hs * 0.18, 2.5, 4.5));
    // H7 octógono: chaflanes de ch m en las cuatro esquinas, sin tocar gradas ni el atrezo de los fondos y laterales
    var ch = 0;
    if (rf.t === 'octagon') {
      var my = Math.min(R2(ys), R2(yn)), lim = [6, WX - 16.4];
      if (S1) lim.push(WX - BXH + R2(ys) - (PV0 + rows * RD) - 0.3);
      if (S2) lim.push(WX - BXH + R2(yn) - (PV0 + rowsN * RD) - 0.3);
      if (SE) lim.push(WX - (PVE + rowsE * RD) + my - 10.8 - 0.3); else lim.push(my - 10.0);
      ch = Math.min.apply(null, lim); ch = ch < 1.5 ? 0 : R2(ch);
    }
    // H7: balconada de 1-2 pisos en el lateral +y (sin grada en ese lado): losa, antepecho y una fila de público por piso
    var balc = null;
    if (A === 'H7' && (p.balcony | 0) > 0 && !S2) {
      var nbal = p.balcony | 0, BZ = [3.4, 6.3];
      while (nbal > 0 && BZ[nbal - 1] + 2.3 > eave - 0.5) nbal--;
      if (nbal > 0) balc = { n: nbal, z: BZ.slice(0, nbal), d: 2.4, x: R2(WX - ch - 0.6), top: R2(BZ[nbal - 1] + 1.1) };
    }
    // ventanales de los laterales: banda alta por encima de la grada (o de la balconada) de ese lado (si cabe 1 m)
    var win = [], nWin = 0;
    if (p.win !== 'none' && p.win !== 'skylight') {
      [[-R2(ys), -1, S1 ? topS + 2.4 : 0], [R2(yn), 1, S2 ? topN + 2.4 : balc ? balc.top + 1.3 : 0]].forEach(function (w) {
        var z1 = eave - 0.6, z0 = Math.max(w[2], z1 - (p.win === 'glass' ? 3.2 : p.win === 'ring' ? 1.8 : 2.1));
        if (z1 - z0 < 1.0) return;
        var step = p.win === 'lattice' ? 3.2 : 3, n = Math.floor((2 * WX - 6 - 2 * ch) / step);
        win.push({ y: w[0], s: w[1], z0: R2(z0), z1: R2(z1), step: step, n: n }); nWin += n + 1;
      });
    }
    // focos: rejilla de nx × (2 o 3) bajo el techo. La fila central (y = 0) solo si cuelga por encima de LAMP_MID: más baja, la
    // cámara de televisión del 6v6 (x 14,2, z 7,8, mirando a lo largo de la pista) la ve encima de la pista (tools/venuegen-lamps.js)
    var zl = R2(clamp(eave - 2.4, 7.0, 10.2)), wide = (R2(yn) + R2(ys)) > 30;
    var lys = wide ? (zl >= LAMP_MID ? [-7, 0, 7] : [-7, 7]) : [-4.8, 4.8], nx = Math.max(3, Math.round(2 * WX / 7.5));
    // seña del arquetipo en los fondos (revisión de F2: el techo no sale en las cámaras de juego): franja A LA ALTURA DEL MARCADOR,
    // del pie del marcador a 0,6 m por encima, por debajo del remate del fondo; null si no caben 1,6 m. zS = arranque del arco de H2.
    // H6: el muro cortina sube hasta 0,4 m bajo el alero. Con chaflanes (H7), la franja no pasa del fondo recto.
    var scH = 1.85, zTop = roofTopOf(rf, eave, hs), myw = Math.min(R2(ys), R2(yn));
    var sz0 = zSc - scH / 2, sz1 = A === 'H6' ? Math.min(eave - 0.4, zTop - 0.2) : Math.min(zSc + scH / 2 + 0.6, zTop - 0.2);
    var sig = sz1 - sz0 < 1.6 ? null : { z0: R2(sz0), z1: R2(sz1), zS: R2(sz0 - 0.3), yw: R2(Math.min(11.5, myw - 1.2, myw - ch - 0.4)) };
    return { A: A, rf: rf, st: st, type: type, RD: RD, RZ: RZ, rows: rows, rowsN: rowsN, rowsE: rowsE, S1: S1, S2: S2, SE: SE, topS: R2(topS), topN: R2(topN), topE: R2(topE),
      WX: WX, BXH: BXH, YS: -R2(ys), YN: R2(yn), eave: eave, zSc: R2(zSc), scW: 3.7, scH: scH, V0: PV0, VE: PVE, ch: ch, balc: balc, stageE: stageE,
      win: win, nWin: nWin, lamps: { nx: nx, lys: lys, z: zl, n: nx * lys.length }, sig: sig };
  }

  // ------------------------------------------------------------------ coste estimado (F0: tabla; F2 la corrige con lo medido)
  // Pista: dibujos propios (baja 6: suelo exterior, estática, emisiva, rótulos, marcador, público; media/alta +tinta +haces de día con sol +halos de
  // noche) y triángulos de la estática fusionada. H8/H9: piel de Palau, +0 dibujos (la cúpula de H9 se retiró).
  // F2: tabla corregida con lo MEDIDO (tools/venuegen-cost.js, estática de 123 sedes en alta): término por pieza sobre la planta (plan).
  var COST = {
    // muros: 144 de los cuatro paños + [por metro de perímetro, por metro de alto, fijo] según el acabado
    wall: { stucco: [0, 0, 48], concrete: [4, 18.5, 0], 'brick-red': [2, 53, 0], 'brick-yellow': [2, 53, 0], block2: [0, 120, 48], metal: [18, 0, 0], wood: [20, 0, 0], tile: [20, 0, 48], palau: [0, 0, 0] },
    // techos: [fijo, por cercha / diente / arco, por cercha y metro de luz, por metro de largo (2·WX), por metro de luz]
    roof: { saw: [-348, 360, 17, 0, -7.8], barrel: [792, 168, 0, 0, 0], gable: [384, 276, 0, 17.1, 0], flat: [60, 372, 0, 0, 6.7],
      folded: [24, 40, 0, 0, 0], glulam: [528, 216, 0, 0, 0], louvre: [60, 12, 0, 0, 0], octagon: [252, 276, 0, 0, 0], domelow: [0, 92, 0, 0, 0] },
    winPer: { band: 72, arches: 96, ring: 40, glass: 72, lattice: 120, brise: 108 },
    // gradas, por fila: separadores por metro (cada 1,12 m; cada 0,56 m con ≤ 8 filas; el bleacher no lleva) + 48 + 36 por pasillo + por tramo entre pasillos
    stand: { sep: 12 / 1.12, sep8: 12 / 0.56, span: { tele: 36, concrete: 24, bleacher: 24 }, base: 48, aisle: 36 },
    standFix: 120, bench: 252, mosaic: 2100,
    back: { base: 348, se: 96, wallbars: 1932, view: 528, stage: 1140 },
    props: { lockers: 2840, scarves: 216, two: 460 }, lamp: { bay: 70, led: 36 },
    emis: { win: 12, bay: 36, led: 12, base: 24, vend: 12, skyN: 12, endWin: 12 },
    // flavors de F3 en la estática (jpkr: escenario en un fondo, en back; gulf, east: solo rótulos): trop ventiladores + jardineras, us barras de los estandartes
    flavor: { trop: 1148, us: 240 }, balcony: { base: 72, bracket: 12 }, chamfer: { stucco: 192, other: 144 }, F2: true, F3: true,
    // playa (F4, medido con def.parts() en tools/venuegen-beach.js): base = banquillos, marcador y tarima de la cámara; side = una grada
    // lateral [fijo, por fila]; end = la grada de fondo [fijo, por fila]; umb = sombrilla con su hamaca / toalla; night = mástiles y guirnalda
    beach: { base: 1396, side: [560, 92], end: [288, 84], flag: 108, umb: { desert: 144, dunes: 305, other: 262 },
      veg: { palm: 718, pine: 522, olive: 132, birch: 156, reeds: 308, agave: 146, duneGrass: 108 }, hut: { wood: 652, container: 204, straw: 240, kiosk: 376, tent: 144 },
      life: { none: 0, chair: 448, tower: 340, hut: 108 }, cactus: 280, night: 720, plazaNight: 4500, emisNight: 1310, emisPlaza: 3700,
      // sombrillas de los banquillos (no van de noche ni en la plaza); árboles en alcorque de la plaza (la fila entera, por especie: van
      // a escala 0,9 y los que tapan una grada no se ponen; medido en los 65 clubes de plaza de día con ALL=1)
      benchUmb: 224, plazaVeg: { palm: 8050, pine: 5565, reeds: 3028, birch: 1144, olive: 931, agave: 701, duneGrass: 546 },
      scen: { open: 1836, cove: 1128, port: 2690, lake: 6628, plaza: 5050, river: 8414, tropical: 264, dunes: 4374, desert: 3412 } }
  };
  var BUDGET = { hall: { low: 6, mid: 9, tris: 40000, emis: 4000 }, beach: { tris: 32000, emis: 4000, extraNight: 2 } };
  /** Coste de la estática por partes en ALTA y lo que la calidad BAJA poda (lite: nervios y correas del techo, cerchas con menos
   *  barras, separadores de la grada cada 1,12 m, barandillas, barras de la seña). trisLow = tris − poda. */
  function cost(sp) {
    var p = sp.p;
    if (sp.kind === 'beach') {
      // (lo mismo que monta js/venue-gen-beach.js: gradas de p.blocks × p.rows, grada de fondo con 3-4 bloques, banderas, chiringuito,
      // socorrista, piezas del escenario, sombrillas según el escenario y el tier, la vegetación de la receta y, de noche, los focos)
      var B = COST.beach, sides = !p.blocks ? 0 : p.blocks === 1 ? 1 : 2, rows = p.blocks ? clamp(p.rows | 0, 2, 8) : 0, end = p.blocks >= 3 && rows;
      var nU = p.scen === 'plaza' || p.scen === 'port' ? 0 : p.scen === 'river' ? 3 : 5 + 2 * (sp.tier | 0);
      var tris = B.base - (sp.night || p.scen === 'plaza' ? B.benchUmb : 0) + sides * (B.side[0] + B.side[1] * rows) + (end ? B.end[0] + B.end[1] * Math.min(rows, 6) : 0) + B.flag * (end ? 2 : 4) +
        (B.hut[p.hut] || 400) + (B.life[p.lifeguard] || 0) + (B.scen[p.scen] || 0) + (sp.night && p.scen === 'plaza' ? B.plazaNight : 0) +
        nU * (B.umb[p.scen] || B.umb.other) + (p.scen === 'plaza' ? (B.plazaVeg[p.veg] || 1500) : (p.scen === 'desert' && p.veg === 'agave' ? B.cactus : B.veg[p.veg] || 300) * p.vegN) + (sp.night ? B.night : 0);
      return { drawsLow: 0, drawsMid: sp.night ? 2 : 0, tris: Math.round(tris), emis: sp.night ? (p.scen === 'plaza' ? B.emisPlaza : B.emisNight) : 0, palau: false };
    }
    // (H9: la cúpula se retiró en la revisión de F3, no salía en las cámaras de juego: las dos pieles cuestan +0)
    if (p.skin === 'palau') return { drawsLow: 0, drawsMid: 0, tris: 0, emis: 0, palau: true };
    var L = plan(sp), C2 = COST, yspan = L.YN - L.YS, per = 2 * (2 * L.WX + yspan) - 8 * L.ch, parts = {}, z1 = L.rf.t === 'saw' ? L.eave + L.rf.rise + 0.3 : L.eave;
    var wc = C2.wall[p.wall] || C2.wall.concrete; parts.walls = Math.round(144 + wc[0] * per + wc[1] * z1 + wc[2] + (L.ch ? (p.wall === 'stucco' ? C2.chamfer.stucco : C2.chamfer.other) : 0));
    var rc = C2.roof[L.rf.t]; parts.roof = Math.round(rc[0] + L.rf.n * (rc[1] + rc[2] * yspan) + rc[3] * 2 * L.WX + rc[4] * yspan);
    parts.win = Math.round((C2.winPer[p.win] || 72) * L.nWin);
    var SC = C2.stand;
    function row(len, nr, na) { return (L.type === 'bleacher' ? 0 : (nr <= 8 ? SC.sep8 : SC.sep) * len) + SC.base + na * SC.aisle + (na + 1) * SC.span[L.type]; }
    var st = 0, naS = L.BXH > 11 ? 3 : 1, low = {};
    // poda de baja en una grada: separadores cada 1,12 m (si tenía 0,56) y sin barandillas (2 + pasillos interiores)
    function lowStand(len, nr, na) { return (L.type !== 'bleacher' && nr <= 8 ? nr * (SC.sep8 - SC.sep) * len : 0) + 12 * (2 + na); }
    var ls = 0;
    if (L.S1) { st += L.rows * row(2 * L.BXH, L.rows, naS) + C2.standFix; ls += lowStand(2 * L.BXH, L.rows, naS); } else st += C2.bench;
    if (L.S2) { st += L.rowsN * row(2 * L.BXH, L.rowsN, naS) + C2.standFix; ls += lowStand(2 * L.BXH, L.rowsN, naS); }
    if (L.balc) st += L.balc.n * (C2.balcony.base + C2.balcony.bracket * Math.ceil((2 * L.balc.x - 2.5) / 3));
    if (L.SE) { st += 2 * (L.rowsE * row(21.6, L.rowsE, 1) + C2.standFix); ls += 2 * lowStand(21.6, L.rowsE, 1); }
    low.stands = ls;
    if (L.S1 && p.seats === 'mosaic' && L.type !== 'bleacher') st += C2.mosaic;   // (las letras parten los tramos de asientos de 7 filas)
    parts.stands = Math.round(st);
    var back = L.SE && (p.back === 'wallbars' || p.back === 'stage') ? 'pena' : p.back;
    // (H6: con el muro cortina no caben los ventanales de la vista; jpkr con escenario en un fondo: la media de los dos fondos)
    parts.back = L.A === 'H6' && back === 'view' ? (L.SE ? C2.back.se : 192) : L.SE ? C2.back.se + (back === 'view' ? C2.back.view - 192 : 0)
      : L.stageE === 1 ? ((C2.back[back] || C2.back.base) + C2.back.stage) / 2 : (C2.back[back] || C2.back.base);
    parts.props = L.S2 ? C2.props.two : C2.props.lockers + (p.props === 'scarves' ? C2.props.scarves : 0) - (L.balc ? 104 : 0);
    parts.flavor = C2.flavor[sp.flavor] || 0;
    // (trop / gulf: lateral abierto en los fondos, KIT.openBand: 4 alféizares por tramo y lamas / celosía; 2 cajas emisivas por tramo)
    var bandE = 0;
    if (sp.flavor === 'trop' || sp.flavor === 'gulf') {
      var latB = sp.flavor === 'gulf', stB = latB ? 0.34 : 0.42, ch0 = L.ch || 0, ya = Math.max(L.YS + ch0 + 0.6, -14), yb0 = Math.min(L.YN - ch0 - 0.6, 14);
      for (var eB = -1; eB <= 1; eB += 2) {
        var bkB = L.stageE === 2 ? 'stage' : back, segB = [], dd = p.dado || 1.2, zB1;
        if (L.SE) { var yf = Math.max(11.1, L.sig ? L.sig.yw + 0.3 : 0); segB = [-yf - ya, yb0 - yf]; zB1 = Math.min(L.eave - 0.6, L.sig ? L.sig.z1 : L.zSc + 1.5); }
        else {
          var dW = L.ch ? 0 : 2.3 + (eB < 0 && bkB !== 'view' ? 3.6 : 0);
          segB = [yb0 - ya - dW]; zB1 = bkB === 'mural' || bkB === 'letters' ? Math.max(1.15, dd + 0.13) : bkB === 'pena' ? 1.85 : Math.max(2.1, dd - 0.1);
        }
        var fins = bkB === 'wallbars' && !L.SE ? 0 : 1, nRow = latB ? Math.max(0, Math.ceil((zB1 - 0.3 - 0.136) / stB)) : 0;
        segB.forEach(function (w) { if (w < 0.8) return; parts.flavor += 48 + fins * (Math.round(w / stB) - 1) * 12 + fins * nRow * 12; bandE += 24; });
      }
    }
    var led = p.light === 'led' || p.light === 'show';
    parts.lights = L.lamps.n * (led ? C2.lamp.led : C2.lamp.bay);
    // seña del arquetipo en los dos fondos (KIT.endSig; barras de 12 triángulos)
    var nSaw = L.sig ? Math.max(4, Math.round(2 * L.sig.yw / 2.4)) : 0, nWar = L.sig ? 2 * Math.max(6, Math.round(L.sig.yw / 1.3)) : 0;
    var SG = L.sig, n4 = SG ? Math.max(4, Math.round(2 * SG.yw / 2.6)) : 0, nA7 = SG ? Math.max(3, Math.round(2 * SG.yw / 2.3)) : 0;
    var nm6 = SG ? Math.max(4, Math.round(2 * SG.yw / 1.5)) + 1 + Math.max(1, Math.round((SG.z1 - SG.z0) / 1.1)) + 1 : 0;
    parts.sig = !SG ? 0 : L.A === 'H1' ? 2 * (24 + 38 * nSaw) : L.A === 'H2' ? 2 * 144 : L.A === 'H4' ? 2 * (12 + 16 * n4) : L.A === 'H5' ? 960 : L.A === 'H6' ? 2 * 12 * (nm6 + 1)
      : L.A === 'H7' ? 2 * (36 + 48 * nA7) : L.rf.t === 'gable' ? 2 * 98 : 2 * (12 + 12 * (2 * nWar + 3));
    low.sig = !SG ? 0 : L.A === 'H1' ? 2 * 12 * nSaw : L.A === 'H2' ? 2 * 16 : L.A === 'H4' ? 2 * 12 * n4 : L.A === 'H5' ? 144 : L.A === 'H7' ? 2 * 8 * nA7 : 0;
    // techo en baja (KIT.roof*: lite)
    var R = L.rf, ysp = L.YN - L.YS;
    low.roof = R.t === 'saw' ? R.n * Math.ceil((ysp - 0.6) / 1.25) * 12 + (R.n - 1) * 144 : R.t === 'gable' ? 2 * Math.ceil((2 * L.WX - 1.2) / 1.4) * 12 + R.n * 144
      : R.t === 'flat' ? Math.ceil((ysp - 2) / 1.8) * 12 + R.n * 144 : R.t === 'barrel' ? 48 * (R.n + 1) + 120
      : R.t === 'folded' ? 12 * R.n : R.t === 'glulam' ? 48 * R.n + 96 : R.t === 'octagon' ? 768 : 0;
    var t = 0; for (var k in parts) t += parts[k];
    var E = C2.emis, nSky = p.win !== 'skylight' ? 0 : L.rf.t === 'gable' ? 2 : L.rf.t === 'barrel' ? 2 : L.rf.n - 1;
    // emisiva de F3: óculos (40 por ventana), vidrio de la seña (H5 abanico, H6 muro cortina, H7 arquería), tiras de las lamas, linterna, óculo
    var emisF3 = (!SG ? 0 : L.A === 'H1' ? 24 * nSaw : L.A === 'H2' || L.A === 'H5' ? 44 : L.A === 'H6' ? 24 : L.A === 'H7' ? 48 * nA7 : 0) + ({ louvre: 24, octagon: 12, domelow: 12 }[L.rf.t] || 0);
    var emis = bandE + emisF3 + (L.SE ? 0 : E.base) + (L.S2 ? 0 : E.vend) + L.nWin * (p.win === 'ring' ? 40 : E.win) + L.lamps.n * (led ? E.led : E.bay) + (L.rf.t === 'saw' ? (L.rf.n - 1) * E.skyN : nSky * E.skyN) + (back === 'view' && L.A !== 'H6' ? 4 * E.endWin : 0);
    var dLow = 6, mid = 6 + 1 + (p.light === 'sun' ? 1 : 0) + (sp.night ? 1 : 0);
    var pr = 0; for (var k2 in low) pr += low[k2];
    return { drawsLow: dLow, drawsMid: mid, tris: Math.round(t), trisLow: Math.round(t - pr), emis: Math.round(emis), palau: false, parts: parts, lowCut: low };
  }

  // Rangos de cada eje (los comprueba tools/venuegen-test.js).
  var RANGES = {
    hall: {
      skin: ['', 'palau'], wx: [19.5, 30], wy: [10, 23.4], eave: [7.5, 16], roof: ['saw', 'barrel', 'gable', 'flat', 'folded', 'glulam', 'louvre', 'octagon', 'domelow', 'palau', 'dome'],
      roofN: [0, 24], pitch: [0, 25], rise: [0, 4.5], oculus: 'boolean', back: ['mural', 'letters', 'pena', 'wallbars', 'view', 'stage', 'led'],
      floorMat: ['maple', 'oak', 'darkwood', 'synth', 'synth2', 'multi'], multiA: [0, 0.5], floorLogo: 'boolean', stands: ['none', 'one', 'two', 'U', 'bowl'], rows: [0, 18],
      standRise: [0.38, 0.5], standType: ['none', 'tele', 'concrete', 'bleacher', 'vip', 'palau'], seats: ['none', 'solid', 'alt', 'grad', 'greyacc', 'mosaic'],
      crowd: [0.15, 0.95], crowdMax: [0, 650], kitShare: [0.4, 0.7], props: ['', 'scarves', 'flags', 'fans', 'balloons'],
      wall: ['brick-red', 'brick-yellow', 'concrete', 'block2', 'metal', 'wood', 'stucco', 'tile', 'palau'], dado: [1.2, 2.4], wallTint: [0.15, 0.3],
      win: ['none', 'band', 'skylight', 'lattice', 'arches', 'glass', 'ring', 'brise'], view: ['none', 'city', 'mountains', 'palms', 'snow', 'desert', 'harbor'],
      light: ['sun', 'cloudy', 'sodium', 'led', 'show'], tempK: [2700, 6500], sunAz: [0, 360], sunEl: [30, 70], hemiK: [1.6, 2.6], floorK: [0.95, 1.15], crowdDim: [0.1, 0.35],
      lightColor: ['', '#ffcf8a', '#eef4ff'], score: ['segments', 'flip', 'led', 'cube'], pennants: [0, 5], balcony: [0, 2]
    },
    beach: {
      scen: ['open', 'cove', 'port', 'lake', 'plaza', 'river', 'tropical', 'dunes', 'desert'], hour: ['dia', 'tarde', 'noche'], deep: 'color', shal: 'color', foam: 'color', surf: [0, 1],
      backdrop: 'string', layers: [2, 4], mountainH: [0, 60], cityDensity: [0, 1], cityH: [0, 120], cityTop: ['', 'dome', 'minaret', 'pagoda', 'belfry'],
      veg: ['palm', 'pine', 'olive', 'birch', 'reeds', 'agave', 'duneGrass'], vegN: [0, 30], blocks: [0, 4], rows: [0, 8], caps: [0.2, 0.6], crowd: [0.15, 0.95],
      hut: ['wood', 'container', 'straw', 'kiosk', 'tent'], lifeguard: ['none', 'chair', 'tower', 'hut'], sunAz: [0, 360]
    }
  };

  var OVERRIDES = {   // {'PL:LKS': {arch: 'H6'}, 'IT:PER:b': {scen: 'port'}}: la única vía para corregir sedes concretas
    // F6, revisión de las hojas de contactos (tools/venueshots.js, 15-nov-2026): gemelas de mismo arquetipo dentro del país (mismo
    // fondo y pista del mismo color desde la cámara de juego) y una sede fea
    'IT:PRA': { arch: 'H3', stands: 'one' },   // = IT:VAL (H6 cristalera, misma pista crema sobre azul); con gradas en U, = IT:MOD
    'PL:JAS': { arch: 'H7' },     // = PL:ZAW (H6 cristalera nublada, Jastrzębie y Zawiercie con los mismos colores)
    'BR:GRU': { arch: 'H7' },     // = BR:CEL (H6 cristalera, azul sobre amarillo)
    'RU:PLA': { arch: 'H3' },     // = RU:DYM (H6 cristalera de noche con sodio)
    'JP:LAF': { arch: 'H3', light: 'led' },   // = JP:RIO (H5 madera con telón); con sodio, verde menta sobre gris como JP:BRH
    'BR:CDG': { arch: 'H4' },     // = BR:MOC (H5 madera con mural; BR no tenía ninguna H4)
    // ES tiene cinco clubes azul sobre amarillo (LAG, TAM, BND, SRQ, CHT): cada uno con su arquetipo (H2, H4, H5, H1, H3)
    'ES:BND': { arch: 'H5' },
    'ES:SRQ': { arch: 'H1' },
    'ES:CHT': { arch: 'H3' },
    // segunda revisión (gemelas en el umbral: Hamming 10-14 con casi el mismo color)
    'AR:PIN': { arch: 'H5', light: 'led', stands: 'U' }, // H5: AR:LOB (misma ciudad) ya es H4. = AR:NUN (H2 bóveda con sodio, pista roja sobre madera naranja, pared marrón; misma liga)
    'IT:CHI': { arch: 'H3' },     // = IT:VER (H8/H9 de noche con LED, azul sobre naranja: con otra luz seguían gemelas)
    'PL:MUR': { arch: 'H3' }      // = PL:WAR (H8/H9 de noche con luces de espectáculo, azul sobre amarillo)
  };
  VB.VenueGen = {
    V: V, spec: spec, random: random, roster: roster, dist: dist, sig: sigKey, name: function (sp2) { return sp2 ? sp2.name : ''; },
    cost: cost, plan: plan, builtArch: builtArch, COST: COST, BUDGET: BUDGET, RANGES: RANGES, ENV: ENV, OVERRIDES: OVERRIDES, LANG: LANG, DENY: DENY, ARCH: ARCH, BUILD_AS: BUILD_AS,
    // para las pruebas
    _: { fnv: fnv, rng: rng, dE76: dE76, SEP: SEP, norm: norm, denied: denied, gendered: gendered, langOf: langOf, contrast: contrast, hexHsl: hexHsl, lum: lum, world: buildWorld, stats: STATS,
      findClub: findClub, scenAllowed: scenAllowed, xxRoster: xxRoster, allowed: allowed, roofOpts: roofOpts, backOpts: backOpts, overrideErrors: OVERRIDE_ERRORS,
      ownership: ownership, coreKey: coreKey, core: core, langsOf: langsOf, country: country, XX_OVR: XX_OVR, MARITIME: MARITIME, URBAN: URBAN, fitsT: fitsT }
  };
})();
