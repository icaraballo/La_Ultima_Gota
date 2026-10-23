import { describe, expect, it } from 'vitest';
import { config } from '../src/core/config';
import { sanearValores } from '../src/ui/debug';
import { esc } from '../src/ui/html';
import { MAX_NOMBRE, sanearPreparacion } from '../src/ui/preparacion';
import { cuerpoOpinion, OPINION_CAMPOS, OPINION_ENTRIES } from '../src/ui/opinion';
import { t } from '../src/i18n';
import { CSP } from '../vite.config';
import { readFileSync } from 'node:fs';

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
  const base = { names: ['', ''], vessel: 'cilindro', liquid: 'agua', randomOrder: false, turnTime: 0 };

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
    const p = sanearPreparacion({ names: ['A', 'B'], vessel: 'faja', liquid: 'miel' });
    expect(p.vessel).toBe('cilindro');
    expect(p.liquid).toBe('agua');
  });
  it('orden aleatorio solo si es true', () => {
    expect(sanearPreparacion({ randomOrder: 'si' }).randomOrder).toBe(false);
    expect(sanearPreparacion({ randomOrder: 1 }).randomOrder).toBe(false);
    expect(sanearPreparacion({ randomOrder: true }).randomOrder).toBe(true);
  });
  it('tiempo por turno: solo 10 o 5 s; lo demás, sin límite', () => {
    expect(sanearPreparacion({ turnTime: 10 }).turnTime).toBe(10);
    expect(sanearPreparacion({ turnTime: 5 }).turnTime).toBe(5);
    for (const v of [7, '10', -5, null, 0]) expect(sanearPreparacion({ turnTime: v }).turnTime).toBe(0);
  });
  it('una preparación válida sale idéntica', () => {
    const p = { names: ['Ana', 'Íñigo', '👍🏽 Leo'], vessel: 'aleatorio', liquid: 'monedas', randomOrder: true, turnTime: 5 };
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

describe('Opinar (v0.7.3)', () => {
  it('sin nada escrito no se envía', () => {
    expect(cuerpoOpinion({ 'entry.1': '  ' }, { version: 'v0.7.3' })).toBeNull();
  });
  it('solo las preguntas escritas, los datos que haya y pageHistory', () => {
    const c = cuerpoOpinion({ 'entry.1': ' hola ', 'entry.2': '' }, { version: 'v0.7.3', modo: 'Copa · Agua', momento: '' })!;
    expect(c).toContain('entry.1=hola');
    expect(c).not.toContain('entry.2=');
    expect(c).toContain(`${OPINION_CAMPOS.version}=v0.7.3`);
    expect(c).toContain(`${OPINION_CAMPOS.modo}=${encodeURIComponent('Copa · Agua')}`);
    expect(c).not.toContain(`${OPINION_CAMPOS.momento}=`);
    expect(c.endsWith(`pageHistory=${encodeURIComponent('0,1')}`)).toBe(true);
  });
  it('una pregunta por cada entry del formulario', () => {
    expect(t.opinionPreguntas).toHaveLength(OPINION_ENTRIES.length);
  });
});

describe('Privacidad (v0.7.3)', () => {
  const llano = (s: string) => s.replace(/<\/?b>|\*\*/g, '').replace(/\s+/g, ' ');
  const readme = llano(readFileSync(new URL('../README.md', import.meta.url), 'utf8'));
  const enJuego = llano(t.privacidadTexto.join(' '));
  it.each(['no tiene servidor, ni cuentas, ni analítica, ni cookies', 'Nada de eso sale de tu móvil',
    'va a un formulario de Google', 'ven tu dirección IP'])('«%s», en el juego y en el README', frase => {
    expect(enJuego).toContain(frase);
    expect(readme).toContain(frase);
  });
  it('la CSP deja conectarse al formulario y a nada más de fuera', () => {
    expect(CSP).toContain("connect-src 'self' https://docs.google.com;");
  });
});
