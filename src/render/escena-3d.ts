import * as THREE from 'three';
import { config } from '../core/config';
import type { Game } from '../core/game';
import { isSolid } from '../core/contents';
import type { LiquidId } from '../core/liquids';
import type { Parcel } from '../core/pour';
import { SOLID_PX_PER_H, type Pile } from '../core/solids';
import type { Vessel } from '../core/vessels';
import { LIQUIDOS, SOLIDOS, TEMAS, type ColoresEscena, type TemaId } from './temas';

// La escena 3D en cartoon suave (v0.5.0): colores planos en dos tonos y contorno de tinta.
// El vaso y el líquido se tornean (LatheGeometry) con el mismo perfil r(h) que usa la lógica,
// así que lo que se ve sube exactamente como calcula core/. Nada de simulación de fluidos.
// Lo que más importa es que el borde se lea: aro blanco sobre tinta y contorno del cristal.

const H = 2;              // alto del vaso recto (el grifo y la cámara se miden con él)
/** Alto del vaso de esta ronda: H × vessel.height (el chupito es más bajo). Lo fija setVessel. */
let GH = H;
const R = 0.62;           // radio donde el perfil vale 1
const GLASS = 1.03;       // el cristal, un poco por fuera del líquido
const SPOUT_Y = H + 0.45; // boca del grifo
const PIPE_Y = H + 0.95;  // tubo del grifo
/** El menisco real es de pocos milímetros: se exagera para que se vea abombarse. */
const MENISCO_VISIBLE = 3;
const SEGMENTS = 64;
const MAX_DROPS = 60;
const MAX_STREAM = 160;
const MAX_SPLASH = 4;
const N_BUBBLES = 12;
/** Un píxel de un móvil de 390 de ancho, en unidades de la escena (el vaso ocupa ~44 %). */
const PX = 0.0075;
const WALL_Z = -2.4;
const TABLE_FRONT = 1.6;
const TILT = THREE.MathUtils.degToRad(9);
/** Píxeles del motor de las piezas → unidades de la escena (el vaso mide 250 px y H de alto). */
const SOLID_K = H / SOLID_PX_PER_H;
const MAX_PIECES = 400;

/** Luz en espacio de cámara: de arriba a la izquierda, así la sombra cae a la derecha. */
const LUZ = new THREE.Vector3(-0.6, 0.3, 0.75).normalize();

const VS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vCol;
  void main() {
    vec3 n = normal;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      n = mat3(instanceMatrix) * n;
      p = instanceMatrix * p;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    vN = normalize(normalMatrix * n);
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;
const FS_TOON = /* glsl */ `
  uniform vec3 uClaro;
  uniform vec3 uOscuro;
  uniform vec3 uLuz;
  uniform float uUmbral;
  varying vec3 vN;
  varying vec3 vCol;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4((dot(n, uLuz) > uUmbral ? uClaro : uOscuro) * vCol, 1.0);
    #include <colorspace_fragment>
  }`;
/** Casco invertido: la misma malla, hinchada por la normal y vista por detrás = contorno. */
const VS_HULL = /* glsl */ `
  uniform float uGrosor;
  void main() {
    vec3 n = normal;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      n = mat3(instanceMatrix) * n;
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p.xyz + normalize(n) * uGrosor, 1.0);
  }`;
const FS_PLANO = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
    #include <colorspace_fragment>
  }`;

/** Dos tonos: claro hacia la luz, oscuro en el lado derecho. */
function toon(claro: string, oscuro: string, umbral = 0.43) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uClaro: { value: new THREE.Color(claro) },
      uOscuro: { value: new THREE.Color(oscuro) },
      uLuz: { value: LUZ },
      uUmbral: { value: umbral },
    },
    vertexShader: VS,
    fragmentShader: FS_TOON,
  });
}
function setToon(m: THREE.ShaderMaterial, claro: string, oscuro: string) {
  m.uniforms.uClaro.value.set(claro);
  m.uniforms.uOscuro.value.set(oscuro);
}
function hullMat(grosorPx: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uGrosor: { value: grosorPx * PX }, uColor: { value: new THREE.Color('#000') } },
    vertexShader: VS_HULL,
    fragmentShader: FS_PLANO,
    side: THREE.BackSide,
  });
}
const basic = (color: string, extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, ...extra });

/** Puntos del perfil (radio, altura) entre dos alturas relativas. */
function profile(vessel: Vessel, h0: number, h1: number, scale = 1, steps = 40): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const h = h0 + (h1 - h0) * (i / steps);
    pts.push(new THREE.Vector2(R * vessel.radius(h) * scale, GH * h));
  }
  return pts;
}

/** Ángulo de LatheGeometry para un lado: x = r·sin(φ), z = r·cos(φ) (φ = 0 mira a cámara). */
const phi = (s: number) => Math.asin(s);
/** Franja vertical del perfil entre dos «anchos» relativos (−1 izquierda, 1 derecha). */
function band(vessel: Vessel, h0: number, h1: number, s0: number, s1: number, scale: number) {
  const a0 = phi(s0), a1 = phi(s1);
  return new THREE.LatheGeometry(profile(vessel, h0, h1, scale, 30), 6, a0, a1 - a0);
}

/** Lágrima de radio 1: punta arriba (y = 1,9) y culo redondo (y = −1). */
function tearGeometry() {
  const pts: THREE.Vector2[] = [];
  const p0 = new THREE.Vector2(0, -1), c1 = new THREE.Vector2(1, -1), c2 = new THREE.Vector2(1.1, 0.4), p3 = new THREE.Vector2(0, 1.9);
  const curve = new THREE.CubicBezierCurve(p0, c1, c2, p3);
  for (let i = 0; i <= 16; i++) pts.push(curve.getPoint(i / 16));
  pts[0].x = pts[16].x = 0;
  return new THREE.LatheGeometry(pts, 16);
}

function ringGeometry(r: number, w: number) {
  return new THREE.RingGeometry(Math.max(0, r - w / 2), r + w / 2, 48);
}

/** Mancha radial para la sombra del vaso (alfa en el canal blanco). */
function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface Splash { t0: number }

export class Escena3D {
  showLimit = false;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private tema: ColoresEscena = TEMAS.noche.escena;
  private temaId: TemaId = 'noche';

  // Contornos: un material por grosor (en px de un móvil de 390).
  private ink = { faucet: hullMat(4.5), drop: hullMat(3), stream: hullMat(1.6), river: hullMat(2.8), tiny: hullMat(2) };
  private inkBasic = basic('#000');

  // Fondo
  private wallTex: THREE.CanvasTexture;
  private wallCanvas = document.createElement('canvas');
  private wall: THREE.Mesh;
  private tableTop = basic('#000');
  private tableLine = basic('#000');
  private tableLip = basic('#000');
  private tableEdge = basic('#000');
  private tableUnder = basic('#000');
  private shadowMat: THREE.MeshBasicMaterial;
  private shadow: THREE.Mesh;

  // Vaso
  // Solo la pared de atrás: tiñe lo que se ve por encima del líquido, nunca el líquido.
  private glassMat = basic('#fff', { transparent: true, opacity: 0.13, side: THREE.BackSide, depthWrite: false });
  private glass = new THREE.Mesh(undefined, this.glassMat);
  private glassHiMat = basic('#fff', { transparent: true, opacity: 0.55, depthWrite: false });
  private glassHi = [new THREE.Mesh(undefined, this.glassHiMat), new THREE.Mesh(undefined, this.glassHiMat)];
  private glassLine = new THREE.Mesh(undefined, this.inkBasic);
  private rimInkMat = basic('#000', { depthWrite: false });
  private rimInk = new THREE.Mesh(undefined, this.rimInkMat);
  private rimMat = basic('#fff');
  private rim = new THREE.Mesh(undefined, this.rimMat);

  // Líquido
  private liquidMat = toon('#000', '#000');
  private foamMat = toon('#000', '#000');
  private surfaceMat = basic('#000', { side: THREE.DoubleSide });
  private lineMat = basic('#000', { side: THREE.DoubleSide });
  private glossMat = basic('#000', { transparent: true, opacity: 0.7 });
  private foamDotMat = basic('#000', { side: THREE.DoubleSide });
  private bubbleMat = basic('#000', { transparent: true, opacity: 0.8 });
  private liquidBody = new THREE.Mesh(undefined, this.liquidMat);
  private liquidGloss = new THREE.Mesh(undefined, this.glossMat);
  private foamBody = new THREE.Mesh(undefined, this.foamMat);
  private surface: THREE.Mesh;
  private surfaceRho: Float32Array;
  private contact = new THREE.Mesh(undefined, this.lineMat);
  private domeLine = new THREE.Mesh(undefined, this.inkBasic);
  private foamDots: THREE.Mesh[] = [];
  private bubbles: THREE.InstancedMesh;

  // Lo que cae
  private drops: THREE.InstancedMesh;
  private dropsInk: THREE.InstancedMesh;
  private dropsHi: THREE.InstancedMesh;
  private stream: THREE.InstancedMesh;
  private streamInk: THREE.InstancedMesh;
  private streamHi: THREE.InstancedMesh;
  private bits: THREE.InstancedMesh;     // gotitas que saltan
  private bitsInk: THREE.InstancedMesh;
  private ripples: THREE.Mesh[] = [];
  private rippleMats: THREE.MeshBasicMaterial[] = [];
  private splashes: Splash[] = [];
  private prevDrops = new Set<Parcel>();

  // Desborde
  private rivers: THREE.Mesh[] = [];
  private riversInk: THREE.Mesh[] = [];
  private puddleMat = basic('#000');
  private puddle = new THREE.Mesh(undefined, this.puddleMat);
  private puddleInk = new THREE.Mesh(undefined, this.inkBasic);
  private puddleHi = new THREE.Mesh(undefined, this.lineMat);

  // Grifo
  private metal = toon('#000', '#000', 0.2);
  private metalHi = basic('#000');
  private knob = toon('#000', '#000', 0.2);
  private lever = new THREE.Group();
  private leverAngle = 0;
  private faucet = new THREE.Group();
  /** Con canicas o monedas, una tolva en lugar del grifo. */
  private hopper = new THREE.Group();

  // Canicas y monedas: color por pieza (instanceColor) sobre un toon blanco/gris.
  private pieceMat = toon('#ffffff', '#b4b4b4', 0.3);
  private marbles: THREE.InstancedMesh;
  private marblesInk: THREE.InstancedMesh;
  private marblesHi: THREE.InstancedMesh;
  private coins: THREE.InstancedMesh;
  private coinsInk: THREE.InstancedMesh;
  private coinRims: THREE.InstancedMesh;
  private outRing: THREE.Mesh;
  private outRingMat = basic('#e8735f');
  private color = new THREE.Color();

  private limitRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.01, 6, SEGMENTS), basic('#e8735f'));

  private vessel: Vessel | null = null;
  private liquidId: LiquidId | null = null;
  private lastGlass: unknown = null;
  private lastLiquid = -1;
  private lastFoamTop = -1;
  private lastSurfR = -1;
  private lastDome = -1;
  private overflowSince: number | null = null;
  private tmp = new THREE.Object3D();
  private wallKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const { scene } = this;

    // Pared: un plano con el dibujo pintado (se repinta al cambiar de tamaño o de tema).
    this.wallTex = new THREE.CanvasTexture(this.wallCanvas);
    this.wallTex.colorSpace = THREE.SRGBColorSpace;
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic('#fff', { map: this.wallTex }));
    this.wall.position.z = WALL_Z;

    // Mesa: tablero con dos líneas de tabla, listón en el borde, canto y lo de debajo.
    const flat = (w: number, d: number, mat: THREE.Material, z: number, y = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, y, z);
      return m;
    };
    const depth = TABLE_FRONT - WALL_Z;
    const top = flat(60, depth, this.tableTop, (TABLE_FRONT + WALL_Z) / 2);
    const lines = [-0.85, 0.47].map(z => flat(60, 0.11, this.tableLine, z, 0.001));
    const lip = flat(60, 0.13, this.tableLip, TABLE_FRONT - 0.065, 0.001);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.28), this.tableEdge);
    edge.position.set(0, -0.14, TABLE_FRONT);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), this.tableUnder);
    under.position.set(0, -10.28, TABLE_FRONT);
    this.shadowMat = basic('#000', { map: radialTexture(), transparent: true, opacity: 0.35, depthWrite: false });
    this.shadow = flat(2, 2, this.shadowMat, 0, 0.002);
    this.shadow.renderOrder = 1;
    scene.add(this.wall, top, ...lines, lip, edge, under, this.shadow);

    this.buildFaucet();

    const sphere = new THREE.SphereGeometry(1, 18, 12);
    const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    this.marbles = new THREE.InstancedMesh(sphere, this.pieceMat, MAX_PIECES);
    this.marblesInk = new THREE.InstancedMesh(sphere, this.ink.tiny, MAX_PIECES);
    this.marblesHi = new THREE.InstancedMesh(sphere, basic('#fff', { transparent: true, opacity: 0.75 }), MAX_PIECES);
    this.coins = new THREE.InstancedMesh(disc, this.pieceMat, MAX_PIECES);
    this.coinsInk = new THREE.InstancedMesh(disc, this.ink.tiny, MAX_PIECES);
    // Aro de las bimetálicas: un disco algo más fino y ancho, del color del aro.
    this.coinRims = new THREE.InstancedMesh(disc, this.pieceMat, MAX_PIECES);
    for (const m of [this.marbles, this.coins, this.coinRims]) m.setColorAt(0, this.color.set('#fff'));
    for (const m of [this.marbles, this.marblesInk, this.marblesHi, this.coins, this.coinsInk, this.coinRims]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.outRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 40), this.outRingMat);
    this.outRing.visible = false;
    this.outRing.renderOrder = 6;
    (this.outRing.material as THREE.Material).depthTest = false;
    scene.add(this.outRing);

    // Superficie: disco de radio 1 con anillos, que se deforma en cada frame (ondas y cúpula).
    const rings: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) rings.push(new THREE.Vector2(i / 14, 0));
    const surf = new THREE.LatheGeometry(rings.reverse(), SEGMENTS);
    const pos = surf.attributes.position;
    this.surfaceRho = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.surfaceRho[i] = Math.hypot(pos.getX(i), pos.getZ(i));
    this.surface = new THREE.Mesh(surf, this.surfaceMat);

    const dotGeo = ringGeometry(1, 0.32);
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(dotGeo, this.foamDotMat);
      d.rotation.x = -Math.PI / 2;
      this.foamDots.push(d);
    }
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), this.bubbleMat, N_BUBBLES);

    // Gotas en lágrima, chorro en tramos de cilindro y gotitas: cada una con su contorno.
    const tear = tearGeometry();
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    const ball = new THREE.SphereGeometry(1, 10, 8);
    this.drops = new THREE.InstancedMesh(tear, this.liquidMat, MAX_DROPS);
    this.dropsInk = new THREE.InstancedMesh(tear, this.ink.drop, MAX_DROPS);
    this.dropsHi = new THREE.InstancedMesh(ball, this.lineMat, MAX_DROPS);
    this.stream = new THREE.InstancedMesh(cyl, this.liquidMat, MAX_STREAM);
    this.streamInk = new THREE.InstancedMesh(cyl, this.ink.stream, MAX_STREAM);
    this.streamHi = new THREE.InstancedMesh(cyl, this.lineMat, MAX_STREAM);
    this.bits = new THREE.InstancedMesh(ball, this.liquidMat, MAX_SPLASH * 3 + 3);
    this.bitsInk = new THREE.InstancedMesh(ball, this.ink.tiny, MAX_SPLASH * 3 + 3);
    for (const m of [this.drops, this.dropsInk, this.dropsHi, this.stream, this.streamInk, this.streamHi, this.bits, this.bitsInk, this.bubbles]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Su volumen de recorte se calcula una vez y, si fue con 0 instancias, no se pintarían nunca.
      m.frustumCulled = false;
      m.count = 0;
    }
    for (let i = 0; i < MAX_SPLASH + 2; i++) {
      const mat = basic('#fff', { transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const r = new THREE.Mesh(undefined, mat);
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.rippleMats.push(mat);
      this.ripples.push(r);
    }

    // Regueros del desborde: dos por los lados y dos por delante.
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(undefined, this.liquidMat);
      const ink = new THREE.Mesh(undefined, this.ink.river);
      r.visible = ink.visible = false;
      this.rivers.push(r);
      this.riversInk.push(ink);
    }
    for (const m of [this.puddle, this.puddleInk, this.puddleHi]) m.rotation.x = -Math.PI / 2;
    this.puddleInk.position.y = 0.003;
    this.puddle.position.y = 0.004;
    this.puddleHi.position.y = 0.005;

    this.limitRing.rotation.x = Math.PI / 2;
    // El cristal y sus brillos, después de lo opaco; la tinta del aro, antes que el aro.
    this.glass.renderOrder = 2;
    for (const g of this.glassHi) g.renderOrder = 3;
    this.rimInk.renderOrder = 4;
    this.rim.renderOrder = 5;

    scene.add(this.liquidBody, this.liquidGloss, this.foamBody, this.surface, this.contact, this.domeLine,
      ...this.foamDots, this.bubbles, this.drops, this.dropsInk, this.dropsHi, this.stream, this.streamInk,
      this.streamHi, this.bits, this.bitsInk, ...this.ripples, ...this.rivers, ...this.riversInk,
      this.puddleInk, this.puddle, this.puddleHi, this.glass, ...this.glassHi, this.glassLine,
      this.rimInk, this.rim, this.limitRing);
    this.setTema('noche');
  }

  /** Grifo: tubo que entra por la derecha, codo y caño hacia abajo; llave de palanca encima. */
  private buildFaucet() {
    const r = 8.5 * PX;
    const elbow = 0.27;
    const path = new THREE.CurvePath<THREE.Vector3>();
    path.add(new THREE.LineCurve3(new THREE.Vector3(4, PIPE_Y, 0), new THREE.Vector3(elbow, PIPE_Y, 0)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(elbow, PIPE_Y, 0), new THREE.Vector3(0, PIPE_Y, 0), new THREE.Vector3(0, PIPE_Y - elbow, 0)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(0, PIPE_Y - elbow, 0), new THREE.Vector3(0, SPOUT_Y + 0.12, 0)));
    const pipeGeo = new THREE.TubeGeometry(path, 80, r, 16, false);
    const pipe = new THREE.Mesh(pipeGeo, this.metal);
    const pipeInk = new THREE.Mesh(pipeGeo, this.ink.faucet);
    // Brillo: una línea fina por encima y a la izquierda del tubo.
    const hiPath = new THREE.CurvePath<THREE.Vector3>();
    const o = r * 0.55;
    hiPath.add(new THREE.LineCurve3(new THREE.Vector3(4, PIPE_Y + o, o), new THREE.Vector3(elbow, PIPE_Y + o, o)));
    hiPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(elbow, PIPE_Y + o, o), new THREE.Vector3(-o, PIPE_Y + o, o), new THREE.Vector3(-o, PIPE_Y - elbow, o)));
    const pipeHi = new THREE.Mesh(new THREE.TubeGeometry(hiPath, 60, 2 * PX, 6, false), this.metalHi);

    // Boquilla
    const nozzleGeo = new THREE.CylinderGeometry(14 * PX, 14 * PX, 20 * PX, 20);
    const nozzle = new THREE.Mesh(nozzleGeo, this.metal);
    nozzle.position.y = SPOUT_Y + 10 * PX;
    const nozzleInk = new THREE.Mesh(nozzleGeo, this.ink.faucet);
    nozzleInk.position.copy(nozzle.position);
    const nozzleHi = new THREE.Mesh(new THREE.BoxGeometry(5 * PX, 12 * PX, 2 * PX), this.metalHi);
    nozzleHi.position.set(-7 * PX, SPOUT_Y + 11 * PX, 13 * PX);

    // Llave: pie sobre el tubo, eje y palanca con pomo. Gira según el caudal (draw).
    const px = 95 * PX, py = PIPE_Y + 25 * PX;
    const postGeo = new THREE.BoxGeometry(16 * PX, 20 * PX, 16 * PX);
    const post = new THREE.Mesh(postGeo, this.metal);
    post.position.set(px, PIPE_Y + 12 * PX, 0);
    const postInk = new THREE.Mesh(postGeo, this.ink.faucet);
    postInk.position.copy(post.position);
    const hubGeo = new THREE.SphereGeometry(10 * PX, 16, 12);
    const hub = new THREE.Mesh(hubGeo, this.metal);
    const hubInk = new THREE.Mesh(hubGeo, this.ink.faucet);
    const barGeo = new THREE.CapsuleGeometry(6 * PX, 28 * PX, 4, 12);
    barGeo.rotateZ(Math.PI / 2);
    barGeo.translate(20 * PX, 0, 0);
    const bar = new THREE.Mesh(barGeo, this.metal);
    const barInk = new THREE.Mesh(barGeo, this.ink.faucet);
    const knobGeo = new THREE.SphereGeometry(11 * PX, 16, 12);
    knobGeo.translate(42 * PX, 0, 0);
    const knob = new THREE.Mesh(knobGeo, this.knob);
    const knobInk = new THREE.Mesh(knobGeo, this.ink.faucet);
    const knobHi = new THREE.Mesh(new THREE.SphereGeometry(3.5 * PX, 8, 6), basic('#fff', { transparent: true, opacity: 0.6 }));
    knobHi.position.set(39 * PX, 3 * PX, 9 * PX);
    this.lever.position.set(px, py, 0);
    this.lever.add(bar, barInk, knob, knobInk, knobHi, hub, hubInk);

    this.faucet.add(pipe, pipeInk, pipeHi, nozzle, nozzleInk, nozzleHi, post, postInk, this.lever);

    // Tolva: un tubo ancho y abierto que acaba a la altura de la boca del grifo.
    const tubeGeo = new THREE.CylinderGeometry(0.26, 0.2, 0.75, 28, 1, true);
    const tube = new THREE.Mesh(tubeGeo, this.metal);
    const tubeInk = new THREE.Mesh(tubeGeo, this.ink.faucet);
    const tubeIn = new THREE.Mesh(tubeGeo, basic('#000', { side: THREE.BackSide }));
    tubeIn.userData.oscuro = true;
    const tubeHi = new THREE.Mesh(new THREE.BoxGeometry(5 * PX, 0.5, 2 * PX), this.metalHi);
    tubeHi.position.set(-0.13, 0.02, 0.22);
    for (const m of [tube, tubeInk, tubeIn]) m.position.y = 0;
    this.hopper.add(tubeIn, tube, tubeInk, tubeHi);
    this.hopper.position.y = SPOUT_Y + 0.375;
    this.hopper.visible = false;
    this.scene.add(this.faucet, this.hopper);
  }

  setTema(id: TemaId) {
    this.temaId = id;
    const c = this.tema = TEMAS[id].escena;
    for (const m of Object.values(this.ink)) m.uniforms.uColor.value.set(c.tinta);
    this.inkBasic.color.set(c.tinta);
    this.rimInkMat.color.set(c.tinta);
    this.glassMat.color.set(c.cristal);
    this.glassMat.opacity = c.cristalOpacidad;
    this.rimMat.color.set(c.aro);
    this.tableTop.color.set(c.tablero);
    this.tableLine.color.set(c.tableroLinea);
    this.tableLip.color.set(c.liston);
    this.tableEdge.color.set(c.canto);
    this.tableUnder.color.set(c.debajo);
    this.shadowMat.color.set(c.sombra);
    setToon(this.metal, c.metal, new THREE.Color(c.metal).multiplyScalar(0.78).getStyle());
    this.metalHi.color.set(c.metalBrillo);
    setToon(this.knob, c.pomo, new THREE.Color(c.pomo).multiplyScalar(0.75).getStyle());
    this.scene.background = new THREE.Color(c.debajo);
    this.hopper.traverse(o => {
      if (o.userData.oscuro) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(c.tinta);
    });
    this.outRingMat.color.set(TEMAS[id].ui.peligro);
    this.wallKey = '';
  }

  private fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h, false);
      const cam = this.camera;
      cam.aspect = w / h;
      // El vaso recto ocupa ~44 % del ancho y su borde queda a ~36 % del alto; si la pantalla es
      // muy apaisada, manda el alto (el vaso entero tiene que caber).
      const halfT = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      let visH = (2 * R * GLASS / 0.44) / cam.aspect;
      visH = Math.max(visH, H / 0.5);
      const d = visH / 2 / halfT;
      const yc = H - (0.5 - 0.36) * visH;
      cam.position.set(0, yc + d * Math.sin(TILT), d * Math.cos(TILT));
      cam.lookAt(0, yc, 0);
      cam.updateProjectionMatrix();
      this.wallKey = '';
    }
    const key = `${w}x${h}:${this.temaId}`;
    if (key !== this.wallKey) {
      this.wallKey = key;
      this.paintWall();
    }
  }

  /** Pinta la pared a la medida de lo que se ve: ladrillo y estantes (noche) o azulejo (día). */
  private paintWall() {
    const cam = this.camera;
    const dist = cam.position.z - WALL_Z;
    const halfT = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const visH = 2 * dist * halfT * 1.25, visW = visH * cam.aspect;
    const cy = cam.position.y - dist * Math.tan(TILT) * 1.05;
    this.wall.scale.set(visW, visH, 1);
    this.wall.position.y = cy;

    const scale = Math.min(160, 2048 / visW, 2048 / visH);
    const cv = this.wallCanvas;
    cv.width = Math.round(visW * scale);
    cv.height = Math.round(visH * scale);
    const ctx = cv.getContext('2d')!;
    const x0 = -visW / 2, y1 = cy + visH / 2;
    // Se dibuja en unidades de la escena (y hacia arriba).
    ctx.setTransform(scale, 0, 0, -scale, -x0 * scale, y1 * scale);
    const c = this.tema;
    // Lo que se ve de la pared en el plano del vaso, para colocar los adornos en los lados.
    const seenW = visW / 1.25 / 1.05, left = -seenW / 2;
    const fx = (f: number) => left + f * seenW;
    const top = cy + visH / 2.5;

    ctx.fillStyle = c.pared;
    ctx.fillRect(x0, cy - visH / 2, visW, visH);
    ctx.fillStyle = c.luz;
    ctx.globalAlpha = 0.25;
    for (const r of [0.62, 0.33]) {
      ctx.beginPath();
      ctx.arc(fx(this.temaId === 'noche' ? 0.18 : 0.2), top + (this.temaId === 'noche' ? 0.05 : -0.2), r * seenW, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.025;

    if (this.temaId === 'noche') {
      // Ladrillo con juntas alternas.
      ctx.strokeStyle = c.paredLinea;
      const bh = 0.27, bw = 0.54;
      ctx.beginPath();
      for (let r = 0, y = 0; y < y1; r++, y += bh) {
        ctx.moveTo(x0, y); ctx.lineTo(-x0, y);
        for (let x = x0 - (r % 2 ? bw / 2 : 0); x < -x0; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, y + bh); }
      }
      ctx.stroke();
      // Estantes con botellas, lejos del borde del vaso.
      const shelfY = 1.3;
      ctx.fillStyle = c.decoClaro;
      ctx.fillRect(x0, shelfY - 0.1, fx(0.25) - x0, 0.1);
      ctx.fillRect(fx(0.75), shelfY - 0.1, -x0 - fx(0.75), 0.1);
      ctx.fillStyle = c.deco;
      const bottle = (f: number, w: number, h: number) => {
        const x = fx(f), b = shelfY;
        ctx.beginPath();
        ctx.moveTo(x, b);
        ctx.lineTo(x, b + h * 0.58);
        ctx.quadraticCurveTo(x, b + h * 0.76, x + w * 0.34, b + h * 0.8);
        ctx.lineTo(x + w * 0.34, b + h);
        ctx.lineTo(x + w * 0.66, b + h);
        ctx.lineTo(x + w * 0.66, b + h * 0.8);
        ctx.quadraticCurveTo(x + w, b + h * 0.76, x + w, b + h * 0.58);
        ctx.lineTo(x + w, b);
        ctx.fill();
      };
      bottle(0.026, 0.22, 0.78); bottle(0.097, 0.26, 0.64); bottle(0.18, 0.2, 0.86);
      bottle(0.77, 0.24, 0.7); bottle(0.846, 0.2, 0.9); bottle(0.918, 0.26, 0.6);
    } else {
      // Luz de la ventana en diagonal y azulejo en la mitad de abajo, con su listón.
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.55;
      const sx = seenW / 390, sy = 0.0105;
      const poly = (pts: number[][]) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(left + x * sx, top - y * sy) : ctx.moveTo(left + x * sx, top - y * sy)));
        ctx.fill();
      };
      poly([[24, -40], [160, -40], [70, 200], [-66, 200]]);
      poly([[180, -40], [216, -40], [126, 200], [90, 200]]);
      ctx.globalAlpha = 1;
      const tileTop = 1.85;
      ctx.fillStyle = c.deco;
      ctx.fillRect(x0, 0, visW, tileTop);
      ctx.fillStyle = c.decoClaro;
      ctx.fillRect(x0, tileTop, visW, 0.09);
      ctx.strokeStyle = c.paredLinea;
      ctx.beginPath();
      for (let y = tileTop; y > 0; y -= 0.31) { ctx.moveTo(x0, y); ctx.lineTo(-x0, y); }
      for (let x = 0.15; x < -x0; x += 0.31) { ctx.moveTo(x, 0); ctx.lineTo(x, tileTop); ctx.moveTo(-x, 0); ctx.lineTo(-x, tileTop); }
      ctx.stroke();
    }
    this.wallTex.needsUpdate = true;
  }

  private setVessel(v: Vessel) {
    this.vessel = v;
    GH = H * v.height;
    const pts = [new THREE.Vector2(0, -0.02), ...profile(v, 0, 1, GLASS)];
    pts[1].y = -0.02;
    this.glass.geometry.dispose();
    this.glass.geometry = new THREE.LatheGeometry(pts, SEGMENTS);
    // Brillos del cristal: franja ancha a la izquierda y otra fina a la derecha.
    this.glassHi[0].geometry.dispose();
    this.glassHi[0].geometry = band(v, 0.1, 0.9, -0.78, -0.62, GLASS + 0.004);
    this.glassHi[1].geometry.dispose();
    this.glassHi[1].geometry = band(v, 0.28, 0.8, 0.66, 0.73, GLASS + 0.004);

    // Contorno del cristal: la silueta (lados y el arco delantero del fondo) como un tubo.
    const sil: THREE.Vector3[] = [];
    const rr = (h: number) => R * v.radius(h) * GLASS;
    for (let i = 40; i >= 0; i--) sil.push(new THREE.Vector3(-rr(i / 40), GH * i / 40, 0));
    const r0 = rr(0);
    for (let i = 1; i < 24; i++) {
      const a = Math.PI * (1 - i / 24);
      sil.push(new THREE.Vector3(Math.cos(a) * r0, -0.02, Math.sin(a) * r0));
    }
    for (let i = 0; i <= 40; i++) sil.push(new THREE.Vector3(rr(i / 40), GH * i / 40, 0));
    this.glassLine.geometry.dispose();
    this.glassLine.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sil, false, 'centripetal'), 220, 1.75 * PX, 6, false);

    // Aro del borde: blanco cálido sobre tinta más gruesa.
    const rRim = rr(1);
    this.rimInk.geometry.dispose();
    this.rimInk.geometry = new THREE.TorusGeometry(rRim, 4.8 * PX, 8, SEGMENTS * 2);
    this.rim.geometry.dispose();
    this.rim.geometry = new THREE.TorusGeometry(rRim, 2.3 * PX, 8, SEGMENTS * 2);
    for (const m of [this.rimInk, this.rim]) {
      m.rotation.x = Math.PI / 2;
      m.position.y = GH;
    }

    const sr = R * v.radius(0) * 1.25 + 0.16;
    this.shadow.scale.set(sr, sr * 0.75, 1);
    this.lastLiquid = this.lastFoamTop = this.lastSurfR = this.lastDome = -1;
  }

  /** Canicas y monedas en el corte del vaso (z = 0), y un aro en la que se ha salido. */
  private drawPile(pile: Pile | null) {
    const m = this.tmp;
    let nm = 0, nc = 0, nr = 0;
    if (pile) {
      for (const p of pile.pieces) {
        if (nm >= MAX_PIECES || nc >= MAX_PIECES) break;
        const x = p.x * SOLID_K, y = p.y * SOLID_K;
        if (p.kind === 'canicas') {
          const r = p.w * SOLID_K;
          this.setInstance(this.marbles, nm, x, y, 0, r);
          this.setInstance(this.marblesInk, nm, x, y, 0, r);
          this.setInstance(this.marblesHi, nm, x - r * 0.35, y + r * 0.4, r * 0.75, r * 0.25);
          this.marbles.setColorAt(nm, this.color.set(SOLIDOS.canicas[p.variant % SOLIDOS.canicas.length]));
          nm++;
        } else {
          const w = p.w * SOLID_K, h = p.h * SOLID_K;
          const c = SOLIDOS.monedas[p.variant];
          m.position.set(x, y, 0);
          m.rotation.set(0, 0, p.angle);
          m.scale.set(w, h, w);
          m.updateMatrix();
          this.coins.setMatrixAt(nc, m.matrix);
          this.coinsInk.setMatrixAt(nc, m.matrix);
          this.coins.setColorAt(nc, this.color.set(c.aro ? c.aro : c.cuerpo));
          nc++;
          if (c.aro) {
            // El centro de la bimetálica asoma por delante, un poco más fino.
            m.scale.set(w * 0.62, h * 1.06, w * 1.02);
            m.updateMatrix();
            this.coinRims.setMatrixAt(nr, m.matrix);
            this.coinRims.setColorAt(nr, this.color.set(c.cuerpo));
            nr++;
          }
          m.rotation.set(0, 0, 0);
        }
      }
    }
    this.marbles.count = this.marblesInk.count = this.marblesHi.count = nm;
    this.coins.count = this.coinsInk.count = nc;
    this.coinRims.count = nr;
    for (const mesh of [this.marbles, this.marblesInk, this.marblesHi, this.coins, this.coinsInk, this.coinRims]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const out = pile?.out;
    this.outRing.visible = !!out;
    if (out) {
      this.outRing.position.set(out.x * SOLID_K, out.y * SOLID_K, 0.3);
      this.outRing.scale.setScalar(((out.kind === 'canicas' ? out.w : out.w / 2) + 7) * SOLID_K);
    }
  }

  private setLiquid(id: LiquidId) {
    this.liquidId = id;
    const l = LIQUIDOS[id];
    setToon(this.liquidMat, l.cuerpo, l.sombra);
    setToon(this.foamMat, l.espuma ?? l.superficie, l.espumaSombra ?? l.superficie);
    this.lineMat.color.set(l.linea);
    this.glossMat.color.set(l.reflejo);
    this.puddleMat.color.set(l.cuerpo);
    this.foamDotMat.color.set(l.espumaSombra ?? l.linea);
    this.bubbleMat.color.set(l.burbujas ?? l.linea);
    for (const m of this.rippleMats) m.color.set(l.linea);
  }

  /** Cuerpo torneado del líquido (o de la espuma) entre dos alturas. */
  private lathe(mesh: THREE.Mesh, h0: number, h1: number, closeBottom: boolean) {
    mesh.geometry.dispose();
    if (h1 - h0 < 0.002) {
      mesh.visible = false;
      return;
    }
    const pts = profile(this.vessel!, h0, h1, 0.985, Math.max(2, Math.ceil((h1 - h0) * 40)));
    if (closeBottom) pts.unshift(new THREE.Vector2(0, GH * h0));
    mesh.geometry = new THREE.LatheGeometry(pts, SEGMENTS);
    mesh.visible = true;
  }

  private setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const m = this.tmp;
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.updateMatrix();
    mesh.setMatrixAt(i, m.matrix);
  }

  private setRipple(i: number, y: number, r: number, opacity: number) {
    const mesh = this.ripples[i];
    mesh.geometry.dispose();
    mesh.geometry = ringGeometry(r, 2.4 * PX);
    mesh.position.y = y + 0.004;
    this.rippleMats[i].opacity = opacity;
    mesh.visible = true;
  }

  draw(game: Game, now: number) {
    this.fit();
    const { glass, faucet } = game;
    if (glass.vessel !== this.vessel) this.setVessel(glass.vessel);
    const solid = isSolid(game.contentId);
    const liquidId: LiquidId = isSolid(game.contentId) ? 'agua' : game.contentId;
    if (liquidId !== this.liquidId) this.setLiquid(liquidId);
    this.faucet.visible = !solid;
    this.hopper.visible = solid;
    this.drawPile(game.pile);
    if (glass !== this.lastGlass) {
      this.lastGlass = glass;
      this.overflowSince = null;
      this.lastLiquid = this.lastFoamTop = this.lastSurfR = this.lastDome = -1;
      this.splashes = [];
      this.prevDrops.clear();
    }
    const v = this.vessel!;
    const l = LIQUIDOS[liquidId];

    // Alturas: líquido, espuma encima y, si pasa del borde, la cúpula del menisco.
    const top = glass.height;
    const liquidTop = Math.min(glass.liquidHeight, 1);
    const capped = Math.min(top, 1);
    const dome = Math.max(0, top - 1) * GH * MENISCO_VISIBLE;
    const hasFoam = capped - liquidTop >= 0.002;

    if (Math.abs(liquidTop - this.lastLiquid) > 0.001) {
      this.lastLiquid = liquidTop;
      this.lathe(this.liquidBody, 0, liquidTop, true);
      this.liquidGloss.geometry.dispose();
      const g0 = Math.min(0.03, liquidTop);
      this.liquidGloss.visible = liquidTop - g0 > 0.04;
      if (this.liquidGloss.visible) this.liquidGloss.geometry = band(v, g0, liquidTop - 0.01, -0.7, -0.56, 0.99);
    }
    if (Math.abs(capped - this.lastFoamTop) > 0.001) {
      this.lastFoamTop = capped;
      this.lathe(this.foamBody, liquidTop, capped, false);
    }
    if (!hasFoam) this.foamBody.visible = false;

    // Superficie: ondas según lo que cae y cúpula si pasa del borde.
    const surf = this.surface;
    surf.visible = glass.total > 0.0005;
    this.surfaceMat.color.set(glass.foam > 0.002 || !l.espuma ? l.superficie : l.reflejo);
    const rTop = R * v.radius(capped) * 0.985;
    surf.scale.set(rTop, 1, rTop);
    surf.position.y = GH * capped;
    const amp = (0.003 + Math.min(0.02, faucet.flow * 0.18)) * (dome > 0 ? 0.3 : 1);
    const pos = surf.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const rho = this.surfaceRho[i];
      const wave = Math.sin(rho * 14 - now * 7) * amp * (1 - rho * 0.6);
      pos.setY(i, dome * (1 - rho * rho) + wave);
    }
    pos.needsUpdate = true;
    const surfaceY = GH * capped + dome;
    const ySurf = GH * capped;

    // Línea de contacto con el cristal (se oculta con la cúpula) y contorno de la cúpula.
    if (Math.abs(rTop - this.lastSurfR) > 0.002) {
      this.lastSurfR = rTop;
      this.contact.geometry.dispose();
      this.contact.geometry = ringGeometry(rTop - 1.2 * PX, 2.4 * PX);
      this.contact.rotation.x = -Math.PI / 2;
    }
    this.contact.position.y = ySurf + 0.004;
    this.contact.visible = surf.visible && dome < 0.004;
    if (Math.abs(dome - this.lastDome) > 0.002) {
      this.lastDome = dome;
      // Silueta de la cúpula vista desde la cámara (algo picada): donde el rayo la roza, que
      // queda por detrás del eje. Si la cúpula es baja, la silueta es el propio borde de atrás.
      const tanA = (this.camera.position.y - ySurf) / this.camera.position.z;
      const zs = -Math.min(rTop * 0.97, rTop * rTop * tanA / (2 * Math.max(dome, 1e-4)));
      const xs = Math.sqrt(rTop * rTop - zs * zs);
      this.domeLine.visible = dome > 0.01;
      if (this.domeLine.visible) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 24; i++) {
          const x = xs * (-1 + 2 * i / 24);
          const rho2 = (x * x + zs * zs) / (rTop * rTop);
          pts.push(new THREE.Vector3(x, ySurf + dome * (1 - rho2) + 1.5 * PX, zs));
        }
        this.domeLine.geometry.dispose();
        this.domeLine.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.5 * PX, 6, false);
      }
    }

    // Espuma: unas pompas dibujadas en la superficie. Burbujas subiendo dentro de la cerveza.
    const foamy = !!l.espuma && glass.foam > 0.004;
    const DOTS = [[-0.5, -0.2, 3], [-0.15, 0.25, 2.5], [0.25, -0.35, 3.5], [0.55, 0.15, 2.5], [0.05, -0.05, 2]];
    this.foamDots.forEach((d, i) => {
      d.visible = foamy;
      if (!foamy) return;
      const [fx, fz, r] = DOTS[i];
      const x = fx * rTop, z = (fz + 0.35) * rTop * 0.9;
      const rho = Math.hypot(x, z) / rTop;
      d.position.set(x, ySurf + dome * (1 - rho * rho) + 0.006, z);
      d.scale.setScalar(r * PX * 1.3);
    });
    let nb = 0;
    if (l.burbujas && liquidTop > 0.06) {
      for (let i = 0; i < N_BUBBLES; i++) {
        const h = ((i * 0.618 + now * (0.05 + (i % 3) * 0.02)) % 1) * (liquidTop - 0.04) + 0.01;
        const s = ((i * 0.37) % 1) * 1.2 - 0.6;
        const rr = R * v.radius(h) * 0.99;
        const a = phi(s);
        this.setInstance(this.bubbles, nb++, Math.sin(a) * rr, GH * h, Math.cos(a) * rr, (1.6 + (i % 3) * 0.5) * PX);
      }
    }
    this.bubbles.count = nb;
    this.bubbles.instanceMatrix.needsUpdate = true;

    // Lo que está en el aire: chorro más ancho arriba y gotas en lágrima.
    const fall = (p: { emitted: number; arrival: number }) => {
      const t = Math.min(1, Math.max(0, (faucet.time - p.emitted) / (p.arrival - p.emitted)));
      return SPOUT_Y + (surfaceY - SPOUT_Y) * t * t;
    };
    let nd = 0, ns = 0;
    const stream = faucet.inAir.filter(p => p.kind === 'stream');
    for (let i = 0; i < stream.length && ns < MAX_STREAM; i++) {
      const y0 = fall(stream[i]);
      const y1 = i + 1 < stream.length ? fall(stream[i + 1]) : SPOUT_Y;
      const flow = stream[i].volume * 60;
      const k = (SPOUT_Y - (y0 + y1) / 2) / Math.max(0.1, SPOUT_Y - surfaceY);
      const r = Math.min(0.08, Math.max(0.016, 0.2 * Math.sqrt(flow))) * (1 - 0.35 * k);
      const len = Math.abs(y1 - y0) + 0.004;
      const y = (y0 + y1) / 2;
      this.setInstance(this.stream, ns, 0, y, 0, r, len, r);
      this.setInstance(this.streamInk, ns, 0, y, 0, r, len, r);
      this.setInstance(this.streamHi, ns, -r * 0.4, y, r * 0.85, 1.5 * PX, len, 1.5 * PX);
      ns++;
    }
    const drops = new Set<Parcel>();
    for (const p of faucet.inAir) {
      if (p.kind !== 'drop' || nd >= MAX_DROPS) continue;
      drops.add(p);
      const r = 0.05 * Math.cbrt(p.volume / 0.025) + 0.012;
      const y = fall(p);
      this.setInstance(this.drops, nd, 0, y, 0, r);
      this.setInstance(this.dropsInk, nd, 0, y, 0, r);
      this.setInstance(this.dropsHi, nd, -r * 0.35, y, r * 0.75, r * 0.28);
      nd++;
    }
    // Gotas que acaban de llegar: anillo de salpicadura y tres gotitas.
    for (const p of this.prevDrops) {
      if (!drops.has(p) && p.arrival <= faucet.time + 1e-6) {
        this.splashes.push({ t0: now });
        if (this.splashes.length > MAX_SPLASH) this.splashes.shift();
      }
    }
    this.prevDrops = drops;
    this.drops.count = this.dropsInk.count = this.dropsHi.count = nd;
    this.stream.count = this.streamInk.count = this.streamHi.count = ns;

    let nr = 0, nbits = 0;
    const bit = (x: number, y: number, r: number) => {
      this.setInstance(this.bits, nbits, x, y, 0.05, r);
      this.setInstance(this.bitsInk, nbits, x, y, 0.05, r);
      nbits++;
    };
    this.splashes = this.splashes.filter(s => now - s.t0 < 0.5);
    for (const s of this.splashes) {
      const t = (now - s.t0) / 0.5;
      this.setRipple(nr++, surfaceY, Math.min(rTop * 0.45, 0.04 + 0.14 * t), 1 - t);
      for (const [vx, vy] of [[-0.35, 1.1], [0.32, 1.25], [0.05, 1.5]]) {
        const tt = t * 0.5;
        const y = surfaceY + vy * tt - 4.5 * tt * tt;
        if (y > surfaceY - 0.01) bit(vx * tt * 1.4, y, 2.4 * PX);
      }
    }
    // Chorro llegando: dos ondas concéntricas y gotitas que saltan.
    const arriving = stream.length > 0 && stream[0].arrival - faucet.time < 0.05;
    if (arriving) {
      const ph = (now * 2.2) % 1;
      this.setRipple(nr++, surfaceY, Math.min(rTop * 0.45, 0.06 + 0.09 * ph), 0.9);
      this.setRipple(nr++, surfaceY, Math.min(rTop * 0.8, 0.14 + 0.12 * ph), 0.6);
      for (const [vx, vy, o] of [[-0.5, 1.0, 0], [0.55, 1.2, 0.33], [0.3, 1.45, 0.66]]) {
        const tt = ((now * 2.5 + o) % 1) * 0.42;
        const y = surfaceY + vy * tt - 5 * tt * tt;
        if (y > surfaceY) bit(vx * tt * 0.9 + Math.sign(vx) * 0.06, y, 2.2 * PX);
      }
    }
    for (let i = nr; i < this.ripples.length; i++) this.ripples[i].visible = false;
    this.bits.count = this.bitsInk.count = nbits;
    for (const m of [this.drops, this.dropsInk, this.dropsHi, this.stream, this.streamInk, this.streamHi, this.bits, this.bitsInk]) {
      m.instanceMatrix.needsUpdate = true;
    }

    // Llave del grifo: cerrada en horizontal, ≈14° con una gota, de 30° a 65° con chorro.
    const recentDrop = faucet.inAir.some(p => p.kind === 'drop' && faucet.time - p.emitted < 0.18);
    const target = faucet.flow > 0
      ? 30 + 35 * Math.min(1, faucet.flow / config.flowMax)
      : game.pressing || recentDrop ? 14 : 0;
    this.leverAngle += (target - this.leverAngle) * 0.25;
    this.lever.rotation.z = THREE.MathUtils.degToRad(this.leverAngle);

    // Desborde: regueros por fuera, gotas saltando del borde y un charco que crece.
    if (glass.overflowed) {
      this.overflowSince ??= now;
      const k = Math.min(1, (now - this.overflowSince) / 1.2);
      const RIV = [[-1, 0, 1], [1, 2, 0.72], [0.38, 4, 1], [-0.55, 1, 0.5]];
      RIV.forEach(([s, ph, len], i) => {
        const pts: THREE.Vector3[] = [];
        const a = phi(s);
        const L = Math.max(0.02, len * k);
        for (let j = 0; j <= 24; j++) {
          const h = 1 - L * j / 24;
          const rr = R * v.radius(h) * GLASS + 0.02;
          const wig = 0.012 * Math.sin(h * 11 + ph);
          pts.push(new THREE.Vector3(Math.sin(a) * rr + Math.cos(a) * wig, GH * h + 0.01, Math.cos(a) * rr - Math.sin(a) * wig));
        }
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 3.2 * PX, 8, false);
        this.rivers[i].geometry.dispose();
        this.rivers[i].geometry = geo;
        this.riversInk[i].geometry = geo;
        this.rivers[i].visible = this.riversInk[i].visible = true;
      });
      const rimR = R * v.radius(1) * GLASS;
      for (const [x0, vx, o] of [[-rimR, -0.5, 0], [rimR, 0.55, 0.4], [rimR * 0.5, 0.25, 0.7]]) {
        const tt = ((now * 1.6 + o) % 1) * 0.5;
        bit(x0 + vx * tt, GH + 1.1 * tt - 5 * tt * tt + 0.03, 3.2 * PX);
      }
      this.bits.count = this.bitsInk.count = nbits;
      const pr = R * v.radius(0) + 0.15 + 0.4 * k;
      if (this.puddle.userData.r !== pr) {
        this.puddle.userData.r = pr;
        const shape = new THREE.Shape();
        for (let i = 0; i <= 36; i++) {
          const a = Math.PI * 2 * i / 36;
          const q = 1 + 0.1 * Math.sin(3 * a) + 0.07 * Math.sin(5 * a + 1);
          const x = Math.cos(a) * pr * q - 0.06, y = Math.sin(a) * pr * 0.75 * q - 0.12;
          if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
        }
        const geo = new THREE.ShapeGeometry(shape, 4);
        this.puddle.geometry.dispose();
        this.puddle.geometry = geo;
        this.puddleInk.geometry = geo;
        this.puddleInk.scale.setScalar(1 + 0.045 / pr);
        this.puddleHi.geometry.dispose();
        const hi = new THREE.Shape();
        hi.ellipse(-pr * 0.55, -0.32 * pr, pr * 0.2, pr * 0.05, 0, Math.PI * 2, false, 0);
        this.puddleHi.geometry = new THREE.ShapeGeometry(hi);
      }
      this.puddle.visible = this.puddleInk.visible = this.puddleHi.visible = true;
    } else {
      for (const m of [...this.rivers, ...this.riversInk]) m.visible = false;
      this.puddle.visible = this.puddleInk.visible = this.puddleHi.visible = false;
      this.puddle.userData.r = -1;
    }

    // Depuración: el límite oculto de la ronda.
    this.limitRing.visible = this.showLimit;
    if (this.showLimit) {
      this.limitRing.position.y = GH + (v.volumeToHeight(glass.limit) - 1) * GH * MENISCO_VISIBLE;
      this.limitRing.scale.setScalar(R * v.radius(1) * 1.15);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
