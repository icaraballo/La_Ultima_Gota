import { defineConfig, type Plugin } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const { version } = pkg;
const LICENCIAS = 'licencias.txt';

/** La opción `build.license` de Vite solo ve lo que entra como módulo JS; la letra entra por un
 * `@import` de CSS y se quedaría fuera. Este plugin añade al final del fichero la licencia de cada
 * paquete de `dependencies` que falte, con el mismo formato que Vite. */
function licenciasQueFaltan(): Plugin {
  return {
    name: 'licencias-que-faltan',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const fichero = bundle[LICENCIAS];
        if (!fichero || fichero.type !== 'asset') return this.error(`no se ha generado ${LICENCIAS}`);
        let texto = String(fichero.source);
        for (const nombre of Object.keys(pkg.dependencies)) {
          if (texto.includes(`## ${nombre} - `)) continue;
          const dir = new URL(`./node_modules/${nombre}/`, import.meta.url);
          const dep = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
          const licencia = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map(f => new URL(f, dir)).find(existsSync);
          if (!licencia) return this.error(`${nombre} no trae fichero de licencia`);
          texto = `${texto.trimEnd()}\n\n## ${nombre} - ${dep.version} (${dep.license})\n\n${readFileSync(licencia, 'utf8').trim()}\n`;
        }
        fichero.source = texto;
      },
    },
  };
}

export default defineConfig({
  // Rutas relativas: vale igual para GitHub Pages (/La_Ultima_Gota/) y para la APK de Capacitor.
  base: './',
  build: {
    chunkSizeWarningLimit: 800, // Three.js solo ya pesa ~500 kB
    // Las licencias de lo que se empaqueta (MIT exige incluirlas en cada copia). En .txt para que
    // Pages lo sirva como texto y se lea en el navegador.
    license: { fileName: LICENCIAS },
  },
  plugins: [licenciasQueFaltan()],
  define: { __VERSION__: JSON.stringify(version) },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
