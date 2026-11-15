// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba de humo de la interfaz (auditoría v0.16.0, H-08): arranca la app con un DOM simulado, sin
// WebGL ni canvas (cae al vaso 2D), añade jugadores y comprueba que lo editado se guarda.
describe('startApp (DOM simulado)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  async function arrancar() {
    vi.resetModules();
    const { startApp } = await import('../src/ui/app');
    startApp(document.getElementById('app')!);
    document.querySelector<HTMLElement>('#intro-jugar')!.click(); // de la intro a «Jugadores»
  }

  it('arranca y pinta la pantalla de jugadores con Empezar y Opinar', async () => {
    await arrancar();
    expect(document.querySelector('#empezar')).not.toBeNull();
    expect(document.querySelector('#opinar')).not.toBeNull();
  });

  it('guarda el nombre al editarlo, sin pulsar Empezar', async () => {
    await arrancar();
    const campo = document.querySelector<HTMLInputElement>('input[data-i="0"]')!;
    campo.value = 'Marta';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    const guardado = JSON.parse(localStorage.getItem('ultima-gota:partida')!);
    expect(guardado.names[0]).toBe('Marta');
  });

  it('no abre el panel de depuración manteniendo pulsado el título', async () => {
    vi.useFakeTimers();
    await arrancar();
    document.querySelector('#logo')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(1500);
    expect(document.querySelector<HTMLElement>('.debug')!.hidden).toBe(true);
    vi.useRealTimers();
  });
});
