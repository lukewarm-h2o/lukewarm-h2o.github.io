import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rnd();
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}

// ---------- terrain ----------
const PEAK = { x: -70, z: 90 };
const KNOTS = [[130, 80], [0, 60], [-60, 38], [-100, 22], [-150, 12], [-165, 12], [-172, 8], [-190, 8], [-205, 1.2], [-225, 0.2], [-260, -3], [-300, -6]];
function profile(z) {
  if (z >= KNOTS[0][0]) return KNOTS[0][1];
  for (let i = 0; i < KNOTS.length - 1; i++) {
    const [z0, y0] = KNOTS[i], [z1, y1] = KNOTS[i + 1];
    if (z <= z0 && z >= z1) return lerp(y0, y1, (z0 - z) / (z0 - z1));
  }
  return KNOTS[KNOTS.length - 1][1];
}
const pathX = (z) => 6 * Math.sin(z * 0.045) * sstep(-110, -70, z);
function terrain(x, z) {
  let y = profile(z);
  const d = Math.hypot(x - PEAK.x, z - PEAK.z);
  y += Math.max(0, 95 - 0.6 * d);
  const off = Math.abs(x - pathX(z));
  const wild = sstep(-110, -85, z) * sstep(2, 9, off);       // rough ground only on the open slope, off the path
  y += (noise(x * 0.06, z * 0.06) - 0.5) * 9 * wild + (noise(x * 0.25, z * 0.25) - 0.5) * 1.6 * wild;
  y -= Math.pow(Math.max(0, Math.abs(x) - 70), 2) * 0.006 * sstep(60, -40, z); // island falls away to the sea at the sides
  return y;
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { document.documentElement.classList.add('no-gl'); throw e; }      // no WebGL: the page stays readable as plain cards
document.documentElement.classList.add('has-gl');
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0c1c, 30, 430);
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);

const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
const sun = new THREE.DirectionalLight(0xffffff, 1);
const lava = new THREE.PointLight(0xff5a1a, 2, 0, 0);
lava.position.set(PEAK.x, terrain(PEAK.x, PEAK.z) + 6, PEAK.z);
scene.add(hemi, sun, sun.target, lava);

const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const M = {
  white: mat(0xf2efe8), stone: mat(0x3a3432), blue: mat(0x2f62b8), sky: mat(0x9cc3e0), wood: mat(0x7a5a3c),
  green: mat(0x4f7a35), dgreen: mat(0x2f5a2c), lgreen: mat(0x8fae5a), pink: mat(0xd9245f), terracotta: mat(0xb5613c),
  dark: mat(0x1b1b1d), red: mat(0xc23b2a), cat: mat(0x6b5a45), goat: mat(0xefe9dc), yellow: mat(0xe6d08a), orange: mat(0xf2a02a),
};
const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
const box = (w, h, d, m, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);

// terrain mesh
{
  const W = 560, D = 460, sx = 220, sz = 180;
  const geo = new THREE.PlaneGeometry(W, D, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -85);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const lavaC = new THREE.Color(0x2a2321), scrub = new THREE.Color(0x5d7a3a), scrub2 = new THREE.Color(0x86934f),
    dirt = new THREE.Color(0x6e5c4a), paving = new THREE.Color(0x8f897c), lawn = new THREE.Color(0x6f9146), sand = new THREE.Color(0x1c1c1f);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = terrain(x, z);
    pos.setY(i, y - (Math.abs(x) < 3 && z < -165.5 && z > -172.8 ? 3 : 0));   // cut a trench for the stair model
    const d = Math.hypot(x - PEAK.x, z - PEAK.z), off = Math.abs(x - pathX(z)), n = noise(x * 0.15, z * 0.15);
    c.copy(scrub).lerp(scrub2, n);
    c.lerp(lavaC, sstep(120, 70, d + n * 30));                   // bare lava high on the cone
    if (z < -148 && z > -192 && Math.abs(x) < 16) c.copy(lawn).lerp(scrub2, n * 0.3);
    if (z > -100) c.lerp(dirt, sstep(3, 1.2, off));              // dirt track on the slope
    else if (z > -192) c.lerp(paving, sstep(4.5, 3, off));       // lane and garden path
    c.lerp(sand, sstep(-192, -200, z));                          // black beach
    c.lerp(sand, sstep(4, 0.5, y) * sstep(-150, -200, z + Math.abs(x) * 0.2));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
}

// sea + foam
const sea = add(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x35556b }), 0, 0, -400);
sea.rotation.x = -Math.PI / 2;
const foams = [0, 1].map((i) => {
  const f = add(new THREE.PlaneGeometry(400, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 0, 0.06 + i * 0.01, -227);
  f.rotation.x = -Math.PI / 2; return f;
});

// sky dome, stars, sun disc, far islands
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } };
const dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying float h; void main(){ gl_FragColor = vec4(mix(hor, top, smoothstep(0.0, 0.45, h)), 1.0); }',
}));
dome.renderOrder = -2; scene.add(dome);
const starGeo = new THREE.BufferGeometry();
{
  const p = [];
  for (let i = 0; i < 700; i++) { const a = rr(0, Math.PI * 2), e = rr(0.05, 1.5); p.push(Math.cos(a) * Math.cos(e) * 1100, Math.sin(e) * 1100, Math.sin(a) * Math.cos(e) * 1100); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
stars.renderOrder = -1; scene.add(stars);
function glowTex(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
}
const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,250,220,1)', 'rgba(255,150,50,0.55)'), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
sunDisc.scale.setScalar(320); scene.add(sunDisc);
const islandMat = new THREE.MeshBasicMaterial({ color: 0x222233, fog: false });
[[90, -1000, 150, 70], [230, -1050, 110, 42], [-260, -1080, 140, 55]].forEach(([x, z, r, h]) => add(new THREE.ConeGeometry(r, h, 7), islandMat, x, h / 2 - 2, z));

// eruption: steady spatter, and a paroxysm every 20-32 s that throws bombs high and sends lava tumbling down the flank
const N = 4200, eGeo = new THREE.BufferGeometry(), ePos = new Float32Array(N * 3).fill(-9999), eCol = new Float32Array(N * 3), eSize = new Float32Array(N),
  eBase = new Float32Array(N), eVel = new Float32Array(N * 3), eLife = new Float32Array(N), eMax = new Float32Array(N), eDown = new Uint8Array(N);
const crater = new THREE.Vector3(PEAK.x, terrain(PEAK.x, PEAK.z) + 1, PEAK.z);
eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
eGeo.setAttribute('aColor', new THREE.BufferAttribute(eCol, 3));
eGeo.setAttribute('aSize', new THREE.BufferAttribute(eSize, 1));
const sparkMat = new THREE.ShaderMaterial({
  uniforms: { uH: { value: 360 }, uOpacity: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: 'attribute float aSize; attribute vec3 aColor; varying vec3 vC; uniform float uH; void main(){ vC = aColor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = min(aSize*uH*projectionMatrix[1][1]/max(0.1,-mv.z), uH*0.055); }',
  fragmentShader: 'varying vec3 vC; uniform float uOpacity; void main(){ float d = length(gl_PointCoord-0.5)*2.0; gl_FragColor = vec4(vC*smoothstep(1.0,0.2,d)*uOpacity, 1.0); }',
});
const sparks = new THREE.Points(eGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
const craterGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,220,150,1)', 'rgba(255,80,20,0.6)'), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
craterGlow.position.copy(crater).add(new THREE.Vector3(0, 6, 0)); scene.add(craterGlow);
const SCIARA = -1.75;                 // direction (in the x/z plane) of the flank the lava runs down
let eNext = 0;
function spawn(kind, power) {        // 0 idle spatter, 1 bomb, 2 lava running down the flank
  const i = eNext, j = i * 3; eNext = (eNext + 1) % N;
  let up, out, life, size, a = Math.random() * 6.283;
  if (kind === 0) { up = 9 + Math.random() * 14; out = 0.8 + Math.random() * 3.8; life = 1.5 + Math.random() * 1.7; size = 1.4 + Math.random() * 1.0; }
  else if (kind === 1) { up = (30 + Math.random() * 50) * (0.5 + 0.5 * power); out = (1.5 + Math.random() * 13) * (0.35 + 0.65 * Math.random()); life = 8 + Math.random() * 8; size = 1.8 + Math.random() * 2.2; }
  else { a = SCIARA + (Math.random() - 0.5) * 1.2; up = 2 + Math.random() * 5; out = 5 + Math.random() * 9; life = 11 + Math.random() * 11; size = 2.6 + Math.random() * 2.4; }
  ePos[j] = crater.x + Math.cos(a) * 2.5; ePos[j + 1] = crater.y; ePos[j + 2] = crater.z + Math.sin(a) * 2.5;
  eVel[j] = Math.cos(a) * out; eVel[j + 1] = up; eVel[j + 2] = Math.sin(a) * out;
  eLife[i] = eMax[i] = life; eBase[i] = size; eDown[i] = kind === 0 ? 3 : 0;
}
// ash plume
const smokeTex = glowTex('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.45)'), smokeCol = new THREE.Color();
const puffs = Array.from({ length: 46 }, () => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  sp.userData = { age: 99, life: 1, v: new THREE.Vector3() }; scene.add(sp); return sp;
});
let time = 0, puffNext = 0, puffAcc = 0, nextErupt = 2.5, eruptStart = -99, emitIdle = 0, emitBig = 0, emitFlow = 0, heat = 0, envNow = 0;
window.__erupt = () => { nextErupt = 0; }; window.__et = () => time - eruptStart;

// ---------- scatter helpers ----------
const blocks = [];                   // footprints of the distant houses, so plants stay out of them
const offPath = (x, z) => Math.abs(x - pathX(z));
const inLane = (x, z) => z < -96 && z > -192 && Math.abs(x) < 17;
const coneDist = (x, z) => Math.hypot(x - PEAK.x, z - PEAK.z);
const sight = (x, z) => {            // distance from the hero sightline (path start to crater), kept clear of tall things
  const bx = PEAK.x, bz = PEAK.z, t = clamp((x * bx + z * bz) / (bx * bx + bz * bz), 0, 1); return Math.hypot(x - bx * t, z - bz * t);
};
const clear = (x, z) => blocks.every(([bx, bz, r]) => (x - bx) ** 2 + (z - bz) ** 2 > r * r);
function sites(n, ok, x0, x1, z0, z1, s0 = 1, s1 = 1, minY = 1.2) {
  const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const x = rr(x0, x1), z = rr(z0, z1), y = terrain(x, z);
    if (y < minY || !ok(x, z, y)) continue;
    out.push({ x, y, z, ry: rr(0, 6.28), s: rr(s0, s1) });
  }
  return out;
}
function makeScrub() {
  const n = 2600, im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const list = sites(n, (x, z) => offPath(x, z) > 3.5 && !inLane(x, z) && clear(x, z) && sight(x, z) > 9 && coneDist(x, z) > 62 + Math.random() * 30, -175, 175, -204, 70, 0.7, 2.6, 2.5);
  list.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(rr(0, 3), rr(0, 3), 0));
    m.compose(new THREE.Vector3(p.x, p.y + p.s * 0.25, p.z), q, new THREE.Vector3(p.s * 1.3, p.s * 0.7, p.s * 1.3));
    im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(rr(0.2, 0.31), rr(0.28, 0.5), rr(0.2, 0.36)));
  });
  im.count = list.length; scene.add(im);
  // dry-stone terrace walls across the slope
  const segs = [];
  for (let k = 0; k < 26; k++) {
    const z = rr(-200, 10), x0 = rr(-130, 110), len = rr(4, 11);
    for (let i = 0; i < len; i++) { const x = x0 + i * 2.5; if (offPath(x, z) > 3.2 && !inLane(x, z) && clear(x, z) && coneDist(x, z) > 85 && terrain(x, z) > 2.5) segs.push([x, z + Math.sin(x * 0.2) * 1.5]); }
  }
  const wl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.7, 1.1, 0.8), M.stone, segs.length);
  segs.forEach(([x, z], i) => { q.setFromEuler(new THREE.Euler(0, rr(-0.15, 0.15), Math.atan2(terrain(x + 1.3, z) - terrain(x - 1.3, z), 2.6))); m.compose(new THREE.Vector3(x, terrain(x, z) + 0.2, z), q, new THREE.Vector3(1, rr(0.8, 1.2), 1)); wl.setMatrixAt(i, m); });
  scene.add(wl);
}

// village: lane walls, cube houses, bougainvillea, Ape truck with cat
{
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.white, 80), m = new THREE.Matrix4(); let n = 0;
  while (n < 80) {
    const x = rr(-110, 110), z = rr(-190, -85); if (Math.abs(x) < 20) continue;
    const y = terrain(x, z); if (y < 4) continue;
    const w = rr(5, 10), h = rr(3, 6), d = rr(5, 9);
    m.compose(new THREE.Vector3(x, y + h / 2 - 1, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)); im.setMatrixAt(n++, m); blocks.push([x, z, Math.max(w, d) * 0.8]);
  }
  scene.add(im);
  // church
  blocks.push([-34, -150, 9], [-29, -143, 4]);
  const cy = terrain(-34, -150); box(9, 8, 12, M.yellow, -34, cy + 3, -150); box(3, 13, 3, M.yellow, -29, cy + 5.5, -143);
  add(new THREE.ConeGeometry(2.2, 3, 4), M.yellow, -29, cy + 13.5, -143).rotation.y = Math.PI / 4;
}
function blossom(x, y, z, r, n, m = M.pink) {
  for (let i = 0; i < n; i++) {
    const s = rr(0.5, 1.1) * r;
    add(new THREE.IcosahedronGeometry(s, 0), i % 5 === 4 ? M.dgreen : m, x + rr(-r, r), y + rr(-r * 0.6, r * 0.8), z + rr(-r * 1.4, r * 1.4)).rotation.set(rr(0, 3), rr(0, 3), 0);
  }
}
blossom(-3.5, terrain(-3.4, -139) + 2.9, -139, 1.2, 12, mat(0x8fa6e0)); // plumbago blue

// garden: pergola, tiled bench, blue-tiled stair, palm, cactus, banana, citrus, pots
function tileTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#2b4fa8'; g.fillStyle = '#2b4fa8'; g.lineWidth = 5;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = 32 + i * 64, y = 32 + j * 64;
    g.beginPath(); g.arc(x, y, 22, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + Math.cos(k * Math.PI / 2) * 22, y + Math.sin(k * Math.PI / 2) * 22, 6, 0, 7); g.fill(); }
    g.strokeRect(x - 30, y - 30, 60, 60);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const tiles = tileTex();
const tileMat = (rx, ry) => { const t = tiles.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshLambertMaterial({ map: t }); };
{
  // terrace retaining walls either side of the stair, garden boundary walls
  [-1, 1].forEach((s) => box(13, 4.6, 0.6, M.white, s * 8.6, 10, -165.3));
  [-1, 1].forEach((s) => { box(0.5, 1.4, 44, M.white, s * 15.2, 10.5, -170); box(12.5, 1.1, 0.5, M.white, s * 8.9, 8.5, -190); });
}

// beach: rocks, reeds, boats
{
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x2b2b2e), 260), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 260; i++) {
    const x = rr(-110, 110), z = rr(-232, -203), s = Math.abs(x) < 2.5 ? rr(0.1, 0.25) : rr(0.2, 0.9);
    q.setFromEuler(new THREE.Euler(rr(0, 3), rr(0, 3), rr(0, 3)));
    m.compose(new THREE.Vector3(x, terrain(x, z) + s * 0.2, z), q, new THREE.Vector3(s, s * 0.6, s)); rocks.setMatrixAt(i, m);
  }
  scene.add(rocks);
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 3, 4), M.lgreen, 500);
  for (let i = 0; i < 500; i++) {
    let x = rr(-90, 90); if (Math.abs(x) < 3) x += Math.sign(x || 1) * 4; const z = rr(-201, -192);
    q.setFromEuler(new THREE.Euler(rr(-0.15, 0.15), 0, rr(-0.15, 0.15)));
    m.compose(new THREE.Vector3(x, terrain(x, z) + 1.4, z), q, new THREE.Vector3(1, rr(0.7, 1.3), 1)); reeds.setMatrixAt(i, m);
  }
  scene.add(reeds);
}
// ---------- Blender kit (garden/export/*.glb, embedded) ----------
const loader = new GLTFLoader();
const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0)).buffer;
const KIT_NAMES = ['truck', 'boat_red', 'boat_blue', 'goat', 'pot', 'rock_a', 'rock_b', 'cactus', 'banana', 'citrus', 'bougainvillea', 'palm', 'wall', 'bench', 'stair',
  'pergola', 'house_a', 'house_b', 'prickly_pear', 'agave', 'broom', 'grass_tuft', 'hibiscus', 'plumbago', 'caper'];
const loadKit = () => Promise.all(KIT_NAMES.map((name) => new Promise((res, rej) => {
  const done = (g) => { g.scene.traverse((o) => { if (o.material) o.material.side = THREE.DoubleSide; }); res([name, g.scene]); };
  if (window.__KIT__) loader.parse(b64(window.__KIT__[name]), '', done, rej);
  else loader.load('assets/garden/' + name + '.glb', done, undefined, rej);
}))).then(Object.fromEntries);
function populate(kit) {
  const put = (name, x, z, o = {}) => {
    const g = kit[name].clone();  g.position.set(x, (o.y ?? terrain(x, z)) + (o.dy || 0), z);
    g.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); g.scale.setScalar(o.s || 1); scene.add(g); return g;
  };
  const H = Math.PI / 2, spin = () => rr(0, 6.28);
  put('goat', pathX(-54) + 6, -54, { ry: 2.2 });
  put('goat', pathX(-70) - 9, -70, { ry: -1.1, s: 0.85 });
  // lane: wall segments stepping down the slope, houses facing the lane
  for (let z = -100; z > -150; z -= 4) [-1, 1].forEach((s) => put('wall', s * 3.4, z - 2, { dy: -0.45, rx: -0.19 }));
  [['house_a', -11.6, -106], ['house_b', 7.6, -113], ['house_b', -7.6, -124], ['house_a', 11.6, -131], ['house_a', -11.6, -141], ['house_b', 7.6, -146]]
    .forEach(([n, x, z]) => put(n, x, z, { ry: x < 0 ? H : -H, dy: -0.6 }));
  put('bougainvillea', -4.0, -110, { dy: -0.3 }); put('bougainvillea', 4.0, -127, { ry: Math.PI, dy: -0.3 });
  put('truck', 2.0, -118, { rx: -0.19, ry: 0.06, dy: 0.02 });
  put('pot', -2.6, -103); put('pot', 2.7, -134, { ry: 2 });
  // garden
  put('pergola', -6.4, -156, { y: 12 }); put('bougainvillea', -9.2, -151.6, { y: 12, ry: H });
  put('bench', 4.4, -156, { y: 12, ry: -H });
  put('stair', 0, -165, { y: 12.25 });
  box(3.2, 0.6, 1.8, M.stone, 0, 11.96, -164.1); box(3.2, 0.6, 3.4, M.stone, 0, 7.96, -173.6);   // landings
  put('palm', -3.8, -182.6, { ry: 1 }); put('palm', 11, -158, { s: 0.78, ry: 3 }); put('palm', -12, -184, { s: 0.7, ry: 5 });
  put('cactus', 5.5, -176); put('cactus', 7, -178.5, { s: 0.8, ry: 2 });
  annexCactus = put('cactus', -10.5, -156, { ry: 4 }); annexCactus.visible = !annexOpen();   // stands where the gallery annex goes
  put('banana', 3.6, -185); put('banana', -4, -187, { ry: 2, s: 1.15 }); put('banana', 9, -168.5, { ry: 4 });
  put('citrus', -9, -171); put('citrus', 9.5, -183, { ry: 2 }); put('citrus', -12.6, -172.4, { ry: 4, s: 0.9 }); put('citrus', 8, -150.5, { ry: 1 });
  [[2.4, -163.6], [-2.4, -163.6], [2.4, -173.6], [-2.4, -173.6], [-2, -150], [2.6, -189]].forEach(([x, z]) => put('pot', x, z, { ry: spin() }));
  // flower beds on the lower terrace
  put('bougainvillea', -14.3, -176.6, { y: 8, ry: 0 });
  put('plumbago', -13.9, -180.4, { y: 8, s: 1.25 }); put('plumbago', -13.9, -187.2, { y: 8, s: 1.1, ry: 2 });
  put('hibiscus', -9.6, -180.2, { y: 8 }); put('hibiscus', -10.8, -181.6, { y: 8, s: 0.85, ry: 2 }); put('hibiscus', -8.5, -181.7, { y: 8, s: 0.9, ry: 4 });
  for (let k = 0; k < 15; k++) { const a = k / 15 * 6.283; put(k % 2 ? 'rock_a' : 'rock_b', -9.6 + Math.cos(a) * 2.6, -181 + Math.sin(a) * 2.3, { y: 7.95, s: rr(0.22, 0.34), ry: spin() }); }
  put('caper', -8.2, -189.85, { y: 9.0, ry: Math.PI }); put('caper', -6.3, -189.9, { y: 9.0, ry: Math.PI + 0.5, s: 0.9 }); put('caper', -4.6, -189.85, { y: 9.0, ry: Math.PI - 0.4, s: 0.8 });
  put('pot', -7.3, -172.2, { y: 8 }); put('pot', -6.3, -173.1, { y: 8, ry: 2, s: 0.85 }); put('pot', -8.1, -173.5, { y: 8, ry: 4, s: 1.1 });
  // the Lab's bucket, parked by the path
  {
    const g = new THREE.Group(); g.position.set(-2.4, 8, -185.2); g.rotation.y = 0.6;
    box(1.5, 0.08, 1.5, M.dark, 0, 0.04, 0, g);
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.2, 1.5)), new THREE.LineBasicMaterial({ color: 0xeceae4 })); cage.position.y = 0.68; g.add(cage);
    const part = mat(0xff5a2b);
    box(0.5, 0.5, 0.5, part, -0.3, 0.33, 0.2, g).rotation.y = 0.3; box(0.42, 0.42, 0.42, mat(0x2a2b2d), 0.3, 0.29, -0.25, g).rotation.y = 0.8; box(0.34, 0.34, 0.34, part, 0.1, 0.72, 0.05, g).rotation.set(0.4, 0.5, 0.2);
    scene.add(g);
  }
  // shore
  put('boat_red', -7, -218, { ry: 0.5, rz: 0.2 }); put('boat_blue', 7, -216, { ry: -0.4, rz: -0.18 }); put('boat_blue', 15, -221, { ry: 1.1, rz: 0.15 });
  put('boat_red', -15, -214, { ry: -1.0, rz: -0.2 }); put('boat_blue', 3.5, -223, { ry: 1.9, rz: 0.12 });
  [[-11, -221, 1.3], [11, -212, 1.1], [-4, -225, 0.9], [20, -217, 1.6], [-22, -219, 1.8], [6, -227, 1.2]].forEach(([x, z, s], i) => put(i % 2 ? 'rock_a' : 'rock_b', x, z, { s, ry: spin(), dy: -0.1 }));
  // ---- filler: instanced plants and rocks ----
  makeScrub();
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), tmp = new THREE.Matrix4();
  const scatter = (name, list, dy = 0) => {
    const src = kit[name]; src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      list.forEach((p, i) => { mtx.compose(new THREE.Vector3(p.x, p.y + dy * p.s, p.z), qq.setFromAxisAngle(yAxis, p.ry), new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, tmp.multiplyMatrices(mtx, o.matrixWorld)); });
      im.frustumCulled = false; scene.add(im);
    });
  };
  const wild = (gap, clr = 16) => (x, z) => offPath(x, z) > gap && !inLane(x, z) && clear(x, z) && sight(x, z) > clr;
  const edge = (n, z0, z1, d0, d1, s0, s1) => Array.from({ length: n }, () => { const z = rr(z0, z1), x = pathX(z) + (Math.random() < 0.5 ? -1 : 1) * rr(d0, d1); return { x, y: terrain(x, z), z, ry: rr(0, 6.28), s: rr(s0, s1) }; });
  scatter('grass_tuft', [
    ...sites(2300, (x, z) => wild(1.7, 0)(x, z) && coneDist(x, z) > 66, -150, 150, -204, 60, 0.8, 1.9),
    ...edge(320, -97, 4, 1.7, 5, 0.7, 1.5),
    ...sites(90, (x, z) => Math.abs(x) > 3.6 && !(x < -3 && z > -162) && !(x > 3 && z > -160 && z < -152), -14.3, 14.3, -189, -150, 0.5, 1.0),
  ]);
  scatter('broom', sites(340, (x, z) => wild(4)(x, z) && coneDist(x, z) > 72, -150, 140, -100, 50, 0.8, 1.8));
  scatter('prickly_pear', [
    ...sites(150, wild(5), -130, 130, -202, -15, 0.8, 1.6),
    ...[-149.4, -159, -168, -176].flatMap(   // the first sits just off the terrace, clear of the gallery annex
     (z, i) => [{ x: (i % 2 ? 13.6 : -13.6), y: terrain(13.6, z), z, ry: i, s: 1.1 }]),
  ]);
  scatter('agave', [
    ...sites(190, wild(3.2), -140, 130, -202, 20, 0.7, 1.7),
    ...edge(40, -95, -5, 2.4, 4.5, 0.6, 1.1),
    ...[[-13.5, -188], [13.5, -188], [13.3, -151], [-3.4, -189], [3.6, -189.2], [12.5, -173]].map(([x, z], i) => ({ x, y: terrain(x, z), z, ry: i, s: 1.2 })),
  ]);
  scatter('rock_a', [...sites(170, (x, z) => wild(2.6)(x, z), -160, 130, -100, 75, 0.3, 1.7), ...edge(50, -96, 0, 2, 3.6, 0.15, 0.4)], -0.1);
  scatter('rock_b', sites(170, (x, z) => wild(2.6)(x, z) && coneDist(x, z) < 130, -160, 60, -60, 90, 0.4, 2.2), -0.1);
  const town = (x, z) => Math.abs(x) > 18 && clear(x, z);
  scatter('citrus', sites(55, town, -115, 115, -196, -90, 0.8, 1.2, 4));
  scatter('palm', sites(26, town, -115, 115, -196, -90, 0.55, 1.05, 4));
  scatter('bougainvillea', blocks.slice(0, 80).filter((_, i) => i % 4 === 0).map(([bx, bz, r]) => ({ x: bx + r * 0.75, y: terrain(bx + r * 0.75, bz) - 0.3, z: bz, ry: rr(0, 6.28), s: rr(0.9, 1.2) })));
  scatter('pot', sites(40, (x, z) => town(x, z) && !blocks.every(([bx, bz, r]) => (x - bx) ** 2 + (z - bz) ** 2 > (r + 3) ** 2), -115, 115, -196, -90, 0.9, 1.3, 4));
}
loadKit().then(populate).then(() => { window.__kit = true; }).catch((e) => console.error('kit failed', e));

// ---------- sky keyframes ----------
const K = [
  { t: 0.00, top: 0x04061a, hor: 0x1c1430, fog: 0x0b0c1e, sun: 0x6070c0, si: 0.12, hi: 0.35, hs: 0x5a66a8, hg: 0x1a1412, sea: 0x0d1626 },
  { t: 0.10, top: 0x070a24, hor: 0x35203c, fog: 0x15122a, sun: 0x7078c0, si: 0.15, hi: 0.4, hs: 0x5a66a8, hg: 0x1a1412, sea: 0x101a2c },
  { t: 0.27, top: 0x3a4f86, hor: 0xff9a50, fog: 0xd08a66, sun: 0xffb070, si: 1.3, hi: 0.9, hs: 0xa8b4e0, hg: 0x6a4a3a, sea: 0x6a5a66 },
  { t: 0.46, top: 0x9db4cb, hor: 0xe4e8ea, fog: 0xd6dde2, sun: 0xfff4e4, si: 1.5, hi: 1.9, hs: 0xe8eef4, hg: 0xa8a297, sea: 0x3f6278 },
  { t: 1.00, top: 0x8fb0d0, hor: 0xe6ecef, fog: 0xd3dde4, sun: 0xffffff, si: 1.5, hi: 2.0, hs: 0xeaf0f6, hg: 0xa8a297, sea: 0x386078 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
const mix = (a, b, f, out) => out.copy(cA.setHex(a)).lerp(cB.setHex(b), f);
function applySky(t) {
  let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], f = sstep(a.t, b.t, t);
  mix(a.top, b.top, f, skyU.top.value); mix(a.hor, b.hor, f, skyU.hor.value); mix(a.fog, b.fog, f, scene.fog.color);
  mix(a.sun, b.sun, f, sun.color); sun.intensity = lerp(a.si, b.si, f);
  mix(a.hs, b.hs, f, hemi.color); mix(a.hg, b.hg, f, hemi.groundColor); hemi.intensity = lerp(a.hi, b.hi, f);
  mix(a.sea, b.sea, f, sea.material.color);
  islandMat.color.copy(skyU.hor.value).multiplyScalar(0.45);
  const night = 1 - sstep(0.08, 0.3, t);
  stars.material.opacity = night;
  lava.intensity = (2.2 * night + 0.1) * (0.5 + 5 * heat);
  sparkMat.uniforms.uOpacity.value = 0.6 + 0.4 * night; craterGlow.material.opacity = 0.35 + 0.65 * night;
  smokeCol.setHex(0x5a2a18).lerp(cA.setHex(0x7d7873), sstep(0.15, 0.45, t));
  const el = lerp(-0.03, 0.42, sstep(0.12, 0.6, t)), az = -0.25;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  sunDisc.position.copy(camera.position).addScaledVector(dir, 1000);
  sunDisc.material.opacity = sstep(0.1, 0.24, t) * (1 - 0.75 * sstep(0.36, 0.52, t));
  sun.position.copy(camera.position).addScaledVector(dir, 100); sun.target.position.copy(camera.position);
}

// ---------- camera path ----------
const Z1 = -210;
const camPos = new THREE.Vector3(), ahead = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qPath = new THREE.Quaternion();
const craterLook = new THREE.Vector3(PEAK.x, terrain(PEAK.x, PEAK.z) + 6, PEAK.z);
// Each content section names the spot on the path (data-z) the camera should reach when its card is centred.
let knots = [[0, 0], [1, Z1]], P = 0;
function layout() {
  const max = document.documentElement.scrollHeight - window.innerHeight; knots = [[0, 0]];
  if (max > 0) document.querySelectorAll('main section[data-z]').forEach((sec) => {
    const el = sec.querySelector('.card') || sec, r = el.getBoundingClientRect();
    const c = clamp((r.top + window.scrollY + r.height / 2 - window.innerHeight / 2) / max, 0, 1), z = +sec.dataset.z, last = knots[knots.length - 1];
    if (c > last[0] + 0.01 && z < last[1]) knots.push([c, z]);
  });
  const last = knots[knots.length - 1];
  if (last[0] < 0.995) knots.push([1, Z1]); else { last[0] = 1; last[1] = Z1; }
}
function zOf(t) {
  for (let i = 0; i < knots.length - 1; i++) if (t <= knots[i + 1][0]) return lerp(knots[i][1], knots[i + 1][1], (t - knots[i][0]) / Math.max(1e-6, knots[i + 1][0] - knots[i][0]));
  return Z1;
}
function pose(t) {
  const z = zOf(t), x = pathX(z); P = z / Z1;                  // P: progress along the path itself, drives sky and altitude
  camPos.set(x, terrain(x, z) + 1.7, z);
  const za = z - 14, xa = pathX(za);
  ahead.set(xa, Math.max(terrain(xa, za), 0) + 1.5, za);
  camera.position.copy(camPos);
  camera.lookAt(craterLook); qA.copy(camera.quaternion);
  camera.lookAt(ahead); qB.copy(camera.quaternion);
  qPath.slerpQuaternions(qA, qB, sstep(0.015, 0.17, P));
}

// ---------- scroll, drag to look ----------
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const alt = document.getElementById('alt'), mark = document.getElementById('mark');
let target = 0, cur = 0;
const readScroll = () => { const max = document.documentElement.scrollHeight - window.innerHeight; target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0; };
window.addEventListener('scroll', () => { readScroll(); if (detour.on && Math.abs(window.scrollY - detour.scrollY) > 60) endDetour(); }, { passive: true });
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); sparkMat.uniforms.uH.value = renderer.domElement.height / 2; camera.aspect = w / h; camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix();
  layout(); readScroll();
}
window.addEventListener('resize', resize); window.addEventListener('load', resize);
if (window.ResizeObserver) new ResizeObserver(() => { layout(); readScroll(); }).observe(document.querySelector('main'));

// drag sideways (or use the arrow keys) to look around; the view drifts back to the path afterwards
const lookAt = { yaw: 0, pitch: 0, yawT: 0, pitchT: 0, drag: null, hold: 0 };
const YAW_MAX = 1.15, PITCH_MAX = 0.32;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button) return;
  lookAt.drag = { x: e.clientX, y: e.clientY, yaw: lookAt.yawT, pitch: lookAt.pitchT };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  document.documentElement.classList.add('is-looking');
});
canvas.addEventListener('pointermove', (e) => {
  const d = lookAt.drag; if (!d) return;
  lookAt.yawT = clamp(d.yaw + (e.clientX - d.x) / window.innerWidth * 2.4, -YAW_MAX, YAW_MAX);
  lookAt.pitchT = clamp(d.pitch + (e.clientY - d.y) / window.innerHeight * 0.9, -PITCH_MAX, PITCH_MAX);
});
const endDrag = () => { if (lookAt.drag) { lookAt.drag = null; lookAt.hold = time + 1.6; document.documentElement.classList.remove('is-looking'); } };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { lookAt.yawT = clamp(lookAt.yawT + (e.key === 'ArrowLeft' ? 0.25 : -0.25), -YAW_MAX, YAW_MAX); lookAt.hold = time + 2.5; e.preventDefault(); }
  if (e.key === 'Escape' && detour.on) endDetour();
});

// ---------- garden gallery: photos hung under the pergola, visited one by one on an optional detour ----------
// One panel per public album, never fewer than the pergola's eight. Past eight, an open-air annex west of the pergola
// fills up, reached through the gap at the pergola's south-west corner.
const GY = 12, EYE = GY + 1.55;
const PERGOLA_SPOTS = [                           // panel centre and the way it faces, in walking order
  { x: -8.5, z: -156.0, n: [1, 0] }, { x: -8.5, z: -153.2, n: [1, 0] }, { x: -6.4, z: -151.75, n: [0, -1] }, { x: -4.3, z: -152.9, n: [-1, 0] },
  { x: -4.3, z: -159.1, n: [-1, 0] }, { x: -5.3, z: -163.4, n: [0, 1] }, { x: -7.5, z: -163.4, n: [0, 1] }, { x: -8.5, z: -158.8, n: [1, 0] },
];
const ANNEX_SPOTS = [                             // walking order; `rank` is the order they open in as albums are added
  { x: -11.0, z: -163.4, n: [0, 1], rank: 8 }, { x: -13.3, z: -163.4, n: [0, 1], rank: 9 },
  { x: -14.5, z: -161.0, n: [1, 0], rank: 6 }, { x: -14.5, z: -158.4, n: [1, 0], rank: 3 }, { x: -14.5, z: -155.8, n: [1, 0], rank: 1 }, { x: -14.5, z: -153.2, n: [1, 0], rank: 5 },
  { x: -12.6, z: -151.75, n: [0, -1], rank: 7 },
  { x: -8.64, z: -153.2, n: [-1, 0], rank: 2 }, { x: -8.64, z: -156.0, n: [-1, 0], rank: 0 }, { x: -8.64, z: -158.8, n: [-1, 0], rank: 4 },   // backs of the pergola's west panels
];
const MIN_PANELS = PERGOLA_SPOTS.length, MAX_PANELS = MIN_PANELS + ANNEX_SPOTS.length;
const DOOR = new THREE.Vector3(-2.6, EYE, -156);  // gap in the pergola's east side: the way in and out
const GATE = [new THREE.Vector3(-6.8, EYE, -161.6), new THREE.Vector3(-10.4, EYE, -161.6)];   // pergola side, annex side of the south-west gap
const texLoader = new THREE.TextureLoader(); texLoader.setCrossOrigin('anonymous');
function makeSlot(sp, room) {
  const g = new THREE.Group(); g.position.set(sp.x, GY, sp.z); g.rotation.y = Math.atan2(sp.n[0], sp.n[1]);
  box(1.8, 2.3, 0.14, M.white, 0, 1.15, 0, g); box(1.92, 0.3, 0.24, M.stone, 0, 0.15, 0, g);
  const frame = box(1, 1, 0.05, M.wood, 0, 1.5, 0.085, g);
  const pm = new THREE.MeshBasicMaterial({ color: 0x2a2b2d });
  const pic = add(new THREE.PlaneGeometry(1, 1), pm, 0, 1.5, 0.115, g);
  const fit = (w, h) => { const k = Math.min(1.56 / w, 1.2 / h); pic.scale.set(w * k, h * k, 1); frame.scale.set(w * k + 0.1, h * k + 0.1, 1); };
  fit(3, 2); scene.add(g);
  return { sp, room, g, pm, fit, data: null, want: null };
}
const pergolaSlots = PERGOLA_SPOTS.map((sp) => makeSlot(sp, 0));
const annexSlots = ANNEX_SPOTS.map(() => null);   // built the first time they're needed
let slots = pergolaSlots.slice(), annexCactus = null;   // `slots`: the panels in use, in walking order
const annexOpen = () => slots.length > MIN_PANELS;
function arrangePanels(count) {
  const extra = clamp(count, MIN_PANELS, MAX_PANELS) - MIN_PANELS;
  slots = pergolaSlots.slice();
  ANNEX_SPOTS.forEach((sp, k) => {
    const on = sp.rank < extra;
    if (on && !annexSlots[k]) annexSlots[k] = makeSlot(sp, 1);
    if (annexSlots[k]) annexSlots[k].g.visible = on;
    if (on) slots.push(annexSlots[k]);
  });
  if (annexCactus) annexCactus.visible = !annexOpen();
  if (detour.i >= slots.length) detour.i = 0;
  if (detour.on) aimDetour(reduce);
}
function setPhoto(sl, p) {                        // keeps the current picture if this one fails to load (e.g. a cross-origin refusal)
  if (!sl || !p || !p.src) return;
  sl.want = p.src;
  texLoader.load(p.src, (t) => {
    if (sl.want !== p.src) { t.dispose(); return; }   // a newer photo was asked for while this one loaded
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (sl.pm.map) sl.pm.map.dispose();
    sl.pm.map = t; sl.pm.color.set(0xffffff); sl.pm.needsUpdate = true; sl.fit(t.image.width, t.image.height); sl.data = p;
    if (detour.on && slots[detour.i] === sl) caption();
  }, undefined, () => {});
}
const setPhotos = (list) => {
  list = Array.isArray(list) ? list : [];
  arrangePanels(list.length);
  list.slice(0, slots.length).forEach((p, i) => setPhoto(slots[i], p));
};

const detour = { on: false, i: 0, b: 0, room: 0, scrollY: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), tPos: new THREE.Vector3(), tQuat: new THREE.Quaternion() };
const helper = new THREE.Object3D();
const ui = { panel: document.getElementById('detour'), n: document.getElementById('detour-n'), name: document.getElementById('detour-name'), album: document.getElementById('detour-album'),
  note: document.getElementById('detour-note'), link: document.getElementById('detour-link'), main: document.querySelector('main') };
function caption() {
  if (!ui.panel) return; const p = slots[detour.i].data || {};
  ui.n.textContent = (detour.i + 1) + ' / ' + slots.length; ui.name.textContent = p.title || 'Untitled'; ui.album.textContent = p.album || ''; ui.note.textContent = p.caption || '';
  if (ui.link) { ui.link.href = p.url || 'gallery.html'; if (p.url) { ui.link.target = '_blank'; ui.link.rel = 'noopener noreferrer'; } else { ui.link.removeAttribute('target'); } }
}
// Moves that pass through the south-west gap (between pergola and annex, or out of the annex) and the way back
// to the path are one continuous glide: eased along a smooth curve, so they never stop and restart at a waypoint.
const glide = { on: false, toPath: false, t: 0, u: 0, dur: 2, pts: [], curve: null, q0: new THREE.Quaternion(), q: new THREE.Quaternion(), tq: new THREE.Quaternion() };
const base = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };   // last camera pose before look offsets and shake
function startGlide(pts, toPath) {
  glide.pts = [base.pos.clone(), ...pts]; glide.curve = new THREE.CatmullRomCurve3(glide.pts, false, 'centripetal');
  glide.dur = clamp(1.2 + glide.curve.getLength() / 4, 2, 5.5); glide.t = 0; glide.u = 0;
  glide.q0.copy(base.quat); glide.q.copy(base.quat); glide.toPath = toPath; glide.on = true; detour.b = 1;
}
function stopGlide() {                            // carry on from wherever the glide had got to
  if (!glide.on) return; glide.on = false; detour.pos.copy(base.pos); detour.quat.copy(base.quat); detour.b = 1;
}
const gates = (from, to) => from === to ? [] : to ? [GATE[0].clone(), GATE[1].clone()] : [GATE[1].clone(), GATE[0].clone()];
function aimDetour(snap) {
  const sl = slots[detour.i], sp = sl.sp;
  helper.position.set(sp.x + sp.n[0] * 2.7, EYE, sp.z + sp.n[1] * 2.7); helper.up.set(0, 1, 0); helper.lookAt(sp.x, GY + 0.75, sp.z);   // aim low so the photo sits in the upper half, clear of the caption panel
  helper.rotateY(Math.PI);   // Object3D.lookAt points +Z at the target; cameras look down -Z
  detour.tPos.copy(helper.position); detour.tQuat.copy(helper.quaternion);
  const via = snap ? [] : gates(detour.room, sl.room); detour.room = sl.room;
  stopGlide();
  if (via.length) { startGlide([...via, detour.tPos.clone()], false); glide.tq.copy(detour.tQuat); }
  if (snap) { detour.pos.copy(detour.tPos); detour.quat.copy(detour.tQuat); }
  caption(); lookAt.yawT = 0; lookAt.pitchT = 0;
}
function startDetour() {
  detour.on = true; detour.i = 0; detour.scrollY = window.scrollY;
  if (glide.on) stopGlide();                      // turned back mid-exit: carry on from here
  else { detour.room = 0; detour.pos.copy(DOOR); detour.quat.copy(qPath); }
  aimDetour(reduce);
  if (ui.panel) { ui.panel.hidden = false; ui.main.inert = true; document.documentElement.classList.add('is-detour'); const b = ui.panel.querySelector('[data-detour="next"]'); if (b) b.focus({ preventScroll: true }); }
}
function endDetour() {
  if (!detour.on) return; detour.on = false;
  if (!reduce) {
    const out = DOOR.clone().add(new THREE.Vector3(1.2, 0, 0));   // just outside the door, so the curve leaves square to it
    stopGlide(); startGlide([...gates(detour.room, 0), DOOR.clone(), out, camPos.clone()], true);
  }
  detour.room = 0;
  if (ui.panel) { ui.panel.hidden = true; ui.main.inert = false; document.documentElement.classList.remove('is-detour'); const b = document.querySelector('[data-detour="start"]'); if (b) b.focus({ preventScroll: true }); }
}
const step = (d) => { detour.i = (detour.i + d + slots.length) % slots.length; aimDetour(reduce); };
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-detour]'); if (!b) return;
  const a = b.dataset.detour;
  if (a === 'start') startDetour(); else if (a === 'end') endDetour(); else step(a === 'next' ? 1 : -1);
});
window.__detour = { start: startDetour, end: endDetour, next: () => step(1), panels: () => slots.length };
try { setPhotos(JSON.parse(document.getElementById('garden-photos').textContent)); } catch (_) {}
window.addEventListener('garden:photos', (e) => setPhotos(e.detail));

const qYaw = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
function placeCamera(dt) {
  pose(cur);
  // blend between the path and the gallery viewpoint
  if (glide.on) {
    glide.t += dt; const u = clamp(glide.t / glide.dur, 0, 1);
    if (glide.toPath) { glide.pts[glide.pts.length - 1].copy(camPos); glide.curve.updateArcLengths(); }   // the path camera may move if the page scrolls
    glide.u = u * u * u * (u * (u * 6 - 15) + 10);                                // smootherstep: no jolt at either end
    camera.position.copy(glide.curve.getPointAt(glide.u));
    const r = clamp(u * 1.35, 0, 1);                                              // finish turning a little before arriving
    glide.q.slerpQuaternions(glide.q0, glide.toPath ? qPath : glide.tq, r * r * (3 - 2 * r)); camera.quaternion.copy(glide.q);
    if (u >= 1) { glide.on = false; if (glide.toPath) detour.b = 0; else { detour.pos.copy(camera.position); detour.quat.copy(camera.quaternion); } }
  } else {
    if (detour.on || detour.b > 0) detour.b = reduce ? (detour.on ? 1 : 0) : clamp(detour.b + (detour.on ? 1 : -1) * dt / 1.6, 0, 1);
    if (detour.b > 0) {
      const k = 1 - Math.exp(-dt * 2.4);
      detour.pos.lerp(detour.tPos, reduce ? 1 : k); detour.quat.slerp(detour.tQuat, reduce ? 1 : k);
      const e = detour.b * detour.b * (3 - 2 * detour.b);
      camera.position.lerpVectors(camPos, detour.pos, e);
      camera.quaternion.slerpQuaternions(qPath, detour.quat, e);
    } else camera.quaternion.copy(qPath);
  }
  base.pos.copy(camera.position); base.quat.copy(camera.quaternion);
  // drag-look offsets
  if (!lookAt.drag && time > lookAt.hold) { const k = Math.exp(-dt * 1.3); lookAt.yawT *= k; lookAt.pitchT *= k; }
  const k = reduce ? 1 : 1 - Math.exp(-dt * 10);
  lookAt.yaw += (lookAt.yawT - lookAt.yaw) * k; lookAt.pitch += (lookAt.pitchT - lookAt.pitch) * k;
  camera.quaternion.premultiply(qYaw.setFromAxisAngle(UP, lookAt.yaw)); camera.rotateX(lookAt.pitch);
  if (!reduce) { const s = envNow * envNow * 0.1 * (1 - sstep(0.12, 0.4, P)); camera.position.x += Math.sin(time * 47) * s; camera.position.y += Math.sin(time * 61) * s; }
}

// drop to a lighter mode if the frame rate is poor
let slowFrames = 0, lite = false, emitScale = 1;
function watchdog(rawDt) {
  if (lite || time < 3) return;
  slowFrames = rawDt > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
  if (slowFrames > 90) { lite = true; emitScale = 0.45; renderer.setPixelRatio(1); resize(); }
}

const clock = new THREE.Clock();
function frame() {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05); time += dt; watchdog(raw);
  cur = reduce ? target : cur + (target - cur) * (1 - Math.exp(-dt * 5));
  placeCamera(dt);
  applySky(P);
  dome.position.copy(camera.position); stars.position.copy(camera.position);
  // eruption
  if (time >= nextErupt) { eruptStart = time; nextErupt = time + 20 + Math.random() * 12; }
  const et = time - eruptStart;
  const env = et < 0.35 ? et / 0.35 : et < 1.9 ? 1 : Math.max(0, 1 - (et - 1.9) / 4.6);   // attack, ~1.5 s sustain, long decay
  envNow = env; heat = Math.max(env, heat - dt * 0.11);                                    // glow lingers while the lava cools
  emitIdle += dt * 26 * emitScale; while (emitIdle >= 1) { emitIdle -= 1; spawn(0, 0); }
  emitBig += dt * 640 * emitScale * env * env; while (emitBig >= 1) { emitBig -= 1; spawn(1, env); }
  emitFlow += dt * (env > 0.2 ? 250 * emitScale * env : 0); while (emitFlow >= 1) { emitFlow -= 1; spawn(2, env); }
  for (let i = 0; i < N; i++) {
    if (eLife[i] <= 0) continue;
    const j = i * 3; eLife[i] -= dt;
    if (eLife[i] <= 0) { ePos[j + 1] = -9999; eSize[i] = 0; continue; }
    const st = eDown[i];
    if (st !== 4) {
      eVel[j + 1] -= 16 * dt;
      ePos[j] += eVel[j] * dt; ePos[j + 1] += eVel[j + 1] * dt; ePos[j + 2] += eVel[j + 2] * dt;
      if (eVel[j + 1] < 0 || st === 1) {
        const x = ePos[j], z = ePos[j + 2], g = terrain(x, z);
        if (st === 1) {                                                   // tumbling: pulled downhill, slowed by friction
          const k = 1 - 1.0 * dt;
          eVel[j] = (eVel[j] - (terrain(x + 1.5, z) - g) / 1.5 * 10 * dt) * k; eVel[j + 2] = (eVel[j + 2] - (terrain(x, z + 1.5) - g) / 1.5 * 10 * dt) * k;
        }
        if (ePos[j + 1] < g + 0.3) {
          if (g < 0.3) { eLife[i] = 0; ePos[j + 1] = -9999; eSize[i] = 0; continue; }       // reached the sea
          ePos[j + 1] = g + 0.3;
          if (st === 3) { eDown[i] = 4; eLife[i] = Math.min(eLife[i], 0.9); }                // spatter just sticks and fades
          else {
            if (st === 0) { eVel[j] *= 0.45; eVel[j + 2] *= 0.45; eDown[i] = 1; }
            eVel[j + 1] = (0.6 + Math.random() * 0.5) * (1 + 0.45 * Math.hypot(eVel[j], eVel[j + 2]));   // bounce, bigger when moving fast
          }
        }
      }
    }
    const k = eLife[i] / eMax[i];                                         // white-hot, then orange, then dull red
    eCol[j] = Math.min(1, 0.22 + k * 1.5); eCol[j + 1] = 0.75 * k * k + 0.05; eCol[j + 2] = 0.35 * k * k * k;
    eSize[i] = eBase[i] * (0.55 + 0.45 * k);
  }
  eGeo.attributes.position.needsUpdate = true; eGeo.attributes.aColor.needsUpdate = true; eGeo.attributes.aSize.needsUpdate = true;
  craterGlow.scale.setScalar(46 + 8 * Math.sin(time * 2.3) + 300 * heat);
  puffAcc += dt * (env > 0.2 ? 9 : 0.7);
  if (puffAcc >= 1) {
    puffAcc = 0; const sp = puffs[puffNext]; puffNext = (puffNext + 1) % puffs.length; const big = env > 0.2;
    sp.position.set(crater.x + (Math.random() - 0.5) * 10, crater.y + 3, crater.z + (Math.random() - 0.5) * 10);
    sp.userData.age = 0; sp.userData.life = big ? 12 + Math.random() * 6 : 6; sp.userData.s = big ? 1 : 0.4;
    sp.userData.v.set(2.5 + Math.random() * 3, big ? 13 + Math.random() * 11 : 4, -2);
  }
  puffs.forEach((sp) => {
    const u = sp.userData; u.age += dt; if (u.age >= u.life) { sp.material.opacity = 0; return; }
    u.v.y *= 1 - 0.16 * dt; sp.position.addScaledVector(u.v, dt);
    const k = u.age / u.life; sp.scale.setScalar((18 + u.age * 11) * u.s);
    sp.material.opacity = 0.6 * u.s * Math.sin(Math.PI * Math.sqrt(k)); sp.material.color.copy(smokeCol);
  });
  foams.forEach((f, i) => { const p = (time * 0.35 + i * 0.5) % 1; f.position.z = -229.5 + p * 4.5; f.material.opacity = 0.75 * Math.sin(p * Math.PI); });
  // ruler
  if (alt) { alt.textContent = String(Math.round(924 * (1 - P))).padStart(3, '0') + ' m'; mark.style.top = (cur * 100).toFixed(2) + '%'; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
resize();
frame();
