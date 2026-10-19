# La Última Gota

**Entre todos llenáis un vaso. Quien lo desborda, pierde.**

### ▶ [Jugar](https://icaraballo.github.io/La_Ultima_Gota/)

Juego móvil por turnos para jugar en grupo con un solo móvil, que va pasando de mano en mano.
Cada uno echa una vez por turno —una gota con un toque, un chorro manteniendo pulsado— y al
soltar le toca al siguiente. Nunca se controla del todo cuánto cae, no hay números en pantalla y el vaso
aguanta un poco por encima del borde… pero nadie sabe cuánto.

> **En desarrollo.** Fase 2 de 7: se juega de principio a fin con un vaso provisional en 2D
> (agua y vaso cilíndrico) y ahora se afina el tacto de echar con el modo depuración
> ([`?debug`](https://icaraballo.github.io/La_Ultima_Gota/?debug)). El 3D llega después.

## Desarrollo

```bash
npm install      # .npmrc lleva legacy-peer-deps por un fallo de npm con los peers de Vitest
npm run dev      # servidor en la red local: ábrelo desde el móvil con la IP del Mac
npm test         # Vitest
npm run build    # comprueba tipos y compila a dist/
```

Cada push a `main` se publica solo en GitHub Pages (`.github/workflows/pages.yml`).

## Cómo está hecho

```
src/
├─ core/      lógica pura: física del líquido, vasos, turnos. Sin DOM ni Three.js
├─ render/    la escena 3D (Three.js)
├─ ui/        pantallas y botones, en HTML/CSS por encima del canvas
├─ audio/     Web Audio
├─ haptics/   vibración
├─ i18n/      todos los textos (castellano; inglés más adelante)
└─ main.ts
tools/        simulador de partidas con bots (Node)
tests/        Vitest
```

La regla más importante: **`core/` no sabe nada de Three.js ni del DOM** (lo vigila
`tests/arquitectura.test.ts`). Todo número de jugabilidad va en `core/config.ts` y todo
azar sale de un generador con semilla, para poder repetir partidas.

## Licencia

Código bajo [MIT](LICENSE).
