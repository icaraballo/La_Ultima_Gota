import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TEMA_IDS, TEMAS } from '../src/render/temas';

// Retoque de arte (v0.16.0): los colores nuevos de la escena, en los dos temas, y la letra de los
// nombres (UB-08).

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('temas: colores del retoque de arte (v0.16.0)', () => {
  for (const id of TEMA_IDS) {
    it(`${id}: botellas, viñeta y su opacidad`, () => {
      const c = TEMAS[id].escena;
      expect(c.botellas).toHaveLength(3);
      for (const b of c.botellas) expect(b).toMatch(HEX);
      expect(c.vineta).toMatch(HEX);
      expect(c.vinetaOpacidad).toBeGreaterThanOrEqual(0);
      expect(c.vinetaOpacidad).toBeLessThanOrEqual(1);
    });
  }
});

describe('letra (UB-08)', () => {
  it("estilos.css no pide 'Fredoka' sin Variable: la letra alojada se llama 'Fredoka Variable'", () => {
    const css = readFileSync(new URL('../src/ui/estilos.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/'Fredoka'(?! Variable)/);
    expect(css).toMatch(/'Fredoka Variable'/);
  });
});
