/* MAKE THE CUT — js/venue-genkit.js (owner: arena)
 * KIT de piezas de las sedes GENERADAS (plan «sedes-gen», fases F2-F3): VB.VenueGen.kit.
 *
 * Regla de coste: las piezas NO crean mallas. Escriben en los Builder de la sede (S = estática fusionada toon con colores por
 * vértice, E = emisiva MeshBasic) o pintan en lienzos (tarima, suelo exterior, marcador, atlas de rótulos). El constructor
 * (js/venue-gen-hall.js) crea las 6 mallas de siempre (suelo exterior, estática, emisiva, rótulos, marcador, público) + tinta,
 * haces y halos en media/alta.
 *
 * Muchas piezas están COPIADAS de «Poliesportiu Can Rebot» (js/venue-canrebot.js, que NO se toca hasta F7) y parametrizadas:
 * líneas de los otros deportes, grano de goma, marcador de segmentos, espalderas, colchonetas, canasta plegada, salidas de
 * emergencia, persianas del almacén, grada telescópica, banquillos, lateral de vestuarios (puertas, máquina de bebidas, fuente,
 * vitrina, corcho, reloj, extintores), campanas industriales, ventanales altos y techo en dientes de sierra.
 * Nuevas: techos a dos aguas con cerchas, plano con cerchas vistas y bóveda de cañón; muro con hiladas por bandas de color;
 * focos LED y de sodio; marcadores de tablillas y LED; escenario; atlas de rótulos con escudo inventado; vistas de ventana;
 * seña del arquetipo en los fondos (endSig) y triángulos planos (tri).
 * F3: techos de lámina plegada (roofFolded), arcos laminados (roofGlulam), lamas (roofLouvre), octógono con linterna (roofOctagon) y
 * cúpula rebajada de gajos (roofDomeLow); chaflanes (chamferWall), balconada (balcony), óculos (oculus), ventiladores (fan) y
 * jardineras (planter); lienzos de la cenefa (friezePaint) y del mural de mosaico (mosaicPaint); seña de H4-H7 (endSigF3).
 * F4: KIT.beach (al final del fichero), el telón de las playas generadas (beachSky) y sus props (ver allí).
 *
 * Coordenadas de la SIMULACIÓN (x a lo largo de la pista, y a lo ancho, z arriba). H = kit.ctx(K): ayudantes sobre el kit K de
 * VB.Arena (bx, rod, pt, col…). Las firmas son f(H, B, o) con o = parámetros (medidas, colores, rnd).
 * Se carga después de arena.js y de las sedes a mano, antes de venue-gen-hall.js.
 */
(function () {
  'use strict';
  var VB = window.VB; if (!VB || !VB.VenueGen) return;
  var PI = Math.PI;
  var KIT = VB.VenueGen.kit = {};

  /* ======================================================================== ayudantes */
  KIT.ctx = function (K) {
    var THREE = K.THREE, cache = {};
    function col(h) { var k = typeof h === 'string' ? h : '#' + h.getHexString(); return cache[k] || (cache[k] = K.col(k)); }
    return {
      K: K, THREE: THREE, BG: K.BGEO, BOX: K.UNIT_BOX, rnd: K.rnd, col: col,
      /** Caja alineada con los ejes entre (x0, y0, z0) y (x1, y1, z1). */
      bx: function (B, x0, x1, y0, y1, z0, z1, cc) { B.sbox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, cc); },
      /** Barra de radio r entre dos puntos (sim). */
      rod: function (B, ax, ay, az, bx2, by, bz, r, cc, g) { K.objM(0, 0, 0, 1); K.lrod(B, ax, az, -ay, bx2, bz, -by, r, cc, g); },
      /** Pieza g en (x, y, z) sim con giros de three y escala. */
      pt: function (B, g, x, y, z, cc, rx, ry, rz, w, h, d) { K.objM(0, 0, 0, 1); K.part(B, g, x, z, -y, cc, rx, ry, rz, w, h, d); }
    };
  };

  /* ======================================================================== color */
  function rgbOf(h) {
    var s = String(h || '#808080').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function hexOf(c) { var s = '#'; for (var i = 0; i < 3; i++) { var v = Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16); s += v.length < 2 ? '0' + v : v; } return s; }
  function shade(hex, k) { var c = rgbOf(hex); return hexOf([c[0] * k, c[1] * k, c[2] * k]); }
  function mix(a, b, t) { var A = rgbOf(a), B = rgbOf(b); return hexOf([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function lum(hex) { var c = rgbOf(hex); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  KIT.shade = shade; KIT.mix = mix; KIT.lum = lum; KIT.rgbOf = rgbOf; KIT.hexOf = hexOf;

  /* ======================================================================== lienzos: texto */
  /** (copiada de Can Rebot) Ajusta la talla para que el texto quepa en maxW. */
  function fitFont(g, text, weight, size, maxW, FONT) {
    g.font = weight + ' ' + Math.round(size) + 'px ' + FONT; var w = g.measureText(text).width;
    if (w > maxW) { size = size * maxW / w; g.font = weight + ' ' + Math.round(size) + 'px ' + FONT; }
    return size;
  }
  KIT.fitFont = fitFont;

  /* ======================================================================== suelos (painters) */
  /** (copiada de Can Rebot) Líneas de balonmano / fútbol sala (40 × 20) y baloncesto (28 × 15). cH, cB: colores rgba. */
  KIT.sportLines = function (g, X, Y, ppm, lwMin, cH, cB) {
    var lw = Math.max(lwMin, 0.05 * ppm);
    function poly(pts) { g.beginPath(); for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); } g.stroke(); }
    function rectL(x0, y0, x1, y1) { poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]); }
    g.save(); g.lineWidth = lw; g.lineJoin = 'round';
    if (cH) {
      g.strokeStyle = cH;
      rectL(-20, -10, 20, 10); poly([[0, -10], [0, 10]]);
      for (var e = -1; e <= 1; e += 2) {
        [6, 9].forEach(function (r) {
          var pts = [];
          for (var a = 0; a <= 40; a++) {
            var t = a / 40, ang = t * PI, yy, xx;
            if (t < 0.5) { yy = 1.5 + r * Math.cos(ang); xx = 20 - r * Math.sin(ang); }
            else { yy = -1.5 + r * Math.cos(ang); xx = 20 - r * Math.sin(ang); }
            if (Math.abs(yy) > 10) continue;
            if (a === 20) pts.push([e * (20 - r), 1.5]);
            pts.push([e * xx, yy]);
          }
          if (r === 9) g.setLineDash([0.15 * ppm, 0.15 * ppm]);
          poly(pts); g.setLineDash([]);
        });
        poly([[e * 13, -0.5], [e * 13, 0.5]]);
      }
    }
    if (cB) {
      g.strokeStyle = cB;
      rectL(-14, -7.5, 14, 7.5);
      g.beginPath(); g.arc(X(0), Y(0), 1.8 * ppm, 0, 2 * PI); g.stroke();
      for (var b = -1; b <= 1; b += 2) {
        rectL(b * 14, -2.45, b * 8.2, 2.45);
        g.beginPath(); g.arc(X(b * 8.2), Y(0), 1.8 * ppm, 0, 2 * PI); g.stroke();
        var tp = [[b * 14, -6.6]];
        for (var k = 0; k <= 32; k++) { var yy2 = -6.6 + 13.2 * k / 32; tp.push([b * (12.425 - Math.sqrt(6.75 * 6.75 - yy2 * yy2)), yy2]); }
        tp.push([b * 14, 6.6]); poly(tp);
      }
    }
    g.restore();
  };
  /** (copiada de Can Rebot) Grano de goma: patrón de motas (mosaico de 96 px). */
  KIT.grain = function (g, rnd, a) {
    var pc = document.createElement('canvas'); pc.width = pc.height = 96; var pg = pc.getContext('2d');
    for (var i = 0; i < 700; i++) { pg.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; pg.fillRect(rnd() * 96, rnd() * 96, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
    return g.createPattern(pc, 'repeat');
  };
  /** Tablas de madera (parquet): bandas de 15 cm con tablas de largo variable y 3 tonos de bloque. */
  /*  k (0..1, por defecto 1): fuerza de las vetas; la pista pintada con el color del club la baja (a la distancia de juego las
   *  tablas claras y oscuras de 15 cm parpadeaban como un fallo de textura). */
  KIT.planks = function (g, X, Y, x0, y0, x1, y1, ppm, rnd, dark, k) {
    k = k == null ? 1 : k;
    function a(v) { return (v * k).toFixed(3); }
    var pw = 0.15 * ppm, T = dark ? ['rgba(255,220,170,' + a(0.07) + ')', 'rgba(0,0,0,0)', 'rgba(30,10,0,' + a(0.12) + ')'] : ['rgba(255,240,205,' + a(0.08) + ')', 'rgba(0,0,0,0)', 'rgba(90,40,0,' + a(0.06) + ')'], seam = 'rgba(60,30,10,' + a(0.16) + ')';
    for (var py = Y(y1); py < Y(y0); py += pw) {
      var x = X(x0) - rnd() * 2.4 * ppm;
      while (x < X(x1)) { var len = (2.2 + rnd() * 2.2) * ppm; g.fillStyle = T[Math.floor(rnd() * 3)]; g.fillRect(x, py, len, pw); g.fillStyle = seam; g.fillRect(x, py, Math.max(1, ppm * 0.014), pw); x += len; }
    }
  };

  /* ======================================================================== marcadores (lienzo 2:1, los dos fondos) */
  var SEG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  /** (copiada de Can Rebot) Dígito de 7 segmentos en cursiva. */
  function seg7(g, x, y, w, h, d, on, off) {
    var t = w * 0.2, hs = (h - t) / 2, gp = Math.max(1, w * 0.025), lit = d >= 0 ? SEG[d] : '';
    function hor(x0, y0, L) { return [[x0 + gp, y0 + t / 2], [x0 + t / 2 + gp, y0], [x0 + L - t / 2 - gp, y0], [x0 + L - gp, y0 + t / 2], [x0 + L - t / 2 - gp, y0 + t], [x0 + t / 2 + gp, y0 + t]]; }
    function ver(x0, y0, L) { return [[x0 + t / 2, y0 + gp], [x0 + t, y0 + t / 2 + gp], [x0 + t, y0 + L - t / 2 - gp], [x0 + t / 2, y0 + L - gp], [x0, y0 + L - t / 2 - gp], [x0, y0 + t / 2 + gp]]; }
    var P = { a: hor(x, y, w), g: hor(x, y + hs, w), d: hor(x, y + 2 * hs, w), f: ver(x, y, hs + t), b: ver(x + w - t, y, hs + t), e: ver(x, y + hs, hs + t), c: ver(x + w - t, y + hs, hs + t) };
    g.save(); g.transform(1, 0, -0.08, 1, (y + h) * 0.08, 0);
    for (var s in P) {
      var pts = P[s]; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath();
      g.fillStyle = lit.indexOf(s) >= 0 ? on : off; g.fill();
    }
    g.restore();
  }
  /** Aviso común (PUNTO PARA…, CAMBIO DE CAMPO) sobre la franja central. */
  function scoreMsg(g, SB, W, k, FONT, bg, fg, sub) {
    if (!(SB.msgT > 0 && SB.msg)) return;
    g.fillStyle = bg; g.fillRect(10 * k, 52 * k, W - 20 * k, 140 * k);
    g.fillStyle = SB.msgCol || fg; g.fillRect(10 * k, 52 * k, W - 20 * k, 5 * k); g.fillRect(10 * k, 187 * k, W - 20 * k, 5 * k);
    g.fillStyle = fg; fitFont(g, SB.msg, 'italic 900', (SB.msgSub ? 54 : 66) * k, W * 0.9, FONT); g.fillText(SB.msg, W / 2, (SB.msgSub ? 108 : 122) * k);
    if (SB.msgSub) { g.fillStyle = sub; fitFont(g, SB.msgSub, '800', 26 * k, W * 0.88, FONT); g.fillText(SB.msgSub, W / 2, 158 * k); }
  }
  /** (copiada de Can Rebot) Marcador de pared de SEGMENTOS: dígitos rojos y ámbar sobre negro. */
  KIT.scoreSegments = function (cv, SB, FONT) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / 512, RED = '#ff3b2f', REDo = '#3a0f0c', AMB = '#ffb02e', AMBo = '#3a2408';
    g.fillStyle = '#0b0b0e'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a2a32'; g.lineWidth = 4 * k; g.strokeRect(3 * k, 3 * k, W - 6 * k, H - 6 * k);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var t = 0; t < 2; t++) {
      var cx = W * (t ? 0.76 : 0.24);
      g.fillStyle = AMB; fitFont(g, SB.names[t], '800', 34 * k, 150 * k, FONT); g.fillText(SB.names[t], cx, 28 * k);
      if (SB.serving === t) { var nw = g.measureText(SB.names[t]).width; g.beginPath(); g.arc(cx + (t ? 1 : -1) * (nw / 2 + 14 * k), 28 * k, 7 * k, 0, 2 * PI); g.fill(); }
      var sc = SB.score[t] | 0, d1 = sc >= 10 ? Math.floor(sc / 10) % 10 : -1, d0 = sc % 10, dw = 64 * k, dh = 118 * k, y0 = 58 * k;
      seg7(g, cx - dw - 7 * k, y0, dw, dh, d1, RED, REDo); seg7(g, cx + 7 * k, y0, dw, dh, d0, RED, REDo);
      seg7(g, cx - 11 * k, 196 * k, 22 * k, 40 * k, SB.sets[t] | 0, AMB, AMBo);
    }
    g.fillStyle = AMB; g.font = '800 ' + Math.round(18 * k) + 'px ' + FONT; g.fillText('SET', W / 2, 74 * k);
    seg7(g, W / 2 - 15 * k, 92 * k, 30 * k, 54 * k, Math.min(9, SB.setNo | 0), AMB, AMBo);
    g.fillStyle = 'rgba(255,176,46,0.55)'; g.font = '700 ' + Math.round(14 * k) + 'px ' + FONT; g.fillText('SETS', W / 2, 216 * k);
    if (SB.tag) { g.fillStyle = AMB; fitFont(g, SB.tag, '900', 22 * k, 150 * k, FONT); g.fillText(SB.tag, W / 2, 172 * k); }
    scoreMsg(g, SB, W, k, FONT, '#0b0b0e', AMB, RED);
  };
  /** Marcador de TABLILLAS (manual): tablero verde oscuro, tablillas blancas con números negros, nombres pintados. */
  KIT.scoreFlip = function (cv, SB, FONT, accent) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / 512;
    g.fillStyle = '#1f3d2e'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e9e4d4'; g.lineWidth = 5 * k; g.strokeRect(6 * k, 6 * k, W - 12 * k, H - 12 * k);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    function card(x, y, w, h, s) {
      g.fillStyle = '#f2efe6'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x, y + h / 2 - 1.5 * k, w, 3 * k);
      g.fillStyle = '#9a968c'; g.beginPath(); g.arc(x + w / 2, y + 7 * k, 3.5 * k, 0, 2 * PI); g.fill();
      g.fillStyle = '#16161a'; fitFont(g, s, '900', h * 0.82, w * 0.86, FONT); g.fillText(s, x + w / 2, y + h / 2 + 3 * k);
    }
    for (var t = 0; t < 2; t++) {
      var cx = W * (t ? 0.75 : 0.25);
      g.fillStyle = '#ffffff'; fitFont(g, SB.names[t], '800', 30 * k, 170 * k, FONT); g.fillText(SB.names[t], cx, 32 * k);
      if (SB.serving === t) { g.fillStyle = accent || '#ffc93c'; g.beginPath(); g.arc(cx + (t ? 1 : -1) * 104 * k, 32 * k, 8 * k, 0, 2 * PI); g.fill(); }
      var sc = SB.score[t] | 0, s1 = sc >= 10 ? String(Math.floor(sc / 10) % 10) : '0', s0 = String(sc % 10);
      card(cx - 76 * k, 60 * k, 70 * k, 112 * k, s1); card(cx + 6 * k, 60 * k, 70 * k, 112 * k, s0);
      card(cx - 20 * k, 186 * k, 40 * k, 56 * k, String(SB.sets[t] | 0));
    }
    g.fillStyle = '#e9e4d4'; g.font = '800 ' + Math.round(16 * k) + 'px ' + FONT; g.fillText('SET', W / 2, 78 * k);
    card(W / 2 - 18 * k, 92 * k, 36 * k, 52 * k, String(Math.min(9, SB.setNo | 0)));
    if (SB.tag) { g.fillStyle = accent || '#ffc93c'; fitFont(g, SB.tag, '900', 20 * k, 120 * k, FONT); g.fillText(SB.tag, W / 2, 170 * k); }
    scoreMsg(g, SB, W, k, FONT, '#1f3d2e', '#ffffff', accent || '#ffc93c');
  };
  /** Marcador LED de pared: fondo negro con rejilla de píxeles, nombres en blanco y tanteo en el color del club. */
  KIT.scoreLed = function (cv, SB, FONT, accent, grid) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / 512, A = accent || '#ffd23c';
    g.fillStyle = '#07080c'; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var t = 0; t < 2; t++) {
      var cx = W * (t ? 0.76 : 0.24);
      g.fillStyle = '#ffffff'; fitFont(g, SB.names[t], '900', 32 * k, 170 * k, FONT); g.fillText(SB.names[t], cx, 30 * k);
      if (SB.serving === t) { g.fillStyle = A; g.beginPath(); g.arc(cx + (t ? 1 : -1) * 100 * k, 30 * k, 7 * k, 0, 2 * PI); g.fill(); }
      g.fillStyle = A; fitFont(g, String(SB.score[t] | 0), '900', 128 * k, 170 * k, FONT); g.fillText(String(SB.score[t] | 0), cx, 124 * k);
      g.fillStyle = '#ffffff'; g.font = '900 ' + Math.round(34 * k) + 'px ' + FONT; g.fillText(String(SB.sets[t] | 0), cx, 220 * k);
    }
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '800 ' + Math.round(16 * k) + 'px ' + FONT; g.fillText('SET', W / 2, 92 * k);
    g.fillStyle = '#ffffff'; g.font = '900 ' + Math.round(40 * k) + 'px ' + FONT; g.fillText(String(Math.min(9, SB.setNo | 0)), W / 2, 128 * k);
    if (SB.tag) { g.fillStyle = A; fitFont(g, SB.tag, '900', 20 * k, 120 * k, FONT); g.fillText(SB.tag, W / 2, 176 * k); }
    scoreMsg(g, SB, W, k, FONT, '#07080c', '#ffffff', A);
    if (grid) { g.fillStyle = grid; g.fillRect(0, 0, W, H); }
  };
  /** Rejilla de píxeles del LED (patrón, se crea una vez por lienzo). */
  KIT.ledGrid = function (g, k) {
    var pc = document.createElement('canvas'), n = Math.max(3, Math.round(4 * k)); pc.width = pc.height = n; var pg = pc.getContext('2d');
    pg.fillStyle = 'rgba(0,0,0,0.45)'; pg.fillRect(0, n - 1, n, 1); pg.fillRect(n - 1, 0, 1, n);
    return g.createPattern(pc, 'repeat');
  };

  /* ======================================================================== mallas de quads (rótulos y marcador) */
  /** (copiada de Can Rebot) Quad vertical con uv en una lista L = {P, N, U, I}; n = '+x' | '-x' | '+y' | '-y' (hacia dónde mira). */
  KIT.quad = function (L, cx, cy, cz, w, h, n, uv) {
    var nx = n === '+x' ? 1 : n === '-x' ? -1 : 0, ny = n === '+y' ? 1 : n === '-y' ? -1 : 0, rx = -ny, ryy = nx, v = L.v || (L.v = new window.THREE.Vector3()), b = L.P.length / 3;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      VB.toThree(cx + rx * q[0] * w / 2, cy + ryy * q[0] * w / 2, cz + q[1] * h / 2, v); L.P.push(v.x, v.y, v.z);
      VB.toThree(nx, ny, 0, v); L.N.push(v.x, v.y, v.z);
      L.U.push(q[0] < 0 ? uv[0] : uv[2], q[1] < 0 ? uv[1] : uv[3]);
    });
    L.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  KIT.quads = function () { return { P: [], N: [], U: [], I: [] }; };
  KIT.geoOf = function (THREE, L) {
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(L.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(L.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(L.U, 2)); g.setIndex(L.I); g.computeBoundingSphere(); return g;
  };

  /* ======================================================================== carcasa */
  /** Muro recto: axis 'y' = pared en y = pos (a lo largo de x, de a0 a a1); axis 'x' = fondo en x = pos (a lo largo de y).
   *  s = ±1 hacia fuera (grosor 0,3 m por fuera de pos). Del suelo a o.z1 con zócalo (o.dado, o.cDado, o.cRail) y acabado
   *  o.wall por bandas de color de vértice en relieve (hiladas, juntas, nervios, tablas…). Sin texturas. */
  KIT.wall = function (H, S, axis, pos, s, a0, a1, o) {
    var bx = H.bx, c = o.cWall, t = 0.3;
    function blk(b0, b1, d0, d1, z0, z1, cc) {   // d: profundidad desde la cara interior (d > 0 hacia dentro)
      var p0 = pos - s * d0, p1 = pos - s * d1;
      if (axis === 'y') bx(S, b0, b1, Math.min(p0, p1), Math.max(p0, p1), z0, z1, cc); else bx(S, Math.min(p0, p1), Math.max(p0, p1), b0, b1, z0, z1, cc);
    }
    function face(b0, b1, z0, z1, cc, dep) { blk(b0, b1, 0, dep || 0.02, z0, z1, cc); }
    var A0 = a0 - t, A1 = a1 + t, dz = o.dado, z1 = o.z1, w = o.wall, i, z, a;
    blk(A0, A1, -t, 0, 0, dz, H.col(o.cDado)); blk(A0, A1, -t, 0, dz, z1, H.col(c));
    face(a0, a1, dz - 0.03, dz + 0.06, H.col(o.cRail || shade(o.cDado, 0.8)), 0.04);
    if (w === 'brick-red' || w === 'brick-yellow') {      // hiladas: bandas de 0,45 m un tono más oscuras y pilastras cada ~6 m
      var cd = H.col(shade(c, 0.9));
      for (z = dz + 0.4; z < z1 - 0.2; z += 0.9) face(a0, a1, z, Math.min(z1, z + 0.45), cd, 0.012);
      var np = Math.max(2, Math.round((a1 - a0) / 6)), pc = H.col(shade(c, 0.82));
      for (i = 1; i < np; i++) { a = a0 + (a1 - a0) * i / np; face(a - 0.3, a + 0.3, 0, z1, pc, 0.09); }
    } else if (w === 'concrete') {                         // paneles prefabricados: juntas cada 3 m
      var cj = H.col(shade(c, 0.78));
      for (a = a0 + 3; a < a1 - 0.5; a += 3) face(a - 0.025, a + 0.025, dz, z1, cj, 0.015);
      for (z = dz + 2.6; z < z1 - 0.3; z += 2.6) face(a0, a1, z - 0.025, z + 0.025, cj, 0.015);
    } else if (w === 'block2') {                           // bloque a dos tonos: la mitad baja más oscura, juntas finas
      var lo = H.col(shade(c, 0.86)), jt = H.col(shade(c, 0.8)), zm = Math.min(z1 - 1, dz + 2.4);
      face(a0, a1, dz + 0.06, zm, lo, 0.01);
      for (z = dz + 0.4; z < z1 - 0.2; z += 0.4) face(a0, a1, z - 0.012, z + 0.012, jt, 0.016);
    } else if (w === 'metal') {                            // chapa grecada: nervios verticales por encima del zócalo
      var cr = H.col(shade(c, 0.84)), step = (a1 - a0) > 40 ? 0.9 : 0.6;
      for (a = a0 + step / 2; a < a1; a += step) face(a - 0.07, a + 0.07, dz + 0.1, z1, cr, 0.05);
    } else if (w === 'wood') {                             // tablas verticales de 0,3 m en dos tonos
      var wd = H.col(shade(c, 0.9));
      for (a = a0, i = 0; a < a1; a += 0.3, i++) if (i % 2) face(a, Math.min(a1, a + 0.3), dz + 0.06, z1, wd, 0.012);
    } else if (w === 'tile') {                             // azulejo hasta 2,4 m sobre el zócalo
      var tj = H.col(shade(c, 0.85));
      for (a = a0; a < a1; a += 0.6) face(a - 0.01, a + 0.01, dz, dz + 2.4, tj, 0.012);
      face(a0, a1, dz + 2.4, dz + 2.5, H.col(shade(c, 0.7)), 0.03);
    } else if (w === 'stucco') {                           // estuco: cornisa
      face(a0, a1, z1 - 0.5, z1 - 0.3, H.col(shade(c, 0.88)), 0.08);
    }
  };
  /** (copiada de Can Rebot) Ventanales altos en una pared larga (y = yw, s = +1 si la pared está en +y): cristal en E,
   *  carpintería en S. step = separación, ww = ancho, z0..z1 = alto. kind: 'band' | 'lattice' | 'brise' | 'arches'. */
  KIT.windowRow = function (H, S, E, yw, s, xa, xb, step, ww, z0, z1, cGlass, cFrame, kind) {
    var bx = H.bx, hw = ww / 2, zm = (z0 + z1) / 2;
    for (var wx = xa; wx <= xb + 0.01; wx += step) {
      bx(E, wx - hw, wx + hw, yw - s * 0.13, yw - s * 0.11, z0, z1, cGlass);
      bx(S, wx - hw - 0.17, wx + hw + 0.17, yw - s * 0.24, yw, z0 - 0.16, z0, cFrame); bx(S, wx - hw - 0.15, wx + hw + 0.15, yw - s * 0.2, yw, z1, z1 + 0.12, cFrame);
      bx(S, wx - hw - 0.15, wx - hw, yw - s * 0.2, yw, z0, z1, cFrame); bx(S, wx + hw, wx + hw + 0.15, yw - s * 0.2, yw, z0, z1, cFrame);
      if (kind === 'lattice') {
        for (var q = 1; q < 4; q++) { var xq = wx - hw + ww * q / 4; bx(S, xq - 0.03, xq + 0.03, yw - s * 0.17, yw, z0, z1, cFrame); }
        for (var r = 1; r < 4; r++) { var zq = z0 + (z1 - z0) * r / 4; bx(S, wx - hw, wx + hw, yw - s * 0.17, yw, zq - 0.03, zq + 0.03, cFrame); }
      } else {
        bx(S, wx - 0.03, wx + 0.03, yw - s * 0.17, yw, z0, z1, cFrame); bx(S, wx - hw, wx + hw, yw - s * 0.17, yw, zm - 0.03, zm + 0.03, cFrame);
      }
      if (kind === 'brise') for (var f = -1; f <= 1; f++) bx(S, wx + f * hw * 0.66 - 0.05, wx + f * hw * 0.66 + 0.05, yw - s * 0.65, yw - s * 0.2, z0 - 0.1, z1 + 0.1, cFrame);
      if (kind === 'arches') { bx(S, wx - hw * 0.7, wx + hw * 0.7, yw - s * 0.2, yw, z1 + 0.12, z1 + 0.32, cFrame); bx(S, wx - hw * 0.35, wx + hw * 0.35, yw - s * 0.2, yw, z1 + 0.32, z1 + 0.46, cFrame); }
    }
  };
  /** Ventanal en un fondo (x = xw, e = ±1): marco en S, cristal en E (la vista va en el atlas, delante del cristal). */
  KIT.endWindow = function (H, S, E, xw, e, y0, y1, z0, z1, cGlass, cFrame) {
    var bx = H.bx;
    bx(E, xw - e * 0.13, xw - e * 0.11, y0, y1, z0, z1, cGlass);
    bx(S, xw - e * 0.24, xw, y0 - 0.2, y1 + 0.2, z0 - 0.2, z0, cFrame); bx(S, xw - e * 0.24, xw, y0 - 0.2, y1 + 0.2, z1, z1 + 0.2, cFrame);
    for (var k = 0; k <= 4; k++) { var y = y0 + (y1 - y0) * k / 4; bx(S, xw - e * 0.22, xw, y - 0.06, y + 0.06, z0, z1, cFrame); }
  };

  /* ======================================================================== techos */
  /** (copiada de Can Rebot) Dientes de sierra: n dientes a lo largo de x, lucernarios verticales (cristal en E) mirando a +x. */
  KIT.roofSaw = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, NT = o.n, TW = 2 * WX / NT, RISE = o.rise, c = o.c, BOX = H.BOX, pt = H.pt, bx = H.bx, rod = H.rod;
    var span = YN - YS + 0.6, yc = (YN + YS) / 2, ang = Math.atan2(RISE, TW), L = Math.hypot(TW, RISE), sn = Math.sin(ang), cs = Math.cos(ang);
    for (var k = 0; k < NT; k++) {
      var x0 = -WX + k * TW, x1 = x0 + TW, xm = (x0 + x1) / 2, zm = EAVE + RISE / 2;
      pt(S, BOX, xm - sn * 0.06, yc, zm + cs * 0.06, c.roof, 0, 0, ang, L, 0.12, span);
      if (!o.lite) for (var ry = YS + 0.6; ry < YN; ry += 1.25) pt(S, BOX, xm + sn * 0.03, ry, zm - cs * 0.03, c.roofD, 0, 0, ang, L, 0.07, 0.1);
      if (k < NT - 1) {
        bx(E, x1 - 0.02, x1 + 0.02, YS, YN, EAVE, EAVE + RISE, c.glass);
        for (var my = YS + 1.4; my < YN - 0.5; my += 1.53) bx(S, x1 - 0.07, x1 - 0.02, my - 0.04, my + 0.04, EAVE, EAVE + RISE, c.truss);
        bx(S, x1 - 0.1, x1 + 0.02, YS, YN, EAVE - 0.06, EAVE + 0.04, c.truss);
        var zb = EAVE - 0.95, nW = o.lite ? 6 : 12;
        rod(S, x1, YS, zb, x1, YN, zb, 0.07, c.truss); rod(S, x1, YS, EAVE - 0.05, x1, YN, EAVE - 0.05, 0.06, c.truss);
        for (var j = 0; j <= nW; j++) {
          var y0 = YS + (YN - YS) * j / nW, y1 = YS + (YN - YS) * (j + 1) / nW;
          rod(S, x1, y0, zb, x1, y0, EAVE - 0.05, 0.035, c.truss);
          if (j < nW) rod(S, x1, j % 2 ? y0 : y1, zb, x1, j % 2 ? y1 : y0, EAVE - 0.05, 0.03, c.truss);
        }
      }
    }
    return EAVE + RISE;
  };
  /** Cercha plana de celosía (Warren) entre (xa, ya) y (xb, yb) a la altura zb (cordón inferior) con canto d. */
  function truss(H, S, xa, ya, xb, yb, zb, d, n, cc, r) {
    var rod = H.rod; r = r || 0.06;
    rod(S, xa, ya, zb, xb, yb, zb, r, cc); rod(S, xa, ya, zb + d, xb, yb, zb + d, r, cc);
    for (var j = 0; j <= n; j++) {
      var t0 = j / n, t1 = (j + 1) / n, x0 = xa + (xb - xa) * t0, y0 = ya + (yb - ya) * t0, x1 = xa + (xb - xa) * t1, y1 = ya + (yb - ya) * t1;
      rod(S, x0, y0, zb, x0, y0, zb + d, r * 0.55, cc);
      if (j < n) rod(S, x0, y0, j % 2 ? zb : zb + d, x1, y1, j % 2 ? zb + d : zb, r * 0.5, cc);
    }
  }
  KIT.truss = truss;
  /** A dos aguas: cumbrera a lo largo de x (en y = yc), faldones hasta las paredes largas, n cerchas de par y tirante (a lo
   *  ancho) con montantes y diagonales, correas a lo largo. skylight: lucernario corrido en la cumbrera. Devuelve la cumbrera. */
  KIT.roofGable = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, bx = H.bx, rod = H.rod, pt = H.pt, BOX = H.BOX;
    var yc = (YS + YN) / 2, hs = (YN - YS) / 2, tp = Math.tan(o.pitch * PI / 180), RZ = EAVE + hs * tp, L = Math.hypot(hs, hs * tp) + 0.3, ang = Math.atan(tp);
    for (var s = -1; s <= 1; s += 2) {   // faldones (rx gira alrededor del eje x de three = eje x de la sim)
      var ym = yc + s * hs / 2, zm = EAVE + hs * tp / 2;
      pt(S, BOX, 0, ym, zm + 0.08, c.roof, -s * ang, 0, 0, 2 * WX + 0.6, 0.14, L);
      if (!o.lite) for (var rx = -WX + 1.2; rx < WX; rx += 1.4) pt(S, BOX, rx, ym, zm - 0.02, c.roofD, -s * ang, 0, 0, 0.08, 0.06, L - 0.3);
    }
    var n = o.n;
    for (var k = 0; k < n; k++) {
      var x = -WX + 2 * WX * (k + 0.5) / n;
      rod(S, x, YS, EAVE, x, YN, EAVE, 0.08, c.truss);                                   // tirante
      rod(S, x, YS, EAVE, x, yc, RZ - 0.05, 0.08, c.truss); rod(S, x, YN, EAVE, x, yc, RZ - 0.05, 0.08, c.truss); // pares
      var nm = o.lite ? 3 : 6;
      for (var j = 1; j < nm; j++) {
        for (var s2 = -1; s2 <= 1; s2 += 2) {
          var yy = yc + s2 * hs * j / nm, zz = EAVE + (hs - Math.abs(yy - yc)) * tp - 0.05;
          rod(S, x, yy, EAVE, x, yy, zz, 0.035, c.truss);
          var yn = yc + s2 * hs * (j - 1) / nm, zn = EAVE + (hs - Math.abs(yn - yc)) * tp - 0.05;
          rod(S, x, yy, EAVE, x, yn, zn, 0.03, c.truss);
        }
      }
    }
    for (var pj = 1; pj < 4; pj++) for (var s3 = -1; s3 <= 1; s3 += 2) { var py = yc + s3 * hs * pj / 4; rod(S, -WX, py, EAVE + (hs - Math.abs(py - yc)) * tp - 0.12, WX, py, EAVE + (hs - Math.abs(py - yc)) * tp - 0.12, 0.05, c.truss); }
    if (o.skylight) { for (var s4 = -1; s4 <= 1; s4 += 2) pt(E, BOX, 0, yc + s4 * 0.9, RZ - 0.9 * tp - 0.02, c.glass, -s4 * ang, 0, 0, 2 * WX - 3, 0.04, 1.7); }
    // remates de los hastiales (los fondos): franjas verticales hasta el faldón
    for (var e = -1; e <= 1; e += 2) {
      var xe = e * (WX + 0.15), NS = 12;
      for (var q = 0; q < NS; q++) {
        var ya = YS + (YN - YS) * q / NS, yb = YS + (YN - YS) * (q + 1) / NS, ymid = (ya + yb) / 2, zt = EAVE + (hs - Math.abs(ymid - yc)) * tp;
        bx(S, xe - 0.15, xe + 0.15, ya, yb, EAVE - 0.05, zt, c.gableC);
      }
    }
    return RZ;
  };
  /** Techo plano con n cerchas vistas de canto 1,4 m (a lo ancho) y correas; skylight: lucernarios entre cerchas. */
  KIT.roofFlat = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, bx = H.bx, rod = H.rod, D = 1.4, n = o.n, top = EAVE + D;
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YN + 0.3, top, top + 0.25, c.roof);
    if (!o.lite) for (var py = YS + 1.5; py < YN - 0.5; py += 1.8) rod(S, -WX, py, top - 0.08, WX, py, top - 0.08, 0.05, c.roofD);
    for (var k = 0; k < n; k++) { var x = -WX + 2 * WX * (k + 0.5) / n; truss(H, S, x, YS, x, YN, EAVE, D - 0.1, o.lite ? 8 : 14, c.truss, 0.07); }
    if (o.skylight) for (var k2 = 0; k2 < n - 1; k2++) { var xm = -WX + 2 * WX * (k2 + 1) / n; bx(E, xm - 0.9, xm + 0.9, YS + 3, YN - 3, top - 0.02, top + 0.01, c.glass); }
    // franja de cierre entre el alero y la cubierta en los cuatro lados
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YS, EAVE - 0.05, top, c.gableC); bx(S, -WX - 0.3, WX + 0.3, YN, YN + 0.3, EAVE - 0.05, top, c.gableC);
    bx(S, -WX - 0.3, -WX, YS, YN, EAVE - 0.05, top, c.gableC); bx(S, WX, WX + 0.3, YS, YN, EAVE - 0.05, top, c.gableC);
    return top;
  };
  /** Bóveda de cañón (eje a lo largo de x): flecha rise sobre el alero, 14 facetas a lo ancho, n arcos (costillas) a lo ancho,
   *  lucernario longitudinal en la clave (skylight) y lunetos de los fondos. Devuelve la clave. */
  KIT.roofBarrel = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, bx = H.bx, rod = H.rod, pt = H.pt, BOX = H.BOX;
    var yc = (YS + YN) / 2, hs = (YN - YS) / 2, R = (hs * hs + o.rise * o.rise) / (2 * o.rise), zc = EAVE + o.rise - R, NF = 14;
    function zAt(y) { var d = y - yc; return zc + Math.sqrt(Math.max(0, R * R - d * d)); }
    for (var f = 0; f < NF; f++) {
      var ya = YS + (YN - YS) * f / NF, yb = YS + (YN - YS) * (f + 1) / NF, za = zAt(ya), zb = zAt(yb), ym = (ya + yb) / 2, zm = (za + zb) / 2;
      var ang = Math.atan2(zb - za, yb - ya), L = Math.hypot(yb - ya, zb - za) + 0.04, sky = o.skylight && (f === NF / 2 - 1 || f === NF / 2);
      // rx > 0 (eje x de three) levanta el lado de +y de la sim: pendiente zb > za con y creciente ⇒ rx = ang
      pt(sky ? E : S, BOX, 0, ym, zm + 0.08, sky ? c.glass : (f % 2 ? c.roof : c.roofD), ang, 0, 0, 2 * WX + 0.6, 0.14, L);
      // lunetos: el fondo se cierra bajo el arco
      for (var e = -1; e <= 1; e += 2) bx(S, e * WX - 0.15 + e * 0.15, e * WX + 0.15 + e * 0.15, ya, yb, EAVE - 0.05, Math.max(za, zb), c.gableC);
    }
    var n = o.n;
    for (var k = 0; k <= n; k++) {
      var x = -WX + 2 * WX * k / n, NA = o.lite ? 8 : 12;
      for (var a = 0; a < NA; a++) {
        var y0 = YS + (YN - YS) * a / NA, y1 = YS + (YN - YS) * (a + 1) / NA;
        rod(S, x, y0, zAt(y0) - 0.12, x, y1, zAt(y1) - 0.12, 0.11, c.truss);
      }
      rod(S, x, YS + 0.2, EAVE - 1.2, x, YS + 0.2, EAVE + 0.1, 0.12, c.truss); rod(S, x, YN - 0.2, EAVE - 1.2, x, YN - 0.2, EAVE + 0.1, 0.12, c.truss);
    }
    if (!o.lite) for (var t = 1; t < 6; t++) for (var s = -1; s <= 1; s += 2) { var py = yc + s * hs * t / 6; rod(S, -WX, py, zAt(py) - 0.2, WX, py, zAt(py) - 0.2, 0.04, c.roofD); }
    return EAVE + o.rise;
  };

  /* ======================================================================== seña del arquetipo en los fondos (revisión de F2) */
  // El techo no sale en ninguna cámara de juego: la silueta del arquetipo se baja a la franja del fondo que sí se ve, la del
  // marcador (2v2: saque y peloteo; 6v6: el fondo lejano bajo los focos; también en 844 × 390, por debajo del HUD). H1 perfil de dientes de sierra con sus lucernarios;
  // H2 arco de ladrillo de dovelas a dos colores con luneto acristalado y parteluces; H3 frontón de dos aguas con tirante, pares,
  // pendolón y tornapuntas (o, con techo plano, cercha Warren vista). Todo en la estática (y el vidrio en la emisiva): 0 dibujos.
  var _tri = null;
  /** Triángulo plano (coords de sim) por las dos caras en el Builder B. */
  function tri(H, B, a, b, c, cc) {
    var THREE = H.THREE;
    if (!_tri) { _tri = { g: new THREE.BufferGeometry(), m: new THREE.Matrix4() }; _tri.g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3)); _tri.g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(18), 3)); }
    var P = _tri.g.attributes.position, N = _tri.g.attributes.normal, A = [a[0], a[2], -a[1]], Bv = [b[0], b[2], -b[1]], C = [c[0], c[2], -c[1]];
    var ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    [A, Bv, C, A, C, Bv].forEach(function (v, i) { P.setXYZ(i, v[0], v[1], v[2]); var sg = i < 3 ? 1 : -1; N.setXYZ(i, nx * sg, ny * sg, nz * sg); });
    B.add(_tri.g, _tri.m, cc);
  }
  KIT.tri = tri;
  /** Cuadrilátero plano (a, b, c, d en orden) = dos triángulos. */
  function quad4(H, B, a, b, c, d, cc) { tri(H, B, a, b, c, cc); tri(H, B, a, c, d, cc); }
  /** Seña del arquetipo en el fondo xf (e = ±1, la pared mira a −e). o = {A, t: techo efectivo, pitch, z0, z1, yw, zS, c: colores
   *  {truss, saw, glass, brick, stone, fill, frame}, lite}. z0-z1: franja del marcador (que queda delante); zS: arranque del arco (H2). */
  KIT.endSig = function (H, S, E, xf, e, o) {
    var bx = H.bx, rod = H.rod, c = o.c, z0 = o.z0, z1 = o.z1, yw = o.yw, xw = xf - e * 0.09, xg = xf - e * 0.05;
    if (KIT.endSigF3(H, S, E, xf, e, o)) return;
    if (o.A === 'H1') {   // perfil de dientes de sierra: lucernario vertical (vidrio) + faldón inclinado, sobre una viga
      var n = Math.max(4, Math.round(2 * yw / 2.4)), tw = 2 * yw / n, gw = Math.min(0.42, tw * 0.2);
      bx(S, xf - e * 0.22, xf, -yw - 0.25, yw + 0.25, z0 - 0.2, z0, c.truss);
      for (var i = 0; i < n; i++) {
        var ya = -yw + i * tw, yb = ya + tw;
        bx(E, xf - e * 0.07, xf - e * 0.03, ya, ya + gw, z0, z1, c.glass);
        tri(H, S, [xw, ya + gw, z1], [xw, yb, z0], [xw, ya + gw, z0], c.saw);
        rod(S, xf - e * 0.12, ya + gw, z1 + 0.03, xf - e * 0.12, yb + 0.03, z0, 0.07, c.truss);
        rod(S, xf - e * 0.12, ya, z0, xf - e * 0.12, ya, z1 + 0.06, 0.06, c.truss);
        if (!o.lite) rod(S, xf - e * 0.1, ya + gw, z0, xf - e * 0.1, ya + gw, z1, 0.035, c.truss);
      }
      rod(S, xf - e * 0.12, yw, z0, xf - e * 0.12, yw, z1 + 0.06, 0.06, c.truss);
      return;
    }
    if (o.A === 'H2') {   // arco rebajado de ladrillo (dovelas a dos colores) con luneto acristalado y parteluces radiales
      var zS = o.zS, rise = z1 - zS, ya2 = Math.max(rise * 1.05, Math.min(yw, 7.2)), R = (ya2 * ya2 + rise * rise) / (2 * rise), zc = z1 - R, th = Math.asin(Math.min(1, ya2 / R));
      var T = 0.6, NV = o.lite ? 11 : 15, Ri = R - T, zT = z0 + 0.15;
      function P(r, a) { return [xw, r * Math.sin(a), zc + r * Math.cos(a)]; }
      // luneto: abanico desde el centro del travesaño hasta el intradós (por encima del travesaño)
      var zi = zT - zc, yT = Ri > zi ? Math.sqrt(Ri * Ri - zi * zi) : 0;
      if (yT > 0.5 && zc + Ri > zT + 0.4) {
        var aT = Math.asin(Math.min(1, yT / Ri)), NG = 10, cen = [xf - e * 0.04, 0, zT], prev = [xf - e * 0.04, -yT, zT];
        for (var g = 1; g <= NG; g++) { var ag = -aT + 2 * aT * g / NG, q = [xf - e * 0.04, Ri * Math.sin(ag), zc + Ri * Math.cos(ag)]; tri(H, E, cen, prev, q, c.glass); prev = q; }
        tri(H, E, cen, prev, [xf - e * 0.04, yT, zT], c.glass);
        bx(S, xf - e * 0.16, xf, -yT, yT, zT - 0.12, zT + 0.04, c.frame);
        for (var m = -2; m <= 2; m++) { var am = m * aT / 2.6; rod(S, xf - e * 0.1, 0, zT, xf - e * 0.1, Ri * Math.sin(am), zc + Ri * Math.cos(am), 0.05, c.frame); }
      }
      for (var v = 0; v < NV; v++) {
        var a0 = -th + 2 * th * v / NV, a1 = -th + 2 * th * (v + 1) / NV, cc = v % 2 ? c.stone : c.brick;
        quad4(H, S, P(Ri, a0), P(R, a0), P(R, a1), P(Ri, a1), cc);
      }
      bx(S, xf - e * 0.14, xf, -0.35, 0.35, z1 - T - 0.1, z1 + 0.15, c.stone);   // clave
      return;
    }
    if (o.t === 'gable') {   // frontón: relleno, tirante, pares, pendolón y tornapuntas
      var tp = Math.tan((o.pitch || 16) * PI / 180), yg = Math.min(yw, (z1 - z0) / tp), zA = z0 + yg * tp, r = 0.15;
      tri(H, S, [xw, -yg, z0], [xw, yg, z0], [xw, 0, zA], c.fill);
      rod(S, xf - e * 0.14, -yg - 0.3, z0, xf - e * 0.14, yg + 0.3, z0, r, c.truss);
      rod(S, xf - e * 0.14, -yg - 0.3, z0 - 0.3 * tp, xf - e * 0.14, 0, zA + 0.08, r, c.truss); rod(S, xf - e * 0.14, yg + 0.3, z0 - 0.3 * tp, xf - e * 0.14, 0, zA + 0.08, r, c.truss);
      rod(S, xf - e * 0.14, 0, z0, xf - e * 0.14, 0, zA, r * 0.8, c.truss);
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        rod(S, xf - e * 0.14, 0, z0 + 0.15, xf - e * 0.14, s2 * yg * 0.5, z0 + yg * 0.5 * tp, r * 0.6, c.truss);
        rod(S, xf - e * 0.14, s2 * yg * 0.5, z0, xf - e * 0.14, s2 * yg * 0.5, z0 + yg * 0.5 * tp, r * 0.55, c.truss);
      }
      return;
    }
    // techo plano: cercha Warren vista de canto (cordones gruesos y diagonales) sobre un paño de otro tono
    bx(S, xf - e * 0.03, xf, -yw, yw, z0, z1, c.fill);
    truss(H, S, xf - e * 0.15, -yw, xf - e * 0.15, yw, z0 + 0.1, z1 - z0 - 0.2, Math.max(6, Math.round(yw / 1.3)) * 2, c.truss, 0.1);
  };

  /* ======================================================================== F3: techos de H4-H7 */
  /** H4 LÁMINA: lámina plegada de hormigón, n pliegues a lo largo de x (cumbreras y limas a lo ancho), placas de dos tonos,
   *  tímpanos triangulares sobre las paredes largas, nervio en cada cumbrera y viga de borde. Devuelve la coronación. */
  KIT.roofFolded = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, n = o.n, TW = 2 * WX / n, RISE = o.rise, c = o.c, pt = H.pt, BOX = H.BOX, bx = H.bx;
    var span = YN - YS + 0.6, yc = (YN + YS) / 2, hw = TW / 2, ang = Math.atan2(RISE, hw), L = Math.hypot(hw, RISE) + 0.04;
    for (var k = 0; k < n; k++) {
      var x0 = -WX + k * TW, xm = x0 + hw;
      pt(S, BOX, x0 + hw / 2, yc, EAVE + RISE / 2 + 0.07, c.roof, 0, 0, ang, L, 0.14, span);
      pt(S, BOX, xm + hw / 2, yc, EAVE + RISE / 2 + 0.07, c.roofD, 0, 0, -ang, L, 0.14, span);
      for (var s = -1; s <= 1; s += 2) { var yw = s < 0 ? YS - 0.15 : YN + 0.15; tri(H, S, [x0, yw, EAVE - 0.02], [x0 + TW, yw, EAVE - 0.02], [xm, yw, EAVE + RISE], c.gableC); }
      if (!o.lite) H.rod(S, xm, YS, EAVE + RISE - 0.12, xm, YN, EAVE + RISE - 0.12, 0.16, c.truss, BOX);
    }
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YS + 0.25, EAVE - 0.6, EAVE, c.gableC); bx(S, -WX - 0.3, WX + 0.3, YN - 0.25, YN + 0.3, EAVE - 0.6, EAVE, c.gableC);
    return EAVE + RISE;
  };
  /** H5 MADERA: n arcos laminados a lo ancho que arrancan del suelo junto a las paredes largas (pilar sobre zapata de acero hasta el
   *  alero y arco de directriz circular hasta la clave, a eave + rise), entablado de madera en facetas, lunetos y correas. */
  KIT.roofGlulam = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, bx = H.bx, rod = H.rod, pt = H.pt, BOX = H.BOX;
    var yc = (YS + YN) / 2, hs = (YN - YS) / 2, R = (hs * hs + o.rise * o.rise) / (2 * o.rise), zc = EAVE + o.rise - R, NF = 12, IN = 0.4;
    function zAt(y) { var d = y - yc; return zc + Math.sqrt(Math.max(0, R * R - d * d)); }
    for (var f = 0; f < NF; f++) {   // entablado (facetas a dos tonos) y lunetos de los fondos
      var ya = YS + (YN - YS) * f / NF, yb = YS + (YN - YS) * (f + 1) / NF, za = zAt(ya), zb = zAt(yb), ang = Math.atan2(zb - za, yb - ya);
      pt(S, BOX, 0, (ya + yb) / 2, (za + zb) / 2 + 0.1, f % 2 ? c.roof : c.roofD, ang, 0, 0, 2 * WX + 0.6, 0.1, Math.hypot(yb - ya, zb - za) + 0.04);
      for (var e = -1; e <= 1; e += 2) bx(S, e * WX, e * WX + e * 0.3, ya, yb, EAVE - 0.05, Math.max(za, zb), c.gableC);
    }
    var n = o.n, NA = o.lite ? 8 : 12, xs = [];
    for (var k = 0; k < n; k++) {
      var x = -WX + 2 * WX * (k + 0.5) / n; xs.push(x);
      for (var s = -1; s <= 1; s += 2) {
        var yp = s < 0 ? YS + IN : YN - IN;
        bx(S, x - 0.3, x + 0.3, yp - 0.3, yp + 0.3, 0, 0.32, c.steel);                         // zapata
        rod(S, x, yp, 0.3, x, yp, EAVE, 0.36, c.truss, BOX);                                     // pilar
        rod(S, x, yp, EAVE - 1.6, x, yp - s * 1.3, zAt(yp - s * 1.3) - 0.35, 0.26, c.truss, BOX); // codo (cartabón)
      }
      for (var a = 0; a < NA; a++) {
        var y0 = YS + IN + (YN - YS - 2 * IN) * a / NA, y1 = YS + IN + (YN - YS - 2 * IN) * (a + 1) / NA;
        rod(S, x, y0, zAt(y0) - 0.32, x, y1, zAt(y1) - 0.32, 0.34, c.truss, BOX);
      }
    }
    if (!o.lite) for (var t = 1; t < 5; t++) for (var s2 = -1; s2 <= 1; s2 += 2) { var py = yc + s2 * hs * t / 5; rod(S, -WX, py, zAt(py) - 0.55, WX, py, zAt(py) - 0.55, 0.07, c.roofD, BOX); }
    return { top: EAVE + o.rise, posts: xs };
  };
  /** H6 MODERNO: techo plano oscuro con n lamas claras a lo ancho (canto 0,85 m) y tiras de luz corridas (emisiva). */
  KIT.roofLouvre = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, bx = H.bx, n = o.n, top = EAVE + 1.2, yc = (YS + YN) / 2;
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YN + 0.3, top, top + 0.2, c.roofD);
    for (var k = 0; k < n; k++) { var x = -WX + 2 * WX * (k + 0.5) / n; bx(S, x - 0.11, x + 0.11, YS, YN, top - 0.85, top - 0.02, c.roof); }
    for (var s = -1; s <= 1; s += 2) bx(E, -WX + 0.5, WX - 0.5, yc + s * (YN - YS) * 0.22 - 0.08, yc + s * (YN - YS) * 0.22 + 0.08, top - 0.04, top - 0.01, c.lamp);
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YS, EAVE - 0.05, top, c.gableC); bx(S, -WX - 0.3, WX + 0.3, YN, YN + 0.3, EAVE - 0.05, top, c.gableC);
    bx(S, -WX - 0.3, -WX, YS, YN, EAVE - 0.05, top, c.gableC); bx(S, WX, WX + 0.3, YS, YN, EAVE - 0.05, top, c.gableC);
    return top;
  };
  /** H7 octógono: forjado plano, linterna central (anillo de 16 tramos + vidrio en la emisiva) y 8 cerchas radiales hacia los
   *  centros de los lados y los chaflanes (o las esquinas). */
  KIT.roofOctagon = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, bx = H.bx, rod = H.rod, top = EAVE + 1.4, yc = (YS + YN) / 2, ch = o.ch || 0, R0 = 3.6;
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YN + 0.3, top, top + 0.25, c.roof);
    for (var i = 0; i < 16; i++) { var a0 = i * PI / 8, a1 = (i + 1) * PI / 8; rod(S, R0 * Math.cos(a0), yc + R0 * Math.sin(a0), top - 0.3, R0 * Math.cos(a1), yc + R0 * Math.sin(a1), top - 0.3, 0.16, c.truss); }
    bx(E, -R0 * 0.72, R0 * 0.72, yc - R0 * 0.72, yc + R0 * 0.72, top - 0.04, top - 0.01, c.glass);
    var T = [[WX, yc], [-WX, yc], [0, YS], [0, YN], [WX - ch / 2, YS + ch / 2], [-WX + ch / 2, YS + ch / 2], [WX - ch / 2, YN - ch / 2], [-WX + ch / 2, YN - ch / 2]];
    T.forEach(function (t) { var dx = t[0], dy = t[1] - yc, l = Math.hypot(dx, dy) || 1; truss(H, S, R0 * dx / l, yc + R0 * dy / l, t[0], t[1], EAVE + 0.1, 1.1, o.lite ? 6 : 10, c.truss, 0.07); });
    bx(S, -WX - 0.3, WX + 0.3, YS - 0.3, YS, EAVE - 0.05, top, c.gableC); bx(S, -WX - 0.3, WX + 0.3, YN, YN + 0.3, EAVE - 0.05, top, c.gableC);
    bx(S, -WX - 0.3, -WX, YS, YN, EAVE - 0.05, top, c.gableC); bx(S, WX, WX + 0.3, YS, YN, EAVE - 0.05, top, c.gableC);
    return top;
  };
  /** H7 cúpula rebajada: casquete de n gajos × 5 anillos desde el perímetro del rectángulo (al alero) hasta el óculo central (a
   *  eave + rise), gajos a dos tonos, n nervios y anillo del óculo (vidrio en la emisiva). */
  KIT.roofDomeLow = function (H, S, E, o) {
    var WX = o.WX, YS = o.YS, YN = o.YN, EAVE = o.eave, c = o.c, rod = H.rod, bx = H.bx, n = o.n, NA = 5, yc = (YS + YN) / 2, hs = (YN - YS) / 2, R0 = 2.6;
    function per(a) {   // punto del perímetro del rectángulo en la dirección a
      var dx = Math.cos(a), dy = Math.sin(a), t = Math.min(Math.abs(dx) > 1e-6 ? WX / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? hs / Math.abs(dy) : 1e9);
      return [dx * t, yc + dy * t];
    }
    function P(a, u) { var q = per(a), r0 = [R0 * Math.cos(a), yc + R0 * Math.sin(a)]; return [q[0] + (r0[0] - q[0]) * u, q[1] + (r0[1] - q[1]) * u, EAVE + o.rise * Math.sin(u * PI / 2)]; }
    for (var i = 0; i < n; i++) {
      var a0 = i * 2 * PI / n, a1 = (i + 1) * 2 * PI / n;
      for (var j = 0; j < NA; j++) quad4(H, S, P(a0, j / NA), P(a1, j / NA), P(a1, (j + 1) / NA), P(a0, (j + 1) / NA), (i + j) % 2 ? c.roof : c.roofD);
      for (var j2 = 0; j2 < NA; j2++) { var p0 = P(a0, j2 / NA), p1 = P(a0, (j2 + 1) / NA); rod(S, p0[0], p0[1], p0[2] - 0.15, p1[0], p1[1], p1[2] - 0.15, 0.12, c.truss); }
      var q0 = P(a0, 1), q1 = P(a1, 1); rod(S, q0[0], q0[1], q0[2] - 0.1, q1[0], q1[1], q1[2] - 0.1, 0.18, c.truss);
    }
    bx(E, -R0 * 0.7, R0 * 0.7, yc - R0 * 0.7, yc + R0 * 0.7, EAVE + o.rise - 0.05, EAVE + o.rise - 0.02, c.glass);
    return EAVE + o.rise;
  };

  /* ======================================================================== F3: carcasa de H7 y piezas de los flavors */
  /** Muro en diagonal (chaflán del octógono) de (ax, ay) a (bx, by), con zócalo y acabado liso (o.z1, o.dado, o.cDado, o.cWall). */
  KIT.chamferWall = function (H, S, ax, ay, bx2, by, o) {
    var dx = bx2 - ax, dy = by - ay, L = Math.hypot(dx, dy), ry = Math.atan2(dy, dx), nx = dy / L, ny = -dx / L;   // normal hacia fuera (las esquinas)
    var cx = (ax + bx2) / 2, cy = (ay + by) / 2;
    if (nx * cx + ny * cy < 0) { nx = -nx; ny = -ny; }
    var dz = o.dado, z1 = o.z1, t = 0.3, ox = cx + nx * t / 2, oy = cy + ny * t / 2;
    H.pt(S, H.BOX, ox, oy, dz / 2, H.col(o.cDado), 0, ry, 0, L + 0.6, dz, t);
    H.pt(S, H.BOX, ox, oy, (dz + z1) / 2, H.col(o.cWall), 0, ry, 0, L + 0.6, z1 - dz, t);
    H.pt(S, H.BOX, cx - nx * 0.01, cy - ny * 0.01, dz + 0.015, H.col(shade(o.cDado, 0.8)), 0, ry, 0, L, 0.09, 0.04);
    if (o.wall === 'stucco') H.pt(S, H.BOX, cx - nx * 0.04, cy - ny * 0.04, z1 - 0.4, H.col(shade(o.cWall, 0.88)), 0, ry, 0, L, 0.2, 0.08);
  };
  /** Balconada (H7) a lo largo de la pared y = yw (s = +1: pared en +y) de x0 a x1 a la altura z: losa, ménsulas, antepecho de
   *  color con pasamanos, peldaño y banco. Devuelve los asientos del público (frente a la pista). */
  KIT.balcony = function (H, S, o) {
    var bx = H.bx, yw = o.yw, s = o.s, d = o.d, z = o.z, x0 = o.x0, x1 = o.x1, c = o.c, seats = [], yf = yw - s * d;
    function Y(a, b) { return [Math.min(yw - s * a, yw - s * b), Math.max(yw - s * a, yw - s * b)]; }
    var q = Y(0, d); bx(S, x0, x1, q[0], q[1], z - 0.28, z, c.slab);
    q = Y(d - 0.02, d + 0.1); bx(S, x0, x1, q[0], q[1], z - 0.4, z + 0.95, c.fascia);           // antepecho
    bx(S, x0, x1, q[0] - 0.02, q[1] + 0.02, z + 0.95, z + 1.05, c.rail);                       // pasamanos
    bx(S, x0, x1, q[0] - 0.01, q[1] + 0.01, z + 0.25, z + 0.33, c.stripe);                    // franja
    for (var x = x0 + 1.5; x < x1 - 1; x += 3) { var qq = Y(0, 1.0); bx(S, x - 0.15, x + 0.15, qq[0], qq[1], z - 0.85, z - 0.28, c.slab); }   // ménsulas
    q = Y(0, d * 0.55); bx(S, x0, x1, q[0], q[1], z, z + 0.32, c.slab);                         // peldaño
    var ys = yw - s * (d * 0.55 - 0.25); q = Y(d * 0.55 - 0.45, d * 0.55 - 0.05); bx(S, x0, x1, q[0], q[1], z + 0.72, z + 0.78, c.seat);
    for (var px = x0 + 0.4; px < x1 - 0.3; px += 0.56) if (o.rnd() < o.occ) seats.push({ x: px + (o.rnd() - 0.5) * 0.08, y: ys, z: z + 0.78, fx: 0, fy: -s, row: 0 });
    return seats;
  };
  /** Ventana redonda (óculo) en una pared larga: marco en disco (S) y vidrio en la emisiva por delante. */
  KIT.oculus = function (H, S, E, x, yw, s, z, d, cGlass, cFrame) {
    H.pt(S, H.BG.cyl, x, yw - s * 0.06, z, cFrame, PI / 2, 0, 0, d / 2, 0.12, d / 2);
    H.pt(E, H.BG.cyl, x, yw - s * 0.14, z, cGlass, PI / 2, 0, 0, d * 0.4, 0.03, d * 0.4);
  };
  /** Ventilador de techo (flavor trop): barra, cuerpo y 4 aspas. */
  KIT.fan = function (H, S, x, y, z, zTop, rot, c) {
    H.rod(S, x, y, z + 0.1, x, y, zTop, 0.025, c.dark);
    H.pt(S, H.BG.cyl, x, y, z, c.white, 0, 0, 0, 0.18, 0.2, 0.18);
    for (var i = 0; i < 4; i++) { var a = rot + i * PI / 2; H.pt(S, H.BOX, x + Math.cos(a) * 0.62, y + Math.sin(a) * 0.62, z - 0.04, c.wood, 0, a, 0, 1.0, 0.03, 0.2); }
  };
  /** Jardinera con planta (flavor trop): macetero y tres matas (o un ciprés). */
  KIT.planter = function (H, S, x, y, c, k) {
    H.bx(S, x - 0.45, x + 0.45, y - 0.45, y + 0.45, 0, 0.6, c.pot); H.bx(S, x - 0.5, x + 0.5, y - 0.5, y + 0.5, 0.55, 0.65, c.potD);
    if (k % 2) { H.pt(S, H.BG.cone6, x, y, 1.7, c.leafD, 0, 0, 0, 0.42, 2.2, 0.42); return; }
    H.pt(S, H.BG.sph6, x, y, 1.15, c.leaf, 0, 0, 0, 0.6, 0.55, 0.6); H.pt(S, H.BG.sph6, x + 0.25, y - 0.2, 1.55, c.leafD, 0, 0, 0, 0.45, 0.45, 0.45);
    H.pt(S, H.BG.sph6, x - 0.2, y + 0.15, 1.75, c.leaf, 0, 0, 0, 0.4, 0.42, 0.4);
  };

  /** Lateral abierto en un fondo (x = xf, e = ±1), a la altura del zócalo: el flavor trop (kind 'brise': lamas verticales de hormigón
   *  y la luz de fuera, jardín abajo y cielo arriba) o el gulf (kind 'lattice': celosía de retícula). Es la segunda seña que SÍ sale
   *  en las cámaras de juego (el techo no sale). segs = [[y0, y1], …] tramos libres (sin puertas). Hueco en E (emisiva, sin
   *  texturas), lamas y alféizares en S (sobresalen ~0,13 m del hueco; con espalderas, sin lamas: los barrotes hacen de lamas). c.ed = fondo del hueco (0,095 con
   *  pilastras de ladrillo). */
  KIT.openBand = function (H, S, E, xf, e, segs, z0, z1, kind, c) {
    var bx = H.bx, zm = z0 + (z1 - z0) * 0.45, lat = kind === 'lattice', step = lat ? 0.34 : 0.42, ed = c.ed || 0.012, fd = c.finD != null ? c.finD : ed + (lat ? 0.05 : 0.12);
    segs.forEach(function (sg) {
      var y0 = sg[0], y1 = sg[1]; if (y1 - y0 < 0.8) return;
      bx(E, xf - e * ed, xf - e * (ed - 0.008), y0, y1, z0, zm, c.openLo); bx(E, xf - e * ed, xf - e * (ed - 0.008), y0, y1, zm, z1, c.openHi);
      var sd = ed + 0.15;
      bx(S, xf - e * sd, xf, y0 - 0.08, y1 + 0.08, z0 - 0.12, z0, c.sill); bx(S, xf - e * sd, xf, y0 - 0.08, y1 + 0.08, z1, z1 + 0.12, c.sill);
      bx(S, xf - e * sd, xf, y0 - 0.08, y0, z0, z1, c.sill); bx(S, xf - e * sd, xf, y1, y1 + 0.08, z0, z1, c.sill);
      var n = Math.max(1, Math.round((y1 - y0) / step)), w = (y1 - y0) / n;
      for (var i = 1; fd > ed && i < n; i++) { var y = y0 + w * i; bx(S, xf - e * fd, xf, y - (lat ? 0.025 : 0.05), y + (lat ? 0.025 : 0.05), z0, z1, c.fin); }
      if (lat && fd > ed) for (var zz = z0 + step; zz < z1 - step * 0.4; zz += step) bx(S, xf - e * fd, xf, y0, y1, zz - 0.025, zz + 0.025, c.fin);
    });
  };

  /* ======================================================================== F3: lienzos de los flavors */
  /** Cenefa geométrica (flavor gulf): estrellas de 8 puntas y rombos en la tira q (12:1) del atlas. */
  KIT.friezePaint = function (g, q, cA, cB, cBg) {
    var x0 = q[0], y0 = q[1], W = q[2], Hh = q[3], n = 12, w = W / n;
    g.fillStyle = cBg; g.fillRect(x0, y0, W, Hh); g.fillStyle = shade(cA, 0.75); g.fillRect(x0, y0, W, Hh * 0.1); g.fillRect(x0, y0 + Hh * 0.9, W, Hh * 0.1);
    for (var i = 0; i < n; i++) {
      var cx = x0 + w * (i + 0.5), cy = y0 + Hh / 2, r = Hh * 0.36;
      g.fillStyle = i % 2 ? cB : cA; g.beginPath();
      for (var k = 0; k < 16; k++) { var a = k * PI / 8, rr = k % 2 ? r * 0.62 : r; g[k ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
      g.closePath(); g.fill(); g.fillStyle = cBg; g.beginPath(); g.arc(cx, cy, r * 0.28, 0, 2 * PI); g.fill();
      g.fillStyle = shade(cA, 0.7); var mx = x0 + w * (i + 1); g.beginPath(); g.moveTo(mx, cy - r * 0.5); g.lineTo(mx + r * 0.3, cy); g.lineTo(mx, cy + r * 0.5); g.lineTo(mx - r * 0.3, cy); g.closePath(); g.fill();
    }
  };
  /** Mural de mosaico (flavor east): composición abstracta (sol con rayos, ondas, balón y figuras geométricas con los colores del
   *  club) pintada en teselas de ~5 px con llaga clara. Sin personas reconocibles. */
  KIT.mosaicPaint = function (g, q, cols, seed) {
    var x0 = Math.round(q[0]), y0 = Math.round(q[1]), W = Math.round(q[2]), Hh = Math.round(q[3]), T = Math.max(4, Math.round(Hh / 14));
    var rr = seed >>> 0; function rnd() { rr = (rr * 1664525 + 1013904223) >>> 0; return rr / 4294967296; }
    var sx = W * (0.25 + 0.5 * rnd()), sy = Hh * 0.42, R = Hh * 0.3;
    g.fillStyle = '#e6e0d2'; g.fillRect(x0, y0, W, Hh);
    function colAt(px, py) {
      var dx = px - sx, dy = py - sy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d < R * 0.35) return 4;                                                     // balón
      if (d < R) return Math.floor((a + PI) / (PI / 3)) % 2 ? 0 : 1;                  // sol en gajos
      if (py > Hh * (0.72 + 0.08 * Math.sin(px / W * 9))) return 2;                   // ondas
      if (Math.floor((a + PI) / (PI / 8)) % 2 && d < R * 2.4) return 3;               // rayos
      var u = px / W, v = py / Hh;
      if (Math.abs(u - (sx / W > 0.5 ? 0.16 : 0.84)) < 0.06 && v > 0.18 && v < 0.7) return 1;   // pilar
      return 5;
    }
    for (var py = 0; py < Hh; py += T) for (var px = 0; px < W; px += T) {
      var k = colAt(px + T / 2, py + T / 2), c = cols[k % cols.length];
      g.fillStyle = mix(c, rnd() < 0.5 ? '#ffffff' : '#000000', rnd() * 0.12); g.fillRect(x0 + px, y0 + py, T - 1, T - 1);
    }
    g.fillStyle = 'rgba(240,236,228,0.9)'; g.fillRect(x0, y0, W, 2); g.fillRect(x0, y0 + Hh - 2, W, 2);
  };

  /* ======================================================================== F3: seña de H4-H7 en los fondos */
  /** La llama KIT.endSig. H4 perfil de lámina plegada (dientes simétricos de hormigón a dos tonos sobre viga de canto); H5 arco
   *  laminado de madera (tres láminas) con lamas verticales y vidrio detrás; H6 muro cortina de vidrio (montantes y travesaños; la
   *  vista de la ciudad va en el atlas, entre el vidrio y la carpintería); H7 arquería de medio punto con pilastras y cornisa. */
  KIT.endSigF3 = function (H, S, E, xf, e, o) {
    var bx = H.bx, rod = H.rod, c = o.c, z0 = o.z0, z1 = o.z1, yw = o.yw, xw = xf - e * 0.09, i, g;
    if (o.A === 'H4') {
      var n = Math.max(4, Math.round(2 * yw / 2.6)), tw = 2 * yw / n;
      bx(S, xf - e * 0.32, xf, -yw - 0.3, yw + 0.3, z0 - 0.4, z0, c.dk);
      for (i = 0; i < n; i++) {
        var ya = -yw + i * tw, ym = ya + tw / 2, yb = ya + tw;
        tri(H, S, [xw, ya, z0], [xw, ym, z1], [xw, ym, z0], c.lt); tri(H, S, [xw, ym, z0], [xw, ym, z1], [xw, yb, z0], c.dk);
        if (!o.lite) rod(S, xf - e * 0.14, ym, z0, xf - e * 0.14, ym, z1, 0.06, c.truss);
      }
      return true;
    }
    if (o.A === 'H5' || o.A === 'H2w') {
      var zS = o.zS, rise = z1 - zS, ya2 = Math.max(rise * 1.05, Math.min(yw, 7.2)), R = (ya2 * ya2 + rise * rise) / (2 * rise), zc = z1 - R, th = Math.asin(Math.min(1, ya2 / R));
      var T = 0.55, NV = o.lite ? 10 : 16, Ri = R - T, zT = z0 + 0.15;
      var P = function (r, a) { return [xw, r * Math.sin(a), zc + r * Math.cos(a)]; };
      var zi = zT - zc, yT = Ri > zi ? Math.sqrt(Ri * Ri - zi * zi) : 0;
      if (yT > 0.5 && zc + Ri > zT + 0.4) {
        var aT = Math.asin(Math.min(1, yT / Ri)), NG = 10, cen = [xf - e * 0.04, 0, zT], prev = [xf - e * 0.04, -yT, zT];
        for (g = 1; g <= NG; g++) { var ag = -aT + 2 * aT * g / NG, q = [xf - e * 0.04, Ri * Math.sin(ag), zc + Ri * Math.cos(ag)]; tri(H, E, cen, prev, q, c.glass); prev = q; }
        tri(H, E, cen, prev, [xf - e * 0.04, yT, zT], c.glass);
        bx(S, xf - e * 0.18, xf, -yT, yT, zT - 0.15, zT, c.woodD);
        var nS = Math.max(3, Math.floor(2 * yT / 0.5));
        for (var j = 1; j < nS; j++) { var ys = -yT + 2 * yT * j / nS, zt = zc + Math.sqrt(Math.max(0, Ri * Ri - ys * ys)); if (zt > zT + 0.2) bx(S, xf - e * 0.17, xf - e * 0.07, ys - 0.06, ys + 0.06, zT, zt, c.wood); }
      }
      for (var v = 0; v < NV; v++) {
        var a0 = -th + 2 * th * v / NV, a1 = -th + 2 * th * (v + 1) / NV;
        for (var l = 0; l < 3; l++) quad4(H, S, P(Ri + l * T / 3, a0), P(Ri + (l + 1) * T / 3, a0), P(Ri + (l + 1) * T / 3, a1), P(Ri + l * T / 3, a1), l === 1 ? c.woodD : c.wood);
      }
      for (var s = -1; s <= 1; s += 2) bx(S, xf - e * 0.3, xf, s * ya2 - 0.35, s * ya2 + 0.35, zS - 0.5, zS, c.steel);
      return true;
    }
    if (o.A === 'H6') {
      bx(E, xf - e * 0.05, xf - e * 0.03, -yw, yw, z0, z1, c.glass);
      var nm = Math.max(4, Math.round(2 * yw / 1.5)), nt = Math.max(1, Math.round((z1 - z0) / 1.1));
      for (i = 0; i <= nm; i++) { var y = -yw + 2 * yw * i / nm; bx(S, xf - e * 0.1, xf - e * 0.24, y - 0.05, y + 0.05, z0, z1, c.frame); }
      for (i = 0; i <= nt; i++) { var z = z0 + (z1 - z0) * i / nt; bx(S, xf - e * 0.1, xf - e * 0.22, -yw, yw, z - 0.04, z + 0.04, c.frame); }
      bx(S, xf - e * 0.26, xf, -yw - 0.2, yw + 0.2, z0 - 0.45, z0 - 0.04, c.dk);
      return true;
    }
    if (o.A === 'H7') {
      var nA = Math.max(3, Math.round(2 * yw / 2.3)), pw = 2 * yw / nA, ww = pw * 0.62, zr = z1 - ww / 2 - 0.3, NA = o.lite ? 4 : 6;
      var Q = function (yc, r, a) { return [xw, yc + r * Math.cos(a), zr + r * Math.sin(a)]; };
      bx(S, xf - e * 0.22, xf, -yw - 0.3, yw + 0.3, z1 - 0.12, z1 + 0.12, c.stone);
      bx(S, xf - e * 0.18, xf, -yw - 0.3, yw + 0.3, z0 - 0.15, z0 + 0.05, c.stone);
      for (i = 0; i < nA; i++) {
        var yc = -yw + pw * (i + 0.5), cen2 = [xf - e * 0.04, yc, zr], prev2 = [xf - e * 0.04, yc - ww / 2, zr];
        bx(E, xf - e * 0.05, xf - e * 0.03, yc - ww / 2, yc + ww / 2, z0 + 0.05, zr, c.glass);
        for (g = 1; g <= NA; g++) { var a = PI - PI * g / NA, q2 = [xf - e * 0.04, yc + ww / 2 * Math.cos(a), zr + ww / 2 * Math.sin(a)]; tri(H, E, cen2, prev2, q2, c.glass); prev2 = q2; }
        for (g = 0; g < NA; g++) { var b0 = PI - PI * g / NA, b1 = PI - PI * (g + 1) / NA; quad4(H, S, Q(yc, ww / 2, b0), Q(yc, ww / 2 + 0.22, b0), Q(yc, ww / 2 + 0.22, b1), Q(yc, ww / 2, b1), g % 2 ? c.stone : c.brick); }
        bx(S, xf - e * 0.12, xf - e * 0.06, yc - 0.03, yc + 0.03, z0 + 0.05, zr, c.frame);
      }
      for (i = 0; i <= nA; i++) { var yp = -yw + pw * i; bx(S, xf - e * 0.15, xf, yp - 0.13, yp + 0.13, z0, z1, c.stone); }
      return true;
    }
    return false;
  };

  /* ======================================================================== luces */
  /** (copiada de Can Rebot) Campana industrial colgada: carcasa en S, bombilla en E. */
  KIT.highBay = function (H, S, E, x, y, z, zTop, c) {
    H.rod(S, x, y, z + 0.2, x, y, zTop - 0.05, 0.015, c.dark);
    H.pt(S, H.BG.cone6, x, y, z, c.body, 0, 0, 0, 0.55, 0.42, 0.55);
    H.pt(S, H.BG.cyl, x, y, z + 0.25, c.dark, 0, 0, 0, 0.1, 0.12, 0.1);
    H.pt(E, H.BG.sph6, x, y, z - 0.2, c.lamp, 0, 0, 0, 0.4, 0.08, 0.4);
  };
  /** Panel LED rectangular colgado (focos de noche): marco en S, difusor en E. */
  KIT.ledPanel = function (H, S, E, x, y, z, zTop, c) {
    H.rod(S, x - 0.5, y, z + 0.06, x - 0.5, y, zTop - 0.05, 0.012, c.dark); H.rod(S, x + 0.5, y, z + 0.06, x + 0.5, y, zTop - 0.05, 0.012, c.dark);
    H.bx(S, x - 0.65, x + 0.65, y - 0.32, y + 0.32, z, z + 0.08, c.dark);
    H.bx(E, x - 0.58, x + 0.58, y - 0.26, y + 0.26, z - 0.012, z, c.lamp);
  };

  /* ======================================================================== gradas */
  /** Fuente de 5 × 7 para el mosaico de siglas de la grada (filas de arriba abajo, 5 bits). */
  var F57 = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4],
    Z: [31, 1, 2, 4, 8, 16, 31], 0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30],
    4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12]
  };
  /** Letras del mosaico: devuelve on(c, r) para una rejilla de nc columnas y 7 filas centrada (texto latino, sin tildes). */
  KIT.mosaic = function (text, nc) {
    var s = String(text || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').slice(0, Math.max(1, Math.floor((nc + 1) / 6)));
    var w = s.length * 6 - 1, c0 = Math.floor((nc - w) / 2);
    return function (cIdx, r) {
      var c = cIdx - c0; if (c < 0 || c >= w || r < 0 || r > 6) return false;
      var ch = F57[s[Math.floor(c / 6)]], b = c % 6; if (!ch || b === 5) return false;
      return !!(ch[r] & (16 >> b));
    };
  };
  /** Grada recta (telescópica de madera, de hormigón con asiento de plástico o bleacher de aluminio), copiada de la de Can Rebot
   *  y generalizada a los 4 lados. o = {side: '-y'|'+y'|'-x'|'+x', u0, u1 (a lo largo), v0 (primera fila, desde el centro),
   *  rows, rd (fondo de fila), rz (contrahuella), type, seat(r, cIdx, nCells) → Color (cada celda = 2 asientos; Color cacheado: los tramos
   *  del mismo color se funden), dark(Color) → respaldo, aisles [u],
   *  occ (ocupación 0..1), rnd, c: {deck, panel, rubber, dark, steel, nose}, lite}. Devuelve {seats, top, back}. */
  KIT.stand = function (H, S, o) {
    var bx = H.bx, rod = H.rod, c = o.c, side = o.side, isY = side === '-y' || side === '+y', sg = side.charAt(0) === '-' ? -1 : 1;
    function B(u0, u1, v0, v1, z0, z1, cc) { if (isY) bx(S, u0, u1, sg * v0, sg * v1, z0, z1, cc); else bx(S, sg * v0, sg * v1, u0, u1, z0, z1, cc); }
    function R(ua, va, za, ub, vb, zb, r, cc) { if (isY) rod(S, ua, sg * va, za, ub, sg * vb, zb, r, cc); else rod(S, sg * va, ua, za, sg * vb, ub, zb, r, cc); }
    var seats = [], u0 = o.u0, u1 = o.u1, RD = o.rd, RZ = o.rz, NR = o.rows, type = o.type, rnd = o.rnd, aisles = o.aisles || [0], AW = 0.55;
    var cell = 1.12, nCells = Math.max(1, Math.floor((u1 - u0) / cell)), sepStep = NR > 8 || o.lite ? 1.12 : 0.56;
    // tramos entre pasillos
    var cuts = aisles.filter(function (a) { return a > u0 + 1 && a < u1 - 1; }).sort(function (a, b) { return a - b; }), spans = [], a0 = u0 + 0.1;
    cuts.forEach(function (a) { spans.push([a0, a - AW]); a0 = a + AW; }); spans.push([a0, u1 - 0.1]);
    for (var r = 0; r < NR; r++) {
      var vf = o.v0 + r * RD, vb = vf + RD, zt = 0.12 + r * RZ, zs = zt + 0.42, vs = vf + 0.48;
      B(u0, u1, vf, vb, 0, zt, c.deck);
      B(u0, u1, vf - 0.004, vf + 0.05, zt - 0.05, zt + 0.004, c.panel);
      spans.forEach(function (h) {
        if (type === 'bleacher') {                      // tablón de aluminio sin respaldo y reposapiés
          B(h[0], h[1], vs - 0.17, vs + 0.17, zs - 0.05, zs, c.alu); B(h[0], h[1], vs - 0.4, vs - 0.12, zt + 0.02, zt + 0.06, c.aluD);
        } else {
          // asientos por celdas de 2 (color de la grada: liso, alterno, degradado, gris con acento o mosaico de siglas): tramos del mismo color
          var n0 = Math.floor((h[0] - u0) / cell), n1 = Math.floor((h[1] - u0) / cell), run = null, zb = zs + (type === 'concrete' ? 0.36 : 0.3);
          for (var ci = n0; ci <= n1 + 1; ci++) {
            var ua = Math.max(h[0], u0 + ci * cell), ub = Math.min(h[1], u0 + (ci + 1) * cell), cc = ci <= n1 && ub > ua + 0.02 ? o.seat(r, ci, nCells) : null;
            if (run && cc !== run.c) { B(run.a, run.b, vs - 0.19, vs + 0.19, zs - 0.06, zs, run.c); B(run.a, run.b, vs + 0.19, vs + 0.25, zs - 0.04, zb, o.dark(run.c)); run = null; }
            if (cc) { if (!run) run = { a: ua, b: ub, c: cc }; else run.b = ub; }
          }
          if (type === 'tele') B(h[0], h[1], vs - 0.14, vs - 0.1, zt, zs - 0.06, c.rubber);
          for (var sx = h[0]; sx <= h[1] + 0.01; sx += sepStep) B(sx - 0.016, sx + 0.016, vs - 0.2, vs + 0.24, zs - 0.05, zs + 0.012, c.dark);
        }
        for (var px = h[0] + 0.28; px < h[1] - 0.2; px += 0.56) {
          var p = o.occ * (1.12 - 0.035 * r) - 0.02 * Math.abs(px) / Math.max(4, (u1 - u0) / 2);
          if (rnd() < p) {
            var pu = px + (rnd() - 0.5) * 0.08, pv = vs + 0.03;
            seats.push(isY ? { x: pu, y: sg * pv, z: zs, fx: 0, fy: -sg, row: r } : { x: sg * pv, y: pu, z: zs, fx: -sg, fy: 0, row: r });
          }
        }
      });
      aisles.forEach(function (a) {                     // pasillo: medio peldaño con cantonera
        if (a <= u0 + 1 || a >= u1 - 1) return;
        B(a - AW, a + AW, vf, vf + 0.4, zt, zt + RZ / 2, c.deck); B(a - AW, a + AW, vf - 0.004, vf + 0.05, zt + RZ / 2 - 0.05, zt + RZ / 2 + 0.004, c.nose);
        B(a - AW, a + AW, vf - 0.004, vf + 0.05, zt - 0.05, zt + 0.004, c.nose);
      });
      for (var s2 = -1; s2 <= 1; s2 += 2) { var ue = s2 < 0 ? u0 : u1; B(ue - (s2 < 0 ? 0.08 : 0), ue + (s2 > 0 ? 0.08 : 0), vf, vb, 0, zt + 0.62, c.panel); }
    }
    var ztop = 0.12 + (NR - 1) * RZ, vback = o.v0 + NR * RD;
    B(u0 - 0.08, u1 + 0.08, vback, vback + 0.08, 0, ztop + 1.0, c.panel);
    if (!o.lite) {
      for (var s3 = -1; s3 <= 1; s3 += 2) R(s3 < 0 ? u0 + 0.04 : u1 - 0.04, o.v0, 0.95, s3 < 0 ? u0 + 0.04 : u1 - 0.04, vback, ztop + 0.95, 0.03, c.steel);
      aisles.forEach(function (a) { if (a > u0 + 1 && a < u1 - 1) R(a, o.v0, 1.0, a, vback, ztop + 1.0, 0.025, c.steel); });
    }
    for (var rx = u0; rx <= u1 + 0.01; rx += (u1 - u0) / Math.max(1, Math.round((u1 - u0) / 2.7))) R(rx, vback - 0.06, ztop + 1.0, rx, vback - 0.06, ztop + 1.85, 0.03, c.steel);
    R(u0, vback - 0.06, ztop + 1.85, u1, vback - 0.06, ztop + 1.85, 0.03, c.steel);
    // antepecho delante de la primera fila (hormigón y VIP; la telescópica no lo lleva)
    if (type === 'concrete') B(u0, u1, o.v0 - 0.12, o.v0, 0, 0.9, c.panel);
    return { seats: seats, top: ztop, back: vback };
  };

  /* ======================================================================== fondos y atrezo (copiados de Can Rebot) */
  /** Espalderas de madera en un fondo (xf = pared, e = ±1). */
  KIT.wallBars = function (H, S, xf, e, y0, y1, c) {
    var bx = H.bx, rod = H.rod;
    for (var y = y0; y <= y1 + 0.01; y += 0.96) bx(S, xf - e * 0.17, xf - e * 0.02, y - 0.045, y + 0.045, 0, 2.75, c.wood);
    for (var i = 0; i < 16; i++) rod(S, xf - e * 0.1, y0, 0.24 + i * 0.16, xf - e * 0.1, y1, 0.24 + i * 0.16, 0.022, c.woodL);
    bx(S, xf - e * 0.19, xf - e * 0.02, y0 - 0.05, y1 + 0.05, 2.72, 2.84, c.woodD);
  };
  /** Canasta plegada hacia el techo en un fondo. */
  KIT.basketFolded = function (H, S, xf, e, z, c) {
    var bx = H.bx, rod = H.rod, px = xf - e * 1.5;
    for (var s = -1; s <= 1; s += 2) { rod(S, xf, s * 0.75, z - 1.4, px, s * 0.75, z, 0.05, c.steel); rod(S, xf, s * 0.75, z + 1.0, px, s * 0.75, z, 0.05, c.steel); }
    rod(S, px, -0.85, z, px, 0.85, z, 0.05, c.steel);
    bx(S, px, px - e * 1.05, -0.9, 0.9, z + 0.08, z + 0.12, c.board);
    bx(S, px, px - e * 1.05, -0.92, -0.86, z + 0.06, z + 0.14, c.dark); bx(S, px, px - e * 1.05, 0.86, 0.92, z + 0.06, z + 0.14, c.dark);
    bx(S, px - e * 1.0, px - e * 1.07, -0.92, 0.92, z + 0.06, z + 0.14, c.dark);
    bx(S, px - e * 0.35, px - e * 0.8, -0.3, 0.3, z + 0.055, z + 0.075, c.orange);
    H.pt(S, H.BG.torus, px - e * 0.6, 0, z - 0.2, c.orange, 0, 0, 0, 0.23, 0.23, 0.23);
  };
  KIT.matLean = function (H, S, xf, e, y, c) { H.pt(S, H.BOX, xf - e * 0.36, y, 0.99, c.mat, 0, 0, -e * 0.2, 0.2, 2.0, 1.0); H.pt(S, H.BOX, xf - e * 0.47, y, 0.99, c.white, 0, 0, -e * 0.2, 0.02, 2.0, 1.0); };
  KIT.matPile = function (H, S, x, y, n, c) { for (var i = 0; i < n; i++) { H.bx(S, x - 1.0, x + 1.0, y - 0.5, y + 0.5, i * 0.2, i * 0.2 + 0.19, i % 2 ? c.matD : c.mat); H.bx(S, x - 1.0, x + 1.0, y - 0.51, y + 0.51, i * 0.2 + 0.08, i * 0.2 + 0.11, c.white); } };
  /** Salida de emergencia en un fondo (puerta en S, piloto verde en E). */
  KIT.exitDoor = function (H, S, E, xf, e, y, c) {
    var bx = H.bx;
    bx(S, xf - e * 0.06, xf, y - 0.95, y + 0.95, 0, 2.3, c.white); bx(S, xf - e * 0.09, xf, y - 0.85, y + 0.85, 0, 2.2, c.gray);
    bx(S, xf - e * 0.12, xf - e * 0.08, y - 0.7, y + 0.7, 1.0, 1.06, c.steel); bx(S, xf - e * 0.1, xf - e * 0.08, y - 0.01, y + 0.01, 0, 2.2, c.dark);
    bx(E, xf - e * 0.12, xf - e * 0.04, y - 0.32, y + 0.32, 2.45, 2.68, c.exit);
  };
  /** Persiana enrollable del almacén en un fondo. */
  KIT.rollerDoor = function (H, S, xf, e, y, c) {
    var bx = H.bx;
    bx(S, xf, xf - e * 0.08, y - 1.6, y + 1.6, 0, 3.15, c.white); bx(S, xf, xf - e * 0.1, y - 1.45, y + 1.45, 0, 3.0, c.gray);
    for (var z = 0.25; z < 3.0; z += 0.25) bx(S, xf, xf - e * 0.12, y - 1.45, y + 1.45, z, z + 0.035, c.slat);
  };
  /** Carcasa del marcador de pared (la pantalla va en su malla). */
  KIT.scoreHousing = function (H, S, xs, e, z, w, h, c, stripe) {
    var bx = H.bx, rod = H.rod;
    bx(S, xs - e * 0.22, xs, -w / 2 - 0.2, w / 2 + 0.2, z - h / 2 - 0.2, z + h / 2 + 0.2, c.dark);
    if (stripe) bx(S, xs - e * 0.22, xs, -w / 2 - 0.2, w / 2 + 0.2, z + h / 2 + 0.2, z + h / 2 + 0.5, stripe);
    rod(S, xs - e * 0.1, -w / 2 + 0.25, z + h / 2 + 0.5, xs - e * 0.02, -w / 2 + 0.25, z + h / 2 + 0.95, 0.02, c.steel);
    rod(S, xs - e * 0.1, w / 2 - 0.25, z + h / 2 + 0.5, xs - e * 0.02, w / 2 - 0.25, z + h / 2 + 0.95, 0.02, c.steel);
  };
  /** Escenario con telón en un fondo (jpkr): tarima de madera, embocadura y telón plisado del color del club. */
  KIT.stage = function (H, S, xf, e, w, zTop, c) {
    var bx = H.bx, d = 2.6, hz = 1.1;
    bx(S, xf - e * d, xf, -w / 2, w / 2, 0, hz, c.woodD); bx(S, xf - e * d - 0.02, xf - e * d + e * 0.02, -w / 2, w / 2, 0.1, hz - 0.05, c.wood);
    bx(S, xf - e * 0.6, xf - e * 0.3, -w / 2 - 0.6, w / 2 + 0.6, zTop - 0.9, zTop, c.frame);
    bx(S, xf - e * 0.6, xf - e * 0.3, -w / 2 - 0.6, -w / 2, hz, zTop, c.frame); bx(S, xf - e * 0.6, xf - e * 0.3, w / 2, w / 2 + 0.6, hz, zTop, c.frame);
    for (var y = -w / 2, i = 0; y < w / 2 - 0.01; y += 0.5, i++) bx(S, xf - e * (0.25 + (i % 2) * 0.12), xf - e * 0.1, y, y + 0.5, hz, zTop - 0.9, i % 2 ? c.curtain : c.curtainD);
    for (var s = -1; s <= 1; s += 2) { bx(S, xf - e * (d + 0.5), xf - e * d, s * (w / 2 - 0.7), s * (w / 2 - 0.1), 0, hz / 2, c.wood); bx(S, xf - e * (d + 1.0), xf - e * (d + 0.5), s * (w / 2 - 0.7), s * (w / 2 - 0.1), 0, hz / 4, c.wood); }
  };

  /* ---------- lateral de los vestuarios (pared y = yw; s = +1 si está en +y): copiado de Can Rebot ---------- */
  KIT.lockerDoor = function (H, S, x, yw, s, c) {
    H.bx(S, x - 0.68, x + 0.68, yw - s * 0.05, yw, 0, 2.36, c.white); H.bx(S, x - 0.56, x + 0.56, yw - s * 0.08, yw, 0, 2.24, c.door);
    H.bx(S, x + 0.36, x + 0.48, yw - s * 0.12, yw - s * 0.07, 1.0, 1.06, c.steel);
  };
  KIT.vending = function (H, S, E, x, yw, s, c) {
    var bx = H.bx, col = H.col;
    bx(S, x - 0.5, x + 0.5, yw - s * 0.85, yw, 0, 1.95, c.red); bx(S, x - 0.52, x + 0.52, yw - s * 0.87, yw, 1.95, 2.05, c.dark);
    bx(E, x - 0.44, x + 0.14, yw - s * 0.88, yw - s * 0.86, 0.8, 1.82, col('#fff4dc'));
    var dc = ['#e8504a', '#2fb6c9', '#ffc93c', '#7ad36a'];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) bx(S, x - 0.4 + j * 0.13, x - 0.31 + j * 0.13, yw - s * 0.9, yw - s * 0.88, 0.9 + i * 0.24, 1.08 + i * 0.24, col(dc[(i + j) % 4]));
    bx(S, x + 0.2, x + 0.42, yw - s * 0.88, yw - s * 0.86, 1.0, 1.6, c.dark); bx(S, x - 0.4, x + 0.12, yw - s * 0.88, yw - s * 0.86, 0.22, 0.44, c.dark);
  };
  KIT.fountain = function (H, S, x, yw, s, c) { H.bx(S, x - 0.2, x + 0.2, yw - s * 0.35, yw, 0.6, 1.0, c.white); H.bx(S, x - 0.15, x + 0.15, yw - s * 0.36, yw - s * 0.3, 0, 0.6, c.steel); };
  KIT.trophyCase = function (H, S, x, yw, s, c) {
    var bx = H.bx, pt = H.pt, col = H.col, BG = H.BG;
    bx(S, x - 1.12, x + 1.12, yw - s * 0.5, yw, 0, 2.05, c.woodD);
    bx(S, x - 1.0, x + 1.0, yw - s * 0.46, yw - s * 0.42, 0.1, 1.95, col('#2a2f3a'));
    [0.75, 1.3, 1.85].forEach(function (z, i) {
      bx(S, x - 1.0, x + 1.0, yw - s * 0.48, yw - s * 0.06, z - 0.025, z + 0.015, c.woodL);
      for (var q = 0; q < 5; q++) {
        var cx = x - 0.8 + q * 0.4 + (i % 2) * 0.12, gold = col(q % 3 ? '#e8c14a' : '#cfd6de');
        pt(S, BG.cyl, cx, yw - s * 0.27, z + 0.06, c.dark, 0, 0, 0, 0.06, 0.08, 0.06);
        pt(S, BG.cyl, cx, yw - s * 0.27, z + 0.17, gold, 0, 0, 0, 0.03, 0.14, 0.03);
        pt(S, BG.sph6, cx, yw - s * 0.27, z + 0.28, gold, 0, 0, 0, 0.09, 0.08, 0.09);
      }
    });
    bx(S, x - 1.12, x + 1.12, yw - s * 0.52, yw - s * 0.48, 1.98, 2.05, c.woodD);
  };
  KIT.corkBoard = function (H, S, x, yw, s) {
    var col = H.col; H.bx(S, x - 1.1, x + 1.1, yw - s * 0.04, yw, 1.4, 2.5, col('#b8875a'));
    ['#fff3c4', '#ffd3d8', '#cfe9ff', '#ffffff', '#d8f5c8'].forEach(function (pc, i) { H.bx(S, x - 0.95 + i * 0.42, x - 0.65 + i * 0.42, yw - s * 0.06, yw - s * 0.04, 1.6 + (i % 2) * 0.35, 2.0 + (i % 2) * 0.35, col(pc)); });
  };
  /** Reloj de pared (en una pared y = yw o, con onX, en un fondo x = yw). */
  KIT.clock = function (H, S, x, yw, s, z, c, onX) {
    if (onX) {
      H.pt(S, H.BG.cyl, yw - s * 0.05, x, z, c.dark, 0, 0, PI / 2, 0.5, 0.06, 0.5); H.pt(S, H.BG.cyl, yw - s * 0.09, x, z, c.white, 0, 0, PI / 2, 0.44, 0.04, 0.44);
      H.bx(S, yw - s * 0.13, yw - s * 0.11, x - 0.02, x + 0.02, z, z + 0.32, c.dark); H.bx(S, yw - s * 0.13, yw - s * 0.11, x, x + 0.24, z - 0.02, z + 0.02, c.dark);
      return;
    }
    H.pt(S, H.BG.cyl, x, yw - s * 0.05, z, c.dark, PI / 2, 0, 0, 0.5, 0.06, 0.5); H.pt(S, H.BG.cyl, x, yw - s * 0.09, z, c.white, PI / 2, 0, 0, 0.44, 0.04, 0.44);
    H.bx(S, x - 0.02, x + 0.02, yw - s * 0.13, yw - s * 0.11, z, z + 0.32, c.dark); H.bx(S, x, x + 0.24, yw - s * 0.13, yw - s * 0.11, z - 0.02, z + 0.02, c.dark);
  };
  KIT.extinguisher = function (H, S, x, yw, s, c) { H.pt(S, H.BG.cyl, x, yw - s * 0.14, 0.95, c.red, 0, 0, 0, 0.1, 0.5, 0.1); H.pt(S, H.BG.cyl, x, yw - s * 0.14, 1.25, c.dark, 0, 0, 0, 0.04, 0.12, 0.04); };
  /** Radiador de pared (frío). */
  KIT.radiator = function (H, S, x, yw, s, c) { for (var i = 0; i < 9; i++) H.bx(S, x - 0.6 + i * 0.15, x - 0.52 + i * 0.15, yw - s * 0.16, yw - s * 0.04, 0.25, 0.95, c.white); };

  /** (copiada de Can Rebot) Banquillos y tarima de la cámara (los suplentes, entrenadores y cámara de Palau siguen ahí). */
  KIT.benches = function (H, S, AT, c) {
    var CR0 = AT.CREW_RISER, CBY = AT.CREW_BENCH_Y, bx = H.bx;
    for (var t = 0; t < 2; t++) {
      var sx2 = t === 0 ? 1 : -1, bxc = sx2 * AT.CREW_BENCH_X, seatZ = CR0 + 0.45;
      S.cbox(3.3, 0.8, CR0, bxc - sx2 * 0.25, 10.62, CR0 / 2, c.rubber, 0.04, 0.02);
      S.cbox(2.2, 0.4, 0.06, bxc, CBY + 0.12, seatZ, c.wood, 0.03, 0.02);
      S.cbox(2.2, 0.06, 0.4, bxc, CBY + 0.36, seatZ + 0.3, c.woodD, 0.02, 0.02);
      for (var lg = -1; lg <= 1; lg += 2) bx(S, bxc + lg * 1.0 - 0.02, bxc + lg * 1.0 + 0.02, CBY - 0.06, CBY + 0.3, CR0, seatZ - 0.03, c.steel);
    }
    S.cbox(1.2, 0.8, 0.42, -2.7, -10.62, 0.21, c.rubber, 0.04, 0.02);
  };

  /* ======================================================================== atlas de rótulos (1024 × 512 de referencia) */
  /** Regiones del atlas: letrero, 8 pancartas, escudo, 5 banderines, vista de ventana, franja del fondo rival y placas. */
  KIT.ATL = {
    sign: [0, 0, 1024, 96],
    ban: [[0, 96, 256, 160], [256, 96, 512, 160], [512, 96, 768, 160], [768, 96, 1024, 160], [0, 160, 256, 224], [256, 160, 512, 224], [512, 160, 768, 224], [768, 160, 1024, 224]],
    crest: [0, 224, 128, 352], pen: [[128, 224, 192, 352], [192, 224, 256, 352], [256, 224, 320, 352], [320, 224, 384, 352], [384, 224, 448, 352]],
    view: [448, 224, 1024, 352], back: [0, 352, 1024, 448], plate1: [0, 448, 128, 480], plate2: [128, 448, 256, 480], strip: [256, 448, 1024, 480], noShoe: [0, 480, 256, 512],
    poster: [256, 480, 512, 512], arrow: [512, 480, 640, 512], frieze: [640, 480, 1024, 512]
  };
  KIT.uvOf = function (r) { return [r[0] / 1024, 1 - r[3] / 512, r[2] / 1024, 1 - r[1] / 512]; };
  /** Escudo inventado: forma × franja × inicial con los dos colores del club (en el rectángulo q del lienzo). */
  KIT.crest = function (g, q, k, cA, cB, ink, initial, shape, stripe, FONT) {
    var cx = q[0] + q[2] / 2, cy = q[1] + q[3] / 2, R = Math.min(q[2], q[3]) * 0.42;
    g.save(); g.beginPath();
    if (shape === 0) { g.moveTo(cx - R, cy - R); g.lineTo(cx + R, cy - R); g.lineTo(cx + R, cy + R * 0.1); g.quadraticCurveTo(cx + R * 0.9, cy + R * 0.85, cx, cy + R * 1.1); g.quadraticCurveTo(cx - R * 0.9, cy + R * 0.85, cx - R, cy + R * 0.1); }
    else if (shape === 1) g.arc(cx, cy, R, 0, 2 * PI);
    else if (shape === 2) { g.moveTo(cx, cy - R * 1.1); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R * 1.1); g.lineTo(cx - R, cy); }
    else { for (var i = 0; i < 6; i++) { var a = PI / 6 + i * PI / 3; g[i ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy + R * Math.sin(a)); } }
    g.closePath(); g.fillStyle = cA; g.fill(); g.clip();
    g.fillStyle = cB;
    if (stripe === 0) g.fillRect(cx - R * 0.22, cy - R * 1.2, R * 0.44, R * 2.4);
    else if (stripe === 1) g.fillRect(cx - R * 1.2, cy - R * 0.2, R * 2.4, R * 0.4);
    else { g.translate(cx, cy); g.rotate(-PI / 4); g.fillRect(-R * 0.22, -R * 1.6, R * 0.44, R * 3.2); }
    g.restore();
    g.lineWidth = 5 * k; g.strokeStyle = ink; g.stroke();
    g.fillStyle = '#ffffff'; g.strokeStyle = ink; g.lineWidth = 6 * k; fitFont(g, initial, '900', R * 1.15, R * 1.5, FONT);
    g.strokeText(initial, cx, cy + R * 0.08); g.fillText(initial, cx, cy + R * 0.08);
  };
  /** Vista exterior de ventana (ciudad, montes, palmeras, nieve, desierto o puerto) en el rectángulo q, de día o de noche. */
  KIT.viewPaint = function (g, q, view, night, rnd, wallC) {
    var x0 = q[0], y0 = q[1], W = q[2], Hh = q[3];
    var sky = g.createLinearGradient(0, y0, 0, y0 + Hh);
    if (night) { sky.addColorStop(0, '#0d1430'); sky.addColorStop(1, '#2a3058'); } else if (view === 'desert') { sky.addColorStop(0, '#7fc0ea'); sky.addColorStop(1, '#f2dcae'); }
    else if (view === 'snow') { sky.addColorStop(0, '#a9c8e4'); sky.addColorStop(1, '#e8f0f6'); } else { sky.addColorStop(0, '#7cc0f0'); sky.addColorStop(1, '#d7ecf8'); }
    g.fillStyle = sky; g.fillRect(x0, y0, W, Hh);
    function hills(col, hgt, n) { g.fillStyle = col; g.beginPath(); g.moveTo(x0, y0 + Hh); for (var i = 0; i <= n; i++) { var x = x0 + W * i / n, yy = y0 + Hh - hgt * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + rnd() * 2))); g.lineTo(x, yy); } g.lineTo(x0 + W, y0 + Hh); g.fill(); }
    if (view === 'mountains' || view === 'snow') {
      hills(night ? '#262c4a' : '#8aa3bf', Hh * 0.75, 7);
      if (view === 'snow' || !night) { g.fillStyle = night ? '#4a5378' : '#ffffff'; for (var s = 0; s < 6; s++) { var sx = x0 + W * (0.1 + s * 0.16); g.beginPath(); g.moveTo(sx - 18, y0 + Hh * 0.42); g.lineTo(sx, y0 + Hh * 0.28); g.lineTo(sx + 18, y0 + Hh * 0.42); g.fill(); } }
      hills(night ? '#1c2238' : (view === 'snow' ? '#dfe8ef' : '#7d8448'), Hh * 0.35, 11);   // (oliva: el verde #5f8a5a de antes, tras la pelota alta, la escondía; tools/balltest.js)
    } else if (view === 'desert') {
      hills(night ? '#3a3040' : '#e0b878', Hh * 0.3, 5); hills(night ? '#2a2230' : '#cf9f5f', Hh * 0.18, 4);
    } else if (view === 'palms') {
      hills(night ? '#1b2a3a' : '#7fb06a', Hh * 0.2, 6);
      for (var p = 0; p < 7; p++) {
        var px = x0 + W * (0.06 + p * 0.15 + rnd() * 0.04), base = y0 + Hh, top = y0 + Hh * (0.25 + rnd() * 0.15);
        g.strokeStyle = night ? '#141c28' : '#7a5a3a'; g.lineWidth = 5; g.beginPath(); g.moveTo(px, base); g.quadraticCurveTo(px + 8, (base + top) / 2, px + 4, top); g.stroke();
        g.fillStyle = night ? '#16242c' : '#3f8f4a'; for (var f = 0; f < 6; f++) { g.save(); g.translate(px + 4, top); g.rotate(f * PI / 3); g.fillRect(0, -3, 26, 6); g.restore(); }
      }
    } else {   // ciudad y puerto: edificios con ventanas
      var bxx = x0;
      if (view === 'harbor') { g.fillStyle = night ? '#16203a' : '#3d7aa8'; g.fillRect(x0, y0 + Hh * 0.75, W, Hh * 0.25); }
      while (bxx < x0 + W) {
        var bw = 22 + rnd() * 40, bh = Hh * (view === 'harbor' ? 0.2 + rnd() * 0.3 : 0.3 + rnd() * 0.5), by = y0 + Hh * (view === 'harbor' ? 0.75 : 1) - bh;
        g.fillStyle = night ? '#1a2036' : mix(wallC || '#c9c3b8', '#9aa6b8', rnd()); g.fillRect(bxx, by, bw - 2, bh);
        g.fillStyle = night ? 'rgba(255,214,140,0.85)' : 'rgba(255,255,255,0.35)';
        for (var wy = by + 6; wy < by + bh - 6; wy += 10) for (var wx2 = bxx + 4; wx2 < bxx + bw - 8; wx2 += 9) if (!night || rnd() < 0.4) g.fillRect(wx2, wy, 4, 5);
        bxx += bw;
      }
    }
  };
})();

/* ==========================================================================================================================
 * KIT DE PLAYA (plan «sedes-gen», F4): pintor del telón (beachSky) y props de las playas generadas (js/venue-gen-beach.js).
 * Mismas reglas que el resto del kit: NO crean mallas; escriben en la estática de la playa (B, la de Platja: toon con colores por
 * vértice) o en la emisiva de noche (E), o pintan en el lienzo del telón. Firmas f(K, B, x, y, …) con K = el kit de VB.Arena
 * (objM / part / lrod en coordenadas locales de three tras objM; B.sbox en coordenadas de la simulación).
 * Props NUEVOS: birch, olive, agave, cactus, duneGrass, reeds, jetty, buoyLine, breakwater, lighthouse, bridge, facadeRow, stripedHut,
 * strawHut, kiosk, desertTent, containerBar, lifeTower, windbreak, rock, containerStack, endStand; de noche lightTower y garland.
 * Los de Platja (palm, pine, umbrella, lounger, towel, beachBall, featherFlag, chiringuito, lifeChair, boat) siguen en K.props.
 * ========================================================================================================================== */
(function () {
  'use strict';
  var VB = window.VB; if (!VB || !VB.VenueGen || !VB.VenueGen.kit) return;
  var PI = Math.PI, TAU = PI * 2, KIT = VB.VenueGen.kit, BK = KIT.beach = {};
  var mix = KIT.mix, shade = KIT.shade;

  /* ------------------------------------------------------------------ telón (cilindro de 150 m, lienzo de Platja) */
  // paletas del telón por capa (día; la tinta de la luz lo tiñe de tarde y de noche se apaga hacia el azul de la noche)
  var SKYPAL = {
    mountain: ['#b4c8e2', '#a3bfd2'], snow: '#f4f8ff', city: ['#d8d2c6', '#c9c3b8', '#e6dfd2', '#bfc6d0', '#d9cbb8', '#c6ccd4'],
    city2: ['#e8c9a8', '#d9a98a', '#efe0c8', '#cfb8a0', '#e4d4bc'], roof: ['#d4977c', '#c98a6e', '#9aa6b6'], cliff: ['#c9b49a', '#b39c82', '#9f8a74'],
    islands: ['#9cb8b0', '#8fb0a6'], jungle: ['#5f9a6a', '#4f8a5c', '#6fae72'], dunes: ['#ead2a0', '#dfc08a', '#f2dfb4'], shore: ['#8fae9a', '#7f9f8c']
  };
  /** Pinta el telón de una playa generada. h = ayudantes del telón de arena.js (phi, land, wav, rnd, pick, hi, mode); sp = receta;
   *  o = {night, snow, fog}. phi: 0 = tierra adentro (+x), ±π = el agua (el fondo de la cámara de juego); phi > 0 es el lado y < 0.
   *  Capas de la receta (p.backdrop): mountain, city, city2, cliff, islands, jungle, dunes; y el lado del agua según el escenario
   *  (otra orilla del lago, bocana del puerto, faro de las dunas; en la plaza y el río la ciudad da toda la vuelta). */
  BK.beachSky = function (g, W, H, k, h, sp, o) {
    var p = sp.p, rnd = h.rnd, phi = h.phi, night = !!o.night, eve = !night && h.mode === 'tarde', scen = p.scen;
    var layers = String(p.backdrop || '').split('+');
    function has(l) { return layers.indexOf(l) >= 0; }
    function A(px) { return Math.abs(phi(px)); }
    function at(target) { var bx = 0, bd = 9; for (var s = 0; s < W; s += 2) { var d = Math.abs(phi(s) - target); if (d < bd) { bd = d; bx = s; } } return bx; }
    function C(c) { return night ? mix(c, '#1a2148', 0.78) : c; }
    var around = scen === 'plaza' || scen === 'river';
    function M(px) { return around ? 1 : h.land(px); }
    function profile(color, base, amp, fr, i0, step, mask) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
      for (var x = 0; x <= W; x += step) {
        var m = mask(x), hh = m > 0 ? (base + amp * (0.5 + 0.3 * h.wav(x, fr, i0) + 0.2 * h.wav(x, fr * 2.7, i0 + 1))) * m : 0;
        g.lineTo(x, H - hh * k);
      }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    // el lago queda «encerrado»: la sierra sigue, más baja, al otro lado del agua (la seña de LAKE desde la cámara de juego)
    var lakeMask = function (px) { var a = A(px); return a < 1.6 ? 1 : a < 2.0 ? 1 - (a - 1.6) / 0.4 * 0.3 : 0.7; };
    var mMask = scen === 'lake' ? lakeMask : M;
    if (has('mountain')) {
      var mh = 30 + (p.mountainH || 30) * 2.0, mc = scen === 'lake' ? ['#8eaac6', '#7a9a86'] : SKYPAL.mountain;
      profile(C(mc[0]), mh * 0.5, mh * 0.9, 4, 0, 8, mMask);
      if (o.snow) {   // cumbres nevadas (Alpes, países fríos): la parte alta de la misma sierra
        g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = C(SKYPAL.snow);
        for (var sx = 0; sx < W; sx += 4) {
          var m = mMask(sx); if (m <= 0) continue;
          var tp = (mh * 0.5 + mh * 0.9 * (0.5 + 0.3 * h.wav(sx, 4, 0) + 0.2 * h.wav(sx, 10.8, 1))) * m, cut = mh * 1.05 * m;
          if (tp > cut) g.fillRect(sx, H - tp * k, 4, (tp - cut) * k + 2 * k);
        }
        g.restore();
      }
      profile(C(mc[1]), mh * 0.3, mh * 0.42, 9, 2, 6, mMask);
    }
    if (has('jungle')) {   // selva: lomas redondas con copas (tropical), que bajan hacia el agua por los lados
      var jm = function (x) { var a = A(x); return a < 2.2 ? 1 : a < 2.75 ? 1 - (a - 2.2) / 0.55 * 0.6 : 0; };
      profile(C(SKYPAL.jungle[1]), 34, 40, 7, 3, 6, jm);
      for (var j = 0; j < (h.hi ? 280 : 140); j++) {
        var jx = rnd() * W, jmm = jm(jx); if (!jmm) continue;
        var jh = (34 + 40 * (0.5 + 0.3 * h.wav(jx, 7, 3) + 0.2 * h.wav(jx, 18.9, 4))) * jmm * k, jr = (4 + rnd() * 6) * k;
        g.fillStyle = C(h.pick(SKYPAL.jungle)); g.beginPath(); g.arc(jx, H - jh + jr * 0.4, jr, 0, TAU); g.fill();
      }
    }
    if (has('dunes')) {    // dunas: lomos suaves de arena con la cara de sombra
      // (en el desierto, las dunas grandes bajan hasta el agua a los dos lados del fondo de la cámara: la seña de DESERT)
      var dm = scen === 'desert' ? function (x) { var a = A(x); return a < 2.0 ? 1 : a < 2.55 ? 1 + (a - 2.0) / 0.55 * 1.4 : a < 2.98 ? 2.4 * (1 - Math.pow((a - 2.55) / 0.43, 1.5)) : 0; }
        : function (x) { var a = A(x); return a < 2.5 ? 1 : a < 2.95 ? 1 - (a - 2.5) / 0.45 : 0; };
      profile(C(scen === 'desert' ? '#e2b878' : SKYPAL.dunes[0]), 18, 34, 6, 4, 6, dm);
      g.fillStyle = night ? 'rgba(20,24,60,0.35)' : 'rgba(190,150,96,0.3)';
      for (var dx = 0; dx < W; dx += 6) { var dd = dm(dx); if (!dd || h.wav(dx, 6, 4) < 0.1) continue; var dh = (18 + 34 * (0.5 + 0.3 * h.wav(dx, 6, 4) + 0.2 * h.wav(dx, 16.2, 5))) * dd; g.fillRect(dx, H - dh * k, 6, dh * k * 0.55); }
      profile(C(SKYPAL.dunes[2]), 8, 14, 13, 5, 6, dm);
    }
    if (has('cliff')) {    // acantilados que cierran la cala y caen al agua a los dos lados del fondo de la cámara
      var cp = function (px) {
        var a = A(px), n = 0.5 + 0.3 * h.wav(px, 9, 0) + 0.2 * h.wav(px, 23, 1);
        if (a < 1.9) return 40 + 20 * n;
        if (a < 2.45) { var u = (a - 1.9) / 0.55; return 40 + 20 * n + u * u * (3 - 2 * u) * (52 + 18 * n); }
        if (a < 2.92) { var w2 = (a - 2.45) / 0.47; return (92 + 38 * n) * (1 - Math.pow(w2, 1.7)); }
        return 0;
      };
      g.fillStyle = C(SKYPAL.cliff[0]); g.beginPath(); g.moveTo(0, H); for (var cx = 0; cx <= W; cx += 4) g.lineTo(cx, H - cp(cx) * k); g.lineTo(W, H); g.fill();
      g.fillStyle = C(SKYPAL.cliff[2]); g.beginPath(); g.moveTo(0, H); for (var cx2 = 0; cx2 <= W; cx2 += 4) g.lineTo(cx2, H - cp(cx2) * 0.45 * k); g.lineTo(W, H); g.fill();
      g.strokeStyle = night ? 'rgba(10,12,40,0.35)' : 'rgba(120,96,74,0.35)'; g.lineWidth = 1.2 * k;
      for (var ci = 0; ci < (h.hi ? 220 : 110); ci++) { var x0 = rnd() * W, tp2 = cp(x0); if (tp2 < 30) continue; var y0 = H - tp2 * k * (0.2 + rnd() * 0.7), L = (5 + rnd() * 12) * k; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + L * 0.3, y0 + L); g.stroke(); }
      g.fillStyle = C('#7fa070');   // matorral en lo alto
      for (var cv = 0; cv < (h.hi ? 120 : 60); cv++) { var vx = rnd() * W, vt = cp(vx); if (vt < 40) continue; g.beginPath(); g.ellipse(vx, H - vt * k + 2 * k, (3 + rnd() * 4) * k, 1.6 * k, 0, 0, TAU); g.fill(); }
    }
    // ciudad (y en la plaza una segunda fila, más cálida): bloques con ventanas; de tarde y de noche, algunas encendidas
    function town(list, hmin, hmax, dens, base, lit) {
      var x0 = 0;
      while (x0 < W) {
        var w = (8 + rnd() * 20) * k, m = scen === 'lake' ? (A(x0) < 1.7 ? 1 : 0) : M(x0);
        if (m > 0.5 && rnd() < 0.35 + 0.65 * dens) {
          var hh = (hmin + rnd() * (hmax - hmin)) * k * (m < 0.9 ? 0.45 : 1);
          g.fillStyle = C(h.pick(list)); g.fillRect(x0, H - base - hh, w, hh + base);
          if (rnd() < 0.45) { g.fillStyle = C(h.pick(SKYPAL.roof)); g.beginPath(); g.moveTo(x0 - 1, H - base - hh); g.lineTo(x0 + w / 2, H - base - hh - 5 * k); g.lineTo(x0 + w + 1, H - base - hh); g.fill(); }
          if (h.hi || lit) for (var wy = H - base - hh + 4 * k; wy < H - base - 3 * k; wy += 6 * k) for (var wx = x0 + 2.5 * k; wx < x0 + w - 3 * k; wx += 5 * k) {
            var on = lit && rnd() < (night ? 0.45 : 0.25);
            g.fillStyle = on ? (rnd() < 0.8 ? '#ffd68a' : '#ffe9b8') : (night ? 'rgba(20,24,50,0.5)' : 'rgba(110,125,150,0.32)'); g.fillRect(wx, wy, 1.8 * k, 2.4 * k);
          }
        }
        x0 += w + (rnd() < 0.2 ? rnd() * 18 * k * (1.2 - dens) : 0);
      }
    }
    var cityH = 14 + (p.cityH || 30) * 0.7, base = (scen === 'lake' ? 4 : 10) * k;
    if (has('city')) town(SKYPAL.city, 10, cityH, p.cityDensity || 0.5, base, eve || night);
    if (has('city2')) town(SKYPAL.city2, 18, cityH + 20, Math.min(1, (p.cityDensity || 0.5) + 0.3), 2 * k, eve || night);
    if (has('city') || has('city2')) {   // remate: cúpula (med), minarete (golfo), pagoda (jpkr) o campanario
      var top = p.cityTop || 'belfry';
      [0.45, -0.9].slice(0, (p.cityDensity || 0) > 0.55 ? 2 : 1).forEach(function (ph) {
        var tx = at(ph), tb = H - base;
        g.fillStyle = C('#ece2cf');
        if (top === 'dome') { g.fillRect(tx - 9 * k, tb - 40 * k, 18 * k, 40 * k); g.beginPath(); g.arc(tx, tb - 40 * k, 10 * k, PI, 0); g.fill(); g.fillStyle = C('#c9a45a'); g.fillRect(tx - 1 * k, tb - 56 * k, 2 * k, 7 * k); }
        else if (top === 'minaret') {
          g.fillRect(tx - 3 * k, tb - 78 * k, 6 * k, 78 * k); g.fillRect(tx - 5 * k, tb - 56 * k, 10 * k, 3 * k);
          g.beginPath(); g.moveTo(tx - 3.5 * k, tb - 78 * k); g.lineTo(tx, tb - 90 * k); g.lineTo(tx + 3.5 * k, tb - 78 * k); g.fill();
          g.fillRect(tx + 10 * k, tb - 30 * k, 22 * k, 30 * k); g.beginPath(); g.arc(tx + 21 * k, tb - 30 * k, 11 * k, PI, 0); g.fill();
        } else if (top === 'pagoda') {
          for (var f = 0; f < 4; f++) { var fy = tb - 14 * k - f * 13 * k, fw = (20 - f * 3.5) * k; g.fillStyle = C('#d8cfc0'); g.fillRect(tx - fw / 2 + 3 * k, fy, fw - 6 * k, 13 * k); g.fillStyle = C('#5a6070'); g.beginPath(); g.moveTo(tx - fw / 2 - 4 * k, fy + 2 * k); g.lineTo(tx, fy - 4 * k); g.lineTo(tx + fw / 2 + 4 * k, fy + 2 * k); g.fill(); }
        } else { g.fillRect(tx - 4 * k, tb - 46 * k, 8 * k, 46 * k); g.fillStyle = C('#d4977c'); g.beginPath(); g.moveTo(tx - 5 * k, tb - 46 * k); g.lineTo(tx, tb - 58 * k); g.lineTo(tx + 5 * k, tb - 46 * k); g.fill(); }
      });
    }
    if (scen === 'lake') {   // la otra orilla, baja y verde (bosque), con casitas junto al agua
      profile(C('#6f9a72'), 14, 14, 11, 2, 6, function (x) { return A(x) > 1.5 ? 1 : 0; });
      profile(C(SKYPAL.shore[1]), 7, 6, 17, 3, 6, function (x) { return A(x) > 1.5 ? 1 : 0; });
      for (var lh = 0; lh < (h.hi ? 90 : 45); lh++) {
        var lx = rnd() * W; if (A(lx) < 1.9) continue;
        var lw = (3 + rnd() * 4) * k; g.fillStyle = C(rnd() < 0.5 ? '#f2ede4' : '#e9dccb'); g.fillRect(lx, H - 10 * k, lw, 4 * k);
        g.fillStyle = C('#c98a6e'); g.fillRect(lx - 0.5, H - 11 * k, lw + 1, 1.4 * k);
        if ((night || eve) && rnd() < 0.5) { g.fillStyle = '#ffd68a'; g.fillRect(lx + lw * 0.4, H - 8.6 * k, 1.2 * k, 1.4 * k); }
      }
    }
    if (has('islands') && !around) {   // islotes en el horizonte del agua, a los lados del fondo de la cámara
      [[2.62, 1], [-2.75, 0.7], [2.95, 0.45]].forEach(function (q, i) {
        var ix = at(q[0]), iw = (60 + 40 * q[1]) * k, ih = (10 + 18 * q[1]) * k;
        g.fillStyle = C(SKYPAL.islands[i % 2]); g.beginPath(); g.moveTo(ix - iw, H - 2 * k); g.quadraticCurveTo(ix - iw * 0.3, H - ih * 1.6, ix, H - ih); g.quadraticCurveTo(ix + iw * 0.4, H - ih * 0.9, ix + iw, H - 2 * k); g.fill();
      });
    }
    if (scen === 'port') {   // la bocana: escollera baja, faros rojo y verde y grúas lejanas en silueta
      g.fillStyle = C('#9aa3ad');
      for (var bx = 0; bx < W; bx += 3) { var ba = A(bx); if (ba > 2.45 && ba < 3.0) g.fillRect(bx, H - (4 + 2 * Math.sin(bx * 0.7)) * k, 3, 12 * k); }
      [[-2.98, '#e8504a'], [2.98, '#3fae49']].forEach(function (e) {
        var fx = at(e[0]); g.fillStyle = C('#f2f1ec'); g.fillRect(fx - 2 * k, H - 20 * k, 4 * k, 16 * k); g.fillStyle = e[1]; g.fillRect(fx - 2 * k, H - 16 * k, 4 * k, 3 * k);
        if (night || eve) { var gr = g.createRadialGradient(fx, H - 21 * k, 0, fx, H - 21 * k, 6 * k); gr.addColorStop(0, e[1]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(fx - 6 * k, H - 27 * k, 12 * k, 12 * k); }
      });
      g.strokeStyle = C('#93a3b4'); g.lineWidth = 2 * k;
      [2.3, -2.35].forEach(function (pp, i) { var gx = at(pp), gh = (34 + i * 6) * k, s = i ? -1 : 1; g.beginPath(); g.moveTo(gx - 5 * k, H); g.lineTo(gx - 5 * k, H - gh); g.moveTo(gx + 5 * k, H); g.lineTo(gx + 5 * k, H - gh); g.moveTo(gx - 24 * k * s, H - gh); g.lineTo(gx + 20 * k * s, H - gh); g.stroke(); });
    }
    if (scen === 'dunes') {  // faro sobre un cabo de arena
      var fx2 = at(-2.5), fb = H - 26 * k;
      g.fillStyle = C(SKYPAL.dunes[1]); g.beginPath(); g.moveTo(fx2 - 70 * k, H); g.quadraticCurveTo(fx2, fb - 6 * k, fx2 + 60 * k, H); g.fill();
      g.fillStyle = C('#f4f2ec'); g.fillRect(fx2 - 3 * k, fb - 30 * k, 6 * k, 30 * k); g.fillStyle = C('#d8423a'); g.fillRect(fx2 - 3 * k, fb - 20 * k, 6 * k, 5 * k); g.fillRect(fx2 - 3 * k, fb - 9 * k, 6 * k, 4 * k);
      g.fillStyle = night || eve ? '#fff3c4' : C('#2a3040'); g.fillRect(fx2 - 2 * k, fb - 35 * k, 4 * k, 5 * k);
    }
    // pie fundido con la bruma del horizonte
    g.globalCompositeOperation = 'source-atop';
    var fogC = night ? 'rgba(26,36,82,' : (o.fog || 'rgba(204,232,246,'), fg = g.createLinearGradient(0, H * 0.55, 0, H);
    fg.addColorStop(0, fogC + '0)'); fg.addColorStop(1, fogC + (night ? '0.8)' : around || scen === 'lake' ? '0.4)' : scen === 'desert' ? '0.45)' : '0.7)'));
    g.fillStyle = fg; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  };

  /* ------------------------------------------------------------------ vegetación */
  BK.birch = function (K, B, x, y, Ht) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * TAU, 1);
    var wh = c('#eeeae2'), dk = c('#3a3530'), lean = (rnd() - 0.5) * 0.5;
    for (var i = 0; i < 4; i++) K.lrod(B, lean * i / 4, Ht * 0.62 * i / 4, 0, lean * (i + 1) / 4, Ht * 0.62 * (i + 1) / 4, 0, 0.12 - i * 0.015, i % 2 ? dk : wh);
    K.part(B, BG.sph6, lean, Ht * 0.72, 0, c('#8cc152'), 0, 0, 0, Ht * 0.17, Ht * 0.3, Ht * 0.17);
    K.part(B, BG.sph6, lean + Ht * 0.08, Ht * 0.86, 0.3, c('#a5d16a'), 0, 0.5, 0, Ht * 0.12, Ht * 0.2, Ht * 0.12);
    K.part(B, BG.sph6, lean - Ht * 0.07, Ht * 0.6, -0.3, c('#76ad45'), 0, 1, 0, Ht * 0.12, Ht * 0.18, Ht * 0.12);
  };
  BK.olive = function (K, B, x, y, s) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * TAU, s || 1);
    var bark = c('#7a6a52');
    K.lrod(B, 0, 0, 0, 0.4, 1.5, 0.1, 0.16, bark); K.lrod(B, 0.3, 1.1, 0, -0.6, 2.0, -0.2, 0.1, bark);
    K.part(B, BG.sph6, 0.4, 2.3, 0.1, c('#7d9a5a'), 0, 0, 0, 1.4, 0.75, 1.3); K.part(B, BG.sph6, -0.6, 2.15, -0.25, c('#8fae68'), 0, 0.6, 0, 1.0, 0.6, 0.9);
    K.part(B, BG.sph6, 0.1, 2.7, 0.4, c('#6c8a4c'), 0, 0.3, 0, 0.8, 0.5, 0.75);
  };
  BK.agave = function (K, B, x, y, s) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * TAU, s || 1);
    var a = c('#7fa58a'), b = c('#6a917a');
    for (var i = 0; i < 9; i++) { var t = i / 9 * TAU, tl = 0.5 + (i % 3) * 0.28; K.part(B, BG.cone4, Math.cos(t) * 0.35, 0.4, Math.sin(t) * 0.35, i % 2 ? a : b, tl * Math.sin(t), t, -tl * Math.cos(t), 0.14, 0.95, 0.06); }
  };
  BK.cactus = function (K, B, x, y, Ht) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * TAU, 1);
    var g1 = c('#5f9a5a'), g2 = c('#4f8a4c');
    K.part(B, BG.cyl, 0, Ht / 2, 0, g1, 0, 0, 0, 0.32, Ht, 0.32); K.part(B, BG.hemi, 0, Ht, 0, g1, 0, 0, 0, 0.32, 0.3, 0.32);
    [[1, 0.45], [-1, 0.6]].forEach(function (s2) { var hy = Ht * s2[1]; K.part(B, BG.cyl, s2[0] * 0.45, hy, 0, g2, 0, 0, PI / 2, 0.2, 0.6, 0.2); K.part(B, BG.cyl, s2[0] * 0.72, hy + 0.5, 0, g2, 0, 0, 0, 0.2, 1.0, 0.2); K.part(B, BG.hemi, s2[0] * 0.72, hy + 1.0, 0, g2, 0, 0, 0, 0.2, 0.2, 0.2); });
  };
  BK.duneGrass = function (K, B, x, y, s) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * TAU, s || 1);
    var L = ['#9fb36a', '#b5c27a', '#8aa35c'];
    for (var i = 0; i < 6; i++) K.part(B, BG.cone6, (rnd() - 0.5) * 0.9, 0.4, (rnd() - 0.5) * 0.9, c(L[i % 3]), (rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4, 0.12, 0.9 + rnd() * 0.4, 0.12);
  };
  BK.reeds = function (K, B, x, y, s) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * TAU, s || 1);
    var st = c('#8aa35c'), tp = c('#6e4a2e');
    for (var i = 0; i < 9; i++) { var px = (rnd() - 0.5) * 1.6, pz = (rnd() - 0.5) * 1.6, hh = 1.4 + rnd() * 0.9; K.lrod(B, px, 0, pz, px + (rnd() - 0.5) * 0.3, hh, pz, 0.025, st); if (i % 2 === 0) K.part(B, BG.cyl, px, hh - 0.15, pz, tp, 0, 0, 0, 0.06, 0.28, 0.06); }
  };

  /* ------------------------------------------------------------------ agua: embarcadero, boyas, rompeolas, faro, puente, fachadas */
  /** Embarcadero de madera sobre pilotes desde (x0, y) agua adentro (−x), largo L, ancho w. */
  BK.jetty = function (K, B, x0, y, L, w, deckH) {
    var c = K.col, wood = c('#a77a4c'), woodD = c('#6e4a2e'), z = deckH == null ? 0.55 : deckH;
    B.sbox(L, w, 0.14, x0 - L / 2, y, z, wood);
    for (var i = 0; i <= L; i += 2.5) {
      for (var s = -1; s <= 1; s += 2) { K.objM(0, 0, 0, 1); K.lrod(B, x0 - i, -1.6, -(y + s * (w / 2 - 0.1)), x0 - i, z + 0.05, -(y + s * (w / 2 - 0.1)), 0.11, woodD, K.BGEO.cyl); }
      B.sbox(0.1, w + 0.1, 0.1, x0 - i, y, z - 0.1, woodD);
    }
    for (var j = 0.45; j < L; j += 0.9) B.sbox(0.04, w, 0.02, x0 - j, y, z + 0.075, woodD);
    for (var s2 = -1; s2 <= 1; s2 += 2) B.sbox(L * 0.6, 0.06, 0.06, x0 - L * 0.7, y + s2 * (w / 2 - 0.05), z + 0.95, wood);   // barandilla del tramo final
    for (var r = 0; r < 4; r++) for (var s3 = -1; s3 <= 1; s3 += 2) B.sbox(0.06, 0.06, 0.9, x0 - L * 0.4 - r * L * 0.2, y + s3 * (w / 2 - 0.05), z + 0.5, woodD);
  };
  /** Línea de boyas (zona de baño) de (xa, ya) a (xb, yb). */
  BK.buoyLine = function (K, B, xa, ya, xb, yb, cA, cB) {
    var c = K.col, A = c(cA || '#ff7a2a'), Bc = c(cB || '#f4f2ec'), n = Math.max(4, Math.round(Math.hypot(xb - xa, yb - ya) / 1.6));
    K.objM(0, 0, 0, 1);
    for (var i = 0; i <= n; i++) { var t = i / n; K.part(B, K.BGEO.sph6, xa + (xb - xa) * t, 0.12, -(ya + (yb - ya) * t), i % 2 ? A : Bc, 0, 0, 0, 0.24, 0.2, 0.24); }
  };
  BK.lighthouse = function (K, B, x, y, Ht, band, s) {
    var c = K.col, BG = K.BGEO; K.objM(x, y, 0, s || 1);
    var wh = c('#f4f2ec'), bd = c(band || '#d8423a'), dk = c('#2a3040');
    K.part(B, BG.cyl, 0, 0.3, 0, c('#9aa3ad'), 0, 0, 0, 1.9, 0.6, 1.9);
    for (var i = 0; i < 4; i++) K.lrod(B, 0, 0.6 + Ht * i / 4, 0, 0, 0.6 + Ht * (i + 1) / 4, 0, 0.95 - i * 0.12, i % 2 ? bd : wh, K.taperGeo((0.95 - (i + 1) * 0.12) / (0.95 - i * 0.12)));
    K.part(B, BG.cyl, 0, Ht + 0.7, 0, dk, 0, 0, 0, 1.0, 0.1, 1.0); K.part(B, BG.cyl, 0, Ht + 1.1, 0, c('#fff3c4'), 0, 0, 0, 0.42, 0.7, 0.42);
    K.part(B, BG.cone6, 0, Ht + 1.7, 0, bd, 0, 0, 0, 0.6, 0.55, 0.6);
  };
  /** Rompeolas de bloques con espaldón desde (x0, y) agua adentro, largo L, con faro al final. */
  BK.breakwater = function (K, B, x0, y, L, lightC) {
    var c = K.col, rnd = K.rnd, rk = [c('#9aa3ad'), c('#8a929c'), c('#aab2ba')], conc = c('#c9c4ba');
    B.sbox(L, 3.2, 1.6, x0 - L / 2, y, 0.3, conc);
    for (var i = 0, n = 0; i < L; i += 2.4, n++) for (var s = -1; s <= 1; s += 2) { K.objM(x0 - i - rnd(), y + s * (2.0 + rnd() * 0.5), rnd() * TAU, 1); K.part(B, K.UNIT_BOX, 0, 0.0, 0, rk[n % 3], rnd(), rnd(), rnd(), 1.6, 1.3, 1.5); }
    BK.lighthouse(K, B, x0 - L - 0.2, y, 7.5, lightC || '#e8504a', 0.75);
  };
  /** Puente de arcos sobre el río: de la orilla (x0) a la otra (x1), en y, ancho w. */
  BK.bridge = function (K, B, x0, x1, y, w, cA, cB) {
    var c = K.col, st = c(cA || '#c9b49a'), dk = c(cB || '#9f8a74'), L = Math.abs(x1 - x0), n = Math.max(2, Math.round(L / 14)), seg = L / n, z = 5.2, xm0 = Math.min(x0, x1);
    B.sbox(L + 6, w, 0.9, (x0 + x1) / 2, y, z, st); B.sbox(L + 6, w + 0.3, 0.2, (x0 + x1) / 2, y, z + 0.55, dk);
    for (var s = -1; s <= 1; s += 2) B.sbox(L + 6, 0.25, 0.8, (x0 + x1) / 2, y + s * (w / 2), z + 1.0, st);   // pretiles
    for (var i = 0; i <= n; i++) B.sbox(2.2, w, z + 2.5, xm0 + i * seg, y, (z - 2.5) / 2, dk);   // pilas (y estribos)
    for (var a = 0; a < n; a++) for (var q = 0; q < 8; q++) {   // tímpano sobre cada arco
      var t = (q + 0.5) / 8, zz = 1.2 + (z - 2.4) * Math.sin(PI * t);
      B.sbox(seg / 8 + 0.02, w - 0.1, Math.max(0.3, z - 0.45 - zz), xm0 + a * seg + seg * t, y, (z - 0.45 + zz) / 2, st);
    }
  };
  /** Fila de fachadas: frente 'x+' | 'x-' | 'y+' | 'y-' (hacia dónde mira), sobre la línea pos, a lo largo de [a0, a1]. Bloques de
   *  fmin-fmax plantas con bandas de ventanas, cornisa, balcón corrido y toldos de la planta baja (o.awn). */
  BK.facadeRow = function (K, B, face, pos, a0, a1, o) {
    var c = K.col, rnd = K.rnd, cols = o.cols, base = o.base || 0, dep = o.depth || 8, along = face[0] === 'x' ? 'y' : 'x', sg = face[1] === '+' ? 1 : -1;
    var win = c(o.win || '#4a5a70'), cor = c(o.cornice || '#efe8dc'), aw = (o.awn || []).map(c), a = a0, litC = (o.lit || ['#ffd68a', '#ffe9b8', '#ffc870']).map(c);
    function box(u0, u1, d0, d1, z0, z1, cc) {   // u: a lo largo; d: hacia dentro desde la fachada
      var lo = pos - sg * d1, hi = pos - sg * d0, xa = Math.min(lo, hi), xb = Math.max(lo, hi);
      if (along === 'y') B.sbox(xb - xa, u1 - u0, z1 - z0, (xa + xb) / 2, (u0 + u1) / 2, base + (z0 + z1) / 2, cc);
      else B.sbox(u1 - u0, xb - xa, z1 - z0, (u0 + u1) / 2, (xa + xb) / 2, base + (z0 + z1) / 2, cc);
    }
    while (a < a1 - 0.5) {
      var w = Math.min(a1 - a, 5 + rnd() * 7), fl = (o.fmin || 2) + Math.floor(rnd() * ((o.fmax || 5) - (o.fmin || 2) + 1)), hh = fl * 3.1 + 1;
      var cc = c(cols[Math.floor(rnd() * cols.length)]);
      box(a + 0.1, a + w - 0.1, 0, dep, 0, hh, cc);
      box(a, a + w, -0.15, 0.4, hh, hh + 0.35, cor);
      // ventanas: bandas oscuras; de noche (o.E), tramos encendidos en la emisiva
      for (var f = 0; f < fl; f++) {
        if (!o.E) { box(a + 0.7, a + w - 0.7, -0.04, 0.1, 1.6 + f * 3.1, 2.9 + f * 3.1, win); continue; }
        for (var wq = 0, nq = Math.max(1, Math.round((w - 1.4) / 1.6)); wq < nq; wq++) {
          var u0 = a + 0.7 + (w - 1.4) * wq / nq, u1 = a + 0.7 + (w - 1.4) * (wq + 1) / nq - 0.3;
          box(u0, u1, -0.04, 0.1, 1.6 + f * 3.1, 2.9 + f * 3.1, win);
          if (rnd() < 0.42) { var BB = B; B = o.E; box(u0 + 0.05, u1 - 0.05, -0.08, -0.05, 1.7 + f * 3.1, 2.8 + f * 3.1, litC[Math.floor(rnd() * litC.length)]); B = BB; }
        }
      }
      if (fl > 2 && rnd() < 0.35) box(a + 0.9, a + w - 0.9, -0.9, 0, 3.6, 3.75, cor);
      if (aw.length && rnd() < 0.5) box(a + 0.6, a + w - 0.6, -1.4, 0, 2.6, 2.75, aw[Math.floor(rnd() * aw.length)]);
      a += w;
    }
  };

  /* ------------------------------------------------------------------ chiringuitos, casetas y socorrista */
  BK.stripedHut = function (K, B, x, y, yaw, cA, cB, s) {
    var c = K.col, A = c(cA), Bc = c(cB), wh = c('#f4f2ec'), dk = c('#4a3a2e'); K.objM(x, y, yaw, s || 1);
    for (var i = 0; i < 6; i++) K.part(B, K.UNIT_BOX, -1 + (i + 0.5) / 3, 1.1, 0, i % 2 ? A : Bc, 0, 0, 0, 1 / 3 + 0.005, 2.2, 1.6);
    K.part(B, K.BGEO.cone4, 0, 2.55, 0, wh, 0, PI / 4, 0, 1.75, 0.7, 1.45);
    K.part(B, K.UNIT_BOX, 0, 0.95, -0.81, dk, 0, 0, 0, 0.7, 1.6, 0.03);
    K.part(B, K.UNIT_BOX, 0, 0.08, 0, c('#b98a55'), 0, 0, 0, 2.3, 0.16, 1.9);
  };
  BK.strawHut = function (K, B, x, y, yaw, cA) {
    var c = K.col, BG = K.BGEO, wood = c('#b07a46'), woodD = c('#8a5a32'), straw = c('#e2b65c'), strawD = c('#c9973f'), A = c(cA || '#e8504a'); K.objM(x, y, yaw, 1);
    K.part(B, BG.cyl, 0, 0.08, 0, woodD, 0, 0, 0, 2.6, 0.16, 2.6);
    for (var i = 0; i < 6; i++) { var t = i / 6 * TAU; K.lrod(B, Math.cos(t) * 2.2, 0.1, Math.sin(t) * 2.2, Math.cos(t) * 2.2, 2.6, Math.sin(t) * 2.2, 0.09, wood); }
    K.part(B, BG.cyl, 0, 0.6, 0, wood, 0, 0, 0, 1.4, 1.0, 1.4); K.part(B, BG.cyl, 0, 1.13, 0, woodD, 0, 0, 0, 1.6, 0.07, 1.6);
    K.part(B, BG.cone6, 0, 3.4, 0, straw, 0, 0.3, 0, 3.2, 1.8, 3.2); K.part(B, BG.cone6, 0, 2.65, 0, strawD, 0, 0.3, 0, 3.3, 0.25, 3.3);
    K.part(B, K.UNIT_BOX, 0, 2.5, -2.6, A, 0, 0, 0, 2.0, 0.5, 0.08);
  };
  BK.kiosk = function (K, B, x, y, yaw, cA, cB) {
    var c = K.col, BG = K.BGEO, A = c(cA), Bc = c(cB), wh = c('#f4f2ec'), gl = c('#5a6a80'); K.objM(x, y, yaw, 1);
    K.part(B, BG.cyl, 0, 1.2, 0, wh, 0, 0, 0, 1.7, 2.4, 1.7); K.part(B, BG.cyl, 0, 1.55, 0, gl, 0, 0, 0, 1.72, 0.8, 1.72);
    K.part(B, BG.cyl, 0, 1.12, 0, A, 0, 0, 0, 1.76, 0.12, 1.76);
    for (var i = 0; i < 8; i++) K.part(B, BG.wedge, 0, 2.15, 0, i % 2 ? A : Bc, 0, i * PI / 4, 0, 2.6, 0.9, 2.6);
    K.part(B, BG.sph6, 0, 3.05, 0, A, 0, 0, 0, 0.18, 0.18, 0.18);
    for (var t = 0; t < 3; t++) { var a = PI + (t - 1) * 0.7; K.part(B, BG.cyl, Math.cos(a) * 3.0, 0.75, Math.sin(a) * 3.0, Bc, 0, 0, 0, 0.36, 0.06, 0.36); K.lrod(B, Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0, Math.cos(a) * 3.0, 0.72, Math.sin(a) * 3.0, 0.03, wh); }
  };
  BK.desertTent = function (K, B, x, y, yaw, cA, cB, s) {
    var c = K.col, BG = K.BGEO, A = c(cA), Bc = c(cB), pole = c('#6e4a2e'); K.objM(x, y, yaw, s || 1);
    for (var i = 0; i < 3; i++) K.part(B, BG.cone4, 0, 2.0 + i * 0.12, 0, i % 2 ? A : Bc, 0, PI / 4, 0, 3.6 - i * 0.9, 1.3 - i * 0.25, 2.7 - i * 0.7);
    for (var px = -1; px <= 1; px += 2) for (var pz = -1; pz <= 1; pz += 2) K.lrod(B, px * 2.4, 0, pz * 1.8, px * 2.2, 1.4, pz * 1.7, 0.05, pole);
    K.lrod(B, 0, 0, 0, 0, 2.7, 0, 0.07, pole);
    K.part(B, K.UNIT_BOX, 0, 0.03, 0, c('#c0503a'), 0, 0, 0, 3.6, 0.05, 2.6);   // alfombra y cojines
    for (var cu = 0; cu < 3; cu++) K.part(B, K.UNIT_BOX, -1.2 + cu * 1.2, 0.18, 0.9, cu % 2 ? A : Bc, 0, 0, 0, 0.9, 0.3, 0.5);
  };
  BK.containerBar = function (K, B, x, y, yaw, cA, cB) {
    var c = K.col, A = c(cA), Ad = c(shade(cA, 0.78)), Bc = c(cB), wh = c('#f4f2ec'), dk = c('#2b2b33'); K.objM(x, y, yaw, 1);
    K.part(B, K.UNIT_BOX, 0, 1.3, 0.3, A, 0, 0, 0, 6.06, 2.6, 1.9);
    for (var r = 0; r < 12; r++) K.part(B, K.UNIT_BOX, -2.6 + r * 0.47, 1.3, 1.26, Ad, 0, 0, 0, 0.1, 2.5, 0.04);
    K.part(B, K.UNIT_BOX, 0, 1.0, -0.75, wh, 0, 0, 0, 5.4, 1.0, 0.3); K.part(B, K.UNIT_BOX, 0, 1.53, -0.8, dk, 0, 0, 0, 5.6, 0.06, 0.5);
    K.part(B, K.UNIT_BOX, 0, 2.7, -1.25, Bc, 0.5, 0, 0, 5.8, 0.05, 1.2);
    K.part(B, K.UNIT_BOX, 0, 2.95, 0.3, Bc, 0, 0, 0, 3.4, 0.5, 0.1);
  };
  /** Torre de socorrista de madera: andamio abierto con plataforma, barandilla, sombrilla y bandera (no la caseta de postal). */
  BK.lifeTower = function (K, B, x, y, yaw, cA) {
    var c = K.col, wood = c('#c8955a'), woodD = c('#8a5a32'), wh = c('#f4f2ec'), A = c(cA || '#e8504a'); K.objM(x, y, yaw, 1);
    for (var px = -1; px <= 1; px += 2) for (var pz = -1; pz <= 1; pz += 2) K.lrod(B, px * 0.9, 0, pz * 0.9, px * 0.75, 3.2, pz * 0.75, 0.07, woodD);
    for (var s = -1; s <= 1; s += 2) { K.lrod(B, s * 0.85, 0.3, -0.85, s * 0.8, 2.9, 0.8, 0.03, woodD); K.lrod(B, -0.85, 0.3, s * 0.85, 0.8, 2.9, s * 0.8, 0.03, woodD); }
    K.part(B, K.UNIT_BOX, 0, 3.25, 0, wood, 0, 0, 0, 1.9, 0.1, 1.9);
    for (var r = 0; r < 4; r++) { var a = r * PI / 2; K.part(B, K.UNIT_BOX, Math.cos(a) * 0.9, 3.75, Math.sin(a) * 0.9, wh, 0, a, 0, 0.06, 0.06, 1.8); }
    K.part(B, K.UNIT_BOX, 0, 3.6, -0.92, A, 0, 0, 0, 1.8, 0.45, 0.04);
    for (var st = 0; st < 6; st++) K.part(B, K.UNIT_BOX, 0, 0.3 + st * 0.5, 1.15 + st * 0.18, wood, 0, 0, 0, 0.7, 0.05, 0.25);
    K.lrod(B, 0.6, 3.3, 0.6, 0.6, 5.4, 0.6, 0.03, wh);
    for (var q = 0; q < 8; q++) K.part(B, K.BGEO.wedge, 0.6, 4.9, 0.6, q % 2 ? A : wh, 0, q * PI / 4, 0, 1.3, 0.5, 1.3);
    K.lrod(B, -0.8, 3.3, -0.8, -0.8, 5.8, -0.8, 0.025, c('#9aa3ad')); K.part(B, K.UNIT_BOX, -0.8 + 0.32, 5.5, -0.8, c('#3fae49'), 0, 0, 0, 0.62, 0.42, 0.02);
  };
  /** Cortavientos de lona a rayas (playas del norte), largo L. */
  BK.windbreak = function (K, B, x, y, yaw, L, cA, cB) {
    var c = K.col, A = c(cA), Bc = c(cB), pole = c('#8a5a32'), n = Math.max(3, Math.round(L / 0.5)); K.objM(x, y, yaw, 1);
    for (var i = 0; i < n; i++) K.part(B, K.UNIT_BOX, -L / 2 + (i + 0.5) * L / n, 0.6, Math.sin(i * 0.9) * 0.08, i % 2 ? A : Bc, 0, 0, 0, L / n + 0.005, 1.05, 0.02);
    for (var j = 0; j <= 3; j++) K.lrod(B, -L / 2 + j * L / 3, 0, 0, -L / 2 + j * L / 3, 1.3, 0, 0.03, pole);
  };
  BK.rock = function (K, B, x, y, s, cols) {
    var c = K.col, rnd = K.rnd, BG = K.BGEO; K.objM(x, y, rnd() * 6, 1);
    K.part(B, BG.sph6, 0, -0.2 * s, 0, c(cols[0]), 0, 0, 0.2, s * 1.3, s * 0.75, s);
    K.part(B, BG.sph6, s * 0.6, -0.1, s * 0.4, c(cols[1]), 0, 0.5, 0, s * 0.6, s * 0.5, s * 0.55);
  };
  /** Contenedores de 20 pies apilados (n a lo largo de x × m de alto) desde (x, y). */
  BK.containerStack = function (K, B, x, y, n, m, cols) {
    var c = K.col, rnd = K.rnd;
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      if (j && rnd() < 0.3) continue;
      var hx = cols[Math.floor(rnd() * cols.length)], cx = x + i * 6.2, cz = 1.3 + j * 2.6, dk = c(shade(hx, 0.78));
      B.sbox(6.06, 2.44, 2.59, cx, y, cz, c(hx));
      for (var r = 0; r < 4; r++) B.sbox(0.06, 2.5, 2.4, cx - 2.6 + r * 1.73, y, cz, dk);
    }
  };
  /** Grada de aluminio de FONDO (detrás de nuestro fondo, x > 0) de cara a la pista: rows filas entre y0 e y1. Añade los asientos. */
  BK.endStand = function (K, B, x0, y0, y1, rows, ST, seats, fill) {
    var c = K.col, rnd = K.rnd, alu = c('#c9d3de'), aluD = c('#9aa6b4'), frame = c(ST.frame), cans = ST.can.map(function (h) { return c(h); }), SW = 0.56;
    K.objM(0, 0, 0, 1);
    for (var r = 0; r < rows; r++) {
      var xc = x0 + 0.55 + r * 0.8, zs = 0.45 + r * 0.42;
      B.sbox(0.32, y1 - y0, 0.05, xc, (y0 + y1) / 2, zs - 0.025, alu); B.sbox(0.3, y1 - y0, 0.035, x0 + 0.18 + r * 0.8, (y0 + y1) / 2, zs - 0.39, aluD);
      for (var sy = y0; sy <= y1 + 0.01; sy += 3.8) K.lrod(B, xc + 0.12, 0, -sy, xc + 0.12, zs - 0.03, -sy, 0.035, frame);
      for (var si = y0 + 0.42; si < y1 - 0.3; si += SW) if (rnd() < fill) seats.push({ x: xc + 0.02, y: si + (rnd() - 0.5) * 0.12, z: zs, fx: -1, fy: 0, row: r });
    }
    var xt = x0 + 0.55 + (rows - 1) * 0.8 + 0.22, zt = 0.45 + (rows - 1) * 0.42;
    for (var ly = y0; ly <= y1 + 0.01; ly += 3.8) { K.lrod(B, x0, 0, -ly, xt, zt, -ly, 0.045, frame); K.lrod(B, xt, zt, -ly, xt, zt + 1.0, -ly, 0.03, frame); }
    K.lrod(B, xt, zt + 1.0, -y0, xt, zt + 1.0, -y1, 0.03, frame);
    var n = Math.max(4, Math.round((y1 - y0) / 1.9)), seg = (y1 - y0) / n, za = zt + 1.7;   // toldo a rayas
    for (var q = 0; q < n; q++) B.sbox(xt - x0 + 0.5, seg, 0.05, (x0 + xt) / 2, y0 + (q + 0.5) * seg, za, cans[q % cans.length]);
    [y0, y1].forEach(function (py) { K.lrod(B, x0 + 0.2, 0, -py, x0 + 0.2, za, -py, 0.04, frame); K.lrod(B, xt, zt + 1.0, -py, xt, za, -py, 0.035, frame); });
  };

  /* ------------------------------------------------------------------ noche: torres de focos y guirnalda (cuerpo en B, luz en E) */
  /** Mástil de focos con una cabeza de 2 × 3 proyectores mirando a la pista. Devuelve {halo: [[x, y, z, s]…], cone}. */
  BK.lightTower = function (K, B, E, x, y, Ht, headC) {
    var c = K.col, dark = c('#2a2d3a'), alu = c('#9aa6b4'), head = c(headC || '#f4f8ff'), dl = Math.hypot(x, y), fx = -x / dl, fy = -y / dl, yaw = Math.atan2(fx, -fy);
    K.objM(x, y, yaw, 1);
    K.lrod(B, 0, 0, 0, 0, Ht, 0, 0.22, alu, K.taperGeo(0.55)); K.part(B, K.UNIT_BOX, 0, 0.15, 0, dark, 0, 0, 0, 1.2, 0.3, 1.2);
    K.part(B, K.UNIT_BOX, 0, Ht + 0.05, 0.1, alu, 0, 0, 0, 3.2, 0.12, 0.5);
    K.lrod(B, -1.5, Ht + 0.1, 0.1, -1.5, Ht + 2.1, 0.1, 0.04, alu); K.lrod(B, 1.5, Ht + 0.1, 0.1, 1.5, Ht + 2.1, 0.1, 0.04, alu);
    var tilt = Math.atan2(Ht, dl * 0.7), out = { halo: [], cone: null }, sum = [0, 0, 0], cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (var r = 0; r < 2; r++) for (var q = 0; q < 3; q++) {
      var lx = (q - 1) * 1.0, ly = Ht + 0.6 + r * 0.75, lz = -0.1;
      K.part(B, K.UNIT_BOX, lx, ly, lz, dark, tilt, 0, 0, 0.82, 0.62, 0.32);
      var fz = lz - 0.17 * Math.cos(tilt), fyy = ly - 0.17 * Math.sin(tilt);
      K.part(E, K.UNIT_BOX, lx, fyy, fz, head, tilt, 0, 0, 0.68, 0.5, 0.03);
      // posición del foco en la simulación (objM: giro yaw alrededor del eje vertical; three z = −y)
      var tx = x + lx * cy + fz * sy, tz = -y - lx * sy + fz * cy;
      out.halo.push([tx, -tz, fyy, 0.62]); sum[0] += tx; sum[1] += -tz; sum[2] += fyy;
    }
    out.cone = { a: [sum[0] / 6, sum[1] / 6, sum[2] / 6], b: [x * 0.2, y * 0.25, 0], r0: 0.9, r1: 4.4 };
    return out;
  };
  /** Guirnalda de bombillas en catenaria entre dos puntos a altura h (cable en B, bombillas en E). Devuelve los halos. */
  BK.garland = function (K, B, E, x0, y0, x1, y1, h, sag, cols) {
    var c = K.col, cable = c('#2a2440'), L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(3, Math.round(L / 0.9)), px = x0, py = y0, pz = h, halos = [];
    K.objM(0, 0, 0, 1);
    for (var s = 1; s <= 6; s++) { var t = s / 6, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, cz = h - sag * 4 * t * (1 - t); K.lrod(B, px, pz, -py, cx, cz, -cy, 0.012, cable); px = cx; py = cy; pz = cz; }
    for (var i = 1; i < n; i++) {
      var u = i / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, z = h - sag * 4 * u * (1 - u) - 0.12;
      K.part(E, K.BGEO.sph6, x, z, -y, c(cols[i % cols.length]), 0, 0, 0, 0.08, 0.1, 0.08);
      if (i % 2 === 0) halos.push([x, y, z, 0.24]);
    }
    return halos;
  };
})();
