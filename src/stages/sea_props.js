import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blobGeometry } from '../props.js';

// Cute, toy-like sea life and reef pieces (procedural, cheap enough for Quest).

const rand = (a, b) => a + Math.random() * (b - a);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Big shiny cartoon eye. */
export function cartoonEye(r = 0.05) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), std(0xffffff, { roughness: 0.2 }));
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 14, 10), std(0x141414, { roughness: 0.1 }));
  pupil.position.z = r * 0.55;
  const hi = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  hi.position.set(r * 0.2, r * 0.25, r * 1.05);
  g.add(white, pupil, hi);
  return g;
}

function flipper(color, len) {
  const pivot = new THREE.Group();
  const geo=new THREE.SphereGeometry(1,24,14),p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),t=(x+1)*.5;p.setXYZ(i,x,p.getY(i)*(.8+.2*(1-t))-.16*t*t,z*(1-.42*t)+.32*t*t);}geo.computeVertexNormals();const m=new THREE.Mesh(geo,std(color,{roughness:.58}));m.scale.set(len,.036,len*.54);m.position.x=len*.72;
  pivot.add(m);
  return pivot;
}

export function makeTurtle() {
  const g = new THREE.Group();
  const shellTex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#3f9b4a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#2b6f33'; c.lineWidth = 10; c.fillStyle = '#5cbf5a';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) {
      const cx = x * 60 + (y % 2) * 30, cy = y * 70 + 20;
      c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; c.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); } c.closePath(); c.fill(); c.stroke();
    }
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff, { map: shellTex }));
  shell.scale.set(1, 0.55, 1.2);
  const belly = new THREE.Mesh(new THREE.CircleGeometry(0.31, 28), std(0xf3e2a0, { side: THREE.DoubleSide }));
  belly.rotation.x = Math.PI / 2; belly.scale.set(1, 1.2, 1);
  const skin = 0x779c65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), std(skin));
  head.position.set(0, 0.04, 0.46);
  const eyes = [-1, 1].map((s) => { const e = cartoonEye(0.033); e.scale.set(.91,1.04,.83); e.position.set(s * 0.073, 0.082, 0.55); e.rotation.y = s * 0.25; return e; });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0045, 8, 24, Math.PI), std(0x394a36));
  smile.position.set(0, 0.0, 0.585); smile.rotation.z = Math.PI;
  const fl = [[-1, 0.18], [1, 0.18], [-1, -0.22], [1, -0.22]].map(([s, z], i) => { const f = flipper(skin, i < 2 ? 0.2 : 0.12); f.position.set(s * 0.26, 0, z); f.rotation.y = s > 0 ? 0 : Math.PI; f.rotation.z = 0; return f; });
  g.add(shell, belly, head, ...eyes, smile, ...fl);
  g.userData.update = (t, mood = 0) => {
    const sp = 2 + mood * 4;
    fl.forEach((f, i) => (f.rotation.z = Math.sin(t * sp + (i % 2) * Math.PI) * (0.4 + mood * 0.3) * (i % 2 ? -1 : 1)));
    head.position.z = 0.46 + Math.sin(t * 1.5) * 0.015;
  };
  return g;
}

export function makeSeal() {
  const g = new THREE.Group();
  const fur = 0x8c9da8;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 8, 16), std(fur, { roughness: 0.45 }));
  body.rotation.x = Math.PI / 2 - 0.35;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), std(0xe8f0f4));
  belly.scale.set(0.9, 1.3, 0.6); belly.position.set(0, -0.06, 0.12);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 22, 16), std(fur, { roughness: 0.45 }));
  head.position.set(0, 0.3, 0.3);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), std(0xeef3f6));
  muzzle.scale.set(1.3, 0.8, 0.9); muzzle.position.set(0, 0.25, 0.46);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), std(0x222222, { roughness: 0.2 }));
  nose.position.set(0, 0.29, 0.53);
  const eyes = [-1, 1].map((s) => { const e = cartoonEye(0.038); e.scale.set(.91,1.05,.86); e.position.set(s * 0.085, 0.37, 0.44); e.rotation.y = s * 0.3; return e; });
  const whisk = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([-1, 1].flatMap((s) => [0, 1, 2].flatMap((k) => [new THREE.Vector3(s * 0.06, 0.26 - k * 0.015, 0.5), new THREE.Vector3(s * 0.2, 0.28 - k * 0.04, 0.47)]))), new THREE.LineBasicMaterial({ color: 0x333333 }));
  const fl = [-1, 1].map((s) => { const f = flipper(0x7d95a8, 0.16); f.position.set(s * 0.2, 0, 0.1); f.rotation.y = s > 0 ? -0.6 : Math.PI + 0.6; return f; });
  const tail = new THREE.Group();for(const sign of [-1,1]){const fin=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),std(0x758995));fin.scale.set(.095,.033,.18);fin.rotation.y=sign*.48;fin.position.set(sign*.066,0,-.058);tail.add(fin);}tail.position.set(0,-.23,-.40);
  g.add(body, belly, head, muzzle, nose, ...eyes, whisk, ...fl, tail);
  g.userData.update = (t, mood = 0) => {
    fl.forEach((f, i) => (f.rotation.z = Math.sin(t * (2 + mood * 5) + i * Math.PI) * 0.4));
    head.rotation.z = Math.sin(t * 1.2) * 0.055 * (1 + mood * 2);tail.rotation.x=Math.sin(t*1.7)*.16;
  };
  return g;
}

/** Fish geometry with vertex colours (body, belly, tail, eyes). */
export function fishGeometry(color = 0xffa31a, stripe = 0xffffff) {
  const parts = [];
  const paint = (geo, c) => { const col = new THREE.Color(c); const n = geo.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); return geo; };
  parts.push(paint(new THREE.SphereGeometry(0.06, 14, 10).scale(0.55, 0.8, 1.2), color));
  parts.push(paint(new THREE.SphereGeometry(0.061, 14, 10, 0, Math.PI * 2, 1.3, 0.35).scale(0.55, 0.8, 1.2), stripe));
  const tail = new THREE.ConeGeometry(0.045, 0.07, 3).rotateX(-Math.PI / 2).translate(0, 0, -0.095).scale(0.3, 1, 1);
  parts.push(paint(tail.toNonIndexed().index ? tail : tail, color));
  for (const s of [-1, 1]) {
    parts.push(paint(new THREE.SphereGeometry(0.014, 8, 6).translate(s * 0.027, 0.012, 0.04), 0xffffff));
    parts.push(paint(new THREE.SphereGeometry(0.008, 6, 4).translate(s * 0.033, 0.012, 0.045), 0x111111));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/** A circling school of instanced fish. */
export function fishSchool(root, center, { n = 24, radius = 1.6, color = 0xffa31a, stripe = 0xffffff, height = 0.6, speed = 0.6 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
  const im = new THREE.InstancedMesh(fishGeometry(color, stripe), mat, n);
  im.frustumCulled = false;
  root.add(im);
  const fish = Array.from({ length: n }, () => ({ a: Math.random() * 6.28, r: radius * rand(0.6, 1.1), h: rand(-height, height), ph: Math.random() * 6, s: rand(0.8, 1.3) }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  return {
    im, center, speed,
    update(dt, t) {
      fish.forEach((f, i) => {
        f.a += dt * this.speed / f.r * 1.2;
        p.set(this.center.x + Math.cos(f.a) * f.r, this.center.y + f.h + Math.sin(t * 2 + f.ph) * 0.05, this.center.z + Math.sin(f.a) * f.r);
        e.set(0, -f.a + (this.speed > 0 ? Math.PI : 0) + Math.sin(t * 8 + f.ph) * 0.15, 0);
        q.setFromEuler(e); sc.setScalar(f.s);
        m.compose(p, q, sc); im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

export function makeJelly(color = 0xff9ad5) {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.6, emissive: color, emissiveIntensity: 0.35, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; for (let k = 0; k < 6; k++) { pts.push(new THREE.Vector3(Math.cos(a) * 0.08, -k * 0.05, Math.sin(a) * 0.08), new THREE.Vector3(Math.cos(a) * 0.08 + Math.sin(k) * 0.01, -(k + 1) * 0.05, Math.sin(a) * 0.08)); } }
  const tent = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0x222222 })); e.position.set(s * 0.04, 0.05, 0.115); return e; });
  g.add(bell, tent, ...eyes);
  g.userData.update = (t, ph) => { const k = Math.sin(t * 2.2 + ph); bell.scale.set(1 + k * 0.08, 1 - k * 0.1, 1 + k * 0.08); g.position.y += Math.cos(t * 2.2 + ph) * 0.002; };
  return g;
}

// ---------- reef geometry ----------
export function branchCoralGeometry() {
  const parts = [];
  const grow = (base, dir, len, r, depth) => {
    const end = base.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(r * 0.7, r, len, 6).translate(0, len / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(base.x, base.y, base.z);
    parts.push(geo);
    if (depth === 0) { parts.push(new THREE.SphereGeometry(r * 0.9, 6, 4).translate(end.x, end.y, end.z)); return; }
    for (let i = 0; i < 3; i++) {
      const d = dir.clone().add(new THREE.Vector3(rand(-0.7, 0.7), rand(0.1, 0.5), rand(-0.7, 0.7))).normalize();
      grow(end, d, len * 0.75, r * 0.72, depth - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.22, 0.04, 3);
  return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
}

export function tubeSpongeGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const h = rand(0.25, 0.55), x = rand(-0.12, 0.12), z = rand(-0.12, 0.12);
    parts.push(new THREE.CylinderGeometry(0.06, 0.05, h, 10, 1, true).translate(x, h / 2, z));
    parts.push(new THREE.TorusGeometry(0.06, 0.014, 6, 12).rotateX(Math.PI / 2).translate(x, h, z));
  }
  return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
}

export function anemoneGeometry() {
  const parts = [new THREE.CylinderGeometry(0.08, 0.1, 0.08, 10).translate(0, 0.04, 0)];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 0.06;
    const c = new THREE.ConeGeometry(0.012, rand(0.12, 0.2), 5).translate(0, 0.1, 0).rotateZ(Math.cos(a) * 0.5).rotateX(Math.sin(a) * 0.5).translate(Math.cos(a) * r, 0.06, Math.sin(a) * r);
    parts.push(c);
  }
  return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
}

export function starfishGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2; const r = i % 2 ? 0.035 : 0.09; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }).rotateX(-Math.PI / 2);
}

export function seaFanTexture() {
  return canvasTex(256, 256, (c, w, h) => {
    c.strokeStyle = '#fff'; c.lineCap = 'round';
    const branch = (x, y, a, len, wdt, d) => { const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len; c.lineWidth = wdt; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); if (d > 0) { branch(x2, y2, a + 0.45, len * 0.78, wdt * 0.7, d - 1); branch(x2, y2, a - 0.45, len * 0.78, wdt * 0.7, d - 1); } };
    branch(128, 256, Math.PI / 2, 60, 10, 6);
  });
}

export function rockGeometry() { return blobGeometry(2, 0.3); }

/** Swaying kelp strip (instanced; sway done in the vertex shader). */
export function kelpMaterial(uTime) {
  const tex = canvasTex(64, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#1f7a3a'); g.addColorStop(0.5, '#4cc46a'); g.addColorStop(1, '#1f7a3a');
    c.fillStyle = g; c.beginPath(); c.moveTo(w / 2, 0);
    for (let y = 0; y <= h; y += 32) c.lineTo(w / 2 + (y / 32) % 2 * 20 + 8, y);
    for (let y = h; y >= 0; y -= 32) c.lineTo(w / 2 - (y / 32) % 2 * 20 - 8, y);
    c.fill();
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = 0.0;
      #ifdef USE_INSTANCING
        ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
      #endif
      float k = pow(uv.y, 1.4);
      transformed.x += sin(uTime * 1.4 + ph + uv.y * 2.0) * 0.35 * k;
      transformed.z += cos(uTime * 1.1 + ph) * 0.15 * k;`);
  };
  return m;
}

// ---------- beach ----------
export function palmGeometries() {
  const trunk = [];
  let p = new THREE.Vector3(), lean = new THREE.Vector3(rand(0.15, 0.3), 1, 0).normalize();
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.CylinderGeometry(0.11 - i * 0.008, 0.13 - i * 0.008, 0.5, 8).translate(0, 0.25, 0);
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean));
    seg.translate(p.x, p.y, p.z);
    trunk.push(seg);
    p = p.clone().addScaledVector(lean, 0.47);
    lean.x += 0.05; lean.normalize();
  }
  const leaves = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const leaf = new THREE.PlaneGeometry(0.5, 1.6, 1, 6).translate(0, 0.8, 0);
    const pos = leaf.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setZ(k, -Math.pow(y / 1.6, 2) * 0.9); pos.setX(k, pos.getX(k) * Math.sin((y / 1.6) * Math.PI + 0.2)); }
    leaf.rotateX(-Math.PI / 2 + 0.5).rotateY(a).translate(p.x, p.y, p.z);
    leaves.push(leaf);
  }
  const coco = [0, 1, 2].map((i) => new THREE.SphereGeometry(0.09, 10, 8).translate(p.x + Math.cos(i * 2) * 0.1, p.y - 0.1, p.z + Math.sin(i * 2) * 0.1));
  const clean = (arr) => arr.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; });
  return { trunk: mergeGeometries(clean([...trunk, ...coco])), leaves: mergeGeometries(leaves.map((g) => (g.index ? g.toNonIndexed() : g))) };
}

export function palmLeafTexture() {
  return canvasTex(128, 512, (c, w, h) => {
    c.fillStyle = '#2f8f3a'; c.fillRect(w / 2 - 4, 0, 8, h);
    for (let y = 10; y < h; y += 14) {
      const len = Math.sin((y / h) * Math.PI) * (w / 2 - 6) + 6;
      c.fillStyle = y % 28 ? '#4fbf4a' : '#3fa83f';
      c.beginPath(); c.moveTo(w / 2, y); c.lineTo(w / 2 - len, y + 20); c.lineTo(w / 2, y + 8); c.lineTo(w / 2 + len, y + 20); c.closePath(); c.fill();
    }
  });
}

export function makeUmbrella() {
  const tex = canvasTex(512, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff4d5e'; c.fillRect((i * w) / 8, 0, w / 8, h); } });
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.35, 16, 1, true), std(0xffffff, { map: tex, side: THREE.DoubleSide }));
  top.position.y = 2.05;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 8), std(0xeeeeee));
  pole.position.y = 1.05;
  g.add(top, pole);
  return g;
}

export function makeTowel(color = '#3ab0ff') {
  const tex = canvasTex(64, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : color; c.fillRect(0, (i * h) / 8, w, h / 8); } });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6).rotateX(-Math.PI / 2), std(0xffffff, { map: tex }));
  m.position.y = 0.01;
  return m;
}

export function makeSandcastle() {
  const g = new THREE.Group();
  const sand = std(0xe6c98f, { roughness: 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.25, 16), sand); base.position.y = 0.12;
  g.add(base);
  [[0, 0.45, 0, 0.16, 0.4], [-0.27, 0.35, 0.1, 0.1, 0.25], [0.27, 0.35, 0.1, 0.1, 0.25], [0, 0.35, -0.27, 0.1, 0.25]].forEach(([x, y, z, r, h]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), sand); t.position.set(x, y, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.2, r * 1.4, 12), sand); roof.position.set(x, y + h / 2 + r * 0.7, z);
    g.add(t, roof);
  });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), std(0xff4d5e, { side: THREE.DoubleSide })); flag.position.set(0.06, 1.05, 0);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.25), std(0x775533)); stick.position.set(0, 0.97, 0);
  g.add(flag, stick);
  return g;
}

export function makeBall() {
  const tex = canvasTex(256, 128, (c, w, h) => { const cols = ['#ff4d5e', '#ffffff', '#ffd23f', '#ffffff', '#3ab0ff', '#ffffff']; cols.forEach((col, i) => { c.fillStyle = col; c.fillRect((i * w) / 6, 0, w / 6 + 1, h); }); });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), std(0xffffff, { map: tex, roughness: 0.3 }));
  m.position.y = 0.16;
  return m;
}

export function makeLighthouse() {
  const g = new THREE.Group();
  const tex = canvasTex(64, 256, (c, w, h) => { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8323c'; c.fillRect(0, (i * h) / 6, w, h / 6); } });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 6, 16), std(0xffffff, { map: tex }));
  tower.position.y = 3;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe066, emissiveIntensity: 1.2 }));
  lamp.position.y = 6.35;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.7, 12), std(0xe8323c)); roof.position.y = 7.05;
  g.add(tower, lamp, roof);
  return g;
}

export function makeMask() {
  const g = new THREE.Group();
  const frameMat = std(0xffb020, { roughness: 0.35 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 24), frameMat); rim.scale.set(1.15, 0.9, 1); rim.position.x = s * 0.05;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), lensMat); lens.scale.set(1.15, 0.9, 1); lens.position.x = s * 0.05;
    g.add(rim, lens);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 24, Math.PI), std(0x222a33)); strap.rotation.set(Math.PI / 2, 0, 0); strap.position.z = -0.0;
  const tubeCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.12, -0.04, 0), new THREE.Vector3(0.14, 0.05, -0.02), new THREE.Vector3(0.13, 0.2, -0.03), new THREE.Vector3(0.1, 0.24, -0.02)]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 16, 0.012, 8), std(0x3ab0ff, { roughness: 0.3 }));
  g.add(strap, tube);
  return g;
}

/** Head-locked snorkel-mask frame shown while underwater. */
export function maskOverlay() {
  const tex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = 'rgba(15,20,25,0.92)'; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    const lens = (cx) => { c.beginPath(); c.ellipse(cx, h * 0.48, w * 0.27, h * 0.43, 0, 0, Math.PI * 2); c.fill(); };
    c.filter = 'blur(18px)'; lens(w * 0.3); lens(w * 0.7); c.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.6);
    c.filter = 'none'; c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(255,176,32,0.9)'; c.lineWidth = 16;
    c.beginPath(); c.ellipse(w * 0.3, h * 0.48, w * 0.28, h * 0.45, 0, Math.PI * 0.55, Math.PI * 1.45); c.stroke();
    c.beginPath(); c.ellipse(w * 0.7, h * 0.48, w * 0.28, h * 0.45, 0, -Math.PI * 0.45, Math.PI * 0.45); c.stroke();
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  m.position.z = -0.14;
  m.renderOrder = 8000;
  return m;
}

/** Simple floating trash for the sea (procedural). */
export function seaTrash(kind) {
  const g = new THREE.Group();
  if (kind === 'slipper') {
    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.14, 6, 12).scale(1, 0.25, 1).rotateX(Math.PI / 2), std(0x3ab0ff));
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), std(0xffffff)); strap.position.set(0, 0.0, 0.03);
    g.add(sole, strap);
  } else if (kind === 'foam') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.14), std(0xf4f4f0, { roughness: 0.95 })));
  } else if (kind === 'line') {
    g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.006, 64, 6, 3, 5), std(0x7cf3a0, { roughness: 0.4 })));
  } else if (kind === 'bag') {
    const m = new THREE.Mesh(blobGeometry(2, 0.35), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.75, roughness: 0.4 }));
    m.scale.set(0.11, 0.09, 0.11); g.add(m);
  }
  return g;
}
