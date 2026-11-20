/* =====================================================================
 * MAKE THE CUT — js/netconfig.js   (owner: net)
 * Configuración OPCIONAL de la red del online. Vacía por defecto: el juego usa los STUN públicos de js/netrtc.js y la conexión
 * es directa (cada rival puede ver la dirección de red del otro dentro de la negociación de WebRTC; el juego nunca la enseña).
 *
 * TURN para ocultar la dirección de red (notes/net.md «Robustez y privacidad»): si VB.NET_ICE trae servidores TURN, js/netrtc.js
 * los usa con iceTransportPolicy 'relay' (todo pasa por el TURN: el rival solo ve la dirección del TURN). Si con TURN no conecta
 * a tiempo, se vuelve a probar en directo (STUN) en la siguiente negociación.
 *   VB.NET_ICE = { turn: [{ urls: ['turn:…:3478?transport=udp', 'turns:…:443?transport=tcp'], username: '…', credential: '…' }],
 *                  relayOnly: true };
 * NUNCA pongas aquí credenciales fijas de larga duración en un repositorio público: usa credenciales temporales (p. ej. las que
 * da Cloudflare Calls TURN por su API) servidas desde fuera, o un TURN propio con credenciales de caducidad corta.
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (!VB.NET_ICE) VB.NET_ICE = null;   // (sin TURN)
})();
