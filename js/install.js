/* MAKE THE CUT — js/install.js (owner: ui_main)
 * Tutorial de «instalar» el juego (añadirlo a la pantalla de inicio) para jugar a pantalla completa en el móvil, sin la barra de
 * direcciones. Pasos dibujados según dónde se abre: iPhone/iPad (Safari), Android (Chrome; botón «Instalar» directo si el
 * navegador lo ofrece) y navegadores de dentro de otras apps (WhatsApp, Instagram…), donde lo primero es abrirlo en el navegador.
 *  - Sale UNA vez, sola, la primera vez que se entra desde un móvil sin tenerlo instalado (clave 'make-the-cut.install').
 *  - Se cierra al momento: «Ahora no», la ✕, tocando fuera o con Esc. No vuelve a salir sola.
 *  - Se vuelve a abrir con VB.Install.open() (el botón «Pantalla completa» del menú en iPhone y en navegadores de apps).
 * Sin dependencias: crea su propio DOM y su CSS (usa los colores de index.html).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var KEY = 'make-the-cut.install';
  var ua = navigator.userAgent || '';
  var isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  // navegadores de dentro de apps: no instalan ni ponen pantalla completa
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|musical_ly|TikTok|Twitter|LinkedInApp|GSA\/|; wv\)/i.test(ua);
  var deferred = null; // evento beforeinstallprompt (Chrome Android / escritorio)
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; refreshBtn(); });
  window.addEventListener('appinstalled', function () { deferred = null; seen(); close(); });

  function touch() { try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch (e) { return false; } }
  function standalone() {
    try { return navigator.standalone === true || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }
  }
  function wasSeen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function seen() { try { localStorage.setItem(KEY, '1'); } catch (e) { } }

  // ---------------------------------------------------------------- dibujos (SVG en línea, estilo cartoon del juego)
  var INK = '#1d1530', GOLD = '#ffd23f', HOT = '#ff6a2e', PAPER = '#fff6e6', SCR = '#3a2c66';
  function phone(inner) {
    return '<svg viewBox="0 0 120 190" aria-hidden="true"><rect x="14" y="6" width="92" height="178" rx="16" fill="' + INK + '"/>' +
      '<rect x="20" y="14" width="80" height="162" rx="10" fill="' + SCR + '"/>' + inner + '</svg>';
  }
  function ring(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + GOLD + '" stroke-width="3.5" class="ix-pulse"/>'; }
  function finger(x, y) { // dedo que toca (la punta en x,y)
    // la punta queda justo debajo del objetivo (que se siga viendo) y la mano baja desde ahí
    return '<g transform="translate(' + (x + 6) + ' ' + (y + 11) + ') scale(.78)"><g class="ix-tap"><path d="M0 0c-3 0-5 2-5 5v16c-3-3-8-3-9 1 0 2 1 3 2 5l8 10c2 2 4 3 7 3h8c5 0 8-4 8-9V17c0-3-2-5-5-5-1 0-2 0-3 1 0-3-2-4-4-4-2 0-3 1-3 2V5c0-3-2-5-4-5z" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/></g></g>';
  }
  function shareIco(x, y, c) { // cuadrado con flecha hacia arriba (Compartir de iOS)
    return '<g transform="translate(' + x + ' ' + y + ')" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M-5 -1h-2v10h14V-1h-2"/><path d="M0 4V-9M-4 -5l4-4 4 4"/></g>';
  }
  function plusIco(x, y, c) { return '<g transform="translate(' + x + ' ' + y + ')" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round"><rect x="-6" y="-6" width="12" height="12" rx="3"/><path d="M0 -3v6M-3 0h6"/></g>'; }
  function ball(x, y, r) { // el icono del juego, en pequeño
    return '<g transform="translate(' + x + ' ' + y + ')"><rect x="' + (-r - 3) + '" y="' + (-r - 3) + '" width="' + (2 * r + 6) + '" height="' + (2 * r + 6) + '" rx="' + (r * 0.55) + '" fill="#2a1f4a" stroke="' + INK + '" stroke-width="1.5"/>' +
      '<circle r="' + r + '" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<g fill="none" stroke="' + INK + '" stroke-width="1.3" transform="scale(' + (r / 10) + ') translate(-12 -12)">' +
      ['0', '120', '240'].map(function (a) { return '<g transform="rotate(' + a + ' 12 12)"><path d="M12 12C12 8 10.5 4.5 8 2.8"/><path d="M13.8 2.2C16.5 5.5 17.8 9.5 17.3 13.8"/></g>'; }).join('') + '</g></g>';
  }
  function rows(hl, label, ico) { // lista de opciones de un menú; la fila hl resaltada con su texto
    var h = '';
    for (var i = 0; i < 5; i++) {
      var y = 70 + i * 19, on = i === hl;
      h += '<rect x="26" y="' + y + '" width="68" height="15" rx="4" fill="' + (on ? GOLD : 'rgba(255,255,255,.12)') + '"/>';
      if (on) h += (ico ? ico(34, y + 7.5, INK) : '') + '<text x="' + (ico ? 43 : 31) + '" y="' + (y + 10.5) + '" font-size="6.2" font-weight="800" fill="' + INK + '" font-family="Barlow,system-ui,sans-serif">' + label + '</text>';
      else h += '<rect x="32" y="' + (y + 6) + '" width="' + (30 + (i * 7) % 20) + '" height="3" rx="1.5" fill="rgba(255,255,255,.35)"/>';
    }
    return h;
  }
  function homeGrid() {
    var h = '';
    for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) {
      if (r === 2 && c === 1) continue;
      h += '<rect x="' + (31 + c * 22) + '" y="' + (40 + r * 26) + '" width="14" height="14" rx="4" fill="rgba(255,255,255,' + (0.14 + ((r + c) % 3) * 0.06) + ')"/>';
    }
    return h + ball(60, 99, 7);
  }
  var DRAW = {
    iosShare: phone('<rect x="24" y="128" width="72" height="22" rx="11" fill="#2b2547" stroke="rgba(255,255,255,.18)"/>' +
      '<rect x="30" y="135" width="10" height="8" rx="2" fill="rgba(255,255,255,.3)"/><rect x="80" y="135" width="10" height="8" rx="2" fill="rgba(255,255,255,.3)"/>' +
      shareIco(60, 140, PAPER) + ring(60, 139, 11) + finger(60, 148)),
    iosAdd: phone('<rect x="20" y="58" width="80" height="118" rx="10" fill="#2b2547"/>' + rows(2, 'Añadir a inicio', plusIco) + finger(86, 116)),
    iosConfirm: phone('<rect x="20" y="14" width="80" height="40" rx="10" fill="#2b2547"/><text x="82" y="32" font-size="8" font-weight="800" fill="' + GOLD + '" text-anchor="end" font-family="Barlow,system-ui,sans-serif">Añadir</text>' +
      ring(72, 29, 13) + ball(40, 80, 9) + '<rect x="56" y="76" width="34" height="5" rx="2.5" fill="rgba(255,255,255,.4)"/>' + finger(72, 40)),
    home: phone(homeGrid() + ring(60, 99, 13) + finger(60, 110)),
    andMenu: phone('<rect x="20" y="14" width="80" height="22" fill="#2b2547"/><rect x="26" y="20" width="54" height="10" rx="5" fill="rgba(255,255,255,.18)"/>' +
      '<g fill="' + PAPER + '"><circle cx="90" cy="20" r="1.8"/><circle cx="90" cy="25" r="1.8"/><circle cx="90" cy="30" r="1.8"/></g>' + ring(90, 25, 9) + finger(88, 33)),
    andInstall: phone('<rect x="20" y="58" width="80" height="118" rx="10" fill="#2b2547"/>' + rows(3, 'Instalar aplicación', plusIco) + finger(86, 135)),
    appMenu: phone('<rect x="20" y="14" width="80" height="22" fill="#2b2547"/><g fill="' + PAPER + '"><circle cx="84" cy="25" r="1.8"/><circle cx="89" cy="25" r="1.8"/><circle cx="94" cy="25" r="1.8"/></g>' +
      ring(89, 25, 10) + finger(87, 34)),
    appOpen: phone('<rect x="20" y="58" width="80" height="118" rx="10" fill="#2b2547"/>' + rows(1, 'Abrir en el navegador', null) + finger(86, 97))
  };

  // ---------------------------------------------------------------- pasos según el sitio
  function steps() {
    if (inApp) return {
      intro: 'Lo estás abriendo dentro de otra app (WhatsApp, Instagram…). Ahí no se puede quitar la barra: ábrelo en el navegador y luego instálalo.',
      s: [['appMenu', 'Toca el menú de la app (los tres puntos <b>•••</b> o <b>⋮</b>).'],
        ['appOpen', 'Elige <b>Abrir en el navegador</b> (Safari o Chrome).'],
        [isIOS ? 'iosShare' : 'andMenu', 'Ya en el navegador, sigue los pasos de instalar: vuelve a abrir este tutorial desde <b>Pantalla completa</b>.']]
    };
    if (isIOS) return {
      intro: 'En iPhone el juego solo va a pantalla completa si lo añades a la pantalla de inicio. Es un minuto y luego se abre como una app.',
      s: [['iosShare', 'En Safari, toca <b>Compartir</b> (el cuadrado con la flecha). Si no lo ves, está dentro del botón <b>•••</b>.'],
        ['iosAdd', 'Baja y toca <b>Añadir a pantalla de inicio</b>.'],
        ['iosConfirm', 'Toca <b>Añadir</b>, arriba a la derecha.'],
        ['home', 'Abre <b>Make the Cut</b> desde su icono: a pantalla completa y sin barra.']]
    };
    return {
      intro: 'Instala el juego y se abrirá como una app: a pantalla completa, sin la barra de direcciones.',
      s: [['andMenu', 'En Chrome, toca el menú <b>⋮</b> de arriba a la derecha.'],
        ['andInstall', 'Toca <b>Instalar aplicación</b> (o <b>Añadir a pantalla de inicio</b>).'],
        ['home', 'Abre <b>Make the Cut</b> desde su icono.']]
    };
  }

  // ---------------------------------------------------------------- panel
  // SPLAT (17-nov-2026, notes/splat.md «Instalar»): hoja de pegatina (.sp-panel) sobre el partido con un tinte leve (sin velo oscuro);
  // cada paso, una pegatina de papel crema con su número en sello dorado; «Ahora no» y «Entendido / Instalar» = manchas de pintura.
  // La ✕ va fuera de la hoja y la fila de botones se queda pegada abajo: con poco alto la hoja se desplaza sin que se vayan.
  var P = ':root:not(#_):not(#_):not(#_) ', PP = ':root.ph' + P.slice(5);   // (PP: móvil, html.ph)
  function isPh() { return !!(VB.Splat && VB.Splat.phone && VB.Splat.phone()); }
  var CSS = [
    '#install{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:calc(14px + var(--st,0px)) calc(14px + var(--sr,0px)) calc(14px + var(--sbm,0px)) calc(14px + var(--sl,0px));',
    'background:rgba(21,16,42,.34);font-family:var(--sp-ui,system-ui,sans-serif)}',
    '#install[hidden]{display:none}',
    '#install .ix-wrap{position:relative;display:flex;width:min(780px,100%);max-height:100%;min-height:0}',
    '#install .ix-sheet{flex:1 1 auto;min-width:0;max-height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:18px 22px 16px;text-align:left;',
    'scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.5) transparent}',
    P + '#install .ix-sheet{border-radius:18px 24px 20px 26px/22px 18px 26px 20px;background:#1b1534}',
    P + '#install .ix-k{margin:0 0 4px}',
    P + '#install h2.sp-h{--sp-hs:clamp(22px,5vh,34px);margin:0 54px 10px 0;white-space:normal;line-height:1.02}',
    '#install .ix-intro{margin:0 0 14px;font:500 14px/1.45 var(--sp-ui);color:rgba(255,244,220,.9)}',
    '#install .ix-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px 14px;margin:0;padding:4px 6px 6px 2px;list-style:none}',
    '#install .ix-steps li{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 10px 12px;border-radius:14px 18px 12px 16px/16px 12px 18px 14px;',
    'background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 3px #000,4px 5px 0 3px #000}',
    '#install .ix-steps li:nth-child(odd){transform:rotate(-.8deg)}#install .ix-steps li:nth-child(even){transform:rotate(.7deg)}',
    '#install .ix-steps svg{width:100%;max-width:112px;height:auto;max-height:32vh}',
    '#install .ix-n{position:absolute;left:-8px;top:-10px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--sp-gold);color:var(--sp-ink);',
    'font:400 16px/1 var(--sp-pop);box-shadow:0 0 0 3px var(--sp-ink),2px 3px 0 3px var(--sp-ink);transform:rotate(-10deg)}',
    '#install .ix-steps p{margin:0;font:600 13px/1.38 var(--sp-ui);text-align:center;color:var(--sp-ink)}',
    '#install .ix-steps b{color:var(--sp-ink);background:linear-gradient(transparent 55%,rgba(255,203,61,.75) 55%)}',
    '#install .ix-acts{position:sticky;bottom:-16px;z-index:2;display:flex;flex-wrap:wrap;gap:12px 14px;justify-content:flex-end;align-items:center;margin:10px -22px -16px;padding:12px 22px 16px;',
    'background:linear-gradient(rgba(27,21,52,0),#1b1534 26%)}',
    P + '#install .ix-acts .sp-btn{--sp-h:48px;--sp-fs:clamp(12px,2.2vh,15px)}',
    P + '#install .ix-x{position:absolute;top:-12px;right:-12px;z-index:3;--sp-h:46px;--sp-px:0;width:46px}',
    '#install .ix-x svg:not(.sp-blob){width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:3.6;stroke-linecap:round}',
    '#install .ix-pulse{transform-box:fill-box;transform-origin:center;animation:inPulse 1.4s ease-in-out infinite}',
    '#install .ix-tap{animation:inTap 1.4s ease-in-out infinite}',
    '@keyframes inPulse{50%{transform:scale(1.18);opacity:.55}}',
    '@keyframes inTap{50%{transform:translateY(4px)}}',
    // poco alto sin ser el móvil apaisado (ventana baja de PC): lo de antes, solo con :root:not(.ph)
    '@media (max-height:460px){:root:not(.ph) #install .ix-sheet{padding:12px 16px 12px}' + P + '#install h2.sp-h{--sp-hs:22px;margin-bottom:6px}',
    ':root:not(.ph) #install .ix-intro{font-size:12.5px;line-height:1.38;margin-bottom:10px}:root:not(.ph) #install .ix-steps{gap:12px 12px}:root:not(.ph) #install .ix-steps li{padding:9px 8px 9px;gap:5px}',
    ':root:not(.ph) #install .ix-steps svg{max-height:34vh;max-width:92px}:root:not(.ph) #install .ix-steps p{font-size:12px;line-height:1.3}:root:not(.ph) #install .ix-n{width:28px;height:28px;font-size:14px}',
    ':root:not(.ph) #install .ix-acts{margin:8px -16px -12px;padding:8px 16px 12px;bottom:-12px}' + P + '#install .ix-acts .sp-btn{--sp-h:44px}}',
    // — móvil (.ph) — (18-nov-2026, spec «Instalar»): un paso cada vez. Dibujo a la izquierda (40 %, ≤ 180 px de alto), número en sello de
    // 40 px y la instrucción a 17-18 px (palabras clave en dorado); puntitos y «Siguiente ›» abajo a la derecha (en el último, «Entendido»);
    // también se pasa de paso deslizando un dedo. Título «Pantalla completa», sin rótulo ni «Ahora no». Tinte del 20 %.
    PP + '#install{padding:var(--ph-gt) var(--ph-g) var(--ph-gb);background:rgba(21,16,42,.2)}',
    PP + '#install .ix-wrap{width:min(640px,100%);height:auto;max-height:calc(100vh - var(--ph-gt) - var(--ph-gb))}' + PP + '#install .ix-sheet{max-height:calc(100vh - var(--ph-gt) - var(--ph-gb))}',
    PP + '#install .ix-sheet{display:flex;flex-direction:column;padding:12px 18px 0;overflow-y:auto}',
    PP + '#install .ix-k{display:none}',
    PP + '#install h2.sp-h{--sp-hs:var(--ph-title);margin:0 48px 4px 0;padding:0;line-height:1.05;white-space:nowrap}' + PP + '#install .ix-sheet{padding-top:16px}',
    PP + '#install .ix-intro{margin:0 40px 8px 0;font-size:var(--ph-body);line-height:1.4}',
    PP + '#install .ix-steps{display:block;flex:1 1 auto;min-height:0;padding:6px 4px 4px 6px;touch-action:pan-y}',
    PP + '#install .ix-steps li{display:none;flex-direction:row;align-items:center;gap:16px;min-height:0;padding:12px 16px 12px 12px;transform:rotate(-.6deg)}',
    PP + '#install .ix-steps li.on{display:flex}',
    PP + '#install .ix-steps svg{flex:none;width:auto;max-width:40%;height:180px;max-height:min(180px,calc(100vh - 200px))}',
    PP + '#install.ix-p1 .ix-steps svg{max-height:min(180px,calc(100vh - 256px))}',
    PP + '#install .ix-n{position:static;flex:none;width:40px;height:40px;font-size:20px}',
    PP + '#install .ix-tx{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-width:0}',
    PP + '#install .ix-steps p{font:600 clamp(17px,15.4px + .29vw,18px)/1.35 var(--sp-ui);text-align:left;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}',
    PP + '#install .ix-steps b{background:none;color:#b8400f}',
    PP + '#install .ix-acts{position:static;flex:none;flex-wrap:nowrap;align-items:center;margin:8px -18px 0;padding:6px 18px 12px;background:none}',
    PP + '#install .ix-acts .sp-btn{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:24px}',
    PP + '#install .ix-acts [data-in="later"]{display:none}',
    PP + '#install .ix-dots{display:flex;align-items:center;gap:8px;margin-right:auto}',
    PP + '#install .ix-dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,244,220,.4);box-shadow:0 0 0 2px var(--sp-ink)}',
    PP + '#install .ix-dots i.on{width:24px;border-radius:6px;background:var(--sp-gold)}',
    PP + '#install .ix-x{top:-4px;right:-6px}',
    P + '#install .ix-dots,' + P + '#install [data-in="next"]{display:none}',
    PP + '#install .ix-dots{display:flex}',
    PP + '#install.ix-more [data-in="next"]{display:inline-flex}' + PP + '#install.ix-more #inOk{display:none}',
    '@media (max-width:460px){#install .ix-steps{grid-template-columns:repeat(2,minmax(0,1fr))}' + P + '#install h2.sp-h{--sp-hs:clamp(22px,7.4vw,30px)}#install .ix-steps svg{max-width:80px}}',
    '.rm #install .ix-pulse,.rm #install .ix-tap{animation:none}',
    '@media (prefers-reduced-motion:reduce){#install .ix-pulse,#install .ix-tap{animation:none}}'
  ].join('');
  var root = null, lastFocus = null, step = 0;
  function build() {
    if (root) return root;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'install'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'inTitle');
    root.addEventListener('click', function (e) { if (e.target === root) close(); e.stopPropagation(); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
    // (móvil) un dedo deslizando de lado pasa de paso (nunca dos dedos)
    var sx = null, sy = 0;
    root.addEventListener('touchstart', function (e) { if (e.touches.length === 1 && isPh()) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null; }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (sx == null) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(step + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.body.appendChild(root);
    return root;
  }
  function render() {
    var d = steps();
    // (SPLAT) hoja .sp-panel; la ✕ (pegatina crema) fuera de la hoja; botones = manchas de pintura (js/splat.js las dibuja con decorate)
    root.innerHTML = '<div class="ix-wrap"><div class="ix-sheet sp-panel">' +
      '<p class="ix-k sp-k">Para jugar mejor</p><h2 class="sp-h" id="inTitle">Juega a pantalla completa</h2><p class="ix-intro">' + d.intro + '</p>' +
      '<ol class="ix-steps">' + d.s.map(function (s, i) {
        return '<li><span class="ix-n">' + (i + 1) + '</span>' + DRAW[s[0]] + '<p>' + s[1] + '</p></li>';
      }).join('') + '</ol>' +
      '<div class="ix-acts"><span class="ix-dots" aria-hidden="true">' + d.s.map(function () { return '<i></i>'; }).join('') + '</span>' +
      '<button class="sp-btn sp-cream sp-sm" data-shape="2" data-in="later"><span class="sp-t">Ahora no</span></button>' +
      '<button class="sp-btn sp-kit pri" data-shape="1" data-in="next"><span class="sp-t">Siguiente ›</span></button>' +
      '<button class="sp-btn sp-kit pri" data-shape="3" data-in="ok" id="inOk"><span class="sp-t">Entendido</span></button></div></div>' +
      '<button class="ix-x sp-btn sp-cream sp-sq" data-shape="1" data-in="close" aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(root); } catch (e) { } }
    root.querySelectorAll('[data-in]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var a = b.getAttribute('data-in');
        if (a === 'next') { go(step + 1); return; }
        if (a === 'install' && deferred) { var p = deferred; deferred = null; p.prompt(); p.userChoice.then(function () { close(); }, close); return; }
        close();
      });
    });
    // (móvil: título corto; el número y el texto, juntos a la derecha del dibujo)
    if (isPh()) {
      var h2 = root.querySelector('#inTitle'); if (h2) h2.textContent = 'Pantalla completa';
      Array.prototype.forEach.call(root.querySelectorAll('.ix-steps li'), function (li) { var n = li.querySelector('.ix-n'), p = li.querySelector('p'), w = document.createElement('div'); w.className = 'ix-tx'; li.appendChild(w); w.appendChild(n); w.appendChild(p); });
    }
    go(step);
    refreshBtn();
  }
  /** Móvil: enseña el paso i (puntitos, «Siguiente ›» o, en el último, «Entendido» / «Instalar»; la frase de entrada solo en el primero). */
  function go(i) {
    if (!root) return;
    var L = root.querySelectorAll('.ix-steps li'), D = root.querySelectorAll('.ix-dots i'), n = L.length; if (!n) return;
    var prev = step; step = Math.max(0, Math.min(n - 1, i | 0));
    for (var k = 0; k < n; k++) { L[k].classList.toggle('on', k === step); if (D[k]) D[k].classList.toggle('on', k === step); }
    root.classList.toggle('ix-more', step < n - 1); root.classList.toggle('ix-p1', step === 0);
    var it = root.querySelector('.ix-intro'); if (it) it.hidden = isPh() && step > 0;
    if (isPh() && prev !== step) {
      var f = root.querySelector(step < n - 1 ? '[data-in="next"]' : '#inOk'), a = document.activeElement;
      if (f && a && root.contains(a) && a.getAttribute('data-in') !== 'close') { try { f.focus({ preventScroll: true }); } catch (e) { } }
    }
  }
  // con el aviso nativo de Chrome disponible, «Entendido» pasa a «Instalar» (un toque y listo)
  function refreshBtn() {
    var b = root && root.querySelector('#inOk'); if (!b) return;
    if (deferred && !inApp) { var t = b.querySelector('.sp-t') || b; t.textContent = 'Instalar'; b.setAttribute('data-in', 'install'); }
  }
  function open() {
    build(); step = 0; render();
    lastFocus = document.activeElement;
    root.hidden = false; seen();
    try { root.querySelector(isPh() && root.classList.contains('ix-more') ? '[data-in="next"]' : '#inOk').focus({ preventScroll: true }); } catch (e) { }
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) { }
  }
  function isOpen() { return !!(root && !root.hidden); }
  /** ¿Tiene sentido ofrecerlo aquí? (móvil o tableta sin el juego instalado) */
  function useful() { return touch() && !standalone(); }

  // Primera visita desde el móvil: sale sola una vez, cuando ya se ve el menú. Nunca en las pruebas (?debug=…) ni instalada.
  // Nunca a la vez que otro panel (p. ej. «Primer partido», que sale al tocar JUGAR la primera vez): espera a que la portada del
  // menú esté libre (VB.UI.menuIdle: sin panel, sin cortinilla, sin Carrera) 1,5 s seguidos. Si el jugador se va a jugar antes,
  // sale al volver al menú tras el partido; si cierra la página antes, en la próxima visita (no se marca como visto).
  function idle() {
    var c = VB.ctx, U = VB.UI;
    if (c && c.state && c.state !== 'menu') return false;
    if (U && U.menuIdle) { try { if (!U.menuIdle()) return false; } catch (e) { return false; } }
    else if (U && U.isPanelOpen && U.isPanelOpen()) return false;
    if (VB.CareerUI && VB.CareerUI.isOpen) { try { if (VB.CareerUI.isOpen()) return false; } catch (e) { } }
    return document.visibilityState !== 'hidden';
  }
  function auto() {
    var q = location.search || '';
    if (/[?&](debug|autopilot|noinstall)\b/.test(q) || wasSeen() || !useful()) return;
    var t0 = Date.now(), calm = 0;
    var iv = setInterval(function () {
      if (wasSeen() || isOpen()) { clearInterval(iv); return; }        // abierto a mano (Pantalla completa) o ya visto
      calm = idle() ? calm + 250 : 0;
      if (Date.now() - t0 >= 2200 && calm >= 1500) { clearInterval(iv); open(); }
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  document.addEventListener('vb:ph', function () { if (isOpen()) render(); });   // (girar / cambiar de tamaño con el aviso abierto)

  /** Pruebas: fuerza la variante ('ios' | 'android' | 'app') y abre. */
  function _as(k) { isIOS = k === 'ios'; isAndroid = k === 'android'; inApp = k === 'app'; open(); }
  VB.Install = { _as: _as, open: open, close: close, isOpen: isOpen, useful: useful, inApp: inApp, isIOS: isIOS, isAndroid: isAndroid, KEY: KEY };
})();
