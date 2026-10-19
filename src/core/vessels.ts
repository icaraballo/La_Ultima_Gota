// Cada vaso es un perfil de radio según la altura, r(h), con h de 0 (fondo) a 1 (borde).
// El nivel se calcula integrando el área, así que el mismo volumen sube distinto en cada
// forma. El perfil servirá también para la geometría 3D (LatheGeometry, fase 3).

export type VesselId = 'cilindro' | 'copa' | 'botella';
export const VESSEL_IDS: VesselId[] = ['cilindro', 'copa', 'botella'];

export interface Vessel {
  id: string;
  /** Radio relativo a la altura h ∈ [0, 1]. */
  radius(h: number): number;
  /** Altura del líquido (1 = borde) para un volumen (1 = lleno hasta el borde). */
  volumeToHeight(v: number): number;
  heightToVolume(h: number): number;
}

const SAMPLES = 256;

export function makeVessel(id: string, radius: (h: number) => number): Vessel {
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
};

export function getVessel(id: VesselId): Vessel {
  return vessels[id];
}
