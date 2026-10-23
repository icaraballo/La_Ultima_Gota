import { config } from '../core/config';
import { Game, type GameOptions, type Phase } from '../core/game';
import { CONTENT_IDS, isSolid, type ContentId } from '../core/contents';
import { LIQUID_IDS, type LiquidId } from '../core/liquids';
import { SOLID_IDS, type SolidId } from '../core/solids';
import { VESSEL_IDS, type VesselId } from '../core/vessels';
import { t } from '../i18n';
import { Barra2D } from '../render/barra-2d';
import { Escena3D } from '../render/escena-3d';
import { aplicarTemas, guardarTema, LIQUIDOS, SOLIDOS, temaGuardado, type TemaId } from '../render/temas';
import { createDebug } from './debug';
import { esc } from './html';
import { iconos } from './iconos';
import { botonOpinar, createOpinion, type DatosOpinion } from './opinion';
import { mantenerVertical } from './orientacion';
import { MAX_NOMBRE, sanearPreparacion, type Preparacion } from './preparacion';

// Pantallas: jugadores (con vaso y líquido, y la hoja ⓘ), «Turno de X», el vaso, eliminado y
// ganador.
// El resto del flujo (resumen, cómo jugar, ajustes) es la fase 4.

const DT = 1 / config.stepsPerSecond;

const K_PARTIDA = 'ultima-gota:partida';
function loadPrep(): Preparacion {
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(K_PARTIDA) ?? 'null'); } catch { /* sin almacenamiento o JSON roto */ }
  return sanearPreparacion(saved);
}
function savePrep(p: Preparacion) {
  try { localStorage.setItem(K_PARTIDA, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}

/** Punto del color de lo que se echa. */
const puntoContenido = (id: ContentId) =>
  `<span class="punto con-borde" style="background:${isSolid(id) ? SOLIDOS.punto[id] : LIQUIDOS[id].cuerpo}"></span>`;

/** Punto de color de cada jugador (por su posición en la lista). */
const punto = (i: number) => `<span class="punto" style="background:var(--punto-${i % 10})"></span>`;

type Grupo = 'vessel' | 'liquid';
/** Qué tiene un vaso o lo que se echa (hoja ⓘ y desplegables). */
function infoDe(grupo: Grupo, id: string): { texto: string; nota: string } {
  if (id === 'aleatorio') return { texto: t.azarTexto, nota: '' };
  if (grupo === 'vessel') return t.infoVasos[id as VesselId];
  return isSolid(id as ContentId) ? t.infoSolidos[id as SolidId] : t.infoLiquidos[id as LiquidId];
}
/** Icono o punto y nombre de una opción. */
function cabezaDe(grupo: Grupo, id: string) {
  if (grupo === 'vessel') return [id === 'aleatorio' ? iconos.dado : iconos.vasos[id as VesselId], t.vasos[id as VesselId | 'aleatorio']];
  return [id === 'aleatorio' ? iconos.dado : puntoContenido(id as ContentId), t.liquidos[id as ContentId | 'aleatorio']];
}
const primeraFrase = (texto: string) => texto.split(/(?<=\.) /)[0];

export function startApp(root: HTMLElement) {
  mantenerVertical();
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
    <div class="version">${t.version(__VERSION__)}<span class="fuera-de-juego"> · <button class="enlace-priv" id="abrir-privacidad">${t.privacidad}</button></span></div>
  `;
  const $ = (id: string) => document.getElementById(id)!;
  const pJugadores = $('p-jugadores'), pJuego = $('p-juego'), capa = $('j-capa');
  const zona = $('j-zona');
  // 3D por defecto; ?2d vuelve al vaso plano de la fase 1 (útil para afinar el tacto). Sin
  // WebGL 2, Three.js no arranca: se juega con el vaso plano, que es jugable entero.
  const canvas = $('j-vaso') as HTMLCanvasElement;
  let vista: Escena3D | Barra2D;
  if (new URLSearchParams(location.search).has('2d')) vista = new Barra2D(canvas);
  else {
    try { vista = new Escena3D(canvas); } catch (e) {
      console.warn('Sin WebGL: se usa el vaso 2D.', e);
      vista = new Barra2D(canvas);
    }
  }
  vista.setTema(tema);
  const debug = createDebug(root, vista);
  const opinion = createOpinion(root);
  $('abrir-privacidad').addEventListener('click', () => opinion.abrirPrivacidad());

  // Lo que acompaña a una opinión (los campos que no se ven del formulario): la partida en curso
  // o, en la pantalla de jugadores, la que está preparada. No se traduce: es para Iñigo.
  let partidas = 0;
  function datosOpinion(): DatosOpinion {
    const vaso = game ? game.vesselId : prep.vessel;
    const contenido = game ? game.contentId : prep.liquid;
    const jugadores = game ? game.players.length : names.length;
    const modo = [t.vasos[vaso], t.liquidos[contenido], `${jugadores} jugadores`, tema, vista instanceof Escena3D ? '3D' : '2D'].join(' · ');
    const momento = game ? (game.phase === 'fin' ? `Acabada · ${game.round} ${game.round === 1 ? 'ronda' : 'rondas'}` : `Ronda ${game.round}`)
      : partidas ? `Inicio, tras ${partidas} ${partidas === 1 ? 'partida' : 'partidas'}` : 'Inicio';
    return { version: `v${__VERSION__}`, modo, momento };
  }

  let zonaUsada: boolean | null = null;
  function setZona(usada: boolean) {
    if (usada === zonaUsada) return;
    zonaUsada = usada;
    zona.classList.toggle('usada', usada);
    const piezas = game?.pile != null;
    zona.innerHTML = usada ? `<span>${t.cayendo}</span>` : `${iconos.gota}<span>${piezas ? t.zonaPiezas : t.zonaEchar}</span>`;
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
  /** Fila desplegable (v0.8.0, opción B): lo elegido y una línea de qué tiene; abre la hoja. */
  function selector(grupo: Grupo) {
    const id = prep[grupo];
    const [icono, nombre] = cabezaDe(grupo, id);
    return `<button class="selector" data-abrir="${grupo}" aria-haspopup="dialog" aria-label="${grupo === 'vessel' ? t.vaso : t.liquido}: ${nombre}">
      <span class="selector-icono">${icono}</span>
      <span class="selector-nombre">${nombre}<small>${primeraFrase(infoDe(grupo, id).texto)}</small></span>
      <span class="selector-flecha" aria-hidden="true">▾</span>
    </button>`;
  }
  function showPlayers() {
    game = null;
    document.body.classList.remove('en-juego');
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
            <input data-i="${i}" maxlength="${MAX_NOMBRE}" aria-label="${t.jugadorN(i + 1)}" placeholder="${t.jugadorN(i + 1)}" value="${esc(n)}">
            ${names.length > config.minPlayers ? `<button class="quitar" data-quitar="${i}" aria-label="${t.quitarJugador}">×</button>` : ''}
          </li>`).join('')}
      </ol>
      ${names.length < config.maxPlayers ? `<button class="anadir" id="anadir">${t.anadirJugador}</button>` : ''}
      <h2>${t.vasoYContenido}</h2>
      ${selector('vessel')}
      ${selector('liquid')}
      <label class="check"><input type="checkbox" id="orden-aleatorio" ${prep.randomOrder ? 'checked' : ''}> ${t.empezarAleatorio}</label>
      <div class="opinar-fila">${botonOpinar('opinar')}</div>
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
    if (el.dataset.abrir) {
      abrirElegir(el.dataset.abrir as Grupo);
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
    } else if (el.id === 'opinar') {
      opinion.abrir(datosOpinion());
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
          <ul>${LIQUID_IDS.map(id => tarjeta(prep.liquid === id, `${puntoContenido(id)}${t.liquidos[id]}`, t.infoLiquidos[id])).join('')}</ul>
          <h3>${t.solidosTitulo}</h3>
          <ul>${SOLID_IDS.map(id => tarjeta(prep.liquid === id, `${puntoContenido(id)}${t.liquidos[id]}`, t.infoSolidos[id])).join('')}</ul>
          <p class="hoja-pie">${t.infoPie}</p>
        </div>
      </section>`;
    hoja.hidden = false;
    // «Atrás» del móvil también la cierra.
    try { history.pushState({ hoja: true }, ''); } catch { /* sin historial */ }
    ($('cerrar-info') as HTMLButtonElement).focus();
  }
  /** Hoja desde abajo con todas las opciones de un grupo y la explicación de lo elegido. Elegir
   * la cierra. Usa el mismo fondo que la hoja ⓘ. */
  function abrirElegir(grupo: Grupo) {
    const ids = [...(grupo === 'vessel' ? VESSEL_IDS : CONTENT_IDS), 'aleatorio'];
    const info = infoDe(grupo, prep[grupo]);
    const titulo = grupo === 'vessel' ? t.vaso : t.liquido;
    hoja.innerHTML = `
      <section class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
        <header class="hoja-cab">
          <h2 id="hoja-titulo">${titulo}</h2>
          <button class="redondo" id="cerrar-info" aria-label="${t.cerrar}">×</button>
        </header>
        <div class="hoja-cuerpo">
          <div class="opciones tres${grupo === 'vessel' ? ' vasos' : ''}">
            ${ids.map(id => {
              const [icono, nombre] = cabezaDe(grupo, id);
              return `<button class="opcion${prep[grupo] === id ? ' elegida' : ''}" data-elegir="${grupo}" data-valor="${id}">${icono}${nombre}</button>`;
            }).join('')}
          </div>
          <p class="elegir-info"><b>${cabezaDe(grupo, prep[grupo])[1]}</b> · ${info.texto}${info.nota ? ` <em>${info.nota}</em>` : ''}</p>
        </div>
      </section>`;
    hoja.hidden = false;
    try { history.pushState({ hoja: true }, ''); } catch { /* sin historial */ }
    (hoja.querySelector('.opcion.elegida') as HTMLButtonElement | null)?.focus();
  }
  function cerrarInfo() {
    if (hoja.hidden) return;
    if (history.state?.hoja) history.back();
    else hoja.hidden = true;
  }
  window.addEventListener('popstate', () => { hoja.hidden = true; });
  hoja.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    const opcion = el.closest<HTMLElement>('[data-elegir]');
    if (opcion) {
      (prep[opcion.dataset.elegir as Grupo] as string) = opcion.dataset.valor!;
      cerrarInfo();
      showPlayers();
    } else if (el === hoja || el.closest('#cerrar-info')) cerrarInfo();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarInfo(); });

  function start() {
    const finalNames = names.map((n, i) => n.trim() || t.jugadorN(i + 1));
    prep.names = names;
    savePrep(prep);
    const options: GameOptions = {
      seed: (Math.random() * 2 ** 32) >>> 0,
      vessel: prep.vessel,
      content: prep.liquid,
      randomOrder: prep.randomOrder,
    };
    game = new Game(finalNames, options);
    partidas++;
    document.body.classList.add('en-juego');
    zonaUsada = null;
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
  // Salir a otra app con el dedo puesto no siempre manda pointerup ni pointercancel: sin esto,
  // al volver el chorro seguía abierto y el turno no acababa (UB-05).
  const soltarSiPulsa = () => { if (game?.pressing) release(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) soltarSiPulsa(); });
  window.addEventListener('pagehide', soltarSiPulsa);
  window.addEventListener('blur', soltarSiPulsa);

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
    else if (el.id === 'opinar-fin') opinion.abrir(datosOpinion());
  });

  function showPhase(g: Game) {
    const nombre = (i: number) => esc(g.players[i].name);
    $('j-turno').innerHTML = g.phase === 'echando' ? `${punto(g.current)}<span>${t.turnoDe(nombre(g.current))}</span>` : '';
    $('j-despues').textContent = g.phase === 'echando' ? t.despues(g.players[g.next].name) : '';
    capa.hidden = g.phase === 'echando';
    capaArmada = false;
    capa.className = 'capa ' + g.phase;
    if (g.phase === 'turno') zonaUsada = null; // el texto cambia si la ronda pasa a piezas
    if (g.phase === 'turno') {
      capa.innerHTML = `
        <p class="pequeno">${t.pasaElMovil}</p>
        <h1 class="grande">${punto(g.current)}${t.turnoDe(nombre(g.current))}</h1>
        <p class="combinacion">${t.combinacion(t.liquidos[g.contentId], t.vasos[g.vesselId])}</p>
        <button class="boton principal" id="listo">${t.listo}</button>`;
    } else if (g.phase === 'desborde') {
      const quedan = g.alive.length;
      capa.innerHTML = `
        <div class="tarjeta">
          <h2>${isSolid(g.contentId) ? t.eliminadoPieza(nombre(g.loser!), g.contentId) : t.eliminado(nombre(g.loser!))}</h2>
          ${quedan > 1 ? `<p>${t.quedan(quedan)}</p>` : ''}
          <button class="boton principal" id="seguir">${quedan > 1 ? t.siguienteRonda : t.verGanador}</button>
          ${quedan > 1 ? `<button class="boton con-icono" id="seguir-azar">${iconos.dado}${t.combinacionAleatoria}</button>` : ''}
        </div>`;
    } else if (g.phase === 'fin') {
      capa.innerHTML = `
        <h1 class="grande">${t.gana(nombre(g.winner!))}</h1>
        <button class="boton principal" id="revancha">${t.revancha}</button>
        <button class="boton secundario" id="jugadores">${t.cambiarJugadores}</button>
        ${botonOpinar('opinar-fin')}`;
    }
  }

  // ── Bucle: lógica a paso fijo, dibujo a lo que dé la pantalla ──
  let last = performance.now();
  let acc = 0;
  let errorVisto = false;
  function frame(nowMs: number) {
    try {
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
    } catch (e) {
      // Un fallo en un frame no puede congelar el juego: se apunta una vez y se sigue.
      if (!errorVisto) console.error(e);
      errorVisto = true;
      acc = 0; // si el fallo fue en step(), que no se acumule tiempo sin consumir
    } finally {
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);

  showPlayers();
}
