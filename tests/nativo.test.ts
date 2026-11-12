import { afterEach, describe, expect, it, vi } from 'vitest';
import { puedeVibrar, vibra } from '../src/haptics/vibracion';
import { enApp, plugin } from '../src/ui/nativo';

// La app de Android (v0.17.0): sin `window.Capacitor` todo va como en la web; con él, la vibración
// pasa por el plugin Haptics y «atrás» por el plugin App (eso último se prueba en el emulador).

function conCapacitor(plugins: Record<string, unknown>, nativo = true) {
  vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => nativo, Plugins: plugins } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('nativo.ts', () => {
  it('en la web (sin Capacitor) no hay app ni plugins', () => {
    vi.stubGlobal('window', {});
    expect(enApp()).toBe(false);
    expect(plugin('Haptics')).toBeNull();
  });
  it('un Capacitor que no es nativo (la web con el script) tampoco cuenta', () => {
    conCapacitor({ Haptics: {} }, false);
    expect(enApp()).toBe(false);
    expect(plugin('Haptics')).toBeNull();
  });
  it('en la app devuelve el plugin, o null si falta', () => {
    const h = { vibrate: vi.fn() };
    conCapacitor({ Haptics: h });
    expect(enApp()).toBe(true);
    expect(plugin('Haptics')).toBe(h);
    expect(plugin('Otro')).toBeNull();
  });
});

describe('vibra() (v0.17.0)', () => {
  it('en la web usa navigator.vibrate, con la misma forma', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { vibrate });
    expect(puedeVibrar()).toBe(true);
    vibra(12);
    vibra([320, 80, 220]);
    expect(vibrate).toHaveBeenNthCalledWith(1, 12);
    expect(vibrate).toHaveBeenNthCalledWith(2, [320, 80, 220]);
  });

  it('en la app usa Haptics: un pulso por cada tramo «encendido» y ninguno en los silencios', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn(async () => {});
    conCapacitor({ Haptics: { vibrate } });
    vi.stubGlobal('navigator', {}); // sin navigator.vibrate: aun así puede vibrar
    expect(puedeVibrar()).toBe(true);
    vibra([320, 80, 220]);
    vi.advanceTimersByTime(1000);
    expect(vibrate.mock.calls.map(c => (c as unknown as [{ duration: number }])[0].duration)).toEqual([320, 220]);
  });

  it('un patrón nuevo corta los pulsos pendientes del anterior, y vibra(0) los para', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn(async () => {});
    conCapacitor({ Haptics: { vibrate } });
    vibra([100, 100, 100]); // el segundo pulso (a los 200 ms) queda pendiente
    vi.advanceTimersByTime(50);
    vibra(0); // parar
    vi.advanceTimersByTime(1000);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('sin vibrador no vibra ni falla', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    expect(puedeVibrar()).toBe(false);
  });
});
