import type { Game } from '../core/game';

// Vista provisional de la fase 1: el vaso de perfil en 2D. La sustituye la escena 3D en la
// fase 3. Sin números: solo se ve el nivel, lo que cae y el menisco abombado.

const AGUA = '#5fb4e8';
const AGUA_OSCURA = '#3f8fc4';
const CRISTAL = 'rgba(244, 239, 230, .7)';
/** El menisco real es de pocos píxeles: se exagera para que se vea abombarse. */
const MENISCO_VISIBLE = 3;

export class Barra2D {
  /** Modo depuración: dibuja el límite oculto de la ronda. */
  showLimit = false;
  private overflowSince: number | null = null;
  private lastGlass: unknown = null;

  constructor(private canvas: HTMLCanvasElement) {}

  draw(game: Game, now: number) {
    const { canvas } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { glass, faucet } = game;
    if (glass !== this.lastGlass) {
      this.lastGlass = glass;
      this.overflowSince = null;
    }

    // Geometría: mesa abajo, vaso en el centro, grifo arriba.
    const mesaY = h - 8;
    const gw = Math.min(w * 0.42, 190);
    const gh = Math.min(h * 0.66, gw * 2.4);
    const cx = w / 2;
    const left = cx - gw / 2, right = cx + gw / 2;
    const rimY = mesaY - gh;
    const spoutY = Math.max(24, rimY - Math.max(70, h * 0.18));

    const level = glass.height;
    const surfaceY = mesaY - Math.min(level, 1) * gh;
    const dome = Math.max(0, level - 1) * gh * MENISCO_VISIBLE;

    // Mesa
    ctx.fillStyle = '#8a5a3b';
    ctx.fillRect(0, mesaY, w, h - mesaY);

    // Líquido dentro del vaso, con ondulación según lo que cae.
    if (glass.volume > 0) {
      const amp = Math.min(4, 0.8 + faucet.flow * 25) * (level < 1 ? 1 : 0.4);
      ctx.fillStyle = AGUA;
      ctx.beginPath();
      ctx.moveTo(left, mesaY);
      ctx.lineTo(left, surfaceY);
      if (dome > 0) {
        ctx.quadraticCurveTo(cx, surfaceY - dome * 2, right, surfaceY);
      } else {
        for (let x = left; x <= right; x += 4) {
          ctx.lineTo(x, surfaceY + Math.sin(x * 0.06 + now * 7) * amp);
        }
        ctx.lineTo(right, surfaceY);
      }
      ctx.lineTo(right, mesaY);
      ctx.closePath();
      ctx.fill();
    }

    // Lo que está en el aire: el chorro como una cinta, las gotas como bolitas.
    const fall = (p: { emitted: number; arrival: number }) => {
      const t = Math.min(1, Math.max(0, (faucet.time - p.emitted) / (p.arrival - p.emitted)));
      return spoutY + (surfaceY - dome - spoutY) * t * t;
    };
    const stream = faucet.inAir.filter(p => p.kind === 'stream');
    ctx.fillStyle = AGUA;
    for (let i = 0; i < stream.length; i++) {
      const p = stream[i];
      const y0 = fall(p);
      const y1 = i + 1 < stream.length ? fall(stream[i + 1]) : spoutY;
      const half = Math.max(1.2, Math.min(10, (p.volume * 60) * 55));
      ctx.fillRect(cx - half, Math.min(y0, y1), half * 2, Math.abs(y0 - y1) + 1);
    }
    for (const p of faucet.inAir) {
      if (p.kind !== 'drop') continue;
      const r = 3 + 2.5 * Math.sqrt(p.volume / 0.006);
      ctx.beginPath();
      ctx.ellipse(cx, fall(p), r * 0.85, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Desborde: el agua cae por fuera y hace un charco.
    if (glass.overflowed) {
      this.overflowSince ??= now;
      const k = Math.min(1, (now - this.overflowSince) / 1.2);
      ctx.fillStyle = AGUA;
      ctx.fillRect(left - 5, rimY - 2, 5, (mesaY - rimY) * k);
      ctx.fillRect(right, rimY - 2, 5, (mesaY - rimY) * k);
      ctx.fillStyle = AGUA_OSCURA;
      ctx.beginPath();
      ctx.ellipse(cx, mesaY + 3, gw * (0.55 + 0.5 * k), 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Paredes del vaso.
    ctx.strokeStyle = CRISTAL;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(left, rimY);
    ctx.lineTo(left, mesaY);
    ctx.lineTo(right, mesaY);
    ctx.lineTo(right, rimY);
    ctx.stroke();

    if (this.showLimit) {
      const limitY = rimY - (glass.vessel.volumeToHeight(glass.limit) - 1) * gh * MENISCO_VISIBLE;
      ctx.strokeStyle = '#e8735f';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(left - 24, limitY);
      ctx.lineTo(right + 24, limitY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Grifo.
    ctx.fillStyle = '#b9c2cc';
    ctx.fillRect(0, spoutY - 30, cx + 10, 14);
    ctx.fillRect(cx - 9, spoutY - 30, 18, 30);
    ctx.fillStyle = '#8d97a2';
    ctx.fillRect(cx - 11, spoutY - 4, 22, 5);
  }
}
