/* =====================================================================
 * MAKE THE CUT — js/main.js   (owner: ui_main)
 * Arranque, renderer, bucle con simulación de paso fijo a 120 Hz,
 * reparto de eventos a los módulos, calidad adaptativa (con histéresis)
 * y escenas de depuración deterministas:
 *   ?debug=menu|serve|rally|spike|block|point|ace|setpoint|switch|over|end|
 *          mobile|pause|tutorial|controls|settings|toss|jumpserve|dive|doll (maqueta del muñeco nuevo, js/doll.js; &view=fila|poses|cara|cuerpo)|
 *          look (Vestuario abierto en el menú; &tab=pelo|cabeza|cara|cuerpo|brazos|piernas|colores &venue=hall|beach &item=<id> &pick=1|2|career)
 *   &seed=N  &live=1  &quality=low|medium|high  &maxdt=0.25  &fps=1  &clock=1 (serve/hud con regla de 8 s)
 *   &diff=easy|normal|hard  &panel=tut|ctl|set  &step=N (tutorial)
 * Ver CONTRACT.md para el orden por frame y las interfaces.
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var THREE = window.THREE;
  var Sim = VB.Sim;
  // Gestión de color moderna: los colores hex de los materiales se interpretan como sRGB
  // (las texturas de color deben llevar .encoding = THREE.sRGBEncoding).
  if (THREE && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  var STEP = 1 / ((VB.C && VB.C.SIM_HZ) || 120);

  // ---------- Parámetros de URL ----------
  var Q = {};
  try { location.search.replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); Q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1)); }); } catch (e) { }

  // dt máximo por frame (s). ?maxdt=0.25 solo para pruebas en entornos lentos (Chrome headless + SwiftShader)
  var MAX_DT = Q.maxdt ? Math.min(0.5, Math.max(0.02, +Q.maxdt || 0.05)) : 0.05;
  var MAX_STEPS = Math.ceil(MAX_DT / STEP) + 2;

  // 4 niveles (Fácil, Normal, Difícil, Experto); VB.DIFF_ORDER lo da sim.js
  var DIFFS = (VB.DIFF_ORDER && VB.DIFF_ORDER.slice()) || ['easy', 'normal', 'hard', 'expert'];

  // ---------- Contexto compartido ----------
  var isTouch = false;
  try { isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0); } catch (e) { }
  var isMobile = false;
  try { isMobile = isTouch && Math.min(screen.width || 9999, screen.height || 9999) < 900; } catch (e) { }
  if (Q.debug === 'mobile') { isTouch = true; isMobile = true; }

  // E3: ajustes que solo valen para este dispositivo (make-the-cut.device; ver DEFAULTS)
  var DEVICE_KEYS = ['resScale', 'fpsCap', 'showFps', 'touchSize', 'padDead'];
  var ctx = VB.ctx = {
    THREE: THREE,
    container: document.getElementById('stage'),
    canvas: null, renderer: null, scene: null, camera: null,
    width: 1, height: 1,
    quality: null,              // ver QUALITY
    isTouch: isTouch, isMobile: isMobile,
    state: 'menu',              // 'menu' | 'playing' | 'paused' | 'over'
    game: null,                 // partido actual (VB.Sim.createGame)
    timeScale: 1,               // escala del tiempo de juego (cámara la usa para cámara lenta)
    realDt: 0, gameDt: 0, time: 0, frame: 0, fps: 60,
    debug: Q.debug || (Q.net ? 'net' : null), params: Q, frozen: false,   // (?net=bc: partida online de prueba, ver startNetTest)
    portraitBlock: false,       // móvil en vertical durante el partido: se detiene la simulación
    renderFn: null,             // si un módulo (arena) quiere post-proceso, pone aquí function(ctx){...}
    inputDevice: isTouch ? 'touch' : 'keyboard', // último dispositivo usado ('keyboard'|'gamepad'|'touch'), lo lee la UI
    settings: loadSettings(),
    actions: {},                // startMatch, pause, resume, toMenu, restart, setSetting, toggleMute
    // Atajos que implementa la cámara (camera.js). Seguros si no existen.
    shake: function (amount, dur) { if (VB.CameraRig && VB.CameraRig.shake) VB.CameraRig.shake(amount, dur); },
    slowmo: function (scale, realSeconds) { if (VB.CameraRig && VB.CameraRig.slowmo) VB.CameraRig.slowmo(scale, realSeconds); },
    // E3 (sprint 5): movimiento reducido = ajuste «Menos movimiento» (lessMotion 'on' | 'off' | 'auto' = lo que pida el sistema).
    // Propiedad PROPIA de ctx (camera.js la lee con hasOwnProperty); la recalculan setSetting('lessMotion') y el cambio del sistema
    reduceMotion: false,
    renderScale: 1              // escala de render en uso (E3: Ajustes · Imagen · Resolución la enseña; la escribe applyQuality)
  };
  var mqReduce = null;
  try { mqReduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { }
  function calcReduce() { var m = ctx.settings.lessMotion; return m === 'on' ? true : m === 'off' ? false : !!(mqReduce && mqReduce.matches); }
  ctx.reduceMotion = calcReduce();
  try { if (mqReduce) { var onRM = function () { ctx.reduceMotion = calcReduce(); }; if (mqReduce.addEventListener) mqReduce.addEventListener('change', onRM); else if (mqReduce.addListener) mqReduce.addListener(onRM); } } catch (e) { }

  // E3 (sprint 5): valores por defecto de TODOS los ajustes (loadSettings y ctx.actions.resetSettings). Las claves de
  // DEVICE_KEYS se guardan aparte, en make-the-cut.device (solo este dispositivo: account.js no la sube), y no en make-the-cut.settings:
  // un móvil no hereda los 30 fps ni el 50 % de resolución del PC. keys/padKeys guardan SOLO las diferencias con las teclas y
  // botones de fábrica (input.js las sanea). aimSet / msTiming: E1 (colocación dirigida; timing en ms en el sello, solo UI).
  function DEFAULTS() {
    return { muted: false, difficulty: 'normal', quality: 'auto', showHelp: true, coachTips: true, coachCalls: true, setPoints: 25, kitShirt: 0xff5a2c, kitAccent: 0xffb238, kitShorts: 0x191b22, kitPattern: 'diag', ctrlMode: 'both', ctrlPlayer: 0, format: '2v2', cam6: '3p', camSens: 1, sfxVol: 1, musicVol: 0.75,
      camStable: false, rumble: true, hudScale: 1, softFlash: false, arena: Q.debug ? 'hall' : 'beach', arenaV: 2, beachLight: 'dia',
      volume: 1, crowdVol: 0.85, resScale: 0, fpsCap: 0, showFps: false, camDist: 'normal', camCuts: 'all', lessMotion: 'auto', cbColors: false, ballStyle: 'clasico',
      keys: {}, padKeys: {}, padDead: 0.18, touchSize: 1, aimSet: true, jsetAim: false, jsetNote: true, msTiming: false, mapHall: Q.debug ? 'palau' : 'rand', mapV: 1, mapBeach: 'platja', subs6: 'auto',
      replays: 'auto', camZoom: 2, ambient: 'full' };   // ambient: Ambiente de Carrera ('full' Completo | 'calm' Tranquilo | 'off' Apagado; js/ambiente.js). S3-C1: repeticiones ('auto' bolas de set y de partido | 'end' solo en «Jugadas» | 'off'; Ajustes · Juego)
    // jsetAim / jsetNote (v1.12.0, salto con impulso): colocación en salto con diana (sim opts.jsetAim; Ajustes · Juego, por defecto no)
    // y si sale el aviso de colocador (VB.UI.setterNote; «No volver a mostrar» lo apaga, «Restablecer» lo vuelve a encender)
    // mapHall / mapBeach: sede de cada tipo (js/venues.js: 'palau' | … y 'platja' | 'fanals' | …, o 'rand' = al azar); Ajustes · Imagen.
    // El tipo (`arena`) sigue siendo lo único que va a la sim; la sede solo cambia el escenario. Lo desconocido vuelve a la de serie.
  }
  /** keys / padKeys: objeto plano de como mucho 16 acciones (13 de teclado desde el zoom, 17-nov-2026); teclado = arrays de ≤ 2 cadenas de ≤ 24 caracteres, mando = arrays
   *  de ≤ 1 entero 0-11. Cualquier otra cosa → {} (de fábrica). Lo semántico (tecla reservada, repetida…) lo sanea input.js. */
  function cleanBinds(m, pad) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
    var out = {}, n = 0;
    for (var a in m) {
      if (!Object.prototype.hasOwnProperty.call(m, a)) continue;
      var v = m[a];
      if (++n > 16 || a.length > 16 || !Array.isArray(v) || v.length > (pad ? 1 : 2)) return {};
      for (var i = 0; i < v.length; i++) {
        if (pad ? !(typeof v[i] === 'number' && v[i] === (v[i] | 0) && v[i] >= 0 && v[i] <= 11) : !(typeof v[i] === 'string' && v[i].length <= 24)) return {};
      }
      out[a] = v.slice();
    }
    return out;
  }
  function clamp01(v, def) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : def; }

  function loadSettings() {
    // camSens: 0.5..1.5 (rapidez de seguimiento de la cámara; la lee camera.js si quiere)
    // sfxVol/musicVol: 0..1 (los lee audio.js en onSettings)
    // Accesibilidad (UI-16): camStable (cámara sin temblores ni sacudidas; la lee camera.js), rumble (vibración de mando y
    // móvil; input.js), hudScale (1 | 1,15 | 1,3: tamaño del HUD y de las hojas; ui.js), softFlash (destellos suaves; arena/fx/ui)
    // coachTips: consejos del partido (franja de arriba). Se ven hasta la primera victoria: ui.js los apaga al ganar el 1r partido
    // y se pueden volver a encender en Ajustes · Juego.
    var s = DEFAULTS();
    // beachLight: luz de la playa ('dia' mediodía | 'tarde' sol bajo y cálido; arena.js la lee en onSettings y al montar, ?luz= manda)
    // arena: sede ('hall' Palau del Mar | 'beach' Platja Llarga; ?map=beach en pruebas). Desde el 10-nov-2026 la Playa es el
    // escenario por defecto del 2v2 (decisión de Ferran); el 6v6 se juega siempre en el pabellón y la Carrera
    // siempre en la playa (forceVenue), mande lo que mande el ajuste. Las escenas de depuración
    // siguen en el pabellón para que las capturas y las pruebas sean comparables.
    var saved = false;
    var o = null;
    try { var raw = localStorage.getItem('make-the-cut.settings'); if (raw) { saved = true; o = JSON.parse(raw); if (!o || typeof o !== 'object') o = null; for (var k in o) if (k in s && DEVICE_KEYS.indexOf(k) < 0 && typeof o[k] === typeof s[k]) s[k] = o[k]; } } catch (e) { o = null; }
    // ajustes de ESTE dispositivo (E3): make-the-cut.device
    try { var dv = JSON.parse(localStorage.getItem('make-the-cut.device') || 'null'); if (dv && typeof dv === 'object') for (var dk = 0; dk < DEVICE_KEYS.length; dk++) { var kk = DEVICE_KEYS[dk]; if (kk in dv && typeof dv[kk] === typeof s[kk]) s[kk] = dv[kk]; } } catch (e) { }
    // Jugador nuevo (sin ajustes guardados ni partidos jugados): empieza en Fácil. Normal contra un novato
    // es un muro (simtest: un bot novato gana ~30 % de los puntos en Normal y ~54 % en Fácil).
    // Las escenas de depuración siguen en Normal para que las capturas sean comparables.
    var rec = null; try { rec = JSON.parse(localStorage.getItem('make-the-cut.record') || 'null'); } catch (e) { }
    if (!saved && !Q.debug) {
      if (!rec || !(rec.played > 0)) s.difficulty = 'easy';
    }
    // migración arenaV 2 (una sola vez, para todos): los ajustes guardados de antes pasan a la Playa. Luego se respeta lo que se elija.
    if (o && !(o.arenaV >= 2) && !Q.debug) s.arena = 'beach';
    // migración mapV 1 (15-nov-2026, una sola vez): el pabellón de serie pasa a «Al azar» (hechas a mano + sedes de club, un sorteo
    // por partido). Quien ya había elegido otra sede la conserva; quien vuelva a elegir Palau después, también.
    if (o && !(o.mapV >= 1) && !Q.debug && s.mapHall === 'palau') s.mapHall = 'rand';
    s.mapV = 1;
    // ajustes de antes de existir coachTips: quien ya ha ganado algún partido empieza sin consejos (como si acabara de ganar)
    if (!Q.debug && rec && rec.wins > 0 && !(o && 'coachTips' in o)) s.coachTips = false;
    if (DIFFS.indexOf(s.difficulty) < 0) s.difficulty = 'normal';
    if (s.subs6 !== 'manual') s.subs6 = 'auto';
    if (['auto', 'end', 'off'].indexOf(s.replays) < 0) s.replays = 'auto';   // S3-C1 (sin migración: lo que falte o no valga, 'auto')   // 6v6: cambios de tu equipo (ui.js «Cambios de tu equipo»: Automáticos / Solo los míos)
    s.jsetAim = s.jsetAim === true; s.jsetNote = s.jsetNote !== false;   // (salto con impulso: diana de colocación, no por defecto; aviso de colocador, sí)
    if (['full', 'calm', 'off'].indexOf(s.ambient) < 0) s.ambient = 'full';   // ambiente de Carrera (Ajustes · Juego; notes/ambiente.md §2F)
    if (['auto', 'high', 'medium', 'low'].indexOf(s.quality) < 0) s.quality = 'auto';
    s.camSens = Math.max(0.5, Math.min(1.5, +s.camSens || 1));
    s.sfxVol = Math.max(0, Math.min(1, isFinite(+s.sfxVol) ? +s.sfxVol : 1));
    s.musicVol = Math.max(0, Math.min(1, isFinite(+s.musicVol) ? +s.musicVol : 0.75));
    if ([1, 1.15, 1.3].indexOf(s.hudScale) < 0) s.hudScale = 1;
    if (s.beachLight !== 'tarde') s.beachLight = 'dia';
    var VV = VB.Venues;
    if (!VV || !VV.valid('hall', s.mapHall)) s.mapHall = 'rand';
    if (!VV || !VV.valid('beach', s.mapBeach)) s.mapBeach = 'platja';
    if ([11, 15, 21, 25].indexOf(s.setPoints) < 0) s.setPoints = 25;
    // equipación: solo colores de las paletas de ui.js (OPT.kit*) y diseños conocidos
    if (['diag', 'liso', 'franjas', 'rayas'].indexOf(s.kitPattern) < 0) s.kitPattern = 'diag';   // Partido rápido: puntos por set (sim: VB.Sim.SET_POINTS)
    if (s.ctrlMode !== 'one') s.ctrlMode = 'both';                      // control: los dos jugadores o solo uno (sim: g.ctrlMode)
    if (s.format !== '6v6') s.format = '2v2';                           // Partido rápido: 2 contra 2 o 6 contra 6 (sprint 3 del 6v6; fila «Formato»)
    if (s.cam6 !== 'tv') s.cam6 = '3p';                                 // cámara del 6v6: en 3ª persona (por defecto) o de televisión (camera.js; ?cam6= manda)
    s.ctrlPlayer = 0;                                                    // modo Uno: llevas siempre al n.º 1 (teams[0][0]); el ajuste antiguo (1 = el otro) se ignora
    // E3 (sprint 5): claves nuevas, cada una validada (lo corrupto vuelve a su valor por defecto)
    s.volume = clamp01(s.volume, 1);
    // migración (una vez, sin versión): ajustes de antes de existir el volumen del público → la mezcla que se oía (público = 0,85 × efectos)
    if (o && !('crowdVol' in o)) s.crowdVol = Math.round(0.85 * s.sfxVol * 100) / 100;
    s.crowdVol = clamp01(s.crowdVol, 0.85);
    if ([0, 1, 0.85, 0.7, 0.5].indexOf(s.resScale) < 0) s.resScale = 0;
    if (s.fpsCap !== 30) s.fpsCap = 0;
    if (['near', 'normal', 'far'].indexOf(s.camDist) < 0) s.camDist = 'normal';
    // zoom de cámara (17-nov-2026): 0 cerca … 4 lejos, 2 = el de siempre. Sustituye a la Distancia (camDist se sigue guardando para
    // las versiones de antes): sin camZoom guardado, Cerca → 1 y Lejos → 3 (los mismos ×0,86 / ×1,18 del 2v2)
    if (o && !('camZoom' in o)) s.camZoom = s.camDist === 'near' ? 1 : s.camDist === 'far' ? 3 : 2;
    s.camZoom = [0, 1, 2, 3, 4].indexOf(s.camZoom) >= 0 ? s.camZoom : 2;
    if (s.camCuts !== 'less') s.camCuts = 'all';
    if (['auto', 'on', 'off'].indexOf(s.lessMotion) < 0) s.lessMotion = 'auto';
    if (s.ballStyle !== 'contraste') s.ballStyle = 'clasico';
    s.keys = cleanBinds(s.keys, false); s.padKeys = cleanBinds(s.padKeys, true);
    if (!(s.padDead >= 0.1 && s.padDead <= 0.3)) s.padDead = 0.18; else s.padDead = Math.round(s.padDead * 100) / 100;
    if ([1, 1.15, 1.3].indexOf(s.touchSize) < 0) s.touchSize = 1;
    if (Q.diff && DIFFS.indexOf(Q.diff) >= 0) s.difficulty = Q.diff;
    return s;
  }
  /** Guarda los ajustes: los de DEVICE_KEYS en make-the-cut.device (solo aquí) y el resto en make-the-cut.settings (account.js lo sincroniza). */
  function saveSettings() {
    var st = ctx.settings, a = {}, d = {};
    for (var k in st) { if (!Object.prototype.hasOwnProperty.call(st, k)) continue; if (DEVICE_KEYS.indexOf(k) >= 0) d[k] = st[k]; else a[k] = st[k]; }
    try { localStorage.setItem('make-the-cut.settings', JSON.stringify(a)); } catch (e) { }
    try { localStorage.setItem('make-the-cut.device', JSON.stringify(d)); } catch (e) { }
  }

  // ---------- Calidad ----------
  var QUALITY = {
    high:   { level: 'high',   rank: 2, pixelRatio: 2,   mobilePixelRatio: 1.5,  shadowSize: 2048, shadows: true, antialias: true,  crowdDensity: 1 },
    medium: { level: 'medium', rank: 1, pixelRatio: 1.5, mobilePixelRatio: 1.25, shadowSize: 1024, shadows: true, antialias: true,  crowdDensity: 0.7 },
    low:    { level: 'low',    rank: 0, pixelRatio: 1,   mobilePixelRatio: 1,    shadowSize: 512,  shadows: true, antialias: false, crowdDensity: 0.4 }
  };
  // Escritorio en "baja": mapa de sombra de 1024 (con 512 el frustum de 36x26 m da ~7 cm por texel y la sombra de los pies
  // sale escalonada en los planos cercanos; la GPU de un PC lo paga sin notarlo). En el móvil se queda en 512 (presupuesto).
  if (!isMobile) QUALITY.low.shadowSize = 1024;
  var BY_RANK = [QUALITY.low, QUALITY.medium, QUALITY.high];
  // Último recurso por debajo de "baja": escala de render (<1 = menos píxeles que la pantalla).
  // La calidad adaptativa la baja a 0,8 y luego a 0,67 si en "baja" sigue por debajo de 40 fps.
  var renderScale = 1;
  function autoTop() { return isMobile ? QUALITY.medium : QUALITY.high; }
  function pickQuality() {
    var want = Q.quality || ctx.settings.quality;
    if (QUALITY[want]) return QUALITY[want];
    return autoTop();
  }

  // Módulos en orden de inicialización/actualización
  var MODS = ['Arena', 'FX', 'Players', 'CameraRig', 'Input', 'Audio', 'UI', 'AmbienteUI'];   // (AmbienteUI: ambiente de Carrera, js/ambiente-ui.js; su update va aparte, después de UI)
  // Aridad fija (hasta 3 argumentos): sin `arguments`/slice, que asignaban un array en cada una de las
  // ~15 llamadas por frame (CONTRACT §2: nada de basura por frame en el bucle).
  function call(name, fn, a, b, c) {
    var m = VB[name]; if (!m || typeof m[fn] !== 'function') return;
    try { return m[fn](a, b, c); }
    catch (e) { reportError(name + '.' + fn, e); }
  }
  var errCount = {};
  function reportError(where, e) {
    errCount[where] = (errCount[where] || 0) + 1;
    if (errCount[where] <= 3) console.error('[VB][ERROR] ' + where + ': ' + (e && e.stack || e));
  }

  // Tipo de sombra: un solo tipo por dispositivo (cambiar de tipo obliga a recompilar todos los materiales: medido con
  // tools/perf.js, CPU ×10, la bajada de media a baja congelaba el juego ~2 s justo cuando ya iba lento).
  //  - Móvil: PCF simple en todos los niveles (con un mapa de 1024 la diferencia de borde apenas se ve).
  //  - Escritorio: PCF suave también en baja (con PCF simple y mapa de 512 la sombra de los pies salía escalonada en los
  //    planos cercanos; ahora 1024 + PCF suave, y la bajada de alta/media a baja ya no recompila).
  function shadowType(q) { return isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; }
  function applyQuality(q) {
    ctx.quality = q;
    var dpr = window.devicePixelRatio || 1;
    // tope de píxeles: en el móvil la pantalla tiene dpr 2,5-3,5 y la GPU de gama media no llena tanto (MSAA x4 incluido):
    // alta 1,5, media 1,25, baja 1 (844x390 en media = 1055x488 px: 0,69 × los píxeles de antes, con pr 1,5).
    // Escritorio: el pixelRatio de cada nivel con tope 2 (sin cambios: alta mantiene su aspecto).
    var cap = isMobile ? (q.mobilePixelRatio || q.pixelRatio) : Math.min(2, q.pixelRatio);
    // E3: Resolución fija elegida por el jugador (resScale > 0) = pixelRatio × resScale y la adaptativa ya no toca la escala
    // (puede seguir bajando el nivel con Calidad = Auto); en Auto (0), como siempre: solo la adaptativa la baja en «baja»
    var us = +ctx.settings.resScale || 0;
    if (us > 0) { renderScale = us; if (aq) aq.noScale = true; }
    else if (q.rank > 0) renderScale = 1;
    ctx.renderScale = renderScale;
    ctx.renderer.setPixelRatio(Math.min(dpr, cap) * renderScale);
    // sombras: un tipo fijo por dispositivo (ver shadowType); solo cambia si algún día cambia la regla
    var st = shadowType(q), sm = ctx.renderer.shadowMap;
    if (sm.type !== st) {
      sm.type = st;
      // el tipo de sombra forma parte del programa de cada material: hay que recompilarlos
      if (ctx.scene) ctx.scene.traverse(function (o) {
        var m = o.material; if (!m) return;
        if (Array.isArray(m)) { for (var i = 0; i < m.length; i++) m[i].needsUpdate = true; } else m.needsUpdate = true;
      });
    }
    sm.enabled = q.shadows;
    sm.needsUpdate = true;
    resize(true);
    for (var i = 0; i < MODS.length; i++) call(MODS[i], 'setQuality', q);
    fixShadowDepth();
  }

  // ---------- Sombras: un material de profundidad por variante ----------
  // three r149 pinta TODAS las sombras con un único MeshDepthMaterial. Al alternar en la misma pasada mallas con
  // esqueleto (jugadores, oficiales), instanciadas y normales, ese material cambia de programa en cada cambio:
  // getProgram() rehace los parámetros y la clave de programa (cadenas) 4 veces por frame (medido con tools/perf.js:
  // ~650 KB/s de basura y CPU en cada frame). Con un customDepthMaterial compartido por variante cada programa queda fijo.
  var depthMats = {};
  function depthMat(kind) {
    return depthMats[kind] || (depthMats[kind] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  }
  function fixShadowDepth() {
    if (!ctx.scene || !THREE.MeshDepthMaterial) return;
    try {
      ctx.scene.traverse(function (o) {
        if (!o.isMesh || o.customDepthMaterial) return;
        if (o.isSkinnedMesh) o.customDepthMaterial = depthMat('skin');
        else if (o.isInstancedMesh) o.customDepthMaterial = depthMat('inst');
      });
    } catch (e) { reportError('fixShadowDepth', e); }
  }
  ctx.fixShadowDepth = fixShadowDepth;

  // ---------- Renderer / escena ----------
  function initRenderer() {
    var q = pickQuality();
    // MSAA del lienzo: sobra si arena va a pintar con su post-proceso (escritorio, calidad alta, WebGL2):
    // la escena va a un destino propio con MSAA x4 y al lienzo solo llega un rectángulo a pantalla completa.
    // Un búfer multimuestreo del tamaño de la pantalla costaría memoria y ancho de banda sin usarse.
    // MSAA del lienzo (no se puede cambiar después de crearlo):
    //  - móvil: SIEMPRE. En GPUs de teselas el MSAA x4 se resuelve en la memoria del chip y sale casi gratis;
    //    el tope de pixelRatio 1,5 se mantiene. Antes el móvil iba sin AA (líneas, red y antenas en escalera).
    //  - escritorio: también, salvo calidad FIJA "baja". Con el post-proceso de arena (alta + WebGL2) la escena
    //    va a su destino MSAA propio y el lienzo solo recibe un rectángulo (coste: una resolución por frame);
    //    pero si la calidad adaptativa baja de alta a media el post se apaga y, sin MSAA en el lienzo,
    //    la imagen se quedaba sin AA ninguno.
    var fixedLow = (Q.quality || ctx.settings.quality) === 'low';
    var aa = isMobile ? true : !fixedLow;
    ctx.canvasAA = aa; // lo puede leer arena
    var r = new THREE.WebGLRenderer({ antialias: aa, powerPreference: 'high-performance', alpha: false, stencil: false });
    // three r149 consulta el estado de enlace de cada programa nuevo (bloquea el hilo hasta que el driver
    // termina de compilar): fuera de depuración no hace falta y quita picos de 50-150 ms al estrenar materiales
    if (!ctx.debug && r.debug) r.debug.checkShaderErrors = false;
    // renderer.info acumula TODO el frame (sombras, escena, bloom): main.js lo pone a cero al empezar cada render
    r.info.autoReset = false;
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = shadowType(q);
    r.setClearColor(0x0b1220, 1);
    ctx.canvas = r.domElement; ctx.canvas.id = 'gl';
    ctx.canvas.setAttribute('aria-label', 'Pista de vóley en 3D');
    ctx.canvas.addEventListener('webglcontextlost', onContextLost, false);
    ctx.canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    ctx.container.appendChild(ctx.canvas);
    ctx.renderer = r;
    ctx.scene = new THREE.Scene();
    // la escena está en el origen y no se mueve: three no recalcula su matriz cada frame (arena congeló las suyas)
    ctx.scene.matrixAutoUpdate = false; ctx.scene.updateMatrix();
    ctx.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 200);
    ctx.camera.position.set(16, 6, 0); ctx.camera.lookAt(0, 1, 0);
    ctx.scene.add(ctx.camera);
    ctx.quality = q;
  }

  // ---------- Pérdida del contexto WebGL ----------
  // En el móvil es habitual al pasar la app a segundo plano. Se pausa el partido, se avisa sin bloquear y,
  // cuando vuelve el contexto, three.js vuelve a subir texturas y geometrías: solo hay que rehacer sombras
  // y destinos del post-proceso (applyQuality). Si en 6 s no ha vuelto, mensaje definitivo.
  var glLost = false, glLostTimer = 0;
  function onContextLost(e) {
    e.preventDefault(); // imprescindible para que el navegador intente restaurarlo
    glLost = true;
    if (ctx.state === 'playing') ctx.actions.pause();
    showFatal('Recuperando los gráficos…', true);
    clearTimeout(glLostTimer);
    glLostTimer = setTimeout(function () { if (glLost) showFatal('Se ha perdido el contexto gráfico. Vuelve a abrir el juego para seguir jugando.'); }, 6000);
  }
  function onContextRestored() {
    glLost = false; clearTimeout(glLostTimer);
    var d = document.getElementById('fatal'); if (d) { d.hidden = true; d.classList.remove('soft'); }
    try {
      ctx.renderer.shadowMap.needsUpdate = true;
      applyQuality(ctx.quality);
      call('Arena', 'onContextRestored', ctx); call('FX', 'onContextRestored', ctx);
    } catch (err) { reportError('contextRestored', err); }
    last = 0; meter.t = 0; meter.n = 0; meter.js = 0; meter.lt = 0; aq.skip = 1; // el parón no cuenta como fps bajos
    console.info('[VB] contexto WebGL restaurado');
  }

  // Solo se lee el tamaño del contenedor cuando algo lo ha cambiado (evento resize / ResizeObserver):
  // leer clientWidth cada frame podía forzar recálculo de estilos y maquetación con las animaciones del HUD.
  var sizeDirty = true;
  function resize(force) {
    if (!force && !sizeDirty) return;
    sizeDirty = false;
    var w = ctx.container.clientWidth || window.innerWidth || 1, h = ctx.container.clientHeight || window.innerHeight || 1;
    if (!force && w === ctx.width && h === ctx.height) return;
    ctx.width = w; ctx.height = h;
    ctx.renderer.setSize(w, h, false);
    ctx.canvas.style.width = '100%'; ctx.canvas.style.height = '100%';
    ctx.camera.aspect = w / h;
    // en pantallas estrechas/altas se abre un poco el campo de visión vertical para no perder la pista
    ctx.camera.updateProjectionMatrix();
    for (var i = 0; i < MODS.length; i++) call(MODS[i], 'resize', w, h);
  }

  // ---------- Partidas ----------
  // ---------- Vestuario: aspecto de tus jugadores en el partido en curso (js/look.js) ----------
  // curLooks = VB.Look.matchLooks(o) del partido en curso: [fit del n.º 1 | null, fit del n.º 2 | null] o null sin look.js. Solo
  // estética: va a Players.setKit (st.looks) y nunca a la sim (ni attrs, ni badges, ni g.rng). o: {} en Partido rápido, Entrenamiento,
  // demo y 6v6 humano; {watch:true} en el 6v6 espectador (nadie lleva tu look); en la Carrera {career, hall, look, mate} (spec §2.4).
  var curLooks = null;
  function lookOptsOf(g) { return g && g.watch ? { watch: true } : {}; }
  function calcLooks(o) {
    if (o && Array.isArray(o.fits)) return [o.fits[0] || null, o.fits[1] || null];   // (online: los looks que se mandaron al rival, VB.NetLobby.myLook)
    var Lk = VB.Look; if (!Lk || typeof Lk.matchLooks !== 'function') return null;
    try { var r = Lk.matchLooks(o || {}); return Array.isArray(r) ? r : null; } catch (e) { reportError('Look.matchLooks', e); return null; }
  }
  /** Opciones de matchLooks de un partido de Carrera (cs = m.career de matchSetup, que no trae c.life: el look sale de lookNow). */
  function careerLookOpts(cs, hall) {
    var look = null, CL = VB.CareerLife;
    try { if (CL && CL.lookNow) look = CL.lookNow() || null; } catch (e) { reportError('CareerLife.lookNow', e); }
    return { career: true, hall: !!hall, look: look, mate: cs && cs.mate ? String(cs.mate) : null };
  }
  /** Kit para Players.setKit con los looks del partido (copia: nunca se escribe en ctx.settings ni en el kit del club). */
  function kitWithLooks(kit) { return Object.assign({}, kit || ctx.settings, { looks: curLooks }); }

  function setGame(g, kit, lookOpts) {
    call('Replay', 'abort');   // S3-C1: una repetición en curso se corta sin cortinilla (menú, revancha, reiniciar, escenas)
    ctx.game = g; ctx.timeScale = 1; acc = 0; ctx.replaySkipReq = false;
    // g.watch0 = espectador de verdad (?format=6v6, escenas); g.watch se recalcula cada frame con el banquillo (g.watch0 || g.ctrlOut)
    if (g && g.watch0 === undefined) g.watch0 = !!g.watch;
    bench.fast = false; bench.ff = ''; bench.out = !!(g && g.ctrlOut); ctx.bench = bench;
    pendingEvents.length = 0;
    // equipación personalizada (Ajustes · Equipación) antes de construir atletas; en Carrera, la del club. Con ella, el aspecto de
    // tus jugadores en este partido (Vestuario; lookOpts lo da startMatch, si no sale de g: espectador o el resto)
    curLooks = calcLooks(lookOpts || lookOptsOf(g));
    call('Players', 'setKit', kitWithLooks(kit), null);
    Sim.drainEvents(g, pendingEvents); // eventos iniciales (newMatch, serveReady...) se entregan en el primer frame
    for (var i = 0; i < MODS.length; i++) call(MODS[i], 'onGameStart', g);
    fixShadowDepth(); // los jugadores se reconstruyen en onGameStart
    // S3-C1: grabador de repeticiones (VB.Replay decide si el partido graba: 2v2 humano, sin demo, ejercicio ni espectador; con
    // autopilot solo con &replay=1). Las escenas debug=replay/best lo arrancan antes de avanzar la sim (rpPre) y no se rehace aquí
    if (rpPre === g) rpPre = null; else call('Replay', 'reset', g);
  }
  var rpPre = null;
  /** S3-C1 / R10: mejores jugadas desde la hoja final (pestaña «Jugadas»): i = una (índice de VB.Replay.list()) o, sin i, todas.
   *  Al acabar o salir, ui.js vuelve a enseñar la hoja con el foco en el «Ver» pulsado (VB.UI.replayDone). */
  ctx.actions.playBest = function (i) {
    var R = VB.Replay; if (!R || !R.playBest || ctx.state !== 'over') return false;
    ctx.frozen = false;   // (escenas de depuración congeladas en la hoja: la repetición tiene que correr)
    try { return !!R.playBest(i == null ? undefined : i | 0, function () { call('UI', 'replayDone'); }); } catch (e) { reportError('Replay.playBest', e); return false; }
  };
  // primer partido (sin récord guardado): la CPU saca más suave (notes/sim.md, createGame({rookie}))
  function isRookie() { try { var r = JSON.parse(localStorage.getItem('make-the-cut.record') || 'null'); return !(r && r.played > 0); } catch (e) { return false; } }
  function seed() { return Q.seed ? (+Q.seed | 0) : ((Date.now() ^ (Math.random() * 1e9)) & 0x7fffffff); }
  /** Escenario del partido que se crea ('hall' | 'beach'): el que tiene arena montado (ajuste `arena` o ?map=). En la playa la sim
   *  juega con reglas de vóley playa (createGame({venue:'beach'}): pista 16×8, sets a 21/15, cambio de campo cada 7). */
  function venueNow() {
    var v = VB.Arena && VB.Arena.venue ? VB.Arena.venue() : (Q.map ? (VB.Venues && VB.Venues.kindOf(Q.map)) || Q.map : ctx.settings.arena);
    return v === 'beach' ? 'beach' : 'hall';
  }
  /** Escenario pedido en Ajustes durante un partido: se monta al salir de él (menú o partido nuevo). */
  var venuePend = false;
  function applyVenuePend() { if (!venuePend) return; venuePend = false; for (var i = 0; i < MODS.length; i++) call(MODS[i], 'onSettings', ctx.settings, 'arena'); }
  /** Carrera (vóley playa): el partido se juega en la playa aunque el ajuste «Escenario» sea el pabellón. Se monta como si el
   *  ajuste fuera `v` (los módulos lo reciben por onSettings(s, 'arena'), sin tocar ctx.settings) y al volver al menú
   *  (toMenu → unforceVenue) se vuelve al escenario del ajuste. */
  var venueForced = '';   // escenario que había antes de forzar el de la Carrera ('' = no forzado)
  // v = tipo ('hall' | 'beach': la sede del ajuste de ese tipo) o id de sede ('fanals'…: esa; arena lo lee en `forceMap`)
  function isMapId(v) { return !!(VB.Venues && VB.Venues.def(v)); }
  function mapNow() { return VB.Arena && VB.Arena.map ? VB.Arena.map() : ''; }
  function applyVenue(v) {
    var id = isMapId(v), kind = id ? VB.Venues.kindOf(v) : v;
    var s = Object.assign({}, ctx.settings, { arena: kind, forceMap: id ? v : '' });
    for (var i = 0; i < MODS.length; i++) call(MODS[i], 'onSettings', s, 'arena');
  }
  function forceVenue(v) {
    var id = isMapId(v), cur = id ? mapNow() : venueNow(); if (cur === v) return;
    // (se guarda lo de antes de la PRIMERA vez: de una sede de Carrera a otra sin pasar por el menú se vuelve igual al ajuste;
    //  una sede generada se guarda como su tipo, porque puede salir del registro LRU de venues.js antes de volver;
    //  ya forzado, p. ej. por el fondo de la Carrera: se guarda el del ajuste)
    if (!venueForced) { var m0 = mapNow(), d0 = m0 && VB.VENUES && VB.VENUES[m0]; venueForced = (m0 && !(d0 && d0.gen) && m0) || venueNow(); }
    applyVenue(v);
  }
  function unforceVenue() {
    if (!venueForced) return;
    var back = venueForced; venueForced = '';
    if (venuePend) applyVenuePend(); else applyVenue(back);   // (si cambió el ajuste en la pausa, manda el ajuste)
  }
  function demoGame() {
    applyVenuePend();
    if (Q.format === '6v6') forceVenue('hall');   // el 6v6 es de pabellón (la sim usa su pista 18×9): no se pinta sobre la playa
    return Sim.createGame({ demo: true, seed: seed(), difficulty: 'normal', format: Q.format === '6v6' ? '6v6' : undefined, venue: Q.format === '6v6' ? undefined : venueNow() }); }

  // UI-01/UI-07: un partido humano pedido mientras el arranque aún ensaya estilos bajo el fondo del telón (herramientas que llaman
  // a startMatch a los ~2,5 s; con el menú, la cortinilla ya espera sola) espera a que acabe (como mucho hasta los 9 s): si no, el
  // ensayo se cortaba y el primer uso de la tarjeta de presentación o del aviso del saque costaba un frame de 45-70 ms.
  var startWait = null;
  /** Modo «Control: Uno»: a cuál de los dos controla el humano. En el juego siempre al n.º 1 (0 = teams[0][0]); opts.ctrlIdx y
   *  &ctrlidx=1 (el n.º 2) quedan solo para pruebas. */
  function ctrlIdxOf(opts) {
    var v = opts && opts.ctrlIdx != null ? +opts.ctrlIdx : Q.ctrlidx != null ? +Q.ctrlidx : 0;
    return v === 1 ? 1 : 0;
  }
  /** E6: id de ejercicio válido (VB.DRILL de la sim) o null. */
  function drillId(id) { return typeof id === 'string' && VB.DRILL && VB.DRILL.kinds && VB.DRILL.kinds.hasOwnProperty(id) ? id : null; }
  /** E2 (sprint 5): celebración de firma de tu n.º 1 (career-life: la elegida en Fama, también en Partido rápido) y rival personal
   *  (solo en el duelo de la Carrera: m.career.rivalNum). players.js limpia el rival solo si no se vuelve a llamar. */
  // S3 (sprint 2-4, C2/C3/C5): gestos del compañero de playa (cs.mateAnim), jefe del circuito (cs.bossAnim: {idx, num, fit, style,
  // pers, sig, rage}, fit ya calculado por career-life con VB.Look.bossFit) y saludo de pareja (química: cs.chemLv si cs.pairSign no
  // es 0). Sin Carrera (cs null: Partido rápido, ejercicios) los tres a null / 0, así que players queda como siempre.
  function animHooks(cs) {
    var P = VB.Players; if (!P) return;
    try { if (P.setSignature) P.setSignature(VB.CareerLife && VB.CareerLife.signatureNow ? VB.CareerLife.signatureNow() || '' : ''); } catch (e) { reportError('Players.setSignature', e); }
    try { if (P.setRival) P.setRival(cs && cs.rivalNum != null && isFinite(+cs.rivalNum) ? +cs.rivalNum : -1); } catch (e) { reportError('Players.setRival', e); }
    try { if (P.setMate) P.setMate(cs && cs.mateAnim ? cs.mateAnim : null); } catch (e) { reportError('Players.setMate', e); }
    try { if (P.setBoss) P.setBoss(cs && cs.bossAnim ? cs.bossAnim : null); } catch (e) { reportError('Players.setBoss', e); }
    try { if (P.setPairChem) P.setPairChem(cs && cs.pairSign !== 0 ? cs.chemLv | 0 : 0); } catch (e) { reportError('Players.setPairChem', e); }
  }
  /** &boss=saque|muro|remate|defensa y &mate=<estilo del compañero> (escenas de depuración y capturas): el jefe en el n.º 1 rival y
   *  los gestos de tu n.º 2, sin Carrera. Con guarda: sin players nuevo (setBoss/setMate) no hace nada. */
  function debugAnimHooks(g) {
    if (!Q.boss && !Q.mate) return;
    var L = VB.CareerLife, cs = {};
    try {
      if (Q.boss && L && L.bossAnim) {
        var an = L.bossAnim(String(Q.boss)), r0 = g && g.teams && g.teams[1] && g.teams[1][0], fit = null;
        try { fit = VB.Look && VB.Look.bossFit ? VB.Look.bossFit(String(Q.boss), 1234567) || null : null; } catch (e) { fit = null; }
        if (an) cs.bossAnim = { idx: 0, num: r0 ? r0.num | 0 : 1, fit: fit, style: an.style, pers: an.pers, sig: an.sig, rage: an.rage };
      }
      // (&mate= estilo del compañero: el nombre entero o su principio, p. ej. «rematador», «pulpo»)
      if (Q.mate && L && L.MATE_ANIM) {
        var mq = String(Q.mate).toLowerCase(), mk = Object.keys(L.MATE_ANIM).filter(function (k) { return k.toLowerCase().indexOf(mq) === 0 || k.toLowerCase().indexOf(' ' + mq) > 0; })[0];
        var ma = mk ? L.MATE_ANIM[mk] : null, m0 = g && g.teams && g.teams[0] && g.teams[0][1];
        if (ma) cs.mateAnim = { num: m0 ? m0.num | 0 : 2, pers: ma[0], sig: ma[1], rage: ma[2] };
      }
    } catch (e) { reportError('debugAnimHooks', e); }
    cs.pairSign = 0;
    animHooks(cs);
  }
  /** B5 (previa): datos de la jornada para VB.Recap.introPlan, sin guardar nada: tu puesto y el del rival (posOf de la fachada, vale
   *  para playa y pista), clubes de la liga, cara a cara (c.world.h2h), tu rival personal {name, w, l}, primera jornada y liga. */
  function careerIntroData(K, cs) {
    if (!cs || !K) return;
    try {
      var c = K.get ? K.get() : null; if (!c) return;
      var n = K.next ? K.next(c) : null, me = K.myClub ? K.myClub(c) : null; if (!n || !me) return;
      var rid = n.rival ? n.rival.id : null, hall = K.MODE === 'hall';
      if (K.posOf) { cs.pos0 = K.posOf(c, me.id) | 0; cs.rivalPos = rid != null ? K.posOf(c, rid) | 0 : 0; }
      if (K.table) { var tb = hall ? K.table(c, me.lid) : K.table(c, me.lvl); cs.posN = tb && tb.length ? tb.length : 0; }
      var h = c.world && c.world.h2h && rid != null ? c.world.h2h[rid] : null;
      cs.h2h = h && h.length ? h.slice(0, 6) : null;
      var rv = c.life && c.life.rival;
      if (rv && typeof rv === 'object' && rv.name) cs.rivalInfo = { name: String(rv.name), w: rv.w | 0, l: rv.l | 0 };
      cs.first = n.kind === 'league' && c.phase === 'league' && (n.week | 0) === 0;
      var lg = K.league ? (hall ? K.league(me.lid, c) : K.league(me.lvl)) : null;
      if (lg && lg.name) cs.league = String(lg.name);
      // ambiente de Carrera (js/ambiente.js): local / visitante, calor, derbi… (career.js ambCtx; solo lectura)
      if (cs.atHome == null && ctx.settings.ambient !== 'off') cs.atHome = !!n.atHome;
      // («Apagado»: sin cs.amb, así la previa no saca DERBI / REVANCHA / CUMBRE y la Carrera queda exactamente como antes)
      if (K.ambCtx && ctx.settings.ambient !== 'off') cs.amb = K.ambCtx(c, n, cs) || null;
    } catch (e) { reportError('careerIntroData', e); }
  }
  ctx.actions.startMatch = function (opts) {
    opts = opts || {};
    netStop(true);   // (un partido normal pedido con el online en marcha: el online se abandona)
    // E6: ejercicio del Entrenamiento (opts.drill). Siempre 2v2 en el escenario del ajuste; dificultad Normal y control Uno salvo en
    // el peloteo libre (los del Partido rápido); sin marcador ni récord. &gymauto=1 / opts.autopilot: la IA juega por ti (pruebas)
    var drill = drillId(opts.drill);
    if (drill) { startDrill(drill, opts); return; }
    // Carrera: «Reiniciar partido» (pausa) repite el partido de Carrera; «Revancha» / Intro en la hoja final vuelven al hub
    // (ui.js llama a startMatch() sin opciones en los dos casos)
    // (partidillo de prueba: reiniciar o abandonar gasta la prueba; «Reiniciar prueba» la da por suspendida y vuelve a las ofertas)
    if (!opts.career && !opts.autopilot && ctx.game && ctx.game.career && !ctx.game.demo) {
      if (ctx.state === 'over') { ctx.actions.toMenu(); return; }
      if (ctx.state === 'paused' || ctx.state === 'playing') {
        if (ctx.game.career.trial) { if (!trialForfeit(ctx.game.career, 'restart')) ctx.actions.startCareerTrial(ctx.game.career.offer); else ctx.actions.toMenu(); }
        else ctx.actions.startCareerMatch();
        return;
      }
    }
    // (solo partidos humanos: los de autopilot —herramientas de medida— empiezan al momento, como siempre)
    if (!ctx.debug && !opts.autopilot && call('UI', 'bootBusy')) { startWait = opts; return; }
    startWait = null;
    // Salto con impulso (v1.12.0): aviso de colocador (VB.UI.setterNote) antes de un partido 6v6 en el que llevas al colocador fuera
    // de la Carrera (hoy el Partido rápido 6v6 siempre es OH: queda para cuando haya fila «Puesto»). En la Carrera no sale aquí, porque
    // quedaría encima de la página Jugar del menú: lo saca su hub (career-ui.js setterNoteSoon, sin taparse con la escena de Faro).
    // Una vez por sesión entre los dos, nunca con autopilot, online, ejercicios ni «Reiniciar partido». El partido espera a que se
    // cierre y arranca con lo elegido (Activar = ya con la diana de colocación)
    if (opts.format === '6v6' && opts.ctrlRole === 'S' && !opts.career && !opts.autopilot && !opts.noteDone && !restarting && !net) {
      var nOpts = Object.assign({}, opts, { noteDone: true });
      if (call('UI', 'setterNote', { from: 'match' }, function () { ctx.actions.startMatch(nOpts); })) return;
    }
    call('Audio', 'unlock');
    tryFullscreen();
    ctx.frozen = false;
    // present (SIM-03): en los partidos de verdad la pausa del punto se alarga en los momentos grandes (y se puede recortar)
    var cs = opts.career || null, own = !opts.autopilot && !Q.debug;
    // 6v6 (sprint 3): con la fila «Formato» de Partido rápido (ctx.settings.format) o opts.format, partido HUMANO: llevas al
    // receptor (control Uno por puesto, sim ctrlRole 'OH') y la IA al resto; sin atributos ni insignias del escuadrón de 2v2.
    // ?format=6v6 sigue siendo el MODO ESPECTADOR del sprint 2 (CPU contra CPU con HUD y pausas de partido: autopilot + present,
    // g.watch para ui.js; tv6test y perf lo usan); ?format=6v6&human=1 = partido humano desde la URL (pruebas).
    var qWatch = Q.format === '6v6' && Q.human !== '1';
    // (Carrera de pista, lote C: opts.career con opts.format '6v6' = partido 6v6 de Carrera en el pabellón, en tu puesto, opts.ctrlRole)
    var fmt = cs ? (opts.format === '6v6' ? '6v6' : undefined) : (opts.format === '6v6' || (opts.format == null && (Q.format === '6v6' || ctx.settings.format === '6v6'))) ? '6v6' : undefined; if (fmt) own = false;
    var watch6 = !!fmt && qWatch && opts.format == null;
    var auto = !!opts.autopilot || watch6;
    applyVenuePend();
    // «Al azar» / «Sede de un club»: cada partido rápido humano se sortea de nuevo (también la revancha). No en la Carrera (sede del
    // local), ni con ?map= (pruebas), ni en autopilot (herramientas de medida: perf, drive)
    if (!cs && !auto && !Q.map && VB.Arena && VB.Arena.reroll) {
      var rk = fmt ? 'hall' : venueNow(), rp = ctx.settings[rk === 'beach' ? 'mapBeach' : 'mapHall'];
      if (rp === 'rand' || rp === 'club') { VB.Arena.reroll(rk); if (venueNow() === rk) applyVenue(rk); }   // (6v6 desde la playa: lo monta forceVenue)
    }
    // Carrera: VÓLEY PLAYA (sprint playa, 10-nov-2026): el partido se juega en Platja Llarga con sus reglas (sets a 21 y el 3r a
    // 15, pista 16×8, cambio de campo cada 7) aunque el ajuste «Escenario» sea el pabellón; el hub y quickSim cuentan con ellas
    // (el 6v6 al revés: siempre en el pabellón, aunque el ajuste sea la playa; la sim juega en su pista 18×9)
    // S4-D1 (reto del día): opts.map = id de sede fuera de la Carrera (venues.js); en 6v6 solo sedes de pabellón. Sin sede pedida,
    // la del ajuste (y si un partido anterior forzó otra sin pasar por el menú, se deshace)
    var mapK = opts.map && isMapId(opts.map) ? VB.Venues.kindOf(opts.map) : '';
    var cv = cs ? (opts.venue === 'hall' ? 'hall' : 'beach') : fmt ? (mapK === 'hall' ? opts.map : 'hall') : (mapK ? opts.map : null);
    // (Carrera: opts.venueMap = sede del partido, VB.Venues.forMatch: la del local, una emblema o null = la del ajuste del tipo)
    if (cs && opts.venueMap && VB.Venues && VB.Venues.kindOf(opts.venueMap) === cv) cv = opts.venueMap;
    if (cv) forceVenue(cv); else unforceVenue();
    var cvK = cv ? (isMapId(cv) ? VB.Venues.kindOf(cv) : cv) : '';   // tipo ('hall' | 'beach') para la sim
    if (!auto) animHooks(cs);
    // banquillo y cambios (6v6): la Carrera trae bench / meSlot / meBench / names / coach (VB.Career.matchSetup); el Partido rápido 6v6
    // humano, el banquillo neutro de los dos equipos (Sim.defaultBench) y el entrenador de cada uno (el tuyo según «Cambios de tu
    // equipo»). Nunca en el espectador (?format=6v6): tv6test y perf no cambian
    var dq = opts.difficulty || ctx.settings.difficulty, b6 = null, c6 = null;
    if (fmt && cs && opts.bench) { b6 = opts.bench; c6 = opts.coach || null; }
    else if (fmt && !cs && (!auto || Q.bench6 === '1') && Sim.defaultBench) {   // (&bench6=1: también con autopilot / espectador, para perf.js)
      b6 = [Sim.defaultBench(0), Sim.defaultBench(1)];
      c6 = [{ auto: ctx.settings.subs6 !== 'manual', iq: 2 }, { auto: true, iq: IQ6[Sim.normDiff ? Sim.normDiff(dq) : dq] || 2 }];
    }
    var g = Sim.createGame({ demo: false, seed: seed(), difficulty: dq, autopilot: auto, rookie: cs ? !!opts.rookie : isRookie(), present: !opts.autopilot,
      bench: b6 || undefined, coach: c6 || undefined, meSlot: cs && b6 ? opts.meSlot : undefined, meBench: cs && b6 ? opts.meBench : undefined, names: fmt && cs ? opts.names : undefined,
      // (sets: 1 = partido a un solo set, el partidillo de prueba de la Carrera; sin él, al mejor de 3 como siempre)
      sets: opts.sets === 1 ? 1 : undefined,
      points: opts.points || +Q.points || ctx.settings.setPoints, ctrl: fmt ? 'one' : (opts.ctrl || Q.ctrl || ctx.settings.ctrlMode), ctrlRole: fmt ? (cs && opts.ctrlRole) || 'OH' : undefined, // (6v6: siempre 'one'; el receptor, o tu puesto en la Carrera de pista; espectador sin eventos switch)
      ctrlIdx: ctrlIdxOf(opts),
      // (S4-D1: opts.noAttrs / opts.noBadges = retos «sin mejoras»: el escuadrón juega con atributos e insignias neutros)
      attrs: opts.attrs || (own && !opts.noAttrs && !Q.noattrs && VB.Prog ? VB.Prog.attrs() : null),
      badges: cs ? (opts.badges || null) : (own && !opts.noBadges && !Q.nobadges ? squadBadges() : null),
      // (Carrera: cv = 'beach'; antes jugaba siempre con reglas de pabellón)
      ref: opts.ref || undefined, nums: opts.nums || undefined, format: fmt, venue: fmt ? undefined : cvK || venueNow(),
      // E1 (sprint 5): maestría (finta, golpe colocado, al filo, colocación dirigida) en los partidos humanos de 2v2; la sim la
      // ignora sola en demo, autopilot y 6v6. aimSet = Ajustes · Juego · Colocación dirigida
      mastery: !fmt && !auto, aimSet: ctx.settings.aimSet !== false,
      // finta (19-nov-2026): en 6v6 sin el resto de la maestría (en 2v2 ya va con mastery)
      feint: !auto,
      // Salto con impulso (v1.12.0): djump = salto con dirección del humano (la sim lo ignora en demo y autopilot); jsetAim = Ajustes ·
      // Juego · Colocación en salto con diana
      djump: !auto, jsetAim: ctx.settings.jsetAim === true,
      // R21: estadísticas de la sim en los partidos humanos (masteryLine de la hoja final y los retos las leen). Son de solo
      // escritura: misma partida con y sin ellas (comprobado con stateHash y g.rng en 12 partidas, notes/s234/T14.md)
      stats: !auto || undefined,
      // ambiente de Carrera (notes/ambiente.md §0.2): abre las 3 puertas de la sim (Sim.holdFor / canPenalty / penalty) solo en la
      // Carrera jugada con el ajuste encendido; sin él (partido rápido, entreno, online, autopilot) la sim no cambia
      amb: cs && !auto && ctx.settings.ambient !== 'off' ? true : undefined });
    // partido de Carrera: marca para ui.js/badges.js (no reparten experiencia ni insignias al escuadrón de Partido rápido) y
    // para el hub (VB.Career.matchDone al llegar gameOver)
    if (cs) g.career = cs;
    if (cs) cs.calls = ctx.settings.coachCalls !== false;   // consignas del entrenador en directo (career.js, js/consignas.js)
    if (cs) { cs.ambient = auto ? 'off' : ctx.settings.ambient || 'full'; cs.ambSum = null; }   // ambiente de Carrera (career.js crea VB.Ambiente)
    // S4-D1: reto del día (opts.reto = {kind, key, goal, n}); retoOpts = las opciones tal cual, para «Otra vez» / restart
    if (opts.reto && !cs) { g.reto = opts.reto; g.retoOpts = Object.assign({}, opts); delete g.retoOpts.introKind; delete g.retoOpts.noIntro; }
    // R16: opciones del último partido humano de Partido rápido (restart las repite con la previa mini)
    if (!cs && !auto) lastOpts = Object.assign({}, opts);
    if (watch6 && !opts.autopilot) g.watch = true;
    endTweaked = false; careerEnd = null;
    if (!cs) restoreEndButtons();
    setGame(g, opts.kit || null, cs ? careerLookOpts(cs, cvK === 'hall') : lookOptsOf(g));
    setState('playing');
    // los jugadores se reconstruyen en onGameStart: sube sus texturas/programas antes del primer frame
    // (sin pintar: aquí no hay telón que tape los objetos ocultos)
    if (Q.prewarm !== '0') { prewarm('t'); prewarmPrograms(false); }
    // UI-14: tarjeta de presentación (partidos humanos; en depuración solo con &intro=1)
    if (!auto && !opts.noIntro && Q.intro !== '0' && (!ctx.debug || Q.intro === '1')) introStart(opts);
  };
  var lastOpts = null;

  // ---------- ONLINE (fase 1; owner net, notes/net.md) ----------
  // Partido 1 contra 1 dentro del 2v2 entre dos máquinas (VB.Net.Session: rollback simétrico). ctx.game es la VISTA (net.view): una
  // copia de la partida predicha, girada para el invitado (VB.NetView.mirror), así cámara, interfaz, efectos y sonido no cambian.
  // Sin pausa, sin cámara lenta, sin repetición automática ni intro: manda el reloj de la sesión (no timeScale ni MAX_STEPS).
  // Prueba en este PC: ?net=bc&slot=0|1&lag=80&jit=15&loss=3 (&room=, &name=, &bot=1 = juega un bot, &bo=3, &points=, &map=,
  // &model=fluida = Online V2, conexión Fluida con VB.NetFluid; en las dos páginas).
  var net = null;   // {sess, slot, view, over, menu, r, name, rival, look, base, epoch, want, rivalWants, rec*, away0, …}
  ctx.net = null;
  ctx.netBot = null;   // depuración (tools/netdrive.js): function(gCanónica) → entrada en coordenadas del mundo canónico
  // Fase 3 (notes/net.md «Fase 3»): o.look = {mine, theirs} (VB.NetLobby.myLook / saneLook: looks del Vestuario y equipación de
  // cada uno, solo estética), o.rivalName (el del «pre»; la sesión lo confirma en su saludo). Revancha sobre el MISMO enlace con una
  // sesión nueva de la época siguiente (VB.Net Session epoch). Récord online y gorra: VB.NetRec.
  ctx.actions.startOnline = function (o) {
    o = o || {};
    if (!VB.Net || !VB.NetView || !o.link) return false;
    netStop(false);
    call('Audio', 'unlock');
    net = ctx.net = { sess: null, slot: o.slot === 1 ? 1 : 0, view: null, over: false, menu: false, r: null, name: o.name || '', rival: o.rivalName || '',
      look: o.look || null, base: o.opts || null, link: o.link, delay: o.delay, epoch: 0, away0: !!document.hidden,
      expect: o.expect || null,   // (auditoría: invitado: lo que anuncia la sala; la sesión lo compara con las opciones del anfitrión)
      model: o.model === 'fluida' && VB.NetFluid ? 'fluida' : 'precisa' };   // Online V2: conexión de la sala (la revancha la repite)
    netSession(o.opts || null, 0);
    // latido de la sesión en un Worker durante TODO el partido (antes solo con la pestaña oculta): si el navegador deja de dar frames a
    // la página > 100 ms (ventana tapada por otra, tirón del compositor), la sesión sigue recibiendo y mandando las entradas y el rival
    // no se queda «Esperando…» (medido en netdrive: frames de 1 s con el hilo libre → el otro esperaba 0,7 s). Con frames, no hace nada.
    netTicker(true);
    if (net.away0) netAway(true);
    netHud(null);
    return true;
  };
  function netSession(opts, epoch) {
    // Online V2 (notes/online-v2-spec.md §9): Fluida = VB.NetFluid.Session, misma fachada; sin onTick (no hay grabador de repeticiones)
    var fl = net.model === 'fluida', Ses = fl ? VB.NetFluid.Session : VB.Net.Session;
    var s = new Ses({ slot: net.slot, link: net.link, opts: opts, name: net.name, rivalName: net.rival, delay: net.delay, epoch: epoch, expect: net.expect,
      // 17-nov-2026: «listo» (invitado) y arranque (anfitrión) esperan a que esta máquina compile los gráficos del partido (netBuildView):
      // un parón de compilado a mitad de partido para a los dos (el otro espera). Programas en paralelo y luego el primer dibujo de todo.
      warm: function () { if (!net || net.sess !== s || !net.view) return false; if (progWarm.pending && progsPending()) return false; if (net.wd) { net.wd = false; warmDraw(); } return true; },
      log: ctx.debug ? function (m) { console.info('[VB] ' + m); } : null,
      // fase 6: cada paso CONFIRMADO, con sus dos entradas, al grabador de repeticiones (VB.Replay en modo dual sobre gc)
      onTick: fl ? null : function (t, gc) { var RP = VB.Replay; if (RP && RP.enabled && RP.enabled() && net && net.sess === s) RP.onStep(s.stepInputs(), gc); } });
    if (VB.NetLog && net.sess) { try { VB.NetLog.end(net, 'revancha'); } catch (e) { } }
    net.sess = s; net.epoch = epoch; net.view = null; net.over = false; net.menu = false; net.r = null;
    net.want = false; net.rivalWants = false; net.recBegun = false; net.recDone = false; net.recRes = null; net.recBeat = 0;
    net.stSnap = null; net.stRs = 0; net.hx = 0;   // (auditoría: copia de la hoja para rehacerla tras una vuelta; cruceta del HUD)
    if (net.away0) { s.setAway(true); s.maxCatch = 150; }
    return s;
  }
  ctx.actions.netVsAI = function () { if (net && net.sess.vsAI()) call('Audio', 'ui', 'click'); };
  // (auditoría: abandonar en pleno partido no salta al menú sin más: el HUD enseña «Has abandonado [Volver al menú]», como al rival;
  //  ese botón vuelve aquí con la sesión ya 'ended' y entonces sí va al menú)
  ctx.actions.netQuit = function () {
    if (net) {
      var st0 = net.sess.status; net.sess.quit(); netSettle();
      if (net.view && ctx.state === 'playing' && (st0 === 'playing' || st0 === 'waiting') && net.sess.status === 'ended') { call('Audio', 'ui', 'click'); return; }
    }
    ctx.actions.toMenu();
  };
  /** «Continuar» en la pausa del punto y en la de entre sets (se salta solo cuando los DOS lo han pulsado). */
  ctx.actions.netSkip = function () { if (net && net.view) { net.sess.request('skip'); call('Audio', 'ui', 'click'); } };
  /** Revancha (hoja final): se pide al rival; cuando los dos la quieren, quien creó la sala manda la semilla nueva y los dos empiezan
   *  una sesión de la época siguiente sobre el mismo enlace (mismos nombres, looks y opciones de la sala). */
  ctx.actions.netRematch = function () {
    if (!net || !net.sess || net.want || net.sess.rivalLeft || net.sess.status !== 'over') return false;
    net.want = true; net.sess.sendApp({ t: 'again' }); call('Audio', 'ui', 'click');
    netRematchGo();
    return true;
  };
  function netRematchGo() {
    if (!net || !net.want || !net.rivalWants || net.slot !== 0 || !net.base) return;
    var o = {}, k; for (k in net.base) o[k] = net.base[k];
    o.seed = netSeed(); net.base = o;   // (las opciones de la sala, Fluida incluida: opts.net; la sesión nueva sale de net.model)
    var e = net.epoch + 1;
    net.sess.sendApp({ t: 'go', e: e });
    netSession(o, e);
  }
  function netSeed() {
    try { if (window.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1; } catch (e) { }
    return Math.floor(Math.random() * 2147483647);
  }
  /** Mensajes de la interfaz del rival (r.app): revancha. */
  function netApp(list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i]; if (!m || typeof m !== 'object') continue;
      if (m.t === 'again') { net.rivalWants = true; netRematchGo(); }
      else if (m.t === 'go' && net.slot === 1 && net.want && (m.e | 0) === net.epoch + 1) { netSession(null, net.epoch + 1); return; }   // (misma conexión: net.model)
    }
  }
  /** Récord online (VB.NetRec): marca al empezar (cerrar la pestaña = abandono) y, una vez por partido, el resultado cuando ya no
   *  cambia (final confirmado, abandono, o juzgado por tiempo). En depuración (?net=) solo con &netrec=1 (pruebas). */
  function netRecOn() { return !!VB.NetRec && (!ctx.debug || Q.netrec === '1'); }
  function netSettle() {
    if (!net || !net.sess || net.recDone || !net.recBegun || !netRecOn()) return;
    var s = net.sess, res = s.result;
    if (!res || !(s.status === 'over' || s.status === 'ended' || s.goneFlag)) return;
    net.recDone = true;
    var gc = s.confirmedGame(), sets = gc && gc.sets ? [gc.sets[net.slot] | 0, gc.sets[1 - net.slot] | 0] : null;
    try { net.recRes = VB.NetRec.end(s.rivalName || net.rival, res, s.valid, sets); } catch (e) { reportError('NetRec.end', e); }
  }
  function netRecTick(r) {
    if (!netRecOn()) return;
    if (!net.recBegun && (r.status === 'playing' || r.status === 'waiting')) { net.recBegun = true; net.recBeat = performance.now(); try { VB.NetRec.begin(net.sess.rivalName || net.rival); } catch (e) { } }
    else if (net.recBegun && !net.recDone && performance.now() - net.recBeat > 10000) { net.recBeat = performance.now(); try { VB.NetRec.beat(); } catch (e) { } }
    netSettle();
  }
  function netStop(quit) {
    if (!net) return;
    netTicker(false);
    try { if (quit) { net.sess.quit(); netSettle(); } } catch (e) { }
    if (VB.NetLog) { try { VB.NetLog.end(net, quit ? 'sale' : 'cierra'); } catch (e) { } }
    try { if (net.link && net.link.close) net.link.close(); } catch (e) { }
    net = ctx.net = null; ctx.netBot = null;
    var h = document.getElementById('netHud'); if (h) h.hidden = true;
    var a = document.getElementById('netTag'); if (a) a.hidden = true;
  }
  /** ?net=bc: partida de prueba entre dos pestañas (o dos páginas del mismo Chrome). El hueco 0 es el anfitrión: decide las opciones.
   *  Antes de la sesión, un «pre» como el del lobby (looks y equipación de cada uno) por el mismo BroadcastChannel. */
  function startNetTest() {
    var slot = Q.slot === '1' ? 1 : 0, link;
    try { link = new VB.Net.BcLink({ room: Q.room || 'prueba', slot: slot, lag: +Q.lag || 0, jit: +Q.jit || 0, loss: +Q.loss || 0 }); }
    catch (e) { showFatal('Este navegador no permite la prueba online entre pestañas (BroadcastChannel).', true); return; }
    var opts = null, model = Q.model === 'fluida' ? 'fluida' : 'precisa';   // Online V2: &model=fluida (las dos páginas)
    if (slot === 0) {
      var kind = Q.map && isMapId(Q.map) ? VB.Venues.kindOf(Q.map) : (Q.venue === 'beach' || Q.venue === 'hall' ? Q.venue : venueNow());
      opts = { online: true, seed: seed(), venue: kind, mapId: Q.map && isMapId(Q.map) ? Q.map : '', humans: [{ aimSet: ctx.settings.aimSet !== false, jsetAim: ctx.settings.jsetAim === true }, { aimSet: Q.aimset1 !== '0', jsetAim: Q.jsetaim1 === '1' }], djump: true, bestOf: Q.bo === '3' ? 3 : 1,
        points: +Q.points || 21, present: true, stats: true };
      // (como el lobby, netlobby begin(): Fluida sin tiempos muertos; árbitro y challenge como en Precisa desde 1.14.1)
      if (model === 'fluida') { opts.net = 'fluida'; opts.timeouts = false; }
      // (revisión) sin &map= el anfitrión elige ya la sede concreta, como hace el lobby; si no, cada página montaba un pabellón distinto
      if (!opts.mapId && VB.Venues && VB.Venues.list) {
        var vl = null; try { vl = VB.Venues.list(kind); } catch (e) { vl = null; }
        if (vl && vl.length) { var mp = vl[(opts.seed >>> 0) % vl.length]; if (isMapId(mp)) opts.mapId = mp; }
      }
    }
    var NL = VB.NetLobby, mine = NL && NL.myLook ? NL.myLook() : null, name = Q.name || (slot ? 'Invitado' : 'Anfitrión'), sent = -1e9, t0 = performance.now();
    // (pruebas: &netcap=1 = tu n.º 1 con la gorra «MTC»; &kitshirt=RRGGBB = otra camiseta; así las dos páginas, que comparten el
    //  guardado, se distinguen y se ve que llega lo del rival)
    if (mine && Q.netcap === '1' && VB.Look) { var f0 = VB.Look.sane(mine.fits[0] || VB.Look.defaults(0), 0); f0.hall.head = f0.beach.head = 'gorraMTC'; mine.fits[0] = VB.Look.sane(f0, 0); }
    if (mine && /^[0-9a-f]{6}$/i.test(Q.kitshirt || '')) mine.kit.kitShirt = parseInt(Q.kitshirt, 16);
    var tm = setInterval(function () {
      var msgs = link.poll(performance.now()), got = null;
      for (var i = 0; i < msgs.length; i++) { var c = null; if (msgs[i].ch === 'ctl') { try { c = JSON.parse(msgs[i].data); } catch (e) { } } if (c && c.k === 'pre' && !got) got = c; }
      if (!got && performance.now() - sent > 300 && performance.now() - t0 < 60000) { sent = performance.now(); link.send('ctl', JSON.stringify({ k: 'pre', name: name, look: mine, model: model })); }
      if (!got) return;
      clearInterval(tm);
      link.send('ctl', JSON.stringify({ k: 'pre', name: name, look: mine, model: model }));   // (por si el otro aún no tenía el nuestro; la sesión ignora los «pre» que sobren)
      // (prueba: si las dos páginas piden conexiones distintas, se avisa; la sesión acabará con bye 'version')
      if ((got.model === 'fluida' ? 'fluida' : 'precisa') !== model) console.warn('[VB] ?net=bc: el rival pide la conexión ' + (got.model || 'precisa') + ' y esta página ' + model);
      ctx.actions.startOnline({ slot: slot, link: link, opts: opts, name: name, rivalName: String(got.name || ''), look: { mine: mine, theirs: NL && NL.saneLook ? NL.saneLook(got.look) : null }, model: model });
      if (Q.bot === '1') ctx.netBot = VB.Net.bot(slot, +Q.botseed || (slot + 1), Q.botprof === 'flojo' ? 'flojo' : 'bueno');
    }, 50);
  }
  /** Equipaciones y looks del partido online (solo estética): las dos equipaciones las decide VB.Players.onlineKits con las de los
   *  dos (los dos lados calculan lo mismo: misma función y mismos datos); el equipo 0 de la vista es siempre el tuyo. */
  function netKit() {
    var lk = net.look || {}, me = lk.mine || {}, th = lk.theirs || {};
    var host = net.slot === 0 ? me : th, guest = net.slot === 0 ? th : me;
    var P = VB.Players, ks = P && P.onlineKits ? P.onlineKits(host.kit, guest.kit) : null;
    if (!ks) return null;
    var mineK = ks[net.slot], theirK = ks[1 - net.slot];
    return { kitShirt: mineK.kitShirt, kitAccent: mineK.kitAccent, kitShorts: mineK.kitShorts, kitPattern: mineK.kitPattern, kit1: theirK,
      looks1: th.fits && (th.fits[0] || th.fits[1]) ? [th.fits[0] || null, th.fits[1] || null] : null };
  }
  /** Nombres del marcador y de los textos («Saca la CPU» → «Saca el rival»): ui.js mira g.netCr igual que g.career. */
  function netNames(v) {
    var rv = net.sess.rivalName || net.rival || 'Rival';
    var ab = rv.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/g, '').slice(0, 3).toUpperCase() || 'RIV';
    net.cr = v.netCr = { me: 'TÚ', rival: ab, meName: net.name || 'Tú', rivalName: rv };
  }
  /** Línea de maestría de la hoja final online (ui.js masteryLine lee g.stats.mastery): copyGame no copia stats, y la g.stats de la
   *  partida canónica junta las jugadas de los DOS humanos. Se cuentan aquí de los eventos CONFIRMADOS (un toque predicho que el
   *  rollback anuló no cuenta; lo de la pestaña oculta sí, porque la partida es la misma): los toques humanos de tu equipo canónico
   *  (net.slot), con las mismas reglas que sim.js (finta > colocado > al filo en remate o dejada; rápida al colocarla). Solo usos. */
  function netMastery(list) {
    var st = net.view && net.view.stats, m = st && st.mastery, tag = VB.MASTERY && VB.MASTERY.edge ? VB.MASTERY.edge.tag : 0.5;
    if (!m || !net.view.mastery) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (!e || e.type !== 'hit' || !e.human || e.team !== net.slot) continue;
      if (e.kind === 'spike' || (e.kind === 'free' && e.shot === 'tip')) {
        var mv = e.feint ? 'feint' : e.shot === 'roll' ? 'roll' : e.edge > tag ? 'edge' : '';
        if (mv) m[mv][0]++;
      }
      if (e.tempo && e.tempo !== 'lane' && e.tempo !== 'high') m.quick[0]++;
    }
  }
  /** Fase 6: lo confirmado de un frame → maestría, estadísticas de la hoja (VB.UI.netTally, con los eventos girados para el invitado)
   *  y grabador de repeticiones (eventos canónicos; una reparación con foto o una vuelta cortan el peloteo en curso). */
  function netConfirmed(s, list) {
    if (!net || !net.view || s !== net.sess) return;
    var RPL = VB.Replay, rec = !!(RPL && RPL.enabled && RPL.enabled()), cut = s.repaired + s.stats.resyncs;
    if (rec && cut !== net.rpCut) { try { RPL.cut(); } catch (e) { reportError('Replay.cut', e); } }
    net.rpCut = cut;
    if (s.stats.rsIn !== net.stRs) { net.stRs = s.stats.rsIn; try { netStatsResync(s, list); } catch (e) { reportError('netStatsResync', e); } }
    if (!list.length) return;
    netMastery(list);
    if (VB.UI && VB.UI.netTally) { var mp = []; try { VB.NetView.mapEvents(list, net.view, net.slot, mp); VB.UI.netTally(mp); } catch (e) { reportError('UI.netTally', e); } }
    if (rec && net.model !== 'fluida') { try { RPL.onEvents(s.confirmedGame(), list); } catch (e) { reportError('Replay.onEvents', e); } }   // (Fluida: sin grabador)
    // (auditoría: copia de la hoja tras cada punto jugado con el rival presente: si luego hay que saltar a la foto del otro, se vuelve a ella)
    if (!s.solo && !s.rivalSolo && VB.UI && VB.UI._netStats) for (var i = 0; i < list.length; i++) if (list[i].type === 'point') { net.stSnap = { t: s.gcTick, st: netStClone(VB.UI._netStats()) }; break; }
  }
  function netStClone(o) {
    var c = {}, k, v;
    for (k in o) { v = o[k]; c[k] = k === 'lastHitter' ? v.slice() : k === 'blocker' || k === 'undo' ? null : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }
    return c;
  }
  /** Auditoría: esta máquina acaba de SALTAR a la partida del otro (resync aplicado). Lo que contó contra la IA no vale (se vuelve a la
   *  copia del último punto con el rival presente) y lo que jugó el otro mientras tanto no lo vio: los puntos que falten se reponen
   *  con el marcador de la foto (sin el detalle de remates y aces de ese tramo). Los eventos de `list` (ya de después) se suman luego. */
  function netStatsResync(s, list) {
    var U = VB.UI; if (!U || !U._netStats || !U.netStatsSet) return;
    var sn = net.stSnap, T = s.rsT;
    if (sn && sn.t <= T) U.netStatsSet(netStClone(sn.st));
    var st = U._netStats(), gc = s.confirmedGame(); if (!st || !st.t || !gc) return;
    var tot = [0, 0], inL = [0, 0], setsL = [0, 0], i, t;
    for (i = 0; i < (gc.setScores || []).length; i++) { tot[0] += gc.setScores[i][0] | 0; tot[1] += gc.setScores[i][1] | 0; }
    if (!gc.pendingSet && gc.mode !== 'over') { tot[0] += gc.score[0] | 0; tot[1] += gc.score[1] | 0; }
    for (i = 0; i < list.length; i++) if (list[i].type === 'point' && (list[i].team === 0 || list[i].team === 1)) { inL[list[i].team]++; if (list[i].setWon) setsL[list[i].team]++; }
    for (t = 0; t < 2; t++) {
      var vt = net.slot === 1 ? 1 - t : t, d = tot[t] - inL[t] - (st.t[vt].points | 0);
      if (d > 0) st.t[vt].points += d;
      if (st.sets) st.sets[vt] = Math.max(0, (gc.sets[t] | 0) - setsL[t]);
    }
    if (st.sets) st.setNo = st.sets[0] + st.sets[1] + 1;
    st.undo = null;
  }
  function netBuildView() {
    var s = net.sess, o = s.opts;
    if (o.mapId && isMapId(o.mapId)) forceVenue(o.mapId); else forceVenue(o.venue === 'beach' ? 'beach' : 'hall');
    var v = Sim.createGame(o);
    VB.NetView.mirror(v, s.predictedGame(), net.slot);
    v.events.length = 0;
    netNames(v);
    net.view = v;
    restoreEndButtons(); endTweaked = false; careerEnd = null;
    var kit = null; try { kit = netKit(); } catch (e) { reportError('netKit', e); }
    // (colores de los dos equipos para el marcador colgado del pabellón, arena.js: el invitado no viste el rojo del equipo 0)
    var hx = function (c) { return typeof c === 'number' ? '#' + ('00000' + (c >>> 0).toString(16)).slice(-6) : null; };
    net.cr.col = kit && kit.kit1 && hx(kit.kitShirt) && hx(kit.kit1.kitShirt) ? [hx(kit.kitShirt), hx(kit.kit1.kitShirt)] : null;
    var mf = net.look && net.look.mine && net.look.mine.fits;
    rpPre = v;   // (fase 6: el grabador no graba la vista sino la partida confirmada, en modo dual)
    setGame(v, kit, mf && (mf[0] || mf[1]) ? { fits: mf } : {});
    net.rpCut = s.repaired + s.stats.resyncs;
    // (Online V2: en Fluida no hay repeticiones en la beta; el reset con {fluida} deja el grabador bloqueado ('net') y sin «Jugadas»)
    try { if (VB.Replay && VB.Replay.reset) { if (net.model === 'fluida') VB.Replay.reset(v, { fluida: true }); else VB.Replay.reset(s.confirmedGame(), { dual: true, slot: net.slot }); } } catch (e) { reportError('Replay.reset', e); }
    VB.NetView.mapEvents(s.initEvents, v, net.slot, pendingEvents);   // (setGame vacía pendingEvents)
    setState('playing');
    // como al empezar un partido normal: texturas y programas del pabellón, los jugadores y los efectos ANTES del saque (antes no se
    // hacía en el online: el primer remate, la primera onda o el pabellón de la sala se compilaban en pleno partido y el rival esperaba).
    // El primer dibujo de todo (warmDraw) lo hace la sesión al acabar de compilar, antes del «listo» (o.warm).
    if (Q.prewarm !== '0') { prewarm('t'); prewarmPrograms(false); net.wd = Q.warmdraw !== '0'; }
  }
  /** Un frame online: entrada (de la vista al mundo canónico), sesión, espejo y eventos. Devuelve el dt de juego para los módulos. */
  function netFrame(it, realDt) {
    var s = net.sess, raw = null, v = net.view;
    net.frameAt = performance.now();
    if (v && ctx.state === 'playing') {
      buildInput(it);
      // «Continuar» en la pausa del punto y entre sets (se salta solo si los dos lo piden): cualquier botón
      if ((v.mode === 'point' || v.mode === 'over') && (edge.hit || edge.jump || edge.switchPlayer || (it && it.confirm))) s.request('skip');
      if (ctx.netBot) { try { raw = ctx.netBot(s.predictedGame()); } catch (e) { reportError('netBot', e); } }
      else raw = VB.NetView.inputToWorld({ move: simIn.move, hit: edge.hit, jump: edge.jump, jset: edge.jset }, net.slot);
      edge.hit = edge.jump = edge.jset = edge.switchPlayer = false;
    }
    net.lastMove = raw && raw.move ? raw.move : null;   // (el latido sigue con este movimiento si el navegador se salta frames)
    var r;
    try { r = s.advance(performance.now(), raw); } catch (e) { reportError('Net.advance', e); netStop(false); return 0; }
    net.r = r;
    if (VB.NetLog) { try { VB.NetLog.frame(net, r); } catch (e) { } }   // informe de red (solo lee; se guarda al acabar)
    if (r.app.length) { netApp(r.app); if (net.sess !== s) return 0; }   // (revancha: sesión nueva; la vista llega con sus opciones)
    netRecTick(r);
    if (!v && s.opts && r.status !== 'ended') { netBuildView(); v = net.view; }
    if (v) {
      // Fluida: la pose pintada se pone sobre la partida local solo mientras se copia a la vista (sin la copia entera de más por frame)
      if (net.model === 'fluida' && s.withDisplay) s.withDisplay(VB.NetView.mirror, v, net.slot); else VB.NetView.mirror(v, r.g, net.slot);
      v.netCr = net.cr;   // (copyGame deja a undefined las claves que no son de la sim)
      netConfirmed(s, r.confirmed);
      if (r.events.length) VB.NetView.mapEvents(r.events, v, net.slot, frameEvents);
      if (ctx.state === 'playing' && !net.over && frameEvents.some(isGameOver)) { net.over = true; netSettle(); setState('over'); }
    }
    netHud(r);
    return v ? realDt : 0;
  }
  /** Pestaña oculta (fase 3): tu jugador pasa a la IA (bit ai, al instante) y la sesión sigue avanzando con un temporizador (en una
   *  pestaña oculta no hay requestAnimationFrame y el rival se quedaría esperando). Un Worker de un Blob da el pulso: sus mensajes no
   *  se frenan como setInterval en segundo plano (si no se puede crear, setInterval y más tics por llamada). Al volver, el control es
   *  tuyo en el siguiente balón muerto. Lo que pasa mientras no miras no suena; el final del partido sí llega. */
  var netTk = null;
  function netAway(hidden) {
    if (!net) return;
    net.away0 = !!hidden;
    try { net.sess.setAway(!!hidden); net.sess.maxCatch = hidden ? 150 : 0; } catch (e) { }
    netTicker(true);   // (encendido todo el partido desde el 17-nov-2026: ver startOnline)
  }
  function netTicker(on) {
    if (!on) { if (netTk) { try { if (netTk.w) netTk.w.terminate(); else clearInterval(netTk.i); } catch (e) { } netTk = null; } return; }
    if (netTk) return;
    netTk = {};
    try {
      var url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'], { type: 'text/javascript' }));
      netTk.w = new Worker(url); URL.revokeObjectURL(url);
      netTk.w.onmessage = netBgTick;
    } catch (e) { netTk.w = null; netTk.i = setInterval(netBgTick, 16); }
  }
  function netBgTick() {
    if (!net || !net.sess) { netTicker(false); return; }
    var t = performance.now();
    if (net.frameAt && t - net.frameAt < 100) return;   // (la página aún pinta: ya avanza netFrame)
    var s = net.sess, r;
    // pestaña visible pero sin frames: el último movimiento del stick (sin golpes ni saltos); oculta: nada (como siempre)
    var inp = !document.hidden && net.lastMove && ctx.state === 'playing' ? { move: net.lastMove } : null;
    try { r = s.advance(t, inp); } catch (e) { reportError('Net.advance (oculta)', e); return; }
    net.r = r; net.bgTicks = (net.bgTicks | 0) + 1;
    netConfirmed(s, r.confirmed);
    if (r.app.length) { netApp(r.app); if (net.sess !== s) return; }
    netRecTick(r);
    // (el final del partido llega al volver: gameOver confirmado a la cola de eventos del siguiente frame)
    if (net.view) for (var i = 0; i < r.confirmed.length; i++) if (r.confirmed[i].type === 'gameOver') { var ev = []; VB.NetView.mapEvents([r.confirmed[i]], net.view, net.slot, ev); for (var k = 0; k < ev.length; k++) pendingEvents.push(ev[k]); }
  }
  function netEl(id, css) {
    var e = document.getElementById(id); if (e) return e;
    e = document.createElement('div'); e.id = id; e.style.cssText = css; (document.getElementById('app') || document.body).appendChild(e); return e;
  }
  /** HUD online: rival, ping, «Esperando a …», «Conexión inestable», seguir contra la IA y abandonar. */
  function netHud(r) {
    var h = netEl('netHud', 'position:absolute;top:calc(110px + var(--st,0px));left:calc(14px + var(--sl,0px));z-index:30;display:flex;gap:8px;align-items:center;' +
      'padding:5px 12px;border-radius:16px;background:var(--glass,rgba(9,14,26,.8));color:var(--fg,#f7f2ea);font:600 13px/1.35 var(--ui,system-ui);pointer-events:auto;' +
      'flex-wrap:wrap;max-width:calc(100vw - 28px - var(--sl,0px) - var(--sr,0px));box-sizing:border-box');   // (fase 4: en un teléfono el aviso largo con dos botones baja de línea)
    if (!h.hasAttribute('data-ui')) h.setAttribute('data-ui', '');   // (auditoría: un clic en el aviso no es un golpe, input.js MOUSE_UI)
    // (auditoría: con «Gira el móvil» delante no se enseña; vuelve solo al girar)
    if (!net || ctx.portraitBlock || (ctx.state === 'over' && net.view)) { h.hidden = true; if (net) netTag(r); return; }   // (la hoja final ya dice lo suyo)
    h.hidden = false;
    // (revisión F4: en los textos el nombre va como marca \u0001 y se pinta aparte; antes un replace() del nombre podía dar en el texto fijo, p. ej. «en» en «Siguiente»)
    var s = net.sess, name = s.rivalName || 'tu rival', who = '\u0001', msg = '', btn = '';
    // (revisión F3: antes de empezar siempre hay salida; salir aquí no cuenta para nadie, y a los 20 s sin noticias del rival la sesión lo deja)
    if (!r || r.status === 'connecting') { msg = s.back ? 'Volviendo al partido…' : net.epoch > 0 ? 'Empezando la revancha…' : s.host ? 'Esperando a que entre tu rival…' : 'Conectando…'; btn = '<button data-n="quit">Salir</button>'; }
    else if (r.status === 'starting') { msg = 'Contra ' + who + ' | empieza en ' + (r.startIn / 1000).toFixed(1).replace('.', ',') + ' s'; btn = '<button data-n="quit">Salir</button>'; }
    else if (r.status === 'ended') {
      var w = r.result && r.result.why;
      msg = w === 'rivalQuit' ? who + ' ha abandonado: ganas tú' : w === 'quit' ? 'Has abandonado' : w === 'version' ? (VB.Update ? VB.Update.versionText(r.result.rv) : 'Tu rival tiene otra versión del juego: reiniciad los dos') :
        w === 'rivalGone' ? who + ' no ha vuelto: ganas tú' : w === 'hostGone' ? who + ' no ha vuelto: el partido no cuenta' :
        w === 'late' ? 'Has tardado demasiado en volver: cuenta como abandono' :
        w === 'mismatch' ? 'La sala no coincide con lo anunciado: no hay partido' :
        w === 'noShow' ? (s.rivalName ? who + ' se ha ido: no hay partido' : 'Tu rival no ha llegado: no hay partido') : 'Partido terminado';
      btn = '<button data-n="menu">Volver al menú</button>';
    } else if (r.status === 'waiting' && (net.model !== 'fluida' || r.waitMs > 300)) {   // (Fluida: un «esperando» de menos de 0,3 s no se enseña: sin parpadeos)
      // (revisión F3: abandonar SIEMPRE es derrota, también si quien se cayó es el rival; por eso el botón lo dice y la cuenta atrás
      //  enseña la salida que no castiga: esperar los 60 s, seguir o no contra la IA)
      msg = 'Esperando a ' + who + '…' + (r.rivalSolo ? ' (sigue contra la IA)' : '');
      if (r.canAI) {
        msg += ' Si no vuelve en ' + Math.ceil((r.goneIn || 0) / 1000) + ' s, ' + (s.host ? 'ganas tú' : 'el partido no cuenta');
        btn = '<button data-n="ai">Seguir contra la IA</button><button data-n="quit">Abandonar (cuenta como derrota)</button>';
      }
    } else {
      // ping de la RED (WebRTC, candidate-pair; 17-nov-2026): el de los pings de control (r.ping) se procesa en frames y suma los
      // tirones de las dos máquinas y las retransmisiones del canal fiable (70 ms estables con picos de 150 en las pruebas). Se lee
      // como mucho cada 2 s (getStats) y, si no hay (BroadcastChannel, primeros segundos), el de siempre.
      var nowP = performance.now();
      if (net.link && net.link.info && (!net.iceAt || nowP - net.iceAt > 2000)) { net.iceAt = nowP; try { var inf = net.link.info(); net.iceRtt = inf && inf.rtt > 0 ? inf.rtt : 0; } catch (e) { net.iceRtt = 0; } }
      var shownPing = net.iceRtt > 0 ? net.iceRtt : r.ping;
      var pc = shownPing > 150 ? 'var(--amber,#ffb238)' : 'inherit', v = net.view;
      // (fase 4, guía de estilo de textos: datos del HUD separados con la barra fina, lo secundario entre paréntesis)
      msg = 'Contra ' + who + ' | <span style="color:' + pc + '">' + shownPing + ' ms</span>' + (net.model === 'fluida' ? ' <span style="opacity:.7;font-weight:500">(Fluida)</span>' : '') + (r.unstable ? ' | Conexión inestable' : '') + (r.solo ? (r.gone ? (r.valid ? ' | No ha vuelto: ganas tú (contra la IA)' : ' | Contra la IA (no cuenta)') : ' | Contra la IA (puede volver en ' + Math.ceil((r.goneIn || 0) / 1000) + ' s)') : '');
      // fase 3: pausa de 10 s entre sets (decisión 5): cuenta atrás y «Continuar»; se salta cuando los dos lo han pulsado
      if (v && v.pendingSet && v.mode === 'point' && ctx.state === 'playing') {
        var sk = v.skipReq || [false, false], left = Math.max(0, Math.ceil(v.timer || 0));
        msg = 'Siguiente set en ' + left + ' s' + (sk[0] ? (sk[1] ? '' : ', esperando a ' + who) : sk[1] ? ' (' + who + ' ya quiere seguir)' : '');
        if (!sk[0]) btn = '<button data-n="skip">Continuar</button>';
      } else if (net.away0) msg += ' (tu jugador lo lleva la IA)';
      if (net.menu) btn = r.gone ? '<button data-n="quit">Salir</button>' : '<button data-n="quit">Abandonar (cuenta como derrota)</button>';
    }
    if (r && r.status === 'ended' && net.recRes && net.recRes.cap) msg += '. Nuevo en tu vestuario: Online Beta Tester';
    var key = msg + who + name;
    netHudPlace(h);
    // (auditoría: los botones solo se rehacen si cambian; la cuenta atrás del texto no les quita el foco del mando o del teclado)
    if (h._b !== btn || !h.firstChild) {
      h._b = btn; h._k = null; h.innerHTML = '<span></span>' + btn;
      var bs = h.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) {
        bs[i].style.cssText = 'font:700 12px var(--ui,system-ui);padding:3px 10px;border-radius:999px;border:0;background:var(--hot,#ff5a2c);color:#fff;cursor:pointer';
        bs[i].onclick = function (ev) { var n = ev.currentTarget.getAttribute('data-n'); if (n === 'ai') ctx.actions.netVsAI(); else if (n === 'skip') ctx.actions.netSkip(); else ctx.actions.netQuit(); };
        bs[i].onfocus = function (ev) { ev.currentTarget.style.boxShadow = '0 0 0 2px #fff'; };
        bs[i].onblur = function (ev) { ev.currentTarget.style.boxShadow = ''; };
      }
    }
    if (h._k !== key) {
      h._k = key;
      h.firstChild.innerHTML = msg.split(who).join('<b class="nn"></b>');
      var nn = h.querySelectorAll('.nn'); for (var j = 0; j < nn.length; j++) nn[j].textContent = name;   // (el nombre del rival nunca se pinta como HTML)
    }
    netTag(r);
  }
  /** #netHud justo debajo del marcador (#sb), nunca encima (se mira cada medio segundo: el marcador cambia de alto con los sets). */
  var _hudPlaceAt = 0;
  function netHudPlace(h) {
    var t = performance.now(); if (t - _hudPlaceAt < 500) return; _hudPlaceAt = t;
    var sb = document.getElementById('sb'), app = document.getElementById('app') || document.body;
    if (!sb || !sb.offsetParent) return;   // (sin marcador a la vista: se queda donde estaba)
    var r = sb.getBoundingClientRect(), a = app.getBoundingClientRect();
    if (r.height > 0) { h.style.top = Math.round(r.bottom - a.top + 8) + 'px'; h.style.left = Math.round(r.left - a.left) + 'px'; }
  }
  /** Auditoría: mando y teclado en el HUD online (antes solo ratón o dedo, o Tab + Intro). Partido online terminado ('ended': abandono,
   *  rival que no vuelve…): Esc / Start / Intro / A / B → «Volver al menú». Con botones a la vista: LB / RB (y la cruceta si el partido
   *  no corre: conectando, cuenta atrás o esperando) eligen botón y A lo pulsa. En pleno partido nunca se pulsa nada sin elegirlo antes:
   *  A sigue siendo golpear. true = el frame de entrada ya se ha usado (no golpea ni pausa). */
  function netHudKeys(it) {
    var r = net.r, h = document.getElementById('netHud');
    if (r && r.status === 'ended') {
      if (it.pause || it.confirm || it.navOk || it.navBack) { ctx.actions.netQuit(); return true; }
      return false;
    }
    if (!h || h.hidden) return false;
    var bs = h.querySelectorAll('button'); if (!bs.length) { net.hx = 0; return false; }
    var free = !r || r.status !== 'playing', a = document.activeElement, cur = -1, i, d = it.navTab || 0;
    for (i = 0; i < bs.length; i++) if (bs[i] === a) cur = i;
    if (!d && free) { var x = it.mx || 0, sg = x > 0.6 ? 1 : x < -0.6 ? -1 : 0; if (sg && sg !== net.hx) d = sg; net.hx = sg; }
    if (d) { bs[cur < 0 ? (d > 0 ? 0 : bs.length - 1) : (cur + d + bs.length) % bs.length].focus(); return true; }
    if (cur >= 0 && it.device === 'gamepad' && (it.navOk || it.confirm)) { bs[cur].click(); return true; }   // (con el teclado, Intro ya pulsa el botón enfocado él solo)
    if (cur < 0 && free && it.device === 'gamepad' && it.navOk) { bs[0].focus(); return true; }
    return false;
  }
  /** Flechita con el NOMBRE del rival encima de su jugador (nunca la IP ni el correo). z-index 2: por debajo del marcador (#hud, 3). */
  var _tagV = null;
  function netTag(r) {
    var a = netEl('netTag', 'position:absolute;z-index:2;pointer-events:none;transform:translate(-50%,-100%);color:#fff;font:700 13px var(--ui,system-ui);' +
      'text-shadow:0 1px 3px rgba(0,0,0,.8);text-align:center;white-space:nowrap');
    var v = net && net.view, p = v && v.hum && v.hum[1] && v.hum[1].p;
    if (!p || !ctx.camera || !VB.toThree || ctx.state !== 'playing' || !r || r.status === 'connecting') { a.hidden = true; return; }
    if (!_tagV) _tagV = new THREE.Vector3();
    VB.toThree(p.x, p.y, (p.z || 0) + 2.25, _tagV); _tagV.project(ctx.camera);
    if (_tagV.z > 1 || _tagV.z < -1) { a.hidden = true; return; }
    var nm = net.sess.rivalName || 'Rival';
    if (a._n !== nm) {
      a._n = nm; a.textContent = '';
      var t = document.createElement('div'); t.textContent = nm;
      var ar = document.createElement('div'); ar.textContent = '▼'; ar.style.fontSize = '11px';
      a.appendChild(t); a.appendChild(ar);
    }
    a.hidden = false;
    a.style.left = ((_tagV.x + 1) * 0.5 * ctx.width) + 'px'; a.style.top = ((1 - _tagV.y) * 0.5 * ctx.height) + 'px';
  }
  /** E6: arranca un ejercicio (ver startMatch). createGame({drill}) monta la 1ª repetición; la sim no emite point/whistle/gameOver
   *  y al acabar la 10ª emite drillEnd (frame → 'over'). g.gym = id (marca para ui.js). */
  function startDrill(id, opts) {
    var auto = !!opts.autopilot;
    if (!ctx.debug && !auto && call('UI', 'bootBusy')) { startWait = opts; return; }
    startWait = null;
    call('Audio', 'unlock');
    tryFullscreen();
    ctx.frozen = false;
    applyVenuePend();
    var free = id === 'free', own = !auto && !Q.debug, cd = opts.careerDrill && !free ? opts.careerDrill : null;
    // ejercicio de la Carrera: en la sede de tu Carrera (cd.venue: playa o pabellón, como sus partidos; toMenu la suelta); los del
    // Entrenamiento de Partido rápido, en el escenario del ajuste. (En el pabellón el ejercicio sigue siendo 2 contra 2: la sim no
    // tiene ejercicios de 6.)
    var dv = cd && (cd.venue === 'hall' || cd.venue === 'beach') ? cd.venue : null;
    if (dv) forceVenue(dv); else unforceVenue();
    animHooks(null);
    // sesión de entrenamiento de la Carrera (opts.careerDrill = VB.Career.drillSetup): tu jugador de Carrera (atributos con la fatiga,
    // tus insignias) y tu compañero o uno de tu club, con los petos de entreno (cd.scrim: camiseta de entreno, tu peto del color del
    // club y el lima para la CPU); también con autopilot (pruebas: la IA juega por ti)
    var g = Sim.createGame({ demo: false, seed: seed(), drill: id, venue: dv || venueNow(), autopilot: auto, present: false, rookie: false,
      difficulty: free ? ctx.settings.difficulty : 'normal', ctrl: free ? (Q.ctrl || ctx.settings.ctrlMode) : 'one', ctrlIdx: 0,
      points: ctx.settings.setPoints,
      attrs: cd ? cd.attrs : own && !Q.noattrs && VB.Prog ? VB.Prog.attrs() : null,
      badges: cd ? cd.badges : own && !Q.nobadges ? squadBadges() : null,
      // E1: la maestría también se practica en los ejercicios (finta y golpe colocado en Remate, colocación dirigida en Colocación)
      mastery: !auto, aimSet: ctx.settings.aimSet !== false, djump: !auto, jsetAim: ctx.settings.jsetAim === true });
    g.gym = g.drill ? id : null;
    // marca de ejercicio de Carrera: al acabar (drillEnd) cuenta como sesión (careerDrillDone) y la hoja final vuelve al hub (ui.js)
    if (cd && g.drill) g.careerDrill = { id: id, mode: cd.mode, n: cd.n, max: cd.max, attrName: cd.attrName || '', done: false, res: null };
    endTweaked = false; careerEnd = null;
    restoreEndButtons();
    // (Vestuario: en la sesión de Carrera tu atleta lleva el aspecto de la Carrera, y el compañero de playa el suyo, como en el partido;
    // en el partidillo de petos de la sesión, cd.scrim va con la equipación)
    setGame(g, cd ? Object.assign({}, cd.kit || {}, cd.scrim ? { scrim: cd.scrim } : null) : null, cd ? careerLookOpts({ mate: cd.mode === 'hall' ? null : careerMateName() }, cd.mode === 'hall') : undefined);
    setState('playing');
    if (Q.prewarm !== '0') { prewarm('t'); prewarmPrograms(false); }
    if (!auto && !opts.noIntro && Q.intro !== '0' && (!ctx.debug || Q.intro === '1')) introStart(opts);
  }
  /** Nombre del compañero de playa de la Carrera (para su aspecto en la sesión de entrenamiento, como en el partido) o null. */
  function careerMateName() {
    try { var c = VB.Career && VB.Career.get ? VB.Career.get() : null; return c && c.mate && c.mate.name ? String(c.mate.name) : null; } catch (e) { return null; }
  }
  /** Sesión de entrenamiento de la Carrera (career-ui.js, bloque Entrenamiento): el ejercicio id con tu jugador de Carrera. Si no se
   *  puede entrenar ahora (sin sesiones, fatiga, sin partido), vuelve al hub. auto = la IA juega por ti (pruebas). */
  ctx.actions.startCareerDrill = function (id, auto) {
    var K = VB.Career, s = null;
    try { s = K && K.drillSetup ? K.drillSetup(id) : null; } catch (e) { reportError('Career.drillSetup', e); }
    if (!s || !drillId(id)) { if (VB.CareerUI && VB.CareerUI.open) VB.CareerUI.open('hub', { train: true }); return false; }
    ctx.actions.startMatch({ drill: id, careerDrill: s, autopilot: !!auto });
    return true;
  };
  /** drillEnd de un ejercicio de Carrera: apunta la sesión una sola vez (VB.Career.drillDone, a la Carrera del ejercicio). Con ella,
   *  d.next = el ejercicio que toca en la siguiente sesión del plan del entrenador (botón «Siguiente sesión» de la hoja final, ui.js)
   *  si quedan sesiones y la fatiga deja; null si no (o si el plan dice descansar). */
  function careerDrillDone(g) {
    var d = g && g.careerDrill; if (!d || d.done) return;
    d.done = true; d.next = null;
    try { d.res = VB.Career && VB.Career.drillDone ? VB.Career.drillDone(d.mode, d.id, g.drill ? g.drill.total | 0 : 0) : null; } catch (e) { reportError('Career.drillDone', e); d.res = null; }
    try {
      var E = VB.Career && (d.mode === 'hall' ? VB.Career.hall : VB.Career.beach), inf = d.res && d.res.ok && E && E.trainInfo ? E.trainInfo() : null;
      // el siguiente del plan que se ve en pantalla (con los cambios a mano de «Cambiar», que solo conoce career-ui)
      var CU = VB.CareerUI, nx = inf && inf.can && inf.plan ? (CU && CU.nextPlanned ? CU.nextPlanned(inf) : inf.plan[inf.used]) : null;
      if (nx && drillId(nx) && inf.drills.some(function (x) { return x.id === nx; })) d.next = nx;
    } catch (e) { reportError('Career.trainInfo', e); d.next = null; }
  }
  /** Insignias equipadas del escuadrón de Partido rápido para createGame({badges}) (null sin js/badges.js o sin ninguna). */
  function squadBadges() {
    var B = VB.Badges; if (!B) return null;
    try {
      if (B.forSquad) return B.forSquad();
      if (!B.forPlayer || !VB.Prog || !VB.Prog.squad) return null;
      var sq = VB.Prog.squad(), b = [B.forPlayer(sq[0]), B.forPlayer(sq[1])].map(function (o) { return o && Object.keys(o).length ? o : null; });
      return b[0] || b[1] ? [b, null] : null;
    } catch (e) { reportError('Badges.forSquad', e); return null; }
  }
  // ---------- Carrera (js/career.js + js/career-ui.js) ----------
  // startCareerMatch: el próximo partido de la Carrera (atributos de los 4, tus insignias, puntos, perfil del rival, control y
  // equipación del club). Al llegar gameOver, VB.Career.matchDone (antes de que ui.js pinte la hoja final, para que badges.js
  // cierre las insignias sobre tu atleta y no sobre el escuadrón); la hoja final ofrece «Volver a la Carrera».
  var endTweaked = false, careerEnd = null, menuOnly = false, careerEndXv = null, careerSes = null;
  // «Menú principal» de la hoja final de Carrera va al menú principal (antes abría el hub igual que «Volver a la Carrera»).
  // ui.js llama a toMenu() con los dos botones: se marca aquí, en captura, antes de que llegue su manejador.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#btnMenu') : null;
    if (t && endTweaked && ctx.game && ctx.game.career) menuOnly = true;
  }, true);
  ctx.actions.startCareerMatch = function () {
    var K = VB.Career; if (!K || !K.matchSetup) return false;
    var m = null; try { m = K.matchSetup(); } catch (e) { reportError('Career.matchSetup', e); }
    if (!m) { if (VB.CareerUI && VB.CareerUI.open) VB.CareerUI.open(); return false; }
    if (K.abortMatch) K.abortMatch();
    careerIntroData(K, m.career);   // B5: puestos, cara a cara, rival y liga para la previa (solo lectura)
    // B6: sesiones de entrenamiento hechas antes de este partido (matchDone cierra la jornada y pone el contador a 0)
    careerSes = null; try { var ti = K.trainInfo ? K.trainInfo() : null; if (ti) careerSes = { used: ti.used | 0, max: ti.max | 0 }; } catch (e) { careerSes = null; }
    // C3: el jefe del circuito es el n.º 1 rival (su club excluye el de tu rival personal: no coincide con rivalNum)
    var bossNum = m.career && m.career.rivalNum == null && (m.career.bossNum | 0) > 0 ? m.career.bossNum | 0 : 0;
    var n = null; try { n = K.next && K.next(); } catch (e) { } var vid = n && VB.Venues && VB.Venues.forMatch ? VB.Venues.forMatch(n, m.venue || 'beach') : null; // sede del partido (js/venues.js, tabla EMBLEM)
    ctx.actions.startMatch({ career: m.career, venueMap: vid || undefined, attrs: m.attrs, badges: m.badges, points: m.points, difficulty: m.difficulty, rookie: !!m.rookie, ctrl: 'one', ctrlIdx: 0, ref: m.ref, // en la Carrera solo llevas a tu jugador (menús v2: ni las carreras guardadas con «los dos»)
      venue: m.venue || 'beach', // vóley playa: Platja Llarga y sus reglas (VB.Career.matchSetup().venue); la Carrera de pista, 'hall'
      format: m.format === '6v6' ? '6v6' : undefined, ctrlRole: m.ctrlRole || undefined, // Carrera de pista (lote C): 6v6 en tu puesto
      // titularidad y cambios (notes/titularidad-y-cambios.md §I.1): tal cual a Sim.createGame
      bench: m.bench || undefined, meSlot: m.meSlot, meBench: m.meBench, names: m.names || undefined, coach: m.coach || undefined,
      // equipación del club rival (Players.setKit st.rival); en la pista también kitLibero (color del líbero del club, que usa setKit, y con él la 2ª del rival si choca)
      kit: m.kit ? Object.assign({}, m.kit, { rival: m.rivalKit || null }) : null,
      // tus dorsales (sim: opts.nums; la pista los trae hechos en m.nums) y, en la playa, en el duelo con tu rival personal (career-life
      // setup → m.career.rivalNum), su dorsal en el n.º 1 rival (E2: players lo reconoce con setRival; cambia su aspecto porque el hash
      // del muñeco usa el dorsal)
      nums: m.nums || (m.career ? [[m.career.num | 0 || null, m.career.mateNum | 0 || null], m.career.rivalNum != null && (m.career.rivalNum | 0) > 0 ? [m.career.rivalNum | 0, (m.career.rivalNum | 0) === 9 ? 3 : null] : bossNum ? [bossNum, bossNum === 9 ? 3 : null] : null] : undefined) });
    // (si el rival lleva el 9, el 2º CPU, que es el 9 por defecto, pasa al 3: si no, los dos harían de rival en players.js)
    return true;
  };
  /** Partidillo de prueba de la oferta i (al elegir club o invitación de mitad / fin de temporada; VB.Career.trialSetup): un solo set a 15 con petos (kit.scrim: los dos
   *  equipos con la camiseta de entreno del club y peto naranja / lima, players.js), en la playa con tu pareja de prueba contra una
   *  pareja del club y en la pista con los suplentes contra los titulares. No toca la jornada (no la hay): al acabar, careerEvents
   *  llama a VB.Career.trialDone en vez de matchDone. Reiniciar o abandonar gasta la prueba (trialForfeit: suspendida, se pierde la
   *  oferta). Sin prueba, vuelve a las ofertas. */
  ctx.actions.startCareerTrial = function (i) {
    var K = VB.Career; if (!K || !K.trialSetup) return false;
    var m = null; try { m = K.trialSetup(i | 0); } catch (e) { reportError('Career.trialSetup', e); }
    if (!m) { if (VB.CareerUI && VB.CareerUI.open) VB.CareerUI.open('pick'); return false; }
    if (K.abortMatch) K.abortMatch();
    var six = m.format === '6v6', cs = m.career || {};
    ctx.actions.startMatch({ career: cs, attrs: m.attrs, badges: m.badges, points: m.points, sets: 1, difficulty: m.difficulty, rookie: !!m.rookie, ctrl: 'one', ctrlIdx: 0, ref: m.ref,
      venue: m.venue || 'beach', format: six ? '6v6' : undefined, ctrlRole: m.ctrlRole || undefined, names: m.names || undefined,
      // los petos van sobre la equipación del club (sin rival: los dos equipos son del mismo club, players.js se salta rivalPick)
      kit: m.kit ? Object.assign({}, m.kit, { scrim: m.scrim || {} }) : { scrim: m.scrim || {} },
      nums: m.nums || [[cs.num | 0 || null, cs.mateNum | 0 || null], null] });
    return true;
  };
  /** Prueba dejada a medias (notes/nota-en-directo-spec.md §5): why 'restart' («Reiniciar prueba») o 'quit' («Abandonar la
   *  prueba»). VB.Career.trialForfeit la resuelve como suspendida (letra F, se pierde la oferta) con la nota en directo de ese momento,
   *  y deja el resultado en careerEnd para que toMenu vuelva a las ofertas con la tarjeta «Prueba suspendida». Después, abortMatch.
   *  false si career.js no sabe gastarla (versión vieja sin trialForfeit): entonces todo sigue como antes. */
  function trialForfeit(cs, why) {
    var K = VB.Career; if (!K || typeof K.trialForfeit !== 'function' || !cs) return false;
    var r = null; try { r = K.trialForfeit(cs.mode, cs.offer, why); } catch (e) { reportError('Career.trialForfeit', e); }
    careerEnd = Object.assign({ trial: true }, r || { none: true });
    if (K.abortMatch) { try { K.abortMatch(); } catch (e) { } }
    return true;
  }
  function restoreEndButtons() {
    var tb = document.getElementById('endTrial'); if (tb && tb.parentNode) tb.parentNode.removeChild(tb);   // (hoja de la prueba)
    var tr = document.getElementById('endTrialRt'); if (tr && tr.parentNode) tr.parentNode.removeChild(tr);   // (y su «Lo mejor / A mejorar»)
    var er = document.getElementById('endRt'); if (er && er.parentNode) er.parentNode.removeChild(er);   // (el de la nota en directo del Resumen)
    var e = document.getElementById('end'); if (e) e.classList.remove('career', 'trial'); // CSS de la hoja de Carrera a 667×375 (career-ui.js)
    var a = document.getElementById('btnAgain'); if (a && a.getAttribute('data-cr')) { a.textContent = a.getAttribute('data-cr'); a.removeAttribute('data-cr'); }
    var m = document.getElementById('btnMenu'); if (m && m.getAttribute('data-cr')) { m.textContent = m.getAttribute('data-cr'); m.removeAttribute('data-cr'); }
  }
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  function escHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  /** Hoja final del partidillo de prueba (tras showEnd y endRecap de ui.js, en el frame; los partidos de Carrera van a
   *  VB.UI.endCareer, el Resumen de la jornada de B6): «Volver a la Carrera» en vez de «Siguiente jornada» y trialEndSheet. */
  function careerTrialSheet(g, s) {
    endTweaked = true;
    var $ = function (id) { return document.getElementById(id); };
    var en = $('end'), a = $('btnAgain'), alt = $('btnAgainAlt'), mn = $('btnMenu'), t = $('endTitle'), k = $('endKicker'), rec = $('endRecord');
    if (a) { if (!a.getAttribute('data-cr')) a.setAttribute('data-cr', a.textContent); a.textContent = 'Volver a la Carrera'; }
    if (mn) { if (!mn.getAttribute('data-cr')) mn.setAttribute('data-cr', mn.textContent); mn.textContent = 'Menú principal'; mn.hidden = false; }
    if (alt) alt.hidden = true;
    if (t) t.classList.remove('long');
    trialEndSheet(g, s, en, t, k, rec);
  }
  /** Nota en directo en el Resumen de la jornada (tras VB.UI.endCareer): «Lo mejor / A mejorar» en compacto (rtBlock), como un bloque
   *  más del Resumen (.rc-b, con su etiqueta), justo después del MVP; la nota ya la enseña el Resumen. Sin nota (s. c.) o sin rt, nada. */
  function careerRtBlock(s) {
    var sum = document.getElementById('endSum');
    if (!sum || !s || s.nota == null || !s.rt) return;
    var old = document.getElementById('endRt'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var rb = rtBlock(s.nota, s.rt, true); if (!rb.firstChild) return;
    var bx = document.createElement('div'); bx.id = 'endRt'; bx.className = 'rc-b rc-rt';
    var hd = document.createElement('span'); hd.className = 'rc-h'; hd.textContent = 'Tu partido';
    var c = document.createElement('div'); c.className = 'rc-c'; c.appendChild(rb);
    bx.appendChild(hd); bx.appendChild(c);
    var mv = sum.querySelector('.rc-mvp'), ref = mv ? mv.nextSibling : sum.querySelector('.rc-b');
    if (mv) bx.style.setProperty('--i', mv.style.getPropertyValue('--i') || '0');
    sum.insertBefore(bx, ref || null);
    fitChips(rb);
  }
  /** Franja de color de la nota (notes/nota-en-directo-spec.md §6.4; la misma que la píldora de ui.js). */
  function rtBand(v) { v = Math.round(v * 10) / 10; return v < 5 ? 'rt-bad' : v < 6 ? 'rt-low' : v < 7 ? 'rt-mid' : v < 8 ? 'rt-good' : 'rt-top'; }
  function rtFmt(d) {
    var R = VB.Rating; if (R && typeof R.fmt === 'function') { try { return R.fmt(d); } catch (e) { } }
    var r = Math.round(d * 10) / 10; return r ? (r > 0 ? '+' : '−') + fmt1(Math.abs(r)) : '';
  }
  /** Pastillas «3 × Ace +0,3» (hasta 3) de una lista best / worst de VB.Rating.close, o '' sin nada. */
  function rtChips(list) {
    var a = (list || []).filter(function (x) { return x && x.txt; }).slice(0, 3).map(function (x) {
      var f = rtFmt(+x.d || 0);
      return { h: '<i>' + ((x.n | 0) > 1 ? (x.n | 0) + ' × ' : '') + escHtml(x.txt) + '</i>' + (f ? ' <b>' + f + '</b>' : '') };
    });
    if (!a.length) return '';
    if (VB.UI && VB.UI.sep) { try { return VB.UI.sep(a, 'c'); } catch (e) { } }
    return a.map(function (x) { return '<span class="chip">' + x.h + '</span>'; }).join(' ');
  }
  /** Bloque de la nota en directo de la hoja final (.end-rt; CSS en career-ui.js): a la izquierda la nota grande con el color de su
   *  franja y «Empezaste en 6,0»; a la derecha «Lo mejor» y «A mejorar». compact (prueba): solo las dos filas, sin la nota grande. */
  function rtBlock(nota, rt, compact) {
    var d = document.createElement('div'); d.className = 'end-rt' + (compact ? ' cmp' : '');
    var b = rtChips(rt.best), w = rtChips(rt.worst), st = VB.Rating && typeof VB.Rating.START === 'number' ? VB.Rating.START : 6;
    var rows = (b ? '<div class="er-r up"><span class="er-h">Lo mejor</span><span class="er-c">' + b + '</span></div>' : '') +
      (w ? '<div class="er-r dn"><span class="er-h">A mejorar</span><span class="er-c">' + w + '</span></div>' : '');
    d.innerHTML = (compact ? '' : '<div class="er-n ' + rtBand(nota) + '" role="img" aria-label="Nota del partido ' + fmt1(nota) + ', empezaste en ' + fmt1(st) + '"><i aria-hidden="true"><small>NOTA</small><b>' + fmt1(nota) + '</b></i><span aria-hidden="true">Empezaste en ' + fmt1(st) + '</span></div>') +
      (rows ? '<div class="er-l">' + rows + '</div>' : '');
    return d;
  }
  /** Una fila por lista en .end-rt (sin que la hoja crezca y «Menú principal» se salga): quita las pastillas del final que no caben
   *  a lo ancho (las oculta), dejando al menos 1. La hoja cambia de ancho mientras sale (celebración, hoja acoplada): se vuelve a
   *  medir con cada cambio de tamaño (ResizeObserver; sin él, una vez al momento). */
  function fitChips(box) {
    if (typeof ResizeObserver === 'function') { new ResizeObserver(function () { fitChipsNow(box); }).observe(box); return; }
    fitChipsNow(box);
  }
  function fitChipsNow(box) {
    var cs = box.querySelectorAll('.er-c');
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], ch = c.querySelectorAll('.chip'), j;
      c.classList.remove('fit1');
      for (j = 0; j < ch.length; j++) ch[j].style.display = '';
      if (!(c.clientWidth > 0)) continue;
      for (j = ch.length - 1; j > 0 && c.scrollWidth > c.clientWidth + 1; j--) ch[j].style.display = 'none';
      // ni la 1ª cabe entera (390 de ancho, «33 × Toque flojo −0,5»): el texto se corta con «…» y la cifra se queda
      if (c.scrollWidth > c.clientWidth + 1) c.classList.add('fit1');
    }
  }
  /** Hoja final del partidillo de prueba (careerTrialSheet; s = VB.Career.trialDone): el veredicto de título («¡Te fichan!» /
   *  «Esta vez no»), la letra grande con la nota, los 3 objetivos con su marca y, si no, cuántas ofertas quedan. Sin experiencia
   *  (la prueba no da). Va en #endTrial, en la pestaña Resumen (#endSum, en lugar del resumen de jornada, que no aplica), y sin la
   *  comparación de equipos (#end.trial: estilos en career-ui.js; restoreEndButtons lo quita). */
  function trialEndSheet(g, s, en, t, k, rec) {
    var cs = g.career || {}, club = (s && s.clubName) || cs.clubName || cs.rivalName || '';
    var old = document.getElementById('endTrial'); if (old && old.parentNode) old.parentNode.removeChild(old);
    old = document.getElementById('endTrialRt'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var sm = document.getElementById('endSum'), mv = document.getElementById('endMvp'), box = document.createElement('div'); box.id = 'endTrial'; box.className = 'end-rec end-trialbox';
    if (sm) { sm.innerHTML = ''; sm.appendChild(box); } else if (mv && mv.parentNode) mv.parentNode.insertBefore(box, mv); else if (rec) rec.appendChild(box);
    rec = box;
    if (en) en.classList.add('trial');
    // (sin «1 set a 15»: ya lo dice la pastilla del set; en el móvil el antetítulo partía en 2 líneas y la 2.ª pisaba el título)
    if (k) { var kp = ['Partidillo de prueba', club]; if (VB.UI && VB.UI.sep) k.innerHTML = VB.UI.sep(kp, 'd'); else k.textContent = kp.filter(Boolean).join(', '); }
    if (!s || s.none) {   // (la oferta ya no estaba: guardado tocado a mano o la Carrera cambió por detrás)
      if (t) { t.textContent = 'Prueba sin resolver'; t.classList.add('long'); }
      if (rec) { var dn = document.createElement('div'); dn.className = 'end-xp'; dn.innerHTML = '<span>La oferta de la prueba ya no está disponible.</span>'; rec.appendChild(dn); }
      return;
    }
    var L = String(s.letter || 'F'), lc = L === 'A+' || L === 'A' ? 'a' : L === 'B' ? 'b' : L === 'C' ? 'c' : 'd', left = s.left | 0, fo = !!s.forfeit;
    if (t) { t.textContent = fo ? 'Prueba suspendida' : s.pass ? '¡Te fichan!' : 'Esta vez no'; t.classList.toggle('long', t.textContent.length > 12); }   // («Prueba suspendida», a 2 líneas: se cortaba)
    if (!rec) return;
    var lefts = 'Te ' + (left === 1 ? 'queda 1 oferta' : 'quedan ' + left + ' ofertas') + '.';
    // (suspendida: dejaste el partidillo a medias, al reiniciar o abandonar; notes/nota-en-directo-spec.md §5)
    var why = fo ? 'Dejaste el partidillo a medias: ' + escHtml(club || 'el club') + ' no te espera. ' + lefts : s.pass ? escHtml(club) + ' te ficha: 1 temporada de contrato.' : lefts;
    if (s.luck && !fo) why += s.pass ? ' Con C decidía la suerte, y ha salido de cara.' : ' Con C decidía la suerte, y no ha salido.';
    // de dónde sale la nota: la del partido (nota en directo) más lo que suman los objetivos («Nota del partido 6,4 + 0,5 de objetivos»)
    if (s.rt && s.nota != null && !fo) {
      var tg = (VB.Career && typeof VB.Career.TRIAL_GOAL === 'number' ? VB.Career.TRIAL_GOAL : 0.25) * (s.met != null ? s.met | 0 : (s.goals || []).filter(function (o) { return o && o.ok === true; }).length);
      // (los objetivos van a 0,25 y la nota a 0,1: la base que se ve es nota − objetivos, a dos decimales si hace falta, para que la
      // suma cuadre; con el tope de 10, sin desglose)
      var f2 = function (v) { return (Math.round(v * 100) / 100).toFixed(2).replace(/0$/, '').replace('.', ','); };
      if (tg < 0.04) why += ' Nota del partido ' + fmt1(s.nota) + '.';
      else if ((s.base != null ? s.base : s.nota - tg) + tg <= 10.001) why += ' Nota del partido ' + f2(Math.max(0, s.nota - tg)) + ' + ' + f2(tg) + ' de objetivos.';
      else why += ' Nota del partido con los objetivos: ' + fmt1(s.nota) + ' (el tope es 10).';
    }
    // objetivos: ✓ / ✗ con lo que has hecho, en pastillas junto a la letra (a 844×390 la hoja cabe entera)
    var gl = (s.goals || []).filter(Boolean), gh = gl.length ? '<div class="et-goals">' + gl.map(function (o) {
      var ok = o.ok === true, no = o.ok === false;
      return '<span class="' + (ok ? 'ok' : no ? 'no' : '') + '"><i aria-hidden="true">' + (ok ? '✓' : no ? '✗' : '–') + '</i>' + escHtml(o.txt) + (o.v != null ? ' <small>(' + (o.v | 0) + ')</small>' : '') + '<span class="sr">' + (ok ? ', cumplido' : no ? ', no cumplido' : '') + '</span></span>';
    }).join('') + '</div>' : '';
    var d = document.createElement('div'); d.className = 'end-trial ' + (s.pass ? 'pass' : 'fail');
    d.innerHTML = '<div class="et-l l-' + lc + '" aria-label="Nota ' + escHtml(L) + '"><b>' + escHtml(L) + '</b><small>' + (fo ? '—' : s.nota != null ? fmt1(s.nota) : 'NOTA') + '</small></div>' +
      '<div class="et-t"><strong>' + (fo ? 'No superas la prueba' : s.pass ? 'Superas la prueba' : 'No superas la prueba') + '</strong><span>' + why + '</span>' + (fo ? '' : gh) + '</div>';
    rec.appendChild(d);
    // nota en directo: «Lo mejor / A mejorar» en compacto, bajo los objetivos (tras #endTrial; CSS en career-ui.js)
    if (s.rt && !fo) {
      var rb = rtBlock(s.nota, s.rt, true); rb.id = 'endTrialRt';
      if (rb.firstChild && box.parentNode) { box.parentNode.insertBefore(rb, box.nextSibling); fitChips(rb); }
    }
  }
  /** B6: lo que la hoja final de Carrera necesita además del resumen de VB.Career.matchDone (solo lectura, tras matchDone): la tabla de
   *  tu liga para cortar 3 filas (tbl, myId, abreviaturas), tu puesto, qué viene ahora (next: 'league' | 'semi' | 'final' | 'cuartos' |
   *  'octavos' | 'off'), la barra de nivel (si la Carrera exporta need) y las sesiones de entrenamiento hechas antes del partido (ses). */
  function careerEndX(K, ses) {
    var x = { ses: ses || null };
    try {
      var c = K.get ? K.get() : null; if (!c) return x;
      var me = K.myClub ? K.myClub(c) : null, hall = K.MODE === 'hall';
      if (me && K.table) {
        x.tbl = hall ? K.table(c, me.lid) : K.table(c, me.lvl); x.myId = me.id; x.short = {};
        (c.clubs || []).forEach(function (k) { if (k && k.id != null) x.short[k.id] = k.short || k.name || ''; });
      }
      if (me && K.posOf) x.pos = K.posOf(c, me.id) | 0;
      if (c.review && c.review.pos) x.pos = c.review.pos | 0;
      var n = c.phase === 'off' ? null : K.next ? K.next(c) : null;
      if (!n) x.next = 'off';
      else if (n.kind === 'league') x.next = 'league';
      else { var st = String(n.label || '').split(' · ').pop().toLowerCase(); x.next = /^final/.test(st) ? 'final' : /semi/.test(st) ? 'semi' : /cuartos/.test(st) ? 'cuartos' : /octavos/.test(st) ? 'octavos' : 'league'; }
      if (K.need && c.player && c.player.lvl != null) x.bar = { cur: c.player.xp | 0, need: K.need(c.player.lvl) | 0 };
    } catch (e) { reportError('careerEndX', e); }
    return x;
  }
  // ---------- Presentación del partido (UI-14) ----------
  // Tarjeta de INTRO_SEC s al empezar: la sim queda parada (sin serveReady ni silbato; los eventos iniciales salvo newMatch se
  // guardan y se entregan al acabar), el mundo sigue animándose (dt de presentación = tiempo real). Cualquier botón, tecla o toque
  // la salta en el frame siguiente. Cámara: VB.CameraRig.playIntro(s) (playIntro(0) al acabar antes); audio: sting('intro').
  var INTRO_SEC = 2.5, intro = { left: 0, held: [] };
  ctx.introLeft = 0; ctx.introSkipReq = false;
  // B5: con VB.UI.introPlan (si existe) la duración es la del plan (mini 2,5 / corta 4,5 / larga 6 s; opts.introKind la fuerza);
  // sin él, INTRO_SEC como siempre
  function introStart(opts) {
    var pl = null;
    if (VB.UI && typeof VB.UI.introPlan === 'function') pl = call('UI', 'introPlan', ctx.game, opts || {});
    var dur = pl && +pl.dur > 0 ? Math.min(6, +pl.dur) : INTRO_SEC;
    intro.left = dur; intro.held.length = 0; ctx.introSkipReq = false;
    var keep = [];
    for (var i = 0; i < pendingEvents.length; i++) (pendingEvents[i].type === 'newMatch' ? keep : intro.held).push(pendingEvents[i]);
    pendingEvents.length = 0; for (var j = 0; j < keep.length; j++) pendingEvents.push(keep[j]);
    ctx.introLeft = intro.left;
    call('CameraRig', 'playIntro', dur);
    // (B5: VB.Audio.introStart(dur) es el mismo sting('intro') pero sabe cuánto dura la previa: con 4,5 o 6 s el lecho no vuelve a
    // los 3 s; sin él, el sting de siempre)
    if (VB.Audio && typeof VB.Audio.introStart === 'function') call('Audio', 'introStart', dur); else call('Audio', 'sting', 'intro');
    call('UI', 'introStart', ctx.game, pl);
  }
  function introEnd(skipped) {
    if (!(intro.left > 0)) return;
    intro.left = 0; ctx.introLeft = 0; ctx.introSkipReq = false;
    for (var i = 0; i < intro.held.length; i++) pendingEvents.push(intro.held[i]);
    intro.held.length = 0;
    if (skipped) call('CameraRig', 'playIntro', 0);
    call('UI', 'introEnd', !!skipped);
  }
  ctx.actions.toMenu = function () {
    netStop(true);   // (online: salir al menú es abandonar)
    if (intro.left > 0) { intro.left = 0; ctx.introLeft = 0; intro.held.length = 0; call('CameraRig', 'playIntro', 0); call('UI', 'introEnd', true); }
    var fromCareer = !!(ctx.game && ctx.game.career && !ctx.game.demo && !ctx.debug);
    // ejercicio de Carrera: de vuelta al hub, en Partido › Entrenamiento con el resultado (abandonado a medias: la sesión no se gasta)
    var drillC = !!(ctx.game && ctx.game.careerDrill && !ctx.game.demo && !ctx.debug) ? ctx.game.careerDrill : null;
    // partidillo de prueba: aprobado, al hub de tu club nuevo; suspendido, a las ofertas con el resultado. Abandonarlo a medias
    // también la gasta: «Abandonar la prueba» la resuelve aquí como suspendida (trialForfeit 'quit') y va a las ofertas igual
    var trialC = fromCareer && ctx.game.career.trial ? ctx.game.career : null;
    if (trialC && !careerEnd) trialForfeit(trialC, 'quit');
    var trialE = trialC ? careerEnd : null;
    if (fromCareer && !careerEnd && VB.Career && VB.Career.abortMatch) VB.Career.abortMatch(); // partido abandonado: la jornada sigue pendiente
    ctx.frozen = false;
    restoreEndButtons();
    unforceVenue();   // Carrera en la playa: de vuelta al escenario del ajuste
    setGame(demoGame());
    setState('menu');
    if (drillC && VB.CareerUI && VB.CareerUI.open) { try { VB.CareerUI.open('hub', { train: true, res: drillC.res }); } catch (e) { reportError('CareerUI.open', e); } }
    else if (trialC && !menuOnly && VB.CareerUI && VB.CareerUI.open) {
      try { if (trialE && trialE.pass) VB.CareerUI.open('hub', { fresh: true, trialRes: trialE }); else VB.CareerUI.open('pick', { trialRes: trialE && !trialE.none ? trialE : null }); }
      catch (e) { reportError('CareerUI.open', e); }
    }
    // (B6: «Siguiente jornada» y los abandonos vuelven al hub en Partido con el foco en «Jugar partido»; R15)
    else if (fromCareer && !menuOnly && VB.CareerUI && VB.CareerUI.open) { try { VB.CareerUI.open('hub', { fresh: !!careerEnd, focus: 'play' }); } catch (e) { reportError('CareerUI.open', e); } }
    else if (fromCareer && VB.CareerUI && VB.CareerUI.syncMenu) { try { VB.CareerUI.syncMenu(); } catch (e) { } }
    careerEnd = null; menuOnly = false;
  };
  /** Fondo del menú según la Carrera abierta (career-ui.js): 'hall' = demo 6v6 en el pabellón, 'beach' = demo de playa, '' = el
   *  del ajuste. Solo en el menú con la demo; no cambia nada si el fondo ya es ese (15-nov-2026: antes se veía la playa detrás del
   *  hub de la Carrera de pista). */
  ctx.actions.menuBackdrop = function (k) {
    // (en ?debug=look también: el Vestuario de playa enseña la playa, WP6 del plan del Vestuario)
    var g = ctx.game; if (ctx.state !== 'menu' || !g || !g.demo || (ctx.debug && ctx.debug !== 'look')) return;
    k = k === 'hall' || k === 'beach' ? k : '';
    if (!k) { if (!venueForced) return; unforceVenue(); setGame(demoGame()); return; }
    var six = g.format === '6v6';
    if (k === 'hall' ? (six && venueNow() === 'hall') : (!six && g.venue === 'beach' && venueNow() === 'beach')) return;
    forceVenue(k);
    setGame(Sim.createGame({ demo: true, seed: seed(), difficulty: 'normal', format: k === 'hall' ? '6v6' : undefined, venue: k === 'hall' ? undefined : 'beach' }));
  };
  ctx.actions.pause = function () {
    if (net) {   // online: no hay pausa (Esc enseña «Abandonar»); con el partido ya terminado (abandono, rival que no vuelve…), Esc sale (auditoría)
      if (net.view && ctx.state === 'playing' && net.r && net.r.status === 'ended') { ctx.actions.netQuit(); return; }
      if (net.view && ctx.state === 'playing') net.menu = !net.menu; return;
    }
    if (ctx.state === 'playing') setState('paused');
  };
  ctx.actions.resume = function () { if (ctx.state === 'paused') setState('playing'); };
  ctx.actions.togglePause = function () { if (ctx.state === 'playing') ctx.actions.pause(); else if (ctx.state === 'paused') ctx.actions.resume(); };
  // (E6: con un ejercicio en curso, «Reiniciar» repite el mismo ejercicio)
  // R16 (plan del sprint 2-4): sesión de entrenamiento de la Carrera a medias → la misma sesión (sin gastarla; main 13-nov); ejercicio
  // → el mismo ejercicio; reto → el mismo reto con la previa mini; Carrera → startMatch() (repite el partido con la previa normal, o
  // vuelve al hub desde la hoja); si no, las opciones del último partido de Partido rápido con la previa mini
  var restarting = false;   // (salto con impulso: «Reiniciar» no saca el aviso de colocador)
  ctx.actions.restart = function () {
    restarting = true;
    try { restartRun(); } finally { restarting = false; }
  };
  function restartRun() {
    var g = ctx.game, live = !!(g && !g.demo);
    if (live && g.careerDrill && !g.careerDrill.done && g.drill) { ctx.actions.startCareerDrill(g.drill.kind, !!g.autopilot); return; }
    if (live && g.drill) { ctx.actions.startMatch({ drill: g.drill.kind, autopilot: !!g.autopilot }); return; }
    if (live && g.retoOpts) { ctx.actions.startMatch(Object.assign({}, g.retoOpts, { introKind: 'mini' })); return; }
    if (live && g.career) { ctx.actions.startMatch(); return; }
    ctx.actions.startMatch(Object.assign({}, live && lastOpts || {}, { introKind: 'mini' }));
  }
  ctx.actions.setSetting = function (k, v) {
    if (ctx.settings[k] === v) return;
    ctx.settings[k] = v; saveSettings();
    if (k === 'muted') call('Audio', 'setMuted', !!v);
    if (k === 'subs6' && ctx.game && ctx.game.subsOn && !ctx.game.career && ctx.game.coach) ctx.game.coach[0].auto = v !== 'manual';   // en vivo
    // vista previa en vivo; con los looks del partido en curso (setKit conserva los de antes sin st.looks, pero así no depende de ello)
    if (k.indexOf('kit') === 0 && ctx.game) call('Players', 'setKit', kitWithLooks(ctx.settings), ctx.game);
    if (k === 'quality') { aq.downs = 0; aq.lastDown = -99; aq.noScale = false; aq.chk = null; applyQuality(pickQuality()); }
    // E3: resolución fija o automática, tope de 30 fps, contador de FPS y menos movimiento
    if (k === 'resScale') { aq.downs = 0; aq.lastDown = -99; aq.noScale = false; aq.chk = null; aq.low = aq.mild = aq.high = 0; aq.skip = 1; if (!(+v > 0)) renderScale = 1; applyQuality(ctx.quality); }
    if (k === 'fpsCap') { aq.low = aq.mild = aq.high = 0; aq.skip = 1; aq.chk = null; capNext = 0; }
    if (k === 'showFps' && fpsEl) { fpsEl.hidden = !v && Q.fps !== '1'; fpsShowT = 1; }
    if (k === 'lessMotion') ctx.reduceMotion = calcReduce();
    // escenario en mitad de un partido (Ajustes desde la pausa): la pista y las reglas del partido no pueden cambiar a medias
    // (16×8 / 18×9), así que el cambio espera al siguiente partido o al menú (applyVenuePend)
    var venueK = k === 'arena' || k === 'mapHall' || k === 'mapBeach';
    if (venueK && ctx.game && !ctx.game.demo && ctx.state !== 'menu') { venuePend = true; call('UI', 'onSettings', ctx.settings, k); return; }
    for (var i = 0; i < MODS.length; i++) call(MODS[i], 'onSettings', ctx.settings, k);
    // escenario: la demo del menú pasa a jugar con las reglas (y la pista) del nuevo escenario. En partido no cambia nada hasta el siguiente
    if (venueK && ctx.state === 'menu' && ctx.game && ctx.game.demo && ctx.game.venue !== venueNow()) setGame(demoGame());
  };
  ctx.actions.toggleMute = function () { ctx.actions.setSetting('muted', !ctx.settings.muted); };
  /** E3: vuelve a los valores por defecto (DEFAULTS) las claves dadas (todas si no se dan), guarda y avisa a cada módulo con
   *  onSettings(s, k) por clave (setSetting). «Restablecer este apartado» de Ajustes y «Restablecer teclas» de Controles.
   *  Nunca toca la dificultad ni el escenario (son de la preparación del Partido rápido). */
  ctx.actions.resetSettings = function (keys) {
    var d = DEFAULTS(), list = Array.isArray(keys) ? keys : Object.keys(d);
    for (var i = 0; i < list.length; i++) {
      var k = list[i]; if (!(k in d) || k === 'difficulty' || k === 'arena' || k === 'arenaV' || k === 'mapV') continue;
      var v = d[k];
      if (v && typeof v === 'object') { if (JSON.stringify(ctx.settings[k]) === JSON.stringify(v)) continue; v = JSON.parse(JSON.stringify(v)); }
      ctx.actions.setSetting(k, v);
    }
  };
  // Challenge (B7): pide revisión de la última llamada de línea para el humano (equipo 0). true si sim la acepta
  ctx.actions.challenge = function () {
    if (net) { if (net.view && ctx.state === 'playing') { net.sess.request('chal'); return true; } return false; }   // online: Precisa, en la entrada; Fluida, ch → chok (netfluid _chalAsk)
    if (ctx.state !== 'playing' || !ctx.game || !Sim.challenge) return false;
    var ok = false; try { ok = !!Sim.challenge(ctx.game, 0); } catch (e) { reportError('Sim.challenge', e); }
    if (ok) call('UI', 'onChallenge', ctx.game, 0);
    return ok;
  };

  // ---------- Vestuario: vista previa en el menú (VB.Doll.preview, js/doll.js; spec «Vestuario» §4.5 y §6.4) ----------
  // Un muñeco de muestra en ctx.scene (mismo renderer, luces y programas: cero programas nuevos) con la demo oculta y su sim parada.
  // ui.js la enciende al abrir la página `look` y la apaga al salir (menuReset, onState); setState también la apaga fuera del menú.
  var lookOn = false;
  function previewApi() { var D = VB.Doll; return D && D.preview && typeof D.preview.start === 'function' ? D.preview : null; }
  /** Opciones de la vista previa con lo que falte: px 1 en táctil (atlas de 512) y, en escritorio, el de los atletas en calidad alta. */
  function previewOpts(o) {
    var r = Object.assign({}, o || {});
    if (r.px == null) r.px = isTouch ? 1 : (ctx.quality && ctx.quality.rank >= 2 ? 2 : 1);
    return r;
  }
  /** showroom(true, L, o): enciende la vista previa con el aspecto resuelto L (VB.Look.resolve, congelado) y o = {tc, num, beach, px};
   *  si ya estaba encendida, la actualiza (preview.set). showroom(false): la apaga y vuelve la demo. Devuelve true si queda encendida.
   *  Avisa a la calidad adaptativa (noteHitch) al empezar, al acabar y cada vez que se rehace la geometría ('geo'). */
  ctx.actions.showroom = function (on, L, o) {
    var P = previewApi();
    if (!on) {
      if (!lookOn) return false;
      lookOn = false;
      if (P) { try { if (P.stop) P.stop(); } catch (e) { reportError('Doll.preview.stop', e); } }
      call('Players', 'showroom', false);
      ctx.noteHitch();
      return false;
    }
    if (!P || ctx.state !== 'menu') return false;   // sin vista previa (o fuera del menú) la demo sigue como estaba
    if (lookOn && (!P.active || P.active())) {
      var how = '';
      try { how = P.set ? P.set(L, previewOpts(o)) : ''; } catch (e) { reportError('Doll.preview.set', e); }
      if (how === 'geo') ctx.noteHitch();
      return true;
    }
    try { P.start(ctx, L, previewOpts(o)); } catch (e) { reportError('Doll.preview.start', e); return false; }
    lookOn = true;
    call('Players', 'showroom', true);
    ctx.noteHitch();
    return true;
  };
  /** El Vestuario guardó (VB.Look.setFit o CareerLife.setLook): la demo del menú se viste con los looks nuevos. Un partido de verdad
   *  no cambia a medias (el Vestuario nunca se abre desde la pausa): sus looks se fijan en setGame. */
  ctx.actions.looksChanged = function () {
    var g = ctx.game; if (!g || !g.demo) return false;
    curLooks = calcLooks(lookOptsOf(g));
    call('Players', 'setKit', kitWithLooks(ctx.settings), g);
    call('UI', 'refreshMenu');   // B3: la portada repinta «Continuar carrera» (cambia la clave del retrato)
    return true;
  };
  // ---------- Retratos del muñeco (B2: VB.Doll.portrait de players; spec S2-B2B3 §3.2) ----------
  // ctx.actions.portrait(req) → {key, url}: url al momento si está en la caché (LRU de 12 URL blob: por sesión, nunca en localStorage);
  // si no, se encola (sin repetir clave) y llega luego con el evento DOM `vb-portrait` {key, url} (ui.js cambia los [data-pt]).
  // Se pinta uno por frame en el paso 4b del bucle (portraitStep). Con la cola vacía 1 s, VB.Doll.portrait.free() suelta el muñeco.
  // Sin VB.Doll.portrait (players aún sin él) → {key: '', url: ''} y ui.js deja la silueta.
  // (PMAX: 12 retratos + hasta 48 miniaturas del Vestuario, WP6: URL blob de ~10-30 KB cada una)
  var PQ = [], PCACHE = {}, PORDER = [], P2D = null, PMAX = 60;
  // miniaturas del Vestuario (req.frame; WP6, ronda 1): ImageBitmap en la GPU (VB.Doll.portrait.snap), sin PNG ni lectura del lienzo.
  // LRU propia de ≤ 48 (plan: memoria del móvil); el evento lleva {key, url: '', bmp} y ui.js lo copia a un <canvas> de la ficha
  var TCACHE = {}, TORDER = [], TMAX = 48;
  function ptBmpStore(key, b) {
    if (TCACHE[key] && TCACHE[key] !== b) ptBmpClose(TCACHE[key]);
    TCACHE[key] = b; var i = TORDER.indexOf(key); if (i >= 0) TORDER.splice(i, 1); TORDER.push(key);
    while (TORDER.length > TMAX) { var old = TORDER.shift(); ptBmpClose(TCACHE[old]); delete TCACHE[old]; }
  }
  function ptBmpClose(b) { try { if (b && b.close) b.close(); } catch (e) { } }
  var pt = { idleT: 0, freed: true, warm: '', n: 0, ms: 0 };
  function portraitApi() { var D = VB.Doll; return D && D.portrait && typeof D.portrait.draw === 'function' && typeof D.portrait.key === 'function' ? D.portrait : null; }
  function ptKey(P, req) { try { var k = P.key(req); return k ? String(k) : ''; } catch (e) { reportError('Doll.portrait.key', e); return ''; } }
  function ptTouch(key) { var i = PORDER.indexOf(key); if (i >= 0) PORDER.splice(i, 1); PORDER.push(key); }
  function ptStore(key, url) {
    if (PCACHE[key] && PCACHE[key] !== url) ptRevoke(PCACHE[key]);
    PCACHE[key] = url; ptTouch(key);
    while (PORDER.length > PMAX) { var old = PORDER.shift(); ptRevoke(PCACHE[old]); delete PCACHE[old]; }
  }
  function ptRevoke(url) { if (url && url.indexOf('blob:') === 0) { try { URL.revokeObjectURL(url); } catch (e) { } } }
  ctx.actions.portrait = function (req) {
    var P = portraitApi(); if (!P || !req) return { key: '', url: '' };
    var key = ptKey(P, req); if (!key) return { key: '', url: '' };
    if (PCACHE[key]) { ptTouch(key); return { key: key, url: PCACHE[key] }; }
    if (TCACHE[key]) { var ti = TORDER.indexOf(key); if (ti >= 0) { TORDER.splice(ti, 1); TORDER.push(key); } return { key: key, url: '', bmp: TCACHE[key] }; }
    for (var i = 0; i < PQ.length; i++) if (PQ[i].key === key) return { key: key, url: '' };
    PQ.push({ key: key, req: req });
    return { key: key, url: '' };
  };
  ctx.actions.portraitDrop = function (key) {
    key = String(key || '');
    if (PCACHE[key]) { ptRevoke(PCACHE[key]); delete PCACHE[key]; }
    var i = PORDER.indexOf(key); if (i >= 0) PORDER.splice(i, 1);
    for (var j = PQ.length - 1; j >= 0; j--) if (PQ[j].key === key) PQ.splice(j, 1);
    // (una miniatura ya hecha no se cierra: la rejilla que se vuelve a abrir la quiere al momento; la LRU de TMAX la acaba soltando)
  };
  /** Pruebas (portraittest): estado de la cola. */
  ctx.portraitInfo = function () { return { queue: PQ.length, cached: PORDER.length, thumbs: TORDER.length, n: pt.n, ms: pt.ms, msMax: pt.msMax || 0, warm: pt.warm, freed: pt.freed }; };
  function portraitStep() {
    var P = portraitApi(); if (!P) { PQ.length = 0; return; }
    if (progWarm.pending && progsPending()) return;              // programas del retrato (o del partido) compilándose: espera
    if (prewarmPortrait(P)) return;                               // acaba de pedir los programas del retrato (alta con post): espera
    // miniaturas del Vestuario (req.frame; WP6, ronda 1): el muñeco se monta por pasos de ≤ 3 ms (P.prep) y, en otro frame, se pinta y
    // se copia en la GPU (P.snap). Antes, todo en un frame y con PNG: 10-25 ms de golpe por ficha (más con el móvil)
    var q0 = PQ[0];
    if (q0 && q0.req && q0.req.frame && !q0.req.matte && typeof P.prep === 'function' && typeof P.snap === 'function' && typeof createImageBitmap === 'function' && !PCACHE[q0.key] && !TCACHE[q0.key]) {
      var tp = performance.now(), ready = true;
      try { ready = P.prep(ctx, q0.req, 3); } catch (e) { reportError('Doll.portrait.prep', e); ready = true; }
      var dp = performance.now() - tp;
      if (dp > 0.6 || !ready) { pt.freed = false; pt.idleT = 0; pt.ms = Math.round(dp * 10) / 10; pt.msMax = Math.max(pt.msMax || 0, pt.ms); return; }
    } else if (PQ.length && PQ[0].req && PQ[0].req.frame && (pt.tk = (pt.tk | 0) + 1) % 2) return;   // (camino viejo: una cada 2 frames)
    var q = PQ.shift(); if (!q || PCACHE[q.key] || TCACHE[q.key]) return;
    var r = ctx.renderer, sz = Math.max(16, Math.min(512, (+q.req.size | 0) || 144));
    if (q.req.frame && !q.req.matte && typeof P.snap === 'function') {
      var t1 = performance.now(), sn = null;
      try { sn = P.snap(ctx, q.req); } catch (e) { reportError('Doll.portrait.snap', e); sn = null; }
      if (r.getScissorTest && r.getScissorTest()) { r.setScissorTest(false); r.setViewport(0, 0, ctx.width, ctx.height); }
      if (sn) {
        var d1 = performance.now() - t1, tk = q.key;
        pt.freed = false; pt.idleT = 0; pt.ms = Math.round(d1 * 10) / 10; pt.msMax = Math.max(pt.msMax || 0, pt.ms); pt.n++;
        if (d1 > 50) ctx.noteHitch();
        sn.bmp.then(function (b) {
          if (!b) return;
          ptBmpStore(tk, b);
          try { window.dispatchEvent(new CustomEvent('vb-portrait', { detail: { key: tk, url: '', bmp: b } })); } catch (e) { reportError('vb-portrait', e); }
        }, function () { });
        return;
      }
      // (sin createImageBitmap o si falla: el camino de siempre, PNG)
    }
    if (!P2D) P2D = document.createElement('canvas');
    if (P2D.width !== sz || P2D.height !== sz) { P2D.width = sz; P2D.height = sz; }
    var t0 = performance.now(), ms = -1;
    try { ms = P.draw(ctx, q.req, P2D); } catch (e) { reportError('Doll.portrait.draw', e); ms = -1; }
    if (ms >= 0 && q.req.matte) { try { ms = ptMatte(P, q.req, P2D); } catch (e) { reportError('Doll.portrait.matte', e); ms = -1; } }
    // (por si draw saliera a medias: el render del juego de este frame necesita el viewport entero y sin tijera)
    if (r.getScissorTest && r.getScissorTest()) { r.setScissorTest(false); r.setViewport(0, 0, ctx.width, ctx.height); }
    var dt = performance.now() - t0;
    pt.freed = false; pt.idleT = 0; pt.ms = Math.round(dt * 10) / 10;
    if (dt > 50) ctx.noteHitch();                                  // la ventana de fps no cuenta para la calidad adaptativa
    if (!(ms >= 0)) return;                                        // no se pudo: queda la silueta
    pt.n++;
    var key = q.key, done = function (url) {
      if (!url) return;
      ptStore(key, url);
      try { window.dispatchEvent(new CustomEvent('vb-portrait', { detail: { key: key, url: url } })); } catch (e) { reportError('vb-portrait', e); }
    };
    // toBlob copia el lienzo al llamarlo (P2D se puede reutilizar en el frame siguiente) y codifica fuera del bucle
    if (P2D.toBlob) { try { P2D.toBlob(function (b) { done(b ? URL.createObjectURL(b) : ''); }, 'image/png'); return; } catch (e) { } }
    var url = ''; try { url = P2D.toDataURL('image/png'); } catch (e) { }
    setTimeout(function () { done(url); }, 0);
  }
  /** req.matte (menú «Tu jugador», ?menu=jugador): recorte con fondo transparente. El 1.er pase ya está en cv con fondo negro (req.bg 0);
   *  se pinta otra vez con fondo blanco y de la diferencia salen el alfa exacto (también en los bordes suavizados) y el color. */
  function ptMatte(P, req, cv) {
    var g = cv.getContext('2d'), w = cv.width, h = cv.height, A = g.getImageData(0, 0, w, h);
    if (!(P.draw(ctx, Object.assign({}, req, { bg: 0xffffff }), cv) >= 0)) return -1;
    var B = g.getImageData(0, 0, w, h), a = A.data, b = B.data;
    for (var i = 0; i < a.length; i += 4) {
      var al = 255 - ((b[i] - a[i]) + (b[i + 1] - a[i + 1]) + (b[i + 2] - a[i + 2])) / 3;
      if (al < 3) { a[i] = a[i + 1] = a[i + 2] = a[i + 3] = 0; continue; }
      if (al > 255) al = 255;
      var k = 255 / al; a[i] = Math.min(255, a[i] * k); a[i + 1] = Math.min(255, a[i + 1] * k); a[i + 2] = Math.min(255, a[i + 2] * k); a[i + 3] = al;
    }
    g.putImageData(A, 0, 0);
    return 1;
  }
  function portraitFree() {
    pt.freed = true; pt.idleT = 0;
    var P = VB.Doll && VB.Doll.portrait;
    if (P && typeof P.free === 'function') { try { P.free(); } catch (e) { reportError('Doll.portrait.free', e); } }
  }
  /** Calidad alta con el post de arena: los 2 programas del retrato (otra codificación de salida) se compilan en paralelo con KHR una
   *  vez por calidad (asyncCompile, destino de pantalla). true = los ha pedido (portraitStep espera a que acaben). Sin la extensión, o
   *  sin post (baja, media, móvil: comparte los programas del juego), nada: como mucho un tirón de ~250 ms la primera vez. */
  function prewarmPortrait(P) {
    var post = !!(VB.Arena && VB.Arena.postActive && safeBool(VB.Arena.postActive));
    var want = post ? 'post' : 'plain'; if (pt.warm === want) return false;
    pt.warm = want;
    if (!post || Q.prewarm === '0' || glLost || typeof P.warm !== 'function') return false;
    var gl = ctx.renderer.getContext(), ext = null;
    try { ext = gl.getExtension('KHR_parallel_shader_compile'); } catch (e) { }
    if (!ext) return false;
    var w = null; try { w = P.warm(ctx); } catch (e) { reportError('Doll.portrait.warm', e); }
    if (!w || !w.scene || !w.camera) return false;
    var pend = asyncCompile(w.scene, w.camera, null, false);
    if (!pend.length) return false;
    progWarm.ext = ext; progWarm.pending = pend; progWarm.t0 = performance.now(); progWarm.n = pend.length; progWarm.gate = false;
    ctx.noteHitch();
    return true;
  }
  function safeBool(f) { try { return !!f(); } catch (e) { return false; } }
  function previewPass() {
    var P = previewApi(); if (!P || !P.pass) return;
    try { P.pass(ctx); } catch (e) { reportError('Doll.preview.pass', e); }
  }
  function previewUpdate(dt) {
    var P = previewApi(); if (!P || !P.update) return;
    try { P.update(dt); } catch (e) { reportError('Doll.preview.update', e); }
  }

  function setState(s) {
    var prev = ctx.state; ctx.state = s;
    if (prev !== s) aq.skip = 1; // la ventana de fps que cruza un cambio de estado no cuenta para la calidad adaptativa
    // el Vestuario solo vive en el menú: fuera de él nunca queda la vista previa encendida (ui.js también la apaga en onState)
    if (s !== 'menu' && lookOn) ctx.actions.showroom(false);
    if (prev !== s) for (var i = 0; i < MODS.length; i++) call(MODS[i], 'onState', s, prev);
  }

  // ---------- Pantalla completa ----------
  // Táctil: se pide sola en el primer toque y al empezar cada partido. Botón en el menú (y en el HUD de escritorio), tecla F.
  // iPhone (Safari sin API de pantalla completa para páginas): aviso de «Compartir → Añadir a pantalla de inicio»; instalada
  // (manifest de tools/build-pages.js, display: fullscreen) ya no hay barra de direcciones.
  var isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function fsApi() { var d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  function standalone() {
    try { return navigator.standalone === true || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }
  }
  function enterFs() {
    try {
      var d = document.documentElement, p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen && d.webkitRequestFullscreen();
      var lock = function () { try { if (isTouch && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { }); } catch (e) { } };
      if (p && p.then) p.then(lock).catch(function () { }); else lock();
    } catch (e) { }
  }
  function exitFs() { try { var p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen && document.webkitExitFullscreen(); if (p && p.catch) p.catch(function () { }); } catch (e) { } }
  // iPhone y navegadores de dentro de apps (sin pantalla completa): tutorial de instalar con dibujos (js/install.js), que se
  // cierra cuando quieras. Sustituye al aviso #fsTip de antes, que tapaba media pantalla y no se podía cerrar.
  var inAppUA = !!(VB.Install && VB.Install.inApp);
  function toggleFs() {
    if (isFs()) exitFs();
    else if (fsApi() && !inAppUA) enterFs();
    else if ((isIOS || inAppUA) && VB.Install) VB.Install.open();
  }
  function tryFullscreen() { if (isTouch && !ctx.debug && !standalone() && !isFs() && fsApi()) enterFs(); }
  function syncFs() {
    var fs = isFs(), can = !ctx.debug && !standalone() && (fsApi() || isIOS || inAppUA);
    document.documentElement.classList.toggle('is-fs', fs);
    var b = document.getElementById('btnFs'); if (b) b.hidden = !can || fs;
    var h = document.getElementById('btnHudFs'); if (h) h.hidden = !can || isTouch;
  }
  (function initFs() {
    var b = document.getElementById('btnFs'), h = document.getElementById('btnHudFs');
    if (b) b.addEventListener('click', function (e) { e.stopPropagation(); toggleFs(); });
    if (h) h.addEventListener('click', function (e) { e.stopPropagation(); toggleFs(); h.blur(); });
    document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs);
    window.addEventListener('keydown', function (e) {
      if ((e.code === 'KeyF' || e.key === 'f' || e.key === 'F') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(ctx.introLeft > 0)) toggleFs();
    });
    // táctil: el primer toque en cualquier parte ya pone la pantalla completa (necesita un gesto del usuario)
    var first = function () { window.removeEventListener('pointerup', first, true); tryFullscreen(); };
    if (isTouch) window.addEventListener('pointerup', first, true);
    // doble toque: sin zoom aunque el navegador ignore user-scalable=no (Safari): el 2º toque rápido fuera de un control no hace nada
    var lastTE = 0;
    document.addEventListener('touchend', function (e) {
      var t = e.target, now = e.timeStamp || 0;
      if (now - lastTE < 320 && e.cancelable && !(t && t.closest && t.closest('button,a,input,[role=button],[data-opt]'))) e.preventDefault();
      lastTE = now;
    }, { passive: false });
    syncFs();
  })();

  // ---------- Entrada -> mundo ----------
  var simIn = { move: [0, 0], hit: false, jump: false, jset: false, switchPlayer: false }; // jset: COLOCAR (en el aire, colocación en salto)
  ctx.simMove = simIn.move; // entrada de MUNDO del frame (FX la lee para la retícula de apuntado en vivo)
  var edge = { hit: false, jump: false, jset: false, switchPlayer: false };
  function buildInput(it) {
    // it: intenciones crudas de VB.Input.poll (pantalla: mx derecha+, my hacia la red+)
    var bs = VB.CameraRig && VB.CameraRig.getBasis ? VB.CameraRig.getBasis() : null;
    var mx = it ? it.mx || 0 : 0, my = it ? it.my || 0 : 0;
    var g0 = ctx.game;
    // (C2, colocar por destino: con la ventana de colocación abierta, Sim.setWin, también: así las 8 direcciones del teclado dan
    // siempre los mismos destinos aunque la cámara esté girada; va dentro de move, así que la repetición lo graba igual)
    var setW = !!(g0 && !g0.demo && g0.mode === 'rally' && VB.Sim && VB.Sim.setWin && VB.Sim.setWin(g0));
    if (bs && g0 && (g0.mode === 'serve' || setW) && !g0.demo) {
      // saque: ejes de la pista, no de la cámara (que está algo girada). Así ↑ sola lleva la diana recta al fondo y ←/→ la mueven
      // solo a lo ancho (antes ↑ iba de (−7, 0) a (−9, 2)); y antes de lanzar, ←/→ desplazan al sacador sin deriva.
      var ax = Math.abs(bs.fx) >= Math.abs(bs.fy), fX = ax ? (bs.fx < 0 ? -1 : 1) : 0, fY = ax ? 0 : (bs.fy < 0 ? -1 : 1);
      var rX = ax ? 0 : (bs.rx < 0 ? -1 : 1), rY = ax ? (bs.ry < 0 ? -1 : 1) : 0;
      simIn.move[0] = rX * mx + fX * my; simIn.move[1] = rY * mx + fY * my;
    } else if (bs) { simIn.move[0] = bs.rx * mx + bs.fx * my; simIn.move[1] = bs.ry * mx + bs.fy * my; }
    else { simIn.move[0] = -my; simIn.move[1] = mx; } // por defecto: cámara detrás mirando a -x
    if (it) { edge.hit = edge.hit || !!it.hit; edge.jump = edge.jump || !!it.jump; edge.jset = edge.jset || !!it.jset; edge.switchPlayer = edge.switchPlayer || !!it.switchPlayer; }
  }

  // ---------- Bucle ----------
  var pendingEvents = [], frameEvents = [], EMPTY = [], PFX = [];
  var acc = 0, last = 0, fxAge = 0, idleT = 0, drawn = 0, bootDone = false, dollOn = false;
  var bootEl = document.getElementById('boot'), fpsEl = document.getElementById('fps');
  var meter = { t: 0, n: 0, js: 0, lt: 0 }, fpsShowT = 0, capNext = 0;
  var QNAME = { high: 'Alta', medium: 'Media', low: 'Baja' };
  // Tareas largas del hilo principal (>50 ms, incluidas las que no son del juego: GC, otras pestañas del proceso, compositor).
  // ctx.frameMs solo mide el JS del juego; con la máquina saturada se queda corto y la calidad adaptativa creía que el cuello
  // era la GPU. La suma de la ventana se usa como cota inferior del tiempo ocupado (ver measure / adaptQuality).
  try {
    if (window.PerformanceObserver && (PerformanceObserver.supportedEntryTypes || []).indexOf('longtask') >= 0) {
      new PerformanceObserver(function (list) { var es = list.getEntries(); for (var i = 0; i < es.length; i++) meter.lt += es[i].duration; }).observe({ entryTypes: ['longtask'] });
    }
  } catch (e) { }

  function frame(now) {
    requestAnimationFrame(frame);
    var tWork = performance.now(); // coste JS de este frame (ctx.frameMs; lo lee tools/perf.js)
    now = now || tWork;
    // E3: tope de fotogramas (Ajustes · Imagen · Fotogramas = 30): este frame no se hace si aún no toca. Va ANTES del poll: las
    // pulsaciones del teclado se acumulan en input.js (flancos) y llegan al siguiente frame que sí se hace; `last` no se toca,
    // así el realDt del frame siguiente cubre todo el intervalo. capNext avanza por pasos fijos (sin deriva a 120/144 Hz)
    var fcap = ctx.settings.fpsCap;
    if (fcap > 0) {
      var per = 1000 / fcap;
      if (capNext && now < capNext - 2.5) return;
      capNext = capNext && now - capNext < per ? capNext + per : now + per;
    } else capNext = 0;
    var raw = last ? Math.max(0, (now - last) / 1000) : 1 / 60;
    var realDt = Math.min(MAX_DT, raw); last = now;
    ctx.realDt = realDt; ctx.time += realDt; ctx.frame++;
    if (sizeDirty) resize(false);

    var it = VB.Input && VB.Input.poll ? safePoll(realDt) : null;
    // S3-C1: con una repetición en marcha (VB.Replay.active) los botones la saltan y no llegan a nada más (ni golpe, ni pausa, ni la
    // hoja final tapada): GOLPEAR / SALTAR / CAMBIAR / aceptar / toque (ctx.replaySkipReq) → Replay.skip() (en mejores jugadas, la
    // siguiente); Esc / Start / B (ctx.replaySkipReq 'all': botón «Salir») → Replay.skip(true), fuera
    var RPL = VB.Replay, rpA = !!(RPL && RPL.active && RPL.active());
    if (rpA) rpInput(it); else ctx.replaySkipReq = false;
    if (intro.left > 0) {
      if (ctx.state !== 'playing') { if (ctx.state !== 'paused') introEnd(true); }
      else if (ctx.introSkipReq || (it && (it.hit || it.jump || it.switchPlayer || it.pause || it.confirm))) {
        introEnd(true);
        if (it) { it.hit = it.jump = it.jset = it.switchPlayer = it.pause = it.confirm = false; }   // el botón que salta no golpea ni pausa
      }
    }
    if (it) {
      if (it.device) ctx.inputDevice = it.device;
      if (it.padEvent) call('UI', 'padEvent', it.padEvent); // 'connected' | 'disconnected' (antes de la pausa que provoca)
      if (net && ctx.state === 'playing' && netHudKeys(it)) { it.hit = it.jump = it.jset = it.switchPlayer = it.pause = it.confirm = it.navOk = it.navBack = false; it.navTab = 0; }   // (auditoría: HUD online con mando / teclado)
      if (it.pause) {
        // Esc/Start/P: primero cierra un panel abierto; si no, pausa/reanuda (el aviso de colocador, antes que nada: «Ahora no»)
        if (call('UI', 'noteBack')) { }
        else if (ctx.state === 'menu' && VB.CareerUI && VB.CareerUI.isOpen && VB.CareerUI.isOpen()) call('CareerUI', 'back');
        else if (!call('UI', 'back') && (ctx.state === 'playing' || ctx.state === 'paused')) ctx.actions.togglePause();
      }
      if (it.mute) ctx.actions.toggleMute();
      // ZOOM DE CÁMARA (17-nov-2026): rueda, + / -, stick derecho (input.js it.zoom: +1 acercar = nivel más bajo) o la lupa táctil
      // (it.zoomCycle: un nivel más lejos y del 5 vuelve al 1). Solo jugando (ni en pausa, ni en la presentación, ni en la repetición); se
      // guarda en Ajustes (camZoom) y la cámara lo lee sola. Aviso corto «Zoom 3/5» en el HUD
      if ((it.zoom || it.zoomCycle) && ctx.state === 'playing' && !(intro.left > 0) && !rpA && ctx.game && !ctx.game.demo) {
        var zNow = +ctx.settings.camZoom; zNow = zNow >= 0 && zNow <= 4 ? zNow : 2;
        var zNew = it.zoomCycle ? (zNow >= 4 ? 0 : zNow + 1) : Math.max(0, Math.min(4, zNow - (it.zoom > 0 ? 1 : -1)));
        if (zNew !== zNow) ctx.actions.setSetting('camZoom', zNew);
        call('UI', 'zoomHint', zNew, zNew !== zNow);
      }
      if (it.challenge && ctx.state === 'playing' && !(intro.left > 0)) ctx.actions.challenge(); // B4: V / LT
      if (it.any) call('Audio', 'unlock');
      if (ctx.state !== 'playing') {
        var st0 = ctx.state;
        if (call('UI', 'noteOpen')) call('UI', 'noteNav', it, realDt);   // (aviso de colocador encima de todo: el mando es suyo)
        else if (VB.CareerUI && VB.CareerUI.isOpen && VB.CareerUI.isOpen()) call('CareerUI', 'nav', it, realDt);
        else call('UI', 'nav', it, realDt);
        if (ctx.state !== st0) { it.hit = it.jump = it.jset = it.switchPlayer = false; } // el botón que acepta un menú no golpea
      }
    }
    if (startWait && !call('UI', 'bootBusy')) { var sw = startWait; startWait = null; ctx.actions.startMatch(sw); }
    var g = ctx.game;
    // banquillo (Carrera, g.ctrlOut): g.watch = espectador de verdad o tu atleta en el banquillo (cámara 'tv', sin halo ni mandos);
    // al entrar o salir, corte de cámara. GOLPEAR = «Saltar hasta que entres», SALTAR = ×3, CAMBIAR = «Saltar al final» (mando y teclado)
    if (g && g.subsOn) {
      var bOut = !!g.ctrlOut; g.watch = !!g.watch0 || bOut;
      if (bOut !== bench.out) { bench.out = bOut; bench.fast = false; if (!bOut) bench.ff = ''; call('CameraRig', 'snap', g); }
      if (bOut && it && ctx.state === 'playing' && !(intro.left > 0) && g.career && !bench.ff) {
        if (it.hit) ctx.actions.benchSkip('in'); else if (it.switchPlayer) ctx.actions.benchSkip('end'); else if (it.jump) ctx.actions.benchFast();
        it.hit = it.jump = it.jset = it.switchPlayer = false;
      }
    }
    ctx.portraitBlock = isTouch && ctx.state === 'playing' && ctx.height > ctx.width;
    // (Vestuario abierto: la sim de la demo no avanza; el muñeco de muestra se anima solo en previewUpdate)
    var running = !ctx.frozen && ctx.state !== 'paused' && !ctx.portraitBlock && !lookOn;

    frameEvents.length = 0;
    // eventos pendientes (inicio de partida, escenas de depuración)
    for (var k = 0; k < pendingEvents.length; k++) frameEvents.push(pendingEvents[k]);
    pendingEvents.length = 0;

    var gdt = 0, gdtR = 0, R = null;
    // S3-C1: repetición. Prepara (avance rápido de la sombra), cortinilla, juega y sale (VB.Replay.tick). Mientras los módulos pintan
    // la sombra (runner() = R, fases 'play'/'out'), la partida en vivo NO avanza (como con la previa) y se pinta R; en 'prep'/'in' el
    // vivo sigue normal. En pausa no corre
    if (rpA) {
      try {
        if (running) gdtR = RPL.tick(realDt, evP, evF); else { evP.length = 0; evF.length = 0; }   // (pausa / congelada: R quieta)
        R = RPL.runner();
      } catch (e) { reportError('Replay.tick', e); try { RPL.abort(); } catch (e2) { } R = null; }
      if (R && ctx.debug && Q.rpt && (RPL.info() || {}).t >= +Q.rpt) ctx.frozen = true;   // &rpt=s: congela la repetición a los s (capturas)
    }
    // tarjeta de presentación: la sim espera; el resto del mundo se anima en tiempo real
    if (net) { gdt = netFrame(it, realDt); }   // ONLINE: manda el reloj de la sesión (sin pausa, intro, repetición ni timeScale)
    else if (running && intro.left > 0) {
      intro.left -= realDt; ctx.introLeft = Math.max(0, intro.left);
      if (intro.left <= 0) { intro.left = 1e-6; introEnd(false); }
      for (var ih = 0; ih < pendingEvents.length; ih++) frameEvents.push(pendingEvents[ih]);
      pendingEvents.length = 0;
    }
    if (net) { /* (online: netFrame ya lo hizo arriba) */ }
    else if (running && intro.left > 0) { gdt = realDt; edge.hit = edge.jump = edge.jset = edge.switchPlayer = false; acc = 0; }
    else if (running && R) {
      // la sim en vivo espera (su g.timer no corre); los eventos pendientes (escenas, inicio de partida) esperan con ella
      edge.hit = edge.jump = edge.jset = edge.switchPlayer = false; acc = 0;
      for (var rk = 0; rk < frameEvents.length; rk++) pendingEvents.push(frameEvents[rk]);
      frameEvents.length = 0;
    }
    else if (running) {
      buildInput(ctx.state === 'playing' ? it : null);
      // ×3 en el banquillo: sin cámara lenta (la escala de camera.js no cuenta)
      gdt = realDt * (bench.fast && g && g.ctrlOut ? 3 : slowQ > 0 ? slowQ : ctx.timeScale);   // (&slow=0.5: ritmo fijo en depuración)
      acc += gdt;
      // SIM-03: GOLPEAR o SALTAR durante la pausa del punto la recorta (sim decide: tras 0,8 s y nunca a menos de 0,3 s);
      // el flanco se consume para que no llegue al saque siguiente
      // (UI-11: cualquier botón —golpear, saltar, cambiar o aceptar— también en la pausa del punto que gana el partido)
      // ambiente de Carrera: con las fichas «Protestar / Dejarlo» abiertas, CAMBIAR = Protestar (y no recorta la pausa); GOLPEAR, SALTAR
      // o aceptar = Dejarlo y recortan la pausa como siempre (quien aporrea para seguir nunca protesta sin querer)
      if (ctx.state === 'playing' && g && g.mode === 'point' && ambChoiceInput(g, it)) { edge.hit = edge.jump = edge.jset = edge.switchPlayer = false; }
      if (ctx.state === 'playing' && g && (g.mode === 'point' || g.mode === 'over') && (edge.hit || edge.jump || edge.switchPlayer || (it && it.confirm)) && Sim.skipHold) {
        var skipped = false; try { skipped = Sim.skipHold(g); } catch (e) { reportError('Sim.skipHold', e); }
        if (skipped) { edge.hit = edge.jump = edge.jset = edge.switchPlayer = false; call('UI', 'onHoldSkip', g); ambSkip(g); }
      }
      var n = 0, rpRec = !!(RPL && RPL.enabled && RPL.enabled());
      if (bench.ff && g && ctx.state === 'playing') { ffRun(g); acc = 0; n = MAX_STEPS + 1; gdt = 0; }
      while (acc >= STEP && n < MAX_STEPS) {
        simIn.hit = edge.hit; simIn.jump = edge.jump; simIn.jset = edge.jset; simIn.switchPlayer = edge.switchPlayer;
        edge.hit = edge.jump = edge.jset = edge.switchPlayer = false; // los flancos solo en el primer subpaso
        try { Sim.step(g, STEP, simIn); } catch (e) { reportError('Sim.step', e); }
        if (rpRec) RPL.onStep(simIn, g);   // S3-C1: entradas del paso al grabador (después de CADA Sim.step)
        acc -= STEP; n++;
      }
      if (n === MAX_STEPS) acc = 0;
      if (bench.ff) ffDrawSkip = true;
      Sim.drainEvents(g, frameEvents);
      // S3-C1: eventos del vivo al grabador (saque, toques, punto) y repetición automática de las bolas de set y de partido
      // (autoReady mira el ajuste, «Menos movimiento», el challenge, la pausa saltada y los 1,6 s tras el punto)
      if (rpRec) { try { RPL.onEvents(g, frameEvents); if (RPL.autoReady(g)) RPL.start('auto'); } catch (e) { reportError('Replay.onEvents', e); } }
      if (ctx.state === 'playing' && g.finished && frameEvents.some(isGameOver)) setState('over');
      // E6: la 10ª repetición del ejercicio (la sim no emite gameOver: drillEnd y g.drill.done)
      else if (ctx.state === 'playing' && g.drill && g.drill.done && frameEvents.some(isDrillEnd)) { if (g.careerDrill) careerDrillDone(g); setState('over'); }
      if (g.career && !g.demo && frameEvents.length) careerEvents(g, frameEvents);
      // ambiente de Carrera: director (después de la Carrera y del grabador de repeticiones, que no ve los amb:*)
      if (g.career && !g.demo) ambFrame(g, gdt, frameEvents);
    } else { edge.hit = edge.jump = edge.jset = edge.switchPlayer = false; acc = 0; }
    ctx.gameDt = gdt;

    var ev = frameEvents.length ? frameEvents : EMPTY;
    // escena tapada (pausa, pantalla final ya visible): se pinta a ritmo reducido. Durante la celebración
    // previa a la pantalla final (ctx.endHold, ui.js) se pinta a ritmo completo.
    // (S3-C1: con una repetición en marcha, a ritmo completo también en la hoja final: «Jugadas»)
    if (((ctx.state === 'over' && g && (g.finished || (g.drill && g.drill.done)) && !ctx.endHold) || ctx.state === 'paused') && !rpA) idleT += realDt; else idleT = 0;
    if (R) rpDraw(g, R, gdtR, realDt);
    else {
    call('Arena', 'update', g, gdt, ev);
    call('Players', 'update', g, gdt, ev);
    // contactos cosméticos de la celebración (players PLY-07): se reparten como eventos 'fx:*' a FX, cámara, audio y UI
    if (VB.Players && VB.Players.drainFx && g) {
      PFX.length = 0; try { VB.Players.drainFx(PFX); } catch (e) { reportError('Players.drainFx', e); PFX.length = 0; }
      if (PFX.length) { if (ev === EMPTY) ev = frameEvents; for (var pf = 0; pf < PFX.length; pf++) { var fq = PFX[pf]; fq.t = g.time; fq.type = 'fx:' + fq.type; ev.push(fq); } }
    }
    call('FX', 'update', g, gdt, ev);
    // escenas congeladas: los efectos del evento que dispara la escena se envejecen lo que avanzó la sim desde él
    // (si no, el destello/onda se queda congelado a plena intensidad en la captura)
    if (fxAge > 0 && ctx.frozen && ev !== EMPTY) { call('FX', 'update', g, fxAge, EMPTY); fxAge = 0; }
    call('CameraRig', 'update', g, realDt, ev);
    // &camyaw=rad (solo depuración): gira la cámara tras su update; escena reproducible con el jugador fuera de cuadro para el
    // indicador de borde (UI-10), p. ej. ?debug=rally&live=1&seed=4&camyaw=0.9
    if (ctx.debug && Q.camyaw && ctx.camera) { ctx.camera.rotateY(+Q.camyaw || 0); ctx.camera.updateMatrixWorld(true); }
    if (dollOn) call('Doll', 'update', g, realDt);   // ?debug=doll: animación de la maqueta y cámara fija (después de la cámara)
    if (lookOn) previewUpdate(realDt);                // Vestuario: anima el muñeco de muestra y coloca ctx.camera (después de la cámara)
    call('Audio', 'handle', ev, g);
    call('Audio', 'update', g, realDt);
    call('UI', 'update', g, gdt, ev);
    if (VB.AmbienteUI) call('AmbienteUI', 'update', g, gdt, ev);   // bocadillos y subtítulos del ambiente de Carrera (js/ambiente-ui.js)
    }
    if (g && g.career && !g.demo) {
      // B6: la hoja final de Carrera = el Resumen de la jornada de ui.js (VB.UI.endCareer, que sustituye a careerEndSheet), tras showEnd,
      // con «Lo mejor / A mejorar» de la nota en directo (careerRtBlock); el partidillo de prueba, su hoja propia (careerTrialSheet)
      if (careerEnd && !endTweaked && ctx.state === 'over') {
        endTweaked = true;
        if (careerEnd.trial || (g.career && g.career.trial)) { try { careerTrialSheet(g, careerEnd); } catch (e) { reportError('careerTrialSheet', e); } }
        else { call('UI', 'endCareer', careerEnd, g, careerEndXv); try { careerRtBlock(careerEnd); } catch (e) { reportError('careerRtBlock', e); } }
      }
      // (marcador con las abreviaturas de los clubes: lo pinta ui.js con g.career.me / g.career.rival)
    }

    if (bestPend) bestPendTick();
    // En pausa (y en la pantalla final ya asentada) la escena queda detrás de un velo desenfocado: se pinta
    // a 1/3 de frecuencia para ahorrar batería y calor en el móvil. Entrada y UI siguen a ritmo completo.
    // Móvil en vertical: el aviso "Gira el móvil" tapa toda la pantalla, no se pinta nada (batería).
    var throttled = ctx.portraitBlock || (idleT > 0.6 && (ctx.frame % 3) !== 0) || ffDrawSkip;   // (banquillo: saltando no se pinta)
    ffDrawSkip = false;
    // precompilado asíncrono en curso (arranque): no se pinta todavía (pintar esperaría al driver y congelaría el telón)
    if (progWarm.pending && progsPending() && progWarm.gate) throttled = true;
    // programas listos: primer dibujo de todo (variantes de ANGLE) justo antes del primer frame real, aún bajo el telón
    if (needWarmDraw && !throttled && !glLost && !(progWarm.pending && progWarm.gate)) { needWarmDraw = false; warmDraw(); }
    if (!throttled && !glLost) {
      drawn++;
      // 4b (B2): un retrato en cola, solo en el menú y en la hoja final (nunca en partido), con el telón ya quitado y sin el
      // precompilado del arranque en curso; se pinta en una esquina del lienzo ANTES del render, que lo tapa en este mismo frame
      if (PQ.length) { if ((ctx.state === 'menu' || ctx.state === 'over') && drawn >= 3 && !progWarm.gate) portraitStep(); }
      else if (!pt.freed && !lookOn && (pt.idleT += realDt) > 1) portraitFree();   // (en el Vestuario no: cada rejilla volvería a compilar el programa del retrato, 10+ ms de golpe)
      ctx.renderer.info.reset();
      try {
        if (ctx.renderFn) ctx.renderFn(ctx); else ctx.renderer.render(ctx.scene, ctx.camera);
        if (lookOn) previewPass();   // Vestuario en vertical: el muñeco solo en la mitad de arriba (VB.Doll.preview.pass)
      } catch (e) { reportError('render', e); }
    }

    // telón: en depuración se quita sin más; si no, ui.js hace el relevo al menú (espera a las fuentes; UI-07)
    if (drawn === 3 && !bootDone && bootEl) {
      bootDone = true;
      if (ctx.debug || drillId(Q.drill)) bootEl.hidden = true;   // (&drill=: el ejercicio empieza ya, sin relevo al menú)
      else if (!call('UI', 'bootReady', bootEl)) { bootEl.classList.add('gone'); var mn = document.getElementById('menu'); if (mn) mn.classList.remove('intro'); }
    }
    if (idleT > 0.6 || ctx.portraitBlock || progWarm.gate) { meter.t = 0; meter.n = 0; meter.js = 0; meter.lt = 0; } else measure(raw); // sin medir mientras se pinta a ritmo reducido
    ctx.frameMs = performance.now() - tWork;
  }
  // S3-C1: repetición. evP = eventos de la sombra para Players (con point); evF = sin point, para FX y Audio (VB.Replay.tick los rellena)
  var evP = [], evF = [];
  var slowQ = Q.debug && +Q.slow > 0 ? Math.min(1, +Q.slow) : 0;
  function rpInput(it) {
    var rq = ctx.replaySkipReq, exit = rq === 'all', sk = !!rq && !exit;
    ctx.replaySkipReq = false;
    if (it && ctx.state !== 'paused') {   // (en pausa manda el menú de pausa; al reanudar, la repetición sigue)
      if (it.pause || it.navBack) exit = true;
      else if (it.hit || it.jump || it.confirm || it.switchPlayer || it.navOk) sk = true;
      it.hit = it.jump = it.jset = it.switchPlayer = it.pause = it.confirm = it.navOk = it.navBack = it.challenge = false; it.navTab = 0; it.mx = it.my = 0;
    }
    if (exit || sk) { try { VB.Replay.skip(exit); } catch (e) { reportError('Replay.skip', e); } }
  }
  /** Frame de la repetición (orden de S3-C1 §3): el escenario sigue con la partida en vivo; jugadores, efectos, cámara y golpes
   *  pintan la sombra R; audio y UI siguen el vivo (la UI tapa el HUD con #app.replay). */
  function rpDraw(g, R, gdtR, realDt) {
    call('Arena', 'update', g, realDt, EMPTY);
    call('Players', 'update', R, gdtR, evP);
    if (VB.Players && VB.Players.drainFx) {
      PFX.length = 0; try { VB.Players.drainFx(PFX); } catch (e) { reportError('Players.drainFx', e); PFX.length = 0; }
      for (var pf = 0; pf < PFX.length; pf++) { var fq = PFX[pf]; fq.t = R.time; fq.type = 'fx:' + fq.type; fq.replay = true; evF.push(fq); }
    }
    call('FX', 'update', R, gdtR, evF);
    call('CameraRig', 'update', R, realDt, EMPTY);
    call('Audio', 'handle', evF, R);
    call('Audio', 'update', g, realDt);
    call('UI', 'update', g, 0, EMPTY);
  }
  var bestPend = false;   // ?debug=best&play=1: ve todas las jugadas en cuanto se abre la hoja final
  function bestPendTick() {
    var g = ctx.game;
    if (!bestPend || ctx.state !== 'over' || ctx.endHold || !g || !g.finished) return;
    var e = document.getElementById('end'); if (!e || e.hidden) return;
    bestPend = false; ctx.actions.playBest();
  }
  function isGameOver(e) { return e.type === 'gameOver'; }
  function isDrillEnd(e) { return e.type === 'drillEnd'; }
  /** Partido de Carrera: estadísticas para la nota (VB.Career.ingest) y cierre en gameOver (antes de UI.update). */
  function careerEvents(g, evs) {
    var K = VB.Career; if (!K || (g.career && g.career._debug)) return;   // (escena de prueba bench6: Carrera de mentira)
    try { if (K.ingest) K.ingest(evs, g); } catch (e) { reportError('Career.ingest', e); }
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type !== 'gameOver' || careerEnd) continue;
      // partidillo de prueba: lo cierra trialDone (nota con letra, objetivos, te fichan o no); ni jornada, ni XP, ni entrenador
      if (g.career && g.career.trial) {
        var tr = null;
        try { tr = K.trialDone ? K.trialDone(g.career.mode, g.career.offer, { sets: [e.sets[0], e.sets[1]], setScores: e.setScores || g.setScores, win: e.team === 0 }, g) : null; }
        catch (er) { reportError('Career.trialDone', er); tr = null; }
        careerEnd = tr ? Object.assign({ trial: true }, tr) : { trial: true, none: true };
        continue;
      }
      try { careerEnd = K.matchDone({ sets: [e.sets[0], e.sets[1]], setScores: e.setScores || g.setScores, win: e.team === 0 }, null, g) || { nota: 0, xp: 0 }; }
      catch (er) { reportError('Career.matchDone', er); careerEnd = { nota: 0, xp: 0 }; }
      careerEndXv = careerEndX(K, careerSes);   // B6: tabla, puesto, lo siguiente, barra y sesiones (solo lectura)
    }
  }
  function safePoll(dt) { try { return VB.Input.poll(dt); } catch (e) { reportError('Input.poll', e); return null; } }

  // ---------- Ambiente de Carrera (js/ambiente.js + js/ambiente-ui.js; notes/ambiente.md) ----------
  // El director (VB.Ambiente) vive en la Carrera (career.js lo crea y lo alimenta con los eventos de la sim) o, en la escena
  // ?debug=amb, aquí (ambDbg). Cada frame del partido en vivo: frame() → amb:* al array del frame (después del grabador de
  // repeticiones) y ctl → las 3 puertas de la sim (Sim.holdFor / canPenalty / penalty). Nada con la previa (otra rama del bucle) ni
  // durante la repetición (R: la sim en vivo no avanza); saltando el banquillo (bench.ff) solo sigue el marcador.
  var AMBQ = [], AMBF = { intro: false, ff: false, bench: false, reduce: false, replay: false }, ambDbg = null, AMB_PEN = { card: '', pid: -1 };
  function ambSt(g) {
    var A = VB.Ambiente; if (!A || !g || !g.career || g.demo) return null;
    try { return A.of ? A.of(g) : (VB.Career && VB.Career.amb ? VB.Career.amb(g) : null); } catch (e) { return null; }
  }
  function ambFrame(g, gdt, evs) {
    var A = VB.Ambiente; if (!A) return;
    if (ambDbg && ambDbg.g === g) { for (var i = 0; i < evs.length; i++) { try { A.feed(ambDbg.st, evs[i], g); } catch (e) { reportError('Ambiente.feed', e); } } }
    var st = ambSt(g); if (!st) return;
    // «Apagado» a mitad de partido: silencio al momento (el resto se aplica en el partido siguiente)
    // (el director pasa un frame «saltando»: cierra unas fichas abiertas —si no, se quedaban abiertas para siempre y CAMBIAR protestaba
    // a ciegas—, da por perdido un castigo pendiente y vacía la cola; solo se deja salir el cierre de las fichas, para que ui.js las quite)
    if (ctx.settings.ambient === 'off' && !(ambDbg && ambDbg.g === g)) {
      call('AmbienteUI', 'clear');
      if (!st.offDone) {
        st.offDone = true; AMBQ.length = 0;
        try { A.frame(st, g, 0, AMBQ, { intro: false, ff: true }); } catch (e) { reportError('Ambiente.frame', e); }
        for (var k = 0; k < AMBQ.length; k++) if (AMBQ[k].type === 'amb:choiceEnd') evs.push(AMBQ[k]);
      }
      return;
    }
    st.offDone = false;
    AMBF.intro = intro.left > 0; AMBF.ff = !!bench.ff; AMBF.bench = !!g.ctrlOut; AMBF.reduce = !!ctx.reduceMotion; AMBF.replay = !!ctx.replay || !!(VB.Replay && VB.Replay.active && VB.Replay.active());
    AMBQ.length = 0;
    var ctl = null; try { ctl = A.frame(st, g, gdt, AMBQ, AMBF); } catch (e) { reportError('Ambiente.frame', e); return; }
    if (ctl) {
      if (ctl.hold > 0 && Sim.holdFor) { try { Sim.holdFor(g, ctl.hold, !!ctl.lock); } catch (e) { reportError('Sim.holdFor', e); } }
      if (ctl.penalty >= 0) {
        var ok = false;
        AMB_PEN.card = ctl.pcard || 'red'; AMB_PEN.pid = ctl.ppid;
        // (ctl.penalty = equipo SANCIONADO; el punto va al otro: notes/ambiente.md «Cambios al contrato»)
        try { if (Sim.canPenalty && Sim.penalty && Sim.canPenalty(g, ctl.penalty)) ok = !!Sim.penalty(g, ctl.penalty, { card: AMB_PEN.card, pid: AMB_PEN.pid }); } catch (e) { reportError('Sim.penalty', e); ok = false; }
        try { A.penaltyDone(st, ok); } catch (e) { reportError('Ambiente.penaltyDone', e); }
      }
    }
    for (var j = 0; j < AMBQ.length; j++) evs.push(AMBQ[j]);
  }
  /** Fichas abiertas: CAMBIAR = Protestar (consume los botones: true); GOLPEAR / SALTAR / aceptar = Dejarlo (false: la pausa se recorta). */
  function ambChoiceInput(g, it) {
    var A = VB.Ambiente, st = ambSt(g); if (!A || !st || !A.choiceOpen(st)) return false;
    if (edge.switchPlayer) { A.choose(st, 0, 'protest'); call('Audio', 'ui', 'click'); return true; }
    if (edge.hit || edge.jump || (it && it.confirm)) A.choose(st, 0, 'drop');
    return false;
  }
  function ambSkip(g) { var A = VB.Ambiente, st = ambSt(g); if (A && st && A.skip) { try { A.skip(st); } catch (e) { reportError('Ambiente.skip', e); } } }
  /** Ficha táctil (ui.js): 'protest' | 'drop'. true si había elección abierta. */
  ctx.actions.ambChoose = function (pick) {
    var A = VB.Ambiente, st = ambSt(ctx.game); if (!A || !st || !A.choiceOpen(st)) return false;
    var ok = A.choose(st, 0, pick === 'protest' ? 'protest' : 'drop');
    if (ok) call('Audio', 'ui', 'click');
    return ok;
  };
  /** ?debug=amb: Carrera de mentira con su director (no pasa por career.js ni toca ninguna Carrera guardada). */
  function ambDebugStart(g, a6, k) {
    var A = VB.Ambiente; if (!A) { console.warn('[VB] escena amb: falta js/ambiente.js'); return; }
    var home = Q.final === '1' ? -1 : Q.away === '1' ? 1 : 0, derby = k === 'derby', heat = derby ? 0.9 : k === 'boo' ? 0.8 : +Q.heat || 0.5;
    var amb = { home: home, heat: heat, fans: home === 0 ? [0.55, 0.15] : home === 1 ? [0.15, 0.55] : [0.3, 0.3], tags: derby ? ['derbi'] : home < 0 ? ['final'] : [],
      level: derby ? 'high' : Q.level || 'mid', city: 'Rocaverde', venue: a6 ? 'Rocaverde' : 'Cala Rocaverde', short: ['Rocaverde', 'Sorrasal'], capt: [0, 0], coach: ['', ''], riv: derby ? 0.6 : 0.1 };
    g.career.amb = amb; g.career.ambient = Q.calm === '1' ? 'calm' : 'full'; g.career.atHome = home === 0;
    var st = A.create({ seed: g.seed, hall: a6, level: amb.level, mode: g.career.ambient, amb: amb, main: true, faro: true,
      me: { name: g.career.player, num: g.career.num | 0 }, mate: a6 ? null : { name: g.career.mate, num: 2 }, club: 'Rocaverde', rivalClub: 'Sorrasal',
      force: ['choice', 'yellow', 'red', 'boo', 'chant', 'lines'].indexOf(k) >= 0 ? k : '',
      rate: function (kind, v, txt) { console.info('[VB] ambiente → nota: ' + kind + ' ' + v + ' ' + (txt || '')); } });
    if (A.bind) A.bind(g, st);
    ambDbg = { g: g, st: st };
  }

  // ---------- Banquillo (Carrera de pista: empiezas de suplente o te cambian; notes/titularidad-y-cambios.md §B.3) ----------
  // ctx.bench = {out: tu atleta en el banquillo, fast: ×3, ff: '' | 'in' (saltar hasta que entres) | 'end' (saltar al final)}; ui.js
  // pinta la barra y el velo «Simulando…». Saltar = la sim avanza sin pintar en trozos de FF_CHUNK s de juego hasta FF_BUDGET ms por
  // frame; los eventos van a la Carrera (careerEvents) y al recuento de ui.js (ingest), no a sonido ni atletas. Para con un 'sub' o
  // 'lineup' que te mete (meIn) o con el final del partido: entonces los eventos de ese paso siguen el camino normal del frame
  // (rótulo del cambio, hoja final), players.js se rehace (onGameStart) y la cámara corta.
  var FF_CHUNK = 2, FF_BUDGET = 8, IQ6 = { easy: 1, normal: 2, hard: 3, expert: 3 };
  var bench = { out: false, fast: false, ff: '' }, ffDrawSkip = false, ffBatch = [], ffStep = [];
  ctx.bench = bench;
  ctx.actions.benchFast = function () { var g = ctx.game; if (!g || !g.ctrlOut || bench.ff) return false; bench.fast = !bench.fast; call('Audio', 'ui', 'click'); return bench.fast; };
  ctx.actions.benchSkip = function (mode) {
    var g = ctx.game; if (!g || !g.ctrlOut || !g.career || ctx.state !== 'playing') return false;
    bench.ff = mode === 'end' ? 'end' : 'in'; bench.fast = false; call('Audio', 'ui', 'click'); return true;
  };
  function ffStop(g) {
    bench.ff = ''; bench.fast = false;
    call('Players', 'onGameStart', g);
    call('CameraRig', 'snap', g);
  }
  function ffRun(g) {
    var t0 = performance.now(), steps = Math.round(FF_CHUNK / STEP), stop = false;
    var as0 = ambSt(g); if (as0) as0.ff = true;   // ambiente: saltando, el director sigue el marcador sin disputas ni frases
    ffBatch.length = 0;
    while (!stop && performance.now() - t0 < FF_BUDGET) {
      for (var k = 0; k < steps; k++) {
        try { Sim.step(g, STEP, null); } catch (e) { reportError('Sim.step', e); stop = true; break; }
        ffStep.length = 0; Sim.drainEvents(g, ffStep);
        if (!ffStep.length) continue;
        var hit = false;
        for (var j = 0; j < ffStep.length; j++) { var e = ffStep[j]; if (((e.type === 'sub' || e.type === 'lineup') && e.meIn) || e.type === 'gameOver') hit = true; }
        if (hit) { for (j = 0; j < ffStep.length; j++) frameEvents.push(ffStep[j]); stop = true; break; }
        for (j = 0; j < ffStep.length; j++) ffBatch.push(ffStep[j]);
      }
      if (g.finished || !g.ctrlOut) stop = true;
    }
    if (ffBatch.length) {
      if (g.career && !g.demo) careerEvents(g, ffBatch);
      call('UI', 'ingest', ffBatch, g);
    }
    if (stop) ffStop(g);
  }

  // ---------- Medición y calidad adaptativa ----------
  // Ventanas de 2 s (afinado con tools/perf.js: móvil emulado 844x390, dpr 2,75, CPU ×4).
  //  - BAJA un nivel tras 2 ventanas seguidas < 45 fps (no llega) o 3 seguidas < 52 fps (va justo: el objetivo es 55-60).
  //  - Ya en "baja": escala de render ×0,8 y luego ×0,67 tras 2 ventanas < 45 fps, PERO solo si el cuello es la GPU
  //    (tiempo ocupado del hilo principal < 40 % del intervalo entre frames; ocupado = máx. del JS del juego y de la suma de
  //    tareas largas). Si el que no llega es el procesador, quitar píxeles no ayuda y solo emborrona la imagen. Además,
  //    tras cada escalón se comprueba: si en las 2 ventanas siguientes los fps no suben al menos un 15 %, se deshace y no
  //    se vuelve a escalar (con la CPU saturada al 90-100 % llegaba a 0,8 con js 0,50-0,53 y los fps seguían en ~48).
  //  - Calentamiento: nada de ventanas en los primeros 8 s tras el arranque (compilación de shaders y subida de texturas
  //    en los primeros frames; un móvil cargado bajaba de media a baja en el menú a los 3 s con un pico de 550 ms).
  //  - SUBE uno (hasta el máximo automático: alta en escritorio, media en móvil) tras 5 ventanas seguidas > 58 fps y 30 s
  //    sin bajar; tras 2 bajadas ya no sube (evita oscilar).
  //  - La ventana siguiente a un cambio de calidad, al empezar partido o tras volver de la pausa no cuenta (recompilación
  //    de sombras/materiales y subida de texturas dan picos que no son el ritmo real).
  // Desactivada con ?quality=, en depuración (salvo &aq=1, para tools/perf.js) o con calidad fija en Ajustes.
  var aq = { low: 0, mild: 0, high: 0, downs: 0, lastDown: -99, skip: 1, warmUntil: 0, boot: 0, chk: null, noScale: false };
  /** Un parón que no es el ritmo real (rehacer el muñeco del Vestuario, subir su atlas…): la ventana de fps en curso no cuenta para la
   *  calidad adaptativa. Lo llama showroom; ui.js también puede llamarlo si rehace la geometría de la vista previa por su cuenta. */
  ctx.noteHitch = function () { aq.skip = 1; };
  ctx.cpuBusy = 0; // fracción ocupada del hilo principal en la última ventana (máx. de JS del juego y tareas largas)
  ctx.frameMsAvg = 0; // coste JS medio por frame de la última ventana (ms)
  function measure(raw) {
    if (document.hidden || raw > 0.5) return;
    meter.t += raw; meter.n++; meter.js += ctx.frameMs || 0;
    if (fpsEl && Q.fps === '1' && (fpsShowT += raw) > 0.5) {
      fpsShowT = 0; var info = ctx.renderer.info.render;
      fpsEl.hidden = false;
      fpsEl.textContent = Math.round(ctx.fps) + ' fps · ' + ctx.quality.level + ' · pr ' + ctx.renderer.getPixelRatio().toFixed(2) + (renderScale < 1 ? ' (×' + renderScale + ')' : '') + '\n' + info.calls + ' draw · ' + Math.round(info.triangles / 1000) + 'k tri · js ' + ctx.frameMsAvg.toFixed(1) + ' ms';
    } else if (fpsEl && ctx.settings.showFps && (fpsShowT += raw) > 0.5) {
      // E3: Ajustes · Imagen · Ver FPS: una línea corta (el texto solo se escribe si cambia)
      fpsShowT = 0;
      var ft = Math.round(ctx.fps) + ' fps | ' + (QNAME[ctx.quality.level] || '');
      if (fpsEl.hidden) fpsEl.hidden = false;
      if (fpsEl.textContent !== ft) fpsEl.textContent = ft;
    }
    if (meter.t < 2) return;
    ctx.fps = meter.n / meter.t; ctx.frameMsAvg = meter.js / meter.n;
    var interval = 1000 * meter.t / meter.n, win = 1000 * meter.t;
    ctx.cpuBusy = Math.min(1, Math.max(ctx.frameMsAvg / interval, meter.lt / win));
    meter.t = 0; meter.n = 0; meter.js = 0; meter.lt = 0;
    adaptQuality(ctx.fps, ctx.cpuBusy);
  }
  // Historial de la calidad adaptativa (lo lee tools/perf.js): {t (s de ctx.time, con tope por frame), rt (s reales desde el arranque), level, scale, pr, fps, js (fracción del frame), why}
  ctx.qLog = [];
  function logQ(why, fps, load) {
    var e = { t: Math.round(ctx.time * 10) / 10, rt: Math.round((performance.now() - aq.boot) / 100) / 10, level: ctx.quality.level, scale: renderScale, pr: Math.round(ctx.renderer.getPixelRatio() * 100) / 100, fps: Math.round(fps), js: Math.round((load || 0) * 100) / 100, why: why };
    if (ctx.qLog.length < 50) ctx.qLog.push(e);
    console.info('[VB] calidad -> ' + e.level + (renderScale < 1 ? ' ×' + renderScale : '') + ' (' + e.fps + ' fps, ' + why + ')');
  }
  function stepDown(why, fps, load) {
    aq.low = aq.mild = aq.high = 0; aq.downs++; aq.lastDown = ctx.time; aq.skip = 1;
    applyQuality(BY_RANK[ctx.quality.rank - 1]); logQ(why, fps, load);
  }
  function adaptQuality(fps, load) {
    if ((ctx.debug && Q.aq !== '1') || Q.quality || ctx.settings.quality !== 'auto' || ctx.state === 'paused' || ctx.portraitBlock) { aq.low = aq.mild = aq.high = 0; aq.skip = 1; aq.chk = null; return; }
    if (performance.now() < aq.warmUntil) { aq.low = aq.mild = aq.high = 0; return; } // calentamiento tras el arranque
    if (aq.skip > 0) { aq.skip--; return; }
    if (aq.chk) { // ¿sirvió el último escalón de escala? 2 ventanas y media de fps
      aq.chk.sum += fps; if (++aq.chk.n < 2) return;
      var gain = aq.chk.sum / aq.chk.n / aq.chk.fps, prevScale = aq.chk.scale; aq.chk = null;
      if (gain < 1.15) {
        renderScale = prevScale; aq.noScale = true; aq.low = aq.mild = 0; aq.skip = 1;
        applyQuality(ctx.quality); logQ('escala deshecha (x' + gain.toFixed(2) + ')', fps, load); return;
      }
    }
    var r = ctx.quality.rank;
    // E3: con el tope de 30 fps se compara contra 30 (baja si < 26; subir, nunca): con los umbrales de 60 bajaría siempre
    var capped = ctx.settings.fpsCap > 0;
    if (fps < (capped ? 26 : 45)) {
      aq.high = 0; aq.mild++;
      if (++aq.low < 2) return;
      if (r > 0) { stepDown('baja', fps, load); return; }
      // ya en "baja": menos píxeles solo si la GPU es el cuello de botella
      if (renderScale > 0.7 && load < 0.4 && !aq.noScale) {
        aq.low = aq.mild = 0; aq.downs++; aq.lastDown = ctx.time; aq.skip = 1;
        aq.chk = { fps: fps, scale: renderScale, sum: 0, n: 0 };
        renderScale = renderScale > 0.9 ? 0.8 : 0.67;
        applyQuality(ctx.quality); logQ('escala', fps, load);
      } else aq.low = 0;
    } else if (capped) { aq.low = 0; aq.mild = 0; aq.high = 0;
    } else if (fps < 52) {
      aq.low = 0; aq.high = 0;
      if (r > 0 && ++aq.mild >= 3) stepDown('baja (justa)', fps, load);
    } else if (fps > 58) {
      aq.low = aq.mild = 0;
      if (r < autoTop().rank && aq.downs < 2 && ctx.time - aq.lastDown > 30 && ++aq.high >= 5) {
        aq.high = 0; aq.skip = 1; applyQuality(BY_RANK[r + 1]); logQ('sube', fps, load);
      }
    } else { aq.low = 0; aq.mild = 0; aq.high = 0; }
  }

  // ---------- Escenas de depuración ----------
  // Avanzan la simulación de forma determinista hasta un momento representativo
  // y congelan (ctx.frozen) para que las capturas sean significativas.
  // &live=1 sigue corriendo después; &seed=N cambia la semilla.
  function debugScene(name) {
    var sd = Q.seed ? +Q.seed : 7, diff = ctx.settings.difficulty;
    function mk(auto, noClock) { return Sim.createGame({ demo: false, autopilot: !!auto, seed: sd, difficulty: diff, serveClock: noClock ? false : undefined, venue: venueNow() }); }
    var preLand = null; // último 'land' ANTERIOR al momento buscado (escenas de punto: la marca del bote)
    function advanceUntil(g, pred, extra, maxSec, onAll) {
      var evs = [], keep = [], trig = -1, t = 0, max = (maxSec || 600) / STEP;
      for (var i = 0; i < max; i++) {
        Sim.step(g, STEP, null); evs.length = 0; Sim.drainEvents(g, evs);
        if (onAll && evs.length) onAll(evs, g);
        for (var j = 0; j < evs.length; j++) {
          var ej = evs[j];
          if (trig < 0 && ej.type === 'serveReady') preLand = null;
          if (trig < 0 && pred(ej, g)) trig = i;
          if (trig >= 0) keep.push(ej); else if (ej.type === 'land') preLand = ej;
        }
        if (trig < 0 && evs.length === 0 && pred(null, g)) trig = i;
        if (trig >= 0) { t += STEP; if (t >= extra) break; }
      }
      if (trig < 0) console.warn('[VB] escena ' + name + ': no se alcanzó el momento buscado');
      fxAge = Math.min(0.6, extra || 0); // edad de los efectos del evento que dispara la escena (ver frame)
      return keep;
    }
    function uiIngest(evs, g) { call('UI', 'ingest', evs, g); }
    /** Nota en directo de muestra para &rt=1 (la forma de VB.Career.liveRating: { v, on, sc, seq, log, trial }). Los eventos de la escena
     *  pasan por VB.Rating si está cargado; si no dejan ningún aviso, uno de muestra (&neg=1 uno que resta). &rtv=N fija la nota, &sc=1
     *  «s. c.» (menos de 5 puntos en pista) y &off=1 en el banquillo. */
    function rtDebug(g, evs) {
      var R = VB.Rating, six = g.size === 6, me = six ? g.ctrl : g.teams && g.teams[0][0];
      var o = { v: 6, on: Q.off !== '1', sc: Q.sc === '1', seq: 0, log: [], trial: !!(g.career && g.career.trial) };
      if (R && typeof R.create === 'function' && typeof R.feed === 'function') {
        try {
          var st = R.create({ hall: six, pos: six ? g.ctrlRole || 'OH' : 'atk', points: g.points, toWin: g.toWin, trial: o.trial, on: true });
          var who = function (pl) { return !pl ? -1 : pl === me ? 0 : pl.team === 0 ? 1 : -1; };
          for (var i = 0; i < evs.length; i++) R.feed(st, evs[i], who);
          o.v = R.value(st); o.seq = st.seq | 0; o.log = (st.log || []).slice(-1);
        } catch (e) { reportError('Rating (escena de depuración)', e); }
      }
      if (!o.log.length || Q.neg === '1') { o.seq++; o.log = [Q.neg === '1' ? { seq: o.seq, kind: 'play', id: 'srvErr', txt: 'Error de saque', d: -0.2, v: 6.4 } : { seq: o.seq, kind: 'play', id: 'ace', txt: 'Ace', d: 0.3, v: 6.8 }]; o.v = o.log[0].v; }
      if (Q.rtv != null && Q.rtv !== '' && isFinite(+Q.rtv)) o.v = +Q.rtv;
      // &co=<id de VB.Consignas.C>: la consigna del entrenador en la línea de debajo (&cos=ok|miss: ya resuelta)
      var CC = VB.Consignas && VB.Consignas.C;
      if (Q.co && CC && CC[Q.co]) o.coach = { id: Q.co, txt: CC[Q.co].txt, state: Q.cos === 'ok' || Q.cos === 'miss' ? Q.cos : 'on', seq: 1 };
      return o;
    }
    var g, keep = [], state = 'playing', live = Q.live === '1', dbgKit = null, trialDbg = null;   // (dbgKit: equipación de la escena; trialDbg: hoja de la prueba)
    switch (name) {
      case 'menu': case 'tutorial': case 'controls': case 'settings':
        ctx.actions.toMenu(); return;
      // ONLINE (fase 1, notes/net.md): ?net=bc&slot=0|1&lag=&jit=&loss= — dos pestañas unidas por BroadcastChannel
      case 'net':
        ctx.actions.toMenu(); startNetTest(); return;
      // Vestuario (tools/shot.js): el menú con la página `look` abierta. &tab=pelo|cabeza|cara|cuerpo|brazos|piernas|colores,
      // &venue=hall|beach (pista o playa del Vestuario, no el escenario), &item=<id del catálogo> (lo prueba puesto), &pick=1|2|career
      case 'look':
        ctx.actions.toMenu(); openLookDebug(); return;
      case 'serve': case 'hud':
        // sin la regla de 8 s: las capturas largas no acaban en falta de saque (&clock=1 la activa)
        g = mk(false, Q.clock !== '1'); break;
      case 'toss': case 'jumpserve': // saque humano con el balón en el aire (flotante / en salto)
        g = mk(false, true);
        for (var si = 0; si < 240 && !g.serveAuth; si++) Sim.step(g, STEP, null);
        Sim.step(g, STEP, { move: [0, 0], hit: name === 'toss', jump: name === 'jumpserve', switchPlayer: false });
        for (var sj = 0; sj < (name === 'toss' ? 50 : 145); sj++) Sim.step(g, STEP, null);
        Sim.drainEvents(g, keep);
        // sin 'newMatch': su banner "Set 1" taparía la escena congelada para siempre
        keep = keep.filter(function (e) { return e.type !== 'newMatch'; }); break;
      case 'dive': // plancha que se lea como plano principal
        g = mk(true);
        // Por defecto, plancha de NUESTRO equipo hecha por el que NO controlamos, con el compañero controlado más cerca de
        // la red (≥ 1,5 m) y el que se tira a < 4,8 m de ella: la cámara va detrás del controlado y el que se tira queda
        // DELANTE, a media distancia y grande en el plano (seed 7: la 6ª plancha propia, ~325 s de juego; seeds 2-5 también
        // tienen una). La de la CPU, al otro lado de la red, quedaba diminuta (~85 px a 1280x720, ~25 px a 844x390), y la
        // del jugador controlado tampoco sirve (el cambio automático lleva la cámara al compañero y el que se tira queda
        // detrás de ella). Si no hay ninguna en 30 min de juego, la primera de la CPU.
        // &team=0|1|any elige quién (sin el filtro de plano), &n=N la N-ésima, &t=s el instante tras el contacto (0,22 s: ya tendido).
        var dT = Q.t ? +Q.t : 0.22, dN = Q.n ? +Q.n : 1, dSeen = 0;
        if (Q.team == null) {
          keep = advanceUntil(g, function (e, gg) {
            if (!e || e.type !== 'dive' || e.miss || e.player.team !== 0) return false;
            var d = e.player, c = gg.ctrl;
            return c && c !== d && c.team === 0 && Math.abs(d.x) < 4.8 && Math.abs(c.x) < Math.abs(d.x) - 1.5 && ++dSeen >= dN;
          }, dT, 1800);
          if (!keep.length) { g = mk(true); dSeen = 0; keep = advanceUntil(g, function (e) { return e && e.type === 'dive' && !e.miss && e.player.team === 1 && ++dSeen >= dN; }, dT, 1800); }
        } else {
          var dTeam = Q.team === 'any' ? -1 : +Q.team;
          keep = advanceUntil(g, function (e) { return e && e.type === 'dive' && !e.miss && (dTeam < 0 || e.player.team === dTeam) && ++dSeen >= dN; }, dT, 1800);
        }
        break;
      case 'pause':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'point'; }, 2.4, 600, uiIngest);
        state = 'paused'; break;
      case 'rally': case 'mobile':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'hit' && e.kind === 'pass' && e.team === 0; }, 0.45); break;
      case 'spike':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'hit' && e.kind === 'spike'; }, 0.07); break;
      case 'block':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'block'; }, 0.06); break;
      case 'point':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'point'; }, 0.5, 600, uiIngest);
        if (preLand) keep.unshift(preLand); // el bote que decide el punto: FX/arena pintan su marca como en vivo
        break;
      case 'ace':
        // ace NUESTRO (banner dorado). Con el autopilot en Normal casi no hay aces: la escena va en Fácil
        // salvo &diff= (seed 7 → ace a los ~96 s). sim >= v2 lo marca en point.how (con roce de recepción, rallyHits > 0).
        if (!Q.diff) diff = 'easy';
        g = mk(true);
        // (&t= s tras el punto: C4, la cinta cinética ya entrada con t=0.9)
        keep = advanceUntil(g, function (e) { return e && e.type === 'point' && e.team === 0 && (e.how ? e.how === 'ace' : (!e.sideout && !e.rallyHits && e.reason === 'in')); }, Q.t ? +Q.t : 0.5, 1500, uiIngest);
        if (preLand) keep.unshift(preLand);
        break;
      case 'setpoint':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'serveReady' && (e.setPoint >= 0 || e.matchPoint >= 0); }, Q.t ? +Q.t : 0.5, 1500, uiIngest); break;
      case 'switch':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'switch' && e.auto && !e.reset; }, 0.18); break;
      // 6v6 (sprint 2, espectador: CPU contra CPU con el HUD de partido y la cámara de televisión). serve6: el sacador con el balón
      // lanzado (&n=N el N-ésimo saque, por defecto el 3r: ya ha habido rotación); rally6: la colocación del equipo 0 tras la
      // recepción (como 'rally'); point6: el punto (con su plano). &live=1 sigue jugando.
      case 'serve6': case 'rally6': case 'point6':
        forceVenue('hall');   // (6v6: siempre pabellón, también con &map=beach)
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, difficulty: diff, format: '6v6', present: true });
        g.watch = true;
        if (name === 'serve6') {
          var s6 = 0, n6 = Q.n ? +Q.n : 3;
          keep = advanceUntil(g, function (e) { return e && e.type === 'toss' && ++s6 >= n6; }, Q.t ? +Q.t : 0.3, 900, uiIngest);
        } else if (name === 'rally6') {
          keep = advanceUntil(g, function (e) { return e && e.type === 'hit' && (e.kind === 'set' || e.touch === 2) && e.team === 0; }, 0.35, 900);
        } else {
          keep = advanceUntil(g, function (e) { return e && e.type === 'point'; }, 0.5, 900, uiIngest);
          if (preLand) keep.unshift(preLand);
        }
        break;
      // 6v6 con HUMANO (sprint 3): llevas al receptor (n.º 2) y la IA al resto. serve6h: tu saque, con el balón en la mano tras el
      // silbato (&t= s tras el serveReady); rally6h: la colocación de tu equipo tras la recepción. Mientras avanza la escena el
      // humano no pulsa nada: se queda donde se le colocó en el saque (desde el 11-nov el personaje no se mueve solo)
      case 'serve6h': case 'rally6h':
        forceVenue('hall');
        g = Sim.createGame({ demo: false, seed: sd, difficulty: diff, format: '6v6', ctrl: 'one', ctrlRole: 'OH', present: true });
        if (name === 'serve6h') keep = advanceUntil(g, function (e, gg) { return e && e.type === 'serveReady' && e.player === gg.ctrl; }, Q.t ? +Q.t : 1.2, 900, uiIngest);
        else keep = advanceUntil(g, function (e) { return e && e.type === 'hit' && e.team === 0 && e.touch === 2; }, 0.35, 900);
        break;
      // 6v6 con humano para la CÁMARA (camera_input, 3ª persona; &cam6=tv para la de televisión). La IA juega también al humano
      // (autopilot) para que haga de todo; la cámara le sigue igual. tserve6: saque rival con el balón lanzado (&n=N el N-ésimo);
      // recv6: tu equipo recibe el saque (0,3 s tras el 1r toque); spike6: TU remate (&n=N); block6: bloqueo de tu equipo (&n=N);
      // point6h: el punto con su plano de reacción (&n=N; &won=1 solo los que gana tu equipo); setend6: el punto que cierra el 1r set
      case 'tserve6': case 'recv6': case 'spike6': case 'block6': case 'point6h': case 'setend6':
        forceVenue('hall');
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, difficulty: diff, format: '6v6', ctrl: 'one', ctrlRole: 'OH', present: true });
        var n6h = Q.n ? +Q.n : 1, c6h = 0, srv6 = false;
        if (name === 'tserve6') keep = advanceUntil(g, function (e) { return e && e.type === 'toss' && e.team === 1 && ++c6h >= n6h; }, Q.t ? +Q.t : 0.3, 900, uiIngest);
        else if (name === 'recv6') keep = advanceUntil(g, function (e) {
          if (!e || e.type !== 'hit') return false;
          if (e.kind === 'serve') { srv6 = e.team === 1; return false; }
          var ok = srv6 && e.team === 0 && e.touch === 1 && ++c6h >= n6h; srv6 = false; return ok;
        }, Q.t ? +Q.t : 0.3, 900, uiIngest);
        else if (name === 'spike6') keep = advanceUntil(g, function (e, gg) { return e && e.type === 'hit' && e.kind === 'spike' && e.player === gg.ctrl && ++c6h >= n6h; }, Q.t ? +Q.t : 0.07, 1800, uiIngest);
        else if (name === 'block6') keep = advanceUntil(g, function (e) { return e && e.type === 'block' && e.team === 0 && ++c6h >= n6h; }, Q.t ? +Q.t : 0.06, 1800, uiIngest);
        else if (name === 'setend6') keep = advanceUntil(g, function (e) { return e && e.type === 'point' && (e.setWon || e.matchWon); }, Q.t ? +Q.t : 1.0, 5400, uiIngest);
        else keep = advanceUntil(g, function (e) { return e && e.type === 'point' && (Q.won !== '1' || e.team === 0) && ++c6h >= n6h; }, Q.t ? +Q.t : 1.0, 1800, uiIngest);
        if (name === 'point6h' || name === 'setend6') { if (preLand) keep.unshift(preLand); }
        break;
      case 'over': case 'end':
        g = mk(true);
        keep = advanceUntil(g, function (e) { return e && e.type === 'gameOver'; }, 0, 3000, uiIngest); state = 'over';
        // &cr=1: la hoja final de un partido de Carrera con la nota en directo (datos de muestra, no toca ninguna Carrera guardada);
        // &rtv=N la nota (color de su franja), &lv=1 con subida de nivel, &nort=1 sin la nota en directo (la línea «Nota: 7,4» de antes)
        if (Q.cr === '1') {
          var crv = isFinite(+Q.rtv) && Q.rtv !== '' && Q.rtv != null ? +Q.rtv : 7.4;
          g.career = { _debug: true, me: 'TÚ', rival: 'VAL', rivalName: 'Voley Valencia', label: 'Circuito Regional · Jornada 3 de 14', player: 'Ari Lluch' };
          trialDbg = { nota: crv, xp: 312, lvlUp: Q.lv === '1', lvl: 4, ptsGained: 3, rt: null };
          if (Q.nort !== '1') trialDbg.rt = { nota: crv, best: [{ id: 'ace', txt: 'Ace', n: 3, d: 0.31 }, { id: 'kill', txt: 'Remate ganado', n: 9, d: 0.28 }, { id: 'block', txt: 'Bloqueo punto', n: 1, d: 0.1 }],
            worst: [{ id: 'srvErr', txt: 'Error de saque', n: 2, d: -0.17 }, { id: 'atkErr', txt: 'Remate fuera', n: 1, d: -0.08 }, { id: 'net', txt: 'Toque de red', n: 1, d: -0.08 }] };
        }
        break;
      // E6: ejercicios del Entrenamiento con la IA jugando por ti (autopilot) y congelados en un momento que se lea en la captura:
      // drill_serve (3r saque, balón en el aire), drill_recv (2º saque de la CPU llegando), drill_set (2º balón, antes de colocar),
      // drill_atk (6ª repetición: ya con el bloqueador), drill_block (2º ataque, el remate rival armado), drill_end (hoja final).
      // &n=N la repetición (1-10), &t=s tras su montaje. drill_end no apunta nada en make-the-cut.gym (depuración)
      case 'drill_serve': case 'drill_recv': case 'drill_set': case 'drill_atk': case 'drill_block': case 'drill_free': case 'drill_end': {
        var dk = name === 'drill_end' ? (drillId(Q.drill) || 'serve') : name.slice(6);
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, drill: dk, venue: venueNow(), difficulty: dk === 'free' ? diff : 'normal' });
        g.gym = dk;
        // drill_end&career=1: la hoja de una sesión de la Carrera (P6: letra, «Récord: B → A», barra del atributo, «¡Primera vez!» y
        // «Siguiente sesión»), con petos de entreno y un resultado de muestra (no toca ninguna Carrera); por defecto la 1ª vez («Primer récord»); &up=1 el +1 al atributo y «Récord: C → A»
        if (name === 'drill_end' && Q.career === '1') {
          var dup = Q.up === '1';
          g.careerDrill = { id: dk, mode: 'beach', n: 2, max: 3, attrName: 'Saque', done: true, next: dk === 'atk' ? 'serve' : 'atk',
            res: { ok: true, id: dk, how: 'play', total: 22, medal: 2, grade: 'A', gain: 18, mul: dup ? 1 : 1.5, first: !dup, focus: false, attr: 'serve', prog0: dup ? 88 : 41, prog: dup ? 6 : 59, need: 100,
              up: dup ? 'serve' : '', v: dup ? 52 : 51, fat0: 12, fat: 16, imp0: 30, imp: 38, best0: dup ? 14 : null, best: 22, bestGrade0: dup ? 'C' : null, bestGrade: 'A' } };
          dbgKit = { kitShirt: 0xc8202e, kitAccent: 0xffffff, kitShorts: 0x1b1b1b, kitPattern: 'liso', scrim: { bib0: 0xc8202e, bib1: 0x9be52e } };
        }
        if (name === 'drill_end') { keep = advanceUntil(g, function (e) { return e && e.type === 'drillEnd'; }, 0, 900); state = 'over'; break; }
        var dn = Q.n ? Math.max(1, +Q.n | 0) : ({ serve: 3, recv: 2, set: 2, atk: 6, block: 2, free: 1 })[dk];
        var dt0 = Q.t ? +Q.t : ({ serve: 1.15, recv: 1.25, set: 0.45, atk: 0.85, block: 0.95, free: 6 })[dk];
        keep = advanceUntil(g, function (e) { return e && e.type === 'drillStage' && e.n >= dn - 1; }, dt0, 900);
        break;
      }
      // banquillo y cambios (6v6): sub6 = rótulo de un cambio recién hecho (pedido para tu equipo: entra el opuesto suplente; &team=1
      // el rival), bench6 = Carrera empezando en el banquillo (barra «En el banquillo», cámara de televisión), subs6menu = pausa con el
      // panel «Cambios» abierto (Partido rápido; &pick=1 con uno de pista ya elegido)
      case 'sub6': case 'subs6menu': {
        var tm6 = Q.team === '1' ? 1 : 0;
        g = Sim.createGame({ demo: false, autopilot: name === 'sub6', seed: sd, difficulty: diff, format: '6v6', ctrl: 'one', ctrlRole: 'OH', present: true,
          bench: [Sim.defaultBench(0), Sim.defaultBench(1)], coach: [{ auto: false, iq: 2 }, { auto: name !== 'sub6', iq: 2 }] });
        if (name === 'sub6') {
          var o6 = g.rot[tm6].filter(function (p) { return p.role === 'OPP'; })[0], i6 = Sim.benchOf(g, tm6).filter(function (p) { return p.role === 'OPP'; })[0];
          keep = advanceUntil(g, function (e, gg) { if (e && e.type === 'hit' && e.touch === 2 && !gg.subQ[tm6] && !gg._rq6) { gg._rq6 = 1; Sim.requestSub(gg, tm6, o6, i6); } return e && e.type === 'sub'; }, Q.t ? +Q.t : 0.9, 900, uiIngest);
        } else { keep = advanceUntil(g, function (e) { return e && e.type === 'point'; }, 0.6, 900, uiIngest); state = 'paused'; }
        break;
      }
      case 'bench6': {
        var bb = [Sim.defaultBench(0), Sim.defaultBench(1)], nm6 = ['Nico Serrat', 'Ari Lluch', 'Kai Morell', 'Dani Ferrer', 'Alex Roig'];
        bb[0].forEach(function (b, i) { b.name = nm6[i]; });
        g = Sim.createGame({ demo: false, seed: sd, difficulty: diff, format: '6v6', ctrl: 'one', present: true, bench: bb, meBench: 1,
          names: [['Leo Brandt', 'Iker Sala', 'Pau Vidal', 'Joan Riera', 'Max Soler', 'Biel Mas'], null],
          coach: [{ auto: true, iq: 2, me: { pullAt: 4, enterLostSet: true, enterBad: true, garbage: true, backNextSet: true } }, { auto: true, iq: 2 }] });
        g.career = { _debug: true, me: 'VAL', rival: 'CAS', meName: 'Voley Valencia', rivalName: 'Voley Castelló', label: 'Hiperliga · Jornada 3 de 22', player: 'Tú', meOn: false, status: 'sub' };
        keep = advanceUntil(g, function (e) { return e && e.type === 'point'; }, Q.t ? +Q.t : 2.6, 900, uiIngest);
        break;
      }
      // partidillo de prueba de la Carrera (P4): un set a 15 con petos, la IA jugando por ti hasta el final y la hoja de la prueba
      // (veredicto, letra y objetivos). Datos de muestra: no toca ninguna Carrera guardada. &mode=hall la pista (6 contra 6, suplentes
      // contra titulares); &fail=1 suspendida (D); &at=rally congela la colocación de tu equipo a mitad de set (&n=N el N-ésimo
      // peloteo; para ver los petos); &pre=1 la previa de la Carrera (club, «1 set a 15» con petos, objetivos, «Saltar a la pista» y
      // «Simular»); &shirt=RRGGBB el color del club (por defecto azul marino: petos naranja contra lima)
      case 'trial': {
        var th = Q.mode === 'hall' || Q.format === '6v6', tsh = /^[0-9a-fA-F]{6}$/.test(Q.shirt || '') ? parseInt(Q.shirt, 16) : 0x1d3f7a;
        if (Q.pre === '1') {
          ctx.actions.toMenu();
          if (VB.CareerUI && VB.CareerUI.debugTrial) { try { VB.CareerUI.debugTrial({ hall: th, shirt: tsh }); } catch (e) { reportError('CareerUI.debugTrial', e); } }
          return;
        }
        forceVenue(th ? 'hall' : 'beach');
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, difficulty: diff, sets: 1, points: 15, present: true,
          format: th ? '6v6' : undefined, venue: th ? undefined : 'beach', ctrl: th ? 'one' : undefined, ctrlRole: th ? 'OH' : undefined });
        g.career = { _debug: true, trial: true, mode: th ? 'hall' : 'beach', me: th ? 'SUP' : 'TÚ', rival: th ? 'TIT' : 'VAL', meName: th ? 'Suplentes' : 'Tu pareja de prueba',
          rivalName: th ? 'Titulares' : 'Voley Valencia', clubName: 'Voley Valencia', label: 'Partidillo de prueba: Voley Valencia', player: 'Tú', sets: 1, points: 15 };
        dbgKit = { kitShirt: tsh, kitAccent: 0xffffff, kitShorts: 0x14213d, kitPattern: 'liso', kitLibero: th ? 0xffd21a : undefined, scrim: {} };
        if (Q.at === 'rally') {
          var trn = Q.n ? Math.max(1, +Q.n | 0) : 3, trc = 0;
          keep = advanceUntil(g, function (e) { return e && e.type === 'hit' && e.team === 0 && e.touch === 2 && ++trc >= trn; }, Q.t ? +Q.t : 0.35, 900);
          break;
        }
        keep = advanceUntil(g, function (e) { return e && e.type === 'gameOver'; }, 0, 3000, uiIngest); state = 'over';
        // (objetivos como los de VB.Career.trialGoals: [stat, texto, cantidad, operador])
        var tf = Q.fail === '1', tg = th ? [['kills', '2 remates ganados', 2, '>='], ['recvP', '2 recepciones perfectas', 2, '>='], ['errors', 'Como mucho 2 errores', 2, '<=']]
          : [['kills', '2 remates ganados', 2, '>='], ['blocks', '1 bloqueo punto', 1, '>='], ['errors', 'Como mucho 2 errores', 2, '<=']];
        var tv = tf ? [1, 0, 3] : [4, 1, 1];
        // (rt: «Lo mejor / A mejorar» de la nota en directo, de muestra; &tf=2 la prueba suspendida por dejarla a medias)
        trialDbg = { trial: true, letter: tf ? 'D' : 'B', nota: tf ? 5.3 : 6.9, pass: !tf, luck: false, left: tf ? 3 : 0, clubName: 'Voley Valencia', sim: false, met: tf ? 0 : 3, base: tf ? 5.3 : 6.1,
          goals: tg.map(function (x, j) { return { id: x[0], stat: x[0], txt: x[1], n: x[2], op: x[3], v: tv[j], ok: x[3] === '<=' ? tv[j] <= x[2] : tv[j] >= x[2] }; }),
          rt: tf ? { best: [{ id: 'kill', txt: 'Remate ganado', n: 1, d: 0.08 }], worst: [{ id: 'srvErr', txt: 'Error de saque', n: 2, d: -0.52 }, { id: 'atkErr', txt: 'Remate fuera', n: 1, d: -0.26 }] }
            : { best: [{ id: 'kill', txt: 'Remate ganado', n: 4, d: 0.34 }, { id: 'block', txt: 'Bloqueo punto', n: 1, d: 0.31 }], worst: [{ id: 'srvErr', txt: 'Error de saque', n: 1, d: -0.26 }] } };
        if (Q.tf === '2') trialDbg = { trial: true, forfeit: 'quit', letter: 'F', nota: 5.8, pass: false, luck: false, left: 2, clubName: 'Voley Valencia', sim: false, met: 0,
          goals: tg.map(function (x) { return { id: x[0], stat: x[0], txt: x[1], n: x[2], op: x[3], ok: null }; }) };
        break;
      }
      // Ambiente de Carrera (js/ambiente.js): partido de Carrera de mentira EN VIVO con la IA jugando por ti (no toca ninguna Carrera
      // guardada). &k=choice (la 1ª disputa en contra abre «Protestar / Dejarlo»: VB.ctx.actions.ambChoose('protest'|'drop')),
      // yellow | red (tarjeta forzada en la 1ª disputa; la roja con su punto de castigo de verdad), derby (derbi, calor 0,9), boo (pitada al
      // saque rival), chant (cánticos), lines (una frase en cada punto). &format=6v6 pista (por defecto playa), &away=1 fuera de casa,
      // &final=1 campo neutral, &calm=1 «Tranquilo», &heat=0..1, &level=low|mid|high|top
      case 'amb': {
        var a6 = Q.format === '6v6', ak = Q.k || 'lines';
        forceVenue(a6 ? 'hall' : 'beach');
        var aRef = VB.Career && VB.Career.beach && VB.Career.beach.REF ? Object.assign({}, VB.Career.beach.REF[ak === 'derby' ? 'high' : 'mid']) : undefined;
        if (aRef) aRef.chal = 0;
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, difficulty: diff, present: true, amb: true, ref: aRef,
          format: a6 ? '6v6' : undefined, venue: a6 ? undefined : 'beach', ctrl: a6 ? 'one' : undefined, ctrlRole: a6 ? 'OH' : undefined,
          names: a6 ? [['Ares Belmonte', 'Iker Sanz', 'Noa Vidal', 'Biel Riera', 'Leo Soler', 'Pau Mas'], ['Dani Ferrer', 'Alex Roig', 'Kai Morell', 'Joan Prats', 'Max Serra', 'Nico Pla']] : undefined });
        var aMe = a6 ? (g.ctrl || g.teams[0][0]) : g.teams[0][0];
        g.career = { _debug: true, mode: a6 ? 'hall' : 'beach', season: 2, phase: 'league', week: 4, round: 0, me: 'ROC', rival: 'SOR', meName: 'Rocaverde', rivalName: 'Sorrasal',
          label: (a6 ? 'Liga de pista' : 'Circuito Regional') + ' · Jornada 5', player: a6 && aMe.name ? aMe.name : 'Ares Belmonte', num: aMe.num | 0, mate: 'Iker Sanz', mateNum: g.teams[0][1] ? g.teams[0][1].num | 0 : 2 };
        ambDebugStart(g, a6, ak);
        live = true;
        break;
      }
      // B5: previa congelada a los t s. &kind=mini|short|long (por defecto short), &career=1 (Carrera de prueba; con long, 1ª jornada),
      // &boss=muro|saque|remate|defensa (con career=1: partido de jefe), &duel=1 (duelo con tu rival), &t=s (por defecto 0,6)
      case 'intro':
        g = mk(false, true); break;
      // B6: hoja final como resumen de jornada. Como 'over' y además &career=1 (Carrera de prueba con resumen: nota, XP, tabla, reto,
      // seguidores, entreno; &move=±n tu movimiento en la tabla, &boss=1 jefe tumbado, &chem=1 química que sube, &cup=semi|final copa),
      // &unl=n (n objetos nuevos del Vestuario), &tab=sum|stats (la pestaña abierta)
      case 'recap':
        g = mk(true);
        if (Q.career === '1') g.career = debugCareerCs(g);
        keep = advanceUntil(g, function (e) { return e && e.type === 'gameOver'; }, 0, 3000, uiIngest); state = 'over';
        if (g.career) debugCareerEnd(g);
        break;
      // Estadística del partido (js/matchstats.js): autopilot hasta el final y la pantalla abierta en cuanto se ve la hoja.
      // &format=6v6 (pista 6 contra 6), &map=beach (playa), &points=n, &career=1 (nombres de clubes), &set=n y &team=1 (lo elegido), &sec=fig|mom|rot|map|err|pl (desplazada a esa sección)
      case 'stats': {
        var st6 = Q.format === '6v6';
        if (st6) forceVenue('hall');
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, difficulty: diff, format: st6 ? '6v6' : undefined, venue: st6 ? undefined : venueNow(), points: +Q.points || undefined });
        if (Q.career === '1') g.career = debugCareerCs(g);
        keep = advanceUntil(g, function (e) { return e && e.type === 'gameOver'; }, 0, 5400, uiIngest); state = 'over';
        if (g.career) debugCareerEnd(g);
        call('UI', 'openMatchStats', { set: +Q.set || 0, team: Q.team === '1' ? 1 : 0, sec: Q.sec || '' });
        break;
      }
      // D1: reto del día terminado (autopilot hasta gameOver con g.reto de hoy o de &retodate=AAAAMMDD; Retos.endMatch en seco)
      case 'reto_end': {
        g = mk(true);
        var rdd = null; try { rdd = VB.Retos && VB.Retos.daily ? VB.Retos.daily() : null; } catch (e) { rdd = null; }
        g.reto = rdd ? Object.assign({}, rdd.opts.reto) : { kind: 'day', key: 20261115 };
        g.retoOpts = rdd ? Object.assign({}, rdd.opts) : null;
        keep = advanceUntil(g, function (e) { return e && e.type === 'gameOver'; }, 0, 3000, uiIngest); state = 'over';
        break;
      }
      // D1: el menú en la página Retos (&tab=hoy|maestria; &retodate=AAAAMMDD fija el día)
      case 'retos':
        ctx.actions.toMenu(); call('UI', 'openRetos', Q.tab === 'maestria' ? 'maestria' : Q.tab === 'hoy' ? 'hoy' : ''); return;
      // D2: perfil. menupf = la portada con el chip; prof = la página del perfil (&tab=vestuario|insignias|entreno|carrera|retos|sedes|
      // hitos). &pfseed=demo: perfil y vestuario de prueba en memoria (pfSeedDemo; nada se guarda)
      case 'menupf':
        pfSeedDemo(); ctx.actions.toMenu(); return;
      case 'prof':
        pfSeedDemo(); ctx.actions.toMenu(); call('UI', 'openProfile', { tab: Q.tab || '' }); return;
      // S3-C1: repeticiones. replay = autopilot grabado (como &replay=1) con sets a 11 hasta la 1ª bola de set ganada (&match=1: la de
      // partido) y su repetición, que se ve entera y vuelve al vivo (&rpt=s la congela a los s; &auto=1 no la lanza: la decide
      // Replay.autoReady como en un partido; &seed=, &map=). best = el partido entero grabado hasta la hoja final con la pestaña
      // «Jugadas» (&tab=plays la abre; &play=1 ve todas las jugadas). &career=1: Carrera de prueba (frases con los nombres)
      case 'replay': case 'best': {
        g = Sim.createGame({ demo: false, autopilot: true, seed: sd, difficulty: diff, venue: venueNow(), points: +Q.points || 11, present: true });
        if (Q.career === '1') g.career = debugCareerCs(g);
        var RPd = VB.Replay;
        if (RPd && RPd.reset && RPd.reset(g, { force: true })) rpPre = g; else console.warn('[VB] escena ' + name + ': sin grabador de repeticiones (' + (RPd && RPd._state ? RPd._state().why : 'sin js/replay.js') + ')');
        var rpWant = name === 'best' ? function (e) { return e && e.type === 'gameOver'; } : Q.match === '1' ? function (e) { return e && e.type === 'point' && e.matchWon; } : function (e) { return e && e.type === 'point' && (e.setWon || e.matchWon); };
        var rpEvs = [], rpTrig = -1, rpT = 0, rpExtra = name === 'best' ? 0 : (RPd && RPd.K ? RPd.K.TAIL : 156) * STEP + 0.05;
        for (var ri = 0; ri < 3600 / STEP; ri++) {   // (el bucle de main.js sin pintar: cada paso y sus eventos pasan por el grabador)
          Sim.step(g, STEP, null); if (rpPre === g) RPd.onStep(null, g);
          rpEvs.length = 0; Sim.drainEvents(g, rpEvs);
          if (rpPre === g) RPd.onEvents(g, rpEvs);
          if (rpEvs.length) uiIngest(rpEvs, g);
          for (var rj = 0; rj < rpEvs.length; rj++) { if (rpTrig < 0 && rpWant(rpEvs[rj])) rpTrig = ri; if (rpTrig >= 0) keep.push(rpEvs[rj]); }
          if (rpTrig >= 0) { rpT += STEP; if (rpT >= rpExtra) break; }
        }
        if (rpTrig < 0) console.warn('[VB] escena ' + name + ': no se alcanzó el momento buscado');
        if (name === 'best') state = 'over';
        else keep = keep.filter(function (e) { return e.type !== 'point'; });   // (el punto ya pasó: su cinta no tapa la repetición)
        break;
      }
      case 'doll':   // maqueta del muñeco nuevo (js/doll.js): el pabellón con 4 muñecos y cámara fija; la sim queda congelada en el saque
        g = mk(true, true); break;
      default:
        console.warn('[VB] escena de depuración desconocida:', name); ctx.actions.toMenu(); return;
    }
    // &rt=1: la píldora de la nota en directo con un aviso (ui.js la pinta con g._rtDbg en vez de VB.Career.liveRating)
    if (Q.rt === '1' && g) g._rtDbg = rtDebug(g, keep);
    // las escenas que ya han pasado los eventos por ingest no los vuelven a contar
    setGame(g, dbgKit);
    for (var i = 0; i < keep.length; i++) pendingEvents.push(keep[i]);
    if (state === 'paused') { setState('playing'); setState('paused'); } else setState(state);
    if (trialDbg) { careerEnd = trialDbg; endTweaked = false; }   // (la pinta el frame tras la hoja de ui.js: careerTrialSheet o VB.UI.endCareer)
    ctx.frozen = !live && name !== 'serve' && name !== 'hud' && name !== 'pause' && name !== 'replay' && !(name === 'best' && Q.play === '1');
    if (name === 'replay' && Q.auto !== '1') call('Replay', 'start', 'auto');
    bestPend = name === 'best' && Q.play === '1';
    call('CameraRig', 'snap', g);
    if (name === 'subs6menu') call('UI', 'openSubs', Q.pick === '1');
    if (name === 'doll') { dollOn = true; call('Doll', 'start', ctx, g); }
    debugAnimHooks(g);   // &boss= / &mate= (C2/C3, players)
    if (name === 'intro') debugIntro(g);
    console.info('[VB] escena de depuración: ' + name + ' (modo ' + g.mode + ', ' + g.score.join('-') + ', sets ' + g.sets.join('-') + ')');
  }

  /** Carrera de prueba (escenas recap/intro): playa, liga, jornada 5 de 14 (con &cup=semi|final, el Open). */
  function debugCareerCs(g) {
    var cup = Q.cup === 'semi' || Q.cup === 'final' ? Q.cup : '';
    var cs = { _debug: true, season: 2, phase: cup ? 'cup' : 'league', week: 4, round: cup === 'final' ? 1 : 0,
      label: cup ? 'Open Regional · ' + (cup === 'final' ? 'Final' : 'Semifinal') : 'Circuito Regional · Jornada 5 de 14', me: 'ROC', rival: 'SOL',
      meName: 'Club Platja Rocaverde', rivalName: 'Voley Sóller', player: 'Ares Belmonte', num: 1, mate: 'Iker Sanz', mateNum: 2, goal: 'Gana un set a cero',
      pos0: 3 + (+Q.move | 0), rivalPos: 5, posN: 10, first: false, league: 'Circuito Regional' };
    if (Q.boss === '1') cs.boss = { name: 'Bruno Ferrer', nick: 'el Muro', style: 'muro', styleName: 'Muro', hint: '', w: 1, l: 2 };
    return cs;
  }
  /** Resumen de jornada de prueba para la escena recap (main.js lo pasa a VB.UI.endCareer en el frame, como el de matchDone). */
  function debugCareerEnd(g) {
    var cs = g.career, win = g.sets[0] > g.sets[1], ids = ['PUE', 'VAL', 'ROC', 'GAN', 'PAL', 'MAR', 'CAL', 'FAR', 'BRI', 'ONA'], tbl = [], sh = {};
    for (var i = 0; i < ids.length; i++) { tbl.push({ id: i, pts: 30 - i * 3 - (i > 2 ? 1 : 0) }); sh[i] = ids[i]; }
    var life = { ch: { ok: win, txt: cs.goal, prog: win ? '1/1' : '0/1' }, fans: win ? 1200 : 300, ach: [] };
    if (Q.chem === '1') life.chemUp = { lv: 2, name: 'Compenetrados' };
    if (cs.boss) life.boss = { name: cs.boss.name, nick: cs.boss.nick, style: 'muro', styleName: 'Muro', win: win, w: 2, l: 2, h2h: [4, 2, 2], first: win };
    careerEnd = { phase: cs.phase, label: cs.phase === 'cup' ? (cs.round ? 'Final del Open' : 'Semifinal del Open') : 'Jornada 5', stage: cs.phase === 'cup' ? (cs.round ? 'final' : 'semi') : undefined, win: win, nota: 7.8, xp: 184, lvlUp: true, lvl: 7, ptsGained: 3,
      badges: [], train: { gains: ['recv'] }, life: life, review: false };
    careerEndXv = { tbl: tbl, myId: 2, short: sh, pos: 3, next: cs.phase === 'cup' ? (cs.round ? 'off' : 'final') : 'league', bar: { cur: 90, need: 182 }, ses: { used: 2, max: 3 } };
    endTweaked = false;
  }
  /** ?debug=intro: la previa de B5 con el plan del tipo pedido, congelada a los &t= s (el tiempo de la previa no corre: ctx.frozen). */
  function debugIntro(g) {
    var kind = Q.kind === 'mini' || Q.kind === 'long' ? Q.kind : 'short';
    if (Q.career === '1') {
      var wk = kind === 'long' && !Q.boss && Q.duel !== '1' ? 0 : 4;
      g.career = { _debug: true, season: 2, phase: 'league', week: wk, round: 0, label: 'Circuito Regional · Jornada ' + (wk + 1) + ' de 14', me: 'ROC', rival: 'SOL',
        meName: 'Club Platja Rocaverde', rivalName: 'Voley Sóller', player: 'Ares Belmonte', num: 7, mate: 'Iker Sanz', mateNum: 4, goal: 'Gana un set a cero',
        pos0: wk ? 3 : 0, rivalPos: wk ? 5 : 0, posN: 10, h2h: wk ? [3, 2, 1, 4, 3, 1] : null, league: 'Circuito Regional', first: wk === 0 };
      if (Q.duel === '1') { g.career.duel = true; g.career.rivalInfo = { name: 'Dani Roca', w: 2, l: 3 }; }
      // ambiente de Carrera: &derby=1 (derbi de ciudad en pista: «DERBI», career.js ambCtx), &revancha=1, &cumbre=1
      if (Q.derby === '1' || Q.revancha === '1' || Q.cumbre === '1') {
        if (Q.derby === '1') g.career.mode = 'hall';
        g.career.amb = { home: 0, heat: 0.8, fans: [0.55, 0.15], tags: [Q.derby === '1' ? 'derbi' : Q.revancha === '1' ? 'revancha' : 'cumbre'], level: 'mid', city: 'Rocaverde', venue: 'Rocaverde', short: ['Rocaverde', 'Sóller'], capt: [0, 0], coach: ['', ''], riv: 0.4 };
      }
      if (Q.boss) {
        var BS = VB.CareerLife && VB.CareerLife.BOSS_STYLES && VB.CareerLife.BOSS_STYLES[Q.boss];
        g.career.boss = { name: 'Bruno Ferrer', nick: BS && BS.nicks ? BS.nicks[0] : 'Muro', style: String(Q.boss), styleName: BS ? BS.name : 'Muro',
          hint: BS && BS.hint ? BS.hint : 'Bloquea fuerte por su lado: ataca por el otro.', w: 1, l: 2, first: false };
      }
    }
    introStart({ introKind: kind });
    var t = Q.t ? Math.max(0, +Q.t) : 0.6;
    intro.left = Math.max(0.05, intro.left - t); ctx.introLeft = intro.left;
    ctx.frozen = true;
  }
  /** ?debug=look: parámetros de la URL para VB.UI.openLook({tab, venue, item, pick}); lo que falta lo decide ui.js. */
  function lookDebugOpts() {
    var o = {};
    if (Q.tab) o.tab = String(Q.tab).toLowerCase();
    if (Q.venue) { var v = String(Q.venue).toLowerCase(); o.venue = v === 'beach' || v === 'playa' ? 'beach' : v === 'hall' || v === 'pista' ? 'hall' : undefined; if (!o.venue) delete o.venue; }
    if (Q.item && /^[a-z][a-zA-Z0-9]{1,15}$/.test(Q.item)) o.item = Q.item;
    if (Q.pick) { var pk = String(Q.pick).toLowerCase(); o.pick = pk === 'career' || pk === 'carrera' ? 'career' : (+pk === 2 ? 2 : 1); }
    return o;
  }
  /** D2 (&pfseed=demo, solo con debug): perfil de prueba EN MEMORIA para las capturas. Tapa en localStorage las claves del perfil,
   *  del vestuario y del contador del aparato (lo que se escriba ahí se queda en esta página): nada se guarda de verdad. */
  var pfSeeded = false;
  function pfSeedDemo() {
    if (!ctx.debug || Q.pfseed !== 'demo' || pfSeeded) return;
    pfSeeded = true;
    var day = Math.floor(Date.now() / 864e5), ach = {}, ven = {}, bd = {}, i;
    var AI = (VB.CareerLife && VB.CareerLife.ACH_INFO) || [], VV = Object.keys(VB.VENUES || {}), BL = (VB.Badges && VB.Badges.LIST) || [];
    for (i = 0; i < AI.length; i += 4) ach[AI[i].id] = day - 40 + i;
    for (i = 0; i < Math.min(4, VV.length); i++) ven[VV[i]] = day - 60 + i * 9;
    for (i = 0; i < BL.length; i++) if (i % 3 !== 2) bd[BL[i].id] = 1 + (i % 4 === 0 ? 2 : i % 4 === 1 ? 1 : 0);
    var o = { v: 1, base: { xp: 900, m: 212, w: 131 }, dev: {}, px: 0, ven: ven, ach: ach, hit: { debut: day - 60, m25: day - 50, m100: day - 20, w10: day - 45, w100: day - 5, gira: day - 30, bd1: day - 55 },
      bd: bd, car: {}, ann: 1, pin: [], pt: 0, seen: {} };
    var mem = { 'make-the-cut.profile': JSON.stringify(o), 'make-the-cut.look': null, 'make-the-cut.devid': 'demo1' };
    try {
      var SP = Storage.prototype, gi = SP.getItem, si = SP.setItem, ri = SP.removeItem, LS = window.localStorage;
      SP.getItem = function (k) { return this === LS && Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : gi.apply(this, arguments); };
      SP.setItem = function (k, v) { if (this === LS && Object.prototype.hasOwnProperty.call(mem, k)) { mem[k] = String(v); return; } return si.apply(this, arguments); };
      SP.removeItem = function (k) { if (this === LS && Object.prototype.hasOwnProperty.call(mem, k)) { mem[k] = null; return; } return ri.apply(this, arguments); };
    } catch (e) { reportError('pfSeedDemo', e); return; }
    if (VB.Profile && VB.Profile._reload) try { VB.Profile._reload(); } catch (e) { reportError('Profile._reload', e); }
    call('UI', 'refreshMenu');
  }
  function openLookDebug() {
    var U = VB.UI;
    if (!U || typeof U.openLook !== 'function') { console.warn('[VB] escena look: VB.UI.openLook no existe'); return; }
    try { U.openLook(lookDebugOpts()); } catch (e) { reportError('UI.openLook', e); }
  }

  // ---------- Precalentado de GPU ----------
  // Compila todos los programas y sube todas las texturas ANTES de que se vean, para que el primer remate,
  // la primera onda o el primer confeti no paren el juego 50-150 ms. Con render=true (solo tras el telón de
  // carga) también pinta un frame con los objetos ocultos visibles (pools de FX, confeti, etc.): así se
  // compilan los programas de sombra y de post-proceso que compile() no cubre. Después los vuelve a ocultar.
  function prewarm(mode) {
    var render = mode === 'r', compile = mode === 'r' || mode === 'c';
    var r = ctx.renderer, sc = ctx.scene; if (!r || !sc || glLost) return;
    var t0 = performance.now(), hid = [], tex = [], seen = typeof Set === 'function' ? new Set() : null;
    function addTex(t) { if (t && t.isTexture && !t.isRenderTargetTexture && t.image && seen && !seen.has(t)) { seen.add(t); tex.push(t); } }
    function scanMat(m) {
      for (var k in m) { var v = m[k]; if (v && v.isTexture) addTex(v); }
      var u = m.uniforms; if (u) for (var n in u) { var x = u[n] && u[n].value; if (x && x.isTexture) addTex(x); }
    }
    try {
      sc.traverse(function (o) {
        if (render && !o.visible) { hid.push(o); o.visible = true; }
        var m = o.material; if (!m) return;
        if (Array.isArray(m)) { for (var i = 0; i < m.length; i++) scanMat(m[i]); } else scanMat(m);
      });
      for (var j = 0; j < tex.length; j++) { try { r.initTexture(tex[j]); } catch (e) { } }
      if (compile) r.compile(sc, ctx.camera);
      if (render) { r.info.reset(); if (ctx.renderFn) ctx.renderFn(ctx); else r.render(sc, ctx.camera); }
    } catch (e) { reportError('prewarm', e); }
    for (var h = 0; h < hid.length; h++) hid[h].visible = false;
    ctx.prewarmMs = Math.round(performance.now() - t0);
    if (ctx.debug) console.info('[VB] precalentado: ' + (r.info.programs ? r.info.programs.length : '?') + ' programas, ' + tex.length + ' texturas, ' + Math.round(performance.now() - t0) + ' ms');
  }
  ctx.prewarm = prewarm;

  // ---------- Precompilado de programas ASÍNCRONO (UI-01) ----------
  // El primer remate/onda/confeti estrenaba programas en pleno peloteo (medido con progs.js: 5 programas tras empezar, uno de
  // 168 ms). Se compilan antes: escena + VB.Arena.prewarmList() (copias de TODO arena y de los pools de fx.js que comparten
  // geometría y material) dentro de ctx.scene (mismas luces, niebla y entorno = mismas claves de programa) y con el destino de
  // render real (con el post de arena activo, los programas son otra variante).
  // three r149 hace compile() BLOQUEANTE: tras enlazar cada programa pide sus uniformes (getUniforms → getProgramParameter espera
  // a que el driver acabe; ANGLE/D3D11 ~100 ms por programa: 3,2 s al arrancar). Con KHR_parallel_shader_compile: durante
  // compile() los programas NUEVOS devuelven uniformes vacíos (no bloquea; el driver compila en paralelo), luego se devuelve su
  // getUniforms real y se borra currentProgram de los materiales afectados (el siguiente render rehace su lista de uniformes con
  // el programa ya enlazado, sin esperar). El estado se sondea con COMPLETION_STATUS_KHR, que no bloquea.
  // Sin la extensión: VB.Arena.prewarmCompile() (bloqueante, 0,3-0,6 s), bajo el telón y al empezar partido.
  var progWarm = { pending: null, t0: 0, ext: null, n: 0, waitMs: 0, issueMs: 0, gate: false, drawMs: 0 }, needWarmDraw = false;
  var DUMMY_UNIFORMS = { seq: [], map: {}, setValue: function () { } };
  function prewarmPrograms(gate) {
    var r = ctx.renderer, sc = ctx.scene; if (!r || !sc || glLost || Q.prewarm === '0') return;
    var t0 = performance.now(), gl = r.getContext(), ext = null;
    try { ext = gl.getExtension('KHR_parallel_shader_compile'); } catch (e) { }
    if (!ext || Q.prewarm === 'sync') {
      if (VB.Arena && VB.Arena.prewarmCompile) { try { ctx.prewarmMs = VB.Arena.prewarmCompile(); } catch (e) { reportError('prewarmCompile', e); } }
      return;
    }
    var list = [], grp = new THREE.Group();
    try { if (VB.Arena && VB.Arena.prewarmList) list = VB.Arena.prewarmList() || []; } catch (e) { reportError('prewarmList', e); }
    grp.name = 'prewarm';
    for (var i = 0; i < list.length; i++) grp.add(list[i]);
    var pend = [];
    try {
      sc.add(grp); grp.updateMatrixWorld(true);
      var rt = null;
      if (VB.Arena) {
        if (VB.Arena.prewarmTarget) rt = VB.Arena.prewarmTarget();
        else if (VB.Arena.postActive && VB.Arena.postActive() && VB.Arena._dbg) { var dd = VB.Arena._dbg(); rt = dd && dd.post && dd.post.rt || null; }
      }
      pend = asyncCompile(sc, ctx.camera, rt, true);
    } catch (e) { reportError('prewarmPrograms', e); }
    sc.remove(grp);
    progWarm.ext = ext; progWarm.pending = pend.length ? pend : null; progWarm.t0 = performance.now(); progWarm.n = pend.length;
    progWarm.gate = !!gate && pend.length > 0; progWarm.issueMs = Math.round(performance.now() - t0); progWarm.total = r.info.programs.length;
    ctx.prewarmMs = (ctx.prewarmMs || 0) + progWarm.issueMs;
    if (ctx.debug) console.info('[VB] precompilado asíncrono: ' + pend.length + ' programas nuevos, ' + list.length + ' copias, ' + progWarm.issueMs + ' ms en el hilo');
  }
  /** Compila en paralelo (KHR_parallel_shader_compile ya pedida) los programas de `sc` vistos por `cam` con el destino `rt` (null =
   *  pantalla) y, con `extra`, lo que compile() no ve (extraCompile). Devuelve los programas pendientes (progWarm.pending). Lo usan el
   *  precompilado del arranque y del partido (prewarmPrograms) y el de los retratos (prewarmPortrait, con la escena propia del retrato). */
  function asyncCompile(sc, cam, rt, extra) {
    var r = ctx.renderer, progs = r.info.programs, push = progs.push, wrapped = [], prevRT = r.getRenderTarget();
    try {
      if (rt) r.setRenderTarget(rt); else if (prevRT) r.setRenderTarget(null);
      // programas nuevos: uniformes vacíos mientras dura compile() (no espera al enlace)
      progs.push = function (p) { if (p && p.getUniforms) { wrapped.push(p, p.getUniforms); p.getUniforms = function () { return DUMMY_UNIFORMS; }; } return push.apply(progs, arguments); };
      // en depuración three comprueba cada programa al crearlo (getProgramInfoLog espera al driver): se comprueba al acabar
      var chk = r.debug.checkShaderErrors; r.debug.checkShaderErrors = false;
      try {
        r.compile(sc, cam);
        if (extra) extraCompile(r, sc);
      } finally { r.debug.checkShaderErrors = chk; }
    } catch (e) { reportError('asyncCompile', e); }
    delete progs.push; if (progs.push !== push) progs.push = push;
    r.setRenderTarget(prevRT);
    var pend = [];
    if (wrapped.length) {
      var set = typeof Set === 'function' ? new Set() : null;
      for (var w = 0; w < wrapped.length; w += 2) { wrapped[w].getUniforms = wrapped[w + 1]; pend.push(wrapped[w]); if (set) set.add(wrapped[w]); }
      // los materiales que se quedaron con la lista de uniformes vacía la rehacen en su próximo render. __version = -1 obliga a
      // setProgram (r149) a pasar por getProgram: sin eso, si la versión del material no cambió, usaba el currentProgram
      // indefinido y el render reventaba en cada frame («reading 'getUniforms'») tras cambiar la calidad
      var fix = function (m) { if (!m) return; var pr = r.properties.get(m); if (pr && pr.currentProgram && set && set.has(pr.currentProgram)) { pr.currentProgram = undefined; pr.uniformsList = null; pr.__version = -1; } };
      var fixObj = function (o) { var m = o.material; if (!m) return; if (Array.isArray(m)) { for (var k = 0; k < m.length; k++) fix(m[k]); } else fix(m); };
      sc.traverse(fixObj);
      // (los materiales de la escena del juego también: el retrato comparte materiales del muñeco con los atletas)
      if (sc !== ctx.scene && ctx.scene) ctx.scene.traverse(fixObj);
    }
    return pend;
  }
  // Lo que compile() no ve: los materiales de profundidad de las sombras (se pintan con una escena vacía: sin niebla ni luces)
  // y las pasadas del post-proceso de arena (cuadro a pantalla completa: brillo/desenfoque/copia al destino lineal y la mezcla
  // final a pantalla). Sin esto, el primer render los estrenaba de golpe (~0,6 s parado tras el telón).
  var _warmGeo = null, _warmDepth = null;
  function extraCompile(r, sc) {
    var THREE_ = THREE, tmp = new THREE_.Scene(), seen = {};
    if (!_warmGeo) _warmGeo = new THREE_.PlaneGeometry(1, 1);
    if (!_warmDepth) _warmDepth = new THREE_.MeshDepthMaterial({ depthPacking: THREE_.RGBADepthPacking });
    if (ctx.quality && ctx.quality.shadows) {
      var SIDE = [THREE_.BackSide, THREE_.FrontSide, THREE_.DoubleSide]; // three: lado de la sombra = el contrario del material
      sc.traverse(function (o) {
        if (!o.isMesh || !o.castShadow || !o.material) return;
        var ms = Array.isArray(o.material) ? o.material : null;
        if (ms) { for (var mi = 0; mi < ms.length; mi++) addCaster(o, ms[mi]); } else addCaster(o, o.material);
      });
      function addCaster(o, m) {
        var side = m.shadowSide != null ? m.shadowSide : SIDE[m.side | 0], cut = !!(m.map && m.alphaTest > 0) || !!(m.alphaMap && m.alphaTest > 0);
        var base = o.customDepthMaterial || _warmDepth;
        var k = (o.isSkinnedMesh ? 'S' + o.skeleton.bones.length : o.isInstancedMesh ? 'I' + (o.instanceColor ? 'c' : '') : 'M') + base.id + '|' + side + '|' + (cut ? 1 : 0); if (seen[k]) return; seen[k] = 1;
        var dm = base.clone(); dm.side = side;
        if (cut) { dm.map = m.map; dm.alphaMap = m.alphaMap; dm.alphaTest = m.alphaTest; }
        var px;
        if (o.isSkinnedMesh) { px = new THREE_.SkinnedMesh(o.geometry, dm); px.bind(o.skeleton, o.bindMatrix); }
        else if (o.isInstancedMesh) { px = new THREE_.InstancedMesh(o.geometry, dm, 1); if (o.instanceColor) px.instanceColor = o.instanceColor; }
        else px = new THREE_.Mesh(_warmGeo, dm);
        px.frustumCulled = false; tmp.children.push(px);
      }
      // la pasada de sombras se pinta con el estado de luces de la escena: mismas luces (sin re-emparentarlas) = misma clave
      if (tmp.children.length) { sc.traverseVisible(function (o) { if (o.isLight) tmp.children.push(o); }); r.compile(tmp, ctx.camera); }
      tmp.children.length = 0;
    }
    // pasadas del post-proceso (VB.Arena.prewarmPasses() → [{material, target}] si existe; si no, las de _dbg().post)
    var passes = null;
    try {
      if (VB.Arena && VB.Arena.prewarmPasses) passes = VB.Arena.prewarmPasses();
      else if (VB.Arena && VB.Arena.postActive && VB.Arena.postActive() && VB.Arena._dbg) {
        var P = VB.Arena._dbg().post;
        if (P && P.bright) passes = [{ material: P.bright, target: P.a1 }, { material: P.blur, target: P.b1 }, { material: P.copy, target: P.a2 }, { material: P.comp, target: null }];
      }
    } catch (e) { passes = null; }
    if (passes && passes.length) {
      var q = new THREE_.Mesh(_warmGeo, passes[0].material), prev = r.getRenderTarget();
      q.frustumCulled = false; tmp.children.push(q);
      for (var i = 0; i < passes.length; i++) { if (!passes[i] || !passes[i].material) continue; q.material = passes[i].material; r.setRenderTarget(passes[i].target || null); r.compile(tmp, ctx.camera); }
      r.setRenderTarget(prev); tmp.children.length = 0;
    }
  }
  /** ¿Siguen compilándose programas del precalentado? (no bloquea; tope de 8 s). */
  function progsPending() {
    var P = progWarm.pending; if (!P) return false;
    var gl = ctx.renderer.getContext(), CS = progWarm.ext.COMPLETION_STATUS_KHR, left = 0;
    for (var i = 0; i < P.length; i++) { var p = P[i]; if (p && p.program && !gl.getProgramParameter(p.program, CS)) { left++; break; } }
    if (!left || performance.now() - progWarm.t0 > 8000) {
      progWarm.waitMs = Math.round(performance.now() - progWarm.t0); progWarm.pending = null; progWarm.gate = false;
      if (ctx.renderer.debug.checkShaderErrors) { // depuración: errores de enlace como los daría three (ya no bloquea: están listos)
        for (var j = 0; j < P.length; j++) {
          var q = P[j]; if (!q || !q.program || gl.getProgramParameter(q.program, 35714)) continue;
          console.error('THREE.WebGLProgram: Shader Error - ' + (q.name || '') + ' (precompilado) ' + gl.getProgramInfoLog(q.program));
        }
      }
      if (ctx.debug) console.info('[VB] precompilado listo: ' + progWarm.n + ' programas en ' + progWarm.waitMs + ' ms (en paralelo)');
      return false;
    }
    return true;
  }
  ctx.prewarmInfo = function () { return { n: progWarm.n, total: progWarm.total, issueMs: progWarm.issueMs, waitMs: progWarm.waitMs, pending: !!progWarm.pending, drawMs: progWarm.drawMs || 0 }; };

  // ---------- Primer dibujo de todo, bajo el telón (UI-01) ----------
  // Programas enlazados no bastan: ANGLE (D3D11) compila en el primer DIBUJO de cada programa la variante del shader para su
  // formato de vértices (trazas: pares de tareas de compilación de ~3 ms y frames de 40-55 ms al empezar el partido, cuando la
  // cámara de juego mira por primera vez la grada del fondo, la silla del árbitro, el marcador…). Con los programas ya listos,
  // un único render con TODO visible y sin recorte por cámara cuesta poco y se hace bajo el telón, antes del primer frame real.
  function warmDraw() {
    var r = ctx.renderer, sc = ctx.scene; if (!r || !sc || glLost || Q.prewarm === '0') return;
    var t0 = performance.now(), vis = [], cull = [], list = [], grp = null;
    try {
      try { if (VB.Arena && VB.Arena.prewarmList) list = VB.Arena.prewarmList() || []; } catch (e) { list = []; }
      if (list.length) { grp = new THREE.Group(); for (var i = 0; i < list.length; i++) grp.add(list[i]); sc.add(grp); grp.updateMatrixWorld(true); }
      sc.traverse(function (o) {
        if (!o.visible) { vis.push(o); o.visible = true; }
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { if (o.frustumCulled) { cull.push(o); o.frustumCulled = false; } }
      });
      r.info.reset();
      if (ctx.renderFn) ctx.renderFn(ctx); else r.render(sc, ctx.camera);
    } catch (e) { reportError('warmDraw', e); }
    for (var a = 0; a < vis.length; a++) vis[a].visible = false;
    for (var b = 0; b < cull.length; b++) cull[b].frustumCulled = true;
    if (grp) sc.remove(grp);
    progWarm.drawMs = Math.round(performance.now() - t0);
    ctx.prewarmMs = (ctx.prewarmMs || 0) + progWarm.drawMs;
    if (ctx.debug) console.info('[VB] primer dibujo de todo: ' + vis.length + ' ocultos, ' + cull.length + ' sin recorte, ' + list.length + ' copias, ' + progWarm.drawMs + ' ms');
  }

  // ---------- Arranque ----------
  function boot() {
    // UI-23: el documento está en castellano (lectores de pantalla, separación de sílabas, traducción automática). index.html no
    // lleva <html> (Artifact): se pone aquí, lo primero
    try { document.documentElement.lang = 'es'; } catch (e) { }
    if (!THREE) { showFatal('No se ha podido cargar el motor 3D. Revisa la conexión y vuelve a abrir el juego.'); return; }
    if (!Sim) { showFatal('No se ha podido cargar la simulación del juego.'); return; }
    var bi = ctx.bootInfo = { t0: Math.round(performance.now()), version: VB.VERSION || '' }, tb = performance.now();
    if (VB.VERSION) console.info('[VB] Make the Cut v' + VB.VERSION);
    try { initRenderer(); }
    catch (e) { console.error(e); showFatal('Tu navegador no permite WebGL. Prueba con otro navegador o activa la aceleración por hardware.'); return; }
    bi.renderer = Math.round(performance.now() - tb);
    // UI-07: con el contexto WebGL ya creado (lo crea el hilo principal de la GPU), ui.js monta bajo el telón el primer paso
    // del ensayo de estilos del HUD y se deja UN frame para que llegue al compositor: la GPU lo rasteriza mientras el hilo
    // principal construye el pabellón (CPU pura, ~0,35 s), en vez de después. El ensayo y el contexto WebGL comparten el hilo
    // principal de la GPU: montarlo antes de crear el contexto solo retrasaba la creación (medido). &preboot=0 lo desactiva.
    if (!ctx.debug && Q.preboot !== '0' && bootEl && !bootEl.hidden && VB.UI && VB.UI.preboot) {
      var pre = false; try { pre = VB.UI.preboot(ctx) !== false; } catch (e) { reportError('UI.preboot', e); }
      if (pre) { requestAnimationFrame(function () { setTimeout(function () { bi.yield = Math.round(performance.now() - bi.t0 - bi.renderer); bootRest(); }, 0); }); return; }
    }
    bootRest();
  }
  function bootRest() {
    var bi = ctx.bootInfo, tb = performance.now();
    for (var i = 0; i < MODS.length; i++) { call(MODS[i], 'init', ctx); var tn = performance.now(); bi[MODS[i]] = Math.round(tn - tb); tb = tn; }
    applyQuality(ctx.quality);
    bi.quality = Math.round(performance.now() - tb);
    call('Audio', 'setMuted', !!ctx.settings.muted);
    for (var j = 0; j < MODS.length; j++) call(MODS[j], 'onSettings', ctx.settings, null);
    if (fpsEl && ctx.settings.showFps) fpsEl.hidden = false;
    // primer gesto del usuario: desbloquea el audio
    var unlock = function () { call('Audio', 'unlock'); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', function () { sizeDirty = true; });
    try { if (window.ResizeObserver) new ResizeObserver(function () { sizeDirty = true; }).observe(ctx.container); } catch (e) { }
    // (online: no hay pausa; la pestaña oculta pasa tu jugador a la IA y la sesión sigue con su temporizador: netAway)
    document.addEventListener('visibilitychange', function () { if (net) netAway(document.hidden); else if (document.hidden && ctx.state === 'playing' && !ctx.debug) ctx.actions.pause(); last = 0; });
    window.addEventListener('blur', function () { if (ctx.state === 'playing' && !ctx.debug && !net) ctx.actions.pause(); });
    // récord online: un partido que quedó a medias al cerrar la pestaña cuenta como abandono (VB.NetRec.boot)
    if (VB.NetRec && !ctx.debug) { try { VB.NetRec.boot(); } catch (e) { reportError('NetRec.boot', e); } }
    if (ctx.debug) debugScene(ctx.debug); else ctx.actions.toMenu();
    // E6: &drill=<id> empieza ese ejercicio (&gymauto=1: la IA juega por ti; lo usa tools/gymtest.js); sin autopilot espera al telón
    if (!ctx.debug && drillId(Q.drill)) ctx.actions.startMatch({ drill: Q.drill, autopilot: Q.gymauto === '1' });
    if (Q.prewarm !== '0') prewarm(Q.prewarm === 'c' || Q.prewarm === 'r' ? Q.prewarm : 't'); // tras el telón de carga (en depuración, el primer frame lo tapa)
    // programas: en paralelo bajo el telón; no se pinta hasta que estén (el hilo queda libre: telón, fuentes y audio siguen)
    if (Q.prewarm !== '0' && Q.prewarm !== 'c' && Q.prewarm !== 'r') { prewarmPrograms(true); needWarmDraw = Q.warmdraw !== '0'; }
    aq.boot = performance.now();
    aq.warmUntil = aq.boot + (Q.aqwarm != null ? +Q.aqwarm * 1000 : 8000); // calentamiento sin calidad adaptativa
    bi.end = Math.round(performance.now());
    requestAnimationFrame(frame);
  }
  function showFatal(msg, soft) {
    var d = document.getElementById('fatal');
    if (d) { d.innerHTML = '<b>Make the Cut</b><span></span>'; d.lastChild.textContent = msg; d.hidden = false; d.classList.toggle('soft', !!soft); }
    if (bootEl) bootEl.hidden = true;
  }
  VB.boot = boot;
  // UI-07: el arranque (montar el pabellón, el público, las texturas…) ocupa el hilo principal ~0,6 s. El telón ya sale entero en
  // el primer frame (logotipo con la fuente embebida, sin esperar a Google Fonts): se deja pintar ese frame y se arranca.
  (function startBoot() {
    var started = false;
    function go() { if (started) return; started = true; boot(); }
    if (ctx.debug || Q.bootwait === '0' || !document.getElementById('boot')) { go(); return; }
    requestAnimationFrame(function () { setTimeout(go, 0); });
    setTimeout(go, 400);   // pestaña en segundo plano (sin rAF): arranca igual
  })();
})();
