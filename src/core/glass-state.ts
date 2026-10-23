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
  /** Esmerilado: cuánto se ve desplazado el nivel en esta ronda (altura relativa; 0 = nada). */
  readonly illusion: number = 0;

  constructor(readonly vessel: Vessel, readonly liquid: Liquid, rng: Rng, cfg: Config) {
    this.margin = liquid.meniscus * (1 + cfg.meniscusVariance * rng.signed());
    this.limit = vessel.heightToVolume(1 + this.margin);
    // Solo se sortea en el esmerilado, para no cambiar las partidas de los demás vasos.
    if (vessel.frosted) {
      const { maxOffset, minShare } = cfg.frosted;
      const r = rng.signed();
      this.illusion = Math.sign(r || 1) * maxOffset * (minShare + (1 - minShare) * Math.abs(r));
    }
  }

  /** Lo que se ve de una altura real: en el esmerilado, desplazada (desde el 30 % del vaso, para
   * que el fondo no flote ni se hunda). */
  shown(h: number) {
    if (!this.illusion || h <= 0) return h;
    return Math.max(0.005, h + this.illusion * Math.min(1, h / 0.3));
  }

  /** Alturas tal como se ven (para dibujar). */
  get shownHeight() {
    return this.shown(this.height);
  }
  get shownLiquidHeight() {
    return this.shown(this.liquidHeight);
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

  /** Se escapa líquido por un agujero (en vasos rectos), sin bajar del volumen `floor` (de este
   * vaso). Devuelve lo que se ha escapado, en vasos rectos. */
  leak(v: number, floor: number) {
    const sale = Math.max(0, Math.min(v / this.vessel.capacity, this.volume - floor));
    this.volume -= sale;
    return sale * this.vessel.capacity;
  }

  /** La espuma se asienta. */
  step(dt: number) {
    if (this.foam > 0) this.foam = settleFoam(this.foam, this.liquid.foamDecay, dt);
  }
}
