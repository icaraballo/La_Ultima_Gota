import { config } from '../core/config';
import type { Game } from '../core/game';

/** Lo que el panel necesita de la vista (2D o 3D). */
interface Vista {
  showLimit: boolean;
}

// Modo depuración (§9.2): lecturas en directo y sliders sobre config.ts para ajustar el tacto
// sin recompilar. Panel lateral plegable, nunca a pantalla completa. Los valores se guardan en
// este navegador y «Copiar valores» los da en JSON para pasarlos a config.ts.
// Solo dura la visita (?debug o mantener el título 1 s) y los sliders solo cuentan con el panel
// encendido: apagado, el juego es exactamente el de config.ts.
// Textos solo en castellano a propósito: es una herramienta, no parte del juego.

export interface Param {
  label: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(v: number): void;
}

const liq = (id: keyof typeof config.liquids, key: keyof typeof config.liquids.agua, label: string, min: number, max: number, step: number): Param => ({
  label: `${label} · ${id}`, min, max, step,
  get: () => config.liquids[id][key],
  set: v => { config.liquids[id][key] = v; },
});
const top = <K extends keyof typeof config>(key: K, label: string, min: number, max: number, step: number): Param => ({
  label, min, max, step,
  get: () => config[key] as number,
  set: v => { (config as Record<string, unknown>)[key] = v; },
});
const solido = (key: keyof typeof config.solids, label: string, min: number, max: number, step: number): Param => ({
  label, min, max, step,
  get: () => config.solids[key],
  set: v => { config.solids[key] = v; },
});
const peso = (i: number, label: string): Param => ({
  label, min: 0, max: 1, step: 0.01,
  get: () => config.dropCountWeights[i],
  set: v => { config.dropCountWeights[i] = v; },
});

const PARAMS: { grupo: string; params: Param[] }[] = [
  { grupo: 'Gesto', params: [top('tapThresholdMs', 'Umbral toque/chorro (ms)', 60, 500, 10)] },
  { grupo: 'Gotas', params: [
    top('dropVolume', 'Volumen de gota', 0.001, 0.04, 0.0005),
    top('dropVariance', 'Variación de gota (±)', 0, 0.8, 0.01),
    peso(0, 'Peso 1 gota'), peso(1, 'Peso 2 gotas'), peso(2, 'Peso 3 gotas'),
    top('dropInterval', 'Entre gotas (s)', 0.02, 0.3, 0.01),
  ] },
  { grupo: 'Chorro', params: [
    top('flowMax', 'Caudal máx (vol/s)', 0.02, 0.4, 0.005),
    top('flowRampTau', 'Arranque τ (s)', 0.05, 2, 0.05),
    top('flowNoise', 'Fluctuación (±)', 0, 0.5, 0.01),
    top('flowNoiseRate', 'Ritmo fluctuación (/s)', 0.2, 6, 0.1),
    top('fallTime', 'Caída grifo→vaso (s)', 0.05, 1, 0.01),
  ] },
  ...(['agua', 'aceite', 'cerveza', 'leche'] as const).map(id => ({
    grupo: id[0].toUpperCase() + id.slice(1),
    params: [
      liq(id, 'flowMul', 'Caudal ×', 0.2, 2, 0.05),
      liq(id, 'inertia', 'Inercia (s)', 0, 0.8, 0.01),
      liq(id, 'meniscus', 'Menisco (alto)', 0, 0.08, 0.001),
      ...(id === 'cerveza' ? [
        liq(id, 'foamPerFlow', 'Espuma por chorro', 0, 3, 0.05),
        liq(id, 'foamDecay', 'Asentado (1/s)', 0.05, 3, 0.05),
      ] : []),
      ...(id === 'leche' ? [
        liq(id, 'rise', 'Sube sola (vol/s)', 0, 0.06, 0.001),
        liq(id, 'riseGrow', 'Más rápido por turno (+)', 0, 0.6, 0.01),
      ] : []),
    ],
  })),
  { grupo: 'Canicas y monedas', params: [
    solido('marbleMin', 'Canica más pequeña (px)', 6, 30, 1),
    solido('marbleMax', 'Canica más grande (px)', 6, 34, 1),
    solido('coinScale', 'Tamaño de monedas (×)', 1, 4, 0.1),
    solido('interval', 'Una pieza cada (s) al mantener', 0.08, 0.6, 0.01),
  ] },
  { grupo: 'Ronda', params: [
    top('meniscusVariance', 'Variación oculta (±)', 0, 0.5, 0.01),
    top('turnEndDelay', 'Pausa al acabar turno (s)', 0, 2, 0.05),
  ] },
];
const ALL = PARAMS.flatMap(g => g.params);

/** Hasta la v0.7.0 la depuración se recordaba encendida: ya no se escribe y se borra al cargar. */
const K_ACTIVO = 'ultima-gota:debug';
const K_VALORES = 'ultima-gota:debug-config';
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
  },
};

const fmt = (v: number, step: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(step)));
  return v.toFixed(dec);
};
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/** Valores guardados que se pueden aplicar: solo números finitos de etiquetas que existen,
 * recortados al rango de su slider. Lo demás se ignora. */
export function sanearValores(guardados: unknown, params: readonly Pick<Param, 'label' | 'min' | 'max'>[]): Record<string, number> {
  const valores: Record<string, number> = {};
  if (!guardados || typeof guardados !== 'object' || Array.isArray(guardados)) return valores;
  for (const p of params) {
    const v = (guardados as Record<string, unknown>)[p.label];
    if (typeof v === 'number' && Number.isFinite(v)) valores[p.label] = Math.min(p.max, Math.max(p.min, v));
  }
  return valores;
}

export function createDebug(root: HTMLElement, barra: Vista) {
  const defaults = ALL.map(p => p.get());
  // Valores guardados de otra sesión (JSON roto: como si no hubiera).
  const guardados = () => {
    try { return sanearValores(JSON.parse(store.get(K_VALORES) ?? 'null'), ALL); } catch { return {}; }
  };

  store.set(K_ACTIVO, null);
  let active = new URLSearchParams(location.search).has('debug');

  const el = document.createElement('div');
  el.className = 'debug';
  el.innerHTML = `
    <div class="debug-mini" id="dbg-mini"></div>
    <button class="debug-abrir" id="dbg-abrir" aria-label="Depuración">⚙</button>
    <aside class="debug-panel" id="dbg-panel" hidden>
      <div class="debug-cab"><strong>Depuración</strong><button id="dbg-cerrar">×</button></div>
      <pre id="dbg-lecturas"></pre>
      <label class="debug-check"><input type="checkbox" id="dbg-limite"> Ver el límite de la ronda</label>
      ${PARAMS.map(g => `
        <h3>${g.grupo}</h3>
        ${g.params.map(p => {
          const i = ALL.indexOf(p);
          return `<label class="debug-param">
            <span>${p.label} <b id="dbg-v${i}"></b></span>
            <input type="range" data-i="${i}" min="${p.min}" max="${p.max}" step="${p.step}">
          </label>`;
        }).join('')}`).join('')}
      <p class="debug-nota">El menisco y su variación se aplican en la ronda siguiente.</p>
      <div class="debug-botones">
        <button id="dbg-copiar">Copiar valores</button>
        <button id="dbg-reset">Restablecer</button>
      </div>
      <p class="debug-nota" id="dbg-aviso"></p>
    </aside>`;
  root.appendChild(el);
  const $ = (id: string) => el.querySelector('#' + id) as HTMLElement;
  const panel = $('dbg-panel');

  function syncSliders() {
    ALL.forEach((p, i) => {
      (el.querySelector(`input[data-i="${i}"]`) as HTMLInputElement).value = String(p.get());
      $('dbg-v' + i).textContent = fmt(p.get(), p.step);
    });
  }
  function save() {
    const changed: Record<string, number> = {};
    ALL.forEach((p, i) => { if (p.get() !== defaults[i]) changed[p.label] = p.get(); });
    store.set(K_VALORES, Object.keys(changed).length ? JSON.stringify(changed) : null);
  }
  /** Encendida, los valores guardados; apagada, los de serie. */
  function aplicar() {
    const valores = active ? guardados() : {};
    ALL.forEach((p, i) => p.set(valores[p.label] ?? defaults[i]));
    syncSliders();
  }
  function render() {
    el.hidden = !active;
    barra.showLimit = active && ($('dbg-limite') as HTMLInputElement).checked;
  }

  el.addEventListener('input', e => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.i === undefined) { render(); return; }
    const i = +input.dataset.i;
    ALL[i].set(+input.value);
    $('dbg-v' + i).textContent = fmt(ALL[i].get(), ALL[i].step);
    save();
  });
  $('dbg-abrir').addEventListener('click', () => { panel.hidden = !panel.hidden; });
  $('dbg-cerrar').addEventListener('click', () => { panel.hidden = true; });
  $('dbg-reset').addEventListener('click', () => {
    ALL.forEach((p, i) => p.set(defaults[i]));
    save();
    syncSliders();
  });
  $('dbg-copiar').addEventListener('click', async () => {
    const valores = {
      ...Object.fromEntries((Object.keys(config) as (keyof typeof config)[])
        .filter(k => typeof config[k] === 'number' || Array.isArray(config[k])).map(k => [k, config[k]])),
      liquids: config.liquids,
      solids: config.solids,
    };
    const txt = JSON.stringify(valores, null, 1);
    try {
      await navigator.clipboard.writeText(txt);
      $('dbg-aviso').textContent = 'Copiado.';
    } catch {
      $('dbg-aviso').textContent = txt;
    }
  });

  aplicar();
  render();

  let lastText = 0;
  return {
    toggle() {
      active = !active;
      aplicar();
      render();
    },
    update(game: Game) {
      if (!active) return;
      const now = performance.now();
      if (now - lastText < 100) return;
      lastText = now;
      const { glass, faucet } = game;
      const aire = faucet.inAir.reduce((s, p) => s + p.volume, 0);
      const ultimo = game.history[game.history.length - 1];
      $('dbg-mini').textContent = game.pile
        ? `${game.pile.fill.count} piezas · ${pct(game.pile.fill.height)}`
        : `${pct(glass.volume)} / ${pct(glass.limit)}`;
      $('dbg-lecturas').textContent = [
        `ronda ${game.round} · ${game.contentId} en ${game.vesselId} · ${game.phase}`,
        ...(game.pile ? [`piezas    ${game.pile.fill.count} dentro de ${game.pile.pieces.length}`, `montón    ${pct(game.pile.fill.height)} del vaso`] : []),
        `volumen   ${pct(glass.volume)}`,
        `espuma    ${pct(glass.foam)}`,
        `altura    ${pct(glass.height)}`,
        `límite    ${pct(glass.limit)} (margen ${pct(glass.margin)})`,
        `peligro   ${pct(glass.danger)}`,
        `caudal    ${faucet.flow.toFixed(3)} vol/s`,
        `en el aire ${pct(aire)}`,
        `pulsación ${Math.round((game.pressing ? 0 : game.lastHeld) * 1000)} ms`,
        ultimo ? `último turno: ${pct(ultimo.poured)} · dudó ${ultimo.hesitation.toFixed(1)} s` : '',
      ].join('\n');
    },
  };
}
