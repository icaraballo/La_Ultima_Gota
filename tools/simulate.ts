// Simulador de bots (fase 5, UG-DESIGN §9.3). Juega rondas enteras con bots de tres estrategias
// (prudente, arriesgado, aleatorio) sobre las 48 combinaciones de vaso × contenido y dice cuáles
// están rotas. Solo usa core/: no toca el juego ni necesita navegador.
//
//   npm run simular                          todo (lento con canicas y monedas)
//   npm run simular -- --vaso copa           solo un vaso   (--contenido agua, también)
//   npm run simular -- --rondas 300 --rondas-piezas 40 --jugadores 4 --semilla 1
//   npm run simular -- --ajuste leak.maxPerTurn=0.03   prueba un valor de config sin tocar config.ts
//                                            (se puede repetir; sirve para «¿y si…?»)
//   npm run simular -- --json salida.json    guarda los datos para juntarlos luego
//   npm run simular -- --informe a.json b.json   junta resultados y escribe el informe (Markdown)

import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../src/core/config';
import { CONTENT_IDS, isSolid, type ContentId } from '../src/core/contents';
import { Game } from '../src/core/game';
import { createRng, type Rng } from '../src/core/rng';
import type { Phase } from '../src/core/game';
import { VESSEL_IDS, type VesselId } from '../src/core/vessels';

const DT = 1 / config.stepsPerSecond;

// ---------------------------------------------------------------------------------------------
// Bots. Los números de aquí son de la herramienta (cómo juega una persona), no del juego.
// ---------------------------------------------------------------------------------------------

export type Estrategia = 'prudente' | 'arriesgado' | 'aleatorio';
export const ESTRATEGIAS: Estrategia[] = ['prudente', 'arriesgado', 'aleatorio'];

/** Cuánto mantiene pulsado cada bot (s). 0 = un toque. */
function pulsacion(e: Estrategia, rng: Rng): number {
  switch (e) {
    case 'prudente': return 0; // siempre toca
    case 'arriesgado': return 0.5 + rng.next() * 1.0; // siempre chorro, de 0,5 a 1,5 s
    case 'aleatorio': return rng.next() < 0.5 ? 0 : 0.2 + rng.next() * 1.0; // la mitad toca
  }
}

/** Lo que tarda una persona en empezar a echar desde «¡Listo!» (s). Importa para la leche. */
const duda = (rng: Rng) => 0.3 + rng.next() * 1.2;
/** Lo que tarda el móvil en pasar de mano en mano (s). Importa para el vaso con fuga. */
const pase = (rng: Rng) => 2 + rng.next() * 3;

// ---------------------------------------------------------------------------------------------
// Una ronda
// ---------------------------------------------------------------------------------------------

export interface Ronda {
  /** Turnos jugados hasta el desborde, contando el que desbordó. */
  turnos: number;
  /** Posición (0 = quien abre) de quien desbordó dentro del orden de la ronda. */
  asiento: number;
  /** No se desbordó en `topeTurnos`: la ronda es eterna. */
  eterna: boolean;
}

function avanzar(g: Game, segundos: number) {
  const n = Math.round(segundos / DT);
  for (let i = 0; i < n && g.phase !== 'desborde'; i++) g.step(DT);
}

export function rondaConBots(
  vaso: VesselId, contenido: ContentId, e: Estrategia, jugadores: number, seed: number, topeTurnos: number,
): Ronda {
  const g = new Game(Array.from({ length: jugadores }, (_, i) => `J${i + 1}`), { seed, vessel: vaso, content: contenido });
  const rng = createRng(seed ^ 0x9e3779b9);
  let turnos = 0;
  // TypeScript estrecha g.phase tras cada comprobación; las llamadas la cambian por dentro.
  const fase = (): Phase => g.phase;
  while (fase() !== 'desborde' && turnos < topeTurnos) {
    if (fase() !== 'turno') throw new Error(`fase inesperada: ${fase()}`);
    avanzar(g, pase(rng)); // se pasa el móvil (la fuga actúa)
    g.ready();
    avanzar(g, duda(rng)); // piensa (la leche sube)
    if (fase() === 'desborde') { turnos++; break; }
    g.press();
    avanzar(g, Math.max(DT, pulsacion(e, rng)));
    g.release();
    // Que caiga lo echado; el turno pasa solo (el tope de 20 s evita bucles si algo se atasca).
    for (let i = 0; i < 20 / DT && fase() === 'echando'; i++) g.step(DT);
    turnos++;
  }
  const eterna = fase() !== 'desborde';
  return { turnos, asiento: eterna ? -1 : g.turn, eterna };
}

// ---------------------------------------------------------------------------------------------
// Estadísticas por combinación
// ---------------------------------------------------------------------------------------------

export interface Resultado {
  vaso: VesselId;
  contenido: ContentId;
  estrategia: Estrategia;
  jugadores: number;
  rondas: number;
  /** Media de turnos por ronda (sin contar las eternas). */
  turnosMedia: number;
  turnosMediana: number;
  turnosP90: number;
  /** Vueltas completas = turnos / jugadores. */
  vueltasMedia: number;
  /** Rondas que pierde el primero (turno 1). */
  primerTurno: number;
  /** Rondas que no acaban antes del tope. */
  eternas: number;
  /** Reparto de derrotas por asiento (suma 1). */
  asientos: number[];
}

const media = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const percentil = (ordenado: number[], p: number) =>
  ordenado.length ? ordenado[Math.min(ordenado.length - 1, Math.floor(p * ordenado.length))] : NaN;

export function simular(
  vaso: VesselId, contenido: ContentId, e: Estrategia, jugadores: number, rondas: number, semilla: number,
): Resultado {
  const tope = isSolid(contenido) ? 400 : 1500;
  const turnos: number[] = [];
  const asientos = new Array<number>(jugadores).fill(0);
  let primerTurno = 0, eternas = 0;
  for (let i = 0; i < rondas; i++) {
    const r = rondaConBots(vaso, contenido, e, jugadores, semilla * 100003 + i, tope);
    if (r.eterna) { eternas++; continue; }
    turnos.push(r.turnos);
    asientos[r.asiento]++;
    if (r.turnos === 1) primerTurno++;
  }
  const ord = [...turnos].sort((a, b) => a - b);
  const ok = turnos.length || 1;
  return {
    vaso, contenido, estrategia: e, jugadores, rondas,
    turnosMedia: media(turnos), turnosMediana: percentil(ord, 0.5), turnosP90: percentil(ord, 0.9),
    vueltasMedia: media(turnos) / jugadores,
    primerTurno: primerTurno / rondas, eternas: eternas / rondas,
    asientos: asientos.map(n => n / ok),
  };
}

// ---------------------------------------------------------------------------------------------
// Diagnóstico: qué combinaciones están rotas
// ---------------------------------------------------------------------------------------------

/** Objetivo orientativo de UG-DESIGN §9.3: con 4 jugadores, de 3 a 6 vueltas por ronda. */
export const OBJETIVO = { min: 3, max: 6 };
/** Umbrales del diagnóstico (de la herramienta, ajustables). */
export const UMBRALES = {
  /** Eterna: alguna ronda no acaba, o la media prudente (solo toques) pasa de este número de
   * vueltas (15 vueltas con 4 jugadores = 60 turnos de toques). */
  eternaVueltas: 15,
  /** Se pierde al primer turno: más de esta proporción de rondas con prudente o aleatorio. */
  primerTurno: 0.10,
  /** …o el arriesgado dura de media menos de esto (vueltas). */
  arriesgadoVueltas: 0.75,
  /** Da igual cómo se juegue: prudente / arriesgado dura menos de este factor. */
  indiferente: 1.25,
  /** Un asiento acumula más derrotas de las que cabe por azar: más de 1/n + z·σ (aleatorio). Con
   * pocas rondas (piezas) el margen es ancho; con 300, ~7 puntos. */
  asientoZ: 3,
};

export interface Diagnostico {
  vaso: VesselId;
  contenido: ContentId;
  por: Record<Estrategia, Resultado>;
  /** Etiquetas de lo roto; vacío = sana. */
  fallos: string[];
  /** Avisos que no son fallo: fuera del objetivo de 3 a 6 vueltas. */
  avisos: string[];
}

export function diagnosticar(rs: Resultado[]): Diagnostico {
  const por = Object.fromEntries(rs.map(r => [r.estrategia, r])) as Record<Estrategia, Resultado>;
  const { prudente: p, arriesgado: a, aleatorio: z } = por;
  const fallos: string[] = [];
  const avisos: string[] = [];
  if (rs.some(r => r.eternas > 0) || p.vueltasMedia > UMBRALES.eternaVueltas) fallos.push('ETERNA');
  if (p.primerTurno > UMBRALES.primerTurno || z.primerTurno > UMBRALES.primerTurno
    || a.vueltasMedia < UMBRALES.arriesgadoVueltas) fallos.push('AL PRIMER TURNO');
  if (!fallos.includes('ETERNA') && p.turnosMedia / a.turnosMedia < UMBRALES.indiferente) fallos.push('DA IGUAL');
  const azar = 1 / z.jugadores;
  if (Math.max(...z.asientos) > azar + UMBRALES.asientoZ * Math.sqrt(azar * (1 - azar) / z.rondas)) fallos.push('ASIENTO');
  // Sin rondas acabadas (todas eternas) la media no existe: ya va como ETERNA.
  if (Number.isFinite(z.vueltasMedia)) {
    if (z.vueltasMedia < OBJETIVO.min) avisos.push('corta');
    else if (z.vueltasMedia > OBJETIVO.max) avisos.push('larga');
  }
  return { vaso: p.vaso, contenido: p.contenido, por, fallos, avisos };
}

// ---------------------------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------------------------

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const pc = (x: number) => `${(x * 100).toFixed(0)} %`;

export function informe(rs: Resultado[]): string {
  const claves = [...new Set(rs.map(r => `${r.vaso}:${r.contenido}`))];
  const diag = claves.map(k => {
    const [v, c] = k.split(':');
    return diagnosticar(ESTRATEGIAS.map(e => rs.find(r => r.vaso === v && r.contenido === c && r.estrategia === e)!));
  });
  const orden = (d: Diagnostico) => VESSEL_IDS.indexOf(d.vaso) * 10 + CONTENT_IDS.indexOf(d.contenido);
  diag.sort((x, y) => orden(x) - orden(y));
  const j = rs[0].jugadores;
  const L: string[] = [];
  L.push(`# Simulador de bots — ${diag.length} combinaciones, ${j} jugadores`, '');
  L.push(`Rondas por combinación y estrategia: ${[...new Set(rs.map(r => r.rondas))].join(' / ')}. ` +
    `Vueltas = turnos de la ronda ÷ ${j} jugadores. Objetivo orientativo: ${OBJETIVO.min}–${OBJETIVO.max} vueltas.`, '');
  const rotas = diag.filter(d => d.fallos.length);
  L.push(`**${rotas.length} de ${diag.length} con algún fallo.**`, '');
  L.push('| Vaso | Contenido | Prudente (vueltas) | Arriesgado | Aleatorio | Mediana / P90 (aleat.) | Pierde el 1.º (aleat.) | Eternas | Asiento máx. | Diagnóstico |');
  L.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const d of diag) {
    const { prudente: p, arriesgado: a, aleatorio: z } = d.por;
    const etern = Math.max(p.eternas, a.eternas, z.eternas);
    const etiquetas = [...d.fallos.map(x => `❌ ${x}`), ...d.avisos.map(x => `⚠️ ${x}`)];
    L.push(`| ${d.vaso} | ${d.contenido} | ${f1(p.vueltasMedia)} | ${f1(a.vueltasMedia)} | ${f1(z.vueltasMedia)} | `
      + `${f1(z.turnosMediana)} / ${f1(z.turnosP90)} turnos | ${pc(z.primerTurno)} | ${pc(etern)} | ${pc(Math.max(...z.asientos))} | ${etiquetas.join(' ') || '✅'} |`);
  }
  L.push('', '## Cómo se lee', '');
  L.push('- **ETERNA**: alguna ronda no acaba en el tope de turnos, o el prudente tarda de media más de '
    + `${UMBRALES.eternaVueltas} vueltas.`);
  L.push(`- **AL PRIMER TURNO**: prudente o aleatorio pierden el primer turno en más del ${pc(UMBRALES.primerTurno)} de las rondas, `
    + `o el arriesgado dura menos de ${UMBRALES.arriesgadoVueltas} vueltas.`);
  L.push(`- **DA IGUAL**: la ronda prudente dura menos de ×${UMBRALES.indiferente} la arriesgada: pulsar más o menos casi no cambia nada.`);
  L.push(`- **ASIENTO**: un asiento acumula más derrotas de las que explica el azar (más de ${UMBRALES.asientoZ} desviaciones, jugando al azar): ventaja o desventaja de posición.`);
  L.push('- **corta / larga** (⚠️): fuera de 3–6 vueltas con el bot aleatorio; no es un fallo, es una pista para equilibrar.');
  L.push('', '## Reparto de derrotas por asiento (aleatorio)', '');
  L.push(`| Vaso | Contenido | ${Array.from({ length: j }, (_, i) => `Asiento ${i + 1}`).join(' | ')} |`);
  L.push(`|---|---|${Array.from({ length: j }, () => '---:').join('|')}|`);
  for (const d of diag) L.push(`| ${d.vaso} | ${d.contenido} | ${d.por.aleatorio.asientos.map(pc).join(' | ')} |`);
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------
// Línea de órdenes
// ---------------------------------------------------------------------------------------------

function arg(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
}

/** `--ajuste a.b=valor`: cambia un número de `config` solo para esta ejecución. */
function aplicarAjustes(args: string[]) {
  args.forEach((a, i) => {
    if (a !== '--ajuste') return;
    const [ruta, valor] = (args[i + 1] ?? '').split('=');
    const n = Number(valor);
    if (!ruta || valor === undefined || !Number.isFinite(n)) throw new Error(`--ajuste espera ruta=número, no «${args[i + 1]}»`);
    const claves = ruta.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let o: any = config;
    for (const k of claves.slice(0, -1)) o = o?.[k];
    const ultima = claves[claves.length - 1];
    if (typeof o?.[ultima] !== 'number') throw new Error(`config.${ruta} no existe o no es un número`);
    o[ultima] = n;
  });
}

function main(args: string[]) {
  aplicarAjustes(args);
  const iInf = args.indexOf('--informe');
  if (iInf >= 0) {
    // JSON no guarda NaN (lo escribe como null): se vuelve a NaN al leerlo.
    const nan = (_: string, v: unknown) => (v === null ? NaN : v);
    const todos = args.slice(iInf + 1).flatMap(f => JSON.parse(readFileSync(f, 'utf8'), nan) as Resultado[]);
    process.stdout.write(informe(todos));
    return;
  }
  const jugadores = Number(arg(args, 'jugadores') ?? 4);
  const rondas = Number(arg(args, 'rondas') ?? 300);
  const rondasPiezas = Number(arg(args, 'rondas-piezas') ?? 40);
  const semilla = Number(arg(args, 'semilla') ?? 1);
  const vasos = arg(args, 'vaso') ? [arg(args, 'vaso') as VesselId] : VESSEL_IDS;
  const contenidos = arg(args, 'contenido') ? [arg(args, 'contenido') as ContentId] : CONTENT_IDS;
  for (const v of vasos) if (!VESSEL_IDS.includes(v)) throw new Error(`vaso desconocido: ${v}`);
  for (const c of contenidos) if (!CONTENT_IDS.includes(c)) throw new Error(`contenido desconocido: ${c}`);

  const out: Resultado[] = [];
  for (const v of vasos) {
    for (const c of contenidos) {
      const t0 = Date.now();
      for (const e of ESTRATEGIAS) out.push(simular(v, c, e, jugadores, isSolid(c) ? rondasPiezas : rondas, semilla));
      process.stderr.write(`${v}:${c} ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
    }
  }
  const json = arg(args, 'json');
  if (json) writeFileSync(json, JSON.stringify(out));
  else process.stdout.write(informe(out));
}

// Solo corre como programa, no al importarlo (los tests importan las funciones).
if (process.argv[1] && /simulate\.[mc]?[jt]s$/.test(process.argv[1])) main(process.argv.slice(2));
