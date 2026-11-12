import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reiniciar, pedir, puedeMantener, soltar, volverAPedir } from '../src/ui/pantalla';

/** Un `navigator.wakeLock` falso que cuenta lo que le piden y lo que le sueltan. */
function falso(fallo?: Error) {
  const estado = { pedidos: 0, soltados: 0 };
  const request = vi.fn(async () => {
    estado.pedidos++;
    if (fallo) throw fallo;
    return { release: async () => { estado.soltados++; } };
  });
  vi.stubGlobal('navigator', { wakeLock: { request } });
  return { estado, request };
}

beforeEach(() => _reiniciar());
afterEach(() => vi.unstubAllGlobals());

describe('pantalla encendida (v0.17.0)', () => {
  it('sin soporte no hace nada ni falla', async () => {
    vi.stubGlobal('navigator', {});
    expect(puedeMantener()).toBe(false);
    await expect(pedir()).resolves.toBeUndefined();
    await expect(soltar()).resolves.toBeUndefined();
    await expect(volverAPedir()).resolves.toBeUndefined();
  });

  it('pide una sola vez aunque se llame varias', async () => {
    const { estado } = falso();
    expect(puedeMantener()).toBe(true);
    await pedir(); await pedir(); await pedir();
    expect(estado.pedidos).toBe(1);
  });

  it('vuelve a pedir tras ocultarse y mostrarse, y suelta al salir', async () => {
    const { estado } = falso();
    await pedir();
    await volverAPedir(); // el sistema soltó el cerrojo al ocultarse
    expect(estado.pedidos).toBe(2);
    await soltar();
    expect(estado.soltados).toBe(1);
    await volverAPedir(); // ya no hay partida: no se pide
    expect(estado.pedidos).toBe(2);
  });

  it('un request que lanza no propaga el error', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { request } = falso(new DOMException('no', 'NotAllowedError'));
    await expect(pedir()).resolves.toBeUndefined();
    await pedir();
    expect(request).toHaveBeenCalledTimes(2);
    expect(aviso).toHaveBeenCalledTimes(1); // el aviso, una sola vez
    aviso.mockRestore();
  });

  it('si se suelta mientras se pedía, no se queda el cerrojo', async () => {
    const { estado } = falso();
    const p = pedir();
    await soltar();
    await p;
    expect(estado.soltados).toBe(1);
  });
});
