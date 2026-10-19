import { config } from '../core/config';
import { Game, type GameOptions, type Phase } from '../core/game';
import { LIQUID_IDS, type LiquidId } from '../core/liquids';
import { VESSEL_IDS, type VesselId } from '../core/vessels';
import { t } from '../i18n';
import { Barra2D } from '../render/barra-2d';
import { Escena3D } from '../render/escena-3d';
import { createDebug } from './debug';

// Pantallas: jugadores (con vaso y líquido), «Turno de X», el vaso, eliminado y ganador.
// El resto del flujo (resumen, cómo jugar, ajustes) es la fase 4.

const DT = 1 / config.stepsPerSecond;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const K_PARTIDA = 'ultima-gota:partida';
interface Preparacion {
  names: string[];
  vessel: VesselId | 'aleatorio';
  liquid: LiquidId | 'aleatorio';
  changeEachRound: boolean;
}
function loadPrep(): Preparacion {
  const base: Preparacion = { names: ['', ''], vessel: 'cilindro', liquid: 'agua', changeEachRound: false };
  try {
    const saved = JSON.parse(localStorage.getItem(K_PARTIDA) ?? 'null');
    if (saved && Array.isArray(saved.names)) return { ...base, ...saved };
  } catch { /* sin almacenamiento */ }
  return base;
}
function savePrep(p: Preparacion) {
  try { localStorage.setItem(K_PARTIDA, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}

export function startApp(root: HTMLElement) {
  const prep = loadPrep();
  let names = prep.names;
  let game: Game | null = null;
  let shownPhase: Phase | null = null;

  root.innerHTML = `
    <section class="pantalla" id="p-jugadores"></section>
    <section class="pantalla juego" id="p-juego" hidden>
      <header class="cabecera">
        <div class="turno" id="j-turno"></div>
        <div class="despues" id="j-despues"></div>
      </header>
      <canvas id="j-vaso"></canvas>
      <footer class="controles">
        <button class="zona" id="j-zona">${t.zonaEchar}</button>
      </footer>
      <div class="capa" id="j-capa" hidden></div>
    </section>
    <div class="version">${t.version(__VERSION__)}</div>
  `;
  const $ = (id: string) => document.getElementById(id)!;
  const pJugadores = $('p-jugadores'), pJuego = $('p-juego'), capa = $('j-capa');
  const zona = $('j-zona');
  // 3D por defecto; ?2d vuelve al vaso plano de la fase 1 (útil para afinar el tacto).
  const canvas = $('j-vaso') as HTMLCanvasElement;
  const vista = new URLSearchParams(location.search).has('2d') ? new Barra2D(canvas) : new Escena3D(canvas);
  const debug = createDebug(root, vista);

  // ── Jugadores ──────────────────────────────────────────────
  function showPlayers() {
    game = null;
    pJuego.hidden = true;
    pJugadores.hidden = false;
    pJugadores.innerHTML = `
      <h1 class="logo" id="logo">${t.titulo}</h1>
      <p class="lema">${t.lema}</p>
      <h2>${t.jugadores}</h2>
      <ol class="lista">
        ${names.map((n, i) => `
          <li>
            <input data-i="${i}" maxlength="16" placeholder="${t.jugadorN(i + 1)}" value="${esc(n)}">
            ${names.length > config.minPlayers ? `<button class="quitar" data-quitar="${i}" aria-label="${t.quitarJugador}">×</button>` : ''}
          </li>`).join('')}
      </ol>
      ${names.length < config.maxPlayers ? `<button class="boton secundario" id="anadir">${t.anadirJugador}</button>` : ''}
      <h2>${t.vaso}</h2>
      <div class="opciones" data-opcion="vessel">
        ${[...VESSEL_IDS, 'aleatorio' as const].map(id => `<button class="opcion${prep.vessel === id ? ' elegida' : ''}" data-valor="${id}">${t.vasos[id]}</button>`).join('')}
      </div>
      <h2>${t.liquido}</h2>
      <div class="opciones" data-opcion="liquid">
        ${[...LIQUID_IDS, 'aleatorio' as const].map(id => `<button class="opcion${prep.liquid === id ? ' elegida' : ''}" data-valor="${id}">${t.liquidos[id]}</button>`).join('')}
      </div>
      <label class="check"><input type="checkbox" id="cada-ronda" ${prep.changeEachRound ? 'checked' : ''}> ${t.cambiarCadaRonda}</label>
      <button class="boton" id="empezar">${t.empezar}</button>
    `;
  }
  pJugadores.addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.i) names[+el.dataset.i] = el.value;
    if (el.id === 'cada-ronda') prep.changeEachRound = el.checked;
  });
  pJugadores.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el) return;
    const grupo = (el.parentElement as HTMLElement).dataset.opcion as 'vessel' | 'liquid' | undefined;
    if (grupo && el.dataset.valor) {
      (prep[grupo] as string) = el.dataset.valor;
      el.parentElement!.querySelectorAll('.opcion').forEach(b => b.classList.toggle('elegida', b === el));
    } else if (el.dataset.quitar) {
      names.splice(+el.dataset.quitar, 1);
      showPlayers();
    } else if (el.id === 'anadir') {
      names.push('');
      showPlayers();
      (pJugadores.querySelector(`input[data-i="${names.length - 1}"]`) as HTMLInputElement)?.focus();
    } else if (el.id === 'empezar') {
      start();
    }
  });

  function start() {
    const finalNames = names.map((n, i) => n.trim() || t.jugadorN(i + 1));
    prep.names = names;
    savePrep(prep);
    const options: GameOptions = {
      seed: (Math.random() * 2 ** 32) >>> 0,
      vessel: prep.vessel,
      liquid: prep.liquid,
      changeEachRound: prep.changeEachRound,
    };
    game = new Game(finalNames, options);
    shownPhase = null;
    pJugadores.hidden = true;
    pJuego.hidden = false;
  }

  // ── Juego ──────────────────────────────────────────────────
  const press = (e: PointerEvent) => {
    e.preventDefault();
    zona.setPointerCapture(e.pointerId);
    zona.classList.add('pulsada');
    game?.press();
  };
  const release = () => {
    zona.classList.remove('pulsada');
    game?.release();
  };
  zona.addEventListener('pointerdown', press);
  zona.addEventListener('pointerup', release);
  zona.addEventListener('pointercancel', release);
  zona.addEventListener('contextmenu', e => e.preventDefault());

  // Modo depuración: ?debug en la URL o mantener pulsado el título 1 s.
  let logoTimer = 0;
  pJugadores.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).id === 'logo') logoTimer = window.setTimeout(() => debug.toggle(), 1000);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    pJugadores.addEventListener(ev, () => clearTimeout(logoTimer));
  }

  capa.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || !game) return;
    if (el.id === 'listo') game.ready();
    else if (el.id === 'seguir') game.continue();
    else if (el.id === 'revancha') start();
    else if (el.id === 'jugadores') showPlayers();
  });

  function showPhase(g: Game) {
    const nombre = (i: number) => esc(g.players[i].name);
    $('j-turno').textContent = g.phase === 'echando' ? t.turnoDe(g.players[g.current].name) : '';
    $('j-despues').textContent = g.phase === 'echando' ? t.despues(g.players[g.next].name) : '';
    capa.hidden = g.phase === 'echando';
    capa.className = 'capa ' + g.phase;
    if (g.phase === 'turno') {
      capa.innerHTML = `
        <p class="pequeno">${t.pasaElMovil}</p>
        <h1 class="grande">${t.turnoDe(nombre(g.current))}</h1>
        <p class="combinacion">${t.combinacion(t.liquidos[g.liquidId], t.vasos[g.vesselId])}</p>
        <button class="boton" id="listo">${t.listo}</button>`;
    } else if (g.phase === 'desborde') {
      const quedan = g.alive.length;
      capa.innerHTML = `
        <div class="tarjeta">
          <h2>${t.eliminado(nombre(g.loser!))}</h2>
          ${quedan > 1 ? `<p>${t.quedan(quedan)}</p>` : ''}
          <button class="boton" id="seguir">${quedan > 1 ? t.siguienteRonda : t.verGanador}</button>
        </div>`;
    } else if (g.phase === 'fin') {
      capa.innerHTML = `
        <h1 class="grande">${t.gana(nombre(g.winner!))}</h1>
        <button class="boton" id="revancha">${t.revancha}</button>
        <button class="boton secundario" id="jugadores">${t.cambiarJugadores}</button>`;
    }
  }

  // ── Bucle: lógica a paso fijo, dibujo a lo que dé la pantalla ──
  let last = performance.now();
  let acc = 0;
  function frame(nowMs: number) {
    acc += Math.min(0.25, (nowMs - last) / 1000);
    last = nowMs;
    if (game) {
      while (acc >= DT) {
        game.step(DT);
        acc -= DT;
      }
      if (game.phase !== shownPhase) {
        shownPhase = game.phase;
        showPhase(game);
      }
      zona.classList.toggle('usada', game.poured);
      zona.textContent = game.poured ? t.cayendo : t.zonaEchar;
      vista.draw(game, nowMs / 1000);
      debug.update(game);
    } else {
      acc = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  showPlayers();
}
