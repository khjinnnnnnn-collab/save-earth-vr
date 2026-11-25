import * as THREE from 'three';
import { loadHDR } from '../assets.js';
import { instanced } from '../props.js';
import { textPanel } from '../ui.js';
import { toon, toonify, toonShared, gradientDome, glowTexture } from '../toon.js';
import { litterCan, litterBottle, litterBag } from './land_items.js';
import {
  makeTurtle, makeSeal, fishSchool, makeJelly, anemoneGeometry, starfishGeometry,
  seaFanTexture, kelpMaterial, palmGeometries, palmLeafTexture, makeLighthouse, makeMask, seaTrash,
} from './sea_props.js';
import {
  islandGeometry, rippleTexture, makeBoat, surfaceWater, makeWhale, makeManta, makeDolphin, makePolarBear,
  icebergGeometry, floeGeometry, iceChunk, makeClam, blobGeometry, lowBranchCoral, lowTubeSponge,
} from './ocean_props.js';

// One continuous scuba adventure: boat → coral reef clean-up → rescue three friends → help the polar bear → celebration.
// Every mission is "just grab it": grabbing a glowing thing finishes that step. No time limits; help arrives if a child is stuck.

const FLOOR = -1.6;
const P = {
  reef: new THREE.Vector3(0, 0, 0),
  turtle: new THREE.Vector3(0, 0, -8),
  fish: new THREE.Vector3(1.5, 0, -15),
  seal: new THREE.Vector3(-0.5, 0, -22),
  end: new THREE.Vector3(0, 0.7, -27),
};
const CORAL = [0xff5fa2, 0xff8a3d, 0xffd84a, 0xa77bff, 0x3fe0c5, 0xff4d5e, 0xff9f80, 0x6fd0ff];
const BLEACHED = 0xe9e4d8;
const HINT_AT = 12, AUTO_AT = 30;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Ocean {
  constructor(ctx) {
    this.ctx = ctx; this.root = new THREE.Group(); this.offs = [];
    this.uTime = toonShared.uTime;
    this.glows = new Map();
    this.score = 0; this.total = 12;
  }

  async load() {
    this.hdr = await loadHDR('kloofendal_48d_partly_cloudy_puresky');
    this.S = new THREE.Group(); this.U = new THREE.Group(); this.A = new THREE.Group();
    this.U.visible = false; this.A.visible = false;
    this.root.add(this.S, this.U, this.A);
    this.buildSurface();
    this.buildUnderwater();
    this.buildArctic();
  }

  // ================================================================ surface (dive boat)
  buildSurface() {
    const S = this.S;
    S.add(new THREE.HemisphereLight(0xdff6ff, 0x4a90b8, 1.4));
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.2); sun.position.set(-4, 10, 3); S.add(sun);
    S.add(surfaceWater(this.uTime).translateY(-0.28));
    this.boat = makeBoat(); S.add(this.boat);

    // crate with the mask + air tank
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.85, 0.35), toon(0xd9a066)); crate.position.set(0, 0.425, -0.75);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 6, 12), toon(0xffd23f)); tank.position.set(0.38, 0.32, -0.7);
    S.add(crate, tank);
    this.mask = toonify(makeMask()); this.mask.scale.setScalar(1.5);
    this.mask.position.set(0, 1.0, -0.75); this.mask.rotation.x = -0.3;
    S.add(this.mask);

    // tropical islands, lighthouse, dolphins, gulls
    const sand = toon(0xffe3a0), green = toon(0x5ccf6a, { vertexColors: true });
    const isl = [[-9, -16, 3.2], [12, -22, 4], [-20, -30, 5], [4, -40, 6]];
    for (const [x, z, r] of isl) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), sand); s.scale.y = 0.3; s.position.set(x, -0.3, z);
      const h = new THREE.Mesh(blobGeometry(2, 0.25), green); h.scale.set(r * 0.6, r * 0.35, r * 0.6); h.position.set(x, 0.2, z);
      S.add(s, h);
    }
    const palm = palmGeometries();
    instanced([{ geo: palm.trunk, mat: toon(0xb07a48) }, { geo: palm.leaves, mat: toon(0xffffff, { map: palmLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide }) }],
      [[-9.5, -15], [-8, -17], [-10.5, -17.5], [11, -21], [13, -23], [-19, -29], [-21, -31]].map(([x, z]) => ({ x, z, y: 0.4, ry: rand(0, 6), s: rand(1.0, 1.4) })), S);
    const lh = toonify(makeLighthouse()); lh.position.set(12.5, 0.6, -22.5); S.add(lh);
    this.dolphins = [0, 1].map((i) => { const d = makeDolphin(); d.scale.setScalar(1.4); d.userData.ph = i * 2.2; d.userData.x = i ? 3.5 : -4.5; S.add(d); return d; });
    this.gulls = Array.from({ length: 4 }, (_, i) => {
      const g = new THREE.Group();
      const wing = new THREE.PlaneGeometry(0.4, 0.09).translate(0.2, 0, 0);
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const L = new THREE.Mesh(wing, m), R = new THREE.Mesh(wing, m); R.scale.x = -1;
      g.add(L, R); g.userData = { L, R, a: i * 1.6, r: rand(6, 10), h: rand(5, 8) };
      S.add(g); return g;
    });
  }

  // ================================================================ underwater reef
  buildUnderwater() {
    const U = this.U;
    this.dome = gradientDome(140); U.add(this.dome);
    U.add(new THREE.HemisphereLight(0xc8f8ff, 0x1d5fa0, 1.5));
    const top = new THREE.DirectionalLight(0xffffff, 1.8); top.position.set(2, 10, 4); U.add(top);

    // sandy floor with soft dunes, ripples and caustics
    const fg = new THREE.PlaneGeometry(110, 110, 56, 56).rotateX(-Math.PI / 2);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), z = fp.getZ(i); fp.setY(i, Math.sin(x * 0.45) * 0.15 + Math.sin(z * 0.35 + x * 0.2) * 0.2); }
    fg.computeVertexNormals();
    const rip = rippleTexture(); rip.repeat.set(40, 40);
    const floor = new THREE.Mesh(fg, toon(0xffffff, { map: rip, caustics: true }));
    floor.position.set(0, FLOOR, -14);
    U.add(floor);

    // terraced islands: low ones near the swim path (we look down on their coral tops), tall ones further out
    const isl = [
      [-3.2, 0.6, 1.6, 1.0, 2], [3.4, -1.0, 1.8, 1.1, 2], [-2.9, -5.2, 1.4, 0.9, 2], [3.2, -6.8, 1.5, 1.2, 3], [-3.8, -11, 2.0, 1.2, 2],
      [4.6, -12.5, 1.7, 1.0, 3], [-3.2, -17, 1.6, 1.1, 2], [4.7, -19, 2.0, 1.4, 2], [-4.4, -23.5, 1.8, 1.2, 3], [3.6, -24.5, 1.5, 1.0, 2],
      [0.9, -3.8, 0.9, 0.5, 1], [-1.4, -12, 0.8, 0.45, 1], [2.2, -20.5, 0.8, 0.5, 1],
      [-8.5, -4, 3.5, 2.2, 3], [8.8, -8, 3.8, 2.5, 3], [-9.5, -14.5, 4, 2.6, 3], [9.5, -20, 4, 2.4, 3], [-8, -29, 4.5, 2.6, 3],
      [6, -34, 5, 3.0, 3], [-1.5, -39, 6, 3.2, 3], [-12, 4, 4, 2.4, 2], [11.5, 3, 4, 2.2, 2], [16, -14, 5, 3.5, 3], [-16, -20, 5, 3.4, 3],
    ];
    const sides = [[0x62c3f2, 0x2a5aa8], [0x7aa8ff, 0x3d4fb0], [0x58d1d8, 0x22649a], [0x9a8cf0, 0x4b4aa8]];
    const tops = [];
    isl.forEach(([x, z, r, h, levels], i) => {
      const { geo, tops: t } = islandGeometry({ r, h, levels, side: sides[i % sides.length], top: i % 5 === 3 ? 0x9be37a : 0xffe3a0 });
      const m = new THREE.Mesh(geo, this.islandMat || (this.islandMat = toon(0xffffff, { vertexColors: true, flat: true, caustics: true, rimK: 0.25 })));
      m.position.set(x, FLOOR - 0.05, z);
      U.add(m);
      t.forEach((tp) => tops.push({ x: x + tp.x, y: FLOOR - 0.05 + tp.y, z: z + tp.z, r: tp.r }));
    });

    // coral gardens on island tops and around the floor (bleached until healed)
    const onTop = (n) => { const out = []; for (const t of tops) { const k = Math.max(2, Math.round(t.r * t.r * n)); for (let i = 0; i < k; i++) { const a = rand(0, 6.28), rr = Math.sqrt(Math.random()) * t.r; out.push({ x: t.x + Math.cos(a) * rr, y: t.y, z: t.z + Math.sin(a) * rr, ry: rand(0, 6.28), d: -(t.z + Math.sin(a) * rr) + 2 }); } } return out; };
    const onFloor = (n) => { const out = []; let g = 0; while (out.length < n && g++ < n * 30) { const x = rand(-12, 12), z = rand(-34, 6); const px = this.pathX(z); if (Math.abs(x - px) < 1.1) continue; out.push({ x, y: FLOOR + 0.02, z, ry: rand(0, 6.28), d: -z + 2 }); } return out; };
    const col = () => pick(CORAL);
    const branch = [...onTop(1.1), ...onFloor(60)].map((p) => ({ ...p, s: rand(1.0, 2.0), c: col() }));
    const brain = [...onTop(0.8), ...onFloor(40)].map((p) => ({ ...p, y: p.y + 0.04, s: [rand(0.18, 0.32), rand(0.12, 0.2), rand(0.18, 0.32)], c: col() }));
    const tubes = [...onTop(0.5), ...onFloor(30)].map((p) => ({ ...p, s: rand(0.9, 1.6), c: col() }));
    const anem = [...onTop(0.7), ...onFloor(50)].map((p) => ({ ...p, s: rand(1.0, 1.9), c: pick([0xff5fa2, 0xa77bff, 0x3fe0c5, 0xffd84a]) }));
    const stars = onFloor(40).map((p) => ({ ...p, y: FLOOR + 0.05, s: rand(1, 1.7), c: pick([0xff7a59, 0xffd84a, 0xff5fa2]) }));
    const fans = [...onTop(0.6), ...onFloor(30)].map((p) => ({ ...p, s: rand(1.2, 2.2), c: pick([0xff4d5e, 0xa77bff, 0xffd84a]) }));
    this.healers = [
      instanced([{ geo: lowBranchCoral(), mat: toon(0xffffff), tintable: true }], branch, U, { sick: BLEACHED }),
      instanced([{ geo: blobGeometry(1, 0.35), mat: toon(0xffffff, { vertexColors: true }), tintable: true }], brain, U, { sick: BLEACHED }),
      instanced([{ geo: lowTubeSponge(), mat: toon(0xffffff, { side: THREE.DoubleSide }), tintable: true }], tubes, U, { sick: BLEACHED }),
      instanced([{ geo: anemoneGeometry(), mat: toon(0xffffff), tintable: true }], anem, U, { sick: BLEACHED }),
      instanced([{ geo: starfishGeometry(), mat: toon(0xffffff), tintable: true }], stars, U, { sick: BLEACHED }),
      instanced([{ geo: new THREE.PlaneGeometry(0.5, 0.5).translate(0, 0.25, 0), mat: toon(0xffffff, { map: seaFanTexture(), alphaTest: 0.4, side: THREE.DoubleSide }), tintable: true }], fans, U, { sick: BLEACHED }),
    ];
    // swaying sea grass + kelp
    const kelp = onFloor(140).map((p) => ({ ...p, s: [1, rand(0.5, 1.3), 1] }));
    instanced([{ geo: new THREE.PlaneGeometry(0.26, 2.6, 1, 10).translate(0, 1.3, 0), mat: kelpMaterial(this.uTime) }], kelp, U);
    // clams on the floor
    for (let i = 0; i < 8; i++) { const c = makeClam(pick([0xff8fc8, 0xb79cff, 0x7fd8ff])); const z = rand(-30, 2); c.position.set(this.pathX(z) + (i % 2 ? 1 : -1) * rand(1.4, 2.6), FLOOR + 0.05, z); c.rotation.y = rand(0, 6); U.add(c); }

    // the sea surface seen from below, god rays, bubbles
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 1, 1).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime }, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; varying vec3 vW;
        void main(){ float w = sin(vW.x*1.3 + uTime*0.9 + sin(vW.z*0.8)) * sin(vW.z*1.1 - uTime*0.7 + sin(vW.x*0.7));
          vec3 c = mix(vec3(0.55,0.95,1.0), vec3(1.0), smoothstep(0.7, 0.95, w));
          float a = 0.55 * (1.0 - smoothstep(10.0, 60.0, length(vW.xz - vec2(0.0,-14.0))));
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    }));
    surf.position.set(0, 7.5, -14);
    U.add(surf);
    const rayMat = new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0.16 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uO; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.6) * uO * (0.6 + 0.4 * sin(vUv.x * 18.0)); gl_FragColor = vec4(0.85, 1.0, 1.0, a); }',
    });
    this.rayMat = rayMat;
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.6, 9, 14, 1, true), rayMat);
      const z = 4 - i * 2.6;
      m.position.set(this.pathX(z) + rand(-4, 4), 3, z); m.rotation.set(rand(-0.15, 0.15), 0, rand(-0.25, 0.25));
      U.add(m);
    }
    const nb = 320, bp = new Float32Array(nb * 3);
    for (let i = 0; i < nb; i++) { const z = rand(-32, 4); bp.set([this.pathX(z) + rand(-5, 5), rand(FLOOR, 7), z], i * 3); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xf0fdff, size: 0.05, transparent: true, opacity: 0.8, map: this.ctx.fx.tex, depthWrite: false }));
    U.add(this.bubbles);

    // sea life
    this.schools = [
      fishSchool(U, new THREE.Vector3(-2.2, 1.8, -2.5), { n: 24, radius: 1.4, color: 0xff9a1a }),
      fishSchool(U, new THREE.Vector3(3.0, 2.3, -9), { n: 26, radius: 1.8, color: 0x3ab0ff, stripe: 0xffe066, speed: -0.7 }),
      fishSchool(U, new THREE.Vector3(-2.5, 2.6, -17), { n: 22, radius: 1.6, color: 0xff6fa8 }),
      fishSchool(U, new THREE.Vector3(2.0, 3.0, -25), { n: 24, radius: 1.7, color: 0xffd23f, stripe: 0x3a3a3a, speed: -0.6 }),
    ];
    this.schools.forEach((s) => (s.im.material = toon(0xffffff, { vertexColors: true, rimK: 0.3 })));
    this.jellies = Array.from({ length: 7 }, (_, i) => {
      const j = makeJelly(pick([0xff9ad5, 0xb9a4ff, 0x8fe8ff]));
      const z = -1 - i * 4; j.position.set(this.pathX(z) + (i % 2 ? 1 : -1) * rand(1.8, 3), rand(2.0, 3.4), z); j.userData.ph = rand(0, 6);
      U.add(j); return j;
    });
    this.whale = makeWhale(); this.whale.scale.setScalar(1.6); U.add(this.whale);
    this.whaleA = 0;
    this.mantas = [0, 1].map((i) => { const m = makeManta(); m.scale.setScalar(1.3); m.userData.a = i * 3; U.add(m); return m; });

    // rescue friends
    this.turtle = toonify(makeTurtle()); this.turtle.position.copy(P.turtle).add(new THREE.Vector3(0, 1.0, -1.3)); U.add(this.turtle);
    this.plastic = seaTrash('bag'); this.plastic.scale.setScalar(1.3); this.plastic.position.copy(P.turtle).add(new THREE.Vector3(0.16, 0.97, -0.68)); U.add(this.plastic);
    this.trapped = fishSchool(U, P.fish.clone().add(new THREE.Vector3(0, 1.1, -1.4)), { n: 14, radius: 0.26, color: 0xff7a3c, height: 0.12, speed: 0.4 });
    this.trapped.im.material = toon(0xffffff, { vertexColors: true });
    this.net = this.makeNet(); this.net.position.copy(P.fish).add(new THREE.Vector3(0, 1.1, -0.9)); U.add(this.net);
    this.seal = toonify(makeSeal()); this.seal.position.copy(P.seal).add(new THREE.Vector3(0, 0.85, -1.4)); U.add(this.seal);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.024, 8, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, roughness: 0.2 }));
    this.ring.rotation.x = Math.PI / 2 - 0.4; this.ring.position.copy(this.seal.position).add(new THREE.Vector3(0, 0.2, 0.28)); U.add(this.ring);

    // bag + gauge ride with the player
    this.bag = this.makeBag();
    this.gauge = this.ctx.ui.gauge({ width: 0.7, label: '🌊 바다 회복', color: '#3ab0ff' });
    this.gauge.position.set(0, 2.15, -2.1);
  }

  pathX(z) {
    const pts = [P.reef, P.turtle, P.fish, P.seal, P.end];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (z <= a.z && z >= b.z) return a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z)); }
    return z > 0 ? pts[0].x : pts[pts.length - 1].x;
  }

  makeNet() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.strokeStyle = '#e4f0d0'; x.lineWidth = 5; for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd8e8c0, map: t, alphaMap: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    mesh.position.z = -0.5;
    const float = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), toon(0xff7a1a, { emissive: 0x552200 }));
    g.add(mesh, float); g.userData.mesh = mesh;
    return g;
  }

  makeBag() {
    const g = new THREE.Group();
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.strokeStyle = '#fff'; x.lineWidth = 6; for (let i = -128; i < 256; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
    const net = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), new THREE.MeshStandardMaterial({ color: 0x2fd18a, map: t, alphaMap: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 32).rotateX(Math.PI / 2), toon(0xff8a1f)); rim.position.y = 0.075;
    this.bagCount = textPanel({ width: 0.22, height: 0.08, text: '🗑️ 0', size: 80 }); this.bagCount.position.y = 0.24;
    this.bagInside = new THREE.Group();
    g.add(net, rim, this.bagCount, this.bagInside);
    g.position.set(-0.45, 0.85, -0.45); g.scale.setScalar(0.85);
    return g;
  }

  // ================================================================ arctic
  buildArctic() {
    const A = this.A;
    this.arcticDome = gradientDome(140);
    this.arcticDome.userData.u.uTop.value.set(0x6fb8ff); this.arcticDome.userData.u.uMid.value.set(0xeaf8ff); this.arcticDome.userData.u.uBot.value.set(0xcdeefa);
    A.add(this.arcticDome);
    A.add(new THREE.HemisphereLight(0xf0fbff, 0x7fb8d8, 1.5));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.0); sun.position.set(5, 8, 2); A.add(sun);
    A.add(surfaceWater(this.uTime, { shallow: 0x4fc3dc, deep: 0x1f6fb0 }).translateY(-0.28));
    const boat = makeBoat(); A.add(boat);
    // icebergs all around (the front stays open towards the bear)
    const bergs = [];
    for (let i = 0; i < 26; i++) { const a = rand(0, Math.PI * 2), r = rand(9, 40); const x = Math.sin(a) * r, z = -Math.cos(a) * r; if (Math.abs(x) < 4 && z < 0 && z > -14) continue; bergs.push({ x, z, y: -0.6, ry: rand(0, 6), s: [rand(0.8, 2.2), rand(0.6, 2.2), rand(0.8, 2.2)] }); }
    instanced([{ geo: icebergGeometry(3, 2), mat: toon(0xffffff, { vertexColors: true, flat: true, rim: 0xe8fbff, rimK: 0.5 }) }], bergs, A);
    // far ice shelf
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(80, 3, 6), toon(0xf4fcff, { rim: 0xbfefff })); shelf.position.set(0, 0.8, -46); A.add(shelf);
    // the cub's tiny floe
    this.floe = new THREE.Mesh(floeGeometry(1), toon(0xffffff, { vertexColors: true, flat: true, rim: 0xdff8ff, rimK: 0.6 }));
    this.floe.position.set(0, -0.2, -3.4); this.floeR = 0.5; this.floe.scale.set(0.5, 1, 0.5); A.add(this.floe);
    this.cub = makePolarBear(1.0); this.cub.position.set(0, -0.09, -3.4); this.cub.rotation.y = Math.PI; A.add(this.cub); // face the player
    this.mom = makePolarBear(1.7); this.mom.position.set(-7, -0.45, -9); A.add(this.mom);
    // ice chunks drifting near the boat
    this.chunks = [[-1.1, -1.5], [1.15, -1.9], [-0.7, -2.5]].map(([x, z]) => { const c = iceChunk(); c.position.set(x, -0.18, z); c.userData.home = c.position.clone(); A.add(c); return c; });
    // snow
    const n = 500, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) sp.set([rand(-8, 8), rand(-0.3, 7), rand(-12, 4)], i * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, map: this.ctx.fx.tex, transparent: true, depthWrite: false }));
    A.add(this.snow);
  }

  // ================================================================ helpers
  /** Make something grabbable: it glows, and grabbing it runs take() (the hand lets go automatically). */
  target(obj, label, take, { radius = 0.16 } = {}) {
    const { ctx } = this;
    const it = ctx.grab.add(obj, { radius, physics: false, priority: 1 });
    it.label = label;
    it.done = false;
    it.onGrab = (hand) => {
      ctx.grab.release(hand);
      if (it.done) return;
      it.done = true; it.enabled = false;
      hand.pulse?.(0.6, 80);
      this.setGlow(it, false);
      take(it);
      this.lastAction = ctx.time;
    };
    it.onRelease = () => {};
    this.setGlow(it, true);
    return it;
  }

  setGlow(it, on) {
    let s = this.glows.get(it);
    if (on && !s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.renderOrder = 5; this.ctx.scene.add(s); this.glows.set(it, s);
    }
    if (!on && s) { s.removeFromParent(); this.glows.delete(it); }
  }

  updateGlows(t) {
    let i = 0;
    for (const [it, s] of this.glows) {
      it.obj.getWorldPosition(s.position);
      const w = 0.5 + 0.5 * Math.sin(t * 5 + i++);
      const big = this.boost ? 1.6 : 1;
      s.material.opacity = 0.45 + 0.45 * w;
      s.scale.setScalar((0.38 + 0.1 * w) * big * (it.glowScale || 1));
      if (Math.random() < (this.boost ? 0.05 : 0.015)) this.ctx.fx.burst(s.position, 0xfff4a0, { n: 4, speed: 0.4, size: 0.03, life: 0.6 });
    }
  }

  /** Wait until every target is done; nudge after a while, then let a sea friend help. */
  async objective(items, hint, auto) {
    const { ctx } = this;
    this.lastAction = ctx.time;
    const allDone = () => items.every((i) => i.done);
    let hinted = false;
    await ctx.until(() => {
      if (allDone()) return true;
      const idle = ctx.time - this.lastAction;
      if (idle > HINT_AT && !hinted) { hinted = true; this.boost = true; ctx.audio.say(hint, { hint: true }); }
      if (idle < 1) { this.boost = false; hinted = false; }
      return idle > AUTO_AT;
    });
    this.boost = false;
    if (!allDone()) {
      ctx.audio.say('o_help');
      for (const it of items) if (!it.done) { it.done = true; it.enabled = false; this.setGlow(it, false); auto(it); await ctx.wait(0.4); }
    }
  }

  toBag(obj) {
    const { ctx } = this;
    const from = obj.getWorldPosition(new THREE.Vector3());
    ctx.scene.attach(obj);
    const s0 = obj.scale.x;
    ctx.audio.sfx('chomp');
    return ctx.tween(0.45, (k) => { const bp = this.bag.getWorldPosition(new THREE.Vector3()); obj.position.lerpVectors(from, bp, k); obj.position.y += Math.sin(k * Math.PI) * 0.15; obj.scale.setScalar(s0 * (1 - 0.7 * k)); }).then(() => {
      this.bagInside.attach(obj);
      obj.position.set(rand(-0.05, 0.05), rand(-0.05, 0.02), rand(-0.05, 0.05));
      this.bagged = (this.bagged || 0) + 1;
      this.bagCount.setText(`🗑️ ${this.bagged}`);
      ctx.fx.burst(this.bag.getWorldPosition(new THREE.Vector3()), 0x7cf3a0, { n: 16, speed: 0.8 });
      ctx.audio.sfx('good');
    });
  }

  progress(n = 1) {
    this.score += n;
    const v = Math.min(1, this.score / this.total);
    this.gauge.set(v);
    const k0 = this._clean ?? 0; this._clean = v;
    this.ctx.tween(1.2, (k) => this.setClean(k0 + (v - k0) * k));
  }

  setClean(k) {
    const u = this.dome.userData.u;
    const lerp3 = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    u.uTop.value.copy(lerp3(0xa9c4b8, 0x9ff0ff)); u.uMid.value.copy(lerp3(0x4f7f7a, 0x36b0d6)); u.uBot.value.copy(lerp3(0x24404a, 0x10498c));
    if (this.U.visible && this.ctx.scene.fog?.isFogExp2) { this.ctx.scene.fog.color.copy(lerp3(0x5d8a84, 0x3fb6d8)); this.ctx.scene.fog.density = 0.075 - 0.045 * k; }
    this.rayMat.uniforms.uO.value = 0.08 + 0.12 * k;
  }

  heal(r) { this.healers.forEach((h) => h.heal(r)); }

  async swimTo(p, dur = 3.2) {
    const { ctx } = this;
    const from = ctx.rig.position.clone();
    ctx.audio.sfx('whoosh');
    await ctx.tween(dur, (k) => { ctx.rig.position.lerpVectors(from, p, k); ctx.rig.position.y += Math.sin(k * Math.PI) * 0.35; });
  }

  // ================================================================ run
  async run() {
    const { ctx } = this;
    const { scene, audio } = ctx;
    ctx.grab.world = this.root; ctx.grab.floorAt = () => -100;
    ctx.input.setLaser(true);
    this.offs.push(ctx.onUpdate((dt, t) => this.tick(dt, t)));
    this.phase = 'boat';

    // ---- 0. on the boat
    scene.background = this.hdr; scene.environment = this.hdr; scene.backgroundIntensity = 1; scene.environmentIntensity = 0.8;
    scene.fog = new THREE.Fog(0xcdeefa, 30, 140);
    ctx.rig.position.set(0, 0, 0);
    await ctx.fade(0, 0.8);
    audio.say('o_start');
    let worn = false;
    this.lastAction = ctx.time;
    this.target(this.mask, '🤿 스쿠버 마스크', () => { worn = true; });
    await ctx.until(() => worn || ctx.time - this.lastAction > AUTO_AT);
    const mp = this.mask.getWorldPosition(new THREE.Vector3()), head = ctx.camera.getWorldPosition(new THREE.Vector3());
    for (const it of [...ctx.grab.items]) { if (it.obj === this.mask) { this.setGlow(it, false); ctx.grab.items.delete(it); } }
    ctx.audio.sfx('whoosh');
    await ctx.tween(0.5, (k) => this.mask.position.lerpVectors(mp, head, k));
    this.mask.visible = false;
    audio.stop();
    audio.say('o_dive');
    await ctx.fade(1, 0.5);

    // ---- 1. coral reef clean-up
    this.phase = 'reef';
    this.S.visible = false; this.U.visible = true;
    scene.background = null; scene.environment = this.hdr; scene.environmentIntensity = 0.5;
    scene.fog = new THREE.FogExp2(0x5d8a84, 0.075);
    ctx.rig.position.copy(P.reef);
    ctx.rig.add(this.bag); ctx.rig.add(this.gauge); this.gauge.set(0);
    this.setClean(0); this.heal(-10);
    for (let i = 0; i < 30; i++) ctx.fx.burst(new THREE.Vector3(rand(-1, 1), rand(0.5, 2), rand(-1.5, 0.5)), 0xffffff, { n: 3, speed: 0.6, size: 0.04, gravity: -1.5, life: 1.4 });
    await ctx.fade(0, 0.8);
    audio.say('o_reef');
    const kinds = [() => litterBottle(), () => litterCan(), () => litterBag(), () => seaTrash('slipper'), () => seaTrash('foam'), () => seaTrash('line')];
    const names = ['💧 페트병', '🥤 음료 캔', '🍿 과자 봉지', '🩴 슬리퍼', '⬜ 스티로폼', '🧵 낚싯줄'];
    const spots = [[-0.7, 1.0, -0.8], [0.7, 1.1, -0.9], [-0.35, 1.55, -1.15], [0.4, 0.7, -0.75], [0.0, 1.25, -1.35], [0.95, 1.55, -1.2]];
    const trash = kinds.map((mk, i) => {
      const o = mk(); o.scale.multiplyScalar(1.4);
      o.position.copy(P.reef).add(new THREE.Vector3(...spots[i])); o.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      o.userData.home = o.position.clone(); this.U.add(o);
      return this.target(o, names[i], (it) => { this.toBag(it.obj); this.progress(1); });
    });
    this.floating = trash;
    await this.objective(trash, 'o_reef_hint', (it) => { this.toBag(it.obj); this.progress(1); });
    await ctx.wait(0.6);
    this.heal(6); ctx.audio.sfx('sparkle');
    for (let i = 0; i < 6; i++) setTimeout(() => ctx.fx.burst(new THREE.Vector3(rand(-3, 3), rand(-0.5, 1), rand(-4, 1)), pick(CORAL), { n: 26, speed: 1.4 }), i * 180);
    await audio.say('o_reef_done');

    // ---- 2. rescue three friends
    this.phase = 'rescue';
    await this.rescue('turtle', P.turtle, this.plastic, '🛍️ 비닐봉지', 'o_turtle', 'o_turtle_done', 12, () => this.spin(this.turtle));
    await this.rescue('fish', P.fish, this.net, '🕸️ 버려진 그물', 'o_fish', 'o_fish_done', 18, () => { this.trapped.speed = 1.6; this.fishFree = true; ctx.tween(0.5, (k) => this.net.userData.mesh.scale.setScalar(1 - 0.75 * k)); });
    await this.rescue('seal', P.seal, this.ring, '⭕ 플라스틱 고리', 'o_seal', 'o_seal_done', 26, () => this.spin(this.seal));

    // ---- 3. arctic: help the polar bear
    audio.say('o_north');
    await audio.idle();
    await ctx.fade(1, 0.7);
    this.phase = 'arctic';
    this.U.visible = false; this.A.visible = true;
    ctx.rig.remove(this.bag);
    scene.fog = new THREE.Fog(0xeaf8ff, 18, 120);
    ctx.rig.position.set(0, 0, 0);
    if (!ctx.renderer.xr.isPresenting) ctx.camera.rotation.x = -0.5; // screen mode: look down at the floe and ice
    await ctx.fade(0, 0.8);
    await audio.say('o_arctic');
    audio.say('o_ice');
    let placed = 0;
    const chunkItems = this.chunks.map((c) => this.target(c, '🧊 얼음 조각', (it) => this.addIce(it.obj, ++placed)));
    await this.objective(chunkItems, 'o_ice_hint', (it) => this.addIce(it.obj, ++placed));
    await ctx.wait(1.4);
    await this.momReturns();
    await audio.say('o_bear_done');
    await audio.say('o_bear_learn');

    // ---- 4. celebration in the clean reef
    await ctx.fade(1, 0.8);
    this.phase = 'end';
    this.A.visible = false; this.U.visible = true;
    scene.fog = new THREE.FogExp2(0x3fb6d8, 0.03);
    this.setClean(1); this.heal(80); this.gauge.visible = false;
    ctx.rig.position.copy(P.end);
    if (!ctx.renderer.xr.isPresenting) ctx.camera.rotation.x = -0.1;
    this.turtle.position.copy(P.end).add(new THREE.Vector3(-0.9, 0.95, -1.7)); this.turtle.rotation.set(0, 0.3, 0);
    this.seal.position.copy(P.end).add(new THREE.Vector3(0.95, 0.85, -1.8)); this.seal.rotation.set(0, -0.3, 0);
    this.trapped.center.copy(P.end).add(new THREE.Vector3(0, 2.0, -2.6));
    this.whaleShow = 0;
    this.friendsHappy = true;
    await ctx.fade(0, 0.8);
    ctx.audio.sfx('clear');
    for (let i = 0; i < 8; i++) setTimeout(() => ctx.fx.burst(P.end.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(1.2, 2.4), rand(-2.5, -1.2))), pick([0xff8ab0, 0x7fc8ff, 0xffe066, 0x7cf3a0]), { n: 30, speed: 1.6 }), i * 260);
    await audio.say('o_end');
    const cert = textPanel({ width: 1.3, height: 0.78, size: 62, bg: 'rgba(16,60,120,0.92)', border: 'rgba(255,220,120,0.95)' });
    cert.setText('🏅 바다 지킴이 인증 🏅\n\n🥤 일회용품 줄이기\n🗑️ 쓰레기는 쓰레기통에\n💡 전기 아끼기', { size: 60 });
    cert.position.copy(P.end).add(new THREE.Vector3(0, 1.75, -1.9));
    cert.scale.setScalar(0.001);
    this.U.add(cert); this.cert = cert;
    await ctx.tween(0.6, (k) => cert.scale.setScalar(Math.max(0.001, k)), (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2));
    await audio.say('o_end2');
    await ctx.wait(10);
  }

  async rescue(key, station, obj, label, line, doneLine, healR, celebrate) {
    const { ctx } = this;
    // trash that was left floating comes along (always in front of the diver)
    await this.swimTo(station);
    ctx.audio.say(line);
    let saved = false;
    const it = this.target(obj, label, () => { saved = true; });
    await this.objective([it], line + '_hint', () => { saved = true; });
    void saved;
    celebrate();
    this.toBag(obj);
    this.progress(1);
    this.heal(healR);
    const p = (key === 'fish' ? this.net : key === 'turtle' ? this.turtle : this.seal).getWorldPosition(new THREE.Vector3());
    ctx.fx.burst(p, 0xffe066, { n: 40, speed: 1.6 });
    ctx.audio.sfx('sparkle');
    await ctx.audio.say(doneLine);
  }

  spin(obj) {
    const r0 = obj.rotation.z;
    this.ctx.tween(1.0, (k) => (obj.rotation.z = r0 + k * Math.PI * 2));
  }

  addIce(chunk, n) {
    const { ctx } = this;
    chunk.userData.flying = true;
    const from = chunk.getWorldPosition(new THREE.Vector3());
    const r = 0.5 + n * 0.3;
    const a = [-2.2, 0.2, 2.6][n - 1] ?? rand(0, 6);
    const to = this.floe.position.clone().add(new THREE.Vector3(Math.cos(a) * (r - 0.15), 0.02, Math.sin(a) * (r - 0.15)));
    ctx.audio.sfx('whoosh');
    this.progress(1);
    ctx.tween(0.8, (k) => { chunk.position.lerpVectors(from, to, k); chunk.position.y += Math.sin(k * Math.PI) * 0.6; }).then(() => {
      ctx.audio.sfx('squash');
      ctx.fx.burst(to, 0xdff8ff, { n: 30, speed: 1.2 });
      const r0 = this.floeR; this.floeR = r;
      ctx.tween(0.6, (k) => { const s = r0 + (r - r0) * k; this.floe.scale.set(s, 1, s); chunk.scale.setScalar(1 - k); }, (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2)).then(() => (chunk.visible = false));
      this.cubHop = 0.6;
      if (n < 3) ctx.audio.say('o_ice_more', { hint: true });
    });
  }

  async momReturns() {
    const { ctx } = this;
    const from = this.mom.position.clone(), to = this.floe.position.clone().add(new THREE.Vector3(-0.5, 0, 0.1));
    this.mom.lookAt(to.x, from.y, to.z); this.mom.rotation.y += Math.PI;
    await ctx.tween(3.5, (k) => { this.mom.position.lerpVectors(from, to, k); this.mom.position.y = from.y + (to.y + 0.11 - from.y) * Math.max(0, (k - 0.75) / 0.25); });
    this.mom.rotation.y = Math.PI - 0.6; this.cub.rotation.y = Math.PI + 0.6;
    this.bearsHappy = true;
    ctx.audio.sfx('clear');
    for (let i = 0; i < 5; i++) setTimeout(() => ctx.fx.burst(this.floe.position.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0.8, 0)), 0xff7aa8, { n: 14, speed: 0.8, gravity: -0.5, life: 1.2 }), i * 300);
  }

  // ================================================================ per-frame
  tick(dt, t) {
    this.uTime.value = t;
    this.updateGlows(t);
    if (this.S.visible) {
      this.boat.userData.flag.rotation.y = Math.sin(t * 3) * 0.2;
      this.boat.rotation.z = Math.sin(t * 0.9) * 0.015; this.boat.rotation.x = Math.sin(t * 0.7) * 0.012;
      for (const d of this.dolphins) {
        const k = ((t * 0.18 + d.userData.ph) % 1);
        const x = d.userData.x + (k - 0.5) * 6;
        d.position.set(x, -0.6 + Math.sin(k * Math.PI) * 2.4, -9 - d.userData.ph);
        d.rotation.order = 'YXZ'; d.rotation.set(Math.cos(k * Math.PI) * 0.9, -Math.PI / 2, 0);
        d.visible = k > 0.05 && k < 0.95;
      }
      for (const g of this.gulls) { const u = g.userData; u.a += dt * 0.35; g.position.set(Math.cos(u.a) * u.r, u.h, -8 + Math.sin(u.a) * u.r); g.rotation.y = -u.a; const f = Math.sin(t * 6 + u.a) * 0.5; u.L.rotation.z = f; u.R.rotation.z = -f; }
    }
    if (this.U.visible) {
      this.schools.forEach((s) => s.update(dt, t));
      this.trapped.update(dt, t);
      if (this.fishFree) this.trapped.center.y += dt * 0.08;
      this.jellies.forEach((j) => j.userData.update(t, j.userData.ph));
      this.turtle.userData.update(t, this.phase === 'end' ? 1 : 0);
      this.seal.userData.update(t, this.phase === 'end' ? 1 : 0);
      this.whale.userData.update(t);
      if (this.phase === 'end') {
        this.whaleShow += dt;
        const k = Math.min(1, this.whaleShow / 18);
        this.whale.position.set(-18 + k * 36, 3.4 + Math.sin(t * 0.5) * 0.3, P.end.z - 9);
        this.whale.rotation.set(0, -Math.PI / 2, 0);
      } else {
        this.whaleA += dt * 0.05;
        this.whale.position.set(Math.sin(this.whaleA) * 15, 5.2, -16 + Math.cos(this.whaleA) * 14);
        this.whale.rotation.set(0, this.whaleA - Math.PI / 2, 0);
      }
      this.mantas.forEach((m, i) => { const u = m.userData; u.a += dt * 0.14; m.position.set((i ? 3 : -3) + Math.sin(u.a) * 5, 2.8 + Math.sin(u.a * 2) * 0.4, (i ? -20 : -9) + Math.cos(u.a) * 5); m.rotation.y = u.a - Math.PI / 2; m.rotation.z = Math.sin(u.a * 2) * 0.2; u.update(t); });
      const a = this.bubbles.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (0.3 + (i % 5) * 0.08); if (y > 7) y = FLOOR; a.setY(i, y); }
      a.needsUpdate = true;
      for (const it of this.floating || []) if (!it.done) { const h = it.obj.userData.home; it.obj.position.y = h.y + Math.sin(t * 1.3 + h.x * 3) * 0.04; it.obj.rotation.y += dt * 0.3; }
      if (this.friendsHappy) { this.turtle.position.y += Math.sin(t * 3) * 0.002; this.seal.rotation.z = Math.sin(t * 4) * 0.15; }
      if (this.cert) this.cert.position.y += Math.sin(t * 1.5) * 0.0006;
    }
    if (this.A.visible) {
      const s = this.snow.geometry.attributes.position;
      for (let i = 0; i < s.count; i++) { let y = s.getY(i) - dt * 0.4; if (y < -0.3) y = 7; s.setY(i, y); s.setX(i, s.getX(i) + Math.sin(t + i) * 0.002); }
      s.needsUpdate = true;
      for (const c of this.chunks) if (!c.userData.flying) c.position.y = c.userData.home.y + Math.sin(t * 1.6 + c.userData.home.x) * 0.03;
      this.floe.position.y = -0.2 + Math.sin(t * 1.2) * 0.015;
      // the cub shivers until its home is big again, then bounces happily
      if (this.bearsHappy) { this.cub.position.y = -0.09 + Math.abs(Math.sin(t * 5)) * 0.08; this.mom.position.y = -0.09 + Math.abs(Math.sin(t * 5 + 1)) * 0.05; }
      else {
        this.cubHop = Math.max(0, (this.cubHop || 0) - dt);
        this.cub.position.y = this.floe.position.y + 0.11 + Math.abs(Math.sin(this.cubHop * 10)) * 0.08 * (this.cubHop > 0 ? 1 : 0);
        this.cub.rotation.z = (this.cubHop > 0 ? 0 : Math.sin(t * 30) * 0.02);
        this.cub.userData.head.rotation.x = this.cubHop > 0 ? 0.2 : -0.35;
      }
      if (!this.bearsHappy) { this.mom.position.y = -0.45 + Math.sin(t * 2) * 0.03; }
    }
  }

  dispose() {
    this.offs.forEach((f) => f());
    for (const s of this.glows.values()) s.removeFromParent();
    this.bag.removeFromParent(); this.gauge.removeFromParent();
    this.ctx.input.setLaser(false);
    this.ctx.rig.position.set(0, 0, 0);
    this.ctx.grab.clear();
    const s = this.ctx.scene; s.fog = null; s.environment = null; s.background = null;
  }
}
