import { crearEscena } from './render/scene';
import { t } from './i18n';

crearEscena(document.getElementById('escena') as HTMLCanvasElement);

const ui = document.getElementById('ui')!;
ui.innerHTML = `
  <h1 class="titulo">${t.titulo}</h1>
  <div class="version">${t.version(__VERSION__)}</div>
`;
