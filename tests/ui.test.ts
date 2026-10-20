import { describe, expect, it } from 'vitest';
import { config } from '../src/core/config';
import { sanearValores } from '../src/ui/debug';
import { esc } from '../src/ui/html';
import { MAX_NOMBRE, sanearPreparacion } from '../src/ui/preparacion';

// Lo que llega de fuera (nombres que escribe la gente y lo guardado en localStorage) nunca puede
// romper una pantalla. Revisión antes de publicar el enlace, 20-10-2026.

describe('esc()', () => {
  it('escapa los cinco caracteres de HTML', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('un nombre hostil sale sin ningún < ni >', () => {
    const fuera = esc('<img src=x onerror=alert(1)>');
    expect(fuera).not.toMatch(/[<>]/);
    expect(fuera).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('deja igual lo que no es HTML', () => {
    expect(esc('Íñigo 👍🏽')).toBe('Íñigo 👍🏽');
  });
});

describe('sanearPreparacion()', () => {
  const base = { names: ['', ''], vessel: 'cilindro', liquid: 'agua', randomOrder: false };

  it.each([null, undefined, 3, 'texto', [], {}])('%j → la preparación base', raw => {
    expect(sanearPreparacion(raw)).toEqual(base);
  });
  it('nombres que no son texto pasan a texto vacío', () => {
    expect(sanearPreparacion({ names: [1, {}, null, 'Ana'] }).names).toEqual(['', '', '', 'Ana']);
  });
  it(`con menos de ${config.minPlayers} nombres rellena y con más de ${config.maxPlayers} corta`, () => {
    expect(sanearPreparacion({ names: ['Ana'] }).names).toEqual(['Ana', '']);
    expect(sanearPreparacion({ names: Array(15).fill('X') }).names).toHaveLength(config.maxPlayers);
  });
  it(`recorta cada nombre a ${MAX_NOMBRE} caracteres`, () => {
    expect(sanearPreparacion({ names: ['A'.repeat(20), 'B'] }).names[0]).toBe('A'.repeat(MAX_NOMBRE));
  });
  it('vaso y contenido desconocidos vuelven a los de serie', () => {
    const p = sanearPreparacion({ names: ['A', 'B'], vessel: 'pecera', liquid: 'leche' });
    expect(p.vessel).toBe('cilindro');
    expect(p.liquid).toBe('agua');
  });
  it('orden aleatorio solo si es true', () => {
    expect(sanearPreparacion({ randomOrder: 'si' }).randomOrder).toBe(false);
    expect(sanearPreparacion({ randomOrder: 1 }).randomOrder).toBe(false);
    expect(sanearPreparacion({ randomOrder: true }).randomOrder).toBe(true);
  });
  it('una preparación válida sale idéntica', () => {
    const p = { names: ['Ana', 'Íñigo', '👍🏽 Leo'], vessel: 'aleatorio', liquid: 'monedas', randomOrder: true };
    expect(sanearPreparacion(p)).toEqual(p);
    expect(sanearPreparacion({ ...p, vessel: 'botella', liquid: 'aleatorio' })).toEqual({ ...p, vessel: 'botella', liquid: 'aleatorio' });
  });
});

describe('sanearValores()', () => {
  const params = [
    { label: 'Caudal máx (vol/s)', min: 0.02, max: 0.4 },
    { label: 'Umbral toque/chorro (ms)', min: 60, max: 500 },
  ];
  it('fuera de rango se recorta al slider', () => {
    expect(sanearValores({ 'Caudal máx (vol/s)': 99, 'Umbral toque/chorro (ms)': -5 }, params))
      .toEqual({ 'Caudal máx (vol/s)': 0.4, 'Umbral toque/chorro (ms)': 60 });
  });
  it('dentro de rango se queda igual', () => {
    expect(sanearValores({ 'Caudal máx (vol/s)': 0.1 }, params)).toEqual({ 'Caudal máx (vol/s)': 0.1 });
  });
  it('texto, null, no finitos y etiquetas desconocidas se ignoran', () => {
    expect(sanearValores({ 'Caudal máx (vol/s)': '0.1', 'Umbral toque/chorro (ms)': null, 'Ya no existe': 3 }, params)).toEqual({});
    expect(sanearValores({ 'Caudal máx (vol/s)': Infinity, 'Umbral toque/chorro (ms)': NaN }, params)).toEqual({});
  });
  it.each([null, 'texto', 3, [1, 2]])('%j → nada', raw => {
    expect(sanearValores(raw, params)).toEqual({});
  });
});
