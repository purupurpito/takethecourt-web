/* MAKE THE CUT — js/venue-gen-beach.js (owner: arena)
 * Constructor de las sedes GENERADAS de playa: VB.VenueGen.beachDef(spec) → def de VB.Arena, una PIEL de PLATJA_P (como Moll y
 * Fanals): parámetros P sobre los de Platja Llarga + piezas propias en build(G, K, B), todas en la estática de la playa (B) salvo
 * la luz de noche (emisiva + halos + haces, como Fanals).
 *
 * FASE F4 (plan «sedes-gen»): los nueve escenarios de la receta (p.scen), lo que se ve DESDE LA CÁMARA DE JUEGO (mira al agua, detrás
 * del fondo rival) es lo que los distingue:
 *  - OPEN: playa abierta con sombrillas, hamacas y toallas, boyas amarillas de la zona de baño y lanchas fondeadas; telón de la receta
 *    (ciudad, montes, islotes, cabos); ola que rompe. Sin los llaüts que navegan (son de Platja Llarga).
 *  - COVE: cala cerrada por acantilados en el telón, peñascos en la orilla y en el agua a los dos lados y dos lanchas fondeadas.
 *  - PORT: playa junto al puerto: rompeolas con faro (rojo a un lado; pantalán con lanchas al otro), contenedores en tierra y la
 *    bocana con grúas en el telón. Agua de dársena (sin ola).
 *  - LAKE: lido de lago: embarcadero de madera, línea de boyas de la zona de baño, juncos, barcas de remos, césped en tierra y la
 *    otra orilla del lago en el telón (la sierra lo cierra). Sin socorrista. Obligado en AT, CH, CZ y RS (lo garantiza la receta).
 *  - PLAZA: pista en una plaza de ciudad: adoquinado (mosaico propio, `tile`), isla de arena con bordillo de granito (`courtBase`),
 *    fachadas con toldos alrededor, fuente, farolas, árboles en alcorque; sin agua (la malla del mar se oculta) y la ciudad da toda
 *    la vuelta en el telón.
 *  - RIVER: orilla de río: la otra orilla cerca (muro de piedra, paseo con árboles y farolas, fachadas), puente de arcos, agua sin ola.
 *  - TROPICAL: arena de coral, agua turquesa, palmeras, sombrillas de paja, canoa, selva e islotes en el telón.
 *  - DUNES (dunas del norte): dunas con barrón, casetas de baño a rayas, cortavientos, faro sobre un cabo de arena en el telón.
 *  - DESERT: arena ocre, jaimas en lugar de sombrillas, chumberas y pitas, oasis de palmeras, dunas en el telón.
 *  Luz: la receta da la hora (p.hour). 'dia' y 'tarde' llevan las dos luces de Platja (el ajuste «Luz de playa» sigue mandando):
 *  la entrada 'dia' de una sede de TARDE es una hora dorada (sol bajo y cálido) y 'tarde' la puesta de sol; el telón se repinta con
 *  ventanas encendidas (`relight`). 'noche' (solo tier 3): luz fija con luna, estrellas y rielada, 4 mástiles de focos, guirnalda de
 *  bombillas en el fondo rival y el chiringuito encendido: + emisiva + halos (+ haces en media/alta), sin nubes ni gaviotas; en la plaza
 *  y el río, ventanas encendidas en las fachadas (emisiva ≤ 4 k).
 *  Público: ≤ 240 (como Platja; el muñeco del público es lo que más pesa). def.parts(): triángulos de la estática por parte (calibra
 *  COST.beach de la receta; tools/venuegen-beach.js lo compara a ±15 %).
 *  Colores del club (receta pal): cinta, lonas (nombre de la sede), red/silla/mesa, gradas y toldos, marcador, público y gorras.
 *  Gradas: p.blocks (0 ninguna, 1 el lado de la cámara, 2 los dos, 3-4 + grada de fondo detrás de nuestro fondo) de p.rows filas.
 * Sin texturas propias salvo las de la piel (telón, mosaico, capa de pista: las de Platja, se liberan con ella) y el halo de noche.
 */
(function () {
  'use strict';
  var VB = window.VB; if (!VB || !VB.VenueGen || !VB.VenueGen.kit || !VB.VenueGen.kit.beach || !VB.Arena || !VB.Arena.registerMap) return;
  var PI = Math.PI, TAU = PI * 2, KIT = VB.VenueGen.kit, BK = KIT.beach;
  var shade = KIT.shade, mix = KIT.mix, lum = KIT.lum, hexOf = KIT.hexOf;

  // ---------- color ----------
  function rgba(hex, a) { var c = KIT.rgbOf(hex); return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a + ')'; }
  function num(hex) { return parseInt(String(hex).replace('#', ''), 16) || 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // ---------- luz ----------
  // cielo de día por clima (cenit, horizonte); la niebla es el horizonte aclarado
  var SKY = { med: ['#3a8fe6', '#a6d8fb'], oce: ['#6d9cc8', '#cfe0ea'], cold: ['#7aa2c8', '#d8e4ec'], trop: ['#2f9cf0', '#9fe4ff'], arid: ['#4a9ad8', '#efe0c0'],
    cont: ['#4f94da', '#bfe0f4'], templ: ['#4a90dc', '#b8dcf4'] };
  function envOf(sp) { var E = VB.VenueGen.ENV || {}; return E[sp.cc] || E.XX || { clima: 'med', style: 'med' }; }
  /** PELOTA (15-nov-2026, tools/balltest.js): con el post-proceso de calidad alta, un horizonte casi blanco (canal ≥ ~235) entra en el
   *  bloom y su halo lava la pelota lejana del saque rival, que vuela justo ahí (el contorno de tinta salía gris azulado, #546b75): el
   *  horizonte y la bruma de día, como mucho SKY_MAX en su canal más alto (mismo tono). */
  var SKY_MAX = 0.84;
  function capSky(h) { var c = KIT.rgbOf(h), m = Math.max(c[0], c[1], c[2]); return m <= SKY_MAX ? h : hexOf(c.map(function (v) { return v * SKY_MAX / m; })); }
  /** Las luces de la sede (entradas de P.looks): mismas claves que Platja / Fanals; mismas luces siempre (no recompila). */
  function looksOf(sp) {
    var p = sp.p, env = envOf(sp), sk = SKY[env.clima] || SKY.med, sand = sp.sand || [0.96, 0.85, 0.64];
    var side = ((p.sunAz || 0) / 360 * 2 - 1) * 0.55;   // el sol, siempre sobre el agua (delante de la cámara de juego), más o menos a un lado
    function sun(el) { var hz = Math.sqrt(Math.max(0, 1 - el * el)); return [-Math.cos(side) * hz, Math.sin(side) * hz, el]; }
    var ground = hexOf(sand.map(function (v) { return v * 0.92; })), deep = p.deep, shal = p.shal, foam = p.foam;
    if (p.scen === 'river') { deep = mix(deep, '#2f6a8f', 0.45); shal = mix(shal, '#5f9ab0', 0.4); }   // (el verde de río de la receta, de lejos, no se leía como agua)
    // (pelota, tools/balltest.js: el agua verde agua del río y del lago, de lejos, es casi el turquesa de la pelota del saque rival; más azul)
    if (p.scen === 'river' || p.scen === 'lake') { deep = mix(deep, '#24508a', 0.45); shal = mix(shal, '#4f7fb8', 0.45); }
    var noon = {
      sky: { zen: sk[0], hor: capSky(sk[1]), fog: capSky(mix(sk[1], '#ffffff', 0.25)), sun: '#fff3c4' }, sun: sun(0.44), hemi: num(mix(sk[1], '#ffffff', 0.4)), ground: num(ground),
      key: 0xfff0d4, fill: 0xcfe4ff, rim: 0xffe2b4, keyK: 1, hemiK: 1, deep: deep, shal: shal, foam: foam, tint: '#ffffff', glint: '#ffffff', glintK: 0.25, sand: sand
    };
    var golden = {
      sky: { zen: mix(sk[0], '#5a78c8', 0.4), hor: capSky('#ffd9ae'), fog: capSky('#f6dcc0'), sun: '#ffe6b0' }, sun: sun(0.24), hemi: 0xf6e2cc, ground: num(mix(ground, '#e9b47e', 0.3)),
      key: 0xffd9a4, fill: 0xc4ccff, rim: 0xffc88a, keyK: 1.04, hemiK: 0.9, deep: mix(deep, '#2d5fae', 0.25), shal: mix(shal, '#e9c08e', 0.15), foam: '#fff6e6',
      tint: '#ffe8d2', glint: '#ffd9a0', glintK: 0.55, sand: sand.map(function (v, i) { return Math.round(v * [1, 0.95, 0.88][i] * 100) / 100; })
    };
    var sunset = {
      sky: { zen: '#4d6cc8', hor: '#ffc796', fog: '#f4d6b8', sun: '#ffe2a8' }, sun: sun(0.13), hemi: 0xffd9bc, ground: 0xe9b47e,
      key: 0xffbf7a, fill: 0xb9c6ff, rim: 0xffb070, keyK: 1.08, hemiK: 0.82, deep: mix(deep, '#2d5fae', 0.45), shal: mix(shal, '#e8a070', 0.25), foam: '#fff1dc',
      tint: '#ffd6b8', glint: '#e88a4f', glintK: 0.85, sand: sand.map(function (v, i) { return Math.round(v * [1, 0.92, 0.82][i] * 100) / 100; })
    };
    if (sp.night) {
      var sodium = (sp.seed & 3) === 0;
      // luna: en la cala, claramente a un lado (Cala dels Fanals la tiene en el centro); en las demás, cerca del centro
      var mSide = p.scen === 'cove' ? (side < 0 ? -0.5 : 0.5) : Math.sin(side) * 0.3;   // focos de sodio (cálidos) en 1 de cada 4 noches; si no, LED frío
      return { noche: {
        sky: { zen: '#0f1438', hor: mix('#3a2a6b', sp.pal.accent, 0.15), fog: '#1a2452', sun: '#fff4d6' }, sun: [-0.95, mSide, 0.12], glintDir: [-0.99, mSide, 0.03],
        stars: 1, moon: 1, glint: '#9fc4ff', glintK: 0.8, hemi: 0xb8c0ec, ground: 0x6a6096, key: sodium ? 0xffdcae : 0xf4f8ff, fill: 0xffcf6a, rim: 0x9fc4ff,
        keyK: 1.08, hemiK: 0.92, fillK: 0.9, rimK: 1.3, floorK: 0.66, near: 40, far: 160, haze: '#1a2452', hazeK: 0.2, crowdLight: 0.8,
        deep: mix(deep, '#0d2a4a', 0.75), shal: mix(shal, '#1d4a6a', 0.7), foam: '#cfe0ff', tint: '#ffffff', sand: sand.map(function (v) { return Math.round(v * 0.76 * 100) / 100; }), sodium: sodium
      } };
    }
    return { dia: p.hour === 'tarde' ? golden : noon, tarde: sunset };
  }

  // ---------- suelo ----------
  /** Arena por vértice (multiplicador del mosaico): franja mojada; césped en tierra en el lago y el río; de noche, clara bajo los focos. */
  function sandFn(sp) {
    var scen = sp.p.scen, lawn = scen === 'lake' || scen === 'river', night = sp.night;
    if (scen === 'plaza') return function (x, y, kk) { var k = 0.94 + (kk - 0.93) * 0.6; return [k, k, k]; };
    return function (x, y, kk, wet) {
      var k = kk, o = [k * (1 - wet * 0.24), k * (1 - wet * 0.3), k * (1 - wet * 0.36)];
      if (lawn) {   // césped del lido: detrás de nuestro fondo y por fuera de las gradas (lejos del agua)
        var gr = Math.max(sstep(20, 27, x), sstep(25, 32, Math.abs(y)) * sstep(-21, -14, x));
        o = [o[0] * (1 - gr * 0.42), o[1] * (1 - gr * 0.08), o[2] * (1 - gr * 0.5)];
      }
      if (night) {
        var dx = Math.max(0, Math.abs(x) - 10), dy = Math.max(0, Math.abs(y) - 6), lit = 1 - clamp((Math.hypot(dx * 0.85, dy) - 4) / 14, 0, 1); lit = lit * lit * (3 - 2 * lit);
        var c1 = [0.58, 0.56, 0.78]; for (var i = 0; i < 3; i++) o[i] *= c1[i] + (1.02 - c1[i]) * lit;
      }
      return o;
    };
  }
  /** Adoquinado de la plaza (mosaico de 7,5 m): espiga o losas en hiladas, en dos tonos de piedra con juntas y manchas. */
  function plazaTile(sp) {
    var herring = (sp.seed >>> 3) % 2 === 0, base = mix('#c9c2b6', sp.pal.wall || '#c9c2b6', 0.12), alt = shade(base, 0.9);
    return function (g, N, h) {
      var rnd = h.rnd; g.fillStyle = base; g.fillRect(0, 0, N, N);
      if (herring) {   // espiga: ladrillos de 0,25 × 0,5 m en zigzag
        var u = N / 30;
        for (var j = -2; j < 32; j++) for (var i = -2; i < 32; i++) {
          var x = i * u, y = j * u, flip = (i + j) % 2 === 0;
          g.fillStyle = rnd() < 0.5 ? base : alt; if (flip) g.fillRect(x, y, u * 2 - 1, u - 1); else g.fillRect(x, y, u - 1, u * 2 - 1);
        }
      } else {         // losas de 0,75 × 0,5 m en hiladas desfasadas
        var w = N / 10, hh = N / 15;
        for (var r = 0; r < 15; r++) for (var q = -1; q < 11; q++) { g.fillStyle = rnd() < 0.5 ? base : alt; g.fillRect(q * w + (r % 2 ? w / 2 : 0), r * hh, w - 2, hh - 2); }
      }
      for (var k = 0; k < 1800; k++) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,84,76,0.22)' : 'rgba(255,252,244,0.3)'; g.fillRect(Math.floor(rnd() * N), Math.floor(rnd() * N), 1, 1); }
      for (var m = 0; m < 10; m++) {
        var mx = rnd() * N, my = rnd() * N, mr = 20 + rnd() * 50;
        h.wrapAt(mx, my, mr, function (X, Y) { var gr = g.createRadialGradient(X, Y, 0, X, Y, mr); gr.addColorStop(0, 'rgba(110,100,88,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(X - mr, Y - mr, mr * 2, mr * 2); });
      }
    };
  }
  var CROWD_MAX = 240;                  // público de una playa generada (≤ Platja, ~245: el muñeco del público es lo que más pesa en triángulos)
  var IX = 16.2, IY = 9.95, IR = 2.6;  // isla de arena de la plaza (dentro de la capa de la pista, 16,6 × 10,6), esquinas redondeadas
  function plazaBase(sp) {
    var sandC = hexOf(sp.sand || [0.94, 0.84, 0.64]);
    return function (g, h) {
      var X = h.X, Y = h.Y, ppm = h.ppm, rnd = h.rnd, x0 = X(-IX), x1 = X(IX), y0 = Y(IY), y1 = Y(-IY), r = IR * ppm;
      function rr(ins) { var a = x0 + ins, b = x1 - ins, c = y0 + ins, d = y1 - ins, q = Math.max(1, r - ins); g.beginPath(); g.moveTo(a + q, c); g.lineTo(b - q, c); g.quadraticCurveTo(b, c, b, c + q); g.lineTo(b, d - q); g.quadraticCurveTo(b, d, b - q, d); g.lineTo(a + q, d); g.quadraticCurveTo(a, d, a, d - q); g.lineTo(a, c + q); g.quadraticCurveTo(a, c, a + q, c); g.closePath(); }
      g.fillStyle = '#d9d6cf'; rr(0); g.fill();                       // bordillo de granito (0,3 m)
      g.fillStyle = 'rgba(120,114,104,0.5)'; rr(0.27 * ppm); g.fill();
      g.save(); rr(0.3 * ppm); g.clip(); g.fillStyle = sandC; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (var i = 0; i < 60; i++) {
        var bx = x0 + rnd() * (x1 - x0), by = y0 + rnd() * (y1 - y0), br = (1.2 + rnd() * 3) * ppm, lt = rnd() < 0.5;
        var gr = g.createRadialGradient(bx, by, 0, bx, by, br); gr.addColorStop(0, lt ? 'rgba(255,246,226,0.22)' : 'rgba(176,136,86,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      g.restore();
      for (var s = 0; s < 18; s++) { var a = rnd() * TAU, sx = (rnd() * 2 - 1) * IX, sy = (rnd() < 0.5 ? -1 : 1) * (IY + 0.2 + rnd() * 0.4); g.fillStyle = rgba(sandC, 0.35); g.beginPath(); g.ellipse(X(sx), Y(sy), (0.3 + rnd() * 0.5) * ppm, 0.12 * ppm, a * 0, 0, TAU); g.fill(); }
    };
  }

  // ---------- receta → def ----------
  VB.VenueGen.beachDef = function (sp) {
    if (!sp || sp.kind !== 'beach') return null;
    var p = sp.p, P0 = sp.pal, scen = p.scen, night = !!sp.night, env = envOf(sp), looks = looksOf(sp);
    var seatA = P0.seatA, seatB = P0.seatB || '#f2f2f2', acc = P0.accent || seatA, tape = P0.tape || '#1f5fbf';
    var light = lum(seatA) > 0.55, rows = p.blocks ? clamp(p.rows | 0, 2, 8) : 0;
    var sides = !p.blocks ? [] : p.blocks === 1 ? [-1] : [-1, 1];
    var fill = clamp(0.3 + 0.6 * (p.crowd || 0.5), 0.3, 0.9);
    var snow = env.style === 'alpnord' || env.clima === 'cold';
    var NT = { halos: null, cones: null, emis: null };   // piezas de noche de ESTA def (la cola LRU guarda hasta 4 defs)
    var P = {
      looks: looks,
      clouds: !night, gulls: !night && scen !== 'plaza', boats: false /* (los llaüts que navegan son de Platja Llarga) */, surf: p.surf || 0,
      tape: tape, tapeEdge: rgba(shade(tape, 0.35), 0.55), attackCord: rgba(tape, 0.5),
      brand: { name: sp.pad, fg: light ? '#1d1530' : '#ffffff', bg: [shade(seatA, 0.72), seatA], deco: 'cut' },
      bannerCut: lum(acc) > 0.3 ? acc : '#ffffff', bannerFrame: night ? '#9aa6b4' : '#e9eef3',
      bannerBg: night ? [shade(seatA, 0.3), shade(seatA, 0.42)] : null, bannerFg: night ? '#ffffff' : null,
      bcol: { canA: '#f4f2ec', canB: seatA, coral: acc, padA: seatA, padW: lum(seatA) > 0.25 ? '#1f2a3d' : '#f4f2ec', netTop: lum(acc) > 0.35 ? acc : '#f7c531',
        post: '#3a3d48', bag: shade(seatB, 0.8) },
      stands: { frame: shade(seatB, lum(seatB) > 0.6 ? 0.55 : 0.85), can: ['#f4f2ec', seatA, seatB], rows: rows, sides: sides, fill: fill },
      score: { frame: seatA, cab: shade(seatA, 0.35), top: acc, cut: '#f4f2ec' },
      crowd: { shirts: [seatA, seatB, acc, seatA, '#f4f2ec', '#2b2b33', '#ffd23f', '#3fd0b0', '#ff7aa8', '#8fc6ee', '#ffb43c'], hatP: night ? 0 : clamp(p.caps || 0.3, 0, 0.7),
        hats: [seatA, seatB, acc, '#f4f2ec', '#2b2b33', '#e9c46a'] },
      benchUmbrella: !night && scen !== 'plaza',
      props: function () { },   // el atrezo de esta sede va en build (con los asientos ya hechos: la grada de fondo añade los suyos)
      sand: sandFn(sp), sandTile: scen === 'plaza' ? '#c9c2b6' : hexOf(sp.sand || [0.96, 0.85, 0.64]),
      tile: scen === 'plaza' ? plazaTile(sp) : null, courtBase: scen === 'plaza' ? plazaBase(sp) : null,
      backdrop: function (g, W, H, k, h) { BK.beachSky(g, W, H, k, h, sp, { night: night, snow: snow, fog: scen === 'plaza' ? 'rgba(214,220,226,' : null }); },
      relight: !night
    };

    function build(G, K, B) {
      var c = K.col, rnd = K.rnd, BG = K.BGEO, BOX = K.UNIT_BOX, AT = K.at, seats = K.seats || [];
      var used = [];   // huecos ocupados (x, y, radio) para no montar piezas unas encima de otras
      var PT = PARTS = { base: B.i.length / 3, n: {} }, t0 = B.i.length;   // triángulos por parte (def.parts(): calibra la tabla de costes)
      function mark(k) { PT[k] = (PT[k] || 0) + (B.i.length - t0) / 3; t0 = B.i.length; }
      function reserve(x, y, r) { used.push([x, y, r]); }
      function free(x, y, r) { for (var i = 0; i < used.length; i++) { var u = used[i]; if (Math.hypot(x - u[0], y - u[1]) < r + u[2]) return false; } return true; }
      var standY = AT.BLY + Math.max(rows, 0) * 0.8 + 1.4;
      function blocked(x, y, r) {
        if (Math.abs(x) < AT.BX + 1.2 + r && Math.abs(y) < AT.BY + 1.5 + r) return true;                // pista, zona libre y vallas
        if (rows && Math.abs(x) < AT.BLX + 1.5 + r && Math.abs(y) < standY + r) return true;              // gradas
        if (x < -15 && x > -60 && Math.abs(y) < 15) return true;                                         // lo que mira la cámara de juego (el agua)
        if (Math.hypot(x - AT.BSB.x, y - AT.BSB.y) < 3 + r) return true;                                  // marcador
        return !free(x, y, r);
      }
      var waterX = scen === 'plaza' ? -36 : AT.SHORE_X + 3.5;   // hasta dónde hay tierra firme hacia el agua
      function spot(r, xa, xb, ya, yb, tries) {
        for (var t = 0; t < (tries || 30); t++) {
          var x = xa + rnd() * (xb - xa), y = (ya + rnd() * (yb - ya)) * (rnd() < 0.5 ? -1 : 1);
          if (x > waterX && !blocked(x, y, r)) { reserve(x, y, r); return [x, y]; }
        }
        return null;
      }
      var sea = G.getObjectByName('beachSea'), E = night ? new K.Builder() : null;

      // --- grada de fondo (3-4 bloques), detrás de NUESTRO fondo
      var endStand = p.blocks >= 3 && rows;
      if (endStand) { var er = Math.min(rows, 6); BK.endStand(K, B, AT.BX + 0.9, -8.2, 8.2, er, P.stands, seats, fill); reserve(AT.BX + 3.5, 0, 9); }
      // tope de público (escena ≤ Platja en triángulos: el muñeco del público pesa): se quitan asientos al azar (fijo por la semilla)
      while (seats.length > CROWD_MAX) seats.splice(Math.floor(rnd() * seats.length), 1);

      mark('endStand');
      // --- chiringuito y socorrista
      var hx = endStand ? 29 : 25, hy = endStand ? -12 : -5.5, hyaw = PI / 2 + 0.25;
      reserve(hx, hy, 4.2);
      if (p.hut === 'straw') BK.strawHut(K, B, hx, hy, hyaw, acc);
      else if (p.hut === 'kiosk') BK.kiosk(K, B, hx, hy, hyaw, seatA, '#f4f2ec');
      else if (p.hut === 'tent') BK.desertTent(K, B, hx, hy, hyaw, seatA, '#f4f2ec', 1.1);
      else if (p.hut === 'container') BK.containerBar(K, B, hx, hy, hyaw, seatA, acc);
      else K.props.chiringuito(B, hx, hy, hyaw);
      var ls = (sp.seed >>> 5) & 1 ? 1 : -1;   // lado del socorrista (fuera del eje del fondo)
      if (p.lifeguard === 'chair') { K.props.lifeChair(B, -26, ls * 24, -PI / 2 - 0.5 * ls); reserve(-26, ls * 24, 2); }
      else if (p.lifeguard === 'tower') { BK.lifeTower(K, B, -24.5, ls * 25, -PI / 2, acc); reserve(-24.5, ls * 25, 2.2); }
      else if (p.lifeguard === 'hut') { BK.stripedHut(K, B, -23.5, ls * 25, -PI / 2, '#e8504a', '#f4f2ec', 0.85); reserve(-23.5, ls * 25, 2); }

      mark('hutLife');
      // --- banderas de vela con los colores del club (mirando a la pista)
      var FLC = [seatA, acc, seatB, seatA, acc, seatB];
      [[-17.4, 7.5], [-17.4, -7.5], [17.2, 8.2], [17.2, -8.2]].forEach(function (f, i) { if (endStand && f[0] > 0) return; K.props.featherFlag(B, f[0], f[1], FLC[i], Math.atan2(-f[0], f[1]) + 0.45); });

      mark('flags');
      // --- escenario
      var rockC = scen === 'cove' ? ['#b39c82', '#9f8a74'] : ['#9a9590', '#857f78'];
      if (scen === 'plaza') {
        if (sea) sea.visible = false;
        var pave = c('#bdb6aa');
        B.sbox(160, 420, 0.1, -40 - 80, 0, -0.045, pave);   // la plaza sigue más allá de la malla del suelo
        var fc = ['#e8c9a8', '#d9a98a', '#efe0c8', '#cfb8a0', '#e4d4bc', mix(P0.wall || '#e9e4d8', '#ffffff', 0.4), '#c8d0d8'];
        if (night) fc = fc.map(function (h) { return shade(h, 0.62); });
        var awn = [seatA, seatB, acc, '#f4f2ec'], fo = { cols: fc, awn: awn, fmin: 2, fmax: 5, E: E, win: night ? '#1d2436' : null, cornice: night ? '#9a948a' : null };
        BK.facadeRow(K, B, 'x+', -44, -64, 64, Object.assign({}, fo, { fmin: 3 }));
        // (de noche, ventanas encendidas solo en las fachadas de los fondos: la emisiva no pasa de 4 k triángulos)
        BK.facadeRow(K, B, 'y-', 36, -44, 46, Object.assign({}, fo, { E: null }));
        BK.facadeRow(K, B, 'y+', -36, -44, 46, Object.assign({}, fo, { E: null }));
        BK.facadeRow(K, B, 'x-', 46, -36, 36, fo);
        // fuente en el eje, detrás del fondo rival (baja: no tapa la ciudad)
        K.objM(-29, 0, 0, 1);
        K.part(B, BG.cyl, 0, 0.3, 0, c('#d9d6cf'), 0, 0, 0, 3.2, 0.6, 3.2); K.part(B, BG.cyl, 0, 0.55, 0, c('#5fa8c8'), 0, 0, 0, 2.9, 0.1, 2.9);
        K.part(B, BG.cyl, 0, 1.3, 0, c('#d9d6cf'), 0, 0, 0, 0.35, 1.6, 0.35); K.part(B, BG.hemi, 0, 2.0, 0, c('#d9d6cf'), PI, 0, 0, 1.1, 0.35, 1.1);
        K.part(B, BG.cyl, 0, 2.1, 0, c('#7fc0dc'), 0, 0, 0, 0.9, 0.06, 0.9);
        // farolas y árboles en alcorque delante de las fachadas
        var lamp = c('#2f3440');
        for (var ly = -30; ly <= 30; ly += 10) [[-38, ly], [40, ly]].forEach(function (q) { K.objM(0, 0, 0, 1); K.lrod(B, q[0], 0, -q[1], q[0], 4.2, -q[1], 0.06, lamp); K.part(B, BOX, q[0], 4.3, -q[1], lamp, 0, 0, 0, 0.4, 0.25, 0.4); });
        for (var lx = -26; lx <= 36; lx += 12) [[lx, 31], [lx, -31]].forEach(function (q) { if (!blocked(q[0], q[1], 1.2)) { B.sbox(1.4, 1.4, 0.12, q[0], q[1], 0.02, c('#8a8278')); vegAt(q[0], q[1], 0.9); reserve(q[0], q[1], 1.5); } });
      } else if (scen === 'river') {
        var stone = c('#b8ad9c'), grass = c('#7faa5a'), wall = c('#9f9484');
        B.sbox(90, 420, 2.2, -118, 0, -0.5, wall); B.sbox(90, 420, 0.12, -118, 0, 0.66, grass); B.sbox(1.2, 420, 0.2, -72.6, 0, 0.7, stone);
        B.sbox(6, 420, 0.06, -76.5, 0, 0.73, c('#c9c2b6'));   // paseo
        for (var ty = -110; ty <= 110; ty += 11) { if (Math.abs(ty - 46) < 6) continue; BK.birch(K, B, -79.5, ty + rnd() * 2, 7 + rnd() * 2); }
        for (var py = -100; py <= 100; py += 22) { K.objM(0, 0, 0, 1); K.lrod(B, -74, 0.7, -py, -74, 4.8, -py, 0.07, c('#2f3440')); K.part(B, BOX, -74, 4.9, -py, c('#2f3440'), 0, 0, 0, 0.45, 0.25, 0.45); }
        BK.facadeRow(K, B, 'x+', -84, -130, 130, { cols: ['#e6dfd2', '#d9cbb8', '#efe0c8', '#cfd6dc', '#e8c9a8', '#d4c4ae'].map(function (h) { return night ? shade(h, 0.62) : h; }), base: 0.6, fmin: 3, fmax: 6, awn: [seatA, seatB], E: E, win: night ? '#1d2436' : null });
        BK.bridge(K, B, AT.SHORE_X - 1, -72, 46, 6, '#c9b49a', '#a8937c');
        reserve(-20, 46, 6);
        // nuestra orilla: muro bajo con escaleras a la arena a un lado (y juncos)
        for (var rq = 0; rq < 6; rq++) { var rp = spot(1.2, -24, -16, 18, 44); if (rp) BK.reeds(K, B, rp[0], rp[1], 1); }
      } else if (scen === 'lake') {
        var jy = ls * -13;
        BK.jetty(K, B, AT.SHORE_X + 2.5, jy, 18, 2.2, 0.5); reserve(-22, jy, 3);
        BK.jetty(K, B, AT.SHORE_X + 2.5, -jy * 2.2, 9, 1.8, 0.45);
        BK.buoyLine(K, B, -38, -34, -38, 34, '#ff7a2a', '#f4f2ec');
        BK.buoyLine(K, B, -38, -34, -26, -40); BK.buoyLine(K, B, -38, 34, -26, 40);
        rowboat(-31.5, jy + ls * 2.0, 0.15, seatA); rowboat(-35, jy - ls * 2.2, -0.1, '#f4f2ec'); rowboat(-28, -jy * 2.2 + 2.2, 0.3, acc);
        for (var rk2 = 0; rk2 < 8; rk2++) { var rp2 = spot(1.2, -24, -15, 17, 46); if (rp2) BK.reeds(K, B, rp2[0], rp2[1], 1 + rnd() * 0.3); }
        // trampolín flotante (plataforma con escalerilla) a un lado de la zona de baño
        B.sbox(3.2, 3.2, 0.4, -46, ls * 22, 0.1, c('#c9b49a')); B.sbox(0.6, 3.2, 0.06, -44.5, ls * 22, 0.33, c(acc));
      } else if (scen === 'port') {
        BK.breakwater(K, B, AT.SHORE_X + 2, ls * 30, 42, '#e8504a'); reserve(-22, ls * 30, 4);
        BK.jetty(K, B, AT.SHORE_X + 2.5, -ls * 24, 20, 2.4, 0.5);
        for (var mb = 0; mb < 4; mb++) motorboat(-30 - mb * 4.3, -ls * 24 + (mb % 2 ? 2.9 : -2.9), mb);
        BK.containerStack(K, B, 22, ls * 34, 3, 2, ['#e0a33a', '#b5532e', '#24406e', '#3f9e5a', '#19a39a', seatA]);
        reserve(28, ls * 34, 9);
        // norays en la orilla
        for (var by = -40; by <= 40; by += 10) if (Math.abs(by) > 16) { K.objM(0, 0, 0, 1); K.part(B, BG.cyl, AT.SHORE_X + 4, 0.25, -by, c('#2b2b33'), 0, 0, 0, 0.18, 0.5, 0.18); }
      } else if (scen === 'cove') {
        [[-24, 30, 3.0], [-27, -31, 2.6], [-30, 24, 1.7], [-29, -26, 2.0], [-21, 40, 2.4], [-23, -42, 2.8], [-34, 36, 3.6], [-35, -38, 3.2]].forEach(function (r) { BK.rock(K, B, r[0], r[1], r[2], rockC); reserve(r[0], r[1], r[2]); });
        [[-70, 62, 22], [-92, 52, 26], [-64, -66, 20], [-88, -58, 28], [-115, 40, 18], [-110, -44, 22]].forEach(function (r) { BK.rock(K, B, r[0], r[1], r[2], ['#a8927a', '#94806c']); });
        motorboat(-52, -ls * 20, 1, 0.9); motorboat(-60, ls * 12, 2, -0.5);
      } else if (scen === 'open') {   // boyas amarillas de la zona de baño y lanchas fondeadas mar adentro
        BK.buoyLine(K, B, -44, -36, -44, 36, '#ffd23f', '#ffd23f');
        [[-58, 18, 0.6], [-66, -24, -0.4], [-74, 34, 1.2]].forEach(function (b, i) { motorboat(b[0], b[1], i, b[2]); });
      } else if (scen === 'tropical') {
        canoe(-22.5, ls * 18, 0.4, acc); canoe(-23.5, ls * 21, 0.2, seatA);
        [[-80, 70, 14], [-96, -64, 18]].forEach(function (r) { BK.rock(K, B, r[0], r[1], r[2], ['#6f8f5a', '#5f7f4a']); });
      } else if (scen === 'dunes') {
        for (var cb = 0; cb < 6; cb++) { var cy = ls * (19 + cb * 3.2); BK.stripedHut(K, B, -19.5, cy, -PI / 2, cb % 2 ? seatA : acc, '#f4f2ec', 0.9); reserve(-19.5, cy, 1.6); }
        for (var dn = 0; dn < 9; dn++) { var dp = spot(4, 18, 46, 0, 46); if (!dp) continue; K.objM(dp[0], dp[1], rnd() * TAU, 1); K.part(B, BG.hemi, 0, -0.3, 0, c(hexOf((sp.sand || [0.9, 0.86, 0.74]).map(function (v) { return v * 0.96; }))), 0, 0, 0, 4 + rnd() * 3, 1.4 + rnd(), 3 + rnd() * 2); for (var gm = 0; gm < 3; gm++) BK.duneGrass(K, B, dp[0] + (rnd() - 0.5) * 5, dp[1] + (rnd() - 0.5) * 3, 1); }
      } else if (scen === 'desert') {
        [[30, 22], [33, 26], [27, 27], [31, 18]].forEach(function (q, i) { K.props.palm(B, q[0], q[1], 7 + i * 0.6, 0.12, rnd() * 6); reserve(q[0], q[1], 2); });
        for (var dd = 0; dd < 6; dd++) { var dq = spot(4, 18, 46, 0, 46); if (!dq) continue; K.objM(dq[0], dq[1], rnd() * TAU, 1); K.part(B, BG.hemi, 0, -0.4, 0, c(hexOf((sp.sand || [0.88, 0.72, 0.5]).map(function (v) { return v * 0.95; }))), 0, 0, 0, 5 + rnd() * 4, 1.6 + rnd(), 4 + rnd() * 2); }
      }

      mark('scen');
      // --- sombrillas (o jaimas), hamacas y toallas a los lados, junto al agua y detrás de las gradas
      var nU = scen === 'plaza' || scen === 'port' ? 0 : scen === 'river' ? 3 : 5 + (sp.tier | 0) * 2;
      var UMB = [[seatA, '#f4f2ec'], [acc, '#f4f2ec'], [seatB, seatA], ['#22b8d6', '#ffffff'], ['#ffd23f', '#ff6b5a'], ['#7ad36a', '#ffffff']];
      for (var u = 0; u < nU; u++) {
        var us = spot(2.2, -24, 30, 17, 40); if (!us) continue;
        PT.n.umb = (PT.n.umb || 0) + 1;
        var cc = UMB[u % UMB.length];
        if (scen === 'desert') { BK.desertTent(K, B, us[0], us[1], rnd() * TAU, cc[0], '#f4f2ec', 0.75); continue; }
        if (scen === 'tropical') K.props.umbrella(B, us[0], us[1], '#e2b65c', '#c9973f', 1.05); else K.props.umbrella(B, us[0], us[1], cc[0], cc[1], 1);
        if (u % 3 !== 2) K.props.lounger(B, us[0] + 1.3, us[1] + (rnd() < 0.5 ? -0.6 : 0.6), PI + (rnd() - 0.5) * 0.4, cc[0], '#ffffff');
        if (u % 2 === 0) K.props.towel(B, us[0] - 1.2, us[1] - 1.0, rnd() * TAU, UMB[(u + 2) % UMB.length][0], '#ffffff');
        if (u % 5 === 1) K.props.beachBall(B, us[0] + 0.6, us[1] - 1.5);
        if (scen === 'dunes' && u % 2) BK.windbreak(K, B, us[0] - 2.2, us[1] + 1.2, rnd() * PI, 3.2, cc[0], '#f4f2ec');
      }

      mark('umb');
      // --- vegetación de la receta (p.veg × p.vegN), en tierra y fuera de lo que mira la cámara
      function vegAt(x, y, s) {
        var v = p.veg;
        if (v === 'palm') K.props.palm(B, x, y, (6.8 + rnd() * 2) * s, 0.1 + rnd() * 0.1, rnd() * 6);
        else if (v === 'pine') K.props.pine(B, x, y, (6.8 + rnd() * 1.8) * s, rnd() * 6);
        else if (v === 'olive') BK.olive(K, B, x, y, (0.9 + rnd() * 0.4) * s);
        else if (v === 'birch') BK.birch(K, B, x, y, (6 + rnd() * 3) * s);
        else if (v === 'reeds') BK.reeds(K, B, x, y, s);
        else if (v === 'agave') { if (scen === 'desert' && rnd() < 0.5) BK.cactus(K, B, x, y, (2 + rnd() * 1.4) * s); else BK.agave(K, B, x, y, (0.9 + rnd() * 0.5) * s); }
        else BK.duneGrass(K, B, x, y, s);
      }
      var nV = scen === 'plaza' ? 0 : Math.round(p.vegN || 0);
      for (var vv = 0; vv < nV; vv++) { var vp = spot(1.8, -25, 44, 0, 44, 40); if (vp) { vegAt(vp[0], vp[1], 1); PT.n.veg = (PT.n.veg || 0) + 1; } }
      mark('veg');

      // --- noche: 4 mástiles de focos, guirnalda de bombillas en el fondo rival y el chiringuito encendido (emisiva + halos + haces)
      if (night) {
        var halo = [], haloS = [], cones = [], headC = looks.noche.sodium ? '#ffe2b0' : '#f4f8ff';
        // (cala: la guirnalda en V hacia el agua desde dos mástiles adelantados, para no repetir Cala dels Fanals desde la cámara de
        //  juego; mismos tramos de ~13,5 m, así que las mismas bombillas y el mismo coste)
        var coveN = scen === 'cove', bT = coveN ? [-17.4, 12.6] : [-19.4, 13.6], gP = coveN ? -21.4 : -19.4;
        [[bT[0], bT[1]], [bT[0], -bT[1]], [19.6, 13.8], [19.6, -13.8]].forEach(function (T) {
          var o = BK.lightTower(K, B, E, T[0], T[1], 12, headC);
          o.halo.forEach(function (hh) { halo.push(hh[0], hh[2], -hh[1]); haloS.push(hh[3]); }); cones.push(o.cone);
        });
        var bulbs = ['#ffe9b0', '#ffcf6a', '#fff3dc', looks.noche.sodium ? '#ffb070' : acc];
        K.objM(0, 0, 0, 1);
        [[bT[0], -bT[1], gP, 0], [gP, 0, bT[0], bT[1]]].forEach(function (s) {
          BK.garland(K, B, E, s[0], s[1], s[2], s[3], 5.2, 0.9, bulbs).forEach(function (hh) { halo.push(hh[0], hh[2], -hh[1]); haloS.push(hh[3]); });
        });
        K.objM(0, 0, 0, 1); K.lrod(B, gP, 0, 0, gP, 5.3, 0, 0.06, c('#4a3a2e'), BG.cyl);   // poste del centro de la guirnalda
        K.objM(hx, hy, hyaw, 1); K.part(E, BOX, 0, 2.3, -1.9, c('#ffcf6a'), 0, 0, 0, 2.4, 0.3, 0.03); halo.push(hx, 2.3, -hy); haloS.push(0.9);
        var em = new K.THREE.Mesh(E.build(), new K.THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
        em.name = 'genBeachEmissive'; em.frustumCulled = false; G.add(em); NT.emis = em;
        var hg = new K.THREE.BufferGeometry(); hg.setAttribute('position', new K.THREE.Float32BufferAttribute(halo, 3)); hg.setAttribute('aS', new K.THREE.Float32BufferAttribute(haloS, 1));
        var hm = K.haloMaterial(K.radialTex(looks.noche.sodium ? [[0, 'rgba(255,226,170,0.8)'], [0.2, 'rgba(255,200,130,0.26)'], [1, 'rgba(255,190,120,0)']] : [[0, 'rgba(240,246,255,0.8)'], [0.2, 'rgba(210,225,255,0.26)'], [1, 'rgba(200,215,255,0)']]));
        var hp = NT.halos = new K.THREE.Points(hg, hm); hp.name = 'genBeachHalos'; hp.frustumCulled = false; G.add(hp);
        var cm = NT.cones = K.coneMesh(cones, headC, 0.03); cm.name = 'genBeachCones'; G.add(cm);
        var q0 = K.quality(); cm.visible = !q0 || q0.rank >= 1;
      }

      mark('night'); PT.total = B.i.length / 3;

      // ---------- piezas pequeñas de este constructor ----------
      function rowboat(x, y, yaw, cc) {
        K.objM(x, y, yaw, 1);
        K.part(B, BOX, 0, 0.12, 0, c(cc), 0, 0, 0, 3.0, 0.4, 1.1); K.part(B, BG.cone4, 1.75, 0.12, 0, c(cc), PI / 4, 0, -PI / 2, 0.55, 0.55, 0.55);
        K.part(B, BOX, 0, 0.33, 0, c('#f4f2ec'), 0, 0, 0, 3.05, 0.06, 1.14); K.part(B, BOX, -0.3, 0.3, 0, c('#a77a4c'), 0, 0, 0, 0.3, 0.05, 1.0); K.part(B, BOX, 0.6, 0.3, 0, c('#a77a4c'), 0, 0, 0, 0.3, 0.05, 1.0);
      }
      function motorboat(x, y, i, yaw) {
        var hull = ['#f4f2ec', '#2f5d8a', '#f4f2ec', '#8a3a32'][i % 4];
        K.objM(x, y, yaw == null ? PI / 2 : yaw, 1);
        K.part(B, BOX, 0, 0.3, 0, c(hull), 0, 0, 0, 4.4, 0.7, 1.7); K.part(B, BG.cone4, 2.6, 0.3, 0, c(hull), PI / 4, 0, -PI / 2, 0.85, 0.9, 0.85);
        K.part(B, BOX, 0.1, 0.68, 0, c(i % 2 ? acc : seatA), 0, 0, 0, 4.5, 0.08, 1.74); K.part(B, BOX, -0.5, 1.0, 0, c('#e8eef2'), 0, 0, 0, 1.6, 0.7, 1.3);
        K.part(B, BOX, 0.32, 1.05, 0, c('#34445a'), 0, 0, 0.5, 0.05, 0.5, 1.2);
      }
      function canoe(x, y, yaw, cc) {
        K.objM(x, y, yaw, 1);
        K.part(B, BG.sph6, 0, 0.18, 0, c(cc), 0, 0, 0, 2.4, 0.3, 0.45); K.part(B, BOX, 0, 0.36, 0, c('#8a5a32'), 0, 0, 0, 0.1, 0.05, 0.5);
        K.lrod(B, -0.6, 0.4, 0.3, 0.8, 0.45, -0.4, 0.03, c('#c8955a'));
      }
    }

    var PARTS = null;
    function quality(q) { if (NT.cones) NT.cones.visible = !!(q && q.rank >= 1); }
    function step(t, rdt, g, K) {
      if (!NT.halos) return;
      var M = K.mood(), soft = K.soft();
      NT.halos.material.uniforms.opacity.value = (1 - 0.1 * M.tense) * (1 + 0.25 * M.pf * soft);
      if (NT.cones) NT.cones.material.uniforms.k.value = 0.03 * (1 - 0.1 * M.tense) * (1 + 0.5 * M.win);
    }
    function dispose() { NT.halos = NT.cones = NT.emis = null; }

    return { id: sp.id, kind: 'beach', gen: true, spec: sp, seed: (sp.seed >>> 0) || 1, scen: scen, P: P, build: build, quality: quality, step: step, dispose: dispose,
      /** Triángulos de la estática por parte en el último montaje (base = lo de Platja: gradas, vallas, banquillos, marcador). */
      parts: function () { return PARTS; } };
  };
})();
