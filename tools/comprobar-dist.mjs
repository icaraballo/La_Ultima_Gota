// Vigila que la build publicable lleve todo lo de la revisión de publicación (20-10-2026):
// licencias, letra propia, CSP, vista previa del enlace y la versión buena. Se ejecuta tras
// `npm run build` (también en la Action) y falla con un mensaje claro si algo se ha perdido.
// JavaScript plano y sin dependencias a propósito.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const dist = join(raiz, 'dist');
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
const fallos = [];
const falla = msg => fallos.push(msg);

if (!existsSync(join(dist, 'index.html'))) {
  console.error('✗ No hay dist/index.html: ejecuta antes «npm run build».');
  process.exit(1);
}

const ficheros = (dir) => readdirSync(dir).flatMap(f => {
  const ruta = join(dir, f);
  return statSync(ruta).isDirectory() ? ficheros(ruta) : [ruta];
});
const todos = ficheros(dist);
const texto = ruta => readFileSync(ruta, 'utf8');
const esTexto = ruta => /\.(html|js|css|txt|svg|json)$/.test(ruta);

// 1. Licencias de todo lo que se empaqueta.
const licencias = join(dist, 'licencias.txt');
if (!existsSync(licencias)) falla('falta dist/licencias.txt');
else {
  const lic = texto(licencias);
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!lic.includes(`## ${dep} - `)) falla(`licencias.txt no incluye ${dep}`);
  }
}

// 2. Nada de Google Fonts (la letra va con el juego).
for (const ruta of todos.filter(esTexto)) {
  if (/fonts\.(googleapis|gstatic)\.com/.test(texto(ruta))) falla(`${ruta.slice(dist.length + 1)} pide la letra a Google Fonts`);
}

// 3. index.html: CSP, og:image con URL absoluta y <noscript>.
const html = texto(join(dist, 'index.html'));
if (!/<meta http-equiv="Content-Security-Policy"/.test(html)) falla('index.html no lleva la CSP');
if (!/<meta property="og:image" content="https:\/\/[^"]+"/.test(html)) falla('index.html no lleva og:image con una URL https:// absoluta');
if (!/<noscript>/.test(html)) falla('index.html no lleva <noscript>');

// 4. Imágenes de la vista previa y los iconos.
for (const f of ['og.png', 'favicon.svg', 'apple-touch-icon.png']) {
  if (!existsSync(join(dist, f))) falla(`falta dist/${f}`);
}
const og = join(dist, 'og.png');
if (existsSync(og) && statSync(og).size >= 1024 * 1024) falla('og.png pesa 1 MB o más');

// 5. La versión que se ve en la esquina es la de package.json.
const js = todos.filter(r => r.endsWith('.js')).map(texto).join('\n');
const versionEn = new RegExp('[`"\']' + pkg.version.replaceAll('.', '\\.') + '[`"\']');
if (!versionEn.test(js)) falla(`el JavaScript no lleva la versión ${pkg.version} de package.json`);

if (fallos.length) {
  console.error(`✗ dist/ no está lista para publicar:\n${fallos.map(f => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ dist/ lista para publicar (v${pkg.version}): licencias, letra propia, CSP, vista previa y versión.`);
