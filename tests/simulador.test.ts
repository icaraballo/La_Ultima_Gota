import { describe, expect, it } from 'vitest';
import { diagnosticar, ESTRATEGIAS, informe, rondaConBots, simular, type Resultado } from '../tools/simulate';

describe('simulador de bots', () => {
  it('una ronda acaba en desborde y se repite con la misma semilla', () => {
    const a = rondaConBots('cilindro', 'agua', 'aleatorio', 4, 5, 1500);
    expect(a.eterna).toBe(false);
    expect(a.turnos).toBeGreaterThan(1);
    expect(a.asiento).toBeGreaterThanOrEqual(0);
    expect(a.asiento).toBeLessThan(4);
    expect(rondaConBots('cilindro', 'agua', 'aleatorio', 4, 5, 1500)).toEqual(a);
  });

  it('prudente dura más que arriesgado en el cilindro con agua', () => {
    const p = simular('cilindro', 'agua', 'prudente', 4, 30, 1);
    const a = simular('cilindro', 'agua', 'arriesgado', 4, 30, 1);
    expect(p.turnosMedia).toBeGreaterThan(a.turnosMedia * 1.5);
    expect(p.eternas).toBe(0);
    expect(p.asientos.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5);
  });

  it('una ronda que no acaba antes del tope se marca como eterna', () => {
    expect(rondaConBots('cilindro', 'agua', 'prudente', 4, 1, 3).eterna).toBe(true);
  });

  it('el diagnóstico señala lo roto y el informe lo cuenta', () => {
    const base = { vaso: 'cilindro', contenido: 'agua', jugadores: 4, rondas: 10, turnosMediana: 20, turnosP90: 24, asientos: [0.25, 0.25, 0.25, 0.25] } as const;
    const r = (estrategia: Resultado['estrategia'], vueltasMedia: number, extra: Partial<Resultado> = {}): Resultado =>
      ({ ...base, asientos: [...base.asientos], estrategia, vueltasMedia, turnosMedia: vueltasMedia * 4, primerTurno: 0, eternas: 0, ...extra });
    const sana = diagnosticar([r('prudente', 7), r('arriesgado', 3), r('aleatorio', 5)]);
    expect(sana.fallos).toEqual([]);
    const eterna = diagnosticar([r('prudente', 20), r('arriesgado', 3), r('aleatorio', 5)]);
    expect(eterna.fallos).toContain('ETERNA');
    const primero = diagnosticar([r('prudente', 7), r('arriesgado', 0.4), r('aleatorio', 5)]);
    expect(primero.fallos).toContain('AL PRIMER TURNO');
    const igual = diagnosticar([r('prudente', 4), r('arriesgado', 3.8), r('aleatorio', 4)]);
    expect(igual.fallos).toContain('DA IGUAL');
    const todos = ESTRATEGIAS.map(e => r(e, 4));
    expect(informe(todos)).toContain('| cilindro | agua |');
  });
});
