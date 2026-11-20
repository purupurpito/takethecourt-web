/* MAKE THE CUT — js/netlog.js (owner: net)
 * Informe de red de cada partido online (17-nov-2026, Ferran: «pon logs para comprobar cómo van las partidas, si hay mucho lag»).
 *
 *  - main.js llama a VB.NetLog.begin(net) al crear cada sesión (la revancha es otro partido), frame(net, r) en cada frame tras
 *    Session.advance y end(net, why) al cerrar. Solo LEE la sesión y el enlace: no toca la simulación ni lo que se manda.
 *  - Cada 10 s cierra una ventana con: ping de la app (pings de net.js por el canal fiable, procesados en frames: incluye la espera
 *    de un frame de cada lado y los tirones de las dos máquinas) y ping de la RED (WebRTC, candidate-pair currentRoundTripTime),
 *    mín/media/p95/máx; fps y peor frame; esperas al rival (veces y ms); rollback (profundidad media y máxima); paquetes; ventaja
 *    de frames; pestaña oculta. Más una lista de sucesos (esperas largas, conexión inestable, resincronizaciones, huellas que no
 *    cuadran, contra la IA, fin).
 *  - Lo primero es el ping (Ferran): durante el partido NO sale nada por la red; el informe va en memoria y se guarda UNA vez al
 *    acabar (o al cerrar la pestaña, con keepalive) en Firestore como netlogs/{uid}_{id} = {uid, ver, t, j (el informe en JSON)}
 *    con la cuenta del jugador (las reglas solo dejan crear/actualizar el propio; leer, solo la cuenta de Ferran). Visor:
 *    netlogs.html (pages/), con la sesión de la cuenta del mismo navegador.
 *  - Privacidad: NUNCA direcciones IP ni puertos (de getStats solo el TIPO de candidato y el protocolo), ni el correo. Sí el nombre
 *    de los dos (el mismo que ya enseña el lobby), navegador, sistema y tipo de red que da el navegador.
 *  - Online V2 (modelo Fluida, js/netfluid.js): el informe dice el modelo (modelo: 'precisa' | 'fluida'); cada ventana lleva además
 *    una foto de s.flStats (fl: los contadores son acumulados desde el inicio; interpMs, lateMaxMs, warpMax y drift, el valor del
 *    momento), y el total, la del final. En Fluida no hay rollback ni ventaja de frames (stats.depth y s.adv no existen: rb/adv van
 *    a null) y en vez de huellas hay un resumen del marcador: si ptBad o digestBad suben, suceso 'marcador_distinto'.
 *  - Solo con cuenta y enlace WebRTC de verdad (no en las pruebas por BroadcastChannel), salvo ?netlog=1 (depuración: además lo
 *    escribe en la consola).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var WIN_MS = 10000, ICE_MS = 2000, MAX_WIN = 120, MAX_EV = 200, MAX_J = 240000;
  var cur = null, Q = {};
  try { (root.location && root.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) Q[p[0]] = decodeURIComponent(p[1] || ''); }); } catch (e) { }
  var FORCE = Q.netlog === '1';

  function pnow() { return root.performance ? performance.now() : Date.now(); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function stat(a) {   // [mín, media, p95, máx] (redondeados)
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), sum = 0;
    for (var i = 0; i < s.length; i++) sum += s[i];
    return [Math.round(s[0]), Math.round(sum / s.length), Math.round(s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1) + 0.5))]), Math.round(s[s.length - 1])];
  }
  function env() {
    var n = root.navigator || {}, ua = String(n.userAgent || ''), o = {};
    var br = /Edg\/(\d+)/.exec(ua) ? 'Edge ' + /Edg\/(\d+)/.exec(ua)[1] : /OPR\/(\d+)/.exec(ua) ? 'Opera ' + /OPR\/(\d+)/.exec(ua)[1]
      : /Firefox\/(\d+)/.exec(ua) ? 'Firefox ' + /Firefox\/(\d+)/.exec(ua)[1] : /CriOS\/(\d+)/.exec(ua) ? 'Chrome iOS ' + /CriOS\/(\d+)/.exec(ua)[1]
      : /Chrome\/(\d+)/.exec(ua) ? 'Chrome ' + /Chrome\/(\d+)/.exec(ua)[1] : /Version\/(\d+).*Safari/.exec(ua) ? 'Safari ' + /Version\/(\d+)/.exec(ua)[1] : 'otro';
    var os = /Android (\d+)/.exec(ua) ? 'Android ' + /Android (\d+)/.exec(ua)[1] : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X/.test(ua) ? (n.maxTouchPoints > 1 ? 'iPadOS' : 'macOS') : /Linux/.test(ua) ? 'Linux' : 'otro';
    o.br = br; o.os = os;
    o.mob = /Mobi|Android|iPhone|iPad/.test(ua) || (n.maxTouchPoints > 1 && /Mac OS X/.test(ua));
    try { o.scr = root.screen ? root.screen.width + 'x' + root.screen.height + '@' + r1(root.devicePixelRatio || 1) : ''; } catch (e) { }
    o.cores = n.hardwareConcurrency || 0; o.mem = n.deviceMemory || 0;
    var c = n.connection || n.mozConnection || n.webkitConnection;
    if (c) o.net = { type: c.type || '', eff: c.effectiveType || '', rtt: c.rtt || 0, down: c.downlink || 0, save: !!c.saveData };
    try { var VS = VB.ctx && VB.ctx.settings; if (VS) o.q = VS.quality || ''; } catch (e) { }
    return o;
  }
  // foto compacta de s.flStats (Fluida): solo los campos que se miran; los que falten no salen
  var FL_KEYS = ['snapOut', 'snapIn', 'kbOut', 'kbIn', 'interpMs', 'extrapTicks', 'hand', 'forks', 'late', 'lateMaxMs', 'warpMax', 'snaps', 'drift', 'fqSent', 'fqOk', 'ptBad', 'sbFix', 'digestBad'];
  function flSnap(f) {
    if (!f || typeof f !== 'object') return null;
    var o = {}, n = 0;
    for (var i = 0; i < FL_KEYS.length; i++) { var v = f[FL_KEYS[i]]; if (typeof v === 'number' && isFinite(v)) { o[FL_KEYS[i]] = r1(v); n++; } }
    return n ? o : null;
  }
  function newWin(t) { return { t0: t, rtt: [], ice: [], frames: 0, worst: 0, slow: 0, waits: 0, waitMs: 0, dSum: 0, dN: 0, dMax: 0, unstMs: 0, hidMs: 0, advMin: 1e9, advMax: -1e9 }; }
  function ev(c, t, k, extra) {
    if (c.ev.length >= MAX_EV) { c.evDrop = (c.evDrop || 0) + 1; return; }
    var e = { t: r1((t - c.t0) / 1000), k: k };
    if (extra) for (var x in extra) e[x] = extra[x];
    c.ev.push(e);
    if (FORCE && root.console) console.info('[netlog] ' + JSON.stringify(e));
  }
  function enabled(net) {
    if (FORCE) return true;
    if (Q.netemu) return false;   // pruebas contra el emulador (tools/netdrive.js --rtc): nunca al Firebase de verdad
    var A = VB.Account;
    if (!A || !A.netAuth || !A.FS_BASE || !(A.isIn ? A.isIn() : true)) return false;
    return !!(net && net.link && typeof net.link.info === 'function');   // RtcLink (lobby); no BcLink / memPair
  }

  function begin(net) {
    if (cur) end(cur.net, 'nueva');
    if (!net || !net.sess || !enabled(net)) { cur = null; return; }
    var t = pnow(), s = net.sess;
    cur = {
      net: net, sess: s, link: net.link, t0: t, wall: Date.now(), id: Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36),
      win: newWin(t), wins: [], ev: [], lastSeq: s.rttSeq || 0, lastF: 0, lastIce: -1e9, st0: null, status: '', unst: false, solo: false,
      cmpBad: -1, ptBad: 0, digestBad: 0, resyncs: 0, waitT: -1, lastSt: null, conn: null, busy: false, ended: false, env: env()
    };
    ev(cur, t, 'inicio', { rol: net.slot === 0 ? 'anfitrion' : 'invitado', epoca: net.epoch | 0, delay: s.delay | 0 });
  }

  function closeWin(c, t) {
    var w = c.win, s = c.sess, st = s.stats || {}, L = c.lastSt || { sent: 0, recv: 0, bytesOut: 0, steps: 0, resyncs: 0 };
    var dt = Math.max(1, t - w.t0);
    var o = {
      t: r1((w.t0 - c.t0) / 1000), s: r1(dt / 1000),
      rtt: stat(w.rtt), ice: stat(w.ice),
      fps: r1(w.frames * 1000 / dt), worst: Math.round(w.worst), slow: w.slow,
      waits: w.waits, waitMs: Math.round(w.waitMs),
      rb: w.dN ? [r1(w.dSum / w.dN), w.dMax] : null,
      sent: (st.sent || 0) - L.sent, recv: (st.recv || 0) - L.recv, kbOut: r1(((st.bytesOut || 0) - L.bytesOut) / 1024), steps: (st.steps || 0) - L.steps,
      adv: w.advMax > -1e9 ? [r1(w.advMin), r1(w.advMax)] : null,
      unstMs: Math.round(w.unstMs), hidMs: Math.round(w.hidMs), st: s.status
    };
    if (s.flStats) o.fl = flSnap(s.flStats);
    c.lastSt = { sent: st.sent || 0, recv: st.recv || 0, bytesOut: st.bytesOut || 0, steps: st.steps || 0, resyncs: st.resyncs || 0 };
    if (c.wins.length < MAX_WIN) c.wins.push(o); else c.winDrop = (c.winDrop || 0) + 1;
    if (FORCE && root.console) console.info('[netlog] ventana ' + JSON.stringify(o));
    c.win = newWin(t);
  }

  function frame(net, r) {
    if (!net || !net.sess) return;
    if (!cur || cur.sess !== net.sess) { begin(net); if (!cur) return; }
    var c = cur, s = c.sess, w = c.win, t = pnow();
    if (c.ended) return;
    // frame
    if (c.lastF) {
      var fd = t - c.lastF; w.frames++;
      if (fd > w.worst) w.worst = fd;
      if (fd > 50) w.slow++;
      if (r.status === 'waiting') w.waitMs += fd;
      if (r.unstable) w.unstMs += fd;
      if (root.document && document.hidden) w.hidMs += fd;
    }
    c.lastF = t;
    // ping de la app (crudo, cada segundo)
    if ((s.rttSeq || 0) !== c.lastSeq) { c.lastSeq = s.rttSeq || 0; if (s.rttLast > 0) w.rtt.push(s.rttLast); }
    // ping de la red y tipo de conexión (WebRTC)
    if (t - c.lastIce > ICE_MS && c.link && c.link.info) {
      c.lastIce = t;
      try {
        var inf = c.link.info();
        if (inf && inf.rtt > 0) w.ice.push(inf.rtt);
        if (inf && inf.type) {
          var cn = inf.type + '/' + (inf.rtype || '?') + '/' + (inf.proto || '?') + (inf.relayProto ? '/' + inf.relayProto : '');
          if (cn !== c.conn) { if (c.conn) ev(c, t, 'ruta', { de: c.conn, a: cn }); c.conn = cn; }
        }
      } catch (e) { }
    }
    // rollback y ventaja
    var st = s.stats || {};
    if (r.status === 'playing' || r.status === 'waiting') {
      if (typeof st.depth === 'number') { w.dSum += st.depth; w.dN++; if (st.depth > w.dMax) w.dMax = st.depth; }
      if (typeof s.adv === 'number') { if (s.adv < w.advMin) w.advMin = s.adv; if (s.adv > w.advMax) w.advMax = s.adv; }
    }
    // sucesos
    if (r.status !== c.status) {
      if (r.status === 'waiting') { c.waitT = t; w.waits++; }
      if (c.status === 'waiting' && c.waitT >= 0) { var wm = t - c.waitT; if (wm > 250) ev(c, t, 'espera', { ms: Math.round(wm) }); c.waitT = -1; }
      if (r.status === 'playing' && !c.played) { c.played = true; ev(c, t, 'juega'); }
      if (r.status === 'over' || r.status === 'ended') ev(c, t, r.status === 'over' ? 'final' : 'cerrada');
      c.status = r.status;
    }
    if (!!r.unstable !== c.unst) { c.unst = !!r.unstable; ev(c, t, c.unst ? 'inestable' : 'estable'); }
    if (!!r.solo !== c.solo) { c.solo = !!r.solo; ev(c, t, c.solo ? 'contra_ia' : 'vuelve_rival'); }
    if ((st.resyncs || 0) !== c.resyncs) { if (c.played) ev(c, t, 'resync', { n: st.resyncs || 0 }); c.resyncs = st.resyncs || 0; }
    if (typeof s.cmpBad === 'number' && s.cmpBad !== c.cmpBad) { if (s.cmpBad >= 0) ev(c, t, 'huella_distinta', { tic: s.cmpBad }); c.cmpBad = s.cmpBad; }
    if (s.flStats) {   // Fluida: el marcador o su resumen no cuadran con el del rival
      var pb = s.flStats.ptBad | 0, db = s.flStats.digestBad | 0;
      if (pb > c.ptBad || db > c.digestBad) ev(c, t, 'marcador_distinto', { pt: pb, resumen: db });
      c.ptBad = pb; c.digestBad = db;
    }
    if (r.gone && !c.gone) { c.gone = true; ev(c, t, 'abandono'); }
    if (r.result && !c.res) { c.res = r.result; ev(c, t, 'resultado', { gana: !!r.result.win, why: r.result.why || '', noValido: !!r.result.unverified }); }
    // ventana de 10 s
    if (t - w.t0 >= WIN_MS) closeWin(c, t);   // (en memoria: nada sale por la red hasta el final)
  }

  function report(c) {
    var s = c.sess, net = c.net, st = s.stats || {}, g = s.opts || {};
    return {
      v: 1, ver: VB.VERSION || '', modelo: s.model || 'precisa', id: c.id, ini: new Date(c.wall).toISOString(), dur: r1((pnow() - c.t0) / 1000),
      yo: String(net.name || '').slice(0, 24), rival: String(s.rivalName || net.rival || '').slice(0, 24), rol: net.slot === 0 ? 'anfitrion' : 'invitado',
      epoca: net.epoch | 0, delay: s.delay | 0, opts: { fmt: g.format || '', venue: g.venue || '', pts: g.points || 0, bo: g.bestOf || g.bo || 0 },
      env: c.env, conn: c.conn || '', estado: s.status,
      total: { frames: st.frames || 0, steps: st.steps || 0, maxDepth: typeof st.maxDepth === 'number' ? st.maxDepth : null, waits: st.waits || 0, resyncs: st.resyncs || 0, sent: st.sent || 0, recv: st.recv || 0, kbOut: r1((st.bytesOut || 0) / 1024) },
      fl: s.flStats ? flSnap(s.flStats) : undefined,
      res: c.res ? { gana: !!c.res.win, why: c.res.why || '', noValido: !!c.res.unverified } : null,
      wins: c.wins, ev: c.ev, drop: (c.winDrop || c.evDrop) ? { wins: c.winDrop || 0, ev: c.evDrop || 0 } : undefined
    };
  }

  function flush(c, last) {
    if (!c || c.noWrite) return;
    if (c.busy && !last) { c.again = true; return; }
    var A = VB.Account, base = String(A && A.FS_BASE || '').replace(/\/+$/, '');
    var rep = report(c), j = JSON.stringify(rep);
    while (j.length > MAX_J && rep.wins.length > 6) { rep.wins.splice(3, Math.max(1, Math.floor(rep.wins.length / 4))); rep.cut = true; j = JSON.stringify(rep); }
    if (FORCE && root.console && last) console.info('[netlog] informe ' + j.length + ' B');
    if (!base || !A.netAuth || typeof fetch === 'undefined' || Q.netemu) return;
    c.busy = true;
    A.netAuth().then(function (a) {
      if (!a || !a.uid || !a.token) throw new Error('sin cuenta');
      var body = JSON.stringify({ fields: { uid: { stringValue: a.uid }, ver: { stringValue: String(VB.VERSION || '') }, t: { timestampValue: new Date().toISOString() }, j: { stringValue: j } } });
      return fetch(base + '/netlogs/' + a.uid + '_' + c.id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': 'application/json' }, body: body, keepalive: last && body.length < 60000 })
        .then(function (res) { if (res.status === 403 || res.status === 401) c.noWrite = true; if (FORCE && root.console) console.info('[netlog] guardado ' + res.status); });
    }).catch(function (e) { if (FORCE && root.console) console.info('[netlog] sin guardar: ' + (e && e.message)); })
      .then(function () { c.busy = false; if (c.again) { c.again = false; flush(c, false); } });
  }

  function end(net, why) {
    var c = cur;
    if (!c || (net && c.net !== net)) return;
    if (c.ended) return;
    var t = pnow();
    ev(c, t, 'fin', { why: String(why || '') });
    if (t - c.win.t0 > 1000) closeWin(c, t);
    c.ended = true; cur = null;
    flush(c, true);
  }

  // cerrar la pestaña a mitad: el informe sale con lo que haya (keepalive)
  if (root.addEventListener) root.addEventListener('pagehide', function () { if (cur) end(cur.net, 'pestaña'); });

  VB.NetLog = { begin: begin, frame: frame, end: end, _cur: function () { return cur; }, _report: function () { return cur ? report(cur) : null; } };
})();
