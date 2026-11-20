/* MAKE THE CUT — js/career-story-wall.js (owner: carrera)
 * «Carrera con vida» (notes/carrera-vida.md §2 S3, paquete P3): Redes y partidos marcados. Subsistema de VB.CareerStory (API en la
 * cabecera de js/career-story.js). Sin DOM al cargar (se carga en node: tools/storywalltest.js, storytest.js, careertest.js).
 *
 *  - Muro: en cada jornada tuya (jugada, simulada o banquillo) se generan 3-5 publicaciones inventadas sobre TU partido (2 si fue
 *    jornada de banquillo), con unas 14 situaciones (nota alta o baja, remontada, barrida, aces, errores, racha, duelo, banquillo,
 *    fichaje, patrocinio nuevo, decisión contestada, partido marcado y eco de lo que publicaste) más relleno. Ninguna plantilla se
 *    repite en las 3 jornadas anteriores (s.wallSeen). Me gusta = seguidores × (0,02..0,08). Lo que publican otros sistemas con
 *    VB.CareerStory.pushWall (ecos de P1, premios de P4) entra en el muro (onWall).
 *  - Publicar: una vez por jornada, como ELECCIÓN (regla de oro: es lo único de este sistema que toca el núcleo, con fx):
 *    Humilde (química +3) · Chulería (fama ×0,02, entrenador −2, pique +10) · Gracioso (tu gente +3, fama ×0,01).
 *  - Partidos marcados: tagFor(c, f) PURO (sin escrituras, sin estado de azar) con prioridad Duelo > Final / Eliminatoria > Jefe >
 *    Derbi > Revancha > Televisado. Al final de cada gancho se guarda la del próximo partido en s.mk = {k, tag} (así el núcleo da
 *    ctx.played.tag también al partido simulado, que no pasa por 'setup'). En 'setup': m.career.story = {tag, name, line}.
 *    Efecto solo narrativo: publicación extra, marca 'mk' para la prensa de P1 (VB.CareerStory.flagAt(c, 'mk') con el mN de la
 *    jornada) y estrellas de P4 (que lee ctx.played.tag).
 *
 * Acciones: 'st-wall-pub-<0|1|2>' (Publicar con ese tono).
 * Interfaz (sys.ui): wall(c, HLP) → la subpestaña Mensajes › Redes; stamp(c, f) → sello para el ticket y el calendario.
 * Fachada extra: VB.CareerStoryWall = {tagFor, tagName, stamp, line, fixture, likes, fmtK, canPost, publish, wallHTML}.
 *
 * Azar: solo VB.CareerStory.rng con claves 'st-wall', 'st-wlk', 'st-wpub', 'st-wline', 'st-tv' (hash de la semilla: no se consume
 * nada). Estado propio en c.story: wall {s, w, mN, bench, p:[{a, k, i, v, lk, f?, x?, t?}], prev}, wallSeen [{mN, k:[]}],
 * post (mN de la última publicación tuya, −1), mk {k, tag}, wsp (último patrocinio visto), wallIn [{a, t, v, mN}] (pendientes).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (!VB.CareerStory || !VB.CareerStory.use) return;
  var S = VB.CareerStory;

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function handle(s) { return String(s || '').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç]/g, ''); }
  function nota1(n) { return num(n) ? (Math.round(n * 10) / 10).toFixed(1).replace('.', ',') : ''; }

  var PAGE_MIN = 3, PAGE_MAX = 5, BENCH_N = 2, SEEN_JOR = 5, IN_MAX = 6, FANS_MIN = 120;   // (5 jornadas sin repetir plantilla: con 3 la racha y los ecos se repetían mucho)

  // ================================================================== TEXTOS
  // Cada variante: 'autor|texto de playa' o 'autor|texto de playa||texto de pista'. Autores: cron (@CronistaDeArena / de
  // Pabellón), rumor (@ElOjoDeHalcón), pena (@PeñaVoley{Ciudad}), hater (@NoMeConvence, gracioso y nunca cruel), diario, digital,
  // radio, pod (los medios del reparto), mate (tu pareja; en pista, la capitanía), rival (tu rival personal o el club rival),
  // sponsor (solo con patrocinio), fam (Tu gente), me (tú).
  // Variables: las de VB.CareerStory.vars ({yo} {mate} {rival} {rp} {club} {ciudad} {sponsor}…) y las de cada publicación:
  // {nota} {res} (sets tuyos-rival) {score} ({club} 2-1 {rival}) {aces} {n} (racha) {w} {l} (cara a cara) {played}.
  var W = {
    big: [   // nota ≥ 8
      'cron|{score}. {yo}, {nota} de nota. A esta persona hay que empezar a tomársela en serio.',
      'diario|Partidazo de {yo}: un {nota} que en la redacción ya ha abierto el debate de la camiseta.',
      'pena|¡{yo}, {nota}! En la peña hemos tenido que pedir otra ronda para celebrarlo.',
      'hater|Vale, {yo} ha estado bien. Muy bien, incluso. No me acostumbro, pero lo apunto.',
      'rumor|Dicen que después de ese {nota} hay clubes preguntando por {yo}. Yo solo lo cuento.',
      'radio|En Radio Arena FM lo tenemos claro: el nombre de la jornada es {yo}. {nota} y sonrisa de oreja a oreja.',
      'mate|Hoy {yo} lo ha levantado todo. Yo solo he tenido que no estorbar.||Hoy {yo} se ha echado el equipo a la espalda. Así da gusto.',
      'fam|Lo hemos visto en el bar con todo el barrio. Un {nota}. Ya no sabemos dónde poner tanto orgullo.'
    ],
    low: [   // nota < 5
      'hater|{yo} hoy ha jugado con el modo avión puesto. {nota}. Mañana será otro día (esperemos).',
      'cron|Tarde para olvidar de {yo}: {nota}. Le pasa a cualquiera, pero hoy le ha pasado a {yo}.',
      'pena|Un mal día lo tiene cualquiera. {yo}, aquí seguimos, con la bufanda y con paciencia.',
      'fam|No pasa nada. El domingo hay comida en casa y nadie va a hablar del partido. Bueno, casi nadie.',
      'rumor|Me cuentan que en el vestuario de {club} hoy había más silencio que en una biblioteca.',
      'diario|{yo} firma un {nota} y deja dudas. El cuerpo técnico pide calma.',
      'mate|Hoy no ha salido. A {yo} y a mí nos toca entrenar el doble esta semana.||Hoy no le ha salido a nadie, tampoco a {yo}. A entrenar y a la siguiente.',
      'pod|En La Pausa Técnica hoy hablamos del bache de {yo}. Adelanto: tiene arreglo.'
    ],
    comeback: [   // perdiste el primer set y ganaste
      'cron|Remontada de {club}: empezaron perdiendo y acabaron {res}. {yo}, de menos a más.',
      'pena|¡Qué sufrimiento! Pero así se ganan las cosas en {ciudad}: remontando.',
      'hater|Perder el primer set para darle emoción. Muy considerado por parte de {yo}.',
      'radio|Remontada en directo en Radio Arena FM. El locutor ha perdido la voz y no se arrepiente.',
      'diario|{club} levanta el partido tras un mal arranque. {yo} aparece cuando más quema.',
      'mate|Primer set horrible, luego a por todas. Así me gusta, {yo}.||Empezamos con el freno puesto y acabamos volando. Este equipo tiene carácter.',
      'rival|Se nos ha escapado vivo. Hay que saber cerrar los partidos. Enhorabuena a {club}.',
      'fam|Media familia sin uñas después de ese partido. Gracias por el susto, {yo}.'
    ],
    sweep: [   // ganaste sin ceder un set
      'cron|{score}. Sin ceder un set. {club} pasa por encima.',
      'hater|Ni he tenido tiempo de sacar las palomitas. {club} {res} y a casa.',
      'pena|¡{res} y a la ducha! Así, sin complicaciones, como le gusta a la peña.',
      'diario|Victoria limpia de {club}: {res} ante {rival}. Ni un set regalado.',
      'radio|Partido rápido en Radio Arena FM: {res} y nos ha sobrado tiempo para la previa del siguiente.',
      'rumor|En {rival} están revisando el vídeo del partido. Dicen que todavía no entienden qué ha pasado.',
      'mate|Sin sufrir. {yo}, hoy éramos un reloj.||{res} y sin sufrir. Hoy el equipo era un reloj.',
      'fam|¿Ya ha terminado? Pues nada, a celebrarlo antes de que se enfríe la comida.'
    ],
    ace: [   // aces decisivos
      'cron|Ese saque de {yo} todavía está botando. {aces} aces y cara de no haber roto un plato.',
      'hater|{yo} saca como si le debieran dinero. Me da hasta un poco de respeto.',
      'pena|¡Ace, ace y ace! Hemos inventado un cántico nuevo y no rima con nada.',
      'radio|En Radio Arena FM hemos contado tres veces el saque de {yo}. Sin repetición, pero con mucha emoción.',
      'diario|El saque como arma: {yo} firma {aces} aces y desarma a {rival}.',
      'rival|Ese saque de {yo}... hay que hablar con quien se lo haya enseñado. Muy bueno.',
      'rumor|Me dicen que en {rival} esta semana van a entrenar recepción. Mucha recepción.',
      'fam|El saque de {yo} lo hemos visto diez veces en el móvil de la abuela. Doce, en realidad.'
    ],
    err: [   // errores en los momentos clave (derrota)
      'hater|Ese error de {yo} en el momento clave lo vamos a ver en memes durante semanas. Con cariño.',
      'cron|Los errores pesaron: {club} cede ante {rival} y {yo} no encuentra su mejor versión en los puntos clave.',
      'pena|Un error lo tiene cualquiera. {yo}, la próxima la clavas, que te conocemos.',
      'rumor|Cuentan que {yo} ha pedido la grabación del partido para verla esta noche. Toca autocrítica.',
      'diario|Demasiados regalos de {club} en los puntos decisivos. {rival} no perdonó.',
      'radio|En Radio Arena FM no vamos a repetir ese error. Ya lo repite bastante la grada.',
      'mate|Ese último balón nos duele a los dos. A la siguiente, {yo}.||Los errores son de todo el equipo, no solo de {yo}. A la siguiente.',
      'fam|Te hemos visto la cara al fallar. No le des más vueltas, que vienes a cenar.'
    ],
    streak: [   // racha ≥ 3 victorias ({n})
      'cron|{n} victorias seguidas de {club}. Y {yo} está en todas.',
      'pena|¡{n} de {n}! Que nadie toque nada, que la bufanda de la suerte no se lava.',
      'hater|{n} seguidas. Ya me está costando encontrar de qué quejarme. Dadme tiempo.',
      'rumor|Con {n} victorias seguidas, en las oficinas de {club} ya se habla de renovaciones.',
      'diario|{club} encadena {n} triunfos y {yo} se consolida como pieza clave.',
      'radio|En Radio Arena FM ya contamos {n} seguidas de {club}. Nuestro equipo de sonido dice que es gracias a su camiseta. No lo es.',
      'fam|{n} seguidas. Tu gente ha decidido no cambiar de sitio en el sofá hasta nuevo aviso.',
      'sponsor|{n} victorias seguidas de {yo}. Nosotros ya lo sabíamos. #EquipoChanclasVoladoras'
    ],
    duelW: [   // duelo ganado a tu rival personal ({rp}, {w}-{l})
      'cron|Duelo para {yo}: gana a {rp} y el cara a cara queda {w}-{l}. La próxima semana va a ser divertida.',
      'rival|Hoy {yo} ha estado mejor. Lo reconozco. La próxima no pasa.',
      'hater|{rp} habló toda la semana y {yo} contestó en la pista. Fin de la conversación.',
      'pena|¡Duelo ganado! {rp}, te esperamos en la vuelta. Con cariño, la peña.',
      'rumor|Me cuentan que {rp} se ha ido sin hablar con nadie. Mal perder, o mucha prisa.',
      'diario|{yo} gana el duelo a {rp} y el cara a cara queda {w}-{l}.',
      'radio|En Radio Arena FM lo llamamos el duelo del año. Esta vez, para {yo}.',
      'fam|Hemos ganado a {rp}. Bueno, has ganado tú, pero nosotros gritábamos mucho.'
    ],
    duelL: [   // duelo perdido
      'rival|Hoy me tocaba a mí. {yo}, gracias por el partido. Ya hablaremos en la vuelta.',
      'hater|{rp} se lleva el duelo. {yo}, a casa a pensar. Y a entrenar, que pensar solo no basta.',
      'cron|{rp} se lleva el duelo ante {yo}. El cara a cara queda {w}-{l}.',
      'pena|Hoy ha ganado {rp}, pero la peña no olvida. Habrá vuelta.',
      'rumor|Dicen que {rp} lo ha celebrado como si fuera una final. Le hacía falta.',
      'diario|Duelo para {rp}: {yo} no encuentra el camino y cede el cara a cara.',
      'radio|En Radio Arena FM hay debate: ¿mala tarde de {yo} o gran día de {rp}? Llamad y opinad.',
      'fam|No te preocupes por {rp}. En casa sigues siendo lo mejor que le ha pasado al vóley.'
    ],
    bench: [   // jornada sin jugar
      'hater|¿Por qué no juega {yo}? Pregunto para una amistad. La amistad soy yo.',
      'pena|¿Por qué no juega {yo}? La peña ha venido igual, pero con la pancarta doblada.',
      'cron|{yo} se queda sin jugar esta jornada. El cuerpo técnico no da explicaciones.',
      'rumor|Hay quien dice que lo de {yo} es una decisión técnica. Hay quien dice otras cosas. Yo solo escucho.',
      'fam|Hemos ido igual al partido. Te hemos visto calentar y aplaudir. Así también se gana.',
      'diario|Sin minutos para {yo}. Toca esperar su momento.',
      'radio|Pregunta del día en Radio Arena FM: ¿por qué no juega {yo}? Las líneas están que arden.',
      'mate|Hoy he jugado con otra persona, pero te he echado de menos, {yo}. Vuelve pronto.||Desde el banquillo también se suma. {yo} ha animado más que nadie.'
    ],
    benchW: [   // relleno de banquillo: tu equipo gana sin ti
      'cron|{score}. {club} gana sin {yo} en la pista.',
      'hater|{club} gana sin {yo}. No digo nada, pero lo digo.',
      'diario|{club} suma sin {yo}: {res} ante {rival}.',
      'pena|Victoria de {club}. Falta {yo} para que sea perfecta.',
      'radio|Lo contamos en Radio Arena FM: {club} gana {res}. Y {yo}, a esperar su turno.',
      'rumor|En {club} dicen que ganar sin {yo} es buena señal. Yo diría que es buena suerte.'
    ],
    benchL: [   // relleno de banquillo: tu equipo pierde sin ti
      'cron|{score}. {club} pierde y la grada pregunta por {yo}.',
      'hater|Sin {yo}, {club} pierde. Tampoco digo nada. Bueno, sí.',
      'diario|Derrota de {club} ante {rival}. El banquillo, con {yo} incluido, mira y aprende.',
      'pena|Hoy hemos perdido sin {yo} en la pista. Que alguien tome nota.',
      'radio|{club} cae {res}. En Radio Arena FM lo tenemos claro: hay que dar minutos a {yo}.',
      'fam|Sin ti en la pista no es lo mismo. Ni para nosotros ni para el marcador.'
    ],
    sign: [   // primer partido en un club nuevo
      'cron|Debut de {yo} con {club}. Primeras impresiones: {res} y ganas de más.',
      'pena|Primer partido de {yo} con {club}. La peña ya le ha hecho sitio en la pancarta.',
      'rumor|Ya lo dije yo: {yo} acababa en {club}. Nadie me hizo caso.',
      'hater|{yo} ya es de {club}. Le doy tres partidos para convencerme. Tres. Igual cuatro.',
      'diario|{club} estrena a {yo}: debut con {res} ante {rival}.',
      'radio|Debut de {yo} con {club} en directo en Radio Arena FM. Primera nota: aprobado con ganas.',
      'fam|Ya tenemos la camiseta de {club}. Talla equivocada, pero la llevamos con orgullo.',
      'mate|Primer partido con {yo}. Esto promete.||Te damos la bienvenida al vestuario, {yo}. Aquí se trabaja y se ríe a partes iguales.'
    ],
    sponsor: [   // patrocinio nuevo
      'sponsor|Damos la bienvenida a {yo} a la familia {sponsor}. #EquipoChanclasVoladoras',
      'sponsor|{yo} ya juega con {sponsor}. Dicen que se nota en los saltos. Nosotros no decimos nada. #EquipoChanclasVoladoras',
      'hater|{yo} ahora sale en los anuncios de {sponsor}. Ya no hay quien le aguante. (Es broma, el anuncio está bien.)',
      'rumor|Me dicen que el contrato de {yo} con {sponsor} incluye chanclas ilimitadas. No lo puedo confirmar.',
      'pena|¡{yo} con {sponsor}! En la peña ya hemos pedido descuento. Nos han dicho que no.',
      'cron|{sponsor} se fija en {yo}. El mercado de patrocinios también mira la pista.',
      'fam|Hemos visto tu foto de {sponsor} en una marquesina. La abuela le ha hecho una foto a la foto.',
      'diario|Nuevo patrocinio para {yo}: {sponsor} apuesta por su imagen.'
    ],
    decision: [   // contestaste una decisión de la carrera
      'rumor|Algo se ha movido esta semana alrededor de {yo}. No sé qué es, pero lo sabré.',
      'hater|Me cuentan que {yo} ha tomado una decisión importante. Espero que incluya practicar la recepción.',
      'pena|Pase lo que pase fuera de la pista, la peña está con {yo}. Siempre.',
      'cron|Semana movida para {yo} fuera de la pista. Veremos si se nota dentro.',
      'diario|{yo} pasa página a una semana con decisiones. En {club}, tranquilidad.',
      'radio|En Radio Arena FM nos llega que {yo} ha tenido una semana intensa. Ya nos lo contará en la próxima entrevista.',
      'fam|Sabemos que has tenido que decidir algo esta semana. Lo que hayas elegido, bien elegido está.',
      'mate|{yo} ha tenido una semana complicada y aun así ha venido a entrenar con una sonrisa.'
    ],
    // eco de lo que publicaste la jornada anterior (según el tono)
    echo0: [
      'pena|Lo que escribió {yo} esta semana nos ha gustado mucho. Humildad y trabajo.',
      'cron|Mensaje sensato de {yo} en redes. Así se construye un vestuario.',
      'hater|{yo} publica algo humilde. No sé qué hacer con tanta normalidad.',
      'fam|Hemos leído lo que pusiste. Así te hemos criado, y así nos gusta.'
    ],
    echo1: [
      'hater|{yo} dijo que nadie le para. Nadie salvo la red, se entiende.',
      'rival|He leído lo de {yo}. Lo guardo para cuando nos veamos.',
      'rumor|La publicación de {yo} ha sentado regular en algún vestuario. Me lo han contado.',
      'cron|Las palabras de {yo} en redes siguen dando que hablar.',
      'pena|{yo} viene con ganas de guerra. A la peña le encanta, que conste.',
      'diario|La publicación de {yo} no ha pasado desapercibida en la liga. Habrá que ver si lo respalda en la pista.',
      'radio|En Radio Arena FM hemos leído lo de {yo} en directo. El locutor ha dicho «uy» tres veces.',
      'fam|Hemos visto lo que pusiste. Un poco de humildad, que te conocemos. Pero nos hemos reído.'
    ],
    echo2: [
      'pena|Ya tenemos meme oficial de la temporada gracias a {yo}.',
      'hater|Lo de {yo} esta semana me ha hecho reír. Que no se repita.',
      'fam|Tu publicación la ha compartido hasta la vecina del quinto.',
      'radio|En Radio Arena FM no paramos de leer lo que publicó {yo}. Grande.',
      'cron|{yo} también sabe hacer reír. La publicación de la semana ya circula por todos los grupos.',
      'rumor|Me cuentan que en {club} han impreso lo que publicó {yo} y lo tienen en el vestuario.',
      'mate|Lo que has subido me ha hecho reír en pleno entreno. Me han mirado raro.||Lo que has subido lo ha leído en voz alta medio vestuario. Hemos llorado de risa.',
      'diario|Las redes de {yo} dan más alegrías que muchos partidos. Esta semana, la mejor broma de la liga.'
    ],
    // partidos marcados (lo que tenía el partido jugado: ctx.played.tag)
    finalW: [
      'cron|Final ganada: {score}. {club} levanta el trofeo y {yo} sale en todas las fotos.',
      'pena|¡TÍTULO! La peña no va a dormir esta noche. Ni mañana.',
      'hater|Vale, ganar una final está bien. Lo reconozco. No lo repetiré.',
      'radio|Radio Arena FM se queda sin voz: {club} gana la final {res}.'
    ],
    finalL: [
      'cron|Final perdida: {score}. Duele, pero llegar hasta aquí ya dice mucho de {club}.',
      'pena|Hoy duele, mañana orgullo. Gracias por llevarnos a una final.',
      'hater|Tanto para llegar a la final y luego esto. Bueno, el año que viene.',
      'fam|Una final es una final. En casa estamos orgullosos igual. Más, incluso.'
    ],
    koW: [
      'cron|{club} supera la eliminatoria: {res}. Sigue con vida.',
      'pena|¡Seguimos! Que nadie nos despierte.',
      'radio|Eliminatoria superada y en Radio Arena FM al locutor le tiemblan las piernas.',
      'hater|Pasan de ronda. A ver cuánto dura el milagro.'
    ],
    koL: [
      'cron|Fin del camino para {club} en la eliminatoria: {res} ante {rival}.',
      'pena|Fuera, pero con la cabeza alta.',
      'hater|Eliminación. Ya tengo planes para ese fin de semana, gracias.',
      'diario|{rival} apea a {club}. {yo}, sin premio esta vez.'
    ],
    bossW: [
      'cron|{yo} tumba al jefe del circuito. Esto ya no es casualidad.',
      'rumor|En el circuito no se habla de otra cosa: {yo} ha podido con lo más fuerte de la liga.',
      'pena|¡Hemos ganado al jefe! Bueno, ha ganado {yo}. Pero gritábamos.',
      'hater|Ganar al jefe. Muy bien. Ahora a ver qué excusa pongo yo.'
    ],
    bossL: [
      'cron|El jefe del circuito sigue mandando. {yo} lo intenta, pero aún no es su día.',
      'pena|Al jefe se le gana con tiempo. Llegará.',
      'hater|El jefe sigue siendo el jefe. {yo}, apunta la dirección y vuelve.',
      'radio|Radio Arena FM: el jefe sigue siendo el jefe. De momento.'
    ],
    derbyW: [
      'pena|¡El derbi es nuestro! {ciudad} es de {club}. Hasta la vuelta, por lo menos.',
      'cron|Derbi para {club}: {score}. La ciudad cambia de color.',
      'hater|Ganar el derbi con la vecina del tercero siendo de {rival}. Hoy es buen día.',
      'radio|Derbi narrado en Radio Arena FM: {club} gana y en {ciudad} suenan los cláxones.'
    ],
    derbyL: [
      'pena|Perder el derbi duele el doble. Hasta la vuelta.',
      'cron|{rival} se lleva el derbi: {score}.',
      'hater|Derbi perdido. Mañana no salgo de casa.',
      'rumor|En {ciudad} hoy solo se ven camisetas de {rival}. Qué raro todo.'
    ],
    revW: [
      'cron|Revancha cumplida: {club} se cobra la deuda con {rival}.',
      'pena|¡Deuda saldada con {rival}! Esto sí que sabe bien.',
      'hater|Revancha conseguida. Ahora le toca a {rival} quejarse. Bienvenidos al club.',
      'mate|Lo teníamos marcado en rojo. Hecho.||Lo teníamos marcado en rojo en el vestuario. Hecho.'
    ],
    revL: [
      'cron|{rival} lo vuelve a hacer. La revancha tendrá que esperar.',
      'pena|Otra vez {rival}. La próxima, de verdad que sí.',
      'hater|Revancha fallida. Ya van dos. Llevo la cuenta.',
      'diario|{rival} repite triunfo ante {club}.'
    ],
    tvW: [
      'radio|Retransmitido en Radio Arena FM y en la tele local: {club} gana y {yo} saluda a cámara.',
      'pena|¡Salimos en la tele! Y encima ganamos. Día redondo.',
      'hater|Primera vez que veo a {yo} en la tele. Ha estado bien. Lo grabé por si acaso.',
      'fam|Te hemos visto en la tele. La abuela dice que te ve con muy buena cara. Siempre lo dice.'
    ],
    tvL: [
      'radio|Derrota televisada para {club}. Mañana, más.',
      'pena|Salimos en la tele, pero el resultado mejor no lo enseñamos.',
      'hater|Toda la ciudad mirando y {club} pierde. Qué presión, ¿eh?',
      'fam|Te hemos visto en la tele. El resultado nos da igual, salías muy bien.'
    ],
    // relleno (siempre hay de sobra para no repetir en 3 jornadas)
    win: [
      'cron|{score}. Victoria y a pensar en la siguiente.',
      'diario|{club} gana {res} a {rival}. Partido serio y sin sobresaltos.',
      'pena|¡Victoria! La peña ya está en el bar de siempre.',
      'radio|En Radio Arena FM cantamos la victoria de {club}. {yo}, con un {nota}.',
      'hater|{club} gana. Yo esperaba sufrir más. Me han estropeado la tarde.',
      'rumor|Buen ambiente en {club} después de ganar. Hasta quien lleva el material sonríe.',
      'fam|¡Ganamos! Bueno, ganáis. Pero en casa se vive como si jugáramos todos.',
      'mate|Victoria trabajada. Así, {yo}, partido a partido.||Victoria de equipo. Así, partido a partido.'
    ],
    loss: [
      'cron|{score}. Derrota para {club}, que tendrá que mejorar.',
      'diario|{rival} gana a {club} y le complica la semana.',
      'pena|Hoy no ha podido ser. La peña no se mueve de aquí.',
      'radio|En Radio Arena FM toca contar una derrota de {club}. {yo}, con un {nota}. A levantarse.',
      'hater|Perder así, contra {rival}. Me voy a hacer de otro equipo. Mentira, aquí sigo.',
      'rumor|Me cuentan que el entrenamiento de mañana en {club} va a ser largo. Muy largo.',
      'fam|Perder también es parte del juego. Ven a casa, que hay cena.',
      'mate|Hoy no ha salido. Lo hablamos, lo entrenamos y a la siguiente.'
    ],
    fan: [
      'pena|La peña de {ciudad} sigue creciendo. Ya somos más que sillas en el bar.',
      'pena|Recordatorio: la pancarta de {yo} necesita voluntarios para pintar. Traed pinceles.',
      'pena|Encuesta de la peña: ¿mejor bocadillo de la jornada? Gana el de tortilla, como siempre.',
      'pena|Hoy en la peña hemos hablado tres horas de {yo}. Y luego de vóley.',
      'pena|Ya hay fecha para la cena de la peña. {yo}, la invitación está hecha, que te esperamos.',
      'pena|Bufandas nuevas de {club} en la peña. Se agotan antes que el pan.',
      'pena|Si ves a alguien con una camiseta de {yo} por {ciudad}, es de la peña. Salúdanos.',
      'pena|Próximo partido: quedamos una hora antes. Bueno, dos. Ya sabéis cómo somos.'
    ],
    hater: [
      'hater|Otra jornada, otra opinión que nadie ha pedido: {yo} me sigue sin convencer. Pero poco.',
      'hater|He visto el partido entero solo para quejarme. No he encontrado tanto como esperaba.',
      'hater|{yo} tiene un saque decente. Ya está. No me pidáis más.',
      'hater|Si {club} gana la liga me tiño el pelo del color de su camiseta. Tranquilidad, no va a pasar. Creo.',
      'hater|Mi análisis táctico de hoy: más balones a {yo}. No me preguntéis por qué lo digo yo.',
      'hater|Me han dicho que soy muy duro con {yo}. Es verdad. Es mi forma de querer.',
      'hater|Esta semana me había propuesto no hablar de {yo}. Mirad, ya he fallado.',
      'hater|{yo} y yo tenemos una relación complicada: yo opino y ni se entera.'
    ],
    rumor: [
      'rumor|Se dice por ahí que {club} busca refuerzos. No sé para qué puesto. Pero se dice.',
      'rumor|Me llega que alguien de {club} ha cambiado de peluquería. Os mantendré informados.',
      'rumor|Hay movimientos en la liga. No puedo decir más. Sobre todo porque no sé más.',
      'rumor|Fuentes de toda confianza (mi primo) aseguran que {yo} desayuna tostadas antes de cada partido.',
      'rumor|En el mercado se habla de {yo}. En el de fichajes, no en el de abastos.',
      'rumor|Exclusiva: el cuerpo técnico de {club} tiene una libreta con jugadas secretas. Secretas incluso para el equipo.',
      'rumor|Me cuentan que en el vestuario de {rival} tienen una foto de {yo}. Para estudiarla, se entiende.',
      'rumor|Novedades del mercado: ninguna. Pero alguien tenía que decirlo.'
    ],
    press: [
      'digital|Análisis de El Bloqueo Digital: {club} es de los equipos que más corren. {yo}, de quien más.',
      'digital|La clasificación aprieta y {club} se lo juega todo en las próximas jornadas.',
      'pod|Nuevo episodio de La Pausa Técnica: hablamos de {club}, de {yo} y de por qué el vóley es el mejor deporte.',
      'digital|Dato de la jornada: {club} ya ha jugado {played} partidos esta temporada. Y los que quedan.',
      'pod|En La Pausa Técnica hemos votado a la persona más regular de la liga. No ha ganado {yo}, pero ha quedado cerca.',
      'digital|Entrevista pendiente con {yo}. Su agente, Cris Montoya, nos dice que «ya veremos».',
      'pod|La Pausa Técnica recomienda: ver el último partido de {club} con calma y palomitas.',
      'digital|El Bloqueo Digital abre debate: ¿qué necesita {club} para dar el salto? Comentad.'
    ],
    // lo que publicas tú (Publicar), por tono
    pub0: [
      'me|Gracias a todo el mundo por el apoyo. Esto es cosa de equipo.',
      'me|Seguimos trabajando. Lo mejor está por venir.',
      'me|Orgullo de este grupo. Mañana, a entrenar otra vez.',
      'me|Nada de esto sale sin la gente que tengo al lado. Gracias de verdad.',
      'me|Cada partido se aprende algo. Hoy, también.'
    ],
    pub1: [
      'me|Que vayan apuntando mi nombre. {yo}. Con mayúsculas.',
      'me|Hoy no me para nadie. Mañana, tampoco.',
      'me|Algunos hablan. Yo juego.',
      'me|Que alguien avise a {rival}: esto solo acaba de empezar.',
      'me|Si buscáis a quien manda en esta liga, mirad la foto.'
    ],
    pub2: [
      'me|Hoy he entrenado tanto que mi sombra ha pedido el día libre.',
      'me|Mi dieta secreta: bocadillo de tortilla y mucha fe.',
      'me|Nueva técnica de saque: cerrar los ojos y que sea lo que tenga que ser.',
      'me|Dicen en el vestuario que canto fatal. Seguiré practicando.',
      'me|Arena en los zapatos hasta en casa. Es mi vida ahora.||He perdido otra rodillera. Ya van siete esta temporada.'
    ]
  };

  // líneas de la previa (m.career.story.line) por etiqueta
  var LINE = {
    duel: [
      'Duelo: {rp} juega en {rival} y lleva toda la semana hablando de ti. Hoy toca contestar.',
      'Duelo: {rp} contra {yo}. Media liga va a estar mirando este cara a cara.',
      'Duelo: {rp} ha dicho en la radio que hoy no te deja respirar. A ver.',
      'Duelo: hoy no es un partido más. {rp} está al otro lado de la red.'
    ],
    final: [
      'Final: un partido y el trofeo. {mate} dice que hoy no se escapa ni un balón.',
      'Final: la peña del barrio ha alquilado un autobús. Hoy se juega todo.',
      'Final: Radio Arena FM retransmite. El último paso, contra {rival}.',
      'Final: todo el año para llegar aquí. Ahora, a disfrutarlo.'
    ],
    ko: [
      'Eliminatoria: aquí no hay mañana. Quien pierda, a casa.',
      'Eliminatoria contra {rival}: un partido y fuera. Sin margen de error.',
      'Eliminatoria: {coach} lo ha dejado claro en la charla. Concentración y nada de regalos.',
      'Eliminatoria: la temporada se decide en una tarde.'
    ],
    boss: [
      'Jefe: {boss} y {rival}, lo más fuerte del circuito. Toca demostrar que ya estás a su altura.',
      'Jefe: el circuito entero quiere ver si alguien puede con {boss}. Hoy te toca a ti.',
      'Jefe: {boss} no pierde casi nunca. Casi.',
      'Jefe: {mate} ha visto tres vídeos de {boss} esta semana. Hay plan.'
    ],
    derby: [
      'Derbi: {club} contra {rival}, misma ciudad. En {ciudad} no se habla de otra cosa.',
      'Derbi: media {ciudad} con una camiseta y media con la otra. Hoy se decide quién presume.',
      'Derbi: la peña del barrio lleva una semana preparando cánticos contra {rival}.',
      'Derbi: en {ciudad} hoy no se habla de otra cosa. Ni en la panadería.'
    ],
    rev: [
      'Revancha: la última vez {rival} os ganó {s1}-{s2}. {mate} dice que no ha dormido bien desde entonces.',
      'Revancha: {rival} se llevó el último {s1}-{s2}. Hay cuentas pendientes.',
      'Revancha: todavía escuece aquel {s1}-{s2} contra {rival}. Hoy se arregla.',
      'Revancha: {coach} ha puesto en el vestuario el resultado del último partido contra {rival}. {s1}-{s2}. Para que nadie lo olvide.'
    ],
    tv: [
      'Televisado: Radio Arena FM y la tele local retransmiten. La peña del barrio ya ha avisado a todo el mundo.',
      'Televisado: hoy hay cámaras. Tu gente ha puesto la tele grande del bar.',
      'Televisado: la tele local abre su programa con este partido. Sonríe, que te ven.',
      'Televisado: Radio Arena FM retransmite en directo. Medio barrio va a estar pegado a la radio.'
    ]
  };
  var TAGS = ['duel', 'final', 'ko', 'boss', 'derby', 'rev', 'tv'];
  var TAG_NAME = { duel: 'Duelo', final: 'Final', ko: 'Eliminatoria', boss: 'Jefe', derby: 'Derbi', rev: 'Revancha', tv: 'Televisado' };
  var TONES = [
    { t: 'Humilde', e: { chem: 3 }, why: 'Publicaste algo humilde' },
    { t: 'Chulería', e: { fame: 0.02, coach: -2, heat: 10 }, why: 'Publicaste con chulería' },
    { t: 'Gracioso', e: { fam: 3, fame: 0.01 }, why: 'Publicaste algo gracioso' }
  ];

  // ================================================================== partidos marcados (puro)
  function lifeOf(c) { return c && obj(c.life) ? c.life : {}; }
  function E(c) { return S.K(c); }
  function myClub(c) { try { return c && c.myClub >= 0 ? E(c).myClub(c) : null; } catch (e) { return null; } }
  function clubOf(c, id) { try { return E(c).club(c, id) || null; } catch (e) { return null; } }
  /** Próximo partido tuyo, sin escribir nada (como myFixture / myFixture6). null si no hay. */
  function fixture(c) {
    var k = myClub(c); if (!k) return null;
    try {
      if (c.phase === 'league') {
        var wk = isH(c) ? (E(c).sched(c, k.lid) || [])[c.week] : c.sched && c.sched[k.lvl] && c.sched[k.lvl][c.week];
        if (!wk) return null;
        for (var i = 0; i < wk.length; i++) if (wk[i][0] === k.id || wk[i][1] === k.id) return { kind: 'league', week: c.week, i: i, home: wk[i][0], away: wk[i][1] };
        return null;
      }
      if (!isH(c) && c.phase === 'cup' && c.cup) {
        var rd = c.cup.round, ms = rd === 0 ? c.cup.semis : [c.cup.final];
        for (var j = 0; j < (ms || []).length; j++) if (ms[j] && (ms[j][0] === k.id || ms[j][1] === k.id) && !(c.cup.res && c.cup.res[rd] && c.cup.res[rd][j])) return { kind: 'cup', round: rd, i: j, home: ms[j][0], away: ms[j][1] };
      }
      if (isH(c) && c.phase === 'ko') {
        var ko = c.kos && c.kos[c.koI]; if (!ko || ko.champion >= 0) return null;
        var r6 = ko.round, ps = ko.rounds && ko.rounds[r6] || [];
        for (var q = 0; q < ps.length; q++) if ((ps[q][0] === k.id || ps[q][1] === k.id) && !(ko.res && ko.res[r6] && ko.res[r6][q])) return { kind: 'ko', ko: c.koI, round: r6, i: q, home: ps[q][0], away: ps[q][1] };
      }
    } catch (e) { return null; }
    return null;
  }
  /** Clave de jornada del partido f (la misma que K(c)._wkKey(c) cuando f es el próximo). */
  function fkey(c, f) {
    var s = (c.season | 0) * 1000;
    if (!f || f.kind === 'league' || f.kind == null) return s + ((f && f.week) | 0);
    return s + 500 + (isH(c) ? (f.ko | 0) * 10 : 0) + (f.round | 0);
  }
  function rivalId(c, f) {
    if (!f) return null;
    if (f.rival != null && typeof f.rival !== 'object') return f.rival;
    if (f.rival && f.rival.id != null) return f.rival.id;
    if (f.home == null && f.away == null) return null;
    return f.home === c.myClub ? f.away : f.home;
  }
  function isFinal(c, f) {
    if (f.kind === 'cup') return (f.round | 0) === 1;
    var ko = c.kos && c.kos[f.ko != null ? f.ko : c.koI], rd = ko && ko.rounds && ko.rounds[f.round | 0];
    return !!(rd && rd.length === 1);
  }
  function bossOf(c) {
    if (isH(c)) return null;
    var L = VB.CareerLife, l = lifeOf(c);
    var key = L && L.bossKey ? L.bossKey(c) : '';
    return key && obj(l.boss) && obj(l.boss[key]) ? l.boss[key] : null;
  }
  function lastVs(c, rid) {
    var ns = Array.isArray(c.notes) ? c.notes : [];
    for (var i = ns.length - 1; i >= 0; i--) if (ns[i] && ns[i].rival === rid) return ns[i];
    return null;
  }
  function fameTier(c) {
    var L = VB.CareerLife, T = L && L.TIERS || [[0], [500], [2000]], fm = +lifeOf(c).fame || 0, t = 0;
    for (var i = 0; i < T.length; i++) if (fm >= T[i][0]) t = i;
    return t;
  }
  /** Etiqueta del partido f (sin f: el próximo). PURA: ni escribe en c ni gasta azar. '' si no es especial. */
  function tagFor(c, f) {
    if (!c || typeof c !== 'object') return '';
    if (f === undefined) f = fixture(c);
    if (!f || typeof f !== 'object') return '';
    var rid = rivalId(c, f); if (rid == null || rid < 0) return '';
    var l = lifeOf(c);
    if (l.rival && l.rival.club === rid) return 'duel';
    if (f.kind === 'cup' || f.kind === 'ko') return isFinal(c, f) ? 'final' : 'ko';
    var b = bossOf(c); if (b && b.club === rid) return 'boss';
    var me = myClub(c), rv = clubOf(c, rid);
    if (me && rv && me.city && me.city === rv.city) return 'derby';
    var n = lastVs(c, rid); if (n && !n.win) return 'rev';
    if (fameTier(c) >= 2 && S.rng(c, 'st-tv', c.season | 0, fkey(c, f))() < 0.2) return 'tv';
    return '';
  }
  function tagName(t) { return TAG_NAME[t] || ''; }

  // ================================================================== textos
  function parse(str, H) {
    var p = str.indexOf('|'), a = p > 0 ? str.slice(0, p) : 'cron', t = p > 0 ? str.slice(p + 1) : str, h = t.split('||');
    return { a: a, t: H && h[1] ? h[1] : h[0] };
  }
  function fill(s, v) {
    var src = String(s == null ? '' : s);   // (variable al empezar frase: con mayúscula, «Quien coloca dice…»)
    return src.replace(/\{(\w+)\}/g, function (m, n, at) { var x = v[n] != null ? String(v[n]) : '', pre = src.slice(0, at); return x && (/^\s*$/.test(pre) || /(?:[.!?]\s+|«)$/.test(pre)) ? x.charAt(0).toUpperCase() + x.slice(1) : x; }).replace(/[{}]/g, '').replace(/ {2,}/g, ' ').replace(/ ([.,])/g, '$1').trim();
  }
  function author(c, a) {
    var cs = S.cast(c), V = S.vars(c), l = lifeOf(c);
    switch (a) {
      case 'cron': return cs.acc.cronista;
      case 'rumor': return cs.acc.rumor;
      case 'pena': return cs.acc.pena;
      case 'hater': return cs.acc.hater;
      case 'diario': return '@' + handle(cs.media.diario);
      case 'digital': return '@' + handle(cs.media.digital);
      case 'radio': return '@' + handle(cs.media.radio);
      case 'pod': return '@' + handle(cs.media.pod);
      case 'mate': return isH(c) ? 'La capitanía' : '@' + (handle(V.mate) || 'TuPareja');
      case 'rival': return '@' + (handle(l.rival && l.rival.name || V.rival) || 'ElRival');
      case 'sponsor': return '@' + (handle(V.sponsor) || 'TuPatrocinador');
      case 'fam': return cs.fam;
      case 'me': return '@' + (handle(V.yo) || 'Yo');
    }
    return typeof a === 'string' ? a : '';
  }
  /** {a: autor, t: texto} de una publicación guardada. */
  function postText(c, p) {
    if (!obj(p)) return { a: '', t: '' };
    if (typeof p.t === 'string') return { a: author(c, p.a), t: fill(p.t, S.vars(c, p.v)) };
    var L = W[p.k], str = L && L[p.i | 0]; if (typeof str !== 'string') return { a: '', t: '' };
    var x = parse(str, isH(c));
    return { a: author(c, x.a), t: fill(x.t, S.vars(c, p.v)) };
  }
  function fmtK(n) {
    n = Math.max(0, Math.round(+n || 0));
    if (n < 1000) return String(n);
    var f = function (v) { var s = (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); return s.slice(-2) === ',0' ? s.slice(0, -2) : s; };
    return n < 1e6 ? f(n / 1000) + ' mil' : f(n / 1e6) + ' M';
  }
  function likes(c, r) { var fans = Math.max(+lifeOf(c).fame || 0, FANS_MIN); return Math.max(1, Math.round(fans * (0.02 + 0.06 * r()))); }

  // ================================================================== estado
  function sanePost(p) {
    if (!obj(p)) return null;
    if (typeof p.t !== 'string' && !(typeof p.k === 'string' && W[p.k] && num(p.i))) return null;
    if (!obj(p.v)) p.v = {};
    p.lk = num(p.lk) && p.lk >= 0 ? Math.round(p.lk) : 0;
    if (typeof p.a !== 'string') p.a = '';
    return p;
  }
  function sanePage(g) {
    if (!obj(g) || !Array.isArray(g.p)) return null;
    g.p = g.p.map(sanePost).filter(Boolean).slice(0, PAGE_MAX + 1);
    g.s = g.s | 0; g.w = g.w | 0; g.mN = num(g.mN) ? g.mN | 0 : 0; g.bench = g.bench ? 1 : 0;
    return g;
  }
  function ensure(s, c) {
    var w = sanePage(s.wall);
    if (w) w.prev = sanePage(w.prev) || null;
    if (w && w.prev) delete w.prev.prev;
    s.wall = w;
    if (!Array.isArray(s.wallSeen)) s.wallSeen = [];
    s.wallSeen = s.wallSeen.filter(function (x) { return obj(x) && num(x.mN) && Array.isArray(x.k); }).slice(-(SEEN_JOR + 1));
    s.post = num(s.post) ? s.post | 0 : -1;
    s.mk = obj(s.mk) && num(s.mk.k) && typeof s.mk.tag === 'string' && (s.mk.tag === '' || TAG_NAME[s.mk.tag]) ? s.mk : null;
    if (typeof s.wsp !== 'string') { var sp = lifeOf(c).sponsor; s.wsp = sp && typeof sp.name === 'string' ? sp.name : ''; }
    if (!Array.isArray(s.wallIn)) s.wallIn = [];
    // lo que llegó a la cola del núcleo (s.wallQ) antes de que este sistema existiera pasa a los pendientes
    if (Array.isArray(s.wallQ) && s.wallQ.length) { s.wallIn = s.wallIn.concat(s.wallQ); s.wallQ = []; }
    s.wallIn = s.wallIn.filter(function (x) { return obj(x) && typeof x.t === 'string'; }).slice(-IN_MAX);
    return s;
  }
  function St(c) { return c && obj(c.story) && c.story.v === 1 ? c.story : S.ensure(c); }
  function markNext(c) { var s = St(c), f = fixture(c); s.mk = f ? { k: fkey(c, f), tag: tagFor(c, f) } : null; }

  // ================================================================== muro de la jornada
  function streakOf(c) { var ns = Array.isArray(c.notes) ? c.notes : [], n = 0; for (var i = ns.length - 1; i >= 0 && ns[i] && ns[i].win; i--) n++; return n; }
  var ERR_IDS = ['srvErr', 'atkErr', 'net', 'dbl', 'four', 'pos', 'err', 'recvErr'];
  /** Situaciones de la jornada, por prioridad: [[clave de W, vars]]. */
  function situations(c, sum, ctx) {
    var out = [], me = sum.me || {}, win = !!sum.win, l = lifeOf(c), s = St(c);
    var tag = ctx.played && ctx.played.tag || '';
    if (tag && tag !== 'duel' && W[tag + (win ? 'W' : 'L')]) out.push(tag + (win ? 'W' : 'L'));
    var du = sum.life && sum.life.duel;
    if (du && du.name) out.push([du.win ? 'duelW' : 'duelL', { rp: du.name, w: du.w | 0, l: du.l | 0 }]);
    if (S.flagAt(c, 'wall-join')) { out.push('sign'); delete s.flags['wall-join']; }
    var sc = sum.setScores || [], sets = sum.sets || [0, 0];
    if (win && sc.length && sc[0] && sc[0][0] < sc[0][1]) out.push('comeback');
    else if (win && (sets[1] | 0) === 0) out.push('sweep');
    if (num(sum.nota) && sum.nota >= 8) out.push('big');
    else if (num(sum.nota) && sum.nota < 5) out.push('low');
    var best = sum.rt && Array.isArray(sum.rt.best) ? sum.rt.best : [], worst = sum.rt && Array.isArray(sum.rt.worst) ? sum.rt.worst : [];
    if ((me.aces | 0) >= 3 || ((me.aces | 0) >= 2 && best[0] && best[0].id === 'ace')) out.push(['ace', { aces: me.aces | 0 }]);
    if (!win && ((worst[0] && ERR_IDS.indexOf(worst[0].id) >= 0 && worst[0].d <= -0.3) || (me.errors | 0) >= 5)) out.push('err');
    var st = streakOf(c); if (win && st >= 3) out.push(['streak', { n: st }]);
    var sp = l.sponsor && typeof l.sponsor.name === 'string' ? l.sponsor.name : '';
    if (sp && sp !== s.wsp) out.push('sponsor');
    s.wsp = sp;
    var ev = S.flagAt(c, 'wall-ev'); if (ev) { out.push('decision'); delete s.flags['wall-ev']; }
    var pb = S.flagAt(c, 'wall-pub'); if (pb && pb.mN === s.mN - 1 && W['echo' + (pb.v | 0)]) out.push('echo' + (pb.v | 0));
    return out;
  }
  function seenSet(s) { var o = {}; s.wallSeen.forEach(function (x) { if (x.mN < s.mN && x.mN >= s.mN - SEEN_JOR) x.k.forEach(function (k) { o[k] = 1; }); }); return o; }
  /** Variante de la situación k que no se haya usado en las 3 jornadas anteriores (ni en esta página); mejor de un autor que aún
   *  no haya salido en la página (au). -1 si no queda. */
  function pickVar(c, k, r, seen, au) {
    var L = W[k]; if (!L) return -1;
    var hasSp = !!(lifeOf(c).sponsor && lifeOf(c).sponsor.name), ok = [], fresh = [];
    for (var i = 0; i < L.length; i++) {
      var a = parse(L[i]).a; if (seen[k + '.' + i] || (!hasSp && a === 'sponsor')) continue;
      ok.push(i); if (!au || !au[a]) fresh.push(i);
    }
    if (fresh.length) ok = fresh;
    return ok.length ? ok[Math.floor(r() * ok.length) % ok.length] : -1;
  }
  function baseVars(c, sum) {
    var V = S.vars(c), sets = sum.sets || [0, 0], res = (sets[0] | 0) + '-' + (sets[1] | 0), rv = sum.rivalName || V.rival;
    return { rival: rv, res: res, score: V.club + ' ' + res + ' ' + rv, nota: nota1(sum.nota), played: c.stats ? c.stats.played | 0 : 0 };
  }
  function build(c, sum, ctx) {
    var s = St(c), r = S.rng(c, 'st-wall', ctx.season, s.mN), seen = seenSet(s), used = [], bv = baseVars(c, sum);
    var bench = !!sum.bench, n = bench ? BENCH_N : PAGE_MIN + Math.floor(r() * (PAGE_MAX - PAGE_MIN + 1));
    var page = { s: ctx.season | 0, w: ctx.week | 0, mN: s.mN, bench: bench ? 1 : 0, p: [] }, au = {};
    function add(k, v, f) {
      if (page.p.length >= n) return false;
      var i = pickVar(c, k, r, seen, au); if (i < 0) return false;
      seen[k + '.' + i] = 1; used.push(k + '.' + i); au[parse(W[k][i]).a] = 1;
      var vv = {}, x; for (x in bv) vv[x] = bv[x]; if (v) for (x in v) vv[x] = v[x];
      var p = { a: parse(W[k][i]).a, k: k, i: i, v: vv, lk: likes(c, r) }; if (f) p.f = 1;
      page.p.push(p); return true;
    }
    // lo que publicaron otros sistemas (ecos, premios), como mucho 2
    var inn = s.wallIn.splice(0, s.wallIn.length);
    if (bench) {
      add('bench');
      if (inn.length) page.p.push(inPost(c, inn.shift(), r)); else add(sum.win ? 'benchW' : 'benchL', null, 1);
      if (page.p.length < n) add(sum.win ? 'benchW' : 'benchL', null, 1);
    } else {
      inn.slice(0, 2).forEach(function (q) { if (page.p.length < n) page.p.push(inPost(c, q, r)); });
      inn = inn.slice(2);
      situations(c, sum, ctx).forEach(function (x) { if (typeof x === 'string') add(x); else add(x[0], x[1]); });
      // relleno: resultado y después las cuentas de siempre, en orden por semilla
      add(sum.win ? 'win' : 'loss', null, 1);
      var fl = ['fan', 'hater', 'rumor', 'press'];
      for (var j = fl.length - 1; j > 0; j--) { var t = Math.floor(r() * (j + 1)); var y = fl[j]; fl[j] = fl[t]; fl[t] = y; }
      fl.forEach(function (k) { add(k, null, 1); });
    }
    if (inn.length) s.wallIn = inn.concat(s.wallIn).slice(-IN_MAX);   // lo que no cupo, a la jornada siguiente
    s.wallSeen.push({ mN: s.mN, k: used });
    s.wallSeen = s.wallSeen.filter(function (x) { return x.mN >= s.mN - SEEN_JOR; }).slice(-(SEEN_JOR + 1));
    var old = s.wall; if (old) delete old.prev;
    page.prev = old || null;
    s.wall = page;
    return page;
  }
  function inPost(c, q, r) { return { a: q.a || '', t: q.t, v: obj(q.v) ? q.v : {}, lk: likes(c, r), x: 1 }; }
  /** pushWall de otros sistemas: a la página de esta jornada (sustituye relleno para no pasar de 5) o a pendientes. */
  function onWall(c, q) {
    var s = St(c), g = s.wall;
    if (g && g.mN === s.mN) {
      var r = S.rng(c, 'st-wlk', s.mN, g.p.length, q.t.length), p = inPost(c, q, r);
      for (var i = g.p.length - 1; i >= 0; i--) if (g.p[i].f) { g.p[i] = p; return; }
      if (g.p.length < (g.bench ? BENCH_N : PAGE_MAX)) { g.p.push(p); return; }
    }
    s.wallIn.push({ a: q.a, t: q.t, v: q.v, mN: q.mN }); if (s.wallIn.length > IN_MAX) s.wallIn = s.wallIn.slice(-IN_MAX);
  }

  // ================================================================== Publicar (elección)
  function canPost(c) { var s = St(c); return !!(s && s.wall && s.wall.mN === s.mN && s.post !== s.mN && c.phase !== 'pick'); }
  function publish(c, tone) {
    tone = tone | 0; var T = TONES[tone]; if (!T || !canPost(c)) return null;
    var s = St(c), res = S.fx(c, T.e, T.why), r = S.rng(c, 'st-wpub', c.season | 0, s.mN), k = 'pub' + tone, i = Math.floor(r() * W[k].length) % W[k].length;
    s.post = s.mN;
    s.wall.p.unshift({ a: 'me', k: k, i: i, v: {}, lk: likes(c, r), me: 1 });
    S.flag(c, 'wall-pub', tone);
    return res;
  }

  // ================================================================== previa
  /** Línea de la previa del partido f (sin f: el próximo). '' si no es especial. Pura. */
  function line(c, f, rivalName) {
    if (f === undefined) f = fixture(c);
    var tag = tagFor(c, f); if (!tag) return '';
    var rid = rivalId(c, f), rv = clubOf(c, rid), l = lifeOf(c), b = bossOf(c), n = lastVs(c, rid), V = S.vars(c);
    var L = LINE[tag], i = Math.floor(S.rng(c, 'st-wline', fkey(c, f), tag)() * L.length) % L.length;
    return fill(L[i], S.vars(c, { rival: rivalName || rv && rv.name || V.rival, rp: l.rival && l.rival.name || V.rp, boss: b ? b.nick || b.name : 'el jefe',
      s1: n && n.s ? n.s[1] | 0 : 0, s2: n && n.s ? n.s[0] | 0 : 0 }));
  }

  // ================================================================== interfaz
  function stamp(c, f) { var t = tagFor(c, f); return t ? '<span class="tag y st-tag" title="Partido marcado">' + esc(TAG_NAME[t]) + '</span>' : ''; }
  function postsHTML(c, g, E2) {
    return '<ul class="st-posts" style="list-style:none;margin:0;padding:0">' + g.p.map(function (p) {
      var x = postText(c, p); if (!x.t) return '';
      return '<li style="padding:8px 0;border-top:1px solid rgba(255,255,255,.12)"><b>' + E2(x.a) + '</b><p style="margin:2px 0">' + E2(x.t) + '</p>' +
        '<span class="muted">' + fmtK(p.lk) + ' me gusta</span></li>';
    }).join('') + '</ul>';
  }
  function wallHTML(c, HLP) {
    if (!c) return '';
    var s = St(c), E2 = HLP && HLP.esc ? HLP.esc : esc, h = '<div class="card st-wall" data-nav><h3>Redes</h3>';
    var f = fixture(c), tg = tagFor(c, f);
    if (tg) h += '<p>' + stamp(c, f) + ' ' + E2(line(c, f)) + '</p>';
    if (canPost(c)) {
      h += '<p class="muted">Publica algo (una vez por jornada):</p><div class="acts st-acts" style="display:flex;flex-direction:column;gap:8px">' +
        TONES.map(function (T, i) {
          // el efecto en la línea pequeña, como las cartas de «Tu semana» y las respuestas (▲/▼; el color lo pone el botón)
          var hn = S.hint(c, T.e).map(function (x) { return '<span class="' + (x[1] ? 'st-up' : 'st-dn') + '">' + E2(x[0]) + ' ' + (x[1] ? '▲' : '▼') + '</span>'; }).join(' ');
          return '<button data-act="st-wall-pub-' + i + '" style="min-height:44px">' + E2(T.t) + (hn ? '<small>' + hn + '</small>' : '') + '</button>';
        }).join('') + '</div>';
    } else if (s.wall && s.post === s.mN) h += '<p class="muted">Ya has publicado esta jornada.</p>';
    if (!s.wall || !s.wall.p.length) return h + '<p class="muted">Aún no se habla de ti. Juega un partido y verás.</p></div>';
    h += postsHTML(c, s.wall, E2);
    if (s.wall.prev && s.wall.prev.p.length) h += '<h3 style="margin-top:12px">Jornada anterior</h3>' + postsHTML(c, s.wall.prev, E2);
    return h + '</div>';
  }
  function chips(c) {
    return canPost(c) ? [{ p: 8, ic: '@', t: 'Redes: publica algo', tab: 'inbox', s: 'wall' }] : [];
  }

  // ================================================================== sistema
  var sys = {
    id: 'wall',
    tpl: {},   // (el muro no usa el feed: sus textos van en W y no ocupan huecos del tope)
    W: W, LINE: LINE, TAGS: TAGS, TAG_NAME: TAG_NAME, TONES: TONES,
    ensure: ensure,
    onSetup: function (c, m, ctx) {
      var f = fixture(c), tag = tagFor(c, f), s = St(c);
      s.mk = f ? { k: fkey(c, f), tag: tag } : null;
      // line va al cartel grande de la previa (recap.stake → t1: una sola línea, 20-30 px, sin partir): a 568x320 caben unas 40
      // letras y las líneas de LINE tienen 40-130, así que allí va el nombre del sello y la frase entera queda en full
      var ln = tag && m && obj(m.career) ? line(c, f, m.career.rivalName) : '';
      if (tag && m && obj(m.career)) m.career.story = { tag: tag, name: TAG_NAME[tag], line: ln.length <= 40 ? ln : TAG_NAME[tag], full: ln };
    },
    onMatch: function (c, sum, f, ctx) {
      sum = sum || {};
      // El último partido de la temporada cierra la temporada DENTRO de closeMine: el gancho 'season' corre antes que 'match' y el
      // núcleo ya ha movido s.nk, así que ctx.played.tag le llega vacío. Se saca de s.mk con la clave del partido jugado (f y
      // sum.season) y se corrige el ctx compartido para los sistemas que van detrás (P4: estrellas del partido marcado).
      var s = St(c), pk = fkey({ season: num(sum.season) ? sum.season : ctx.season, mode: c.mode, koI: c.koI }, f || {});
      if (ctx.played && !ctx.played.tag && s.mk && s.mk.k === pk && s.mk.tag) ctx.played.tag = s.mk.tag;
      if (ctx.played && ctx.played.tag) S.flag(c, 'mk', ctx.played.tag);   // marca para la prensa (P1)
      build(c, sum, ctx);
      markNext(c);
    },
    onSeason: function () { },   // (s.mk se queda; el núcleo ya despacha 'season' después del 'match' del último partido)
    onNewSeason: function (c) { markNext(c); },
    onJoin: function (c) { S.flag(c, 'wall-join', 1); markNext(c); },
    onAnswer: function (c, k) { S.flag(c, 'wall-ev', typeof k === 'string' ? k : 1); },
    onAct: function (c, a) {
      var m = /^st-wall-pub-(\d)$/.exec(a || ''); if (!m) return null;
      var res = publish(c, +m[1]); return res ? { render: true, fx: res } : null;
    },
    onWall: onWall,
    chips: chips,
    ui: { wall: wallHTML, stamp: stamp },
    tagNext: function (c) { try { return tagFor(c, fixture(c)); } catch (e) { return ''; } },   // (pura: la etiqueta del próximo partido, para P1)
    tagFor: tagFor, tagName: tagName, line: line, fixture: fixture, fkey: fkey, postText: postText, likes: likes, fmtK: fmtK, canPost: canPost, publish: publish
  };
  S.use(sys);
  VB.CareerStoryWall = { tagFor: tagFor, tagName: tagName, stamp: stamp, line: line, fixture: fixture, likes: likes, fmtK: fmtK, canPost: canPost, publish: publish, wallHTML: wallHTML, postText: postText };
})();
