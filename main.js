// VALLEY — Chapter I: The Silent Spire
// A Monument Valley tribute built with Three.js.
// Journey: start isle → plaza → grand stairs → ride the rotating bridge →
// teal portal → high catwalk → align the rotating staircase → golden shrine.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- palette
const PAL = {
  skyTop: '#ffdfae', skyMid: '#f6b3a0', skyLow: '#d795bd', skyBot: '#a982c8',
  fog: 0xe2a3b3,
  depthTint: 0xc595cb,
  stoneA: 0xf2d8b4,      // cream
  stoneB: 0xeab9a0,      // terracotta
  stoneC: 0xf6e6cb,      // pale
  accent: 0x3fbfae,      // teal — rotor 1 / portals
  accentDeep: 0x2e7d8f,
  rose: 0xe1849a,        // rose — rotor 2
  roseDeep: 0xc2667f,
  wood: 0xd08a6e,
  rotor: 0xf6e4bf,
  dark: 0x3a2b52,
  cloud: 0xfff0e2,
  glow: 0xffe2a0,
  doorGlow: 0x9af2de,    // teal portal light
  goalGlow: 0xffd27a,    // golden goal light
  tree: 0xf2a0b5,
};
const GRAD_LO = -13, GRAD_HI = 10;
const HALF_PI = Math.PI / 2;
const USE_GTAO = true;

const deg = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 40, 96);

{
  const c = document.createElement('canvas'); c.width = 2; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, PAL.skyTop);
  g.addColorStop(0.45, PAL.skyMid);
  g.addColorStop(0.75, PAL.skyLow);
  g.addColorStop(1.00, PAL.skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

// ---------------------------------------------------------------- camera
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 160);
const FINAL_TARGET = new THREE.Vector3(-1.4, 3.2, -1.8);
const view = {
  az: deg(45), el: deg(32), zoom: 1,
  target: FINAL_TARGET.clone(),
  panX: 0, panY: 0,
};
const CAM_DIST = 52;
function applyCamera() {
  const aspect = innerWidth / innerHeight;
  const halfH = Math.max(9.3, 11.8 / aspect) / view.zoom;
  cam.left = -halfH * aspect; cam.right = halfH * aspect;
  cam.top = halfH; cam.bottom = -halfH;
  const ce = Math.cos(view.el), se = Math.sin(view.el);
  cam.position.set(
    view.target.x + CAM_DIST * ce * Math.sin(view.az),
    view.target.y + CAM_DIST * se,
    view.target.z + CAM_DIST * ce * Math.cos(view.az),
  );
  cam.lookAt(view.target);
  cam.translateX(view.panX);
  cam.translateY(view.panY);
  cam.updateProjectionMatrix();
}
applyCamera();

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0xffead2, 0xc993c9, 0.95));

const sun = new THREE.DirectionalLight(0xffe3bc, 2.7);
sun.position.set(26, 10, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 100;
sun.shadow.bias = 0.00025;
sun.shadow.normalBias = 0.05;
const sunTarget = new THREE.Object3D(); sunTarget.position.set(-1, 0, -1);
scene.add(sunTarget); sun.target = sunTarget;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x9fbce8, 0.55);
fill.position.set(-18, 9, -7);
scene.add(fill);

const doorLight = new THREE.PointLight(PAL.doorGlow, 14, 9, 1.8);    // lower portal
doorLight.position.set(-8, 5.2, -2.4);
scene.add(doorLight);
const doorLight2 = new THREE.PointLight(PAL.doorGlow, 10, 8, 1.8);   // upper portal
doorLight2.position.set(-5.6, 6.1, -5);
scene.add(doorLight2);
const shrineLight = new THREE.PointLight(PAL.goalGlow, 12, 9, 1.8);  // golden shrine
shrineLight.position.set(1, 6.9, -4.4);
scene.add(shrineLight);

const lanternLight = new THREE.PointLight(PAL.glow, 4, 5, 1.8);
lanternLight.position.set(1, 0.8, 1);
scene.add(lanternLight);

// ---------------------------------------------------------------- geometry helpers
function paint(geo, hex, opts = {}) {
  const base = new THREE.Color(hex);
  const low = new THREE.Color(PAL.depthTint);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  const yOff = opts.yOff || 0;
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    let f;
    if (opts.smooth) f = 0.76 + 0.26 * Math.max(ny, 0) + 0.06 * nx;
    else if (ny > 0.5) f = 1.0;
    else if (ny < -0.5) f = 0.52;
    else if (Math.abs(nx) > Math.abs(nz)) f = nx > 0 ? 0.88 : 0.62;
    else f = nz > 0 ? 0.8 : 0.68;
    f *= opts.boost || 1;
    const t = clamp(((pos.getY(i) + yOff) - GRAD_LO) / (GRAD_HI - GRAD_LO), 0, 1);
    tmp.copy(base).multiplyScalar(f);
    tmp.lerp(low, Math.pow(1 - t, 1.7) * (opts.fade !== undefined ? opts.fade : 0.7));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
function pbox(w, h, d, x, y, z, color, opts) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color, opts);
}
function pcyl(rt, rb, h, seg, x, y, z, color, opts = {}) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (opts.rotY) g.rotateY(opts.rotY);
  g.translate(x, y, z);
  return paint(g, color, { smooth: seg > 6, ...opts });
}
function psphere(r, x, y, z, sx, sy, sz, color, opts = {}) {
  const g = new THREE.SphereGeometry(r, 18, 12);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color, { smooth: true, ...opts });
}

// ---------------------------------------------------------------- static level
const staticGeos = [];
const S = (g) => staticGeos.push(g);

// --- start island (tiles x6..8, z-1..1, y0)
S(pbox(3, 1, 3, 7, -0.5, 0, PAL.stoneC));
S(pbox(3.4, 0.45, 3.4, 7, -1.15, 0, PAL.stoneB));
S(pbox(2.3, 1.5, 2.3, 7, -2.1, 0, PAL.stoneB));
S(pbox(1.5, 1.7, 1.5, 7, -3.6, 0, PAL.stoneB));
S(pcyl(0.95, 0.06, 1.9, 4, 7, -5.3, 0, PAL.stoneB, { rotY: Math.PI / 4, smooth: false }));

// --- bridge (tiles (4,0,0),(5,0,0))
S(pbox(2, 0.3, 1, 4.5, -0.15, 0, PAL.stoneC));
S(pbox(2.1, 0.14, 1.08, 4.5, -0.36, 0, PAL.accent));
S(pbox(0.16, 0.55, 0.16, 3.6, -0.6, 0.38, PAL.wood));
S(pbox(0.16, 0.55, 0.16, 3.6, -0.6, -0.38, PAL.wood));
S(pbox(0.16, 0.55, 0.16, 5.4, -0.6, 0.38, PAL.wood));
S(pbox(0.16, 0.55, 0.16, 5.4, -0.6, -0.38, PAL.wood));

// --- main tower (footprint x.5..3.5, z-1.5..1.5, plaza on top at y0)
S(pbox(3, 15, 3, 2, -7.5, 0, PAL.stoneA));
S(pbox(3.5, 0.5, 3.5, 2, -0.55, 0, PAL.stoneC));
S(pbox(3.34, 0.55, 3.34, 2, -4, 0, PAL.accentDeep));
S(pbox(3.34, 0.55, 3.34, 2, -8.5, 0, PAL.stoneB));
S(pbox(1.2, 2.2, 0.26, 2, -2.5, 1.42, PAL.dark, { fade: 0.35 }));
S(pbox(1.5, 0.3, 0.3, 2, -1.32, 1.44, PAL.accent));

// --- grand staircase (tiles (0,1,0) → (-3,4,0), climbing -x)
function stairs(x, yTop, z, dx, dz, color) {
  for (let i = 0; i < 4; i++) {
    const off = -0.5 + (i + 0.5) * 0.25;
    const h = (i + 1) * 0.25;
    S(pbox(dx !== 0 ? 0.25 : 1, h, dz !== 0 ? 0.25 : 1,
      x + dx * off, yTop - 1 + h / 2, z + dz * off, color));
  }
  S(pbox(1, 1.0, 1, x, yTop - 1.5, z, color));
}
stairs(0, 1, 0, -1, 0, PAL.stoneC);
stairs(-1, 2, 0, -1, 0, PAL.stoneC);
stairs(-2, 3, 0, -1, 0, PAL.stoneC);
stairs(-3, 4, 0, -1, 0, PAL.stoneC);

// --- west balcony (tiles (-4,4,0), (-5,4,-1..1))
S(pbox(1, 0.95, 1, -4, 3.52, 0, PAL.stoneC));
S(pbox(1, 0.95, 3, -5, 3.52, 0, PAL.stoneC));
S(pbox(1.18, 0.34, 3.18, -5, 2.92, 0, PAL.accent));
S(pbox(0.85, 14, 0.85, -5, -4.3, 0, PAL.stoneA));
S(pbox(1.15, 0.4, 1.15, -5, 2.62, 0, PAL.stoneB));

// --- rotor 1 axle pillar
S(pbox(0.95, 15.5, 0.95, -8, -4.75, 0, PAL.stoneB));
S(pbox(1.35, 0.42, 1.35, -8, 2.95, 0, PAL.accentDeep));
S(pbox(1.6, 0.42, 1.6, -8, -2, 0, PAL.stoneA));

// --- door tower (footprint x-9.5..-6.5, z-6.5..-3.5, top y7)
S(pbox(3, 23, 3, -8, -4.5, -5, PAL.stoneB));
S(pbox(3.44, 0.5, 3.44, -8, 6.6, -5, PAL.stoneC));
S(pbox(3.3, 0.5, 3.3, -8, 5.9, -5, PAL.accentDeep));
S(pbox(3.34, 0.55, 3.34, -8, 0.2, -5, PAL.stoneA));
S(pbox(3.2, 0.4, 3.2, -8, 3.3, -5, PAL.stoneA));
S(pbox(3.4, 0.42, 3.4, -8, 7.1, -5, PAL.stoneC));
S(pbox(1.9, 1.5, 1.9, -8, 8.05, -5, PAL.stoneC));
S(pcyl(0.06, 1.55, 1.5, 4, -8, 9.55, -5, PAL.accentDeep, { rotY: Math.PI / 4, smooth: false }));
S(pbox(0.1, 0.7, 0.1, -8, 10.5, -5, PAL.stoneC));

// lower portal door (south face z=-3.5)
S(pbox(1.8, 3.2, 0.2, -8, 5.5, -3.46, PAL.stoneC));
S(pbox(1.3, 2.75, 0.34, -8, 5.33, -3.52, PAL.dark, { fade: 0.25 }));
S(pbox(2.1, 0.32, 0.32, -8, 7.2, -3.45, PAL.accent));
S(pbox(0.96, 0.6, 0.96, -8, 3.7, -3, PAL.stoneC));        // door balcony
S(pbox(0.6, 0.5, 0.6, -8, 3.18, -3.25, PAL.stoneB));

// upper portal door (east face x=-6.5, floor y5)
S(pbox(0.2, 2.7, 1.7, -6.42, 6.3, -5, PAL.stoneC));       // frame
S(pbox(0.4, 2.3, 1.2, -6.55, 6.1, -5, PAL.dark, { fade: 0.25 })); // void
S(pbox(0.32, 0.3, 2.0, -6.4, 7.85, -5, PAL.accent));      // lintel

// --- high catwalk along door tower east face (tiles (-6..-3, 5, -5))
S(pbox(4, 0.5, 1, -4.5, 4.75, -5, PAL.stoneC));
S(pbox(4.1, 0.16, 1.08, -4.5, 4.42, -5, PAL.accent));
S(pbox(0.66, 0.42, 0.66, -6, 4.18, -5, PAL.stoneB));
S(pbox(0.66, 0.42, 0.66, -4.5, 4.18, -5, PAL.stoneB));
S(pbox(0.66, 0.42, 0.66, -3.1, 4.18, -5, PAL.stoneB));

// --- rotor 2 axle pillar
S(pbox(0.9, 19, 0.9, -2, -4.6, -5, PAL.stoneB));
S(pbox(1.25, 0.4, 1.25, -2, 4.7, -5, PAL.roseDeep));
S(pbox(1.5, 0.42, 1.5, -2, -1, -5, PAL.stoneA));

// --- summit tower (footprint x-0.5..2.5, z-6.5..-3.5, plaza top y6)
S(pbox(3, 21, 3, 1, -4.5, -5, PAL.stoneA));
S(pbox(3.5, 0.5, 3.5, 1, 5.45, -5, PAL.stoneC));          // cornice
S(pbox(3.34, 0.5, 3.34, 1, 2.6, -5, PAL.accentDeep));
S(pbox(3.34, 0.55, 3.34, 1, -2.5, -5, PAL.stoneB));
// flying brace to main tower
S(pbox(0.8, 0.7, 2.2, 2, -2.4, -2.6, PAL.stoneB));
S(pbox(0.5, 0.4, 2.2, 2, -1.9, -2.6, PAL.stoneC));

// --- golden shrine on summit north row (covers tiles z=-6)
S(pbox(3, 2.4, 1, 1, 7.2, -6, PAL.stoneB));
S(pbox(3.2, 0.4, 1.2, 1, 8.55, -6, PAL.stoneC));          // cornice
S(pcyl(0.05, 1.15, 1.1, 4, 1, 9.32, -6, PAL.accentDeep, { rotY: Math.PI / 4, smooth: false }));
S(pbox(0.08, 0.5, 0.08, 1, 10.05, -6, PAL.stoneC));
// shrine door (south face z=-5.5)
S(pbox(1.5, 2.2, 0.2, 1, 7.0, -5.46, PAL.stoneC));        // frame
S(pbox(1.1, 1.9, 0.3, 1, 6.93, -5.58, PAL.dark, { fade: 0.25 })); // void
S(pbox(1.8, 0.28, 0.3, 1, 8.2, -5.44, PAL.goalGlow));     // lintel

// --- dial platforms
S(pbox(1.3, 0.55, 1.3, 3, -0.3, 2, PAL.stoneC));          // dial 1 (plaza)
S(pbox(0.7, 0.55, 0.7, 3, -0.85, 2.25, PAL.stoneB));
S(pbox(1.1, 0.55, 1.1, -5, 4.72, -4, PAL.stoneC));        // dial 2 (catwalk)
S(pbox(0.6, 0.45, 0.6, -5, 4.28, -4.25, PAL.stoneB));

// --- trees & lantern
S(pcyl(0.07, 0.1, 0.55, 10, 8, 0.27, -1, PAL.wood));
S(psphere(0.4, 8, 0.85, -1, 1, 0.85, 1, PAL.tree));
S(psphere(0.26, 8.25, 1.12, -0.85, 1, 0.9, 1, PAL.tree, { boost: 1.06 }));
S(psphere(0.2, 7.8, 1.1, -1.15, 1, 0.85, 1, PAL.tree, { boost: 0.95 }));
S(pcyl(0.06, 0.09, 0.5, 10, 2, 6.25, -4, PAL.wood));      // summit tree
S(psphere(0.34, 2, 6.8, -4, 1, 0.85, 1, PAL.tree));
S(psphere(0.2, 2.2, 7.02, -3.85, 1, 0.9, 1, PAL.tree, { boost: 1.06 }));
S(pbox(0.1, 0.6, 0.1, 1, 0.3, 1, PAL.wood));              // lantern post
S(pbox(0.26, 0.07, 0.26, 1, 0.66, 1, PAL.accentDeep));

const staticMesh = new THREE.Mesh(
  BGU.mergeGeometries(staticGeos, false),
  new THREE.MeshLambertMaterial({ vertexColors: true }),
);
staticMesh.castShadow = staticMesh.receiveShadow = true;
scene.add(staticMesh);

// ---------------------------------------------------------------- rotors
// rotor 1 — the long bar (teal), rides like a carousel
const rotor1 = new THREE.Group();
rotor1.position.set(-8, 4, 0);
scene.add(rotor1);
{
  const gs = [];
  const opt = { yOff: 4 };
  gs.push(pbox(0.98, 0.8, 4.84, 0, -0.4, 0, PAL.rotor, opt));
  gs.push(pbox(1.04, 0.68, 0.3, 0, -0.48, 2.3, PAL.accent, opt));
  gs.push(pbox(1.04, 0.68, 0.3, 0, -0.48, -2.3, PAL.accent, opt));
  gs.push(pbox(1.04, 0.08, 1.04, 0, 0.04, 0, PAL.accentDeep, opt));
  gs.push(pcyl(0.42, 0.42, 0.7, 18, 0, -1.05, 0, PAL.accentDeep, opt));
  const m = new THREE.Mesh(BGU.mergeGeometries(gs, false),
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  rotor1.add(m);
}

// rotor 2 — the floating staircase (rose), bridges y5 → y6
const rotor2 = new THREE.Group();
rotor2.position.set(-2, 5, -5);
rotor2.rotation.y = HALF_PI;          // starts misaligned
scene.add(rotor2);
{
  const gs = [];
  const opt = { yOff: 5 };
  for (let i = 0; i < 4; i++) {       // steps rising along local +x
    const h = (i + 1) * 0.25;
    gs.push(pbox(0.25, h, 1, -0.5 + (i + 0.5) * 0.25, h / 2, 0, PAL.rotor, opt));
  }
  gs.push(pbox(0.92, 0.6, 0.92, 0, -0.2, 0, PAL.rotor, opt));      // base
  gs.push(pbox(1.04, 0.16, 1.04, 0, 0.04, 0, PAL.roseDeep, opt));  // base trim
  gs.push(pcyl(0.4, 0.4, 0.6, 18, 0, -0.55, 0, PAL.roseDeep, opt));// hub
  gs.push(pbox(1, 0.4, 1, 1, 0.8, 0, PAL.rotor, opt));             // landing
  gs.push(pbox(1.06, 0.18, 1.06, 1, 0.62, 0, PAL.rose, opt));      // landing trim
  gs.push(pbox(0.26, 0.5, 1.04, -0.4, 0.13, 0, PAL.rose, opt));    // low-end cap
  const m = new THREE.Mesh(BGU.mergeGeometries(gs, false),
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = m.receiveShadow = true;
  rotor2.add(m);
}

// ---------------------------------------------------------------- dials
function makeDial(x, y, z, color, colorDeep, rotorGroup, dir) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  const gs = [];
  gs.push(pcyl(0.44, 0.5, 0.3, 24, 0, 0.15, 0, color, { yOff: y }));
  gs.push(pcyl(0.34, 0.34, 0.08, 24, 0, 0.34, 0, colorDeep, { yOff: y }));
  gs.push(pbox(0.78, 0.1, 0.16, 0, 0.42, 0, PAL.wood, { yOff: y }));
  const knob = new THREE.SphereGeometry(0.07, 12, 8); knob.translate(0.33, 0.46, 0);
  gs.push(paint(knob, PAL.wood, { smooth: true, yOff: y }));
  const drum = new THREE.Mesh(BGU.mergeGeometries(gs, false),
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  drum.castShadow = drum.receiveShadow = true;
  group.add(drum);
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.position.set(0, 0.4, 0);
  group.add(hit);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.66, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  halo.rotation.x = -HALF_PI;
  halo.position.set(0, 0.04, 0);
  group.add(halo);
  return { group, drum, hit, halo, rotor: rotorGroup, dir, angle: rotorGroup.rotation.y, used: false };
}
const dials = [
  makeDial(3, 0, 2, PAL.accent, PAL.accentDeep, rotor1, +1),
  makeDial(-5, 5, -4, PAL.rose, PAL.roseDeep, rotor2, -1),
];

// ---------------------------------------------------------------- emissives
const glowMats = [];
function glowPlane(w, h, x, y, z, color, rotY = 0) {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.96 });
  m.userData = { base: new THREE.Color(color), i: 1.0 };
  glowMats.push(m);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(x, y, z);
  p.rotation.y = rotY;
  scene.add(p);
  return p;
}
// lower portal (faces south +z)
glowPlane(1.06, 2.5, -8, 5.3, -3.32, PAL.doorGlow);
glowPlane(0.62, 1.9, -8, 5.1, -3.3, 0xffffff);
// upper portal (faces east +x)
glowPlane(1.0, 2.1, -6.32, 6.15, -5, PAL.doorGlow, HALF_PI);
glowPlane(0.58, 1.7, -6.3, 6.0, -5, 0xffffff, HALF_PI);
// golden shrine door (faces south +z)
glowPlane(0.9, 1.72, 1, 6.92, -5.42, PAL.goalGlow);
glowPlane(0.5, 1.4, 1, 6.8, -5.4, 0xfff3da);
{ // lantern cube
  const m = new THREE.MeshBasicMaterial({ color: PAL.glow, toneMapped: false });
  m.userData = { base: new THREE.Color(PAL.glow), i: 1.0 };
  glowMats.push(m);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.17), m);
  cube.position.set(1, 0.55, 1);
  scene.add(cube);
}
// finials
for (const [x, y, z] of [[-8, 10.9, -5], [1, 10.35, -6]]) {
  const m = new THREE.MeshBasicMaterial({ color: 0xfff3d8, toneMapped: false });
  m.userData = { base: new THREE.Color(0xfff3d8), i: 1.0 };
  glowMats.push(m);
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), m);
  s.position.set(x, y, z);
  scene.add(s);
}
// moon
const moon = new THREE.Mesh(
  new THREE.CircleGeometry(3.1, 48),
  new THREE.MeshBasicMaterial({ color: 0xfff0dc, toneMapped: false, fog: false, transparent: true, opacity: 0.95 }),
);
moon.position.set(-9, 4, -13);
scene.add(moon);

// birds
const birds = [];
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x8a6b96, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.16, 0.05, 0, 0, 0, 0, -0.32, 0, 0,
      0.16, 0.05, 0, 0, 0, 0, 0.32, 0, 0,
    ]), 3));
    const b = new THREE.Mesh(g, mat);
    b.position.set(lerp(-4, 10, Math.random()), lerp(6, 10, Math.random()), lerp(-14, -8, Math.random()));
    scene.add(b);
    birds.push({ b, v: 0.25 + Math.random() * 0.3, phase: Math.random() * 6 });
  }
}

// ---------------------------------------------------------------- clouds
const clouds = [];
function makeCloud(x, y, z, s, speed) {
  const gs = [];
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const r = (0.7 + Math.random() * 0.9) * s;
    gs.push(new THREE.SphereGeometry(r, 14, 10)
      .scale(1, 0.32 + Math.random() * 0.12, 0.65)
      .translate((i - (n - 1) / 2) * r * 1.1, Math.random() * 0.15 * s, (Math.random() - 0.5) * 0.7 * s));
  }
  const g = BGU.mergeGeometries(gs, false);
  paint(g, PAL.cloud, { smooth: true, fade: 0.45, yOff: y });
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  clouds.push({ m, speed, baseY: y, phase: Math.random() * 6.28 });
  return m;
}
makeCloud(-2, -4.2, 4, 1.5, 0.32);
makeCloud(6, -5.5, -4, 1.9, 0.2);
makeCloud(-11, -6, 4, 1.7, 0.26);
makeCloud(-14, -3.8, -3, 1.2, 0.38);
makeCloud(3, -7, 6, 2.2, 0.16);
makeCloud(11, -4.5, 2, 1.3, 0.3);
makeCloud(-5, -8, -8, 2.4, 0.13);
makeCloud(13, -7.5, -7, 2.0, 0.18);
makeCloud(-18, -7, 1, 1.8, 0.22);
makeCloud(0, -10, 0, 2.8, 0.1);
makeCloud(-9, 7.5, -16, 1.0, 0.12);
makeCloud(7, 9, -18, 1.2, 0.1);
makeCloud(-4, 8.6, -13, 0.9, 0.14);

// ---------------------------------------------------------------- dust motes
let motes;
{
  const N = 48;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = lerp(-11, 8, Math.random());
    pos[i * 3 + 1] = lerp(-2, 9, Math.random());
    pos[i * 3 + 2] = lerp(-7, 3, Math.random());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  motes = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xfff2e0, size: 2.4, sizeAttenuation: false,
    transparent: true, opacity: 0.38, depthWrite: false,
  }));
  scene.add(motes);
}

// ---------------------------------------------------------------- walk graph
const nodes = [];
const proxies = [];
const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const proxyGeo = new THREE.BoxGeometry(1, 0.5, 1);

function addNode(x, y, z, opts = {}) {
  const n = {
    id: opts.id || `n${x}_${y}_${z}`,
    kind: (opts.stair || opts.stairLocal) ? 'stair' : 'flat',
    dir: opts.stair || null,
    localDir: opts.stairLocal || null,
    rotor: opts.rotor || null,
    local: opts.local || null,
    pos: new THREE.Vector3(x, y, z),
    portal: opts.portal || null,
    goal: !!opts.goal,
  };
  const proxy = new THREE.Mesh(opts.proxyGeo || proxyGeo, proxyMat);
  if (n.rotor) { proxy.position.copy(n.local); n.rotor.add(proxy); }
  else { proxy.position.copy(opts.proxyPos || n.pos); scene.add(proxy); }
  proxy.userData.node = n;
  n.proxy = proxy;
  proxies.push(proxy);
  nodes.push(n);
  return n;
}

// start island (minus tree corner)
for (let x = 6; x <= 8; x++) for (let z = -1; z <= 1; z++)
  if (!(x === 8 && z === -1)) addNode(x, 0, z);
// bridge
addNode(5, 0, 0); addNode(4, 0, 0);
// plaza (minus lantern corner)
for (let x = 1; x <= 3; x++) for (let z = -1; z <= 1; z++)
  if (!(x === 1 && z === 1)) addNode(x, 0, z);
// grand staircase
const W = new THREE.Vector3(-1, 0, 0);
addNode(0, 0.5, 0, { stair: W }); addNode(-1, 1.5, 0, { stair: W });
addNode(-2, 2.5, 0, { stair: W }); addNode(-3, 3.5, 0, { stair: W });
// west balcony
addNode(-4, 4, 0); addNode(-5, 4, -1); addNode(-5, 4, 0); addNode(-5, 4, 1);
// rotor 1 bar
for (let lz = -2; lz <= 2; lz++)
  addNode(-8, 4, lz, { id: `r${lz + 2}`, rotor: rotor1, local: new THREE.Vector3(0, 0, lz) });
// door balcony + lower portal (inside the teal door)
addNode(-8, 4, -3);
addNode(-8, 4, -4, {
  id: 'pLow', portal: 'pUp',
  proxyGeo: new THREE.BoxGeometry(1.15, 2.1, 0.6),
  proxyPos: new THREE.Vector3(-8, 5.15, -3.4),
});
// high catwalk
addNode(-6, 5, -5); addNode(-5, 5, -5); addNode(-4, 5, -5); addNode(-3, 5, -5);
// upper portal (inside the upper teal door)
addNode(-7, 5, -5, {
  id: 'pUp', portal: 'pLow',
  proxyGeo: new THREE.BoxGeometry(0.6, 2.0, 1.2),
  proxyPos: new THREE.Vector3(-6.35, 6.1, -5),
});
// rotor 2 — stair + landing
addNode(-2, 5.5, -5, { id: 'r2s', rotor: rotor2, local: new THREE.Vector3(0, 0.5, 0), stairLocal: new THREE.Vector3(1, 0, 0) });
addNode(-1, 6, -5, { id: 'r2l', rotor: rotor2, local: new THREE.Vector3(1, 1, 0) });
// summit plaza (minus tree corner (2,6,-4))
addNode(0, 6, -5); addNode(1, 6, -5); addNode(2, 6, -5);
addNode(0, 6, -4); addNode(1, 6, -4);
// the golden door
addNode(1, 6, -6, {
  id: 'goal', goal: true,
  proxyGeo: new THREE.BoxGeometry(1.0, 1.7, 0.5),
  proxyPos: new THREE.Vector3(1, 6.85, -5.4),
});

const startNode = nodes.find(n => n.id === 'n7_0_0');
const byId = id => nodes.find(n => n.id === id);

function portsOf(n) {
  const p = n.pos;
  if (n.kind === 'stair') {
    return [
      [p.x + n.dir.x * 0.5, p.y + 0.5, p.z + n.dir.z * 0.5],
      [p.x - n.dir.x * 0.5, p.y - 0.5, p.z - n.dir.z * 0.5],
    ];
  }
  return [
    [p.x + 0.5, p.y, p.z], [p.x - 0.5, p.y, p.z],
    [p.x, p.y, p.z + 0.5], [p.x, p.y, p.z - 0.5],
  ];
}

let adj = new Map();
const _v = new THREE.Vector3();
function updateGraph() {
  rotor1.updateMatrixWorld(true);
  rotor2.updateMatrixWorld(true);
  for (const n of nodes) {
    if (n.rotor) {
      _v.copy(n.local);
      n.rotor.localToWorld(_v);
      n.pos.set(Math.round(_v.x * 2) / 2, Math.round(_v.y * 2) / 2, Math.round(_v.z * 2) / 2);
      if (n.localDir) {
        n.dir = n.localDir.clone().applyQuaternion(n.rotor.quaternion);
        n.dir.set(Math.round(n.dir.x), Math.round(n.dir.y), Math.round(n.dir.z));
      }
    }
  }
  const portMap = new Map();
  adj = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) {
    for (const p of portsOf(n)) {
      const key = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)},${Math.round(p[2] * 2)}`;
      if (!portMap.has(key)) portMap.set(key, []);
      portMap.get(key).push(n);
    }
  }
  for (const list of portMap.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      adj.get(list[i].id).push(list[j]);
      adj.get(list[j].id).push(list[i]);
    }
  }
}
updateGraph();

function findPath(from, to) {
  if (from === to) return null;
  const prev = new Map([[from.id, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) {
      const path = [];
      for (let n = to; n; n = prev.get(n.id)) path.unshift(n);
      return path;
    }
    for (const nb of adj.get(cur.id)) {
      if (!prev.has(nb.id)) { prev.set(nb.id, cur); q.push(nb); }
    }
  }
  return null;
}

// ---------------------------------------------------------------- sound
let AC = null;
function tone(f, t0 = 0, dur = 0.5, vol = 0.07, type = 'sine') {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f;
    const T = AC.currentTime + t0;
    g.gain.setValueAtTime(0, T);
    g.gain.linearRampToValueAtTime(vol, T + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, T + dur);
    o.connect(g).connect(AC.destination);
    o.start(T); o.stop(T + dur + 0.05);
  } catch (e) { /* audio is optional */ }
}
const sfx = {
  walk: () => tone(740, 0, 0.1, 0.014),
  dial: () => { tone(330, 0, 0.35, 0.05, 'triangle'); tone(440, 0.08, 0.4, 0.05, 'triangle'); },
  settle: () => tone(294, 0, 0.55, 0.04),
  portal: () => { tone(294, 0, 0.7, 0.045); tone(440, 0.09, 0.7, 0.045); tone(587, 0.18, 0.9, 0.045); },
  win: () => { [294, 370, 440, 587, 740].forEach((f, i) => tone(f, i * 0.13, 0.9, 0.05, 'triangle')); tone(147, 0, 2.2, 0.045); },
};

// ---------------------------------------------------------------- character
const char = new THREE.Group();
const charBody = new THREE.Group();
char.add(charBody);
const charMat = new THREE.MeshLambertMaterial({ color: 0xfffcf5, emissive: 0x564537, transparent: true });
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.21, 0.46, 24), charMat);
  body.position.y = 0.23;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), charMat);
  head.position.y = 0.57;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.28, 24), charMat);
  hat.position.y = 0.75;
  for (const m of [body, head, hat]) { m.castShadow = true; charBody.add(m); }
}
char.scale.setScalar(1.12);
char.position.copy(startNode.pos);
char.rotation.y = Math.atan2(-1, 0);
scene.add(char);

// ---------------------------------------------------------------- markers
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.3, 0.4, 36),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
);
marker.rotation.x = -HALF_PI;
scene.add(marker);
let markerAnim = null;
function showMarker(pos, ok) {
  marker.position.set(pos.x, pos.y + 0.04, pos.z);
  marker.material.color.set(ok ? 0xffffff : 0xd98f9c);
  markerAnim = { t: 0 };
}

// ---------------------------------------------------------------- state / tweens
const state = {
  phase: 'intro',       // intro | play | ending
  rotating: false,
  teleporting: false,
  upperReached: false,
};
const tweens = [];
function tween(dur, fn, done, ease) {
  tweens.push({ t: 0, dur, fn, done, ease: ease || (k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
}
function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = tw.ease(clamp(tw.t / tw.dur, 0, 1));
    tw.fn(k);
    if (tw.t >= tw.dur) { tweens.splice(i, 1); tw.done && tw.done(); }
  }
}

// ---------------------------------------------------------------- walking
const SPEED = 2.3;
const walker = { node: startNode, path: [], seg: 0, t: 0, pending: null, pendingDial: null, phase: 0 };
const _from = new THREE.Vector3(), _to = new THREE.Vector3();

function busy() { return state.rotating || state.teleporting; }

function requestWalk(target) {
  if (state.phase !== 'play' || busy()) return;
  if (target === walker.node) { showMarker(target.pos, true); return; }
  if (walker.path.length) { walker.pending = target; showMarker(target.pos, true); return; }
  startWalk(target, true);
}
function startWalk(target, click) {
  const p = findPath(walker.node, target);
  if (!p) { showMarker(target.pos, false); return; }
  walker.path = p; walker.seg = 0; walker.t = 0;
  if (click) { showMarker(target.pos, true); sfx.walk(); }
}

function doTeleport(n) {
  state.teleporting = true;
  charMat.opacity = 0;
  sfx.portal();
  if (n.portal === 'pUp') state.upperReached = true;
  tween(0.65, () => {}, () => {
    const pair = byId(n.portal);
    walker.node = pair;
    char.position.copy(pair.pos);
    state.teleporting = false;
    const nb = adj.get(pair.id)[0];
    if (nb) startWalk(nb, false);     // step out of the door, fading back in
  });
}

function stepWalker(dt) {
  if (!walker.path.length) {
    charBody.position.y = Math.sin(simTime * 1.4) * 0.012;
    return;
  }
  const a = walker.path[walker.seg], b = walker.path[walker.seg + 1];
  _from.copy(a.pos); _to.copy(b.pos);
  const dist = _from.distanceTo(_to);
  walker.t += dt * SPEED / dist;
  const ang = Math.atan2(_to.x - _from.x, _to.z - _from.z);
  let d = ang - char.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  char.rotation.y += d * Math.min(1, dt * 10);
  // fading at doors
  if (b.portal || b.goal) charMat.opacity = clamp(1 - walker.t * 1.5, 0, 1);
  else if (a.portal) charMat.opacity = clamp(walker.t * 1.5, 0, 1);

  if (walker.t >= 1) {
    walker.seg++; walker.node = b; walker.t = 0;
    char.position.copy(b.pos);
    if (b.goal) { walker.path = []; win(); return; }
    if (b.portal) { walker.path = []; doTeleport(b); return; }
    if (walker.seg >= walker.path.length - 1) {
      walker.path = [];
      if (walker.pendingDial !== null) { const i = walker.pendingDial; walker.pendingDial = null; tapDial(i); }
    } else if (walker.pending) {
      const t2 = walker.pending; walker.pending = null; walker.path = [];
      startWalk(t2, false);
    }
  } else {
    char.position.lerpVectors(_from, _to, walker.t);
  }
  walker.phase += dt * 11;
  charBody.position.y = Math.abs(Math.sin(walker.phase)) * 0.045;
  charBody.rotation.z = Math.sin(walker.phase) * 0.05;
}

// ---------------------------------------------------------------- rotation
function tapDial(i) {
  if (state.phase !== 'play' || busy()) return;
  if (walker.path.length) { walker.pendingDial = i; return; }
  const dl = dials[i];
  state.rotating = true;
  dl.used = true;
  sfx.dial();
  const onRotor = walker.node.rotor === dl.rotor;
  if (onRotor) dl.rotor.attach(char);
  const a0 = dl.angle;
  dl.angle += dl.dir * HALF_PI;
  tween(1.15, k => {
    dl.rotor.rotation.y = a0 + k * dl.dir * HALF_PI;
    dl.drum.rotation.y = -(a0 + k * dl.dir * HALF_PI) * 2;
  }, () => {
    dl.rotor.rotation.y = dl.angle;
    if (onRotor) {
      scene.attach(char);
      char.rotation.x = char.rotation.z = 0;
    }
    updateGraph();
    if (onRotor) char.position.copy(walker.node.pos);
    state.rotating = false;
    sfx.settle();
  });
}

// ---------------------------------------------------------------- input
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownAt = null;
const dialHits = dials.map(d => d.hit);
const occluders = [staticMesh, rotor1.children[0], rotor2.children[0]];

addEventListener('pointerdown', e => { pointerDownAt = [e.clientX, e.clientY]; });
addEventListener('pointerup', e => {
  if (!pointerDownAt) return;
  const dx = e.clientX - pointerDownAt[0], dy = e.clientY - pointerDownAt[1];
  pointerDownAt = null;
  if (dx * dx + dy * dy > 64) return;
  if (state.phase === 'intro') { intro.skip = true; return; }
  if (state.phase !== 'play') return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, cam);
  const hits = raycaster.intersectObjects([...dialHits, ...proxies, ...occluders], false);
  if (!hits.length) return;
  const first = hits[0].object;
  const di = dialHits.indexOf(first);
  if (di >= 0) { tapDial(di); return; }
  if (first.userData.node) requestWalk(first.userData.node);
});
const mouseN = { x: 0, y: 0 };
addEventListener('pointermove', e => {
  mouseN.x = (e.clientX / innerWidth) * 2 - 1;
  mouseN.y = (e.clientY / innerHeight) * 2 - 1;
  if (state.phase !== 'play' || busy()) { document.body.style.cursor = 'default'; return; }
  pointer.set(mouseN.x, -mouseN.y);
  raycaster.setFromCamera(pointer, cam);
  document.body.style.cursor = raycaster.intersectObjects(dialHits, false).length ? 'pointer' : 'default';
});

// ---------------------------------------------------------------- post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
let gtao = null;
if (USE_GTAO) {
  try {
    gtao = new GTAOPass(scene, cam, innerWidth, innerHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 16 });
    composer.addPass(gtao);
  } catch (e) { console.warn('GTAO unavailable', e); }
}
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.27, 0.85, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(.299, .587, .114));
      c = mix(vec3(l), c, 1.13);
      c += (1.0 - smoothstep(0.0, 0.5, l)) * vec3(.045, .018, .06);
      float d = distance(vUv, vec2(.5, .46));
      c *= 1.0 - smoothstep(.55, 1.05, d) * .34;
      c += (hash(vUv * 913.7 + fract(uTime) * 7.3) - .5) * .016;
      gl_FragColor = vec4(c, 1.0);
    }`,
};
const gradePass = new ShaderPass(GradeShader);
composer.addPass(gradePass);

// ---------------------------------------------------------------- intro / ending
const $ = id => document.getElementById(id);
const intro = {
  t: 0, dur: 8, skip: false, titleShown: false, titleHidden: false,
  fromAz: deg(74), toAz: deg(45),
  fromEl: deg(6), toEl: deg(32),
  fromZoom: 1.6, toZoom: 1.0,
  fromTarget: new THREE.Vector3(-6.4, 6.2, -4.6),
  toTarget: FINAL_TARGET.clone(),
};
setTimeout(() => { $('veil').style.opacity = '0'; }, 80);

function stepIntro(dt) {
  intro.t += dt * (intro.skip ? 4.5 : 1);
  const k = clamp(intro.t / intro.dur, 0, 1);
  const e = 0.5 - 0.5 * Math.cos(k * Math.PI);
  view.az = lerp(intro.fromAz, intro.toAz, e);
  view.el = lerp(intro.fromEl, intro.toEl, e);
  view.zoom = lerp(intro.fromZoom, intro.toZoom, e);
  view.target.lerpVectors(intro.fromTarget, intro.toTarget, e);
  if (!intro.titleShown && k > 0.12) { intro.titleShown = true; $('title').style.opacity = '1'; }
  if (!intro.titleHidden && k > 0.72) { intro.titleHidden = true; $('title').style.opacity = '0'; }
  if (k >= 1) {
    state.phase = 'play';
    $('hint').style.opacity = '1';
    setTimeout(() => { $('hint').style.opacity = '0'; }, 9000);
  }
}

function win() {
  state.phase = 'ending';
  document.body.style.cursor = 'default';
  $('hint').style.opacity = '0';
  sfx.win();
  tween(1.4, k => { bloom.strength = 0.27 + k * 0.95; }, () => {
    tween(2.5, k => { bloom.strength = 1.22 - k * 0.74; });
  });
  tween(0.9, k => { shrineLight.intensity = 12 + k * 34; });
  setTimeout(() => { const e = $('end'); e.style.opacity = '1'; e.classList.add('show'); }, 1600);
  const az0 = view.az, el0 = view.el, z0 = view.zoom;
  const t0 = view.target.clone(), t1 = new THREE.Vector3(-1.8, 3.7, -2.2);
  tween(9, k => {
    view.az = az0 - k * deg(7);
    view.el = el0 + k * deg(3);
    view.zoom = z0 - k * 0.18;
    view.target.lerpVectors(t0, t1, k);
  }, null, k => 1 - Math.pow(1 - k, 2));
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let simTime = 0;

function animate() {
  step(Math.min(clock.getDelta(), 0.05));
}
function step(dt) {
  simTime += dt;
  const t = simTime;

  stepTweens(dt);
  if (state.phase === 'intro') stepIntro(dt);
  if (state.phase === 'play') stepWalker(dt);

  for (const c of clouds) {
    c.m.position.x += c.speed * dt;
    if (c.m.position.x > 36) c.m.position.x = -36;
    c.m.position.y = c.baseY + Math.sin(t * 0.3 + c.phase) * 0.18;
  }
  {
    const p = motes.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.12;
      if (y > 9.5) y = -2;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.5 + i * 1.7) * dt * 0.06);
    }
    p.needsUpdate = true;
  }
  for (const bd of birds) {
    bd.b.position.x += bd.v * dt;
    bd.b.position.y += Math.sin(t * 2 + bd.phase) * dt * 0.3;
    if (bd.b.position.x > 14) bd.b.position.x = -8;
    const flap = Math.sin(t * 7 + bd.phase) * 0.6;
    bd.b.scale.y = 0.4 + Math.abs(flap);
    bd.b.quaternion.copy(cam.quaternion);
  }
  // glow pulse
  const pulse = 1 + Math.sin(t * 2.1) * 0.12;
  for (const m of glowMats) m.color.copy(m.userData.base).multiplyScalar(m.userData.i * pulse);
  doorLight.intensity = Math.max(doorLight.intensity * 0.97, 14 * pulse);
  // dial halos: dial 1 until first use; dial 2 once the upper level is reached
  const haloOn = [
    state.phase === 'play' && !dials[0].used,
    state.phase === 'play' && state.upperReached && !dials[1].used,
  ];
  dials.forEach((dl, i) => {
    if (haloOn[i]) {
      dl.halo.material.opacity = 0.35 + Math.sin(t * 3) * 0.25;
      dl.halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    } else if (dl.halo.material.opacity > 0) dl.halo.material.opacity *= 0.92;
  });
  if (markerAnim) {
    markerAnim.t += dt * 1.8;
    if (markerAnim.t >= 1) { markerAnim = null; marker.material.opacity = 0; }
    else {
      marker.material.opacity = 0.85 * (1 - markerAnim.t);
      marker.scale.setScalar(0.7 + markerAnim.t * 0.9);
    }
  }
  if (state.phase !== 'intro') {
    view.panX = lerp(view.panX, mouseN.x * 0.45, dt * 2.5);
    view.panY = lerp(view.panY, -mouseN.y * 0.28, dt * 2.5);
  }
  moon.quaternion.copy(cam.quaternion);
  applyCamera();
  gradePass.uniforms.uTime.value = t;
  composer.render();
}
renderer.setAnimationLoop(animate);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  applyCamera();
});

// ---------------------------------------------------------------- debug api
window.game = {
  state, view, nodes, walker, intro, bloom, gtao, sun, moon, step, cam, dials,
  walkTo: id => { const n = byId(id); if (n) requestWalk(n); },
  tapDial,
  skipIntro: () => { intro.skip = true; },
  adj: () => adj,
};
