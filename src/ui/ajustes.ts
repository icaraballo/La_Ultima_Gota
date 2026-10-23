// Ajustes (UG-DESIGN §6): sonido, vibración y aviso de borde, todos encendidos de serie. Se
// guardan en este navegador; lo guardado pasa por sanearAjustes(). Sin DOM: se prueba en Node.

export interface Ajustes {
  sonido: boolean;
  vibracion: boolean;
  /** Vibración de cercanía al borde (§8.3); solo cuenta con la vibración encendida. */
  cercania: boolean;
}

export const AJUSTES_DE_SERIE: Ajustes = { sonido: true, vibracion: true, cercania: true };

export function sanearAjustes(raw: unknown): Ajustes {
  const p = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const si = (k: keyof Ajustes) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : AJUSTES_DE_SERIE[k]);
  return { sonido: si('sonido'), vibracion: si('vibracion'), cercania: si('cercania') };
}
