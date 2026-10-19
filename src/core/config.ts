// Todos los números de jugabilidad (§10 del documento de arranque). Nada de valores a fuego en
// el resto del código: se ajustan aquí o, desde la fase 2, con los sliders del modo depuración.
// Volúmenes relativos a la capacidad del vaso: 1 = lleno hasta el borde.

export const config = {
  /** Pasos de lógica por segundo (paso fijo, igual en un móvil lento que en uno rápido). */
  stepsPerSecond: 60,

  /** Por debajo de esto (ms) la pulsación es un toque; por encima, chorro. */
  tapThresholdMs: 180,

  /** Volumen base de una gota (~40 gotas para llenar un cilindro). Era 0,006 (el documento):
   * con una pulsación por turno, «solo tocar» alargaba la ronda de 4 a ~31 vueltas; con 0,025,
   * ~7,5 si todos tocan y ~2,3 si echan chorro (objetivo: 3–6). Bots, 19-10-2026. */
  dropVolume: 0.025,
  /** Variación de cada gota: ±30 %. */
  dropVariance: 0.30,
  /** Probabilidad de que un toque suelte 1, 2 o 3 gotas. */
  dropCountWeights: [0.70, 0.22, 0.08],
  /** Separación entre las gotas de un mismo toque (s). */
  dropInterval: 0.09,

  /** Caudal máximo del chorro (volumen/s): lleno en unos 8 s a tope. */
  flowMax: 0.12,
  /** Lo que tarda el chorro en coger fuerza (s): caudal(t) = máx · (1 − e^(−t/τ)). */
  flowRampTau: 0.6,
  /** Fluctuación suave del caudal: ±15 %. */
  flowNoise: 0.15,
  /** Cuántas veces por segundo cambia de rumbo la fluctuación. */
  flowNoiseRate: 1.5,
  /** Por debajo de este caudal (volumen/s) el grifo se da por cerrado al soltar. */
  flowCutoff: 0.002,

  /** Lo que tarda el líquido en caer del grifo al vaso (s). */
  fallTime: 0.35,

  /** Pausa tras caer lo echado antes de pasar al siguiente turno (s), para ver cómo queda. */
  turnEndDelay: 0.8,

  /** Variación oculta del menisco en cada ronda: ±10 %. */
  meniscusVariance: 0.10,
  /** Desde qué llenado empieza la vibración de cercanía (fase 6). */
  nearBrimHapticStart: 0.85,

  minPlayers: 2,
  maxPlayers: 8,

  liquids: {
    /** inercia (s): al soltar sigue cayendo caudal × inercia. menisco: margen sobre el borde. */
    agua: { flowMul: 1, inertia: 0.15, meniscus: 0.025 },
  },
};

export type Config = typeof config;
