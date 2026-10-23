import { config } from './config';

export type LiquidId = keyof typeof config.liquids;
export const LIQUID_IDS = Object.keys(config.liquids) as LiquidId[];

export interface Liquid {
  id: LiquidId;
  /** Multiplica el caudal máximo (el aceite, más lento). */
  flowMul: number;
  /** Segundos de caudal que siguen cayendo al soltar. */
  inertia: number;
  /** Cuánto se abomba sobre el borde (altura relativa), antes de la variación oculta. */
  meniscus: number;
  /** Espuma por volumen echado a caudal máximo (0 = no hace espuma). */
  foamPerFlow: number;
  /** Ritmo al que se asienta la espuma (1/s). */
  foamDecay: number;
  /** Lo que sube sola por segundo durante el turno (leche al fuego; 0 = nada). */
  rise: number;
  /** Cuánto más rápido sube en cada turno de la ronda (0,15 = +15 %). */
  riseGrow: number;
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
    get foamPerFlow() { return p.foamPerFlow; },
    get foamDecay() { return p.foamDecay; },
    get rise() { return p.rise; },
    get riseGrow() { return p.riseGrow; },
  };
}
