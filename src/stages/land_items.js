import * as THREE from 'three';
import { instance, uniqueMaterials } from '../assets.js';
import { FONT, textPanel } from '../ui.js';

export const BINS = [
  { cat: 'plastic', name: '플라스틱', color: '#f39c12', icon: '🧴' },
  { cat: 'can', name: '캔', color: '#e74c3c', icon: '🥫' },
  { cat: 'paper', name: '종이', color: '#3498db', icon: '📦' },
  { cat: 'glass', name: '유리병', color: '#27ae60', icon: '🍾' },
  { cat: 'vinyl', name: '비닐', color: '#9b59b6', icon: '🛍️' },
];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function bottleProfile(scale = 1) {
  const pts = [[0, 0], [0.03, 0.002], [0.034, 0.01], [0.034, 0.15], [0.03, 0.175], [0.016, 0.205], [0.0135, 0.215], [0.0135, 0.23]];
  return pts.map(([r, y]) => new THREE.Vector2(r * scale, y * scale));
}

const clearPlastic = () => new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });

function drinkCan({ base = '#d62828', text = 'SODA', gold = false } = {}) {
  const label = canvasTex(512, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (gold) { grd.addColorStop(0, '#fff3b0'); grd.addColorStop(0.5, '#e0b12c'); grd.addColorStop(1, '#a87a10'); } else { grd.addColorStop(0, base); grd.addColorStop(1, '#5a0d0d'); }
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = gold ? '#fffbe0' : '#ffffff';
    g.font = `900 110px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w * 0.3, h / 2); g.fillText(text, w * 0.8, h / 2);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, h * 0.12, w, 8); g.fillRect(0, h * 0.86, w, 8);
  });
  const side = new THREE.MeshStandardMaterial({ map: label, metalness: gold ? 1 : 0.85, roughness: gold ? 0.18 : 0.32, emissive: gold ? 0x332200 : 0x000000 });
  const top = new THREE.MeshStandardMaterial({ color: gold ? 0xf3cf55 : 0xcfd3d6, metalness: 1, roughness: 0.25 });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.145, 32), [side, top, top]);
  m.position.y = 0.0725;
  const g = new THREE.Group(); g.add(m);
  return g;
}

function newspaper() {
  const tex = canvasTex(512, 360, (g, w, h) => {
    g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#222'; g.font = `900 52px ${FONT}`; g.textAlign = 'center'; g.fillText('환경신문', w / 2, 60);
    g.fillRect(20, 78, w - 40, 4);
    g.fillStyle = '#9fb6a0'; g.fillRect(24, 96, 200, 130);
    g.fillStyle = '#777';
    for (let col = 0; col < 2; col++) for (let i = 0; i < 12; i++) g.fillRect(col ? 250 : 24, (col ? 100 : 240) + i * 18, col ? 236 : 200, 7);
  });
  const mat = [new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0xe8e4da }), new THREE.MeshStandardMaterial({ color: 0xe8e4da })];
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.022, 0.21), mat);
  m.position.y = 0.011;
  const g = new THREE.Group(); g.add(m); return g;
}

function snackBag() {
  const geo = new THREE.BoxGeometry(0.17, 0.24, 0.06, 12, 16, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.085, y = p.getY(i) / 0.12;
    const puff = (1 - Math.pow(Math.abs(x), 4)) * (1 - Math.pow(Math.abs(y), 6));
    p.setZ(i, p.getZ(i) * Math.max(0.08, puff));
    if (Math.abs(y) > 0.9) p.setX(i, p.getX(i) * 1.04);
  }
  geo.computeVertexNormals();
  const tex = canvasTex(256, 360, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#ffcf3a'); grd.addColorStop(1, '#ff6a2a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d11'; g.fillRect(0, 0, w, 40); g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#fff'; g.font = `900 64px ${FONT}`; g.textAlign = 'center'; g.fillText('바삭칩', w / 2, 140);
    g.fillStyle = '#f5d27a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(60 + (i % 3) * 70, 220 + Math.floor(i / 3) * 60, 34, 22, i, 0, Math.PI * 2); g.fill(); }
  });
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.28 }));
  m.position.y = 0.12;
  const g = new THREE.Group(); g.add(m); return g;
}

function petBottle({ liquid = null, cap = 0x2a7de1, label = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(bottleProfile(1.15), 32), clearPlastic());
  body.renderOrder = 2;
  g.add(body);
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.022, 20), new THREE.MeshStandardMaterial({ color: cap, roughness: 0.4 }));
  capM.position.y = 0.272; g.add(capM);
  if (liquid) {
    const lg = new THREE.CylinderGeometry(0.036, 0.036, 0.16, 24); lg.translate(0, 0.08, 0);
    const lm = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: liquid, transparent: true, opacity: 0.85, roughness: 0.2 }));
    lm.position.y = 0.006; lm.renderOrder = 1;
    g.add(lm); g.userData.liquid = lm;
  }
  if (label) {
    const tex = canvasTex(512, 128, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#5ab8ff'); grd.addColorStop(1, '#1565c0');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = `900 64px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('맑은샘물', w * 0.25, h / 2); c.fillText('맑은샘물', w * 0.75, h / 2);
    });
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0405, 0.0405, 0.075, 32, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, side: THREE.DoubleSide }));
    lab.position.y = 0.105;
    g.add(lab); g.userData.label = lab;
    g.userData.labelTex = tex;
  }
  return g;
}

function plasticCup() {
  const pts = [[0, 0], [0.034, 0], [0.036, 0.004], [0.046, 0.11], [0.048, 0.112]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), clearPlastic());
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 32), clearPlastic());
  lid.position.y = 0.114;
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.3 }));
  coffee.position.y = 0.012;
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
  straw.position.set(0.01, 0.12, 0); straw.rotation.z = -0.15;
  g.add(coffee, cup, lid, straw);
  return g;
}

/** A peeled-off label, crumpled into a little ball. */
export function crumpledLabel(tex) {
  const geo = new THREE.IcosahedronGeometry(0.035, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.7 + Math.random() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
  m.position.y = 0.03;
  const g = new THREE.Group(); g.add(m); return g;
}

async function glb(id, node, scale = 1) {
  const g = await instance(id, node);
  g.scale.setScalar(scale);
  const outer = new THREE.Group(); outer.add(g);
  return outer;
}

/** The trash sequence for the land stage (easy → missions → bonus). */
export const SEQUENCE = [
  { key: 'can', cat: 'can', make: () => drinkCan() },
  { key: 'newspaper', cat: 'paper', make: () => newspaper() },
  { key: 'glass', cat: 'glass', make: () => glb('wine_bottles_01', 'wine_bottles_01_alsace', 0.85) },
  { key: 'snack', cat: 'vinyl', make: () => snackBag() },
  { key: 'juice', cat: 'plastic', need: 'empty', make: () => petBottle({ liquid: 0xff9a1f, cap: 0xff7b00 }) },
  { key: 'gallon', cat: 'plastic', make: () => glb('plastic_bottle_gallon', null, 0.9) },
  { key: 'box', cat: 'paper', need: 'flat', make: () => glb('cardboard_box_01', null, 0.6) },
  { key: 'tuna', cat: 'can', make: () => glb('russian_food_cans_01', 'russian_food_cans_01_can_fish', 2.0) },
  { key: 'pet', cat: 'plastic', need: 'peel', make: () => petBottle({ label: true }) },
  { key: 'cup', cat: 'plastic', make: () => plasticCup() },
  { key: 'cleaner', cat: 'plastic', make: () => glb('multi_cleaner_bottle', null, 1.0) },
  { key: 'gold', cat: 'can', gold: true, make: () => drinkCan({ gold: true, text: 'GOLD' }) },
];

export async function makeItem(spec) {
  const obj = uniqueMaterials(await spec.make());
  return obj;
}

/** Bin with a friendly face; returns group with .setFace(mood) */
export function makeBin(def) {
  const g = new THREE.Group();
  const color = new THREE.Color(def.color);
  const H = 0.78, RT = 0.25, RB = 0.21;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(RT, RB, H, 40, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, side: THREE.FrontSide }));
  body.position.y = H / 2;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(RT - 0.01, RB - 0.01, H, 40, 1, true), new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.8, side: THREE.BackSide }));
  inner.position.y = H / 2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(RB, 32), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.05;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RT, 0.02, 10, 48), new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.35), roughness: 0.35 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = H;
  g.add(body, inner, bottom, rim);
  [body, rim].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });

  const faceTex = (mood) => canvasTex(512, 640, (c, w, h) => {
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.roundRect(16, 16, w - 32, h - 32, 60); c.fill();
    c.lineCap = 'round';
    const ey = 120;
    for (const ex of [180, 332]) {
      if (mood === 'happy') { c.strokeStyle = '#222'; c.lineWidth = 18; c.beginPath(); c.arc(ex, ey + 18, 34, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      else if (mood === 'wrong') { c.strokeStyle = '#222'; c.lineWidth = 16; c.beginPath(); c.moveTo(ex - 26, ey - 26); c.lineTo(ex + 26, ey + 26); c.moveTo(ex + 26, ey - 26); c.lineTo(ex - 26, ey + 26); c.stroke(); }
      else { c.fillStyle = '#222'; c.beginPath(); c.ellipse(ex, ey, 26, 32, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + 8, ey - 10, 9, 0, Math.PI * 2); c.fill(); }
    }
    c.strokeStyle = '#222'; c.lineWidth = 14; c.beginPath();
    if (mood === 'wrong') c.arc(256, 225, 40, Math.PI * 1.15, Math.PI * 1.85); else c.arc(256, 180, 46, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
    c.font = `200px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(def.icon, 256, 380);
    c.fillStyle = def.color; c.font = `900 96px ${FONT}`; c.fillText(def.name, 256, 545);
  });
  const faces = { normal: faceTex('normal'), happy: faceTex('happy'), wrong: faceTex('wrong') };
  const panelMat = new THREE.MeshStandardMaterial({ map: faces.normal, roughness: 0.6, emissive: 0xffffff, emissiveMap: faces.normal, emissiveIntensity: 0.25 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.375), panelMat);
  panel.position.set(0, H * 0.55, RT - (RT - RB) * 0.45 + 0.012);
  panel.rotation.x = Math.atan((RT - RB) / H);
  g.add(panel);

  const glow = new THREE.Mesh(new THREE.TorusGeometry(RT + 0.03, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  glow.rotation.x = Math.PI / 2; glow.position.y = H + 0.01;
  g.add(glow);

  const sign = textPanel({ width: 0.56, height: 0.2, text: `${def.icon} ${def.name}`, size: 88, bg: def.color, border: 'rgba(255,255,255,0.9)', weight: 900, res: 512 });
  sign.position.set(0, H + 0.3, -RT - 0.02); // floats over the back rim, readable over the table
  sign.material.depthWrite = true;
  g.add(sign);
  g.userData = { def, H, RT, panelMat, faces, glow, body };
  g.userData.setFace = (m) => { panelMat.map = faces[m]; panelMat.emissiveMap = faces[m]; panelMat.needsUpdate = true; };
  return g;
}

// ---- cheap decorative litter (not interactive) ----
const LITTER_COLORS = ['#d62828', '#1d7bd8', '#2a9d4b', '#f4a020', '#7b2cbf'];
export function litterCan() { const g = drinkCan({ base: LITTER_COLORS[Math.floor(Math.random() * 5)], text: 'COLA' }); g.scale.setScalar(0.9); return g; }
export function litterBottle() { return petBottle({ cap: [0x2a7de1, 0xe12a2a, 0x2ae17d][Math.floor(Math.random() * 3)] }); }
export function litterBag() { return snackBag(); }
export function litterPaper() { const g = newspaper(); g.rotation.z = Math.PI / 2; return g; }
