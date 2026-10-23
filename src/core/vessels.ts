// Cada vaso es un perfil de radio según la altura, r(h), con h de 0 (fondo) a 1 (borde).
// El nivel se calcula integrando el área, así que el mismo volumen sube distinto en cada
// forma. El perfil servirá también para la geometría 3D (LatheGeometry, fase 3).

export type VesselId = 'cilindro' | 'copa' | 'botella' | 'pecera' | 'tarta' | 'chupito' | 'fuga' | 'esmerilado';
export const VESSEL_IDS: VesselId[] = ['cilindro', 'copa', 'botella', 'pecera', 'tarta', 'chupito', 'fuga', 'esmerilado'];

export interface Vessel {
  id: string;
  /** Alto del vaso respecto al recto (1). El chupito es más bajo. */
  height: number;
  /** Cuánto cabe hasta el borde respecto al recto (1): lo echado se divide por esto, así que
   * en el chupito cada gota sube mucho más. Sale del perfil y del alto. */
  capacity: number;
  /** Tiene un agujero en la pared (vaso con fuga); la altura está en config.leak. */
  leaks: boolean;
  /** Cristal grueso que deforma (esmerilado): el nivel no se ve donde está. */
  frosted: boolean;
  /** Radio respecto al del recto, a la altura h ∈ [0, 1]. */
  radius(h: number): number;
  /** Altura del líquido (1 = borde) para un volumen (1 = lleno hasta el borde). */
  volumeToHeight(v: number): number;
  heightToVolume(h: number): number;
}

const SAMPLES = 256;

export function makeVessel(id: string, radius: (h: number) => number, height = 1, leaks = false, frosted = false): Vessel {
  // Volumen acumulado V(h) = ∫ r² dh, por trapecios, normalizado a 1 en el borde.
  const acc = new Float64Array(SAMPLES + 1);
  for (let i = 1; i <= SAMPLES; i++) {
    const a0 = radius((i - 1) / SAMPLES) ** 2;
    const a1 = radius(i / SAMPLES) ** 2;
    acc[i] = acc[i - 1] + (a0 + a1) / 2 / SAMPLES;
  }
  const total = acc[SAMPLES];
  for (let i = 0; i <= SAMPLES; i++) acc[i] /= total;
  // Por encima del borde (menisco) el nivel sigue subiendo con el área del borde.
  const rimSlope = radius(1) ** 2 / total;

  return {
    id,
    height,
    capacity: total * height,
    leaks,
    frosted,
    radius,
    volumeToHeight(v) {
      if (v <= 0) return 0;
      if (v >= 1) return 1 + (v - 1) / rimSlope;
      let lo = 0, hi = SAMPLES;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (acc[mid] <= v) lo = mid; else hi = mid;
      }
      const f = (v - acc[lo]) / (acc[hi] - acc[lo] || 1);
      return (lo + f) / SAMPLES;
    },
    heightToVolume(h) {
      if (h <= 0) return 0;
      if (h >= 1) return 1 + (h - 1) * rimSlope;
      const x = h * SAMPLES;
      const i = Math.floor(x);
      return acc[i] + (acc[i + 1] - acc[i]) * (x - i);
    },
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const vessels: Record<VesselId, Vessel> = {
  // No engaña: sube siempre al mismo ritmo.
  cilindro: makeVessel('cilindro', () => 1),
  // Cono invertido: sube rápido al principio y al final parece que no sube.
  copa: makeVessel('copa', h => 0.3 + 0.7 * h),
  // Cuerpo ancho y cuello estrecho: el último cuarto de altura es ~4 % del volumen.
  botella: makeVessel('botella', h => 1 - 0.68 * smooth(0.55, 0.75, h)),
  // Los tres de §7.4 (v0.8.0), con las medidas del prototipo: px de medio ancho a cada altura en
  // un vaso de 250 px, sobre los 77,5 del recto.
  // Pecera: panza ancha y boca estrecha. A medio llenar parece poquísimo; en la boca vuela.
  pecera: makeVessel('pecera', h => {
    const y = h * 250;
    const panza = 102 * Math.sqrt(Math.max(0, 1 - ((y - 100) / 125) ** 2));
    return (y < 210 ? Math.max(40, panza) : 40) / 77.5;
  }),
  // Tarta de pisos: cada piso más estrecho; al cambiar, lo mismo sube el doble de rápido.
  tarta: makeVessel('tarta', h => (h < 84 / 250 ? 100 : h < 167 / 250 ? 70 : 42) / 77.5),
  // Chupito: 100 px de alto (0,4 del recto) y de 46 a 56 de medio ancho. Cabe ~1/6 del recto.
  chupito: makeVessel('chupito', h => (46 + 10 * h) / 77.5, 0.4),
  // Con fuga (v0.10.0): un recto con un agujero a media altura (config.leak).
  fuga: makeVessel('fuga', () => 1, 1, true),
  // Esmerilado (v0.11.0): un recto de cristal grueso; el desvío de cada ronda está en Glass.
  esmerilado: makeVessel('esmerilado', () => 1, 1, false, true),
};

export function getVessel(id: VesselId): Vessel {
  return vessels[id];
}
