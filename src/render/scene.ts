import * as THREE from 'three';

// Fase 0: escena vacía con la mesa y la luz, para comprobar que Three.js va en el móvil.
// El grifo, el vaso y el líquido llegan en la fase 3.
export function crearEscena(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const escena = new THREE.Scene();
  escena.background = new THREE.Color('#1d2a38');

  // Cámara fija, ligeramente picada, mirando a donde irá el borde del vaso.
  const camara = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camara.position.set(0, 2.2, 6);
  camara.lookAt(0, 1, 0);

  escena.add(new THREE.HemisphereLight('#fff6e8', '#2a3a4c', 1.2));
  const sol = new THREE.DirectionalLight('#ffffff', 1.4);
  sol.position.set(3, 6, 4);
  escena.add(sol);

  const mesa = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({ color: '#8a5a3b', roughness: .8 }),
  );
  mesa.rotation.x = -Math.PI / 2;
  escena.add(mesa);

  function ajustar() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }
  window.addEventListener('resize', ajustar);
  ajustar();

  renderer.setAnimationLoop(() => renderer.render(escena, camara));
}
