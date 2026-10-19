// Todos los textos del juego. Nada de cadenas sueltas en el código: así se traduce añadiendo
// un fichero hermano (en.ts) con las mismas claves.

// Hoja ⓘ (§5.4 del diseño, textos aprobados el 19-10-2026). Sin números. Si cambian los valores
// de un vaso o un líquido en config.ts, revisar que sigan siendo ciertos.
const infoVasos = {
  cilindro: { texto: 'Sube siempre al mismo ritmo, del fondo al borde. Lo que ves es lo que hay.', nota: 'El vaso para aprender.' },
  copa: { texto: 'Estrecha abajo y ancha arriba. Al principio sube muy rápido; arriba parece que no sube nada.', nota: 'Cuidado: arriba la gente se confía y suelta chorros largos.' },
  botella: { texto: 'Cuerpo ancho y cuello estrecho. Tarda muchísimo en subir, pero en el cuello cada gota se nota y casi no aguanta abombado.', nota: 'Cuidado: el cuello.' },
};
const infoLiquidos = {
  agua: { texto: 'La de referencia. Corta casi en seco al soltar y se abomba un poco sobre el borde antes de rebosar.', nota: '' },
  aceite: { texto: 'Sale más despacio, pero es espeso y al soltar sigue cayendo un buen rato. Casi no se abomba: desborda en cuanto pasa del borde.', nota: 'Cuidado: suelta antes de lo que crees.' },
  cerveza: { texto: 'A chorro hace mucha espuma, y la espuma también desborda. Se asienta en unos segundos, y el siguiente la ve bajar. Las gotas casi no hacen espuma.', nota: 'Cuidado: un chorro fuerte, aunque quede hueco.' },
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
  liquido: 'Líquido',
  vasos: { cilindro: 'Recto', copa: 'Copa', botella: 'Botella', aleatorio: 'Azar' },
  liquidos: { agua: 'Agua', aceite: 'Aceite', cerveza: 'Cerveza', aleatorio: 'Azar' },
  vasoAzar: 'Vaso al azar',
  liquidoAzar: 'Líquido al azar',
  empezarAleatorio: 'Empezar en orden aleatorio',
  combinacion: (liquido: string, vaso: string) => `${liquido} · ${vaso}`,

  turnoDe: (nombre: string) => `Turno de ${nombre}`,
  pasaElMovil: 'Pásale el móvil',
  listo: '¡Listo!',
  despues: (nombre: string) => `Después: ${nombre}`,
  zonaEchar: 'Toca: gota · Mantén: chorro',
  cayendo: '…',

  eliminado: (nombre: string) => `${nombre} ha dejado caer la última gota`,
  quedan: (n: number) => `Quedan ${n}`,
  siguienteRonda: 'Siguiente ronda',
  combinacionAleatoria: 'Vaso y líquido aleatorios',
  verGanador: 'Ver ganador',
  gana: (nombre: string) => `¡Gana ${nombre}!`,
  revancha: 'Revancha',
  cambiarJugadores: 'Cambiar jugadores',

  info: 'Vasos y líquidos',
  cerrar: 'Cerrar',
  vasosTitulo: 'Vasos',
  liquidosTitulo: 'Líquidos',
  infoVasos,
  infoLiquidos,
  infoPie: 'El vaso aguanta un poco por encima del borde… pero nunca exactamente lo mismo.',
};

export type Textos = typeof es;
