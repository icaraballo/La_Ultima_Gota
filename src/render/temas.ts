import type { LiquidId } from '../core/liquids';

// Colores de los dos temas (decisión del 19-10-2026: cartoon suave, noche = bar, día = cocina).
// Solo aspecto: ningún número de jugabilidad vive aquí. La escena 3D lee `escena`; la interfaz
// aplica `ui` como variables CSS en :root[data-tema="…"] (ver aplicarTemas).

export type TemaId = 'noche' | 'dia';
export const TEMA_IDS: TemaId[] = ['noche', 'dia'];

export interface ColoresEscena {
  pared: string;
  /** Juntas del ladrillo o rejilla del azulejo. */
  paredLinea: string;
  /** Halo de la lámpara (noche) o luz de la ventana (día). */
  luz: string;
  /** Estantes / botellas (noche) o azulejo / listón (día). */
  deco: string;
  decoClaro: string;
  tablero: string;
  tableroLinea: string;
  liston: string;
  canto: string;
  debajo: string;
  tinta: string;
  cristal: string;
  /** Opacidad del cristal: sobre fondo claro tiene que ser mayor o desaparece. */
  cristalOpacidad: number;
  aro: string;
  metal: string;
  metalBrillo: string;
  pomo: string;
  sombra: string;
}

export interface ColoresUi {
  fondo: string;
  panel: string;
  panelBorde: string;
  texto: string;
  suave: string;
  acento: string;
  acentoTexto: string;
  tinta: string;
  peligro: string;
  /** Un color por jugador (hasta 10). Decoración: el nombre siempre va escrito. */
  puntos: string[];
}

export interface Tema {
  escena: ColoresEscena;
  ui: ColoresUi;
}

export const TEMAS: Record<TemaId, Tema> = {
  noche: {
    escena: {
      pared: '#2B1B17', paredLinea: '#352219', luz: '#8A4724', deco: '#3B271F', decoClaro: '#4A3127',
      tablero: '#8B4E2B', tableroLinea: '#75401F', liston: '#B0703F', canto: '#5E3119', debajo: '#160C09',
      tinta: '#140B08', cristal: '#FFF6E8', cristalOpacidad: 0.13, aro: '#FFF4E2',
      metal: '#C99A4B', metalBrillo: '#F6D891', pomo: '#E0533A', sombra: '#000000',
    },
    ui: {
      fondo: '#2B1B17', panel: '#3A2620', panelBorde: '#4E3329', texto: '#FCEBD3', suave: '#D9BFA3',
      acento: '#F2A93B', acentoTexto: '#2B1B17', tinta: '#140B08', peligro: '#F08A6C',
      puntos: ['#F2A93B', '#E0533A', '#7FC3A4', '#6FA8DC', '#C98BDB', '#F4D35E', '#E58FB0', '#9CC35A', '#5FC7C9', '#D9BFA3'],
    },
  },
  dia: {
    escena: {
      pared: '#F4EEE2', paredLinea: '#E3D8C4', luz: '#FFFFFF', deco: '#CFE6DD', decoClaro: '#B6D6CA',
      tablero: '#EBCB9C', tableroLinea: '#DDB580', liston: '#F7E2C0', canto: '#C08F5C', debajo: '#8C6644',
      tinta: '#24303D', cristal: '#FFFFFF', cristalOpacidad: 0.4, aro: '#FFFFFF',
      metal: '#B7C2CC', metalBrillo: '#F4F8FB', pomo: '#C2482F', sombra: '#5A4630',
    },
    ui: {
      fondo: '#F4EEE2', panel: '#FFFFFF', panelBorde: '#E3D8C4', texto: '#24303D', suave: '#5F6B78',
      acento: '#C2482F', acentoTexto: '#FFFFFF', tinta: '#24303D', peligro: '#B23A24',
      puntos: ['#E8A33A', '#C2482F', '#3E9C82', '#3D7CC4', '#8E5AB8', '#C9A227', '#C9577F', '#6E9A2E', '#2E9AA0', '#8C6644'],
    },
  },
};

/** Igual en los dos temas. `linea`: contacto con el cristal; `reflejo`: franja de la izquierda. */
export interface ColoresLiquido {
  cuerpo: string;
  sombra: string;
  superficie: string;
  linea: string;
  reflejo: string;
  espuma?: string;
  espumaSombra?: string;
  burbujas?: string;
}

export const LIQUIDOS: Record<LiquidId, ColoresLiquido> = {
  agua: { cuerpo: '#4FA9E6', sombra: '#3A86C4', superficie: '#A9DCFA', linea: '#EAF7FF', reflejo: '#8FD0F7' },
  aceite: { cuerpo: '#E7B23A', sombra: '#C38A1C', superficie: '#F8DB78', linea: '#FFF3C2', reflejo: '#F6D46A' },
  cerveza: {
    cuerpo: '#E58A28', sombra: '#B9631A', superficie: '#FFF8EA', linea: '#FFFFFF', reflejo: '#F4AE57',
    espuma: '#FBF1DD', espumaSombra: '#E6D6B6', burbujas: '#FFD08A',
  },
};

const K_TEMA = 'ultima-gota:tema';

/** El último tema elegido en este navegador; la primera vez, noche. */
export function temaGuardado(): TemaId {
  try {
    const t = localStorage.getItem(K_TEMA);
    if (t === 'noche' || t === 'dia') return t;
  } catch { /* sin almacenamiento */ }
  return 'noche';
}

export function guardarTema(t: TemaId) {
  try { localStorage.setItem(K_TEMA, t); } catch { /* sin almacenamiento */ }
}

const kebab = (s: string) => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

/** Mete las variables CSS de los dos temas y activa uno con data-tema en <html>. */
export function aplicarTemas(tema: TemaId) {
  if (!document.getElementById('temas-css')) {
    const css = TEMA_IDS.map(id => {
      const { ui } = TEMAS[id];
      const vars = Object.entries(ui).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((c, i) => `--punto-${i}:${c}`) : [`--${kebab(k)}:${v}`]);
      return `:root[data-tema="${id}"]{${vars.join(';')}}`;
    }).join('\n');
    const style = document.createElement('style');
    style.id = 'temas-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TEMAS[tema].ui.fondo);
}
