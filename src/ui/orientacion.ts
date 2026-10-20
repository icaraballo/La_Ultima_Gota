// El juego es solo en vertical. Una web no puede bloquear el giro (en iOS nunca; en Android solo
// a pantalla completa), así que en un móvil tumbado se contrarrota la interfaz: se queda en
// vertical respecto al móvil, como una app bloqueada, y quien lo gira ve que no cambia. Lo
// aplica estilos.css con <html data-giro="90|270">. En la APK (fase 7) será un bloqueo de verdad.

/** Ángulo de la pantalla respecto a la posición natural: 90 o 270 si está tumbada. */
function angulo(): number {
  const a = screen.orientation?.angle ?? Number((window as { orientation?: number }).orientation ?? 0);
  return ((a % 360) + 360) % 360;
}

export function mantenerVertical() {
  const tactil = matchMedia('(pointer: coarse)');
  const aplicar = () => {
    // Solo móviles: táctil, apaisado y con poca altura (una tablet o un portátil no se tocan).
    const tumbado = tactil.matches && innerWidth > innerHeight && innerHeight <= 500;
    if (!tumbado) { delete document.documentElement.dataset.giro; return; }
    document.documentElement.dataset.giro = angulo() === 270 ? '270' : '90';
  };
  aplicar();
  addEventListener('resize', aplicar);
  addEventListener('orientationchange', aplicar);
  screen.orientation?.addEventListener('change', aplicar);
}
