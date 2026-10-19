// Todos los textos del juego. Nada de cadenas sueltas en el código: así se traduce añadiendo
// un fichero hermano (en.ts) con las mismas claves.
export const es = {
  titulo: 'La Última Gota',
  lema: 'Entre todos llenáis un vaso. Quien lo desborda, pierde.',
  version: (v: string) => `v${v}`,

  jugadores: 'Jugadores',
  jugadorN: (n: number) => `Jugador ${n}`,
  anadirJugador: '+ Añadir jugador',
  quitarJugador: 'Quitar',
  empezar: 'Empezar',
  vaso: 'Vaso',
  liquido: 'Líquido',
  vasos: { cilindro: 'Recto', copa: 'Copa', botella: 'Botella', aleatorio: '🎲' },
  liquidos: { agua: 'Agua', aceite: 'Aceite', cerveza: 'Cerveza', aleatorio: '🎲' },
  cambiarCadaRonda: 'Sortear de nuevo en cada ronda (lo que esté en 🎲)',
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
  verGanador: 'Ver ganador',
  gana: (nombre: string) => `¡Gana ${nombre}!`,
  revancha: 'Revancha',
  cambiarJugadores: 'Cambiar jugadores',
};

export type Textos = typeof es;
