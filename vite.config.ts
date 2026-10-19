import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Rutas relativas: vale igual para GitHub Pages (/La_Ultima_Gota/) y para la APK de Capacitor.
  base: './',
  build: { chunkSizeWarningLimit: 800 }, // Three.js solo ya pesa ~500 kB
  define: { __VERSION__: JSON.stringify(version) },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
