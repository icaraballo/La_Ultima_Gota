// Espuma (cerveza): ocupa altura encima del líquido, se asienta con decaimiento exponencial y
// también desborda. Al asentarse desaparece (es casi todo aire).

export function settleFoam(foam: number, decay: number, dt: number): number {
  const next = foam * Math.exp(-decay * dt);
  return next < 1e-5 ? 0 : next;
}
