/* MAKE THE CUT — js/career-world-ui.js (owner: ui_main)
 * Pantallas del «mundo» de la Carrera (VB.CareerWorldUI, sprint 5), dentro del hub de career-ui.js:
 *  - Partido: tarjeta de Faro, el mentor (.cw-mentor), arriba del todo: retrato SVG, una frase por pantalla, «Seguir»/«Vale» y
 *    «Saltar» (o el botón de la escena en la última frase).
 *  - Palmarés › Opciones: «Escenas del mentor: Sí | No».
 *  - Partido, tras el último resultado: «Titulares» (2 noticias) si hay alguna sin ver (headlines).
 *  - Liga › Noticias (newsHTML) y Liga › Clubes (clubsHTML: lista de una liga o la ficha del club elegido, con «‹ Clubes»).
 *  Las dos Carreras: en la pista (c.mode 'hall') las ligas van por id ('ES1') y el selector de liga lo pone career-ui.js (sw).
 * Solo devuelve HTML; las acciones (data-act="cw-…") las atiende career-ui.js (onClick → act). Datos: career-world.js.
 * Mismo contrato que CareerLifeUI: recibe HLP con esc/sp (y kitSw).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  function W() { return VB.CareerWorld; }
  function C() { return VB.Career; }
  var H = null, li = 0, liKey = '', sel = null, lastSel = null;
  function esc(s) { return H ? H.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';'; }); }
  function sp(a, k) { return H.sp(a, k); }
  function isH(c) { return !!(c && c.mode === 'hall'); }
  /** Liga por su clave (playa: nivel; pista: id), con career-world.js si lo sabe (lgBy). */
  function lgBy(c, lv) { return W() && W().lgBy ? W().lgBy(c, lv) : C().league(lv); }

  // Retrato de Faro (SVG inline, sin red): cabeza redonda, gorra con visera, gafas de sol subidas y silbato. Trazo --tk, acento turquesa.
  var FACE = '<svg class="cw-face" viewBox="0 0 56 56" aria-hidden="true" focusable="false">' +
    '<circle cx="28" cy="28" r="27" fill="#2ec4b6" stroke="var(--tk,#1d1530)" stroke-width="2.5"/>' +
    '<circle cx="28" cy="32" r="15" fill="#e8b48a" stroke="var(--tk,#1d1530)" stroke-width="2.5"/>' +
    '<path d="M12 25c1-9 8-14 16-14s15 5 16 14z" fill="#f7f2ea" stroke="var(--tk,#1d1530)" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M26 25h22c0 3-3 4-6 4H28z" fill="#1d8a80" stroke="var(--tk,#1d1530)" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<rect x="17" y="18" width="8" height="5" rx="2.5" fill="#1d1530"/><rect x="27" y="18" width="8" height="5" rx="2.5" fill="#1d1530"/>' +
    '<path d="M25 20.5h2" stroke="#1d1530" stroke-width="2"/>' +
    '<circle cx="23" cy="33" r="1.8" fill="#1d1530"/><circle cx="33" cy="33" r="1.8" fill="#1d1530"/>' +
    '<path d="M23 39c3 2.5 7 2.5 10 0" fill="none" stroke="#1d1530" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M20 46l8 4 8-4" fill="none" stroke="#ffd23f" stroke-width="2"/><rect x="25" y="48" width="7" height="5" rx="1.5" fill="#ffd23f" stroke="var(--tk,#1d1530)" stroke-width="1.5"/>' +
    '</svg>';
  // SPLAT (etapa 2, 17-nov-2026; notes/splat.md): Faro habla en un bocadillo de papel crema; las noticias son recortes de papel
  // (la tuya con la franja del color de tu club, la de tu rival en rojo); los clubes, filas-pegatina; la vitrina, sellos dorados
  // (los huecos por ganar, de trazo discontinuo). Prefijo Q (3 ids de :root más #career): gana a las reglas de arriba y a las de index.html.
  var Q = ':root:not(#_):not(#_):not(#_) #career', STK = '0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink)', FOC = '0 0 0 2.5px var(--sp-ink),0 0 0 5.5px var(--sp-gold),3px 4px 0 5.5px var(--sp-ink)';
  // Móvil (html.ph, 18-nov-2026; notes/splat.md §9): letra con los tokens (nada < 12 px, lectura ≥ 14), filas de 48 y la vitrina en
  // fichas de 84. Prefijo PQ = gana a Q. Sin .ph no cambia nada.
  var PQ = Q.replace(':root', ':root.ph');
  var PH_W = [
    PQ + ' .cw-mentor .cw-who{font-size:var(--ph-cap);letter-spacing:.04em}',
    PQ + ' .cw-mentor h3{font-size:var(--ph-head)}',
    PQ + ' .cw-mentor .cw-n{font-size:var(--ph-cap)}',
    PQ + ' .cw-mentor .cw-line{font-size:var(--ph-body)}',
    PQ + ' .cw-who{font-size:var(--ph-cap);letter-spacing:.04em}',
    PQ + ' .cw-n{font-size:var(--ph-cap)}',
    PQ + ' .cw-kick{font-size:var(--ph-cap);letter-spacing:.04em}',
    PQ + ' .cw-line{font-size:var(--ph-body)}',
    PQ + ' .cw-opt b{font-size:var(--ph-row)}',
    PQ + ' .cw-nb{min-height:48px;padding:8px 12px}',
    PQ + ' .cw-nb small{font-size:var(--ph-cap);letter-spacing:.03em}',
    PQ + ' .cw-nb b{font-size:var(--ph-row)}',
    PQ + ' .cw-mk{font-size:var(--ph-cap)}',
    PQ + ' button.cw-row{min-height:48px;font-size:var(--ph-row)}',
    PQ + ' .cw-rn b{font-size:var(--ph-row)}',
    PQ + ' .cw-row small{font-size:var(--ph-label)}',
    PQ + ' .cw-nick{font-size:var(--ph-body)}',
    PQ + ' .cw-big{font-size:var(--ph-head)}',
    PQ + ' .cw-form small{font-size:var(--ph-label)}',
    PQ + ' .cw-tl li{font-size:var(--ph-body)}',
    PQ + ' .tc-grid{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px}',
    PQ + ' .tc-slot{min-height:84px;padding:10px 6px}',
    PQ + ' .tc-slot:nth-child(odd){transform:rotate(-1.5deg)}',
    PQ + ' .tc-slot:nth-child(3n){transform:rotate(1.8deg)}',
    PQ + ' .tc-n{font-size:var(--ph-cap);-webkit-line-clamp:unset;display:block}',
    PQ + ' .tc-slot small{font-size:var(--ph-cap)}',
    // móvil: cada hueco = el trofeo y su nombre (2 líneas); lo que pide y lo que desbloquea, en una hoja al tocarlo (cw-tc)
    PQ + ' .tc-slot small{display:none}',
    PQ + ' .tc-n{font:700 var(--ph-cap)/1.15 var(--sp-ui);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:normal;hyphens:auto}',
    PQ + ' button.tc-slot{-webkit-appearance:none;appearance:none;width:100%;min-height:84px;margin:0;background:none;box-shadow:none;border:0;color:inherit;font:inherit;letter-spacing:0;text-transform:none;text-shadow:none;cursor:pointer;justify-content:flex-start;filter:none}',
    PQ + ' button.tc-slot:hover{background:none;filter:none}',
    PQ + ' button.tc-slot:active .tc-st{transform:scale(.94)}',
    PQ + ' button.tc-slot:is(.kf,:focus-visible){outline:none;box-shadow:0 0 0 2.5px var(--sp-gold);border-radius:12px}',
    '.sp-sheet.cr-tcs .tc-sh p{margin:0 0 8px;font:600 var(--ph-body,15px)/1.35 var(--sp-ui)}',
    '.sp-sheet.cr-tcs .tc-sh p.ul{color:#7fe6dc}'
  ];
  var SPLAT_W = [
    Q + ' .card.cw-mentor{background:var(--sp-cream);color:var(--sp-ink);border-radius:22px 26px 24px 8px/24px 20px 26px 10px;box-shadow:0 0 0 3px var(--sp-ink),5px 7px 0 var(--sp-ink);padding:12px 14px}',
    Q + ' .cw-mentor .cw-face{width:62px;height:62px;filter:drop-shadow(2px 3px 0 var(--sp-ink));transform:rotate(-6deg)}',
    Q + ' .cw-mentor .cw-who{color:var(--sp-teal-d);font:800 11px var(--sp-ui);letter-spacing:.14em}',
    Q + ' .cw-mentor h3{color:var(--sp-ink);font:400 clamp(14px,2.4vh,18px)/1.1 var(--sp-pop);letter-spacing:.02em;margin:2px 0 3px}',
    Q + ' .cw-mentor .cw-n{color:rgba(21,16,42,.6);font:700 12px var(--sp-ui)}',
    Q + ' .cw-mentor .cw-line{color:var(--sp-ink);font:600 clamp(14px,2.2vh,16px)/1.35 var(--sp-ui)}',
    Q + ' .cw-mentor .acts{justify-content:flex-end;margin-top:8px}',
    '@media (min-aspect-ratio:5/4){' + Q + ' .cw-mentor .acts{margin:0 0 6px}}',   // (REV-11: «Vale» a la derecha; los 6 px, para la cola del bocadillo)
    Q + ' .cw-mentor .acts>.sp-btn{flex:0 0 auto;min-width:120px}',
    // recortes de noticias (papel crema, cada uno un poco torcido) y filas de clubes (pegatinas de tinta clara)
    Q + ' .cw-list{gap:9px}',
    Q + ' :is(button,div).cw-nb{background:var(--sp-cream);color:var(--sp-ink);border-radius:6px 10px 7px 12px/10px 6px 12px 7px;box-shadow:' + STK + ';padding:8px 12px 9px;transform:rotate(-.35deg)}',
    Q + ' :is(button,div).cw-nb:nth-child(even){transform:rotate(.3deg);border-radius:10px 6px 12px 7px/6px 10px 7px 12px}',
    Q + ' button.cw-nb:hover{background:var(--sp-cream2)}',
    Q + ' .cw-nb small{color:rgba(21,16,42,.62);font:800 10.5px var(--sp-ui);letter-spacing:.1em}',
    Q + ' .cw-nb b{color:var(--sp-ink);font:600 clamp(14px,2.1vh,15.5px)/1.3 var(--sp-ui)}',
    Q + ' .cw-nb.me{box-shadow:inset 7px 0 0 var(--sp-kit),' + STK + ';padding-left:16px}',
    Q + ' .cw-nb.rv{box-shadow:inset 7px 0 0 var(--sp-danger),' + STK + ';padding-left:16px}',
    Q + ' button.cw-nb:is(.kf,:focus-visible){box-shadow:' + FOC + ';transform:none}',
    Q + ' button.cw-nb.me:is(.kf,:focus-visible){box-shadow:inset 7px 0 0 var(--sp-kit),' + FOC + '}',
    Q + ' .cw-mk{border-radius:5px 8px 6px 7px;background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 1.5px var(--sp-ink);font:700 11.5px/1.2 var(--sp-ui)}',
    Q + ' .cw-mk.rv,' + Q + ' .cw-nb small .cw-mk{background:var(--sp-danger);color:#fff6e4}',
    Q + ' button.cw-row{background:rgba(255,244,220,.08);color:var(--sp-cream);border-radius:12px 16px 13px 17px/16px 12px 17px 13px;box-shadow:' + STK + ';padding:7px 12px;font:600 14.5px/1.3 var(--sp-ui);text-transform:none}',
    Q + ' button.cw-row:nth-child(even){border-radius:16px 12px 17px 13px/12px 16px 13px 17px;background:rgba(255,244,220,.12)}',
    Q + ' button.cw-row.me{box-shadow:inset 7px 0 0 var(--sp-kit),' + STK + '}',
    Q + ' button.cw-row.rv{box-shadow:inset 7px 0 0 var(--sp-danger),' + STK + '}',
    Q + ' button.cw-row:is(.kf,:focus-visible){box-shadow:' + FOC + '}',
    Q + ' .cw-rn b{font:400 15px var(--sp-pop);letter-spacing:.01em}',
    Q + ' .cw-go{font:400 22px var(--sp-pop);color:var(--sp-gold)}',
    Q + ' .cw-crest{filter:drop-shadow(1.5px 2px 0 var(--sp-ink))}',
    Q + ' .cw-card .row>.cw-crest{transform:rotate(-5deg)}',
    Q + ' .cw-kick{color:var(--sp-gold);font:800 11px var(--sp-ui);letter-spacing:.12em}',
    Q + ' .cw-big{font:400 22px var(--sp-pop);color:var(--sp-gold)}',
    Q + ' .cw-form i{box-shadow:0 0 0 2px var(--sp-ink)}',
    Q + ' .cw-tl li{font:600 14.5px var(--sp-ui)}',
    // vitrina: sellos dorados con contorno y aro discontinuo; los huecos por ganar, círculo de trazo discontinuo
    Q + ' .tc-grid{gap:10px}',
    Q + ' .tc .tc-g{font:400 12px var(--sp-pop);letter-spacing:.04em;color:var(--sp-gold)}',
    Q + ' .tc-slot,' + Q + ' .tc-slot.got,' + Q + ' .tc-slot.empty{background:none;box-shadow:none;border:0;padding:6px 4px;gap:5px}',
    Q + ' .tc-st{position:relative;display:grid;place-items:center;width:clamp(48px,8.6vh,62px);height:clamp(48px,8.6vh,62px);border-radius:50%;flex:none;box-sizing:border-box}',
    Q + ' .tc-slot.got .tc-st{background:var(--sp-gold);box-shadow:0 0 0 3px var(--sp-ink),inset 0 0 0 4px var(--sp-gold),inset 0 0 0 5.5px rgba(21,16,42,.45),3px 4px 0 3px var(--sp-ink);transform:rotate(-10deg)}',
    Q + ' .tc-slot.got:nth-child(even) .tc-st{transform:rotate(8deg)}',
    Q + ' .tc-slot.empty .tc-st{border:2.5px dashed rgba(255,244,220,.35)}',
    Q + ' .tc-st svg{width:58%;height:58%}',
    Q + ' .tc-slot.got .tc-st svg{fill:var(--sp-cream)}',
    Q + ' .tc-x{position:absolute;right:-8px;top:-6px;padding:1px 5px;border-radius:7px 9px 6px 8px;background:var(--sp-danger);color:#fff6e4;box-shadow:0 0 0 2px var(--sp-ink);font:400 11px/1.2 var(--sp-pop);font-style:normal;transform:rotate(8deg)}',
    Q + ' .tc-n{font:600 12.5px/1.2 var(--sp-ui)}',
    Q + ' .tc-slot.got .tc-n{color:var(--sp-cream)}',
    // teléfono en vertical: retrato más pequeño, la frase en 4 líneas como mucho y los botones en una fila
    '@media (max-width:560px){',
    ' ' + Q + ' .cw-mentor .cw-face{width:44px;height:44px}',
    ' ' + Q + ' .cw-mentor .cw-line{font-size:14px;line-height:1.28;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    ' ' + Q + ' .cw-mentor .acts{margin-top:2px}',
    ' ' + Q + ' .card.cw-mentor{padding:10px 12px}',
    ' ' + Q + ' .cw-mentor .acts>.sp-btn{min-width:96px;--sp-h:44px}',
    '}',
    '@media (max-height:420px){',
    ' ' + Q + ' .card.cw-mentor{padding:6px 10px}',
    ' ' + Q + ' .cw-mentor .cw-face{width:42px;height:42px}',
    ' ' + Q + ' .cw-mentor h3{font-size:14px;margin:0}',
    ' ' + Q + ' .cw-mentor .cw-line{font-size:13.5px;line-height:1.25}',
    ' ' + Q + ' .cw-mentor .acts{margin:0}',
    ' ' + Q + ' .cw-mentor .acts>.sp-btn{min-width:92px}',
    '}'
  ];
  var CSS = [
    '#career .cw-mentor{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;align-items:start}',
    // TV D1 (plano): la tarjeta plana de la Carrera con una franja turquesa a la izquierda (rótulo de TV); el cómic queda para «Jugar partido».
    // Misma especificidad que la regla plana de index.html (#app #career .card:not(.lf-ch):not(.confirm)) + 1: gana sin !important
    '#app #career .card.cw-mentor:not(.lf-ch):not(.confirm){background:linear-gradient(90deg,rgba(46,196,182,.2),rgba(46,196,182,0) 65%),var(--flat,rgba(46,39,86,.95));',
    ' box-shadow:0 0 0 1.5px var(--tk),inset 4px 0 0 #2ec4b6,var(--flat-sh,0 2px 0 var(--tk))}',
    // «Seguir» / «Vale»: acción de la tarjeta, plana con tinte turquesa (la naranja de cómic es solo «Jugar partido»)
    '#app #career .cw-mentor button.cw-ok:not(.pri):not(.warn):not([aria-pressed="true"]):not(.tab):not(.tb-k){background:rgba(46,196,182,.24);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(46,196,182,.85),var(--flat-sh,0 2px 0 var(--tk))}',
    '#app #career .cw-mentor button.cw-ok:not(.pri):not(.warn):not([aria-pressed="true"]):not(.tab):not(.tb-k):hover{background:rgba(46,196,182,.36)}',
    '#app #career .cw-mentor button.cw-ok:not(.pri):not(.warn):not([aria-pressed="true"]):not(.tab):not(.tb-k):is(:focus-visible,.kf){background:rgba(46,196,182,.36);box-shadow:var(--ring-f,inset 0 0 0 3px #ffb238),var(--flat-sh,0 2px 0 var(--tk))}',
    '#career .cw-face{width:56px;height:56px;flex:none;display:block}',
    '#career .cw-who{display:block;font:800 11.5px var(--display);letter-spacing:.1em;text-transform:uppercase;color:#7fe6dc;text-shadow:none}',
    '#career .cw-mentor h3{margin:1px 0 2px;display:flex;gap:8px;align-items:baseline}',
    '#career .cw-n{font:700 12px var(--ui);color:var(--soft,#cfc8f2);letter-spacing:0;text-transform:none}',
    '#career .cw-line{font:600 15.5px/1.32 var(--ui);margin:2px 0 0}',
    '#career .cw-mentor .acts{grid-column:1/-1;margin:6px 0 0}',
    // REV-11: en apaisado y PC, «Vale» a la derecha del texto (en su fila propia dejaba 70-90 px de crema vacía y bajaba la Carrera)
    '@media (min-aspect-ratio:5/4){#career .cw-mentor{grid-template-columns:auto minmax(0,1fr) auto}#career .cw-mentor .acts{grid-column:3;grid-row:1;align-self:center;margin:0 0 6px}}',
    // teléfono apaisado: retrato de 40 px, botones a la derecha y la tarjeta ≤ 120 px, para que «Jugar partido» siga a la vista
    '@media (max-height:420px){',
    ' #career .cw-mentor{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:2px 10px;padding:6px 10px;max-height:120px;overflow:hidden}',
    ' #career .cw-face{width:40px;height:40px}',
    ' #career .cw-mentor h3{font-size:15px;margin:0}',
    ' #career .cw-who{display:none}',
    ' #career .cw-line{font-size:13.5px;line-height:1.25;margin:1px 0 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    ' #career .cw-mentor .acts{grid-column:3;grid-row:1;margin:0;display:flex;flex-wrap:nowrap;gap:8px}',
    ' #career .cw-mentor .acts button{flex:none;min-height:44px;min-width:84px;padding:0 12px;font-size:15px}',
    '}',
    '.is-touch #career .cw-mentor .acts button{min-height:44px}',
    '#career .cw-opt{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 0}',
    '#career .cw-opt b{font:700 16px var(--ui);letter-spacing:0;text-transform:none;margin-right:auto}',
    // noticias y clubes (C2): filas-botón planas (no los botones gordos del hub)
    '#career .cw-list{display:grid;gap:6px}',
    '#career button.cw-nb,#career div.cw-nb,#career button.cw-row{display:block;width:100%;text-align:left;min-height:44px;padding:7px 10px;border-radius:8px;background:rgba(0,0,0,.2);box-shadow:none;text-shadow:none;text-transform:none;letter-spacing:0;font:600 14.5px/1.3 var(--ui);color:#fff}',
    '#career button.cw-nb:hover,#career button.cw-row:hover{background:rgba(255,255,255,.08)}',
    '#career .cw-nb small{display:flex;gap:8px;align-items:center;font:800 11px var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}',
    '#career .cw-nb b{display:block;font:700 14.5px/1.3 var(--ui)}',
    '#career .cw-nb.me{background:rgba(255,210,63,.13);box-shadow:inset 3px 0 0 var(--gold)}',
    '#career .cw-nb.rv{background:rgba(255,90,110,.12);box-shadow:inset 3px 0 0 #ff7a8a}',
    '#career .cw-nb.fresh small::after{content:"";width:8px;height:8px;border-radius:50%;background:#ff8040;box-shadow:0 0 0 1.5px var(--tk)}',
    '#career .cw-mk{display:inline-block;margin-left:8px;padding:2px 7px;border-radius:4px;font:700 11.5px/1.2 var(--ui);letter-spacing:0;text-transform:none;background:#ffd23f;color:var(--tk);vertical-align:.1em}',
    '#career .cw-mk.rv{background:#ff7a8a}#career .cw-nb small .cw-mk{background:#ff7a8a;margin-left:0}',
    '#career button.cw-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 8px;align-items:center}',
    '#career .cw-row.me{box-shadow:inset 3px 0 0 var(--gold)}#career .cw-row.rv{box-shadow:inset 3px 0 0 #ff7a8a}',
    '#career .cw-row .kit-mini{margin-right:0}',
    '#career .cw-rn{min-width:0}#career .cw-rn b{font:800 15px var(--ui)}',
    '#career .cw-rn small{display:block;margin-top:3px}',
    '#career .cw-go{font:900 20px var(--display);color:var(--muted)}',
    '#career button.cw-back{min-height:44px;font-size:14px;padding:0 12px}',
    '#career .cw-kick{display:block;font:800 11.5px var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--gold);text-shadow:none}',
    '#career .cw-nick{margin:3px 0 0;font:700 14px var(--ui);color:var(--soft,#cfc8f2)}#career .cw-nick i{font-weight:600}',
    '#career .cw-big{font:900 22px var(--display);letter-spacing:.03em;margin:0}',
    '#career .cw-form{display:flex;gap:6px;align-items:center;margin:8px 0 0}#career .cw-form i{width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 1.5px var(--tk)}',
    '#career .cw-form i.w{background:#4be0a0}#career .cw-form i.l{background:#ff7a8a}#career .cw-form small{margin-left:4px;color:var(--muted);font:600 12.5px var(--ui)}',
    '#career .cw-tl{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:4px}#career .cw-tl li{font:600 14.5px var(--ui)}',
    '#career .cw-head .cw-list{margin-bottom:8px}',
    '#career .cw-nb:focus-visible,#career .cw-nb.kf,#career .cw-row:focus-visible,#career .cw-row.kf{box-shadow:inset 0 0 0 3px #ffb238}',
    // S2 B2b: escudo paródico (SVG en línea; tamaños 72 ficha, 56 VS y ofertas, 40 portada y cabecera, 22 mini en tablas)
    '.cw-crest{display:inline-block;vertical-align:middle;flex:none;overflow:visible}',
    '#career .cw-card .row>.cw-crest{margin-right:10px}',
    // S2 B2c: vitrina con huecos (no enfocables). 3 por fila a 390 px. T21: bloques de 3 huecos uno al lado del otro, llenando el
    // ancho (1280: tres bloques por fila; 844 y 667: dos; móvil en vertical: uno). Un circuito es un bloque; Premios y Otros títulos se
    // parten de 3 en 3; los grupos cortos seguidos comparten bloque (pista: Liga 2 + Copa 1), cada uno con su cabecera encima de
    // sus huecos (fila 1 cabeceras con span, fila 2 huecos). Todos los huecos miden lo mismo
    '#career .tc .tc-g{grid-row:1;margin:10px 0 -2px;font:800 11.5px var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-shadow:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '#career .tc .tc-g.s2{grid-column:span 2}#career .tc .tc-g.s3{grid-column:span 3}#career .tc-grid>.tc-slot{grid-row:2}#career .tc-grid.tall>.tc-slot{grid-row:auto}',
    '#career .tc-gs{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:0 18px;align-items:start}',
    '#career .tc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:0}',
    '#career .tc-slot{display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;padding:8px 6px;border-radius:10px;min-width:0}',
    '#career .tc-slot svg{width:34px;height:34px;flex:none}',
    '#career .tc-slot.got{background:rgba(255,210,63,.14);box-shadow:inset 0 0 0 1.5px var(--gold,#ffd23f);color:var(--gold,#ffd23f)}',
    '#career .tc-slot.empty{box-shadow:none;border:1.5px dashed rgba(255,255,255,.3);color:#fff}',
    '#career .tc-slot.empty svg{opacity:.35}',
    '#career .tc-n{font:700 12.5px/1.2 var(--ui);color:#fff;letter-spacing:0;text-transform:none;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}',
    '#career .tc-slot small{display:block;font:600 11.5px/1.2 var(--ui);color:var(--muted);letter-spacing:0;text-transform:none}',
    '#career .tc-slot.got small{color:#ffe28a}#career .tc-slot small.tc-ul{color:#7fe6dc}'
  ].concat(SPLAT_W, PH_W).join('\n');
  function css() { if (typeof document === 'undefined' || document.getElementById('careerWorldCss')) return; var s = document.createElement('style'); s.id = 'careerWorldCss'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------------------------------------------------------------- Partido: escena de Faro
  /** Tarjeta del mentor (o '' si no hay escena o están apagadas). La frase actual vive aquí (li); solo «Vale» llama a mentorDone. */
  function mentorCard(c, h0) {
    H = h0; css();
    var sc = W() && W().mentorScene ? W().mentorScene(c) : null; if (!sc || !sc.lines.length) { li = 0; liKey = ''; return ''; }
    var key = sc.id + ':' + (c.world.mentor.q[0].s | 0);
    if (key !== liKey) { liKey = key; li = 0; }
    if (li >= sc.lines.length) li = sc.lines.length - 1;
    var last = li === sc.lines.length - 1, n = sc.lines.length, go = last && sc.act ? sc.act.split(':') : null;
    return '<div class="card cw-mentor" role="region" aria-label="Faro, tu mentor">' + FACE +
      '<div><small class="cw-who">' + sp([esc(sc.who.nick), esc(sc.who.role)], 'd') + '</small>' +
      '<h3>' + esc(sc.title) + (n > 1 ? ' <span class="cw-n">' + (li + 1) + '/' + n + '</span>' : '') + '</h3>' +
      '<p class="cw-line" aria-live="polite">' + esc(sc.lines[li]) + '</p></div>' +
      '<div class="acts"><button class="cw-ok" data-act="cw-next">' + (last ? 'Vale' : 'Seguir') + '</button>' +
      (go ? '<button data-act="cw-go" data-tab-go="' + esc(go[0]) + '" data-s-go="' + esc(go[1] || '') + '">' + esc(sc.actLabel || 'Ver') + '</button>'
        : last ? '' : '<button data-act="cw-skip">Saltar</button>') + '</div></div>';
  }

  // ---------------------------------------------------------------- Palmarés › Opciones
  function optsHTML(c, h0) {
    H = h0; css(); if (!W()) return '';
    var on = W().mentorOn ? W().mentorOn(c) : true;
    return '<div class="cw-opt" role="group" aria-label="Escenas del mentor"><b>Escenas del mentor</b>' +
      '<button data-act="cw-mentor-on" aria-pressed="' + on + '">Sí</button><button data-act="cw-mentor-off" aria-pressed="' + !on + '">No</button></div>' +
      '<p class="muted" style="margin:4px 0 8px">' + (on ? 'Faro sale en Partido en los momentos clave. Lo que saltes queda en Mensajes.' : 'Faro no sale en pantalla: sus consejos llegan a Mensajes.') + '</p>';
  }

  // ---------------------------------------------------------------- E5 (tarea C2): noticias y clubes
  function ordn(n) { return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function stars(n) { var s = ''; for (var i = 0; i < 5; i++) s += i < n ? '★' : '<span class="off">★</span>'; return '<span class="stars" aria-label="Prestigio ' + n + ' de 5">' + s + '</span>'; }
  /** Escudo mini (22) de una fila de club; sin escudos (HLP sin crest), la muestra de equipación de siempre. */
  function kitMini(c, r) {
    if (!H || !r) return '';
    if (H.crest) { var k = C().club ? C().club(c, r.id) : null; if (k) return H.crest(k, 22, { c: c }); }
    return H.kitSw && r.kit ? H.kitSw(r.kit).replace('cr-kit', 'cr-kit kit-mini') : '';
  }
  /** Una noticia: botón que abre la ficha de su primer club (si existe) o texto suelto. fresh: sin ver hasta este pintado. */
  function newsItem(c, x, fresh) {
    var id = x.c && x.c.length ? x.c[0] : -1, k = id >= 0 ? C().club(c, id) : null;
    var cls = 'cw-nb' + (x.me === 1 ? ' me' : x.me === 2 ? ' rv' : '') + (fresh ? ' fresh' : '');
    var inner = '<small>' + esc(W().newsWhen(x)) + (x.me === 2 && /^rival/.test(x.k) ? '<span class="cw-mk">Tu rival</span>' : '') + '</small><b>' + esc(x.t) + '</b>';
    return k ? '<button class="' + cls + '" data-act="cw-club" data-id="' + k.id + '" aria-label="' + esc(x.t) + '. Ver la ficha de ' + esc(k.name) + '">' + inner + '</button>'
      : '<div class="' + cls + '">' + inner + '</div>';
  }
  /** Partido, tras el último resultado: las 2 últimas noticias, solo si hay alguna sin ver. */
  function headlines(c, h0) {
    H = h0; css(); var w = W(); if (!w || !w.news || !c) return '';
    var un = w.newsUnseen(c); if (!(un > 0)) return '';
    var l = w.news(c, 2), s0 = c.world ? c.world.newsSeen | 0 : 0;
    return '<div class="card cw-head"><h3>' + sp(['Titulares', plural(un, 'nueva', 'nuevas')], 'v') + '</h3><div class="cw-list">' + l.map(function (x) { return newsItem(c, x, x.id > s0); }).join('') + '</div>' +
      '<div class="acts"><button data-tab="league" data-s="news">Ver noticias</button></div></div>';
  }
  /** Liga › Noticias (de la más nueva a la más vieja). seen0 = newsSeen de antes de marcarlas: resalta las que eran nuevas. */
  function newsHTML(c, h0, seen0) {
    H = h0; css(); var w = W(); if (!w || !c) return '';
    var l = w.news(c), s0 = seen0 != null ? seen0 | 0 : (c.world ? c.world.newsSeen | 0 : 0), me = C().myClub(c), ML = me && (w.lgOf ? w.lgOf(c, me) : C().league(me.lvl));
    if (!l.length) return '<div class="card"><h3>Noticias</h3><p class="muted">Aún no hay noticias. Llegan al cerrar cada jornada: resultados, rachas, líderes y tu rival.</p></div>';
    return '<div class="card"><h3>' + sp(['Noticias', ML ? esc(ML.name) : ''], 'd') + '</h3><div class="cw-list">' + l.map(function (x) { return newsItem(c, x, x.id > s0); }).join('') + '</div>' +
      '<p class="muted" style="margin-top:8px">Toca una noticia para ver la ficha del club. Se guardan las ' + (w.NEWS_MAX || 60) + ' últimas.</p></div>';
  }
  function lgSw(lvl) {
    return '<div class="lg-sw" role="group" aria-label="Liga">' + C().LEAGUES.map(function (x) {
      return '<button data-act="lvl" data-l="' + x.lvl + '" aria-pressed="' + (x.lvl === lvl) + '">' + esc(x.short) + '</button>';
    }).join('') + '</div>';
  }
  /** Liga › Clubes: la lista de una liga (selector compartido con Clasificación) o, con un club elegido, su ficha.
   *  sw: el selector de liga ya hecho (pista: país y división, el de Clasificación); sin él, el de los 5 circuitos de playa. */
  function clubsHTML(c, lvl, h0, sw) {
    H = h0; css(); var w = W(); if (!w || !c) return '';
    if (sel != null) { var card = w.clubCard(c, sel); if (card) return cardHTML(c, card); sel = null; }
    var L = lgBy(c, lvl), rows = w.clubRows(c, lvl); if (!L) return '';
    return '<div class="card">' + (sw != null ? sw : lgSw(lvl)) + '<h3>' + sp([esc(L.name), plural(rows.length, 'club', 'clubes')], 'd') + '</h3><div class="cw-list">' + rows.map(function (r) {
      var vs = r.vs ? { h: 'Tú ' + r.vs.g + '-' + r.vs.p, c: 'dv' + (r.vs.g > r.vs.p ? ' g' : r.vs.g < r.vs.p ? ' r' : '') } : '';
      var mk = r.mine ? '<span class="cw-mk">Tu club</span>' : r.rival ? '<span class="cw-mk rv">Tu rival juega aquí</span>' : '';
      return '<button class="cw-row' + (r.mine ? ' me' : r.rival ? ' rv' : '') + '" data-act="cw-club" data-id="' + r.id + '">' + kitMini(c, r) +
        '<span class="cw-rn"><b>' + esc(r.name) + '</b>' + mk + '<small>' + sp([r.pj ? ordn(r.pos) : '', 'Media ' + r.ovr, { h: stars(r.stars) }, vs], 'c') + '</small></span><span class="cw-go" aria-hidden="true">›</span></button>';
    }).join('') + '</div></div>';
  }
  var KIND_T = { liga: 'Liga', copa: 'Open', ascenso: 'Ascenso' }, KIND_T6 = { liga: 'Liga', copa: 'Copa', ascenso: 'Ascenso' };
  function cardHTML(c, k) {
    var lo = k.lore || {}, h = '', hall = isH(c), KT = hall ? KIND_T6 : KIND_T;
    // 1) cabecera
    h += '<div class="card cw-card"><button class="cw-back" data-act="cw-list">‹ Clubes</button><div class="row" style="margin-top:8px">' + (H.crest ? H.crest(k, 72, { c: c }) : H.kitSw ? H.kitSw(k.kit, true) : '') +
      '<div class="grow" style="min-width:0"><small class="cw-kick">' + sp([esc(k.league), 'Fundado en ' + lo.founded], 'd') + '</small><p class="bigname" style="font-size:21px">' + esc(k.name) + '</p>' +
      '<p class="cw-nick">' + esc(lo.nick) + ' <i>«' + esc(lo.motto) + '»</i></p></div></div>' +
      '<p class="muted" style="margin-top:6px">' + sp([{ h: stars(k.stars) }, 'Media ' + k.ovr, esc(k.style), esc(k.beach || k.city)], 'c') + '</p>' +
      (k.mine ? '<p><span class="tag g">Tu club</span></p>' : k.rival ? '<p><span class="tag r">Aquí juega tu rival</span></p>' : '') + '</div>';
    // 2) esta temporada
    h += '<div class="card"><h3>Esta temporada</h3>' + (k.pj ? '<p class="cw-big">' + sp([ordn(k.pos), plural(k.pts, 'punto', 'puntos')], 'd') + '</p>' : '<p class="muted">Aún sin jugar en ' + esc(k.league) + '.</p>') +
      (k.form.length ? '<p class="cw-form" aria-label="Últimos ' + k.form.length + ': ' + k.form.map(function (f) { return f ? 'victoria' : 'derrota'; }).join(', ') + '">' + k.form.map(function (f) { return '<i class="' + (f ? 'w' : 'l') + '"></i>'; }).join('') + '<small>Últimos ' + k.form.length + '</small></p>' : '') + '</div>';
    // 3) palmarés: el de tu carrera (anales y tus trofeos «contigo») y lo de antes, inventado
    var old = [lo.oldLg ? plural(lo.oldLg, 'título', 'títulos') : '', lo.oldCup ? (hall ? plural(lo.oldCup, 'copa', 'copas') : plural(lo.oldCup, 'open', 'opens')) : ''].filter(function (x) { return x; });
    h += '<div class="card"><h3>Palmarés</h3>' + (k.titles.length ? '<ul class="cw-tl">' + k.titles.map(function (t) {
      return '<li><span class="tag ' + (t.kind === 'ascenso' ? 'g' : 'y') + '">' + esc(KT[t.kind] || t.kind) + '</span>' + esc(t.name) + ' (T' + t.s + ')' + (t.you ? ' <span class="muted">(contigo)</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<p>Nada todavía en tu carrera.</p>') +
      '<p class="muted">' + (old.length ? 'Antes de tu carrera: ' + old.join(' y ') : 'Sin títulos antes de tu carrera') + '.</p></div>';
    // 4) trayectoria (8 últimas temporadas, la más reciente arriba)
    if (k.path.length) {
      h += '<div class="card"><h3>Trayectoria</h3><table><thead><tr><th class="l">T</th><th class="l">' + (hall ? 'Liga' : 'Circuito') + '</th><th>Pos.</th></tr></thead><tbody>' + k.path.slice().reverse().map(function (p) {
        return '<tr><td class="l">T' + p.s + '</td><td class="l">' + esc(p.league) + '</td><td>' + ordn(p.pos) + (p.move > 0 ? ' <span class="w" aria-label="ascenso">↑</span>' : p.move < 0 ? ' <span class="l" aria-label="descenso">↓</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    // 5) contra ti
    var v = k.vs, my = k.mySeasons.filter(function (s) { return s >= 1; });
    h += '<div class="card"><h3>Contra ti</h3>' + (v ? '<p>' + sp(['PJ ' + v.pj, 'G ' + v.g, 'P ' + v.p, 'Sets ' + v.sf + '-' + v.sc, 'Último: T' + v.last], 'v') + '</p>'
      : '<p class="muted">' + (k.mine ? 'Es tu club: aquí no hay cara a cara.' : 'Aún no os habéis enfrentado' + (k.since > 1 ? ' desde la temporada ' + k.since : '') + '.') + '</p>') +
      (my.length ? '<p>' + (k.mine ? 'Juegas aquí: ' : 'Jugaste aquí: ') + my.map(function (s) { return 'T' + s; }).join(', ') + '</p>' : '') +
      (k.rival ? '<p>Aquí juega tu rival ' + esc(k.rival.name) + ' (cara a cara ' + k.rival.w + '-' + k.rival.l + ')</p>' : '') + '</div>';
    return h;
  }
  /** career-ui, al entrar en Liga › Clubes desde la barra: vuelve a la lista. */
  function reset() { sel = null; }

  // ---------------------------------------------------------------- S2 B2b: escudo paródico (SVG en línea, sin red)
  var INK = '#1d1530';
  var SHAPE_D = {
    clasico: 'M5 5H59V36C59 53 46 63 32 69C18 63 5 53 5 36Z',
    redondo: 'M3 36A29 29 0 1 0 61 36A29 29 0 1 0 3 36Z',
    frances: 'M5 5H59V42L32 69L5 42Z',
    hex: 'M32 3L60 19V53L32 69L4 53V19Z',
    moderno: 'M5 5H47L59 17V67H5Z'
  };
  function hexC(n) { return '#' + ('00000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function divSVG(d, c2) {
    var f = ' fill="' + c2 + '"';
    if (d === 'partido') return '<rect x="32" y="0" width="32" height="72"' + f + '/>';
    if (d === 'tronchado') return '<path d="M64 0V72H0Z"' + f + '/>';
    if (d === 'franja') return '<rect x="0" y="29" width="64" height="14"' + f + '/>';
    if (d === 'cuartel') return '<path d="M0 0H32V36H0ZM32 36H64V72H32Z"' + f + '/>';
    return '';
  }
  // Emblemas genéricos (centrados en 0,0, ±12): blanco con contorno de tinta; los de trazo (sol, ancla) van con trazo doble
  function line2(d) { return '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '" stroke="' + INK + '" stroke-width="5.5"/><path d="' + d + '" stroke="#fff" stroke-width="2.6"/></g>'; }
  var EMB = {
    balon: '<circle r="11"/><path d="M-11 0C-4-3 4-3 11 0M-6-9C-1-3-1 3-6 9M6-9C1-3 1 3 6 9" fill="none"/>',
    estrella: '<path d="M0-12L2.94-4.05L11.41-3.71L4.76 1.55L7.05 9.71L0 5L-7.05 9.71L-4.76 1.55L-11.41-3.71L-2.94-4.05Z"/>',
    ola: '<path d="M-12 3C-9-5-3-7 1-3C3-1 2 2-1 2C3 5 8 3 12-1V9H-12Z"/>',
    sol: line2('M0-12V-9M0 9V12M-12 0H-9M9 0H12M-8.5-8.5L-6.4-6.4M6.4 6.4L8.5 8.5M-8.5 8.5L-6.4 6.4M6.4-6.4L8.5-8.5') + '<circle r="6"/>',
    red: '<rect x="-12" y="-8" width="24" height="16" rx="1.5"/><path d="M-6-8V8M0-8V8M6-8V8M-12 0H12" fill="none"/>',
    torre: '<path d="M-9 12V-4H-11V-12H-6V-8H-2V-12H2V-8H6V-12H11V-4H9V12Z"/><path d="M-3 12V5A3 3 0 0 1 3 5V12Z" fill="' + INK + '"/>',
    ancla: line2('M0-6V10M-6-3H6M-10 3C-10 9-5 11 0 11C5 11 10 9 10 3') + '<circle cy="-9" r="3"/>',
    rayo: '<path d="M3-12L-8 2H-1L-4 12L8-3H1Z"/>'
  };
  var crestTpl = {}, crestTplN = 0, crestN = 0;
  /** Escudo de un club en SVG (px = ancho; alto = px × 72/64). o: {c (la Carrera; si no, la guardada), label (aria-label; si no,
   *  decorativo), year (false: sin año)}. ≤ 28 px: mini (sin banda); ≥ 64 px: con el año de fundación. Plantilla en caché con %ID%
   *  para el clipPath (id único por instancia: innerHTML repite escudos). Sin career-world.js: la muestra de equipación. */
  function crestSVG(k, px, o) {
    o = o || {}; px = Math.max(12, Math.round(+px || 40));
    var w = W(), cr = k && w && w.crestOf ? w.crestOf(k, o.c || undefined) : null;
    if (!cr) return k && H && H.kitSw && k.kit ? H.kitSw(k.kit, px >= 48) : '';
    var cls = px <= 28 ? 'm' : px >= 64 ? 'l' : 's', year = cls === 'l' && o.year !== false && cr.year ? cr.year : 0;
    var key = [cr.shape, cr.div, cr.emblem, cr.c1, cr.c2, cr.txt, year, cls].join('|'), t = crestTpl[key];
    if (!t) {
      if (++crestTplN > 600) { crestTpl = {}; crestTplN = 1; }   // (tope de memoria: 390 clubes de pista × 2-3 tamaños)
      var d = SHAPE_D[cr.shape] || SHAPE_D.clasico, c1 = hexC(cr.c1), c2 = hexC(cr.c2);
      var ey = cls === 'm' ? 35 : cls === 'l' ? 22 : 25, es = cls === 'm' ? 1.15 : cls === 'l' ? 0.8 : 0.85, by = cls === 'l' ? 36 : 41;
      var txt = esc(cr.txt), fit = cr.txt.length > 3 ? ' textLength="40" lengthAdjust="spacingAndGlyphs"' : '';
      t = '<defs><clipPath id="%ID%"><path d="' + d + '"/></clipPath></defs>' +
        '<g clip-path="url(#%ID%)"><rect width="64" height="72" fill="' + c1 + '"/>' + divSVG(cr.div, c2) + '</g>' +
        '<g transform="translate(32 ' + ey + ') scale(' + es + ')" fill="#fff" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round">' + (EMB[cr.emblem] || EMB.balon) + '</g>' +
        (cls !== 'm' ? '<rect x="9" y="' + by + '" width="46" height="14" rx="3" fill="' + INK + '"/><text x="32" y="' + (by + 11) + '" text-anchor="middle" fill="#fff"' + fit + ' style="font:900 13px var(--display,sans-serif)">' + txt + '</text>' : '') +
        (year ? '<text x="32" y="' + (by + 22) + '" text-anchor="middle" fill="' + INK + '" stroke="#fff" stroke-width="2" paint-order="stroke" style="font:800 7.5px var(--ui,sans-serif)">' + year + '</text>' : '') +
        '<path d="' + d + '" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="7" clip-path="url(#%ID%)"/>' +
        '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
      crestTpl[key] = t;
    }
    var id = 'cr' + (k.id != null ? String(k.id).replace(/\W/g, '') : 'x') + 'n' + (++crestN);
    return '<svg class="cw-crest cw-crest-' + cls + '" width="' + px + '" height="' + Math.round(px * 72 / 64) + '" viewBox="0 0 64 72"' +
      (o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"') + ' focusable="false">' + t.replace(/%ID%/g, id) + '</svg>';
  }

  // ---------------------------------------------------------------- S2 B2c: vitrina de palmarés con huecos
  var TC_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="currentColor" stroke="var(--tk,#1d1530)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">';
  var TC_ICON = {
    liga: '<path d="M9 4h14v7a7 7 0 0 1-14 0z"/><path d="M9 7H5.5a4 4 0 0 0 4 5M23 7h3.5a4 4 0 0 1-4 5" fill="none"/><path d="M14 18h4v5h-4zM10 23h12v5H10z"/>',
    copa: '<ellipse cx="16" cy="13" rx="12" ry="9"/><ellipse cx="16" cy="13" rx="6" ry="4.5" fill="none"/><path d="M13 22h6v4h-6zM10 26h12v3H10z"/>',
    intl: '<circle cx="16" cy="10" r="7"/><path d="M9 10h14M16 3c-3 4-3 10 0 14M16 3c3 4 3 10 0 14" fill="none"/><path d="M12 17h8l-2 6h-4zM10 23h12v5H10z"/>',
    ascenso: '<path d="M8 3v26" fill="none"/><path d="M9 4h15l-4 5 4 5H9z"/><path d="M22 28V19M18.5 22.5L22 19l3.5 3.5" fill="none"/>',
    premio: '<path d="M16 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L16 14.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/><path d="M14 17h4v6h-4zM10 23h12v5H10z"/>'
  };
  /** Dificultad de los títulos (como diffUsed de career-ui: solo si la carrera ha usado algo que no sea Normal; playa). */
  function tcDiff(c) {
    var CD = C() && C().CDIFF; if (!CD || !c || isH(c)) return null;
    var k = C().diffOf ? C().diffOf(c) : c.diff, o = function (x) { return x && x.d && x.d !== 'normal'; };
    if (!(CD[k] && k !== 'normal') && !(c.history || []).some(o) && !(c.trophies || []).some(o)) return null;
    var keys = C().CDIFF_KEYS || ['easy', 'normal', 'hard', 'expert'];
    return function (won) {
      var best = -1; won.forEach(function (x) { var i = keys.indexOf(CD[x.d] ? x.d : 'normal'); if (best < 0 || i < best) best = i; });
      return best >= 0 && CD[keys[best]] ? CD[keys[best]].name : '';
    };
  }
  function seasonsTxt(won) { var a = won.map(function (x) { return x.season; }); return W() && W()._andList ? W()._andList(a.map(String)) : a.join(', '); }
  var tcSlots = [];   // (móvil: los huecos pintados, para la hoja de cw-tc)
  function slotHTML(s, du) {
    var got = s.won.length > 0, n = s.won.length, ts = s.won.map(function (x) { return 'T' + x.season; }).join(', ');
    var line = got ? sp([n > 1 ? '×' + n : '', ts, du ? esc(du(s.won)) : ''], 'v') : '<small>' + esc(s.need) + '</small>';
    var ul = !got && s.unlock ? '<small class="tc-ul">Desbloquea: ' + esc(s.unlock.name) + '</small>' : '';
    var al = s.name + ': ' + (got ? 'ganado ' + (n === 1 ? '1 vez, temporada ' : n + ' veces, temporadas ') + seasonsTxt(s.won) : 'sin ganar' + (s.need ? '. ' + s.need : '')) + (ul ? '. Desbloquea: ' + s.unlock.name : '');
    // SPLAT: el trofeo en un sello dorado (ganado) o en su hueco de trazo discontinuo (por ganar)
    var ph = typeof document !== 'undefined' && document.documentElement.classList.contains('ph'), tag = ph ? 'button' : 'div';
    if (ph) tcSlots.push({ s: s, du: du });
    return '<' + tag + ' class="tc-slot ' + (got ? 'got' : 'empty') + '"' + (ph ? ' type="button" data-act="cw-tc" data-id="' + (tcSlots.length - 1) + '"' : ' role="img"') + ' aria-label="' + esc(al) + '"><span class="tc-st">' + TC_SVG + (TC_ICON[s.kind] || TC_ICON.premio) + '</svg>' + (n > 1 ? '<i class="tc-x">×' + n + '</i>' : '') + '</span>' +
      '<b class="tc-n">' + esc(s.name) + '</b>' + (got ? '<small>' + line + '</small>' : line) + ul + '</' + tag + '>';
  }
  /** Palmarés › Palmarés: «Vitrina (4 de 20)» con un bloque por grupo (playa: un circuito por bloque y Premios; pista: Liga, Copa,
   *  Internacional, Ascenso y Premios) y «Otros títulos» si algo no casa. Bloques .tc-grid de 3 huecos dentro de .tc-gs, que se reparten el
   *  ancho (grupos largos partidos, cortos juntos; cabecera h4.tc-g con .s2/.s3 según los huecos que cubre). Es su propia tarjeta. Sin career-world.js: ''. */
  function trophyCaseHTML(c, h0) {
    if (h0) H = h0; css();
    var w = W(); if (!w || !w.trophyCase || !c || !H) return '';
    var tc = w.trophyCase(c); if (!tc) return '';
    var du = tcDiff(c), groups = [], by = {}; tcSlots = [];
    tc.slots.concat(tc.other || []).forEach(function (s) { if (!by[s.group]) { by[s.group] = []; groups.push(s.group); } by[s.group].push(s); });
    // bloques de 3 huecos (los grupos cortos seguidos comparten bloque, greedy y en orden)
    var parts = [], blocks = [];
    // un grupo de más de 3 huecos (Premios: 6) va entero en su bloque, en filas de 3 bajo su cabecera: partido en dos bloques, la
    // continuación caía en otra columna (1280: bajo «Continental») y se leía como de otro grupo
    groups.forEach(function (g) { parts.push({ g: g, s: by[g] }); });
    parts.forEach(function (p) { var b = blocks[blocks.length - 1]; if (p.s.length <= 3 && b && b.n + p.s.length <= 3) { b.p.push(p); b.n += p.s.length; } else blocks.push({ p: [p], n: p.s.length }); });
    return '<div class="card tc"><h3>Vitrina <span class="muted">(' + tc.got + ' de ' + tc.total + ')</span></h3><div class="tc-gs">' + blocks.map(function (b) {
      var hs = b.p.map(function (p) {
        var cl = 'tc-g' + (p.s.length > 1 ? ' s' + Math.min(3, p.s.length) : '');
        return p.g ? '<h4 class="' + cl + '">' + esc(p.g) + '</h4>' : '<h4 class="' + cl + '" aria-hidden="true">&nbsp;</h4>';
      }).join('');
      return '<div class="tc-grid' + (b.n > 3 ? ' tall' : '') + '">' + hs + b.p.map(function (p) { return p.s.map(function (s) { return slotHTML(s, du); }).join(''); }).join('') + '</div>';
    }).join('') + '</div></div>';
  }

  // ---------------------------------------------------------------- acciones (career-ui.js onClick)
  /** Devuelve null si no es suya; si no, {render, focus, tab, s}: career-ui repinta, enfoca el selector o va a la pestaña. */
  function act(a, b) {
    var w = W(); if (!w) return null;
    switch (a) {
      case 'cw-next': {
        var c = C().get(), sc = c && w.mentorScene(c);
        if (sc && li < sc.lines.length - 1) { li++; return { render: true, focus: '[data-act="cw-next"]' }; }
        w.mentorDone(); li = 0; liKey = '';
        return { render: true, focus: '[data-act="cw-next"]' };
      }
      case 'cw-skip': w.mentorSkip(); li = 0; liKey = ''; return { render: true, focus: '[data-act="cw-next"]' };
      case 'cw-go': {
        var t = b && b.getAttribute('data-tab-go'), s = b && b.getAttribute('data-s-go');
        w.mentorDone(); li = 0; liKey = '';
        return { render: false, tab: t || '', s: s || '' };
      }
      case 'cw-mentor-on': w.setMentor(true); return { render: true, focus: '[data-act="cw-mentor-on"]' };
      case 'cw-mentor-off': w.setMentor(false); li = 0; liKey = ''; return { render: true, focus: '[data-act="cw-mentor-off"]' };
      case 'cw-club': {   // ficha de club (desde Clubes, Clasificación, Noticias o Titulares): va a Liga › Clubes
        var id = b ? +b.getAttribute('data-id') : NaN, cc = C().get();
        if (!(id >= 0) || !cc || !C().club(cc, id)) return null;
        sel = id; return { render: true, tab: 'league', s: 'clubs', focus: '[data-act="cw-list"]' };
      }
      case 'cw-tc': {   // móvil: un hueco de la Vitrina → hoja con lo que pide (o cuándo se ganó) y lo que desbloquea
        var tz = tcSlots[b ? +b.getAttribute('data-id') : -1]; if (!tz || !(VB.Splat && VB.Splat.sheet)) return null;
        var z = tz.s, zn = z.won.length, zh = '<div class="tc-sh">';
        if (zn) zh += '<p>' + (zn === 1 ? 'Ganado en la temporada ' : 'Ganado ' + zn + ' veces: temporadas ') + esc(seasonsTxt(z.won)) + (tz.du && tz.du(z.won) ? ' (' + esc(tz.du(z.won)) + ')' : '') + '</p>';
        else if (z.need) zh += '<p>' + esc(z.need) + '</p>';
        if (!zn && z.unlock) zh += '<p class="ul">Desbloquea: ' + esc(z.unlock.name) + '</p>';
        VB.Splat.sheet({ title: z.name, html: zh + '</div>', cls: 'cr-tcs' });
        try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('click'); } catch (e) { }
        return { render: false };
      }
      case 'cw-list': { var was = sel; sel = null; return { render: true, focus: was != null ? '[data-act="cw-club"][data-id="' + was + '"]' : '' }; }
    }
    return null;
  }
  /** Escape/B: true si cierra algo propio (la ficha de club). career-ui solo lo llama con Liga › Clubes a la vista. */
  function back() { if (sel != null) { lastSel = sel; sel = null; return true; } return false; }
  /** Tras back(): el selector de la fila del club que se cerraba (para devolverle el foco). */
  function focusSel() { return lastSel != null ? '.cw-row[data-id="' + lastSel + '"]' : ''; }

  VB.CareerWorldUI = { mentorCard: mentorCard, optsHTML: optsHTML, headlines: headlines, newsHTML: newsHTML, clubsHTML: clubsHTML, act: act, back: back, focusSel: focusSel, reset: reset, css: css, FACE: FACE,
    crestSVG: crestSVG, trophyCaseHTML: trophyCaseHTML,
    isCard: function () { return sel != null; } };
})();
