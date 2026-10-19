// Aleatorio con semilla (mulberry32). Toda la lógica usa esto, nunca Math.random: así una
// partida se puede repetir y los tests son deterministas.

export interface Rng {
  /** Número en [0, 1). */
  next(): number;
  /** Número en [−1, 1). */
  signed(): number;
  /** Índice elegido según los pesos. */
  weighted(weights: readonly number[]): number;
  /** Copia barajada. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    signed: () => next() * 2 - 1,
    weighted(weights) {
      const total = weights.reduce((s, w) => s + w, 0);
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
