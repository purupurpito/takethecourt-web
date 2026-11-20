/* MAKE THE CUT — js/splat.js: sistema de diseño «materiales del vóley + toque Splatoon» (owner: ui_main). Guía: notes/splat.md
 *
 * VB.Splat pone el dibujo que el CSS solo no puede hacer bien a los componentes del bloque «SPLAT» de index.html:
 *   - .sp-btn / .sp-ticket / .sp-back → la mancha de pintura (SVG con contorno de tinta, goterón y gotas sueltas), con una forma
 *     elegida por familia (.sp-wide, .sp-sq, .sp-ticket = brochazo; por defecto, media) y semilla (data-shape="n" o su puesto entre
 *     los hermanos): una lista de botones nunca sale con la misma silueta repetida. data-sp-s="0..5" queda para la inclinación (CSS).
 *   - .sp-patch → el parche crema cosido: gajo del color de la equipación con el triángulo de jugar y costuras de balón en relieve.
 *   - .sp-pair → gotas del color de la equipación junto al parche (fila parche + sello).
 *   - .sp-stamp → el sello dorado: aro con el texto de data-ring en círculo (el contenido del botón, en medio).
 *   - Al pulsar (clic, toque, Intro o A): .sp-press (se aplasta) y salpicón de gotas del color del botón (no con «menos movimiento»).
 *   - Colores de la equipación en :root: --sp-kit (camiseta), --sp-kit-d, --sp-kit-ink (texto encima, tinta o crema), --sp-kit-ts,
 *     y --sp-alt (contraste: lima con equipaciones cálidas, rosa chicle con las verdes, naranja con las azules).
 * Coste: nada por frame. decorate() solo toca elementos sin .sp-dec; sync() compara una firma y sale si nada cambia; el salpicón es un
 * nodo que se borra a los 0,56 s. Sin componentes .sp-* en pantalla no hace nada.
 * API: VB.Splat.decorate(rootOrSelector?) · .watch(el) (MutationObserver para contenedores que se repintan con innerHTML) ·
 *      .setKit(0xRRGGBB) · .sync() (equipación de Ajustes o del club de la Carrera activa) · .kit() · .reduced() · .splash(el, ev?) ·
 *      .press(el) · .ICONS (SVG de iconos de la casa) · .BALL (SVG del balón).
 * Móvil (18-nov-2026, notes/splat.md «Móvil»): .PHONE_MQ · .phone() (html.ph) · evento «vb:ph» · .more(el) · .reveal(el, o) ·
 *      .fitSeg(root) · .sheet(o) / .closeTop() / .sheetOpen() / .sheetEl() · .modal(el) · .info(root) · .tbl(el) · .shorten(root) ·
 *      .toast(html, o) · .kbd() (solo, al cargar).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var doc = document;

  // ---------------------------------------------------------------- formas (viewBox propio; preserveAspectRatio none + trazo sin escalar)
  // cada forma: d = contorno con su goterón; o = gotas sueltas [x, y, r] (fuera del contorno, se ven como salpicaduras)
  var SH = {
    mid: { vb: '0 0 160 80', s: [
      { d: 'M18 12C45 4 80 10 110 6C135 3 152 14 150 32C149 46 156 58 146 66C134 76 110 70 96 72C96 77 98 80 98 84C98 90 84 90 84 84C84 80 85 77 85 72C60 74 40 76 22 70C6 64 10 50 8 38C6 24 6 16 18 12Z', o: [[157, 12, 2.6], [4, 72, 2.2]] },
      { d: 'M14 16C38 6 70 12 104 8C132 5 154 10 152 30C151 44 148 56 152 64C146 76 124 72 104 73C84 74 64 70 52 73C52 78 54 81 54 85C54 91 40 91 40 85C40 81 41 78 41 73C26 74 10 72 9 58C8 46 4 30 14 16Z', o: [[157, 32, 2.6], [4, 54, 2.2]] },
      { d: 'M20 10C44 8 76 4 108 9C136 13 150 8 152 28C153 42 158 52 150 64C142 74 128 70 116 72C116 77 118 81 118 85C118 91 104 91 104 85C104 81 105 77 105 72C80 74 52 76 30 72C10 68 6 56 9 42C11 30 4 14 20 10Z', o: [[157, 52, 2.6], [4, 36, 2.2]] },
      { d: 'M16 14C40 6 74 12 106 7C134 3 152 12 151 30C150 44 154 56 148 66C140 76 120 72 100 73C80 74 62 70 46 73C46 78 48 81 48 85C48 91 34 91 34 85C34 81 35 78 35 73C20 73 8 70 8 56C8 44 6 22 16 14Z', o: [[4, 10, 2.4], [156, 74, 2.4]] }
    ] },
    wide: { vb: '0 0 300 100', s: [
      { d: 'M30 14C60 4 95 12 130 8C170 3 205 10 240 6C268 3 290 14 288 34C286 50 296 62 284 76C274 88 250 82 228 84C229 92 232 97 232 103C232 111 210 111 210 103C210 97 212 92 212 85C180 88 140 82 100 86C97 90 98 92 98 95C98 101 84 101 84 95C84 92 85 90 85 86C60 88 40 90 24 82C8 74 14 58 10 44C6 28 12 18 30 14Z', o: [[296, 22, 4], [5, 90, 3], [262, 96, 2.5]] },
      { d: 'M22 18C50 6 92 14 128 10C168 6 200 4 238 9C266 12 292 10 290 36C289 52 284 64 288 76C282 90 256 84 236 86C200 88 172 84 150 87C149 95 152 101 152 107C152 115 132 115 132 107C132 101 134 95 134 88C104 90 70 84 46 88C26 92 10 84 12 66C13 52 6 44 9 32C11 22 14 20 22 18Z', o: [[4, 12, 3.5], [296, 92, 3], [180, 98, 2]] },
      { d: 'M26 12C60 8 96 4 132 9C170 13 206 6 244 10C270 12 292 18 290 38C289 54 294 66 286 78C276 88 252 84 230 86C200 88 170 84 140 87C110 89 80 85 62 88C62 94 64 98 64 103C64 111 44 111 44 103C44 98 46 94 46 89C30 90 14 86 10 72C6 58 12 46 9 32C7 20 12 14 26 12Z', o: [[296, 60, 3.4], [8, 6, 2.6], [120, 97, 2.2]] }
    ] },
    sq: { vb: '0 0 100 100', s: [
      { d: 'M18 10C34 4 62 8 80 9C94 10 96 24 94 40C92 54 97 68 90 80C84 88 72 86 64 87C64 91 66 94 66 97C66 102 56 102 56 97C56 94 57 91 57 88C42 89 26 92 14 86C4 80 6 66 5 52C4 36 4 16 18 10Z', o: [[98, 8, 2.6], [3, 94, 2.2]] },
      { d: 'M12 16C28 6 50 10 72 6C90 4 96 16 95 32C94 48 90 60 94 74C92 88 78 88 66 88C52 89 40 86 34 89C34 94 36 97 36 100C36 105 26 105 26 100C26 97 27 94 27 89C16 89 6 86 7 70C8 56 3 40 5 28C6 20 8 18 12 16Z', o: [[3, 8, 2.6], [98, 92, 2.4]] },
      { d: 'M16 8C36 9 56 3 78 8C92 11 96 20 94 36C93 50 98 62 92 76C88 86 80 86 76 87C76 92 78 96 78 99C78 104 68 104 68 99C68 96 69 92 69 88C50 90 30 92 16 88C6 84 4 72 6 58C8 44 2 20 16 8Z', o: [[98, 40, 2.6], [2, 30, 2]] }
    ] },
    brush: { vb: '0 0 400 100', s: [
      { d: 'M14 22C80 10 160 18 240 12C300 8 360 14 390 20C398 40 392 60 396 78C340 86 280 80 222 86C222 94 225 99 225 105C225 113 204 113 204 105C204 99 206 94 206 87C150 90 80 84 18 82C8 64 16 42 14 22Z', o: [[397, 10, 3], [6, 92, 3], [300, 97, 2.2]] },
      { d: 'M10 18C70 14 150 8 230 14C300 18 350 10 392 16C398 36 390 58 394 80C350 88 300 82 250 86C200 90 150 84 120 87C120 94 123 99 123 104C123 112 102 112 102 104C102 99 104 94 104 88C70 88 40 86 14 84C6 62 14 40 10 18Z', o: [[6, 8, 3], [396, 92, 2.6], [200, 98, 2]] }
    ] }
  };
  var TILT = 6;   // semillas de inclinación: data-sp-s 0..5 (el CSS las traduce a grados)

  // ---------------------------------------------------------------- piezas SVG de la casa
  var SEAM = '<path d="M12 12C12 8 10.5 4.5 8 2.8"/><path d="M13.8 2.2C16.5 5.5 17.8 9.5 17.3 13.8"/>';
  var SEAMS = '<g>' + SEAM + '<g transform="rotate(120 12 12)">' + SEAM + '</g><g transform="rotate(240 12 12)">' + SEAM + '</g></g>';
  var PANEL = 'M12 12C12 8 10.5 4.5 8 2.8A10 10 0 0 1 13.8 2.2C16.5 5.5 17.8 9.5 17.3 13.8C16 13.9 13.7 13 12 12Z';
  /** Balón turquesa y crema con tinta (sello, entrada de Carrera sin club). Colores por CSS: .b0 .b1 .b2 .bs .b3 (bloque SPLAT). */
  var BALL = '<svg class="sp-ball" viewBox="1.4 1.4 21.2 21.2" aria-hidden="true" focusable="false"><circle class="b0" cx="12" cy="12" r="10"/><path class="b1" d="' + PANEL + '"/>' +
    '<path class="b2" d="' + PANEL + '" transform="rotate(120 12 12)"/><g class="bs">' + SEAMS + '</g><circle class="b3" cx="12" cy="12" r="10"/></svg>';
  /** Iconos sólidos de 24×24 (heredan currentColor por CSS: .sp-ic svg). */
  var ICONS = {
    tut: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm.1 13.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12.2 5.6c-2.3 0-3.9 1.3-4.1 3.4l2.4.3c.1-.9.7-1.5 1.6-1.5.9 0 1.5.5 1.5 1.3 0 .6-.3 1-1.2 1.6-1.2.8-1.7 1.6-1.7 2.9v.4h2.4v-.3c0-.7.2-1 1.1-1.6 1.2-.8 1.9-1.7 1.9-3 0-2-1.6-3.5-3.9-3.5z"/></svg>',
    ctl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 6.5h9.6c2.9 0 4.5 2.4 5.1 6.3.5 3.2-.4 5-2 5-1.3 0-2.2-1.2-3.3-2.6-.4-.5-.8-.7-1.4-.7H8.8c-.6 0-1 .2-1.4.7-1.1 1.4-2 2.6-3.3 2.6-1.6 0-2.5-1.8-2-5 .6-3.9 2.2-6.3 5.1-6.3zM7 9v1.6H5.4v1.8H7V14h1.8v-1.6h1.6v-1.8H8.8V9zm9.6.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm-1.9 2.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg>',
    set: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.2 0 1.8l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.8a6 6 0 0 1 0-1.8l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" transform="translate(0 1.2) scale(1 .95)"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    trophy: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 8h32v12c0 12-7 19-16 20-9-1-16-8-16-20zM16 12H8v6c0 7 4 11 9 12l1-4c-4-1-6-4-6-8v-2h4zM48 12h8v6c0 7-4 11-9 12l-1-4c4-1 6-4 6-8v-2h-4zM28 39h8v9h-8zM20 48h24l2 8H18z"/></svg>',
    cone: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 12h8l3.1 11H20.9zM19.8 27h16.4l2.5 9H17.3zM16.2 40h23.6l2.2 8H14zM8 50h40v5H8z"/><circle cx="50" cy="17" r="9"/></svg>'
  };
  var PATCH = '<svg class="sp-pp" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<path class="f" d="M0 0H78C60 30 60 70 78 100H0z"/><path class="s" d="M70 5C55 34 55 66 70 95"/><path class="e" d="M78 0C60 30 60 70 78 100"/></svg>' +
    '<span class="sp-tri" aria-hidden="true">' + ICONS.play + '</span>' +
    '<svg class="sp-emb" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + SEAMS + '<circle cx="12" cy="12" r="10"/></svg>';

  // ---------------------------------------------------------------- decorar
  var SEL = '.sp-btn,.sp-ticket,.sp-back,.sp-patch,.sp-stamp,.sp-pair';
  var ringN = 0;
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function fam(b) {
    var f = b.getAttribute('data-sp-fam');
    if (f && SH[f]) return f;
    var c = b.classList;
    return c.contains('sp-ticket') ? 'brush' : c.contains('sp-wide') ? 'wide' : c.contains('sp-sq') ? 'sq' : 'mid';
  }
  /** Semilla: data-shape (entero) o el puesto entre los hermanos con mancha más un poco del id (dos listas no empiezan igual). */
  function seed(b) {
    var a = b.getAttribute('data-shape');
    if (a != null && a !== '' && isFinite(+a)) return Math.abs(+a | 0);
    var p = b.parentNode, i = 0;
    if (p) for (var n = p.firstElementChild; n && n !== b; n = n.nextElementSibling) if (n.classList && (n.classList.contains('sp-btn') || n.classList.contains('sp-ticket'))) i++;
    return i + (b.id ? hash(b.id) % 3 : 0);
  }
  function blobSVG(f, k) {
    var F = SH[f], S = F.s[k % F.s.length];
    var c = S.o.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + q[2] + '"/>'; }).join('');
    return '<svg class="sp-blob" viewBox="' + F.vb + '" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g class="sp-f"><path d="' + S.d + '"/>' + c + '</g></svg>';
  }
  function decorateOne(b) {
    if (!b || !b.classList || b.classList.contains('sp-dec')) return;
    var c = b.classList;
    if (c.contains('sp-pair')) {
      b.insertAdjacentHTML('afterbegin', '<svg class="sp-drops" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="10" cy="30" r="6"/><circle cx="24" cy="36" r="3"/><circle cx="3" cy="16" r="2.4"/></svg>');
    } else if (c.contains('sp-patch')) {
      b.insertAdjacentHTML('afterbegin', PATCH);
    } else if (c.contains('sp-stamp')) {
      var id = 'spRing' + (++ringN), t = b.getAttribute('data-ring') || 'RETO DEL DÍA ★ RETO DEL DÍA ★';
      b.insertAdjacentHTML('afterbegin', '<svg class="sp-st" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs><path id="' + id + '" d="M50 50m-34.5 0a34.5 34.5 0 1 1 69 0a34.5 34.5 0 1 1-69 0"/></defs>' +
        '<circle class="st0" cx="50" cy="50" r="46"/><circle class="st1" cx="50" cy="50" r="41"/>' +
        '<text class="st2"><textPath href="#' + id + '" textLength="214" lengthAdjust="spacing">' + esc(t) + '</textPath></text><circle class="st3" cx="50" cy="50" r="25"/></svg>');
    } else {
      var s = seed(b);
      b.insertAdjacentHTML('afterbegin', blobSVG(fam(b), s));
      if (!b.hasAttribute('data-sp-s')) b.setAttribute('data-sp-s', String(s % TILT));
    }
    c.add('sp-dec');
  }
  /** Decora los componentes de root (elemento, selector o documento) que aún no lo estén. Devuelve cuántos ha decorado. */
  function decorate(root) {
    var r = typeof root === 'string' ? doc.querySelector(root) : root || doc, n = 0;
    if (!r) return 0;
    if (r.matches && r.matches(SEL)) { if (!r.classList.contains('sp-dec')) { decorateOne(r); n++; } }
    var L = r.querySelectorAll ? r.querySelectorAll(SEL) : [];
    for (var i = 0; i < L.length; i++) if (!L[i].classList.contains('sp-dec')) { decorateOne(L[i]); n++; }
    if (r.querySelectorAll) shorten(r);   // (móvil: textos cortos [data-ph-short])
    return n;
  }
  /** Para contenedores que se repintan con innerHTML (Carrera, listas): decora lo que entra. Un observador por contenedor. */
  function watch(el) {
    if (typeof el === 'string') el = doc.querySelector(el);
    if (!el || el._spW || typeof MutationObserver === 'undefined') return;
    el._spW = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) { var a = ms[i].addedNodes[j]; if (a.nodeType === 1) decorate(a); }
    });
    el._spW.observe(el, { childList: true, subtree: true });
    decorate(el);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- movimiento: aplastar y salpicar
  var mqRM = null; try { mqRM = matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { }
  /** Menos movimiento: el ajuste del juego (main.js ctx.reduceMotion) o, sin él, lo que pida el sistema. */
  function reduced() { var c = VB.ctx; if (c && typeof c.reduceMotion === 'boolean') return c.reduceMotion; return !!(mqRM && mqRM.matches); }
  function press(b) {
    if (!b || !b.classList) return;
    b.classList.remove('sp-press'); void b.offsetWidth; b.classList.add('sp-press');
    clearTimeout(b._spP); b._spP = setTimeout(function () { b.classList.remove('sp-press'); }, 200);
  }
  /** Salpicón: 9 gotas del color del botón (--sp-c) que salen del dedo (o del centro con Intro / A) y se secan en 0,5 s. */
  function splash(b, ev) {
    if (!b || reduced() || !b.getBoundingClientRect) return;
    var r = b.getBoundingClientRect(); if (!r.width) return;
    var x = ev && ev.clientX ? ev.clientX : r.left + r.width / 2, y = ev && ev.clientY ? ev.clientY : r.top + r.height / 2;
    var g = '', n = 9, rot = (hash(b.id || b.className) % 40) + (Date.now() % 37);
    for (var i = 0; i < n; i++) { var a = (i / n) * 360 + rot, d = 26 + (i % 3) * 9, rr = i % 3 === 0 ? 6 : i % 2 ? 4.6 : 5.4; g += '<circle r="' + rr + '" style="--a:' + a.toFixed(1) + 'deg;--d:' + d + 'px"/>'; }
    var sp = doc.createElement('i'); sp.className = 'sp-splash'; sp.setAttribute('aria-hidden', 'true');
    sp.innerHTML = '<svg viewBox="-60 -60 120 120">' + g + '</svg>';
    sp.style.left = x + 'px'; sp.style.top = y + 'px';
    var cs = getComputedStyle(b), c = (cs.getPropertyValue('--sp-c') || '').trim(); if (c) sp.style.setProperty('--c', c);
    (doc.getElementById('app') || doc.body).appendChild(sp);
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 560);
  }
  // clic (ratón, toque, o Intro / A, que llaman a click() sin :active): aplasta y salpica. El parche y el sello solo se hunden.
  doc.addEventListener('click', function (e) {
    var t = e.target, b = t && t.closest ? t.closest('.sp-btn,.sp-ticket,.sp-back,.sp-patch,.sp-stamp,.sp-tab,.sp-chip-btn') : null;
    if (!b || b.disabled) return;
    press(b);
    if (!b.classList.contains('sp-patch') && !b.classList.contains('sp-stamp') && !b.classList.contains('sp-tab') && !b.classList.contains('sp-quiet')) splash(b, e.detail ? e : null);
  }, true);

  // ---------------------------------------------------------------- colores de la equipación
  function hex(n) { return '#' + ('000000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function mix(a, b, t) {
    var r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }
  var kitNow = -1;
  /** Pinta los tokens de la equipación en :root (para menús, paneles, hojas y la Carrera a la vez). Sale si no cambia. */
  function setKit(kit) {
    kit = (kit >>> 0) & 0xffffff;
    if (kit === kitNow) return false;
    kitNow = kit;
    var R = doc.documentElement.style, cr = (kit >> 16) & 255, cg = (kit >> 8) & 255, cb = kit & 255, lum = cr * 0.3 + cg * 0.59 + cb * 0.11, light = lum > 170;
    R.setProperty('--sp-kit', hex(kit));
    R.setProperty('--sp-kit-d', hex(mix(kit, 0x15102a, 0.45)));
    R.setProperty('--sp-kit-ink', light ? '#15102a' : '#fff6e4');
    R.setProperty('--sp-kit-ts', light ? 'none' : '2px 2px 0 #15102a');
    // contraste: lima con equipaciones cálidas, rosa chicle con las verdes, naranja con las azules (siempre con texto de tinta)
    R.setProperty('--sp-alt', cg > cr && cg >= cb ? '#ff4fa3' : cb > cr && cb > cg ? '#ff9a1f' : '#a6ea2c');
    return true;
  }
  /** Color de camiseta que manda: el del club de la Carrera activa (si hay jugador) o el de Ajustes · Equipación. */
  function kitOf() {
    var c = VB.ctx, st = (c && c.settings) || {}, kit = typeof st.kitShirt === 'number' ? st.kitShirt : 0xff5a2c;
    try {
      var C = VB.Career, cr = C && C.get ? C.get() : null;
      if (cr && cr.player && C.myClub) { var k = C.myClub(cr); if (k && k.kit && typeof k.kit.shirt === 'number') kit = k.kit.shirt; }
    } catch (e) { }
    return kit;
  }
  function sync() { try { return setKit(kitOf()); } catch (e) { return false; } }

  // ================================================================ MÓVIL (fundación, 18-nov-2026; notes/splat.md «Móvil»)
  // html.ph = móvil apaisado (lo pone el <script> del <head> antes del primer pintado; aquí se repite al girar o cambiar de tamaño).
  // Nada por frame: escuchas de scroll pasivas, ResizeObserver / MutationObserver y teclas solo con una hoja abierta.
  var PHONE_MQ = '(max-height:500px) and (min-aspect-ratio:5/4)';
  var RT = doc.documentElement;
  if (typeof window.__phTier !== 'function') {   // (sin el <script> del <head>: páginas sueltas, pruebas)
    window.__phTier = function () {
      var q = /[?&]ph=([01])/.exec(location.search), on = q ? q[1] === '1' : !!(window.matchMedia && matchMedia(PHONE_MQ).matches);
      RT.classList.toggle('ph', on); RT.classList.toggle('ph-s', on && innerHeight <= 345); RT.classList.toggle('ph-w', on && innerWidth >= 800);
      return on;
    };
  }
  function phone() { return RT.classList.contains('ph'); }
  var phPrev = null, phRaf = 0;
  // Dos avisos en document, ambos con detail {ph, s, w, flip}:
  //  · «vb:tier» cuando cambia CUALQUIERA de las tres clases (ph, ph-s, ph-w). A 667×375 la barra del navegador sube y baja innerHeight
  //    por encima y por debajo de 345: las variantes .ph-s que monta el JS (endRecap, Controles…) se rehacen con este. Barato e idempotente.
  //  · «vb:ph» solo cuando entra o sale el tier (ph). Lo escuchan pantallas que se repintan enteras (cuenta, sala online, Carrera): si
  //    saltara con ph-s, la barra del navegador les borraría lo que estás escribiendo.
  function tierKey() { var c = RT.classList; return (c.contains('ph') ? 'p' : '') + (c.contains('ph-s') ? 's' : '') + (c.contains('ph-w') ? 'w' : ''); }
  function tier() {
    phRaf = 0;
    try { window.__phTier(); } catch (e) { }
    var k = tierKey();
    if (phPrev === null) { phPrev = k; return; }
    if (k === phPrev) return;
    var flip = (phPrev.charAt(0) === 'p') !== (k.charAt(0) === 'p'), c = RT.classList;
    phPrev = k;
    var d = { ph: c.contains('ph'), s: c.contains('ph-s'), w: c.contains('ph-w'), flip: flip };
    try { doc.dispatchEvent(new CustomEvent('vb:tier', { detail: d })); } catch (e) { }
    if (flip) try { doc.dispatchEvent(new CustomEvent('vb:ph', { detail: d })); } catch (e) { }
  }
  function tierSoon() { if (!phRaf) phRaf = (window.requestAnimationFrame || setTimeout)(tier); }
  try { var mqPh = matchMedia(PHONE_MQ); if (mqPh.addEventListener) mqPh.addEventListener('change', tierSoon); else if (mqPh.addListener) mqPh.addListener(tierSoon); } catch (e) { }
  window.addEventListener('resize', tierSoon);
  window.addEventListener('orientationchange', tierSoon);
  tier();
  /** Lo que se rehace al cambiar de tier (fitSeg, tbl, shorten): una función por raíz, idempotente. */
  var phHooks = [];
  doc.addEventListener('vb:ph', function () { for (var i = 0; i < phHooks.length; i++) { try { phHooks[i](); } catch (e) { } } });
  function onTier(key, fn) { for (var i = 0; i < phHooks.length; i++) if (phHooks[i]._k === key) return; fn._k = key; phHooks.push(fn); }
  function tog(e, c, on) { if (e.classList.contains(c) !== !!on) e.classList.toggle(c, !!on); }
  function $el(x) { return typeof x === 'string' ? doc.querySelector(x) : x; }
  function mk(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function raf(fn) { return (window.requestAnimationFrame || setTimeout)(fn); }

  /** Señales de «hay más»: .sp-more (queda algo abajo), .sp-less (desplazado: desvanecido arriba), .sp-more-x (queda algo a la derecha).
   *  Escucha pasiva de scroll + ResizeObserver + MutationObserver (contenido repintado). Idempotente: otra llamada solo vuelve a medir. */
  function more(el) {
    el = $el(el); if (!el || !el.classList) return el;
    if (el._spM) { el._spM(); return el; }
    var q = 0;
    var f = function () {
      var sh = el.scrollHeight, ch = el.clientHeight, sw = el.scrollWidth, cw = el.clientWidth, y = ch > 0 && sh - ch > 8, x = cw > 0 && sw - cw > 8;
      tog(el, 'sp-more', y && el.scrollTop + ch < sh - 8);
      tog(el, 'sp-less', y && el.scrollTop > 8);
      tog(el, 'sp-more-x', x && el.scrollLeft + cw < sw - 8);
    };
    var soon = function () { if (!q) q = raf(function () { q = 0; f(); }); };
    el._spM = f;
    el.addEventListener('scroll', soon, { passive: true });
    try { if (typeof ResizeObserver !== 'undefined') new ResizeObserver(soon).observe(el); } catch (e) { }
    try { if (typeof MutationObserver !== 'undefined') new MutationObserver(soon).observe(el, { childList: true, subtree: true }); } catch (e) { }
    f();
    return el;
  }
  function scrollParent(el, axis) {
    for (var p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
      var cs = getComputedStyle(p), o = axis === 'x' ? cs.overflowX : cs.overflowY;
      if (/(auto|scroll)/.test(o) && (axis === 'x' ? p.scrollWidth > p.clientWidth + 1 : p.scrollHeight > p.clientHeight + 1)) return p;
    }
    return null;
  }
  /** Lleva «tu» elemento a la vista DENTRO de su contenedor desplazable (nunca mueve la página): o = {block:'center'|'start'|'nearest',
   *  inline:'center'|'nearest', smooth}. Al abrir una pantalla: tu fila de la tabla, el próximo partido, la opción elegida, la pestaña. */
  function reveal(el, o) {
    el = $el(el); if (!el || !el.getBoundingClientRect) return false;
    o = o || {};
    var b = o.block || 'center', moved = false, beh = o.smooth && !reduced() ? 'smooth' : 'auto';
    var py = scrollParent(el, 'y');
    if (py) {
      var pr = py.getBoundingClientRect(), r = el.getBoundingClientRect(), top = r.top - pr.top + py.scrollTop, t;
      if (b === 'start') t = top - 12;
      else if (b === 'nearest') t = r.top < pr.top ? top - 12 : r.bottom > pr.bottom ? top + r.height - py.clientHeight + 12 : py.scrollTop;
      else t = top - (py.clientHeight - r.height) / 2;
      t = Math.max(0, Math.min(py.scrollHeight - py.clientHeight, t));
      if (Math.abs(t - py.scrollTop) > 1) { try { py.scrollTo({ top: t, behavior: beh }); } catch (e) { py.scrollTop = t; } moved = true; }
    }
    var px = scrollParent(el, 'x');
    if (px) {
      var qr = px.getBoundingClientRect(), s = el.getBoundingClientRect(), left = s.left - qr.left + px.scrollLeft, u;
      u = (o.inline || 'center') === 'nearest' ? (s.left < qr.left ? left - 8 : s.right > qr.right ? left + s.width - px.clientWidth + 8 : px.scrollLeft) : left - (px.clientWidth - s.width) / 2;
      u = Math.max(0, Math.min(px.scrollWidth - px.clientWidth, u));
      if (Math.abs(u - px.scrollLeft) > 1) { try { px.scrollTo({ left: u, behavior: beh }); } catch (e) { px.scrollLeft = u; } moved = true; }
    }
    return moved;
  }

  // ---------------------------------------------------------------- fitSeg: segmentado → interruptor o selector según el número de opciones
  var YESNO = /^(sí|si|no|on|off|activado|desactivado)$/i, YES = /^(sí|si|on|activado)$/i;
  var ARR = { l: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>', r: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>' };
  function segSpans(s) { return Array.prototype.filter.call(s.children, function (c) { return c.tagName === 'SPAN'; }); }
  function segMode(s, L) {
    var f = s.getAttribute('data-ph-ctl');
    if (f === 'seg' || f === 'select' || f === 'toggle') return f;
    if (L.length === 2 && YESNO.test(L[0].textContent.trim()) && YESNO.test(L[1].textContent.trim())) return 'toggle';
    if (L.length >= 4) return 'select';
    // 2-3 opciones con texto: segmentado si cabe en su sitio (el ancho del padre, sin desbordar)
    var p = s.parentElement;
    if (p && s.offsetWidth && (s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().right > p.getBoundingClientRect().right + 1)) return 'select';
    return 'seg';
  }
  function segOn(L) { for (var i = 0; i < L.length; i++) if (L[i].classList.contains('on') || L[i].getAttribute('aria-checked') === 'true') return i; return 0; }
  function segPaint(s) {
    var x = s._phx; if (!x) return;
    var L = segSpans(s), i = segOn(L), n = L.length;
    if (x._m === 'toggle') {
      var yi = 1; for (var k = 0; k < n; k++) if (YES.test(L[k].textContent.trim())) { yi = k; break; }
      var on = i === yi; tog(x, 'on', on); x.setAttribute('aria-checked', on ? 'true' : 'false');
      x.setAttribute('aria-label', (L[i] && L[i].textContent.trim()) || '');
    } else {
      var b = x.querySelector('.mv-val b'), t = L[i] ? L[i].textContent.trim() : '';
      if (b && b.textContent !== t) b.textContent = t;
      tog(x.querySelector('[data-d="-1"]'), 'end', i <= 0);
      tog(x.querySelector('[data-d="1"]'), 'end', i >= n - 1);
    }
  }
  function segGo(s, how, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    var L = segSpans(s), i = segOn(L), n = L.length, j = i;
    if (how === 'toggle') j = n === 2 ? 1 - i : (i + 1) % n;
    else if (how === -1) j = Math.max(0, i - 1);
    else if (how === 1) j = Math.min(n - 1, i + 1);
    else j = (i + 1) % n;   // tocar el valor: la siguiente (con vuelta)
    if (j !== i && L[j]) L[j].click();
  }
  function segUnfit(s) {
    if (s._phx) { if (s._phx.parentNode) s._phx.parentNode.removeChild(s._phx); s._phx = null; }
    if (s._phMo) { s._phMo.disconnect(); s._phMo = null; }
    s.classList.remove('ph-hid');
  }
  /** En html.ph, cada `.seg` de root: 2 opciones sí/no → .sp-toggle; 2-3 con texto que caben → se queda el segmentado; 4+ (o no cabe)
   *  → .sp-select (flechas de 44 px; tocar el valor = la siguiente). El original queda oculto (.ph-hid) y sigue mandando: el proxy
   *  reenvía los toques a sus <span> y lo vigila (MutationObserver). data-ph-ctl="seg|select|toggle" fuerza el control. Sin .ph, quita
   *  los proxies. Idempotente; se rehace solo al cambiar de tier. */
  function fitSeg(root) {
    root = $el(root) || doc;
    var key = root === doc ? 'doc' : (root.id || root);
    if (typeof key === 'string') onTier('seg:' + key, function () { fitSeg(root); });
    else if (!root._phSegT) { root._phSegT = 1; phHooks.push(function () { fitSeg(root); }); }
    var S = root.querySelectorAll ? root.querySelectorAll('.seg') : [];
    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      if (s.classList.contains('ph-proxy')) continue;
      if (!phone()) { segUnfit(s); continue; }
      var L = segSpans(s); if (!L.length) continue;
      var was = s._phx ? s._phx._m : null;
      if (s._phx) s.classList.remove('ph-hid');   // medir el original a la vista
      var m = s.getAttribute('data-ph-ctl') || was || segMode(s, L);
      if (m === 'seg') { segUnfit(s); continue; }
      if (!s._phx || s._phx._m !== m) {
        segUnfit(s);
        var x;
        if (m === 'toggle') {
          x = mk('span', 'sp-toggle ph-proxy'); x.setAttribute('role', 'switch');
          x.addEventListener('click', segGo.bind(null, s, 'toggle'));
        } else {
          x = mk('span', 'sp-select ph-proxy', '<span class="arr" data-d="-1" role="button" aria-label="Anterior">' + ARR.l + '</span><span class="mv-val" role="button"><b></b></span><span class="arr" data-d="1" role="button" aria-label="Siguiente">' + ARR.r + '</span>');
          x.addEventListener('click', function (s0) {
            return function (e) { var a = e.target.closest ? e.target.closest('[data-d]') : null; segGo(s0, a ? +a.getAttribute('data-d') : 0, e); if (a && !a.classList.contains('end')) press(a); };
          }(s));
        }
        x._m = m;
        s.parentNode.insertBefore(x, s.nextSibling);
        s._phx = x;
        if (typeof MutationObserver !== 'undefined') { s._phMo = new MutationObserver(segPaint.bind(null, s)); s._phMo.observe(s, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-checked'] }); }
      }
      s.classList.add('ph-hid');
      segPaint(s);
    }
    return S.length;
  }

  // ---------------------------------------------------------------- hojas de abajo (bottom sheets) y avisos modales
  var shCur = null, shN = 0;
  function layerHost() { return doc.getElementById('app') || doc.body; }
  function sheetHost() {
    var h = doc.getElementById('spSheets');
    if (!h) { h = mk('div'); h.id = 'spSheets'; h.hidden = true; layerHost().appendChild(h); }
    return h;
  }
  var XSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
  /** Hoja de abajo a la derecha (en el centro en PC): o = {title, html | node, tone:'ink'|'paper'|'danger', cls,
   *  actions:[{label, cls:'sp-kit'|'sp-gold'|'sp-cream'|'sp-danger', fn(api), primary, keep, id}], onClose}. Una a la vez (abrir otra
   *  cierra la anterior); tinte del 20 % detrás (nunca desenfoque); se cierra con el tinte, ✕, Esc / Retroceso o B del mando
   *  (ui.js). El foco entra y vuelve al que la abrió. Devuelve {el, body, close}. */
  function sheet(o) {
    o = o || {};
    if (shCur) shCur.close(true);
    var h = sheetHost(), opener = doc.activeElement, id = 'spSh' + (++shN);
    h.innerHTML = '';
    var cat = mk('div', 'sp-catch'), p = mk('div', 'sp-panel sp-sheet' + (o.tone === 'paper' ? ' sp-paper' : o.tone === 'danger' ? ' sp-sh-danger' : '') + (o.cls ? ' ' + o.cls : ''));
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('data-nav', '');
    var hd = mk('div', 'sp-sh-h');
    if (o.title) { var t = mk('h3', 'sp-sh-t'); t.id = id + 't'; t.textContent = o.title; hd.appendChild(t); p.setAttribute('aria-labelledby', t.id); }
    var x = mk('button', 'sp-x', XSVG); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
    hd.appendChild(x); p.appendChild(hd);
    var body = mk('div', 'sp-scroll sp-sh-b');
    if (o.node) body.appendChild(o.node); else if (o.html != null) body.innerHTML = o.html;
    p.appendChild(body);
    // o.dock === false: sin barra de acciones (la hoja ya lleva sus botones dentro; solo la ✕ cierra: antes salían dos «cerrar»)
    var acts = o.dock === false ? [] : (o.actions || []).slice(), dock = mk('div', 'sp-dock');
    if (!acts.length && o.dock !== false) acts = [{ label: 'Cerrar', cls: 'sp-cream' }];
    acts.sort(function (a, b) { return (a.primary ? 1 : 0) - (b.primary ? 1 : 0); });   // la principal, la última (abajo a la derecha)
    var first = null;
    acts.forEach(function (a, i) {
      var b = mk('button', 'sp-btn sp-md ' + (a.cls || (a.primary ? 'sp-kit' : 'sp-cream')), '<span class="sp-t"></span>');
      b.type = 'button'; b.firstChild.textContent = a.label || ''; if (a.id) b.id = a.id; b.setAttribute('data-shape', String(i + 1));
      b.addEventListener('click', function () { var r = a.fn ? a.fn(api) : undefined; if (!a.keep && r !== false) api.close(); });
      dock.appendChild(b); if (a.primary || !first) first = b;
    });
    if (acts.length === 1 && !acts[0].primary) dock.classList.add('sp-dock-one');
    if (acts.length) p.appendChild(dock);
    h.appendChild(cat); h.appendChild(p);
    h.classList.toggle('sp-rm', reduced());
    h.hidden = false; RT.classList.add('sp-sh-on');   // (los avisos cortos bajan para no tapar la ✕)
    decorate(p); more(body);
    var api = {
      el: p, body: body, open: true,
      close: function (silent) {
        if (!api.open) return; api.open = false;
        if (shCur === api) shCur = null;
        h.hidden = true; h.innerHTML = ''; RT.classList.remove('sp-sh-on');
        if (o.onClose) { try { o.onClose(silent); } catch (e) { } }
        if (opener && opener.focus && doc.contains(opener) && !opener.closest('[hidden]')) { try { opener.focus({ preventScroll: true }); } catch (e) { } }
      }
    };
    cat.addEventListener('click', function () { api.close(); });
    x.addEventListener('click', function () { api.close(); });
    shCur = api;
    var kb = !!(opener && opener.classList && opener.classList.contains('kf'));
    if (!first) first = body.querySelector('button') || x;
    setTimeout(function () { if (shCur !== api || !first) return; try { first.focus({ preventScroll: true }); } catch (e) { } if (kb) first.classList.add('kf'); }, 30);
    return api;
  }
  function sheetOpen() { return !!shCur; }
  function sheetEl() { return shCur ? shCur.el : null; }
  function closeTop() { if (!shCur) return false; shCur.close(); return true; }
  // Esc / Retroceso cierran la hoja (fase de captura en window: antes que ui.js, la Carrera o el lobby; no en un campo de texto)
  window.addEventListener('keydown', function (e) {
    if (!shCur) return;
    var k = e.key, a = doc.activeElement, typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    if (k === 'Escape' || (k === 'Backspace' && !typing)) { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); if (!e.repeat) closeTop(); }
  }, true);
  /** Aviso modal: pone un .sp-catch (tinte del 20 %, se traga los toques) justo debajo de el, sin mover nada. Devuelve release(). */
  function modal(el) {
    el = $el(el); if (!el || !el.parentNode) return function () { };
    var z = parseInt(getComputedStyle(el).zIndex, 10), c = mk('div', 'sp-catch sp-catch-m');
    c.style.zIndex = String(isFinite(z) ? z - 1 : 0);
    el.parentNode.insertBefore(c, el);
    return function () { if (c.parentNode) c.parentNode.removeChild(c); };
  }

  // ---------------------------------------------------------------- explicaciones de segundo nivel: .sp-q («?» → hoja) y .sp-info («i» → en la fila)
  /** Un escuchador por raíz: .sp-q (data-q-title + data-q-html o data-q-src="#id") abre una hoja con el texto; .sp-info despliega la
   *  .sp-help-full de su fila (aria-expanded en la fila: la .sp-lrow / .sp-li / [data-info-row] más cercana, o su padre). */
  function info(root) {
    root = $el(root) || doc;
    if (root._spI) return;
    root._spI = function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var q = t.closest('.sp-q');
      if (q && root.contains(q)) {
        e.preventDefault(); e.stopPropagation();
        var src = q.getAttribute('data-q-src'), html = q.getAttribute('data-q-html'), n = src ? doc.querySelector(src) : null;
        sheet({ title: q.getAttribute('data-q-title') || q.getAttribute('aria-label') || '', html: n ? n.innerHTML : html || '' });
        return;
      }
      var i = t.closest('.sp-info');
      if (i && root.contains(i)) { e.preventDefault(); e.stopPropagation(); infoFlip(i); }
    };
    root.addEventListener('click', root._spI, true);
  }
  function infoFlip(i) {
    var row = i.closest('.sp-lrow,.sp-li,[data-info-row]') || i.parentElement, on = row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', on ? 'true' : 'false'); i.setAttribute('aria-expanded', on ? 'true' : 'false');
    return on;
  }
  /** infoToggle(el): teclado y mando (la «i» es un <span> dentro del <button> de la fila, sin foco propio): si la fila enfocada `el`
   *  tiene una .sp-info visible, la despliega o la recoge como el toque. Devuelve true si había «i». */
  function infoToggle(el) {
    if (!el || !el.querySelector) return false;
    var i = el.querySelector('.sp-info');
    // (la «i» puede ser hermana del foco: h3#msh-fig y su .sp-info van sueltos dentro de section[data-info-row], matchstats.js)
    if (!i && el.closest) { var row = el.closest('[data-info-row]'); i = row && row.querySelector(':scope>.sp-info'); }
    if (!i || i.hidden) return false;
    infoFlip(i);
    return true;
  }

  // ---------------------------------------------------------------- tablas: columnas del móvil y «Ver tabla completa»
  function cellCol(td) {
    var c = 0; for (var n = td.parentNode.firstElementChild; n && n !== td; n = n.nextElementSibling) c += n.colSpan || 1;
    return c;
  }
  /** <div class="sp-tbl" data-ph-cols="0,1,4,6,9"><table>…</table></div>: en html.ph oculta (.ph-hide) las columnas no listadas y añade
   *  la pastilla «Ver tabla completa» (hoja con la tabla entera y desplazamiento lateral dentro). Sin .ph, todo como estaba.
   *  Llamar tras pintar la tabla (y otra vez si se repinta). */
  function tbl(w) {
    w = $el(w); if (!w) return;
    if (!w._spT) { w._spT = 1; phHooks.push(function () { if (doc.contains(w)) tbl(w); }); }
    var t = w.querySelector('table'); if (!t) return;
    var cols = (w.getAttribute('data-ph-cols') || '').split(',').filter(function (s) { return s !== ''; }).map(Number), ph = phone() && cols.length > 0;
    var C = t.querySelectorAll('th,td');
    for (var i = 0; i < C.length; i++) tog(C[i], 'ph-hide', ph && cols.indexOf(cellCol(C[i])) < 0);
    var all = w.querySelector(':scope > .sp-tbl-all');
    if (ph && !all) {
      all = mk('button', 'sp-btn sp-sm sp-cream sp-tbl-all', '<span class="sp-t">Ver tabla completa</span>'); all.type = 'button';
      all.addEventListener('click', function () {
        var full = mk('div', 'sp-tbl-full'), c = t.cloneNode(true), H = c.querySelectorAll('.ph-hide');
        for (var k = 0; k < H.length; k++) H[k].classList.remove('ph-hide');
        full.appendChild(c);
        sheet({ title: w.getAttribute('data-ph-title') || 'Tabla', node: full, cls: 'sp-sheet-wide' });
      });
      w.appendChild(all); decorate(all);
    }
    if (all) all.hidden = !ph;
    var me = t.querySelector('tr.sp-me'); if (ph && me) reveal(me);
  }

  // ---------------------------------------------------------------- textos cortos del móvil
  /** [data-ph-short="…"] (elemento solo con texto): en html.ph pone el texto corto (el largo queda en data-ph-long y en aria-label); sin
   *  .ph, vuelve el largo. Lo llaman decorate() y el cambio de tier. Para rótulos que el código reescribe, mejor una rama con phone(). */
  function shorten(root, tabs) {
    root = $el(root) || doc;
    var L = root.querySelectorAll ? root.querySelectorAll('[data-ph-short]') : [], ph = phone();
    for (var i = 0; i < L.length; i++) {
      var e = L[i], s = e.getAttribute('data-ph-short'), lg = e.getAttribute('data-ph-long');
      if (!tabs && ph && e.closest('[data-ph-tabs]')) continue;   // (las pestañas las acorta ui.js fitTabs solo si no caben)
      if (ph) {
        if (lg == null) { lg = e.textContent; e.setAttribute('data-ph-long', lg); if (!e.hasAttribute('aria-label')) { e.setAttribute('aria-label', lg.trim()); e.setAttribute('data-ph-al', ''); } }
        if (e.textContent !== s) e.textContent = s;
      } else if (lg != null) {
        if (e.textContent !== lg) e.textContent = lg;
        e.removeAttribute('data-ph-long'); if (e.hasAttribute('data-ph-al')) { e.removeAttribute('aria-label'); e.removeAttribute('data-ph-al'); }
      }
    }
  }
  onTier('shorten', function () { shorten(doc); });

  // ---------------------------------------------------------------- avisos cortos (toasts): carril arriba a la derecha
  var toastKeys = {};
  /** Aviso corto en el carril de arriba a la derecha (#spToasts, bajo DIRECTO; nunca abajo en el centro): o = {ms=3500, cls, key}.
   *  Tocar lo cierra; la misma key sustituye al anterior. Devuelve {el, close}. */
  function toast(html, o) {
    o = o || {};
    var lane = doc.getElementById('spToasts');
    if (!lane) { lane = mk('div'); lane.id = 'spToasts'; lane.setAttribute('aria-live', 'polite'); lane.setAttribute('role', 'status'); layerHost().appendChild(lane); }
    if (o.key && toastKeys[o.key]) toastKeys[o.key].close(true);
    var t = mk('div', 'sp-toast' + (o.cls ? ' ' + o.cls : '') + (reduced() ? ' sp-rm' : ''), html);
    lane.appendChild(t);
    var tm = 0, api = {
      el: t,
      close: function () { clearTimeout(tm); if (t.parentNode) t.parentNode.removeChild(t); if (o.key && toastKeys[o.key] === api) delete toastKeys[o.key]; }
    };
    t.addEventListener('click', function () { api.close(); });
    if (o.key) toastKeys[o.key] = api;
    var ms = o.ms == null ? 3500 : +o.ms; if (ms > 0) tm = setTimeout(api.close, ms);
    return api;
  }

  // ---------------------------------------------------------------- teclado del móvil
  // visualViewport: si el teclado tapa > 120 px con un campo enfocado → html.sp-kb (+ --kb-h, --vvh), la hoja o panel del campo
  // (.sp-panel, .sp-sheet o [data-kb-pin]) se pega arriba (.kb-pin), [data-kb-hide] se oculta, el [data-kb-row] del campo pasa a una
  // fila (.sp-inrow) y el campo sube al principio de su contenedor. Al cerrar el teclado o salir del campo, todo vuelve.
  var kbOn = false, kbPin = null, kbRow = null;
  function kbApply(on, hgt) {
    var a = doc.activeElement, isF = !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'));
    on = !!on && isF;
    var vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
    RT.style.setProperty('--vvh', Math.round(hgt != null ? innerHeight - hgt : vh) + 'px');
    RT.style.setProperty('--kb-h', on ? Math.round(hgt != null ? hgt : innerHeight - vh) + 'px' : '0px');
    if (on === kbOn && (!on || (kbPin && kbPin.contains(a)))) return;
    if (kbPin) { kbPin.classList.remove('kb-pin'); kbPin = null; }
    if (kbRow) { kbRow.classList.remove('sp-inrow'); kbRow = null; }
    kbOn = on; tog(RT, 'sp-kb', on);
    if (!on) return;
    kbPin = a.closest('[data-kb-pin],.sp-sheet,.sp-panel'); if (kbPin) kbPin.classList.add('kb-pin');
    kbRow = a.closest('[data-kb-row]'); if (kbRow) kbRow.classList.add('sp-inrow');
    raf(function () { reveal(a, { block: 'start' }); });
  }
  var kbInst = false;
  function kbd() {
    if (kbInst) return; kbInst = true;
    var vv = window.visualViewport;
    var chk = function () { var v = window.visualViewport, d = v ? innerHeight - v.height : 0; kbApply(d > 120); };
    if (vv) { vv.addEventListener('resize', chk); vv.addEventListener('scroll', chk); }
    doc.addEventListener('focusout', function () { setTimeout(function () { if (kbOn) chk(); }, 60); });
    doc.addEventListener('focusin', function () { if (vv) chk(); });
  }

  VB.Splat = {
    decorate: decorate, watch: watch, setKit: setKit, sync: sync, kit: function () { return kitNow < 0 ? kitOf() : kitNow; },
    reduced: reduced, splash: splash, press: press, ICONS: ICONS, BALL: BALL, SHAPES: SH,
    // móvil (notes/splat.md «Móvil»)
    PHONE_MQ: PHONE_MQ, phone: phone, more: more, reveal: reveal, fitSeg: fitSeg, sheet: sheet, sheetOpen: sheetOpen, sheetEl: sheetEl,
    closeTop: closeTop, modal: modal, info: info, infoToggle: infoToggle, tbl: tbl, shorten: shorten, toast: toast, kbd: kbd,
    /** Pruebas: simula el teclado del móvil (on, alto en px) sin visualViewport. */
    _kb: function (on, hgt) { kbApply(on, on ? (hgt || 160) : 0); return kbOn; }
  };

  // al cargar: tokens con el color por defecto (antes de leer los ajustes, que llegan con main.js) y lo que ya está en el DOM
  setKit(0xff5a2c);
  kbd();
  function boot() { decorate(doc); sync(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();

// ---------------------------------------------------------------- (móvil · portada) filas con la ayuda en UNA línea y su «i»
(function () {
  'use strict';
  var S = window.VB && window.VB.Splat; if (!S) return;
  var roots = [], tm = 0;
  /** helpFit(root, sel): en html.ph, cada fila `sel` (por defecto los .opt de Ajustes; su primer hijo = «Rótulo<small>ayuda</small>») deja la
   *  ayuda en dos líneas como mucho (data-ph-ell; line-clamp en el CSS) y, si no cabe, le pone una «i» (.sp-info, 44 px de toque) que la abre entera en la fila
   *  (aria-expanded; VB.Splat.info). La ayuda sigue en el MISMO <small> (el código puede reescribir su texto). Sin .ph, quita las «i».
   *  Se rehace al cambiar de tier y al cambiar el tamaño; llamar también al abrir o cambiar de pestaña (las filas ocultas no se miden). */
  function helpFit(root, sel) {
    root = typeof root === 'string' ? document.querySelector(root) : root; if (!root) return;
    var k = 0; for (; k < roots.length; k++) if (roots[k][0] === root && roots[k][1] === (sel || '')) break;
    if (k === roots.length) roots.push([root, sel || '']);
    S.info(root);
    var ph = S.phone(), R = root.querySelectorAll(sel || '.opt');
    for (var i = 0; i < R.length; i++) {
      var row = R[i], lab = row.firstElementChild, sm = lab && lab.querySelector(':scope>small'), ib = lab && lab.querySelector(':scope>.sp-info');
      if (!sm) continue;
      if (!ph) { if (ib) ib.parentNode.removeChild(ib); row.removeAttribute('aria-expanded'); continue; }
      if (!row.offsetParent) continue;
      sm.setAttribute('data-ph-ell', ''); row.setAttribute('data-info-row', '');
      if (row.getAttribute('aria-expanded') === 'true') continue;
      if (ib) ib.hidden = true;
      var cut = sm.scrollWidth > sm.clientWidth + 1 || sm.scrollHeight > sm.clientHeight + 1;   // (ayuda a 2 líneas con line-clamp)
      if (cut && !ib) {
        ib = document.createElement('span'); ib.className = 'sp-info'; ib.setAttribute('role', 'button'); ib.setAttribute('aria-label', 'Ver la ayuda entera'); ib.setAttribute('aria-keyshortcuts', 'I');
        ib.innerHTML = '<b aria-hidden="true">i</b>'; lab.appendChild(ib);
      }
      if (ib) ib.hidden = !cut;
    }
  }
  function again() { clearTimeout(tm); tm = setTimeout(function () { for (var i = 0; i < roots.length; i++) if (document.contains(roots[i][0])) helpFit(roots[i][0], roots[i][1]); }, 120); }
  document.addEventListener('vb:ph', again);
  window.addEventListener('resize', again);
  S.helpFit = helpFit;
})();
