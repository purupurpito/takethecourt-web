/* MAKE THE CUT — js/version.js (owner: ui_main)
 * Una sola fuente para el número de versión, las novedades y los créditos. Solo datos: sin DOM y sin red.
 * Se carga el primero después de three.js (antes de account.js). Lo leen ui.js (panel «Acerca de», pestaña Info de Ajustes,
 * #btnVer de la portada, aviso de novedades una vez por versión), main.js (ctx.bootInfo.version) y tools/build-pages.js (con vm:
 * metadatos de Pages y guardas del build) y tools/abouttest.js.
 * REGLA DE VERSIONADO: cada publicación con un cambio que se vea en el juego sube VERSION y añade su entrada ARRIBA de CHANGELOG
 * (la más nueva primero). build-pages falla si CHANGELOG[0].v !== VERSION o si VERSION no es semver (x.y.z).
 * Textos (notes/ui_main.md, «Textos: guía de estilo»): frases cortas, sin el punto medio como pegamento, ordinales «1r» «2º»,
 * género neutro, sin nombres reales ni patrocinadores de verdad. Este fichero no lleva arrobas ni la palabra del programa de
 * navegación web (tools/abouttest.js lo comprueba en todo el fichero, comentarios incluidos).
 * 1.0.0 (12-nov-2026, decisión de Ferran): cierre del sprint 5. Sin créditos a herramientas de IA (Ferran, 12-nov-2026).
 * 1.1.0 (13-nov-2026): Vestuario (personalización del aspecto, js/look.js). Solo estética.
 * 1.2.0 (15-nov-2026): sedes generadas por club (js/venue-gen*.js) y pabellón al azar por partido.
 * 1.3.0 (15-nov-2026): sprint 2-4 «Tu carrera», «Partidos que se recuerdan» y «Volver mañana» (retratos y escudos, portada con la
 *   Carrera, previa y resumen de jornada, repeticiones, jefes y química, retos y perfil). Los entrenos con el club ya venían de main.
 * 1.5.0 (16-nov-2026): Online beta (js/net*.js, notes/net.md): lobby con salas en Firestore, WebRTC, gorra Online Beta Tester.
 * 1.9.0 (17-nov-2026): Online V2, conexión Fluida (js/netfluid.js, notes/net.md «Online V2»).
 * 1.5.3 (17-nov-2026): árbitros con las señas oficiales y el 2º árbitro que se mueve con el juego (js/arena.js).
 * 1.7.0 (17-nov-2026): Acta del partido (js/acta.js): los partidos 6v6 salen como acta de emPat (formato empat/acta). NO es público
 *   (Ferran, 17-nov-2026): el botón solo sale con su cuenta (ui.js ACTA_ALLOW) y las novedades no lo anuncian.
 * 1.8.0 (17-nov-2026): fusión de la rama pruebas-entrenos: pruebas con partidillo de petos (ampliadas: IA un nivel por encima,
 *   rivales mejores, invitaciones a mitad y fin de temporada), entrenos Jugar/Rápido/Descansar y nota en directo.
 * 1.8.1 (17-nov-2026): cámara del 6v6 que sigue al balón y zoom de cámara (js/camera.js, js/input.js).
 * 1.8.2 (17-nov-2026): la cámara del 6v6 deja de seguir los balones muy rápidos (> 15 m/s), a petición de Ferran.
 * 1.10.0 (17-nov-2026): consignas del entrenador en directo en la Carrera (js/consignas.js), idea de Ferran.
 * 1.11.0 (18-nov-2026): árbitros como en la vida real (FIVB 2025-2028, Guidelines) y bandera roja de vóley, a petición de Ferran.
 * 1.15.0 (19-nov-2026): IA con esfuerzo real (VB.EFFORT en sim.js): sin dado previo ni defensor «perdido» lento, a petición de Ferran.
 * 1.9.1 (17-nov-2026): menús SPLAT (materiales del vóley con toque Splatoon, elegido por Ferran): js/splat.js, notes/splat.md.
 * 1.12.0 (18-nov-2026): salto con dirección, remate con impulso, pipe y colocación en salto con diana (js/sim.js).
 * 1.12.1 (18-nov-2026): vuelve la cámara de juego de antes de 1.8.1 (Ferran: «la nueva es horrible») con la regla de no perder el
 *   balón (js/camera.js ctUpdate: solo corrige cuando el balón se va del cuadro). El zoom de cámara se queda.
 * 1.14.0 (18-nov-2026): menús pensados para el móvil apaisado (Ferran: «se ve todo muy cramped»): escala de letra y piezas .ph
 *   de js/splat.js, cada pantalla con su versión de móvil (notes/splat.md §9, notes/ui_main.md «Móvil (v-next)»).
 * 1.14.1 (18-nov-2026): challenge en la conexión Fluida (Ferran: «pon challenge en v2»): árbitro con errores de línea como en
 *   Precisa; lo pide el que pierde el punto (ch), lo acepta la otra máquina (chok/chno) y la revisión corre en las dos
 *   (js/netfluid.js _chalAsk, Sim.flChallenge; tools/fluidchaltest.js).
 * 1.15.1 (19-nov-2026): aviso de versión nueva (Ferran: «si un teléfono está en una versión anterior le salte un aviso en la
 *   pantalla de reiniciar»): js/update.js pregunta a Pages por version.json y ofrece «Reiniciar»; el online dice quién tiene que reiniciar.
 * 1.18.0 (20-nov-2026): Vestuario renovado (notes/vestuario-plan.md, notes/players.md § Vestuario): casco de pelo nuevo con 32
 *   peinados, segundo color y efectos de pelo, objetos nuevos, miniaturas, encuadre por ranura y Probar.
 * 1.16.1 (19-nov-2026): Camino de temporada y Cifras con SPLAT y versión de móvil (js/career-story-season.js); entrar con Google
 *   pide confirmación si se bloquea la ventana emergente (sin redirección: fallaba en iPhone y Firefox); pruebas al día con 1.15.0.
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  VB.VERSION = '1.18.0';
  VB.VERSION_DATE = '2026-11-20';

  /** Novedades: {v, d:'AAAA-MM-DD', t (título corto), items[] (frases de 90 caracteres como mucho)}. La más nueva primero. */
  VB.CHANGELOG = [
    {
      v: '1.18.0', d: '2026-11-20', t: 'Vestuario renovado',
      items: [
        '32 peinados, y el pelo asoma por debajo de la gorra, el pescador o el pañuelo.',
        'Segundo color de pelo: raíces, puntas, mechas, flequillo teñido o mitad y mitad.',
        'Más de 40 objetos nuevos: pendientes, cadenas, gafas, manguitos, calcetines y zapatillas.',
        'Miniaturas de cada opción y una cámara que enfoca lo que vas eligiendo.',
        'Probar: mira tu aspecto en un remate, una celebración o una recepción.'
      ]
    },
    {
      v: '1.17.1', d: '2026-11-20', t: 'Repaso para el móvil',
      items: [
        'Menús, Carrera y partido repasados en el móvil: nada cortado ni tapando los mandos.'
      ]
    },
    {
      v: '1.17.0', d: '2026-11-19', t: 'Fintas',
      items: [
        'La finta llega al 6 contra 6 y a la Carrera de pista.',
        'Más fácil de hacer: en el aire, Golpear pronto y Saltar en el momento del golpe.',
        'En el móvil: toca Golpear pronto y desliza el dedo a Saltar al golpear.',
        'Con el bloqueo rival ya en el aire, a la defensa le cuesta mucho más leerla.'
      ]
    },
    {
      v: '1.16.1', d: '2026-11-19', t: 'Camino y Cifras renovados',
      items: [
        'Camino de temporada y Cifras con el estilo de los menús y pensados para el móvil.'
      ]
    },
    {
      v: '1.16.0', d: '2026-11-19', t: 'Ambiente de Carrera',
      items: [
        'La grada vive el partido: anima, pita al rival, canta y calla en los puntos de set.',
        'Discusiones con el árbitro: a veces eliges entre Protestar o Dejarlo.',
        'Tarjetas de reglamento: la amarilla avisa y la roja da punto y saque al rival.',
        'Pique entre equipos y frases del banquillo, el rival, el árbitro y la megafonía.',
        'Nuevo ajuste en Ajustes › Juego: Ambiente de Carrera completo, tranquilo o apagado.'
      ]
    },
    {
      v: '1.15.1', d: '2026-11-19', t: 'Aviso de versión nueva',
      items: [
        'Si tu móvil tiene una versión anterior del juego, te avisa y lo reinicias con un botón.',
        'En el online te dice quién tiene la versión anterior y tiene que reiniciar.'
      ]
    },
    {
      v: '1.15.0', d: '2026-11-19', t: 'La IA lo intenta todo',
      items: [
        'La IA siempre va a por el balón: si no llega, es por su reacción, velocidad y alcance.',
        'Cuando no llega por poco, se tira en plancha igualmente y se ve cómo lo intenta.',
        'Los jugadores arrancan y reaccionan como en el vóley real, sin salir disparados.',
        'Velocidad, Reacción, Defensa y Recepción pesan más: un buen defensor llega a mucho más.'
      ]
    },
    {
      v: '1.14.1', d: '2026-11-18', t: 'Challenge en la Fluida',
      items: [
        'Online con la conexión Fluida: ahora también hay challenge, como en la Precisa.',
        'El árbitro de la Fluida ya puede equivocarse en las bolas de línea, y se puede revisar.'
      ]
    },
    {
      v: '1.14.0', d: '2026-11-18', t: 'Menús para el móvil',
      items: [
        'Menús rehechos para el móvil: letra más grande y menos cosas en cada pantalla.',
        'Botones grandes para el pulgar: Volver arriba a la izquierda y la acción principal abajo.',
        'Las listas largas se desplazan por dentro y los botones de salir siempre se ven.',
        'La Carrera, el Online y la hoja final del partido, con su versión para el móvil.',
        'Las explicaciones largas se abren con la «i», sin llenar la pantalla de texto.'
      ]
    },
    {
      v: '1.13.2', d: '2026-11-18', t: 'Mensajes en el móvil',
      items: [
        'Los mensajes de la Carrera, ahora como un chat de móvil: una conversación por persona.',
        'En el ordenador salen dentro de un teléfono; en el móvil, a pantalla completa.',
        'Respondes con burbujas de respuesta rápida, como en cualquier chat.'
      ]
    },
    {
      v: '1.13.1', d: '2026-11-18', t: 'Quejas del vestuario',
      items: [
        'Tu vestuario se queja por mensaje: de jugar poco, de otros compañeros o del entreno.',
        'También del partido, del árbitro, del plan del entrenador y hasta del hotel.',
        'Tú decides qué contestas: mediar, animar, dar la razón o no meterte.'
      ]
    },
    {
      v: '1.13.0', d: '2026-11-18', t: 'Carrera con vida',
      items: [
        'Carrera con vida: te escriben agente, entrenador, tu gente, la prensa y el rival.',
        'Muchos mensajes piden respuesta, y ves el efecto antes de elegir.',
        'Redes: la gente comenta tus partidos y puedes publicar una vez por jornada.',
        'Tu semana: elige qué haces en el día libre. Y pactos con el entrenador.',
        'Ruedas de prensa, partidos marcados (Derbi, Revancha, Televisado...) y Figura del mes.',
        'Pestañas nuevas: Gente, Estado, Camino de temporada y Estadísticas.',
        'En Palmarés › Opciones eliges cuánta vida quieres: Poca, Normal o Mucha.'
      ]
    },
    {
      v: '1.12.1', d: '2026-11-18', t: 'Cámara',
      items: [
        'Vuelve la cámara de antes: tranquila, sin ir detrás de cada balón.',
        'Y ya no pierde el balón cuando queda detrás de ti, como tras un bloqueo.'
      ]
    },
    {
      v: '1.12.0', d: '2026-11-18', t: 'Salto con impulso',
      items: [
        'Salto con dirección: salta hacia donde apuntas con el joystick, el stick o las flechas.',
        'Remate con impulso: corre hacia la red, salta hacia delante y el remate sale más fuerte.',
        'Pipes de verdad: despega detrás de la línea de 3 m y salta hacia delante para rematar.',
        'Colocación en salto con diana: llévala donde quieras y el balón va allí (Ajustes, Juego).',
        'Si eres colocador en la Carrera, te avisamos de la diana al entrar.'
      ]
    },
    {
      v: '1.11.0', d: '2026-11-18', t: 'Árbitros de verdad',
      items: [
        'Los jueces de línea llevan la bandera de vóley: roja entera.',
        'La falta de posición la pita el 2º árbitro y señala a los dos jugadores.',
        'Solo el equipo que recibe puede cometer falta de posición, como en el reglamento.',
        'El 1r árbitro sigue el orden real: silbato, quién saca, la falta y el jugador.',
        'Nuevas señas: saque a la red, cambio de campo, sustitución y 5 segundos en la playa.',
        'Cada juez de línea señala solo su línea.'
      ]
    },
    {
      v: '1.10.1', d: '2026-11-17', t: 'Pases, bloqueo y defensa',
      items: [
        '6 contra 6: las recepciones y defensas buenas quedan más cerca de la red.',
        'El colocador de delante ya puede atacar de segunda tras un buen pase.',
        'Bloquear un balón que cruza la red cuenta como bloqueo, nunca como remate.',
        'Defender con el balón lejos del cuerpo sale menos preciso, aunque aciertes el momento.'
      ]
    },
    {
      v: '1.10.0', d: '2026-11-17', t: 'Consignas del entrenador',
      items: [
        'Carrera: en algunos puntos, el entrenador te pide algo antes del saque.',
        'Saca a una zona, remata en diagonal, juega con el central, bloquea la línea…',
        'Si cumples la consigna, tu nota del partido sube un poco.',
        'Se pueden apagar en Ajustes › Juego › Consignas.'
      ]
    },
    {
      v: '1.9.2', d: '2026-11-17', t: 'Falta de posición con los pies',
      items: [
        '6 contra 6: la falta de posición se mira con los pies, como en el reglamento.',
        'Si corres al moverte en el saque, el pie que adelantas también cuenta.'
      ]
    },
    {
      v: '1.9.1', d: '2026-11-17', t: 'Menús nuevos',
      items: [
        'Menús rediseñados de arriba abajo: pintura, pegatinas y parches cosidos de vóley.',
        'Los botones se tiñen con los colores de tu equipación (o de tu club en la Carrera).',
        'Mejor en el móvil: todo cabe, se desplaza por dentro y se puede pulsar bien.'
      ]
    },
    {
      v: '1.9.0', d: '2026-11-17', t: 'Online V2',
      items: [
        'Al crear una sala online eliges la conexión: Precisa o Fluida.',
        'Fluida: tu equipo responde al instante y el rival se ve una pizca en diferido.',
        'Precisa: los dos veis exactamente lo mismo, como hasta ahora.'
      ]
    },
    {
      v: '1.8.2', d: '2026-11-17', t: 'Balones a toda velocidad',
      items: [
        '6 contra 6: la cámara no persigue los balones que salen disparados; se van y punto.'
      ]
    },
    {
      v: '1.8.1', d: '2026-11-17', t: 'Cámara',
      items: [
        '6 contra 6: la cámara sigue mejor al balón y se aleja para no perderlo.',
        'Zoom de cámara: rueda del ratón, teclas + y -, stick derecho o la lupa en el móvil.',
        'Ajustes: elige el zoom de cámara, de 1 (cerca) a 5 (lejos).'
      ]
    },
    {
      v: '1.8.0', d: '2026-11-17', t: 'Pruebas, entrenos y nota en directo',
      items: [
        'Las pruebas de club son un partidillo con petos: un set a 15 y tres objetivos.',
        'Con nota B o mejor te fichan; con C decide la suerte y ganar el partidillo ayuda.',
        'Rivales mejores que tú y la IA un nivel por encima. Simularla da menos opciones.',
        'Clubes mejores te invitan a prueba a mitad y a final de temporada, en playa y en pista.',
        'Ojo: si reinicias o abandonas la prueba, la pierdes.',
        'Nota en directo en los partidos de Carrera: tus buenas acciones suman y las malas restan.',
        'Pista: con muy mala nota vas al banquillo; si destacas saliendo de él, juegas de inicio.',
        'Plan del entrenador: tres sesiones por jornada, jugadas, rápidas o de descanso.',
        'El Rápido te da tu récord jugando, sin llegar al oro. Jugar siempre rinde más.',
        'Nota de cada ejercicio con letra, récord y la barra del atributo subiendo.',
        'Entreno automático para quien solo quiere jugar los partidos.'
      ]
    },
    {
      v: '1.7.0', d: '2026-11-17', t: 'Más datos en la estadística',
      items: [
        'La estadística del 6 contra 6 guarda también alineaciones, cambios y tiempos muertos.'
      ]
    },
    {
      v: '1.6.0', d: '2026-11-17', t: 'Estadística del partido',
      items: [
        'Al acabar un partido, pulsa «Estadística del partido»: los números de los dos equipos.',
        'Side-out, break point, quién iba por delante, mapas de saque y ataque y dónde se falla.',
        'Tabla por jugador con saque, recepción, ataque, bloqueo y defensa, de todo o set a set.'
      ]
    },
    {
      v: '1.5.8', d: '2026-11-17', t: 'Pruebas jugadas',
      items: [
        'Carrera: las pruebas se juegan: un set a 15 contra rivales mejores y la IA un nivel más.',
        'Te fichan por tu nota; ganar el mini partido ayuda un poco. También puedes simularla.',
        'Clubes mejores te invitan a prueba a mitad y a final de temporada, en playa y en pista.'
      ]
    },
    {
      v: '1.5.7', d: '2026-11-17', t: 'Moverte en el saque',
      items: [
        '6 contra 6: muévete en el saque en todos los niveles; si te solapas, falta de posición.',
        'En Fácil y Normal, una marca en el suelo te enseña tu sitio legal mientras sacan.',
        'Los botes ya no dejan marca en el suelo: lo que se discute se mira en el challenge.'
      ]
    },
    {
      v: '1.5.6', d: '2026-11-17', t: 'Beta abierta',
      items: [
        'Make the Cut entra en beta abierta: gracias por probarlo y contarnos qué falla.'
      ]
    },
    {
      v: '1.5.5', d: '2026-11-17', t: 'Arreglos del online',
      items: [
        'Arreglado: con mando no había forma de salir del final de un partido online.',
        'Arreglado: si los dos recargabais a la vez, el partido se quedaba en «Volviendo…».',
        'Arreglado: la hoja final online no cuadraba tras un corte jugado contra la IA.',
        '«Colocación dirigida» de Ajustes también vale en el online.'
      ]
    },
    {
      v: '1.5.4', d: '2026-11-17', t: 'Repeticiones online',
      items: [
        'Online: repetición y «Mejores jugadas» en la hoja final, cada cual desde su lado.',
        'Si quien creó la sala recarga en mitad del partido, vuelve a él y se sigue jugando.',
        '«Crear sala» nueva: ves cómo saldrá tu sala en la lista y eliges los puntos en pabellón.'
      ]
    },
    {
      v: '1.5.3', d: '2026-11-17', t: 'Árbitros',
      items: [
        'Los árbitros hacen las señas oficiales, en el orden del reglamento y a la vista.',
        'El 2º árbitro se mueve al lado del equipo que defiende, como en un partido de verdad.'
      ]
    },
    {
      v: '1.5.2', d: '2026-11-17', t: 'Remates y planchas',
      items: [
        'En 6 contra 6 la CPU remata de verdad: se acabaron los ataques suaves que caían solos.',
        'La plancha alcanza menos y el balón sale peor: salvar un balón tarde ya no es gratis.',
        'Colocador: la rápida y el pipe que pides salen aunque la recepción no sea buena.',
        'Colocador: tu timing se nota en el remate; la perfecta es más difícil de defender.',
        'Colocador: la IA no te deja las recepciones y, si tocas tú primero, puedes pedir la bola.'
      ]
    },
    {
      v: '1.5.1', d: '2026-11-16', t: 'Lobby online',
      items: [
        'Lobby online nuevo: las salas salen como una cartelera, con la sede y el «VS» a la vista.',
        'Con mando, el nombre y el código se escriben con un teclado en pantalla.',
        'Si recargas la página en mitad de un partido online, vuelves a él como invitado.',
        'El récord online solo cuenta partidos en los que las dos partidas cuadran al final.'
      ]
    },
    {
      v: '1.5.0', d: '2026-11-16', t: 'Online (beta)',
      items: [
        'Online (beta): juega 1 contra 1 con otra persona, cada una con su n.º 1 y la IA de pareja.',
        'Lobby con las salas abiertas, o entra con el código que te pase tu rival.',
        'Juegas con tus atributos de la Carrera, o en una sala «Igualado».',
        'Entre sets hay 10 s de pausa; si los dos pulsáis «Continuar», se salta.',
        'Tu rival solo ve tu nombre, con una flecha encima de su jugador.',
        'Termina tu primer partido online y llévate la gorra «Online Beta Tester».'
      ]
    },
    {
      v: '1.4.0', d: '2026-11-16', t: 'Colocar con destino',
      items: [
        'Colocar: con la dirección eliges el destino, y lo ves en el suelo antes del toque.',
        'Sin dirección, alta a la 4. Cerca de ti sale rápida; lejos, alta.',
        'La calidad depende de tu timing y de tu Colocación.',
        'Con ratón: clic para golpear, clic derecho para colocar y la rueda para saltar.'
      ]
    },
    {
      v: '1.3.3', d: '2026-11-16', t: 'Jueces de línea',
      items: [
        'Cuatro jueces de línea en las grandes competiciones y ninguno en las categorías de abajo.'
      ]
    },
    {
      v: '1.3.2', d: '2026-11-16', t: 'Reto del día al entrar',
      items: [
        'El reto del día te espera nada más abrir el juego (una vez al día).',
        'Carrera: los partidos dan menos experiencia; con los entrenamientos se subía demasiado.'
      ]
    },
    {
      v: '1.3.1', d: '2026-11-15', t: 'Borrar carrera',
      items: [
        'Borra tu Carrera de playa o de pista desde Ajustes › Info.'
      ]
    },
    {
      v: '1.3.0', d: '2026-11-15', t: 'Tu carrera, tus partidos',
      items: [
        'Carrera con el retrato de tu jugador, escudos de los clubes y vitrina de trofeos.',
        'La Carrera en la portada: sigue donde lo dejaste.',
        'Previa y resumen de jornada como en la tele.',
        'Repeticiones de los puntos de set y de partido, y las mejores jugadas al final.',
        'Jefes del circuito y química de pareja en la Carrera de playa.',
        'Retos de maestría y un reto del día nuevo cada día.',
        'Nivel de perfil y álbum con todo lo que has conseguido.'
      ]
    },
    {
      v: '1.2.0', d: '2026-11-15', t: 'Sedes de club',
      items: [
        'Cada club de las 28 ligas tiene su pabellón y cada club de playa, su playa.',
        'En la Carrera se juega en casa del local; las finales, en las grandes sedes.',
        'Partido rápido: un pabellón distinto en cada partido, o el que elijas.'
      ]
    },
    {
      v: '1.1.2', d: '2026-11-15', t: 'Dificultad en la pista',
      items: [
        'La Carrera de pista ya tiene dificultad: Fácil, Normal, Difícil o Experto.',
        'Elígela al crear la Carrera y cámbiala entre partidos en Palmarés › Opciones.',
        'Cada título guarda la dificultad más fácil de su temporada.'
      ]
    },
    {
      v: '1.1.1', d: '2026-11-15', t: 'Cuentas con correo',
      items: [
        'Crea tu cuenta con tu correo y recupera la contraseña si la olvidas.',
        'Entrar con Google (en cuanto esté activado).',
        'Tu Vestuario también se guarda en tu cuenta.'
      ]
    },
    {
      v: '1.1.0', d: '2026-11-13', t: 'Vestuario',
      items: [
        'Nuevo Vestuario: peinados, gorras, gafas, manguitos, rodilleras y mucho más.',
        'Cada jugador con su aspecto en pista y otro en playa.',
        'Se gana en la Carrera, en el Entrenamiento y en la tienda.',
        'Solo estética: nada cambia cómo juega tu atleta.'
      ]
    },
    {
      v: '1.0.1', d: '2026-11-12', t: 'Arreglos de línea y marcador',
      items: [
        'Arreglado: el challenge da dentro si cualquier parte del balón toca la línea.',
        'Marcador más discreto mientras se juega el punto.',
        'Playa: colocar de dedos a destiempo puede costar dobles.'
      ]
    },
    {
      v: '1.0.0', d: '2026-11-12', t: 'Juego completo',
      items: [
        'Entrenamiento: 5 ejercicios con medallas y peloteo libre.',
        'Carrera de pista 6 contra 6 con ligas de 28 países.',
        'Interfaz nueva con grafismo de tele deportiva.',
        'Teclas y botones reasignables, y más ajustes de cámara e imagen.',
        'Faro, tu mentor, y noticias y fichas de clubes en la Carrera.',
        'Finta, golpe colocado y colocación dirigida para quien quiera más.',
        'Fama, patrocinadores, decisiones y un rival personal en la Carrera.',
        'Premios de temporada, 28 logros y el Salón de la Fama al retirarte.',
        '6 contra 6: juega de receptor, colocador, opuesto o central.',
        'Bloqueo activo: salta y pulsa GOLPEAR justo cuando remata el rival.',
        'Vóley playa en Platja Llarga, con luz de día o de tarde.',
        'Personajes y logotipo nuevos.',
        'Cuentas: guarda tu progreso y sigue en otro dispositivo.'
      ]
    }
  ];

  var MIT_THREE = 'The MIT License\n\n' +
    'Copyright © 2010-2023 Three.js Authors\n\n' +
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated ' +
    'documentation files (the "Software"), to deal in the Software without restriction, including without limitation the ' +
    'rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit ' +
    'persons to whom the Software is furnished to do so, subject to the following conditions:\n\n' +
    'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the ' +
    'Software.\n\n' +
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE ' +
    'WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR ' +
    'COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR ' +
    'OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';

  var OFL = 'Barlow y Barlow Condensed: Copyright 2017 The Barlow Project Authors (github.com/jpt/barlow).\n' +
    'Titan One: Copyright 2011 Rodrigo Fuenzalida. Bowlby One: Copyright 2011 Vernon Adams. ' +
    'Rubik: Copyright 2015 The Rubik Project Authors.\n\n' +
    'Se distribuyen con la SIL Open Font License, versión 1.1. Se pueden usar, estudiar, modificar y redistribuir ' +
    'libremente, también dentro de otro software, siempre que no se vendan solas y que las versiones modificadas no usen ' +
    'el nombre reservado de la fuente.\n\n' +
    'Texto completo de la licencia: openfontlicense.org';

  /** Créditos. by: solo el nombre (sin apellidos ni correo). tools: líneas de «Hecho con». */
  VB.CREDITS = {
    by: 'Ferran',
    tools: [
      'three.js r149 (motor 3D, licencia MIT)',
      'Sonido y gráficos generados por código, sin grabaciones',
      'Guardado en la nube con Firebase'
    ],
    fonts: 'Titan One (Rodrigo Fuenzalida), Bowlby One (Vernon Adams), Rubik (The Rubik Project Authors) y Barlow (The Barlow ' +
      'Project Authors), todas con la SIL Open Font License 1.1. ' +
      'El logotipo usa sus letras pasadas a trazos.',
    licenses: {
      three: MIT_THREE,   // año comprobado en la cabecera de three.min.js 0.149.0 (cdnjs): «Copyright 2010-2023 Three.js Authors»
      threeLine: 'three.js: Copyright © 2010-2023 Three.js Authors. Licencia MIT.',
      ofl: OFL
    },
    note: 'Clubes, jugadores y patrocinadores son inventados. Cualquier parecido es casualidad.'
  };
})();
