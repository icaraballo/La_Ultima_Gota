import { config } from '../core/config';
import { CONTENT_IDS, type ContentId } from '../core/contents';
import { VESSEL_IDS, type VesselId } from '../core/vessels';

// Lo que se recuerda de la última partida (nombres, vaso, contenido y orden). Viene de
// localStorage, así que puede llegar cualquier cosa: todo pasa por sanearPreparacion().
// Sin DOM, para poder probarlo en Node.

/** Largo máximo de un nombre: el `maxlength` del campo y el recorte de lo guardado. */
export const MAX_NOMBRE = 16;

export interface Preparacion {
  names: string[];
  vessel: VesselId | 'aleatorio';
  /** Qué se echa: un líquido, canicas o monedas (se guarda como «liquid» desde la v0.4.0). */
  liquid: ContentId | 'aleatorio';
  /** «Empezar en orden aleatorio»: se baraja una vez al crear la partida. */
  randomOrder: boolean;
}

const VASOS: readonly string[] = [...VESSEL_IDS, 'aleatorio'];
const CONTENIDOS: readonly string[] = [...CONTENT_IDS, 'aleatorio'];

/** Una preparación siempre jugable: de `minPlayers` a `maxPlayers` nombres de texto, y vaso y
 * contenido que existen. Lo que no encaja vuelve al valor de serie. */
export function sanearPreparacion(raw: unknown): Preparacion {
  const p = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const names = (Array.isArray(p.names) ? p.names : [])
    .slice(0, config.maxPlayers)
    .map(n => (typeof n === 'string' ? [...n].slice(0, MAX_NOMBRE).join('') : ''));
  while (names.length < config.minPlayers) names.push('');
  return {
    names,
    vessel: VASOS.includes(p.vessel as string) ? (p.vessel as Preparacion['vessel']) : 'cilindro',
    liquid: CONTENIDOS.includes(p.liquid as string) ? (p.liquid as Preparacion['liquid']) : 'agua',
    randomOrder: p.randomOrder === true,
  };
}
