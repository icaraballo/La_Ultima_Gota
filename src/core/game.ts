import { config as defaultConfig, type Config } from './config';
import { Glass } from './glass-state';
import { getLiquid, LIQUID_IDS, type LiquidId } from './liquids';
import { Faucet } from './pour';
import { createRng, type Rng } from './rng';
import { getVessel, VESSEL_IDS, type VesselId } from './vessels';

// La partida: jugadores, turnos, rondas y eliminación. Recibe pulsaciones (press/release) y
// avanza con step(dt) a paso fijo; quien dibuja solo lee su estado.
// Una sola pulsación por turno (decisión del 19-10-2026): al soltar, el turno acaba en cuanto
// termina de caer lo echado. Si eso desborda, pierde quien echó.
// Orden fijo (19-10-2026): el de la lista o sorteado una vez; tras un desborde empieza el
// siguiente al eliminado. Vaso y líquido se mantienen salvo que se pida otra combinación.

/**
 * - `turno`: pantalla «Turno de X», esperando a «¡Listo!» (para pasar el móvil).
 * - `echando`: el jugador echa (una pulsación); al soltar y caer todo, pasa al siguiente.
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
  /** Segundos desde «¡Listo!» hasta que empezó a echar (lo que dudó). */
  hesitation: number;
  /** Segundos que mantuvo pulsado. */
  held: number;
  overflowed: boolean;
}

export interface GameOptions {
  seed: number;
  /** Vaso y líquido, o 'aleatorio' (se sortea una vez, al crear la partida). Por defecto,
   * cilindro y agua. */
  vessel?: VesselId | 'aleatorio';
  liquid?: LiquidId | 'aleatorio';
  /** Barajar el orden de la lista una sola vez, al crear la partida. */
  randomOrder?: boolean;
}

const combo = (v: VesselId, l: LiquidId) => `${v}:${l}`;

export class Game {
  readonly players: Player[];
  phase: Phase = 'turno';
  round = 0;
  /** Orden de toda la partida: la lista, o barajada una vez si se pidió. */
  readonly baseOrder: number[];
  /** Orden de esta ronda: los vivos de `baseOrder`, empezando por quien abre la ronda. */
  order: number[] = [];
  /** Posición en `order` de quien juega. */
  turn = 0;
  glass!: Glass;
  faucet!: Faucet;
  /** Lo que se juega en esta ronda (ya resuelto si era aleatorio). */
  vesselId!: VesselId;
  liquidId!: LiquidId;
  time = 0;
  /** El eliminado de la última ronda y el ganador al acabar. */
  loser: number | null = null;
  winner: number | null = null;
  readonly history: TurnRecord[] = [];
  /** Combinaciones de vaso y líquido ya jugadas en esta partida («copa:agua»). */
  readonly played = new Set<string>();

  private rng: Rng;
  private pressedAt: number | null = null;
  /** Cuándo empezó la pulsación de este turno (no se borra al soltar). */
  private pressStartedAt: number | null = null;
  private releasedAt: number | null = null;
  private quietSince: number | null = null;
  private pouredThisTurn = 0;
  private turnStartedAt = 0;
  /** Lo que duró la última pulsación (s), para el modo depuración. */
  lastHeld = 0;

  constructor(names: string[], options: GameOptions, private cfg: Config = defaultConfig) {
    if (names.length < cfg.minPlayers || names.length > cfg.maxPlayers) {
      throw new Error(`De ${cfg.minPlayers} a ${cfg.maxPlayers} jugadores`);
    }
    this.players = names.map(name => ({ name, alive: true }));
    this.rng = createRng(options.seed);
    const list = names.map((_, i) => i);
    this.baseOrder = options.randomOrder ? this.rng.shuffle(list) : list;
    const { vessel = 'cilindro', liquid = 'agua' } = options;
    this.vesselId = vessel === 'aleatorio' ? VESSEL_IDS[Math.floor(this.rng.next() * VESSEL_IDS.length)] : vessel;
    this.liquidId = liquid === 'aleatorio' ? LIQUID_IDS[Math.floor(this.rng.next() * LIQUID_IDS.length)] : liquid;
    this.startRound(null);
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

  /** Ya ha echado en este turno: no admite otra pulsación, solo espera a que caiga. */
  get poured(): boolean {
    return this.releasedAt !== null;
  }

  /** Está pulsando ahora mismo. */
  get pressing(): boolean {
    return this.pressedAt !== null;
  }

  /** «¡Listo!» en la pantalla de turno. */
  ready() {
    if (this.phase !== 'turno') return;
    this.phase = 'echando';
    this.pouredThisTurn = 0;
    this.pressedAt = null;
    this.pressStartedAt = null;
    this.releasedAt = null;
    this.quietSince = null;
    this.turnStartedAt = this.time;
  }

  press() {
    if (this.phase !== 'echando' || this.pressedAt !== null || this.poured) return;
    this.pressedAt = this.time;
    this.pressStartedAt = this.time;
  }

  release() {
    if (this.pressedAt === null) return;
    if (this.phase === 'echando') {
      if (this.faucet.streaming) this.faucet.stopStream();
      else this.faucet.tap();
      this.releasedAt = this.time;
      this.lastHeld = this.time - this.pressedAt;
    }
    this.pressedAt = null;
  }

  /** «Siguiente ronda» tras un desborde: nueva ronda, o fin si solo queda uno. Con
   * `newCombination`, la ronda se juega con un vaso y un líquido sorteados entre los que aún no
   * se han jugado (si ya han salido las 9, entre todos menos el de la ronda que acaba). */
  continue(newCombination = false) {
    if (this.phase !== 'desborde') return;
    const alive = this.alive;
    if (alive.length === 1) {
      this.winner = alive[0];
      this.phase = 'fin';
      return;
    }
    if (newCombination) {
      const all = VESSEL_IDS.flatMap(v => LIQUID_IDS.map(l => [v, l] as const));
      let choices = all.filter(([v, l]) => !this.played.has(combo(v, l)));
      if (!choices.length) choices = all.filter(([v, l]) => combo(v, l) !== combo(this.vesselId, this.liquidId));
      [this.vesselId, this.liquidId] = choices[Math.floor(this.rng.next() * choices.length)];
    }
    this.startRound(this.loser);
  }

  step(dt: number) {
    this.time += dt;
    const { cfg } = this;

    if (this.phase === 'echando' && this.pressedAt !== null && !this.poured && !this.faucet.streaming
        && (this.time - this.pressedAt) * 1000 >= cfg.tapThresholdMs) {
      this.faucet.startStream();
    }

    const arrived = this.faucet.step(dt);
    const wasOverflowed = this.glass.overflowed;
    this.glass.step(dt);
    this.glass.add(arrived, this.faucet.arrivedFoam);
    if (this.phase === 'echando') this.pouredThisTurn += arrived;

    if (!wasOverflowed && this.glass.overflowed && this.phase === 'echando') {
      this.faucet.stopStream();
      this.pressedAt = null;
      this.record(true);
      this.loser = this.current;
      this.players[this.current].alive = false;
      this.phase = 'desborde';
    }

    // Ya ha echado y no cae nada: tras una pausa corta para ver cómo queda, siguiente turno.
    if (this.phase === 'echando' && this.poured && this.faucet.quiet) {
      this.quietSince ??= this.time;
      if (this.time - this.quietSince >= cfg.turnEndDelay) {
        this.record(false);
        this.turn = (this.turn + 1) % this.order.length;
        this.phase = 'turno';
      }
    }
  }

  /** Ronda nueva con los vivos en el orden de la partida. Tras un desborde, empieza el primer
   * vivo detrás del eliminado (en círculo). */
  private startRound(after: number | null) {
    this.round++;
    const base = this.baseOrder;
    let start = 0;
    if (after !== null) {
      const p = base.indexOf(after);
      for (let k = 1; k <= base.length; k++) {
        const i = (p + k) % base.length;
        if (this.players[base[i]].alive) { start = i; break; }
      }
    }
    this.order = [...base.slice(start), ...base.slice(0, start)].filter(i => this.players[i].alive);
    this.turn = 0;
    this.loser = null;
    this.pressedAt = null;
    this.played.add(combo(this.vesselId, this.liquidId));
    const liquid = getLiquid(this.liquidId);
    this.glass = new Glass(getVessel(this.vesselId), liquid, this.rng, this.cfg);
    this.faucet = new Faucet(liquid, this.rng, this.cfg);
    this.phase = 'turno';
  }

  private record(overflowed: boolean) {
    this.history.push({
      round: this.round,
      player: this.current,
      poured: this.pouredThisTurn,
      volumeAfter: this.glass.volume,
      hesitation: (this.pressStartedAt ?? this.time) - this.turnStartedAt,
      held: this.releasedAt !== null ? this.lastHeld : this.time - (this.pressStartedAt ?? this.time),
      overflowed,
    });
  }
}
