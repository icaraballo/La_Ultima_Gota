import type { Estado, Evento } from '../core/eventos';

// Sonido (UG-DESIGN §8.2), todo sintetizado con Web Audio: ni ficheros ni licencias, y funciona
// sin conexión. El chorro es ruido filtrado en bucle; su tono sube con el nivel, como al llenar
// una botella de verdad. El «plic» de cada gota también sube con el nivel.
// El navegador no deja sonar hasta que se toca la pantalla: `despertar()` va en el primer toque.

const VOLUMEN = 0.55;

export class Sonido {
  private ctx: AudioContext | null = null;
  private salida!: GainNode;
  private ruido!: AudioBuffer;
  private chorroGain!: GainNode;
  private chorroFiltro!: BiquadFilterNode;
  activo = true;

  /** Crea el audio en el primer toque (antes, el navegador lo tiene bloqueado). */
  despertar() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.salida = ctx.createGain();
    this.salida.gain.value = VOLUMEN;
    this.salida.connect(ctx.destination);
    // Dos segundos de ruido blanco, para el chorro y el derrame.
    this.ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const fuente = ctx.createBufferSource();
    fuente.buffer = this.ruido;
    fuente.loop = true;
    this.chorroFiltro = ctx.createBiquadFilter();
    this.chorroFiltro.type = 'bandpass';
    this.chorroFiltro.Q.value = 1.4;
    this.chorroGain = ctx.createGain();
    this.chorroGain.gain.value = 0;
    fuente.connect(this.chorroFiltro).connect(this.chorroGain).connect(this.salida);
    fuente.start();
  }

  /** Cada imagen: el chorro sigue al caudal y su tono, al nivel. */
  actualizar(e: Estado) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    const vol = this.activo && e.enJuego ? 0.5 * Math.sqrt(e.chorro) : 0;
    this.chorroGain.gain.setTargetAtTime(vol, t, 0.05);
    this.chorroFiltro.frequency.setTargetAtTime(350 + 1500 * Math.min(1.1, e.nivel), t, 0.1);
  }

  /** Silencio inmediato (al salir de la partida o desactivar el sonido). */
  callar() {
    if (this.ctx) this.chorroGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  sonar(ev: Evento) {
    if (!this.activo || !this.ctx) return;
    switch (ev.tipo) {
      case 'gota': return this.plic(ev.nivel);
      case 'pieza': return ev.pieza === 'canicas' ? this.canica() : this.moneda();
      case 'desborde': return this.desborde(ev.piezas);
      case 'ganador': return this.fanfarria();
    }
  }

  /** Tic de los tres últimos segundos del tiempo por turno. */
  tic(ultimo: boolean) {
    if (!this.activo || !this.ctx) return;
    this.tono(ultimo ? 1320 : 990, 'square', 0.06, 0.12);
  }

  /** Gota: un barrido corto hacia arriba, más agudo cuanto más lleno. */
  private plic(nivel: number) {
    const ctx = this.ctx!, t = ctx.currentTime;
    const f0 = 450 + 600 * Math.min(1.1, nivel);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.salida);
    o.start(t);
    o.stop(t + 0.13);
  }

  /** Canica: choque de cristal, seco y agudo. */
  private canica() {
    this.tono(2600 + Math.random() * 600, 'triangle', 0.18, 0.05);
    this.golpe(0.04, 3000, 0.25);
  }

  /** Moneda: tintineo metálico (dos parciales que no casan). */
  private moneda() {
    const f = 2200 + Math.random() * 500;
    this.tono(f, 'sine', 0.16, 0.25);
    this.tono(f * 1.47, 'sine', 0.09, 0.18);
    this.golpe(0.02, 5000, 0.2);
  }

  /** Derrame (o piezas al suelo) y el «fallo cómico»: wah, wah, wah, waaah. */
  private desborde(piezas: boolean) {
    if (piezas) for (let i = 0; i < 4; i++) setTimeout(() => this.canicaSuelo(), i * 90 + Math.random() * 40);
    else this.golpe(0.7, 900, 0.55);
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.25;
    const notas = [233, 220, 207, 196];
    notas.forEach((f, i) => {
      const t = t0 + i * 0.32, larga = i === notas.length - 1, dur = larga ? 0.9 : 0.26;
      const o = ctx.createOscillator(), filtro = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      if (larga) {
        // Vibrato que se va cayendo, como un trombón triste.
        const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
        lfo.frequency.value = 6;
        lfoG.gain.value = 6;
        lfo.connect(lfoG).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur);
        o.frequency.linearRampToValueAtTime(f * 0.94, t + dur);
      }
      filtro.type = 'lowpass';
      filtro.frequency.setValueAtTime(500, t);
      filtro.frequency.linearRampToValueAtTime(1400, t + 0.08);
      filtro.frequency.linearRampToValueAtTime(600, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
      g.gain.setValueAtTime(0.28, t + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(filtro).connect(g).connect(this.salida);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  }

  private canicaSuelo() {
    if (!this.ctx) return;
    this.tono(1800 + Math.random() * 900, 'triangle', 0.15, 0.06);
  }

  /** Ganador: arpegio hacia arriba. */
  private fanfarria() {
    const ctx = this.ctx!;
    [523, 659, 784, 1047].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const dur = i === 3 ? 0.6 : 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.salida);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  }

  /** Un tono que se apaga. */
  private tono(f: number, tipo: OscillatorType, vol: number, dur: number) {
    const ctx = this.ctx!, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo;
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.salida);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Ráfaga de ruido filtrado que se apaga (salpicón, golpe). */
  private golpe(dur: number, corte: number, vol: number) {
    const ctx = this.ctx!, t = ctx.currentTime;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.ruido;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(corte, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(120, corte * 0.2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.salida);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }
}
