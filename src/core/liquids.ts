import { config } from './config';

// Fase 1: solo agua. Aceite y cerveza (con espuma) llegan en la fase 5.
export type LiquidId = keyof typeof config.liquids;

export interface Liquid {
  id: LiquidId;
  /** Multiplica el caudal máximo (el aceite, más lento). */
  flowMul: number;
  /** Segundos de caudal que siguen cayendo al soltar. */
  inertia: number;
  /** Cuánto aguanta por encima del borde, en volumen relativo, antes de la variación oculta. */
  meniscus: number;
}

/** Vista viva de los parámetros: si el modo depuración cambia config, se nota al momento
 * (el margen del menisco, en la ronda siguiente, porque se sortea al empezarla). */
export function getLiquid(id: LiquidId): Liquid {
  const p = config.liquids[id];
  return {
    id,
    get flowMul() { return p.flowMul; },
    get inertia() { return p.inertia; },
    get meniscus() { return p.meniscus; },
  };
}
