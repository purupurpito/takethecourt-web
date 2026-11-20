/* MAKE THE CUT — js/ambiente.js (owner: ui_main / carrera; paquete P1 del «Ambiente de Carrera», notes/ambiente.md)
 * Director del ambiente de los partidos JUGADOS de la Carrera (VB.Ambiente): grada viva (local / visitante, calor, cánticos, pitadas,
 * ola, silencio tenso), discusiones con el árbitro (protestas de la IA y tu elección «Protestar / Dejarlo»), tarjetas con el punto de
 * castigo de la roja, pique entre equipos y diálogos cortos según lo que pasa.
 *
 * Puro: sin DOM, sin THREE, sin g.rng, sin Math.random ni Date, sin escribir en la partida. El azar es hash01(semilla, n, sal): misma
 * partida + mismas elecciones del jugador → mismo ambiente. El reloj es g.time (se para con la pausa, la revisión y la repetición).
 * Comunica con eventos `amb:*` que main.js añade al array del frame (después del grabador de repeticiones); Arena, Audio, Players,
 * UI y AmbienteUI los consumen. La sim solo se entera por las 3 puertas de sim.js (Sim.holdFor / canPenalty / penalty), que main.js
 * aplica con lo que devuelve frame() (ctl).
 *
 * Árbitro: si existe VB.Arbitro (js/arbitro.js, paquete P3) decide la disputa y la sanción; si no, una versión mínima interna (ARB_LOCAL)
 * con la misma forma, para que el director funcione solo.
 *
 * API (notes/ambiente.md §4.3):
 *   create(o) → st        o = { seed, hall, level, mode:'full'|'calm', trial, amb (cs.amb), me:{name,num}, mate:{name,num}|null, names,
 *                              rivalP:{name}|null, boss:{nick}|null, faro, club, rivalClub, rate(kind, color|d, txt), main }
 *   feed(st, e, g)        evento de la sim (career.js ingest, o main.js en la escena de prueba)
 *   undo(st)              punto anulado por challenge (career.js unpoint)
 *   frame(st, g, dt, out, f) → ctl {hold, lock, penalty, pcard, ppid}   f = {intro, ff, bench, reduce, replay}
 *   choose(st, id, pick) → bool ;  choiceOpen(st) → id | 0 ;  skip(st) (la pausa se ha recortado)
 *   crowd(st) / crowdOf(g) ;  sum(st) ;  penaltyDone(st, ok) ;  bind(g, st) / of(g)
 *   BANK, TRIG, PRI (datos, para las pruebas)
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  function hash01(a, b, c) {   // [0,1) determinista (el de consignas.js)
    var h = (Math.imul(a | 0, 0x9e3779b1) + Math.imul(b | 0, 0x85ebca77) + Math.imul(c | 0, 0xc2b2ae3d)) | 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function strH(s) { s = String(s || ''); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ------------------------------------------------------------------ constantes
  var LV = { low: 1.1, mid: 1, high: 0.9, top: 0.8 };          // protestas automáticas por nivel
  var SEV = { low: 0.8, mid: 1, high: 1.1, top: 1.25 };        // severidad del 1r (solo ARB_LOCAL)
  var CHOICE = { dur: 2.4, hold: 3.4, max: 1, gap: 8, at: 0.45 };
  var SEQ = { protest: 0.35, ref: 0.8, card: 1.6, pen: 1.0, cardHold: 2.6 };
  var COOL_WHO = 3, RECENT = 12;
  var PRI = { low: 0, normal: 1, big: 2, must: 3 };
  // probabilidad de decir algo en un punto con candidatos de prioridad 0/1 («Completo»); prioridad ≥ 2: siempre (con enfriamiento)
  var TALK = [0.18, 0.48];   // (subido tras quitar protestas «tocado» sin sentido: 1 frase cada 3-4 puntos)

  // ------------------------------------------------------------------ banco de frases
  // Comodines: {me} {mate} {rival} {club} {rivalClub} {home} {away} {city} {n} {set} {venue} {name}. Todo neutro de género.
  // Cada clave: { quién: 'frase|frase|…' }. La prueba tools/ambientetest.js las pasa por el filtro (longitud, palabras, comodines).
  var BANK = {
    welcome: {
      speaker: '¡Os damos la bienvenida a {venue}!|¡Arriba ese {home}, que se oiga!|¡Hoy la grada empuja! ¡Vamos, {home}!|¡Qué ambientazo hoy en {venue}!|¡Afición de {city}, a por todas!|¡Empieza el partido! ¡Vamos, {home}!|¡Llenazo en {venue}! ¡A disfrutar!|¡Palmas para {home}, que salen a la arena!'
    },
    welcomeN: {
      speaker: '¡Gran final en {venue}!|¡Que gane quien mejor juegue!|¡Todo listo para la final!|¡Final! ¡Aplauso para los dos equipos!|¡Esto es una final, afición!|¡Llega el gran partido del año!'
    },
    welcomeD: {
      speaker: '¡Derbi en {city}! ¡Que se oiga!|¡Esto es un derbi, afición!|¡Derbi! ¡Todo el mundo de pie!|¡Hoy {city} se para! ¡Vamos, {home}!|¡Derbi en {venue}! ¡A rugir!|¡Partido de los que se recuerdan!'
    },
    // playa: el «derbi» es el duelo con tu rival personal o con el jefe del circuito (no hay ciudad de por medio)
    welcomeDu: {
      speaker: '¡Duelo de altura en {venue}!|¡Hoy hay cuentas pendientes!|¡Duelo con historia! ¡A disfrutar!|¡Partido con rivalidad! ¡Que se oiga!|¡Llega el duelo que esperábamos!|¡Mucha tela en este duelo, afición!'
    },
    // (la previa se dice en la primera bola muerta: nada de «primer punto» ni de historial que no se mira)
    pre: {
      rival: 'Hoy no os lleváis nada.|A ver si hoy aguantas.|Esta vez va en serio.|Te tengo ganas.|Hoy la pista es nuestra.|Esto acaba de empezar.',
      mate: 'Disfrutemos, que esto es lo bonito.|Saque seguro y a jugar.|Hoy se gana con la cabeza.|Paso a paso, ¿vale?|Tú y yo. Como siempre.|Sin prisas, que esto es largo.|A pasarlo bien, {me}.|Buen comienzo. Seguimos.',
      team: 'Vamos, que hoy sale.|Cabeza y saque, como entrenamos.|Hoy se nota el trabajo.|Paso a paso, equipo.|Sin prisas, que esto es largo.|A lo nuestro.',
      coach: 'Lo hablado: saque tenso y paciencia.|Jugad a lo nuestro.|Que nos vean con ganas.|Recepción limpia y a correr.|Disfrutad. Esto es lo bonito.|Paciencia. Esto es largo.'
    },
    // revancha (career.js ambCtx: el último cruce con este rival lo perdisteis)
    preRev: {
      rival: '¿Venís a por la revancha?|Lo de la otra vez se repite.|Ya os ganamos una vez.|Otra vez nosotros, ¿eh?|¿Os acordáis de la última?|Hoy, más de lo mismo.',
      mate: 'Hoy toca devolverla.|Nos deben una.|La última se la llevaron. Hoy, no.|Esta la tenemos marcada.|Revancha. Con calma.|Hoy se cobra la de antes.',
      team: 'Hoy toca devolverla.|Nos deben una, equipo.|La última se la llevaron. Hoy, no.|Esta la tenemos marcada.|Revancha. Con cabeza.|Hoy se cobra la de antes.'
    },
    preDu: {
      rival: 'Tú y yo otra vez.|Hoy se ve quién es mejor.|Llevo semanas esperando esto.|Te tengo ganas, ¿eh?|A ver qué traes hoy.|Esta vez no te escapas.',
      mate: 'Es tu duelo. Cabeza fría.|Que no te pique, ¿eh?|Juega lo nuestro, no lo suyo.|Hoy lo disfrutamos.|Tranqui, que le ganamos jugando.|Con calma, que quiere picarte.'
    },
    preD: {
      rival: 'Derbi. Aquí no se regala nada.|Esta ciudad es nuestra.|Hoy se ve quién manda aquí.|Vas a oír a nuestra grada.|En el derbi no hay favoritos.|Nos vemos en la red.',
      mate: 'Es el derbi. Sangre fría.|Que griten. Nosotros, a jugar.|El derbi se gana con calma.|Hoy vale doble. A por ello.|No te pique nadie, ¿eh?|Esto se juega con la cabeza.',
      team: 'Derbi. Nadie se esconde.|Hoy vale doble, equipo.|Que se oiga en toda la ciudad.|Un derbi no se juega, se gana.|Calma, que nos quieren picar.|Pase lo que pase, juntos.'
    },
    streakUs: {
      mate: '¡Seguimos, seguimos!|¡Esta racha no se toca!|¡Que no pare!|¡Así, así!|¡Vamos, que les cuesta!|¡Uno más y otro!|¡Estamos que nos salimos!|¡Qué bien lo estamos haciendo!',
      team: '¡Seguimos, seguimos!|¡Esta racha no se toca!|¡Que no pare!|¡Les cuesta! ¡A por el partido!|¡Otro! ¡Y otro!|¡Así se juega, equipo!',
      speaker: '¡{n} seguidos! ¡Vamos, {home}!|¡Esto es un vendaval!|¡Racha de {home}! ¡Más fuerte!|¡No para, no para!|¡{n} puntos seguidos! ¡Arriba!|¡La grada lo empuja!'
    },
    streakThem: {
      coach: 'Calma. Punto a punto.|Seguro en recepción y salimos.|Respirad. Esto se gira.|Un punto y cortamos esto.|Paciencia, que llega.|Saque dentro y a defender.',
      mate: 'Tranqui, que los cortamos.|Un punto y salimos.|Calma, calma.|Vamos, que esto se gira.|Respira. Siguiente.|Sin nervios, que llega el nuestro.',
      team: 'Tranqui, que lo cortamos.|Un punto y salimos.|Cabeza fría, equipo.|Esto se gira, ya veréis.|Sin dramas. Siguiente.|Respirad y a defender.',
      speaker: '¡{n} seguidos! ¡Vamos, {home}!|¡Racha de {home}! ¡Más fuerte!|¡La grada lo empuja!|¡Imparables! ¡Vamos!|¡Esto es un vendaval!|¡Que no pare la fiesta!',
      rival: '¡Esto ya es nuestro!|¡No nos paráis!|¡Vamos, que se rinden!|¡Seguimos!|¡Otro más para la cuenta!|¡Hoy no salís de esta!'
    },
    myErr: {
      mate: 'Siguiente. Esa ya pasó.|Tranqui, la próxima es tuya.|Olvídala.|No pasa nada, {me}.|Va, a por la siguiente.|Cabeza arriba.|Esa no cuenta. La próxima.|Respira y a por otra.',
      team: 'Siguiente. Esa ya pasó.|Tranqui, la próxima es tuya.|Olvídala, {me}.|Cabeza arriba.|Va, a por la siguiente.|No pasa nada.',
      rival: '¡Gracias por el regalo!|¡Sigue así!|Muy amable.|¡Esa nos viene genial!|Otra así y nos vamos.|¡Qué detalle!'
    },
    myErr2: {
      mate: 'Tranqui, {me}. Bola segura.|Respira. Juega seguro.|Menos fuerza, más dirección.|Busca la zona, no la potencia.|Calma, que lo sacamos.|Seguro, {me}. Sin arriesgar.',
      coach: 'Cabeza, {me}. Juega seguro.|Menos fuerza, más dirección.|Seguro, {me}. Sin arriesgar.|Respira, {me}. Tú sabes.|Busca la zona, no la potencia.|Calma, {me}. Bola segura.'
    },
    myKill: {
      mate: '¡Qué fuerza!|¡Eso no lo para nadie!|¡Toma ya!|¡Qué golpe, {me}!|¡Esa sí!|¡Así, {me}!|¡Brutal!|¡Imparable!',
      team: '¡Qué fuerza!|¡Eso no lo para nadie!|¡Toma ya!|¡Qué golpe, {me}!|¡Así se remata!|¡Brutal!',
      tv: '¡Qué potencia de {me}!|Remate imparable.|Eso va al resumen.|Qué brazo tiene {me}.|Golpe de calidad de {me}.|Ni lo han visto pasar.'
    },
    myAce: {
      mate: '¡Ace! ¡Otro así!|¡Directo, qué saque!|¡Bien sacado, {me}!|¡Eso es saque!|¡Ni la han visto!|¡Sigue así, {me}!',
      team: '¡Ace! ¡Otro así!|¡Qué saque, {me}!|¡Directo!|¡Sigue sacando así!|¡Ni la han olido!|¡Bravo!',
      speaker: '¡Ace de {me}!|¡Saque directo! ¡Aplauso!|¡Qué saque! ¡Arriba!|¡Ace! ¡La grada se viene arriba!'
    },
    myBlock: {
      rival: 'Vale, vale…|Me la guardo.|Esa la apunto.|Bien puesta. La próxima, no.|Uf, menuda pared.|Lo veremos en la siguiente.',
      mate: '¡Paredón!|¡Qué bloqueo!|¡No pasa nadie!|¡Arriba esas manos!|¡Así se cierra!|¡Muro!'
    },
    theirBlock: {
      rival: '¡Aquí no pasa nada!|¡Prueba otra vez!|¡Esta pared es nuestra!|¡Por aquí no!|¡Otra vez a la mano!|¡La pared está cerrada!',
      mate: 'Busca las manos, que se abren.|Juega la línea.|Usa el bloqueo, que está alto.|Por encima no, por el lado.|Dale a la mano de fuera.|Cambia, que te esperan.',
      coach: 'Juega con el bloqueo.|Busca la mano de fuera.|Más alto, más rápido.|No te empeñes en la diagonal.|Mira antes de rematar.|Cambia el golpe.'
    },
    spUs: {
      mate: 'Esta es nuestra.|Una más y es nuestro.|Venga, que la tenemos.|Cierra con la cabeza.|Último empujón.|Saque seguro y la cerramos.',
      team: 'Esta es nuestra.|Una más, equipo.|Venga, que la tenemos.|Último empujón.|Cerramos ya.|Con calma, que es nuestro.'
    },
    spThem: {
      coach: 'Saque dentro. Sin regalos.|Aguantamos y salimos.|Un punto cada vez.|Defensa y a contraatacar.|Aquí no se rinde nadie.|Uno, solo uno.',
      mate: 'Aguantamos. Una cada vez.|Aquí no se rinde nadie.|Una y la salvamos.|Defensa, que esto no acaba.|Venga, que podemos.|Tranqui, salimos de esta.'
    },
    matchPoint: {
      speaker: '¡Punto de partido! ¡Todo el mundo de pie!|¡Punto de partido para {home}!|¡Uno más y es nuestro! ¡Arriba!|¡Bola de partido! ¡Más fuerte!|¡Que se oiga en {city}!|¡A un punto! ¡Vamos!'
    },
    matchPointN: {
      speaker: '¡Punto de partido!|¡Bola de partido! ¡Silencio en {venue}!|¡A un punto del título!|¡Todo se decide aquí!'
    },
    saved: {
      speaker: '¡Salvado! ¡Aquí no se rinde nadie!|¡Qué manera de salvarla!|¡Seguimos en pie!|¡Salvada! ¡Arriba esa grada!|¡No se rinde nadie en {venue}!|¡Salvado con el corazón!',
      mate: '¡Salvada! ¡Vamos!|¡Aquí seguimos!|¡De aquí no nos echan!|¡Esa es la actitud!|¡Seguimos en pie!|¡Seguimos, seguimos!',
      team: '¡Salvada! ¡Vamos!|¡Aquí seguimos!|¡No nos echa nadie!|¡En pie, equipo!|¡Esa es la actitud!|¡Una más!'
    },
    comeback: {
      tv: '¡Remontada en marcha!|Partido nuevo en {venue}.|Esto ha cambiado por completo.|Quién lo iba a decir hace un rato.|Qué reacción de {club}.|Vuelta al marcador. Todo igualado.',
      speaker: '¡Empatados! ¡Arriba, {home}!|¡Esto es remontar! ¡Vamos!|¡Lo hemos igualado! ¡Más fuerte!|¡Remontada! ¡Que se oiga!'
    },
    longRally: {
      speaker: '¡Qué punto! ¡Aplauso!|¡Eso es vóley!|¡Qué peloteo! ¡Arriba!|¡Puntazo! ¡Palmas para todo el mundo!|¡Así da gusto!|¡Qué manera de defender!',
      tv: 'Qué peloteo más largo.|Punto de los que gustan.|Ni un balón al suelo.|Defensa de altísimo nivel.|Eso es vóley de verdad.|Aplauso merecido.'
    },
    setUs: {
      mate: 'Uno nuestro. Mismo plan.|Buen set. Que no se relaje nadie.|Así. Saque igual de tenso.|Seguimos igual, que funciona.|Ni un paso atrás.|Les cuesta la diagonal. A por ella.',
      coach: 'Bien. Ahora, mismo plan.|Ni un paso atrás. Seguimos igual.|Buen set. Que no se relaje nadie.|Así. Saque igual de tenso.|Les cuesta la diagonal. A por ella.|Mismo plan, más rápido.',
      speaker: '¡Set para {home}!|¡Primer paso! ¡Set de {home}!|¡Qué set! ¡Aplauso!|¡Set! ¡La grada lo celebra!'
    },
    setThem: {
      mate: 'Un set no es nada. Vamos.|Esto no ha acabado.|Recepción alta y a correr.|Les cuesta la diagonal. A por ella.|Saque al {n}, que sufre.|Respira. Partido nuevo.',
      coach: 'Les cuesta la diagonal. A por ella.|Saque al {n}, que sufre.|Mismo plan, más rápido.|Recepción alta y a correr.|Esto no ha acabado. Cabeza.|Un set no es nada. Vamos.',
      speaker: '¡Set para {home}!|¡Set de {home}! ¡Arriba!|¡Qué set! ¡Aplauso!'
    },
    // Protestas: SIEMPRE desde el equipo que sufre la decisión (D.team; el que la discute). protestIn = la pitaron fuera y la ven dentro;
    // protestOut = la pitaron dentro y la ven fuera (g.call.calledIn); protestTouch = «tocado» en su bloqueo y dicen que no
    protestIn: {
      me: '¡Ha sido dentro!|¡Ha tocado línea!|¡Pero si se ve desde aquí!|¡Mírala bien, por favor!|¡Que la he visto dentro!|¡La línea es dentro!',
      mate: '¡Ha sido dentro!|¡Ha tocado línea!|¡Pero si se ve desde aquí!|¡Mírala bien!|¡Dentro clarísimo!|¡La línea es buena!',
      team: '¡Ha sido dentro!|¡Ha tocado línea!|¡Mírala bien, por favor!|¡Dentro clarísimo!|¡La línea es buena!|¡Pero si se ve desde aquí!',
      coach: '¡Dentro, árbitro!|¡Ha tocado línea!|¡Mírala bien, por favor!|¡Pero cómo va a ser fuera!|¡Venga ya!|¡La línea es dentro!',
      rival: '¡Ha sido dentro!|¡Ha tocado línea!|¡Dentro clarísimo!|¡Venga ya!|¡Mírala bien!|¡La línea es buena!',
      rivalCoach: '¡Dentro, árbitro!|¡Ha tocado línea!|¡Venga ya!|¡Mírala bien, por favor!|¡No puede ser!|¡La línea es dentro!'
    },
    protestOut: {
      me: '¡Ha sido fuera!|¡Fuera, fuera!|¡Eso ha botado fuera!|¡Mírala bien, era fuera!|¡Que la he visto fuera!|¡Pero si se ha ido larga!',
      mate: '¡Ha sido fuera!|¡Fuera clarísimo!|¡Eso ha botado fuera!|¡Mírala bien, por favor!|¡Se ha ido larga!|¡No ha tocado línea!',
      team: '¡Ha sido fuera!|¡Fuera clarísimo!|¡Eso ha botado fuera!|¡Mírala bien, por favor!|¡Se ha ido larga!|¡No ha tocado línea!',
      coach: '¡Fuera, árbitro!|¡Eso es fuera!|¡Mírala bien, por favor!|¡No ha tocado la línea!|¡Venga ya!|¡Ha sido fuera!',
      rival: '¡Ha sido fuera!|¡Fuera clarísimo!|¡Eso ha botado fuera!|¡Venga ya!|¡No ha tocado línea!|¡Mírala bien!',
      rivalCoach: '¡Fuera, árbitro!|¡Eso es fuera!|¡Venga ya!|¡No ha tocado la línea!|¡Mírala bien, por favor!|¡No puede ser!'
    },
    protestTouch: {
      me: '¡No la he tocado!|¡Ni la he rozado!|¡Que no la toco!|¡Mira mis manos, no la toco!|¡No he tocado nada!|¡Ha ido directa fuera!',
      mate: '¡No la ha tocado!|¡Ni la ha rozado!|¡Ha ido directa fuera!|¡No ha tocado nadie!|¡Eso es fuera limpio!|¡Venga ya!',
      team: '¡No la ha tocado!|¡Ni la ha rozado!|¡Ha ido directa fuera!|¡No ha tocado nadie!|¡Eso es fuera limpio!|¡Venga ya!',
      coach: '¡No ha tocado nadie!|¡Ni la ha rozado!|¡Eso es fuera!|¡Venga ya!|¡Mírala bien, por favor!|¡Ha ido directa fuera!',
      rival: '¡No la he tocado!|¡Ni la he rozado!|¡Eso es fuera!|¡Venga ya!|¡No he tocado nada!|¡Fuera limpio!',
      rivalCoach: '¡Ni la ha rozado!|¡Venga ya!|¡Eso es fuera!|¡No ha tocado nadie!|¡No puede ser!|¡Fuera limpio!'
    },
    protestNet: {
      me: '¡No he tocado la red!|¡Ni la he rozado!|¡Ha sido limpio!|¡No he pasado la línea!|¡Eso no es red!|¡Que no la toco!',
      mate: '¡No ha tocado la red!|¡Eso no es red!|¡Ha sido limpio!|¡Ni la ha rozado!|¡Venga ya!|¡Mira la red, está quieta!',
      team: '¡No ha tocado la red!|¡Eso no es red!|¡Ha sido limpio!|¡Ni la ha rozado!|¡Venga ya!|¡Mira la red, está quieta!',
      coach: '¡Eso no es red!|¡Ha sido limpio!|¡Venga ya!|¡Ni la ha rozado!|¡No puede ser!|¡Mírala bien, por favor!',
      rival: '¡No he tocado nada!|¡Eso no es red!|¡Ni la he rozado!|¡Venga ya!|¡No puede ser!|¡Ha sido limpio!',
      rivalCoach: '¡Eso no es red!|¡Venga ya!|¡Ha sido limpio!|¡No puede ser!|¡Ni la ha rozado!|¡Mírala bien!'
    },
    protestAnt: {
      me: '¡Ha pasado por dentro!|¡No ha tocado la antena!|¡Ha entrado limpia!|¡Mírala bien, por favor!|¡Era buena!|¡Venga ya!',
      mate: '¡Ha pasado por dentro!|¡No ha tocado la antena!|¡Era buena!|¡Mírala bien!|¡Ha entrado limpia!|¡Venga ya!',
      team: '¡Ha pasado por dentro!|¡No ha tocado la antena!|¡Era buena!|¡Mírala bien!|¡Ha entrado limpia!|¡Venga ya!',
      coach: '¡Ha pasado por dentro!|¡Ni ha rozado la antena!|¡Mírala bien, por favor!|¡Venga ya!|¡Era buena!|¡No puede ser!',
      rival: '¡Ha pasado por dentro!|¡No ha tocado la antena!|¡Era buena!|¡Venga ya!|¡Mírala bien!|¡No puede ser!',
      rivalCoach: '¡Ha pasado por dentro!|¡Venga ya!|¡Era buena!|¡Mírala bien, por favor!|¡No puede ser!|¡Ni ha rozado la antena!'
    },
    protestFault: {
      me: '¡Eso no son dobles!|¡Ha sido limpio!|¡Pero si ha sido un toque!|¡No puede ser!|¡Eso es exagerar!|¡Venga ya!',
      mate: '¡Ha sido limpio!|¡Eso no es falta!|¡No puede ser!|¡Venga ya!|¡Pero si estaba bien!|¡Eso es exagerar!',
      team: '¡Ha sido limpio!|¡Eso no es falta!|¡No puede ser!|¡Venga ya!|¡Estaba bien!|¡Pero cómo va a ser!',
      coach: '¡Eso no es falta!|¡Ha sido limpio!|¡Venga ya!|¡No puede ser!|¡Eso es exagerar!|¡Estaba bien!',
      rival: '¡Ha sido limpio!|¡Eso no es falta!|¡Venga ya!|¡No puede ser!|¡Estaba bien!|¡Exagerado!',
      rivalCoach: '¡Eso no es falta!|¡Venga ya!|¡No puede ser!|¡Ha sido limpio!|¡Exagerado!|¡Estaba bien!'
    },
    protestChal: {
      me: '¡Pues yo la he visto dentro!|¡Esa máquina no va!|¡Pero si se ve!|¡No me lo creo!|¡Imposible!|¡Que no, que no!',
      mate: '¡No me lo creo!|¡Pero si se ve!|¡Imposible!|¡Esa máquina no va!|¡Que no, que no!|¡Venga ya!',
      team: '¡No me lo creo!|¡Imposible!|¡Pero si se ve!|¡Venga ya!|¡Que no, que no!|¡Esa máquina no va!',
      coach: '¡No me lo creo!|¡Imposible!|¡Venga ya!|¡Pero si se ve!|¡Que no, que no!|¡No puede ser!',
      rival: '¡No me lo creo!|¡Imposible!|¡Venga ya!|¡Que no, que no!|¡Pero si se ve!|¡No puede ser!',
      rivalCoach: '¡Imposible!|¡Venga ya!|¡No me lo creo!|¡Que no, que no!|¡No puede ser!|¡Pero si se ve!'
    },
    calmMate: {
      mate: 'Déjalo, que nos lo cobran.|Venga, a por la siguiente.|No merece la pena.|Calma, que no cambia nada.|Siguiente. Esa ya pasó.|Tranqui, que nos la juegan.',
      team: 'Déjalo, que nos lo cobran.|Venga, a por la siguiente.|No merece la pena.|Calma, equipo.|Siguiente.|Eso no lo cambia nadie.'
    },
    // «Protestar» sin tarjeta: no cambia nada en el marcador, pero el equipo se viene arriba (y tu grada, si la hay)
    backUp: {
      mate: '¡Eso es! Ahora, a por ellos.|Bien dicho. A jugar.|Que sepan que estamos.|Con esa rabia, a por la siguiente.|Mensaje enviado. Siguiente.|Así se defiende al equipo.',
      team: '¡Eso es! A por ellos.|Bien dicho. A jugar.|Que sepan que estamos.|Con esa rabia, equipo.|Mensaje enviado. Siguiente.|Así se defiende al equipo.',
      speaker: '¡La grada está contigo!|¡Que se oiga, afición!|¡Arriba, {home}!|¡Todo el mundo con el equipo!'
    },
    dropWrong: {
      mate: 'Bien. Cabeza fría.|Bien hecho. Siguiente.|Esa nos la deben. A jugar.|Así me gusta. A por la otra.|Sin dramas. Bien.|La próxima la ganamos jugando.',
      team: 'Bien. Cabeza fría.|Bien hecho. Siguiente.|Así, sin dramas.|Esa nos la deben. A jugar.|A por la otra.|Bien llevado.',
      coach: 'Bien, {me}. Cabeza fría.|Así se lleva. Siguiente.|Bien. Que no nos saquen del partido.|Eso es madurez. Seguimos.|Bien hecho. A jugar.|Correcto. A por la otra.'
    },
    ref: {
      ref: 'Decisión tomada.|Lo he visto claro.|Juego.|La decisión no cambia.|Está pitado. Seguimos.|Lo siento, es así.|Lo he visto bien. Seguimos.|Es mi decisión.'
    },
    refCalm: {
      ref: 'Calma, por favor.|Tranquilidad. Seguimos.|Bajad el tono, por favor.|Ya está. A jugar.|Calma, que seguimos.|Por favor, a vuestro sitio.'
    },
    refVerbal: {
      ref: 'Capitán, aquí, por favor.|Ni una más.|Aviso. El próximo, tarjeta.|Último aviso, ¿de acuerdo?|Capitán, que se calmen.|Esto se acaba aquí.'
    },
    refYellow: {
      ref: 'Amarilla. Último aviso.|Ya avisé. Amarilla.|Advertencia. A jugar.|Lo siento. Amarilla.|Amarilla. Se acabó la charla.|Tarjeta amarilla. Y a jugar.'
    },
    refRed: {
      ref: 'Roja. Punto para el rival.|Ya está bien. Roja.|Lo siento. Roja y punto.|Avisé. Roja.|Roja. Seguimos.|Se acabó. Roja.'
    },
    refDelay: {
      ref: 'Retraso. Advertencia.|Tiempo, por favor. Retraso.|A jugar ya. Retraso.|Se acabó la charla.'
    },
    cardTv: {
      tv: 'Amarilla para {name}.|El 1r árbitro no ha dudado.|Advertencia para {name}.|Tarjeta amarilla. Se calienta esto.|Primer aviso serio del 1r.|Amarilla. Ahora toca cuidarse.'
    },
    redTv: {
      tv: 'Roja. Punto para {benef}.|Roja para {name}. Punto de castigo.|El 1r no ha dudado. Roja.|Castigo. Se regala un punto.|Roja. Eso duele en el marcador.|Qué caro sale protestar.'
    },
    redMate: {
      mate: 'Bueno, a recuperarlo.|Venga, que lo arreglamos.|Cabeza. Esto sigue.|Ahora, a jugar.|Se acabó. A por la siguiente.|Tranqui. Lo remontamos.',
      team: 'Bueno, a recuperarlo.|Venga, que lo arreglamos.|Cabeza, equipo.|Ahora, a jugar.|A por la siguiente.|Lo remontamos.'
    },
    redMine: {
      me: 'Culpa mía. Lo arreglo.|Lo siento. Lo recupero.|Me he pasado. Siguiente.|Mea culpa. A jugar.|Ya está. Lo devuelvo jugando.|Lo arreglo en la pista.'
    },
    cardRival: {
      mate: 'Les pueden los nervios. Aprovecha.|Se les va la cabeza. A jugar.|Tú tranqui, que el otro lado se calienta.|A nuestro ritmo.|Que se quejen. Nosotros, a lo nuestro.|Bien. Cabeza fría y a por el partido.',
      team: 'Les pueden los nervios. ¡A jugar!|Se les va la cabeza.|Nosotros, a lo nuestro.|A nuestro ritmo, equipo.|Que se quejen.|Cabeza fría.'
    },
    chalWon: {
      mate: '¡Lo sabía!|¡Bien pedido!|¡Te lo dije!|¡Eso es!|¡Para casa!|¡Justicia!',
      team: '¡Lo sabía!|¡Bien pedido!|¡Eso es!|¡Justicia!|¡Para casa!|¡Bien visto!'
    },
    chalLost: {
      mate: 'Había que intentarlo.|Bueno, por probar.|Vale, era fuera.|Nada, siguiente.|Lo intentamos. Seguimos.|Al menos salimos de dudas.',
      team: 'Había que intentarlo.|Bueno, por probar.|Nada, siguiente.|Lo intentamos.|Salimos de dudas.|A jugar.'
    },
    shh: {
      rival: 'Shhh…|Silencio, que jugamos.|¿Qué se oye? Nada.|Bajad la voz.|Shhh. Concentración.|Tranquilidad, ¿eh?'
    },
    shhReply: {
      mate: 'Ni caso. A jugar.|Que hablen. Nosotros, a ganar.|No entres, {me}.|Ya callarán.|Tú a lo tuyo.|Eso nos da alas.',
      team: 'Ni caso. A jugar.|Que hablen.|No entres al trapo.|Ya callarán.|A lo nuestro.|Eso nos da alas.'
    },
    faro: {
      faro: 'Respira. El siguiente punto es el único que importa.|Juega a tu vóley, no al suyo.|Lo que pasó, pasó. Mira la siguiente bola.|Confía en lo que entrenas.|Los partidos se ganan en los puntos feos.|Cabeza. El marcador ya se moverá.'
    },
    endWin: {
      rival: 'Buen partido.|Bien jugado. Nos vemos.|En la vuelta, otra historia.|Enhorabuena. Hoy has sido mejor.|Felicidades. Merecido.|Tocará revancha.',
      mate: '¡Lo hemos hecho!|¡Qué partidazo!|¡Esto es equipo!|¡Vamos! ¡Para casa!|¡Así se gana!|¡Brutal, {me}!',
      team: '¡Lo hemos hecho!|¡Qué partidazo, equipo!|¡Así se gana!|¡Vamos! ¡Para casa!|¡Esto es equipo!|¡Enorme!'
    },
    endHomeW: {
      speaker: '¡Gracias, afición!|¡Qué partidazo en {venue}!|¡Victoria para {home}!|¡Así se defiende la casa!|¡Hasta la próxima, {city}!|¡Qué manera de ganar!'
    },
    endHomeL: {
      speaker: '¡Gracias, afición!|¡Aplauso para los dos equipos!|¡Hoy no ha podido ser! ¡Gracias!|¡Volveremos más fuertes, {city}!|¡Gracias por empujar hasta el final!|¡Qué partido en {venue}!'
    },
    endLoss: {
      rival: 'Buen partido.|Bien jugado. Nos vemos.|Has dado guerra, ¿eh?|Gran partido. Hasta la próxima.|Nos has hecho sudar. Bien jugado.|Nos vemos en la vuelta.',
      mate: 'Hoy no ha salido. La próxima.|Cabeza alta. Hemos peleado.|Esto se entrena. Volveremos.|Lo hemos dado todo.|Aprendemos y seguimos.|Mañana, a mejorar.',
      team: 'Cabeza alta, equipo.|Hoy no ha salido.|Lo hemos dado todo.|Aprendemos y seguimos.|Volveremos más fuertes.|La próxima es nuestra.'
    },
    endN: {
      speaker: '¡Gracias, afición!|¡Qué final en {venue}!|¡Aplauso para los dos equipos!|¡Final para el recuerdo!'
    }
  };
  // disparador → prioridad por defecto
  var TRIG = { welcome: 2, welcomeN: 2, welcomeD: 2, welcomeDu: 2, pre: 1, preD: 2, preDu: 2, preRev: 2, backUp: 2, protestIn: 3, protestOut: 3, protestAnt: 3, refYellow: 3, refRed: 3, streakUs: 1, streakThem: 1, myErr: 1, myErr2: 2, myKill: 1, myAce: 1, myBlock: 1, theirBlock: 1,
    spUs: 1, spThem: 2, matchPoint: 2, matchPointN: 2, saved: 2, comeback: 2, longRally: 1, setUs: 2, setThem: 2, protestTouch: 3, protestNet: 3,
    protestFault: 3, protestChal: 3, calmMate: 1, dropWrong: 2, ref: 2, refCalm: 2, refVerbal: 3, refDelay: 3, cardTv: 3, redTv: 3, redMate: 2,
    redMine: 3, cardRival: 1, chalWon: 1, chalLost: 1, shh: 2, shhReply: 1, faro: 2, endWin: 3, endLoss: 3, endHomeW: 2, endHomeL: 2, endN: 3 };
  var SPLIT = {};
  function lines(trig, who) {
    var k = trig + '/' + who, a = SPLIT[k];
    if (!a) { var b = BANK[trig], s = b && b[who]; a = SPLIT[k] = s ? s.split('|') : []; }
    return a;
  }
  var NAME = { coach: 'Banquillo', rivalCoach: 'Banquillo rival', ref: '1r árbitro', speaker: 'Megafonía', tv: 'TV', faro: 'Faro' };

  // ------------------------------------------------------------------ árbitro mínimo (si no hay js/arbitro.js)
  var ARB_LOCAL = {
    create: function (o) { return { seed: o.seed | 0, level: o.level || 'mid', heat: +o.heat || 0, mode: o.mode, capt: o.capt || [-1, -1], n: 0, cool: [-99, -99], pts: 0,
      verbal: [0, 0], yellow: [false, false], red: [0, 0], byPid: {}, delay: [0, 0], last: null, lastPt: [-9, -9] }; },
    feed: function (a, e, g) {
      var D = null;
      if (e.type === 'point') {
        a.pts++;
        if (e.penalty) return null;
        var team = 1 - e.team, s = 0, kind = '', wrong = false, c = g && g.call;
        if ((e.reason === 'in' || e.reason === 'out') && e.signal !== 'touched' && c && c.team === team) {
          var d = Math.abs(+c.dist || 0); wrong = !!c.wrong;
          if (d <= 0.10 || wrong) { s = 0.5 + 0.5 * clamp(1 - d / 0.10, 0, 1) + (wrong ? 0.3 : 0); kind = 'line'; }
        } else if (e.signal === 'touched' && e.lastKind === 'block') { s = 0.5; kind = 'touch'; }
        else if (e.reason === 'net' || e.reason === 'under' || e.reason === 'antenna') { s = 0.4; kind = e.reason === 'antenna' ? 'antenna' : 'net'; }
        else if (e.reason === 'double' || e.reason === 'four') { s = 0.35; kind = 'fault'; }
        else if (e.reason === 'position') { s = 0.3; kind = 'fault'; }
        if (s < 0.35) return null;
        D = { id: ++a.n, team: team, kind: kind, strength: Math.min(1, s), wrong: wrong, offer: false, auto: null, canRed: true, pt: a.pts, calledIn: !!(c && c.calledIn) };
      } else if (e.type === 'challengeResult' && !e.overturned && e.team >= 0) {
        D = { id: ++a.n, team: e.team, kind: 'chal', strength: 0.6, wrong: false, offer: false, auto: null, canRed: true, pt: a.pts };
      }
      if (!D) return null;
      // protesta automática (IA): fuerza × calor × nivel × modo, enfriamiento 6 puntos por equipo
      var p = D.strength * (0.25 + 0.5 * a.heat) * (LV[a.level] || 1) * (a.mode === 'calm' ? 0.5 : 1);
      if (a.pts - a.cool[D.team] >= 6 && hash01(a.seed, a.n * 7 + D.team, 0xA4B1) < p) {
        var r = hash01(a.seed, a.n * 7 + 3, 0xA4B2);
        D.auto = { role: r < 0.7 ? 'captain' : r < 0.9 ? 'coach' : 'player', pid: -1 };
      }
      a.last = D;
      return D;
    },
    protest: function (a, D, who, human, canRed) {
      var t = D.team, sev = SEV[a.level] || 1, r = hash01(a.seed, a.n * 13 + (human ? 5 : 1), 0xA4C3), res = 'explain', color = '';
      a.cool[t] = a.pts;
      var k = sev * (who && who.role === 'player' && D.team >= 0 ? 1.2 : 1) * (D.kind === 'chal' ? 1.2 : 1) * (D.wrong ? 0.85 : 1) * (0.85 + 0.3 * a.heat);
      var pid = who ? who.pid : -1, pr = a.byPid[pid];
      if (a.lastPt[t] === a.pts && a.delay[t] < 2) { res = a.delay[t] ? 'delayR' : 'delayY'; color = res; a.delay[t]++; }
      else if (pr && pr.r) { if (r < 0.3 * k) { res = 'red'; color = 'red'; } else res = 'calm'; }
      else if (a.yellow[t]) { if (r < 0.5 * k && canRed) { res = 'red'; color = 'red'; } else res = 'verbal'; }
      else if (a.verbal[t]) { if (r < 0.6 * k) { res = 'yellow'; color = 'yellow'; } else res = r < 0.9 ? 'calm' : 'verbal'; }
      else { if (r < 0.05 * k) { res = 'yellow'; color = 'yellow'; } else if (r < 0.45 * k) res = 'verbal'; else res = r < 0.75 ? 'explain' : 'calm'; }
      if (color === 'delayR' && !canRed) { color = 'delayY'; res = 'delayY'; }
      a.lastPt[t] = a.pts;
      if (res === 'verbal') a.verbal[t]++;
      if (color === 'yellow' || color === 'delayY') a.yellow[t] = true;
      if (color === 'red' || color === 'delayR') a.red[t]++;
      if (color && pid >= -1) { var bp = a.byPid[pid] || (a.byPid[pid] = { y: 0, r: 0 }); if (color === 'red' || color === 'delayR') bp.r++; else bp.y++; }
      var card = color ? { team: t, pid: pid, num: 0, name: '', who: who && who.role === 'coach' ? 'coach' : color.indexOf('delay') === 0 ? 'team' : 'player', color: color, reason: color.indexOf('delay') === 0 ? 'retraso' : D.kind === 'shh' ? 'provocacion' : 'protesta' } : null;
      return { res: res, card: card, penalty: color === 'red' || color === 'delayR' ? t : -1 };   // (equipo SANCIONADO, como VB.Arbitro)
    },
    taunt: function (a, team, pid, heat) {
      var r = hash01(a.seed, ++a.n * 11, 0xA4D4);
      if (r < 0.15) return a.verbal[team] || a.yellow[team] ? ARB_LOCAL.protest(a, { team: team, kind: 'shh', strength: 0.5, wrong: false }, { pid: pid, role: 'player' }, false, false) : (a.verbal[team]++, { res: 'verbal', card: null, penalty: -1 });
      return { res: 'none', card: null, penalty: -1 };
    },
    undo: function (a) { a.last = null; },
    state: function (a) { return { verbal: a.verbal.slice(), yellow: a.yellow.slice(), red: a.red.slice(), byPid: a.byPid, delay: a.delay.slice() }; }
  };
  function ARB() { return VB.Arbitro && VB.Arbitro.create && VB.Arbitro.feed && VB.Arbitro.protest ? VB.Arbitro : ARB_LOCAL; }

  // ------------------------------------------------------------------ estado
  var CTL = { hold: 0, lock: false, penalty: -1, pcard: '', ppid: -1 };
  var CROWD = { on: true, home: 0, fans: [0.55, 0.15], heat: 0.3, energy: [0, 0], boo: [0, 0], hush: 0, chant: null };
  var CHANT = { team: 0, kind: '', k: 0 };
  var bound = { g: null, st: null };

  function create(o) {
    o = o || {};
    var A = o.amb || {}, mode = o.mode === 'calm' || o.trial ? 'calm' : 'full', heat = clamp(+A.heat || 0.3, 0, 1);
    var st = {
      seed: o.seed | 0, hall: !!o.hall, level: o.level || A.level || 'mid', mode: mode, trial: !!o.trial, main: !!o.main,
      home: A.home === 1 || A.home === -1 ? A.home : 0, heat: heat, fans: A.fans && A.fans.length === 2 ? [+A.fans[0] || 0, +A.fans[1] || 0] : [0.55, 0.15],
      tags: Array.isArray(A.tags) ? A.tags.slice(0, 8) : [], city: String(A.city || ''), venue: String(A.venue || ''), short: A.short && A.short.length === 2 ? [String(A.short[0]), String(A.short[1])] : ['', ''],
      capt: A.capt && A.capt.length === 2 ? [A.capt[0] | 0, A.capt[1] | 0] : [0, 0], riv: +A.riv || 0,
      me: o.me || { name: 'Tú', num: 0 }, mate: o.mate || null, rivalP: o.rivalP || null, boss: o.boss || null, faro: !!o.faro,
      club: String(o.club || A.short && A.short[0] || ''), rivalClub: String(o.rivalClub || A.short && A.short[1] || ''), rate: typeof o.rate === 'function' ? o.rate : null,
      // dinámica
      n: 0, idN: 0, pts: 0, now: 0, started: false, ended: false, serveOn: false, ff: false, rep: false,
      q: [], recent: [], spoke: {}, lastSet: 1, setTalk: 0, waveSet: 0, chantPt: -9, faroDone: false, preDone: false,
      streak: [0, 0], deficit: [0, 0], score: [0, 0], myErrN: 0, lastHit: null, lastBlock: null,
      choice: null, choiceN: 0, choicePt: -99, pend: null, penPend: null, cool: false,
      energy: [0, 0], boo: [0, 0], hush: 0, chant: null, chantT: 0,
      cards: [], protests: 0, drops: 0, coldHead: 0, lines: 0, say: 0,
      force: o.force || '', arb: null
    };
    var Ar = ARB();
    st.Ar = Ar; st.arb = null;   // (el árbitro se crea con la primera partida que llega: capitanes y tu atleta por pid)
    return st;
  }
  function bind(g, st) { bound.g = g; bound.st = st; }
  function of(g) {
    if (!g) return null;
    if (bound.g === g && bound.st) return bound.st;
    var K = VB.Career; return K && K.amb ? K.amb(g) : null;
  }

  // ------------------------------------------------------------------ utilidades de partida
  function teamOf(g, t) { return g && g.teams && g.teams[t] || []; }
  function myP(g) { if (!g || !g.teams) return null; if (g.size === 6) return g.ctrl || null; return g.teams[0][0] || null; }
  function pidOf(p) { return p && typeof p.id === 'number' ? p.id : -1; }
  function byPid(g, pid) { if (pid < 0 || !g || !g.teams) return null; for (var t = 0; t < 2; t++) { var T = g.teams[t]; for (var i = 0; i < T.length; i++) if (T[i] && T[i].id === pid) return T[i]; } return null; }
  function onCourt(g) { return !(g && g.ctrlOut); }
  /** Capitán en pista del equipo t (pista: el del acta si está, si no el colocador; playa: el primero). */
  function captOf(st, g, t) {
    var T = teamOf(g, t); if (!T.length) return null;
    if (g.size !== 6) return t === 0 ? (T[1] || T[0]) : T[0];
    var num = st.capt[t] | 0, i;
    if (num > 0) for (i = 0; i < T.length; i++) if (T[i] && T[i].num === num) return T[i];
    for (i = 0; i < T.length; i++) if (T[i] && T[i].role === 'S') return T[i];
    return T[0];
  }
  function mateP(st, g) {   // playa: tu pareja; pista: un compañero en pista (no tú), por hash
    var T = teamOf(g, 0), me = myP(g); if (!T.length) return null;
    if (g.size !== 6) return T[1] || null;
    var c = []; for (var i = 0; i < T.length; i++) if (T[i] && T[i] !== me && T[i].role !== 'L') c.push(T[i]);
    return c.length ? c[Math.floor(hash01(st.seed, st.n++, 0x7EA1) * c.length)] : null;
  }
  function rivalSpeaker(st, g) {   // el rival que pica: rival personal / jefe (n.º 1 rival) o capitán rival
    var T = teamOf(g, 1); if (!T.length) return null;
    return g.size === 6 ? captOf(st, g, 1) : T[0];
  }
  function pName(st, g, p, t) {
    if (!p) return t === 1 ? 'Rival' : 'Compañero';
    if (p.name) return String(p.name);
    if (t === 0) return p === teamOf(g, 0)[1] && st.mate && st.mate.name ? st.mate.name : st.me.name;
    if (st.rivalP && st.rivalP.name && p === teamOf(g, 1)[0]) return st.rivalP.name;
    if (st.boss && st.boss.nick && p === teamOf(g, 1)[0]) return st.boss.nick;
    return (st.rivalClub || 'Rival') + (p.num ? ' · n.º ' + p.num : '');
  }
  /** Nombre propio del atleta p del equipo t, o '' (en la playa los rivales no tienen nombre salvo tu rival personal o el jefe). */
  function realName(st, g, p, t) {
    if (!p) return '';
    if (p.name) return String(p.name);
    if (t === 0) return p === myP(g) ? st.me.name || '' : st.mate && st.mate.name && p === teamOf(g, 0)[1] ? st.mate.name : '';
    if (p === teamOf(g, 1)[0]) return st.rivalP && st.rivalP.name || st.boss && st.boss.nick || '';
    return '';
  }
  function tagged(st, t) { return st.tags.indexOf(t) >= 0; }
  /** Derbi de ciudad (pista) o duelo (playa: tu rival personal o el jefe; career.js ambCtx pone también 'derbi'). */
  function derbyCity(st) { return st.hall && tagged(st, 'derbi'); }
  function duel(st) { return !st.hall && (tagged(st, 'derbi') || tagged(st, 'rival') || tagged(st, 'jefe')); }
  function homeName(st) { return st.home === 1 ? st.rivalClub : st.club; }
  function tgt(g) { var S = VB.Sim; return S && S.setTarget ? S.setTarget(g) : (g.points || 25); }

  // ------------------------------------------------------------------ cola y eventos
  function push(st, at, ev, keep) { ev.amb = true; st.q.push({ at: at, ev: ev, keep: !!keep, pt: st.pts }); return ev; }
  /** Nombre de pila (compañeros, banquillo y Faro te llaman así; megafonía y TV, con el nombre completo). */
  function first(n) { n = String(n || ''); var i = n.indexOf(' '); return i > 0 ? n.slice(0, i) : n; }
  var FIRST = { mate: 1, team: 1, coach: 1, faro: 1 };
  function fill(st, s, v, who) {
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      var r = k === 'me' ? (FIRST[who] ? first(st.me.name) : st.me.name) : k === 'mate' ? (st.mate && st.mate.name || '') : k === 'club' ? st.club : k === 'rivalClub' ? st.rivalClub
        : k === 'home' ? homeName(st) : k === 'away' ? (st.home === 1 ? st.club : st.rivalClub) : k === 'city' ? (st.city || st.venue) : k === 'venue' ? (st.venue || st.city)
        : k === 'rival' ? (st.rivalP && st.rivalP.name || st.rivalClub) : v && v[k] != null ? v[k] : '';
      return String(r);
    }).replace(/\s+([,.!?…])/g, '$1').replace(/¡\s*,/g, '¡').trim();
  }
  /** Elige una frase del banco (evita las últimas RECENT y, dentro del banco, las 2 últimas). null si no hay. */
  function pickLine(st, trig, who, v) {
    var a = lines(trig, who); if (!a.length) return null;
    var off = Math.floor(hash01(st.seed, st.n++, strH(trig + who)) * a.length);
    for (var i = 0; i < a.length; i++) {
      var j = (off + i) % a.length, key = trig + '/' + who + '/' + j;
      if (st.recent.indexOf(key) >= 0) continue;
      var txt = fill(st, a[j], v, who);
      if (/\{|\}/.test(txt) || txt.length < 2) continue;
      return { key: key, text: txt };
    }
    return null;
  }
  /** Programa una frase. sp = {who, team, pid, name}. Devuelve el evento o null. */
  function say(st, at, trig, sp, pri, v, force) {
    if (!sp) return null;
    if (pri == null) pri = TRIG[trig] || 1;
    if (st.mode === 'calm' && pri < 2 && !force) return null;
    if (st.ff || st.rep) return null;
    if (!force && pri < 3 && sp.who !== 'ref' && st.spoke[sp.who] != null && st.pts - st.spoke[sp.who] < COOL_WHO && st.pts > 0) return null;
    var L = pickLine(st, trig, sp.who === 'team' ? 'team' : sp.who, v); if (!L) return null;
    st.recent.push(L.key); if (st.recent.length > RECENT) st.recent.shift();
    st.spoke[sp.who] = st.pts; st.lines++;
    var dur = clamp(1.3 + L.text.length * 0.045, 1.6, 3.2);
    return push(st, at, { type: 'amb:say', id: ++st.idN, who: sp.who, name: sp.name, team: sp.team, pid: sp.pid, text: L.text, dur: dur, pri: pri, key: L.key });
  }
  // hablantes
  function spMe(st, g) { var p = myP(g); return { who: 'me', team: 0, pid: pidOf(p), name: st.me.name || pName(st, g, p, 0) }; }
  function spMate(st, g) { var p = mateP(st, g); if (!p) return null; return { who: g.size === 6 ? 'team' : 'mate', team: 0, pid: pidOf(p), name: pName(st, g, p, 0) }; }
  function spCoach(st, g) { if (g && g.size !== 6) return spMate(st, g); return { who: 'coach', team: 0, pid: -1, name: NAME.coach }; }   // (playa: sin banquillo que dirija; lo dice tu pareja)
  function spRival(st, g) { var p = rivalSpeaker(st, g); return { who: 'rival', team: 1, pid: pidOf(p), name: pName(st, g, p, 1) }; }
  function spOf(who) { return { who: who, team: who === 'rivalCoach' ? 1 : -1, pid: -1, name: NAME[who] || '' }; }
  function spSpeaker(st) { return st.home >= -1 ? spOf('speaker') : null; }
  function spTv(st) { return st.level === 'high' || st.level === 'top' ? spOf('tv') : null; }
  function roll(st, salt) { return hash01(st.seed, st.n++, salt | 0); }

  // ------------------------------------------------------------------ grada
  function ev0(type) { return { type: type, amb: true }; }
  function crowdBoost(st, team, k) { if (team === 0 || team === 1) st.energy[team] = Math.min(1, st.energy[team] + k); }

  // ------------------------------------------------------------------ alimentar
  function arbOf(st, g) {
    if (st.arb) return st.arb;
    var c0 = g && g.size === 6 ? captOf(st, g, 0) : null, c1 = g && g.size === 6 ? captOf(st, g, 1) : null;
    st.arb = st.Ar.create({ seed: st.seed ^ 0x5A17, hall: st.hall, level: st.level, heat: st.heat, mode: st.mode, capt: [c0 ? pidOf(c0) : -1, c1 ? pidOf(c1) : -1], meTeam: 0, mePid: pidOf(myP(g)) });
    return st.arb;
  }
  function feed(st, e, g) {
    if (!st || !e || st.ended && e.type !== 'gameOver') return;
    if (g && typeof g.time === 'number') st.now = g.time;
    var A = st.Ar; arbOf(st, g);
    if (e.type === 'hit') {
      st.lastHit = { team: e.team, pid: pidOf(e.player), kind: e.kind };
      if (e.kind === 'serve') { st.serveOn = true; st.hush = 0; st.boo[0] *= 0.3; st.boo[1] *= 0.3; }
      return;
    }
    if (e.type === 'block') { if (e.result === 'stuff' || e.result === 'kill') st.lastBlock = { team: e.team, pid: pidOf(e.player) }; return; }
    if (e.type === 'whistle' && e.reason === 'serve') { purge(st, true); return; }
    if (e.type === 'serveReady') { onServeReady(st, e, g); return; }
    if (e.type === 'newSet') { st.streak[0] = st.streak[1] = 0; st.deficit[0] = st.deficit[1] = 0; st.score[0] = st.score[1] = 0; return; }
    if (e.type === 'point') { onPoint(st, e, g); return; }
    if (e.type === 'challengeResult') {
      var t = e.team, us = t === 0;
      if (e.overturned) { if (us) say(st, st.now + 0.4, 'chalWon', spMate(st, g)); }
      else {
        if (us) say(st, st.now + 0.4, 'chalLost', spMate(st, g));
        var D = !st.ff ? A.feed(st.arb, e, g) : null;
        if (D) dispute(st, D, g, e);
      }
      return;
    }
    if (e.type === 'gameOver') { st.ended = true; return; }
  }

  function onServeReady(st, e, g) {
    st.serveOn = false;
    if (st.ff || st.rep) return;
    var t = e.team, sp = e.setPoint, mp = e.matchPoint, now = st.now, set = g && g.setNo | 0;
    if (st.booSet !== set) { st.booSet = set; st.booN = 0; }
    // punto de set / partido: el silencio tenso manda (ni pitada ni cánticos a la vez). Solo si el que se defiende es el local con
    // mucha afición, a veces «¡De-fen-sa!» en lugar del silencio
    if (sp >= 0 || mp >= 0) {
      var def = 1 - (mp >= 0 ? mp : sp);
      if (def === st.home && st.fans[def] >= 0.4 && roll(st, 0xDEF1) < 0.35) {
        st.hush = 0; st.chant = { team: def, kind: 'defensa', k: 0.5 + 0.5 * st.heat }; st.chantT = 3;
        push(st, now + 0.1, { type: 'amb:chant', team: def, kind: 'defensa', k: st.chant.k, dur: 3 });
      } else {
        st.hush = 0.55 + 0.4 * st.heat;
        push(st, now, { type: 'amb:hush', k: st.hush, why: mp >= 0 ? 'matchPoint' : 'setPoint' });
      }
      return;
    }
    // pitada al saque rival: la afición local al visitante, con calor >= 0,55; como mucho ~1 de cada 10 saques y 2 por set
    if (st.home >= 0 && t !== st.home && st.heat >= 0.55 && (st.booN < 2 || st.force === 'boo')) {
      var p = Math.min(0.12, 0.05 + (st.heat - 0.55) * 0.2);
      if (st.force === 'boo') p = 1;
      if (roll(st, 0xB00) < p) { st.booN++; var k = 0.4 + 0.6 * st.heat; st.boo[st.home] = Math.max(st.boo[st.home], k); push(st, now, { type: 'amb:whistles', team: t, k: k }); }
    }
  }

  function onPoint(st, e, g) {
    var w = e.team, l = 1 - w, now = st.now, A = st.Ar;
    st.pts++; st.serveOn = false;
    if (e.score) { st.score[0] = e.score[0] | 0; st.score[1] = e.score[1] | 0; }
    st.streak[w]++; st.streak[l] = 0;
    var gap = st.score[l] - st.score[w];
    if (gap > st.deficit[w]) st.deficit[w] = gap;
    crowdBoost(st, w, 0.25 + 0.5 * (+e.highlight || 0));
    if (st.hush) st.hush = 0;
    if (e.penalty) { onPenalty(st, e, g); return; }
    if (st.ff || st.rep) return;
    // disputa (punto dudoso)
    var D = A.feed(st.arb, e, g);
    if (st.force === 'choice' || st.force === 'yellow' || st.force === 'red') D = forced(st, e, g, D);
    var busy = D ? dispute(st, D, g, e) : false;
    if (st.force === 'lines') st.spoke = {};
    talk(st, e, g, busy);
    crowdReact(st, e, g, D);
  }

  /** Escena de prueba: convierte el punto en una disputa en contra de tu equipo (con elección o tarjeta forzada). */
  function forced(st, e, g, D) {
    if (st.forceDone || e.setWon || e.matchWon) return D;
    // (solo un punto discutible de verdad: un bote dentro / fuera o lo que el árbitro ya vea como disputa; nunca una falta de saque)
    var sg = e.signal, ok = D || ((e.reason === 'in' || e.reason === 'out') && sg !== 'serveFault' && sg !== 'netBall' && sg !== 'touched' && e.lastKind !== 'serve');
    if (!ok) return D;
    var T = e.team === 1 ? 0 : st.force === 'choice' ? -1 : 1; if (T < 0) return D;
    st.forceDone = true;
    D = D || { id: 900 + st.pts, team: T, kind: 'line', strength: 0.9, wrong: true, offer: false, auto: null, canRed: true, calledIn: e.reason === 'in' };
    D.team = T; D.forced = st.force;
    if (st.force !== 'choice') D.auto = { role: g.size === 6 ? 'captain' : 'player', pid: -1 };
    return D;
  }

  /** Disputa: tu elección, protesta automática o nada. Devuelve true si ocupa el punto (sin otras frases). */
  function dispute(st, D, g, e) {
    var team = D.team, now = st.now;
    var canRed = D.canRed !== false && !(e && (e.setWon || e.matchWon)) && !redCloses(st, g, team);
    D.canRed = canRed;
    // tu elección: «Completo», en contra de tu equipo, tu jugador en pista, ≤ 2 por partido, separadas 8+ puntos, sin challenge disponible
    var chal = VB.Sim && VB.Sim.canChallenge && g ? VB.Sim.canChallenge(g, team) > 0 : false;
    var offer = st.Ar === ARB_LOCAL ? team === 0 && D.kind === 'line' && st.mode === 'full' && onCourt(g) && st.choiceN < CHOICE.max && st.pts - st.choicePt >= CHOICE.gap && !chal && !st.choice
      : !!D.offer && team === 0 && onCourt(g) && !st.choice;   // (VB.Arbitro ya decide la oferta: modo, tope, separación, challenge)
    if (D.forced) offer = D.forced === 'choice' && !st.choice;   // (escena de prueba: tarjeta forzada = protesta de la IA, sin fichas)
    if (offer) {
      st.choiceN++; st.choicePt = st.pts;
      var isCapt = g.size !== 6 || captOf(st, g, 0) === myP(g), hasY = st.arb && st.Ar.state ? !!(st.Ar.state(st.arb).yellow || [])[0] : false;
      var lab = (isCapt ? 'Protestar' : 'Quejarte') + (hasY ? ' (ya tenéis amarilla)' : '');
      var id = ++st.idN;
      st.choice = { id: id, D: D, at: now + CHOICE.at, until: now + CHOICE.at + CHOICE.dur, open: false, pick: '', by: '', capt: isCapt, done: false };
      st.wantHold = Math.max(st.wantHold || 0, CHOICE.hold);
      // (sin bocadillo del compañero mientras están las fichas: el contexto ya va en ellas y a 844×390 se juntaba todo)
      st.choice.ev = { type: 'amb:choice', id: id, kind: 'protest', opts: [{ k: 'protest', label: lab }, { k: 'drop', label: 'Dejarlo' }], def: 'drop', dur: CHOICE.dur, sub: D.sub || subOf(D) };
      return true;
    }
    if (!D.auto && D.forced) D.auto = { role: 'captain', pid: -1 };
    if (!D.auto) return false;
    // protesta automática (IA): quién protesta
    var who = autoWho(st, g, D);
    if (!who) return false;
    if (team === 0 && who.pid === pidOf(myP(g)) && g.size !== 6) who = autoMate(st, g);   // (en la playa nunca protestas tú solo)
    if (!who) return false;
    runProtest(st, g, D, who, false, now + SEQ.protest);
    return true;
  }
  /** Contexto de la disputa (las fichas, si el árbitro no trae D.sub): lo que ha pitado el 1r, dicho desde quien lo sufre. */
  function subOf(D) {
    return D.kind === 'touch' ? 'Tocado, dice el 1r. ¿Seguro?' : D.kind === 'net' || D.kind === 'under' ? 'Falta en la red, dice el 1r.' : D.kind === 'antenna' ? 'Antena, dice el 1r.'
      : D.kind === 'fault' || D.kind === 'position' ? 'Falta pitada. ¿Seguro?' : D.kind === 'chal' ? 'El challenge no da la razón.'
      : D.calledIn ? 'Dentro, dice el 1r. ¿Seguro?' : 'Fuera, dice el 1r. ¿Seguro?';
  }
  /** Bloque de frases de la protesta según lo pitado (desde el equipo que la sufre). */
  function protTrig(D) {
    var k = D.kind;
    return k === 'touch' ? 'protestTouch' : k === 'net' || k === 'under' ? 'protestNet' : k === 'antenna' ? 'protestAnt' : k === 'fault' || k === 'position' ? 'protestFault'
      : k === 'chal' ? 'protestChal' : D.calledIn ? 'protestOut' : 'protestIn';
  }
  function autoMate(st, g) { var p = mateP(st, g); return p ? { pid: pidOf(p), role: 'player', who: g.size === 6 ? 'team' : 'mate', name: pName(st, g, p, 0), team: 0 } : null; }
  function autoWho(st, g, D) {
    var t = D.team, role = D.auto.role || 'captain', ap = D.auto.pid >= 0 ? byPid(g, D.auto.pid) : null;
    if (ap && !(t === 0 && ap === myP(g))) return { pid: pidOf(ap), role: role === 'coach' ? 'player' : role, who: t === 0 ? (g.size === 6 ? 'team' : 'mate') : 'rival', name: pName(st, g, ap, t), team: t };
    if (g.size === 6) {
      if (role === 'coach') return { pid: -1, role: 'coach', who: t === 0 ? 'coach' : 'rivalCoach', name: t === 0 ? NAME.coach : NAME.rivalCoach, team: t };
      var p = role === 'captain' ? captOf(st, g, t) : null;
      if (!p) { var T = teamOf(g, t), me = myP(g), c = []; for (var i = 0; i < T.length; i++) if (T[i] && T[i] !== me && T[i].role !== 'L') c.push(T[i]); p = c.length ? c[Math.floor(roll(st, 0x9A1) * c.length)] : null; }
      if (!p) return null;
      if (t === 0 && p === myP(g)) p = captOf(st, g, 0) === p ? mateP(st, g) : p;   // (tú no protestas sin elegirlo)
      return p ? { pid: pidOf(p), role: p === captOf(st, g, t) ? 'captain' : 'player', who: t === 0 ? 'team' : 'rival', name: pName(st, g, p, t), team: t } : null;
    }
    // playa: el que perdió el punto (o su pareja); en tu equipo, tu pareja
    if (t === 0) return autoMate(st, g);
    var T1 = teamOf(g, 1), q = T1[0] || null;
    if (D.auto.pid >= 0) q = byPid(g, D.auto.pid) || q;
    return q ? { pid: pidOf(q), role: 'player', who: 'rival', name: pName(st, g, q, 1), team: 1 } : null;
  }
  /** ¿Una roja ahora cerraría el set del rival? (no damos nunca castigos al cierre: §1) */
  function redCloses(st, g, team) {
    if (!g || !g.score) return false;
    var r = 1 - team, a = (g.score[r] | 0) + 1, b = g.score[team] | 0, T = tgt(g);
    return a >= T && a - b >= 2;
  }
  /** La secuencia de una protesta: gesto + frase, respuesta del 1r, tarjeta (y castigo con la roja). */
  function runProtest(st, g, D, who, human, at) {
    var A = st.Ar, team = D.team;
    // (al árbitro solo el nombre propio, si lo hay: el rótulo ya pone el dorsal y el club)
    var R = A.protest(st.arb, D, { pid: who.pid, role: who.role, team: team, name: realName(st, g, byPid(g, who.pid), team), num: numOf(g, who.pid) }, human, D.canRed);
    if (D.forced === 'yellow' && (!R || !R.card)) R = { res: 'yellow', card: { team: team, pid: who.pid, color: 'yellow', who: who.role === 'coach' ? 'coach' : 'player', reason: 'protesta' }, penalty: -1 };
    if (D.forced === 'red' && (!R || !R.card || R.card.color !== 'red')) R = { res: 'red', card: { team: team, pid: who.pid, color: 'red', who: who.role === 'coach' ? 'coach' : 'player', reason: 'protesta' }, penalty: team };
    st.protests++;
    var kind = D.kind === 'under' ? 'net' : D.kind === 'position' ? 'fault' : D.kind;
    var trig = protTrig(D);
    push(st, at, { type: 'amb:protest', id: ++st.idN, team: team, pid: who.pid, role: who.role, kind: kind, human: !!human, k: clamp(0.4 + 0.6 * (D.strength || 0.5), 0, 1), dur: 1.2 });
    say(st, at + 0.05, trig, { who: who.who, team: team, pid: who.pid, name: who.name }, st.mode === 'calm' && !human ? 2 : 3, null, st.mode === 'full' || !!human);
    var res = R ? R.res : 'explain', lvl = res === 'verbal' || R && R.card ? 'verbal' : res === 'calm' ? 'calm' : 'explain';
    if (res !== 'none') {
      push(st, at + SEQ.ref, { type: 'amb:refTalk', team: team, pid: who.pid, level: lvl, dur: 1.4 });
      var rc = R && R.card ? R.card.color : '', rcRed = (rc === 'red' || rc === 'delayR') && R.penalty >= 0 && D.canRed;
      if (st.mode === 'full' || lvl === 'verbal') say(st, at + SEQ.ref + 0.05, rc ? (rc.indexOf('delay') === 0 ? 'refDelay' : rcRed ? 'refRed' : 'refYellow') : res === 'verbal' ? 'refVerbal' : res === 'calm' ? 'refCalm' : 'ref', spOf('ref'), 3, null, true);
    }
    // grada: pitada al árbitro si la decisión perjudica al local; la otra afición, «uuuh»
    if (st.home === team) { st.boo[st.home] = Math.max(st.boo[st.home], 0.5 + 0.4 * st.heat); push(st, at + 0.2, { type: 'amb:boo', target: 'ref', by: st.home, k: 0.5 + 0.4 * st.heat, dur: 2.2 }); }
    var need = SEQ.ref + 1.6;
    if (R && R.card) {
      var c = R.card, cAt = at + SEQ.card, pen = (c.color === 'red' || c.color === 'delayR') && R.penalty >= 0 && D.canRed;
      if ((c.color === 'red' || c.color === 'delayR') && !D.canRed) { c.color = c.color === 'red' ? 'yellow' : 'delayY'; pen = false; }
      var ce = cardEv(st, g, c, team, who, pen);
      push(st, cAt, ce, true);
      need = SEQ.card + SEQ.cardHold;
      st.wantLock = Math.max(st.wantLock || 0, cAt - st.now + SEQ.cardHold);
      // (castigo: team = equipo SANCIONADO, notes/ambiente.md «Cambios al contrato»)
      if (pen) { st.penPend = { at: cAt + SEQ.pen, team: team, card: c.color, pid: who.pid, cardId: ce.id }; need = SEQ.card + SEQ.pen + 0.6; st.wantLock = Math.max(st.wantLock, cAt + SEQ.pen + 0.3 - st.now); }
      // TV / compañero
      var tvTrig = c.color === 'red' || c.color === 'delayR' ? 'redTv' : 'cardTv';
      var clubT = team === 0 ? st.club : st.rivalClub, benef = team === 0 ? st.rivalClub : st.club;
      var tvName = ce.who === 'coach' ? 'el banquillo de ' + clubT : ce.who === 'team' ? clubT : ce.name || (ce.num ? 'el n.º ' + ce.num + ' de ' + clubT : clubT);
      if (!say(st, cAt + 0.4, tvTrig, spTv(st), 3, { name: tvName, benef: benef })) {
        if (team === 1) say(st, cAt + 0.6, 'cardRival', spMate(st, g), 1);
      }
      if (pen && team === 0) { if (who.pid === pidOf(myP(g))) say(st, cAt + SEQ.pen + 0.4, 'redMine', spMe(st, g), 3, null, true); else say(st, cAt + SEQ.pen + 0.4, 'redMate', spMate(st, g), 2); }
      if (st.home === team) push(st, cAt + 0.15, { type: 'amb:boo', target: 'ref', by: st.home, k: 0.7 + 0.3 * st.heat, dur: 2.6 });
    } else if (team === 0 && who.who !== 'me' && roll(st, 0xCA1) < 0.35) {
      say(st, at + SEQ.ref + 1.0, 'calmMate', spMate(st, g), 1);
    }
    st.wantHold = Math.max(st.wantHold || 0, (at - st.now) + need);
    return R;
  }
  function numOf(g, pid) { var p = byPid(g, pid); return p ? p.num | 0 : 0; }
  function cardEv(st, g, c, team, who, pen) {
    var p = byPid(g, c.pid >= 0 ? c.pid : who.pid), whoK = c.who || (who.role === 'coach' ? 'coach' : 'player');
    // nombre de verdad o nada (el rótulo ya pone «N.º 7»): en la playa los rivales no tienen nombre salvo tu rival personal o el jefe
    var real = p && (p.name || (team === 0 ? (p === myP(g) ? st.me.name : st.mate && st.mate.name) : p === teamOf(g, 1)[0] ? (st.rivalP && st.rivalP.name || st.boss && st.boss.nick) : ''));
    var name = whoK === 'coach' ? 'Entrenador' : whoK === 'team' ? 'Equipo' : real || '';   // (nunca «Rival · Club n.º 9»: la UI pone dorsal y club)
    var ev = { type: 'amb:card', id: ++st.idN, team: team, pid: whoK === 'player' ? (c.pid >= 0 ? c.pid : who.pid) : -1, num: whoK === 'player' && p ? p.num | 0 : 0, name: name, who: whoK,
      color: c.color, reason: c.reason || 'protesta', set: g.setNo | 0, score: g.score ? [g.score[0] | 0, g.score[1] | 0] : [0, 0], penalty: !!pen, mine: whoK === 'player' && p && p === myP(g) };
    return ev;
  }

  function onPenalty(st, e, g) {
    // el punto de castigo ya llegó: frase corta de megafonía si el castigado es el visitante, LED
    push(st, st.now + 0.2, { type: 'amb:led', text: 'PUNTO DE CASTIGO', team: e.team, dur: 3 });
  }

  /** Frases del punto (si no hay disputa en marcha). */
  function talk(st, e, g, busy) {
    var w = e.team, now = st.now, me = myP(g), mePid = pidOf(me), C = [];
    function add(trig, sp, d, pri, v) { if (sp) C.push({ trig: trig, sp: sp, d: d, pri: pri != null ? pri : TRIG[trig] || 1, v: v }); }
    var hl = +e.highlight || 0, home = st.home;
    // fin de partido
    if (e.matchWon) {
      push(st, now + 1.4, { type: 'amb:handshake', win: w === 0 });
      var wn = w === 0 ? 'endWin' : 'endLoss';
      say(st, now + 1.6, wn, spRival(st, g), 3, null, true);
      say(st, now + 2.6, wn, spMate(st, g), 2, null, true);
      say(st, now + 3.2, home < 0 ? 'endN' : w === home ? 'endHomeW' : 'endHomeL', spSpeaker(st), 2, null, true);
      return;
    }
    if (busy) return;
    // primera bola muerta: la frase de la previa del rival / compañero (derbi, revancha, rival)
    if (!st.preDone) {
      st.preDone = true;
      var hot = tagged(st, 'derbi') || tagged(st, 'clasico') || tagged(st, 'revancha') || tagged(st, 'rival') || tagged(st, 'jefe');
      if (derbyCity(st)) add('preD', roll(st, 0x9D) < 0.6 ? spRival(st, g) : spMate(st, g), 0.5, 2);
      else if (duel(st)) add('preDu', roll(st, 0x9D) < 0.6 ? spRival(st, g) : spMate(st, g), 0.5, 2);
      else if (tagged(st, 'revancha')) add('preRev', roll(st, 0x9D) < 0.5 ? spRival(st, g) : spMate(st, g), 0.5, 2);
      else if (hot) add('pre', spRival(st, g), 0.5, 2);
      else add('pre', roll(st, 0x9E) < 0.5 ? spMate(st, g) : spCoach(st, g), 0.5, 1);
    }
    // set ganado
    if (e.setWon) {
      if (w === 0) add('setUs', spCoach(st, g), 1.6, 2); else add('setThem', spCoach(st, g), 1.6, 2, { n: (teamOf(g, 1)[0] || {}).num || 1 });
      if (home >= 0 && w === home) add('setUs', spSpeaker(st), 0.6, 2);
      if (st.faro && !st.faroDone && w === 1) { st.faroDone = true; add('faro', spOf('faro'), 2.4, 2); }
      if (home >= 0 && w === home) push(st, now + 0.5, { type: 'amb:led', text: ledTxt('¡VAMOS ' + homeName(st).toUpperCase() + '!'), team: home, dur: 3 });
    }
    var myErr = w === 1 && mePid >= 0 && (pidOf(e.player) === mePid || pidOf(e.faultPlayer) === mePid || (e.how === 'error' && st.lastHit && st.lastHit.team === 0 && st.lastHit.pid === mePid && !e.player));
    if (myErr) st.myErrN++; else if (w === 0) st.myErrN = 0;
    if (myErr) {
      if (st.myErrN >= 2) add('myErr2', spCoach(st, g), 0.6, 2);
      else add('myErr', spMate(st, g), 0.5, 1);
      if (st.heat >= 0.5) add('myErr', spRival(st, g), 0.7, 0);
    }
    if (w === 0 && st.lastHit && st.lastHit.pid === mePid) {
      if ((e.how === 'kill' || e.how === 'tip') && hl >= 0.45) { add('myKill', spMate(st, g), 0.5, 1); if (hl >= 0.6) add('myKill', spTv(st), 0.9, 1); }
      if (e.how === 'ace') { add('myAce', spMate(st, g), 0.5, 1); if (home === 0) add('myAce', spSpeaker(st), 0.6, 1); }
    }
    if (e.how === 'block') {
      if (w === 0 && st.lastBlock && st.lastBlock.pid === mePid) { add('myBlock', spRival(st, g), 0.7, 1); add('myBlock', spMate(st, g), 0.5, 0); }
      if (w === 1) {
        add('theirBlock', spRival(st, g), 0.5, st.heat >= 0.45 ? 1 : 0);
        add('theirBlock', g.size === 6 ? spCoach(st, g) : spMate(st, g), 0.9, 0);
        if (st.heat >= 0.45 && roll(st, 0x7A0) < 0.5 && st.lastBlock) push(st, now + 0.3, { type: 'amb:taunt', team: 1, pid: st.lastBlock.pid, kind: 'net', toward: mePid });
      }
    }
    // rachas
    if (st.streak[w] >= 3 && st.streak[w] % 2 === 1) {
      if (w === 0) add('streakUs', spMate(st, g), 0.5, 1, { n: st.streak[w] });
      else add('streakThem', roll(st, 0x5C) < 0.5 ? spCoach(st, g) : spMate(st, g), 0.5, st.streak[w] >= 4 ? 2 : 1, { n: st.streak[w] });
      if (home >= 0 && w === home) add(w === 0 ? 'streakUs' : 'streakThem', spSpeaker(st), 0.6, 1, { n: st.streak[w] });
      // «shh» del rival tras su racha (calor ≥ 0,7): el 1r puede dar verbal por provocación
      if (w === 1 && st.heat >= 0.7 && roll(st, 0x5AA) < 0.3) {
        var rv = rivalSpeaker(st, g);
        push(st, now + 0.4, { type: 'amb:taunt', team: 1, pid: pidOf(rv), kind: 'shh', toward: mePid });
        add('shh', spRival(st, g), 0.45, 2);
        var A = st.Ar, R = A.taunt ? A.taunt(st.arb, 1, pidOf(rv), st.heat) : null;
        if (R && R.res === 'verbal') { push(st, now + 1.3, { type: 'amb:refTalk', team: 1, pid: pidOf(rv), level: 'verbal', dur: 1.3 }); }
        else add('shhReply', spMate(st, g), 1.2, 1);
      }
    }
    // remontada (vuelve a empatar o a ponerse por delante tras ir 4+ abajo)
    if (st.deficit[w] >= 4 && st.score[w] >= st.score[1 - w] && st.score[w] - st.score[1 - w] <= 1) {
      st.deficit[w] = 0;
      add('comeback', spTv(st), 0.7, 2);
      if (home >= 0 && w === home) { add('comeback', spSpeaker(st), 0.5, 2); push(st, now + 0.3, { type: 'amb:roar', team: w, k: 0.8 }); }
    }
    // punto de set salvado
    if (e.savedSetPoint) {
      if (home >= 0 && w === home) add('saved', spSpeaker(st), 0.5, 2); else if (w === 0) add('saved', spMate(st, g), 0.5, 2);
      push(st, now + 0.2, { type: 'amb:roar', team: w, k: 0.7 + 0.3 * st.heat });
    }
    // punto de set / partido recién creado
    var T = tgt(g), sk = st.score[w], so = st.score[1 - w];
    if (!e.setWon && sk >= T - 1 && sk - so >= 1 && !(sk - 1 >= T - 1 && sk - 1 - so >= 1)) {
      var mp = g.sets && (g.sets[w] === (g.toWin || 2) - 1 || g.bo1);
      if (mp && home >= 0 && w === home) add('matchPoint', spSpeaker(st), 0.6, 2); else if (mp && home < 0) add('matchPointN', spSpeaker(st), 0.6, 2);
      if (w === 0) add('spUs', spMate(st, g), 0.8, 1); else add('spThem', spCoach(st, g), 0.8, 2);
    }
    if ((e.rallyHits | 0) >= 12) { add('longRally', home >= 0 ? spSpeaker(st) : spTv(st), 0.6, 1); }
    // Faro: una vez, cuando vas 4+ abajo en el set
    if (st.faro && !st.faroDone && st.score[1] - st.score[0] >= 4) { st.faroDone = true; add('faro', spOf('faro'), 0.8, 2); }
    // elegir: la de más prioridad; las de prioridad ≤ 1 con probabilidad TALK
    if (!C.length) return;
    C.sort(function (a, b) { return b.pri - a.pri; });
    var said = 0;
    for (var i = 0; i < C.length && said < 2; i++) {
      var c = C[i];
      if (c.pri < 2) {
        if (said) break;
        if (st.force !== 'lines' && roll(st, 0x7A1C) >= TALK[c.pri < 1 ? 0 : 1]) continue;
      }
      if (st.mode === 'calm') {
        if (c.pri < 2) continue;
        if (st.lastSet === (g.setNo | 0) && st.setTalk >= 1 && c.pri < 3) continue;
      }
      if (say(st, now + c.d, c.trig, c.sp, c.pri, c.v, st.force === 'lines')) {
        said++;
        if (st.lastSet !== (g.setNo | 0)) { st.lastSet = g.setNo | 0; st.setTalk = 0; }
        st.setTalk++;
        if (c.pri < 2) break;
      }
    }
  }
  function ledTxt(s) { s = String(s || ''); return s.length > 22 ? s.slice(0, 21) + '!' : s; }

  function crowdReact(st, e, g, D) {
    var w = e.team, now = st.now;
    // cánticos de la afición que va ganando el impulso (racha ≥ 3, set ganado), con enfriamiento de 4 puntos
    var fanW = st.fans[w];
    if (fanW >= 0.2 && st.pts - st.chantPt >= 4 && !e.matchWon && (st.streak[w] >= 3 || e.setWon || st.force === 'chant')) {
      var r = roll(st, 0xC4A), kind = r < 0.4 ? 'vamos' : r < 0.7 ? 'oe' : 'palmas', k = clamp(0.35 + 0.5 * st.heat + 0.3 * fanW, 0, 1);
      st.chantPt = st.pts; st.chant = { team: w, kind: kind, k: k }; st.chantT = 3.2;
      push(st, now + 0.6, { type: 'amb:chant', team: w, kind: kind, k: k, dur: 3.2 });
    }
    // ola: el local gana de 5+ en el set, sin tensión, una por set
    var home = st.home;
    if (home >= 0 && !st.reduce && st.waveSet !== (g.setNo | 0) && st.score[home] - st.score[1 - home] >= 5 && g.setPoint < 0 && !e.setWon && roll(st, 0x0A1) < 0.35) {
      st.waveSet = g.setNo | 0;
      push(st, now + 0.5, { type: 'amb:wave', dur: 6 });
    }
  }

  // ------------------------------------------------------------------ deshacer / saltar
  function undo(st) {
    if (!st) return;
    var pt = st.pts;
    st.q = st.q.filter(function (x) { return x.keep || x.pt !== pt; });
    if (st.choice && !st.choice.done) { st.choice.done = true; st.choice.cancel = true; }
    st.penPend = null;
    st.pts = Math.max(0, st.pts - 1);
    if (st.arb && st.Ar.undo) st.Ar.undo(st.arb);
  }
  /** La pausa del punto se ha recortado (main.js tras Sim.skipHold): fuera las frases de prioridad < 2 pendientes. */
  function skip(st) {
    if (!st) return;
    st.q = st.q.filter(function (x) { return x.keep || !x.ev || x.ev.type !== 'amb:say' || x.ev.pri >= 2; });
  }
  /** El castigo pendiente ya no se dará (silbato de saque, avance rápido): su tarjeta deja de decir «punto de castigo», en la cola
   *  (aún sin salir) y en st.cards (ya salida), para que la hoja, el acta y el titular no cuenten un punto que no hubo. */
  function penLost(st) {
    var p = st.penPend; st.penPend = null; if (!p) return;
    st.penLost = (st.penLost | 0) + 1;
    for (var i = 0; i < st.q.length; i++) { var x = st.q[i]; if (x.ev && x.ev.type === 'amb:card' && x.ev.id === p.cardId) x.ev.penalty = false; }
    for (var j = st.cards.length - 1; j >= 0; j--) if (st.cards[j].id === p.cardId) { st.cards[j].penalty = false; break; }
  }
  /** Silbato de saque: nada empieza después. Las tarjetas pendientes salen ya (sin castigo). */
  function purge(st, whistle) {
    var keep = [];
    for (var i = 0; i < st.q.length; i++) { var x = st.q[i]; if (x.keep) { x.at = st.now; keep.push(x); } }
    st.q = keep;
    if (st.penPend) penLost(st);
    if (st.choice && !st.choice.done) { st.choice.done = true; st.choice.pick = 'drop'; st.choice.by = 'timeout'; st.choice.late = true; }
    if (whistle) { st.hushT = 0; }
  }

  // ------------------------------------------------------------------ elección del jugador
  function choiceOpen(st) { return st && st.choice && st.choice.open && !st.choice.done ? st.choice.id : 0; }
  function choose(st, id, pick) {
    var c = st && st.choice;
    if (!c || c.done || !c.open || (id && id !== c.id)) return false;
    c.pick = pick === 'protest' ? 'protest' : 'drop'; c.by = 'player'; c.done = true;
    return true;
  }
  function resolveChoice(st, g, out) {
    var c = st.choice; st.choice = null;
    if (c.cancel) { if (c.open) out.push({ type: 'amb:choiceEnd', amb: true, id: c.id, pick: 'drop', by: 'skip', t: st.now }); return; }
    if (!c.pick) { c.pick = 'drop'; c.by = 'timeout'; }
    if (c.open) out.push({ type: 'amb:choiceEnd', amb: true, id: c.id, pick: c.pick, by: c.by, t: st.now });
    if (c.late) return;
    var D = c.D, now = st.now;
    if (c.pick === 'protest') {
      var me = myP(g);
      var R = runProtest(st, g, D, { pid: pidOf(me), role: c.capt ? 'captain' : 'player', who: 'me', name: st.me.name, team: 0 }, true, now + 0.05);
      // sin tarjeta: el marcador no cambia (una protesta nunca cambia la decisión), pero tu equipo y tu grada se vienen arriba
      if (R && !R.card) {
        crowdBoost(st, 0, 0.4);
        if (st.fans[0] >= 0.25) push(st, now + SEQ.ref + 0.6, { type: 'amb:roar', team: 0, k: 0.55 + 0.3 * st.heat });
        say(st, now + SEQ.ref + 1.5, 'backUp', st.home === 0 && roll(st, 0xBA) < 0.4 ? spSpeaker(st) : spMate(st, g), 2, null, true);
        st.backUp = (st.backUp | 0) + 1;
      }
    } else {
      st.drops++;
      if (D.wrong && !st.coldHead) {
        st.coldHead = 1;
        if (st.rate) { try { st.rate('cold', 0.05, 'Cabeza fría'); } catch (e) { } }
        say(st, now + 0.3, 'dropWrong', roll(st, 0xD0) < 0.5 ? spCoach(st, g) : spMate(st, g), 2, null, true);
      } else if (roll(st, 0xD1) < 0.4) say(st, now + 0.3, 'calmMate', spMate(st, g), 1);
    }
  }

  // ------------------------------------------------------------------ cada frame
  function frame(st, g, dt, out, f) {
    var ctl = CTL; ctl.hold = 0; ctl.lock = false; ctl.penalty = -1; ctl.pcard = ''; ctl.ppid = -1;
    if (!st || !g || !out) return ctl;
    f = f || {};
    st.now = +g.time || 0;
    st.ff = !!f.ff; st.reduce = !!f.reduce;
    var rep = !!f.replay;
    if (rep && !st.rep) skip(st);
    st.rep = rep;
    if (f.intro) return ctl;
    if (!st.started) {
      st.started = true;
      var names = [st.club, st.rivalClub];
      out.push({ type: 'amb:start', amb: true, t: st.now, heat: st.heat, home: st.home, fans: st.fans.slice(), tags: st.tags.slice(), mode: st.mode, hall: st.hall, level: st.level, names: names, short: [cut12(names[0]), cut12(names[1])] });
      if (!st.ff) {
        var wk = st.home < 0 ? 'welcomeN' : derbyCity(st) ? 'welcomeD' : duel(st) ? 'welcomeDu' : 'welcome';
        say(st, st.now + 0.2, wk, spSpeaker(st), 2, null, true);
        var led = st.home < 0 ? 'GRAN FINAL' : derbyCity(st) ? '¡DERBI!' : duel(st) ? '¡DUELO!' : ledTxt('¡VAMOS ' + homeName(st).toUpperCase() + '!');
        push(st, st.now + 0.1, { type: 'amb:led', text: led, team: st.home, dur: 4 });
      }
    }
    // grada: energía y pitada bajan solas
    var dec = Math.min(1, dt * 0.35);
    st.energy[0] -= st.energy[0] * dec; st.energy[1] -= st.energy[1] * dec;
    st.boo[0] -= st.boo[0] * Math.min(1, dt * 0.6); st.boo[1] -= st.boo[1] * Math.min(1, dt * 0.6);
    if (st.chantT > 0) { st.chantT -= dt; if (st.chantT <= 0) st.chant = null; }
    if (st.ff) { if (st.penPend) penLost(st); st.q.length = 0; if (st.choice) { st.choice.done = true; st.choice.cancel = true; } }
    // elección abierta: se abre a su hora, caduca a los 2,4 s
    var c = st.choice;
    if (c) {
      if (!c.open && !c.done && st.now >= c.at && !st.rep) { c.open = true; c.ev.t = st.now; c.ev.amb = true; out.push(c.ev); }
      if (c.open && !c.done && st.now >= c.until) { c.done = true; c.pick = 'drop'; c.by = 'timeout'; }
      if (c.done) resolveChoice(st, g, out);
    }
    // cola
    if (st.q.length) {
      var keep = 0;
      for (var i = 0; i < st.q.length; i++) {
        var x = st.q[i];
        if (x.at <= st.now) {
          if (x.ev) {
            if (st.rep && x.ev.type === 'amb:say' && x.ev.pri < 3) continue;
            x.ev.t = st.now; out.push(x.ev);
            if (x.ev.type === 'amb:card') onCard(st, x.ev);
            if (x.ev.type === 'amb:say') st.say++;
          }
        } else st.q[keep++] = x;
      }
      st.q.length = keep;
    }
    // castigo pendiente
    if (st.penPend && st.now >= st.penPend.at) {
      ctl.penalty = st.penPend.team; ctl.pcard = st.penPend.card; ctl.ppid = st.penPend.pid;
      st.penWait = st.penPend; st.penPend = null;
    }
    if (st.wantHold > 0) { ctl.hold = st.wantHold; st.wantHold = 0; }
    if (st.wantLock > 0) { ctl.hold = Math.max(ctl.hold, st.wantLock); ctl.lock = true; st.wantLock = 0; }
    return ctl;
  }
  function cut12(s) { s = String(s || ''); return s.length > 12 ? s.slice(0, 11) + '.' : s; }
  function onCard(st, ev) {
    st.cards.push({ id: ev.id, team: ev.team, pid: ev.pid, num: ev.num, name: ev.name, who: ev.who, color: ev.color, reason: ev.reason, set: ev.set, score: ev.score.slice(), penalty: ev.penalty, mine: !!ev.mine });
    if (ev.mine && st.rate) { try { st.rate('sanction', ev.color, ev.color === 'red' || ev.color === 'delayR' ? 'Tarjeta roja' : 'Tarjeta amarilla'); } catch (e) { } }
  }
  function penaltyDone(st, ok) {
    if (!st) return;
    var p = st.penWait; st.penWait = null;
    if (!ok && p) { st.penLost = (st.penLost | 0) + 1; for (var i = st.cards.length - 1; i >= 0; i--) if (st.cards[i].penalty && (st.cards[i].id === p.cardId || p.cardId == null)) { st.cards[i].penalty = false; break; } }
  }

  // ------------------------------------------------------------------ lectura
  function crowd(st) {
    var o = CROWD;
    if (!st) { o.on = false; return o; }
    o.on = true; o.home = st.home; o.fans[0] = st.fans[0]; o.fans[1] = st.fans[1]; o.heat = st.heat;
    o.energy[0] = st.energy[0]; o.energy[1] = st.energy[1]; o.boo[0] = st.boo[0]; o.boo[1] = st.boo[1]; o.hush = st.hush;
    if (st.chant) { CHANT.team = st.chant.team; CHANT.kind = st.chant.kind; CHANT.k = st.chant.k; o.chant = CHANT; } else o.chant = null;
    return o;
  }
  function offNow() { var c = VB.ctx, s = c && c.settings; return !!(s && s.ambient === 'off'); }
  function crowdOf(g) { var st = of(g); if (!st || (offNow() && !st.force)) return null; return crowd(st); }
  function sum(st) {
    if (!st) return null;
    var mine = st.cards.filter(function (c) { return c.team === 0; });
    return { cards: st.cards.map(function (c) { return { team: c.team, pid: c.pid, num: c.num, name: c.name, who: c.who, color: c.color, reason: c.reason, set: c.set, score: c.score.slice(), penalty: c.penalty, mine: c.mine }; }),
      protests: st.protests, drops: st.drops, coldHead: st.coldHead, lines: st.lines, heat: st.heat, tags: st.tags.slice(), home: st.home, fair: mine.length === 0,
      myY: st.cards.filter(function (c) { return c.mine && (c.color === 'yellow' || c.color === 'delayY'); }).length,
      myR: st.cards.filter(function (c) { return c.mine && (c.color === 'red' || c.color === 'delayR' || c.color === 'expel' || c.color === 'dq'); }).length,
      teamR: mine.filter(function (c) { return c.color === 'red' || c.color === 'delayR' || c.color === 'expel' || c.color === 'dq'; }).length, choices: st.choiceN };
  }

  VB.Ambiente = {
    create: create, feed: feed, undo: undo, frame: frame, choose: choose, choiceOpen: choiceOpen, skip: skip, crowd: crowd, crowdOf: crowdOf, sum: sum,
    penaltyDone: penaltyDone, bind: bind, of: of,
    BANK: BANK, TRIG: TRIG, PRI: PRI, CHOICE: CHOICE, SEQ: SEQ, NAME: NAME, _lines: lines, _fill: fill, _hash01: hash01, _arbLocal: ARB_LOCAL
  };
})();
