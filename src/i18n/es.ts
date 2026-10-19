// Todos los textos del juego. Nada de cadenas sueltas en el código: así se traduce añadiendo
// un fichero hermano (en.ts) con las mismas claves.
export const es = {
  titulo: 'La Última Gota',
  version: (v: string) => `v${v}`,
};

export type Textos = typeof es;
