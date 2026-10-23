import type { Config } from './config';
import { settleFoam } from './foam';
import type { Liquid } from './liquids';
import type { Rng } from './rng';
import type { Vessel } from './vessels';

// El vaso de una ronda: cuánto lleva (líquido y espuma), hasta dónde aguanta el menisco y si
// ha desbordado.

export class Glass {
  /** Volumen de líquido (1 = lleno hasta el borde). */
  volume = 0;
  /** Volumen de espuma, encima del líquido. */
  foam = 0;
  overflowed = false;
  /** Margen del menisco de esta ronda (oculto al jugador), en altura: base ± variación. */
  readonly margin: number;
  /** Volumen total (líquido + espuma) a partir del que desborda. */
  readonly limit: number;

  constructor(readonly vessel: Vessel, readonly liquid: Liquid, rng: Rng, cfg: Config) {
    this.margin = liquid.meniscus * (1 + cfg.meniscusVariance * rng.signed());
    this.limit = vessel.heightToVolume(1 + this.margin);
  }

  get total() {
    return this.volume + this.foam;
  }

  /** Altura de lo más alto (líquido + espuma): 1 es el borde; por encima, el menisco. */
  get height() {
    return this.vessel.volumeToHeight(this.total);
  }

  /** Altura solo del líquido. */
  get liquidHeight() {
    return this.vessel.volumeToHeight(this.volume);
  }

  /** De 0 a 1, lo cerca que está de desbordar (para la vibración de cercanía, fase 6). */
  get danger() {
    return Math.min(1, this.total / this.limit);
  }

  /** Lo que pase del límite se derrama: el vaso se queda en el límite. `v` y `foam` van en
   * vasos rectos; se pasan a este vaso con su capacidad. */
  add(v: number, foam = 0) {
    if (v <= 0 && foam <= 0) return;
    this.volume += v / this.vessel.capacity;
    this.foam += foam / this.vessel.capacity;
    if (this.total > this.limit) {
      this.overflowed = true;
      const extra = this.total - this.limit;
      const fromFoam = Math.min(this.foam, extra);
      this.foam -= fromFoam;
      this.volume -= extra - fromFoam;
    }
  }

  /** La espuma se asienta. */
  step(dt: number) {
    if (this.foam > 0) this.foam = settleFoam(this.foam, this.liquid.foamDecay, dt);
  }
}
