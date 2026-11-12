import { config } from '../core/config';
import type { Estado, Evento } from '../core/eventos';
import { plugin, type PluginHaptics } from '../ui/nativo';

// Vibración (UG-DESIGN §8.3) con navigator.vibrate: Android sí; iPhone no deja vibrar a las
// webs. En la app de Android va con el plugin Haptics de Capacitor, porque navigator.vibrate no
// vibra dentro del WebView del Samsung (visto en Chromalchemy v1.22.1 y La Colmena v11.25). Cada
// vibrate() pisa al anterior, así que lo continuo (chorro y cercanía al borde) son pulsos cortos
// repartidos en el tiempo.

const haptics = () => plugin<PluginHaptics>('Haptics');

export const puedeVibrar = () =>
  haptics() !== null || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');

/** Los pulsos pendientes de un patrón en la app (el plugin solo hace «vibra tantos ms»). */
let relojes: ReturnType<typeof setTimeout>[] = [];

/** Vibra `ms` o un patrón (encendido, apagado, encendido… en ms), en la web o en la app. */
export function vibra(patron: number | number[]) {
  const h = haptics();
  if (!h) { navigator.vibrate(patron); return; }
  relojes.forEach(clearTimeout);
  relojes = [];
  const p = Array.isArray(patron) ? patron : [patron];
  let t = 0;
  p.forEach((ms, k) => {
    if (k % 2 === 0 && ms > 0) relojes.push(setTimeout(() => { try { h.vibrate({ duration: ms }).catch(() => {}); } catch { /* sin vibrador */ } }, t));
    t += ms;
  });
}

/** Cada cuánto (ms) y cuánto (ms) vibra con el nivel `nivel` cerca del borde, o null si aún no.
 * Por debajo de `nearBrimHapticStart`, nada; en el borde, pulsos seguidos. Sin DOM: se prueba. */
export function pulsoCercania(nivel: number): { cada: number; dura: number } | null {
  const desde = config.nearBrimHapticStart;
  if (nivel < desde) return null;
  const k = Math.min(1, (nivel - desde) / (1 - desde));
  return { cada: Math.round(700 - 560 * k), dura: Math.round(18 + 22 * k) };
}

export class Vibracion {
  activa = true;
  cercania = true;
  private siguiente = 0;

  vibrar(ev: Evento) {
    if (!this.activa || !puedeVibrar()) return;
    switch (ev.tipo) {
      case 'gota': vibra(12); break;
      case 'pieza': vibra(ev.pieza === 'monedas' ? 18 : 10); break;
      case 'desborde': vibra([320, 80, 220]); this.siguiente = performance.now() + 700; break;
      case 'ganador': vibra([50, 60, 50, 60, 140]); break;
    }
  }

  /** Cada imagen: chorro suave mientras cae y, si está activada, la cercanía al borde. */
  actualizar(e: Estado, ahora: number) {
    if (!this.activa || !puedeVibrar() || !e.enJuego || ahora < this.siguiente) return;
    const cerca = this.cercania ? pulsoCercania(e.nivel) : null;
    if (cerca) {
      vibra(cerca.dura);
      this.siguiente = ahora + cerca.cada;
    } else if (e.chorro > 0.05) {
      vibra(Math.round(6 + 10 * e.chorro));
      this.siguiente = ahora + 90;
    }
  }

  parar() {
    if (puedeVibrar()) vibra(0);
  }
}
