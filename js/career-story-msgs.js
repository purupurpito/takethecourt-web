/* MAKE THE CUT — js/career-story-msgs.js (owner: carrera)
 * «Carrera con vida» (sprint 1.13.0, notes/carrera-vida.md §2 S1): Bandeja viva, Gente y Prensa (paquete P1).
 * Subsistema 'msgs' de VB.CareerStory (API en la cabecera de js/career-story.js). Sin DOM al cargar; vale para playa y pista.
 *
 *  - Bandeja viva: en onMatch se evalúan los BEATS {id, pri, only?, when(c, sum, X, s), v?(c, sum, X, s)} (unos 50). Prioridad:
 *    eco y cadenas (4) > prensa (3,5) > partido marcado próximo (3) > racha, bajón y llaves de relación (2) > relleno (1, con tirada
 *    'st-msgf' y como mucho uno por jornada). Lo que pide respuesta (tpl.o) gasta tope (VB.CareerStory.budget); lo informativo no
 *    (como mucho INFO_MAX[freq] por jornada). Un beat no se repite en SEEN_GAP (6) jornadas (s.seenB). Lo que no se contesta caduca
 *    a las 2 jornadas con su línea de cierre (tpl.c) y sin efecto (lo hace el núcleo).
 *  - Prensa: cada 3-4 jornadas en Normal (5 en Poca, 2-3 en Mucha; tirada 'st-press'), siempre tras una final o un derbi, duelo o jefe (con 2 jornadas de hueco),
 *    nunca si la decisión pendiente de career-life es pressWin o pressLoss, nunca tras el banquillo. 16 preguntas que no se repiten
 *    entre las 8 últimas (s.pressQ). Tres respuestas apiladas: de equipo (química +5), humilde (Entrenador +3), chulería (fama ×0,04,
 *    Entrenador −4, pique +20). La respuesta deja s.flags.press = {mN, v:{t, rv, done}} y en el siguiente partido llega el eco (solo
 *    publicación en Redes y mensaje informativo: nunca efectos).
 *  - Cadenas sobre los EVENTS de career-life: onAnswer(c, evKey, i) solo anota en c.story (s.chn y, en rivalTalk y tv, el pique o el
 *    agente); el segundo eslabón sale como beat de prioridad 4 en las jornadas siguientes (party, ankle, clinic, viral, pressWin,
 *    pressLoss, rivalTalk, mateDown, tv, sponsorShoot, fans, scout, speech).
 *  - Gente (ui.people): entrenador, química, agente, tu gente, rival personal (calor y «Archienemigo» con calor ≥ 80) y, en pista,
 *    quien te disputa el puesto (SOLO LECTURA de c.sq6.L y c.sq6.list: lineup6 escribe en c y aquí nunca se llama). El porqué del
 *    último cambio de confianza y química sale de comparar s.coach0 / s.chem0 con lo de después del partido.
 *  - ui.inbox(c, HLP, msgHTML, fresh): el feed mezclado con c.inbox al pintar (lo que espera respuesta, arriba). Botones
 *    data-act="st-ans-<id>-<i>" dentro de [data-nav] (los atiende el núcleo). ui.css(): unas reglas pequeñas para estas tarjetas.
 * Regla de oro: aquí nada pasivo toca el núcleo. Solo los efectos de las opciones (tpl.o[i].e, con VB.CareerStory.fx al contestar).
 * Estado propio en c.story: seenB {id: mN}, pressQ [i], pressNext y pressLast (mN), chn {evKey: {i, mN, s, rv}}, coach0, chem0, benchRun, lossRun
 * y rel.seat (pique por el puesto, 0-100; clave de efecto propia 'seat').
 * Partido marcado PRÓXIMO (para P3): se lee de VB.CareerStory.sys('wall').tagNext(c) si existe (puro); si no, de s.mk cuando
 * s.mk.k === ctx.nk; en copa o KO cuenta como «final». Sin tagNext, las previas de derbi, revancha, tele, jefe y duelo no salen.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  if (!VB.CareerStory || !VB.CareerStory.use) return;
  var S = VB.CareerStory;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function nt(n) { return num(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : ''; }
  function sgn(n) { return (n > 0 ? '+' : '−') + Math.abs(n); }

  var SEEN_GAP = 6, INFO_MAX = [1, 1, 2], FILL_P = [0.25, 0.45, 0.7], CHN_LIFE = 8, PRESSQ_MAX = 8, PRESS_MIN = 2;
  var PRESS_TAG = { final: 1, derbi: 1, duelo: 1, jefe: 1 };   // partidos marcados que siempre traen rueda de prensa (si no hubo una hace nada)

  // ================================================================== cierres al caducar (por remitente)
  var CL = {
    agent: ['Cris: «Vale, lo hablamos otro día.»', 'Cris: «Me tomo el silencio como un ya veremos.»', 'Cris: «Sin prisa. Lo dejo apuntado.»', 'Cris: «Entendido, otro día será.»', 'Cris: «Te dejo respirar. Ya me dirás.»'],
    coach: ['{coach}: «No has contestado. Seguimos con lo de siempre.»', '{coach}: «Lo dejamos aquí. Ya hablaremos en el entreno.»', '{coach}: «Silencio. Lo apunto y seguimos.»', '{coach}: «Bueno, ya me lo dirás en la pista.»'],
    mate: ['«Vale, ya lo hablamos en el entreno.»', '«Te lo dejo caer otro día.»', '«Sin respuesta. Lo pillo, hay mucho lío.»', '«Ok, otro día será.»'],
    fam: ['Tu gente: «Bueno, ya nos llamarás cuando puedas.»', 'Tu gente: «Otro día nos cuentas. Come bien.»', 'Tu gente: «Ya veremos. Un beso enorme.»', 'Tu gente: «Nada, ya hablamos el domingo.»'],
    barrio: ['La peña lo deja para otra ocasión.', 'La peña del barrio sigue esperando. Sin rencor.', 'Nadie contestó. La peña se fue a merendar.'],
    press: ['La rueda de prensa acaba sin tu respuesta. Titular del día: «Silencio».', 'Te escapas por la puerta de atrás. La prensa tendrá que inventarse la frase.', 'Sin respuesta. Los micrófonos se apagan solos.'],
    rival: ['{rp} se queda sin respuesta. Quizá sea lo mejor.', 'No contestas a {rp}. El pique se enfría un poco.'],
    sponsor: ['{sponsor}: «Lo dejamos para la próxima campaña.»', '{sponsor}: «Sin problema, otra vez será.»'],
    physio: ['El fisio suspira y apunta tu nombre en la libreta.', 'El fisio: «Tú verás. Luego no vengas a llorar.»'],
    peer: ['{who}: «Vale, ya veo que estás a lo tuyo.»', '{who}: «Nada, olvídalo. Ya se me pasará.»', '{who}: «Bueno, lo hablamos en el vestuario.»', '{who}: «Ok. Me lo guardo para mí.»']
  };
  var WHO = { agent: 'Agente', coach: 'Cuerpo técnico', fam: 'Familia', barrio: 'Afición', press: 'Prensa', rival: 'Rival', sponsor: 'Patrocinio', physio: 'Cuerpo técnico', peer: 'Vestuario', rumor: 'Redes', hater: 'Redes', fan: 'Afición' };

  // ================================================================== plantillas (tpl). {rival} {nota} {m} {n} {seat} van en vars
  // (cada entrada guarda sus vars al publicarse; el texto se regenera al pintar). Opciones: e = efectos (solo al contestar).
  var T = {};
  function op(t, e, why) { return { t: t, e: e, why: why }; }


  // ------------------------------------------------------------------ quejas del vestuario (Ferran, 18-nov-2026: «compañeros quejándose
  // por mensaje: de jugar poco, de compañeros, del entrenamiento, del partido, del árbitro...»). Remitente 'peer': en pista, alguien
  // de tu plantilla con nombre (c.sq6.list, solo lectura; {who}, y {otro} para quien recibe la crítica); en playa, tu pareja. Los
  // efectos, como todo, solo al contestar.
  T.qMinutes = { k: 'peer', only: 'hall', t: ['No juego nada', 'Minutos', 'Desde el banquillo'],
    x: ['Otra jornada calentando banquillo. Entreno como nadie y {coach} ni me mira. ¿Tú lo ves normal?'],
    xh: ['Otra jornada calentando banquillo. Entreno como nadie y {coach} ni me mira. ¿Tú lo ves normal?',
      'Llevo tres partidos sin pisar la pista. Si no cuentan conmigo, que me lo digan a la cara.',
      'Me han dicho que «paciencia». Paciencia tengo, lo que no tengo son minutos. ¿Me echas un cable?',
      'Hoy ni en el cambio de la rotación. Empiezo a pensar que soy parte del mobiliario del pabellón.',
      '¿Sabes cuántos puntos he jugado este mes? Yo tampoco, porque no llegan a una mano.',
      'Estoy por pedir que me pongan un cojín en el banquillo. Total, voy a vivir ahí.'],
    o: [op(['Animar', 'Tu momento llegará', 'Entrenar juntos'], { chem: 3, mood: -1 }, 'Animaste a quien no juega'), op(['Que se lo gane', 'Es cosa del banquillo', 'No meterte'], { coach: 1, chem: -2 }, 'No te metiste en lo de los minutos')], c: CL.peer };
  T.qMate = { k: 'peer', t: ['Una cosa entre nosotros', 'Tengo que decírtelo', 'Sin rodeos'],
    x: ['Hoy me has dejado todas las cortas a mí. No pasa nada, pero la red es de las dos personas, ¿eh?',
      'Te lo digo con cariño: cuando pido la bola, es que la quiero. Hoy me has robado tres.',
      'En el segundo set no sabía si ibas a bloquear o a defender. Yo tampoco, así que hemos hecho las dos cosas mal.',
      'Necesito que me hables más en la pista. Hoy parecíamos dos desconocidos compartiendo arena.',
      'Esa última bola era tuya y lo sabes. Nos ha costado el set. Ya está, ya lo he dicho.',
      'Me haces señas de bloqueo y luego no saltas. Me tienes en un sinvivir.'],
    xh: ['{otro} no pasa una en recepción y aquí nadie dice nada. ¿Soy la única persona que lo ve?',
      'No puedo más con {otro}. Llega tarde a todos los entrenos y luego juega de inicio. Explícamelo.',
      '{otro} se pasa el partido protestando a todo el mundo. Así no hay quien se concentre.',
      'Que {otro} deje de pedir la bola si luego la manda a la grada. Lo digo y me quedo a gusto.',
      '{otro} no me ha cubierto ni una vez en todo el partido. Ni una. Las he contado.',
      'Si {otro} vuelve a poner su música en el vestuario antes del partido, tiro el altavoz por la ventana.'],
    o: [op(['Quitarle hierro', 'Calmar las aguas', 'Escuchar'], { chem: 3, fatigue: 2 }, 'Calmaste las aguas'), op(['No meterte', 'Que lo arreglen', 'Pasar del tema'], { mood: 1, chem: -2 }, 'No te metiste en el lío')], c: CL.peer };
  T.qTrain = { k: 'peer', t: ['El entreno de hoy', 'Vaya sesión', 'No siento las piernas'],
    x: ['El entreno de hoy ha sido un castigo. Cien saltos y luego arena hasta las rodillas. ¿Se lo decimos a {coach}?',
      'Tres horas al sol y ni una pausa para beber. Una cosa es entrenar y otra sobrevivir.',
      'Si mañana repetimos los sprints en la arena blanda, me quedo a vivir en la ducha.',
      'He contado los ejercicios: catorce. He contado mis fuerzas: ninguna. ¿Hablamos con el banquillo?'],
    xh: ['El entreno de hoy ha sido un castigo. Doscientos bloqueos y luego físico. ¿Se lo decimos a {coach}?',
      'Media plantilla está cojeando y mañana toca otra vez pesas. Alguien tiene que decir algo.',
      'Hemos hecho el mismo ejercicio de recepción hora y media. Hasta el balón estaba aburrido.',
      '{coach} nos tiene a doble sesión toda la semana. Así llegamos al sábado sin piernas.',
      'He soñado con la escalera de coordinación. No era un sueño bonito.'],
    o: [op(['Pedir descanso', 'Hablar con {coach}', 'Bajar la carga'], { coach: -1, fatigue: -5 }, 'Pediste bajar la carga'), op(['Aguantar juntos', 'Sudar y callar', 'Es lo que toca'], { chem: 3, train: 10 }, 'Aguantasteis la sesión')], c: CL.peer };
  T.qMatch = { k: 'peer', t: ['Lo de hoy', 'Desahogo', 'Así no'],
    x: ['Hoy hemos jugado fatal y nadie lo dice. Empiezo yo: mi recepción daba pena.',
      'Contra {rival} no ha salido nada. Ni saque, ni defensa, ni ganas. ¿Qué nos pasa?',
      'Me voy a casa con mal cuerpo. No por perder: por cómo hemos perdido.',
      'Llevo toda la noche pensando en el partido. Necesitaba soltarlo con alguien.'],
    xh: ['Hoy hemos jugado fatal y en el vestuario todo el mundo mirando el móvil. Alguien tenía que decirlo.',
      'Contra {rival} no ha salido nada. Ni saque, ni bloqueo, ni ganas. Esto no es un equipo, es un grupo de gente.',
      'Me voy a casa con mal cuerpo. No por perder: por cómo hemos perdido.',
      'Quien diga que hoy hemos dado el máximo, miente. Y lo sabemos.',
      'Hay gente que se ha rendido en el tercer set. No digo nombres, pero no digo nombres.'],
    // (sin capitanía no convocas nada: escuchas o te lo comes y a entrenar)
    o: [op(['Escuchar', 'Dejar que se desahogue', 'Darle la razón en privado'], { chem: 3, mood: -2 }, 'Escuchaste el desahogo'), op(['Comértelo y a entrenar', 'Tragar y a currar', 'Callar y entrenar'], { train: 10, mood: -1 }, 'Te comiste la queja')], c: CL.peer };
  T.qRef = { k: 'peer', t: ['El árbitro', 'Esa bola', 'Lo de la línea'],
    x: ['Esa bola del final era dentro. DENTRO. Lo he visto clarísimo desde donde estaba.',
      'Para mí el saque de {rival} del segundo set se fue fuera. Y el árbitro, tan tranquilo.',
      'Me han pitado dobles en una colocación que era limpísima. Limpísima.',
      'Hemos perdido contra {rival} y contra un par de bolas de la línea. Eso pesa.'],
    xh: ['Esa bola del final era dentro. DENTRO. Lo he visto clarísimo desde el banquillo.',
      'Para mí el remate de {rival} del tercer set se fue fuera por un palmo. Y nadie dice nada.',
      'Me han pitado red en un bloqueo en el que ni la rocé. Ni la rocé.',
      'Hemos perdido contra {rival} y contra un par de bolas de la línea. Eso pesa.',
      'Nos han cantado dobles en una colocación que era limpia. Y en la siguiente jugada, a {rival}, nada.'],
    o: [op(['Calmar', 'Los árbitros también fallan', 'Mirar lo nuestro'], { coach: 2 }, 'Calmaste lo del árbitro'), op(['Darle la razón', 'Desahogarse juntos', 'Yo también la vi'], { chem: 3, coach: -1 }, 'Os desahogasteis con el arbitraje')], c: CL.peer };
  T.qPlan = { k: 'peer', only: 'hall', t: ['El plan de {coach}', '¿Tú lo entiendes?', 'La pizarra'],
    x: ['No entiendo el plan de {coach}. ¿Tú lo entiendes?'],
    xh: ['No entiendo por qué {coach} nos pone a recibir a cuatro contra un saque flotante. ¿Tú lo entiendes?',
      'Otra vez el mismo sistema que no nos funciona. Llevamos tres partidos igual. Alguien tiene que decírselo a {coach}.',
      '{coach} ha cambiado la rotación a mitad de set sin explicarnos nada. Media pista no sabía dónde ponerse.',
      'En el tiempo muerto {coach} nos ha dicho «jugad mejor». Gracias, eso no se nos había ocurrido.',
      'El vídeo táctico de hoy ha durado más que el partido. Y no me he enterado de nada.'],
    o: [op(['Defender a {coach}', 'Confiar en el plan', 'Hay que creer'], { coach: 2, chem: -2 }, 'Defendiste el plan del cuerpo técnico'), op(['Darle la razón', 'Algo hay que cambiar', 'Hablarlo con {coach}'], { chem: 2, coach: -2 }, 'Cuestionaste el plan')], c: CL.peer };
  T.qTravel = { k: 'peer', t: ['El viaje', 'Vaya hotel', 'Quejas varias'],
    x: ['El hotel de la última jornada tenía una cama que parecía una tabla de surf. Y no en el buen sentido.',
      'Seis horas de furgoneta para jugar dos sets. La próxima vez voy en bici, que llego antes.',
      'Nos han dado bocadillos de nada para comer. De nada. Pan con pan.',
      'El aire acondicionado del coche no funcionaba. He llegado al partido como una sopa. Literalmente.'],
    xh: ['El autobús de la última jornada no tenía calefacción. Hemos llegado al pabellón con los dedos azules.',
      'El hotel tenía un gimnasio con una bici y una pesa. Una. La de dos kilos.',
      'Seis horas de autobús para jugar a las nueve de la mañana. ¿Quién hace estos calendarios?',
      'La cena del hotel: pasta sin sal y una pera. Así no se gana una liga.'] };

  // ------------------------------------------------------------------ eco y cadenas (prioridad 4)
  T.cParty = { k: 'agent', t: ['Una foto tuya circula por ahí', 'Tenemos una foto', 'Lo del chiringuito'], th: ['Una foto tuya circula por ahí', 'Tenemos una foto', 'Lo de la cena'],
    x: ['Circula una foto tuya bailando en el chiringuito. Tiene ya más compartidos que tu último bloqueo. ¿Qué hacemos?',
      'Alguien grabó tu coreografía en el chiringuito y está por todas partes. Hay que reconocerlo: tienes ritmo. ¿Lo aprovechamos o lo apagamos?',
      'La foto del chiringuito ha llegado hasta mi madre. Y mi madre no tiene redes. ¿Te ríes con ello o pido que la quiten?',
      'Esa foto tuya con el flotador en la cabeza ya es meme. Hay quien la usa de fondo de pantalla. Tú decides el tono.',
      'Hay un vídeo tuyo bailando en el chiringuito con música de verbena. Sales con mucha dignidad, dentro de lo que cabe. ¿Qué hacemos?',
      'Me han mandado la foto del chiringuito seis personas distintas antes del desayuno. Necesito saber cómo lo llevamos.'],
    xh: ['Circula una foto tuya cantando en la cena de equipo con el micrófono del karaoke. Tiene más compartidos que tu último bloqueo. ¿Qué hacemos?',
      'Alguien grabó tu actuación en la cena de equipo y está por todas partes. Hay que reconocerlo: afinas. ¿Lo aprovechamos o lo apagamos?',
      'La foto de la cena ha llegado hasta mi madre. Y mi madre no tiene redes. ¿Te ríes con ello o pido que la quiten?',
      'Esa foto tuya con la servilleta en la cabeza ya es meme. Medio vestuario la tiene de fondo de pantalla. Tú decides el tono.',
      'Hay un vídeo de la cena de equipo en el que diriges la conga. Sales con mucha dignidad, dentro de lo que cabe. ¿Qué hacemos?'],
    o: [op(['Reírte con ello', 'Subirla tú también', 'Hacerte el meme'], { fame: 0.03, fameMin: 15 }, 'La foto de la fiesta'), op(['Pedir que la borren', 'Que la quiten', 'Hacerla desaparecer'], { coach: 2 }, 'Discreción tras la fiesta')], c: CL.agent };
  T.cAnkle = { k: 'physio', t: ['Te dije que pararas', 'El tobillo otra vez', 'Aviso del fisio'],
    x: ['Te dije que pararas. Ese tobillo vuelve a quejarse y tú sigues con la fatiga por las nubes.', 'El tobillo de la otra vez me está mandando señales de humo. ¿Me haces caso esta vez?',
      'Llevas días apretando con el tobillo tocado. Te lo digo con cariño: un día se va a declarar en huelga.', 'Tu tobillo y yo hemos hablado. Dice que necesita vacaciones. Opino lo mismo.',
      'He visto cómo caías en el último bloqueo. Con esa fatiga, el tobillo de la otra vez no aguanta mucho más.', 'O paramos un poco o el tobillo para por su cuenta. Prefiero lo primero.'],
    o: [op(['Hacer caso al fisio', 'Sesión de fisio', 'Parar un poco'], { fatigue: -10, money: -0.1 }, 'Hiciste caso al fisio'), op(['Seguir apretando', 'Ya paro luego', 'Aguantar'], { coach: 1 }, 'Aguantaste con molestias')], c: CL.physio };
  T.cViral = { k: 'mate', t: ['Te han parodiado', 'Mira lo que ha subido tu rival', 'La parodia'],
    x: ['{rp} ha subido una parodia de tu vídeo de la papelera. Falla los nueve intentos y acaba dentro de la papelera. Reconozco que me he reído.',
      'Tu reto viral tiene parodia: {rp} intentándolo con una sandía. Ya lleva más visitas que el original.', 'Corre por ahí una versión de tu vídeo hecha por {rp}, con peluca incluida. Es mala, pero tiene gracia.',
      '{rp} ha hecho su versión de tu reto. Acierta a la primera y lo celebra como una final. Qué manera de venirse arriba.',
      'Te han copiado el reto: {rp}, a cámara lenta y con música épica. No sé si es homenaje o burla.', 'La parodia de {rp} va por su tercera versión. Esto ya es una saga.'] };
  T.cPressWin = { k: 'mate', t: ['Tu frase, en el vestuario rival', 'Te han colgado en la pared', 'Han leído tus declaraciones'],
    x: ['Me cuentan que en el vestuario de {rival} han colgado tu frase de la rueda de prensa. Con chinchetas y subrayada en rojo.',
      'Tu titular de la otra noche está pegado en la puerta del vestuario de {rival}. Dicen que lo leen antes de cada entreno.',
      'En {rival} han impreso tu frase en tamaño póster. Hay quien dice que les motiva. Hay quien dice que les hace gracia.',
      'Alguien que juega en {rival} me ha mandado una foto: tu frase, enmarcada, encima de la pizarra táctica.',
      'Lo que dijiste a la prensa ha llegado a {rival}. Lo tienen en la pared junto a la máquina del café.',
      'Tu frase de la rueda de prensa ya decora el vestuario de {rival}. Igual habría que cobrarles derechos.'],
    o: [op(['Tomarlo con humor', 'Mandarles un saludo', 'Reírte'], { fame: 0.02, fameMin: 10 }, 'Tu frase en el vestuario rival'), op(['No entrar al trapo', 'Pasar del tema', 'Silencio'], { coach: 1 }, 'No entraste al trapo')], c: CL.mate };
  T.cRef = { k: 'coach', t: ['Lo de los árbitros', 'Tenemos que hablar', 'A los árbitros, ni mirarlos'],
    x: ['Me ha llamado gente del comité por lo que dijiste del arbitraje. A los árbitros, ni mirarlos. ¿Pedimos disculpas o lo dejamos estar?',
      'Tu frase sobre el árbitro ha sentado fatal. No voy a decirte qué pensar, pero sí qué decir en voz alta.',
      'Culpar al árbitro sale gratis un día. Al siguiente te pitan todo. ¿Lo arreglamos?', 'He recibido un correo muy educado y muy largo sobre tus palabras del otro día. Mi consejo: disculpas cortas.',
      'Los árbitros también leen la prensa. Sobre todo cuando salen en ella. ¿Qué hacemos?', 'Lo del arbitraje ya no es tema del partido: es tema tuyo. Decide cómo lo cierras.'],
    o: [op(['Pedir disculpas', 'Disculpas cortas', 'Rectificar'], { coach: 2 }, 'Pediste disculpas al arbitraje'), op(['Mantenerlo', 'Lo dicho, dicho', 'No rectificar'], { fame: 0.02, fameMin: 10, coach: -2 }, 'Mantuviste lo del árbitro')], c: CL.coach };
  T.cRivalTalk = { k: 'rival', t: ['{rp} contesta', 'Segundo asalto', 'El pique sigue'],
    x: ['Me han contado lo que dijiste. Mucho valor desde el sofá. Nos vemos en la pista.', 'Lo tuyo tuvo gracia. Lo mío será un bloqueo en tu cara. Te aviso con tiempo.',
      'He enmarcado tu respuesta. La voy a colgar junto a mis medallas. Hay sitio de sobra, tranquilidad.', 'Que sí, que muy bien. Pero las entrevistas no suman puntos.',
      'Mi abuela ha leído lo que dijiste y dice que le caes bien. Yo no lo tengo tan claro.', 'Te contesto con calma: tú hablas, yo entreno. Ya veremos quién se ríe al final.'],
    o: [op(['Zanjarlo', 'Paz y a jugar', 'Cerrar el tema'], { coach: 2, heat: -10 }, 'Zanjaste el pique'), op(['Seguir el pique', 'Contestar otra vez', 'Subir el tono'], { fame: 0.03, fameMin: 15, heat: 15 }, 'Seguiste el pique')], c: CL.rival };
  T.cMateOk = { k: 'mate', t: ['Gracias por lo del otro día', 'Te debo una', 'Ya estoy mejor'],
    x: ['Solo quería decirte que lo del otro día me vino genial. Ya duermo mejor y hasta me río en los entrenos.', 'Te debo una. Cuando peor estaba, apareciste. Eso no se olvida.',
      'Vuelvo a ser yo. Gracias por no soltarme la mano cuando no hablaba ni con la máquina del café.', 'Gracias por lo del otro día. La próxima cena la pago yo, que lo sepas.',
      'Estoy mucho mejor. Me alegra tener a alguien así al lado.', 'He vuelto. Y en parte es culpa tuya. Gracias de verdad.'] };
  T.cMateCold = { k: 'mate', t: ['Lo de «espabila»', 'Me quedé con eso', 'Sobre lo que me dijiste'],
    x: ['Me quedé con lo de «espabila». No era el momento. Solo te lo digo.', 'Entiendo que nos jugamos mucho, pero me dolió cómo me lo dijiste.',
      'Llevo dos días dándole vueltas a lo que me dijiste. Prefiero hablarlo que tragármelo.', 'No estoy de morros, pero tampoco estoy bien. Lo de «espabila» escoció.',
      'Sé que lo dijiste para picarme. Funcionó, pero también dolió un poco.', 'Una cosa: la próxima vez, mejor un café que un grito. ¿Vale?'],
    o: [op(['Pedir perdón', 'Invitar a un café', 'Hablarlo'], { chem: 4 }, 'Pediste perdón'), op(['Lo dicho, dicho', 'Era necesario', 'Mantenerte firme'], { coach: 1 }, 'Te mantuviste firme')], c: CL.mate };
  T.cTv = { k: 'agent', t: ['Te vieron en la tele', 'Ha sonado el teléfono', 'Después del plató'],
    x: ['Lo de la tele ha funcionado: me han escrito dos marcas esta mañana. ¿Escuchamos o seguimos a lo nuestro?', 'Desde que saliste en directo no paro de recibir llamadas. Una marca de zumos quiere una reunión.',
      'Estuviste muy natural en el plató. Tanto que ahora quieren que vuelvas, y con anuncio pagado.', 'La entrevista ha gustado. Hay una propuesta pequeña pero curiosa. ¿Te la cuento?',
      'Me ha llamado gente que hace un mes no sabía quién eras. La tele hace milagros.', 'Tu paso por la tele nos ha abierto una puerta. Pequeña, pero puerta.'],
    o: [op(['Escuchar a las marcas', 'Cuéntamelo', 'Vamos a ver'], { money: 0.2, fatigue: 3 }, 'Propuesta tras la tele'), op(['Ahora no', 'Primero el vóley', 'Más adelante'], { coach: 1 }, 'Primero el vóley')], c: CL.agent };
  T.cShoot = { k: 'fam', t: ['Hemos visto el anuncio', 'Ese disfraz', 'Tu anuncio'],
    x: ['La abuela ha visto el anuncio de {sponsor} cuatro veces seguidas. Dice que el disfraz te favorece.', 'Te hemos visto con el disfraz en la tele. Bueno, te hemos reconocido por la voz.',
      'El anuncio ya sale hasta en el bar de la esquina. El dueño dice que ahora te pone tapa gratis.', 'La prima ha grabado el anuncio y lo pone en bucle en las comidas. No hay escapatoria.',
      'En el barrio no se habla de otra cosa que del disfraz. Hay quien quiere uno igual para carnaval.', 'Vimos el anuncio. Nos hace sentir orgullo y nos morimos de risa. Las dos cosas.'] };
  T.cFans = { k: 'barrio', t: ['La peña te invita', 'Merienda en la peña', 'Te esperamos en la peña'],
    x: ['Desde la foto de la pancarta, la peña ha crecido. Queremos invitarte a la merienda del sábado. Habrá tortilla.',
      'La peña del barrio cumple años y nos falta alguien en la foto. ¿Te pasas un rato?', 'Hemos hecho otra pancarta, esta vez más favorecedora. ¿Vienes a verla en persona?',
      'La merienda de la peña es sagrada y este mes tienes el sitio de honor. No hace falta que traigas nada. Bueno, una camiseta.',
      'Los peques de la peña quieren enseñarte su grito de ánimo. Es largo y desafina, pero lo han ensayado mucho.', 'Si te pasas por la peña, prometemos no hacerte cantar. Casi seguro.'],
    o: [op(['Pasarte por la peña', 'Ir a la merienda', 'Allí estaré'], { fame: 0.02, fameMin: 10, fatigue: 3 }, 'Visita a la peña'), op(['Mandar un audio', 'Un saludo grabado', 'Videollamada'], { fam: 3 }, 'Audio para la peña')], c: CL.barrio };
  T.cClinic = { k: 'fam', t: ['Carta de la escuela', 'Un dibujo para ti', 'Te han escrito los peques'],
    x: ['Ha llegado una carta de la escuela del clínic. Dentro hay un dibujo tuyo rematando un balón del tamaño de un planeta.',
      'Los peques del clínic te han mandado un dibujo: sales con capa y la red parece una valla. Te lo guardamos.',
      'Un sobre lleno de purpurina: los peques del clínic te dan las gracias. En el dibujo tu cabeza asoma por encima de las gradas.',
      'La escuela del clínic dice que desde tu visita todo el patio juega al vóley. Hasta en el recreo de los mayores.',
      'Te han dibujado ganando una final contra un dragón. Ganas tú, por supuesto.', 'Llegó la carta del clínic. Firman veinte peques y alguien ha escrito «número uno del mundo» con unas faltas de ortografía preciosas.'],
    o: [op(['Colgarlo en la nevera', 'Guardarlo', 'Ponerlo en la taquilla'], { fam: 5 }, 'El dibujo del clínic'), op(['Contestar con una foto firmada', 'Mandar una foto', 'Escribirles'], { mood: 4 }, 'Contestaste al clínic')], c: CL.fam };
  T.cScout = { k: 'agent', t: ['El ojeador tomó notas', 'Noticias del ojeador', 'Te vieron jugar'],
    x: ['El ojeador estuvo en la grada y se fue con la libreta llena. No sé qué puso, pero escribió mucho.', 'Me dicen que el ojeador preguntó tu nombre dos veces. Buena señal.',
      'El ojeador se quedó hasta el final. Eso no lo hace con todo el mundo.', 'Han visto tu partido desde arriba. Ahora toca esperar y seguir igual.',
      'El ojeador me ha mandado un mensaje de dos palabras: «Seguimos hablando». Me vale.', 'La libreta del ojeador ya tiene una página con tu nombre. Literal.'] };
  T.cSpeech = { k: 'mate', only: 'hall', t: ['Gracias por la charla', 'Lo del vestuario', 'Esa charla'],
    x: ['Lo que dijiste en el vestuario se nota. La gente entrena con otra cara.', 'Desde tu charla, el vestuario está más unido. No sé qué hiciste, pero sigue.',
      'Tu discurso ya es leyenda en la plantilla. Hay quien lo repite antes de cada saque.', 'Alguien grabó tu charla con el móvil. La escuchamos en el autobús.'] };
  T.pEcoW = { k: 'agent', t: ['Lo dijo y lo cumplió', 'Me encanta', 'Prometido y hecho'],
    x: ['Me encanta cuando haces mi trabajo. Dijiste que ganabas y ganaste. Hoy negocio con la sonrisa puesta.', 'Lo dijo y lo cumplió: así abren las crónicas. No se me ocurre mejor titular.',
      'Fanfarronear y ganar: la combinación que más vende. Hoy me han llamado tres veces.', 'Lo de la rueda de prensa ha quedado de lujo. Ahora todo el mundo dice que tienes carácter.',
      'Con lo que dijiste y lo que hiciste, hoy eres tendencia en el barrio y alrededores.', 'Me río a carcajadas. Hablaste, ganaste y el titular se escribió solo.'] };
  T.pEcoL = { k: 'coach', t: ['A la prensa, lo justo', 'Sobre tus palabras', 'Lo de la rueda de prensa'],
    x: ['A la prensa, lo justo. Ya has visto lo que pasa cuando hablas antes de jugar.', 'Tus palabras se te han vuelto en contra. No pasa nada, pero que sirva.',
      'Las frases grandes pesan mucho cuando el marcador no acompaña. La próxima, más humildad delante del micrófono.', 'Hoy todos los titulares eran tuyos, y no por lo bueno. Aprende de esto.',
      'Se habla en la pista. Delante de la prensa, educación y poco más.', 'No te lo voy a repetir: menos frases y más bloqueos.'] };
  T.tagWin = { k: 'agent', t: ['Partido con sello', 'Así se ganan los grandes', 'Ese partido'],
    x: ['Ganar un partido así vale el doble. Hoy hasta mi contestador te felicita.', 'Los partidos señalados son los que se recuerdan. Y este lo has ganado tú.',
      'En los partidos con sello se ve quién está para cosas grandes. Hoy lo has dejado claro.', 'Ese partido lo vio todo el mundo. Y todo el mundo te vio ganar.',
      'Victoria con foco encima. Así se construye una carrera.', 'Me escriben para felicitarte. Les he dicho que estás en la ducha, que no molesten.'] };

  // ------------------------------------------------------------------ partido marcado próximo (prioridad 3)
  T.preDerby = { k: 'barrio', t: ['Se viene el derbi', 'Semana de derbi', 'Derbi a la vista'],
    x: ['Semana de derbi. La peña ha quedado el sábado para pintar la pancarta. ¿Te pasas o te concentras?', 'Derbi el próximo partido. En el barrio ya no se habla de otra cosa. ¿Nos vemos antes?',
      'Para el derbi hemos encargado bufandas nuevas. Si vienes a la quedada, te guardamos una.', 'El derbi es el derbi. La peña quiere verte antes para darte ánimos. Prometemos no tardar.',
      'Derbi a la vista. Hemos ensayado un cántico nuevo y queremos que lo escuches antes que nadie.', 'La ciudad entera está pendiente del derbi. ¿Te vemos en la quedada?'],
    o: [op(['Ir a la quedada', 'Pasarme un rato', 'Saludar a la peña'], { fame: 0.02, fameMin: 10, fatigue: 3 }, 'Quedada antes del derbi'), op(['Concentrarte', 'Pensar en el partido', 'Mejor descanso'], { coach: 2 }, 'Concentración para el derbi')], c: CL.barrio };
  T.preRev = { k: 'mate', t: ['Toca revancha', 'Nos deben una', 'La revancha'],
    x: ['Toca revancha. No he dormido bien desde la última vez. Esta vez no se nos escapan.', 'Nos deben una. Me acuerdo de cada punto del último partido contra ellos.',
      'Revancha a la vista. He visto el vídeo de la derrota tres veces. Ya sé dónde fallamos.', 'Esta semana se juega con memoria. La última vez se rieron demasiado.',
      'No es un partido más: es la revancha. Yo voy con todo.', 'La última vez nos ganaron. Esta vez, que lo intenten.'] };
  T.preTv = { k: 'agent', t: ['Partido televisado', 'Sales por la tele', 'Te van a ver'],
    x: ['El próximo partido lo retransmiten Radio Arena FM y la tele local. ¿Algo especial para la cámara?', 'Partido televisado. Mi consejo: mira a cámara solo cuando ganes el punto.',
      'Te van a ver miles de personas. ¿Corte de pelo nuevo o lo de siempre?', 'Hay tele en el próximo partido. Las marcas mirarán. Yo también.',
      'Esta semana sales en directo. Piensa en una celebración que quede bien en pantalla.', 'Partido con cámaras. Lo importante es jugar bien; lo segundo, salir bien en la foto.'],
    o: [op(['Corte de pelo nuevo', 'Ponerse a punto', 'Estreno de look'], { fame: 0.03, fameMin: 15, money: -0.05 }, 'Look para la tele'), op(['Lo de siempre', 'Sin cambios', 'Tal cual'], { coach: 1 }, 'Lo de siempre')], c: CL.agent };
  T.preFinal = { k: 'fam', t: ['Vamos todos', 'Para el partido grande', 'Allí estaremos'],
    x: ['Para el partido grande vamos todos. Hasta el tío que dice que no le gusta el vóley.', 'Ya tenemos las entradas. Llevaremos la bandera vieja, la de la suerte.',
      'Pase lo que pase, estamos orgullosos. Pero que pase lo bueno, ¿eh?', 'La abuela ha pedido el día libre en el centro de día para verte.',
      'Hemos hecho camisetas con tu número. Son horribles. Las llevaremos igual.', 'Te mandamos ánimos y un táper. Lo del táper no es negociable.'] };
  T.preBoss = { k: 'coach', only: 'beach', t: ['Se viene un jefe', 'El próximo rival', 'Partido serio'],
    x: ['El próximo rival es de los que dan miedo. Vídeo, descanso y cabeza fría.', 'Toca medirse a los mejores. Quiero verte con ganas, no con nervios.',
      'Este partido es una prueba. Si sales con miedo, perdemos antes de empezar.', 'Rival de los gordos. Me alegra: así veremos dónde estamos.',
      'Prepárate bien. Contra gente así, cada detalle cuenta.', 'Partido de los que hacen carrera. Juega el tuyo y ya está.'] };
  T.preDuel = { k: 'rival', t: ['Nos vemos pronto', 'Duelo a la vista', 'Un aviso'],
    x: ['Nos vemos en el próximo partido. Ve calentando, que yo ya he empezado.', 'Me han dicho que nos toca. He comprado palomitas para ver tu cara.',
      'Duelo a la vista. Te dejaré ganar algún punto, por educación.', 'Esta semana nos vemos. Prometo simpatía. En la red, no.',
      'Te escribo para avisarte: he entrenado el bloqueo pensando en ti.', 'Próximo partido: tú, yo y una red en medio. Qué romántico.'] };

  // ------------------------------------------------------------------ racha, bajón y llaves (prioridad 2)
  T.agStreak = { k: 'agent', t: ['Tres seguidas', 'La racha se nota', 'Me llaman'],
    x: ['Tres seguidas. Me llama gente que hace un mes no cogía el teléfono. ¿Subimos el caché o seguimos con calma?', 'Vas en racha y se nota: hoy he tenido cuatro llamadas antes del café. ¿Apretamos?',
      'Con esta racha puedo pedir más por todo. ¿Lo hacemos o esperamos a que se enfríen?', 'Las victorias seguidas abren puertas. Tú dime si las cruzamos ya o dejamos que esperen.',
      'Estás de moda y hay que decidir: o cobramos más ahora o dejamos que el precio suba solo.', 'Racha buena, teléfono caliente. ¿Qué hacemos con tu caché?',
      'Me han preguntado si haces bolos. Les he dicho que haces victorias. ¿Subimos el precio?', 'Ahora mismo eres de lo más buscado de tu liga. Toca decidir la estrategia.'],
    o: [op(['Que esperen', 'Con calma', 'Seguir así'], { ag: 5 }, 'Confías en el plan de Cris'), op(['Sube el caché', 'A por todas', 'Cobrar más'], { money: 0.3, fam: -3 }, 'Subiste el caché')], c: CL.agent };
  T.famBad = { k: 'fam', t: ['Te vimos ayer', 'No pasa nada', 'Desde casa'],
    x: ['Te vimos ayer por la tele. No pasa nada, el domingo hay paella. ¿Vienes?', 'Un mal día lo tiene cualquiera. Aquí te esperamos con croquetas.',
      'El abuelo dice que el arbitraje no vio nada. Nosotros solo queremos verte. ¿Comida el domingo?', 'Ayer no salió, pero te queremos igual. Más incluso, si cabe. ¿Te vienes a casa?',
      'Hemos visto el partido. Tranquilidad: el perro también falla cuando le tiramos la pelota.', 'No leas las redes. Ven a comer y hablamos de otra cosa.',
      'Mamá ha hecho tu plato favorito por si acaso. ¿Vienes o te lo guardamos?', 'Que sepas que en casa nadie ha cambiado de canal. ¿Comida familiar este finde?'],
    o: [op(['Voy', 'Allí estaré', 'Guardadme sitio'], { fam: 6, fatigue: 3 }, 'Comida con tu gente'), op(['Toca entrenar', 'Me quedo entrenando', 'Otro día'], { train: 15, fam: -4 }, 'Entrenar en vez de ir a casa')], c: CL.fam };
  T.coachBad = { k: 'coach', t: ['Mañana, vídeo', 'Así no', 'Tenemos trabajo'],
    x: ['Mañana a primera hora, sesión de vídeo. Tú y yo. Trae café.', 'Partido flojo. No me preocupa uno; me preocuparía el segundo. ¿Te quedas a corregirlo?',
      'Te noto fuera del partido. ¿Quieres hacer horas extra o prefieres despejarte?', 'Hoy no te he reconocido. Tengo un par de ejercicios para ti, si quieres.',
      'No voy a mentirte: así no. Pero sé que puedes más. ¿Cómo lo arreglamos?', 'Un tropiezo se arregla trabajando. O descansando. Elige.',
      'He apuntado cinco cosas del partido. Podemos verlas mañana o dejarlo reposar.', 'No te castigues. Pero tampoco lo olvides demasiado rápido. ¿Repasamos?'],
    o: [op(['Allí estaré', 'Vamos al vídeo', 'Horas extra'], { coach: 2, fatigue: 3 }, 'Vídeo tras el partido flojo'), op(['Necesito descansar', 'Despejarme', 'Un día libre'], { fatigue: -5, coach: -1 }, 'Descanso tras el partido flojo')], c: CL.coach };
  T.coachGood = { k: 'coach', t: ['Así sí', 'Buen partido', 'Eso es lo que quiero'],
    x: ['Así sí. Un {nota} no se ve todas las semanas. Disfrútalo hoy, mañana a trabajar.', 'Partidazo. Me alegra cuando lo que entrenamos sale en la pista.',
      'Con partidos así me lo pones fácil. Sigue por este camino.', 'Hoy has estado a otro nivel. No te lo creas mucho, pero sí un poco.',
      'Un {nota}. Esto es lo que te pido cada semana. Gracias.', 'Lo de hoy lo pongo en el vídeo de ejemplo para la cantera.'] };
  T.mateGood = { k: 'mate', t: ['Qué partido', 'Vaya nivel', 'Hoy sí'],
    x: ['Qué partido hemos hecho. Contigo así da gusto.', 'Hoy daba gusto jugar a tu lado. Lo repetimos el próximo, ¿vale?', 'Vaya nivel. Me has dejado sin excusas para no estar a la altura.',
      'Hoy hemos jugado de memoria. Esto es lo que quería.', 'Partidazo. Te invito al granizado de después.', 'Así me gusta: tú arriba y yo detrás recogiendo los aplausos.'],
    xh: ['Qué partido. El vestuario está encantado contigo.', 'Hoy daba gusto ponerte balones. Lo repetimos el próximo, ¿vale?', 'Vaya nivel. Has dejado al vestuario sin excusas.',
      'Hoy el equipo ha jugado de memoria. Y tú, de lujo.', 'Partidazo. La cena de los jueves la pagas tú, por estrella.', 'Así me gusta. Hoy has tirado del grupo.'] };
  T.lossRun = { k: 'mate', t: ['Esto hay que cortarlo', 'Mala racha', 'Hablemos'],
    x: ['Tres derrotas seguidas. Hay que cortarlo ya. ¿Entrenamos juntos o desconectamos un día?', 'Llevamos una racha fea. Te propongo dos cosas y elegimos una.',
      'No me gusta cómo estamos. ¿Horas extra o un día de playa sin balón?', 'Esto se arregla, pero no por arte de magia. ¿Qué hacemos?',
      'Perder tanto cansa más que jugar. Te leo: ¿trabajo o desconexión?', 'Necesitamos un cambio. Lo que tú digas, voy contigo.'],
    xh: ['Tres derrotas seguidas. Hay que cortarlo ya. ¿Entreno extra o desconectamos un día?', 'Llevamos una racha fea en el equipo. Te propongo dos cosas y elegimos una.',
      'El vestuario está de bajón. ¿Horas extra o un día sin balón?', 'Esto se arregla, pero entre todos. ¿Qué hacemos?',
      'Perder tanto cansa más que jugar. ¿Trabajo o desconexión?', 'Necesitamos un cambio. Lo que digas, el vestuario va contigo.'],
    o: [op(['Entrenar juntos', 'Horas extra', 'A trabajar'], { chem: 4, fatigue: 4 }, 'Entreno extra en la mala racha'), op(['Desconectar un día', 'Día libre', 'Despejarse'], { fatigue: -6, chem: -1 }, 'Desconexión en la mala racha')], c: CL.mate };
  T.benchRun = { k: 'mate', t: ['Tranquilidad', 'Tu momento llegará', 'Desde el banquillo'],
    x: ['Tranquilidad, tu momento llegará. Pero si quieres pedir minutos, yo te apoyo.', 'Una jornada mirando desde fuera ya escuece. Sé lo que es. ¿Hablas con el banquillo o esperas?',
      'Te veo con ganas en los entrenos. Eso se nota. ¿Pides minutos o aguantas?', 'El banquillo enseña mucho, pero también quema. Tú decides cómo lo llevas.',
      'No te vengas abajo. A veces hay que esperar; a veces hay que pedir. ¿Qué toca?', 'Estás para jugar. Si quieres, díselo. Si no, aprieta y que se note.'],
    xh: ['Tranquilidad, tu momento llegará. Pero si quieres pedir minutos, el vestuario te apoya.', 'Dos jornadas sin salir de inicio. Sé lo que es. ¿Hablas con el banquillo o esperas?',
      'Te veo con ganas en los entrenos. Eso se nota. ¿Pides minutos o aguantas?', 'El banquillo enseña mucho, pero también quema. {seat} no se va a apartar sin pelea.',
      'No te vengas abajo. A veces hay que esperar; a veces hay que pedir. ¿Qué toca?', 'Estás para jugar. Si quieres, díselo al banquillo. Si no, aprieta y que se note.'],
    o: [op(['Pedir minutos', 'Hablar con el banquillo', 'Reclamar el sitio'], { coach: -2, seat: 15 }, 'Pediste minutos'), op(['Esperar', 'Aguantar y entrenar', 'Paciencia'], { coach: 2 }, 'Esperaste tu momento')], c: CL.mate };
  T.startWon = { k: 'coach', only: 'hall', t: ['Te lo has ganado', 'De inicio', 'Sales de inicio'],
    x: ['Te lo has ganado: sales de inicio. Ahora toca no soltar el puesto.', 'Has vuelto al seis inicial. No es un regalo; es trabajo tuyo.',
      'De inicio otra vez. Me has convencido en los entrenos.', 'El puesto es tuyo mientras lo defiendas así.', 'Bienvenida de vuelta al seis. Así se hace.', 'Has peleado el sitio y lo tienes. Que se note cada punto.'] };
  T.sweep = { k: 'barrio', t: ['¡Qué paliza!', 'Sin despeinarse', 'Partido redondo'],
    x: ['¡Qué paliza! En la peña hemos tenido que pedir otra ronda de bocadillos para celebrarlo.', 'Ni un set para el rival. Eso es un mensaje para toda la liga.',
      'Partido redondo. En la carnicería dicen que ya sabían que ganabas fácil.', 'Sin despeinarse. Así da gusto ir a verte.',
      'En la peña hemos gritado tanto que hoy nadie tiene voz.', 'Victoria limpia. Hemos colgado tu foto junto a la de la boda del presidente.'] };
  T.comeback = { k: 'mate', t: ['¡Qué remontada!', 'Desde abajo', 'No nos rendimos'],
    x: ['¡Qué remontada! Perdiendo el primer set y míranos. Así se juega.', 'Cuando nos ganaron el primer set pensé que se nos iba. Tú no lo pensaste.',
      'Remontar es lo más bonito que hay. Gracias por no bajar los brazos.', 'Ese partido lo habíamos perdido en mi cabeza. En la tuya no.',
      'Desde abajo y a lo grande. Esta victoria vale doble.', 'Hoy he aprendido algo: contigo no hay partido perdido.'] };
  T.tightLoss = { k: 'mate', t: ['Por tan poco', 'Se escapó', 'Hasta el último set'],
    x: ['Se nos escapó por nada. ¿Revisamos el vídeo juntos o pasamos página?', 'Perder en el último set duele más. ¿Lo analizamos o lo olvidamos?',
      'Estuvimos ahí. Un par de puntos y era nuestro. ¿Qué hacemos con esto?', 'Partido de los que no dejan dormir. ¿Vídeo o desconexión?',
      'Por tan poco. Yo tengo dos jugadas atravesadas. ¿Y tú?', 'Duele, pero se aprende. Tú decides cómo.'],
    o: [op(['Revisar el vídeo juntos', 'Analizarlo', 'Vídeo'], { train: 10, chem: 2 }, 'Vídeo de la derrota ajustada'), op(['Pasar página', 'Olvidarlo', 'Mirar adelante'], { mood: 3 }, 'Pasaste página')], c: CL.mate };
  T.aceShow = { k: 'barrio', t: ['¡Qué saques!', 'Lluvia de aces', 'Desde la línea'],
    x: ['¡{n} aces! En la peña hemos decidido cantar uno cada vez que saques.', 'Desde la línea de saque eres un peligro. {n} aces hoy, nada menos.',
      'Con {n} aces nos has dado el partido. La peña te debe una cena.', 'Lo de tus saques ya no es normal. ¿Qué desayunas?',
      '{n} aces. El rival aún está buscando el balón.', 'Hoy sacabas y la grada se ponía de pie antes del golpe.'] };
  T.blockShow = { k: 'mate', t: ['Menudo muro', 'Bloqueos de cine', 'Ahí arriba'],
    x: ['{n} bloqueos punto. Hoy la red era tuya.', 'Menudo muro. El rival ya no sabía por dónde atacar.', 'Con {n} bloqueos así da gusto defender detrás.',
      'Hoy cada vez que subías al bloqueo se oía un «uy» en la grada.', 'Bloqueos de cine. Esto hay que repetirlo.', 'Ahí arriba no pasaba nada. {n} bloqueos, nada menos.'] };
  T.fatHigh = { k: 'physio', t: ['Vas con mucha carga', 'Ojo con la fatiga', 'Necesitas camilla'],
    x: ['Tus piernas me han escrito una carta de queja. ¿Sesión de fisio o aguantamos?', 'Llevas mucha carga encima. Te recomiendo camilla antes del próximo partido.',
      'Con esa fatiga te va a costar saltar. Tengo hueco mañana.', 'Te veo arrastrar los pies en el calentamiento. ¿Hacemos algo?',
      'El cuerpo avisa antes de romperse. Esto es un aviso.', 'Tengo una camilla libre y muchas ganas de usarla contigo.'],
    o: [op(['Sesión de fisio', 'A la camilla', 'Recuperar'], { fatigue: -12, money: -0.1 }, 'Sesión de fisio'), op(['Aguantar', 'Puedo con ello', 'Más adelante'], { coach: 1 }, 'Aguantaste la carga')], c: CL.physio };
  T.duelWin = { k: 'rival', t: ['Hoy has ganado tú', 'Esta te la doy', 'Felicidades, supongo'],
    x: ['Hoy has ganado tú. Disfrútalo, que no se va a repetir.', 'Felicidades, supongo. Me ha costado escribir esto.', 'Vale, esta te la doy. La próxima no.',
      'Buen partido. No le cuentes a nadie que te lo he dicho.', 'He perdido el duelo y la apuesta con mi pareja. Doble derrota.', 'Ganaste. Ya he apuntado tu nombre en la pizarra de pendientes.'] };
  T.duelLoss = { k: 'rival', t: ['Duelo para mí', '¿Revancha?', 'Gané yo'],
    x: ['Duelo para mí. Ha estado bien, pero no lo suficiente. ¿Revancha?', 'Gané yo. Si quieres te mando el vídeo para que estudies.',
      'Gracias por el partido. Bueno, por la victoria. ¿Te apetece revancha?', 'Me lo he pasado genial. Seguro que tú también, en el fondo.',
      'Duelo cerrado. Te he guardado un bocadillo de consolación.', 'No te enfades. Bueno, enfádate un poco, que me motiva.'],
    o: [op(['Felicitarle', 'Darle la mano', 'Reconocerlo'], { heat: -10, coach: 1 }, 'Felicitaste a tu rival'), op(['Pedir revancha', 'La próxima es mía', 'Retarle'], { heat: 10, fame: 0.02, fameMin: 10 }, 'Pediste revancha')], c: CL.rival };
  T.arch = { k: 'rumor', t: ['Ya es oficial: archienemigo', 'Rivalidad del año', 'Pique histórico'],
    x: ['Lo vuestro con {rp} ya no es un pique: es una rivalidad. En las redes ya os llaman archienemigos.', 'La rivalidad con {rp} es el tema favorito de la liga. Archienemigo oficial.',
      'Nadie se pierde un partido tuyo contra {rp}. Ya hay camisetas de los dos bandos.', 'Archienemigo desbloqueado: {rp}. Cada duelo valdrá el doble.',
      'Tu pique con {rp} tiene ya hasta pódcast propio. Bueno, un episodio.', 'Se confirma: {rp} y tú sois la rivalidad de la temporada.'] };
  T.agGig = { k: 'agent', t: ['Te he conseguido un acto', 'Un bolo pagado', 'Propuesta jugosa'],
    x: ['Te he conseguido un acto pagado: inaugurar una tienda de deportes. Dos horas, sonrisa y fotos. ¿Vas?', 'Una empresa de toallas quiere que des el saque de honor en su torneo. Pagan bien. ¿Vamos?',
      'Gala benéfica con cena incluida y un sobre al final. ¿Te apuntas?', 'Te quieren en la presentación de un gimnasio nuevo. Hay que levantar una pesa y sonreír.',
      'Sale un bolo: firma de autógrafos en un centro comercial. Café gratis incluido.', 'Una marca de cereales busca deportistas para un desayuno con la prensa. ¿Te interesa?'],
    o: [op(['Voy', 'Me apunto', 'Cuenta conmigo'], { money: 0.4, fatigue: 5 }, 'Acto pagado'), op(['Paso', 'Esta vez no', 'Prefiero entrenar'], { coach: 1, ag: -3 }, 'Rechazaste el acto')], c: CL.agent };
  T.famCall = { k: 'fam', t: ['Llama a casa', 'Te echamos de menos', '¿Sigues por ahí?'],
    x: ['Hace mucho que no llamas. No pasa nada, pero te echamos de menos.', 'La abuela pregunta por ti cada día. Una llamadita y la haces feliz.',
      'Sabemos que estás a tope, pero cinco minutos al teléfono no hacen daño.', 'Por aquí todo bien. Bueno, menos que no llamas.',
      'El perro te busca por la casa. Eso es todo.', 'Te hemos guardado el trozo de tarta del cumple. Ya está duro, pero es tuyo.'],
    o: [op(['Llamar ahora', 'Videollamada', 'Llamar a casa'], { fam: 10 }, 'Llamaste a casa'), op(['Otro día', 'Ahora no puedo', 'Más tarde'], { fam: -3, train: 10 }, 'Te quedaste entrenando')], c: CL.fam };
  T.contract = { k: 'agent', t: ['Último año de contrato', 'Hablemos de futuro', 'Tu contrato'],
    x: ['Te queda poco contrato. Antes de que llamen otros, necesito saber qué quieres.', 'Último año. El club no ha dicho nada aún. ¿Les apretamos o escuchamos fuera?',
      'Tu contrato se acaba y el mercado se mueve. Dime hacia dónde empujo.', 'A estas alturas ya hay que pensar en el año que viene. ¿Te ves aquí?',
      'Me preguntan por ti. Antes de contestar, quiero tu opinión.', 'Último año de contrato: el momento en el que mi trabajo se vuelve interesante.'],
    o: [op(['Quiero quedarme', 'Me veo aquí', 'Seguir en el club'], { coach: 2, ag: 2 }, 'Quieres quedarte'), op(['Escucha ofertas', 'Mira fuera', 'Abre la puerta'], { ag: 5, coach: -2 }, 'Pediste escuchar ofertas')], c: CL.agent };

  // ------------------------------------------------------------------ relleno (prioridad 1)
  T.agCheck = { k: 'agent', t: ['¿Cómo vas?', 'Llamada rápida', 'Un minuto'],
    x: ['¿Cómo vas? Me preguntan por ti y quiero saber qué decir.', 'Llamada rápida: ¿todo en orden? Tengo un par de cosas en el horno.',
      'Solo quería saber cómo te encuentras. Y, de paso, si te apetece algo más.', 'Me han preguntado si estás a gusto en el club. ¿Qué les digo?',
      'Reviso tu agenda y me sobra tiempo libre. ¿Busco algo o lo dejamos así?', 'Te escribo entre reunión y reunión. ¿Seguimos el plan o lo cambiamos?'],
    o: [op(['Todo bien, gracias', 'Seguimos así', 'Bien, sin cambios'], { ag: 4 }, 'Charla con Cris'), op(['Búscame algo mejor', 'Mueve hilos', 'Quiero más'], { ag: 2, coach: -2 }, 'Pediste moverte')], c: CL.agent };
  T.famPhoto = { k: 'fam', t: ['Foto de casa', 'Mira esto', 'Desde casa'],
    x: ['Te mandamos una foto del perro con tu camiseta. Le queda grande, pero la lleva con orgullo.', 'La abuela ha recortado tu foto del periódico y la ha pegado en la nevera.',
      'El primo ha empezado a jugar al vóley. Dice que de mayor quiere jugar como tú.', 'Hemos visto el partido en el bar del pueblo. Han subido el volumen solo por ti.',
      'Foto de la comida del domingo: tu silla vacía y un plato servido, por si llegabas.', 'Mamá ha aprendido a buscar tus partidos en el móvil. Ahora no hay quien la pare.'] };
  T.famVisit = { k: 'fam', t: ['¿Vamos a verte?', 'Queremos ir', 'Visita familiar'],
    x: ['¿Te parece si vamos a verte al próximo partido? Prometemos no gritar mucho.', 'Estamos pensando en ir a verte. ¿Te viene bien o te pondremos de los nervios?',
      'La tía tiene coche nuevo y quiere estrenarlo yendo a tu partido. ¿Te vemos?', 'Si vamos a verte, ¿nos dejas sentarnos donde se te vea bien?',
      'Queremos hacer una excursión para verte jugar. ¿Te viene bien este o el siguiente?', 'Hemos encontrado entradas. Solo falta tu permiso para ir con pancarta.'],
    o: [op(['Que vengan', 'Os espero', 'Al próximo'], { fam: 5, mood: 2 }, 'Visita de tu gente'), op(['Mejor otro día', 'El mes que viene', 'Más adelante'], { fam: -2, coach: 1 }, 'Visita aplazada')], c: CL.fam };
  T.barrioShirt = { k: 'barrio', t: ['Camisetas para la peña', 'Un favor', 'De parte de la peña'],
    x: ['La peña del barrio quiere hacer un sorteo. ¿Nos firmas unas camisetas?', 'Para la rifa de fiestas nos vendría genial algo tuyo firmado. ¿Se puede?',
      'Hay un chaval en la peña que no se pierde un partido. Si le firmas algo, lo haces feliz.', 'Estamos recaudando para el autobús de la peña. ¿Nos echas una mano?',
      'Queremos subastar un balón firmado para el equipo infantil del barrio.', 'Un detalle para la peña: con una foto firmada nos conformamos. O con tres.'],
    o: [op(['Firmar camisetas', 'Firmar lo que haga falta', 'Mandar material'], { fame: 0.02, fameMin: 10, fatigue: 2 }, 'Firmaste para la peña'), op(['Mandar una foto', 'Un saludo', 'Foto firmada'], { fam: 2 }, 'Foto para la peña')], c: CL.barrio };
  T.spPost = { k: 'sponsor', t: ['Una publicación', 'Campaña de esta semana', 'Te necesitamos'],
    x: ['Esta semana lanzamos campaña. ¿Publicarías una foto con el producto?', 'Necesitamos una foto tuya sonriendo con nuestra botella. Solo una. Bueno, dos.',
      'Tenemos un vídeo de diez segundos preparado para ti. Cero esfuerzo, mucha visibilidad.', 'Queremos que estrenes nuestro nuevo modelo en redes. Pagamos el detalle.',
      'Una foto con la etiqueta de la marca y listo. ¿Te parece?', 'Campaña rápida: tú, nuestro producto y tu mejor cara de deportista.'],
    o: [op(['Publicar la foto', 'Hecho', 'Subirla'], { money: 0.15 }, 'Publicación pagada'), op(['No me pega', 'Esta no', 'Paso'], { fam: 2 }, 'Rechazaste la publicación')], c: CL.sponsor };
  T.mateDinner = { k: 'mate', t: ['¿Cena?', 'Plan para hoy', 'Te invito'],
    x: ['¿Cenamos esta noche? Conozco un sitio de bocadillos que te va a cambiar la vida.', 'Plan: cena tranquila y hablamos de cualquier cosa menos de vóley.',
      'Hace tiempo que no salimos. ¿Unas pizzas?', 'Me han regalado una paella para dos. ¿Te apuntas?', 'Hoy necesito hablar de algo que no sea el partido. ¿Cenamos?', 'Te debo una cena desde hace semanas. ¿Hoy?'],
    xh: ['¿Cena de equipo esta noche? Conozco un sitio de bocadillos que te va a cambiar la vida.', 'Plan: cena del vestuario y prohibido hablar de vóley.',
      'Hace tiempo que no salimos con el grupo. ¿Unas pizzas?', 'Hoy hay cena en casa del líbero. ¿Te apuntas?', 'El vestuario necesita desconectar. ¿Cenamos todos?', 'Te debemos una cena desde hace semanas. ¿Hoy?'],
    o: [op(['Vamos', 'Me apunto', 'Hecho'], { chem: 4, money: -0.05 }, 'Cena juntos'), op(['Hoy no', 'Necesito dormir', 'Otro día'], { fatigue: -4 }, 'Noche de descanso')], c: CL.mate };
  T.coachTip = { k: 'coach', t: ['Un detalle', 'Para el próximo', 'Apunta esto'],
    x: ['Un detalle para el próximo partido: después de recepción, mira antes de atacar. Te ahorrará bloqueos.', 'Te veo bien. Solo una cosa: el primer paso de bloqueo, más rápido.',
      'Para el próximo, cuida el saque. No hace falta arriesgar en cada uno.', 'Apunta: cuando el partido se ponga feo, balón alto y paciencia.',
      'He visto que te cuesta la diagonal corta. La trabajamos esta semana.', 'Una cosa que me gusta de ti: no te escondes. Sigue así.'] };
  T.rumor = { k: 'rumor', t: ['Se dice por ahí', 'Rumor del día', 'Dicen que'],
    x: ['Se dice que hay un club de arriba siguiendo de cerca a {yo}. Nosotros solo lo dejamos caer.', 'Dicen que {yo} come lo mismo antes de cada partido desde hace tres años. Confirmaremos.',
      'Rumor del día: {yo} tiene una lista de canciones para calentar que no conoce nadie.', 'Hay quien asegura que {yo} se pone primero la zapatilla izquierda. Siempre.',
      'Nos llega que en {club} están muy a gusto con {yo}. Lo normal, vaya.', 'Fuentes de toda confianza (un primo) dicen que {yo} odia perder al parchís.'] };
  T.hater = { k: 'hater', t: ['Te han mencionado', '@NoMeConvence ha hablado', 'Mención en redes'],
    x: ['«{yo} ha jugado bien, vale. Pero yo también juego bien al futbolín y nadie me hace un reportaje.»', '«Que alguien me explique por qué {yo} celebra los puntos como si fueran finales. Me cae bien igual, eh.»',
      '«Reconozco que {yo} remata fuerte. No reconozco nada más. De momento.»', '«Opinión impopular: {yo} saca bien. Ya está, ya lo he dicho, no me lo recordéis.»',
      '«Hoy {yo} no me ha convencido. Ayer tampoco. Mañana igual sí. No prometo nada.»', '«{yo} tiene muchos fans. Yo llevo la contraria. Alguien tiene que hacerlo.»',
      '«Voy a ver el próximo partido de {yo} solo para criticarlo. Bueno, y porque me gusta el vóley.»', '«Lo de {yo} es suerte. Mucha suerte. Sospechosamente mucha suerte, partido tras partido.»'] };
  T.podcast = { k: 'press', t: ['Invitación al pódcast', 'La Pausa Técnica', 'Hablemos un rato'],
    x: ['En La Pausa Técnica nos encantaría tenerte de invitado. Una hora, risas y algo de táctica.', 'Queremos grabar un episodio contigo. Prometemos no preguntarte por el arbitraje.',
      'Hay hueco en el próximo programa. Nuestros oyentes llevan semanas pidiéndote.', 'Un episodio especial sobre tu temporada. ¿Te animas?',
      'Te invitamos al pódcast. Hay galletas en el estudio.', 'Grabamos el jueves. Si vienes, prometemos editar tus silencios largos.'],
    o: [op(['Ir al pódcast', 'Me apunto', 'Grabamos'], { fame: 0.04, fameMin: 20, fatigue: 3 }, 'Invitado en el pódcast'), op(['Paso', 'Otro día', 'Prefiero entrenar'], { coach: 1 }, 'Rechazaste el pódcast')], c: CL.press };
  T.radio = { k: 'press', t: ['Llamada de la radio', 'Radio Arena FM', 'En antena'],
    x: ['Radio Arena FM te llama en directo para una pregunta rápida sobre la jornada.', 'Estamos en antena y queremos tu voz. Treinta segundos, ¿te va?',
      'Una pregunta para la radio: ¿cómo ves al equipo? Sales en directo ahora mismo.', 'Te ponemos en antena con los oyentes. Solo un saludo y una frase.',
      'Radio Arena FM quiere abrir el programa contigo. ¿Te animas?', 'Llamada rápida de la radio. Te prometemos que no dura más que un tiempo muerto.'],
    o: [op(['Atender la llamada', 'Hablar en directo', 'Saludar'], { fame: 0.02, fameMin: 10 }, 'Hablaste en la radio'), op(['Colgar con educación', 'Ahora no', 'Otro día'], { mood: 2 }, 'Colgaste a la radio')], c: CL.press };
  T.kidLetter = { k: 'fan', t: ['Carta de una peque fan', 'Te han escrito', 'Correo de la afición'],
    x: ['«Hola, soy de tu equipo desde siempre (desde el martes). De mayor quiero jugar como tú, pero saltando todavía más.»', '«Me he hecho una camiseta con tu número y un rotulador. Se ha borrado un poco al lavarla.»',
      '«Mi profe dice que el vóley no es para mí. Le he dicho que tú también empezaste en algún sitio.»', '«Te he dibujado. Sales con alas porque saltas mucho.»',
      '«¿Cómo se hace un saque así? Llevo dos semanas practicando contra la puerta del garaje.»', '«Gracias por chocarme la mano en el último partido. No me la lavo hasta el domingo.»'] };
  T.diario = { k: 'press', t: ['Crónica de la jornada', 'Te nombran en la crónica', 'Hoy sales en el periódico'],
    x: ['Diario La Red te dedica medio párrafo: «{yo} sigue creciendo en {club}». Medio párrafo es mucho.', 'El Bloqueo Digital cuenta que {yo} es de lo más regular de su equipo esta temporada.',
      'La crónica del partido contra {rival} destaca tu trabajo en defensa. Por fin alguien lo ve.', 'En Diario La Red hablan de tu evolución. Han usado la palabra «prometedor» dos veces.',
      'El Bloqueo Digital te pone en su lista de nombres a seguir. Ahora todo el mundo te seguirá.', 'Tu foto sale en la página de deportes, junto a un anuncio de sofás.'] };

  // ------------------------------------------------------------------ temporada y fichaje (informativos, fuera del tope)
  T.welcome = { k: 'mate', t: ['Bienvenida', 'Ya eres de la casa', 'Hola, fichaje'],
    x: ['Bienvenida a {club}. Aquí se trabaja mucho y se ríe más. Ya te iré contando.', 'Ya eres de {club}. Primera norma: quien llega tarde paga los cafés.',
      'Hola y bienvenida. En {club} somos una familia: rara, pero familia.', 'Te esperábamos. Tengo ganas de ver qué hacemos juntos.', 'Bienvenida a {ciudad}. Te paso los mejores sitios para comer.', 'Nuevo club, nueva vida. Aquí te ayudamos con todo.'],
    th: ['Bienvenida al vestuario', 'Ya eres de la casa', 'Hola, fichaje'] };
  T.seasonNew = { k: 'agent', t: ['Temporada nueva', 'Arrancamos', 'Otra temporada'],
    x: ['Temporada nueva, hoja en blanco. Este año vamos a por más.', 'Arrancamos. Te he preparado una lista de objetivos. Es corta: ganar.',
      'Otra temporada. Respira, disfruta y déjame a mí el resto.', 'Empieza la temporada {season}. Tengo buenas sensaciones.', 'Primera semana del curso. Que no se te olvide estirar.', 'Ya está aquí la temporada. Te escribo cuando haya algo jugoso.'] };
  T.seasonEnd = { k: 'coach', t: ['Fin de temporada', 'Se acabó', 'Balance'],
    x: ['Se acabó la temporada. Descansa, que el verano pasa volando.', 'Fin de curso. Hemos aprendido mucho. Ahora toca desconectar un poco.',
      'Balance rápido: hay cosas que repetir y otras que olvidar. Lo hablamos en pretemporada.', 'Temporada cerrada. Gracias por el esfuerzo de cada semana.',
      'Ya está. Recarga pilas y vuelve con hambre.', 'Último mensaje de la temporada: cuida el cuerpo este verano. Y come algo de verdura.'] };

  // ------------------------------------------------------------------ prensa: 16 preguntas (r: 'w' tras victoria, 'l' tras derrota, 'a' siempre)
  var PRESS = [
    ['a', '{m}: «¿Qué le falta a {club} para dar el salto?»'], ['a', '{m}: «¿Cómo te sientes en la pista ahora mismo?»'],
    ['a', '{m}: «Se habla mucho de tu futuro. ¿Te ves aquí la próxima temporada?»'], ['a', '{m}: «¿Qué le dirías a quien dice que no estás a la altura?»'],
    ['a', '{m}: «¿Cuál es el mejor rival al que te has enfrentado este año?»'], ['a', '{m}: «¿Qué tal la relación con el cuerpo técnico?»'],
    ['w', '{m}: «Gran victoria contra {rival}. ¿Cuál ha sido la clave?»'], ['w', '{m}: «¿Es este el mejor momento de tu carrera?»'],
    ['w', '{m}: «¿Hasta dónde puede llegar {club} este año?»'], ['w', '{m}: «¿Te ves como líder del equipo?»'],
    ['w', '{m}: «Dicen que {rival} os subestimó. ¿Estás de acuerdo?»'], ['l', '{m}: «¿Qué ha fallado hoy contra {rival}?»'],
    ['l', '{m}: «¿Preocupa la situación del equipo?»'], ['l', '{m}: «¿Asumes parte de la culpa de la derrota?»'],
    ['l', '{m}: «¿Cómo se levanta un equipo después de un partido así?»'], ['l', '{m}: «¿Ha sido mejor el rival o habéis estado peor?»']
  ];
  // las 3 respuestas (mismos efectos siempre), con frases que encajan con la pregunta: tras victoria, tras derrota o neutras
  var PRESS_E = [[{ chem: 5, star: 1 }, 'Respuesta de equipo en prensa'], [{ coach: 3, star: 1 }, 'Respuesta humilde en prensa'],
    [{ fame: 0.04, fameMin: 20, coach: -4, heat: 20, star: 1 }, 'Chulería en prensa']];
  var PRESS_TX = {
    w: [['De equipo: «Esto lo saca el grupo»', 'De equipo: «Mérito de todo el vestuario»', 'De equipo: «Sin el grupo no soy nada»', 'De equipo: «Hoy ha ganado el equipo»'],
      ['Humilde: «Queda mucho por mejorar»', 'Humilde: «Partido a partido»', 'Humilde: «Ni euforia ni nada: a seguir»', 'Humilde: «Hay que seguir trabajando»'],
      ['Chulería: «¿Alguien lo dudaba?»', 'Chulería: «El siguiente también es mío»', 'Chulería: «Que se vayan acostumbrando»', 'Chulería: «Yo no fallo cuando importa»']],
    l: [['De equipo: «Ganamos y perdemos juntos»', 'De equipo: «Esto se arregla en grupo»', 'De equipo: «Aquí no se esconde nadie»', 'De equipo: «La reacción saldrá del vestuario»'],
      ['Humilde: «Hoy he aprendido mucho»', 'Humilde: «Tengo que dar más»', 'Humilde: «Toca mirarse al espejo»', 'Humilde: «Hay que seguir trabajando»'],
      ['Chulería: «Un mal día y ya habláis»', 'Chulería: «La próxima la pagan ellos»', 'Chulería: «Hoy ha ganado la suerte»', 'Chulería: «Que no se acostumbren»']],
    a: [['De equipo: «Esto lo saca el grupo»', 'De equipo: «Sin el grupo no soy nada»', 'De equipo: «Todo lo hacemos juntos»', 'De equipo: «Ganamos y perdemos juntos»'],
      ['Humilde: «Partido a partido»', 'Humilde: «Queda mucho por mejorar»', 'Humilde: «Cada día aprendo algo»', 'Humilde: «Hay que seguir trabajando»'],
      ['Chulería: «Que hablen; yo juego»', 'Chulería: «Mi mejor versión está por llegar»', 'Chulería: «Que se vayan acostumbrando»', 'Chulería: «Yo no fallo cuando importa»']]
  };
  function pressO(r) { var L = PRESS_TX[r] || PRESS_TX.a; return PRESS_E.map(function (x, i) { return op(L[i], x[0], x[1]); }); }
  var PRESS_T = ['Rueda de prensa', 'Micrófonos delante', 'Sala de prensa', 'Atención a los medios'];
  PRESS.forEach(function (q, i) { T['pq' + i] = { k: 'press', press: 1, r: q[0], t: PRESS_T, x: q[1], o: pressO(q[0]), c: CL.press }; });

  // ================================================================== BEATS (cuándo sale cada plantilla)
  // X = lo que se calcula una vez por jornada (ver onMatch); s = c.story. Los when() son puros.
  function chainAt(s, k, X, a, b) { var h = s.chn[k]; if (!h) return null; var d = X.mN - h.mN; return d >= a && d <= b ? h : null; }
  var BEATS = [
    // eco y cadenas (4)
    { id: 'cParty', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'party', X, 2, 4); return !!(h && h.i === 0); } },
    { id: 'cAnkle', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'ankle', X, 1, 3); return !!(h && h.i >= 1 && (c.fatigue | 0) >= 60); } },
    { id: 'cViral', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'viral', X, 1, 2); return !!(h && h.i === 0 && X.rp); } },
    { id: 'cPressWin', pri: 4, when: function (c, sum, X, s) { return !!chainAt(s, 'pressWin', X, 1, 2); }, v: function (c, sum, X, s) { var h = s.chn.pressWin; return { rival: h && h.rv || X.rival }; } },
    { id: 'cRef', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'pressLoss', X, 1, 2); return !!(h && h.i === 1); } },
    { id: 'cRivalTalk', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'rivalTalk', X, 1, 3); return !!(h && h.i <= 1 && X.rp); } },
    { id: 'cMateOk', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'mateDown', X, 2, 3); return !!(h && h.i <= 1); } },
    { id: 'cMateCold', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'mateDown', X, 1, 3); return !!(h && h.i === 2); } },
    { id: 'cTv', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'tv', X, 1, 2); return !!(h && h.i === 0); } },
    { id: 'cShoot', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'sponsorShoot', X, 1, 2); return !!(h && h.i === 0); } },
    { id: 'cFans', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'fans', X, 2, 4); return !!(h && h.i === 0); } },
    { id: 'cScout', pri: 4, when: function (c, sum, X, s) { var h = chainAt(s, 'scout', X, 1, 3); return !!(h && h.i === 0 && X.real); } },
    { id: 'cSpeech', pri: 4, only: 'hall', when: function (c, sum, X, s) { var h = chainAt(s, 'speech', X, 1, 2); return !!(h && h.i === 0); } },
    { id: 'tagWin', pri: 4, when: function (c, sum, X) { return !!(X.tagPlayed && X.played && sum.win); } },
    // partido marcado próximo (3)
    { id: 'preDerby', pri: 3, when: function (c, sum, X) { return X.tagNext === 'derbi'; } },
    { id: 'preRev', pri: 3, when: function (c, sum, X) { return X.tagNext === 'revancha'; } },
    { id: 'preTv', pri: 3, when: function (c, sum, X) { return X.tagNext === 'tv'; } },
    { id: 'preFinal', pri: 3, when: function (c, sum, X) { return X.tagNext === 'final'; } },
    { id: 'preBoss', pri: 3, only: 'beach', when: function (c, sum, X) { return X.tagNext === 'jefe'; } },
    { id: 'preDuel', pri: 3, when: function (c, sum, X) { return X.tagNext === 'duelo' && !!X.rp; } },
    // racha, bajón y llaves (2)
    { id: 'agStreak', pri: 2, when: function (c, sum, X) { return X.played && !!sum.win && X.streak >= 3; } },
    { id: 'famBad', pri: 2, when: function (c, sum, X) { return X.real && sum.nota < 5; } },
    { id: 'coachBad', pri: 2, when: function (c, sum, X) { return X.real && sum.nota < 5.5 && !X.end; } },   // (con la temporada cerrada, «mañana vídeo» no pega)
    { id: 'coachGood', pri: 2, when: function (c, sum, X) { return X.real && sum.nota >= 8; } },
    { id: 'mateGood', pri: 2, when: function (c, sum, X) { return X.real && !!sum.win && sum.nota >= 7.5; } },
    { id: 'lossRun', pri: 2, when: function (c, sum, X, s) { return X.played && !sum.win && s.lossRun >= 3; } },
    { id: 'benchRun', pri: 2, when: function (c, sum, X, s) { return s.benchRun >= (X.H ? 2 : 1) && !X.end; } },
    { id: 'startWon', pri: 2, only: 'hall', when: function (c, sum, X) { return X.startAfterBench; } },
    { id: 'sweep', pri: 2, when: function (c, sum, X) { return X.real && !!sum.win && !!sum.sets && sum.sets[1] === 0; } },
    { id: 'comeback', pri: 2, when: function (c, sum, X) { var a = sum.setScores && sum.setScores[0]; return X.real && !!sum.win && !!a && a[0] < a[1]; } },
    { id: 'tightLoss', pri: 2, when: function (c, sum, X) { return X.real && !sum.win && !!sum.sets && sum.sets[0] >= (X.H ? 2 : 1); } },
    { id: 'aceShow', pri: 2, when: function (c, sum, X) { return X.real && !!sum.me && (sum.me.aces | 0) >= 3; } },
    { id: 'blockShow', pri: 2, when: function (c, sum, X) { return X.real && !!sum.me && (sum.me.blocks | 0) >= 3; } },
    { id: 'fatHigh', pri: 2, when: function (c) { return (c.fatigue | 0) >= 70; } },
    { id: 'duelWin', pri: 2, when: function (c, sum, X) { return !!(X.duel && X.duel.win && X.rp); } },
    { id: 'duelLoss', pri: 2, when: function (c, sum, X) { return !!(X.duel && !X.duel.win && X.rp); } },
    { id: 'arch', pri: 2, when: function (c, sum, X, s) { return s.rel.heat >= 80 && !s.rel.arch && !!X.rp; } },
    { id: 'agGig', pri: 2, when: function (c, sum, X, s) { return s.rel.ag >= 70; } },
    { id: 'famCall', pri: 2, when: function (c, sum, X, s) { return s.rel.fam <= 30; } },
    { id: 'contract', pri: 2, when: function (c, sum, X) { return !!(c.contract && (c.contract.left | 0) <= 1 && X.kind === 'league' && X.week >= 9); } },
    // quejas del vestuario (2, con tirada 'st-q' por queja: no salen todas las jornadas)
    { id: 'qMinutes', pri: 2, only: 'hall', when: function (c, sum, X) { return X.played && !!peerOf(c, X, 'bench') && qRoll(c, X, 'min') < 0.35; }, v: function (c, sum, X) { return { who: peerOf(c, X, 'bench') }; } },
    { id: 'qMate', pri: 2, when: function (c, sum, X) { return X.real && (X.H ? !!peerOf(c, X, 'x') : !sum.win) && qRoll(c, X, 'mate') < (X.H ? 0.25 : 0.3); }, v: function (c, sum, X) { return { who: peerOf(c, X, 'any'), otro: X.H ? peerOf(c, X, 'x') : '' }; } },
    { id: 'qTrain', pri: 2, when: function (c, sum, X) { return !X.end && qRoll(c, X, 'train') < ((c.fatigue | 0) >= 50 ? 0.4 : 0.15); }, v: function (c, sum, X) { return { who: peerOf(c, X, 'any') }; } },
    { id: 'qMatch', pri: 2, when: function (c, sum, X) { return X.real && !sum.win && qRoll(c, X, 'match') < 0.4; }, v: function (c, sum, X) { return { who: peerOf(c, X, 'any') }; } },
    { id: 'qRef', pri: 2, when: function (c, sum, X) { return X.played && !sum.win && !!sum.sets && sum.sets[0] >= 1 && qRoll(c, X, 'ref') < 0.45; }, v: function (c, sum, X) { return { who: peerOf(c, X, 'any') }; } },
    { id: 'qPlan', pri: 2, only: 'hall', when: function (c, sum, X) { return X.played && !sum.win && qRoll(c, X, 'plan') < 0.25; }, v: function (c, sum, X) { return { who: peerOf(c, X, 'any') }; } },
    { id: 'qTravel', pri: 1, when: function (c, sum, X) { return X.played; }, v: function (c, sum, X) { return { who: peerOf(c, X, 'any') }; } },
    // relleno (1): con tirada y como mucho uno por jornada
    { id: 'agCheck', pri: 1, when: function () { return true; } },
    { id: 'famPhoto', pri: 1, when: function () { return true; } },
    { id: 'famVisit', pri: 1, when: function () { return true; } },
    { id: 'barrioShirt', pri: 1, when: function (c, sum, X) { return X.tier >= 1; } },
    { id: 'spPost', pri: 1, when: function (c) { return !!(c.life && c.life.sponsor); } },
    { id: 'mateDinner', pri: 1, when: function () { return true; } },
    { id: 'coachTip', pri: 1, when: function (c, sum, X) { return !X.end; } },
    { id: 'rumor', pri: 1, when: function (c, sum, X) { return X.tier >= 1; } },
    { id: 'hater', pri: 1, when: function (c, sum, X) { return X.real && X.tier >= 1; } },
    { id: 'podcast', pri: 1, when: function (c, sum, X) { return X.tier >= 1; }, v: function () { return { m: S.MEDIA.pod }; } },
    { id: 'radio', pri: 1, when: function () { return true; }, v: function () { return { m: S.MEDIA.radio }; } },
    { id: 'kidLetter', pri: 1, when: function () { return true; } },
    { id: 'diario', pri: 1, when: function (c, sum, X) { return X.played; } }
  ];
  // segundo eslabón de cada cadena (beat → clave del EVENTS de career-life)
  var CH_OF = { cParty: 'party', cAnkle: 'ankle', cViral: 'viral', cPressWin: 'pressWin', cRef: 'pressLoss', cRivalTalk: 'rivalTalk', cMateOk: 'mateDown', cMateCold: 'mateDown', cTv: 'tv', cShoot: 'sponsorShoot', cFans: 'fans', cScout: 'scout', cSpeech: 'speech' };

  // ================================================================== estado
  function ensureS(s) {
    if (!obj(s.seenB)) s.seenB = {};
    for (var k in s.seenB) if (!num(s.seenB[k])) delete s.seenB[k];
    if (!Array.isArray(s.pressQ)) s.pressQ = [];
    s.pressQ = s.pressQ.filter(function (x) { return num(x) && x >= 0 && x < PRESS.length; }).slice(-PRESSQ_MAX);
    if (!num(s.pressNext)) s.pressNext = -1;
    if (!num(s.pressLast)) s.pressLast = -99;
    if (!obj(s.chn)) s.chn = {};
    for (var h in s.chn) if (!obj(s.chn[h]) || !num(s.chn[h].mN)) delete s.chn[h];
    if (s.coach0 != null && !num(s.coach0)) s.coach0 = null;
    if (s.chem0 != null && !num(s.chem0)) s.chem0 = null;
    s.benchRun = num(s.benchRun) && s.benchRun > 0 ? s.benchRun | 0 : 0;
    s.lossRun = num(s.lossRun) && s.lossRun > 0 ? s.lossRun | 0 : 0;
    if (obj(s.rel)) s.rel.seat = num(s.rel.seat) ? clamp(Math.round(s.rel.seat), 0, 100) : 0;
  }
  function St(c) { return S.ensure(c); }
  function chemNow(c) { return isH(c) ? c.chem | 0 : c.mate ? c.mate.chem | 0 : 0; }
  function tierOf(c) {
    var L = VB.CareerLife, f = c.life && num(c.life.fame) ? c.life.fame : 0, t = 0;
    if (L && Array.isArray(L.TIERS)) { for (var i = 0; i < L.TIERS.length; i++) if (f >= (+L.TIERS[i][0] || 0)) t = i; return t; }
    return f >= 500 ? 1 : 0;
  }
  function snap(c, s) { s.coach0 = c.coach | 0; s.chem0 = chemNow(c); }

  /** Etiqueta del partido marcado (la de P3), normalizada: derbi, revancha, tv, duelo, jefe, final ('' si no hay). */
  function tagId(t) {
    if (obj(t)) t = t.id || t.k || t.tag || t.t || '';
    var x = String(t || '').toLowerCase().replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i').replace(/[óò]/g, 'o').replace(/[úù]/g, 'u');
    if (!x) return '';
    if (x.indexOf('derb') === 0) return 'derbi';
    if (x.indexOf('rev') === 0) return 'revancha';   // (P3 usa el id 'rev')
    if (x.indexOf('tele') === 0 || x === 'tv') return 'tv';
    if (x.indexOf('duel') === 0) return 'duelo';
    if (x.indexOf('jefe') === 0 || x.indexOf('boss') === 0) return 'jefe';
    if (x.indexOf('final') === 0 || x.indexOf('elim') === 0 || x.indexOf('semi') === 0 || x === 'ko' || x === 'cup') return 'final';
    return x;
  }
  function nextTag(c, s, ctx) {
    var t = '', W = S.sys ? S.sys('wall') : null;
    try { if (W && typeof W.tagNext === 'function') t = W.tagNext(c); } catch (e) { t = ''; }
    if (!t && obj(s.mk) && s.mk.k === ctx.nk) t = s.mk.tag;
    if (!t && (c.phase === 'cup' || c.phase === 'ko')) t = 'final';
    return tagId(t);
  }

  /** Quien te disputa el puesto en pista: SOLO LECTURA de c.sq6 (la caché que deja lineup6). null en playa o sin datos. */
  function seatRival(c) {
    if (!isH(c) || !obj(c.sq6) || !obj(c.sq6.L) || !Array.isArray(c.sq6.list)) return null;
    var L = c.sq6.L, id = L.rival, e = null;
    if (!id) return null;
    for (var i = 0; i < c.sq6.list.length; i++) if (c.sq6.list[i] && c.sq6.list[i].id === id) { e = c.sq6.list[i]; break; }
    if (!e || typeof e.name !== 'string') return null;
    var me = 0; try { var K = S.K(c); me = K && K.playerOvr ? K.playerOvr(c) : 0; } catch (er) { me = 0; }
    return { name: e.name, ovr: e.ovr | 0, form: e.form | 0, me: me | 0, stat: L.stat || '', gap: num(L.gap) ? L.gap : 0 };
  }

  /** Quien se queja (pista: alguien de tu plantilla, c.sq6.list en SOLO LECTURA; playa: tu pareja). want: 'bench' (ls 0: no salió
   *  de inicio la última vez), 'any' o 'x' (otra persona distinta de la de 'any', para {otro}). Elección por hash, sin gastar azar. */
  function peerOf(c, X, want) {
    if (!X.H) return want === 'x' ? '' : (c.mate && c.mate.name) || 'Tu pareja';
    var q = c.sq6, L = q && Array.isArray(q.list) ? q.list.filter(function (x) { return x && typeof x.name === 'string'; }) : [];
    if (!L.length) return want === 'any' ? 'Alguien del vestuario' : '';
    var pool = want === 'bench' ? L.filter(function (x) { return !x.ls; }) : L;
    if (!pool.length) return '';
    var i = Math.floor(S.rng(c, 'st-peer', X.season, X.mN, want === 'bench' ? 'b' : 'a')() * pool.length) % pool.length;
    if (want === 'x') { if (pool.length < 2) return ''; i = (i + 1 + Math.floor(S.rng(c, 'st-peer', X.season, X.mN, 'x')() * (pool.length - 1))) % pool.length; }
    return pool[i].name;
  }
  function qRoll(c, X, k) { return S.rng(c, 'st-q', X.season, X.mN, k)(); }

  // ================================================================== publicar
  function modeOk(b, c) { var o = b.only || (T[b.id] && T[b.id].only); return !o || (o === 'hall') === isH(c); }
  function postBeat(c, s, id, vars, exp) {
    var tp = T[id]; if (!tp) return null;
    var e = S.post(c, { b: id, k: tp.k, vars: vars || {}, o: tp.o ? 1 : 0, exp: exp });
    if (e) s.seenB[id] = s.mN;
    return e;
  }
  function fillTxt(c, t, v) {
    var vv = S.vars(c, v);
    return String(t).replace(/\{(\w+)\}/g, function (m, n) { return vv[n] != null ? vv[n] : ''; }).replace(/[{}]/g, '').replace(/ {2,}/g, ' ').trim();
  }
  function wall(c, a, t, v) { if (S.pushWall) S.pushWall(c, { a: a, t: fillTxt(c, t, v), v: v || {} }); }
  function pickR(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  /** Prensa: ¿toca esta jornada? */
  function pressDue(c, s, sum, X) {
    if (sum.bench) return false;
    var ev = c.life && c.life.ev; if (ev && (ev.key === 'pressWin' || ev.key === 'pressLoss')) return false;
    if (PRESS_TAG[X.tagPlayed] && X.mN - s.pressLast >= PRESS_MIN) return true;   // (tras un partido marcado fuerte o una final)
    var pf = S.flagAt(c, 'pressForce');   // carta «Entrevista en Radio Arena FM» de P2: la prensa querrá hablar tras este partido
    if (pf && pf.mN < X.mN) return true;
    return s.pressNext >= 0 && X.mN >= s.pressNext;
  }
  function pressGap(c, s, season, mN) {
    var r = S.rng(c, 'st-press', season, mN)(), f = s.freq;
    return f === 0 ? 5 : f === 2 ? 2 + (r < 0.5 ? 0 : 1) : 3 + (r < 0.5 ? 0 : 1);
  }
  function postPress(c, s, sum, X) {
    var res = sum.win ? 'w' : 'l', pool = [];
    PRESS.forEach(function (q, i) { if ((q[0] === 'a' || q[0] === res) && s.pressQ.indexOf(i) < 0) pool.push(i); });
    if (!pool.length) PRESS.forEach(function (q, i) { if (q[0] === 'a' || q[0] === res) pool.push(i); });
    var r = S.rng(c, 'st-pressq', X.season, X.mN), i = pool[Math.floor(r() * pool.length) % pool.length];
    var m = pickR(r, [S.MEDIA.diario, S.MEDIA.digital, S.MEDIA.radio]);
    var e = S.post(c, { b: 'pq' + i, k: 'press', vars: { m: m, rival: X.rival }, o: 1 });
    if (!e) return null;
    s.pressQ.push(i); if (s.pressQ.length > PRESSQ_MAX) s.pressQ = s.pressQ.slice(-PRESSQ_MAX);
    s.pressNext = X.mN + pressGap(c, s, X.season, X.mN); s.pressLast = X.mN;
    if (s.flags.pressForce) delete s.flags.pressForce;
    return e;
  }
  function chainDone(c, s, id, X) {
    var k = CH_OF[id]; if (!k) return;
    var h = s.chn[k]; delete s.chn[k];
    var acc = S.cast(c).acc;
    if (id === 'cParty') wall(c, acc.rumor, isH(c) ? 'Exclusiva: así acabó la cena de equipo de {club}. {yo}, micrófono en mano, no deja canción sin destrozar.' : 'Exclusiva: {yo} se marca un baile en el chiringuito que ya es historia del verano.', {});
    if (id === 'cViral') wall(c, '@' + (String(X.rp).replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '') || 'TuRival'), 'Intentando el reto de {yo}. Spoiler: gana la papelera.', {});
    if (id === 'cPressWin') wall(c, acc.rumor, 'En el vestuario de {rival} ya decoran con frases de {yo}.', { rival: (h && h.rv) || X.rival });
    if (id === 'cShoot') wall(c, acc.pena, 'Hemos visto el anuncio de {yo} con {sponsor}. Lo del disfraz merece un premio.', {});
  }

  // ================================================================== ganchos
  function onMatch(c, sum, f, ctx) {
    var s = St(c), H = isH(c), k; sum = sum || {};
    // --- contabilidad (solo c.story)
    for (k in s.seenB) if (s.mN - s.seenB[k] > SEEN_GAP + 2) delete s.seenB[k];
    for (k in s.chn) { if (k === 'clinic' ? s.chn[k].s < ctx.season : s.mN - s.chn[k].mN > CHN_LIFE) delete s.chn[k]; }
    var played = !sum.bench && sum.nota != null, benched = !!sum.bench || !!(H && sum.part && !sum.part.started);
    var br0 = s.benchRun;
    s.benchRun = benched ? s.benchRun + 1 : 0;
    if (!sum.bench) s.lossRun = sum.win ? 0 : s.lossRun + 1;
    // porqué del cambio de confianza y química (comparando con lo de antes del partido)
    var cause = sum.bench ? 'Jornada en el banquillo' : played && sum.nota >= 7 ? 'Buen partido (nota ' + nt(sum.nota) + ')' : played && sum.nota < 5.5 ? 'Partido flojo (nota ' + nt(sum.nota) + ')' : sum.win ? 'Victoria' : 'Derrota';
    if (num(s.coach0) && (c.coach | 0) !== s.coach0) {   // (el porqué con el signo del cambio: nunca «+12, Partido flojo»)
      var dco = (c.coach | 0) - s.coach0;
      S.why(c, 'coach', dco, dco > 0 && /^Partido flojo|^Derrota/.test(cause) ? (sum.win ? 'Victoria' : 'Jornada de trabajo') : dco < 0 && /^Buen partido|^Victoria/.test(cause) ? (sum.win ? 'Jornada irregular' : 'Derrota') : cause);
    }
    if (num(s.chem0) && chemNow(c) !== s.chem0) S.why(c, 'chem', chemNow(c) - s.chem0, sum.bench ? 'Jornada sin jugar juntos' : H ? 'Partido con el equipo' : 'Jugar juntos');
    if (s.pressNext < 0) s.pressNext = s.mN + pressGap(c, s, ctx.season, s.mN);
    var l = c.life || {}, X = {
      H: H, mN: s.mN, season: ctx.season, kind: ctx.kind, week: ctx.week, played: played, real: played && !sum.sim, rival: sum.rivalName || '', rp: l.rival && l.rival.name || '',
      streak: l.streak | 0, duel: sum.life && sum.life.duel || null, tier: tierOf(c), tagPlayed: tagId(ctx.played && ctx.played.tag), tagNext: '',
      startAfterBench: H && played && !!(sum.part && sum.part.started) && br0 >= 1,
      end: c.phase === 'off'   // (último partido: el gancho 'season' ya ha cerrado la temporada)
    };
    X.tagNext = nextTag(c, s, ctx);
    // --- pique pasivo (solo story): el duelo sube el calor
    if (X.duel) { var h0 = s.rel.heat; s.rel.heat = clamp(h0 + (X.duel.win ? 8 : 5), 0, 100); if (s.rel.heat !== h0) S.why(c, 'heat', s.rel.heat - h0, X.duel.win ? 'Duelo ganado' : 'Duelo perdido'); }
    // --- eco de la prensa (solo publicación y mensaje informativo, sin efectos)
    var pf = s.flags.press, acc = S.cast(c).acc, re = S.rng(c, 'st-eco', ctx.season, s.mN);
    if (pf && obj(pf.v) && !pf.v.done && s.mN > pf.mN && s.mN - pf.mN <= 3 && !sum.bench) {
      pf.v.done = 1;
      if (pf.v.t === 2) {
        if (sum.win) { wall(c, acc.cronista, pickR(re, ['Lo dijo y lo cumplió. {yo} avisó en la rueda de prensa y hoy ha ganado a {rival}.', 'Hablar y ganar: {yo} lo ha vuelto a hacer. Lo dijo y lo cumplió.', '{yo} prometió victoria y la ha servido. Lo dijo y lo cumplió.']), { rival: X.rival }); postBeat(c, s, 'pEcoW', {}); }
        else { wall(c, acc.hater, pickR(re, ['Las palabras de {yo} se le vuelven en contra. Lo comento con cariño, eh.', 'Mucho micrófono, poco marcador. Las palabras de {yo} se le vuelven en contra.', '{yo} habló de más y hoy ha perdido. Me guardo la captura, por si acaso.']), {}); postBeat(c, s, 'pEcoL', {}); }
      } else if (sum.win) wall(c, acc.cronista, pickR(re, ['{yo} habló de equipo en la prensa y el equipo ha respondido. Victoria ante {rival}.', 'Palabras humildes, juego grande: {yo} y {club} ganan a {rival}.']), { rival: X.rival });
    }
    // --- candidatos
    var cand = [];
    BEATS.forEach(function (b) {
      if (!modeOk(b, c)) return;
      if (num(s.seenB[b.id]) && s.mN - s.seenB[b.id] < SEEN_GAP) return;
      var ok = false; try { ok = !!b.when(c, sum, X, s); } catch (e) { ok = false; }
      if (ok) cand.push({ b: b, pri: b.pri, r: S.rng(c, 'st-msg', X.season, s.mN, b.id)() });
    });
    if (pressDue(c, s, sum, X)) cand.push({ b: null, press: 1, pri: 3.5, r: 0 });
    cand.sort(function (a, b) { return b.pri - a.pri || a.r - b.r; });
    // --- publicar con el tope
    var info = 0, fill = 0, fillOk = S.rng(c, 'st-msgf', X.season, s.mN)() < FILL_P[s.freq];
    cand.forEach(function (x) {
      if (x.press) { postPress(c, s, sum, X); return; }
      var b = x.b, asks = !!T[b.id].o;
      if (b.pri === 1 && (!fillOk || fill >= 1)) return;
      if (asks ? S.budget(c) <= 0 : info >= INFO_MAX[s.freq]) return;
      var v = { rival: X.rival, nota: nt(sum.nota), n: '' };
      if (b.id === 'aceShow') v.n = String(sum.me.aces | 0);
      if (b.id === 'blockShow') v.n = String(sum.me.blocks | 0);
      if (b.id === 'benchRun') { var sr = seatRival(c); v.seat = sr ? sr.name : 'Quien juega por delante'; }
      if (b.v) { var vx = b.v(c, sum, X, s); for (var q in vx) v[q] = vx[q]; }
      var e = postBeat(c, s, b.id, v);
      if (!e) return;
      if (b.pri === 1) fill++;
      if (!asks) info++;
      if (b.id === 'arch') s.rel.arch = 1;   // (solo story: se enseña en Gente)
      chainDone(c, s, b.id, X);
    });
    snap(c, s);
  }

  /** La decisión de career-life (EVENTS) se ha contestado: SOLO c.story (la marca de la cadena y algún pique o agente). */
  function onAnswer(c, key, i) {
    var s = St(c); if (!s || typeof key !== 'string') return;
    i = i | 0;
    s.chn[key] = { i: i, mN: s.mN, s: c.season | 0, rv: c.last && c.last.rivalName || '' };
    if (key === 'rivalTalk' && i <= 1) { var h0 = s.rel.heat; s.rel.heat = clamp(h0 + (i === 1 ? 10 : 5), 0, 100); if (s.rel.heat !== h0) S.why(c, 'heat', s.rel.heat - h0, 'Respondiste a tu rival'); }
    if (key === 'tv' && i === 0) { var a0 = s.rel.ag; s.rel.ag = clamp(a0 + 4, 0, 100); if (s.rel.ag !== a0) S.why(c, 'ag', s.rel.ag - a0, 'Saliste en la tele'); }
    snap(c, s);
  }
  function onReply(c, x, i) {
    var s = St(c), tp = T[x.b];
    if (tp && tp.press) S.flag(c, 'press', { t: i | 0, rv: x.vars && x.vars.rival || '', done: 0 });
    snap(c, s);
  }
  function onSetup(c) { snap(c, St(c)); }
  function onSeason(c) {
    var s = St(c), h = s.chn.clinic;
    if (h && h.i <= 1 && h.s === (c.season | 0)) { delete s.chn.clinic; postBeat(c, s, 'cClinic', {}, s.mN + 3); }
    if (!(num(s.seenB.seasonEnd) && s.mN - s.seenB.seasonEnd < SEEN_GAP)) postBeat(c, s, 'seasonEnd', {});
  }
  function onNewSeason(c) { var s = St(c); s.benchRun = 0; s.lossRun = 0; postBeat(c, s, 'seasonNew', {}); snap(c, s); }
  function onJoin(c) { var s = St(c); s.benchRun = 0; postBeat(c, s, 'welcome', {}); snap(c, s); }

  // ================================================================== remitentes y avisos de Partido (puros)
  /** Quien lleva la capitanía en pista (como el acta: la mejor media de la plantilla que no sea líbero); SOLO LECTURA de c.sq6. */
  function captainOf(c) {
    var L = c && c.sq6 && Array.isArray(c.sq6.list) ? c.sq6.list : [], best = null;
    for (var i = 0; i < L.length; i++) { var p = L[i]; if (p && typeof p.name === 'string' && p.pos !== 'L' && (!best || (p.ovr | 0) > (best.ovr | 0))) best = p; }
    return best ? best.name : '';
  }
  function senderOf(c, x) {
    var k = x.k, cs = S.cast(c), l = c.life || {};
    if (k === 'agent') return [cs.agent, WHO.agent];
    if (k === 'coach') return [cs.coach, WHO.coach];
    if (k === 'mate') return isH(c) ? [captainOf(c) || 'La capitanía', 'Capitanía'] : [c.mate && c.mate.name || 'Tu pareja', 'Pareja'];
    if (k === 'fam') return [cs.fam, WHO.fam];
    if (k === 'barrio') return [cs.barrio, WHO.barrio];
    if (k === 'press') return [x.vars && x.vars.m || cs.media.diario, WHO.press];
    if (k === 'rival') return [l.rival && l.rival.name || 'Tu rival', WHO.rival];
    if (k === 'sponsor') return [l.sponsor && l.sponsor.name || 'Tu patrocinador', WHO.sponsor];
    if (k === 'physio') return ['El fisio', WHO.physio];
    if (k === 'peer') return [x.vars && x.vars.who || (isH(c) ? 'Alguien del vestuario' : c.mate && c.mate.name || 'Tu pareja'), isH(c) ? WHO.peer : 'Pareja'];
    if (k === 'rumor') return [cs.acc.rumor, WHO.rumor];
    if (k === 'hater') return [cs.acc.hater, WHO.hater];
    if (k === 'fan') return [cs.acc.pena, WHO.fan];
    return ['Mensaje', ''];
  }
  function openOf(c) { var s = c && c.story; return s && Array.isArray(s.feed) ? s.feed.filter(function (x) { return x.o && x.ans === -1 && x.sys === 'msgs' && s.mN <= x.exp; }) : []; }
  function chips(c) {
    var o = openOf(c); if (!o.length) return [];
    var out = [], pr = o.filter(function (x) { return T[x.b] && T[x.b].press; }), ms = o.filter(function (x) { return !(T[x.b] && T[x.b].press); });
    if (pr.length) out.push({ p: 1, ic: '❝', t: 'Rueda de prensa', tab: 'inbox', s: 'box' });
    if (ms.length === 1) out.push({ p: 2, ic: '✉', t: senderOf(c, ms[0])[0] + ' te ha escrito', x: 'Responder', tab: 'inbox', s: 'box' });
    else if (ms.length > 1) out.push({ p: 2, ic: '✉', t: ms.length + ' mensajes', x: 'Por responder', tab: 'inbox', s: 'box' });
    return out;
  }

  // ================================================================== interfaz (HTML; la llama career-story-ui.js)
  function escF(H) { return H && H.esc ? H.esc : function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }; }
  function spF(H) { return H && H.sp ? H.sp : function (a) { return a.filter(function (p) { return p !== '' && p != null; }).join(', '); }; }
  function arrow(esc, h) { return h.map(function (x) { return '<span class="' + (x[1] ? 'lf-up' : 'lf-dn') + '">' + esc(x[0]) + ' ' + (x[1] ? '▲' : '▼') + '</span>'; }).join(' '); }
  function hintOf(c, e) { var h = S.hint(c, e); if (e && num(e.seat) && e.seat) h.push(['Pique por el puesto', e.seat > 0]); return h; }
  /** Una entrada del feed (de cualquier sistema) con el aspecto de .msg de career-ui y, si espera respuesta, sus botones apilados. */
  function feedHTML(c, x, H, fresh) {
    var esc = escF(H), sp = spF(H), tx = S.text(c, x), tp = T[x.b] || S.tpl(x.b) || {}, who = senderOf(c, x), s = c.story;
    var open = x.o && x.ans === -1 && s.mN <= x.exp, unread = !x.r || open || !!(fresh && fresh['st' + x.id]);
    var when = 'T' + x.s + (x.ph === 'league' && x.w > 0 ? ' J' + x.w : '');
    var h = '<div class="msg st-msg' + (unread ? ' unread' : '') + (open ? ' st-open' : '') + '"><small>' + sp([esc(who[0]), esc(who[1]), when], 'v') + '</small><b>' + esc(tx.t) + '</b><p>' + esc(tx.x) + '</p>';
    if (open) {
      var left = x.exp - s.mN + 1;
      h += '<div class="acts st-acts" data-nav>' + (tp.o || []).map(function (o, i) {
        var lab = tx.o[i] ? tx.o[i].t : '', hi = hintOf(c, o.e);
        return '<button data-act="st-ans-' + x.id + '-' + i + '">' + esc(lab) + (hi.length ? '<small>' + arrow(esc, hi) + '</small>' : '') + '</button>';
      }).join('') + '</div><small class="muted st-exp">' + (left <= 1 ? 'Caduca tras el próximo partido' : 'Caduca en ' + left + ' jornadas') + '</small>';
    } else if (x.o && x.ans >= 0) {
      var t2 = S.text(c, { id: x.id, b: x.b, vars: x.vars, o: 1, ans: -1 });
      h += '<p class="muted st-ans">Respondiste: «' + esc(t2.o[x.ans] ? t2.o[x.ans].t : '') + '»</p>';
    } else if (x.o) {
      var t3 = S.text(c, { id: x.id, b: x.b, vars: x.vars, o: 1, ans: -2 }).c;
      if (t3) h += '<p class="muted st-ans">' + esc(t3) + '</p>';
    }
    return h + '</div>';
  }
  // ================================================================== Bandeja como CHAT de teléfono (1.13.2)
  // Conversaciones agrupadas por quien escribe (en pista, cada persona del vestuario por su nombre; la prensa, por medio; los avisos
  // de c.inbox, en «Club»). Dentro: burbujas suyas a la izquierda, tus respuestas a la derecha, y abajo las respuestas rápidas si
  // espera respuesta. Estado de la vista (no se guarda): chatK = conversación abierta ('' = lista); unseen = lo no leído al entrar
  // (la pestaña marca todo leído al abrirse; aquí se recuerda hasta que abres esa conversación).
  var chatK = '', unseen = {};
  var AV = { coach: '#ff9f1c', agent: '#7b61ff', mate: '#1fb5a8', peer: '#1fb5a8', fam: '#ff6b8b', barrio: '#f4a261', fan: '#f4a261', press: '#3a86ff',
    rival: '#e63946', sponsor: '#e9b400', physio: '#2ec4b6', rumor: '#8d99ae', hater: '#8d99ae', club: '#5c677d' };
  function convKey(c, x) {
    var k = x.k || 'club';
    if (k === 'peer' && !isH(c)) return 'mate';   // (en playa quien se queja es tu pareja: la misma conversación)
    if (k === 'peer' || k === 'press') return k + '|' + senderOf(c, x)[0];
    return k;
  }
  function initials(n) { var w = String(n || '?').replace(/^@/, '').split(/\s+/).filter(Boolean); return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase(); }
  function avatar(esc, k, name) { return '<span class="st-av" style="background:' + (AV[k] || '#5c677d') + '" aria-hidden="true">' + esc(initials(name)) + '</span>'; }
  function whenOf(x) { return 'T' + (x.s | 0) + ((x.ph === 'league' || x.ph == null) && (x.w | 0) > 0 ? ' J' + (x.w | 0) : ''); }
  /** Todas las conversaciones: [{key, k, name, role, items:[{t:'f'|'m', x|m, s, w, n, i}], open, last}] (más reciente primero). */
  function convs(c) {
    var s = St(c), map = {}, out = [];
    function add(key, k, name, role, it) {
      var v = map[key]; if (!v) { v = map[key] = { key: key, k: k, name: name, role: role, items: [], open: 0, un: 0 }; out.push(v); }
      v.items.push(it);
    }
    s.feed.forEach(function (x) {
      if (!obj(x)) return;
      var who = senderOf(c, x), it = { t: 'f', x: x, s: x.s | 0, w: x.w | 0, n: 1, i: x.id | 0 };
      add(convKey(c, x), x.k || 'club', who[0], who[1], it);
      var v = map[convKey(c, x)];
      if (x.o && x.ans === -1 && s.mN <= x.exp) v.open++;
      if (unseen['st' + x.id]) v.un++;
    });
    (Array.isArray(c.inbox) ? c.inbox : []).forEach(function (m, i) {
      if (!obj(m)) return;
      add('club', 'club', 'Club', 'Avisos y ofertas', { t: 'm', m: m, s: m.s | 0, w: m.w | 0, n: 0, i: i });
      if (unseen['m' + m.id]) map.club.un++;
    });
    out.forEach(function (v) { v.items.sort(function (a, b) { return a.s - b.s || a.w - b.w || a.n - b.n || a.i - b.i; }); v.last = v.items[v.items.length - 1]; });
    out.sort(function (a, b) { return (b.open > 0) - (a.open > 0) || b.last.s - a.last.s || b.last.w - a.last.w || b.last.n - a.last.n || b.last.i - a.last.i; });
    return out;
  }
  /** En el chat el nombre ya va arriba de la burbuja: «Sam: «Quiero…»» → «Quiero…» (solo si quien habla es quien escribe). */
  function bare(name, t) {
    t = String(t || ''); var p = String(name || '') + ': ';
    if (name && t.indexOf(p) === 0) { t = t.slice(p.length); if (t.charAt(0) === '«' && t.charAt(t.length - 1) === '»' && t.indexOf('«', 1) < 0) t = t.slice(1, -1); }
    return t;
  }
  function preview(c, it) { if (it.t === 'm') return it.m.x || it.m.t || ''; var tx = S.text(c, it.x); return bare(senderOf(c, it.x)[0], tx.x || tx.t || ''); }
  function phone(inner, bar) {
    return '<div class="st-phone"><div class="st-pbar" aria-hidden="true"><span>9:41</span><i></i><span>▮▮▮ ▰</span></div>' + inner + '</div>';
  }
  function chatList(c, H) {
    var esc = escF(H), L = convs(c);
    var h = '<div class="st-ctop"><b>Mensajes</b>' + (L.some(function (v) { return v.open; }) ? '<small>' + L.filter(function (v) { return v.open; }).length + ' esperan respuesta</small>' : '') + '</div>';
    if (!L.length) return phone(h + '<p class="st-empty">Aún no te ha escrito nadie.</p>');
    h += '<div class="st-clist" data-nav>' + L.map(function (v) {
      var badge = v.open ? '<span class="st-badge st-q" title="Espera respuesta">!</span>' : v.un ? '<span class="st-badge">' + v.un + '</span>' : '';
      return '<button class="st-conv' + (v.open || v.un ? ' st-new' : '') + '" data-act="st-msgs-chat" data-v="' + esc(v.key) + '">' + avatar(esc, v.k, v.name) +
        '<span class="st-cmid"><b>' + esc(v.name) + '</b><small>' + esc(preview(c, v.last)) + '</small></span><span class="st-cend"><small>' + esc(whenOf(v.last)) + '</small>' + badge + '</span></button>';
    }).join('') + '</div>';
    return phone(h);
  }
  function chatThread(c, H, v) {
    var esc = escF(H), s = St(c), open = null, h = '';
    h += '<div class="st-chead" data-nav><button class="st-back" data-act="st-msgs-back" aria-label="Volver a las conversaciones">‹</button>' + avatar(esc, v.k, v.name) +
      '<span class="st-cmid"><b>' + esc(v.name) + '</b><small>' + esc(v.role || '') + '</small></span></div>';
    var log = '', lastW = '';
    v.items.forEach(function (it) {
      var w = whenOf(it.t === 'm' ? it.m : it.x);
      if (w !== lastW) { log += '<p class="st-day">' + esc(w.replace(/^T(\d+)/, 'Temporada $1').replace(/ J(\d+)$/, ', jornada $1')) + '</p>'; lastW = w; }
      // (como en WhatsApp: arriba de la burbuja, quien escribe; el asunto no sale)
      if (it.t === 'm') { log += '<div class="st-bub st-bin"><b class="st-who" style="color:' + (AV.club) + '">' + esc(v.name) + '</b>' + esc(it.m.x || it.m.t) + '</div>'; return; }
      var x = it.x, tx = S.text(c, x);
      log += '<div class="st-bub st-bin"><b class="st-who" style="color:' + (AV[x.k] || AV.club) + '">' + esc(senderOf(c, x)[0]) + '</b>' + esc(bare(senderOf(c, x)[0], tx.x || tx.t)) + '</div>';
      if (x.o && x.ans >= 0) {
        var t2 = S.text(c, { id: x.id, b: x.b, vars: x.vars, o: 1, ans: -1 });
        log += '<div class="st-bub st-bout">' + esc(t2.o[x.ans] ? t2.o[x.ans].t : '') + '<small>✓✓</small></div>';
      } else if (x.o && (x.ans === -2 || s.mN > x.exp)) {
        var t3 = S.text(c, { id: x.id, b: x.b, vars: x.vars, o: 1, ans: -2 }).c;
        log += '<p class="st-day st-gone">' + esc(t3 || 'Se quedó sin respuesta') + '</p>';
      } else if (x.o && x.ans === -1) open = x;
    });
    h += '<div class="st-scroll"><div class="st-log">' + log + '<h3 class="st-sr">Conversación con ' + esc(v.name) + '</h3></div></div>';
    if (open) {
      var tp = T[open.b] || S.tpl(open.b) || {}, tx = S.text(c, open), left = open.exp - s.mN + 1;
      h += '<div class="st-replies" data-nav>' + (tp.o || []).map(function (o, i) {
        var hi = hintOf(c, o.e);
        return '<button data-act="st-ans-' + open.id + '-' + i + '">' + esc(tx.o[i] ? tx.o[i].t : '') + (hi.length ? '<small>' + arrow(esc, hi) + '</small>' : '') + '</button>';
      }).join('') + '<small class="st-exp">' + (left <= 1 ? 'Caduca tras el próximo partido' : 'Caduca en ' + left + ' jornadas') + '</small></div>';
    } else h += '<div class="st-replies st-ro"><small>' + (v.k === 'club' || !v.items.some(function (it) { return it.t === 'f' && it.x.o; }) ? 'Solo lectura' : 'Nada pendiente') + '</small></div>';
    return phone(h);
  }
  /** Bandeja (ui.inbox): el chat. msgHTML no se usa (se mantiene la firma). fresh: ids recién leídos de c.inbox y 'st<id>' del feed. */
  function inbox(c, H, msgHTML, fresh) {
    var s = St(c);
    if (fresh) for (var f in fresh) if (fresh[f]) unseen[/^st/.test(f) ? f : 'm' + f] = 1;
    var L = convs(c), v = null;
    for (var i = 0; i < L.length; i++) if (L[i].key === chatK) v = L[i];
    if (!v) chatK = '';
    if (v) v.items.forEach(function (it) { delete unseen[it.t === 'm' ? 'm' + it.m.id : 'st' + it.x.id]; });
    return '<div class="card st-inbox st-chat">' + (v ? chatThread(c, H, v) : chatList(c, H)) + '</div>';
  }
  function onAct(c, a, b) {
    if (a === 'st-msgs-back') { var k0 = chatK; chatK = ''; return { render: true, focus: k0 ? '.st-conv[data-v="' + k0.replace(/["\\]/g, '') + '"]' : '.st-conv' }; }
    if (a === 'st-msgs-chat') {
      chatK = b && b.getAttribute ? String(b.getAttribute('data-v') || '') : '';
      var v = null, L = convs(c); for (var i = 0; i < L.length; i++) if (L[i].key === chatK) v = L[i];
      return { render: true, focus: v && v.open ? '.st-replies button' : '.st-back' };
    }
    return null;
  }

  function ago(s, w) { var d = s.mN - w.mN; return d <= 0 ? 'esta jornada' : d === 1 ? 'hace 1 jornada' : 'hace ' + d + ' jornadas'; }
  function bar(v) { v = clamp(Math.round(+v || 0), 0, 100); return '<span class="st-bar" role="img" aria-label="' + v + ' de 100"><i style="width:' + v + '%"></i></span>'; }
  function feel(v, a) { return v < 25 ? a[0] : v < 45 ? a[1] : v < 70 ? a[2] : v < 85 ? a[3] : a[4]; }
  /** Club › Gente: fichas con barra, frase y último cambio (con su porqué). Solo lectura (también de c.sq6 en pista). */
  function people(c, H) {
    var esc = escF(H), sp = spF(H), s = St(c), cs = S.cast(c), l = c.life || {}, K = S.K(c), rows = [];
    function card(name, role, v, line, w, tag) {
      var last = w && w.d ? sp(['Último cambio ' + sgn(Math.round(w.d)), esc(w.t || ''), ago(s, w)], 'v') : '';
      return '<div class="lf-item st-person"><div><b>' + esc(name) + (tag ? ' <span class="tag r">' + esc(tag) + '</span>' : '') + '</b><small>' + sp([esc(role), v != null ? String(Math.round(v)) : ''], 'v') + '</small>' +
        (v != null ? bar(v) : '') + (line ? '<small>' + esc(line) + '</small>' : '') + (last ? '<small class="muted">' + last + '</small>' : '') + '</div></div>';
    }
    var ct = ''; try { ct = K && K.coachText ? K.coachText(c.coach | 0) : ''; } catch (e) { ct = ''; }
    rows.push(card(cs.coach, 'Cuerpo técnico, confianza', c.coach | 0, ct ? '«' + ct + '»' : '', s.rel.why.coach));
    if (isH(c)) rows.push(card('El vestuario', 'Química del equipo', c.chem | 0, feel(c.chem | 0, ['Cada cual a lo suyo', 'Cuesta conectar', 'Buen ambiente', 'Una piña', 'Una familia']), s.rel.why.chem));
    else if (c.mate) rows.push(card(c.mate.name || 'Tu pareja', 'Pareja, química', c.mate.chem | 0, feel(c.mate.chem | 0, ['Ni os miráis', 'Os falta rodaje', 'Os entendéis', 'Jugáis de memoria', 'Una sola cabeza']), s.rel.why.chem));
    rows.push(card(cs.agent, 'Agente', s.rel.ag, feel(s.rel.ag, ['Te contesta con monosílabos', 'Algo distante', 'Trabaja para ti', 'Se deja la piel por ti', 'Te consigue de todo']) + (s.rel.ag >= 70 ? '. Con esta confianza te busca actos pagados.' : ''), s.rel.why.ag));
    rows.push(card(cs.fam, 'Familia', s.rel.fam, feel(s.rel.fam, ['Te echan mucho de menos', 'Esperan tu llamada', 'Orgullo de casa', 'Tu mejor afición', 'Incondicionales']), s.rel.why.fam));
    if (l.rival && l.rival.name) rows.push(card(l.rival.name, 'Rival personal, pique' + ((l.rival.w | 0) + (l.rival.l | 0) ? ' (duelos ' + (l.rival.w | 0) + '-' + (l.rival.l | 0) + ')' : ''), s.rel.heat,
      s.rel.heat >= 80 ? 'Archienemigo: cada duelo vale doble.' : feel(s.rel.heat, ['Ni se acuerda de ti', 'Se fija en ti', 'Hay pique', 'Pique serio', 'A punto de estallar']), s.rel.why.heat, s.rel.arch || s.rel.heat >= 80 ? 'Archienemigo' : ''));
    var sr = seatRival(c);
    if (sr) rows.push(card(sr.name, sr.stat === 'start' ? 'Te aprieta desde el banquillo' : 'Te disputa el puesto', null,
      'Tu media ' + sr.me + ' frente a ' + sr.ovr + ' de ' + sr.name + (sr.form ? ' (su forma ' + sgn(sr.form) + ')' : '') + '.' + (s.rel.seat ? ' Pique por el puesto: ' + s.rel.seat + '.' : ''), s.rel.why.seat));
    return '<div class="card st-people"><h3>Gente</h3>' + rows.join('') + '</div>';
  }
  function css() {
    return '.st-bar{display:block;height:6px;margin:4px 0 2px;border-radius:3px;background:rgba(127,127,127,.25);overflow:hidden}.st-bar>i{display:block;height:100%;border-radius:3px;background:currentColor}' +
      '.st-acts{display:flex;flex-direction:column;gap:6px;margin-top:6px}.st-acts>button{min-height:44px;text-align:left}.st-acts>button small{display:block}' +
      '.st-sec{margin:8px 0 2px;font-weight:700;opacity:.8}.st-exp{display:block;margin-top:4px}.st-ans{margin:4px 0 0}' + CHAT_CSS;
  }

  // chat: en el móvil, la app a todo el ancho; en PC (ancha y alta), dentro de un teléfono dibujado (marco, isla y barra de estado)
  var QC = ':root:not(#_):not(#_):not(#_):not(#_) #career';
  var CHAT_CSS = [
    QC + ' .st-chat{padding:6px;background:transparent;box-shadow:none;border:0}',
    QC + ' .st-phone{position:relative;display:flex;flex-direction:column;width:100%;height:max(240px,calc(100dvh - 290px));max-height:640px;margin:0 auto;border-radius:18px;overflow:hidden;background:#f3ecdf;color:#1d1530;font-family:var(--sp-ui,system-ui,sans-serif);letter-spacing:0;text-transform:none;box-shadow:0 0 0 2.5px #1d1530,3px 4px 0 2.5px #1d1530}',
    QC + ' .st-pbar{display:none}',
    QC + ' .st-ctop{display:flex;align-items:baseline;gap:8px;padding:10px 14px 8px;background:#1fb5a8;color:#fff}',
    QC + ' .st-ctop b{font-size:18px;letter-spacing:.02em}' + QC + ' .st-ctop small{opacity:.9}',
    QC + ' .st-clist{flex:1;overflow-y:auto;overscroll-behavior:contain}',
    QC + ' .st-conv{display:flex;align-items:center;gap:10px;width:100%;min-height:58px;margin:0;padding:8px 12px;border:0;border-radius:0;background:transparent;color:#1d1530;text-align:left;box-shadow:inset 0 -1px 0 rgba(29,21,48,.12);text-shadow:none;transform:none;font:inherit}',
    QC + ' .st-conv:hover,' + QC + ' .st-conv:focus-visible,' + QC + ' .st-conv.kf{background:rgba(31,181,168,.14);outline:none}',
    QC + ' .st-av{flex:none;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;color:#fff;font-weight:800;font-size:14px;box-shadow:0 0 0 2px #1d1530}',
    QC + ' .st-cmid{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
    QC + ' .st-cmid b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    QC + ' .st-cmid small{font-size:13px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    QC + ' .st-new .st-cmid small{opacity:1;font-weight:700}',
    QC + ' .st-cend{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}' + QC + ' .st-cend small{font-size:12px;opacity:.7}',
    QC + ' .st-badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#1fb5a8;color:#fff;font-size:12px;font-weight:800;line-height:20px;text-align:center}',
    QC + ' .st-badge.st-q{background:#ff3b5c}',
    QC + ' .st-chead{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#1fb5a8;color:#fff}',
    QC + ' .st-chead .st-cmid small{opacity:.9}',
    QC + ' .st-back{flex:none;min-width:44px;min-height:44px;margin:0;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;font-size:30px;line-height:1;box-shadow:none;text-shadow:none;transform:none}',
    QC + ' .st-back:focus-visible,' + QC + ' .st-back.kf{outline:3px solid #fff;outline-offset:-3px}',
    // (column-reverse con un solo hijo: el desplazamiento arranca abajo, en lo último, sin JS)
    QC + ' .st-scroll{flex:1;min-height:0;display:flex;flex-direction:column-reverse;overflow-y:auto;overscroll-behavior:contain;background:#efe6d6 radial-gradient(rgba(29,21,48,.06) 1px,transparent 1.5px) 0 0/14px 14px}',
    QC + ' .st-log{display:flex;flex-direction:column;gap:6px;padding:10px 10px 6px}',
    QC + ' .st-day{align-self:center;margin:6px 0 2px;padding:2px 10px;border-radius:10px;background:rgba(29,21,48,.1);font-size:12px;color:#1d1530}',
    QC + ' .st-gone{font-style:italic;max-width:90%;text-align:center}',
    QC + ' .st-bub{position:relative;max-width:84%;padding:7px 10px 8px;border-radius:14px;font-size:14.5px;line-height:1.3;box-shadow:0 0 0 1.5px #1d1530,1.5px 2px 0 1.5px #1d1530}',
    QC + ' .st-bub b{display:block;margin-bottom:2px;font-size:12.5px;font-weight:800;filter:brightness(.8)}',
    QC + ' .st-bin{align-self:flex-start;background:#fff;border-bottom-left-radius:4px}',
    QC + ' .st-bout{align-self:flex-end;background:#c9f2dc;border-bottom-right-radius:4px}',
    QC + ' .st-bout small{margin-left:8px;font-size:11px;color:#1fb5a8;font-weight:800}',
    QC + ' .st-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);margin:0}',
    QC + ' .st-chat .st-fx{align-self:stretch;margin:4px 0;padding:6px 10px;border-radius:10px;background:#fff7d6;color:#1d1530;font-size:13px}',
    QC + ' .st-replies{flex:none;display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px;background:#f3ecdf;box-shadow:inset 0 1.5px 0 rgba(29,21,48,.15)}',
    QC + ' .st-replies>button{min-height:44px;margin:0;padding:6px 12px;border:0;border-radius:18px;background:#1fb5a8;color:#fff;text-align:left;font:700 14.5px/1.2 var(--sp-ui,system-ui,sans-serif);letter-spacing:0;text-transform:none;text-shadow:none;transform:none;box-shadow:0 0 0 2px #1d1530,2px 3px 0 2px #1d1530}',
    QC + ' .st-replies>button:focus-visible,' + QC + ' .st-replies>button.kf{outline:3px solid #ffd23f;outline-offset:2px}',
    QC + ' .st-replies>button small{display:block;margin-top:2px;font-weight:600;font-size:12px}',
    QC + ' .st-replies .lf-up{color:#fff}' + QC + ' .st-replies .lf-dn{color:#ffe0e5}',
    QC + ' .st-replies .st-exp,' + QC + ' .st-ro small{font-size:12px;opacity:.65;text-align:center}',
    QC + ' .st-empty{padding:20px;text-align:center;opacity:.7}',
    // PC: un teléfono de verdad (marco negro, esquinas grandes, isla y barra de estado)
    '@media (min-width:900px) and (min-height:600px){' +
      QC + ' .st-phone{width:380px;height:max(400px,min(680px,calc(100vh - 290px)));max-height:none;border-radius:44px;box-shadow:0 0 0 11px #1d1530,0 0 0 13px #4a3f66,6px 10px 0 13px rgba(29,21,48,.55)}' +
      QC + ' .st-pbar{display:flex;align-items:center;justify-content:space-between;flex:none;height:30px;padding:0 26px;background:#1fb5a8;color:#fff;font-size:12px;font-weight:800}' +
      QC + ' .st-pbar i{width:92px;height:22px;border-radius:12px;background:#1d1530}' +
      QC + ' .st-chat{padding:14px 0 20px}}'
  ].join('');

  // ================================================================== registro
  S.use({
    id: 'msgs', tpl: T,
    ensure: function (s) { ensureS(s); },
    fx: { seat: function (c, v, why) { var s = St(c), a = s.rel.seat | 0; s.rel.seat = clamp(Math.round(a + v), 0, 100); if (s.rel.seat !== a) S.why(c, 'seat', s.rel.seat - a, why); return 'Pique por el puesto ' + sgn(Math.round(v)); } },
    onSetup: onSetup, onMatch: onMatch, onSeason: onSeason, onNewSeason: onNewSeason, onJoin: onJoin, onAnswer: onAnswer, onReply: onReply, onAct: onAct,
    chips: chips,
    ui: { inbox: inbox, people: people, css: css, feedHTML: feedHTML },
    // (para las pruebas y la interfaz)
    BEATS: BEATS, PRESS: PRESS, CH_OF: CH_OF, seatRival: seatRival, senderOf: senderOf, tagId: tagId, open: openOf, SEEN_GAP: SEEN_GAP, INFO_MAX: INFO_MAX
  });
})();
