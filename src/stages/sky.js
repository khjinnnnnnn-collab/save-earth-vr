import * as THREE from 'three';
import { loadHDR, loadTexSet } from '../assets.js';
import { blobGeometry, instanced, materials, treeGeometries } from '../props.js';
import { textPanel } from '../ui.js';
import { collectOrb } from './common.js';

const G = -5; // city ground level (the balloon floats above it)
const FIX_LIMIT = 60;
const SEED_LIMIT = 25;
const MONSTER = new THREE.Vector3(0, 4.2, -18);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

/** Soft smoke particles with per-particle size/alpha. */
function smokeSystem(n, tex) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex } },
    vertexShader: `attribute float aAlpha; attribute float aSize; attribute float aShade; varying float vA; varying float vS;
      void main(){ vA = aAlpha; vS = aShade; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * 420.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; varying float vS;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(vS), t.a * vA); }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const parts = Array.from({ length: n }, () => ({ life: 0, max: 1, em: null, vel: new THREE.Vector3() }));
  return { pts, parts, geo };
}

function monsterFace(mood) {
  return canvasTex(512, 512, (c, w, h) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [ex, s] of [[176, -1], [336, 1]]) {
      if (mood === 'dizzy') { c.strokeStyle = '#222'; c.lineWidth = 10; c.beginPath(); for (let a = 0; a < 14; a += 0.2) { const r = a * 3; c.lineTo(ex + Math.cos(a) * r, 220 + Math.sin(a) * r); } c.stroke(); continue; }
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, 225, 52, 46, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c8102e'; c.beginPath(); c.arc(ex - s * 6, 232, 24, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(ex - s * 6, 232, 12, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 18; c.beginPath(); c.moveTo(ex - 60 * s * -1, 160); c.lineTo(ex + 40 * s * -1, 190); c.stroke();
    }
    c.fillStyle = '#3a1a1a';
    if (mood === 'dizzy') { c.beginPath(); c.ellipse(256, 360, 40, 26, 0, 0, Math.PI * 2); c.fill(); }
    else { c.beginPath(); c.ellipse(256, 350, 90, 55, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(186 + i * 30, 302); c.lineTo(200 + i * 30, 330); c.lineTo(214 + i * 30, 302); c.fill(); } }
  });
}

export class SkyStage {
  constructor(ctx) { this.ctx = ctx; this.root = new THREE.Group(); this.offs = []; }

  async load() {
    this.hdr = await loadHDR('kloofendal_48d_partly_cloudy_puresky');
    this.M = materials();
    const R = this.root;
    R.add(new THREE.HemisphereLight(0xdfefff, 0x8a9a7a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.0); sun.position.set(5, 12, 6); R.add(sun);
    this.sun = sun;
    this.buildCity();
    this.buildSources();
    this.buildBalloon();
    this.buildMonster();
    this.smoke = smokeSystem(700, this.ctx.fx.tex);
    R.add(this.smoke.pts);
    // smog shell + rainbow
    this.smog = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), new THREE.MeshBasicMaterial({ color: 0x8b8a80, transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false, fog: false }));
    R.add(this.smog);
    this.rainbow = new THREE.Group();
    ['#ff4d4d', '#ff9a3c', '#ffe14d', '#5ad66b', '#4aa8ff', '#9b6bff'].forEach((col, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(26 - i * 0.9, 0.45, 6, 80, Math.PI), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, fog: false }));
      this.rainbow.add(m);
    });
    this.rainbow.position.set(4, G - 2, -42);
    this.rainbow.visible = false;
    R.add(this.rainbow);
  }

  // ------------------------------------------------------------------ city
  buildCity() {
    const R = this.root, M = this.M;
    const grass = loadTexSet('leafy_grass', 30);
    this.groundMat = new THREE.MeshStandardMaterial({ map: grass.diff, color: 0x8a8a6a, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), this.groundMat);
    ground.position.y = G;
    R.add(ground);
    const road = std(0x3c3f44, { roughness: 0.9 });
    const roads = [[0, -9.5, 40, 1.6], [0, 1, 40, 1.0], [-3, -6, 1.0, 40], [3.2, -6, 1.0, 40], [-12, -6, 1.0, 40], [12, -6, 1.0, 40]];
    for (const [x, z, w, d] of roads) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), road); m.position.set(x, G + 0.02, z); R.add(m); }
    const lane = new THREE.Mesh(new THREE.BoxGeometry(40, 0.06, 0.08), std(0xffe066)); lane.position.set(0, G + 0.03, -9.5); R.add(lane);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(140, 3).rotateX(-Math.PI / 2), std(0x3a8fd8, { roughness: 0.2, metalness: 0.1 }));
    river.position.set(0, G + 0.03, -22); R.add(river);
    this.riverMat = river.material;

    // empty lots where seed bombs will grow forests
    this.lots = [[-4.5, -5.5], [4.5, -5.5], [-9, -1.5], [9, -1.5], [0, -14.5]].map(([x, z]) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24).rotateX(-Math.PI / 2), std(0x8a6a48, { roughness: 1 }));
      m.position.set(x, G + 0.04, z); R.add(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa8ff7a, transparent: true, opacity: 0 }));
      ring.position.set(x, G + 0.06, z); R.add(ring);
      return { pos: new THREE.Vector3(x, G, z), planted: false, ring, patch: m };
    });

    // buildings: dense pastel blocks
    const winTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#9fc6e8'; for (let y = 8; y < h; y += 20) for (let x = 8; x < w; x += 20) c.fillRect(x, y, 11, 12); });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    const blocked = (x, z) => Math.abs(z + 9.5) < 1.5 || Math.abs(z - 1) < 1 || Math.abs(z + 22) < 2.4 || [-3, 3.2, -12, 12].some((rx) => Math.abs(x - rx) < 0.9)
      || this.lots.some((l) => Math.hypot(l.pos.x - x, l.pos.z - z) < 2.0)
      || Math.hypot(x + 8, z + 10.5) < 3.4 || Math.hypot(x - 8, z + 10.5) < 3.4;
    const bld = [];
    for (let x = -20; x <= 20; x += 1.7) for (let z = -30; z <= 12; z += 1.7) {
      const jx = x + rand(-0.25, 0.25), jz = z + rand(-0.25, 0.25);
      if (blocked(jx, jz) || Math.random() < 0.12) continue;
      const far = Math.hypot(jx, jz) > 16;
      const h = rand(0.8, far ? 6 : 3.6);
      bld.push({ x: jx, z: jz, y: G, ry: Math.random() < 0.5 ? 0 : Math.PI / 2, s: [rand(0.9, 1.3), h, rand(0.9, 1.3)], c: pick([0xffd1dc, 0xffe7a8, 0xc8f0ff, 0xd8ffc8, 0xe6d6ff, 0xffffff, 0xffc9a8]) });
    }
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(0.75, 0.5, 4).rotateY(Math.PI / 4).translate(0, 1.25, 0).scale(1, 0.8, 1);
    this.buildings = instanced([{ geo: boxGeo, mat: new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.7 }), tintable: true }], bld, R, { sick: 0x8d8c86 });
    const roofs = bld.filter((b) => b.s[1] < 2.2).map((b) => ({ ...b, s: [b.s[0], b.s[1], b.s[2]], c: pick([0xff6b6b, 0x4aa8ff, 0x5ad66b, 0xff9a3c]) }));
    this.roofs = instanced([{ geo: new THREE.ConeGeometry(0.72, 0.45, 4).rotateY(Math.PI / 4).translate(0, 0.225, 0), mat: std(0xffffff), tintable: true }], roofs.map((r) => ({ ...r, y: G + r.s[1], s: [r.s[0], 1, r.s[2]] })), R, { sick: 0x777770 });
    void roofGeo;
    // existing street trees + hills around the city
    const round = treeGeometries('round');
    const st = [];
    for (let i = 0; i < 60; i++) { const x = rand(-20, 20), z = rand(-30, 12); if (!blocked(x, z) && Math.random() < 0.5) continue; if (Math.abs(z + 9.5) < 1.2) continue; st.push({ x, z, y: G, ry: rand(0, 6), s: rand(0.5, 0.8) }); }
    this.streetTrees = instanced([{ geo: round.trunk, mat: M.bark }, { geo: round.foliage, mat: M.leaf, tintable: true }], st, R);
    const hills = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2; return { x: Math.sin(a) * rand(32, 40), z: -Math.cos(a) * rand(32, 40), y: G - 2, ry: rand(0, 6), s: [rand(8, 12), rand(5, 9), rand(6, 9)] }; });
    this.hills = instanced([{ geo: blobGeometry(2, 0.15), mat: M.pine, tintable: true }], hills, R);
    // grey carbon clouds hanging over the lots
    this.carbon = this.lots.map((l) => {
      const m = new THREE.Mesh(blobGeometry(2, 0.3), new THREE.MeshStandardMaterial({ color: 0x6a6a66, transparent: true, opacity: 0.8, vertexColors: true, roughness: 1 }));
      m.scale.set(1.1, 0.55, 0.9); m.position.set(l.pos.x, G + 2.6, l.pos.z);
      this.root.add(m); return m;
    });
  }

  // ------------------------------------------------------------------ pollution sources
  buildSources() {
    const R = this.root;
    const mk = (key, name, line, fixLine, sol, pos, target) => {
      const g = new THREE.Group(); g.position.copy(pos); R.add(g);
      const sign = textPanel({ width: 2.4, height: 0.7, text: '❓', size: 200, bg: 'rgba(200,30,40,0.88)', border: 'rgba(255,255,255,0.9)' });
      sign.position.copy(target).add(new THREE.Vector3(0, 2.2, 0));
      sign.lookAt(0, 1.3, 0);
      R.add(sign);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.4, depthWrite: false }));
      beacon.position.copy(target); R.add(beacon);
      return { key, name, line, fixLine, sol, group: g, sign, beacon, target: target.clone(), emitters: [], fixed: false, found: false, hover: 0 };
    };
    // coal power plant
    const plant = mk('plant', '🏭 석탄 화력발전소', 'sky_plant', 'sky_fixed_plant', 'wind', new THREE.Vector3(-8, G, -10.5), new THREE.Vector3(-8, G + 3, -10.5));
    const pb = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 2), std(0x9a8f86)); pb.position.set(0, 0.8, 0.4);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 4.6, 12), std(0xb5543c)); ch.position.set(1.0, 2.3, -0.4);
    const towerProfile = [[0.9, 0], [0.62, 1.2], [0.55, 1.9], [0.62, 2.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const t1 = new THREE.Mesh(new THREE.LatheGeometry(towerProfile, 20), std(0xd8d4cc, { side: THREE.DoubleSide })); t1.position.set(-0.9, 0, -0.7);
    const coal = new THREE.Mesh(blobGeometry(1, 0.3), std(0x1e1e1e)); coal.scale.set(0.8, 0.4, 0.6); coal.position.set(-1.2, 0.2, 1.1);
    plant.group.add(pb, ch, t1, coal);
    plant.emitters.push(new THREE.Vector3(-7, G + 4.7, -10.9), new THREE.Vector3(-8.9, G + 2.7, -11.2));
    plant.old = [ch, t1, coal];
    // clean energy (hidden until fixed)
    plant.fix = new THREE.Group();
    this.turbines = [];
    for (const [x, z] of [[-1.6, -1.6], [0.2, -2.2], [1.8, -1.4]]) {
      const tg = new THREE.Group(); tg.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 3.2, 8), std(0xffffff)); pole.position.y = 1.6;
      const hub = new THREE.Group(); hub.position.set(0, 3.2, 0.12);
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.03).translate(0, 0.65, 0), std(0xffffff)); b.rotation.z = (k / 3) * Math.PI * 2; hub.add(b); }
      tg.add(pole, hub); plant.fix.add(tg); this.turbines.push(hub);
    }
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.45), std(0x1f3f8a, { metalness: 0.6, roughness: 0.25 })); p.position.set(-1.2 + (i % 3) * 0.8, 0.45, 1.3 + Math.floor(i / 3) * 0.55); p.rotation.x = -0.5; plant.fix.add(p); }
    plant.fix.visible = false; plant.group.add(plant.fix);

    // traffic jam
    const road = mk('road', '🚗 꽉 막힌 도로', 'sky_road', 'sky_fixed_road', 'bus', new THREE.Vector3(0, G, -9.5), new THREE.Vector3(0, G + 1.4, -9.5));
    this.cars = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const car = new THREE.Group();
      const col = pick([0xff4d5e, 0x4aa8ff, 0xffd23f, 0xffffff, 0x333333, 0x9b6bff]);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.42), std(col, { roughness: 0.3 })); body.position.y = 0.2;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.38), std(0xcfe8ff, { roughness: 0.1 })); cab.position.set(-0.05, 0.42, 0);
      car.add(body, cab);
      car.position.set(-9.5 + i * 1.25, 0, (i % 2 ? 0.38 : -0.38));
      this.cars.add(car);
    }
    road.group.add(this.cars);
    for (let x = -8; x <= 8; x += 4) road.emitters.push(new THREE.Vector3(x, G + 0.4, -9.5));
    road.old = [this.cars];
    road.fix = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const bus = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 0.5), std(0x2fbf71, { roughness: 0.3 })); body.position.y = 0.38;
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.52), std(0xcfe8ff, { roughness: 0.1 })); win.position.y = 0.5;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.53), std(0xffe066)); sign.position.set(0.6, 0.66, 0);
      bus.add(body, win, sign); bus.position.set(-7 + i * 6, 0, i % 2 ? 0.38 : -0.38); road.fix.add(bus);
    }
    for (let i = 0; i < 8; i++) {
      const bike = new THREE.Group();
      for (const dx of [-0.13, 0.13]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 14), std(0x222222)); w.position.set(dx, 0.09, 0); bike.add(w); }
      const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 4, 8), std(pick([0xff6b6b, 0x4aa8ff, 0xffd23f]))); rider.position.set(0, 0.3, 0); bike.add(rider);
      bike.position.set(-9 + i * 2.4, 0, 0.75); road.fix.add(bike);
    }
    this.bikes = road.fix;
    road.fix.visible = false; road.group.add(road.fix);

    // factory
    const fac = mk('factory', '🏗️ 공장 굴뚝', 'sky_factory', 'sky_fixed_factory', 'filter', new THREE.Vector3(8, G, -10.5), new THREE.Vector3(8, G + 3.2, -10.5));
    const fb = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 2.2), std(0x8fa0b0)); fb.position.set(0, 0.7, 0.4);
    const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.4, 3, 1).rotateZ(Math.PI / 2), std(0x6f7f90)); saw.position.set(0, 1.5, 0.4);
    fac.group.add(fb, saw);
    fac.caps = [];
    for (const x of [-1.1, 0, 1.1]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 3.4, 10), std(0x9a5a4a)); c.position.set(x, 1.7, -0.5); fac.group.add(c);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 12), std(0x2fd18a, { emissive: 0x0a4a2a })); cap.position.set(x, 3.5, -0.5); cap.visible = false; fac.group.add(cap); fac.caps.push(cap);
      fac.emitters.push(new THREE.Vector3(8 + x, G + 3.5, -11.0));
    }
    this.sources = [plant, road, fac];
  }

  // ------------------------------------------------------------------ balloon basket (player)
  buildBalloon() {
    const R = this.root, M = this.M;
    const basket = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.62, 28, 1, true), new THREE.MeshStandardMaterial({ map: M.wood.map, color: 0xd9a868, roughness: 0.9, side: THREE.DoubleSide }));
    wall.position.y = 0.31;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.88, 28).rotateX(-Math.PI / 2), M.wood); floor.position.y = 0.02;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 40).rotateX(Math.PI / 2), std(0x8a5a2a)); rim.position.y = 0.62;
    basket.add(wall, floor, rim);
    // ropes + envelope + burner
    const env = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 20), std(0xffffff, { map: canvasTex(512, 64, (c, w, h) => { const cols = ['#ff4d5e', '#ffd23f', '#ffffff', '#4aa8ff']; for (let i = 0; i < 16; i++) { c.fillStyle = cols[i % 4]; c.fillRect((i * w) / 16, 0, w / 16 + 1, h); } }), side: THREE.DoubleSide }));
    env.position.y = 6.2; env.scale.set(1, 1.15, 1);
    const ropes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3, 4, 5].flatMap((i) => { const a = (i / 6) * Math.PI * 2; return [new THREE.Vector3(Math.cos(a) * 0.93, 0.62, Math.sin(a) * 0.93), new THREE.Vector3(Math.cos(a) * 1.5, 3.9, Math.sin(a) * 1.5)]; })), new THREE.LineBasicMaterial({ color: 0x5a4030 }));
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 }));
    this.flame.position.y = 3.3; this.flame.rotation.x = Math.PI;
    basket.add(env, ropes, this.flame);
    R.add(basket);

    // tray at the front of the basket with the three solution blocks + seed bowl
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.3), M.wood); tray.position.set(0, 0.66, -0.72);
    R.add(tray);
    const block = (kind) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), std(0xffffff, { roughness: 0.4 }));
      base.position.y = 0.03; g.add(base);
      if (kind === 'wind') {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.2, 6), std(0xffffff)); pole.position.y = 0.16;
        const hub = new THREE.Group(); hub.position.set(0, 0.26, 0.02);
        for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.006).translate(0, 0.05, 0), std(0xffffff)); b.rotation.z = (k / 3) * Math.PI * 2; hub.add(b); }
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.06), std(0x1f3f8a, { metalness: 0.6 })); panel.position.set(-0.04, 0.07, 0.04); panel.rotation.x = -0.5;
        g.add(pole, hub, panel); g.userData.spin = hub;
        base.material.color.set(0x8fd3ff);
      } else if (kind === 'bus') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.07), std(0x2fbf71)); b.position.y = 0.1;
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.072), std(0xcfe8ff)); w.position.y = 0.115;
        const bike = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), std(0x222222)); bike.position.set(0.05, 0.15, 0.04);
        g.add(b, w, bike); base.material.color.set(0xb9f5c9);
      } else {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 14), std(0x2fd18a, { emissive: 0x0a4a2a })); f.position.y = 0.1;
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.02, 14), std(0xffffff)); mesh.position.y = 0.13;
        g.add(f, mesh); base.material.color.set(0xd8ffe8);
      }
      return g;
    };
    this.blocks = [['wind', '🌬️ 풍력·태양광 발전', -0.36], ['bus', '🚌 전기버스·자전거', 0, ], ['filter', '🧹 매연 거름 필터', 0.36]].map(([kind, label, x]) => {
      const g = block(kind); g.position.set(x, 0.68, -0.72); R.add(g);
      return { kind, label, obj: g, home: g.position.clone(), used: false };
    });
    this.seeds = Array.from({ length: 5 }, (_, i) => {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), std(0x6b4a2a, { roughness: 0.9 }));
      const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 6), std(0x5ad66b)); sprout.position.y = 0.05;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std(0x5ad66b)); leaf.scale.set(1.6, 0.4, 0.8); leaf.position.set(0.02, 0.07, 0);
      g.add(ball, sprout, leaf);
      g.position.set(-0.15 + i * 0.075, 0.73, -0.64);
      g.visible = false; R.add(g);
      return { obj: g, home: g.position.clone(), used: false };
    });
    this.gauge = this.ctx.ui.gauge({ width: 0.8, label: '☁️ 하늘 회복', color: '#9ad7ff' });
    this.gauge.position.set(0, 2.15, -1.5);
    this.gauge.lookAt(0, 1.4, 0);
    R.add(this.gauge);
  }

  buildMonster() {
    const m = new THREE.Group();
    const body = new THREE.Mesh(blobGeometry(3, 0.22), new THREE.MeshStandardMaterial({ color: 0x77736c, vertexColors: true, roughness: 1, transparent: true, opacity: 0.95 }));
    body.scale.set(3.2, 2.4, 2.2);
    const puffs = [[-2.6, 1.2, 0, 1.4], [2.7, 1.0, 0.2, 1.5], [0.4, 2.3, -0.3, 1.6], [-1.4, -1.6, 0.4, 1.2], [1.8, -1.5, 0.3, 1.2]].map(([x, y, z, s]) => { const p = new THREE.Mesh(blobGeometry(2, 0.25), body.material); p.position.set(x, y, z); p.scale.setScalar(s); return p; });
    this.faces = { angry: monsterFace('angry'), dizzy: monsterFace('dizzy') };
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: this.faces.angry, transparent: true, depthWrite: false, fog: false }));
    this.face.position.z = 3.0;
    m.add(body, ...puffs, this.face);
    m.position.copy(MONSTER);
    m.lookAt(0, 1.3, 0);
    this.monster = m;
    this.monsterSize = 1;
    this.root.add(m);
  }

  // ------------------------------------------------------------------ run
  setClean(k) {
    const { scene } = this.ctx;
    scene.backgroundIntensity = 0.45 + 0.6 * k;
    scene.environmentIntensity = 0.55 + 0.5 * k;
    this.smog.material.opacity = 0.55 * (1 - k);
    this.smog.visible = k < 0.99;
    scene.fog.color.setRGB(0.55 + 0.2 * k, 0.55 + 0.27 * k, 0.5 + 0.42 * k);
    scene.fog.density = 0.035 * (1 - k) + 0.006 * k;
    this.groundMat.color.setRGB(0.5 - 0.08 * k, 0.5 + 0.18 * k, 0.42 - 0.12 * k);
    this.sun.intensity = 1.2 + 1.3 * k;
    const r = k * 45;
    this.buildings.heal(r); this.roofs.heal(r); this.streetTrees.heal(r); this.hills.heal(r * 1.2);
  }

  progress(add) {
    this.score = (this.score || 0) + add;
    const v = Math.min(1, this.score / 6);
    this.gauge.set(v);
    const k0 = this._k ?? 0; this._k = v;
    this.ctx.tween(1.2, (k) => this.setClean(k0 + (v - k0) * k));
  }

  async run() {
    const { ctx } = this;
    const { scene, audio, grab } = ctx;
    scene.background = this.hdr; scene.environment = this.hdr;
    scene.fog = new THREE.FogExp2(0x8c8c80, 0.035);
    grab.world = this.root; grab.floorAt = () => -100;
    this.setClean(0);
    ctx.input.setLaser(true);
    this.offs.push(ctx.onUpdate((dt, t) => this.tick(dt, t)));
    await ctx.fade(0, 0.8);
    await audio.say('sky_start');
    audio.say('sky_find');
    this.phase = 'fix';
    // solution blocks
    for (const b of this.blocks) {
      const it = grab.add(b.obj, { radius: 0.12, physics: false });
      it.label = b.label;
      it.onGrab = () => { b.heldSince = ctx.time; if (!this.saidBlock) { this.saidBlock = true; audio.say('sky_block', { hint: true }); } };
      it.onRelease = (hand, vel, heldFor) => this.releaseBlock(b, it, hand, vel, heldFor);
      b.item = it;
    }
    this.fixStart = ctx.time;
    await ctx.until(() => this.sources.every((s) => s.fixed) || ctx.time - this.fixStart > FIX_LIMIT);
    const late = !this.sources.every((s) => s.fixed);
    if (late) {
      await audio.say('sky_timeup');
      for (const s of this.sources) if (!s.fixed) { this.fix(s, false); await ctx.wait(0.6); }
    }
    for (const b of this.blocks) if (b.item) { ctx.grab.remove(b.item); }
    await audio.idle();

    // seed bombs → forests eat the remaining carbon clouds
    this.phase = 'seed';
    this.seeds.forEach((s) => { s.obj.visible = true; ctx.fx.burst(s.obj.position, 0x9fe86a, { n: 8, speed: 0.4, size: 0.03 }); });
    this.lots.forEach((l) => (l.ring.material.opacity = 0.7));
    await audio.say('sky_seed');
    for (const s of this.seeds) {
      const it = grab.add(s.obj, { radius: 0.09, physics: false });
      it.label = '🌱 씨앗 폭탄';
      it.onRelease = (hand, vel, heldFor) => this.releaseSeed(s, it, hand, vel, heldFor);
      s.item = it;
    }
    const seedStart = ctx.time;
    await ctx.until(() => this.lots.filter((l) => l.planted).length >= 3 || ctx.time - seedStart > SEED_LIMIT);
    for (const l of this.lots) if (!l.planted) { this.plant(l); await ctx.wait(0.4); }
    for (const s of this.seeds) if (s.item) ctx.grab.remove(s.item);
    this.lots.forEach((l) => (l.ring.material.opacity = 0));

    // monster vanishes, blue sky + rainbow
    this.phase = 'done';
    ctx.input.setLaser(false);
    await audio.idle();
    ctx.audio.sfx('clear');
    const s0 = this.monster.scale.x;
    await ctx.tween(1.2, (k) => { this.monster.scale.setScalar(Math.max(0.001, s0 * (1 - k))); this.monster.rotation.z = k * 6; });
    ctx.fx.burst(MONSTER, 0xffffff, { n: 120, speed: 5, size: 0.5, life: 1.5 });
    this.monster.visible = false;
    this.rainbow.visible = true;
    const k0 = this._k ?? 0;
    await ctx.tween(1.5, (k) => { this.setClean(k0 + (1 - k0) * k); this.rainbow.children.forEach((m) => (m.material.opacity = 0.45 * k)); });
    this.gauge.set(1);
    await audio.say('sky_clear');
    await collectOrb(ctx, this.root, 'sky', this.offs);
  }

  /** angle (deg) between a direction and the direction from p to q */
  angleTo(p, dir, q) { const v = q.clone().sub(p).normalize(); return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(v.dot(dir), -1, 1))); }

  aimedSource(hand, vel) {
    let best = null, bestA = Infinity;
    const p = hand.isDesktop ? hand.rayOrigin : hand.pos;
    const throwDir = vel && vel.length() > 1.0 ? vel.clone().normalize() : null;
    for (const s of this.sources) {
      if (s.fixed) continue;
      const aRay = this.angleTo(p, hand.rayDir, s.target);
      const aThrow = throwDir ? this.angleTo(p, throwDir, s.target) : 999;
      const a = Math.min(aRay, aThrow * 0.7);
      if (a < bestA) { bestA = a; best = s; }
    }
    return bestA < 16 ? best : null;
  }

  releaseBlock(b, it, hand, vel, heldFor) {
    const { ctx } = this;
    const intent = hand.isDesktop ? hand.dragDist > 0.12 : heldFor > 0.15;
    const target = intent ? this.aimedSource(hand, vel) : null;
    if (!target) { this.returnHome(b.obj, b.home); return; }
    it.enabled = false;
    const from = b.obj.position.clone(), to = target.target.clone();
    ctx.audio.sfx('whoosh');
    ctx.tween(0.9, (k) => { b.obj.position.lerpVectors(from, to, k); b.obj.position.y += Math.sin(k * Math.PI) * 2; b.obj.scale.setScalar(1 + k * 6); }, (x) => x).then(() => {
      if (target.sol === b.kind) {
        b.obj.visible = false; b.used = true;
        ctx.grab.remove(it); b.item = null;
        this.fix(target, true);
      } else {
        target.found = true; this.reveal(target);
        ctx.audio.sfx('wrong'); ctx.audio.say('sky_wrong', { hint: true });
        b.obj.scale.setScalar(1); this.returnHome(b.obj, b.home, true); it.enabled = true;
      }
    });
  }

  returnHome(obj, home, fromFar = false) {
    const from = obj.position.clone();
    this.ctx.tween(fromFar ? 0.6 : 0.25, (k) => obj.position.lerpVectors(from, home, k)).then(() => obj.rotation.set(0, 0, 0));
  }

  reveal(s) {
    if (s.revealed) return;
    s.revealed = true;
    s.sign.setText(s.name, { size: 110 });
    s.sign.material.color = new THREE.Color(1, 1, 1);
    this.ctx.audio.say(s.line);
  }

  fix(s, celebrate) {
    const { ctx } = this;
    if (s.fixed) return;
    s.fixed = true; s.found = true;
    if (!s.revealed) { s.revealed = true; s.sign.setText(s.name, { size: 110 }); }
    s.beacon.visible = false;
    s.sign.draw((g, w, h) => { g.fillStyle = 'rgba(40,170,90,0.9)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 40); g.fill(); g.fillStyle = '#fff'; g.font = `800 110px "Noto Sans KR",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✅ 해결!', w / 2, h / 2); });
    (s.old || []).forEach((o) => ctx.tween(0.6, (k) => o.scale.setScalar(Math.max(0.001, 1 - k))).then(() => (o.visible = false)));
    if (s.fix) { s.fix.visible = true; s.fix.scale.setScalar(0.001); ctx.tween(0.8, (k) => s.fix.scale.setScalar(Math.max(0.001, k)), (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2)); }
    if (s.caps) { s.caps.forEach((c) => (c.visible = true)); s.steam = true; }
    ctx.fx.burst(s.target, 0x7cff9a, { n: 60, speed: 3, size: 0.25, life: 1.2 });
    ctx.audio.sfx('good');
    // the monster shrinks and gets dizzy
    this.monsterSize -= 0.2;
    this.face.material.map = this.faces.dizzy; this.dizzyUntil = ctx.time + 2.5;
    this.progress(1);
    if (celebrate) ctx.audio.say(s.fixLine);
  }

  releaseSeed(s, it, hand, vel, heldFor) {
    const { ctx } = this;
    const intent = hand.isDesktop ? hand.dragDist > 0.12 : heldFor > 0.15 && (vel.length() > 0.9 || hand.rayDir.y < -0.2);
    if (!intent) { this.returnHome(s.obj, s.home); return; }
    // where is it aimed? ray (or throw) onto the ground, snapped to the nearest empty lot
    const p = hand.isDesktop ? hand.rayOrigin : hand.pos;
    const dir = !hand.isDesktop && vel.length() > 1.0 ? vel.clone().normalize() : hand.rayDir.clone();
    let hit = null;
    if (dir.y < -0.05) hit = p.clone().addScaledVector(dir, (G - p.y) / dir.y);
    const free = this.lots.filter((l) => !l.planted && !l.incoming);
    if (!free.length) { this.returnHome(s.obj, s.home); return; }
    let lot = free[0];
    if (hit) lot = free.reduce((a, l) => (l.pos.distanceTo(hit) < a.pos.distanceTo(hit) ? l : a), free[0]);
    else { const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize(); lot = free.reduce((a, l) => (this.angleTo(new THREE.Vector3(p.x, G, p.z), flat, l.pos) < this.angleTo(new THREE.Vector3(p.x, G, p.z), flat, a.pos) ? l : a), free[0]); }
    lot.incoming = true;
    it.enabled = false;
    ctx.grab.remove(it); s.item = null;
    this.root.add(s.obj);
    const from = s.obj.position.clone(), to = lot.pos.clone();
    ctx.audio.sfx('whoosh');
    ctx.tween(1.1, (k) => { s.obj.position.lerpVectors(from, to, k); s.obj.position.y += Math.sin(k * Math.PI) * 2.5; s.obj.scale.setScalar(1 + k * 8); }, (x) => x).then(() => { s.obj.visible = false; this.plant(lot); });
  }

  plant(lot) {
    const { ctx } = this;
    if (lot.planted) return;
    lot.planted = true;
    lot.ring.material.opacity = 0;
    ctx.audio.sfx('sparkle');
    ctx.fx.burst(lot.pos.clone().setY(G + 0.5), 0x7cff6a, { n: 50, speed: 3, size: 0.25, life: 1.2 });
    lot.patch.material.color.set(0x4f9a3a);
    const round = this.roundGeo || (this.roundGeo = treeGeometries('round'));
    const spots = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2, r = i ? rand(0.6, 1.2) : 0; return { x: lot.pos.x + Math.cos(a) * r, z: lot.pos.z + Math.sin(a) * r, y: G, ry: rand(0, 6), s: 0.001 }; });
    const trees = instanced([{ geo: round.trunk, mat: this.M.bark }, { geo: round.foliage, mat: this.M.leaf }], spots, this.root);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const targetS = spots.map(() => rand(0.5, 0.85));
    ctx.tween(1.2, (k) => {
      spots.forEach((p, i) => { q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.ry); sc.setScalar(Math.max(0.001, targetS[i] * k)); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, sc); trees.ims.forEach((im) => im.setMatrixAt(i, m)); });
      trees.ims.forEach((im) => (im.instanceMatrix.needsUpdate = true));
    }, (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2));
    // the forest gobbles the carbon cloud above it
    const cloud = this.carbon[this.lots.indexOf(lot)];
    const c0 = cloud.scale.clone(), p0 = cloud.position.clone();
    ctx.tween(1.6, (k) => { cloud.scale.copy(c0).multiplyScalar(Math.max(0.001, 1 - k)); cloud.position.lerpVectors(p0, lot.pos, k * 0.8); }).then(() => (cloud.visible = false));
    if (this.lots.filter((l) => l.planted).length <= 3) this.progress(1);
  }

  tick(dt, t) {
    const { ctx } = this;
    this.flame.scale.set(1, 0.8 + Math.random() * 0.4, 1);
    // monster wobble/size
    const target = Math.max(0.25, this.monsterSize);
    const cur = this.monster.scale.x;
    if (this.monster.visible && this.phase !== 'done') { const s = cur + (target - cur) * Math.min(1, dt * 2); this.monster.scale.set(s * (1 + Math.sin(t * 2) * 0.03), s * (1 + Math.cos(t * 2.3) * 0.03), s); this.monster.position.y = MONSTER.y + Math.sin(t * 0.8) * 0.3; }
    if (this.dizzyUntil && ctx.time > this.dizzyUntil) { this.face.material.map = this.faces.angry; this.dizzyUntil = 0; }
    // beacons pulse; pointing at a source reveals what it is
    for (const s of this.sources) {
      if (!s.fixed) { s.beacon.material.opacity = 0.25 + 0.25 * Math.sin(t * 6); s.beacon.scale.setScalar(1 + 0.2 * Math.sin(t * 6)); }
      if (this.phase === 'fix' && !s.revealed) {
        const pointing = ctx.input.active.some((h) => this.angleTo(h.isDesktop ? h.rayOrigin : h.pos, h.rayDir, s.target) < 9);
        s.hover = pointing ? s.hover + dt : 0;
        if (s.hover > 0.5) this.reveal(s);
      }
      s.sign.lookAt(ctx.camera.getWorldPosition(new THREE.Vector3()));
    }
    // a held block that's been dithering for a while: blink the right place
    for (const b of this.blocks) {
      if (b.item?.heldBy && ctx.time - (b.heldSince || 0) > 8) { const s = this.sources.find((x) => x.sol === b.kind); if (s && !s.fixed) { s.beacon.material.color.set(Math.sin(t * 10) > 0 ? 0xffe14d : 0xff3b3b); s.beacon.scale.setScalar(2); } }
      else this.sources.forEach((s) => s.beacon.material.color.set(0xff3b3b));
      if (b.obj.userData.spin) b.obj.userData.spin.rotation.z += dt * 3;
    }
    this.turbines.forEach((h) => (h.rotation.z += dt * 2.5));
    if (this.bikes.visible) this.bikes.children.forEach((o, i) => { o.position.x += dt * (i < 3 ? 1.0 : 0.6); if (o.position.x > 10) o.position.x = -10; });
    if (this.phase === 'seed') this.lots.forEach((l) => { if (!l.planted) l.ring.material.opacity = 0.4 + 0.4 * Math.sin(t * 5); });
    this.updateSmoke(dt, t);
  }

  updateSmoke(dt) {
    const { parts, geo } = this.smoke;
    const pos = geo.attributes.position, al = geo.attributes.aAlpha, sz = geo.attributes.aSize, sh = geo.attributes.aShade;
    const emitters = [];
    for (const s of this.sources) {
      if (!s.fixed) s.emitters.forEach((e) => emitters.push({ e, steam: false }));
      else if (s.steam) s.emitters.forEach((e) => emitters.push({ e, steam: true, rate: 0.12 }));
    }
    const mouth = this.monster.position;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.life <= 0) {
        al.setX(i, 0);
        if (!emitters.length || Math.random() > 0.08) continue;
        const em = pick(emitters);
        if (em.rate && Math.random() > em.rate) continue;
        p.life = p.max = rand(4, 6); p.steam = em.steam;
        p.vel.set(rand(-0.1, 0.1), rand(0.6, 1.0), rand(-0.1, 0.1));
        pos.setXYZ(i, em.e.x + rand(-0.2, 0.2), em.e.y, em.e.z + rand(-0.2, 0.2));
      }
      p.life -= dt;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const age = 1 - p.life / p.max;
      if (!p.steam && this.monster.visible && age > 0.25) {
        // the smog monster slurps the smoke
        const to = new THREE.Vector3(mouth.x - x, mouth.y - y, mouth.z - z);
        if (to.length() < 1.6) p.life = 0;
        p.vel.lerp(to.normalize().multiplyScalar(3.2), dt * 1.5);
      }
      pos.setXYZ(i, x + p.vel.x * dt, y + p.vel.y * dt, z + p.vel.z * dt);
      al.setX(i, Math.min(1, age * 5) * Math.min(1, p.life) * (p.steam ? 0.6 : 0.8));
      sz.setX(i, p.steam ? 0.35 + age * 0.6 : 0.8 + age * 1.6);
      sh.setX(i, p.steam ? 0.95 : 0.25 + age * 0.25);
    }
    pos.needsUpdate = true; al.needsUpdate = true; sz.needsUpdate = true; sh.needsUpdate = true;
  }

  dispose() {
    this.offs.forEach((f) => f());
    this.ctx.input.setLaser(false);
    this.ctx.grab.clear();
    const s = this.ctx.scene; s.fog = null; s.environment = null; s.background = null;
  }
}
