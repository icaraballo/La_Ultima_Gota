import { CONTENT_IDS } from '../src/core/contents';
import { describe, expect, it } from 'vitest';
import { config } from '../src/core/config';
import { Game, type TurnRecord } from '../src/core/game';
import { computeStats } from '../src/core/stats';
import { Glass } from '../src/core/glass-state';
import { getLiquid } from '../src/core/liquids';
import { Faucet } from '../src/core/pour';
import { createRng } from '../src/core/rng';
import { Pile } from '../src/core/solids';
import { getVessel, makeVessel, VESSEL_IDS } from '../src/core/vessels';

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

/** Piezas grandes y un puñado rápido: desbordan en segundos. Para tests de reglas, no de tacto. */
const rapido = { ...config, solids: { ...config.solids, marbleMin: 28, marbleMax: 32, coinScale: 3.2, interval: 0.1 } };

/** Mantiene pulsado hasta desbordar (como mucho 40 s) y suelta. */
function pourToOverflow(g: Game) {
  g.press();
  for (let i = 0; i < 40 / DT && g.phase === 'echando'; i++) g.step(DT);
  g.release();
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

  it('tras eliminar, ronda nueva con los que quedan y el vaso vacío', () => {
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 9 });
    g.ready();
    pour(g, 20);
    const eliminado = g.loser!;
    g.continue();
    expect(g.round).toBe(2);
    expect(g.phase).toBe('turno');
    expect(g.order).toHaveLength(3);
    expect(g.order).not.toContain(eliminado);
    expect(g.glass.volume).toBe(0);
  });

  /** Turnos de solo una gota hasta que le toque a `quien`, que desborda. */
  function eliminar(g: Game, quien: number) {
    while (g.current !== quien) { g.ready(); pour(g, 0.05); }
    g.ready();
    pour(g, 20);
    expect(g.loser).toBe(quien);
  }

  it('sin orden aleatorio, se juega en el orden de la lista', () => {
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 3 });
    expect(g.order).toEqual([0, 1, 2, 3]);
    const turnos: number[] = [];
    for (let i = 0; i < 6; i++) { turnos.push(g.current); g.ready(); pour(g, 0.05); }
    expect(turnos).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it('con orden aleatorio, se baraja una vez y vale para todas las rondas', () => {
    const ordenes = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const g = new Game(['A', 'B', 'C', 'D', 'E'], { seed, randomOrder: true });
      expect([...g.baseOrder].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(g.order).toEqual(g.baseOrder);
      ordenes.add(g.baseOrder.join());
      eliminar(g, g.baseOrder[2]);
      g.continue();
      // Ronda 2: el mismo orden sin el eliminado, empezando por el siguiente a él.
      expect(g.order).toEqual([...g.baseOrder.slice(3), ...g.baseOrder.slice(0, 2)]);
    }
    expect(ordenes.size).toBeGreaterThan(10);
  });

  it('tras eliminar a B en A-B-C-D, la ronda 2 empieza por C y sigue C-D-A', () => {
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 7 });
    eliminar(g, 1);
    g.continue();
    expect(g.order).toEqual([2, 3, 0]);
    expect(g.current).toBe(2);
  });

  it('si el eliminado es el último de la lista, empieza el primero vivo', () => {
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 7 });
    eliminar(g, 3);
    g.continue();
    expect(g.order).toEqual([0, 1, 2]);
    // Y si luego cae el primero (A), empieza B.
    eliminar(g, 0);
    g.continue();
    expect(g.order).toEqual([1, 2]);
  });

  it('de 2 a 10 jugadores', () => {
    const nombres = (n: number) => Array.from({ length: n }, (_, i) => `J${i + 1}`);
    expect(() => new Game(nombres(10), { seed: 1 })).not.toThrow();
    expect(() => new Game(nombres(11), { seed: 1 })).toThrow();
    expect(() => new Game(nombres(1), { seed: 1 })).toThrow();
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

  it('pecera: a medio vaso de altura lleva más de la mitad, y la boca sube muchísimo', () => {
    const p = getVessel('pecera');
    expect(p.heightToVolume(0.5)).toBeGreaterThan(0.55);
    expect(1 - p.heightToVolume(0.85)).toBeLessThan(0.06);
  });

  it('tarta: cada piso sube más rápido que el de abajo', () => {
    const t = getVessel('tarta');
    const ritmo = (h: number) => 0.02 / (t.heightToVolume(h + 0.01) - t.heightToVolume(h - 0.01));
    expect(ritmo(0.5)).toBeGreaterThan(1.8 * ritmo(0.2));
    expect(ritmo(0.85)).toBeGreaterThan(2.5 * ritmo(0.5));
  });

  it('chupito: bajo y pequeño, la misma gota sube mucho más', () => {
    const c = getVessel('chupito');
    expect(c.height).toBeLessThan(0.5);
    expect(c.capacity).toBeLessThan(0.25);
    expect(getVessel('cilindro').capacity).toBeCloseTo(1);
    const g = new Glass(c, agua, createRng(1), config);
    g.add(0.05);
    expect(g.volume).toBeCloseTo(0.05 / c.capacity);
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

  it('aleatorio: se sortea al empezar y no cambia entre rondas si no se pide', () => {
    const vistos = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const g = new Game(['A', 'B'], { seed, vessel: 'aleatorio', content: 'aleatorio' });
      vistos.add(`${g.vesselId}-${g.contentId}`);
    }
    expect(vistos.size).toBeGreaterThan(5);
    const g = new Game(['A', 'B', 'C', 'D'], { seed: 3, vessel: 'aleatorio', content: 'aleatorio' });
    const primera = `${g.vesselId}-${g.contentId}`;
    for (let i = 0; i < 3; i++) {
      g.ready();
      pour(g, 30);
      g.continue();
      expect(`${g.vesselId}-${g.contentId}`).toBe(primera);
    }
  });

  it('continue() mantiene vaso y líquido; continue(true) da una combinación no jugada', () => {
    const otra = new Game(['A', 'B', 'C'], { seed: 21, vessel: 'copa', content: 'cerveza' });
    otra.ready();
    pour(otra, 30);
    otra.continue();
    expect([otra.vesselId, otra.contentId]).toEqual(['copa', 'cerveza']);
    // 3 vasos × 5 contenidos = 15. Hacen falta 16 rondas: 17 jugadores (por encima del máximo
    // del juego, solo para el test).
    const nombres = Array.from({ length: 17 }, (_, i) => `J${i + 1}`);
    const g = new Game(nombres, { seed: 21, vessel: 'copa', content: 'cerveza' }, { ...rapido, maxPlayers: 17 });
    // Catorce rondas pidiendo combinación nueva: salen las 15 sin repetir ninguna.
    const vistas = [`${g.vesselId}:${g.contentId}`];
    for (let i = 0; i < 14; i++) {
      g.ready();
      pourToOverflow(g);
      g.continue(true);
      vistas.push(`${g.vesselId}:${g.contentId}`);
    }
    expect(new Set(vistas).size).toBe(15);
    // La siguiente solo evita la de la ronda que acaba de terminar.
    const anterior = vistas[14];
    g.ready();
    pourToOverflow(g);
    g.continue(true);
    expect(`${g.vesselId}:${g.contentId}`).not.toBe(anterior);
  });

  // 48 partidas enteras (con física en las de piezas): tarda unos 5 s, el tope de serie, y
  // fallaba con el ordenador ocupado.
  it('las 48 combinaciones se juegan hasta un ganador', () => {
    for (const vessel of VESSEL_IDS) {
      for (const liquid of CONTENT_IDS) {
        const g = new Game(['A', 'B', 'C'], { seed: 5, vessel, content: liquid }, rapido);
        const r = createRng(9);
        for (let paso = 0; paso < 3000 && g.phase !== 'fin'; paso++) {
          if (g.phase === 'turno') g.ready();
          else if (g.phase === 'desborde') g.continue();
          else pour(g, r.next() < 0.4 ? 0 : r.next() * 2);
        }
        expect(g.winner, `${liquid} en ${vessel}`).not.toBeNull();
      }
    }
  }, 30_000);
});

describe('canicas y monedas', () => {
  const partida = (content: 'canicas' | 'monedas', seed = 1, vessel: 'cilindro' | 'copa' | 'botella' = 'cilindro') =>
    new Game(['A', 'B', 'C'], { seed, vessel, content });

  it('un toque echa una pieza; al pararse todo, pasa el turno', () => {
    for (const content of ['canicas', 'monedas'] as const) {
      const g = partida(content);
      expect(g.pile).not.toBeNull();
      g.ready();
      const quien = g.current;
      pour(g, 0);
      expect(g.pile!.pieces).toHaveLength(1);
      expect(g.phase).toBe('turno');
      expect(g.current).not.toBe(quien);
      expect(g.history[0].poured).toBe(1);
      // La pieza ha caído dentro del vaso y está quieta en el fondo.
      expect(g.pile!.fill.count).toBe(1);
      expect(g.pile!.fill.height).toBeLessThan(0.2);
    }
  });

  it('mantener echa un puñado: una pieza cada intervalo', () => {
    const g = partida('canicas');
    g.ready();
    pour(g, 1);
    const esperadas = 1 + Math.floor((1 - config.tapThresholdMs / 1000) / config.solids.interval);
    expect(g.pile!.pieces.length).toBeGreaterThanOrEqual(esperadas - 1);
    expect(g.pile!.pieces.length).toBeLessThanOrEqual(esperadas + 1);
  });

  it('las canicas cambian de tamaño entre el mínimo y el máximo', () => {
    const g = partida('canicas', 3);
    g.ready();
    pour(g, 2);
    const radios = g.pile!.pieces.map(p => p.w);
    expect(Math.min(...radios)).toBeGreaterThanOrEqual(config.solids.marbleMin);
    expect(Math.max(...radios)).toBeLessThanOrEqual(config.solids.marbleMax);
    expect(new Set(radios).size).toBe(radios.length);
  });

  it('quien hace caer una pieza fuera queda eliminado', () => {
    for (const content of ['canicas', 'monedas'] as const) {
      for (const vessel of VESSEL_IDS) {
        const g = new Game(['A', 'B', 'C'], { seed: 2, vessel, content }, rapido);
        g.ready();
        const quien = g.current;
        pourToOverflow(g);
        expect(g.phase, `${content} en ${vessel}`).toBe('desborde');
        expect(g.loser).toBe(quien);
        expect(g.pile!.out).not.toBeNull();
        g.continue();
        expect(g.pile!.pieces).toHaveLength(0); // ronda nueva, vaso vacío
      }
    }
  });

  it('entre turnos el montón no se mueve', () => {
    const g = partida('monedas', 4);
    g.ready();
    pour(g, 1.5);
    expect(g.phase).toBe('turno');
    const antes = g.pile!.pieces.map(p => [p.x, p.y, p.angle]);
    for (let i = 0; i < 300; i++) g.step(DT);
    expect(g.pile!.pieces.map(p => [p.x, p.y, p.angle])).toEqual(antes);
  });

  it('con la misma semilla y las mismas pulsaciones, el montón queda igual', () => {
    const jugar = () => {
      const g = partida('monedas', 8);
      for (const s of [0, 1, 0.5, 0]) { g.ready(); pour(g, s); }
      return g.pile!.pieces.map(p => [Math.round(p.x * 1000), Math.round(p.y * 1000)]);
    };
    expect(jugar()).toEqual(jugar());
  });
});

describe('leche al fuego (v0.9.0)', () => {
  const dt = 1 / 60;
  const espera = (g: Game, s: number) => { for (let i = 0; i < s * 60; i++) g.step(dt); };

  it('sube sola mientras el jugador duda, y no entre turnos', () => {
    const g = new Game(['A', 'B'], { seed: 1, content: 'leche' });
    espera(g, 2);
    expect(g.glass.volume).toBe(0); // pantalla «Turno de», nadie la tiene
    g.ready();
    espera(g, 2);
    expect(g.glass.volume).toBeCloseTo(2 * config.liquids.leche.rise, 3);
  });

  it('cada turno sube más rápido, y al vaciar el vaso vuelve a empezar', () => {
    const g = new Game(['A', 'B'], { seed: 1, content: 'leche' });
    const subidaDe = () => {
      g.ready();
      const antes = g.glass.volume;
      espera(g, 1);
      const sube = g.glass.volume - antes;
      g.press(); g.release();
      for (let i = 0; i < 600 && g.phase === 'echando'; i++) g.step(dt);
      return sube;
    };
    const primera = subidaDe();
    subidaDe();
    const tercera = subidaDe();
    expect(tercera).toBeCloseTo(primera * (1 + 2 * config.liquids.leche.riseGrow), 3);
  });

  it('quien se queda dudando la deja salir y pierde', () => {
    const g = new Game(['A', 'B'], { seed: 1, content: 'leche' });
    g.ready();
    for (let i = 0; i < 60 * 600 && g.phase === 'echando'; i++) g.step(dt);
    expect(g.phase).toBe('desborde');
    expect(g.loser).toBe(0);
  });
});

describe('vaso con fuga (v0.10.0)', () => {
  const dt = 1 / 60;
  /** Vaso con fuga a ~80 %: un chorro y a esperar a que pase el turno. */
  const lleno = () => {
    const g = new Game(['A', 'B'], { seed: 3, vessel: 'fuga' });
    g.ready();
    g.glass.add(0.8);
    g.press(); g.release();
    for (let i = 0; i < 600 && g.phase === 'echando'; i++) g.step(dt);
    expect(g.phase).toBe('turno');
    return g;
  };

  it('mientras se pasa el móvil se escapa, con tope por pase', () => {
    const g = lleno();
    const antes = g.glass.volume;
    g.step(dt);
    expect(g.leaking).toBe(true);
    for (let i = 0; i < 60 * 20; i++) g.step(dt);
    expect(antes - g.glass.volume).toBeCloseTo(config.leak.maxPerTurn, 3);
    expect(g.leaking).toBe(false);
  });

  it('no baja del agujero ni se escapa durante el turno', () => {
    const g = new Game(['A', 'B'], { seed: 3, vessel: 'fuga' });
    g.ready();
    g.glass.add(0.47);
    const v = g.glass.volume;
    for (let i = 0; i < 120; i++) g.step(dt);
    expect(g.glass.volume).toBeGreaterThanOrEqual(v); // echando: nada
    const floor = g.glass.vessel.heightToVolume(config.leak.height);
    g.glass.leak(1, floor);
    expect(g.glass.volume).toBeCloseTo(floor, 6);
  });

  it('las canicas pequeñas se cuelan por el agujero sin eliminar a nadie', () => {
    const cfg = { ...config, solids: { ...config.solids, marbleMin: 9, marbleMax: 11 } };
    const pile = new Pile('canicas', getVessel('fuga'), createRng(4), cfg);
    for (let i = 0; i < 60 * 30 && !pile.pieces.some(p => p.escaped); i++) {
      if (i % 8 === 0) pile.drop();
      pile.step(dt);
    }
    expect(pile.pieces.some(p => p.escaped)).toBe(true);
    if (pile.out) expect(pile.out.escaped).toBeFalsy();
  });
});

describe('esmerilado (v0.11.0)', () => {
  it('el nivel se ve desplazado, distinto en cada ronda, sin cambiar cuándo desborda', () => {
    const { maxOffset, minShare } = config.frosted;
    const vasos = Array.from({ length: 40 }, (_, i) => new Glass(getVessel('esmerilado'), agua, createRng(i), config));
    for (const g of vasos) {
      expect(Math.abs(g.illusion)).toBeGreaterThanOrEqual(maxOffset * minShare - 1e-9);
      expect(Math.abs(g.illusion)).toBeLessThanOrEqual(maxOffset + 1e-9);
    }
    expect(vasos.some(g => g.illusion > 0) && vasos.some(g => g.illusion < 0)).toBe(true);
    const g = vasos[0];
    const recto = new Glass(getVessel('cilindro'), agua, createRng(0), config);
    expect(g.limit).toBeCloseTo(recto.limit, 9); // mismo margen: el desvío no gasta azar del menisco
    g.add(0.6);
    expect(g.shownHeight - g.height).toBeCloseTo(g.illusion, 9);
    expect(g.shown(0)).toBe(0);
  });

  it('los demás vasos se ven tal cual', () => {
    const g = new Glass(getVessel('cilindro'), agua, createRng(1), config);
    g.add(0.5);
    expect(g.illusion).toBe(0);
    expect(g.shownHeight).toBe(g.height);
  });
});

describe('tiempo por turno (v0.12.0)', () => {
  const pasos = (s: number) => Math.round(s / DT);

  it('sin límite, se puede esperar lo que haga falta', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1 });
    g.ready();
    expect(g.timeLeft).toBeNull();
    for (let i = 0; i < pasos(30); i++) g.step(DT);
    expect(g.phase).toBe('echando');
    expect(g.poured).toBe(false);
  });

  it('cuenta atrás desde «¡Listo!» y, al agotarse, cae una gota sola', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1, turnTime: 5 });
    expect(g.timeLeft).toBeNull(); // aún en «Turno de X»
    g.ready();
    expect(g.timeLeft).toBe(5);
    for (let i = 0; i < pasos(4.9); i++) g.step(DT);
    expect(g.poured).toBe(false);
    for (let i = 0; i < pasos(0.2); i++) g.step(DT);
    expect(g.poured).toBe(true);
    expect(g.timeLeft).toBeNull();
    for (let i = 0; i < pasos(config.fallTime + config.turnEndDelay + 0.5); i++) g.step(DT);
    expect(g.phase).toBe('turno');
    expect(g.glass.volume).toBeGreaterThan(0);
    expect(g.glass.volume).toBeLessThan(config.dropVolume * 3 * 1.3 + 1e-9);
    expect(g.history[0].timedOut).toBe(true);
  });

  it('si empieza a tiempo, el reloj se para aunque mantenga más', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1, turnTime: 5 });
    g.ready();
    for (let i = 0; i < pasos(4); i++) g.step(DT);
    g.press();
    for (let i = 0; i < pasos(2); i++) g.step(DT);
    expect(g.timeLeft).toBeNull();
    expect(g.pressing).toBe(true);
    g.release();
    expect(g.history).toHaveLength(0);
  });

  it('con piezas, se agota y cae una', () => {
    const g = new Game(['Ana', 'Luis'], { seed: 1, content: 'canicas', turnTime: 5 });
    g.ready();
    for (let i = 0; i < pasos(5.1); i++) g.step(DT);
    expect(g.poured).toBe(true);
    expect(g.pile!.pieces).toHaveLength(1);
  });
});

describe('estadísticas del final (v0.12.0)', () => {
  const turno = (round: number, player: number, poured: number, extra: Partial<TurnRecord> = {}): TurnRecord =>
    ({ round, player, poured, volumeAfter: 0, hesitation: 1, held: 0, overflowed: false, danger: 0.5, timedOut: false, ...extra });

  it('generoso y rata se comparan dentro de cada ronda', () => {
    // Ronda 1 de agua (volúmenes pequeños) y ronda 2 de monedas (piezas): Ana echa el doble que
    // Luis en las dos, aunque en piezas los números sean mucho mayores.
    const s = computeStats([
      turno(1, 0, 0.2), turno(1, 1, 0.1),
      turno(2, 0, 10), turno(2, 1, 5),
    ]);
    expect(s.generoso?.player).toBe(0);
    expect(s.rata?.player).toBe(1);
  });

  it('al límite: el que más cerca se quedó sin desbordar; el desborde no cuenta', () => {
    const s = computeStats([
      turno(1, 0, 0.1, { danger: 0.9 }),
      turno(1, 1, 0.1, { danger: 0.97 }),
      turno(1, 2, 0.5, { danger: 1, overflowed: true }),
    ]);
    expect(s.alLimite?.player).toBe(1);
  });

  it('con piezas no hay «al límite»', () => {
    expect(computeStats([turno(1, 0, 3, { danger: null }), turno(1, 1, 2, { danger: null })]).alLimite).toBeNull();
  });

  it('indeciso: quien más tarda de media', () => {
    const s = computeStats([
      turno(1, 0, 0.1, { hesitation: 1 }), turno(1, 1, 0.1, { hesitation: 4 }),
      turno(1, 0, 0.1, { hesitation: 6 }), turno(1, 1, 0.1, { hesitation: 2 }),
    ]);
    expect(s.indeciso?.player).toBe(0);
  });

  it('todos iguales: no hay un rata distinto del generoso', () => {
    const s = computeStats([turno(1, 0, 0.1), turno(1, 1, 0.1)]);
    expect(s.rata).toBeNull();
  });

  it('una partida de verdad da resumen', () => {
    const g = new Game(['Ana', 'Luis', 'Eva'], { seed: 3 });
    let n = 0;
    while (g.phase !== 'fin' && n++ < 200000) {
      if (g.phase === 'turno') g.ready();
      else if (g.phase === 'desborde') g.continue();
      else if (g.phase === 'echando' && !g.poured && !g.pressing) g.press();
      else if (g.pressing && g.time > 0) g.release();
      g.step(DT);
    }
    expect(g.phase).toBe('fin');
    const s = computeStats(g.history);
    expect(s.generoso).not.toBeNull();
    expect(s.indeciso).not.toBeNull();
  });
});

describe('equilibrado del simulador (v0.15.0)', () => {
  it('monedas: ×3,2 en general y ×2,0 en la botella (se atascan en el cuello)', () => {
    const ancho = (vaso: 'cilindro' | 'botella' | 'chupito') => {
      const p = new Pile('monedas', getVessel(vaso), createRng(7), config);
      p.drop();
      return p.pieces[0].w;
    };
    // La misma semilla da la misma moneda: solo cambia la escala.
    expect(ancho('cilindro') / ancho('botella')).toBeCloseTo(config.solids.coinScale / config.coinScaleByVessel.botella, 5);
    expect(ancho('chupito')).toBeCloseTo(ancho('cilindro'), 5);
  });

  it('fuga: lo que se escapa por pase es menos que lo que echa un toque', () => {
    expect(config.leak.maxPerTurn).toBeLessThan(config.dropVolume * (1 - config.dropVariance));
  });
});
