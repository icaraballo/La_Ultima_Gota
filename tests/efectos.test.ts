import { describe, expect, it } from 'vitest';
import { config } from '../src/core/config';
import { Observador, type Evento } from '../src/core/eventos';
import { Game } from '../src/core/game';
import { pulsoCercania } from '../src/haptics/vibracion';
import { AJUSTES_DE_SERIE, sanearAjustes } from '../src/ui/ajustes';

const DT = 1 / config.stepsPerSecond;

/** Avanza `s` segundos mirando cada paso como haría la pantalla. */
function mirar(g: Game, obs: Observador, s: number) {
  const ev: Evento[] = [];
  for (let i = 0; i < Math.round(s / DT); i++) {
    g.step(DT);
    ev.push(...obs.eventos(g));
  }
  return ev;
}

describe('sonido y vibración: qué pasa (v0.14.0)', () => {
  it('un toque: un «plic» por cada gota que llega al vaso', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    const obs = new Observador(config.flowMax);
    obs.eventos(g);
    g.ready();
    g.press();
    g.release();
    const enAire = g.faucet.inAir.length; // las gotas del toque salen escalonadas
    const ev = mirar(g, obs, 2);
    const gotas = ev.filter(e => e.tipo === 'gota').length;
    expect(gotas).toBeGreaterThanOrEqual(Math.max(1, enAire));
    expect(gotas).toBeLessThanOrEqual(3);
  });

  it('el desborde y el ganador suenan una vez', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    const obs = new Observador(config.flowMax);
    g.ready();
    g.press();
    const ev = mirar(g, obs, 20);
    expect(ev.filter(e => e.tipo === 'desborde')).toEqual([{ tipo: 'desborde', piezas: false }]);
    g.continue();
    expect(obs.eventos(g)).toContainEqual({ tipo: 'ganador' });
    expect(obs.eventos(g)).toEqual([]);
  });

  it('con piezas: una por cada pieza que cae', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1, content: 'monedas' });
    const obs = new Observador(config.flowMax);
    obs.eventos(g);
    g.ready();
    g.press();
    g.release();
    const ev = obs.eventos(g);
    expect(ev).toEqual([{ tipo: 'pieza', pieza: 'monedas', nivel: expect.any(Number) }]);
  });

  it('el nivel es el que se ve: en el esmerilado no chiva el de verdad', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 4, vessel: 'esmerilado' });
    g.glass.add(0.6);
    const obs = new Observador(config.flowMax);
    expect(obs.estado(g).nivel).toBe(g.glass.shownHeight);
    expect(obs.estado(g).nivel).not.toBe(g.glass.height);
  });

  it('ronda nueva: no suena por lo que ya había', () => {
    const g = new Game(['Ana', 'Luis', 'Eva'], { seed: 1, content: 'canicas' });
    const obs = new Observador(config.flowMax);
    g.ready();
    g.press();
    mirar(g, obs, 15);
    g.release();
    if (g.phase === 'desborde') g.continue();
    expect(obs.eventos(g).filter(e => e.tipo === 'pieza')).toEqual([]);
  });
});

describe('vibración de cercanía (v0.14.0)', () => {
  it('nada por debajo del umbral; más seguido y más fuerte cuanto más cerca', () => {
    expect(pulsoCercania(config.nearBrimHapticStart - 0.01)).toBeNull();
    const lejos = pulsoCercania(config.nearBrimHapticStart)!;
    const borde = pulsoCercania(1)!;
    expect(borde.cada).toBeLessThan(lejos.cada);
    expect(borde.dura).toBeGreaterThan(lejos.dura);
    expect(pulsoCercania(1.05)).toEqual(borde);
  });
});

describe('sanearAjustes() (v0.14.0)', () => {
  it.each([null, undefined, 'x', 3, [], {}])('%j → todo encendido', raw => {
    expect(sanearAjustes(raw)).toEqual(AJUSTES_DE_SERIE);
  });
  it('solo valen true y false', () => {
    expect(sanearAjustes({ sonido: false, vibracion: 'no', cercania: 0 })).toEqual({ sonido: false, vibracion: true, cercania: true });
  });
});
