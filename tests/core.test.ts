import { describe, expect, it } from 'vitest';
import { config } from '../src/core/config';
import { Game } from '../src/core/game';
import { Glass } from '../src/core/glass-state';
import { getLiquid } from '../src/core/liquids';
import { Faucet } from '../src/core/pour';
import { createRng } from '../src/core/rng';
import { getVessel, makeVessel } from '../src/core/vessels';

const DT = 1 / config.stepsPerSecond;
const agua = getLiquid('agua');

/** Avanza el grifo `s` segundos y devuelve lo que ha llegado al vaso. */
function run(f: Faucet, s: number) {
  let v = 0;
  for (let i = 0; i < Math.round(s / DT); i++) v += f.step(DT);
  return v;
}

describe('rng', () => {
  it('la misma semilla da la misma serie', () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('weighted respeta los pesos', () => {
    const r = createRng(1);
    const n = [0, 0, 0];
    for (let i = 0; i < 20000; i++) n[r.weighted([0.7, 0.22, 0.08])]++;
    expect(n[0] / 20000).toBeCloseTo(0.70, 1);
    expect(n[1] / 20000).toBeCloseTo(0.22, 1);
    expect(n[2] / 20000).toBeCloseTo(0.08, 1);
  });
});

describe('vasos', () => {
  it('en el cilindro el nivel sube igual que el volumen', () => {
    const c = getVessel('cilindro');
    for (const v of [0, 0.1, 0.5, 0.9, 1]) expect(c.volumeToHeight(v)).toBeCloseTo(v, 5);
  });

  it('un cono invertido (r = h) cumple V = h³', () => {
    const cono = makeVessel('cono', h => h);
    expect(cono.heightToVolume(0.5)).toBeCloseTo(0.125, 3);
    expect(cono.volumeToHeight(0.125)).toBeCloseTo(0.5, 3);
  });

  it('por encima del borde sigue subiendo (menisco)', () => {
    const c = getVessel('cilindro');
    expect(c.volumeToHeight(1.02)).toBeCloseTo(1.02, 5);
  });
});

describe('gotas', () => {
  it('un toque suelta 1, 2 o 3 gotas con ~70/22/8 %', () => {
    const f = new Faucet(agua, createRng(7), config);
    const n = [0, 0, 0, 0];
    for (let i = 0; i < 5000; i++) n[f.tap()]++;
    expect(n[1] / 5000).toBeCloseTo(0.70, 1);
    expect(n[2] / 5000).toBeCloseTo(0.22, 1);
    expect(n[3] / 5000).toBeCloseTo(0.08, 1);
  });

  it('cada gota está dentro de ±30 % y llega tras el tiempo de caída', () => {
    const f = new Faucet(agua, createRng(3), config);
    f.tap();
    f.step(DT);
    const gota = f.inAir[0];
    expect(gota.volume).toBeGreaterThanOrEqual(config.dropVolume * 0.7);
    expect(gota.volume).toBeLessThanOrEqual(config.dropVolume * 1.3);
    expect(run(f, config.fallTime - 2 * DT)).toBe(0);
    expect(run(f, 4 * DT)).toBeCloseTo(gota.volume, 10);
  });
});

describe('chorro', () => {
  it('arranca poco a poco', () => {
    const f = new Faucet(agua, createRng(1), config);
    f.startStream();
    f.step(DT);
    expect(f.flow).toBeLessThan(config.flowMax * 0.1);
    run(f, 3);
    expect(f.flow).toBeGreaterThan(config.flowMax * (1 - config.flowNoise) * 0.95);
    expect(f.flow).toBeLessThan(config.flowMax * (1 + config.flowNoise) * 1.01);
  });

  it('la misma duración no echa siempre lo mismo (fluctuación)', () => {
    const echado = [1, 2, 3, 4, 5].map(seed => {
      const f = new Faucet(agua, createRng(seed), config);
      f.startStream();
      const durante = run(f, 2);
      f.stopStream();
      return durante + run(f, 2);
    });
    expect(new Set(echado.map(v => v.toFixed(6))).size).toBe(5);
  });

  it('al soltar sigue cayendo ≈ caudal × inercia, más lo que ya está en el aire', () => {
    const f = new Faucet(agua, createRng(1), config);
    f.startStream();
    run(f, 3);
    const flujo = f.flow;
    const enElAire = f.inAir.reduce((s, p) => s + p.volume, 0);
    f.stopStream();
    const resto = run(f, 3);
    expect(resto - enElAire).toBeCloseTo(flujo * agua.inertia, 2);
    expect(f.quiet).toBe(true);
  });

  it('mantener pulsado nunca echa menos que un toque (el chorro abre con sus gotas)', () => {
    const f = new Faucet(agua, createRng(1), config);
    f.startStream();
    f.step(DT);
    f.stopStream();
    expect(run(f, 3)).toBeGreaterThanOrEqual(config.dropVolume * (1 - config.dropVariance));
  });

  it('unos 8 s a tope llenan el cilindro', () => {
    const f = new Faucet(agua, createRng(1), config);
    f.startStream();
    const v = run(f, 8 + config.flowRampTau + config.fallTime);
    expect(v).toBeGreaterThan(0.8);
    expect(v).toBeLessThan(1.2);
  });
});

describe('menisco y desborde', () => {
  it('no desborda en el borde: aguanta el margen de la ronda', () => {
    const g = new Glass(getVessel('cilindro'), agua, createRng(5), config);
    g.add(1);
    expect(g.overflowed).toBe(false);
    g.add(g.margin * 0.99);
    expect(g.overflowed).toBe(false);
    g.add(g.margin * 0.02);
    expect(g.overflowed).toBe(true);
    g.add(0.5);
    expect(g.volume).toBe(g.limit); // lo de más se derrama
  });

  it('el margen varía ±10 % por ronda', () => {
    const margenes = Array.from({ length: 200 }, (_, i) => new Glass(getVessel('cilindro'), agua, createRng(i), config).margin);
    expect(Math.min(...margenes)).toBeGreaterThanOrEqual(agua.meniscus * 0.9);
    expect(Math.max(...margenes)).toBeLessThanOrEqual(agua.meniscus * 1.1);
    expect(new Set(margenes).size).toBeGreaterThan(150);
  });
});

/** Un turno: mantiene `s` segundos (0 = toque), suelta y espera a que acabe el turno. */
function pour(g: Game, s: number) {
  g.press();
  for (let i = 0; i < Math.max(1, Math.round(s / DT)); i++) g.step(DT);
  g.release();
  for (let i = 0; i < 600 && g.phase === 'echando'; i++) g.step(DT);
}

describe('partida', () => {
  it('toque corto = gotas; mantener = chorro', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    g.ready();
    pour(g, 0.05);
    expect(g.glass.volume).toBeLessThan(config.dropVolume * 3 * 1.3 + 1e-9);
    const tras = g.glass.volume;
    g.ready();
    pour(g, 1);
    expect(g.glass.volume - tras).toBeGreaterThan(config.dropVolume * 4);
  });

  it('una sola pulsación por turno: al soltar y caer todo, pasa al siguiente', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    g.ready();
    const antes = g.current;
    g.press();
    g.step(DT);
    g.release();
    expect(g.poured).toBe(true);
    g.press(); // segunda pulsación: no cuenta
    expect(g.pressing).toBe(false);
    for (let i = 0; i < 20; i++) g.step(DT);
    expect(g.phase).toBe('echando'); // la gota aún cae
    for (let i = 0; i < Math.round((config.fallTime + config.turnEndDelay) / DT) + 30; i++) g.step(DT);
    expect(g.phase).toBe('turno');
    expect(g.current).not.toBe(antes);
    expect(g.history).toHaveLength(1);
  });

  it('sin pulsar no se pasa de turno', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    g.ready();
    for (let i = 0; i < 600; i++) g.step(DT);
    expect(g.phase).toBe('echando');
  });

  it('quien desborda queda eliminado; con 2 jugadores es una sola ronda', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 2 });
    g.ready();
    const quien = g.current;
    pour(g, 20);
    expect(g.phase).toBe('desborde');
    expect(g.loser).toBe(quien);
    expect(g.players[quien].alive).toBe(false);
    g.continue();
    expect(g.phase).toBe('fin');
    expect(g.winner).toBe(1 - quien);
  });

  it('si desborda lo que cae después de soltar, pierde quien echó', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 4 });
    g.ready();
    const quien = g.current;
    // Mantener hasta casi el límite: la inercia y lo que está en el aire lo rematan.
    g.press();
    while (g.glass.volume + g.faucet.inAir.reduce((a, p) => a + p.volume, 0) < g.glass.limit) g.step(DT);
    g.release();
    for (let i = 0; i < 600 && g.phase === 'echando'; i++) g.step(DT);
    expect(g.phase).toBe('desborde');
    expect(g.loser).toBe(quien);
  });

  it('tras eliminar, ronda nueva con los que quedan, vaso vacío y orden sorteado', () => {
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 9 });
    g.ready();
    pour(g, 20);
    g.continue();
    expect(g.round).toBe(2);
    expect(g.phase).toBe('turno');
    expect(g.order).toHaveLength(3);
    expect(g.order).not.toContain(g.loser ?? -1);
    expect(g.glass.volume).toBe(0);
  });

  it('una partida entera con bots acaba con un ganador, y se repite con la misma semilla', () => {
    const jugar = (seed: number) => {
      const g = new Game(['A', 'B', 'C', 'D', 'E'], { seed });
      const r = createRng(seed + 1000);
      for (let paso = 0; paso < 10000 && g.phase !== 'fin'; paso++) {
        if (g.phase === 'turno') g.ready();
        else if (g.phase === 'desborde') g.continue();
        else pour(g, r.next() < 0.4 ? 0 : r.next() * 2);
      }
      return { winner: g.winner, turnos: g.history.length };
    };
    const a = jugar(11);
    expect(a.winner).not.toBeNull();
    expect(jugar(11)).toEqual(a);
  });
});

describe('contenido: vasos, líquidos y espuma', () => {
  it('copa: sube rápido al principio y despacio al final', () => {
    const copa = getVessel('copa');
    expect(copa.volumeToHeight(0.1)).toBeGreaterThan(0.2);
    expect(copa.volumeToHeight(1) - copa.volumeToHeight(0.9)).toBeLessThan(0.06);
  });

  it('botella: el cuello es poco volumen y sube muchísimo', () => {
    const b = getVessel('botella');
    expect(1 - b.heightToVolume(0.75)).toBeLessThan(0.06);
    expect(b.volumeToHeight(0.5)).toBeLessThan(0.45);
  });

  it('el menisco es altura: en la botella aguanta mucho menos volumen que en la copa', () => {
    const g = (v: 'botella' | 'copa') => new Glass(getVessel(v), agua, createRng(1), config);
    expect(g('botella').limit - 1).toBeLessThan(g('copa').limit - 1);
  });

  it('cerveza: el chorro fuerte hace espuma, se asienta y también desborda', () => {
    const cerveza = getLiquid('cerveza');
    const f = new Faucet(cerveza, createRng(1), config);
    const g = new Glass(getVessel('cilindro'), cerveza, createRng(1), config);
    f.startStream();
    for (let i = 0; i < 120; i++) { g.step(DT); g.add(f.step(DT), f.arrivedFoam); }
    expect(g.foam).toBeGreaterThan(0.02);
    f.stopStream();
    const antes = g.foam;
    for (let i = 0; i < 240; i++) { g.step(DT); g.add(f.step(DT), f.arrivedFoam); }
    expect(g.foam).toBeLessThan(antes * 0.5);
    g.add(g.limit - g.total - 0.001, 0);
    expect(g.overflowed).toBe(false);
    g.add(0, 0.01);
    expect(g.overflowed).toBe(true);
  });

  it('el agua no hace espuma', () => {
    const f = new Faucet(agua, createRng(1), config);
    f.startStream();
    let espuma = 0;
    for (let i = 0; i < 120; i++) { f.step(DT); espuma += f.arrivedFoam; }
    expect(espuma).toBe(0);
  });

  it('aleatorio: se sortea al empezar y, si se pide, en cada ronda', () => {
    const vistos = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const g = new Game(['A', 'B'], { seed, vessel: 'aleatorio', liquid: 'aleatorio' });
      vistos.add(`${g.vesselId}-${g.liquidId}`);
    }
    expect(vistos.size).toBeGreaterThan(5);
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 3, vessel: 'aleatorio', liquid: 'aleatorio', changeEachRound: true });
    const rondas = new Set<string>();
    for (let i = 0; i < 3; i++) {
      rondas.add(`${g.vesselId}-${g.liquidId}`);
      g.ready();
      pour(g, 30);
      g.continue();
    }
    expect(rondas.size).toBeGreaterThan(1);
  });

  it('las 9 combinaciones se juegan hasta un ganador', () => {
    for (const vessel of ['cilindro', 'copa', 'botella'] as const) {
      for (const liquid of ['agua', 'aceite', 'cerveza'] as const) {
        const g = new Game(['A', 'B', 'C'], { seed: 5, vessel, liquid });
        const r = createRng(9);
        for (let paso = 0; paso < 3000 && g.phase !== 'fin'; paso++) {
          if (g.phase === 'turno') g.ready();
          else if (g.phase === 'desborde') g.continue();
          else pour(g, r.next() < 0.4 ? 0 : r.next() * 2);
        }
        expect(g.winner, `${liquid} en ${vessel}`).not.toBeNull();
      }
    }
  });
});
