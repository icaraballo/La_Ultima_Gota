// Copia el juego a www/, que es lo que Capacitor mete en la app. La web (la carpeta de arriba) es el
// original: aquí no se edita nada. Primero la construye (`npm run build` de arriba) y luego copia
// dist/ sin lo que solo sirve a la web publicada: la imagen de la vista previa y la página de
// privacidad (dentro del juego ya está la hoja «Privacidad»).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const web = join(aqui, '..');
const destino = join(aqui, 'www');
const SOLO_WEB = ['og.png', 'privacidad.html', 'apple-touch-icon.png'];

execSync('npm run build', { cwd: web, stdio: 'inherit' });
if (!existsSync(join(web, 'dist', 'index.html'))) { console.error('No hay dist/index.html.'); process.exit(1); }

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino);
cpSync(join(web, 'dist'), destino, { recursive: true, filter: s => !SOLO_WEB.includes(s.split(/[\/]/).pop()) });

const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'));
console.log(`Copiado La Última Gota v${pkg.version} a www/`);
