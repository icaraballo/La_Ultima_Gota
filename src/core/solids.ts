import Matter from 'matter-js';
import type { Config } from './config';
import type { Rng } from './rng';
import type { Vessel } from './vessels';

// Canicas y monedas (UG-DESIGN §7.4): se echan piezas en el vaso vacío y pierde quien hace que
// una acabe fuera. Física real de cuerpos rígidos con Matter.js en 2D, en un corte vertical del
// vaso (como el prototipo que jugó Iñigo). Paso fijo y azar de rng.ts: la misma semilla y las
// mismas pulsaciones dan la misma partida.
// Unidades del motor: píxeles del prototipo (el vaso mide 250 de alto), y hacia abajo +y.

export type SolidId = 'canicas' | 'monedas';
export const SOLID_IDS: SolidId[] = ['canicas', 'monedas'];

/** Píxeles del motor por unidad de altura relativa del vaso (1 = el borde). */
export const SOLID_PX_PER_H = 250;
/** Radio del perfil r(h) = 1, en píxeles del motor (el vaso recto mide 155 de ancho). */
export const SOLID_PX_RADIUS = 77.5;
const WALL = 14;
const FLOOR = 4;
/** Hasta dónde llega la mesa a cada lado (px): lo que se sale se queda a la vista. */
const TABLE_HALF = 175;
const SUBSTEPS = 2;

/** Las ocho monedas de euro: diámetro y grosor en mm (de 1 céntimo a 2 €). */
export const COINS = [
  { d: 16.25, t: 1.67 }, { d: 18.75, t: 1.67 }, { d: 21.25, t: 1.67 },
  { d: 19.75, t: 1.93 }, { d: 22.25, t: 2.14 }, { d: 24.25, t: 2.38 },
  { d: 23.25, t: 2.33 }, { d: 25.75, t: 2.2 },
];

export interface Piece {
  kind: SolidId;
  /** Canica: índice de color. Moneda: índice en COINS. */
  variant: number;
  /** Canica: radio. Moneda: ancho (diámetro) y alto (grosor), en px del motor. */
  w: number;
  h: number;
  /** Posición y giro en coordenadas del vaso: x desde el eje, y hacia arriba desde el fondo. */
  x: number;
  y: number;
  angle: number;
  body: Matter.Body;
}

/** El vaso con piezas de una ronda. */
export class Pile {
  readonly pieces: Piece[] = [];
  /** La primera pieza que acaba fuera del vaso (desborde), o null. */
  out: Piece | null = null;
  private engine: Matter.Engine;
  /** El perfil del vaso como polígono (x, y hacia arriba), para saber qué está dentro. */
  private poly: { x: number; y: number }[] = [];
  private calmFor = 0;
  /** Alto de este vaso en px del motor (el chupito es más bajo). */
  private readonly hPx: number;

  constructor(readonly kind: SolidId, readonly vessel: Vessel, private rng: Rng, private cfg: Config) {
    const s = cfg.solids;
    this.hPx = SOLID_PX_PER_H * vessel.height;
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 }, positionIterations: 10, velocityIterations: 8 });
    const N = 32;
    const left: { x: number; y: number }[] = [], right: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const h = i / N;
      const r = vessel.radius(h) * SOLID_PX_RADIUS;
      left.push({ x: -r, y: h * this.hPx });
      right.push({ x: r, y: h * this.hPx });
    }
    this.poly = [...left, ...right.reverse()];
    right.reverse();
    // Paredes: un rectángulo por tramo del perfil, por fuera de la línea del cristal.
    const walls: Matter.Body[] = [];
    for (const [side, pts] of [[-1, left], [1, right]] as const) {
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        // Normal hacia fuera del vaso (en coordenadas con y hacia arriba).
        const nx = side * dy / len, ny = -side * dx / len;
        const mx = (a.x + b.x) / 2 + nx * WALL / 2, my = (a.y + b.y) / 2 + ny * WALL / 2;
        walls.push(Matter.Bodies.rectangle(mx, -my, len + WALL * 0.9, WALL, {
          isStatic: true, angle: Math.atan2(-dy, dx), friction: s.wallFriction,
        }));
      }
    }
    const r0 = vessel.radius(0) * SOLID_PX_RADIUS;
    walls.push(Matter.Bodies.rectangle(0, FLOOR / 2, 2 * (r0 + WALL), FLOOR, { isStatic: true, friction: s.wallFriction }));
    // Mesa (un poco por debajo del fondo del vaso) y topes a los lados de lo que se ve.
    walls.push(Matter.Bodies.rectangle(0, FLOOR + 40, TABLE_HALF * 4, 80, { isStatic: true, friction: 0.4 }));
    walls.push(Matter.Bodies.rectangle(-TABLE_HALF - 30, -300, 60, 1200, { isStatic: true }));
    walls.push(Matter.Bodies.rectangle(TABLE_HALF + 30, -300, 60, 1200, { isStatic: true }));
    Matter.Composite.add(this.engine.world, walls);
  }

  /** Echa una pieza desde la boca del grifo. */
  drop() {
    const { rng, cfg: { solids: s } } = this;
    const jit = rng.signed() * 0.5;
    const y = -(this.hPx + s.spawnHeight);
    let body: Matter.Body;
    let piece: Omit<Piece, 'body' | 'x' | 'y' | 'angle'>;
    if (this.kind === 'canicas') {
      const r = s.marbleMin + rng.next() * Math.max(0, s.marbleMax - s.marbleMin);
      body = Matter.Bodies.circle(jit * 16, y, r, {
        restitution: s.marbleBounce, friction: s.marbleFriction, frictionStatic: 0.15, frictionAir: 0.004, density: 0.004,
      });
      piece = { kind: 'canicas', variant: Math.floor(rng.next() * 7), w: r, h: r };
    } else {
      const variant = Math.floor(rng.next() * COINS.length);
      const c = COINS[variant];
      const w = c.d * s.coinScale, h = Math.max(3.5, c.t * s.coinScale * 1.6);
      body = Matter.Bodies.rectangle(jit * 22, y, w, h, {
        chamfer: { radius: Math.min(2, h / 2 - 0.5) }, restitution: 0.06, friction: s.coinFriction,
        frictionStatic: 0.7, frictionAir: 0.01, density: 0.008, angle: rng.next() * Math.PI,
      });
      Matter.Body.setAngularVelocity(body, rng.signed() * 0.125);
      piece = { kind: 'monedas', variant, w, h };
    }
    Matter.Body.setVelocity(body, { x: jit * 0.6, y: 1.5 });
    Matter.Composite.add(this.engine.world, body);
    this.pieces.push({ ...piece, body, x: body.position.x, y: -body.position.y, angle: -body.angle });
    this.calmFor = 0;
  }

  /** Avanza dt segundos. */
  step(dt: number) {
    const ms = (dt * 1000) / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) Matter.Engine.update(this.engine, ms);
    let calm = true;
    for (const p of this.pieces) {
      p.x = p.body.position.x;
      p.y = -p.body.position.y;
      p.angle = -p.body.angle;
      if (p.body.speed > this.cfg.solids.calmSpeed || Math.abs(p.body.angularSpeed) > 0.03) calm = false;
      if (!this.out && this.isOutside(p)) this.out = p;
    }
    this.calmFor = calm ? this.calmFor + dt : 0;
  }

  /** Ninguna pieza se mueve desde hace un rato. */
  get settled() {
    return this.calmFor >= this.cfg.solids.calmTime;
  }

  /** Por debajo del borde y fuera del perfil del vaso: se ha salido. */
  private isOutside(p: Piece) {
    if (p.y > this.hPx - 6) return false;
    return !this.inside(p.x, p.y);
  }

  private inside(x: number, y: number) {
    const poly = this.poly;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /** Piezas dentro del vaso y altura del montón (1 = el borde), para la depuración. */
  get fill() {
    const dentro = this.pieces.filter(p => p !== this.out && this.inside(p.x, Math.min(p.y, this.hPx - 1)));
    const top = dentro.reduce((m, p) => Math.max(m, p.y + p.h / 2), 0);
    return { count: dentro.length, height: top / this.hPx };
  }
}
