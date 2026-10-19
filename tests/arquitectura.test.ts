import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// La regla más importante del código (§9.1 del documento de arranque): la física y las reglas
// no saben nada de Three.js ni del DOM. Este test lo vigila para que no se cuele sin querer.
const CORE = join(import.meta.dirname, '..', 'src', 'core');
const PROHIBIDO = [/from ['"]three/, /\bdocument\./, /\bwindow\./, /\bnavigator\./, /from ['"]\.\.\/(render|ui|audio|haptics)/];

describe('core/', () => {
  const ficheros = readdirSync(CORE).filter(f => f.endsWith('.ts'));

  it.each(ficheros.length ? ficheros : ['(vacío)'])('%s no depende de DOM ni de Three.js', f => {
    if (f === '(vacío)') return;
    const codigo = readFileSync(join(CORE, f), 'utf8');
    for (const patron of PROHIBIDO) expect(codigo).not.toMatch(patron);
  });
});
