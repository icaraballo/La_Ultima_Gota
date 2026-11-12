// Pantalla siempre encendida (UG-DESIGN §7.1): entre turnos se discute y nadie toca el móvil, y
// con el tiempo de apagado del sistema la pantalla se iría en plena partida. Usa la Wake Lock API
// del navegador (Safari desde la 16.4). Sin DOM: se prueba con un `navigator.wakeLock` falso.
// Los fallos (permiso, poca batería, sin soporte) se tragan: nunca rompen el juego.

interface Cerrojo { release(): Promise<void> }
interface WakeLockApi { request(tipo: 'screen'): Promise<Cerrojo> }

const api = (): WakeLockApi | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock;

let quiere = false;
let cerrojo: Cerrojo | null = null;
let pidiendo = false;
let avisado = false;

export const puedeMantener = () => typeof api()?.request === 'function';

async function solicitar() {
  const wl = api();
  if (!wl || cerrojo || pidiendo) return;
  pidiendo = true;
  try {
    const c = await wl.request('screen');
    if (quiere) cerrojo = c;
    else await c.release().catch(() => {}); // se soltó mientras se pedía
  } catch (e) {
    if (!avisado) { avisado = true; console.warn('No se pudo mantener la pantalla encendida.', e); }
  } finally {
    pidiendo = false;
  }
}

/** Empieza una partida: mantener la pantalla encendida. */
export function pedir() {
  quiere = true;
  return solicitar();
}

/** Se vuelve a la pantalla de Jugadores: que se apague con su tiempo normal. */
export async function soltar() {
  quiere = false;
  const c = cerrojo;
  cerrojo = null;
  try { await c?.release(); } catch { /* ya soltado */ }
}

/** La pestaña vuelve a verse: el sistema soltó el cerrojo al ocultarse; se pide otro si hay partida. */
export function volverAPedir() {
  // El sistema libera el cerrojo al ocultar la página; el objeto viejo ya no vale.
  cerrojo = null;
  if (quiere) return solicitar();
  return Promise.resolve();
}

/** Solo para los tests. */
export function _reiniciar() { quiere = false; cerrojo = null; pidiendo = false; avisado = false; }
