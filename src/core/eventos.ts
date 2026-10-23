import type { Game, Phase } from './game';
import type { Parcel } from './pour';

// Qué ha pasado entre una imagen y la siguiente, para el sonido y la vibración (§8.2 y §8.3):
// gotas que llegan al vaso, piezas que caen, el desborde y el ganador. Y lo continuo: cuánto
// chorro cae y por dónde va el nivel. Solo lee la partida; quien suena o vibra decide qué hacer.

export type Evento =
  | { tipo: 'gota'; nivel: number }
  | { tipo: 'pieza'; pieza: 'canicas' | 'monedas'; nivel: number }
  | { tipo: 'desborde'; piezas: boolean }
  | { tipo: 'ganador' };

export interface Estado {
  /** Chorro que cae ahora, de 0 a 1 (1 = caudal máximo). */
  chorro: number;
  /** Nivel tal como se ve, 1 = el borde (en el esmerilado, el desplazado: no se chiva nada).
   * Con piezas, la altura del montón. */
  nivel: number;
  /** Alguien está echando (de «¡Listo!» a que acaba su turno). */
  enJuego: boolean;
}

export class Observador {
  private gotas = new Set<Parcel>();
  private piezas = 0;
  private fase: Phase | null = null;
  private vaso: unknown = null;

  constructor(private flowMax: number) {}

  /** Lo que ha pasado desde la última llamada. */
  eventos(g: Game): Evento[] {
    const ev: Evento[] = [];
    const nivel = this.estado(g).nivel;
    // Ronda nueva: se empieza de cero sin sonar por lo que ya había.
    if (g.glass !== this.vaso) {
      this.vaso = g.glass;
      this.gotas.clear();
      this.piezas = g.pile?.pieces.length ?? 0;
    }
    const ahora = new Set<Parcel>();
    for (const p of g.faucet.inAir) if (p.kind === 'drop') ahora.add(p);
    for (const p of this.gotas) if (!ahora.has(p)) ev.push({ tipo: 'gota', nivel });
    this.gotas = ahora;

    if (g.pile) {
      const n = g.pile.pieces.length;
      for (let i = this.piezas; i < n; i++) ev.push({ tipo: 'pieza', pieza: g.pile.kind, nivel });
      this.piezas = n;
    }

    if (g.phase !== this.fase) {
      if (g.phase === 'desborde') ev.push({ tipo: 'desborde', piezas: g.pile !== null });
      if (g.phase === 'fin') ev.push({ tipo: 'ganador' });
      this.fase = g.phase;
    }
    return ev;
  }

  estado(g: Game): Estado {
    const nivel = g.pile ? g.pile.fill.height : g.glass.shownHeight;
    return {
      chorro: Math.min(1, g.faucet.flow / this.flowMax),
      nivel,
      enJuego: g.phase === 'echando',
    };
  }
}
