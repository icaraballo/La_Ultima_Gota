import { config } from '../core/config';
import { Game } from '../core/game';
import { t } from '../i18n';
import { iconos } from './iconos';

// Pantalla de arranque (v0.17.0): la escena real del juego —vaso recto con agua y un grifo que
// gotea— detrás del título y de dos botones. La escena es una partida de demostración que no
// cuenta como partida: no pasa por las estadísticas ni por los datos de «Opinar», y el nivel del
// agua no sube nunca, así que no puede desbordar. Sin sonido ni vibración.

/** El HTML de encima de la escena. El lema y el título salen de i18n. */
export const htmlIntro = () => `
  <div class="intro-titulo">
    <h1 class="logo">${t.titulo}</h1>
    <p class="lema">${t.lema}</p>
  </div>
  <div class="intro-botones">
    <button class="boton principal" id="intro-jugar">${t.jugar}</button>
    <button class="boton con-icono" id="intro-ajustes">${iconos.ajustes}${t.ajustes}</button>
  </div>`;

/** La partida de demostración: cae una gota cada `dropEvery` s sobre un agua fija a `level`. */
export class Demo {
  readonly game = new Game(['A', 'B'], { seed: 7, vessel: 'cilindro', content: 'agua' });
  private proxima: number;

  constructor() {
    this.fijar();
    this.game.ready();
    this.proxima = this.game.time + 0.8; // la primera gota, enseguida
  }

  /** El agua se queda siempre a la altura de la intro. */
  private fijar() {
    const { glass } = this.game;
    glass.volume = glass.vessel.heightToVolume(config.intro.level);
    glass.foam = 0;
  }

  step(dt: number) {
    const g = this.game;
    g.step(dt);
    this.fijar();
    if (g.phase === 'turno') g.ready(); // el turno de la gota acabó: empieza otro
    if (g.phase === 'echando' && !g.poured && g.time >= this.proxima) {
      g.press();
      g.release(); // un toque = una gota
      this.proxima = g.time + config.intro.dropEvery;
    }
  }
}
