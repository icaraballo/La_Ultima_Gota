import { config as defaultConfig, type Config } from './config';
import { Glass } from './glass-state';
import { getLiquid, type LiquidId } from './liquids';
import { Faucet } from './pour';
import { createRng, type Rng } from './rng';
import { getVessel, type VesselId } from './vessels';

// La partida: jugadores, turnos, rondas y eliminación. Recibe pulsaciones (press/release) y
// avanza con step(dt) a paso fijo; quien dibuja solo lee su estado.

/**
 * - `turno`: pantalla «Turno de X», esperando a «¡Listo!» (para pasar el móvil).
 * - `echando`: el jugador echa; termina con «Paso».
 * - `desborde`: alguien ha desbordado y está eliminado; esperando «Siguiente ronda».
 * - `fin`: queda uno, el ganador.
 */
export type Phase = 'turno' | 'echando' | 'desborde' | 'fin';

export interface Player {
  name: string;
  alive: boolean;
}

/** Lo que pasó en cada turno; de aquí saldrán las estadísticas del final (fase 4). */
export interface TurnRecord {
  round: number;
  player: number;
  /** Volumen que llegó al vaso en el turno. */
  poured: number;
  /** Cómo quedó el vaso al pasar (o al desbordar). */
  volumeAfter: number;
  /** Segundos desde «¡Listo!» hasta «Paso» (o el desborde). */
  duration: number;
  overflowed: boolean;
}

export interface GameOptions {
  seed: number;
  vessel?: VesselId;
  liquid?: LiquidId;
}

export class Game {
  readonly players: Player[];
  phase: Phase = 'turno';
  round = 0;
  /** Orden de esta ronda: índices de jugadores vivos, sorteados. */
  order: number[] = [];
  /** Posición en `order` de quien juega. */
  turn = 0;
  glass!: Glass;
  faucet!: Faucet;
  time = 0;
  /** El eliminado de la última ronda y el ganador al acabar. */
  loser: number | null = null;
  winner: number | null = null;
  readonly history: TurnRecord[] = [];

  private rng: Rng;
  private pressedAt: number | null = null;
  private pouredThisTurn = 0;
  private hasPoured = false;
  private turnStartedAt = 0;

  constructor(names: string[], private options: GameOptions, private cfg: Config = defaultConfig) {
    if (names.length < cfg.minPlayers || names.length > cfg.maxPlayers) {
      throw new Error(`De ${cfg.minPlayers} a ${cfg.maxPlayers} jugadores`);
    }
    this.players = names.map(name => ({ name, alive: true }));
    this.rng = createRng(options.seed);
    this.startRound();
  }

  get current(): number {
    return this.order[this.turn];
  }

  get next(): number {
    return this.order[(this.turn + 1) % this.order.length];
  }

  get alive(): number[] {
    return this.players.flatMap((p, i) => (p.alive ? [i] : []));
  }

  /** Se puede pasar si ya ha echado algo y no queda nada saliendo ni en el aire. */
  get canPass(): boolean {
    return this.phase === 'echando' && this.hasPoured && this.pressedAt === null && this.faucet.quiet;
  }

  /** «¡Listo!» en la pantalla de turno. */
  ready() {
    if (this.phase !== 'turno') return;
    this.phase = 'echando';
    this.pouredThisTurn = 0;
    this.hasPoured = false;
    this.turnStartedAt = this.time;
  }

  press() {
    if (this.phase !== 'echando' || this.pressedAt !== null) return;
    this.pressedAt = this.time;
  }

  release() {
    if (this.pressedAt === null) return;
    this.pressedAt = null;
    if (this.phase !== 'echando') return;
    if (this.faucet.streaming) this.faucet.stopStream();
    else this.faucet.tap();
    this.hasPoured = true;
  }

  pass() {
    if (!this.canPass) return;
    this.record(false);
    this.turn = (this.turn + 1) % this.order.length;
    this.phase = 'turno';
  }

  /** «Siguiente ronda» tras un desborde: nueva ronda, o fin si solo queda uno. */
  continue() {
    if (this.phase !== 'desborde') return;
    const alive = this.alive;
    if (alive.length === 1) {
      this.winner = alive[0];
      this.phase = 'fin';
    } else {
      this.startRound();
    }
  }

  step(dt: number) {
    this.time += dt;
    const { cfg } = this;

    if (this.phase === 'echando' && this.pressedAt !== null && !this.faucet.streaming
        && (this.time - this.pressedAt) * 1000 >= cfg.tapThresholdMs) {
      this.faucet.startStream();
      this.hasPoured = true;
    }

    const arrived = this.faucet.step(dt);
    const wasOverflowed = this.glass.overflowed;
    this.glass.add(arrived);
    if (this.phase === 'echando') this.pouredThisTurn += arrived;

    if (!wasOverflowed && this.glass.overflowed && this.phase === 'echando') {
      this.faucet.stopStream();
      this.pressedAt = null;
      this.record(true);
      this.loser = this.current;
      this.players[this.current].alive = false;
      this.phase = 'desborde';
    }
  }

  private startRound() {
    this.round++;
    this.order = this.rng.shuffle(this.alive);
    this.turn = 0;
    this.loser = null;
    this.pressedAt = null;
    const liquid = getLiquid(this.options.liquid ?? 'agua');
    this.glass = new Glass(getVessel(this.options.vessel ?? 'cilindro'), liquid, this.rng, this.cfg);
    this.faucet = new Faucet(liquid, this.rng, this.cfg);
    this.phase = 'turno';
  }

  private record(overflowed: boolean) {
    this.history.push({
      round: this.round,
      player: this.current,
      poured: this.pouredThisTurn,
      volumeAfter: this.glass.volume,
      duration: this.time - this.turnStartedAt,
      overflowed,
    });
  }
}
