/* MAKE THE CUT — js/look.js (owner: ui_main)
 * Vestuario (personalización de los muñecos): catálogo, reglas de compatibilidad, saneado, resolución para doll.js, inventario
 * y guardado. Es PURO: sin THREE ni DOM (localStorage siempre dentro de try/catch); se prueba en node con vm (tools/looktest.js).
 * index.html lo carga entre js/badges.js y js/venues.js. Todo es estético: nada de esto entra en la sim, en attrs, en badges ni
 * en g.rng (la única semilla aleatoria es la que pasa la UI a random(), Date.now()).
 *
 * «Fit» (lo que se guarda y se edita; §2.1 de la especificación):
 *   { v:1, skin:hex, hair:hex | id de tinte, hair2:'' | hex | id de tinte, hairFx:'' | id, style,
 *     hall:{ head, eyes, paint, marks, beard, neck, under, band, armL, armR, elbows, wristL, wristR, hands, legs, knees, socks,
 *            ankle, shoes },  beach:{ …las mismas ranuras… },
 *     colors:{ acc, acc2, sock, shoe, glass, pad },      (fichas: auto | eq | ac | os | bl | ne | id de PALETTE)
 *     _keep:{ ruta: valor } }                             (solo si hace falta; ver «Compatibilidad» abajo)
 *   hair2 (segundo color de pelo: mechas, puntas), hairFx (efecto de pelo) y colors.pad (color de rodilleras) son de la 1.18 (plan del
 *   Vestuario, WP1): sane() los rellena si faltan ('' / '' / 'auto'), así que no se sube V.
 * «L» resuelto (lo que recibe doll.js, congelado): { skin, hair, hair2, hairFx, style, acc (= gorro), eyes … shoes, cA, cB, cSock,
 *   cShoe, cGlass, cPad } con los colores en hex o -1 (= auto, el de hoy; hair2 -1 = sin segundo color). Nunca lleva h: la altura la
 *   pone players.js.
 * Compatibilidad entre versiones (WP1): los ids NUNCA se borran ni se renombran (los nombres visibles sí cambian). Un id que este
 *   catálogo no conoce (de una versión más nueva) en una ruta conocida (style, skin, hair, hair2, hairFx, hall.<ranura>,
 *   beach.<ranura>, colors.<hueco>) no se pierde: se dibuja lo de por defecto y el valor se guarda en _keep[ruta] (textos con formato
 *   de id de ≤ 24 caracteres o colores de 24 bits); cuando una versión lo conoce, sane() lo vuelve a poner en su sitio. La UI borra
 *   _keep[ruta] al elegir otra cosa en esa ruta (si no, lo guardado volvería a pisar la elección). Los clientes 1.15.1 ya
 *   instalados no saben de _keep: al reescribir el guardado lo pierden (ver notes/players.md § Vestuario, «Entre versiones»).
 *
 * Guardado: localStorage 'make-the-cut.look' (JSON, v1, < 8 KB):
 *   { v:1, fits:[fit n.º 1, fit n.º 2], ft: ms de la última edición de fits (para unir con la cuenta),
 *     own:{ id:{ s:'carrera'|'tienda'|'gym'|'record'|'retos'|'hito'|'boss'|'online', t:ms } }, seen:{ id:1 } }
 *   Dañado → copia en 'make-the-cut.look.bak' y lost(); v > 1 (versión más nueva) → solo lectura (readOnly) y mergeRaw no lo rebaja.
 *   No se escribe hasta la primera edición (setFit) o el primer desbloqueo (grant). Lo de inicio no se guarda en own.
 *   La Carrera guarda su propio fit en c.life.look (career-life.js); el inventario (own) es global para todo el juego.
 *
 * API (VB.Look): ver el bloque del final. Notas para quien la usa:
 *   - Las ranuras armL/armR y wristL/wristR comparten objetos: cada objeto lleva slot (la 1ª) y slots (todas las que admite).
 *     Para listar lo de una ranura, mejor choices(slot, venue) o items(slot, venue).
 *   - fix() devuelve removed:[{slot, id, why, msg}]: why = el motivo («no cabe con el moño»), msg = el aviso entero
 *     («Quitado: Coronita (no cabe con el moño)»).
 *   - geoSig() cambia con todo lo que toca la malla (peinado, piel y pelo, que van por vértice, gorros, gafas, cuello, muñecas,
 *     manos, coderas, rodilleras, tobillera, zapatillas, manguitos por la bola del codo, la térmica) y con las fichas de color
 *     de las piezas que llevan ese color por vértice; un color que solo va en el atlas no lo cambia. atlasSig() cambia con
 *     cualquier cosa del L resuelto o de la equipación: si geoSig no cambió y atlasSig sí, basta con repintar el atlas.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var KEY = 'make-the-cut.look', V = 1, MAX_BYTES = 8192;

  var SLOTS = ['head', 'eyes', 'paint', 'marks', 'beard', 'neck', 'under', 'band', 'armL', 'armR', 'elbows', 'wristL', 'wristR',
    'hands', 'legs', 'knees', 'socks', 'ankle', 'shoes', 'ears'];
  // 'ears' (pendientes; 1.18, WP7 ronda 1) va al final: antes iban en 'head' y no se podían llevar con ningún gorro; al final no mueve
  // el azar de las demás ranuras ni lo que ya había
  // 'pad' (rodilleras, L.cPad) es de la 1.18: va al final para no mover nada de lo que ya había (random, firmas)
  var COLOR_KEYS = ['acc', 'acc2', 'sock', 'shoe', 'glass', 'pad'];
  // hueco de color → campo de L y letra de «vc»/«pc» (colores por vértice / pintados en el atlas de cada objeto)
  var COLOR_L = { acc: 'cA', acc2: 'cB', sock: 'cSock', shoe: 'cShoe', glass: 'cGlass', pad: 'cPad' };
  var VC_KEY = { A: 'acc', B: 'acc2', S: 'sock', H: 'shoe', G: 'glass', P: 'pad' };
  // origen de lo ganado (own[id].s): 'retos' (VB.Retos), 'hito' (nivel de perfil, VB.Profile), 'boss' (jefe de la Carrera) y
  // 'online' (primer partido online: VB.NetRec)
  var SRCS = ['carrera', 'tienda', 'gym', 'record', 'retos', 'hito', 'boss', 'online'];

  // ---------------------------------------------------------------- colores de identidad
  // Piel: los 10 SKINS de players.js (mismo orden) + 4 nuevos. Pelo: los 10 HAIRS + el del n.º 2 + canas, gris, platino y cobrizo.
  var SKINS = [0xdba27a, 0x8a5638, 0xc68a5f, 0xf0c6a4, 0xb07650, 0xe6b48e, 0x6e4430, 0xf3d0b0, 0xa36a48, 0xd9a07c,
    0x5a3626, 0xf7dcc4, 0xc9a27a, 0x9c6b4a];
  // 1.18 (WP2): + 6 naturales que se distinguen de los de antes (negro azulado, castaño rojizo, miel, rubio ceniza, pelirrojo y
  // blanco), al final para no mover nada (fromSeed lee los 11 primeros). En la UI van ordenados por luminancia (choices).
  var HAIRS = [0x3a2416, 0x241a14, 0x7a3a16, 0x1e1612, 0x6a4424, 0x9a6a3a, 0xb88a4e, 0x2b1d17, 0x4b2a18, 0xe0c070,
    0x3a2a1e, 0xd8d4cc, 0x8f8a86, 0xf1e3b0, 0xb4471c, 0x1c2438, 0x6e2a18, 0xc8913e, 0xbfb29a, 0xd2561c, 0xf6f3ec];
  var HAIR_NAMES = { 0x3a2416: 'Castaño oscuro', 0x241a14: 'Negro', 0x7a3a16: 'Caoba', 0x1e1612: 'Azabache', 0x6a4424: 'Castaño',
    0x9a6a3a: 'Avellana', 0xb88a4e: 'Rubio oscuro', 0x2b1d17: 'Moreno', 0x4b2a18: 'Chocolate', 0xe0c070: 'Rubio', 0x3a2a1e: 'Café',
    0xd8d4cc: 'Canas', 0x8f8a86: 'Gris', 0xf1e3b0: 'Platino', 0xb4471c: 'Cobrizo', 0x1c2438: 'Negro azulado', 0x6e2a18: 'Castaño rojizo',
    0xc8913e: 'Miel', 0xbfb29a: 'Rubio ceniza', 0xd2561c: 'Pelirrojo', 0xf6f3ec: 'Blanco' };
  function lum(h) { return (0.299 * ((h >> 16) & 255) + 0.587 * ((h >> 8) & 255) + 0.114 * (h & 255)) / 255; }
  // en la UI la piel va de clara a oscura; el nombre es «Tono N» en ese orden
  var SKIN_ORDER = SKINS.slice().sort(function (a, b) { return lum(b) - lum(a); });
  // el pelo natural en la UI: de oscuro a claro (1.18)
  var HAIR_ORDER = HAIRS.slice().sort(function (a, b) { return lum(a) - lum(b); });

  // Fichas de color: las fijas y la paleta (dorado se gana)
  var TOKENS = [{ id: 'auto', name: 'Automático' }, { id: 'eq', name: 'Color del equipo' }, { id: 'ac', name: 'Acento del equipo' },
    { id: 'os', name: 'Oscuro del equipo' }, { id: 'bl', name: 'Blanco', hex: 0xf4f4f4 }, { id: 'ne', name: 'Negro', hex: 0x22222a }];
  var PALETTE = [
    { id: 'rojo', name: 'Rojo', hex: 0xe0383e }, { id: 'naranja', name: 'Naranja', hex: 0xff8a2a },
    { id: 'amarillo', name: 'Amarillo', hex: 0xffd23a }, { id: 'verde', name: 'Verde', hex: 0x3fbf5a },
    { id: 'turquesa', name: 'Turquesa', hex: 0x2ec4c4 }, { id: 'azul', name: 'Azul', hex: 0x3a6cf0 },
    { id: 'morado', name: 'Morado', hex: 0x8a4fd8 }, { id: 'rosa', name: 'Rosa', hex: 0xff6fae },
    { id: 'gris', name: 'Gris', hex: 0x8a8f99 }, { id: 'dorado', name: 'Dorado', hex: 0xf2c14e, unlock: [{ fame: 6 }, { ach: 't5' }] }
  ];

  // ---------------------------------------------------------------- catálogo
  // Campos: id, name, slot (+ slots si admite varias), venue 'P' pista | 'Y' playa | 'A' ambas, rarity 0-3, unlock (alternativas:
  // vale cualquiera), geo (cambia la malla: geometría o color por vértice), vc (huecos de color que usa POR VÉRTICE: A acc, B acc2,
  // S sock, H shoe, G glass, P pad; tiene que cuadrar con geoSig de doll.js: lo comprueba VB.Doll.lookSelfTest), pc (huecos que solo
  // se PINTAN en el atlas; vc + pc = cols, de donde sale USES para la UI), tris [LOD0, LOD1, LOD2] (Δ MEDIDO sobre el muñeco base de
  // su sede —tupé y la ranura vacía; los peinados, sobre el tupé— con VB.Doll.lookSelfTest, que lo vuelve a medir y avisa si se
  // desfasa), fam (solo peinados: 'corto' | 'medio' | 'largo' | 'recogido' | 'textura', para agruparlos en la UI), hint (ayuda corta
  // en la UI), g 'm'|'f' y pl (género y número del nombre, para los avisos «no cabe con el moño»), lux (de lujo).
  var S = [{ start: 1 }];
  function shop(e) { return { shop: e }; }
  function rec(k, n) { return { rec: { k: k, n: n } }; }
  function gym(id, m) { return { gym: { id: id, m: m } }; }
  function lv(n) { return { lvl: n }; }                         // nivel de perfil (VB.Profile; S4-D2 §2.3, 8 premios: plan R3)
  function reto(id, m) { return { reto: { id: id, m: m } }; }    // reto de maestría id a nivel ≥ m (VB.Retos; S4-D1 §3.4)
  function boss(st) { return { boss: st }; }                    // primera victoria contra un jefe de ese estilo (S3-C3 §2.1)
  var HIDE_HAIR_HINT = 'Con gorra no se ve el peinado entero';
  var CATALOG = [
    // peinados (slot 'style'; común a pista y playa). vc 'A': las gomas del pelo recogido van en cA por vértice
    // 1.18 (WP2): casco de pelo nuevo (doll.js HAIR_STYLES): los 10 de siempre rehechos con los mismos ids y 22 nuevos (18 de inicio).
    // Con gorra ya no se quita ningún peinado: el gorro lo adapta (solo asoma lo de debajo del borde)
    { id: 'tupe', name: 'Tupé', slot: 'style', fam: 'corto', g: 'm' },
    { id: 'coleta', name: 'Coleta', slot: 'style', fam: 'recogido', vc: 'A', g: 'f', tris: [129, 173, 330] },
    { id: 'afro', name: 'Afro', slot: 'style', fam: 'textura', g: 'm', tris: [428, 490, 1088] },
    { id: 'flequillo', name: 'Tazón', slot: 'style', fam: 'medio', g: 'm' },
    { id: 'rapado', name: 'Rapado', slot: 'style', fam: 'corto', g: 'm' },
    { id: 'mono', name: 'Moño', slot: 'style', fam: 'recogido', vc: 'A', g: 'm', tris: [104, 170, 360] },
    { id: 'trenzas', name: 'Trenzas', slot: 'style', fam: 'largo', vc: 'A', g: 'f', pl: 1, tris: [218, 274, 484] },
    { id: 'dosmonos', name: 'Dos moños', slot: 'style', fam: 'recogido', vc: 'A', g: 'm', pl: 1, tris: [248, 326, 688] },
    { id: 'coletas', name: 'Coletas', slot: 'style', fam: 'recogido', vc: 'A', g: 'f', pl: 1, tris: [298, 396, 772] },
    { id: 'cresta', name: 'Cresta', slot: 'style', fam: 'corto', rarity: 1, unlock: [shop(3000), { gymN: 3 }], g: 'f', tris: [140, 300, 388] },
    { id: 'alCero', name: 'Al cero', slot: 'style', fam: 'corto', g: 'm' },
    { id: 'degradado', name: 'Degradado', slot: 'style', fam: 'corto', g: 'm' },
    { id: 'cepillo', name: 'Cepillo', slot: 'style', fam: 'corto', g: 'm' },
    { id: 'undercut', name: 'Undercut', slot: 'style', fam: 'corto', g: 'm', tris: [136, 223, 432] },
    { id: 'crop', name: 'Crop', slot: 'style', fam: 'corto', g: 'm' },
    { id: 'pinchos', name: 'Pinchos', slot: 'style', fam: 'corto', rarity: 1, unlock: [shop(3000), { fame: 1 }], g: 'm', pl: 1 },
    { id: 'rizosCortos', name: 'Rizos cortos', slot: 'style', fam: 'textura', g: 'm', pl: 1, tris: [100, 382, 848] },
    { id: 'afroCorto', name: 'Afro corto', slot: 'style', fam: 'textura', g: 'm' },
    { id: 'frohawk', name: 'Cresta afro', slot: 'style', fam: 'textura', rarity: 1, unlock: [shop(3500), { ach: 'w50' }], g: 'f', tris: [20, 30, 80] },
    { id: 'raices', name: 'Trenzas de raíz', slot: 'style', fam: 'textura', g: 'f', pl: 1, tris: [32, 118, 318] },
    { id: 'twists', name: 'Twists', slot: 'style', fam: 'textura', g: 'm', pl: 1, tris: [160, 454, 1076] },
    { id: 'rastas', name: 'Rastas', slot: 'style', fam: 'textura', rarity: 1, unlock: [shop(4000), { fame: 2 }], g: 'f', pl: 1, tris: [86, 148, 438] },
    { id: 'despeinado', name: 'Despeinado', slot: 'style', fam: 'medio', g: 'm', tris: [14, 115, 273] },
    { id: 'cortina', name: 'Flequillo cortina', slot: 'style', fam: 'medio', g: 'm', tris: [114, 116, 178] },
    { id: 'melenita', name: 'Melenita', slot: 'style', fam: 'medio', g: 'f', tris: [84, 130, 228] },
    { id: 'mullet', name: 'Mullet', slot: 'style', fam: 'medio', rarity: 1, unlock: [shop(3500), { ach: 's5' }], g: 'm', tris: [78, 80, 172] },
    { id: 'ondas', name: 'Ondas', slot: 'style', fam: 'largo', g: 'f', pl: 1, tris: [98, 200, 432] },
    { id: 'melena', name: 'Melena', slot: 'style', fam: 'largo', g: 'f', tris: [98, 200, 432] },
    { id: 'semirrecogido', name: 'Semirrecogido', slot: 'style', fam: 'largo', vc: 'A', g: 'm', tris: [228, 290, 616] },
    { id: 'coletaBaja', name: 'Coleta baja', slot: 'style', fam: 'recogido', vc: 'A', g: 'f', tris: [129, 173, 330] },
    { id: 'trenza', name: 'Trenza', slot: 'style', fam: 'recogido', vc: 'A', g: 'f', tris: [169, 192, 306] },
    { id: 'monoBajo', name: 'Moño bajo', slot: 'style', fam: 'recogido', vc: 'A', g: 'm', tris: [104, 170, 360] },
    // gorro
    { id: 'cinta', name: 'Cinta', slot: 'head', vc: 'AB', g: 'f', tris: [224, 294, 404] },
    { id: 'cintaRizo', name: 'Cinta de rizo', slot: 'head', unlock: [shop(800), rec('wins', 10)], vc: 'A', g: 'f', tris: [154, 224, 336] },
    { id: 'bandana', name: 'Pañuelo', slot: 'head', rarity: 1, unlock: [{ ach: 's10' }, gym('serve', 1), reto('r_aces', 2)], vc: 'A', g: 'm', hint: 'Con pañuelo no se ve el peinado entero', tris: [246, 285, 382] },
    { id: 'gorra', name: 'Gorra', slot: 'head', venue: 'Y', vc: 'AB', g: 'f', hint: HIDE_HAIR_HINT, tris: [222, 235, 430] },
    { id: 'gorraAtras', name: 'Gorra al revés', slot: 'head', venue: 'Y', vc: 'AB', g: 'f', hint: HIDE_HAIR_HINT, tris: [222, 235, 430] },
    { id: 'visera', name: 'Visera', slot: 'head', venue: 'Y', vc: 'AB', g: 'f', tris: [224, 260, 416] },
    { id: 'pescador', name: 'Gorro de pescador', slot: 'head', venue: 'Y', rarity: 1, unlock: [shop(4000)], vc: 'AB', g: 'm', hint: HIDE_HAIR_HINT, tris: [196, 197, 410] },
    { id: 'corona', name: 'Coronita', slot: 'head', rarity: 3, unlock: [{ ach: 't5' }], vc: 'A', g: 'f', tris: [164, 164, 248] },
    // ONLINE (fase 3, especialista net; decisión 4 de Ferran): la única recompensa del online. Gorra con «MTC» en el frontal; se gana al
    // terminar tu primer partido online (VB.NetRec.end la concede con origen 'online'). Vale en pista y en playa
    { id: 'gorraMTC', name: 'Online Beta Tester', slot: 'head', rarity: 2, unlock: [{ online: 1 }], vc: 'A', g: 'f', hint: 'Con «MTC» en el frontal. ' + HIDE_HAIR_HINT, tris: [236, 249, 444] },
    // 1.18 (WP7): objetos de cabeza que se leen de espaldas y desde arriba (diadema por la coronilla, pinzas detrás de la oreja, pompón, damero…)
    { id: 'diadema', name: 'Diadema', slot: 'head', vc: 'A', g: 'f', tris: [114, 132, 168] },
    { id: 'pinzas', name: 'Pinzas de pelo', slot: 'head', vc: 'A', g: 'f', pl: 1, tris: [84, 84, 84] },
    { id: 'gorroPompon', name: 'Gorro de lana', slot: 'head', venue: 'P', unlock: [shop(1200)], vc: 'AB', g: 'm', hint: 'De calentamiento, con pompón. ' + HIDE_HAIR_HINT, tris: [144, 189, 278] },
    { id: 'pescadorCuadros', name: 'Pescador de cuadros', slot: 'head', venue: 'Y', rarity: 1, unlock: [shop(6000), reto('r_digs', 2)], vc: 'AB', g: 'm', hint: HIDE_HAIR_HINT, tris: [196, 197, 410] },
    { id: 'viseraGafas', name: 'Visera con gafas', slot: 'head', venue: 'Y', rarity: 1, unlock: [shop(5000), reto('r_kills', 2)], vc: 'AB', g: 'f', hint: 'Las gafas de sol, apoyadas en la visera', tris: [246, 316, 442] },
    { id: 'pendientes', name: 'Pendientes de aro', slot: 'ears', g: 'm', pl: 1, tris: [72, 96, 96], hint: 'Con melena, melenita, ondas o semirrecogido el pelo los tapa' },   // (ronda 1: ranura propia, con cualquier gorro)
    // gafas
    { id: 'frente', name: 'Gafas en la frente', slot: 'eyes', venue: 'Y', vc: 'G', g: 'f', pl: 1, hint: 'Sin gorro o con la gorra al revés', tris: [180, 180, 256] },
    { id: 'pasta', name: 'Gafas de pasta', slot: 'eyes', vc: 'G', g: 'f', pl: 1, tris: [24, 24, 24] },
    { id: 'oscuras', name: 'Gafas oscuras', slot: 'eyes', venue: 'Y', unlock: [shop(1000)], vc: 'GA', g: 'f', pl: 1, tris: [54, 54, 72] },
    { id: 'deporte', name: 'Gafas deportivas', slot: 'eyes', rarity: 1, unlock: [{ fame: 2 }, gym('recv', 1), reto('r_recv', 2)], vc: 'GA', g: 'f', pl: 1, tris: [72, 72, 96] },
    { id: 'espejo', name: 'Gafas de espejo', slot: 'eyes', venue: 'Y', rarity: 2, unlock: [{ fame: 4 }, shop(15000)], vc: 'GA', g: 'f', pl: 1, tris: [54, 54, 72] },
    // 1.18 (WP7): redondas y de aviador (pintadas, con patillas) y la máscara de ventisca, con la correa ancha por detrás (se ve de espaldas)
    { id: 'gafasRedondas', name: 'Gafas redondas', slot: 'eyes', unlock: [shop(1200), lv(24)], vc: 'G', g: 'f', pl: 1, tris: [24, 24, 24] },
    { id: 'aviador', name: 'Gafas de aviador', slot: 'eyes', venue: 'Y', rarity: 1, unlock: [shop(3500), { fame: 2 }], vc: 'G', g: 'f', pl: 1, tris: [24, 24, 24] },
    { id: 'gafasVentisca', name: 'Máscara de ventisca', slot: 'eyes', venue: 'Y', rarity: 2, unlock: [reto('r_rally', 3), shop(16000)], vc: 'GA', g: 'f', hint: 'Con la correa por detrás', tris: [80, 100, 160] },
    // cara (pintada en el atlas: 0 triángulos)
    { id: 'zinc', name: 'Crema de zinc', slot: 'paint', venue: 'Y', g: 'f' },
    { id: 'rayas', name: 'Rayas bajo los ojos', slot: 'paint', g: 'f', pl: 1 },
    { id: 'rayasEq', name: 'Rayas del equipo', slot: 'paint', rarity: 1, unlock: [{ ach: 'duel5' }, rec('wins', 25), { chem: 3 }], g: 'f', pl: 1 },
    { id: 'estrella', name: 'Estrella en la mejilla', slot: 'paint', pc: 'A', rarity: 2, unlock: [{ fame: 5 }, shop(20000), reto('r_streak', 3)], g: 'f' },
    // 1.18 (WP7): media cara de afición (base y acento del equipo) y un rayo que cruza el ojo
    { id: 'pinturaEquipo', name: 'Pintura de afición', slot: 'paint', rarity: 1, unlock: [{ ach: 'ch10' }, shop(3000)], g: 'f', hint: 'Con los colores de tu equipo' },
    { id: 'rayoOjo', name: 'Rayo en el ojo', slot: 'paint', pc: 'A', rarity: 2, unlock: [reto('r_kills', 3), shop(15000)], g: 'm' },
    { id: 'pecas', name: 'Pecas', slot: 'marks', g: 'f', pl: 1 },
    { id: 'tirita', name: 'Tirita', slot: 'marks', unlock: [{ ach: 'm50' }, rec('played', 50)], g: 'f' },
    { id: 'tiraNasal', name: 'Tira nasal', slot: 'marks', pc: 'A', unlock: [shop(500), lv(2)], g: 'f' },
    { id: 'tiritaNariz', name: 'Tirita en la nariz', slot: 'marks', g: 'f' },   // (1.18, WP7)
    { id: 'bigote', name: 'Bigote', slot: 'beard', g: 'm' },
    { id: 'perilla', name: 'Perilla', slot: 'beard', g: 'f' },
    { id: 'tresDias', name: 'Barba de tres días', slot: 'beard', g: 'f' },
    { id: 'barba', name: 'Barba', slot: 'beard', g: 'f' },   // (1.18, WP3: barba completa; la lámina de boca es más ancha)
    { id: 'bigote70', name: 'Bigote de herradura', slot: 'beard', unlock: [shop(1000)], g: 'm' },   // (1.18, WP7)
    // cuello, cuerpo y brazos
    { id: 'medalla', name: 'Medalla', slot: 'neck', rarity: 2, unlock: [{ ach: 't1' }], vc: 'AB', g: 'f', tris: [112, 120, 188] },
    { id: 'conchas', name: 'Collar de conchas', slot: 'neck', venue: 'Y', unlock: [shop(800), lv(4)], g: 'm', tris: [88, 128, 592] },
    // 1.18 (WP7): pañuelo al cuello (con el nudo en la nuca), silbato y cadena de plata
    { id: 'bandanaCuello', name: 'Pañuelo al cuello', slot: 'neck', unlock: [shop(1200)], vc: 'A', g: 'm', tris: [136, 136, 190] },
    { id: 'silbato', name: 'Silbato', slot: 'neck', rarity: 1, unlock: [rec('played', 200), shop(5000)], vc: 'A', g: 'm', tris: [148, 148, 196] },
    { id: 'cadenaPlata', name: 'Cadena de plata', slot: 'neck', rarity: 1, unlock: [shop(6000), { fame: 3 }], g: 'f', tris: [92, 118, 174] },
    { id: 'termica', name: 'Camiseta térmica', slot: 'under', venue: 'P', vc: 'B', g: 'f', tris: [22, 32, 48] },
    { id: 'licra', name: 'Licra de surf', slot: 'under', venue: 'Y', rarity: 1, unlock: [shop(5000), lv(20)], vc: 'B', g: 'f', tris: [22, 32, 48] },   // geo: la bola del hombro, la del codo y el cuello alto van en cB (color por vértice)
    { id: 'licraCorta', name: 'Licra de manga corta', slot: 'under', venue: 'Y', unlock: [shop(1200)], vc: 'B', g: 'f', tris: [22, 32, 48] },   // (1.18, WP7: hombros, tronco y cuello alto en cB; la manga hasta medio brazo)
    { id: 'capitan', name: 'Brazalete', slot: 'band', rarity: 2, unlock: [{ fame: 4 }, { ach: 'top' }], geo: false, pc: 'A', g: 'm', hint: 'En el brazo izquierdo' },
    { id: 'malla', name: 'Malla corta', slot: 'legs', geo: false, pc: 'B', g: 'f' },   // en cB (automático: un color que se distinga del pantalón)
    { id: 'mallaLarga', name: 'Malla larga', slot: 'legs', unlock: [shop(1000), lv(6)], vc: 'B', pc: 'B', g: 'f' },   // geo: la bola de la rodilla sin rodillera va en cB
    { id: 'mallaUnLado', name: 'Malla de una pierna', slot: 'legs', unlock: [shop(1100)], vc: 'B', pc: 'B', g: 'f', hint: 'En la pierna izquierda' },   // (1.18, WP7: la rodilla sin rodillera va en cB)
    { id: 'malla34', name: 'Malla tres cuartos', slot: 'legs', unlock: [shop(1200), lv(32)], vc: 'B', pc: 'B', g: 'f' },
    { id: 'manguito', name: 'Manguito', slot: 'arm', venue: 'P', vc: 'A', pc: 'B', g: 'm' },
    { id: 'manguitoRayas', name: 'Manguito de rayas', slot: 'arm', venue: 'P', unlock: [shop(1200), lv(8)], vc: 'A', pc: 'B', g: 'm' },
    { id: 'manguitoCuadros', name: 'Manguito de cuadros', slot: 'arm', venue: 'P', rarity: 1, unlock: [shop(6000)], vc: 'A', pc: 'B', g: 'm' },
    { id: 'manguitoLlamas', name: 'Manguito de llamas', slot: 'arm', venue: 'P', rarity: 2, unlock: [{ ach: 'a50' }, gym('serve', 3)], pc: 'A', g: 'm' },
    { id: 'manguitoRayos', name: 'Manguito de rayos', slot: 'arm', venue: 'P', rarity: 2, unlock: [{ ach: 'b50' }, gym('block', 3)], vc: 'A', pc: 'B', g: 'm' },
    { id: 'manguitoOro', name: 'Manguito dorado', slot: 'arm', venue: 'P', rarity: 3, unlock: [shop(45000)], lux: 1, g: 'm' },
    { id: 'kinesio', name: 'Kinesio', slot: 'arm', unlock: [{ ach: 'm1' }, rec('played', 1)], geo: false, pc: 'A', g: 'm' },
    // 1.18 (WP7): manguitos que se distinguen de espaldas: corto (hasta el codo), de antebrazo, bicolor, degradado, de estrellas y con tu número
    { id: 'manguitoMedio', name: 'Manguito corto', slot: 'arm', venue: 'P', vc: 'A', pc: 'B', g: 'm', hint: 'Del hombro al codo' },
    { id: 'manguitoBajo', name: 'Manguito de antebrazo', slot: 'arm', venue: 'P', vc: 'A', pc: 'B', g: 'm', hint: 'Del codo a la muñeca' },
    { id: 'manguitoBicolor', name: 'Manguito bicolor', slot: 'arm', venue: 'P', unlock: [shop(1200)], vc: 'AB', g: 'm' },
    { id: 'manguitoFundido', name: 'Manguito degradado', slot: 'arm', venue: 'P', rarity: 1, unlock: [shop(4000), gym('atk', 2)], vc: 'AB', g: 'm' },
    { id: 'manguitoEstrella', name: 'Manguito de estrellas', slot: 'arm', venue: 'P', rarity: 2, unlock: [{ ach: 'p500' }, shop(18000)], vc: 'A', pc: 'B', g: 'm' },
    { id: 'manguitoNumero', name: 'Manguito con dorsal', slot: 'arm', venue: 'P', rarity: 1, unlock: [shop(5000), rec('wins', 100)], vc: 'A', pc: 'B', g: 'm', hint: 'Con tu número' },
    { id: 'coderas', name: 'Coderas', slot: 'elbows', venue: 'P', vc: 'AP', g: 'f', pl: 1, tris: [80, 80, 168] },
    // manos, piernas y pies
    { id: 'muneq', name: 'Muñequera de rizo', slot: 'wrist', vc: 'A', g: 'f', tris: [80, 100, 160] },
    { id: 'reloj', name: 'Reloj gordo', slot: 'wrist', rarity: 1, unlock: [{ ach: 'up' }, rec('wins', 50)], vc: 'A', g: 'm', tris: [80, 108, 172] },
    { id: 'cintaMuneca', name: 'Esparadrapo en la muñeca', slot: 'wrist', vc: 'A', g: 'm', tris: [80, 100, 160] },   // (1.18, WP7)
    { id: 'muneqDoble', name: 'Muñequera doble', slot: 'wrist', unlock: [shop(1000)], vc: 'AB', g: 'f', tris: [96, 120, 192] },
    { id: 'dedos', name: 'Dedos vendados', slot: 'hands', rarity: 1, unlock: [{ ach: 'b50' }, gym('block', 1)], g: 'm', pl: 1 },
    { id: 'mitones', name: 'Mitones', slot: 'hands', venue: 'Y', rarity: 1, unlock: [shop(3000), lv(14)], vc: 'A', g: 'm', pl: 1 },
    { id: 'dedosColor', name: 'Dedos vendados de color', slot: 'hands', unlock: [shop(900), gym('set', 1)], vc: 'A', g: 'm', pl: 1 },   // (1.18, WP7)
    { id: 'cortas', name: 'Rodilleras', slot: 'knees', venue: 'P', vc: 'P', g: 'f', pl: 1 },
    { id: 'altas', name: 'Rodilleras altas', slot: 'knees', venue: 'P', vc: 'P', g: 'f', pl: 1, tris: [64, 72, 112] },
    { id: 'bajadas', name: 'Rodilleras bajadas', slot: 'knees', venue: 'P', rarity: 1, unlock: [{ ach: 'm150' }, rec('played', 100)], vc: 'P', g: 'f', pl: 1, tris: [72, 108, 168] },
    { id: 'rodillerasColor', name: 'Rodilleras de dos colores', slot: 'knees', venue: 'P', unlock: [shop(1000)], vc: 'PA', g: 'f', pl: 1 },   // (1.18, WP7)
    { id: 'rodilleraUna', name: 'Una rodillera', slot: 'knees', venue: 'P', unlock: [shop(1100), lv(18)], vc: 'P', g: 'f', hint: 'Solo en la rodilla izquierda' },
    { id: 'tobilleros', name: 'Calcetines tobilleros', slot: 'socks', venue: 'P', geo: false, pc: 'S', g: 'm', pl: 1 },
    { id: 'media', name: 'Calcetines', slot: 'socks', venue: 'P', geo: false, pc: 'S', g: 'm', pl: 1 },
    { id: 'altos', name: 'Calcetines altos', slot: 'socks', venue: 'P', geo: false, pc: 'S', g: 'm', pl: 1 },
    { id: 'altosRayas', name: 'Calcetines altos de rayas', slot: 'socks', venue: 'P', unlock: [shop(900)], geo: false, pc: 'S', g: 'm', pl: 1 },
    { id: 'desparejados', name: 'Calcetines desparejados', slot: 'socks', venue: 'P', rarity: 1, unlock: [{ ach: 's5' }, rec('streak', 5)], geo: false, pc: 'SB', g: 'm', pl: 1 },
    { id: 'compresion', name: 'Calcetines de compresión', slot: 'socks', venue: 'P', unlock: [shop(1100)], geo: false, pc: 'S', g: 'm', pl: 1 },   // (1.18, WP7)
    { id: 'lunares', name: 'Calcetines de lunares', slot: 'socks', venue: 'P', unlock: [shop(1000), lv(12)], geo: false, pc: 'S', g: 'm', pl: 1 },
    { id: 'caido', name: 'Calcetines caídos', slot: 'socks', venue: 'P', unlock: [shop(900), lv(16)], geo: false, pc: 'S', g: 'm', pl: 1 },
    { id: 'blanca', name: 'Tobillera', slot: 'ankle', venue: 'P', g: 'f' },
    { id: 'tela', name: 'Tobillera de tela', slot: 'ankle', venue: 'Y', vc: 'A', g: 'f' },
    { id: 'pulseraTob', name: 'Pulsera de tobillo', slot: 'ankle', venue: 'Y', vc: 'A', g: 'f' },
    { id: 'escarpines', name: 'Escarpines', slot: 'ankle', venue: 'Y', rarity: 1, unlock: [shop(3500)], vc: 'S', g: 'm', pl: 1 },
    { id: 'escarpinesNeo', name: 'Escarpines de neopreno', slot: 'ankle', venue: 'Y', rarity: 1, unlock: [shop(4500)], vc: 'A', g: 'm', pl: 1 },   // (1.18, WP7)
    { id: 'vendajeTob', name: 'Tobillo vendado', slot: 'ankle', venue: 'Y', g: 'm' },
    { id: 'cuentasTob', name: 'Tobillera de cuentas', slot: 'ankle', venue: 'Y', unlock: [shop(900), reto('r_venues', 1)], vc: 'A', g: 'f', tris: [0, 0, 80] },   // (Δ sobre la de tela de serie)
    { id: 'clasicas', name: 'Zapatillas', slot: 'shoes', venue: 'P', vc: 'H', g: 'f', pl: 1 },
    { id: 'negras', name: 'Zapatillas negras', slot: 'shoes', venue: 'P', g: 'f', pl: 1 },
    { id: 'neon', name: 'Zapatillas neón', slot: 'shoes', venue: 'P', rarity: 1, unlock: [shop(8000), lv(28)], vc: 'H', g: 'f', pl: 1 },
    { id: 'doradas', name: 'Zapatillas doradas', slot: 'shoes', venue: 'P', rarity: 3, unlock: [{ ach: 'mvp' }, { award: 'mvp' }, shop(60000)], lux: 1, g: 'f', pl: 1 },
    { id: 'botinAlto', name: 'Botines altos', slot: 'shoes', venue: 'P', rarity: 1, unlock: [shop(4500)], vc: 'H', g: 'm', pl: 1, tris: [104, 104, 136] },   // (1.18, WP7; ronda 1: caña de 12 cm con la tobillera dentro —medido 112/96/136—)
    { id: 'suelaGorda', name: 'Zapatillas de suela gorda', slot: 'shoes', venue: 'P', rarity: 1, unlock: [shop(7000), gym('block', 2)], vc: 'H', g: 'f', pl: 1 },
    { id: 'bicolor', name: 'Zapatillas bicolor', slot: 'shoes', venue: 'P', rarity: 1, unlock: [shop(6000), lv(36)], vc: 'H', g: 'f', pl: 1 },
    { id: 'retro', name: 'Zapatillas retro', slot: 'shoes', venue: 'P', rarity: 1, unlock: [shop(5000), reto('r_win', 2)], vc: 'H', g: 'f', pl: 1 },
    // tintes de fantasía (el color de pelo se guarda como su id)
    { id: 'tAzul', name: 'Tinte azul', slot: 'hairTint', hex: 0x3a6cf0, unlock: [shop(1200), lv(10)], g: 'm' },
    { id: 'tRosa', name: 'Tinte rosa', slot: 'hairTint', hex: 0xff7fb8, unlock: [shop(1200)], g: 'm' },
    { id: 'tVerde', name: 'Tinte verde', slot: 'hairTint', hex: 0x3fbf5a, rarity: 1, unlock: [{ fame: 2 }, { dias: 7 }], g: 'm' },
    { id: 'tMorado', name: 'Tinte morado', slot: 'hairTint', hex: 0x8a4fd8, rarity: 1, unlock: [{ gymN: 5 }], g: 'm' },
    { id: 'tTurquesa', name: 'Tinte turquesa', slot: 'hairTint', hex: 0x2ec4c4, rarity: 2, unlock: [{ ach: 'n9' }, { retoN: 30 }], g: 'm' },
    { id: 'tDorado', name: 'Tinte dorado', slot: 'hairTint', hex: 0xe8b830, rarity: 3, unlock: [shop(40000)], lux: 1, g: 'm' },
    // 1.18 (WP2): 5 tintes más y el del color del equipo (tEquipo: el primario de la equipación, por vértice; hex = el de reserva)
    { id: 'tRojo', name: 'Tinte rojo', slot: 'hairTint', hex: 0xd8263a, unlock: [shop(1200)], g: 'm' },
    { id: 'tNaranja', name: 'Tinte naranja', slot: 'hairTint', hex: 0xff7a1a, unlock: [shop(1200)], g: 'm' },
    { id: 'tLila', name: 'Tinte lila', slot: 'hairTint', hex: 0xb48cff, rarity: 1, unlock: [shop(3000), { fame: 1 }], g: 'm' },
    { id: 'tMenta', name: 'Tinte menta', slot: 'hairTint', hex: 0x7fe0b0, rarity: 1, unlock: [shop(3000), { ach: 'w1' }], g: 'm' },
    { id: 'tPlata', name: 'Tinte plateado', slot: 'hairTint', hex: 0xc8d0dc, rarity: 2, unlock: [shop(15000), { fame: 3 }], g: 'm' },
    { id: 'tEquipo', name: 'Tinte del equipo', slot: 'hairTint', hex: 0xd8262e, team: 1, rarity: 1, unlock: [shop(4000), { ach: 'm50' }], g: 'm', hint: 'Del color de tu equipación' },
    // efectos de pelo (fit.hairFx; el segundo color es fit.hair2 o, sin él, uno que contraste): color por vértice, 0 triángulos
    { id: 'raiz', name: 'Raíces', slot: 'hairFx', g: 'f', pl: 1, hint: 'Con el segundo color en la raíz' },
    { id: 'puntas', name: 'Puntas', slot: 'hairFx', g: 'f', pl: 1, hint: 'Con el segundo color en las puntas' },
    { id: 'mechas', name: 'Mechas', slot: 'hairFx', unlock: [shop(1200)], g: 'f', pl: 1, hint: 'Mechas del segundo color' },
    { id: 'flequilloFx', name: 'Flequillo teñido', slot: 'hairFx', unlock: [shop(1000)], g: 'm', hint: 'El flequillo del segundo color' },
    { id: 'mitad', name: 'Mitad y mitad', slot: 'hairFx', rarity: 1, unlock: [shop(3000), { fame: 2 }], g: 'f', hint: 'Media cabeza de cada color' },
    // objetos de jefe (S3-C3 §2.1): solo de la Carrera, por la primera victoria contra un jefe de ese estilo. Son variantes de
    // piezas que ya existen: «as» = la pieza que dibuja doll.js mientras no sepa dibujar la variante (resolve la sustituye)
    { id: 'munhCanon', name: 'Muñequera de cañón', slot: 'wrist', rarity: 2, unlock: [boss('saque')], as: 'muneq', vc: 'A', g: 'f', tris: [80, 100, 160] },
    { id: 'dedosMuro', name: 'Dedos de hierro', slot: 'hands', rarity: 2, unlock: [boss('muro')], as: 'dedos', g: 'm', pl: 1 },
    { id: 'manguitoMazo', name: 'Manguito del martillo', slot: 'arm', venue: 'P', rarity: 2, unlock: [boss('remate')], as: 'manguito', pc: 'A', g: 'm' },
    { id: 'rodiPulpo', name: 'Rodilleras de pulpo', slot: 'knees', venue: 'P', rarity: 2, unlock: [boss('defensa')], as: 'altas', g: 'f', pl: 1, tris: [64, 72, 112] },
    { id: 'tobiPulpo', name: 'Tobillera de pulpo', slot: 'ankle', venue: 'Y', rarity: 2, unlock: [boss('defensa')], as: 'tela', vc: 'A', g: 'f' },
    // ficha de color que se gana (la misma de PALETTE): así la Carrera la concede recorriendo el catálogo
    { id: 'dorado', name: 'Dorado', slot: 'color', hex: 0xf2c14e, rarity: 2, unlock: PALETTE[9].unlock, g: 'm' }
  ];
  var SLOT_GROUP = { arm: ['armL', 'armR'], wrist: ['wristL', 'wristR'] };
  // ranuras cuya pieza va en la malla (geometría o color por vértice); las demás (pintura, marcas, barba, brazalete, mallas,
  // calcetines) solo van en el atlas, salvo lo que diga geo:false en el objeto
  var GEO_SLOT = { head: 1, eyes: 1, ears: 1, neck: 1, under: 1, armL: 1, armR: 1, elbows: 1, wristL: 1, wristR: 1, hands: 1, knees: 1, ankle: 1, shoes: 1 };
  var BY_ID = {};
  CATALOG.forEach(function (it, i) {
    it.slots = SLOT_GROUP[it.slot] ? SLOT_GROUP[it.slot].slice() : [it.slot];
    if (SLOT_GROUP[it.slot]) it.slot = it.slots[0];
    it.venue = it.venue || 'A';
    it.rarity = it.rarity | 0;
    it.unlock = it.unlock || S;
    // cambia la malla: lo que tiene triángulos, color por vértice o es de una ranura de geometría (sin geo:false explícito)
    if (it.geo !== false) it.geo = !!(it.tris || it.vc || it.slot === 'style' || it.slot === 'hairTint' || it.slot === 'hairFx' || GEO_SLOT[it.slot]);
    it.vc = it.vc || '';
    it.pc = it.pc || '';
    it.cols = it.vc + it.pc.split('').filter(function (c) { return it.vc.indexOf(c) < 0; }).join('');
    it.fam = it.slot === 'style' ? it.fam || 'corto' : '';
    it.tris = it.tris || [0, 0, 0];
    it.hint = it.hint || '';
    it.pl = !!it.pl;
    it.lux = !!it.lux;
    it.as = it.as || '';
    it.team = !!it.team;
    it.ord = i;
    BY_ID[it.id] = it;
    Object.freeze(it.slots); Object.freeze(it.tris); Object.freeze(it);
  });
  var STYLES = CATALOG.filter(function (it) { return it.slot === 'style'; }).map(function (it) { return it.id; });
  // familias de peinados (orden de la UI) y, por hueco de color, los objetos que lo usan (por vértice o pintados en el atlas): la UI
  // dice qué pinta cada fila de color y avisa si con lo que llevas no se ve
  var HAIR_FAMS = ['corto', 'medio', 'largo', 'recogido', 'textura'];
  var USES = {};
  COLOR_KEYS.forEach(function (k) {
    var ch = Object.keys(VC_KEY).filter(function (c) { return VC_KEY[c] === k; })[0];
    USES[k] = Object.freeze(CATALOG.filter(function (it) { return it.cols.indexOf(ch) >= 0; }).map(function (it) { return it.id; }));
  });
  Object.freeze(USES);
  var TINTS = CATALOG.filter(function (it) { return it.slot === 'hairTint'; }).map(function (it) { return it.id; });
  var PAL_BY = {}; PALETTE.forEach(function (p) { PAL_BY[p.id] = p; Object.freeze(p); });
  var TOK_BY = {}; TOKENS.forEach(function (t) { TOK_BY[t.id] = t; Object.freeze(t); });

  // ---------------------------------------------------------------- compatibilidades (§1.4)
  // a: lo que se quita por defecto; b: lo que se quita si el cambio fue en la ranura de a (al elegir algo que choca, se quita lo
  // otro). why.a / why.b: el motivo cuando se quita a / b; {cabe} = cabe | caben (según el nombre quitado), {a}/{b} = el otro
  // objeto con artículo y en minúscula («el moño»).
  var HEAD_IDS = CATALOG.filter(function (it) { return it.slot === 'head'; }).map(function (it) { return it.id; });
  // 1.18 (WP2): los gorros ya no quitan peinados (doll.js los adapta por clase de gorro: el pelo asoma por debajo del borde, lo que
  // cuelga sale por la abertura o bajo el ala). Solo quedan las gafas en la frente, que no caben con ningún gorro salvo la gorra al revés
  // (1.18, WP3: encima de su copa; antes se veían a través de ella. Se queda: hay guardados de 1.15.1 con las dos cosas)
  var CLASH = [
    { a: { slot: 'eyes', ids: ['frente'] }, b: { slot: 'head', ids: HEAD_IDS.filter(function (id) { return id !== 'gorraAtras'; }) },
      why: { a: 'no caben con ese gorro', b: 'no {cabe} con {a}' } }
  ];
  CLASH.forEach(function (r) { Object.freeze(r.a.ids); Object.freeze(r.b.ids); Object.freeze(r.a); Object.freeze(r.b); Object.freeze(r.why); Object.freeze(r); });
  var STYLE_FALLBACK = 'tupe';   // al quitar un peinado que choca (ninguna regla lo nombra)
  // gorros de copa (gorra, gorra al revés, pescador y gorra MTC): el pelo solo asoma por debajo (doll.js HAT_CLASS; HAIR_UNDER_CAP dice
  // qué peinados asoman enteros)
  var HIDE_HAIR = ['gorra', 'gorraAtras', 'pescador', 'gorraMTC', 'bandana', 'gorroPompon', 'pescadorCuadros'];   // (bandana: 1.18, WP3, un casquete de verdad; WP7: gorro de lana y pescador de cuadros)

  // ---------------------------------------------------------------- utilidades
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function hash32(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return n >>> 0; }
  /** Hash de 32 bits de un texto (FNV-1a + mezcla): estable entre navegadores y node. */
  function hashStr(s) {
    s = String(s == null ? '' : s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return hash32(h >>> 0);
  }
  function hex8(n) { return ('0000000' + (n >>> 0).toString(16)).slice(-8); }
  // generador determinista (mulberry32): solo para fromSeed y random (semilla de la UI o del nombre); nunca g.rng
  function prng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () { a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
  function fmtEur(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function now() { return Date.now(); }
  /** 'hall' | 'beach' a partir de lo que pasen (true / 'Y' / 'beach' = playa); null si no dice (= las dos, en fix y ok). */
  function venueOf(v) {
    if (v === 'beach' || v === true || v === 'Y' || v === 'playa') return 'beach';
    if (v === 'hall' || v === false || v === 'P' || v === 'pista') return 'hall';
    return null;
  }
  function venueCode(v) { return v === 'beach' ? 'Y' : 'P'; }
  function slotOk(it, slot) { return !!it && it.slots.indexOf(slot) >= 0; }
  function venueOk(it, ven) { return !!it && (it.venue === 'A' || it.venue === venueCode(ven)); }
  /** ¿Vale ese valor en esa ranura y sede? ('' siempre vale) */
  function valid(slot, id, ven) { return id === '' || (typeof id === 'string' && own(BY_ID, id) && slotOk(BY_ID[id], slot) && venueOk(BY_ID[id], ven)); }
  function isHair(v) { return (typeof v === 'number' && HAIRS.indexOf(v) >= 0) || (typeof v === 'string' && TINTS.indexOf(v) >= 0); }
  function isColorTok(v) { return typeof v === 'string' && (own(TOK_BY, v) || own(PAL_BY, v)); }

  // ---------------------------------------------------------------- valores por defecto (iguales a MY_LOOKS de players.js)
  function emptySet() { var o = {}; SLOTS.forEach(function (s) { o[s] = ''; }); return o; }
  function defaults(i) {
    var two = i === 1, hall = emptySet(), beach = emptySet();
    hall.knees = 'cortas'; hall.socks = 'media'; hall.ankle = 'blanca'; hall.shoes = 'clasicas';
    beach.head = 'gorra'; beach.paint = 'zinc'; beach.ankle = 'tela';
    if (two) { hall.head = 'cinta'; beach.head = 'visera'; }
    return { v: V, skin: two ? 0x8a5638 : 0xdba27a, hair: two ? 0x3a2a1e : 0x3a2416, hair2: '', hairFx: '', style: two ? 'afro' : 'tupe',
      hall: hall, beach: beach, colors: { acc: 'auto', acc2: 'auto', sock: 'auto', shoe: 'auto', glass: 'auto', pad: 'auto' } };
  }
  // lo que pone fix al quitar algo fuera de su sede: nada, salvo en pista lo que lleva siempre un muñeco de pabellón
  function emptyFor(slot, ven) { var d = defaults(0)[ven][slot]; return (slot === 'knees' || slot === 'socks' || slot === 'ankle' || slot === 'shoes') ? d : ''; }

  function cloneFit(f) {
    var o = { v: V, skin: f.skin, hair: f.hair, hair2: f.hair2 == null ? '' : f.hair2, hairFx: f.hairFx == null ? '' : f.hairFx, style: f.style,
      hall: {}, beach: {}, colors: {} };
    SLOTS.forEach(function (s) { o.hall[s] = f.hall[s]; o.beach[s] = f.beach[s]; });
    COLOR_KEYS.forEach(function (k) { o.colors[k] = f.colors[k] == null ? 'auto' : f.colors[k]; });
    if (isObj(f._keep)) { var kp = {}, n = 0; Object.keys(f._keep).forEach(function (r) { kp[r] = f._keep[r]; n++; }); if (n) o._keep = kp; }
    return o;
  }
  // ---- _keep (WP1): lo que este catálogo no conoce se guarda aparte para no perderlo (ver la cabecera)
  var KEEP_ID = /^[a-z][a-zA-Z0-9]{1,23}$/;
  var KEEP_HEX = { skin: 1, hair: 1, hair2: 1 };   // rutas donde un color de 24 bits que no está en la lista puede ser de una versión nueva
  /** ¿Es una ruta conocida del fit? (style, skin, hair, hair2, hairFx, hall.<ranura>, beach.<ranura>, colors.<hueco>) */
  function keepPath(r) {
    if (r === 'style' || r === 'skin' || r === 'hair' || r === 'hair2' || r === 'hairFx') return true;
    var m = /^(hall|beach|colors)\.([a-zA-Z0-9]+)$/.exec(r);
    return !!m && (m[1] === 'colors' ? COLOR_KEYS.indexOf(m[2]) >= 0 : SLOTS.indexOf(m[2]) >= 0);
  }
  /** ¿Se guarda v en _keep[r]? Solo lo DESCONOCIDO con formato de id (≤ 24) o de color: lo conocido que no vale ahí (un gorro de playa
   *  en la pista) se quita como siempre (fix lo avisa) y la basura se tira. */
  function keepFmt(r, v) {
    if (typeof v === 'number') return !!KEEP_HEX[r] && v === Math.floor(v) && v >= 0 && v <= 0xffffff;
    return typeof v === 'string' && r !== 'skin' && KEEP_ID.test(v);
  }
  function keepable(r, v) { return keepFmt(r, v) && (typeof v === 'number' || (!own(BY_ID, v) && !own(PAL_BY, v) && !own(TOK_BY, v))); }
  // valor de una ruta en un fit (fit.colors.acc → 'colors.acc') y si es válido ahí
  function pathGet(f, r) { var k = r.indexOf('.'); if (k < 0) return f[r]; var o = f[r.slice(0, k)]; return isObj(o) ? o[r.slice(k + 1)] : undefined; }
  function pathSet(f, r, v) { var k = r.indexOf('.'); if (k < 0) f[r] = v; else f[r.slice(0, k)][r.slice(k + 1)] = v; }
  function pathOk(r, v) {
    if (r === 'skin') return typeof v === 'number' && SKINS.indexOf(v) >= 0;
    if (r === 'hair') return isHair(v);
    if (r === 'hair2') return v === '' || isHair(v);
    if (r === 'hairFx') return v === '' || (typeof v === 'string' && own(BY_ID, v) && BY_ID[v].slot === 'hairFx');
    if (r === 'style') return typeof v === 'string' && STYLES.indexOf(v) >= 0;
    var k = r.indexOf('.'), a = r.slice(0, k), b = r.slice(k + 1);
    return a === 'colors' ? isColorTok(v) : valid(b, v, a);
  }
  function keepPaths() {
    var out = ['skin', 'hair', 'hair2', 'hairFx', 'style'];
    ['hall', 'beach'].forEach(function (ven) { SLOTS.forEach(function (s) { out.push(ven + '.' + s); }); });
    COLOR_KEYS.forEach(function (k) { out.push('colors.' + k); });
    return out;
  }
  var KEEP_PATHS = keepPaths();
  // saneado campo a campo sin reglas de compatibilidad (lo irreparable vuelve al valor por defecto de esa ranura; lo desconocido,
  // además, a _keep). Lo que ya estaba en _keep y ahora se conoce vuelve a su sitio
  /** Los pendientes iban en 'head' (WP7, antes de la ronda 1): pasan a su ranura 'ears' y el gorro queda libre. Copia; fit no cambia.
   *  (Pulido: ese formato nunca se publicó —no está en main ni en los guardados 1.15.1—; solo lo pueden tener los guardados de prueba
   *  de la rama personaje. Se queda por eso, con su prueba en looktest, y se puede QUITAR en la versión siguiente a 1.18.0.) */
  function earsMove(fit) {
    var mv = ['hall', 'beach'].filter(function (v) { return isObj(fit[v]) && fit[v].head === 'pendientes'; });
    if (!mv.length) return fit;
    var f = {}, k;
    for (k in fit) if (own(fit, k)) f[k] = fit[k];
    mv.forEach(function (v) {
      var s = {}; for (k in fit[v]) if (own(fit[v], k)) s[k] = fit[v][k];
      s.head = ''; if (!s.ears) s.ears = 'pendientes'; f[v] = s;
    });
    return f;
  }
  function saneRaw(fit, i) {
    var d = defaults(i === 1 ? 1 : 0);
    if (!isObj(fit)) return d;
    fit = earsMove(fit);
    var o = cloneFit(d), keep = {}, nk = 0, old = isObj(fit._keep) ? fit._keep : null;
    KEEP_PATHS.forEach(function (r) {
      var v = pathGet(fit, r), k = old && own(old, r) && keepFmt(r, old[r]) ? old[r] : undefined;
      if (v !== undefined && pathOk(r, v)) pathSet(o, r, v);
      else if (keepable(r, v)) k = v;          // desconocido que llega ahora: manda sobre lo que hubiera en _keep
      if (k === undefined) return;
      if (pathOk(r, k)) pathSet(o, r, k);      // lo guardó una versión más nueva y esta ya lo conoce: vuelve a su sitio
      else if (keepable(r, k)) { keep[r] = k; nk++; }   // sigue sin conocerse (con un valor bueno en la ruta, _keep sigue: la UI lo
      // borra al elegir otra cosa); lo conocido que no vale en esa ruta (un gorro de playa en la pista) se tira, como en la ruta
    });
    if (nk > 0) o._keep = keep;
    return o;
  }
  /** Borra _keep[ruta] de un fit (la UI, al elegir otra cosa en esa ruta). ruta: 'style', 'hall.head', 'colors.acc'… */
  function unkeep(f, r) {
    if (!isObj(f) || !isObj(f._keep) || !own(f._keep, r)) return false;
    delete f._keep[r];
    if (!Object.keys(f._keep).length) delete f._keep;
    return true;
  }

  // ---------------------------------------------------------------- reglas
  function art(id) {
    var it = BY_ID[id]; if (!it) return String(id);
    var nm = it.name.charAt(0).toLowerCase() + it.name.slice(1);
    return (it.pl ? (it.g === 'f' ? 'las ' : 'los ') : (it.g === 'f' ? 'la ' : 'el ')) + nm;
  }
  function whyText(tpl, removedId, otherId, otherKey) {
    var it = BY_ID[removedId];
    return tpl.replace('{cabe}', it && it.pl ? 'caben' : 'cabe').replace('{' + otherKey + '}', art(otherId));
  }
  function removedRow(slot, id, why) { return { slot: slot, id: id, why: why, msg: 'Quitado: ' + name(id) + ' (' + why + ')' }; }
  function getVal(f, ven, slot) { return slot === 'style' ? f.style : f[ven][slot]; }
  function setGone(f, ven, slot) { if (slot === 'style') f.style = STYLE_FALLBACK; else f[ven][slot] = ''; }

  /** Aplica las compatibilidades sobre una copia. venue: 'hall' | 'beach' (null = las dos); changedSlot: la ranura que acaba de
   *  cambiar (gana ella; lo otro se quita). Devuelve {fit, removed:[{slot, id, why, msg}]}. */
  function fix(fit, venue, changedSlot) {
    var f = saneRaw(fit, 0), removed = [], vens = venueOf(venue) ? [venueOf(venue)] : ['hall', 'beach'];
    // (saneRaw quita en silencio lo que no es de la sede; aquí se avisa: se mira el fit original)
    vens.forEach(function (ven) {
      var src = isObj(fit) && isObj(fit[ven]) ? fit[ven] : {};
      SLOTS.forEach(function (s) {
        var id = src[s];
        if (typeof id === 'string' && id && own(BY_ID, id) && slotOk(BY_ID[id], s) && !venueOk(BY_ID[id], ven)) {
          f[ven][s] = emptyFor(s, ven);
          removed.push(removedRow(s, id, BY_ID[id].venue === 'Y' ? 'solo en playa' : 'solo en pista'));
        }
      });
    });
    // el peinado es común a las dos sedes: sus reglas se miran también en la otra (elegir Afro en la playa quita el Pañuelo de pista
    // y se avisa ahora, no en silencio al cambiar de sede o al guardar). En la otra sede solo cuenta como cambiado el peinado: un
    // gorro elegido en esta no quita nada allí
    var cvens = vens.length === 2 ? vens : vens.concat([vens[0] === 'hall' ? 'beach' : 'hall']);
    for (var pass = 0; pass < 4; pass++) {
      var any = false;
      cvens.forEach(function (ven) {
        var other = vens.indexOf(ven) < 0, chg = other && changedSlot !== 'style' ? null : changedSlot;
        CLASH.forEach(function (r) {
          if (other && r.a.slot !== 'style' && r.b.slot !== 'style') return;
          var va = getVal(f, ven, r.a.slot), vb = getVal(f, ven, r.b.slot);
          if (r.a.ids.indexOf(va) < 0 || r.b.ids.indexOf(vb) < 0) return;
          var dropB = chg === r.a.slot;
          var side = dropB ? r.b : r.a, gone = dropB ? vb : va, keep = dropB ? va : vb;
          setGone(f, ven, side.slot);
          var row = removedRow(side.slot, gone, whyText(dropB ? r.why.b : r.why.a, gone, keep, dropB ? 'a' : 'b'));
          if (side.slot !== 'style') row.ven = ven;   // la sede de lo quitado (la UI avisa aparte de lo de la otra sede)
          removed.push(row);
          any = true;
        });
      });
      if (!any) break;
    }
    // el mismo aviso dos veces (un peinado quitado por el gorro de pista y el de playa) se dice una
    var seen = {};
    removed = removed.filter(function (x) { var k = x.slot + ':' + x.id; if (seen[k]) return false; seen[k] = 1; return true; });
    return { fit: f, removed: removed };
  }
  /** ¿Cumple el fit las reglas de sede y compatibilidad? (venue null = las dos sedes) */
  function ok(fit, venue) {
    if (!isObj(fit)) return false;
    var vens = venueOf(venue) ? [venueOf(venue)] : ['hall', 'beach'];
    for (var i = 0; i < vens.length; i++) {
      var ven = vens[i], set = fit[ven];
      if (!isObj(set)) return false;
      for (var j = 0; j < SLOTS.length; j++) if (own(set, SLOTS[j]) && !valid(SLOTS[j], set[SLOTS[j]], ven)) return false;
      for (var k = 0; k < CLASH.length; k++) {
        var r = CLASH[k];
        var va = r.a.slot === 'style' ? fit.style : set[r.a.slot], vb = r.b.slot === 'style' ? fit.style : set[r.b.slot];
        if (r.a.ids.indexOf(va) >= 0 && r.b.ids.indexOf(vb) >= 0) return false;
      }
    }
    return true;
  }
  /** Fit válido a partir de cualquier cosa: ids de otra ranura o sede y colores fuera de lista vuelven al valor por defecto;
   *  después se aplican las compatibilidades. NO quita lo bloqueado (eso es wearable, al guardar). */
  function sane(fit, i) { return fix(saneRaw(fit, i), null, null).fit; }

  // ---------------------------------------------------------------- resolver para doll.js
  function hairHex(v, tc) {
    if (typeof v !== 'string') return v;
    var it = BY_ID[v]; if (!it) return HAIRS[0];
    if (it.team && tc && typeof tc.base === 'number' && isFinite(tc.base)) return tc.base;   // tEquipo: el primario de la equipación
    return it.hex;
  }
  function mixHex(a, b, t) {
    var ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  }
  /** Color de las cejas (y la barba): con un tinte de fantasía, el natural del segundo color si lo es o un castaño tirando al tinte. */
  function browHex(f, tc) {
    if (typeof f.hair === 'number') return f.hair;
    if (typeof f.hair2 === 'number') return f.hair2;
    return mixHex(hairHex(f.hair, tc), 0x3a2416, 0.6);
  }
  function colorHex(tok, tc) {
    if (own(PAL_BY, tok)) return PAL_BY[tok].hex;
    var t = TOK_BY[tok];
    if (!t || tok === 'auto') return -1;
    if (t.hex != null) return t.hex;
    var k = tok === 'eq' ? 'base' : tok === 'ac' ? 'accent' : 'dark', v = tc && tc[k];
    return typeof v === 'number' && isFinite(v) ? v : -1;
  }
  /** Lo que se pasa a doll.js en esa ranura: el id, o su pieza base («as») si doll.js aún no sabe dibujar la variante
   *  (VB.Doll.ITEMS). Sin doll.js (node), la base. */
  function drawId(slot, id) {
    var it = id && BY_ID[id];
    if (!it || !it.as) return id;
    var D = VB.Doll && VB.Doll.ITEMS, t = D && D[slot];
    return t && t[id] ? id : it.as;
  }
  function resolveRaw(f, ven, tc) {
    var set = f[ven], L = { skin: f.skin, hair: hairHex(f.hair, tc), hair2: f.hair2 === '' ? -1 : hairHex(f.hair2, tc), brow: browHex(f, tc), hairFx: f.hairFx, style: f.style,
      acc: drawId('head', set.head) };
    SLOTS.forEach(function (s) { if (s !== 'head') L[s] = drawId(s, set[s]); });
    COLOR_KEYS.forEach(function (k) { L[COLOR_L[k]] = colorHex(f.colors[k], tc); });
    return L;
  }
  /** L resuelto y congelado (§2.2) para la sede ('hall' | 'beach') y la equipación tc ({base, accent, dark…}). Sin h. */
  function resolve(fit, venue, tc) { return Object.freeze(resolveRaw(sane(fit, 0), venueOf(venue) || 'hall', tc)); }

  /** Firma de lo que cambia la malla del muñeco (sin equipación: sus colores se ven por ficha, no por hex). */
  function geoSig(fit, venue) {
    var f = sane(fit, 0), ven = venueOf(venue) || 'hall', set = f[ven], parts = [ven, f.skin, hairHex(f.hair), f.style], vc = {};
    if (f.hair2 !== '' || f.hairFx !== '') parts.push('h2=' + (f.hair2 === '' ? '' : hairHex(f.hair2)), 'fx=' + f.hairFx);
    var st = BY_ID[f.style]; for (var j = 0; st && j < st.vc.length; j++) vc[VC_KEY[st.vc.charAt(j)]] = 1;   // gomas del pelo recogido
    SLOTS.forEach(function (s) {
      var it = set[s] && BY_ID[set[s]];
      if (!it || !it.geo) return;
      parts.push(s + '=' + it.id);
      for (var i = 0; i < it.vc.length; i++) vc[VC_KEY[it.vc.charAt(i)]] = 1;
    });
    COLOR_KEYS.forEach(function (k) { if (vc[k]) parts.push(k + '~' + f.colors[k]); });
    return 'g' + hex8(hashStr(parts.join('|')));
  }
  var TC_KEYS = ['base', 'top', 'accent', 'dark', 'trim', 'shorts', 'sole', 'band', 'pad', 'pattern', 'numFill'];
  /** Firma de todo lo que se pinta en el atlas (L resuelto entero + equipación). */
  function atlasSig(fit, venue, tc) {
    var ven = venueOf(venue) || 'hall', L = resolveRaw(sane(fit, 0), ven, tc), parts = [ven];
    Object.keys(L).sort().forEach(function (k) { parts.push(k + '=' + L[k]); });
    if (isObj(tc)) TC_KEYS.forEach(function (k) { if (tc[k] != null) parts.push('tc.' + k + '=' + tc[k]); });
    return 'a' + hex8(hashStr(parts.join('|')));
  }
  function canon(f) {
    var p = ['v' + V, f.skin, typeof f.hair === 'number' ? f.hair : '#' + f.hair, f.style];
    ['hall', 'beach'].forEach(function (ven) { SLOTS.forEach(function (s) { p.push(f[ven][s]); }); });
    COLOR_KEYS.forEach(function (k) { if (k !== 'pad' || f.colors[k] !== 'auto') p.push(f.colors[k]); });
    if (f.hair2 !== '' || f.hairFx !== '') p.push('h2:' + f.hair2, 'fx:' + f.hairFx);
    return p.join('|');
  }
  /** Firma corta de un fit (8 hex). Dos fits que se ven igual dan la misma; null/indefinido da ''. */
  function sig(fit) { return fit == null ? '' : hex8(hashStr(canon(sane(fit, 0)))); }

  // ---------------------------------------------------------------- generadores
  /** Fit determinista a partir de un número (compañero de la Carrera de playa: hashStr de su nombre). Solo objetos de inicio. */
  // (1.18) los peinados de inicio de 1.15 (mismo orden): el primer sorteo es el de siempre, así el aspecto no cambia; luego, en 1 de
  // cada 4, uno de los nuevos (sorteo aparte al final). keepOld (jefes): sin ese sorteo, el jefe de siempre
  var SEED_OLD = ['tupe', 'coleta', 'afro', 'flequillo', 'rapado', 'mono', 'trenzas', 'dosmonos', 'coletas'];
  function fromSeed(n, keepOld) {
    var r = prng(hash32((n >>> 0) ^ 0x5bd1e995)), d = defaults(0), f = cloneFit(d), h = f.hall, b = f.beach;
    var pr = function (p) { return r() < p; };
    f.skin = pick(r, SKINS);
    f.hair = pick(r, HAIRS.slice(0, 11).concat(pr(0.25) ? [0xd8d4cc, 0x8f8a86, 0xf1e3b0, 0xb4471c] : []));
    f.style = pick(r, SEED_OLD);
    // cara (común a las dos sedes: es la misma persona)
    var beard = pr(0.3) ? pick(r, ['bigote', 'perilla', 'tresDias']) : '';
    var marks = pr(0.18) ? 'pecas' : '';
    h.beard = b.beard = beard; h.marks = b.marks = marks;
    h.paint = pr(0.12) ? 'rayas' : '';
    b.paint = pr(0.7) ? 'zinc' : pr(0.4) ? 'rayas' : '';
    if (pr(0.1)) h.eyes = b.eyes = 'pasta';
    // pista
    h.head = pr(0.25) ? 'cinta' : '';
    if (pr(0.2)) h.under = 'termica';
    if (pr(0.2)) h[pr(0.5) ? 'armL' : 'armR'] = 'manguito';
    if (pr(0.15)) h.elbows = 'coderas';
    if (pr(0.2)) h[pr(0.5) ? 'wristL' : 'wristR'] = 'muneq';
    if (pr(0.15)) h.legs = 'malla';
    h.knees = pr(0.25) ? 'altas' : 'cortas';
    h.socks = pick(r, ['media', 'media', 'altos', 'tobilleros']);
    h.shoes = pr(0.3) ? 'negras' : 'clasicas';
    // playa
    b.head = pick(r, ['gorra', 'visera', 'gorraAtras', 'cinta', '', 'gorra', 'visera']);
    if (!b.eyes && (b.head === '' || b.head === 'gorraAtras') && pr(0.35)) b.eyes = 'frente';
    b.ankle = pick(r, ['tela', 'tela', 'pulseraTob', '']);
    if (pr(0.15)) b.armR = 'manguito';
    if (pr(0.15)) b.wristR = 'muneq';
    if (!keepOld && pr(0.25)) f.style = pick(r, STYLES.filter(function (id) { return isStart(id) && SEED_OLD.indexOf(id) < 0; }));
    return fix(f, null, null).fit;
  }
  /** Fit al azar (botón «Al azar»): seed lo da la UI (Date.now()); ownedOnly = solo lo que ya tienes. */
  function random(seed, ownedOnly) {
    var r = prng(hash32((seed >>> 0) ^ ((seed / 4294967296) >>> 0) ^ 0x2545f491)), f = cloneFit(defaults(0));
    var can = function (id) { return !ownedOnly || owned(id); };
    f.skin = pick(r, SKINS);
    var hairs = HAIRS.slice(), tints = TINTS.filter(can);
    f.hair = tints.length && r() < 0.2 ? pick(r, tints) : pick(r, hairs);
    f.style = pick(r, STYLES.filter(can));
    // probabilidad de llevar algo en cada ranura (lo demás, nada: un muñeco con todo a la vez parece un árbol de Navidad)
    var P = { head: 0.45, eyes: 0.3, paint: 0.3, marks: 0.25, beard: 0.25, neck: 0.15, under: 0.25, band: 0.12, armL: 0.25, armR: 0.3,
      elbows: 0.2, wristL: 0.25, wristR: 0.25, hands: 0.12, legs: 0.2, knees: 0.85, socks: 0.95, ankle: 0.7, shoes: 1 };
    ['hall', 'beach'].forEach(function (ven) {
      SLOTS.forEach(function (s) {
        var list = items(s, ven).filter(can);
        if (s === 'ears') { f[ven][s] = ''; return; }   // (los pendientes, al final: no mueven el azar de lo de siempre)
        f[ven][s] = list.length && r() < P[s] ? pick(r, list) : (s === 'shoes' && ven === 'hall' ? 'clasicas' : '');
      });
    });
    var toks = TOKENS.map(function (t) { return t.id; }).concat(PALETTE.map(function (p) { return p.id; }).filter(can));
    // 'pad' es la última: no mueve el azar de las demás (desde WP4 la llevan las rodilleras cortas, altas y bajadas)
    COLOR_KEYS.forEach(function (k) { f.colors[k] = r() < 0.55 ? 'auto' : pick(r, toks); });
    ['hall', 'beach'].forEach(function (ven) { var l = items('ears', ven).filter(can); f[ven].ears = l.length && r() < 0.12 ? pick(r, l) : ''; });
    return fix(f, null, null).fit;
  }

  // ---------------------------------------------------------------- catálogo: consultas y textos
  function item(id) { return own(BY_ID, id) ? BY_ID[id] : null; }
  var NONE = { head: 'Sin gorro', eyes: 'Sin gafas', paint: 'Sin pintura', marks: 'Sin marcas', beard: 'Sin barba', neck: 'Nada',
    under: 'Nada', band: 'Sin brazalete', armL: 'Sin manguito', armR: 'Sin manguito', elbows: 'Sin coderas', wristL: 'Nada',
    wristR: 'Nada', hands: 'Nada', legs: 'Sin mallas', knees: 'Sin rodilleras', socks: 'Sin calcetines', ankle: 'Nada',
    shoes: 'Sin zapatillas', ears: 'Sin pendientes', hair2: 'Sin segundo color', hairFx: 'Sin efecto' };
  /** Nombre de un objeto, peinado, tinte, ficha de color o color de piel/pelo (hex). slot opcional para el «nada» de esa ranura. */
  function name(id, slot) {
    if (id === '' || id == null) return NONE[slot] || 'Nada';
    if (typeof id === 'number') {
      if (own(HAIR_NAMES, id) && slot !== 'skin') return HAIR_NAMES[id];
      var k = SKIN_ORDER.indexOf(id);
      return k >= 0 ? 'Tono ' + (k + 1) : '#' + ('00000' + id.toString(16)).slice(-6);
    }
    if (own(BY_ID, id)) return BY_ID[id].name;
    if (own(PAL_BY, id)) return PAL_BY[id].name;
    if (own(TOK_BY, id)) return TOK_BY[id].name;
    return String(id);
  }
  function rarityOf(id) { var it = item(id); return it ? it.rarity : (own(PAL_BY, id) && PAL_BY[id].unlock ? 2 : 0); }
  /** Rareza en estrellas: '★☆☆☆' (común) … '★★★★' (de lujo). '' si no es un objeto del catálogo. */
  function stars(id) { if (!item(id)) return ''; var r = rarityOf(id); return '★★★★'.slice(0, r + 1) + '☆☆☆☆'.slice(0, 3 - r); }
  /** Para aria-label: «Rareza: 2 de 4». */
  function rarityLabel(id) { return item(id) ? 'Rareza: ' + (rarityOf(id) + 1) + ' de 4' : ''; }
  function unlockOf(id) { var it = item(id); return it ? it.unlock : own(PAL_BY, id) ? (PAL_BY[id].unlock || S) : S; }
  function isStart(id) { if (id === '' || typeof id === 'number') return true; var u = unlockOf(id); for (var i = 0; i < u.length; i++) if (u[i].start) return true; return false; }
  /** Precio en la tienda de la Carrera (0 si no se vende). */
  function price(id) { var u = unlockOf(id); for (var i = 0; i < u.length; i++) if (u[i].shop) return u[i].shop; return 0; }
  /** Objetos de una ranura que valen en esa sede (sin ''), en el orden del catálogo. Ranuras extra: 'style', 'hairTint'. */
  function items(slot, venue) {
    var ven = venueOf(venue);
    return CATALOG.filter(function (it) { return slotOk(it, slot) && (!ven || venueOk(it, ven)); }).map(function (it) { return it.id; });
  }
  /** Objetos que usan el hueco de color key ('acc', 'acc2', 'sock', 'shoe', 'glass', 'pad') y valen en esa sede (todos sin sede). */
  function uses(key, venue) {
    var ven = venueOf(venue), l = own(USES, key) ? USES[key] : [];
    return l.filter(function (id) { return !ven || venueOk(BY_ID[id], ven); });
  }
  /** Valores en el orden de la UI para cualquier fila: una ranura de SLOTS ('' primero), 'style', 'skin', 'hair' (tonos y
   *  tintes) o un hueco de color (acc, acc2, sock, shoe, glass: fichas). */
  function choices(key, venue) {
    if (key === 'style') return STYLES.slice();
    if (key === 'skin') return SKIN_ORDER.slice();
    if (key === 'hair') return HAIR_ORDER.slice().concat(TINTS);
    if (key === 'hair2') return [''].concat(HAIR_ORDER, TINTS);
    if (key === 'hairFx') return [''].concat(items('hairFx'));
    if (COLOR_KEYS.indexOf(key) >= 0) return TOKENS.map(function (t) { return t.id; }).concat(PALETTE.map(function (p) { return p.id; }));
    if (SLOTS.indexOf(key) >= 0) return [''].concat(items(key, venue));
    return [];
  }

  // nombres que da la Carrera; si no está cargada (o es node), lo de aquí
  var TIER_NAMES = [['Desconocido'], ['Promesa local'], ['Conocido en el circuito', 'Conocido en la liga'], ['Figura'], ['Estrella'],
    ['Ídolo', 'Ídolo de la grada'], ['Leyenda viva']];
  // lo que pide cada logro, en corto, para el paréntesis de lockText (b: playa, h: pista si cambia)
  var ACH_SHORT = { m1: { b: '1 partido' }, m50: { b: '50 partidos' }, m150: { b: '150 partidos' }, w1: { b: '1 victoria' },
    w50: { b: '50 victorias' }, a50: { b: '50 aces' }, b50: { b: '50 bloqueos punto' }, n9: { b: 'un 9 en un partido' },
    s5: { b: '5 victorias seguidas' }, s10: { b: '10 victorias seguidas' }, duel5: { b: '5 duelos a tu rival' },
    up: { b: 'un ascenso' }, t1: { b: 'un título' }, t5: { b: '5 títulos' }, mvp: { b: 'un MVP' },
    top: { b: 'la máxima categoría', h: 'una liga de élite' } };
  var AWARD_NAMES = { mvp: 'MVP', pts: 'Máximo anotador', ace: 'Mejor sacador', blk: 'Muro del año', dig: 'Mejor defensa',
    set: 'Mejor colocador', rook: 'Revelación' };
  var GYM_SHORT = { serve: 'Saque', recv: 'Recepción', set: 'Colocación', atk: 'Remate', block: 'Bloqueo' };
  function CL() { return VB.CareerLife || null; }
  function tierName(i, hall) {
    var T = CL() && CL().TIERS, t = T && T[i];
    if (t && typeof t[1] === 'string') return hall && t[2] ? t[2] : t[1];
    t = TIER_NAMES[Math.max(0, Math.min(TIER_NAMES.length - 1, i | 0))];
    return hall && t[1] ? t[1] : t[0];
  }
  function achLabel(id, hall) {
    var c = CL(), nm = '';
    if (c && typeof c.achName === 'function') { try { nm = c.achName(id, !!hall) || ''; } catch (e) { nm = ''; } }
    return typeof nm === 'string' && nm ? nm : id;
  }
  function awardLabel(id) {
    var A = CL() && CL().AWARDS;
    if (A && A.length) for (var i = 0; i < A.length; i++) if (A[i].id === id && A[i].name) return A[i].name;
    return AWARD_NAMES[id] || id;
  }
  function gymLabel(id) {
    var d = VB.Gym && typeof VB.Gym.drill === 'function' ? VB.Gym.drill(id) : null;
    return d && d.short ? d.short : GYM_SHORT[id] || id;
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  // jefes (S3-C3): estilo → apodo del texto «Jefe: gana a un Muro»
  var BOSS_STYLES = ['saque', 'muro', 'remate', 'defensa'];
  var BOSS_NAME = { saque: 'Cañón', muro: 'Muro', remate: 'Martillo', defensa: 'Pulpo' };
  var MEDAL = ['medalla', 'bronce', 'plata', 'oro'];
  // nombres de los retos que salen en el catálogo, por si VB.Retos no está cargado (node)
  var RETO_NAMES = { r_aces: 'Lluvia de aces', r_recv: 'Pase al dedo', r_streak: 'Rodillo' };
  function retoLabel(id) {
    var B = VB.Retos && VB.Retos.BY, r = B && B[id];
    return r && typeof r.name === 'string' && r.name ? r.name : RETO_NAMES[id] || id;
  }
  // química (S3-C5 §2.2): nombre del nivel en la playa (pareja) y en la pista (equipo)
  var CHEM_NAMES = [['Conocidos', 'Vestuario nuevo'], ['Buena sintonía', 'Buen ambiente'], ['Compenetrados', 'Bloque sólido'], ['Pareja de oro', 'Equipo de oro']];
  function chemLabel(n, hall) {
    var c = CL(), k = Math.max(0, Math.min(3, n | 0)), t = null;
    try { t = hall ? c && c.CHEM_LV6 && c.CHEM_LV6[k] : c && c.CHEM_LV && c.CHEM_LV[k] && c.CHEM_LV[k][1]; } catch (e) { t = null; }
    return typeof t === 'string' && t ? t : CHEM_NAMES[k][hall ? 1 : 0];
  }
  function unlockText(u, hall) {
    if (u.shop) return 'Tienda de la Carrera: ' + fmtEur(u.shop);
    if (u.fame != null) return 'Fama: ' + tierName(u.fame, hall);
    if (u.ach) { var s = ACH_SHORT[u.ach]; return 'Logro: ' + achLabel(u.ach, hall) + (s ? ' (' + (hall && s.h ? s.h : s.b) + ')' : ''); }
    if (u.award) return 'Premio: ' + awardLabel(u.award);
    if (u.gym) return 'Entrenamiento: ' + (u.gym.m >= 3 ? 'oro' : u.gym.m === 2 ? 'plata' : 'medalla') + ' en ' + gymLabel(u.gym.id);
    if (u.gymN) return 'Entrenamiento: ' + plural(u.gymN, 'medalla', 'medallas');
    if (u.rec) return 'Récord: ' + (u.rec.k === 'wins' ? plural(u.rec.n, 'victoria', 'victorias') : u.rec.k === 'played' ? plural(u.rec.n, 'partido', 'partidos') : 'racha de ' + u.rec.n + ' victorias');
    if (u.boss) return 'Jefe: gana a un ' + (BOSS_NAME[u.boss] || u.boss);
    if (u.reto) return 'Reto: ' + retoLabel(u.reto.id) + ' (' + (MEDAL[u.reto.m] || MEDAL[0]) + ')';
    if (u.retoN) return 'Retos: ' + plural(u.retoN, 'medalla', 'medallas');
    if (u.semana) return 'Torneo de la semana: ' + plural(u.semana, 'ganado', 'ganados');
    if (u.dias) return 'Reto del día: ' + plural(u.dias, 'oro', 'oros');
    if (u.lvl) return 'Perfil: Nv ' + u.lvl;
    if (u.chem) return 'Química: ' + chemLabel(u.chem, hall);
    if (u.online) return 'Online: termina tu primer partido';
    return '';
  }
  /** Cómo se gana, una línea por alternativa (vacío si es de inicio). hall = Carrera de pista (nombres de logro de pista). */
  function lockList(id, hall) { return unlockOf(id).filter(function (u) { return !u.start; }).map(function (u) { return unlockText(u, hall); }).filter(Boolean); }
  /** Cómo se gana, en una línea: «Logro: Muralla (50 bloqueos punto) o Entrenamiento: medalla en Bloqueo». */
  function lockText(id, hall) { return lockList(id, hall).join(' o '); }

  // ---------------------------------------------------------------- guardado e inventario
  var cacheRaw = null, cacheObj = null;
  // contrato D4 (S4-D2D4 §4.3): lostF = el guardado estaba dañado (copia en KEY.bak); roF = viene de una versión más nueva (v > V):
  // se usa saneado en memoria y no se escribe
  var lostF = false, roF = false;
  function emptyStore() { return { v: V, fits: [defaults(0), defaults(1)], ft: 0, own: {}, seen: {} }; }
  function lockable(id) { return typeof id === 'string' && (own(BY_ID, id) || own(PAL_BY, id)) && !isStart(id); }
  function cleanStore(o) {
    var out = emptyStore();
    if (!isObj(o)) return out;
    var fits = Array.isArray(o.fits) ? o.fits : [];
    out.fits = [fits[0] ? sane(fits[0], 0) : defaults(0), fits[1] ? sane(fits[1], 1) : defaults(1)];
    out.ft = +o.ft > 0 && isFinite(+o.ft) ? Math.floor(+o.ft) : 0;
    var ow = isObj(o.own) ? o.own : {};
    Object.keys(ow).forEach(function (id) {
      if (!lockable(id)) return;
      var e = isObj(ow[id]) ? ow[id] : {};
      out.own[id] = { s: SRCS.indexOf(e.s) >= 0 ? e.s : 'carrera', t: +e.t > 0 && isFinite(+e.t) ? Math.floor(+e.t) : 0 };
    });
    var se = isObj(o.seen) ? o.seen : {};
    Object.keys(se).forEach(function (id) { if (lockable(id) && se[id]) out.seen[id] = 1; });
    return out;
  }
  function readRaw() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  /** Texto dañado: copia en KEY.bak, se borra y lost() lo dice (si no se puede copiar, no se borra). */
  function backup(raw) {
    lostF = true;
    try { window.localStorage.setItem(KEY + '.bak', raw); window.localStorage.removeItem(KEY); } catch (e) { }
  }
  /** Copia validada del guardado (sin guardado: los valores por defecto). */
  function load() {
    var raw = readRaw();
    if (raw !== cacheRaw || !cacheObj) {
      var o = null;
      if (raw) { try { o = JSON.parse(raw); } catch (e) { o = null; } }
      if (raw && !isObj(o)) { backup(raw); raw = readRaw(); o = null; }
      roF = isObj(o) && typeof o.v === 'number' && o.v > V;
      cacheObj = cleanStore(o); cacheRaw = raw;
    }
    return JSON.parse(JSON.stringify(cacheObj));
  }
  function save(o) {
    if (roF) return false;   // guardado de una versión más nueva: solo lectura
    var c = cleanStore(o), txt = JSON.stringify(c);
    try { window.localStorage.setItem(KEY, txt); } catch (e) { return false; }
    cacheRaw = txt; cacheObj = c;
    return true;
  }
  /** Fit guardado del n.º i+1 (0 o 1). */
  function fit(i) { return load().fits[i === 1 ? 1 : 0]; }
  /** Guarda el fit del n.º i+1 (saneado). Devuelve lo guardado. */
  function setFit(i, f) {
    var o = load(), k = i === 1 ? 1 : 0;
    o.fits[k] = sane(f, k); o.ft = now();
    save(o);
    return o.fits[k];
  }
  /** ¿Lo tienes? Lo de inicio y '' siempre; lo demás si está en el inventario (own). */
  function owned(id) {
    if (id === '' || id == null || typeof id === 'number') return true;
    if (!own(BY_ID, id) && !own(PAL_BY, id)) return own(TOK_BY, id);
    if (isStart(id)) return true;
    return own(load().own, id);
  }
  /** Concede un objeto (src: 'carrera' | 'tienda' | 'gym' | 'record' | 'retos' | 'hito' | 'boss' | 'online'). true si es nuevo (false también
   *  si el guardado es de solo lectura). */
  function grant(id, src) {
    if (!lockable(id)) return false;
    var o = load();
    if (own(o.own, id)) return false;
    o.own[id] = { s: SRCS.indexOf(src) >= 0 ? src : 'carrera', t: now() };
    return save(o);
  }
  /** Lo bloqueado de un fit: [{slot, id}] (slot = 'style', 'hair', una ranura con su sede 'hall.head' o 'colors.acc'). */
  function locked(f) {
    var x = saneRaw(f, 0), out = [];
    if (!owned(x.style)) out.push({ slot: 'style', id: x.style });
    if (typeof x.hair === 'string' && !owned(x.hair)) out.push({ slot: 'hair', id: x.hair });
    if (typeof x.hair2 === 'string' && !owned(x.hair2)) out.push({ slot: 'hair2', id: x.hair2 });
    if (!owned(x.hairFx)) out.push({ slot: 'hairFx', id: x.hairFx });
    ['hall', 'beach'].forEach(function (ven) { SLOTS.forEach(function (s) { if (!owned(x[ven][s])) out.push({ slot: ven + '.' + s, id: x[ven][s] }); }); });
    COLOR_KEYS.forEach(function (k) { if (!owned(x.colors[k])) out.push({ slot: 'colors.' + k, id: x.colors[k] }); });
    return out;
  }
  /** Lo que se puede guardar: cada ranura con algo bloqueado vuelve a lo de saved (o a lo de por defecto si saved tampoco lo
   *  tiene); después, las compatibilidades. */
  function wearable(f, saved) {
    var x = sane(f, 0), s = sane(saved, 0), d = defaults(0);
    var back = function (v, sv, dv) { return owned(v) ? v : owned(sv) ? sv : dv; };
    x.style = back(x.style, s.style, d.style);
    x.hair = back(x.hair, s.hair, d.hair);
    x.hair2 = back(x.hair2, s.hair2, '');
    x.hairFx = back(x.hairFx, s.hairFx, '');
    ['hall', 'beach'].forEach(function (ven) { SLOTS.forEach(function (k) { x[ven][k] = back(x[ven][k], s[ven][k], d[ven][k]); }); });
    COLOR_KEYS.forEach(function (k) { x.colors[k] = back(x.colors[k], s.colors[k], 'auto'); });
    return fix(x, null, null).fit;
  }
  /** Lo ganado que aún no se ha visto en el Vestuario (orden del catálogo). */
  function unseen() {
    var o = load();
    return Object.keys(o.own).filter(function (id) { return !o.seen[id]; }).sort(function (a, b) { return ordOf(a) - ordOf(b); });
  }
  function ordOf(id) { return own(BY_ID, id) ? BY_ID[id].ord : 999; }
  function markSeen(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    var o = load(), ch = false;
    ids.forEach(function (id) { if (own(o.own, id) && !o.seen[id]) { o.seen[id] = 1; ch = true; } });
    if (ch) save(o);
    return ch;
  }

  /** ¿Cumple d alguna alternativa de desbloqueo de id? d = {fame (índice del escalón), ach {id:…}, awards [ids], gym {id: 0-3},
   *  gymN, rec {wins, played, streak}, boss {estilo: true}, reto {id: nivel 0-3}, retoN, semana, dias, lvl (nivel de perfil), chem
   *  (nivel de química 0-3)}; lo que no venga no cuenta. Devuelve la alternativa cumplida o null. */
  function meets(id, d) {
    d = d || {};
    var u = unlockOf(id);
    for (var i = 0; i < u.length; i++) {
      var x = u[i];
      if (x.start) return x;
      if (x.fame != null && typeof d.fame === 'number' && d.fame >= x.fame) return x;
      if (x.ach && isObj(d.ach) && d.ach[x.ach]) return x;
      if (x.award && Array.isArray(d.awards) && d.awards.indexOf(x.award) >= 0) return x;
      if (x.gym && isObj(d.gym) && (d.gym[x.gym.id] | 0) >= x.gym.m) return x;
      if (x.gymN && typeof d.gymN === 'number' && d.gymN >= x.gymN) return x;
      if (x.rec && isObj(d.rec) && (+d.rec[x.rec.k] || 0) >= x.rec.n) return x;
      if (x.boss && isObj(d.boss) && d.boss[x.boss]) return x;
      if (x.reto && isObj(d.reto) && (d.reto[x.reto.id] | 0) >= x.reto.m) return x;
      if (x.retoN && typeof d.retoN === 'number' && d.retoN >= x.retoN) return x;
      if (x.semana && typeof d.semana === 'number' && d.semana >= x.semana) return x;
      if (x.dias && typeof d.dias === 'number' && d.dias >= x.dias) return x;
      if (x.lvl && typeof d.lvl === 'number' && d.lvl >= x.lvl) return x;
      if (x.chem && typeof d.chem === 'number' && d.chem >= x.chem) return x;
    }
    return null;
  }
  // datos globales que no pasen: del Entrenamiento (VB.Gym) y del récord de Partido rápido ('make-the-cut.record')
  function globalData(d) {
    d = isObj(d) ? d : {};
    var out = { gym: isObj(d.gym) ? d.gym : null, gymN: typeof d.gymN === 'number' ? d.gymN : null, rec: isObj(d.rec) ? d.rec : null };
    if (!out.gym && VB.Gym && typeof VB.Gym.get === 'function') {
      out.gym = {};
      Object.keys(GYM_SHORT).forEach(function (k) { var e = null; try { e = VB.Gym.get(k); } catch (er) { } out.gym[k] = e ? e.m | 0 : 0; });
    }
    if (out.gymN == null && VB.Gym && typeof VB.Gym.count === 'function') { try { out.gymN = VB.Gym.count() | 0; } catch (er) { } }
    if (!out.rec) {
      var r = null; try { r = JSON.parse(window.localStorage.getItem('make-the-cut.record') || 'null'); } catch (er) { r = null; }
      if (isObj(r)) out.rec = { wins: +r.wins || 0, played: +r.played || 0, streak: +(r.streak != null ? r.streak : r.bestStreak) || 0 };
    }
    // nivel de perfil (VB.Profile, S4-D2) y retos (VB.Retos, S4-D1)
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
    out.lvl = num(d.lvl);
    if (out.lvl == null && VB.Profile && typeof VB.Profile.level === 'function') { try { var pl = VB.Profile.level(); out.lvl = pl ? num(pl.lvl) : null; } catch (er) { } }
    var rs = isObj(d.retos) ? d.retos : null;
    out.reto = isObj(d.reto) ? d.reto : null;
    out.retoN = num(d.retoN) != null ? d.retoN : rs ? num(rs.total) : null;
    out.dias = num(d.dias) != null ? d.dias : rs ? num(rs.daysGold) : null;
    out.semana = num(d.semana) != null ? d.semana : rs ? num(rs.weeksWon) : null;
    if ((!out.reto || out.retoN == null || out.dias == null || out.semana == null) && VB.Retos && typeof VB.Retos.lookData === 'function') {
      var rd = null; try { rd = VB.Retos.lookData(); } catch (er) { rd = null; }
      if (isObj(rd)) {
        if (!out.reto && isObj(rd.reto)) out.reto = rd.reto;
        if (out.retoN == null) out.retoN = num(rd.retoN);
        if (out.dias == null) out.dias = num(rd.dias);
        if (out.semana == null) out.semana = num(rd.semana);
      }
    }
    return out;
  }
  /** Concede lo que se gana fuera de la Carrera (Entrenamiento, récord, retos y nivel de perfil). d = {gym:{serve,recv,set,atk,block:
   *  medalla 0-3}, gymN, rec:{wins, played, streak}, lvl, reto:{id: nivel}, retoN, dias, semana, retos: VB.Retos.summary()}; lo que
   *  falte se lee de VB.Gym, 'make-the-cut.record', VB.Profile.level() y VB.Retos.lookData(). Origen: gym, record, hito (nivel) o retos.
   *  Lo de jefe y química es de la Carrera (career-life.js lo concede). Devuelve los ids nuevos. */
  function checkGlobal(d) {
    var g = globalData(d), out = [];
    var lists = CATALOG.map(function (it) { return it.id; });
    lists.forEach(function (id) {
      if (!lockable(id) || owned(id)) return;
      var u = unlockOf(id);
      for (var i = 0; i < u.length; i++) {
        var x = u[i], one = {}, src = 'gym';
        if (x.gym) one.gym = g.gym; else if (x.gymN) one.gymN = g.gymN; else if (x.rec) { one.rec = g.rec; src = 'record'; }
        else if (x.lvl) { one.lvl = g.lvl; src = 'hito'; }
        else if (x.reto) { one.reto = g.reto; src = 'retos'; } else if (x.retoN) { one.retoN = g.retoN; src = 'retos'; }
        else if (x.dias) { one.dias = g.dias; src = 'retos'; } else if (x.semana) { one.semana = g.semana; src = 'retos'; }
        else continue;
        if (meets(id, one)) { if (grant(id, src)) out.push(id); break; }
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- jefes y premios por nivel
  /** Objetos de jefe de un estilo ('saque' | 'muro' | 'remate' | 'defensa'): ids del catálogo con {boss: estilo} (defensa: dos, el
   *  de pista y el de playa; la Carrera concede los dos). [] si no es un estilo. */
  function bossItems(style) {
    return CATALOG.filter(function (it) { return it.unlock.some(function (u) { return u.boss === style; }); }).map(function (it) { return it.id; });
  }
  /** Aspecto del jefe (plan R22): fromSeed(seed) con su objeto puesto en las dos sedes y pasado por fix. seed = número o texto
   *  (el nombre: se pasa por hashStr). Estilo desconocido: el fit de fromSeed sin objeto. Determinista, sin g.rng. */
  function bossFit(style, seed) {
    var n = typeof seed === 'number' && isFinite(seed) ? seed >>> 0 : hashStr(seed), f = fromSeed(n, true);
    bossItems(style).forEach(function (id) {
      var it = BY_ID[id], sl = it.slot === 'armL' ? 'armR' : it.slot === 'wristL' ? 'wristR' : it.slot;
      ['hall', 'beach'].forEach(function (ven) { if (venueOk(it, ven)) f[ven][sl] = id; });
    });
    return fix(f, null, null).fit;
  }
  /** Premios por nivel de perfil (alternativa {lvl}), de menor a mayor: [{lvl, id}]. */
  var LVL_PRIZES = CATALOG.reduce(function (a, it) {
    it.unlock.forEach(function (u) { if (u.lvl) a.push({ lvl: u.lvl, id: it.id }); });
    return a;
  }, []).sort(function (a, b) { return a.lvl - b.lvl; });
  LVL_PRIZES.forEach(function (p) { Object.freeze(p); }); Object.freeze(LVL_PRIZES);
  /** Premio de ese nivel exacto (id) o ''. */
  function lvlPrize(n) { for (var i = 0; i < LVL_PRIZES.length; i++) if (LVL_PRIZES[i].lvl === n) return LVL_PRIZES[i].id; return ''; }

  // ---------------------------------------------------------------- quién lleva qué (§2.4)
  /** o = {career, hall, look (fit de la Carrera | null), mate (nombre del compañero | null), watch (6v6 espectador),
   *  six (6v6 rápido)} → [fit de tu atleta | null, fit del compañero | null]. null = el aspecto de hoy. */
  function matchLooks(o) {
    o = isObj(o) ? o : {};
    if (o.watch) return [null, null];
    if (o.career) {
      if (o.hall) return [o.look ? sane(o.look, 0) : null, null];
      return [o.look ? sane(o.look, 0) : fit(0), o.mate ? fromSeed(hashStr(o.mate)) : null];
    }
    var st = load();
    return [st.fits[0], o.six ? null : st.fits[1]];
  }

  /** Une dos guardados de 'make-the-cut.look' (texto JSON): own y seen por unión (gana la t mínima), fits del más reciente (ft, o
   *  remoteNewer si se pasa). Devuelve texto JSON (el local tal cual si no cambia nada). Si un lado trae v > V, ese lado entero. */
  function mergeRaw(Lraw, Rraw, remoteNewer) {
    function p(r) { try { var o = JSON.parse(r); return isObj(o) ? o : null; } catch (e) { return null; } }
    var Lp = p(Lraw), Rp = p(Rraw);
    if (!Rp) return Lraw;
    // versión más nueva en algún lado (D4): gana entera la de mayor v y nunca se rebaja
    var lv = Lp && typeof Lp.v === 'number' ? Lp.v : V, rv = typeof Rp.v === 'number' ? Rp.v : V;
    if (lv > V || rv > V) return rv > lv || !Lp ? Rraw : Lraw;
    var A = cleanStore(Lp), B = cleanStore(Rp), out = emptyStore();
    var useR = typeof remoteNewer === 'boolean' ? remoteNewer : (Lp ? B.ft > A.ft : true);
    out.fits = useR ? B.fits : A.fits; out.ft = Math.max(A.ft, B.ft);
    [A, B].forEach(function (X) {
      Object.keys(X.own).forEach(function (id) {
        var e = X.own[id], c = out.own[id];
        if (!c || (e.t && (!c.t || e.t < c.t))) out.own[id] = { s: e.s, t: e.t };
      });
      Object.keys(X.seen).forEach(function (id) { out.seen[id] = 1; });
    });
    var txt = JSON.stringify(out);
    if (Lp && JSON.stringify(A) === txt) return Lraw;
    return txt;
  }

  VB.Look = {
    V: V, KEY: KEY, MAX_BYTES: MAX_BYTES, SLOTS: SLOTS, COLOR_KEYS: COLOR_KEYS, CATALOG: CATALOG, CLASH: CLASH,
    STYLES: STYLES, SKINS: SKINS, HAIRS: HAIRS, TINTS: TINTS, TOKENS: TOKENS, PALETTE: PALETTE, HIDE_HAIR: HIDE_HAIR,
    HAIR_FAMS: HAIR_FAMS, USES: USES, COLOR_L: COLOR_L, uses: uses, unkeep: unkeep, keepPath: keepPath,
    item: item, name: name, stars: stars, rarityLabel: rarityLabel, price: price, isStart: isStart, items: items, choices: choices,
    lockText: lockText, lockList: lockList, art: art,
    defaults: defaults, sane: sane, fix: fix, ok: ok, resolve: resolve, geoSig: geoSig, atlasSig: atlasSig, sig: sig,
    fromSeed: fromSeed, random: random, hashStr: hashStr,
    load: load, fit: fit, setFit: setFit, owned: owned, grant: grant, locked: locked, wearable: wearable,
    unseen: unseen, markSeen: markSeen, meets: meets, checkGlobal: checkGlobal,
    matchLooks: matchLooks, mergeRaw: mergeRaw,
    SRCS: SRCS, BOSS_STYLES: BOSS_STYLES, BOSS_NAME: BOSS_NAME, LVL_PRIZES: LVL_PRIZES,
    bossItems: bossItems, bossFit: bossFit, lvlPrize: lvlPrize, unlockText: unlockText, drawId: drawId,
    lost: function () { load(); return lostF; }, readOnly: function () { load(); return roF; },
    reset: function () { try { window.localStorage.removeItem(KEY); } catch (e) { } cacheRaw = null; cacheObj = null; lostF = false; roF = false; }
  };
})();
