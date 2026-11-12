// Dibuja los originales del icono y la pantalla de arranque (la gota del título, la de
// public/favicon.svg) y los guarda en ../assets/, de donde `npx @capacitor/assets generate --android`
// saca todos los tamaños. Uso: node iconos/dibujar.mjs  (necesita Chrome; ruta en CHROME o la de
// Windows por defecto)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(aqui, '..', 'assets');
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONDO = '#2B1B17'; // el fondo del tema noche (src/render/temas.ts)
mkdirSync(salida, { recursive: true });

// La gota de public/favicon.svg, con sus mismos colores (acento #F2A93B, tinta #140B08).
const gota = `<path d="M22 3 C30 16 40 26 40 36 C40 46 32 52 22 52 C12 52 4 46 4 36 C4 26 14 16 22 3 Z" fill="#F2A93B" stroke="#140B08" stroke-width="3"/>
<path d="M13 34 C13 40 17 44 22 45" fill="none" stroke="#2B1B17" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>`;

// lado: tamaño de la imagen; escala: qué parte ocupa la gota (alto); fondo: color o null (transparente).
function dibujar(nombre, lado, escala, fondo) {
  const h = lado * escala, w = h * 54 / 54, x = (lado - w) / 2, y = (lado - h) / 2;
  const html = `<!doctype html><style>html,body{margin:0;background:${fondo || 'transparent'};overflow:hidden}</style>
<svg width="${lado}" height="${lado}"><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="-5 0 54 54">${gota}</svg></svg>`;
  const f = join(tmpdir(), `ug-${nombre}.html`);
  writeFileSync(f, html);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${lado},${lado}`, `--screenshot=${join(salida, nombre)}`, `file:///${f.replaceAll('\\', '/')}`], { stdio: 'ignore' });
  rmSync(f);
  console.log(`assets/${nombre}`);
}

dibujar('icon-only.png', 1024, 0.7, FONDO);          // icono clásico (móviles antiguos) y el de Play
dibujar('icon-foreground.png', 1024, 0.56, null);    // capa delantera del icono adaptable: cabe en la zona segura
dibujar('icon-background.png', 1024, 0, FONDO);      // capa trasera: sólo el fondo
dibujar('splash.png', 2732, 0.16, FONDO);            // pantalla de arranque
dibujar('splash-dark.png', 2732, 0.16, FONDO);
