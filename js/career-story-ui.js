/* MAKE THE CUT — js/career-story-ui.js (owner: carrera)
 * «Carrera con vida» (sprint 1.13.0, notes/carrera-vida.md §2 S5 y §4.3): interfaz de enlace VB.CareerStoryUI (paquete P0, fase B).
 * Une career-ui.js con el núcleo (js/career-story.js) y sus sistemas (msgs, week, wall, season). Solo devuelve HTML y textos: las
 * acciones (data-act="st-…") las atiende career-ui.js (onClick → VB.CareerStoryUI.act). Sin DOM al cargar (se carga en node:
 * tools/storytest.js, tools/storyuitest.js, tools/careertest.js); el <style> se inyecta al pintar (css(), como career-life-ui.js).
 * Todo degrada: sin núcleo, sin un sistema o sin su pintor, la función devuelve '' (o [] / 0) y career-ui pinta lo de siempre.
 *
 * ================================================================== API (VB.CareerStoryUI)
 *  chips(c) -> [{p, ic, t, x?, tab?, s?, act?, to?}]  Avisos de Partido (S5). PURO: sin azar ni escrituras (no llama a ensure).
 *                 Reúne los chips(c) de cada sistema (VB.CareerStory.chipsOf) y los que salen de datos que ya existen: decisión
 *                 pendiente de career-life, ofertas de patrocinio, ventana con ofertas, puntos sin gastar, último año de contrato
 *                 (desde la jornada 10) y, si ningún sistema avisa de la bandeja, «N mensajes esperan respuesta». Ordenados por p.
 *                 p: prioridad (menor, antes) · ic: icono (un carácter) · t: texto · x: línea pequeña («Responder») · tab / s:
 *                 pestaña y sub-pestaña a la que lleva · act: acción 'st-…' (en vez de tab) · to: selector al que salta 'st-jump'.
 *  chipsHTML(c, H) Hasta MAX_CHIPS (4) chips como botones SPLAT (<button data-tab data-s> o data-act); sin ninguno, «Todo al día».
 *  weekCard(c, H)  Tarjeta «Tu semana» (sys.ui.week de cada sistema, P2).
 *  planChip(c, inf, open)  Chip del plan del entrenador plegable («Plan 2 de 3», «Fatiga 40»); inf = Career.trainInfo(c).
 *  planOpen(c, inf, force) -> bool   Plan desplegado: lo elegido en esta jornada (localStorage planFold) o, si no, desplegado si
 *                 quedan sesiones y el entreno automático está apagado (el plan plegado no esconde sesiones pendientes).
 *  lastOpen(c, fresh) -> bool   «Último partido» y titulares desplegados: lo elegido en esta jornada o, si no, solo recién jugado.
 *  inbox(c, H, msgHTML, fresh)  Bandeja: sys.ui.inbox (P1) si existe; si no, el feed (c.story.feed) mezclado con c.inbox por fecha,
 *                 con las respuestas (▲/▼). '' si no hay feed ni pintor (career-ui pinta su bandeja de siempre).
 *  seen(c, fresh)  Al abrir la Bandeja: marca en fresh['st' + id] lo no leído del feed y lo marca leído (lo que pregunta sigue sin
 *                 leer hasta que contestas o caduca) y guarda. Única escritura de la UI fuera de act().
 *  wall / people / state / pass / stats (c, H)   Pintores de los sistemas (sys.ui.*), concatenados en el orden de use(); '' si no hay.
 *  has(k) -> bool  Algún sistema pinta ui[k] (career-ui esconde las sub-pestañas Redes, Gente, Camino y Estadísticas si no).
 *  optsHTML(c, H)  Palmarés › Opciones: «Cuánta vida: Poca / Normal / Mucha» (st-freq-n) y los sys.ui.opts.
 *  tagFor(c, f) -> texto   Sello del partido (Derbi, Revancha, Televisado…): el tagFor(c, f) del sistema que lo tenga (P3), o ''.
 *                 f = el partido: C().next(c) en el ticket, o {rival, me, atHome, kind:'league', week, lid} en el calendario.
 *  pending(c) -> n Entradas del feed sin leer (se suman al contador de Mensajes). Puro.
 *  act(a, b) -> res   'st-plan' y 'st-fold-last' (plegables, solo localStorage), 'st-jump' (salta a b.data-to) y el resto al núcleo
 *                 (VB.CareerStory.act, que guarda). res: {render, tab, s, focus} como en cw-.
 *  css()           Inyecta el <style> (una vez) y devuelve el CSS.
 *  H (lo que reciben los pintores de los sistemas): el HLP de career-ui (esc, sp, kitSw, crest) más arrow(hint), feedHTML(c, entry,
 *                 fresh) y btns(c, entry) de aquí, para que todos pinten igual.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  function S() { return VB.CareerStory || null; }
  function K() { return VB.Career || null; }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  /** Separadores con diseño (ui.js) o, sin ui.js, comas (nunca «·»). Trozos ya escapados. */
  function sep(parts, kind) {
    parts = parts.filter(function (p) { return p !== '' && p != null; });
    return VB.UI && VB.UI.sep ? VB.UI.sep(parts, kind || 'v', true) : parts.join(', ');
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  var MAX_CHIPS = 4;
  var lastFx = null;   // efecto de la última elección {a:'ans'|'wk'|'pact'|'pub', id, fx} (se enseña en el pintado siguiente)
  var FX_LAB = { ans: 'Respondido', wk: 'Hecho', pact: 'Pacto aceptado', pub: 'Publicado' };
  /** Aviso «lo que acabas de elegir y su efecto» (role=status, enfocable: tras elegir, el foco va aquí y la pantalla no salta arriba).
   *  Se mete tras el h3 de la tarjeta (o tras el h3 que empieza por at). Solo una vez: lastFx se gasta al pintarlo. */
  function withFx(h, kind, at) {
    if (!h || !lastFx || lastFx.a !== kind) return h;
    var fx = lastFx.fx.filter(function (t) { return typeof t === 'string' && t; }), lab = kind === 'ans' && lastFx.t ? 'Respondiste a «' + lastFx.t + '»' : FX_LAB[kind];
    var note = '<p class="st-fx" role="status" aria-live="polite" tabindex="-1"><b>' + esc(lab) + '.</b>' + (fx.length ? ' ' + esc(fx.join(', ')) + '.' : '') + '</p>';
    var i0 = at ? h.indexOf('<h3>' + at) : 0, i = i0 < 0 ? -1 : h.indexOf('</h3>', i0);
    lastFx = null;
    return i < 0 ? note + h : h.slice(0, i + 5) + note + h.slice(i + 5);
  }

  // ------------------------------------------------------------------ sistemas y pintores
  function systems() { var X = S(); try { return X && X.systems ? X.systems() : []; } catch (e) { return []; } }
  /** Llama a sys.ui[k](args) de cada sistema que lo tenga; concatena el HTML (los fallos de un sistema no tiran la pantalla). */
  function paint(k, args, first) {
    var out = '';
    systems().forEach(function (y) {
      if (first && out) return;
      var f = y && obj(y.ui) && typeof y.ui[k] === 'function' ? y.ui[k] : null; if (!f) return;
      try { var h = f.apply(y.ui, args); if (typeof h === 'string') out += h; } catch (e) { try { console.error('CareerStoryUI ' + y.id + '.ui.' + k, e); } catch (e2) { } }
    });
    return out;
  }
  function has(k) { return systems().some(function (y) { return y && obj(y.ui) && typeof y.ui[k] === 'function'; }); }
  /** El HLP de career-ui con las ayudas de aquí (para los pintores de los sistemas). */
  function ext(H) {
    var X = {}, k; if (obj(H)) for (k in H) X[k] = H[k];
    if (typeof X.esc !== 'function') X.esc = esc;
    if (typeof X.sp !== 'function') X.sp = sep;
    X.arrow = arrow; X.feedHTML = function (c, e, fr) { return feedHTML(c, e, fr); }; X.btns = btns; X.sep = sep;
    return X;
  }
  function story(c) { return c && obj(c.story) && c.story.v === 1 && Array.isArray(c.story.feed) ? c.story : null; }

  // ------------------------------------------------------------------ CSS (base + SPLAT, notes/splat.md)
  var Q = ':root:not(#_):not(#_):not(#_) #career', STK = '0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink)';
  var SPLAT_L = [
    // avisos: pegatinas pequeñas en fila (data-sp-row), con su icono en un círculo de tinta
    Q + ' .st-chips{display:flex;flex-wrap:wrap;gap:10px 12px;margin:0 0 12px}',
    Q + ' .st-chips .sp-btn{flex:1 1 calc(50% - 12px);min-width:0;--sp-h:44px;--sp-fs:13.5px;--sp-ss:11.5px}',
    Q + ' .st-chips .sp-t{white-space:normal;text-align:left;line-height:1.1}',
    Q + ' .st-ic{display:inline-grid;place-items:center;width:20px;height:20px;margin-right:6px;border-radius:50%;background:var(--sp-ink);color:var(--sp-gold);font:700 12px/1 var(--sp-ui);font-style:normal;vertical-align:-3px}',
    Q + ' .st-ok{font:400 clamp(15px,2.6vh,19px)/1.1 var(--sp-pop);color:var(--sp-gold);text-shadow:1.5px 1.5px 0 var(--sp-ink),-1px -1px 0 var(--sp-ink),1px -1px 0 var(--sp-ink),-1px 1px 0 var(--sp-ink);transform:rotate(-1.5deg);margin:2px 0 12px}',
    Q + ' .st-plan{--sp-h:44px;max-width:100%}',
    // botones apilados (Tu semana, pacto, prensa, respuestas, publicar): a lo ancho de su columna, el texto parte en líneas
    Q + ' :is(.st-side,.st-stack,.st-acts,.st-msg) .sp-btn{max-width:100%;min-width:0}',
    Q + ' :is(.st-side,.st-stack,.st-acts,.st-msg) .sp-btn{height:auto;min-height:var(--sp-h,44px);padding:12px 20px 13px}',
    Q + ' :is(.st-side,.st-stack,.st-acts,.st-msg) .sp-btn :is(.sp-t,.sp-s){white-space:normal;overflow:visible;overflow-wrap:anywhere;text-align:left;line-height:1.12}',
    Q + ' .st-stack>.sp-btn{width:100%}',
    // (career-ui da a .acts>.sp-btn flex-basis 170px: en una columna eso es ALTO; aquí cada botón mide lo que su texto)
    Q + ' .acts:is(.st-stack,.st-acts)>.sp-btn,' + Q + ' .st-msg .acts>.sp-btn{flex:0 0 auto;max-width:none;width:100%}',
    '@media (max-width:420px){' + Q + ' .st-chips .sp-btn{--sp-fs:12.5px;--sp-ss:11px}}',
    // sello del partido en una esquina del ticket (sin que crezca) y en el calendario
    Q + ' .cr-tk.st-tagged{position:relative}',
    Q + ' .st-tk-tag{position:absolute;top:-8px;right:10px;z-index:2;font-size:11px;padding:1px 8px;pointer-events:none}',
    Q + ' .st-cal-tag{font-size:10.5px;padding:0 6px;margin-left:6px;vertical-align:1px}',
    // bandeja: lo del feed con su remitente; respuestas en manchas apiladas con su efecto en la línea pequeña
    Q + ' .st-msg .acts{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin:8px 0 2px}',
    Q + ' .st-msg .acts .sp-btn{width:100%}',
    Q + ' .st-msg .st-done{font:600 12.5px/1.3 var(--sp-ui);color:inherit;opacity:.85;margin:6px 0 0}',
    Q + ' .st-msg.st-closed{opacity:.72}',
    // lo que acabas de elegir y su efecto (tras «Tu semana», el pacto, Publicar o una respuesta)
    Q + ' .st-fx{margin:6px 0 10px;padding:6px 10px;border-radius:10px 14px 11px 15px;background:rgba(255,210,63,.16);border-left:4px solid var(--sp-gold);font:600 13.5px/1.35 var(--sp-ui);color:inherit;outline:none}',
    Q + ' .st-fx:focus-visible{box-shadow:0 0 0 3px var(--sp-gold)}',
    Q + ' .st-up{color:#8fe36e}',
    Q + ' .st-dn{color:#ff8a98}',
    Q + ' .msg.unread .st-up{color:#1d7a3e}',
    Q + ' .msg.unread .st-dn{color:#b3263a}',
    Q + ' .sp-btn .st-up,' + Q + ' .sp-btn .st-dn{color:inherit}',
    // dentro de una mancha de color el verde y el rojo no se leen: el efecto, en el color del botón (▲/▼ ya lo dicen)
    Q + ' .card .sp-btn :is(.st-up,.st-dn,.lf-up,.lf-dn),' + Q + ' .card .msg .sp-btn :is(.st-up,.st-dn,.lf-up,.lf-dn){color:inherit;opacity:1}',
    Q + ' .st-msg .acts,' + Q + ' .msg .st-acts{margin-bottom:14px}',
    // plegable de «Último partido»: fila de tinta con trazo discontinuo
    Q + ' button.st-fbtn{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;margin:0 0 10px;padding:6px 14px;border:0;border-radius:12px 16px 13px 18px/16px 12px 18px 13px;background:rgba(21,16,42,.78);color:var(--sp-cream);box-shadow:' + STK + ';font:600 14px/1.25 var(--sp-ui);text-align:left;text-transform:none;letter-spacing:0;transform:none}',
    Q + ' button.st-fbtn b{font:400 15px/1.1 var(--sp-pop);letter-spacing:.01em}',
    Q + ' button.st-fbtn i{margin-left:auto;font-style:normal;color:var(--sp-gold)}',
    Q + ' button.st-fbtn:is(.kf,:focus-visible){outline:none;box-shadow:0 0 0 3px var(--sp-gold),3px 4px 0 3px var(--sp-ink)}',
    Q + ' .st-freq p.muted{margin-top:8px}',
    Q + ' .card:is(.st-state,.st-wall,.st-people,.st-pass,.st-stats)>h3:not(:first-child){margin-top:16px}',
    '@media (min-width:560px) and (max-height:420px){' + Q + ' .cr-two>.cr-next{margin:0 0 8px}' + Q + ' .cr-two .st-chips{margin-bottom:8px}' + Q + ' .cr-two .st-chips .sp-btn{flex-basis:100%;--sp-fs:12.5px;--sp-ss:11px}' +
      // columna estrecha: Jugar y Simular uno debajo de otro (como en el móvil en vertical) y el rival del ticket en 2 líneas
      Q + ' .cr-two .cr-go{flex-wrap:wrap;gap:8px}' + Q + ' .cr-two .cr-go .sp-patch,' + Q + ' .cr-two .cr-go .sp-btn{flex:1 1 100%}' +
      Q + ' .cr-two .cr-tk{--sp-h:auto}' + Q + ' .cr-two .cr-tk .sp-t{font-size:17px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}'
  ];
  var CSS = [
    '#career .st-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}',
    '#career .st-chips button{flex:1 1 calc(50% - 8px);min-height:44px;min-width:0;text-align:left}',
    '#career .st-chips button small{display:block;font:600 11.5px var(--ui);text-transform:none;letter-spacing:0;opacity:.85}',
    '#career .st-ok{font:800 16px var(--display);letter-spacing:.03em;text-transform:uppercase;color:#ffd23f;margin:2px 0 10px}',
    '#career .st-tk-tag{position:absolute;top:-8px;right:10px;z-index:2}',
    '#career .st-cal-tag{margin-left:6px}',
    '#career .st-msg .acts{display:flex;flex-direction:column;gap:6px;margin:8px 0 2px}',
    '#career .st-msg .acts button{min-height:44px;text-align:left}',
    '#career .st-msg .acts button small{display:block;font:600 12px var(--ui);text-transform:none;letter-spacing:0;opacity:.9;margin-top:2px}',
    '#career .st-msg .st-done{font:600 12.5px var(--ui);opacity:.85;margin:6px 0 0}',
    '#career .st-fx{margin:6px 0 10px;padding:6px 10px;border-radius:8px;background:rgba(255,210,63,.16);border-left:4px solid #ffd23f;font:600 13.5px var(--ui);outline:none}',
    '#career .st-up{color:#7ee2a8}#career .st-dn{color:#ff8a8a}',
    '#career button.st-fbtn{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;margin:0 0 10px;text-align:left}',
    '#career button.st-fbtn i{margin-left:auto;font-style:normal}',
    // Partido en dos columnas en el móvil apaisado (568x320, 640x360): ticket y botones a la izquierda, avisos y plan a la derecha;
    // en vertical (360x640) y en escritorio, apilado
    '#career .cr-two{display:block}',
    '@media (min-width:560px) and (max-height:420px){#career .cr-two{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);grid-template-areas:"nx sd" "nd sd";gap:0 14px;align-items:start}' +
      '#career .cr-two>.cr-next{grid-area:nx;margin-bottom:8px}#career .cr-two>.st-side{grid-area:sd}#career .cr-two>.cr-nd-w{grid-area:nd}' +
      '#career .st-chips button,#career .st-chips .sp-btn{flex-basis:100%}}'
  ].concat(SPLAT_L).join('\n');
  /** Inyecta (o pone al día) el <style> con lo de aquí y el ui.css() de cada sistema que lo tenga (p. ej. P2). Devuelve el CSS. */
  function css() {
    var all = CSS;
    systems().forEach(function (y) { if (y && obj(y.ui) && typeof y.ui.css === 'function') { try { var x = y.ui.css(); if (typeof x === 'string' && x) all += '\n' + x; } catch (e) { } } });
    try {
      if (typeof document === 'undefined' || !document || !document.createElement) return all;
      var el = document.getElementById ? document.getElementById('careerStoryCss') : null;
      if (el) { if (el.textContent !== all) el.textContent = all; return all; }
      el = document.createElement('style'); el.id = 'careerStoryCss'; el.textContent = all; (document.head || document.body).appendChild(el);
    } catch (e) { }
    return all;
  }

  // ------------------------------------------------------------------ avisos (S5)
  var CHIP_C = ['sp-cream', 'sp-teal', 'sp-alt', 'sp-gold'];
  function clean(t) { return String(t == null ? '' : t).replace(/undefined|NaN|[{}]/g, '').replace(/ {2,}/g, ' ').trim(); }
  function chips(c) {
    if (!c || typeof c !== 'object' || !c.player) return [];
    var out = [], X = S();
    if (X && X.chipsOf) { try { out = X.chipsOf(c).slice(); } catch (e) { out = []; } }
    var l = obj(c.life) ? c.life : {}, L = VB.CareerLife;
    // decisión pendiente de career-life (la tarjeta ya está en Partido: el aviso salta a ella)
    if (L && L.pendingEvent && l.ev) {
      var ev = null; try { ev = L.pendingEvent(c); } catch (e) { ev = null; }
      if (ev && ev.title) out.push({ p: 1, ic: '!', t: 'Decisión: ' + ev.title, x: 'Contestar', act: 'st-jump', to: '.lf-ev' });
    }
    if (Array.isArray(l.spOffers) && l.spOffers.length) out.push({ p: 3, ic: '€', t: l.spOffers.length === 1 ? 'Oferta de patrocinio' : l.spOffers.length + ' ofertas de patrocinio', x: 'Mirar', tab: 'life', s: 'fame' });
    if (c.window === 'mid' && Array.isArray(c.offers) && c.offers.length) out.push({ p: 2, ic: '⇄', t: plural(c.offers.length, 'club te quiere', 'clubes te quieren'), x: 'Ventana de fichajes', tab: 'club', s: 'offers' });
    if ((c.player.pts | 0) > 0 && c.phase !== 'off') out.push({ p: 4, ic: '+', t: plural(c.player.pts | 0, 'punto', 'puntos'), x: 'Por repartir', tab: 'player', s: 'phys' });
    var ct = c.contract;
    if (obj(ct) && (ct.left | 0) === 1 && c.phase === 'league' && (c.week | 0) >= 10) out.push({ p: 6, ic: '✎', t: 'Último año de contrato', x: 'Contrato', tab: 'club', s: 'contract' });
    // la bandeja: si ningún sistema avisa ya de ella
    var s = story(c);
    if (s && !out.some(function (x) { return x.tab === 'inbox'; })) {
      var q = s.feed.filter(function (x) { return x && x.o && x.ans === -1 && !(s.mN > x.exp); }).length;
      if (q) out.push({ p: 2, ic: '✉', t: q === 1 ? 'Un mensaje' : q + ' mensajes', x: 'Por responder', tab: 'inbox', s: 'box' });
    }
    return out.filter(function (x) { return obj(x) && typeof x.t === 'string' && clean(x.t); }).map(function (x, i) { return { x: x, i: i }; })
      .sort(function (a, b) { return ((+a.x.p || 0) - (+b.x.p || 0)) || a.i - b.i; }).map(function (o) { return o.x; });
  }
  function chipBtn(ch, i) {
    var at = ch.act && String(ch.act).indexOf('st-') === 0 ? ' data-act="' + esc(ch.act) + '"' + (ch.to ? ' data-to="' + esc(ch.to) + '"' : '')
      : ' data-tab="' + esc(ch.tab || 'match') + '"' + (ch.s ? ' data-s="' + esc(ch.s) + '"' : '');
    var t = clean(ch.t), x = clean(ch.x);
    return '<button class="sp-btn sp-sm ' + CHIP_C[i % CHIP_C.length] + ' st-chip"' + at + ' data-shape="' + (i + 3) + '"><span class="sp-l"><span class="sp-t">' +
      (ch.ic ? '<i class="st-ic" aria-hidden="true">' + esc(String(ch.ic).slice(0, 2)) + '</i>' : '') + esc(t) + '</span>' + (x ? '<small class="sp-s">' + esc(x) + '</small>' : '') + '</span></button>';
  }
  function chipsHTML(c, H) {
    if (!c) return '';
    css();
    var l = chips(c).slice(0, MAX_CHIPS);
    if (!l.length) return '<p class="st-ok">Todo al día. A jugar.</p>';
    return '<div class="st-chips" data-sp-row role="group" aria-label="Avisos">' + l.map(chipBtn).join('') + '</div>';
  }

  // ------------------------------------------------------------------ plegables (plan del entrenador y último partido)
  function jk(c) { return c ? [c.mode || 'beach', c.season | 0, c.phase || '', c.week | 0].join(':') : ''; }
  function foldGet(k, c) {
    try { var raw = root.localStorage && root.localStorage.getItem('make-the-cut.career.' + k + 'Fold'), o = raw ? JSON.parse(raw) : null; return o && o.k === jk(c) ? (o.v ? 1 : 0) : null; } catch (e) { return null; }
  }
  function foldSet(k, c, v) { try { if (root.localStorage) root.localStorage.setItem('make-the-cut.career.' + k + 'Fold', JSON.stringify({ k: jk(c), v: v ? 1 : 0 })); } catch (e) { } }
  function planOpen(c, inf, force) {
    if (force) { foldSet('plan', c, 0); return true; }   // (al volver de un ejercicio o con «Ir al plan»: queda abierto esta jornada)
    var f = foldGet('plan', c);
    if (f !== null) return !f;
    return !!(inf && inf.left > 0 && !inf.auto);
  }
  function lastOpen(c, fresh) {
    var f = foldGet('last', c);
    if (f === null && fresh) { foldSet('last', c, 0); return true; }   // (recién jugado: abierto hasta el partido siguiente)
    return f !== null ? !f : false;
  }
  function planChip(c, inf, open) {
    if (!inf) return '';
    var used = inf.used != null ? inf.used | 0 : Math.max(0, (inf.max | 0) - (inf.left | 0));
    return '<button class="sp-btn sp-sm sp-ink st-plan" data-act="st-plan" data-v="' + (open ? 1 : 0) + '" aria-expanded="' + !!open + '" data-shape="9"><span class="sp-l"><span class="sp-t">' +
      'Plan ' + used + ' de ' + (inf.max | 0) + (open ? ' ▴' : ' ▾') + '</span><small class="sp-s">' + sep([esc('Fatiga ' + (inf.fat | 0)), esc(inf.auto ? 'entreno automático' : inf.left > 0 ? plural(inf.left | 0, 'sesión libre', 'sesiones libres') : 'sin sesiones')]) + '</small></span></button>';
  }

  // ------------------------------------------------------------------ bandeja
  function arrow(h) { return (h || []).map(function (x) { return '<span class="' + (x[1] ? 'st-up' : 'st-dn') + '">' + esc(x[0]) + ' ' + (x[1] ? '▲' : '▼') + '</span>'; }).join(' '); }
  var KN = { agent: 'Agente', coach: 'Entrenador', mate: 'Tu pareja', fam: 'Tu gente', press: 'Prensa', rival: 'Tu rival', sponsor: 'Patrocinio', fan: 'Afición', physio: 'Fisio', club: 'Club', barrio: 'La peña del barrio' };
  function who(c, k) {
    var X = S(), ca = null; try { ca = X && X.cast ? X.cast(c) : null; } catch (e) { ca = null; }
    if (k === 'agent') return ca ? ca.agent : KN.agent;
    if (k === 'coach') return ca ? ca.coach + ', ' + (isH(c) ? 'cuerpo técnico' : 'entrenador') : KN.coach;
    if (k === 'mate') return isH(c) ? 'Capitanía' : c.mate && c.mate.name ? c.mate.name : KN.mate;
    if (k === 'rival') return c.life && c.life.rival && c.life.rival.name ? c.life.rival.name : KN.rival;
    if (k === 'sponsor') return c.life && c.life.sponsor && c.life.sponsor.name ? c.life.sponsor.name : KN.sponsor;
    return KN[k] || 'Club';
  }
  function btns(c, e) {
    var X = S(); if (!X || !e || !e.o || e.ans !== -1) return '';
    var tx = X.text(c, e);
    return tx.o.length ? '<div class="acts">' + tx.o.map(function (o, i) {
      return '<button data-act="st-ans-' + e.id + '-' + i + '">' + esc(o.t) + (o.hint && o.hint.length ? '<small>' + arrow(o.hint) + '</small>' : '') + '</button>';
    }).join('') + '</div>' : '';
  }
  function feedHTML(c, e, fresh) {
    var X = S(); if (!X || !e) return '';
    var tx = X.text(c, e); if (!tx.t && !tx.x) return '';
    var open = e.o && e.ans === -1, un = !e.r || (fresh && fresh['st' + e.id]), h = '<div class="msg st-msg' + (un || open ? ' unread' : '') + (e.ans === -2 ? ' st-closed' : '') + '" id="st-m-' + e.id + '">' +
      '<small>' + sep([esc(who(c, e.k)), 'T' + (e.s | 0) + (e.ph === 'pick' ? '' : ' J' + Math.max(1, e.w | 0))]) + '</small><b>' + esc(tx.t) + '</b>' + (tx.x ? '<p>' + esc(tx.x) + '</p>' : '');
    if (open) h += btns(c, e);
    else if (e.o && e.ans >= 0 && tx.o[e.ans]) h += '<p class="st-done">Respondiste: «' + esc(tx.o[e.ans].t) + '»' + (lastFx && lastFx.id === e.id && lastFx.fx.length ? '. ' + esc(lastFx.fx.join(', ')) + '.' : '') + '</p>';
    else if (e.ans === -2 && tx.c) h += '<p class="st-done">' + esc(tx.c) + '</p>';
    return h + '</div>';
  }
  function inbox(c, H, msgHTML, fresh) {
    if (!c || !S()) return '';
    css();
    var Hx = ext(H), own = paint('inbox', [c, Hx, msgHTML, fresh || {}], true);
    if (own) return withFx(own, 'ans');
    var s = story(c); if (!s || !s.feed.length) return '';
    var items = [];
    (c.inbox || []).forEach(function (m, i) { if (m) items.push({ s: m.s | 0, w: m.w | 0, f: 0, i: i, h: typeof msgHTML === 'function' ? msgHTML(m, fresh) : '' }); });
    s.feed.forEach(function (e, i) { var h = feedHTML(c, e, fresh); if (h) items.push({ s: e.s | 0, w: e.w | 0, f: 1, i: i, h: h }); });
    items.sort(function (a, b) { return (b.s - a.s) || (b.w - a.w) || (b.f - a.f) || (b.i - a.i); });
    var q = s.feed.filter(function (x) { return x.o && x.ans === -1; }).length;
    lastFx = null;
    return '<div class="card"><h3>Mensajes <span class="muted">(' + items.length + (q ? ', ' + plural(q, 'espera', 'esperan') + ' respuesta' : '') + ')</span></h3>' +
      (items.length ? items.map(function (x) { return x.h; }).join('') : '<p class="muted">Sin mensajes.</p>') + '</div>';
  }
  function seen(c, fresh) {
    var s = story(c), X = S(); if (!s || !X) return 0;
    var n = 0;
    s.feed.forEach(function (x) { if (x && !x.r) { if (fresh) fresh['st' + x.id] = 1; if (!x.o || x.ans !== -1) { x.r = 1; n++; } } });
    if (n) { try { X.K(c).save(c); } catch (e) { } }
    return n;
  }
  function pending(c) { var s = story(c); return s ? s.feed.filter(function (x) { return x && !x.r; }).length : 0; }

  // ------------------------------------------------------------------ opciones
  var FREQ = [['Poca', 'Como mucho 1 cosa por jornada que pida respuesta'], ['Normal', 'Hasta 3 cosas por jornada'], ['Mucha', 'Hasta 4 cosas por jornada']];
  function optsHTML(c, H) {
    var X = S(); if (!c || !X) return '';
    css();
    var s = story(c), f = s && (s.freq === 0 || s.freq === 2) ? s.freq : 1;
    return '<div class="card st-freq"><h3>Cuánta vida</h3><div class="seg" role="group" aria-label="Cuánta vida">' + FREQ.map(function (x, i) {
      return '<button data-act="st-freq-' + i + '" aria-pressed="' + (i === f) + '">' + x[0] + '</button>';
    }).join('') + '</div><p class="muted"><b>' + FREQ[f][0] + ':</b> ' + FREQ[f][1] + ' (mensajes, prensa y decisiones). El muro y la carta de la semana no cuentan. Solo cambia lo que te piden, nunca la carrera si no eliges nada.</p>' +
      paint('opts', [c, ext(H)]) + '</div>';
  }

  // ------------------------------------------------------------------ sello del partido
  function tagFor(c, f) {
    if (!c || !f) return '';
    var t = '';
    systems().some(function (y) {
      var fn = y && typeof y.tagFor === 'function' ? y.tagFor : y && obj(y.ui) && typeof y.ui.tagFor === 'function' ? y.ui.tagFor : null;
      if (!fn) return false;
      try {
        var r = fn.call(y, c, f); t = typeof r === 'string' ? r : obj(r) ? r.name || r.tag || r.t || '' : '';
        if (t && typeof y.tagName === 'function') t = y.tagName(t) || t;   // (P3 devuelve el id, 'derby'; el nombre, «Derbi», con tagName)
      } catch (e) { t = ''; }
      return !!t;
    });
    return clean(t);
  }

  // ------------------------------------------------------------------ acciones
  function act(a, b) {
    var X = S(); if (!X || typeof a !== 'string' || a.indexOf('st-') !== 0) return null;
    var C = K(), c = C && C.load ? C.load() : null;
    var v = b && b.getAttribute ? b.getAttribute('data-v') : null;
    if (a === 'st-plan') { if (!c) return null; foldSet('plan', c, v === '1'); return { render: true, focus: '[data-act="st-plan"]' }; }
    if (a === 'st-fold-last') { if (!c) return null; foldSet('last', c, v === '1'); return { render: true, focus: '[data-act="st-fold-last"]' }; }
    if (a === 'st-jump') { var to = b && b.getAttribute ? b.getAttribute('data-to') : ''; return to ? { focus: to + ' button:not([disabled])', scroll: to } : null; }
    var kind = /^st-ans-\d+-\d+$/.test(a) ? 'ans' : /^st-wk-\d+$/.test(a) ? 'wk' : /^st-pact-\d+$/.test(a) ? 'pact' : /^st-wall-pub-\d+$/.test(a) ? 'pub' : '';
    var id = kind === 'ans' ? +a.split('-')[2] : -1, ttl = '';
    if (kind === 'ans') {   // (el título del mensaje, antes de contestar, para el aviso del efecto)
      try { var e0 = (story(c) || { feed: [] }).feed.filter(function (x) { return x && x.id === id; })[0]; ttl = e0 && X.text ? X.text(c, e0).t : ''; } catch (e1) { ttl = ''; }
    }
    var r = X.act(a, b);
    // elegir (responder, «Tu semana», pacto, Publicar): el efecto sale en un aviso en la misma tarjeta y el foco va a él. Antes la
    // tarjeta se repintaba sin el botón pulsado, el foco caía al primero de la pantalla y en el móvil saltaba arriba del todo.
    if (kind && r) {
      // (el pacto: su texto ya sale justo debajo, en la ficha; el aviso solo confirma)
      lastFx = { a: kind, id: id, fx: kind !== 'pact' && Array.isArray(r.fx) ? r.fx : [], t: ttl }; r.render = true;
      r.focus = kind === 'ans' && !has('inbox') ? '[data-act^="st-ans-"]' : '.st-fx';
    }
    return r;
  }

  VB.CareerStoryUI = {
    chips: chips, chipsHTML: function (c, H) { try { return chipsHTML(c, H); } catch (e) { return ''; } },
    weekCard: function (c, H) { if (!c || !S()) return ''; css(); return withFx(paint('week', [c, ext(H)]), 'wk'); },
    planChip: planChip, planOpen: planOpen, lastOpen: lastOpen,
    inbox: function (c, H, msgHTML, fresh) { try { return inbox(c, H, msgHTML, fresh); } catch (e) { return ''; } },
    seen: seen,
    wall: function (c, H) { if (!c || !S()) return ''; css(); return withFx(paint('wall', [c, ext(H)]), 'pub'); },
    people: function (c, H) { if (!c || !S()) return ''; css(); return paint('people', [c, ext(H)]); },
    state: function (c, H) { if (!c || !S()) return ''; css(); return withFx(paint('state', [c, ext(H)]), 'pact', 'Pacto'); },
    pass: function (c, H) { if (!c || !S()) return ''; css(); return paint('pass', [c, ext(H)]); },
    stats: function (c, H) { if (!c || !S()) return ''; css(); return paint('stats', [c, ext(H)]); },
    has: has,
    optsHTML: function (c, H) { try { return optsHTML(c, H); } catch (e) { return ''; } },
    tagFor: tagFor,
    pending: pending,
    act: act,
    css: css,
    arrow: arrow, feedHTML: feedHTML,
    MAX_CHIPS: MAX_CHIPS
  };
})();
