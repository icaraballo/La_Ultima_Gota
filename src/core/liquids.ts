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

export function getLiquid(id: LiquidId): Liquid {
  return { id, ...config.liquids[id] };
}
