import type { VesselId } from '../core/vessels';

// Iconos dibujados (SVG en línea, nada de emoji). Usan currentColor salvo la gota del título.

const svg = (w: number, h: number, body: string) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

export const iconos = {
  /** Gota del título: rellena del acento, con contorno de tinta y brillo. */
  gotaTitulo: svg(44, 54, '<path d="M22 3 C30 16 40 26 40 36 C40 46 32 52 22 52 C12 52 4 46 4 36 C4 26 14 16 22 3 Z" fill="var(--acento)" stroke="var(--tinta)" stroke-width="3"/><path d="M13 34 C13 40 17 44 22 45" fill="none" stroke="var(--acento-texto)" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>'),
  gota: svg(30, 38, '<path d="M15 2 C21 12 28 19 28 26 C28 32 22 36 15 36 C8 36 2 32 2 26 C2 19 9 12 15 2 Z" fill="currentColor"/>'),
  luna: svg(24, 24, '<path d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 A7 7 0 0 0 20 14.5 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
  sol: svg(24, 24, '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  info: svg(24, 24, '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.4" r="1.5" fill="currentColor"/>'),
  dado: svg(24, 24, '<rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="9" cy="9" r="1.6" fill="currentColor"/><circle cx="15" cy="15" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
  vasos: {
    cilindro: svg(24, 24, '<path d="M6 4 L7 20 H17 L18 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
    copa: svg(24, 24, '<path d="M3 4 L9 20 H15 L21 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
    botella: svg(24, 24, '<path d="M10 3 V7 Q6 9 6 12 V20 H18 V12 Q18 9 14 7 V3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
    pecera: svg(24, 24, '<path d="M9 3 V6 Q3 8 3 14 Q3 21 12 21 Q21 21 21 14 Q21 8 15 6 V3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
    tarta: svg(24, 24, '<path d="M9 3 V8 H6 V13 H3 V20 H21 V13 H18 V8 H15 V3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
    chupito: svg(24, 24, '<path d="M7 11 L8 20 H16 L17 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
    fuga: svg(24, 24, '<path d="M6 4 L7 20 H17 L18 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M17.6 12 Q21 13 21 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  } satisfies Record<VesselId, string>,
};
