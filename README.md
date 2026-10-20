# La Última Gota

**Entre todos llenáis un vaso. Quien lo desborda, pierde.**

### ▶ [Jugar](https://icaraballo.github.io/La_Ultima_Gota/)

Juego móvil por turnos para jugar en grupo con un solo móvil, que va pasando de mano en mano.
Cada uno echa una vez por turno —una gota con un toque, un chorro manteniendo pulsado— y al
soltar le toca al siguiente. Nunca se controla del todo cuánto cae, no hay números en pantalla y el vaso
aguanta un poco por encima del borde… pero nadie sabe cuánto.

> **En desarrollo.** Ya en 3D, en cartoon suave con modo noche (bar) y modo día (cocina), con
> 3 vasos (recto, copa y botella), 3 líquidos (agua, aceite y cerveza con espuma) y el modo de
> **canicas y monedas** con física real (Matter.js): pierde quien hace caer una fuera del vaso.
> El tacto se afina con el modo depuración
> ([`?debug`](https://icaraballo.github.io/La_Ultima_Gota/?debug)); `?2d` vuelve al vaso plano.

## Desarrollo

```bash
npm install      # .npmrc lleva legacy-peer-deps por un fallo de npm con los peers de Vitest
npm run dev      # servidor en la red local: ábrelo desde el móvil con la IP del Mac
npm test         # Vitest
npm run build    # comprueba tipos y compila a dist/
npm run comprobar  # dist/ lleva licencias, CSP, vista previa del enlace y la versión buena
```

Cada push a `main` se publica solo en GitHub Pages (`.github/workflows/pages.yml`).

## Cómo está hecho

```
src/
├─ core/      lógica pura: física del líquido, vasos, turnos. Sin DOM ni Three.js
├─ render/    la escena 3D (Three.js), los temas noche/día y el vaso 2D provisional (?2d)
├─ ui/        pantallas y botones, en HTML/CSS por encima del canvas
├─ audio/     sonido (fase 6, aún vacío)
├─ haptics/   vibración (fase 6, aún vacío)
├─ i18n/      todos los textos (castellano; inglés más adelante)
└─ main.ts
tools/        simulador con bots (fase 5, aún vacío) y la comprobación de la build
tests/        Vitest
```

La regla más importante: **`core/` no sabe nada de Three.js ni del DOM** (lo vigila
`tests/arquitectura.test.ts`). Todo número de jugabilidad va en `core/config.ts` y todo
azar sale de un generador con semilla, para poder repetir partidas.

## Privacidad

No hay cuentas, cookies ni analítica, y el juego no hace peticiones a terceros. Guarda en
tu navegador los nombres de la última partida y el tema elegido; nada sale de tu móvil.

## Seguridad

Ver [SECURITY.md](SECURITY.md).

## Licencia

Código bajo [MIT](LICENSE). Incluye [Three.js](https://threejs.org) y
[Matter.js](https://brm.io/matter-js/) (MIT) y la letra Fredoka (SIL Open Font License
1.1). Las licencias completas se publican con el juego en
[licencias.txt](https://icaraballo.github.io/La_Ultima_Gota/licencias.txt).
