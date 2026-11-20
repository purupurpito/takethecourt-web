/* =====================================================================
 * MAKE THE CUT — js/update.js
 * Aviso de versión nueva (19-nov-2026, Ferran: «si un teléfono está en una versión anterior le salte un aviso en la pantalla de
 * reiniciar»). El móvil que se queda con el juego abierto (o la app instalada) no recarga: con una versión anterior no puede jugar
 * online con quien ya tiene la nueva (el saludo compara VB.VERSION).
 *   - Pregunta a Pages por version.json (lo escribe tools/build-pages.js; ?t= y no-store: ni la caché del navegador ni la de Pages)
 *     al arrancar (a los 4 s), al volver a la pestaña (como mucho cada 5 min) y al entrar en el Online (VB.Update.check(true)).
 *   - Si la publicada es más nueva: hoja «Hay una versión nueva» con «Reiniciar» (recarga con ?u= para saltarse la caché del index) y
 *     «Luego». Nunca durante un partido: espera a que acabe. Con «Luego» no vuelve a salir hasta otra versión o hasta entrar en el Online.
 *   - Sin red, en file:// o sin version.json no hace nada. Pruebas: &vnew=X.Y.Z hace como si la publicada fuera X.Y.Z (sin pedir nada).
 * API: VB.Update.check(force) · .cmp(a, b) (-1/0/1, por números) · .latest (la publicada más nueva que se ha visto, o '') ·
 *      .outdated() (hay una más nueva que la mía) · .note(v) (versión de una sala o del rival: si es más nueva, cuenta) · .show(force) · .reload() · .versionText(rv) (texto del online según quién está atrás).
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var Q = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } })();
  var FAKE = /^\d+(\.\d+)*$/.test(Q.get('vnew') || '') ? Q.get('vnew') : '';
  var U = { latest: '', dismissed: '', lastAt: 0, busy: false, wait: null, open: null };

  function cmp(a, b) {
    var x = String(a || '').split('.'), y = String(b || '').split('.'), n = Math.max(x.length, y.length);
    for (var i = 0; i < n; i++) { var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0; if (p !== q) return p > q ? 1 : -1; }
    return 0;
  }
  function mine() { return VB.VERSION || ''; }
  function outdated() { return !!U.latest && !!mine() && cmp(U.latest, mine()) > 0; }
  function playing() { var c = VB.ctx; return !!(c && (c.state === 'playing' || c.state === 'paused')); }

  function reload() {
    try { var u = new URL(location.href); u.searchParams.set('u', Date.now().toString(36)); u.searchParams.delete('vnew'); location.replace(u.toString()); }
    catch (e) { location.reload(); }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Enseña la hoja si hay versión nueva (force: aunque se dijera «Luego»). Durante un partido espera a que acabe. */
  function show(force) {
    if (!outdated() || U.open) return false;
    if (!force && U.dismissed === U.latest) return false;
    if (playing()) { if (!U.wait) U.wait = setInterval(function () { if (!playing()) { clearInterval(U.wait); U.wait = null; show(force); } }, 1500); return false; }
    var S = VB.Splat;
    var html = '<p>Tienes la <b>' + esc(mine()) + '</b> y ya está la <b>' + esc(U.latest) + '</b>.</p>' +
      '<p>Reinicia el juego para actualizarlo. Para jugar online, los dos tenéis que tener la misma versión.</p>';
    if (S && S.sheet) {
      U.open = S.sheet({ title: 'Hay una versión nueva', html: html, cls: 'vb-upd',
        actions: [{ label: 'Luego', cls: 'sp-cream', fn: function () { U.dismissed = U.latest; } },
          { label: 'Reiniciar', primary: true, id: 'updReload', fn: function () { reload(); return false; } }],
        onClose: function () { U.open = null; if (U.dismissed !== U.latest) U.dismissed = U.latest; } });
    } else if (window.confirm && confirm('Hay una versión nueva del juego (' + U.latest + '). ¿Reiniciar ahora?')) reload();
    else U.dismissed = U.latest;
    return true;
  }

  /** Pregunta por la versión publicada; force: enseña la hoja aunque se dijera «Luego» (al entrar en el Online). */
  function check(force) {
    if (FAKE) { U.latest = FAKE; show(force); return; }
    if (U.latest && outdated()) { show(force); return; }
    if (U.busy || location.protocol === 'file:' || typeof fetch !== 'function') return;
    var now = Date.now();
    if (!force && now - U.lastAt < 5 * 60 * 1000) return;
    U.lastAt = now; U.busy = true;
    fetch('version.json?t=' + now.toString(36), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      U.busy = false;
      if (j && typeof j.v === 'string' && /^\d+(\.\d+)*$/.test(j.v) && (!U.latest || cmp(j.v, U.latest) > 0)) U.latest = j.v;
      show(force);
    }).catch(function () { U.busy = false; });
  }

  /** Texto del online cuando el saludo no cuadra (result.why 'version'); rv = versión del rival si llegó. */
  function versionText(rv) {
    var me = mine();
    if (rv) note(rv);
    if ((rv && cmp(rv, me) > 0) || (!rv && outdated())) { show(false); return 'Tienes una versión anterior del juego: reinicia para actualizarlo'; }
    if (rv && cmp(rv, me) < 0) return 'Tu rival tiene una versión anterior del juego: tiene que reiniciarlo';
    return 'Tu rival tiene otra versión del juego: reiniciad los dos';
  }

  /** Versión que llega de fuera (sala de la lista, saludo del rival): si es más nueva que la mía, cuenta como publicada. → cmp con la mía. */
  function note(v) {
    v = String(v || ''); if (!/^\d+(\.\d+)*$/.test(v) || !mine()) return 0;
    if (cmp(v, mine()) > 0 && (!U.latest || cmp(v, U.latest) > 0)) U.latest = v;
    return cmp(v, mine());
  }
  U.note = note; U.check = check; U.cmp = cmp; U.outdated = outdated; U.show = show; U.reload = reload; U.versionText = versionText;
  VB.Update = U;

  setTimeout(function () { check(false); }, 4000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(false); });
})();
