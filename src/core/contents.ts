import { LIQUID_IDS, type LiquidId } from './liquids';
import { SOLID_IDS, type SolidId } from './solids';

// Lo que se echa en el vaso: un líquido o piezas sólidas (canicas, monedas).

export type ContentId = LiquidId | SolidId;
export const CONTENT_IDS: ContentId[] = [...LIQUID_IDS, ...SOLID_IDS];

export const isSolid = (id: ContentId): id is SolidId => (SOLID_IDS as string[]).includes(id);
