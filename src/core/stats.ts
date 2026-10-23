import type { TurnRecord } from './game';

// Estadísticas del final de la partida (UG-DESIGN §7.2), sacadas del historial de turnos. No se
// guarda nada entre partidas.
// Lo echado se compara dentro de cada ronda (aporte = lo que echó / la media de los turnos de
// esa ronda): así cuentan igual las rondas de agua que las de monedas o las de otro vaso.

export interface Destacado {
  player: number;
  /** El dato por el que gana, por si se quiere enseñar (aporte medio, peligro o segundos). */
  value: number;
}

export interface Stats {
  /** 🌊 Quien más echó de media (respecto a lo normal en cada ronda). */
  generoso: Destacado | null;
  /** 💧 Quien menos echó de media. */
  rata: Destacado | null;
  /** 😰 Quien dejó el vaso más cerca de desbordar sin desbordar (solo con líquidos). */
  alLimite: Destacado | null;
  /** ⏱️ Quien más tardó de media en empezar a echar. */
  indeciso: Destacado | null;
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** El jugador con el valor más alto (o más bajo con `min`); el primero en caso de empate. */
function mejor(valores: Map<number, number>, min = false): Destacado | null {
  let best: Destacado | null = null;
  for (const [player, value] of valores) {
    if (!best || (min ? value < best.value : value > best.value)) best = { player, value };
  }
  return best;
}

export function computeStats(history: readonly TurnRecord[]): Stats {
  const porRonda = new Map<number, TurnRecord[]>();
  for (const h of history) porRonda.set(h.round, [...(porRonda.get(h.round) ?? []), h]);

  const aportes = new Map<number, number[]>();
  for (const turnos of porRonda.values()) {
    const m = media(turnos.map(h => h.poured));
    if (m <= 0) continue;
    for (const h of turnos) aportes.set(h.player, [...(aportes.get(h.player) ?? []), h.poured / m]);
  }
  const aporte = new Map([...aportes].map(([p, xs]) => [p, media(xs)]));

  const limite = new Map<number, number>();
  for (const h of history) {
    if (h.overflowed || h.danger === null) continue;
    limite.set(h.player, Math.max(limite.get(h.player) ?? 0, h.danger));
  }

  const dudas = new Map<number, number[]>();
  for (const h of history) dudas.set(h.player, [...(dudas.get(h.player) ?? []), h.hesitation]);
  const duda = new Map([...dudas].map(([p, xs]) => [p, media(xs)]));

  const generoso = mejor(aporte);
  const rata = mejor(aporte, true);
  return {
    generoso,
    // Con todos iguales (o uno solo), el mismo sería el más generoso y el más rata.
    rata: rata && generoso && rata.player !== generoso.player ? rata : null,
    alLimite: mejor(limite),
    indeciso: mejor(duda),
  };
}
