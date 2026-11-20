/* =====================================================================
 * MAKE THE CUT — js/netlobby.js   (owner: net)
 * Modo online, fase 2 (notes/net.md «Fase 2»): la página «Online» del menú (#mpOnline, la monta ui.js) y la conexión entre los dos
 * jugadores. Decisiones de Ferran que se cumplen aquí:
 *   1. Al entrar ves la LISTA de salas abiertas (nombre de quien la creó, formato, sede, partido, Igualado o no, 1/2) y puedes crear
 *      una o entrar en una. También se puede entrar con el código de 6 (y el enlace ?sala=CÓDIGO). Las salas caducan solas.
 *   2. Solo con cuenta: sin sesión, el aviso «Necesitas una cuenta para jugar online» con el botón a Cuenta. Nada de anónimos.
 *   3. Cada jugador lleva SIEMPRE a su n.º 1 con un compañero IA y juega con SUS atributos e insignias de la Carrera (si no hay Carrera,
 *      los de su n.º 1 del escuadrón de Partido rápido; si tampoco, neutros). La sala puede ser «Igualado» (neutros, sin insignias).
 *   6. Del rival solo se ve su NOMBRE (nunca la IP ni el correo), con una flechita encima.
 *   7. Si las reglas de Firestore aún no están desplegadas: «El online aún no está activado en el servidor» (y nada se rompe).
 * Flujo: lista → crear sala (anfitrión) o entrar (invitado) → sala de espera con el nombre del rival → WebRTC (js/netrtc.js) con la
 * señalización en la sala (js/netroom.js) → intercambio «pre» (nombre y atributos del invitado) → ctx.actions.startOnline (main.js).
 * Durante el partido, si la conexión se cae, se renegocia sola sobre la misma sala (gen + 1) sin que la sesión lo note.
 * Pruebas: tools/netdrive.js --rtc (dos páginas del mismo Chrome con el emulador de Firestore: ?netemu=PUERTO&netuid=…; solo desde
 * file:// o localhost) y tools/roomtest.js (salas y reglas).
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var MENU_ON = true;    // entrada «Online» visible en Jugar (publicada en la fase 4; con false solo se ve con ?online=1)
  var Q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { Q[k] = v; }); } catch (e) { }
  var LOCAL = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var EMU = LOCAL && /^\d{2,5}$/.test(Q.netemu || '') ? +Q.netemu : 0;   // pruebas: emulador de Firestore, sin cuenta de verdad
  // capturas (SPLAT, 17-nov-2026): ?olmock=1 (solo file:// o localhost) = sesión y salas de mentira en memoria, sin red ni Firestore
  // (olmock=empty: sin salas; olmock=nortc: navegador sin WebRTC). VB.NetLobby._mock(o) pinta estados sueltos (avisos, conectando…).
  var MOCK = LOCAL && /^(1|empty|nortc)$/.test(Q.olmock || '') ? Q.olmock : '';
  var NICK = 'make-the-cut.nick', PREFS = 'make-the-cut.netroom', HELPK = 'make-the-cut.nethelp2';   // (nethelp2 = '1': ya vio «Cómo funciona»; Online V2 lo vuelve a enseñar por «Conexión»)
  var CONNECT_MS = 30000, OFFER_MS = 10000, OFFER_MAX = 65000, PRE_MS = 12000, LIST_EVERY = 8000, ROOM_POLL = 2000, SIG_POLL = 1000;   // (lecturas de Firestore: ver notes/net.md «Cuotas»)

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  function jls(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function NR() { return VB.NetRoom; }
  function ctx() { return VB.ctx || null; }
  /** Versión de la sala (room.v): PROTO|VB.VERSION|L<lobby>. Online V2: 'L2' = el lobby sabe de conexiones (sala con net, 'pre' con
   *  model). Una sala de un cliente de antes (sin la marca) sale como «Otra versión» y al revés, aunque VB.VERSION no cambie: un 1.8.2
   *  en caché no puede entrar en una sala Fluida creyéndola Precisa. (hay que subir VB.VERSION igualmente al publicar) */
  var LOBBY = 2;
  function ver() { return (VB.Net ? VB.Net.PROTO : 0) + '|' + (VB.VERSION || '') + '|L' + LOBBY; }
  function sound(k) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(k); } catch (e) { } }

  /* ---------------- cuenta y backend ---------------- */
  function b64u(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
  function emuToken(uid) {
    var t = Math.floor(Date.now() / 1000);
    return b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ iss: 'https://securetoken.google.com/demo-mtc', aud: 'demo-mtc', auth_time: t, user_id: uid, sub: uid, iat: t, exp: t + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.';
  }
  function signedIn() { if (EMU || MOCK) return true; var A = VB.Account; return !!(A && A.user && A.user() && A.netAuth); }
  /** Quién hay en la cuenta ('' si nadie): solo se reacciona cuando cambia (entrar, salir, cambiar de cuenta), no en cada sincronización. */
  function accKey() { if (!signedIn()) return ''; var A = VB.Account, i = A && A.netInfo && A.netInfo(); return (i && i.uid) || (A && A.user && A.user()) || '1'; }
  /** Sin WebRTC no se puede jugar ni abrir salas (p. ej. iOS en modo Aislamiento). */
  function noRtc() { if (MOCK) return MOCK === 'nortc'; return !VB.NetRtc || !VB.NetRtc.supported(); }
  var rooms = null, roomsKey = '';
  function api() {
    if (MOCK) return rooms || (rooms = mockApi());
    var key = EMU ? 'emu' : (VB.Account && VB.Account.netInfo && (VB.Account.netInfo() || {}).uid) || '';
    if (rooms && roomsKey === key) return rooms;
    roomsKey = key;
    if (EMU) {
      var uid = String(Q.netuid || 'emu' + Math.floor(Math.random() * 1e6)).replace(/[^\w-]/g, '').slice(0, 40);
      rooms = NR().create({ base: 'http://127.0.0.1:' + EMU + '/v1/projects/demo-mtc/databases/(default)/documents', ver: ver(), auth: function () { return Promise.resolve({ uid: uid, token: emuToken(uid) }); } });
    } else {
      var A = VB.Account;
      rooms = NR().create({ base: String(A.FS_BASE || '').replace(/\/+$/, ''), ver: ver(), auth: function () { return A.netAuth(); } });
    }
    return rooms;
  }

  /** ?olmock: salas en memoria con la misma forma que las de js/netroom.js (nada sale de la página). */
  function mockApi() {
    var me = 'mockMe', mine = null, P = function (v) { return Promise.resolve(v); };
    var mb = maps('beach'), mh = maps('hall');
    var R = MOCK === 'empty' ? [] : [
      { id: 'm1', code: 'K7P2QX', name: 'Lucía Marín', gname: '', venue: 'beach', map: mb[0] || '', bo: 1, pts: 21, even: false, state: 'open', age: 4000 },
      { id: 'm2', code: 'H3M9RT', name: 'Pau Ferrer', gname: '', venue: 'hall', map: mh[1] || mh[0] || '', bo: 3, pts: 25, even: true, state: 'open', age: 9000 },
      { id: 'm3', code: 'W8ZK4N', name: 'Sara Llopis', gname: 'Iker', venue: 'hall', map: mh[0] || '', bo: 1, pts: 15, even: false, state: 'full', age: 12000 },
      { id: 'm4', code: 'T5BQ7J', name: 'Javi Ortega', gname: '', venue: 'beach', map: mb[1] || mb[0] || '', bo: 3, pts: 21, even: false, state: 'open', age: 20000, other: true }
    ];
    var find = function (id) { return id === me ? mine : R.filter(function (r) { return r.id === id; })[0] || null; };
    return {
      uid: function () { return me; }, list: function () { return P(R.slice()); }, sweep: function () { return P(); },
      open: function (o) { mine = { id: me, code: 'Q4WX8M', name: o.name, gname: '', host: me, guest: '', venue: o.venue, map: o.map, bo: o.bo, pts: o.pts, even: o.even, state: 'open', age: 0 }; return P(mine); },
      beat: function (f) { if (mine && f) for (var k in f) mine[k] = f[k]; return P(mine); },
      get: function (id) { return P(find(id)); }, byCode: function (c) { return P(R.filter(function (r) { return r.code === c; })[0] || null); },
      join: function (id) { var r = find(id); if (!r) return Promise.reject({ code: 'gone' }); if (r.state === 'full') return Promise.reject({ code: 'full' }); r.guest = me; r.state = 'full'; r.gname = myName(); return P(r); },
      leave: function () { }, close: function () { mine = null; }, bye: function () { }, delSig: function () { return P(); }, putSig: function () { return P(); },
      getSig: function () { return P(null); }, resume: function () { return P(null); },
      _rival: function (n) { if (mine) { mine.guest = 'mockRival'; mine.gname = n || 'Rival'; mine.state = 'full'; } }
    };
  }

  /* ---------------- nombre visible y atributos ---------------- */
  function careerPlayer() {
    var C = VB.Career; if (!C) return null;
    try { var m = C.mode ? C.mode() : 'beach', E = C[m === 'hall' ? 'hall' : 'beach'], c = E && E.get ? E.get() : null; return c && c.player ? c.player : null; } catch (e) { return null; }
  }
  function defaultName() {
    var p = careerPlayer(), n = p && NR().cleanName(p.name);
    if (n) return n;
    var inf = !EMU && VB.Account && VB.Account.netInfo ? VB.Account.netInfo() : null;
    if (inf && inf.kind === 'user' && NR().cleanName(inf.user)) return NR().cleanName(inf.user);
    var uid = inf ? inf.uid : String(Q.netuid || 'x'), h = 0; for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return 'Jugador ' + (1000 + h % 9000);
  }
  function myName() { if ((EMU || MOCK) && Q.name) return NR().cleanName(Q.name) || 'Jugador'; return NR().cleanName(ls(NICK)) || defaultName(); }
  function sanAttrs(st) {
    if (!st || typeof st !== 'object') return null;
    var K = VB.ATTR_KEYS || ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'], o = {}, any = false;
    K.forEach(function (k) { var v = Math.round(+st[k]); if (isFinite(v)) { o[k] = Math.max(1, Math.min(99, v)); any = true; } });
    return any ? o : null;
  }
  function sanBadges(b) {
    if (!b || typeof b !== 'object') return null;
    var o = {}, n = 0;
    Object.keys(b).slice(0, 16).forEach(function (k) { var v = b[k] | 0; if (/^[a-z]{2,16}$/.test(k) && v >= 1 && v <= 3 && n < 12) { o[k] = v; n++; } });
    return n ? o : null;
  }
  /** Atributos e insignias con los que juegas: tu jugador de la Carrera activa; si no hay, tu n.º 1 del Partido rápido; si no, neutros. */
  function myStats() {
    var p = careerPlayer(), B = VB.Badges;
    if (p && p.st) return { attrs: sanAttrs(p.st), badges: sanBadges(B && B.forPlayer ? safe(function () { return B.forPlayer(p); }) : null), from: 'career' };
    var P = VB.Prog, at = P && P.attrs ? safe(function () { return P.attrs(); }) : null, bd = B && B.forSquad ? safe(function () { return B.forSquad(); }) : null;
    var a0 = at && at[0] && at[0][0], b0 = bd && bd[0] && bd[0][0];
    if (a0) return { attrs: sanAttrs(a0), badges: sanBadges(b0), from: 'squad' };
    return { attrs: null, badges: null, from: 'none' };
  }
  function safe(f) { try { return f(); } catch (e) { return null; } }
  /** Fase 3: lo que el rival ve de tus dos jugadores. fits = tus looks del Vestuario (n.º 1 y n.º 2, los de Partido rápido:
   *  VB.Look.matchLooks) y kit = tu equipación de Ajustes. Solo estética: nada entra en la sim. */
  function myLook() {
    var Lk = VB.Look, st = (ctx() && ctx().settings) || {}, fits = [null, null];
    var m = Lk && Lk.matchLooks ? safe(function () { return Lk.matchLooks({}); }) : null;
    if (Array.isArray(m)) fits = [m[0] || null, m[1] || null];
    return saneLook({ fits: fits, kit: { kitShirt: st.kitShirt, kitAccent: st.kitAccent, kitShorts: st.kitShorts, kitPattern: st.kitPattern } });
  }
  /** Look recibido del rival (o el propio antes de mandarlo), SIEMPRE saneado: fits por VB.Look.sane (8 KB como mucho cada uno),
   *  colores enteros de 24 bits y el diseño con formato. null si no vale. */
  function saneLook(o) {
    if (!o || typeof o !== 'object') return null;
    var Lk = VB.Look, f = Array.isArray(o.fits) ? o.fits : [], out = { fits: [null, null], kit: {} };
    for (var i = 0; i < 2; i++) {
      var x = f[i];
      if (!x || typeof x !== 'object' || !Lk || !Lk.sane) continue;
      var raw = safe(function () { return JSON.stringify(x); });
      if (!raw || raw.length > 8192) continue;
      out.fits[i] = safe(function () { return Lk.sane(JSON.parse(raw), i); }) || null;
    }
    var k = o.kit && typeof o.kit === 'object' ? o.kit : {};
    ['kitShirt', 'kitAccent', 'kitShorts'].forEach(function (n) { var v = k[n]; if (typeof v === 'number' && isFinite(v)) out.kit[n] = (v | 0) & 0xffffff; });
    if (typeof k.kitPattern === 'string' && /^[a-z]{2,12}$/.test(k.kitPattern)) out.kit.kitPattern = k.kitPattern;
    return out;
  }

  /* ---------------- textos de la sala ---------------- */
  function venueName(r) { var n = r.map && VB.Venues && VB.Venues.name ? VB.Venues.name(r.map) : ''; return n || (r.venue === 'beach' ? 'Playa' : 'Pabellón'); }
  function cfgParts(r) {
    var kind = r.venue === 'beach' ? 'Playa' : 'Pabellón', vn = venueName(r);
    return [kind].concat(vn && vn !== kind ? [vn] : [], chips(r, true));
  }
  /** Online V2: conexión de la sala ('fluida' solo si la sala lo dice; sin la clave, Precisa, la de siempre). */
  function roomModel(r) { return r && r.net === 'fluida' ? 'fluida' : 'precisa'; }
  /** Chips del partido (lista, vista previa de «Crear sala» y sala de espera). (fase 6: puntos por set en Pabellón)
   *  Online V2: un tercer chip «Fluida» solo en las salas Fluida (aria: «conexión fluida»). */
  function chips(r, aria) {
    var p = r.pts || 21;
    var out = [r.bo === 3 ? 'Mejor de 3' + (p !== 21 ? ' a ' + p : '') : '1 set a ' + p, r.even ? 'Igualado' : 'Con sus atributos'];
    // (el chip visible va PRIMERO: .fx-chips corta lo que no cabe y en un móvil en vertical el último no se ve; en el aria, al final)
    if (roomModel(r) === 'fluida') { if (aria) out.push('conexión fluida'); else out.unshift('Fluida'); }
    return out;
  }
  function chipsHTML(r) { return chips(r).map(function (t) { return '<i>' + esc(t) + '</i>'; }).join(''); }
  function sep(parts) { return parts.map(esc).join('<i class="ol-sep" aria-hidden="true"></i>'); }

  /* ---------------- estado ---------------- */
  var L = {
    host: null, on: false, view: 'list', rooms: [], listAt: 0, listErr: '', loading: false, edit: '', msg: '', msgBad: false,
    room: null, role: '', rival: '', status: '', fail: '', cfg: null, link: null, gen: 0, conn: null, started: false, pendingCode: ''
  };
  var timers = {};
  function every(k, ms, f) { clearInterval(timers[k]); timers[k] = setInterval(f, ms); }
  function stop(k) { clearInterval(timers[k]); clearTimeout(timers[k]); delete timers[k]; }
  function stopAll(keep) { Object.keys(timers).forEach(function (k) { if (!keep || keep.indexOf(k) < 0) stop(k); }); }

  function prefs() {
    var p = jls(PREFS) || {};
    return { venue: p.venue === 'beach' ? 'beach' : 'hall', mapH: String(p.mapH || ''), mapB: String(p.mapB || ''), bo: +p.bo === 3 ? 3 : 1, even: !!p.even, pts: [11, 15, 21, 25].indexOf(+p.pts) >= 0 ? +p.pts : 21,
      model: p.model === 'fluida' ? 'fluida' : 'precisa' };   // (Online V2: conexión; Precisa si no se eligió nunca)
  }
  function savePrefs(c) { try { ls(PREFS, JSON.stringify(c)); } catch (e) { } }
  function maps(kind) { var V = VB.Venues; var l = V && V.list ? safe(function () { return V.list(kind); }) : null; return Array.isArray(l) && l.length ? l : ['']; }

  /** Salas de otra versión: si alguna es de una versión más nueva que la mía, el aviso de reiniciar (js/update.js). */
  function verNote(rs) {
    var U = VB.Update, nw = false;
    if (!U || !rs) return;
    for (var i = 0; i < rs.length; i++) if (rs[i] && rs[i].other && typeof rs[i].v === 'string' && U.note(rs[i].v.split('|')[1]) > 0) nw = true;
    if (nw) U.show(true);
  }
  function errText(e, what) {
    var c = e && e.code;
    if (c === 'off') return 'El online aún no está activado en el servidor. Vuelve a probar en un rato.';
    if (c === 'auth') return 'Tu sesión ha caducado: vuelve a entrar en tu cuenta.';
    if (c === 'net') return 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
    if (c === 'full') return 'Esa sala ya está llena.';
    if (c === 'gone') return 'Esa sala ya no existe.';
    if (c === 'version') return VB.Update && VB.Update.outdated() ? 'Tienes una versión anterior del juego: reinicia para actualizarlo.' : 'Esa sala es de otra versión del juego: quien la creó tiene que reiniciar el juego.';
    if (c === 'dup') return 'Hay más de una sala con ese código: entra desde la lista o pide el enlace a quien la creó.';
    return what || 'Algo ha fallado. Vuelve a probar.';
  }

  /* ---------------- lista ---------------- */
  function refreshList(manual) {
    if (!L.on || L.view !== 'list' || L.loading) return;
    if (!signedIn()) { setView('noacc'); return; }
    L.loading = true; if (manual) render();
    api().list().then(function (rs) {
      L.loading = false; L.rooms = rs; L.listAt = Date.now(); L.listErr = ''; verNote(rs);
      if (L.view === 'off') setView('list');
      render();
    }, function (e) {
      L.loading = false;
      if (e.code === 'off') { setView('off'); return; }
      if (e.code === 'auth' && !signedIn()) { setView('noacc'); return; }
      L.listErr = errText(e); render();
    });
    if (Math.random() < 0.2) api().sweep().catch(function () { });
  }
  function setView(v) {
    L.view = v; L.edit = ''; L.osk = null;
    stop('list'); stop('retry');
    if (v === 'list') { every('list', LIST_EVERY, function () { if (document.visibilityState !== 'hidden') refreshList(false); }); }
    // (sin servidor: se vuelve a probar solo cada 30 s; el móvil lo dice en la hoja)
    if (v === 'off') every('retry', 30000, function () {
      if (!L.on || L.view !== 'off' || document.visibilityState === 'hidden' || noRtc()) return;
      // (se prueba sin cambiar de vista: si el servidor sigue apagado no pasa nada; el foco no salta cada 30 s)
      api().list().then(function (rs) { if (L.on && L.view === 'off') { L.rooms = rs; L.listAt = Date.now(); L.listErr = ''; setView('list'); } }, function () { });
    });
    render(true);
  }

  /* ---------------- crear sala (anfitrión) ---------------- */
  function createRoom() {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    var c = L.cfg; savePrefs(c);
    var map = c.venue === 'beach' ? c.mapB : c.mapH;
    L.msg = ''; L.busy = true; render();
    api().open({ name: myName(), venue: c.venue, map: map, bo: c.bo, even: c.even, pts: c.venue === 'beach' ? 21 : c.pts, net: c.model === 'fluida' ? 'fluida' : undefined }).then(function (r) {
      L.busy = false;
      if (!r) throw { code: 'error' };
      L.room = r; L.role = 'host'; L.rival = ''; L.fail = ''; L.started = false; L.status = 'wait';
      setView('room');
      every('beat', NR().BEAT_MS, hostBeat);
      every('poll', ROOM_POLL, hostPoll);
    }).catch(function (e) {
      L.busy = false;
      if (e && e.code === 'off') { setView('off'); return; }
      // (Online V2: con las reglas de antes, una sala Fluida da 403 aunque la lista funcione)
      L.msg = e && e.code === 'denied' && c.model === 'fluida' ? 'La conexión Fluida aún no está activada.' : errText(e, 'No se ha podido crear la sala.'); L.msgBad = true; render();
    });
  }
  function hostBeat() {
    api().beat().then(function (r) { if (!r && L.role === 'host') roomGone('Tu sala ha caducado. Crea otra.'); }, function () { });
  }
  function hostPoll() {
    if (L.role !== 'host' || !L.room || L.started) return;
    api().get(L.room.id).then(function (r) {
      if (L.role !== 'host' || L.started) return;
      if (!r) { roomGone('Tu sala se ha cerrado.'); return; }
      L.room = r;
      if (r.guest && r.state === 'full' && (!L.conn || L.conn.guest !== r.guest)) hostConnect(r);
      else if (!r.guest && L.conn) { abortConn(); api().delSig(L.room.id).catch(function () { }); L.rival = ''; L.status = 'wait'; L.fail = (L.fail || ''); render(); }
      else render();
    }, function () { });
  }
  function newLink() {
    if (L.link) { var o = L.link; L.link = null; o.onclose = null; o.close(); }
    var ice = Q.netice === 'none' && LOCAL ? [] : undefined;
    var k = new VB.NetRtc.Link({ iceServers: ice, onstate: onLinkState });
    L.link = k; return k;
  }
  /** Generación de la señalización: siempre creciente, también entre recargas de la página (segundos desde oct-2025, cabe en int32),
   *  para que una oferta o respuesta de una sesión anterior nunca pase por nueva. */
  function nextGen() { L.gen = Math.max(L.gen + 1, Math.floor(Date.now() / 1000) - 1760000000); return L.gen; }
  function abortConn() { stop('connT'); stop('sig'); L.conn = null; if (L.link && !L.started) { var k = L.link; L.link = null; k.onclose = null; k.close(); } }
  function hostConnect(r) {
    abortConn();
    var conn = L.conn = { guest: r.guest, t0: Date.now(), gen: nextGen(), pre: false };
    L.rival = NR().cleanName(r.gname) || 'Rival'; L.status = 'connecting'; L.fail = ''; render();
    sound('click');
    var link = newLink(), id = L.room.id;
    link.offer().then(function (sdp) {
      if (L.conn !== conn) return;
      return api().putSig(id, 'offer', { sdp: sdp, gen: conn.gen, to: conn.guest }).then(function () {
        every('sig', SIG_POLL, function () {
          if (L.conn !== conn || conn.answered) return;
          api().getSig(id, 'answer').then(function (a) {
            if (L.conn !== conn || conn.answered || !a || a.gen !== conn.gen || a.uid !== conn.guest) return;
            conn.answered = true; stop('sig');
            link.accept(a.sdp).catch(function () { connFail(); });
          }, function () { });
        });
      });
    }).catch(function () { if (L.conn === conn) connFail(); });
    timers.connT = setTimeout(function () { if (L.conn === conn && !L.started && (!L.link || L.link.state !== 'open' || !conn.pre)) connFail(); }, CONNECT_MS);
  }
  function connFail(why) {
    var who = L.rival || 'tu rival';
    // (why = 'mismatch': Online V2, el anfitrión juega con otra conexión que la que anuncia la sala; mismo texto que main.js)
    L.fail = why === 'mismatch' ? (L.role === 'host' ? 'La versión del juego de ' + who + ' no usa la conexión de la sala: no hay partido.' : 'La sala no coincide con lo anunciado: no hay partido.')
      : 'No se ha podido conectar directamente con ' + who + ': vuestras redes no lo permiten. Probad otra vez o desde otra red.';
    if (L.role === 'host') {
      abortConn(); L.rival = ''; L.status = 'wait';
      api().beat({ state: 'open', guest: '', gname: '' }).catch(function () { });
      api().delSig(L.room.id).catch(function () { });
    } else {
      abortConn(); var id = L.room && L.room.id; L.role = ''; L.room = null; stopAll();
      if (id) api().leave(id);
      L.msg = L.fail; L.msgBad = true; L.fail = '';
      setView('list'); refreshList(false);
      return;
    }
    render();
  }
  function roomGone(msg) {
    var wasStarted = L.started;
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = '';
    if (wasStarted) return;
    L.msg = msg; L.msgBad = true;
    if (L.on) { setView('list'); refreshList(false); }
  }

  /* ---------------- entrar en una sala (invitado) ---------------- */
  function joinRoom(id) {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    L.msg = ''; L.busy = true; render();
    api().join(id, myName()).then(function (r) {
      L.busy = false;
      L.room = r; L.role = 'guest'; L.rival = NR().cleanName(r.name) || 'Rival'; L.status = 'connecting'; L.fail = ''; L.started = false;
      setView('room'); sound('click');
      L.gotOffer = false;
      guestListen(0);
      every('poll', 3000, guestPoll);
      // Quien creó la sala contesta con una oferta en 2-4 s. Si en OFFER_MS no ha llegado y su sala lleva más de un latido sin
      // renovarse, ya no está (pestaña cerrada sin avisar): «no responde». Si el latido sigue al día (p. ej. su pestaña está en segundo
      // plano y Chrome la frena a 1 temporizador por minuto) se le espera hasta OFFER_MAX. Nunca «vuestras redes» sin haber negociado.
      var tJoin = Date.now();
      timers.offerT = setTimeout(function chk() {
        if (L.role !== 'guest' || L.started || L.gotOffer || !L.room) return;
        if (Date.now() - tJoin > OFFER_MAX) { noHost(); return; }
        api().get(L.room.id).then(function (r2) {
          if (L.role !== 'guest' || L.started || L.gotOffer) return;
          if (r2 && r2.age > NR().BEAT_MS + 10000) noHost(); else timers.offerT = setTimeout(chk, 5000);
        }, function () { timers.offerT = setTimeout(chk, 5000); });
      }, OFFER_MS);
      timers.connT = setTimeout(function () { if (L.role === 'guest' && !L.started && L.gotOffer) connFail(); }, CONNECT_MS + 5000);
    }).catch(function (e) {
      L.busy = false;
      if (e && e.code === 'off') { setView('off'); return; }
      L.msg = errText(e, 'No se ha podido entrar en la sala.'); L.msgBad = true; render(); refreshList(false);
    });
  }
  function joinCode(code) {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    code = NR().normCode(code);
    if (!NR().codeOk(code)) { L.msg = 'El código tiene 6 letras y cifras (sin 0, O, 1, I ni L).'; L.msgBad = true; render(); return; }
    L.busy = true; render();
    api().byCode(code).then(function (r) {
      L.busy = false;
      if (!r) { L.msg = 'No hay ninguna sala abierta con el código ' + code + '.'; L.msgBad = true; render(); return; }
      joinRoom(r.id);
    }, function (e) { L.busy = false; if (e.code === 'off') { setView('off'); return; } L.msg = errText(e); L.msgBad = true; render(); });
  }
  /** Invitado: espera una oferta de generación nueva y contesta (también para reconectar durante el partido). */
  function guestListen(minGen) {
    var id = L.room.id, seen = minGen;
    every('sig', SIG_POLL, function () {
      if (L.role !== 'guest' || !L.room) { stop('sig'); return; }
      // (con la conexión abierta solo se mira si la sesión espera al rival: el anfitrión puede haber renegociado antes de que aquí se note la caída)
      if (L.link && L.link.state === 'open' && !(L.started && netWaiting())) return;
      api().getSig(id, 'offer').then(function (o) {
        if (!o || o.gen <= seen || L.role !== 'guest' || (o.to && o.to !== api().uid())) return;
        seen = o.gen; L.gen = o.gen;
        if (!L.gotOffer && !L.started) { L.gotOffer = true; stop('offerT'); stop('connT'); timers.connT = setTimeout(function () { if (L.role === 'guest' && !L.started) connFail(); }, CONNECT_MS + 5000); }
        var link = L.started && L.link ? L.link : newLink();
        link.answer(o.sdp).then(function (sdp) { return api().putSig(id, 'answer', { sdp: sdp, gen: o.gen }); }).catch(function () { });
      }, function () { });
    });
  }
  function noHost() {
    var id = L.room && L.room.id, who = L.rival || 'Quien creó la sala';
    abortConn(); stopAll(); L.role = ''; L.room = null; L.rival = ''; L.status = '';
    if (id) api().leave(id);
    L.msg = who + ' no responde: parece que ya no está en la sala. Prueba con otra.'; L.msgBad = true;
    if (L.on) { setView('list'); refreshList(false); }
  }
  function netWaiting() { var C = ctx(), r = C && C.net && C.net.r; return !!(r && r.status === 'waiting'); }
  function guestPoll() {
    if (L.role !== 'guest' || !L.room || L.started) return;
    api().get(L.room.id).then(function (r) {
      if (L.role !== 'guest' || L.started) return;
      if (!r || (r.guest && r.guest !== api().uid()) || (!r.guest && r.state === 'open')) roomGone(L.fail || 'Quien creó la sala la ha cerrado.');
      else if (r.age > NR().LIVE_MS) roomGone('La sala se ha cerrado.');
      else { L.room = r; render(); }
    }, function () { });
  }

  /* ---------------- conexión abierta: «pre» y partido ---------------- */
  function onLinkState(s) {
    if (s === 'open') {
      if (!L.started) { L.status = 'linked'; render(); preStart(); }
      else if (L.role === 'host') { stop('relink'); stop('sig'); api().delSig(L.room.id).catch(function () { }); }
    } else if (s === 'down' && L.started) relink();
  }
  function preStart() {
    var link = L.link; if (!link) return;
    var me = myName(), st = myStats();
    if (L.role === 'guest') link.send('ctl', JSON.stringify({ k: 'pre', name: me, st: { attrs: st.attrs, badges: st.badges, aimSet: myAimSet(), jsetAim: myJsetAim() }, look: myLook(), model: roomModel(L.room) }));
    var t0 = Date.now();
    every('pre', 50, function () {
      if (!L.link || L.link !== link) { stop('pre'); return; }
      if (Date.now() - t0 > PRE_MS) { stop('pre'); connFail(); return; }
      var msgs = link.poll(), rest = [];
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i], c = null;
        if (m.ch === 'ctl') { try { c = JSON.parse(m.data); } catch (e) { } }
        if (c && c.k === 'pre') { stop('pre'); rest = rest.concat(msgs.slice(i + 1)); link.q = rest.concat(link.q); begin(c, st); return; }
        rest.push(m);
      }
      link.q = rest.concat(link.q);
    });
  }
  function myAimSet() { var C = ctx(); return !(C && C.settings && C.settings.aimSet === false); }
  /** Salto con impulso (v1.12.0): «Colocación en salto con diana» (Ajustes, Juego), por defecto no. Como aimSet, es un ajuste de cada
   *  jugador (viaja también en «Igualado»); un invitado de antes no lo manda y juega sin ella. */
  function myJsetAim() { var C = ctx(); return !!(C && C.settings && C.settings.jsetAim === true); }
  function begin(pre, st) {
    var C = ctx(); if (!C || !C.actions || !C.actions.startOnline) { connFail(); return; }
    var r = L.room, opts = null, rivalName = NR().cleanName(pre.name) || L.rival || 'Rival';
    L.rival = rivalName;
    // Online V2: conexión de la sala. El invitado comprueba que el anfitrión juega con la que anuncia la sala (sin model = Precisa)
    var model = roomModel(r);
    // y el anfitrión, que el invitado juega con la de la sala (un cliente de antes no manda model = Precisa: fuera antes de startOnline)
    if ((pre.model === 'fluida' ? 'fluida' : 'precisa') !== model) { connFail('mismatch'); return; }
    if (L.role === 'host') {
      var gst = pre.st || {}, even = !!r.even;
      var seed = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 : Math.floor(Math.random() * 2147483647);
      opts = { online: true, seed: seed, venue: r.venue === 'beach' ? 'beach' : 'hall', mapId: r.map || '', bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, even: even,
        present: true, stats: true,
        // (auditoría: «Colocación dirigida» es un ajuste de cada jugador, no una ventaja: viaja también en «Igualado»)
        // (salto con impulso: djump = salto con dirección de los dos humanos; jsetAim = la diana de colocación de cada uno)
        djump: true,
        humans: [even ? { aimSet: myAimSet(), jsetAim: myJsetAim() } : { attrs: st.attrs || undefined, badges: st.badges || undefined, aimSet: myAimSet(), jsetAim: myJsetAim() },
          even ? { aimSet: gst.aimSet !== false, jsetAim: gst.jsetAim === true } : { attrs: sanAttrs(gst.attrs) || undefined, badges: sanBadges(gst.badges) || undefined, aimSet: gst.aimSet !== false, jsetAim: gst.jsetAim === true }] };
      // Online V2 (Fluida): sin tiempos muertos (notes/online-v2-spec.md §2.1); árbitro y challenge como en Precisa desde 1.14.1
      if (model === 'fluida') { opts.net = 'fluida'; opts.timeouts = false; }
      L.link.send('ctl', JSON.stringify({ k: 'pre', name: myName(), look: myLook(), model: model }));
      api().beat({ state: 'play' }).catch(function () { });
      api().delSig(r.id).catch(function () { });
    }
    stopAll(L.role === 'host' ? ['beat'] : []);
    L.started = true; L.status = 'play';
    var link = L.link;
    link.onclose = function () { matchClosed(link); };
    // (auditoría: el invitado comprueba que el anfitrión manda lo que anuncia la sala: «Igualado», sets, puntos y sede)
    var expect = L.role === 'guest' ? { even: !!r.even, bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, venue: r.venue === 'beach' ? 'beach' : 'hall', net: r.net || undefined } : null;
    var ok = C.actions.startOnline({ slot: L.role === 'host' ? 0 : 1, link: link, opts: opts, name: myName(), rivalName: rivalName,
      look: { mine: myLook(), theirs: saneLook(pre.look) }, expect: expect, model: model });
    if (!ok) { L.started = false; connFail(); return; }
    if (L.role === 'guest') guestListen(L.gen);   // (vigila ofertas nuevas: solo lee Firestore si la conexión cae o la sesión espera)
    render();
  }
  /** La conexión se cayó en pleno partido: se renegocia sobre la misma sala (la sesión espera; a los 60 s decide ella). */
  function relink() {
    if (!L.room) return;
    if (L.role === 'guest') { guestListen(L.gen); return; }
    var tries = 0;
    var go = function () {
      if (!L.started || !L.link || L.link.state === 'open' || L.link.state === 'closed' || tries++ > 6) { stop('relink'); return; }
      var gen = nextGen(), link = L.link, id = L.room.id, to = L.room.guest;
      link.offer().then(function (sdp) { return api().putSig(id, 'offer', { sdp: sdp, gen: gen, to: to }); }).then(function () {
        var t0 = Date.now();
        every('sig', SIG_POLL, function () {
          if (L.gen !== gen || !L.link || L.link.state === 'open' || Date.now() - t0 > 9000) { stop('sig'); return; }
          api().getSig(id, 'answer').then(function (a) { if (a && a.gen === gen && a.uid === to && L.gen === gen) { stop('sig'); link.accept(a.sdp).catch(function () { }); } }, function () { });
        });
      }).catch(function () { });
    };
    stop('relink'); setTimeout(go, 600); every('relink', 10000, go);
  }
  function matchClosed(link) {
    if (L.link !== link) return;
    var wasHost = L.role === 'host';
    stopAll(); L.link = null; L.started = false; L.conn = null;
    if (wasHost) api().close();
    L.room = null; L.role = ''; L.rival = '';
    L.view = 'list';
  }

  /* ---------------- salir ---------------- */
  function leaveRoom() {
    var id = L.room && L.room.id, role = L.role;
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = ''; L.status = ''; L.fail = '';
    if (role === 'host') api().close(); else if (role === 'guest' && id) api().leave(id);
  }

  /* ---------------- pintado ---------------- */
  // SPLAT (17-nov-2026, notes/splat.md «Online»): la página es una .sp-page (index.html) y aquí va solo lo propio del lobby. Salas =
  // brochazos (.sp-ticket: turquesa en pista, dorado en la playa), acciones = manchas (.sp-btn), «Abrir sala» = parche cosido, hojas
  // (ayuda, sala de espera, avisos, teclado) = .sp-panel. Alto: la cabecera (Volver) y la barra de abajo de cada vista (Entendido,
  // Abrir sala, Salir) NUNCA se van; lo que sobra se desplaza por dentro (lista de salas, selectores, ayuda, tarjeta). Ver el bug del
  // 17-nov-2026 (gente atrapada en «Cómo funciona» en un móvil apaisado bajo). P = refuerzo de 3 ids del sistema (estructura).
  var P = ':root:not(#_):not(#_):not(#_) ';
  var PP = ':root.ph' + P.slice(5), PW = ':root.ph.ph-w' + P.slice(5);   // (móvil: html.ph; ancho ≥ 800: html.ph-w)
  function ph() { return !!(VB.Splat && VB.Splat.phone && VB.Splat.phone()); }
  var CSS = [
    '#menu.sp-full #mpOnline{--sp-colw:clamp(360px,54vw,780px);padding-bottom:calc(var(--sp-pad) + 36px + var(--sbm))}',
    '#mpOnline .ol-body{display:flex;flex-direction:column;gap:var(--sp-gap,12px);flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
    'padding:8px 14px 12px 8px;margin:-8px -14px -12px -8px;scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.55) transparent}',
    '#mpOnline .ol-scroll{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.55) transparent}',
    '#mpOnline .ol-ic svg{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    // barra de acciones (una sola parada de ↑↓; ←→ la recorre: netlobby rowStep) y barras de abajo
    '#mpOnline .ol-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;flex:none;padding:2px 4px 4px}',
    '#mpOnline .ol-act{--sp-h:clamp(46px,8vh,58px);--sp-fs:clamp(13px,2.3vh,18px)}',
    P + '#mpOnline .ol-act.ol-nm{flex:1 1 140px;min-width:0;justify-content:flex-start}',
    P + '#mpOnline .ol-act.ol-ico{--sp-px:0;width:var(--sp-h);flex:none}',
    '#mpOnline .ol-me{min-width:0;overflow:hidden;text-overflow:ellipsis;text-transform:none;letter-spacing:.01em}',
    '#mpOnline .ol-q{font:400 1.35em/1 var(--sp-pop)}',
    '#mpOnline .ol-act.spin .ol-ic svg{animation:olSpin .8s linear infinite}@keyframes olSpin{to{transform:rotate(360deg)}}',
    '#mpOnline .ol-bar2{flex-wrap:nowrap;gap:14px}',
    P + '#mpOnline .ol-bar2 .sp-btn{flex:0 1 auto;min-width:0}',
    P + '#mpOnline .ol-bar2 .sp-btn .sp-t{overflow:visible}',
    '#mpOnline .ol-bar2 .sp-patch{--sp-ph:clamp(52px,10vh,84px)}',
    // avisos
    '#mpOnline .ol-note{flex:none;margin:0 4px;padding:9px 14px;border-radius:12px 16px 10px 14px/14px 10px 16px 12px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink);font:700 clamp(12px,2vh,14px)/1.35 var(--sp-ui);transform:rotate(-.4deg)}',
    '#mpOnline .ol-note.bad{background:#ffe1e4;box-shadow:0 0 0 2.5px var(--sp-ink),inset 7px 0 0 var(--sp-danger),3px 4px 0 2.5px var(--sp-ink);padding-left:20px}',
    // rótulo de la cartelera: trazo de tinta con letra crema
    '#mpOnline .ol-board{display:flex;flex-direction:column;gap:10px;flex:0 1 auto;min-height:0}',
    '#mpOnline .ol-bh{position:relative;isolation:isolate;align-self:flex-start;flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:3px 10px;margin:2px 0 0 4px;padding:7px 18px 7px 14px;',
    'font:400 clamp(12px,2vh,15px)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-cream);text-shadow:none;transform:rotate(-1.5deg)}',
    '#mpOnline .ol-bh::before{content:"";position:absolute;inset:0 -4px;z-index:-1;background:var(--sp-ink);-webkit-mask:var(--sp-brush) center/100% 100% no-repeat;mask:var(--sp-brush) center/100% 100% no-repeat}',
    '#mpOnline .ol-live{width:10px;height:10px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 0 2px var(--sp-cream);animation:olLive 1.8s ease-out infinite}',
    '@keyframes olLive{50%{transform:scale(.7)}}',
    '#mpOnline .ol-n{color:var(--sp-gold)}',
    '#mpOnline .ol-rec{font:700 clamp(11px,1.8vh,13px)/1.1 var(--sp-ui);letter-spacing:.02em;text-transform:none;color:rgba(255,244,220,.8)}#mpOnline .ol-rec b{font-weight:800;color:var(--sp-gold)}',
    // la cartelera: un brochazo por sala (se desplaza por dentro)
    '#mpOnline .ol-rooms{display:flex;flex-direction:column;gap:clamp(10px,2vh,16px);padding:6px 16px 14px 8px;margin:-6px -16px -14px -8px}',
    '#mpOnline .ol-fx{--sp-h:clamp(60px,10.5vh,78px);--sp-cs:clamp(34px,6.2vh,48px);flex:none}',
    '#mpOnline .ol-fx .sp-tk-main{gap:3px;padding:clamp(8px,1.5vh,12px) 8px clamp(4px,.8vh,7px)}',
    '#mpOnline .fx-chips .fx-vchip{display:none}',
    '#mpOnline .fx-k{display:flex;align-items:center;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#mpOnline .ol-sep{display:inline-block;flex:none;width:5px;height:5px;margin:0 .55em;border-radius:50%;background:currentColor;opacity:.7}',
    '#mpOnline .fx-line{display:flex;align-items:center;gap:8px;min-width:0}',
    '#mpOnline .fx-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 clamp(16px,3.1vh,25px)/1.12 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-ink);transform:rotate(-1.5deg);transform-origin:0 60%;padding:1px 2px}',
    '#mpOnline .fx-vs{flex:none;font:400 11px/1 var(--sp-pop);font-style:normal;padding:4px 5px 3px;border-radius:9px 7px 10px 8px;background:var(--sp-ink);color:var(--sp-gold);transform:rotate(-6deg)}',
    '#mpOnline .fx-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:24px;padding:0 7px;box-sizing:border-box;border:2px dashed rgba(21,16,42,.55);border-radius:12px;',
    'font:400 15px/1 var(--sp-pop);color:rgba(21,16,42,.6)}',
    '#mpOnline .fx-slot.in{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink);font-size:12.5px;text-transform:uppercase}',
    '#mpOnline .fx-chips{display:flex;gap:6px;min-width:0;overflow:hidden}',
    '#mpOnline .fx-chips i{flex:none;font:700 clamp(10px,1.65vh,12.5px)/1 var(--sp-ui);font-style:normal;padding:3px 7px;border-radius:6px 8px 6px 7px;background:rgba(21,16,42,.15);color:var(--sp-ink);white-space:nowrap}',
    '#mpOnline .fx-end{flex:none;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:5px;padding:0 clamp(14px,2.6vh,22px) 0 6px}',
    '#mpOnline .fx-st{display:inline-flex;align-items:center;gap:6px;font:800 clamp(10px,1.6vh,12px)/1 var(--sp-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--sp-ink);white-space:nowrap}',
    '#mpOnline .fx-st::before{content:"";width:9px;height:9px;border-radius:50%;background:#33d17a;box-shadow:0 0 0 2px var(--sp-ink)}',
    '#mpOnline .fx-st.st-full::before{background:#ff8a3d}#mpOnline .fx-st.st-ver::before{background:#9b93c4}',
    '#mpOnline .fx-go{display:inline-flex;align-items:center;gap:5px;padding:6px 10px 5px 12px;border-radius:10px 14px 9px 13px/12px 9px 13px 10px;background:var(--sp-ink);color:var(--sp-cream);',
    'font:400 clamp(12px,2vh,15px)/1 var(--sp-pop);letter-spacing:.03em;text-transform:uppercase;transform:rotate(-3deg);transition:background .12s,color .12s}',
    '#mpOnline .fx-go svg{width:.85em;height:.85em;fill:var(--sp-gold)}',
    '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go,#mpOnline .ol-fx:hover .fx-go{background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink)}',
    '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go svg,#mpOnline .ol-fx:hover .fx-go svg{fill:var(--sp-ink)}',
    '#mpOnline .ol-fx .sp-crest svg{fill:var(--sp-ink)}',
    P + '#mpOnline .ol-fx.fx-new:not(.kf):not(:focus-visible){animation:olIn .4s var(--ease) both}',
    '@keyframes olIn{from{opacity:0;translate:-26px 0}to{opacity:1;translate:0 0}}',
    // sin salas: pegatina de papel cosida con «? vs ?»
    '#mpOnline .ol-empty{display:flex;align-items:center;gap:16px;flex:none;margin:4px 8px 6px 4px;padding:14px 18px;border-radius:14px 18px 12px 20px/16px 12px 18px 14px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),5px 6px 0 3px var(--sp-ink);outline:2px dashed rgba(21,16,42,.28);outline-offset:-9px;font:700 clamp(13px,2.2vh,16px)/1.3 var(--sp-ui);transform:rotate(-.6deg)}',
    '#mpOnline .ol-ghost{flex:none;display:flex;align-items:center;gap:6px;font:400 22px/1 var(--sp-pop);color:var(--sp-ink)}',
    '#mpOnline .ol-ghost i{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:2.5px dashed rgba(21,16,42,.5);border-radius:50%;font-style:normal;color:rgba(21,16,42,.55)}',
    '#mpOnline .ol-ghost em{font:400 12px/1 var(--sp-pop);font-style:normal;padding:4px 5px 3px;border-radius:9px;background:var(--sp-ink);color:var(--sp-gold);transform:rotate(-6deg)}',
    // (Online V2) «Precisa (v1)» / «Fluida (v2)»: la v en minúscula y más suave
    '#mpOnline .mv-val .sl-ver{text-transform:none;font-style:normal;opacity:.7}',
    '#mpOnline .ol-hint{display:none}',
    '#spToasts .sp-toast.ol-tbad{padding-left:20px;box-shadow:0 0 0 2.5px var(--sp-cream),inset 7px 0 0 var(--sp-danger),3px 4px 0 2.5px var(--sp-ink)}',   // (móvil: la explicación de la fila elegida, debajo de su rótulo)
    // escribir el nombre y el código: campo crema con contorno de tinta y aro dorado al enfocar
    '#mpOnline .ol-edit{display:flex;gap:14px;align-items:center;flex:none;padding:4px 8px 6px 4px}' + P + '#mpOnline .ol-edit .sp-btn{flex:none}',
    '#mpOnline .ol-edit input{flex:1;min-width:0;height:clamp(46px,8vh,56px);box-sizing:border-box;padding:0 16px;border:0;border-radius:12px 16px 12px 18px/16px 12px 18px 12px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),4px 5px 0 3px var(--sp-ink);font:700 clamp(17px,3vh,21px) var(--sp-ui);outline:none;transition:box-shadow .12s}',
    '#mpOnline .ol-edit input::placeholder{color:rgba(21,16,42,.32)}',
    '#app #mpOnline .ol-edit input:focus{outline:none;box-shadow:0 0 0 3px var(--sp-ink),0 0 0 7px var(--sp-gold),5px 7px 0 7px var(--sp-ink)}',
    '#mpOnline .ol-edit input.code{letter-spacing:.32em;text-transform:uppercase;font-family:var(--sp-pop);font-weight:400}',
    // hojas: avisos sin cuenta / sin servidor / sin WebRTC
    '#mpOnline .ol-card{flex:0 1 auto;min-height:0;overflow-y:auto;padding:14px 18px 16px;margin:0 8px 6px 2px}',
    '#mpOnline .ol-card h3{margin:0 0 8px;font:400 clamp(17px,3.3vh,26px)/1.1 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-gold);text-shadow:2px 2px 0 var(--sp-ink);transform:rotate(-1.5deg);transform-origin:0 50%}',
    '#mpOnline .ol-card p{margin:0;font:500 clamp(13px,2.2vh,15px)/1.45 var(--sp-ui);color:rgba(255,244,220,.92)}',
    '#mpOnline .ol-ctas{display:flex;gap:14px;flex:none;padding:2px 4px 6px}',
    // teclado en pantalla (mando): hoja de tinta con teclas crema
    '#mpOnline .ol-osk{display:flex;flex-direction:column;gap:6px;flex:none;padding:10px 12px 12px;margin:0 8px 6px 2px}',
    '#mpOnline .osk-show{display:flex;align-items:center;gap:10px;min-width:0;padding:0 2px 4px}',
    '#mpOnline .osk-lbl{flex:none;font:400 12px/1 var(--sp-pop);letter-spacing:.06em;text-transform:uppercase;color:var(--sp-gold)}',
    '#mpOnline .osk-val{flex:1 1 auto;min-width:0;display:flex;align-items:center;height:36px;padding:0 12px;overflow:hidden;white-space:pre;border-radius:9px 12px 9px 11px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink);font:700 20px/1 var(--sp-ui)}#mpOnline .ol-osk.code .osk-val{letter-spacing:.3em;font-family:var(--sp-pop);font-weight:400}',
    '#mpOnline .osk-car{display:inline-block;width:3px;height:22px;margin-left:2px;border-radius:2px;background:var(--sp-kit);animation:oskCar 1s steps(1) infinite}@keyframes oskCar{50%{opacity:0}}',
    '#mpOnline .osk-tip{flex:none;font:600 12px/1 var(--sp-ui);color:rgba(255,244,220,.75)}',
    '#mpOnline .osk-row{display:flex;gap:6px}',
    P + '#mpOnline .osk-k{flex:1 1 0;min-width:0;height:38px;min-height:0;padding:0;margin:0;border:0;border-radius:8px 10px 8px 9px/9px 8px 10px 8px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2px var(--sp-ink),2px 3px 0 2px var(--sp-ink);font:400 18px/1 var(--sp-pop);letter-spacing:0;text-transform:none;text-shadow:none;outline:none;transform:none;transition:transform .1s var(--ease)}',
    P + '#mpOnline .osk-k.fn{font-size:13px;letter-spacing:.04em;text-transform:uppercase}' + P + '#mpOnline .osk-k.w{flex:2.4 1 0}',
    P + '#mpOnline .osk-k.ok{background:var(--sp-kit);color:var(--sp-kit-ink);text-shadow:var(--sp-kit-ts)}',
    P + '#mpOnline .osk-k:is(.kf,:focus-visible){background:var(--sp-gold);color:var(--sp-ink);text-shadow:none;outline:none;transform:translateY(-2px) scale(1.06);box-shadow:0 0 0 2px var(--sp-ink),0 0 0 5px var(--sp-cream),2px 4px 0 5px var(--sp-ink)}',
    // crear sala: vista previa (así sale en la lista) y los selectores (pegatinas de tinta con ‹ valor ›, los de Partido rápido)
    '#mpOnline .ol-mk{display:flex;flex-direction:column;gap:10px;flex:0 1 auto;min-height:0}',
    '#mpOnline .mk-top{display:flex;align-items:center;gap:10px;flex:none;margin:0 4px}',
    '#mpOnline .mk-top small{font:700 clamp(11px,1.8vh,13px)/1.2 var(--sp-ui);color:rgba(255,244,220,.85);text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    '#mpOnline .mk-prev{flex:none;pointer-events:none;padding:0 10px 0 2px}',
    '#mpOnline .mk-sels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--sp-gap,10px) clamp(12px,1.6vw,18px);padding:6px 14px 12px 6px;margin:-6px -14px -12px -6px}',
    '#mpOnline .mk-tip{flex:none;margin:0 4px;font:600 clamp(11px,1.8vh,13px)/1.35 var(--sp-ui);color:rgba(255,244,220,.85);text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    '#mpOnline .ol-sel{--sp-oh:clamp(52px,9.5vh,76px)}',
    '#mpOnline .mk-sels>.ol-sel:last-child:nth-child(odd){grid-column:1/-1}',
    // «Cómo funciona»: una hoja con una fila por punto (dt dorado, dd crema) y costura discontinua entre filas
    '#mpOnline .ol-help{display:flex;flex-direction:column;gap:10px;flex:0 1 auto;min-height:0}',
    '#mpOnline dl.hp-box{display:block;margin:0 8px 6px 2px;padding:4px 6px}',
    '#mpOnline .hp-box>div{display:grid;grid-template-columns:clamp(92px,22%,128px) minmax(0,1fr);gap:12px;align-items:baseline;padding:8px 10px;border-bottom:2px dashed rgba(255,244,220,.16)}',
    '#mpOnline .hp-box>div:last-child{border-bottom:0}',
    '#mpOnline .hp-box dt{font:400 clamp(11px,1.9vh,14px)/1.3 var(--sp-pop);letter-spacing:.03em;text-transform:uppercase;color:var(--sp-gold);transform:rotate(-2deg);transform-origin:0 50%}',
    '#mpOnline .hp-box dd{margin:0;font:500 clamp(12px,2vh,14.5px)/1.42 var(--sp-ui);color:rgba(255,244,220,.94)}',
    // sala de espera: hoja con la sede, tú VS rival (el VS en pegatina dorada), el código en etiqueta dorada y el estado
    '#mpOnline .ol-match{flex:0 1 auto;min-height:0;overflow-y:auto;margin:0 8px 6px 2px;padding:0 0 12px}',
    '#mpOnline .mt-top{display:flex;align-items:center;gap:10px;padding:10px 14px 9px;border-bottom:2px dashed rgba(255,244,220,.16)}',
    '#mpOnline .mt-top .sp-crest{--sp-cs:clamp(28px,5vh,36px)}#mpOnline .mt-top .sp-crest svg{fill:var(--sp-ink)}',
    '#mpOnline .mt-ven{display:flex;flex-direction:column;gap:2px;min-width:0}#mpOnline .mt-ven b{font:400 clamp(14px,2.4vh,18px)/1 var(--sp-pop);letter-spacing:.02em;text-transform:uppercase;color:var(--sp-cream)}',
    '#mpOnline .mt-ven small{font:600 12px/1.1 var(--sp-ui);color:rgba(255,244,220,.72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#mpOnline .mt-who{margin-left:auto;font:700 12px/1.1 var(--sp-ui);color:rgba(255,244,220,.75);white-space:nowrap}',
    P + '#mpOnline .ol-code{--sp-chs:clamp(13px,2.3vh,17px);letter-spacing:.2em;padding:5px 7px 4px 10px}',
    '#mpOnline .ol-vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;margin:clamp(10px,2.4vh,18px) 16px clamp(8px,1.8vh,12px)}',
    '#mpOnline .ol-p{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;text-align:center}',
    '#mpOnline .ol-p small{display:flex;align-items:center;gap:5px;font:800 11px/1 var(--sp-ui);letter-spacing:.14em;text-transform:uppercase;color:var(--sp-gold)}',
    '#mpOnline .ol-p .ar{font-size:10px;color:var(--sp-cream)}',
    '#mpOnline .ol-p b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 clamp(20px,4.6vh,38px)/1.08 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-cream);',
    'text-shadow:2px 0 0 var(--sp-ink),-2px 0 0 var(--sp-ink),0 2px 0 var(--sp-ink),0 -2px 0 var(--sp-ink),3px 4px 0 var(--sp-ink);transform:rotate(-2deg);padding:2px 4px 4px}',
    '#mpOnline .ol-p.riv b{animation:olRiv .42s var(--ease) both}@keyframes olRiv{from{opacity:0;transform:rotate(-2deg) scale(1.3)}to{opacity:1;transform:rotate(-2deg)}}',
    '#mpOnline .ol-p.wait b{display:flex;align-items:center;gap:8px;text-shadow:none;transform:none}',
    '#mpOnline .ol-p.wait .ol-q{display:inline-flex;align-items:center;justify-content:center;width:clamp(34px,6vh,48px);height:clamp(34px,6vh,48px);border:3px dashed rgba(255,244,220,.45);border-radius:50%;font:400 clamp(18px,3.4vh,26px)/1 var(--sp-pop);color:rgba(255,244,220,.6)}',
    '#mpOnline .ol-dots{display:flex;gap:4px}#mpOnline .ol-dots i{width:8px;height:8px;border-radius:50%;background:var(--sp-gold);box-shadow:0 0 0 1.5px var(--sp-ink);animation:olDot 1.2s ease-in-out infinite}',
    '#mpOnline .ol-dots i:nth-child(2){animation-delay:.2s}#mpOnline .ol-dots i:nth-child(3){animation-delay:.4s}@keyframes olDot{0%,80%,100%{opacity:.25;transform:none}40%{opacity:1;transform:translateY(-4px)}}',
    '#mpOnline .ol-mid{display:flex;align-items:center;justify-content:center;width:clamp(38px,7vh,54px);height:clamp(38px,7vh,54px);border-radius:50%;background:var(--sp-gold);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink);font:400 clamp(15px,2.8vh,21px)/1 var(--sp-pop);transform:rotate(-10deg)}',
    '#mpOnline .mt-chips{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin:0 14px}#mpOnline .mt-chips i{background:rgba(255,244,220,.13);color:var(--sp-cream)}',
    '#mpOnline .ol-st{margin:10px 16px 0;text-align:center;font:700 clamp(13px,2.2vh,15px)/1.4 var(--sp-ui);color:var(--sp-gold)}#mpOnline .ol-st.bad{color:#ffa3ad}',
    '#mpOnline .ol-tip{margin:6px 16px 0;text-align:center;font:500 clamp(11.5px,1.9vh,13px)/1.4 var(--sp-ui);color:rgba(255,244,220,.75)}',
    // — móvil (.ph) — (18-nov-2026, spec «Online»; notes/splat.md «Móvil»). Sustituye a las viejas @media de 430/340 px de alto.
    // PP = prefijo del móvil (:root.ph + 3 ids: gana a P + #mpOnline). La página: cabecera de 48 (Volver, título y tu nombre), UNA zona
    // que se desplaza y la barra de abajo (.ol-dock: la principal, la última, abajo a la derecha). Letra por ancho (--ph-*), nunca vh.
    PP + '#menu.sp-full #mpOnline{left:var(--ph-g);right:auto;width:min(var(--ph-ffw),860px);max-width:none;top:0;bottom:0;padding:var(--ph-gt) 0 var(--ph-gb);gap:0;justify-content:flex-start}',
    PP + '#menu.sp-full #mpOnline>.mp-head{flex:none;min-height:var(--ph-hh);margin:0 0 var(--ph-s2);gap:var(--ph-s3);padding-right:4px;box-sizing:border-box}',
    PP + '#mpOnline .mp-head .sp-k{display:none}' + PP + '#mpOnline .mp-head .mp-tt{flex:none}' + PP + '#mpOnline .mp-head .sp-h{white-space:nowrap}',
    '#mpOnline .ol-hr{display:none}',
    PP + '#mpOnline .ol-hr{display:flex;align-items:center;gap:var(--ph-hit-gap);min-width:0;flex:1 1 auto}',
    // (R2-13) lista: tras «Online», el rótulo vivo «● 4 salas abiertas» (brochazo de tinta); a la derecha tu nombre y el «?» redondo de 44
    PP + '#mpOnline .ol-hsal{position:relative;isolation:isolate;flex:none;display:inline-flex;align-items:center;gap:7px;padding:7px 14px 7px 11px;white-space:nowrap;overflow:hidden;',
    'font:400 var(--ph-label)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-cream);transform:rotate(-1.5deg)}',
    PP + '#mpOnline .ol-hsal::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--sp-ink);-webkit-mask:var(--sp-brush) center/100% 100% no-repeat;mask:var(--sp-brush) center/100% 100% no-repeat}',
    PP + '#mpOnline .ol-hsal .ol-live{flex:none}' + PP + '#mpOnline .ol-hsal b{font-weight:400;color:var(--sp-gold)}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-hx{display:none}',
    PP + '#mpOnline .ol-hsal+.ol-who{margin-left:auto}',
    PP + '#mpOnline .ol-hq{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;margin:0 0 0 4px;padding:0 0 2px;box-sizing:border-box;border:0;border-radius:50%;',
    'background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);font:400 24px/1 var(--sp-pop);text-shadow:none;cursor:pointer;rotate:-6deg;-webkit-tap-highlight-color:transparent}',
    PP + '#mpOnline .ol-hq:is(.kf,:focus-visible){outline:none;background:var(--sp-cream);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-gold),2px 3px 0 6px var(--sp-ink)}',
    PP + '#mpOnline .ol-hq:active{translate:1px 2px}',
    ':root.ph:has(#mpOnline:not([hidden]) .ol-hsal)' + P.slice(5) + '#spToasts{top:calc(var(--ph-gt) + 58px)}',   // (los avisos, bajo tu nombre y el «?», sin taparlos)
    PP + '#mpOnline .ol-recl{display:block;flex:none;margin:2px 4px 0 10px;font:700 var(--ph-cap)/1.3 var(--sp-ui);color:rgba(255,244,220,.85);text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    PP + '#mpOnline .ol-who{display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;min-height:44px;margin:0;padding:4px 12px 4px 10px;box-sizing:border-box;border:0;border-radius:12px 16px 12px 18px/14px 12px 18px 12px;',
    'background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);text-align:left;text-transform:none;letter-spacing:0;text-shadow:none;cursor:pointer;rotate:-1.2deg;-webkit-tap-highlight-color:transparent}',
    PP + '#mpOnline .ol-who .ow-t{display:flex;flex-direction:column;min-width:0}',
    PP + '#mpOnline .ol-who small{font:700 var(--ph-cap)/1.1 var(--sp-ui);color:rgba(21,16,42,.66)}',
    PP + '#mpOnline .ol-who b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;font:800 var(--ph-row)/1.12 var(--sp-ui)}',
    PP + '#mpOnline .ol-who svg{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    PP + '#mpOnline .ol-who:is(.kf,:focus-visible){outline:none;background:var(--sp-gold);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-cream),2px 3px 0 6px var(--sp-ink)}',
    PP + '#mpOnline .ol-who:active{translate:1px 2px}',
    PP + '#mpOnline .ol-hchip{flex:none;--sp-chs:var(--ph-label)}',
    // el cuerpo: sin desplazamiento propio (lo hace la zona .ol-scroll de cada vista) y la barra de abajo
    PP + '#mpOnline .ol-body{flex:1 1 auto;min-height:0;margin:0;padding:0;overflow:visible;display:flex;flex-direction:column;gap:var(--ph-s2);position:relative}',
    PP + '#mpOnline .ol-scroll{scroll-padding:12px}',
    PP + '#mpOnline .ol-scroll.sp-more{-webkit-mask:linear-gradient(#000 calc(100% - 24px),transparent);mask:linear-gradient(#000 calc(100% - 24px),transparent)}',
    PP + '#mpOnline .ol-scroll.sp-less{-webkit-mask:linear-gradient(transparent,#000 16px);mask:linear-gradient(transparent,#000 16px)}',
    PP + '#mpOnline .ol-scroll.sp-more.sp-less{-webkit-mask:linear-gradient(transparent,#000 16px,#000 calc(100% - 24px),transparent);mask:linear-gradient(transparent,#000 16px,#000 calc(100% - 24px),transparent)}',
    PP + '#mpOnline .ol-dock{flex:none;display:flex;flex-wrap:nowrap;justify-content:flex-end;align-items:center;gap:var(--ph-hit-gap);min-width:0;margin:0;padding:2px 4px 2px 2px}',
    PP + '#mpOnline .ol-dock .ol-act{--sp-h:48px;--sp-fs:var(--ph-btn);--sp-px:16px;flex:0 1 auto;min-width:0}',
    PP + '#mpOnline .ol-dock .ol-act.ol-new{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:22px}',
    PP + '#mpOnline .ol-dock .ol-act.ol-ico{--sp-px:0;width:48px;flex:none}',
    PP + '#mpOnline .ol-dock>.sp-dock-l{margin-right:auto}',
    PP + '#mpOnline .ol-dock .ol-act .sp-t{overflow:visible}',
    PP + '#mpOnline .ol-note{margin:0 4px;font-size:var(--ph-body);line-height:1.35}',
    // lista: la cartelera ocupa el alto y se desplaza; «Salas abiertas · 4» pegado arriba; ancho ≥ 800: barra a la derecha (en columna)
    PP + '#mpOnline .ol-body[data-v="list"] .ol-rooms{flex:1 1 auto;min-height:0;gap:12px;padding:4px 12px 20px 4px;margin:0 -12px 0 -4px}',
    PP + '#mpOnline .ol-rooms>.ol-bh{flex:none;margin:2px 0 0 12px;align-self:flex-start}',
    PP + '#mpOnline .ol-bh .ol-live{display:inline-block;vertical-align:middle;margin:-2px 8px 0 0}' + PP + '#mpOnline .ol-bh .ol-n{color:var(--sp-gold)}' + PP + '#mpOnline .ol-bh .ol-rec{font-size:var(--ph-cap);margin-left:4px}',
    PP + '#mpOnline .ol-bh .ol-srch{display:inline-flex;align-items:center;gap:6px;font:700 var(--ph-cap)/1 var(--sp-ui);letter-spacing:0;text-transform:none;color:rgba(255,244,220,.85)}',
    PW + '#mpOnline .ol-body[data-v="list"]{display:grid;grid-template-columns:minmax(0,1fr) clamp(212px,26vw,240px);grid-template-rows:minmax(0,1fr);column-gap:var(--ph-s4)}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-rooms{grid-column:1;grid-row:1}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-dock{grid-column:2;grid-row:1;flex-direction:column;align-items:stretch;justify-content:flex-end;gap:16px;padding:4px 6px 4px 2px}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act{width:100%;flex:none;--sp-px:14px}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act.ol-ico{width:48px;align-self:flex-end}',
    // las salas (brochazos): ≥ 60 px, nombre a --ph-head, una línea de chips, estado con punto y «Entrar» en pegatina dorada de 44
    PP + '#mpOnline .ol-fx{--sp-h:68px;--sp-cs:clamp(32px,2.6vw + 17px,40px);flex:none}',
    PP + '#mpOnline .ol-fx .fx-k{display:none}',
    PP + '#mpOnline .ol-fx .sp-tk-main{gap:5px;padding:6px 8px 6px 6px}',
    PP + '#mpOnline .fx-line{gap:8px}',
    PP + '#mpOnline .fx-name{font-size:var(--ph-head);line-height:1.06;white-space:normal;text-overflow:clip;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:normal}',
    PP + '#mpOnline .mk-prev .fx-name{font-size:var(--ph-row);display:block;white-space:nowrap}' + PP + '#mpOnline .mk-prev .fx-line{flex-wrap:wrap;row-gap:4px}' + PP + '#mpOnline .mk-prev .fx-chips .fx-vchip{display:none}' + PP + '#mpOnline .mk-prev .fx-chips{flex-wrap:wrap;row-gap:4px}',
    // (la sede ya sale en el subtítulo del parche; el billete de muestra crece con su contenido: nada recortado arriba)
    PP + '#mpOnline .mk-prev .ol-fx{--sp-h:auto}' + PP + '#mpOnline .mk-prev .ol-fx .sp-tk-main{padding-top:14px;padding-bottom:10px}',
    PP + '#mpOnline .mk-prev .fx-end{display:none}' + PP + '#mpOnline .mk-prev .fx-line{flex-wrap:nowrap}' + PP + '#mpOnline .mk-prev .fx-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
    PP + '#mpOnline .fx-vs{font-size:var(--ph-cap);padding:4px 6px 3px}',
    PP + '#mpOnline .fx-slot{height:28px;min-width:34px;font-size:var(--ph-row)}',
    PP + '#mpOnline .fx-slot.in{max-width:none;flex:0 1 auto;min-width:0;text-overflow:clip;font-size:var(--ph-cap);padding:0 9px}',
    PP + '#mpOnline .fx-chips{gap:6px;flex-wrap:nowrap}',
    PP + '#mpOnline .fx-chips i{font-size:var(--ph-cap);line-height:1.1;padding:3px 8px}',
    PP + '#mpOnline .fx-chips .fx-vchip{display:block;flex:0 1 auto;min-width:0;max-width:15em;overflow:hidden;text-overflow:ellipsis}',
    PP + '#mpOnline .fx-end{gap:4px;padding:0 12px 0 6px}',
    PP + '#mpOnline .fx-end .fx-st:not(:only-child){display:none}' + PP + '#mpOnline .fx-st{font-size:var(--ph-cap);letter-spacing:0;text-transform:none;font-weight:700}',
    PP + '#mpOnline .fx-go{min-height:44px;box-sizing:border-box;padding:0 14px 0 16px;border-radius:12px 16px 11px 15px/14px 11px 16px 12px;background:var(--sp-gold);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);font-size:var(--ph-btn);letter-spacing:.02em;transform:rotate(-2deg)}',
    PP + '#mpOnline .fx-go svg{fill:var(--sp-ink)}',
    PP + '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go{background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink)}',
    PP + '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go svg{fill:var(--sp-ink)}',
    PP + '#mpOnline .ol-empty{margin:4px 10px 6px 6px;padding:14px 18px;font-size:var(--ph-body)}',
    // escribir tu nombre o el código: hoja pegada arriba (con el teclado del móvil, VB.Splat.kbd la sube), campo de 52 y «Guardar» al lado
    PP + '#mpOnline .ol-edit{position:absolute;left:2px;right:6px;top:0;z-index:6;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"l x" "f f";gap:4px 10px;align-items:center;padding:8px 10px 14px 16px;margin:0}',
    PP + '#mpOnline .ol-edit.kb-pin{top:calc(-1 * var(--ph-hh) - var(--ph-s2))!important}',   // (teclado abierto: sube por encima de la cabecera)
    PP + '#mpOnline .ol-edit .oe-l{grid-area:l;font:400 var(--ph-label)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-gold)}',
    PP + '#mpOnline .ol-edit .sp-x{grid-area:x}',
    PP + '#mpOnline .ol-edit .oe-f{grid-area:f;display:flex;align-items:center;gap:12px;min-width:0}',
    PP + '#mpOnline .ol-edit input{flex:1 1 auto;min-width:0;height:52px;font-size:20px}',
    PP + '#mpOnline .ol-edit .sp-btn{--sp-h:52px;--sp-fs:var(--ph-btn);flex:none}',
    // teclado en pantalla (mando)
    PP + '#mpOnline .ol-osk{flex:1 1 auto;min-height:0;gap:5px;padding:8px 10px 10px;margin:0 4px 0 2px}',
    PP + '#mpOnline .osk-val{height:36px;font-size:20px}' + PP + '#mpOnline .osk-lbl{font-size:var(--ph-label)}' + PP + '#mpOnline .osk-tip{display:none}',
    PP + '#mpOnline .osk-k{height:34px;font-size:18px}' + PP + '#mpOnline .osk-k.fn{font-size:13px;letter-spacing:.02em}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .osk-k{height:30px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .osk-val{height:30px}',
    // «Cómo funciona»: páginas de dos puntos (titular a --ph-head, texto a --ph-body), puntitos y «Siguiente ›» / «Entendido» abajo
    PP + '#mpOnline .hp-go{margin-top:auto}' + PP + '#mpOnline .ol-hpp{flex:0 1 auto;min-height:0;display:block;margin:0 4px 0 2px;padding:4px 18px}',
    PP + '#mpOnline .hp-pt{padding:10px 0 11px;border-bottom:2px dashed rgba(255,244,220,.16)}' + PP + '#mpOnline .hp-pt:last-child{border-bottom:0}',
    PP + '#mpOnline .hp-pt h4{margin:0 0 4px;font:400 var(--ph-head)/1.1 var(--sp-pop);letter-spacing:.01em;text-transform:none;color:var(--sp-gold);text-shadow:2px 2px 0 var(--sp-ink);transform:rotate(-1deg);transform-origin:0 50%}',
    PP + '#mpOnline .hp-pt p{margin:0;font:500 var(--ph-body)/1.4 var(--sp-ui);color:rgba(255,244,220,.94)}',
    PP + '#mpOnline .hp-dots{display:flex;align-items:center;gap:8px;margin-right:auto;padding:0 0 0 8px}',
    PP + '#mpOnline .hp-dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,244,220,.4);box-shadow:0 0 0 2px var(--sp-ink)}',
    PP + '#mpOnline .hp-dots i.on{width:24px;border-radius:6px;background:var(--sp-gold)}',
    // crear sala: filas de opciones (rótulo a la izquierda, ‹ valor › a la derecha) que se desplazan, y «Abrir sala» abajo a la derecha.
    // ≥ 720 px de ancho: filas a la izquierda (58 %) y a la derecha tu sala tal y como sale en la lista, la explicación y el parche
    PP + '#mpOnline .ol-body[data-v="create"]{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;row-gap:var(--ph-s2);--ol-vw:clamp(150px,28vw,230px)}',
    PP + '#mpOnline .ol-body[data-v="create"] .ol-mk{display:contents}',
    PP + '#mpOnline .ol-body[data-v="create"] :is(.mk-top,.mk-prev,.mk-tip){display:none}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-sels{grid-column:1;grid-row:1;display:flex;flex-direction:column;gap:10px;min-height:0;padding:4px 12px 12px 4px;margin:0 -12px 0 -4px}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-go{grid-column:1;grid-row:2}',
    PP + '#mpOnline .mk-go .sp-patch{flex:0 1 auto;width:auto;min-width:min(240px,100%)}',
    PP + '#mpOnline .mk-go .sp-patch .sp-s{font-size:var(--ph-cap)}',
    '@media (min-width:720px){',
    PP + '#mpOnline .ol-body[data-v="create"]{grid-template-columns:minmax(0,58fr) minmax(0,42fr);grid-template-rows:auto auto minmax(0,1fr) auto;column-gap:var(--ph-s4);--ol-vw:clamp(132px,19vw,178px)}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-sels{grid-row:1/-1}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-top{display:flex;grid-column:2;grid-row:1;margin:2px 0 0}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-prev{display:block;grid-column:2;grid-row:2;padding:6px 6px 2px 2px}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-tip{display:block;grid-column:2;grid-row:3;align-self:start;margin-top:8px}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-go{grid-column:2;grid-row:4}',
    PP + '#mpOnline .mk-go .sp-patch{width:100%}}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-body[data-v="create"] .mk-prev{display:none}',
    PP + '#mpOnline .mk-top small{font-size:var(--ph-cap)}',
    PP + '#mpOnline .mk-tip{margin:4px 2px 0;padding:8px 12px;border-radius:12px 16px 11px 15px/14px 11px 16px 12px;background:rgba(21,16,42,.84);box-shadow:0 0 0 2px rgba(255,244,220,.12);',
    'font:500 var(--ph-body)/1.38 var(--sp-ui);color:rgba(255,244,220,.94);text-shadow:none}',
    PP + '#menu #mpOnline .ol-sel{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto;grid-template-areas:"l v";align-items:center;justify-items:stretch;width:100%;height:auto;min-height:54px;',
    'padding:4px 4px 4px 16px;gap:0 8px;text-align:left;white-space:normal;--sp-aw:34px;flex:none}',
    PP + '#menu #mpOnline .ol-sel .mi-l{grid-area:l;display:flex;flex-direction:column;align-items:flex-start;justify-self:start;min-width:0;max-width:100%;margin:0;padding:0;',
    'font:400 var(--ph-label)/1.12 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-gold);text-align:left;transform:rotate(-1deg)}',
    PP + '#menu #mpOnline .ol-sel{--sp-tilt:.25deg;margin:0}' + PP + '#menu #mpOnline .ol-sel:nth-child(odd){--sp-tilt:-.25deg}' + PP + '#mpOnline .ol-fx{--sp-tilt:-.3deg}' + PP + '#mpOnline .ol-fx:nth-child(odd){--sp-tilt:.3deg}',
    PP + '#menu #mpOnline .ol-sel .mi-v{grid-area:v;display:flex;align-items:center;gap:0}',
    PP + '#menu #mpOnline .ol-sel .arr{grid-area:auto}',
    PP + '#menu #mpOnline .ol-sel .mv-val{width:var(--ol-vw);max-width:none;min-width:0;box-sizing:border-box;margin:0;padding:5px 10px;transform:rotate(-1.4deg)}',
    PP + '#menu #mpOnline .ol-sel:nth-child(even) .mv-val{transform:rotate(1.1deg)}',
    PP + '#menu #mpOnline .ol-sel:nth-child(3n+2) .mv-val::before{background:#8ee8d9}',
    PP + '#menu #mpOnline .ol-sel:nth-child(3n) .mv-val::before{background:var(--sp-cream)}',
    PP + '#menu #mpOnline .ol-sel .mv-val b{white-space:normal;overflow:visible;text-overflow:clip;text-align:center;line-height:1.05;overflow-wrap:break-word}',
    PP + '#menu #mpOnline .ol-sel .ol-hint{display:none;margin:3px 0 0;font:600 var(--ph-label)/1.22 var(--sp-ui);letter-spacing:0;text-transform:none;color:rgba(255,244,220,.84);white-space:normal}',
    PP + '#menu #mpOnline .ol-sel:is(:focus,.kf,.ol-on) .ol-hint{display:block}',
    // MV-8: en el móvil, sin brochazo (se deshilachaba y el rótulo quedaba encima de la pista): pegatina de tinta maciza como .sp-li
    // (relleno, perfil de tinta y sombra dura), de 460 como mucho, rótulo y ‹ valor › juntos (12 px)
    PP + '#menu #mpOnline .ol-sel{width:min(100%,460px);gap:0 12px;padding:4px 6px 4px 16px;background:var(--sp-ink2);border-radius:12px 16px 11px 15px/14px 11px 16px 12px;',
    'box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink)}',
    PP + '#menu #mpOnline .ol-sel>.sp-blob{display:none}',
    PP + '#menu #mpOnline .ol-sel:is(.kf,:focus-visible){box-shadow:0 0 0 3px var(--sp-ink),0 0 0 6px var(--sp-gold),3px 5px 0 6px var(--sp-ink)}',
    PP + '#menu #mpOnline .ol-sel:is(:active,.sp-press):not(:disabled){box-shadow:0 0 0 3px var(--sp-ink),1px 1px 0 3px var(--sp-ink)}',
    PP + '#menu #mpOnline .ol-sel:disabled{filter:grayscale(.9) brightness(.72)}',
    // sala de espera: cartel a todo lo ancho (sede, código que se copia al tocarlo, TÚ VS RIVAL en grande, chips, estado y las 3 reglas)
    PP + '#mpOnline .ol-body[data-v="room"] .ol-match{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;margin:0 4px 0 2px;padding:0 0 12px}',
    PP + '#mpOnline .mt-top{flex:none;min-height:56px;box-sizing:border-box;gap:10px;padding:6px 8px 6px 12px}',
    PP + '#mpOnline .mt-ven{flex:1 1 auto;min-width:0}',
    PP + '#mpOnline .mt-ven b{font:700 var(--ph-body)/1.2 var(--sp-ui);letter-spacing:0;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    PP + '#mpOnline .mt-who{font-size:var(--ph-label);margin-left:0}',
    PP + '#mpOnline .ol-code{--sp-chs:var(--ph-head);display:inline-flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;margin:0 4px 0 0;padding:0 12px 0 14px;border:0;letter-spacing:.16em;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    PP + '#mpOnline .ol-code svg{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    PP + '#mpOnline .ol-code:is(.kf,:focus-visible){outline:none;background:var(--sp-cream);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-gold)}',
    PP + '#mpOnline .ol-code:active{translate:1px 2px}',
    PP + '#mpOnline .ol-vs{margin:12px 12px 6px;gap:10px}',
    PP + '#mpOnline .ol-p{gap:4px}' + PP + '#mpOnline .ol-p small{font-size:var(--ph-label);letter-spacing:.04em}' + PP + '#mpOnline .ol-p .ar{font-size:var(--ph-cap)}',
    PP + '#mpOnline .ol-p b{font-size:var(--ph-title);line-height:1.02;white-space:normal;text-overflow:clip;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}',
    PP + '#mpOnline .ol-p.wait b{display:flex}' + PP + '#mpOnline .ol-p.wait .ol-q{width:44px;height:44px;font-size:22px}',
    PP + '#mpOnline .ol-mid{width:48px;height:48px;font-size:20px}',
    PP + '#mpOnline .mt-chips{margin:0 12px}' + PP + '#mpOnline .mt-chips i{font-size:var(--ph-cap);padding:3px 8px}',
    PP + '#mpOnline .ol-st{margin:8px 12px 0;font-size:var(--ph-row);line-height:1.3}',
    // MV-7: el estado fijo (sobre la pista) va en una pegatina de tinta, como el «Lo intentamos otra vez» de los avisos
    PP + '#mpOnline .ol-st-pin{flex:none;align-self:center;box-sizing:border-box;max-width:calc(100% - 16px);margin:0 8px;padding:6px 14px;opacity:1;white-space:normal;text-wrap:balance;text-align:center;',
    'border-radius:8px 11px 8px 10px;background:var(--sp-ink);box-shadow:0 0 0 2px rgba(255,244,220,.14),2px 3px 0 2px var(--sp-ink);text-shadow:none}',
    // 568×320 (.ph-s): el VS en una línea por nombre para que quepan los chips y las reglas (y la pegatina del estado, más justa)
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-st-pin{margin-top:-4px;padding:3px 12px;line-height:1.2}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-vs{margin:2px 12px 0}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p{gap:2px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p b{display:block;font-size:var(--ph-head);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:none}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p.wait b{display:flex}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-mid{width:40px;height:40px;font-size:17px}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p.wait .ol-q{box-sizing:border-box;width:34px;height:34px;font-size:17px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .mt-top{min-height:46px;padding-top:1px;padding-bottom:1px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p.wait b{line-height:1;min-height:0;padding:0}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-body[data-v="room"] .ol-match{padding-bottom:4px}' + PP + '#mpOnline .ol-match>*{flex-shrink:0}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-rules{margin-top:4px}',
    PP + '#mpOnline .ol-tip{display:none}',
    '#mpOnline .ol-rules{display:none}',
    PP + '#mpOnline .ol-rules{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:10px 12px 0}',
    PP + '#mpOnline .ol-rules i{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px 11px 8px 10px;background:rgba(255,244,220,.12);color:var(--sp-cream);font:700 var(--ph-cap)/1.1 var(--sp-ui);font-style:normal}',
    PP + '#mpOnline .ol-rules svg{flex:none;width:15px;height:15px;fill:none;stroke:var(--sp-gold);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    // avisos (sin cuenta, sin servidor, sin WebRTC): una hoja centrada, titular a --ph-head, texto a --ph-body, el botón abajo a la derecha
    PP + '#mpOnline .ol-body:is([data-v="noacc"],[data-v="off"],[data-v="nortc"]){justify-content:center;align-items:center;padding-bottom:var(--ph-s5)}',
    PP + '#mpOnline .ol-card{flex:none;width:min(100%,600px);box-sizing:border-box;margin:0;padding:16px 20px 18px;overflow:visible}',
    PP + '#mpOnline .ol-card h3{margin:0 0 6px;font-size:var(--ph-head)}',
    PP + '#mpOnline .ol-card p{font-size:var(--ph-body);line-height:1.4}',
    PP + '#mpOnline .ol-retry{display:inline-flex;align-items:center;gap:8px;margin:12px 0 0;padding:5px 12px;border-radius:8px 11px 8px 10px;background:rgba(255,244,220,.12);color:var(--sp-cream);font:700 var(--ph-cap)/1.15 var(--sp-ui)}',
    PP + '#mpOnline .ol-retry::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--sp-gold);animation:olLive 1.8s ease-out infinite}',
    PP + '#mpOnline .ol-ctas{width:min(100%,600px);justify-content:flex-end;margin:var(--ph-s3) 0 0;padding:0}',
    PP + '#mpOnline .ol-ctas .sp-btn{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:24px;width:auto;flex:none}',
    PP + '#mpOnline .ol-ctas .sp-s{display:none}',
    // vertical (teléfono de pie): columna a todo lo ancho, cabecera arriba y el lobby abajo; barra en dos filas
    '@media (max-aspect-ratio:5/4){',
    '#mpOnline .ol-act{--sp-h:48px;--sp-fs:14px}',
    P + '#mpOnline .ol-bar .ol-act.ol-new{flex:1 1 auto}' + P + '#mpOnline .ol-act.ol-nm{flex:1 1 calc(100% - 140px)}',
    '#mpOnline .ol-fx{--sp-h:68px;--sp-cs:30px}#mpOnline .ol-fx .sp-tk-stub{padding-left:10px}#mpOnline .fx-name{font-size:17px}#mpOnline .fx-slot.in{max-width:62px;font-size:11px}',
    '#mpOnline .fx-chips i{font-size:10px;padding:2px 5px}#mpOnline .fx-end{padding-right:14px}#mpOnline .fx-go{font-size:12px;padding:5px 8px 4px 9px}',
    '#mpOnline .mk-sels{grid-template-columns:minmax(0,1fr);gap:9px}#mpOnline .ol-sel{--sp-oh:54px}',
    '#mpOnline .hp-box>div{display:block;padding:7px 10px}#mpOnline .hp-box dt{display:inline;margin-right:8px;font-size:12px}#mpOnline .hp-box dd{display:inline;font-size:13px;line-height:1.4}',
    '#mpOnline .ol-p b{font-size:22px;white-space:normal;overflow-wrap:anywhere;text-overflow:clip;line-height:1.05}#mpOnline .mt-top{flex-wrap:wrap;row-gap:6px}',
    '#mpOnline .ol-bar2{flex-wrap:wrap}' + P + '#mpOnline .ol-bar2 .sp-btn{flex:1 1 auto}}',
    '@media (max-width:400px) and (max-aspect-ratio:5/4){#mpOnline .ol-fx .sp-tk-stub{display:none}#mpOnline .fx-main{padding-left:14px}}',
    // menos movimiento (ajuste del juego o del sistema)
    '.rm #mpOnline .ol-fx.fx-new,.rm #mpOnline .ol-p.riv b,.rm #mpOnline .ol-live,.rm #mpOnline .ol-dots i,.rm #mpOnline .ol-act.spin .ol-ic svg,.rm #mpOnline .ol-retry::before{animation:none!important}',
    '@media (prefers-reduced-motion:reduce){#mpOnline .ol-fx.fx-new,#mpOnline .ol-p.riv b,#mpOnline .ol-live,#mpOnline .ol-dots i{animation:none!important}}'
  ].join('');
  function ensureCss() { if (document.getElementById('olCss')) return; var s = document.createElement('style'); s.id = 'olCss'; s.textContent = CSS; document.head.appendChild(s); }
  ensureCss();   // (ya al cargar: la tarjeta de Jugar usa .has-onl / .m-onl antes de abrir el lobby)

  /** Botón de las hojas de aviso (sin cuenta, sin servidor): mancha de pintura del color que toque (SPLAT). */
  function row(a, label, help, right, extra) {
    return '<button class="sp-btn sp-md sp-wide ' + (extra && extra.color || 'sp-kit') + '" data-a="' + a + '" data-shape="' + (extra && extra.shape | 0) + '"' + (extra && extra.dis ? ' disabled' : '') +
      (extra && extra.aria ? ' aria-label="' + esc(extra.aria) + '"' : '') + '><span class="sp-l"><span class="sp-t">' + label + '</span>' + (help ? '<small class="sp-s">' + help + '</small>' : '') + '</span></button>';
  }
  var ARR_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>', ARR_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
  /* Fase 4: «Cómo funciona» (sale sola la primera vez que se entra en la lista; luego, desde la fila de la lista). Frases cortas,
   * género neutro (notes/ui_main.md «Textos: guía de estilo»). */
  var HELP = [
    ['1 contra 1', 'Cada persona lleva a su n.º 1 y la IA lleva a su pareja. Es 2 contra 2 en la playa o en pista.'],
    ['Tu jugador', 'Juegas con los atributos e insignias de tu jugador de la Carrera (sin Carrera, los de tu n.º 1 de Partido rápido). En una sala «Igualado», nadie lleva atributos ni insignias.'],
    ['Salas', 'Crea una sala y espera a que alguien entre desde la lista, o entra en una sala abierta. También puedes pasar el código de tu sala.'],
    ['Sin pausa', 'No se puede parar el partido. Entre sets hay 10 s de descanso: si tu rival y tú pulsáis «Continuar», se sigue antes.'],
    ['Conexión', 'Quien crea la sala elige. Precisa (v1): los dos veis exactamente lo mismo, con algún tirón si hay mucho ping. Fluida (v2): tu equipo responde al instante y el rival se ve una pizca en diferido.'],
    ['Si se corta', 'El partido espera a tu rival y a los 10 s puedes seguir contra la IA. Tu rival tiene 60 s para volver.'],
    ['Récord', 'Abandonar cuenta como derrota. El online no da experiencia ni insignias; al terminar tu primer partido, la gorra «Online Beta Tester» para el Vestuario.'],
    ['Privacidad', 'El juego solo enseña tu nombre, nunca tu correo. La conexión es directa entre los dos aparatos: como en cualquier juego en línea entre jugadores, el aparato de tu rival conoce tu dirección de red.']
  ];
  /** Pegatina redonda de la sede (sombrilla en la playa, pabellón en pista). */
  var VEN_IC = {
    beach: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2C6.8 3.2 2.9 6.9 2.4 11h19.2C21.1 6.9 17.2 3.2 12 3.2zM11 11.5h2v7.6a2.6 2.6 0 0 1-5.2 0v-.6h2v.6a.6.6 0 0 0 1.2 0z"/></svg>',
    hall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 8.6V11h20V8.6zM4 12.5h3v6.5H4zm6.5 0h3v6.5h-3zm6.5 0h3v6.5h-3zM2 20h20v2H2z"/></svg>'
  };
  var GO_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
  /** Una sala de la cartelera: brochazo (.sp-ticket; turquesa en pista, dorado en la playa) con la pegatina de la sede, quien la creó
   *  VS el hueco, los chips del partido, el estado y «Entrar». o.prev: vista previa de «Crear sala» (no es un botón ni se puede pulsar). */
  function fxHTML(r, o) {
    o = o || {};
    var full = r.state === 'full', off = !o.prev && (r.other || full), beach = r.venue === 'beach', vn = venueName(r), kind = beach ? 'Playa' : 'Pabellón';
    var tag = o.prev ? 'div' : 'button';
    return '<' + tag + ' class="ol-fx sp-ticket sp-calm sp-noshine ' + (beach ? 'sp-gold v-beach' : 'v-hall') + (o.isNew ? ' fx-new' : '') + (off ? ' fx-off' : '') + (o.prev ? ' fx-prev' : '') + '"' +
      ' data-shape="' + (o.idx | 0) + '"' +
      (o.prev ? '' : ' data-a="join" data-id="' + esc(r.id) + '"' + (off || L.busy ? ' disabled' : '') +
        ' aria-label="' + esc('Sala de ' + r.name + '. ' + cfgParts(r).join(', ') + (r.other ? '. Otra versión del juego' : full ? '. Llena' : '. Una plaza libre')) + '"') +
      (o.isNew ? ' style="animation-delay:' + (o.delay | 0) + 'ms"' : '') + '><span class="sp-tk">' +
      '<span class="sp-tk-stub"><span class="sp-crest" aria-hidden="true">' + VEN_IC[beach ? 'beach' : 'hall'] + '</span></span>' +
      '<span class="sp-tk-main fx-main"><small class="sp-k fx-k">' + kind + (vn && vn !== kind ? '<i class="ol-sep" aria-hidden="true"></i>' + esc(vn) : '') + '</small>' +
      '<span class="fx-line"><b class="fx-name" title="' + esc(r.name) + '">' + esc(r.name) + '</b><i class="fx-vs">VS</i>' +
      '<span class="fx-slot' + (full ? ' in' : '') + '">' + (full ? esc(r.gname || 'Rival') : '?') + '</span></span>' +
      '<span class="fx-chips">' + (vn && vn !== kind ? '<i class="fx-vchip" data-ph-ell aria-hidden="true">' + esc(vn) + '</i>' : '') + chipsHTML(r) + '</span></span>' +
      '<span class="fx-end"><span class="fx-st ' + (r.other ? 'st-ver' : full ? 'st-full' : 'st-open') + '">' + (r.other ? 'Otra versión' : full ? 'Llena' : 'Abierta') + '</span>' +
      (off || o.prev ? '' : '<span class="fx-go">Entrar' + GO_IC + '</span>') + '</span></span></' + tag + '>';
  }
  /** Selector de «Crear sala»: la pegatina de tinta de Partido rápido (.sp-opt: rótulo dorado y ‹ valor › en trazo dorado entre flechas
   *  crema de 44 px). ↑↓ elige, ←→ o las flechas cambian (netlobby side / onClick con .arr). */
  function selRow(k, label, val, hint, n) {
    return '<button class="ol-sel sp-btn sp-ink sp-wide sp-opt sp-calm' + (L.lastSel === k ? ' ol-on' : '') + '" data-ol="' + k + '" data-shape="' + (n | 0) + '" aria-label="' + esc(label + ': ' + val + '. ' + hint) + '">' +
      '<span class="mi-l">' + esc(label) + '<small class="ol-hint" aria-hidden="true">' + esc(hint) + '</small></span><span class="mi-v sp-select"><span class="arr" data-d="-1">' + ARR_L + '</span>' +
      '<span class="mv-val"><b>' + esc(val).replace(/ \((v\d)\)$/,' <i class="sl-ver">($1)</i>') + '</b></span><span class="arr" data-d="1">' + ARR_R + '</span></span></button>';
  }
  /* Móvil (spec «Online»): los mismos puntos en frases de 2 líneas como mucho, «Sin pausa» el segundo, y en páginas de dos (puntitos y
   * «Siguiente ›» abajo; en la última, «Entendido»). El texto largo de PC (HELP) no cambia. */
  var HELP_PH = [
    ['1 contra 1', 'Cada persona lleva a su n.º 1 y la IA a su pareja: 2 contra 2, en la playa o en pista.'],
    ['Sin pausa', 'El partido no se para. Entre sets hay 10 s de descanso (si los dos pulsáis «Continuar», se sigue antes).'],
    ['Tu jugador', 'Juegas con los atributos e insignias de tu jugador de la Carrera (o de tu n.º 1). En «Igualado», nadie los lleva.'],
    ['Salas', 'Crea una sala y espera a que alguien entre, o entra en una de la lista. También puedes pasar tu código.'],
    ['Conexión', 'Quien crea la sala elige. Precisa (v1): los dos veis lo mismo. Fluida (v2): tu equipo responde al instante.'],
    ['Si se corta', 'El partido espera a tu rival; a los 10 s puedes seguir contra la IA. Tu rival tiene 60 s para volver.'],
    ['Récord', 'Abandonar cuenta como derrota. Sin experiencia ni insignias; tu primer partido da la gorra «Online Beta Tester».'],
    ['Privacidad', 'Solo se ve tu nombre, nunca tu correo. La conexión es directa: el aparato de tu rival conoce tu dirección de red.']
  ];
  var HP_PER = 2;   // (3 con ancho ≥ 800: html.ph-w)
  function hpPer() { return document.documentElement.classList.contains('ph-w') ? 3 : HP_PER; }
  function hpPages() { return Math.ceil(HELP_PH.length / hpPer()); }
  function helpHTML() {
    if (ph()) {
      var pg = Math.max(0, Math.min(hpPages() - 1, L.hpPage | 0));
      return '<div class="ol-hpp sp-panel ol-scroll" role="group" aria-label="Cómo funciona el online, ' + (pg + 1) + ' de ' + hpPages() + '">' +
        HELP_PH.slice(pg * hpPer(), pg * hpPer() + hpPer()).map(function (x) { return '<div class="hp-pt"><h4>' + esc(x[0]) + '</h4><p>' + esc(x[1]) + '</p></div>'; }).join('') + '</div>';
    }
    // (SPLAT) rótulo en trazo de tinta y una hoja (.sp-panel) con una fila por punto; la hoja se desplaza por dentro y «Entendido» queda fuera
    return '<div class="ol-help"><h3 class="ol-bh">Cómo funciona el online</h3><dl class="hp-box sp-panel ol-scroll">' +
      HELP.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div>';
  }
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  var IC = {
    plus: svg('M12 5v14M5 12h14'), hash: svg('M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16'), pen: svg('M4 20l1-4L16 5l3 3L8 19zM14 7l3 3'),
    ref: svg('M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4'), copy: svg('M8 8h11v11H8zM5 16V5h11'), out: svg('M14 5h5v14h-5M10 8l-4 4 4 4M6 12h10'),
    // (móvil) compartir, siguiente / anterior, ✕ y las tres reglas de la sala de espera
    share: svg('M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V20h14v-7.5'), next: svg('M9.5 5.5 16 12l-6.5 6.5'), prev: svg('M14.5 5.5 8 12l6.5 6.5'), x: svg('M6.5 6.5l11 11M17.5 6.5l-11 11'),
    nopause: svg('M8 5v14M16 5v14M4 4l16 16'), clock: svg('M12 4a8 8 0 1 0 .01 0zM12 8v4.5l3 2'), flag: svg('M6 21V4M6 4h11l-2.5 4L17 12H6')
  };
  function ic(k) { return '<span class="sp-ic ol-ic">' + IC[k] + '</span>'; }
  /* ---------------- escribir el nombre y el código ----------------
   * Con teclado, ratón o táctil: un <input> como siempre. Si lo último que se ha tocado es un MANDO (ctx.inputDevice === 'gamepad'),
   * un teclado en pantalla: cruceta para moverse (↑↓ entre filas, ←→ dentro de la fila), A escribe, B cancela. Para que ↑↓ de ui.js
   * baje de fila y no de tecla, solo la tecla de la columna actual de cada fila queda sin data-skip (L.osk.col). */
  function padNow() { var C = ctx(); return !!(C && C.inputDevice === 'gamepad'); }
  var OSK_N = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM-._'], OSK_C = ['23456789', 'ABCDEFGHJK', 'MNPQRSTUVW'];
  var OSK_W = 10;   // (columnas de la fila más larga)
  function oskRows() {
    var o = L.osk, code = L.edit === 'code', rows = (code ? OSK_C : OSK_N).map(function (s) {
      return Array.from(s).map(function (c) { var ch = code || o.up ? c : c.toLowerCase(); return { k: 'c' + ch, t: ch }; });
    });
    rows.push(code ? [{ k: 'cX', t: 'X' }, { k: 'cY', t: 'Y' }, { k: 'cZ', t: 'Z' }, { k: 'bs', t: 'Borrar', w: 1 }, { k: 'ok', t: 'Entrar', w: 1 }] :
      [{ k: 'sh', t: o.up ? 'abc' : 'ABC' }, { k: 'sp', t: 'Espacio', w: 1 }, { k: 'bs', t: 'Borrar' }, { k: 'ok', t: 'Guardar', w: 1 }]);
    return rows;
  }
  function oskIdx(len, col) { return len >= OSK_W ? Math.min(col, len - 1) : Math.round(col * (len - 1) / (OSK_W - 1)); }
  function editHTML(nm) {
    var code = L.edit === 'code';
    // (móvil: hoja pegada arriba, rótulo y ✕, y el campo de 52 px con su botón al lado; con el teclado del móvil, VB.Splat.kbd la sube)
    if (!L.osk && ph()) return '<div class="ol-edit sp-panel" data-nav data-kb-pin><span class="oe-l">' + (code ? 'Código de la sala' : 'Tu nombre en el online') + '</span>' +
      '<button class="sp-x" type="button" data-a="editX" aria-label="Cancelar">' + IC.x + '</button><div class="oe-f" data-kb-row>' +
      (code ? '<input id="olIn" class="code" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Código de la sala" placeholder="K7P2QX"><button class="ol-act sp-btn sp-kit" data-shape="1" data-a="codeOk"><span class="sp-t">Entrar</span></button>'
        : '<input id="olIn" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Tu nombre en el online" value="' + esc(nm) + '"><button class="ol-act sp-btn sp-kit" data-shape="1" data-a="nameOk"><span class="sp-t">Guardar</span></button>') + '</div></div>';
    if (!L.osk) {
      if (code) return '<div class="ol-edit"><input id="olIn" class="code" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Código de la sala" placeholder="K7P2QX"><button class="ol-act ol-new sp-btn sp-kit" data-shape="1" data-a="codeOk"><span class="sp-t">Entrar</span></button></div>';
      return '<div class="ol-edit"><input id="olIn" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Tu nombre en el online" value="' + esc(nm) + '"><button class="ol-act ol-new sp-btn sp-kit" data-shape="1" data-a="nameOk"><span class="sp-t">Guardar</span></button></div>';
    }
    var o = L.osk, h = '<div class="ol-osk sp-panel' + (code ? ' code' : '') + '"><div class="osk-show"><span class="osk-lbl">' + (code ? 'Código' : 'Tu nombre') + '</span>' +
      '<b class="osk-val" aria-live="polite">' + esc(o.v) + '<i class="osk-car" aria-hidden="true"></i></b><span class="osk-tip">A escribe. B cancela.</span></div>';
    oskRows().forEach(function (row, ri) {
      var ci = oskIdx(row.length, o.col);
      h += '<div class="osk-row" data-nav>' + row.map(function (x, i) {
        return '<button class="osk-k' + (x.k.charAt(0) === 'c' ? '' : ' fn') + (x.w ? ' w' : '') + (x.k === 'ok' ? ' ok' : '') + '" data-a="osk" data-id="' + esc(x.k) + '" data-r="' + ri + '" data-i="' + i + '"' + (i === ci ? '' : ' data-skip') +
          (x.k === 'sp' ? ' aria-label="Espacio"' : '') + '>' + esc(x.t) + '</button>';
      }).join('') + '</div>';
    });
    return h + '</div>';
  }
  function oskKey(k) {
    var o = L.osk, max = L.edit === 'code' ? 6 : 16; if (!o) return;
    if (k === 'ok') { commitEdit(); return; }
    if (k === 'bs') o.v = Array.from(o.v).slice(0, -1).join('');
    else if (k === 'sh') o.up = !o.up;
    else if (k === 'sp') { if (o.v && !/ $/.test(o.v) && o.v.length < max) o.v += ' '; }
    else if (k.charAt(0) === 'c' && Array.from(o.v).length < max) { o.v += k.slice(1); if (L.edit === 'name' && o.up && o.auto) o.up = false; }
    o.auto = false;
    sound('optChange'); render(true);
  }
  /** ←→ dentro de una fila del teclado en pantalla (o de una barra de acciones). */
  function rowStep(el, d) {
    var par = el.parentNode, bs = Array.prototype.filter.call(par.querySelectorAll('button'), function (b) { return !b.disabled; }), i = bs.indexOf(el);
    if (i < 0 || bs.length < 2) return true;
    var nb = bs[(i + d + bs.length) % bs.length];
    bs.forEach(function (b) { if (b !== nb && par.classList.contains('ol-bar') && !par.classList.contains('ol-bar2')) b.setAttribute('data-skip', ''); });
    nb.removeAttribute('data-skip');
    if (el.classList.contains('osk-k')) {
      var n = bs.length, ni = +nb.getAttribute('data-i');
      L.osk.col = n >= OSK_W ? ni : Math.round(ni * (OSK_W - 1) / (n - 1));
      // (las demás filas: su tecla de la columna nueva queda sin data-skip)
      Array.prototype.forEach.call(L.host.querySelectorAll('.osk-row'), function (r) {
        var ks = r.querySelectorAll('.osk-k'), ci = oskIdx(ks.length, L.osk.col);
        for (var j = 0; j < ks.length; j++) { if (j === ci) ks[j].removeAttribute('data-skip'); else ks[j].setAttribute('data-skip', ''); }
      });
    } else if (par.classList.contains('ol-bar') && !par.classList.contains('ol-bar2')) L.barKey = nb.getAttribute('data-a');
    try { nb.focus(); } catch (e) { }
    var pv = document.querySelectorAll('.kf'); for (var j = 0; j < pv.length; j++) pv[j].classList.remove('kf');
    nb.classList.add('kf'); sound('optHover');
    return true;
  }
  function note() { if (ph()) return '';   // (móvil: el aviso va al carril de avisos de arriba, VB.Splat.toast: ver render)
    return L.msg ? '<p class="ol-note' + (L.msgBad ? ' bad' : '') + '" role="status">' + esc(L.msg) + '</p>' : ''; }
  /* ---------------- móvil (html.ph; spec «Online», notes/splat.md «Móvil») ----------------
   * La misma página con otra disposición: en la cabecera, tras «Online», tu nombre en una chapa crema (lista) o en qué paso estás; una
   * sola zona que se desplaza (la cartelera, las filas de Crear sala, la ayuda, el cartel de la sala) y la barra de abajo con la acción
   * principal la última (abajo a la derecha). Los avisos (L.msg) van al carril de arriba (VB.Splat.toast). Mismos data-a y data-ol que
   * en PC: onClick, back(), side() y las pruebas no cambian. */
  function headHTML() {
    var v = L.view;
    if (v === 'list' && !L.osk) {
      // (R2-13: «Salas abiertas · 4» y el «?» suben a la cabecera; la cartelera gana la fila del rótulo)
      var nm = myName(), n0 = L.rooms.length, srch0 = (L.loading && !L.listAt) || (L.listAt && !n0);
      return '<span class="ol-hsal" role="status"><span class="ol-live" aria-hidden="true"></span>' +
        (L.listAt && n0 ? '<b class="ol-n">' + n0 + '</b> ' + (n0 === 1 ? 'sala' : 'salas') + '<span class="ol-hx"> ' + (n0 === 1 ? 'abierta' : 'abiertas') + '</span>'
          : srch0 ? 'Buscando…' : 'Salas') + '</span>' +
        '<button class="ol-who" type="button" data-a="name" aria-label="' + esc('Tu nombre: ' + nm + '. Cambiar') + '"><span class="ow-t"><small>Juegas como</small><b>' + esc(nm) + '</b></span>' + IC.pen + '</button>' +
        '<button class="ol-hq" type="button" data-a="help" aria-label="Cómo funciona">?</button>';
    }
    var t = v === 'help' ? 'Cómo funciona' : v === 'create' ? 'Nueva sala' : v === 'room' && L.room ? 'Sala de espera' : '';
    return t ? '<i class="sp-chip ol-hchip">' + t + '</i>' : '';
  }
  function viewPH() {
    var v = L.view, h = '';
    if (v === 'noacc') {
      h = '<div class="ol-card sp-panel"><h3>Necesitas una cuenta para jugar online</h3><p>Entra con tu cuenta (o créala, es gratis) y vuelve aquí. Tu rival solo verá tu nombre.</p></div>' +
        '<div class="ol-ctas" data-nav>' + row('acc', 'Ir a Cuenta', '', '', { color: 'sp-kit', shape: 0 }) + '</div>';
    } else if (v === 'off') {
      h = '<div class="ol-card sp-panel"><h3>El online aún no está activado</h3><p>Todavía no se puede jugar online desde el servidor. Vuelve a probar dentro de un rato.</p>' +
        '<span class="ol-retry" role="status">Lo intentamos otra vez en 30 s</span></div>' +
        '<div class="ol-ctas" data-nav>' + row('retry', 'Volver a probar', '', '', { color: 'sp-gold', shape: 1 }) + '</div>';
    } else if (v === 'nortc') {
      h = '<div class="ol-card sp-panel"><h3>Este navegador no puede jugar online</h3><p>Ábrelo en Chrome o Safari actualizados (en el iPhone, sin el modo Aislamiento).</p></div>';
    } else if (v === 'help') {
      var pg = Math.max(0, Math.min(hpPages() - 1, L.hpPage | 0)), last = pg >= hpPages() - 1, dots = '';
      for (var d = 0; d < hpPages(); d++) dots += '<i' + (d === pg ? ' class="on"' : '') + '></i>';
      h = helpHTML() + '<div class="ol-bar ol-bar2 ol-dock hp-go" data-nav><span class="hp-dots" aria-hidden="true">' + dots + '</span>' +
        (pg > 0 ? '<button class="ol-act ol-ico sp-btn sp-ink sp-sq" data-shape="1" data-a="helpPrev" aria-label="Anterior">' + ic('prev') + '</button>' : '') +
        (last ? '<button class="ol-act ol-new sp-btn sp-gold" data-shape="2" data-a="helpOk"><span class="sp-t">Entendido</span></button>'
          : '<button class="ol-act ol-new sp-btn sp-gold" data-shape="2" data-a="helpNext"><span class="sp-t">Siguiente</span>' + ic('next') + '</button>') + '</div>';
    } else if (v === 'list') {
      if (L.osk) return editHTML(myName());   // (teclado en pantalla del mando: ocupa la página entera)
      var rl = VB.NetRec ? safe(function () { return VB.NetRec.line(); }) : '';
      var n = L.rooms.length;
      h = '<div class="ol-rooms ol-scroll" data-nav>';   // (el rótulo «Salas abiertas · n» va en la cabecera: headHTML)
      if (L.listErr) h += '<p class="ol-note bad">' + esc(L.listErr) + '</p>';
      if (!n && L.listAt) h += '<div class="ol-empty"><span class="ol-ghost" aria-hidden="true"><i>?</i><em>VS</em><i>?</i></span><span>Aún no hay salas. Crea una y avisa a alguien.</span></div>';
      var seen = L.seenAt || {}, now = {}, k = 0, tn = Date.now();
      L.rooms.forEach(function (r) {
        var t1 = now[r.id] = seen[r.id] || tn, isNew = tn - t1 < 1000;
        h += fxHTML(r, { isNew: isNew, delay: isNew ? k++ * 70 : 0, idx: L.rooms.indexOf(r) });
      });
      if (L.listAt) L.seenAt = now;
      if (rl) h += '<p class="ol-rec ol-recl">Tu récord online: <b>' + esc(rl) + '</b></p>';   // (al final de la cartelera: no quita sitio a las salas)
      h += '</div><div class="ol-bar ol-bar2 ol-dock" data-nav>' +
        '<button class="ol-act sp-btn sp-alt" data-shape="1" data-a="code" aria-label="Entrar con código">' + ic('hash') + '<span class="sp-t">Código</span></button>' +
        '<button class="ol-act ol-new sp-btn sp-kit" data-shape="0" data-a="new"' + (L.busy ? ' disabled' : '') + '>' + ic('plus') + '<span class="sp-t">Crear sala</span></button></div>';
      if (L.edit === 'name' || L.edit === 'code') h += editHTML(myName());
    } else if (v === 'create') {
      var c = L.cfg, ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH;
      if (ms.indexOf(cur) < 0) { cur = ms[0]; if (c.venue === 'beach') c.mapB = cur; else c.mapH = cur; }
      var cb = c.venue === 'beach', ck = cb ? 'Playa' : 'Pabellón', vn = cur && VB.Venues && VB.Venues.name ? VB.Venues.name(cur) || cur : ck, fl = c.model === 'fluida';
      var pr = { name: myName(), venue: c.venue, map: cur, bo: c.bo, pts: cb ? 21 : c.pts, even: c.even, net: fl ? 'fluida' : undefined };
      // (orden del móvil: Escenario, Sede, Partido, Puntos, Igualado, Conexión)
      h = '<div class="ol-mk ' + (cb ? 'v-beach' : 'v-hall') + '">' +
        '<div class="mk-top"><i class="sp-chip">Tu sala</i><small>Así sale en la lista</small></div>' +
        '<div class="mk-prev" aria-hidden="true">' + fxHTML(pr, { prev: true, idx: 1 }) + '</div>' +
        '<div class="mk-sels ol-scroll" data-nav>' +
        selRow('venue', 'Escenario', ck, cb ? 'En la arena' : 'En pista cubierta', 0) +
        selRow('map', 'Sede', vn, 'Donde se juega', 2) +
        selRow('bo', 'Partido', c.bo === 3 ? 'Mejor de 3' : '1 set', c.bo === 3 ? (cb ? 'Sets a 21; el tercero, a 15' : 'Gana quien gane 2 sets') : 'Un solo set', 1) +
        (cb ? '' : selRow('pts', 'Puntos', String(c.pts), 'Puntos por set', 3)) +
        selRow('even', 'Igualado', c.even ? 'Sí' : 'No', c.even ? 'Nadie lleva atributos ni insignias' : 'Cada persona, con los de su jugador', 0) +
        selRow('net', 'Conexión', fl ? 'Fluida (v2)' : 'Precisa (v1)', fl ? 'Tu lado, sin retraso' : 'Los dos veis lo mismo', 2) + '</div>' +
        '<p class="mk-tip">' + (fl ? 'Tu equipo responde al instante y el rival se ve una pizca en diferido. Sin repeticiones en esta versión.'
          : c.even ? 'Igualado: nadie lleva atributos ni insignias.' : 'Cada persona juega con los atributos de su jugador.') + '</p></div>' +
        '<div class="ol-bar ol-bar2 ol-dock mk-go" data-nav><button class="ol-act ol-new sp-patch" data-a="open"' + (L.busy ? ' disabled' : '') + '><span class="sp-l"><span class="sp-t">Abrir sala</span>' +
        '<small class="sp-s">' + esc(ck + (vn && vn !== ck ? ', ' + vn : '')) + '</small></span></button></div>';
    } else if (v === 'room' && L.room) {
      var r2 = L.room, host = L.role === 'host', me = myName(), riv = L.rival, st = '';
      if (L.started) st = 'Empieza el partido…';
      else if (L.status === 'wait') st = L.fail || 'Esperando rival. Tu sala sale en la lista de Online.';
      else if (L.status === 'connecting') st = 'Conectando con ' + riv + '…';
      else if (L.status === 'linked') st = 'Conectados. Empieza el partido…';
      var bad = !!L.fail && L.status === 'wait', left = host ? me : riv, right = host ? (riv || '') : me;
      var pl = function (nn, who, isRival, side) {
        if (!nn) return '<div class="ol-p mt-side ' + side + ' wait"><small>' + who + '</small><b><span class="ol-q">?</span><span class="ol-dots" role="img" aria-label="Esperando"><i></i><i></i><i></i></span></b></div>';
        return '<div class="ol-p mt-side ' + side + (isRival ? ' riv' : '') + '"><small>' + who + (isRival ? ' <span class="ar" aria-hidden="true">▼</span>' : '') + '</small><b>' + esc(nn) + '</b></div>';
      };
      var b2 = r2.venue === 'beach', vn2 = venueName(r2), k2 = b2 ? 'Playa' : 'Pabellón';
      h = '<div class="ol-match sp-panel ol-scroll ' + (b2 ? 'v-beach' : 'v-hall') + (riv ? ' has-riv' : '') + '">' +
        '<div class="mt-top" data-nav><span class="sp-crest" aria-hidden="true">' + VEN_IC[b2 ? 'beach' : 'hall'] + '</span><span class="mt-ven"><b data-ph-ell>' + k2 + (vn2 && vn2 !== k2 ? ' · ' + esc(vn2) : '') + '</b>' +
        (host ? '' : '<small class="mt-who">Sala de ' + esc(r2.name) + '</small>') + '</span>' +
        '<button class="ol-code sp-chip" type="button" data-a="copy" aria-label="' + esc('Código ' + r2.code.split('').join(' ') + '. Copiar') + '">' + esc(r2.code) + IC.copy + '</button></div>' +
        '<div class="ol-vs">' + pl(left, host ? 'Tú' : 'Rival', !host, 'mt-a') + '<span class="ol-mid">VS</span>' + pl(right, host ? 'Rival' : 'Tú', host && !!riv, 'mt-b') + '</div>' +
        '<div class="fx-chips mt-chips">' + chipsHTML(r2) + '</div>' +
        (L.started ? '' : '<div class="ol-rules"><i>' + IC.nopause + 'Sin pausa</i><i>' + IC.clock + '10 s entre sets</i><i>' + IC.flag + 'Abandonar = derrota</i></div>') + '</div>' +
        // (móvil: el estado va fuera del desplazamiento, justo encima de la barra, siempre a la vista y opaco)
        '<p class="ol-st ol-st-pin' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' +
        '<div class="ol-bar ol-bar2 ol-dock" data-nav><button class="ol-act ol-out sp-btn sp-danger sp-dock-l" data-shape="1" data-a="leave">' + ic('out') + '<span class="sp-t">Salir de la sala</span></button>' +
        (host ? '<button class="ol-act ol-new sp-btn sp-kit" data-shape="0" data-a="share">' + ic('share') + '<span class="sp-t">Compartir</span></button>' : '') + '</div>';
    }
    return h;
  }
  function viewHTML() {
    var v = L.view, h = '';
    if (v === 'noacc') {
      h = '<div class="ol-card sp-panel"><h3>Necesitas una cuenta para jugar online</h3><p>Entra con tu cuenta (o créala, es gratis) y vuelve aquí. Tu rival solo verá tu nombre.</p></div>' +
        '<div class="ol-ctas" data-nav>' + row('acc', 'Ir a Cuenta', 'Entrar o crear una cuenta', '', { color: 'sp-kit', shape: 0 }) + '</div>';
    } else if (v === 'off') {
      h = '<div class="ol-card sp-panel"><h3>El online aún no está activado en el servidor</h3><p>Todavía no se puede jugar online. Vuelve a probar dentro de un rato.</p></div>' +
        '<div class="ol-ctas" data-nav>' + row('retry', 'Volver a probar', '', '', { color: 'sp-gold', shape: 1 }) + '</div>';
    } else if (v === 'nortc') {
      h = '<div class="ol-card sp-panel"><h3>Este navegador no puede jugar online</h3><p>Prueba con una versión reciente de Chrome, Edge, Firefox o Safari (en el iPhone, sin el modo Aislamiento).</p></div>';
    } else if (v === 'help') {
      h = helpHTML() + '<div class="ol-bar ol-bar2 hp-go" data-nav><button class="ol-act ol-new sp-btn sp-gold sp-wide" data-shape="2" data-a="helpOk"><span class="sp-t">Entendido</span></button></div>';
    } else if (v === 'list') {
      // (rediseño 1.5.x, petición de Ferran: que las salas no parezcan botones del menú) Arriba, una BARRA de acciones compacta
      // (un solo alto en ↑↓; ←→ recorre la barra). Debajo, la CARTELERA: una franja por sala como un rótulo de TV.
      var nm = myName(), bk = L.barKey || 'new';
      if (bk === 'new' && L.busy) bk = 'code';   // («Crear sala» desactivado: la parada de la barra pasa a «Código», para no quedarse sin ninguna)
      // (SPLAT) cada acción, una mancha de su color: Crear sala (equipación), Código (contraste), tu nombre (tinta), actualizar y ayuda (cuadradas)
      var act = function (a, inner, cls, aria, dis, n) {
        return '<button class="ol-act sp-btn' + (cls ? ' ' + cls : '') + '" data-a="' + a + '" data-shape="' + n + '"' + (a === bk ? '' : ' data-skip') + (dis ? ' disabled' : '') +
          (aria ? ' aria-label="' + esc(aria) + '"' : '') + '>' + inner + '</button>';
      };
      // (con el teclado en pantalla abierto la barra se esconde: el teclado ocupa su sitio y el de la cartelera; B cancela)
      h = note() + '<div class="ol-bar" data-nav' + (L.osk ? ' hidden' : '') + '>' +
        act('new', ic('plus') + '<span class="sp-t">Crear sala</span>', 'ol-new sp-kit', '', L.busy, 0) +
        act('code', ic('hash') + '<span class="sp-t">Código</span>', 'sp-alt', 'Entrar con código', false, 1) +
        act('name', ic('pen') + '<span class="sp-t ol-me">' + esc(nm) + '</span>', 'ol-nm sp-ink sp-wide', 'Tu nombre: ' + nm + '. Cambiar', false, 2) +
        act('refresh', ic('ref'), 'ol-ico sp-ink sp-sq' + (L.loading ? ' spin' : ''), 'Actualizar', false, 0) +
        act('help', '<span class="ol-q">?</span>', 'ol-ico sp-gold sp-sq', 'Cómo funciona', false, 1) + '</div>';
      if (L.edit === 'name' || L.edit === 'code') h += editHTML(nm);
      if (L.osk) return h;   // (teclado en pantalla abierto: ocupa el sitio de la cartelera, sobre todo en un teléfono apaisado)
      // (fase 3: tu récord online, aparte del de Partido rápido; abandonar cuenta como derrota)
      var rl = VB.NetRec ? safe(function () { return VB.NetRec.line(); }) : '';
      var n = L.rooms.length, cnt = L.loading && !L.listAt ? 'Buscando…' : L.listAt ? (n === 1 ? '1 sala' : n + ' salas') : '';
      h += '<div class="ol-board"><h3 class="ol-bh"><span class="ol-live" aria-hidden="true"></span>Salas abiertas<span class="ol-n">' + cnt + '</span>' +
        (rl ? '<span class="ol-rec">Tu récord <b>' + esc(rl) + '</b></span>' : '') + '</h3>';
      if (L.listErr) h += '<p class="ol-note bad">' + esc(L.listErr) + '</p>';
      h += '<div class="ol-rooms ol-scroll" data-nav>';
      if (!n) h += L.listAt ? '<div class="ol-empty"><span class="ol-ghost" aria-hidden="true"><i>?</i><em>VS</em><i>?</i></span><span>Aún no hay salas. Crea una y avisa a alguien.</span></div>' : '';
      // (animación de entrada: una sala es «nueva» durante 1 s desde que se ve por primera vez; así un repintado en ese segundo no la corta)
      var seen = L.seenAt || {}, now = {}, k = 0, tn = Date.now();
      L.rooms.forEach(function (r) {
        var t1 = now[r.id] = seen[r.id] || tn, isNew = tn - t1 < 1000;
        h += fxHTML(r, { isNew: isNew, delay: isNew ? k++ * 70 : 0, idx: L.rooms.indexOf(r) });
      });
      if (L.listAt) L.seenAt = now;
      h += '</div></div>';
    } else if (v === 'create') {
      var c = L.cfg, ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH;
      if (ms.indexOf(cur) < 0) { cur = ms[0]; if (c.venue === 'beach') c.mapB = cur; else c.mapH = cur; }
      var cb = c.venue === 'beach', ck = cb ? 'Playa' : 'Pabellón', vn = cur && VB.Venues && VB.Venues.name ? VB.Venues.name(cur) || cur : ck;
      // (fase 6) El mismo lenguaje que la cartelera: UN rótulo con la franja de la sede (arena / madera), la vista previa de tu sala tal
      // y como saldrá en la lista (TÚ VS ?, con sus chips) y debajo los selectores compactos (↑↓ elige, ←→ cambia). Sin tarjetas sueltas.
      var fl = c.model === 'fluida';
      var pr = { name: myName(), venue: c.venue, map: cur, bo: c.bo, pts: cb ? 21 : c.pts, even: c.even, net: fl ? 'fluida' : undefined };
      // (SPLAT) arriba, «Tu sala» y la vista previa tal y como saldrá en la lista (el brochazo de la cartelera); debajo, los selectores de
      // Partido rápido (pegatinas de tinta, se desplazan por dentro) y «Abrir sala» en parche cosido, siempre a la vista.
      h = note() + '<div class="ol-mk ' + (cb ? 'v-beach' : 'v-hall') + '">' +
        '<div class="mk-top"><i class="sp-chip">Tu sala</i><small>Así sale en la lista</small></div>' +
        '<div class="mk-prev" aria-hidden="true">' + fxHTML(pr, { prev: true, idx: 1 }) + '</div>' +
        '<div class="mk-sels ol-scroll" data-nav>' +
        selRow('venue', 'Escenario', ck, cb ? 'En la arena' : 'En pista cubierta', 0) +
        selRow('map', 'Sede', vn, 'Donde se juega', 2) +
        selRow('bo', 'Partido', c.bo === 3 ? 'Mejor de 3' : '1 set', c.bo === 3 ? (cb ? 'Sets a 21; el tercero, a 15' : 'Gana quien gane 2 sets') : 'Un solo set', 1) +
        (cb ? '' : selRow('pts', 'Puntos', String(c.pts), 'Puntos por set', 3)) +
        selRow('net', 'Conexión', fl ? 'Fluida (v2)' : 'Precisa (v1)', fl ? 'Tu lado, sin retraso' : 'Los dos veis lo mismo', 2) +
        selRow('even', 'Igualado', c.even ? 'Sí' : 'No', c.even ? 'Nadie lleva atributos ni insignias' : 'Cada persona, con los de su jugador', 0) + '</div>' +
        '<p class="mk-tip">' + (fl ? 'Tu equipo responde al instante y el rival se ve una pizca en diferido. Sin repeticiones en esta versión.'
          : c.even ? 'Igualado: nadie lleva atributos ni insignias.' : 'Cada persona juega con los atributos de su jugador.') + '</p></div>' +
        '<div class="ol-bar ol-bar2 mk-go" data-nav><button class="ol-act ol-new sp-patch" data-a="open"' + (L.busy ? ' disabled' : '') + '><span class="sp-l"><span class="sp-t">Abrir sala</span>' +
        '<small class="sp-s">' + esc(ck + (vn && vn !== ck ? ', ' + vn : '')) + '</small></span></button></div>';
    } else if (v === 'room' && L.room) {
      var r2 = L.room, host = L.role === 'host', me = myName(), riv = L.rival;
      var st = '', bad = false;
      if (L.started) st = 'Empieza el partido…';
      else if (L.status === 'wait') st = L.fail || 'Esperando rival. Tu sala sale en la lista de Online.';
      else if (L.status === 'connecting') st = 'Conectando con ' + riv + '…';
      else if (L.status === 'linked') st = 'Conectados. Empieza el partido…';
      bad = !!L.fail && L.status === 'wait';
      // (rediseño 1.5.x) El mismo rótulo que la cartelera, en grande: sede a la izquierda, tú VS rival, y el hueco «?» hasta que llega.
      var left = host ? me : riv, right = host ? (riv || '') : me;
      var pl = function (n, who, isRival, side) {
        if (!n) return '<div class="ol-p mt-side ' + side + ' wait"><small>' + who + '</small><b><span class="ol-q">?</span><span class="ol-dots" role="img" aria-label="Esperando"><i></i><i></i><i></i></span></b></div>';
        return '<div class="ol-p mt-side ' + side + (isRival ? ' riv' : '') + '"><small>' + who + (isRival ? ' <span class="ar" aria-hidden="true">▼</span>' : '') + '</small><b>' + esc(n) + '</b></div>';
      };
      var b2 = r2.venue === 'beach', vn2 = venueName(r2), k2 = b2 ? 'Playa' : 'Pabellón';
      h = '<div class="ol-match sp-panel ' + (b2 ? 'v-beach' : 'v-hall') + (riv ? ' has-riv' : '') + '">' +
        '<div class="mt-top"><span class="sp-crest" aria-hidden="true">' + VEN_IC[b2 ? 'beach' : 'hall'] + '</span><span class="mt-ven"><b>' + k2 + '</b>' + (vn2 && vn2 !== k2 ? '<small>' + esc(vn2) + '</small>' : '') + '</span>' +
        '<span class="mt-who">' + (host ? 'Tu sala' : 'Sala de ' + esc(r2.name)) + '</span>' +
        '<span class="ol-code sp-chip" aria-label="Código ' + esc(r2.code.split('').join(' ')) + '">' + esc(r2.code) + '</span></div>' +
        '<div class="ol-vs">' + pl(left, host ? 'Tú' : 'Rival', !host, 'mt-a') + '<span class="ol-mid">VS</span>' + pl(right, host ? 'Rival' : 'Tú', host && !!riv, 'mt-b') + '</div>' +
        '<div class="fx-chips mt-chips">' + chipsHTML(r2) + '</div>' +
        '<p class="ol-st' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' +
        (L.started ? '' : '<p class="ol-tip">Llevas a tu n.º 1 y la IA a tu pareja. No hay pausa durante el juego: entre sets, 10 s de descanso. Abandonar cuenta como derrota.</p>') + '</div>' +
        '<div class="ol-bar ol-bar2" data-nav>' + (host ? '<button class="ol-act sp-btn sp-teal" data-shape="0" data-a="copy">' + ic('copy') + '<span class="sp-t">Copiar código</span></button>' : '') +
        '<button class="ol-act ol-out sp-btn sp-danger" data-shape="1" data-a="leave">' + ic('out') + '<span class="sp-t">Salir de la sala</span></button></div>';
    }
    return h;
  }
  var lastH = '';
  function render(force) {
    if (!L.host || !L.on) return;
    var body = L.host.querySelector('.ol-body'); if (!body) return;
    var PH = ph(), hr = L.host.querySelector('.ol-hr'), h = PH ? viewPH() : viewHTML(), hh = PH ? headHTML() : '', all = h + '\u0002' + hh;
    // (móvil: el aviso, una vez, al carril de arriba; la misma frase no se repite hasta que se borra)
    if (PH && L.msg && L.msg !== L.toasted && VB.Splat && VB.Splat.toast) { try { L.toastApi = VB.Splat.toast(esc(L.msg), { key: 'ol', ms: 6500, cls: L.msgBad ? 'ol-tbad' : '' }); } catch (e) { } }
    if (!L.msg && L.toastApi) { L.toastApi.close(); L.toastApi = null; }   // (aviso resuelto o vista nueva: fuera)
    L.toasted = L.msg;
    if (!force && all === lastH) return;
    var a = document.activeElement, inH = a && (body.contains(a) || (hr && hr.contains(a))), key = inH ? keyOf(a) : null, kf = a && a.classList && a.classList.contains('kf');
    lastH = all; body.innerHTML = h; body.setAttribute('data-v', L.view);
    if (hr && hr.innerHTML !== hh) hr.innerHTML = hh;
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(body); if (hr) VB.Splat.decorate(hr); } catch (e) { } }   // (SPLAT: manchas, brochazos y parche)
    if (PH && VB.Splat && VB.Splat.more) { var sc = body.querySelectorAll('.ol-scroll'); for (var i = 0; i < sc.length; i++) { try { VB.Splat.more(sc[i]); } catch (e) { } } }
    var inp = body.querySelector('#olIn');
    if (inp) { bindInput(inp); setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 20); return; }
    if (key) { var b = findKey(L.host, key) || first(); if (b) { try { b.focus({ preventScroll: !kf }); } catch (e) { } if (kf) b.classList.add('kf'); } }
  }
  function keyOf(b) { if (b.getAttribute('data-a') === 'osk') return 'oskp|' + b.getAttribute('data-r') + '|' + b.getAttribute('data-i'); return b.getAttribute('data-a') ? b.getAttribute('data-a') + '|' + (b.getAttribute('data-id') || '') : b.getAttribute('data-ol') ? 'ol|' + b.getAttribute('data-ol') : null; }
  function findKey(body, k) {
    var p = k.split('|'), sel = p[0] === 'oskp' ? '.osk-k[data-r="' + p[1] + '"][data-i="' + p[2] + '"]' : p[0] === 'ol' ? '[data-ol="' + p[1] + '"]' : '[data-a="' + p[0] + '"]' + (p[1] ? '[data-id="' + p[1] + '"]' : '');
    var b = body.querySelector(sel); return b && !b.disabled ? b : null;
  }
  function first() { var b = L.host && L.host.querySelector('.ol-body button:not([disabled])'); return b || null; }
  function bindInput(inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') return;   // (navegación del menú)
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
      else if (e.key === 'Escape') { e.preventDefault(); var k = L.edit; L.edit = ''; L.osk = null; render(true); focusA(k); }
    });
  }
  function commitEdit() {
    var inp = L.host && L.host.querySelector('#olIn'), v = inp ? inp.value : L.osk ? L.osk.v : '', k = L.edit;
    L.osk = null;
    if (k === 'name') {
      var n = NR().cleanName(v);
      if (!n) { L.msg = 'El nombre tiene que tener entre 2 y 16 caracteres (y no puede ser un correo).'; L.msgBad = true; L.edit = ''; render(true); focusA('name'); return; }
      ls(NICK, n); L.msg = ''; L.edit = ''; render(true); focusA('name');
    } else if (k === 'code') { L.edit = ''; render(true); joinCode(v); }
  }
  function focusSel(sel, kf) {
    setTimeout(function () {
      var b = L.host && L.host.querySelector(sel); if (!b) return;
      try { b.focus(); } catch (e) { }
      if (kf) { var pv = document.querySelectorAll('.kf'); for (var j = 0; j < pv.length; j++) pv[j].classList.remove('kf'); b.classList.add('kf'); }
    }, 30);
  }
  function focusA(a) { setTimeout(function () { var b = L.host && L.host.querySelector('[data-a="' + a + '"]'); if (b) { try { b.focus(); } catch (e) { } } }, 30); }

  function step(k, d) {
    var c = L.cfg; if (!c) return;
    if (k === 'venue') c.venue = c.venue === 'beach' ? 'hall' : 'beach';
    else if (k === 'map') { var ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH, i = ms.indexOf(cur); i = (i + (d > 0 ? 1 : -1) + ms.length) % ms.length; if (c.venue === 'beach') c.mapB = ms[i]; else c.mapH = ms[i]; }
    else if (k === 'bo') c.bo = c.bo === 3 ? 1 : 3;
    else if (k === 'pts') { var PV = [11, 15, 21, 25], pi = PV.indexOf(c.pts); c.pts = PV[((pi < 0 ? 2 : pi) + (d > 0 ? 1 : -1) + PV.length) % PV.length]; }
    else if (k === 'even') c.even = !c.even;
    else if (k === 'net') c.model = c.model === 'fluida' ? 'precisa' : 'fluida';
    L.lastSel = k;   // (móvil: la fila tocada la última enseña su explicación)
    sound('optChange'); render();
  }
  function onClick(ev) {
    var t = ev.target, b = t && t.closest ? t.closest('button') : null;
    if (!b || !L.host.contains(b) || b.disabled) return;
    if (b.classList.contains('mp-back')) return;   // (ui.js)
    var olk = b.getAttribute('data-ol');
    if (olk) { var ar = t.closest('.arr'); step(olk, ar ? +ar.getAttribute('data-d') : 1); return; }
    var a = b.getAttribute('data-a'); if (!a) return;
    sound('click');
    if (a === 'acc') { if (VB.Account && VB.Account.open) VB.Account.open(); }
    else if (a === 'retry') { if (noRtc()) { setView('nortc'); return; } setView('list'); refreshList(true); }
    else if (a === 'help') { L.msg = ''; L.hpPage = 0; setView('help'); setTimeout(function () { var f = first(); if (f) f.focus(); }, 30); }
    else if (a === 'helpNext' || a === 'helpPrev') { L.hpPage = Math.max(0, Math.min(hpPages() - 1, (L.hpPage | 0) + (a === 'helpNext' ? 1 : -1))); render(true); focusA(L.hpPage >= hpPages() - 1 ? 'helpOk' : L.hpPage ? a : 'helpNext'); }
    else if (a === 'editX') { var ek = L.edit; L.edit = ''; L.osk = null; render(true); focusA(ek); }
    else if (a === 'share') shareRoom();
    else if (a === 'helpOk') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; }
    else if (a === 'new') { L.cfg = prefs(); L.msg = ''; L.lastSel = ''; setView('create'); setTimeout(function () { var f = first(); if (f) f.focus(); }, 30); }
    else if (a === 'open') createRoom();
    else if (a === 'name' || a === 'code') {
      L.edit = a; L.msg = '';
      // (con mando: teclado en pantalla, con el foco en la primera letra)
      if (padNow()) { var v0 = a === 'name' ? myName() : ''; L.osk = { v: v0, col: 0, up: !v0, auto: !v0 }; render(true); focusSel('.osk-k[data-r="1"][data-i="0"]', true); }
      else { L.osk = null; render(true); }
    }
    else if (a === 'osk') oskKey(b.getAttribute('data-id'));
    else if (a === 'nameOk' || a === 'codeOk') commitEdit();
    else if (a === 'join') joinRoom(b.getAttribute('data-id'));
    else if (a === 'refresh') refreshList(true);
    else if (a === 'leave') { leaveRoom(); L.msg = ''; setView('list'); refreshList(true); focusA('new'); }
    else if (a === 'copy') copyCode();
  }
  function copyCode() {
    var c = L.room && L.room.code; if (!c) return;
    var done = function () {
      L.fail = '';
      if (ph() && VB.Splat && VB.Splat.toast) { VB.Splat.toast('Código copiado: <b>' + esc(c) + '</b>', { key: 'olc' }); return; }   // (móvil: aviso de arriba)
      var s = L.host.querySelector('.ol-st'); if (s) s.textContent = 'Código copiado: ' + c;
    };
    try { navigator.clipboard.writeText(c).then(done, done); } catch (e) { done(); }
  }
  /** Móvil: «Compartir» de la sala de espera (la hoja de compartir del sistema con el enlace ?sala=CÓDIGO; sin ella, se copia el enlace). */
  function shareRoom() {
    var c = L.room && L.room.code; if (!c) return;
    var url = location.origin + location.pathname + '?sala=' + c, txt = 'Juega conmigo a Make the Cut: sala ' + c;
    var copied = function () { if (VB.Splat && VB.Splat.toast) VB.Splat.toast('Enlace copiado. Código <b>' + esc(c) + '</b>', { key: 'olc' }); };
    var copy = function () { try { navigator.clipboard.writeText(txt + ' ' + url).then(copied, copied); } catch (e) { copied(); } };
    if (navigator.share) { try { navigator.share({ title: 'Make the Cut', text: txt, url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') copy(); }); return; } catch (e) { } }
    copy();
  }

  /* ---------------- API para ui.js ---------------- */
  function open(host) {
    ensureCss();
    if (VB.Update) VB.Update.check(true);   // (entrar en el Online: con una versión anterior no se puede jugar con los demás)
    if (!L.host) {
      L.host = host;
      host.addEventListener('click', onClick);
      // (barra de acciones: el botón que recibe el foco —ratón, Tab— pasa a ser la parada de ↑↓ de la barra)
      host.addEventListener('focusin', function (e) {
        var b = e.target, par = b && b.parentNode;
        if (!par || !par.classList || !par.classList.contains('ol-bar') || par.classList.contains('ol-bar2') || !b.hasAttribute('data-skip')) return;
        Array.prototype.forEach.call(par.querySelectorAll('button'), function (x) { if (x !== b) x.setAttribute('data-skip', ''); });
        b.removeAttribute('data-skip'); L.barKey = b.getAttribute('data-a');
      });
      if (VB.Account && VB.Account.onChange) VB.Account.onChange(function () {
        var k = accKey(), was = L.accKey; L.accKey = k;
        if (k === was || !L.on || L.room || L.view === 'nortc') return;   // (las sincronizaciones también avisan: no echan de «Crear sala» ni cierran «Tu nombre»)
        rooms = null; L.msg = '';
        if (k && !ls(HELPK)) { L.helpFrom = 'new'; setView('help'); return; }
        setView(k ? 'list' : 'noacc'); if (k) refreshList(true);
      });
    }
    if (!host.querySelector('.ol-body')) { var d = document.createElement('div'); d.className = 'ol-body'; host.appendChild(d); }
    // (móvil: hueco a la derecha del título para tu nombre o el paso; en PC queda vacío y oculto)
    var hd = host.querySelector('.mp-head'); if (hd && !hd.querySelector('.ol-hr')) { var hr0 = document.createElement('div'); hr0.className = 'ol-hr'; hd.appendChild(hr0); }
    L.on = true; lastH = ''; L.accKey = accKey();
    if (L.started) return;
    if (noRtc()) { L.msg = ''; setView('nortc'); return; }
    if (!signedIn()) { setView('noacc'); return; }
    if (L.view !== 'room' || !L.room) {
      L.msg = L.msg || '';
      if (!ls(HELPK) && !L.pendingCode) { L.helpFrom = 'new'; setView('help'); }   // (la primera vez, «Cómo funciona» antes de la lista)
      else { setView('list'); refreshList(true); }
    }
    else render(true);
    if (L.pendingCode) { var pc = L.pendingCode; L.pendingCode = ''; joinCode(pc); }
  }
  function leave() {
    if (!L.on) return;
    L.on = false;
    if (L.toastApi) { L.toastApi.close(); L.toastApi = null; L.toasted = ''; }
    if (!L.started) { leaveRoom(); stopAll(); L.view = 'list'; L.msg = ''; }
  }
  /** Esc / B dentro del lobby: primero se cierra lo abierto (edición, crear sala, la sala) y solo luego se sale de la página. */
  function back() {
    if (!L.on) return false;
    if (L.edit) { var k = L.edit; L.edit = ''; L.osk = null; render(true); focusA(k); return true; }
    if (L.view === 'create') { L.msg = ''; setView('list'); refreshList(false); focusA('new'); return true; }
    if (L.view === 'help') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; return true; }
    if (L.view === 'room' && !L.started) { leaveRoom(); setView('list'); refreshList(true); focusA('new'); return true; }
    return false;
  }
  function side(el, d) {
    var k = el && el.getAttribute && el.getAttribute('data-ol'); if (k) { step(k, d); return true; }
    if (el && el.parentNode && el.parentNode.classList && (el.parentNode.classList.contains('ol-bar') || el.parentNode.classList.contains('osk-row'))) return rowStep(el, d);
    return false;
  }

  // Cerrar o recargar la pestaña: la sala (anfitrión) o el hueco (invitado) se liberan al momento, sin esperar a que caduquen.
  // (pagehide también salta al ir a otra página; 'persisted' = la página queda en la caché del navegador y puede volver: entonces
  // también se suelta, y al volver se está en la lista.)
  document.addEventListener('vb:ph', function () { if (L.on) render(true); });   // (girar / cambiar de tamaño: otra disposición)
  window.addEventListener('pagehide', function () {
    if (!rooms || !L.room || !L.role) return;
    // (vuelta al partido tras recargar: ver «VUELTA AL PARTIDO» abajo. Si se ha apuntado la vuelta, el invitado NO suelta su
    // hueco: con la sala aún en 'full' el PATCH de bye entraría y la sala volvería a la lista sin él. Si no vuelve, el anfitrión
    // lo ve como una desconexión normal.)
    if (!backSave()) { try { rooms.bye(L.role, L.room.id); } catch (e) { } }
    if (L.started) return;   // (en pleno partido la sesión sigue a lo suyo: para el rival es una desconexión normal)
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = ''; L.started = false; L.view = 'list';
  });

  /* ---------------- VUELTA AL PARTIDO TRAS RECARGAR (net: robustez; notes/net.md «Robustez y privacidad») ----------------
   * El INVITADO (aquí) y, desde la fase 6, también el ANFITRIÓN (ver hostBackSave / rejoinHost más abajo).
   * pagehide en pleno partido → sessionStorage BACK = {id sala, uid, gen, ep (época), rival, look, t}. Al cargar (misma pestaña,
   * misma cuenta, < BACK_MS): sala aún en 'full'/'play' con este uid de invitado → enlace nuevo, se contesta a la siguiente oferta
   * del anfitrión (su relink manda una con gen+1 cada 10 s durante ~60 s) y una sesión nueva sin opciones: el saludo trae las del
   * anfitrión y su 'ready' provoca el resync con la foto (Sim.serialize). Cabe en las reglas ya desplegadas (respuesta del invitado
   * con la sala en 'full'/'play'). La marca de partido (NetRec.resume) se hereda: si no se llega a jugar, cuenta como abandono. */
  var BACK = 'make-the-cut.online.back', BACK_MS = 50000;
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { } return null; }
  function backSave() {
    if (L.role === 'host') return hostBackSave();   // (fase 6: también el anfitrión)
    try {
      var C = ctx(), n = C && C.net, st = n && n.sess && n.sess.status;
      if (!L.started || L.role !== 'guest' || !n || n.slot !== 1 || !(st === 'playing' || st === 'waiting' || st === 'connecting' || st === 'starting')) return;
      ss(BACK, JSON.stringify({ id: L.room.id, uid: api().uid() || '', gen: L.gen | 0, ep: n.epoch | 0, rival: L.rival || n.rival || '', look: n.look && n.look.theirs || null,
        model: n.model || roomModel(L.room), t: Date.now() }));
      return !!ss(BACK);   // (sessionStorage puede fallar: entonces se suelta el hueco como siempre)
    } catch (e) { }
    return false;
  }
  function backTry() {
    var b = null; try { b = JSON.parse(ss(BACK) || 'null'); } catch (e) { b = null; }
    ss(BACK, null);   // (un solo intento)
    if (!b || typeof b.id !== 'string' || !b.uid || noRtc()) return;
    var late = !(Date.now() - (+b.t || 0) < BACK_MS);
    if (late && b.role !== 'host') return;   // (fase 6: el anfitrión fuera de plazo aún borra su sala, abajo)
    var tries = 0, wait = setInterval(function () {
      var C = ctx(), U = VB.UI;
      if (++tries > 40 || (!late && Date.now() - b.t > BACK_MS)) { clearInterval(wait); return; }
      if (!signedIn() || !C || C.state !== 'menu' || !C.actions || !C.actions.startOnline || !U || !U.menuIdle || !U.menuIdle() || L.room) return;
      clearInterval(wait);
      if (b.role === 'host') { hostBackTry(b, late); return; }
      api().get(b.id).then(function (r) {
        if (!r || api().uid() !== b.uid || r.guest !== b.uid || (r.state !== 'full' && r.state !== 'play') || r.age > NR().LIVE_MS || L.room) return;
        rejoin(r, b);
      }, function () { });
    }, 500);
  }
  /** Online V2: conexión del partido al volver (la apuntada en BACK; si no, la de la sala). */
  function backModel(r, b) { return b && (b.model === 'fluida' || b.model === 'precisa') ? b.model : roomModel(r); }
  function rejoin(r, b) {
    var C = ctx();
    try { if (VB.NetRec && VB.NetRec.resume) VB.NetRec.resume(); } catch (e) { }
    L.role = 'guest'; L.room = r; L.rival = NR().cleanName(b.rival) || r.name || 'Rival'; L.gen = b.gen | 0; L.started = true; L.status = 'play';
    var link = newLink();
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: 1, link: link, opts: null, name: myName(), rivalName: L.rival, look: { mine: myLook(), theirs: saneLook(b.look) }, model: backModel(r, b) });
    if (!ok) { matchClosed(link); return; }
    // revancha n.º k: la sesión nueva tiene que hablar en la época del anfitrión
    var ep = Math.max(0, Math.min(1e6, b.ep | 0));
    if (ep && C.net && C.net.sess) { C.net.epoch = ep; C.net.sess.epoch = ep; }
    if (C.net && C.net.sess) C.net.sess.back = true;   // (fase 6: aviso «Volviendo al partido…» mientras se conecta)
    guestListen(L.gen);
  }
  /* Fase 6 (notes/net.md «Fase 6»): vuelta del ANFITRIÓN. Su pagehide en pleno partido no borra la sala y apunta la vuelta
   * ({role 'host', id, uid, gen, ep, rival, look, guest, t}). Al volver en plazo: retoma su sala (rooms.resume: latido otra vez),
   * sesión nueva de hueco 0 SIN opciones (adopta la partida del invitado, ver js/net.js «VUELTA DEL ANFITRIÓN») y relink(): oferta
   * con gen+1 al mismo invitado cada 10 s; el invitado, que estaba en «Esperando a…», la ve (guestListen) y contesta. Fuera de
   * plazo (o la sala ya no es la de ese partido) borra su sala: el invitado se queda en «no cuenta» a los 60 s, como antes. */
  function hostBackSave() {
    try {
      var C = ctx(), n = C && C.net, s = n && n.sess, st = s && s.status;
      if (!L.started || !n || n.slot !== 0 || !L.room || !L.room.guest || !(st === 'playing' || st === 'waiting') || s.goneFlag) return false;
      ss(BACK, JSON.stringify({ role: 'host', id: L.room.id, uid: api().uid() || '', gen: L.gen | 0, ep: n.epoch | 0, rival: L.rival || n.rival || '',
        look: n.look && n.look.theirs || null, guest: L.room.guest, model: n.model || roomModel(L.room), t: Date.now() }));
      return !!ss(BACK);   // (si sessionStorage falla, la sala se borra como siempre)
    } catch (e) { }
    return false;
  }
  function hostBackTry(b, late) {
    api().resume().then(function (r) {
      if (!r || api().uid() !== b.uid || r.id !== b.id || L.room) return;
      if (late || Date.now() - b.t > BACK_MS || r.guest !== b.guest || (r.state !== 'full' && r.state !== 'play') || r.age > NR().LIVE_MS) { api().close(); return; }
      rejoinHost(r, b);
    }, function () { });
  }
  function rejoinHost(r, b) {
    var C = ctx();
    try { if (VB.NetRec && VB.NetRec.resume) VB.NetRec.resume(); } catch (e) { }
    L.role = 'host'; L.room = r; L.rival = NR().cleanName(b.rival) || NR().cleanName(r.gname) || 'Rival'; L.gen = Math.max(L.gen, b.gen | 0); L.started = true; L.status = 'play';
    every('beat', NR().BEAT_MS, hostBeat); hostBeat();
    var link = newLink();
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: 0, link: link, opts: null, name: myName(), rivalName: L.rival, look: { mine: myLook(), theirs: saneLook(b.look) }, model: backModel(r, b) });
    if (!ok) { matchClosed(link); return; }
    var ep = Math.max(0, Math.min(1e6, b.ep | 0)), n = C.net;
    if (n && n.sess) { if (ep) { n.epoch = ep; n.sess.epoch = ep; } n.sess.back = true; }
    // la revancha la siembra el anfitrión con net.base (sus opciones): se copian de la partida adoptada en cuanto llega
    var bt = setInterval(function () {
      var m = ctx() && ctx().net;
      if (!m || m !== n || !m.sess || m.sess.status === 'ended') { clearInterval(bt); return; }
      if (m.sess.opts && !m.sess.adopt) { if (!m.base) { var o = {}; for (var k in m.sess.opts) o[k] = m.sess.opts[k]; m.base = o; } clearInterval(bt); }
    }, 500);
    relink();
  }
  setTimeout(backTry, 300);

  // ?sala=CÓDIGO: abre Online y entra en esa sala en cuanto el menú está libre
  if (Q.sala && NR && VB.NetRoom) {
    var tries = 0, wait = setInterval(function () {
      var C = ctx(), U = VB.UI;
      if (++tries > 120) { clearInterval(wait); return; }
      if (!C || C.state !== 'menu' || !U || !U.menuIdle || !U.menuIdle()) return;
      clearInterval(wait);
      L.pendingCode = String(Q.sala);
      if (U.menuGo) U.menuGo('online');
    }, 500);
  }

  VB.NetLobby = {
    menuOn: function () { return MENU_ON || Q.online === '1' || !!EMU; },
    open: open, leave: leave, back: back, side: side, focus: first,
    myName: myName, myStats: myStats, myLook: myLook, saneLook: saneLook, _ver: ver,   // (_ver: pruebas, la versión de sala que publica)
    _state: function () { return { view: L.view, role: L.role, rival: L.rival, status: L.status, started: L.started, rooms: L.rooms.map(function (r) { return { id: r.id, name: r.name, other: r.other }; }), room: L.room && { id: L.room.id, code: L.room.code, state: L.room.state }, link: L.link && L.link.state, linkInfo: L.link && L.link.info(), msg: L.msg, fail: L.fail, emu: EMU }; },
    _link: function () { return L.link; },
    // capturas con ?olmock: pinta un estado suelto (o = campos de L: msg, msgBad, listErr, status, rival, fail, view…; rival: '<nombre>'
    // llega un rival a tu sala de mentira). Sin ?olmock no hace nada.
    _mock: function (o) {
      if (!MOCK || !o) return false;
      if (o.arrive && rooms && rooms._rival) { rooms._rival(o.arrive); delete o.arrive; }
      var v = o.view; delete o.view;
      for (var k in o) L[k] = o[k];
      if (v) setView(v); else render(true);
      return true;
    }
  };
})();
