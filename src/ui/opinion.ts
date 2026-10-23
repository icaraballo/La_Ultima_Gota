import { t } from '../i18n';

// Opinar y Privacidad (v0.7.3), como en La Colmena (v11.16 y v11.20) y Chromalchemy: una hoja con
// las preguntas del formulario de Google; al enviar, las respuestas van a su `formResponse` por
// detrás (no-cors: Google no contesta nada legible, solo se sabe si no hubo red) y no se sale del
// juego. Lo escrito se conserva al cerrar sin enviar. La hoja de privacidad va por encima de la de
// opinar: al cerrarla se vuelve a ella. «Atrás» del móvil cierra la de arriba, como en la hoja ⓘ.

export const OPINION_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSeTjojnTeXDSuBKeP3UBZ_8trv3r_6vRLshRLIeJiBcy69A3w/formResponse';
/** El `entry` de cada pregunta, en el orden de `t.opinionPreguntas`. Salen del enlace prerrellenado:
 * si se cambia una pregunta en Google, hay que cambiarla aquí. */
export const OPINION_ENTRIES = ['entry.932365581', 'entry.1764929900', 'entry.332127336', 'entry.1198938977', 'entry.1083438825', 'entry.1276655054'];
/** Los tres que rellena el juego y no se ven (la sección final del formulario). */
export const OPINION_CAMPOS = { version: 'entry.1031068515', modo: 'entry.1550420656', momento: 'entry.1150654629' };
const MAX = { largo: 2000, corto: 100 };

export interface DatosOpinion { version: string; modo?: string; momento?: string }

/** El cuerpo del envío: solo las preguntas con algo escrito y los datos del juego que haya. null si
 * no hay nada escrito. pageHistory: con dos secciones, sin él Google no da la respuesta por terminada. */
export function cuerpoOpinion(respuestas: Record<string, string>, datos: DatosOpinion): string | null {
  const escritas = Object.keys(respuestas).filter(k => String(respuestas[k] ?? '').trim());
  if (!escritas.length) return null;
  const par = (k: string, v: string) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  const pares = escritas.map(k => par(k, String(respuestas[k]).trim()));
  for (const k of Object.keys(OPINION_CAMPOS) as (keyof typeof OPINION_CAMPOS)[]) {
    const v = datos[k];
    if (v) pares.push(par(OPINION_CAMPOS[k], v));
  }
  pares.push(par('pageHistory', '0,1'));
  return pares.join('&');
}

const icono = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17.5H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z"/></svg>';
/** El botón «Opinar» (una línea del acento), para la pantalla de jugadores y el final. */
export const botonOpinar = (id: string) => `<button class="opinar" id="${id}">${icono}${t.opinar}</button>`;

export function createOpinion(root: HTMLElement) {
  root.insertAdjacentHTML('beforeend', `
    <div class="hoja-fondo" id="opinion" hidden>
      <section class="hoja hoja-opinion" role="dialog" aria-modal="true" aria-labelledby="opinion-titulo">
        <header class="hoja-cab">
          <h2 id="opinion-titulo">${t.opinionTitulo}</h2>
          <button class="redondo" id="opinion-cerrar" aria-label="${t.cerrar}">×</button>
        </header>
        <form class="op-form" id="opinion-form" novalidate>
          <div class="hoja-cuerpo op-preguntas" id="opinion-preguntas">
          ${t.opinionPreguntas.map((p, i) => {
            const ph = p.ayuda ? ` placeholder="${p.ayuda}"` : '';
            const campo = p.largo
              ? `<textarea name="${OPINION_ENTRIES[i]}" rows="2" maxlength="${MAX.largo}"${ph}></textarea>`
              : `<input name="${OPINION_ENTRIES[i]}" type="text" maxlength="${MAX.corto}" autocomplete="${i === OPINION_ENTRIES.length - 1 ? 'email' : 'name'}"${ph}>`;
            return `<label>${p.texto}${campo}</label>`;
          }).join('')}
          </div>
          <div class="op-pie">
            <p class="op-aviso" id="opinion-aviso" role="status"></p>
            <button type="submit" class="boton principal" id="opinion-enviar">${t.enviar}</button>
            <p class="op-privacidad">${t.opinionPrivacidad} <button type="button" class="enlace-priv" id="opinion-privacidad">${t.privacidad}</button></p>
          </div>
        </form>
        <div class="hoja-cuerpo op-gracias" id="opinion-gracias" hidden>
          <div class="op-ok">
            <svg width="60" height="60" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="var(--acento)" stroke="var(--tinta)" stroke-width="3"/><path d="M14 25l7 7 13-15" stroke="var(--acento-texto)" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <h3>${t.gracias}</h3><p>${t.graciasTexto}</p>
          </div>
          <button type="button" class="boton principal" id="opinion-volver">${t.volverAlJuego}</button>
        </div>
      </section>
    </div>
    <div class="hoja-fondo encima" id="privacidad" hidden>
      <section class="hoja" role="dialog" aria-modal="true" aria-labelledby="privacidad-titulo">
        <header class="hoja-cab">
          <h2 id="privacidad-titulo">${t.privacidad}</h2>
          <button class="redondo" id="privacidad-cerrar" aria-label="${t.cerrar}">×</button>
        </header>
        <div class="hoja-cuerpo priv-texto">
          ${t.privacidadTexto.map(p => `<p>${p}</p>`).join('')}
          <button type="button" class="boton principal" id="privacidad-ok">${t.entendido}</button>
        </div>
      </section>
    </div>`);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const opinion = $('opinion'), privacidad = $('privacidad');
  const form = $<HTMLFormElement>('opinion-form'), gracias = $('opinion-gracias');
  const aviso = $('opinion-aviso'), enviar = $<HTMLButtonElement>('opinion-enviar');
  let datos: DatosOpinion | null = null;

  // Abrir mete una entrada en el historial: «Atrás» cierra la hoja de arriba en vez de salir.
  const abrirHoja = (hoja: HTMLElement, marca: string) => {
    hoja.hidden = false;
    try { history.pushState({ hoja: marca }, ''); } catch { /* sin historial */ }
  };
  const cerrarHoja = (hoja: HTMLElement, marca: string) => {
    if (hoja.hidden) return;
    if (history.state?.hoja === marca) history.back();
    else hoja.hidden = true;
  };
  window.addEventListener('popstate', () => {
    const marca = history.state?.hoja;
    if (marca !== 'privacidad') privacidad.hidden = true;
    if (marca !== 'opinion' && marca !== 'privacidad') { opinion.hidden = true; datos = null; ajustar(); }
  });

  function abrir(d: DatosOpinion) {
    datos = d;
    form.hidden = false;
    gracias.hidden = true;
    aviso.textContent = '';
    enviar.disabled = false;
    enviar.textContent = t.enviar;
    abrirHoja(opinion, 'opinion');
    $('opinion-preguntas').scrollTop = 0;
    ajustar();
  }
  const cerrar = () => cerrarHoja(opinion, 'opinion');
  function abrirPrivacidad() {
    abrirHoja(privacidad, 'privacidad');
    $('privacidad-ok').focus({ preventScroll: true });
  }
  const cerrarPrivacidad = () => cerrarHoja(privacidad, 'privacidad');

  // Con el teclado del móvil abierto, la hoja sube hasta donde empieza el teclado para poder bajar
  // hasta «Enviar» (CR-16 de La Colmena). Con la página ampliada o el móvil tumbado no se toca.
  function ajustar() {
    const vv = window.visualViewport;
    const suelta = () => { opinion.style.top = ''; opinion.style.bottom = ''; opinion.classList.remove('con-teclado'); };
    if (opinion.hidden || !vv || vv.scale > 1.01 || document.documentElement.dataset.giro) { suelta(); return; }
    const tapado = Math.round(innerHeight - vv.offsetTop - vv.height);
    if (tapado < 1) { suelta(); return; }
    opinion.classList.add('con-teclado');
    opinion.style.bottom = `${tapado}px`;
    opinion.style.top = `${Math.round(vv.offsetTop)}px`;
    const foco = document.activeElement;
    if (foco instanceof HTMLElement && opinion.contains(foco) && foco.matches('textarea,input')) foco.scrollIntoView({ block: 'nearest' });
  }
  window.visualViewport?.addEventListener('resize', ajustar);
  window.visualViewport?.addEventListener('scroll', ajustar);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const respuestas: Record<string, string> = {};
    for (const entry of OPINION_ENTRIES) respuestas[entry] = (form.elements.namedItem(entry) as HTMLInputElement).value;
    const cuerpo = cuerpoOpinion(respuestas, datos ?? { version: __VERSION__ });
    if (!cuerpo) { aviso.textContent = t.opinionVacia; return; }
    aviso.textContent = '';
    enviar.disabled = true;
    enviar.textContent = t.enviando;
    try {
      await fetch(OPINION_FORM, { method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo });
    } catch {
      enviar.disabled = false;
      enviar.textContent = t.enviar;
      aviso.textContent = t.opinionSinRed;
      return;
    }
    form.reset();
    form.hidden = true;
    gracias.hidden = false;
    $('opinion-volver').focus({ preventScroll: true });
  });
  opinion.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el === opinion || el.closest('#opinion-cerrar, #opinion-volver')) cerrar();
    else if (el.closest('#opinion-privacidad')) abrirPrivacidad();
  });
  privacidad.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el === privacidad || el.closest('#privacidad-cerrar, #privacidad-ok')) cerrarPrivacidad();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!privacidad.hidden) cerrarPrivacidad();
    else cerrar();
  });

  return { abrir, abrirPrivacidad };
}
