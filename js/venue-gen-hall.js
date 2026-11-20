/* MAKE THE CUT — js/venue-gen-hall.js (owner: arena)
 * Constructor de las sedes GENERADAS de pabellón: VB.VenueGen.hallDef(spec) → def de VB.Arena (mismo contrato que Can Rebot:
 * {id, kind:'hall', seed, hide, look, floor, floorLine, floorAdjust, score, drawScore, build(G, K), step, quality, dispose}).
 *
 * FASES F2-F3 (plan «sedes-gen»): los nueve arquetipos con las piezas del kit (js/venue-genkit.js).
 *  - Un solo constructor paramétrico (hallBuilt) sobre la PLANTA pura de la receta (plan: paredes, gradas, alero, marcador, chaflanes,
 *    balconada): H1 = dientes de sierra; H2 = bóveda de cañón con costillas y lucernario; H3 = dos aguas con cerchas o techo plano con
 *    cerchas vistas; H4 LÁMINA = lámina plegada de hormigón con tímpanos y banda alta de ventanas; H5 MADERA = arcos laminados que
 *    arrancan del suelo junto a las paredes largas (el atrezo de los laterales se aparta de los pilares: freeX) con entablado y
 *    ventanas en arco; H6 MODERNO = techo oscuro de lamas, ventanales de vidrio y grada asimétrica (la de enfrente, la mitad de filas);
 *    H7 COLISEO = octógono (chaflanes en las esquinas, cerchas radiales y linterna) o cúpula rebajada de gajos con óculo, anillo de
 *    óculos en los laterales y balconada de 1-2 pisos en el lateral +y (con público y pancartas en el antepecho).
 *    Gradas none / one (lado del 1r árbitro) / two / U (lado del 1r árbitro + los dos fondos), de madera telescópica, de hormigón o
 *    bleacher, con el esquema de asientos de la receta (liso, alterno, degradado, gris con acento o mosaico de siglas). Paredes con
 *    zócalo y acabado por bandas de color de vértice; fondo rival en los DOS fondos (espalderas, mural, ciudad en letras, peña,
 *    ventanal con vista o escenario); campanas o paneles LED.
 *  - Seña del arquetipo en los dos fondos, a la altura del marcador (KIT.endSig; el techo no sale en las cámaras de juego): H1
 *    perfil de dientes de sierra, H2 arco de ladrillo con luneto, H3 frontón con tirante o cercha Warren (techo plano), H4 perfil de
 *    lámina plegada, H5 arco laminado de madera con lamas, H6 muro cortina con la ciudad detrás (sube hasta el alero), H7 arquería.
 *  - Flavors regionales (segunda seña; la cámara de juego mira al fondo −x): jpkr escenario con telón en el fondo −x y zócalo de
 *    madera clara (y el suelo de arce de la receta); us bleachers amarillos y estandartes colgados en los dos laterales; trop
 *    lateral abierto con brise-soleil en los fondos a la altura del zócalo (KIT.openBand: lo que SÍ ve la cámara de juego; con
 *    gradas en los fondos, paños altos a sus lados), ventiladores de techo y jardineras; gulf celosía en el mismo sitio, cenefa
 *    geométrica en el lateral +y y bajo el marcador con peña (y azulejo de la receta); east mural de mosaico (en la franja del fondo o en el lateral +y).
 *  - Dibujos propios: suelo exterior, estática, emisiva, rótulos, marcador, público = 6 en baja (público en IMPOSTORES: K.crowdImp,
 *    el programa de los de Palau); + tinta + haces (sol) o halos (noche) en media/alta = 8. Sin programas nuevos respecto a Can
 *    Rebot y Palau (mismos materiales del kit).
 *  - Focos: la planta (VB.VenueGen.plan) no cuelga la fila central por debajo de 8,3 m (la cámara de televisión del 6v6 la veía
 *    encima de la pista; tools/venuegen-lamps.js).
 *  - H8/H9: PIEL DE PALAU (def.skin = 'palau'): estática con el tono del club (recolor; H8 más oscura), asientos (seatPaint),
 *    vallas LED con el nombre, siglas y cántico (ledText), banderolas (bannerPaint) y tarima con el escudo en la zona libre; H9 añade
 *    vallas LED de gala (oro sobre negro, estrella de 8 puntas; la cúpula bajo el techo de Palau no salía en las cámaras de juego y
 *    se retiró: H9 = Palau + 0 dibujos).
 *  - floorAdjust(camisetaA, camisetaB): si la pista se parece a una de las camisetas del partido (ΔE76 < 25), gira el tono ±30°.
 * Todo lo que se crea va por el kit K de arena (se libera al salir); la tarima de Palau se repinta (def.floor, 0 memoria).
 */
(function () {
  'use strict';
  var VB = window.VB; if (!VB || !VB.VenueGen || !VB.VenueGen.kit || !VB.Arena || !VB.Arena.registerMap) return;
  var PI = Math.PI;

  // ---------- color (sRGB 0..1) ----------
  function rgbOf(h) {
    if (typeof h === 'number') return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
    var s = String(h || '#808080').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function hexOf(c) { var s = '#'; for (var i = 0; i < 3; i++) { var v = Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16); s += v.length < 2 ? '0' + v : v; } return s; }
  function hsl(c) {
    var r = c[0], g = c[1], b = c[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 1e-6) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function rgbH(q) {
    var h = ((q[0] % 360) + 360) % 360 / 360, s = q[1], l = q[2];
    if (s <= 0) return [l, l, l];
    var t2 = l < 0.5 ? l * (1 + s) : l + s - l * s, t1 = 2 * l - t2;
    function f(t) { t = (t + 1) % 1; return t < 1 / 6 ? t1 + (t2 - t1) * 6 * t : t < 0.5 ? t2 : t < 2 / 3 ? t1 + (t2 - t1) * (2 / 3 - t) * 6 : t1; }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  function rot(hex, deg) { if (!deg) return hex; var q = hsl(rgbOf(hex)); q[0] += deg; return hexOf(rgbH(q)); }
  function shade(hex, k) { var c = rgbOf(hex); return hexOf([c[0] * k, c[1] * k, c[2] * k]); }
  function lab(h) {
    var c = rgbOf(h).map(function (v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    var x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  function dE(a, b) { var A = lab(a), B = lab(b); return Math.sqrt((A[0] - B[0]) * (A[0] - B[0]) + (A[1] - B[1]) * (A[1] - B[1]) + (A[2] - B[2]) * (A[2] - B[2])); }
  /** Giro del tono de la pista contra las camisetas del partido: 0, +30 o −30 (el que más la separe de las dos). */
  function floorAdjustFor(court) {
    return function (kA, kB) {
      function md(c) { return Math.min(dE(c, kA), dE(c, kB)); }
      if (md(court) >= 25) return 0;
      return md(rot(court, 30)) >= md(rot(court, -30)) ? 30 : -30;
    };
  }
  function fit(g, txt, weight, size, maxW, FONT) {
    var s = size; g.font = weight + ' ' + Math.round(s) + 'px ' + FONT;
    while (s > 8 && g.measureText(txt).width > maxW) { s *= 0.92; g.font = weight + ' ' + Math.round(s) + 'px ' + FONT; }
  }

  var KIT = VB.VenueGen.kit, KS = KIT.shade, KM = KIT.mix, lum = KIT.lum;

  // ---------- tarima (lienzo de Palau: todo menos las líneas FIVB, que pinta arena.js con def.floorLine) ----------
  function floorPainter(sp, crest) {
    var P = sp.pal, p = sp.p, wood = p.floorMat === 'maple' || p.floorMat === 'oak' || p.floorMat === 'darkwood';
    return function (g, h) {
      var X = h.X, Y = h.Y, rect = h.rect, ppm = h.ppm, C = h.C, rnd = h.rnd, court = rot(P.court, h.hue || 0);
      g.fillStyle = shade(P.free, 0.82); g.fillRect(0, 0, h.W, h.H);
      g.fillStyle = P.free; rect(-h.FZX, -h.FZY, h.FZX, h.FZY);
      g.fillStyle = court; rect(-C.HL, -C.HW, C.HL, C.HW);
      g.fillStyle = p.floorMat === 'synth2' ? shade(court, 0.84) : shade(court, 0.93); rect(-C.ATTACK, -C.HW, C.ATTACK, C.HW);   // dos tonos: zona de ataque
      g.save(); g.beginPath(); g.rect(X(-h.FZX), Y(h.FZY), 2 * h.FZX * ppm, 2 * h.FZY * ppm); g.clip();
      if (wood) KIT.planks(g, X, Y, -h.FZX, -h.FZY, h.FZX, h.FZY, ppm, rnd, p.floorMat === 'darkwood', 0.45);   // tablas de 15 cm (vetas suaves: madera pintada)
      else if (KIT.grain) { g.fillStyle = KIT.grain(g, rnd, 0.07); g.fillRect(0, 0, h.W, h.H); }        // grano de goma
      g.restore();
      if (p.floorMat === 'multi') KIT.sportLines(g, X, Y, ppm, 1.5, 'rgba(58,111,216,' + (p.multiA || 0.4) + ')', 'rgba(242,194,48,' + (p.multiA || 0.4) + ')');
      if (p.floorLogo) {   // nombre de la sede en la zona libre, a los dos fondos
        g.save(); g.fillStyle = 'rgba(255,255,255,0.2)'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (var s = -1; s <= 1; s += 2) { g.save(); g.translate(X(s * 15.2), Y(0)); g.rotate(-s * PI / 2); fit(g, sp.pad, '900', 1.0 * ppm, 14 * ppm, h.FONT); g.fillText(sp.pad, 0, 0); g.restore(); }
        g.restore();
      }
      if (crest) {   // piel de Palau (H8/H9): escudo del club en la zona libre detrás de cada línea de fondo
        var cr = 1.15 * ppm, cB = P.seatB === '#7d838c' ? '#f4f1e8' : P.seatB;
        for (var s2 = -1; s2 <= 1; s2 += 2) {
          g.save(); g.translate(X(s2 * (C.HL + 2.7)), Y(0)); g.rotate(-s2 * PI / 2); g.globalAlpha = 0.85; g.textAlign = 'center'; g.textBaseline = 'middle';
          KIT.crest(g, [-cr, -cr, 2 * cr, 2 * cr], ppm / 60, P.seatA, cB, '#1d1530', String(sp.short || '?').charAt(0).toUpperCase(), sp.seed % 4, (sp.seed >> 3) % 3, h.FONT);
          g.restore();
        }
      }
      // barniz: dos franjas diagonales apenas más claras sobre la pista (más marcadas en la madera)
      g.save(); g.beginPath(); g.rect(X(-C.HL), Y(C.HW), 2 * C.HL * ppm, 2 * C.HW * ppm); g.clip(); g.fillStyle = wood ? 'rgba(255,245,230,0.05)' : 'rgba(255,240,225,0.04)';
      for (var gl = -1; gl <= 1; gl += 2) { var gx = X(gl * 4.6); g.beginPath(); g.moveTo(gx - 0.6 * ppm, Y(C.HW)); g.lineTo(gx + 0.6 * ppm, Y(C.HW)); g.lineTo(gx - 1.9 * ppm, Y(-C.HW)); g.lineTo(gx - 3.1 * ppm, Y(-C.HW)); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(20,16,30,0.4)'; var ik = 0.035;   // filo de tinta por fuera de la pista
      rect(-C.HL - ik, C.HW, C.HL + ik, C.HW + ik); rect(-C.HL - ik, -C.HW - ik, C.HL + ik, -C.HW);
      rect(-C.HL - ik, -C.HW, -C.HL, C.HW); rect(C.HL, -C.HW, C.HL + ik, C.HW);
    };
  }

  /* ======================================================================== arquetipos H1-H7 (F2-F3) */
  // La PLANTA (paredes, gradas, alero, techo efectivo, marcador, ventanales, focos, chaflanes y balconada) es pura y vive en la receta:
  // VB.VenueGen.plan(sp) (la usa también VB.VenueGen.cost).
  var plan = VB.VenueGen.plan, V0 = 11.9, VE = 17.4;
  function archOf(sp) { return plan(sp).A; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function R2(x) { return Math.round(x * 100) / 100; }

  /** Temperatura de color (K) → hex (tabla corta). */
  function kelvin(t) {
    var T = [[2700, '#ffcf8a'], [3500, '#ffdcaa'], [4500, '#ffeacb'], [5500, '#fff3e2'], [6500, '#f2f5ff']];
    for (var i = 1; i < T.length; i++) if (t <= T[i][0]) return KM(T[i - 1][1], T[i][1], (t - T[i - 1][0]) / (T[i][0] - T[i - 1][0]));
    return T[T.length - 1][1];
  }
  /** Luz de la sede (fila LT de Can Rebot como base): de día sol o nublado; de noche sodio o LED. */
  function lookOf(sp, L) {
    var p = sp.p, P = sp.pal, tc = kelvin(p.tempK || 5500), wallL = KM(P.wall, '#f2ece0', 0.45);
    if (!sp.night) {
      var sun = p.light === 'sun', az = (p.sunAz || 0) * PI / 180, el = (p.sunEl || 50) * PI / 180, D = 28;
      var fog = KM(wallL, sun ? '#e2d6bc' : '#d3d8de', 0.5);
      return { fog: fog, near: 38, far: 120, hemi: KM('#f3e6c8', tc, 0.4), ground: KS(KM(P.free, '#8f6a4a', 0.6), 0.9), key: tc, fill: sun ? '#cfe3ff' : '#dbe6f2', rim: '#fff6e4',
        keyK: sun ? 1.0 : 0.72, hemiK: (p.hemiK || 2.2) + (sun ? 0 : 0.25), fillK: sun ? 1.1 : 1.35, rimK: 0.85, floorK: Math.max(1, p.floorK || 1.05), haze: fog, hazeK: 0.04,
        crowdLight: 1.0, crowdDim: p.crowdDim, keyDir: sun ? [R2(Math.cos(el) * Math.cos(az) * D), R2(Math.cos(el) * Math.sin(az) * D), R2(Math.max(0.5, Math.sin(el)) * D)] : [6, -4, 26] };
    }
    var na = p.light === 'sodium', fogN = KS(KM(P.wall, na ? '#3a2c20' : '#20283a', 0.7), 0.75);
    return { fog: fogN, near: 36, far: 110, hemi: na ? '#f2dcc0' : '#dfe6f2', ground: KS(KM(P.wall, '#2a2a30', 0.5), 0.8), key: p.lightColor || (na ? '#ffcf8a' : '#eef4ff'),
      fill: na ? '#c8a882' : '#a9bcdc', rim: '#ffffff', keyK: 1.05, hemiK: (p.hemiK || 2.0) * 0.85, fillK: 0.9, rimK: 0.6, floorK: Math.max(1, p.floorK || 1.05),
      haze: fogN, hazeK: 0.05, crowdLight: 0.85, crowdDim: p.crowdDim, keyDir: [4, -6, 27] };
  }

  var STREET = ['#3a5a8c', '#8c3a3a', '#e0d6c0', '#6a8c4a', '#444a55', '#c97a3a', '#f4f2ec', '#e8c14a', '#7a5a9c', '#2f8f8f', '#d8d0f0', '#a0522d'];
  var PANTS = ['#2e4466', '#1f2a3d', '#4a4f5a', '#6b5a48', '#2b2b33', '#3f5f8f', '#5a6a4a'];
  var BEAM_K = 0.045, CROWD_ROOM = [34000, 86000];   // triángulos para estática + público en baja y en media

  /** Def de VB.Arena de un pabellón generado H1-H7. */
  function hallBuilt(sp) {
    var p = sp.p, P = sp.pal, L = plan(sp), LOOK = lookOf(sp), ST = { cv: null, tex: null, pcv: null, ptex: null, floorMat: null, cones: null, score: null, halos: null };
    var WX = L.WX, YS = L.YS, YN = L.YN, EAVE = L.eave;
    var flav = sp.flavor || '';
    var ledGrid = null;
    function drawScore(K, SB) {
      var cv = ST.cv; if (!cv) return;
      if (p.score === 'flip') KIT.scoreFlip(cv, SB, K.FONT, P.accent);
      else if (p.score === 'led' || p.score === 'cube') { if (!ledGrid) ledGrid = KIT.ledGrid(cv.getContext('2d'), cv.width / 512); KIT.scoreLed(cv, SB, K.FONT, lift(P.accent), ledGrid); }
      else KIT.scoreSegments(cv, SB, K.FONT);
      if (ST.tex) ST.tex.needsUpdate = true;
    }
    /** Color del club para luces y LED: saturado y claro (los de la receta van apagados para las superficies). */
    function lift(hex) { var q = hsl(rgbOf(hex)); q[1] = Math.max(q[1], 0.7); q[2] = clamp(q[2], 0.55, 0.65); return hexOf(rgbH(q)); }

    function drawPrints(cv, FONT, rnd) {
      var g = cv.getContext('2d'), k = cv.width / 1024, A = KIT.ATL;
      function R(r) { return [r[0] * k, r[1] * k, (r[2] - r[0]) * k, (r[3] - r[1]) * k]; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      var cA = P.seatA, cB = P.seatB === '#7d838c' ? '#f4f1e8' : P.seatB, ink = '#1d1530', light = lum(P.wall) > 0.5;
      // letrero pintado en la pared: nombre de la sede y escudo
      var q = R(A.sign); g.fillStyle = light ? KS(P.wall, 1.04) : KM(P.wall, '#f4efe4', 0.75); g.fillRect(q[0], q[1], q[2], q[3]);
      g.fillStyle = KS(cA, 0.85); g.fillRect(q[0] + 30 * k, q[1] + 80 * k, q[2] - 60 * k, 6 * k);
      g.fillStyle = KS(cA, 0.8); KIT.fitFont(g, sp.name.toUpperCase(), '900', 64 * k, 820 * k, FONT); g.fillText(sp.name.toUpperCase(), q[0] + 560 * k, q[1] + 42 * k);
      KIT.crest(g, [q[0] + 30 * k, q[1] + 4 * k, 84 * k, 72 * k], k, cA, cB, ink, String(sp.short || '?').charAt(0).toUpperCase(), sp.seed % 4, (sp.seed >> 3) % 3, FONT);
      // pancartas de tela (txt.banners, colores del club alternos)
      var bans = (sp.txt && sp.txt.banners) || [sp.pad];
      A.ban.forEach(function (r, i) {
        var qq = R(r), bg = i % 3 === 0 ? cA : i % 3 === 1 ? cB : P.accent, fg = lum(bg) > 0.55 ? ink : '#ffffff', t = bans[i % bans.length];
        g.fillStyle = bg; g.fillRect(qq[0], qq[1], qq[2], qq[3]);
        g.strokeStyle = fg === ink ? 'rgba(29,21,48,0.6)' : 'rgba(255,255,255,0.85)'; g.lineWidth = 3 * k; g.setLineDash([10 * k, 7 * k]); g.strokeRect(qq[0] + 6 * k, qq[1] + 6 * k, qq[2] - 12 * k, qq[3] - 12 * k); g.setLineDash([]);
        g.save(); g.translate(qq[0] + qq[2] / 2, qq[1] + qq[3] / 2); g.rotate(i % 2 ? 0.02 : -0.025);
        g.fillStyle = fg; KIT.fitFont(g, t, 'italic 900', 40 * k, qq[2] * 0.86, FONT); g.fillText(t, 0, 2 * k); g.restore();
      });
      // escudo grande (fondo y vitrina)
      var cq = R(A.crest); g.fillStyle = KM(P.wall, '#ffffff', 0.5); g.fillRect(cq[0], cq[1], cq[2], cq[3]);
      KIT.crest(g, cq, k, cA, cB, ink, String(sp.short || '?').charAt(0).toUpperCase(), sp.seed % 4, (sp.seed >> 3) % 3, FONT);
      // banderines de campeón (sin texto: estrella y franja)
      A.pen.forEach(function (r, i) {
        var pq = R(r); g.fillStyle = P.wall; g.fillRect(pq[0], pq[1], pq[2], pq[3]); g.fillStyle = i % 2 ? cB : cA;
        g.beginPath(); g.moveTo(pq[0] + 2 * k, pq[1]); g.lineTo(pq[0] + pq[2] - 2 * k, pq[1]); g.lineTo(pq[0] + pq[2] - 2 * k, pq[1] + pq[3] * 0.72); g.lineTo(pq[0] + pq[2] / 2, pq[1] + pq[3]); g.lineTo(pq[0] + 2 * k, pq[1] + pq[3] * 0.72); g.closePath(); g.fill();
        g.fillStyle = i % 2 ? cA : cB; g.fillRect(pq[0] + 2 * k, pq[1] + 10 * k, pq[2] - 4 * k, 8 * k);
        g.fillStyle = '#ffd23c'; star(g, pq[0] + pq[2] / 2, pq[1] + pq[3] * 0.48, 15 * k);
      });
      // vista de los ventanales del fondo
      // (H6: la ciudad detrás del muro cortina de los fondos; flavor east sin mural en el fondo: el mosaico va en esta región)
      var mosaicCols = [cA, cB, P.accent, '#2f6fae', '#f2d24a', KM(P.wall, '#f2ece0', 0.6)];
      if (flav === 'east' && p.back !== 'mural' && p.back !== 'letters' && p.back !== 'pena' && p.back !== 'view' && L.A !== 'H6') KIT.mosaicPaint(g, R(A.view), mosaicCols, sp.seed);
      else KIT.viewPaint(g, R(A.view), L.A === 'H6' || p.view === 'none' ? 'city' : p.view, sp.night, rnd, P.wall);
      if (flav === 'gulf') KIT.friezePaint(g, R(A.frieze), KS(P.accent, 0.9), '#1f7f8f', '#f1ece0');
      // franja del fondo rival: mural geométrico o la ciudad en letras grandes (flavor east: mural de mosaico)
      var bq = R(A.back);
      if (flav === 'east') KIT.mosaicPaint(g, bq, mosaicCols, sp.seed);   // (con peña en los fondos, el mosaico ocupa la franja del mural)
      else if (p.back === 'letters') {
        g.fillStyle = KS(P.wall, 0.97); g.fillRect(bq[0], bq[1], bq[2], bq[3]);
        var city = String(sp.help || '').split('·')[1]; city = (city || sp.short || '').trim().toUpperCase();
        g.fillStyle = cA; g.strokeStyle = ink; g.lineWidth = 5 * k; KIT.fitFont(g, city, '900', 92 * k, bq[2] * 0.94, FONT);
        g.strokeText(city, bq[0] + bq[2] / 2, bq[1] + bq[3] / 2 + 4 * k); g.fillText(city, bq[0] + bq[2] / 2, bq[1] + bq[3] / 2 + 4 * k);
      } else {
        var cols = [cA, cB, P.accent, KS(cA, 0.7), KM(cB, '#ffffff', 0.3)], mode = sp.seed % 3, n = 16;
        g.fillStyle = KS(cA, 0.6); g.fillRect(bq[0], bq[1], bq[2], bq[3]);
        for (var i = 0; i < n; i++) {
          var x0 = bq[0] + bq[2] * i / n, w = bq[2] / n; g.fillStyle = cols[(i * 7 + (sp.seed >> 5)) % cols.length];
          g.beginPath();
          if (mode === 0) { g.moveTo(x0, bq[1] + bq[3]); g.lineTo(x0 + w, bq[1]); g.lineTo(x0 + w, bq[1] + bq[3]); }           // dientes
          else if (mode === 1) { g.arc(x0 + w / 2, bq[1] + bq[3], w * 0.5, PI, 2 * PI); }                                     // arcos
          else { g.moveTo(x0 + w / 2, bq[1]); g.lineTo(x0 + w, bq[1] + bq[3] / 2); g.lineTo(x0 + w / 2, bq[1] + bq[3]); g.lineTo(x0, bq[1] + bq[3] / 2); } // rombos
          g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(bq[0], bq[1] + 4 * k, bq[2], 4 * k); g.fillRect(bq[0], bq[1] + bq[3] - 8 * k, bq[2], 4 * k);
      }
      // placas: vestuarios 1 y 2 (números), franja de los marcadores, zapatillas de calle no (pictograma) y cartel
      function plate(r, bg, fg, s) { var qq = R(r); g.fillStyle = bg; g.fillRect(qq[0], qq[1], qq[2], qq[3]); g.fillStyle = fg; KIT.fitFont(g, s, '900', 26 * k, qq[2] * 0.8, FONT); g.fillText(s, qq[0] + qq[2] / 2, qq[1] + qq[3] / 2 + 1 * k); }
      plate(A.plate1, '#f4f1e8', KS(cA, 0.8), '1'); plate(A.plate2, '#f4f1e8', KS(cA, 0.8), '2');
      var sq = R(A.strip); g.fillStyle = KS(cA, 0.85); g.fillRect(sq[0], sq[1], sq[2], sq[3]); g.fillStyle = '#ffffff'; KIT.fitFont(g, sp.pad, '800', 26 * k, sq[2] * 0.9, FONT); g.fillText(sp.pad, sq[0] + sq[2] / 2, sq[1] + sq[3] / 2 + 1 * k);
      var nq = R(A.noShoe); g.fillStyle = '#ffffff'; g.fillRect(nq[0], nq[1], nq[2], nq[3]); g.strokeStyle = '#d8342c'; g.lineWidth = 3 * k;
      g.beginPath(); g.arc(nq[0] + nq[2] / 2, nq[1] + nq[3] / 2, 12 * k, 0, 2 * PI); g.stroke(); g.beginPath(); g.moveTo(nq[0] + nq[2] / 2 - 8 * k, nq[1] + nq[3] / 2 + 8 * k); g.lineTo(nq[0] + nq[2] / 2 + 8 * k, nq[1] + nq[3] / 2 - 8 * k); g.stroke();
      var pq2 = R(A.poster); g.fillStyle = P.accent; g.fillRect(pq2[0], pq2[1], pq2[2], pq2[3]); g.fillStyle = '#ffffff'; KIT.fitFont(g, (sp.txt && sp.txt.chant) || sp.pad, '900', 22 * k, pq2[2] * 0.9, FONT); g.fillText((sp.txt && sp.txt.chant) || sp.pad, pq2[0] + pq2[2] / 2, pq2[1] + pq2[3] / 2 + 1 * k);
    }
    function star(g, x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.45 : r; g[i ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a)); } g.closePath(); g.fill(); }

    function build(G, K) {
      var THREE = K.THREE, H = KIT.ctx(K), col = H.col, rnd = K.rnd, bx = H.bx, AT = K.at;
      var S = new K.Builder(), E = new K.Builder(), q0 = K.quality(), lite = !!(q0 && q0.rank === 0);
      var night = sp.night, A = L.A;
      var glassHex = night ? '#1a2238' : p.light === 'sun' ? '#9ccff0' : '#c3d2dc';
      // paleta de la carcasa: techo, cerchas y remates según el arquetipo
      var trussHex = rnd() < 0.5 ? '#3f4a5c' : rnd() < 0.5 ? '#e4e0d8' : KS(P.accent, 0.62);
      var roofHex = A === 'H1' ? '#6f7d93' : A === 'H2' ? (p.wall === 'brick-red' || p.wall === 'brick-yellow' ? '#e6dfd0' : '#b48a5c') : A === 'H4' ? '#aeaaa2' : A === 'H5' ? '#d4a86a'
        : A === 'H6' ? (rnd() < 0.5 ? '#e2dccf' : '#c8955a') : A === 'H7' ? '#e0d8c8' : (L.rf.t === 'flat' ? '#c4c7cc' : '#8b8f96');
      if (A === 'H5') trussHex = '#a8733f';   // madera laminada
      var c = {
        roof: col(roofHex), roofD: col(KS(roofHex, 0.84)), truss: col(trussHex), glass: col(glassHex), gableC: col(KS(P.wall, 0.95)),
        dark: col('#1d1e24'), body: col(KS(P.dado, 1.0)), lamp: col(night ? (p.light === 'sodium' ? '#ffd9a0' : '#f4f8ff') : '#fff1c8'),
        wood: col('#c58a4a'), woodL: col('#dba468'), woodD: col('#8a5a32'), mat: col(KS(P.seatA, 0.9)), matD: col(KS(P.seatA, 0.72)), white: col('#f4f1e8'),
        steel: col('#8a94a2'), gray: col('#9aa0a8'), board: col('#dfeef5'), orange: col('#e8642a'), exit: col('#36d67a'), slat: col('#80868e'),
        red: col('#d8342c'), door: col(KS(P.seatA, 0.85)), deck: col('#6b707a'), panel: col(L.type === 'concrete' ? '#a7a59f' : '#5a616d'), rubber: col('#3e434c'),
        nose: col('#ffc93c'), alu: col('#c9d3de'), aluD: col('#9aa6b4'), frame: col(KS(P.wall, 0.7)), curtain: col(KS(P.seatA, 0.9)), curtainD: col(KS(P.seatA, 0.7))
      };
      if (L.type === 'concrete') c.deck = col('#9c9a94');
      if (A === 'H6') c.roofD = col('#2b2f38');
      if (A === 'H4') { c.roofD = col('#8e8b84'); c.gableC = col('#a19e96'); }
      c.pot = col('#c2703f'); c.potD = col('#8f4f2c'); c.leaf = col('#3f8f4a'); c.leafD = col('#2c6b3a');
      // triángulos de la estática por partes (para tools/venuegen-cost.js y la tabla COST de la receta)
      var parts = ST.parts = {}, lastT = 0;
      function mark(n) { var t = S.i.length / 3; parts[n] = (parts[n] || 0) + t - lastT; lastT = t; }
      // ---- paredes (zócalo + acabado) ----
      var zW = L.rf.t === 'saw' ? EAVE + L.rf.rise + 0.3 : EAVE, CH = L.ch || 0;
      // (flavor jpkr: zócalo de madera clara)
      var wo = { z1: zW, dado: p.dado || 1.2, cDado: flav === 'jpkr' ? '#c9a274' : P.dado, cWall: P.wall, wall: p.wall };
      KIT.wall(H, S, 'y', YS, -1, -WX + CH, WX - CH, wo); KIT.wall(H, S, 'y', YN, 1, -WX + CH, WX - CH, wo);
      KIT.wall(H, S, 'x', WX, 1, YS + CH, YN - CH, wo); KIT.wall(H, S, 'x', -WX, -1, YS + CH, YN - CH, wo);
      if (CH) {   // H7 octógono: chaflanes en las cuatro esquinas
        KIT.chamferWall(H, S, WX - CH, YS, WX, YS + CH, wo); KIT.chamferWall(H, S, -WX + CH, YS, -WX, YS + CH, wo);
        KIT.chamferWall(H, S, WX - CH, YN, WX, YN - CH, wo); KIT.chamferWall(H, S, -WX + CH, YN, -WX, YN - CH, wo);
      }
      mark('walls');
      // ---- techo ----
      var ro = { WX: WX, YS: YS, YN: YN, eave: EAVE, n: L.rf.n, c: c, lite: lite, skylight: p.win === 'skylight' };
      var roofTop, roofZ, posts = [];
      if (L.rf.t === 'saw') { ro.rise = L.rf.rise; roofTop = KIT.roofSaw(H, S, E, ro); roofZ = function (x) { var TW = 2 * WX / L.rf.n, u = (x + WX) / TW; return EAVE + L.rf.rise * (u - Math.floor(u)); }; }
      else if (L.rf.t === 'gable') { ro.pitch = L.rf.pitch; roofTop = KIT.roofGable(H, S, E, ro); roofZ = function (x, y) { return EAVE + ((YN - YS) / 2 - Math.abs(y - (YN + YS) / 2)) * Math.tan(L.rf.pitch * PI / 180) - 0.1; }; }
      else if (L.rf.t === 'flat') { roofTop = KIT.roofFlat(H, S, E, ro); roofZ = function () { return EAVE; }; }
      else if (L.rf.t === 'folded') {
        ro.rise = L.rf.rise; roofTop = KIT.roofFolded(H, S, E, ro);
        roofZ = function (x) { var TW = 2 * WX / L.rf.n, u = (x + WX) / TW; u -= Math.floor(u); return EAVE + L.rf.rise * (1 - Math.abs(2 * u - 1)); };
      } else if (L.rf.t === 'glulam') {
        ro.rise = L.rf.rise; var gl = KIT.roofGlulam(H, S, E, ro); roofTop = gl.top; posts = gl.posts;
        var hsg = (YN - YS) / 2, Rg = (hsg * hsg + L.rf.rise * L.rf.rise) / (2 * L.rf.rise), zcg = EAVE + L.rf.rise - Rg;
        roofZ = function (x, y) { var d = y - (YN + YS) / 2; return zcg + Math.sqrt(Math.max(0, Rg * Rg - d * d)) - 0.2; };
      } else if (L.rf.t === 'louvre') { roofTop = KIT.roofLouvre(H, S, E, ro); roofZ = function () { return EAVE + 0.35; }; }
      else if (L.rf.t === 'octagon') { ro.ch = CH; roofTop = KIT.roofOctagon(H, S, E, ro); roofZ = function () { return EAVE + 1.3; }; }
      else if (L.rf.t === 'domelow') { ro.rise = L.rf.rise; roofTop = KIT.roofDomeLow(H, S, E, ro); roofZ = function () { return EAVE + 0.3; }; }
      else {
        ro.rise = L.rf.rise; roofTop = KIT.roofBarrel(H, S, E, ro);
        var hsb = (YN - YS) / 2, Rb = (hsb * hsb + L.rf.rise * L.rf.rise) / (2 * L.rf.rise), zcb = EAVE + L.rf.rise - Rb;
        roofZ = function (x, y) { var d = y - (YN + YS) / 2; return zcb + Math.sqrt(Math.max(0, Rb * Rb - d * d)) - 0.15; };
      }
      mark('roof');
      // ---- ventanales de los laterales ----
      var winKind = p.win === 'lattice' ? 'lattice' : p.win === 'brise' ? 'brise' : p.win === 'arches' ? 'arches' : 'band';
      L.win.forEach(function (w) {
        if (p.win === 'ring') {   // H7: anillo de óculos
          var dO = Math.min(1.6, w.z1 - w.z0), zO = (w.z0 + w.z1) / 2;
          for (var wx = -w.n * w.step / 2; wx <= w.n * w.step / 2 + 0.01; wx += w.step) KIT.oculus(H, S, E, wx, w.y, w.s, zO, dO, c.glass, c.white);
        } else KIT.windowRow(H, S, E, w.y, w.s, -w.n * w.step / 2, w.n * w.step / 2, w.step, w.step * 0.77, w.z0, w.z1, c.glass, c.white, winKind);
      });
      mark('win');
      /** Posición libre de pilares (H5: los arcos laminados arrancan del suelo junto a las paredes largas) para el atrezo de ancho w. */
      function freeX(x, w) {
        if (!posts.length) return x;
        for (var k = 0; k < 12; k++) {
          var d = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.6, xx = x + d, ok = true;
          for (var pi = 0; pi < posts.length; pi++) if (Math.abs(posts[pi] - xx) < w / 2 + 0.35) { ok = false; break; }
          if (ok) return xx;
        }
        return x;
      }
      // ---- gradas ----
      var seats = [], rowsTop = 0, mainBack = 0;
      var cA = col(P.seatA), cB = col(P.seatB), cG = col('#8d939b'), cAc = col(P.accent), darkC = {};
      function dark(cc) { var k2 = cc.getHexString(); return darkC[k2] || (darkC[k2] = col(KS('#' + k2, 0.78))); }
      var grads = [];
      for (var gi = 0; gi < L.rows; gi++) grads.push(col(KM(P.seatA, P.seatB, L.rows > 1 ? gi / (L.rows - 1) : 0)));
      function seatFn(main) {
        var mos = main && p.seats === 'mosaic' ? KIT.mosaic(sp.short, Math.floor(2 * L.BXH / 1.12)) : null, mosC = P.seatB === '#7d838c' ? col('#f4f1e8') : cB;
        return function (r, ci) {
          if (p.seats === 'alt') return r % 2 ? cB : cA;
          if (p.seats === 'grad') return grads[Math.min(r, grads.length - 1)];
          if (p.seats === 'greyacc') return r % 4 === 3 ? cAc : cG;
          if (mos) { var rr = L.rows - 1 - r - Math.max(0, Math.floor((L.rows - 7) / 2)); return mos(ci, rr) ? mosC : cA; }
          if (p.seats === 'mosaic') return r % 2 ? cB : cA;
          return cA;
        };
      }
      var sc = { deck: c.deck, panel: c.panel, rubber: c.rubber, dark: c.dark, steel: c.steel, nose: c.nose, alu: c.alu, aluD: c.aluD };
      if (flav === 'us') { sc.alu = col('#f2c230'); sc.aluD = col('#c99a1e'); }   // flavor us: bleachers plegables amarillos
      var aisles = L.BXH > 11 ? [-L.BXH / 2, 0, L.BXH / 2] : [0];
      function stand(side, u0, u1, v0, rows, main, ais) {
        var r = KIT.stand(H, S, { side: side, u0: u0, u1: u1, v0: v0, rows: rows, rd: L.RD, rz: L.RZ, type: L.type, seat: seatFn(main), dark: dark, aisles: ais, occ: p.crowd, rnd: rnd, c: sc, lite: lite });
        for (var i = 0; i < r.seats.length; i++) seats.push(r.seats[i]);
        return r;
      }
      if (L.S1) { var m = stand('-y', -L.BXH, L.BXH, V0, L.rows, true, aisles); rowsTop = m.top; mainBack = m.back; }
      if (L.S2) var mN = stand('+y', -L.BXH, L.BXH, V0, L.rowsN || L.rows, false, aisles);   // (H6: grada asimétrica)
      // H7: balconada de 1-2 pisos en el lateral +y
      if (L.balc) {
        var bco = { slab: col('#cfc8b8'), fascia: col(KS(P.accent, 0.8)), rail: c.steel, stripe: col(P.seatB === '#7d838c' ? '#f4f1e8' : P.seatB), seat: cA };
        L.balc.z.forEach(function (zb) {
          var bs = KIT.balcony(H, S, { yw: YN, s: 1, d: L.balc.d, z: zb, x0: -L.balc.x, x1: L.balc.x, c: bco, rnd: rnd, occ: Math.min(0.95, p.crowd * 1.1) });
          for (var i = 0; i < bs.length; i++) seats.push(bs[i]);
        });
      }
      if (L.SE) { stand('-x', -10.8, 10.8, VE, L.rowsE, false, [0]); stand('+x', -10.8, 10.8, VE, L.rowsE, false, [0]); }
      if (!L.S1) {   // sin grada: dos filas de bancos de madera contra la pared del lado del 1r árbitro
        for (var bnk = 0; bnk < 2; bnk++) {
          var by = YS + 0.9 + bnk * 0.9, bz = 0.45 + bnk * 0.42;
          if (bnk) bx(S, -12, 12, by - 0.45, by + 0.45, 0, bz - 0.42, c.deck);
          bx(S, -12, 12, by - 0.2, by + 0.2, bz - 0.05, bz, c.wood);
          for (var bl = -12; bl <= 12; bl += 3) bx(S, bl - 0.04, bl + 0.04, by - 0.15, by + 0.15, bnk ? bz - 0.42 : 0, bz - 0.05, c.steel);
          for (var bpx = -11.7; bpx < 11.7; bpx += 0.56) if (rnd() < p.crowd * 1.4) seats.push({ x: bpx, y: by + 0.05, z: bz, fx: 0, fy: 1, row: bnk });
        }
      }
      mark('stands');
      // tope de público (instancias): barajado siempre, así el tope por calidad (quality) aclara la grada por igual
      var cap = Math.max(20, Math.min(650, p.crowdMax || 650));
      for (var si = seats.length - 1; si > 0; si--) { var sj = Math.floor(rnd() * (si + 1)), tmp = seats[si]; seats[si] = seats[sj]; seats[sj] = tmp; }
      if (seats.length > cap) seats.length = cap;

      // ---- fondos: marcador y fondo rival (los dos fondos iguales: los equipos cambian de campo) ----
      var zSc = L.zSc, back = p.back, yb = Math.min(-YS, YN) - 2.2;
      if (L.SE && (back === 'wallbars' || back === 'stage')) back = 'pena';
      // ventanal del fondo (vista): por debajo de la seña si cabe; si no, por encima (hasta 1 m bajo el alero); si tampoco, sin ventanal
      var SIG = L.sig, winZ0 = Math.max(2.6, L.topE + 1.2), winTop = EAVE - 1.0;
      if (SIG) { var sb = (A === 'H2' ? SIG.zS - 0.6 : SIG.z0 - 0.25); if (sb - winZ0 >= 1.0) winTop = sb; else winZ0 = SIG.z1 + 0.25; }
      var winOk = winTop - winZ0 >= 1.2;
      /** Fondo rival de cada fondo: el de la receta; con el flavor jpkr, escenario con telón en el fondo −x (el que ve la cámara de juego; plan().stageE). */
      function backOf(e) { return L.stageE === 2 || (L.stageE === 1 && e < 0) ? 'stage' : back; }
      // (flavors trop y gulf: lateral abierto en los fondos, a la altura del zócalo; con gradas en los fondos, a sus lados)
      var band = flav === 'trop' || flav === 'gulf' ? (flav === 'trop'
        ? { kind: 'brise', fin: col('#ece6d8'), sill: col('#cfc7b6'), openLo: col(night ? '#1d3a2c' : '#5fa85a'), openHi: col(night ? '#1a2238' : p.light === 'sun' ? '#bfe3ef' : '#cdd9de') }
        : { kind: 'lattice', fin: col('#7a5230'), sill: col('#e9dfc8'), openLo: col(night ? '#5a4630' : '#f3d9a4'), openHi: col(night ? '#4a3a2a' : '#f9ead0') }) : null;
      for (var e = -1; e <= 1; e += 2) {
        var xf = e * WX, bk = backOf(e);
        KIT.scoreHousing(H, S, xf, e, zSc, L.scW, L.scH, c, col(p.score === 'flip' ? '#1f3d2e' : KS(P.seatA, 0.85)));
        if (bk === 'wallbars') {
          KIT.wallBars(H, S, xf, e, -Math.min(9.6, yb), Math.min(9.6, yb), c);
          KIT.matLean(H, S, xf, e, -Math.min(7.4, yb - 2), c); KIT.matLean(H, S, xf, e, Math.min(7.1, yb - 2), c);
          var bkz = Math.min(7.7, EAVE - 1.2);   // (la canasta plegada cede el sitio a la seña del arquetipo si chocan)
          if (!SIG || bkz - 1.4 > SIG.z1 || bkz + 1.0 < SIG.z0 - 0.2) KIT.basketFolded(H, S, xf, e, bkz, c);
        } else if (bk === 'stage') {
          KIT.stage(H, S, xf, e, 12, 5.6, c);
        } else if (bk === 'view' && winOk) {
          for (var vs = -1; vs <= 1; vs += 2) KIT.endWindow(H, S, E, xf, e, vs < 0 ? -Math.min(yb, 11) : 3.0, vs < 0 ? -3.0 : Math.min(yb, 11), winZ0, winTop, c.glass, c.white);
        }
        var doors = [];
        if (!L.SE && !CH) {   // salidas de emergencia y almacén en las esquinas de los fondos
          var yEx = e > 0 ? Math.min(11.4, YN - 1.6) : -Math.min(11.6, -YS - 1.6), yRo = Math.min(12.5, YN - 2.2);
          KIT.exitDoor(H, S, E, xf, e, yEx, c); doors.push([yEx - 1.15, yEx + 1.15]);
          if (e < 0 && bk !== 'view') { KIT.rollerDoor(H, S, xf, e, yRo, c); doors.push([yRo - 1.8, yRo + 1.8]); }
        }
        if (band) {   // flavor trop / gulf: lateral abierto a la altura del zócalo (lo que la cámara de juego ve del fondo)
          var segs = [[Math.max(YS + CH + 0.6, -14), Math.min(YN - CH - 0.6, 14)]];
          doors.forEach(function (d) { var out = []; segs.forEach(function (sg) { if (d[1] <= sg[0] || d[0] >= sg[1]) out.push(sg); else { if (d[0] > sg[0]) out.push([sg[0], d[0]]); if (d[1] < sg[1]) out.push([d[1], sg[1]]); } }); segs = out; });
          // (alto: hasta 2,1 m; con franja de mural / letras, hasta su pie; con peña, por debajo de las pancartas)
          var dd = p.dado || 1.2, bz1 = bk === 'mural' || bk === 'letters' ? Math.max(1.15, dd + 0.13) : bk === 'pena' ? 1.85 : Math.max(2.1, dd - 0.1);
          if (L.SE) {   // con gradas en los fondos: paños altos de suelo a la seña, a los lados de la grada (y de la seña)
            var yf = Math.max(11.1, SIG ? SIG.yw + 0.3 : 0); segs = [[segs[0][0], -yf], [yf, segs[0][1]]];
            bz1 = Math.min(EAVE - 0.6, SIG ? SIG.z1 : zSc + 1.5);
          }
          band.ed = p.wall === 'brick-red' || p.wall === 'brick-yellow' ? 0.095 : 0.012; band.finD = bk === 'wallbars' ? 0 : null; KIT.openBand(H, S, E, xf, e, segs, 0.3, bz1, band.kind, band);
        }
      }
      mark('back');
      if (SIG) {
        // (colores que se separan de la pared: relleno más oscuro o más claro que ella; cerchas que contrastan con los dos)
        var wl = lum(P.wall), sigFill = wl > 0.3 ? KS(P.wall, 0.74) : KM(P.wall, '#ffffff', 0.32);
        var trS = Math.abs(lum(trussHex) - lum(sigFill)) < 0.22 || Math.abs(lum(trussHex) - wl) < 0.18 ? (lum(sigFill) > 0.3 ? '#262d3a' : '#ece8df') : trussHex;
        var sawHex = wl < 0.15 ? '#9aa6b8' : KS('#6f7d93', 0.7), brickHex = p.wall === 'brick-red' ? KS(P.wall, 0.68) : '#9c4a36';
        var sc2 = { truss: col(trS), saw: col(sawHex), glass: c.glass, brick: col(brickHex), stone: col('#efe6d2'), fill: col(sigFill), frame: c.frame,
          lt: col(wl > 0.42 ? '#d8d5cd' : '#c3c0b8'), dk: col(wl > 0.42 ? '#7d7a73' : '#8f8c85'), wood: col('#c08a50'), woodD: col('#94622f'), steel: c.steel };
        if (A === 'H6') sc2.frame = col(lum(P.wall) > 0.35 ? '#2f343d' : '#d9dde2');
        if (A === 'H7') sc2.brick = col(KS(P.accent, 0.75));
        for (var e3 = -1; e3 <= 1; e3 += 2) KIT.endSig(H, S, E, e3 * WX, e3, { A: A, t: L.rf.t, pitch: L.rf.pitch, z0: SIG.z0, z1: SIG.z1, zS: SIG.zS, yw: SIG.yw, c: sc2, lite: lite });
      }
      mark('sig');
      // banquillos, cámara y atrezo del lateral de vestuarios (+y) cuando no hay grada
      KIT.benches(H, S, AT, c);
      // flavor east: mural de mosaico en el lateral +y (si el fondo rival no es ya mural / letras: entonces va en la franja del fondo)
      var signZ = L.S1 ? L.topS + 2.2 : 4.6, signN = !(signZ + 0.9 < EAVE - 0.4 && !L.win.some(function (w) { return w.s < 0; }));
      var mosaicWall = null;
      if (flav === 'east' && !signN && back !== 'mural' && back !== 'letters' && back !== 'pena' && back !== 'view' && !L.S2 && !L.balc && A !== 'H6') {
        var mz0 = 3.8, mTop = EAVE - 0.8; L.win.forEach(function (w) { if (w.s > 0) mTop = Math.min(mTop, w.z0 - 0.3); });
        var mh = Math.min(4, mTop - mz0), mw = Math.min(4.5 * mh, 2 * WX - 8 - 2 * CH);
        if (mh >= 1.8 && mw >= 8) mosaicWall = { z: mz0 + mw / 9, w: mw, h: mw / 4.5 };
      }
      var PX = { lk1: freeX(-10.5, 1.1), lk2: freeX(10.5, 1.1), vend: freeX(-15.6, 1.0), fount: freeX(-13.7, 0.5), troph: freeX(15.4, 1.6), cork: freeX(-7.3, 1.6),
        clock: freeX(0, 0.8), rad1: freeX(-4.2, 1.3), rad2: freeX(4.2, 1.3), poster: freeX(-1.8, 2.0), noShoe: freeX(-4.6, 0.6), ban: freeX(4.6, 3.6) };
      if (!L.S2) {
        [PX.lk1, PX.lk2].forEach(function (x) { KIT.lockerDoor(H, S, x, YN, 1, c); });
        if (WX > 18) KIT.vending(H, S, E, PX.vend, YN, 1, c);
        KIT.fountain(H, S, PX.fount, YN, 1, c); KIT.trophyCase(H, S, PX.troph, YN, 1, c); KIT.corkBoard(H, S, PX.cork, YN, 1);
        if (!L.balc && !mosaicWall) KIT.clock(H, S, PX.clock, YN, 1, Math.min(6.0, EAVE - 1.6), c);
        [-(WX - CH - 2), WX - CH - 2].forEach(function (x) { KIT.extinguisher(H, S, freeX(x, 0.3), YN, 1, c); });
        if (p.props === 'scarves') { KIT.radiator(H, S, PX.rad1, YN, 1, c); KIT.radiator(H, S, PX.rad2, YN, 1, c); }
      } else if (A !== 'H6') KIT.clock(H, S, 6.5, -WX, -1, SIG ? Math.min(SIG.z1 + 0.7, EAVE - 0.8) : Math.min(zSc, EAVE - 1.6), c, true);
      mark('props');
      // ---- flavors regionales (segunda seña del pabellón) ----
      var hungN = 0;
      if (flav === 'trop') {   // ventiladores de techo entre los focos y jardineras en las esquinas de la zona libre
        var nf = 0, zf = Math.min(L.lamps.z + 0.6, EAVE - 0.4);
        for (var fx2 = 1; fx2 < L.lamps.nx && nf < 8; fx2++) L.lamps.lys.forEach(function (ly) { if (nf >= 8) return; var x = -WX + 2 * WX * fx2 / L.lamps.nx; KIT.fan(H, S, x, ly, zf, roofZ(x, ly), (fx2 + nf) * 0.4, c); nf++; });
        var po = 1.1 + CH / 2, ym = Math.min(-YS, YN) - po, k3 = 0;
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (q) { if (q[1] < 0 && L.S1 && !L.SE && WX - po < L.BXH + 0.6) return; KIT.planter(H, S, q[0] * (WX - po), q[1] * ym, c, k3++); });
      }
      if (flav === 'us') hungN = 5;   // estandartes colgados (rótulos, abajo) con su barra
      for (var hb = 0; hb < hungN; hb++) for (var hs2 = -1; hs2 <= 1; hs2 += 2) {
        var hx = (hb - (hungN - 1) / 2) * Math.min(5.5, (2 * WX - 6) / hungN), hy = hs2 < 0 ? YS + 0.7 : YN - 0.7;
        bx(S, hx - 0.85, hx + 0.85, hy - 0.04, hy + 0.04, EAVE - 0.95, EAVE - 0.88, c.steel); H.rod(S, hx, hy, EAVE - 0.9, hx, hy, roofZ(hx, hy), 0.012, c.dark);
      }
      mark('flavor');
      // ---- luces: campanas (día y sodio) o paneles LED (noche LED) en rejilla bajo el techo ----
      var lampPts = [], nx = L.lamps.nx, lys = L.lamps.lys, zl = L.lamps.z;
      for (var ix = 0; ix < nx; ix++) {
        var lx = -WX + 2 * WX * (ix + 0.5) / nx;
        lys.forEach(function (ly) {
          if (p.light === 'led' || p.light === 'show') KIT.ledPanel(H, S, E, lx, ly, zl, roofZ(lx, ly), c); else KIT.highBay(H, S, E, lx, ly, zl, roofZ(lx, ly), c);
          lampPts.push(lx, ly, zl - 0.2);
        });
      }

      mark('lights');
      // ---- mallas ----
      var stat = new THREE.Mesh(S.build(), K.toonMat({ vertexColors: true }));
      stat.name = 'genStatic'; stat.receiveShadow = true; stat.castShadow = false; G.add(stat); K.ink(stat); ST.statTris = stat.geometry.index.count / 3;
      var em = new THREE.Mesh(E.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
      em.name = 'genEmissive'; G.add(em);
      // suelo exterior (sustituye a outerFloor): lienzo de tamaño fijo, cemento y la zona libre del color de la receta
      var ocv = K.canvas(512, 256), og = ocv.getContext('2d'), sx = 512 / (2 * WX), sy = 256 / (YN - YS);
      function OX(x) { return (x + WX) * sx; } function OY(y) { return (YN - y) * sy; }
      og.fillStyle = KM('#8f9196', P.wall, 0.15); og.fillRect(0, 0, 512, 256);
      var fy0 = L.S1 ? -V0 + 0.1 : YS + 0.7, fy1 = L.S2 ? V0 - 0.1 : YN - 0.7, fx = L.SE ? VE - 0.2 : WX - 0.7;
      og.fillStyle = shade(P.free, 0.86); og.fillRect(OX(-fx), OY(fy1), 2 * fx * sx, (fy1 - fy0) * sy);
      og.fillStyle = KIT.grain(og, rnd, 0.06); og.fillRect(0, 0, 512, 256);
      if (p.floorMat === 'multi') KIT.sportLines(og, OX, OY, (sx + sy) / 2, 1, 'rgba(58,111,216,' + (p.multiA || 0.4) + ')', 'rgba(242,194,48,' + (p.multiA || 0.4) + ')');
      var otex = K.texOf(ocv), fm = ST.floorMat = K.toonMat({ map: otex });
      var of = new THREE.Mesh(new THREE.PlaneGeometry(2 * WX, YN - YS), fm);
      of.rotation.x = -PI / 2; VB.toThree(0, (YN + YS) / 2, -0.005, of.position); of.receiveShadow = true; of.name = 'genFloor'; G.add(of);
      // público
      var shirts = [], ks = Math.round((p.kitShare || 0.5) * 20);
      // (camisetas de la afición: los colores de la grada, que la receta ya separa de la equipación; nunca la camiseta saturada)
      for (var sh = 0; sh < 20; sh++) shirts.push(sh < ks ? (sh % 3 === 0 ? P.seatB === '#7d838c' ? '#f4f2ec' : P.seatB : sh % 3 === 1 ? P.seatA : KM(P.seatA, '#f4f1e8', 0.25)) : STREET[sh % STREET.length]);
      if (seats.length) ST.crowd = K.crowd(seats, { shirts: shirts, pants: PANTS, hatP: p.props === 'scarves' ? 0.25 : 0.05, name: 'genCrowd', fan: function () { return 0.5; },
        sphere: new THREE.Sphere(new THREE.Vector3(0, 3, 0), Math.hypot(WX, Math.max(-YS, YN)) + 2) });
      // calidad baja: la misma gente en impostores (el programa de los de Palau, ~2 triángulos por persona) en vez de aclarar la grada
      if (ST.crowd && K.crowdImp) ST.imp = K.crowdImp(ST.crowd);
      // marcadores (los dos fondos, mismo lienzo): 1 dibujo
      var hi = !K.ctx.isMobile; ST.cv = K.canvas(hi ? 512 : 384, hi ? 256 : 192); drawScore(K, K.SB); ST.tex = K.texOf(ST.cv);
      var LS = KIT.quads();
      KIT.quad(LS, WX - 0.235, 0, zSc, L.scW, L.scH, '-x', [0, 0, 1, 1]); KIT.quad(LS, -WX + 0.235, 0, zSc, L.scW, L.scH, '+x', [0, 0, 1, 1]);
      var smm = new THREE.Mesh(KIT.geoOf(THREE, LS), new THREE.MeshBasicMaterial({ map: ST.tex, toneMapped: false }));
      smm.material.color.setScalar(0.886); smm.name = 'genScore'; G.add(smm); ST.score = smm;
      // rótulos (atlas toon con textura)
      ST.pcv = K.canvas(hi ? 1024 : 512, hi ? 512 : 256); drawPrints(ST.pcv, K.FONT, rnd); ST.ptex = K.texOf(ST.pcv);
      var U = KIT.uvOf, AT2 = KIT.ATL, LP = KIT.quads(), bans = (sp.txt && sp.txt.banners) || [sp.pad], nb = Math.min(8, Math.max(2, bans.length));
      // letrero: en la pared de la grada principal (encima) o en la de vestuarios
      if (!signN) KIT.quad(LP, 0, YS + 0.03, signZ, 15, 1.4, '+y', U(AT2.sign));
      else if (L.balc) { var sz = Math.min(EAVE - 1.0, L.balc.top + 1.2); if (sz + 0.56 < EAVE - 0.2) KIT.quad(LP, 0, YN - 0.03, sz, 12, 1.12, '-y', U(AT2.sign)); }
      else KIT.quad(LP, 0, YN - 0.03, Math.min(EAVE - 1.2, L.S2 ? L.topN + 2.2 : 3.9), 12, 1.12, '-y', U(AT2.sign));
      // pancartas: en la barandilla de la grada principal y, si hay, en la de enfrente o en la pared de vestuarios
      var bi = 0;
      if (L.S1) [-7.2, 7.2].forEach(function (x) { KIT.quad(LP, x, -mainBack + 0.11, rowsTop + 1.45, 3.6, 0.9, '+y', U(AT2.ban[bi++ % 8])); });
      if (L.S2) [-7.2, 7.2].forEach(function (x) { KIT.quad(LP, x, mN.back - 0.11, mN.top + 1.45, 3.6, 0.9, '-y', U(AT2.ban[bi++ % 8])); });
      else if (L.balc) [-8, 0, 8].forEach(function (x) { if (Math.abs(x) + 1.8 < L.balc.x) KIT.quad(LP, x, YN - L.balc.d - 0.11, L.balc.z[0] + 0.5, 3.6, 0.8, '-y', U(AT2.ban[bi++ % 8])); });
      else KIT.quad(LP, PX.ban, YN - 0.03, 3.1, 3.6, 0.9, '-y', U(AT2.ban[bi++ % 8]));
      // fondos: franja (mural / letras), peña (pancartas), vista de los ventanales, escudo y franja del marcador
      for (var e2 = -1; e2 <= 1; e2 += 2) {
        var xq = e2 * (WX - 0.03), nrm = e2 > 0 ? '-x' : '+x', bw = Math.min(2 * yb, 24), bk2 = backOf(e2);
        if (flav === 'east' && bk2 === 'pena') bk2 = 'mural';   // flavor east: mural de mosaico en vez de las pancartas de peña
        if (flav === 'gulf' && bk2 === 'pena' && !L.SE) {        // flavor gulf: cenefa bajo el marcador, encima de las pancartas
          var nF = Math.floor(Math.min(2 * yb, 24) / 6);
          for (var fq = 0; fq < nF; fq++) KIT.quad(LP, e2 * (WX - 0.035), (fq - (nF - 1) / 2) * 6, zSc - L.scH / 2 - 0.4, 6, 0.5, nrm, U(AT2.frieze));
        }
        if (A === 'H6' && SIG) {   // muro cortina: la ciudad entre el vidrio y la carpintería (con gradas en los fondos, la franja va a peña)
          KIT.quad(LP, e2 * (WX - 0.08), 0, (SIG.z0 + SIG.z1) / 2, 2 * SIG.yw, SIG.z1 - SIG.z0, nrm, U(AT2.view));
          if (L.SE && (bk2 === 'mural' || bk2 === 'letters')) bk2 = 'pena';
        }
        if (bk2 === 'mural' || bk2 === 'letters') {   // franja 8:1 entre el zócalo y el marcador (o encima del marcador con gradas en los fondos, bajo la seña)
          // (con gradas en los fondos, pegada al marcador y de 1,8 m como mucho: más arriba la cámara de juego la cortaba por arriba)
          var z0b = L.SE ? zSc + L.scH / 2 + 0.7 : (p.dado || 1.2) + (back === 'pena' ? 0.08 : 0.3), z1b = L.SE ? Math.min(EAVE - 0.5, z0b + 1.8) : zSc - L.scH / 2 - 0.3, hb = Math.min(3, z1b - z0b);
          bw = Math.min(bw, 8 * hb);
          // (delante del relieve de la pared: pilastras de ladrillo a 0,09 m y nervios de chapa a 0,05 m tapaban las letras)
          if (bw >= 6) KIT.quad(LP, e2 * (WX - 0.12), 0, (z0b + z1b) / 2, bw, bw / 8, nrm, U(AT2.back));
        } else if (bk2 === 'pena') {
          for (var pb = 0; pb < Math.min(4, nb); pb++) KIT.quad(LP, xq, (pb - (Math.min(4, nb) - 1) / 2) * 4.3, L.SE ? L.topE + (SIG ? 1.05 : 2.1) : 2.4, 3.8, 0.95, nrm, U(AT2.ban[(bi + pb) % 8]));
        } else if (bk2 === 'view' && winOk) {
          for (var vs2 = -1; vs2 <= 1; vs2 += 2) { var ya = vs2 < 0 ? -Math.min(yb, 11) : 3.0, yb2 = vs2 < 0 ? -3.0 : Math.min(yb, 11); KIT.quad(LP, e2 * (WX - 0.15), (ya + yb2) / 2, (winZ0 + winTop) / 2, yb2 - ya, winTop - winZ0, nrm, U(AT2.view)); }
        }
        KIT.quad(LP, e2 * (WX - 0.225), 0, zSc + L.scH / 2 + 0.35, L.scW + 0.3, 0.26, nrm, U(AT2.strip));
        if (bk2 !== 'view' && !SIG) KIT.quad(LP, xq, -(L.scW / 2 + 1.6), zSc, 1.6, 1.6, nrm, U(AT2.crest));   // (con la seña, el escudo queda en el letrero y la vitrina)
      }
      if (!L.S2) {
        KIT.quad(LP, PX.lk1, YN - 0.03, 2.62, 0.5, 0.25, '-y', U(AT2.plate1)); KIT.quad(LP, PX.lk2, YN - 0.03, 2.62, 0.5, 0.25, '-y', U(AT2.plate2));
        KIT.quad(LP, PX.noShoe, YN - 0.03, 1.9, 0.5, 0.5 / 4 * 2, '-y', U(AT2.noShoe)); KIT.quad(LP, PX.poster, YN - 0.03, 2.0, 2.0, 0.25, '-y', U(AT2.poster));
      }
      // flavors: mural de mosaico (east), cenefa (gulf) y estandartes colgados (us)
      if (mosaicWall) KIT.quad(LP, 0, YN - 0.03, mosaicWall.z, mosaicWall.w, mosaicWall.h, '-y', U(AT2.view));
      if (flav === 'gulf' && !L.S2 && !L.balc) {
        var fz = signN ? 2.95 : (p.dado || 1.2) + 2.65;
        for (var fxx = -WX + CH + 1; fxx + 6 <= WX - CH - 1 + 0.01; fxx += 6) KIT.quad(LP, fxx + 3, YN - 0.035, fz, 6, 0.5, '-y', U(AT2.frieze));
      }
      for (var hb2 = 0; hb2 < hungN; hb2++) for (var hs3 = -1; hs3 <= 1; hs3 += 2) {
        var hx2 = (hb2 - (hungN - 1) / 2) * Math.min(5.5, (2 * WX - 6) / hungN);
        KIT.quad(LP, hx2, hs3 < 0 ? YS + 0.75 : YN - 0.75, EAVE - 0.95 - 1.4, 1.4, 2.8, hs3 < 0 ? '+y' : '-y', U(AT2.pen[(hb2 + (hs3 > 0 ? 2 : 0)) % 5]));
      }
      // banderines de campeón colgados en lo alto del lateral de vestuarios (o de la pared de enfrente)
      var penOk = !hungN && !(L.balc && EAVE - 2.5 < L.balc.top + 0.2);
      for (var pn = 0; penOk && pn < (p.pennants | 0); pn++) KIT.quad(LP, (pn - ((p.pennants | 0) - 1) / 2) * 1.8, YN - 0.05, EAVE - 1.6, 0.9, 1.8, '-y', U(AT2.pen[pn % 5]));
      var pm = new THREE.Mesh(KIT.geoOf(THREE, LP), K.toonMat({ map: ST.ptex })); pm.name = 'genPrints'; pm.receiveShadow = true; G.add(pm);
      // haces de sol (de día con sol; media y alta) en el sentido de la luz principal
      if (p.light === 'sun') {
        var kd = LOOK.keyDir, kl = Math.hypot(kd[0], kd[1], kd[2]), dx = kd[0] / kl, dy = kd[1] / kl, dz = kd[2] / kl, beams = [];
        [-WX / 3, 0, WX / 3].forEach(function (bx2) {
          [-5, 5].forEach(function (by2) {
            var z = EAVE + 0.5, t = z / dz, ex = bx2 - dx * t, ey = by2 - dy * t;
            var k2 = Math.min(1, Math.max(0, (WX - 1) / Math.max(1e-3, Math.abs(ex))), Math.max(0, (Math.max(-YS, YN) - 1) / Math.max(1e-3, Math.abs(ey))));
            beams.push({ a: [bx2, by2, z], b: [bx2 + (ex - bx2) * k2, by2 + (ey - by2) * k2, z * (1 - k2)], r0: 1.0, r1: 2.0 });
          });
        });
        var cm = ST.cones = K.coneMesh(beams, '#fff1c8', BEAM_K); cm.name = 'genBeams'; G.add(cm);
      }
      // halos de los focos (de noche)
      if (night) {
        var hs = []; for (var hh = 0; hh < lampPts.length / 3; hh++) hs.push(p.light === 'sodium' ? 0.85 : 0.7);
        var hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(lampPts.map(function (v, i) { return v; }), 3)); hg.setAttribute('aS', new THREE.Float32BufferAttribute(hs, 1));
        // (las posiciones están en coords de sim: se pasan a three)
        var pa = hg.attributes.position, tv = new THREE.Vector3();
        for (var pi2 = 0; pi2 < pa.count; pi2++) { VB.toThree(pa.getX(pi2), pa.getY(pi2), pa.getZ(pi2), tv); pa.setXYZ(pi2, tv.x, tv.y, tv.z); }
        var hm = K.haloMaterial(K.radialTex(p.light === 'sodium' ? [[0, 'rgba(255,226,170,0.8)'], [0.2, 'rgba(255,200,130,0.26)'], [1, 'rgba(255,190,120,0)']] : [[0, 'rgba(240,246,255,0.8)'], [0.2, 'rgba(210,225,255,0.26)'], [1, 'rgba(200,215,255,0)']]));
        var halos = ST.halos = new THREE.Points(hg, hm); halos.name = 'genHalos'; halos.frustumCulled = false; G.add(halos);
      }
      try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (ST.pcv && ST.ptex) { drawPrints(ST.pcv, K.FONT, K.rnd); ST.ptex.needsUpdate = true; } if (ST.cv) drawScore(K, K.SB); }); } catch (e3) { }
    }
    function quality(q, Lq) {
      var on = !!(q && q.rank >= 1);
      if (ST.cones) ST.cones.visible = on;
      if (ST.halos) ST.halos.visible = on;
      if (ST.floorMat && Lq) ST.floorMat.color.setScalar(Lq.floor * LOOK.floorK);
      // escena ≤ Palau en triángulos: tope de público por nivel (lo que queda tras la base de la escena y la estática; medido con
      // tools/venuegen-cost.js: Palau baja 105 k / media 316 k, base sin público ~66 k / ~217 k). En alta no hace falta.
      // En baja, el público va entero en impostores (como Palau en baja): la malla 3D se oculta y no hace falta aclararla.
      var cm = ST.crowd, low = !!(q && q.rank === 0 && ST.imp);
      if (cm) cm.visible = !low;
      if (ST.imp) { ST.imp.visible = low; ST.imp.userData.impU.uDens.value = Math.max(0.6, q && q.crowdDensity != null ? q.crowdDensity : 1); }
      if (cm && q && q.rank < 2 && !low) {
        var per = cm.userData.lods.lo.index.count / 3, room = (q.rank === 0 ? CROWD_ROOM[0] : CROWD_ROOM[1]) - (ST.statTris || 0);
        cm.count = Math.max(1, Math.min(cm.count, Math.floor(Math.max(30 * per, room) / per)));
      }
    }
    function step(t, rdt, g, K) {
      var M = K.mood();
      if (ST.score) { var v = 0.886 * (1 + 0.22 * M.pf * K.soft()); if (Math.abs(ST.score.material.color.r - v) > 1e-3) ST.score.material.color.setScalar(v); }
      if (ST.cones && ST.cones.visible) ST.cones.material.uniforms.k.value = BEAM_K * (1 - 0.25 * M.tense) * (1 + 0.4 * M.win);
      if (ST.halos && ST.halos.visible) ST.halos.material.uniforms.opacity.value = 1 + 0.4 * M.pf * K.soft();
    }
    function dispose() { ST.cv = ST.tex = ST.pcv = ST.ptex = ST.floorMat = ST.cones = ST.score = ST.halos = ST.crowd = ST.imp = null; ledGrid = null; }

    return {
      kind: 'hall', seed: (sp.seed >>> 0) || 1,
      hide: ['outerFloor', 'ledBoards', 'ledRefl', 'crowd0', 'crowd1', 'crowd2', 'crowd3', 'crowdImp', 'flags', 'endScreen', 'hungScreens', 'hallShell',
        'halos', 'lightCones', 'banners', 'hallName', 'camFlashes', 'static', 'emissive'],
      look: LOOK, floor: floorPainter(sp), floorLine: P.line || '#ffffff', floorAdjust: floorAdjustFor(P.court),
      score: { x: WX - 0.235, y: 0, z: L.zSc, w: L.scW, h: L.scH }, drawScore: drawScore,
      build: build, quality: quality, step: step, dispose: dispose, plan: L, built: L.A, parts: function () { return ST.parts; }
    };
  }

  // ---------- piel de Palau (H8/H9) ----------
  function skinDef(sp) {
    var THREE = window.THREE, P = sp.pal, p = sp.p, dark = sp.arch === 'H8' ? 0.76 : 0.9;
    var hue = hsl(rgbOf(P.accent))[0] / 360, cA = new THREE.Color(P.seatA), cB = new THREE.Color(P.seatB), cD = new THREE.Color(shade(P.seatA, 0.55));
    var tmp = { h: 0, s: 0, l: 0 };
    var bans = (sp.txt && sp.txt.banners) || [sp.pad];
    return {
      skin: 'palau', hide: [], seed: (sp.seed >>> 0) || 1, look: null,
      build: null, quality: function () { }, step: function () { }, dispose: function () { },
      floor: floorPainter(sp, true), floorLine: P.line || '#ffffff', floorAdjust: floorAdjustFor(P.court),
      /** Estática: los violetas de Palau (paredes, peldaños, antepechos, cerchas) pasan al tono del club, con su luz. */
      recolor: function (c) {
        c.getHSL(tmp);
        if (tmp.h < 0.6 || tmp.h > 0.75 || tmp.s < 0.15 || tmp.l > 0.6) return false;
        c.setHSL(hue, Math.min(tmp.s, 0.42), tmp.l * dark); return true;   // (H8: arena oscura)
      },
      // (los asientos de Palau son tiras largas por bloque y fila: el mosaico de siglas de verdad llega con las gradas propias de F2)
      seatPaint: function (x) { return !x ? null : p.seats === 'alt' ? (x.b % 2 ? cA : cB) : p.seats === 'grad' ? (x.r > 9 ? cB : cA) : p.seats === 'mosaic' ? (x.r % 3 ? cA : x.b % 2 ? cB : cD) : cA; },
      // (H9: vallas de gala, oro sobre negro con la estrella de 8 puntas: la seña de H9 que SÍ sale en las cámaras de juego; la cúpula
      //  bajo el techo de Palau, a 16-21 m, no salía en ninguna y costaba 1 dibujo y ~2,8 k triángulos: retirada)
      ledText: sp.arch === 'H9' ? [{ name: sp.pad, fg: '#ffd23c', bg: ['#0e1016', '#1d1f2a'], deco: 'star8' }, { name: String(sp.short || '').toUpperCase(), fg: '#0e1016', bg: ['#e8b93a', '#ffd76a'], deco: 'star8' },
        { name: (sp.txt && sp.txt.chant) || sp.pad, fg: '#ffffff', bg: ['#0e1016', shade(P.seatA, 0.45)], deco: 'star8' }]
        : [{ name: sp.pad, fg: '#ffffff', bg: [shade(P.seatA, 0.6), P.seatA], deco: 'star8' }, { name: String(sp.short || '').toUpperCase(), fg: P.seatB === '#7d838c' ? '#ffffff' : P.seatB, bg: ['#141824', shade(P.seatA, 0.5)], deco: 'cut' },
        { name: (sp.txt && sp.txt.chant) || sp.pad, fg: '#ffffff', bg: [shade(P.accent, 0.6), P.accent], deco: 'cut' }],
      bannerPaint: function (g, x0, i, B) {
        var c1 = i % 2 ? P.seatB : P.seatA, c2 = shade(c1, 0.55), txt = bans[i % bans.length], FONT = 'system-ui, sans-serif';
        var gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
        g.translate(x0, 0); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(16, 16, 224, 4); g.fillRect(16, 492, 224, 4);
        g.fillStyle = P.accent; g.beginPath(); g.arc(128, 128, 40, 0, 2 * PI); g.fill();
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        try { FONT = getComputedStyle(document.body).fontFamily || FONT; } catch (e) { }
        fit(g, txt, '900', 54, 228, FONT); g.save(); g.translate(128, 320); g.rotate(-PI / 2); g.fillText(txt, 0, 0); g.restore();
      }
    };
  }

  /** Receta → def de VB.Arena. */
  VB.VenueGen.hallDef = function (sp) {
    if (!sp || sp.kind !== 'hall') return null;
    var d = sp.p && sp.p.skin === 'palau' ? skinDef(sp) : hallBuilt(sp);
    d.id = sp.id; d.kind = 'hall'; d.gen = true; d.spec = sp;
    return d;
  };
  VB.VenueGen._hallUtil = { dE: dE, rot: rot, floorAdjustFor: floorAdjustFor, plan: plan, archOf: archOf, lookOf: lookOf };
})();
