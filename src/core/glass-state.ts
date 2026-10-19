import type { Config } from './config';
import type { Liquid } from './liquids';
import type { Rng } from './rng';
import type { Vessel } from './vessels';

// El vaso de una ronda: cuánto lleva, hasta dónde aguanta el menisco y si ha desbordado.

export class Glass {
  volume = 0;
  overflowed = false;
  /** Margen del menisco de esta ronda (oculto al jugador): base ± variación. */
  readonly margin: number;

  constructor(readonly vessel: Vessel, readonly liquid: Liquid, rng: Rng, cfg: Config) {
    this.margin = liquid.meniscus * (1 + cfg.meniscusVariance * rng.signed());
  }

  /** Volumen máximo antes de desbordar. */
  get limit() {
    return 1 + this.margin;
  }

  /** Altura del líquido: 1 es el borde; por encima, el menisco abombado. */
  get height() {
    return this.vessel.volumeToHeight(this.volume);
  }

  /** De 0 a 1, lo cerca que está de desbordar (para la vibración de cercanía, fase 6). */
  get danger() {
    return Math.min(1, this.volume / this.limit);
  }

  /** Lo que pase del límite se derrama: el vaso se queda en el límite. */
  add(v: number) {
    if (v <= 0) return;
    this.volume += v;
    if (this.volume > this.limit) {
      this.overflowed = true;
      this.volume = this.limit;
    }
  }
}
