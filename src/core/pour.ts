import type { Config } from './config';
import type { Liquid } from './liquids';
import type { Rng } from './rng';

// El grifo: gotas, chorro con arranque, fluctuación e inercia, y lo que está en el aire.
// No sabe nada del vaso: cada paso devuelve el volumen que ha llegado abajo.

export interface Parcel {
  kind: 'drop' | 'stream';
  volume: number;
  /** Espuma que hará al llegar (solo líquidos con espuma). */
  foam: number;
  /** Cuándo salió del grifo y cuándo llega al vaso (s, reloj del grifo). */
  emitted: number;
  arrival: number;
}

/** Ruido suave en [−1, 1]: valores al azar en puntos fijos, unidos con curva suave. */
class SmoothNoise {
  private knots: number[] = [];
  constructor(private rng: Rng) {}
  at(x: number): number {
    const i = Math.floor(x);
    while (this.knots.length <= i + 1) this.knots.push(this.rng.signed());
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return this.knots[i] + (this.knots[i + 1] - this.knots[i]) * s;
  }
}

export class Faucet {
  time = 0;
  /** Caudal que sale ahora mismo del grifo (volumen/s). */
  flow = 0;
  /** Lo que ha salido y aún no ha llegado al vaso. */
  readonly inAir: Parcel[] = [];
  /** Espuma que llegó en el último paso. */
  arrivedFoam = 0;
  private open = false;
  private openedAt = 0;
  private pendingDrops: { at: number; volume: number }[] = [];
  private noise: SmoothNoise;

  constructor(private liquid: Liquid, private rng: Rng, private cfg: Config) {
    this.noise = new SmoothNoise(rng);
  }

  /** Un toque: 1, 2 o 3 gotas de volumen variable, una tras otra. Devuelve cuántas. */
  tap(): number {
    const { cfg, rng } = this;
    const count = rng.weighted(cfg.dropCountWeights) + 1;
    for (let i = 0; i < count; i++) {
      const volume = cfg.dropVolume * (1 + cfg.dropVariance * rng.signed());
      this.pendingDrops.push({ at: this.time + i * cfg.dropInterval, volume });
    }
    return count;
  }

  /** Empieza el chorro (al pasar del umbral de toque). Abre con el goteo de un toque: así
   * mantener pulsado nunca echa menos que tocar (si no, un chorro de 0,2 s era la jugada más
   * segura, diez veces más pequeña que una gota, y la ronda no acababa nunca). */
  startStream() {
    this.open = true;
    this.openedAt = this.time;
    this.tap();
  }

  /** Suelta: el caudal no corta en seco, se apaga con la inercia del líquido. */
  stopStream() {
    this.open = false;
  }

  get streaming() {
    return this.open;
  }

  /** Nada saliendo, nada pendiente y nada en el aire. */
  get quiet() {
    return !this.open && this.flow === 0 && this.pendingDrops.length === 0 && this.inAir.length === 0;
  }

  /** Avanza dt segundos. Devuelve el volumen que ha llegado al vaso en este paso. */
  step(dt: number): number {
    const { cfg, liquid } = this;
    this.time += dt;

    if (this.open) {
      const ramp = 1 - Math.exp(-(this.time - this.openedAt) / cfg.flowRampTau);
      const wobble = 1 + cfg.flowNoise * this.noise.at(this.time * cfg.flowNoiseRate);
      this.flow = cfg.flowMax * liquid.flowMul * ramp * wobble;
    } else if (this.flow > 0) {
      // Decae con τ = inercia: en total cae caudalAlSoltar × inercia, como pide §4.3.
      this.flow *= Math.exp(-dt / liquid.inertia);
      if (this.flow < cfg.flowCutoff) this.flow = 0;
    }
    if (this.flow > 0) {
      // Cuanto más fuerte el chorro, más espuma por volumen.
      const volume = this.flow * dt;
      const foam = volume * liquid.foamPerFlow * (this.flow / cfg.flowMax);
      this.inAir.push({ kind: 'stream', volume, foam, emitted: this.time, arrival: this.time + cfg.fallTime });
    }

    while (this.pendingDrops.length && this.pendingDrops[0].at <= this.time) {
      const d = this.pendingDrops.shift()!;
      const foam = d.volume * liquid.foamPerFlow * 0.05;
      this.inAir.push({ kind: 'drop', volume: d.volume, foam, emitted: this.time, arrival: this.time + cfg.fallTime });
    }

    let arrived = 0;
    this.arrivedFoam = 0;
    while (this.inAir.length && this.inAir[0].arrival <= this.time) {
      const p = this.inAir.shift()!;
      arrived += p.volume;
      this.arrivedFoam += p.foam;
    }
    return arrived;
  }
}
