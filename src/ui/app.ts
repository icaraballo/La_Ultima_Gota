import { config } from '../core/config';
import { Game, type GameOptions, type Phase } from '../core/game';
import { LIQUID_IDS, type LiquidId } from '../core/liquids';
import { VESSEL_IDS, type VesselId } from '../core/vessels';
import { t } from '../i18n';
import { Barra2D } from '../render/barra-2d';
import { Escena3D } from '../render/escena-3d';
import { aplicarTemas, guardarTema, LIQUIDOS, temaGuardado, type TemaId } from '../render/temas';
import { createDebug } from './debug';
import { iconos } from './iconos';

// Pantallas: jugadores (con vaso y líquido, y la hoja ⓘ), «Turno de X», el vaso, eliminado y
// ganador.
// El resto del flujo (resumen, cómo jugar, ajustes) es la fase 4.

const DT = 1 / config.stepsPerSecond;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const K_PARTIDA = 'ultima-gota:partida';
interface Preparacion {
  names: string[];
  vessel: VesselId | 'aleatorio';
  liquid: LiquidId | 'aleatorio';
  /** «Empezar en orden aleatorio»: se baraja una vez al crear la partida. */
  randomOrder: boolean;
}
function loadPrep(): Preparacion {
  const base: Preparacion = { names: ['', ''], vessel: 'cilindro', liquid: 'agua', randomOrder: false };
  try {
    const saved = JSON.parse(localStorage.getItem(K_PARTIDA) ?? 'null');
    if (saved && Array.isArray(saved.names)) {
      const { names, vessel, liquid, randomOrder } = { ...base, ...saved } as Preparacion;
      return { names: names.slice(0, config.maxPlayers), vessel, liquid, randomOrder };
    }
  } catch { /* sin almacenamiento */ }
  return base;
}
function savePrep(p: Preparacion) {
  try { localStorage.setItem(K_PARTIDA, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}

/** Punto de color de cada jugador (por su posición en la lista). */
const punto = (i: number) => `<span class="punto" style="background:var(--punto-${i % 10})"></span>`;

export function startApp(root: HTMLElement) {
  let tema: TemaId = temaGuardado();
  aplicarTemas(tema);
  const prep = loadPrep();
  let names = prep.names;
  let game: Game | null = null;
  let shownPhase: Phase | null = null;

  root.innerHTML = `
    <section class="pantalla" id="p-jugadores"></section>
    <section class="pantalla juego" id="p-juego" hidden>
      <header class="cabecera">
        <div class="turno-de" id="j-turno"></div>
        <div class="despues" id="j-despues"></div>
      </header>
      <canvas id="j-vaso"></canvas>
      <footer class="controles">
        <button class="zona" id="j-zona"></button>
      </footer>
      <div class="capa" id="j-capa" hidden></div>
    </section>
    <div class="hoja-fondo" id="hoja" hidden></div>
    <div class="version">${t.version(__VERSION__)}</div>
  `;
  const $ = (id: string) => document.getElementById(id)!;
  const pJugadores = $('p-jugadores'), pJuego = $('p-juego'), capa = $('j-capa');
  const zona = $('j-zona');
  // 3D por defecto; ?2d vuelve al vaso plano de la fase 1 (útil para afinar el tacto).
  const canvas = $('j-vaso') as HTMLCanvasElement;
  const vista = new URLSearchParams(location.search).has('2d') ? new Barra2D(canvas) : new Escena3D(canvas);
  vista.setTema(tema);
  const debug = createDebug(root, vista);

  const zonaReposo = `${iconos.gota}<span>${t.zonaEchar}</span>`;
  let zonaUsada: boolean | null = null;
  function setZona(usada: boolean) {
    if (usada === zonaUsada) return;
    zonaUsada = usada;
    zona.classList.toggle('usada', usada);
    zona.innerHTML = usada ? `<span>${t.cayendo}</span>` : zonaReposo;
  }

  const botonTema = () => tema === 'noche'
    ? `<button class="redondo" id="tema" aria-label="${t.modoDia}">${iconos.sol}</button>`
    : `<button class="redondo" id="tema" aria-label="${t.modoNoche}">${iconos.luna}</button>`;
  function cambiarTema() {
    tema = tema === 'noche' ? 'dia' : 'noche';
    guardarTema(tema);
    aplicarTemas(tema);
    vista.setTema(tema);
    $('tema').outerHTML = botonTema();
  }

  // ── Jugadores ──────────────────────────────────────────────
  function showPlayers() {
    game = null;
    pJuego.hidden = true;
    pJugadores.hidden = false;
    const scroll = pJugadores.querySelector('.desplazable')?.scrollTop ?? 0;
    pJugadores.innerHTML = `
      <div class="desplazable">
      <div class="esquinas">
        <button class="redondo" id="abrir-info" aria-label="${t.info}">${iconos.info}</button>
        ${botonTema()}
      </div>
      <div class="titulo">
        ${iconos.gotaTitulo}
        <h1 class="logo" id="logo">${t.titulo}</h1>
        <p class="lema">${t.lema}</p>
      </div>
      <h2>${t.jugadores}</h2>
      <ol class="lista">
        ${names.map((n, i) => `
          <li class="campo">
            ${punto(i)}
            <input data-i="${i}" maxlength="16" aria-label="${t.jugadorN(i + 1)}" placeholder="${t.jugadorN(i + 1)}" value="${esc(n)}">
            ${names.length > config.minPlayers ? `<button class="quitar" data-quitar="${i}" aria-label="${t.quitarJugador}">×</button>` : ''}
          </li>`).join('')}
      </ol>
      ${names.length < config.maxPlayers ? `<button class="anadir" id="anadir">${t.anadirJugador}</button>` : ''}
      <h2>${t.vaso}</h2>
      <div class="opciones vasos" data-opcion="vessel">
        ${[...VESSEL_IDS, 'aleatorio' as const].map(id => `<button class="opcion${prep.vessel === id ? ' elegida' : ''}" data-valor="${id}"${id === 'aleatorio' ? ` aria-label="${t.vasoAzar}"` : ''}>${id === 'aleatorio' ? iconos.dado : iconos.vasos[id]}${t.vasos[id]}</button>`).join('')}
      </div>
      <h2>${t.liquido}</h2>
      <div class="opciones" data-opcion="liquid">
        ${[...LIQUID_IDS, 'aleatorio' as const].map(id => id === 'aleatorio'
          ? `<button class="opcion${prep.liquid === id ? ' elegida' : ''}" data-valor="${id}" aria-label="${t.liquidoAzar}">${iconos.dado}</button>`
          : `<button class="opcion${prep.liquid === id ? ' elegida' : ''}" data-valor="${id}"><span class="punto con-borde" style="background:${LIQUIDOS[id].cuerpo}"></span>${t.liquidos[id]}</button>`).join('')}
      </div>
      <label class="check"><input type="checkbox" id="orden-aleatorio" ${prep.randomOrder ? 'checked' : ''}> ${t.empezarAleatorio}</label>
      </div>
      <div class="pie"><button class="boton principal" id="empezar">${t.empezar}</button></div>
    `;
    pJugadores.querySelector('.desplazable')!.scrollTop = scroll;
  }
  pJugadores.addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.i) names[+el.dataset.i] = el.value;
    if (el.id === 'orden-aleatorio') prep.randomOrder = el.checked;
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
    } else if (el.id === 'tema') {
      cambiarTema();
    } else if (el.id === 'abrir-info') {
      abrirInfo();
    }
  });

  // ── Hoja ⓘ: qué tiene cada vaso y cada líquido (solo fuera de la partida) ──
  const hoja = $('hoja');
  function abrirInfo() {
    const tarjeta = (elegida: boolean, cabeza: string, info: { texto: string; nota: string }) => `
      <li class="tarjeta-info${elegida ? ' elegida' : ''}">
        <h4>${cabeza}</h4>
        <p>${info.texto}${info.nota ? ` <em>${info.nota}</em>` : ''}</p>
      </li>`;
    hoja.innerHTML = `
      <section class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
        <header class="hoja-cab">
          <h2 id="hoja-titulo">${t.info}</h2>
          <button class="redondo" id="cerrar-info" aria-label="${t.cerrar}">×</button>
        </header>
        <div class="hoja-cuerpo">
          <h3>${t.vasosTitulo}</h3>
          <ul>${VESSEL_IDS.map(id => tarjeta(prep.vessel === id, `${iconos.vasos[id]}${t.vasos[id]}`, t.infoVasos[id])).join('')}</ul>
          <h3>${t.liquidosTitulo}</h3>
          <ul>${LIQUID_IDS.map(id => tarjeta(prep.liquid === id, `<span class="punto con-borde" style="background:${LIQUIDOS[id].cuerpo}"></span>${t.liquidos[id]}`, t.infoLiquidos[id])).join('')}</ul>
          <p class="hoja-pie">${t.infoPie}</p>
        </div>
      </section>`;
    hoja.hidden = false;
    // «Atrás» del móvil también la cierra.
    try { history.pushState({ hoja: true }, ''); } catch { /* sin historial */ }
    ($('cerrar-info') as HTMLButtonElement).focus();
  }
  function cerrarInfo() {
    if (hoja.hidden) return;
    if (history.state?.hoja) history.back();
    else hoja.hidden = true;
  }
  window.addEventListener('popstate', () => { hoja.hidden = true; });
  hoja.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el === hoja || el.closest('#cerrar-info')) cerrarInfo();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarInfo(); });

  function start() {
    const finalNames = names.map((n, i) => n.trim() || t.jugadorN(i + 1));
    prep.names = names;
    savePrep(prep);
    const options: GameOptions = {
      seed: (Math.random() * 2 ** 32) >>> 0,
      vessel: prep.vessel,
      liquid: prep.liquid,
      randomOrder: prep.randomOrder,
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

  // Si la capa aparece con el dedo aún en la zona (desborde), al soltar no debe pulsar nada:
  // solo vale un toque que empiece con la capa ya a la vista (o el teclado, detail = 0).
  let capaArmada = false;
  capa.addEventListener('pointerdown', () => { capaArmada = true; });
  capa.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || !game || (!capaArmada && e.detail !== 0)) return;
    if (el.id === 'listo') {
      game.ready();
      setZona(false);
    }
    else if (el.id === 'seguir') game.continue();
    else if (el.id === 'seguir-azar') game.continue(true);
    else if (el.id === 'revancha') start();
    else if (el.id === 'jugadores') showPlayers();
  });

  function showPhase(g: Game) {
    const nombre = (i: number) => esc(g.players[i].name);
    $('j-turno').innerHTML = g.phase === 'echando' ? `${punto(g.current)}<span>${t.turnoDe(nombre(g.current))}</span>` : '';
    $('j-despues').textContent = g.phase === 'echando' ? t.despues(g.players[g.next].name) : '';
    capa.hidden = g.phase === 'echando';
    capaArmada = false;
    capa.className = 'capa ' + g.phase;
    if (g.phase === 'turno') {
      capa.innerHTML = `
        <p class="pequeno">${t.pasaElMovil}</p>
        <h1 class="grande">${punto(g.current)}${t.turnoDe(nombre(g.current))}</h1>
        <p class="combinacion">${t.combinacion(t.liquidos[g.liquidId], t.vasos[g.vesselId])}</p>
        <button class="boton principal" id="listo">${t.listo}</button>`;
    } else if (g.phase === 'desborde') {
      const quedan = g.alive.length;
      capa.innerHTML = `
        <div class="tarjeta">
          <h2>${t.eliminado(nombre(g.loser!))}</h2>
          ${quedan > 1 ? `<p>${t.quedan(quedan)}</p>` : ''}
          <button class="boton principal" id="seguir">${quedan > 1 ? t.siguienteRonda : t.verGanador}</button>
          ${quedan > 1 ? `<button class="boton con-icono" id="seguir-azar">${iconos.dado}${t.combinacionAleatoria}</button>` : ''}
        </div>`;
    } else if (g.phase === 'fin') {
      capa.innerHTML = `
        <h1 class="grande">${t.gana(nombre(g.winner!))}</h1>
        <button class="boton principal" id="revancha">${t.revancha}</button>
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
      setZona(game.poured);
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
