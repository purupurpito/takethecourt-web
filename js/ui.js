/* =====================================================================
 * MAKE THE CUT — js/ui.js   (owner: ui_main)
 * Interfaz en DOM sobre el lienzo, en castellano:
 *   - Marcador de retransmisión (sets, puntos, saque, punto de set/partido,
 *     historial de sets), contador de toques del equipo (recepción/defensa,
 *     colocación, ataque), avisos contextuales ("¡Golpea ahora!", "¡Salta!"),
 *     consejos para principiantes y banners animados (Punto, Ace, Remate,
 *     Bloqueo, Cambio de saque, Punto de set/partido, Set, Partido).
 *   - Menú principal sobre la demo en directo, dificultad, tutorial
 *     interactivo con diagramas animados, controles, ajustes.
 *   - Pausa, pantalla final con estadísticas, aviso de girar el móvil.
 *   - Navegación con teclado (flechas/Intro/Esc) y mando (stick/A/B).
 * API pública (todas opcionales para main.js, ver CONTRACT.md §4.4):
 *   init, onState, onSettings, onGameStart, update, banner,
 *   nav(it, realDt)  -> navegación de menús con mando (main.js, fuera de partido)
 *   back()           -> cierra el panel abierto; true si lo ha consumido
 *   ingest(events,g) -> solo estadísticas (escenas de depuración)
 *   isPanelOpen()
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var ctx, $ = function (id) { return document.getElementById(id); };
  var el = {}, last = {}, shown = '', panel = null, panelFrom = 'menu';
  var banT = 0, banOut = false, calloutT = 0;
  // Presentación (UI-02/03/04): banKind = qué anuncia el banner visible ('point' | 'set' | 'match' | 'court' | 'info' | 'sp');
  // banGate = cómo acaba ('cut' = con el corte de vuelta al saque; 'court' = al bajar la grúa del cambio de campo)
  var banKind = '', banTier = 0, banRect = null, bugT = 0, bugOut = false;
  var record = { played: 0, wins: 0, bestStreak: 0, winRun: 0, tut: 0, lastA: 0, lastB: 0, lastD: '', byD: {} }; // last*: sets y dificultad del último Partido rápido (dato de portada, TV D6)
  // byD (B5): {easy:[ganados, perdidos], normal, hard, expert}, solo partidos 2v2 de Partido rápido (la previa dice «3-1 en Normal»)
  var hudScale = 1;            // UI-16: escala del HUD (ctx.settings.hudScale) × vpScale (pantallas grandes; vpFit)
  var hudSet = 1, vpScale = 1; // ajuste del jugador (1 | 1,15 | 1,3) y escala por tamaño de pantalla (--vs)

  // ---------- Telón de carga → menú (UI-07) ----------
  // El telón sale entero en el primer frame (logotipo con la fuente embebida «VB Marca», index.html). Relevo en dos tiempos:
  //  1. MENÚ: el logotipo vuela a su sitio y el menú entra en cascada (ya se puede pulsar) en cuanto la escena está pintada
  //     (bootReady: programas enlazados y primeros frames hechos; mientras la GPU enlaza no hay frames fluidos y el vuelo iría a
  //     tirones, medido), o como muy tarde a BOOT_CAP ms de la navegación. Si el ensayo de estilos no ha acabado, el fondo del
  //     telón se queda DEBAJO del menú (z 9: tapa lienzo, HUD y el ensayo, que se para durante el vuelo y luego sigue).
  //  2. PABELLÓN: con el ensayo hecho (tope 1,7 s desde la escena lista), el fondo se funde y aparece el pabellón.
  // Las fuentes de Google (script en línea de index.html: window.__vbFonts / __vbOnFonts, que avisa YA si la hoja no ha cargado)
  // solo retienen el relevo junto, como mucho 0,6 s desde la escena lista, y nunca pasado BOOT_CAP.
  // JUGAR antes del tiempo 2: la cortinilla de pantalla cubre y espera a que el pabellón esté listo (wipeTickRun).
  var fontsReady = false, bootWant = null, bootT0 = 0, BOOT_CAP = 2600, bootStage = 0, bootBg = null, bootFly = 0;
  (function waitFonts() {
    if (window.__vbFonts) { fontsReady = true; return; }
    var prev = window.__vbOnFonts;
    window.__vbOnFonts = function () { fontsReady = true; if (prev) try { prev(); } catch (e) { } tryReveal(); };
    setTimeout(function () { fontsReady = true; tryReveal(); }, Math.max(0, 2500 - performance.now()));
  })();
  /** main.js (frame 3, fuera de depuración): la escena está lista. */
  function bootReady(b) {
    bootWant = b; bootT0 = performance.now();
    tryReveal();
    return true;
  }
  /** Se llama en cada frame mientras el relevo no ha acabado (y al llegar fuentes, escena o fin del ensayo). */
  function tryReveal() {
    if (bootStage >= 2 || !ctx) return;
    var b = document.getElementById('boot'); if (!b || (b.hidden && !b.__done)) { bootStage = 2; return; }   // sin telón (escenas debug=): nada que relevar
    // escenas debug=: el telón lo quita main.js en el 3r frame pintado (sin bootReady). Aquí nunca se empieza un relevo: con el
    // enlace de programas lento el 3r frame llegaba pasado BOOT_CAP, salía un relevo PARCIAL y el fondo del telón tapaba el
    // pabellón bajo el menú hasta la red de seguridad (7,6 s; debug=menu a 4 s sin escena en shot.sh, también a 1280×720).
    if (ctx.debug) return;
    var now = performance.now(), cap = ctx.params && ctx.params.bootcap ? +ctx.params.bootcap : BOOT_CAP;   // &bootcap=ms (pruebas)
    var ready = !!bootWant;                  // programas enlazados y escena ya pintada (sus primeros frames, los caros, pasaron)
    if (bootStage === 0) {
      // (con un panel abierto desde el arranque —?panel=, Novedades— el menú está oculto pero el telón se releva igual: si no, la
      //  navegación con mando quedaba bloqueada hasta los 9 s de bootBusy)
      if (!el.menu || (el.menu.hidden && !panel) || ctx.state !== 'menu') return;
      if (!ready && now < cap) return;
      if (ready && !fontsReady && now - bootT0 < 600 && now < cap) return;
      var full = ready && gym.done;          // todo hecho: un solo relevo (el fondo se funde con el vuelo)
      bootReveal(b, !full);
      if (full) return;
    }
    // tiempo 2: escena lista, vuelo acabado y ensayo hecho (tope: 1,7 s desde la escena lista, contando la pausa del vuelo)
    if (bootStage === 1 && now >= bootFly && (ready && (gym.done || now - bootT0 >= 1700) || now >= cap + 5000)) bootBgOut();   // (+5 s: red de seguridad si la escena no llega a pintarse)
  }
  /** Relevo coreografiado: el logotipo del telón vuela (FLIP, solo transform) hasta el sitio del logotipo del menú mientras
   *  las opciones del menú entran en cascada (ya se pueden pulsar) y el fondo del telón se funde (o, con partial, se queda bajo
   *  el menú hasta bootBgOut); al aterrizar, el logotipo del menú lo releva en el mismo frame (nunca hay dos). Movimiento
   *  reducido: fundido cruzado de 150 ms. */
  function bootReveal(b, partial) {
    if (!b || b.__done) return; b.__done = true;
    var bg = b.querySelector('.bt-bg');
    if (partial && bg && el.menu && el.menu.parentNode) {
      bootStage = 1; bootBg = bg; bg.classList.add('under'); el.app.classList.add('bt-wait');
      el.menu.parentNode.insertBefore(bg, el.menu);     // mismo contexto de apilado que el menú (z 10) y el HUD (z 3)
    } else {
      bootStage = 2; bootWant = null;
      if (!gym.done) gymEnd();
    }
    var reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var M = el.menu && !el.menu.hidden ? el.menu.querySelector('.logo') : null, L = b.querySelector('.bt-logo');
    function land() {
      if (el.menu) el.menu.classList.remove('lgwait', 'intro');
      b.hidden = true; b.classList.remove('flying', 'xfade');
      // el remate parte el logotipo al aterrizar (index.html, VB_logoCut; seco con menos movimiento)
      if (window.VB_logoCut) window.VB_logoCut(reduce);
    }
    if (reduce || !M || !L) {
      b.classList.add('xfade'); if (el.menu) el.menu.classList.remove('intro');
      setTimeout(land, 160); return;
    }
    var rb = L.getBoundingClientRect(), rm = M.getBoundingClientRect();
    var sc = rb.width > 0 ? rm.width / rb.width : 1, dx = rm.left - rb.left, dy = rm.top - rb.top;
    L.style.transformOrigin = '0 0';
    L.style.transition = 'transform .64s cubic-bezier(.65,0,.22,1)';
    void L.offsetWidth;
    L.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ')';
    b.classList.add('flying'); bootFly = performance.now() + 760;
    // el menú entra a la vez que vuela el logotipo (sin el suyo hasta el aterrizaje)
    if (el.menu) { el.menu.classList.add('lgwait', 'enter'); el.menu.classList.remove('intro'); }
    var landed = false, fin = function () { if (landed) return; landed = true; land(); };
    L.addEventListener('transitionend', function (ev) { if (ev.propertyName === 'transform') fin(); });
    setTimeout(fin, 740);
  }
  /** Tiempo 2 tras un relevo parcial: el fondo del telón (bajo el menú) se funde y aparece el pabellón. Seco si ya no estamos en
   *  el menú o una cortinilla de pantalla lo tapa. */
  function bootBgOut() {
    var bg = bootBg; bootStage = 2; bootWant = null;
    if (!gym.done) gymEnd();
    if (!bg) return;
    bg.__out = true; el.app.classList.remove('bt-wait');
    var dry = ctx.state !== 'menu' || !!wp.ph;
    // mosca «DIRECTO» solo cuando se ve la demo (TV D6)
    var lv = el.menu && el.menu.querySelector('.live');
    if (lv && lv.animate && !dry) { try { lv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 250, easing: 'ease-out', fill: 'backwards' }); } catch (e) { } }
    if (dry) { if (bg.parentNode) bg.parentNode.removeChild(bg); bootBg = null; return; }
    bg.style.opacity = '0';
    setTimeout(function () { if (bg.parentNode) bg.parentNode.removeChild(bg); if (bootBg === bg) bootBg = null; }, 650);
  }
  /** ¿Sigue tapado el pabellón por el arranque? (la cortinilla de pantalla espera; el menú no navega con el telón entero). */
  function bootBusy() { return bootStage < 2 && !!ctx && !ctx.debug && !!document.getElementById('boot') && performance.now() < 9000; }
  /** ¿Hay algo opaco al 99,5 % encima del HUD bajo lo que ensayar estilos? (telón entero, o su fondo bajo el menú) */
  function gymCover() {
    if (bootStage === 1) return !!bootBg && !bootBg.__out;
    var bt = document.getElementById('boot');
    return !!bt && !bt.hidden && !/\b(flying|xfade|gone)\b/.test(bt.className);
  }
  var BAN = { point: 1.6, set: 2.6, match: 3.2, info: 1.5, ace: 1.8, sp: 1.5 };

  // ---------- Precalentado de estilos del HUD (UI-01) ----------
  // La primera vez que Chrome pinta un efecto (sombra con desenfoque, degradado, capa animada) compila sus shaders en el
  // proceso de GPU (Skia sobre ANGLE): medido, el primer «¡Golpea ahora!» costaba un frame de 45-55 ms con el JS del frame en
  // 1 ms, y la segunda vez nada. Mientras está el telón de carga se pinta UNA vez, casi transparente, cada estado
  // visual del banner, la pestaña de punto, el aviso, el consejo, la tarjeta guiada y el contador; luego todo vuelve a su sitio.
  var gym = { i: -1, f: 0, ts: 0, lf: 0, fast: 0, done: false };
  // 4 pasos con varios estados a la vez (cada combinación de forma y efecto pide sus propios shaders): teclas de teclado, mando
  // y táctil en el mismo aviso, cinta + pestaña + aviso corto + tarjeta guiada + consejo + contador + etiqueta de punto de set.
  var GYM = [
    function () { gymBan('¡Remate!', 'Recepción fuera', 'CAMBIO DE SAQUE', 'show win r2 at-l'); gymPr('hit go bar anch', '¡Golpea ahora!', 'key', 1); gymBug('show t0 two', 1);
      el.callout.className = 'show c0'; el.guide.className = 'show'; el.rl.className = 'rl on'; el.rlN.className = 'bump'; el.coach.className = ''; el.touchbar.className = ''; el.tb[0].className = 'tb-seg done'; el.tb[1].className = 'tb-seg next';
      el.tag.hidden = false; el.tag.textContent = 'PUNTO DE SET'; gymTouch(0); gymStamp('on pf', ''); el.off.className = 'on'; el.off.style.transform = 'translate3d(60px,' + Math.round(ctx.height * 0.5) + 'px,0)'; },
    function () { gymBan('Punto de set', 'Un punto para ganar el primer set', '', 'show gold compact'); gymPr('jump go anch thru', '¡Salta y bloquea!', 'key', 1); gymBug('show t1', 0);
      el.callout.className = 'show good'; el.coach.className = 'faint'; el.rl.className = 'rl on hot'; el.rlN.className = ''; el.touchbar.className = 'thru'; el.tag.className = 'sb-tag cpu'; el.guide.className = 'out'; gymTouch(1); gymStamp('on gd', 'un pelín tarde'); el.off.className = 'on t1'; },
    function () { gymBan('Gana la CPU', 'Sets 0-2', 'SETS 0-2', 'show lose t3 long'); gymPr('hit clk urg anch', 'Saca ya <span class="nu">1 s</span>', 'key', 1);
      gymBug('show t0 out fast', 0); el.rl.className = 'rl on end'; el.coach.className = 'thru'; gymTouch(2);
      el.callout.innerHTML = '¡Pronto!<span class="cg"><i class="cg-l"></i><span class="cg-t"><u></u><b style="left:30%"></b></span><i class="cg-r"></i></span>'; el.callout.className = 'show neg'; },
    function () { gymBan('¡Ace!', 'Saque directo', '', 'show ace r2 at-t out fast'); gymPr('hit soon bar anch', 'Espera… golpea al bajar', 'key', 0); el.callout.className = '';
      if (gym.pre) gymTouch(0); else gymTouchOff(); gymWipe('on cutw'); },
    // tarjeta de presentación (UI-14) y cortinilla de pantalla de la casa: sin ensayar, la tarjeta costaba un frame de 55-85 ms
    // ~0,1 s después de startMatch (raster en la GPU con compilación de shaders de Skia; traza de smtrace.js)
    function () { gymBan('Cambio de campo', 'Fin del primer set', '', 'show neutral fastin mid'); gymPr('wait anch', 'Espera el silbato', 'key', 0); el.pbug.className = ''; gymTouchOff();
      gymIntro(); gymWipe('on brand cutw'); }
  ];
  // controles táctiles de input.js (solo en táctil): se enseñan con sus estados (listo, aro, pulsado, apagado, en reposo) y se
  // devuelven tal cual estaban (sin ellos, el primer frame del partido en el móvil costaba 120-130 ms de raster)
  var gymT = null;
  function gymTouch(stage) {
    var root = document.getElementById('touch'); if (!root || !ctx.isTouch || !root.firstChild) return;
    var nodes = root.querySelectorAll('.vt-btn,.vt-joy');
    if (!gymT) { gymT = { root: root, hid: root.hidden, cls: root.className, n: [] }; for (var i = 0; i < nodes.length; i++) gymT.n.push([nodes[i], nodes[i].className]); }
    root.hidden = false;
    root.className = stage === 0 ? 'on' : stage === 1 ? 'on idle' : 'on dead';
    for (var j = 0; j < gymT.n.length; j++) {
      var nd = gymT.n[j][0], base = gymT.n[j][1].replace(/\b(ready|cue|dn|off|see|idle)\b/g, '').replace(/\s+/g, ' ').trim();
      nd.className = base + (stage === 0 ? ' ready cue' : stage === 1 ? ' dn' : (j & 1 ? ' off' : ' see'));
    }
  }
  function gymTouchOff() {
    if (!gymT) return;
    gymT.root.hidden = gymT.hid; gymT.root.className = gymT.cls;
    for (var i = 0; i < gymT.n.length; i++) gymT.n[i][0].className = gymT.n[i][1];
    gymT = null;
  }
  function gymBan(t1, t2, t3, cls) {
    el.bn1.textContent = t1; el.bn2.textContent = t2; el.bn2.hidden = !t2; el.bn3.textContent = t3; el.bn3.hidden = !t3; el.bn3.classList.toggle('so', !!t3);
    el.banner.className = cls;
    if (/\br2\b/.test(cls)) { el.banner.style.left = '120px'; el.banner.style.top = Math.round(ctx.height * 0.6) + 'px'; } else { el.banner.style.left = el.banner.style.top = ''; }
  }
  var gymKeys = null;
  function gymPr(cls, txt, keyCls, allKeys) {
    el.prompt.className = cls; el.promptText.innerHTML = txt; el.promptKey.className = keyCls;
    el.promptKey.textContent = /\bjump\b/.test(cls) ? GLYPH.keyboard.jumpT : GLYPH.keyboard.hitT;   // tecla del ensayo: la de teclado
    // las otras teclas (mando A/B, táctil GOLPEAR/SALTAR) en el mismo aviso, junto a la de teclado
    if (allKeys && !gymKeys) {
      gymKeys = [['key pad pa', 'A'], ['key pad pb', 'B'], ['key tch', 'GOLPEAR'], ['key tch j', 'SALTAR']].map(function (k) {
        var n = document.createElement('span'); n.className = k[0]; n.textContent = k[1]; el.promptKey.parentNode.appendChild(n); return n;
      });
    } else if (!allKeys && gymKeys) gymKeysOff();
    el.prompt.style.transform = 'translate3d(' + Math.round(ctx.width * 0.55) + 'px,' + Math.round(ctx.height * 0.62) + 'px,0)';
    if (/clk/.test(cls)) el.promptRing.style.setProperty('--p', /urg/.test(cls) ? '0.2' : '0.7');
    el.promptBar.style.transform = 'scaleX(0.6)';
  }
  /** Cortinilla en el ensayo: tapando un cuarto de la pantalla (los shaders de sus degradados se compilan igual y rasteriza menos).
   *  Siempre con .cutw (z 2, bajo el fondo del telón): con el relevo parcial el menú ya está a la vista (la z 30 lo taparía). */
  // (una cortinilla de verdad en marcha —JUGAR en el tiempo 1 del relevo— no se toca)
  function gymWipe(cls) { if (ctx.params.gymwipe === '0' || wp.ph) return; el.wipe.className = cls; el.wpBand.style.transform = 'translate3d(' + Math.round(-(ctx.width || 1280) * 0.75) + 'px,0,0) skewX(-14deg)'; }
  function gymStamp(cls, hint) {
    el.stampT.textContent = /pf/.test(cls) ? 'Perfecto' : 'Bien'; el.stampS.textContent = hint; el.stampS.hidden = !hint;
    el.stamp.className = cls; el.stamp.style.transform = 'translate3d(' + Math.round(ctx.width * 0.3) + 'px,' + Math.round(ctx.height * 0.5) + 'px,0)'; el.stampIn.style.opacity = '1';
  }
  function gymIntro() {
    if (introUI.on || ctx.params.gymintro === '0') return;
    el.introDiff.textContent = 'Nivel Normal'; el.introSrv.textContent = 'Sacas tú';
    el.introHint.innerHTML = device() === 'gamepad' ? '<span class="key pad pa">A</span>para empezar ya' : 'Pulsa cualquier tecla para empezar ya';
    el.intro.className = 'show gy';
  }
  function gymBug(cls, tag) { el.pbT.textContent = 'Remate'; el.pbS.textContent = 'Fuera'; el.pbS.hidden = !/two/.test(cls); el.pbX.textContent = '⇄ Saque'; el.pbX.hidden = !tag; el.pbug.className = cls; }
  /** main.js, con el contexto WebGL creado y ANTES del arranque pesado: monta el primer paso del ensayo (el que más rasteriza) para
   *  que la GPU lo pinte mientras el hilo principal construye la escena (~0,6 s en los que la GPU estaba parada). Sin los
   *  controles táctiles (aún no existen: se ensayan en el paso 4). &preboot=0 lo desactiva (A/B). */
  function preboot(c) {
    if (gym.i >= 0 || gym.done) return false;
    ctx = ctx || c; cacheEls(); if (ctx.isTouch) el.app.classList.add('is-touch');
    var bt = document.getElementById('boot'); if (!bt || bt.hidden) return false;
    gym.pre = true; gym.t0 = performance.now(); gym.ts = gym.t0; gym.i = 0;
    el.hud.hidden = false; el.hud.classList.remove('warm');
    var bg = bt.querySelector('.bt-bg'); if (bg) bg.style.opacity = '0.995';
    try { GYM[0](); } catch (e) { gymEnd(); return false; }
    return true;
  }
  /** Un paso cada 2 frames, solo en el menú (bajo el telón al arrancar). */
  function gymTick() {
    if (gym.done) return;
    if (ctx.state !== 'menu' || panel || (gym.i < 0 && !el.hud.classList.contains('warm'))) { if (gym.i >= 0) gymEnd(); return; }
    var now = performance.now(); gym.f++;
    if (bootWant) tryReveal();                                  // tope del ensayo con la escena ya lista
    // empieza cuando la GPU ha terminado de enlazar los programas (si no, no rasteriza estos estados)
    // (también tras el paso montado antes del arranque: ensayo y enlace a la vez se estorban en la GPU y tardan lo mismo)
    if (ctx.prewarmInfo && ctx.prewarmInfo().pending) { gym.lf = 0; gym.fast = 0; return; }
    // relevo parcial: mientras vuela el logotipo y entra el menú no se ensaya nada (cada paso es un frame largo en la GPU)
    if (bootStage === 1 && now < bootFly) { gym.lf = 0; gym.fast = 0; return; }
    // siguiente paso cuando la GPU ha acabado con el anterior: 2 frames seguidos fluidos (< 26 ms) tras 50 ms como mínimo
    // (con 3 frames y 70 ms el ensayo se comía ~100 ms más del arranque sin compilar nada más: medido con trazas)
    var gap = gym.lf ? now - gym.lf : 99; gym.lf = now;
    gym.fast = gap < 26 ? gym.fast + 1 : 0;
    if (gym.i >= 0 && (now - gym.ts < 50 || gym.fast < 2)) return;
    gym.ts = now; gym.fast = 0;
    // el telón ya se va (o no hay): se acaba aquí, no debe verse nada en el menú
    // (sin telón —depuración— no hay ensayo: se vería; con el relevo parcial sigue bajo el fondo del telón, bajo el menú)
    if (!gymCover()) { gymEnd(); return; }
    var bt = document.getElementById('boot');
    // Debajo del telón, con el fondo del telón al 99,5 % de opacidad: lo de debajo se rasteriza (una capa opaca lo taparía y
    // Chrome se saltaría el raster) y no se ve (se cuela un 0,5 %). Medido: bajo el telón opaco no se compilaba nada; con
    // .warm (opacidad .01 en CADA descendiente) o con el contenedor a 1/255 Skia no pinta nada; encima del telón al 3 % se veía.
    if (gym.i < 0) {
      gym.t0 = performance.now();
      el.hud.classList.remove('warm');
      var bg = bootBg || (bt && bt.querySelector('.bt-bg')); if (bg) bg.style.opacity = '0.995';
    }
    if (el.hud.classList.contains('warm')) el.hud.classList.remove('warm');   // (el cambio a 'menu' tras preboot lo vuelve a poner)
    if (++gym.i < GYM.length) { try { GYM[gym.i](); } catch (e) { gymEnd(); } } else gymEnd();
  }
  function gymKeysOff() { if (gymKeys) { gymKeys.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); gymKeys = null; } }
  function gymEnd() {
    if (gym.done) return;
    gymKeysOff(); gymTouchOff();
    gym.done = true; gym.t1 = performance.now();
    setTimeout(tryReveal, 0);
    var bg = bootBg || document.querySelector('#boot .bt-bg'); if (bg && !bg.__out) bg.style.opacity = '';
    el.hud.classList.toggle('warm', ctx.state === 'menu');
    el.banner.className = ''; el.banner.style.left = el.banner.style.top = ''; el.bn3.hidden = true; el.bn3.classList.remove('so');
    el.pbug.className = ''; el.callout.className = ''; el.guide.className = '';
    el.stamp.className = ''; el.stamp.style.transform = ''; el.stampIn.style.opacity = '';
    el.rl.className = 'rl'; el.rlN.className = '';
    el.off.className = ''; el.off.style.transform = '';
    // (si el ensayo acaba con el partido ya empezado —JUGAR antes de que se vaya el telón—, no se pisan la cortinilla ni la
    // tarjeta de presentación que ya están en marcha; integración ola 2)
    if (!wp.ph) { el.wipe.className = ''; el.wpBand.style.transform = ''; wp.last = ''; }
    if (!introUI.on) el.intro.className = ''; else el.intro.classList.remove('gy');
    el.prompt.className = 'off'; el.prompt.style.transform = ''; el.promptKey.className = 'key'; el.promptBar.style.transform = 'scaleX(0)';
    el.coach.className = 'off'; el.touchbar.className = 'off'; el.tb[0].className = el.tb[1].className = 'tb-seg';
    el.tag.hidden = true; el.tag.className = 'sb-tag';
    anchorOn = false; prX = -1; prThru = false; last = {};
  }

  /** UI-16: con el HUD grande, el contador de toques solo rotula el toque activo si a tamaño completo pisaría el marcador
   *  (mismo criterio que la regla de ≤ 760 px de index.html; marcador ~240 px de ancho × su escala, contador ~440 px). */
  /** Pantallas grandes (pulido 10-nov-2026): --vs = 1 hasta ~1280×760 y crece con min(ancho/1280, alto/760) al 80 % (1,34 a
   *  1920×1080, 1,71 a 2560×1440, tope 2). Menú y Carrera: zoom CSS con --vs; HUD y hojas: hudScale = ajuste × --vs. */
  function vpFit() {
    if (!el.app) return;
    var W = ctx.width || innerWidth, H = ctx.height || innerHeight, k = Math.min(W / 1280, H / 760);
    var vs = k > 1 ? Math.round(Math.min(2, 1 + (k - 1) * 0.8) * 100) / 100 : 1, hs = Math.round(hudSet * vs * 1000) / 1000;
    if (vs !== vpScale) { vpScale = vs; el.app.style.setProperty('--vs', String(vs)); el.app.classList.toggle('vs-up', vs > 1.05); }
    if (hudScale !== hs) { hudScale = hs; el.app.style.setProperty('--hs', String(hs)); el.app.classList.toggle('hs-big', hudSet > 1); promptW = 0; tbRect = coachRect = guideRect = null; joyR = null; }
  }
  function hudFit() {
    if (!el.app) return;
    var W = ctx.width || innerWidth, H = ctx.height || innerHeight, sbs = H <= 560 ? 0.78 : 1;
    var compact = hudScale > 1 && W / 2 - 222 * hudScale < 16 + 240 * sbs * hudScale + 12;
    el.app.classList.toggle('tb-compact', compact);
  }

  // ---------- Capa de pantalla (UI-12): viñeta de media/baja y pulso de impacto ----------
  // E3 (sprint 5): «Menos movimiento» = ctx.reduceMotion (main.js: ajuste lessMotion + lo que pida el sistema). Sin él (main.js
  // antiguo), el ajuste y la consulta del sistema aquí mismo
  var mqRM = null;
  try { mqRM = matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { }
  function rm() {
    if (ctx && typeof ctx.reduceMotion === 'boolean') return ctx.reduceMotion;
    var lm = ctx && ctx.settings && ctx.settings.lessMotion;
    return lm === 'on' ? true : lm === 'off' ? false : !!(mqRM && mqRM.matches);
  }
  /** Viñeta CSS solo sin el post de arena (alta ya la lleva en su composición: nunca dos). */
  function vigTick() {
    var post = false; try { post = !!(VB.Arena && VB.Arena.postActive && VB.Arena.postActive()); } catch (e) { }
    if (ctx.params.vig === '0') post = true;                    // &vig=0: sin viñeta CSS (pruebas A/B de rendimiento)
    if (el.veil.classList.contains('vig') === post) el.veil.classList.toggle('vig', !post);
  }
  /** Pulso del color del equipo en los bordes (0 → 0,35 → 0 en 120 ms; opacidad con Web Animations: sin maquetación).
   *  Remate perfecto o bloqueo directo del humano y punto que gana el partido. No con movimiento reducido ni destellos suaves. */
  function pulse(team, gold) {
    if (rm() || (ctx.settings && ctx.settings.softFlash) || !el.vp) return;
    el.vp.className = 'vp' + (gold ? ' gold' : team === 1 ? ' t1' : '');
    pulseT = performance.now();
    if (el.vp.animate) { try { el.vp.animate([{ opacity: 0 }, { opacity: 0.35, offset: 0.15 }, { opacity: 0.31, offset: 0.45 }, { opacity: 0 }], { duration: 120, easing: 'linear' }); return; } catch (e) { } }
    restartAnim(el.vp, 'on');
  }
  var pulseT = -1;

  // ---------- Estadísticas del partido ----------
  function newStats() {
    // Desglose de puntos como el acta/estadística FIVB: ataque + bloqueo + saque + errores del rival = puntos.
    // kills = puntos de ataque (remate, dejada, balón libre que cae), blocks = puntos de bloqueo,
    // aces = puntos de saque, oppErr = puntos regalados por el rival (fuera, red, dobles, 4 toques, falta de saque...).
    function t() { return { points: 0, aces: 0, kills: 0, blocks: 0, oppErr: 0, best: 0 }; }
    // p: por jugador (id → {num, team, pts, kills, blocks, aces}) para el MVP de cada equipo (UI-11): el punto de ataque es del último
    // que golpeó del equipo que puntúa; el ace, del sacador; el de bloqueo, del bloqueador. Los errores del rival no son de nadie.
    // (C4: lastHuman[t] = el último toque del equipo t fue del humano; blockHuman = el último bloqueo lo hizo el humano: la cinta
    // cinética de ¡Ace! / ¡Muro! sale siempre si el golpe es tuyo)
    // (B6/C4, titular del resumen: spSaved = puntos de set salvados por equipo; moments = registro de momentos {k:'spSave'|'comeback'|
    // 'rally'|'streak', team, n, setNo, match, won} para VB.Recap.headline; close = cómo se cerró el partido {how, who:{num, team}})
    return { t: [t(), t()], run: 0, runTeam: -1, longest: 0, lastHitKind: '', lastHitTeam: -1, blockTeam: -1, p: {}, lastHitter: [null, null], blocker: null, lastHuman: [false, false], blockHuman: false,
      spSaved: [0, 0], spSet: [0, 0], spM: [false, false], def: [0, 0], sets: [0, 0], setNo: 1, moments: [], rallyM: null, streakM: null, close: null };
  }
  var stats = newStats();
  // ONLINE (fase 6, notes/net.md): `stats` = lo CONFIRMADO (VB.UI.netTally, lo llama main.js con los eventos confirmados ya girados) y
  // pstats = lo presentado (predicho): solo para los banners del partido. La hoja final lee `stats`
  var pstats = newStats();
  function liveStats(g) { return ctx.net && g && g.online && !g.demo ? pstats : stats; }

  function loadRecord() { try { var r = JSON.parse(localStorage.getItem('make-the-cut.record') || 'null'); if (r && typeof r.played === 'number') for (var k in record) if (typeof r[k] === typeof record[k]) record[k] = r[k]; } catch (e) { } record.byD = cleanByD(record.byD); }
  /** record.byD saneado: solo claves de dificultad (VB.DIFF) con un par de enteros ≥ 0; lo demás fuera ({} si no hay nada). */
  function cleanByD(o) {
    var out = {}, ks = VB.DIFF_ORDER || ['easy', 'normal', 'hard', 'expert'];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    for (var i = 0; i < ks.length; i++) {
      var v = o[ks[i]]; if (!Array.isArray(v) || v.length !== 2) continue;
      var a = Math.floor(+v[0]), b = Math.floor(+v[1]);
      if (isFinite(a) && isFinite(b) && a >= 0 && b >= 0 && a < 1e7 && b < 1e7) out[ks[i]] = [a, b];
    }
    return out;
  }
  function saveRecord() { try { localStorage.setItem('make-the-cut.record', JSON.stringify(record)); } catch (e) { } }
  function click() { sndT = performance.now(); if (VB.Audio && VB.Audio.click) try { VB.Audio.click(); } catch (e) { } }
  function uiSound(kind) { sndT = performance.now(); try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(kind); else click(); } catch (e) { } }
  // B4: un sonido por tipo de acción. uiK(tipo, reserva, a, b): VB.Audio.ui(tipo) si audio.js lo tiene (VB.Audio.UI_KINDS); si no, la
  // reserva ('click' = el clic de siempre; null = nada). panelSnd(on): abrir o cerrar una hoja o un panel sin cortinilla en marcha,
  // y sin apilarse con otro sonido de interfaz de hace un momento (el clic del botón que la abre, la cortinilla o el `start`)
  var sndT = -1e9;
  function uiK(kind, fb, a, b) {
    var A = VB.Audio, ks = A && A.UI_KINDS, k = ks && ks.indexOf(kind) >= 0 ? kind : fb;
    if (!k) return;
    if (k === 'click' && !(ks && ks.indexOf(kind) >= 0)) { click(); return; }
    sndT = performance.now();
    try { if (A && A.ui) A.ui(k, a, b); } catch (e) { }
  }
  function panelSnd(on) {
    if (wp.ph || wp.aud || performance.now() - sndT < 150 || (ctx && ctx.debug)) return;
    uiK(on ? 'panelIn' : 'panelOut', null);
  }
  function hoverSound() { try { if (VB.Audio && VB.Audio.hover) VB.Audio.hover(); } catch (e) { } }
  function setText(node, key, val) { if (last[key] !== val) { last[key] = val; node.textContent = val; return true; } return false; }
  function setHTML(node, key, val) { if (last[key] !== val) { last[key] = val; node.innerHTML = val; return true; } return false; }
  // ---------- Separadores con diseño (pulido 10-nov-2026: «no todo con "·"»; CSS en index.html, bloque SEPARADORES) ----------
  function escT(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /** Une trozos con un separador dibujado: kind 'd' rombo (antetítulos), 'v' raya fina, 's' barra inclinada, 'c' pastillas.
   *  parts: array o texto con « · ». Un trozo puede ser {t, c} (texto y clase extra de la pastilla) o {h} (HTML ya hecho).
   *  html=true: los trozos de texto ya son HTML. Entre trozos, una coma .sr para lectores de pantalla. */
  function sepHTML(parts, kind, html) {
    if (typeof parts === 'string') parts = parts.split(' · ');
    var out = [];
    (parts || []).forEach(function (p) {
      if (p == null || p === '') return;
      var h = typeof p === 'object' ? (p.h != null ? p.h : escT(p.t)) : html ? String(p) : escT(p);
      out.push(kind === 'c' ? '<span class="chip' + (p && p.c ? ' ' + p.c : '') + '">' + h + '</span>' : h);
    });
    return out.join(kind === 'c' ? '<span class="sr">, </span>' : '<span class="sep sep-' + (kind || 'd') + '"><span class="sr">, </span></span>');
  }
  /** Consejo (HTML con « · »): la etiqueta corta del principio («Tu saque», «1r toque») va en pastilla y el resto con raya fina. */
  function coachHTML(h) {
    var p = String(h).split(' · ');
    if (p.length < 2) return h;
    var head = p[0].length <= 12 && p[0].indexOf('<') < 0 ? '<span class="tchip">' + p.shift() + '</span><span class="sr">: </span>' : '';
    return head + sepHTML(p, 'v', true);
  }
  /** Pinta sepHTML en un nodo solo si cambia (clave propia en el nodo: otros pueden rehacerlo). */
  function setSep(node, parts, kind, html) { if (!node) return; var h = sepHTML(parts, kind, html); if (node._sepH !== h || node._sepT !== node.textContent) { node._sepH = h; node.innerHTML = h; node._sepT = node.textContent; } }
  function restartAnim(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

  // ---------- Dispositivo / glifos de teclas ----------
  /** Referencias a los nodos del DOM (init; y antes, preboot del telón). */
  function cacheEls() {
    ['hud', 'banner', 'callout', 'menu', 'pause', 'end', 'panel', 'rotate', 'touchbar', 'prompt', 'promptKey', 'promptText', 'promptBar', 'promptRing', 'coach',
      'pS0', 'pS1', 'pMid', 'endTitle', 'endKicker', 'endS0', 'endS1', 'endSets', 'endStats', 'endRecord',
      'btnPlay', 'optDiff', 'optVenue', 'venueVal', 'optPts', 'ptsVal', 'optCtrl', 'ctrlVal', 'btnTut', 'btnControls', 'btnSettings', 'btnSquad', 'squadSub', 'sqBody', 'btnResume', 'btnRestart', 'btnQuit', 'btnPControls', 'btnPSettings',
      'btnAgain', 'btnMenu', 'btnPanelBack', 'btnTutPrev', 'btnTutNext', 'btnHudPause', 'btnHudMute', 'icoSound',
      'pnKick', 'pnTitle', 'tutBody', 'tutFig', 'tutStep', 'tutTitle', 'tutText', 'tutDots', 'ctlGrid', 'ctlSub', 'navHint', 'menuRecord', 'menuLast',
      'btnQuick', 'btnGo', 'btnPlayBack', 'btnQuickBack', 'mpPlay', 'mpQuick', 'venueHelp', 'ptsHelp', 'ctrlHelp', 'diffHelp', 'optFmt', 'fmtVal', 'fmtHelp', 'optCam6', 'cam6Val', 'cam6Help', 'btn6v6', 'sqPick', 'ctlTabs', 'sqTabs', 'setTabs', 'optList',
      'diffVal', 'diffLvl', 'playSub', 'qualNote', 'tb1t', 'btnFirstTut', 'btnFirstPlay', 'firstDiff', 'guide', 'guideK', 'guideT', 'skip', 'btnAgainAlt', 'endMvp', 'btnPeek', 'btnEndBack', 'btnEndOpts',
      'btnVer', 'abTabs', 'abBody', 'btnAbOk', 'optVer', 'optSave', 'resNote', 'ctlMsg',
      // E6: Entrenamiento (tarjeta, página, pastilla del HUD, tarjeta de presentación y hoja final)
      'btnGym', 'mpGym', 'gymList', 'gymFoot', 'btnGymBack', 'gymSub', 'drillBar', 'drillTxt', 'introDrill', 'idTitle', 'idGoal', 'idKeys', 'idMed',
      'gymEnd', 'geKick', 'geTitle', 'geTotal', 'geMax', 'geMeds', 'geReps', 'geRec', 'btnGeAgain', 'btnGeNext', 'btnGeList', 'idSes',
      // Vestuario (1.1.0): botón de la portada, atajo de Jugadores, página, giro y avisos
      'btnLook', 'btnSqLook', 'mpLook', 'btnLookBack', 'lkPick', 'lkVen', 'lkTabs', 'lkFoot', 'lkHelp', 'lkList', 'lkSpin', 'lkNote', 'lkGrid', 'lkTabChip',
      // sprint 2-4: B3 «Continuar carrera» (portada) y B5 previa (rótulo inferior y lo que está en juego)
      'btnCont', 'contPt', 'contK', 'contT', 'contS', 'contCr', 'playMainSub', 'introLT', 'introStake',
      // B6 hoja final con pestañas y D1 retos (franja de Jugar y página)
      'endTabs', 'endSum', 'endStatsTab', 'endPlays', 'btnRetos', 'retoSub', 'retoMeds', 'mpRetos', 'btnRetosBack', 'rtTabs', 'rtBody', 'rtFoot',
      // S3-C1: repetición (mosca, rótulo, pista de saltar con «Salir» y aviso para el lector de pantalla)
      'rpBug', 'rpCap', 'rpTitle', 'rpPill', 'rpPhrase', 'rpSub', 'rpSkip', 'rpSkipT', 'rpExit', 'rpAria',
      // S4-D2: perfil (chip de la portada, página con nivel, vitrina y álbum, y avisos)
      'menuFoot', 'btnProf', 'mpProf', 'btnProfBack', 'pfKick', 'pfCard', 'pfVit', 'pfRo', 'pfTabs', 'pfGrid', 'pfFoot', 'pfPin', 'pfNote',
      // ONLINE (especialista net, js/netlobby.js): tarjeta de Jugar y página del lobby
      'btnOnline', 'mpOnline', 'btnOnlineBack'].forEach(function (k) { el[k] = $(k); });
    el.bn1 = $('bn1'); el.bn2 = $('bn2'); el.bn3 = $('bn3'); el.pbug = $('pbug'); el.pbT = $('pbT'); el.pbS = $('pbS'); el.pbX = $('pbX'); el.sbBody = document.querySelector('.sb-body'); el.sb = $('sb'); el.sbSet = $('sbSet'); el.tag = $('sbTag'); el.hist = $('sbHist');
    el.row0 = $('sbRow0'); el.row1 = $('sbRow1'); el.name0 = $('sbName0'); el.name1 = $('sbName1');
    el.pts0 = $('sbPts0'); el.pts1 = $('sbPts1');
    el.pips0 = $('sbSets0').children; el.pips1 = $('sbSets1').children;
    el.sn0 = $('sbSets0').querySelector('.sb-sn'); el.sn1 = $('sbSets1').querySelector('.sb-sn'); // sets ganados en cifra (marcador de TV)
    el.tb = [$('tb1'), $('tb2'), $('tb3')];
    el.app = $('app');
    el.veil = $('veil'); el.vp = $('vpulse');
    el.rl = $('rally'); el.rlN = $('rallyN');
    el.wipe = $('wipe'); el.wpBand = el.wipe.firstChild;
    el.intro = $('intro'); el.introDiff = $('introDiff'); el.introFmt = $('introFmt'); el.introSrv = $('introSrv'); el.introHint = $('introHint');
    el.off = $('offArrow'); el.offNum = $('offNum'); el.offRot = el.off.firstChild;
    el.menuCol = document.querySelector('#menu .menu-col');
    el.pnCtl = $('pnCtl'); el.pKick = document.querySelector('#pause .sh-k');
    el.stamp = $('stamp'); el.stampIn = el.stamp.firstChild; el.stampT = $('stampT'); el.stampS = $('stampS'); el.sr = $('srLive');
    el.ambCh = $('ambChoice'); el.ambChS = $('ambChoiceS'); el.ambChR = $('ambChoiceR'); el.ambChBar = $('ambChoiceBar');
    el.ambCard = $('ambCard'); el.ambCard1 = $('ambCard1'); el.ambCard2 = $('ambCard2');
    if (el.ambChR) el.ambChR.addEventListener('pointerdown', ambTap);
    el.chal = $('chal'); el.chalK = el.chal ? el.chal.firstChild : null; el.chalKey = $('chalKey'); el.chalN = $('chalN'); el.chalBar = $('chalBar'); el.sbChal = $('sbChal');
    try { subsDom(); } catch (e) { console.error('[VB][ERROR] UI.subsDom: ' + e); }   // banquillo y cambios (6v6)
  }
  function device() {
    var d = ctx.inputDevice || 'keyboard';
    if (d === 'keyboard' && (ctx.isTouch || (VB.Input && VB.Input.isTouchActive && safe(VB.Input.isTouchActive)))) {
      if (!ctx.lastKeyT || ctx.time - ctx.lastKeyT > 3) d = 'touch';
    }
    return d;
  }
  function safe(fn) { try { return fn(); } catch (e) { return false; } }
  var GLYPH = {
    keyboard: { serve: '<span class="key">J</span>', hit: '<span class="key">J</span>', jump: '<span class="key">Espacio</span>', move: '<span class="key">←</span><span class="key">→</span>', aim: 'las flechas', hitT: 'J', jumpT: 'ESPACIO', sw: '<span class="key">C</span>', jset: '<span class="key">K</span>', jsetT: 'K' },
    gamepad: { serve: '<span class="key pad pa">A</span>', hit: '<span class="key pad pa">A</span>', jump: '<span class="key pad pb">B</span>', move: '<span class="key">Stick</span>', aim: 'el stick', hitT: 'A', jumpT: 'B', sw: '<span class="key pad py">Y</span>', jset: '<span class="key pad px">X</span>', jsetT: 'X' },
    touch: { serve: '<span class="key tch">Sacar</span>', hit: '<span class="key tch">Golpear</span>', jump: '<span class="key tch j">Saltar</span>', move: '<span class="key">Joystick</span>', aim: 'el joystick', hitT: 'GOLPEAR', jumpT: 'SALTAR', sw: '<span class="key">⇄</span>', jset: '<span class="key tch s">Colocar</span>', jsetT: 'COLOCAR' }
  };
  // UI-22: mandos de la familia PlayStation (vendor 054c o nombres típicos) → glifos de forma ✕ ○ □ △ en texto neutro (sin logotipos
  // ni colores de marca); el resto, A/B/X/Y. El id se lee de VB.Input.padInfo() como mucho una vez por segundo (padInfo crea un objeto).
  var PADK = {
    std: { a: ['pa', 'A'], b: ['pb', 'B'], x: ['px', 'X'], y: ['py', 'Y'], start: 'Start', select: 'Select', lb: 'LB', rb: 'RB' },
    ps: { a: ['ps pa', '✕'], b: ['ps pb', '○'], x: ['ps px', '□'], y: ['ps py', '△'], start: 'Options', select: 'Share', lb: 'L1', rb: 'R1' }
  };
  var padFamF = -999, padFamV = '', padFamId = null, GLYPH_PS = null;
  /** 'ps' | '' (estándar). Xbox también dice «Wireless Controller»: se excluye por nombre o vendor (045e). */
  function padFam() {
    if (ctx && ctx.frame - padFamF < 60 && padFamId !== null) return padFamV;
    padFamF = ctx ? ctx.frame : 0;
    var id = ''; try { var pi = VB.Input && VB.Input.padInfo ? VB.Input.padInfo() : null; id = (pi && pi.id) || ''; } catch (e) { id = ''; }
    if (id !== padFamId) { padFamId = id; padFamV = !/xbox|045e/i.test(id) && /054c|dualsense|dualshock|wireless controller|playstation/i.test(id) ? 'ps' : ''; }
    return padFamV;
  }
  function padSet() { return PADK[padFam() === 'ps' ? 'ps' : 'std']; }
  /** Glifo HTML de un botón del mando ('a' golpear, 'b' saltar, 'x' colocar —en el suelo también salta—, 'y' cambiar). */
  var PADN = { '✕': 'equis', '○': 'círculo', '□': 'cuadrado', '△': 'triángulo' };
  function padKey(r) { var k = padSet()[r]; return '<span class="key pad ' + k[0] + '"' + (PADN[k[1]] ? ' aria-label="' + PADN[k[1]] + '"' : '') + '>' + k[1] + '</span>'; }
  /** A5: el humano está en el aire en su 3r toque (mira libre g.aim3 de sim; de reserva, saltando en su lado). */
  function aim3(g, p) {
    if (g.aim3) return !!g.aim3.on;
    return !!p && p.z > 0.2 && p.x > 0;
  }
  // ---------- Acento de equipo = color de la equipación (contrato del sprint cartoon) ----------
  // VB.Players.kitColors() → t0/t1.base (con guarda). En #app: --k0/--k1 (franjas y chips; los muy oscuros se aclaran para leerse
  // sobre los paneles), --k0d/--k1d (fondos con texto blanco: los claros se oscurecen), --k0l/--k1l (texto sobre paneles oscuros),
  // --k0rgb/--k1rgb (r,g,b para destellos). kitUI guarda lo mismo para los dibujos del tutorial.
  var kitUI = { sig: '', c0: '#ff6a2e', d0: '#b8400f', l0: '#ffb07a', c1: '#2f7bff', d1: '#2459d8', l1: '#8fc0ff' };
  function hx(n) { return '#' + ('00000' + (n >>> 0).toString(16)).slice(-6); }
  function rgbOf(n) { return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function lumOf(c) { var f = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function mixC(c, t, k) { return [Math.round(c[0] + (t[0] - c[0]) * k), Math.round(c[1] + (t[1] - c[1]) * k), Math.round(c[2] + (t[2] - c[2]) * k)]; }
  function toHex(c) { return hx(c[0] << 16 | c[1] << 8 | c[2]); }
  /** Variantes legibles de un color de camiseta: [franja, fondo con texto blanco, texto sobre oscuro, 'r,g,b']. */
  function kitTones(n, acc) {
    var c = rgbOf(n), W = [255, 255, 255], K = [0, 0, 0], k, d = c, l = c, st = c;
    // negro/pizarra: la franja usa el color de los detalles si es claro; si no, gris claro (antes gris marengo, poco contraste
    // sobre el panel violeta)
    if (lumOf(c) < 0.05) st = typeof acc === 'number' && lumOf(rgbOf(acc)) > 0.18 ? rgbOf(acc) : mixC(c, W, 0.62);
    for (k = 0.1; lumOf(d) > 0.2 && k <= 0.9; k += 0.1) d = mixC(c, K, k);         // texto blanco encima: ≥ 4,5:1
    for (k = 0.1; lumOf(l) < 0.38 && k <= 0.9; k += 0.1) l = mixC(c, W, k);        // texto de color sobre el panel oscuro
    return [toHex(st), toHex(d), toHex(l), st.join(',')];
  }
  function kitTick() {
    var P = VB.Players, kc = null;
    try { kc = P && P.kitColors ? P.kitColors() : null; } catch (e) { kc = null; }
    if (!kc || !kc.t0 || !kc.t1 || !el.app) return;
    var sig = kc.t0.base + ':' + kc.t0.accent + ':' + kc.t1.base; if (sig === kitUI.sig) return;
    kitUI.sig = sig;
    var a = kitTones(kc.t0.base, kc.t0.accent), b = kitTones(kc.t1.base, kc.t1.accent), st = el.app.style;
    kitUI.c0 = a[0]; kitUI.d0 = a[1]; kitUI.l0 = a[2]; kitUI.c1 = b[0]; kitUI.d1 = b[1]; kitUI.l1 = b[2];
    st.setProperty('--k0', a[0]); st.setProperty('--k0d', a[1]); st.setProperty('--k0l', a[2]); st.setProperty('--k0rgb', a[3]);
    st.setProperty('--k1', b[0]); st.setProperty('--k1d', b[1]); st.setProperty('--k1l', b[2]); st.setProperty('--k1rgb', b[3]);
    if (panel === 'tut' && tut.fig) tutGo(tut.i);                                  // figuras del tutorial con la equipación nueva
  }
  var srcRevSeen = -1; // C2: VB.Input.srcRev (cambia al pasar de ratón a teclado o al revés: «Clic» / «Clic derecho» o la tecla)
  function G() {
    var d = device(), I = VB.Input;
    if (I && I.srcRev && I.srcRev() !== srcRevSeen) { srcRevSeen = I.srcRev(); rebuildGlyph(); }
    if (d === 'gamepad' && padFam() === 'ps') {
      if (!GLYPH_PS) GLYPH_PS = { serve: padIdxKey(padIx.hit, 'ps'), hit: padIdxKey(padIx.hit, 'ps'), jump: padIdxKey(padIx.jump, 'ps'), move: GLYPH.gamepad.move, aim: GLYPH.gamepad.aim,
        hitT: padIdxName(padIx.hit, 'ps'), jumpT: padIdxName(padIx.jump, 'ps'), sw: padIdxKey(padIx.sw, 'ps'), jset: padIdxKey(padIx.jset, 'ps'), jsetT: padIdxName(padIx.jset, 'ps') };
      return GLYPH_PS;
    }
    return GLYPH[d] || GLYPH.keyboard;
  }
  // E3 (sprint 5): teclas y botones reasignables (VB.Input.bindings). GLYPH.keyboard / GLYPH.gamepad se rehacen con las teclas
  // efectivas al recibir onSettings('keys' | 'padKeys') (avisos, ensayo del arranque, tutorial). Sin VB.Input.bindings, los de fábrica.
  var padIx = { hit: 0, jump: 1, jset: 2, sw: 3 };
  var PAD_CLS = ['pa', 'pb', 'px', 'py'];
  function padIdxName(i, fam) { var I = VB.Input; return I && I.padName ? I.padName(i, fam === 'ps' ? 'ps' : 'xbox') : (['A', 'B', 'X', 'Y'][i] || '?'); }
  function padIdxKey(i, fam) {
    var n = padIdxName(i, fam), ps = fam === 'ps';
    return '<span class="key pad' + (ps && i < 4 ? ' ps' : '') + (i >= 0 && i < 4 ? ' ' + PAD_CLS[i] : '') + '"' + (PADN[n] ? ' aria-label="' + PADN[n] + '"' : '') + '>' + escT(n) + '</span>';
  }
  function rebuildGlyph() {
    var I = VB.Input; if (!I || !I.bindings) return;
    var b = null; try { b = I.bindings(); } catch (e) { b = null; }
    if (!b || !b.keys) return;
    var K = b.keys, nm = function (a) { var c = K[a] && K[a][0]; return c ? (I.keyName ? I.keyName(c) : c) : '—'; };
    var ks = function (t) { return '<span class="key">' + escT(t) + '</span>'; };
    var has = function (a, c) { return !!K[a] && (K[a][0] === c || K[a][1] === c); };
    var kb = GLYPH.keyboard;
    kb.hit = kb.serve = ks(nm('hit')); kb.hitT = nm('hit').toUpperCase();
    kb.jump = ks(nm('jump')); kb.jumpT = nm('jump').toUpperCase();
    kb.jset = ks(nm('jset')); kb.jsetT = nm('jset').toUpperCase();
    // C2: con teclado y ratón, si golpeas o colocas con el ratón los avisos dicen «Clic» / «Clic derecho» (el salto sigue en su tecla)
    if (I.srcOf && I.srcOf('hit') === 'mouse') { kb.hit = kb.serve = ks('Clic'); kb.hitT = 'CLIC'; }
    if (I.srcOf && I.srcOf('jset') === 'mouse') { kb.jset = ks('Clic derecho'); kb.jsetT = 'CLIC DER.'; }
    kb.sw = ks(nm('switch'));
    var lr = has('left', 'ArrowLeft') && has('right', 'ArrowRight');
    kb.move = lr ? '<span class="key">←</span><span class="key">→</span>' : ks(nm('left')) + ks(nm('right'));
    kb.aim = lr && has('up', 'ArrowUp') && has('down', 'ArrowDown') ? 'las flechas' : 'las teclas de dirección';
    if (b.pad) {
      ['hit', 'jump', 'jset', 'sw'].forEach(function (a) { var v = b.pad[a] && b.pad[a][0]; padIx[a] = typeof v === 'number' && v >= 0 ? v : padIx[a]; });
      var gp = GLYPH.gamepad;
      gp.hit = gp.serve = padIdxKey(padIx.hit); gp.hitT = padIdxName(padIx.hit);
      gp.jump = padIdxKey(padIx.jump); gp.jumpT = padIdxName(padIx.jump);
      gp.jset = padIdxKey(padIx.jset); gp.jsetT = padIdxName(padIx.jset);
      gp.sw = padIdxKey(padIx.sw);
    }
    GLYPH_PS = null; last.navh = null; promptCur = '';
  }

  // =====================================================================
  //  CHALLENGE (B7): contador junto al marcador, botón con la ventana de 7 s y rótulo de revisión
  //  Lee VB.Sim.canChallenge(g, 0), g.challenges y g.review (todo opcional: sin sim de challenge no se ve nada)
  // =====================================================================
  var chal = { key: '', cnt: '', n: '', bar: -1 };
  function srSay(t) { if (el.sr) { el.sr.textContent = ''; el.sr.textContent = cpuTxt(t); } }
  /** En un partido de Carrera el rival no es «la CPU» sino un club: «Remate de la CPU» → «Remate del rival», «Tú 3, CPU 1» →
   *  «Tú 3, PUE 1». Se aplica en las cintas, los avisos, el consejo, el lector de pantalla y el rótulo del challenge. */
  // 6v6 espectador (g.watch de main.js, sprint 2: CPU contra CPU): rótulos de local / visitante en vez de TÚ / CPU
  var WATCH_CR = { me: 'LOC', rival: 'VIS', meName: 'Equipo local', rivalName: 'Equipo visitante' };
  function cpuTxt(s) {
    var g = ctx && ctx.game, cr = g && !g.demo && (g.career || (g.watch0 && WATCH_CR) || g.netCr);   // (online: g.netCr, el nombre del rival)
    if (!cr || typeof s !== 'string' || s.indexOf('CPU') < 0) return s;
    return s.replace(/\bde la CPU/g, 'del rival').replace(/\ba la CPU/g, 'al rival').replace(/\bla CPU/g, 'el rival').replace(/La CPU/g, 'El rival')
      .replace(/\bCPU\b/g, cr.rival || 'RIVAL');
  }
  function chalTick(g) {
    if (!el.chal) return;
    var live = !g.demo && !g.watch && (ctx.state === 'playing' || ctx.state === 'paused') && !(ctx.introLeft > 0);
    // contador (2 iconos): challenges que te quedan en el set
    var ck = live && g.challenges && g.chalPerSet !== 0 ? String(g.challenges[0]) : ''; // competición sin challenge (Carrera, opts.ref.chal 0): sin contador
    if (chal.cnt !== ck) {
      chal.cnt = ck; el.sbChal.hidden = !ck;
      var ic = el.sbChal.children; for (var i = 0; i < ic.length; i++) ic[i].className = +ck > i ? 'on' : '';
      if (ck) el.sbChal.setAttribute('aria-label', 'Challenges: ' + ck);
    }
    var rv = live ? g.review : null, left = 0;
    if (live && !rv && ctx.state === 'playing' && VB.Sim && VB.Sim.canChallenge) { try { left = +VB.Sim.canChallenge(g, 0) || 0; } catch (e) { left = 0; } }
    var dv = device(), mode = rv ? 'rev' : left > 0 ? 'win' : '';
    var key = mode + '|' + dv + padFam() + '|' + (rv ? rv.team : '');
    if (chal.key !== key) {
      chal.key = key; chal.n = null; chal.bar = -1;
      el.chal.className = mode ? 'show ' + mode + (dv === 'touch' ? ' tch' : '') : '';
      if (mode === 'win') {
        el.chalK.textContent = dv === 'touch' ? 'CHALLENGE' : 'Challenge';
        el.chalKey.textContent = dv === 'touch' ? '' : dv === 'gamepad' ? (padFam() === 'ps' ? 'L2' : 'LT') : 'V';
        el.chal.setAttribute('aria-label', 'Pedir challenge');
      } else if (mode === 'rev') {
        el.chalK.textContent = 'REVISIÓN';
        el.chalKey.textContent = cpuTxt('Challenge: ' + (rv.team === 0 ? 'TÚ' : 'CPU'));
        el.chal.setAttribute('aria-label', 'Revisión del challenge');
      }
    }
    if (!mode) return;
    var n = mode === 'win' ? String(Math.ceil(left)) : '', fr = mode === 'win' ? Math.min(1, left / 7) : Math.min(1, (rv.t || 0) / (rv.dur || 4.5));
    if (chal.n !== n) { chal.n = n; el.chalN.textContent = n; el.chalN.hidden = !n; }
    fr = Math.round(fr * 100) / 100;
    if (chal.bar !== fr) { chal.bar = fr; el.chalBar.style.transform = 'scaleX(' + fr + ')'; }
  }

  // =====================================================================
  //  BANNERS Y AVISOS
  // =====================================================================
  /** Banner central. cls: 'win'|'lose'|'gold'|'ace'|'neutral' */
  function banner(t1, t2, t3, cls, dur, kind) {
    t1 = cpuTxt(t1); t2 = cpuTxt(t2);
    el.bn1.textContent = t1 || '';
    // subtítulo con datos («Set 1 | 25-20»): trozos « | » → barra vertical fina; el resto es una frase y va tal cual
    if (t2 && t2.indexOf(' | ') >= 0) setSep(el.bn2, t2.split(' | '), 'v'); else el.bn2.textContent = t2 || '';
    el.bn2.hidden = !t2; el.bn3.hidden = !t3; el.bn3.textContent = t3 || '';
    el.bn3.classList.toggle('so', t3 === 'CAMBIO DE SAQUE'); // el icono ⇄ solo en el cambio de saque
    el.banner.className = '';
    el.banner.style.left = el.banner.style.top = el.banner.style.right = el.banner.style.bottom = '';
    void el.banner.offsetWidth; // reinicia las animaciones CSS
    el.banner.className = 'show ' + (cls || 'win') + ((t1 || '').length > 15 ? ' long' : '');
    banT = dur || BAN.info; banOut = false; banKind = kind || 'info'; banRect = null;
    banTier = /compact/.test(cls || '') ? 1 : /\br2\b/.test(cls || '') ? 2 : 3;
    lastBn2 = t2 || '';
    // al aparecer un banner se apartan la tarjeta guiada y el consejo (UI-02: el banner manda)
    if (guideT > 0 && el.guide.className === 'show') { guideT = 0; el.guide.className = ''; }
  }
  function hideBanner() { el.banner.className = ''; banT = 0; banKind = ''; banRect = null; }
  /** Salida rápida del banner (corte de cámara): 120 ms. */
  function fadeBanner(sec) {
    if (banT <= 0) return;
    if (!banOut) { banOut = true; el.banner.classList.add('out', 'fast'); }
    banT = Math.min(banT, sec || 0.12);
  }
  /** Rectángulo del banner visible en px CSS (unión de cinta, subtítulo y chip) o null. Para camera.js (CAM-18). */
  function bannerRect() {
    if (!(banT > 0) || !el.banner.classList.contains('show')) return null;
    if (banRect) return banRect;
    var r = null, kids = [el.banner.firstChild, el.bn2, el.bn3];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i]; if (!k || k.hidden) continue;
      var q = k.getBoundingClientRect(); if (!q.width) continue;
      if (!r) r = { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
      else { r.left = Math.min(r.left, q.left); r.top = Math.min(r.top, q.top); r.right = Math.max(r.right, q.right); r.bottom = Math.max(r.bottom, q.bottom); }
    }
    if (r) { r.width = r.right - r.left; r.height = r.bottom - r.top; r.x = r.left; r.y = r.top; }
    banRect = r;
    return r;
  }
  // ---- Marcador de punto (nivel 1): pestaña del color del equipo que sale del marcador, junto a su fila ----
  function showBug(team, title, sub, tag, dur) {
    // Carrera y 6v6 espectador: «Remate de la CPU» → «Remate del rival» (cpuTxt no cambia nada en Partido rápido)
    title = cpuTxt(title); sub = cpuTxt(sub);
    el.pbT.textContent = title; el.pbS.textContent = sub || ''; el.pbS.hidden = !sub;
    el.pbX.hidden = !tag; el.pbX.textContent = tag || '';
    el.pbug.className = '';
    void el.pbug.offsetWidth;
    el.pbug.className = 'show t' + (team === 1 ? 1 : 0) + (sub ? ' two' : '');
    bugT = dur; bugOut = false;
  }
  function hideBug(fast) {
    if (!(bugT > 0)) return;
    if (fast) { bugT = Math.min(bugT, 0.12); if (!bugOut) { bugOut = true; el.pbug.classList.add('out', 'fast'); } }
    else { bugT = 0; el.pbug.className = ''; }
  }
  /** Aviso corto bajo el marcador. cls opcional: 'tip' = consejo (más pequeño, dura más); 'neg' / 'good' = respuesta PERSONAL al
   *  jugador (UI-17: blanco con filo rojo-naranja / dorado; c0/c1 = color del equipo, solo para lo que hace un equipo).
   *  o (opcional): {html: texto con glifos de teclas, propio}, {gauge: -1..1} = medidor ◀ ● ▶ de pronto (−) / tarde (+). */
  function callout(text, team, cls, dur, o) {
    text = cpuTxt(text);
    if (o && o.html) el.callout.innerHTML = text; else el.callout.textContent = text;
    if (o && typeof o.gauge === 'number') {
      // medidor: pista con la marca del instante bueno en el centro y el punto donde se pulsó (izquierda = pronto, derecha = tarde)
      var u = Math.max(0.06, Math.min(0.94, 0.5 + 0.44 * Math.max(-1, Math.min(1, o.gauge))));
      el.callout.insertAdjacentHTML('beforeend', '<span class="cg" aria-hidden="true"><i class="cg-l"></i><span class="cg-t"><u></u><b style="left:' + (u * 100).toFixed(1) + '%"></b></span><i class="cg-r"></i></span>');
    }
    el.callout.className = '';
    void el.callout.offsetWidth;
    el.callout.className = 'show' + (cls === 'neg' || cls === 'good' ? '' : ' c' + (team === 1 ? 1 : 0)) + (cls ? ' ' + cls : '');
    el.callout.style.animationDuration = (dur || 0.8) + 's';
    calloutT = dur || 0.8;
  }

  // =====================================================================
  //  AMBIENTE DE CARRERA (P3, notes/ambiente.md): fichas «Protestar / Dejarlo» (amb:choice), rótulo de TV de las tarjetas
  //  (amb:card), cuadraditos en el marcador, cinta «PUNTO DE CASTIGO» (point.penalty), lector de pantalla (amb:say) y apartado
  //  «Sanciones» de la hoja final. Solo consume eventos amb:* (los genera VB.Ambiente; main.js los mete en el array del frame).
  //  Sin amb:* no se ve nada (partido rápido, Entrenamiento, online, demo). Nada en la franja inferior.
  // =====================================================================
  var AMB_COL = { yellow: 'Tarjeta amarilla', red: 'Tarjeta roja', expel: 'Expulsión', dq: 'Descalificación', delayY: 'Advertencia por retraso', delayR: 'Castigo por retraso' };
  var AMB_WHY = { protesta: 'Protesta', conducta: 'Conducta', provocacion: 'Provocación', retraso: 'Retraso' };
  var amb = { ch: null, chT: 0, chEnd: 0, cardT: 0, cardOut: false, cards: [], lastSay: '', sb: ['', ''], cdEl: [null, null], rectC: null, rectK: null };
  function ambRed(c) { return c === 'red' || c === 'delayR' || c === 'expel' || c === 'dq'; }
  function ambTeamName(g, t) {
    var cr = g && g.career; if (!cr) return t === 0 ? 'Tu equipo' : 'Rival';
    return (t === 0 ? cr.meName || cr.me : cr.rivalName || cr.rival) || (t === 0 ? 'Tu equipo' : 'Rival');
  }
  function ambWho(g, c) {
    if (c.who === 'team') return ambTeamName(g, c.team);
    if (c.who === 'coach') return 'Entrenador · ' + ambTeamName(g, c.team);
    var nm = c.name && !/^(Rival|Compañer[oa]|Equipo|Entrenador)/.test(c.name) ? c.name : '';   // (sin nombre propio: el club)
    return (c.num ? 'N.º ' + c.num + ' ' : '') + (nm || ambTeamName(g, c.team));
  }
  function ambChoiceShow(e) {
    if (!el.ambCh) return;
    var o = e.opts || [{ k: 'protest', label: 'Protestar' }, { k: 'drop', label: 'Dejarlo' }], dv = device(), gl = G(), h = '';
    for (var i = 0; i < o.length && i < 3; i++) {
      var k = o[i].k === 'protest' ? 'protest' : 'drop', key = dv === 'touch' ? '' : (k === 'protest' ? gl.sw : gl.hit);
      h += '<button type="button" tabindex="-1" class="amc-b ' + (k === 'protest' ? 'p' : 'd') + '" data-k="' + k + '">' + key + escT(o[i].label || (k === 'protest' ? 'Protestar' : 'Dejarlo')) + '</button>';
    }
    el.ambChR.innerHTML = h;
    el.ambChS.textContent = cpuTxt(e.sub || '¿Protestas la decisión?');
    el.ambChS.hidden = !!e.sub && e.sub === amb.lastSay;   // (el compañero ya lo dice en su bocadillo: sin repetirlo)
    amb.ch = { id: e.id, dur: e.dur > 0 ? e.dur : 2.4, def: e.def || 'drop' }; amb.chT = 0; amb.chEnd = 0;
    el.ambChBar.style.transform = 'scaleX(1)';
    el.ambCh.className = ''; void el.ambCh.offsetWidth; el.ambCh.className = 'show';
    srSay((e.sub ? e.sub + '. ' : '') + 'Protestar o dejarlo.');
    amb.rectC = null;
  }
  function ambChoiceHide(pick) {
    if (!amb.ch) return;
    if (el.ambCh) el.ambCh.style.visibility = '';
    if (pick && el.ambChR) {   // la elegida se ilumina 0,3 s; la otra se apaga
      var b = el.ambChR.children; for (var i = 0; i < b.length; i++) b[i].classList.add(b[i].getAttribute('data-k') === pick ? 'pk' : 'no');
      amb.chEnd = 0.3;
    } else { amb.ch = null; if (el.ambCh) el.ambCh.className = ''; }
    amb.rectC = null;
  }
  function ambTap(ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('.amc-b') : null;
    if (!t || !amb.ch || amb.chEnd > 0) return;
    ev.preventDefault(); ev.stopPropagation();
    var k = t.getAttribute('data-k');
    if (ctx.actions && typeof ctx.actions.ambChoose === 'function') { try { ctx.actions.ambChoose(k); } catch (er) { console.error('[VB][ERROR] UI.ambChoose: ' + er); } }
  }
  function ambSbTick() {
    for (var t = 0; t < 2; t++) {
      var row = $('sbName' + t); if (!row) continue;
      var h = '', n = 0;
      for (var i = 0; i < amb.cards.length && n < 4; i++) { var c = amb.cards[i]; if (c.team !== t) continue; h += '<i class="' + (ambRed(c.color) ? 'r' : 'y') + '"></i>'; n++; }
      if (h === amb.sb[t] && amb.cdEl[t] && amb.cdEl[t].parentNode) continue;
      amb.sb[t] = h;
      if (!amb.cdEl[t] || !amb.cdEl[t].parentNode) { amb.cdEl[t] = document.createElement('span'); amb.cdEl[t].className = 'sb-cds'; amb.cdEl[t].setAttribute('aria-hidden', 'true'); row.insertAdjacentElement('afterend', amb.cdEl[t]); }
      amb.cdEl[t].innerHTML = h;
    }
  }
  function ambCardShow(e, g) {
    var c = { team: e.team === 1 ? 1 : 0, pid: e.pid == null ? -1 : e.pid, num: e.num | 0, name: e.name || '', who: e.who || 'player', color: AMB_COL[e.color] ? e.color : 'yellow',
      reason: e.reason || 'protesta', set: e.set || (g ? g.setNo : 1), score: e.score ? [e.score[0] | 0, e.score[1] | 0] : (g ? [g.score[0], g.score[1]] : [0, 0]), penalty: !!e.penalty, penWait: !!e.penalty };
    if (c.penalty) c.penalty = false;   // (la hoja dice «punto de castigo» solo cuando llega de verdad el punto: ambPenOk; si se pierde, no)
    amb.cards.push(c);
    ambSbTick();
    if (!el.ambCard) return;
    var t1 = AMB_COL[c.color], t2 = ambWho(g, c) + ' · ' + (AMB_WHY[c.reason] || c.reason);
    el.ambCard1.textContent = t1; el.ambCard2.textContent = cpuTxt(t2);
    el.ambCard.className = ''; void el.ambCard.offsetWidth;
    el.ambCard.className = 'show' + (c.color === 'expel' || c.color === 'dq' ? ' e' : ambRed(c.color) ? ' r' : '') + (c.color === 'delayY' || c.color === 'delayR' ? ' w' : '');
    amb.cardT = e.dur > 0 ? e.dur : 3; amb.cardOut = false; amb.rectK = null;
    srSay(t1 + ': ' + t2 + '.' + (c.penWait ? ' Punto para ' + (c.team === 0 ? 'el rival' : 'ti') + '.' : ''));
  }
  /** Ha llegado el punto de castigo: la última tarjeta del equipo sancionado que lo esperaba ya lo lleva (hoja, lector). */
  function ambPenOk(e) {
    for (var i = amb.cards.length - 1; i >= 0; i--) { var c = amb.cards[i]; if (c.penWait && c.team === e.faultTeam) { c.penWait = false; c.penalty = true; return; } }
  }
  function ambEvent(e, g) {
    if (e.replay || ctx.replay) return;
    switch (e.type) {
      case 'amb:choice': if (e.kind == null || e.kind === 'protest') ambChoiceShow(e); break;
      case 'amb:choiceEnd': if (amb.ch && (e.id == null || e.id === amb.ch.id)) ambChoiceHide(e.by === 'timeout' && !e.pick ? '' : e.pick); break;
      case 'amb:card': ambCardShow(e, g); break;
      case 'amb:say': amb.lastSay = e.text || ''; if ((e.pri | 0) >= 1 && e.text) srSay((e.name ? e.name + ': ' : '') + e.text); break;
      case 'amb:start': amb.cards.length = 0; ambSbTick(); break;
    }
  }
  function ambTick(g, dt) {
    var live = ctx.state === 'playing' && !ctx.replay && !(ctx.introLeft > 0);
    if (amb.ch) {
      // pausa (o la previa): las fichas se OCULTAN pero siguen ahí, como la elección del director (su reloj es g.time, parado en la
      // pausa); al volver salen otra vez con el tiempo que les quedaba (antes desaparecían y CAMBIAR protestaba sin verlas)
      var held = ctx.state === 'paused' || (ctx.state === 'playing' && ctx.introLeft > 0);
      if (!g || ctx.replay || (g.mode !== 'point' && g.mode !== 'over') || (!live && !held)) ambChoiceHide('');
      else if (held) el.ambCh.style.visibility = 'hidden';
      else if (amb.chEnd > 0) { amb.chEnd -= dt; if (amb.chEnd <= 0) { amb.ch = null; el.ambCh.className = ''; amb.rectC = null; } }
      else {
        el.ambCh.style.visibility = '';
        amb.chT += dt;
        var f = Math.max(0, 1 - amb.chT / amb.ch.dur); el.ambChBar.style.transform = 'scaleX(' + (Math.round(f * 100) / 100) + ')';
        if (amb.chT > amb.ch.dur + 0.8) ambChoiceHide('');   // por si main.js no cierra la elección
      }
    }
    if (amb.cardT > 0) {
      el.ambCard.style.visibility = ctx.state === 'paused' ? 'hidden' : '';
      amb.cardT -= dt;
      if (amb.cardT < 0.3 && !amb.cardOut) { amb.cardOut = true; el.ambCard.classList.add('out'); }
      if (amb.cardT <= 0 || ctx.replay || ctx.state === 'menu') { amb.cardT = 0; el.ambCard.className = ''; amb.rectK = null; }
    }
  }
  function ambRect(n, on) {
    if (!on || !n) return null;
    var q = n.getBoundingClientRect(); if (!q.width) return null;
    return { left: q.left, top: q.top, right: q.right, bottom: q.bottom, width: q.width, height: q.height, x: q.left, y: q.top };
  }
  /** Rectángulo (px CSS) de las fichas de elección visibles, o null (para que AmbienteUI no ponga bocadillos encima). */
  function ambChoiceRect() { if (!amb.ch) return null; return amb.rectC || (amb.rectC = ambRect(el.ambCh, true)); }
  /** Rectángulo (px CSS) del rótulo de tarjeta visible, o null. */
  function cardRect() { if (!(amb.cardT > 0)) return null; return amb.rectK || (amb.rectK = ambRect(el.ambCard, true)); }
  /** Apartado «Sanciones» de la hoja final (HTML) o ''. */
  function ambEndHTML(g) {
    if (!amb.cards.length) return '';
    var h = '';
    for (var i = 0; i < amb.cards.length && i < 6; i++) {
      var c = amb.cards[i];
      h += '<span class="amb-sn"><i class="sb-cds" aria-hidden="true"><i class="' + (ambRed(c.color) ? 'r' : 'y') + '"></i></i> ' + escT(AMB_COL[c.color]) + ': <b>' + escT(cpuTxt(ambWho(g, c))) + '</b> (' +
        escT(AMB_WHY[c.reason] || c.reason) + ', ' + (SET_ORD[c.set - 1] || c.set + 'º') + ' set ' + c.score[0] + '-' + c.score[1] + (c.penalty ? ', punto de castigo' : '') + ')</span>';
    }
    return '<span class="amb-sh">Sanciones</span>' + h;
  }

  // =====================================================================
  //  EVENTOS -> estadísticas y banners
  // =====================================================================
  function tally(e) {
    var s = stats;
    switch (e.type) {
      case 'hit':
        s.lastHitKind = e.kind; s.lastHitTeam = e.team; s.blockTeam = -1; if (e.player) s.lastHitter[e.team === 1 ? 1 : 0] = e.player;
        s.lastHuman[e.team === 1 ? 1 : 0] = !!e.human; break;
      case 'block':
        s.blockTeam = e.team; s.blocker = e.player || null; s.blockHuman = !!e.human; break;
      case 'point': {
        var w = e.team, T = s.t[w];
        // deshacer (punto anulado por challenge: sim vuelve a pitar el punto con la llamada buena, ver untally)
        var U = s.undo = { w: w, field: '', P: null, pf: '', best: T.best, run: s.run, runTeam: s.runTeam, longest: s.longest, sp: !!e.savedSetPoint };
        T.points++;
        if (s.runTeam === w) s.run++; else { s.run = 1; s.runTeam = w; }
        if (s.run > T.best) T.best = s.run;
        if ((e.rallyHits || 0) > s.longest) s.longest = e.rallyHits || 0;
        // falta de saque solo si la comete el equipo que saca (gana el receptor). Bloquear el saque o tocar la red durante el
        // saque es falta del equipo RECEPTOR (12.6 / 14.6.3 / 11.3.1): gana el que saca y no es "falta de saque"
        var kind = 'point', srv = (e.lastKind === 'serve' || (e.lastKind == null && (e.rallyHits | 0) === 0)) && !!e.sideout;
        if (e.how) { // sim >= v2: 'ace' | 'kill' | 'tip' | 'block' | 'error' | 'free'
          if (e.how === 'ace') kind = 'ace';
          else if (e.how === 'kill' || e.how === 'tip' || e.how === 'free') kind = e.how;
          else if (e.how === 'block') kind = 'blockPt';
          else kind = (srv || (e.reason === 'serve' && e.sideout)) ? 'srvErr' : 'error';
        }
        else if (e.reason === 'in' && !e.sideout && (e.rallyHits | 0) === 0) kind = 'ace';
        else if ((e.rallyHits | 0) === 0 && e.reason !== 'in' && e.sideout) kind = 'srvErr';
        else if (e.reason === 'in' && s.blockTeam === w) kind = 'blockPt';
        else if (e.reason === 'in') kind = s.lastHitKind === 'spike' && s.lastHitTeam === w ? 'kill' : 'free';
        else kind = 'error';
        // cada punto cae en exactamente una fila: las filas suman "Puntos"
        U.field = kind === 'ace' ? 'aces' : kind === 'blockPt' ? 'blocks' : (kind === 'kill' || kind === 'tip' || kind === 'free') ? 'kills' : 'oppErr';
        T[U.field]++;
        e._uiKind = kind; // solo para la UI (no forma parte del contrato)
        var who = kind === 'blockPt' ? s.blocker : (kind === 'ace' || kind === 'kill' || kind === 'tip' || kind === 'free') ? s.lastHitter[w] : null;
        if (who && who.team === w) {
          var P = s.p[who.id] || (s.p[who.id] = { id: who.id, num: who.num, team: who.team, pts: 0, kills: 0, blocks: 0, aces: 0 });
          P.pts++; if (kind === 'ace') P.aces++; else if (kind === 'blockPt') P.blocks++; else P.kills++;
          U.P = P; U.pf = kind === 'ace' ? 'aces' : kind === 'blockPt' ? 'blocks' : 'kills';
        }
        tallyMoments(s, e, w, kind, who);
        break;
      }
    }
  }

  /** B6/C4: momentos del partido para el titular (VB.Recap.headline). Solo en los puntos (unas decenas por partido). */
  function tallyMoments(s, e, w, kind, who) {
    var sn = s.setNo, sc = e.score;
    if (e.savedSetPoint) { s.spSaved[w]++; s.spSet[w]++; if (s.sets[1 - w] >= 1) s.spM[w] = true; }
    if (sc) { var d0 = (sc[1] | 0) - (sc[0] | 0); if (d0 > s.def[0]) s.def[0] = d0; if (-d0 > s.def[1]) s.def[1] = -d0; }
    var rh = e.rallyHits | 0, st = e.streak | 0;
    if (rh >= 14 && (!s.rallyM || rh >= s.rallyM.n)) s.rallyM = { k: 'rally', team: w, n: rh, setNo: sn };
    if (st >= 6 && (!s.streakM || st >= s.streakM.n)) s.streakM = { k: 'streak', team: w, n: st, setNo: sn };
    if (e.setWon) {
      for (var t = 0; t < 2; t++) if (s.spSet[t]) s.moments.push({ k: 'spSave', team: t, n: s.spSet[t], setNo: sn, match: s.spM[t], won: t === w });
      if (s.def[w] >= 4) s.moments.push({ k: 'comeback', team: w, n: s.def[w], setNo: sn });
      s.sets[w]++; s.setNo++; s.spSet[0] = s.spSet[1] = 0; s.spM[0] = s.spM[1] = false; s.def[0] = s.def[1] = 0;
    }
    if (e.matchWon) s.close = { how: kind === 'ace' ? 'ace' : kind === 'blockPt' ? 'block' : kind, who: who && who.team === w ? { num: who.num, team: who.team } : null };
  }
  /** Punto anulado por challenge: quita de las estadísticas el último punto contado (sim ya corrige g.stats). */
  function untally() {
    var s = stats, U = s && s.undo; if (!U) return;
    var T = s.t[U.w]; T.points = Math.max(0, T.points - 1); if (U.field) T[U.field] = Math.max(0, T[U.field] - 1);
    T.best = U.best; s.run = U.run; s.runTeam = U.runTeam; s.longest = U.longest;
    if (U.P) { U.P.pts = Math.max(0, U.P.pts - 1); U.P[U.pf] = Math.max(0, U.P[U.pf] - 1); }
    if (U.sp) { s.spSaved[U.w] = Math.max(0, s.spSaved[U.w] - 1); s.spSet[U.w] = Math.max(0, s.spSet[U.w] - 1); }
    s.undo = null;
  }
  /** Puntos del set decisivo (3r): min(15, puntos por set del partido). */
  function decT(g) { return Math.min(15, (g && g.points) || 25); }
  function onEvents(g, events) {
    // punto anulado por challenge (sim, endReview): en el MISMO paso vuelve a pitar el punto ('point') y luego 'challengeResult'
    // con overturned. Ese 'point' no lleva pestaña («REMATE» junto al marcador contradecía el cartel anterior): lo cuenta el
    // banner IN/OUT del challenge; y las estadísticas descuentan el punto anulado.
    var ovr = false, netP = liveStats(g) === pstats, s0 = null;
    for (var oi = 0; oi < events.length; oi++) if (events[oi].type === 'challengeResult' && events[oi].overturned) ovr = true;
    if (g.subsOn && !g.demo && events.length) subsEvents(g, events);   // banquillo: rótulo de los cambios y avisos de entrar / salir
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'newMatch') { amb.cards.length = 0; ambChoiceHide(''); stats = newStats(); pstats = newStats(); lastSpKey = ''; retoEnd = null; profEnd = null; unl0 = g.demo ? null : lkUnseen().slice(); }   // (B6: lo del Vestuario sin ver al empezar)
      if (!netP) msIngest(e, g);   // Estadística del partido (js/matchstats.js): registro ligero de cada rally (online: netTally)
      if (e.type === 'newSet') lastSpKey = '';
      if (g.demo) continue;
      if (e.amb) { ambEvent(e, g); continue; }   // Ambiente de Carrera (amb:*): ni estadísticas, ni insignias, ni retos
      if (e.type === 'point' && e.penalty) ambPenOk(e);   // (punto de castigo que sí llegó: su tarjeta lo dice en la hoja)
      if (ovr && e.type === 'point') { if (netP) { s0 = stats; stats = pstats; untally(); stats = s0; } else untally(); e._ovr = true; }
      if (netP) { s0 = stats; stats = pstats; tally(e); stats = s0; } else tally(e);   // (online: lo presentado no cuenta en la hoja)
      if (VB.Badges && !g.drill) VB.Badges.ingest(e, g); // insignias: cuenta remates, aces, recepciones… del equipo 0 (js/badges.js; los ejercicios no cuentan)
      // S4-D1: retos de maestría y del día (js/retos.js; O(1) por evento, sin asignar; nunca los ejercicios ni la repetición)
      if (VB.Retos && VB.Retos.ingest && !g.drill && !e.replay) { try { VB.Retos.ingest(e, g); } catch (er) { console.error('[VB][ERROR] Retos.ingest: ' + er); } }
      switch (e.type) {
        // E6: Entrenamiento (sim: sin point/whistle/gameOver con g.drill)
        case 'drillStage': gymLast.t = NaN; gymLast.miss = ''; break;
        case 'drillRep': gymRep(e, g); break;
        case 'drillEnd': gymEndShow(e, g); break;
        case 'newMatch':
          if (ctx.introLeft > 0 || introUI.on) break;           // la tarjeta de presentación ya lo dice (UI-14)
          banner(oneSet(g) ? 'Set único' : 'Set 1', fmtTxt(g) + (g.serving === 0 ? ', sacas tú' : ', saca la CPU'), '', 'neutral', BAN.info, 'newSet');
          break;
        case 'point': {
          var me = e.team === 0, k = e._uiKind;
          flashRow(e.team); lastScorer = e.team;
          rallyEnd(e);
          if (e.matchWon) { pulse(e.team, e.team === 0); matchPtT = ctx.time; }
          // UI-02: el punto aparta al momento la tarjeta guiada, el consejo y el aviso
          clearPrompt(); if (guideT > 0) { guideT = 0; el.guide.className = ''; }
          last.coach = null; el.coach.classList.add('off');
          if (e._ovr && !e.setWon && !e.matchWon) { hideBug(false); atSP = false; }  // lo dice el banner del challenge
          else { presentPoint(e, me, k, g); srScore(e, g); }
          // E1 (maestría): rótulo de la jugada que ha dado el punto (solo los tuyos; la CPU también marca 'roll')
          if (me && e.move && !e._ovr && E1_MOVE[e.move]) {
            var mv = e.move === 'edge' && e.tool ? '¡Manos fuera!' : E1_MOVE[e.move];
            callout(mv, 0, 'good', 1.3); srSay(mv.replace(/¡|!/g, ''));
          }
          break;
        }
        case 'block':
          if (e.human && e.result === 'stuff') pulse(e.team, false);
          // C4: el bloqueo directo de tu equipo lo dice la cinta cinética («¡Muro!») 0,5 s después: sin aviso duplicado
          if (e.team === 0 && e.result === 'stuff' && kinOn(g)) break;
          // tu propio bloqueo directo es un logro personal (dorado); el resto, del color del equipo que bloquea
          // (bloqueo activo: el directo con GOLPEAR pulsado a tiempo, e.pressed, es «¡Muro!»)
          callout(e.result === 'soft' || e.result === 'tool' || e.result === 'touch' ? 'Toque de bloqueo' : e.human && e.pressed && e.result === 'stuff' ? '¡Muro!' : '¡Bloqueo!', e.team, e.human && e.result === 'stuff' ? 'good' : '');
          break;
        case 'hit':
          if (e.team === 0) { clearPrompt(); if (guideT > 0) guideHide(); } // el aviso del que acaba de golpear no pasa al compañero
          if (e.team === 0 && (e.kind === 'set' || e.touch === 2)) lastSetJ = e.shot === 'jset';   // E1: «Colocación en salto | Remate»
          if (e.human && g.drill && typeof e.timing === 'number' && isFinite(e.timing)) gymLast.t = e.timing;   // E6: consejo del fallo
          if (!e.human) { if (stampDbg(g) && e.team === 0 && e.player === g.ctrl) stampHit(e, g); break; }
          if (e.kind === 'spike' && e.grade === 'perfect' && e.shot !== 'tip') pulse(e.team, false);
          if (e.shot === 'body') { // sin gesto: el balón le da en el cuerpo (cuenta como toque)
            // (si acaba de salir «¡Pronto!» con su medidor, se queda: explica por qué le ha dado y hacia dónde corregir)
            if (performance.now() - missT > 700) callout('¡Te ha dado!', 0, 'neg', 1);
            else srSay('Te ha dado');
            if (ctx.settings.coachTips !== false) bodyTipT = 1.5;
            break;
          }
          if (e.kind === 'free' && e.shot !== 'tip' && e.touch === 3 && ctx.settings.showHelp !== false && !e.dive)
            callout('Balón libre: ' + G().jump + ' para rematar', 0, 'tip', 1.6, { html: true });
          else {
            // UI-09: sello junto al punto de contacto (PERFECTO / BIEN); el aviso de arriba a la izquierda ya no sale
            // (el lector de pantalla lo sigue oyendo por #srLive)
            stampHit(e, g);
            var pm = e.grade === 'perfect' ? (e.kind === 'free' ? (e.shot === 'tip' ? (e.pokey ? 'Pokey perfecto' : 'Dejada perfecta') : '') : PERFECT[e.kind]) : '';
            if (pm) srSay(pm.replace(/¡|!/g, ''));
          }
          break;
        case 'switch':
          clearPrompt(); break;
        case 'libero': // 6v6 (sim applyLibero, lote A D2): con human, el relevo del control: el líbero entra por tu central o tu central vuelve
          if (e.team === 0 && e.human) {
            var lIn = !!(e.inP && e.inP.role === 'L');
            callout(lIn ? 'Entra el líbero por ti: ahora lo llevas tú' : 'Vuelves a pista', 0, 'tip', 2.2);
            srSay(lIn ? 'Entra el líbero por ti, ahora lo llevas tú' : 'Vuelves a pista');
          }
          break;
        case 'ask':   // 6v6: «¡Pídela!» (CAMBIAR / ⇄ / RB)
          if (e.player === g.ctrl) { stampAsk(e, g); if (e.ok) srSay('Pides el balón'); } break;
        case 'miss':
          // UI-17: respuesta personal (no del equipo rival): blanco con filo rojo-naranja; con pronto/tarde, el medidor dice hacia dónde
          // corregir (t2 = s que faltaban para el instante bueno: > 0 pronto, < 0 tarde). Marca a ±(0,27…1) de la pista según el desfase.
          if (e.player === g.ctrl && g.drill) gymLast.miss = e.reason || 'far';
          if (e.player === g.ctrl) {
            var t2 = typeof e.t2 === 'number' && isFinite(e.t2) ? e.t2 : (e.reason === 'early' ? 0.15 : -0.15);
            var gz = e.reason === 'early' || e.reason === 'late' ? (e.reason === 'early' ? -1 : 1) * (0.27 + 0.73 * Math.min(1, Math.abs(t2) / 0.35)) : null;
            callout(e.reason === 'early' ? '¡Pronto!' : e.reason === 'late' ? '¡Tarde!' : 'No llegas', 0, 'neg', gz != null ? 1.2 : 0.8, gz != null ? { gauge: gz } : null);
            missT = performance.now();
            srSay(e.reason === 'early' ? 'Pronto' : e.reason === 'late' ? 'Tarde' : 'No llegas');
          }
          break;
        case 'whistle':
          if (introUI.quiet && !(ctx.introLeft > 0)) introUI.quiet = false;
          break;
        case 'serveReady':
          atSP = e.matchPoint >= 0 || e.setPoint >= 0;
          // versión compacta, arriba: la cinta grande tapaba la red y al sacador justo cuando va a sacar
          // C4: el primero de cada racha (clave set|equipo|set-o-partido) entra con la cinta cinética (tuyo dorado, del rival azul);
          // los siguientes de la misma racha, como siempre
          if (atSP) {
            var mpN = e.matchPoint >= 0, spT = mpN ? e.matchPoint : e.setPoint, spKey = g.setNo + '|' + spT + '|' + (mpN ? 'm' : 's');
            var kinSp = spKey !== lastSpKey && kinOn(g); lastSpKey = spKey;
            var spCls = kinSp ? (spT === 0 ? 'gold' : 'lose') + ' compact kin' : 'gold compact';
            if (mpN) banner('Punto de partido', spT === 0 ? 'Un punto para ganar el partido' : 'La CPU tiene punto de partido', '', spCls, BAN.sp, 'sp');
            else banner('Punto de set', spT === 0 ? 'Un punto para ganar el ' + (ORD[g.setNo] || g.setNo + 'º') + ' set' : 'La CPU tiene punto de set', '', spCls, BAN.sp, 'sp');
            if (kinSp) kinPlay(mpN ? 'mp' : 'sp', spT);
          }
          break;
        case 'toss':
          // con el balón en el aire no puede quedar nada encima de la jugada
          if (banT > 0 && el.banner.classList.contains('compact')) { banT = Math.min(banT, 0.3); }
          break;
        case 'set':
          // nivel 3, tras el momento del héroe: espera al corte al plano de reacción; acaba antes de la grúa del cambio de campo
          // (partido a un solo set, g.toWin = 1: el set ya es el partido, solo sale el rótulo de 'match')
          if (!e.sets || e.sets[e.team] < (oneSet(g) ? 1 : 2)) queuePres({ t1: e.team === 0 ? 'Set para ti' : 'Set para la CPU', t2: (SET_ORD[e.setNo - 1] || e.setNo + 'º') + ' set ' + e.score[0] + '-' + e.score[1] + ' | ' + e.sets[0] + '-' + e.sets[1] + ' en sets',
            t3: '', cls: (e.team === 0 ? 'win' : 'lose') + ' t3', dur: BAN.set, kind: 'set', gate: 'cut' });
          break;
        case 'match':
          queuePres({ t1: e.team === 0 ? '¡Ganas el partido!' : (ctx && ctx.game && ctx.game.netCr && ctx.game.netCr.rivalName ? 'Gana ' + ctx.game.netCr.rivalName : 'Gana la CPU'), t2: 'Sets ' + e.sets[0] + '-' + e.sets[1], t3: '', cls: (e.team === 0 ? 'ace' : 'lose') + ' t3', dur: BAN.match, kind: 'match', gate: 'cut' });
          break;
        case 'courtChange':
          // reglas 18.2.1 / 18.2.2: cuando la cámara pasa al plano 'court' (grúa); se va antes de que la grúa acabe (ccU = 1)
          // playa ('swap', cada 7 / cada 5 en el 3r): sin grúa de cámara, el aviso sale en cuanto se va el del punto (rt adelantado)
          if (e.why === 'swap') { pendCourt = { t2: 'Cada ' + (e.every || 7) + ' puntos | ' + e.score[0] + '-' + e.score[1], dur: 1.3, rt: ctx.time - 1.6 }; srSay('Cambio de campo.'); break; }
          pendCourt = { t2: e.why === 'eight' ? 'A los ' + Math.ceil(decT(g) / 2) + ' puntos del set decisivo' : 'Fin del ' + (ORD[e.setNo] || e.setNo + 'º') + ' set', dur: e.why === 'eight' ? 1.6 : 1.9, rt: ctx.time };
          // fin de set: «Set N» entra en la bajada de la grúa, en cuanto se va «Cambio de campo» (no al empezar el saque)
          courtNext = e.why === 'set' && e.sets ? { n: e.setNo + 1, sub: e.setNo + 1 === 3 ? 'Set decisivo, a ' + decT(g) + ' puntos' : 'Sets ' + e.sets[0] + '-' + e.sets[1] } : null;
          break;
        case 'challenge':
          if (e.team === 1) callout('La CPU pide challenge', 1, null, 2.4);
          srSay(e.team === 1 ? 'La CPU pide challenge.' : 'Challenge pedido. Revisión.');
          break;
        case 'challengeResult': {
          var cm = (Math.abs(e.dist || 0) * 100).toFixed(1).replace('.', ','), io = e.truthIn ? 'Dentro' : 'Fuera';
          var who = e.team === 0 ? 'ti' : 'la CPU', ph = e.overturned ? 'Punto para ' + who : 'Se mantiene';
          if (!e.overturned && e.team === 0 && e.left) ph += e.left[0] === 1 ? ', te queda 1 challenge' : e.left[0] ? ', te quedan ' + e.left[0] : ', sin challenges';
          // dist (IN) = cuánto entra el borde interior de la huella desde el borde exterior de la línea: <= 5 cm (ancho de la
          // línea) es lo que la pisa; hasta 2·radio + 5 cm la huella aún toca la línea; más, el bote cae dentro sin tocarla
          var dIn = Math.abs(e.dist || 0), tl = 2 * ((VB.C && VB.C.BR) || 0.21) + 0.05;
          var tx = !e.truthIn ? 'A ' + cm + ' cm de la línea. ' : dIn <= 0.05 ? 'Pisa la línea ' + cm + ' cm. ' : dIn < tl ? 'Sobre la línea. ' : '';   // (el rótulo ya dice «Dentro»)
          var sx = !e.truthIn ? ', a ' + cm + ' centímetros. ' : dIn <= 0.05 ? ', pisa la línea ' + cm + ' centímetros. ' : dIn < tl ? ', sobre la línea. ' : '. ';
          banner(io, tx + ph, '', e.overturned ? (e.team === 0 ? 'win' : 'lose') : 'neutral', 3.2, 'challenge');
          srSay(io + sx + ph + '. Tú ' + g.score[0] + ', CPU ' + g.score[1] + '.');
          break;
        }
        case 'newSet':
          courtNext = null;
          if (newSetShown === e.setNo) { newSetShown = 0; break; } // ya salió en la bajada de la grúa
          newSetShown = 0;
          banner('Set ' + e.setNo, e.setNo === 3 ? 'Set decisivo, a ' + decT(g) + ' puntos' : 'Sets ' + g.sets[0] + '-' + g.sets[1], '', 'neutral', BAN.info, 'newSet');
          break;
        case 'gameOver':
          // S4-D1: cierre de los retos ANTES de la hoja (null si el partido no cuenta: demo, ejercicio, espectador, autopilot).
          // En depuración, en seco (no guarda). Los objetos del Vestuario que dan los retos los concede checkGlobal al volver al
          // menú (lkCheckNew, con su aviso); la hoja de B6 (T19) los enseñará antes con lookGrantNow
          retoEnd = null;
          if (VB.Retos && VB.Retos.endMatch && !e.replay && !(g && g.online)) {   // (online: sin retos, decisión 4 de Ferran)
            try { retoEnd = VB.Retos.endMatch(g, { win: e.team === 0, map: VB.Arena && VB.Arena.map ? VB.Arena.map() : '', sets: e.sets }, !!ctx.debug); }
            catch (er) { console.error('[VB][ERROR] Retos.endMatch: ' + er); retoEnd = null; }
          }
          showEnd(e);
          endFlow(e);
          break;
      }
    }
  }
  var missT = -9999;
  // S4-D1 / D2: resultado de VB.Retos.endMatch y de VB.Profile.noteMatch del último partido (los lee la hoja de B6, T19)
  var retoEnd = null, profEnd = null;
  // E1 (sprint 5): rótulos por point.move y la última colocación de tu equipo (¿en salto?) para el sello de la jugada perfecta
  var E1_MOVE = { feint: '¡Finta!', roll: 'Colocado', edge: '¡Al filo!', quick: 'Rápida' }, lastSetJ = false;
  // (en frases de aviso: «Un punto para ganar el primer set», «Fin del segundo set»; las abreviaturas se quedan en etiquetas)
  var SET_ORD = ['1r', '2º', '3r', '4º', '5º']; // etiquetas («1r set»), regla de SIGUIENTE.md
  var ORD = ['', 'primer', 'segundo', 'tercer'], pendCourt = null, courtNoCrane = false, courtNext = null, newSetShown = 0, bodyTipT = 0, lastBn2 = '', lastSub = '', held = null;
  var OUTK = { serve: 'Saque fuera', pass: 'Recepción fuera', set: 'Colocación fuera', spike: 'Remate fuera', free: 'Balón fuera' };
  // sin 'free': un balón libre (3r toque sin saltar) es la opción floja y no se celebra
  var PERFECT = { pass: 'Recepción perfecta', set: 'Colocación perfecta', spike: '¡Remate perfecto!', serve: '¡Saque perfecto!' };
  function flashRow(t) { restartAnim(t === 0 ? el.row0 : el.row1, 'scored'); }
  /** UI-23: el tanteo, en el aviso educado del lector de pantalla, tras cada punto: «Tú 3, CPU 1. Set 1.» (con el set o el partido
   *  ganado delante). Las mismas cifras que el marcador (point.score = tanteo tras el punto). */
  function srScore(e, g) {
    var sc = e.score || g.score, n = g.setNo, pre = '';
    if (e.matchWon) pre = e.team === 0 ? 'Ganas el partido. ' : 'Gana la CPU el partido. ';
    else if (e.setWon) pre = e.team === 0 ? 'Set para ti. ' : 'Set para la CPU. ';
    var sets = (e.setWon || e.matchWon) && g.sets ? ' Sets ' + g.sets[0] + '-' + g.sets[1] + '.' : '';
    srSay(pre + 'Tú ' + sc[0] + ', CPU ' + sc[1] + '. Set ' + n + '.' + sets);
  }
  /** Lector de pantalla: aviso educado (sustituye al aviso visual de arriba a la izquierda para los golpes). */
  var srLast = '', srT = 0;
  function srSay(txt) {
    if (!el.sr) return;
    txt = cpuTxt(txt);
    var now = performance.now(); if (txt === srLast && now - srT < 1500) return;
    srLast = txt; srT = now; el.sr.textContent = ''; el.sr.textContent = txt;
  }

  // =====================================================================
  //  RETRATOS (B2; spec S2-B2B3 §3.2)
  // =====================================================================
  // portraitHTML(req, cls, alt): <img class="pt cls" data-pt="clave"> si main.js ya lo tiene en caché (ctx.actions.portrait), o un
  // hueco <span class="pt pt-ph"> con el color de fondo y el dorsal mientras se pinta (y queda encolado). Un único oyente del evento
  // `vb-portrait` {key, url} cambia todos los [data-pt="clave"] del documento por la imagen. Sin VB.Doll.portrait, el hueco se queda.
  function hex6(n) { return '#' + ('000000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function mixHex(a, b, t) {
    var r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }
  function portraitHTML(req, cls, alt) {
    var A = ctx && ctx.actions, r = null;
    if (req && A && typeof A.portrait === 'function') { try { r = A.portrait(req); } catch (e) { r = null; } }
    var key = r && r.key ? String(r.key) : '', c = 'pt' + (cls ? ' ' + cls : ''), a = escT(alt || '');
    var bg = req && typeof req.bg === 'number' ? hex6(req.bg) : '#2a1f4a', sty = ' style="--pt-bg:' + bg + '"';
    if (r && r.url) return '<img class="' + c + '" data-pt="' + escT(key) + '" src="' + escT(r.url) + '" alt="' + a + '" draggable="false"' + sty + '>';
    var num = req && (req.num | 0) > 0 ? String(req.num | 0) : '';
    return '<span class="' + c + ' pt-ph"' + (key ? ' data-pt="' + escT(key) + '"' : '') + sty + ' role="img" aria-label="' + a + '">' + num + '</span>';
  }
  function onPortrait(ev) {
    var d = ev && ev.detail; if (!d || !d.key || !d.url) return;
    var ns = document.querySelectorAll('[data-pt]');
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i]; if (n.getAttribute('data-pt') !== d.key) continue;
      if (n.tagName === 'IMG') { if (n.getAttribute('src') !== d.url) n.setAttribute('src', d.url); continue; }
      var img = document.createElement('img');
      img.className = n.className.replace(/(^|\s)pt-ph(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
      img.setAttribute('data-pt', d.key); img.setAttribute('alt', n.getAttribute('aria-label') || ''); img.draggable = false;
      if (n.getAttribute('style')) img.setAttribute('style', n.getAttribute('style'));
      img.src = d.url;
      if (n.parentNode) n.parentNode.replaceChild(img, n);
    }
  }
  /** Retrato de un atleta de TU equipo en Partido rápido (team 0, idx 0 = tu n.º 1, 1 = el n.º 2) con el aspecto del Vestuario (o el
   *  de serie, VB.Players.baseLook) y tu equipación; px = tamaño CSS (se pinta al doble y por --vs, tope 384). null para el rival (R8:
   *  sin retratos de rivales) o si falta lo necesario. */
  function portraitReqMatch(team, idx, px) {
    if ((team | 0) !== 0) return null;
    idx = idx === 1 ? 1 : 0; px = Math.max(16, +px || 72);
    var P = VB.Players, Lk = VB.Look, st = (ctx && ctx.settings) || {}, num = idx + 1, L = null, tc = null;
    var beach = VB.Arena && VB.Arena.venue ? VB.Arena.venue() === 'beach' : st.arena === 'beach';
    try { tc = P && P.kitFrom ? P.kitFrom(st) : null; } catch (e) { tc = null; }
    try { var f = Lk && Lk.matchLooks ? Lk.matchLooks({}) : null; if (f && f[idx] && Lk.resolve) L = Lk.resolve(f[idx], beach ? 'beach' : 'hall', tc); } catch (e) { L = null; }
    if (!L && P && P.baseLook) { try { L = P.baseLook({ team: 0, idx: idx, num: num, beach: beach }); } catch (e) { L = null; } }
    if (!L) return null;
    var shirt = typeof st.kitShirt === 'number' ? st.kitShirt : 0xff5a2c;
    return { L: L, tc: tc, num: num, beach: beach, pose: 'stand', face: 'neutra', yaw: 0.35, bg: mixHex(shirt, 0x1d1530, 0.6), size: Math.min(384, Math.round(px * 2 * (vpScale || 1))) };
  }

  // =====================================================================
  //  PRESENTACIÓN DEL PARTIDO (UI-14)
  // =====================================================================
  // main.js para la sim y llama introStart(g); al acabar (2,5 s) o al saltarla (cualquier botón, tecla o toque → ctx.introSkipReq),
  // introEnd(skipped). La tarjeta sale; el marcador entra deslizando 0,25 s después (con el saque ya en marcha: acaba hacia el
  // silbato, como pide audio) y se avisa a audio (ui('introEnd') al entrar el marcador; ui('introSkip') si la saltan).
  // B5 (sprint 2-4, spec S2-B4B5B6 §2.2): la previa tiene un plan (VB.Recap.introPlan: mini 2,5 s, corta 4,5 s, larga 6 s) que
  // main.js pide con VB.UI.introPlan(g, opts) antes de introStart(g, plan). Beat A: bloques con retrato (solo el tuyo: R8), nombre,
  // línea pequeña, rasgo y puesto; beat B (#intro.b2): rótulo inferior con dos datos como mucho; beat C (#intro.b3): lo que está en
  // juego (final, semifinal, jefe, duelo, 1ª jornada). introTick cruza los beats con comparaciones de números (sin cadenas por frame).
  // Sin recap.js: la tarjeta de siempre (TÚ / CPU o los clubes) y 2,5 s.
  var introUI = { on: false, hudT: 0, skipped: false, plan: null, bi: 1, dur: 2.5 };
  /** Formato del partido para la tarjeta y el aviso del primer set: a un set (g.toWin 1, el partidillo de prueba) o al mejor de 3. */
  /** ¿Partido a un set? (la prueba de la Carrera, g.toWin 1, o la sala online de 1 set, g.bo1) */
  function oneSet(g) { return !!(g && (g.toWin === 1 || g.bo1)); }
  function fmtTxt(g) { return (oneSet(g) ? 'Un set a ' : 'Al mejor de 3 sets a ') + ((g && g.points) || 25); }
  var IN_FB = '<svg viewBox="0 0 56 60" aria-hidden="true"><circle cx="28" cy="17" r="12"/><path d="M4 60c0-16 10-26 24-26s24 10 24 26z"/></svg>';
  /** Datos para VB.Recap.introPlan a partir de la partida montada y de las opciones de startMatch (o.introKind fuerza el tipo). */
  function introInfo(g, o) {
    o = o || {};
    var six = !!(g && g.size === 6), diff = (g && g.difficulty) || ctx.settings.difficulty;
    var T = (g && g.teams) || [[], []];
    var stOf = function (t) { var out = [], tm = T[t] || []; for (var i = 0; i < tm.length; i++) if (tm[i] && tm[i].st) out.push(tm[i].st); return out.length ? out : null; };
    var cp = g && (g.ctrlBase || g.ctrl), nums = [];
    for (var i = 0; i < Math.min(2, (T[0] || []).length); i++) nums.push(T[0][i].num | 0);
    var one = !!(g && g.ctrlMode === 'one');
    if ((six || one) && cp) nums = [cp.num | 0];
    var info = { kind: o.introKind, again: o.introKind === 'mini', drill: !!(g && g.drill), diff: diff,
      diffName: (VB.DIFF && VB.DIFF[diff] && VB.DIFF[diff].name) || '', byD: (record.byD && record.byD[diff]) || null, winRun: record.winRun | 0,
      size: six ? 6 : 2, ctrlOne: one, nums: nums, posName: six && g ? (ROLE_NAME[g.ctrlRole] || '') : '', short: (ctx.height || innerHeight) <= 420,
      stA: stOf(0), stB: stOf(1) };
    var cs = g && g.career;
    if (cs) {
      var c2 = {}; for (var k in cs) if (Object.prototype.hasOwnProperty.call(cs, k)) c2[k] = cs[k];
      // (el jefe: recap lee boss.style como texto visible; en m.career.boss es la CLAVE y el nombre va en styleName)
      if (cs.boss) c2.boss = { name: cs.boss.name, nick: cs.boss.nick, style: cs.boss.styleName || cs.boss.style, hint: cs.boss.hint, w: cs.boss.w, l: cs.boss.l };
      info.career = c2;
    }
    return info;
  }
  /** VB.UI.introPlan(g, o): el plan de la previa (lo guarda para introStart y para las pruebas) o null sin recap.js. */
  function introPlan(g, o) {
    var R = VB.Recap, pl = null;
    if (R && typeof R.introPlan === 'function' && g && !g.demo) {
      try { pl = R.introPlan(introInfo(g, o)); } catch (e) { console.error('[VB][ERROR] UI.introPlan: ' + e); pl = null; }
    }
    introUI.plan = pl;
    return pl;
  }
  /** Retratos de tu bloque: en la Carrera el tuyo (y el del compañero en la playa) de VB.CareerUI.portraitReq; en Partido rápido 2v2
   *  tus n.º 1 y n.º 2 (portraitReqMatch). Solo si ya están en la caché (se precargan en el menú: R8); si no, la silueta con el
   *  dorsal (.fb). Nunca se pinta un retrato durante la previa (main.js solo dibuja la cola en 'menu'/'over'). */
  function introPortraits(g) {
    var cs = g && g.career, six = !!(g && g.size === 6), reqs = [], CU = VB.CareerUI, c = null;
    try {
      if (cs && CU && typeof CU.portraitReq === 'function' && VB.Career && VB.Career.get) {
        c = VB.Career.get();
        if (c) { reqs.push(CU.portraitReq(c, 'me', 72)); if (!six && cs.mate) reqs.push(CU.portraitReq(c, 'mate', 72)); }
      } else if (!cs && !six) { reqs.push(portraitReqMatch(0, 0, 72)); reqs.push(portraitReqMatch(0, 1, 72)); }
    } catch (e) { reqs = []; }
    var h = '';
    for (var i = 0; i < reqs.length; i++) {
      var r = reqs[i]; if (!r) continue;
      var ph = portraitHTML(r, '', i === 0 ? 'Tu jugador' : 'Tu compañero');
      if (ph.indexOf('<img') === 0) h += ph;
      else if (i === 0) h += '<span class="fb">' + IN_FB + '<b>' + (r.num | 0 || '') + '</b></span>';
    }
    if (!h) {   // sin retrato posible: la silueta con tu dorsal
      var cp = g && (g.ctrlBase || g.ctrl), n = cs ? cs.num | 0 : cp ? cp.num | 0 : 1;
      h = '<span class="fb">' + IN_FB + '<b>' + (n || '') + '</b></span>';
    }
    return h;
  }
  /** Beat A: los dos bloques (plan.t de recap, o los textos de siempre sin recap.js). */
  function introFill(g, plan) {
    var cs = g && g.career, six = !!(g && g.size === 6), t = plan && plan.t;
    if (!t) {   // (sin recap.js: TÚ / CPU, o los clubes de la Carrera; 6v6: a quién llevas)
      var p6 = six && (g.ctrlBase || g.ctrl), r6 = six ? (ROLE_NAME[g.ctrlRole] || 'Receptor').toLowerCase() : '';
      t = [{ nm: (cs && cs.me) || 'TÚ', sm: cs && cs.meName ? cs.meName : p6 ? 'N.º ' + p6.num + ', ' + r6 : '', tr: null, pos: '' },
        { nm: (cs && cs.rival) || 'CPU', sm: cs && cs.rivalName ? cs.rivalName : six ? 'Equipo rival' : 'Pareja rival', tr: null, pos: '' }];
    }
    var bl = el.intro.querySelectorAll('.in-t');
    for (var i = 0; i < 2 && i < bl.length; i++) {
      var B = bl[i], d = t[i] || {};
      var nm = cpuTxt(String(d.nm || '')), n1 = B.querySelector('.in-nm'), n2 = B.querySelector('.in-sm'), n3 = B.querySelector('.in-tr'), n4 = B.querySelector('.in-pos'), n0 = B.querySelector('.in-pt');
      if (n1) n1.textContent = nm;
      B.classList.toggle('long', nm.length > 11);
      if (n2) {
        var smt = cpuTxt(String(d.sm || '')), yi = smt.length > 16 ? smt.indexOf(' y ') : -1;
        // (pareja larga, «Ares Belmonte y Iker Sanz»: el segundo nombre en su span; en el móvil .in-y va en su propia línea)
        if (yi > 0) n2.innerHTML = escT(smt.slice(0, yi)) + ' <span class="in-y">' + escT(smt.slice(yi + 1)) + '</span>'; else n2.textContent = smt;
        n2.hidden = !smt;
      }
      if (n3) { n3.textContent = d.tr && d.tr.t ? d.tr.t : ''; n3.hidden = !n3.textContent; n3.classList.toggle('boss', !!(d.tr && d.tr.k === 'boss')); }
      if (n4) { n4.textContent = d.pos || ''; n4.hidden = !d.pos; }
      if (n0) n0.innerHTML = i === 0 ? introPortraits(g) : '';
    }
    // beat B: dos datos como mucho (se reserva su hueco desde el principio: la tarjeta no salta al entrar)
    var b = plan && plan.b && plan.b.length ? plan.b : null;
    if (el.introLT) { el.introLT.innerHTML = b ? '<span>' + sepHTML(b, 'v') + '</span>' : ''; el.introLT.hidden = !b; }
    // beat C: lo que está en juego (con el jefe, su pista debajo)
    var c = plan && plan.c, sk = el.introStake;
    if (sk) {
      sk.hidden = !c;
      if (c) {
        sk.children[0].textContent = c.t1 || '';
        var t2 = String(c.t2 || ''), bo = c.k === 'boss' && cs && cs.boss;
        // (jefe: «Bruno Ferrer | Balance con el jefe 1-2»: el tuyo contra él; el «Cara a cara» del beat B es el de los clubes; el estilo ya va en el chip del bloque rival y, si no coincide, aquí también)
        if (bo) t2 = [bo.name || '', (bo.styleName || bo.style) !== bo.nick ? bo.styleName || '' : '', (bo.w | 0) + (bo.l | 0) > 0 ? 'Balance con el jefe ' + (bo.w | 0) + '-' + (bo.l | 0) : ''].filter(Boolean).join(' | ');
        if (t2.indexOf(' | ') >= 0) setSep(sk.children[1], t2.split(' | '), 'v'); else sk.children[1].textContent = t2;
        sk.children[2].textContent = c.k === 'boss' && cs && cs.boss && cs.boss.hint ? cs.boss.hint : '';
      }
    }
  }
  function introStart(g, plan) {
    introUI.on = true; introUI.hudT = 0; introUI.quiet = true;   // sin avisos ni consejos hasta el primer silbato
    plan = plan && plan.beats ? plan : null;
    introUI.plan = plan; introUI.bi = 1; introUI.dur = plan && plan.dur > 0 ? plan.dur : 2.5;
    var di = optIndex('difficulty'), nm = g && VB.DIFF && VB.DIFF[g.difficulty] && VB.DIFF[g.difficulty].name;
    el.introDiff.textContent = 'Nivel ' + (nm || OPT.difficulty.labels[di]);
    var six = !!(g && g.size === 6);
    el.introSrv.textContent = cpuTxt(g && g.serving === 1 ? 'Saca la CPU' : six ? 'Saca tu equipo' : 'Sacas tú');
    if (el.introFmt) el.introFmt.textContent = fmtTxt(g);
    // antetítulo «Palau del Mar ◆ 2 contra 2» (texto fijo del HTML): el formato del partido (6v6, sprint 3)
    var ik = el.intro.querySelector('.in-k > span'), it = ik && ik.lastChild;
    var dr = !!(g && g.drill && !g.demo); introUI.drill = dr;
    if (it && it.nodeType === 3) it.nodeValue = dr ? 'Entrenamiento' : six ? '6 contra 6' : '2 contra 2';
    if (dr) { drillIntro(g); introUI.plan = null; }
    else { try { introFill(g, plan); } catch (e) { console.error('[VB][ERROR] UI.introFill: ' + e); } }
    el.intro.style.setProperty('--in-dur', (dr ? 2.5 : introUI.dur) + 's');
    var d = device();
    el.introHint.innerHTML = d === 'touch' ? 'Toca para empezar ya' : d === 'gamepad' ? padKey('a') + 'para empezar ya' : 'Pulsa cualquier tecla para empezar ya';
    el.intro.className = ''; void el.intro.offsetWidth; el.intro.className = 'show' + (dr ? ' drill' : '');
    el.app.classList.add('intro-on'); el.app.classList.remove('hud-in');
    hideBanner(); clearPrompt();
    if (rm() && el.intro.animate) { try { el.intro.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); } catch (e) { } }
  }
  function introEndUI(skipped) {
    if (!introUI.on) return;
    introUI.on = false; introUI.skipped = !!skipped;
    el.intro.className = 'out' + (skipped ? ' fast' : '') + (introUI.drill ? ' drill' : '');
    if (rm() && el.intro.animate) { try { el.intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: skipped ? 120 : 200, easing: 'ease-in', fill: 'forwards' }); } catch (e) { } }
    introUI.outT = skipped ? 0.16 : 0.3;
    introUI.hudT = skipped ? 0.08 : 0.25;
    if (skipped) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('introSkip'); } catch (e) { } }
  }
  function introTick(rdt) {
    // B5: beats B y C al cruzar su instante (tiempo de la previa = dur − ctx.introLeft); suena ui('beat', i) con i = 1 (B) o 2 (C)
    var pl = introUI.plan;
    if (introUI.on && pl && ctx.introLeft > 0 && introUI.bi < pl.beats.length && introUI.dur - ctx.introLeft >= pl.beats[introUI.bi].at) {
      var bt = pl.beats[introUI.bi];
      el.intro.classList.add(bt.id === 'C' ? 'b3' : 'b2');
      uiK('beat', null, introUI.bi);
      introUI.bi++;
    }
    if (introUI.outT > 0) { introUI.outT -= rdt; if (introUI.outT <= 0) { el.intro.className = ''; el.intro.getAnimations && el.intro.getAnimations().forEach(function (a) { a.cancel(); }); } }
    if (introUI.hudT > 0) {
      introUI.hudT -= rdt;
      if (introUI.hudT <= 0) {
        el.app.classList.remove('intro-on'); restartAnim(el.app, 'hud-in');
        if (!introUI.skipped) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('introEnd'); } catch (e) { } }
      }
    }
  }

  // =====================================================================
  //  CORTINILLA DE MARCA (UI-13)
  // =====================================================================
  // Cortes punto → saque y punto → cambio de campo: la cinta cubre la pantalla en WIPE_IN s contados con el nextCutIn de la
  // cámara (cubierta del todo en el frame del corte) y se va en WIPE_OUT s; el corte al plano de reacción sigue siendo un corte
  // seco. Si el corte llega sin avisar, se cubre en ese mismo frame. Transiciones de pantalla (menú → partido, partido →
  // final, final → menú): 0,45 s con la acción a mitad, bajo la cinta (el parón de montar el partido queda tapado).
  // Movimiento reducido: fundido de 150 ms. VB.Audio.ui('wipe') (soplido con el pico a 0,15 s) al empezar.
  var WIPE_IN = 0.075, WIPE_OUT = 0.085, WIPE_AUDIO = 0.15;
  var wp = { ph: 0, p: 0, t: 0, x: 1, team: 0, cut: false, aud: false, cb: null, dur: 0, hold: 0, last: '', log: null, armCut: -1 };
  function wipeCls(team) {
    var c = 'on' + (team === 1 ? ' t1' : team === 2 ? ' brand' : '') + (rm() ? ' fade' : '') + (wp.cb || wp.lock ? ' lock' : '') + (wp.cut ? ' cutw' : '');
    if (wp.last !== c) { wp.last = c; el.wipe.className = c; }
  }
  /** Coloca la cinta: c = cobertura 0..1 (entrando desde la izquierda) o, con out, saliendo por la derecha. */
  function wipeDraw(c, out) {
    if (rm()) { el.wpBand.style.opacity = c.toFixed(3); return; }
    var W = ctx.width || innerWidth, H = ctx.height || innerHeight, off = W + 0.62 * H;
    var e = out ? c * c * (3 - 2 * c) : 1 - (1 - c) * (1 - c);           // entra frenando, sale acelerando
    var x = out ? e * off : -(1 - e) * off;
    el.wpBand.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0) skewX(-14deg)';
  }
  function wipeOff() { wp.ph = 0; wp.cut = false; wp.aud = false; wp.cb = null; wp.lock = false; wp.last = ''; el.wipe.className = ''; el.wpBand.style.opacity = ''; }
  function wipeSound() { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('wipe'); } catch (e) { } }
  /** Transición de pantalla (450 ms; fundido de 150 ms con movimiento reducido): cb a mitad, con la pantalla cubierta. */
  function wipeRun(team, cb) {
    if (wp.ph && wp.cb) return false;                                   // ya hay una en marcha: un solo cambio de pantalla
    wp.cb = cb || null; wp.team = team; wp.cut = false; wp.ph = 1; wp.t = 0;
    wp.dur = rm() ? 0.075 : 0.2; wp.hold = rm() ? 0 : 0.05;
    wipeSound(); wipeCls(team); wipeDraw(0, false);
    if (wp.log) wp.log.push(['run', performance.now()]);
    return true;
  }
  /** Cada frame (también fuera del partido): avanza la transición de pantalla en tiempo real. */
  function wipeTickRun(rdt) {
    if (!wp.ph || wp.cut) return;
    wp.t += Math.min(rdt, 0.034);
    if (wp.ph === 1) { var c = Math.min(1, wp.t / wp.dur); wipeDraw(c, false); if (c >= 1 && bootBusy()) return; if (c >= 1) { wp.ph = 2; wp.t = 0; var f = wp.cb; wp.cb = null; wipeCls(wp.team); if (f) { try { f(); } catch (e) { console.error('[VB][ERROR] UI.wipe: ' + (e && e.stack || e)); } } } }
    else if (wp.ph === 2) { wipeDraw(1, false); if (wp.t >= wp.hold) { wp.ph = 3; wp.t = 0; } }
    else if (wp.ph === 3) { var r = Math.min(1, wp.t / wp.dur); wipeDraw(rm() ? 1 - r : r, !rm()); if (r >= 1) wipeOff(); }
  }
  /** Cortes de cámara del punto (presUpdate): d = getDebug(), reacted = ya pasó el corte al plano de reacción. */
  function wipeTickCut(g, d, reacted, cutNow) {
    if (ctx.params.wipe === '0') return;                            // &wipe=0: sin cortinilla en los cortes (pruebas A/B)
    var rdt = ctx.realDt || 0.016;
    if (wp.ph && !wp.cut) return;                                       // transición de pantalla en marcha
    var nci = d && typeof d.nextCutIn === 'number' ? d.nextCutIn : -1, lc = d && d.lastCut;
    // cortes que SALEN del punto (reacción o cierre) hacia el saque, la grúa del cambio de campo o el plano corto del sacador rival (CAM-14)
    var masked = cutNow && lc && (lc.kind === 'serve' || lc.kind === 'court' || lc.kind === 'cutaway') && (lc.from === 'point' || lc.from === 'clinch' || lc.kind === 'court');
    if (wp.ph === 3) {                                                  // saliendo
      wp.t += Math.min(rdt, 0.022);                     // un frame largo no se come la salida (se ve entera)
      var r = Math.min(1, wp.t / (rm() ? 0.075 : wp.outDur || WIPE_OUT)); wipeDraw(rm() ? 1 - r : r, !rm());
      if (wp.log) wp.log.push(['out', performance.now(), +r.toFixed(3)]);
      if (r >= 1) wipeOff();
      return;
    }
    if (masked) {                                                       // frame del corte: cubierta del todo, y a salir
      if (!wp.ph) { wp.cut = true; wp.team = lastScorer; wipeCls(wp.team); if (!wp.aud) wipeSound(); wp.inT = 0; }
      // si el corte llegó sin aviso (o con poco), la salida se alarga: la cortinilla nunca dura menos de ~125 ms en pantalla
      wp.outDur = Math.max(WIPE_OUT, 0.125 - (wp.inT || 0));
      wp.cut = true; wp.ph = 3; wp.t = 0; wipeDraw(1, false);
      if (wp.log) wp.log.push(['cut', performance.now(), lc.kind]);
      return;
    }
    // el próximo corte es el de vuelta al saque o la grúa (no el corte seco al plano de reacción ni los de la secuencia de cierre):
    // ya hubo corte de reacción/cierre en este punto (y el cierre está en su plano final), o este punto no lleva corte de reacción
    var clp = d && d.clinch ? d.clinch.phase || '' : '', pfc = d && d.pf ? d.pf.cut : null;
    var after = !!(lc && (lc.kind === 'point' || lc.kind === 'clinch') && lc.t >= cam.pointRt - 0.05 && (!clp || clp === 'hero'));
    var armed = !cutNow && g.mode === 'point' && nci >= 0 && ctx.state === 'playing' && !ctx.frozen && (cam.shot === 'court' || after || (pfc === false && !clp && ctx.time - cam.pointRt > 0.05));
    if (armed && nci <= WIPE_AUDIO && !wp.aud) { wp.aud = true; wipeSound(); }
    if (armed && nci <= (rm() ? 0.075 : WIPE_IN)) {
      if (!wp.ph) { wp.ph = 1; wp.cut = true; wp.team = lastScorer; wipeCls(wp.team); wp.inT = 0; } else wp.inT = (wp.inT || 0) + rdt;
      var c = 1 - nci / (rm() ? 0.075 : WIPE_IN); wipeDraw(Math.max(0, Math.min(1, c)), false);
      if (wp.log) wp.log.push(['in', performance.now(), +c.toFixed(3), +nci.toFixed(3)]);
    } else if (wp.ph === 1 && wp.cut) { wp.ph = 3; wp.t = WIPE_OUT * 0.5; }   // el corte se anuló: se retira
    if (!armed && wp.aud && !wp.ph) wp.aud = false;
  }
  var lastScorer = 0;

  // =====================================================================
  //  INDICADOR DE BORDE (UI-10)
  // =====================================================================
  // El jugador controlado fuera de cuadro (cabeza fuera de la pantalla o detrás de la cámara, o pies a < 40 px de un borde):
  // insignia con su dorsal en el borde, en la recta que va del centro de la pantalla al jugador, con la flecha apuntándole.
  // Se aparta del marcador, de los botones de arriba y de los controles táctiles. Solo con el balón en juego o en el saque.
  var _offBl = [], _offCd = [], _ok = null;
  var offA = { on: false, off: 0, x: -1, y: -1, ang: 0, n: -1, team: -1, obs: [], obsF: -999, sh: '', shT: 0.5, cutT: 0.5 }, _ov = null, _oh = null, _of = null;
  function offObstacles() {
    if (ctx.frame - offA.obsF < 48 && offA.obs.length) return offA.obs;
    offA.obsF = ctx.frame; var L = offA.obs; L.length = 0;
    function add(e) { if (!e) return; var r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) L.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); }
    add(el.sbBody); add(document.querySelector('#sb .sb-top')); add(document.querySelector('.hud-btns'));
    // controles táctiles: botones y joystick (base, mando y rótulo «MOVER»; la zona táctil invisible no estorba)
    var tb = document.querySelectorAll('#touch.on .vt-btn, #touch.on .vt-base, #touch.on .vt-knob, #touch.on .vt-tip'); for (var i = 0; i < tb.length; i++) add(tb[i]);
    return L;
  }
  function offProj(x, y, z, v) { VB.toThree(x, y, z, v); v.project(ctx.camera); return v; }
  var OFF_CINE = { clinch: 1, cutaway: 1, intro: 1, point: 1, court: 1, over: 1 };
  var OFF_FEETOK = { serveUs: 1, defend: 1 };
  function offTick(g, playing) {
    var want = false, p = g.ctrl, W = ctx.width, H = ctx.height;
    // solo en los planos de juego: en los cinematográficos (cutaway del sacador rival, cierre, presentación, punto, grúa, final) no
    // (camera_input, CAM-09/14; integración ola 2)
    var sh = ''; try { sh = VB.CameraRig && VB.CameraRig.getShot ? VB.CameraRig.getShot() || '' : ''; } catch (e) { sh = ''; }
    if (sh !== offA.sh) { offA.sh = sh; offA.shT = ctx.time; }
    // ni en los planos cinematográficos ni en los 0,35 s que siguen a un cambio de plano (la cámara aún se asienta tras el corte)
    if (OFF_CINE[sh] || (!offA.on && ctx.time - (offA.shT || 0) < 0.35)) playing = false;
    if (playing && p && !(ctx.introLeft > 0) && !introUI.quiet && (g.mode === 'rally' || g.mode === 'serve') && ctx.camera && VB.toThree && ctx.THREE && !ctx.portraitBlock) {
      if (!_ov) { _ov = new ctx.THREE.Vector3(); _oh = new ctx.THREE.Vector3(); _of = new ctx.THREE.Vector3(); }
      var hd = offProj(p.x, p.y, (p.z || 0) + 1.85, _oh), ft = offProj(p.x, p.y, Math.max(0, p.z || 0), _of), bd = offProj(p.x, p.y, (p.z || 0) + 1.0, _ov);
      var hx = (hd.x + 1) * 0.5 * W, hy = (1 - hd.y) * 0.5 * H, fx = (ft.x + 1) * 0.5 * W, fy = (1 - ft.y) * 0.5 * H;
      var behind = hd.z > 1 || bd.z > 1;
      var headOut = behind || hx < 0 || hx > W || hy < 0 || hy > H;
      // pies a < 40 px de los bordes laterales o de arriba; abajo, la cámara de juego ya encuadra al jugador bajo (en táctil más):
      // ahí solo cuenta si se le cortan las piernas (rodilla a < 10 px del borde)
      if (!_ok) _ok = new ctx.THREE.Vector3();
      var kn = offProj(p.x, p.y, Math.max(0, p.z || 0) + 0.5, _ok), ky = (1 - kn.y) * 0.5 * H;
      var feetEdge = ft.z > 1 || fx < 40 || fx > W - 40 || fy < 40 || ky > H - 10;
      // planos que cortan las piernas A PROPÓSITO: el saque propio (cámara detrás del sacador) y la defensa que se acerca (CAM-13):
      // ahí solo vale «fuera de cuadro» (cabeza fuera), no «cortado» (integración ola 2: la insignia salía tras el aviso del saque)
      if (OFF_FEETOK[sh]) feetEdge = false;
      // solo cortado (pies fuera, cabeza dentro): tras 0,3 s seguidos (un instante en el borde no merece la insignia)
      offA.cutT = !headOut && feetEdge ? (offA.cutT || 0) + (ctx.realDt || 0.016) : 0;
      want = headOut || (feetEdge && (offA.on || offA.cutT > 0.3));
      if (want) {
        // dirección centro → jugador (detrás de la cámara la proyección sale invertida)
        var dx = bd.x, dy = -bd.y; if (bd.z > 1) { dx = -dx; dy = -dy; }
        dx *= W * 0.5; dy *= H * 0.5;
        var len = Math.sqrt(dx * dx + dy * dy); if (len < 1e-3) { dx = 0; dy = 1; len = 1; }
        dx /= len; dy /= len;
        var sc = hudScale * (ctx.isTouch ? 0.9 : 1), rad = 19 * sc + 8, m = rad + 10;
        var x0 = m + (ctx.isTouch ? 8 : 0), x1 = W - m - (ctx.isTouch ? 8 : 0), y0 = m, y1 = H - m;
        var cx = W * 0.5, cy = H * 0.5, tx = dx > 0 ? (x1 - cx) / dx : dx < 0 ? (x0 - cx) / dx : 1e9, ty = dy > 0 ? (y1 - cy) / dy : dy < 0 ? (y0 - cy) / dy : 1e9;
        var t = Math.min(tx, ty), x = cx + dx * t, y = cy + dy * t, horiz = ty < tx;   // horiz: está en el borde de arriba/abajo
        // solo cortado (la cabeza se ve): la insignia va al borde más cercano a los pies, junto al jugador (no encima de él)
        var cut = !headOut, bx0 = 0, bx1 = 0, by0 = 0;
        if (cut) {
          var bw2 = Math.max(14, (fy - hy) * 0.3);
          bx0 = Math.min(hx, fx) - bw2; bx1 = Math.max(hx, fx) + bw2; by0 = Math.min(hy, fy) - 6;
          var dl = fx - 0, dr = W - fx, dt2 = fy, db = H - fy;
          if (ky > H - 10 || (db <= dl && db <= dr && db <= dt2)) { horiz = true; y = y1; x = Math.max(x0, Math.min(x1, fx)); }
          else if (dl <= dr && dl <= dt2) { horiz = false; x = x0; y = Math.max(y0, Math.min(y1, fy)); }
          else if (dr <= dt2) { horiz = false; x = x1; y = Math.max(y0, Math.min(y1, fy)); }
          else { horiz = true; y = y0; x = Math.max(x0, Math.min(x1, fx)); }
        }
        // apartarse de marcador, botones y controles: deslizar por el borde hasta salir de ellos
        // tramos libres del borde: se quitan las proyecciones (con margen) de los obstáculos que cruzan la franja del borde y
        // se elige el punto libre más cercano al deseado (si el borde está lleno, se pasa a la esquina libre del otro borde)
        var O = offObstacles(), lo = horiz ? x0 : y0, hi = horiz ? x1 : y1, want0 = horiz ? x : y, bl = _offBl; bl.length = 0;
        for (var k = 0; k < O.length; k++) {
          var o = O[k];
          if (horiz ? (y + rad > o.t - 6 && y - rad < o.b + 6) : (x + rad > o.l - 6 && x - rad < o.r + 6)) bl.push(horiz ? o.l - 6 - rad : o.t - 6 - rad, horiz ? o.r + 6 + rad : o.b + 6 + rad);
        }
        if (cut && (horiz ? y + rad > by0 : true)) bl.push(horiz ? bx0 - 4 - rad : by0 - 4 - rad, horiz ? bx1 + 4 + rad : H + rad);   // el propio jugador
        var bestP = want0, bestD = 1e9, free = true;
        for (var q = 0; q < bl.length; q += 2) if (want0 > bl[q] && want0 < bl[q + 1]) { free = false; break; }
        if (!free) {
          var cand = _offCd; cand.length = 0; cand.push(lo, hi);
          for (var q2 = 0; q2 < bl.length; q2 += 2) cand.push(bl[q2], bl[q2 + 1]);
          for (var ci = 0; ci < cand.length; ci++) {
            var cp = cand[ci]; if (cp < lo || cp > hi) continue;
            var blocked = false; for (var q3 = 0; q3 < bl.length; q3 += 2) if (cp > bl[q3] + 0.5 && cp < bl[q3 + 1] - 0.5) { blocked = true; break; }
            if (!blocked && Math.abs(cp - want0) < bestD) { bestD = Math.abs(cp - want0); bestP = cp; }
          }
          if (horiz) x = bestP; else y = bestP;
        }
        // la flecha apunta al jugador desde donde queda la insignia (detrás de la cámara, en la dirección de la recta)
        if (cut) offA.ang = Math.atan2((horiz && y > H * 0.5 ? H + 40 : fy) - y, fx - x);
        else offA.ang = Math.atan2(dy, dx);                   // fuera de cuadro: la recta centro → jugador
        offA.cut = cut;
        // salto grande (otro borde, o el tramo libre cambia): directo, sin cruzar la pantalla (la interpolación cortaba la esquina y
        // pasaba por encima del joystick o del jugador; verificación ola 2)
        if (!offA.on || offA.x < 0 || Math.abs(x - offA.x) + Math.abs(y - offA.y) > 90) { offA.x = x; offA.y = y; }
        else { var kk = 1 - Math.exp(-18 * Math.max(0.001, ctx.realDt || 0.016)); offA.x += (x - offA.x) * kk; offA.y += (y - offA.y) * kk; }
        if (offA.n !== p.num || offA.team !== p.team) { offA.n = p.num; offA.team = p.team; el.offNum.textContent = p.num; el.off.classList.toggle('t1', p.team === 1); }
        el.off.style.transform = 'translate3d(' + offA.x.toFixed(1) + 'px,' + offA.y.toFixed(1) + 'px,0)';
        el.offRot.style.transform = 'rotate(' + (offA.ang * 57.29578).toFixed(1) + 'deg)';
      }
    }
    // histéresis: aparece al momento, se va tras 0,2 s fuera de la condición (sin parpadeo en el borde)
    if (want) { offA.off = 0; if (!offA.on) { offA.on = true; el.off.classList.add('on'); } }
    else if (offA.on) { offA.off += ctx.realDt || 0.016; if (offA.off > 0.2 || !playing || (g.mode !== 'rally' && g.mode !== 'serve')) { offA.on = false; offA.x = -1; el.off.classList.remove('on'); } }
  }

  // =====================================================================
  //  PELOTEO LARGO (UI-15)
  // =====================================================================
  // Desde el 8º toque de la jugada (g.rally.hits, la misma cuenta que point.rallyHits), «JUGADA · N» bajo el marcador; el
  // número late en cada contacto. Al acabar la jugada se queda 1,5 s en dorado con la cuenta final. Desde 15, naranja vivo.
  var RALLY_CHIP = 8, rl = { on: false, n: 0, endT: 0 };
  function rallyShow(n) {
    if (!rl.on) { rl.on = true; el.rl.className = 'rl on'; }
    if (n !== rl.n) { rl.n = n; el.rlN.textContent = n; restartAnim(el.rlN, 'bump'); if (n >= 15) el.rl.classList.add('hot'); }
  }
  function rallyHide() { if (rl.on || rl.endT > 0) { rl.on = false; rl.n = 0; rl.endT = 0; el.rl.className = 'rl'; } }
  function rallyEnd(e) {
    var n = e.rallyHits | 0;
    if (!rl.on || n < RALLY_CHIP) { rallyHide(); return; }
    rallyShow(n); el.rl.classList.remove('hot'); el.rl.classList.add('end'); rl.endT = 1.5;
  }
  /** La cuenta ya está dicha (subtítulo «¡Jugada de N toques!») o llega el rótulo de set/partido: el chip se funde en 0,25 s
   *  (antes seguía bajo el marcador durante toda la celebración del partido). */
  function rallyFade() {
    if (!(rl.on || rl.endT > 0) || el.rl.classList.contains('fade')) return;
    el.rl.classList.add('fade'); rl.endT = Math.min(rl.endT > 0 ? rl.endT : 0.26, 0.26);
  }
  function rallyTick(g, dt, playing) {
    if (rl.endT > 0) { rl.endT -= dt || 0; if (rl.endT <= 0 || g.mode === 'serve') rallyHide(); return; }
    var n = playing && g.mode === 'rally' ? g.rally.hits | 0 : 0;
    if (n >= RALLY_CHIP) rallyShow(n); else if (rl.on) rallyHide();
  }

  // =====================================================================
  //  SELLO DE CALIDAD DEL GOLPE (UI-09)
  // =====================================================================
  // Sale del punto de contacto, a ~72 px en la dirección que menos estorba: nunca encima del balón en los 0,3 s siguientes
  // (se proyecta su vuelo), ni del que golpea, ni del marcador; sube ~30 px y se funde en 0,6 s.
  // «PERFECTO» dorado o «BIEN» blanco con la pista de tiempo («un pelín pronto» / «un pelín tarde») si el desfase la explica.
  // Nada en un golpe flojo. Capa de nivel «aviso corto» del árbitro (UI-02). &stamp=1: también con el autopilot (pruebas).
  var stp = { pl: null, t: 0, wx: 0, wy: 0, wz: 0, ox: 0, oy: 0, x: 0, y: 0, born: 0, cost: 0, dir: 0 }, _sv = null, _sp = { x: 0, y: 0, ok: false }, _sq = { x: 0, y: 0, ok: false };
  var STAMP_R = 72, STAMP_DIRS = [[-0.71, -0.71], [0.71, -0.71], [0, -1], [-1, 0], [1, 0], [-0.71, 0.71], [0.71, 0.71], [0, 1]];
  function stampKF() {
    if (!STAMP_KF) STAMP_KF = [
      { opacity: 0, transform: 'translate(-50%,-50%) translateY(6px) scale(.8)' },
      { opacity: 1, transform: 'translate(-50%,-50%) translateY(-7px) scale(1.07)', offset: 0.14 },
      { opacity: 1, transform: 'translate(-50%,-50%) translateY(-14px) scale(1)', offset: 0.3 },
      { opacity: 1, transform: 'translate(-50%,-50%) translateY(-23px) scale(1)', offset: 0.62 },
      { opacity: 0, transform: 'translate(-50%,-50%) translateY(-30px) scale(.97)' }];
  }
  var STAMP_KF = null, STAMP_KF_RM = [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }];
  function stampDbg(g) { return ctx.params.stamp === '1' && g && g.autopilot; }
  function sproj(x, y, z, out) {
    VB.toThree(x, y, z, _sv); _sv.project(ctx.camera);
    out.x = (_sv.x + 1) * 0.5 * ctx.width; out.y = (1 - _sv.y) * 0.5 * ctx.height; out.ok = _sv.z < 1 && _sv.z > -1;
    return out;
  }
  /** Subida (px) del sello a los t s: la misma curva que STAMP_KF. */
  function stampRise(t) {
    var u = Math.min(1, Math.max(0, t / 0.6)), K = [[0, -6], [0.14, 7], [0.3, 14], [0.62, 23], [1, 30]];
    for (var i = 1; i < K.length; i++) if (u <= K[i][0]) return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * (u - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
    return 30;
  }
  function stampHit(e, g) {
    if (e.team !== 0 || (e.grade !== 'perfect' && e.grade !== 'good')) return;      // golpe flojo: nada
    if (!ctx.camera || !VB.toThree || !ctx.THREE || !el.stamp) return;
    // árbitro de capas (UI-02): con banner y tarjeta guiada a la vez no hay sitio para otra capa
    if (((banT > 0 && el.banner.classList.contains('show')) || bugT > 0) && guideT > 0) return;
    if (!_sv) _sv = new ctx.THREE.Vector3();
    ctx.camera.updateMatrixWorld();
    var pf = e.grade === 'perfect', hint = '';
    if (!pf && typeof e.timing === 'number' && Math.abs(e.timing) > 0.03) hint = e.timing < 0 ? 'un pelín pronto' : 'un pelín tarde';
    // E1: Ajustes · Juego · Golpe al milisegundo (msTiming): los milisegundos (siempre, también en el perfecto)
    if (ctx.settings && ctx.settings.msTiming && typeof e.timing === 'number') { var ms = Math.round(Math.abs(e.timing) * 1000); hint = ms < 5 ? 'justo a tiempo' : ms + ' ms ' + (e.timing < 0 ? 'pronto' : 'tarde'); }
    // E1 (M7): remate perfecto que cierra 3 toques perfectos seguidos de tu equipo: «¡Jugada perfecta!» y la cadena debajo
    // (R4: el criterio es VB.Retos.chainOk, el mismo del reto «Jugada perfecta»; sin retos.js, el de siempre)
    var chainOk = pf && (VB.Retos && VB.Retos.chainOk ? VB.Retos.chainOk(e) : (e.kind === 'spike' && (e.chain | 0) >= 3));
    var C = sproj(e.x, e.y, e.z, _sp); if (!C.ok) return;
    var cx = C.x, cy = C.y;
    // tamaño aproximado del sello (px CSS; sin medir el DOM)
    var k = hudScale * (ctx.isTouch ? 0.82 : 1), bw = (chainOk ? 250 : pf ? 160 : hint ? 132 : 84) * k, bh = (pf ? (chainOk ? 56 : 42) : hint ? 52 : 30) * k;
    // vuelo del balón en los próximos 0,1/0,2/0,3 s, en pantalla (tras el golpe ya lleva su velocidad nueva)
    var b = g.ball, Gv = (VB.C && VB.C.G) || 9.81, BP = _bp3;
    for (var i = 0; i < 3; i++) { var t = (i + 1) * 0.1, q = sproj(b.x + b.vx * t, b.y + b.vy * t, Math.max(0.1, b.z + b.vz * t - 0.5 * Gv * t * t), _sq); BP[i * 3] = q.x; BP[i * 3 + 1] = q.y; BP[i * 3 + 2] = q.ok ? 1 : 0; }
    // el que golpea (de los pies a la cabeza)
    var p = e.player || g.ctrl, F = sproj(p.x, p.y, 0, _sq), fx = F.x, fy = F.y, hy = sproj(p.x, p.y, (p.z || 0) + 1.95, _sq).y, half = Math.max(12, (fy - hy) * 0.3);
    var sb = el.sbBody ? el.sbBody.getBoundingClientRect() : null, W = ctx.width, Hh = ctx.height, best = 0, bc = 1e9;
    for (var d = 0; d < STAMP_DIRS.length; d++) {
      var ox = STAMP_DIRS[d][0] * STAMP_R, oy = STAMP_DIRS[d][1] * STAMP_R * 0.8, c = d >= 5 ? 8 : d >= 3 ? 3 : 0; // arriba, mejor (sube)
      for (var j = 0; j < 3; j++) {
        if (!BP[j * 3 + 2]) continue;
        var sx = cx + ox, sy = cy + oy - stampRise((j + 1) * 0.1), dx = Math.max(0, Math.abs(BP[j * 3] - sx) - bw * 0.5), dy = Math.max(0, Math.abs(BP[j * 3 + 1] - sy) - bh * 0.5);
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 18) c += 100 * (j === 1 ? 2 : 1); else c += 120 / dd;
      }
      var l = cx + ox - bw / 2, r = l + bw, tp = cy + oy - bh / 2 - 30, bt = cy + oy + bh / 2;
      var ix = Math.min(r, fx + half) - Math.max(l, fx - half), iy = Math.min(bt, fy) - Math.max(tp, hy);
      if (ix > 0 && iy > 0) c += 25 * (ix * iy) / Math.max(1, bw * bh);
      if (l < 8 || r > W - 8 || tp < 8 || bt > Hh - 8) c += 200;
      if (sb && l < sb.right + 6 && r > sb.left && tp < sb.bottom + 6 && bt > sb.top) c += 200;
      if (c < bc - 0.01) { bc = c; best = d; }
    }
    stp.ox = STAMP_DIRS[best][0] * STAMP_R; stp.oy = STAMP_DIRS[best][1] * STAMP_R * 0.8;
    stp.pl = null; stp.wx = e.x; stp.wy = e.y; stp.wz = e.z; stp.t = 0.62; stp.born = performance.now(); stp.cost = bc; stp.dir = best;
    // salto con impulso (v1.12.0): pipe o remate con impulso (e.mom ≥ 0,5) en el rótulo y la nota debajo. Orden: jugada perfecta, finta,
    // pipe, con impulso (el al filo va en el rótulo del punto)
    var djT = !chainOk && !e.feint && e.kind === 'spike' && e.shot !== 'tip' ? (e.pipe ? '¡Pipe!' : (+e.mom || 0) >= 0.5 ? '¡Con impulso!' : '') : '';
    el.stampT.textContent = chainOk ? '¡Jugada perfecta!' : djT || (pf ? 'Perfecto' : 'Bien');
    if (djT) { el.stampS.textContent = (pf ? 'Perfecto' : 'Bien') + (hint ? ', ' + hint : ''); el.stampS.hidden = false; srSay(djT.replace(/¡|!/g, '')); }
    else if (chainOk) { el.stampS.innerHTML = sepHTML(lastSetJ ? ['Colocación en salto', 'Remate'] : ['Recepción', 'Colocación', 'Remate'], 'v'); el.stampS.hidden = false; srSay('Jugada perfecta'); }
    else { el.stampS.textContent = hint; el.stampS.hidden = !hint; }
    el.stamp.className = 'on ' + (pf ? 'pf' : 'gd');
    stampPlace();
    stampKF();
    try { if (el.stampIn.animate) el.stampIn.animate(rm() ? STAMP_KF_RM : STAMP_KF, { duration: 600, easing: 'linear', fill: 'both' }); } catch (er) { }
  }
  /** 6v6 «¡Pídela!» (sim evento 'ask'): el mismo sello, sobre la cabeza del humano. Aceptado: «¡Aquí!» (el colocador te busca);
   *  fuera de su ventana (sim askOk): «Ahora no» y por qué (zaguero, colocación ya hecha o saque). */
  function stampAsk(e, g) {
    var p = e.player || g.ctrl;
    if (!p || !ctx.camera || !VB.toThree || !ctx.THREE || !el.stamp) return;
    if (!_sv) _sv = new ctx.THREE.Vector3();
    ctx.camera.updateMatrixWorld();
    // (D5: el zaguero que no es líbero sí puede pedir el pipe; si la sim aún no lo admite, el motivo es el fondo. El colocador nunca pide:
    //  el 2º toque es suyo, D3)
    var hint = e.ok ? '' : g.mode === 'serve' ? 'tras el saque' : p.role === 'L' ? 'el líbero no remata' : p.role === 'S' ? (!p.front ? 'en el fondo no rematas' : g.touchTeam === 0 && g.touches === 1 && g.lastPlayer === p ? 'ya han colocado' : 'tú colocas') : (g.touchTeam === 0 && g.touches >= 2) || (VB.Sim.atkPhase && VB.Sim.atkPhase(g, 0)) ? 'ya han colocado' : !p.front ? 'en el fondo no rematas' : 'ya han colocado';
    stp.pl = p; stp.ox = 0; stp.oy = 0; stp.wx = p.x; stp.wy = p.y; stp.wz = (p.z || 0) + 2.5; stp.t = e.ok ? 0.62 : 0.8; stp.born = performance.now(); stp.cost = 0; stp.dir = 0;
    el.stampT.textContent = e.ok ? '¡Aquí!' : 'Ahora no';
    el.stampS.textContent = hint; el.stampS.hidden = !hint;
    el.stamp.className = 'on gd';
    stampPlace();
    stampKF();
    try { if (el.stampIn.animate) el.stampIn.animate(rm() ? STAMP_KF_RM : STAMP_KF, { duration: e.ok ? 600 : 780, easing: 'linear', fill: 'both' }); } catch (er) { }
  }
  var _bp3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  /** Cada frame mientras vive: sigue al punto del mundo (la cámara se mueve) con su desplazamiento. */
  function stampPlace() {
    if (stp.pl) { stp.wx = stp.pl.x; stp.wy = stp.pl.y; stp.wz = (stp.pl.z || 0) + 2.5; }   // «¡Aquí!» (6v6): sigue al jugador
    var C = sproj(stp.wx, stp.wy, stp.wz, _sp);
    if (!C.ok) { el.stamp.className = ''; stp.t = 0; return; }
    stp.x = C.x + stp.ox; stp.y = C.y + stp.oy;
    el.stamp.style.transform = 'translate3d(' + stp.x.toFixed(1) + 'px,' + stp.y.toFixed(1) + 'px,0)';
  }
  function stampTick(rdt) {
    if (!(stp.t > 0)) return;
    stp.t -= rdt;
    if (stp.t <= 0 || (ctx.state !== 'playing' && !(ctx.state === 'over' && ctx.game && ctx.game.drill && geGate))) { stp.t = 0; el.stamp.className = ''; return; }
    stampPlace();
  }

  // =====================================================================
  //  PRESENTACIÓN DEL PUNTO (UI-03) Y SINCRONÍA CON LA CÁMARA (UI-04)
  // =====================================================================
  // Nivel 1 (punto de trámite, highlight < 0,55): pestaña compacta junto al marcador (~1 s), sin subtítulo salvo que
  //   informe (fuera, red, antena, dobles, 8 s…). Nivel 2 (bloqueo, ace, jugada ≥ 8 toques, racha ≥ 3, punto de set salvado o
  //   highlight ≥ 0,55): cinta en el tercio inferior (franja alta en pantallas bajas), tras el corte al plano de reacción y
  //   mientras dure ese plano (~1,4 s). Nivel 3 (set/partido): tratamiento central, tras el momento del héroe.
  // Los textos del árbitro de sim («Dobles…», «Falta de saque: 8 segundos», «Ataque sobre el saque»…) salen tal cual.
  // (6v6: «Ataque / Bloqueo de zaguero», «Ataque / Bloqueo del líbero» y «Falta de posición» —lote A D4— también salen tal cual)
  var REF_REASONS = { net: 1, antenna: 1, double: 1, four: 1, under: 1, attackServe: 1, block: 1, serve: 1, backAttack: 1, backBlock: 1, position: 1 };
  var pres = null;            // presentación pendiente {t1,t2,t3,cls,dur,kind,gate,rt}
  var lastBig = null;         // última cinta de nivel 2 {team, k} (para no repetir la misma dos puntos seguidos)
  // Ritmo de las cintas grandes: como mucho UNA cada 3 puntos, salvo un punto enorme (highlight ≥ 0,8) o jugado con punto de
  // set/partido (o que lo salva). Medido en partidos humanos (no solo con autopilot): quien juega bien encadena aces, bloqueos
  // y rachas, y la cinta salía en el 42-45 % de los puntos (objetivo ≤ 35 %).
  var BIG_GAP = 2, bigGap = 9, atSP = false;
  var cam = { shot: '', prev: '', cutN: -1, pointRt: -99, pointCut0: -1, courtRt: -1 };
  function queuePres(o) {
    o.t1 = cpuTxt(o.t1); o.t2 = cpuTxt(o.t2);
    var d = camDbg(); // contador de cortes ACTUAL (cam.cutN solo se refresca durante el punto)
    o.rt = ctx.time; o.cut0 = d && typeof d.cutN === 'number' ? d.cutN : -1; pres = o;
  }
  // Calibrado con la sim (tools/out/ui1/tierstat*.js, 16 partidos con autopilot por nivel): con «jugada ≥ 8 toques» y toda
  // racha ≥ 3 salía cinta grande en el 42 % de los puntos (objetivo ≤ 35 %). Ahora: jugada ≥ 10 toques; la racha se celebra al
  // llegar a 3 y a 5 y solo la tuya; un error del rival es de trámite salvo que salve un punto de set; y la misma cinta no se
  // repite dos puntos seguidos → 32,5 % en Fácil, 28,5 % en Normal, 27 % en Difícil.
  // SIM-05 (ola 3) ya calibra highlight (jugada larga, defensas, racha, final apretado y bloqueo directo van dentro del número):
  // basta highlight ≥ VB.HOLD.bigAt (la misma frontera que la pausa larga de 2,4 s), más el ace y el punto de set salvado.
  var RALLY_BIG = 10;   // solo para el subtítulo «¡Jugada de N toques!»
  function tierOf(e, k) {
    var hl = typeof e.highlight === 'number' ? e.highlight : 0, big = (VB.HOLD && VB.HOLD.bigAt) || 0.55;
    if (k === 'blockPt' || k === 'ace' || e.savedSetPoint) return 2;
    if (k === 'error' || k === 'srvErr') return 1;
    return hl >= big ? 2 : 1;
  }
  function presentPoint(e, me, k, g) {
    var spNow = atSP; atSP = false;                          // ¿se jugó con punto de set/partido? (serveReady de esta jugada)
    if (e.penalty) {                                         // Ambiente: punto de castigo (roja) → la pestaña de jugada (la cinta grande tapaba el marcador justo al subir el punto)
      lastBig = null; bigGap += 1;
      showBug(e.team, 'Punto de castigo', me ? 'Roja al rival: punto y saque para ti' : 'Roja a tu equipo: punto y saque del rival', e.sideout ? '⇄ Saque' : '', 2.4);
      return;
    }
    if (e.matchWon || e.setWon) { hideBug(false); lastBig = null; bigGap = 9; return; } // lo anuncian 'set' / 'match' (nivel 3)
    var ref = !!REF_REASONS[e.reason] || /^(Saque|Balón) a la red$/.test(e.text || ''), txt = e.text || '';
    var sub = '';
    if (ref || e.reason === 'out') sub = txt;               // texto del árbitro: siempre, tal cual
    var tier = tierOf(e, k);
    // la misma cinta dos puntos seguidos (2º ace o 2º bloqueo del mismo equipo) cansa: el segundo va en la pestaña
    // (con esto la cinta grande sale en el 28-33 % de los puntos según el nivel; medido con tools/out/ui1/tierstat5.js)
    if (tier === 2 && lastBig && lastBig.team === e.team && lastBig.k === k && !e.savedSetPoint) tier = 1;
    var hlv = typeof e.highlight === 'number' ? e.highlight : 0;
    // (un bloqueo directo TUYO de los buenos, highlight ≥ 0,6, sale grande aunque haya habido cinta hace poco: verificación ola 2)
    if (tier === 2 && bigGap < BIG_GAP && hlv < 0.8 && !e.savedSetPoint && !spNow && !(k === 'blockPt' && me && hlv >= 0.6)) tier = 1;
    // C4: tu ace o tu bloqueo directo (el golpe lo has dado tú) sale siempre en la cinta cinética, sin BIG_GAP ni «la misma dos
    // veces»; el de tu compañero IA sigue el ritmo de siempre (si baja a la pestaña, sin cinética)
    var kin = me && (k === 'ace' || k === 'blockPt') && kinOn(g);
    var lsx = liveStats(g);
    if (kin && (k === 'ace' ? lsx.lastHuman[0] : lsx.blockHuman)) tier = 2;
    kin = kin && tier === 2;
    bigGap = tier === 2 ? 0 : bigGap + 1;
    lastBig = tier === 2 ? { team: e.team, k: k } : null;
    // títulos: mismo estilo siempre («… de la CPU»)
    var t1;
    if (k === 'ace') t1 = me ? (tier > 1 ? '¡Ace!' : 'Ace') : 'Ace de la CPU';
    else if (k === 'kill') t1 = me ? (tier > 1 ? '¡Remate!' : 'Remate') : 'Remate de la CPU';
    else if (k === 'tip') t1 = g && g.beach ? (me ? (tier > 1 ? '¡Pokey!' : 'Pokey') : 'Pokey de la CPU') : me ? (tier > 1 ? '¡Dejada!' : 'Dejada') : 'Dejada de la CPU';
    else if (k === 'blockPt') t1 = me ? (tier > 1 ? (kin ? '¡Muro!' : '¡Punto de bloqueo!') : 'Punto de bloqueo') : 'Bloqueo de la CPU';
    // (6v6: la falta de posición del equipo que saca llega como srvErr; su texto va en el subtítulo, el título es el punto)
    else if (k === 'srvErr') t1 = /^falta de (saque|posición)/i.test(txt) ? (me ? 'Error de la CPU' : 'Punto de la CPU') : (me ? 'Falta de saque de la CPU' : 'Falta de saque');
    else if (k === 'error') t1 = me ? 'Error de la CPU' : 'Punto de la CPU';
    else t1 = me ? (tier > 1 ? '¡Punto!' : 'Punto') : 'Punto de la CPU';
    // ace con roce de recepción: dice por qué (sim lo acredita al saque); el ace limpio no necesita subtítulo. Si el árbitro
    // pita algo («Balón a la red» de la recepción que acaba en la red…), manda su texto, tal cual
    if (k === 'ace' && (e.rallyHits | 0) > 0 && !ref) sub = me ? 'Recepción forzada' : 'Recepción fallida';
    // ace en el que la RECEPCIÓN acaba en la red: «Balón a la red» junto a «¡Ace!» se leía como saque a la red (falta del que
    // saca); se cuenta desde el lado del que recibe (verificación ola 2). Las faltas de red/antena/dobles/8 s siguen tal cual.
    if (k === 'ace' && /^Balón a la red$/.test(txt)) sub = me ? 'La recepción de la CPU va a la red' : 'Tu recepción va a la red';
    // contexto que sí informa (nivel 2), si no hay texto del árbitro
    if (!sub && tier > 1) {
      if (e.savedSetPoint) sub = me ? 'Punto de set salvado' : 'La CPU salva el punto de set';
      else if ((e.rallyHits | 0) >= RALLY_BIG) sub = '¡Jugada de ' + e.rallyHits + ' toques!';   // UI-15 (un solo término: «jugada», como en la hoja final)
      else if ((e.streak | 0) >= 3) sub = me ? e.streak + ' puntos seguidos' : e.streak + ' puntos seguidos de la CPU';
      else if (e.clutch && !spNow) sub = 'Final apretado';   // SIM-05: últimos puntos del set con ≤ 2 de diferencia
    }
    var chip = e.sideout ? 'CAMBIO DE SAQUE' : '';
    if (tier === 1) { // la pestaña siempre lleva la llamada del árbitro (fuera, red, antena, dobles, 8 s…)
      showBug(e.team, t1, sub, e.sideout ? '⇄ Saque' : '', sub ? 1.5 : 1.05);
      return;
    }
    // cinta: nunca el mismo subtítulo dos veces seguidas (salvo las faltas del árbitro: red, antena, dobles, 8 s…, que van siempre)
    if (sub && sub === lastSub && !ref) sub = '';
    if (sub) lastSub = sub;
    hideBug(false);
    queuePres({ t1: t1, t2: sub, t3: chip, cls: (me ? (k === 'ace' || kin ? 'ace' : 'win') : 'lose') + ' r2' + (kin ? ' kin' : ''), dur: k === 'ace' ? 1.6 : kin ? 1.5 : 1.45, kind: 'point', gate: 'cut',
      kin: kin ? (k === 'ace' ? 'ace' : 'muro') : '' });
  }
  // C4 (sprint 2-4, spec S3-C4C5 §2.1): cinta cinética. ¡Ace! y ¡Muro! de tu equipo y el primer punto de set / partido de cada
  // racha entran con un golpe de escala y giro (Web Animations sobre #bn1, solo transform y opacidad), una sacudida corta de la cinta,
  // el destello dorado en el impacto (ace y muro) y el sonido de rótulo (VB.Audio.ui('rotulo', tipo, equipo, retraso al impacto)).
  // Nunca en demo, espectador, Entrenamiento ni fuera de 'playing'. Menos movimiento: fundido de 150 ms (el sonido se queda).
  var KIN_KF = null, KIN_KF_SP = null, KIN_SHAKE = null, KIN_KF_RM = [{ opacity: 0 }, { opacity: 1 }], lastSpKey = '';
  var rot = { n: 0, kind: '', team: -1, t: 0 };
  function kinOn(g) { return !!g && !g.demo && !g.watch && !g.drill && !!ctx && ctx.state === 'playing'; }
  function kinKF(s0) {
    return [{ opacity: 0, transform: 'scale(' + s0 + ') rotate(-7deg)' }, { opacity: 1, transform: 'scale(.9) rotate(1deg)', offset: 0.38 },
      { transform: 'scale(1.07) rotate(0deg)', offset: 0.62 }, { opacity: 1, transform: 'scale(1)' }];
  }
  function kinPlay(kind, team) {
    if (!KIN_KF) { KIN_KF = kinKF(2.3); KIN_KF_SP = kinKF(1.8); KIN_SHAKE = [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }]; }
    var r = rm(), sp = kind === 'sp' || kind === 'mp', soft = !!(ctx.settings && ctx.settings.softFlash);
    try { if (el.bn1.animate) el.bn1.animate(r ? KIN_KF_RM : sp ? KIN_KF_SP : KIN_KF, { duration: r ? 150 : 420, easing: r ? 'linear' : 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' }); } catch (e) { }
    var rib = el.banner.firstChild;
    if (!r && !soft && rib && rib.animate) { try { rib.animate(KIN_SHAKE, { duration: 180, delay: 150, easing: 'ease-out' }); } catch (e) { } }
    if (!sp && !r) setTimeout(function () { pulse(0, true); }, 160);
    try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('rotulo', kind, team | 0, r ? 0.05 : 0.16); } catch (e) { }
    sndT = performance.now();
    srSay(kind === 'ace' ? 'Ace' : kind === 'muro' ? 'Muro' : kind === 'mp' ? 'Punto de partido' : 'Punto de set');
    rot.n++; rot.kind = kind; rot.team = team | 0; rot.t = performance.now();
  }
  /** Plano de cámara (con guarda) y contador de cortes (CAM-05: getDebug().cutN; si no existe, se deduce). */
  function camRead() {
    var CR = VB.CameraRig; cam.prev = cam.shot;
    try { cam.shot = CR && CR.getShot ? CR.getShot() || '' : ''; } catch (e) { cam.shot = ''; }
    return cam.shot;
  }
  /** Plano de héroe con el que anota a la izquierda (bajo el marcador): el marcador se atenúa (camera_input, CAM-02). */
  var sbDim = false;
  function sbDimTick(g) {
    var on = false;
    if (ctx.state === 'playing' && g.mode === 'point' && cam.shot === 'point') { var d = camDbg(); on = !!(d && d.pf && d.pf.mode === 'hero' && d.pf.heroX < -0.5); }
    if (on !== sbDim) { sbDim = on; if (el.sb) el.sb.classList.toggle('dim', on); }
  }
  /** Marcador en juego (petición de Ferran, 12-nov: «que no moleste tanto mid-gameplay»): con el balón en juego (g.mode 'rally',
   *  desde el golpe de saque hasta el bote o la falta) el marcador se queda en la mosca del tanteo (.sb.inplay, ver index.html «TV D3»).
   *  Saque por hacer, punto, pausa, final: entero. Cada frame, solo compara un booleano.
   *  La caja de #sb conserva el tamaño entero (min-width/min-height del momento de entrar): camera.js (readHud) la lee en el
   *  mismo frame del punto, ANTES de UI.update, para que el héroe no quede debajo del marcador ya crecido. */
  var sbLive = false;
  function sbLiveTick(g) {
    var on = ctx.state === 'playing' && !!g && g.mode === 'rally';
    if (on === sbLive || !el.sb) return;
    sbLive = on;
    if (on) { el.sb.style.minWidth = el.sb.offsetWidth + 'px'; el.sb.style.minHeight = el.sb.offsetHeight + 'px'; }
    else { el.sb.style.minWidth = ''; el.sb.style.minHeight = ''; }
    el.sb.classList.toggle('inplay', on);
  }
  function camDbg() { try { return VB.CameraRig && VB.CameraRig.getDebug ? VB.CameraRig.getDebug() : null; } catch (e) { return null; } }
  /** ¿Ya cortó la cámara al plano de reacción? Con CAM-05 (cutN) lo sabe; si no, 0,47 s reales tras empezar el plano del punto
   *  (camera.js PF.hold = 0,45: la cámara de juego mira el bote y luego corta). */
  function reactionReady(o, d) {
    var t = ctx.time - o.rt;
    if (d && typeof d.cutN === 'number' && o.cut0 >= 0) {
      if (d.cutN !== o.cut0) return true;                          // ya cortó: la cinta entra con el plano nuevo
      var nc = typeof d.nextCutIn === 'number' ? d.nextCutIn : -1;
      if (nc >= 0 && nc < 0.6) return false;                       // corte inminente: se espera a él
    }
    return t >= 0.47;                                              // sin corte (deslizamiento) o sin CAM-05
  }
  // cajas en pantalla de los 4 atletas y del balón; el héroe y la víctima del plano del punto (CameraRig.getDebug().pf.hero /
  // .vic = dorsal) pesan mucho más: la cinta no los tapa nunca si hay otro sitio
  var _hb = [], _hbN = 0, _hv = null;
  function hbBox(i) { return _hb[i] || (_hb[i] = { l: 0, t: 0, r: 0, b: 0, w: 1 }); }
  function heroBoxes(g, d) {
    _hbN = 0;
    if (!ctx.camera || !VB.toThree || !ctx.THREE) return;
    if (!_hv) _hv = new ctx.THREE.Vector3();
    // en el frame del corte la cámara ya está en el plano nuevo pero su matriz aún no (se actualiza al pintar)
    ctx.camera.updateMatrixWorld();
    var pf = d && d.pf, W = ctx.width, H = ctx.height;
    for (var j = 0; j < g.players.length; j++) {
      var q = g.players[j];
      VB.toThree(q.x, q.y, 0, _hv); _hv.project(ctx.camera); if (_hv.z > 1 || _hv.z < -1) continue;
      var fx = (_hv.x + 1) * 0.5 * W, fy = (1 - _hv.y) * 0.5 * H;
      VB.toThree(q.x, q.y, (q.z || 0) + 2.0, _hv); _hv.project(ctx.camera);
      var hy = (1 - _hv.y) * 0.5 * H, h = Math.max(20, fy - hy), o = hbBox(_hbN++);
      o.l = fx - h * 0.3; o.r = fx + h * 0.3; o.t = hy - h * 0.06; o.b = fy;
      o.w = pf && (q.num === pf.hero || q.num === pf.vic) ? 12 : 1;
    }
    var b = g.ball;
    if (b) { VB.toThree(b.x, b.y, b.z, _hv); _hv.project(ctx.camera); if (_hv.z < 1 && _hv.z > -1) { var bx = (_hv.x + 1) * 0.5 * W, by = (1 - _hv.y) * 0.5 * H, ob = hbBox(_hbN++); ob.l = bx - 30; ob.r = bx + 30; ob.t = by - 30; ob.b = by + 30; ob.w = 0.5; } }
  }
  function hitsHero(x, y, w, h) {
    var a = 0;
    for (var i = 0; i < _hbN; i++) { var o = _hb[i], ix = Math.min(x + w, o.r) - Math.max(x, o.l), iy = Math.min(y + h, o.b) - Math.max(y, o.t); if (ix > 0 && iy > 0) a += o.w * ix * iy; }
    return a;
  }
  /** Coloca la cinta de nivel 2: tercio inferior (izquierda o derecha) en escritorio, franja alta en pantallas bajas o
   *  táctiles (abajo están el joystick y los botones); la primera que no tape al héroe ni a la víctima. */
  function placeRib2(g, d) {
    var W = ctx.width, H = ctx.height, B = el.banner;
    B.classList.remove('fit');
    var bw = B.offsetWidth, bh = B.offsetHeight, m = 16;
    heroBoxes(g, d);
    var sb = el.sbBody ? el.sbBody.getBoundingClientRect() : null, topL = sb ? sb.right + 12 : 230, topR = W - (ctx.isTouch ? 64 : 120);
    var cands = [];
    var low = H <= 560 || ctx.isTouch;
    // franja alta en táctil: la cinta no pisa la lupa ni la pausa (antes topR = W − 64 dejaba la lupa debajo) ni la pastilla
    // CHALLENGE si sube hasta la altura de la cinta; si no cabe, se encoge (.fit) antes de caer al centro (revisión móvil, 568×320)
    var btnB = 0;
    if (ctx.isTouch) {
      var qs = document.querySelectorAll('#touch .vt-zoom,#touch .vt-pause');
      for (var qi = 0; qi < qs.length; qi++) { if (!qs[qi].offsetWidth) continue; var qr = qs[qi].getBoundingClientRect(); topR = Math.min(topR, qr.left - 8); btnB = Math.max(btnB, qr.bottom); }
    }
    var rh = B.firstChild ? B.firstChild.offsetHeight : bh;
    var cr = el.chal && el.chal.offsetWidth ? el.chal.getBoundingClientRect() : null;
    if (cr && cr.top < 10 + rh + 4) topR = Math.min(topR, cr.left - 8);
    if (low && ctx.isTouch && bw > topR - topL) { B.classList.add('fit'); bw = B.offsetWidth; bh = B.offsetHeight; }
    if (!low) {
      var y1 = Math.round(H * 0.70 - bh * 0.5), y2 = Math.round(H - bh - 28);
      cands.push([m + 40, y1, 'l'], [W - m - 40 - bw, y1, 'r'], [m + 40, y2, 'l'], [W - m - 40 - bw, y2, 'r']);
    }
    var tx = Math.max(topL, Math.min(topR - bw, (topL + topR - bw) * 0.5));
    if (!(low && ctx.isTouch && bw > topR - topL)) cands.push([tx, 10, 't']);
    // no cabe ni encogida: centrada, pero bajo la fila de botones (encima tapaba la pausa y la lupa)
    if (low && bw > topR - topL) {
      if (ctx.isTouch && btnB) { var fx = Math.max(topL, Math.min(W - m - bw, (W - bw) * 0.5)); cands.push([fx, Math.round((cr && fx + bw > cr.left ? Math.max(btnB, cr.bottom) : btnB) + 6), 't']); }
      else cands.push([(W - bw) * 0.5, 10, 't']);
    }
    var best = cands[0], ba = 1e18;
    for (var i = 0; i < cands.length; i++) { var c = cands[i], a = hitsHero(c[0], c[1], bw, bh); if (a < ba - 1) { ba = a; best = c; } }
    if (ctx.params.uidbg) console.info('[VB][ui] cinta', JSON.stringify({ c: cands.map(function (c) { return [Math.round(c[0]), Math.round(c[1]), c[2], Math.round(hitsHero(c[0], c[1], bw, bh))]; }), bw: bw, bh: bh, pf: d && d.pf ? [d.pf.hero, d.pf.vic] : null }));
    B.style.left = Math.round(best[0]) + 'px'; B.style.top = Math.round(best[1]) + 'px';
    B.classList.add('at-' + best[2]);
    banRect = null;
  }
  /** Nivel 3 (set/partido): centrado; arriba (sobre la grada), a media altura o en el tercio inferior, donde menos tape al héroe
   *  y a la víctima del plano de reacción (a 1280×720, a media altura tapaba la cabeza del que celebra). */
  function placeT3(g, d) {
    var W = ctx.width, H = ctx.height, B = el.banner;
    B.style.left = ''; // (se recoloca también al entrar la órbita del cierre: se mide centrado)
    var bh = B.offsetHeight, rw = Math.min(W, el.banner.firstChild.offsetWidth), bw = Math.min(W, rw + 40), ro = (bw - rw) * 0.5;
    heroBoxes(g, d);
    // zonas que el rótulo no tapa nunca: el marcador ENTERO (franja, cuerpo con el historial de sets, etiqueta de punto de set y
    // chip de la jugada) y los botones de arriba. Antes solo contaba .sb-body y, en la órbita del cierre (un único sitio arriba),
    // «¡GANAS EL PARTIDO!» tapaba el 25 final a 1280×720 (verificación ola 3)
    var R = [], m = 16;
    function keep(n) { if (!n || n.hidden || !n.offsetWidth) return; var q = n.getBoundingClientRect(); if (q.width) R.push(q); }
    if (el.sb) { keep(el.sb.firstElementChild); keep(el.sbBody); if (!el.tag.hidden) keep(el.tag); if (el.rl.classList.contains('on') && !el.rl.classList.contains('fade')) keep(el.rl); }
    keep(document.querySelector('.hud-btns')); if (ctx.isTouch) keep(document.querySelector('#touch .vt-pause'));
    function hud(x, y) {
      var a = 0;
      // (con la cinta de verdad, sin el margen de 20 px por lado del cálculo de centrado)
      for (var k = 0; k < R.length; k++) { var r = R[k], ix = Math.min(x + ro + rw, r.right + 12) - Math.max(x + ro, r.left - 12), iy = Math.min(y + bh, r.bottom + 10) - Math.max(y, r.top - 10); if (ix > 0 && iy > 0) a += 400 * ix * iy; }   // (manda sobre el héroe, peso 12)
      return a;
    }
    var hudBot = 0; for (var k = 0; k < R.length; k++) hudBot = Math.max(hudBot, R[k].bottom);
    var xc = (W - bw) * 0.5, ys = [Math.round(H * (H <= 560 ? 0.12 : 0.17)), Math.max(Math.round(H * 0.04), 8), Math.round(H - bh - H * (ctx.isTouch ? 0.28 : 0.07))];
    // órbita del cierre (CAM-09): la cámara deja libre la mitad de arriba para el rótulo (camera_input; integración ola 2)
    var dc = d || camDbg();
    if (dc && dc.clinch && dc.clinch.phase === 'hero') ys = [ys[1]];
    // cada altura centrada; si pisa el marcador o los botones, desplazada a la derecha del marcador (si cabe) o justo debajo
    var cands = [];
    for (var i = 0; i < ys.length; i++) {
      var y = ys[i]; if (y < 0) continue;
      cands.push([xc, y, i === 0 ? 0.85 : 1]);              // a igualdad, la posición de siempre
      if (hud(xc, y) > 0) {
        var sbR = 0; for (var j = 0; j < R.length; j++) if (R[j].left < W * 0.5) sbR = Math.max(sbR, R[j].right);
        var xr = Math.max(xc, sbR + m - ro); if (xr + ro + rw <= W - m) cands.push([xr, y, 1]);
        var yb = Math.round(hudBot + 12); if (yb + bh <= H - 8) cands.push([xc, yb, 1.02]);
      }
    }
    var best = cands[0], ba = 1e18;
    for (var c = 0; c < cands.length; c++) {
      var q = cands[c], a = hitsHero(q[0], q[1], bw, bh) * q[2] + hud(q[0], q[1]);
      if (a < ba - 1) { ba = a; best = q; }
    }
    // #banner va de lado a lado (left 0 / right 0, contenido centrado): para el centro en best[0], left = 2·x − (W − bw)
    var L = Math.round(2 * best[0] - (W - bw));
    B.style.left = L > 0 ? L + 'px' : '';
    B.style.top = best[1] + 'px'; banRect = null;
    if (ctx.params.uidbg) console.info('[VB][ui] rótulo', JSON.stringify({ c: cands.map(function (q) { return [Math.round(q[0]), q[1], Math.round(hitsHero(q[0], q[1], bw, bh)), Math.round(hud(q[0], q[1]))]; }), bw: bw, bh: bh }));
  }
  /** Cada frame: avanza la presentación según el plano de cámara (UI-04). */
  function presUpdate(g, dt) {
    var shot = camRead(), d = null;
    var inPoint = g.mode === 'point' || g.mode === 'over';
    if (shot === 'point' || shot === 'court' || shot === 'clinch' || pres || wp.ph || g.mode === 'point' || g.mode === 'over' || cam.prev === 'point' || cam.prev === 'court') d = camDbg();
    var cn = d && typeof d.cutN === 'number' ? d.cutN : -1;
    if (shot === 'point' && cam.prev !== 'point') { cam.pointRt = ctx.time; cam.pointCut0 = cn; }
    var cutNow = cn >= 0 && cam.cutN >= 0 && cn !== cam.cutN;     // corte en ESTE frame (nextCutIn vale 0 en él)
    if (cn >= 0) { if (pres && pres.cut0 < 0) pres.cut0 = cn; cam.cutN = cn; }
    // ¿pasó ya el corte al plano de reacción? (a partir de ahí, el siguiente corte es la vuelta al saque o la grúa)
    var reacted = shot === 'court' || (cn >= 0 && cam.pointCut0 >= 0 ? cn > cam.pointCut0 : false) || ctx.time - cam.pointRt > 0.6;
    wipeTickCut(g, d, reacted, cutNow);
    // corte de vuelta al saque (o cambio de plano fuera del punto): nada del punto sobrevive al corte
    var leftPoint = (cam.prev === 'point' || cam.prev === 'court') && shot !== cam.prev && shot !== 'court' && shot !== 'point';
    if (leftPoint || (!inPoint && g.mode !== 'over')) {
      if (banT > 0 && (banKind === 'point' || banKind === 'set' || banKind === 'court')) hideBanner();
      if (bugT > 0) hideBug(false);
      if (pres && pres.kind !== 'match') pres = null;
      pendCourt = null;
    }
    // vista previa del corte (g.timer = s de juego que quedan de la pausa del punto; el corte llega cuando acaba):
    // la cinta y la pestaña se funden en 120 ms y acaban justo antes del corte
    if (g.mode === 'point' && g.timer > 0 && reacted && dt > 0 && !cutNow) { // (congelado o en pausa: nada se va)
      var nci = d && typeof d.nextCutIn === 'number' ? d.nextCutIn : -1;
      var lead = nci >= 0 ? Math.min(nci, g.timer) : g.timer;
      if (lead <= 0.14) {
        if (banT > 0 && (banKind === 'point' || banKind === 'court' || banKind === 'set')) fadeBanner(0.12);
        if (bugT > 0) hideBug(true);
      }
    }
    // pendiente que espera al plano de reacción
    if (pres && pres.gate === 'cut' && (ctx.time - pres.rt > 0.2) && (shot === 'point' || shot === 'over' || pres.kind === 'match')) {
      if (reactionReady(pres, d) || ctx.time - pres.rt > 1.2) {
        var o = pres; pres = null;
        banner(o.t1, o.t2, o.t3 || o.chip, o.cls, o.dur, o.kind);
        if (o.kin) kinPlay(o.kin, 0);   // C4: el golpe de entrada, en el mismo frame en que se pinta la cinta
        if (o.kind === 'set' || o.kind === 'match' || /toques!$/.test(o.t2 || '')) rallyFade();   // UI-15: la cuenta ya no hace falta
        if (o.kind === 'point') placeRib2(g, d); else if (o.kind === 'set' || o.kind === 'match') placeT3(g, d);
        // la cinta del punto no pasa del final de la pausa (sale antes del corte)
        if (o.kind === 'point' && g.mode === 'point' && g.timer > 0) banT = Math.min(banT, Math.max(0.5, g.timer - 0.02));
      }
    }
    // rótulo de set/partido ya en pantalla cuando la cámara entra en la órbita del cierre: al hueco de arriba (CAM-09)
    var clPh = d && d.clinch ? d.clinch.phase || '' : '';
    if (clPh === 'hero' && cam.clPh !== 'hero' && banT > 0 && (banKind === 'set' || banKind === 'match')) placeT3(g, d);
    cam.clPh = clPh;
    // cambio de campo: al pasar la cámara a la grúa; el banner del set se va en ese momento
    if (pendCourt && shot === 'court') {
      var c = pendCourt; pendCourt = null; pres = null;
      banner('Cambio de campo', c.t2, '', 'neutral fastin mid', c.dur, 'court'); courtNoCrane = false; placeT3(g, d);   // (esquiva el marcador entero y los botones)
      cam.courtRt = ctx.time;
    }
    if (!pendCourt && banKind === 'set' && banT > 0 && shot === 'court') fadeBanner(0.12);
    var u = d && typeof d.ccU === 'number' ? d.ccU : -1;
    if (banKind === 'court' && banT > 0 && (u >= 0.8 || (shot !== 'court' && !courtNoCrane))) fadeBanner(0.2);   // (sin grúa —playa—: dura lo suyo)
    // «Set N» en la bajada: cuando ya no queda «Cambio de campo» y la grúa va por el último tramo (o ya ha bajado)
    if (courtNext && !pendCourt && banKind !== 'court' && (u >= 0.8 || (shot !== 'court' && ctx.time - cam.courtRt > 0.5))) {
      var cn2 = courtNext; courtNext = null; newSetShown = cn2.n;
      banner('Set ' + cn2.n, cn2.sub, '', 'neutral', 2.1, 'newSet');
    }
    // sin cámara (o sin plano 'court') el cambio de campo sale tras el banner del set, como antes
    if (pendCourt && shot !== 'court' && ctx.time - pendCourt.rt > 2.4 && banT <= 0.3) {
      var c2 = pendCourt; pendCourt = null; banner('Cambio de campo', c2.t2, '', 'neutral fastin mid', 1.2, 'court'); courtNoCrane = true; placeT3(g, d);
    }
  }

  // =====================================================================
  //  HUD
  // =====================================================================
  var _bv = null, tbRect = null, coachRect = null, guideRect = null;
  var promptCur = '', promptCls = '', promptHold = 0, promptWho = null, serveT0 = 0, tbLabel1 = 'RECEPCIÓN', coachSeen = {};

  // ---- Primeros toques guiados (primer partido, o &guide=1) ----
  // La primera recepción, la primera colocación y el primer remate del jugador nuevo llegan a cámara lenta
  // con una tarjeta grande que dice exactamente qué pulsar. Una sola vez por tipo.
  // SOLO EN FÁCIL O EN LOS PRIMEROS PARTIDOS (11-nov-2026, pedido de Ferran: «hace el juego demasiado fácil»). El récord
  // (make-the-cut.record) no cuenta el 6v6 ni la Carrera (showEnd), así que quien solo juega esos modos era «novato» para siempre
  // y veía la cámara lenta en TODOS los partidos, también en Normal. Ahora el novato sigue siendo el que no tiene partidos en
  // el récord, pero a partir de Normal la guía dura como mucho GUIDE_MAX partidos (contador local make-the-cut.guided: partidos en
  // los que ha salido alguna tarjeta; solo en este dispositivo, no se sincroniza). En Fácil, como antes. La cámara lenta pasa
  // por CameraRig.slowmo(…, 'novice'), que a partir de Normal solo la deja entrar con esa certificación (camera.js aidOk).
  var guideT = 0, guideDone = {}, GUIDE_MAX = 3, guidedN = -1;
  function guidedLoad() { if (guidedN < 0) { guidedN = 0; try { guidedN = Math.max(0, +localStorage.getItem('make-the-cut.guided') | 0); } catch (e) { } } return guidedN; }
  function guidedBump() { guidedLoad(); guidedN++; try { localStorage.setItem('make-the-cut.guided', String(guidedN)); } catch (e) { } }
  function guideOn(g) {
    if (g.drill) return false;                                 // E6: los ejercicios ya dicen qué hacer (tarjeta y consejo del fallo)
    if (g.demo || (g.autopilot && ctx.params.guide !== '1') || ctx.settings.showHelp === false) return false;
    if (ctx.params.guide === '1') return true;                 // (pruebas y capturas: siempre)
    if (ctx.debug || record.played !== 0) return false;        // novato = sin partidos en el récord
    return g.difficulty === 'easy' || guidedLoad() < GUIDE_MAX; // Fácil: siempre; Normal o más: solo los primeros partidos
  }
  function guideCheck(g, p, w, nt, gl) {
    if (guideT > 0 || nt === 0 || banT > 0 || bugT > 0) return; // UI-02: la tarjeta espera a que no haya banner
    var t = w ? (nt === 3 && w.attack ? w.jumpT : w.t) : (g.pr1 ? g.pr1.t : 9);
    var key = nt === 1 ? 'r' : nt === 2 ? 's' : 'a';
    if (guideDone[key] || !(t > 0.05 && t < 0.85)) return;
    if (nt === 3 && !(w && w.attack)) return;
    if (!guideDone.r && !guideDone.s && !guideDone.a && ctx.params.guide !== '1') guidedBump();   // primera tarjeta del partido: cuenta
    guideDone[key] = 1;
    // en mayúsculas, sin abreviaturas ordinales ("1.ER" queda mal)
    // (UI-18: el nombre del toque ya lo dice el contador de toques, justo encima: aquí solo el ordinal)
    var k = nt === 1 ? 'Primer toque' : nt === 2 ? 'Segundo toque' : 'Tercer toque';
    var shortT = device() === 'touch' && ctx.height <= 420; // móvil apaisado: tarjeta de una línea
    // (2º toque, C2: con teclado o mando también COLOCAR, y el destino del suelo; en táctil COLOCAR solo sale en el aire)
    var set2 = device() === 'touch' ? gl.hit : gl.hit + ' o ' + gl.jset, dest2 = g.mastery && g.aimSet !== false && g.size !== 6 ? ': colocas ' + setName(g) : '';
    var txt = shortT ? (nt === 1 ? 'Al círculo y ' + gl.hit : nt === 2 ? 'Bajo el balón y ' + gl.hit : gl.jump + ' y ' + gl.hit + ' arriba')
      : nt === 1 ? 'Ve al círculo y pulsa ' + gl.hit : nt === 2 ? 'Ponte bajo el balón y pulsa ' + set2 + dest2 : gl.jump + ' para saltar y ' + gl.hit + ' arriba';
    el.guideK.textContent = k.toUpperCase(); el.guideT.innerHTML = txt;
    el.guide.className = ''; void el.guide.offsetWidth; el.guide.className = 'show';
    guideT = 2.4;
    try { if (VB.CameraRig && VB.CameraRig.slowmo) VB.CameraRig.slowmo(0.4, 1.3, 0.35, 'novice'); } catch (e) { }   // (ayuda antes del golpe: camera.js aidOk)
  }
  function guideHide() { guideT = 0.3; el.guide.className = 'out'; }
  // sin cierres por frame: llamadas a la sim protegidas
  function hw(g, p) { try { return VB.Sim.hitWindow(g, p); } catch (e) { return null; } }
  // ventana del aviso "¡Golpea!" = la del brillo de GOLPEAR/SACAR (input.js CUE_OFF/CUE_ON); si cambia allí, cambiar aquí
  var HINT_ON = 0.24, HINT_OFF = -0.15;
  // barra del saque lanzado: la muesca fija marca el instante ideal de pulsar (fracción de la barra; index.html .pr-bar u)
  var NOTCH = 0.78;
  function cr(g, p) { try { return VB.Sim.canReach(g, p); } catch (e) { return false; } }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  /** Franja alta (contador de toques, consejo): centrada, salvo que pise el marcador (HUD grande en un teléfono estrecho):
   *  entonces se corre a la derecha (variable --fx) hasta quedar a 10 px del marcador, sin pasar de los botones de la
   *  derecha. Devuelve true si ha cambiado (el rectángulo medido queda viejo). */
  var fitSh = [0, 0], sbRc = null, sbRcF = -99;
  function fitX(node, r, i) {
    if (!r || !r.width) return false;
    // (en un ejercicio el cuerpo del marcador está oculto: manda la pastilla del ejercicio, #drillBar)
    if (!sbRc || ctx.frame - sbRcF > 31) { sbRcF = ctx.frame; var ref = el.app.classList.contains('drill-on') ? document.getElementById('drillBar') : el.sbBody; sbRc = ref ? ref.getBoundingClientRect() : null; }
    if (!sbRc || !sbRc.width) return false;
    var cur = fitSh[i], base = r.left - cur, want = Math.max(0, Math.round(sbRc.right + 10 - base));
    var maxR = ctx.width - (ctx.isTouch ? 62 : 120);
    if (want > 0 && base + want + r.width > maxR) want = Math.max(0, Math.round(maxR - r.width - base));
    if (r.top > sbRc.bottom) want = 0;                         // por debajo del marcador (consejo en escritorio estrecho): no hace falta
    if (Math.abs(want - cur) < 2) return false;
    fitSh[i] = want; node.style.setProperty('--fx', want + 'px');
    return true;
  }

  /** Etiqueta del 1r toque deducida del estado: RECEPCIÓN si el único contacto rival de la jugada fue el saque, si no DEFENSA. */
  function label1Of(g) {
    if (!g || g.mode !== 'rally') return 'RECEPCIÓN';
    if (g.touchTeam !== 0) return g.lastKind === 'serve' ? 'RECEPCIÓN' : 'DEFENSA';
    if (g.lastKind === 'serve') return 'RECEPCIÓN';
    // rally.hits no cuenta el saque: si todos los contactos de la jugada son nuestros y sacó la CPU, es la recepción
    var hits = g.rally ? g.rally.hits | 0 : 0, t = g.touches | 0;
    return (g.serving === 1 && hits <= t) ? 'RECEPCIÓN' : 'DEFENSA';
  }

  /** Siguiente toque del equipo humano (1..3) o 0 si no le toca. */
  function nextTouch(g) {
    if (g.mode !== 'rally' || g.ball.held) return 0;
    if (g.touchTeam === 0 && g.lastKind !== 'serve') return g.touches < 3 ? g.touches + 1 : 0;
    if (g.touchTeam !== 0 && g.pr1 && g.pr1.x > 0 && g.ball.vx > -0.5) return 1;
    if (g.touchTeam === 1 && g.ball.x > 0) return 1;
    return 0;
  }

  /** 6v6: un compañero por su puesto (los dorsales no se leen con la cámara de televisión): «el colocador», «el otro receptor»… */
  //  («el otro receptor» / «el otro central» cuando es el puesto del humano, g.ctrlBase; lote A: ya no se lleva solo al receptor)
  var MATE6 = { S: 'el colocador', OPP: 'el opuesto', MB: 'el central', L: 'el líbero', OH: 'el receptor' };
  function mate6(q) {
    if (!q || !MATE6[q.role]) return 'tu compañero';
    var g = ctx && ctx.game, b = g && (g.ctrlBase || g.ctrl);
    return b && q !== b && q.role === b.role ? MATE6[q.role].replace('el ', 'el otro ') : MATE6[q.role];
  }
  /** Nombre del puesto de un jugador en minúscula («colocador», «líbero»). */
  function mateRole(q) { return (q && ROLE_NAME[q.role] || 'receptor').toLowerCase(); }
  /** C2 (colocar por destino): nombre del destino de la colocación del humano en 2v2, con lo que de verdad sale (VB.Sim.setPreview:
   *  el tempo, que va por la distancia, y el sitio; revisión C2: antes era fijo por sector y a veces decía «tensa» de una rápida).
   *  Tempo (rápida / tensa / alta) + sitio: delante (junto a la red y a < 0,7 m de su lateral), a la 4 / a la 2 (a más de 1,8 m del centro), al centro,
   *  o atrás (a 2 m o más de la red; por la 4 / por la 2 a los lados). Lo mismo que el color del marcador del suelo. */
  var SET_TEMPO = { quick: 'rápida', lane: 'tensa', high: 'alta' }, _spv = {};
  function setName(g) {
    var S = VB.Sim, v = null; try { v = S && S.setPreview ? S.setPreview(g, _spv) : null; } catch (e) { v = null; }
    if (!v) return g.setDirA !== g.setDirA ? 'alta a la 4' : 'con dirección';
    var cs = g.cs || 1, sd = S.side ? S.side(0) : 1, D = Math.abs(v.x) / cs, L = sd * v.y / cs, p = g.ctrl;
    var near = p && D < 1.3 && Math.abs(L - sd * p.y / cs) < 0.7, tw = SET_TEMPO[v.tempo] || 'alta';
    var where = D >= 2.0 ? (L < -1.5 ? 'atrás por la 4' : L > 1.5 ? 'atrás por la 2' : 'atrás') : near ? 'delante' : L < -1.8 ? 'a la 4' : L > 1.8 ? 'a la 2' : 'al centro';
    return tw + ' ' + where;
  }
  /** Consejo del 2º toque con colocar por destino (2v2): con la ventana abierta, el destino que se ve en el suelo (una frase, guía de estilo). */
  function setCoach(g, gl) {
    var S = VB.Sim, on = S && S.setWin && S.setWin(g);
    if (on && g.ctrl && g.ctrl.z > 0.05) return '2º toque · En el aire, ' + gl.jset + ' <b>coloca en salto</b>';
    var dbl = g.beach ? ' a tiempo (a destiempo, <b>dobles</b>)' : '';   // (playa: dobles por timing, 12-nov)
    return on ? '2º toque · Colocas <b>' + setName(g) + '</b> con ' + gl.hit + ' o ' + gl.jset + dbl + (!dbl && g.setDirA !== g.setDirA ? ', o elige otro destino con ' + gl.aim : '')
      : '2º toque · <b>Colocación</b> bajo el balón con ' + gl.hit + ' o ' + gl.jset + dbl + '; sin dirección, alta a la 4';
  }
  /** Carriles del colocador humano (C2, colocar por destino: la dirección en la ventana elige a quién; sin dirección, alta a la 4). */
  // (revisión C2: la corta, por debajo de 1000 px, dice lo mismo que la larga, agrupado: ← y sin dirección = 4 alta, ↖ = 4 tensa)
  var LANES6L = sepHTML(['sin dirección o ←, 4 alta', '↖ 4 tensa', '↑ rápida', '↗ 2 tensa', '→ 2 alta', '↙ ↓ ↘ pipe'], 'v'), LANES6S = sepHTML(['←↖ 4', '↑ rápida', '↗→ 2', '↓ pipe'], 'v');
  /** C2: 6v6, lo que tiene elegido ahora el colocador humano (VB.Sim.setPreview: atacante y tempo), «rápida al central», «pipe por
   *  la 5»… o '' sin ventana. */
  var ROLE6_TO = { OH: 'al receptor', OPP: 'al opuesto', MB: 'al central' };
  function setName6(g) {
    var S = VB.Sim, v = null; try { v = S && S.setPreview ? S.setPreview(g, _spv) : null; } catch (e) { v = null; }
    if (!v || !v.to) return '';
    var q = v.to;
    if (!q.front) { var d8 = VB.AI6 && VB.AI6.dirOf8 ? VB.AI6.dirOf8(g, g.ctrl) : null, z = d8 && d8.lane === 'back' && d8.pref ? d8.pref : q.zone; return 'pipe por la ' + z; }
    if (q.role === 'MB') return 'rápida al central';
    return (SET_TEMPO[v.tempo] || 'alta') + ' ' + (q.role === 'OH' ? 'a la 4' : ROLE6_TO[q.role] || 'a tu compañero');
  }
  function lanes6() { return (window.innerWidth || 1280) < 1000 ? LANES6S : LANES6L; }   // (en 844×390 la larga no cabe)
  /** 6v6, consejo cuando el siguiente toque es de un compañero IA (nt: 1 recepción/defensa, 2 colocación, 3 ataque), por el puesto
   *  del humano y la fase de su sitio (ai6 spot().phase, D7; la marca del suelo —fx— le dice adónde ir, el texto solo qué hacer). */
  function coach6(g, p, nt, gl, touchDev) {
    var q = g.jobs[0], ph = phase6(g, p), r = p.role, ask = touchDev ? '' : ' o pídela con ' + gl.sw;
    // «Juega el líbero: …» (1r toque de un compañero) / «Coloca tu colocador: …» (2º toque: va a colocar)
    var lead = (nt === 2 ? (q.role === 'S' ? 'Coloca tu colocador' : 'Coloca ' + mate6(q)) : 'Juega ' + mate6(q)) + ': ';
    if (r === 'L') return nt === 3 ? 'Ataca ' + mate6(q) + ': <b>cubre</b> desde atrás' : 'Llevas al líbero: <b>recibe</b> y defiende';   // D2: el líbero entró por tu central
    if (nt === 3) return 'Ataca ' + mate6(q) + ': <b>cubre</b> el ataque';
    if (r === 'S') {   // el 2º toque es tuyo (nt 2 con un compañero: colocación de emergencia tras un pase horrible)
      if (nt === 2) return 'Coloca ' + mate6(q) + ' de emergencia: <b>cubre</b> el ataque';
      return touchDev ? 'Coloca tú: al punto de colocación' : 'Coloca tú: ve al punto de colocación · ' + lanes6();   // (las flechas o el stick, al golpear)
    }
    // zaguero: pipe solo si puede pedirlo (ai6 canPipe: receptor u opuesto; el central que acaba de sacar, sin líbero aún, defiende)
    if (!p.front) return VB.AI6 && VB.AI6.canPipe && VB.AI6.canPipe(p) ? lead + '<b>pipe</b>' + (touchDev ? ' desde atrás' : ', pídela desde atrás con ' + gl.sw) : lead + '<b>defiende</b> en la marca';   // D5
    if (r === 'MB') return ph === 'block' ? '<b>Bloquea</b>: salta en la marca y ' + gl.hit + ' al remate' : nt === 2 ? lead + '<b>primer tiempo</b>' + (touchDev ? ', salta ya' : ', pide y salta ya con ' + gl.sw) : lead + 'a la marca, a punto para el <b>primer tiempo</b>';
    if (nt === 2) return lead + (r === 'OPP' ? '<b>ataca</b> por la derecha' : 'prepárate para atacar') + ask;
    return lead + 'a la marca' + (ph === 'attack' ? ', batida por la ' + (r === 'OPP' ? 'derecha' : 'izquierda') : '');   // (fx posMark: tu sitio sin balón; el personaje ya no va solo)
  }
  /** Nombres de los equipos en la presentación, la pausa y la hoja final: TÚ / CPU, o los clubes en un partido de Carrera
   *  (g.career de main.js: me/rival = abreviaturas, meName/rivalName = nombres). Solo reescribe al cambiar. */
  function teamNames(cr) {
    // (6v6 con humano, sprint 3: la tarjeta de presentación dice a quién llevas y «Equipo rival» en vez de la pareja)
    var g6 = ctx && ctx.game && !ctx.game.demo && ctx.game.size === 6 && !cr ? ctx.game : null;
    var p6 = g6 && (g6.ctrlBase || g6.ctrl), r6 = g6 ? (ROLE_NAME[g6.ctrlRole] || 'Receptor').toLowerCase() : '';   // (tu atleta de verdad, aunque ahora lleves al líbero)
    var a = (cr && cr.me) || 'TÚ', b = (cr && cr.rival) || 'CPU', key = a + '|' + b + '|' + (cr ? cr.rivalName : '') + '|' + (p6 ? p6.num + r6 : '');
    if (last.tnames === key) return; last.tnames = key;
    var q = function (sel) { return document.querySelector(sel); };
    var txt = function (node, first, v) { // primer/último nodo de texto del elemento (el resto son <b>/<i> con cifras)
      if (!node) return; var ns = node.childNodes;
      for (var i = first ? 0 : ns.length - 1; first ? i < ns.length : i >= 0; i += first ? 1 : -1) if (ns[i].nodeType === 3 && ns[i].nodeValue.trim()) { ns[i].nodeValue = v; return; }
    };
    // (la tarjeta de presentación, .in-t, la rellena introStart con el plan de la previa: B5)
    txt(q('.p-team.t0'), true, a + ' '); txt(q('.p-team.t1'), false, ' ' + b);
    txt(q('.es-t.t0'), true, a + ' '); txt(q('.es-t.t1'), false, ' ' + b);
  }
  // ---------- Nota en directo de la Carrera (notes/nota-en-directo-spec.md §6.3) ----------
  // Píldora «NOTA 6,8» bajo el marcador (dentro de #sb: escala y se aparta con él) y un aviso por punto pegado a ella: «+0,3 Ace»,
  // «−0,2 Error de saque» o, si la cifra redondea a 0,0, «▲ Remate ganado». La nota la lleva VB.Career.liveRating(g) (js/rating.js,
  // puro): aquí solo se pinta. Sin rating.js, fuera de la Carrera, en la demo o en un ejercicio no se ve nada. En el banquillo o sin
  // 5 puntos en pista (NOTA_MIN_SUB), atenuada con «s. c.». Colores por franja (rt-bad … rt-top) y CSS en career-ui.js. Solo los avisos de set y
  // de partido van al lector de pantalla (#banner, polite); la píldora lleva su aria-label y no es live.
  var rtUI = { row: null, pill: null, v: null, sc: null, toast: null, sr: null, g: null, seen: 0, q: [], t: 0, key: '', vis: false, co: null, coTx: null, coSeq: -1, coSt: '', coT: 0 };
  /** El estado de la nota en directo de este partido ({ v, on, sc, seq, log, trial }) o null. g._rtDbg: escenas de depuración (&rt=1). */
  function rtSrc(g) {
    if (!g || g.demo || g.drill) return null;
    if (g._rtDbg) return g._rtDbg;
    if (!g.career) return null;
    var K = VB.Career; if (!K || typeof K.liveRating !== 'function') return null;
    try { return K.liveRating(g); } catch (e) { return null; }
  }
  function rtNum(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  /** «+0,3» / «−0,2» (signo menos de verdad) / '' con 0,0: el de rating.js si está. */
  function rtFmt(d) {
    var R = VB.Rating; if (R && typeof R.fmt === 'function') { try { return R.fmt(d); } catch (e) { } }
    var r = Math.round(d * 10) / 10; return r ? (r > 0 ? '+' : '−') + rtNum(Math.abs(r)) : '';
  }
  /** Franja de color de la nota (§6.4): < 5 mala, 5-5,9 floja, 6-6,9 normal, 7-7,9 buena, ≥ 8 muy buena. */
  function rtBand(v) { v = Math.round(v * 10) / 10; return v < 5 ? 'rt-bad' : v < 6 ? 'rt-low' : v < 7 ? 'rt-mid' : v < 8 ? 'rt-good' : 'rt-top'; }
  /** ¿Resta? Con la cifra redondeada a 0,0, por el peso de la acción (o por el texto en set y partido). */
  function rtNeg(e) {
    if (e.d) return e.d < 0;
    var A = VB.Rating && VB.Rating.ACTS, a = A && A[e.id];
    if (a && typeof a.w === 'number') return a.w < 0;
    return /perdido|Derrota|fallid|bloquean|Error/i.test(e.txt || '');
  }
  function rtLabel(e) { var f = rtFmt(e.d || 0); return f ? f + ' ' + (e.txt || '') : (rtNeg(e) ? '▼ ' : '▲ ') + (e.txt || ''); }
  function rtBuild() {
    if (rtUI.row) return true;
    if (!el.sb) return false;
    var r = document.createElement('div'); r.className = 'rt-row'; r.id = 'rtRow'; r.hidden = true;
    r.innerHTML = '<div id="rtLive" class="rt-mid" role="img" aria-label="Nota 6,0"><span class="rt-k" aria-hidden="true">NOTA</span><b aria-hidden="true">6,0</b>' +
      '<small aria-hidden="true" hidden>s. c.</small></div><div class="rt-toast" aria-hidden="true"></div>';
    // (justo bajo el marcador: antes de la etiqueta «Punto de set», del contador de la jugada y del aviso corto)
    var nx = el.sb.querySelector('.sb-tag'); el.sb.insertBefore(r, nx || null);
    rtUI.row = r; rtUI.pill = r.firstChild; rtUI.v = rtUI.pill.querySelector('b'); rtUI.sc = rtUI.pill.querySelector('small'); rtUI.toast = r.lastChild;
    // consigna del entrenador del punto (js/consignas.js): una línea bajo la nota, «ENTRENADOR Saca a la zona 1»; ✓ / ✗ al resolverse
    var co = document.createElement('div'); co.className = 'co-call'; co.id = 'coCall'; co.hidden = true; co.setAttribute('role', 'status');
    co.innerHTML = '<span class="co-k">ENTRENADOR</span><span class="co-tx"></span>';
    el.sb.insertBefore(co, r.nextSibling);
    rtUI.co = co; rtUI.coTx = co.lastChild;
    if (el.banner) { var s = document.createElement('span'); s.className = 'sr'; el.banner.appendChild(s); rtUI.sr = s; }
    return true;
  }
  function rtToastOff() { if (rtUI.toast) { rtUI.toast.className = 'rt-toast'; rtUI.toast.textContent = ''; } rtUI.t = 0; }
  function coOff() { if (rtUI.co) { rtUI.co.hidden = true; rtUI.co.className = 'co-call'; } rtUI.coSt = ''; rtUI.coT = 0; }
  /** Consigna del entrenador: a la vista mientras está en juego; cumplida (verde, ✓) o fallada (rojo, ✗) un momento; caducada, fuera. */
  function coTick(c, dt) {
    if (!rtUI.co) return;
    if (!c) { if (rtUI.coSt && rtUI.coSt !== 'ok' && rtUI.coSt !== 'miss') coOff(); else if (rtUI.coT > 0) { rtUI.coT -= dt || 0; if (rtUI.coT <= 0) coOff(); } return; }
    var stt = c.state;
    if (c.seq !== rtUI.coSeq || stt !== rtUI.coSt) {
      var fresh = c.seq !== rtUI.coSeq;
      rtUI.coSeq = c.seq; rtUI.coSt = stt;
      if (stt === 'gone') { coOff(); rtUI.coSt = 'gone'; return; }
      rtUI.coTx.textContent = (stt === 'ok' ? '✓ ' : stt === 'miss' ? '✗ ' : '') + c.txt;
      rtUI.co.hidden = false;
      rtUI.co.className = 'co-call' + (stt === 'ok' ? ' ok' : stt === 'miss' ? ' miss' : '') + (fresh && !rm() ? ' in' : '');
      rtUI.coT = stt === 'ok' ? 2.2 : stt === 'miss' ? 1.6 : 0;
      if (fresh && rtUI.sr) rtUI.sr.textContent = 'Entrenador: ' + c.txt + '.';
      return;
    }
    if (rtUI.coT > 0 && dt > 0) { rtUI.coT -= dt; if (rtUI.coT <= 0) { rtUI.co.hidden = true; rtUI.co.className = 'co-call'; } }
  }
  function rtTick(g, dt) {
    var src = rtSrc(g);
    if (!src) { if (rtUI.vis) { rtUI.vis = false; rtUI.row.hidden = true; rtToastOff(); coOff(); } rtUI.g = null; return; }
    if (!rtBuild()) return;
    if (!rtUI.vis) { rtUI.vis = true; rtUI.row.hidden = false; }
    coTick(src.coach, dt);
    // partido nuevo (también al reiniciar uno de Carrera: la nota vuelve a 6,0) o la cuenta hacia atrás: sin avisos viejos
    var seq = src.seq | 0;
    if (rtUI.g !== g || seq < rtUI.seen) { rtUI.g = g; rtUI.seen = 0; rtUI.q.length = 0; rtToastOff(); }
    var v = +src.v || 0, dim = !src.on || !!src.sc, key = rtNum(v) + (dim ? '|d' : '') + (src.sc ? '|s' : '');
    if (rtUI.key !== key) {   // (se reescribe solo si cambia; sin animación: la cifra salta)
      rtUI.key = key; rtUI.v.textContent = rtNum(v);
      rtUI.pill.className = rtBand(v) + (dim ? ' dim' : '');
      rtUI.sc.hidden = !src.sc;   // (en el banquillo con nota ya ganada, solo atenuada: «s. c.» es para quien aún no la tiene)
      rtUI.pill.setAttribute('aria-label', 'Nota ' + rtNum(v) + (rtUI.sc.hidden ? '' : ', sin calificar'));
    }
    if (seq > rtUI.seen) {
      var log = src.log || [];
      for (var i = 0; i < log.length; i++) {
        var e = log[i]; if (!e || !(e.seq > rtUI.seen)) continue;
        rtUI.q.push(e);
        if ((e.kind === 'set' || e.kind === 'match') && rtUI.sr) rtUI.sr.textContent = 'Nota ' + rtNum(e.v != null ? e.v : v) + ': ' + rtLabel(e) + '.';
      }
      rtUI.seen = seq;
      while (rtUI.q.length > 2) rtUI.q.shift();   // (cola de 2 como mucho: lo último manda)
    }
    // un aviso a la vez: 1,6 s (1 s con más en cola). Ni en la presentación ni con el juego parado (dt = 0: pausa, congelado);
    // en las escenas de depuración congeladas, el aviso se queda a la vista para la captura
    if (ctx.introLeft > 0) return;
    if (rtUI.t > 0) { rtUI.t -= dt || 0; if (rtUI.t <= 0) rtToastOff(); else return; }
    if (rtUI.q.length && (dt > 0 || ctx.debug)) {
      var n = rtUI.q.shift(), tt = rtUI.toast;
      tt.className = 'rt-toast'; void tt.offsetWidth;   // (dos avisos seguidos: que la entrada vuelva a empezar)
      tt.textContent = rtLabel(n);
      tt.className = 'rt-toast on ' + (rtNeg(n) ? 'neg' : 'pos') + (n.kind && n.kind !== 'play' ? ' big' : '') + (rm() ? ' still' : '');
      rtUI.t = rtUI.q.length ? 1.0 : 1.6;
    }
  }
  function hud(g, dt) {
    var demo = g.demo;
    chalTick(g);
    var drOn = !!(g.drill && !demo); e1.on = false;
    if (last.drOn !== drOn) { last.drOn = drOn; el.app.classList.toggle('drill-on', drOn); }
    var wOn = !!(g.watch && !demo);   // espectador táctil: sin mandos táctiles, la pausa del HUD es la salida (index.html .watch-on)
    if (last.wOn !== wOn) { last.wOn = wOn; el.app.classList.toggle('watch-on', wOn); }
    if (drOn) drillHud(g);
    rtTick(g, dt);   // nota en directo de la Carrera (píldora y avisos bajo el marcador)
    // (partido a un solo set —partidillo de prueba de la Carrera—: «SET ÚNICO | A 15»)
    setHTML(el.sbSet, 'set', demo ? 'DEMO' : oneSet(g) ? sepHTML(['SET ÚNICO', 'A ' + g.points], 's') : sepHTML(['SET ' + g.setNo, g.setNo === 3 ? 'A 15' : ''], 's'));
    // partido de Carrera (g.career, main.js): abreviaturas de los dos clubes en vez de TÚ / CPU
    var cr = !demo && (g.career || (g.watch0 && WATCH_CR) || g.netCr);   // (online, fase 3: TÚ / las 3 primeras letras del nombre del rival)
    setText(el.name0, 'n0', demo ? 'ROJO' : (cr && cr.me) || 'TÚ'); setText(el.name1, 'n1', demo ? 'AZUL' : (cr && cr.rival) || 'CPU');
    if (!demo) teamNames(cr);
    setText(el.pts0, 'p0', g.score[0]); setText(el.pts1, 'p1', g.score[1]);
    var sk = g.sets[0] * 8 + g.sets[1];
    if (last.sets !== sk) {
      last.sets = sk;
      for (var i = 0; i < 2; i++) { el.pips0[i].classList.toggle('on', i < g.sets[0]); el.pips1[i].classList.toggle('on', i < g.sets[1]); }
      // un solo set: un piloto por equipo (con dos, un 1-0 se leía como «1 de 2», al mejor de 3)
      el.pips0[1].style.display = el.pips1[1].style.display = oneSet(g) ? 'none' : '';
      if (el.sn0) { el.sn0.textContent = g.sets[0]; el.sn1.textContent = g.sets[1]; }
    }
    var hk = (g.setScores || []).length;
    if (last.hist !== hk) {
      last.hist = hk; el.hist.hidden = !hk;
      el.hist.innerHTML = sepHTML((g.setScores || []).map(function (s, j) { return 'S' + (j + 1) + ' <b>' + s[0] + '-' + s[1] + '</b>'; }), 'v', true);
    }
    var srv = g.serving;
    if (last.srv !== srv) { last.srv = srv; el.row0.classList.toggle('serving', srv === 0); el.row1.classList.toggle('serving', srv === 1); }
    var tag = '', tagT = -1;
    if (g.mode === 'serve' || g.mode === 'rally') {
      if (g.matchPoint >= 0) { tag = 'PUNTO DE PARTIDO'; tagT = g.matchPoint; }
      else if (g.setPoint >= 0) { tag = 'PUNTO DE SET'; tagT = g.setPoint; }
    }
    if (tag && tagT === 1) tag += ' · CPU';
    // (UI-18) mientras la cinta «Punto de set/partido» lo anuncia, la etiqueta no lo repite debajo del marcador
    if (tag && banKind === 'sp' && banT > 0) tag = '';
    if (last.tag !== tag) { last.tag = tag; el.tag.hidden = !tag; if (tag.indexOf(' · ') >= 0) setSep(el.tag, tag, 'v'); else el.tag.textContent = tag; el.tag.classList.toggle('cpu', tagT === 1); }

    var playing = ctx.state === 'playing' && !demo;
    rallyTick(g, dt, playing);
    offTick(g, playing);
    // ---- contador de toques ----
    var nt = playing ? nextTouch(g) : 0;
    if (nt === 1 && g.touchTeam !== 0) tbLabel1 = g.lastKind === 'serve' ? 'RECEPCIÓN' : 'DEFENSA';
    else if (nt === 1 && g.touchTeam === 0 && g.lastKind === 'block') tbLabel1 = 'DEFENSA'; // tras un bloqueo propio
    if (bodyTipT > 0) bodyTipT -= dt || 0;
    var tbk = nt + tbLabel1;
    if (last.tb !== tbk) {
      last.tb = tbk;
      el.touchbar.classList.toggle('off', nt === 0);
      if (nt) {
        el.tb1t.textContent = tbLabel1;
        for (var s = 0; s < 3; s++) {
          el.tb[s].classList.toggle('done', s + 1 < nt);
          el.tb[s].classList.toggle('next', s + 1 === nt);
        }
      }
    }
    // red de seguridad: si el balón proyectado cae dentro del contador de toques, se atenúa (la cámara ya lo evita)
    // Lo mismo con la pastilla del consejo (va justo debajo del contador y es opaca): con el balón detrás, se vuelve
    // translúcida (.thru). Se usa el consejo visible del frame anterior (last.coach).
    var tbDim = false, coachThru = false, coachThruP = false, guideThru = false;
    if ((nt || last.coach || guideT > 0) && ctx.camera && VB.toThree && ctx.THREE) {
      if (!_bv) _bv = new ctx.THREE.Vector3();
      VB.toThree(g.ball.x, g.ball.y, g.ball.z, _bv); _bv.project(ctx.camera);
      var bpx = (_bv.x + 1) * 0.5 * ctx.width, bpy = (1 - _bv.y) * 0.5 * ctx.height, bOn = _bv.z < 1;
      if (nt) {
        if (!tbRect || (ctx.frame & 31) === 0) { tbRect = el.touchbar.getBoundingClientRect(); if (fitX(el.touchbar, tbRect, 0)) tbRect = el.touchbar.getBoundingClientRect(); }
        tbDim = bOn && inRect(bpx, bpy, tbRect, 12);
      }
      if (last.coach) {
        if (!coachRect || (ctx.frame & 31) === 0) { coachRect = el.coach.getBoundingClientRect(); if (fitX(el.coach, coachRect, 1)) coachRect = el.coach.getBoundingClientRect(); }
        coachThru = bOn && inRect(bpx, bpy, coachRect, 12);
        // también si tapa a un jugador (en táctil, a 844×390, tapaba al rematador y al bloqueador de la CPU junto a la red):
        // se prueban el pecho y la cabeza de los 4 (8 proyecciones, solo con consejo visible). Clase propia (.thrup): el
        // consejo sigue legible (es justo lo que hay que hacer), solo pierde el fondo opaco
        // diana del saque dirigible (g.aim3.kind 'serve'): en 844×390 el consejo «Tu saque…» caía justo encima (revisión de fx)
        if (!coachThru && g.aim3 && g.aim3.on && g.aim3.kind === 'serve') {
          VB.toThree(g.aim3.x, g.aim3.y, 0, _bv); _bv.project(ctx.camera);
          coachThruP = _bv.z < 1 && inRect((_bv.x + 1) * 0.5 * ctx.width, (1 - _bv.y) * 0.5 * ctx.height, coachRect, 40);
        }
        if (!coachThru && !coachThruP && g.teams) {
          for (var ct = 0; ct < 2 && !coachThruP; ct++) for (var ci = 0; ci < g.teams[ct].length && !coachThruP; ci++) {
            var cpl = g.teams[ct][ci];
            for (var ch = 1.0; ch < 2.2 && !coachThruP; ch += 0.9) {
              VB.toThree(cpl.x, cpl.y, (cpl.z || 0) + ch, _bv); _bv.project(ctx.camera);
              coachThruP = _bv.z < 1 && inRect((_bv.x + 1) * 0.5 * ctx.width, (1 - _bv.y) * 0.5 * ctx.height, coachRect, 6);
            }
          }
        }
      }
      if (guideT > 0) { // tarjeta guiada: también se aparta si el balón pasa por detrás (CSS solo la atenúa en móvil apaisado)
        if (!guideRect || (ctx.frame & 15) === 0) guideRect = el.guide.getBoundingClientRect();
        guideThru = bOn && inRect(bpx, bpy, guideRect, 12);
      } else guideRect = null;
    }
    // diana del saque dirigible detrás del marcador (esquina del fondo rival en 844×390): el marcador se vuelve translúcido
    var sbAim = false;
    if (svAim(g) && ctx.state === 'playing' && ctx.camera && VB.toThree && ctx.THREE && el.sb) {
      if (!_bv) _bv = new ctx.THREE.Vector3();
      if (!sbRect || (ctx.frame & 31) === 0) sbRect = el.sb.getBoundingClientRect();
      VB.toThree(g.aim3.x, g.aim3.y, 0, _bv); _bv.project(ctx.camera);
      // margen = radio del aro en pantalla (fx: mínimo 24 px) + holgura: la cámara del saque se mueve durante el lanzamiento
      sbAim = _bv.z < 1 && inRect((_bv.x + 1) * 0.5 * ctx.width, (1 - _bv.y) * 0.5 * ctx.height, sbRect, 56);
    }
    if (last.sbAim !== sbAim) { last.sbAim = sbAim; el.sb.classList.toggle('aimthru', sbAim); }
    if (last.tbDim !== tbDim) { last.tbDim = tbDim; el.touchbar.classList.toggle('thru', tbDim); }
    if (el.guide.classList.contains('thru') !== guideThru) el.guide.classList.toggle('thru', guideThru);
    if (last.coachThru !== coachThru) { last.coachThru = coachThru; el.coach.classList.toggle('thru', coachThru); }
    if (last.coachThruP !== coachThruP) { last.coachThruP = coachThruP; el.coach.classList.toggle('thrup', coachThruP); }
    if (last.coachLt !== !!g.beach) { last.coachLt = !!g.beach; el.coach.classList.toggle('lt', !!g.beach); }   // (playa: cielo y arena claros, .thrup más opaco)
    // con la mira libre (3r toque en el aire) el consejo es la instrucción clave: translúcido, pero legible
    // (la diana del saque, kind 'serve', no: el consejo se aparta de ella con .thrup, ver arriba)
    var aimOn = !!(g.aim3 && g.aim3.on && g.aim3.kind !== 'serve');
    if (last.coachAim !== aimOn) { last.coachAim = aimOn; el.coach.classList.toggle('aimtip', aimOn); }
    // ---- aviso contextual + consejo ----
    var help = ctx.settings.showHelp !== false, gl = G(), touchDev = device() === 'touch';
    // consejos (franja de arriba): ajuste propio, Ajustes · Juego · Consejos (se apaga solo al ganar el 1r partido)
    var tips = ctx.settings.coachTips !== false || ctx.params.coach === '1';
    var pk = '', ptext = '', pcls = '', coach = '', progress = 0, clockF = -1;
    var p = g.ctrl, humanSide = playing && (!g.autopilot || ctx.debug) && !g.watch && !(ctx.introLeft > 0) && !introUI.quiet;
    if (humanSide && p) {
      var one = g.ctrlMode === 'one'; // modo «controlar 1 jugador»: sin cambio de jugador; el compañero IA saca y toca solo
      var sv = g.server || (g.ball.held || null), myServe = g.mode === 'serve' && sv && sv.team === 0 && (!one || sv === p);
      var tossed = g.serveState ? g.serveState === 'toss' : !g.ball.held;
      if (myServe && !tossed && g.serveAuth === false) {
        // antes del silbato del árbitro no se puede sacar (regla)
        pk = 'wait'; ptext = 'Espera el silbato';
        coach = touchDev ? 'Tu saque · Espera el silbato' : 'Tu saque · Espera el silbato; con ' + gl.move + ' te mueves por el fondo';
      } else if (myServe && !tossed) {
        // táctil: los dos saques van en el MISMO aviso junto al sacador, en dos líneas compactas («SACAR Flotante» /
        // «SALTAR En salto»; la tecla SACAR es la de siempre, #promptKey, y el resto se coloca en rejilla: ver .two en index.html); arriba, en un móvil apaisado, la pastilla del consejo tapaba la red y a los receptores de la CPU
        // («SALTAR En salto» sonaba repetido: el saque en salto se anuncia como «Potente»)
        pk = 'serve'; ptext = touchDev ? (help ? '<span>Flotante</span>' + gl.jump + '<span>Potente</span>' : 'Lanza el balón') : 'Lanzar';
        pcls = touchDev && help ? 'hit two' : 'hit';
        coach = touchDev ? ''
          : svAim(g) ? 'Tu saque · Muévete con ' + gl.move + '. ' + gl.serve + ' saca flotante y ' + gl.jump + ' en salto; al lanzar, apunta la <b>diana</b> con ' + gl.aim
          : g.serveState ? 'Tu saque · Muévete con ' + gl.move + '. ' + gl.serve + ' saca flotante y ' + gl.jump + ' en salto'
          : 'Tu saque · Con ' + gl.move + ' te colocas en el fondo, apunta con ' + gl.aim + ' (la <b>diana naranja</b> marca adónde va) y pulsa ' + gl.serve;
        // reloj de saque (UI-05): 8 s en el pabellón y 5 en la playa (sim g.serveClockMax). Aro alrededor de la tecla en los
        // últimos 5 s (3 en la playa; ámbar → rojo en los 2 últimos); la cifra y la unidad van en un span sin mayúsculas
        // («3 s», no «3 S»). El texto del árbitro «Falta de saque: 8 segundos» (o 5) es de sim.
        var cm = g.serveClockMax || 8, lim = cm > 5 ? 5 : 3;
        if (g.serveClock != null && g.serveAuth && g.serveClock < lim && g.serveClock > 0 && !(g.opts && g.opts.serveClock === false)) clockF = g.serveClock / lim;
        if (clockF >= 0 && g.serveClock < lim - 0.5 && g.serveT > 0.35) { ptext = 'Saca ya <span class="nu">' + Math.ceil(g.serveClock) + ' s</span>'; pcls = 'hit'; coach = 'Regla de los <b>' + cm + ' segundos</b>: saca antes de que acabe la cuenta'; }
      } else if (myServe) {
        // Balón lanzado. Mientras SUBE, hitWindow().t pasa por ~0 (cruza la altura de contacto de subida):
        // la tecla encendida y «¡Golpea ahora!» SOLO con el balón BAJANDO y dentro de la ventana del brillo de SACAR.
        // Antes de eso (UI-05): sin tecla, reloj de arena y «Espera… golpea al bajar», con una barra que se llena hacia una
        // muesca fija (el instante ideal). Antes salía la tecla con «Golpea al bajar» y quien reaccionaba a la tecla sacaba pronto.
        var ws = VB.Sim.hitWindow ? hw(g, p) : null, b = g.ball;
        var tl = serveTimeLeft(g, ws);
        // La MISMA ventana que el brillo del botón SACAR (input.js CUE_OFF/CUE_ON): ws.press (s hasta el instante ideal
        // de PULSAR) en (-0,15, 0,24).
        var wp = ws ? (ws.press === ws.press && ws.press != null ? ws.press : ws.t) : 9;
        var down = b.vz < 0 && ws && ws.reach;
        // s hasta el instante ideal de PULSAR: hitWindow().press ya cuenta hacia el contacto de BAJADA también mientras sube
        // (medido: 0,85 → 0 de forma continua), el mismo reloj que el aro de SACAR y el de la pista; de reserva, la caída
        var pe = ws && wp === wp && wp < 8 ? wp : (tl > 0 ? tl - ((VB.C && VB.C.WINDUP) || 0.07) : NaN);
        if (pe === pe) { if (!serveT0 || pe > serveT0) serveT0 = Math.max(0.3, pe); progress = pe > 0 ? NOTCH * (1 - pe / serveT0) : NOTCH + (1 - NOTCH) * Math.min(1, -pe / 0.25); }
        if (down && wp < HINT_ON && wp > HINT_OFF) { pk = 'serve'; ptext = device() === 'touch' ? '¡Golpea!' : '¡Golpea ahora!'; pcls = 'hit go bar'; }
        else if (tl > 0 && !(down && wp <= HINT_OFF)) { pk = 'serve'; ptext = 'Espera… golpea al bajar'; pcls = 'hit soon bar'; }
        // balón en el aire: sin consejo arriba (tapaba el balón y el marcador colgado justo al golpear);
        // basta el aviso "¡Golpea ahora!" junto al jugador. Con el saque dirigible, mientras el balón SUBE, una línea corta
        // para la diana (se quita al bajar, antes de golpear)
        coach = tips && svAim(g) && b.vz > 0 && !(down && wp < HINT_ON) ? (touchDev ? 'Apunta la diana con ' + gl.aim : '<b>Apunta la diana</b> con ' + gl.aim + ': en el momento justo el saque va exacto') : '';
      } else if (g.mode === 'serve') {
        coach = !tips ? '' : g.size === 6 && (g.serveNo <= 3 || p.role === 'L') ? (touchDev ? 'Llevas al <b>n.º ' + p.num + '</b>, el ' + mateRole(p) : 'Llevas al <b>n.º ' + p.num + '</b>, el ' + mateRole(p) + ': la IA mueve al resto') // 6v6: a quién llevas (primeros saques; y siempre al entrar el líbero por ti)
          : sv && sv.team === 0 ? (g.size === 6 ? 'Saca ' + mate6(sv) : 'Saca tu pareja') // modo uno: saca la IA de tu equipo (6v6: por su puesto)
          : (touchDev ? 'Saca la CPU · A recibir' : 'Saca la CPU · Prepárate para la <b>recepción</b>');
      } else if (g.mode === 'rally') {
        var w = VB.Sim && VB.Sim.hitWindow ? hw(g, p) : null;
        var wpr = w ? (w.press === w.press && w.press != null ? w.press : w.t) : 9;
        // misma ventana que el brillo de GOLPEAR (input.js): press en (-0,15, 0,24)
        var reach = w ? (w.reach && wpr < HINT_ON && wpr > HINT_OFF && nt > 0) : (VB.Sim && VB.Sim.canReach ? cr(g, p) : false);
        // en el aire junto a la red con el remate rival aún en su lado: es un bloqueo (automático), no un golpe
        // bloqueo activo: la misma decisión que la sim (VB.Sim.blockPressCase); un overpass o un saque que viene sigue siendo golpe
        var bpc = !!(VB.Sim && VB.Sim.blockPressCase && VB.Sim.blockPressCase(g, p));
        if (reach && bpc) reach = false;
        // aviso «Al remate: ¡muro!»: solo con un ataque rival pendiente (ya han colocado) o en vuelo
        var blkP = bpc && (g.touches >= 2 || g.lastKind === 'spike' || g.lastKind === 'free') && g.lastKind !== 'serve';
        // en el aire con colocación en salto posible (sim jsetReady): las dos opciones en el aviso, en rejilla 2×2 (.two):
        // tecla de GOLPEAR + «Rematar» / tecla de COLOCAR + «Colocar»; con la ventana abierta, encendido (go)
        // E1: VB.Sim.altReady → '' | 'jset' | 'roll' (en el 3r toque, COLOCAR hace el golpe colocado: «Rematar | Colocado»)
        var ar = p.z > 0.05 && VB.Sim ? (VB.Sim.altReady ? altR(g) : (VB.Sim.jsetReady && VB.Sim.jsetReady(g) ? 'jset' : '')) : '';
        var jr = !!ar;
        // (táctil: los glifos ya son los nombres de los botones; «COLOCAR Colocar» repetía la palabra → «en salto»)
        if (jr && help) { pk = 'hit'; ptext = '<span>' + (Math.abs(g.ball.x) < 3.8 && g.ball.z > 2.53 ? 'Rematar' : 'Golpear') + '</span>' + gl.jset + '<span>' + (ar === 'roll' ? (touchDev ? 'colocado' : 'Colocado') : touchDev ? 'en salto' : 'Colocar') + '</span>'; pcls = reach ? 'hit go two' : 'hit two'; }
        else if (reach && nt === 2 && p.z <= 0.05 && VB.Sim.setTurn && VB.Sim.setTurn(g)) { pk = 'hit'; ptext = touchDev ? '¡Coloca ahora!' : gl.jset + ' ¡Coloca ahora!'; pcls = 'hit go'; }   // (C2: COLOCAR en el suelo coloca; el glifo de GOLPEAR delante también vale)
        else if (reach) { pk = 'hit'; ptext = '¡Golpea ahora!'; pcls = 'hit go'; }
        else if (blkP && help) { pk = 'hit'; ptext = 'Al remate: ¡muro!'; pcls = 'hit'; }
        else if (p.z <= 0.01 && g.pr3) {
          var pr = g.pr3;
          if (w && w.attack && w.jumpT > -0.06 && w.jumpT < 0.32) { pk = 'jump'; ptext = '¡Salta!'; pcls = 'jump go'; }
          else if (!w && nt === 3 && g.jobs && g.jobs[0] === p && pr.x > 0 && pr.x < 3.9 && pr.t > 0.08 && pr.t < 0.62 && dist2(p, pr) < 2.9) { pk = 'jump'; ptext = '¡Salta!'; pcls = 'jump go'; }
          else if (g.touchTeam === 1 && g.touches === 2 && (g.defRole === 'block' || !g.defRole) && pr.x < 0 && pr.x > -3.9 && pr.t < 0.62 && p.x < 2.4 && Math.abs(p.y - pr.y) < 1.8) { pk = 'jump'; ptext = '¡Salta y bloquea!'; pcls = 'jump go'; }
        }
        if (tips && touchDev) { // táctil: una línea corta (el texto completo no cabe entre marcador y pausa)
          // (el contador de toques ya dice recepción/colocación/ataque)
          if (nt === 1) coach = 'Al círculo y ' + gl.hit;
          else if (nt === 2) coach = g.size === 6 && p.role === 'S' ? (setName6(g) ? 'Colocas <b>' + setName6(g) + '</b>; ' + gl.aim + ' elige' : 'Bajo el balón y ' + gl.hit + '; ' + gl.aim + ' elige a quién') : g.mastery && g.aimSet !== false ? (VB.Sim.setWin && VB.Sim.setWin(g) && p.z <= 0.05 ? 'Colocas <b>' + setName(g) + '</b> con ' + gl.hit : 'Bajo el balón y ' + gl.hit + '; sin dirección, alta a la 4') : nw('Bajo el balón y ' + gl.hit + ',') + ' ' + nw('o salta y ' + gl.jset);   // (en dos líneas, la pegatina nunca sola; 6v6 D3: el colocador humano elige el carril)
          else if (nt === 3) coach = aim3(g, p) ? 'Apunta con ' + gl.aim : gl.jump + ' y ' + gl.hit + ' arriba';
          else if (g.touchTeam === 1 && g.touches === 2) coach = g.defRole === 'block' ? (g.size === 6 ? '<b>Bloquea</b>: salta en la marca y ' + gl.hit + ' al remate' : '<b>Bloqueo</b>: ' + gl.jump + ' y ' + gl.hit + ' al remate')
            : g.size === 6 ? (p.role === 'L' ? '<b>Defiende</b>: llevas al líbero' : p.front ? '<b>Retírate</b> a la marca' : '<b>Defiende</b> en la marca')
            : '<b>Defiende</b> el círculo' + (one ? '' : ' (' + gl.sw + ' bloqueas tú)');
        } else if (tips) {
          if (nt === 1) coach = '1r toque · <b>' + (tbLabel1 === 'DEFENSA' ? 'Defensa' : 'Recepción') + '</b>: ve al círculo y pulsa ' + gl.hit;
          else if (nt === 2) coach = g.size === 6 && p.role === 'S' ? (setName6(g) ? '2º toque · Colocas <b>' + setName6(g) + '</b> con ' + gl.hit + ' o ' + gl.jset + ' · ' : '2º toque · <b>Coloca</b> con ' + gl.hit + ' o ' + gl.jset + '; la dirección elige: ') + lanes6()   // (6v6 D3: el carril lo manda el stick o las flechas; revisión C2: y dice el elegido)
            : g.mastery && g.aimSet !== false ? setCoach(g, gl)   // C2: el destino que se ve en el suelo (en la playa, con «a destiempo, dobles»)
            : g.beach ? '2º toque · <b>Colocación</b>: bajo el balón, ' + gl.hit + ' a tiempo (o salta y ' + gl.jset + '); a destiempo pitan <b>dobles</b>'   // (12-nov: dobles por timing en la playa)
            : '2º toque · <b>Colocación</b>: ponte debajo del balón y pulsa ' + gl.hit + '. Si saltas y pulsas ' + gl.jset + ', colocas en el aire';
          else if (nt === 3) coach = aim3(g, p) ? '3r toque · <b>Apunta con ' + gl.aim + '</b> y golpea con ' + gl.hit + ' en lo alto'
            : '3r toque · <b>Ataque</b>: ponte bajo el balón, salta con ' + gl.jump + ' y golpea con ' + gl.hit + ' arriba';
          else if (g.touchTeam === 1 && g.touches === 2) coach = g.defRole === 'block' ? (g.size === 6 ? 'La CPU va a atacar: salta en la marca con ' + gl.jump + ' y pulsa ' + gl.hit + ' justo cuando remata: <b>muro</b>. Antes de tiempo, red' : 'La CPU va a atacar: frente al atacante, ' + gl.jump + ' y pulsa ' + gl.hit + ' justo cuando remata: <b>muro</b>. Antes de tiempo, red')
            : g.size === 6 ? (p.role === 'L' ? 'La CPU va a atacar: llevas al líbero, <b>defiende</b> en la marca' : p.front ? 'La CPU va a atacar: <b>retírate</b> a la marca, bloquean tus compañeros' : 'La CPU va a atacar: <b>defiende</b> en la marca del fondo')
            : 'La CPU va a atacar: <b>defiende</b> el círculo, tu pareja bloquea' + (one ? '' : ' (' + gl.sw + ' para bloquear tú)');
        }
        // (táctil con ayudas: el aviso de dos opciones ya lo dice; la línea de arriba repetía lo mismo a la vez)
        if (tips && jr) coach = touchDev ? (help ? '' : gl.hit + ' remata, ' + gl.jset + (ar === 'roll' ? ' coloca al fondo' : ' coloca'))
          : ar === 'roll' ? 'En el aire, ' + gl.hit + ' <b>remata</b>, ' + gl.jump + ' deja caer y ' + gl.jset + ' <b>coloca al fondo</b>' : 'En el aire, ' + gl.hit + ' <b>remata</b> y ' + gl.jset + ' <b>coloca en salto</b>';
        // E1: un consejo de maestría por partido como mucho (finta, golpe colocado, colocación dirigida o al filo), con las ayudas puestas
        var e1c = help && (g.mastery || g.djump) && !g.drill ? e1Tip(g, p, nt, w, ar, gl, touchDev, one, dt) : '';
        if (e1c) coach = e1c;
        // modo uno: el siguiente toque es del compañero IA (no del humano): solo prepararse
        var myTurn = !!(VB.Sim.setTurn && VB.Sim.setTurn(g)), mateJob = one && nt > 0 && g.jobs && g.jobs[0] && g.jobs[0] !== p && !myTurn;
        if (tips && mateJob) coach = g.size === 6 ? coach6(g, p, nt, gl, touchDev)
          : nt === 2 ? 'Coloca tu pareja: prepárate para atacar' : 'Juega tu pareja: colócate';
        if (bodyTipT > 0 && tips && !touchDev) coach = 'Pulsa ' + gl.hit + ' antes de que llegue el balón';
        if (guideOn(g) && !mateJob) guideCheck(g, p, w, nt, gl);
        // 6v6: si el balón pasa a un compañero (o es el rival quien ataca), la tarjeta guiada del humano se va ya
        if (g.size === 6 && guideT > 0.3 && el.guide.className === 'show' && !(g.jobs && g.jobs[0] === p)) guideHide();
      }
    }
    if (!help && pcls.indexOf('go') >= 0) { pk = ''; } // sin ayudas: solo el aviso de saque
    if (!(myServe && tossed)) serveT0 = 0;
    // el aviso se mantiene un mínimo para que no parpadee, pero SOLO si el mismo aviso vuelve para el
    // mismo jugador (un golpe o un cambio de jugador lo borran al momento: ver clearPrompt)
    var pkey = pk ? pk + '|' + ptext + '|' + pcls : '';
    // los avisos de "¡ahora!" se apagan enseguida al cerrarse la ventana (si no, invitan a golpear tarde)
    if (pkey) { promptCur = pkey; promptCls = pcls; promptHold = pcls.indexOf('go') >= 0 ? 0.08 : 0.3; promptWho = p; }
    else if (promptHold > 0) { promptHold -= Math.max(dt, ctx.realDt || 0); if (promptHold <= 0 || promptWho !== p) promptCur = ''; }
    // ---- árbitro de capas de texto (UI-02): banner > guía > aviso corto > aviso de golpe > consejo; como mucho 2 ----
    // (la tarjeta guiada cuenta también con .thru: el balón por detrás solo la atenúa, sigue en pantalla)
    var Lban = (banT > 0 && el.banner.classList.contains('show')) || bugT > 0, Lguide = guideT > 0 && el.guide.classList.contains('show');
    if (Lban && Lguide) { guideT = 0; el.guide.className = ''; Lguide = false; }
    var Lcall = calloutT > 0 || stp.t > 0;                     // el sello del golpe (UI-09) cuenta como aviso corto
    // el aviso de golpe («¡Salta!», «¡Golpea ahora!») manda sobre el elogio del toque anterior («Colocación perfecta»): con la
    // tarjeta guiada (o un banner) ya arriba, el elogio se corta para que el aviso pueda salir (nunca 3 capas de texto)
    if (Lcall && promptCur && (Lban || Lguide) && promptCls.indexOf('go') >= 0) { calloutT = 0; el.callout.className = ''; if (stp.t > 0) { stp.t = 0; el.stamp.className = ''; } Lcall = false; }
    var nLay = (Lban ? 1 : 0) + (Lguide ? 1 : 0) + (Lcall ? 1 : 0);
    var promptOk = !!promptCur && nLay < 2;
    var showKey = promptOk ? promptCur + '|' + device() + padFam() : '';
    if (last.prompt !== showKey) {
      last.prompt = showKey;
      if (promptOk) {
        var parts = promptCur.split('|'), dv = device();
        // en el saque el botón táctil se llama SACAR: el aviso usa el mismo nombre
        el.promptKey.textContent = parts[0] === 'jump' ? gl.jumpT : (parts[0] === 'serve' && dv === 'touch' ? 'SACAR' : gl.hitT);
        el.promptKey.className = 'key' + (dv === 'gamepad' ? ' pad ' + padSet()[parts[0] === 'jump' ? 'b' : 'a'][0] : dv === 'touch' ? ' tch' + (parts[0] === 'jump' ? ' j' : '') : '');
        el.promptText.innerHTML = parts[1]; // textos propios (sin datos externos): «Saca ya <span class=nu>3 s</span>»
        el.prompt.className = (parts[0] === 'wait' ? 'wait' : parts[2] || 'hit') + (anchorOn ? ' anch' : '') + (prThru ? ' thru' : '');
        promptW = 0; prKonly = false; // se vuelve a medir (y el className nuevo ya no lleva .konly)
        last.clk = -1; // className reescrito: el aro del reloj vuelve a poner sus clases abajo
      } else { el.prompt.className = 'off' + (anchorOn ? ' anch' : ''); prX = -1; prThru = false; prKonly = false; }
    }
    if (promptOk) {
      if (promptCls.indexOf('bar') >= 0) { var pq = Math.round(Math.max(0, Math.min(1, progress)) * 400); if (pq !== last.pbar) { last.pbar = pq; el.promptBar.style.transform = 'scaleX(' + (pq / 400).toFixed(4) + ')'; } }
      placePrompt(g, p);
    }
    // aro del reloj de 8 s: propiedad --p (0..1) en la tecla; sin maquetación (conic-gradient enmascarado)
    var ck0 = clockF >= 0 && promptOk && promptCur.indexOf('serve|') === 0 && promptCls === 'hit' ? Math.round(clockF * 500) : -1;
    if (ck0 !== last.clk) {
      if ((ck0 >= 0) !== (last.clk >= 0)) el.prompt.classList.toggle('clk', ck0 >= 0);
      last.clk = ck0;
      if (ck0 >= 0) { el.promptRing.style.setProperty('--p', (ck0 / 500).toFixed(3)); el.prompt.classList.toggle('urg', clockF * 5 < 2); }
      else el.prompt.classList.remove('urg');
    }
    // latido por segundo en los 3 últimos (mismos umbrales que el «toc» de audio: Math.ceil 4→3, 3→2, 2→1)
    var csec = ck0 >= 0 ? Math.ceil(g.serveClock) : 0;
    if (csec !== last.csec) {
      if (csec > 0 && csec <= 3 && last.csec === csec + 1) {
        restartAnim(el.promptRing.parentNode, 'tk');
        var nu = el.promptText.querySelector('.nu'); if (nu) restartAnim(nu, 'tk');
      }
      last.csec = csec;
    }
    // el consejo espera a que no haya banner (punto, SET n, punto de set) ni tarjeta guiada, y es la capa que antes cede
    var showCoach = coach && !(ctx.introLeft > 0) && !introUI.quiet && !Lban && !(guideT > 0) && g.mode !== 'point' && (nLay + (promptOk ? 1 : 0)) < 2 && (tips || e1.on);
    // E6: en los ejercicios no hay consejos de partido; solo el del fallo (GYM_TIPS, 2,5 s), también durante la pausa entre repeticiones
    var gymC = drOn && gymTipT > 0 && (!g.autopilot || ctx.debug) && !(ctx.introLeft > 0);
    if (drOn) { showCoach = gymC && !Lban; if (gymC) coach = gymTip; }
    // táctil: cada tipo de consejo se ve 3 s como mucho por partido (luego estorba más que ayuda)
    if (showCoach && touchDev && !gymC && !e1.on) {
      var ckey = g.mode === 'serve' ? 's' + (myServe ? 1 : 0) : 'r' + nt + (g.touchTeam === 1 && g.touches === 2 ? 'b' : '');
      coachSeen[ckey] = (coachSeen[ckey] || 0) + (dt || 0); // tiempo de juego: congelado o en pausa no cuenta
      if (coachSeen[ckey] > 3) showCoach = false;
    }
    var ck = showCoach ? cpuTxt(coach) : '';
    if (last.coach !== ck) { last.coach = ck; coachRect = null; if (ck) el.coach.innerHTML = coachHTML(ck); el.coach.classList.toggle('off', !ck); }
    // con un aviso de "¡ahora!" en marcha, el consejo se atenúa: los ojos van al jugador
    var dimC = !!ck && promptOk && promptCls.indexOf('go') >= 0;
    if (last.dimC !== dimC) { last.dimC = dimC; el.coach.classList.toggle('faint', dimC); }
  }

  /** Borra el aviso al instante (golpe del equipo humano, cambio de jugador). */
  function clearPrompt() { promptCur = ''; promptHold = 0; }

  /** Segundos hasta que el balón lanzado del saque BAJE a la altura de contacto (sirve también mientras sube). */
  function inRect(x, y, r, m) { return x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m; }
  function serveTimeLeft(g, ws) {
    if (!ws) return 0;
    var b = g.ball, Gv = (VB.C && VB.C.G) || 9, zt = ws.zc + (g.ctrl ? g.ctrl.z : 0);
    if (b.vz < 0 && ws.t > 0) return ws.t;
    var disc = b.vz * b.vz + 2 * Gv * (b.z - zt);
    if (disc < 0) return 0;
    var t = (b.vz + Math.sqrt(disc)) / Gv;
    return t > 0 && t < 3 ? t : 0;
  }

  // ---- Aviso anclado al jugador controlado ----
  // El aviso va a la altura del pecho, al lado del jugador (a su derecha en pantalla; a la izquierda si
  // no cabe): nunca tapa los pies ni el aro amarillo, y queda donde ya están mirando los ojos.
  // Si el jugador no está en pantalla, vuelve abajo al centro (clase 'bot' sin 'anch').
  var anchorOn = true, promptW = 0, promptH = 0, prX = -1, prY = -1, _pv = null, _ph = null, prSide = 1, prThru = false;
  // cajas en pantalla de los OTROS atletas y del balón (px CSS, preasignadas): el aviso no debe taparlos en el momento clave
  var _ob = [], _obN = 0, _obHeld = null;  // _obHeld: caja del balón en la mano del sacador (o null)
  function obBox(i) { return _ob[i] || (_ob[i] = { l: 0, r: 0, t: 0, b: 0, w: 1 }); }
  function collectObstacles(g, p, W, H) {
    _obN = 0; _obHeld = null;
    for (var t = 0; t < 2; t++) for (var i = 0; i < (g.teams && g.teams[t] ? g.teams[t].length : 0); i++) {
      var q = g.teams && g.teams[t] && g.teams[t][i];
      if (!q || q === p) continue;
      VB.toThree(q.x, q.y, (q.z || 0) + 0.95, _pv); _pv.project(ctx.camera);
      if (_pv.z > 1 || _pv.z < -1) continue;
      VB.toThree(q.x, q.y, (q.z || 0) + 1.95, _ph); _ph.project(ctx.camera);
      var cx = (_pv.x + 1) * 0.5 * W, cy = (1 - _pv.y) * 0.5 * H, hy = (1 - _ph.y) * 0.5 * H, half = Math.max(10, Math.abs(cy - hy));
      var o = obBox(_obN++); o.l = cx - half * 0.42; o.r = cx + half * 0.42; o.t = cy - half; o.b = cy + half; o.w = 1;
    }
    var bl = g.ball;
    if (bl) {
      VB.toThree(bl.x, bl.y, bl.z, _pv); _pv.project(ctx.camera);
      if (_pv.z < 1 && _pv.z > -1) {
        // caja del balón a su tamaño en pantalla (+10 px de aire): con la cámara del saque pegada al sacador (móvil, 667×375) el
        // balón en la mano mide ~32 px y la caja fija de 28 px dejaba el aviso «SACAR / SALTAR» encima de él
        var bx = (_pv.x + 1) * 0.5 * W, by = (1 - _pv.y) * 0.5 * H;
        VB.toThree(bl.x, bl.y, bl.z + 0.5, _ph); _ph.project(ctx.camera);
        var br = Math.abs(by - (1 - _ph.y) * 0.5 * H) / 0.5 * 0.11, bh = Math.max(14, Math.min(60, br + 10)), o2 = obBox(_obN++);
        // en la mano del sacador (b.held) el balón que se ve (players.js) cae algo más abajo y a un lado del de la sim: caja más
        // grande y bajada (medido a 667×375 en la playa: el de la sim en 346,259 y el dibujado en 335,290)
        if (bl.held && p && Math.abs(bl.x - p.x) + Math.abs(bl.y - p.y) < 1.2) { bh = Math.max(bh, Math.min(70, br * 2.2 + 12)); by += br * 1.5; _obHeld = o2; }
        o2.l = bx - bh; o2.r = bx + bh; o2.t = by - bh; o2.b = by + bh; o2.w = 1.5;
      }
    }
  }
  /** Fracción (ponderada) de las cajas de obstáculos que quedaría bajo el aviso en (x, y). */
  function overlapAt(x, y) {
    var sum = 0;
    for (var i = 0; i < _obN; i++) {
      var o = _ob[i], ix = Math.min(x + promptW, o.r) - Math.max(x, o.l), iy = Math.min(y + promptH, o.b) - Math.max(y, o.t);
      if (ix > 0 && iy > 0) sum += o.w * (ix * iy) / Math.max(1, (o.r - o.l) * (o.b - o.t));
    }
    return sum;
  }
  // UI-20: los botones táctiles reales (GOLPEAR, SALTAR, ⇄, pausa; con el aro del botón y 10 px de margen) son zonas PROHIBIDAS para
  // el aviso a cualquier tamaño. Se miden al cambiar de tamaño (y cada 2 s por si input.js los recoloca), nunca por frame.
  var tbx = { f: -9999, ok: false, L: [] };
  function touchBoxes() {
    if (!el.app.classList.contains('is-touch')) return null;
    if (tbx.ok && ctx.frame - tbx.f < 120) return tbx.L;
    tbx.f = ctx.frame; tbx.L.length = 0; tbx.ok = false;
    var root = document.getElementById('touch'); if (!root || root.hidden) return tbx.L;
    var bs = root.querySelectorAll('.vt-btn');
    for (var i = 0; i < bs.length; i++) {
      var r = bs[i].getBoundingClientRect(); if (!(r.width > 0)) continue;
      // (pulsado, el botón encoge un poco: se toma la caja de layout entera, centrada)
      var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, hw2 = Math.max(r.width, bs[i].offsetWidth) / 2 + 10, hh2 = Math.max(r.height, bs[i].offsetHeight) / 2 + 10;
      tbx.L.push({ l: cx - hw2, t: cy - hh2, r: cx + hw2, b: cy + hh2 });
    }
    // y la guía del joystick en reposo (revisión móvil: a 568-667 px el aviso del saque montaba ~20 px sobre su aro)
    var jb = root.querySelector('.vt-joy.idle .vt-base'), jr = jb && jb.getBoundingClientRect();
    if (jr && jr.width > 0) tbx.L.push({ l: jr.left - 6, t: jr.top - 6, r: jr.right + 6, b: jr.bottom + 6 });
    tbx.ok = tbx.L.length > 0;
    return tbx.L;
  }
  function hitTouch(TB, x, y, w, h) {
    if (!TB) return false;
    for (var i = 0; i < TB.length; i++) { var o = TB[i]; if (x < o.r && x + w > o.l && y < o.b && y + h > o.t) return true; }
    return false;
  }
  var prKonly = false, promptWK = 0;
  /** Solo la tecla (sin texto ni barra): el aviso no cabía junto al jugador sin pisar un botón táctil. */
  function setKonly(on) {
    if (on === prKonly) return;
    prKonly = on; el.prompt.classList.toggle('konly', on); prX = -1;
  }
  var _prX = [0, 0, 0], prLast = { x: 0, y: 0, w: 0, h: 0 }, prC = [9, 9, 9];
  /** Costes de los tres sitios (derecha, izquierda, encima) para un aviso de ancho wd; 9 = descartado (borde, joystick o botón táctil). */
  function prCands(TB, wd, sx, gap, y0, yT, hy, lEdge, rEdge, m, W, gapL) {
    var xR = sx + gap, xL = sx - (gapL || gap) - wd, xT = Math.max(m, Math.min(W - m - wd, sx - wd * 0.5));
    var w0 = promptW; promptW = wd;                       // overlapAt mide con promptW
    prC[0] = xR + wd > rEdge || hitTouch(TB, xR, y0, wd, promptH) ? 9 : overlapAt(xR, y0);
    prC[1] = xL < lEdge || hitTouch(TB, xL, y0, wd, promptH) ? 9 : overlapAt(xL, y0);
    prC[2] = (yT + promptH > hy - 4) || hitTouch(TB, xT, yT, wd, promptH) ? 9 : overlapAt(xT, yT) + 0.05; // arriba: solo si gana (tapa algo de vista sobre la jugada)
    promptW = w0; _prX[0] = xR; _prX[1] = xL; _prX[2] = xT;
  }
  function placePrompt(g, p) {
    var cam = ctx.camera, W = ctx.width, H = ctx.height;
    if (!cam || !p || !VB.toThree || !ctx.THREE) return anchorBottom();
    if (!_pv) { _pv = new ctx.THREE.Vector3(); _ph = new ctx.THREE.Vector3(); }
    VB.toThree(p.x, p.y, (p.z || 0) + 1.15, _pv); _pv.project(cam);
    VB.toThree(p.x, p.y, (p.z || 0) + 1.85, _ph); _ph.project(cam);
    if (_pv.z > 1 || _pv.z < -1 || Math.abs(_pv.x) > 1.05 || Math.abs(_pv.y) > 1.05) return anchorBottom();
    if (!promptW) {
      // ancho entero (sin .konly) y el de solo la tecla
      if (prKonly) el.prompt.classList.remove('konly');
      promptW = (el.prompt.offsetWidth || 180) * hudScale; promptH = (el.prompt.offsetHeight || 38) * hudScale;
      var kw = el.promptKey.parentNode; promptWK = ((kw && kw.offsetWidth) || 60) * hudScale + 22 * hudScale;
      if (prKonly) el.prompt.classList.add('konly');
    }
    var TB = touchBoxes();
    var sx = (_pv.x + 1) * 0.5 * W, sy = (1 - _pv.y) * 0.5 * H;
    var hy = (1 - _ph.y) * 0.5 * H, body = Math.max(18, Math.abs(sy - hy) * 1.55); // ~ media altura del jugador en px
    var gap = Math.max(26, body * 0.42), m = 12;
    var y0 = Math.max(64, Math.min(H - promptH - m, sy - promptH * 0.5));
    // a la izquierda, el joystick (abajo): el pulgar taparía el aviso. A la derecha, los botones táctiles reales (TB)
    var lEdge = m + (ctx.isTouch && y0 + promptH > H - joyTop() ? joyRight() : 0), rEdge = W - m;
    // Tres sitios junto al jugador controlado (derecha, izquierda, sobre la cabeza): el que menos tape a los demás
    // atletas y al balón. Con histéresis (el lado actual gana los empates por poco) para que no salte de un lado a otro.
    collectObstacles(g, p, W, H);
    var yT = Math.max(64, hy - body * 0.55 - promptH);
    var ko = false, wd = promptW, X = _prX, C = prC;
    // saque táctil (667×375): el balón en la mano sale a la izquierda del sacador; el sitio de la izquierda se aparta hasta dejarlo libre
    var gapL = _obHeld && _obHeld.l < sx ? Math.max(gap, sx - _obHeld.l + 6) : gap;
    prCands(TB, wd, sx, gap, y0, yT, hy, lEdge, rEdge, m, W, gapL);
    if (C[0] >= 9 && C[1] >= 9 && C[2] >= 9 && TB && TB.length) { ko = true; wd = promptWK; prCands(TB, wd, sx, gap, y0, yT, hy, lEdge, rEdge, m, W, gapL); }   // no cabe entero: solo la tecla
    var y = y0, best = prSide;
    if (C[0] >= 9 && C[1] >= 9 && C[2] >= 9) {
      // nada cabe a la altura del pecho: se sube por encima de los botones (a la derecha o a la izquierda, lo que quede libre)
      best = X[0] + wd > rEdge ? -1 : 1;
      if (TB) for (var k = 1; k <= 12; k++) {
        var yy = y0 - k * 16; if (yy < 52) break;
        if (X[0] + wd <= rEdge && !hitTouch(TB, X[0], yy, wd, promptH)) { best = 1; y = yy; break; }
        if (X[1] >= m && !hitTouch(TB, X[1], yy, wd, promptH)) { best = -1; y = yy; break; }
      }
    } else {
      var cur = C[prSide === 1 ? 0 : prSide === -1 ? 1 : 2], bc = cur - 0.07;
      if (C[0] < bc) { best = 1; bc = C[0]; }
      if (C[1] < bc) { best = -1; bc = C[1]; }
      if (C[2] < bc) { best = 0; bc = C[2]; }
      // el lado actual descartado (9) no se queda por histéresis
      if (C[best === 1 ? 0 : best === -1 ? 1 : 2] >= 9) best = C[0] < 9 ? 1 : C[1] < 9 ? -1 : 0;
    }
    setKonly(ko);
    if (best !== prSide) { prSide = best; prX = -1; } // cambio de lado: salta (deslizarse cruzaría por encima del propio jugador)
    var x = prSide === 1 ? X[0] : prSide === -1 ? X[1] : X[2];
    if (prSide === 0) y = yT;
    x = Math.max(m, Math.min(W - m - wd, x));
    if (!anchorOn) { anchorOn = true; el.prompt.classList.add('anch'); prX = -1; }
    if (prX < 0) { prX = x; prY = y; }
    else { var kk = 1 - Math.exp(-16 * Math.max(0.001, ctx.realDt || 0.016)); prX += (x - prX) * kk; prY += (y - prY) * kk; }
    // el suavizado nunca lo lleva por encima de un botón táctil: si lo pisaría, salta al sitio bueno
    if (hitTouch(TB, prX, prY, wd, promptH)) { prX = x; prY = y; }
    // si aun así (en la posición ya suavizada) tapa a otro atleta o al balón, se vuelve translúcido (como el contador y el consejo)
    var w1 = promptW; promptW = wd; var thru = overlapAt(prX, prY) > 0.08; promptW = w1;
    if (thru !== prThru) { prThru = thru; el.prompt.classList.toggle('thru', thru); }
    el.prompt.style.transform = 'translate3d(' + prX.toFixed(1) + 'px,' + prY.toFixed(1) + 'px,0)';
    prLast.x = prX; prLast.y = prY; prLast.w = wd; prLast.h = promptH;
  }
  // caja del joystick táctil (input.js) en px CSS; se vuelve a medir cada 64 frames
  var joyR = null, joyF = -999;
  function joyBox() {
    if (!joyR || ctx.frame - joyF > 64) {
      joyF = ctx.frame; joyR = { r: 0, h: 0 };
      var j = document.querySelector('#touch .vt-joy'), b = j && j.getBoundingClientRect();
      if (b && b.width) { joyR.r = b.right + 6; joyR.h = ctx.height - b.top; }
    }
    return joyR;
  }
  function joyRight() { return joyBox().r; }
  function joyTop() { return joyBox().h || ctx.height * 0.38; }
  function anchorBottom() {
    if (anchorOn) { anchorOn = false; el.prompt.classList.remove('anch'); el.prompt.style.transform = ''; prX = -1; }
    if (prKonly) setKonly(false);
    if (prThru) { prThru = false; el.prompt.classList.remove('thru'); }
  }

  // =====================================================================
  //  PANTALLAS
  // =====================================================================
  /** UI-16: zoom de la hoja = tamaño del HUD, como mucho lo que quepa en el alto disponible (sin desplazar para ver los botones). */
  function fitSheet(node) {
    var sh = node && node.querySelector ? node.querySelector('.sheet') : null; if (!sh) return;
    if (hudScale <= 1) { if (sh.style.zoom) sh.style.zoom = ''; return; }
    sh.style.zoom = '1';
    var h = sh.scrollHeight, avail = (node.clientHeight || ctx.height) - 32, w = sh.scrollWidth, availW = (node.clientWidth || ctx.width) - 32;
    var z = Math.min(hudScale, Math.max(1, Math.min(avail / Math.max(1, h), availW / Math.max(1, w))));
    sh.style.zoom = z > 1.005 ? z.toFixed(3) : '';
  }
  /** UI-21: hoja desplazable → desvanecido con flecha abajo (.has-more) mientras quede algo por debajo del borde. */
  function checkMore(node) {
    var sh = node && node.querySelector ? node.querySelector('.sheet') : null; if (!sh || node.hidden) return;
    // margen de 20 px: si solo sobra el relleno de abajo (hoja final a 667×375: 11 px), el desvanecido de 46 px taparía los
    // últimos botones sin que haya nada más que ver
    // se mide SIN la clase: su ::after (margen de -28 px abajo) encoge 28 px una hoja de alto libre y la hacía «desbordar» sola,
    // así que una hoja que menguaba después de marcarse (la de la prueba de Carrera a 390×844) se quedaba con el desvanecido
    var had = sh.classList.contains('has-more');
    if (had) sh.classList.remove('has-more');
    var more = sh.scrollHeight - sh.clientHeight > 20 && sh.scrollTop + sh.clientHeight < sh.scrollHeight - 20;
    if (more) sh.classList.add('has-more');
    if (node === el.panel) spMore();
  }
  /** SPLAT · PANELES: las hojas .sp-scroll se desplazan por dentro (la hoja del panel ya no): .sp-more = queda algo por debajo
   *  (el CSS desvanece el borde de abajo). Al abrir y repintar (checkMore), al desplazar y cada 16 frames con el panel abierto. */
  function spMore() {
    var L = el.panel.querySelectorAll('.sp-scroll');
    // (móvil, 18-nov-2026: VB.Splat.more mide igual y además pone .sp-less / .sp-more-x y se vuelve a medir sola al desplazar)
    if (VB.Splat && VB.Splat.more) { for (var k = 0; k < L.length; k++) VB.Splat.more(L[k]); return; }
    for (var i = 0; i < L.length; i++) {
      var s = L[i], m = s.clientHeight > 0 && s.scrollHeight - s.clientHeight > 8 && s.scrollTop + s.clientHeight < s.scrollHeight - 8;
      if (s.classList.contains('sp-more') !== m) s.classList.toggle('sp-more', m);
    }
  }
  /** B4: las hojas y paneles también SALEN animados (.out: corte diagonal de 160 ms, fundido de 80 con «Menos movimiento», solo
   *  opacidad en calidad baja; CSS «TV B4»). Mientras sale lleva `inert` y no cuenta como capa activa ni para el foco; si se vuelve a
   *  mostrar a medias, se cancela. Al momento, como antes: bajo la cortinilla (wp.ph), con el telón del arranque, en las escenas
   *  debug= y con &uianim=0 (herramientas). */
  var SND_NODES = null;
  function uiAnimOff() { return !!(ctx && (ctx.debug || (ctx.params && ctx.params.uianim === '0'))); }
  function showNode(node, on) {
    if (!SND_NODES) SND_NODES = [el.panel, el.pause, el.end];
    if (on) {
      if (node._outT) { clearTimeout(node._outT); node._outT = 0; node.classList.remove('out'); node.removeAttribute('inert'); }
      if (node.hidden) {
        node.hidden = false; fitSheet(node); checkMore(node); node.classList.remove('in'); requestAnimationFrame(function () { node.classList.add('in'); });
        if (SND_NODES.indexOf(node) >= 0) panelSnd(true);
      }
    } else {
      if (node.hidden) { node.classList.remove('in'); return; }
      if (node._outT) return;
      if (uiAnimOff() || wp.ph || bootStage < 2) { node.hidden = true; node.classList.remove('in', 'out'); return; }
      if (SND_NODES.indexOf(node) >= 0) panelSnd(false);
      node.classList.add('out'); node.setAttribute('inert', '');
      if (node.contains(document.activeElement) && document.activeElement.blur) { try { document.activeElement.blur(); } catch (e) { } }
      node._outT = setTimeout(function () { node._outT = 0; node.hidden = true; node.classList.remove('in', 'out'); node.removeAttribute('inert'); }, rm() ? 80 : 160);
    }
  }
  function isOut(node) { return !!(node && node._outT); }
  function syncScreens(g) {
    var s = ctx.state, key = s + (ctx.portraitBlock ? 'P' : '') + (ctx.endHold ? 'H' : '') + (endGate ? 'G' : '') + (geGate ? 'Q' : '') + (ctx.replay ? 'R' : '') + (panel || '');
    if (key === shown) return;
    shown = key;
    showNode(el.menu, s === 'menu' && !panel);
    showNode(el.pause, s === 'paused' && !panel);
    // (S3-C1: mientras se ven las jugadas desde la pestaña «Jugadas», la hoja se aparta como con «Ver celebración»)
    var endOn = s === 'over' && !!g.finished && !g.drill && !panel && !ctx.endHold && !endGate && !ctx.replay;
    // E6: hoja final del ejercicio (sin gameOver: g.drill.done), tras el sello de la última repetición y la cortinilla
    var geOn = s === 'over' && !!(g.drill && g.drill.done && !g.demo) && !panel && !geGate;
    if (el.gymEnd) showNode(el.gymEnd, geOn);
    if (endOn && el.end.hidden) { el.end.classList.toggle('dock', endDocked()); if (!rpBack) { countUp(el.end); endRcSounds(); } rpBack = false; setTimeout(endMore, 60); if (endTabsApi) setTimeout(function () { fitTabs(endTabsApi); }, 70); }
    if (!endOn && ctx.replay && s === 'over' && !el.end.hidden) rpBack = true;   // (al volver de las jugadas, sin la entrada otra vez)
    showNode(el.end, endOn);
    el.app.classList.toggle('end-on', s === 'over' && !!g.finished);
    // (móvil · partido, 18-nov-2026) #app.hud-off: con la pausa, un panel abierto en el partido (Controles, Ajustes, Cambios,
    // Estadística), la hoja final o la del ejercicio, el marcador, los botones del HUD y los mandos táctiles no asoman detrás (CSS «SPLAT · CAMBIOS Y BANQUILLO»)
    el.app.classList.toggle('hud-off', s === 'paused' || geOn || (s === 'over' && !!g.finished && !ctx.replay) || (!!panel && s !== 'menu'));
    showNode(el.panel, !!panel);
    // En el menú el HUD no se oculta con display:none sino casi transparente (.warm): mostrarlo por primera vez
    // al empezar el partido costaba un frame de 100-120 ms (rasterizado del marcador; medido en Chrome/ANGLE).
    // Así ya está pintado y el primer frame del partido baja a < 35 ms.
    el.hud.hidden = false; el.hud.classList.toggle('warm', s === 'menu');
    el.rotate.hidden = !ctx.portraitBlock;
    // la viñeta no se suma al velo de las hojas (pausa, final, paneles)
    el.veil.classList.toggle('under', (s === 'paused' || geOn || (s === 'over' && !!g.finished && !ctx.endHold && !endGate && !ctx.replay && !el.end.classList.contains('dock')) || !!panel));
    if (s === 'menu') { hideBanner(); renderMenu(); }
    if (s === 'paused') renderPause(g);
    focusLayer();
    tabTitle(g);
  }
  function activeLayer() {
    // móvil: una hoja de abajo (VB.Splat.sheet) abierta es la capa activa (el foco y ↑/↓ se quedan dentro; B / Esc la cierran)
    var shL = VB.Splat && VB.Splat.sheetEl ? VB.Splat.sheetEl() : null; if (shL) return shL;
    if (panel) return el.panel;
    if (ctx.state === 'menu') return el.menu;
    if (ctx.state === 'paused') return el.pause;
    if (ctx.state === 'over' && !el.end.hidden && !isOut(el.end)) return el.end;
    if (ctx.state === 'over' && el.gymEnd && !el.gymEnd.hidden && !isOut(el.gymEnd)) return el.gymEnd;
    return null;
  }
  function focusables(layer) {
    if (!layer) return [];
    var all = layer.querySelectorAll('[data-nav] button, [data-nav] [data-focus], .pn-head button, .mp-head button'), out = [];
    // (las pestañas no elegidas y las pistas Q/E llevan data-skip: solo la pestaña activa entra en el recorrido ↑/↓)
    // (y los que no se pintan, p. ej. el «?» .ph-only de Partido rápido en PC: display:none no se puede enfocar)
    for (var i = 0; i < all.length; i++) if (!all[i].closest('[hidden]') && !all[i].closest('[inert]') && !all[i].disabled && !all[i].hasAttribute('data-skip') && all[i].getClientRects().length) out.push(all[i]);
    // en paneles y páginas del menú: primero el contenido y "Volver" al final
    var isBack = function (b) { return b.id === 'btnPanelBack' || b.classList.contains('mp-back') ? 1 : 0; };
    out.sort(function (a, b) { return isBack(a) - isBack(b); });
    return out;
  }
  function focusEl(b, kb) {
    if (!b) return;
    try { b.focus({ preventScroll: !kb }); } catch (e) { }
    var prev = document.querySelectorAll('.kf'); for (var i = 0; i < prev.length; i++) if (prev[i] !== b) prev[i].classList.remove('kf');
    if (kb) b.classList.add('kf');
  }
  function focusLayer(pref) {
    setTimeout(function () {
      var L = activeLayer(); if (!L) return;
      // S3-C1 / R10: de vuelta de las jugadas, el foco al «Ver» (o «Verlas todas») que se pulsó
      if (!pref && L === el.end && rpFocus) { var rb = el.endPlays && el.endPlays.querySelector('[data-play="' + rpFocus + '"]'); rpFocus = ''; if (rb && !rb.closest('[hidden]')) { focusEl(rb, rpKb || ctx.inputDevice === 'gamepad'); return; } }
      // (hoja final: el botón principal, no la pestaña que va antes en el DOM)
      var f = pref || (ctx.state === 'menu' && !panel ? pageFocus() : null) || (L === el.end && !el.btnAgain.hidden ? el.btnAgain : null) || focusables(L)[0];
      focusEl(f, false);
    }, 30);
  }
  // SPLAT (17-nov-2026, notes/splat.md): botones en filas (contenedor con data-sp-row: portada, Jugar). ↑/↓ saltan de fila en fila
  // (en la fila de destino, la misma columna o la última) y ←/→ se mueven dentro de la fila (spRowStep, desde adjustFocused)
  function spRow(b) { var p = b && b.parentNode; return p && p.closest ? p.closest('[data-sp-row]') : null; }
  function spRowList(r, list) { return list.filter(function (x) { return spRow(x) === r; }); }
  function spNavIdx(list, i, d) {
    var n = list.length, r = spRow(list[i]), col = r ? spRowList(r, list).indexOf(list[i]) : 0, j = i;
    do { j = (j + d + n) % n; } while (r && j !== i && spRow(list[j]) === r);
    var r2 = spRow(list[j]); if (!r2 || r2 === r) return j;
    var L2 = spRowList(r2, list); return list.indexOf(L2[r ? Math.min(col, L2.length - 1) : 0]);
  }
  /** ←/→ en una fila data-sp-row: la vecina activa; en el borde, el rebote. */
  function spRowStep(r, a, d) {
    var L = Array.prototype.filter.call(r.querySelectorAll('button'), function (b) { return !b.disabled && !b.closest('[hidden]') && !b.hasAttribute('data-skip'); });
    var i = L.indexOf(a), j = i + (d > 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= L.length) { uiSound2('arrowEdge', d); return; }
    focusEl(L[j], true); hoverSound();
  }
  function navMove(d) {
    var L = activeLayer(), list = focusables(L); if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    i = i < 0 ? 0 : spNavIdx(list, i, d);
    focusEl(list[i], true); if (list[i].classList && list[i].classList.contains('opt')) uiSound2('optHover'); else hoverSound();
  }

  // B3 (sprint 2-4, spec S2-B2B3 §2.4): «Continuar carrera» en la portada. VB.CareerUI.syncHero() (career-ui) rellena #contK/#contT/
  // #contS/#contPt/#contCr y dice si hay una carrera activa sana; ui.js decide hidden, .primary y .has-cont (sin :has por iOS 15).
  // Sin carrera (o sin syncHero) la portada es la de siempre. Se repinta al entrar en el menú, al cerrar la Carrera, al cambiar el
  // Vestuario (la clave del retrato) y tras una bajada de la cuenta (VB.UI.refreshMenu); nunca por frame.
  var heroDirty = true, heroOn = false, contOpen = false, crWasOpen = false;
  function syncHero() {
    heroDirty = false;
    if (!el.btnCont) return;
    var CU = VB.CareerUI, show = false;
    if (CU && typeof CU.syncHero === 'function') { try { show = !!CU.syncHero(); } catch (e) { show = false; console.error('[VB][ERROR] CareerUI.syncHero: ' + e); } }
    heroOn = show;
    if (el.btnCont.hidden === show) el.btnCont.hidden = !show;
    var ml = el.btnCont.parentNode;
    if (ml && ml.classList.contains('has-cont') !== show) ml.classList.toggle('has-cont', show);
    if (el.menuCol && el.menuCol.classList.contains('has-cont') !== show) el.menuCol.classList.toggle('has-cont', show);
    if (el.btnPlay.classList.contains('primary') === show) el.btnPlay.classList.toggle('primary', !show);
    if (el.playMainSub && el.playMainSub.hidden === show) el.playMainSub.hidden = !show;
    if (!show && document.activeElement === el.btnCont && mpage === 'main') focusEl(el.btnPlay, kbNow());
  }
  /** «Continuar carrera»: abre el hub en «Partido» con el foco en «Jugar partido» (el partido no empieza solo; R15: from 'main'). */
  function goCont() {
    var CU = VB.CareerUI; if (!CU || !CU.open) return;
    contOpen = true;
    try { CU.open('hub', { from: 'main', focus: 'play' }); } catch (e) { contOpen = false; console.error('[VB][ERROR] CareerUI.open: ' + e); }
  }
  /** Vuelta de la Carrera abierta desde la portada: foco en #btnCont si career-ui no lo ha puesto ya en algo visible. */
  function contBack() {
    contOpen = false; heroDirty = true;
    if (ctx.state === 'menu') renderMenu();
    setTimeout(function () {
      if (ctx.state !== 'menu' || mpage !== 'main' || (VB.CareerUI && VB.CareerUI.isOpen && safe(VB.CareerUI.isOpen))) return;
      var a = document.activeElement;
      if (a && a !== document.body && a.offsetParent !== null && el.menu.contains(a)) return;
      focusEl(heroOn && !el.btnCont.hidden ? el.btnCont : el.btnPlay, kbNow());
    }, 80);
  }
  function renderMenu() {
    var d = device();
    if (heroDirty) syncHero();
    if (VB.Splat) VB.Splat.sync();   // SPLAT: colores de la equipación en :root (firma: no hace nada si no cambian)
    // D4: las bajadas de la cuenta solo se aplican en el menú (account.js las deja pendientes hasta aquí)
    if (VB.Account && VB.Account.menuReady) { try { VB.Account.menuReady(); } catch (e) { } }
    // grupos tecla + acción (.kh) con raya fina entre ellos (CSS), sin «·»
    var kh = function (k, t) { return '<span class="kh">' + k + ' ' + t + '</span>'; };
    // según la página (antes la misma en todas: en el principal no hay nada que «cambiar» ni adónde «volver»)
    var pg = mpage, ud = '<span class="key">↑</span><span class="key">↓</span>', lr = '<span class="key">←</span><span class="key">→</span>';
    var h = d === 'gamepad' ? kh('<span class="key">Stick</span>', pg === 'quick' ? 'elegir y cambiar' : 'elegir') + kh(padKey('a'), 'aceptar') + (pg === 'main' ? '' : kh(padKey('b'), 'volver'))
      : d === 'touch' ? '' : kh(pg === 'play' ? (VB.Retos && el.btnRetos ? ud + lr : lr) : pg === 'online' ? ud + lr : ud, 'elegir') + kh('<span class="key">Intro</span>', 'aceptar') + (pg === 'quick' ? kh(lr, 'cambiar') : '') + (pg === 'main' ? '' : kh('<span class="key">Esc</span>', 'volver'));
    // Vestuario: cambiar, apartado, girar y volver (al azar con X en el mando)
    if (pg === 'look') h = d === 'gamepad' ? kh('<span class="key">Stick</span>', 'elegir y cambiar') + kh(padKey('x'), 'al azar') + kh('<span class="key">Stick der.</span>', 'girar') + kh(padKey('b'), 'volver')
      : d === 'touch' ? '' : kh(ud, 'elegir') + kh(lr, 'cambiar') + kh('<span class="key">Q</span><span class="key">E</span>', 'apartado') + kh('<span class="key">Z</span><span class="key">X</span>', 'girar') + kh('<span class="key">Esc</span>', 'volver');
    if (pg === 'prof') h = d === 'gamepad' ? kh('<span class="key">Stick</span>', 'elegir') + kh('<span class="key">' + padSet().lb + '</span><span class="key">' + padSet().rb + '</span>', 'apartado') + kh(padKey('x'), 'vitrina') + kh(padKey('b'), 'volver')
      : d === 'touch' ? '' : kh(ud + lr, 'elegir') + kh('<span class="key">Q</span><span class="key">E</span>', 'apartado') + kh('<span class="key">F</span>', 'vitrina') + kh('<span class="key">Esc</span>', 'volver');
    setHTML(el.navHint, 'navh', h);
    setText(el.ctlSub, 'ctls', d === 'gamepad' ? 'Mando conectado' : d === 'touch' ? 'Táctil' : 'Teclado y mando');
    var rec = record.played ? '<span><b>' + record.wins + '/' + record.played + '</b>Victorias</span>' + (record.bestStreak ? '<span><b>' + record.bestStreak + '</b>Mejor racha</span>' : '') : '';
    setHTML(el.menuRecord, 'rec', rec);
    if (el.menuRecord) el.menuRecord.style.display = rec ? '' : 'none';
    // E7: versión en la esquina (abre Novedades); punto dorado si hay una versión nueva sin ver
    if (el.btnVer && VB.VERSION) {
      if (el.btnVer.hidden) { el.btnVer.hidden = false; el.btnVer.textContent = 'v' + VB.VERSION; }
      var nw = seenGet() !== VB.VERSION; if (el.btnVer.classList.contains('new') !== nw) el.btnVer.classList.toggle('new', nw);
    }
    // E6: tarjeta Entrenamiento de Jugar: las medallas conseguidas (si hay alguna)
    if (el.gymSub && VB.Gym && VB.Gym.count) {
      var gc = safe(VB.Gym.count) | 0;
      setHTML(el.gymSub, 'gyms', gc ? 'Ejercicios con medallas y peloteo libre <span class="chip">Medallas ' + gc + '/15</span>' : 'Ejercicios con medallas y peloteo libre');
    }
    renderRetoStrip();   // D1: franja de Retos en Jugar (solo se rehace si cambia la medalla de hoy o lo nuevo)
    pfChip();            // D2: chip del perfil en el pie de la portada (lee pfSum; album() solo con pfDirty)
    // bajo el logo, en vez del lema de folleto, el dato vivo del último Partido rápido (TV D6); sin partidos, nada
    if (el.menuLast) {
      var lA = record.lastA, lB = record.lastB, lDn = record.lastD && VB.DIFF && VB.DIFF[record.lastD] && VB.DIFF[record.lastD].name;
      var lst = record.played && lDn && lA !== lB ? ['Última: ' + lA + '-' + lB + (lA > lB ? ' a la CPU' : ' ante la CPU'), lDn] : null;
      if (lst) setSep(el.menuLast, lst, 'v');
      el.menuLast.hidden = !lst;
    }
    if (el.squadSub && VB.Prog) {
      var sq = VB.Prog.get().a, pt = sq[0].pts + sq[1].pts;
      // sin puntos: una pastilla por jugador con su dorsal en círculo («(1) Nv 3  (2) Nv 2»)
      setHTML(el.squadSub, 'sqs', pt ? pt + (pt === 1 ? ' punto de mejora' : ' puntos de mejora')
        : sepHTML(sq.map(function (a) { return { h: '<i class="dn" aria-label="N.º ' + a.num + '">' + a.num + '</i>Nv ' + a.lvl }; }), 'c'));
      el.btnSquad.classList.toggle('has-pts', pt > 0);
    }
    // Vestuario: punto en el botón de la portada mientras haya algo nuevo sin ver
    if (el.btnLook && !el.btnLook.hidden) { var nn = lkUnseen().length > 0; if (el.btnLook.classList.contains('has-new') !== nn) el.btnLook.classList.toggle('has-new', nn); }
  }
  // ---------- Jugadores: estadísticas y mejoras (js/prog.js) ----------
  // Menús v2: un atleta cada vez (selector n.º 1 / n.º 2 arriba) y pestañas Físico · Defensa · Ataque (VB.Prog.GROUPS) · Insignias.
  var sqSel = 0;
  var SQ_IC = { 'Físico': 'phys', 'Defensa': 'def', 'Ataque': 'atk' };
  function sqItems() {
    var G = (VB.Prog && VB.Prog.GROUPS) || [], it = G.map(function (g, i) { return { id: 'g' + i, label: g[0], icon: TAB_IC[SQ_IC[g[0]]] || '' }; });
    if (VB.Badges) it.push({ id: 'bd', label: 'Insignias', icon: TAB_IC.badge });
    return it;
  }
  function renderSquad(upKey) {
    if (!el.sqBody || !VB.Prog) return;
    var P = VB.Prog, d = P.get();
    if (sqSel >= d.a.length) sqSel = 0;
    // selector de atleta (radio): dorsal, rol, nivel y aviso de puntos sin gastar
    var ph = '';
    d.a.forEach(function (a, i) {
      var on = i === sqSel;
      ph += '<button class="sq-pk sp-btn sp-wide sp-calm sp-quiet ' + (on ? 'sp-gold on' : 'sp-ink') + (a.pts ? ' has-pts' : '') + '" data-shape="' + (i * 2 + 1) + '" role="radio" aria-checked="' + on + '" data-pick="' + i + '"' + (on ? '' : ' tabindex="-1"') + '>' +
        '<span class="sq-num">' + a.num + '</span><span class="sq-pn">N.º ' + a.num + '<small>' + escT(a.role || '') + '<span class="sq-lv"> (Nv&nbsp;' + a.lvl + ')</span><span class="sq-pm"><span class="sep sep-v"><span class="sr">, </span></span><span class="sq-pl">Nv&nbsp;' + a.lvl + ' · </span>Media ' + P.ovr(a.st) + '</span></small></span>' +
        (a.pts ? '<em class="sq-pp" aria-label="' + a.pts + ' puntos de mejora">+' + a.pts + '</em>' : '') + '</button>';
    });
    var ae0 = document.activeElement, pickF = ae0 && el.sqPick && el.sqPick.contains(ae0), pickKb = pickF && ae0.classList.contains('kf');
    if (el.sqPick && el.sqPick._h !== ph) { el.sqPick._h = ph; el.sqPick.innerHTML = ph; if (VB.Splat) VB.Splat.decorate(el.sqPick); if (pickF) { var pb = el.sqPick.querySelector('.sq-pk.on'); if (pb) focusEl(pb, pickKb); } }
    // insignias: «equipadas/huecos» en su pestaña
    if (sqTabs) {
      var items = sqItems(), a0 = d.a[sqSel];
      if (VB.Badges && a0) items.forEach(function (it) { if (it.id === 'bd') it.badge = VB.Badges.equipped(a0).length + '/' + VB.Badges.slots(a0); });
      var key = JSON.stringify(items.map(function (it) { return it.id + it.badge; }));
      if (sqTabs._k !== key) { sqTabs._k = key; sqTabs.refresh(items); }
    }
    var tab = sqTabs ? sqTabs.get() : 'g0', a = d.a[sqSel], i = sqSel, nd = P.need(a.lvl);
    // resumen en una línea (el dorsal, el rol y el nivel ya los dice el selector): media, experiencia y puntos de mejora
    var html = '<div class="sq-sum"><span class="sq-ovr">' + P.ovr(a.st) + '<small>MEDIA</small></span>' +
      '<div class="sq-xp"><span class="sq-xl">Nivel ' + a.lvl + '</span><span class="trk"><i style="width:' + Math.round(100 * a.xp / nd) + '%"></i></span>' + a.xp + ' / ' + nd + ' XP</div>' +
      '<div class="sq-pts' + (a.pts ? ' has' : '') + '">Puntos<b>' + a.pts + '</b></div></div>';
    if (tab === 'bd') html += '<div class="sq-pane">' + badgesHTML(a, i) + '</div>';
    else {
      var gr = P.GROUPS[+String(tab).slice(1)] || P.GROUPS[0];
      html += '<div class="sq-pane sq-attrs">';
      gr[1].forEach(function (k) {
        var v = a.st[k], c = P.cost(v), can = v < P.MAX && a.pts >= c;
        html += '<div class="sq-r' + (upKey === i + ':' + k ? ' up' : '') + '" title="' + (P.HINT[k] || '') + '"><span>' + P.LABEL[k] + '<small>' + (P.HINT[k] || '') + '</small></span><span class="bar"><i style="width:' + v + '%"></i></span><b>' + v + '</b>' +
          '<button data-i="' + i + '" data-up="' + k + '"' + (can ? '' : ' disabled') + ' aria-label="Mejorar ' + P.LABEL[k] + ' del ' + a.num + ' (' + c + (c === 1 ? ' punto' : ' puntos') + ')">' + (v >= P.MAX ? 'máx' : '+' + c) + '</button></div>';
      });
      html += '</div>';
    }
    // conserva el foco (botón «+» de un atributo o insignia) al repintar
    var ae = document.activeElement, fa = ae && ae.getAttribute && el.sqBody.contains(ae) ? (ae.getAttribute('data-up') ? 'data-up' : ae.getAttribute('data-bd') ? 'data-bd' : '') : '';
    var fsel = fa ? 'button[data-i="' + ae.getAttribute('data-i') + '"][' + fa + '="' + ae.getAttribute(fa) + '"]' : upKey ? 'button[data-i="' + upKey.split(':')[0] + '"][data-up="' + upKey.split(':')[1] + '"]' : '';
    var fkb = ae && ae.classList && ae.classList.contains('kf');
    el.sqBody.innerHTML = html;
    if (fsel) { var nb = el.sqBody.querySelector(fsel); if (nb && !nb.disabled) { focusEl(nb, fa ? fkb : true); if (fa === 'data-bd') badgeInfo(nb); } }
    if (!el.panel.hidden) { fitSheet(el.panel); checkMore(el.panel); }
    renderMenu();
  }
  /** Selector de atleta: elige el n.º 1 / n.º 2 (clic, toque, ←/→ con el foco en él). */
  function sqPick(i, kb) {
    var n = VB.Prog ? VB.Prog.get().a.length : 2; i = (i + n) % n; if (i === sqSel) return;
    var d = i > sqSel ? 1 : -1; sqSel = i; click(); renderSquad();
    restartAnim(el.sqBody, d > 0 ? 'tp-n' : 'tp-p');
    var b = el.sqPick && el.sqPick.querySelector('.sq-pk.on'); if (b && kb != null) focusEl(b, kb);
  }
  // ---------- Jugadores: insignias (js/badges.js) ----------
  function bdTile(a, i, b, eqList) {
    var B = VB.Badges, pr = B.progress(a, b.id), on = eqList.indexOf(b.id) >= 0;
    var sub = pr.lvl ? sepHTML([B.TIERS[pr.lvl].replace(/^./, function (c) { return c.toUpperCase(); }), pr.next != null ? pr.n + '/' + pr.next : 'máximo'], 'v')
      : pr.n + '/' + pr.next + ' ' + pr.unit;
    var aria = b.name + ', ' + (pr.lvl ? 'nivel ' + B.TIERS[pr.lvl] + (on ? ', equipada' : ', sin equipar') : 'bloqueada, ' + pr.n + ' de ' + pr.next + ' ' + pr.unit) + '. ' + b.desc + '.';
    return '<button class="bd-t l' + pr.lvl + (on ? ' eq' : '') + '" data-i="' + i + '" data-bd="' + b.id + '"' + (pr.lvl ? ' aria-pressed="' + on + '"' : '') + ' aria-label="' + aria + '">' +
      '<span class="bd-ic">' + b.icon + '</span><span class="bd-tx"><b>' + b.name + '</b><small>' + sub + '</small></span>' +
      '<span class="bd-pb"><i style="width:' + Math.round(pr.frac * 100) + '%"></i></span>' + (on ? '<em class="bd-on">EQUIPADA</em>' : '') + '</button>';
  }
  function badgesHTML(a, i) {
    var B = VB.Badges; if (!B) return '';
    var eq = B.equipped(a), sl = B.slots(a), h = '<p class="sq-g bd-h">Insignias <span>' + eq.length + '/' + sl + ' equipadas</span></p><div class="bd-grid">';
    B.LIST.forEach(function (b) { h += bdTile(a, i, b, eq); });
    return h + '</div><p class="bd-info" data-i="' + i + '" aria-live="polite">' + badgeHint(a) + '</p>';
  }
  function badgeHint(a) {
    var sl = VB.Badges.slots(a);
    return 'Elige una insignia desbloqueada para equiparla o quitarla. Huecos: ' + sl + (sl < 6 ? ' (uno más cada 5 niveles, hasta 6).' : ' (el máximo).');
  }
  /** Línea de detalle de la insignia enfocada o señalada (sin repintar el panel). */
  function badgeInfo(btn, msg) {
    if (!btn || !VB.Badges) return;
    var i = +btn.getAttribute('data-i'), a = VB.Prog.squad()[i], b = VB.Badges.BY[btn.getAttribute('data-bd')], info = el.sqBody.querySelector('.bd-info[data-i="' + i + '"]');
    if (!a || !b || !info) return;
    var T = ['Bronce', 'Plata', 'Oro'], fx = b.fx.map(function (f, k) { return '<span class="t' + (k + 1) + '">' + T[k] + '</span> ' + f; }); fx = sepHTML(fx, 'v', true);
    info.innerHTML = (msg ? '<strong class="warn">' + msg + '</strong> ' : '') + '<b>' + b.name + '</b>: ' + b.desc + '. ' + fx + '.<br><small>Se consigue: ' + b.cond.toLowerCase() + ' (' + b.th.join(' / ') + ' ' + b.unit[1] + ').</small>';
  }
  /** Novedades de insignias en la hoja final («¡Insignia nueva: Cañón (bronce)!»). */
  function endBadgesHTML(list) {
    if (!list || !list.length || !VB.Badges) return '';
    var h = '';
    list.forEach(function (u) {
      var b = VB.Badges.BY[u.id];
      h += '<span class="l' + u.lvl + '"' + (u.eq && !u.prev ? ' title="Equipada"' : '') + '><i class="bd-ic">' + (b ? b.icon : '') + '</i>N.º ' + u.num + ': <b>' + VB.Badges.label(u) + '</b></span>';
    });
    return '<div class="end-bd">' + h + '</div>';
  }
  // (partidillo de prueba de la Carrera: reiniciar o abandonar la gasta, así que los dos botones piden dos pulsaciones: quitArm)
  var restartArm = 0, restartTo = 0, quitArm = 0;
  function disarmRestart() {
    restartArm = 0; quitArm = 0; clearTimeout(restartTo);
    if (el.btnRestart && el.btnRestart.classList.contains('arm')) { el.btnRestart.classList.remove('arm'); el.btnRestart.textContent = isDrill() ? 'Reiniciar ejercicio' : isTrial() ? 'Reiniciar prueba' : 'Reiniciar partido'; }
    if (el.btnQuit && el.btnQuit.classList.contains('arm')) { el.btnQuit.classList.remove('arm'); el.btnQuit.textContent = isTrial() ? 'Abandonar la prueba' : 'Salir al menú'; }
  }
  /** ¿Partido en curso = partidillo de prueba de la Carrera? (main.js: reiniciar o abandonar resuelve la prueba como suspendida) */
  function isTrial() { var g = ctx && ctx.game; return !!(g && g.career && g.career.trial && !g.demo); }
  function armTxt(what) { return (device() === 'touch' ? 'Toca otra vez' : 'Pulsa otra vez') + (isTrial() ? ': pierdes la prueba' : ' para ' + what); }
  /** Pausa (UI-18): el antetítulo da el contexto («Set 1 · 24-10 · Normal»; «Mando desconectado» si se fue el mando) y en medio
   *  solo los sets (el set y el tanteo ya están arriba: nada repetido). */
  var padGone = false;
  function pauseKicker(g) {
    if (padGone) return 'Mando desconectado';
    if (g && g.drill && !g.demo) return gymKicker(g);   // E6: «Entrenamiento ◆ Saque 4/10 | 11 pts»
    var nm = VB.DIFF && g && VB.DIFF[g.difficulty] && VB.DIFF[g.difficulty].name;
    // «Set 1 | 24-10 ◆ Normal»: el set y el tanteo van juntos con la barra fina (datos del HUD) y el nivel tras el rombo; en la
    // Carrera, la nota en directo al final («◆ Nota 6,8»)
    var rs = rtSrc(g);
    var pk = [{ h: 'Set ' + g.setNo + SEP_V + g.score[0] + '-' + g.score[1] }, nm || OPT.difficulty.labels[optIndex('difficulty')]];
    if (rs && !rs.sc) pk.push('Nota ' + rtNum(+rs.v || 0));
    if (g && g.reto && !g.demo) pk.unshift('Reto del día');   // D1: «Reto del día ◆ Set 1 | 24-10 ◆ Difícil»
    return pk;
  }
  var SEP_V = '<span class="sep sep-v"><span class="sr">, </span></span>'; // barra vertical fina suelta (entre trozos ya en HTML)
  /** Trozo de antetítulo que no se parte por dentro (el salto, si hace falta, cae en el separador: «Platja Llarga ◆ / Nivel Normal»). */
  function nw(h) { return '<span class="nw">' + h + '</span>'; }
  /** SPLAT (17-nov-2026, notes/splat.md): en la pausa y en las hojas finales los rótulos de los botones se cambian con textContent
   *  (aquí, en main.js y en la Carrera: «Revancha» → «Siguiente jornada», «Pulsa otra vez para reiniciar»…), lo que se lleva la mancha
   *  o el parche de VB.Splat. spFix vuelve a envolver el texto (.sp-t; en el parche dentro de .sp-l) y a decorar; un MutationObserver
   *  por hoja lo llama solo cuando cambia algo (nada por frame). «Cambios» del 6v6 (#btnPSubs, se crea aparte) sale en turquesa. */
  function spFix(b) {
    if (!b || !b.classList || !VB.Splat) return;
    if (b.id === 'btnPSubs' && !b.classList.contains('sp-btn')) { b.classList.remove('ghost'); b.classList.add('sp-btn', 'sp-md', 'sp-teal'); b.setAttribute('data-shape', '2'); }
    var patch = b.classList.contains('sp-patch');
    if (!patch && !b.classList.contains('sp-btn')) return;
    var deco = false, lab = null;
    for (var n = b.firstElementChild; n; n = n.nextElementSibling) { if (n.classList.contains(patch ? 'sp-pp' : 'sp-blob')) deco = true; }
    lab = b.querySelector('.sp-t');
    if (deco && lab) { if (patch) spLen(b, lab.textContent); return; }
    var ic = b.querySelector(':scope>.sp-ic'), t = lab ? lab.textContent : b.textContent;
    b.classList.remove('sp-dec');
    b.innerHTML = patch ? '<span class="sp-l"><span class="sp-t"></span></span>' : '<span class="sp-t"></span>';
    if (ic) b.insertBefore(ic, b.firstChild);
    t = String(t || '').replace(/\s+/g, ' ').trim();
    b.querySelector('.sp-t').textContent = t;
    if (patch) spLen(b, t);
    VB.Splat.decorate(b);
  }
  /** Parche: letra según el largo del rótulo (--sp-n; el CSS la encoge con el ancho del parche: «Siguiente jornada» cabe entera). */
  function spLen(b, t) { var n = String(Math.max(6, String(t || '').trim().length)); if (b.style.getPropertyValue('--sp-n') !== n) b.style.setProperty('--sp-n', n); }
  function spSheets() {
    if (!VB.Splat) return;
    [el.pause, el.end, el.gymEnd].forEach(function (root) {
      if (!root) return;
      var L = root.querySelectorAll('button'); for (var i = 0; i < L.length; i++) spFix(L[i]);
      if (typeof MutationObserver === 'undefined') return;
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var t = ms[i].target; if (t && t.nodeType !== 1) t = t.parentNode;
          var b = t && t.closest ? t.closest('button') : null; if (b && root.contains(b)) spFix(b);
          var ad = ms[i].addedNodes;
          for (var j = 0; j < ad.length; j++) if (ad[j].nodeType === 1) { if (ad[j].tagName === 'BUTTON') spFix(ad[j]); else if (ad[j].querySelector && ad[j].querySelector('.sp-btn,.sp-patch')) VB.Splat.decorate(ad[j]); }
        }
      }).observe(root, { childList: true, subtree: true, characterData: true });
    });
    // (el desvanecido «hay más» de la hoja final se medía antes de llegar Rubik / Titan One y se quedaba puesto: se repasa al cambiar de alto)
    if (typeof ResizeObserver === 'function') { var ro = new ResizeObserver(function () { endMore(); }); [el.endSum, el.endStatsTab, el.endPlays].forEach(function (p) { if (p) ro.observe(p); }); }
  }
  function renderPause(g) {
    // E6: en un ejercicio no hay marcador; «Reiniciar ejercicio» y «Salir al entrenamiento»
    var dr = !!(g && g.drill && !g.demo);
    el.pause.classList.toggle('drill', dr);
    var tr = !dr && isTrial();
    el.btnRestart.textContent = dr ? 'Reiniciar ejercicio' : tr ? 'Reiniciar prueba' : 'Reiniciar partido';
    el.btnQuit.textContent = dr ? (g.careerDrill ? 'Volver a la Carrera' : 'Salir al entrenamiento') : tr ? 'Abandonar la prueba' : 'Salir al menú';   // (sesión de Carrera: sin gastarla)
    disarmRestart();
    // partidillo de prueba: el aviso, en una línea pequeña sobre los botones (la ficha de la prueba ya lo decía al empezar)
    if (!el.pWarn && tr) {
      var vl = el.pause.querySelector('.vlist');
      el.pWarn = document.createElement('p'); el.pWarn.className = 'p-warn'; el.pWarn.textContent = 'Si reinicias o abandonas, pierdes la prueba';
      if (vl && vl.parentNode) vl.parentNode.insertBefore(el.pWarn, vl);
    }
    if (el.pWarn) el.pWarn.hidden = !tr;
    el.pS0.textContent = g.score[0]; el.pS1.textContent = g.score[1];
    el.pMid.innerHTML = 'SETS<b>' + g.sets[0] + '-' + g.sets[1] + '</b>';
    if (el.pKick) setSep(el.pKick, pauseKicker(g), 'd');
    subsPauseBtn(g);
  }

  // ---------- Celebración previa a la pantalla final ----------
  // (ver «Flujo hasta la hoja final»: endFlow / endHoldTick / endSkip)
  function revealEnd() { endSkip(); }

  // ---------- Final ----------
  function showEnd(e) {
    var win = e.team === 0, T = stats.t;
    endAw = []; endBd = []; endAltName = '';
    var isNew = false, career = !!(ctx.game && ctx.game.career && !ctx.game.demo);
    var watch = !!(ctx.game && ctx.game.watch0 && !ctx.game.demo);   // 6v6 espectador: tampoco cuenta (g.watch0: el de verdad; g.watch también vale en el banquillo)
    // 6v6 con humano (sprint 3): tampoco. El récord (y con él el fin de los consejos a la 1ª victoria, el novato de main.js
    // isRookie y la guía del primer partido) es del 2 contra 2; el 6v6 lo arrastra su equipo IA
    var six = !!(ctx.game && ctx.game.size === 6 && !ctx.game.demo);
    // ONLINE (decisión 4 de Ferran): sin récord de Partido rápido, experiencia, perfil, insignias ni Vestuario; el récord online va aparte (fase 3)
    var online = !!(ctx.game && ctx.game.online) || !!ctx.net;
    if (!ctx.debug && !career && !watch && !six && !online) {   // los partidos de Carrera no cuentan para el récord de Partido rápido
      record.played++; if (win) { record.wins++; record.winRun++; } else record.winRun = 0;
      // los consejos del partido acompañan hasta la primera victoria; luego se apagan (se reactivan en Ajustes · Juego · Consejos)
      if (win && record.wins === 1 && ctx.settings.coachTips !== false) ctx.actions.setSetting('coachTips', false);
      if (T[0].best > record.bestStreak) { record.bestStreak = T[0].best; isNew = record.bestStreak >= 3; } // las rachas cortas no son récord
      if (ctx.game && ctx.game.sets) { record.lastA = ctx.game.sets[0] | 0; record.lastB = ctx.game.sets[1] | 0; record.lastD = String(ctx.game.difficulty || ''); }
      // B5: partidos ganados y perdidos por dificultad (solo 2v2 de Partido rápido: aquí ya no llegan Carrera, espectador ni 6v6)
      var dK = ctx.game && String(ctx.game.difficulty || ''); record.byD = cleanByD(record.byD);
      if (dK && (VB.DIFF_ORDER || ['easy', 'normal', 'hard', 'expert']).indexOf(dK) >= 0) { var bd = record.byD[dK] || [0, 0]; bd[win ? 0 : 1]++; record.byD[dK] = bd; }
      saveRecord();
    }
    // D2 (perfil): cada partido jugado de verdad suma XP de perfil (Partido rápido 2v2/6v6 y Carrera); nunca en depuración,
    // espectador, autopilot ni demo. El resultado {xp, lvl, lvlUp, prize} lo enseña la hoja de B6 (T19)
    profEnd = null;
    if (!ctx.debug && !watch && !online && ctx.game && !ctx.game.autopilot && !ctx.game.demo && VB.Profile && VB.Profile.noteMatch) {
      try {
        var pr = VB.Profile.noteMatch({ mode: career ? 'career' : six ? '6v6' : '2v2', win: win, setsWon: e.sets[0] | 0, diff: String(ctx.game.difficulty || ''), venue: VB.Arena && VB.Arena.map ? VB.Arena.map() : '' });
        if (pr) profEnd = { xp: pr.xp | 0, lvl: pr.lvl | 0, lvlUp: !!pr.lvlUp, prize: pr.prizeName || '' };
      } catch (er) { console.error('[VB][ERROR] Profile.noteMatch: ' + er); }
    }
    el.end.classList.toggle('win', win); el.end.classList.toggle('lose', !win);
    // (UI-18) antetítulo con contexto, sin repetir el título: «Palau del Mar · Nivel Normal · 3 sets»
    var endPts = (ctx.game && ctx.game.points) || 25, dn = VB.DIFF && ctx.game && VB.DIFF[ctx.game.difficulty] && VB.DIFF[ctx.game.difficulty].name;
    // «Palau del Mar ◆ Nivel Normal | Sets a 25»: la sede tras el rombo del antetítulo; nivel y puntos por set, datos con la barra fina
    // (móvil: «Sets a 25» en .ph-hide, el antetítulo cabe en una línea)
    setSep(el.endKicker, [{ h: nw(escT(venueName())) }, { h: nw('Nivel ' + escT(dn || OPT.difficulty.labels[optIndex('difficulty')])) + '<span class="ph-hide">' + SEP_V + nw((oneSet(ctx.game) ? 'Un set a ' : 'Sets a ') + endPts) + '</span>' }], 'd');
    var gNet = ctx.game && ctx.game.netCr;   // (online: el nombre del rival y «Online» en vez del nivel)
    if (gNet) setSep(el.endKicker, [{ h: nw(escT(venueName())) }, { h: 'Online' + '<span class="ph-hide">' + SEP_V + nw((ctx.game && ctx.game.bo1 ? 'Un set a ' : 'Sets a ') + endPts) + '</span>' }], 'd');
    el.endTitle.textContent = watch ? (win ? 'Gana el local' : 'Gana el visitante') : win ? '¡Victoria!' : gNet ? 'Gana ' + gNet.rivalName : 'Gana la CPU'; el.endTitle.classList.toggle('long', !!gNet && !win && gNet.rivalName.length > 11);
    el.endS0.textContent = e.sets[0]; el.endS1.textContent = e.sets[1];
    el.endSets.innerHTML = (e.setScores || []).map(function (s, i) {
      return '<span class="w' + (s[0] > s[1] ? 0 : 1) + '"><small>SET ' + (i + 1) + '</small>' + s[0] + '-' + s[1] + '</span>';
    }).join('');
    // ataque + bloqueo + saque + errores del rival = puntos (cada punto cuenta en una sola fila)
    var rows = [['Puntos', 'points'], ['Puntos de ataque', 'kills'], ['Puntos de bloqueo', 'blocks'], ['Aces', 'aces'], ['Errores del rival', 'oppErr'], ['Mejor racha', 'best']];
    // (UI-18: sin la cabecera «TÚ · CPU»: el resultado de arriba ya dice qué lado es cada uno y las cifras van en el color del equipo)
    var html = '';
    rows.forEach(function (r, i) {
      var a = T[0][r[1]], b = T[1][r[1]], m = Math.max(1, a, b);
      html += '<div class="st-r' + (i === 0 ? ' tot' : '') + '" style="animation-delay:' + (0.15 + i * 0.07).toFixed(2) + 's"><b>' + a + '</b><div class="mid"><div class="bar l"><i style="--w:' + (a / m * 100).toFixed(0) + '%"></i></div><div class="bar r"><i style="--w:' + (b / m * 100).toFixed(0) + '%"></i></div><em>' + r[0] + '</em></div><b>' + b + '</b></div>';
    });
    el.endStats.innerHTML = html;
    var rec = '<span>Jugada más larga: <b>' + stats.longest + ' toques</b></span>';
    if (career) rec += ambEndHTML(ctx.game);   // Ambiente de Carrera: tarjetas del partido
    // E1: lo que has usado de la maestría (usos), en una línea y solo si hay algo que contar
    var e1l = masteryLine(ctx.game); if (e1l && !watch) rec += '<span class="e1">' + e1l + '</span>';
    // (online, anti-trampas: las huellas de los dos lados no cuadraron al final → el récord lo apunta como «no válido»; aquí se dice por qué)
    var nrr = online && ctx.net && ctx.net.recRes;
    if (nrr && nrr.outcome && nrr.outcome.kind === 'unverified') rec += '<span class="new">No válido: las dos partidas no cuadraban al final. No cuenta en tu récord online.</span>';
    if (!ctx.debug && !career && !six && !online) rec += '<span>Partidos ganados: <b>' + record.wins + ' de ' + record.played + '</b></span>';
    var bs = record.bestStreak;
    if (isNew) rec += '<span class="new">¡Nueva mejor racha: ' + (bs === 1 ? '1 punto seguido' : bs + ' puntos seguidos') + '!</span>';
    else if (record.winRun > 1 && !career && !online) rec += '<span class="new">' + record.winRun + ' victorias seguidas</span>';
    // siguiente paso en un clic: tras ganar, revancha un nivel por encima; tras perder (salvo en Fácil), uno por debajo
    var di = optIndex('difficulty'), alt = win ? (di < OPT.difficulty.vals.length - 1 ? di + 1 : -1) : (di > 0 ? di - 1 : -1);
    if (!win && alt >= 0 && !career && !online) rec += '<span class="new">¿Te cuesta? Prueba el nivel <b>' + OPT.difficulty.labels[alt] + '</b></span>';
    el.btnAgainAlt.hidden = alt < 0;
    if (alt >= 0) { el.btnAgainAlt.textContent = 'Revancha en ' + OPT.difficulty.labels[alt]; el.btnAgainAlt.setAttribute('data-d', OPT.difficulty.vals[alt]); endAltName = OPT.difficulty.labels[alt]; }
    el.btnAgainAlt.setAttribute('data-short', alt >= 0 ? (alt > di ? 'Más difícil' : 'Más fácil') : '');   // (móvil: rótulo corto, CSS «SPLAT · PAUSA Y HOJA FINAL»)
    // (botones de siempre; el Resumen de B6 los vuelve a rotular según el caso: Carrera, reto, Partido rápido)
    el.btnAgain.textContent = 'Revancha'; el.btnAgain.setAttribute('data-act', 'again');
    if (el.btnEndOpts) { el.btnEndOpts.textContent = 'Cambiar opciones'; el.btnEndOpts.setAttribute('data-act', 'opts'); }
    el.btnMenu.textContent = 'Menú principal'; el.btnMenu.hidden = false;
    // «Cambiar opciones»: al menú, directo a la preparación del Partido rápido (dificultad, puntos, control, escenario). En la
    // Carrera no (main.js careerEndSheet esconde además «Revancha en…»); en el 6v6 espectador de pruebas (?format=6v6) tampoco
    var noOpts = !!career || !!(ctx.game && ctx.game.watch0);   // (6v6 humano, sprint 3: sí, vuelve a la preparación con Formato 6 contra 6)
    if (el.btnEndOpts) { el.btnEndOpts.hidden = noOpts; el.btnEndOpts.parentNode.setAttribute('data-n', String((alt >= 0 && !career ? 1 : 0) + (noOpts ? 0 : 1) + 1)); }
    // (partido de Carrera, g.career: la experiencia y las insignias de su atleta las reparte VB.Career.matchDone, no el escuadrón)
    // (6v6 de pruebas, ?format=6v6: tampoco reparte al escuadrón de 2v2)
    if (!ctx.debug && !online && VB.Prog && ctx.game && !ctx.game.autopilot && !ctx.game.career && ctx.game.size !== 6) {
      var dfk = ctx.game.difficulty, perP = [stats.p[0], stats.p[1]];
      var aw = VB.Prog.award(perP, { win: win, setsWon: e.sets ? e.sets[0] : 0, difficulty: dfk }), sqa = VB.Prog.get().a, xh = '';
      aw.forEach(function (r, i) {
        xh += '<span>N.º ' + sqa[i].num + ': <b>+' + r.xp + ' XP</b>' + (r.lvlUp ? ' <span class="lv">¡NIVEL ' + r.lvl + '! +' + r.pts + ' puntos</span>' : '') + '</span>';
        // (B6: lo mismo para el bloque «Progreso» del Resumen, con la barra de nivel)
        endAw.push({ num: sqa[i].num, xp: r.xp | 0, lvl: r.lvl | 0, lvlUp: !!r.lvlUp, pts: r.pts | 0, cur: sqa[i].xp | 0, need: VB.Prog.need ? VB.Prog.need(sqa[i].lvl) : 0 });
      });
      endBd = VB.Badges ? VB.Badges.endMatch(ctx.game, win) || [] : [];
      if (!VB.Recap) { rec += '<div class="end-xp">' + xh + '</div>'; rec += endBadgesHTML(endBd); }   // (sin recap.js: como antes)
    }
    el.endRecord.innerHTML = rec;
    if (el.btnMStats) el.btnMStats.hidden = !(VB.MatchStats && VB.MatchStats.ready && VB.MatchStats.ready());   // «Estadística del partido»
    if (el.btnActa) { el.btnActa.hidden = !(actaOk && VB.Acta && VB.MatchStats && VB.Acta.available(VB.MatchStats.data())); actaLbl(''); }   // «Acta del partido» (6v6)
    placeMStats();
    // MVP de cada equipo (UI-11). UI-18: una tabla pequeña: un solo rótulo «MVP», la cabecera «Ataque · Bloqueo · Saque» una vez y en
    // cada fila el dorsal, los puntos (la cifra grande) y su desglose; el lector de pantalla oye la frase entera (aria-label).
    var mv = '', nMv = 0;
    for (var tm = 0; tm < 2; tm++) {
      var best = null;
      for (var id in stats.p) { var q = stats.p[id]; if (q.team !== tm) continue; if (!best || q.pts > best.pts || (q.pts === best.pts && (q.kills > best.kills || (q.kills === best.kills && q.blocks > best.blocks)))) best = q; }
      if (!best || !best.pts) continue;
      var aria = 'MVP ' + (tm === 0 ? 'de tu equipo' : 'de la CPU') + ', dorsal ' + best.num + ': ' + best.pts + (best.pts === 1 ? ' punto' : ' puntos') + ' (' + best.kills + ' de ataque, ' + best.blocks + ' de bloqueo, ' + best.aces + (best.aces === 1 ? ' ace' : ' aces') + ')';
      var cell = function (v) { return '<b' + (v ? ' data-cu="' + v + '"' : ' class="z"') + '>' + v + '</b>'; };
      mv += '<div class="mvp t' + tm + '" data-pid="' + best.id + '" role="group" aria-label="' + aria + '"><span class="mvp-n" aria-hidden="true">' + best.num + '</span>' +
        '<strong aria-hidden="true"><i data-cu="' + best.pts + '" class="mvp-pts">' + best.pts + '</i></strong>' + cell(best.kills) + cell(best.blocks) + cell(best.aces) + '</div>';
      nMv++;
    }
    el.endMvp.innerHTML = nMv ? '<span class="mvp-h" aria-hidden="true">MVP</span><div class="mvp-cols" aria-hidden="true"><span></span><span></span><span>Ataque</span><span>Bloqueo</span><span>Saque</span></div>' + mv : '';
    el.endMvp.classList.toggle('two', nMv > 1);
    // B6: el Vestuario de Partido rápido (récord, Entrenamiento, retos y nivel de perfil) se concede ya, sin aviso, para enseñarlo en
    // el Resumen (el aviso del menú, lkCheckNew, ya no lo repite). En la Carrera lo concede VB.Career.matchDone
    if (!ctx.debug && !career && !watch && !online && ctx.game && !ctx.game.autopilot && !ctx.game.demo) lookGrantNow();
    endRecap(e, ctx.game, null, null);
    shown = '';
  }
  // =====================================================================
  //  B6 (sprint 2-4, spec S2-B4B5B6 §2.3): la hoja final como resumen de jornada
  // =====================================================================
  // Pestañas Resumen | Estadísticas | Jugadas (n) en #endTabs. Resumen (#endSum.rc) = bloques en orden fijo con su etiqueta .rc-h, del
  // modelo puro VB.Recap.endModel(d); Estadísticas (#endStatsTab) = lo de siempre (MVP de los dos, barras, récord); «Jugadas» solo con
  // jugadas de VB.Replay (la rellena la integración de las repeticiones). Partido rápido y retos: endRecap desde showEnd. Carrera:
  // main.js llama a VB.UI.endCareer(sum, g, x) tras VB.Career.matchDone, en el mismo frame y después de showEnd, y se repinta.
  // Sin js/recap.js: sin pestañas, la hoja de antes.
  var endAw = [], endBd = [], endAltName = '', unl0 = null, recapM = null, recapD = null, endTabsApi = null, endTab = 'sum', endRcSnd = null;
  var RC_MED = ['', 'bronce', 'plata', 'oro'];
  /** Concede ya lo que se gana fuera de la Carrera (VB.Look.checkGlobal: Entrenamiento, récord, retos, nivel de perfil). Ids, sin aviso. */
  function lookGrantNow() {
    var Lk = LK(); if (!Lk || !Lk.checkGlobal) return [];
    var gym = {}, gymN = 0, Gm = VB.Gym;
    try {
      ['serve', 'recv', 'set', 'atk', 'block'].forEach(function (id) { var r = Gm && Gm.get ? Gm.get(id) : null; gym[id] = r ? Math.max(0, Math.min(3, r.m | 0)) : 0; });
      gymN = Gm && Gm.count ? Gm.count() | 0 : 0;
    } catch (e) { }
    try { return Lk.checkGlobal({ gym: gym, gymN: gymN, rec: { wins: record.wins | 0, played: record.played | 0, streak: record.bestStreak | 0 } }) || []; } catch (e) { return []; }
  }
  /** Lo nuevo del Vestuario en este partido: unseen() ahora menos el de al empezar (&unl=n en depuración: los n primeros del catálogo). */
  function endUnlocks() {
    if (ctx.debug && ctx.params.unl) { var C = VB.Look && VB.Look.CATALOG || []; return C.slice(0, Math.max(0, +ctx.params.unl | 0)).map(function (it) { return it.id; }); }
    if (!unl0) return [];
    var was = {}; unl0.forEach(function (id) { was[id] = 1; });
    return lkUnseen().filter(function (id) { return !was[id]; });
  }
  function replayN() { if (ctx.settings && ctx.settings.replays === 'off') return 0; try { return VB.Replay && VB.Replay.bestCount ? VB.Replay.bestCount() | 0 : 0; } catch (e) { return 0; } }
  /** Datos de la hoja para VB.Recap.endModel (los de headline más los del Resumen). x = extras de la Carrera (main.js). */
  function endData(e, g, sum, x) {
    var pl = [], id, cs = g && g.career && !g.demo ? g.career : null;
    for (id in stats.p) pl.push(stats.p[id]);
    // (tu equipo primero, en orden estable: con empate a puntos, el MVP del Resumen es el tuyo, como en offline. En el online del
    //  invitado los ids del anfitrión van antes y, sin esto, el empate se lo llevaba el rival)
    pl = pl.map(function (q, i) { return { q: q, i: i }; }).sort(function (a, b) { return ((a.q.team | 0) - (b.q.team | 0)) || (a.i - b.i); }).map(function (o) { return o.q; });
    var mo = stats.moments.slice(); if (stats.rallyM) mo.push(stats.rallyM); if (stats.streakM) mo.push(stats.streakM);
    var d = { seed: (g && g.seed) >>> 0, win: e.team === 0, sets: [e.sets[0] | 0, e.sets[1] | 0], setScores: (e.setScores || (g && g.setScores) || []).map(function (s) { return [s[0] | 0, s[1] | 0]; }),
      to: (g && g.points) || 25, size: (g && g.size) || 2, career: cs, cpu: g && g.netCr ? 'el rival' : 'la CPU', pl: pl, spSaved: stats.spSaved.slice(), moments: mo, close: stats.close,
      longest: stats.longest, watch: !!(g && g.watch0 && !g.demo), drill: false, reto: g && g.reto && !cs ? g.reto : null, plays: replayN(), unlocks: endUnlocks(),
      profile: profEnd || null };
    if (cs) {
      d.sum = sum || null; x = x || {};
      if (x.tbl) d.table = { rows: x.tbl, myId: x.myId, pos0: cs.pos0 | 0, shortOf: function (k) { return x.short && x.short[k] || ''; } };
      d.first = !!cs.first; d.next = x.next || 'league'; d.phase = sum && sum.phase; d.pos = x.pos | 0; d.bar = x.bar || null;
      var lb = sum && sum.life && sum.life.boss;
      if (lb && (lb.nick || lb.name)) d.boss = { nick: lb.nick || lb.name, win: !!lb.win, h2h: lb.h2h || null };
      d.train = trainLine(sum, x.ses);
    } else {
      d.aw = endAw.slice(); d.badges = endBd.slice(); d.altDiffName = endAltName;
    }
    var re = retoEnd;
    if (re && ((re.up && re.up.length) || (re.xp && !cs))) d.retos = { pills: (re.up || []).map(function (u) { return { name: u.name, lvl: u.lvl | 0, nw: !(u.prev | 0) }; }), xp: cs ? 0 : re.xp | 0 };
    return d;
  }
  /** Entreno de la semana (sesiones de main antes del partido y mejoras del entreno semanal): «2 sesiones de 3 | +1 Recepción». */
  function trainLine(sum, ses) {
    var a = [], LB = VB.Prog && VB.Prog.LABEL || {};
    if (ses && (ses.used | 0) > 0) a.push((ses.used | 0) + ((ses.used | 0) === 1 ? ' sesión' : ' sesiones') + ' de ' + ((ses.max | 0) || 3));
    var gn = sum && sum.train && sum.train.gains || [];
    for (var i = 0; i < gn.length && i < 2; i++) a.push('+1 ' + (LB[gn[i]] || gn[i]));
    return a.join(' | ');
  }
  /** Pinta la hoja con el modelo de B6 (Partido rápido, reto, Carrera; el espectador 6v6 se queda con las estadísticas). */
  // 568×320 (.ph-s): «Estadística del partido», pegatina con el icono en la fila de las pestañas (fuera del panel que se desplaza:
  // su desvanecido la recortaba); en el resto, otra vez en su sitio, delante del acta. CSS: index.html «(carrera, 18-nov-2026)».
  // Lo llaman el final del partido y «vb:tier» (la barra del navegador cruza 345 de alto con el final abierto).
  function placeMStats() {
    if (!el.btnMStats) return;
    var msHome = $('endStatsTab') && $('endStatsTab').querySelector('.end-ms'), msBody = el.end && el.end.querySelector('.end-body');
    // (en .end-body dentro de su propio [data-nav] (display:contents): si no, el teclado y el mando no llegaban a él)
    var msPh = msBody && msBody.querySelector('.end-ms-ph');
    if (msBody && !msPh) { msPh = document.createElement('span'); msPh.className = 'end-ms-ph'; msPh.setAttribute('data-nav', ''); msPh.setAttribute('data-sp-row', ''); msBody.appendChild(msPh); }
    var msTo = document.documentElement.classList.contains('ph-s') ? msPh : msHome;
    if (msTo && el.btnMStats.parentNode !== msTo) msTo.insertBefore(el.btnMStats, msTo === msHome ? msHome.firstChild : null);
  }
  function endRecap(e, g, sum, x) {
    recapM = null; recapD = null; endRcSnd = null;
    var R = VB.Recap, watch = !!(g && g.watch0 && !g.demo);
    if (!R || !R.endModel || !el.endSum) { endPanes(['stats'], 'stats', true); return; }
    var d = endData(e, g, sum, x), M = null;
    try { M = R.endModel(d); } catch (er) { console.error('[VB][ERROR] Recap.endModel: ' + er); M = null; }
    if (!M) { endPanes(['stats'], 'stats', true); return; }
    recapM = M; recapD = d;
    var cs = d.career;
    // antetítulo y título: los de la Carrera (competición y «Gana el …») y del reto del día; Partido rápido, los de showEnd
    if (cs) { setSep(el.endKicker, M.kicker, 'd'); el.endTitle.textContent = M.title; el.endTitle.classList.toggle('long', String(M.title).length > 16); }   // «Gana el Litoral Puertoluz Marina»: a dos líneas, más pequeño
    else if (d.reto) {
      var dn = VB.DIFF && g && VB.DIFF[g.difficulty] && VB.DIFF[g.difficulty].name;
      // (móvil: sin «Nivel …», que partía la sede en dos líneas y quedaba bajo el sello)
      setSep(el.endKicker, [{ h: nw('Reto del día') }, { h: nw(escT(venueName())) + '<span class="ph-hide">' + SEP_V + nw('Nivel ' + escT(dn || '')) + SEP_V + nw('Sets a ' + ((g && g.points) || 25)) + '</span>' }], 'd');
    }
    el.endSum.innerHTML = watch ? '' : rcHTML(M, d);
    endSeal(!watch && d.reto && retoEnd && retoEnd.day ? retoEnd.day : null);   // (SPLAT: reto del día → sello dorado junto al título)
    renderPlays(watch ? 0 : d.plays | 0);
    if (!watch) endButtons(M);
    if (ctx.net) { onlineEndButtons(); onlineEndRec(); }
    var tabs = watch ? ['stats'] : M.tabs, q = ctx.debug && ctx.params.tab;
    endPanes(tabs, q === 'stats' && tabs.indexOf('stats') >= 0 ? 'stats' : q === 'plays' && tabs.indexOf('plays') >= 0 ? 'plays' : tabs[0], watch, M.tabLabels);
    // sonidos de la entrada escalonada (a los 700 ms la flecha de la tabla, a los 800 ms el desbloqueo): al verse la hoja (syncScreens)
    endRcSnd = { rank: M.table && M.table.move ? M.table.move.d | 0 : 0, unl: !!M.unlocks };
  }
  /** SPLAT: hoja final del reto del día → sello dorado (.sp-stamp, decorativo) junto al título con la medalla de hoy (la mejor del
   *  día); el detalle sigue en el bloque «Reto del día» del Resumen. Sin reto, escondido. */
  function endSeal(day) {
    var hd = el.end && el.end.querySelector('.end-hd'); if (!hd) return;
    var s = hd.querySelector('.end-seal');
    hd.classList.toggle('has-seal', !!day);
    if (!day) { if (s) s.hidden = true; return; }
    var m = Math.max(0, Math.min(3, Math.max(day.best | 0, day.medal | 0)));
    if (!s) { s = document.createElement('span'); s.className = 'sp-stamp end-seal'; s.setAttribute('data-ring', 'RETO DEL DÍA ★ RETO DEL DÍA ★'); s.setAttribute('aria-hidden', 'true'); hd.appendChild(s); }
    s.hidden = false; s.classList.toggle('sp-new', !!(day.newMedal && day.medal));
    var inner = '<span class="sp-sc">' + (m ? '<i class="sc-med t' + m + '"></i>' : (VB.Splat ? VB.Splat.BALL : '')) + '<b>' + ['Hoy', 'Bronce', 'Plata', 'Oro'][m] + '</b></span>';
    var sc = s.querySelector('.sp-sc'); if (sc) sc.outerHTML = inner; else s.insertAdjacentHTML('beforeend', inner);
    if (VB.Splat) VB.Splat.decorate(s);
  }
  // =====================================================================
  //  S3-C1: repeticiones (VB.Replay, js/replay.js): capa de la repetición y pestaña «Jugadas (n)» (R10)
  // =====================================================================
  // Durante la repetición (#app.replay, solo con los módulos pintando la sombra: Replay.runner()) se tapan marcador, guía, consejos,
  // sellos, cintas, challenge y mandos táctiles; se ven la mosca «REPETICIÓN» (#rpBug), el rótulo inferior (#rpCap: título, «1 de 3»,
  // frase y datos de VB.Replay.info()) y la pista de saltar (#rpSkip; en mejores jugadas, «Siguiente» y «Salir»). Lector de pantalla:
  // #rpAria (aria-live) con info().aria al empezar cada jugada y «Fin de la repetición» al salir. Saltar: main.js lee el mando y el
  // teclado (VB.Input) y ui.js el toque (ctx.replaySkipReq; 'all' = «Salir»). Cero basura por frame: el DOM solo se toca si cambia
  // la jugada, el dispositivo o la cámara lenta.
  var rpv = { on: false, kind: '', i: -1, n: -1, dev: '', slow: false }, rpBack = false, rpFocus = '', rpKb = false;
  var RP_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  function rpApi() { return VB.Replay && VB.Replay.info ? VB.Replay : null; }
  /** Cortinilla de la repetición (VB.Replay la llama al entrar, entre jugadas y al salir): false si ya hay una (Replay sigue sin ella). */
  function replayWipe(cb) { return wipeRun(2, cb); }
  function rpSkipHTML(inf, dev) {
    var nx = inf.kind === 'best' && inf.i + 1 < inf.n, w = nx ? 'Siguiente' : 'Saltar', best = inf.kind === 'best';
    if (dev === 'touch') return 'Toca para ' + (nx ? 'ver la siguiente' : 'saltar');
    if (dev === 'gamepad') return padKey('a') + w + (best ? '<span class="rp-gap"></span>' + padKey('b') + 'Salir' : '');
    return '<span class="key">Intro</span>' + w + (best ? '<span class="rp-gap"></span><span class="key">Esc</span>Salir' : '');
  }
  function rpTick() {
    var R = rpApi(), vis = !!(R && ctx.replay && R.runner && R.runner());
    if (vis !== rpv.on) {
      rpv.on = vis; rpv.kind = ''; rpv.i = rpv.n = -1;
      el.app.classList.toggle('replay', vis);
      if (el.rpBug) el.rpBug.hidden = !vis;
      if (el.rpCap) el.rpCap.hidden = !vis;
      if (el.rpSkip) el.rpSkip.hidden = !vis;
      if (!vis && el.rpAria && R && R.TXT) el.rpAria.textContent = R.TXT.end;
      if (vis) { hideBanner(); if (bugT > 0) hideBug(false); }
    }
    if (!vis || !el.rpCap) return;
    var inf = R.info(); if (!inf) return;
    var dev = device();
    if (inf.kind !== rpv.kind || inf.i !== rpv.i || inf.n !== rpv.n) {
      rpv.kind = inf.kind; rpv.i = inf.i; rpv.n = inf.n; rpv.dev = '';
      el.rpCap.className = 'rp-' + inf.kind; rpv.slow = false;
      el.rpTitle.textContent = inf.title || '';
      el.rpPill.hidden = !inf.pill; el.rpPill.textContent = inf.pill || '';
      el.rpPhrase.textContent = inf.phrase || '';
      setSep(el.rpSub, String(inf.sub || '').split(' | '), 'v');
      if (el.rpAria) el.rpAria.textContent = inf.aria || '';
      void el.rpCap.offsetWidth; el.rpCap.classList.add('in');   // (entrada del rótulo en cada jugada)
    }
    if (dev !== rpv.dev) {
      rpv.dev = dev;
      el.rpSkipT.innerHTML = rpSkipHTML(inf, dev);
      if (el.rpExit) el.rpExit.hidden = !(dev === 'touch' && inf.kind === 'best');
    }
    if (inf.slow !== rpv.slow) { rpv.slow = inf.slow; el.rpCap.classList.toggle('slow', inf.slow); }
  }
  /** Fin de las jugadas vistas desde la hoja (onEnd de VB.Replay.playBest): la hoja vuelve sola (syncScreens con ctx.replay null) y
   *  el foco va al «Ver» pulsado (focusLayer con rpFocus). */
  function replayDone() { shown = ''; if (ctx.game) syncScreens(ctx.game); }
  /** Pestaña «Jugadas (n)» de la hoja final: filas de VB.Replay.list() (frase y set/marcador) con «Ver» y, con más de una, «Verlas todas». */
  function renderPlays(n) {
    if (!el.endPlays) return;
    var L = [];
    if (n > 0) { try { L = VB.Replay && VB.Replay.list ? VB.Replay.list() : []; } catch (e) { L = []; console.error('[VB][ERROR] Replay.list: ' + e); } }
    if (!L.length) { el.endPlays.innerHTML = ''; return; }
    var h = '<p class="pl-h">Las mejores jugadas del partido</p><ol class="pl-list" data-nav>';
    L.forEach(function (p) {
      h += '<li class="pl-row t' + (p.team === 1 ? 1 : 0) + '"><span class="pl-n" aria-hidden="true">' + (p.i + 1) + '</span><span class="pl-tx"><b>' + escT(p.phrase) + '</b><small>' +
        sepHTML(String(p.sub || '').split(' | '), 'v') + '</small></span><button class="sp-btn sp-sm sp-cream sp-calm pl-go" data-shape="' + p.i + '" data-play="' + p.i + '" aria-label="Ver la jugada ' + (p.i + 1) + ': ' + escT(p.phrase) + '"><span class="sp-ic">' + RP_PLAY + '</span><span class="sp-t">Ver</span></button></li>';
    });
    h += '</ol>';
    if (L.length > 1) h += '<div class="pl-all" data-nav><button class="sp-btn sp-sm sp-gold" data-shape="2" data-play="all" aria-label="Ver las ' + L.length + ' jugadas seguidas"><span class="sp-ic">' + RP_PLAY + '</span><span class="sp-t">Verlas todas</span></button></div>';
    el.endPlays.innerHTML = h;
    if (VB.Splat) VB.Splat.decorate(el.endPlays);   // (SPLAT: «Ver» en pegatina crema, «Verlas todas» en oro)
  }
  function playsClick(ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-play]') : null; if (!b || !el.endPlays.contains(b)) return;
    var k = b.getAttribute('data-play');
    rpFocus = k; rpKb = ev.detail === 0 || kbNow();
    click();
    if (!(ctx.actions.playBest && ctx.actions.playBest(k === 'all' ? undefined : +k))) rpFocus = '';
  }
  // =====================================================================
  //  Estadística del partido (js/matchstats.js, al estilo de la pantalla Estadísticas de emPatData): el registro va en onEvents /
  //  ingest / netTally (msIngest); el cálculo y la pantalla, SOLO al pulsar «Estadística del partido» en la pestaña «Estadísticas» de
  //  la hoja final. Panel general (#panel con .sheet.ms): pestañas Equipo A / Equipo B (Q/E, LB/RB), «Partido | Set 1…» (←/→),
  //  anclas de sección y la tabla por jugador enfocables con ↑/↓ (←/→ la desplazan), Volver / Esc / B a la hoja con el foco en el botón.
  // =====================================================================
  var ms = { pn: null, tabs: null, team: 0, set: 0, cache: {}, nm: null }, msReq = null;
  function msIngest(e, g) {
    var M = VB.MatchStats; if (!M || !M.ingest) return;
    try { M.ingest(e, g); } catch (er) { if (!msIngest.bad) { msIngest.bad = true; console.error('[VB][ERROR] MatchStats.ingest: ' + er); } }
  }
  function msDom() {
    if (ms.pn) return true;
    var host = el.panel && el.panel.querySelector('.sheet'); if (!host) return false;
    var pn = ms.pn = document.createElement('div'); pn.id = 'pnMstats'; pn.hidden = true;
    pn.innerHTML = '<div class="ms-top"><div id="msTabs" class="sp-tabs"></div><div class="ms-sets" data-nav id="msSets" role="group" aria-label="Qué parte del partido"></div></div>' +
      '<div id="msBody" data-nav></div><p class="ms-foot">Estadística al estilo emPatData</p>';
    host.appendChild(pn);
    PANELS.mstats = ['pnMstats', '', 'Estadística del partido'];
    $('msSets').addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button[data-set]') : null; if (!b) return;
      msSet(+b.getAttribute('data-set'), ev.detail === 0 || kbNow());
    });
    return true;
  }
  /** Nombres de los equipos: [para títulos y pestañas], [dentro de una frase]. */
  function msNames(g) {
    var cr = g && !g.demo && (g.career || (g.watch0 && WATCH_CR) || g.netCr);
    var pn = {};   // Carrera de 2v2: tu atleta y tu pareja con su nombre (la sim solo lleva el dorsal)
    if (g && g.career && !g.demo) { var cs = g.career; if (cs.player && cs.num) pn['0:' + cs.num] = cs.player; if (cs.mate && cs.mateNum) pn['0:' + cs.mateNum] = cs.mate; }
    if (cr && (cr.meName || cr.rivalName)) {
      var a = cr === WATCH_CR ? ['Equipo local', 'Equipo visitante'] : [cr.meName || cr.me || 'Tu equipo', cr.rivalName || cr.rival || 'Rival'];
      return { names: a, inl: cr === WATCH_CR ? ['el equipo local', 'el equipo visitante'] : a, pn: pn };
    }
    return { names: ['Tu equipo', 'CPU'], inl: ['tu equipo', 'la CPU'], pn: pn };
  }
  function msModel(set) { var M = VB.MatchStats; return ms.cache[set] || (ms.cache[set] = M.compute(M.data(), set)); }
  function msSetsHTML() {
    var M0 = msModel(0), sw = [0, 0];
    M0.setScores.forEach(function (sc) { sw[sc[0] > sc[1] ? 0 : 1]++; });
    var b = function (id, k, v, cls) {
      var on = ms.set === id;
      return '<button type="button" data-set="' + id + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '"><small>' + k + '</small><span class="' + cls + '">' + v + '</span></button>';
    };
    var h = b(0, 'Partido', sw[0] + '-' + sw[1], '');
    M0.sets.forEach(function (s, i) { var sc = M0.setScores[i]; h += b(s, 'Set ' + s, sc[0] + '-' + sc[1], 'w' + (sc[0] > sc[1] ? 0 : 1)); });
    return h;
  }
  function msRender() {
    var M = VB.MatchStats; if (!M || !ms.pn) return;
    ms.pn.setAttribute('data-team', String(ms.team));
    $('msSets').innerHTML = msSetsHTML();
    var html = '';
    try { html = M.html(msModel(ms.set), ms.team, { names: ms.nm.names, inl: ms.nm.inl, pnames: ms.nm.pn, sep: sepHTML, you: 'Tú' }); }
    catch (er) { console.error('[VB][ERROR] MatchStats.html: ' + er); html = '<p class="ms-empty">No se ha podido calcular la estadística.</p>'; }
    $('msBody').innerHTML = html;
    if (VB.Splat && VB.Splat.info) VB.Splat.info($('msBody'));   // «i» de «Cifras clave» en el móvil (un escuchador por raíz)
  }
  function msSet(s, kb) {
    var M0 = msModel(0); if (s && M0.sets.indexOf(s) < 0) s = 0;
    if (s === ms.set) return;
    ms.set = s; uiK('tab', 'click');
    msRender();
    var nb = $('msSets').querySelector('[data-set="' + s + '"]'); if (nb) focusEl(nb, !!kb);
    if (nb && nb.scrollIntoView) try { nb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
  }
  /** ←/→ en el panel: sets vecinos (sin dar la vuelta) o desplazar la tabla. true = consumido. */
  function msArrow(a, d) {
    if (a.hasAttribute('data-set') && ms.pn && ms.pn.contains(a)) {
      var L = [0].concat(msModel(0).sets), i = L.indexOf(+a.getAttribute('data-set')), j = i + (d > 0 ? 1 : -1);
      if (j < 0 || j >= L.length) { uiSound2('arrowEdge', d); return true; }
      msSet(L[j], true); return true;
    }
    if (a.classList && a.classList.contains('ms-tb')) { a.scrollLeft += (d > 0 ? 1 : -1) * Math.max(120, a.clientWidth * 0.6); return true; }
    return false;
  }
  // =====================================================================
  //  Acta del partido (js/acta.js, solo 6v6): el acta en el formato de emPat. En GitHub Pages el juego y emPat comparten origen
  //  (purupurpito.github.io), así que se guarda directamente en el almacén de emPat (clave empat/acta/<id>) y se abre emPat con
  //  ?acta=<id>; fuera de Pages (o si el navegador no deja), se descarga el .json para importarlo desde la portada de emPat.
  // =====================================================================
  var ACTA_LBL = 'Acta del partido', actaT = 0;
  // De momento NO es público (Ferran, 17-nov-2026): el botón solo sale con la cuenta de Ferran. En el código va el SHA-256 del correo
  // (el repo es público: el correo no se escribe), comparado con VB.Account.user() (correo en minúsculas en las cuentas de correo y
  // Google). actaOk se recalcula al entrar o salir de la cuenta.
  var ACTA_ALLOW = ['c0592685221ed4a093808f6d3f8a863be6f6d4a1894b00b91e90b07719048deb'], actaOk = false;
  function actaCheck() {
    var A = VB.Account, u = A && A.user ? String(A.user() || '').trim().toLowerCase() : '';
    if (!u || u.indexOf('@') < 0 || !(window.crypto && crypto.subtle && window.TextEncoder)) { actaOk = false; actaVis(); return; }
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(u)).then(function (b) {
      var h = Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
      actaOk = ACTA_ALLOW.indexOf(h) >= 0; actaVis();
    }, function () { actaOk = false; actaVis(); });
  }
  function actaVis() { if (el.btnActa && !actaOk) el.btnActa.hidden = true; }
  function actaLbl(t) {
    var b = el.btnActa; if (!b) return;
    var sp = b.querySelector('.sp-t') || b.querySelector('span'); if (sp) sp.textContent = t || ACTA_LBL;   // (SPLAT: el rótulo, no el icono)
    clearTimeout(actaT); if (t) actaT = setTimeout(function () { actaLbl(''); }, 3500);
  }
  /** Datos del acta: en la Carrera, la competición (el rótulo de la jornada), quién juega en casa, capitanes y líberos (career.js). */
  function actaMeta(g) {
    var nm = msNames(g), cs = g && !g.demo && g.career, ca = (cs && cs.acta) || {};
    var comp = cs && cs.label ? cs.label : g && g.online ? 'Online' : g && g.watch0 ? 'Partido de la jornada' : 'Partido rápido';
    return { names: nm.names, atHome: cs && cs.atHome === false ? false : true, capt: ca.capt, lib: ca.lib, competition: comp,
      venue: venueName(), seed: g ? g.seed | 0 : 0, now: Date.now() };
  }
  function openActa() {
    if (!actaOk) return;
    var A = null;
    try { A = VB.Acta.build(VB.MatchStats.data(), actaMeta(ctx.game)); } catch (er) { console.error('[VB][ERROR] Acta.build: ' + er); }
    if (!A) { actaLbl('No se ha podido hacer el acta'); return; }
    var json = JSON.stringify(A);
    if (location.hostname === 'purupurpito.github.io') {
      try {
        localStorage.setItem('empat/acta/' + A.id, json);
        var w = window.open('/emPat/?acta=' + encodeURIComponent(A.id), '_blank');
        if (w) { actaLbl('Acta abierta en emPat'); srSay('Acta abierta en emPat, en otra pestaña'); return; }
        actaLbl('Acta guardada: está en la portada de emPat'); srSay('Acta guardada en emPat'); return;
      } catch (e) { }
    }
    try {
      var a = document.createElement('a'), u = URL.createObjectURL(new Blob([JSON.stringify(A, null, 1)], { type: 'application/json' }));
      a.href = u; a.download = 'acta-' + A.info.date + '-' + A.info.time.replace(':', '') + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      actaLbl('Acta descargada: impórtala en emPat'); srSay('Acta descargada');
    } catch (e2) { actaLbl('No se ha podido guardar el acta'); }
  }
  /** Abre la pantalla (botón de la hoja final o escena debug=stats; o = {set, team}). */
  function openMStats(o) {
    var M = VB.MatchStats; if (!M || !M.ready || !M.ready() || !msDom()) return false;
    o = o || {};
    ms.cache = {}; ms.nm = msNames(ctx.game);
    ms.team = o.team === 1 ? 1 : 0;
    var s = +o.set | 0; ms.set = s && msModel(0).sets.indexOf(s) >= 0 ? s : 0;
    var items = [0, 1].map(function (t) { return { id: 't' + t, label: escT(ms.nm.names[t]), icon: '<i class="ms-dot" aria-hidden="true"></i>', cls: 'ms-t' + t }; });
    var cur = 't' + ms.team;
    if (!ms.tabs) ms.tabs = makeTabs($('msTabs'), items, { value: cur, label: 'Equipo', pane: $('msBody'), onChange: function (id) { ms.team = id === 't1' ? 1 : 0; msRender(); } });
    else { ms.tabs.refresh(items); ms.tabs.set(cur, 'api'); }
    msRender();
    openPanel('mstats', { from: ctx.state });
    ms.tabs.hint();
    // antetítulo: el resultado («Tu equipo 2-1 CPU»), el título dice qué es
    var M0 = msModel(0), sw = [0, 0]; M0.setScores.forEach(function (sc) { sw[sc[0] > sc[1] ? 0 : 1]++; });
    el.pnKick.textContent = ms.nm.names[0] + ' ' + sw[0] + '-' + sw[1] + ' ' + ms.nm.names[1]; el.pnKick.hidden = false;
    fitAllTabs();
    if (o.sec) setTimeout(function () { var hh = $('msh-' + o.sec); if (hh && panel === 'mstats') hh.scrollIntoView({ block: 'start' }); }, 60);   // (escena debug=stats&sec=)
    return true;
  }
  /** Pestañas de la hoja: ids de M.tabs; una sola (o sin recap.js) = sin barra. */
  function endPanes(tabs, cur, noBar, labels) {
    // (móvil: si la tira no cabe, fitTabs pone los rótulos cortos; «Jugadas (3)» → «Jugadas»)
    var L = labels || {}, items = tabs.map(function (t) { return { id: t, label: L[t] || (t === 'sum' ? 'Resumen' : t === 'stats' ? 'Estadísticas' : 'Jugadas'), short: t === 'stats' ? 'Cifras' : t === 'plays' ? 'Jugadas' : '' }; });
    var bar = !noBar && items.length > 1;
    if (el.endTabs) {
      el.endTabs.hidden = !bar;
      if (bar) {
        if (!endTabsApi) endTabsApi = makeTabs(el.endTabs, items, { value: cur, label: 'Resultado del partido', onChange: function (id) { endShow(id); } });
        else { endTabsApi.refresh(items); endTabsApi.set(cur, 'api'); }
      }
    }
    endShow(cur);
  }
  function endShow(id) {
    endTab = id;
    if (el.endSum) el.endSum.hidden = id !== 'sum';
    if (el.endStatsTab) el.endStatsTab.hidden = id !== 'stats';
    if (el.endPlays) el.endPlays.hidden = id !== 'plays';
    var pn = id === 'sum' ? el.endSum : id === 'stats' ? el.endStatsTab : el.endPlays;
    if (pn && el.endTabs && !el.endTabs.hidden) pn.setAttribute('aria-labelledby', 'endTabs-' + id);
    if (pn && pn.scrollTop) pn.scrollTop = 0;
    el.end.setAttribute('data-tab', id);
    endMore();
  }
  /** Panel de la hoja con más contenido debajo → .more (desvanecido abajo); al desplazarlo, al cambiar de pestaña y al verse la hoja. */
  function endMore() {
    var pn = endTab === 'sum' ? el.endSum : endTab === 'stats' ? el.endStatsTab : el.endPlays;
    if (!pn || pn.hidden || el.end.hidden) return;
    var m = pn.scrollHeight - pn.clientHeight - pn.scrollTop > 6;
    if (pn.classList.contains('more') !== m) pn.classList.toggle('more', m);
  }
  /** Botones del modelo (principal + resto) sobre los cuatro de siempre: again/next → #btnAgain; againAlt; opts/retos → #btnEndOpts; menu. */
  function endButtons(M) {
    var B = M.buttons; if (!B) return;
    el.btnAgain.textContent = B.primary.label; el.btnAgain.setAttribute('data-act', B.primary.id); el.btnAgain.disabled = false;   // (la revancha online lo deja desactivado)
    var has = {}; (B.rest || []).forEach(function (b) { has[b.id] = b; });
    el.btnAgainAlt.hidden = !has.againAlt; if (has.againAlt) el.btnAgainAlt.textContent = has.againAlt.label;
    var o = has.opts || has.retos;
    if (el.btnEndOpts) { el.btnEndOpts.hidden = !o; if (o) { el.btnEndOpts.textContent = o.label; el.btnEndOpts.setAttribute('data-act', o.id); } }
    el.btnMenu.hidden = !has.menu; if (has.menu) el.btnMenu.textContent = has.menu.label;
    el.btnAgain.parentNode.setAttribute('data-n', String((has.againAlt ? 1 : 0) + (o ? 1 : 0) + (has.menu ? 1 : 0)));
    el.btnAgainAlt.setAttribute('data-short', has.againAlt ? altShort(has.againAlt.label) : '');
    endOptsPill(has.againAlt && o && o.id === 'opts' ? o.label : '');
  }
  /** Móvil (MV-4): rótulo corto de «Revancha en <nivel>» (CSS lo pone con ::after en :root.ph): «Más difícil» / «Más fácil». */
  function altShort(lb) {
    var L = OPT.difficulty.labels, di = optIndex('difficulty'), ai = -1; lb = String(lb || '');
    for (var i = 0; i < L.length; i++) if (lb.length >= L[i].length && lb.slice(-L[i].length) === L[i]) ai = i;
    return ai < 0 || ai === di ? '' : ai > di ? 'Más difícil' : 'Más fácil';
  }
  /** Móvil (MV-4): con «Revancha en…» y «Cambiar opciones» a la vez, abajo a la izquierda solo caben dos pegatinas (Menú y la revancha):
   *  «Cambiar opciones» pasa a una píldora crema al final del Resumen (.rc-optrow; solo se ve en :root.ph, y entonces el CSS esconde
   *  #btnEndOpts). Pulsarla es pulsar #btnEndOpts. lb = '' la quita. */
  function endOptsPill(lb) {
    var sum = el.endSum; if (!sum) return;
    var old = sum.querySelector('.rc-optrow'); if (old) old.parentNode.removeChild(old);
    if (!lb) return;
    var d = document.createElement('div'); d.className = 'rc-optrow';
    d.innerHTML = '<button type="button" class="sp-btn sp-sm sp-cream rc-opts" data-shape="2"><span class="sp-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v2H3zm15 0h3v2h-3zm-3-2h2v6h-2zM3 16h4v2H3zm7 0h11v2H10zM7 14h2v6H7z"/></svg></span><span class="sp-t">' + escT(lb) + '</span></button>';
    d.firstChild.addEventListener('click', function () { if (el.btnEndOpts && !el.btnEndOpts.hidden) el.btnEndOpts.click(); });
    sum.appendChild(d);
    if (VB.Splat && VB.Splat.decorate) VB.Splat.decorate(d);
  }
  /** Online (main.js ctx.net; notes/net.md «Fase 3»): la hoja final ofrece «Revancha» (se pide al rival: cuando los dos la quieren,
   *  empieza otro partido con la misma sala) y «Volver al menú» (nada de un partido offline contra la CPU). Salir tras el final no es
   *  abandonar (VB.Net Session.quit). onlineEndSync lo pone al día cada frame (esperando al rival, el rival la pide, el rival se fue). */
  function onlineEndButtons() {
    el.btnAgain.setAttribute('data-act', 'rematch'); el.btnAgain.disabled = false; netEndKey = '';
    el.btnAgainAlt.hidden = true; if (el.btnEndOpts) el.btnEndOpts.hidden = true;
    el.btnMenu.hidden = false; el.btnMenu.textContent = 'Volver al menú';
    el.btnAgain.parentNode.setAttribute('data-n', '1');
    onlineEndSync();
  }
  var netEndKey = '';
  function onlineEndSync() {
    var n = ctx.net; if (!n || !n.sess || el.btnAgain.getAttribute('data-act') !== 'rematch') return;
    var s = n.sess, who = s.rivalName || n.rival || 'tu rival', left = !!s.rivalLeft || s.status === 'ended';
    var t = left ? who + ' se ha ido' : n.want ? (n.rivalWants ? 'Empezando…' : 'Esperando a ' + who + '…') : n.rivalWants ? '¡Revancha! (' + who + ' quiere)' : 'Revancha';
    var k = t + (left || n.want ? '|x' : '');
    if (netEndKey === k) return; netEndKey = k;
    el.btnAgain.textContent = t; el.btnAgain.disabled = left || n.want;
  }
  /** Récord online (VB.NetRec) al pie del resumen, y la gorra si es nueva (también sale en «Nuevo en tu vestuario»). */
  function onlineEndRec() {
    var R = VB.NetRec, n = ctx.net; if (!R || !el.endSum || !n) return;
    var ln = ''; try { ln = R.line(); } catch (e) { ln = ''; }
    if (!ln) return;
    var p = document.createElement('p'); p.className = 'rc-net'; p.style.cssText = 'margin:8px 0 0;font:700 14px var(--ui);color:var(--soft,#cfd6e4);text-align:center';
    p.textContent = 'Tu récord online: ' + ln; el.endSum.appendChild(p);
  }
  /** Retrato pequeño del MVP (tu jugador de la Carrera o tu n.º 1/2 de Partido rápido); nunca de rivales. */
  function rcPortrait(mv, cs) {
    try {
      var req = null;
      if (cs && VB.CareerUI && VB.CareerUI.portraitReq && VB.Career && VB.Career.get) {
        var c = VB.Career.get(), who = mv.me ? 'me' : (cs.mateNum | 0) === (mv.num | 0) && cs.mode !== 'hall' ? 'mate' : '';
        if (c && who && !cs._debug) req = VB.CareerUI.portraitReq(c, who, 44);
      } else if (!cs && VB.Prog) {
        var a = VB.Prog.get().a; for (var i = 0; i < 2; i++) if (a[i] && (a[i].num | 0) === (mv.num | 0)) req = portraitReqMatch(0, i, 44);
      }
      return req ? portraitHTML(req, 'rc-pt', mv.name) : '<span class="pt pt-ph rc-pt" aria-hidden="true">' + (mv.num | 0) + '</span>';
    } catch (e) { return ''; }
  }
  function rcBadges(list) {
    if (!list || !list.length || !VB.Badges) return '';
    var h = '';
    list.slice(0, 3).forEach(function (u) {
      var b = VB.Badges.BY && VB.Badges.BY[u.id], tier = u.tier || (VB.Badges.TIERS && VB.Badges.TIERS[u.lvl]) || '';
      h += '<span class="l' + (u.lvl | 0) + '" title="' + escT(VB.Badges.label ? VB.Badges.label(u) : u.name) + '"><i class="bd-ic">' + (b ? b.icon : '') + '</i>' + (u.num ? 'N.º ' + u.num + ': ' : '') + '<b>' + escT(u.name || '') + '</b><small>' + (u.prev ? 'sube a ' + tier : 'nueva (' + tier + ')') + '</small></span>';
    });
    if (list.length > 3) h += '<span class="more">+' + (list.length - 3) + '</span>';
    return '<div class="end-bd rc-bd">' + h + '</div>';
  }
  /** Bloque del reto del día: tres medallas (la nueva destacada), la frase y la experiencia. */
  function rcDayHTML(day) {
    var T = ['Bronce', 'Plata', 'Oro'], best = Math.max(day.best | 0, day.medal | 0), mh = '';
    for (var k = 1; k <= 3; k++) mh += '<span class="ge-m' + (best >= k ? ' on' : '') + (day.newMedal && day.medal === k ? ' new' : '') + '">' + medalSVG(best >= k ? k : 0, best >= k ? '' : 'off') + T[k - 1] + '</span>';
    var line = day.newMedal && day.medal ? '¡Medalla de ' + RC_MED[day.medal] + ' en el reto del día!' : day.prev && day.medal <= day.prev ? 'Hoy ya tenías ' + RC_MED[day.prev] : 'Sin medalla: gana un set para el bronce';
    return '<div class="rc-meds">' + mh + '</div><span class="rc-l">' + escT(line) + '</span>' + (day.xp ? '<span class="rc-x">+' + (day.xp | 0) + ' de experiencia (a cada jugador)</span>' : '');
  }
  /** HTML del Resumen: bloques del modelo en su orden, cada uno con su etiqueta a la izquierda y entrada escalonada (--i). */
  function rcHTML(M, d) {
    var H = M.heads || {}, h = '', i = 0, cs = d.career, re = retoEnd;
    function blk(cls, head, body) { h += '<div class="rc-b ' + cls + '" style="--i:' + (i++) + '">' + '<span class="rc-h">' + escT(head || '') + '</span><div class="rc-c">' + body + '</div></div>'; }
    if (M.headline) h += '<p class="rc-hl" style="--i:' + (i++) + '">' + escT(M.headline) + '</p>';
    if (d.reto && re && re.day) blk('rc-day', 'Reto del día', rcDayHTML(re.day));
    if (cs && amb.cards.length) {   // Ambiente de Carrera: tarjetas del partido (como en el acta)
      var sh = '';
      for (var si = 0; si < amb.cards.length && si < 4; si++) { var sc = amb.cards[si];
        sh += '<span class="rc-l amb-sn"><i class="sb-cds" aria-hidden="true"><i class="' + (ambRed(sc.color) ? 'r' : 'y') + '"></i></i> ' + escT(cpuTxt(ambWho(ctx.game, sc))) + ' · ' +
          escT(AMB_COL[sc.color]) + ' (' + (SET_ORD[sc.set - 1] || sc.set + 'º') + ' set ' + sc.score[0] + '-' + sc.score[1] + ')</span>'; }
      blk('rc-san', 'Sanciones', sh);
    }
    M.blocks.forEach(function (k) {
      switch (k) {
        case 'mvp':
          if (M.mvp) {
            // (cada dato entero en su línea: «7 aces» no se parte; nbsp dentro de cada uno; la raya va pegada al dato que la sigue, .rc-pd)
            var mv = M.mvp, parts = [mv.ptsT].concat(mv.parts || []).map(function (p) { return typeof p === 'string' ? p.replace(/ /g, '\u00a0') : p; });
            blk('rc-mvp', H.mvp, rcPortrait(mv, cs) + '<span class="rc-mv"><b>' + escT(mv.name) + '</b><small>' + sepHTML(parts, 'v').replace(/(<span class="sep[^"]*"><span class="sr">, <\/span><\/span>)([^<]*)/g, '<span class="rc-pd">$1$2</span>') + '</small></span>' + (mv.nota ? '<em class="rc-nota">' + escT(mv.nota) + '</em>' : ''));
          } else blk('rc-mvp rv', H.mvp, '<span class="rc-l">' + escT(M.mvpRival.t) + '</span>' + (cs && M.nota ? '<em class="rc-nota">Nota ' + escT(M.nota) + '</em>' : ''));
          break;
        case 'xp':
          var xh = '';
          M.xp.forEach(function (r) {
            xh += '<span class="rc-xr"><span class="rc-nm">' + escT(document.documentElement.classList.contains('ph') ? String(r.name || '').split(' ')[0] : r.name) + '</span><b>+<i data-cu="' + r.xp + '">' + r.xp + '</i> XP</b>' +
              (r.bar != null ? '<i class="rc-bar" aria-hidden="true"><i style="--w:' + Math.round(r.bar * 100) + '%"></i></i>' : '') + (r.lvlUp ? '<span class="lv">' + escT(r.lvlT) + '</span>' : '') + '</span>';
          });
          blk('rc-xp', H.xp, xh + (M.badges.length ? rcBadges(M.badges) : ''));
          break;
        case 'badges': if (!M.xp.length) blk('rc-bdg', 'Insignias', rcBadges(M.badges)); break;
        case 'unlocks':
          var U = M.unlocks;
          blk('rc-unl', H.unlocks, '<span class="rc-l">' + escT(U.t) + '</span>' + (U.n > 1 ? '<span class="rc-chips">' + sepHTML(U.chips.map(function (c) { return { t: c }; }).concat(U.more ? [{ t: '+' + U.more }] : []), 'c') + '</span>' : ''));
          break;
        case 'table':
          var tb = '';
          M.table.rows.forEach(function (r) {
            var mvT = r.me && M.table.move && M.table.move.txt ? M.table.move : null;
            tb += '<span class="rc-tr' + (r.me ? ' me' : '') + '"><em>' + escT(r.posT) + '</em>' + (mvT ? '<i class="mv ' + (mvT.d > 0 ? 'up' : mvT.d < 0 ? 'dn' : 'eq') + '">' + escT(mvT.txt) + '</i>' : '<i class="mv"></i>') + '<b>' + escT(r.short) + '</b><span>' + r.pts + '</span></span>';
          });
          blk('rc-tb', H.table, tb);
          break;
        case 'cup': blk('rc-cup', H.cup, '<span class="rc-l">' + escT(M.cup) + '</span>'); break;
        case 'life': blk('rc-life', H.life, M.life.map(function (t) { return '<span class="rc-l">' + escT(t) + '</span>'; }).join('')); break;
        case 'chem': blk('rc-chem', H.chem, '<span class="rc-l">' + escT(M.chem.t) + '</span>'); break;
        case 'boss': blk('rc-boss' + (M.boss.win ? ' win' : ''), H.boss, '<span class="rc-l">' + escT(M.boss.t) + '</span>'); break;
        case 'train': blk('rc-train', H.train, '<span class="rc-l">' + sepHTML(M.train.t.split(' | '), 'v') + '</span>'); break;
        case 'retos':
          var rp = M.retos.pills.map(function (p) { return '<span class="rc-pill' + (p.nw ? ' nw' : '') + '">' + medalSVG(p.lvl) + escT(p.t) + '</span>'; }).join('');
          blk('rc-retos', H.retos, '<span class="rc-pills">' + rp + (M.retos.moreT ? '<span class="rc-more">' + escT(M.retos.moreT) + '</span>' : '') + '</span>' + (M.retos.xpT ? '<span class="rc-x">' + escT(M.retos.xpT) + ' (a cada jugador)</span>' : ''));
          break;
        case 'profile': blk('rc-prof', H.profile, '<span class="rc-l">' + escT(M.profile.t) + '</span>' + (M.profile.up ? '<span class="rc-l up">' + escT(M.profile.up) + '</span>' : '')); break;
        case 'part': blk('rc-part', H.part, '<span class="rc-l">' + sepHTML(M.part.parts, 'v') + '</span>'); break;
      }
    });
    return h;
  }
  /** Sonidos del Resumen al verse la hoja: la flecha de la tabla a los 700 ms y el desbloqueo a los 800 ms (nunca en depuración). */
  function endRcSounds() {
    var S = endRcSnd; if (!S || ctx.debug || endTab !== 'sum') return;
    if (S.rank) setTimeout(function () { if (!el.end.hidden && ctx.state === 'over') uiK('rank', null, S.rank); }, 700);
    if (S.unl) setTimeout(function () { if (!el.end.hidden && ctx.state === 'over') uiK('unlock', null); }, 800);
  }
  /** Carrera (main.js, tras VB.Career.matchDone y después de showEnd): el Resumen de la jornada. x = {tbl, myId, short, pos, next, bar, ses}. */
  function endCareer(sum, g, x) {
    g = g || ctx.game; if (!g || !sum) return null;
    var e = { team: g.sets && g.sets[0] > g.sets[1] ? 0 : 1, sets: g.sets.slice(), setScores: g.setScores };
    endRecap(e, g, sum, x || null);
    if (!el.end.hidden && el.endSum) countUp(el.endSum);
    return recapM;
  }
  /** Cuenta hacia arriba (600 ms, rAF) de las cifras de la hoja final al aparecer: solo textContent (cifras tabulares, la hoja no
   *  cambia de tamaño). Movimiento reducido: cifras finales directamente. */
  //  (B6: también el «+184 XP» del Resumen, [data-cu]. root = #end al aparecer la hoja; root = #endSum cuando la Carrera repinta el
  //  Resumen con la hoja ya a la vista: reloj propio, sin el acento del MVP y sin cortar la cuenta de la hoja)
  var cuRaf = 0, cuRaf2 = 0;
  function countUp(root) {
    var main = root === el.end;
    var L = root.querySelectorAll('[data-cu], .st-r b, .es-t b'), items = [];
    for (var i = 0; i < L.length; i++) { var n = L[i], v = +(n.getAttribute('data-cu') || n.textContent) || 0; if (v > 0) items.push([n, v]); }
    cancelAnimationFrame(main ? cuRaf : cuRaf2);
    // AUD-08: revelación del MVP (el acento cae a 0,6 s, cuando se posan las cifras; con movimiento reducido, 0,6 s tras aparecer)
    if (main && el.endMvp && el.endMvp.firstChild) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('mvp', root.classList.contains('win')); } catch (e) { } }
    if (rm() || !items.length) return;
    for (var k = 0; k < items.length; k++) items[k][0].textContent = '0';
    // un solo reloj: t0 = sello del PRIMER frame de rAF (mezclar performance.now() con los sellos de rAF daba cifras negativas)
    var t0 = -1;
    var r0 = requestAnimationFrame(function step(now) {
      if (t0 < 0) t0 = now;
      var u2 = Math.max(0, Math.min(1, (now - t0) / 600)), e2 = 1 - Math.pow(1 - u2, 3);
      var chg = false;
      for (var j = 0; j < items.length; j++) { var tv = String(Math.round(items[j][1] * e2)); if (items[j][0].textContent !== tv) { items[j][0].textContent = tv; chg = true; } }
      // AUD-08: tic en los frames en que cambia alguna cifra (audio.js los espacia: ≤ 20/s, se frenan con la cuenta) y «clac» en el último
      if (main && (chg || u2 >= 1)) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('count', u2, now); } catch (e) { } }
      if (u2 < 1) { var r1 = requestAnimationFrame(step); if (main) cuRaf = r1; else cuRaf2 = r1; }
    });
    if (main) cuRaf = r0; else cuRaf2 = r0;
  }
  // ---------- Flujo hasta la hoja final (UI-11 / UI-13) ----------
  // Escritorio (≥ 1000 px): al llegar gameOver, cortinilla y hoja acoplada a la izquierda (la celebración sigue a la derecha).
  // Móvil: la celebración sin nada encima hasta que acaba el cierre de la cámara (clinchLeft = 0) y han pasado ≥ 2,5 s desde el
  // punto que gana el partido; cualquier botón o toque lo adelanta (tras 0,8 s). Luego cortinilla y hoja.
  var endGate = false, endWait = 0, endT0 = 0, matchPtT = -99, endTeam = 0, endPeek = false, endLastT = 0, endRpAcc = 0;
  function endDocked() { return (ctx.width || innerWidth) >= 1000; }
  function endFlow(e) {
    endTeam = e.team === 1 ? 1 : 0; endPeek = false; el.end.classList.remove('peek');
    if (ctx.debug && ctx.params.hold !== '1') { endGate = false; return; }   // depuración: la hoja al momento
    endGate = true; endT0 = ctx.time; endLastT = ctx.time; endRpAcc = 0;
    // B6: la celebración de END_CELEB s también en escritorio (antes la hoja acoplada salía al momento); al abrirse se acopla igual
    endWait = 1; ctx.endHold = true;
    var d = device();
    el.skip.innerHTML = d === 'touch' ? 'Toca para ver el resultado' : d === 'gamepad' ? padKey('a') + 'Ver el resultado' : '<span class="key">Intro</span>Ver el resultado';
    el.skip.hidden = false; shown = '';
  }
  function endOpen() { endGate = false; endWait = 0; ctx.endHold = false; el.skip.hidden = true; shown = ''; if (ctx.game) syncScreens(ctx.game); }
  function endHoldTick() {
    if (!endWait) return;
    if (ctx.state !== 'over') { endWait = 0; endGate = false; ctx.endHold = false; el.skip.hidden = true; return; }
    var cl = 0; try { cl = VB.CameraRig && VB.CameraRig.clinchLeft ? +VB.CameraRig.clinchLeft() || 0 : 0; } catch (er) { cl = 0; }
    var ref = matchPtT > endT0 - 12 ? matchPtT : endT0;            // desde el punto que gana el partido (o desde gameOver si no se vio)
    // R11: END_CELEB cuenta tiempo vivo; mientras se ve la repetición del punto de partido (ctx.replay) no corre ni se abre la hoja
    var dT = ctx.time - endLastT; endLastT = ctx.time;
    if (ctx.replay) { endRpAcc += Math.max(0, dT); return; }
    var cel = VB.Recap && +VB.Recap.END_CELEB > 0 ? +VB.Recap.END_CELEB : 3;
    if (ctx.time - ref - endRpAcc >= cel && ctx.time - endT0 >= 0.25 && cl <= 0.01) endGo();
  }
  function endGo() { if (endWait !== 1) return; endWait = 2; el.skip.hidden = true; if (!wipeRun(endTeam, endOpen)) endOpen(); }
  function endSkip() { if (endWait === 1 && ctx.time - endT0 >= 0.8 && !ctx.replay) endGo(); }
  /** Cambia entre la hoja y la celebración (móvil). */
  function setPeek(on) { endPeek = !!on; el.end.classList.toggle('peek', endPeek); focusEl(endPeek ? el.btnEndBack : el.btnPeek, false); }
  /** ctx.uiDock = {side:'left', frac} con la hoja final acoplada (CAM-10 encuadra en el resto); null si no. */
  var dockKey = '';
  function dockTick() {
    var on = ctx.state === 'over' && !el.end.hidden && el.end.classList.contains('dock') && !endPeek;
    var sh = on ? el.end.querySelector('.sheet') : null, r = sh ? sh.getBoundingClientRect() : null;
    var frac = r && r.width ? Math.min(0.75, Math.max(0, r.right / (ctx.width || innerWidth))) : 0;
    var k = on ? 'l' + frac.toFixed(3) : '';
    if (k !== dockKey) { dockKey = k; ctx.uiDock = on ? { side: 'left', frac: +frac.toFixed(3) } : null; }
  }

  // =====================================================================
  //  PESTAÑAS (menús v2, nov-2026): componente reutilizable estilo EA FC
  // =====================================================================
  // VB.UI.tabs(host, items, opts) → api. Pinta en `host` una barra role="tablist" con un botón role="tab" por elemento y, a los
  // lados, la pista de la tecla (Q / E con teclado, LB / RB o L1 / R1 con mando, nada en táctil; con ratón también se pulsan).
  //   items: [{id, label, icon? (svg en HTML), badge? (texto pequeño: «en uso», «2/3»), cls?}]
  //   opts:  {value (id inicial), label (aria-label), onChange(id, dir, how) (how: 'click' | 'key' | 'pad' | 'swipe' | 'api'),
  //           pane (elemento del contenido: role="tabpanel", aria-labelledby y animación de entrada desde el lado del cambio),
  //           swipe (elemento donde deslizar el dedo cambia de pestaña; por defecto el pane), wrap (true: da la vuelta), sound (true)}
  //   api:   {el, get(), set(id, how), step(d, how), refresh(items?), hint(), focus(kb)}
  // Foco: solo la pestaña elegida entra en el recorrido ↑/↓ (las demás llevan tabindex=-1 y data-skip); con ella enfocada, ←/→
  // cambian de pestaña. En los menús de ui.js (paneles), Q/E y LB/RB cambian de pestaña estés donde estés (ui.js busca la barra
  // visible de la capa activa). Fuera de ui.js (p. ej. #career, con su propio teclado y su nav de mando) llama tú a
  // api.step(±1) desde tus manejadores; con mando, `if (it.switchPlayer) api.step(VB.UI.padTabDir())` (LB = −1, RB/Y = +1).
  var tabReg = [];
  var TAB_IC = {
    keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm2 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h2V9zM7 13v2h10v-2z"/></svg>',
    gamepad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10a5 5 0 0 1 4.9 6l-.8 4a2.5 2.5 0 0 1-4.3 1.2L14.5 16h-5l-2.3 2.2A2.5 2.5 0 0 1 2.9 17l-.8-4A5 5 0 0 1 7 7zm0 3v1.5H5.5v1.5H7v1.5h1.5V13H10v-1.5H8.5V10zm9.5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>',
    touch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l5.2 1.1a2 2 0 0 1 1.6 2.2l-.6 5.2A2 2 0 0 1 16.2 20H11a2 2 0 0 1-1.6-.8l-3.6-4.8a1.4 1.4 0 0 1 2.1-1.8z"/></svg>',
    // Jugadores: físico (rayo), defensa (escudo), ataque (balón con estela), insignias (medalla)
    phys: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h5.5L9 22l9-12h-5.6z"/></svg>',
    def: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6.5c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5z"/></svg>',
    atk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="15" cy="10" r="6.5"/><path d="M2 15.5h7M4 19.5h7M6.5 11.5H2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
    badge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h4l1.5 4L14 2h3l-3 7.2A6.5 6.5 0 1 1 9.8 9.2zM12 11.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/></svg>',
    // Ajustes
    audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 12h14l-4.5-6-3.5 4.5-2.5-3z"/><circle cx="8.5" cy="9" r="1.6"/></svg>',
    game: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3c-2.4 2.4-3.4 5.6-3 9M21 12c-3.2-1-6.4-.6-9 1.2M6.4 19c2.2-2 5-3 8.4-2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    kit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3 3 6l2 5 2.2-1V21h9.6V10l2.2 1 2-5-5.5-3c-.5 1.6-1.8 2.6-3.5 2.6S9 4.6 8.5 3z"/></svg>',
    a11y: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.5" r="2.2"/><path d="M4 8.2l8 1.6 8-1.6.5 2-5.5 1.4V15l2 6.5-2 .6-3-6.1-3 6.1-2-.6 2-6.5v-3.4L3.5 10.2z"/></svg>',
    // E3 / E7: Cámara, Info (una «i» en círculo); Acerca de: Novedades (estrella) y Créditos (hoja)
    cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm8 2.2a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.4 8.2V18h2.8v-7.8zM12 5.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z"/></svg>',
    news: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z"/></svg>',
    credits: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M6 2h9l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm2 9v2h8v-2zm0 4v2h8v-2zm0-8v2h5V7z"/></svg>',
    // Vestuario: pelo (tupé), cabeza (gorra), cara, cuerpo (camiseta de tirantes), brazos (manguito con franjas), piernas (calcetín) y colores (paleta)
    lk_pelo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13.5C4.2 8 7.6 3.6 12.6 3.4c2.6-.1 4.6.9 5.6 2.6 1.6.4 2.5 1.9 2.2 3.6-.2 1.6-1.2 2.8-2.4 3.4.1-2.3-1.6-4-4.2-4.2-1.6 1.6-4.2 2.4-6.6 2.2-1 .6-1.6 1.4-2.2 2.5z"/><path d="M6.3 14.8c.5-1.4 1.3-2.4 2.4-2.9 2.4.1 4.5-.6 6-1.9 1.6.4 2.5 1.6 2.4 3.4v1.1c0 3.3-2.3 6.1-5.4 6.1s-5.4-2.6-5.4-5.8z" opacity=".5"/></svg>',
    lk_cabeza: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.2C3 9.6 6.6 5.6 11.4 5.6c4.3 0 7.4 3.2 7.8 7.6v2z"/><path d="M10.6 14.2h9.6c1.8 0 2.8.9 2.8 2.1 0 .6-.5 1-1.1 1H9.8z"/><circle cx="11.2" cy="4.6" r="1.3"/><path d="M11.2 6.4c-2 2.3-2.9 5-2.9 8.8" fill="none" stroke="#15102a" stroke-width="1.2" opacity=".55"/></svg>',
    lk_cara: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM8.8 8.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6.4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7.4 13.6c.9 2.1 2.5 3.3 4.6 3.3s3.7-1.2 4.6-3.3z"/></svg>',
    lk_cuerpo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.6 2.5h2.6c.3 1.9 1 2.9 1.8 2.9s1.5-1 1.8-2.9h2.6c0 2.4.7 4.3 2.4 5.5V21.5H5.2V8c1.7-1.2 2.4-3.1 2.4-5.5z"/></svg>',
    lk_brazos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 2.6c1.6-.6 3.3.2 3.9 1.8l2.2 5.9 4.6 3.4c1.4 1 1.7 3 .7 4.4l-2.4 3.3c-.4.6-1.2.7-1.8.3L7.4 17c-.9-.6-1.5-1.6-1.6-2.7L4.6 6.4c-.2-1.7.4-3.2 1.8-3.8z"/><path d="M7.3 9.6l4.9-1.6.9 2.6-4.9 1.6z" fill="#15102a" opacity=".45"/><circle cx="18.6" cy="18.4" r="2.6"/></svg>',
    lk_piernas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M8 2h7.2v9.6l3.5 4.3c1.7 2.1.2 5.6-2.5 5.6H11.2A3.2 3.2 0 0 1 8 18.3zm0 3.3V7.4h7.2V5.3z"/></svg>',
    lk_colores: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.5c5.5 0 9.5 3.8 9.5 8.3 0 3-2.3 4.6-4.6 4.6h-1.6c-1 0-1.6.9-1.2 1.8l.3.6c.7 1.5-.4 3.7-2.4 3.7-5.2 0-9.5-4.1-9.5-9.5S6.6 2.5 12 2.5zM7.2 9a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 7.2 9zm3.4-3.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm4.8.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/></svg>'
  };
  function makeTabs(host, items, o) {
    if (!host) return null;
    o = o || {};
    var api = { el: host, items: (items || []).slice(), cur: null, o: o };
    var hid = host.id || ('tabs' + tabReg.length);
    host.classList.add('tabs'); host.setAttribute('role', 'tablist'); host.setAttribute('data-nav', '');
    if (o.label) host.setAttribute('aria-label', o.label);
    api.cur = o.value != null && idx(o.value) >= 0 ? o.value : (api.items[0] && api.items[0].id);
    function idx(id) { for (var i = 0; i < api.items.length; i++) if (api.items[i].id === id) return i; return -1; }
    function draw() {
      var a = document.activeElement, hadF = !!(a && host.contains(a) && a.classList.contains('tab')), kb = hadF && a.classList.contains('kf');
      var h = '<button type="button" class="tb-k tb-l" tabindex="-1" data-skip data-step="-1" aria-hidden="true"></button><div class="tb-row">';
      api.items.forEach(function (it) {
        var on = it.id === api.cur;
        h += '<button type="button" class="tab' + (on ? ' on' : '') + (it.cls ? ' ' + it.cls : '') + '" role="tab" id="' + hid + '-' + it.id + '" data-tab="' + it.id + '" aria-selected="' + on + '"' +
          (on ? '' : ' tabindex="-1" data-skip') + (o.pane && o.pane.id ? ' aria-controls="' + o.pane.id + '"' : '') + '>' + (it.icon || '') + '<span class="tb-t"' + (it.short ? ' data-ph-short="' + it.short + '"' : '') + '>' + it.label + '</span>' +
          (it.badge ? '<em class="tb-b">' + it.badge + '</em>' : '') + '</button>';
      });
      host.innerHTML = h + '</div><button type="button" class="tb-k tb-r" tabindex="-1" data-skip data-step="1" aria-hidden="true"></button>';
      if (o.pane) o.pane.setAttribute('aria-labelledby', hid + '-' + api.cur);
      api.hint();
      showOn();   // innerHTML deja la fila en scrollLeft 0: la pestaña elegida, a la vista (667x375: Perfil con 7 pestañas)
      if (host.hasAttribute('data-ph-tabs')) fitTabs(api);   // (móvil: columna o tira de pestañas)
      if (hadF) api.focus(kb);
    }
    function showOn() {
      var row = host.querySelector('.tb-row'), b = host.querySelector('.tab.on');
      if (!row || !b || row.scrollWidth <= row.clientWidth + 1) return;
      var rr = row.getBoundingClientRect(), br = b.getBoundingClientRect();
      if (br.left < rr.left) row.scrollLeft += br.left - rr.left - 8;
      else if (br.right > rr.right) row.scrollLeft += br.right - rr.right + 8;
    }
    api.get = function () { return api.cur; };
    api.focus = function (kb) { var b = host.querySelector('.tab.on'); if (b) focusEl(b, !!kb); };
    api.hint = function () {
      var d = ctx ? device() : 'keyboard', P = padSet(), L = host.querySelector('.tb-l'), R = host.querySelector('.tb-r');
      var l = d === 'gamepad' ? P.lb : d === 'touch' ? '' : 'Q', r = d === 'gamepad' ? P.rb : d === 'touch' ? '' : 'E';
      host.classList.toggle('tb-touch', d === 'touch');
      if (L && L.textContent !== l) L.textContent = l;
      if (R && R.textContent !== r) R.textContent = r;
    };
    api.set = function (id, how) {
      var i = idx(id), j = idx(api.cur); if (i < 0 || id === api.cur) return false;
      var a = document.activeElement, onTab = !!(a && host.contains(a)), kb = onTab && a.classList.contains('kf');
      api.cur = id;
      var bs = host.querySelectorAll('.tab');
      for (var k = 0; k < bs.length; k++) {
        var on = bs[k].getAttribute('data-tab') === id;
        bs[k].classList.toggle('on', on); bs[k].setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) { bs[k].removeAttribute('tabindex'); bs[k].removeAttribute('data-skip'); } else { bs[k].setAttribute('tabindex', '-1'); bs[k].setAttribute('data-skip', ''); }
      }
      var nb = host.querySelector('.tab.on');
      // (V-PFRAIL: dentro de su fila, sin mover la página y con margen: en la columna de pestañas del móvil nunca queda media pestaña arriba)
      if (nb && VB.Splat && VB.Splat.reveal) VB.Splat.reveal(nb, { block: nb.closest && nb.closest('.sp-vtabs') ? 'center' : 'nearest', inline: 'nearest' });   // MV-9: en la columna, al centro (nunca bajo el desvanecido)
      else if (nb && nb.scrollIntoView) try { nb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
      if (onTab && nb) focusEl(nb, kb || how === 'key' || how === 'pad');
      if (o.pane) { o.pane.setAttribute('aria-labelledby', hid + '-' + id); restartAnim(o.pane, i > j ? 'tp-n' : 'tp-p'); }
      if (o.sound !== false && how !== 'api') uiK('tab', 'click');   // B4: sonido propio de pestaña (el clic si audio no lo tiene)
      if (o.onChange) o.onChange(id, i > j ? 1 : -1, how || 'api');
      if (host.classList.contains('tabs-ic') || host.hasAttribute('data-ph-tabs')) fitTabs(api);
      return true;
    };
    api.step = function (d, how) {
      var n = api.items.length, i = idx(api.cur); if (n < 2) return false;
      var j = i + (d > 0 ? 1 : -1);
      if (o.wrap === false) { if (j < 0 || j >= n) { uiSound2('arrowEdge', d); return false; } } else j = (j + n) % n;
      return api.set(api.items[j].id, how || 'api');
    };
    api.refresh = function (list) { if (list) api.items = list.slice(); if (idx(api.cur) < 0) api.cur = api.items[0] && api.items[0].id; draw(); };
    // (móvil: columna .sp-vtabs) el teclado y el mando la recorren en vertical: ↑/↓ = pestaña anterior / siguiente, → = al contenido
    // (su primer elemento), ← en la columna = rebote. a = lo enfocado, list = lo que recorre ↑/↓ en esa capa. post = true (← que nadie
    // quiso): desde la primera columna del contenido (nada pulsable a su izquierda en su fila) vuelve a la pestaña elegida.
    // Fuera de la columna (sin .sp-vtabs: PC, tablet, tira) devuelve false y todo sigue como siempre. ui.js vtNav; career-ui crVt.
    api.vnav = function (a, dx, dy, how, list, post) {
      if (!a || !host.classList.contains('sp-vtabs') || !host.getClientRects().length) return false;
      if (host.contains(a)) {
        if (post || a.getAttribute('role') !== 'tab') return false;
        if (dy) { api.step(dy, how || 'key'); return true; }
        var b = dx > 0 ? vtBody(list)[0] : null;
        if (!b) { uiSound2('arrowEdge', dx); return true; }
        focusEl(b, true); hoverSound(); return true;
      }
      if (!post || dy || dx >= 0) return false;
      var B = vtBody(list); if (B.indexOf(a) < 0) return false;
      var r = a.getBoundingClientRect();
      for (var i = 0; i < B.length; i++) {
        if (B[i] === a) continue;
        var q = B[i].getBoundingClientRect();
        if (q.width && q.right <= r.left + 2 && q.bottom > r.top + 4 && q.top < r.bottom - 4) return false;
      }
      api.focus(true); hoverSound(); return true;
    };
    /** Lo pulsable del contenido de la columna: dentro del pane (o, sin él, lo que va después de la barra), sin cabecera ni Volver. */
    function vtBody(list) {
      var pick = function (inPane) {
        return (list || []).filter(function (x) {
          if (host.contains(x) || !x.getClientRects().length || x.id === 'btnPanelBack' || x.classList.contains('mp-back') || x.classList.contains('sp-back')) return false;
          if (x.closest('.sp-fh,.pn-head,.mp-head,.cr-head')) return false;
          return inPane ? o.pane.contains(x) : !!(host.compareDocumentPosition(x) & 4);
        });
      };
      var P = o.pane ? pick(true) : [];
      return P.length ? P : pick(false);
    }
    host.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('button') : null; if (!t || !host.contains(t)) return;
      if (t.hasAttribute('data-step')) { api.step(+t.getAttribute('data-step'), 'click'); return; }
      var id = t.getAttribute('data-tab'); if (id) api.set(id, 'click');
    });
    var sw = o.swipe || o.pane, sp = null;
    if (sw) {
      sw.classList.add('tab-swipe');
      // deslizar (dedo o lápiz): ≥ 56 px en horizontal, bastante más que en vertical y en menos de 0,7 s. Los deslizadores de
      // Ajustes y las muestras no cuentan (allí arrastrar es cambiar el valor)
      sw.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' || (e.target.closest && e.target.closest('.trk,.slider,.seg,input,textarea'))) { sp = null; return; }
        sp = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      }, { passive: true });
      sw.addEventListener('pointerup', function (e) {
        if (!sp || e.pointerId !== sp.id) return;
        var dx = e.clientX - sp.x, dy = e.clientY - sp.y, dt = performance.now() - sp.t; sp = null;
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) api.step(dx < 0 ? 1 : -1, 'swipe');
      }, { passive: true });
      sw.addEventListener('pointercancel', function () { sp = null; }, { passive: true });
    }
    draw();
    tabReg.push(api);
    return api;
  }
  /** E3: modo compacto de una barra de pestañas (.tabs-ic: solo el icono, salvo la elegida, que lleva su etiqueta) cuando no caben
   *  enteras. Se mide al abrir el panel, al cambiar de pestaña y al cambiar el tamaño (nunca por frame). */
  function fitTabs(api) {
    if (!api || !api.el) return;
    // móvil (notes/splat.md «Móvil»): data-ph-tabs="rail" → .sp-vtabs (columna a la izquierda) y "strip" → .sp-tabs-strip, solo con
    // html.ph; sin .ph se quitan y vuelve la barra de siempre. Nunca el modo solo-icono (.tabs-ic) en el móvil.
    var phm = api.el.getAttribute('data-ph-tabs'), ph = !!phm && document.documentElement.classList.contains('ph');
    var S = VB.Splat;
    if (api.el.classList.contains('sp-vtabs') !== (ph && phm === 'rail')) api.el.classList.toggle('sp-vtabs', ph && phm === 'rail');
    if (api.el.classList.contains('sp-tabs-strip') !== (ph && phm === 'strip')) api.el.classList.toggle('sp-tabs-strip', ph && phm === 'strip');
    if (phm && !ph && S && S.shorten) S.shorten(api.el, true);   // (vuelven los rótulos largos)
    if (api.el.offsetParent === null) return;
    var row = api.el.querySelector('.tb-row'); if (!row) return;
    api.el.classList.remove('tabs-ic');
    if (ph) {
      var on = row.querySelector('.tab.on');
      if (phm === 'strip' && S && S.shorten) {
        // primero los rótulos largos; si no caben, los cortos (data-ph-short, item.short); si aún no caben, desliza con desvanecido
        var ls = row.querySelectorAll('[data-ph-long]');
        for (var q = 0; q < ls.length; q++) { ls[q].textContent = ls[q].getAttribute('data-ph-long'); ls[q].removeAttribute('data-ph-long'); if (ls[q].hasAttribute('data-ph-al')) { ls[q].removeAttribute('aria-label'); ls[q].removeAttribute('data-ph-al'); } }
        if (row.scrollWidth > row.clientWidth + 2) S.shorten(api.el, true);
      }
      if (S && S.more) S.more(row);
      if (on && S && S.reveal) S.reveal(on, { block: on.closest && on.closest('.sp-vtabs') ? 'center' : 'nearest', inline: 'nearest' });   // (MV-9)
      return;
    }
    // (solo-icono solo si las pestañas TIENEN icono: Perfil no, y sin él quedaban contadores sueltos «5/46»; sin icono, desliza)
    if (row.scrollWidth > row.clientWidth + 2 && row.querySelector('.tab svg, .tab .tb-ic')) api.el.classList.add('tabs-ic');
    if (S && S.more) S.more(row);   // (REV-8: si aun así no caben, desvanecido en el borde: hay más pestañas)
    var nb = row.querySelector('.tab.on'); if (nb && nb.scrollIntoView && row.scrollWidth > row.clientWidth + 2) try { nb.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
  }
  function fitAllTabs() { for (var i = 0; i < tabReg.length; i++) fitTabs(tabReg[i]); }
  /** (móvil) flechas / stick con una columna de pestañas .sp-vtabs visible en la capa activa (api.vnav); true si se lo quedó. */
  function vtNav(dx, dy, how, post) {
    var L = activeLayer(), a = document.activeElement; if (!L || !a || !L.contains(a)) return false;
    var list = null;
    for (var i = 0; i < tabReg.length; i++) {
      var t = tabReg[i]; if (!t.vnav || !t.el.classList.contains('sp-vtabs') || !L.contains(t.el) || t.el.closest('[hidden]')) continue;
      if (t.vnav(a, dx, dy, how, list || (list = focusables(L)), post)) return true;
    }
    return false;
  }
  document.addEventListener('vb:ph', function () { fitAllTabs(); });   // (móvil: al entrar o salir del tier, columna / tira / barra)
  // (vb:tier: también al cruzar 345 de alto (.ph-s) o 800 de ancho (.ph-w); p. ej. la barra del navegador a 667×375. Solo lo que monta
  // el JS distinto en .ph-s, sin repintar pantallas enteras)
  document.addEventListener('vb:tier', function () {
    try { if (el.end && !el.end.hidden) placeMStats(); } catch (e) { }
    try { if (el.gymEnd && !el.gymEnd.hidden) geKickSet(); } catch (e) { }
    try { if (panel === 'ctl' && !capturing) renderCtl(); } catch (e) { }
  });
  /** Barra de pestañas visible en la capa activa de ui.js (panel abierto), o null. */
  function activeTabs() {
    var L = activeLayer(); if (!L) return null;
    for (var i = 0; i < tabReg.length; i++) { var t = tabReg[i]; if (L.contains(t.el) && !t.el.closest('[hidden]') && t.el.offsetParent !== null) return t; }
    return null;
  }
  /** Dirección del botón de hombro pulsado en el mando: LB/L1 → −1; RB/R1 (o Y, que también es «cambiar») → +1. */
  function padTabDir() {
    try {
      var ps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i]; if (!p || !p.buttons) continue;
        var b4 = p.buttons[4], b5 = p.buttons[5];
        if (b4 && (b4.pressed || b4.value > 0.5)) return -1;
        if (b5 && (b5.pressed || b5.value > 0.5)) return 1;
      }
    } catch (e) { }
    return 1;
  }

  // =====================================================================
  //  PÁGINAS DEL MENÚ (menús v2): principal → Jugar (modos) → Partido rápido (preparación)
  // =====================================================================
  // Todas viven dentro de #menu (misma demo de fondo y mismo estado 'menu'); solo se ve una. La pila guarda de qué página y de
  // qué botón se vino, para volver con Esc / B / «Volver» al mismo sitio. La Carrera (career-ui.js) se abre desde la tarjeta
  // #btnCareer de Jugar: mientras está abierta, el menú se queda en Jugar (al cerrarla, el foco vuelve a esa tarjeta).
  var mpage = 'main', mstack = [];
  function pageEl(p) { return p === 'play' ? el.mpPlay : p === 'quick' ? el.mpQuick : p === 'gym' ? el.mpGym : p === 'look' ? el.mpLook : p === 'retos' ? el.mpRetos : p === 'prof' ? el.mpProf : p === 'online' ? el.mpOnline : el.menuCol; }
  function netLobbyFocus() { var f = VB.NetLobby && VB.NetLobby.focus ? safe(VB.NetLobby.focus) : null; return f || el.btnOnlineBack; }
  function pageFocus() { return mpage === 'play' ? el.btnQuick : mpage === 'quick' ? el.btnGo : mpage === 'gym' ? gymRowEl(gymSel) : mpage === 'look' ? lkFocusEl() : mpage === 'retos' ? rtFocusEl() : mpage === 'prof' ? pfFocusEl() : mpage === 'online' ? netLobbyFocus() : heroOn && el.btnCont && !el.btnCont.hidden ? el.btnCont : el.btnPlay; }
  function setPage(p, anim) {
    var was = mpage;
    if (was === 'look' && p !== 'look') lkClose();   // Vestuario: guarda la copia de trabajo y apaga la vista previa
    if (was === 'prof' && p !== 'prof') pfLeave();   // Perfil: lo nuevo de la pestaña a la vista queda visto
    if (was === 'online' && p !== 'online' && VB.NetLobby) { try { VB.NetLobby.leave(); } catch (e) { console.error('[VB][ERROR] NetLobby.leave: ' + e); } }   // (sale de la sala que hubiera)
    mpage = p;
    ['main', 'play', 'quick', 'gym', 'look', 'retos', 'prof', 'online'].forEach(function (k) { var n = pageEl(k); if (n) n.hidden = k !== p; });
    if (p === 'online' && was !== 'online' && VB.NetLobby && el.mpOnline) { try { VB.NetLobby.open(el.mpOnline); } catch (e) { console.error('[VB][ERROR] NetLobby.open: ' + e); } }
    if (p === 'gym') renderGym();
    if (p === 'retos') renderRetos();
    if (p === 'prof' && was !== 'prof') pfOpen();
    if (p === 'look' && was !== 'look') lkOpen();
    el.menu.setAttribute('data-page', p);
    var n = pageEl(p);
    // SPLAT: página con el sistema (data-sp-full) = #menu sin velo ni relleno, columna propia (index.html «SPLAT: sistema de diseño»)
    var spf = !!(n && n.hasAttribute('data-sp-full')); if (el.menu.classList.contains('sp-full') !== spf) el.menu.classList.toggle('sp-full', spf);
    if (anim && n) { n.classList.remove('pg-in', 'pg-back'); void n.offsetWidth; n.classList.add(anim === 'back' ? 'pg-back' : 'pg-in'); }
    if (p === 'quick') renderOpts();
    if (ctx && ctx.state === 'menu') renderMenu();   // pistas de teclado/mando de esta página
    if (p === 'play' && VB.CareerUI && VB.CareerUI.syncMenu) try { VB.CareerUI.syncMenu(); } catch (e) { }
    // R8: los retratos de la previa de Partido rápido (tus n.º 1 y n.º 2, 72 px) se precargan aquí: main.js solo pinta la cola en el
    // menú, nunca durante el partido (si no llegan a tiempo, la previa enseña la silueta)
    if (p === 'play' && was !== 'play') { for (var pi = 0; pi < 2; pi++) { var pr = portraitReqMatch(0, pi, 72); if (pr) portraitHTML(pr, '', ''); } }
    if (p === 'main') heroDirty = true;
  }
  function kbNow() { var a = document.activeElement; return !!(a && a.classList && a.classList.contains('kf')); }
  function focusSoon(b, kb) { setTimeout(function () { if (b && !b.closest('[hidden]') && ctx.state === 'menu' && !panel) focusEl(b, kb); }, 30); }
  function menuGo(p) {
    if (mpage === p) return;
    var a = document.activeElement, kb = kbNow();
    mstack.push({ p: mpage, f: a && a.id && el.menu.contains(a) ? a.id : '' });
    setPage(p, 'go'); uiSound('click');
    focusSoon(pageFocus(), kb);
  }
  function menuBack() {
    if (!mstack.length || ctx.state !== 'menu' || panel) return false;
    if (mpage === 'look' && lk.grid) { lkGridClose(kbNow() || ctx.inputDevice === 'gamepad'); return true; }   // (Vestuario: primero la rejilla)
    if (mpage === 'online' && VB.NetLobby && VB.NetLobby.back && safe(VB.NetLobby.back)) { uiSound('back'); return true; }   // (online: primero lo abierto dentro del lobby)
    var kb = kbNow(), s = mstack.pop();
    // Vestuario abierto desde la Carrera: al volver, la Carrera se abre otra vez por su cuenta (o.back) y se queda con el foco
    var fn = mpage === 'look' && lk.o && typeof lk.o.back === 'function' ? lk.o.back : null;
    setPage(s.p, 'back'); uiSound('back');
    if (fn) { lk.o = null; try { fn(); } catch (e) { } return true; }
    focusSoon($(s.f) || pageFocus(), kb);
    return true;
  }
  function menuReset() { mstack.length = 0; if (mpage !== 'main') setPage('main'); lk.o = null; }

  // =====================================================================
  //  VESTUARIO (1.1.0, look-spec §6): página #mpLook del menú, aspecto de los n.º 1 y 2 y del jugador de la Carrera
  // =====================================================================
  // Sigue en el estado 'menu' (sin estado nuevo). El muñeco de muestra lo pinta main.js en la escena del menú: al entrar,
  // ctx.actions.showroom(true, L, o); al salir (Volver, menuReset, estado distinto de 'menu'), showroom(false). Se edita una
  // COPIA de trabajo: cada cambio pasa por VB.Look.fix (quita lo que choca y avisa) y va a VB.Doll.preview.set (como mucho
  // uno cada 120 ms). Lo bloqueado se puede probar; al salir o al cambiar de jugador, VB.Look.wearable lo devuelve a lo
  // guardado y se guarda (VB.Look.setFit o VB.CareerLife.setLook) + ctx.actions.looksChanged(). Todo es estético: nada de
  // esto llega a la sim ni a g.rng (la semilla de «Al azar» es Date.now()). Sin VB.Look (look.js sin cargar) no hay botón.
  var LK_TABS = [['pelo', 'Pelo'], ['cabeza', 'Cabeza'], ['cara', 'Cara'], ['cuerpo', 'Cuerpo'], ['brazos', 'Brazos'], ['piernas', 'Piernas'], ['colores', 'Colores']];
  var LK_ROWS = {
    pelo: ['style', 'hair', 'hair2', 'hairFx', 'skin'],   // (1.18, WP2: segundo color y efecto de pelo)
    cabeza: ['head', 'eyes', 'ears'], cara: ['paint', 'marks', 'beard'], cuerpo: ['neck', 'under', 'band', 'legs'],
    brazos: ['armL', 'armR', 'elbows', 'wristL', 'wristR', 'hands'], piernas: ['knees', 'socks', 'ankle', 'shoes'],
    colores: ['c:acc', 'c:acc2', 'c:sock', 'c:shoe', 'c:glass', 'c:pad']
  };
  var LK_LABEL = {
    style: 'Peinado', hair: 'Color de pelo', hair2: 'Segundo color', hairFx: 'Efecto de pelo', skin: 'Piel', head: 'Gorro', eyes: 'Gafas', ears: 'Pendientes', paint: 'Pintura', marks: 'Marcas', beard: 'Barba',
    neck: 'Cuello', under: 'Interior', band: 'Brazalete', legs: 'Mallas', armL: 'Manguito (brazo izq.)', armR: 'Manguito (brazo dcho.)', elbows: 'Coderas',
    wristL: 'Muñequera (izq.)', wristR: 'Muñequera (dcha.)', hands: 'Manos', knees: 'Rodilleras', socks: 'Calcetines', ankle: 'Tobillera', shoes: 'Zapatillas',
    'c:acc': 'Complementos', 'c:acc2': 'Detalles', 'c:sock': 'Calcetines', 'c:shoe': 'Zapatillas', 'c:glass': 'Montura', 'c:pad': 'Rodilleras'
  };
  // valor '' de cada ranura (siempre disponible); las zapatillas '' solo existen en la playa (descalzo). Manda sobre VB.Look.name:
  // «Nada» a secas no decía qué faltaba (U9)
  var LK_NONE = {
    head: 'Sin gorro', eyes: 'Sin gafas', ears: 'Sin pendientes', paint: 'Sin pintura', marks: 'Sin marcas', beard: 'Sin barba', neck: 'Sin collar', under: 'Sin camiseta interior', band: 'Sin brazalete',
    armL: 'Sin manguito', armR: 'Sin manguito', elbows: 'Sin coderas', wristL: 'Sin muñequera', wristR: 'Sin muñequera', hands: 'Manos libres', legs: 'Sin mallas',
    knees: 'Sin rodilleras', socks: 'Sin calcetines', ankle: 'Sin tobillera', shoes: 'Descalzo', hair2: 'Sin segundo color', hairFx: 'Sin efecto'
  };
  // encuadre de cada pestaña al entrar en ella (VB.Doll.preview.frame); al tocar o enfocar una fila manda el de su ranura (frameSlot)
  var LK_FRAME = { pelo: 'cabeza', cabeza: 'perfil', cara: 'cara', cuerpo: 'torso', brazos: 'brazos', piernas: 'piernas' };   // el resto, 'cuerpo'
  // giro de cada pestaña al entrar (como el de frameSlot: 0 = de frente; los brazos, de frente para ver los dos)
  var LK_TAB_SLOT = { pelo: 'style', cabeza: 'head', cara: 'paint', cuerpo: 'under', brazos: 'elbows', piernas: 'knees', colores: '' };
  var LK_CHIPS = [['auto', 'De serie'], ['eq', 'Equipo'], ['ac', 'Acento'], ['os', 'Oscuro'], ['bl', 'Blanco'], ['ne', 'Negro']];
  // «Probar»: pose y cara del muñeco, en rueda
  var LK_TRY = [['spike', 'grito', 'Remate'], ['cel', 'alegria', 'Celebración'], ['recv', 'concentrado', 'Recepción'], ['stand', 'neutra', 'De pie']];
  var LK_CAPS = { gorra: 1, gorraAtras: 1, pescador: 1, gorraMTC: 1 };   // sustituyen al pelo (de reserva si doll.js / look.js no publican HIDE_HAIR)
  // peinados que asoman enteros con gorra de copa: los dice doll.js (HAIR_UNDER_CAP, de HAIR_STYLES); esta lista es la de reserva (lkUnderCap)
  var LK_UNDER_CAP = { coleta: 1, trenzas: 1, coletas: 1 };
  // tobilleras que quedan bajo un calcetín que sube por el tobillo (de reserva si doll.js no publica UNDER_SOCK; el aviso «queda bajo los
  // calcetines» solo sale si de verdad no se ve: lookvis la mide INVISIBLE en pista con calcetín)
  var LK_UNDER_SOCK = { blanca: 1 }, LK_SOCK_UP = { media: 1, altos: 1, altosRayas: 1, desparejados: 1 };
  // lo de la cara que de espaldas, en el partido, no se ve (tools/lookvis.js: 0 px de espaldas en el móvil)
  var LK_FACE_ONLY = { paint: 1, marks: 1, beard: 1 };
  var lk = { on: false, who: 0, venue: 'hall', hall: false, fit: null, saved: null, dirty: false, nul: false, ctc: null, num: 1, o: null, tab: 'pelo',
    tryI: -1, lastStep: 0, pvT: 0, pvDue: false, idle: 0, rep: 0, repT: 0, drag: null, keySpin: 0, btnSpin: 0, btnT: 0, padSpin: 0, footI: 0, ukey: '',
    grid: '', gFam: '', zoom: false, slot: '', flash: '', bd: false, tapT: 0, tapX: 0, tapY: 0 };
  var lkTabs = null, lkNq = [], lkNT = 0, lkCheckPend = true;
  function LK() { return VB.Look || null; }
  function lkPV() { var D = VB.Doll; return D && D.preview ? D.preview : null; }
  function lkClone(f) { try { return f ? JSON.parse(JSON.stringify(f)) : null; } catch (e) { return null; } }
  function lkCap(s) { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function lkVKey() { return lk.venue === 'beach' ? 'beach' : 'hall'; }
  /** Carrera activa (la de VB.Career.mode()) con lo que hace falta para vestir a su jugador, o null. */
  function lkCareer() {
    var C = VB.Career, CL = VB.CareerLife;
    if (!C || !C.mode || !C.has || !CL || !CL.setLook || !CL.lookNow) return null;
    try {
      var m = C.mode(); if (!C.has(m)) return null;
      var c = C.get(); if (!c) return null;
      var k = C.myClub ? C.myClub(c) : null, kt = k && k.kit;
      return { hall: m === 'hall', num: (c.player && +c.player.num) || 1,
        kit: kt ? { kitShirt: kt.shirt, kitAccent: kt.accent, kitShorts: kt.shorts, kitPattern: kt.pattern, kitLibero: kt.libero } : null };
    } catch (e) { return null; }
  }
  function lkSquadNum(i) { try { var a = VB.Prog && VB.Prog.get().a[i]; return (a && +a.num) || i + 1; } catch (e) { return i + 1; } }
  /** Equipación con la que se pintan las fichas eq/ac/os y la vista previa: la del club en la Carrera, la de Ajustes en el resto. */
  function lkTc() {
    if (lk.who === 'career') return lk.ctc;
    try { return VB.Players && VB.Players.kit ? VB.Players.kit(0) : null; } catch (e) { return null; }
  }
  // atlas de la vista previa (WP1 del plan del Vestuario): 1024² (px 2) también en el móvil, que es donde se personaliza; 512² solo en
  // calidad baja o en ventanas de menos de 320 px CSS de alto. Es un solo muñeco: 4 MB de atlas en vez de 1
  function lkPvPx() {
    var q = ctx.quality, h = 0;
    try { h = window.innerHeight || 0; } catch (e) { h = 0; }
    return (q && q.rank === 0) || (h && h < 320) ? 1 : 2;
  }
  // (soon, pulido: la malla nueva se monta por pasos entre frames; doll.js pvJobStart)
  function lkPvOpts() { return { tc: lkTc(), num: lk.num, beach: lk.venue === 'beach', px: lkPvPx(), soon: true }; }
  // ---- lectura y escritura de una ranura en un fit (identidad y colores comunes; ropa por escenario) ----
  function lkGetFrom(f, slot) {
    if (!f) return '';
    if (slot === 'style' || slot === 'skin' || slot === 'hair' || slot === 'hair2' || slot === 'hairFx') return f[slot] != null ? f[slot] : '';
    if (slot.indexOf('c:') === 0) return f.colors && f.colors[slot.slice(2)] != null ? f.colors[slot.slice(2)] : 'auto';
    var s = f[lkVKey()]; return s && s[slot] != null ? s[slot] : '';
  }
  function lkGet(slot) { return lkGetFrom(lk.fit, slot); }
  // (elegir algo en una ruta borra lo que una versión más nueva dejó guardado en ella, _keep: si no, volvería al guardar en esa versión)
  function lkUnkeep(f, path) { var Lk = LK(); try { if (Lk && Lk.unkeep) Lk.unkeep(f, path); } catch (e) { } }
  function lkPut(f, slot, v) {
    if (slot === 'style' || slot === 'skin' || slot === 'hair' || slot === 'hair2' || slot === 'hairFx') { f[slot] = v; lkUnkeep(f, slot); return; }
    if (slot.indexOf('c:') === 0) { if (!f.colors || typeof f.colors !== 'object') f.colors = {}; f.colors[slot.slice(2)] = v; lkUnkeep(f, 'colors.' + slot.slice(2)); return; }
    var k = lkVKey(); if (!f[k] || typeof f[k] !== 'object') f[k] = {}; f[k][slot] = v; lkUnkeep(f, k + '.' + slot);
  }
  /** Ranura que se pasa a VB.Look.fix: la de SLOTS, 'style'/'skin'/'hair' o 'colors'. */
  function lkFixSlot(slot) { return slot.indexOf('c:') === 0 ? 'colors' : slot; }
  // ---- opciones de cada fila: [{v (valor del fit), name, hex (-1 sin muestra), rar (0-3 o null), cat (se puede tener o no)}] ----
  // El orden y los valores los da VB.Look.choices(clave, sede); los nombres, VB.Look.name. Sin choices (look.js antiguo), del
  // catálogo (cada objeto con slots: los manguitos y las muñequeras valen para los dos lados).
  function lkKey(slot) { return slot.indexOf('c:') === 0 ? slot.slice(2) : slot; }
  function lkHex(e) { return typeof e === 'number' ? e : e && typeof e.hex === 'number' ? e.hex : -1; }
  function lkOptOf(v, key) {
    var Lk = LK(), it = typeof v === 'string' && v && Lk.item ? Lk.item(v) : null, nm = '', hex = -1, rar = null;
    if (v === '' && LK_NONE[key]) nm = LK_NONE[key];
    else try { nm = Lk.name ? Lk.name(v, key) : ''; } catch (e) { nm = ''; }
    if (!nm) nm = v === '' ? LK_NONE[key] || 'Nada' : it && it.name ? it.name : String(v);
    if (typeof v === 'number') hex = v;
    else if (it) { hex = lkHex(it); rar = typeof it.rarity === 'number' ? it.rarity : 0; }
    if (Lk.COLOR_KEYS && Lk.COLOR_KEYS.indexOf(key) >= 0 || /^(acc|acc2|sock|shoe|glass|pad)$/.test(key)) {
      var tc = lkTc() || {}, T = { eq: tc.base, ac: tc.accent, os: tc.dark, bl: 0xf4f4f4, ne: 0x22222a };
      hex = typeof T[v] === 'number' ? T[v] : -1;
      (Lk.PALETTE || []).forEach(function (q) { if (q.id === v) { hex = lkHex(q); if (q.unlock) rar = 2; } });
      if (v === 'auto') hex = -1;
    }
    return { v: v, name: nm, hex: hex, rar: rar, cat: typeof v === 'string' && v !== '' };
  }
  function lkVals(key) {
    var Lk = LK(); if (Lk.choices) { try { return Lk.choices(key, lk.venue) || []; } catch (e) { return []; } }
    var beach = lk.venue === 'beach', cat = (Lk.CATALOG || []).filter(function (it) {
      var sl = it.slots || [it.slot], v = it.venue || 'A';
      return sl.indexOf(key) >= 0 && (v === 'A' || (v === 'Y') === beach);
    }).map(function (it) { return it.id; });
    if (key === 'style') return cat.length ? cat : (Lk.STYLES || []).slice();
    if (key === 'skin') return (Lk.SKINS || []).slice();
    if (key === 'hair') return (Lk.HAIRS || []).concat((Lk.CATALOG || []).filter(function (it) { return it.slot === 'hairTint'; }).map(function (it) { return it.id; }));
    if (/^(acc|acc2|sock|shoe|glass|pad)$/.test(key)) return LK_CHIPS.map(function (c) { return c[0]; }).concat((Lk.PALETTE || []).map(function (q) { return q.id; }));
    return [''].concat(cat);
  }
  function lkOpts(slot) {
    var Lk = LK(); if (!Lk) return [];
    var key = lkKey(slot), beach = lk.venue === 'beach';
    // un color que nada de esta sede usa no sale (WP1: VB.Look.uses; el de calcetín sí en la playa si hay escarpines, y el de
    // rodilleras cuando alguna lo use); sin uses (look.js antiguo), como antes: sin calcetín ni zapatilla en la playa
    if (/^(acc|acc2|sock|shoe|glass|pad)$/.test(key)) { if (Lk.uses) { if (!lkUses(key).length) return []; } else if (key === 'pad' || ((key === 'sock' || key === 'shoe') && beach)) return []; }
    var vals = lkVals(key);
    if (key === 'shoes' && !beach) vals = vals.filter(function (v) { return v !== ''; });   // en pista no se juega descalzo
    return vals.map(function (v) { return lkOptOf(v, key); });
  }
  function lkIdx(ops, v) { for (var i = 0; i < ops.length; i++) if (ops[i].v === v) return i; return -1; }
  function lkLocked(o) {
    var Lk = LK(); if (!o || !o.cat || !Lk || !Lk.owned) return false;
    try { return !Lk.owned(o.v); } catch (e) { return false; }
  }
  function lkHint(o) { var Lk = LK(), it = o && o.cat && Lk.item ? Lk.item(o.v) : null; return it && it.hint ? it.hint : ''; }
  function lkHallTxt() { return lk.who === 'career' ? lk.hall : lk.venue === 'hall'; }
  function lkLockText(o) {
    var Lk = LK(); if (!Lk || !Lk.lockText) return '';
    try { return Lk.lockText(o.v, lkHallTxt()) || ''; } catch (e) { return ''; }
  }
  function lkItemName(id) {
    var Lk = LK(); if (!Lk) return String(id);
    try { var it = Lk.item ? Lk.item(id) : null; if (it && it.name) return it.name; var n = Lk.name ? Lk.name(id) : ''; return n || String(id); } catch (e) { return String(id); }
  }
  function lkUnseen() { var Lk = LK(); if (!Lk || !Lk.unseen) return []; try { return Lk.unseen() || []; } catch (e) { return []; } }
  function lkStars(r) { var s = ''; for (var i = 0; i <= r; i++) s += '★'; return s; }
  function lkTabOf(slot) {
    if (slot === 'hairTint') return 'pelo';
    for (var t in LK_ROWS) if (LK_ROWS[t].indexOf(slot) >= 0) return t;
    return '';
  }
  // ---- carga, guardado y avisos ----
  /** Carga en la copia de trabajo el aspecto guardado de `w` (0 | 1 | 'career'). */
  function lkLoad(w) {
    var Lk = LK(), f = null;
    if (w === 'career' && !lkCareer() && !(lk.o && lk.o.who === 'career')) w = 0;   // sin Carrera activa: el n.º 1
    lk.who = w; lk.dirty = false; lk.nul = false; lkTryStop(false); lk.tryLast = null; lkUndoDrop();
    if (w === 'career') {
      var car = lkCareer(), oc = lk.o && lk.o.who === 'career' ? lk.o : null;
      lk.hall = oc && oc.hall != null ? !!oc.hall : !!(car && car.hall);
      lk.venue = lk.hall ? 'hall' : 'beach';   // en la Carrera solo se juega en su escenario
      lk.ctc = oc && oc.tc ? oc.tc : null;
      if (!lk.ctc && car && car.kit && VB.Players && VB.Players.kitFrom) try { lk.ctc = VB.Players.kitFrom(car.kit); } catch (e) { lk.ctc = null; }
      lk.num = (car && car.num) || 1;
      try { f = VB.CareerLife && VB.CareerLife.lookNow ? VB.CareerLife.lookNow() : null; } catch (e) { f = null; }
      // guardado antiguo de pista (l.look === null): la cara de siempre hasta que se guarde; se edita desde el aspecto del n.º 1
      if (!f) { lk.nul = true; try { f = Lk && Lk.fit ? Lk.fit(0) : null; } catch (e) { f = null; } }
    } else {
      lk.num = lkSquadNum(w);
      try { f = Lk && Lk.fit ? Lk.fit(w) : null; } catch (e) { f = null; }
    }
    if (!f && Lk && Lk.defaults) try { f = Lk.defaults(w === 'career' ? 0 : w); } catch (e) { f = null; }
    lk.fit = lkClone(f); lk.saved = lkClone(f);
  }
  function lkSig(f) { var Lk = LK(); try { return Lk && Lk.sig ? Lk.sig(f) : JSON.stringify(f); } catch (e) { return JSON.stringify(f); } }
  /** Guarda la copia de trabajo (si cambió): lo bloqueado vuelve a lo guardado (wearable) y se avisa. */
  function lkCommit() {
    var Lk = LK(); if (!lk.fit || !lk.dirty || !Lk) { lk.dirty = false; return; }
    var w = lk.fit;
    try { if (Lk.wearable) w = Lk.wearable(lk.fit, lk.saved) || lk.fit; } catch (e) { w = lk.fit; }
    var lost = lkSig(w) !== lkSig(lk.fit), ok = false;
    if (lkSig(w) !== lkSig(lk.saved)) {
      try {
        if (lk.who === 'career') { if (VB.CareerLife && VB.CareerLife.setLook) { VB.CareerLife.setLook(w); ok = true; } }
        else if (Lk.setFit) { Lk.setFit(lk.who, w); ok = true; }
      } catch (e) { ok = false; }
      if (ok && ctx.actions && ctx.actions.looksChanged) try { ctx.actions.looksChanged(); } catch (e) { }
    }
    lk.dirty = false; lk.fit = lkClone(w); lk.saved = lkClone(w); if (ok) lk.nul = false;
    lkNote(ok ? (lost ? 'Guardado. Lo bloqueado no se guarda' : 'Guardado') : lost ? 'Lo bloqueado no se guarda' : '', true);
  }
  /** Aviso corto del Vestuario (#lkNote, en #menu: se ve también al volver a otra página) y al lector de pantalla. */
  function lkNote(t, now) {
    if (!t || !el.lkNote) return;
    if (now) { lkNq.length = 0; lkNT = 0; }   // lo de ahora (guardado) pasa delante de los avisos que quedaban
    if (lkNq[lkNq.length - 1] === t || (lkNT > 0 && el.lkNote.textContent === t && !lkNq.length)) return;
    lkNq.push(t); if (lkNq.length > 4) lkNq.shift();
    srSay(t);
    if (lkNT <= 0) lkNoteNext();
  }
  var lkNoteApi = null;
  function lkNoteNext() {
    var t = lkNq.shift();
    if (!t) { el.lkNote.classList.remove('on'); lkNT = 0; return; }
    lkNT = t.length > 40 ? 3.4 : 2.6;
    // móvil: al carril de avisos de arriba a la derecha (VB.Splat.toast)
    if (VB.Splat && VB.Splat.phone && VB.Splat.phone() && VB.Splat.toast) { el.lkNote.classList.remove('on'); el.lkNote.textContent = t; lkNoteApi = VB.Splat.toast(escT(t), { key: 'lknote', ms: lkNT * 1000 }); return; }
    el.lkNote.textContent = t; restartAnim(el.lkNote, 'on');
  }
  /** Lo ganado fuera de la Carrera (récord y Entrenamiento): VB.Look.checkGlobal y aviso «Nuevo en tu vestuario». */
  //  (B6: la concesión es lookGrantNow, que la hoja final llama antes; aquí queda el aviso de lo que aún no se haya enseñado. Los retos
  //  y el nivel de perfil los lee checkGlobal solo, de VB.Retos.lookData() y VB.Profile.level())
  function lkCheckNew() {
    var ids = lookGrantNow();
    if (!ids.length) return;
    var names = ids.map(lkItemName);
    pfDirty = true; last.pf = null; if (ctx.state === 'menu' && mpage === 'prof') pfRender(true);   // (D2: el álbum y el chip lo cuentan)
    lkNote('Nuevo en tu vestuario: ' + (names.length > 3 ? names.length + ' objetos' : names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1]));
    if (ctx.state === 'menu') { last.navh = null; renderMenu(); if (lk.on) lkRender(); }
  }
  // ---- pintado de la página ----
  var LK_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M7 10V7.5a5 5 0 0 1 10 0V10h1a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 6 10zm2.6 0h4.8V7.5a2.4 2.4 0 0 0-4.8 0z"/></svg>';
  var LK_EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 5c4.6 0 8.3 3.1 10 7-1.7 3.9-5.4 7-10 7S3.7 15.9 2 12c1.7-3.9 5.4-7 10-7zm0 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  var LK_ARR_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>', LK_ARR_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
  /** ¿Asoma este peinado bajo una gorra? Lo dice doll.js (WP2: VB.Doll.HAIR_UNDER_CAP, los de HAIR_STYLES con hat:'show'); si no está,
   *  la lista de reserva LK_UNDER_CAP (coleta, trenzas y coletas). */
  function lkUnderCap(st) {
    var U = (VB.Doll && VB.Doll.HAIR_UNDER_CAP) || LK_UNDER_CAP;
    return !!U[st];
  }
  function lkHides(hd) { var H = (VB.Doll && VB.Doll.HIDE_HAIR) || (VB.Look && VB.Look.HIDE_HAIR) || LK_CAPS; return !!hd && (Array.isArray(H) ? H.indexOf(hd) >= 0 : !!H[hd]); }
  /** ¿Tapa el gorro el peinado? (gorra, gorra al revés, pescador y la de «MTC»; los que asoman, no) */
  function lkCapHides() { var hd = lkGet('head'); return lkHides(hd) && !lkUnderCap(lkGet('style')); }
  /** Objetos de esta sede que usan el hueco de color key (VB.Look.uses; [] sin él). */
  function lkUses(key) { var Lk = LK(); if (!Lk || !Lk.uses) return []; try { return Lk.uses(key, lk.venue) || []; } catch (e) { return []; } }
  /** Nombres de lo que LLEVAS ahora (peinado y ropa de la sede) que pinta el color key, sin repetir. */
  function lkWornUsing(key) {
    var u = lkUses(key), f = lk.fit, s = f && f[lkVKey()], out = [], seen = {};
    if (!u.length || !f) return out;
    var cand = [f.style]; if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) cand.push(s[k]);
    for (var i = 0; i < cand.length; i++) { var id = cand[i]; if (typeof id === 'string' && id && !seen[id] && u.indexOf(id) >= 0) { seen[id] = 1; out.push(lkItemName(id)); } }
    return out;
  }
  /** «a», «a y b», «a, b y 2 más». */
  function lkList(n) { return n.length <= 1 ? n.join('') : n.length === 2 ? n[0] + ' y ' + n[1] : n.slice(0, 2).join(', ') + ' y ' + (n.length - 2) + ' más'; }
  /** Línea de ayuda de una fila y su tipo: {t: texto (sin escapar), k: 'lock' | 'warn' | 'use' | 'dim' | 'hint' | ''}. Bloqueado: cómo se
   *  gana y que se puede probar (en todos los tamaños, U7). Avisos de lo que no se ve: peinado bajo la gorra, tobillera bajo el calcetín,
   *  lo de la cara de espaldas. Colores: qué pintan («Pinta: Coleta y Manguito») o, atenuada, que no llevas nada de ese color (U4). */
  function lkHelpOf(slot, o, locked, lt) {
    if (locked) return { t: (lt || 'Aún no lo tienes') + '. Se puede probar', k: 'lock' };
    var v = o && o.v;
    if (slot.indexOf('c:') === 0) {
      var w = lkWornUsing(slot.slice(2));
      return w.length ? { t: 'Pinta: ' + lkList(w), k: 'use' } : { t: 'No llevas nada de este color', k: 'dim' };
    }
    if (slot === 'style' && lkCapHides()) return { t: 'Con gorra no se ve entero; aquí, sin ella', k: 'warn' };
    // (pulido: efectos que el peinado no pinta, p. ej. las raíces en el rapado o cualquiera al cero: VB.Doll.HAIR_STYLES[id].noFx)
    if (slot === 'hairFx' && v) {
      var HS = VB.Doll && VB.Doll.HAIR_STYLES, nf = HS && HS[lkGet('style')] && HS[lkGet('style')].noFx;
      if (nf && (nf === true || nf[v])) return { t: 'Con este peinado no se ve', k: 'warn' };
    }
    if (slot === 'head' && v && lkHides(v) && !lkUnderCap(lkGet('style'))) return { t: 'Tapa el peinado', k: 'warn' };
    if (slot === 'ankle' && v && lk.venue !== 'beach') {
      var U = (VB.Doll && VB.Doll.UNDER_SOCK) || LK_UNDER_SOCK, sk = lkGet('socks');
      if ((Array.isArray(U) ? U.indexOf(v) >= 0 : !!U[v]) && LK_SOCK_UP[sk]) return { t: 'Queda bajo los calcetines', k: 'warn' };
    }
    if (LK_FACE_ONLY[slot] && v) return { t: 'De espaldas, en el partido, no se ve', k: 'warn' };
    var h = lkHint(o);
    // (pulido: «Con gorra no se ve el peinado entero» no vale con un peinado que asoma entero bajo la gorra: coleta, trenzas…)
    if (slot === 'head' && h && /no se ve el peinado/.test(h) && lkUnderCap(lkGet('style'))) h = '';
    return { t: h, k: h ? 'hint' : '' };
  }
  var LK_GRID_IC = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="0.5" y="0.5" width="4.6" height="4.6" rx="1"/><rect x="6.9" y="0.5" width="4.6" height="4.6" rx="1"/><rect x="0.5" y="6.9" width="4.6" height="4.6" rx="1"/><rect x="6.9" y="6.9" width="4.6" height="4.6" rx="1"/></svg>';
  function lkRowHTML(slot, U) {
    var ops = lkOpts(slot); if (ops.length < 2) return '';   // lo que no vale en este escenario no sale
    // (revisión final: un color que no pinta nada de lo que llevas tampoco sale; se podía elegir sin ver ningún cambio. El valor se
    //  guarda igual y la fila vuelve en cuanto te pones algo de ese color; lkRender avisa debajo)
    if (slot.indexOf('c:') === 0 && !lkWornUsing(slot.slice(2)).length) return '';
    var cur = lkGet(slot), i = lkIdx(ops, cur), o = i >= 0 ? ops[i] : lkOptOf(cur, lkKey(slot));
    var locked = lkLocked(o), lt = locked ? lkLockText(o) : '', label = LK_LABEL[slot], n = ops.length;
    var isNew = false; for (var k = 0; k < ops.length && !isNew; k++) if (ops[k].cat && U[ops[k].v]) isNew = true;
    var col = lkIsCol(slot), hp = lkHelpOf(slot, o, locked, lt);
    var sw = o.hex >= 0 ? '<i class="lk-sw" style="background:' + hx(o.hex) + '"></i>' : col ? '<i class="lk-sw auto"></i>' : '';
    var help = hp.t ? (hp.k === 'lock' ? LK_LOCK : hp.k === 'warn' ? LK_EYE : '') + escT(hp.t) : '';
    // la estrella solo desde rareza 1 (lo común no lleva: antes todo llevaba «★», U9)
    var st = o.rar != null && o.rar >= 1 ? '<span class="lk-st" aria-hidden="true">' + lkStars(o.rar) + '</span>' : '';
    var aria = label + ': ' + o.name + ', ' + (i >= 0 ? i + 1 : 1) + ' de ' + n + (o.rar != null && o.rar >= 1 ? '. Rareza: ' + (o.rar + 1) + ' de 4' : '') +
      (locked ? '. Bloqueado: ' + (lt || 'aún no lo tienes') + '. Se puede probar, pero no se guarda' : '') + (hp.t && !locked ? '. ' + hp.t : '') + (isNew ? '. Hay algo nuevo' : '') +
      '. Pulsa para ver todas las opciones';
    // SPLAT: pegatina de tinta (la silueta cambia con su puesto en la lista); bloqueado = cinta gris; nuevo = punto rojo
    return '<button type="button" class="mi lk-r sp-btn sp-ink sp-calm' + (locked ? ' lock' : '') + (isNew ? ' new sp-dot' : '') + (col ? ' col' : '') + (hp.k === 'dim' ? ' dim' : '') +
      (hp.t ? ' has-h h-' + hp.k : '') + '" data-look="' + slot + '" aria-label="' + escT(aria) + '"' + (locked ? ' aria-disabled="true"' : '') + '>' +
      // (rótulo con «▦ n»: cuántas opciones hay y que al tocar la fila se abre la rejilla de miniaturas; antes no se veía que la hubiera)
      '<span class="mi-l"><span class="lk-k">' + escT(label) + '<span class="lk-cnt" aria-hidden="true">' + LK_GRID_IC + n + '</span></span><span class="lk-v">' + sw + '<span class="lk-n">' + escT(o.name) + '</span>' + st + '</span>' +
      (help ? '<small class="mi-h">' + help + '</small>' : '') + '</span>' +
      '<span class="mi-v sp-select"><span class="arr" data-d="-1" aria-hidden="true">' + LK_ARR_L + '</span><span class="arr" data-d="1" aria-hidden="true">' + LK_ARR_R + '</span></span></button>';
  }
  /** Filas con algo sin ver (punto) y marca como visto lo que ya enseña su fila. */
  function lkSeen(U) {
    var Lk = LK(), seen = [];
    (LK_ROWS[lk.tab] || []).forEach(function (s) { var v = lkGet(s); if (typeof v === 'string' && v && U[v]) seen.push(v); });
    if (seen.length && Lk && Lk.markSeen) try { Lk.markSeen(seen); } catch (e) { }
  }
  var lkPlaceQ = 0;
  function lkRender(focusSlot) {
    if (!el.mpLook || !lk.fit) return;
    var U = {}, uu = lkUnseen(); uu.forEach(function (id) { U[id] = 1; });
    // selector de jugador (radio; solo el elegido entra en el recorrido ↑/↓, ←/→ cambia)
    var car = lkCareer(), picks = [[0, '<span class="lk-sx">N.º </span>' + lkSquadNum(0)], [1, '<span class="lk-sx">N.º </span>' + lkSquadNum(1)]];   // (a 320 de alto, sin «N.º»: va en la fila del título)
    if (car || lk.who === 'career') picks.push(['career', 'Carrera']);
    var ph = '';
    picks.forEach(function (p) {
      var on = p[0] === lk.who;
      ph += '<button type="button" class="lk-pk sp-tab' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-lkpick="' + p[0] + '"' + (on ? '' : ' tabindex="-1" data-skip') +
        (p[0] === 'career' ? ' title="Tu jugador de la Carrera"' : '') + '>' + p[1] + '</button>';
    });
    var ae = document.activeElement, kb = !!(ae && ae.classList && ae.classList.contains('kf'));
    var fPick = ae && el.lkPick.contains(ae), fVen = ae && el.lkVen.contains(ae);
    if (el.lkPick._h !== ph) { el.lkPick._h = ph; el.lkPick.innerHTML = ph; if (fPick) focusEl(el.lkPick.querySelector('.lk-pk.on'), kb); }
    // escenario (no en la Carrera: se juega siempre en el suyo)
    el.lkVen.hidden = lk.who === 'career';
    var vb = el.lkVen.querySelectorAll('button');
    for (var i = 0; i < vb.length; i++) {
      var von = vb[i].getAttribute('data-ven') === lk.venue;
      vb[i].classList.toggle('on', von); vb[i].setAttribute('aria-checked', von ? 'true' : 'false');
      if (von) { vb[i].removeAttribute('tabindex'); vb[i].removeAttribute('data-skip'); } else { vb[i].setAttribute('tabindex', '-1'); vb[i].setAttribute('data-skip', ''); }
    }
    if (fVen) focusEl(el.lkVen.querySelector('button.on'), kb);
    // pie en iconos: «Copiar a playa / a pista» (no en la Carrera); solo el icono elegido entra en el recorrido ↑/↓
    var cp = el.lkFoot.querySelector('[data-lkf="copy"]');
    if (cp) {
      cp.hidden = lk.who === 'career';
      var cpt = lk.venue === 'beach' ? 'Copiar a pista' : 'Copiar a playa';
      if (cp.getAttribute('aria-label') !== cpt) { cp.setAttribute('aria-label', cpt); cp.title = cpt; }
    }
    lkFootSync(false);
    // ayuda de la página
    var help = lk.nul && !lk.dirty ? 'Tu jugador lleva su aspecto de siempre hasta que guardes' : '';
    if (el.lkHelp.textContent !== help) el.lkHelp.textContent = help;
    el.lkHelp.hidden = !help;
    // pestañas: punto en las que tienen algo sin ver
    if (lkTabs) {
      var items = LK_TABS.map(function (t) {
        var nw = uu.length > 0 && (LK_ROWS[t[0]] || []).some(function (s) { return lkOpts(s).some(function (o) { return o.cat && U[o.v]; }); });
        return { id: t[0], label: t[1], icon: TAB_IC['lk_' + t[0]] || '', cls: nw ? 'lk-new' : '' };
      });
      var key = items.map(function (x) { return x.cls; }).join(',');
      if (lk.ukey !== key) { lk.ukey = key; lkTabs.refresh(items); fitTabs(lkTabs); }
      lkTabs.hint();
    }
    // filas de la pestaña
    var fs = focusSlot || (ae && el.lkList.contains(ae) && ae.getAttribute ? ae.getAttribute('data-look') : '');
    var h = '', nOff = 0; (LK_ROWS[lk.tab] || []).forEach(function (s) { var r = lkRowHTML(s, U); if (!r && s.indexOf('c:') === 0) nOff++; h += r; });
    if (!h) h = '<p class="lk-empty">Nada que cambiar aquí ' + (lk.venue === 'beach' ? 'en la playa' : 'en la pista') + '</p>';
    else if (nOff) h += '<p class="lk-empty lk-off">Los demás colores salen cuando llevas algo que los use</p>';
    if (el.lkList._h !== h) {
      el.lkList._h = h; el.lkList.innerHTML = h; if (VB.Splat) VB.Splat.decorate(el.lkList);
      if (fs) { var nb = el.lkList.querySelector('[data-look="' + fs + '"]'); if (nb) focusEl(nb, kb || focusSlot != null && kbNow()); }
      // (pulido: la lista cambia de alto —Piernas de playa tiene una sola fila— y en vertical el hueco del muñeco con ella: se vuelve a
      //  medir; antes los pies quedaban pegados al título con media pantalla de arena vacía debajo)
      if (!lkPlaceQ) lkPlaceQ = requestAnimationFrame(function () { lkPlaceQ = 0; if (lk.on) lkPlace(); });
    }
    lkSeen(U);
    lkMore();
    // nombre de la pestaña en la cabecera (en el móvil y en vertical las pestañas van en iconos: U6)
    if (el.lkTabChip) { var tn = ''; LK_TABS.forEach(function (t) { if (t[0] === lk.tab) tn = t[1]; }); if (el.lkTabChip.textContent !== tn) el.lkTabChip.textContent = tn; }
    if (lk.grid) lkGridRender();
  }
  /** Hueco libre del muñeco (WP6: «el muñeco sin tapar»). Mide lo que hay alrededor y se lo pasa a doll.js (preview.place: centro y
   *  medio ancho a lo ancho, franjas tapadas arriba y abajo), que aleja la cámara hasta que el encuadre cabe y lo centra ahí.
   *  - Apaisado: a la derecha de la columna (y de la barra de pestañas e iconos, que en PC sale de ella); en el móvil la columna de
   *    acciones (Probar, Al azar, «⋯») y «Dar la vuelta» van al borde derecho, y el muñeco queda entre las dos. En PC ⟲ ↻ ⟳ van debajo
   *    del muñeco (franja de abajo) y la cabecera, si llega encima del hueco, es la franja de arriba.
   *  - Vertical: entre la cabecera (arriba) y el selector de jugador (abajo), y entre ⟲ ↻ ⟳ (a la izquierda) y las acciones (a la derecha).
   *  También lo usa el CSS (--lkcx: aviso y botones bajo el muñeco). */
  function lkPlace() {
    if (!lk.on || !el.mpLook || !el.menu) return;
    var W = window.innerWidth || 1, H = window.innerHeight || 1, L = 0, R = W, T = 0, B = H, clip = 0, clipT = 0;
    function rc(n) { if (!n || !n.getClientRects().length) return null; var r = n.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? r : null; }
    var col = rc(el.mpLook), foot = rc(el.lkFoot), rot = rc(el.lkSpin && el.lkSpin.querySelector('.lk-rot'));
    var hd = rc(el.mpLook.querySelector('.mp-head')), top = rc(el.mpLook.querySelector('.lk-top'));
    if (W > H) {
      // la columna: en PC el carril de pestañas e iconos sale de ella a la derecha (y la lista de opciones no: es la columna)
      L = col ? col.right : 0;
      var bar = rc(el.mpLook.querySelector('.lk-bar')); if (bar && bar.right > L && bar.left < L + 40) L = Math.max(L, bar.right);
      if (foot) { if (foot.left > L + 60) R = Math.min(R, foot.left - 8); else L = Math.max(L, foot.right); }
      if (rot) {
        if (rot.width > rot.height * 1.3) B = Math.min(B, rot.top - 6);      // fila bajo el muñeco (PC)
        else if (rot.left > L + 60) R = Math.min(R, rot.left - 8);           // columna al borde derecho (móvil)
      }
      if (lk.tryFull) L = 0;   // («Probar» a lo ancho: lkTryFull)
      L += 6;
      if (hd && hd.right > L && hd.left < R && !lk.tryFull) T = Math.max(T, hd.bottom + 4);
    } else {
      var gd = lk.grid ? rc(el.lkGrid) : null;
      T = hd ? hd.bottom + 6 : 0;
      B = lk.tryFull ? H - 10 : gd ? gd.top - 6 : top ? top.top - 6 : H * 0.5;   // («Probar»: la lista se aparta, toda la altura)
      if (foot && foot.left > W * 0.5) R = Math.min(R, foot.left - 6);
      if (rot && rot.right < W * 0.5) L = Math.max(L, rot.right + 6);
      // WP6 (ronda 1): por debajo del hueco (jugador y sede, pestañas, lista o rejilla) el muñeco no se pinta: de cerca, el cuerpo corría
      // por detrás de las fichas y las pestañas («sin pegatinas que se pisen»); queda un busto arriba (doll.js preview.pass)
      clip = (H - (B + 4)) / H; clipT = T > 8 ? (T - 4) / H : 0;
    }
    if (R - L < W * 0.12) { L = Math.max(0, (L + R) / 2 - W * 0.06); R = L + W * 0.12; }
    if (B - T < H * 0.2) { T = Math.max(0, B - H * 0.2); }
    var cx = (L + R) / 2 / W, half = (R - L) / 2 / W;
    el.menu.style.setProperty('--lkcx', cx.toFixed(3));
    var P = lkPV(); if (P && P.place) try { P.place(cx, half, T / H, (H - B) / H, clip, clipT); } catch (e) { }
  }
  /** Desvanecido abajo mientras queden filas por debajo del borde de la lista. */
  function lkMore() {
    var L = el.lkList; if (!L || !lk.on) return;
    var more = L.scrollHeight - L.clientHeight > 8 && L.scrollTop + L.clientHeight < L.scrollHeight - 8;
    if (L.classList.contains('has-more') !== more) L.classList.toggle('has-more', more);
  }
  function lkFocusEl() {
    return (el.lkList && el.lkList.querySelector('[data-look]')) || (el.lkTabs && el.lkTabs.querySelector('.tab.on')) || el.btnLookBack;
  }
  /** Pie: data-skip en los iconos no elegidos (↑/↓ pasa por el pie una sola vez; ←/→ elige icono). */
  /** Botones del pie que se ven (V-LKFOOT: en móvil Al azar / Restablecer / Copiar van ocultos por CSS y entra el «⋯», data-lkf="more"). */
  function lkFootBtns() { return Array.prototype.filter.call(el.lkFoot.querySelectorAll('[data-lkf]'), function (b) { return !b.hidden && b.getClientRects().length; }); }
  function lkFootSync(focusIt) {
    var bs = lkFootBtns();
    if (!bs.length) return;
    if (lk.footI >= bs.length) lk.footI = bs.length - 1;
    var all = el.lkFoot.querySelectorAll('[data-lkf]');
    for (var i = 0; i < all.length; i++) { var on = all[i] === bs[lk.footI]; if (on) all[i].removeAttribute('data-skip'); else all[i].setAttribute('data-skip', ''); }
    if (focusIt) focusEl(bs[lk.footI], true);
  }
  function lkFootStep(d) {
    var bs = lkFootBtns();
    var j = lk.footI + (d > 0 ? 1 : -1);
    if (j < 0 || j >= bs.length) { uiSound2('arrowEdge', d); return; }
    lk.footI = j; lkFootSync(true); hoverSound();
  }
  // ---- vista previa ----
  function lkPreview() { lk.pvDue = true; if (performance.now() - lk.pvT >= 120) lkPvFlush(); }
  /** Lo que enseña la vista previa (pulido): en la pestaña Pelo, sin el gorro que tapa el peinado (gorra, pescador…). Antes, con la
   *  gorra puesta (la de la playa por defecto), elegir un peinado en la rejilla o con las flechas no cambiaba nada en el muñeco. Lo
   *  guardado no cambia: el gorro vuelve al salir de la pestaña (y la fila avisa de que con él no se ve entero). */
  function lkPvFit() {
    var f = lk.fit;
    if (f && lk.tab === 'pelo' && lkCapHides()) { f = lkClone(f); f[lkVKey()].head = ''; }
    return f;
  }
  function lkPvFlush() {
    lk.pvDue = false; lk.pvT = performance.now();
    var P = lkPV(), Lk = LK(); if (!lk.on || !P || !Lk || !Lk.resolve || !lk.fit) return;
    var L = null; try { L = Lk.resolve(lkPvFit(), lk.venue, lkTc()); } catch (e) { return; }
    // main.js: con la vista previa encendida, showroom(true) la actualiza (preview.set) y avisa a la calidad adaptativa si se rehízo
    // la malla ('geo'). Sin esa acción (main antiguo), directamente a doll.js
    if (ctx.actions && ctx.actions.showroom) { try { ctx.actions.showroom(true, L, lkPvOpts()); } catch (e) { } }
    else if (P.set && (!P.active || P.active())) { try { if (P.set(L, lkPvOpts()) === 'geo' && ctx.noteHitch) ctx.noteHitch(); } catch (e) { } }
    if (lk.flash) { var fs0 = lk.flash; lk.flash = ''; lkFlash(fs0); }   // (después de poner el color de verdad)
  }
  // ---- encuadre y giro por ranura (WP6, U2): al tocar o enfocar una fila, la cámara va a lo que cambia esa fila (el tobillo, la nuca,
  //      ese brazo…) y el muñeco se gira para enseñarlo; al entrar en una pestaña, el encuadre de la pestaña ----
  /** Familia del catálogo (WP1: fam) de un peinado. */
  function lkFam(v) { var Lk = LK(), it = null; try { it = Lk && Lk.item ? Lk.item(v) : null; } catch (e) { it = null; } return it && it.fam || ''; }
  /** ¿Lleva el peinado volumen detrás (coleta, moño, trenzas…)? Lo dice el catálogo de peinados nuevo (back) o la familia. */
  function lkBack(st) {
    var H = (VB.Doll && VB.Doll.HAIR_STYLES) || (VB.Look && VB.Look.HAIR_STYLES), h = H && !Array.isArray(H) ? H[st] : null;
    if (h && typeof h === 'object' && h.back != null) return !!h.back;
    var f = lkFam(st); return f === 'recogido' || f === 'largo';
  }
  // objetos de cabeza que se llevan detrás (la pinza de garra en la nuca, la cinta con su nudo): se enseñan de espaldas
  var LK_HEAD_BACK = { pinzas: 1, cinta: 1, bandana: 1 };
  function lkSlotBack(slot, v) { return slot === 'style' ? lkBack(v) : slot === 'head' ? !!LK_HEAD_BACK[v] : false; }
  function lkSlotOpts(slot) { return slot === 'style' || slot === 'head' ? { back: lkSlotBack(slot, lkGet(slot)) } : {}; }
  /** Tras cambiar el valor de una fila: si lo nuevo se ve detrás (o deja de verse), vuelve a encuadrar (giro incluido). */
  function lkRefocus(slot, v) {
    if (slot !== 'style' && slot !== 'head') { lkFocusSlot(slot); return; }
    var b = lkSlotBack(slot, v), was = lk.slot === slot ? !!lk.slotBack : null;
    lk.slotBack = b;
    lkFocusSlot(slot, was !== null && was !== b);
  }
  /** Encuadra la ranura slot (con su giro) si no era ya la encuadrada (o con force). «Probar» y el zum de cuerpo entero mandan. */
  function lkFocusSlot(slot, force) {
    if (!slot || !lk.on) return;
    if (slot === lk.slot && !force) return;
    lk.slot = slot; lk.zoom = false; lk.slotBack = lkSlotBack(slot, lkGet(slot));
    lkTryStop(false);   // (otra fila: se acaba la pose de «Probar» y se encuadra la fila)
    var P = lkPV(); if (P && P.frameSlot) try { P.frameSlot(slot, lkSlotOpts(slot)); } catch (e) { }
  }
  /** Encuadre de la pestaña (al entrar, al abrir y al volver de «Probar»). */
  function lkFrame() {
    var P = lkPV(); if (!P || !lk.on) return;
    try {
      // («Probar» de 3/4 de frente, pulido: con un peinado de espaldas o tras «Dar la vuelta», el remate salía visto por detrás)
      if (lk.tryI > -1 && LK_TRY[lk.tryI][0] !== 'stand') { if (P.frameSlot) P.frameSlot('', { frame: 'cuerpo', yaw: 0.45 }); else P.frame('cuerpo'); return; }
      lk.slot = ''; lk.zoom = false;
      var fr = LK_FRAME[lk.tab] || 'cuerpo', s = LK_TAB_SLOT[lk.tab] || '';
      // (pelo o cabeza con algo que se lleva detrás —coleta, trenza, pinza—: la pestaña se abre ya de espaldas)
      if (P.frameSlot && (s === 'style' || s === 'head') && lkSlotBack(s, lkGet(s))) P.frameSlot(s, { back: true });
      else if (P.frameSlot) P.frameSlot(s, { frame: fr, still: true }); else P.frame(fr);
    } catch (e) { }
  }
  /** Doble toque sobre el muñeco: del encuadre de la ranura (o de la pestaña) al cuerpo entero y vuelta, sin tocar el giro. */
  function lkZoom() {
    var P = lkPV(); if (!P || !P.frame || !lk.on) return;
    var inf = P.info ? P.info() : null, body = inf && inf.frame === 'cuerpo';
    try {
      if (!body) { lk.zoom = true; P.frame('cuerpo'); srSay('Cuerpo entero'); }
      else { lk.zoom = false; var s = lk.slot; if (s && P.frameSlot) P.frameSlot(s, { keep: true }); else P.frame(LK_FRAME[lk.tab] || 'cabeza'); srSay('De cerca'); }
    } catch (e) { }
    uiSound('click');
  }
  /** «Dar la vuelta»: 180° con giro animado. */
  function lkTurn() { var P = lkPV(); if (P && P.turn) try { P.turn(); } catch (e) { } lk.idle = 0; uiSound('click'); srSay('Media vuelta'); }
  function lkSpinBy(r) { var P = lkPV(); if (P && P.spin && r) try { P.spin(r); } catch (e) { } }
  /** Parpadeo (0,4 s) de lo que pinta el color de la fila slot ('c:…') recién cambiado: en el muñeco se ve QUÉ pinta (U4). */
  function lkFlash(slot) {
    var P = lkPV(), Lk = LK(), key = slot.slice(2), lc = Lk && Lk.COLOR_L ? Lk.COLOR_L[key] : '';
    if (!P || !P.flash || !lc || !lkWornUsing(key).length) return;
    var L = null; try { L = Lk.resolve(lkPvFit(), lk.venue, lkTc()); } catch (e) { return; }
    var c = typeof L[lc] === 'number' ? L[lc] : 0, lum = ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11) / 255;
    var L2 = Object.assign({}, L); L2[lc] = lum > 0.55 ? 0xff2f6d : 0xfff27a;   // rosa sobre lo claro, amarillo sobre lo oscuro
    try { P.flash(Object.freeze(L2), 0.4); } catch (e) { }
  }

  // ---- rejilla de opciones (WP6, U5): tocar una fila abre, en el sitio de la lista, todas sus opciones a la vez: fichas con la miniatura
  //      del PROPIO muñeco con esa opción puesta (VB.Doll.portrait con el encuadre de la ranura, una por frame, en la caché de retratos
  //      de main.js) o muestras de color de 44 px. Tocar una ficha la pone (y la deja a la vista para comparar); tocar otra vez la puesta,
  //      «‹», Esc o B vuelven a la lista. Peinados con fichas de familia. Teclado y mando: filas data-sp-row (←/→ en la fila, ↑/↓ entre
  //      filas) y A / Intro = poner. Las flechas ‹ › de cada fila siguen igual (mando y teclado) ----
  var LK_FAMS = [['corto', 'Corto'], ['medio', 'Medio'], ['largo', 'Largo'], ['recogido', 'Recogido'], ['textura', 'Textura']];
  var LK_TBG = 0x2f2560;   // fondo de las miniaturas = el de la ficha (--sp-ink2)
  var lkGK = {}, lkGSig = '';
  function lkIsCol(slot) { return slot === 'skin' || slot === 'hair' || slot === 'hair2' || slot.indexOf('c:') === 0; }
  /** Aspecto resuelto de la copia de trabajo con la opción v en slot (arreglado como lo dejaría ponerla). Para los peinados, sin el gorro
   *  que los tapa: si no, todas las fichas salían iguales. */
  function lkThumbL(slot, v) {
    var Lk = LK(), f = lkClone(lk.fit); if (!Lk || !f) return null;
    lkPut(f, slot, v);
    if (slot === 'style') { var s = f[lkVKey()]; if (s && lkHides(s.head)) s.head = ''; }
    try { var r = Lk.fix ? Lk.fix(f, lk.venue, lkFixSlot(slot)) : null; if (r && r.fit) f = r.fit; } catch (e) { }
    try { return Lk.resolve(f, lk.venue, lkTc()); } catch (e) { return null; }
  }
  /** Pide la miniatura de la opción i (o) de la rejilla: {key, url}; si aún no está, llega luego por 'vb-portrait'. */
  function lkThumb(slot, i, o, px) {
    var A = ctx.actions, P = lkPV(); if (!A || !A.portrait) return null;
    var L = lkThumbL(slot, o.v); if (!L) return null;
    var fr = slot === 'style' ? 'peinado' : slot === 'ankle' ? 'tobillo' : P && P.frameOf ? P.frameOf(slot) : 'cuerpo';
    var req = { L: L, beach: lk.venue === 'beach', tc: lkTc(), num: lk.num, size: px, frame: fr, lod: 1, bg: LK_TBG, pose: 'stand', face: 'neutra' };
    // los peinados, de cerca (frame 'peinado'): de 3/4 los de delante y de 3/4 de espaldas los que llevan volumen detrás (coleta, moño,
    // trenzas): de perfil la coleta quedaba detrás de la cabeza y la ficha no se distinguía de la de la cinta
    if (slot === 'style') req.yaw = lkBack(o.v) ? 2.2 : 0.9;
    var r = null; try { r = A.portrait(req); } catch (e) { r = null; }
    if (r && r.key && !r.url) lkGK[r.key] = i;
    return r;
  }
  /** Pone la miniatura en el <canvas> de la ficha i. r.bmp (ImageBitmap de main.js, en la GPU): se copia con createImageBitmap
   *  (asíncrono) y se entrega al lienzo con 'bitmaprenderer', sin leer píxeles; el de la caché sigue valiendo para la próxima vez.
   *  r.url (camino viejo, PNG): se dibuja la imagen cuando carga. */
  function lkTileShow(i, r) {
    var cv = el.lkGrid && el.lkGrid.querySelector('[data-lkv="' + i + '"] canvas'); if (!cv || !r) return;
    function on(b) { if (!b || !cv.isConnected) { if (b && b.close) b.close(); return; } try { var c = cv.getContext('bitmaprenderer'); if (c) { c.transferFromImageBitmap(b); cv.hidden = false; return; } } catch (e) { }
      try { cv.getContext('2d').drawImage(b, 0, 0, cv.width, cv.height); cv.hidden = false; } catch (e) { } }
    if (r.bmp && typeof createImageBitmap === 'function') { try { createImageBitmap(r.bmp).then(on, function () { }); } catch (e) { } return; }
    if (r.url) { var im = new Image(); im.onload = function () { try { var c = cv.getContext('2d'); if (c) { c.drawImage(im, 0, 0, cv.width, cv.height); cv.hidden = false; } } catch (e) { } }; im.src = r.url; }
  }
  var lkThumbQ = [], lkThumbPx = 96, lkThumbSlot = '', lkThumbRaf = 0;
  function lkThumbPump() {
    lkThumbRaf = 0;
    if (!lk.grid || lk.grid !== lkThumbSlot || !el.lkGrid) { lkThumbQ = []; return; }
    var ops = lkOpts(lkThumbSlot), t0 = performance.now();
    while (lkThumbQ.length && performance.now() - t0 < 4) {
      var i = lkThumbQ.shift(), o = ops[i]; if (!o) continue;
      var r = lkThumb(lkThumbSlot, i, o, lkThumbPx);
      if (r && (r.bmp || r.url)) lkTileShow(i, r);
    }
    if (lkThumbQ.length) lkThumbRaf = requestAnimationFrame(lkThumbPump);
  }
  function lkGridCols(w, tw, gap) { return Math.max(3, Math.floor((w + gap) / (tw + gap))); }
  /** Pinta (o pone al día) la rejilla de lk.grid. Si solo cambió la elegida, mueve el aro sin rehacer (no se pierde el desplazamiento). */
  function lkGridRender() {
    var G = el.lkGrid, slot = lk.grid; if (!G || !slot) return;
    var ops = lkOpts(slot); if (ops.length < 2) { lkGridClose(false); return; }
    var cur = lkGet(slot), ci = lkIdx(ops, cur), co = ci >= 0 ? ops[ci] : lkOptOf(cur, lkKey(slot)), col = lkIsCol(slot);
    var U = {}; lkUnseen().forEach(function (id) { U[id] = 1; });
    G.hidden = false;
    var cs = getComputedStyle(G), tw = parseFloat(cs.getPropertyValue('--lkt')) || 76, gap = parseFloat(cs.getPropertyValue('--lkg')) || 10;
    var bw = (G.querySelector('.lk-gbody') || G).clientWidth || G.clientWidth || 300, cw = col ? 52 : tw, cols = lkGridCols(bw - 12, cw, gap);
    var fam = slot === 'style' ? lk.gFam : '', vis = [];
    ops.forEach(function (o, i) { if (!fam || lkFam(o.v) === fam) vis.push(i); });
    var locks = vis.map(function (i) { return lkLocked(ops[i]) ? 1 : 0; }).join('');
    var sig = slot + '|' + lk.venue + '|' + fam + '|' + cols + '|' + vis.join(',') + '|' + locks + '|' + lk.who;
    // cabecera: «‹», la fila y lo puesto (con su candado si está bloqueado)
    var lockd = lkLocked(co), lt = lockd ? lkLockText(co) : '';
    var nm = G.querySelector('.lk-gn'), nt = co.name + (co.rar != null && co.rar >= 1 ? ' ' + lkStars(co.rar) : '');
    if (sig === lkGSig && nm) {
      nm.textContent = nt;
      var gl = G.querySelector('.lk-gl'); if (gl) { gl.innerHTML = lockd ? LK_LOCK + escT(lt || 'Aún no lo tienes') : ''; gl.hidden = !lockd; }
      Array.prototype.forEach.call(G.querySelectorAll('[data-lkv]'), function (b) { var on = +b.getAttribute('data-lkv') === ci; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      return;
    }
    lkGSig = sig;
    var ae = document.activeElement, fv = ae && G.contains(ae) ? ae.getAttribute('data-lkv') : null, kb = !!(ae && ae.classList && ae.classList.contains('kf'));
    var dpr = Math.min(2, window.devicePixelRatio || 1), px = Math.max(72, Math.min(112, Math.round((tw - 14) * dpr)));
    var h = '<div class="lk-gh" data-nav data-sp-row><button type="button" class="sp-btn sp-sq sp-sm sp-cream sp-noshine lk-gb" data-shape="2" data-lkg="close" aria-label="Volver a la lista">' + LK_ARR_L + '</button>' +
      '<span class="lk-gt"><span class="lk-k">' + escT(LK_LABEL[slot] || '') + '</span><b class="lk-gn">' + escT(nt) + '</b><small class="lk-gl"' + (lockd ? '' : ' hidden') + '>' +
      (lockd ? LK_LOCK + escT(lt || 'Aún no lo tienes') : '') + '</small></span></div>';   // (en la rejilla ya se está probando: sin «Se puede probar»)
    if (slot === 'style') {
      h += '<div class="lk-famw"><div class="lk-fams" data-nav data-sp-row role="group" aria-label="Familia de peinados (otra vez: todos)">';
      LK_FAMS.forEach(function (f) {
        var n = f[0] ? ops.filter(function (o) { return lkFam(o.v) === f[0]; }).length : ops.length; if (!n) return;
        h += '<button type="button" class="sp-tab lk-fam' + (f[0] === fam ? ' on' : '') + '" aria-pressed="' + (f[0] === fam) + '" data-lkfam="' + f[0] + '">' + escT(f[1]) + '</button>';
      });
      // (WP6, ronda 1) las 5 familias no caben a 568 ni a 360: una flecha de verdad al final de la tira (no solo el desvanecido) que la
      // corre; con el mando y el teclado se llega con ←/→ (la flecha no recibe foco)
      h += '</div><button type="button" class="lk-fmore" data-lkfm tabindex="-1" aria-hidden="true">' + LK_ARR_R + '</button></div>';
    }
    h += '<div class="lk-gbody" data-nav role="listbox" aria-label="' + escT(LK_LABEL[slot] || '') + '">';
    lkGK = {};
    var thumbs = [];
    for (var r0 = 0; r0 < vis.length; r0 += cols) {
      h += '<div class="lk-grow" data-sp-row>';
      for (var j = r0; j < Math.min(vis.length, r0 + cols); j++) {
        var i = vis[j], o = ops[i], lock = lkLocked(o), on = i === ci, nw = o.cat && U[o.v];
        // (ronda 1) lo que con lo puesto no se vería (tobillera bajo calcetines altos, gorro que tapa el peinado): ojo tachado en la ficha;
        // si no, «Sin tobillera» y «Tobillera» salían iguales sin decir por qué
        var hw = !col && o.v && (slot === 'ankle' || slot === 'head') ? lkHelpOf(slot, o, false, '') : null; if (hw && hw.k !== 'warn') hw = null;
        var aria = o.name + (o.rar != null && o.rar >= 1 ? '. Rareza: ' + (o.rar + 1) + ' de 4' : '') + (lock ? '. Bloqueado: ' + (lkLockText(o) || 'aún no lo tienes') + '. Se puede probar' : '') + (hw ? '. ' + hw.t : '') + (nw ? '. Nuevo' : '');
        var cls = 'lk-tile' + (col ? ' lk-cs' : '') + (on ? ' on' : '') + (lock ? ' lock' : '') + (nw ? ' new' : '') + ' t' + (i % 4);
        h += '<button type="button" class="' + cls + '" data-lkv="' + i + '" role="option" aria-pressed="' + on + '" aria-label="' + escT(aria) + '">';
        if (col) h += '<i class="lk-sw' + (o.hex >= 0 ? '"  style="background:' + hx(o.hex) + '"' : ' auto"') + '></i>';
        else {
          thumbs.push(i);
          h += '<span class="lk-ti"><canvas width="' + px + '" height="' + px + '" hidden></canvas>' + (hw ? '<span class="lk-thid" title="' + escT(hw.t) + '">' + LK_EYE + '</span>' : '') + '</span><span class="lk-tn">' + escT(lkShy(o.name)) + '</span>';
          if (o.rar != null && o.rar >= 1) h += '<span class="lk-tst" aria-hidden="true">' + lkStars(o.rar) + '</span>';
        }
        if (lock) h += '<span class="lk-tlk" aria-hidden="true">' + LK_LOCK + '</span>';
        h += '</button>';
      }
      h += '</div>';
    }
    h += '</div>';
    var sb = G.querySelector('.lk-gbody'), st = sb && G._slot === slot ? sb.scrollTop : 0;
    G.innerHTML = h; G._slot = slot;
    if (VB.Splat) { VB.Splat.decorate(G); if (VB.Splat.more) { VB.Splat.more(G.querySelector('.lk-gbody')); var fr = G.querySelector('.lk-fams'); if (fr) VB.Splat.more(fr); } }
    var nb = G.querySelector('.lk-gbody'); if (nb) nb.scrollTop = st;
    // miniaturas: se piden después de pintar la rejilla, unas pocas por frame (cada una arregla y resuelve un aspecto): al abrirla no
    // hay tirón; las que ya están en la caché de retratos salen al momento y el resto llega de una en una (main.js, una por frame)
    lkThumbQ = thumbs; lkThumbPx = px; lkThumbSlot = slot;
    if (thumbs.length && !lkThumbRaf) lkThumbRaf = requestAnimationFrame(lkThumbPump);
    if (fv != null) { var fb = G.querySelector('[data-lkv="' + fv + '"]') || G.querySelector('[data-lkfam="' + fam + '"]'); if (fb) focusEl(fb, kb); }
  }
  /** Guiones blandos (U+00AD) por sílabas en las palabras de 9 letras o más (pulido): el nombre de la miniatura parte «Degra-dado»
   *  con guion y no «Degradad/o». Reglas del castellano: V-CV, VC-CV, sin separar bl, br, cl, cr, dr, fl, fr, gl, gr, pl, pr, tr, ch,
   *  ll, rr; las vocales juntas no se separan; nunca deja menos de 2 letras al principio ni 3 al final. */
  var LK_SHY_V = /[aeiouáéíóúü]/i, LK_SHY_K = { bl: 1, br: 1, cl: 1, cr: 1, dr: 1, fl: 1, fr: 1, gl: 1, gr: 1, pl: 1, pr: 1, tr: 1, ch: 1, ll: 1, rr: 1 };
  function lkShy(t) {
    return String(t).split(' ').map(function (w) {
      if (w.length < 9 || !/^[a-záéíóúüñ]+$/i.test(w)) return w;
      var cut = [], i = 0, n = w.length;
      while (i < n && !LK_SHY_V.test(w[i])) i++;
      while (i < n) {
        while (i < n && LK_SHY_V.test(w[i])) i++;
        var j = i; while (j < n && !LK_SHY_V.test(w[j])) j++;
        if (j >= n) break;
        var c = w.slice(i, j).toLowerCase(), k = c.length, at;
        if (k === 1) at = i;
        else if (k === 2) at = LK_SHY_K[c] ? i : i + 1;
        else if (k === 3) at = LK_SHY_K[c.slice(1)] ? i + 1 : i + 2;
        else at = i + 2;
        if (at >= 2 && n - at >= 3) cut.push(at);
        i = j;
      }
      for (var q = cut.length - 1; q >= 0; q--) w = w.slice(0, cut[q]) + '­' + w.slice(cut[q]);
      return w;
    }).join(' ');
  }
  /** Abre la rejilla de la fila slot (tocar la fila, Intro o A). */
  function lkGridOpen(slot, kb) {
    if (!el.lkGrid || lkOpts(slot).length < 2) return false;
    lk.grid = slot; lk.gFam = ''; lkGSig = ''; el.lkGrid._slot = '';
    el.mpLook.classList.add('lk-gon');
    lkFocusSlot(slot, true);
    lkGridRender();
    uiSound('click'); srSay((LK_LABEL[slot] || '') + ': todas las opciones');
    var G = el.lkGrid, on = G.querySelector('.lk-tile.on') || G.querySelector('.lk-tile');
    if (on) { focusEl(on, kb); if (VB.Splat && VB.Splat.reveal) VB.Splat.reveal(on, { block: 'center' }); else if (on.scrollIntoView) on.scrollIntoView({ block: 'center' }); }
    setTimeout(function () { if (lk.on) lkPlace(); }, 0);
    return true;
  }
  /** Cierra la rejilla (vuelve a la lista con el foco en su fila). Las miniaturas que faltaban se quitan de la cola. */
  function lkGridClose(kb) {
    if (!lk.grid) return false;
    var s = lk.grid; lk.grid = ''; lkGSig = '';
    if (ctx.actions && ctx.actions.portraitDrop) for (var k in lkGK) if (Object.prototype.hasOwnProperty.call(lkGK, k)) try { ctx.actions.portraitDrop(k); } catch (e) { }
    lkGK = {};
    el.mpLook.classList.remove('lk-gon');
    if (el.lkGrid) { el.lkGrid.hidden = true; el.lkGrid.innerHTML = ''; el.lkGrid._slot = ''; }
    lkRender(s);
    var row = el.lkList.querySelector('[data-look="' + s + '"]'); if (row) focusEl(row, kb);
    setTimeout(function () { if (lk.on) { lkMore(); lkPlace(); } }, 0);
    return true;
  }
  /** Pone la opción i de la rejilla (otra vez la puesta = volver a la lista). */
  function lkGridPick(i, kb) {
    var slot = lk.grid, ops = lkOpts(slot), o = ops[i]; if (!o || !lk.fit) return;
    if (o.v === lkGet(slot)) { lkGridClose(kb); return; }
    var f = lkClone(lk.fit); lkPut(f, slot, o.v); lkSet(f, slot);
    try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('arrow', 1, i, ops.length); else click(); } catch (e) { }
    var locked = lkLocked(o);
    srSay(LK_LABEL[slot] + ': ' + o.name + (locked ? ' (bloqueado, se puede probar)' : ''));
    lkRefocus(slot, o.v);   // coleta, moño, trenzas, pinza: se ve de espaldas
    if (slot.indexOf('c:') === 0) lk.flash = slot;
    lkRender(); lkPreview();
  }
  /** Fichas de familia de los peinados. */
  function lkGridFam(f) { lk.gFam = f && f !== lk.gFam ? f : '';   // (la elegida otra vez: todos)
    lkGSig = ''; lkGridRender(); uiSound('click'); var b = el.lkGrid.querySelector('[data-lkfam="' + (f || '') + '"]'); if (b) focusEl(b, kbNow()); if (VB.Splat && VB.Splat.more) VB.Splat.more(el.lkGrid.querySelector('.lk-fams')); }
  // ---- cambios en la copia de trabajo ----
  function lkSet(f, slot, quiet) {
    var Lk = LK(), removed = [];
    if (Lk && Lk.fix) {
      try { var r = Lk.fix(f, lk.venue, slot ? lkFixSlot(slot) : null); if (r && r.fit) { f = r.fit; removed = r.removed || []; } } catch (e) { }
    }
    lk.fit = f; lk.dirty = true; lk.idle = 0;
    lkRemovedNotes(removed, quiet);
    return removed;
  }
  /** Avisos «Quitado: …». Lo quitado en la otra sede (un gorro que choca con el peinado nuevo, que es común) se avisa siempre,
   *  también con quiet («Al azar», «Restablecer»), y dice dónde; en la Carrera la otra sede no se juega y no se avisa. */
  function lkRemovedNotes(removed, quiet) {
    (removed || []).forEach(function (x) {
      if (!x) return;
      var oth = x.ven && x.ven !== lk.venue;
      if (oth ? lk.who === 'career' : quiet) return;
      var why = x.why || '', m = x.msg || (/^Quitad/.test(why) ? why : 'Quitado: ' + lkItemName(x.id) + (why ? ' (' + why + ')' : ''));
      if (oth) m = m.replace(/^Quitado: /, x.ven === 'beach' ? 'Quitado en playa: ' : 'Quitado en pista: ');
      lkNote(m);
    });
  }
  /** ←/→ (o flechas, A, clic) en una fila: valor anterior / siguiente de la lista de esa ranura. */
  function lkStep(slot, d, arrEl) {
    var ops = lkOpts(slot), n = ops.length; if (n < 2 || !lk.fit) return;
    var now = performance.now(); if (now - lk.lastStep < 110) return;   // mantener pulsado: un cambio cada 120 ms como mucho
    lk.lastStep = now;
    var i = lkIdx(ops, lkGet(slot)); i = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n;
    var o = ops[i], f = lkClone(lk.fit); lkPut(f, slot, o.v);
    lkSet(f, slot);
    lkRefocus(slot, o.v);   // (coleta, moño, trenzas, pinza: se ve de espaldas)
    if (slot.indexOf('c:') === 0) lk.flash = slot;
    try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('arrow', d, i, n); else click(); } catch (e) { }
    var locked = lkLocked(o);
    srSay(LK_LABEL[slot] + ': ' + o.name + (locked ? ' (bloqueado)' : '') + ', ' + (i + 1) + ' de ' + n);
    lkRender(slot);
    var row = el.lkList.querySelector('[data-look="' + slot + '"]'), a = row && row.querySelector('.arr[data-d="' + (d > 0 ? 1 : -1) + '"]');
    if (a) restartAnim(a, 'hit');
    lkPreview();
  }
  function lkPickSet(w) {
    if (w === lk.who) return;
    lkCommit();
    lkGridReset();
    lkLoad(w); lk.ukey = '';
    uiSound('click');
    srSay(w === 'career' ? 'Tu jugador de la Carrera' : 'N.º ' + lk.num);
    lkRender(); restartAnim(el.lkList, 'tp-n');
    lk.pvT = 0; lkPvFlush();
  }
  function lkPickStep(d) {
    var bs = el.lkPick.querySelectorAll('[data-lkpick]'), ids = [];
    for (var i = 0; i < bs.length; i++) { var v = bs[i].getAttribute('data-lkpick'); ids.push(v === 'career' ? 'career' : +v); }
    var j = ids.indexOf(lk.who) + (d > 0 ? 1 : -1);
    if (j < 0 || j >= ids.length) { uiSound2('arrowEdge', d); return; }
    lkPickSet(ids[j]);
    focusEl(el.lkPick.querySelector('.lk-pk.on'), true);
  }
  function lkVenue(v, kb) {
    if (lk.who === 'career' || v === lk.venue) return;
    lk.venue = v === 'beach' ? 'beach' : 'hall'; lk.ukey = '';
    // la copia ya está arreglada para cada escenario; se vuelve a pasar por fix por si el guardado traía algo de otra sede
    var f = lkClone(lk.fit), rm0 = []; var Lk = LK(); if (Lk && Lk.fix) try { var r = Lk.fix(f, lk.venue, null); if (r && r.fit) { lk.fit = r.fit; rm0 = r.removed || []; } } catch (e) { }
    lkRemovedNotes(rm0, false);
    lkGridReset();
    uiSound('click'); srSay(lk.venue === 'beach' ? 'En playa' : 'En pista');
    lkRender(); restartAnim(el.lkList, lk.venue === 'beach' ? 'tp-n' : 'tp-p');
    if (kb) focusEl(el.lkVen.querySelector('button.on'), true);
    lk.pvT = 0; lkPvFlush();
    lkBackdropSoon();
  }
  /** Cambio de fondo al cambiar de sede (pulido): montar el pabellón o la playa congela 0,4-0,5 s (1,4 s en un móvil lento) y antes
   *  se hacía en el mismo toque, sin nada en pantalla. Ahora primero cambian las fichas, la lista y el muñeco; luego una cortina de
   *  tinta tapa el fondo (por debajo de la interfaz), se monta el fondo nuevo detrás y la cortina se va. */
  var lkBdTok = 0;
  function lkBackdropSoon() {
    var A = ctx.actions, M = el.menu; if (!A || !A.menuBackdrop || !lk.on || menuVenue() === lk.venue) return;
    var tok = ++lkBdTok; if (M) M.classList.add('lk-swap');
    setTimeout(function () {
      requestAnimationFrame(function () {
        if (tok !== lkBdTok) return;
        lkBackdrop();
        requestAnimationFrame(function () { setTimeout(function () { if (tok === lkBdTok && M) M.classList.remove('lk-swap'); }, 40); });
      });
    }, 140);
  }
  function lkTry() {
    // (la siguiente pose sigue la ronda aunque la anterior ya se acabara: a los 5 s no se vuelve siempre al remate)
    var P = lkPV(); lk.tryI = ((lk.tryI > -1 ? lk.tryI : lk.tryLast != null ? lk.tryLast : -1) + 1) % LK_TRY.length; lk.idle = 0;
    var t = LK_TRY[lk.tryI];
    if (P) try { if (P.pose) P.pose(t[0]); if (P.face) P.face(t[1]); } catch (e) { }
    lkTryFull(t[0] !== 'stand');
    if (lkTryPoseT) { clearTimeout(lkTryPoseT); lkTryPoseT = 0; }
    if (t[0] !== 'stand') lkTryPoseT = setTimeout(function () { lkTryPoseT = 0; lkTryStop(true); }, 5000);
    lkFrame(); uiSound('click'); srSay('Probar: ' + t[2].toLowerCase());
  }
  /** Fin de la pose de «Probar» (pulido): a los 5 s (a la vez que el muñeco a toda pantalla del móvil) o al cambiar de pestaña, de fila,
   *  al dado, a «Deshacer» o a Restablecer. Antes el remate seguía en bucle para siempre: la pestaña Cabeza encuadraba un muñeco en el
   *  aire (las piernas, con la cabeza fuera del cuadro) y el dado o «Deshacer» se veían en pleno salto. reframe: vuelve al encuadre
   *  de la fila (o de la pestaña) abierta. */
  var lkTryPoseT = 0;
  function lkTryStop(reframe) {
    if (lkTryPoseT) { clearTimeout(lkTryPoseT); lkTryPoseT = 0; }
    var was = lk.tryI > -1 && LK_TRY[lk.tryI][0] !== 'stand';
    if (lk.tryI > -1) lk.tryLast = lk.tryI;
    lk.tryI = -1;
    if (!was) return;
    var P = lkPV();
    if (P) try { if (P.pose) P.pose('stand'); if (P.face) P.face('neutra'); } catch (e) { }
    lkTryFull(false);
    if (!reframe || !lk.on) return;
    if (lk.slot && P && P.frameSlot) { try { P.frameSlot(lk.slot, lkSlotOpts(lk.slot)); } catch (e) { } } else lkFrame();
  }
  /** «Probar» en el móvil apaisado (≤ 420 px de alto; revisión final): el muñeco quedaba pequeño en el hueco estrecho entre la lista y los
   *  botones de la derecha. Mientras dura la pose, la lista, las pestañas y la fila de jugador y sede se apartan (se desvanecen) y el
   *  muñeco ocupa el ancho entero, centrado y más grande. Vuelven al tocar o pulsar cualquier cosa (salvo Probar otra vez), a los 5 s
   *  o con la pose «De pie». */
  var lkTryT = 0;
  function lkTryFullEnd(e) {
    if (e && e.target && e.target.closest && e.target.closest('[data-lkf="try"]')) return;
    lkTryFull(false);
  }
  function lkTryFull(on) {
    var W = window.innerWidth || 1, H = window.innerHeight || 1;
    // (pulido: también en el móvil en vertical, donde la pose quedaba en un cuerpo entero de ~150 px sobre la lista)
    on = !!on && lk.on && (W > H ? H <= 420 : W <= 600);
    if (lkTryT) { clearTimeout(lkTryT); lkTryT = 0; }
    if (on) lkTryT = setTimeout(function () { lkTryT = 0; lkTryFull(false); }, 5000);
    if (!!lk.tryFull === on) return;
    lk.tryFull = on;
    if (el.mpLook) el.mpLook.classList.toggle('lk-tryfull', on);
    var f = on ? 'addEventListener' : 'removeEventListener';
    document[f]('pointerdown', lkTryFullEnd, true); document[f]('keydown', lkTryFullEnd, true);
    lkPlace();
  }
  function lkRandom() {
    var Lk = LK(); if (!Lk || !Lk.random || !lk.fit) return;
    var r = null; try { r = Lk.random(Date.now(), true); } catch (e) { r = null; }   // semilla de la UI: nunca g.rng
    if (!r) return;
    var prev = lkClone(lk.fit), f = lkClone(lk.fit), vk = lkVKey();
    // cada ruta que pisa el azar borra su _keep (como lkPut): si no, una versión más nueva que conozca ese id lo devolvería encima
    ['style', 'skin', 'hair'].forEach(function (k) { if (r[k] != null) { f[k] = r[k]; lkUnkeep(f, k); } });
    if (r.colors) { f.colors = lkClone(r.colors); Object.keys(r.colors).forEach(function (k) { lkUnkeep(f, 'colors.' + k); }); }
    if (r[vk]) {   // solo la ropa del escenario que se ve; la del otro (y su _keep) se queda
      f[vk] = lkClone(r[vk]); Object.keys(r[vk]).forEach(function (s) { lkUnkeep(f, vk + '.' + s); });
    }
    lkSet(f, null, true);
    uiSound('click'); srSay('Aspecto al azar'); lkUndoOffer(prev, 'Todo al azar');
    lkRender(); lkPreview();
  }
  /** Dado junto a «Probar» (WP6): al azar SOLO las filas de la pestaña abierta (lo demás se queda); en Colores, los colores. */
  function lkRandomTab() {
    var Lk = LK(); if (!Lk || !Lk.random || !lk.fit) return;
    var r = null; try { r = Lk.random(Date.now(), true); } catch (e) { r = null; }   // semilla de la UI: nunca g.rng
    if (!r) return;
    var prev = lkClone(lk.fit), f = lkClone(lk.fit), tl = '', rows = LK_ROWS[lk.tab] || [];
    rows.forEach(function (s) { if (lkOpts(s).length >= 2) lkPut(f, s, lkGetFrom(r, s)); });
    LK_TABS.forEach(function (t) { if (t[0] === lk.tab) tl = t[1]; });
    lkSet(f, null, true);
    uiSound('click'); srSay('Al azar: ' + tl);
    lkRender(); lkPreview();
    lkUndoOffer(prev, 'Al azar: ' + tl);
  }
  /** «⋯»: hoja con lo que se usa poco (Todo al azar, Restablecer este apartado, Copiar a la otra sede). Una sola ✕ (U8). */
  function lkMoreSheet() {
    var S = VB.Splat; if (!S || !S.sheet) return;
    var tl = ''; LK_TABS.forEach(function (t) { if (t[0] === lk.tab) tl = t[1]; });
    var acts = [['randAll', 'Todo al azar', 'sp-alt'], ['reset', 'Restablecer ' + tl.toLowerCase(), 'sp-cream']];
    if (lk.who !== 'career') acts.push(['copy', lk.venue === 'beach' ? 'Copiar a pista' : 'Copiar a playa', 'sp-teal']);
    var box = document.createElement('div'), api = null; box.className = 'lk-acts'; box.setAttribute('data-nav', '');
    acts.forEach(function (a, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sp-btn sp-md sp-wide sp-calm ' + a[2]; b.setAttribute('data-shape', String(i));
      b.innerHTML = '<span class="sp-t"></span>'; b.firstChild.textContent = a[1];
      b.addEventListener('click', function () { if (api) api.close(); if (a[0] === 'randAll') lkRandom(); else lkFoot(a[0]); });
      box.appendChild(b);
    });
    api = S.sheet({ title: 'Más', node: box, dock: false, cls: 'lk-sheet' });
  }
  function lkReset() {
    var Lk = LK(); if (!Lk || !Lk.defaults || !lk.fit) return;
    var d = null; try { d = Lk.defaults(lk.who === 'career' ? 0 : lk.who); } catch (e) { d = null; } if (!d) return;
    var prev = lkClone(lk.fit), f = lkClone(lk.fit), tl = '';
    (LK_ROWS[lk.tab] || []).forEach(function (s) { lkPut(f, s, lkGetFrom(d, s)); });
    LK_TABS.forEach(function (t) { if (t[0] === lk.tab) tl = t[1]; });
    lkSet(f, null, true);
    uiSound('back');
    lkRender(); lkPreview();
    lkUndoOffer(prev, 'Restablecido: ' + tl);
  }
  function lkCopy() {
    var Lk = LK(); if (lk.who === 'career' || !lk.fit || !Lk) return;
    var from = lkVKey(), to = from === 'beach' ? 'hall' : 'beach', prev = lkClone(lk.fit), f = lkClone(lk.fit), skipped = 0;
    if (!f[to] || typeof f[to] !== 'object') f[to] = {};
    // se copia lo que vale en el otro escenario; lo demás se queda como estaba allí (calcetines, zapatillas y tobillera son de
    // cada sitio: no cuentan como «no copiado»). En esas ranuras y en las rodilleras, un «nada» no pisa lo del otro escenario: en
    // la playa calcetines y zapatillas solo pueden ser «nada» y las rodilleras van sin nada por defecto (copiar a pista las borraba)
    var OWN = { socks: 1, shoes: 1, ankle: 1, knees: 1 };
    (Lk.SLOTS || []).forEach(function (s) {
      var v = f[from] ? f[from][s] : '';
      if ((v === '' || v == null) && OWN[s]) return;
      var okv = v === '' || v == null ? true : !Lk.items || Lk.items(s, to).indexOf(v) >= 0;
      if (okv) { f[to][s] = v == null ? '' : v; lkUnkeep(f, to + '.' + s); }
      else if (s !== 'socks' && s !== 'shoes' && s !== 'ankle') skipped++;
    });
    if (Lk.fix) try { var r = Lk.fix(f, to, null); if (r && r.fit) f = r.fit; } catch (e) { }
    lk.fit = f; lk.dirty = true; lk.idle = 0;
    uiSound('click');
    lkUndoOffer(prev, (to === 'beach' ? 'Copiado a playa' : 'Copiado a pista') + (skipped ? '. Lo que solo vale ' + (to === 'beach' ? 'en la pista' : 'en la playa') + ' no se copia' : ''));
    lkRender();
  }
  /** «Deshacer» (pulido) tras el dado, Todo al azar, Restablecer y Copiar: aviso con el botón durante 5 s; deja el aspecto de antes
   *  (del mismo jugador). Sin VB.Splat.toast, el aviso de siempre sin botón. */
  var lkUndoApi = null;
  function lkUndoOffer(prev, msg) {
    lkTryStop(true);   // (dado, Todo al azar, Restablecer y Copiar: el cambio se ve con el muñeco de pie)
    if (lkUndoApi) { try { lkUndoApi.close(); } catch (e) { } lkUndoApi = null; }
    lk.undo = prev ? { fit: prev, who: lk.who } : null;
    if (!prev || !VB.Splat || !VB.Splat.toast) { lkNote(msg); return; }
    var api = VB.Splat.toast('<span class="lk-ut">' + escT(msg) + '</span><button type="button" class="sp-btn sp-sm sp-cream sp-noshine lk-undo" data-shape="1">Deshacer</button>', { key: 'lkundo', ms: 5000, cls: 'lk-undo-t' });
    lkUndoApi = api;
    var b = api && api.el && api.el.querySelector('.lk-undo');
    if (b) b.addEventListener('click', function (e) { e.stopPropagation(); api.close(); lkUndo(); });
  }
  function lkUndoDrop() { lk.undo = null; if (lkUndoApi) { try { lkUndoApi.close(); } catch (e) { } lkUndoApi = null; } }
  function lkUndo() {
    var u = lk.undo; lk.undo = null; lkUndoApi = null;
    if (!u || !u.fit || u.who !== lk.who || !lk.on) return;
    lk.fit = u.fit; lk.dirty = true; lk.idle = 0; lkTryStop(true);
    uiSound('back'); srSay('Deshecho');
    lkRender(); lkPreview();
  }
  function lkFoot(w) {
    if (w === 'try') lkTry(); else if (w === 'rand') lkRandomTab(); else if (w === 'more') lkMoreSheet(); else if (w === 'reset') lkReset(); else if (w === 'copy') lkCopy();
  }
  // ---- ciclo de vida ----
  function lkOpen() {
    if (!el.mpLook) return;
    lkTryStop(false); lk.tryLast = null; lk.on = true; lk.idle = 0; lk.ukey = ''; lk.footI = 0; lk.slot = ''; lk.zoom = false;
    lkGridReset();
    lkCheckNew();
    lkLoad(lk.who);
    if (lkTabs && lkTabs.get() !== lk.tab) lkTabs.set(lk.tab, 'api');
    el.lkList.scrollTop = 0;
    lkRender();
    if (el.lkSpin) el.lkSpin.hidden = false;
    var Lk = LK(), L = null;
    try { L = Lk && Lk.resolve ? Lk.resolve(lkPvFit(), lk.venue, lkTc()) : null; } catch (e) { L = null; }
    if (ctx.actions && ctx.actions.showroom) try { ctx.actions.showroom(true, L, lkPvOpts()); } catch (e) { }
    lk.pvT = performance.now(); lk.pvDue = false;
    lkFrame();
    lk.placeT = 0.7;
    lkBackdrop();
    lkHintOnce();
    setTimeout(function () { if (lk.on) { fitTabs(lkTabs); lkMore(); lkPlace(); } }, 0);
  }
  /** Fondo del menú de la sede que se viste (U10): el Vestuario de playa, en la playa (y el de pista, en el pabellón). Usa la acción del
   *  fondo de la Carrera (main.js menuBackdrop: monta la sede y una demo oculta); al salir se devuelve el del ajuste (lkClose). */
  function lkBackdrop() {
    var A = ctx.actions; if (!A || !A.menuBackdrop || !lk.on) return;
    if (menuVenue() === lk.venue) return;
    try { A.menuBackdrop(lk.venue); lk.bd = true; } catch (e) { }
  }
  /** Una sola vez (por dispositivo): cómo se gira y se acerca el muñeco. */
  function lkHintOnce() {
    var K = 'make-the-cut.lkHint', seen = false;
    try { seen = localStorage.getItem(K) === '1'; } catch (e) { seen = false; }
    if (seen || (ctx.debug && !(ctx.params && ctx.params.lkhint))) return;   // (las capturas de ?debug=look, sin él salvo &lkhint=1)
    try { localStorage.setItem(K, '1'); } catch (e) { }
    var touch = !!ctx.isTouch || ctx.inputDevice === 'touch';
    setTimeout(function () {
      if (!lk.on) return;
      lkNote(touch ? 'Arrastra para girar. Doble toque para acercar o alejar' : 'Arrastra para girar. Doble clic para acercar o alejar');
      // (pulido: la pista se va al primer toque; ya no se queda 3,4 s encima del muñeco o del dado)
      var api = lkNoteApi, off = function () {
        document.removeEventListener('pointerdown', off, true);
        if (api && api === lkNoteApi) api.close(); else if (!api && el.lkNote) { lkNq.length = 0; lkNoteNext(); }
      };
      document.addEventListener('pointerdown', off, true);
    }, 900);
  }
  /** Rejilla cerrada sin repintar (al abrir y al salir del Vestuario, al cambiar de jugador o de sede). */
  function lkGridReset() {
    if (lk.grid && ctx.actions && ctx.actions.portraitDrop) for (var k in lkGK) if (Object.prototype.hasOwnProperty.call(lkGK, k)) try { ctx.actions.portraitDrop(k); } catch (e) { }
    lk.grid = ''; lkGK = {}; lkGSig = '';
    if (el.mpLook) el.mpLook.classList.remove('lk-gon');
    if (el.lkGrid) { el.lkGrid.hidden = true; el.lkGrid.innerHTML = ''; el.lkGrid._slot = ''; }
  }
  function lkClose() {
    if (!lk.on) return;
    lkTryFull(false);
    lkCommit();
    lkGridReset();
    lkUndoDrop(); lkBdTok++; if (el.menu) el.menu.classList.remove('lk-swap');
    lk.on = false; lk.rep = 0; lk.drag = null; lk.keySpin = lk.btnSpin = lk.padSpin = 0; lk.pvDue = false;
    if (el.lkSpin) { el.lkSpin.hidden = true; el.lkSpin.classList.remove('drag'); }
    if (ctx.actions && ctx.actions.showroom) try { ctx.actions.showroom(false); } catch (e) { }
    if (lk.bd) { lk.bd = false; if (ctx.actions && ctx.actions.menuBackdrop) try { ctx.actions.menuBackdrop(''); } catch (e) { } }   // (el fondo del ajuste)
  }
  /** VB.UI.openLook(o): o = {who: 'career', hall, tc, back} desde la Carrera; {tab, venue, item, pick} para ?debug=look. */
  function openLook(o) {
    o = o || {};
    if (!LK() || !el.mpLook || !ctx || ctx.state !== 'menu') return false;   // nunca desde la pausa ni en partido
    if (panel) { pstack.length = 0; closePanel(); if (panel) return false; }
    var w = lk.who;
    if (o.who === 'career' || o.pick === 'career') w = 'career';
    else if (o.pick != null && o.pick !== '') w = +o.pick === 2 || o.pick === 'n2' ? 1 : 0;
    else if (o.who === 0 || o.who === 1) w = o.who;
    if (w === 'career' && !lkCareer() && o.who !== 'career') w = 0;
    var kb = kbNow();
    if (lk.on) lkCommit();
    lk.o = o.who === 'career' || typeof o.back === 'function' ? o : null;
    lk.who = w;
    if (w !== 'career') lk.venue = o.venue === 'beach' || o.venue === 'playa' ? 'beach' : o.venue === 'hall' || o.venue === 'pista' ? 'hall' : mpage === 'look' ? lk.venue : menuVenue();
    var tab = o.tab && LK_ROWS[o.tab] ? o.tab : '';
    var it = null, Lk = LK();
    if (o.item) try { it = Lk.item ? Lk.item(o.item) : null; } catch (e) { it = null; }
    if (it && w !== 'career' && !o.venue && it.venue && it.venue !== 'A') lk.venue = it.venue === 'Y' ? 'beach' : 'hall';
    if (!tab && it) tab = lkTabOf(it.slot);
    if (tab) lk.tab = tab;
    if (mpage === 'look') { lkGridReset(); lkLoad(w); lk.ukey = ''; if (lkTabs && lkTabs.get() !== lk.tab) lkTabs.set(lk.tab, 'api'); lkRender(); lk.pvT = 0; lkPvFlush(); lkFrame(); }
    else {
      var a = document.activeElement;
      mstack.push({ p: mpage, f: a && a.id && el.menu.contains(a) ? a.id : '' });
      setPage('look', 'go');
      if (!lk.o || !lk.o.back) uiSound('click');
    }
    // probar un objeto concreto (?debug=look&item=…): se pone en la copia; si está bloqueado, se ve pero no se guarda
    if (it && lk.fit) {
      var slot = it.slot === 'hairTint' ? 'hair' : it.slot;
      if (lkOpts(slot).some(function (x) { return x.v === it.id; })) { var f = lkClone(lk.fit); lkPut(f, slot, it.id); lkSet(f, slot); lkRender(slot); lk.pvT = 0; lkPvFlush(); if (lkSlotBack(slot, it.id)) lkFocusSlot(slot, true); }
    }
    focusSoon(pageFocus(), kb || ctx.inputDevice === 'gamepad');
    return true;
  }
  /** Mando en el Vestuario (cada frame con el mando activo): X = «Al azar», stick derecho = girar. */
  function lkPad(it, dt) {
    if (it.jset) { lkRandom(); return; }
    var x = 0;
    try {
      var ps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < ps.length; i++) { var p = ps[i]; if (!p || !p.axes || p.axes.length < 4) continue; var v = +p.axes[2] || 0; if (Math.abs(v) > 0.25) { x = (v - (v > 0 ? 0.25 : -0.25)) / 0.75; break; } }
    } catch (e) { x = 0; }
    lk.padSpin = x;
  }
  /** Cada frame (ui.update): avisos, comprobación de lo ganado, vista previa pendiente y giro (teclas, botones, stick, solo). */
  function lkTick(rdt) {
    if (lkNT > 0) { lkNT -= rdt; if (lkNT <= 0) lkNoteNext(); }
    if (lkCheckPend && ctx.state === 'menu' && !(bootStage < 2 && bootBusy()) && !wp.ph) { lkCheckPend = false; lkCheckNew(); }
    if (!lk.on) return;
    if (ctx.state !== 'menu') { lkClose(); return; }
    if (lk.pvDue && performance.now() - lk.pvT >= 120) lkPvFlush();
    // mientras entra la página (la columna llega deslizándose), el centro del muñeco se vuelve a medir: medido a mitad de la
    // animación quedaba desplazado a la derecha hasta el siguiente cambio de tamaño
    if (lk.placeT > 0) { lk.placeT -= rdt; lkPlace(); }
    if (lk.rep && performance.now() >= lk.repT) { lk.repT = performance.now() + 120; lkStep(lk.rep.slot, lk.rep.d, null); }
    var sp = lk.keySpin * 2.6 * rdt + lk.padSpin * 3 * rdt;
    if (lk.btnSpin && performance.now() - lk.btnT > 250) sp += lk.btnSpin * 2.6 * rdt;
    lk.padSpin = 0;
    if (sp) { lk.idle = 0; lkSpinBy(sp); }
    else if (lk.drag || lk.rep) lk.idle = 0;
    else { lk.idle += rdt; if (lk.idle > 6 && !rm()) lkSpinBy(0.3 * rdt); }   // en reposo gira despacio (no con «Menos movimiento»)
  }
  /** Eventos del Vestuario (una vez, en init). */
  function lkInit() {
    if (!el.mpLook) return;
    if (!LK()) { if (el.btnLook) el.btnLook.hidden = true; if (el.btnSqLook) el.btnSqLook.hidden = true; return; }
    lkTabs = makeTabs(el.lkTabs, LK_TABS.map(function (t) { return { id: t[0], label: t[1], icon: TAB_IC['lk_' + t[0]] || '' }; }),
      { value: lk.tab, label: 'Apartado del vestuario', pane: el.lkList, swipe: el.lkList,
        onChange: function (id) {
          // Q/E, LB/RB o Y con el foco en una fila: la fila desaparece al rehacer la lista y el foco caía en <body> (↓ iba al selector
          // de jugador). Si estaba en la lista (o no estaba en ningún sitio), pasa a la 1ª fila de la pestaña nueva
          var ae = document.activeElement, inL = !ae || ae === document.body || el.lkList.contains(ae), kb = kbNow() || ctx.inputDevice === 'gamepad';
          lkGridReset();
          var capW = lkCapHides() && (lk.tab === 'pelo' || id === 'pelo');   // (la gorra sale o vuelve en la vista previa: lkPvFit)
          lkTryStop(false); lk.tab = id; el.lkList.scrollTop = 0; lkRender(); lkFrame();
          if (capW) lkPreview();
          var a2 = document.activeElement;
          if (inL && (!a2 || a2 === document.body || !el.mpLook.contains(a2))) focusEl(lkFocusEl(), kb);
        } });
    if (el.btnLook) el.btnLook.addEventListener('click', function () { lk.o = null; if (lk.who === 'career' && !lkCareer()) lk.who = 0; lk.venue = menuVenue(); menuGo('look'); });
    if (el.btnLookBack) el.btnLookBack.addEventListener('click', function () { menuBack(); });
    if (el.btnSqLook) el.btnSqLook.addEventListener('click', function () {
      var kb = kbNow(); click(); closePanel(); if (panel || ctx.state !== 'menu') return;
      lk.o = null; lk.who = sqSel; lk.venue = menuVenue();
      mstack.push({ p: mpage, f: 'btnSquad' }); setPage('look', 'go');
      focusSoon(pageFocus(), kb);
    });
    el.lkPick.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-lkpick]') : null; if (!b) return;
      var v = b.getAttribute('data-lkpick'); lkPickSet(v === 'career' ? 'career' : +v);
    });
    el.lkVen.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('[data-ven]') : null; if (b) lkVenue(b.getAttribute('data-ven'), false); });
    el.lkFoot.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-lkf]') : null; if (!b) return;
      var bs = lkFootBtns();
      lk.footI = Math.max(0, bs.indexOf(b)); lkFootSync(false);
      lkFoot(b.getAttribute('data-lkf'));
    });
    // filas: flecha = −1/+1 (mantener = repetir cada 120 ms); resto de la fila, Intro o A = +1
    el.lkList.addEventListener('pointerdown', function (ev) {
      if (ev.button > 0) return;
      var a = ev.target && ev.target.closest ? ev.target.closest('.arr[data-d]') : null, row = a && a.closest('[data-look]'); if (!row) return;
      var slot = row.getAttribute('data-look'), d = +a.getAttribute('data-d');
      lk.lastStep = 0; lkStep(slot, d, a);
      lk.rep = { slot: slot, d: d }; lk.repT = performance.now() + 380;
    });
    var stopRep = function () { lk.rep = 0; };
    window.addEventListener('pointerup', stopRep, { passive: true });
    window.addEventListener('pointercancel', stopRep, { passive: true });
    // tocar la fila (o Intro / A) abre su rejilla de opciones (WP6); las flechas siguen cambiando de una en una
    el.lkList.addEventListener('click', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('.arr[data-d]')) return;   // ya lo hizo pointerdown
      var row = ev.target && ev.target.closest ? ev.target.closest('[data-look]') : null; if (!row) return;
      lkGridOpen(row.getAttribute('data-look'), ev.detail === 0 && (kbNow() || ctx.inputDevice === 'gamepad'));
    });
    // enfocar una fila (teclado, mando, ratón encima) encuadra su ranura
    el.lkList.addEventListener('focusin', function (ev) { var row = ev.target && ev.target.closest ? ev.target.closest('[data-look]') : null; if (row) lkFocusSlot(row.getAttribute('data-look')); });
    if (el.lkGrid) {
      el.lkGrid.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.closest ? ev.target : null; if (!t) return;
        var kb = ev.detail === 0 && (kbNow() || ctx.inputDevice === 'gamepad');
        var b = t.closest('[data-lkv]'); if (b) { lkGridPick(+b.getAttribute('data-lkv'), kb); return; }
        var fm = t.closest('[data-lkfam]'); if (fm) { lkGridFam(fm.getAttribute('data-lkfam')); return; }
        if (t.closest('[data-lkfm]')) { var fs = el.lkGrid.querySelector('.lk-fams'); if (fs) { uiSound('click'); try { fs.scrollBy({ left: fs.clientWidth * 0.7, behavior: 'smooth' }); } catch (e) { fs.scrollLeft += fs.clientWidth * 0.7; } } return; }
        if (t.closest('[data-lkg="close"]')) lkGridClose(kb);
      });
      el.lkGrid.addEventListener('pointerover', function (ev) { if (ev.pointerType !== 'mouse') return; var b = ev.target && ev.target.closest ? ev.target.closest('[data-lkv],[data-lkfam]') : null; if (b && b !== hov) { hov = b; hoverSound(); } });
      // las miniaturas que llegan (main.js, una por frame)
      window.addEventListener('vb-portrait', function (ev) {
        var d = ev && ev.detail; if (!lk.grid || !d || !d.key || lkGK[d.key] == null) return;
        var i = lkGK[d.key]; delete lkGK[d.key]; lkTileShow(i, d);
      });
    }
    var hov = null;
    el.lkList.addEventListener('pointerover', function (ev) { if (ev.pointerType !== 'mouse') return; var b = ev.target && ev.target.closest ? ev.target.closest('[data-look]') : null; if (b && b !== hov) { hov = b; hoverSound(); } });
    el.lkList.addEventListener('scroll', lkMore, { passive: true });
    // girar: arrastrar sobre la mitad derecha (#lkSpin, touch-action:none) y botones ⟲ ⟳ (mantener = seguir girando)
    if (el.lkSpin) {
      el.lkSpin.addEventListener('pointerdown', function (ev) {
        var rb = ev.target && ev.target.closest ? ev.target.closest('[data-rot]') : null;
        if (rb && rb.getAttribute('data-rot') === 'turn') { lkTurn(); ev.preventDefault(); return; }
        if (rb) { lk.btnSpin = +rb.getAttribute('data-rot'); lk.btnT = performance.now(); lkSpinBy(lk.btnSpin * 0.35); lk.idle = 0; ev.preventDefault(); return; }
        // doble toque (o doble clic) sobre el muñeco: de cerca ↔ cuerpo entero (nunca el pellizco: regla de la cámara)
        var nowT = performance.now();
        if (nowT - lk.tapT < 320 && Math.abs(ev.clientX - lk.tapX) < 28 && Math.abs(ev.clientY - lk.tapY) < 28) { lk.tapT = 0; lkZoom(); }
        else { lk.tapT = nowT; lk.tapX = ev.clientX; lk.tapY = ev.clientY; }
        lk.drag = { x: ev.clientX, id: ev.pointerId }; lk.idle = 0; el.lkSpin.classList.add('drag');
        try { el.lkSpin.setPointerCapture(ev.pointerId); } catch (e) { }
      });
      el.lkSpin.addEventListener('pointermove', function (ev) {
        if (!lk.drag || ev.pointerId !== lk.drag.id) return;
        var dx = ev.clientX - lk.drag.x; lk.drag.x = ev.clientX; lkSpinBy(dx * 0.012);
      if (Math.abs(ev.clientX - lk.tapX) > 28) lk.tapT = 0;   // (arrastrar no cuenta como toque)
      });
      var endDrag = function (ev) { if (lk.drag && (!ev || ev.pointerId === lk.drag.id)) { lk.drag = null; el.lkSpin.classList.remove('drag'); } lk.btnSpin = 0; };
      el.lkSpin.addEventListener('pointerup', endDrag);
      el.lkSpin.addEventListener('pointercancel', endDrag);
      el.lkSpin.addEventListener('lostpointercapture', endDrag);
      window.addEventListener('pointerup', function () { lk.btnSpin = 0; }, { passive: true });
      // teclado en los botones (Intro / Espacio): un paso
      el.lkSpin.addEventListener('click', function (ev) { var rb = ev.target && ev.target.closest ? ev.target.closest('[data-rot]') : null; if (!rb || ev.detail !== 0) return; if (rb.getAttribute('data-rot') === 'turn') lkTurn(); else lkSpinBy(+rb.getAttribute('data-rot') * 0.5); });
    }
    window.addEventListener('keyup', function (e) { if (e.key === 'z' || e.key === 'Z' || e.key === 'x' || e.key === 'X') lk.keySpin = 0; });
    window.addEventListener('blur', function () { lk.keySpin = lk.btnSpin = 0; lk.rep = 0; });
  }

  // =====================================================================
  //  PANELES: tutorial, controles, ajustes
  // =====================================================================
  // (UI-18: el antetítulo da contexto, nunca repite el título ni las pestañas)
  var PANELS = { tut: ['pnTut', '', 'Cómo se juega'], ctl: ['pnCtl', '', 'Controles'], set: ['pnSet', '', 'Ajustes'], first: ['pnFirst', '', 'Primer partido'], squad: ['pnSquad', '', 'Jugadores'], about: ['pnAbout', '', 'Acerca de'] };
  // E3/E7: UNA sola pila de vuelta entre paneles. openPanel(name, {from, tab}) abierto con otro panel delante (Ajustes › Controles,
  // Ajustes › Info › Créditos) apila el de delante; «Volver» / Esc / B / «Entendido» vuelven a él, en la misma pestaña y con el
  // foco en la fila que lo abrió. openPanel(name, 'menu' | 'paused') (forma antigua) empieza una pila nueva.
  var pstack = [];
  var SP_PN = /^(tut|ctl|set|first|squad|about)$/;   // paneles con el sistema SPLAT (bloque «SPLAT · PANELES» de index.html)
  var firstAsked = false;
  /** JUGAR desde el menú: la primera vez (sin partidos ni tutorial) ofrece ver el tutorial o jugar ya. */
  function play() {
    if (VB.Install && VB.Install.isOpen && VB.Install.isOpen()) return;   // el aviso de instalar está delante: nunca los dos a la vez
    if (!firstAsked && !record.played && !record.tut && !ctx.debug) {
      firstAsked = true; uiSound('click');
      var di = optIndex('difficulty');
      el.firstDiff.textContent = 'Nivel ' + OPT.difficulty.labels[di] + (di === 0 ? ' (recomendado para empezar)' : '') + '. Se cambia en Partido rápido';
      openPanel('first', 'menu'); return;
    }
    uiSound('start'); goMatch();
  }
  /** Al partido (menú, revancha, tutorial): bajo la cortinilla de marca (UI-13). */
  //  fmt ('2v2' | '6v6', sin guardarlo en el ajuste): desde un partido (revancha, reiniciar) repite el formato del que acaba; desde
  //  el menú manda el ajuste «Formato» (salvo el tutorial, que enseña el 2 contra 2). El 6v6 espectador (?format=6v6) y la Carrera
  //  siguen sin formato: main.js startMatch los resuelve como siempre
  function goMatch(diff, fmt, mini) {
    if (fmt === undefined && ctx.state !== 'menu') fmt = curFmt();
    var o = fmt ? { format: fmt } : undefined;
    if (mini) { o = o || {}; o.introKind = 'mini'; }   // B5/B6: la revancha desde la hoja final, con la previa mini
    // (6v6, lote A D9: justo después de startMatch, el puesto elegido en Controlar; la sim mueve g.ctrl a ese jugador)
    if (!wipeRun(2, function () { if (diff) ctx.actions.setSetting('difficulty', diff); ctx.actions.startMatch(o); applyRole6(); }) && !wp.cb) { ctx.actions.startMatch(o); applyRole6(); }
  }
  /** Formato del partido en curso (para repetirlo), o undefined (sin partido humano de Partido rápido). */
  function curFmt() { var g = ctx.game; return g && !g.demo && !g.watch && !g.career ? (g.size === 6 ? '6v6' : '2v2') : undefined; }
  function goMenu() { if (!wipeRun(2, function () { ctx.actions.toMenu(); }) && !wp.cb) ctx.actions.toMenu(); }
  /** Botón principal de la hoja final (B6, data-act): «Siguiente jornada» (Carrera: al hub, en Partido con el foco en «Jugar
   *  partido»; main.js toMenu), «Otra vez» (reto del día de hoy, previa mini) o «Revancha» (previa mini). */
  function endPrimary() {
    var act = el.btnAgain.getAttribute('data-act') || 'again', g = ctx.game;
    uiSound('start');
    if (ctx.net && act === 'rematch') { if (ctx.actions.netRematch) ctx.actions.netRematch(); onlineEndSync(); return; }   // (online: revancha pactada, fase 3)
    if (act === 'next' || ctx.net) { goMenu(); return; }   // (online: si no, al menú)
    if (g && g.retoOpts && !g.demo) { goReto(true); return; }
    goMatch(null, undefined, !(g && g.career));
  }
  /** Hoja final → «Cambiar opciones»: al menú y directo a la preparación del Partido rápido (Volver lleva a Jugar y luego a la portada). */
  function goOptions() {
    var f = function () {
      ctx.actions.toMenu();
      if (ctx.state !== 'menu') return;
      mstack.length = 0; mstack.push({ p: 'main', f: 'btnPlay' }); mstack.push({ p: 'play', f: 'btnQuick' });
      setPage('quick');
      // foco en la primera opción (Dificultad), después del foco por defecto de la página (¡A jugar!) que pone el cambio de estado
      var kb = kbNow() || ctx.inputDevice === 'gamepad', fo = el.optDiff || pageFocus();
      setTimeout(function () { if (mpage === 'quick' && !panel && ctx.state === 'menu' && fo && !fo.closest('[hidden]')) focusEl(fo, kb); }, 250);
    };
    if (!wipeRun(2, f) && !wp.cb) f();
  }
  function openPanel(name, from) {
    if (!PANELS[name]) return;
    if (name === 'set') wipeNote = '';   // (aviso de «Carrera borrada»: solo hasta cerrar Ajustes)
    var o = from && typeof from === 'object' ? from : null;
    if (capCancel) capCancel();
    if (o && !o.back && panel && panel !== name) {
      var a = document.activeElement;
      pstack.push({ name: panel, tab: panel === 'set' && setTabs ? setTabs.get() : panel === 'ctl' ? ctlView : panel === 'about' && abTabs ? abTabs.get() : null,
        f: a && a.getAttribute && el.panel.contains(a) ? (a.getAttribute('data-go') ? '[data-go="' + a.getAttribute('data-go') + '"]' : a.id ? '#' + a.id : '') : '', kb: kbNow() || ctx.inputDevice === 'gamepad' });
      if (pstack.length > 4) pstack.shift();
    } else if (!o || (!o.back && !panel)) pstack.length = 0;   // (reabrir el mismo panel en otra pestaña conserva la pila)
    if (!panel || !o || !o.back) panelFrom = (o ? o.from : from) || (panel ? panelFrom : ctx.state);
    panel = name;
    for (var k in PANELS) $(PANELS[k][0]).hidden = k !== name;
    el.pnKick.textContent = PANELS[name][1]; el.pnKick.hidden = !PANELS[name][1]; el.pnTitle.textContent = PANELS[name][2];
    if (name === 'tut') { tutGo(0); }
    if (name === 'ctl') { ctlView = o && o.tab && CTL_IDS[o.tab] ? o.tab : device(); renderCtl(); }
    if (name === 'set') { renderOpts(); if (o && o.tab && setTabs) setTabs.set(o.tab, 'api'); setTab(setTabs ? setTabs.get() : 'audio'); }
    if (name === 'squad') renderSquad();
    if (name === 'about') { if (abTabs && o && o.tab) abTabs.set(o.tab, 'api'); renderAbout(); }
    var tb = name === 'set' ? setTabs : name === 'squad' ? sqTabs : name === 'ctl' ? ctlTabs : name === 'about' ? abTabs : null;
    if (tb) { tb.hint(); if (ctx.params.tab && !openPanel._t) { openPanel._t = 1; tb.set(ctx.params.tab, 'api'); } }
    var psh = el.panel.querySelector('.sheet');
    psh.classList.toggle('first', name === 'first');
    psh.classList.toggle('ms', name === 'mstats');
    psh.classList.remove('wide');
    psh.classList.toggle('tabbed', !!tb);
    // SPLAT · PANELES (notes/splat.md): Cómo se juega, Controles, Ajustes, Primer partido, Jugadores y Acerca de con el sistema
    // (#panel.sp-pn: sin velo, columna a la izquierda y el contenido en una hoja .sp-panel con su propio desplazamiento)
    el.panel.classList.toggle('sp-pn', SP_PN.test(name)); el.panel.setAttribute('data-pn', name);
    psh.scrollTop = 0;
    var sc = el.panel.querySelectorAll('.sp-scroll'); for (var si = 0; si < sc.length; si++) sc[si].scrollTop = 0;
    shown = '';
    syncScreens(ctx.game);
    fitSheet(el.panel); fitAllTabs(); checkMore(el.panel); phPanel();
    var pf = o && o.focus ? el.panel.querySelector(o.focus) : null;
    focusLayer(pf || (name === 'tut' ? el.btnTutNext : name === 'first' ? el.btnFirstTut : name === 'about' ? el.btnAbOk : null));
    if (pf && o.kb) setTimeout(function () { if (panel === name && !pf.closest('[hidden]')) focusEl(pf, true); }, 45);
  }
  function closePanel() {
    if (!panel) return false;
    if (capCancel) capCancel();
    if (pstack.length) {   // abierto desde otro panel: vuelve a él (misma pestaña, foco en la fila que lo abrió)
      var pv = pstack.pop();
      openPanel(pv.name, { back: true, tab: pv.tab, focus: pv.f, kb: pv.kb });
      return true;
    }
    var was = panel; panel = null; tutStop();
    if (was === 'mstats') rpBack = true;   // (de vuelta a la hoja final: sin repetir la entrada ni la cuenta de las cifras)
    shown = ''; syncScreens(ctx.game);
    // en pausa, el foco vuelve al botón que abrió el panel (antes caía en «Seguir jugando»)
    focusLayer(ctx.state === 'menu' ? (was === 'squad' ? el.btnSquad : was === 'tut' ? el.btnTut : was === 'ctl' ? el.btnControls : was === 'first' ? el.btnGo : was === 'about' ? null : el.btnSettings)
      : ctx.state === 'paused' ? (was === 'ctl' ? $('btnPControls') : was === 'set' ? $('btnPSettings') : null) : was === 'mstats' && el.btnMStats && !el.btnMStats.hidden ? el.btnMStats : null);
    if (was === 'mstats' && el.btnMStats && kbNow()) setTimeout(function () { if (!panel && document.activeElement === el.btnMStats) focusEl(el.btnMStats, true); }, 45);
    return true;
  }

  // ---------- Acerca de (E7): Novedades y Créditos (datos en js/version.js) ----------
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  /** «2026-11-12» → «12 nov 2026». */
  function fmtDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (+m[3]) + ' ' + MESES[+m[2] - 1] + ' ' + m[1] : String(iso || ''); }
  var abOld = false, abLic = '';
  function verCard(e, open, noSm) {   // (noSm: «v1.x · fecha» repetido con la cabecera .ab-k; el CSS lo oculta solo donde .ab-k se ve —en el móvil apaisado .ab-k no sale—)
    var h = '<div class="card"><h3>' + escT(e.t || ('Versión ' + e.v)) + '<small' + (noSm ? ' class="ab-dup"' : '') + '>' + sepHTML(['v' + e.v, fmtDate(e.d)], 's') + '</small></h3>';
    if (open && e.items && e.items.length) h += '<ul>' + e.items.map(function (x) { return '<li>' + escT(x) + '</li>'; }).join('') + '</ul>';
    else if (e.items) h += '<ul>' + e.items.map(function (x) { return '<li>' + escT(x) + '</li>'; }).join('') + '</ul>';
    return h + '</div>';
  }
  function aboutNewsHTML() {
    var L = VB.CHANGELOG || [], h = '<p class="ab-k">' + sepHTML(['Versión ' + (VB.VERSION || '—'), VB.VERSION_DATE ? fmtDate(VB.VERSION_DATE) : ''], 'd') + '</p>';
    if (!L.length) return h + '<div class="card"><p>Sin novedades.</p></div>';
    h += verCard(L[0], true, L[0].v === VB.VERSION);
    if (L.length > 1) {
      h += '<button type="button" class="opt-reset ab-tg sp-pill" data-ab="old" aria-expanded="' + abOld + '">' + (abOld ? 'Ocultar versiones anteriores' : 'Versiones anteriores') + '</button>';
      if (abOld) for (var i = 1; i < L.length; i++) h += verCard(L[i], false);
    }
    return h;
  }
  function aboutCreditsHTML() {
    var C = VB.CREDITS || {}, Lc = C.licenses || {}, h = '';
    h += '<div class="card"><h3>Creado por</h3><p>' + escT(C.by || 'Ferran') + '</p></div>';
    if (C.tools && C.tools.length) h += '<div class="card"><h3>Hecho con</h3><ul>' + C.tools.map(function (t) { return '<li>' + escT(t) + '</li>'; }).join('') + '</ul></div>';
    if (C.fonts) h += '<div class="card"><h3>Tipografía</h3><p>' + escT(C.fonts) + '</p></div>';
    var lic = function (id, label, txt) {
      if (!txt) return '';
      var on = abLic === id;
      return '<button type="button" class="opt-reset ab-tg sp-pill" data-ab="' + id + '" aria-expanded="' + on + '">' + label + '</button>' + (on ? '<pre class="lic">' + escT(txt) + '</pre>' : '');
    };
    h += '<div class="card"><h3>Licencias</h3>' + (Lc.threeLine ? '<p>' + escT(Lc.threeLine) + '</p>' : '') + '<div class="ab-lics" data-nav>' + lic('three', 'Licencia de three.js', Lc.three) + lic('ofl', 'Licencia de las fuentes', Lc.ofl) + '</div></div>';
    if (C.note) h += '<p class="ab-note">' + escT(C.note) + '</p>';
    var bd = window.__vbBuild;
    h += '<p class="ab-build">v' + escT(VB.VERSION || '—') + (bd && bd.sha ? ' (' + escT(bd.sha) + ')' : '') + '</p>';
    return h;
  }
  function renderAbout() {
    if (!el.abBody) return;
    var tab = abTabs ? abTabs.get() : 'news';
    el.abBody.innerHTML = tab === 'credits' ? aboutCreditsHTML() : aboutNewsHTML();
    if (!el.panel.hidden) { fitSheet(el.panel); checkMore(el.panel); }
  }
  /** Abre Acerca de en una pestaña ('news' | 'credits'); desde Ajustes se apila (Volver regresa a Ajustes › Info). */
  function openAbout(tab, from) {
    tab = tab === 'credits' ? 'credits' : 'news';
    if (tab === 'news' && VB.VERSION) { seenSet(VB.VERSION); if (el.btnVer) el.btnVer.classList.remove('new'); }
    abLic = '';
    openPanel('about', { tab: tab, from: from || (panel ? panelFrom : ctx.state) });
  }
  // Novedades que salen solas, una vez por versión (make-the-cut.seen = {v}; solo de este dispositivo: account.js no la sube).
  // Jugador nuevo: se marca la versión sin enseñar nada. Jugador que vuelve: en la portada libre 1,5 s seguidos y ≥ 2,2 s
  // desde la carga, sin el aviso de instalar, la cuenta ni la Carrera abiertos; nunca con ?debug, autopilot ni nonews.
  function seenGet() { try { var o = JSON.parse(localStorage.getItem('make-the-cut.seen') || 'null'); return o && typeof o.v === 'string' ? o.v : ''; } catch (e) { return ''; } }
  function seenSet(v) { try { localStorage.setItem('make-the-cut.seen', JSON.stringify({ v: v })); } catch (e) { } }
  /** ¿Jugador que vuelve? (ajustes guardados, partidos jugados, una Carrera o el escuadrón). Se mira al cargar ui.js, antes de que
   *  nada escriba en el almacenamiento. */
  function isReturning() {
    try {
      var ls = localStorage;
      if (ls.getItem('make-the-cut.settings') !== null || ls.getItem('make-the-cut.career') || ls.getItem('make-the-cut.squad')) return true;
      var r = JSON.parse(ls.getItem('make-the-cut.record') || 'null'); return !!(r && r.played > 0);
    } catch (e) { return false; }
  }
  var wasReturning = isReturning(), aboutAuto = 'off', aboutIv = 0;
  function newsAuto() {
    var V = VB.VERSION; aboutAuto = 'off';
    if (!V || seenGet() === V) return;
    if (!wasReturning) { seenSet(V); return; }
    if (ctx.debug || ctx.params.autopilot || ctx.params.nonews) return;
    aboutAuto = 'waiting';
    var idle = 0;
    aboutIv = setInterval(function () {
      if (seenGet() === V) { clearInterval(aboutIv); if (aboutAuto === 'waiting') aboutAuto = 'off'; return; }
      var ok = VB.UI.menuIdle() && !document.hidden && !(VB.Install && VB.Install.isOpen && safe(VB.Install.isOpen)) &&
        !(VB.Account && VB.Account.isOpen && safe(VB.Account.isOpen)) && !(VB.CareerUI && VB.CareerUI.isOpen && safe(VB.CareerUI.isOpen));
      idle = ok ? idle + 250 : 0;
      if (idle >= 1500 && performance.now() >= 2200) { clearInterval(aboutIv); aboutAuto = 'shown'; openAbout('news', 'menu'); }
    }, 250);
  }
  // Reto del día al abrir el juego (15-nov-2026, Ferran: «los retos diarios deberían salir nada más abrir el juego»). La primera vez
  // de cada día (make-the-cut.retoauto = AAAAMMDD, solo de este dispositivo) y si aún no tienes medalla de hoy, se abre Retos › Hoy en
  // cuanto la portada está libre (1 s seguido y ≥ 1,6 s desde la carga), después de las Novedades si salen solas. Al jugador nuevo
  // (primera carga) no: primero la portada. Nunca con ?debug, autopilot ni nonews; «‹ Volver» deja en Jugar con el foco en Retos.
  var RETO_AUTO = 'make-the-cut.retoauto';
  function retoAuto() {
    var R = VB.Retos; if (!R || !R.today || !R.dayState || !el.mpRetos || !wasReturning) return;
    if (ctx.debug || ctx.params.autopilot || ctx.params.nonews) return;
    var k = String(safe(R.today) || ''); if (!k) return;
    try { if (localStorage.getItem(RETO_AUTO) === k) return; } catch (e) { return; }
    var ds = safe(R.dayState); if (ds && ds.m > 0) return;
    var idle = 0, iv = setInterval(function () {
      if (aboutAuto === 'waiting') { idle = 0; return; }   // primero las Novedades (se abren y se cierran solas en su intervalo)
      var ok = VB.UI.menuIdle() && !document.hidden && !(VB.Install && VB.Install.isOpen && safe(VB.Install.isOpen)) &&
        !(VB.Account && VB.Account.isOpen && safe(VB.Account.isOpen)) && !(VB.CareerUI && VB.CareerUI.isOpen && safe(VB.CareerUI.isOpen));
      idle = ok ? idle + 250 : 0;
      if (idle >= 1000 && performance.now() >= 1600) {
        clearInterval(iv);
        try { localStorage.setItem(RETO_AUTO, k); } catch (e) { }
        VB.UI.openRetos('hoy');
      }
    }, 250);
  }
  // Título de la pestaña (E7 §2.5): solo se escribe cuando cambia la clave numérica (estado, set y tanteo, Carrera abierta)
  var ttKey = -1;
  function tabTitle(g) {
    if (ctx.portraitBlock) return;
    var s = ctx.state, st = s === 'playing' ? 1 : s === 'paused' ? 2 : s === 'over' ? 3 : 0, live = !!(g && !g.demo && st > 0);
    var car = !live && !!(VB.CareerUI && VB.CareerUI.isOpen && safe(VB.CareerUI.isOpen));
    var drill = live && !!g.drill, intro = live && st === 1 && ctx.introLeft > 0, fin = live && st === 3 && !!g.finished;
    var key = !live ? (car ? 1 : 0) : drill ? (st === 2 ? 3 : 2) : 10 + st * 1e7 + (intro ? 5e6 : 0) + (fin ? 4e6 + g.sets[0] * 10 + g.sets[1] : (g.setNo || 1) * 1e4 + Math.min(99, g.score[0]) * 100 + Math.min(99, g.score[1]));
    if (key === ttKey) return;
    ttKey = key;
    var T = 'Make the Cut', t;
    if (!live) t = car ? 'Carrera — ' + T : T;
    else if (st === 2) t = 'Pausa — ' + T;
    else if (drill) t = 'Entrenamiento — ' + T;
    else if (fin) t = (g.sets[0] > g.sets[1] ? '¡Victoria! ' : 'Derrota ') + g.sets[0] + '-' + g.sets[1] + ' — ' + T;
    else if (intro) t = '¡A jugar! — ' + T;
    else t = 'Set ' + (g.setNo || 1) + ' | ' + g.score[0] + '-' + g.score[1] + ' — ' + T;
    try { document.title = t; } catch (e) { }
  }

  // ---------- Controles (UI-21 / UI-22) ----------
  // El dispositivo en uso va grande, en dos columnas; los otros, en pestañas pequeñas (clic, toque, ←/→ o el stick).
  var ctlView = 'keyboard';
  function K(t) { return '<kbd>' + t + '</kbd>'; }
  function S(t) { return '<span class="key">' + t + '</span>'; }
  /** Botón del ratón como tecla: un ratón dibujado con el botón izquierdo ('l'), derecho ('r') o la rueda ('c') relleno. */
  function M(side) {
    var b = side === 'r' ? 'M8 2.6V8.4H13.4V8.2A5.4 5.4 0 0 0 8 2.6Z' : side === 'c' ? 'M6.6 3.6H9.4V7.6H6.6Z' : 'M8 2.6V8.4H2.6V8.2A5.4 5.4 0 0 1 8 2.6Z';
    return '<kbd class="ms" aria-label="clic ' + (side === 'r' ? 'derecho' : side === 'c' ? 'central (rueda)' : 'izquierdo') + '"><svg viewBox="0 0 16 22" width="15" height="20" aria-hidden="true" style="display:block">' +
      '<rect x="1.4" y="1.4" width="13.2" height="19.2" rx="6.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 1.6V8.4M1.6 8.4H14.4" stroke="currentColor" stroke-width="1.4"/>' +
      // botón pulsado en ámbar (con currentColor no se distinguía el izquierdo del derecho)
      '<path d="' + b + '" fill="#ffb238" stroke="#ffb238" stroke-width=".6"/></svg></kbd><small aria-hidden="true">' + (side === 'r' ? 'der.' : side === 'c' ? 'rueda' : 'izq.') + '</small>';
  }
  function T(t, j) { return '<span class="key tch' + (j === 's' ? ' s' : j ? ' j' : '') + '">' + t + '</span>'; }
  function ctlRows(dv) {
    var R = ctlRowsAll(dv);
    // modo «Control: Uno»: no hay cambio de jugador (ni tecla, ni botón ⇄)
    // 6v6 (sprint 3): el mismo botón pide el balón al colocador («¡Pídela!»)
    // (y moverse: el personaje ya no va solo a su sitio; sin balón, su sitio es el aro celeste del suelo, fx posMark)
    // (lote A: la marca del suelo cambia con la fase —recibir, bloquear, colocar, atacar, defender—; el colocador coloca con GOLPEAR
    //  en el suelo o COLOCAR, y la dirección elige a quién —C2: sin dirección, alta a la 4; ↖ tensa a la 4, ↑ rápida, ↗ / → a la 2, ↓ pipe—)
    if (fmt6()) {
      R = R.map(function (r) { return r[1] === 'Cambiar jugador' ? [r[0], 'Pedir el balón <small>(antes de la colocación)</small>'] : r[1] === 'Moverse' ? [r[0], 'Moverse <small>(sin balón, a la marca del suelo)</small>'] : r; });
      R.splice(2, 0, [R[1][0], 'Colocar <small>(colocador: la dirección elige a quién; sin dirección, alta a la 4)</small>']);
    }
    else {
      if (oneMode()) R = R.filter(function (r) { return r[1] !== 'Cambiar jugador'; });
      // C2: colocar por destino (2v2, «Colocación dirigida: Sí»)
      if (ctx.settings.aimSet !== false) R.splice(4, 0, [dv === 'touch' ? S('Joystick') : dv === 'gamepad' ? S('Stick') : K('↑') + K('←') + K('↓') + K('→'), 'Al colocar: sin dirección, alta a la 4; ya bajo el balón, con dirección eliges el destino']);
    }
    // Salto con impulso (v1.12.0): dirección + SALTAR = salto hacia delante (detrás de la fila de la finta); con la diana de colocación
    // (Ajustes · Juego), otra fila
    var dirK = dv === 'touch' ? S('Joystick') : dv === 'gamepad' ? S('Stick') : K('↑') + K('←') + K('↓') + K('→');
    var jmpK = dv === 'touch' ? T('Saltar', 1) : dv === 'gamepad' ? padKey('b') : K('Espacio');
    var fi = -1; for (var ri = 0; ri < R.length; ri++) if (/^Finta/.test(R[ri][1])) fi = ri;
    var add = [[dirK + '<small>y</small>' + jmpK, 'Salto con dirección <small>(corriendo hacia la red, el remate sale más fuerte)</small>']];
    if (ctx.settings.jsetAim === true) add.push([dirK, 'En la colocación en salto: mueves la diana']);
    R.splice.apply(R, [fi >= 0 ? fi + 1 : R.length, 0].concat(add));
    return R;
  }
  function ctlRowsAll(dv) {
    if (dv === 'gamepad') {
      var P = padSet();
      return [[S('Stick') + S('Cruceta'), 'Moverse'], [padKey('a'), 'Golpear y sacar <small>(stick: diana del saque)</small>'], [padKey('b'), 'Saltar <small>(en el aire: dejada)</small>'], [padKey('x'), 'Colocar <small>(en el suelo, coloca si te toca; en el aire, en salto; en el 3r toque, golpe colocado)</small>'], [padKey('a') + '<small>y</small>' + padKey('b'), 'Finta <small>(en el aire: golpear pronto y saltar al golpear)</small>'],
        [padKey('y') + S(P.lb) + S(P.rb), 'Cambiar jugador'], [S(P.start), 'Pausa'], [S(P.select), 'Sonido'], [S(padFam() === 'ps' ? 'L2' : 'LT'), 'Challenge <small>(7 s tras el punto)</small>'], [S('Stick der.'), 'Zoom de cámara <small>(arriba acerca, abajo aleja)</small>'], [padKey('a') + padKey('b'), 'Menús: aceptar y volver']];
    }
    if (dv === 'touch') return [[S('Joystick') + '<small>mitad izquierda</small>', 'Moverse'], [T('Golpear'), 'Golpear y sacar <small>(joystick: diana del saque)</small>'],
      [T('Saltar', 1), 'Saltar <small>(en el aire: dejada)</small>'], [T('Colocar', 's'), 'Colocar <small>(en el aire, en salto; en el 3r toque, golpe colocado; en el suelo, tu colocación va con Golpear)</small>'], [T('Golpear') + '<small>→</small>' + T('Saltar', 1), 'Finta <small>(en el aire: toca Golpear pronto y desliza a Saltar al golpear)</small>'], [S('⇄'), 'Cambiar jugador'], [S('CHALLENGE'), 'Challenge <small>(7 s tras el punto)</small>'], [S('II'), 'Pausa'], [S('Lupa'), 'Zoom de cámara <small>(cada toque, un nivel más lejos; del 5 vuelve al 1)</small>']];
    // C2 (15-nov-2026): con ratón, clic izquierdo golpea, clic derecho coloca y la rueda salta (J / X, K y Espacio siguen de alternativa)
    return [[K('W') + K('A') + K('S') + K('D') + '<small>o</small>' + K('↑') + K('←') + K('↓') + K('→'), 'Moverse'], [M('l') + '<small>o</small>' + K('J') + K('X'), 'Golpear y sacar <small>(flechas: diana)</small>'],
      [K('Espacio') + '<small>o</small>' + M('c'), 'Saltar <small>(en el aire: dejada)</small>'], [M('r') + '<small>o</small>' + K('K'), 'Colocar <small>(en el suelo, en tu 2º toque; en el aire, en salto; en el 3r toque, golpe colocado)</small>'], [M('l') + '<small>y</small>' + K('Espacio'), 'Finta <small>(en el aire: golpear pronto y saltar al golpear)</small>'], [K('C'), 'Cambiar jugador'], [K('V'), 'Challenge <small>(7 s tras el punto)</small>'], [K('P') + K('Esc'), 'Pausa'], [K('M'), 'Sonido'], [K('+') + K('-') + '<small>o</small>' + M('c'), 'Zoom de cámara <small>(rueda girada)</small>']];
  }
  function renderCtl() {
    var cur = device();
    if (ctlTabs) {
      // «en uso» en la pestaña del dispositivo activo; la elegida es ctlView
      var items = ctlOrder().map(function (t) { return { id: t[0], label: t[1], icon: TAB_IC[t[0]], badge: t[0] === cur ? 'en uso' : '', cls: t[0] === cur ? 'cur' : '' }; });
      var key = cur + '|' + ctlView;
      if (ctlTabs._k !== key) { ctlTabs._k = key; ctlTabs.cur = ctlView; ctlTabs.refresh(items); }
    }
    var I = VB.Input, edit = !!(I && I.captureNext && I.rebind && I.bindings && I.keyName), h = '';
    if (edit && ctlView === 'keyboard') h = ctlKeysHTML(I);
    else if (edit && ctlView === 'gamepad') h = ctlPadHTML(I);
    else {
      var R = ctlRows(ctlView);
      if (ctlView === 'touch') h += '<div class="opt-g"><button class="opt" data-opt="touchSize" data-need="Input"><span>Tamaño de botones<small>Golpear, Saltar y Colocar</small></span><span class="seg sp-seg" data-seg="touchSize"></span></button></div>';
      if (ctlView === 'touch' && VB.Splat && VB.Splat.phone && VB.Splat.phone()) {
        // V-TOUCHCTL (móvil): Táctil con las mismas filas que Teclado / Mando: rótulo dorado + UNA línea de ayuda a la izquierda
        // (primera frase del paréntesis; «i» con helpFit si no cabe) y los botones a la derecha. En PC sigue la <dl>.
        h += '<div class="ctl ctl-t">';
        for (var j = 0; j < R.length; j++) {
          var keys = R[j][0], d = R[j][1], si = d.indexOf('<small>'), tt = si < 0 ? d : d.slice(0, si), help = '';
          if (si >= 0) help = d.slice(si).replace(/<\/?small>/g, '').replace(/^\s*\(|\)\s*$/g, '').split(';')[0].trim();
          if (keys.indexOf('<small>mitad izquierda</small>') >= 0) { keys = keys.replace('<small>mitad izquierda</small>', ''); help = 'Joystick: mitad izquierda' + (help ? '; ' + help : ''); }
          if (help) help = help.charAt(0).toUpperCase() + help.slice(1);
          h += '<div><span class="kl">' + tt.trim() + (help ? '<small>' + help + '</small>' : '') + '</span><span class="ks">' + keys + '</span></div>';
        }
        h += '</div>';
      } else {
        h += '<dl class="ctl">';
        for (var j2 = 0; j2 < R.length; j2++) h += '<div><dt>' + R[j2][0] + '</dt><dd>' + R[j2][1] + '</dd></div>';
        h += '</dl>';
      }
    }
    el.ctlGrid.innerHTML = h;
    if (!capturing && el.ctlMsg && ctlMsgFor !== ctlView) ctlMsgSet('');
    renderOpts();
    var note = el.pnCtl.querySelector('.ctl-note');
    // C2: colocar por destino (2v2 con «Colocación dirigida: Sí»)
    var setT = !fmt6() && ctx.settings.aimSet !== false ? ' Al colocar, sin dirección va alta a la 4; ya bajo el balón, con dirección eliges el destino.' : '';
    // salto con impulso (v1.12.0): la nota se ve en las tres pestañas (con reasignar teclas, Teclado y Mando no pintan las filas de ctlRows)
    setT += ' Corriendo hacia la red, salta sin soltar la dirección: el remate sale más fuerte.' + (ctx.settings.jsetAim === true ? ' En la colocación en salto, la dirección mueve la diana.' : '');
    if (note) note.innerHTML = fmt6() ? '<b>Arriba</b> es siempre hacia la red. En el 6 contra 6 llevas al <b>' + roleName().toLowerCase() + '</b> (n.º ' + sixNum() + ') y la IA al resto. Sin balón, la marca del suelo es tu sitio. Mantén una dirección al golpear para apuntar; en el saque y el remate, mueve la diana.' + setT
      : oneMode() ? '<b>Arriba</b> es siempre hacia la red. Llevas siempre al <b>n.º ' + oneNum() + '</b> y la IA a tu pareja. Mantén una dirección al golpear para apuntar; en el saque y el remate, mueve la diana.' + setT
      : '<b>Arriba</b> es siempre hacia la red. El control pasa solo a quien da el siguiente toque. Mantén una dirección al golpear para apuntar; en el saque y el remate, mueve la diana.' + setT;
    if (!el.panel.hidden) { fitSheet(el.panel); checkMore(el.panel); if (panel === 'ctl') phPanel(); }
  }
  function ctlStep(d, how) { if (ctlTabs) ctlTabs.step(d, how || 'key'); }
  // ---------- E3: teclas y botones reasignables (VB.Input: bindings, rebind, captureNext, keyName, padName) ----------
  var CTL_IDS = { keyboard: 1, gamepad: 1, touch: 1 };
  var KEY_ACTS = ['up', 'down', 'left', 'right', 'hit', 'jump', 'jset', 'switch', 'challenge', 'pause', 'mute', 'zoomIn', 'zoomOut'];
  function actLabel(a) {
    return ({ up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', hit: 'Golpear y sacar', jump: 'Saltar', jset: 'Colocar',
      'switch': fmt6() ? 'Pedir el balón' : 'Cambiar jugador', sw: fmt6() ? 'Pedir el balón' : 'Cambiar jugador', challenge: 'Challenge', chal: 'Challenge', pause: 'Pausa', mute: 'Sonido', zoomIn: 'Acercar la cámara', zoomOut: 'Alejar la cámara' })[a] || a;
  }
  var capturing = false, capCancel = null, ctlMsgFor = '';
  function ctlMsgSet(h, bad) {
    if (!el.ctlMsg) return;
    if (el.ctlMsg.innerHTML !== h) el.ctlMsg.innerHTML = h;
    el.ctlMsg.classList.toggle('bad', !!bad); ctlMsgFor = h ? ctlView : '';
  }
  function slotHTML(kind, act, slot, label, name, empty, dis) {
    return '<button type="button" class="kslot' + (empty ? ' empty' : '') + (dis ? ' fixed' : '') + '" data-kind="' + kind + '" data-act="' + act + '" data-slot="' + slot + '"' + (dis ? ' disabled' : '') +
      ' aria-label="' + escT(label + (kind === 'pad' ? ', botón: ' : ', tecla ' + (slot + 1) + ': ') + (empty ? 'ninguna' : name)) + '">' + escT(empty ? '—' : name) + '</button>';
  }
  function ctlKeysHTML(I) {
    var B = I.bindings(), K = B.keys || {}, one = oneMode() && !fmt6(), h = '<div class="ctl kb">';
    KEY_ACTS.forEach(function (a) {
      var k = K[a] || ['', ''], L = actLabel(a), sub = a === 'up' ? 'hacia la red' : a === 'switch' && one ? '(modo Un jugador)' : a === 'pause' ? 'y Esc' :
        a === 'hit' ? 'o clic' : a === 'jset' ? 'o clic derecho' : a === 'jump' ? 'o clic de rueda' : a === 'zoomIn' ? 'o rueda adelante' : a === 'zoomOut' ? 'o rueda atrás' : '';   // (C2: el ratón, fijo)
      h += '<div' + (a === 'switch' && one ? ' class="dim"' : '') + '><span class="kl">' + L + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="ks">' +
        slotHTML('key', a, 0, L, k[0] ? I.keyName(k[0]) : '', !k[0]) + slotHTML('key', a, 1, L, k[1] ? I.keyName(k[1]) : '', !k[1]) + '</span></div>';
    });
    return h + '</div><p class="ctl-fixed"><b>Fijas:</b> Esc pausa y vuelve, Intro acepta, Q / E cambian de apartado. <b>Ratón:</b> clic izq. golpea, der. coloca, clic de rueda salta y la rueda acerca o aleja la cámara.</p>' +
      '<button type="button" class="opt-reset sp-pill" data-reset="keys">Restablecer teclas</button>';
  }
  function ctlPadHTML(I) {
    var B = I.bindings(), P = B.pad || {}, std = B.padStd !== false, fam = B.padFam === 'ps' ? 'ps' : 'xbox', ex = B.fixed && B.fixed.pad && B.fixed.pad.swExtra || [];
    var acts = B.padActs || ['hit', 'jump', 'jset', 'sw', 'chal'], h = '<div class="ctl kb">';
    acts.forEach(function (a) {
      var i = P[a] ? P[a][0] : -1, L = actLabel(a), sub = a === 'sw' && ex.length ? 'y ' + ex.map(function (b) { return I.padName(b, fam); }).join(' / ') : a === 'jset' ? 'en el suelo, coloca si te toca; si no, salta' : '';
      h += '<div><span class="kl">' + L + (sub ? '<small>' + escT(sub) + '</small>' : '') + '</span><span class="ks">' + slotHTML('pad', a, 0, L, i >= 0 ? I.padName(i, fam) : '', i < 0, !std) + '</span></div>';
    });
    h += '</div>';
    if (!std) h += '<p class="ctl-fixed">Este mando no usa la distribución estándar: botones fijos.</p>';
    h += '<div class="opt-g"><button class="opt" data-opt="padDead" data-need="Input"><span>Zona muerta<small>Para mandos con el stick que se mueve solo</small></span><span class="slider sp-slider" data-sl="padDead"><span class="trk"><i></i><b></b></span><span class="v">18%</span></span></button>' +
      '<button class="opt" data-opt="rumble"><span>Vibración<small>Del mando y del móvil en los golpes</small></span><span class="seg sp-seg" data-seg="rumble"></span></button></div>';
    h += '<p class="ctl-fixed">' + (std ? '<b>Stick derecho:</b> arriba acerca la cámara y abajo la aleja. ' : '') + (fam === 'ps' ? 'En los menús, ✕ acepta, ○ vuelve y L1 / R1 cambian de apartado.' : 'En los menús, A acepta, B vuelve y LB / RB cambian de apartado.') + '</p>';
    return h + (std ? '<button type="button" class="opt-reset sp-pill" data-reset="pad">Restablecer botones</button>' : '');
  }
  /** Reasignar: Intro / clic / toque / A sobre una tecla → la siguiente tecla (o botón) pulsada. Mientras dura, ni nav() ni
   *  onKey hacen nada (input.js además se traga esa pulsación). Esc cancela, Retroceso borra la 2ª tecla, 6 s → sin cambios. */
  function ctlSlot(b) {
    var I = VB.Input; if (!I || !I.captureNext || !I.rebind || b.disabled) return;
    if (capturing) { if (b.classList.contains('cap') && capCancel) capCancel(); return; }
    var kind = b.getAttribute('data-kind') === 'pad' ? 'pad' : 'key', act = b.getAttribute('data-act'), slot = +b.getAttribute('data-slot') || 0;
    var kb = kbNow() || ctx.inputDevice === 'gamepad', fam = padFam() === 'ps' ? 'ps' : 'xbox';
    capturing = true; b.classList.add('cap'); b.textContent = kind === 'pad' ? 'Pulsa un botón…' : 'Pulsa una tecla…';
    ctlMsgSet(sepHTML(kind === 'pad' ? ['Start cancela'] : ['Esc cancela', 'Retroceso borra'], 'v'));
    uiSound('click');
    var nm = function (v) { return kind === 'pad' ? I.padName(v, fam) : I.keyName(v); };
    var cancel = I.captureNext(kind, function (v, why) {
      capturing = false; capCancel = null;
      var msg = '', bad = false;
      if (v == null || why === 'cancel' || why === 'timeout') msg = why === 'timeout' ? 'Sin cambios: se acabó el tiempo' : 'Sin cambios';
      else {
        var holder = '';
        try { var B0 = I.bindings(), M0 = kind === 'pad' ? B0.pad : B0.keys; for (var a in M0) if (a !== act && M0[a][0] === v) holder = a; } catch (e) { }
        var r = I.rebind(kind, act, slot, v);
        if (r.err) {
          bad = true;
          msg = r.err === 'reserved' ? (kind === 'pad' ? 'Ese botón no se puede asignar' : 'Esa tecla está reservada')
            : r.err === 'empty' ? actLabel(holder || act) + (kind === 'pad' ? ' se quedaría sin botón' : ' se quedaría sin tecla')
            : r.err === 'primary' ? (kind === 'pad' ? 'El botón no se puede quitar' : 'La primera tecla no se puede quitar') : 'Sin cambios';
        } else {
          ctx.actions.setSetting(kind === 'pad' ? 'padKeys' : 'keys', kind === 'pad' ? r.pad : r.keys);
          msg = r.swap ? 'Cambiadas: ' + nm(v) + ' para ' + actLabel(act) + ', ' + nm(r.swap.code) + ' para ' + actLabel(r.swap.act)
            : v === '' ? 'Sin 2ª tecla para ' + actLabel(act) : nm(v) + ' para ' + actLabel(act);
        }
      }
      if (panel === 'ctl') {
        renderCtl(); ctlMsgSet(escT(msg), bad);
        var nb = el.ctlGrid.querySelector('.kslot[data-kind="' + kind + '"][data-act="' + act + '"][data-slot="' + slot + '"]');
        if (nb) focusEl(nb, kb);
        if (bad) uiSound2('arrowEdge', 1); else uiSound(why === 'cancel' || why === 'timeout' ? 'back' : 'click');
      }
    });
    capCancel = typeof cancel === 'function' ? cancel : null;
  }
  var CTL_TABS = [['keyboard', 'Teclado'], ['gamepad', 'Mando'], ['touch', 'Táctil']];
  /** Orden de las pestañas de Controles: con pantalla táctil, Táctil la primera (buildTabs y renderCtl, que las rehace al abrir). */
  function ctlOrder() { return ctx && ctx.isTouch ? [CTL_TABS[2], CTL_TABS[0], CTL_TABS[1]] : CTL_TABS; }
  var ctlTabs = null, sqTabs = null, setTabs = null, abTabs = null;
  var SET_TABS = [['audio', 'Audio'], ['image', 'Imagen'], ['cam', 'Cámara'], ['game', 'Juego'], ['a11y', 'Accesibilidad'], ['kit', 'Equipación'], ['info', 'Info']];
  /** Ajustes: solo se ve el grupo de la pestaña elegida (Audio · Imagen · Cámara · Juego · Accesibilidad · Equipación · Info). */
  function setTab(id) {
    var gs = el.optList ? el.optList.querySelectorAll('.opt-g[data-tab]') : [];
    for (var i = 0; i < gs.length; i++) gs[i].hidden = gs[i].getAttribute('data-tab') !== id;
    if (!el.panel.hidden) { fitSheet(el.panel); checkMore(el.panel); phPanel(); }
  }
  /** Móvil (notes/ui_main.md «Móvil (v-next)»): en Ajustes, segmentados según el número de opciones (VB.Splat.fitSeg: interruptor,
   *  segmentado o selector) y ayudas de una línea con «i» (VB.Splat.helpFit); en Jugadores, las ayudas de los atributos. Sin html.ph
   *  no cambia nada (fitSeg quita sus controles). */
  function phPanel() {
    var S = VB.Splat; if (!S || !S.fitSeg || !S.phone || !S.phone() || el.panel.hidden) return;   // (fitSeg y helpFit se deshacen solos con vb:ph)
    if (panel === 'set') {
      S.fitSeg(el.optList); if (S.helpFit) S.helpFit(el.optList, '.opt');
      // V-KIT: tira de muestras desplazable de lado (desvanecido si queda algo a la derecha) y la elegida a la vista
      var ks = el.optList.querySelectorAll('.opt-kit .seg.kit');
      for (var k = 0; k < ks.length; k++) {
        var sk = ks[k]; if (!sk.offsetParent) continue;
        if (S.more) S.more(sk);
        var on = sk.querySelector('span.on');
        if (on && sk.scrollWidth > sk.clientWidth + 1) {
          var a = sk.getBoundingClientRect(), b = on.getBoundingClientRect();
          if (b.left < a.left || b.right > a.right) sk.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
        }
      }
    }
    if (panel === 'squad' && S.helpFit) S.helpFit(el.sqBody, '.sq-r');
    if (panel === 'ctl' && S.helpFit && el.ctlGrid.querySelector('.ctl-t')) S.helpFit(el.ctlGrid, '.ctl-t>div');   // V-TOUCHCTL
  }
  /** Crea las barras de pestañas de los paneles (una vez, en init). */
  function buildTabs() {
    // (móvil: con pantalla táctil, Táctil es la primera pestaña; ctlView ya abre en el dispositivo en uso)
    var ctlT = ctlOrder();
    ctlTabs = makeTabs(el.ctlTabs, ctlT.map(function (t) { return { id: t[0], label: t[1], icon: TAB_IC[t[0]] }; }),
      { value: 'keyboard', label: 'Dispositivo', pane: el.ctlGrid, swipe: el.pnCtl, onChange: function (id) { if (capCancel) capCancel(); ctlView = id; renderCtl(); } });
    // E3/E7: 7 pestañas (Info siempre la última); si no caben, modo compacto (fitTabs)
    setTabs = makeTabs(el.setTabs, SET_TABS.map(function (t) { return { id: t[0], label: t[1], icon: TAB_IC[t[0]] }; }),
      { value: 'audio', label: 'Apartado de ajustes', pane: el.optList, onChange: function (id) { setTab(id); } });
    if (el.abTabs) abTabs = makeTabs(el.abTabs, [{ id: 'news', label: 'Novedades', icon: TAB_IC.news }, { id: 'credits', label: 'Créditos', icon: TAB_IC.credits }],
      { value: 'news', label: 'Acerca de', pane: el.abBody, onChange: function () { renderAbout(); } });
    sqTabs = makeTabs(el.sqTabs, sqItems(), { value: 'g0', label: 'Apartado', pane: el.sqBody, onChange: function () { renderSquad(); phPanel(); } });
  }

  // ---------- Opciones ----------
  var OPT = {
    // 4 niveles (sim: VB.DIFF_ORDER / VB.DIFF[k].name)
    difficulty: (VB.DIFF_ORDER && VB.DIFF) ? { vals: VB.DIFF_ORDER.slice(), labels: VB.DIFF_ORDER.map(function (k) { return (VB.DIFF[k] && VB.DIFF[k].name) || k; }) }
      : { vals: ['easy', 'normal', 'hard', 'expert'], labels: ['Fácil', 'Normal', 'Difícil', 'Experto'] },
    muted: { vals: [false, true], labels: ['Sí', 'No'] },
    quality: { vals: ['auto', 'high', 'medium', 'low'], labels: ['Auto', 'Alta', 'Media', 'Baja'] },
    showHelp: { vals: [true, false], labels: ['Sí', 'No'] },
    // Partido rápido: puntos por set (sim: VB.Sim.SET_POINTS); el set decisivo va a min(15, puntos)
    setPoints: { vals: [11, 15, 21, 25], labels: ['11', '15', '21', '25'] },
    // control: los dos jugadores (el control pasa a quien toca) o solo uno (la IA lleva al compañero; sim: g.ctrlMode)
    // En modo Uno llevas siempre al n.º 1 (ya no se elige a cuál; el ajuste antiguo ctrlPlayer se ignora). desc: ayuda de la fila
    // La fila se lee entera: «Controlar ‹ a los dos jugadores ›» / «Controlar ‹ un jugador ›» (petición de Ferran); en pantallas
    // estrechas «jugadores» (.cv-x) se oculta por CSS y queda «Controlar ‹ a los dos ›»
    ctrlMode: { vals: ['both', 'one'], labels: ['A los dos<span class="cv-x"> jugadores</span>', 'Un jugador'], desc: ['Controlar a los dos jugadores', 'Controlar un jugador'] },
    coachTips: { vals: [true, false], labels: ['Sí', 'No'] },
    coachCalls: { vals: [true, false], labels: ['Sí', 'No'] },
    ambient: { vals: ['full', 'calm', 'off'], labels: ['Completo', 'Tranquilo', 'Apagado'] },   // Ambiente de Carrera (P3; DEFAULTS en main.js)
    // formato del Partido rápido (sprint 3 del 6v6; main.js ctx.settings.format): 2 contra 2 o 6 contra 6 (en el pabellón; el puesto, en Controlar: role6)
    format: { vals: ['2v2', '6v6'], labels: ['2 contra 2', '6 contra 6'] },
    // cámara del 6v6 (camera_input, camera.js; main.js ctx.settings.cam6): detrás de tu jugador (por defecto) o la de televisión. En Ajustes ·
    // Imagen y, en la preparación del 6 contra 6, en el sitio de Escenario (que ahí es fijo)
    cam6: { vals: ['3p', 'tv'], labels: ['3ª persona', 'Televisión'], help: ['Detrás de tu jugador, siguiendo la jugada', 'Alta, desde el fondo: ves a los 12'] },
    // Equipación (Ajustes · Equipación): muestras de color; players.js setKit deriva el resto de tonos
    kitShirt: { vals: [0xff5a2c, 0xd8262e, 0xf2c230, 0x1f9a4a, 0x32b5e8, 0x7b3fd1, 0x22252c, 0xf2f4f8], labels: ['<i class="sw" style="background:#ff5a2c" title="Naranja"></i>', '<i class="sw" style="background:#d8262e" title="Rojo"></i>', '<i class="sw" style="background:#f2c230" title="Amarillo"></i>', '<i class="sw" style="background:#1f9a4a" title="Verde"></i>', '<i class="sw" style="background:#32b5e8" title="Celeste"></i>', '<i class="sw" style="background:#7b3fd1" title="Morado"></i>', '<i class="sw" style="background:#22252c" title="Negro"></i>', '<i class="sw" style="background:#f2f4f8" title="Blanco"></i>'] },
    kitAccent: { vals: [0xffb238, 0xffffff, 0x1a1c22, 0xd9a520, 0x8fd3ff, 0xff4040], labels: ['<i class="sw" style="background:#ffb238" title="Ámbar"></i>', '<i class="sw" style="background:#ffffff" title="Blanco"></i>', '<i class="sw" style="background:#1a1c22" title="Negro"></i>', '<i class="sw" style="background:#d9a520" title="Dorado"></i>', '<i class="sw" style="background:#8fd3ff" title="Celeste"></i>', '<i class="sw" style="background:#ff4040" title="Rojo"></i>'] },
    kitShorts: { vals: [0x191b22, 0xeceef2, 0x18244a, 0xb3161d, 0x5a606b], labels: ['<i class="sw" style="background:#191b22" title="Negro"></i>', '<i class="sw" style="background:#eceef2" title="Blanco"></i>', '<i class="sw" style="background:#18244a" title="Marino"></i>', '<i class="sw" style="background:#b3161d" title="Rojo"></i>', '<i class="sw" style="background:#5a606b" title="Gris"></i>'] },
    kitPattern: { vals: ['diag', 'liso', 'franjas', 'rayas'], labels: ['Diagonal', 'Liso', 'Franjas', 'Rayas'] },
    // Accesibilidad (UI-16)
    camStable: { vals: [true, false], labels: ['Sí', 'No'] },
    rumble: { vals: [true, false], labels: ['Sí', 'No'] },
    hudScale: { vals: [1, 1.15, 1.3], labels: ['100%', '115%', '130%'] },
    softFlash: { vals: [true, false], labels: ['Sí', 'No'] },
    // sede (Ajustes · Imagen): arena.js la cambia en vivo, también con la demo del menú de fondo
    arena: { vals: ['hall', 'beach'], labels: ['Pabellón', 'Playa'] },
    // luz de la playa (Ajustes · Imagen): arena.js la cambia en vivo (VB.Arena.beachLight, onSettings 'beachLight'); en el pabellón no se nota
    beachLight: { vals: ['dia', 'tarde'], labels: ['Día', 'Tarde'] },
    // E3 (sprint 5). Imagen: resolución (0 = auto) y tope de fotogramas, contador de FPS (main.js)
    resScale: { vals: [0, 1, 0.85, 0.7, 0.5], labels: ['Auto', '100%', '85%', '70%', '50%'] },
    fpsCap: { vals: [0, 30], labels: ['Máx.', '30'] },
    showFps: { vals: [true, false], labels: ['Sí', 'No'] },
    // Cámara (camera.js: VB.CameraRig.OPTS)
    camDist: { vals: ['near', 'normal', 'far'], labels: ['Cerca', 'Normal', 'Lejos'] },
    // zoom de cámara (17-nov-2026; sustituye a la fila Distancia): 1 cerca … 5 lejos, 3 el de siempre. En partido: rueda, + / -, stick derecho o la lupa táctil
    camZoom: { vals: [0, 1, 2, 3, 4], labels: ['1', '2', '3', '4', '5'] },
    camCuts: { vals: ['all', 'less'], labels: ['Todos', 'Menos'] },
    // Accesibilidad: menos movimiento (main.js → ctx.reduceMotion), colores para daltonismo y balón de contraste (fx.js: VB.FX.OPTS)
    lessMotion: { vals: ['auto', 'on', 'off'], labels: ['Auto', 'Sí', 'No'] },
    cbColors: { vals: [true, false], labels: ['Sí', 'No'] },
    ballStyle: { vals: ['clasico', 'contraste'], labels: ['Clásico', 'Contraste'] },
    // Controles · Táctil (input.js: VB.Input.OPTS)
    touchSize: { vals: [1, 1.15, 1.3], labels: ['100%', '115%', '130%'] },
    // Juego, E1: colocación dirigida (sim opts.aimSet) y timing exacto en ms (solo el sello de ui.js)
    aimSet: { vals: [true, false], labels: ['Sí', 'No'] },
    // Salto con impulso (v1.12.0): colocación en salto con diana (sim opts.jsetAim; por defecto No). jsetNote (aviso de colocador) no
    // tiene fila: «Restablecer este apartado» lo vuelve a encender
    jsetAim: { vals: [true, false], labels: ['Sí', 'No'] },
    msTiming: { vals: [true, false], labels: ['Sí', 'No'] },
    // 6v6: cambios de tu equipo (main.js ctx.settings.subs6 → coach[0].auto): el entrenador CPU también cambia (nunca a ti) o solo los que pidas
    subs6: { vals: ['auto', 'manual'], labels: ['Automáticos', 'Solo los míos'] },
    // S3-C1: repeticiones (main.js ctx.settings.replays → VB.Replay): puntos de set y de partido solos, solo en «Jugadas», o ninguna
    replays: { vals: ['auto', 'end', 'off'], labels: ['Automáticas', 'Al final', 'No'] },
    // sede de cada tipo (Ajustes · Imagen; js/venues.js: las disponibles + «Al azar»). arena.js la cambia en vivo
    mapBeach: mapOpt('beach'), mapHall: mapOpt('hall')
  };
  /** Valores de las filas de sede: las sedes disponibles del tipo (VB.Venues.list), «Al azar» y «Sede de un club» ('club': una sede
   *  generada de un club al azar, js/venue-gen*.js; se sortea al aplicar el ajuste y se queda hasta que se cambia: la revancha repite). */
  function mapOpt(kind) {
    var V = VB.Venues, L = V ? V.list(kind) : [kind === 'beach' ? 'platja' : 'palau'], club = !!(V && V.valid && V.valid(kind, 'club'));
    return { vals: L.concat(L.length > 1 ? ['rand'] : [], club ? ['club'] : []),
      labels: L.map(function (id) { var d = V && V.def(id); return (d && (d.short || d.name)) || id; }).concat(L.length > 1 ? ['Al azar'] : [], club ? ['Sede de un club'] : []) };
  }
  /** Ayuda de una sede (venues.js `help`). */
  function venueHelpOf(kind) {
    var V = VB.Venues, A = VB.Arena, id = '';
    if (!V) return '';
    if (A && A.map && V.kindOf(A.map()) === kind) id = A.map();
    else if (/^(rand|club)$/.test(ctx.settings[kind === 'beach' ? 'mapBeach' : 'mapHall'])) {
      // «Al azar» / «Sede de un club» sin montar: la ya sorteada, o una línea genérica (no se sortea al redibujar)
      id = A && A.randPick ? A.randPick(kind) : '';
      var clubP = ctx.settings[kind === 'beach' ? 'mapBeach' : 'mapHall'] === 'club';
      if (!id) return clubP ? (kind === 'beach' ? 'La playa de un club al azar, pista de 16 × 8' : 'El pabellón de un club al azar, pista de 18 × 9')
        : kind === 'beach' ? 'Sede de playa al azar, pista de 16 × 8' : 'Pabellón al azar, pista de 18 × 9';
    } else id = V.resolve(kind, ctx.settings);
    var d = V.def(id); return d && d.help;
  }
  /** E3: filas ★ con data-need="Módulo": solo se ven si ese módulo ya soporta la clave (VB[mod].OPTS; Audio: volume y crowdVol
   *  ya los lee su onSettings; Sim: la maestría de E1). Así cada dueño integra por separado sin filas que no hacen nada. */
  function supports(mod, key) {
    var m = VB[mod]; if (!m) return false;
    if (mod === 'Sim') return !!(m.setPreview || VB.MASTERY);
    if (m.OPTS) return m.OPTS.indexOf(key) >= 0;
    return mod === 'Audio';
  }
  /** E3: claves de cada apartado para «Restablecer este apartado» (ctx.actions.resetSettings). keys / pad: los de Controles. */
  var TAB_KEYS = { audio: ['volume', 'sfxVol', 'crowdVol', 'musicVol'], image: ['quality', 'resScale', 'fpsCap', 'showFps', 'beachLight', 'mapHall', 'mapBeach'], cam: ['camSens', 'camZoom', 'camCuts', 'cam6'],
    game: ['showHelp', 'coachTips', 'coachCalls', 'ambient', 'aimSet', 'jsetAim', 'jsetNote', 'msTiming', 'replays', 'subs6'], a11y: ['camStable', 'rumble', 'hudScale', 'softFlash', 'lessMotion', 'cbColors', 'ballStyle'],
    kit: ['kitShirt', 'kitAccent', 'kitShorts', 'kitPattern'], keys: ['keys'], pad: ['padKeys', 'padDead'] };
  var resetArm = { b: null, t: 0, to: 0 };
  function resetDisarm() {
    var b = resetArm.b; resetArm.b = null; clearTimeout(resetArm.to);
    if (b) { b.classList.remove('arm'); if (b.getAttribute('data-lbl')) b.textContent = b.getAttribute('data-lbl'); }
  }
  /** Doble pulsación (sin confirm()): la 1ª cambia el texto 3 s, la 2ª restablece. */
  function resetClick(b) {
    var id = b.getAttribute('data-reset'), now = performance.now();
    if (resetArm.b === b && now - resetArm.t < 3000) {
      resetDisarm();
      if (ctx.actions.resetSettings && TAB_KEYS[id]) ctx.actions.resetSettings(TAB_KEYS[id]);
      uiSound('back');
      if (panel === 'ctl') { renderCtl(); ctlMsgSet(id === 'keys' ? 'Teclas de fábrica' : 'Botones de fábrica'); var nb = el.ctlGrid.querySelector('.opt-reset'); if (nb) focusEl(nb, kbNow() || ctx.inputDevice === 'gamepad'); }
      else { renderOpts(); b.textContent = 'Restablecido'; setTimeout(function () { if (resetArm.b !== b && b.getAttribute('data-lbl')) b.textContent = b.getAttribute('data-lbl'); }, 1600); }
      return;
    }
    resetDisarm();
    if (!b.getAttribute('data-lbl')) b.setAttribute('data-lbl', b.textContent);
    resetArm.b = b; resetArm.t = now;
    b.textContent = device() === 'touch' ? 'Toca otra vez para restablecer' : 'Pulsa otra vez para restablecer';
    b.classList.add('arm'); uiSound('click');
    resetArm.to = setTimeout(resetDisarm, 3000);
  }
  /** Ajustes · Info: borrar la Carrera de playa o la de pista (VB.Career.beach / hall.abandon, como «Borrar carrera» de la propia
   *  Carrera). Doble pulsación como «Restablecer»; los botones solo salen si esa Carrera existe y nunca en un partido de Carrera. */
  function wipeClick(b) {
    var m = b.getAttribute('data-wipe') === 'hall' ? 'hall' : 'beach', now = performance.now(), K = VB.Career;
    if (resetArm.b === b && now - resetArm.t < 3000) {
      resetDisarm();
      var ok = false; try { var E = K && K[m]; ok = !!(E && E.abandon && E.abandon()); } catch (e) { console.warn('[VB] ui: Career.abandon', e); }
      uiSound('back');
      if (ok) { try { if (VB.CareerUI && VB.CareerUI.syncMenu) VB.CareerUI.syncMenu(); } catch (e) { } try { VB.UI.refreshMenu(); } catch (e) { } }
      wipeNote = ok ? (m === 'hall' ? 'Carrera de pista borrada.' : 'Carrera de playa borrada.') : 'No se ha podido borrar.';
      renderOpts();
      var nb = el.panel.querySelector('.opt-wipe:not([hidden])') || el.panel.querySelector('[data-go="news"]'); if (nb) focusEl(nb, kbNow() || ctx.inputDevice === 'gamepad');
      return;
    }
    resetDisarm();
    if (!b.getAttribute('data-lbl')) b.setAttribute('data-lbl', b.textContent);
    resetArm.b = b; resetArm.t = now;
    b.textContent = (device() === 'touch' ? 'Toca' : 'Pulsa') + ' otra vez: se borra entera';
    b.classList.add('arm'); uiSound('click');
    resetArm.to = setTimeout(resetDisarm, 3000);
  }
  var wipeNote = '';
  /** Fila que abre otro panel: Controles (en la pestaña del dispositivo en uso), Novedades y Créditos (E7). Se apila Ajustes. */
  function goRow(b) {
    var g = b.getAttribute('data-go');
    if (g === 'ctl') openPanel('ctl', { tab: device() });
    else if (g === 'news' || g === 'credits') openAbout(g);
  }
  /** Nombre de la sede (arena.js: ajuste `arena` o ?map=): Palau del Mar / Platja Llarga. */
  function venueName() { return VB.Arena && VB.Arena.venueName ? VB.Arena.venueName() : 'Palau del Mar'; }
  /** Pone el nombre de la sede en los textos fijos del HTML (antetítulo del menú, tarjeta de presentación, cortinilla,
   *  marcador, final). Busca cada vez (otros pueden rehacer esos nodos) y respeta MAYÚSCULAS. */
  // nombres de sede ya vistos: las generadas (js/venues.js) salen del registro LRU, pero su nombre puede seguir en la tarjeta de
  // presentación o en el marcador hasta el siguiente cambio; por eso se recuerdan aquí (texto corto, sin límite práctico)
  var VENUE_NAMES = ['Palau del Mar', 'Platja Llarga'];
  function reEsc(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function applyVenue() {
    var NAMES = VENUE_NAMES; if (VB.VENUES) for (var vk in VB.VENUES) if (VB.VENUES[vk].name && NAMES.indexOf(VB.VENUES[vk].name) < 0) NAMES.push(VB.VENUES[vk].name);
    var nm = venueName(); if (nm && NAMES.indexOf(nm) < 0) NAMES.push(nm);
    // (las más largas primero: «Platja Llarga Nord» antes que «Platja Llarga»)
    var re = new RegExp(NAMES.slice().sort(function (a, b) { return b.length - a.length; }).map(reEsc).join('|'), 'gi'), low = NAMES.map(function (x) { return x.toLowerCase(); }), w, n;
    try { w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false); } catch (e) { return; }
    while ((n = w.nextNode())) {
      // (los nodos cortos solo si son un nombre de sede entero: las generadas pueden tener menos de 12 letras)
      //  (fuera de las filas de opciones: «Can Rebot» o «Cúpula» allí son valores del selector, no la sede montada)
      var v = n.nodeValue; if (!v) continue;
      // (nunca dentro de la Carrera, #career: allí el nombre de la playa de un club, k.beach, es la ficha del club / las ofertas,
      //  no la sede montada; cambiarlo dejaba «Sede: Moll de la Sorra» en la ficha tras jugar en tu playa)
      if (n.parentNode && n.parentNode.closest && n.parentNode.closest('#career')) continue;
      if (v.length < 12 && (low.indexOf(v.trim().toLowerCase()) < 0 || (n.parentNode && n.parentNode.closest && n.parentNode.closest('.mi, #optList')))) continue;
      re.lastIndex = 0; if (!re.test(v)) continue;
      var hits = v.match(re), many = false; for (var hi = 1; hits && hi < hits.length; hi++) if (hits[hi].toLowerCase() !== hits[0].toLowerCase()) many = true;
      if (many) continue; // «Palau del Mar o Platja Llarga» (ayuda de Escenario) nombra varias sedes: se deja
      var nv = v.replace(re, function (m) { return m === m.toUpperCase() ? nm.toUpperCase() : nm; }); if (nv !== v) n.nodeValue = nv;
    }
  }
  /** Dorsales del equipo humano (sim: teams[0][i].num; 1 y 2 si aún no hay partido). */
  function teamNums() {
    var g = ctx && ctx.game, t = g && g.teams && g.teams[0];
    return [t && t[0] && t[0].num || 1, t && t[1] && t[1].num || 2];
  }
  /** ¿Modo «Control: Uno»? En partido manda el partido (g.ctrlMode); en el menú, el ajuste. */
  function oneMode() {
    var g = ctx && ctx.game;
    if (g && !g.demo && (ctx.state === 'playing' || ctx.state === 'paused' || ctx.state === 'over')) return g.ctrlMode === 'one';
    return ctx.settings.ctrlMode === 'one';
  }
  /** Dorsal del jugador que llevas en modo Uno (en partido, g.ctrl; si no, el primero de tu equipo: el n.º 1). */
  function oneNum() {
    var g = ctx && ctx.game;
    if (g && !g.demo && g.ctrl && g.ctrlMode === 'one' && ctx.state !== 'menu') return g.ctrl.num;
    return teamNums()[0];
  }
  /** ¿6 contra 6? En partido manda el partido (g.size); en el menú, el ajuste «Formato». */
  function fmt6() {
    var g = ctx && ctx.game;
    if (g && !g.demo && (ctx.state === 'playing' || ctx.state === 'paused' || ctx.state === 'over')) return g.size === 6;
    return ctx.settings.format === '6v6';
  }
  /** Puesto del humano en 6v6 (sim g.ctrlRole). Lote A (D1/D9): se elige en la fila Controlar de la preparación. */
  var ROLE_NAME = { OH: 'Receptor', S: 'Colocador', OPP: 'Opuesto', MB: 'Central', L: 'Líbero' };
  /** Dorsal del primer jugador de cada puesto en el equipo 0 (sim ROLES6: S 1, OH 2, MB 3, OPP 4). */
  var ROLE_NUM = { S: 1, OH: 2, MB: 3, OPP: 4 };
  /** Ayuda corta de la fila Controlar: qué hace ese puesto. */
  var ROLE_HELP = { OH: 'Recibe, ataca por la izquierda y bloquea', S: 'El 2º toque es tuyo: la dirección elige a quién', OPP: 'Ataca por la derecha y bloquea al receptor rival', MB: 'Bloquea, primer tiempo; el líbero entra por ti atrás' };
  /** Puestos jugables (sim CTRL_ROLES6, en el orden de la fila: Receptor, Colocador, Opuesto, Central). Con una sim sin
   *  setCtrlRole solo el receptor: la fila nunca ofrece un puesto que el partido no pueda aplicar. */
  function roles6() { var S = VB.Sim; return S && S.CTRL_ROLES6 && S.CTRL_ROLES6.length && S.setCtrlRole ? S.CTRL_ROLES6 : ['OH']; }
  // puesto elegido (localStorage 'make-the-cut.role6'; main.js no lo conoce: loadSettings descarta las claves que no son suyas)
  var role6 = 'OH', role6Pend = false;
  function role6Load() { try { var v = localStorage.getItem('make-the-cut.role6'); if (v && roles6().indexOf(v) >= 0) role6 = v; } catch (e) { } }
  function role6Set(r) { role6 = r; try { localStorage.setItem('make-the-cut.role6', r); } catch (e) { } }
  /** Al empezar un partido 6v6 de Partido rápido (no demo, espectador ni Carrera): la sim pone el control en el puesto elegido. */
  function applyRole6() {
    var g = ctx && ctx.game, S = VB.Sim;
    if (!g || g.demo) { role6Pend = true; return; }  // el partido aún no ha empezado (telón de arranque): en onGameStart
    role6Pend = false;
    if (g.size === 6 && !g.watch && !g.career && S && S.setCtrlRole && roles6().indexOf(role6) >= 0) S.setCtrlRole(g, role6);
  }
  /** Dorsal del humano en 6v6: el de su atleta en partido (g.ctrlBase, el de verdad aunque ahora lleve al líbero); en el menú, el del puesto elegido. */
  function sixNum() { var g = ctx && ctx.game; return g && !g.demo && g.size === 6 && g.ctrl && ctx.state !== 'menu' ? (g.ctrlBase || g.ctrl).num : ROLE_NUM[role6] || 2; }
  function roleName() { var g = ctx && ctx.game; return ROLE_NAME[(g && !g.demo && g.size === 6 && ctx.state !== 'menu' && g.ctrlRole) || role6] || 'Receptor'; }
  /** Fase del sitio del humano en el 6v6 (ai6 spot().phase, D7; '' si la sim aún no la da). */
  function phase6(g, p) { var A = VB.AI6; if (!A || !A.spot || !p) return ''; try { var s = A.spot(g, p); return (s && s.phase) || ''; } catch (e) { return ''; } }
  function optIndex(k) {
    var o = OPT[k], v = ctx.settings[k]; for (var i = 0; i < o.vals.length; i++) if (o.vals[i] === v) return i; return k === 'difficulty' ? 1 : 0; }
  // (E3: step = paso de ←/→ y del clic en la pista; 0,1 por defecto. padDead en %: 10 %-30 % de 5 en 5)
  var SLIDERS = { camSens: { min: 0.5, max: 1.5, def: 1 }, sfxVol: { min: 0, max: 1, def: 1 }, musicVol: { min: 0, max: 1, def: 0.75 },
    volume: { min: 0, max: 1, def: 1 }, crowdVol: { min: 0, max: 1, def: 0.85 }, padDead: { min: 0.1, max: 0.3, def: 0.18, step: 0.05 } };
  var VOLS = { volume: 1, sfxVol: 1, crowdVol: 1, musicVol: 1 };
  function slSnap(k, v) { var c = SLIDERS[k], st = c.step || 0.1; v = Math.round((v - c.min) / st) * st + c.min; return Math.round(Math.max(c.min, Math.min(c.max, v)) * 100) / 100; }
  /** Volumen movido: quita el silencio y da una muestra (efectos: un pase; público: oleada corta; general: un clic). true si sonó algo. */
  function volFeedback(k) {
    if (!VOLS[k]) return false;
    if (ctx.settings.muted) ctx.actions.setSetting('muted', false);
    var A = VB.Audio; if (!A) return false;
    try {
      if (k === 'sfxVol' && A.play) { A.play('pass', 0.8); return true; }
      if (k === 'crowdVol' && A.preview) return A.preview('crowd') !== false;
      if (k === 'volume' && A.preview) return A.preview('master') !== false;
    } catch (e) { }
    return false;
  }
  function slVal(k) { var c = SLIDERS[k], v = +ctx.settings[k]; return isFinite(v) ? Math.max(c.min, Math.min(c.max, v)) : c.def; }
  function changeOpt(k, d, absIdx, arrowDir) {
    if (k === 'ctrlMode' && fmt6()) { // 6v6: la fila Controlar recorre los puestos jugables (role6, no el ajuste ctrlMode)
      var R6 = roles6(), ri = Math.max(0, R6.indexOf(role6)), rj = absIdx != null ? absIdx : (ri + d + R6.length) % R6.length;
      if (R6.length < 2 || rj === ri) { if (el.ctrlVal) restartAnim(el.ctrlVal.parentNode, (arrowDir || d) < 0 ? 'sl-r' : 'sl-l'); uiSound2('arrowEdge', arrowDir || d || 1); return; }
      role6Set(R6[rj]); renderOpts();
      try { if (VB.Audio && VB.Audio.ui) { if (arrowDir) VB.Audio.ui('arrow', arrowDir, rj, R6.length); else VB.Audio.ui('select', rj, R6.length); } else click(); } catch (e) { }
      return;
    }
    if (k === 'arena' && fmt6()) { // 6v6: siempre pabellón (el rebote avisa)
      if (el.venueVal) restartAnim(el.venueVal.parentNode, (arrowDir || d) < 0 ? 'sl-r' : 'sl-l'); uiSound2('arrowEdge', arrowDir || d || 1);
      return;
    }
    if (k === 'setPoints' && menuVenue() === 'beach' && !fmt6()) { // playa: 21 / 15 fijos (el aviso lo da el rebote del valor)
      if (el.ptsVal) restartAnim(el.ptsVal.parentNode, (arrowDir || d) < 0 ? 'sl-r' : 'sl-l'); uiSound2('arrowEdge', arrowDir || d || 1);
      return;
    }
    if (k === 'arena' && absIdx == null && OPT.arena.vals.indexOf(menuVenue()) >= 0) absIdx = (OPT.arena.vals.indexOf(menuVenue()) + d + 2) % 2; // desde el que se ve (?map=)
    if (SLIDERS[k]) {
      var c = SLIDERS[k], st = c.step || 0.1, v0 = slVal(k), v = Math.round((v0 + d * st) * 100) / 100;
      if (v > c.max + 1e-6) v = d > 0 && absIdx === 'wrap' && v0 >= c.max - 1e-6 ? c.min : c.max; if (v < c.min - 1e-6) v = c.min;
      v = slSnap(k, v);
      ctx.actions.setSetting(k, v);
      if (volFeedback(k)) return;   // mover un volumen quita el silencio y suena su muestra (en vez del sonido del deslizador)
    } else {
      var o = OPT[k], i = absIdx != null ? absIdx : (optIndex(k) + d + o.vals.length) % o.vals.length;
      ctx.actions.setSetting(k, o.vals[i]);
    }
    optSound(k, arrowDir);
  }
  /** AUD-08: confirmación con el sonido de su tipo: flecha de dificultad (la nota sigue al nivel), Sí/No, varios valores, deslizador. */
  function optSound(k, arrowDir) {
    var A = VB.Audio; if (!A || !A.ui) return click();
    try {
      if (SLIDERS[k]) { A.ui('slide', (slVal(k) - SLIDERS[k].min) / (SLIDERS[k].max - SLIDERS[k].min)); return; }
      var o = OPT[k], i = optIndex(k);
      if (arrowDir) A.ui('arrow', arrowDir, i, o.vals.length);
      else if (o.labels.length === 2 && o.labels[0] === 'Sí') A.ui('toggle', i === 0);
      else A.ui('select', i, o.vals.length);
    } catch (e) { }
  }
  function uiSound2(kind, a) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(kind, a); } catch (e) { } }
  /** Flechas de la dificultad: ‹/› sin dar la vuelta (en Fácil, ‹ no hace nada salvo un rebote). */
  function stepDiff(d) { stepOpt('difficulty', d, el.diffVal); }
  /** Flechas de una fila del menú con valor (dificultad, puntos por set): sin dar la vuelta, rebote en los extremos. */
  function stepOpt(k, d, valEl) {
    var six = k === 'ctrlMode' && fmt6(), R6 = six ? roles6() : null;   // 6v6: Controlar recorre los puestos (role6)
    var o = OPT[k], i = six ? Math.max(0, R6.indexOf(role6)) : k === 'arena' ? Math.max(0, o.vals.indexOf(menuVenue())) : optIndex(k), j = Math.max(0, Math.min((six ? R6.length : o.vals.length) - 1, i + d));
    if (j === i) { restartAnim(valEl.parentNode, d < 0 ? 'sl-r' : 'sl-l'); uiSound2('arrowEdge', d); return; }
    changeOpt(k, 0, j, d);
  }
  var lastPtsI = -1;
  var lastVenueI = -1;
  /** Puntos de la playa en la fila 05 del menú (fijos: sets a 21 y el 3r a 15). */
  var BEACH_PTS = '21 / 15';
  /** Escenario que se verá al jugar: el montado en arena (manda ?map= al arrancar) o, sin arena, el ajuste. */
  function menuVenue() { var v = VB.Arena && VB.Arena.venue ? VB.Arena.venue() : ctx.settings.arena; return v === 'beach' ? 'beach' : 'hall'; }
  var lastCtrlI = -1;
  var lastFmtI = -1;
  var lastCam6I = -1;
  var lastDiffI = -1;
  function renderOpts() {
    if (VB.Splat) VB.Splat.sync();   // SPLAT: la equipación nueva tiñe los paneles al momento (firma: nada si no cambia)
    var segs = document.querySelectorAll('[data-seg]');
    for (var i = 0; i < segs.length; i++) {
      var k = segs[i].getAttribute('data-seg'), o = OPT[k], cur = optIndex(k), h = '';
      for (var j = 0; j < o.labels.length; j++) h += '<span data-i="' + j + '"' + (j === cur ? ' class="on"' : '') + '>' + o.labels[j] + '</span>';
      segs[i].innerHTML = h;
    }
    // Ajustes · Imagen: la fila de pabellones solo con más de uno; «Luz de playa» solo si la sede de playa elegida la admite
    var rowH = document.querySelector('#optList [data-opt="mapHall"]'), rowB = document.querySelector('#optList [data-opt="mapBeach"]'), rowL = document.querySelector('#optList [data-opt="beachLight"]');
    var rowS6 = document.querySelector('[data-opt="subs6"]'); if (rowS6) rowS6.hidden = ctx.settings.format !== '6v6';   // «Cambios de tu equipo»: solo con 6 contra 6
    if (rowH) rowH.hidden = OPT.mapHall.vals.length < 2;
    if (rowB) rowB.hidden = OPT.mapBeach.vals.length < 2;
    if (rowL) {   // con «Al azar» o «Sede de un club», manda la sede de playa montada (o ya sorteada): la de luz fija oculta la fila
      var mb = ctx.settings.mapBeach, AR = VB.Arena;
      if (/^(rand|club)$/.test(mb) && AR && AR.map && VB.Venues) mb = VB.Venues.kindOf(AR.map()) === 'beach' ? AR.map() : (AR.randPick && AR.randPick('beach')) || mb;
      var dB = VB.Venues && VB.Venues.def(mb); rowL.hidden = !!(dB && !dB.lights);
    }
    var sls = document.querySelectorAll('[data-sl]');
    for (var m = 0; m < sls.length; m++) {
      var key = sls[m].getAttribute('data-sl'), c = SLIDERS[key], v = slVal(key), f = (v - c.min) / (c.max - c.min) * 100;
      sls[m].querySelector('i').style.width = f + '%'; sls[m].querySelector('b').style.left = f + '%';
      sls[m].querySelector('.v').textContent = Math.round(v * 100) + '%';
    }
    // E3: filas ★ que su módulo aún no soporta, ocultas
    var nd = document.querySelectorAll('[data-need]');
    for (var ni = 0; ni < nd.length; ni++) { var hid = !supports(nd[ni].getAttribute('data-need'), nd[ni].getAttribute('data-opt')); if (nd[ni].hidden !== hid) nd[ni].hidden = hid; }
    // E3: ayuda de Resolución (Auto con la escala de ahora / Fija con los píxeles del lienzo)
    if (el.resNote) {
      var rsv = +ctx.settings.resScale || 0, rn;
      if (!rsv) rn = 'Auto: la baja sola si va lento (ahora ' + Math.round((ctx.renderScale || 1) * 100) + ' %)';
      else { var gl = null; try { gl = ctx.renderer && ctx.renderer.getContext ? ctx.renderer.getContext() : null; } catch (e) { gl = null; } rn = gl ? 'Fija: ' + gl.drawingBufferWidth + ' × ' + gl.drawingBufferHeight + ' píxeles' : 'Fija: ' + Math.round(rsv * 100) + ' %'; }
      if (el.resNote.textContent !== rn) el.resNote.textContent = rn;
    }
    // E7: Ajustes · Info (versión y dónde se guarda el progreso)
    if (el.optVer) { var vt = VB.VERSION ? VB.VERSION + (VB.VERSION_DATE ? ' (' + fmtDate(VB.VERSION_DATE) + ')' : '') : '—'; if (el.optVer.textContent !== vt) el.optVer.textContent = vt; }
    if (el.optSave) {
      var au = null; try { au = VB.Account && VB.Account.user ? VB.Account.user() : null; } catch (e) { au = null; }
      var sv = au ? 'Guardado en tu cuenta (' + au + ')' : 'Guardado en este dispositivo';
      if (el.optSave.textContent !== sv) el.optSave.textContent = sv;
    }
    // Ajustes · Info: «Borrar Carrera de playa / de pista» (solo si existe; nunca en mitad de un partido de Carrera)
    var inCareer = !!(ctx.game && ctx.game.career && !ctx.game.demo && ctx.state !== 'menu' && ctx.state !== 'over'), wb = el.panel ? el.panel.querySelectorAll('.opt-wipe') : [];
    for (var wi = 0; wi < wb.length; wi++) {
      var wm = wb[wi].getAttribute('data-wipe'), has = false;
      try { has = !!(VB.Career && VB.Career.has && VB.Career.has(wm === 'hall' ? 'hall' : 'beach')); } catch (e) { has = false; }
      var wh = !has || inCareer; if (wb[wi].hidden !== wh) wb[wi].hidden = wh;
    }
    var wn = document.getElementById('optWipeN');
    if (wn) { if (wn.textContent !== wipeNote) wn.textContent = wipeNote; wn.hidden = !wipeNote; }
    var snd = document.querySelector('.opt-snd');
    if (snd) { snd.classList.toggle('muted', !!ctx.settings.muted); var mb = snd.querySelector('[data-mute]'); if (mb) mb.setAttribute('aria-checked', ctx.settings.muted ? 'true' : 'false'); }
    var q = ctx.quality && ctx.quality.level, qn = { high: 'alta', medium: 'media', low: 'baja' }[q] || '';
    el.qualNote.textContent = ctx.settings.quality === 'auto' ? 'Auto la ajusta sola' + (qn ? ' (ahora: ' + qn + ')' : '') : 'Fija' + (qn ? ': ' + qn : '');
    // menú: dificultad
    var di = optIndex('difficulty');
    if (el.diffVal.textContent !== OPT.difficulty.labels[di]) {
      el.diffVal.textContent = OPT.difficulty.labels[di];
      // el valor entra deslizando desde el lado de la flecha (solo transform/opacity)
      if (lastDiffI >= 0) { var mv = el.diffVal.parentNode; mv.classList.remove('sl-l', 'sl-r'); void mv.offsetWidth; mv.classList.add(di > lastDiffI ? 'sl-r' : 'sl-l'); }
    }
    lastDiffI = di;
    var ars = el.optDiff.querySelectorAll('.arr');
    if (ars.length === 2) { ars[0].classList.toggle('end', di === 0); ars[1].classList.toggle('end', di === OPT.difficulty.vals.length - 1); }
    for (var n = 0; n < el.diffLvl.children.length; n++) el.diffLvl.children[n].classList.toggle('on', n <= di);
    // menú: puntos por set (misma fila que la dificultad, sin barras de nivel)
    // menú: escenario (04, Pabellón / Playa; el mismo ajuste `arena` que Ajustes · Imagen · Escenario)
    // menú: formato (2 contra 2 / 6 contra 6). En 6v6, Escenario queda fijo (siempre el pabellón) y Controlar recorre los puestos
    var fi = optIndex('format'), six = fi === 1;
    if (el.fmtVal && el.fmtVal.textContent !== OPT.format.labels[fi]) {
      el.fmtVal.textContent = OPT.format.labels[fi];
      if (lastFmtI >= 0) { var fv = el.fmtVal.parentNode; fv.classList.remove('sl-l', 'sl-r'); void fv.offsetWidth; fv.classList.add(fi > lastFmtI ? 'sl-r' : 'sl-l'); }
      el.optFmt.setAttribute('aria-label', 'Formato: ' + OPT.format.labels[fi]);
    }
    lastFmtI = fi;
    var fas = el.optFmt ? el.optFmt.querySelectorAll('.arr') : [];
    if (fas.length === 2) { fas[0].classList.toggle('end', fi === 0); fas[1].classList.toggle('end', fi === OPT.format.vals.length - 1); }
    var vi = six ? 0 : OPT.arena.vals.indexOf(menuVenue()), vb = vi === 1;
    if (vi < 0) vi = 0;
    if (el.optVenue) el.optVenue.classList.toggle('lock', six);
    if (el.venueVal && el.venueVal.textContent !== OPT.arena.labels[vi]) {
      el.venueVal.textContent = OPT.arena.labels[vi];
      if (lastVenueI >= 0) { var vv = el.venueVal.parentNode; vv.classList.remove('sl-l', 'sl-r'); void vv.offsetWidth; vv.classList.add(vi > lastVenueI ? 'sl-r' : 'sl-l'); }
      el.optVenue.setAttribute('aria-label', 'Escenario: ' + OPT.arena.labels[vi] + ' (' + venueName(OPT.arena.vals[vi]) + (vb ? ', reglas de vóley playa' : six ? ', el 6 contra 6 es de pabellón' : '') + ')');
      el.optVenue.title = vb ? venueName('beach') + ', vóley playa: pista de 16 × 8, sets a 21 y el tercero a 15, y cambio de campo cada 7 puntos' : venueName('hall') + ', pista cubierta de 18 × 9';
    }
    lastVenueI = vi;
    var vas = el.optVenue ? el.optVenue.querySelectorAll('.arr') : [];
    if (vas.length === 2) { vas[0].classList.toggle('end', six || vi === 0); vas[1].classList.toggle('end', six || vi === OPT.arena.vals.length - 1); }
    // 6 contra 6: en el sitio de Escenario (fijo en el pabellón), la cámara: 3ª persona o Televisión (cabe a 844×390 sin una fila más)
    if (el.optCam6) {
      if (el.optVenue && el.optVenue.hidden !== six) el.optVenue.hidden = six;
      if (el.optCam6.hidden !== !six) el.optCam6.hidden = !six;
      var c6 = optIndex('cam6');
      if (el.cam6Val && el.cam6Val.textContent !== OPT.cam6.labels[c6]) {
        el.cam6Val.textContent = OPT.cam6.labels[c6];
        if (lastCam6I >= 0) { var c6v = el.cam6Val.parentNode; c6v.classList.remove('sl-l', 'sl-r'); void c6v.offsetWidth; c6v.classList.add(c6 > lastCam6I ? 'sl-r' : 'sl-l'); }
        el.optCam6.setAttribute('aria-label', 'Cámara: ' + OPT.cam6.labels[c6]);
      }
      lastCam6I = c6;
      var c6a = el.optCam6.querySelectorAll('.arr');
      if (c6a.length === 2) { c6a[0].classList.toggle('end', c6 === 0); c6a[1].classList.toggle('end', c6 === OPT.cam6.vals.length - 1); }
      setText(el.cam6Help, 'c6h', OPT.cam6.help[c6]);
    }
    var pi = optIndex('setPoints'), ptxt = vb ? BEACH_PTS : OPT.setPoints.labels[pi];
    el.optPts.classList.toggle('lock', vb);
    var ptl = vb ? 'Puntos por set: 21, y el tercer set a 15 (reglas de vóley playa; se elige en Pabellón)' : 'Puntos por set: ' + OPT.setPoints.labels[pi];
    if (el.optPts.getAttribute('aria-label') !== ptl) { el.optPts.setAttribute('aria-label', ptl); el.optPts.title = vb ? 'En la playa los sets van a 21 y el tercero a 15' : ''; }
    if (el.ptsVal.textContent !== ptxt) {
      el.ptsVal.textContent = ptxt;
      if (lastPtsI >= 0) { var pv = el.ptsVal.parentNode; pv.classList.remove('sl-l', 'sl-r'); void pv.offsetWidth; pv.classList.add(pi > lastPtsI ? 'sl-r' : 'sl-l'); }
    }
    lastPtsI = pi;
    var pas = el.optPts.querySelectorAll('.arr');
    if (pas.length === 2) { pas[0].classList.toggle('end', vb || pi === 0); pas[1].classList.toggle('end', vb || pi === OPT.setPoints.vals.length - 1); }
    // menú: control (los dos / uno), misma fila que los puntos
    // (6v6, lote A: la misma fila recorre los puestos jugables —Receptor, Colocador, Opuesto, Central— y guarda role6)
    var ci = optIndex('ctrlMode'), tn = teamNums(), R6 = six ? roles6() : null, ri = six ? Math.max(0, R6.indexOf(role6)) : ci, rn = six ? R6.length : OPT.ctrlMode.vals.length;
    var cd = six ? 'Controlar al ' + roleName().toLowerCase() + ' (n.º ' + sixNum() + '; la IA lleva al resto del equipo)' : OPT.ctrlMode.desc[ci] + (ci > 0 ? ' (el n.º ' + tn[0] + '; la IA lleva al n.º ' + tn[1] + ')' : '');
    var cl = six ? roleName() : OPT.ctrlMode.labels[ci];
    el.optCtrl.classList.toggle('lock', six && rn < 2);
    if (el.optCtrl.title !== cd) { el.optCtrl.title = cd; el.optCtrl.setAttribute('aria-label', 'Control: ' + cd); }
    if (el.ctrlVal.innerHTML !== cl) {
      el.ctrlVal.innerHTML = cl;
      if (lastCtrlI >= 0) { var cv = el.ctrlVal.parentNode; cv.classList.remove('sl-l', 'sl-r'); void cv.offsetWidth; cv.classList.add(ri > lastCtrlI ? 'sl-r' : 'sl-l'); }
    }
    lastCtrlI = ri;
    var cas = el.optCtrl.querySelectorAll('.arr');
    if (cas.length === 2) {
      cas[0].classList.toggle('end', ri === 0); cas[1].classList.toggle('end', ri === rn - 1);
      // lector de pantalla: en 6v6 las flechas dicen el puesto vecino («Colocador»), en 2v2 lo de siempre
      var al0 = six ? (ri > 0 ? ROLE_NAME[R6[ri - 1]] : 'Puesto anterior') : 'Control anterior', al1 = six ? (ri < rn - 1 ? ROLE_NAME[R6[ri + 1]] : 'Puesto siguiente') : 'Control siguiente';
      if (cas[0].getAttribute('aria-label') !== al0) cas[0].setAttribute('aria-label', al0);
      if (cas[1].getAttribute('aria-label') !== al1) cas[1].setAttribute('aria-label', al1);
    }
    // pastillas (CSS .mi.primary .mi-s .chip; el nivel en amarillo); el lector lee «Partido rápido, Normal, Sets a 25»
    setSep(el.playSub, six ? ['6 contra 6', { t: OPT.difficulty.labels[di], c: 'hi' }, 'Sets a ' + OPT.setPoints.vals[pi], roleName()]
      : [vb ? 'Playa' : 'Pabellón', { t: OPT.difficulty.labels[di], c: 'hi' }, vb ? 'Sets a 21' : 'Sets a ' + OPT.setPoints.vals[pi], ci > 0 ? 'Solo el n.º ' + tn[0] : 'A los dos'], 'c');
    el.optCtrl.classList.toggle('one', ci > 0 && !six);
    // Partido rápido: una línea de ayuda bajo cada fila (con Playa, Puntos explica las reglas de playa)
    setText(el.fmtHelp, 'fh', six ? 'Equipos completos: llevas al ' + roleName().toLowerCase() : 'Tú y tu pareja contra la CPU');
    setText(el.venueHelp, 'vh', six ? 'El 6 contra 6 se juega en el pabellón' : venueHelpOf(vb ? 'beach' : 'hall') || (vb ? 'Platja Llarga, vóley playa en pista de 16 × 8' : 'Palau del Mar, pista cubierta de 18 × 9'));
    setText(el.diffHelp, 'dh', DIFF_HELP[di] || 'Nivel de la CPU');
    setText(el.ptsHelp, 'ph', vb ? 'Reglas de playa: sets a 21 y el tercero a 15' : 'Al mejor de 3 sets; el tercero, a ' + Math.min(15, OPT.setPoints.vals[pi]));
    setText(el.ctrlHelp, 'ch', six ? (ROLE_HELP[role6] || 'Llevas al ' + roleName().toLowerCase() + ' (n.º ' + sixNum() + '); la IA mueve al resto') : ci > 0 ? 'Llevas al n.º ' + tn[0] + '; la IA lleva al n.º ' + tn[1] : 'El control pasa a quien va a tocar');
  }
  /** Una línea por nivel de dificultad (fila Dificultad de Partido rápido). */
  var DIFF_HELP = ['La CPU saca suave', 'Ataca y defiende a medio gas', 'Defiende casi todo', 'Casi no falla'];

  // ---------- Tutorial ----------
  // Diagramas con proyección en perspectiva de la pista vista desde detrás del
  // equipo humano (como la cámara del juego). Coordenadas de SIMULACIÓN (m).
  var SVGNS = 'http://www.w3.org/2000/svg';
  function P(x, y, z) {
    var d = (x + 9) / 18, s = 0.56 + 0.44 * d;
    return [200 + y * 25 * s, 30 + 200 * d - (z || 0) * 19 * s, s];
  }
  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function pts(list) { return list.map(function (q) { var p = P(q[0], q[1], q[2]); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
  /** Pista del dibujo del tutorial: pabellón 18×9 (zona libre azul, línea de ataque) o playa 16×8 (arena, cintas coral, sin línea
   *  de ataque ni central; antenas a ±4 y postes a ±5). Misma perspectiva P(): la de la playa se ve algo más pequeña. */
  function drawCourt(svg, beach) {
    var hl = beach ? 8 : 9, hw = beach ? 4 : 4.5;
    svgEl('rect', { x: 0, y: 0, width: 400, height: 275, fill: '#2b2547' }, svg);
    svgEl('polygon', { points: pts([[-10.5, -6.3], [-10.5, 6.3], [11.6, 6.3], [11.6, -6.3]]), fill: beach ? '#e8c27e' : '#3d8fd1', stroke: '#1d1530', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, svg);
    svgEl('polygon', { points: pts([[-hl, -hw], [-hl, hw], [hl, hw], [hl, -hw]]), fill: beach ? '#f3d699' : '#ffc979' }, svg);
    if (!beach) svgEl('polygon', { points: pts([[-3, -4.5], [-3, 4.5], [3, 4.5], [3, -4.5]]), fill: '#ffb85c' }, svg);
    var L = { fill: 'none', stroke: beach ? '#ff6a55' : '#fff', 'stroke-width': beach ? 2 : 1.6, 'stroke-linejoin': 'round' };
    svgEl('polygon', Object.assign({ points: pts([[-hl, -hw], [-hl, hw], [hl, hw], [hl, -hw]]) }, L), svg);
    if (beach) return;
    svgEl('polyline', Object.assign({ points: pts([[-3, -4.5], [-3, 4.5]]) }, L), svg);
    svgEl('polyline', Object.assign({ points: pts([[3, -4.5], [3, 4.5]]) }, L), svg);
    svgEl('polyline', Object.assign({ points: pts([[0, -4.5], [0, 4.5]]) }, L), svg);
  }
  function drawNet(svg, beach) {
    var hw = beach ? 4 : 4.5, po = beach ? 5 : 5.5;
    svgEl('polygon', { points: pts([[0, -hw, 1.43], [0, hw, 1.43], [0, hw, 2.43], [0, -hw, 2.43]]), fill: 'rgba(10,14,22,.55)', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 0.6 }, svg);
    svgEl('polyline', { points: pts([[0, -hw, 2.43], [0, hw, 2.43]]), stroke: '#fff', 'stroke-width': 2.2, fill: 'none' }, svg);
    [-hw, hw].forEach(function (y) { svgEl('polyline', { points: pts([[0, y, 1.43], [0, y, 3.23]]), stroke: '#ff4d4d', 'stroke-width': 1.6, 'stroke-dasharray': '3 3', fill: 'none' }, svg); });
    [-po, po].forEach(function (y) { svgEl('polyline', { points: pts([[0, y, 0], [0, y, 2.6]]), stroke: beach ? '#c9ced6' : '#1b2b44', 'stroke-width': 3.4, fill: 'none' }, svg); });
  }
  /** Figura a la pista de playa: posiciones y trayectorias ×8/9 en planta (16×8 frente a 18×9: el mismo factor en largo y ancho). */
  function beachFig(F) {
    var k = 8 / 9, sc = function (v) { return [v[0] * k, v[1] * k].concat(v.length > 2 ? [v[2]] : []); }, o = Object.assign({}, F);
    o.players = F.players.map(function (p) { return Object.assign({}, p, { x: p.x * k, y: p.y * k }); });
    o.segs = F.segs.map(function (sg) { return Object.assign({}, sg, { a: sc(sg.a), b: sc(sg.b) }); });
    if (F.ring) o.ring = sc(F.ring);
    o.beach = true;
    return o;
  }
  function drawPlayer(svg, pl) {
    var g = svgEl('g', {}, svg), p = P(pl.x, pl.y, 0), s = p[2] * 1.45;
    var shadow = svgEl('ellipse', { cx: p[0], cy: p[1], rx: 9 * s, ry: 3.2 * s, fill: 'rgba(0,0,0,.35)' }, g);
    var body = svgEl('g', { transform: 'translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ') scale(' + s.toFixed(3) + ')' }, g);
    var col = pl.t === 0 ? kitUI.c0 : kitUI.c1, dark = pl.t === 0 ? kitUI.d0 : kitUI.d1, INK = '#1d1530', iw = 1.1;
    // dibujo animado (sprint cartoon): figuras de colores planos con contorno de tinta, cabeza y zapatillas algo grandes
    var ink = { stroke: INK, 'stroke-width': iw, 'stroke-linejoin': 'round' };
    svgEl('rect', Object.assign({ x: -4.2, y: -14, width: 3.4, height: 14, rx: 1.6, fill: '#f0c49a' }, ink), body);
    svgEl('rect', Object.assign({ x: 0.8, y: -14, width: 3.4, height: 14, rx: 1.6, fill: '#f0c49a' }, ink), body);
    svgEl('ellipse', Object.assign({ cx: -2.8, cy: -0.6, rx: 2.9, ry: 1.6, fill: '#fff' }, ink), body);
    svgEl('ellipse', Object.assign({ cx: 2.8, cy: -0.6, rx: 2.9, ry: 1.6, fill: '#fff' }, ink), body);
    svgEl('rect', Object.assign({ x: -5.2, y: -18, width: 10.4, height: 7, rx: 2, fill: '#2a2440' }, ink), body);
    var arms = svgEl('g', {}, body);
    svgEl('rect', Object.assign({ x: -9, y: -30, width: 3.2, height: 12, rx: 1.6, fill: col }, ink), arms);
    svgEl('rect', Object.assign({ x: 5.8, y: -30, width: 3.2, height: 12, rx: 1.6, fill: col }, ink), arms);
    svgEl('rect', Object.assign({ x: -6, y: -31, width: 12, height: 15, rx: 4, fill: col }, ink), body);
    svgEl('circle', Object.assign({ cx: 0, cy: -37, r: 6, fill: '#f0c49a' }, ink), body);
    svgEl('path', Object.assign({ d: 'M-6 -38 a6 6 0 0 1 12 0 z', fill: dark }, ink), body);
    if (pl.you) svgEl('path', { d: 'M-4.5 -51 h9 l-4.5 5.5 z', fill: '#ffd23f', stroke: INK, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, body);
    if (pl.lbl) {
      var t = svgEl('text', { x: 0, y: pl.you ? -55 : -48, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'Barlow Condensed,Arial Narrow,sans-serif', 'font-weight': 800, 'font-size': Math.max(12.8, 12.8 * 1.55 / s).toFixed(1), 'letter-spacing': 1, stroke: INK, 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, body);
      t.textContent = pl.lbl;
    }
    return { g: g, body: body, arms: arms, shadow: shadow, base: p, s: s, pl: pl };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** posición del balón en un tramo: lineal en x,y; parábola con vértice `apex` en z */
  function segPos(sg, u, out) {
    out[0] = lerp(sg.a[0], sg.b[0], u); out[1] = lerp(sg.a[1], sg.b[1], u);
    if (!sg.apex) { out[2] = lerp(sg.a[2], sg.b[2], u); return out; }
    var za = sg.a[2], zb = sg.b[2], h = Math.max(sg.apex, za + 0.01, zb + 0.01);
    var ra = Math.sqrt(h - za), rb = Math.sqrt(h - zb), um = ra / (ra + rb); // instante del vértice
    var k = u < um ? (h - za) / (um * um) : (h - zb) / ((1 - um) * (1 - um));
    out[2] = h - k * (u - um) * (u - um);
    return out;
  }

  /** Saque dirigible (sim: g.aim3.kind 'serve' con la diana encendida). */
  var sbRect = null;
  function svAim(g) { return !!(g && g.aim3 && g.aim3.on && g.aim3.kind === 'serve'); }

  // Salto con impulso (v1.12.0): frases de «Cómo se juega» para el remate (siempre) y la colocación (con la diana de colocación)
  function momT() { return ' Corre hacia la red y salta sin soltar la dirección: el <b>remate sale más fuerte</b>.' + (fmt6() && !tutBeach() ? ' Desde detrás de la línea de 3 m, <b>pipe</b>.' : ''); }
  function jdT(g) { return ctx.settings.jsetAim === true ? ' En la colocación en salto mueves la <b>diana</b> con ' + g.aim + (fmt6() && !tutBeach() ? ' y la colocación va al atacante que tenga más cerca (el marcador de color dice adónde).' : ' y el balón va donde la pongas: cerca de ti sale rápida; lejos, alta.') : ''; }
  var TUT = [
    { step: 'Paso 1 de 6', title: 'El saque', fig: {
        players: [{ t: 0, x: 10.3, y: -1.5, you: 1, lbl: 'TÚ' }, { t: 0, x: 3.5, y: 2 }, { t: 1, x: -6.5, y: -2.2 }, { t: 1, x: -6.5, y: 2.2 }],
        segs: [{ a: [10.0, -1.5, 2.7], b: [-6.2, 1.6, 0.2], apex: 4.3, dur: 1.5, who: 0 }], ring: [-6.2, 1.6], swing: [[0, 0, 0.3]] },
      text: function (g) { return 'Con ' + g.move + ' te desplazas por el fondo. ' + g.serve + ' lanza el balón para un saque flotante; ' + g.jump + ', para un <b>saque en salto</b>. Mientras sube, mueve la <b>diana</b> del campo rival con ' + g.aim + ' y vuelve a pulsar ' + g.serve + ' cuando baje a tu mano: en el <b>momento justo</b>, el saque va exacto a la diana.'; },
      rule: '<b>Ace</b> (punto directo de saque): el balón cae en el campo rival o la recepción no se controla. Tienes <b>8 segundos</b> para sacar; si sale fuera o pasa por fuera de las antenas, punto para el rival.' },
    { step: 'Paso 2 de 6', title: '1r toque · Recepción', fig: {
        players: [{ t: 0, x: 6, y: -1.5, you: 1, lbl: '1' }, { t: 0, x: 1.8, y: 1.2, lbl: '2' }, { t: 1, x: -9.8, y: 1 }, { t: 1, x: -3.5, y: -2 }],
        segs: [{ a: [-9.5, 1, 2.7], b: [5.9, -1.5, 0.85], apex: 4.1, dur: 1.3 }, { a: [5.9, -1.5, 0.85], b: [1.8, 1.2, 2.3], apex: 4.4, dur: 1.0, who: 0 }], ring: [6, -1.5], swing: [[0, 1.25, 0.3]] },
      text: function (g) { return 'Cuando el balón viene a tu campo aparece un <b>círculo</b> donde tienes que jugarlo; se hace más pequeño hasta el momento de pulsar. Llega al círculo y pulsa ' + g.hit + ': el juego hace la <b>recepción</b> de antebrazos hacia tu pareja.'; },
      rule: 'Tú solo te colocas y golpeas: el tipo de toque lo elige el juego.' },
    { step: 'Paso 3 de 6', title: '2º toque · Colocación', fig: {
        players: [{ t: 0, x: 4.2, y: -2.4, lbl: '1' }, { t: 0, x: 1.8, y: 1.2, you: 1, lbl: '2' }, { t: 1, x: -5.5, y: -2 }, { t: 1, x: -5.5, y: 2 }],
        segs: [{ a: [3.2, -1.5, 3.4], b: [1.8, 1.2, 2.3], apex: 4.4, dur: 0.7 }, { a: [1.8, 1.2, 2.3], b: [1.1, -2.4, 3.0], apex: 5.3, dur: 1.3, who: 1 }], ring: [1.8, 1.2], swing: [[1, 0.65, 0.3]] },
      // modo «Control: Uno»: no hay cambio de jugador; el compañero (IA) coloca tus recepciones
      figOne: { players: [{ t: 0, x: 4.2, y: -2.4, you: 1, lbl: '1' }, { t: 0, x: 1.8, y: 1.2, lbl: '2' }, { t: 1, x: -5.5, y: -2 }, { t: 1, x: -5.5, y: 2 }] },
      text: function (g) {
        // C2 (colocar por destino): sin dirección, alta a la 4; con dirección, el destino (se ve en el suelo); timing y Colocación, la precisión
        var aimT = ctx.settings.aimSet !== false ? ' Si no tocas la dirección, va <b>alta a la 4</b>, a la izquierda de la red. Ya bajo el balón, una dirección elige el destino y lo ves en el suelo (la que traías corriendo no cuenta): cerca de ti sale rápida, lejos sale alta. El timing y tu Colocación deciden lo precisa que sale.' : '';
        var both = device() === 'touch' ? g.hit : g.hit + ' o ' + g.jset;   // (táctil: COLOCAR solo sale en el aire)
        if (oneMode()) return 'Llevas siempre al mismo jugador: tu pareja (la IA) hace la <b>colocación</b>, un balón alto junto a la red, y tú te preparas para rematar. Si el 1r toque es suyo, la colocación es tuya: ponte bajo el balón y pulsa ' + both + '.' + aimT + ' Si saltas, ' + g.jset + ' en el aire coloca en salto.' + jdT(g);
        return 'El control pasa solo a tu pareja (la cámara se desliza hacia ella). Ponte bajo el balón y pulsa ' + both + ': es la <b>colocación</b>.' + aimT + ' Si saltas, ' + g.jset + ' en el aire coloca en salto: más rápida, con menos margen.' + jdT(g);
      },
      rule: 'Cada equipo tiene <b>3 toques</b>. Un jugador no puede tocar dos veces seguidas: eso son <b>dobles</b>.',
      ruleBeach: 'Cada equipo tiene <b>3 toques</b>. En la playa la <b>colocación de dedos</b> se pita más: a destiempo pueden pitarte <b>dobles</b>.' },
    { step: 'Paso 4 de 6', title: '3r toque · Remate', fig: {
        players: [{ t: 0, x: 1.3, y: -2.4, you: 1, lbl: '3' }, { t: 0, x: 1.8, y: 1.2 }, { t: 1, x: -5.5, y: -2 }, { t: 1, x: -5.5, y: 2 }],
        segs: [{ a: [1.8, 1.2, 2.3], b: [1.05, -2.4, 3.15], apex: 5.3, dur: 1.15 }, { a: [1.05, -2.4, 3.15], b: [-6.2, 2.8, 0.2], dur: 0.38, who: 0, spike: 1 }],
        ring: [1.3, -2.4], jump: [[0, 0.62, 1.05]], swing: [[0, 1.05, 0.25]] },
      text: function (g) { return 'En el 3r toque ponte bajo la colocación, pulsa ' + g.jump + ' para <b>saltar</b> y ' + g.hit + ' en lo alto: <b>remate</b>.' + momT() + ' En el aire, mueve la <b>diana</b> por el campo rival con ' + g.aim + '; en el <b>momento justo</b>, el remate va exacto a ella. Para engañar al bloqueo: ' + g.hit + ' pronto y ' + g.jump + ' al golpear (<b>finta</b>), o ' + g.jset + ' en el aire (<b>golpe colocado</b>). La diana pegada a la línea va <b>al filo</b>.'; },   // (salto con impulso: momT justo detrás de «remate», para que en móvil se vea sin desplazar)
      rule: 'En el aire, ' + '<b>Saltar</b> otra vez hace una <b>dejada</b>. Si golpeas el 3r toque sin saltar, el balón pasa en globo (<b>balón libre</b>).',
      ruleBeach: 'En el aire, <b>Saltar</b> otra vez hace una dejada <b>de nudillos</b> (<b>pokey</b>): en la playa, con la yema de los dedos sería falta. Sin saltar, el 3r toque pasa en globo (<b>balón libre</b>).' },
    { step: 'Paso 5 de 6', title: 'El bloqueo', fig: {
        players: [{ t: 0, x: 0.6, y: 1.4, you: 1, lbl: 'TÚ' }, { t: 0, x: 6, y: -1.5 }, { t: 1, x: -1.3, y: 1.4 }, { t: 1, x: -2, y: -2.5 }],
        segs: [{ a: [-2, -2.5, 2.3], b: [-1.05, 1.4, 3.15], apex: 5.1, dur: 1.1 }, { a: [-1.05, 1.4, 3.15], b: [-0.05, 1.4, 2.95], dur: 0.16, who: 2, spike: 1 }, { a: [-0.05, 1.4, 2.95], b: [-4.6, 0.3, 0.2], apex: 3.4, dur: 0.85, who: 0 }],
        jump: [[2, 0.6, 1.05], [0, 0.66, 1.1]], swing: [[2, 1.1, 0.25]], block: [0] },
      text: function (g) {
        if (oneMode()) return 'Cuando la CPU coloca, decides con tu posición: si subes a la red frente al atacante, bloqueas tú y tu pareja defiende atrás; si te quedas al fondo, bloquea tu pareja. Pulsa ' + g.jump + ' cuando el atacante golpea. Si el balón te da en las manos: <b>bloqueo</b>.';
        return 'Cuando la CPU coloca, el juego te pasa a la defensa y tu pareja bloquea. Si prefieres bloquear tú, pulsa ' + g.sw + ' (cambiar) mientras la CPU coloca: ve a la red frente al atacante y pulsa ' + g.jump + ' cuando golpea. Si el balón te da en las manos: <b>bloqueo</b>.';
      },
      rule: 'El <b>bloqueo no cuenta como toque</b>: después tu equipo aún tiene sus 3 toques.',
      ruleBeach: 'En la playa el <b>bloqueo cuenta como toque</b>: después a tu equipo le quedan 2, y el que bloqueó puede dar el siguiente.' },
    { step: 'Paso 6 de 6', title: 'Reglas y faltas', faults: true,
      text: function () { return ''; }, rule: '' }
  ];
  var FAULTS = '<ul class="faults">' +
    '<li><b>Fuera</b>El balón cae fuera de las líneas: punto para el rival de quien lo tocó por última vez.</li>' +
    '<li><b>Antena</b>El balón toca la antena o cruza por fuera de ella.</li>' +
    '<li><b>Red</b>Tocar la red entre las antenas mientras se juega el balón es falta. Si el balón la toca y pasa, el juego sigue.</li>' +
    '<li><b>4 toques</b>Un equipo toca el balón más de 3 veces (el bloqueo no cuenta).</li>' +
    '<li><b>Dobles</b>El mismo jugador toca el balón dos veces seguidas.</li>' +
    '<li><b>Falta de saque: 8 segundos</b>Tras el silbato del árbitro tienes 8 segundos para sacar.</li>' +
    '<li><b>Ataque sobre el saque</b>No se puede rematar ni bloquear el saque rival por encima de la red.</li>' +
    '<li><b>Challenge</b>Si dudas de un bote, pide revisión en los 7 s siguientes. Tienes 2 por set y pierdes uno si fallas.</li>' +
    '<li><b>Cambio de campo</b>Al acabar cada set y a los 8 puntos del set decisivo.</li>' +
    '<li><b>Sets</b>A 25 puntos con 2 de diferencia; el tercero, a 15. Gana quien se lleva 2 sets.</li>' +
    '</ul><p class="tut-rule">Cada jugada da un punto. Si la ganas recibiendo, recuperas el saque (<b>cambio de saque</b>) y sacáis por turnos: saca el jugador de tu equipo que no sacó la última vez <span class="fl-who">(y lo controlas tú)</span>.</p>';
  /** Paso 6: en modo Uno, el saque de tu compañero lo hace la IA. */
  function faultsHtml() {
    var f = oneMode() ? FAULTS.replace('(y lo controlas tú)', '(si le toca a tu pareja, saca la IA)') : FAULTS;
    if (!tutBeach()) return f;
    // vóley playa (sim g.beach): pista 16×8, el bloqueo es toque, pokey, cambio de campo cada 7, sets a 21 / 15
    return f.replace('<b>Falta de saque: 8 segundos</b>Tras el silbato del árbitro tienes 8 segundos para sacar.', '<b>Falta de saque: 5 segundos</b>Tras el silbato del árbitro tienes 5 segundos para sacar.')
      .replace('Un equipo toca el balón más de 3 veces (el bloqueo no cuenta).', 'Un equipo toca el balón más de 3 veces. En la playa el bloqueo cuenta como toque.')
      .replace('El mismo jugador toca el balón dos veces seguidas.', 'El mismo jugador toca dos veces seguidas o coloca de dedos mal.')
      .replace('Al acabar cada set y a los 8 puntos del set decisivo.', 'En la playa, cada 7 puntos jugados (cada 5 en el tercer set) y al acabar cada set.')
      .replace('A 25 puntos con 2 de diferencia; el tercero, a 15. Gana quien se lleva 2 sets.', 'En la playa, a 21 puntos con 2 de diferencia; el tercero, a 15. Gana quien se lleva 2 sets. La pista mide 16 × 8 m.');
  }
  /** El tutorial explica las reglas del escenario: las del partido en curso o, desde el menú, las del escenario elegido. */
  function tutBeach() { var g = ctx.game; return g && !g.demo ? !!g.beach : menuVenue() === 'beach'; }

  var tut = { i: 0, raf: 0, t0: 0, fig: null, seen: {} };
  function tutGo(i) {
    i = Math.max(0, Math.min(TUT.length - 1, i));
    tut.i = i; tut.seen[i] = 1;
    var S = TUT[i], g = G(), rl = tutBeach() && S.ruleBeach ? S.ruleBeach : S.rule;
    if (rl && tutBeach()) rl = rl.replace('<b>8 segundos</b>', '<b>5 segundos</b>'); // en la playa, 5 s para sacar (sim C.SERVE_CLOCK_BEACH)
    el.tutStep.textContent = S.step; el.tutTitle.innerHTML = coachHTML(escT(S.title)); // «1r toque» en pastilla
    el.tutText.innerHTML = S.faults ? faultsHtml() : '<p class="tut-text">' + S.text(g) + '</p>' + (rl ? '<div class="tut-rule">' + rl + '</div>' : '');
    restartAnim(el.tutBody, 'tut-anim');
    el.tutFig.hidden = !!S.faults;
    el.tutBody.style.gridTemplateColumns = S.faults ? '1fr' : '';
    var dots = ''; for (var k = 0; k < TUT.length; k++) dots += '<i class="' + (k === i ? 'on' : tut.seen[k] ? 'seen' : '') + '"></i>';
    el.tutDots.innerHTML = dots;
    el.btnTutPrev.disabled = i === 0; el.btnTutPrev.style.visibility = i === 0 ? 'hidden' : '';
    var ntx = i === TUT.length - 1 ? (panelFrom === 'menu' ? '¡A jugar!' : 'Volver al partido') : 'Siguiente', nt = el.btnTutNext.querySelector('.sp-t');   // (parche SPLAT: solo el rótulo)
    if (nt) nt.textContent = ntx; else el.btnTutNext.textContent = ntx;
    if (!el.panel.hidden) { fitSheet(el.panel); checkMore(el.panel); }
    tutStop();
    if (!S.faults) { var F0 = oneMode() && S.figOne ? Object.assign({}, S.fig, S.figOne) : S.fig; buildFig(tutBeach() ? beachFig(F0) : F0); }
    if (i === TUT.length - 1 && !ctx.debug) { record.tut = 1; saveRecord(); }
  }
  function buildFig(F) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 400 275'); svg.setAttribute('aria-hidden', 'true');
    drawCourt(svg, !!F.beach);
    var ring = null;
    if (F.ring) { var rp = P(F.ring[0], F.ring[1], 0); ring = svgEl('ellipse', { cx: rp[0], cy: rp[1], rx: 15 * rp[2], ry: 5.5 * rp[2], fill: 'rgba(255,190,20,.28)', stroke: '#f2a900', 'stroke-width': 2.6 }, svg); }
    // jugadores ordenados por profundidad (los del fondo primero)
    var order = F.players.map(function (p, i) { return i; }).sort(function (a, b) { return F.players[a].x - F.players[b].x; });
    var far = [], near = [], figs = [];
    order.forEach(function (i) { (F.players[i].x < 0 ? far : near).push(i); });
    far.forEach(function (i) { figs[i] = drawPlayer(svg, F.players[i]); });
    // trayectoria punteada completa
    var path = '', tmp = [0, 0, 0];
    F.segs.forEach(function (sg) { for (var k = 0; k <= 24; k++) { segPos(sg, k / 24, tmp); var p = P(tmp[0], tmp[1], tmp[2]); path += (path ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } });
    var ballShadow = svgEl('ellipse', { rx: 4, ry: 1.6, fill: 'rgba(0,0,0,.45)' }, svg);
    drawNet(svg, !!F.beach);
    near.forEach(function (i) { figs[i] = drawPlayer(svg, F.players[i]); });
    svgEl('path', { d: path, fill: 'none', stroke: 'rgba(13,26,46,.35)', 'stroke-width': 2.6, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }, svg);
    svgEl('path', { d: path, fill: 'none', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 1.3, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }, svg);
    var flash = svgEl('circle', { r: 10, fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: 0 }, svg);
    var ball = svgEl('g', {}, svg);
    svgEl('circle', { r: 5.4, fill: '#fffaf0', stroke: '#1d1530', 'stroke-width': 1.4 }, ball);
    svgEl('path', { d: 'M-5 0 Q0 -3 5 0 M-2 -4.6 Q1 0 -2 4.6', fill: 'none', stroke: '#ffb238', 'stroke-width': 1.3 }, ball);
    el.tutFig.innerHTML = ''; el.tutFig.appendChild(svg);
    var total = 0; F.segs.forEach(function (s) { s.t0 = total; total += s.dur; });
    tut.fig = { F: F, figs: figs, ball: ball, ballShadow: ballShadow, flash: flash, ring: ring, total: total, loop: total + 1.1 };
    tut.t0 = performance.now();
    var tick = function (now) { tut.raf = requestAnimationFrame(tick); animFig((now - tut.t0) / 1000); };
    tut.raf = requestAnimationFrame(tick);
    animFig(0);
  }
  var _bp = [0, 0, 0];
  function animFig(time) {
    var f = tut.fig; if (!f) return;
    var F = f.F, t = time % f.loop, segs = F.segs, sg = segs[segs.length - 1], u = 1;
    for (var i = 0; i < segs.length; i++) if (t < segs[i].t0 + segs[i].dur) { sg = segs[i]; u = Math.max(0, (t - sg.t0) / sg.dur); break; }
    segPos(sg, u, _bp);
    var p = P(_bp[0], _bp[1], _bp[2]), q = P(_bp[0], _bp[1], 0), s = p[2] * 1.1;
    f.ball.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ') scale(' + s.toFixed(2) + ') rotate(' + ((time * 400) % 360).toFixed(0) + ')');
    f.ballShadow.setAttribute('cx', q[0].toFixed(1)); f.ballShadow.setAttribute('cy', q[1].toFixed(1));
    f.ball.style.opacity = t > f.total + 0.7 ? 0 : 1;
    // destello del golpe al empezar cada tramo con autor
    var fl = 0, fp = null;
    for (var k = 0; k < segs.length; k++) { var dtk = t - segs[k].t0; if (segs[k].who != null && dtk >= 0 && dtk < 0.3) { fl = 1 - dtk / 0.3; fp = P(segs[k].a[0], segs[k].a[1], segs[k].a[2]); } }
    if (fp) { f.flash.setAttribute('cx', fp[0]); f.flash.setAttribute('cy', fp[1]); f.flash.setAttribute('r', (8 + (1 - fl) * 14).toFixed(1)); }
    f.flash.setAttribute('opacity', fl.toFixed(2));
    if (f.ring) f.ring.setAttribute('opacity', (0.65 + 0.35 * Math.sin(time * 6)).toFixed(2));
    // saltos y brazos
    for (var j = 0; j < f.figs.length; j++) {
      var fg = f.figs[j]; if (!fg) continue;
      var z = 0;
      (F.jump || []).forEach(function (J) { if (J[0] === j && t >= J[1] && t <= J[2]) { var w = (t - J[1]) / (J[2] - J[1]); z = Math.sin(w * Math.PI) * 0.9; } });
      var arm = 0;
      (F.swing || []).forEach(function (S) { if (S[0] === j && t >= S[1] - 0.15 && t <= S[1] + S[2]) arm = 1; });
      if ((F.block || []).indexOf(j) >= 0 && z > 0.1) arm = 2;
      var bp = P(fg.pl.x, fg.pl.y, z);
      fg.body.setAttribute('transform', 'translate(' + bp[0].toFixed(1) + ',' + bp[1].toFixed(1) + ') scale(' + fg.s.toFixed(3) + ')');
      fg.shadow.setAttribute('rx', (9 * fg.s * (1 - z * 0.35)).toFixed(1));
      fg.arms.setAttribute('transform', arm === 2 ? 'translate(0,-12) scale(1,-1.15) translate(0,48)' : arm === 1 ? 'rotate(' + (fg.pl.t === 0 ? -160 : 160) + ' 7 -29)' : '');
    }
  }
  function tutStop() { if (tut.raf) cancelAnimationFrame(tut.raf); tut.raf = 0; tut.fig = null; }
  function tutNext() {
    if (tut.i < TUT.length - 1) { tutGo(tut.i + 1); click(); return; }
    var from = panelFrom; uiSound(from === 'menu' ? 'start' : 'back'); closePanel();
    if (from === 'menu') goMatch(null, '2v2');   // el tutorial enseña el 2 contra 2: su partido también lo es
  }

  // =====================================================================
  //  ENTRENAMIENTO (E6, sprint 5): página #mpGym, HUD #drillBar, sellos, consejos del fallo y hoja final .drill
  // =====================================================================
  // Datos y guardado en js/gym.js (VB.Gym: DRILLS, MEDALS, record, recordRally…); la mecánica y los puntos son de la sim (g.drill,
  // eventos drillStage / drillRep / drillEnd; sin point / whistle / gameOver). main.js: startMatch({drill}), drillEnd → 'over',
  // restart repite el ejercicio. Aquí no se reparte XP de partido ni se toca make-the-cut.record (showEnd no llega), y las insignias
  // (Badges.ingest) quedan fuera con g.drill. La XP de las medallas la da VB.Gym.record (una sola vez por nivel).
  var GYM_TIPS = {
    early: 'Un pelín pronto: espera a que baje',
    lateHit: 'Un pelín tarde: pulsa antes',
    late: 'Tarde: pulsa antes',
    far: 'No llegas: muévete antes de pulsar',
    out: 'Apunta un poco más dentro: la diana manda el saque',
    jump: 'Salta cuando el atacante arma el brazo',
    net: 'A la red: golpea más arriba, en lo alto del salto',
    blocked: 'Bloqueado: apunta lejos de las manos o prueba un golpe colocado'
  };
  var MEDAL_N = ['', 'Bronce', 'Plata', 'Oro'];
  var gymLast = { t: NaN, miss: '' }, gymTip = '', gymTipT = 0, gymSel = 'serve', gymHov = null, gymBestV = 0;
  var geGate = false, geWait = false, geT0 = 0;
  function isDrill() { var g = ctx && ctx.game; return !!(g && g.drill && !g.demo); }
  /** Reiniciar en la pausa: el ejercicio de la sesión o el reto (R16: ctx.actions.restart sabe qué toca). */
  function goRestart() { var f = function () { if (ctx.actions.restart) ctx.actions.restart(); }; if (!wipeRun(2, f) && !wp.cb) f(); }
  function altR(g) { try { return VB.Sim.altReady(g) || ''; } catch (e) { return ''; } }
  function gymRow(id) { var Gm = VB.Gym; return Gm && Gm.drill ? Gm.drill(id) : null; }
  function drillName(id, short) { var d = gymRow(id); return d ? (short ? d.short : d.name) : id === 'free' ? 'Peloteo libre' : 'Entrenamiento'; }
  /** Umbrales de medalla [bronce, plata, oro] de un ejercicio: los de js/gym.js (los que dan la medalla), null en 'free'. */
  function gymMedals(id) {
    var Gm = VB.Gym; if (!Gm) return null;
    if (Gm.medalsOf) { try { var m = Gm.medalsOf(id); if (m) return m; } catch (e) { } }
    return Gm.MEDALS && Gm.MEDALS[id] || null;
  }
  function gymBestOf(id) { var Gm = VB.Gym; if (!Gm) return 0; try { if (id === 'free') return Gm.bestRally ? Gm.bestRally() | 0 : 0; var r = Gm.get(id); return r ? r.b | 0 : 0; } catch (e) { return 0; } }
  /** Medalla en SVG (sin emoji): m 0 = círculo hueco, 1 bronce, 2 plata, 3 oro; extra: clase («off» = apagada). */
  function medalSVG(m, extra) {
    return '<svg class="mdl m' + (m | 0) + (extra ? ' ' + extra : '') + '" viewBox="0 0 32 32" aria-hidden="true"><path class="rb" d="M8.5 1.5h6.5l3.2 9.5h-6.6z"/><path class="rb rb2" d="M23.5 1.5H17l-3.2 9.5h6.6z"/>' +
      '<circle class="dk" cx="16" cy="20.5" r="9"/><path class="st" d="M16 15.2l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"/></svg>';
  }
  function gymRowEl(id) { return el.gymList ? (el.gymList.querySelector('[data-drill="' + id + '"]') || el.gymList.querySelector('[data-drill]')) : null; }
  /** Barra de pintura (SPLAT, .sp-bar): fr 0..1 hasta la siguiente medalla (Entrenamiento y Retos). */
  function spBar(fr) { return '<i class="sp-bar" aria-hidden="true"><i style="--w:' + Math.round(100 * Math.max(0, Math.min(1, fr || 0))) + '%"></i></i>'; }
  // SPLAT: color de la pegatina de cada ejercicio (equipación, tinta, contraste, tinta, turquesa): cinco pegatinas que no se repiten
  var GY_COL = { serve: 'sp-kit', recv: 'sp-ink', set: 'sp-alt', atk: 'sp-ink', block: 'sp-teal' };
  /** Página Entrenamiento: una pegatina por ejercicio con su medalla, su récord y la barra hasta la siguiente medalla; el peloteo
   *  libre en parche cosido; pie con las medallas conseguidas. */
  /** V-SUBS: ayudas de Entrenamiento más cortas en móvil (data-ph-short; VB.Splat.shorten desde decorate). */
  var GY_SHORT = { recv: '10 saques de la CPU: déjala al colocador' };
  function renderGym() {
    var Gm = VB.Gym; if (!el.gymList) return;
    var h = '', k = 0;
    (Gm ? Gm.DRILLS : []).forEach(function (d) {
      var aria = d.name;
      if (d.id === 'free') {
        var br = gymBestOf('free');
        aria += br ? ', mejor peloteo ' + br + ' toques' : '';
        h += '<button class="mi sp-patch gy-free" data-drill="free" aria-label="' + escT(aria + '. ' + d.help) + '"><span class="sp-l"><span class="sp-t">' + escT(d.name) + '</span><small class="sp-s">' +
          (br ? 'Mejor peloteo: ' + br + (br === 1 ? ' toque' : ' toques') : escT(d.help)) + '</small></span></button>';
        return;
      }
      var r = Gm.get(d.id), m = r ? r.m | 0 : 0, b = r ? r.b | 0 : 0, th = Gm.medalsOf ? safe(function () { return Gm.medalsOf(d.id); }) : Gm.MEDALS && Gm.MEDALS[d.id];
      var lo = m && th ? th[m - 1] : 0, fr = m >= 3 || !th ? 1 : (b - lo) / Math.max(1, th[m] - lo);
      var nx = m >= 3 ? '¡Oro!' : th ? MEDAL_N[m + 1] + ' con ' + th[m] : '';
      aria += r && r.n ? ', récord ' + r.b + (m ? ', medalla de ' + MEDAL_N[m].toLowerCase() : '') : ', sin jugar';
      if (nx && m < 3) aria += '. ' + nx;
      h += '<button class="mi gy-d sp-btn sp-wide sp-calm ' + (GY_COL[d.id] || 'sp-ink') + '" data-shape="' + (k++) + '" data-drill="' + d.id + '" aria-label="' + escT(aria + '. ' + d.help) + '">' +
        '<span class="sp-medal t' + m + '">' + medalSVG(m) + '</span><span class="sp-l"><span class="sp-t">' + escT(d.name) + '</span><small class="sp-s" data-ph-ell' + (GY_SHORT[d.id] ? ' data-ph-short="' + escT(GY_SHORT[d.id]) + '"' : '') + '>' + escT(d.help) + '</small>' + (r && r.n && m < 3 ? spBar(fr) : '') + '</span>' +
        '<span class="gy-rec"><b>' + (r && r.n ? 'Récord ' + r.b : 'Nuevo') + '</b><small>' + (m >= 3 ? '¡Oro!' : r && r.n ? nx : 'Sin jugar') + '</small></span></button>';
    });
    if (el.gymList._h !== h) { el.gymList._h = h; el.gymList.innerHTML = h; gymHov = null; if (VB.Splat) VB.Splat.decorate(el.gymList); }
    if (el.gymFoot && Gm) setSep(el.gymFoot, [{ h: 'Medallas: <b>' + Gm.count() + ' de ' + (Gm.IDS ? Gm.IDS.length * 3 : 15) + '</b>' }, 'Cada medalla nueva da experiencia a tus jugadores'], 'v');
    // móvil: el recuento va en una pegatina de la cabecera (el pie se oculta)
    var gch = document.getElementById('gymChip');
    if (gch && Gm) { var gtx = Gm.count() + ' de ' + (Gm.IDS ? Gm.IDS.length * 3 : 15); if (gch.textContent !== gtx) gch.textContent = gtx; gch.hidden = false; gch.setAttribute('aria-label', 'Medallas: ' + gtx); }
  }
  /** Fila → ejercicio, bajo la cortinilla de pantalla. */
  function goGym(id) {
    if (!id) return;
    gymSel = id;
    // (sesión de entrenamiento de la Carrera a medias: «Reiniciar» la repite con tu jugador de Carrera, sin gastar sesión)
    var cg = ctx.game && ctx.game.careerDrill && !ctx.game.careerDrill.done && !ctx.game.demo ? ctx.game : null;
    var f = function () { if (cg && ctx.actions.startCareerDrill) ctx.actions.startCareerDrill(id, !!cg.autopilot); else ctx.actions.startMatch({ drill: id }); };
    if (!wipeRun(2, f) && !wp.cb) f();
  }
  /** Pausa «Salir al entrenamiento» / hoja final «Entrenamiento»: al menú, en la página Entrenamiento con la fila del ejercicio. */
  function goGymList(id) {
    var kb = kbNow() || ctx.inputDevice === 'gamepad';
    // ejercicio de la Carrera: vuelta al hub de la Carrera (main.js toMenu lo abre en Partido › Entrenamiento con el resultado)
    if (ctx.game && ctx.game.careerDrill && !ctx.game.demo) { var fc = function () { ctx.actions.toMenu(); }; if (!wipeRun(2, fc) && !wp.cb) fc(); return; }
    var f = function () {
      ctx.actions.toMenu();
      if (ctx.state !== 'menu') return;
      if (id) gymSel = id;
      mstack.length = 0; mstack.push({ p: 'main', f: 'btnPlay' }); mstack.push({ p: 'play', f: 'btnGym' });
      setPage('gym');
      setTimeout(function () { if (mpage === 'gym' && !panel && ctx.state === 'menu') focusEl(pageFocus(), kb); }, 250);
    };
    if (!wipeRun(2, f) && !wp.cb) f();
  }
  // =====================================================================
  //  RETOS (D1, sprint 2-4, spec S4-D1 §2.5 A-B): franja #btnRetos en Jugar y página #mpRetos con las pestañas «Hoy | Maestría»
  // =====================================================================
  // Datos de js/retos.js (VB.Retos: daily, dayState, progress, summary, unseen…); aquí solo el pintado. El torneo de la semana está
  // cortado (plan §4): la pestaña Hoy lleva el reto del día. «¡A jugar!» = goReto (cortinilla + startMatch(daily().opts)); la hoja
  // final del reto ofrece «Otra vez» (el reto de HOY, previa mini) y «Retos» (goRetosList). La pestaña se recuerda en
  // localStorage 'make-the-cut.retostab' (comodidad del aparato; nunca a la cuenta).
  var rtTab = '', rtTabsApi = null, rtStrip = '';
  function rtTabLoad() { try { return localStorage.getItem('make-the-cut.retostab') === 'maestria' ? 'maestria' : 'hoy'; } catch (e) { return 'hoy'; } }
  function rtTabSave(v) { try { localStorage.setItem('make-the-cut.retostab', v); } catch (e) { } }
  function rtDaily() { try { return VB.Retos && VB.Retos.daily ? VB.Retos.daily() : null; } catch (e) { return null; } }
  /** MV-6: el objetivo del oro en corto (móvil con 380 de alto o menos), desde {id, n} de VB.Retos.daily().goal; '' = sin versión corta */
  function rtGoalShort(g) {
    if (!g) return '';
    var n = g.n | 0;
    switch (g.id) {
      case 'aces': return n === 1 ? '1 ace' : '≥' + n + ' aces';
      case 'kills': return '≥' + n + (n === 1 ? ' remate' : ' remates');
      case 'blocks': return '≥' + n + (n === 1 ? ' bloqueo' : ' bloqueos');
      case 'digs': return '≥' + n + (n === 1 ? ' defensa' : ' defensas');
      case 'streak': return 'racha de ' + n;
      case 'clean': return 'sin ceder set';
      case 'tidy': return n === 0 ? 'sin errores' : '≤' + n + (n === 1 ? ' error' : ' errores');
      case 'comeback': return 'remonta ' + n;
      case 'rally': return 'jugada de ' + n + ' toques';
      case 'mastery': return '≥' + n + ' fintas o colocados';
    }
    return '';
  }
  function rtFocusEl() { return el.rtBody ? el.rtBody.querySelector('[data-reto="day"]') || el.rtBody.querySelector('button') || el.btnRetosBack : null; }
  /** Franja de Jugar: «Reto del día: Cala dels Fanals» + pastilla «Sin jugar» / «Hoy: plata», la medalla de hoy y el punto de nuevo. */
  function renderRetoStrip() {
    if (!el.btnRetos) return;
    var R = VB.Retos, wrap = el.btnRetos.parentNode;
    if (wrap && wrap.hidden === !!R) wrap.hidden = !R;
    if (!R) return;
    var ds = null, un = 0, k = '';
    try { ds = R.dayState(); un = R.unseen().length; k = ds.key + '|' + ds.m + '|' + un; } catch (e) { return; }
    if (k === rtStrip) return;   // (renderMenu corre cada 64 frames en el menú: solo se rehace si cambia algo)
    rtStrip = k;
    var dd = rtDaily(), mp = dd ? dd.mapName : '', m = ds.m | 0;
    el.retoSub.innerHTML = escT('Reto del día' + (mp ? ': ' + mp : '')) + ' <span class="chip">' + (m ? 'Hoy: ' + RC_MED[m] : 'Sin jugar') + '</span>';
    el.retoMeds.innerHTML = medalSVG(m, m ? '' : 'off') + (un ? '<i class="rt-new"></i>' : '');
    el.btnRetos.setAttribute('aria-label', 'Retos. Reto del día' + (mp ? ' en ' + mp : '') + ', ' + (m ? 'hoy ' + RC_MED[m] : 'sin jugar') + (un ? '. Hay medallas nuevas' : ''));
  }
  /** Página Retos: pestañas y la de ahora (Hoy: el reto del día; Maestría: los 18 retos en 5 grupos). */
  function renderRetos() {
    if (!el.rtBody) return;
    if (!rtTab) rtTab = rtTabLoad();
    if (!rtTabsApi && el.rtTabs) rtTabsApi = makeTabs(el.rtTabs, [{ id: 'hoy', label: 'Hoy' }, { id: 'maestria', label: 'Maestría' }],
      { value: rtTab, label: 'Retos', pane: el.rtBody, onChange: function (id, dir, how) {
        // Q/E (o LB/RB) con el foco en una fila: renderRetos la destruye; el foco vuelve al panel nuevo (si no, se iba al body)
        var a = document.activeElement, inP = !!(a && el.rtBody && el.rtBody.contains(a)), kb = inP && (a.classList.contains('kf') || how === 'key' || how === 'pad');
        rtTab = id; rtTabSave(id); renderRetos();
        if (inP) focusEl(rtFocusEl(), kb);
      } });
    else if (rtTabsApi && rtTabsApi.get() !== rtTab) rtTabsApi.set(rtTab, 'api');
    var R = VB.Retos, h, foot = '';
    if (!R) h = '<p class="rt-none">Los retos no están disponibles.</p>';
    else if (rtTab === 'maestria') {
      var U = {}; try { R.unseen().forEach(function (id) { U[id] = 1; }); } catch (e) { }
      h = '';
      // SPLAT: grupo = pegatina pequeña de tinta; reto = pegatina del color de su grupo (dorada con el oro) con la medalla en pegatina
      // redonda, el progreso en texto y la barra de pintura hasta la siguiente medalla
      var k = 0, GC = ['sp-kit', 'sp-alt', 'sp-teal', 'sp-cream', 'sp-ink'];
      (R.GROUPS || []).forEach(function (G, gi) {
        h += '<p class="rt-grp"><i class="sp-chip sp-ink">' + escT(G.name) + '</i></p>';
        R.LIST.forEach(function (b) {
          if (b.grp !== G.id) return;
          var pg = R.progress(b.id) || { lvl: 0, txt: '', frac: 0 }, lvl = pg.lvl | 0;
          h += '<button class="mi rt-r sp-btn sp-wide sp-calm ' + (lvl >= 3 ? 'sp-gold' : GC[gi % GC.length]) + (U[b.id] ? ' new sp-dot' : '') + '" data-shape="' + (k++) + '" data-rt="' + b.id + '" aria-label="' + escT(b.name + ': ' + (lvl ? RC_MED[lvl] : 'sin medalla') + '. ' + pg.txt + (b.help ? '. ' + b.help : '')) + '">' +
            '<span class="sp-medal t' + lvl + '">' + medalSVG(lvl, lvl ? '' : 'off') + '</span><span class="sp-l"><span class="sp-t">' + escT(b.name) + '</span><small class="sp-s" data-ph-ell>' + escT(pg.txt) + '</small>' +
            (lvl < 3 && (lvl || pg.frac > 0) ? spBar(pg.frac) : '') + (b.help ? '<small class="rt-help">' + escT(b.help) + '</small>' : '') + '</span></button>';
        });
      });
      var n = 0; try { n = R.count() | 0; } catch (e) { }
      foot = sepHTML([{ h: 'Medallas: <b>' + n + ' de ' + (R.LIST.length * 3) + '</b>' }, 'Cada medalla nueva da experiencia a tus jugadores'], 'v');
    } else {
      var dd = rtDaily(), ds = R.dayState(), m = ds.m | 0;
      if (!dd) h = '<p class="rt-none">El reto del día no está disponible.</p>';
      else {
        // SPLAT: brochazo turquesa (sin pulsar) con el sello dorado de hoy (la medalla de hoy o el balón), el escenario y los datos en
        // pegatinas; debajo, las tres medallas en pegatina (las ganadas, a color; las otras, en cinta gris) y «¡A jugar!» en parche cosido
        var dl = R.dateLabel(dd.key), bits = '', th = '';
        dd.bits.forEach(function (b) { if (b && b !== dd.mapName) bits += '<i class="sp-chip sp-ink">' + escT(b) + '</i>'; });
        if (dd.modName) bits += '<i class="sp-chip">' + escT(dd.modName) + '</i>';
        if (dl) bits += '<i class="sp-chip rt-dc">' + escT(dl) + '</i>';   // (la fecha en pastilla: solo en el móvil apaisado, sin .rt-k)
        // MV-6: el oro lleva también un texto corto (solo se ve en el móvil con 380 de alto o menos; CSS «SPLAT · RETOS…»)
        dd.tiers.forEach(function (t, i) {
          var sh = i === 2 ? rtGoalShort(dd.goal) : '';
          th += '<span class="rt-tier t' + (i + 1) + (m > i ? ' on' : '') + '">' + medalSVG(m > i ? i + 1 : 0, m > i ? '' : 'off') +
            (sh ? '<span class="rt-tl">' + escT(t) + '</span><span class="rt-ts">Oro: ' + escT(sh) + '</span>' : '<span>' + escT(t) + '</span>') + '</span>';
        });
        var med = (m ? 'Hoy: ' + RC_MED[m] : 'Hoy: sin medalla') + (ds.n ? ', ' + ds.n + (ds.n === 1 ? ' intento' : ' intentos') : '');
        h = '<div class="rt-day sp-ticket sp-noshine" data-shape="1"><span class="sp-stamp rt-stamp" aria-hidden="true" data-ring="RETO DEL DÍA ★ RETO DEL DÍA ★"><span class="sp-sc">' +
          (m ? medalSVG(m) : VB.Splat ? VB.Splat.BALL : '') + '<b>Hoy</b></span></span>' +
          '<div class="rt-dm"><p class="rt-k">' + sepHTML(['Reto del día', dl], 'd') + '</p><p class="rt-map">' + escT(dd.mapName || '') + '</p><p class="rt-bits">' + bits + '</p></div></div>' +
          '<div class="rt-tiers">' + th + '</div>' +
          '<button class="mi primary rt-go sp-patch" data-reto="day"><span class="sp-l"><span class="sp-t">' + (m >= 3 ? 'Jugar otra vez' : '¡A jugar!') + '</span><small class="sp-s rt-med">' + escT(med) + '</small></span></button>';
      }
      var sm = null; try { sm = R.summary(); } catch (e) { }
      foot = sm ? sepHTML([{ h: 'Días con medalla: <b>' + (sm.days | 0) + '</b>' }, { h: 'Medallas de maestría: <b>' + (sm.total | 0) + ' de ' + (sm.of | 0) + '</b>' }], 'v') : '';
    }
    if (el.rtBody._h !== h) { el.rtBody._h = h; el.rtBody.innerHTML = h; if (VB.Splat) VB.Splat.decorate(el.rtBody); }
    if (el.rtFoot) el.rtFoot.innerHTML = foot;
    // Maestría a la vista: lo nuevo queda visto (el punto sale esta vez y la siguiente ya no; la franja se rehace)
    if (R && rtTab === 'maestria' && R.markSeen) { try { if (R.unseen().length) { R.markSeen(R.unseen()); rtStrip = ''; } } catch (e) { } }
  }
  /** Al reto del día (el de HOY: si ha cambiado el día, el nuevo), bajo la cortinilla. mini = previa mini («Otra vez»). */
  function goReto(mini) {
    var dd = rtDaily(); if (!dd || !dd.opts) return;
    var o = Object.assign({}, dd.opts); if (mini) o.introKind = 'mini';
    var f = function () { ctx.actions.startMatch(o); };
    if (!wipeRun(2, f) && !wp.cb) f();
  }
  /** Hoja final del reto → «Retos»: al menú, en la página Retos (Volver lleva a Jugar). */
  function goRetosList() {
    var kb = kbNow() || ctx.inputDevice === 'gamepad';
    var f = function () {
      ctx.actions.toMenu();
      if (ctx.state !== 'menu') return;
      mstack.length = 0; mstack.push({ p: 'main', f: 'btnPlay' }); mstack.push({ p: 'play', f: 'btnRetos' });
      setPage('retos');
      setTimeout(function () { if (mpage === 'retos' && !panel && ctx.state === 'menu') focusEl(pageFocus(), kb); }, 250);
    };
    if (!wipeRun(2, f) && !wp.cb) f();
  }

  // =====================================================================
  //  PERFIL (S4 D2, sprint 2-4, spec S4-D2D4 §2.5): chip #btnProf de la portada, página #mpProf (nivel, vitrina y álbum) y avisos #pfNote
  // =====================================================================
  // Datos de js/profile.js (VB.Profile), todo con guarda: sin el módulo no hay chip ni página. album() es caro (recorre el catálogo
  // del Vestuario, las insignias, el Entrenamiento, los logros y los retos): solo al abrir la página, al cambiar de pestaña y al fijar
  // en la vitrina. El chip usa un resumen (pfSum) que se rehace solo con pfDirty: entrada al menú, VB.UI.refreshMenu (bajada de la
  // cuenta), los avisos de check() y la vitrina. Nunca por frame (renderMenu corre cada 64 frames y solo lee pfSum).
  var pf = { tab: '', alb: null, map: null, tabs: null, sel: '', pins: [], q: [], noteT: 0, checkPend: true, lostSaid: false, roSaid: false };
  var pfDirty = true, pfSum = null;
  var PF_TAB_IDS = ['vestuario', 'insignias', 'entreno', 'carrera', 'retos', 'sedes', 'hitos'];
  var PF_SHIRT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.5 3 3 6l2 4.5 2-.9V21h10V9.6l2 .9L21 6l-5.5-3c-.4 1.6-1.8 2.8-3.5 2.8S8.9 4.6 8.5 3z"/></svg>';
  var PF_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M7 10V7.5a5 5 0 0 1 10 0V10h1a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 6 10zm2.6 0h4.8V7.5a2.4 2.4 0 0 0-4.8 0z"/></svg>';
  /** Icono de un hueco: el SVG que da el módulo (insignias, retos, sedes, hitos…) o, si no es un SVG (el Vestuario da texto), la camiseta. */
  function pfIcon(it) { var ic = it && it.icon; return typeof ic === 'string' && ic.charAt(0) === '<' ? ic : PF_SHIRT; }
  function pfTier(it) { var t = it ? it.tier | 0 : 0; return it && it.aid && it.aid.indexOf('look:') === 0 ? (t >= 3 ? 3 : t >= 2 ? 2 : 0) : t; }
  function pfMapOf(alb) { var m = {}; if (alb) alb.tabs.forEach(function (tb) { tb.items.forEach(function (it) { m[it.aid] = it; }); }); return m; }
  function pfLv() { var P = VB.Profile; try { return P.level(); } catch (e) { return { lvl: 1, into: 0, next: 80, total: 0 }; } }
  /** Resumen para el chip (pfDirty lo invalida). show: con al menos un partido o un sello (perfil limpio: portada idéntica). */
  function pfSummary() {
    if (!pfDirty && pfSum) return pfSum;
    pfDirty = false; pfSum = null;
    var P = VB.Profile; if (!P || !P.album) return null;
    try {
      var lv = P.level(), st = P.stats(), alb = P.album(), map = pfMapOf(alb);
      var vit = (P.vitrina() || []).map(function (a) { return map[a]; }).filter(Boolean);
      pfSum = { lv: lv, st: st, have: alb.have | 0, total: alb.total | 0, vit: vit, un: P.unseenCount() | 0, show: (st.m | 0) > 0 || (alb.have | 0) > 0 };
    } catch (e) { console.error('[VB][ERROR] Profile (chip): ' + e); pfSum = null; }
    return pfSum;
  }
  /** Chip de la portada (renderMenu): aro con el nivel, hasta 3 de la vitrina, «Álbum 23/140» y punto con sellos sin ver. */
  function pfChip() {
    var b = el.btnProf; if (!b) return;
    var S = VB.Profile ? pfSummary() : null, on = !!(S && S.show) && mpage === 'main';
    if (b.hidden === on) { b.hidden = !on; if (b.parentNode) b.parentNode.classList.toggle('off', !on); }
    if (el.menuFoot && el.menuFoot.classList.contains('has-pf') !== on) el.menuFoot.classList.toggle('has-pf', on);
    if (!on) return;
    var lv = S.lv, fr = lv.next ? Math.max(0, Math.min(1, lv.into / lv.next)) : 1;
    var key = lv.total + '|' + S.vit.map(function (it) { return it.aid; }).join(',') + '|' + S.have + '/' + S.total + '|' + S.un;
    if (last.pf === key) return;
    last.pf = key;
    b.innerHTML = '<span class="pf-ring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle class="tr" cx="18" cy="18" r="15"/><circle class="ar" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="' +
      (fr * 100).toFixed(1) + ' 100"/></svg><small>Nv</small><b>' + lv.lvl + '</b></span>' +
      (S.vit.length ? '<span class="pf-vi" aria-hidden="true">' + S.vit.map(function (it) { return '<i class="pf-ic t' + pfTier(it) + '">' + pfIcon(it) + '</i>'; }).join('') + '</span>' : '') +
      '<span class="pf-al">Álbum ' + S.have + '/' + S.total + '</span>' + (S.un ? '<i class="pf-dot" aria-hidden="true"></i>' : '');
    b.setAttribute('aria-label', 'Perfil: nivel ' + lv.lvl + ', álbum ' + S.have + ' de ' + S.total + (S.un ? '. Hay novedades' : ''));
  }
  // ---- avisos (#pfNote): de 2,6 a 3,4 s cada uno, como mucho 3 en cola (si hay más, un resumen) ----
  function pfNote(list) {
    if (!el.pfNote || !list || !list.length) return;
    if (list.length > 3) list = ['Perfil: ' + list.length + ' novedades. Míralas en el álbum'];
    list.forEach(function (t) { if (pf.q.indexOf(t) < 0 && pf.q.length < 3) pf.q.push(t); });
    if (pf.noteT <= 0) pfNoteNext();
  }
  function pfNoteNext() {
    var t = pf.q.shift();
    if (!t) { el.pfNote.classList.remove('on'); pf.noteT = 0; return; }
    pf.noteT = t.length > 34 ? 3.4 : 2.6;
    // móvil: al carril de avisos de arriba a la derecha (VB.Splat.toast); #pfNote se queda con el texto para el lector
    if (VB.Splat && VB.Splat.phone && VB.Splat.phone() && VB.Splat.toast) { el.pfNote.classList.remove('on'); el.pfNote.textContent = t; VB.Splat.toast(escT(t), { key: 'pfnote', ms: pf.noteT * 1000 }); return; }
    el.pfNote.textContent = t; restartAnim(el.pfNote, 'on');
  }
  /** Al entrar en el menú: VB.Profile.check() (insignias, logros, hitos, nivel y premios de nivel) y sus avisos. Los hitos que sellan
   *  noteMatch/noteGym llegan aquí una vez; el nivel y el premio del partido ya los enseña la hoja final. */
  function pfCheck() {
    var P = VB.Profile; if (!P || !P.check) return;
    var r = null, out = [];
    try { r = P.check(); } catch (e) { console.error('[VB][ERROR] Profile.check: ' + e); return; }
    // D4: aviso único por sesión de un guardado dañado (el módulo dejó la copia en <clave>.bak)
    if (!pf.lostSaid) {
      pf.lostSaid = true;
      var LOST = [[P, 'Tu perfil guardado estaba dañado'], [VB.Prog, 'Tus jugadores guardados estaban dañados'], [VB.Look, 'Tu vestuario guardado estaba dañado'], [VB.Retos, 'Tus retos guardados estaban dañados']];
      LOST.forEach(function (x) { if (x[0] && typeof x[0].lost === 'function' && safe(function () { return x[0].lost(); })) out.push(x[1] + '. Hay una copia en este dispositivo.'); });
    }
    if (r) {
      (r.lvlUp || []).forEach(function (n) { out.push('¡Perfil Nv ' + n + '!'); });
      (r.hitos || []).forEach(function (id) {
        var h = (P.HITOS || []).filter(function (x) { return x.id === id; })[0];
        if (h) out.push('Hito: ' + h.name + ' (+' + h.xp + ' XP)');
      });
      (r.grants || []).forEach(function (id) { var nm = VB.Look && VB.Look.name ? safe(function () { return VB.Look.name(id); }) : ''; if (nm) out.push('Nuevo en tu vestuario: ' + nm); });
      if ((r.lvlUp && r.lvlUp.length) || (r.hitos && r.hitos.length) || (r.grants && r.grants.length)) { pfDirty = true; last.pf = null; }
    }
    pfNote(out);
    if (out.length && ctx.state === 'menu') { pfChip(); if (mpage === 'prof') pfRender(true); }
  }
  /** Cada frame (ui.update): avisos y la comprobación pendiente al llegar al menú (como lkCheckNew). */
  function pfTick(rdt) {
    if (pf.noteT > 0) { pf.noteT -= rdt; if (pf.noteT <= 0) pfNoteNext(); }
    if (pf.checkPend && ctx.state === 'menu' && !(bootStage < 2 && bootBusy()) && !wp.ph) { pf.checkPend = false; pfCheck(); }
  }
  // ---- página ----
  function pfFocusEl() { return el.pfGrid ? el.pfGrid.querySelector('[data-aid]') || (pf.tabs && el.pfTabs.querySelector('.tab.on')) || el.btnProfBack : el.btnProfBack; }
  function pfPinsNow() { var P = VB.Profile; try { var o = P.load(); return Array.isArray(o.pin) ? o.pin : []; } catch (e) { return []; } }
  /** Sellos a la vista de la pestaña que se deja: el perfil marca los suyos (bd, gym, ach, ven, hit) y Retos los suyos (el Vestuario
   *  los marca en su página, fila a fila). */
  function pfSeen(tabId) {
    var P = VB.Profile, tb = pf.alb && pf.alb.tabs.filter(function (t) { return t.id === tabId; })[0]; if (!tb || !P) return;
    var mine = [], ret = [];
    tb.items.forEach(function (it) { if (!it.isNew) return; var k = it.aid.split(':')[0]; if (k === 'reto') ret.push(it.aid.slice(5)); else if (k !== 'look') mine.push(it.aid); });
    if (mine.length && P.markSeen) { try { P.markSeen(mine); } catch (e) { } }
    if (ret.length && VB.Retos && VB.Retos.markSeen) { try { VB.Retos.markSeen(ret); } catch (e) { } rtStrip = ''; }
    if (mine.length || ret.length) { pfDirty = true; last.pf = null; }
  }
  function pfTabItems(alb) {
    return alb.tabs.map(function (tb) { return { id: tb.id, label: escT(tb.label), badge: tb.have + '/' + tb.total, cls: tb.items.some(function (i) { return i.isNew; }) ? 'lk-new' : '' }; });
  }
  /** Pinta la página entera: cabecera, tarjeta de nivel, vitrina, pestañas, rejilla y pie (keep: conserva el foco en el mismo hueco). */
  function pfRender(keep) {
    if (!el.mpProf) return;
    var P = VB.Profile;
    if (!P || !P.album) { el.pfCard.innerHTML = ''; el.pfVit.innerHTML = ''; el.pfGrid.innerHTML = '<p class="rt-none">El perfil no está disponible.</p>'; return; }
    var a = document.activeElement, fAid = a && a.getAttribute && el.pfGrid.contains(a) ? a.getAttribute('data-aid') : '', kb = !!(a && a.classList && a.classList.contains('kf'));
    var alb = null; try { alb = P.album(); } catch (e) { console.error('[VB][ERROR] Profile.album: ' + e); }
    if (!alb || !alb.tabs.length) { el.pfGrid.innerHTML = '<p class="rt-none">El perfil no está disponible.</p>'; return; }
    pf.alb = alb; pf.map = pfMapOf(alb); pf.pins = pfPinsNow();
    if (!pf.tab || !alb.tabs.some(function (t) { return t.id === pf.tab; })) pf.tab = alb.tabs[0].id;
    var ro = !!safe(P.readOnly);
    // cabecera: el usuario de la cuenta (si hay sesión)
    var u = VB.Account && VB.Account.user ? safe(VB.Account.user) : null;
    if (el.pfKick) { el.pfKick.textContent = u ? String(u) : ''; el.pfKick.hidden = !u; }
    // tarjeta de nivel
    var lv = pfLv(), st = {}, np = null; try { st = P.stats() || {}; np = P.nextPrize(); } catch (e) { }
    var pc = lv.next ? Math.round(100 * Math.max(0, Math.min(1, lv.into / lv.next))) : 100;
    var nx = np ? (np.lvl === lv.lvl + 1 ? 'Siguiente premio: ' + np.name + ' (Nv ' + np.lvl + ')' : 'Siguiente premio en el Nv ' + np.lvl) : 'Todos los premios de nivel conseguidos';
    var m = st.m | 0, w = st.w | 0;
    var ch = '<div class="pf-lv"><b class="pf-n"><small>Nv</small>' + lv.lvl + '</b><div class="pf-bx"><i class="pf-bar" aria-hidden="true"><i style="--w:' + pc + '%"></i></i>' +
      '<span class="pf-xp">' + (lv.next ? lv.into + ' / ' + lv.next + ' XP' : lv.total + ' XP') + '</span></div></div>' +
      '<p class="pf-nx">' + escT(nx) + '</p><p class="pf-st">' + sepHTML([m + (m === 1 ? ' partido' : ' partidos'), w + (w === 1 ? ' victoria' : ' victorias'), (st.ven | 0) + ' de ' + (st.venAll | 0) + ' sedes'], 'v') + '</p>';
    if (el.pfCard._h !== ch) {
      el.pfCard._h = ch; el.pfCard.innerHTML = ch; el.pfCard.setAttribute('aria-label', 'Perfil nivel ' + lv.lvl + '. ' + nx);
      if (VB.Splat) { el.pfCard.classList.remove('sp-dec'); VB.Splat.decorate(el.pfCard); }   // (SPLAT: el brochazo crema se rehace tras innerHTML)
    }
    // vitrina (3 huecos; vacío = «Libre»)
    var vit = []; try { vit = (P.vitrina() || []).map(function (x) { return pf.map[x]; }).filter(Boolean); } catch (e) { }
    var vh = '<p class="pf-vk">Vitrina<small>Fija tus 3 favoritos desde el álbum</small></p><div class="pf-vs">';
    for (var i = 0; i < 3; i++) {
      var it = vit[i];
      vh += it ? '<span class="pf-v t' + pfTier(it) + '" title="' + escT(it.name) + '"><span class="pf-si">' + pfIcon(it) + '</span><span class="pf-vn">' + escT(it.name) + '</span></span>' : '<span class="pf-v free">Libre</span>';
    }
    vh += '</div>';
    if (el.pfVit._h !== vh) { el.pfVit._h = vh; el.pfVit.innerHTML = vh; }
    if (el.pfRo) el.pfRo.hidden = !ro;
    // pestañas (con la cuenta de cada una)
    if (!pf.tabs && el.pfTabs) pf.tabs = makeTabs(el.pfTabs, pfTabItems(alb), { value: pf.tab, label: 'Apartados del álbum', pane: el.pfGrid,
      onChange: function (id, dir, how) {
        var a = document.activeElement, inP = !!(a && el.pfGrid && el.pfGrid.contains(a)), kb = inP && (a.classList.contains('kf') || how === 'key' || how === 'pad');
        pfSeen(pf.tab); pf.tab = id; pf.sel = ''; pfRender(false); if (el.pfGrid) el.pfGrid.scrollTop = 0;
        if (inP) focusEl(pfFocusEl(), kb);   // Q/E con el foco en una ficha: al panel nuevo, no al body
      } });
    else if (pf.tabs) { pf.tabs.items = pfTabItems(alb); if (pf.tabs.get() !== pf.tab) pf.tabs.cur = pf.tab; pf.tabs.refresh(); }
    // rejilla
    var tb = alb.tabs.filter(function (t) { return t.id === pf.tab; })[0], gh = '';
    tb.items.forEach(function (it) {
      var pin = pf.pins.indexOf(it.aid) >= 0;
      gh += '<button type="button" class="pf-s ' + (it.have ? 'on' : 'off') + ' t' + pfTier(it) + (it.isNew ? ' new' : '') + (pin ? ' pin' : '') + '" data-aid="' + escT(it.aid) + '" aria-label="' +
        escT(it.name + (it.have ? (pin ? '. En la vitrina' : '') : '. Por conseguir') + (it.isNew ? '. Nuevo' : '')) + '"><span class="pf-si">' + (it.have ? pfIcon(it) : PF_LOCK) + '</span><span class="pf-sn">' + escT(it.name) + '</span></button>';
    });
    if (el.pfGrid._h !== gh) { el.pfGrid._h = gh; el.pfGrid.innerHTML = gh; }
    var fb = fAid ? el.pfGrid.querySelector('[data-aid="' + fAid + '"]') : null;
    if (keep && fb) focusEl(fb, kb);
    pfFootSync();
  }
  /** Pie: de dónde salió el hueco enfocado (o cómo se gana) y el botón de la vitrina. */
  function pfFootSync() {
    if (!el.pfFoot) return;
    var P = VB.Profile, it = pf.sel && pf.map ? pf.map[pf.sel] : null, t = it && P && P.footText ? safe(function () { return P.footText(it); }) || '' : '';
    if (!it) t = pf.alb ? 'Elige un hueco para ver de dónde sale' : '';
    if (el.pfFoot.textContent !== t) el.pfFoot.textContent = t;
    var ro = P ? !!safe(P.readOnly) : true, can = !!(it && it.have) && !ro;
    var pinned = !!(it && pf.pins.indexOf(it.aid) >= 0);
    el.pfPin.hidden = !can;
    if (can) {
      var d = device(), k = d === 'gamepad' ? padKey('x') : d === 'touch' ? '' : '<span class="key">F</span>';
      var h = k + '<span>' + (pinned ? 'Quitar de la vitrina' : 'Fijar en la vitrina') + '</span>';
      var pc = el.pfPin.querySelector('.pf-pinc') || el.pfPin;   // (SPLAT: la mancha es el 1.er hijo del botón; el texto va en su span)
      if (el.pfPin._h !== h) { el.pfPin._h = h; pc.innerHTML = h; }
    }
  }
  function pfSelect(aid) { if (pf.sel === aid) return; pf.sel = aid || ''; pfFootSync(); }
  /** Hueco enfocado (por si el foco llegó sin focusin: ventana sin foco, pruebas). */
  function pfCur() { var a = document.activeElement; if (a && a.hasAttribute && a.hasAttribute('data-aid') && el.pfGrid && el.pfGrid.contains(a)) pfSelect(a.getAttribute('data-aid')); return pf.sel; }
  /** Fija o quita de la vitrina el hueco elegido (X con mando, F con teclado, el botón del pie o un 2º toque en táctil). */
  function pfPinToggle() {
    pfCur();
    var P = VB.Profile, it = pf.sel && pf.map ? pf.map[pf.sel] : null;
    if (!P || !it || !it.have || safe(P.readOnly)) return false;
    var on = pf.pins.indexOf(it.aid) >= 0, ok = false;
    if (on) ok = !!safe(function () { return P.unpin(it.aid); });
    else if (pf.pins.length >= 3) { pfNote(['La vitrina está llena. Quita uno antes']); uiSound2('arrowEdge', 1); return false; }
    else ok = !!safe(function () { return P.pin(it.aid); });
    if (!ok) return false;
    uiSound('click'); pfDirty = true; last.pf = null;
    srSay(on ? 'Quitado de la vitrina: ' + it.name : 'En la vitrina: ' + it.name);
    pfRender(true);
    return true;
  }
  /** Recorrido 2D de la rejilla: ↑/↓ saltan una fila (arriba del todo, a las pestañas; abajo del todo, al pie). true si lo ha hecho. */
  function pfGridV(d) {
    var a = document.activeElement;
    if (!a || !a.hasAttribute || !a.hasAttribute('data-aid') || !el.pfGrid || !el.pfGrid.contains(a)) return false;
    var L = el.pfGrid.querySelectorAll('[data-aid]'), n = L.length, i = Array.prototype.indexOf.call(L, a), cols = 1;
    while (cols < n && L[cols].offsetTop === L[0].offsetTop) cols++;
    var j = i + d * cols;
    if (j >= n && Math.floor(i / cols) < Math.floor((n - 1) / cols)) j = n - 1;   // última fila a medias: al último hueco
    if (j < 0) { if (pf.tabs) { pf.tabs.focus(true); hoverSound(); return true; } return false; }
    if (j >= n) { focusEl(!el.pfPin.hidden ? el.pfPin : el.btnProfBack, true); hoverSound(); return true; }
    focusEl(L[j], true); pfCur(); hoverSound(); return true;
  }
  /** ←/→ en la rejilla: hueco vecino (en el borde, se queda). */
  function pfGridH(a, d) {
    if (d < 0 && vtNav(-1, 0, 'key', true)) return;   // (móvil: 1ª columna de la rejilla → pestaña elegida de la columna #pfTabs)
    var L = el.pfGrid.querySelectorAll('[data-aid]'), i = Array.prototype.indexOf.call(L, a), j = i + (d > 0 ? 1 : -1);
    if (j < 0 || j >= L.length) { uiSound2('arrowEdge', d); return; }
    focusEl(L[j], true); pfCur(); hoverSound();
  }
  function pfOpen() { pf.sel = ''; pfRender(false); }
  function pfLeave() { pfSeen(pf.tab); pf.sel = ''; pfDirty = true; last.pf = null; }
  /** Al perfil (chip de la portada o escena debug=prof): o = {tab: 'vestuario' | 'insignias' | … | 'hitos'}. */
  function openProfile(o) {
    if (ctx.state !== 'menu' || !VB.Profile) return false;
    o = o || {};
    if (o.tab && PF_TAB_IDS.indexOf(o.tab) >= 0) pf.tab = o.tab;
    if (mpage === 'prof') { pfRender(false); return true; }
    mstack.length = 0; mstack.push({ p: 'main', f: 'btnProf' });
    setPage('prof'); focusSoon(pageFocus(), false);
    return true;
  }
  /** Antetítulo de la pausa: «Entrenamiento ◆ Saque 4/10 | 11 pts» (peloteo: «Entrenamiento ◆ Récord 14 toques»). */
  function gymKicker(g) {
    var d = g.drill;
    if (d.kind === 'free') return ['Entrenamiento', gymBestV ? 'Récord ' + gymBestV + ' toques' : 'Peloteo libre'];
    return [g.careerDrill ? 'Carrera' : 'Entrenamiento', { h: escT(drillName(d.kind, true)) + ' <span style="white-space:nowrap">' + Math.min(d.of, d.n + 1) + '/' + d.of + SEP_V + (d.total | 0) + '&nbsp;pts</span>' }]; // («Remate 3/10 | 6 pts»: el grupo salta de línea entero por el espacio, sin separador colgando)
  }
  /** Pastilla del HUD en el sitio del marcador: «Saque 4/10 ◆ 11 pts ◆ Récord 21» (solo reescribe si cambia algo). */
  function drillHud(g) {
    var d = g.drill, free = d.kind === 'free', n = Math.min(d.of, d.n + 1);
    var k = free ? 1e7 + (d.cnt | 0) * 1000 + gymBestV : n * 1e6 + (d.total | 0) * 1000 + gymBestV;
    if (last.db === k && last.dbK === d.kind) return;
    last.db = k; last.dbK = d.kind;
    el.drillTxt.innerHTML = free
      ? sepHTML([{ h: 'Peloteo' }, { h: 'Toques <b>' + (d.cnt | 0) + '</b>' }, gymBestV ? { h: '<small>Récord</small> <b>' + gymBestV + '</b>' } : ''], 'd')
      : sepHTML([{ h: escT(drillName(d.kind, true)) + ' <b>' + n + '/' + d.of + '</b>' }, { h: '<b>' + (d.total | 0) + '</b> pts' }, gymBestV ? { h: '<small>Récord</small> <b>' + gymBestV + '</b>' } : ''], 'd');
  }
  /** Tarjeta de presentación del ejercicio (introStart con g.drill): nombre, objetivo, teclas del dispositivo y medallas. */
  function drillIntro(g) {
    var id = g.drill.kind, gl = G(), ik = function (k, t) { return '<span class="ik">' + k + (k ? ' ' : '') + t + '</span>'; };
    el.idTitle.textContent = drillName(id);
    // sesión de entrenamiento de la Carrera (g.careerDrill, main.js startCareerDrill): «Carrera ◆ Sesión 1 de 3» encima del título
    if (el.idSes) { var cdr = g.careerDrill; el.idSes.hidden = !cdr; if (cdr) setSep(el.idSes, ['Carrera', 'Sesión ' + (cdr.n | 0) + ' de ' + (cdr.max | 0)], 'd'); }
    var row = gymRow(id); el.idGoal.textContent = row ? row.help : '';
    var keys = id === 'serve' ? ik(gl.serve, 'flotante') + ik(gl.jump, 'en salto') + ik('', 'Apunta con ' + gl.aim)
      : id === 'recv' ? ik(gl.move, 'te mueves') + ik(gl.hit, 'recibes')
      : id === 'set' ? (device() === 'touch' ? ik(gl.hit, 'de dedos') : ik(gl.hit + gl.jset, 'de dedos')) + ik(gl.jump + gl.jset, 'en salto') + (g.mastery && g.aimSet !== false ? ik('', 'Sin dirección: alta a la 4') : '')
      : id === 'atk' ? ik(gl.jump, 'saltas') + ik(gl.hit, 'rematas') + ik('', 'Apunta con ' + gl.aim)
      : id === 'block' ? ik(gl.jump, 'saltas') + ik(gl.hit, 'cierras al remate')
      : ik(gl.hit, 'golpeas') + ik(gl.jump, 'saltas') + ik(gl.jset, 'colocas');
    el.idKeys.innerHTML = keys;
    var M = gymMedals(id);
    if (M) el.idMed.innerHTML = M.map(function (v, i) { return '<span class="im">' + medalSVG(i + 1) + MEDAL_N[i + 1] + ' ' + v + '</span>'; }).join('<span class="sep sep-v"><span class="sr">, </span></span>');
    else { var b = gymBestOf('free'); el.idMed.textContent = b ? 'Mejor peloteo: ' + b + ' toques' : 'Sin marcador ni sets'; }
  }
  /** Sello del ejercicio en un punto del mundo (bote, zona del colocador, red): sube y se funde como el del golpe (UI-09). */
  function stampAt(x, y, z, title, sub, cls, dur) {
    if (!ctx.camera || !VB.toThree || !ctx.THREE || !el.stamp) return;
    if (!_sv) _sv = new ctx.THREE.Vector3();
    ctx.camera.updateMatrixWorld();
    if (!sproj(x, y, z, _sp).ok) return;
    stp.pl = null; stp.ox = 0; stp.oy = -46; stp.wx = x; stp.wy = y; stp.wz = z; stp.t = dur; stp.born = performance.now(); stp.cost = 0; stp.dir = 2;
    el.stampT.textContent = title; el.stampS.textContent = sub || ''; el.stampS.hidden = !sub;
    el.stamp.className = 'on ' + cls;
    stampPlace();
    stampKF();
    try { if (el.stampIn.animate) el.stampIn.animate(rm() ? STAMP_KF_RM : STAMP_KF, { duration: Math.round(dur * 1000), easing: 'linear', fill: 'both' }); } catch (er) { }
  }
  /** drillRep: sello con el resultado («¡Diana! +3», «Fuera»…) y, con 0 puntos, el consejo concreto del fallo (GYM_TIPS). */
  function gymRep(e, g) {
    var p = g.ctrl || (g.teams && g.teams[0][0]), x = isFinite(e.x) ? e.x : p ? p.x : 0, y = isFinite(e.y) ? e.y : p ? p.y : 0;
    var z = isFinite(e.x) ? 0.5 : 2.4, title, sub = '', cls;
    if (e.kind === 'free') {
      var hits = e.hits | 0, rb = null;
      if (!ctx.debug && hits > 0 && VB.Gym && VB.Gym.recordRally) { try { rb = VB.Gym.recordRally(hits); } catch (er) { rb = null; } }
      var isB = (rb ? rb.isBest : !!e.isBest) && hits > 1;
      if (rb) gymBestV = rb.best | 0; else if (e.best > gymBestV) gymBestV = e.best | 0;
      if (hits < 1 || !p) return;
      title = isB ? '¡Récord de peloteo!' : 'Peloteo de ' + hits + (hits === 1 ? ' toque' : ' toques');
      sub = isB ? hits + ' toques' : ''; cls = isB ? 'pf' : 'gd';
      x = p.x; y = p.y; z = 2.4;
    } else {
      var pts = e.pts | 0;
      title = (e.text || (pts ? 'Bien' : 'Fallo')) + (pts ? ' +' + pts : '');
      cls = pts >= 3 ? 'pf' : pts > 0 ? 'gd' : 'ms';
      if (!pts && (!g.autopilot || ctx.debug)) { var tp = gymTipFor(e, g); if (tp) { gymTip = tp; gymTipT = 2.5; } }
    }
    stampAt(x, y, z, title, sub, cls, 1.1);
    srSay(title + (sub ? ', ' + sub : ''));
  }
  function gymTipFor(e, g) {
    var k = e.kind, r = e.res, L = gymLast;
    if (k === 'serve' && r === 'out') return GYM_TIPS.out;
    if (k === 'block' && r === 'none' && !(g.drill && g.drill.jumped)) return GYM_TIPS.jump;
    if (L.miss === 'late') return GYM_TIPS.late;
    if (L.miss === 'early' || L.t < -0.03) return GYM_TIPS.early;
    if (L.miss === 'far') return GYM_TIPS.far;
    if (L.t > 0.03) return GYM_TIPS.lateHit;
    if (r === 'net') return GYM_TIPS.net;
    if (k === 'atk' && (r === 'stuff' || r === 'soft')) return GYM_TIPS.blocked;
    return '';
  }
  /** drillEnd: apunta el total (VB.Gym.record, que da la XP de las medallas nuevas) y prepara la hoja final; se abre tras el sello. */
  // antetítulo del final del Entrenamiento (568×320, .ph-s: sin la sede, que partía la línea). La Carrera pone el suyo (geKickCr).
  var geKickCr = false;
  function geKickSet() { if (el.geKick && !geKickCr) setSep(el.geKick, document.documentElement.classList.contains('ph-s') ? ['Entrenamiento'] : ['Entrenamiento', venueName()], 'd'); }
  function gymEndShow(e, g) {
    var Gm = VB.Gym, id = e.kind, total = e.total | 0, res = null, M = gymMedals(id) || [99, 99, 99], cdr = g && g.careerDrill ? g.careerDrill : null;
    // (sesión de la Carrera: no toca make-the-cut.gym ni da experiencia al escuadrón de Partido rápido; cuenta en la Carrera, main.js)
    if (Gm && Gm.record && !ctx.debug && !cdr) { try { res = Gm.record(id, total); } catch (er) { res = null; } }
    // D2: sesión del Entrenamiento para el perfil (hito «modos»; la XP de las medallas es derivada de VB.Gym)
    if (!ctx.debug && g && !g.autopilot && VB.Profile && VB.Profile.noteGym) { try { VB.Profile.noteGym(id); } catch (er) { console.error('[VB][ERROR] Profile.noteGym: ' + er); } }
    if (!res) {   // depuración (o sin gym.js): lo que pasaría, sin guardar nada
      var pv = Gm && Gm.get ? Gm.get(id) : null, pm = pv ? pv.m | 0 : 0, mm = Gm && Gm.medalOf ? Gm.medalOf(id, total) : 0, xp = 0, XP = (Gm && Gm.XP) || [30, 50, 80];
      for (var lv = pm + 1; lv <= mm; lv++) xp += XP[lv - 1] || 0;
      res = { best: Math.max(pv ? pv.b : 0, total), prev: pv ? pv.b : 0, isBest: !pv || total > pv.b, medal: mm, newMedal: mm > pm, xp: xp };
    }
    var best = Math.max(res.best | 0, total); gymBestV = best;
    geKickCr = !!cdr; geKickSet();
    el.geTitle.textContent = drillName(id);
    el.geTotal.textContent = total; el.geTotal.setAttribute('data-cu', total);
    el.geMax.textContent = (Gm && Gm.MAX) || 30;
    var mh = '';
    for (var i = 1; i <= 3; i++) {
      var on = res.medal >= i;
      mh += '<span class="ge-m' + (on ? ' on' : '') + (on && res.newMedal && i === res.medal ? ' new' : '') + '">' + medalSVG(i, on ? '' : 'off') + '<span>' + MEDAL_N[i] + ' ' + M[i - 1] + '</span></span>';
    }
    // sesión de la Carrera: delante de las medallas, la nota en letra grande (A+ … F, VB.Career.trainGrade)
    if (cdr && cdr.res && cdr.res.ok && cdr.res.grade) {
      var gk = cdr.res.grade === 'A+' ? 'ap' : String(cdr.res.grade).toLowerCase();
      mh = '<span class="cdr-g gr-' + escT(gk) + '" aria-label="Nota ' + escT(cdr.res.grade) + '"><b>' + escT(cdr.res.grade) + '</b><small>NOTA</small></span>' + mh;
    }
    el.geMeds.innerHTML = mh;
    el.geReps.innerHTML = (e.reps || []).map(function (p) { return '<i class="p' + Math.max(0, Math.min(3, p | 0)) + '"></i>'; }).join('');
    var rec = '';
    if (total > 0 && res.isBest) rec += '<span class="new">¡Nuevo récord!' + (res.prev ? ' Antes: ' + res.prev : '') + '</span>';
    else rec += '<span>Récord: <b>' + best + '</b></span>';
    if (res.newMedal && res.medal) rec += '<span class="new">¡Medalla de ' + MEDAL_N[res.medal].toLowerCase() + '!</span>';
    if (res.xp > 0) rec += '<span><b>+' + res.xp + ' de experiencia</b> (a cada jugador)</span>';
    if (res.medal < 3 && M[res.medal] < 99) rec += '<span>' + MEDAL_N[res.medal + 1] + ': ' + M[res.medal] + ' puntos</span>';
    if (cdr) rec = careerDrillRec(cdr, total, res.medal);
    el.geRec.innerHTML = rec;
    var nx = Gm && Gm.nextOf && !cdr ? Gm.nextOf(id) : null;
    el.btnGeNext.hidden = !nx && !(cdr && cdr.next);
    if (nx) el.btnGeNext.textContent = 'Siguiente: ' + drillName(nx, true);
    else if (cdr && cdr.next) el.btnGeNext.textContent = 'Siguiente sesión: ' + drillName(cdr.next, true);   // (el ejercicio que toca en el plan, main.js careerDrillDone)
    // sesión de la Carrera: sin «Repetir» (gastaría otra sesión); «Siguiente sesión» si quedan y la fatiga deja; «Entrenamiento»
    // pasa a «Volver a la Carrera»
    // («Siguiente sesión» va en el parche de abajo a la derecha, el sitio de «Repetir»; «Volver a la Carrera», la secundaria)
    var geT = el.btnGeAgain.querySelector('.sp-t') || el.btnGeAgain, geN = !!(cdr && cdr.next);
    if (!el.btnGeAgain.getAttribute('data-t0')) el.btnGeAgain.setAttribute('data-t0', geT.textContent);
    el.btnGeAgain.hidden = !!cdr && !geN;
    if (geN) { el.btnGeNext.hidden = true; geT.textContent = 'Siguiente: ' + drillName(cdr.next, true); el.btnGeAgain.setAttribute('data-cdr', '1'); el.btnGeAgain.setAttribute('aria-label', 'Siguiente sesión: ' + drillName(cdr.next, true)); }
    else { geT.textContent = el.btnGeAgain.getAttribute('data-t0'); el.btnGeAgain.removeAttribute('data-cdr'); el.btnGeAgain.removeAttribute('aria-label'); }
    if (cdr) { if (!el.btnGeList.getAttribute('data-cr')) el.btnGeList.setAttribute('data-cr', el.btnGeList.textContent); el.btnGeList.textContent = 'Volver a la Carrera'; setSep(el.geKick, ['Carrera', 'Sesión ' + cdr.n + ' de ' + cdr.max], 'd'); }
    else if (el.btnGeList.getAttribute('data-cr')) { el.btnGeList.textContent = el.btnGeList.getAttribute('data-cr'); el.btnGeList.removeAttribute('data-cr'); }
    srSay(drillName(id) + ': ' + total + ' puntos' + (cdr && cdr.res && cdr.res.grade ? ', nota ' + cdr.res.grade : '') + (res.medal ? ', medalla de ' + MEDAL_N[res.medal].toLowerCase() : '') + (total > 0 && res.isBest && !cdr ? ', nuevo récord' : ''));
    // depuración: la hoja al momento; si no, tras el sello de la última repetición (0,75 s) y la cortinilla
    geGate = !(ctx.debug && ctx.params.hold !== '1'); geWait = geGate; geT0 = ctx.time; shown = '';
  }
  /** Líneas de la hoja final de una sesión de la Carrera (resultado de VB.Career.drillDone en g.careerDrill.res; P6): «Récord: B → A»
   *  (o el primero), la barra del atributo que se llena de prog0 a prog con lo ganado (si llega a 100, «+1 Recepción (64)»), las marcas
   *  «¡Primera vez! +50 %» y «Plan +20 %», y fatiga e impresión antes y después. Estilos en career-ui.js (#gymEnd .cdr-*). */
  function careerDrillRec(cdr, total, medal) {
    var r = cdr.res, out = '';
    if (!r || !r.ok) return '<span>' + (r && r.why === 'fatiga' ? 'Demasiada fatiga: la sesión no cuenta' : r && r.why === 'done' ? 'Ya no quedaban sesiones: no cuenta' : 'La sesión no se ha podido apuntar') + '</span>';
    var an = r.attr && VB.Prog && VB.Prog.LABEL ? VB.Prog.LABEL[r.attr] : cdr.attrName, need = r.need || 100;
    if (r.bestGrade0 && r.bestGrade !== r.bestGrade0) out += '<span class="new">Récord: ' + escT(r.bestGrade0) + ' → ' + escT(r.bestGrade) + '</span>';
    else if (r.best0 == null && r.bestGrade) out += '<span class="new">Primer récord: ' + escT(r.bestGrade) + '</span>';
    else if (r.bestGrade) out += '<span>Récord: <b>' + escT(r.bestGrade) + '</b> (' + (r.best | 0) + ' puntos)</span>';
    var tags = [];
    if (r.first) tags.push('¡Primera vez! +50 %');
    if (r.focus) tags.push('Plan del entrenador +20 %');
    if (tags.length) out += '<div class="cdr-tags">' + tags.map(function (t) { return '<span>' + escT(t) + '</span>'; }).join('') + '</div>';
    // barra: de prog0 a prog (si sube, se llena hasta el final y el +1 va al lado)
    var a = Math.max(0, Math.min(100, Math.round(100 * (r.prog0 | 0) / need))), b = r.up ? 100 : Math.max(a, Math.min(100, Math.round(100 * (r.prog | 0) / need)));
    out += '<div class="cdr-bar" role="img" aria-label="' + escT(an) + ': ' + (r.up ? 'sube a ' + r.v : '+' + r.gain + ' de progreso, ' + r.prog + ' de ' + need) + '"><span>' + escT(an) + ' ' + (r.up ? r.v - 1 : r.v) + '</span>' +
      '<span class="bar"><i class="b1" style="--from:' + a + '%;--to:' + b + '%"></i><i class="b0" style="width:' + a + '%"></i></span>' +
      '<b>' + (r.up ? '+1 ' + escT(an) + ' (' + r.v + ')' : '+' + r.gain) + '</b></div>';
    out += '<span>' + sepHTML(['Fatiga ' + r.fat0 + ' → ' + r.fat, 'Impresión ' + Math.round(r.imp0) + ' → ' + Math.round(r.imp)], 'v') + '</span>';
    if (r.stat && r.stat0 && r.stat !== r.stat0 && r.stat === 'start') out += '<span class="new">Te has ganado el sitio en los entrenos</span>';
    return out;
  }
  function geTick() {
    if (ctx.state !== 'over' || !isDrill()) { geWait = false; geGate = false; return; }
    if (ctx.time - geT0 < 0.75) return;
    geWait = false;
    if (!wipeRun(2, geOpen)) geOpen();
  }
  function geOpen() { geGate = false; shown = ''; if (ctx.game) syncScreens(ctx.game); }
  /** E1: línea de la hoja final con los usos de la maestría («Fintas 3 | Colocados 5 | Al filo 4 | Rápidas 2»), '' sin nada. */
  function masteryLine(g) {
    var m = g && !g.demo && (g.mastery || g.feintOn) && g.stats && g.stats.mastery || {}, d0 = g && !g.demo && g.stats && g.stats.dj;   // (6v6: lo del salto con impulso y las fintas)
    if (!(g && !g.demo && (g.mastery || g.feintOn) && g.stats && g.stats.mastery) && !d0) return '';
    var u = function (k) { return m[k] && m[k][0] | 0; }, out = [];
    var f = u('feint'), r = u('roll'), e = u('edge'), q = u('quick');
    // salto con impulso (v1.12.0, sim g.stats.dj): remates con impulso y pipes
    var dj = g.stats.dj, dm = dj && dj.mom ? dj.mom[0] | 0 : 0, dp = dj && dj.pipe ? dj.pipe[0] | 0 : 0;
    if (dm) out.push('Con impulso <b>' + dm + '</b>');
    if (dp) out.push((dp === 1 ? 'Pipe ' : 'Pipes ') + '<b>' + dp + '</b>');
    if (f) out.push((f === 1 ? 'Finta ' : 'Fintas ') + '<b>' + f + '</b>');
    if (r) out.push((r === 1 ? 'Colocado ' : 'Colocados ') + '<b>' + r + '</b>');
    if (e) out.push('Al filo <b>' + e + '</b>');
    if (q) out.push((q === 1 ? 'Rápida ' : 'Rápidas ') + '<b>' + q + '</b>');
    return out.length ? sepHTML(out, 'v', true) : '';
  }
  // E1: consejos de maestría en la franja de arriba, uno por partido como mucho (≤ 3,5 s de juego) y cada uno 2 veces en total
  // (make-the-cut.e1tips, solo este dispositivo). Salen aunque los consejos de partido estén apagados (se apagan solos al ganar el 1r
  // partido, y la maestría es justo para quien ya gana), pero no sin las ayudas (Ajustes ◆ Juego ◆ Ayudas).
  var e1 = { k: '', t: 0, on: false, seen: null };
  var E1_KEYS = ['air', 'feint', 'feint2', 'aim', 'edge', 'mom', 'pipe', 'jdiana'];   // (mom / pipe / jdiana: salto con impulso, v1.12.0; feint2: la finta nueva de 1.17.0, se vuelve a explicar)
  function e1Seen() { if (!e1.seen) { e1.seen = {}; try { var o = JSON.parse(localStorage.getItem('make-the-cut.e1tips') || 'null'); if (o && typeof o === 'object') E1_KEYS.forEach(function (k) { e1.seen[k] = Math.max(0, Math.min(9, +o[k] | 0)); }); } catch (er) { } } return e1.seen; }
  function e1Tip(g, p, nt, w, ar, gl, touchDev, one, dt) {
    if (e1.k === 'done') return '';
    var S = e1Seen(), k = '', txt = '';
    var mine = !(one && g.jobs && g.jobs[0] && g.jobs[0] !== p) || !!(VB.Sim.setTurn && VB.Sim.setTurn(g));
    // salto con impulso (v1.12.0): primero los consejos nuevos que aún no se han visto 2 veces (si no, los de siempre los taparían)
    if (g.jsetAim && (S.jdiana | 0) < 2 && g.aim3 && g.aim3.on && g.aim3.kind === 'jset' && !g.jsMv) { k = 'jdiana'; txt = 'Mueve la diana con ' + gl.aim + ': cerca, rápida; lejos, alta'; }
    else if (g.djump && (S.pipe | 0) < 2 && g.size === 6 && nt === 2 && g.touchTeam === 0 && p.z <= 0.01 && !p.front && (p.role === 'OH' || p.role === 'OPP')) { k = 'pipe'; txt = 'Pipe: despega detrás de la línea de 3 m y salta hacia delante'; }
    else if (g.djump && (S.mom | 0) < 2 && nt === 3 && mine && p.z <= 0.01 && w && w.attack && w.jumpT > 0.12) { k = 'mom'; txt = 'Corre hacia la red y pulsa ' + gl.jump + ' sin soltar ' + gl.aim + ': remate con impulso'; }
    // finta (1.17.0, también en 6v6): se arma con GOLPEAR y el golpe lo marca SALTAR (consejo nuevo 'feint2': la de antes se explicaba de otra forma)
    else if (g.feintOn && (S.feint2 | 0) < 2 && nt === 3 && mine && p.z <= 0.01 && w && w.attack && w.jumpT > 0.12) { k = 'feint2'; txt = touchDev ? 'Finta: en el aire, toca GOLPEAR pronto y desliza a SALTAR al golpear' : 'Finta: en el aire, ' + gl.hit + ' pronto y ' + gl.jump + ' al golpear'; }
    else if (!g.mastery) { k = ''; }   // (6v6 o sin maestría: solo los del salto con impulso y la finta)
    else if (ar === 'roll') { k = 'air'; txt = 'En el aire, ' + gl.hit + ' remata, ' + gl.jump + ' deja caer y ' + gl.jset + ' coloca al fondo'; }
    else if (nt === 2 && mine && g.aimSet !== false && g.size !== 6) { k = 'aim'; txt = 'Colocas <b>' + setName(g) + '</b>; con ' + gl.aim + ' eliges otro destino: cerca, rápida; lejos, alta'; }
    else if (nt === 3 && aim3(g, p)) { k = 'edge'; txt = 'Al filo: más difícil de defender, más fácil de fallar'; }
    if (!k || (S[k] | 0) >= 2 || (e1.k && e1.k !== k)) return '';
    if (!e1.k) {
      // el consejo de este partido: el primero cuyo momento llega (y que no se haya visto ya 2 veces)
      e1.k = k; S[k] = (S[k] | 0) + 1; try { localStorage.setItem('make-the-cut.e1tips', JSON.stringify(S)); } catch (er) { }
    }
    e1.t += dt || 0;
    if (e1.t > 3.5) { e1.k = 'done'; return ''; }
    e1.on = true;
    return txt;
  }

  // =====================================================================
  //  ENTRADA DE MENÚS
  // =====================================================================
  function adjustFocused(d) {
    var a = document.activeElement;
    // SPLAT: filas de botones (data-sp-row; portada y Jugar): ←/→ = vecina activa de la fila, sin salirse
    var spr = spRow(a), lay = activeLayer();
    if (spr && lay && lay.contains(spr)) { spRowStep(spr, a, d); return true; }
    // tarjetas de modos sueltas (fuera de una fila): ←/→ se quedan con el rebote; desde «Volver» de Jugar, ←/→ vuelven a una tarjeta
    if (a && a.classList && a.classList.contains('mode') && !panel) { modeStep(a, d); return true; }
    if (a && a.classList && a.classList.contains('mp-back') && !panel && mpage === 'play') { focusEl(el.btnQuick, true); hoverSound(); return true; }
    if (a && a.classList && a.classList.contains('mp-back') && !panel && mpage === 'gym') { focusEl(gymRowEl(gymSel), true); hoverSound(); return true; }
    if (!panel && mpage === 'online' && el.mpOnline && a && el.mpOnline.contains(a) && VB.NetLobby && VB.NetLobby.side && VB.NetLobby.side(a, d)) return true;   // (online: filas de crear sala)
    if (!panel && mpage === 'prof' && a && a.hasAttribute && a.hasAttribute('data-aid') && el.pfGrid && el.pfGrid.contains(a)) { pfGridH(a, d); return true; }
    if (panel === 'mstats' && a && a.getAttribute && msArrow(a, d)) return true;   // Estadística del partido: sets y tabla desplazable
    if (a && a.getAttribute && a.getAttribute('role') === 'tab') { var tb = activeTabs(); if (tb) { tb.step(d, 'key'); return true; } }
    // Vestuario: fila = valor anterior / siguiente; selector de jugador, escenario y pie = vecino
    if (!panel && mpage === 'look' && a && a.getAttribute && el.mpLook && el.mpLook.contains(a)) {
      if (a.hasAttribute('data-look')) { lkStep(a.getAttribute('data-look'), d > 0 ? 1 : -1); return true; }
      if (a.hasAttribute('data-lkpick')) { lkPickStep(d); return true; }
      if (a.hasAttribute('data-ven')) { lkVenue(lk.venue === 'beach' ? 'hall' : 'beach', true); return true; }
      if (a.hasAttribute('data-lkf')) { lkFootStep(d); return true; }
    }
    if (a && a.getAttribute && a.getAttribute('data-pick') != null && panel === 'squad') { sqPick(sqSel + (d > 0 ? 1 : -1), true); return true; }
    // (E3: en Controles, ←/→ cambian de pestaña salvo sobre una fila con valor —Zona muerta, Tamaño de botones— o una tecla)
    if (panel === 'ctl' && !(a && a.classList && (a.classList.contains('kslot') || (a.getAttribute('data-opt') && el.ctlGrid.contains(a))))) { ctlStep(d > 0 ? 1 : -1); return true; }
    if (panel === 'tut' && (!a || !a.getAttribute || !a.getAttribute('data-opt'))) { if (d > 0) { if (tut.i < TUT.length - 1) tutGo(tut.i + 1); } else tutGo(tut.i - 1); click(); return true; }
    if (a && a.getAttribute && a.getAttribute('data-opt') && !a.closest('[hidden]')) { changeOpt(a.getAttribute('data-opt'), d); return true; }
    if (panel === 'squad' && a && a.getAttribute && a.getAttribute('data-bd')) { navMove(d > 0 ? 1 : -1); return true; } // rejilla de insignias: ←/→ = vecina
    if (a && a.classList && a.classList.contains('kslot')) { navMove(d > 0 ? 1 : -1); return true; }                        // E3: ←/→ entre las teclas de Controles
    return false;
  }
  /** ←/→ en una tarjeta de Jugar fuera de fila (Carrera, sola en la suya): se queda con el rebote (las filas las lleva spRowStep). */
  function modeStep(a, d) { uiSound2('arrowEdge', d); }
  function onKey(e) {
    ctx.lastKeyT = ctx.time;
    if (capturing || (VB.Input && VB.Input.capturing && safe(VB.Input.capturing))) return;   // E3: reasignando una tecla
    if (ctx.introLeft > 0 && ctx.state === 'playing') { if (!e.repeat) ctx.introSkipReq = true; return; }   // UI-14: cualquier tecla salta la tarjeta
    // S3-C1: durante una repetición el teclado lo lee main.js (VB.Input: Intro / golpear salta, Esc sale); aquí nada (la hoja tapada
    // no recibe Intro ni flechas)
    if (ctx.replay && !panel && ctx.state !== 'paused') { if (e.key === 'Enter' || e.key === 'Tab' || String(e.key).indexOf('Arrow') === 0) e.preventDefault(); return; }
    if (ctx.state === 'playing' && !panel) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp' || ((k === 'Tab') && activeLayer())) {
      e.preventDefault(); if (k !== 'Tab' && vtNav(0, k === 'ArrowUp' ? -1 : 1, 'key')) return; if (k !== 'Tab' && mpage === 'prof' && ctx.state === 'menu' && !panel && pfGridV(k === 'ArrowUp' ? -1 : 1)) return; navMove(k === 'ArrowUp' || (k === 'Tab' && e.shiftKey) ? -1 : 1); return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { var dk = k === 'ArrowRight' ? 1 : -1; if (vtNav(dk, 0, 'key') || adjustFocused(dk) || vtNav(dk, 0, 'key', true)) e.preventDefault(); return; }
    // Vestuario: Z / X giran el muñeco mientras se mantienen
    if ((k === 'z' || k === 'Z' || k === 'x' || k === 'X') && mpage === 'look' && lk.on && ctx.state === 'menu' && !panel && noSheet() && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); if (!e.repeat) { lk.keySpin = k === 'z' || k === 'Z' ? -1 : 1; lkSpinBy(lk.keySpin * 0.25); lk.idle = 0; } return;
    }
    if ((k === 'f' || k === 'F') && mpage === 'prof' && ctx.state === 'menu' && !panel && noSheet() && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); pfPinToggle(); return; }
    if ((k === 'i' || k === 'I') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && infoKey()) { e.preventDefault(); return; }   // «i» de la fila (móvil)
    if ((k === 'q' || k === 'Q' || k === 'e' || k === 'E' || k === 'PageUp' || k === 'PageDown') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tq = activeTabs(); if (tq) { e.preventDefault(); tq.step(k === 'q' || k === 'Q' || k === 'PageUp' ? -1 : 1, 'key'); } return;
    }
    if (k === 'Enter') {
      var a = document.activeElement;
      if (a && a.tagName === 'BUTTON' && !a.closest('[hidden]')) { e.preventDefault(); a.click(); return; }
      // en el Vestuario, Intro sin foco solo enfoca (como A con el mando): pulsar la 1ª fila cambiaba su valor sin querer
      if (ctx.state === 'menu' && !panel && mpage === 'look') { e.preventDefault(); focusEl(pageFocus(), true); }
      else if (ctx.state === 'menu' && !panel) { var pf = pageFocus(); if (pf) pf.click(); }
      else if (ctx.state === 'paused' && !panel) ctx.actions.resume();
      else if (ctx.state === 'over' && endWait) endSkip();
      else if (ctx.state === 'over' && endPeek) setPeek(false);
      else if (ctx.state === 'over' && ctx.game && ctx.game.finished && !el.end.hidden) endPrimary();
    }
  }
  /** Teclado («i») y mando (X): la «i» de VB.Splat.helpFit es un <span> dentro del <button> de la fila (sin foco propio); si la fila
   *  enfocada la tiene, la despliega o la recoge como el toque. */
  /** V-LKSHEET: con una hoja de VB.Splat abierta (p. ej. el «⋯» del Vestuario) no corren los atajos de la página de detrás. */
  function noSheet() { return !(VB.Splat && VB.Splat.sheetOpen && VB.Splat.sheetOpen()); }
  function infoKey() {
    var a = document.activeElement, L = activeLayer();
    if (!a || !L || !L.contains(a) || !VB.Splat || !VB.Splat.infoToggle) return false;
    // V-QFOCUS: en Partido rápido el «?» (.sp-q, fuera del recorrido ↑/↓) se abre con X / «i» desde su fila enfocada
    var qb = a.parentElement && a.parentElement.classList.contains('sp-qrow') ? a.parentElement.querySelector(':scope>.sp-q') : null;
    if (qb && qb !== a && qb.getClientRects().length) { qb.click(); uiSound('click'); return true; }
    if (!VB.Splat.infoToggle(a)) return false;
    uiSound('click'); return true;
  }
  var navRep = { y: 0, x: 0, ty: 0, tx: 0 };
  function axisRepeat(v, key, tkey, dt) {
    var dir = v > 0.55 ? 1 : v < -0.55 ? -1 : 0;
    if (dir !== navRep[key]) { navRep[key] = dir; navRep[tkey] = 0.38; return dir; }
    if (!dir) return 0;
    navRep[tkey] -= dt; if (navRep[tkey] <= 0) { navRep[tkey] = 0.14; return dir; }
    return 0;
  }

  // =====================================================================
  //  API
  // =====================================================================

  // =====================================================================
  //  BANQUILLO Y CAMBIOS (6v6 con banquillo, sim g.subsOn; notes/titularidad-y-cambios.md §B.3-§B.6)
  //  Rótulo de TV de cada cambio, avisos de entrar / salir (Carrera), barra «En el banquillo» con ×3 y los saltos (main.js
  //  ctx.bench / ctx.actions.benchFast / benchSkip), velo «Simulando…», botón «Cambios n/6» de la pausa y su panel (Partido rápido).
  //  Todo el DOM y el CSS se crean aquí (subsDom); sin banquillo no se ve nada.
  // =====================================================================
  var SUB_WHY = { max: 'Ya no quedan cambios en este set', used: 'Ya entró y salió en este set', pair: 'Solo puede cambiarse por el jugador al que sustituyó',
    back: 'Ya volvió a pista en este set', libero: 'Ahora está el líbero: espera a que salga', me: 'Eres tú', bench: 'No está en pista', off: 'Este partido no tiene banquillo', role: 'Tiene que ser del mismo puesto' };
  var ROLE_AB = { S: 'Col', OPP: 'Opu', OH: 'Rec', MB: 'Cen', L: 'Líb' };
  var subUI = { tq: [], tv: null, tvT: 0, bar: null, veil: null, pn: null, pick: null, msg: '', msgT: 0, stat: {}, key: '', vkey: '', pkey: '' };
  // (18-nov-2026, móvil · partido: el CSS de todo esto —antes la cadena SUB_CSS que se inyectaba aquí— vive en index.html, bloque
  //  «SPLAT · CAMBIOS Y BANQUILLO», con el sistema SPLAT)
  /** Apellido corto para las filas de «Cambios» (la última palabra, hasta 10 letras sin cortar con puntos). */
  function subShort(nm) { var w = String(nm || '').trim().split(/\s+/); var s = w[w.length - 1] || ''; return s.length > 10 ? w[0].slice(0, 10) : s; }
  function subsDom() {
    if (subUI.tv || !el.app) return;
    subUI.tv = document.createElement('div'); subUI.tv.id = 'subTv'; subUI.tv.setAttribute('aria-hidden', 'true'); el.app.appendChild(subUI.tv);
    var bb = subUI.bar = document.createElement('div'); bb.id = 'benchBar'; bb.hidden = true; bb.setAttribute('role', 'group'); bb.setAttribute('aria-label', 'En el banquillo');
    bb.innerHTML = '<span class="bb-t">En el banquillo</span><button type="button" id="bbFast" aria-pressed="false"></button><button type="button" id="bbIn"></button><button type="button" id="bbEnd"></button>';
    el.app.appendChild(bb);
    var vl = subUI.veil = document.createElement('div'); vl.id = 'ffVeil'; vl.hidden = true; vl.setAttribute('role', 'status');
    vl.innerHTML = '<div><b>Simulando…</b><span id="ffTxt"></span></div>'; el.app.appendChild(vl);
    bb.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'bbFast' && ctx.actions.benchFast) ctx.actions.benchFast();
      else if (b.id === 'bbIn' && ctx.actions.benchSkip) ctx.actions.benchSkip('in');
      else if (b.id === 'bbEnd' && ctx.actions.benchSkip) ctx.actions.benchSkip('end');
      subUI.key = ''; if (b.blur) b.blur();
    });
    // pausa: «Cambios n/6» (Partido rápido 6v6 con banquillo)
    if (el.btnResume && !$('btnPSubs')) {
      var pb = document.createElement('button'); pb.className = 'ghost'; pb.id = 'btnPSubs'; pb.hidden = true; pb.textContent = 'Cambios';
      el.btnResume.insertAdjacentElement('afterend', pb); el.btnPSubs = pb;
      pb.addEventListener('click', function () { if (ctx.state !== 'paused') return; uiSound('click'); openSubs(false); });
    }
    // panel «Cambios» (mismo marco que los paneles: #panel, Volver, foco y mando)
    var host = el.panel && el.panel.querySelector('.sheet');
    if (host && !$('pnSubs')) {
      var pn = subUI.pn = document.createElement('div'); pn.id = 'pnSubs'; pn.hidden = true;
      // («Anular cambio» arriba, junto al aviso: a 844×390 abajo quedaba fuera del panel)
      pn.innerHTML = '<div class="sb-head"><p class="sb-msg" id="sbMsg" aria-live="polite"></p><div class="sb-foot" data-nav><button class="ghost" type="button" id="sbCancel" hidden>Anular cambio</button></div></div>' +
        '<div class="sb-cols"><div><h3>En pista</h3><div class="sb-list" data-nav id="sbOn"></div></div><div><h3>Banquillo</h3><div class="sb-list" data-nav id="sbBench"></div></div></div>';
      host.appendChild(pn);
      PANELS.subs = ['pnSubs', 'Partido', 'Cambios'];
      pn.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b || b.disabled) return;
        if (b.id === 'sbCancel') { subsCancel(); return; }
        var id = b.getAttribute('data-pid'); if (id == null) return;
        subsPickId(+id, b.getAttribute('data-on') === '1');
      });
    }
    // Ajustes · Juego: «Cambios de tu equipo» (solo se ve con Formato 6 contra 6; renderOpts)
    var ms = document.querySelector('[data-opt="msTiming"]');
    if (ms && !document.querySelector('[data-opt="subs6"]')) ms.insertAdjacentHTML('afterend', '<button class="opt" data-opt="subs6"><span>Cambios de tu equipo<small>6 contra 6: los hace el entrenador o solo los que pidas en la pausa</small></span><span class="seg" data-seg="subs6"></span></button>');
  }
  function pnm(p, short) { if (!p) return ''; return p.num + (!short && p.name ? ' <span class="sbt-nm">' + escT(p.name) + '</span>' : ''); }
  function pnmT(p) { return p ? p.num + (p.name ? ' ' + p.name : '') : ''; }
  function subOrd(n) { n = n | 0; return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  /** Rótulo de TV: «Cambio | ▲ 7 Nico | ▼ 4 Leo», «Doble cambio» en dos filas, «Sacador», y «Cambios: n/6». */
  function subsTv(g, list, now) {
    if (!subUI.tv || !list.length) return;
    if (!now && subUI.tvT > 0.3) { if (subUI.tq.length < 4) subUI.tq.push(list); return; }   // otro rótulo en pantalla: en cola
    var e0 = list[0], w = e0.why, h = list.length > 1 ? 'Doble cambio' : w === 'serve' ? 'Sacador' : 'Cambio', rows = '';
    for (var i = 0; i < list.length; i++) rows += '<div class="sbt-row"><span class="sbt-in">' + pnm(list[i].inP) + '</span><span class="sbt-out">' + pnm(list[i].outP) + '</span></div>';
    var last = list[list.length - 1];
    subUI.tv.className = ''; void subUI.tv.offsetWidth;
    subUI.tv.innerHTML = '<div class="sbt-h">' + h + '</div><div class="sbt-b">' + rows + '<div class="sbt-n">Cambios: ' + (last.n | 0) + '/' + (VB.Sim && VB.Sim.SUB_MAX || 6) + '</div></div>';
    subUI.tv.className = 'show t' + (e0.team === 1 ? 1 : 0);
    subUI.tvT = 2.5;
  }
  /** Eventos 'sub' (en grupos del mismo paso: el doble cambio), 'lineup' y 'subDenied' de un frame. */
  function subsEvents(g, events) {
    var grp = [], gl = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'point' && g.subsOn) {   // puntos y errores por jugador para el panel
        var sp = e.player && e.how === 'error' ? e.player : null;
        if (sp) (subUI.stat[sp.id] || (subUI.stat[sp.id] = { err: 0 })).err++;
      }
      if (e.type === 'sub') {
        if (grp.length && grp[0].team !== e.team) { gl.push(grp); grp = []; }
        grp.push(e);
        if (e.team === 0 && (e.meIn || e.meOut)) {
          var tx = e.meIn ? '¡Entras! Por el ' + pnmT(e.outP) : 'Te cambian: entra el ' + pnmT(e.inP);
          callout(tx, 0, 'tip', 2.2); srSay(tx);
        } else srSay('Cambio ' + (e.team === 0 ? 'en tu equipo' : 'del rival') + ': entra el ' + e.inP.num + ', sale el ' + e.outP.num);
        if (e.team === 0) subUI.pick = null;
      } else if (e.type === 'lineup' && e.team === 0 && (e.meIn || e.meOut)) {
        var lt = e.meIn ? '¡Entras! Sales de inicio en el ' + subOrd(e.set) + ' set' : 'Empiezas el ' + subOrd(e.set) + ' set en el banquillo';
        callout(lt, 0, 'tip', 2.4); srSay(lt);
      } else if (e.type === 'subDenied' && e.team === 0) {
        var dt = 'Cambio anulado: ' + (SUB_WHY[e.why] || 'no se puede').toLowerCase();
        callout(dt, 0, 'neg', 2.0); srSay(dt);
      } else if (e.type === 'newMatch') { subUI.stat = {}; subUI.tq.length = 0; }
    }
    if (grp.length) gl.push(grp);
    gl.sort(function (a, b) { return a[0].team - b[0].team; });   // el de tu equipo primero (y el otro, en cola)
    for (var k = 0; k < gl.length; k++) subsTv(g, gl[k]);
  }
  /** Cada frame: rótulo, barra del banquillo y velo del salto. */
  function subsTick(g, dt) {
    if (!subUI.tv) return;
    if (subUI.tvT > 0) {
      subUI.tvT -= Math.max(0, dt);
      if (subUI.tvT <= 0.3 && subUI.tv.className.indexOf('out') < 0) subUI.tv.className += ' out';
      if (subUI.tvT <= 0) { subUI.tv.className = ''; if (subUI.tq.length) subsTv(g, subUI.tq.shift(), true); }
    }
    var B = ctx.bench || {}, on = !!(g && g.subsOn && g.ctrlOut && g.career && !g.demo && (ctx.state === 'playing') && !(ctx.introLeft > 0));
    var ff = on && !!B.ff, k = on ? (ff ? 'f' : 'b') + (B.fast ? 1 : 0) + device() + padFam() : '';
    if (subUI.key !== k) {
      subUI.key = k;
      subUI.bar.hidden = !on || ff;
      if (el.app) el.app.classList.toggle('sb-bar', on && !ff);
      if (on) {
        var gl = G(), d = device();
        var kk = function (x) { return d === 'touch' ? '' : ' ' + x; };
        var f = $('bbFast'); f.innerHTML = '×3' + kk(gl.jump); f.classList.toggle('on', !!B.fast); f.setAttribute('aria-pressed', B.fast ? 'true' : 'false');
        f.setAttribute('aria-label', B.fast ? 'Velocidad normal' : 'Ver a ×3');
        $('bbIn').innerHTML = 'Saltar hasta que entres' + kk(gl.hit); $('bbEnd').innerHTML = 'Saltar al final' + kk(gl.sw);
      }
    }
    if (subUI.veil.hidden === ff) subUI.veil.hidden = !ff;
    if (ff) {
      var vk = g.score[0] + '-' + g.score[1] + '|' + g.setNo;
      if (subUI.vkey !== vk) { subUI.vkey = vk; var tt = $('ffTxt'); if (tt) tt.textContent = g.score[0] + '-' + g.score[1] + ' (' + subOrd(g.setNo) + ' set)'; }
    }
    if (subUI.msgT > 0) { subUI.msgT -= ctx.realDt || 0; }
  }
  /** Pausa: «Cambios {quedan}/6» solo en el Partido rápido 6v6 con banquillo. */
  function subsPauseBtn(g) {
    var b = el.btnPSubs; if (!b) return;
    var S = VB.Sim, ok = !!(g && g.subsOn && !g.career && !g.demo && !g.watch0 && g.size === 6 && S && S.subsLeft);
    b.hidden = !ok;
    if (ok) b.textContent = 'Cambios ' + S.subsLeft(g, 0) + '/' + (S.SUB_MAX || 6);
  }
  function subsOk() { var g = ctx.game; return !!(g && g.subsOn && !g.career && !g.demo && VB.Sim && VB.Sim.requestSub); }
  function openSubs(pick) {
    if (!subsOk() || !subUI.pn) return false;
    subUI.pick = null; subUI.msg = '';
    if (pick) { var g = ctx.game, S = VB.Sim; for (var z = 1; z <= 6 && !subUI.pick; z++) { var p = S.onCourt(g, 0, z), inf = S.subInfo(g, 0, p); if (inf && inf.canOut && p !== g.ctrlBase) subUI.pick = p; } if (subUI.pick) subUI.msg = 'Ahora elige quién entra por el ' + subUI.pick.num; }
    openPanel('subs', 'paused');
    renderSubs();
    return true;
  }
  function subsCancel() { var g = ctx.game; if (!subsOk()) return; VB.Sim.cancelSub(g, 0); subUI.pick = null; subUI.msg = 'Cambio anulado'; uiSound('back'); renderSubs(); }
  function subsPickId(id, onC) {
    var g = ctx.game, S = VB.Sim; if (!subsOk()) return;
    var p = null; for (var i = 0; i < g.roster[0].length; i++) if (g.roster[0][i].id === id) p = g.roster[0][i];
    if (!p) return;
    if (onC) { subUI.pick = subUI.pick === p ? null : p; subUI.msg = subUI.pick ? 'Ahora elige quién entra por el ' + p.num : ''; uiSound('click'); renderSubs('[data-pid="' + p.id + '"]'); return; }
    if (!subUI.pick) { subUI.msg = 'Elige primero quién sale (En pista)'; uiSound('back'); renderSubs(); return; }
    var r = S.requestSub(g, 0, subUI.pick, p);
    if (r) { subUI.msg = SUB_WHY[r] || 'No se puede'; uiSound('back'); }
    else { subUI.msg = 'Cambio pedido: entra el ' + p.num + ' por el ' + subUI.pick.num + ' al acabar la jugada'; subUI.pick = null; uiSound('click'); srSay(subUI.msg); }
    renderSubs();
  }
  function roleOK(a, b) { return a === b || (a === 'OH' && b === 'OPP') || (a === 'OPP' && b === 'OH'); }
  function renderSubs(focusSel) {
    var g = ctx.game, S = VB.Sim; if (!subUI.pn || !subsOk()) return;
    var q = g.subQ && g.subQ[0], hon = '', hb = '', z, p, inf;
    var row = function (p, onC, zone) {
      inf = S.subInfo(g, 0, p) || {};
      var me = p === g.ctrlBase || (g.ctrl === p && p.role === 'L' && g.liberoFor[0] === g.ctrlBase), lib = p.role === 'L';
      // (con alguien de pista elegido, solo los del mismo puesto u OH↔OPP: la IA reparte todo por p.role)
      var can = onC ? inf.canOut && !me && !lib : inf.canIn && !!subUI.pick && roleOK(subUI.pick.role, p.role);
      if (!onC && !subUI.pick) can = inf.canIn;   // (sin nadie elegido se puede tocar igual: avisa de elegir primero)
      var st = subUI.stat[p.id] || {}, P = stats && stats.p && stats.p[p.id];
      var cls = 'sb-p' + (subUI.pick === p ? ' sel' : '') + (q && (q.out === p || q.inn === p) ? ' q' : '');
      var lab = (onC ? 'Zona ' + zone + ', ' : '') + 'dorsal ' + p.num + (p.name ? ' ' + p.name : '') + ', ' + (ROLE_AB[p.role] || '') + (me ? ', tú' : '');
      return '<button type="button" class="' + cls + '" data-pid="' + p.id + '" data-on="' + (onC ? 1 : 0) + '"' + (can ? '' : ' disabled') + ' aria-label="' + escT(lab) + '">' +
        '<span class="sb-z">' + (onC ? 'Z' + zone : '') + '</span><b>' + p.num + (me ? '<em>Tú</em>' : '') + '</b>' + (p.name ? '<span class="sb-nm">' + escT(subShort(p.name)) + '</span>' : '') + '<span class="sb-r">' + (ROLE_AB[p.role] || '') + '</span>' +
        '<span class="sb-st">' + ((P && P.pts) | 0) + ' pts | ' + (st.err | 0) + ' err' + (inf.state === 'out' ? ' | fuera' : inf.state === 'in' ? ' | entró' : '') + '</span><span></span>' +
        '<i class="sb-f"><u style="width:' + Math.round(100 * Math.min(1, p.tired || 0)) + '%"></u></i></button>';
    };
    for (z = 1; z <= 6; z++) { p = S.onCourt(g, 0, z); hon += row(p, true, z); }
    var B = S.benchOf(g, 0); for (var i = 0; i < B.length; i++) hb += row(B[i], false, 0);
    $('sbOn').innerHTML = hon; $('sbBench').innerHTML = hb;
    var m = subUI.msg || (q ? 'Cambio pedido: entra el ' + q.inn.num + ' por el ' + q.out.num + ' al acabar la jugada' : 'Quedan ' + S.subsLeft(g, 0) + ' de ' + (S.SUB_MAX || 6) + ' cambios en este set. Toca quién sale y luego quién entra');
    $('sbMsg').textContent = m;
    $('sbCancel').hidden = !q;
    if (focusSel) { var f = subUI.pn.querySelector(focusSel); if (f && !f.disabled) focusEl(f, kbNow() || ctx.inputDevice === 'gamepad'); }
    else if (subUI.pick === null && document.activeElement && subUI.pn.contains(document.activeElement) === false) focusLayer();
    else if (document.activeElement === document.body || !subUI.pn.contains(document.activeElement)) focusLayer();
    else if (document.activeElement && document.activeElement.disabled) focusLayer();
    subsPauseBtn(g);
  }

  // ZOOM DE CÁMARA (17-nov-2026): main.js avisa en cada paso (rueda, + / -, stick derecho o la lupa táctil) y sale «Zoom | 3/5» abajo en el
  // centro 1,1 s (estilo del chip de la jugada; el número late si cambió; en el tope, sin latido)
  var zm = { t: 0, el: null, n: null };
  function zoomHint(n, changed) {
    if (!zm.el) { zm.el = document.getElementById('zmHint'); zm.n = document.getElementById('zmN'); }
    if (!zm.el || !zm.n) return;
    zm.n.textContent = ((n | 0) + 1) + '/5';
    if (!zm.el.classList.contains('on')) zm.el.classList.add('on');
    if (changed) restartAnim(zm.n, 'bump');
    zm.t = 1.1;
  }
  function zoomTick(rdt) {
    if (!(zm.t > 0) || !zm.el) return;
    zm.t = ctx.state === 'playing' ? zm.t - rdt : 0;
    if (zm.t <= 0) { zm.t = 0; zm.el.classList.remove('on'); }
  }
  // =====================================================================
  //  AVISO DE COLOCADOR (salto con impulso, v1.12.0; notes/ui_main.md «Salto con impulso»)
  // =====================================================================
  // Hoja .sp-panel pequeña, sin velo (una capa transparente encima solo para que no se pulse lo de detrás). Sale una vez por sesión
  // si juegas de colocador (main.js startMatch con 6v6 y ctrlRole 'S'; career-ui.js al abrir el hub de la Carrera de pista siendo
  // colocador) con la «Colocación en salto con diana» apagada y el aviso sin quitar («No volver a mostrar» = jsetNote false).
  // ?setnote=1 lo saca siempre (capturas). Teclado: flechas / Tab, Intro o Espacio, Esc = «Ahora no» (escucha en captura en window,
  // registrada al cargar ui.js, antes que career-ui.js e input.js). Mando: main.js manda las intenciones a noteNav. Toque: ≥ 44 px.
  var sn = { open: false, t0: 0, cb: null, from: '', root: null, toast: null, toastT: 0, shown: false, prev: null, ax: 0 };
  var SN_FORCE = /[?&]setnote=1(&|$)/.test(location.search || '');
  function snButtons() { return sn.root ? Array.prototype.slice.call(sn.root.querySelectorAll('[data-sn]')) : []; }
  function snFocus(b, kb) {
    if (!b) return;
    try { b.focus({ preventScroll: true }); } catch (e) { }
    snButtons().forEach(function (x) { if (x !== b) x.classList.remove('kf'); });
    if (kb) b.classList.add('kf');
  }
  function snStep(d) {
    var L = snButtons(), i = L.indexOf(document.activeElement), j = i < 0 ? 0 : Math.max(0, Math.min(L.length - 1, i + d));
    if (j === i) { uiSound2('arrowEdge', d); return; }
    snFocus(L[j], true); hoverSound();
  }
  function snBuild() {
    if (sn.root) return;
    var r = document.createElement('div'); r.id = 'setNote'; r.hidden = true;
    r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-labelledby', 'snH'); r.setAttribute('aria-describedby', 'snT');
    r.innerHTML = '<div class="sp-panel sn-sheet"><div class="sn-txt"><p class="sp-k">Eres colocador</p><h2 class="sp-h" id="snH">Coloca con la diana</h2>' +
      '<p class="sn-t" id="snT"></p><small class="sn-s">Lo cambias cuando quieras en Ajustes, Juego.</small></div>' +
      '<div class="sn-acts"><button type="button" class="sp-patch" data-sn="on"><span class="sp-l"><span class="sp-t">Activar</span></span></button>' +
      '<div class="sn-row"><button type="button" class="sp-btn sp-sm sp-teal" data-shape="2" data-sn="later"><span class="sp-t">Ahora no</span></button>' +
      '<button type="button" class="sp-btn sp-sm sp-cream" data-shape="5" data-sn="never" aria-label="No volver a mostrar"><span class="sp-t"><span class="ph-hide">No volver a mostrar</span><span class="ph-only">No mostrar más</span></span></button></div></div></div>';
    r.addEventListener('click', function (e) {
      e.stopPropagation();
      var b = e.target && e.target.closest ? e.target.closest('[data-sn]') : null;
      if (!b || performance.now() - sn.t0 < 400) return;   // (los primeros 400 ms no cuentan: el toque o el botón que lo abrió)
      snClose(b.getAttribute('data-sn'));
    });
    r.addEventListener('pointerdown', function (e) { e.stopPropagation(); snButtons().forEach(function (x) { x.classList.remove('kf'); }); });
    (document.getElementById('app') || document.body).appendChild(r);
    sn.root = r;
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(r); } catch (e) { } }
  }
  function snToast(txt) {
    if (!sn.toast) { var t = document.createElement('div'); t.id = 'snToast'; t.setAttribute('role', 'status'); (document.getElementById('app') || document.body).appendChild(t); sn.toast = t; }
    sn.toast.textContent = txt; sn.toast.classList.add('on');
    clearTimeout(sn.toastT); sn.toastT = setTimeout(function () { if (sn.toast) sn.toast.classList.remove('on'); }, 2500);
  }
  /** Abre el aviso. o = {from: 'match' | 'career'}; cb(elección: 'on' | 'later' | 'never') al cerrarlo. false si no toca (ya salió en esta
   *  sesión, la diana ya está puesta, el aviso está quitado, online): quien llama sigue como siempre. */
  function setterNote(o, cb) {
    o = o || {};
    if (sn.open || !ctx) return false;
    var st = ctx.settings || {};
    if (!SN_FORCE && (sn.shown || st.jsetAim === true || st.jsetNote === false || ctx.net)) return false;
    snBuild();
    sn.shown = true; sn.open = true; sn.cb = typeof cb === 'function' ? cb : null; sn.from = o.from || '';
    sn.prev = document.activeElement; sn.t0 = performance.now(); sn.ax = 0;
    var gl = GLYPH[device()] || GLYPH.keyboard;
    sn.root.querySelector('.sn-t').innerHTML = 'En la colocación en salto puedes llevar la diana, como en el remate: muévela con ' + gl.aim + ' y la colocación va al atacante que tenga más cerca; el marcador de color dice adónde. Si no la tocas, todo sigue como ahora.';
    sn.root.hidden = false; sn.root.classList.remove('in');
    // móvil: tinte del 20 % detrás mientras está abierto (VB.Splat.modal); en PC, como siempre
    if (sn.rel) { sn.rel(); sn.rel = null; }
    if (VB.Splat && VB.Splat.modal && VB.Splat.phone && VB.Splat.phone()) sn.rel = VB.Splat.modal(sn.root);
    requestAnimationFrame(function () { if (sn.root && sn.open) sn.root.classList.add('in'); });
    snFocus(sn.root.querySelector('[data-sn="on"]'), device() !== 'touch');
    uiSound('open');
    return true;
  }
  function snClose(choice) {
    if (!sn.open) return;
    sn.open = false; sn.root.hidden = true; sn.root.classList.remove('in');
    if (sn.rel) { sn.rel(); sn.rel = null; }
    if (choice === 'on') { if (ctx.actions.setSetting) ctx.actions.setSetting('jsetAim', true); snToast('Colocación con diana activada'); uiSound('click'); }
    else if (choice === 'never') { if (ctx.actions.setSetting) ctx.actions.setSetting('jsetNote', false); uiSound('back'); }
    else uiSound('back');
    snButtons().forEach(function (x) { x.classList.remove('kf'); });
    var cb = sn.cb; sn.cb = null;
    if (!cb && sn.prev && sn.prev.focus && document.contains(sn.prev)) { try { sn.prev.focus({ preventScroll: true }); } catch (e) { } }
    sn.prev = null;
    if (cb) { try { cb(choice); } catch (e) { console.error('[VB][ERROR] setterNote: ' + e); } }
  }
  function snKey(e) {
    if (!sn.open) return;
    e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    var k = e.key || '';
    if (k === 'Tab' || k.indexOf('Arrow') === 0 || k === 'Enter' || k === ' ' || k === 'Escape' || k === 'Backspace') e.preventDefault();
    if (e.repeat && (k === 'Enter' || k === ' ' || k === 'Escape')) return;
    if (performance.now() - sn.t0 < 400) return;
    ctx.inputDevice = 'keyboard';
    if (k === 'ArrowUp' || k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) snStep(-1);
    else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'Tab') snStep(1);
    else if (k === 'Enter' || k === ' ') { var a = document.activeElement; if (a && a.hasAttribute && a.hasAttribute('data-sn')) snClose(a.getAttribute('data-sn')); else snFocus(snButtons()[0], true); }
    else if (k === 'Escape' || k === 'Backspace') snClose('later');
  }
  window.addEventListener('keydown', snKey, true);
  /** Mando (main.js, con el aviso abierto en vez de UI.nav / CareerUI.nav): stick o cruceta recorren, A acepta, B = «Ahora no». */
  function snNav(it) {
    if (!sn.open || !it) return;
    if (performance.now() - sn.t0 < 400) { sn.ax = 1; return; }   // (y el stick tiene que volver al centro antes del primer paso)
    if (it.device !== 'gamepad') return;
    var v = Math.abs(it.my || 0) > Math.abs(it.mx || 0) ? -(it.my || 0) : (it.mx || 0), d = v > 0.55 ? 1 : v < -0.55 ? -1 : 0;
    if (Math.abs(v) < 0.3) sn.ax = 0;
    if (d && !sn.ax) { sn.ax = 1; snStep(d); }
    var ok = it.navOk != null ? it.navOk : it.hit, bk = it.navBack != null ? it.navBack : it.jump && !it.jset;
    if (ok) { var a = document.activeElement; snClose(a && a.hasAttribute && a.hasAttribute('data-sn') ? a.getAttribute('data-sn') : 'on'); }
    else if (bk) snClose('later');
  }

  VB.UI = {
    /** Salto con impulso (v1.12.0): aviso de colocador (ver setterNote) y su entrada (main.js). */
    setterNote: setterNote,
    noteOpen: function () { return sn.open; },
    noteNav: snNav,
    noteBack: function () { if (!sn.open) return false; snClose('later'); return true; },
    zoomHint: zoomHint,
    banner: banner,
    callout: callout,
    sep: sepHTML,          // separadores con diseño (career-ui.js también): sep(trozos, 'd'|'v'|'s'|'c', html)
    bootReady: bootReady,
    preboot: preboot,
    bootBusy: function () { return bootBusy(); },
    _boot: function () { return { stage: bootStage, ready: Math.round(bootT0), fly: Math.round(bootFly - 760), gymEnd: Math.round(gym.t1 || 0), fonts: fontsReady }; },
    /** Rectángulo (px CSS) del banner visible o null (UI-04; para el encuadre del plano del punto, CAM-18). */
    bannerRect: bannerRect,
    /** Ambiente de Carrera (P3): zonas ocupadas por las fichas de elección y el rótulo de tarjeta (px CSS) o null; lector de pantalla;
     *  tarjetas del partido en curso (copia) para la hoja / el recap. */
    ambChoiceRect: ambChoiceRect, cardRect: cardRect, srSay: function (t) { srSay(String(t == null ? '' : t)); },
    ambCards: function () { return amb.cards.map(function (c) { return { team: c.team, pid: c.pid, num: c.num, name: c.name, who: c.who, color: c.color, reason: c.reason, set: c.set, score: c.score.slice(), penalty: c.penalty }; }); },
    /** main.js: el jugador recorta la pausa del punto (SIM-03, quedan 0,3 s): lo del punto se funde ya (120 ms). */
    onHoldSkip: function () {
      if (banT > 0 && (banKind === 'point' || banKind === 'set' || banKind === 'court')) fadeBanner(0.12);
      if (bugT > 0) hideBug(true);
      if (pres && pres.kind === 'point') pres = null;
    },
    /** Pruebas: estado del precalentado de estilos {i, f, done, t0, t1}. */
    _gym: function () { return gym; },
    /** Pruebas (UI-09): estado del sello {t, x, y (px del centro sin la subida), ox, oy, dir, cost}. */
    _stamp: function () { return stp; },
    /** B2: retrato de un atleta (req de VB.CareerUI.portraitReq o portraitReqMatch) como HTML; se completa solo con `vb-portrait`. */
    portraitHTML: function (req, cls, alt) { return portraitHTML(req, cls, alt); },
    /** B2: req del retrato de tu n.º 1 (idx 0) o n.º 2 (idx 1) en Partido rápido; null para el rival. */
    portraitReqMatch: function (team, idx, px) { return portraitReqMatch(team, idx, px); },
    /** UI-14 (main.js): empieza / acaba la tarjeta de presentación. */
    introStart: function (g, plan) { introStart(g, plan); },
    /** B5 (main.js, antes de introStart): plan de la previa (VB.Recap.introPlan con los datos de la partida) o null sin recap.js.
     *  o = opciones de startMatch (o.introKind = 'mini' | 'short' | 'long' lo fuerza). */
    introPlan: function (g, o) { return introPlan(g, o); },
    /** Pruebas (C4): rótulos cinéticos {n, kind ('ace'|'muro'|'sp'|'mp'), team, t (performance.now)}. */
    _rot: function () { return { n: rot.n, kind: rot.kind, team: rot.team, t: rot.t }; },
    /** Pruebas / hoja de B6 (T19): resultado de VB.Retos.endMatch del último partido (null si no contaba) y del perfil. */
    _retoEnd: function () { return retoEnd; },
    _profEnd: function () { return profEnd; },
    /** B6: hoja final de un partido de Carrera (main.js, tras VB.Career.matchDone). x = {tbl, myId, short, pos, next, bar, ses}. */
    endCareer: endCareer,
    /** S3-C1: cortinilla de VB.Replay (false si ya hay una en marcha) y fin de las jugadas vistas desde la hoja (foco al «Ver»). */
    replayWipe: replayWipe, replayDone: replayDone,
    /** Pruebas (B6): último modelo de la hoja, sus datos y la pestaña abierta. */
    _recap: function () { return recapM ? { M: recapM, tab: endTab, blocks: recapM.blocks, buttons: recapM.buttons, tabs: recapM.tabs } : null; },
    /** D1: el menú en la página Retos (escena debug=retos; tab = 'hoy' | 'maestria'). */
    openRetos: function (tab) {
      if (ctx.state !== 'menu') return false;
      if (tab === 'hoy' || tab === 'maestria') { rtTab = tab; rtTabSave(tab); }
      mstack.length = 0; mstack.push({ p: 'main', f: 'btnPlay' }); mstack.push({ p: 'play', f: 'btnRetos' });
      setPage('retos'); focusSoon(pageFocus(), false);
      return true;
    },
    /** Pruebas (B5): último plan de la previa y beat por el que va. */
    _intro: function () { return introUI.plan ? { kind: introUI.plan.kind, dur: introUI.plan.dur, beats: introUI.plan.beats, b: introUI.plan.b, c: introUI.plan.c, t: introUI.plan.t, bi: introUI.bi, on: introUI.on } : null; },
    introEnd: function (skipped) { introEndUI(skipped); },
    /** Pruebas (UI-11): estadística por jugador del partido (id → {num, team, pts, kills, blocks, aces}) y estado de la hoja. */
    _endStats: function () { return { p: stats.p, gate: endGate, wait: endWait, peek: endPeek, dock: ctx.uiDock || null }; },
    /** Pruebas (UI-13): estado de la cortinilla {ph 0 parada|1 entra|2 tapa|3 sale, cut}; _wipeLog(true) empieza a registrar. */
    _wipe: function () { return wp; },
    _wipeLog: function (on) { wp.log = on ? [] : null; return wp.log; },
    /** Cortinilla de pantalla (450 ms) con la acción a mitad; false si ya hay una en marcha. */
    wipe: function (team, cb) { return wipeRun(team == null ? 2 : team, cb); },
    /** Pruebas (UI-10): indicador de borde {on, x, y, ang (rad, centro → jugador)}. */
    _offArrow: function () { return offA; },
    /** Pruebas (UI-20): última caja del aviso anclado {x, y, w, h} (px CSS), solo la tecla (konly) y zonas de los botones táctiles. */
    _prompt: function () { return { x: prLast.x, y: prLast.y, w: prLast.w, h: prLast.h, konly: prKonly, side: prSide, tb: tbx.L.slice() }; },
    isPanelOpen: function () { return !!panel; },
    /** Pausa del Partido rápido 6v6 con banquillo: abre el panel «Cambios» (pick: con el primero de pista ya elegido, pruebas). */
    openSubs: function (pick) { try { return openSubs(!!pick); } catch (e) { console.error('[VB][ERROR] UI.openSubs: ' + e); return false; } },
    /** E7: abre Acerca de ('news' | 'credits'). */
    openAbout: function (tab) { openAbout(tab, panel ? panelFrom : ctx.state); },
    /** Pruebas (E7): {seen, returning, auto: 'off' | 'waiting' | 'shown'}. */
    _about: function () { return { seen: seenGet(), returning: wasReturning, auto: aboutAuto }; },
    /** Pruebas (E3): panel abierto, pila de vuelta, pestaña de Ajustes, pestañas compactas y captura en curso. */
    _settings: function () { return { panel: panel, stack: pstack.map(function (x) { return x.name; }), tab: setTabs ? setTabs.get() : '', compact: !!(el.setTabs && el.setTabs.classList.contains('tabs-ic')), capturing: capturing, ctl: ctlView, glyph: { hit: GLYPH.keyboard.hitT, jump: GLYPH.keyboard.jumpT, padHit: GLYPH.gamepad.hitT } }; },
    /** Portada del menú libre (sin panel, sin cortinilla, sin telón): install.js espera a esto para su aviso (nunca encima de «Primer partido»). */
    menuIdle: function () { return ctx.state === 'menu' && !panel && !wp.ph && mpage === 'main' && !sn.open && !(bootStage < 2 && bootBusy()); }, // (!sn.open: nada encima del aviso de colocador)
    /** Pestañas reutilizables (ver «PESTAÑAS» arriba): VB.UI.tabs(host, items, opts) → api {get, set, step, refresh, hint, focus}. */
    tabs: makeTabs,
    /** Mando: −1 con LB/L1 pulsado, +1 con RB/R1 (o Y). Para cambiar de pestaña con it.switchPlayer fuera de ui.js. */
    padTabDir: padTabDir,
    /** Página del menú visible: 'main' | 'play' | 'quick' | 'gym' | 'look'; menuGo(p) abre una (apilando la actual), menuBack() vuelve. */
    menuPage: function () { return mpage; },
    /** D4 (account.js tras una bajada con ganchos) y Vestuario: vuelve a leer el récord y la portada (B3) y repinta el menú. */
    refreshMenu: function () { last.rec = null; last.navh = null; last.pf = null; pfDirty = true; heroDirty = true; if (ctx && ctx.state === 'menu') { renderMenu(); if (mpage === 'prof') pfRender(true); } },
    /** D2: el menú en la página Perfil (chip de la portada, escena debug=prof). o = {tab: 'vestuario' | 'insignias' | 'entreno' | 'carrera' | 'retos' | 'sedes' | 'hitos'}. */
    openProfile: openProfile,
    /** Pruebas (D2): estado de la página y del chip. */
    _prof: function () { return { tab: pf.tab, sel: pf.sel, pins: pf.pins.slice(), q: pf.q.slice(), note: el.pfNote ? el.pfNote.textContent : '', sum: pfSum ? { lvl: pfSum.lv.lvl, have: pfSum.have, total: pfSum.total, vit: pfSum.vit.map(function (i) { return i.aid; }), un: pfSum.un, show: pfSum.show } : null, dirty: pfDirty }; },
    /** Pruebas (B3): portada con «Continuar carrera» {on, open: abierta desde la portada}. */
    _hero: function () { return { on: heroOn, open: contOpen, dirty: heroDirty }; },
    menuGo: function (p, o) { if (p === 'look') return openLook(o); if (p === 'prof') return openProfile(o); if (p === 'play' || p === 'quick' || p === 'gym') menuGo(p); if (p === 'online' && ctx.state === 'menu' && !panel && el.mpOnline) { if (mpage === 'main') { mstack.push({ p: 'main', f: 'btnPlay' }); setPage('play'); } menuGo('online'); } },
    /** Vestuario (página 'look'): o = {who: 'career', hall, tc, back} desde la Carrera; {tab, venue, item, pick} para ?debug=look
     *  (tab: pelo|cabeza|cara|cuerpo|brazos|piernas|colores; venue: hall|beach; item: id del catálogo que probar; pick: 1 | 2 | 'career').
     *  false si no se puede abrir (sin look.js, fuera del menú). */
    openLook: function (o) { return openLook(o); },
    /** Pruebas (Vestuario): estado de la página y de la copia de trabajo. */
    _look: function () { return { on: lk.on, who: lk.who, venue: lk.venue, tab: lk.tab, dirty: lk.dirty, nul: lk.nul, fit: lkClone(lk.fit), page: mpage, grid: lk.grid, slot: lk.slot, bd: lk.bd }; },
    menuBack: function () { return menuBack(); },
    /** Mando conectado / desconectado (main.js con Input.poll().padEvent). Al desconectarse jugando con él, input.js pausa:
     *  la hoja de pausa lo dice ("Mando desconectado") en el antetítulo, en vez del set y el tanteo. */
    padEvent: function (kind) {
      if (kind === 'disconnected') { padGone = true; if (el.pKick) el.pKick.textContent = 'Mando desconectado'; }
      else if (kind === 'connected') {
        padGone = false; padFamF = -999; GLYPH_PS = null;
        if (ctx.game && el.pKick) setSep(el.pKick, pauseKicker(ctx.game), 'd');
        if (ctx.state === 'playing') callout('Mando conectado', 0, 'good');
      }
    },
    init: function (c) {
      ctx = c; loadRecord(); role6Load();   // (6v6: puesto elegido en Controlar, make-the-cut.role6)
      cacheEls(); if (ctx.isTouch) el.app.classList.add('is-touch');
      if (ctx.debug) el.menu.classList.remove('intro'); // en depuración no hay relevo desde el telón

      function on(b, fn) { b.addEventListener('click', function (ev) { click(); fn(ev); }); }
      // B7: botón CHALLENGE (táctil, ratón); por encima de #touch para que el toque no llegue al joystick
      if (el.chal) el.chal.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (ctx.actions && ctx.actions.challenge) ctx.actions.challenge();
      });
      // menús v2: JUGAR → modos; Partido rápido → preparación; ¡A JUGAR! → partido (la Carrera la abre career-ui.js en #btnCareer)
      el.btnPlay.addEventListener('click', function () { menuGo('play'); });
      if (el.btnCont) on(el.btnCont, goCont);   // B3: «Continuar carrera» → hub de la Carrera en «Partido»
      // tarjeta Partido rápido: la preparación SIEMPRE en 2 contra 2 (la tarjeta 6 contra 6 deja el formato en 6v6; sin esto, mirar
      // esa tarjeta y volver dejaba el Partido rápido en 6v6). Dentro, la fila Formato se puede cambiar igual
      if (el.btnQuick) el.btnQuick.addEventListener('click', function () { if (ctx.settings.format !== '2v2') ctx.actions.setSetting('format', '2v2'); menuGo('quick'); });
      if (el.btnGo) el.btnGo.addEventListener('click', play);
      [el.btnPlayBack, el.btnQuickBack, el.btnGymBack].forEach(function (b) { if (b) b.addEventListener('click', function () { menuBack(); }); });
      // ONLINE (especialista net): tarjeta en Jugar solo si VB.NetLobby.menuOn() (publicación o ?online=1); su «Volver» sale de la página
      if (el.btnOnline && VB.NetLobby && el.mpOnline && safe(VB.NetLobby.menuOn)) { el.btnOnline.hidden = false; if (el.btnOnline.parentNode) el.btnOnline.parentNode.classList.add('has-onl'); el.btnOnline.addEventListener('click', function () { menuGo('online'); }); }
      if (el.btnOnlineBack) el.btnOnlineBack.addEventListener('click', function () { while (mpage === 'online' && menuBack()) { } });
      // E6: Entrenamiento (tarjeta de Jugar → página; fila → ejercicio; botones de la hoja final)
      if (el.btnGym) el.btnGym.addEventListener('click', function () { menuGo('gym'); });
      if (el.gymList) el.gymList.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('[data-drill]') : null; if (b) { uiSound('start'); goGym(b.getAttribute('data-drill')); } });
      if (el.gymList) el.gymList.addEventListener('pointerover', function (ev) { if (ev.pointerType !== 'mouse') return; var b = ev.target && ev.target.closest ? ev.target.closest('[data-drill]') : null; if (b && b !== gymHov) { gymHov = b; hoverSound(); } });
      if (el.btnGeAgain) el.btnGeAgain.addEventListener('click', function () {
        if (el.btnGeAgain.getAttribute('data-cdr')) { el.btnGeNext.click(); return; }   // sesión de la Carrera: el parche es «Siguiente sesión»
        uiSound('start'); if (isDrill()) goGym(ctx.game.drill.kind);
      });
      if (el.btnGeNext) el.btnGeNext.addEventListener('click', function () {
        var g = ctx.game;
        // sesión de la Carrera: la siguiente del plan (otra sesión; main.js startCareerDrill vuelve al hub si ya no se puede)
        if (g && g.careerDrill && !g.demo) { var cn = g.careerDrill.next; if (!cn) return; uiSound('start'); var fn = function () { ctx.actions.startCareerDrill(cn, !!g.autopilot); }; if (!wipeRun(2, fn) && !wp.cb) fn(); return; }
        var n = g && g.drill && VB.Gym && VB.Gym.nextOf ? VB.Gym.nextOf(g.drill.kind) : null; uiSound('start'); if (n) goGym(n);
      });
      if (el.btnGeList) el.btnGeList.addEventListener('click', function () { uiSound('back'); goGymList(ctx.game && ctx.game.drill ? ctx.game.drill.kind : null); });
      if (el.sqPick) el.sqPick.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('[data-pick]') : null; if (b) sqPick(+b.getAttribute('data-pick'), b.classList.contains('kf') ? true : null); });
      buildTabs();
      lkInit();   // Vestuario
      el.btnFirstTut.addEventListener('click', function () { click(); openPanel('tut', 'menu'); });
      el.btnFirstPlay.addEventListener('click', function () { uiSound('start'); goMatch(); });
      // Dificultad: ‹ baja y › sube (zonas propias, UI-06); un clic en el resto de la fila sigue avanzando en ciclo
      el.optDiff.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-d]') : null;
        if (a) { var d = +a.getAttribute('data-d'); stepDiff(d); restartAnim(a, 'hit'); }
        else changeOpt('difficulty', 1);
      });
      el.optPts.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-d]') : null;
        if (a) { stepOpt('setPoints', +a.getAttribute('data-d'), el.ptsVal); restartAnim(a, 'hit'); }
        else changeOpt('setPoints', 1);
      });
      if (el.optVenue) el.optVenue.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-d]') : null;
        if (a) { stepOpt('arena', +a.getAttribute('data-d'), el.venueVal); restartAnim(a, 'hit'); }
        else changeOpt('arena', 1);
      });
      if (el.optFmt) el.optFmt.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-d]') : null;
        if (a) { stepOpt('format', +a.getAttribute('data-d'), el.fmtVal); restartAnim(a, 'hit'); }
        else changeOpt('format', 1);
      });
      if (el.optCam6) el.optCam6.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-d]') : null;
        if (a) { stepOpt('cam6', +a.getAttribute('data-d'), el.cam6Val); restartAnim(a, 'hit'); }
        else changeOpt('cam6', 1);
      });
      // tarjeta 6 contra 6 de Jugar: la preparación del Partido rápido con el formato ya en 6 contra 6
      if (el.btn6v6) el.btn6v6.addEventListener('click', function () { ctx.actions.setSetting('format', '6v6'); menuGo('quick'); });
      el.optCtrl.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-d]') : null;
        if (a) { stepOpt('ctrlMode', +a.getAttribute('data-d'), el.ctrlVal); restartAnim(a, 'hit'); }
        else changeOpt('ctrlMode', 1);
      });
      var arrs = document.querySelectorAll('#optFmt .arr, #optCam6 .arr, #optDiff .arr, #optVenue .arr, #optPts .arr, #optCtrl .arr');
      for (var ai = 0; ai < arrs.length; ai++) arrs[ai].addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') uiSound2('arrowHover', +this.getAttribute('data-d') || 1); });
      on(el.btnTut, function () { openPanel('tut', 'menu'); });
      on(el.btnControls, function () { openPanel('ctl', 'menu'); });
      on(el.btnSettings, function () { openPanel('set', 'menu'); });
      if (el.btnSquad) on(el.btnSquad, function () { openPanel('squad', 'menu'); });
      if (el.sqBody) el.sqBody.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('button[data-up]') : null;
        if (!b || b.disabled || !VB.Prog) return;
        var i = +b.getAttribute('data-i'), k = b.getAttribute('data-up');
        if (VB.Prog.bump(i, k, 1)) { uiSound('click'); renderSquad(i + ':' + k); } else uiSound2('optHover');
      });
      if (el.sqBody) {
        // insignias: equipar / quitar (ratón, táctil, teclado y mando: son botones de [data-nav]) y detalle al enfocar o señalar
        el.sqBody.addEventListener('click', function (ev) {
          var b = ev.target && ev.target.closest ? ev.target.closest('button[data-bd]') : null;
          if (!b || !VB.Badges || !VB.Prog) return;
          var a = VB.Prog.squad()[+b.getAttribute('data-i')], id = b.getAttribute('data-bd'), r = a ? VB.Badges.toggle(a, id) : '';
          if (r) { VB.Prog.save(); uiSound(r === 'on' ? 'click' : 'back'); renderSquad(); return; }
          uiSound2('optHover');
          badgeInfo(b, a && VB.Badges.level(a, id) ? 'Sin huecos libres: quita otra insignia.' : 'Bloqueada.');
        });
        el.sqBody.addEventListener('focusin', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('button[data-bd]') : null; if (b) badgeInfo(b); });
        el.sqBody.addEventListener('pointerover', function (ev) { if (ev.pointerType !== 'mouse') return; var b = ev.target && ev.target.closest ? ev.target.closest('button[data-bd]') : null; if (b) badgeInfo(b); });
      }
      on(el.btnResume, function () { ctx.actions.resume(); });
      on(el.btnPControls, function () { openPanel('ctl', 'paused'); });
      on(el.btnPSettings, function () { openPanel('set', 'paused'); });
      // Reiniciar en dos pasos (un dedo que se escapa no tira el partido): 1r toque arma 2 s, el 2º reinicia. Sin confirm().
      on(el.btnRestart, function () {
        if (restartArm > 0 && performance.now() - restartArm < 2000) { disarmRestart(); if (ctx.game && ctx.game.retoOpts && !ctx.game.demo) goRestart(); else if (isDrill()) goGym(ctx.game.drill.kind); else goMatch(); return; }
        disarmRestart(); restartArm = performance.now();
        el.btnRestart.textContent = armTxt('reiniciar');
        el.btnRestart.classList.add('arm');
        restartTo = setTimeout(disarmRestart, 2000);
      });
      // (en la prueba, «Abandonar la prueba» también en dos pasos: la 2ª pulsación la da por suspendida, main.js toMenu)
      on(el.btnQuit, function () {
        if (isDrill()) { goGymList(ctx.game.drill.kind); return; }
        if (!isTrial() || (quitArm > 0 && performance.now() - quitArm < 2000)) { disarmRestart(); goMenu(); return; }
        disarmRestart(); quitArm = performance.now();
        el.btnQuit.textContent = armTxt('salir');
        el.btnQuit.classList.add('arm');
        restartTo = setTimeout(disarmRestart, 2000);
      });
      el.btnAgain.addEventListener('click', endPrimary);
      el.btnMenu.addEventListener('click', function () { uiSound('back'); goMenu(); });
      // «Cambiar opciones» o, en el reto del día, «Retos» (vuelve a #mpRetos)
      if (el.btnEndOpts) el.btnEndOpts.addEventListener('click', function () { uiSound('click'); if (el.btnEndOpts.getAttribute('data-act') === 'retos') goRetosList(); else goOptions(); });
      el.btnAgainAlt.addEventListener('click', function () {
        var d = el.btnAgainAlt.getAttribute('data-d'); uiSound('start');
        goMatch(d || null, undefined, true);
      });
      if (el.btnRetos) el.btnRetos.addEventListener('click', function () { menuGo('retos'); });
      // D2: perfil (chip de la portada → página; huecos: elegir, y en táctil un 2º toque fija en la vitrina)
      if (el.btnProf) el.btnProf.addEventListener('click', function () { if (ctx.state === 'menu' && !panel) menuGo('prof'); });
      if (el.btnProfBack) el.btnProfBack.addEventListener('click', function () { menuBack(); });
      if (el.pfPin) el.pfPin.addEventListener('click', function () { pfPinToggle(); });
      if (el.pfGrid) {
        el.pfGrid.addEventListener('focusin', function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest('[data-aid]') : null; if (b) pfSelect(b.getAttribute('data-aid')); });
        el.pfGrid.addEventListener('click', function (ev) {
          var b = ev.target && ev.target.closest ? ev.target.closest('[data-aid]') : null; if (!b) return;
          var aid = b.getAttribute('data-aid'), again = pf.sel === aid && pf.tapSel === aid;
          if (document.activeElement !== b) focusEl(b, false);
          pfSelect(aid);
          if (again && device() === 'touch') pfPinToggle(); else click();
          pf.tapSel = aid;
        });
      }
      if (el.btnRetosBack) el.btnRetosBack.addEventListener('click', function () { menuBack(); });
      if (el.rtBody) el.rtBody.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('button') : null; if (!b || !el.rtBody.contains(b)) return;
        if (b.getAttribute('data-reto') === 'day') { uiSound('start'); goReto(false); }
        else if (b.hasAttribute('data-rt')) click();
      });
      // tocar/clic durante la tarjeta de presentación la salta (UI-14; main.js la quita en el frame siguiente)
      window.addEventListener('pointerdown', function () { if (ctx.introLeft > 0 && ctx.state === 'playing') ctx.introSkipReq = true; }, { passive: true, capture: true });
      // tocar/clic durante la celebración final la salta
      window.addEventListener('pointerdown', function () { if (endWait) endSkip(); }, { passive: true });
      // S3-C1: tocar durante la repetición la salta (main.js la lee en el frame siguiente); el botón «Salir» (táctil) sale de todas
      window.addEventListener('pointerdown', function (ev) {
        if (!ctx.replay || ctx.state === 'paused' || panel) return;
        var ex = ev.target && ev.target.closest && ev.target.closest('#rpExit');
        if (ex) ctx.replaySkipReq = 'all'; else if (!ctx.replaySkipReq) ctx.replaySkipReq = true;
      }, { passive: true, capture: true });
      if (el.endPlays) el.endPlays.addEventListener('click', playsClick);
      el.btnMStats = $('btnMStats');
      if (el.btnMStats) el.btnMStats.addEventListener('click', function () { uiSound('click'); openMStats(); });
      el.btnActa = $('btnActa');
      if (el.btnActa) el.btnActa.addEventListener('click', function () { uiSound('click'); openActa(); });
      actaCheck(); if (VB.Account && VB.Account.onChange) VB.Account.onChange(actaCheck);
      el.btnPeek.addEventListener('click', function () { click(); setPeek(true); });
      spSheets();   // SPLAT: pausa y hojas finales (rótulos que se cambian con textContent → se vuelven a decorar)
      el.btnEndBack.addEventListener('click', function () { click(); setPeek(false); });
      el.btnPanelBack.addEventListener('click', function () { uiSound('back'); closePanel(); });
      // sonido suave al pasar por encima de un botón de menú (solo ratón)
      var hb = document.querySelectorAll('.screen button');
      for (var h = 0; h < hb.length; h++) hb[h].addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') { if (this.classList.contains('opt')) uiSound2('optHover'); else hoverSound(); } });
      el.btnTutPrev.addEventListener('click', function () { click(); tutGo(tut.i - 1); });
      el.btnTutNext.addEventListener('click', tutNext);
      on(el.btnHudPause, function () { ctx.actions.pause(); });
      on(el.btnHudMute, function () { ctx.actions.toggleMute(); });
      // opciones: clic en un valor concreto o en la fila (siguiente valor). E3: delegado en el panel (Ajustes y las filas que
      // pinta renderCtl en Controles), más «Restablecer», las teclas reasignables y las filas que abren otro panel
      el.panel.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.closest ? ev.target : null; if (!t) return;
        var rb = t.closest('.opt-reset[data-reset]'); if (rb && el.panel.contains(rb)) { resetClick(rb); return; }
        var wbt = t.closest('.opt-wipe[data-wipe]'); if (wbt && el.panel.contains(wbt)) { wipeClick(wbt); return; }
        var ks = t.closest('.kslot'); if (ks && el.panel.contains(ks)) { ctlSlot(ks); return; }
        var ab = t.closest('[data-ab]');
        if (ab && el.panel.contains(ab)) {
          var w = ab.getAttribute('data-ab'); if (w === 'old') abOld = !abOld; else abLic = abLic === w ? '' : w;
          click(); renderAbout(); var nb = el.abBody.querySelector('[data-ab="' + w + '"]'); if (nb) focusEl(nb, kbNow() || ctx.inputDevice === 'gamepad'); return;
        }
        var b = t.closest('.opt'); if (!b || !el.panel.contains(b) || b.classList.contains('info')) return;
        if (b.hasAttribute('data-go')) { click(); goRow(b); return; }
        var k = b.getAttribute('data-opt'), sp = t.closest('[data-i]'); if (!k) return;
        if (SLIDERS[k] && t.closest('.trk')) {
          var r = t.closest('.trk').getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), c = SLIDERS[k];
          ctx.actions.setSetting(k, slSnap(k, c.min + f * (c.max - c.min)));
          if (!volFeedback(k)) click();
          return;
        }
        // fila General (antes Sonido): el altavoz (o la fila entera, con Intro) es el silencio general; ←/→ y la pista, el volumen
        if (b.classList.contains('opt-snd')) { ctx.actions.toggleMute(); click(); return; }
        if (sp && OPT[k]) changeOpt(k, 0, +sp.getAttribute('data-i')); else changeOpt(k, 1, SLIDERS[k] ? 'wrap' : null);
      });
      if (el.btnAbOk) el.btnAbOk.addEventListener('click', function () { uiSound('back'); closePanel(); });
      if (el.btnVer) el.btnVer.addEventListener('click', function () { if (ctx.state !== 'menu' || panel) return; click(); openAbout('news', 'menu'); });
      window.addEventListener('keydown', onKey);
      window.addEventListener('vb-portrait', onPortrait);   // B2: retratos que llegan de la cola de main.js
      [el.pause, el.end, el.panel, el.gymEnd].forEach(function (n) { var sh = n && n.querySelector('.sheet'); if (sh) sh.addEventListener('scroll', function () { checkMore(n); }, { passive: true }); });
      if (el.panel) [].forEach.call(el.panel.querySelectorAll('.sp-scroll'), function (s) { s.addEventListener('scroll', spMore, { passive: true }); });   // SPLAT · PANELES
      [el.endSum, el.endStatsTab, el.endPlays].forEach(function (n) { if (n) n.addEventListener('scroll', endMore, { passive: true }); });   // B6: desvanecido del panel
      window.addEventListener('pointerdown', function () { var p = document.querySelectorAll('.kf'); for (var i = 0; i < p.length; i++) p[i].classList.remove('kf'); }, { passive: true });
      document.addEventListener('focusout', function (e) { if (e.target && e.target.classList) e.target.classList.remove('kf'); });
      window.addEventListener('gamepadconnected', function () { last.navh = null; last.ctls = null; padFamF = -999; GLYPH_PS = null; if (ctx.state === 'menu') renderMenu(); if (panel === 'ctl') { ctlView = 'gamepad'; renderCtl(); } });
      this.onSettings(ctx.settings);
      newsAuto();   // E7: novedades una vez por versión (jugador que vuelve)
      retoAuto();   // reto del día al abrir el juego (una vez al día, sin medalla de hoy)
      var pn = ctx.params.panel || (ctx.debug === 'tutorial' ? 'tut' : ctx.debug === 'controls' ? 'ctl' : ctx.debug === 'settings' ? 'set' : '');
      if (ctx.params.menu === 'play' || ctx.params.menu === 'quick') setTimeout(function () { mstack.push({ p: 'main', f: 'btnPlay' }); if (ctx.params.menu === 'quick') { mstack.push({ p: 'play', f: 'btnQuick' }); } setPage(ctx.params.menu); focusLayer(); }, 0);
      if (pn && PANELS[pn]) setTimeout(function () { if (pn === 'about') openAbout(ctx.params.tab === 'credits' ? 'credits' : 'news', 'menu'); else openPanel(pn, 'menu'); if (ctx.params.step) tutGo(+ctx.params.step - 1); }, 0);
    },
    onSettings: function (s, k) {
      // E3: teclas y botones reasignados → glifos de los avisos y, con Controles abierto, sus filas
      if (k == null || k === 'keys' || k === 'padKeys') { rebuildGlyph(); if (k && panel === 'ctl' && !capturing) renderCtl(); }
      if (k == null || k === 'lessMotion') el.app.classList.toggle('rm', rm());
      el.btnHudMute.classList.toggle('muted', !!s.muted);
      el.icoSound.innerHTML = s.muted ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#f7f2ea" stroke-width="2" stroke-linecap="round"/>'
        : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="#f7f2ea" stroke-width="2" stroke-linecap="round"/>';
      // UI-16: tamaño del HUD (variable --hs en #app: marcador, contador, avisos, botones y hojas) y destellos suaves
      hudSet = [1, 1.15, 1.3].indexOf(+s.hudScale) >= 0 ? +s.hudScale : 1;
      vpFit(); // --hs = ajuste × --vs (pantallas grandes)
      el.app.classList.toggle('soft-flash', !!s.softFlash);
      if (!arguments[1] || arguments[1] === 'arena' || arguments[1] === 'mapBeach' || arguments[1] === 'mapHall') applyVenue(); // sede: nombre en el menú y demás textos fijos
      kitTick();
      hudFit();
      renderOpts();
      [el.pause, el.end, el.panel].forEach(function (n) { if (n && !n.hidden) { fitSheet(n); checkMore(n); } });
    },
    setQuality: function (q) {
      // B4: calidad baja (rank 0) → #app.q-low: las hojas entran y salen sin clip-path (solo translate y opacidad: compositor del móvil)
      if (el.app) el.app.classList.toggle('q-low', !!(q ? q.rank === 0 : ctx.quality && ctx.quality.rank === 0));
      if (panel === 'set') renderOpts(); vigTick();
    },
    resize: function () { vpFit(); offA.obsF = -999; tbx.ok = false; tbx.f = -9999; hudFit(); [el.pause, el.end, el.panel].forEach(function (n) { if (n && !n.hidden) { fitSheet(n); checkMore(n); } }); endMore(); if (panel) fitAllTabs(); if (lk.on) { fitTabs(lkTabs); lkMore(); lkPlace(); } tbRect = coachRect = guideRect = null; joyR = null; promptW = 0; },
    onState: function (s, prev) {
      shown = '';
      // UI-04: la pausa aparta banner, pestaña y aviso corto; al volver solo reaparecen si les quedaban > 0,4 s
      if (s === 'paused' && prev === 'playing') {
        held = { ban: banT, bug: bugT, call: calloutT };
        el.banner.classList.add('held'); el.pbug.classList.add('held'); el.callout.classList.add('held');
      } else if (prev === 'paused' && held) {
        el.banner.classList.remove('held'); el.pbug.classList.remove('held'); el.callout.classList.remove('held');
        if (held.ban > 0 && banT > 0 && banT <= 0.4) hideBanner();
        if (held.bug > 0 && bugT > 0 && bugT <= 0.4) { bugT = 0; el.pbug.className = ''; }
        if (held.call > 0 && calloutT > 0 && calloutT <= 0.4) { calloutT = 0; el.callout.className = ''; }
        held = null;
      }
      if (s !== 'paused') padGone = false;
      if (s === 'playing') {
        if (prev !== 'paused') hideBanner();
        if (panel) { panel = null; tutStop(); }
        pstack.length = 0; if (capCancel) capCancel();
        var a = document.activeElement; if (a && a.blur && a.tagName === 'BUTTON') a.blur(); // que el Espacio no pulse un botón oculto
      }
      if (s !== 'menu' && lk.on) lkClose();   // el Vestuario solo vive en el menú (guarda y apaga la vista previa)
      if (s === 'menu') { panel = null; pstack.length = 0; tutStop(); if (prev && prev !== 'menu') menuReset(); lkCheckPend = true; heroDirty = true; pf.checkPend = true; pfDirty = true; last.pf = null; } // (al volver de un partido; no en los setState('menu') del arranque)
      else { contOpen = false; crWasOpen = false; }   // (B3: la Carrera abierta desde la portada se cierra al empezar un partido)
    },
    onGameStart: function (g) {
      if (role6Pend && g && !g.demo) applyRole6();   // 6v6: goMatch llegó antes de que empezara el partido (telón de arranque)
      last = {}; banT = 0; hideBanner(); promptCur = ''; promptHold = 0; // las estadísticas se reinician con 'newMatch'
      pres = null; pendCourt = null; courtNext = null; newSetShown = 0; lastSub = ''; lastBig = null; bigGap = 9; atSP = false; lastBn2 = ''; bugT = 0; el.pbug.className = ''; held = null;
      coachSeen = {}; guideDone = {}; guideT = 0; el.guide.className = '';
      rallyHide();
      tbLabel1 = label1Of(g); // escenas de depuración que empiezan a mitad de jugada (p. ej. dive): no fiarse del valor por defecto
      ctx.endHold = false; el.skip.hidden = true; endGate = false; endWait = 0; endPeek = false; matchPtT = -99; el.end.classList.remove('peek', 'dock'); ctx.uiDock = null; dockKey = '';
      if (introUI.on && !(ctx.introLeft > 0)) introEndUI(true);
      if (!(ctx.introLeft > 0)) { el.app.classList.remove('intro-on'); introUI.hudT = 0; introUI.quiet = false; }
      el.end.classList.remove('win', 'lose');
      // E6 / E1: estado del ejercicio y del consejo de maestría de este partido
      geGate = false; geWait = false; gymTip = ''; gymTipT = 0; gymLast.t = NaN; gymLast.miss = ''; e1.k = ''; e1.t = 0; e1.on = false; lastSetJ = false;
      gymBestV = g && g.drill && !g.demo && !g.careerDrill ? gymBestOf(g.drill.kind) : 0;   // (entreno de la Carrera: sin «Récord», es del gimnasio)
      el.app.classList.toggle('drill-on', !!(g && g.drill && !g.demo)); last.drOn = !!(g && g.drill && !g.demo);
      kitTick();
    },
    /** Estadística del partido (escena debug=stats): la abre en cuanto se ve la hoja final. o = {set: 0-3, team: 0|1}. */
    openMatchStats: function (o) { msReq = o || {}; },
    /** Estadísticas sin banners (escenas de depuración que avanzan la sim sin pintar). */
    ingest: function (events, g) { for (var i = 0; i < events.length; i++) { msIngest(events[i], g); if (events[i].type === 'newMatch') stats = newStats(); else tally(events[i]); } },
    /** ONLINE (fase 6): estadísticas de la hoja con los eventos CONFIRMADOS (main.js, ya girados para el invitado con NetView.mapEvents).
     *  null = vaciar. El punto anulado por challenge se descuenta como en onEvents. Sin banners. */
    netTally: function (events) {
      if (!events) { stats = newStats(); if (VB.MatchStats && VB.MatchStats.reset) VB.MatchStats.reset(); return; }
      var ovr = false, i;
      for (i = 0; i < events.length; i++) if (events[i].type === 'challengeResult' && events[i].overturned) ovr = true;
      for (i = 0; i < events.length; i++) { var e = events[i]; if (ovr && e.type === 'point') untally(); tally(e); msIngest(e, ctx.game); }
    },
    _netStats: function () { return stats; },
    /** Auditoría: main.js vuelve a una copia de la hoja tras una vuelta (resync) con la IA de por medio. */
    netStatsSet: function (o) { if (o && o.t) stats = o; },
    /** Cierra el panel abierto. true si se ha consumido (Esc / B / Start). */
    back: function () {
      if (VB.Splat && VB.Splat.sheetOpen && VB.Splat.sheetOpen()) { uiSound('back'); return VB.Splat.closeTop(); }   // (móvil: primero la hoja de abajo)
      if (sn.open) { snClose('later'); return true; }   // (aviso de colocador: Esc / B = «Ahora no»)
      if (panel) { uiSound('back'); return closePanel(); }
      // E6: B / Esc en la hoja final del ejercicio = «Entrenamiento» (vuelve a la lista)
      if (ctx.state === 'over' && el.gymEnd && !el.gymEnd.hidden && ctx.game && ctx.game.drill) { uiSound('back'); goGymList(ctx.game.drill.kind); return true; }
      return menuBack();
    },
    /** Navegación con mando fuera del partido (main.js la llama con las intenciones del frame). */
    nav: function (it, dt) {
      if (bootStage === 0 && bootBusy()) return;               // telón entero: el menú aún no se ve
      if (capturing) { navRep.y = navRep.x = 0; return; }      // E3: reasignando un botón (input.js se traga los flancos)
      // E3: en los menús A acepta, B vuelve y LB / RB cambian de apartado SIEMPRE (botones fijos de poll: navOk / navBack / navTab),
      // se reasigne lo que se reasigne; con un input.js antiguo, GOLPEAR / SALTAR / CAMBIAR como antes
      var nOk = it && it.navOk != null ? it.navOk : it && it.hit, nBack = it && it.navBack != null ? it.navBack : it && it.jump && !it.jset;
      if (endWait) { if (it && (nOk || nBack || it.hit || it.jump || it.confirm || it.switchPlayer)) endSkip(); return; }
      if (endPeek && it && (nOk || nBack || it.hit || it.jump || it.confirm)) { setPeek(false); return; }
      if (!it || it.device !== 'gamepad') { navRep.y = navRep.x = 0; return; }
      if (!activeLayer()) return;
      var dy = axisRepeat(it.my || 0, 'y', 'ty', dt), dx = axisRepeat(it.mx || 0, 'x', 'tx', dt);
      if (dy && !vtNav(0, -dy, 'pad') && !(mpage === 'prof' && ctx.state === 'menu' && !panel && pfGridV(-dy))) navMove(-dy);
      if (dx && !vtNav(dx, 0, 'pad') && !adjustFocused(dx)) vtNav(dx, 0, 'pad', true);   // (móvil: columna de pestañas, api.vnav)
      if (it.jset && mpage === 'prof' && ctx.state === 'menu' && !panel) { if (noSheet()) pfPinToggle(); }   // D2: X = fijar en la vitrina
      else if (it.jset && !(mpage === 'look' && ctx.state === 'menu' && !panel)) infoKey();   // X = abrir / cerrar la «i» de la fila (móvil)
      var td = it.navTab || 0; if (!td && it.switchPlayer) td = padTabDir();
      if (td) { var tp = activeTabs(); if (tp) tp.step(td, 'pad'); }
      if (mpage === 'look' && lk.on && ctx.state === 'menu' && !panel && noSheet()) lkPad(it, dt);   // X = al azar, stick derecho = girar
      if (nOk) { var a = document.activeElement; if (a && a.tagName === 'BUTTON' && !a.closest('[hidden]')) a.click(); else if (!(a && a.hasAttribute && a.hasAttribute('data-focus') && activeLayer() && activeLayer().contains(a))) focusLayer(); }
      if (nBack) { if (!this.back() && ctx.state === 'paused') ctx.actions.resume(); } // volver: B/○ (fijo), no X/□ (COLOCAR)
      if (ctx.state === 'menu' && last.navDev !== 'gamepad') { last.navDev = 'gamepad'; last.navh = null; renderMenu(); }
    },
    /** dt = tiempo de juego (0 en pausa/congelado: los banners se quedan). */
    update: function (g, dt, events) {
      if (ctx.net && ctx.state === 'over') onlineEndSync();   // (online: rótulo de la revancha)
      if (zm.t > 0) zoomTick(ctx.realDt || 1 / 60);   // (aviso del zoom de cámara: tiempo real)
      if (!g) return;
      if ((ctx.frame & 31) === 7) kitTick();   // por si players cambia la equipación de la CPU por su cuenta
      onEvents(g, events);
      syncScreens(g);
      if (msReq && ctx.state === 'over' && !panel && !el.end.hidden && !isOut(el.end)) { var mq = msReq; msReq = null; openMStats(mq); }
      if (!gym.done) gymTick();
      if (bootStage < 2) tryReveal();
      if (ctx.state !== 'menu') hud(g, dt);
      if (amb.ch || amb.cardT > 0) ambTick(g, dt);
      if ((ctx.frame & 15) === 3 && (amb.cards.length || amb.sb[0] || amb.sb[1])) ambSbTick();
      subsTick(g, dt);
      sbLiveTick(g);
      rpTick();
      if ((ctx.state === 'playing' || ctx.state === 'over') && !rpv.on) presUpdate(g, dt);   // (S3-C1: la cámara pinta la repetición)
      // en pausa no se ve ningún banner, pestaña ni aviso corto (tampoco los que llegan con la pausa ya puesta: escenas de depuración)
      else if (ctx.state === 'paused' && held) {
        if (!el.banner.classList.contains('held')) el.banner.classList.add('held');
        if (!el.pbug.classList.contains('held')) el.pbug.classList.add('held');
        if (!el.callout.classList.contains('held')) el.callout.classList.add('held');
      }
      if (banT > 0) {
        banT -= dt;
        if (banT <= 0.3 && !banOut) { banOut = true; el.banner.classList.add('out'); }
        if (banT <= 0) hideBanner();
      }
      if (bugT > 0) {
        bugT -= dt;
        if (bugT <= 0.25 && !bugOut) { bugOut = true; el.pbug.classList.add('out'); }
        if (bugT <= 0) el.pbug.className = '';
      }
      if (calloutT > 0) { calloutT -= Math.max(dt, 0); if (calloutT <= 0) el.callout.className = ''; }
      var rdt = ctx.realDt || 0;
      stampTick(rdt);
      introTick(rdt);
      wipeTickRun(rdt);
      if (wp.ph && wp.cut && ctx.state !== 'playing' && ctx.state !== 'over') wipeOff();   // pausa a mitad de cortinilla
      if (guideT > 0) { guideT -= rdt; if (guideT <= 0.3 && el.guide.className === 'show') el.guide.className = 'out'; if (guideT <= 0) el.guide.className = ''; }
      endHoldTick();
      if (gymTipT > 0) gymTipT -= rdt;
      if (geWait) geTick();
      if ((ctx.frame & 7) === 3) dockTick();
      // la hoja puede cambiar de alto tras abrirse (fuentes, cifras, celebración que se aparta): el desvanecido se revisa a menudo
      if ((ctx.frame & 15) === 5) { if (!el.panel.hidden) checkMore(el.panel); if (!el.end.hidden) checkMore(el.end); if (!el.pause.hidden) checkMore(el.pause); }
      if (ctx.state === 'menu' && (ctx.frame & 63) === 0) renderMenu();
      lkTick(rdt);
      pfTick(rdt);
      if (ctx.state === 'menu' && (ctx.frame & 7) === 2 && mpage !== 'play' && mpage !== 'look' && !contOpen && VB.CareerUI && VB.CareerUI.isOpen && safe(VB.CareerUI.isOpen)) { mstack.length = 0; mstack.push({ p: 'main', f: 'btnPlay' }); setPage('play'); }
      // B3: la Carrera se ha cerrado (desde la portada o desde Jugar): la portada vuelve a leer la carrera (y el foco a #btnCont)
      if (ctx.state === 'menu' && (ctx.frame & 7) === 3 && VB.CareerUI && VB.CareerUI.isOpen) {
        var crO = !!safe(VB.CareerUI.isOpen);
        if (crWasOpen && !crO) { if (contOpen) contBack(); else heroDirty = true; }
        crWasOpen = crO;
      }
      if ((ctx.frame & 7) === 0) sbDimTick(g);
      if (ctx.frame % 15 === 4) tabTitle(g);   // E7: título de la pestaña (solo escribe si cambia el tanteo o el estado)
      if ((ctx.frame & 31) === 1) vigTick();
      if ((ctx.frame & 31) === 0 && !el.app.classList.contains('is-touch') && VB.Input && VB.Input.isTouchActive && safe(VB.Input.isTouchActive)) el.app.classList.add('is-touch');
    }
  };
})();
