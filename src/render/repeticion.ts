import type { Game } from '../core/game';
import { Glass } from '../core/glass-state';
import type { Parcel } from '../core/pour';
import type { Piece } from '../core/solids';

// Repetición a cámara lenta del desborde (UG-DESIGN §7.1). Mientras se echa, se guarda en cada
// paso de lógica lo que el dibujo lee de la partida (vaso, lo que está en el aire, las piezas);
// al desbordar se sigue grabando un poco y luego se reproduce despacio con un «doble» de la
// partida que los dibujos aceptan como si fuera la de verdad. Sin DOM: se prueba en Node.

/** Lo que se ve en un paso. */
interface Foto {
  volume: number;
  foam: number;
  /** El del vaso de líquido (con piezas, siempre false: el desborde es la pieza fuera). */
  overflowed: boolean;
  time: number;
  flow: number;
  inAir: Parcel[];
  pieces: Piece[] | null;
  out: number;
  pressing: boolean;
  leaking: boolean;
}

/** Segundos que se repiten antes y después del desborde, y a qué velocidad. */
export const REPETICION = { antes: 1.5, despues: 1.0, velocidad: 0.35 };

export class Grabadora {
  private fotos: Foto[] = [];
  /** Índice de la foto del desborde, o null si aún no ha desbordado. */
  private desborde: number | null = null;
  private glass: Glass | null = null;

  constructor(private dt: number) {}

  /** Turno nuevo: se olvida lo anterior (entre turnos el móvil cambia de mano). */
  reset() {
    this.fotos = [];
    this.desborde = null;
    this.glass = null;
  }

  /** Lista para reproducir: ya se ha grabado lo de después del desborde. */
  get lista(): boolean {
    return this.desborde !== null && this.fotos.length - 1 - this.desborde >= REPETICION.despues / this.dt;
  }

  /** Duración de la repetición en tiempo real (s). */
  get duracion(): number {
    return this.fotos.length * this.dt / REPETICION.velocidad;
  }

  /** Guarda el paso actual. Hay que llamarlo tras cada step() mientras se echa o se desborda. */
  grabar(g: Game) {
    if (this.lista) return;
    if (this.glass !== g.glass) {
      this.reset();
      this.glass = g.glass;
    }
    const { glass, faucet, pile } = g;
    this.fotos.push({
      volume: glass.volume, foam: glass.foam, overflowed: glass.overflowed,
      time: faucet.time, flow: faucet.flow, inAir: [...faucet.inAir],
      pieces: pile ? pile.pieces.map(p => ({ ...p })) : null,
      out: pile?.out ? pile.pieces.indexOf(pile.out) : -1,
      pressing: g.pressing, leaking: g.leaking,
    });
    if (this.desborde === null && g.overflowed) {
      this.desborde = this.fotos.length - 1;
      // Solo hace falta lo de justo antes.
      const sobra = this.desborde - Math.round(REPETICION.antes / this.dt);
      if (sobra > 0) {
        this.fotos.splice(0, sobra);
        this.desborde -= sobra;
      }
    }
  }

  /** Un doble de la partida para dibujar el instante `t` (s de tiempo real desde que empieza la
   * repetición). Pasado el final, se queda en la última foto. Cada repetición crea su vaso: así
   * los dibujos ven «otra ronda» y reinician el derrame y las salpicaduras. */
  reproductor(g: Game): (t: number) => Game {
    const glass: Glass = Object.create(Glass.prototype);
    Object.assign(glass, this.glass ?? g.glass);
    const faucet = { time: 0, flow: 0, inAir: [] as Parcel[] };
    const pile = g.pile ? { pieces: [] as Piece[], out: null as Piece | null } : null;
    const doble = { glass, faucet, pile, contentId: g.contentId, vesselId: g.vesselId, pressing: false, leaking: false };
    const fotos = this.fotos;
    return t => {
      const f = fotos[Math.min(fotos.length - 1, Math.floor(t * REPETICION.velocidad / this.dt))];
      if (f) {
        Object.assign(glass, { volume: f.volume, foam: f.foam, overflowed: f.overflowed });
        Object.assign(faucet, { time: f.time, flow: f.flow, inAir: f.inAir });
        if (pile && f.pieces) {
          pile.pieces = f.pieces;
          pile.out = f.out >= 0 ? f.pieces[f.out] : null;
        }
        doble.pressing = f.pressing;
        doble.leaking = f.leaking;
      }
      return doble as unknown as Game;
    };
  }
}
