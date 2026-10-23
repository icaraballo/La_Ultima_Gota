// Todos los textos del juego. Nada de cadenas sueltas en el código: así se traduce añadiendo
// un fichero hermano (en.ts) con las mismas claves.

// Hoja ⓘ (§5.4 del diseño, textos aprobados el 19-10-2026). Sin números. Si cambian los valores
// de un vaso o un líquido en config.ts, revisar que sigan siendo ciertos.
const infoVasos = {
  cilindro: { texto: 'Sube siempre al mismo ritmo, del fondo al borde. Lo que ves es lo que hay.', nota: 'El vaso para aprender.' },
  copa: { texto: 'Estrecha abajo y ancha arriba. Al principio sube muy rápido; arriba parece que no sube nada.', nota: 'Cuidado: arriba la gente se confía y suelta chorros largos.' },
  botella: { texto: 'Cuerpo ancho y cuello estrecho. Tarda muchísimo en subir, pero en el cuello cada gota se nota y casi no aguanta abombado.', nota: 'Cuidado: el cuello.' },
  // v0.8.0: propuestos el 23-10-2026, pendientes de revisar jugando.
  pecera: { texto: 'Panza ancha y boca estrecha. A medio llenar parece que falta muchísimo; en la boca, cada toque sube un montón.', nota: 'Cuidado: la boca.' },
  tarta: { texto: 'Tres pisos, cada uno más estrecho que el de abajo. Al pasar de piso, lo mismo sube el doble de rápido, y el último se llena en nada.', nota: 'Cuidado: el salto de piso.' },
  chupito: { texto: 'Pequeño y bajo: se llena en una o dos vueltas.', nota: 'Para una rápida.' },
  // v0.10.0: propuesto el 23-10-2026, pendiente de revisar jugando.
  // v0.11.0: propuesto el 23-10-2026, pendiente de revisar jugando.
  esmerilado: { texto: 'Cristal grueso que deforma. El nivel no está donde parece, y cada ronda engaña distinto.', nota: 'No te fíes de lo que ves.' },
  fuga: { texto: 'Tiene un agujero a media altura. Mientras os pasáis el móvil se va escapando un poco, hasta el agujero. Las canicas pequeñas y alguna moneda también se cuelan.', nota: 'Tardar en pasarlo ayuda al siguiente.' },
};
const infoLiquidos = {
  agua: { texto: 'La de referencia. Corta casi en seco al soltar y se abomba un poco sobre el borde antes de rebosar.', nota: '' },
  aceite: { texto: 'Sale más despacio, pero es espeso y al soltar sigue cayendo un buen rato. Casi no se abomba: desborda en cuanto pasa del borde.', nota: 'Cuidado: suelta antes de lo que crees.' },
  // v0.9.0: propuesto el 23-10-2026, pendiente de revisar jugando.
  leche: { texto: 'Sube sola durante tu turno, desde «¡Listo!» hasta que sueltas, y cada turno un poco más rápido porque se va calentando.', nota: 'Cuidado: dudar también llena.' },
  cerveza: { texto: 'A chorro hace mucha espuma, y la espuma también desborda. Se asienta en unos segundos, y el siguiente la ve bajar. Las gotas casi no hacen espuma.', nota: 'Cuidado: un chorro fuerte, aunque quede hueco.' },
};
// Canicas y monedas (v0.7.0): textos propuestos, pendientes de que Iñigo los apruebe.
const infoSolidos = {
  canicas: { texto: 'El vaso empieza vacío y se echan canicas: un toque, una; mantener, un puñado. Son de tamaños distintos, así que unas veces caben más y otras menos. Ruedan: arriba se escapan.', nota: 'Pierde quien hace caer una fuera del vaso.' },
  monedas: { texto: 'Las ocho monedas de euro, a su tamaño. Se quedan cruzadas, dejan huecos y el montón se vuelve inestable, como una torre de bloques.', nota: 'Cuidado: un puñado puede tirar las de arriba.' },
};

export const es = {
  titulo: 'La Última Gota',
  lema: 'Entre todos llenáis un vaso. Quien lo desborda, pierde.',
  version: (v: string) => `v${v}`,
  /** El botón dice el modo al que pasas. */
  modoNoche: 'Modo noche',
  modoDia: 'Modo día',

  jugadores: 'Jugadores',
  jugadorN: (n: number) => `Jugador ${n}`,
  anadirJugador: '+ Añadir jugador',
  quitarJugador: 'Quitar',
  empezar: 'Empezar',
  vaso: 'Vaso',
  liquido: 'Qué se echa',
  vasoYContenido: 'Vaso y qué se echa',
  azarTexto: 'Se sortea al empezar la partida.',
  vasos: { cilindro: 'Recto', copa: 'Copa', botella: 'Botella', pecera: 'Pecera', tarta: 'Tarta', chupito: 'Chupito', fuga: 'Con fuga', esmerilado: 'Esmerilado', aleatorio: 'Azar' },
  liquidos: { agua: 'Agua', aceite: 'Aceite', cerveza: 'Cerveza', leche: 'Leche al fuego', canicas: 'Canicas', monedas: 'Monedas', aleatorio: 'Azar' },
  vasoAzar: 'Vaso al azar',
  liquidoAzar: 'Qué se echa, al azar',
  empezarAleatorio: 'Empezar en orden aleatorio',
  tiempoPorTurno: 'Tiempo por turno',
  segundos: (n: number) => `${n} s`,
  segundosParaEchar: (n: number) => `Quedan ${n} segundos para echar`,
  combinacion: (liquido: string, vaso: string) => `${liquido} · ${vaso}`,

  turnoDe: (nombre: string) => `Turno de ${nombre}`,
  pasaElMovil: 'Pásale el móvil',
  listo: '¡Listo!',
  despues: (nombre: string) => `Después: ${nombre}`,
  zonaEchar: 'Toca: gota · Mantén: chorro',
  zonaPiezas: 'Toca: una · Mantén: un puñado',
  cayendo: '…',

  eliminado: (nombre: string) => `${nombre} ha dejado caer la última gota`,
  eliminadoPieza: (nombre: string, pieza: 'canicas' | 'monedas') =>
    `${nombre} ha echado la última ${pieza === 'canicas' ? 'canica' : 'moneda'}`,
  quedan: (n: number) => `Quedan ${n}`,
  siguienteRonda: 'Siguiente ronda',
  combinacionAleatoria: 'Vaso y líquido aleatorios',
  verGanador: 'Ver ganador',
  gana: (nombre: string) => `¡Gana ${nombre}!`,
  revancha: 'Revancha',
  // Resumen del final (§7.2). Sin números: solo quién.
  resumenTitulo: 'La partida en datos',
  statGeneroso: 'Más generoso',
  statGenerosoTexto: 'Quien más echaba en cada turno',
  statRata: 'Más rata',
  statRataTexto: 'Quien menos echaba',
  statLimite: 'Al límite',
  statLimiteTexto: 'Dejó el vaso más a punto de rebosar y se salvó',
  statIndeciso: 'Más indeciso',
  statIndecisoTexto: 'Quien más tardaba en empezar a echar',
  cambiarJugadores: 'Cambiar jugadores',

  info: 'Vasos y líquidos',
  cerrar: 'Cerrar',
  vasosTitulo: 'Vasos',
  liquidosTitulo: 'Líquidos',
  solidosTitulo: 'Canicas y monedas',
  infoVasos,
  infoLiquidos,
  infoSolidos,
  infoPie: 'El vaso aguanta un poco por encima del borde… pero nunca exactamente lo mismo.',

  // Opinar y Privacidad (v0.7.3). Las preguntas son las del formulario de Google, en su orden
  // (los `entry`, en ui/opinion.ts). La privacidad dice lo mismo que el README: si cambia qué se
  // guarda o qué se envía, cambiar los dos (lo vigila tests/ui.test.ts).
  opinar: 'Opinar',
  opinionTitulo: '¿Qué te parece?',
  opinionPreguntas: [
    { texto: '¿Qué te ha gustado?', largo: true },
    { texto: '¿Qué te ha confundido o te ha sobrado?', largo: true },
    { texto: '¿Has encontrado algo raro o «roto»?', largo: true },
    { texto: 'Cuéntame lo que quieras', ayuda: 'Ideas, quejas, lo que se te ocurra', largo: true },
    { texto: 'Tu nombre', ayuda: 'Opcional, si quieres que te responda', largo: false },
    { texto: 'Correo u otro contacto', ayuda: 'Opcional', largo: false },
  ] as { texto: string; ayuda?: string; largo: boolean }[],
  enviar: 'Enviar',
  enviando: 'Enviando…',
  opinionVacia: 'Escribe algo en alguna pregunta antes de enviar.',
  opinionSinRed: 'No se ha podido enviar: parece que no hay conexión. Lo escrito sigue aquí; inténtalo en un rato.',
  opinionPrivacidad: 'Se envía a un formulario de Google con la versión y la partida. Nombre y contacto, solo si los pones.',
  gracias: '¡Gracias!',
  graciasTexto: 'Lo leo todo. Tu opinión ayuda a que el juego mejore.',
  volverAlJuego: 'Volver al juego',
  privacidad: 'Privacidad',
  entendido: 'Entendido',
  privacidadTexto: [
    'La Última Gota <b>no tiene servidor, ni cuentas, ni analítica, ni cookies</b>.',
    'Guarda en este navegador los nombres de la última partida y el tema elegido. <b>Nada de eso sale de tu móvil</b>; si borras los datos del sitio, se borran.',
    'Si mandas una opinión, va a un <b>formulario de Google</b> con la versión del juego y la partida (vaso, qué se echa y cuántos jugáis). Tu nombre y tu contacto, solo si los escribes.',
    'GitHub, que aloja la página, y Google, si opinas, <b>ven tu dirección IP</b>, como cualquier web.',
  ],
};

export type Textos = typeof es;
