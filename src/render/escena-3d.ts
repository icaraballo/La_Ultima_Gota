import * as THREE from 'three';
import type { Game } from '../core/game';
import type { LiquidId } from '../core/liquids';
import type { Vessel } from '../core/vessels';

// La escena 3D (fase 3): grifo, vaso, líquido, chorro, gotas, menisco, espuma y derrame.
// El vaso y el líquido se tornean (LatheGeometry) con el mismo perfil r(h) que usa la lógica,
// así que lo que se ve sube exactamente como calcula core/. Nada de simulación de fluidos.

const H = 2;              // alto del vaso
const R = 0.62;           // radio donde el perfil vale 1
const SPOUT_Y = H + 1.3;  // boca del grifo
/** El menisco real es de pocos milímetros: se exagera para que se vea abombarse. */
const MENISCO_VISIBLE = 3;
const SEGMENTS = 48;
const MAX_DROPS = 60;
const MAX_STREAM = 160;

const COLOR: Record<LiquidId, string> = { agua: '#5fb4e8', aceite: '#e2b43a', cerveza: '#e8962c' };
const ESPUMA = '#fbf3e0';

/** Puntos del perfil (radio, altura) entre dos alturas relativas. */
function profile(vessel: Vessel, h0: number, h1: number, scale = 1, steps = 40): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const h = h0 + (h1 - h0) * (i / steps);
    pts.push(new THREE.Vector2(R * vessel.radius(h) * scale, H * h));
  }
  return pts;
}

export class Escena3D {
  showLimit = false;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  private glass = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({
    color: '#dfefff', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  private rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, SEGMENTS), new THREE.MeshStandardMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.6 }));
  private liquidMat = new THREE.MeshStandardMaterial({ color: COLOR.agua, roughness: 0.25, transparent: true, opacity: 0.92 });
  private foamMat = new THREE.MeshStandardMaterial({ color: ESPUMA, roughness: 0.9 });
  private liquidBody = new THREE.Mesh(undefined, this.liquidMat);
  private foamBody = new THREE.Mesh(undefined, this.foamMat);
  private surface: THREE.Mesh;
  private surfaceRho: Float32Array;
  private drops: THREE.InstancedMesh;
  private stream: THREE.InstancedMesh;
  private spillMat = new THREE.MeshStandardMaterial({ color: COLOR.agua, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
  private spill = new THREE.Mesh(undefined, this.spillMat);
  private puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.liquidMat);
  private limitRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.01, 6, SEGMENTS), new THREE.MeshBasicMaterial({ color: '#e8735f' }));

  private vessel: Vessel | null = null;
  private lastGlass: unknown = null;
  private lastLiquid = -1;
  private lastFoamTop = -1;
  private overflowSince: number | null = null;
  private tmp = new THREE.Object3D();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const { scene } = this;
    scene.background = new THREE.Color('#1d2a38');

    scene.add(new THREE.HemisphereLight('#fff6e8', '#2a3a4c', 1.3));
    const sol = new THREE.DirectionalLight('#ffffff', 1.6);
    sol.position.set(2.5, 6, 4);
    scene.add(sol);

    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.12, 64), new THREE.MeshStandardMaterial({ color: '#8a5a3b', roughness: 0.8 }));
    mesa.position.y = -0.06;
    scene.add(mesa);

    // Grifo: tubo que entra por la izquierda y boca hacia abajo.
    const metal = new THREE.MeshStandardMaterial({ color: '#c3ccd6', metalness: 0.7, roughness: 0.3 });
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 20), metal);
    tubo.rotation.z = Math.PI / 2;
    tubo.position.set(-1.45, SPOUT_Y + 0.32, 0);
    const codo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), metal);
    codo.position.set(0.05, SPOUT_Y + 0.32, 0);
    const boca = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.34, 20), metal);
    boca.position.set(0.05, SPOUT_Y + 0.15, 0);
    scene.add(tubo, codo, boca);

    // Superficie: disco de radio 1 con anillos, que se deforma en cada frame (ondas y cúpula).
    const rings: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) rings.push(new THREE.Vector2(i / 14, 0));
    const surf = new THREE.LatheGeometry(rings.reverse(), SEGMENTS);
    const pos = surf.attributes.position;
    this.surfaceRho = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.surfaceRho[i] = Math.hypot(pos.getX(i), pos.getZ(i));
    this.surface = new THREE.Mesh(surf, this.liquidMat);

    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.liquidMat, MAX_DROPS);
    this.stream = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), this.liquidMat, MAX_STREAM);
    for (const m of [this.drops, this.stream]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Su volumen de recorte se calcula una vez y, si fue con 0 instancias, no se pintarían nunca.
      m.frustumCulled = false;
    }

    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.position.y = 0.005;
    this.rim.rotation.x = Math.PI / 2;
    this.limitRing.rotation.x = Math.PI / 2;
    this.glass.renderOrder = 2;
    scene.add(this.liquidBody, this.foamBody, this.surface, this.drops, this.stream, this.spill, this.puddle, this.glass, this.rim, this.limitRing);
  }

  private fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    // Que quepan de alto la mesa y el grifo, y de ancho el vaso con margen.
    const halfV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max(2.05 / halfV, 1.25 / (halfV * cam.aspect));
    const tilt = THREE.MathUtils.degToRad(13);
    cam.position.set(0, 1.7 + d * Math.sin(tilt), d * Math.cos(tilt));
    cam.lookAt(0, 1.7, 0);
    cam.updateProjectionMatrix();
  }

  private setVessel(v: Vessel) {
    this.vessel = v;
    this.glass.geometry.dispose();
    const pts = [new THREE.Vector2(0, -0.02), ...profile(v, 0, 1, 1.03)];
    pts[1].y = -0.02;
    this.glass.geometry = new THREE.LatheGeometry(pts, SEGMENTS);
    this.rim.scale.setScalar(R * v.radius(1) * 1.03);
    this.rim.position.y = H;
    this.lastLiquid = this.lastFoamTop = -1;
  }

  /** Cuerpo torneado del líquido (o de la espuma) entre dos alturas. */
  private lathe(mesh: THREE.Mesh, h0: number, h1: number, closeBottom: boolean) {
    mesh.geometry.dispose();
    if (h1 - h0 < 0.002) {
      mesh.visible = false;
      return;
    }
    const pts = profile(this.vessel!, h0, h1, 0.985, Math.max(2, Math.ceil((h1 - h0) * 40)));
    if (closeBottom) pts.unshift(new THREE.Vector2(0, H * h0));
    mesh.geometry = new THREE.LatheGeometry(pts, SEGMENTS);
    mesh.visible = true;
  }

  draw(game: Game, now: number) {
    this.fit();
    const { glass, faucet } = game;
    if (glass.vessel !== this.vessel) this.setVessel(glass.vessel);
    if (glass !== this.lastGlass) {
      this.lastGlass = glass;
      this.overflowSince = null;
      this.lastLiquid = this.lastFoamTop = -1;
    }
    this.liquidMat.color.set(COLOR[game.liquidId]);
    this.spillMat.color.set(COLOR[game.liquidId]);
    const v = this.vessel!;

    // Alturas: líquido, espuma encima y, si pasa del borde, la cúpula del menisco.
    const top = glass.height;
    const liquidTop = Math.min(glass.liquidHeight, 1);
    const capped = Math.min(top, 1);
    const dome = Math.max(0, top - 1) * H * MENISCO_VISIBLE;

    if (Math.abs(liquidTop - this.lastLiquid) > 0.001) {
      this.lastLiquid = liquidTop;
      this.lathe(this.liquidBody, 0, liquidTop, true);
    }
    if (Math.abs(capped - this.lastFoamTop) > 0.001) {
      this.lastFoamTop = capped;
      this.lathe(this.foamBody, liquidTop, capped, false);
    }
    if (capped - liquidTop < 0.002) this.foamBody.visible = false;

    // Superficie: ondas según lo que cae y cúpula si pasa del borde.
    const surf = this.surface;
    surf.visible = glass.total > 0.0005;
    surf.material = glass.foam > 0.002 ? this.foamMat : this.liquidMat;
    const rTop = R * v.radius(capped) * 0.985;
    surf.scale.set(rTop, 1, rTop);
    surf.position.y = H * capped;
    const amp = (0.004 + Math.min(0.03, faucet.flow * 0.25)) * (dome > 0 ? 0.3 : 1);
    const pos = surf.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const rho = this.surfaceRho[i];
      const wave = Math.sin(rho * 14 - now * 7) * amp * (1 - rho * 0.6);
      pos.setY(i, dome * (1 - rho * rho) + wave);
    }
    pos.needsUpdate = true;
    surf.geometry.computeVertexNormals();
    const surfaceY = H * capped + dome;

    // Lo que está en el aire.
    const fall = (p: { emitted: number; arrival: number }) => {
      const t = Math.min(1, Math.max(0, (faucet.time - p.emitted) / (p.arrival - p.emitted)));
      return SPOUT_Y + (surfaceY - SPOUT_Y) * t * t;
    };
    const m = this.tmp;
    let nd = 0, ns = 0;
    const stream = faucet.inAir.filter(p => p.kind === 'stream');
    for (let i = 0; i < stream.length && ns < MAX_STREAM; i++) {
      const y0 = fall(stream[i]);
      const y1 = i + 1 < stream.length ? fall(stream[i + 1]) : SPOUT_Y;
      const flow = stream[i].volume * 60;
      const r = Math.min(0.075, Math.max(0.012, 0.17 * Math.sqrt(flow)));
      m.position.set(0.05, (y0 + y1) / 2, 0);
      m.scale.set(r, Math.abs(y1 - y0) + 0.02, r);
      m.updateMatrix();
      this.stream.setMatrixAt(ns++, m.matrix);
    }
    for (const p of faucet.inAir) {
      if (p.kind !== 'drop' || nd >= MAX_DROPS) continue;
      const r = 0.045 * Math.cbrt(p.volume / 0.025) + 0.02;
      m.position.set(0.05, fall(p), 0);
      m.scale.set(r * 0.85, r * 1.2, r * 0.85);
      m.updateMatrix();
      this.drops.setMatrixAt(nd++, m.matrix);
    }
    this.drops.count = nd;
    this.stream.count = ns;
    this.drops.instanceMatrix.needsUpdate = this.stream.instanceMatrix.needsUpdate = true;

    // Desborde: el líquido baja por fuera del vaso y hace un charco.
    if (glass.overflowed) {
      this.overflowSince ??= now;
      const k = Math.min(1, (now - this.overflowSince) / 1.2);
      this.spill.geometry.dispose();
      this.spill.geometry = new THREE.LatheGeometry(profile(v, 1 - k, 1, 1.06, 30), SEGMENTS);
      this.spill.visible = true;
      this.puddle.visible = true;
      const pr = R * v.radius(0) * 1.1 + 0.6 * k;
      this.puddle.scale.set(pr, pr * 0.9, 1);
    } else {
      this.spill.visible = this.puddle.visible = false;
    }

    // Depuración: el límite oculto de la ronda.
    this.limitRing.visible = this.showLimit;
    if (this.showLimit) {
      this.limitRing.position.y = H + (v.volumeToHeight(glass.limit) - 1) * H * MENISCO_VISIBLE;
      this.limitRing.scale.setScalar(R * v.radius(1) * 1.15);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
