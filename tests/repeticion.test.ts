import { describe, expect, it } from 'vitest';
import { config } from '../src/core/config';
import { Game } from '../src/core/game';
import { Grabadora, REPETICION } from '../src/render/repeticion';

const DT = 1 / config.stepsPerSecond;

/** Juega como en la app (grabando mientras se echa) hasta el desborde y un poco más. */
function hastaDesborde(g: Game, rec: Grabadora) {
  g.ready();
  rec.reset();
  g.press();
  for (let i = 0; i < 60 * 60 && !rec.lista; i++) {
    g.step(DT);
    if (g.phase === 'echando' || g.phase === 'desborde') rec.grabar(g);
  }
}

describe('repetición a cámara lenta (v0.13.0)', () => {
  it('con agua: empieza antes del desborde y acaba después, despacio', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    const rec = new Grabadora(DT);
    hastaDesborde(g, rec);
    expect(g.phase).toBe('desborde');
    expect(rec.lista).toBe(true);
    const ver = rec.reproductor(g);
    const ini = ver(0);
    expect(ini.glass.overflowed).toBe(false);
    expect(ini.glass).not.toBe(g.glass); // otro vaso: los dibujos reinician el derrame
    expect(ini.glass.volume).toBeLessThan(g.glass.volume);
    expect(ver(rec.duracion).glass.overflowed).toBe(true);
    // Dura lo pedido, a la velocidad pedida.
    const esperado = (REPETICION.antes + REPETICION.despues) / REPETICION.velocidad;
    expect(rec.duracion).toBeGreaterThan(esperado - 0.2);
    expect(rec.duracion).toBeLessThan(esperado + 0.2);
    // Pasado el final, se queda en la última imagen.
    expect(ver(rec.duracion + 5).glass.volume).toBe(ver(rec.duracion).glass.volume);
  });

  it('con piezas: guarda copias, no las piezas que siguen moviéndose', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 2, content: 'canicas', vessel: 'chupito' });
    const rec = new Grabadora(DT);
    for (let k = 0; k < 20 && g.phase !== 'desborde'; k++) {
      if (g.phase === 'turno') hastaDesborde(g, rec);
      if (g.phase === 'echando') { g.release(); for (let i = 0; i < 600 && g.phase === 'echando'; i++) g.step(DT); }
    }
    expect(g.phase).toBe('desborde');
    const ver = rec.reproductor(g);
    const fin = ver(rec.duracion);
    expect(fin.pile!.out).not.toBeNull();
    expect(fin.pile!.pieces).not.toBe(g.pile!.pieces);
    expect(ver(0).pile!.out).toBeNull();
    expect(fin.glass.overflowed).toBe(false); // sin regueros de agua en un vaso de canicas
  });

  it('un turno nuevo borra lo grabado', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    const rec = new Grabadora(DT);
    hastaDesborde(g, rec);
    rec.reset();
    expect(rec.lista).toBe(false);
    expect(rec.duracion).toBe(0);
  });
});
