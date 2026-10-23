import { config } from '../core/config';
import type { Estado, Evento } from '../core/eventos';

// Vibración (UG-DESIGN §8.3) con navigator.vibrate: Android sí; iPhone no deja vibrar a las
// webs (en la APK irá con @capacitor/haptics, fase 7). Cada vibrate() pisa al anterior, así que
// lo continuo (chorro y cercanía al borde) son pulsos cortos repartidos en el tiempo.

export const puedeVibrar = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

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
      case 'gota': navigator.vibrate(12); break;
      case 'pieza': navigator.vibrate(ev.pieza === 'monedas' ? 18 : 10); break;
      case 'desborde': navigator.vibrate([320, 80, 220]); this.siguiente = performance.now() + 700; break;
      case 'ganador': navigator.vibrate([50, 60, 50, 60, 140]); break;
    }
  }

  /** Cada imagen: chorro suave mientras cae y, si está activada, la cercanía al borde. */
  actualizar(e: Estado, ahora: number) {
    if (!this.activa || !puedeVibrar() || !e.enJuego || ahora < this.siguiente) return;
    const cerca = this.cercania ? pulsoCercania(e.nivel) : null;
    if (cerca) {
      navigator.vibrate(cerca.dura);
      this.siguiente = ahora + cerca.cada;
    } else if (e.chorro > 0.05) {
      navigator.vibrate(Math.round(6 + 10 * e.chorro));
      this.siguiente = ahora + 90;
    }
  }

  parar() {
    if (puedeVibrar()) navigator.vibrate(0);
  }
}
