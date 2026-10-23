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
  maxPlayers: 10,

  /**
   * flowMul: multiplica el caudal. inertia (s): al soltar sigue cayendo caudal × inercia.
   * meniscus: cuánto se abomba sobre el borde, en ALTURA relativa (1 = alto del vaso): en el
   * cuello de la botella ese margen es muy poco volumen. foamPerFlow: espuma por volumen echado
   * a caudal máximo (las gotas, un 5 %). foamDecay (1/s): lo rápido que se asienta.
   * rise (volumen/s): sube sola durante el turno, de «¡Listo!» a soltar (leche al fuego, v0.9.0);
   * riseGrow: cuánto más rápido en cada turno de la ronda (0,15 = +15 % por turno).
   */
  /**
   * Canicas y monedas (UG-DESIGN §7.4), valores de serie del prototipo. Tamaños en píxeles del
   * motor (el vaso mide 250 de alto y 155 de ancho). interval (s): una pieza cada tanto al
   * mantener. spawnHeight: desde cuánto por encima del borde caen. El turno acaba cuando nada se
   * mueve más rápido que calmSpeed durante calmTime (s), o a los maxSettle s de soltar.
   * coinScale 2.4 (era 1.6, decidido el 20-10-2026): con 1.6 una ronda de monedas en el recto
   * pedía ~260 piezas y ~55 turnos. Con 2.4, ~90 en el recto, ~57 en la copa y 12–22 en la
   * botella (las grandes se atascan en el cuello), y el paso de física cuesta un tercio.
   */
  solids: {
    marbleMin: 12, marbleMax: 19, marbleBounce: 0.3, marbleFriction: 0.04,
    coinScale: 2.4, coinFriction: 0.45, wallFriction: 0.25,
    interval: 0.22, spawnHeight: 50,
    calmSpeed: 0.15, calmTime: 0.3, maxSettle: 6,
  },

  liquids: {
    agua: { flowMul: 1, inertia: 0.15, meniscus: 0.025, foamPerFlow: 0, foamDecay: 0.5, rise: 0, riseGrow: 0 },
    aceite: { flowMul: 0.8, inertia: 0.35, meniscus: 0.008, foamPerFlow: 0, foamDecay: 0.5, rise: 0, riseGrow: 0 },
    cerveza: { flowMul: 1, inertia: 0.15, meniscus: 0.02, foamPerFlow: 0.9, foamDecay: 0.5, rise: 0, riseGrow: 0 },
    // Leche al fuego: medio volumen de gota por segundo de duda al principio; +15 % por turno.
    leche: { flowMul: 1, inertia: 0.15, meniscus: 0.02, foamPerFlow: 0, foamDecay: 0.5, rise: 0.012, riseGrow: 0.15 },
  },
};

export type Config = typeof config;
