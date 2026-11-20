/* MAKE THE CUT — js/career-ui.js (owner: ui_main)
 * Pantallas del modo Carrera de VÓLEY PLAYA (VB.CareerUI): crear carrera, hub (Partido · Mensajes · Jugador · Club · Liga ·
 * Palmarés), fin de temporada y ofertas. Sprint playa (10-nov-2026): textos de playa (circuitos, arena, sets a 21), sin selector
 * de puntos, ficha del compañero con media respecto al club, puntos fuertes y flojos y forma (mateLine). Crea su propio DOM (#career) y su propio <style> desde aquí para no chocar con index.html, con las
 * variables del estilo cartoon del menú (--tk, --tp, --tp2, --cel-a, --t0, --gold, --display, --ui, --ring1, --ring2).
 * Dificultad de la Carrera (12-nov-2026): fila «Dificultad» al crear, «Dificultad · Cambiar» en Partido, tarjeta en Palmarés ›
 * Opciones y el nivel en Palmarés, Temporadas y fin de temporada (solo si se ha usado algo que no sea Normal; notes/carrera.md §Dificultad).
 * Datos y reglas: js/career.js (VB.Career). Los partidos los arranca main.js (ctx.actions.startCareerMatch).
 * Vestuario (sprint «personaliza», spec §6.1 y §7): Jugador › Vestuario (resumen y «Abrir el vestuario», que cierra la Carrera y abre
 * la página del menú con VB.UI.openLook({who:'career', hall, tc, back}) y el kit de tu club; al volver se reabre aquí), punto en la
 * pestaña con novedades sin ver (VB.Look.unseen) y la fila «Aspecto» al crear. Sin js/look.js o sin VB.UI.openLook no sale nada.
 * Sprint 2-4 (T16, notes/s234/T16.md): retrato en la cabecera, Jugador y Compañero (ptReq → VB.UI.portraitHTML), escudos paródicos
 * (crest → VB.CareerWorldUI.crestSVG; sin él kitSw), vitrina en Palmarés, «Continuar carrera» de la portada (heroData/syncHero), open con
 * {from, fresh, focus} (R15) y «‹ Menú», química con nombre de nivel (chemTxt, marcas del medidor) y la etiqueta «Jefe».
 *
 * Entrada: botón #btnCareer del menú (index.html). Ratón, táctil (botones ≥ 44 px) y teclado/mando: ↑/↓ (y ←/→) mueven el foco,
 * Intro acepta, Esc vuelve; con mando main.js llama a VB.CareerUI.nav(it, dt) mientras está abierta (en lugar de VB.UI.nav).
 * Mientras está abierta, las teclas no llegan a ui.js ni a input.js (escucha en captura sobre window): así escribir el nombre no
 * silencia el juego con la M ni el menú se mueve por detrás.
 */
(function () {
  'use strict';
  /** Ordinal corto: 1r, 2º, 3r, 4º… Nunca «1.er». */
  function ordn(n) { return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  var VB = window.VB = window.VB || {};
  var root = null, body = null, head = null, tabsEl = null, subEl = null, dock = null, styleEl = null;
  var view = 'hub', tab = 'match', open = false, lastFocus = null, from = 'play', focusReq = '', ptDone = false, tblLvl = -1, armT = 0, armTo = 0, confirmStep = 0, freshLast = false;
  // (sin «Controlar»: en la Carrera solo se controla a tu jugador)
  var form = { name: '', num: 1, role: 'atk', mode: '', country: 'ES', pos: 'OH', pts6: 15, diff: 'normal' }, badgeMsg = '', note = '', dnote = '', yrs = {};   // (playa: sin puntos por set, siempre a 21; pista: 15/21/25)
  var tblLid = '';   // Carrera de pista: liga que se ve en Clasificación ('' = la tuya)
  // Pestañas (móvil primero): 6 apartados y, dentro, sub-pestañas. Las dos barras son el componente común de ui.js
  // (VB.UI.tabs, como Jugadores y Ajustes; drawBar): Q/E y LB/RB cambian de apartado, RePág/AvPág y LT/RT de sub-pestaña, ←/→
  // con el foco en una pestaña, tocar y deslizar el dedo sobre el contenido. Sin ui.js (pruebas): botones sueltos (tabsBar).
  // «Fama» (career-life-ui.js): seguidores, patrocinio, rival, tienda, logros y legado
  var TABS = [['match', 'Partido'], ['inbox', 'Mensajes'], ['player', 'Jugador'], ['club', 'Club'], ['life', 'Fama'], ['league', 'Liga'], ['honors', 'Palmarés']];
  var SUBS = {   // (Jugador: el mismo orden que Jugadores del menú, Físico · Defensa · Ataque, que sale de VB.Prog.GROUPS)
    player: [['phys', 'Físico'], ['def', 'Defensa'], ['atk', 'Ataque'], ['badges', 'Insignias'], ['train', 'Estado'], ['look', 'Vestuario']],   // (Vestuario: solo con js/look.js; «Estado» = Entreno + ánimo y forma de career-story; sin él, «Entreno»)
    club: [['info', 'Ficha'], ['mate', 'Compañero'], ['people', 'Gente'], ['contract', 'Contrato'], ['offers', 'Ofertas']],
    league: [['table', 'Clasificación'], ['cal', 'Calendario'], ['news', 'Noticias'], ['clubs', 'Clubes']],   // (Noticias y Clubes: career-world-ui.js; sin él no salen)
    honors: [['titles', 'Palmarés'], ['stats', 'Estadísticas'], ['seasons', 'Temporadas'], ['opts', 'Opciones']],
    life: [['fame', 'Fama'], ['pass', 'Camino'], ['shop', 'Tienda'], ['goals', 'Logros'], ['legacy', 'Legado']],
    // «Carrera con vida» (career-story-ui.js): Bandeja (el feed mezclado con los mensajes) y Redes. Sin career-story, sin barra
    inbox: [['box', 'Bandeja'], ['wall', 'Redes']]
  };
  // Carrera de pista (6v6, lote C): Club › Equipo en vez de Compañero y Liga › Copas (nacional e internacionales); Noticias y Clubes
  // como en la playa (career-world-ui.js; sin él no salen)
  var SUBS6 = {
    club: [['info', 'Ficha'], ['team', 'Equipo'], ['people', 'Gente'], ['contract', 'Contrato'], ['offers', 'Ofertas']],
    league: [['table', 'Clasificación'], ['cal', 'Calendario'], ['cups', 'Copas'], ['news', 'Noticias'], ['clubs', 'Clubes']]
  };
  // Móvil (html.ph; notes/splat.md §9, notes/carrera.md «Móvil»): columna de 6 apartados a la izquierda (Fama y Palmarés juntos en
  // «Vida»: 7 pestañas y Volver no caben en 320 de alto) y las sub-pestañas en tira arriba. Por dentro tab/sub siguen siendo los de
  // siempre ('life' / 'honors'): la columna solo los agrupa. Jugador › Entreno no sale en la tira (el plan está en Partido).
  function PH() { var de = typeof document !== 'undefined' && document.documentElement; return !!(de && de.classList && de.classList.contains('ph')); }
  var ICO = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var TAB_IC = {
    match: ICO('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-2 3-2 6 0 8.5s2 5.5 0 8.5M4.2 9c3 1.2 6.5 1.6 7.8 3s4.8 1.8 7.8 3"/>'),
    player: ICO('<circle cx="12" cy="7.5" r="3.6"/><path d="M4.8 20.5c.6-4.2 3.4-6.6 7.2-6.6s6.6 2.4 7.2 6.6"/>'),
    club: ICO('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/>'),
    inbox: ICO('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/>'),
    league: ICO('<path d="M7 4h10v4.5a5 5 0 0 1-10 0zM7 6H4v1.5A3 3 0 0 0 7 10.5M17 6h3v1.5a3 3 0 0 1-3 3M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>'),
    life: ICO('<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>')
  };
  var TABS_PH = [['match', 'Partido'], ['player', 'Jugador'], ['club', 'Club'], ['inbox', 'Mensajes'], ['league', 'Liga'], ['life', 'Vida']];
  var LIFE_PH = [['fame', 'Fama'], ['pass', 'Camino'], ['shop', 'Tienda'], ['goals', 'Logros'], ['h:titles', 'Vitrina'], ['h:stats', 'Cifras'], ['h:opts', 'Opciones']];
  var SUB_PH = { table: 'Tabla' };   // (rótulos más cortos en la tira del móvil)
  /** Móvil: nombre corto de un club (sin el patrocinador: las 2 últimas palabras con chicha, «Voley Sanroqueño»). */
  function shortClub(k) {
    if (!k) return '';
    var n = String(k.name || ''), w = n.split(/\s+/).filter(Boolean);
    if (n.length <= 18 || w.length < 3) return n;
    var stop = /^(de|del|la|las|el|los|y|i|d'|l')$/i, out = [], nn = 0;
    for (var i = w.length - 1; i >= 0 && nn < 2; i--) { out.unshift(w[i]); if (!stop.test(w[i])) nn++; }
    while (out.length && stop.test(out[0])) out.shift();
    return out.join(' ') || n;
  }
  function isHall(c) { return !!(c && c.mode === 'hall'); }
  function subsOf(t) { var c = C() && C().get(); return (isHall(c) && SUBS6[t]) || SUBS[t]; }
  var sub = { player: 'phys', club: 'info', league: 'table', honors: 'titles', life: 'fame', inbox: 'box', pick: 0 };
  function LUI() { return VB.CareerLife && VB.CareerLifeUI || null; }
  /** «Carrera con vida» (career-story.js + career-story-ui.js, notes/carrera-vida.md): avisos, Bandeja con respuestas, Redes, Gente,
   *  Camino, Estadísticas y «Cuánta vida». Sin los dos ficheros, null y todo como antes. */
  function SUI() { return VB.CareerStory && VB.CareerStoryUI || null; }
  /** Sub-pestañas que solo salen si algún sistema de career-story las pinta. */
  var STORY_SUBS = { wall: 1, people: 1, pass: 1, stats: 1 };
  /** Mundo de la Carrera (career-world-ui.js, sprint 5): Faro; noticias y clubes en C2. Sin los dos ficheros, null. */
  function WUI() { return VB.CareerWorld && VB.CareerWorldUI || null; }
  /** Vestuario (js/look.js, VB.Look): sin él no hay sub-pestaña, ni punto, ni fila «Aspecto». */
  function LOOK() { var X = VB.Look; return X && Array.isArray(X.CATALOG) && X.SLOTS ? X : null; }
  /** Hay objetos del vestuario que aún no has visto (punto en Jugador y en Vestuario). */
  function lookNew() { var X = LOOK(); if (!X || !X.unseen) return false; try { var u = X.unseen(); return !!(u && u.length); } catch (e) { return false; } }
  var HLP = { esc: function (s) { return esc(s); }, sp: function (a, k) { return sp(a, k); }, kitSw: function (k, big) { return kitSw(k, big); },
    // B2: escudo paródico (career-world-ui.js); sin él, la muestra de equipación de siempre
    crest: function (k, px, o) { var W = WUI(); return W && W.crestSVG ? W.crestSVG(k, px, o) : k && k.kit ? kitSw(k.kit, px >= 48) : ''; },
    ph: function () { return PH(); }, q: function (t, x) { return qBtn(t, x); } };
  /** Móvil: explicación detrás de «?» (.sp-q → hoja VB.Splat; el «?» va en la esquina de la pegatina del título de la tarjeta). */
  function qBtn(title, text) { return '<button type="button" class="sp-q cr-q" aria-label="' + esc('Qué es: ' + title) + '" data-q-title="' + esc(title) + '" data-q-html="' + esc('<p>' + esc(text) + '</p>') + '">?</button>'; }
  /** Química de la Carrera (career-life.js S3 C5: chemInfo/chemName/chemLevel/bossFor); sin ella, null y la cifra de siempre. */
  function LIFE() { var L = VB.CareerLife; return L && L.chemInfo ? L : null; }
  /** Escudo del club k a px (≤ 28: mini, para tablas y calendarios). Sin career-world: kitSw (en mini, kit-mini). */
  function crest(k, px, c) {
    if (!k) return '';
    var W = WUI();
    if (W && W.crestSVG) { try { return W.crestSVG(k, px, { c: c || (C() && C().get()) || undefined }); } catch (e) { } }
    if (!k.kit) return '';
    return px <= 28 ? kitSw(k.kit).replace('cr-kit', 'cr-kit kit-mini') : kitSw(k.kit, px >= 48);
  }
  /** Línea de química con nombre de nivel (S3 C5): «Química: Buena sintonía (+1)» / pista «Química del equipo: Buen ambiente (+1)»;
   *  con +0 sin paréntesis. v = química (por defecto la de la carrera); bonus = el +n que enseñar (0/omitido: sin paréntesis).
   *  Sin career-life: «Química 47 (+1)» como siempre. */
  function chemTxt(c, v, bonus) {
    var hall = isHall(c), L = LIFE();
    if (v == null) v = hall ? c.chem : c.mate ? c.mate.chem : 0;
    v = v | 0; bonus = bonus | 0;
    var b = bonus ? ' (+' + bonus + ')' : '';
    if (L && L.chemName && L.chemLevel) { try { return (hall ? 'Química del equipo: ' : 'Química: ') + L.chemName(L.chemLevel(v), c) + b; } catch (e) { } }
    return (hall ? 'Química del equipo ' : 'Química ') + v + b;
  }
  // ---------------------------------------------------------------- B2: retratos (VB.Doll.portrait → main.js → VB.UI.portraitHTML)
  function mixHex(a, b, t) {
    var r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }
  /** --vs de #app (pantallas grandes: el retrato se pinta a CSS × 2 × --vs, con tope de 384 px). */
  function vsc() {
    try { var a = document.getElementById('app'), v = a && window.getComputedStyle ? parseFloat(getComputedStyle(a).getPropertyValue('--vs')) : 1; return v > 0 ? v : 1; } catch (e) { return 1; }
  }
  /** Petición de retrato (S2-B2B3 §2.1) de tu atleta (who 'me') o del compañero de playa ('mate'): tu aspecto del Vestuario (o el de
   *  serie, VB.Players.baseLook), la equipación de tu club y tu dorsal, fondo = color oscuro del club. px = tamaño CSS. null si falta algo. */
  function ptReq(c, who, px, face) {
    if (!c || !c.player) return null;
    var hall = isHall(c), mate = who === 'mate';
    if (mate && (hall || !c.mate)) return null;
    var k = c.myClub != null && C().myClub ? C().myClub(c) : null, kit = (k && k.kit) || {}, tc = null, L = null, num = mate ? c.mate.num | 0 : c.player.num | 0;
    try { tc = VB.Players && VB.Players.kitFrom ? VB.Players.kitFrom({ kitShirt: kit.shirt, kitAccent: kit.accent, kitShorts: kit.shorts, kitPattern: kit.pattern }) : null; } catch (e) { tc = null; }
    var X = LOOK();
    if (X && X.matchLooks && X.resolve) {
      try {
        var look = c.life && c.life.look && typeof c.life.look === 'object' ? c.life.look : null;
        var f = X.matchLooks({ career: true, hall: hall, look: look, mate: c.mate && c.mate.name ? String(c.mate.name) : null }), fi = f && f[mate ? 1 : 0];
        if (fi) L = X.resolve(fi, hall ? 'hall' : 'beach', tc);
      } catch (e) { L = null; }
    }
    if (!L && VB.Players && VB.Players.baseLook) { try { L = VB.Players.baseLook({ team: 0, idx: mate ? 1 : 0, num: num, role: hall ? String(c.player.roleKey || '') : '', beach: !hall }); } catch (e) { L = null; } }
    if (!L) return null;
    return { L: L, tc: tc, num: num, beach: !hall, pose: 'stand', face: face || 'neutra', yaw: 0.35, bg: mixHex(typeof kit.shirt === 'number' ? kit.shirt : 0xff5a2c, 0x1d1530, 0.6),
      size: Math.min(384, Math.round(Math.max(16, +px || 72) * 2 * vsc())) };
  }
  /** HTML del retrato (o el hueco con el dorsal mientras se pinta). Sin ui.js (pruebas) o sin petición: hueco sin imagen. */
  function ptHTML(c, who, px, cls, alt, face) {
    var r = ptReq(c, who, px, face);
    if (r && VB.UI && VB.UI.portraitHTML) { try { return VB.UI.portraitHTML(r, cls, alt); } catch (e) { } }
    var k = c && c.myClub != null && C().myClub ? C().myClub(c) : null, bg = hex(mixHex(k && typeof k.kit.shirt === 'number' ? k.kit.shirt : 0xff5a2c, 0x1d1530, 0.6));
    var n = who === 'mate' ? (c && c.mate ? c.mate.num : '') : (c && c.player ? c.player.num : '');
    return '<span class="pt pt-ph ' + (cls || '') + '" style="--pt-bg:' + bg + '" role="img" aria-label="' + esc(alt || '') + '">' + esc(n) + '</span>';
  }
  /** R8: el hub encola tu retrato y el del compañero a 72 px (para la previa del partido), una vez por apertura. */
  function prePt(c) {
    var A = VB.ctx && VB.ctx.actions; if (!c || !A || typeof A.portrait !== 'function') return;
    ['me', 'mate'].forEach(function (w) { var r = ptReq(c, w, 72); if (r) { try { A.portrait(r); } catch (e) { } } });
  }
  var tabsApi = null, subApi = null, rejArm = 0, stayArm = 0, offArm = -1;   // offArm: oferta de mitad de temporada pendiente de confirmar
  var GROUP_OF = { atk: 'Ataque', def: 'Defensa', phys: 'Físico' };
  var TIER_C = ['var(--tier0,#6b6390)', 'var(--tier1,#e08a45)', 'var(--tier2,#cfdbe9)', 'var(--tier3,#ffd23f)'];   // (los tonos de .bd-t de Jugadores)
  var TIER_N = ['Bloqueada', 'Bronce', 'Plata', 'Oro'];

  function C() { return VB.Career; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  /** Separadores con diseño (ui.js VB.UI.sep; trozos YA escapados): 'd' rombo, 'v' raya fina, 's' barra, 'c' pastillas. */
  function sp(parts, kind) {
    parts = parts.filter(function (p) { return p !== '' && p != null; });
    return VB.UI && VB.UI.sep ? VB.UI.sep(parts, kind, true) : parts.join(' · ');
  }
  var SV = '<span class="sep sep-v"><span class="sr">, </span></span>'; // raya fina suelta (entre trozos que ya son HTML)
  function hex(n) { return '#' + ('000000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function dec(v) { return v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  function snd(k) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(k || 'click'); } catch (e) { } }
  function diffName(k) { return (VB.DIFF && VB.DIFF[k] && VB.DIFF[k].name) || k; }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  // Dificultad de la Carrera (c.diff; CDIFF en career.js, notes/carrera.md §Dificultad). Sin CDIFF (career.js antiguo) no se pinta nada.
  function CD() { return (C() && C().CDIFF) || null; }
  function DKEYS() { return (C() && C().CDIFF_KEYS) || ['easy', 'normal', 'hard', 'expert']; }
  /** Clave de dificultad de la carrera (o de un sello d de historial/palmarés); 'normal' si falta o no existe. */
  function dkey(c, d) {
    var D = CD(), k = d !== undefined ? d : (C().diffOf ? C().diffOf(c) : c && c.diff);
    return D && D[k] ? k : 'normal';
  }
  function dName(k) { var D = CD(); return D && D[k] ? D[k].name : diffName(k); }
  /** ¿La carrera ha usado alguna vez algo que no sea Normal? (si no, Palmarés y Temporadas se quedan como siempre) */
  function diffUsed(c) {
    if (!CD() || !c) return false;
    if (dkey(c) !== 'normal') return true;
    var o = function (x) { return x && x.d && x.d !== 'normal'; };
    return (c.history || []).some(o) || (c.trophies || []).some(o);
  }
  /** Número con coma y sin «,0» (7 → «7», 6.7 → «6,7»). */
  function num1(v) { var t = dec(v); return t.slice(-2) === ',0' ? t.slice(0, -2) : t; }
  function kitSw(k, big) {
    var s = hex(k.shirt), a = hex(k.accent), sh = hex(k.shorts), bg;
    if (k.pattern === 'franjas') bg = 'linear-gradient(180deg,' + s + ' 0 48%,' + a + ' 48% 62%,' + s + ' 62% 68%,' + a + ' 68% 73%,' + sh + ' 73%)';
    else if (k.pattern === 'rayas') bg = 'repeating-linear-gradient(90deg,' + s + ' 0 6px,' + a + ' 6px 8px),' + s;
    else if (k.pattern === 'liso') bg = 'linear-gradient(180deg,' + s + ' 0 72%,' + sh + ' 72%)';
    else bg = 'linear-gradient(160deg,' + s + ' 0 40%,' + a + ' 40% 52%,' + s + ' 52% 72%,' + sh + ' 72%)';
    return '<i class="cr-kit' + (big ? ' big' : '') + '" style="background:' + bg + '" aria-hidden="true"></i>';
  }
  function notaCls(n) { return n >= 8 ? 'n-top' : n >= 7 ? 'n-good' : n >= 6 ? 'n-ok' : n >= 5 ? 'n-meh' : 'n-bad'; }
  /** «del Circuito Regional» / «de la Hiperliga de Playa». */
  function deL(L) { return (L.art === 'el' ? 'del ' : 'de la ') + L.name; }
  function lab(k) { var LB = VB.Prog && VB.Prog.LABEL; return (LB && LB[k] || k).toLowerCase(); }
  /** «+4 sobre el club» / «−3 bajo el club» / «al nivel del club» (desvío de la media del compañero respecto a la del club). */
  function vsClub(d) { return d >= 2 ? '+' + d + ' sobre el club' : d <= -2 ? '−' + (-d) + ' bajo el club' : 'al nivel del club'; }
  /** Desvío con signo: «+4», «−3», «±0». */
  function sgn(d) { return d > 0 ? '+' + d : d < 0 ? '−' + (-d) : '±0'; }
  /** Objetivo en corto para la tabla de Comparar (la frase entera va en la ficha de la oferta). */
  function objShort(t) {
    t = String(t || '');
    if (!t) return '—';
    if (/^Ganar/.test(t)) return 'Campeón';
    if (/^Subir/.test(t)) return 'Ascenso';
    var m = /entre los (\d+) primeros/.exec(t);
    if (m) return 'Top ' + m[1];
    if (/descenso/.test(t)) return 'Salvarse';
    return t.replace(/\s*\(.*\)$/, '');
  }
  /** Ficha corta de un compañero m del club de media clubOvr: línea de pastillas (rol, media y desvío, estilo[, forma]) y una frase
   *  con sus puntos fuertes y flojos (VB.Career.mateProfile). withForm: enseña la forma (solo compañeros de tu plantilla). */
  function mateLine(m, clubOvr, withForm) {
    var pr = C().mateProfile(m), d = pr.ovr - clubOvr, tag = d >= 3 ? 'g' : d <= -3 ? 'r' : '';
    // (el desvío va en su propia pastilla, verde o roja si se nota: antes era una pastilla dentro de la de la media y se salía
    // de la columna de la oferta)
    var chips = [esc(m.role), 'Media ' + pr.ovr, { h: esc(vsClub(d)), c: tag ? 'dv ' + tag : 'dv' }, esc(m.style || '')];
    if (withForm) chips.push('Forma: ' + esc(C().formText(m.form | 0)));
    var h = '<p class="muted" style="margin:2px 0 0">' + sp(chips, 'c') + '</p>';
    var s = pr.strong.length ? 'Fuerte en ' + pr.strong.map(lab).join(', ').replace(/, ([^,]*)$/, ' y $1') : '', w = pr.weak.length ? 'flojo en ' + pr.weak.map(lab).join(', ').replace(/, ([^,]*)$/, ' y $1') : '';
    if (s || w) h += '<p class="muted" style="margin:2px 0 0">' + esc(s ? s + (w ? '; ' + w : '') : w.charAt(0).toUpperCase() + w.slice(1)) + '.</p>';
    return h;
  }

  // =================================================================== estilos
  var CSS = [
    '#career{position:absolute;inset:0;z-index:16;display:flex;justify-content:center;box-sizing:border-box;',
    ' padding:calc(10px + var(--st,0px)) calc(14px + var(--sr,0px)) calc(10px + var(--sbm,0px)) calc(14px + var(--sl,0px));',
    ' background:linear-gradient(90deg,rgba(29,21,48,.95),rgba(29,21,48,.86) 60%,rgba(29,21,48,.7));color:var(--fg,#f7f2ea);font-family:var(--ui);',
    ' opacity:0;transition:opacity .25s ease}',
    '#career.in{opacity:1}',
    '#career[hidden]{display:none}',
    '#career *{box-sizing:border-box}',
    '#career .cr-in{width:min(1000px,100%);height:100%;display:flex;flex-direction:column;gap:8px;min-height:0}',
    // pantallas grandes (index.html le pone zoom:var(--vs) y height:calc(100% / var(--vs))): en el Chrome actual (zoom estándar) el
    // % ya se resuelve sin zoom y la Carrera se quedaba en la mitad de arriba a 2560×1440 (medido: 825 de 1420 px). Alto completo:
    '#app #career .cr-in{height:100%}',
    // a 2560×1440 la cabecera quedaba pegada al borde de arriba: algo de aire en pantallas grandes
    '@media (min-width:1800px) and (min-height:1000px){#career{padding-top:calc(26px + var(--st,0px))}}',
    '#career button{font:800 17px/1.1 var(--display);letter-spacing:.05em;text-transform:uppercase;color:#fff;border:0;border-radius:12px;min-height:44px;padding:0 16px;cursor:pointer;',
    ' background:var(--cel-a);box-shadow:inset 0 0 0 2.5px var(--tk),3px 4px 0 var(--tk);text-shadow:var(--ring1),1.5px 2px 0 var(--tk);transition:transform .12s,box-shadow .12s,background .15s}',
    '#career button:hover{transform:translateY(-1px)}',
    '#career button:active{transform:translateY(2px);box-shadow:inset 0 0 0 2.5px var(--tk),1px 1px 0 var(--tk)}',
    '#career button:focus{outline:none}',
    '#career button:focus-visible,#career button.kf,#career input:focus-visible{outline:none;box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 0 0 5px #ffb238,3px 4px 0 var(--tk)}',
    '#career button.pri{background:var(--pri);box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 4px 0 rgba(255,255,255,.25),4px 5px 0 var(--tk)}',
    '#career button.pri:focus-visible,#career button.pri.kf{box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 0 0 5px #fff,4px 5px 0 var(--tk)}',
    '#career button.warn{background:linear-gradient(180deg,var(--bad) 0 50%,#e0384f 50% 100%)}',
    '#career button[aria-pressed="true"]{background:linear-gradient(180deg,var(--gold) 0 50%,#f2b51c 50% 100%);color:var(--tk);text-shadow:none}',
    '#career .cr-head{display:flex;align-items:center;gap:12px;flex:none}',
    '#career .cr-title{flex:1;min-width:0}',
    '#career .cr-title small{display:block;font:800 12px var(--display);letter-spacing:.3em;text-transform:uppercase;color:var(--gold);text-shadow:var(--ring1)}',
    '#career .cr-title b{display:block;font:900 26px/1.05 var(--display);letter-spacing:.04em;text-transform:uppercase;text-shadow:var(--ring2),2px 3px 0 var(--tk);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#career .cr-ovr{text-align:center;font:900 30px/1 var(--display);color:var(--gold);text-shadow:var(--ring2),2px 3px 0 var(--tk)}',
    '#career .cr-ovr small{display:block;font:800 10px var(--display);letter-spacing:.24em;color:var(--soft);text-shadow:var(--ring1)}',
    '#career .cr-tabs{display:flex;gap:6px;overflow-x:auto;flex:none;padding:2px 4px 6px 2px;scrollbar-width:none}',
    '#career .cr-tabs[hidden]{display:none}',
    // (aviso de que hay más a los lados: desvanecido en los bordes de la fila que se desplaza, solo si no cabe —clase ovf, la pone fitBar—)
    '#career .ovf:not(.tabs),#career .ovf .tb-row{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 24px),transparent)}',
    // REV-8: .ovf se mide al pintar (con la Carrera aún oculta puede salir 0); VB.Splat.more lo rehace al cambiar de tamaño → .sp-more-x
    '#career .tabs .tb-row.sp-more-x{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent)}',
    '#career .cr-tabs::-webkit-scrollbar{display:none}',
    // (sin ui.js —pruebas—: botones sueltos; con ui.js las barras son el componente común VB.UI.tabs, estilos más abajo)
    '#career .cr-tabs:not(.tabs) button{flex:none;font-size:16px;padding:0 14px}',
    '#career .cr-tabs:not(.tabs) button[aria-selected="true"]{background:var(--pri)}',
    '#career .cr-tabs .dot,#career .cr-sub .dot{display:inline-block;width:9px;height:9px;margin-left:2px;border-radius:50%;background:#ff8040;box-shadow:0 0 0 1.5px var(--tk);vertical-align:2px}',
    // pestañas con el componente común (index.html «MENÚS v2»: .tabs/.tb-row/.tab/.tb-k); #career button pesa más (id): se rehace aquí
    '#career .tabs{margin:0;padding:0;overflow:visible}',
    '#career .tabs .tab{flex:1 0 auto;min-height:40px;padding:6px 12px;border-radius:11px;font:800 15px/1 var(--display);letter-spacing:.08em;color:var(--soft);background:transparent;box-shadow:none;text-shadow:none;transform:none;gap:6px}',
    '#career .tabs .tab:hover:not(.on){background:rgba(255,255,255,.09);color:#fff}',
    '#career .tabs .tab.on{color:var(--tk);background:linear-gradient(180deg,var(--gold) 0 50%,#ffc21a 50% 100%);box-shadow:inset 0 0 0 2px var(--tk),2px 3px 0 var(--tk)}',
    '#career .tabs .tab.kf,#career .tabs .tab:focus-visible{outline:3px solid #fff;outline-offset:1px}',
    '#career .tabs .tb-k{min-height:0;height:30px;min-width:32px;padding:0 7px;border-radius:9px;font:800 13px/1 var(--display);letter-spacing:.04em;color:var(--tk);background:#fff7e8;box-shadow:inset 0 0 0 1.5px var(--tk),0 3px 0 var(--tk);text-shadow:none}',
    '#career .tabs .tb-k:empty,#career .tabs.tb-touch .tb-k{display:none}',
    // segundo nivel (sub-pestañas): la misma barra, más baja y sin pistas de tecla (Q/E cambian el primer nivel; RePág/AvPág y LT/RT el segundo)
    '#career .cr-sub.tabs .tb-row{flex:0 1 auto;max-width:100%;background:rgba(29,21,48,.85);box-shadow:inset 0 0 0 1.5px rgba(29,21,48,.9)}',
    '#career .cr-sub.tabs .tab{flex:0 1 auto;min-width:120px;min-height:36px;font-size:15px;padding:5px 10px}',
    '#career .cr-sub.tabs .tb-k{display:none}',
    '.is-touch #career .tabs .tab,.is-touch #career .cr-sub.tabs .tab{min-height:44px}',
    '#career .cr-body{flex:1;min-height:0;overflow:auto;padding:4px 6px 28px 2px;overscroll-behavior:contain;-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(180deg,#000 calc(100% - 28px),transparent)}',
    '#app.cr-on #menu,#app.cr-on .hud-btns{visibility:hidden}',
    '#career .bd-msg{min-height:1.4em;margin:6px 0 0;font:700 13.5px var(--ui);color:var(--gold)}',
    '#career .card{background:linear-gradient(180deg,rgba(58,49,104,.97),rgba(46,39,86,.97) 90px);border-radius:14px;box-shadow:0 0 0 2.5px var(--tk),4px 5px 0 var(--tk);padding:12px 14px;margin:0 0 12px}',
    '#career h3{margin:0 0 8px;font:800 13px var(--display);letter-spacing:.3em;text-transform:uppercase;color:var(--gold);text-shadow:var(--ring1)}',
    '#career p{margin:4px 0;line-height:1.4;color:var(--fg2)}',
    '#career .muted{color:var(--muted);font-size:13.5px}',
    '#career .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
    '#career .grow{flex:1}',
    '#career .vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:center}',
    '#career .team{display:flex;align-items:center;gap:10px;min-width:0}',
    '#career .team.r{flex-direction:row-reverse;text-align:right}',
    '#career .team b{display:block;font:900 22px/1.05 var(--display);text-transform:uppercase;letter-spacing:.03em;text-shadow:var(--ring1),2px 2px 0 var(--tk);overflow:hidden;text-overflow:ellipsis}',
    '#career .team small{display:block;font:600 13px var(--ui);color:var(--soft)}',
    '#career .vs-mid{font:900 26px var(--display);color:var(--gold);text-shadow:var(--ring2)}',
    '#career .cr-kit{flex:none;display:inline-block;width:34px;height:40px;border-radius:9px 9px 6px 6px;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35),0 0 0 2px var(--tk),2px 3px 0 var(--tk)}',
    '#career .cr-kit.big{width:48px;height:56px}',
    '#career .kit-mini{width:16px;height:18px;border-radius:5px 5px 3px 3px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 0 0 1.5px var(--tk);vertical-align:-3px;margin-right:6px}',
    '#career .acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}',
    '#career .acts button{flex:1 1 180px}',
    '#career .nota{flex:none;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;font:900 28px var(--display);color:#fff;text-shadow:var(--ring2);box-shadow:0 0 0 2.5px var(--tk),3px 4px 0 var(--tk)}',
    '#career .nota span{display:block;text-align:center;line-height:.9}',
    '#career .nota small{display:block;font:800 11px var(--display);letter-spacing:.1em;margin-top:3px}',
    '#career .n-top{background:#2fbf71}#career .n-good{background:#6cc24a}#career .n-ok{background:#d9a520}#career .n-meh{background:#e07b2b}#career .n-bad{background:#d8364a}',
    '#career .tag{display:inline-block;padding:3px 9px;border-radius:999px;font:800 12px var(--display);letter-spacing:.12em;text-transform:uppercase;background:var(--tp2);box-shadow:0 0 0 1.5px var(--tk);margin:2px 4px 2px 0}',
    // (leyenda de la Liga en contorno, con el mismo tono que el borde de la fila: verde asciende, amarillo Open, rojo desciende)
    '#career .tag.g{background:rgba(75,224,160,.18);box-shadow:inset 0 0 0 2px var(--ok);color:#fff}#career .tag.y{background:rgba(255,210,63,.18);box-shadow:inset 0 0 0 2px var(--gold);color:#fff}#career .tag.r{background:rgba(255,90,110,.18);box-shadow:inset 0 0 0 2px var(--bad);color:#fff}',
    '#career .chip.dv.g{background:#2f8f5a;color:#fff}#career .chip.dv.r{background:var(--bad-d);color:#fff}',
    // pista: colores del club (camiseta, segundo color y líbero)
    '#career .cr-dots{display:inline-flex;gap:4px;vertical-align:-3px}#career .cr-dot{display:inline-block;width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1.5px var(--tk)}',
    '#career .cf>.card .seg button{min-height:44px}',
    '#career table{width:100%;border-collapse:collapse;font:600 14px var(--ui)}',
    '#career th{font:800 11px var(--display);letter-spacing:.18em;text-transform:uppercase;color:var(--muted);text-align:right;padding:4px 6px}',
    '#career td{padding:7px 6px;text-align:right;border-top:1px solid var(--sep);font-variant-numeric:tabular-nums}',
    '#career th.l,#career td.l{text-align:left}',
    '#career .nw{white-space:nowrap}',
    '#career td.club{text-align:left;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0;width:50%}',
    '#career button.cw-tl-b{all:unset;cursor:pointer;font:inherit;color:inherit;min-height:32px;line-height:32px;border-radius:6px;padding:0 2px}#career button.cw-tl-b:hover{text-decoration:underline}#career button.cw-tl-b:focus-visible,#career button.cw-tl-b.kf{box-shadow:inset 0 0 0 2px #ffb238}',
    '#career tr.me td{background:rgba(255,128,64,.22)}',
    '#career tr.up td:first-child{box-shadow:inset 4px 0 0 var(--ok)}',
    '#career tr.cup td:first-child{box-shadow:inset 4px 0 0 var(--gold)}',
    '#career tr.down td:first-child{box-shadow:inset 4px 0 0 var(--bad)}',
    '#career td.pts{font:900 17px var(--display);color:var(--gold)}',
    '#career .lg-sw{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '#career .lg-sw button{font-size:14px;min-height:44px;padding:0 10px}',
    // pista: países por continente al crear; en Clasificación, en el móvil, una sola fila que se desliza
    '#career .cc-reg{margin:6px 0 4px;font:800 11px var(--display);letter-spacing:.16em;text-transform:uppercase}',
    '@media (max-width:900px){#career .cc-row{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}#career .cc-row::-webkit-scrollbar{display:none}#career .cc-row button{flex:0 0 auto}}',
    '#career .cal{display:grid;gap:6px}',
    '#career .cal-r{display:grid;grid-template-columns:3.2em minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px 8px;border-radius:10px;background:rgba(0,0,0,.18)}',
    '#career .cal-r.next{background:rgba(255,128,64,.25);box-shadow:inset 0 0 0 2px #ff8040}',
    '#career .cal-r b{font:900 15px var(--display);letter-spacing:.06em;color:var(--muted)}',
    '#career .cal-r .res{font:800 15px var(--display);letter-spacing:.06em}',
    '#career span.w{color:#4be0a0}#career span.l{color:#ff7a8a}',   // (span: th.l / td.l son «alineado a la izquierda», no derrota)
    '#career .grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
    '#career .attr{display:grid;grid-template-columns:minmax(0,7.4em) minmax(0,1fr) 2.2em 60px;gap:8px;align-items:center;min-height:44px}',
    '#career .attr .bar{height:10px;border-radius:6px;background:rgba(0,0,0,.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);overflow:hidden}',
    '#career .attr .bar i{display:block;height:100%;background:var(--t0)}',
    '#career .attr b{font:900 18px var(--display);text-align:right}',
    '#career .attr button{min-height:44px;padding:0 6px;font:800 18px/1 var(--ui);letter-spacing:0;text-shadow:none;text-transform:uppercase}',
    '#career .xp{height:10px;border-radius:6px;background:rgba(0,0,0,.4);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);margin:6px 0}',
    '#career .xp i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#ff8040)}',
    '#career .bdg{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}',
    '#career .bd{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;align-items:center;text-align:left;text-transform:none;letter-spacing:0;font:600 13px/1.25 var(--ui);padding:8px 10px;min-height:64px}',
    '#career .bd .ic{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,.35);box-shadow:0 0 0 2px var(--tk)}',
    '#career .bd .ic svg{width:28px;height:28px}',
    '#career .bd strong{display:block;font:800 16px var(--display);letter-spacing:.04em;text-transform:uppercase}',
    '#career .bd .pg{display:block;height:6px;border-radius:4px;background:rgba(0,0,0,.4);overflow:hidden;margin-top:4px}',
    '#career .bd .pg i{display:block;height:100%;background:var(--gold)}',
    '#career .bd.lock{opacity:.6}',
    '#career .bd[aria-pressed="true"]{background:linear-gradient(180deg,rgba(255,210,63,.32),rgba(255,160,40,.22));color:#fff;text-shadow:var(--ring1)}',
    '#career .bd[aria-pressed="true"] strong::after{content:"equipada";margin-left:6px;padding:1px 6px;border-radius:999px;font:800 10.5px var(--ui);background:var(--gold);color:var(--tk);box-shadow:0 0 0 1.5px var(--tk);vertical-align:.1em}',
    '#career .new{animation:crPop .5s cubic-bezier(.2,1.4,.4,1) both}',
    '@keyframes crPop{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}',
    '#career .offer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--sep)}',
    '#career .offer:first-of-type{border-top:0}',
    '#career .meter{height:12px;border-radius:7px;background:rgba(0,0,0,.4);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}',
    '#career .meter i{display:block;height:100%}',
    // química con nombre (S3 C5): marcas de nivel a 30, 60 y 90 sobre el medidor
    '#career .meter{position:relative}#career .meter i.mk{position:absolute;top:0;bottom:0;width:2px;height:auto;background:rgba(29,21,48,.85);box-shadow:1px 0 0 rgba(255,255,255,.18)}',
    // B2: retratos (ui.js portraitHTML, clase base .pt de index.html) y escudos (career-world-ui.js crestSVG)
    '#career .cr-head .pt.cr-pt{width:44px;height:44px;border-radius:11px;box-shadow:0 0 0 2px var(--tk),2px 3px 0 var(--tk)}',
    '#career .cr-head .pt-ph.cr-pt{font-size:19px}',
    '#career .cr-hcr{flex:none;display:flex;align-items:center}',
    '#career .cr-ptw{position:relative;flex:none;display:inline-block;margin:0 6px 6px 0}',
    '#career .pt.cr-pt88{width:88px;height:88px;border-radius:16px;box-shadow:0 0 0 2.5px var(--tk),3px 4px 0 var(--tk)}',
    '#career .pt-ph.cr-pt88{font-size:34px}',
    '#career .cr-ptc{position:absolute;right:-9px;bottom:-9px;display:flex}',
    '#career .pt.cr-pt72{width:72px;height:72px;border-radius:14px;box-shadow:0 0 0 2.5px var(--tk),3px 4px 0 var(--tk)}',
    '#career .pt-ph.cr-pt72{font-size:28px}',
    '#career td.club .cw-crest-m,#career .cal-r .cw-crest-m{margin-right:6px;vertical-align:-6px}',
    '#career .team .cw-crest,#career .row>.cw-crest{flex:none}',
    // crear
    '#career .cf{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:12px 18px;align-items:start}',
    '#career .cf>.card{grid-column:1/-1;margin:0}',
    '#career .cf-col{display:grid;gap:12px;min-width:0}',
    '#career .cf label{display:block;font:800 13px var(--display);letter-spacing:.24em;text-transform:uppercase;color:var(--gold);text-shadow:var(--ring1);margin-bottom:6px}',
    '#career .cf input{width:100%;min-height:48px;border-radius:12px;border:0;padding:0 14px;font:700 20px var(--ui);color:#fff;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 0 0 4px rgba(255,255,255,.08)}',
    '#career .seg{display:flex;gap:8px;flex-wrap:wrap}',
    '#career .seg button{flex:1 1 0;min-width:64px}',
    '#career .roles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    '#career .roles button{display:block;text-align:left;padding:10px 12px;min-height:84px}',
    '#career .roles button small{display:block;margin-top:4px;font:600 12.5px var(--ui);letter-spacing:0;text-transform:none;color:inherit;opacity:.9}',
    '#career .stp{display:flex;align-items:center;gap:10px}',
    '#career .stp b{min-width:2.4em;text-align:center;font:900 32px var(--display);color:var(--gold);text-shadow:var(--ring2)}',
    '#career .stp button{width:52px;padding:0;font-size:26px}',
    // (auto-fill con 128 px por casilla: con 5 columnas fijas, en columnas estrechas quedaba «Colocación25» pegado)
    '#career .prev{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px 14px;font:600 12.5px var(--ui);color:var(--soft)}',
    '#career .prev span{display:flex;justify-content:space-between;gap:10px;min-width:0}',
    '#career .prev b{flex:none}',
    '#career .prev b{color:#fff}',
    '#career .bench{margin-top:8px;padding:8px 10px;border-radius:12px;background:rgba(224,123,43,.18);box-shadow:inset 0 0 0 2px #e07b2b}',
    '#career .bench p{margin:0}',
    '#career .fact b .mline{display:block;margin-top:3px}',
    '#career .confirm{margin-top:10px;padding:10px;border-radius:12px;background:rgba(168,40,58,.25);box-shadow:inset 0 0 0 2px var(--bad)}',
    // gestión (v2): sub-pestañas, fichas de oferta, bandeja, entrenamiento
    '#career .cr-sub{display:flex;gap:6px;overflow-x:auto;flex:none;padding:0 4px 4px 2px;scrollbar-width:none}',
    '#career .cr-sub::-webkit-scrollbar{display:none}',
    '#career .cr-sub[hidden]{display:none}',
    '#career .cr-sub:not(.tabs) button{flex:none;font-size:14px;min-height:44px;padding:0 12px;border-radius:999px;background:rgba(58,49,104,.97);text-shadow:var(--ring1)}',
    '#career .cr-sub:not(.tabs) button[aria-selected="true"]{background:linear-gradient(180deg,var(--gold) 0 50%,#f2b51c 50% 100%);color:var(--tk);text-shadow:none}',
    '#career .stars{color:var(--gold);letter-spacing:.08em;text-shadow:var(--ring1);white-space:nowrap}',
    '#career .stars .off{color:rgba(255,255,255,.22)}',
    '#career .fact{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}',
    '#career .fact div{padding:7px 10px;border-radius:10px;background:rgba(0,0,0,.2);min-width:0}',
    '#career .fact small{display:block;font:800 10.5px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}',
    '#career .fact b{display:block;font:700 15px/1.25 var(--ui);color:#fff;overflow-wrap:anywhere}',
    '#career .bigname{font:900 24px/1.05 var(--display);text-transform:uppercase;letter-spacing:.03em;margin:0;text-shadow:var(--ring1),2px 2px 0 var(--tk)}',
    '#career .cr-mn{font:800 17px var(--display);text-transform:uppercase}',
    '#career .msg{padding:9px 10px;border-radius:10px;background:rgba(0,0,0,.18);margin:0 0 8px}',
    '#career .msg.unread{background:rgba(255,128,64,.18);box-shadow:inset 3px 0 0 #ff8040}',
    '#career .msg b{display:block;font:800 15.5px var(--display);letter-spacing:.03em;text-transform:uppercase}',
    '#career .msg p{margin:3px 0 0}',
    '#career .msg small{font:700 11.5px var(--ui);color:var(--muted)}',
    '#career .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}',
    '#career .tgrid button{display:block;text-align:left;padding:8px 12px;min-height:64px}',
    '#career .tgrid button small{display:block;margin-top:4px;font:600 12.5px var(--ui);letter-spacing:0;text-transform:none;opacity:.9}',
    '#career .pbar{display:grid;grid-template-columns:minmax(0,6.5em) minmax(0,1fr) 3.4em;gap:8px;align-items:center;margin:6px 0}',
    '#career .pbar .bar{height:10px;border-radius:6px;background:rgba(0,0,0,.4);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}',
    '#career .pbar .bar i{display:block;height:100%;background:#4be0a0}',
    '#career .pbar b{font:800 14px var(--display);text-align:right}',
    // sesiones de entrenamiento (Partido): puntos de sesiones, filas de ejercicio con «Jugar» y «Rápido», última sesión y pelea por el puesto
    '#career .tr-dots{display:inline-flex;gap:5px;vertical-align:-2px}#career .tr-dots i{display:inline-block;width:13px;height:13px;border-radius:50%;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 2px var(--gold)}#career .tr-dots i.on{background:var(--gold);box-shadow:0 0 0 1.5px var(--tk)}',
    '#career .tr-left{font:800 12px var(--ui);letter-spacing:0;text-transform:none;color:var(--soft)}',
    '#career .tr-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:6px 12px;margin-top:8px}',
    '#career .tr-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;padding:4px 6px 4px 10px;border-radius:10px;background:rgba(0,0,0,.2)}',
    '#career .tr-n b{display:block;font:800 15px var(--display);letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#career .tr-n small{display:block;font:600 12px var(--ui);color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#career .tr-row button{min-height:40px;padding:0 12px;font-size:14px}',
    '.is-touch #career .tr-row button{min-height:44px}',
    '#career .tr-last{margin-top:8px;font-size:13.5px}#career .tr-up{color:#4be0a0}',
    '#career .tr-fight{margin-top:6px;font-size:13.5px}#career .tr-why{margin-top:6px;font:700 13.5px var(--ui);color:#ffb070}',
    // Plan del entrenador (P6, 15-nov-2026): tira de enfoque (5 botones, «Recomendado»), 3 casillas de sesión (se apilan en el móvil),
    // letras de nota (.gr), barra de fatiga, «Simular jornada» y «Entreno automático»
    '#career .pl-focus{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:4px 0 6px}',
    '#career .pl-focus button{min-height:48px;padding:4px 6px;font-size:14px;letter-spacing:.03em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}',
    '#career .pl-focus button small{font:800 9.5px var(--ui);letter-spacing:.06em;color:var(--gold);text-shadow:var(--ring1)}',
    '#career .pl-focus button[aria-pressed="true"] small{color:var(--tk);text-shadow:none}',
    '#career .pl-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,232px),1fr));gap:8px;margin-top:8px}',
    '#career .pl-s{position:relative;display:flex;flex-direction:column;gap:6px;padding:10px 10px 10px 12px;border-radius:12px;background:rgba(0,0,0,.24);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.08);min-width:0}',
    '#career .pl-s.cur{background:linear-gradient(160deg,rgba(255,178,56,.2),rgba(0,0,0,.22) 70%);box-shadow:inset 0 0 0 2px var(--gold)}',
    '#career .pl-s.done{opacity:.82}',
    '#career .pl-k{display:flex;align-items:center;gap:8px;font:800 11px var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}',
    '#career .pl-s.cur .pl-k{color:var(--gold)}',
    '#career .pl-k .tag{margin:0 0 0 auto;letter-spacing:.08em}',
    '#career .pl-n{display:flex;align-items:center;gap:10px;min-width:0}',
    '#career .pl-n>span:not(.gr){min-width:0;flex:1}',
    '#career .pl-n b{display:block;font:900 18px/1.05 var(--display);letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#career .pl-n small{display:block;font:600 12.5px/1.3 var(--ui);color:var(--soft)}',
    '#career .pl-b{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}',
    '#career .pl-b button{min-height:42px;padding:0 6px;font-size:14px;letter-spacing:.03em}',
    '#career .pl-b.one{grid-template-columns:minmax(0,1fr)}',
    '.is-touch #career .pl-b button{min-height:44px}',
    '#career .gr{flex:none;display:inline-grid;place-items:center;min-width:40px;height:40px;padding:0 4px;border-radius:10px;font:900 20px/1 var(--display);color:#fff;text-shadow:var(--ring1);box-shadow:0 0 0 2px var(--tk),2px 3px 0 var(--tk)}',
    '#career .gr.sm{min-width:28px;height:24px;border-radius:7px;font-size:14px;box-shadow:0 0 0 1.5px var(--tk)}',
    '#career .gr-ap,#career .gr-a{background:#2fbf71}#career .gr-b{background:#7cbf3a}#career .gr-c{background:#d9a520}#career .gr-d{background:#e07b2b}#career .gr-f{background:#d8364a}#career .gr-n{background:rgba(255,255,255,.14);color:var(--soft)}',
    '#career .pl-foot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;margin-top:10px}',
    '#career .pl-foot .meter{grid-column:1/-1}',
    '#career .pl-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '#career .pl-acts button{flex:1 1 200px}',
    '#career .pl-acts button[data-act="tr-auto"]::before{content:"";display:inline-block;width:14px;height:14px;margin-right:8px;border-radius:4px;vertical-align:-1px;box-shadow:inset 0 0 0 2px currentColor}',
    '#career .pl-acts button[data-act="tr-auto"][aria-pressed="true"]::before{background:var(--tk);box-shadow:inset 0 0 0 2px var(--tk),inset 0 0 0 4px var(--gold)}',
    '@media (max-width:480px){#career .pl-focus{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    // prueba con partidillo (P4): previa (club, «1 set a 15» con petos, 3 objetivos, «Saltar a la pista» / «Simular») y resultado
    '#career .tp-hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:14px;margin:-12px -14px 10px;padding:16px 14px 14px;border-radius:14px 14px 0 0;',
    ' background:linear-gradient(115deg,var(--tpc,#3a3168) 0 46%,rgba(29,21,48,.0) 46.2%),linear-gradient(180deg,rgba(29,21,48,.55),rgba(29,21,48,.95));box-shadow:inset 0 -2.5px 0 var(--tk)}',
    '#career .tp-hero::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,transparent 0 22px,rgba(255,255,255,.05) 22px 24px);pointer-events:none}',
    '#career .tp-hero>*{position:relative;z-index:1}',
    '#career .tp-hero small{display:block;font:800 11.5px var(--display);letter-spacing:.3em;text-transform:uppercase;color:var(--gold);text-shadow:var(--ring1)}',
    '#career .tp-hero b{display:block;font:900 clamp(26px,6.4vw,38px)/1 var(--display);letter-spacing:.03em;text-transform:uppercase;text-shadow:var(--ring2),3px 3px 0 var(--tk);overflow-wrap:anywhere}',
    '#career .tp-hero span.muted{display:block;margin-top:4px;color:#e8e2f6;text-shadow:var(--ring1)}',   // (con contorno: en el móvil la 2.ª línea cae sobre la cuña del color del club, que puede ser claro)
    '#career .tp-eye{font:800 15px var(--ui);color:#fff;margin:2px 0 8px}',
    '#career .tp-fmt{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:0 0 6px;font:900 20px var(--display);letter-spacing:.04em;text-transform:uppercase}',
    '#career .tp-fmt .sep{opacity:.8}',
    '#career .tp-bibs{display:inline-flex;gap:6px;vertical-align:middle}',
    '#career .tp-bib{display:inline-block;width:26px;height:30px;border-radius:9px 9px 5px 5px;box-shadow:0 0 0 2px var(--tk),2px 2px 0 var(--tk);',
    ' -webkit-mask:radial-gradient(circle at 50% 0,transparent 6px,#000 6.5px);mask:radial-gradient(circle at 50% 0,transparent 6px,#000 6.5px)}',
    '#career .tp-goals{list-style:none;margin:6px 0 4px;padding:0;display:grid;gap:6px}',
    '#career .tp-goals li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:11px;background:rgba(0,0,0,.24);box-shadow:inset 3px 0 0 var(--gold);font:800 16px var(--display);letter-spacing:.03em;text-transform:uppercase}',
    '#career .tp-goals li i{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;font:900 14px var(--display);font-style:normal;color:var(--tk);background:var(--gold);box-shadow:0 0 0 1.5px var(--tk)}',
    '#career .tp-acts{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:10px;margin-top:12px}',
    '#career .tp-acts button{min-height:56px}',
    '#career .tp-acts button.pri{font-size:21px}',
    '#career .tp-acts small{display:block;font:700 12px var(--ui);letter-spacing:0;text-transform:none;opacity:.9}',
    '@media (max-width:480px){#career .tp-acts{grid-template-columns:minmax(0,1fr)}}',
    // teléfono apaisado: los botones justo bajo la cabecera del club (como .offer-full), el resto debajo
    '@media (max-height:420px) and (max-aspect-ratio:5/4){#career .card.tp{display:flex;flex-direction:column}#career .tp-hero{order:-2;padding:10px 14px 10px;gap:10px}#career .tp-hero b{font-size:24px}#career .tp-acts{order:-1;margin:0 0 8px}#career .tp-acts button{min-height:48px}#career .tp-goals li{padding:5px 10px;font-size:15px}}',
    '#career .tp-res .row{flex-wrap:nowrap;align-items:center}',
    '#career .tp-res .bigname{font-size:26px}',
    '#career .et-l{flex:none;display:grid;place-items:center;align-content:center;width:72px;height:72px;border-radius:18px;color:#fff;box-shadow:0 0 0 2.5px var(--tk),3px 4px 0 var(--tk)}',
    '#career .et-l b{font:900 36px/.9 var(--display);text-shadow:var(--ring2)}#career .et-l small{font:800 11px var(--display);letter-spacing:.12em;margin-top:3px}',
    '#career .l-a{background:linear-gradient(160deg,#3bd47f,#1f9c58)}#career .l-b{background:linear-gradient(160deg,#8fd14a,#5c9e28)}#career .l-c{background:linear-gradient(160deg,#f0bd2e,#c48a12)}#career .l-d{background:linear-gradient(160deg,#ec5a5a,#b52c3e)}',
    '#career .et-goals{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '#career .et-goals span{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font:700 13px var(--ui);background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.18)}',
    '#career .et-goals span.ok{box-shadow:inset 0 0 0 2px var(--ok)}#career .et-goals span.no{box-shadow:inset 0 0 0 2px var(--bad)}',
    '#career .et-goals i{font-style:normal;font-weight:900}#career .et-goals .ok i{color:#4be0a0}#career .et-goals .no i{color:#ff7a8a}',
    '#career .et-goals .sr,#end .et-goals .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '#career .mate{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--sep)}',
    '#career .mate:first-of-type{border-top:0}',
    '#career .pick-acts{display:flex;gap:10px;flex-wrap:wrap}',
    '#career .pick-acts button{flex:1 1 200px}',
    '#career .note{min-height:1.4em;margin:6px 0 0;font:700 13.5px var(--ui);color:var(--gold)}',
    '#career td button{min-height:40px;font-size:13px;padding:0 10px}',
    // dificultad: 4 botones en 2 columnas (crear) y el botón pequeño «Cambiar» de Partido
    '#career .roles.diffs{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '#career .roles.diffs button{min-height:64px}',
    '#career .dh{display:none;margin:6px 0 0}',
    '#career button.lnk{min-height:32px;padding:0 10px;font-size:13px;border-radius:9px;margin-left:8px;vertical-align:middle}',
    '.is-touch #career button.lnk{min-height:44px}',
    // pantallas bajas (teléfono apaisado)
    '@media (max-height:520px){',
    ' #career .cr-in{gap:5px}',
    ' #career .cr-title b{font-size:20px}',
    ' #career .cr-title small{font-size:10.5px;letter-spacing:.22em}',
    ' #career .cr-ovr{font-size:24px}',
    ' #career .cr-tabs{padding-bottom:4px}',
    ' #career .cr-tabs button{font-size:14.5px;padding:0 11px}',
    ' #career .card{padding:9px 11px;margin-bottom:9px}',
    ' #career .team b{font-size:18px}',
    ' #career .cr-kit.big{width:38px;height:44px}',
    ' #career .team .cw-crest{width:40px;height:45px}',   // (escudo del VS al tamaño de la muestra de antes: la tarjeta no crece)
    ' #career .nota{width:54px;height:54px;font-size:24px}',
    ' #career .roles button{min-height:70px}',
    ' #career .cr-sub{padding-bottom:3px}',
    ' #career .cr-head button{min-height:44px}',
    ' #career .tabs .tb-row{padding:2px}',
    ' #career .bigname{font-size:20px}',
    ' #career .fact{gap:6px;margin:6px 0}',
    ' #career .fact div{padding:5px 8px}',
    '}',
    // teléfono apaisado (≤ 420 px de alto): «‹ Jugar» y la media a la izquierda de la barra de apartados, en la misma fila (sin el
    // título: el nombre y el club salen en las tarjetas). Antes: cabecera + 2 filas de pestañas dejaban ~210 px de contenido
    // (móvil apaisado 18-nov-2026: lo lleva PH_CSS con html.ph; esto queda para ventanas bajas y estrechas)
    '@media (max-height:420px) and (max-aspect-ratio:5/4){',
    ' #career .cr-in{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr);gap:5px 8px}',
    ' #career .cr-head{grid-column:1;grid-row:1;gap:8px}',
    ' #career .cr-head .cr-title{display:none}',
    ' #career .cr-head .cr-ovr{font-size:20px}',
    ' #career .cr-head .pt.cr-pt{width:36px;height:36px;border-radius:9px}',
    ' #career .cr-head .pt-ph.cr-pt{font-size:16px}',
    ' #career .cr-head .cr-hcr{display:none}',
    ' #career .cr-in:has(>.cr-tabs[hidden]) .cr-head .cr-hcr{display:flex}',
    ' #career .pt.cr-pt88{width:72px;height:72px}',
    ' #career .pt.cr-pt72{width:56px;height:56px;border-radius:12px}',
    ' #career .cr-head .cr-ovr small{font-size:11px;letter-spacing:.08em}',
    ' #career .cr-tabs{grid-column:2;grid-row:1;padding:0}',
    ' #career .cr-sub{grid-column:1/-1;grid-row:2;padding:0}',
    ' #career .cr-body{grid-column:1/-1;grid-row:3}',
    ' #career .cr-in:has(>.cr-tabs[hidden]) .cr-head{grid-column:1/-1}',
    ' #career .cr-in:has(>.cr-tabs[hidden]) .cr-head .cr-title{display:block}',
    ' #career .card.offer-full{display:flex;flex-direction:column}',
    ' #career .card.offer-full>.row{order:-2}',
    ' #career .card.offer-full>.acts{order:-1;margin:8px 0 4px}',
    ' #career .offer-x{display:flex;flex-direction:column}',
    ' #career .offer-x>.row{order:-2}',
    ' #career .offer-x>.acts{order:-1;margin:6px 0 4px}',
    // (a 667×375 no caben las cuatro ayudas: se ve la del nivel elegido debajo, en una línea)
    ' #career .roles.diffs button{min-height:48px}',
    ' #career .roles.diffs button small{display:none}',
    ' #career .dh{display:block}',
    '}',
    '.is-touch #career td button{min-height:44px}',
    '@media (max-width:700px){',
    ' #career .grid2,#career .cf{grid-template-columns:minmax(0,1fr)}',
    ' #career .roles{grid-template-columns:minmax(0,1fr)}',
    ' #career .roles button{min-height:56px}',
    ' #career .prev{grid-template-columns:repeat(2,minmax(0,1fr))}',
    ' #career .roles.diffs{grid-template-columns:repeat(2,minmax(0,1fr))}',
    ' #career td.hide-s,#career th.hide-s{display:none}',
    '}',
    '@media (prefers-reduced-motion:reduce){#career,#career *{transition:none!important;animation:none!important}}',
    // Hoja final de un partido de Carrera en teléfonos (≤ 420 px de alto; main.js marca #end.career en careerEndSheet): con la nota,
    // la XP, la subida de nivel y las insignias, «Menú principal» quedaba fuera a 667×375 (hoja de 424 px en 341). Sin «Jugada más
    // larga» (la Carrera ya da la nota) y los dos botones en una fila (el largo en dos líneas): cabe entera (350 en 341, el
    // botón entero a la vista; medido en notes/carrera.md).
    '@media (max-height:420px){',
    ' #end.career .end-rec>span{display:none}',
    ' #end.career .end-xp,#end.career .end-bd{margin-top:2px}',
    ' #end.career .end-sets{margin-top:4px}',
    ' #end.career .row-btn{display:flex;gap:8px;margin-top:8px}',
    ' #end.career .row-btn button{flex:1 1 0;min-width:0;padding:4px 8px;white-space:normal;line-height:1.05;font-size:14px;letter-spacing:.03em}',
    ' #end.career #btnAgain{flex-grow:1.25}',
    // (la hoja queda más baja que la columna de estadísticas: sin este alto mínimo «Ver celebración», abajo a la derecha, pisaba «Mejor racha»; con insignias ya crece sola)
    ' #end.career .sheet{min-height:min(334px,100%)}',
    '}',
    // Hoja final del partidillo de prueba (main.js trialEndSheet, #end.career.trial): letra grande con la nota, veredicto y los 3
    // objetivos con su marca; sin las líneas de récord de Partido rápido
    '#end.trial #endRecord>span,#end.trial #endStats{display:none}',
    '#end .end-trialbox{margin:10px 0 6px}',
    '#end .end-trial{display:flex;align-items:center;gap:14px;width:100%;margin:10px 0 2px;text-align:left}',
    '#end .end-trial .et-l{flex:none;display:grid;place-items:center;align-content:center;width:84px;height:84px;border-radius:20px;color:#fff;box-shadow:0 0 0 3px var(--tk),4px 5px 0 var(--tk);animation:etPop .6s .25s cubic-bezier(.2,1.5,.4,1) both}',
    '#end .end-trial .et-l b{font:900 44px/.9 var(--display);text-shadow:var(--ring2),2px 3px 0 var(--tk)}',
    '#end .end-trial .et-l small{font:800 12px var(--display);letter-spacing:.1em;margin-top:4px}',
    '#end .end-trial .et-t strong{display:block;font:900 22px/1.05 var(--display);letter-spacing:.04em;text-transform:uppercase;text-shadow:var(--ring1)}',
    '#end .end-trial .et-t span{display:block;margin-top:3px;font:600 14px/1.3 var(--ui);color:var(--fg2,#e9e1f4)}',
    '#end .end-trial.pass .et-t strong{color:#4be0a0}#end .end-trial.fail .et-t strong{color:#ff9aa6}',
    '#end .l-a{background:linear-gradient(160deg,#3bd47f,#1f9c58)}#end .l-b{background:linear-gradient(160deg,#8fd14a,#5c9e28)}#end .l-c{background:linear-gradient(160deg,#f0bd2e,#c48a12)}#end .l-d{background:linear-gradient(160deg,#ec5a5a,#b52c3e)}',
    '#end .et-goals{display:flex;flex-wrap:wrap;gap:6px;width:100%;margin-top:8px}',
    '#end .et-goals>span{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font:700 13px var(--ui);text-transform:none;letter-spacing:0;background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.18)}',
    '#end .et-goals>span.ok{box-shadow:inset 0 0 0 2px #4be0a0}#end .et-goals>span.no{box-shadow:inset 0 0 0 2px #ff5a6e}',
    '#end .et-goals i{font-style:normal;font-weight:900;margin-right:3px}#end .et-goals small{margin-left:4px}#end .et-goals .ok i{color:#4be0a0}#end .et-goals .no i{color:#ff7a8a}',
    '@keyframes etPop{from{transform:scale(.4) rotate(-12deg);opacity:0}to{transform:none;opacity:1}}',
    '#end .end-trial .et-t{min-width:0}#end .end-trial{align-items:flex-start}',
    '@media (max-height:420px){#end.trial .end-sets{display:none}#end .end-trialbox{margin:4px 0 2px}#end .end-trial{margin:0;gap:10px}#end .end-trial .et-l{width:52px;height:52px;border-radius:14px;box-shadow:0 0 0 2.5px var(--tk),3px 3px 0 var(--tk)}#end .end-trial .et-l b{font-size:28px}#end .end-trial .et-l small{font-size:10px;margin-top:2px}',
    ' #end .end-trial .et-t strong{font-size:16px}#end .end-trial .et-t span{font-size:12px;margin-top:1px}#end .et-goals{margin-top:3px;gap:3px 4px}#end .et-goals>span{padding:1px 7px;font-size:11.5px}}',    // Hoja final de una sesión de entrenamiento de la Carrera (ui.js gymEndShow con g.careerDrill): letra grande (.cdr-g), «Récord:
    // B → A», barra del atributo que se llena de prog0 a prog (+1 si sube), fatiga y «¡Primera vez! +50 %»
    '#gymEnd .cdr-g{display:grid;place-items:center;align-content:center;width:76px;height:76px;border-radius:18px;color:#fff;box-shadow:0 0 0 3px var(--tk),4px 5px 0 var(--tk);animation:etPop .6s .2s cubic-bezier(.2,1.5,.4,1) both}',
    '#gymEnd .cdr-g b{font:900 40px/.9 var(--display);text-shadow:var(--ring2),2px 3px 0 var(--tk)}#gymEnd .cdr-g small{font:800 10.5px var(--display);letter-spacing:.14em;margin-top:3px}',
    '#gymEnd .gr-ap,#gymEnd .gr-a{background:linear-gradient(160deg,#3bd47f,#1f9c58)}#gymEnd .gr-b{background:linear-gradient(160deg,#8fd14a,#5c9e28)}#gymEnd .gr-c{background:linear-gradient(160deg,#f0bd2e,#c48a12)}#gymEnd .gr-d{background:linear-gradient(160deg,#f08a3a,#c25a17)}#gymEnd .gr-f{background:linear-gradient(160deg,#ec5a5a,#b52c3e)}',
    '#gymEnd .cdr-bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;margin:2px 0}',
    '#gymEnd .cdr-bar>span:first-child{font:800 14px var(--display);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}',
    '#gymEnd .cdr-bar .bar{position:relative;height:12px;border-radius:7px;background:rgba(0,0,0,.45);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);overflow:hidden}',
    '#gymEnd .cdr-bar .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:7px}',
    '#gymEnd .cdr-bar .bar i.b0{background:rgba(255,255,255,.35)}',
    '#gymEnd .cdr-bar .bar i.b1{background:linear-gradient(90deg,#ffd23f,#4be0a0);width:var(--to);animation:cdrFill 1.1s .45s cubic-bezier(.3,.8,.3,1) both}',
    '#gymEnd .cdr-bar b{font:900 15px var(--display);color:#4be0a0;white-space:nowrap}',
    '@keyframes cdrFill{from{width:var(--from)}to{width:var(--to)}}',
    '#gymEnd .cdr-tags{display:flex;flex-wrap:wrap;gap:6px}',
    '#gymEnd .cdr-tags>span{padding:3px 9px;border-radius:999px;font:800 12px var(--display);letter-spacing:.1em;text-transform:uppercase;background:rgba(255,210,63,.18);box-shadow:inset 0 0 0 2px var(--gold,#ffd23f);color:#fff}',
    '@media (max-height:420px){#gymEnd .cdr-g{width:54px;height:54px;border-radius:14px}#gymEnd .cdr-g b{font-size:28px}#gymEnd .cdr-bar .bar{height:9px}}',
    '@media (prefers-reduced-motion:reduce){#end .end-trial .et-l,#gymEnd .cdr-g,#gymEnd .cdr-bar .bar i.b1{animation:none!important}}',
    // Nota en directo (notes/nota-en-directo-spec.md §6.3-6.4). Colores por franja, los mismos en la píldora, el aviso y la hoja
    // final: rojo de error (< 5), ámbar (5-5,9), blanco del marcador (6-6,9), verde de «ok» (7-7,9) y el dorado de las insignias
    // (≥ 8). Todos ≥ 3:1 (cifra grande) sobre el morado del marcador; los textos pequeños de los avisos, con los tonos claros.
    ':root{--rt-bad:#ff5a6e;--rt-low:#ffb238;--rt-mid:#f7f2ea;--rt-good:#4be0a0;--rt-top:#ffd23f}',
    '.rt-bad{--rc:var(--rt-bad)}.rt-low{--rc:var(--rt-low)}.rt-mid{--rc:var(--rt-mid)}.rt-good{--rc:var(--rt-good)}.rt-top{--rc:var(--rt-top)}',
    // píldora «NOTA 6,8» bajo el marcador (ui.js rtTick, dentro de #sb: escala con él; 28 px × 0,78 = 22 px de alto a 390 de alto)
    '.rt-row{display:flex;align-items:center;gap:8px;margin-top:9px;pointer-events:none}',
    '.rt-row[hidden]{display:none}',
    '#rtLive{display:inline-flex;align-items:center;gap:7px;height:28px;box-sizing:border-box;padding:0 11px 0 8px;border-radius:9px;border-left:5px solid var(--rc,#f7f2ea);',
    ' background:var(--cel,#2e2756);box-shadow:0 0 0 2px var(--tk,#1d1530),3px 4px 0 2px var(--tk,#1d1530);font-family:var(--display);color:#fff;transition:opacity .3s}',
    '#rtLive .rt-k{font-weight:800;font-size:12px;letter-spacing:.2em;color:var(--muted,#b9b0e6)}',
    '#rtLive b{font-weight:900;font-size:22px;line-height:1;color:var(--rc,#f7f2ea);font-variant-numeric:tabular-nums;text-shadow:var(--ring1),1.5px 1.5px 0 var(--tk,#1d1530)}',
    '#rtLive small{font:800 11px var(--display);letter-spacing:.08em;color:var(--muted,#b9b0e6)}#rtLive small[hidden]{display:none}',
    '#rtLive.dim{opacity:.62}#rtLive.dim b{color:#e8e3fb}',
    // aviso pegado a la píldora: «+0,3 Ace» en verde, «−0,2 Error de saque» en rojo claro; set y partido, algo más grandes
    '.rt-toast{display:none;align-items:center;height:24px;box-sizing:border-box;padding:0 10px 0 8px;border-radius:8px;border-left:4px solid currentColor;',
    ' background:rgba(29,21,48,.94);box-shadow:0 0 0 2px var(--tk,#1d1530);font:800 15px/1 var(--display);letter-spacing:.03em;white-space:nowrap}',
    '.rt-toast.on{display:inline-flex;animation:rtIn .3s cubic-bezier(.2,1.3,.4,1) both}',
    '.rt-toast.pos{color:#5fe8ad}.rt-toast.neg{color:#ff8a98}.rt-toast.big{height:26px;font-size:16.5px}',
    '.rt-toast.still{animation:none}',
    '@keyframes rtIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.rt-toast.on{animation:none}#rtLive{transition:none}}',
    // consigna del entrenador (ui.js coTick): línea fina bajo la nota; verde al cumplirla, rojo claro al fallarla
    '.co-call{display:flex;align-items:center;gap:7px;width:max-content;max-width:100%;margin-top:6px;height:22px;box-sizing:border-box;padding:0 9px 0 7px;border-radius:7px;',
    ' border-left:4px solid #ffd23f;background:rgba(29,21,48,.94);box-shadow:0 0 0 2px var(--tk,#1d1530);pointer-events:none;color:#f7f2ea;white-space:nowrap}',
    '.co-call[hidden]{display:none}',
    '.co-call .co-k{font:800 10px var(--display);letter-spacing:.16em;color:#ffd23f}',
    '.co-call .co-tx{font:800 13px/1 var(--display);letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis}',
    '.co-call.ok{border-left-color:#5fe8ad}.co-call.ok .co-tx,.co-call.ok .co-k{color:#5fe8ad}',
    '.co-call.miss{border-left-color:#ff8a98;opacity:.85}.co-call.miss .co-tx,.co-call.miss .co-k{color:#ff8a98}',
    '.co-call.in{animation:rtIn .3s cubic-bezier(.2,1.3,.4,1) both}',
    // marcador al 78 % (alto ≤ 560): la consigna y los rótulos de la píldora, a ≥ 11 px reales (antes 8-10 px: no se leían jugando)
    '@media (max-height:560px){.co-call{height:27px;padding:0 10px 0 8px}.co-call .co-k{font-size:14.5px;letter-spacing:.1em}.co-call .co-tx{font-size:16px}' +
      '#rtLive .rt-k{font-size:14.5px;letter-spacing:.14em}#rtLive small{font-size:14.5px;letter-spacing:.04em}}',
    '@media (prefers-reduced-motion:reduce){.co-call.in{animation:none}}',
    // pausa del partidillo de prueba: el aviso en una línea pequeña y «Abandonar la prueba» armado como «Reiniciar»
    '#pause .p-warn{margin:12px 0 -4px;font:700 13.5px/1.25 var(--ui);color:#ffc0a8;text-align:center}#pause .p-warn[hidden]{display:none}',
    '#btnQuit.arm{background:rgba(255,90,44,.22);box-shadow:inset 0 0 0 2px #ff6a2e;color:#ffd9c4;letter-spacing:.04em}',
    // hoja final (main.js rtBlock): la nota grande con su color y «Empezaste en 6,0»; a su lado «Lo mejor» y «A mejorar». Cabe en
    // el sitio de la línea «Nota: 7,4» de antes más «Jugada más larga», que con la nota en directo se quita (como a ≤ 420 de alto):
    // a 1280×720 y a 844×390 «Volver a la Carrera» y «Menú principal» siguen a la vista
    '#end.career .end-rec:has(.end-rt)>span{display:none}',
    '#end .end-rt{display:flex;align-items:center;gap:12px;width:100%;margin:4px 0 2px;text-align:left}',
    '#end .end-rt .er-n{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:84px;height:50px;box-sizing:border-box;padding:0 8px;border-radius:13px;',
    ' border-bottom:4px solid var(--rc);background:var(--cel,#2e2756);box-shadow:0 0 0 2.5px var(--tk,#1d1530),3px 4px 0 var(--tk,#1d1530)}',
    '#end .end-rt .er-n i{display:flex;align-items:baseline;gap:5px;font-style:normal}',
    '#end .end-rt .er-n small{font:800 10px var(--display);letter-spacing:.18em;color:var(--muted,#b9b0e6)}',
    '#end .end-rt .er-n b{font:900 29px/.9 var(--display);color:var(--rc);font-variant-numeric:tabular-nums;text-shadow:var(--ring2),2px 2px 0 var(--tk,#1d1530)}',
    '#end .end-rt .er-n span{font:700 9.5px/1.1 var(--ui);color:var(--muted,#b9b0e6);margin-top:3px;white-space:nowrap}',
    '#end .end-rt .er-l{min-width:0;display:flex;flex-direction:column;gap:5px}',
    '#end .end-rt .er-r{display:flex;align-items:center;gap:6px;min-width:0}',
    '#end .end-rt .er-h{flex:none;min-width:66px;font:800 11px var(--display);letter-spacing:.14em;text-transform:uppercase}',
    '#end .end-rt .up .er-h{color:#5fe8ad}#end .end-rt .dn .er-h{color:#ff8a98}',
    // (una fila por lista: main.js fitChips quita las pastillas del final que no caben, hasta dejar 1)
    '#end .end-rt .er-c{display:flex;gap:4px;min-width:0;overflow:hidden}#end .end-rt .chip{flex:none}',
    '#end .end-rt .chip{margin:0;padding:2px 8px;font:700 12px/1.25 var(--ui);text-transform:none;letter-spacing:0;white-space:nowrap;color:var(--fg2,#e8e3fb);background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.18)}',
    '#end .end-rt .up b{color:#5fe8ad}#end .end-rt .dn b{color:#ff8a98}#end .end-rt .chip b{margin-left:3px;font-weight:800}',
    '#end .end-rt .chip i{font-style:normal}#end .end-rt .er-c.fit1 .chip:first-child{flex:0 1 auto;min-width:0;display:flex}',
    '#end .end-rt .er-c.fit1 .chip:first-child i{min-width:0;overflow:hidden;text-overflow:ellipsis}#end .end-rt .er-c.fit1 .chip:first-child b{flex:none}',
    '#end .end-rt.cmp{margin:0 0 12px}#end .end-rt.cmp .er-l{gap:4px;width:100%}',
    // (prueba en teléfonos apaisados: en la columna de la derecha, bajo el MVP; la de la izquierda ya va llena con la letra y los objetivos)
    '@media (max-height:560px) and (min-width:600px){#end.trial .sheet>.end-rt{grid-column:2;grid-row:3/span 4;align-self:start;margin:12px 0 0}}',
    '@media (max-height:420px){#end .end-rt{margin:2px 0 1px;gap:10px}#end .end-rt .er-n{min-width:74px;height:44px;padding:0 6px}#end .end-rt .er-n b{font-size:25px}#end .end-rt .er-n span{font-size:9px;margin-top:2px}',
    ' #end .end-rt .er-l{gap:3px}#end .end-rt .er-h{min-width:58px;font-size:10px}#end .end-rt .chip{padding:1px 7px;font-size:11px}',
    '}',
    // (667×375: si no cabe, se va «A mejorar» antes que la XP)
    '@media (max-height:380px){#end.career:not(.trial) .end-rt .dn{display:none}}'
  ].join('\n');

  // =================================================================== SPLAT · CARRERA (etapa 2, 17-nov-2026; notes/splat.md)
  // Sin velo: el escenario de la Carrera (playa o pabellón) se ve detrás. Las listas y textos largos, en hojas de tinta (.card con
  // la silueta de .sp-panel, cada una con su esquina distinta y su rótulo-pegatina torcido de un color); el próximo partido, en
  // brochazo turquesa con los escudos en pegatina (.sp-ticket); «Jugar partido» y las acciones principales, en parche cosido; el
  // resto, en manchas de pintura (splatify); pestañas en trazos de pincel (la sub-pestaña elegida, del color de tu club); tu media
  // y el puesto final, en sellos dorados. REFUERZO: prefijo Q (3 ids de :root más #career) = gana a las reglas viejas de index.html
  // (#app #career …, 2 ids) y a las de estructura del sistema (3 ids) cuando hace falta retocarlas aquí.
  var Q = ':root:not(#_):not(#_):not(#_) #career', QT = ':root:not(#_):not(#_):not(#_) .is-touch #career';
  var KO = '1.5px 1.5px 0 var(--sp-ink),-1px -1px 0 var(--sp-ink),1px -1px 0 var(--sp-ink),-1px 1px 0 var(--sp-ink)';   // contorno fino de tinta
  var HO = '2.5px 0 0 var(--sp-ink),-2.5px 0 0 var(--sp-ink),0 2.5px 0 var(--sp-ink),0 -2.5px 0 var(--sp-ink),2px 2px 0 var(--sp-ink),-2px -2px 0 var(--sp-ink),2px -2px 0 var(--sp-ink),-2px 2px 0 var(--sp-ink),3px 4px 0 var(--sp-ink)';
  var STK = '0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink)', FOC = '0 0 0 2.5px var(--sp-ink),0 0 0 5.5px var(--sp-gold),3px 4px 0 5.5px var(--sp-ink)';
  var BR = '-webkit-mask:var(--sp-brush) center/100% 100% no-repeat;mask:var(--sp-brush) center/100% 100% no-repeat';
  var NB = ':where(:not(.sp-btn,.sp-patch,.sp-back,.tab,.tb-k,.cw-tl-b))';   // botones que no son del sistema (especificidad 0)
  var SPLAT_CSS = [
    // contenedor sin velo; el contenido deja sitio arriba a los rótulos-pegatina y a las sombras duras
    Q + '{background:none;font-family:var(--sp-ui);color:var(--sp-cream)}',
    Q + ' .cr-body{padding:16px 12px 30px 6px}',
    Q + ' p{color:rgba(255,244,220,.92)}',
    Q + ' .muted{color:rgba(255,244,220,.72);font-family:var(--sp-ui)}',
    // cabecera: Volver (mancha de tinta), retrato en pegatina, nombre en Titan One con contorno, escudo en pegatina redonda y tu media en sello
    Q + ' .cr-head{gap:clamp(8px,1.6vh,14px);padding:2px 2px 0}',
    Q + ' .cr-head .pt.cr-pt{width:clamp(40px,7vh,52px);height:clamp(40px,7vh,52px);border-radius:14px 11px 15px 12px;transform:rotate(-5deg);box-shadow:0 0 0 3px var(--sp-cream),0 0 0 5.5px var(--sp-ink),3px 4px 0 5.5px var(--sp-ink)}',
    Q + ' .cr-title small{font:800 clamp(10px,1.7vh,13px)/1.2 var(--sp-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--sp-gold);text-shadow:' + KO + '}',
    Q + ' .cr-title b{font:400 clamp(19px,4.4vh,34px)/1.12 var(--sp-pop);letter-spacing:.01em;color:var(--sp-cream);text-shadow:' + HO + ';transform:rotate(-1.6deg);transform-origin:0 60%;padding:2px 6px 5px 3px}',
    Q + ' .cr-title b .sep{color:var(--sp-gold)}',
    Q + ' .cr-hcr{--sp-cs:clamp(40px,7.6vh,58px);transform:rotate(7deg);padding:4px}',
    Q + ' .cr-ovr{--sp-stamp:clamp(56px,10.6vh,84px);cursor:default;transform:rotate(-10deg);margin:2px 4px 4px 2px}',
    Q + ' .cr-ovr:hover{transform:rotate(-6deg) scale(1.04)}',
    Q + ' .cr-ovr .sp-sc b{font:400 calc(var(--sp-stamp) * .3)/1 var(--sp-pop);letter-spacing:0;color:var(--sp-gold)}',
    // pestañas: trazos de pincel (VB.UI.tabs con .sp-tabs); la sub-pestaña elegida, del color de tu club
    Q + ' .cr-tabs{padding:4px 2px 6px}',
    Q + ' #crTabs .tab{--sp-tbh:clamp(40px,7.2vh,54px);--sp-tbs:clamp(12px,2.2vh,17px);flex:1 0 auto}',
    Q + ' #crSub .tab{--sp-tbh:38px;--sp-tbs:clamp(11px,1.9vh,14px);flex:0 0 auto;min-width:0}',
    QT + ' #crSub .tab{--sp-tbh:44px}',
    Q + ' #crSub .tb-row{background:none;box-shadow:none;padding:2px 4px}',
    Q + ' #crSub .tab:not(.on):not(.kf):not(:focus-visible)::before{opacity:.5}',
    Q + ' #crSub .tab:is(.on,[aria-selected="true"]){color:var(--sp-kit-ink);text-shadow:var(--sp-kit-ts)}',
    Q + ' #crSub .tab:is(.on,[aria-selected="true"])::before{background:var(--sp-kit)}',
    Q + ' .tabs .tb-k{min-height:0;height:30px;min-width:32px;padding:0 7px;border-radius:6px 8px 6px 7px;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink),2px 2px 0 2px var(--sp-ink);font:800 12px/1 var(--sp-ui);text-shadow:none}',
    Q + ' .tabs .tb-k:empty,' + Q + ' .tabs.tb-touch .tb-k{display:none}',
    Q + ' .tabs .dot{background:#ff3b5c;box-shadow:0 0 0 2px var(--sp-ink);width:10px;height:10px}',
    // hojas de tinta (la silueta de .sp-panel) con su rótulo-pegatina torcido; cada una con su esquina y su color de rótulo
    Q + ' .card{position:relative;background:rgba(21,16,42,.93);color:var(--sp-cream);border-radius:18px 24px 20px 26px/22px 18px 26px 20px;box-shadow:0 0 0 3px var(--sp-ink),inset 0 0 0 2px rgba(255,244,220,.13),5px 7px 0 var(--sp-ink);padding:14px 16px 12px;margin:0 0 22px}',
    Q + ' .card:nth-child(3n+2){border-radius:24px 16px 26px 18px/18px 26px 20px 24px}',
    Q + ' .card:nth-child(3n){border-radius:16px 26px 18px 22px/26px 20px 24px 18px}',
    Q + ' .card>h3:first-child{display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px 6px;max-width:100%;margin:-25px 0 8px -8px;padding:4px 10px 5px;border-radius:7px 11px 8px 12px/9px 8px 11px 7px;background:var(--sp-gold);color:var(--sp-ink);' +
      'box-shadow:0 0 0 2.5px var(--sp-ink),3px 3px 0 2.5px var(--sp-ink);font:400 clamp(12px,2vh,15px)/1.15 var(--sp-pop);letter-spacing:.03em;text-transform:uppercase;text-shadow:none;transform:rotate(-2deg);transform-origin:0 100%}',
    Q + ' .card:nth-child(4n+2)>h3:first-child{background:var(--sp-teal);transform:rotate(1.4deg)}',
    Q + ' .card:nth-child(4n+3)>h3:first-child{background:var(--sp-cream);transform:rotate(-1deg)}',
    Q + ' .card:nth-child(4n)>h3:first-child{background:var(--sp-alt);transform:rotate(1.8deg)}',
    Q + ' .card>h3:first-child .muted{color:inherit;opacity:.72;font:inherit}',
    Q + ' .card>h3:first-child .tag{transform:none;margin:0}',
    Q + ' h3{font:400 clamp(12px,2vh,15px)/1.15 var(--sp-pop);letter-spacing:.04em;color:var(--sp-gold);text-shadow:none}',
    Q + ' .card.confirm,' + Q + ' .confirm{background:rgba(70,14,32,.94);box-shadow:0 0 0 3px var(--sp-ink),inset 0 0 0 2.5px var(--sp-danger),5px 7px 0 var(--sp-ink);border-radius:14px 20px 16px 18px}',
    Q + ' .confirm{padding:10px 12px}',
    // próximo partido: brochazo (no se pulsa), parche + Simular y la hoja de detalles
    Q + ' .cr-next{margin:4px 0 24px}',
    Q + ' .cr-tk{--sp-h:clamp(66px,15vh,116px);--sp-cs:clamp(34px,7.2vh,60px);--sp-tilt:-.8deg;cursor:default;margin:0 0 14px}',
    Q + ' .cr-tk:hover{transform:rotate(var(--sp-tilt))}',
    Q + ' .cr-tk .sp-tk-stub{gap:4px;padding-left:calc(3.5% + 12px)}',
    Q + ' .cr-tk .sp-tk-main{padding:6px 22px 10px 10px;gap:2px}',
    Q + ' .cr-tk .sp-k{display:flex;align-items:center;flex-wrap:wrap;gap:2px 6px}',
    Q + ' .cr-tk .sp-k .sp-chip{font-size:11px;padding:1px 7px}',
    Q + ' .cr-tk .sp-t{font-size:clamp(16px,3.6vh,30px)}',
    Q + ' .cr-tk .sp-s{font-size:clamp(11px,1.75vh,14px)}',
    Q + ' .cr-tk .sp-s+.sp-s{opacity:.72}',
    Q + ' .cr-go{display:flex;align-items:center;gap:clamp(10px,2vh,16px);margin:0 0 16px;flex-wrap:nowrap}',
    Q + ' .cr-go .sp-patch{flex:1.7 1 0;--sp-ph:clamp(52px,11vh,86px)}',
    Q + ' .cr-go .sp-btn{flex:1 1 0;min-width:0}',
    Q + ' .cr-nd{padding:10px 14px 8px;margin-bottom:0}',
    Q + ' .cr-nd p{margin:3px 0}',
    Q + ' .bench{margin:0 0 12px;padding:8px 12px;border-radius:12px 18px 14px 16px/16px 12px 18px 14px;background:var(--sp-cream);box-shadow:0 0 0 3px var(--sp-ink),4px 5px 0 var(--sp-ink);transform:rotate(.4deg)}',
    Q + ' .bench p{color:var(--sp-ink)}',
    Q + ' .cr-st6{margin:0 0 4px;font:700 clamp(13px,2vh,15px)/1.3 var(--sp-ui);color:var(--sp-cream)}',
    // acciones: parche (una por pantalla) y manchas; filas de acciones con aire para las gotas
    Q + ' .acts{gap:clamp(10px,1.8vh,14px);margin-top:14px}',
    Q + ' .acts>.sp-patch{flex:1 1 260px;width:auto;max-width:560px;--sp-ph:clamp(52px,10vh,80px)}',
    Q + ' .acts>.sp-btn,' + Q + ' .pick-acts>.sp-btn,' + Q + ' .pl-acts>.sp-btn{flex:1 1 170px;max-width:420px}',
    Q + ' .sp-btn.sp-wrap{white-space:normal;text-align:left;--sp-py:8px}',
    Q + ' .sp-btn.sp-wrap .sp-t{white-space:normal;overflow:visible;line-height:1.08}',
    Q + ' .sp-btn.sp-wrap .sp-s{white-space:normal}',
    Q + ' .sp-btn.sp-off>.sp-blob{filter:grayscale(.7) brightness(.8) drop-shadow(var(--sp-sh))}',
    // segmentados y filtros (duración, puesto, dificultad, circuito, país…): trazos de pincel; el elegido, dorado
    Q + ' :is(.seg,.lg-sw,.cw-opt){gap:6px 4px}',
    Q + ' #crBody>.card>.lg-sw{background:none;padding:0;width:auto;margin-bottom:8px}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button{position:relative;isolation:isolate;min-height:44px;min-width:0;padding:0 14px;border:0;border-radius:0;background:none;box-shadow:none;color:var(--sp-cream);transform:none;' +
      'font:400 clamp(12px,2vh,15px)/1.05 var(--sp-pop);letter-spacing:.03em;text-transform:uppercase;text-shadow:2px 2px 0 var(--sp-ink)}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button::before{content:"";position:absolute;inset:4px -2px;z-index:-1;background:rgba(255,244,220,.17);' + BR + ';transition:background .12s}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button:hover::before{background:rgba(255,244,220,.28)}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button[aria-pressed="true"]{color:var(--sp-ink);text-shadow:none;transform:rotate(-1.5deg);filter:drop-shadow(2px 0 0 var(--sp-ink)) drop-shadow(-2px 0 0 var(--sp-ink)) drop-shadow(0 2px 0 var(--sp-ink)) drop-shadow(0 -2px 0 var(--sp-ink)) drop-shadow(2px 3px 0 var(--sp-ink))}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button[aria-pressed="true"]::before{background:var(--sp-gold)}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button:is(.kf,:focus-visible){outline:none;box-shadow:none;transform:rotate(-1.5deg) scale(1.05);filter:drop-shadow(3px 0 0 var(--sp-gold)) drop-shadow(-3px 0 0 var(--sp-gold)) drop-shadow(0 3px 0 var(--sp-gold)) drop-shadow(0 -3px 0 var(--sp-gold))}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button:is(.kf,:focus-visible)::before{background:rgba(255,244,220,.32)}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button[aria-pressed="true"]:is(.kf,:focus-visible)::before{background:var(--sp-gold)}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button:disabled{opacity:.45}',
    Q + ' :is(.seg,.lg-sw,.cw-opt) button small{font:600 11px var(--sp-ui)!important;text-transform:none;letter-spacing:0}',
    // botones que no son de acción (rótulos-pegatina sueltos): tinta clara con contorno y sombra dura; foco con aro dorado
    Q + ' button' + NB + '{background:var(--sp-ink2);color:var(--sp-cream);border-radius:12px 16px 13px 15px/14px 12px 16px 13px;box-shadow:' + STK + ';text-shadow:none;' +
      'font:400 clamp(13px,2vh,16px)/1.1 var(--sp-pop);letter-spacing:.02em;transform:none}',
    Q + ' button' + NB + ':hover{background:#3a2f72}',
    Q + ' button' + NB + ':is(.kf,:focus-visible){outline:none;box-shadow:' + FOC + ';transform:scale(1.02)}',
    Q + ' button' + NB + ':disabled{opacity:.5}',
    // elecciones con texto (rol, puesto, dificultad al crear; enfoque del plan; ejercicios): pegatinas; la elegida, dorada y torcida
    Q + ' :is(.roles,.tgrid,.pl-focus) button{background:rgba(255,244,220,.1);border-radius:14px 20px 16px 22px/18px 14px 22px 16px}',
    Q + ' :is(.roles,.tgrid,.pl-focus) button:nth-child(even){border-radius:20px 14px 22px 16px/14px 20px 16px 22px}',
    Q + ' :is(.roles,.tgrid,.pl-focus) button[aria-pressed="true"]{background:var(--sp-gold);color:var(--sp-ink);transform:rotate(-1deg)}',
    Q + ' :is(.roles,.tgrid,.pl-focus) button[aria-pressed="true"]:is(.kf,:focus-visible){transform:rotate(-1deg) scale(1.02)}',
    Q + ' :is(.roles,.tgrid) button small{font:600 12.5px/1.25 var(--sp-ui);text-transform:none;letter-spacing:0;opacity:.85}',
    Q + ' .pl-focus button small{font:800 9.5px var(--sp-ui);letter-spacing:.06em;color:var(--sp-gold);text-shadow:none}',
    Q + ' .pl-focus button[aria-pressed="true"] small{color:var(--sp-ink)}',
    // insignias: pegatinas; la equipada, dorada con su sello «equipada»
    Q + ' .bdg{gap:10px}',
    Q + ' .bd{background:rgba(255,244,220,.08);text-transform:none;font:600 13px/1.25 var(--sp-ui)}',
    Q + ' .bd:nth-child(3n+1){border-radius:16px 22px 14px 20px/20px 14px 22px 16px}',
    Q + ' .bd .ic{background:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-cream),0 0 0 4px var(--sp-ink)}',
    Q + ' .bd strong{font:400 15px var(--sp-pop);letter-spacing:.02em}',
    Q + ' .bd[aria-pressed="true"]{background:var(--sp-gold);color:var(--sp-ink);text-shadow:none;transform:rotate(-.8deg)}',
    Q + ' .bd[aria-pressed="true"] span{color:var(--sp-ink)!important}',
    Q + ' .bd[aria-pressed="true"] strong::after{background:var(--sp-ink);color:var(--sp-gold);box-shadow:none;border-radius:6px 9px 7px 8px}',
    Q + ' .bd .pg{background:rgba(21,16,42,.6);box-shadow:0 0 0 1.5px rgba(255,244,220,.2)}',
    // etiquetas: pegatinas pequeñas (crema, oro, verde, peligro), un poco torcidas
    Q + ' .tag{display:inline-flex;align-items:center;margin:3px 7px 3px 0;padding:3px 8px;border-radius:7px 11px 8px 12px/9px 8px 11px 7px;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink),2px 2px 0 2px var(--sp-ink);' +
      'font:700 12px/1.2 var(--sp-ui);letter-spacing:0;text-transform:none;text-shadow:none;transform:rotate(-1.5deg)}',
    Q + ' .tag:nth-child(even){transform:rotate(1.2deg)}',
    Q + ' .tag.y{background:var(--sp-gold);color:var(--sp-ink)}',
    Q + ' .tag.g{background:#8fe36e;color:var(--sp-ink)}',
    Q + ' .tag.r{background:var(--sp-danger);color:#fff6e4}',
    Q + ' .chip{background:rgba(255,244,220,.12);color:var(--sp-cream);box-shadow:inset 0 0 0 1.5px rgba(255,244,220,.22);font-family:var(--sp-ui)}',
    Q + ' .chip.dv.g{background:#2f8f5a;color:#fff}',
    Q + ' .chip.dv.r{background:#b8324a;color:#fff}',
    Q + ' .stars{color:var(--sp-gold);text-shadow:none}',
    // tablas (clasificación, temporadas, comparar ofertas, salón de la fama): filas-pegatina; la tuya, del color de tu club
    Q + ' table{border-collapse:separate;border-spacing:0 4px;font:600 clamp(13px,1.9vh,15px) var(--sp-ui)}',
    Q + ' th{font:800 10.5px var(--sp-ui);letter-spacing:.12em;color:rgba(255,244,220,.62);padding:2px 6px}',
    Q + ' td{border-top:0;padding:6px;background:rgba(255,244,220,.06)}',
    Q + ' tbody tr:nth-child(even) td{background:rgba(255,244,220,.1)}',
    Q + ' td:first-child{border-radius:9px 0 0 10px}',
    Q + ' td:last-child{border-radius:0 10px 9px 0}',
    Q + ' tr.up td:first-child{box-shadow:inset 5px 0 0 #8fe36e}',
    Q + ' tr.cup td:first-child{box-shadow:inset 5px 0 0 var(--sp-gold)}',
    Q + ' tr.down td:first-child{box-shadow:inset 5px 0 0 var(--sp-danger)}',
    Q + ' tbody tr.me td{background:var(--sp-kit);color:var(--sp-kit-ink);text-shadow:var(--sp-kit-ts);box-shadow:inset 0 2.5px 0 var(--sp-ink),inset 0 -2.5px 0 var(--sp-ink)}',
    Q + ' tbody tr.me td:first-child{box-shadow:inset 0 2.5px 0 var(--sp-ink),inset 0 -2.5px 0 var(--sp-ink),inset 2.5px 0 0 var(--sp-ink)}',
    Q + ' tbody tr.me td:last-child{box-shadow:inset 0 2.5px 0 var(--sp-ink),inset 0 -2.5px 0 var(--sp-ink),inset -2.5px 0 0 var(--sp-ink)}',
    Q + ' tr.me .muted{color:inherit;opacity:.85}',
    Q + ' td.pts{font:400 16px var(--sp-pop);color:var(--sp-gold)}',
    // nombre del club en la tabla (abre su ficha): texto, no pegatina; el escudo en la misma línea
    Q + ' button.cw-tl-b{display:inline;min-height:0;padding:0 2px;border-radius:6px;background:none;box-shadow:none;color:inherit;font:inherit;letter-spacing:0;text-transform:none;text-shadow:inherit;transform:none;line-height:32px}',
    Q + ' button.cw-tl-b:hover{background:none;text-decoration:underline}',
    QT + ' button.cw-tl-b{line-height:44px}',
    Q + ' button.cw-tl-b:is(.kf,:focus-visible){box-shadow:0 0 0 2.5px var(--sp-gold);background:rgba(21,16,42,.5)}',
    Q + ' tr:has(.cw-tl-b) td.club{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    Q + ' tbody tr.me td.pts{color:var(--sp-kit-ink)}',
    // calendario, mensajes y datos: filas con forma (tinta clara); lo próximo y lo no leído, destacados
    Q + ' .cal{gap:7px}',
    Q + ' .cal-r{border-radius:10px 14px 11px 13px/13px 10px 14px 11px;background:rgba(255,244,220,.07)}',
    Q + ' .cal-r:nth-child(even){border-radius:14px 10px 13px 11px/10px 14px 11px 13px;background:rgba(255,244,220,.11)}',
    Q + ' .cal-r b{font:400 14px var(--sp-pop);color:var(--sp-gold)}',
    Q + ' .cal-r.next{background:var(--sp-kit);color:var(--sp-kit-ink);box-shadow:' + STK + ';transform:rotate(-.5deg)}',
    Q + ' .cal-r.next b,' + Q + ' .cal-r.next .muted{color:inherit}',
    Q + ' .cal-r .res{font:400 14px var(--sp-pop)}',
    Q + ' span.w{color:#8fe36e}',
    Q + ' span.l{color:#ff8a98}',
    Q + ' .msg{border-radius:10px 14px 12px 15px/14px 10px 15px 12px;background:rgba(255,244,220,.08);padding:9px 12px;margin:0 0 9px}',
    Q + ' .msg.unread{background:var(--sp-cream);box-shadow:inset 6px 0 0 var(--sp-kit),' + STK + '}',
    Q + ' .msg.unread b,' + Q + ' .msg.unread p{color:var(--sp-ink)}',
    Q + ' .msg.unread small{color:rgba(21,16,42,.62)}',
    Q + ' .msg b{font:400 15px var(--sp-pop);letter-spacing:.02em}',
    Q + ' .fact{gap:8px}',
    Q + ' .fact div{background:rgba(255,244,220,.08);border-radius:10px 14px 11px 13px/13px 10px 14px 11px}',
    Q + ' .fact div:nth-child(even){border-radius:14px 10px 13px 11px/10px 14px 11px 13px}',
    Q + ' .fact small{font:800 10px var(--sp-ui);letter-spacing:.12em;color:var(--sp-gold)}',
    Q + ' .bigname{font:400 clamp(19px,3.4vh,26px)/1.1 var(--sp-pop);letter-spacing:.01em;color:var(--sp-cream);text-shadow:2px 2px 0 var(--sp-ink)}',
    Q + ' .cr-mn{font:400 16px/1.15 var(--sp-pop);letter-spacing:.01em;color:var(--sp-cream)}',   // (REV-12: nombres de Club › Equipo y compañeros, con la letra SPLAT)
    Q + ' .offer-x{border-top:2px dashed rgba(255,244,220,.16)!important}',
    Q + ' .mate{border-top:2px dashed rgba(255,244,220,.14)}',
    // barras (atributos, experiencia, medidores): pista de tinta con filo crema; relleno con su color
    Q + ' :is(.attr .bar,.xp,.meter,.pbar .bar){background:rgba(8,5,20,.7);box-shadow:0 0 0 2px var(--sp-ink),inset 0 0 0 1.5px rgba(255,244,220,.2);border-radius:7px}',
    Q + ' .xp i{background:linear-gradient(90deg,var(--sp-gold),var(--sp-kit))}',
    Q + ' .attr b{font:400 18px var(--sp-pop)}',
    Q + ' .attr button{min-width:48px;padding:0 8px;border-radius:50% 46% 52% 48%/48% 52% 46% 50%;background:var(--sp-cream);color:var(--sp-ink);font:400 16px/1 var(--sp-pop)}',
    // nota del último partido (círculo con contorno de tinta) y letras de nota
    Q + ' .nota{font:400 26px var(--sp-pop);box-shadow:0 0 0 3px var(--sp-ink),inset 0 0 0 5px rgba(255,255,255,.18),3px 4px 0 3px var(--sp-ink);transform:rotate(-6deg);color:#fff;text-shadow:' + KO + '}',
    Q + ' .nota small{font:800 10px var(--sp-ui);letter-spacing:.12em}',
    Q + ' .gr{font:400 19px/1 var(--sp-pop);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);border-radius:10px 13px 11px 12px;text-shadow:' + KO + '}',
    Q + ' .gr.sm{font-size:13px;box-shadow:0 0 0 2px var(--sp-ink)}',
    // plan del entrenador: casillas con forma; la de ahora, con filo dorado
    Q + ' .pl-s{background:rgba(255,244,220,.07);border-radius:14px 18px 15px 20px/18px 14px 20px 15px;box-shadow:inset 0 0 0 1.5px rgba(255,244,220,.1)}',
    Q + ' .pl-s:nth-child(2){border-radius:20px 14px 18px 15px/15px 20px 14px 18px}',
    Q + ' .pl-s.cur{background:rgba(255,203,61,.12);box-shadow:0 0 0 3px var(--sp-gold),4px 5px 0 3px var(--sp-ink)}',
    Q + ' .pl-k{font:800 11px var(--sp-ui);letter-spacing:.14em;color:rgba(255,244,220,.62)}',
    Q + ' .pl-n b{font:400 17px/1.08 var(--sp-pop);letter-spacing:.01em}',
    Q + ' .pl-b{gap:8px}',
    Q + ' .pl-b .sp-btn{width:100%;--sp-px:6px}',
    Q + ' .tr-dots i{box-shadow:inset 0 0 0 2px var(--sp-gold)}',
    Q + ' .tr-dots i.on{background:var(--sp-gold);box-shadow:0 0 0 1.5px var(--sp-ink)}',
    Q + ' .pl-acts{gap:12px;margin-top:12px}',
    // crear: cada columna en su hoja; nombre en etiqueta crema; dorsal entre dos pegatinas redondas
    Q + ' .cf{gap:22px 18px}',
    Q + ' .cf-col{grid-template-columns:minmax(0,1fr)}',
    Q + ' .cf-col{background:rgba(21,16,42,.93);border-radius:20px 26px 18px 24px/24px 18px 26px 20px;box-shadow:0 0 0 3px var(--sp-ink),inset 0 0 0 2px rgba(255,244,220,.13),5px 7px 0 var(--sp-ink);padding:14px 16px}',
    Q + ' .cf label{font:800 12px/1.2 var(--sp-ui);letter-spacing:.14em;color:var(--sp-gold);text-shadow:none;margin-bottom:7px}',
    Q + ' .cf input{min-height:50px;border-radius:10px 14px 11px 13px/13px 10px 14px 11px;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink);font:400 21px var(--sp-pop);letter-spacing:.02em}',
    Q + ' .cf input::placeholder{color:rgba(21,16,42,.45)}',
    Q + ' .cf input:focus-visible{box-shadow:0 0 0 3px var(--sp-ink),0 0 0 6px var(--sp-gold),3px 4px 0 6px var(--sp-ink)}',
    Q + ' .stp b{font:400 34px var(--sp-pop);color:var(--sp-gold);text-shadow:' + HO + '}',
    Q + ' .stp button{width:50px;height:50px;padding:0;border-radius:50%;background:var(--sp-cream);color:var(--sp-ink);font:400 26px/1 var(--sp-pop)}',
    Q + ' .prev{gap:5px 10px}',
    Q + ' .prev span{padding:3px 8px;border-radius:8px 11px 9px 10px;background:rgba(255,244,220,.08);color:rgba(255,244,220,.82)}',
    Q + ' .prev b{color:var(--sp-gold);font:400 14px var(--sp-pop)}',
    Q + ' .card.prev-box{background:none;box-shadow:none;padding:4px 0 0;margin:10px 0 0}',
    Q + ' .card.prev-box>h3:first-child{margin:0 0 8px;transform:rotate(-1deg)}',
    Q + ' .cc-reg{color:var(--sp-gold)}',
    // fin de temporada: el puesto en un sello dorado
    Q + ' .cr-end{padding-right:calc(clamp(64px,13vh,100px) + 18px)}',
    Q + ' .cr-pos{position:absolute;right:8px;top:-16px;--sp-stamp:clamp(64px,13vh,100px);cursor:default;pointer-events:none}',
    Q + ' .cr-pos .sp-sc b{font:400 calc(var(--sp-stamp) * .27)/1 var(--sp-pop);letter-spacing:0;text-transform:none}',
    // previa de la prueba: cabecera del club con su color, objetivos en tiras de papel con su número en pegatina
    Q + ' .tp-hero{border-radius:16px 22px 0 0}',
    Q + ' .tp-hero b{font:400 clamp(24px,6vw,36px)/1.05 var(--sp-pop);text-shadow:' + HO + '}',
    Q + ' .tp-hero small{font:800 11px var(--sp-ui);letter-spacing:.16em;color:var(--sp-gold);text-shadow:' + KO + '}',
    Q + ' .tp-fmt{font:400 18px var(--sp-pop)}',
    Q + ' .tp-goals li{background:var(--sp-cream);color:var(--sp-ink);border-radius:8px 12px 9px 13px/12px 8px 13px 9px;box-shadow:' + STK + ';font:400 15px/1.15 var(--sp-pop);transform:rotate(-.4deg)}',
    Q + ' .tp-goals li:nth-child(even){transform:rotate(-.4deg)}',   // (REV-13: todas igual de torcidas; alternando, las tiras anchas dejaban huecos desiguales)
    // REV-13: la camiseta, con aro crema (sobre la cuña de su mismo color parecía un hueco); objetivos con hueco fijo y la nota separada
    Q + ' .tp-hero .cr-kit{box-shadow:0 0 0 3px var(--sp-cream),3px 4px 0 3px var(--sp-ink)}',
    Q + ' .tp-goals{gap:8px;align-content:start;grid-auto-rows:min-content}',
    Q + ' .tp-goals+.muted{margin-top:10px}',
    Q + ' .tp-goals li i{background:var(--sp-gold);box-shadow:0 0 0 2px var(--sp-ink);font:400 13px var(--sp-pop)}',
    Q + ' .tp-acts{gap:14px}',
    Q + ' .tp-acts .sp-patch{--sp-ph:clamp(54px,10vh,80px)}',
    Q + ' .et-l{border-radius:20px 16px 22px 14px;box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink);transform:rotate(-5deg)}',
    Q + ' .et-l b{font:400 34px/.9 var(--sp-pop);text-shadow:' + HO + '}',
    Q + ' .note,' + Q + ' .bd-msg{color:var(--sp-gold);text-shadow:' + KO + '}',
    // teléfono apaisado: cabecera y apartados en una fila (como antes), sellos y entrada más bajos
    '@media (max-height:520px){',
    ' ' + Q + ' .card>h3:first-child{margin-top:-22px}',
    ' ' + Q + ' .cr-body{padding-top:14px}',
    ' ' + Q + ' .card{margin-bottom:20px}',
    '}',
    '@media (max-height:420px) and (max-aspect-ratio:5/4){',   // (móvil apaisado: PH_CSS)
    ' ' + Q + ' .cr-head{gap:8px}',
    ' ' + Q + ' .cr-head .pt.cr-pt{width:34px;height:34px;box-shadow:0 0 0 2.5px var(--sp-cream),0 0 0 4.5px var(--sp-ink),2px 3px 0 4.5px var(--sp-ink)}',
    ' ' + Q + ' .cr-ovr{--sp-stamp:46px;margin:0 2px}',
    ' ' + Q + ' .cr-ovr .sp-st .st2{display:none}',
    ' ' + Q + ' #crTabs .tab{--sp-tbh:44px;--sp-tbs:13px;padding:0 10px}',
    ' ' + Q + ' .cr-body{padding-top:10px}',
    ' ' + Q + ' .card{margin-bottom:16px;padding:10px 12px}',
    ' ' + Q + ' .card>h3:first-child{margin-top:-20px}',
    ' ' + Q + ' .cr-next{margin:0 0 16px}',
    ' ' + Q + ' .cr-tk{--sp-h:54px;--sp-cs:32px;margin-bottom:8px}',
    ' ' + Q + ' .cr-tk .sp-t{font-size:17px}',
    ' ' + Q + ' .cr-tk .sp-s+.sp-s{display:none}',
    ' ' + Q + ' .cr-go{margin-bottom:10px}',
    ' ' + Q + ' .cr-go .sp-patch,' + Q + ' .acts>.sp-patch{--sp-ph:50px}',
    ' ' + Q + ' .cr-pos{--sp-stamp:60px;top:-12px}',
    ' ' + Q + ' .cr-end{padding-right:80px}',
    '}',
    // filtros de Clasificación y Clubes en una sola fila que se desliza (antes, 2 filas de circuitos a 568×320)
    '@media (max-width:900px){',
    ' ' + Q + ' #crBody>.card>.lg-sw{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding:2px 28px 4px 2px;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}',
    ' ' + Q + ' #crBody>.card>.lg-sw::-webkit-scrollbar{display:none}',
    ' ' + Q + ' #crBody>.card>.lg-sw button{flex:0 0 auto;padding:0 11px}',
    '}',
    '@media (max-width:560px){',
    ' ' + Q + ' .cr-go{flex-wrap:wrap}',
    ' ' + Q + ' .cr-go .sp-patch,' + Q + ' .cr-go .sp-btn{flex:1 1 100%}',
    // teléfono en vertical: Volver, retrato, escudo y sello en la primera fila; el título debajo, a lo ancho (hasta 2 líneas)
    ' ' + Q + ' tr:has(.cw-tl-b) td.club{white-space:normal;max-width:none;width:auto;line-height:1.2}',
    ' ' + Q + ' tr:has(.cw-tl-b) td.club button.cw-tl-b{line-height:1.25}',
    ' ' + Q + ' .cr-head{flex-wrap:wrap;row-gap:4px}',
    ' ' + Q + ' .cr-head .cr-title{order:5;flex:1 1 100%;min-width:0;position:relative;z-index:1;margin-top:4px}',
    ' ' + Q + ' .cr-head .cr-hcr{margin-left:auto}',
    ' ' + Q + ' .cr-head>.sp-back+.cr-title{order:0;flex:1 1 0}',
    ' ' + Q + ' .cr-title b{font-size:clamp(17px,5.2vw,22px)}',
    ' ' + Q + ' .cr-title small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.08em}',
    ' ' + Q + ' .cr-ovr{--sp-stamp:52px}',
    ' ' + Q + ' .cr-tk{--sp-cs:30px;--sp-h:auto}',
    ' ' + Q + ' .cr-tk .sp-tk-stub{padding-left:16px}',
    ' ' + Q + ' .cr-tk .sp-t{font-size:18px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    ' ' + Q + ' .cr-tk .sp-s{white-space:normal}',
    ' ' + Q + ' .cr-tk .sp-s+.sp-s{display:none}',
    // el antetítulo en 2 líneas como mucho, dentro del brochazo (en 3 líneas salía por arriba, en tinta sobre el fondo 3D)
    ' ' + Q + ' .cr-tk .sp-tk-main{padding-top:12px;padding-bottom:10px}',
    ' ' + Q + ' .cr-tk .sp-k{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow:hidden;text-overflow:ellipsis;letter-spacing:.04em}',
    ' ' + Q + ' .cr-tk{margin-bottom:8px}',
    ' ' + Q + ' .cr-body{padding-top:10px}',
    ' ' + Q + ' .card{margin-bottom:16px}',
    ' ' + Q + ' .card>h3:first-child{margin-top:-22px}',
    ' ' + Q + ' .cr-next{margin-bottom:16px}',
    ' ' + Q + ' .cr-tabs{padding:2px 2px 4px}',
    ' ' + Q + ' .cr-go .sp-patch,' + Q + ' .acts>.sp-patch{--sp-ph:58px;--sp-pt:23px}',
    '}',
    // crear (todos los tamaños, 18-nov-2026): «Crear y ver ofertas» pegado abajo del contenido (a 1280×720 quedaba por debajo, sin verse)
    Q + ' .cf .acts:has(>[data-act="create"]){position:sticky;bottom:0;z-index:3;margin-top:4px;padding:14px 0 4px;background:linear-gradient(rgba(21,16,42,0),rgba(21,16,42,.96) 14px)}',
    Q + ' .cf .acts>[data-act="create"] .sp-t{white-space:normal;overflow:visible;text-overflow:clip;line-height:1}',
    Q + ' .cr-body:has(.cf [data-act="create"]){-webkit-mask:none;mask:none}',
    // barra de abajo (#crDock, phDock): en PC/tableta solo «Crear y ver ofertas», a la derecha bajo el contenido
    '#career .cr-dock{flex:none;grid-column:1/-1;display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:0;padding:2px 6px 4px}',
    '#career .cr-dock[hidden]{display:none}',
    Q + ' .cr-dock .sp-patch{flex:0 1 auto;width:auto;min-width:min(340px,60%);--sp-ph:clamp(56px,8vh,72px)}',
    Q + ' .cr-dock [data-act="create"] .sp-t{white-space:nowrap;overflow:visible;text-overflow:clip}',
    // teléfono en vertical (no es .ph): el parche a lo ancho y el rótulo en 2 líneas si no cabe (se cortaba en «Crear y ver ofe»)
    '@media (max-width:560px){' + Q + ' .cr-dock{justify-content:stretch}' + Q + ' .cr-dock .sp-patch{flex:1 1 100%;min-width:0;--sp-pt:clamp(18px,5.6vw,24px)}' +
      Q + ' .cr-dock [data-act="create"] .sp-t{white-space:normal;line-height:1}}',
    '.rm #career .card.new{animation:none}',
    // hojas del final de un partido de la Carrera (#end.career, prueba #end.trial, sesión #gymEnd): cifras en Titan One con contorno,
    // letras en pegatina torcida con sombra dura (el resto de la hoja es de ui.js y de su bloque SPLAT)
    '#end .end-trial .et-l,#gymEnd .cdr-g{border-radius:22px 16px 24px 15px;box-shadow:0 0 0 3px var(--sp-ink),4px 5px 0 3px var(--sp-ink)}',
    '#end .end-trial .et-l b,#gymEnd .cdr-g b{font:400 40px/.9 var(--sp-pop);text-shadow:' + HO + '}',
    '#end .end-trial .et-t strong{font:400 21px/1.1 var(--sp-pop);letter-spacing:.01em}',
    '#end .et-goals>span{border-radius:8px 12px 9px 13px;font-family:var(--sp-ui)}',
    '#end .end-rt .er-n{border-radius:14px 18px 13px 17px;border-bottom:0;box-shadow:inset 0 -5px 0 var(--rc),0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink);background:var(--sp-ink)}',
    '#end .end-rt .er-n b{font:400 28px/.95 var(--sp-pop);text-shadow:' + KO + '}',
    '#end .end-rt .er-n small,#end .end-rt .er-h{font-family:var(--sp-ui);font-weight:800}',
    '#end .end-rt .chip{border-radius:7px 10px 8px 11px;font-family:var(--sp-ui)}',
    '#gymEnd .cdr-bar .bar{box-shadow:0 0 0 2px var(--sp-ink),inset 0 0 0 1.5px rgba(255,244,220,.2)}',
    '#gymEnd .cdr-bar>span:first-child,#gymEnd .cdr-bar b{font-family:var(--sp-pop);font-weight:400}',
    '#gymEnd .cdr-tags>span{border-radius:7px 11px 8px 12px;background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink),2px 2px 0 2px var(--sp-ink);font:700 12px var(--sp-ui);letter-spacing:0;text-transform:none}',
    '#rtLive b{font-family:var(--sp-pop);font-weight:400}'
  ].join('\n');

  // =================================================================== MÓVIL (html.ph; 18-nov-2026, «se ve todo muy cramped»)
  // notes/splat.md §9 y notes/carrera.md «Móvil». Prefijo PQ (:root.ph + 3 ids + #career) = gana a Q y a las reglas viejas de
  // teléfono. Marco: columna de 6 apartados a la izquierda con «‹ Menú» arriba; a su derecha la tira de sub-pestañas (o el título)
  // con el sello de tu media en la esquina y, debajo, el ÚNICO contenido que se desplaza (≥ 250 px de alto a 568×320). Letra con los
  // tokens del sistema (crece con el ancho; nada por debajo de 12 px, lectura ≥ 14). Sin .ph, nada de esto se aplica.
  var PQ = Q.replace(':root', ':root.ph'), PS = Q.replace(':root', ':root.ph.ph-s');
  var PH_CSS = [
    // ---- marco
    PQ + '{padding:var(--ph-gt) var(--ph-g) var(--ph-gb);--cr-rw:clamp(86px,11.5vw,108px)}',
    PQ + ' .cr-in{width:100%;max-width:none;height:100%;zoom:1;display:grid;grid-template-columns:var(--cr-rw) minmax(0,1fr);grid-template-rows:var(--ph-hh) minmax(0,1fr);grid-template-areas:"hd sb" "tb bd";gap:6px 12px}',
    // sin columna (crear, elegir club, previa de la prueba): «Volver» y el título (o la tira de ofertas) arriba, el contenido a lo ancho
    PQ + ' .cr-in:has(>.cr-tabs[hidden]),' + PQ + ' .cr-in:has(>.cr-tabs.sp-tabs-strip){grid-template-columns:auto minmax(0,1fr);grid-template-areas:"hd sb" "bd bd"}',
    PQ + ' .cr-head{display:contents}',
    PQ + ' .cr-head>.sp-back{grid-area:hd;align-self:center;justify-self:stretch;margin:0;min-width:0}',
    PQ + ' .cr-head>.pt,' + PQ + ' .cr-head>.cr-hcr{display:none}',
    PQ + ' .cr-head>.cr-title{grid-area:sb;align-self:center;min-width:0;padding:0 60px 0 2px}',
    PQ + ' .cr-in:has(>.cr-sub:not([hidden])) .cr-head>.cr-title,' + PQ + ' .cr-in:has(>.cr-tabs.sp-tabs-strip:not([hidden])) .cr-head>.cr-title{display:none}',
    PQ + ' .cr-title small{display:none}',
    PQ + ' .cr-title b{font-size:var(--ph-head);line-height:1.1;white-space:normal;overflow:visible;text-overflow:clip;transform:rotate(-1deg);padding:0 4px 2px 2px}',
    PQ + ' .cr-head>.cr-ovr{grid-area:sb;justify-self:end;align-self:center;--sp-stamp:44px;margin:4px 4px 0 0;transform:rotate(-8deg)}',
    PQ + ' .cr-ovr .sp-sc b{font-size:19px}',
    PQ + ' .cr-sub{grid-area:sb;align-self:center;min-width:0;margin:0 calc(var(--sp-stamp,44px) + 26px) 0 0;padding:0}',
    PQ + ' .cr-tabs{grid-area:tb;min-height:0;padding:0;overflow:visible}',
    PQ + ' .cr-tabs.sp-tabs-strip{grid-area:sb;align-self:center;margin-right:calc(var(--sp-stamp,44px) + 26px)}',
    PQ + ' .cr-body{grid-area:bd;min-height:0;padding:16px 8px 20px 4px;scroll-padding:12px}',
    // ---- columna de apartados: icono encima del rótulo, 44 px de alto (a 375 de alto caben los 6; a 320 se desliza con desvanecido)
    PQ + ' #crTabs.sp-vtabs{width:100%;height:100%}',
    PQ + ' #crTabs.sp-vtabs .tb-row{gap:var(--ph-hit-gap);padding:2px 4px 8px 2px}',
    PQ + ' #crTabs.sp-vtabs .tab{flex:none;flex-direction:column;justify-content:center;align-items:center;gap:1px;min-height:44px;height:44px;padding:2px 2px 3px;text-align:center;--sp-tbs:var(--ph-label);letter-spacing:0}',
    PQ + ' #crTabs.sp-vtabs .tab svg{width:19px;height:19px;flex:none;fill:none!important;stroke:currentColor}',
    PQ + ' #crTabs.sp-vtabs .tab .tb-t{white-space:nowrap;line-height:1;overflow-wrap:normal}',
    PQ + ' #crTabs.sp-vtabs .tab:is(.on,[aria-selected="true"]){transform:rotate(-2deg)}',
    PQ + ' .tabs .tab .dot{position:absolute;top:3px;right:5px;margin:0;width:11px;height:11px}',
    PQ + ' #crTabs .tab .tb-b{position:absolute;top:0;right:1px;min-width:20px;padding:1px 5px;border-radius:7px 9px 7px 8px;background:var(--sp-danger);color:#fff6e4;box-shadow:0 0 0 2px var(--sp-ink);font:700 var(--ph-cap)/1.2 var(--sp-ui);letter-spacing:0;text-shadow:none;font-style:normal}',
    // ---- tira de sub-pestañas (y de ofertas): 44 px, opacas; la elegida, del color de tu club
    PQ + ' #crTabs.sp-tabs-strip .tab{flex:0 0 auto!important;max-width:none}',
    PQ + ' :is(#crSub,#crTabs.sp-tabs-strip) .tab{--sp-tbh:44px;--sp-tbs:var(--ph-label);flex:1 0 auto;min-width:0;padding:0 12px;letter-spacing:.02em}',
    PQ + ' :is(#crSub,#crTabs.sp-tabs-strip) .tab:not(.on):not(.kf):not(:focus-visible)::before{opacity:1;background:var(--sp-ink2)}',
    PQ + ' #crTabs.sp-tabs-strip .tab:is(.on,[aria-selected="true"]){color:var(--sp-kit-ink);text-shadow:var(--sp-kit-ts)}',
    PQ + ' #crTabs.sp-tabs-strip .tab:is(.on,[aria-selected="true"])::before{background:var(--sp-kit)}',
    PQ + ' #crSub .tb-row,' + PQ + ' #crTabs.sp-tabs-strip .tb-row{background:none;box-shadow:none;padding:3px 4px 5px}',
    // (la tira se desliza en horizontal y se desvanece por la derecha cuando queda más; el sello de la media va aparte, sin taparla)
    PQ + ' #crSub .tb-row,' + PQ + ' #crTabs.sp-tabs-strip .tb-row{display:flex;gap:var(--ph-strip-gap);min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior:contain;scrollbar-width:none}',
    PQ + ' #crSub .tb-row.sp-more-x,' + PQ + ' #crTabs.sp-tabs-strip .tb-row.sp-more-x{-webkit-mask:linear-gradient(to right,#000 calc(100% - 28px),transparent);mask:linear-gradient(to right,#000 calc(100% - 28px),transparent)}',
    // ---- letra (tokens): lectura ≥ 14, filas 15-17, rótulos dorados 13-14,5, nada < 12
    PQ + ' p{font-size:var(--ph-body);line-height:1.4}',
    PQ + ' .muted{font-size:var(--ph-body)}',
    PQ + ' :is(td,th,.tag,.chip,h3,.fact small,.msg small,.cal-r) .muted{font-size:inherit}',
    PQ + ' h3{font-size:var(--ph-label);letter-spacing:.03em}',
    PQ + ' .card{padding:12px 14px;margin:0 0 20px}',
    PQ + ' .card>h3:first-child{margin:-25px 0 8px -6px;font-size:var(--ph-label);letter-spacing:.03em;padding:4px 10px 5px}',
    PQ + ' .tag{font-size:var(--ph-cap);padding:3px 8px}',
    PQ + ' .chip{font-size:var(--ph-cap)}',
    PQ + ' .note,' + PQ + ' .bd-msg{font-size:var(--ph-body)}',
    PQ + ' .bigname{font-size:var(--ph-head)!important;line-height:1.12}',
    PQ + ' .stars{font-size:var(--ph-row)}',
    PQ + ' button.lnk{min-height:44px;font-size:var(--ph-row)}',
    PQ + ' button' + NB + '{font-size:var(--ph-row);min-height:44px}',
    // tablas: filas de 44, cifras grandes y tabulares; cabecera a --ph-cap sin versalitas espaciadas
    PQ + ' table{font-size:var(--ph-row);border-spacing:0 5px}',
    PQ + ' th{font-size:var(--ph-cap);letter-spacing:.02em;text-transform:none;padding:2px 6px;color:rgba(255,244,220,.78)}',
    PQ + ' td{padding:8px 6px;height:44px}',
    PQ + ' td.pts{font-size:var(--ph-num)}',
    PQ + ' td:not(.club):not(.l){font-variant-numeric:tabular-nums}',
    PQ + ' button.cw-tl-b{line-height:44px}',
    // selector de liga del móvil: ‹ nombre › (las flechas, pegatinas redondas de 44; el nombre, brochazo dorado que abre la hoja)
    PQ + ' .cr-lgp{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:10px;align-items:center;margin:0 0 12px}',
    PQ + ' .cr-lgp button.cr-lgp-a{width:44px;height:44px;min-height:44px;padding:0;border-radius:50% 46% 52% 48%/48% 52% 46% 50%;background:var(--sp-cream);color:var(--sp-ink);font:400 26px/1 var(--sp-pop)}',
    PQ + ' .cr-lgp button.cr-lgp-v{position:relative;isolation:isolate;min-height:44px;padding:0 12px;background:none;box-shadow:none;color:var(--sp-ink);font:400 var(--ph-btn)/1.1 var(--sp-pop);text-transform:none;white-space:normal;transform:rotate(-1deg)}',
    PQ + ' .cr-lgp button.cr-lgp-v::before{content:"";position:absolute;inset:2px -4px;z-index:-1;background:var(--sp-gold);' + BR + ';filter:drop-shadow(2px 0 0 var(--sp-ink)) drop-shadow(-2px 0 0 var(--sp-ink)) drop-shadow(0 2px 0 var(--sp-ink)) drop-shadow(0 -2px 0 var(--sp-ink)) drop-shadow(2px 3px 0 var(--sp-ink))}',
    PQ + ' .cr-lgp button.cr-lgp-v:is(.kf,:focus-visible){box-shadow:none;transform:rotate(-1deg) scale(1.03)}',
    // calendario, mensajes, datos
    PQ + ' .cal{gap:8px}',
    PQ + ' .cal-r{min-height:48px;padding:6px 10px;font-size:var(--ph-row);grid-template-columns:3em minmax(0,1fr) auto}',
    PQ + ' .cal-r b,' + PQ + ' .cal-r .res{font-size:var(--ph-row)}',
    PQ + ' .msg{padding:10px 12px;margin:0 0 10px}',
    PQ + ' .msg small{font-size:var(--ph-cap)}',
    PQ + ' .msg b{font-size:var(--ph-row);margin-top:2px}',
    PQ + ' .msg p{font-size:var(--ph-body)}',
    PQ + ' .fact{grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:10px;margin:10px 0}',
    PQ + ' .fact div{padding:8px 12px}',
    PQ + ' .fact small{font-size:var(--ph-label);letter-spacing:.03em}',
    PQ + ' .fact b{font-size:var(--ph-row);font-weight:700}',
    PQ + ' .mline .chip{font-size:var(--ph-cap)}',
    // atributos: nombre, barra, cifra grande y «+n» redondo de 44
    PQ + ' .attr{grid-template-columns:minmax(0,8em) minmax(40px,1fr) 2.2em 48px;gap:10px;min-height:48px;font-size:var(--ph-row)}',
    PQ + ' .attr>span:first-child{font:400 var(--ph-row)/1.1 var(--sp-pop);letter-spacing:.01em}',
    PQ + ' .attr b{font-size:var(--ph-num)}',
    PQ + ' .attr button{width:48px;min-width:44px;height:44px;min-height:44px;padding:0;font-size:var(--ph-row)}',
    PQ + ' .attr .bar,' + PQ + ' .pbar .bar,' + PQ + ' .xp{height:12px}',
    PQ + ' .pbar{grid-template-columns:minmax(0,7em) minmax(0,1fr) 3em;min-height:40px}',
    PQ + ' .pbar span:first-child{font-size:var(--ph-row)}',
    PQ + ' .pbar b{font-size:var(--ph-row)}',
    // insignias
    PQ + ' .bdg{grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:12px}',
    PQ + ' .bd{font-size:var(--ph-label);min-height:72px;padding:10px 12px}',
    PQ + ' .bd strong{font-size:var(--ph-row)}',
    PQ + ' .bd .muted{font-size:var(--ph-cap)}',
    PQ + ' .bd[aria-pressed="true"] strong::after{font-size:var(--ph-cap)}',
    // plan del entrenador (en Partido)
    PQ + ' .pl-focus{grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}',
    PQ + ' .pl-focus button{min-height:52px;font-size:var(--ph-label)}',
    PQ + ' .pl-focus button small{font-size:var(--ph-cap);letter-spacing:0}',
    PQ + ' .pl-slots{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}',
    PQ + ' .pl-k{font-size:var(--ph-cap);letter-spacing:.04em}',
    PQ + ' .pl-n b{font-size:var(--ph-row);white-space:normal}',
    PQ + ' .pl-n small{font-size:var(--ph-label)}',
    PQ + ' .pl-b{gap:10px}',
    PQ + ' .pl-b button{min-height:44px;font-size:var(--ph-row)}',
    PQ + ' .gr{min-width:44px;height:44px;font-size:22px}',
    PQ + ' .gr.sm{min-width:32px;height:28px;font-size:var(--ph-row)}',
    PQ + ' :is(.tr-left,.tr-last,.tr-fight,.tr-why){font-size:var(--ph-body)}',
    PQ + ' .tr-dots i{width:14px;height:14px}',
    PQ + ' .tr-n b{font-size:var(--ph-row)}',
    PQ + ' .tr-n small{font-size:var(--ph-label)}',
    // compañeros, bandeja, ofertas
    PQ + ' .mate{gap:12px;padding:10px 0}',
    PQ + ' .mate b{font-size:var(--ph-row)!important}',
    PQ + ' .offer-x{padding:12px 0!important}',
    PQ + ' .confirm{padding:12px 14px}',
    PQ + ' .bench p{font-size:var(--ph-body)}',
    PQ + ' .cr-st6{font-size:var(--ph-body)}',
    PQ + ' :is(.seg,.lg-sw,.cw-opt) button{font-size:var(--ph-label);min-height:44px;padding:0 14px}',
    PQ + ' :is(.seg,.lg-sw,.cw-opt) button small{font-size:var(--ph-cap)!important}',
    PQ + ' :is(.roles,.tgrid) button small{font-size:var(--ph-label)}',
    PQ + ' .tgrid button{font-size:var(--ph-row)}',
    PQ + ' .cr-dot{width:24px;height:24px}',
    // parches (acción principal): el rótulo parte en 2 líneas antes que cortarse
    PQ + ' .sp-patch .sp-t{white-space:normal;overflow:visible;text-overflow:clip;line-height:1}',
    // ---- Partido: el brochazo y «Jugar partido» se ven sin desplazar (Faro y el resultado de la prueba van debajo)
    PQ + ' #crBody[data-cv^="match"]{display:flex;flex-direction:column}',
    PQ + ' #crBody[data-cv^="match"]>*{flex:none}',
    PQ + ' #crBody[data-cv^="match"]>.cr-next{order:-2}',
    // (con avisos, el ticket va dentro de .cr-two: también delante de Faro)
    PQ + ' #crBody[data-cv^="match"]>.cr-two{order:-2}',
    // .cr-two: por debajo de 700 px de ancho, una columna (el ticket a lo ancho y los avisos debajo, de 2 en 2); más ancho, el ticket con más sitio
    PQ + ' .cr-two{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}',
    // (Faro, si hay escena, va en .cr-two tras el ticket: en dos columnas, bajo el ticket y con los avisos al lado)
    PQ + ' .cr-two{grid-template-areas:"nx sd" "fa sd" "nd sd"}' + PQ + ' .cr-two>.cw-mentor{grid-area:fa;margin-bottom:8px}' +
      PQ + ' .cr-two:has(>.cw-mentor){grid-template-rows:auto auto 1fr}',   // (1fr: los avisos, más altos, no estiran la fila del ticket y Faro sigue a la vista)
    '@media (max-width:699.98px){' + PQ + ' .cr-two{display:block}' + PQ + ' .cr-two .st-chips :is(button,.sp-btn){flex-basis:calc(50% - 8px)}}',
    // (en la columna del ticket, el antetítulo hasta 2 líneas: en una, la jornada quedaba tras los puntos suspensivos)
    '@media (min-width:700px){' + PQ + ' .cr-two .cr-tk .sp-k{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}}',
    PQ + ' .cr-next{margin:0 0 22px}',
    PQ + ' .cr-tk{--sp-h:clamp(92px,70px + 3.5vw,104px);--sp-cs:clamp(36px,2.6vw + 21px,44px);margin:0 0 12px}',
    PQ + ' .cr-tk .sp-tk-main{white-space:normal}',
    PQ + ' .cr-tk .sp-tk-main{padding:16px 22px 14px 8px}',
    PQ + ' .cr-tk .sp-k{display:block;font-size:var(--ph-cap);letter-spacing:.02em;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    PQ + ' .cr-tk .sp-k .sp-chip{font-size:var(--ph-cap)}',
    PQ + ' .cr-tk .sp-t{font-size:var(--ph-head);line-height:1.08;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
    PQ + ' .cr-tk .sp-s{font-size:var(--ph-label);white-space:normal}',
    PQ + ' .cr-tk .sp-s+.sp-s{display:none}',
    PQ + ' .cr-go{gap:14px;margin:0 0 14px;flex-wrap:nowrap}',
    PQ + ' .cr-go .sp-patch{flex:1.6 1 0;--sp-ph:clamp(56px,40px + 2.9vw,68px)}',
    PQ + ' .cr-go .sp-btn{flex:0 1 auto;min-width:0;white-space:normal;--sp-px:14px}',
    PQ + ' .cr-go .sp-btn .sp-t{white-space:nowrap}',
    PQ + ' .cr-go .sp-btn .sp-s{font-size:var(--ph-cap)}',
    PQ + ' .cr-nd p{margin:6px 0}',
    PQ + ' .cr-nd .lnk{margin:4px 0 0;display:inline-flex}',
    // ---- Jugador: la ficha en una línea (retrato pequeño) y los atributos a la vista
    PQ + ' .cr-ptw{margin:0 4px 4px 0}',
    PQ + ' .cr-pcard{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));column-gap:26px;align-items:center;padding-top:10px}',
    PQ + ' .cr-pcard>:not(.attr){grid-column:1/-1}',
    PQ + ' .cr-pid{display:flex;align-items:center;flex-wrap:wrap;gap:2px 10px;min-width:0}',
    PQ + ' .cr-pid>b{font:400 var(--ph-row)/1.1 var(--sp-pop);color:var(--sp-cream);letter-spacing:.01em;text-shadow:2px 2px 0 var(--sp-ink)}',
    PQ + ' .cr-pid>.muted{font-size:var(--ph-label)}',
    PQ + ' .cr-pts{margin-left:auto;display:inline-flex;align-items:baseline;gap:4px;padding:3px 10px 4px;border-radius:8px 12px 9px 13px/12px 8px 13px 9px;background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);font:700 var(--ph-label)/1 var(--sp-ui);transform:rotate(-2deg)}',
    PQ + ' .cr-pts b{font:400 var(--ph-num)/1 var(--sp-pop)}',
    PQ + ' .cr-pts.off{background:var(--sp-ink2);color:var(--sp-cream)}',
    PQ + ' .cr-pcard>.xp{margin:6px 0 4px;height:8px}',
    PQ + ' .cr-pcard>p.muted:last-child{font-size:var(--ph-label)}',
    PQ + ' .pt.cr-pt88{width:56px;height:56px;border-radius:12px}',
    PQ + ' .pt.cr-pt72{width:64px;height:64px;border-radius:13px}',
    PQ + ' .cr-ptc{transform:scale(.8);right:-10px;bottom:-10px}',
    // ---- crear: dos columnas que se desplazan juntas; «Crear y ver ofertas» siempre a la vista (pegado abajo)
    PQ + ' .cf{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px 16px}',
    PQ + ' .cf label{font-size:var(--ph-label);letter-spacing:.04em}',
    PQ + ' .cf input{min-height:48px;font-size:18px}',
    PQ + ' .stp b{font-size:30px}',
    PQ + ' .stp button{width:48px;height:48px}',
    PQ + ' .roles button{min-height:56px;font-size:var(--ph-row)}',
    PQ + ' .roles.diffs button{min-height:52px}',
    PQ + ' .roles.diffs button small{display:none}',
    PQ + ' .dh{display:block}',
    PQ + ' .prev{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px 10px;font-size:var(--ph-label)}',
    PQ + ' .prev b{font-size:var(--ph-row)}',
    PQ + ' .cc-reg{font-size:var(--ph-cap);letter-spacing:.06em}',
    PQ + ' .cf>.card:not(.confirm):not(:first-child){order:5}',
    PQ + ' .cr-body:has(>.cf){padding-top:24px}',
    // ---- elegir club: la ficha con «Firmar» justo debajo del nombre
    PQ + ' .card.offer-full{display:flex;flex-direction:column}',
    PQ + ' .card.offer-full>.row{order:-2}',
    PQ + ' .card.offer-full>.acts{order:-1;margin:12px 0 6px}',
    PQ + ' .offer-x{display:flex;flex-direction:column}',
    PQ + ' .offer-x>.row{order:-2}',
    PQ + ' .offer-x>.acts{order:-1;margin:10px 0 6px}',
    // ---- previa de la prueba: club, botones y objetivos
    PQ + ' .card.tp{display:flex;flex-direction:column}',
    PQ + ' .tp-hero{order:-2;padding:12px 14px;gap:12px}',
    PQ + ' .tp-hero b{font-size:var(--ph-title)}',
    PQ + ' .tp-hero small{font-size:var(--ph-cap);letter-spacing:.06em}',
    PQ + ' .tp-acts{order:-1;margin:0 0 10px;gap:14px}',
    PQ + ' .tp-goals{order:-1;display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}',
    PQ + ' .tp-gh{display:none}',
    // ---- barra de abajo (#crDock): la acción principal de una ficha larga, fuera del desplazamiento (phDock)
    PQ + ' .cr-dock[hidden]{display:none!important}',
    PQ + ' .cr-in:has(>.cr-dock:not([hidden])){grid-template-rows:var(--ph-hh) minmax(0,1fr) auto;grid-template-areas:"hd sb" "tb bd" "tb dk"}',
    PQ + ' .cr-in:has(>.cr-tabs[hidden]):has(>.cr-dock:not([hidden])),' + PQ + ' .cr-in:has(>.cr-tabs.sp-tabs-strip):has(>.cr-dock:not([hidden])){grid-template-areas:"hd sb" "bd bd" "dk dk"}',
    PQ + ' .cr-dock{grid-area:dk;margin:0;padding:0 2px 2px;gap:14px;align-items:center}',
    PQ + ' .cr-dock .sp-patch{--sp-ph:clamp(54px,38px + 2.9vw,66px);flex:0 1 auto;min-width:min(200px,50%)}',
    PQ + ' .cr-dock [data-act="plan-go"]{--sp-pt:min(var(--ph-patch),20px)}',
    PQ + ' .cr-dock [data-act="plan-go"] .sp-t{white-space:nowrap}',
    PQ + ' .cr-dock .sp-btn{flex:0 1 auto;min-width:0;white-space:normal}',
    PQ + ' .cr-dock .sp-btn .sp-t{white-space:nowrap}',
    PQ + ' .cr-dock small,' + PQ + ' .cr-dock .sp-s{display:block;font-size:var(--ph-cap)}',
    PQ + ' .tp-acts .sp-patch{--sp-ph:clamp(56px,40px + 2.9vw,68px)}',
    PQ + ' .tp-acts small,' + PQ + ' .tp-acts .sp-s{font-size:var(--ph-cap)}',
    PQ + ' .tp-eye{font-size:var(--ph-body)}',
    PQ + ' .tp-fmt{font-size:var(--ph-row)}',
    PQ + ' .tp-goals li{font-size:var(--ph-label);line-height:1.15;padding:6px 12px 6px 6px;min-height:40px;flex:1 1 auto;max-width:100%}',
    PQ + ' .tp-goals li i{width:24px;height:24px}',
    // 568×320: los 3 objetivos en una fila de 3 fichas (antes el 3º asomaba cortado bajo la barra de abajo)
    PS + ' .tp-goals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    PS + ' .tp-goals li{font-size:13px;line-height:1.1;padding:5px 7px 5px 5px;gap:6px;min-height:44px;max-width:none;overflow-wrap:anywhere;hyphens:auto}',
    PS + ' .tp-goals li i{width:20px;height:20px;font-size:12px}',
    PQ + ' .et-l small{font-size:var(--ph-cap)}',
    PQ + ' .et-goals span{font-size:var(--ph-label)}',
    // ---- fin de temporada: el sello del puesto
    PQ + ' .cr-pos{--sp-stamp:64px;top:-14px}',
    PQ + ' .cr-end{padding-right:82px}',
    // hojas del final de la Carrera (contenido de career-ui; la hoja es del partido): suelos de letra del móvil
    ':root.ph:not(#_):not(#_):not(#_) #end .end-trial .et-t strong{font-size:var(--ph-head)}',
    ':root.ph:not(#_):not(#_):not(#_) #end .end-trial .et-t span{font-size:var(--ph-body);line-height:1.35}',
    ':root.ph:not(#_):not(#_):not(#_) #end .end-trial .et-l small{font-size:var(--ph-cap)}',
    ':root.ph:not(#_):not(#_):not(#_) #end .et-goals>span{font-size:var(--ph-label);padding:3px 10px}',
    ':root.ph:not(#_):not(#_):not(#_) #end .et-goals small{font-size:var(--ph-cap)}',
    ':root.ph:not(#_):not(#_):not(#_) #end .end-rt .er-n small,:root.ph:not(#_):not(#_):not(#_) #end .end-rt .er-n span{font-size:var(--ph-cap)}',
    ':root.ph:not(#_):not(#_):not(#_) #end .end-rt .er-h{font-size:var(--ph-label);letter-spacing:.03em;min-width:0}',
    ':root.ph:not(#_):not(#_):not(#_) #end .end-rt .chip{font-size:var(--ph-cap)}',
    ':root.ph:not(#_):not(#_):not(#_) #gymEnd .cdr-g small{font-size:var(--ph-cap)}',
    ':root.ph:not(#_):not(#_):not(#_) #gymEnd .cdr-bar>span:first-child,:root.ph:not(#_):not(#_):not(#_) #gymEnd .cdr-bar b{font-size:var(--ph-label)}',
    ':root.ph:not(#_):not(#_):not(#_) #gymEnd .cdr-tags>span{font-size:var(--ph-cap)}',
    // ---- repaso móvil (18-nov-2026, 2.ª pasada)
    // columna de apartados: el brochazo cubre icono + rótulo enteros (antes 44 px: el rótulo colgaba por debajo de la tinta)
    // (48 px: a 844×390 caben los 6 sin desplazar; a 568×320 se desliza con desvanecido)
    // (separación ≥ --ph-hit-gap también con la elegida inclinada (-2°): --ph-tab-gap = 10 + 2 px)
    PQ + ' #crTabs.sp-vtabs .tb-row{gap:var(--ph-tab-gap);padding-bottom:6px}',
    PQ + ' #crTabs.sp-vtabs .tab{min-height:48px;height:auto;padding:5px 4px 6px;gap:1px;box-sizing:border-box}',
    PQ + ' #crTabs.sp-vtabs .tab::before{inset:0 -3px}',
    PQ + ' #crTabs.sp-vtabs .tab svg{width:18px;height:18px}',
    PQ + ' .tabs .tab .dot{top:-3px;right:-3px}',
    // tablas (Clasificación, Clubes, Temporadas…): la cabecera pegada arriba al desplazar (phReveal deja tu fila debajo)
    PQ + ' #crBody table thead th{position:sticky;top:0;z-index:2;height:30px;padding-top:0;padding-bottom:0;background:var(--sp-ink);color:var(--sp-gold)}',
    PQ + ' #crBody table thead th:first-child{border-radius:9px 0 0 10px}',
    PQ + ' #crBody table thead th:last-child{border-radius:0 10px 9px 0}',
    // Partido: «Jugar partido» + «Simular» en la barra de abajo (phDock), fuera del desplazamiento
    PQ + ' .cr-dock .sp-patch[data-act="play"],' + PQ + ' .cr-dock .sp-patch[data-act="bench"]{--sp-ph:clamp(50px,36px + 2.4vw,58px);min-width:min(260px,58%)}',
    PS + ' .cr-dock .sp-patch[data-act="play"],' + PS + ' .cr-dock .sp-patch[data-act="bench"]{--sp-ph:50px}',
    PQ + ' .cr-dock [data-act="sim"]{--sp-h:48px}',
    // tira de sub-pestañas: menos relleno (a 667 y 568 sobraban 4 px escondidos sin desvanecido; 9 px desde que el hueco es --ph-strip-gap)
    PQ + ' #crSub.sp-tabs .tab{padding:0 9px}',
    PS + ' #crSub.sp-tabs .tab{padding:0 9px}',   // (.sp-tabs: la de :is(#crSub,#crTabs.sp-tabs-strip) pesa id + clase)
    // explicaciones detrás de «?» (Insignias, Ahorros, Seguidores): el «?» en la esquina de la pegatina del título
    PQ + ' .card:has(>.cr-q){position:relative}',
    // (tarjeta que solo tenía la explicación, Ahorros: queda la pegatina del título, sin caja vacía debajo)
    PQ + ' .card:has(>h3:first-child+.cr-q:last-child){min-height:0;padding:0 14px;margin-bottom:34px;background:none;box-shadow:none;border:0}',
    PQ + ' .card:has(>h3:first-child+.cr-q:last-child){display:flex;align-items:center;gap:12px}',
    PQ + ' #crBody>.card:has(>h3:first-child+.cr-q:last-child){margin:0 0 18px}',
    PQ + ' .card:has(>h3:first-child+.cr-q:last-child)>h3:first-child{margin:0}',
    PQ + ' .card:has(>h3:first-child+.cr-q:last-child)>.cr-q{position:relative;top:auto;right:auto}',
    PQ + ' #crBody>.card:first-child:has(>.cr-q){margin-top:10px}',   // (el «?» asoma por encima de la tarjeta: que no lo corte el borde)
    PQ + ' .card>.cr-q{position:absolute;top:-26px;right:10px;z-index:2;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:0;border-radius:50%;background:var(--sp-ink);color:var(--sp-cream);' +
      'box-shadow:0 0 0 2.5px var(--sp-cream),2px 3px 0 2.5px var(--sp-ink);font:400 var(--ph-row)/1 var(--sp-pop);letter-spacing:0;text-transform:none;text-shadow:none;transform:rotate(6deg)}',
    PQ + ' .card>.cr-q:is(.kf,:focus-visible){outline:none;background:var(--sp-gold);color:var(--sp-ink)}',
    // ofertas: nombre en una línea y las 4 cifras del trato a la vista, encima de «Firmar»
    PQ + ' .offer-full .bigname.cr-on{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    PQ + ' .offer-full>.row{align-items:center}',
    PQ + ' .offer-full>.row .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    PQ + ' .sp-heros.cr-oh{margin:10px 0 12px;transform:rotate(-.6deg)}',
    PQ + ' .sp-heros.cr-oh>*{padding:4px 6px}',
    PQ + ' .sp-heros.cr-oh .sp-hn{font-size:var(--ph-row);white-space:normal;line-height:1.05;overflow-wrap:anywhere}',
    PQ + ' .sp-heros.cr-oh .sp-hn.n{font-size:var(--ph-num)}',
    // hoja de ligas (fuera de #career: #spSheets)
    '#spSheets .cr-lgs .cr-lgs-g{margin:10px 0 6px;font:400 var(--ph-label,14px)/1.1 var(--sp-pop);letter-spacing:.03em;color:var(--sp-gold);text-shadow:2px 2px 0 var(--sp-ink)}',
    '#spSheets .cr-lgs .cr-lgs-g:first-child{margin-top:0}',
    '#spSheets .cr-lgs .cr-lgs-r{display:flex;flex-wrap:wrap;gap:12px 10px;padding:2px 2px 6px}'
  ].join('\n');

  // =================================================================== construcción
  function build() {
    if (root) return;
    ensureCss();
    root = document.createElement('div'); root.id = 'career'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Carrera');
    root.innerHTML = '<div class="cr-in"><div class="cr-head"></div><div class="cr-tabs" id="crTabs" role="tablist" aria-label="Secciones de la Carrera"></div>' +
      '<div class="cr-sub" id="crSub" role="tablist" aria-label="Apartados" hidden></div><div class="cr-body" id="crBody"></div>' +
      '<div class="cr-dock sp-dock" id="crDock" hidden></div></div>';
    (document.getElementById('app') || document.body).appendChild(root);
    head = root.querySelector('.cr-head'); tabsEl = root.querySelector('.cr-tabs'); subEl = root.querySelector('.cr-sub'); body = root.querySelector('.cr-body'); dock = root.querySelector('.cr-dock');
    // SPLAT (etapa 2): pestañas en trazos de pincel y el dibujo de manchas, parche y sellos en lo que se repinta (VB.Splat.watch)
    tabsEl.classList.add('sp-tabs'); subEl.classList.add('sp-tabs'); root.classList.add('sp-car');
    if (VB.Splat && VB.Splat.watch) { try { VB.Splat.watch(root); } catch (e) { } }
    if (VB.Splat && VB.Splat.info) { try { VB.Splat.info(root); } catch (e) { } }   // «?» de las explicaciones (móvil) → hoja
    root.addEventListener('click', onClick);
    root.addEventListener('input', function (e) { if (e.target && e.target.id === 'crName') form.name = e.target.value; });
    root.addEventListener('pointerdown', function () { var k = root.querySelectorAll('.kf'); for (var i = 0; i < k.length; i++) k[i].classList.remove('kf'); }, { passive: true });
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('vb:ph', function () { if (open) render(); });   // (móvil ↔ PC: columna de apartados, tira, nombres cortos)
    // deslizar el dedo sobre el contenido (≥ 56 px en horizontal, como VB.UI.tabs): sub-pestaña si la hay, si no apartado / oferta.
    // Aquí y no en el componente porque las dos barras comparten el mismo contenido (.cr-body)
    var sw0 = null;
    body.classList.add('tab-swipe');
    body.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || (e.target.closest && e.target.closest('input,table,.lg-sw,.seg'))) { sw0 = null; return; }
      sw0 = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    }, { passive: true });
    body.addEventListener('pointerup', function (e) {
      if (!sw0 || e.pointerId !== sw0.id) return;
      var dx = e.clientX - sw0.x, dy = e.clientY - sw0.y, dt = performance.now() - sw0.t; sw0 = null;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) { var tb = barApi('sub'); if (tb) tb.step(dx < 0 ? 1 : -1, 'swipe'); }
    }, { passive: true });
    body.addEventListener('pointercancel', function () { sw0 = null; }, { passive: true });
  }

  // =================================================================== render
  function render() {
    if (!root) return;
    if (open) { var cc = C() && C().get(); backdrop(cc ? (isHall(cc) ? 'hall' : 'beach') : ''); }   // (cambiar de Carrera playa/pista con el hub abierto)
    try { renderInner(); }
    catch (e) {   // guardado raro que career.js no ha sabido reparar: no dejar el hub vacío y sin salida
      try { if (window.console) console.error('CareerUI.render', e); } catch (e2) { }
      renderBroken();
    }
    try { splatify(); } catch (e) { }
    try { phDock(); } catch (e) { }
  }
  /** Móvil: la acción principal que vive al pie de una ficha larga (Firmar / Pedir más rol de una oferta, Saltar a la pista /
   *  Simular de la previa de la prueba, Ir al plan del entrenador) sale del desplazamiento a la barra de abajo a la derecha
   *  (#crDock, .sp-dock: la principal, la última). Así sigue a mano después de leer la ficha entera. */
  function phDock() {
    if (!dock) return;
    // (PC/tableta: «Crear y ver ofertas» también va a la barra; pegado dentro del desplazamiento tapaba los países de debajo)
    // (Partido › «Jugar partido» + «Simular» también: se iba con el desplazamiento al leer los detalles de debajo)
    // (fin de temporada: «Ver ofertas» o, sin ofertas, «Seguir en…» / «Renovar con…»; Faro y el resumen la dejaban fuera de la pantalla)
    var src = !body ? null : PH() ? body.querySelector('.card.offer-full>.acts,.card.tp>.tp-acts,.card>.acts:has(>[data-act="plan-go"]),.cr-next>.acts.cr-go,.cf .acts:has(>[data-act="create"]),' +
      '#crBody[data-cv^="match"]>.card>.acts:has(>.pri:is([data-s="offers"],[data-act="stay"]))') :
      body.querySelector('.cf .acts:has(>[data-act="create"])');
    dock.innerHTML = '';
    if (!src) { dock.hidden = true; return; }
    var bs = Array.prototype.slice.call(src.children), pri = null;
    bs.forEach(function (b) { if (b.classList.contains('pri') && !pri) pri = b; else dock.appendChild(b); });
    if (pri) dock.appendChild(pri);
    src.parentNode.removeChild(src);
    dock.hidden = false;
    try { if (VB.Splat && VB.Splat.sync) VB.Splat.sync(); } catch (e) { }
  }
  /** Móvil: tu fila de la tabla (o la próxima jornada del calendario), a la vista dentro del contenido al cambiar de pestaña. */
  function phReveal() {
    if (!body || !PH() || !(VB.Splat && VB.Splat.reveal)) return;
    var me = body.querySelector('tr.me,.cal-r.next'); if (!me) return;
    var th = me.tagName === 'TR' && me.closest('table') && me.closest('table').querySelector('thead');
    if (!th) { try { VB.Splat.reveal(me, { block: 'center' }); } catch (e) { } return; }
    // tabla: la cabecera va pegada arriba (sticky); tu fila, centrada si hay sitio pero nunca debajo de la cabecera
    try {
      var pr = body.getBoundingClientRect(), r = me.getBoundingClientRect(), hh = th.offsetHeight + 8, top = r.top - pr.top + body.scrollTop;
      var t = top - Math.max(hh, (body.clientHeight - r.height) / 2);
      body.scrollTop = Math.max(0, Math.min(body.scrollHeight - body.clientHeight, t));
    } catch (e) { }
  }
  // =================================================================== SPLAT (etapa 2, 17-nov-2026; notes/splat.md)
  // El HTML de siempre (aquí, career-life-ui.js y career-world-ui.js) recibe las clases del sistema tras cada pintado, en el mismo
  // frame (antes de que VB.Splat.watch decore): la acción principal de la pantalla, en parche cosido (.sp-patch, solo una); el resto
  // de botones de acción, en manchas de pintura (.sp-btn) con los colores repartidos; las decisiones, en manchas de colores que
  // contrastan; los botones pequeños de las filas, en manchas .sp-sm. Ids, data-act y manejadores, intactos.
  // colores: en las hojas de tinta, manchas claras (crema, turquesa, contraste); sobre el escenario o el papel, tinta
  var SPC = ['sp-cream', 'sp-teal', 'sp-alt', 'sp-cream'], SPD = ['sp-kit', 'sp-alt', 'sp-teal', 'sp-gold'];
  /** Rótulo del sistema: el texto en .sp-t y el <small> (si lo hay) en .sp-s, dentro de .sp-l. */
  function spLabel(b) {
    if (b.querySelector('.sp-l,.sp-t,svg')) return;
    var sm = null, n; for (n = b.firstElementChild; n; n = n.nextElementSibling) if (n.tagName === 'SMALL') { sm = n; break; }
    var sh = '';
    if (sm) { sm.removeAttribute('style'); sm.className = 'sp-s'; sh = sm.outerHTML; b.removeChild(sm); }
    b.innerHTML = '<span class="sp-l"><span class="sp-t">' + b.innerHTML.trim() + '</span>' + sh + '</span>';
  }
  function spBtn(b, col, size) {
    var k = b.classList;
    if (k.contains('sp-btn') || k.contains('sp-patch') || k.contains('sp-back')) return;
    spLabel(b);
    k.add('sp-btn', size || 'sp-md', k.contains('warn') ? 'sp-danger' : b.getAttribute('aria-pressed') === 'true' ? 'sp-gold' : col);
    if (b.getAttribute('aria-disabled') === 'true') k.add('sp-off');
  }
  function splatify() {
    if (!root || !body) return;
    var q = function (sel) { return Array.prototype.slice.call(body.querySelectorAll(sel)); }, pat = false, gi = 0;
    q('button.pri').forEach(function (b) {
      if (pat || b.closest('.offer-x,.lf-item,.pl-s,td,.tr-row')) return;
      spLabel(b); b.classList.add('sp-patch'); pat = true;
    });
    q('.lf-ev .acts button').forEach(function (b, i) { spBtn(b, SPD[i % SPD.length], 'sp-md'); b.classList.add('sp-wrap'); });
    q('.cr-go>button,.cw-mentor .acts>button').forEach(function (b, i) { spBtn(b, i && b.closest('.cw-mentor') ? 'sp-teal' : 'sp-ink', 'sp-md'); });
    q('.acts>button,.pick-acts>button,.tp-acts>button,.pl-acts>button').forEach(function (b) {
      spBtn(b, b.classList.contains('pri') ? 'sp-kit' : SPC[gi++ % SPC.length], 'sp-md');
    });
    q('.lf-item button,.pl-b button,button.lnk,button.cw-back,td button:not(.cw-tl-b),.mate button,.card>button.warn').forEach(function (b) {
      spBtn(b, b.classList.contains('pri') ? 'sp-kit' : b.getAttribute('data-act') === 'tr-rest' ? 'sp-teal' : 'sp-cream', 'sp-sm');
    });
    try { if (VB.Splat && VB.Splat.sync) VB.Splat.sync(); } catch (e) { }
  }
  function renderBroken() {
    head.innerHTML = backBtn() + '<div class="cr-title"><small>Carrera</small><b>Guardado dañado</b></div>';
    tabsEl.hidden = true; tabsEl.innerHTML = ''; subEl.hidden = true; subEl.innerHTML = '';
    body.innerHTML = '<div class="card"><h3>No se puede abrir la carrera</h3><p>La carrera guardada en este dispositivo está dañada y no se ha podido reparar.</p>' +
      (view === 'create' ? '<div class="acts">' :   // (fallo al pintar la ficha de crear: la Carrera activa puede estar sana, no ofrecer borrarla)
      '<p class="muted">Puedes borrarla y empezar otra.</p><div class="acts"><button class="warn" data-act="broken">' +
      (confirmStep === 2 ? (device() === 'touch' ? 'Toca otra vez para borrar' : 'Pulsa otra vez para borrar') : 'Borrar la carrera dañada') + '</button>') + '<button data-act="close">Volver al menú</button></div></div>';
  }
  function renderInner() {
    if (dbgTrial) { renderTrialPre(dbgTrial); return; }   // (?debug=trial&pre=1: la previa con datos de muestra)
    var c = C() && C().get();
    if (view === 'create' || !c) { renderCreate(c); return; }
    if (c.phase === 'pick') { renderPick(c); return; }
    if (trialI >= 0) { if (c.offers && c.offers[trialI] && c.offers[trialI].trial) { renderTrialPre(trialInfo(c, trialI)); return; } trialI = -1; }   // previa de una invitación a prueba (mitad o fin de temporada)
    var k = C().myClub(c), L = isHall(c) ? C().league(k.lid) : C().league(k.lvl);
    if (!TABS.some(function (t) { return t[0] === tab; }) || (tab === 'life' && !LUI())) tab = 'match';   // (Fama: playa y pista, 12-nov-2026)
    // B2: retrato (44; 36 a ≤ 420 de alto) delante del título y escudo del club (40, oculto a ≤ 420) antes de «TU MEDIA»
    head.innerHTML = backBtn() + ptHTML(c, 'me', 44, 'cr-pt', 'Retrato de ' + c.player.name) +
      '<div class="cr-title"><small>' + sp(['Carrera', 'Temporada ' + c.season, esc(L.name)], 'd') + '</small><b>' + sp([esc(c.player.name), esc(PH() ? shortClub(k) : k.name)], 's') + '</b></div>' +
      '<span class="cr-hcr sp-crest">' + crest(k, 40, c) + '</span>' + ovrStamp(C().playerOvr(c));
    // bandeja: lo no leído se marca como leído ANTES de pintar (el contador ya no sigue en la pestaña mientras la miras); el
    // resaltado de lo nuevo se conserva en este pintado (freshIds)
    var freshIds = {};
    if (tab === 'inbox' && C().readAll) { (c.inbox || []).forEach(function (m) { if (!m.r) freshIds[m.id] = 1; }); if (C().unread(c)) C().readAll(); }
    // career-story: lo del feed que no pide respuesta, igual (fresh['st' + id]); lo que pregunta sigue contando hasta contestar
    if (tab === 'inbox' && SUI() && !(sub.inbox === 'wall' && SUI().has('wall'))) SUI().seen(c, freshIds);
    var un = (C().unread ? C().unread(c) : 0) + (SUI() ? SUI().pending(c) : 0), offN = c.offers && c.offers.length;
    // noticias de la liga (career-world.js): se marcan como vistas al abrir Liga › Noticias; las nuevas se resaltan en ese pintado
    var CW = WUI() && VB.CareerWorld, newsSeen0 = c.world ? c.world.newsSeen | 0 : 0;
    if (CW && tab === 'league' && sub.league === 'news' && CW.newsUnseen(c)) CW.markNewsSeen();
    var newsN = CW ? CW.newsUnseen(c) : 0;
    tabsEl.hidden = false;
    var ph = PH(), lifeOn = !!LUI();
    tabsEl.setAttribute('data-ph-tabs', 'rail'); subEl.setAttribute('data-ph-tabs', 'strip');
    var tabDot = function (id) {
      return (id === 'player' && (c.player.pts > 0 || lookNew())) || (id === 'club' && (c.window === 'mid' || c.phase === 'off') && offN) || (id === 'match' && c.phase === 'off') ||
        (id === 'life' && !!(c.life && c.life.spOffers && c.life.spOffers.length)) || (id === 'league' && newsN > 0) ||
        (id === 'match' && !!SUI() && SUI().chips(c).length > 0);   // (career-story: hay avisos en Partido)
    };
    if (ph) {   // móvil: 6 apartados con icono; el contador de Mensajes en su pastilla (fuera del rótulo)
      drawBar('tab', TABS_PH.map(function (t) {
        var id = t[0] === 'life' && !lifeOn ? 'honors' : t[0];
        return [id, t[1], tabDot(t[0]), TAB_IC[t[0]], t[0] === 'inbox' && un ? String(un) : ''];
      }), tab === 'honors' && lifeOn ? 'life' : tab);
    } else drawBar('tab', TABS.filter(function (t) { return t[0] !== 'life' || lifeOn; }).map(function (t) {
      return [t[0], t[1] + (t[0] === 'inbox' && un ? ' (' + un + ')' : ''), tabDot(t[0])];
    }), tab);
    // Noticias y Clubes (career-world-ui.js), en las dos Carreras; sin career-world no salen
    var sl = subsOf(tab);
    if (sl) sl = sl.filter(function (s) { return (CW || (s[0] !== 'news' && s[0] !== 'clubs')) && (s[0] !== 'look' || !!LOOK()) && (!STORY_SUBS[s[0]] || !!(SUI() && SUI().has(s[0]))); });
    if (sl && tab === 'inbox' && sl.length < 2) sl = null;   // (Mensajes sin Redes: sin barra, como siempre)
    if (sl && tab === 'player' && !(SUI() && SUI().has('state'))) sl = sl.map(function (s) { return s[0] === 'train' ? ['train', 'Entreno'] : s; });
    if (sl && !sl.some(function (s) { return s[0] === sub[tab]; })) sub[tab] = sl[0][0];   // (p. ej. «Compañero» al pasar a la pista, o Noticias sin career-world)
    var subCur = sub[tab];
    if (ph && sl && (tab === 'life' || tab === 'honors')) {   // móvil: «Vida» = Fama (con Legado) · Tienda · Logros · Vitrina (Palmarés y Temporadas) · Opciones
      sl = LIFE_PH.filter(function (s) { var k = s[0].replace('h:', ''); return (lifeOn || s[0].indexOf('h:') === 0) && (!STORY_SUBS[k] || !!(SUI() && SUI().has(k))); });
      subCur = tab === 'honors' ? 'h:' + (sub.honors === 'seasons' ? 'titles' : sub.honors) : sub.life === 'legacy' ? 'fame' : sub.life;
    } else if (ph && sl && tab === 'player') sl = sl.filter(function (s) { return s[0] !== 'train' || sub.player === 'train'; });
    if (sl) {
      subEl.hidden = false;
      drawBar('sub', sl.map(function (s) {
        var dot = (s[0] === 'offers' && (offN || c.phase === 'off')) || (tab === 'player' && GROUP_OF[s[0]] && c.player.pts > 0) || (s[0] === 'news' && newsN > 0) || (s[0] === 'look' && lookNew()) ||
          (s[0] === 'fame' && ph && !!(c.life && c.life.spOffers && c.life.spOffers.length));
        return [s[0], (ph && SUB_PH[s[0]]) || s[1], dot];
      }), subCur);
    } else { subEl.hidden = true; }
    var h = '', hall = isHall(c);
    if (tab === 'match') h = hall ? renderMatch6(c) : renderMatch(c);
    else if (tab === 'inbox') h = sl && sub.inbox === 'wall' ? SUI().wall(c, HLP) : (SUI() && SUI().inbox(c, HLP, msgHTML, freshIds)) || renderInbox(c, freshIds);
    else if (tab === 'player') h = renderPlayer(c);
    else if (tab === 'club') h = renderClub(c);
    else if (tab === 'league') h = hall ? (sub.league === 'cal' ? renderCal6(c) : sub.league === 'cups' ? renderCups6(c)
      : sub.league === 'news' && CW ? WUI().newsHTML(c, HLP, newsSeen0)
      : sub.league === 'clubs' && CW ? (function () { var lid = tblLid && C().league(tblLid) ? tblLid : k.lid; return WUI().clubsHTML(c, lid, HLP, lgSw6(c, lid)); })() : renderTable6(c))
      : sub.league === 'cal' ? renderCal(c) : sub.league === 'news' && CW ? WUI().newsHTML(c, HLP, newsSeen0)
      : sub.league === 'clubs' && CW ? WUI().clubsHTML(c, tblLvl >= 0 ? tblLvl : k.lvl, HLP, PH() ? lgPick(C().LEAGUES.map(function (x) { return { v: x.lvl, label: x.name, short: x.short }; }), tblLvl >= 0 ? tblLvl : k.lvl, 'lvl', 'Liga') : null) : renderTable(c);
    else if (tab === 'life') h = sub.life === 'pass' && SUI() ? SUI().pass(c, HLP) : LUI() ? (ph && (sub.life === 'fame' || sub.life === 'legacy') ? LUI().render(c, 'fame', HLP) + LUI().render(c, 'legacy', HLP) : LUI().render(c, sub.life, HLP)) : '';
    else if (sub.honors === 'stats' && SUI()) h = SUI().stats(c, HLP);
    else if (ph && (sub.honors === 'titles' || sub.honors === 'seasons')) {   // móvil: Vitrina = palmarés y, debajo, las temporadas
      var hs0 = sub.honors; sub.honors = 'titles'; h = renderHonors(c); sub.honors = 'seasons'; h += renderHonors(c); sub.honors = hs0;
    } else h = renderHonors(c);
    body.innerHTML = h;
    body.setAttribute('data-cv', tab + '-' + (subsOf(tab) ? sub[tab] : ''));   // (móvil: qué pantalla es, para el CSS)
  }
  /** Barra de pestañas con el componente común (VB.UI.tabs). which = 'tab' (primer nivel: apartados del hub, u ofertas al elegir
   *  club) | 'sub' (sub-pestañas). items = [[id, texto ya escapado, punto?]]. Cada barra se crea una vez y luego se repinta con
   *  refresh (la pestaña elegida la manda career-ui: api.cur). Sin VB.UI.tabs (pruebas sin ui.js): botones sueltos (tabsBar). */
  function drawBar(which, items, sel) {
    var host = which === 'sub' ? subEl : tabsEl;
    if (!(VB.UI && VB.UI.tabs)) { host.innerHTML = tabsBar(items, sel, which === 'sub' || pickView() ? 'sub' : 'tab'); fitBar(host); return; }
    var list = items.map(function (t) { return { id: String(t[0]), label: t[1] + (t[2] ? ' <i class="dot" aria-hidden="true"></i>' : ''), icon: t[3] || '', badge: t[4] || '' }; });
    var api = which === 'sub' ? subApi : tabsApi;
    if (!api) {
      api = VB.UI.tabs(host, list, { value: String(sel), label: which === 'sub' ? 'Apartados' : 'Secciones de la Carrera', wrap: true, sound: false,
        onChange: function (id, dir, how) { snd('click'); if (which === 'tab' && !pickView()) setTab(id); else phSub(id); } });
      if (which === 'sub') subApi = api; else tabsApi = api;
    } else { api.cur = String(sel); api.refresh(list); }
    fitBar(host);
  }
  /** Sub-pestaña elegida en la tira. Móvil, «Vida»: «h:titles» / «h:opts» son de Palmarés y el resto de Fama (cambia de apartado). */
  function phSub(id) {
    if (PH() && !pickView() && (tab === 'life' || tab === 'honors')) {
      if (String(id).indexOf('h:') === 0) { setTab('honors', String(id).slice(2)); return; }
      if (tab === 'honors') { setTab('life', id); return; }
    }
    setSub(id);
  }
  /** Marca la barra con ovf si sus pestañas no caben (para el desvanecido de los bordes). */
  function fitBar(host) { var row = host && (host.querySelector('.tb-row') || host); if (!row) return; host.classList.toggle('ovf', row.scrollWidth > row.clientWidth + 2); if (row !== host && VB.Splat && VB.Splat.more) VB.Splat.more(row); }
  function pickView() { var c = C() && C().get(); return !!(c && c.phase === 'pick' && view !== 'create'); }
  /** Barra visible del nivel pedido ('sub' cae al primer nivel si no hay sub-pestañas), o null. */
  function barApi(which) {
    if (which === 'sub' && subApi && !subEl.hidden) return subApi;
    return tabsApi && !tabsEl.hidden ? tabsApi : null;
  }
  /** Barra de pestañas sin ui.js: items = [[id, texto, punto?]], attr = 'tab' (apartados) | 'sub' (sub-pestañas). */
  function tabsBar(items, sel, attr) {
    return items.map(function (t) {
      return '<button role="tab" data-' + attr + '="' + t[0] + '" aria-selected="' + (String(sel) === String(t[0])) + '">' + t[1] + (t[2] ? '<i class="dot" aria-hidden="true"></i>' : '') + '</button>';
    }).join('');
  }
  function stars(n) { var s = ''; for (var i = 0; i < 5; i++) s += i < n ? '★' : '<span class="off">★</span>'; return '<span class="stars" aria-label="Prestigio ' + n + ' de 5">' + s + '</span>'; }
  function eur(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function money(v) { return eur(v) + ' al mes'; }
  function fact(label, val) { return '<div><small>' + esc(label) + '</small><b>' + val + '</b></div>'; }
  /** Pista (titularidad): «De inicio | 40 de 52 puntos en pista | Te cambiaron en el 2º set» / «Entraste en el 2º set | …» / «No llegaste a entrar». */
  function partLine6(pt) {
    if (pt.status === 'out') return '';
    if (pt.status === 'sub' && !pt.entered) return 'No llegaste a entrar';
    var pts = pt.meR + ' de ' + pt.rallies + ' puntos en pista';
    return sp([pt.status === 'start' ? 'De inicio' : 'Entraste en el ' + ordn(pt.entered) + ' set', pts, pt.pulled ? 'Te cambiaron en el ' + ordn(pt.pulled) + ' set' : ''], 'v');
  }
  function lastCard(c) {
    var s = c.last; if (!s) return '';
    var rv = C().club(c, s.rival), sc = s.setScores.map(function (x) { return x[0] + '-' + x[1]; }).join(', ');
    var pt = s.part, ptLine = pt ? partLine6(pt) : '';
    if (s.bench && pt && pt.status !== 'out') {   // pista: en el banquillo sin entrar (o entrando muy poco): sin nota, algo de experiencia
      return '<div class="card' + (freshLast ? ' new' : '') + '"><h3>' + sp(esc(s.label).split(' · '), 'v') + ' <span class="tag r">Banquillo</span>' + (s.sim ? ' <span class="tag">Simulado</span>' : '') + '</h3>' +
        '<p style="font:800 20px var(--display);text-transform:uppercase;letter-spacing:.04em;margin:0"><span class="' + (s.win ? 'w' : 'l') + '">' + (s.win ? 'Victoria' : 'Derrota') + ' ' + s.sets[0] + '-' + s.sets[1] + '</span> contra ' + esc(rv ? rv.name : s.rivalName) + '</p>' +
        '<p class="muted">' + sc + '</p><p>' + ptLine + '. Sin calificar: menos de ' + ((C().hall && C().hall.NOTA_MIN_SUB) || 5) + ' puntos en pista.</p>' +
        '<p><span class="tag y">+' + (s.xp | 0) + ' XP</span></p>' +
        (s.train && s.train.gains && s.train.gains.length ? '<p>' + s.train.gains.map(function (k) { var LB = VB.Prog && VB.Prog.LABEL || {}; return '<span class="tag g">Entreno: +1 ' + esc(LB[k] || k) + '</span>'; }).join('') + '</p>' : '') + '</div>';
    }
    if (s.bench) {   // jornada en el banquillo: sin nota ni experiencia
      return '<div class="card' + (freshLast ? ' new' : '') + '"><h3>' + sp(esc(s.label).split(' · '), 'v') + ' <span class="tag r">' + (pt ? 'Fuera' : 'Banquillo') + '</span></h3>' +
        '<p style="font:800 20px var(--display);text-transform:uppercase;letter-spacing:.04em;margin:0"><span class="' + (s.win ? 'w' : 'l') + '">' + (s.win ? 'Victoria' : 'Derrota') + ' ' + s.sets[0] + '-' + s.sets[1] + '</span> contra ' + esc(rv ? rv.name : s.rivalName) + '</p>' +
        '<p class="muted">' + sc + '</p><p>' + (pt ? 'Fuera de la convocatoria. ' + esc(s.why || '') + ' Sin nota ni experiencia, pero descansas, entrenas y cobras.</p>' : '') + (pt ? '' : (c.mate ? 'Jugaron ' + esc(c.mate.name.split(' ')[0]) + (s.sub ? ' y ' + esc(s.sub) : '') : 'Jugó tu equipo con otro ' + esc(String(c.player.role).toLowerCase()) + ' de la plantilla') + '. Tú, al banquillo: sin nota ni experiencia, pero descansas, entrenas y cobras.</p>') +
        (s.train && s.train.gains && s.train.gains.length ? '<p>' + s.train.gains.map(function (k) { var LB = VB.Prog && VB.Prog.LABEL || {}; return '<span class="tag g">Entreno: +1 ' + esc(LB[k] || k) + '</span>'; }).join('') + '</p>' : '') + '</div>';
    }
    var h = '<div class="card' + (freshLast ? ' new' : '') + '"><h3>' + sp(esc(s.label).split(' · '), 'v') + (s.sim ? ' <span class="tag">Simulado</span>' : '') + '</h3><div class="row">' +
      '<div class="nota ' + notaCls(s.nota) + '" aria-label="Nota ' + dec(s.nota) + '"><span>' + dec(s.nota) + '<small>NOTA</small></span></div>' +
      '<div class="grow"><p style="font:800 20px var(--display);text-transform:uppercase;letter-spacing:.04em;margin:0"><span class="' + (s.win ? 'w' : 'l') + '">' + (s.win ? 'Victoria' : 'Derrota') + ' ' + s.sets[0] + '-' + s.sets[1] + '</span> contra ' + esc(rv ? rv.name : s.rivalName) + '</p>' +
      '<p class="muted">' + sc + '</p>' + (ptLine ? '<p class="muted">' + ptLine + '</p>' : '') +
      '<p>' + plural(s.me.kills + s.me.aces + s.me.blocks, 'punto', 'puntos') + ' (' + s.me.kills + ' de ataque, ' + s.me.blocks + ' de bloqueo, ' + plural(s.me.aces, 'ace', 'aces') + ')' + SV +
      sp([plural(s.me.assists, 'asistencia', 'asistencias'), plural(s.me.errors, 'error', 'errores')], 'v') + '</p></div></div>' +
      '<p><span class="tag y">+' + s.xp + ' XP</span>' + (s.lvlUp ? '<span class="tag g">¡Nivel ' + s.lvl + '! +' + s.ptsGained + ' puntos de mejora</span>' : '') + '</p>';
    if (s.badges && s.badges.length && VB.Badges) h += '<p>' + s.badges.map(function (u) { return '<span class="tag y">' + esc(VB.Badges.label(u)) + '</span>'; }).join('') + '</p>';
    if (LUI()) h += LUI().lastExtra(c, s, HLP);   // reto, seguidores, dinero, duelo y logros
    if (s.scout != null && C().club(c, s.scout)) {   // pista: un ojeador de un club de una liga mejor ha venido a verte
      var sk = C().club(c, s.scout), sl = C().league(sk.lid);
      h += '<p><span class="tag g">Ojeador</span> ' + esc(sk.name) + SV + esc(sl ? sl.name + ', ' + sl.country : '') + '</p>';
    }
    if (s.train && s.train.gains && s.train.gains.length) {   // mejoras gratis del entrenamiento de la semana
      var LB = VB.Prog && VB.Prog.LABEL || {};
      h += '<p>' + s.train.gains.map(function (k) { return '<span class="tag g">Entreno: +1 ' + esc(LB[k] || k) + '</span>'; }).join('') + '</p>';
    }
    if (s.round && s.round.length > 1) {
      h += '<p class="muted" style="margin-top:8px">Resto de la jornada: ' + sp(s.round.filter(function (m) { return m.a !== c.myClub && m.b !== c.myClub; }).map(function (m) {
        var a = C().club(c, m.a), b = C().club(c, m.b); return esc(a.short) + ' ' + m.s[0] + '-' + m.s[1] + ' ' + esc(b.short);
      }), 'v') + '</p>';
    }
    return h + '</div>';
  }
  // ------------------------------------------------------------------ sesiones de entrenamiento (13-nov-2026)
  // Bloque «Plan del entrenador» de la pestaña Partido (playa y pista; P6, 15-nov-2026, al estilo de EA FC / NBA 2K): el enfoque de la
  // semana (c.train, 5 botones con el «Recomendado» del entrenador) guía el plan de las 3 sesiones de la jornada; cada casilla trae el
  // ejercicio del plan (se cambia con «Cambiar»), tu récord jugando en letra y lo que daría el Rápido. Cada sesión: Jugar (el ejercicio
  // de verdad: VB.ctx.actions.startCareerDrill), Rápido (récord sin llegar al oro; sin récord, una D) o Descansar (−8 de fatiga).
  // Debajo: fatiga, impresión (o la pelea por el puesto en la pista), «Simular jornada» y «Entreno automático». Lógica en career.js
  // (trainInfo / trainSession / trainSimDay / setTrainAuto).
  var MEDAL_TXT = ['Sin medalla', 'Bronce', 'Plata', 'Oro'], trainNote = '', trainFocus = false;
  // cambios del plan hechos a mano en esta jornada: { k: clave de la jornada, s: { casilla: id | 'rest' } } (solo en memoria)
  var planOv = { k: '', s: {} };
  function labU(k) { var LB = VB.Prog && VB.Prog.LABEL; return (LB && LB[k]) || k; }
  function trainDots(inf) {
    var h = '<span class="tr-dots" role="img" aria-label="' + plural(inf.left, 'sesión', 'sesiones') + ' de ' + inf.max + ' antes del partido">';
    for (var i = 0; i < inf.max; i++) h += '<i class="' + (i < inf.left ? 'on' : '') + '"></i>';
    return h + '</span>';
  }
  /** Letra de nota (A+ … F) en su color; '' o null → «—». sm = la pequeña. */
  function grTag(L, sm, label) {
    var k = !L ? 'n' : L === 'A+' ? 'ap' : String(L).toLowerCase();
    return '<span class="gr gr-' + esc(k) + (sm ? ' sm' : '') + '"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>' + esc(L || '—') + '</span>';
  }
  /** Pista: tu sitio en la pelea por el puesto (gap de lineup6, con lo que suman los entrenos). */
  function trainFight6(c) {
    var H6 = C().hall || {}, L = H6.lineup ? H6.lineup(c) : null; if (!L) return '';
    var rv = L.rival && c.sq6 ? c.sq6.list.filter(function (x) { return x.id === L.rival; })[0] : null, nm = rv ? esc(rv.name) : '', g = Math.abs(L.gap), imp = L.imp || 0;
    var t = L.stat === 'start' ? (rv ? 'Sales de inicio: le sacas ' + num1(g) + ' puntos de valoración a ' + nm + ', tu suplente' : 'Sales de inicio')
      : L.stat === 'out' ? 'Fuera de la convocatoria' + (rv ? ': a ' + num1(g) + ' puntos de valoración de ' + nm : '')
        : rv ? 'Empiezas en el banquillo: a ' + num1(g) + ' puntos de valoración de ' + nm : 'Empiezas en el banquillo';
    return '<p class="tr-fight"><b>Pelea por el puesto.</b> ' + sp([t, imp >= 0.05 ? 'los entrenos te suman +' + num1(imp) : 'aún no te has hecho notar en los entrenos', 'tu media vale +' + (L.edge != null ? L.edge : 12) + ' en la elección'].concat(L.last ? ['tu nota del último partido (' + num1(L.lastNota) + ') ' + (L.last > 0 ? 'te suma +' + num1(L.last) : 'te resta ' + num1(-L.last))] : []), 'v') + '</p>';
  }
  /** Clave de la jornada para los cambios del plan (si cambia, se olvidan): la de las sesiones (inf.wk), que no cambia al hacer la
   *  1ª sesión (antes, c.ts.wk pasaba de null a la jornada y los cambios se perdían al jugar la 1ª). */
  function planKey(inf) { return (inf.mode || 'beach') + '|' + inf.wk; }
  /** Plan de la jornada con los cambios a mano: 3 ids ('rest' = descansar). Solo cambia las casillas aún por hacer. (c no se usa:
   *  todo sale de inf, también desde main.js con nextPlanned) */
  function planOf(c, inf) {
    if (planOv.k !== planKey(inf)) planOv = { k: planKey(inf), s: {} };
    var p = (inf.plan || []).slice(), ok = function (id) { return id === 'rest' || inf.drills.some(function (d) { return d.id === id; }); };
    for (var i = inf.used; i < inf.max; i++) { var o = planOv.s[i]; if (o && ok(o)) p[i] = o; if (!p[i]) p[i] = p[0] || 'rest'; }
    return p;
  }
  /** ¿Hay cambios a mano en lo que queda de jornada? (si no, «Simular jornada» es VB.Career.trainSimDay tal cual) */
  function planTouched(c, inf) { var p = planOf(c, inf), q = inf.plan || []; for (var i = inf.used; i < inf.max; i++) if (p[i] !== q[i]) return true; return false; }
  function drillName(id) { return id === 'rest' ? 'Descanso' : ((C().SESS_DRILL && C().SESS_DRILL[id] || {}).short || id); }
  /** Una casilla del plan: hecha (con su nota), la de ahora (Jugar, Rápido, Descansar) o una de después (solo «Cambiar»). */
  function planSlot(c, inf, plan, s) {
    var head = '<span>Sesión ' + (s + 1) + '</span>', h;
    if (s < inf.used) {   // ya hecha: lo que diste (de la bandeja de la jornada; un guardado viejo no la tiene)
      var lg = inf.log && inf.log[s];
      if (!lg) return '<div class="pl-s done" role="listitem"><div class="pl-k">' + head + '<span class="tag">Hecha</span></div></div>';
      if (lg.how === 'rest') return '<div class="pl-s done" role="listitem"><div class="pl-k">' + head + '<span class="tag">Descanso</span></div><div class="pl-n">' + grTag('', false) +
        '<span><b>Descanso</b><small>Fatiga −' + (inf.rest || 8) + '</small></span></div></div>';
      return '<div class="pl-s done" role="listitem"><div class="pl-k">' + head + '<span class="tag">' + (lg.how === 'quick' ? 'Rápido' : 'Jugado') + '</span></div><div class="pl-n">' +
        grTag(lg.grade, false, 'Nota ' + lg.grade) + '<span><b>' + esc(drillName(lg.id)) + '</b><small>' + (lg.up ? '+1 en ' + esc(labU(lg.attr)) : '+' + (lg.gain | 0) + ' de progreso en ' + esc(lab(lg.attr))) + '</small></span></div></div>';
    }
    var id = plan[s], cur = s === inf.used, d = id === 'rest' ? null : inf.drills.filter(function (x) { return x.id === id; })[0];
    var ch = '<button data-act="tr-swap" data-s="' + s + '" aria-label="Cambiar el ejercicio de la sesión ' + (s + 1) + '">Cambiar</button>';
    h = '<div class="pl-s' + (cur ? ' cur' : '') + '" role="listitem"><div class="pl-k">' + head + (cur ? '<span class="tag y">Ahora</span>' : '') + '</div>';
    if (!d) h += '<div class="pl-n">' + grTag('', false) + '<span><b>Descanso</b><small>Fatiga −' + (inf.rest || 8) + ', sin subir atributos</small></span></div>';
    else h += '<div class="pl-n">' + grTag(d.bestGrade, false, d.bestGrade ? 'Tu récord: ' + d.bestGrade : 'Sin récord') + '<span><b>' + esc(d.short) + '</b><small>' +
      sp([esc(labU(d.attr)) + ' ' + d.v, 'Rápido = ' + esc(d.quickGrade) + (d.best != null ? '' : ' (sin récord)')], 'v') + '</small></span></div>' +
      (d.first ? '<p class="muted" style="margin:0">Primera vez jugándolo: <b>+50 %</b></p>' : '');
    if (cur) {
      var dis = inf.can ? '' : ' disabled', rd = inf.canRest ? '' : ' disabled';
      if (d) h += '<div class="pl-b"><button class="pri" data-act="tr-play" data-d="' + d.id + '"' + dis + ' aria-label="Jugar el ejercicio de ' + esc(d.short.toLowerCase()) + '">Jugar</button>' +
        '<button data-act="tr-quick" data-d="' + d.id + '"' + dis + ' aria-label="Entrenar rápido: ' + esc(d.short.toLowerCase()) + ', nota ' + esc(d.quickGrade) + '">Rápido</button>' +
        '<button data-act="tr-rest"' + rd + '>Descansar</button></div><div class="pl-b one">' + ch + '</div>';
      else h += '<div class="pl-b"><button class="pri" data-act="tr-rest"' + rd + ' style="grid-column:span 2">Descansar</button>' + ch + '</div>';
    } else h += '<div class="pl-b one">' + ch + '</div>';
    return h + '</div>';
  }
  function trainCard(c) {
    var K = C(); if (!K.trainInfo) return '';
    var inf = K.trainInfo(c); if (!inf || inf.why === 'none') return '';
    var T = K.TRAIN, plan = planOf(c, inf), f = inf.fat | 0, fc = f > 60 ? '#d8364a' : f > (K.FAT_FREE || 40) ? '#e07b2b' : '#2fbf71';
    var head = '<h3>' + sp(['Plan del entrenador', { h: trainDots(inf) + ' <span class="tr-left">' + inf.left + ' de ' + inf.max + '</span>' }], 'd') + '</h3>';
    var why = inf.why === 'done' ? 'Ya has hecho las ' + inf.max + ' sesiones de esta jornada: vuelven tras el partido.'
      : inf.why === 'fatiga' ? 'Con fatiga de ' + inf.fatMax + ' o más el preparador físico no te deja entrenar: descansa (botón Descansar, enfoque Descanso o fisio).' : '';
    var h = '<div class="card cr-train" id="crTrain">' + head +
      // enfoque de la semana = plan del entrenador (también guía el entreno semanal de fondo, trainWeek)
      '<div class="pl-focus" role="group" aria-label="Enfoque de la semana">' + (K.TRAIN_KEYS || Object.keys(T)).map(function (k) {
        return '<button data-act="train" data-t="' + k + '" aria-pressed="' + (c.train === k) + '"' + (inf.rec === k ? ' aria-label="' + esc(T[k].name) + ', recomendado"' : '') + '>' + esc(T[k].name) + (inf.rec === k ? '<small>Recomendado</small>' : '') + '</button>';
      }).join('') + '</div>' +
      '<p class="muted">' + esc(T[c.train] ? T[c.train].hint : '') + '. ' + (c.train === 'atk' || c.train === 'def' ? 'Los ejercicios de ' + esc(GROUP_OF[c.train]).toLowerCase() + ' rinden un 20 % más. ' : '') +
      'Jugar rinde más que el Rápido, que nunca pasa de tu récord ni llega al oro. Cada sesión cansa (+' + K.SESS_FAT.join(', +') + ').' + (inf.fatK < 1 ? ' Con tu fatiga (' + inf.fat + ') rindes menos.' : '') + '</p>';
    h += '<div class="pl-slots" role="list">';
    for (var s = 0; s < inf.max; s++) h += planSlot(c, inf, plan, s);
    h += '</div>';
    if (why) h += '<p class="tr-why">' + esc(why) + '</p>';
    h += '<div class="pl-foot"><span>' + sp(['Fatiga ' + f + ' de 100', f >= inf.fatMax ? 'solo puedes descansar' : 'con ' + inf.fatMax + ' ya no se entrena'], 'v') + '</span><span></span>' + meter(Math.min(100, f), 'Fatiga', fc) + '</div>';
    if (isHall(c)) h += trainFight6(c);
    else h += '<p class="muted">' + sp(['Impresión en los entrenos ' + Math.round(inf.imp) + ' de 100', 'confianza del entrenador ' + (c.coach | 0)], 'v') + '</p>';
    var canDay = inf.left > 0 && (inf.can || (inf.canRest && plan.slice(inf.used).every(function (x) { return x === 'rest'; })));
    h += '<div class="pl-acts"><button data-act="tr-simday"' + (canDay ? '' : ' disabled') + '>Simular jornada <small style="font:600 12px var(--ui);text-transform:none;letter-spacing:0">(' + (inf.left > 0 ? plural(inf.left, 'sesión', 'sesiones') + ' del plan' : 'sin sesiones') + ')</small></button>' +
      '<button data-act="tr-auto" aria-pressed="' + !!inf.auto + '">Entreno automático</button></div>' +
      '<p class="muted">Con el entreno automático, si no entrenas, el cuerpo técnico hace tus sesiones libres en Rápido al cerrar la jornada, sin pasar de fatiga ' + (inf.autoFat || 40) + '.</p>';
    h += '<p class="note" role="status" aria-live="polite">' + esc(trainNote) + '</p></div>';
    trainNote = '';
    return h;
  }
  /** «Jugar» el ejercicio: cierra el hub y main.js lo arranca con tu jugador (al acabar vuelve aquí con el resultado). */
  function trainPlay(id) {
    var go = function () { if (VB.ctx && VB.ctx.actions && VB.ctx.actions.startCareerDrill) VB.ctx.actions.startCareerDrill(id); };
    close(true);
    var w = false; try { w = !!(VB.UI && VB.UI.wipe && VB.UI.wipe(2, go)); } catch (e) { w = false; }
    if (!w) go();
  }
  function trainResText(r) {
    if (!r || !r.ok) return r && r.why === 'done' ? 'Ya no quedan sesiones esta jornada.' : r && r.why === 'fatiga' ? 'Demasiada fatiga para entrenar: descansa.' : '';
    if (r.how === 'rest') return 'Descansas: fatiga ' + r.fat0 + ' → ' + r.fat + '.';
    return drillName(r.id) + ': ' + r.total + ' puntos, nota ' + r.grade + ' (' + MEDAL_TXT[r.medal | 0].toLowerCase() + '). ' + (r.up ? '¡+1 en ' + lab(r.attr) + '!' : '+' + r.gain + ' de progreso en ' + lab(r.attr) + '.') +
      (r.first ? ' ¡Primera vez! +50 %.' : '') + (r.how === 'play' && r.bestGrade0 && r.bestGrade !== r.bestGrade0 ? ' Récord: ' + r.bestGrade0 + ' → ' + r.bestGrade + '.' : '') +
      (r.stat && r.stat0 && r.stat !== r.stat0 ? (r.stat === 'start' ? ' Te has ganado el sitio en los entrenos: sales de inicio.' : '') : '');
  }
  /** «Simular jornada»: las sesiones que quedan en Rápido (o descansando, si el plan lo dice). Sin cambios a mano, trainSimDay; con
   *  ellos, sesión a sesión con el plan que se ve. Devuelve el texto del resumen. */
  function trainSimDay(c) {
    var K = C(), inf = K.trainInfo(c); if (!inf) return '';
    var done = [], ups = [], fat0 = inf.fat, why = '';
    if (!planTouched(c, inf) && K.trainSimDay) {
      var r = K.trainSimDay(); if (!r) return '';
      done = r.done || []; ups = r.ups || []; why = r.why || '';
    } else {
      var plan = planOf(c, inf);
      for (var s = inf.used; s < inf.max; s++) {
        var id = plan[s], q = id === 'rest' ? K.trainSession(null, 'rest') : K.trainSession(id, 'quick');
        if (!q || !q.ok) { why = q ? q.why : ''; break; }
        done.push(q); if (q.up) ups.push(q.up);
      }
    }
    if (!done.length) return why === 'fatiga' ? 'Demasiada fatiga para entrenar: descansa.' : 'No quedan sesiones esta jornada.';
    var c2 = K.get(), fat = c2 ? c2.fatigue | 0 : fat0;
    return 'Jornada simulada: ' + done.map(function (x) { return x.how === 'rest' ? 'descanso' : drillName(x.id).toLowerCase() + ' ' + x.grade; }).join(', ') + '. ' +
      (ups.length ? '¡+1 en ' + ups.map(function (k) { return lab(k); }).join(', ') + '! ' : '') + 'Fatiga ' + fat0 + ' → ' + fat + '.';
  }

  // ---- «Carrera con vida» en Partido (career-story-ui.js; sin él, lo de siempre)
  /** Columna de avisos: chips (hasta 4), «Tu semana» y el chip del plan del entrenador. '' sin career-story. */
  function storySide(c) {
    var U = SUI(); if (!U) return '';
    var inf = trainInf(c);
    return '<div class="st-side">' + U.chipsHTML(c, HLP) + U.weekCard(c, HLP) + (inf ? U.planChip(c, inf, U.planOpen(c, inf, trainFocus)) : '') + '</div>';
  }
  function trainInf(c) { var K = C(); if (!K.trainInfo) return null; var inf = K.trainInfo(c); return inf && inf.why !== 'none' ? inf : null; }
  /** Plan del entrenador: plegado si career-story lo dice (lo elegido en la jornada; desplegado con sesiones pendientes y sin
   *  entreno automático, y siempre al volver de un ejercicio o con «Ir al plan del entrenador»). */
  function storyTrain(c) {
    var U = SUI(), inf = U ? trainInf(c) : null;
    return inf && !U.planOpen(c, inf, trainFocus) ? '' : trainCard(c);
  }
  /** Último partido y titulares: con career-story, tras una fila plegable con el resultado. */
  function storyLast(c) {
    var lc = lastCard(c), hl = WUI() && WUI().headlines ? WUI().headlines(c, HLP) : '', s = c.last;
    if (!SUI() || !s || !lc || !Array.isArray(s.sets)) return lc + hl;
    var op = SUI().lastOpen(c, freshLast), rv = C().club(c, s.rival);
    return '<button class="st-fbtn" data-act="st-fold-last" data-v="' + (op ? 1 : 0) + '" aria-expanded="' + op + '">' + 'Último partido: <b>' + (s.win ? 'Victoria' : 'Derrota') + ' ' + s.sets[0] + '-' + s.sets[1] + '</b> contra ' +
      esc(rv ? rv.name : s.rivalName) + (hl && !op ? ' y titulares' : '') + '<i aria-hidden="true">' + (op ? '▴' : '▾') + '</i></button>' + (op ? lc + hl : '');
  }
  /** SPLAT: entrada del próximo partido (brochazo turquesa .sp-ticket, no se pulsa: «Jugar partido» va debajo) con tu escudo y el
   *  del rival en pegatinas redondas. kick y title ya escapados; lines = líneas pequeñas (HTML); aria = texto plano. */
  function ticketHTML(c, me, rv, kick, title, lines, aria, tag) {
    // career-story (P3): sello del partido (Derbi, Revancha, Televisado…) en una esquina, sin que el ticket crezca
    return '<div class="sp-ticket cr-tk' + (tag ? ' st-tagged' : '') + '" role="group" aria-label="' + esc('Próximo partido: ' + aria + (tag ? ', ' + tag : '')) + '">' + (tag ? '<i class="sp-chip st-tk-tag" aria-hidden="true">' + esc(tag) + '</i>' : '') + '<span class="sp-tk"><span class="sp-tk-stub"><span class="sp-crest">' + crest(me, 40, c) + '</span><i class="sp-vs">vs</i>' +
      '<span class="sp-crest">' + crest(rv, 40, c) + '</span></span><span class="sp-tk-main"><small class="sp-k">' + kick + '</small><b class="sp-t">' + title + '</b>' +
      lines.map(function (l) { return l ? '<small class="sp-s">' + l + '</small>' : ''; }).join('') + '</span></span></div>';
  }
  function renderMatch(c) {
    // Faro (career-world-ui.js): la escena va arriba del todo, también en el resumen de fin de temporada (ascenso, título…)
    var mc = WUI() && WUI().mentorCard ? WUI().mentorCard(c, HLP) : '', h = takeTrialRes(c) + mc;   // (prueba superada: su resultado, arriba)
    if (c.phase === 'off') return h + renderSeasonEnd(c) + (WUI() && WUI().headlines ? WUI().headlines(c, HLP) : '');
    var n = C().next(c);
    if (n) {
      // posiciones solo con la liga empezada (en la jornada 1 la tabla vacía daba «6º» contra «3r»)
      var pm = C().posOf(c, n.me.id), pr = C().posOf(c, n.rival.id), lg = c.phase === 'league' && c.week > 0;
      var bf = null; try { bf = LIFE() && LIFE().bossFor ? LIFE().bossFor(c, n.rival.id) : null; } catch (e) { bf = null; }   // S3 C3: el jefe del circuito juega en su club
      // SPLAT: entrada en brochazo turquesa (los dos escudos en pegatina), el parche «Jugar partido» y, en una hoja, los detalles
      var kick = sp(esc(n.label).split(' · ').concat(['Sets a ' + C().PTS]), 'v') + (bf ? ' <span class="sp-chip sp-danger">Jefe</span>' : '');
      var side = storySide(c);   // career-story: avisos, «Tu semana» y el plan plegado (en .cr-two: dos columnas en el móvil apaisado)
      var mIn = side && mc && PH(); if (mIn) h = h.slice(0, h.length - mc.length);   // (móvil con avisos: Faro justo bajo el ticket, dentro de .cr-two; detrás de los avisos y los detalles no se veía)
      h += (side ? '<div class="cr-two">' : '') + '<div class="cr-next">' + ticketHTML(c, n.me, n.rival, kick, (n.atHome ? 'vs ' : 'en ') + esc(PH() ? shortClub(n.rival) : n.rival.name),
        [sp([lg ? ordn(pr) : '', 'Pareja ' + n.ovrRival, 'IA ' + esc(n.diffName || diffName(n.diff))], 'v'), sp(['Tú: ' + esc(n.me.short || n.me.name), lg ? ordn(pm) : '', 'Pareja ' + n.ovrMe, n.atHome ? 'En casa' : 'Fuera'], 'v')],
        n.label.split(' · ').join(', ') + ', ' + (n.atHome ? 'contra ' : 'en casa de ') + n.rival.name, SUI() ? SUI().tagFor(c, n) : '') +
        (n.bench
          // el entrenador te sienta (rol de rotación con poca confianza, o titular con el entrenador descontento): sin partido
          ? '<div class="bench"><p><b>Esta jornada no juegas.</b> ' + esc(C().benchWhy ? C().benchWhy(c) : '') + ' La juega ' + esc(c.mate.name) + ' con uno de la plantilla; tú descansas (fatiga −' + C().BENCH_REST + '), entrenas y cobras.</p></div>' +
            '<div class="acts cr-go"><button class="pri" data-act="bench">Ver la jornada</button></div>'
          : '<div class="acts cr-go"><button class="pri" data-act="play">Jugar partido</button><button data-act="sim">Simular <small style="font:600 12px var(--ui);text-transform:none;letter-spacing:0">(mitad de XP)</small></button></div>') +
        (side ? '</div>' + (mIn ? mc : '') + side + '<div class="cr-nd-w">' : '') + '<div class="card cr-nd">' +
        // (la pareja, en pastillas: antes era una lista metida en un paréntesis)
        '<p class="muted">' + (function () {
          var mo = C().mateOvr(c), dd = mo - C().clubOvr(n.me), tg = dd >= 3 ? 'g' : dd <= -3 ? 'r' : '';
          return sp(['Compañero: ' + esc(c.mate.name), esc(c.mate.role), 'Media ' + mo, { h: esc(vsClub(dd)), c: tg ? 'dv ' + tg : 'dv' }, 'Forma: ' + esc(C().formText(c.mate.form | 0)).toLowerCase()], 'c');
        })() + '</p>' +
        '<p class="muted">' + sp(['Entreno: ' + esc(C().TRAIN[c.train].name), 'Fatiga ' + (c.fatigue | 0) + (C().fatigueMalus(c) ? ' (−' + C().fatigueMalus(c) + ' en tus atributos)' : ''),
          esc(chemTxt(c, c.mate.chem, C().chemBonus(c)))], 'v') + '</p>' +
        (CD() ? '<p class="muted">Dificultad: <b>' + esc(dName(dkey(c))) + '</b><button class="lnk" data-tab="honors" data-s="opts" aria-label="Cambiar la dificultad">Cambiar</button></p>' : '') +
        '</div></div>' + (side ? '</div>' : '');
    } else h += storySide(c);
    h += storyTrain(c);   // sesiones de entrenamiento antes del partido (con career-story, plegables: chip «Plan» de los avisos)
    if (LUI()) h += LUI().matchCards(c, HLP);   // reto de la jornada y decisión pendiente
    var lastUn = (c.inbox || []).filter(function (m) { return !m.r; }).slice(-1)[0];
    if (lastUn) h += '<div class="card"><h3>Mensajes <span class="muted">(' + plural(C().unread(c), 'sin leer', 'sin leer') + ')</span></h3>' + msgHTML(lastUn) + '<div class="acts"><button data-tab="inbox">Ver mensajes</button></div></div>';
    if (c.window === 'mid' && c.offers && c.offers.length) h += '<div class="card new"><h3>Ventana de fichajes</h3><p>' + plural(c.offers.length, 'club quiere', 'clubes quieren') + ' ficharte ya. Las ofertas caducan al jugar o simular el siguiente partido.</p><div class="acts"><button data-tab="club" data-s="offers">Ver ofertas</button></div></div>';
    h += storyLast(c);   // último partido y «Titulares» de la liga (solo con noticias sin ver); con career-story, plegables
    if (!c.last) h += '<div class="card"><h3>Objetivo del club</h3><p>' + esc(c.objective.text) + '</p><p class="muted">El entrenador valora tus notas y los resultados. Al final de la temporada llegan ofertas de clubes mejores si juegas bien.</p></div>';
    freshLast = false;
    return h;
  }
  function renderSeasonEnd(c) {
    var r = c.review || {}, k = C().myClub(c), hall = isHall(c), L = hall ? C().league(r.lid || k.lid) : C().league(r.lvl != null ? r.lvl : k.lvl);
    // pista: cada copa que has jugado, con hasta dónde llegaste (Campeón / Final / Semifinal / Cuartos)
    var cupTags = hall ? (r.cups || []).filter(function (x) { return x.mine; }).map(function (x) {
      return '<span class="tag ' + (x.champion === k.id ? 'y' : '') + '">' + esc(x.champion === k.id ? 'Campeón de la ' + x.name : x.name + ': ' + x.reach) + '</span>';
    }).join('') : '';
    var h = '<div class="card new cr-end"><h3>Fin de la temporada ' + r.season + '</h3>' +
      // SPLAT: el puesto final en un sello dorado (con «Campeón» en el aro si has ganado la liga)
      '<span class="sp-stamp cr-pos" aria-hidden="true" data-ring="' + (r.champion ? 'CAMPEÓN ★ CAMPEÓN ★ CAMPEÓN ★ ' : 'TEMPORADA ' + r.season + ' ★ TEMPORADA ' + r.season + ' ★ ') + '"><span class="sp-sc"><b>' + ordn(r.pos) + '</b></span></span>' +
      '<p class="bigname">' + ordn(r.pos) + ' ' + esc(deL(L)) + '</p>' + (hall ? '<p class="muted" style="margin:0">' + esc(L.country) + '</p>' : '') + '<p>' +
      (r.champion ? '<span class="tag y">Campeón ' + esc(deL(L)) + '</span>' : '') + (!hall && r.cup ? '<span class="tag y">Campeón del ' + esc(L.cup) + '</span>' : '') + cupTags +
      (r.move > 0 ? '<span class="tag g">Ascenso</span>' : r.move < 0 ? '<span class="tag r">Descenso</span>' : '') +
      '<span class="tag ' + (r.objOk ? 'g' : 'r') + '">Objetivo ' + (r.objOk ? 'cumplido' : 'no cumplido') + '</span></p>' +
      '<p class="muted">' + sp(['Objetivo: ' + esc(r.objective), 'Nota media ' + dec(r.nota), 'Entrenador: ' + esc(C().coachText(c.coach)), CD() ? 'Dificultad: ' + esc(dName(dkey(c, r.d || 'normal'))) + (r.dm ? ' (mixta)' : '') : ''], 'v') + '</p></div>';
    var rn = r.renew, ct = c.contract, nOf = (c.offers || []).length;
    // las ofertas viven en Club › Ofertas (en el móvil quedaban 1000 px más abajo, tras «Seguir en…»): aquí, un aviso arriba
    if (nOf) h += '<div class="card"><h3>Ofertas <span class="muted">(' + plural(nOf, 'club te quiere', 'clubes te quieren') + ')</span></h3><p class="muted">Míralas antes de decidir: si sigues en tu club, se pierden.</p>' +
      '<div class="acts"><button class="pri" data-tab="club" data-s="offers">Ver ofertas</button></div></div>';
    h += '<div class="card"><h3>' + (rn ? 'Tu club te ofrece renovar' : 'Tu club') + '</h3>' +
      (rn ? '<p>' + sp([esc(rn.role), money(rn.salary)], 'c') + '</p><p class="muted">Se te acaba el contrato. Si sigues, firmas por:</p>' + yearsSeg('renew', yrs.renew || rn.years)
        : '<p class="muted">' + (ct ? 'Te ' + (ct.left - 1 === 1 ? 'queda 1 temporada' : 'quedan ' + (ct.left - 1) + ' temporadas') + ' de contrato.' : '') + '</p>') +
      // con ofertas, «Seguir» pide confirmación (dos pulsaciones en 3 s): un toque despistado ya no las rechaza todas
      '<div class="acts"><button class="' + (stayArm && nOf ? 'warn' : nOf ? '' : 'pri') + '" data-act="stay">' + (stayArm && nOf ? (device() === 'touch' ? 'Toca otra vez: rechazas ' : 'Pulsa otra vez: rechazas ') + plural(nOf, 'oferta', 'ofertas')
        : (rn ? 'Renovar con ' : 'Seguir en ') + esc(PH() ? shortClub(k) : k.name) + (r.move ? (r.move > 0 ? ' (sube)' : ' (baja)') : '')) + '</button></div></div>';
    return h;
  }
  /** Selector de duración del contrato (1-3 temporadas). key = id del club o 'renew'. */
  function yearsSeg(key, v) {
    return '<div class="seg" role="group" aria-label="Duración del contrato">' + [1, 2, 3].map(function (y) {
      return '<button data-act="yrs" data-y="' + y + '" data-key="' + key + '" aria-pressed="' + (v === y) + '">' + plural(y, 'temporada', 'temporadas') + '</button>';
    }).join('') + '</div>';
  }
  /** Ficha de una oferta (inicio, mitad y fin de temporada): club, prestigio, liga, media, estilo, ciudad, compañero, objetivo, rol,
   *  sueldo y contrato. full = ficha grande (una por pestaña al elegir club). */
  /** Texto de la IA rival del circuito de la prueba (Circuito Nacional) en la dificultad de la carrera. */
  /** Texto de la IA de la prueba de la oferta o (17-nov-2026: un nivel por encima de tu dificultad, VB.Career.trialAIOf). */
  function trialAI(c, o) {
    try {
      var k = o && C().club(c, o.club); if (!k || !C().rivalAI) return '';
      var ai = C().rivalAI(c, k); if (C().trialAIOf) ai = C().trialAIOf(c, ai);
      return 'la IA juega en ' + esc(ai.name);
    } catch (e) { return ''; }
  }
  /** Nombre del club en la ficha de una oferta (móvil, ficha grande: el corto, en una línea). */
  function offName(k, full) {
    if (full && PH()) return '<p class="bigname cr-on" data-ph-ell title="' + esc(k.name) + '">' + esc(shortClub(k)) + '</p>';
    return '<p class="bigname"' + (full ? '' : ' style="font-size:18px"') + '>' + esc(k.name) + '</p>';
  }
  /** Móvil: las cuatro cifras del trato (rol, sueldo, media del club y objetivo; sin objetivo, los años) en una pegatina .sp-heros. */
  function offHeros(o, ovr, yrsN) {
    var it = function (v, l, n) { return '<div><span class="sp-hn' + (n ? ' n' : '') + '">' + v + '</span><span class="sp-hl">' + esc(l) + '</span></div>'; };
    return '<div class="sp-heros sp-sm cr-oh">' + it(esc(o.role), 'Rol') + (o.salary ? it(eur(o.salary).replace(' ', '&nbsp;'), 'Sueldo al mes', true) : '') + it(ovr != null ? ovr : '—', 'Media del club', true) +
      (o.objective ? it(esc(objShort(o.objective)), 'Objetivo') : it(yrsN, yrsN === 1 ? 'Temporada' : 'Temporadas', true)) + '</div>';
  }
  function offerCard(c, o, i, full) {
    if (isHall(c)) return offerCard6(c, o, i, full);
    var k = C().club(c, o.club), f = C().clubInfo(c, k, o.lvl != null ? o.lvl : k.lvl, o.q), mp = o.mateP, y = yrs[o.club] || o.years || 1;
    var h = '<div class="' + (full ? 'card offer-full' : 'offer-x') + '"' + (full ? '' : ' style="padding:8px 0;border-top:1px solid var(--sep)"') + '><div class="row">' + crest(k, full ? 56 : 40, c) +
      '<div class="grow" style="min-width:0">' + offName(k, full) + '<p class="muted" style="margin:2px 0 0">' +
      sp([stars(f.stars), esc(f.league), esc(f.beach || k.city)], 'v') + '</p></div></div>';
    var rl = Math.max(0, C().ROLE_LV.indexOf(o.role)), early = !o.trial && C().earlyExit && C().earlyExit(c), cov = o.ovr != null ? o.ovr : f.ovr, oh = full && PH();
    if (oh) h += offHeros(o, cov, o.trial ? 1 : y);
    h += '<div class="fact">' + (oh ? '' : fact('Media del club', cov)) + fact('Estilo', esc(f.style) + styleTrain(f.style)) +
      // el compañero que te dan al firmar, con su nivel respecto al club (un buen compañero es un argumento para fichar)
      fact('Compañero', mp ? esc(mp.name) + mateLine(mp, cov, false) : 'Media ~' + o.mate) +
      (o.objective && !oh ? fact('Objetivo', esc(o.objective)) : '') +
      fact('Rol prometido', esc(o.role) + (o.firm ? ' <span class="muted">(firme)</span>' : '') + ' <span class="muted">(entrenador: ' + Math.max(0, Math.min(100, (C().ROLE_COACH || [45, 55, 65])[rl] + (CD() && !isHall(c) ? CD()[dkey(c)].coach0 | 0 : 0) - (early ? C().EARLY_COACH : 0) - (o.negNo ? C().NEG_COACH : 0))) + ' de confianza)</span>') +
      (o.salary && !(oh && !(c.contract && c.contract.salary && c.phase !== 'pick')) ? fact('Sueldo (ficticio)', money(o.salary) + (c.contract && c.contract.salary && c.phase !== 'pick' ? ' <span class="muted">(ahora ' + eur(c.contract.salary) + ')</span>' : '')) : '') + '</div>';
    // lo que significa el rol prometido (ya no es solo texto: rotación = alguna jornada al banquillo; titular incumplido = te vas sin pegas)
    if (!o.trial && C().ROLE_HINT) h += '<p class="muted" style="margin:0 0 6px"><b>' + esc(o.role) + ':</b> ' + esc(C().ROLE_HINT[rl]) + '</p>';
    if (early) h += '<p class="muted"><b>Tienes contrato en vigor:</b> si fichas, el club de ahora pone pegas y el entrenador nuevo empieza con ' + C().EARLY_COACH + ' menos de confianza (no pasa si te declaras transferible en Club › Contrato).</p>';
    if (o.negNo) h += '<p class="muted">Negociación rechazada: si firmas, el entrenador empieza con ' + C().NEG_COACH + ' menos de confianza.</p>';
    if (o.trial) h += trialLine(c, o) + '<p class="muted">Si no la superas, pierdes esta oferta' + (c.phase === 'pick' ? ' y sigues con las demás' : '') + '. Contrato de 1 temporada. Rivales mejores que tú y ' + (trialAI(c, o) || 'la IA un nivel por encima') + '.</p>';
    else h += '<p class="muted" style="margin-top:6px">Duración del contrato:</p>' + yearsSeg(o.club, y);
    var canNeg = !o.trial && !o.firm && o.role !== 'Titular indiscutible';
    if (offArm === i && c.window === 'mid') {   // fichar a mitad de temporada: confirmación con lo que cambia
      var mk = C().myClub(c), nl = C().league(f.lvl);
      return h + '<div class="confirm" role="alertdialog" aria-label="Confirmar fichaje"><p><b>¿Fichar ya por ' + esc(k.name) + '?</b> Dejas ' + esc(mk.name) + ' a mitad de temporada y juegas lo que queda ' +
        (f.lvl !== mk.lvl ? (nl.art === 'el' ? 'en el ' : 'en la ') + esc(nl.name) + ' con su calendario' : 'con su calendario') + ', con ' + (mp ? esc(mp.name) : 'otro compañero') + ' (química desde cero). ' +
        (early ? 'Sales con contrato en vigor: el entrenador nuevo empieza con ' + C().EARLY_COACH + ' menos de confianza. ' : '') + 'No se puede deshacer.</p>' +
        '<div class="acts"><button class="pri" data-act="offer" data-i="' + i + '">Sí, fichar</button><button data-act="offno">Cancelar</button></div></div></div>';
    }
    h += '<div class="acts"><button class="pri" data-act="offer" data-i="' + i + '">' + (o.trial ? 'Hacer la prueba' : 'Firmar') + '</button>' +
      (canNeg ? '<button data-act="neg" data-i="' + i + '" title="Si no sale, el entrenador empieza con menos confianza">' + (o.role === 'Titular' ? 'Pedir ser indiscutible' : 'Pedir ser titular') + '</button>' : '') + '</div></div>';
    return h;
  }
  /** Ficha de oferta con prueba: es un partidillo (P4); dejarlo a medias la gasta. La marca «A medias» solo sale con una prueba
   *  empezada con la versión 1.2.0 (sin live: se puede jugar una vez más; notes/nota-en-directo-spec.md §5.1). */
  function trialLine(c, o) {
    var pend = trialHalf(c, o);
    return '<p class="muted"><b>Partidillo de prueba:</b> hace falta nota B (con C decide la suerte). Un set a ' + (C().TRIAL_PTS || 15) + ' con petos y 3 objetivos del entrenador; también se puede simular, con menos probabilidad. Si la dejas a medias, la pierdes.' +
      (pend ? ' <span class="tag y">A medias</span>' : '') + '</p>';
  }
  /** ¿Prueba de esta oferta a medias de un guardado viejo (VB.Career.trialPending sin live)? Sin trialPending (career.js viejo), la de antes. */
  function trialHalf(c, o) {
    var K = C(); if (!o) return false;
    if (K && typeof K.trialPending === 'function') { var tp = null; try { tp = K.trialPending(); } catch (e) { tp = null; } return !!(tp && tp.club === o.club && !tp.live); }
    return !!(c.pick && c.pick.trial && c.pick.trial.club === o.club);
  }
  /** «(entrenos +6 por semana en defensa)»: lo que suman los entrenamientos del club con ese estilo (VB.Career.STYLE_TRAIN). */
  function styleTrain(style) {
    var g = C().STYLE_TRAIN && C().STYLE_TRAIN[style];
    return g ? ' <span class="muted">(entrenos +' + C().STYLE_PROG + ' por semana en ' + esc(GROUP_OF[g]).toLowerCase() + ')</span>' : '';
  }
  function offersHTML(c) {
    if (!c.offers || !c.offers.length) return '<p class="muted">Ningún club ha hecho una oferta. Mejora tu media y tus notas para llamar la atención' + (c.listed ? '' : ', o declárate transferible en Club › Contrato') + '.</p>';
    var h = c.offers.map(function (o, i) { return offerCard(c, o, i, false); }).join('') + '<p class="note" role="status" aria-live="polite">' + esc(note) + '</p>';
    note = '';
    return h;
  }
  function renderTable(c) {
    var k = C().myClub(c), lvl = tblLvl >= 0 ? tblLvl : k.lvl, L = C().league(lvl), t = C().table(c, lvl), top = lvl === C().LEAGUES.length - 1, low = lvl === 0;
    var h = '<div class="card">' + (PH() ? lgPick(C().LEAGUES.map(function (x) { return { v: x.lvl, label: x.name, short: x.short }; }), lvl, 'lvl', 'Liga') : '<div class="lg-sw" role="group" aria-label="Liga">' + C().LEAGUES.map(function (x) {
      return '<button data-act="lvl" data-l="' + x.lvl + '" aria-pressed="' + (x.lvl === lvl) + '">' + esc(x.short) + '</button>';
    }).join('') + '</div>') + '<h3>' + sp([esc(L.name), c.phase === 'league' ? 'Jornada ' + Math.min(c.week, C().WEEKS) + ' de ' + C().WEEKS : 'Temporada regular acabada'], 'd') + '</h3>' +
      '<table><thead><tr><th class="l">#</th><th class="l">Club</th><th>PJ</th><th>G</th><th>P</th><th class="hide-s">Sets</th><th class="hide-s">Tantos</th><th>Pts</th></tr></thead><tbody>';
    t.forEach(function (r) {
      var cl = C().club(c, r.id), cls = [];
      if (r.id === c.myClub) cls.push('me');
      if (!top && r.pos <= 2) cls.push('up'); else if (r.pos <= 4) cls.push('cup');
      if (!low && r.pos >= 7) cls.push('down');
      h += '<tr class="' + cls.join(' ') + '"><td class="l">' + r.pos + '</td><td class="club">' + crest(cl, 22, c) + (WUI() ? '<button class="cw-tl-b" data-act="cw-club" data-id="' + r.id + '" aria-label="Ficha de ' + esc(cl.name) + '">' + esc(PH() ? shortClub(cl) : cl.name) + '</button>' : esc(PH() ? shortClub(cl) : cl.name)) + '</td><td>' + r.pj + '</td><td>' + r.g + '</td><td>' + r.p + '</td><td class="hide-s">' + r.sf + '-' + r.sc + '</td><td class="hide-s">' + r.pf + '-' + r.pc + '</td><td class="pts">' + r.pts + '</td></tr>';
    });
    h += '</tbody></table><p class="muted" style="margin-top:8px">' + (top ? '' : '<span class="tag g">1-2 ascienden</span>') + '<span class="tag y">1-4 juegan el Open</span>' + (low ? '' : '<span class="tag r">7-8 descienden</span>') +
      ' Puntos: 3 por ganar 2-0, 2 por ganar 2-1 y 1 por perder 1-2.</p></div>';
    return h;
  }
  /** Calendario: el sello de career-story (Derbi, Revancha…) delante de «Próximo» / «Pendiente» (f = el partido, o null). */
  function calTag(c, f, out) {
    var tg = f && SUI() ? SUI().tagFor(c, f) : '';
    return tg ? '<span><i class="sp-chip st-cal-tag">' + esc(tg) + '</i> ' + out + '</span>' : out;
  }
  function renderCal(c) {
    var k = C().myClub(c), s = c.sched[k.lvl], h = '<div class="card"><h3>' + sp(['Calendario', esc(C().league(k.lvl).name)], 'd') + '</h3><div class="cal">', up = 0;
    s.forEach(function (wk, w) {
      var m = null, i; for (i = 0; i < wk.length; i++) if (wk[i][0] === k.id || wk[i][1] === k.id) { m = wk[i]; break; }
      if (!m) return;
      var home = m[0] === k.id, rv = C().club(c, home ? m[1] : m[0]), r = c.res[k.lvl][w] && c.res[k.lvl][w][i], res = '';
      if (r) { var mine = r.a === k.id ? r.s : [r.s[1], r.s[0]], win = mine[0] > mine[1]; res = '<span class="res ' + (win ? 'w' : 'l') + '">' + (win ? 'G ' : 'P ') + mine[0] + '-' + mine[1] + '</span>'; }
      else res = calTag(c, c.phase === 'league' && w >= c.week && up++ < 3 ? { rival: rv, me: k, atHome: home, kind: 'league', week: w, lid: k.lvl } : null, '<span class="muted">' + (c.phase === 'league' && w === c.week ? 'Próximo' : 'Pendiente') + '</span>');
      h += '<div class="cal-r' + (c.phase === 'league' && w === c.week ? ' next' : '') + '"><b>J' + (w + 1) + '</b><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + crest(rv, 22, c) + (home ? 'vs ' : 'en ') + esc(PH() ? shortClub(rv) : rv.name) + '</span>' + res + '</div>';
    });
    h += '</div>';
    if (c.cup) {
      var cu = c.cup, nm = function (id) { var x = C().club(c, id); return x ? esc(x.short) : '?'; }, line = function (m, r) { return nm(m[0]) + (r ? ' ' + r.s[0] + '-' + r.s[1] + ' ' : ' — ') + nm(m[1]); };
      h += '<h3 style="margin-top:12px">' + esc(C().league(cu.lvl).cup) + '</h3><p>Semifinales: ' + sp(cu.semis.map(function (m, j) { return line(m, cu.res[0] && cu.res[0][j]); }), 'v') + '</p>' +
        (cu.final ? '<p>Final: ' + line(cu.final, cu.res[1] && cu.res[1][0]) + (cu.champion >= 0 ? SV + 'Campeón: ' + nm(cu.champion) : '') + '</p>' : '');
    }
    return h + '</div>';
  }
  function renderPlayer(c) {
    var s = sub.player;
    if (s === 'badges') return renderBadges(c);
    if (s === 'train') return (SUI() ? SUI().state(c, HLP) : '') + renderTrain(c);   // (career-story: ánimo y forma encima)
    if (s === 'look') return renderLook(c);
    var a = c.player, P = VB.Prog, need = C().need(a.lvl), h = '<div class="card"><div class="row"><span class="cr-ptw">' + ptHTML(c, 'me', 88, 'cr-pt88', 'Retrato de ' + a.name) + '<span class="cr-ptc">' + crest(C().myClub(c), 28, c) + '</span></span>' +
      '<div class="grow" style="min-width:0"><p class="bigname" style="font-size:20px">' + sp([esc(a.name), 'n.º ' + a.num], 's') + '</p><p class="muted" style="margin:0">' + sp([esc(a.role), a.age + ' años', 'Nivel ' + a.lvl, plural(a.matches | 0, 'partido', 'partidos')], 'c') + '</p></div></div>' +
      '<div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="' + need + '" aria-valuenow="' + a.xp + '" aria-label="Experiencia"><i style="width:' + Math.round(100 * a.xp / need) + '%"></i></div>' +
      '<p class="muted">' + sp([a.xp + ' / ' + need + ' XP para el nivel ' + (a.lvl + 1), 'Puntos de mejora: <b style="color:var(--gold)">' + a.pts + '</b>'], 'v') + '</p>';
    if (PH()) {   // móvil: la ficha en una línea (nombre · dorsal · nivel · XP y los puntos en su pastilla dorada) y la barra; los atributos, a la vista
      h = '<div class="card cr-pcard"><div class="cr-pid"><b>' + esc(a.name) + '</b><span class="muted">' + sp(['n.º ' + a.num, 'Nv ' + a.lvl, a.xp + ' / ' + need + ' XP'], 'v') + '</span>' +
        '<span class="cr-pts' + (a.pts ? '' : ' off') + '"><b>' + a.pts + '</b> ' + (a.pts === 1 ? 'punto' : 'puntos') + '</span></div>' +
        '<div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="' + need + '" aria-valuenow="' + a.xp + '" aria-label="Experiencia"><i style="width:' + Math.round(100 * a.xp / need) + '%"></i></div>';
    }
    // solo el grupo de la sub-pestaña (Ataque / Defensa / Físico; los de VB.Prog.GROUPS)
    var groups = (P && P.GROUPS ? P.GROUPS : [['Ataque', ['set', 'spike', 'ctl', 'serve']], ['Defensa', ['recv', 'dig', 'block']], ['Físico', ['jump', 'speed', 'react']]]).filter(function (g) { return g[0] === GROUP_OF[s]; });
    groups.forEach(function (g) {
      if (!PH()) h += '<h3 style="margin-top:10px">' + esc(g[0]) + '</h3>';   // (móvil: ya lo dice la sub-pestaña)
      g[1].forEach(function (k) {
        var v = a.st[k], cost = C().cost(v), can = v < 99 && a.pts >= cost, lab = P && P.LABEL ? P.LABEL[k] : k;
        h += '<div class="attr" title="' + esc(P && P.HINT ? P.HINT[k] : '') + '"><span>' + esc(lab) + '</span><span class="bar"><i style="width:' + v + '%"></i></span><b>' + v + '</b>' +
          '<button data-act="up" data-k="' + k + '"' + (can ? '' : ' disabled') + ' aria-label="Mejorar ' + esc(lab) + ' (' + plural(cost, 'punto', 'puntos') + ')">' + (v >= 99 ? 'máx' : '+' + cost) + '</button></div>';
      });
    });
    var tg = { atk: 'atk', def: 'def', phys: 'phys' }[s];
    h += '<p class="muted" style="margin-top:8px">Entreno: ' + esc(C().TRAIN[c.train].name) + SV + 'progreso de ' + esc(GROUP_OF[s]).toLowerCase() + ' ' + (c.tp && c.tp[tg] | 0) + ' / ' + C().TRAIN_NEED +
      ' (al llegar, +1 gratis en el más bajo del grupo)</p></div>';
    return h;
  }
  function renderBadges(c) {
    var a = c.player, h = '<div class="card"><h3>' + sp(['Insignias', VB.Badges ? (VB.Badges.equipped(a).length + ' de ' + VB.Badges.slots(a) + ' huecos') : 'no disponibles'], 'd') + '</h3>';
    if (VB.Badges) {
      var bx = 'Se desbloquean jugando (bronce, plata y oro). Toca una desbloqueada para equiparla o quitarla. Más huecos cada 5 niveles.';
      h += (PH() ? qBtn('Insignias', bx) : '<p class="muted">' + esc(bx) + '</p>') + '<div class="bdg">';
      VB.Badges.LIST.forEach(function (b) {
        var pr = VB.Badges.progress(a, b.id), on = VB.Badges.equipped(a).indexOf(b.id) >= 0, lv = pr.lvl;
        h += '<button class="bd' + (lv ? '' : ' lock') + '" data-act="badge" data-id="' + b.id + '" aria-pressed="' + on + '"' + (lv ? '' : ' aria-disabled="true"') + '>' +
          '<span class="ic" style="color:' + TIER_C[lv] + '">' + b.icon + '</span><span style="min-width:0"><strong>' + esc(b.name) + '</strong>' +
          '<span style="color:' + TIER_C[lv] + ';font-weight:800">' + TIER_N[lv] + '</span>' + SV + esc(lv ? b.desc + ' (' + b.fx[lv - 1] + ')' : b.cond) +
          '<span class="pg"><i style="width:' + Math.round(pr.frac * 100) + '%"></i></span><span class="muted">' + (pr.next != null ? pr.n + ' / ' + pr.next + ' ' + esc(pr.unit) : 'Nivel máximo') + '</span></span></button>';
      });
      h += '</div><p class="bd-msg" role="status" aria-live="polite">' + esc(badgeMsg) + '</p>';
    }
    badgeMsg = '';
    return h + '</div>';
  }
  /** Nombre de un objeto o peinado del vestuario ('' si no hay). */
  function lookName(X, id) { if (!id || typeof id !== 'string') return ''; var n = ''; try { n = X.name ? X.name(id) : ''; } catch (e) { n = ''; } return String(n || id); }
  /** Jugador › Vestuario: lo que llevas en esta Carrera (su sede: pista o playa), lo que tienes y «Abrir el vestuario». */
  function renderLook(c) {
    var X = LOOK(), hallC = isHall(c), l = c.life || {}, k = C().myClub(c), can = !!(X && VB.UI && VB.UI.openLook);
    var mine = l.look && typeof l.look === 'object' ? l.look : null, fit = mine;
    if (!fit && X && !hallC) { try { fit = X.fit ? X.fit(0) : null; } catch (e) { fit = null; } }   // (playa sin aspecto propio: el de tu n.º 1)
    var h = '<div class="card"><div class="row">' + (k ? kitSw(k.kit) : '') + '<div class="grow" style="min-width:0"><p class="bigname" style="font-size:20px">' + sp(['Vestuario', hallC ? 'En pista' : 'En playa'], 'd') + '</p>' +
      '<p class="muted" style="margin:0">Con los colores de tu club. Solo estética: no cambia cómo juegas.</p></div></div>';
    if (!X) return h + '<p class="muted">El vestuario no está disponible.</p></div>';
    if (!mine) h += '<p>' + (hallC ? 'Tu jugador lleva su aspecto de siempre hasta que guardes uno en el vestuario.' : 'Llevas el aspecto de tu n.º 1 de Partido rápido hasta que guardes uno propio en el vestuario.') + '</p>';
    if (fit) {
      var set = fit[hallC ? 'hall' : 'beach'] || {}, worn = [];
      (X.SLOTS || []).forEach(function (s) { var n = lookName(X, set[s]); if (n && worn.indexOf(n) < 0) worn.push(n); });
      h += '<p style="margin:8px 0 0"><b>Peinado:</b> ' + esc(lookName(X, fit.style) || '—') + '</p>' +
        (worn.length ? '<p class="muted" style="margin:4px 0 0">' + sp(worn.map(esc), 'c') + '</p>' : '');
    }
    var all = (X.CATALOG || []).filter(function (x) { return x && typeof x.id === 'string'; }), have = 0, nu = 0;
    all.forEach(function (x) { try { if (X.owned(x.id)) have++; } catch (e) { } });
    try { nu = X.unseen ? (X.unseen() || []).length : 0; } catch (e) { nu = 0; }
    h += '<p class="muted" style="margin:8px 0 0">' + sp(['Tienes ' + have + ' de ' + all.length + ' objetos', nu ? plural(nu, 'novedad sin ver', 'novedades sin ver') : ''], 'v') + '</p>' +
      '<div class="acts"><button class="pri" data-act="look-open"' + (can ? '' : ' disabled') + '>Abrir el vestuario</button></div>' +
      '<p class="muted">Más objetos con la fama, los logros y los premios de la Carrera, o en Fama › Tienda. Lo que ganas vale también en Partido rápido.</p></div>';
    return h;
  }
  /** «Abrir el vestuario»: la Carrera se cierra (CareerUI.isOpen() false mientras tanto) y se abre la página del menú con el kit de tu
   *  club (el mismo que lleva al partido: playa sin líbero, pista con kitLibero). Al volver, de nuevo en Jugador › Vestuario. */
  function openLook(c) {
    if (!c || !LOOK() || !(VB.UI && VB.UI.openLook)) { snd('back'); return; }
    var k = C().myClub(c), kit = (k && k.kit) || {}, st = { kitShirt: kit.shirt, kitAccent: kit.accent, kitShorts: kit.shorts, kitPattern: kit.pattern };
    if (isHall(c) && typeof kit.libero === 'number') st.kitLibero = kit.libero;
    var tc = null; try { tc = VB.Players && VB.Players.kitFrom ? VB.Players.kitFrom(st) : null; } catch (e) { tc = null; }
    var back = function () { tab = 'player'; sub.player = 'look'; view = 'hub'; show('hub'); };
    snd('click'); close(true);
    try { VB.UI.openLook({ who: 'career', hall: isHall(c), tc: tc, back: back }); }
    catch (e) { try { if (window.console) console.error('CareerUI.openLook', e); } catch (e2) { } back(); }
  }
  /** Al abrir la Carrera: lo que ya se ha ganado y aún no está en el vestuario (en un guardado antiguo, un solo resumen). */
  function lookSync() {
    var Lf = VB.CareerLife, c = null; if (!LOOK() || !Lf || !Lf.lookCheck) return;
    try {
      c = C() && C().get(); if (!c) return;
      var a0 = c.life && c.life.lookAnn, got = Lf.lookCheck(c);
      if (got.length || a0 !== (c.life && c.life.lookAnn)) C().save(c);
    } catch (e) { }
  }
  /** Medidor 0-100; marks = posiciones (0-100) de las marcas de nivel (química: 30, 60 y 90), solo CSS. */
  function meter(v, label, col, marks) {
    var mk = marks ? marks.map(function (x) { return '<i class="mk" style="left:' + x + '%"></i>'; }).join('') : '';
    return '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="' + esc(label) + '"><i style="width:' + v + '%;background:' + col + '"></i>' + mk + '</div>';
  }
  var CHEM_MK = [30, 60, 90];
  /** «71 de 100 | Faltan 19 para «Pareja de oro».» / «100 de 100 | Nivel máximo.» (ci = CareerLife.chemInfo; null: nada). */
  function chemNext(ci) {
    if (!ci) return '';
    return '<p class="muted" style="margin-top:6px">' + sp([ci.v + ' de 100', ci.next ? 'Faltan ' + ci.need + ' para «' + esc(ci.next) + '».' : 'Nivel máximo.'], 'v') + '</p>';
  }
  /** Jugador › Entreno: el enfoque se elige ya en el Plan del entrenador (pestaña Partido; aquí solo el enlace), progreso por grupo
   *  del entreno semanal y fatiga. */
  function renderTrain(c) {
    var T = C().TRAIN, f = c.fatigue | 0, fm = C().fatigueMalus(c), fc = f > 60 ? '#d8364a' : f > C().FAT_FREE ? '#e07b2b' : '#2fbf71', tk = T[c.train] || T.bal;
    var gs = Object.keys(tk.prog), pr = gs.length > 1 ? '+' + tk.prog[gs[0]] + ' a cada grupo' : gs.length ? '+' + tk.prog[gs[0]] + ' por semana' : '';
    var h = '<div class="card"><h3>Plan del entrenador</h3><p>' + sp(['Enfoque: <b>' + esc(tk.name) + '</b>', pr, tk.fat ? 'fatiga ' + (tk.fat > 0 ? '+' : '') + tk.fat : ''], 'v') + '</p>' +
      '<p class="muted">El enfoque, las 3 sesiones de cada jornada y el entreno automático están en Partido. Cada ' + C().TRAIN_NEED + ' de progreso, +1 al atributo más bajo del grupo.' +
      (C().STYLE_TRAIN && C().STYLE_TRAIN[C().clubInfo(c, C().myClub(c)).style] ? ' Los entrenos de tu club suman +' + C().STYLE_PROG + ' por semana en ' + esc(GROUP_OF[C().STYLE_TRAIN[C().clubInfo(c, C().myClub(c)).style]]).toLowerCase() + '.' : '') + '</p>' +
      '<div class="acts"><button class="pri" data-act="plan-go">Ir al plan del entrenador</button></div></div>';
    h += '<div class="card"><h3>Progreso</h3>' + ['phys', 'def', 'atk'].map(function (g) {
      var v = c.tp && c.tp[g] | 0;
      return '<div class="pbar"><span>' + esc(GROUP_OF[g]) + '</span><span class="bar"><i style="width:' + Math.round(100 * v / C().TRAIN_NEED) + '%"></i></span><b>' + v + '</b></div>';
    }).join('') +
      '<h3 style="margin-top:10px">' + sp(['Fatiga', f + ' de 100'], 'd') + '</h3>' + meter(f, 'Fatiga', fc) +
      '<p class="muted">' + (fm ? 'Rindes menos: −' + fm + ' en todos tus atributos en el próximo partido. Una semana de Descanso la baja ' + (-T.rest.fat) + '.' : 'Por debajo de ' + C().FAT_FREE + ' no afecta al juego.') + '</p>' +
      // fisio: lo pagas con lo que ahorras del sueldo (una vez por jornada)
      (C().physio && c.phase !== 'off' ? '<div class="acts"><button data-act="physio"' + (f > 0 ? '' : ' disabled title="No tienes fatiga que recuperar"') + '>Fisio <small style="font:600 12px var(--ui);text-transform:none;letter-spacing:0">' + (f > 0 ? '(−' + C().PHYSIO_FAT + ' de fatiga, ' + eur(C().physioCost(c)) + ')' : '(sin fatiga)') + '</small></button></div>' +
        '<p class="muted">' + sp(['Ahorros ' + eur(c.money || 0), 'una sesión por jornada'], 'v') + '</p><p class="note" role="status" aria-live="polite">' + esc(note) + '</p>' : '') + '</div>';
    note = '';
    return h;
  }
  function renderClub(c) {
    var s = sub.club;
    if (isHall(c) && s === 'team') return renderTeam6(c);
    if (isHall(c) && s === 'info') return renderClubInfo6(c);
    if (s === 'mate') return renderMate(c);
    if (s === 'people' && SUI()) return SUI().people(c, HLP);   // career-story: Club › Gente
    if (s === 'contract') return renderContract(c);
    if (s === 'offers') {
      return '<div class="card"><h3>' + (c.window === 'mid' ? 'Ventana de fichajes' : 'Ofertas') + '</h3>' +
        (c.window === 'mid' || c.phase === 'off' ? offersHTML(c) + (c.window === 'mid' && c.offers.length ? '<div class="acts"><button data-act="stay">Rechazar las ofertas</button></div>' : '')
          : '<p class="muted">Las ofertas llegan a mitad de temporada (tras la jornada ' + C().MID_WEEK + ', solo con una nota media de ' + (C().midNota ? num1(C().midNota(c)) : c.listed ? '6,5' : '7') + ' o más) y al acabarla. Cuentan tu media, tu nota media, la confianza del entrenador, tus insignias y si te has declarado transferible.</p>') + '</div>';
    }
    var k = C().myClub(c), L = C().league(k.lvl), f = C().clubInfo(c, k), coach = c.coach, cc = coach < 30 ? '#d8364a' : coach < 50 ? '#e07b2b' : coach < 70 ? '#d9a520' : '#2fbf71';
    var ref = C().REF[L.ref];
    var h = '<div class="card"><div class="row">' + crest(k, 72, c) + '<div class="grow" style="min-width:0"><p class="bigname">' + esc(k.name) + '</p>' +
      '<p class="muted" style="margin:2px 0 0">' + sp([stars(f.stars), esc(L.name), esc(k.city)], 'v') + '</p></div></div>' +
      '<div class="fact">' + fact('Media del club', C().clubOvr(k)) + fact('Posición', c.phase === 'league' && c.week === 0 ? '—' : ordn(C().posOf(c, k.id))) + fact('Sede', esc(f.beach || k.city)) +
      fact('Equipación', kitSw(k.kit).replace('cr-kit', 'cr-kit kit-mini') + ' <span class="muted">camiseta, detalle y pantalón</span>') + fact('Estilo', esc(f.style) + styleTrain(f.style)) +
      // (el compañero, con pastillas como en la oferta; antes rol, media y desvío iban metidos en un paréntesis)
      fact('Compañero', esc(c.mate.name) + (function () {
        var mo = C().mateOvr(c), dd = mo - C().clubOvr(k), tg = dd >= 3 ? 'g' : dd <= -3 ? 'r' : '';
        return '<span class="mline">' + sp([esc(c.mate.role), 'Media ' + mo, { h: esc(vsClub(dd)), c: tg ? 'dv ' + tg : 'dv' }], 'c') + '</span>';
      })()) +
      fact('Objetivo', esc(c.objective.text)) + fact('Arbitraje', esc(ref.name)) + '</div>' +
      '<h3 style="margin-top:10px">' + sp(['Entrenador', esc(C().coachText(coach))], 'd') + '</h3>' + meter(coach, 'Confianza del entrenador', cc) +
      '<p class="muted">' + sp(['Nota media de la temporada: ' + dec(C().avgNota(c)), 'Forma (3 últimos): ' + dec(C().form(c))], 'v') + '</p></div>';
    return h;
  }
  /** Club › Compañero: el actual (química) y la plantilla para pedir cambio. */
  function renderMate(c) {
    var m = c.mate, ch = m.chem | 0, cb = C().chemBonus(c), k = C().myClub(c), co = C().clubOvr(k), mo = C().mateOvr(c), mf = m.form | 0;
    var ci = null; try { ci = LIFE() ? LIFE().chemInfo(c) : null; } catch (e) { ci = null; }
    var h = '<div class="card"><h3>Tu compañero</h3><div class="row" style="align-items:flex-start;flex-wrap:nowrap">' + ptHTML(c, 'mate', 72, 'cr-pt72', 'Retrato de ' + m.name) +
      '<div class="grow" style="min-width:0"><p class="bigname" style="font-size:20px">' + sp([esc(m.name), 'n.º ' + m.num], 's') + '</p>' + mateLine(m, co, true) + '</div></div>' +
      '<p class="muted">' + (mo - co <= -3 ? 'Con un compañero flojo tendrás más trabajo y más protagonismo: la IA se la jugará menos y tú llevarás el peso.' : mo - co >= 3 ? 'Con un compañero bueno tienes más ayuda: recibe, defiende y remata por encima del nivel del club.' : 'Un compañero al nivel del club: ni carga ni muleta.') +
      (mf ? ' Su forma (' + esc(C().formText(mf)).toLowerCase() + ') ' + (mf > 0 ? 'suma +' : 'resta −') + Math.abs(mf) + ' a todos sus atributos en el próximo partido; cambia tras cada partido.' : ' Su forma cambia tras cada partido y suma o resta hasta ' + C().FORM_MAX + ' a sus atributos.') + '</p>' +
      '<h3 style="margin-top:10px">' + sp(['Química', ci ? esc(ci.name) : ch + ' de 100'], 'd') + '</h3>' + meter(ch, 'Química con el compañero', '#4be0a0', ci ? CHEM_MK : null) + chemNext(ci) +
      '<p class="muted">Sube cada partido juntos (+5 jugado, +3 simulado). ' + (cb ? 'Ahora suma +' + cb + ' a los dos en reacción, colocación y recepción.' : 'A partir de 30 suma +1 a los dos en reacción, colocación y recepción (hasta +3).') + '</p></div>';
    h += '<div class="card"><h3>Plantilla</h3><p class="muted">Puedes pedir jugar con otro compañero del club' + (c.coach < C().MATE_COACH ? ', pero el entrenador aún no te deja (necesitas su confianza: «Tiene dudas» o mejor).' : '. La química se guarda con cada uno; las medias y los puntos fuertes son de verdad en el partido.') + '</p>' +
      (c.squad || []).map(function (s, i) {
        var so = C().ovrOf(s.st), d = so - mo;
        return '<div class="mate"><div style="min-width:0"><b class="cr-mn">' + esc(s.name) + '</b>' + mateLine(s, co, true) +
          '<p class="muted" style="margin:2px 0 0">' + sp([(d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' respecto a ' + esc(m.name.split(' ')[0]), esc(chemTxt(c, s.chem))], 'c') + '</p></div><button data-act="mate" data-i="' + i + '"' + (c.coach < C().MATE_COACH ? ' disabled' : '') + '>Elegir</button></div>';
      }).join('') + '<p class="note" role="status" aria-live="polite">' + esc(note) + '</p></div>';
    note = '';
    return h;
  }
  /** Club › Contrato: rol, años y sueldo; pedir el traspaso. */
  function renderContract(c) {
    var ct = c.contract || {};
    var rl = C().roleIdx ? C().roleIdx(c) : 1, brk = c.broken === c.season;
    var h = '<div class="card"><h3>Contrato</h3><div class="fact">' + fact('Rol', esc(ct.role || '—')) + fact((ct.left | 0) === 1 ? 'Queda' : 'Quedan', plural(ct.left | 0, 'temporada', 'temporadas') + ((ct.left | 0) === 1 ? ' (esta)' : ', con esta')) +
      fact('Sueldo (ficticio)', ct.salary ? money(ct.salary) : '—') + fact('Ahorros', eur(c.money || 0)) + fact('Firmado', 'T' + (ct.since || 1) + ' por ' + plural(ct.years | 0, 'temporada', 'temporadas')) + '</div>' +
      (C().ROLE_HINT ? '<p><b>' + esc(ct.role || '') + ':</b> ' + esc(C().ROLE_HINT[rl]) + (isHall(c)
        // pista (titularidad): de inicio, desde el banquillo y sin jugar
        ? ((c.stats.starts | 0) + (c.stats.subIn | 0) + (c.stats.bench | 0) ? ' Esta temporada: ' + (c.stats.starts | 0) + ' de inicio, ' + (c.stats.subIn | 0) + ' desde el banquillo, ' + (c.stats.bench | 0) + ' sin jugar.' : '')
        : ((c.stats.bench | 0) ? ' Esta temporada, ' + plural(c.stats.bench | 0, 'jornada', 'jornadas') + ' en el banquillo.' : '')) + '</p>' : '') +
      (brk ? '<p class="bench" style="margin:6px 0"><b>Promesa incumplida.</b> Te fichó como titular y te ha sentado: hasta final de temporada puedes irte sin pegas y los clubes se interesan más por ti.</p>' : '') +
      '<p class="muted">Cobras el sueldo cada jornada (la mitad del mensual) y lo ahorras: sirve para el fisio (Jugador › Entreno). Al acabar la última temporada del contrato, el club te propone renovar (el rol depende de la confianza del entrenador) y eliges la duración.</p></div>';
    h += '<div class="card"><h3>' + sp(['Traspaso', c.listed ? 'Transferible' : 'No transferible'], 'd') + '</h3>' +
      (c.listed ? '<p>Estás en la lista de transferibles: llegan más ofertas (a mitad de temporada basta con una nota media de ' + (C().midNota ? num1(C().midNota(c)) : '6,5') + ').</p><div class="acts"><button data-act="transfer" data-on="0">Retirar la petición</button></div>'
        : '<p class="muted">Si te declaras transferible, los clubes se interesan más por ti, pero el entrenador pierde confianza (−8).</p><div class="acts"><button class="warn" data-act="transfer" data-on="1">Pedir el traspaso</button></div>') + '</div>';
    return h;
  }
  /** Mensajes: entrenador, agente, ofertas, objetivos. Lo nuevo resaltado (se marca como leído al verlo). */
  var MSG_K = { coach: 'Entrenador', agent: 'Agente', offer: 'Ofertas', obj: 'Objetivo', club: 'Club', train: 'Preparador físico', fans: 'Fama', mentor: 'Mentor', boss: 'Jefe', chem: 'Química' };
  function msgHTML(m, fresh) {
    return '<div class="msg' + (m.r && !(fresh && fresh[m.id]) ? '' : ' unread') + '"><small>' + sp([esc(MSG_K[m.k] || 'Club'), 'T' + m.s + (m.ph === 'pick' ? '' : ' J' + Math.min(m.w, C().WEEKS))], 'v') + '</small><b>' + esc(m.t) + '</b><p>' + esc(m.x) + '</p></div>';
  }
  function renderInbox(c, fresh) {
    var l = (c.inbox || []).slice().reverse();
    return '<div class="card"><h3>Mensajes <span class="muted">(' + l.length + ')</span></h3>' + (l.length ? l.map(function (m) { return msgHTML(m, fresh); }).join('') : '<p class="muted">Sin mensajes.</p>') + '</div>';
  }
  function renderHonors(c) {
    var T = c.career, s = sub.honors, h = '', du = diffUsed(c);
    if (s === 'titles') {
      // B2c: vitrina con huecos (career-world-ui.js; su propia tarjeta) y debajo la lista de siempre como «Títulos por temporada»
      var tcH = ''; try { tcH = WUI() && WUI().trophyCaseHTML ? WUI().trophyCaseHTML(c, HLP) : ''; } catch (e) { tcH = ''; }
      h = tcH + '<div class="card"><h3>' + (tcH ? 'Títulos por temporada' : 'Palmarés') + '</h3>';
      h += c.trophies.length ? c.trophies.map(function (t) { return '<p><span class="tag ' + (t.kind === 'ascenso' ? 'g' : 'y') + '">' + (t.kind === 'liga' ? 'Campeón' : t.kind === 'copa' ? (isHall(c) ? 'Copa' : 'Open') : t.kind === 'intl' ? 'Internacional' : t.kind === 'premio' ? 'Premio' : 'Ascenso') + '</span> ' + sp([esc(t.name), 'T' + t.season, esc(t.club), du ? esc(dName(dkey(c, t.d || 'normal'))) : ''], 'v') + '</p>'; }).join('') : '<p class="muted">' + (tcH ? 'Aún sin títulos: los huecos de arriba esperan.' : 'Aún sin títulos.') + '</p>';
      h += '<h3 style="margin-top:10px">Totales de la carrera</h3><p>' + sp([plural(T.played, 'partido', 'partidos') + ' (' + plural(T.won, 'ganado', 'ganados') + ', ' + plural(T.sim, 'simulado', 'simulados') + ((T.bench | 0) ? ', ' + (T.bench | 0) + ' en el banquillo' : '') + ')', isHall(c) && (T.rr | 0) > 0 ? Math.round(100 * (T.mr | 0) / T.rr) + ' % de puntos jugados' : '', isHall(c) && ((T.starts | 0) + (T.subIn | 0)) ? (T.starts | 0) + ' de inicio y ' + (T.subIn | 0) + ' desde el banquillo' : '', plural(T.pts, 'punto', 'puntos'), T.kills + ' remates ganadores', plural(T.aces, 'ace', 'aces'), T.blocks + ' bloqueos', plural(T.assists, 'asistencia', 'asistencias')], 'v') + '</p></div>';
      return h;
    }
    if (s === 'seasons') {
      return '<div class="card"><h3>Temporadas</h3>' + (c.history.length ? '<table><thead><tr><th class="l">T</th><th class="l">Club</th><th>Pos.</th><th class="hide-s">' + (isHall(c) ? 'Copa' : 'Open') + '</th><th>Nota</th>' + (du ? '<th>Dif.</th>' : '') + '<th>Media</th></tr></thead><tbody>' + c.history.map(function (r) {
        return '<tr><td class="l">' + r.season + '</td><td class="club">' + esc(r.clubName) + ' <span class="muted">(' + esc(isHall(c) ? (r.lgShort || '') + (r.country ? ', ' + r.country : '') : C().league(r.lvl).short) + ')</span></td><td>' + ordn(r.pos) + (r.move > 0 ? ' ↑' : r.move < 0 ? ' ↓' : '') + '</td><td class="hide-s">' + esc(r.cup) + '</td><td>' + dec(r.nota) + '</td>' + (du ? '<td>' + esc(dName(dkey(c, r.d || 'normal'))) + (r.dm ? '*' : '') + '</td>' : '') + '<td>' + r.ovr + '</td></tr>';
      }).join('') + '</tbody></table>' + (du && c.history.some(function (r) { return r.dm; }) ? '<p class="muted">* Dificultad mixta: cuenta la más fácil.</p>' : '') : '<p class="muted">Tu primera temporada está en marcha.</p>') + '</div>';
    }
    // dificultad (se cambia entre partidos; career.js setDifficulty)
    if (CD() && C().setDifficulty) {   // (las dos Carreras: la fachada lleva a la activa)
      var dk = dkey(c), DD = CD()[dk];
      h += '<div class="card"><h3>Dificultad</h3><div class="seg" role="group" aria-label="Dificultad">' + DKEYS().map(function (k) {
        return '<button data-act="cdiff-set" data-d="' + k + '" aria-pressed="' + (k === dk) + '">' + esc(dName(k)) + '</button>';
      }).join('') + '</div><p class="muted"><b>' + esc(DD.name) + ':</b> ' + esc(DD.hint) + '.</p>' +
        '<p class="muted">Se aplica desde el próximo partido. Si aún no has jugado esta temporada, también ajusta el objetivo del club y tu confianza; si ya has jugado, el objetivo cambia la temporada que viene. Cada título guarda la dificultad más fácil de su temporada (partidos, banquillos y objetivo).</p>' +
        '<p class="note" role="status" aria-live="polite">' + esc(dnote) + '</p></div>';
      dnote = '';
    }
    if (SUI()) h += SUI().optsHTML(c, HLP);   // career-story: «Cuánta vida» (Poca / Normal / Mucha)
    // abandonar (doble confirmación, sin confirm())
    h += optsModeHTML(c);
    h += '<div class="card"><h3>Opciones</h3>';
    if (WUI() && WUI().optsHTML) h += WUI().optsHTML(c, HLP);   // escenas del mentor: Sí | No
    if (!confirmStep) h += '<button class="warn" data-act="quit1">Borrar carrera</button>';
    else h += '<div class="confirm"><p><b>¿Seguro?</b> Se borra la carrera ' + (isHall(c) ? 'de pista' : 'de playa') + ' entera: jugador, insignias, temporadas y palmarés. No se puede deshacer.</p><div class="acts">' +
      '<button class="warn" data-act="quit2">' + (confirmStep === 2 ? (device() === 'touch' ? 'Toca otra vez para borrar' : 'Pulsa otra vez para borrar') : 'Sí, borrar') + '</button><button data-act="quit0">Cancelar</button></div></div>';
    return h + '</div>';
  }
  function device() { return (VB.ctx && VB.ctx.inputDevice) || 'keyboard'; }

  // ================================================================ Carrera de pista (6v6, lote C)
  function posName(k) { var P6 = C().POS6 || {}; return P6[k] ? P6[k].name : k; }
  /** Selector «Playa (2v2)» / «Pista (6v6)» de la pantalla de crear. */
  function modeSeg() {
    var hav = C().hall && C().hall.available(), m = form.mode === 'hall' ? 'hall' : 'beach';
    return '<div class="card"><label>Carrera</label><div class="seg" role="group" aria-label="Tipo de Carrera">' +
      '<button data-act="mode" data-m="beach" aria-pressed="' + (m === 'beach') + '">Playa (2v2)' + (C().has('beach') ? ' <small style="font:600 12px var(--ui);text-transform:none;letter-spacing:0">(guardada)</small>' : '') + '</button>' +
      '<button data-act="mode" data-m="hall" aria-pressed="' + (m === 'hall') + '"' + (hav ? '' : ' disabled') + '>Pista (6v6)' + (C().has('hall') ? ' <small style="font:600 12px var(--ui);text-transform:none;letter-spacing:0">(guardada)</small>' : '') + '</button></div></div>';
  }
  /** Palmarés › Opciones: pasar a la otra Carrera (las dos se guardan aparte) y, en la pista, tu puesto. */
  function optsModeHTML(c) {
    var hall = isHall(c), other = hall ? 'beach' : 'hall', oName = hall ? 'de playa (2v2)' : 'de pista (6v6)', h = '';
    if (!hall && !(C().hall && C().hall.available())) return '';
    h += '<div class="card"><h3>' + sp(['Carrera', hall ? 'Pista 6 contra 6' : 'Playa 2 contra 2'], 'd') + '</h3><p class="muted">Las Carreras de playa y de pista se guardan aparte: puedes llevar las dos.</p>' +
      '<div class="acts"><button data-act="switch" data-m="' + other + '">' + (C().has(other) ? 'Ir a la Carrera ' + oName : 'Crear una Carrera ' + oName) + '</button></div></div>';
    if (hall) {
      var ps = C().positions(), cur = c.player.roleKey;
      h += '<div class="card"><h3>' + sp(['Puesto', posName(cur)], 'd') + '</h3>' +
        '<div class="seg" role="group" aria-label="Puesto">' + ps.map(function (k) { return '<button data-act="setpos" data-p="' + k + '" aria-pressed="' + (k === cur) + '">' + esc(posName(k)) + '</button>'; }).join('') + '</div>' +
        '<p class="muted">' + (ps.length > 1 ? 'Cambiar de puesto no cambia tus atributos.' : 'Por ahora en el 6 contra 6 solo se puede llevar al receptor; los demás puestos saldrán aquí en cuanto estén listos.') + '</p></div>';
    }
    return h;
  }
  function kitDots(k) {
    var d = function (v, t) { return '<i class="cr-dot" style="background:' + hex(v) + '" title="' + t + '"></i>'; };
    return '<span class="cr-dots">' + d(k.shirt, 'Camiseta') + d(k.accent, 'Segundo color') + d(k.libero, 'Líbero') + '</span>';
  }
  function renderMatch6(c) {
    // Faro (career-world-ui.js), arriba del todo como en la playa; Titulares tras el resumen o el último partido
    var mc = WUI() && WUI().mentorCard ? WUI().mentorCard(c, HLP) : '', h = takeTrialRes(c) + mc;   // (prueba superada: su resultado, arriba)
    if (c.phase === 'off') return h + renderSeasonEnd(c) + (WUI() && WUI().headlines ? WUI().headlines(c, HLP) : '');
    var n = C().next(c);
    if (n) {
      var lg = c.phase === 'league' && c.week > 0, same = n.rival.lid === n.me.lid, RL = n.rivalLeague || C().league(n.rival.lid), role = C().ctrlRole(c);
      // si su 1ª choca con la tuya, el rival sale con su 2ª (o con la de la CPU): la muestra enseña la que vestirá (Players.rivalKit)
      var mk = n.me.kit, rvk = n.rival.kit, alt = VB.Players && VB.Players.rivalKit ? VB.Players.rivalKit({ kitShirt: mk.shirt, kitShorts: mk.shorts,
        rival: { kitShirt: rvk.shirt, kitAccent: rvk.accent, kitShorts: rvk.shorts, kitPattern: rvk.pattern, kitLibero: rvk.libero } }) : null;
      var rvShow = alt && alt.kind === '2a' ? Object.assign({}, n.rival, { kit: { shirt: alt.shirt, accent: alt.accent, shorts: alt.shorts, pattern: alt.pattern } }) : n.rival;
      // SPLAT: entrada en brochazo (tu escudo y el del rival con la equipación que vestirá), estado y botones, y los detalles en una hoja
      var st6 = statusHTML6(c, n);
      var side = storySide(c);   // career-story: avisos, «Tu semana» y el plan plegado (como en la playa)
      var mIn = side && mc && PH(); if (mIn) h = h.slice(0, h.length - mc.length);   // (móvil con avisos: Faro justo bajo el ticket, dentro de .cr-two; detrás de los avisos y los detalles no se veía)
      h += (side ? '<div class="cr-two">' : '') + '<div class="cr-next">' + ticketHTML(c, n.me, rvShow, sp(esc(n.label).split(' · ').concat(['Sets a ' + c.points]), 'v'), (n.atHome ? 'vs ' : 'en ') + esc(PH() ? shortClub(n.rival) : n.rival.name),
        [sp([same ? (lg ? ordn(C().posOf(c, n.rival.id)) : '') : esc(RL.short + ', ' + RL.country), 'Media ' + n.ovrRival, 'IA ' + esc(n.diffName),
          alt && alt.kind === '2a' ? '2ª equipación' : alt && alt.kind === 'cpu' ? 'Equipación neutral' : ''], 'v'),
         sp(['Tú: ' + esc(n.me.short || n.me.name), lg ? ordn(C().posOf(c, n.me.id)) : '', 'Equipo ' + n.ovrMe, n.atHome ? 'En casa' : 'Fuera'], 'v')],
        n.label.split(' · ').join(', ') + ', ' + (n.atHome ? 'contra ' : 'en casa de ') + n.rival.name, SUI() ? SUI().tagFor(c, n) : '') +
        // («Sales de inicio…» va en la hoja de detalles; el banquillo, en su nota, encima de los botones)
        (/^<p class="cr-st6"/.test(st6.pre) ? '' : st6.pre) + st6.acts +
        (side ? '</div>' + (mIn ? mc : '') + side + '<div class="cr-nd-w">' : '') + '<div class="card cr-nd">' + (/^<p class="cr-st6"/.test(st6.pre) ? st6.pre : '') +
        '<p class="muted">6 contra 6 en el pabellón: al mejor de 3 sets a ' + c.points + (c.points > 15 ? ', el tercero a 15' : '') + '. Tú llevas a ' + esc(c.player.name) + ' (dorsal ' + c.player.num + ', ' + esc(posName(role).toLowerCase()) + ') y al resto del equipo la IA.</p>' +
        (role !== c.player.roleKey ? '<p class="muted">Tu puesto (' + esc(posName(c.player.roleKey).toLowerCase()) + ') aún no se puede llevar en el 6 contra 6: juegas de ' + esc(posName(role).toLowerCase()) + '.</p>' : '') +
        '<p class="muted">' + sp(['Entreno: ' + esc(C().TRAIN[c.train].name), 'Fatiga ' + (c.fatigue | 0) + (C().fatigueMalus(c) ? ' (−' + C().fatigueMalus(c) + ' en tus atributos)' : ''),
          esc(chemTxt(c, c.chem, C().chemBonus(c)))], 'v') + '</p>' +
        (CD() ? '<p class="muted">Dificultad: <b>' + esc(dName(dkey(c))) + '</b><button class="lnk" data-tab="honors" data-s="opts" aria-label="Cambiar la dificultad">Cambiar</button></p>' : '') +
        '</div></div>' + (side ? '</div>' : '');
    } else h += storySide(c);
    h += storyTrain(c);   // sesiones de entrenamiento antes del partido (y la pelea por el puesto)
    if (LUI()) h += LUI().matchCards(c, HLP);   // reto de la jornada (por puesto) y decisión pendiente, como en la playa
    var lastUn = (c.inbox || []).filter(function (m) { return !m.r; }).slice(-1)[0];
    if (lastUn) h += '<div class="card"><h3>Mensajes <span class="muted">(' + plural(C().unread(c), 'sin leer', 'sin leer') + ')</span></h3>' + msgHTML(lastUn) + '<div class="acts"><button data-tab="inbox">Ver mensajes</button></div></div>';
    if (c.window === 'mid' && c.offers && c.offers.length) h += '<div class="card new"><h3>Ventana de fichajes</h3><p>' + plural(c.offers.length, 'club quiere', 'clubes quieren') + ' ficharte ya' + (c.offers.some(function (o) { return o.foreign; }) ? ', también de fuera' : '') + '. Las ofertas caducan al jugar o simular el siguiente partido.</p><div class="acts"><button data-tab="club" data-s="offers">Ver ofertas</button></div></div>';
    h += storyLast(c);   // último partido y «Titulares» de la liga (solo con noticias sin ver); con career-story, plegables
    if (!c.last) h += '<div class="card"><h3>Objetivo del club</h3><p>' + esc(c.objective.text) + '</p><p class="muted">El entrenador valora tus notas y los resultados. Juega bien y vendrán ojeadores de ligas mejores, también de otros países.</p></div>';
    freshLast = false;
    return h;
  }
  /** Titularidad (13-nov-2026): tu estado en el partido de la jornada (de inicio, banquillo o fuera) y sus botones. */
  function formTxt6(f) { return C().formText ? String(C().formText(f | 0)).toLowerCase() : ''; }
  function statusHTML6(c, n) {
    var SIM = '<button data-act="sim">Simular <small style="font:600 12px var(--ui);text-transform:none;letter-spacing:0">(mitad de XP)</small></button>';
    var st = n.status || (n.bench ? 'out' : 'start'), rv = n.rivalIn, H6 = C().hall || {};
    if (st === 'out') {
      return { pre: '<div class="bench"><p><b>Fuera de la convocatoria.</b> ' + esc(n.why || '') + ' Descansas (fatiga −' + C().BENCH_REST + '), entrenas y cobras.</p></div>',
        acts: '<div class="acts cr-go"><button class="pri" data-act="bench">Ver la jornada</button></div>' };
    }
    if (st === 'sub') {
      var L = H6.lineup ? H6.lineup(c) : null, me = L && H6.meRules ? H6.meRules(c, L) : null, f0 = C().form(c);
      var meF = f0 == null ? 'sin partidos' : 'forma ' + formTxt6(Math.round(Math.max(-3, Math.min(3, (f0 - 6.5) * 2))));
      return { pre: '<div class="bench"><p><b>Empiezas en el banquillo.</b> ' + (rv ? 'Sale de inicio ' + esc(rv.name) + ' (' + esc(posName(rv.pos).toLowerCase()) + ', media ' + rv.ovr + ', forma ' + esc(formTxt6(rv.form)) + '). ' : '') +
        'Tú: media ' + C().playerOvr(c) + ', ' + esc(meF) + '. ' + (me && me.enterLostSet ? 'El entrenador te meterá si el equipo pierde un set o si ' + (rv ? esc(rv.name.split(' ')[0]) : 'el titular') + ' no está fino.' : 'Si el partido lo pide, entrarás.') + '</p></div>',
        acts: '<div class="acts cr-go"><button class="pri" data-act="play">Jugar desde el banquillo</button>' + SIM + '</div>' };
    }
    var back = c.sq6 && c.last && c.last.part && c.last.part.status !== 'start';
    return { pre: '<p class="cr-st6">' + (back ? 'Vuelves al seis inicial.' : 'Sales de inicio.') + (rv ? ' Te aprieta ' + esc(rv.name) + ' (media ' + rv.ovr + ').' : '') + '</p>',
      acts: '<div class="acts cr-go"><button class="pri" data-act="play">Jugar partido</button>' + SIM + '</div>' };
  }
  /** Móvil: un solo selector «‹ España · Hiperliga 2 ›» en lugar de las filas de botones (flechas de 44; tocar el nombre abre una
   *  hoja con todas). opts = [{v, label, group?}] en orden, cur = v elegido, act = data-act de las flechas ('lvl' | 'lg6'). */
  var lgOpts = null;
  function lgPick(opts, cur, act, aria) {
    var i = 0; opts.forEach(function (o, j) { if (String(o.v) === String(cur)) i = j; });
    var n = opts.length, pv = opts[(i - 1 + n) % n], nx = opts[(i + 1) % n];
    lgOpts = { opts: opts, cur: cur, act: act, aria: aria };
    return '<div class="cr-lgp" role="group" aria-label="' + esc(aria) + '"><button class="cr-lgp-a" data-act="' + act + '" data-l="' + esc(pv.v) + '" aria-label="' + esc(aria) + ' anterior: ' + esc(pv.label) + '">‹</button>' +
      '<button class="cr-lgp-v" data-act="lgsheet" aria-label="' + esc(aria) + ': ' + esc(opts[i].label) + '. Elegir otra">' + esc(opts[i].label) + '</button>' +
      '<button class="cr-lgp-a" data-act="' + act + '" data-l="' + esc(nx.v) + '" aria-label="' + esc(aria) + ' siguiente: ' + esc(nx.label) + '">›</button></div>';
  }
  /** Hoja con todas las ligas del selector del móvil (agrupadas por país en la pista). */
  function lgSheet() {
    if (!lgOpts || !(VB.Splat && VB.Splat.sheet)) return;
    var L0 = lgOpts, h = '', g = null;
    L0.opts.forEach(function (o) {
      if (o.group !== g) { h += (g !== null ? '</div>' : '') + (o.group ? '<p class="cr-lgs-g">' + esc(o.group) + '</p>' : '') + '<div class="cr-lgs-r">'; g = o.group; }
      h += '<button type="button" class="sp-btn sp-sm ' + (String(o.v) === String(L0.cur) ? 'sp-gold' : 'sp-cream') + '" data-l="' + esc(o.v) + '"><span class="sp-t">' + esc(o.short || o.label) + '</span></button>';
    });
    var sh = VB.Splat.sheet({ title: L0.aria, html: h + '</div>', cls: 'cr-lgs' });
    sh.body.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-l]') : null; if (!b) return;
      var v = b.getAttribute('data-l'); sh.close();
      if (L0.act === 'lvl') tblLvl = +v; else tblLid = v;
      snd('select'); render(); focusSel('.cr-lgp-v');
    });
  }
  /** Selector de liga de la pista (país y división), compartido por Clasificación y Liga › Clubes (tblLid). */
  function lgSw6(c, lid) {
    var k = C().myClub(c), L = C().league(lid);
    // tu país primero y luego por continente y nivel; en el móvil, una sola fila que se desliza (cc-row)
    var ccs = []; sortCountries(C().hall.countries()).concat(c.leagues.map(function (x) { return { code: x.cc }; })).forEach(function (x) { if (ccs.indexOf(x.code) < 0 && (C().league(x.code + '1') || C().league(x.code + '2'))) ccs.push(x.code); });
    ccs = [k.cc].concat(ccs.filter(function (cc) { return cc !== k.cc; }));
    if (PH()) {   // móvil: «‹ España · Hiperliga 2 ›» (todas las ligas de cada país, en orden)
      var opts = [];
      ccs.forEach(function (cc) { [C().league(cc + '1'), C().league(cc + '2')].forEach(function (x) { if (x) opts.push({ v: x.id, label: x.country + ' · ' + x.name, short: x.name, group: x.country + (cc === k.cc ? ' ★' : '') }); }); });
      return lgPick(opts, lid, 'lg6', 'Liga');
    }
    var L2 = C().league(L.cc + '2'), L1 = C().league(L.cc + '1');
    return '<div class="lg-sw cc-row" role="group" aria-label="País">' + ccs.map(function (cc) {
      var first = c.leagues.filter(function (x) { return x.cc === cc; })[0];
      return '<button data-act="lg6" data-l="' + (cc === L.cc ? lid : first.id) + '" aria-pressed="' + (cc === L.cc) + '" title="' + esc(first.country) + '">' + esc(cc) + (cc === k.cc ? ' ★' : '') + '</button>';
    }).join('') + '</div>' + (L2 && L1 ? '<div class="lg-sw" role="group" aria-label="División">' + [L1, L2].map(function (x) {
      return '<button data-act="lg6" data-l="' + x.id + '" aria-pressed="' + (x.id === lid) + '">' + esc(x.short) + '</button>';
    }).join('') + '</div>' : '');
  }
  /** Clasificación de cualquier liga: país (abreviatura) y división. */
  function renderTable6(c) {
    var k = C().myClub(c), lid = tblLid && C().league(tblLid) ? tblLid : k.lid, L = C().league(lid), t = C().table(c, lid);
    var L2 = C().league(L.cc + '2'), L1 = C().league(L.cc + '1'), n1 = L1 ? C().leagueClubs(c, L1.id).length : 0, n2 = L2 ? C().leagueClubs(c, L2.id).length : 0, mv = L2 && n1 >= 6 && n2 >= 4 ? 2 : L2 ? 1 : 0;
    var comps = C().intlFor(c, L.cc), W = C().weeksOf(c, lid);
    var h = '<div class="card">' + lgSw6(c, lid) +
      '<h3>' + sp([esc(L.name), esc(L.country), c.phase === 'league' ? 'Jornada ' + Math.min(c.week, W) + ' de ' + W : 'Liga regular acabada'], 'd') + '</h3>' +
      '<table><thead><tr><th class="l">#</th><th class="l">Club</th><th>PJ</th><th>G</th><th>P</th><th class="hide-s">Sets</th><th class="hide-s">Puntos</th><th>Pts</th></tr></thead><tbody>';
    t.forEach(function (r) {
      var cl = C().club(c, r.id), cls = [];
      if (r.id === c.myClub) cls.push('me');
      if (L.lvl === 2 && r.pos <= mv) cls.push('up'); else if (L.lvl === 1 && comps.some(function (cp) { return r.pos > cp.rank * 2 - 2 && r.pos <= cp.rank * 2; })) cls.push('cup');
      if (L.lvl === 1 && mv && r.pos > t.length - mv) cls.push('down');
      h += '<tr class="' + cls.join(' ') + '"><td class="l">' + r.pos + '</td><td class="club">' + crest(cl, 22, c) + (WUI() ? '<button class="cw-tl-b" data-act="cw-club" data-id="' + r.id + '" aria-label="Ficha de ' + esc(cl.name) + '">' + esc(PH() ? shortClub(cl) : cl.name) + '</button>' : esc(PH() ? shortClub(cl) : cl.name)) + '</td><td>' + r.pj + '</td><td>' + r.g + '</td><td>' + r.p + '</td><td class="hide-s">' + r.sf + '-' + r.sc + '</td><td class="hide-s">' + r.pf + '-' + r.pc + '</td><td class="pts">' + r.pts + '</td></tr>';
    });
    var tags = [];
    if (L.lvl === 2 && mv) tags.push('<span class="tag g">' + (mv === 2 ? '1-2 ascienden' : '1º asciende') + '</span>');
    if (L.lvl === 1) comps.forEach(function (cp) { tags.push('<span class="tag y">' + (cp.rank * 2 - 1) + '-' + cp.rank * 2 + ': ' + esc(cp.name) + '</span>'); });
    if (L.lvl === 1 && mv) tags.push('<span class="tag r">' + (mv === 2 ? 'Los 2 últimos descienden' : 'El último desciende') + '</span>');
    h += '</tbody></table><p class="muted" style="margin-top:8px">' + tags.join('') + ' Puntos: 3 por ganar 2-0, 2 por ganar 2-1 y 1 por perder 1-2.' +
      (W === (t.length - 1 + t.length % 2) ? ' Liga a una vuelta.' : ' Liga a doble vuelta.') + '</p></div>';
    return h;
  }
  function renderCal6(c) {
    var k = C().myClub(c), L = C().league(k.lid), s = C().sched(c, k.lid), res = c.myRes && c.myRes.lid === k.lid ? c.myRes.w : [], up = 0;
    var h = '<div class="card"><h3>' + sp(['Calendario', esc(L.name)], 'd') + '</h3><div class="cal">';
    s.forEach(function (wk, w) {
      var m = null, i; for (i = 0; i < wk.length; i++) if (wk[i][0] === k.id || wk[i][1] === k.id) { m = wk[i]; break; }
      var nx = c.phase === 'league' && w === c.week;
      if (!m) { h += '<div class="cal-r"><b>J' + (w + 1) + '</b><span class="muted">Descansas</span><span></span></div>'; return; }
      var home = m[0] === k.id, rv = C().club(c, home ? m[1] : m[0]), r = res[w] && res[w][i], out = '';
      if (r) { var mine = r.a === k.id ? r.s : [r.s[1], r.s[0]], win = mine[0] > mine[1]; out = '<span class="res ' + (win ? 'w' : 'l') + '">' + (win ? 'G ' : 'P ') + mine[0] + '-' + mine[1] + '</span>'; }
      else out = calTag(c, c.phase === 'league' && w >= c.week && up++ < 3 ? { rival: rv, me: k, atHome: home, kind: 'league', week: w, lid: k.lid } : null, '<span class="muted">' + (nx ? 'Próximo' : w < c.week || c.phase !== 'league' ? '—' : 'Pendiente') + '</span>');
      h += '<div class="cal-r' + (nx ? ' next' : '') + '"><b>J' + (w + 1) + '</b><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + crest(rv, 22, c) + (home ? 'vs ' : 'en ') + esc(PH() ? shortClub(rv) : rv.name) + '</span>' + out + '</div>';
    });
    return h + '</div><p class="muted" style="margin-top:8px">Al acabar la liga: copas (Liga › Copas).</p></div>';
  }
  /** Copas de la temporada: la nacional y las internacionales de tu región (eliminatorias a un partido). */
  function renderCups6(c) {
    var k = C().myClub(c), L = C().league(k.lid), comps = C().intlFor(c, k.cc), cn = c.cups && c.cups[k.cc];
    if (!c.kos || !c.kos.length) {
      return '<div class="card"><h3>Copas</h3><p>Se juegan al acabar la liga regular, a un partido:</p><p class="muted">' +
        sp(['<b>' + esc(cn ? cn.name : 'Copa Nacional') + '</b>: ' + (C().league(k.cc + '2') ? 'los 6 primeros de la 1ª y los 2 primeros de la 2ª' : 'los 8 primeros de la 1ª')].concat(comps.map(function (cp) {
          return '<b>' + esc(cp.name) + '</b>: ' + ordn(cp.rank * 2 - 1) + ' y ' + ordn(cp.rank * 2) + ' de cada 1ª ' + (cp.zone ? 'de tu zona' : 'de la región') + ' (' + esc(L.region) + ')';
        })), 'v') + '</p></div>';
    }
    var nm = function (id) { var x = C().club(c, id); return x ? (id === k.id ? '<b>' + esc(x.short) + '</b>' : esc(x.short)) : '?'; };
    return c.kos.map(function (ko, j) {
      var mine = ko.ids.indexOf(k.id) >= 0;
      return '<div class="card"><h3>' + sp([esc(ko.name), ko.kind === 'cup' ? esc(L.country) : esc(L.region), mine ? 'Juegas' : ''], 'd') + '</h3>' +
        ko.rounds.map(function (rd, ri) {
          return '<p><span class="muted">' + C().roundName(rd.length) + ':</span> ' + sp(rd.map(function (m, mi) { var r = ko.res[ri] && ko.res[ri][mi]; return nm(m[0]) + (r ? ' ' + r.s[0] + '-' + r.s[1] + ' ' : ' — ') + nm(m[1]); }), 'v') + '</p>';
        }).join('') + (ko.champion >= 0 ? '<p><span class="tag y">Campeón</span> ' + esc(C().club(c, ko.champion).name) + '</p>' : j > c.koI ? '<p class="muted">Pendiente</p>' : '') + '</div>';
    }).join('');
  }
  function renderClubInfo6(c) {
    var k = C().myClub(c), f = C().clubInfo(c, k), coach = c.coach, cc = coach < 30 ? '#d8364a' : coach < 50 ? '#e07b2b' : coach < 70 ? '#d9a520' : '#2fbf71', ref = C().REF[C().ref(f.strength)];
    return '<div class="card"><div class="row">' + crest(k, 72, c) + '<div class="grow" style="min-width:0"><p class="bigname">' + esc(k.name) + '</p>' +
      '<p class="muted" style="margin:2px 0 0">' + sp([stars(f.stars), esc(f.league), esc(f.country)], 'v') + '</p></div></div>' +
      '<div class="fact">' + fact('Media del club', k.ovr) + fact('Posición', c.phase === 'league' && c.week === 0 ? '—' : ordn(C().posOf(c, k.id))) + fact('Ciudad', esc(k.city || '—')) +
      fact('Liga', esc(f.league) + ' <span class="muted">(nivel ' + f.strength + ')</span>') + fact('Estilo', esc(f.style) + styleTrain(f.style)) + fact('Colores', kitDots(k.kit) + ' <span class="muted">camiseta, 2º color y líbero</span>') +
      fact('Tu puesto', esc(posName(c.player.roleKey))) + fact('Objetivo', esc(c.objective.text)) + fact('Arbitraje', esc(ref.name)) + '</div>' +
      '<h3 style="margin-top:10px">' + sp(['Entrenador', esc(C().coachText(coach))], 'd') + '</h3>' + meter(coach, 'Confianza del entrenador', cc) +
      '<p class="muted">' + sp(['Nota media de la temporada: ' + dec(C().avgNota(c)), 'Forma (3 últimos): ' + dec(C().form(c))], 'v') + '</p></div>';
  }
  /** Club › Equipo: la plantilla (jugadores inventados) y la química del equipo. */
  function renderTeam6(c) {
    var k = C().myClub(c), ro = C().roster(c, k), ch = c.chem | 0, cb = C().chemBonus(c), H6 = C().hall || {};
    // titularidad: la plantilla por puestos con el estado de la jornada (Titular / Suplente / Fuera) y tu sitio en tu puesto
    var dn = H6.depthNow ? H6.depthNow(c) : null, PL = { S: 'colocadores', OPP: 'opuestos', OH: 'receptores', MB: 'centrales', L: 'líberos' }, myPos = C().ctrlRole(c);
    var STL = { start: ['Titular', 'g'], sub: ['Suplente', ''], out: ['Fuera', 'r'] };
    var head = dn && dn.k ? '<p>' + 'Tu puesto: <b>' + ordn(dn.k) + ' de ' + dn.n + '</b> ' + esc(PL[myPos] || '') + '.' +
      (dn.stat !== 'start' && dn.ahead.length ? ' Para salir de inicio tienes que superar a ' + esc(dn.ahead[dn.ahead.length - 1]) + '.' : '') + '</p>' : '';
    var h = '<div class="card"><h3>' + sp(['Equipo', esc(k.short)], 'd') + '</h3>' + head, last = '';
    ro.forEach(function (p) {
      if (p.pos !== last) { last = p.pos; h += '<p class="muted" style="margin:10px 0 2px;font-weight:700">' + esc(posName(p.pos)) + '</p>'; }
      var tg = STL[p.stat] || STL.sub;
      h += '<div class="mate"' + (p.me ? ' style="background:rgba(255,128,64,.18);border-radius:10px;padding-left:8px"' : '') + '><div style="min-width:0"><b class="cr-mn">' + sp([esc(p.name), 'n.º ' + p.num], 's') + '</b>' +
        '<p class="muted" style="margin:2px 0 0">' + sp(['Media ' + p.ovr, 'Forma: ' + esc(formTxt6(p.form)), p.me ? 'Tú' : ''], 'c') + ' <span class="tag ' + tg[1] + '">' + tg[0] + '</span></p></div></div>';
    });
    h += '<p class="muted" style="margin-top:8px">El entrenador elige el seis de cada jornada por media, forma, confianza, fatiga y la impresión de tus entrenos (lo que haces en pista cuenta: esta temporada tu media vale ' + (H6.meEdge ? H6.meEdge(c) : H6.ME_EDGE || 12) + ' más en su elección; la ventaja baja ' + (H6.ME_EDGE_STEP || 2) + ' cada temporada hasta ' + (H6.ME_EDGE_MIN || 4) + ').</p>';
    var ci = null; try { ci = LIFE() ? LIFE().chemInfo(c) : null; } catch (e) { ci = null; }
    return h + '</div><div class="card"><h3>' + sp(['Química', ci ? esc(ci.name) : ch + ' de 100'], 'd') + '</h3>' + meter(ch, 'Química del equipo', '#4be0a0', ci ? CHEM_MK : null) + chemNext(ci) +
      '<p class="muted">Sube cada partido (+5 jugado, +3 simulado, +2 en el banquillo) y en verano se pierde una parte. ' + (cb ? 'Ahora suma +' + cb + ' a todo el equipo en reacción, colocación y recepción.' : 'A partir de 30 suma +1 a todo el equipo en reacción, colocación y recepción (hasta +3).') + ' Al fichar por otro club empieza de cero.</p></div>';
  }
  /** Profundidad de tu puesto en el club de una oferta (titularidad): «Serías titular» o «Competencia: X (66) y Y (63)». */
  function depthTxt6(d) {
    if (d.start) return 'Serías titular' + (d.gap < 3 ? ' <span class="muted">(con el puesto disputado)</span>' : '');
    var a = d.ahead.map(function (x) { return esc(x.name) + ' (' + x.ovr + ')'; });
    var last = d.ahead.length ? d.ahead[d.ahead.length - 1].name : '', y = /^h?[ií]/i.test(last) && !/^h?i[aeoáéó]/i.test(last) ? ' e ' : ' y ';
    return 'Competencia: ' + (a.length > 1 ? a.slice(0, -1).join(', ') + y + a[a.length - 1] : a[0] || '—') + ' <span class="muted">(serías ' + ordn(d.rank) + ')</span>';
  }
  /** Ficha de una oferta de pista: país, liga y su nivel, club, puesto, rol prometido, sueldo, contrato. */
  function offerCard6(c, o, i, full) {
    var k = C().club(c, o.club), f = C().clubInfo(c, k, o.lid, o.ovr), y = yrs[o.club] || o.years || 1;
    var h = '<div class="' + (full ? 'card offer-full' : 'offer-x') + '"' + (full ? '' : ' style="padding:8px 0;border-top:1px solid rgba(255,255,255,.1)"') + '><div class="row">' + crest(k, full ? 56 : 40, c) +
      '<div class="grow" style="min-width:0">' + offName(k, full) + '<p class="muted" style="margin:2px 0 0">' +
      sp([stars(f.stars), esc(f.league), esc(f.country)], 'v') + (o.foreign ? ' <span class="tag y">Extranjero</span>' : '') + (o.scout ? ' <span class="tag g">Te vio un ojeador</span>' : '') + '</p></div></div>';
    var rl = Math.max(0, C().ROLE_LV.indexOf(o.role)), early = !o.trial && C().earlyExit && C().earlyExit(c), oh = full && PH();
    // (móvil: país y liga ya van en la línea de debajo del nombre; media, objetivo, rol y sueldo, en las cifras de arriba)
    if (oh) h += offHeros(o, o.ovr, o.trial ? 1 : y);
    h += '<div class="fact">' + (oh ? '' : fact('País', esc(f.country)) + fact('Liga', esc(f.league) + ' <span class="muted">(nivel ' + f.strength + ')</span>') + fact('Media del club', o.ovr)) +
      fact('Puesto', esc(posName(c.player.roleKey))) + (o.depth ? fact('Tu sitio', depthTxt6(o.depth)) : '') + fact('Estilo', esc(f.style) + styleTrain(f.style)) + (o.objective && !oh ? fact('Objetivo', esc(o.objective)) : '') +
      fact('Rol prometido', esc(o.role) + (o.firm ? ' <span class="muted">(firme)</span>' : '') + ' <span class="muted">(entrenador: ' + (C().ROLE_COACH[rl] - (early ? C().EARLY_COACH : 0) - (o.negNo ? C().NEG_COACH : 0)) + ' de confianza)</span>') +
      (oh && !(c.contract && c.contract.salary && c.phase !== 'pick') ? '' : fact('Sueldo (ficticio)', money(o.salary) + (c.contract && c.contract.salary && c.phase !== 'pick' ? ' <span class="muted">(ahora ' + eur(c.contract.salary) + ')</span>' : ''))) + '</div>';
    if (!o.trial) h += '<p class="muted" style="margin:0 0 6px"><b>' + esc(o.role) + ':</b> ' + esc(C().ROLE_HINT[rl]) + '</p>';
    if (early) h += '<p class="muted"><b>Tienes contrato en vigor:</b> si fichas, el club de ahora pone pegas y el entrenador nuevo empieza con ' + C().EARLY_COACH + ' menos de confianza (no pasa si te declaras transferible en Club › Contrato).</p>';
    if (o.negNo) h += '<p class="muted">Negociación rechazada: si firmas, el entrenador empieza con ' + C().NEG_COACH + ' menos de confianza.</p>';
    if (o.trial) h += trialLine(c, o) + '<p class="muted">Si no la superas, pierdes esta oferta' + (c.phase === 'pick' ? ' y sigues con las demás' : '') + '. Contrato de 1 temporada. Titulares mejores que tú y ' + (trialAI(c, o) || 'la IA un nivel por encima') + '.</p>';
    else h += '<p class="muted" style="margin-top:6px">Duración del contrato:</p>' + yearsSeg(o.club, y);
    var canNeg = !o.trial && !o.firm && o.role !== 'Titular indiscutible';
    if (offArm === i && c.window === 'mid') {
      var mk = C().myClub(c);
      return h + '<div class="confirm" role="alertdialog" aria-label="Confirmar fichaje"><p><b>¿Fichar ya por ' + esc(k.name) + '?</b> Dejas ' + esc(mk.name) + ' a mitad de temporada y juegas lo que queda en la ' + esc(f.league) + (o.foreign ? ' (' + esc(f.country) + ')' : '') + ' con su calendario (química desde cero). ' +
        (early ? 'Sales con contrato en vigor: el entrenador nuevo empieza con ' + C().EARLY_COACH + ' menos de confianza. ' : '') + 'No se puede deshacer.</p>' +
        '<div class="acts"><button class="pri" data-act="offer" data-i="' + i + '">Sí, fichar</button><button data-act="offno">Cancelar</button></div></div></div>';
    }
    h += '<div class="acts"><button class="pri" data-act="offer" data-i="' + i + '">' + (o.trial ? 'Hacer la prueba' : 'Firmar') + '</button>' +
      (canNeg ? '<button data-act="neg" data-i="' + i + '" title="Si no sale, el entrenador empieza con menos confianza">Pedir más rol</button>' : '') + '</div></div>';
    return h;
  }
  var REG_ORDER = ['Europa', 'América', 'Asia'];
  /** Países ordenados por continente (Europa, América, Asia) y, dentro, por nivel (tier) y nombre. */
  function sortCountries(cos) {
    var ri = function (r) { var i = REG_ORDER.indexOf(r); return i < 0 ? 9 : i; };
    return cos.slice().sort(function (a, b) { return ri(a.region) - ri(b.region) || (a.tier || 9) - (b.tier || 9) || String(a.country).localeCompare(String(b.country), 'es'); });
  }
  /** Selector de país al crear: un grupo por continente con botones compactos (los 28 países caben en el móvil). */
  function countryPick(cos) {
    var s = sortCountries(cos), regs = [];
    s.forEach(function (x) { if (regs.indexOf(x.region) < 0) regs.push(x.region); });
    return regs.map(function (r) {
      return (regs.length > 1 && r ? '<p class="muted cc-reg">' + esc(r) + '</p>' : '') + '<div class="lg-sw" role="group" aria-label="' + esc('País' + (r ? ', ' + r : '')) + '">' + s.filter(function (x) { return x.region === r; }).map(function (x) {
        return '<button data-act="country" data-cc="' + esc(x.code) + '" aria-pressed="' + (x.code === form.country) + '">' + esc(x.country) + '</button>';
      }).join('') + '</div>';
    }).join('');
  }
  function renderCreate6(c) {
    var H6 = C().hall, cos = H6.countries(), ps = H6.positions();
    if (!cos.some(function (x) { return x.code === form.country; })) form.country = cos.some(function (x) { return x.code === 'ES'; }) ? 'ES' : (cos[0] && cos[0].code);
    if (ps.indexOf(form.pos) < 0) form.pos = ps[0];
    var st = C().genSt(H6.START_OVR, form.pos, null), P = VB.Prog, co = cos.filter(function (x) { return x.code === form.country; })[0] || {}, P6 = C().POS6;
    head.innerHTML = backB(c ? 'hub' : 'close', 'Volver', 'Volver') + '<div class="cr-title"><small>' + sp(['Carrera', 'Pista 6 contra 6'], 'd') + '</small><b>Crea tu jugador</b></div>';
    tabsEl.hidden = true; tabsEl.innerHTML = ''; subEl.hidden = true; subEl.innerHTML = '';
    var has = C().has('hall');
    var h = '<div class="cf">' + modeSeg() + (!has && H6.lost() ? '<div class="card confirm"><p><b>Tu Carrera de pista guardada estaba dañada</b> y no se ha podido recuperar. Hay una copia aparte en este dispositivo (make-the-cut.career6.bak).</p></div>' : '') +
      '<div class="card"><p>Vóley de pista, 6 contra 6, en el pabellón. Empiezas con una media de ' + H6.START_OVR + ' en un club modesto de tu país' + (co.divs > 1 ? ' (2ª división, o una prueba en la 1ª)' : '') + '. Liga por jornadas, copa nacional y, si tu club se clasifica, copas internacionales. Ascensos y descensos. Si destacas, los ojeadores de las ligas fuertes (también de fuera) te ficharán. Controlas solo a tu jugador, en su puesto.' +
      (VB.Leagues && VB.Leagues.provisional ? ' <span class="tag y">Ligas provisionales</span>' : '') + '</p></div>' +
      '<div class="cf-col"><div><label for="crName">Nombre</label><input id="crName" maxlength="18" autocomplete="off" spellcheck="false" placeholder="Tu nombre" value="' + esc(form.name) + '"></div>' +
      '<div><label>Dorsal</label><div class="stp"><button data-act="num" data-d="-1" aria-label="Dorsal anterior">−</button><b aria-live="polite">' + form.num + '</b><button data-act="num" data-d="1" aria-label="Dorsal siguiente">+</button></div></div>' +
      '<div><label>Puesto</label><div class="roles" role="group" aria-label="Puesto">' + ps.map(function (k) {
        return '<button data-act="pos" data-p="' + k + '" aria-pressed="' + (form.pos === k) + '">' + esc(P6[k].name) + '<small>' + esc(P6[k].hint) + '</small></button>';
      }).join('') + '</div>' + (ps.length < 4 ? '<p class="muted" style="margin:6px 0 0">Colocador, opuesto y central llegarán pronto: la lista crece sola.</p>' : '') +
      '<div class="prev" style="margin-top:8px">' + C().KEYS.map(function (k) { return '<span>' + esc(P && P.LABEL ? P.LABEL[k] : k) + ' <b>' + st[k] + '</b></span>'; }).join('') + '</div></div></div>' +
      '<div class="cf-col"><div><label>País</label>' + countryPick(cos) + '</div>' + (CD() ? createDiff() : '') +
      '<div><label>Puntos por set</label><div class="seg" role="group" aria-label="Puntos por set">' + H6.POINTS.map(function (v) {
        return '<button data-act="pts6" data-v="' + v + '" aria-pressed="' + (form.pts6 === v) + '">' + v + '</button>';
      }).join('') + '</div><p class="muted" style="margin:6px 0 0">Al mejor de 3 sets; el tercero, a 15. Con 15 la temporada se juega más rápido.</p></div>' + lookRow() +
      (has ? '<div class="card confirm"><p>Ya tienes una Carrera de pista. Para empezar otra, abandónala antes en Palmarés › Opciones.</p><div class="acts"><button class="pri" data-act="openmode" data-m="hall">Abrir la Carrera de pista</button></div></div>' :
        '<div class="acts"><button class="pri" data-act="create">Crear y ver ofertas</button></div>') +
      '</div></div>';
    body.innerHTML = h;
  }

  // ---------------------------------------------------------------- prueba con partidillo (P4, 15-nov-2026)
  // «Hacer la prueba» abre la previa (trialI = índice de la oferta): el club, «1 set a 15» con los petos, los 3 objetivos del cuerpo
  // técnico (VB.Career.trialGoals), «Saltar a la pista» (main.js startCareerTrial) y «Simular» (VB.Career.trialSim, con el 70 % de la
  // probabilidad). Al volver de la prueba (main.js toMenu → open('pick' | 'hub', {trialRes})) o tras simularla, la tarjeta del
  // resultado (trialRes, una vez); en la fase de elegir club, si no, el último resultado guardado (c.pick.res) en corto.
  var trialI = -1, trialRes = null, dbgTrial = null;
  var BIB_DEF = [0xff7a1a, 0x9be52e];   // (players.js BIB.a / BIB.b, por si no está cargado)
  /** Lo que pinta la previa de la prueba de la oferta i (también la escena de depuración, con datos de muestra). */
  function trialInfo(c, i) {
    var o = c.offers[i], k = C().club(c, o.club), hall = isHall(c);
    var f = hall ? C().clubInfo(c, k, o.lid, o.ovr) : C().clubInfo(c, k, o.lvl != null ? o.lvl : k.lvl, o.q);
    var pr = C().trialSimChance ? C().trialSimChance(o) : o.chance * 0.7, pend = trialHalf(c, o) ? 1 : 0;
    return { i: i, hall: hall, club: k, name: k.name, kit: k.kit || {}, stars: f.stars, league: f.league, place: hall ? f.country : (f.beach || k.city), ovr: o.ovr != null ? o.ovr : f.ovr,
      goals: C().trialGoals ? C().trialGoals(c, o) : [], pct: Math.round(pr * 100), pts: C().TRIAL_PTS || 15, mate: !hall && o.mateP ? o.mateP.name : '',
      player: c.player.name, ovrMe: C().playerOvr(c), pend: pend, ai: trialAI(c, o), when: c.phase === 'pick' ? '' : c.phase === 'off' ? 'off' : 'mid' };
  }
  /** Colores de los dos petos que se verán (players.js decide la reserva si chocan con la camiseta de entreno). */
  function trialBibs(kit) {
    var P = VB.Players, out = BIB_DEF.slice();
    if (P && P.kitFrom) {
      try {
        var st = { kitShirt: kit.shirt, kitAccent: kit.accent, kitShorts: kit.shorts, kitPattern: kit.pattern, scrim: {} };
        var a = P.kitFrom(st), b = P.kitFrom(Object.assign({}, st, { team: 1 }));
        if (a && typeof a.bib === 'number') out[0] = a.bib; if (b && typeof b.bib === 'number') out[1] = b.bib;
        if (a && typeof a.base === 'number') out.base = a.base;
      } catch (e) { }
    }
    return out;
  }
  function bibSw(col, base) {
    var bc = hex(col), bs = typeof base === 'number' ? hex(base) : '#8a8f98';
    return '<i class="tp-bib" style="background:linear-gradient(90deg,' + bs + ' 0 16%,' + bc + ' 16% 84%,' + bs + ' 84%)" aria-hidden="true"></i>';
  }
  function renderTrialPre(t) {
    head.innerHTML = backB('trial-back', 'Ofertas', 'Volver a las ofertas') +
      '<div class="cr-title"><small>' + sp(['Carrera', 'Prueba'], 'd') + '</small><b>' + sp(PH() ? [esc(t.player)] : [esc(t.player), esc(t.name)], 's') + '</b></div>' +   // (móvil: el club ya es el título de la ficha)
      ovrStamp(t.ovrMe);
    tabsEl.hidden = true; subEl.hidden = true;
    var bb = trialBibs(t.kit), tpc = typeof t.kit.shirt === 'number' ? hex(t.kit.shirt) : '#3a3168';
    // el escudo del club, como en ofertas y fichas (la muestra de la camiseta sola parecía un icono roto); sin escudos, la camiseta
    var cw = t.club ? crest(t.club, 56) : '', tcr = cw && cw.indexOf('<svg') === 0 ? '<span class="tp-crest" style="flex:none;display:flex">' + cw + '</span>' : kitSw(t.kit, true);
    var h = '<div class="card tp new"><div class="tp-hero" style="--tpc:' + tpc + '">' + tcr +
      '<div style="min-width:0"><small>Partidillo de prueba</small><b>' + esc(t.name) + '</b><span class="muted">' + sp([stars(t.stars), esc(t.league), esc(t.place)], 'v') + '</span></div></div>' +
      '<p class="tp-eye">El cuerpo técnico de ' + esc(t.name) + ' te observa.</p>' +
      '<p class="tp-fmt">' + sp(['1 set a ' + t.pts, { h: 'con petos <span class="tp-bibs">' + bibSw(bb[0], bb.base) + bibSw(bb[1], bb.base) + '</span>' }], 'v') + '</p>' +
      '<p class="muted">' + (t.hall ? 'Juegas en tu puesto con los suplentes del club contra sus titulares, en el pabellón' + (t.ai ? ' (' + t.ai + ')' : '') + '.'
        : 'Juegas con tu pareja de prueba' + (t.mate ? ', ' + esc(t.mate) + ',' : '') + ' contra una pareja del club, en la arena' + (t.ai ? ' (' + t.ai + ')' : '') + '.') +
      (t.when === 'off' ? ' Si te fichan, juegas con ellos la temporada que viene.' : t.when === 'mid' ? ' Si te fichan, te vas ya: lo que queda de temporada, con ellos.' : '') + '</p>' +
      '<h3 class="tp-gh" style="margin-top:10px">Objetivos del entrenador</h3><ol class="tp-goals" aria-label="Objetivos del entrenador">' + t.goals.map(function (g, j) { return '<li><i>' + (j + 1) + '</i>' + esc(g.txt) + '</li>'; }).join('') + '</ol>' +
      '<p class="muted">Hace falta nota B: con A+, A o B te fichan; con C decide la suerte (ganar el partidillo ayuda un poco); con D o F no te quedas. Cada objetivo cumplido sube la nota. Si reinicias o abandonas, pierdes la prueba' +
      (t.pend ? ' (la tienes a medias de antes: puedes jugarla una vez más)' : '') + '.</p>' +
      '<div class="tp-acts"><button class="pri" data-act="trial-play" data-i="' + t.i + '">Saltar a la pista</button>' +
      '<button data-act="trial-sim" data-i="' + t.i + '">Simular<small>(prob. ' + t.pct + ' %)</small></button></div></div>';
    body.innerHTML = h;
  }
  /** «Saltar a la pista»: cierra la Carrera y main.js arranca el partidillo (al acabar vuelve aquí: ofertas o tu club nuevo). */
  function trialGo(i) {
    var go = function () { if (VB.ctx && VB.ctx.actions && VB.ctx.actions.startCareerTrial) VB.ctx.actions.startCareerTrial(i); };
    close(true);
    var w = false; try { w = !!(VB.UI && VB.UI.wipe && VB.UI.wipe(2, go)); } catch (e) { w = false; }
    if (!w) go();
  }
  /** Tarjeta del resultado de una prueba (r = trialDone / trialSim; una vez, al volver de ella): letra, veredicto y objetivos. */
  function trialResCard(c, r) {
    if (!r || !r.letter) return '';
    var L = String(r.letter), lc = L === 'A+' || L === 'A' ? 'a' : L === 'B' ? 'b' : L === 'C' ? 'c' : 'd', left = r.left | 0, nm = r.clubName || (C().club(c, r.club) || {}).name || '';
    var why = r.pass ? (nm ? esc(nm) + ' te ficha: 1 temporada de contrato. ' : '') + (r.sim ? 'Informe del cuerpo técnico (prueba simulada).' : '')
      : (r.sim ? 'Informe del cuerpo técnico (prueba simulada). ' : '') + 'Te ' + (left === 1 ? 'queda 1 oferta' : 'quedan ' + left + ' ofertas') + '.';
    if (r.luck) why += r.pass ? ' Con C decidía la suerte, y ha salido de cara.' : ' Con C decidía la suerte, y no ha salido.';
    // suspendida por dejarla a medias (reiniciar, abandonar o cerrar a mitad: r.forfeit, VB.Career.trialForfeit / trialStale)
    if (r.forfeit) why = 'Prueba suspendida con ' + (nm ? esc(nm) : 'el club') + ': la dejaste a medias. Te ' + (left === 1 ? 'queda 1 oferta' : 'quedan ' + left + ' ofertas') + '.';
    var gl = (r.goals || []).filter(function (g) { return g && g.ok != null; });
    return '<div class="card tp-res new"><h3>' + sp(['Prueba', esc(nm)], 'd') + '</h3><div class="row"><div class="et-l l-' + lc + '" aria-label="Nota ' + esc(L) + '"><b>' + esc(L) + '</b><small>' +
      (r.forfeit ? '—' : r.nota != null ? dec(r.nota) : 'INFORME') + '</small></div><div class="grow" style="min-width:0"><p class="bigname">' + (r.pass && !r.forfeit ? '¡Te fichan!' : 'Esta vez no') + '</p><p>' + why + '</p></div></div>' +
      (gl.length ? '<div class="et-goals">' + gl.map(function (g) {
        return '<span class="' + (g.ok ? 'ok' : 'no') + '"><i aria-hidden="true">' + (g.ok ? '✓' : '✗') + '</i>' + esc(g.txt) + (g.v != null ? ' (' + (g.v | 0) + ')' : '') + '<span class="sr">' + (g.ok ? ', cumplido' : ', no cumplido') + '</span></span>';
      }).join('') + '</div>' : '') + '</div>';
  }
  /** Resultado de la prueba que toca enseñar (una sola vez). */
  function takeTrialRes(c) { var r = trialRes; trialRes = null; return r ? trialResCard(c, r) : ''; }

  // ---------------------------------------------------------------- elegir club (inicio sin club)
  /** Una pestaña por oferta (ficha completa) y «Comparar» (tabla). Debajo: pedir más tiempo / rechazar todas. */
  function renderPick(c) {
    var offs = c.offers || [];
    if (trialI >= 0) { if (offs[trialI] && offs[trialI].trial) { renderTrialPre(trialInfo(c, trialI)); return; } trialI = -1; }   // previa de la prueba
    if (sub.pick !== 'cmp' && !(+sub.pick >= 0 && +sub.pick < offs.length)) sub.pick = 0;
    head.innerHTML = backBtn() + ptHTML(c, 'me', 44, 'cr-pt', 'Retrato de ' + c.player.name) +
      '<div class="cr-title"><small>' + sp(['Carrera', 'Temporada 1', 'Ofertas'], 'd') + '</small><b>' + sp([esc(c.player.name), 'Elige club'], 's') + '</b></div>' +
      ovrStamp(C().playerOvr(c));
    tabsEl.hidden = false;
    // una pestaña por oferta con el nombre del club (antes tres letras: «SAL · PRUEBA», «ARE»…) y «Comparar»
    tabsEl.setAttribute('data-ph-tabs', 'strip');   // (móvil: la tira de ofertas)
    // REV-8: el nombre corto del club también en PC (con el largo, la última pestaña quedaba cortada bajo la tecla E)
    drawBar('tab', offs.map(function (o, i) { var k = C().club(c, o.club); return [i, esc(shortClub(k)) + (o.trial ? ' (prueba)' : ''), false]; }).concat([['cmp', 'Comparar', false]]), sub.pick);
    subEl.hidden = true;
    var h = '';
    if (sub.pick === 'cmp') {
      h += '<div class="card"><h3>Comparar ofertas</h3><table><thead><tr><th class="l">Club</th><th class="hide-s">Liga</th><th>Media</th><th>' + (isHall(c) ? 'País' : 'Compañero') + '</th><th class="hide-s">Rol</th><th class="hide-s">Objetivo</th><th>Sueldo</th><th class="hide-s">Años</th><th></th></tr></thead><tbody>' +
        offs.map(function (o, i) {
          var k = C().club(c, o.club), f = C().clubInfo(c, k);
          return '<tr><td class="club">' + crest(k, 22, c) + esc(k.name) + '<br><span class="muted">' + stars(f.stars) + '</span></td><td class="hide-s nw">' + esc(isHall(c) ? C().league(o.lid).short : C().league(o.lvl).short) + (o.trial ? '&nbsp;(prueba)' : '') + '</td><td>' + o.ovr + '</td><td>' + (isHall(c) ? esc(C().league(o.lid).country) : o.mate + (o.ovr != null && o.mate != null ? ' <span class="muted">(' + sgn(o.mate - o.ovr) + ')</span>' : '')) +
            '</td><td class="hide-s">' + esc(o.role) + '</td><td class="hide-s l">' + esc(objShort(o.objective)) + '</td><td class="nw">' + Math.round(o.salary) + '&nbsp;€/mes</td><td class="hide-s">' + (o.trial ? 1 : (yrs[o.club] || o.years || 1)) +
            '</td><td><button data-sub="' + i + '" aria-label="Ver ' + esc(k.name) + '">Ver</button></td></tr>';
        }).join('') + '</tbody></table><p class="muted">Sueldo ficticio, en euros al mes. Los años del contrato los eliges al firmar.</p></div>';
    } else if (offs.length) h += offerCard(c, offs[+sub.pick], +sub.pick, true);
    // resultado de la prueba: el que acaba de pasar (arriba del todo, con los objetivos) o, si no, el último guardado en corto
    var trc = takeTrialRes(c), prs = c.pick && c.pick.res;
    if (trc) h = trc + h;
    else if (prs && prs.letter && C().club(c, prs.club)) h += '<p class="muted">' + sp(['Última prueba: ' + esc(C().club(c, prs.club).name), 'nota ' + esc(prs.letter) + (prs.sim ? ' (simulada)' : ''), prs.pass ? 'superada' : prs.forfeit ? 'suspendida (la dejaste a medias)' : 'no superada'], 'v') + '</p>';
    h += '<p class="note" role="status" aria-live="polite">' + esc(note) + '</p>';
    note = '';
    // lo último que te ha dicho tu agente (en esta fase no hay bandeja: antes se leía después de firmar, cuando ya no servía)
    var lm = (c.inbox || []).slice(-1)[0];
    if (lm) { h += '<div class="card">' + msgHTML(lm) + '</div>'; if (!lm.r && C().readMsg) C().readMsg(lm.id); }
    var armed = rejArm && performance.now() - rejArm < 3000;
    h += '<div class="card"><h3>¿Ninguna te convence?</h3><p class="muted">' + (c.pick.more ? 'Ya has pedido más tiempo.' : 'Si pides más tiempo, el club con menos interés retira su oferta y llama otro.') +
      ' Si rechazas todas, se pierden para siempre' + (offs.some(function (o) { return o.trial; }) ? ' (también la prueba)' : '') + ' y llegan otras de clubes más modestos' + (isHall(c) ? '' : ' ' + esc(deL(C().league(0)))) + ', aunque con algo más de interés por ti.</p><div class="pick-acts">' + (c.pick.more ? '' : '<button data-act="more">Pedir más tiempo</button>') +
      '<button class="warn" data-act="reject">' + (armed ? (device() === 'touch' ? 'Toca otra vez para rechazarlas' : 'Pulsa otra vez para rechazarlas') : 'Rechazar todas') + '</button></div></div>';
    body.innerHTML = h;
  }

  // ---------------------------------------------------------------- crear
  /** Fila «Dificultad» de la pantalla de crear (4 botones con su ayuda; a ≤ 420 px de alto, solo la del elegido debajo). */
  function createDiff() {
    var D = CD(); if (!D[form.diff]) form.diff = 'normal';
    var hn = D[form.diff].hint;
    return '<div><label>Dificultad</label><div class="roles diffs" role="group" aria-label="Dificultad">' + DKEYS().map(function (k) {
      return '<button data-act="cdiff" data-d="' + k + '" aria-pressed="' + (form.diff === k) + '">' + esc(D[k].name) + '<small>' + esc(D[k].hint) + '</small></button>';
    }).join('') + '</div><p class="muted dh">' + esc(D[form.diff].name) + ': ' + esc(hn.charAt(0).toLowerCase() + hn.slice(1)) + '.</p>' +
      '<p class="muted" style="margin:6px 0 0">Puedes cambiarla entre partidos en Palmarés › Opciones.</p></div>';
  }
  /** Fila «Aspecto» de crear (v1 sin editor: la carrera nueva copia tu n.º 1, VB.CareerLife.initLook). */
  function lookRow() { return LOOK() ? '<div><label>Aspecto</label><p class="muted" style="margin:0">El de tu n.º 1 de Partido rápido (cámbialo luego en el vestuario).</p></div>' : ''; }
  function renderCreate(c) {
    if (!form.mode) form.mode = C().mode ? C().mode() : 'beach';
    if (form.mode === 'hall' && C().hall) { renderCreate6(c); return; }
    var B = C().beach || C();   // la ficha es de playa aunque la Carrera activa sea la de pista (la fachada mandaría league(0), START_OVR y WEEKS a la pista)
    var R = B.ROLES, st = B.genSt(B.START_OVR, form.role, null), P = VB.Prog;
    head.innerHTML = backB(c ? 'hub' : 'close', 'Volver', 'Volver') + '<div class="cr-title"><small>' + sp(['Carrera', 'Vóley playa 2 contra 2'], 'd') + '</small><b>Crea tu jugador</b></div>';
    tabsEl.hidden = true; tabsEl.innerHTML = ''; subEl.hidden = true; subEl.innerHTML = '';
    var h = '<div class="cf">' + modeSeg() + (!c && B.lost && B.lost() ? '<div class="card confirm"><p><b>Tu carrera guardada estaba dañada</b> y no se ha podido recuperar. Hay una copia aparte en este dispositivo (make-the-cut.career.bak).</p></div>' : '') +
      '<div class="card"><p>Empiezas con media ' + B.START_OVR + ' y sin club. Los clubes del <b>' + esc(B.league(0).name) + '</b> te harán ofertas: cada uno te da un compañero distinto.</p></div>' +
      '<div class="cf-col"><div><label for="crName">Nombre</label><input id="crName" maxlength="18" autocomplete="off" spellcheck="false" placeholder="Tu nombre" value="' + esc(form.name) + '"></div>' +
      '<div><label>Dorsal</label><div class="stp"><button data-act="num" data-d="-1" aria-label="Dorsal anterior">−</button><b aria-live="polite">' + form.num + '</b><button data-act="num" data-d="1" aria-label="Dorsal siguiente">+</button></div></div>' +
      '<div><label>Rol</label><div class="roles" role="group" aria-label="Rol">' + ['atk', 'uni', 'cr'].map(function (k) {
        return '<button data-act="role" data-r="' + k + '" aria-pressed="' + (form.role === k) + '">' + esc(R[k].name) + '<small>' + esc(R[k].hint) + '</small></button>';
      }).join('') + '</div><div class="card prev-box" style="margin:8px 0 0"><h3>' + sp(['Tus atributos', esc(R[form.role].name)], 'v') + '</h3><div class="prev">' + C().KEYS.map(function (k) { return '<span>' + esc(P && P.LABEL ? P.LABEL[k] : k) + ' <b>' + st[k] + '</b></span>'; }).join('') + '</div></div></div></div>' +
      '<div class="cf-col">' + (CD() ? createDiff() : '') + '<div><label>Reglas de playa</label><p class="muted" style="margin:0">' + 'Sets a ' + B.PTS + ' y el tercero a ' + B.PTS3 + '. Pista de 16 × 8, cambio de campo cada 7 puntos (5 en el tercero), el bloqueo cuenta como toque y la dejada va de nudillos. ' + B.WEEKS + ' jornadas a doble vuelta y el Open de los 4 primeros.</p></div>' + lookRow() +
      (C().has('beach') ? '<div class="card confirm"><p>Ya tienes una Carrera de playa. Para empezar otra, abandónala antes en Palmarés › Opciones.</p><div class="acts"><button class="pri" data-act="openmode" data-m="beach">Abrir la Carrera de playa</button></div></div>' :
        '<div class="acts"><button class="pri" data-act="create">Crear y ver ofertas</button></div>') +
      '</div></div>';
    body.innerHTML = h;
  }

  // =================================================================== acciones
  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b || !root.contains(b) || b.disabled) return;
    if (b.closest('.tabs')) return;   // barras de pestañas: las lleva el componente (VB.UI.tabs → onChange de drawBar)
    var act = b.getAttribute('data-act'), t = b.getAttribute('data-tab'), sv = b.getAttribute('data-sub'), c = C() && C().get();
    if (t) { setTab(t, b.getAttribute('data-s')); snd('click'); return; }
    if (sv != null) { setSub(sv); snd('click'); return; }
    if (act && act.indexOf('lf-') === 0 && LUI()) {   // vida de la Carrera (career-life-ui.js)
      var lr = LUI().act(act, b);
      if (lr === 'retired') { snd('start'); form.name = ''; form.diff = 'normal'; view = 'create'; tab = 'match'; render(); focusFirst(); syncMenu(); return; }
      if (lr) { snd('click'); keepFocus(b, render); syncMenu(); }
      return;
    }
    if (act && act.indexOf('cw-') === 0 && WUI()) {   // mundo de la Carrera (career-world-ui.js): Faro
      var wr = WUI().act(act, b);
      if (wr && wr.tab) {   // (ficha de club: a Liga › Clubes, con el foco en «‹ Clubes»)
        snd('click'); setTab(wr.tab, wr.s);
        var ft = wr.focus ? root.querySelector(wr.focus) : null; if (ft) focusEl(ft, kbNav);
        syncMenu(); return;
      }
      if (wr && wr.render) {
        snd('click'); render();
        var fb = wr.focus ? root.querySelector(wr.focus) : null;
        if (fb) focusEl(fb, kbNav); else focusFirst();
        syncMenu();
      }
      return;
    }
    if (act && act.indexOf('st-') === 0 && SUI()) {   // «Carrera con vida» (career-story-ui.js): responder, plegables, avisos, Cuánta vida…
      var sr = SUI().act(act, b);
      if (sr && sr.tab) { snd('click'); setTab(sr.tab, sr.s); var st0 = sr.focus ? root.querySelector(sr.focus) : null; if (st0) focusEl(st0, kbNav); syncMenu(); return; }
      if (sr && sr.render) {
        snd('click');
        if (sr.focus) { render(); var sf = root.querySelector(sr.focus); if (sf) focusEl(sf, kbNav); else focusFirst(); } else keepFocus(b, render);
        syncMenu(); return;
      }
      if (sr && sr.focus) {   // (st-jump: salta a una tarjeta de la pantalla, sin repintar)
        var sj = root.querySelector(sr.focus) || (sr.scroll ? root.querySelector(sr.scroll) : null);
        if (sj) { snd('click'); focusEl(sj, kbNav); try { sj.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e2) { } }
      }
      return;
    }
    switch (act) {
      case 'close': snd('back'); close(); return;
      case 'hub': snd('back'); view = 'hub'; render(); focusFirst(); return;
      case 'look-open': openLook(c); return;
      case 'num': form.num = ((form.num - 1 + (+b.getAttribute('data-d')) + 99) % 99) + 1; snd('select'); keepFocus(b, render); return;
      case 'role': form.role = b.getAttribute('data-r'); snd('select'); keepFocus(b, render); return;
      case 'cdiff': form.diff = b.getAttribute('data-d'); snd('select'); keepFocus(b, render); return;
      case 'cdiff-set': {
        var dk2 = b.getAttribute('data-d'), dr = C().setDifficulty ? C().setDifficulty(dk2) : '';
        dnote = dr === 'ok' ? 'Dificultad: ' + dName(dk2) + '. Se aplica desde el próximo partido.' : '';
        snd(dr === 'ok' ? 'toggle' : 'back'); keepFocus(b, render); syncMenu(); return;
      }
      case 'create': {
        var inp = root.querySelector('#crName'); if (inp) form.name = inp.value;
        if (!String(form.name).trim()) { if (inp) { inp.focus(); inp.placeholder = 'Escribe un nombre'; } snd('back'); return; }
        if (form.mode === 'hall') C().create({ mode: 'hall', name: form.name, num: form.num, pos: form.pos, country: form.country, points: form.pts6, diff: CD() && CD()[form.diff] ? form.diff : 'normal' });   // Carrera de pista (6v6)
        else C().create({ mode: 'beach', name: form.name, num: form.num, role: form.role, diff: CD() && CD()[form.diff] ? form.diff : 'normal' });   // (playa: siempre a 21)
        form.name = '';   // (si luego creas la otra Carrera, el nombre no viene ya puesto)
        tblLid = '';
        yrs = {}; sub.pick = 0; note = '';
        snd('start'); view = 'hub'; tab = 'match'; render(); focusFirst(); syncMenu(); return;
      }
      // ---- gestión (v2)
      case 'yrs': yrs[b.getAttribute('data-key')] = +b.getAttribute('data-y'); snd('select'); keepFocus(b, render); return;
      case 'more': {
        var mr = C().moreTime(); if (!mr) { snd('back'); return; }
        var gk = C().club(c, mr.gone), ak = C().club(c, mr.added);
        note = gk.name + ' retira su oferta; llega la de ' + ak.name + '.';
        sub.pick = c.offers.findIndex(function (o) { return o.club === mr.added; }); snd('click'); render(); focusTab(); syncMenu(); return;
      }
      case 'reject':   // dos pulsaciones en 3 s (se pierden para siempre, también la prueba de la Nacional)
        if (!(rejArm && performance.now() - rejArm < 3000)) {
          rejArm = performance.now(); snd('click'); render(); focusSel('[data-act="reject"]');
          setTimeout(function () { if (rejArm && performance.now() - rejArm >= 2900) { rejArm = 0; if (open && pickView()) { render(); focusSel('[data-act="reject"]'); } } }, 3000);
          return;
        }
        rejArm = 0; C().rejectAll(); note = 'Han llegado ' + c.offers.length + ' ofertas nuevas.'; sub.pick = 0; snd('click'); render(); focusTab(); syncMenu(); return;
      case 'neg': {
        var ng = C().negotiate(+b.getAttribute('data-i')), oo = c.offers[+b.getAttribute('data-i')];
        note = ng === 'ok' ? 'Aceptan: firmarías como ' + oo.role.toLowerCase() + '.' : ng === 'no' ? 'No mejoran la oferta: la tomas como está o la dejas.' : ng === 'cap' ? 'No pueden prometerte más: su plantilla manda (mira «Tu sitio»).' : '';
        snd(ng === 'ok' ? 'toggle' : 'back'); render(); focusSel('[data-act="offer"][data-i="' + b.getAttribute('data-i') + '"]'); syncMenu(); return;
      }
      case 'train': if (C().setTraining(b.getAttribute('data-t'))) snd('toggle'); keepFocus(b, render); return;
      case 'mate': {
        var cm = C().changeMate(+b.getAttribute('data-i'));
        note = cm === 'ok' ? 'Ahora juegas con ' + c.mate.name + '.' : cm === 'coach' ? 'El entrenador no te deja: gánate antes su confianza.' : '';
        snd(cm === 'ok' ? 'toggle' : 'back'); render(); focusSel('[data-act="mate"]'); syncMenu(); return;
      }
      case 'transfer': C().requestTransfer(b.getAttribute('data-on') === '1'); snd('click'); render(); focusSel('[data-act="transfer"]'); syncMenu(); return;
      case 'play': snd('start'); play(); return;
      case 'tr-play': snd('start'); trainPlay(b.getAttribute('data-d')); return;
      case 'tr-quick': {   // sesión simulada: resultado al momento (determinista)
        var tq = C().trainSession(b.getAttribute('data-d'), 'quick'); trainNote = trainResText(tq);
        snd(tq && tq.ok ? (tq.up ? 'toggle' : 'click') : 'back'); trainKeep(b); syncMenu(); return;
      }
      case 'tr-rest': {   // descansar en la sesión: −8 de fatiga, sin subir nada (también con la fatiga en el tope)
        var tr = C().trainSession(null, 'rest'); trainNote = trainResText(tr);
        snd(tr && tr.ok ? 'click' : 'back'); trainKeep(b); syncMenu(); return;
      }
      case 'tr-swap': {   // cambiar el ejercicio de una casilla del plan: el siguiente de tu puesto y, al final, descansar
        var inf = C().trainInfo(c), sl = +b.getAttribute('data-s'); if (!inf) return;
        var opts = inf.drills.map(function (d) { return d.id; }).concat(['rest']), cur = planOf(c, inf)[sl];
        planOv.s[sl] = opts[(opts.indexOf(cur) + 1) % opts.length];
        snd('select'); keepFocus(b, render); return;
      }
      case 'tr-simday': {
        trainNote = trainSimDay(c); snd('click'); render(); syncMenu();
        var sdb = root.querySelector('[data-act="tr-simday"]:not([disabled])') || root.querySelector('[data-act="tr-auto"]'); if (sdb) focusEl(sdb, kbNav); return;
      }
      case 'tr-auto': { var ti = C().trainInfo(c); if (C().setTrainAuto) C().setTrainAuto(!(ti && ti.auto)); snd('toggle'); keepFocus(b, render); return; }
      case 'plan-go': snd('click'); tab = 'match'; trainFocus = true; render(); focusFirst(); return;
      // ---- prueba con partidillo (fase de elegir club): previa, jugarla o simularla
      case 'trial-back': trialI = -1; snd('back'); render(); focusTab(); return;
      case 'trial-play': {
        var tpi = +b.getAttribute('data-i');
        if (dbgTrial) { snd('back'); return; }   // (escena de depuración: no hay Carrera de verdad detrás)
        snd('start'); trialI = -1; trialGo(tpi); return;
      }
      case 'trial-sim': {
        if (dbgTrial) { snd('back'); return; }
        var tsr = C().trialSim ? C().trialSim(+b.getAttribute('data-i')) : null; if (!tsr) { trialI = -1; render(); focusTab(); return; }
        trialI = -1; trialRes = tsr; sub.pick = 0; yrs = {}; note = '';
        snd(tsr.pass ? 'start' : 'back'); tab = 'match'; render(); focusFirst(); syncMenu(); return;
      }
      case 'bench': {   // jornada sin ti (el entrenador te sienta): se simula y se enseña el resultado
        var bs = C().benchNext(c); if (!bs) return;
        snd('click'); freshLast = true; tab = 'match'; render(); syncMenu(); focusTab(); return;
      }
      case 'physio': {
        var ph = C().physio(), pc = C().physioCost(c);
        note = ph === 'ok' ? 'El fisio te deja como nuevo: fatiga −' + C().PHYSIO_FAT + ' (' + eur(pc) + ').' : ph === 'done' ? 'Ya has ido al fisio esta jornada.' : ph === 'none' ? 'No tienes fatiga.' : ph === 'money' ? 'No te llega: cuesta ' + eur(pc) + '.' : '';
        snd(ph === 'ok' ? 'toggle' : 'back'); keepFocus(b, render); return;
      }
      case 'sim': {
        var s = C().simulateNext(c); if (!s) return;
        // el foco se queda en «Simular» (antes saltaba a «Jugar partido» y un segundo Intro arrancaba un partido; al acabar la
        // temporada caía en «Seguir en…» y otro Intro rechazaba todas las ofertas). Si ya no hay «Simular»: la pestaña.
        snd('click'); freshLast = true; tab = 'match'; render(); syncMenu();
        var sb = root.querySelector('[data-act="sim"]');
        if (sb) focusEl(sb, kbNav); else focusTab();
        return;
      }
      case 'broken':
        if (confirmStep === 2 && performance.now() - armT < 3000) { confirmStep = 0; C().abandon(); snd('back'); form.name = ''; form.diff = 'normal'; view = 'create'; render(); focusFirst(); syncMenu(); return; }
        confirmStep = 2; armT = performance.now(); snd('click'); render(); focusSel('[data-act="broken"]'); return;
      case 'stay':
        if (c && c.phase === 'off' && c.offers && c.offers.length && !(stayArm && performance.now() - stayArm < 3000)) {
          stayArm = performance.now(); snd('click'); render(); focusSel('[data-act="stay"]');
          setTimeout(function () { if (stayArm && performance.now() - stayArm >= 2900) { stayArm = 0; if (open) { render(); focusSel('[data-act="stay"]'); } } }, 3000);
          return;
        }
        stayArm = 0; C().stay(yrs.renew); yrs = {}; snd('click'); tab = 'match'; render(); focusFirst(); syncMenu(); return;
      case 'offer': {
        var oi = +b.getAttribute('data-i'), of = c.offers[oi]; if (!of) return;
        // a mitad de temporada, primero la confirmación (antes se fichaba con un solo toque)
        // prueba (al elegir club o invitación de mitad / fin de temporada): primero la previa con los objetivos; se juega («Saltar a la
        // pista») o se simula desde ahí (la previa ya avisa de que, si te fichan a mitad de temporada, te vas al momento)
        if (of.trial && C().trialSetup) { offArm = -1; trialI = oi; snd('click'); render(); focusFirst(); return; }
        if (c.window === 'mid' && offArm !== oi) { offArm = oi; snd('click'); render(); focusSel('[data-act="offer"][data-i="' + oi + '"]'); return; }
        offArm = -1;
        var wasPick = c.phase === 'pick', okf = C().acceptOffer(oi, yrs[of.club]);
        if (okf) { yrs = {}; note = ''; snd('start'); tab = 'match'; render(); focusFirst(); syncMenu(); return; }
        if (wasPick && of.trial) { note = 'No has superado la prueba de ' + C().club(c, of.club).name + '. Te quedan las otras ofertas.'; sub.pick = 0; snd('back'); render(); focusTab(); syncMenu(); }
        return;
      }
      case 'offno': { var ai = offArm; offArm = -1; snd('back'); render(); focusSel('[data-act="offer"][data-i="' + ai + '"]'); return; }
      case 'lgsheet': snd('click'); lgSheet(); return;
      case 'lvl': tblLvl = +b.getAttribute('data-l'); snd('select'); keepFocus(b, render); return;
      // ---- Carrera de pista (6v6) y cambio de Carrera
      case 'lg6': tblLid = b.getAttribute('data-l'); snd('select'); keepFocus(b, render); return;
      case 'mode': form.mode = b.getAttribute('data-m') === 'hall' ? 'hall' : 'beach'; snd('select'); keepFocus(b, render); return;
      case 'country': form.country = b.getAttribute('data-cc'); snd('select'); keepFocus(b, render); return;
      case 'pos': form.pos = b.getAttribute('data-p'); snd('select'); keepFocus(b, render); return;
      case 'pts6': form.pts6 = +b.getAttribute('data-v'); snd('select'); keepFocus(b, render); return;
      case 'setpos': if (C().setPosition && C().setPosition(b.getAttribute('data-p'))) { snd('toggle'); if (b.getAttribute('data-p') === 'S') setterNoteSoon(); } else snd('back'); keepFocus(b, render); return;   // (colocador: el aviso de la diana)
      case 'openmode': C().setMode(b.getAttribute('data-m')); view = 'hub'; tab = 'match'; tblLid = ''; tblLvl = -1; snd('start'); render(); focusFirst(); syncMenu(); return;
      case 'switch': {   // Opciones: a la otra Carrera (si no existe, a crearla)
        var om = b.getAttribute('data-m');
        if (C().has(om)) { C().setMode(om); view = 'hub'; } else { form.mode = om; view = 'create'; }
        tab = 'match'; tblLid = ''; tblLvl = -1; confirmStep = 0; snd('click'); render(); focusFirst(); syncMenu(); return;
      }
      case 'up': if (C().bump(b.getAttribute('data-k'))) { snd('click'); keepFocus(b, render); syncMenu(); } else snd('back'); return;
      case 'badge': {
        var bid = b.getAttribute('data-id'), r = C().toggleBadge(bid);
        if (!r && VB.Badges && c) {   // antes solo sonaba: ahora se explica por qué no se ha podido
          var bp = c.player;
          badgeMsg = !VB.Badges.level(bp, bid) ? 'Aún está bloqueada: ' + (VB.Badges.BY[bid] ? VB.Badges.BY[bid].cond.toLowerCase() : 'sigue jugando') + '.'
            : 'No quedan huecos libres: quita una equipada antes (tienes ' + VB.Badges.slots(bp) + '; uno más cada 5 niveles).';
        }
        snd(r ? 'toggle' : 'back'); keepFocus(b, render); return;
      }
      case 'quit1': confirmStep = 1; snd('click'); render(); focusSel('[data-act="quit0"]'); return;
      case 'quit0': confirmStep = 0; clearTimeout(armTo); snd('back'); render(); focusSel('[data-act="quit1"]'); return;
      case 'quit2':
        if (confirmStep === 2 && performance.now() - armT < 3000) {
          confirmStep = 0; C().abandon(); snd('back'); form.name = ''; form.diff = 'normal'; view = 'create'; render(); focusFirst(); syncMenu(); return;
        }
        confirmStep = 2; armT = performance.now(); clearTimeout(armTo);
        armTo = setTimeout(function () { if (confirmStep === 2) { confirmStep = 1; if (open && tab === 'honors') render(); } }, 3000);
        snd('click'); render(); focusSel('[data-act="quit2"]'); return;
    }
  }
  function setTab(t, s) {
    tab = t; confirmStep = 0; offArm = -1; if (t !== 'league') tblLvl = -1;
    if (s && subsOf(t) && subsOf(t).some(function (x) { return x[0] === s; })) sub[t] = s;
    render(); var tb = tabsEl.querySelector('[data-tab="' + t + '"]'); if (tb) { focusEl(tb, kbNav); try { tb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { } } else showOn(tabsEl); body.scrollTop = 0; phReveal();
  }
  /** Sub-pestaña del apartado actual (o la oferta al elegir club: un índice o 'cmp'). */
  function setSub(v) {
    var c = C() && C().get(), pk = c && c.phase === 'pick' && view !== 'create';
    if (pk) sub.pick = v === 'cmp' ? 'cmp' : +v;
    else if (subsOf(tab)) {
      sub[tab] = v; confirmStep = 0; offArm = -1; if (v !== 'table' && v !== 'clubs') tblLvl = -1;   // (Clubes comparte el selector de liga)
      if (v === 'clubs' && WUI() && WUI().reset) WUI().reset();   // desde la barra, Clubes abre la lista (no la última ficha)
    }
    render();
    var id = pk ? sub.pick : v, bar = pk ? tabsEl : subEl, sb = bar.querySelector('[data-sub="' + id + '"],[data-tab="' + id + '"]');
    if (sb) { focusEl(sb, kbNav); try { sb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { } } else showOn(bar);
    body.scrollTop = 0; phReveal();
  }
  /** Con el componente común (sin data-tab): la pestaña activa de la barra, a la vista (Q/E, LT/RT). */
  function showOn(bar) { var on = bar && bar.querySelector('.tab.on,[aria-selected="true"]'); if (on) try { on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) { } }
  /** ←/→ con el foco en una pestaña: la siguiente de su barra (apartados o sub-pestañas). Devuelve true si lo ha hecho. */
  function cycleTab(a, d) {
    if (!a || !a.getAttribute) return false;
    // componente común: la barra a la que pertenece la pestaña enfocada
    if (tabsApi && tabsEl.contains(a) && a.getAttribute('role') === 'tab') { tabsApi.step(d, 'key'); return true; }
    if (subApi && subEl.contains(a) && a.getAttribute('role') === 'tab') { subApi.step(d, 'key'); return true; }
    if (VB.UI && VB.UI.tabs) return false;   // (con el componente, un botón del contenido con data-tab no es una pestaña)
    var bar = a.parentNode, attr = a.getAttribute('data-tab') != null ? 'tab' : a.getAttribute('data-sub') != null && bar && bar.getAttribute('role') === 'tablist' ? 'sub' : '';
    if (!attr) return false;
    var l = bar.querySelectorAll('[data-' + attr + ']'), i = Array.prototype.indexOf.call(l, a), n = l[(i + d + l.length) % l.length];
    if (!n) return false;
    if (attr === 'tab') setTab(n.getAttribute('data-tab')); else setSub(n.getAttribute('data-sub'));
    return true;
  }
  function keepFocus(b, fn) {
    var sel = selectorOf(b); fn();
    var nb = sel ? root.querySelector(sel) : null;
    if (nb && !nb.disabled) focusEl(nb, kbNav); else focusFirst();
  }
  function selectorOf(b) {
    var attrs = ['data-act', 'data-s', 'data-k', 'data-id', 'data-r', 'data-p', 'data-c', 'data-l', 'data-d', 'data-i', 'data-tab', 'data-sub', 'data-t', 'data-y', 'data-key', 'data-on', 'data-m', 'data-cc', 'data-v'], s = 'button';
    attrs.forEach(function (a) { var v = b.getAttribute(a); if (v != null) s += '[' + a + '="' + v + '"]'; });
    return s;
  }
  function focusSel(sel) { var b = root.querySelector(sel); if (b) focusEl(b, kbNav); }
  /** Tras una sesión del plan: el foco sigue en el mismo botón si aún está; si no, en la casilla de ahora (no salta a «Jugar partido»). */
  function trainKeep(b) {
    var sel = selectorOf(b); render();
    var nb = sel ? root.querySelector(sel) : null;
    if (!nb || nb.disabled) nb = root.querySelector('#crTrain .pl-s.cur button:not([disabled])') || root.querySelector('#crTrain button:not([disabled])');
    if (nb) focusEl(nb, kbNav); else focusFirst();
  }
  function play() {
    var go = function () { if (VB.ctx && VB.ctx.actions && VB.ctx.actions.startCareerMatch) VB.ctx.actions.startCareerMatch(); };
    close(true);
    var w = false; try { w = !!(VB.UI && VB.UI.wipe && VB.UI.wipe(2, go)); } catch (e) { w = false; }
    if (!w) go();
  }

  // =================================================================== foco y teclado/mando
  var kbNav = false;
  function focusables() {
    if (!root) return [];
    var all = root.querySelectorAll('button, input'), out = [];
    // (data-skip: pestañas no elegidas y pistas Q/E del componente; solo la pestaña elegida entra en ↑/↓, así ↓ baja al contenido)
    for (var i = 0; i < all.length; i++) { var n = all[i]; if (!n.disabled && !n.hasAttribute('data-skip') && !n.closest('[hidden]') && n.offsetParent !== null) out.push(n); }
    return out;
  }
  function focusEl(n, kb) {
    if (!n) return;
    var prev = root.querySelectorAll('.kf'); for (var i = 0; i < prev.length; i++) prev[i].classList.remove('kf');
    try { n.focus({ preventScroll: true }); } catch (e) { }
    if (kb) n.classList.add('kf');
    try { n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
  }
  function focusFirst() {
    setTimeout(function () {
      if (!open) return;
      // vuelta de un ejercicio de Carrera: el bloque Entrenamiento a la vista, con el foco en su primer botón activo
      if (trainFocus) {
        trainFocus = false; var tc = view === 'hub' ? root.querySelector('#crTrain') : null;
        if (tc) { var tb = tc.querySelector('button:not([disabled])'); if (tb) focusEl(tb, kbNav); try { tc.scrollIntoView({ block: 'start' }); } catch (e) { } return; }
      }
      // fin de temporada: el foco va a la pestaña (no a «Seguir en…», que rechaza todas las ofertas) y se ve la tarjeta del resumen
      var c = null; try { c = C() && C().get(); } catch (e) { c = null; }
      if (c && view === 'hub' && c.phase === 'off' && !root.querySelector('[data-act="play"]')) { focusTab(); return; }
      // previa de la prueba: «Saltar a la pista»
      if (dbgTrial || (c && view === 'hub' && c.phase === 'pick' && trialI >= 0)) { var tpb = root.querySelector('[data-act="trial-play"]'); if (tpb) { focusEl(tpb, kbNav); return; } }
      if (c && view === 'hub' && c.phase === 'pick') { focusTab(); return; }   // eligiendo club: la pestaña de la oferta (no «Firmar» de golpe)
      var fr = focusReq; focusReq = '';
      var frb = fr && view === 'hub' ? root.querySelector('[data-act="' + fr + '"]') || root.querySelector('[data-act="play"]') || root.querySelector('[data-act="bench"]') : null;
      if (frb) { focusEl(frb, kbNav); return; }
      var pref = root.querySelector('[data-act="cw-next"]') || root.querySelector('[data-act="play"]') || root.querySelector('[data-act="stay"]') || root.querySelector('#crName') || root.querySelector('[data-act="create"]') || root.querySelector('[data-act="look-open"]');
      if (!pref && view === 'hub') { focusTab(); return; }   // (p. ej. reabrir en Mensajes: la pestaña, no «‹ Jugar»)
      focusEl(pref || focusables()[0], kbNav);
      if (pref && pref.id === 'crName' && PH() && body) body.scrollTop = 0;   // (móvil: la ficha de crear empieza arriba, con «Carrera» a la vista)
    }, 60);
  }
  function focusTab() {
    var tb = tabsEl && !tabsEl.hidden ? (tabsEl.querySelector('[data-tab="' + tab + '"]') || tabsEl.querySelector('[aria-selected="true"]')) : null;
    if (tb) focusEl(tb, kbNav); else { var f = focusables()[0]; if (f) focusEl(f, kbNav); }
    body.scrollTop = 0;
  }
  /** (móvil) #crTabs en columna (.sp-vtabs): ↑/↓ cambian de apartado, → entra al contenido y ← desde su 1ª columna vuelve
   *  (VB.UI.tabs api.vnav; post = ← que nadie quiso). Sin la columna devuelve false y todo sigue como siempre. */
  function crVt(a, dx, dy, how, post) {
    if (!tabsApi || !tabsApi.vnav || !tabsEl || tabsEl.hidden) return false;
    if (tabsApi.vnav(a, dx, dy, how, focusables(), post)) { kbNav = true; return true; }
    return false;
  }
  function move(d) {
    var L = focusables(); if (!L.length) return;
    var a = document.activeElement, i = L.indexOf(a);
    if (i < 0 && a && a !== document.body && root.contains(a)) {   // foco en algo que no es botón (aviso .st-fx de career-story): sigue desde ahí
      var j = 0; while (j < L.length && !(a.compareDocumentPosition(L[j]) & 4)) j++;
      i = ((d > 0 ? j - 1 : j) + d + L.length) % L.length;
    } else i = i < 0 ? 0 : (i + d + L.length) % L.length;
    kbNav = true; focusEl(L[i], true);
    try { if (VB.Audio && VB.Audio.hover) VB.Audio.hover(); } catch (e) { }
  }
  function back() {
    if (dbgTrial) { snd('back'); close(); return true; }
    if (trialI >= 0 && pickView()) { trialI = -1; render(); focusTab(); snd('back'); return true; }   // previa de la prueba → ofertas
    if (view === 'hub' && tab === 'league' && sub.league === 'clubs' && WUI() && WUI().back && WUI().back()) {   // ficha de club → lista (foco en su fila)
      render(); var fr = WUI().focusSel && WUI().focusSel() ? root.querySelector(WUI().focusSel()) : null;
      if (fr) focusEl(fr, kbNav); else focusFirst();
      snd('back'); return true;
    }
    if (confirmStep) { confirmStep = 0; render(); focusSel('[data-act="quit1"]'); snd('back'); return true; }
    var c = C() && C().get();
    if (view === 'create' && c) { view = 'hub'; render(); focusFirst(); snd('back'); return true; }
    snd('back'); close(); return true;
  }
  function onKey(e) {
    if (!open) return;
    // hoja VB.Splat abierta encima (ligas, «?»…): el teclado es suyo (ui.js / splat.js la llevan por activeLayer; Esc la cierra a ella)
    if (VB.Splat && VB.Splat.sheetOpen && VB.Splat.sheetOpen()) return;
    var k = e.key, a = document.activeElement, inInput = a && a.tagName === 'INPUT';
    e.stopPropagation();   // ni ui.js (menú de detrás) ni input.js (M = silencio, P = pausa…) mientras está abierta
    if (k === 'Escape') { e.preventDefault(); back(); return; }
    if (k === 'Enter') {
      if (inInput) { e.preventDefault(); var cb = root.querySelector('[data-act="create"]'); if (cb) cb.click(); return; }
      if (a && a.tagName === 'BUTTON' && root.contains(a)) return;   // el navegador lo pulsa
      e.preventDefault(); focusFirst(); return;
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (crVt(a, 0, k === 'ArrowDown' ? 1 : -1, 'key')) return; move(k === 'ArrowDown' ? 1 : -1); return; }
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && !inInput) {
      e.preventDefault();
      var d = k === 'ArrowRight' ? 1 : -1;
      if (crVt(a, d, 0, 'key') || cycleTab(a, d) || crVt(a, d, 0, 'key', true)) return;
      move(d); return;
    }
    // como en Jugadores y Ajustes: Q/E cambian de apartado (o de oferta al elegir club) estés donde estés; RePág/AvPág, de
    // sub-pestaña (o de apartado si no hay). No mientras se escribe el nombre
    if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var lvl = k === 'q' || k === 'Q' || k === 'e' || k === 'E' ? 'tab' : k === 'PageUp' || k === 'PageDown' ? 'sub' : '';
      var tb = lvl ? barApi(lvl) : null;
      if (tb) { e.preventDefault(); kbNav = true; tb.step(k === 'q' || k === 'Q' || k === 'PageUp' ? -1 : 1, 'key'); return; }
    }
    if (k === 'Tab') { kbNav = true; }
  }
  var rep = { y: 0, x: 0, ty: 0, tx: 0 };
  function axis(v, key, tkey, dt) {
    var dir = v > 0.55 ? 1 : v < -0.55 ? -1 : 0;
    if (dir !== rep[key]) { rep[key] = dir; rep[tkey] = 0.38; return dir; }
    if (!dir) return 0;
    rep[tkey] -= dt; if (rep[tkey] <= 0) { rep[tkey] = 0.14; return dir; }
    return 0;
  }
  /** Gatillos LT (−1) / RT (+1) del mando recién pulsados (botones 6/7 del mapeo estándar); 0 si nada nuevo. */
  var trigPrev = 0;
  function padTrig() {
    var d = 0;
    try {
      var ps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i]; if (!p || !p.buttons) continue;
        var l = p.buttons[6], r = p.buttons[7];
        if (l && (l.pressed || l.value > 0.5)) d = -1; else if (r && (r.pressed || r.value > 0.5)) d = 1;
        if (d) break;
      }
    } catch (e) { d = 0; }
    var edge = d && d !== trigPrev ? d : 0; trigPrev = d; return edge;
  }
  /** Mando (main.js la llama en vez de VB.UI.nav mientras la Carrera está abierta). */
  function nav(it, dt) {
    if (!open || !it) return;
    if (VB.Splat && VB.Splat.sheetOpen && VB.Splat.sheetOpen() && VB.UI && VB.UI.nav) return VB.UI.nav(it, dt);   // (hoja abierta: el mando, dentro de ella)
    if (it.device !== 'gamepad') { rep.y = rep.x = 0; return; }
    kbNav = true;
    var dy = axis(it.my || 0, 'y', 'ty', dt || 0.016), dx = axis(it.mx || 0, 'x', 'tx', dt || 0.016);
    if (dy && !crVt(document.activeElement, 0, -dy, 'pad')) move(-dy);
    if (dx) {
      var a = document.activeElement;
      if (!crVt(a, dx, 0, 'pad') && !cycleTab(a, dx) && !crVt(a, dx, 0, 'pad', true)) move(dx);
    }
    // LB/RB (o Y): apartado (como en los paneles de ui.js); LT/RT: sub-pestaña. Bordes de subida leídos aquí (input.js no los da)
    if (it.switchPlayer) { var tb = barApi('tab'); if (tb) tb.step(VB.UI && VB.UI.padTabDir ? VB.UI.padTabDir() : 1, 'pad'); }
    var tr = padTrig();
    if (tr) { var sb = barApi('sub'); if (sb) sb.step(tr, 'pad'); }
    if (it.hit || it.confirm) { var f = document.activeElement; if (f && root.contains(f) && f.tagName === 'BUTTON') f.click(); else focusFirst(); }
    else if (it.jump) back();
  }

  // =================================================================== abrir / cerrar
  /** Botón de volver de la cabecera: «‹ Menú» si se abrió desde la portada (B3), «‹ Jugar» si no. */
  function backBtn() { return from === 'main' ? backB('close', 'Menú', 'Volver al menú') : backB('close', 'Jugar', 'Volver a Jugar'); }
  /** SPLAT: «Volver» en mancha de tinta (.sp-back) con flecha; act = data-act, label = rótulo, aria = aria-label. */
  function backB(act, label, aria) {
    return '<button class="sp-back" data-shape="3" data-act="' + act + '" aria-label="' + aria + '"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg><span>' + label + '</span></button>';
  }
  /** SPLAT: tu media en un sello dorado (no se pulsa; el aro dice «TU MEDIA»). */
  function ovrStamp(v) { return '<div class="cr-ovr sp-stamp" role="img" aria-label="Tu media: ' + v + '" data-ring="TU MEDIA ★ TU MEDIA ★ TU MEDIA ★ "><span class="sp-sc"><b>' + v + '</b></span></div>'; }
  /** Fondo del menú: el escenario de la Carrera abierta (main.js ctx.actions.menuBackdrop). */
  function backdrop(k) { try { if (VB.ctx && VB.ctx.actions && VB.ctx.actions.menuBackdrop) VB.ctx.actions.menuBackdrop(k); } catch (e) { } }
  function show(v) {
    build();
    // prueba empezada y sin acabar (se cerró o se recargó la pestaña a mitad del partidillo): VB.Career.trialStale la da por
    // suspendida ('left') antes de pintar; si devuelve el resultado, su tarjeta arriba (notes/nota-en-directo-spec.md §5.1)
    var ts = null; try { ts = C() && typeof C().trialStale === 'function' ? C().trialStale() : null; } catch (e) { ts = null; }
    if (ts && ts.letter && !trialRes) { trialI = -1; trialRes = ts; sub.pick = 0; }
    var c = C() && C().get();
    view = v || (c ? 'hub' : 'create');
    if (view === 'hub' && !c) view = 'create';
    if (!open) { lastFocus = document.activeElement; ptDone = false; }
    open = true; confirmStep = 0;
    var app = document.getElementById('app'); if (app) app.classList.add('cr-on');
    lookSync();
    render(); syncMenu();
    if (!ptDone && c && view === 'hub') { ptDone = true; prePt(c); }   // R8: retratos de la previa (tú y tu compañero, 72 px)
    root.hidden = false; root.classList.remove('in');
    requestAnimationFrame(function () { if (root) root.classList.add('in'); });
    focusFirst();
    if (view === 'hub' && c && !dbgTrial) setterNoteSoon();
  }
  /** Salto con impulso (v1.12.0): en la Carrera de pista, si juegas de colocador, el aviso de la colocación con diana (VB.UI.setterNote;
   *  él decide si toca: una vez por sesión, con la diana apagada y sin «No volver a mostrar»). Tras el foco del hub (focusFirst). Nunca
   *  encima de otra capa: con la escena de Faro (.cw-mentor), la confirmación de borrar, la hoja de instalar u otro aviso abiertos,
   *  espera (cada 0,5 s mientras sigas en el hub; si te vas, sale la próxima vez que vuelvas). */
  var snT = 0;
  function setterNoteSoon() {
    clearTimeout(snT);
    var tries = 0;
    (function tryNote() {
      snT = setTimeout(function () {
        if (!open || view !== 'hub') return;
        var c = null; try { c = C() && C().get(); } catch (e) { c = null; }
        if (!c || !isHall(c) || !C().ctrlRole || C().ctrlRole(c) !== 'S') return;
        var busy = !!(root && root.querySelector('.cw-mentor')) || confirmStep > 0 || document.hidden ||
          !!(VB.Install && VB.Install.isOpen && (function () { try { return VB.Install.isOpen(); } catch (e) { return false; } })()) ||
          !!(VB.UI && VB.UI.noteOpen && VB.UI.noteOpen());
        if (busy) { if (++tries < 600) tryNote(); return; }
        if (VB.UI && VB.UI.setterNote) { try { VB.UI.setterNote({ from: 'career' }); } catch (e) { } }
      }, tries ? 500 : 160);
    })();
  }
  function close(toPlay) {
    if (!root || !open) return;
    open = false; root.hidden = true; root.classList.remove('in'); confirmStep = 0; dbgTrial = null;
    var app = document.getElementById('app'); if (app) app.classList.remove('cr-on');
    var k = root.querySelectorAll('.kf'); for (var i = 0; i < k.length; i++) k[i].classList.remove('kf');
    syncMenu();
    if (!toPlay) backdrop('');
    // abierta desde la portada: el foco vuelve a «Continuar carrera» (#btnCont) si se ve; si no (o desde Jugar), a #btnCareer
    if (!toPlay) {
      setTimeout(function () {
        if (open) return;
        var bc = from === 'main' ? document.getElementById('btnCont') : null, b = bc && !bc.hidden && bc.offsetParent !== null ? bc : document.getElementById('btnCareer');
        if (b) { try { b.focus({ preventScroll: true }); } catch (e) { } if (kbNav) b.classList.add('kf'); }
      }, 40);
    }
  }
  /** Subtítulo de la fila «Carrera» del menú y la tarjeta «Continuar carrera» de la portada (B3). */
  function syncMenu() { try { syncMenu0(); } catch (e) { } try { syncHero(); } catch (e) { } }
  /** B3: textos de «Continuar carrera» (S2-B2B3 §2.4), puro (sin DOM). null sin carrera. Devuelve {mode:'beach'|'hall', kind (chip
   *  de arriba: «Playa»/«Pista»), title, chip (pastilla de la línea pequeña, '' si no hay), line, aria, club (tu club o null)}. */
  function heroData(c) {
    var K = C(); if (!c || !K || !c.player) return null;
    var hall = isHall(c), word = hall ? 'pista' : 'playa', k = null;
    try { k = K.myClub(c); } catch (e) { k = null; }
    var d = { mode: hall ? 'hall' : 'beach', kind: hall ? 'Pista' : 'Playa', title: 'Continuar carrera', chip: '', line: '', aria: '', club: k || null };
    var T = 'T' + (c.season | 0), tS = 'temporada ' + (c.season | 0);
    if (c.phase === 'pick') {
      var no = (c.offers || []).length;
      d.title = 'Elige club'; d.chip = plural(no, 'oferta', 'ofertas'); d.line = 'Tu primer club'; d.club = null;
      d.aria = 'Elige club en tu carrera de ' + word + ': ' + d.chip; return d;
    }
    if (c.phase === 'off') {
      var nf = (c.offers || []).length;
      d.title = 'Fin de temporada'; d.chip = T; d.line = nf ? plural(nf, 'oferta', 'ofertas') : 'Renueva o ficha';
      d.aria = 'Fin de temporada en tu carrera de ' + word + ': ' + tS + ', ' + (nf ? d.line : 'renueva o ficha'); return d;
    }
    var n = null; try { n = K.next(c); } catch (e) { n = null; }
    if (!n || !n.rival) {
      d.chip = T; d.line = k ? k.name : '';
      d.aria = 'Continuar carrera de ' + word + ': ' + tS + (k ? ', ' + k.name : ''); return d;
    }
    var rv = n.rival.name, when, whenA;
    if (n.kind === 'league') { when = ' J' + ((n.week | 0) + 1); whenA = 'jornada ' + ((n.week | 0) + 1); }
    else if (hall && n.kind === 'ko') { when = n.compName ? ' ' + n.compName : ''; whenA = n.compName || ''; }
    else { when = n.round === 0 ? ' Semifinal' : ' Final'; whenA = n.round === 0 ? 'semifinal' : 'final'; }
    var away = n.kind === 'league' && n.atHome === false, out = !!(n.bench || n.status === 'out');
    d.chip = T + when; d.line = (out ? 'No juegas: ' : '') + (away ? 'en ' : 'vs ') + rv;
    d.aria = 'Continuar carrera de ' + word + ': ' + [tS, whenA, (out ? 'no juegas, ' : '') + (away ? 'en casa de ' : 'contra ') + rv].filter(function (x) { return x; }).join(', ');
    return d;
  }
  /** B3: rellena #contK/#contT/#contS/#contPt/#contCr y el aria-label de #btnCont (index.html, T15) con heroData. Devuelve true si
   *  hay que enseñar la tarjeta (ui.js decide hidden y .primary). Sin #btnCont solo dice si habría tarjeta. */
  var heroPt = '', heroCr = '';
  function syncHero() {
    var c = null; try { c = C() && C().get(); } catch (e) { c = null; }
    var d = null; try { d = heroData(c); } catch (e) { d = null; }
    var b = typeof document !== 'undefined' && document.getElementById ? document.getElementById('btnCont') : null;
    if (!b || !d) return !!d;
    var set = function (id, txt) { var n = document.getElementById(id); if (n && n.textContent !== txt) n.textContent = txt; };
    set('contK', d.kind); set('contT', d.title);
    var s = document.getElementById('contS'), sh = (d.chip ? sp([esc(d.chip)], 'c') + ' ' : '') + esc(d.line);
    if (s && s._h !== sh) { s._h = sh; s.innerHTML = sh; }
    if (b.getAttribute('aria-label') !== d.aria) b.setAttribute('aria-label', d.aria);
    var low = typeof window !== 'undefined' && window.innerHeight <= 420, pt = document.getElementById('contPt');
    if (pt) { var ph = ptHTML(c, 'me', low ? 56 : 72, 'ct-ptimg', 'Retrato de ' + c.player.name, 'alegria'); if (ph !== heroPt || !pt.firstChild) { heroPt = ph; pt.innerHTML = ph; } }
    var cr = document.getElementById('contCr');
    if (cr) {   // (los ids de clipPath cambian en cada llamada: se compara sin el contador)
      var chh = d.club ? crest(d.club, 40, c) : '', cmp = chh.replace(/n\d+"/g, '"').replace(/n\d+\)/g, ')');
      if (cmp !== heroCr || (chh && !cr.firstChild)) { heroCr = cmp; cr.innerHTML = chh; }
    }
    return true;
  }
  function syncMenu0() {
    var s = document.getElementById('careerSub'); if (!s || !C()) return;
    var c = C().get(), t;
    // una pastilla con el dato suelto (temporada y jornada, ofertas) y detrás el texto: «T1 J3  Rocaverde — Castelnube»; sin
    // carrera, una frase corta como la de Partido rápido
    var chip = '';
    var hl = isHall(c);
    if (!c) t = C().lost && C().lost() ? 'Guardado dañado: crea otro jugador' : 'Playa o pista: crea tu jugador, elige club y ficha';
    else if (c.phase === 'pick') { chip = plural((c.offers || []).length, 'oferta', 'ofertas'); t = 'Elige club'; }
    else if (c.phase === 'off') { chip = 'T' + c.season; t = 'Fin de temporada, ofertas'; }
    else { var n = C().next(c); chip = 'T' + c.season + (n ? (n.kind === 'league' ? ' J' + (n.week + 1) : (n.round === 0 ? ' Semifinal' : ' Final')) : ''); t = n ? C().myClub(c).short + ' — ' + n.rival.short : C().myClub(c).name; if (n && hl && n.kind === 'ko') chip = 'T' + c.season + ' ' + n.compName; }
    if (c) chip = (hl ? 'Pista ' : 'Playa ') + chip;
    var h = (chip ? sp([chip], 'c') : '') + esc(t); if (s._crH !== h) { s._crH = h; s.innerHTML = h; }
  }
  /** El <style> de la Carrera, una vez (al cargar: también lleva la hoja final del partido de Carrera, #end.career). */
  function ensureCss() {
    if (styleEl) return;
    styleEl = document.createElement('style'); styleEl.id = 'careerCss'; styleEl.textContent = [CSS, SPLAT_CSS, PH_CSS].join('\n');
    document.head ? document.head.appendChild(styleEl) : document.body.appendChild(styleEl);
  }
  function init() {
    ensureCss();
    var b = document.getElementById('btnCareer');
    if (b && !b._cr) { b._cr = 1; b.addEventListener('click', function () { snd('click'); kbNav = !!(b.classList.contains('kf')); show(); }); }
    syncMenu();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);

  VB.CareerUI = {
    /** Abre la Carrera ('hub' | 'create'; sin argumento: el hub si hay carrera, si no crear). opts.fresh = acaba de jugarse un partido. */
    /** R15: open(v, {from:'main'|'play', fresh, focus:'play'|'train'|'bench'[, res]}). from (por defecto 'play'; al volver de un
     *  partido o de una sesión sin from, se queda el de antes) decide «‹ Menú»/«‹ Jugar» y adónde vuelve el foco al cerrar.
     *  focus 'train' (o el antiguo train:true) = vuelta de un ejercicio: Partido con el resultado (res) en el bloque Entrenamiento. */
    open: function (v, opts) {
      opts = opts || {};
      if (v === 'pick') v = 'hub';   // (fase de elegir club: el hub ya enseña las ofertas)
      // vuelta de una prueba (main.js): su resultado arriba (ofertas o, si te fichan, tu club nuevo; si la dejaste a medias, «Prueba suspendida»)
      if ('trialRes' in opts) { trialI = -1; trialRes = opts.trialRes || null; if (trialRes && !trialRes.pass) sub.pick = 0; if (trialRes) tab = 'match'; }
      var back0 = opts.fresh || opts.train || opts.focus === 'train';
      if (opts.from === 'main' || opts.from === 'play') from = opts.from; else if (!back0) from = 'play';
      if (opts.fresh) { freshLast = true; tab = 'match'; }
      if (opts.train || opts.focus === 'train') { tab = 'match'; trainNote = opts.res ? trainResText(opts.res) : ''; trainFocus = true; }
      else if (opts.focus === 'play' || opts.focus === 'bench') { tab = 'match'; focusReq = opts.focus; }
      show(v);
    },
    /** 'main' (abierta desde la portada) | 'play' (desde Jugar). */
    from: function () { return from; },
    syncHero: function () { try { return syncHero(); } catch (e) { return false; } },
    heroData: heroData,
    portraitReq: function (c, who, px, face) { try { return ptReq(c || (C() && C().get()), who, px, face); } catch (e) { return null; } },
    crest: function (k, px, c) { return crest(k, px, c); },
    _chemTxt: chemTxt,
    close: function () { close(); },
    isOpen: function () { return open; },
    /** Siguiente sesión del plan que se ve en pantalla (con los cambios a mano), para «Siguiente sesión» de la hoja del ejercicio
     *  (main.js careerDrillDone). inf = trainInfo(). Id del ejercicio, 'rest' o null. */
    nextPlanned: function (inf) { return inf && inf.plan && inf.used < inf.max ? planOf(null, inf)[inf.used] || null : null; },
    nav: nav,
    back: function () { return open ? back() : false; },
    render: function () { if (open) render(); },
    syncMenu: syncMenu,
    _state: function () { return { open: open, view: view, tab: tab, confirm: confirmStep, trial: trialI }; },
    /** ?debug=trial&pre=1 (main.js): la previa de la prueba con datos de muestra (no lee ni toca ninguna Carrera guardada).
     *  o = { hall: pista (6 contra 6), shirt: color del club }. */
    debugTrial: function (o) {
      o = o || {}; var hall = !!o.hall, gl = hall ? [['kills', '2 remates ganados', 2, '>='], ['recvP', '2 recepciones perfectas', 2, '>='], ['errors', 'Como mucho 2 errores', 2, '<=']]
        : [['kills', '2 remates ganados', 2, '>='], ['blocks', '1 bloqueo punto', 1, '>='], ['errors', 'Como mucho 2 errores', 2, '<=']];
      dbgTrial = { i: 0, hall: hall, name: 'Voley Valencia', kit: { shirt: typeof o.shirt === 'number' ? o.shirt : 0x1d3f7a, accent: 0xffffff, shorts: 0x14213d, pattern: 'liso' },
        stars: 3, league: hall ? 'Hiperliga' : 'Circuito Nacional', place: hall ? 'España' : 'Platja Llarga', ovr: hall ? 58 : 44,
        goals: gl.map(function (g) { return { id: g[0], stat: g[0], txt: g[1], n: g[2], op: g[3] }; }), pct: 21, pts: 15, mate: hall ? '' : 'Nico Serrat',
        player: 'Ari Lluch', ovrMe: 40, pend: 0, ai: hall ? '' : 'la IA rival juega en Normal suave' };
      dbgTrial.club = { id: 'dbg-trial', name: dbgTrial.name, short: 'VAL', kit: dbgTrial.kit, lid: hall ? 0 : undefined };   // (escudo de muestra)
      show('hub');
    },
    _tab: function (t, s) { if (open) setTab(t, s); }
  };
})();
