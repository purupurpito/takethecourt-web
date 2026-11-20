/* =====================================================================
 * MAKE THE CUT — js/netroom.js   (owner: net)
 * Modo online, fase 2 (notes/net.md «Fase 2»): salas del lobby y señalización de WebRTC en Firestore por REST, con el token de la
 * cuenta (js/account.js). SIN DOM y SIN THREE: funciona igual en el navegador y en Node (tools/roomtest.js lo prueba contra el
 * emulador de Firestore o con un fetch simulado).
 *
 * Modelo de datos (reglas en firebase/firestore.rules, bloque ONLINE):
 *   rooms/{uidAnfitrión} = {code, name, gname, host, guest, fmt, venue, map, even, bo, pts, state: open|full|play, v, seen, net?}
 *     (net = 'fluida' solo en las salas de conexión Fluida, Online V2; sin la clave = Precisa)
 *     (seen = hora del SERVIDOR: transformación REQUEST_TIME en cada escritura del anfitrión; el latido la renueva)
 *   rooms/{uid}/sig/offer = {sdp, gen, to} (anfitrión; to = uid del invitado) · rooms/{uid}/sig/answer = {sdp, gen, uid} (invitado)
 *   Nunca hay correos: del rival solo viaja su nombre visible (name/gname). Cada SDP (con direcciones de red) solo la lee su
 *   destinatario y el anfitrión (nunca un invitado posterior); se borran al conectar, al salir y al reabrir; el juego nunca las enseña.
 *
 * API: VB.NetRoom.create({base, auth, fetch, ver}) → rooms
 *   base  = 'https://firestore.googleapis.com/v1/projects/<p>/databases/(default)/documents' (o la del emulador)
 *   auth  = () → Promise<{uid, token}>   (VB.Account.netAuth en el juego)
 *   ver   = cadena de versión (PROTO|VB.VERSION): una sala de otra versión sale en la lista como «otra versión» y no deja entrar
 *   rooms.list()                 → Promise<[sala]> abiertas y vivas (la más nueva primero); de paso borra hasta 3 caducadas
 *   rooms.open(cfg)              → Promise<sala> crea (o rehace) TU sala: cfg = {name, venue, map, even, bo, pts, net?}
 *   rooms.beat(patch)            → Promise<sala> latido del anfitrión (y cambios: {state, guest, gname}); null si ya no existe
 *   rooms.get(id) / rooms.byCode(code) → Promise<sala|null>
 *   rooms.join(id, gname)        → Promise<sala> (errores: full | gone | version | off | auth | net)
 *   rooms.leave(id)              → Promise   el invitado sale antes de empezar (la sala vuelve a 'open')
 *   rooms.close()                → Promise   el anfitrión borra su sala y su señalización
 *   rooms.resume()               → Promise<sala|null> fase 6: el anfitrión que recargó retoma SU sala (rooms/{tu uid}) para latir y
 *                                  reofrecer; null si ya no existe. Su pagehide en pleno partido no la borra (la vuelta la necesita).
 *   rooms.bye(role, id)          → (nada)    al cerrar la pestaña: close() o leave(id) con fetch keepalive, sin esperar
 *   rooms.putSig(id, 'offer'|'answer', {sdp, gen}) / rooms.getSig(id, kind) → {sdp, gen}|null / rooms.delSig(id)
 *   sala = {id, code, name, gname, host, guest, fmt, venue, map, even, bo, pts, state, v, seen (ms del servidor), age (ms), other (otra versión)}
 *   Errores: Error con .code = 'off' (las reglas del online aún no están desplegadas: 403 al listar, o al crear si tampoco se lista), 'denied' (403 en lo
 *   demás), 'auth' (sin sesión), 'net' (sin conexión), 'full', 'gone', 'version', 'error'.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sin 0/O, 1/I/L
  var LIVE_MS = 90000;      // una sala sin latido en 90 s ya no sale en la lista (las reglas tampoco dejan entrar)
  var STALE_MS = 300000;    // a los 5 min cualquiera con sesión puede borrarla (limpieza)
  var BEAT_MS = 20000;      // latido del anfitrión (3 por minuto). Con la pestaña en segundo plano más de 5 min, Chrome deja los
                            // temporizadores en 1 por minuto: por eso LIVE_MS deja margen para un latido de cada 60 s.
  var LIST_MAX = 50;   // (auditoría: las reglas dejan listar hasta 50; ahora por latido, también cuentan las llenas y las que juegan)

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function newCode(rnd) { var s = ''; for (var i = 0; i < 6; i++) s += ALPHA[Math.floor((rnd || Math.random)() * ALPHA.length) % ALPHA.length]; return s; }
  function codeOk(c) { return typeof c === 'string' && /^[2-9A-HJKMNP-Z]{6}$/.test(c); }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6); }
  /** Nombre visible: sin controles ni < >, espacios plegados, 2-16 unidades UTF-16 (como cuentan las reglas: size() de un string;
   *  un emoji suele valer 2), sin partir un emoji por la mitad. '' si no vale. */
  function cleanName(n) {
    var s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>"`]/g, '').replace(/\s+/g, ' ').trim();
    if (s.indexOf('@') >= 0) return '';   // nunca algo con pinta de correo
    var out = '', cs = Array.from(s);
    for (var i = 0; i < cs.length && out.length + cs[i].length <= 16; i++) out += cs[i];
    s = out.trim();
    return s.length >= 2 ? s : '';
  }

  /* ---- valores de Firestore ---- */
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    return { stringValue: String(v) };
  }
  function dec(f) {
    var o = {};
    for (var k in f) {
      var x = f[k];
      if ('stringValue' in x) o[k] = x.stringValue;
      else if ('booleanValue' in x) o[k] = x.booleanValue;
      else if ('integerValue' in x) o[k] = +x.integerValue;
      else if ('doubleValue' in x) o[k] = +x.doubleValue;
      else if ('timestampValue' in x) o[k] = Date.parse(x.timestampValue);
      else o[k] = null;
    }
    return o;
  }
  var ROOM_KEYS = ['code', 'name', 'gname', 'host', 'guest', 'fmt', 'venue', 'map', 'even', 'bo', 'pts', 'state', 'v', 'net'];

  function create(o) {
    o = o || {};
    var base = String(o.base || '').replace(/\/+$/, ''), auth = o.auth, F = o.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var docRoot = base.slice(base.indexOf('projects/'));   // projects/<p>/databases/(default)/documents
    var ver = String(o.ver || '');
    var me = null;      // {uid, token} de la última llamada
    var mine = null;    // tu sala (anfitrión): último estado escrito

    function call(method, url, body, quiet404) {
      if (!F) return Promise.reject(err('net', 'sin fetch'));
      return Promise.resolve().then(function () { return auth(); }).catch(function (e) { throw err('auth', e && e.message); }).then(function (a) {
        if (!a || !a.uid || !a.token) throw err('auth');
        me = a;
        var opt = { method: method, headers: { Authorization: 'Bearer ' + a.token } };
        if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        return F(url, opt).then(null, function () { throw err('net', 'sin conexión'); });
      }).then(function (r) {
        if (r.status === 404 && quiet404) return null;
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = {}; }
          if (!r.ok) {
            var m = j && (Array.isArray(j) ? j[0] && j[0].error : j.error), msg = m && m.message || ('HTTP ' + r.status);
            throw err(r.status === 403 ? 'denied' : r.status === 401 ? 'auth' : r.status === 404 ? 'gone' : r.status === 409 || r.status === 412 ? 'conflict' :
              r.status >= 500 || r.status === 429 ? 'net' : 'error', msg);
          }
          return j;
        });
      });
    }
    function docUrl(path) { return base + '/' + path; }
    function room(doc, readTime) {
      if (!doc || !doc.fields) return null;
      var d = dec(doc.fields), id = String(doc.name || '').split('/').pop();
      d.id = id;
      var now = readTime ? Date.parse(readTime) : (doc.updateTime ? Date.parse(doc.updateTime) : Date.now());
      d.age = d.seen ? Math.max(0, now - d.seen) : 1e12;
      d.other = !!ver && d.v !== ver;
      return d;
    }
    /** Escritura con seen = hora del servidor (documents:commit con transformación). mask = campos que se tocan (sin mask: el doc entero). */
    function commitRoom(id, fields, mask, exists) {
      var f = {}; for (var k in fields) f[k] = enc(fields[k]);
      var w = { update: { name: docRoot + '/rooms/' + id, fields: f }, updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] };
      if (mask) w.updateMask = { fieldPaths: mask };
      if (exists != null) w.currentDocument = { exists: !!exists };
      return call('POST', base + ':commit', { writes: [w] });
    }
    function query(where, limit, order) {
      var q = { from: [{ collectionId: 'rooms' }], limit: limit };
      if (where) q.where = where;
      if (order) q.orderBy = order;
      return call('POST', base + ':runQuery', { structuredQuery: q }).then(function (rows) {
        var out = [];
        (Array.isArray(rows) ? rows : []).forEach(function (x) { var r = x && x.document ? room(x.document, x.readTime) : null; if (r) out.push(r); });
        return out;
      });
    }
    function eq(field, v) { return { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(v) } }; }

    var api = {
      LIVE_MS: LIVE_MS, STALE_MS: STALE_MS, BEAT_MS: BEAT_MS,
      uid: function () { return me && me.uid; },
      /** Salas abiertas y vivas, la más nueva primero. 403 aquí = reglas sin desplegar ('off'). */
      // (auditoría: por latido, la más reciente primero, y el estado se filtra aquí: antes state=='open' sin orden devolvía las 40 de uid
      //  más bajo, y 40 salas abiertas que no servían, caducadas o de otra versión, escondían las nuevas. Un solo campo: índice automático)
      list: function () {
        return query(null, LIST_MAX, [{ field: { fieldPath: 'seen' }, direction: 'DESCENDING' }]).then(function (L) {
          L = L.filter(function (r) { return r.state === 'open'; });
          var dead = L.filter(function (r) { return r.age > STALE_MS + 30000 && r.host !== (me && me.uid); }).slice(0, 3);
          dead.forEach(function (r) { api._sweep(r.id).catch(function () { }); });
          var mineId = me && me.uid;
          return L.filter(function (r) { return r.age < LIVE_MS && r.host !== mineId; }).sort(function (a, b) { return a.age - b.age; });
        }, function (e) { if (e.code === 'denied') throw err('off', e.message); throw e; });
      },
      /** Limpieza: también las salas llenas o jugando que se quedaron sin latido (las abiertas caen en list). */
      sweep: function () {
        var cut = new Date(Date.now() - STALE_MS - 60000).toISOString();
        return query({ fieldFilter: { field: { fieldPath: 'seen' }, op: 'LESS_THAN', value: { timestampValue: cut } } }, 5).then(function (L) {
          return Promise.all(L.filter(function (r) { return r.age > STALE_MS + 30000; }).map(function (r) { return api._sweep(r.id).catch(function () { }); }));
        });
      },
      _sweep: function (id) {
        return Promise.all(['offer', 'answer'].map(function (k) { return call('DELETE', docUrl('rooms/' + id + '/sig/' + k), null, true).catch(function () { }); }))
          .then(function () { return call('DELETE', docUrl('rooms/' + id), null, true); });
      },
      /** Crea (o rehace) tu sala: rooms/{tu uid}. */
      open: function (cfg) {
        cfg = cfg || {};
        return Promise.resolve().then(function () { return auth(); }).catch(function (e) { throw err('auth', e && e.message); }).then(function (a) {
          me = a;
          var d = { code: codeOk(cfg.code) ? cfg.code : newCode(), name: cleanName(cfg.name) || 'Jugador', gname: '', host: a.uid, guest: '', fmt: '2v2',
            venue: cfg.venue === 'beach' ? 'beach' : 'hall', map: String(cfg.map || '').slice(0, 40), even: !!cfg.even, bo: +cfg.bo === 3 ? 3 : 1,
            pts: [11, 15, 21, 25].indexOf(+cfg.pts) >= 0 ? +cfg.pts : 21, state: 'open', v: ver.slice(0, 40) };
          // Online V2: la conexión Fluida va en la sala (net = 'fluida'); en las Precisa la clave no existe (salas como siempre)
          if (cfg.net === 'fluida') d.net = 'fluida';
          // (auditoría: un código nuevo que ya usa otra sala viva se cambia; el de tu sala de antes, cfg.code, se respeta)
          var fresh = !codeOk(cfg.code), tries = 0;
          var pick = function () {
            if (!fresh || tries++ >= 3) return Promise.resolve();
            return query(eq('code', d.code), 2).then(function (L) {
              if (L.some(function (r) { return r.host !== a.uid && r.age < STALE_MS; })) { d.code = newCode(); return pick(); }
            }, function () { });
          };
          // (antes de abrir: fuera la señalización de una sesión anterior que no se cerró, p. ej. una recarga a mitad de conexión)
          return pick().then(function () { return api.delSig(a.uid); }).then(function () { return commitRoom(a.uid, d, null, null); }).then(function () { mine = d; return api.get(a.uid); }, function (e) {
            if (e.code !== 'denied') throw e;
            // 403 al crear: 'off' solo si tampoco se puede listar (reglas sin desplegar); si no, es un dato que las reglas no aceptan
            return query(eq('state', 'open'), 1).then(function () { throw err('denied', e.message); }, function (e2) { throw err(e2.code === 'denied' ? 'off' : e2.code, e.message); });
          });
        });
      },
      /** Latido del anfitrión; con patch cambia estado / invitado ({state, guest, gname}). null si la sala ya no existe. */
      beat: function (patch) {
        if (!mine || !me) return Promise.resolve(null);
        // solo los campos del patch (nunca se reescribe guest/gname con lo que había: el invitado puede haber entrado entre medias)
        var d = {}, mask = [];
        if (patch) for (var k in patch) if (ROOM_KEYS.indexOf(k) >= 0) { d[k] = patch[k]; mask.push(k); }
        var w = mask.length ? null : { transform: { document: docRoot + '/rooms/' + me.uid, fieldTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }, currentDocument: { exists: true } };
        var p = w ? call('POST', base + ':commit', { writes: [w] }) : commitRoom(me.uid, d, mask, true);
        return p.then(function () { for (var k2 in d) mine[k2] = d[k2]; return api.get(me.uid); }, function (e) {
          if (e.code === 'gone' || e.code === 'conflict' || /NOT_FOUND|no entity/i.test(e.message)) { mine = null; return null; }
          throw e;
        });
      },
      /** El anfitrión lee su sala tal como está (el invitado puede haber entrado o salido). */
      get: function (id) { return call('GET', docUrl('rooms/' + id), null, true).then(function (j) { return j ? room(j) : null; }); },
      byCode: function (code) {
        code = normCode(code); if (!codeOk(code)) return Promise.resolve(null);
        // (auditoría: las reglas no exigen código único y otra cuenta puede copiar el de una sala ajena: con más de una sala viva con ese
        //  código no se elige ninguna, 'dup', en vez de entrar en la de uid más bajo)
        return query({ compositeFilter: { op: 'AND', filters: [eq('code', code), eq('state', 'open')] } }, 5).then(function (L) {
          var live = L.filter(function (r) { return r.age < LIVE_MS; });
          if (live.length > 1) throw err('dup', 'código repetido');
          return live[0] || L[0] || null;
        },
          function (e) { if (e.code === 'denied') throw err('off', e.message); throw e; });
      },
      /** Entrar en una sala: solo guest/gname/state; las reglas impiden entrar si ya está llena o si no hay latido. */
      join: function (id, gname) {
        return api.get(id).then(function (r) {
          if (!r || r.age > LIVE_MS) throw err('gone');
          if (r.other) throw err('version');
          if (r.state !== 'open' || r.guest) throw err('full');
          var f = { guest: { stringValue: me.uid }, gname: { stringValue: cleanName(gname) || 'Jugador' }, state: { stringValue: 'full' } };
          return call('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state&currentDocument.exists=true', { fields: f })
            .then(function (j) { return room(j); }, function (e) {
              if (e.code === 'denied' || e.code === 'gone') return api.get(id).then(function (r2) { throw err(!r2 || r2.age > LIVE_MS ? 'gone' : r2.guest && r2.guest !== me.uid ? 'full' : 'denied', e.message); }, function () { throw err('denied', e.message); });
              throw e;
            });
        });
      },
      /** El invitado sale antes de empezar. */
      leave: function (id) {
        var f = { guest: { stringValue: '' }, gname: { stringValue: '' }, state: { stringValue: 'open' } };
        // primero se borra tu respuesta (lleva tus direcciones de red): que no la herede quien entre después
        return call('DELETE', docUrl('rooms/' + id + '/sig/answer'), null, true).catch(function () { }).then(function () { return call('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state&currentDocument.exists=true', { fields: f }); }).then(function () { }, function () { });
      },
      /** Al cerrar o recargar la pestaña (pagehide): lo mismo que close() (anfitrión) o leave(id) (invitado), sin esperar respuesta
       *  (fetch keepalive con el último token: no hay tiempo de renovarlo). Si el token ya no vale, la sala caduca sola (LIVE_MS). */
      bye: function (role, id) {
        if (!me || !F) return;
        var h = { Authorization: 'Bearer ' + me.token }, ka = function (m, u, b) {
          try { var o = { method: m, headers: h, keepalive: true }; if (b) { o.headers = { Authorization: h.Authorization, 'Content-Type': 'application/json' }; o.body = JSON.stringify(b); } F(u, o).catch(function () { }); } catch (e) { }
        };
        if (role === 'host') {
          mine = null;
          ka('DELETE', docUrl('rooms/' + me.uid + '/sig/offer')); ka('DELETE', docUrl('rooms/' + me.uid + '/sig/answer')); ka('DELETE', docUrl('rooms/' + me.uid));
        } else if (role === 'guest' && id) {
          ka('DELETE', docUrl('rooms/' + id + '/sig/answer'));
          ka('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state&currentDocument.exists=true',
            { fields: { guest: { stringValue: '' }, gname: { stringValue: '' }, state: { stringValue: 'open' } } });
        }
      },
      /** Fase 6: el anfitrión vuelve tras recargar y retoma su sala (la que dejó en 'full'/'play'): latido y señalización como antes. */
      resume: function () {
        return Promise.resolve().then(function () { return auth(); }).catch(function (e) { throw err('auth', e && e.message); }).then(function (a) {
          me = a;
          return api.get(a.uid).then(function (r) {
            if (!r || r.host !== a.uid) return null;
            var d = {}; for (var i = 0; i < ROOM_KEYS.length; i++) if (r[ROOM_KEYS[i]] !== undefined) d[ROOM_KEYS[i]] = r[ROOM_KEYS[i]];
            mine = d; return r;
          });
        });
      },
      /** El anfitrión cierra su sala (señalización y sala). */
      close: function () {
        if (!me) return Promise.resolve();
        var id = me.uid; mine = null;
        return api.delSig(id).then(function () { return call('DELETE', docUrl('rooms/' + id), null, true); }).then(function () { }, function () { });
      },
      /** offer: s = {sdp, gen, to: uid del invitado al que va} · answer: s = {sdp, gen} (se firma con tu uid). Las reglas solo dejan leer
       *  la oferta a su destinatario (y al anfitrión) y la respuesta a quien la escribió (y al anfitrión mientras sea su invitado). */
      putSig: function (id, kind, s) {
        var f = { sdp: { stringValue: String(s.sdp || '') }, gen: { integerValue: String(s.gen | 0) } };
        return Promise.resolve(me || auth()).then(function (a) {
          me = me || a;
          if (kind === 'answer') f.uid = { stringValue: String(me.uid) }; else f.to = { stringValue: String(s.to || '') };
          return call('PATCH', docUrl('rooms/' + id + '/sig/' + (kind === 'answer' ? 'answer' : 'offer')), { fields: f });
        }).then(function () { });
      },
      /** → {sdp, gen, to|uid} o null (no hay, o no es para ti: las reglas responden 403 y aquí cuenta como «no hay»). */
      getSig: function (id, kind) {
        return call('GET', docUrl('rooms/' + id + '/sig/' + (kind === 'answer' ? 'answer' : 'offer')), null, true).then(function (j) {
          if (!j || !j.fields) return null; var d = dec(j.fields); return { sdp: String(d.sdp || ''), gen: d.gen | 0, to: String(d.to || ''), uid: String(d.uid || '') };
        }, function (e) { if (e.code === 'denied') return null; throw e; });
      },
      delSig: function (id) {
        return Promise.all(['offer', 'answer'].map(function (k) { return call('DELETE', docUrl('rooms/' + id + '/sig/' + k), null, true).catch(function () { }); })).then(function () { });
      },
      _mine: function () { return mine; }
    };
    return api;
  }

  VB.NetRoom = { create: create, newCode: newCode, codeOk: codeOk, normCode: normCode, cleanName: cleanName, enc: enc, dec: dec, ALPHA: ALPHA,
    LIVE_MS: LIVE_MS, STALE_MS: STALE_MS, BEAT_MS: BEAT_MS };
})();
