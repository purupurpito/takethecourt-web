/* MAKE THE CUT — js/account.js (owner: ui_main)
 * Cuentas para guardar el progreso en la nube (Firebase, proyecto make-the-cut-vb; diseño en notes/cuentas.md).
 *  - Tres formas de entrar (15-nov-2026): correo y contraseña (se puede recuperar la contraseña), usuario y contraseña (correo ficticio
 *    <usuario>@cuentas.make-the-cut.invalid, las cuentas de antes) y Google. Correo y usuario van por REST, sin librerías; Google carga
 *    el SDK de Firebase Auth (gstatic) SOLO al pulsar el botón, saca el uid y el refresh token y la sesión sigue por REST como las demás.
 *    Requisitos de Google (consola de Firebase, los pone Ferran): proveedor Google activado y purupurpito.github.io en dominios autorizados.
 *  - Se sincronizan cuatro guardados del navegador: escuadrón ('make-the-cut.squad'), Carrera ('make-the-cut.career'), ajustes
 *    ('make-the-cut.settings') y récord ('make-the-cut.record'). Cada uno es un documento users/{uid}/saves/{squad|career|settings|record}
 *    = {data: JSON en texto, updatedAt: ms, v: 1}. Sin cifrar (lo eligió Ferran); las reglas solo dejan leer y escribir al dueño.
 *  - No toca el resto del juego: escucha las escrituras de esas claves en localStorage (envuelve Storage.setItem/removeItem),
 *    apunta la hora y sube el cambio a los ~1,5 s (y al ocultar la pestaña). Sin cuenta o sin red, todo sigue en local.
 *  - Al entrar se une lo del dispositivo con lo de la cuenta: gana lo más reciente; si las dos Carreras son distintas, se pregunta.
 *    Si llega algo de la cuenta, la página se recarga para que el juego lo lea.
 *  - 'make-the-cut.gym' (Entrenamiento) se une por máximo (mergeGym); se sincroniza desde el 12-nov-2026 (GYM_SYNC = true).
 *  - 'make-the-cut.look' (Vestuario, js/look.js) tiene su fusión escrita (mergeLook: une lo ganado y lo visto con VB.Look.mergeRaw y toma
 *    los looks del lado más reciente); se sincroniza desde el 15-nov-2026 (LOOK_SYNC = true).
 *  - S4 (T13): 'make-the-cut.profile', 'make-the-cut.career6', 'make-the-cut.career.mode', 'make-the-cut.legends' y 'make-the-cut.retos' tienen su fusión
 *    (MERGE: perfil y retos con su mergeRaw, Salón de la Fama por unión; Carrera de pista y modo, gana lo más reciente) pero NO se
 *    sincronizan hasta S4_SYNC = true (antes, Ferran despliega firebase/firestore.rules). Hasta entonces, TRACK (solo la hora).
 *  - Conflictos en cola (Carrera y Carrera de pista, la primera vez); antes de pisar una Carrera local, copia en '<clave>.prev'.
 *  - Las bajadas solo se aplican en el menú (fuera, quedan pendientes hasta VB.Account.menuReady()); tras la primera recarga de la
 *    pestaña, las claves con caché llaman a su gancho (Prog._reload, Career.beach/hall._reset) y VB.UI.refreshMenu.
 *  - Tope de subida 390 000 caracteres (las reglas admiten 400 000): lo que pase no se sube hasta su siguiente cambio.
 *  - Panel propio (#account) que se abre con el botón «Cuenta» del menú principal (#btnAcc, lo crea este módulo).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var FB = { key: 'AIzaSyC59o9QtpUvjWT4g3ouOXinghASTuXZSes', project: 'make-the-cut-vb', mail: '@cuentas.make-the-cut.invalid',
    authDomain: 'make-the-cut-vb.firebaseapp.com', sdk: 'https://www.gstatic.com/firebasejs/10.12.5/' };
  var FS = 'https://firestore.googleapis.com/v1/projects/' + FB.project + '/databases/(default)/documents/';
  var SES = 'make-the-cut.account', META = 'make-the-cut.account.meta';
  var DOCS = { 'make-the-cut.squad': 'squad', 'make-the-cut.career': 'career', 'make-the-cut.settings': 'settings', 'make-the-cut.record': 'record' };
  // Entrenamiento (E6, js/gym.js): 'make-the-cut.gym' se sincronizará como users/{uid}/saves/gym, uniendo por máximo (mergeGym).
  // APAGADO hasta que Ferran despliegue firebase/firestore.rules con 'gym' en la lista de key: antes, cada subida daría 403.
  // Orden obligatorio: 1) desplegar reglas, 2) GYM_SYNC = true. 'make-the-cut.seen' y 'make-the-cut.device' NUNCA van a DOCS (son del dispositivo).
  var GYM_SYNC = true;   // reglas con 'gym' desplegadas el 12-nov-2026 (firebase deploy --only firestore:rules)
  if (GYM_SYNC) DOCS['make-the-cut.gym'] = 'gym';
  // Vestuario (js/look.js): 'make-the-cut.look' va a users/{uid}/saves/look con la fusión mergeLook. Con LOOK_SYNC = false volvería a TRACK
  // (solo se apunta la hora de cada escritura, para que la primera fusión sepa qué looks son los más nuevos).
  var LOOK_SYNC = true;   // reglas con 'look' desplegadas el 15-nov-2026 (firebase deploy --only firestore:rules)
  if (LOOK_SYNC) DOCS['make-the-cut.look'] = 'look';
  var TRACK = { 'make-the-cut.look': 1 };
  if (LOOK_SYNC) delete TRACK['make-the-cut.look'];
  // S4 (D2/D4, T13): perfil, Carrera de pista, modo de Carrera, Salón de la Fama y retos. APAGADO hasta que Ferran despliegue
  // firebase/firestore.rules (ya tiene las 11 claves). Orden obligatorio: 1) desplegar reglas, 2) S4_SYNC = true (y LOOK_SYNC).
  // Mientras tanto van a TRACK: se apunta la hora de cada escritura sin subir, para que la primera fusión sepa qué es más nuevo.
  // NUNCA van a DOCS ni a TRACK: '<clave>.bak', 'make-the-cut.career.prev', 'make-the-cut.career6.prev', 'make-the-cut.devid', 'make-the-cut.retostab'.
  var S4_SYNC = false;
  var S4_DOCS = { 'make-the-cut.profile': 'profile', 'make-the-cut.career6': 'career6', 'make-the-cut.career.mode': 'cmode', 'make-the-cut.legends': 'legends', 'make-the-cut.retos': 'retos' };
  Object.keys(S4_DOCS).forEach(function (k) { if (S4_SYNC) DOCS[k] = S4_DOCS[k]; else TRACK[k] = 1; });
  // Carreras: la primera vez en un dispositivo, si la local y la de la cuenta son distintas, se pregunta (en cola, una tras otra).
  var CONFLICT = { 'make-the-cut.career': 'Carrera', 'make-the-cut.career6': 'Carrera de pista' };
  var MAX_RAW = 390000;   // tope de subida (las reglas admiten 400 000 caracteres)
  var LS = null; try { LS = window.localStorage; } catch (e) { }
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;

  function jget(k) { try { return JSON.parse(LS.getItem(k) || 'null'); } catch (e) { return null; } }
  function jset(k, v) { try { if (v == null) rawRemove.call(LS, k); else rawSet.call(LS, k, JSON.stringify(v)); } catch (e) { } }
  var acc = jget(SES); if (acc && !(acc.uid && acc.rt && acc.user)) acc = null;
  var meta = jget(META) || {};          // {clave: ms de la última escritura local}
  var synced = jget(META + '.up') || {}; // {clave: ms subido a la cuenta}
  var applying = false, dirty = {}, pushT = 0, lastSync = 0, status = acc ? 'idle' : 'off', lastErr = '';
  var pendingDown = false, big = {}, conflicts = [];   // big: {clave: meta de la versión demasiado grande (no se reintenta)}

  // ---------------------------------------------------------------- escuchar las escrituras del juego
  if (LS) {
    Storage.prototype.setItem = function (k, v) {
      rawSet.call(this, k, v);
      if (this === LS && !applying) { if (DOCS[k]) touch(k); else if (TRACK[k]) stamp(k); }
    };
    Storage.prototype.removeItem = function (k) {
      rawRemove.call(this, k);
      if (this === LS && !applying) { if (DOCS[k]) touch(k); else if (TRACK[k]) stamp(k); }
    };
  }
  function touch(k) { meta[k] = Date.now(); jset(META, meta); if (acc) { dirty[k] = 1; schedule(); } }
  function stamp(k) { meta[k] = Date.now(); jset(META, meta); }   // solo la hora (clave que aún no se sube)
  function schedule() { clearTimeout(pushT); pushT = setTimeout(function () { push().catch(function () { }); }, 1500); }

  // ---------------------------------------------------------------- Firebase (REST)
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function req(url, opt) {
    var ac = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ac) ac.abort(); }, 15000);
    if (ac) opt.signal = ac.signal;
    return fetch(url, opt).then(function (r) { clearTimeout(t); return r; }, function () { clearTimeout(t); throw err('unavailable', 'sin conexión'); });
  }
  function idt(path, body) {
    return req('https://identitytoolkit.googleapis.com/v1/' + path + '?key=' + FB.key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var m = String(j.error && j.error.message || ''); throw err(r.status >= 500 || r.status === 429 ? 'unavailable' : m.split(/[ :]/)[0] || 'error', m); }
          return j;
        });
      });
  }
  function token() {
    if (!acc) return Promise.reject(err('unauthenticated'));
    if (acc.it && acc.ie > Date.now() + 60e3) return Promise.resolve(acc.it);
    return req('https://securetoken.googleapis.com/v1/token?key=' + FB.key, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(acc.rt) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var m = String(j.error && j.error.message || '');
            if (r.status === 400 && /TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN/.test(m)) { lost(); throw err('unauthenticated'); }
            throw err('unavailable', m);
          }
          acc.it = j.id_token; acc.rt = j.refresh_token || acc.rt; acc.ie = Date.now() + (+j.expires_in || 3600) * 1000; jset(SES, acc);
          return acc.it;
        });
      });
  }
  function fs(method, path, body, keep) {
    return token().then(function (t) {
      var o = { method: method, headers: { Authorization: 'Bearer ' + t } };
      if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
      if (keep) o.keepalive = true;
      return req(FS + path, o);
    }).then(function (r) {
      if (r.status === 404) return null;
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw err(r.status === 403 ? 'permission_denied' : r.status === 401 ? 'unauthenticated' : r.status >= 500 || r.status === 429 ? 'unavailable' : 'error', j.error && j.error.message);
        return j;
      });
    });
  }
  function docPath(name) { return 'users/' + acc.uid + '/saves/' + name; }
  function readAll() {
    return fs('GET', 'users/' + acc.uid + '/saves?pageSize=50').then(function (j) {
      var out = {};
      ((j && j.documents) || []).forEach(function (d) {
        var f = d.fields || {}, name = d.name.split('/').pop();
        out[name] = { data: f.data ? f.data.stringValue : null, at: f.updatedAt ? +(f.updatedAt.integerValue || f.updatedAt.doubleValue || 0) : 0 };
      });
      return out;
    });
  }
  function writeDoc(k, keep) {
    var at = meta[k] || Date.now(), raw = null;
    try { raw = LS.getItem(k); } catch (e) { }
    if (raw != null && raw.length > MAX_RAW) { big[k] = at; return Promise.reject(err('too_big')); }   // las reglas lo rechazarían
    var body ={ fields: { data: { stringValue: raw == null ? 'null' : raw }, updatedAt: { integerValue: String(at) }, v: { integerValue: '1' } } };
    return fs('PATCH', docPath(DOCS[k]), body, keep).then(function () { synced[k] = at; jset(META + '.up', synced); });
  }
  function push(keep) {
    if (!acc) return Promise.resolve();
    var ks = Object.keys(dirty).filter(function (k) { return !(big[k] && big[k] === meta[k]); });   // (lo demasiado grande espera a su siguiente cambio)
    dirty = {}; if (!ks.length) return Promise.resolve();
    setStatus('busy');
    var fails = [];
    return Promise.all(ks.map(function (k) { return writeDoc(k, keep).catch(function (e) { fails.push({ k: k, e: e }); }); })).then(function () {
      if (!fails.length) { lastSync = Date.now(); setStatus('idle'); return; }
      var e0 = null;
      fails.forEach(function (f) { if (f.e && f.e.code === 'too_big') { if (!e0) e0 = f.e; } else { dirty[f.k] = 1; e0 = f.e; } });   // too_big: fuera de dirty
      setStatus('error', e0);   // (unavailable: se reintenta al volver la red)
    });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') push(true); else if (acc) syncDown(false); });
  window.addEventListener('pagehide', function () { push(true); });
  window.addEventListener('online', function () { if (acc) { markDirty(); push(); } });
  function markDirty() { for (var k in DOCS) if ((meta[k] || 0) > (synced[k] || 0)) dirty[k] = 1; }

  // ---------------------------------------------------------------- unir dispositivo y cuenta
  function score(raw) { // progreso del escuadrón para decidir sin fechas (primera vez en este dispositivo)
    try { var o = JSON.parse(raw), s = 0; (o.a || []).forEach(function (a) { s += (a.lvl || 0) * 1000 + (a.xp || 0) + (a.matches || 0); }); return s; } catch (e) { return 0; }
  }
  function apply(k, raw) {
    applying = true;
    try {
      // Carreras: antes de pisar una local que no está vacía y es distinta, copia del aparato en '<clave>.prev' (nunca sube; se
      // recupera a mano con tools/eval.js)
      if (CONFLICT[k]) { var L0 = LS.getItem(k); if (L0 != null && L0 !== 'null' && L0 !== raw) rawSet.call(LS, k + '.prev', L0); }
      if (raw == null || raw === 'null') rawRemove.call(LS, k); else rawSet.call(LS, k, raw);
    } catch (e) { }
    applying = false;
  }
  // Fusiones propias (lo que no es «gana lo más reciente»). Firma (L, R, remoteNewer) → texto (L tal cual si no cambia nada).
  function modMerge(n) {
    return function (L, R, rn) {
      var M = VB[n]; if (!M || typeof M.mergeRaw !== 'function') return rn ? R : L;
      try { var o = M.mergeRaw(L, R, rn); return typeof o === 'string' ? o : (rn ? R : L); } catch (e) { return rn ? R : L; }
    };
  }
  var MERGE = { 'make-the-cut.gym': mergeGym, 'make-the-cut.look': mergeLook, 'make-the-cut.legends': mergeLegends,
    'make-the-cut.profile': modMerge('Profile'), 'make-the-cut.retos': modMerge('Retos') };
  /** Une lo local con lo remoto. first: primera entrada en este dispositivo (sin fechas fiables). Devuelve {changed, keys (claves
   *  cambiadas en local), conflicts:[{k, remote, local, at}], conflict (el primero o null)}. Los conflictos también quedan en la
   *  cola del módulo (los resuelve act('keepRemote'|'keepLocal') uno a uno). */
  function merge(remote, first) {
    var changed = false, keys = [], found = [];
    Object.keys(DOCS).forEach(function (k) {
      var name = DOCS[k], R = remote[name], L = null; try { L = LS.getItem(k); } catch (e) { }
      var Lt = meta[k] || 0;
      var put = function (raw) { apply(k, raw); changed = true; if (keys.indexOf(k) < 0) keys.push(k); };
      if (!R) { if (L != null) dirty[k] = 1; return; }
      var Rd = R.data === 'null' ? null : R.data;
      if (Rd === L) { synced[k] = R.at; return; }
      if (L == null) { put(Rd); meta[k] = R.at; synced[k] = R.at; return; }
      if (Rd == null) { if (first || Lt > R.at) dirty[k] = 1; else { put(null); meta[k] = R.at; } return; }
      if (CONFLICT[k] && first) { found.push({ k: k, remote: Rd, local: L, at: R.at }); return; }
      if (MERGE[k]) {   // gym por máximo, look y retos por unión, perfil conmutativo, Salón de la Fama por unión (top 20)
        var Mx = MERGE[k](L, Rd, first || R.at > Lt);
        if (Mx !== L) put(Mx);
        meta[k] = Math.max(Lt, R.at); synced[k] = R.at;
        if (Mx !== Rd) dirty[k] = 1;
        return;
      }
      var remoteWins = first ? (k === 'make-the-cut.squad' ? score(Rd) >= score(L) : k !== 'make-the-cut.record' || recPlayed(Rd) >= recPlayed(L)) : R.at > Lt;
      if (remoteWins) { put(Rd); meta[k] = R.at; synced[k] = R.at; } else dirty[k] = 1;
    });
    jset(META, meta); jset(META + '.up', synced);
    found.forEach(function (c) { conflicts = conflicts.filter(function (x) { return x.k !== c.k; }); conflicts.push(c); });
    return { changed: changed, keys: keys, conflicts: found, conflict: found[0] || null };
  }
  /** Une dos Salones de la Fama ('make-the-cut.legends', [rec ≤ 20]) por la clave name|num|date; orden por score de mayor a menor, las
   *  20 primeras. Devuelve el local tal cual si no cambia nada. */
  function mergeLegends(Lraw, Rraw) {
    function p(r) { try { var a = JSON.parse(r); return Array.isArray(a) ? a.filter(function (x) { return x && typeof x === 'object'; }) : null; } catch (e) { return null; } }
    var A = p(Lraw), B = p(Rraw);
    if (!B) return Lraw != null ? Lraw : Rraw;
    if (!A) return Rraw;
    var by = {}, out = [], added = false;
    A.concat(B).forEach(function (r, i) { var id = String(r.name) + '|' + String(r.num) + '|' + String(r.date); if (!by[id]) { by[id] = 1; out.push(r); if (i >= A.length) added = true; } });
    if (!added && A.length <= 20) return Lraw;   // el remoto no trae nada nuevo
    out.sort(function (a, b) {
      var d = (+b.score || 0) - (+a.score || 0); if (d) return d;
      var ka = String(a.name) + '|' + String(a.num) + '|' + String(a.date), kb = String(b.name) + '|' + String(b.num) + '|' + String(b.date);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    out = out.slice(0, 20);
    var txt = JSON.stringify(out);
    return txt === JSON.stringify(A) ? Lraw : txt;
  }
  /** Une dos guardados de 'make-the-cut.gym' (texto JSON) por máximo: por ejercicio b (récord, con su fecha t), m (medalla),
   *  n (intentos) y xp (nivel ya cobrado); free.rally. Devuelve texto JSON (el local tal cual si no cambia nada). */
  function mergeGym(Lraw, Rraw) {
    function p(r) { try { var o = JSON.parse(r); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function n(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }
    var A = p(Lraw), B = p(Rraw), out = { v: Math.max(n(A.v), n(B.v), 1), d: {}, free: { rally: 0 }, xp: {} };
    var Ad = A.d || {}, Bd = B.d || {}, Ax = A.xp || {}, Bx = B.xp || {};
    ['serve', 'recv', 'set', 'atk', 'block'].forEach(function (id) {
      var a = Ad[id], b = Bd[id];
      if (a || b) {
        a = a || {}; b = b || {};
        var ab = n(a.b), bb = n(b.b);
        out.d[id] = { b: Math.max(ab, bb), m: Math.max(n(a.m), n(b.m)), n: Math.max(n(a.n), n(b.n)),
          t: ab > bb ? n(a.t) : bb > ab ? n(b.t) : Math.min(n(a.t) || n(b.t), n(b.t) || n(a.t)) };
      }
      var x = Math.max(n(Ax[id]), n(Bx[id])); if (x) out.xp[id] = x;
    });
    out.free.rally = Math.max(n(A.free && A.free.rally), n(B.free && B.free.rally));
    var txt = JSON.stringify(out);
    return Lraw != null && txt === JSON.stringify(p(Lraw)) ? Lraw : txt;
  }
  /** Une dos guardados de 'make-the-cut.look' (texto JSON {v, fits, own, seen}). own y seen: unión con VB.Look.mergeRaw (gana la t mínima);
   *  fits: los del lado más reciente por la hora de meta (remoteNewer), los dé como los dé mergeRaw. Sin js/look.js (o con un mergeRaw
   *  que falla) gana entero el más reciente. Devuelve texto JSON (el local tal cual si no cambia nada). look.js sanea al cargar.
   *  Entre versiones (1.18, plan del Vestuario §3.4): si los dos lados traen ft (hora de la última EDICIÓN de los fits), mandan los fits
   *  de la edición más reciente, y con la misma ft se quedan los locales. Un cliente viejo que reescribe el guardado sin editar (al ganar
   *  un objeto: grant, markSeen) no cambia ft pero sí pierde lo que no conoce (un peinado nuevo vuelve al tupé); con la hora de meta,
   *  esa escritura pisaba los fits buenos de los demás dispositivos. Sin ft en algún lado, la hora de meta como siempre. */
  function mergeLook(Lraw, Rraw, remoteNewer) {
    function p(r) { try { var o = JSON.parse(r); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } }
    var A = p(Lraw), B = p(Rraw);
    if (!B) return Lraw != null ? Lraw : Rraw;
    if (!A) return Rraw;
    var out = null, Lk = VB.Look;
    if (Lk && typeof Lk.mergeRaw === 'function') { try { out = p(Lk.mergeRaw(Lraw, Rraw)); } catch (e) { out = null; } }
    if (!out) return remoteNewer ? Rraw : Lraw;
    // un lado de una versión del guardado más nueva (v > V): mergeRaw ya dio ENTERO el de mayor v y aquí no se le mezclan los fits
    // del otro lado (los de una v vieja dentro de un guardado v nuevo se leerían mal allí)
    var V = typeof Lk.V === 'number' ? Lk.V : 1;
    if ((typeof A.v === 'number' && A.v > V) || (typeof B.v === 'number' && B.v > V)) return JSON.stringify(out) === JSON.stringify(A) ? Lraw : JSON.stringify(out);
    var src = remoteNewer ? B : A, fa = +A.ft > 0 ? +A.ft : 0, fb = +B.ft > 0 ? +B.ft : 0;
    if (fa && fb) src = fb > fa ? B : A;
    if (Array.isArray(src.fits)) { out.fits = src.fits; if (fa && fb) out.ft = Math.max(fa, fb); }
    var txt = JSON.stringify(out);
    return txt === JSON.stringify(A) ? Lraw : txt;
  }
  function recPlayed(raw) { try { return +(JSON.parse(raw).played) || 0; } catch (e) { return 0; } }
  function reloadSoon(msg) {
    try { sessionStorage.setItem('make-the-cut.account.toast', msg); } catch (e) { }
    setTimeout(function () { location.reload(); }, 350);
  }
  function inMenu() { var c = VB.ctx; return !c || !c.state || c.state === 'menu'; }
  /** Al abrir el juego (y al volver a la pestaña) con sesión: baja lo que haya cambiado en otro dispositivo. Solo en el menú: en un
   *  partido (o en cualquier otro estado) se deja pendiente y la lanza menuReady() (si no, los módulos con caché seguirían con lo
   *  viejo y su siguiente save() pisaría lo que llegó). */
  function syncDown(atBoot) {
    if (!acc) return Promise.resolve();
    if (!inMenu()) { pendingDown = true; return Promise.resolve(); }
    pendingDown = false;
    setStatus('busy');
    return readAll().then(function (remote) {
      var r = merge(remote, false);
      lastSync = Date.now(); setStatus('idle'); push();
      if (r.changed) afterDown(r.keys);
    }, function (e) { setStatus('error', e); });
  }
  // Ganchos de las claves con caché en memoria (tras la primera recarga de la pestaña se llaman en vez de recargar otra vez).
  var HOOKS = {
    'make-the-cut.squad': function () { if (VB.Prog && VB.Prog._reload) VB.Prog._reload(); },
    'make-the-cut.career': function () { var b = VB.Career && VB.Career.beach; if (b && b._reset) b._reset(); },
    'make-the-cut.career6': function () { var h = VB.Career && VB.Career.hall; if (h && h._reset) h._reset(); }
    // gym, look, profile y retos leen el texto cada vez (o cachean por el texto): no necesitan gancho
  };
  function afterDown(keys) {
    keys = keys || [];
    if (!reloadedOnce()) { reloadSoon('Progreso actualizado desde tu cuenta'); return 'reload'; }
    if (keys.indexOf('make-the-cut.settings') >= 0 && reloadCount() < 3) { reloadSoon('Ajustes actualizados desde tu cuenta'); return 'reload'; }
    keys.forEach(function (k) { if (HOOKS[k]) { try { HOOKS[k](); } catch (e) { } } });
    try { if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu(); } catch (e) { }
    return 'hooks';
  }
  function reloadedOnce() { try { if (sessionStorage.getItem('make-the-cut.account.rl')) return true; sessionStorage.setItem('make-the-cut.account.rl', '1'); } catch (e) { } return false; }
  function reloadCount() {   // recargas por ajustes en esta pestaña (tope, para que nunca haya bucle)
    var n = 0; try { n = +sessionStorage.getItem('make-the-cut.account.rls') || 0; sessionStorage.setItem('make-the-cut.account.rls', String(n + 1)); } catch (e) { n = 9; }
    return n;
  }
  /** Lo llama ui.js al entrar en el menú: lanza la bajada que quedó pendiente durante un partido. */
  function menuReady() { if (pendingDown && acc && inMenu()) return syncDown(false); return Promise.resolve(); }

  // ---------------------------------------------------------------- entrar, crear, salir, borrar
  function normUser(u) { return String(u || '').trim().toLowerCase(); }
  function userOk(u) { return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(u); }
  function isMail(u) { return u.indexOf('@') >= 0; }
  function mailOk(u) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(u) && u.length <= 120; }
  /** user: un correo de verdad (si lleva @) o un usuario (las cuentas de antes: correo ficticio). */
  function enter(user, pass, create) {
    user = normUser(user);
    var mail = isMail(user);
    if (mail ? !mailOk(user) : !userOk(user)) return Promise.reject(err(mail ? 'INVALID_EMAIL' : 'bad_user'));
    if (String(pass || '').length < 6) return Promise.reject(err('WEAK_PASSWORD'));
    return idt(create ? 'accounts:signUp' : 'accounts:signInWithPassword', { email: mail ? user : user + FB.mail, password: pass, returnSecureToken: true })
      .then(function (j) { return begin({ user: user, kind: mail ? 'mail' : 'user', uid: j.localId, rt: j.refreshToken, it: j.idToken, exp: j.expiresIn }); });
  }
  /** Sesión nueva (cualquier forma de entrar): guarda los tokens, une lo del dispositivo con lo de la cuenta y sube. */
  function begin(o) {
    acc = { user: o.user, kind: o.kind, uid: o.uid, rt: o.rt, it: o.it, ie: Date.now() + (+o.exp || 3600) * 1000 };
    jset(SES, acc); synced = {}; jset(META + '.up', synced); conflicts = [];
    return readAll().then(function (remote) {
      var r = merge(remote, true);
      return push().then(function () { lastSync = Date.now(); setStatus('idle'); return r; });
    });
  }
  /** Correo para cambiar la contraseña (solo cuentas con correo de verdad). Firebase no dice si el correo existe. */
  function resetPass(mail) {
    mail = normUser(mail);
    if (!isMail(mail) || !mailOk(mail)) return Promise.reject(err('need_mail'));
    return idt('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: mail });
  }
  // ---- Google: SDK de Firebase Auth (compat) cargado a demanda (y precargado al abrir el panel sin sesión) y SIEMPRE en ventana emergente.
  // Sin redirección (19-nov-2026): con authDomain en firebaseapp.com y la página en github.io, el almacenamiento particionado de Safari
  // 16.1+ y Firefox deja getRedirectResult vacío y no se entraba sin ver ningún error. Si el navegador bloquea la ventana (se abrió tras
  // esperar al SDK y ya no cuenta como toque), el panel pide confirmación («Abrir Google») y ese toque nuevo abre la ventana al momento.
  var GREDIR = 'make-the-cut.account.gredir', sdkP = null, sdkFb = null;
  function loadSdk() {
    if (sdkP) return sdkP;
    function add(f) { return new Promise(function (ok, ko) { var sc = document.createElement('script'); sc.src = FB.sdk + f; sc.async = false; sc.onload = ok; sc.onerror = function () { ko(err('unavailable')); }; document.head.appendChild(sc); }); }
    sdkP = add('firebase-app-compat.js').then(function () { return add('firebase-auth-compat.js'); }).then(function () {
      var fb = window.firebase; if (!fb || !fb.auth) throw err('unavailable');
      if (!fb.apps.length) fb.initializeApp({ apiKey: FB.key, authDomain: FB.authDomain, projectId: FB.project });
      try { fb.auth(); } catch (e) { }   // (crea ya la instancia: en Safari y móvil prepara la ventana antes del toque)
      sdkFb = fb; return fb;
    });
    sdkP.catch(function () { sdkP = null; });
    return sdkP;
  }
  /** Precarga del SDK (al abrir el panel sin sesión): así el primer toque en «Entrar con Google» ya abre la ventana directamente. */
  function gWarm() { if (!sdkFb && !acc) loadSdk().catch(function () { }); }
  function gFinish(cred) {
    var u = cred && cred.user; if (!u) throw err('g_cancel');
    return u.getIdTokenResult().then(function (t) {
      var o = { user: normUser(u.email || u.displayName || 'google'), kind: 'google', uid: u.uid, rt: u.refreshToken, it: t.token,
        exp: Math.max(60, (Date.parse(t.expirationTime) - Date.now()) / 1000 | 0) };
      // la sesión sigue por REST con el refresh token: el SDK se cierra (signOut en el cliente no revoca el token)
      try { window.firebase.auth().signOut(); } catch (e) { }
      return begin(o);
    });
  }
  function gErr(e) {
    var c = String(e && e.code || '');
    if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(c)) return err('g_cancel');
    if (/operation-not-allowed|configuration-not-found/.test(c)) return err('g_off');
    if (/unauthorized-domain/.test(c)) return err('g_domain');
    if (/network-request-failed/.test(c)) return err('unavailable');
    if (/operation-not-supported-in-this-environment|web-storage-unsupported/.test(c)) return err('g_env');
    if (/account-exists-with-different-credential/.test(c)) return err('g_exists');
    return e && e.code && !/^auth\//.test(c) ? e : err('error', c);
  }
  /** signInWithPopup llamado en el acto (sin await ni promesas antes): dentro de un toque, el navegador deja abrir la ventana.
   *  Ventana bloqueada: la primera vez g_confirm (el panel pide confirmación); tras confirmar, g_blocked (permitir ventanas emergentes). */
  function gPopup(fb, again) {
    var p;
    try { var pr = new fb.auth.GoogleAuthProvider(); pr.setCustomParameters({ prompt: 'select_account' }); p = fb.auth().signInWithPopup(pr); }
    catch (e) { p = Promise.reject(e); }
    return p.then(gFinish, function (e) {
      if (/popup-blocked|operation-not-supported-in-this-environment/.test(String(e && e.code))) throw err(again ? 'g_blocked' : 'g_confirm');
      throw gErr(e);
    });
  }
  /** Entrar con Google. Con el SDK ya cargado la ventana se abre SÍNCRONAMENTE en esta llamada (llámese desde el manejador del toque). */
  function google(again) {
    var p = sdkFb ? gPopup(sdkFb, again) : loadSdk().then(function (fb) { return gPopup(fb, again); });
    return p.catch(function (e) { throw e && /^(g_|unavailable|error|WEAK|INVALID|EMAIL)/.test(e.code) ? e : gErr(e); });
  }
  /** Restos de la vía de redirección (hasta 1.15.1): se borra el indicador y, si alguien venía de ella, se le avisa de volver a
   *  probar (ya no se carga el SDK ni se llama a getRedirectResult: en Safari y Firefox volvía vacío). */
  function gBack() {
    var f = null; try { f = sessionStorage.getItem(GREDIR); sessionStorage.removeItem(GREDIR); } catch (e) { }
    if (f && !acc) toast('No se ha completado la entrada con Google. Vuelve a probar desde «Cuenta».');
  }
  function signOut() { acc = null; dirty = {}; jset(SES, null); setStatus('off'); }
  function lost() { acc = null; jset(SES, null); setStatus('off'); toast('Se ha cerrado la sesión de tu cuenta. Vuelve a entrar desde «Cuenta».'); }
  function deleteAccount() {
    if (!acc) return Promise.resolve();
    // todos los documentos que lista la cuenta (también los de versiones más nuevas o más viejas), y además los de DOCS
    return readAll().catch(function () { return {}; }).then(function (remote) {
      var names = Object.keys(remote || {});
      Object.keys(DOCS).forEach(function (k) { if (names.indexOf(DOCS[k]) < 0) names.push(DOCS[k]); });
      return Promise.all(names.map(function (n) { return fs('DELETE', docPath(n)).catch(function () { }); }));
    })
      .then(function () { return token(); })
      .then(function (t) { return idt('accounts:delete', { idToken: t }); })
      .then(function () { signOut(); });
  }
  function errText(e) {
    var c = e && e.code || '';
    if (c === 'bad_user') return 'El usuario debe tener entre 3 y 30 letras o números (también . _ -), sin espacios. O escribe tu correo.';
    if (c === 'INVALID_EMAIL') return 'Ese correo no parece válido.';
    if (c === 'need_mail') return 'Escribe tu correo arriba y vuelve a pulsar. Las cuentas con usuario no tienen correo para recuperarla.';
    if (c === 'g_cancel') return '';
    if (c === 'g_blocked' || c === 'g_confirm') return 'Tu navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para este sitio y vuelve a probar.';
    if (c === 'g_off') return 'Entrar con Google aún no está activado. Usa tu correo de momento.';
    if (c === 'g_env') return 'Este navegador no deja entrar con Google aquí. Prueba con tu correo.';
    if (c === 'g_domain') return 'Esta página aún no puede entrar con Google. Usa tu correo de momento.';
    if (c === 'g_exists') return 'Ya hay una cuenta con ese correo. Entra con tu correo y contraseña.';
    if (c === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN') return 'Por seguridad, cierra sesión, vuelve a entrar y bórrala entonces.';
    if (c === 'WEAK_PASSWORD') return 'La contraseña debe tener al menos 6 caracteres.';
    if (c === 'EMAIL_EXISTS') return 'Ya hay una cuenta con ese correo o usuario. Si es tuya, pulsa «Entrar».';
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(c)) return 'Correo, usuario o contraseña incorrectos.';
    if (c === 'TOO_MANY_ATTEMPTS_TRY_LATER') return 'Demasiados intentos. Espera un poco y vuelve a probar.';
    if (c === 'unavailable') return 'No hay conexión. Prueba otra vez en un momento.';
    if (c === 'too_big') return 'Tu Carrera es demasiado grande para la nube';
    return 'No se ha podido completar. Prueba otra vez.';
  }

  // ---------------------------------------------------------------- estado y avisos
  var listeners = [];
  function setStatus(s, e) { status = acc ? s : 'off'; lastErr = e ? errText(e) : ''; listeners.forEach(function (f) { try { f(status); } catch (x) { } }); refreshBtn(); if (root && !root.hidden && view === 'in') render(); }
  var toastT = 0;
  function toast(msg) {
    if (phone() && VB.Splat && VB.Splat.toast) { try { VB.Splat.toast(esc(msg), { key: 'acc' }); return; } catch (e) { } }
    var t = document.getElementById('accToast');
    if (!t) { t = document.createElement('div'); t.id = 'accToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---------------------------------------------------------------- panel y botón
  // SPLAT (17-nov-2026, notes/splat.md «Cuenta»): una hoja de pegatina (.sp-panel) sobre el partido, sin velo oscuro (un tinte leve para
  // que se note que es un diálogo). Campos crema con contorno de tinta y aro dorado; pestañas en trazo de pincel; botones = manchas de
  // pintura (.sp-btn); la ✕ es una pegatina fuera de la hoja y la fila de abajo (Entrar / Hecho) se queda pegada al borde: con poco alto
  // la hoja se desplaza por dentro sin que se vayan. Teléfono apaisado bajo: dos columnas (título y Google | formulario).
  var P = ':root:not(#_):not(#_):not(#_) ', PP = ':root.ph' + P.slice(5);   // (PP: móvil, html.ph)
  function phone() { return !!(VB.Splat && VB.Splat.phone && VB.Splat.phone()); }
  var CSS = [
    '#account{position:fixed;inset:0;z-index:190;display:flex;align-items:center;justify-content:center;padding:calc(14px + var(--st,0px)) calc(14px + var(--sr,0px)) calc(14px + var(--sbm,0px)) calc(14px + var(--sl,0px));',
    'background:rgba(21,16,42,.34);font-family:var(--sp-ui,system-ui,sans-serif)}',
    '#account[hidden],#accToast[hidden]{display:none}',
    '#account .ac-wrap{position:relative;display:flex;width:min(460px,100%);max-height:100%;min-height:0}',
    '#account .ac-sheet{flex:1 1 auto;min-width:0;max-height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:18px 22px 16px;text-align:left;',
    'scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.5) transparent}',
    P + '#account .ac-sheet{border-radius:18px 24px 20px 26px/22px 18px 26px 20px;background:#1b1534}',
    '#account .ac-c1,#account .ac-c2{min-width:0}',
    P + '#account .ac-k{margin:0 0 4px}',
    P + '#account .ac-h{--sp-hs:clamp(24px,5.4vh,36px);margin:0 54px 12px 0;white-space:normal;line-height:1.02}',
    '#account p{margin:0 0 12px;font:500 14px/1.45 var(--sp-ui);color:rgba(255,244,220,.9)}',
    // pestañas Entrar | Crear cuenta (trazos de pincel)
    '#account .ac-tabs{display:flex;gap:10px;margin:2px 0 14px}',
    P + '#account .ac-tabs .sp-tab{flex:1 1 0;--sp-tbh:44px;--sp-tbs:clamp(12px,2.2vh,15px);white-space:nowrap;padding:0 8px}',
    // campos
    '#account label{display:block;margin:0 0 6px 2px;font:400 12px/1.1 var(--sp-pop);letter-spacing:.05em;text-transform:uppercase;color:var(--sp-gold)}',
    '#account input{display:block;width:100%;box-sizing:border-box;height:48px;margin:0 0 14px;padding:0 14px;border:0;border-radius:11px 14px 11px 15px/14px 11px 15px 11px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px #000;font:600 17px var(--sp-ui);outline:none;transition:box-shadow .12s}',
    'body #account .ac-sheet input:focus{outline:none;box-shadow:0 0 0 3px var(--sp-ink),0 0 0 6.5px var(--sp-gold),4px 6px 0 6.5px #000}',
    '#account .ac-warn{padding:9px 12px;border-radius:10px 13px 10px 12px;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2.5px #000,inset 6px 0 0 var(--sp-gold);font:600 13px/1.4 var(--sp-ui)}',
    '#account .ac-err{min-height:1em;margin:0 0 6px;color:#ffa3ad;font-weight:700}#account .ac-err:empty{margin:0}',
    // Google: botón blanco (marca de Google) con el contorno y la sombra de pegatina
    '#account .ac-g{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:48px;margin:0 0 12px;padding:0 14px;border:0;border-radius:12px 16px 12px 15px/15px 12px 16px 12px;',
    'background:#fff;color:#1f1f1f;box-shadow:0 0 0 3px var(--sp-ink),4px 5px 0 3px #000;font:700 16px var(--sp-ui);letter-spacing:0;text-transform:none;cursor:pointer;transition:transform .12s var(--ease)}',
    '#account .ac-g:hover{transform:translateY(-1px)}#account .ac-g:active{transform:translate(2px,3px);box-shadow:0 0 0 3px var(--sp-ink),1px 1px 0 3px #000}',
    'body #account .ac-g:focus-visible{outline:none;box-shadow:0 0 0 3px var(--sp-ink),0 0 0 6.5px var(--sp-gold),4px 6px 0 6.5px #000}',
    '#account .ac-g:disabled{opacity:.6;cursor:default}',
    '#account .ac-or{display:flex;align-items:center;gap:10px;margin:2px 0 12px;font:400 11px/1 var(--sp-pop);letter-spacing:.08em;text-transform:uppercase;color:rgba(255,244,220,.7)}',
    '#account .ac-or:before,#account .ac-or:after{content:"";flex:1;border-top:2px dashed rgba(255,244,220,.22)}',
    '#account .ac-link{display:block;min-height:44px;margin:-8px 0 0 auto;padding:0 2px;border:0;background:none;color:var(--sp-gold);font:700 13px var(--sp-ui);text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    'body #account .ac-link:focus-visible{outline:2.5px solid var(--sp-gold);outline-offset:2px;border-radius:6px}',
    // acciones: manchas de pintura; la fila de abajo, pegada al borde de la hoja
    '#account .ac-acts,#account .ac-row{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:center}',
    '#account .ac-acts{justify-content:flex-end;position:sticky;bottom:-16px;z-index:2;margin:8px -22px -16px;padding:12px 22px 16px;',
    'background:linear-gradient(rgba(27,21,52,0),#1b1534 26%)}',
    '#account .ac-row{margin:4px 0 6px}',
    P + '#account .ac-sheet .sp-btn{--sp-h:48px;--sp-fs:clamp(12px,2.2vh,15px)}',
    // ✕: pegatina redonda en la esquina, fuera de la hoja (no se va al desplazar)
    P + '#account .ac-x{position:absolute;top:-12px;right:-12px;z-index:3;--sp-h:46px;--sp-px:0;width:46px}',
    '#account .ac-x svg:not(.sp-blob){width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:3.6;stroke-linecap:round}',
    // tu cuenta: tarjeta crema con la inicial en pegatina de la equipación
    '#account .ac-user{display:flex;align-items:center;gap:12px;margin:2px 4px 14px 0;padding:10px 14px;border-radius:14px 18px 12px 16px/16px 12px 18px 14px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px #000,4px 5px 0 3px #000;transform:rotate(-.6deg)}',
    '#account .ac-av{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--sp-kit);color:var(--sp-kit-ink);text-shadow:var(--sp-kit-ts);',
    'font:400 24px var(--sp-pop);box-shadow:0 0 0 3px var(--sp-ink),2px 3px 0 3px var(--sp-ink);transform:rotate(-6deg)}',
    '#account .ac-user b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-width:100%;overflow:hidden;overflow-wrap:anywhere;font:400 clamp(15px,2.8vh,19px)/1.15 var(--sp-pop);letter-spacing:.01em;color:var(--sp-ink)}',
    '#account .ac-user small{display:block;margin-top:2px;color:rgba(21,16,42,.72);font:600 13px/1.3 var(--sp-ui)}',
    '#account .ac-user>span:last-child{min-width:0}',
    // conflicto de Carreras: dos manchas grandes
    '#account .ac-choice{display:flex;flex-direction:column;gap:14px;margin:6px 12px 10px 0}',
    P + '#account .ac-choice .sp-btn{width:100%;justify-content:flex-start;white-space:normal;--sp-h:62px;padding:6px 18px}',
    P + '#account .ac-choice .sp-s{white-space:normal}',
    // confirmación de Google: «Cancelar» a la izquierda y el botón blanco de Google, grande, a la derecha
    '#account .ac-gcw{width:min(520px,100%)}',
    P + '#account .ac-gc .ac-h{margin-right:44px}',
    '#account .ac-gc .ac-acts{flex-wrap:nowrap}',
    '#account .ac-gc .ac-l{margin-right:auto}',
    '#account .ac-gc .ac-go{flex:0 1 auto;width:auto;min-height:52px;margin:0;padding:0 22px;font-size:17px}',
    // aviso de abajo
    '#accToast{position:fixed;left:50%;bottom:calc(18px + var(--sbm,0px));transform:translateX(-50%) rotate(-1deg);z-index:195;max-width:calc(100% - 32px);box-sizing:border-box;padding:10px 16px;',
    'border-radius:12px 16px 11px 15px/15px 11px 16px 12px;background:var(--sp-cream,#fff4dc);color:var(--sp-ink,#15102a);font:700 14px/1.35 var(--sp-ui,system-ui,sans-serif);',
    'box-shadow:0 0 0 3px var(--sp-ink,#15102a),4px 5px 0 3px var(--sp-ink,#15102a);pointer-events:none}',
    '#btnAcc .ac-dot{width:9px;height:9px;border-radius:50%;background:var(--muted,#93a4b9);box-shadow:0 0 0 1.5px var(--tk,#1d1530)}',
    '#btnAcc.on .ac-dot{background:#1cc4b4}#btnAcc.busy .ac-dot{background:var(--gold,#ffd23f)}#btnAcc.err .ac-dot{background:#ff6a5a}#btnAcc:not(.on):not(.busy):not(.err) .ac-dot{display:none}',
    // poco alto: sin la frase de entrada, todo más prieto; y apaisado, dos columnas
    // poco alto sin ser el móvil apaisado (ventana baja de PC): lo de antes, solo con :root:not(.ph)
    '@media (max-height:520px){:root:not(.ph) #account .ac-intro{display:none}:root:not(.ph) #account .ac-sheet{padding:14px 18px 14px}:root:not(.ph) #account .ac-acts{margin:6px -18px -14px;padding:10px 18px 14px;bottom:-14px}',
    P + '#account .ac-h{--sp-hs:26px;margin-bottom:10px}:root:not(.ph) #account .ac-tabs{margin-bottom:10px}:root:not(.ph) #account input{height:44px;margin-bottom:10px}:root:not(.ph) #account .ac-g{min-height:44px;margin-bottom:10px}',
    ':root:not(.ph) #account .ac-warn{font-size:12px;padding:6px 10px;margin-bottom:6px}' + P + '#account .ac-sheet .sp-btn{--sp-h:44px}}',
    // — móvil (.ph) — (18-nov-2026, spec «Cuenta»): tinte del 20 %, la hoja pegada arriba. Sin sesión: UNA columna (las pestañas hacen de
    // título, Google, campos de 52 px y abajo «¿Olvidaste…?» y la principal). Con sesión: tu tarjeta a la izquierda, la frase y
    // «Sincronizar ahora» a la derecha. La ✕ fuera de la hoja, siempre dentro de la pantalla. Letra --ph-*.
    PP + '#account{align-items:flex-start;padding:var(--ph-gt) var(--ph-g) var(--ph-gb);background:rgba(21,16,42,.2)}',
    PP + '#account .ac-wrap{width:min(620px,100%);max-height:100%}',
    PP + '#account .ac-wrap.ac-two{width:min(780px,100%)}',
    PP + '#account .ac-sheet{padding:12px 16px 0;display:block}',
    PP + '#account .ac-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    PP + '#account .ac-x{top:-4px;right:-6px}',
    PP + '#account p{font-size:var(--ph-body);line-height:1.4}',
    PP + '#account .ac-tabs{margin:0 44px 10px 0;gap:10px}',
    PP + '#account .ac-tabs .sp-tab{--sp-tbh:48px;--sp-tbs:var(--ph-btn)}',
    PP + '#account .ac-g{min-height:52px;margin:0 0 8px;font-size:var(--ph-btn)}',
    PP + '#account .ac-or{margin:0 0 8px;font:700 var(--ph-cap)/1 var(--sp-ui);letter-spacing:0;text-transform:none}',
    PP + '#account label{margin:0 0 5px 2px;font-size:var(--ph-label);letter-spacing:.04em}',
    PP + '#account input{height:52px;margin:0 0 12px;font-size:18px}',
    PP + '#account .ac-hint{margin:-6px 0 12px 2px;font:600 var(--ph-label)/1.3 var(--sp-ui);color:#ffe08a}',
    PP + '#account .ac-err{font-size:var(--ph-body)}',
    PP + '#account .ac-acts{display:flex;flex-wrap:nowrap;align-items:center;justify-content:flex-end;gap:12px;margin:4px -16px 0;padding:10px 16px 12px;bottom:0}',
    PP + '#account .ac-acts .ac-link{flex:1 1 auto;min-width:0;margin:0 auto 0 0;padding:0 2px;text-align:left;font-size:var(--ph-label);white-space:nowrap}',
    PP + '#account .ac-sheet .sp-btn{--sp-h:48px;--sp-fs:var(--ph-btn)}',
    PP + '#account .ac-sheet .sp-btn.pri{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:24px;flex:none}',
    // con sesión (y borrar): dos columnas
    PP + '#account .ac-two .ac-sheet{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);column-gap:22px;align-items:start;padding:14px 18px 0}',
    PP + '#account .ac-two .ac-c1{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding-bottom:14px}',
    PP + '#account .ac-two .ac-c2{display:flex;flex-direction:column;min-height:100%;padding-right:40px;box-sizing:border-box}',
    PP + '#account .ac-two .ac-c2 .ac-acts{margin-top:auto;padding-right:0;margin-right:-40px;background:none;position:static}',
    PP + '#account .ac-user{width:100%;box-sizing:border-box;margin:2px 0 0;padding:10px 14px}',
    PP + '#account .ac-av{width:52px;height:52px;font-size:26px}',
    PP + '#account .ac-user b{font-size:var(--ph-head)}',
    PP + '#account .ac-sync{display:inline-flex;align-items:center;gap:6px;margin-top:5px;padding:3px 9px;border-radius:7px 10px 7px 9px;background:rgba(21,16,42,.1);color:var(--sp-ink);font:700 var(--ph-cap)/1.15 var(--sp-ui)}',
    PP + '#account .ac-sync::before{content:"";width:8px;height:8px;border-radius:50%;background:#1cc4b4;box-shadow:0 0 0 1.5px var(--sp-ink)}',
    PP + '#account .ac-sync.busy::before{background:var(--sp-gold)}' + PP + '#account .ac-sync.err::before{background:#ff6a5a}',
    PP + '#account .ac-quiet{min-height:44px;margin:12px 0 0;padding:0 4px;border:0;background:none;color:#ffa3ad;font:700 var(--ph-label)/1.2 var(--sp-ui);text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    'body #account .ac-quiet:focus-visible{outline:2.5px solid var(--sp-gold);outline-offset:2px;border-radius:6px}',
    PP + '#account .ac-del{margin:0 0 4px;padding:12px 14px;border-radius:12px 16px 11px 15px/14px 11px 16px 12px;background:#2a1530;box-shadow:0 0 0 3px var(--sp-danger),3px 4px 0 3px var(--sp-ink)}',
    PP + '#account .ac-del h3{margin:0 0 6px;font:400 var(--ph-head)/1.1 var(--sp-pop);color:#ffb3bc;text-shadow:2px 2px 0 var(--sp-ink)}',
    PP + '#account .ac-del p{margin:0}',
    PP + '#account .ac-acts .ac-l{margin-right:auto}',
    PP + '#account .ac-choice{margin:0}',
    PP + '#account .ac-two .ac-sheet>.ac-dacts{grid-column:1/-1;position:static;margin:4px -18px 0;padding:6px 18px 14px;background:none}',
    PP + '#account .ac-user>span:last-child{flex:1 1 auto}',
    PP + '#account .ac-gcw{width:min(620px,100%)}',
    PP + '#account .ac-gc .ac-k{font-size:var(--ph-label)}',
    PP + '#account .ac-gc .ac-h{--sp-hs:var(--ph-title);margin:0 44px 10px 0}',
    PP + '#account .ac-gc .ac-go{min-height:56px;padding:0 24px;font-size:calc(var(--ph-btn) + 2px)}',
    // alto ≤ 345 (iPhone SE): correo y contraseña lado a lado, para que todo quepa sin desplazar
    ':root.ph.ph-s' + P.slice(5) + '#account #acForm{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:14px}',
    ':root.ph.ph-s' + P.slice(5) + '#account #acForm>*{grid-column:1/-1}',
    ':root.ph.ph-s' + P.slice(5) + '#account #acForm>label[for=acUser]{grid-column:1;grid-row:1}' + ':root.ph.ph-s' + P.slice(5) + '#account #acForm>#acUser{grid-column:1;grid-row:2}',
    ':root.ph.ph-s' + P.slice(5) + '#account #acForm>label[for=acPass]{grid-column:2;grid-row:1}' + ':root.ph.ph-s' + P.slice(5) + '#account #acForm>#acPass{grid-column:2;grid-row:2}',
    ':root.ph.ph-s' + P.slice(5) + '#account .ac-or{margin-bottom:6px}',
    '@media (prefers-reduced-motion:reduce){#account .ac-g,#account .ac-user{transition:none}}'
  ].join('');
  var root = null, view = 'enter', tab = 'in', busy = false, msg = '', pending = null, lastFocus = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function build() {
    if (root) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'account'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'acTitle');
    root.addEventListener('click', function (e) { if (e.target === root && !busy && view !== 'conflict') close(); e.stopPropagation(); });
    root.addEventListener('keydown', function (e) {
      e.stopPropagation(); // que el menú de detrás no reciba las teclas mientras se escribe
      if (e.key === 'Escape' && !busy && view !== 'conflict') { e.preventDefault(); close(); }
    });
    root.addEventListener('keyup', function (e) { e.stopPropagation(); });
    document.body.appendChild(root);
  }
  function ago(t) {
    if (!t) return 'todavía no';
    var s = Math.round((Date.now() - t) / 1000);
    return s < 10 ? 'ahora mismo' : s < 60 ? 'hace ' + s + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h';
  }
  function careerInfo(raw) {
    try {
      var c = JSON.parse(raw), p = c.player || {}, k = c.clubs && c.myClub >= 0 ? c.clubs[c.myClub] : null, club = k && k.name || '';
      var bits = [];
      if (p.name) bits.push(p.name);
      if (c.season) bits.push('temporada ' + c.season);
      if (typeof club === 'string' && club) bits.push(club);
      if (p.lvl) bits.push('nivel ' + p.lvl);
      return bits.join(', ') || 'Carrera guardada';
    } catch (e) { return 'Carrera guardada'; }
  }
  // SPLAT: piezas de los botones (mancha de pintura del sistema; js/splat.js les pone el dibujo con decorate)
  function spb(a, label, cls, n, extra) {
    return '<button type="' + (a === 'submit' ? 'submit' : 'button') + '" class="sp-btn ' + (cls || 'sp-ink') + '" data-shape="' + (n | 0) + '"' + (a === 'submit' ? '' : ' data-ac="' + a + '"') + (extra || '') + '><span class="sp-t">' + label + '</span></button>';
  }
  var XIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var GSVG = '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  /** Confirmación de Google (la ventana se bloqueó): mismo HTML en móvil y PC; «Abrir Google» es un toque nuevo que abre la ventana. */
  function gcHTML() {
    return '<div class="ac-wrap ac-gcw"><div class="ac-sheet sp-panel ac-gc"><p class="ac-k sp-k">Tu cuenta</p><h2 class="ac-h sp-h" id="acTitle">Entrar con Google</h2>' +
      '<p>Para entrar con Google se abrirá una ventana de Google. Elige allí tu cuenta y volverás aquí.</p>' +
      '<p class="ac-err" role="alert">' + esc(msg) + '</p>' +
      '<div class="ac-acts">' + spb('gNo', 'Cancelar', 'sp-cream ac-l', 2) +
      '<button type="button" class="ac-g ac-go" data-ac="gOpen"' + (busy ? ' disabled' : '') + '>' + GSVG + (busy ? 'Un momento…' : 'Abrir Google') + '</button></div></div>' +
      '<button type="button" class="ac-x sp-btn sp-cream sp-sq" data-shape="1" data-ac="close" aria-label="Cerrar"' + (busy ? ' hidden' : '') + '>' + XIC + '</button></div>';
  }
  /** Móvil (html.ph; spec «Cuenta»): otra disposición con los mismos data-ac (act() no cambia). null = sin rama de móvil (conflicto). */
  function phHTML() {
    if (view === 'conflict') return null;
    var h = '';
    if (acc) {
      var cls = status === 'busy' ? ' busy' : status === 'error' ? ' err' : '';
      var st = status === 'busy' ? 'Sincronizando…' : status === 'error' ? (lastErr || 'Sin conexión') + ' Se reintentará solo.' : 'Nube · ' + ago(lastSync);   // (móvil: corto y en una línea)
      h ='<div class="ac-wrap ac-two"><div class="ac-sheet sp-panel"><div class="ac-c1"><h2 class="ac-sr" id="acTitle">Tu cuenta</h2>' +
        '<div class="ac-user"><span class="ac-av" aria-hidden="true">' + esc(acc.user.charAt(0).toUpperCase()) + '</span><span><b>' + esc(acc.user) + '</b><small class="ac-sync' + cls + '">' + esc(st) + '</small></span></div>' +
        (view === 'del' ? '' : spb('out', 'Cerrar sesión', 'sp-cream', 1) + '<button type="button" class="ac-quiet" data-ac="del">Borrar la cuenta</button>') + '</div><div class="ac-c2">' +
        (view === 'del'
          ? '<div class="ac-del" role="alert"><h3>¿Borrar la cuenta?</h3><p>Se borran la cuenta y todo lo guardado en ella (jugadores, Carreras, perfil, Vestuario, récord y ajustes). No se puede deshacer. Lo de este dispositivo se queda.</p></div>' +
''
          : '<p>Tu progreso se guarda solo en tu cuenta. Entra igual en otro dispositivo' + (acc.kind === 'google' ? ' (con Google)' : '') + ' para seguir donde lo dejaste.</p>' +
            '<div class="ac-acts">' + spb('sync', 'Sincronizar ahora', 'sp-kit pri', 0) + '</div>') + '</div>' +
        (view === 'del' ? '<div class="ac-acts ac-dacts">' + spb('cancel', 'No, volver', 'sp-cream ac-l', 2) + spb('delYes', 'Sí, borrar la cuenta', 'sp-danger pri', 3) + '</div>' : '') + '</div>';
    } else {
      var create = tab === 'new';
      h = '<div class="ac-wrap"><div class="ac-sheet sp-panel"><h2 class="ac-sr" id="acTitle">Cuenta: ' + (create ? 'crear cuenta' : 'entrar') + '</h2>' +
        '<div class="ac-tabs" role="tablist" data-kb-hide><button role="tab" class="sp-tab" data-ac="tabIn" aria-selected="' + !create + '">Entrar</button><button role="tab" class="sp-tab" data-ac="tabNew" aria-selected="' + create + '">Crear cuenta</button></div>' +
        '<button type="button" class="ac-g" data-ac="google" data-kb-hide' + (busy ? ' disabled' : '') + '>' + GSVG + (create ? 'Crear con Google' : 'Entrar con Google') + '</button>' +
        '<div class="ac-or" data-kb-hide><span>o con tu correo</span></div>' +
        '<form id="acForm" autocomplete="on" novalidate><label for="acUser">Correo o usuario</label><input id="acUser" name="username" type="text" inputmode="email" autocomplete="' + (create ? 'email' : 'username') + '" autocapitalize="none" spellcheck="false" maxlength="120" required>' +
        (create ? '<p class="ac-hint" id="acHint" hidden>Sin @ es un usuario: si olvidas la contraseña, no se puede recuperar. Apúntala bien.</p>' : '') +
        '<label for="acPass">Contraseña</label><input id="acPass" name="password" type="password" autocomplete="' + (create ? 'new-password' : 'current-password') + '" minlength="6" required>' +
        '<p class="ac-err" role="alert">' + esc(msg) + '</p>' +
        '<div class="ac-acts">' + (create ? '' : '<button type="button" class="ac-link" data-ac="forgot">¿Olvidaste la contraseña?</button>') +
        spb('submit', busy ? 'Un momento…' : create ? 'Crear cuenta' : 'Entrar', 'sp-kit pri', 3, busy ? ' disabled' : '') + '</div></form></div>';
    }
    return h + '<button type="button" class="ac-x sp-btn sp-cream sp-sq" data-shape="1" data-ac="close" aria-label="Cerrar"' + (busy ? ' hidden' : '') + '>' + XIC + '</button></div>';
  }
  function render() {
    var hp = view === 'gconfirm' ? gcHTML() : phone() ? phHTML() : null;
    var h = '<div class="ac-wrap"><div class="ac-sheet sp-panel">';
    if (hp) h = '';
    else if (view === 'conflict' && pending) {
      var cn = CONFLICT[pending.k] || 'Carrera';
      h += '<div class="ac-c1"><p class="ac-k sp-k">Tu cuenta</p><h2 class="ac-h sp-h" id="acTitle">¿Qué ' + esc(cn) + ' te quedas?</h2>' +
        '<p>Tienes una ' + esc(cn) + ' en este dispositivo y otra distinta en tu cuenta. Elige con cuál seguir: la otra se perderá.</p></div>' +
        '<div class="ac-c2"><div class="ac-choice"><button class="sp-btn sp-teal sp-wide" data-shape="0" data-ac="keepRemote"><span class="sp-l"><span class="sp-t">La de la cuenta</span><small class="sp-s">' + esc(careerInfo(pending.remote)) + '</small></span></button>' +
        '<button class="sp-btn sp-alt sp-wide" data-shape="1" data-ac="keepLocal"><span class="sp-l"><span class="sp-t">La de este dispositivo</span><small class="sp-s">' + esc(careerInfo(pending.local)) + '</small></span></button></div></div>';
    } else if (acc) {
      var st = status === 'busy' ? 'Sincronizando…' : status === 'error' ? (lastErr || 'Sin conexión') + ' Se reintentará solo.' : 'Guardado en la nube ' + ago(lastSync);
      h += '<div class="ac-c1"><p class="ac-k sp-k">Tu cuenta</p><h2 class="ac-h sp-h" id="acTitle">Cuenta</h2>' +
        '<div class="ac-user"><span class="ac-av" aria-hidden="true">' + esc(acc.user.charAt(0).toUpperCase()) + '</span><span><b>' + esc(acc.user) + '</b><small>' + esc(st) + '</small></span></div></div>' +
        '<div class="ac-c2"><p>Tu progreso (jugadores, Carreras, perfil, Vestuario, récord y ajustes) se guarda solo en tu cuenta. Entra igual en otro dispositivo' + (acc.kind === 'google' ? ' (con Google)' : '') + ' para seguir donde lo dejaste.</p>' +
        '<div class="ac-row">' + spb('sync', 'Sincronizar ahora', 'sp-teal', 0) + spb('out', 'Cerrar sesión', 'sp-cream', 1) + '</div>' +
        (view === 'del' ? '<p class="ac-warn">¿Seguro? Se borra la cuenta y lo guardado en ella, y no se puede deshacer. Lo de este dispositivo se queda.</p><div class="ac-acts">' + spb('cancel', 'No, volver', 'sp-cream sp-sm', 2) + spb('delYes', 'Sí, borrar la cuenta', 'sp-danger', 3) + '</div>'
          : '<div class="ac-acts">' + spb('del', 'Borrar la cuenta', 'sp-danger sp-sm', 2) + spb('close', 'Hecho', 'sp-kit', 3) + '</div>') + '</div>';
    } else {
      var create = tab === 'new';
      h += '<div class="ac-c1"><p class="ac-k sp-k">Guarda tu progreso</p><h2 class="ac-h sp-h" id="acTitle">Cuenta</h2>' +
        '<p class="ac-intro">Con una cuenta, tus jugadores, tu Carrera y tus ajustes se guardan en la nube y los tienes en cualquier dispositivo.</p>' +
        '<div class="ac-tabs" role="tablist"><button role="tab" class="sp-tab" data-ac="tabIn" aria-selected="' + !create + '">Entrar</button><button role="tab" class="sp-tab" data-ac="tabNew" aria-selected="' + create + '">Crear cuenta</button></div>' +
        '<button type="button" class="ac-g" data-ac="google"' + (busy ? ' disabled' : '') + '><svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>' + (create ? 'Crear con Google' : 'Entrar con Google') + '</button>' +
        '</div><div class="ac-c2"><p class="ac-or"><span>o con tu correo</span></p>' +
        '<form id="acForm" autocomplete="on" novalidate><label for="acUser">Correo o usuario</label><input id="acUser" name="username" type="text" inputmode="email" autocomplete="' + (create ? 'email' : 'username') + '" autocapitalize="none" spellcheck="false" maxlength="120" required>' +
        '<label for="acPass">Contraseña</label><input id="acPass" name="password" type="password" autocomplete="' + (create ? 'new-password' : 'current-password') + '" minlength="6" required>' +
        (create ? '<p class="ac-warn">Con tu correo podrás recuperar la contraseña si la olvidas. Con un usuario (sin @) no: apúntala bien.</p>' : '<button type="button" class="ac-link" data-ac="forgot">¿Olvidaste la contraseña?</button>') +
        '<p class="ac-err" role="alert">' + esc(msg) + '</p>' +
        '<div class="ac-acts">' + spb('close', 'Ahora no', 'sp-cream sp-sm', 2) + spb('submit', busy ? 'Un momento…' : create ? 'Crear cuenta' : 'Entrar', 'sp-kit pri', 3, busy ? ' disabled' : '') + '</div></form></div>';
    }
    if (hp) h = hp;
    else h += '</div><button type="button" class="ac-x sp-btn sp-cream sp-sq" data-shape="1" data-ac="close" aria-label="Cerrar"' + (busy || view === 'conflict' ? ' hidden' : '') + '>' + XIC + '</button></div>';
    var u = root.querySelector('#acUser'), keepU = u ? u.value : '', keepP = root.querySelector('#acPass') ? root.querySelector('#acPass').value : '';
    root.innerHTML = h;
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(root); } catch (e) { } }
    if (root.querySelector('#acUser')) { root.querySelector('#acUser').value = keepU; root.querySelector('#acPass').value = keepP; }
    root.querySelectorAll('[data-ac]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); act(b.getAttribute('data-ac')); }); });
    var f = root.querySelector('#acForm');
    if (f) f.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); act('submit'); });
    // (móvil, Crear cuenta: el aviso de recuperar la contraseña solo sale si lo escrito no lleva @)
    var hn = root.querySelector('#acHint'), ui = root.querySelector('#acUser');
    if (hn && ui) { var chk = function () { hn.hidden = !ui.value || ui.value.indexOf('@') >= 0; }; ui.addEventListener('input', chk); chk(); }
  }
  function act(a) {
    if (busy && a !== 'close') return;
    if (a === 'close') { if (!busy) close(); return; }
    if (a === 'tabIn' || a === 'tabNew') { tab = a === 'tabNew' ? 'new' : 'in'; msg = ''; render(); focusFirst(); return; }
    if (a === 'submit') {
      var u = root.querySelector('#acUser').value, p = root.querySelector('#acPass').value;
      busy = true; msg = ''; render();
      enter(u, p, tab === 'new').then(function (r) {
        busy = false;
        r.created = tab === 'new';
        if (conflicts.length) { pending = conflicts[0]; pendRes = { remote: false, enter: r }; view = 'conflict'; render(); return; }
        view = 'in'; render();
        if (r.changed) reloadSoon(tab === 'new' ? 'Cuenta creada' : 'Has entrado: progreso cargado desde tu cuenta');
        else toast(tab === 'new' ? 'Cuenta creada: tu progreso ya se guarda en la nube' : 'Has entrado en tu cuenta');
      }, function (e) { busy = false; if (acc && e.code !== 'unauthenticated') { view = 'in'; } msg = errText(e); render(); });
      return;
    }
    if (a === 'google' || a === 'gOpen') {
      // google() PRIMERO, aún dentro del toque: con el SDK cargado, signInWithPopup se llama en el acto y el navegador deja abrir la ventana
      var again = a === 'gOpen', gp = google(again);
      busy = true; msg = ''; render();
      gp.then(function (r) {
        busy = false;
        if (conflicts.length) { pending = conflicts[0]; pendRes = { remote: false, enter: r }; view = 'conflict'; render(); return; }
        view = 'in'; render();
        if (r.changed) reloadSoon('Has entrado con Google: progreso cargado desde tu cuenta'); else toast('Has entrado con Google: tu progreso ya se guarda en la nube');
      }, function (e) {
        busy = false;
        var c = e && e.code;
        // ventana bloqueada: se pide confirmación (y, si vuelve a bloquearse, se queda ahí con el aviso de permitir ventanas emergentes)
        if (c === 'g_confirm' || c === 'g_blocked') { view = 'gconfirm'; msg = c === 'g_blocked' ? errText(e) : ''; render(); gcFocus(); return; }
        if (again) view = 'enter';
        msg = errText(e); render();
      });
      return;
    }
    if (a === 'gNo') { view = 'enter'; msg = ''; render(); focusFirst(); return; }
    if (a === 'forgot') {
      var um = root.querySelector('#acUser').value;
      busy = true; msg = ''; render();
      resetPass(um).then(function () { busy = false; msg = ''; render(); toast('Si hay una cuenta con ese correo, te llegará un enlace para cambiar la contraseña'); },
        function (e) { busy = false; msg = errText(e); render(); });
      return;
    }
    if (a === 'keepRemote' || a === 'keepLocal') { resolve(a); return; }
    if (a === 'sync') { markDirty(); busy = true; render(); syncDown(false).then(function () { busy = false; render(); }); return; }
    if (a === 'out') { signOut(); view = 'enter'; tab = 'in'; render(); gWarm(); toast('Sesión cerrada. Tu progreso sigue en este dispositivo.'); return; }
    if (a === 'del') { view = 'del'; render(); return; }
    if (a === 'cancel') { view = 'in'; render(); return; }
    if (a === 'delYes') {
      busy = true; render();
      deleteAccount().then(function () { busy = false; view = 'enter'; render(); toast('Cuenta borrada'); }, function (e) { busy = false; view = 'in'; lastErr = errText(e); render(); });
    }
  }
  /** Resuelve el primer conflicto de la cola; si quedan, pinta el siguiente. Al acabar: recarga si alguno fue keepRemote (o si la
   *  entrada ya trajo cambios); si no, aviso. Devuelve 'next' | 'reload' | 'done' | null. */
  var pendRes = { remote: false, enter: null };
  function resolve(a) {
    var p2 = conflicts.shift() || pending; if (!p2) return null;
    if (a === 'keepRemote') { apply(p2.k, p2.remote); meta[p2.k] = p2.at; synced[p2.k] = p2.at; jset(META, meta); jset(META + '.up', synced); pendRes.remote = true; }
    else { meta[p2.k] = Date.now(); jset(META, meta); dirty[p2.k] = 1; push(); }
    if (conflicts.length) { pending = conflicts[0]; view = 'conflict'; if (root) render(); return 'next'; }
    pending = null; view = 'in'; if (root) render();
    var er = pendRes.enter, rem = pendRes.remote; pendRes = { remote: false, enter: null };
    if (rem || (er && er.changed)) { reloadSoon(rem ? 'Carrera cargada desde tu cuenta' : 'Has entrado: progreso cargado desde tu cuenta'); return 'reload'; }
    toast(p2.k === 'make-the-cut.career6' ? 'Te quedas con la Carrera de pista de este dispositivo' : 'Te quedas con la Carrera de este dispositivo');
    return 'done';
  }
  function gcFocus() { try { var b = root.querySelector('[data-ac=gOpen]'); if (b) b.focus({ preventScroll: true }); } catch (e) { } }
  function focusFirst() { try { var i = root.querySelector('#acUser') || root.querySelector('[data-ac=close]'); if (i) i.focus({ preventScroll: true }); } catch (e) { } }
  function open() {
    build(); view = acc ? 'in' : 'enter'; msg = ''; render();
    lastFocus = document.activeElement; root.hidden = false; focusFirst();
    gWarm();
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) { }
  }
  function isOpen() { return !!(root && !root.hidden); }

  // botón «Cuenta» del menú principal (debajo de «Pantalla completa»; solo en la página principal del menú)
  var btn = null;
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-4 4-5.6 7.5-5.6s6.3 1.6 7.5 5.6"/></svg>';
  function refreshBtn() {
    if (!btn) return;
    btn.querySelector('span').textContent = acc ? acc.user : 'Cuenta';
    btn.classList.toggle('on', !!acc); btn.classList.toggle('busy', status === 'busy'); btn.classList.toggle('err', status === 'error');
    btn.setAttribute('aria-label', acc ? 'Cuenta: ' + acc.user : 'Cuenta: guarda tu progreso');
    btn.title = acc ? 'Sesión iniciada' : 'Sin sesión';
  }
  function placeBtn() {
    if (!btn) return;
    var page = VB.UI && VB.UI.menuPage ? VB.UI.menuPage() : 'main';
    btn.hidden = page !== 'main' || !!(VB.ctx && VB.ctx.debug);
    var fsb = document.getElementById('btnFs');
    if (fsb && !fsb.hidden) btn.style.top = (fsb.offsetTop + fsb.offsetHeight + 8) + 'px'; else btn.style.top = '';
  }
  function initBtn() {
    var menu = document.getElementById('menu'); if (!menu || btn) return;
    btn = document.createElement('button'); btn.id = 'btnAcc'; btn.className = 'fs-btn'; btn.setAttribute('data-ui', '');
    btn.innerHTML = ICON + '<span>Cuenta</span><i class="ac-dot" aria-hidden="true"></i>';
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    var fsb = document.getElementById('btnFs');
    if (fsb && fsb.parentNode === menu) menu.insertBefore(btn, fsb.nextSibling); else menu.appendChild(btn);
    refreshBtn(); placeBtn(); setInterval(placeBtn, 700);
  }

  document.addEventListener('vb:ph', function () { if (root && !root.hidden) render(); });
  function boot() {
    build(); initBtn();
    try { var t = sessionStorage.getItem('make-the-cut.account.toast'); if (t) { sessionStorage.removeItem('make-the-cut.account.toast'); setTimeout(function () { toast(t); }, 900); } } catch (e) { }
    if (acc) syncDown(true); else gBack();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  VB.Account = {
    open: open, close: close, isOpen: isOpen, user: function () { return acc ? acc.user : null; }, status: function () { return status; },
    sync: function () { return syncDown(false); }, signOut: signOut, onChange: function (f) { listeners.push(f); },
    // ONLINE (especialista net, js/netroom.js / js/netlobby.js): token de la sesión para las salas de Firestore (rooms/…). netInfo
    // nunca da el correo: user solo es el nombre de usuario de las cuentas «usuario y contraseña» (las de correo y Google dan '').
    netAuth: function () { if (!acc) return Promise.reject(err('unauthenticated')); return token().then(function (t) { return { uid: acc.uid, token: t }; }); },
    netInfo: function () { return acc ? { uid: acc.uid, kind: acc.kind || 'user', user: acc.kind === 'user' || !acc.kind ? acc.user : '' } : null; },
    FS_BASE: FS,
    // pruebas (tools/cuentatest.js): entrar sin la interfaz y borrar la cuenta al acabar
    menuReady: menuReady, S4_SYNC: S4_SYNC,
    _enter: enter, _delete: deleteAccount, _mergeGym: mergeGym, _gymSync: GYM_SYNC, _mergeLook: mergeLook, _lookSync: LOOK_SYNC, _push: function () { markDirty(); return push(); },
    // pruebas (tools/synctest.js)
    _merge: merge, _docs: function () { return Object.assign({}, DOCS); }, _track: function () { return Object.assign({}, TRACK); },
    _mergeLegends: mergeLegends, _s4Sync: S4_SYNC, _conflicts: function () { return conflicts.slice(); }, _resolve: resolve,
    _pendingDown: function () { return pendingDown; }, _afterDown: afterDown, _MAX_RAW: MAX_RAW,
    _careerInfo: careerInfo, _lastErr: function () { return lastErr; },
    // pruebas (tools/googletest.js): vista actual del panel y si el SDK de Google ya está cargado
    _view: function () { return view; }, _sdkReady: function () { return !!sdkFb; },
    // capturas (tools/eval.js): pinta la cola de conflictos dada [{k, remote, local, at}] sin tocar la nube
    _preview: function (v, o) {   // capturas: pinta una vista del panel (enter | in | del) con una cuenta de mentira, sin tocar la nube
      o = o || {}; build(); var save = acc;
      if (v === 'in' || v === 'del') acc = { user: o.user || 'jugadora7@correo.es', kind: o.kind || 'mail', uid: 'preview', rt: 'preview' };
      view = v === 'del' ? 'del' : v === 'in' ? 'in' : v === 'gconfirm' ? 'gconfirm' : 'enter'; tab = o.tab || 'in'; msg = o.msg || ''; busy = !!o.busy; lastSync = Date.now() - 120000;
      render(); acc = save; busy = false; lastFocus = document.activeElement; root.hidden = false; return true;
    },
    _showConflicts: function (list) { conflicts = (list || []).slice(); if (!conflicts.length) return false; build(); pending = conflicts[0]; pendRes = { remote: false, enter: null }; view = 'conflict'; render(); lastFocus = document.activeElement; root.hidden = false; return true; }
  };
})();
