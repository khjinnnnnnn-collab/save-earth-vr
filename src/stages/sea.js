import * as THREE from 'three';
import { loadHDR, loadTexSet, uniqueMaterials } from '../assets.js';
import { blobGeometry, instanced, materials } from '../props.js';
import { textPanel } from '../ui.js';
import { litterCan, litterBottle, litterBag, litterPaper } from './land_items.js';
import { collectOrb } from './common.js';
import {
  makeTurtle, makeSeal, fishSchool, makeJelly, branchCoralGeometry, tubeSpongeGeometry, anemoneGeometry, starfishGeometry,
  seaFanTexture, kelpMaterial, palmGeometries, palmLeafTexture, makeUmbrella, makeTowel, makeSandcastle, makeBall,
  makeLighthouse, makeMask, maskOverlay, seaTrash,
} from './sea_props.js';

const UNDERWATER_LIMIT = 70;
const FLOOR = -1.2;
const STATIONS = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -7), new THREE.Vector3(2.0, 0, -14), new THREE.Vector3(-0.6, 0, -21)];
const CORAL = [0xff6fa8, 0xff9a3c, 0xb37bff, 0xffd23f, 0x3fe0c5, 0xff4d5e, 0x6fd0ff];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** x of the swim path at depth z (piecewise linear through the stations) */
function pathX(z) {
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i], b = STATIONS[i + 1];
    if (z <= a.z && z >= b.z) return a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
  }
  return z > 0 ? STATIONS[0].x : STATIONS[STATIONS.length - 1].x;
}

/** Scatter points over the reef floor, keeping the swim corridor open. */
function reef(n, { corridor = 0.95, xMax = 3.8, z0 = 3, z1 = -26 } = {}) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const z = rand(z1, z0), x = rand(-xMax, xMax) + pathX(z);
    if (Math.abs(x - pathX(z)) < corridor) continue;
    out.push({ x, z, d: -z, ry: rand(0, 6.28) });
  }
  return out;
}

function waterMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime; varying vec3 vW;
      void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p,1.0);
        w.y += sin(w.x*0.7 + uTime*1.2)*0.04 + sin(w.z*0.9 + uTime*0.9)*0.05;
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uClean; varying vec3 vW;
      void main(){
        float f = smoothstep(-3.0, -40.0, vW.z);
        vec3 shallow = mix(vec3(0.42,0.43,0.33), vec3(0.32,0.92,0.86), uClean);
        vec3 deep = mix(vec3(0.16,0.2,0.17), vec3(0.04,0.36,0.72), uClean);
        vec3 col = mix(shallow, deep, f);
        float w = sin(vW.x*2.3 + uTime*1.5)*sin(vW.z*1.9 - uTime*1.1);
        col += vec3(0.9) * smoothstep(0.86, 0.99, w) * (0.35 + 0.3*uClean) * (1.0 - f*0.7);
        float shore = smoothstep(-5.0, -3.2, vW.z + sin(vW.x*1.3 + uTime*1.4)*0.35);
        col = mix(col, vec3(1.0), shore * (0.6 + 0.4*sin(uTime*2.0 + vW.x)) * 0.8);
        col = mix(col, vec3(0.08,0.07,0.05), (1.0-uClean) * 0.35 * smoothstep(0.3,0.7, sin(vW.x*0.6+vW.z*0.4)));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class Sea {
  constructor(ctx) { this.ctx = ctx; this.root = new THREE.Group(); this.offs = []; this.uTime = { value: 0 }; }

  async load() {
    this.hdr = await loadHDR('kloofendal_48d_partly_cloudy_puresky');
    this.M = materials();
    this.beach = new THREE.Group();
    this.sea = new THREE.Group();
    this.sea.visible = false;
    this.root.add(this.beach, this.sea);
    this.buildBeach();
    this.buildReef();
    this.buildAnimals();
    this.buildTrash();
  }

  // ---------------------------------------------------------------- beach
  buildBeach() {
    const B = this.beach, M = this.M;
    B.add(new THREE.HemisphereLight(0xcfefff, 0xe8d2a0, 1.0));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(-3, 8, 4);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    B.add(sun);

    const sandT = loadTexSet('coast_sand_01', 14);
    // the beach slopes gently down under the water (no hard edge)
    const sandGeo = new THREE.PlaneGeometry(60, 48, 60, 96).rotateX(-Math.PI / 2);
    const sp = sandGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) { const z = sp.getZ(i) + 12.5; sp.setY(i, z < -2.6 ? (z + 2.6) * 0.22 : 0); }
    sandGeo.computeVertexNormals();
    const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandT.diff, normalMap: sandT.nor, color: 0xffeccc, roughness: 1 }));
    sand.position.z = 12.5; sand.receiveShadow = true;
    this.waterU = { uTime: this.uTime, uClean: { value: 0 } };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 80, 90, 80).rotateX(-Math.PI / 2), waterMaterial(this.waterU));
    water.position.set(0, -0.05, -43.5);
    B.add(sand, water);

    // sandstone cliffs framing the cove + sea rocks
    const cliffs = [];
    for (let i = 0; i < 22; i++) { const side = i % 2 ? 1 : -1; const z = rand(-12, 10); cliffs.push({ x: side * rand(6.5, 10) + (z < -4 ? side * 1.5 : 0), z, y: -0.5, ry: rand(0, 6), s: [rand(2, 3.5), rand(2.5, 5), rand(2, 3.5)] }); }
    for (let i = 0; i < 16; i++) cliffs.push({ x: rand(-12, 12), z: rand(-7, -22), y: -0.6, ry: rand(0, 6), s: [rand(0.6, 1.6), rand(0.6, 1.4), rand(0.6, 1.6)] });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xd9a066, vertexColors: true, roughness: 0.9 });
    instanced([{ geo: blobGeometry(2, 0.28), mat: rockMat }], cliffs, B);
    // grassy tops on the cliffs
    instanced([{ geo: blobGeometry(2, 0.2), mat: M.leaf }], cliffs.slice(0, 22).map((c) => ({ x: c.x, z: c.z, y: c.y + c.s[1] * 0.85, ry: c.ry, s: [c.s[0] * 0.8, 0.5, c.s[2] * 0.8] })), B);

    // palms all around the beach
    const leafMat = new THREE.MeshStandardMaterial({ map: palmLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a7048, roughness: 0.9 });
    const palmSpots = [[-3.4, -1.5], [-4.2, 0.8], [-5, 3], [-3.2, 4.5], [3.6, -0.5], [4.6, 2], [3, 4.8], [-1.2, 6.5], [1.8, 6.8], [-5.2, -2.6], [5.4, -2.4], [0, 9], [-2.8, -2.4], [3.0, -2.2], [-6.2, 0], [6.4, 0.6]];
    const palm = palmGeometries();
    instanced([{ geo: palm.trunk, mat: trunkMat }, { geo: palm.leaves, mat: leafMat }], palmSpots.map(([x, z]) => ({ x, z, ry: rand(0, 6), s: rand(0.9, 1.25) })), B);

    // beach props
    const add = (o, x, z, ry = 0) => { o.position.x = x; o.position.z = z; o.rotation.y = ry; B.add(o); return o; };
    add(makeUmbrella(), -2.0, -0.6, 0.3);
    add(makeTowel('#ff8fd1'), -2.2, -0.1, 0.2);
    add(makeTowel('#3ab0ff'), -1.4, 0.4, -0.3);
    add(makeSandcastle(), 1.9, -1.0);
    add(makeBall(), 1.2, 0.8);
    add(makeUmbrella(), 2.6, 2.6, -0.4);
    add(makeBall(), -1.0, -1.9);
    add(makeSandcastle(), -2.9, 1.6, 0.6).scale.setScalar(0.7);
    add(makeTowel('#ffd23f'), 2.2, 1.7, 0.4);
    // little crabs
    this.crabs = [[-1.6, -2.3], [1.4, -2.5], [0.6, -1.9]].map(([x, z]) => {
      const c = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.4 })); shell.scale.set(1.3, 0.6, 1); shell.position.y = 0.05;
      const claws = [-1, 1].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), shell.material); m.position.set(k * 0.12, 0.06, 0.06); return m; });
      const eyes = [-1, 1].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); m.position.set(k * 0.03, 0.12, 0.05); return m; });
      c.add(shell, ...claws, ...eyes); c.userData.x0 = x;
      return add(c, x, z, rand(-0.5, 0.5));
    });
    const lh = makeLighthouse(); lh.scale.setScalar(1.3); add(lh, -9, -26);
    instanced([{ geo: blobGeometry(2, 0.3), mat: rockMat }], [{ x: -9, z: -26, y: -1, s: [3, 1.8, 3] }], B);
    // wooden pier
    const pier = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 12), M.wood); deck.position.set(0, 0.35, -6);
    pier.add(deck);
    for (let z = 0; z > -12; z -= 2) for (const sx of [-0.6, 0.6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2), M.wood); post.position.set(sx, -0.2, z); pier.add(post); }
    add(pier, 4.6, -1.5);
    // starfish & shells
    const starMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    instanced([{ geo: starfishGeometry(), mat: starMat }], Array.from({ length: 16 }, () => ({ x: rand(-4, 4), z: rand(-2.5, 4), y: 0.01, ry: rand(0, 6), s: rand(0.8, 1.4), c: pick([0xff7a59, 0xffb347, 0xff6fa8]) })), B, { sick: 0xff7a59 }).heal(100);
    // seagulls
    this.gulls = Array.from({ length: 5 }, (_, i) => {
      const g = new THREE.Group();
      const wingGeo = new THREE.PlaneGeometry(0.35, 0.08).translate(0.175, 0, 0);
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const L = new THREE.Mesh(wingGeo, m), R = new THREE.Mesh(wingGeo, m); R.scale.x = -1;
      g.add(L, R); g.userData = { L, R, a: i * 1.3, r: rand(5, 9), h: rand(5, 8) };
      B.add(g); return g;
    });

    // litter on the beach
    const makers = [litterCan, litterBottle, litterBag, litterPaper, () => seaTrash('slipper'), () => seaTrash('foam')];
    this.beachLitter = Array.from({ length: 30 }, (_, i) => {
      const o = makers[i % makers.length]();
      let x, z; do { x = rand(-5, 5); z = rand(-2.6, 5); } while (Math.hypot(x, z + 0.6) < 1.1);
      o.position.set(x, 0.03, z); o.rotation.set(Math.PI / 2, rand(0, 6), 0);
      if (i % 6 >= 4) o.rotation.x = 0;
      B.add(o); return o;
    });

    // mask on a little stand
    const stand = this.stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.78, 16), M.wood); stand.position.set(0, 0.39, -0.6);
    this.maskGlow = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.6 }));
    this.maskGlow.position.set(0, 0.8, -0.6);
    B.add(stand, this.maskGlow);
    this.mask = makeMask();
    this.mask.position.set(0, 0.86, -0.6);
    B.add(this.mask);
  }

  // ---------------------------------------------------------------- reef
  buildReef() {
    const S = this.sea;
    this.hemi = new THREE.HemisphereLight(0x9fe8ff, 0x0b3b66, 1.3);
    const top = new THREE.DirectionalLight(0xdff8ff, 1.6); top.position.set(1, 10, 2);
    S.add(this.hemi, top);

    // sand floor with dunes and moving caustics
    const sandT = loadTexSet('coast_sand_01', 10);
    const floorGeo = new THREE.PlaneGeometry(30, 46, 60, 92).rotateX(-Math.PI / 2);
    const fp = floorGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), z = fp.getZ(i); fp.setY(i, Math.sin(x * 0.7) * 0.12 + Math.sin(z * 0.5 + x * 0.3) * 0.15 + Math.max(0, Math.abs(x) - 4) * 0.25); }
    floorGeo.computeVertexNormals();
    const floorMat = new THREE.MeshStandardMaterial({ map: sandT.diff, normalMap: sandT.nor, color: 0xf2e2b8, roughness: 1 });
    floorMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uTime;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 cp = vWP.xz * 1.3;
          float c1 = sin(cp.x * 2.0 + sin(cp.y * 1.7 + uTime * 1.3) * 1.5 + uTime);
          float c2 = sin(cp.y * 2.2 + sin(cp.x * 1.9 - uTime * 1.1) * 1.5 - uTime * 0.8);
          float caustic = pow(max(0.0, 1.0 - abs(c1 * c2)), 6.0);
          totalEmissiveRadiance += vec3(0.35, 0.55, 0.6) * caustic * 0.6;`);
    };
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, FLOOR, -11);
    S.add(floor);

    // canyon walls of colourful rocks
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const rocks = [];
    for (let z = 4; z > -28; z -= 1.6) for (const side of [-1, 1]) rocks.push({ x: pathX(z) + side * rand(3.6, 5.2), z: z + rand(-0.6, 0.6), y: FLOOR - 0.4, ry: rand(0, 6), s: [rand(1.2, 2.2), rand(1.5, 3.2), rand(1.2, 2.0)], d: -z, c: pick([0x7d8fd0, 0x9a84d6, 0x6fb3c4, 0x8f9fe0]) });
    rocks.push({ x: STATIONS[3].x, z: -27.5, y: FLOOR - 0.5, s: [5, 4, 2.5], d: 27, c: 0x8f9fe0 });
    this.healers = [instanced([{ geo: blobGeometry(2, 0.3), mat: rockMat, tintable: true }], rocks, S, { sick: 0x6f7378 })];

    // coral garden (bleached at first, colour returns as each station is saved)
    const SICK = 0xd8d4c8;
    const coralMat = () => new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const brain = reef(120).map((p) => ({ ...p, y: FLOOR + 0.05, s: [rand(0.18, 0.35), rand(0.14, 0.25), rand(0.18, 0.35)], c: pick(CORAL) }));
    const branch = reef(150).map((p) => ({ ...p, y: FLOOR, s: rand(0.9, 1.8), c: pick(CORAL) }));
    const tubes = reef(80).map((p) => ({ ...p, y: FLOOR, s: rand(0.9, 1.5), c: pick(CORAL) }));
    const anem = reef(100).map((p) => ({ ...p, y: FLOOR + 0.02, s: rand(1.0, 1.8), c: pick([0xff6fa8, 0xb37bff, 0x3fe0c5]) }));
    const stars = reef(40, { corridor: 0.4 }).map((p) => ({ ...p, y: FLOOR + 0.06, s: rand(1, 1.6), c: pick([0xff7a59, 0xffd23f, 0xff6fa8]) }));
    // coral on top of the canyon rocks
    const topC = rocks.map((r) => ({ x: r.x + rand(-0.4, 0.4), z: r.z + rand(-0.4, 0.4), y: r.y + r.s[1] * 0.9, ry: rand(0, 6), s: rand(1.2, 2), d: r.d, c: pick(CORAL) }));
    const fanTex = seaFanTexture();
    const fans = reef(60).map((p) => ({ ...p, y: FLOOR, s: rand(1, 1.8), c: pick([0xff4d5e, 0xb37bff, 0xffd23f]) }));
    this.healers.push(
      instanced([{ geo: blobGeometry(2, 0.35), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), tintable: true }], brain, S, { sick: SICK }),
      instanced([{ geo: branchCoralGeometry(), mat: coralMat(), tintable: true }], [...branch, ...topC], S, { sick: SICK }),
      instanced([{ geo: tubeSpongeGeometry(), mat: new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), tintable: true }], tubes, S, { sick: SICK }),
      instanced([{ geo: anemoneGeometry(), mat: coralMat(), tintable: true }], anem, S, { sick: SICK }),
      instanced([{ geo: starfishGeometry(), mat: coralMat(), tintable: true }], stars, S, { sick: SICK }),
      instanced([{ geo: new THREE.PlaneGeometry(0.5, 0.5).translate(0, 0.25, 0), mat: new THREE.MeshStandardMaterial({ map: fanTex, alphaTest: 0.4, side: THREE.DoubleSide }), tintable: true }], fans, S, { sick: SICK }),
    );
    // kelp forest behind the reef
    const kelp = [];
    for (let i = 0; i < 110; i++) { const z = rand(-27, 4); kelp.push({ x: pathX(z) + (Math.random() < 0.5 ? -1 : 1) * rand(2.4, 4.5), z, y: FLOOR, ry: rand(0, 3), s: [1, rand(0.7, 1.4), 1] }); }
    instanced([{ geo: new THREE.PlaneGeometry(0.28, 3, 1, 10).translate(0, 1.5, 0), mat: kelpMaterial(this.uTime) }], kelp, S);

    // water surface seen from below + light shafts + bubbles
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(40, 60).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.55, fog: false, side: THREE.DoubleSide }));
    surf.position.set(0, 5, -12);
    S.add(surf);
    this.rays = Array.from({ length: 8 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.2, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xcff8ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const z = 2 - i * 3.6;
      m.position.set(pathX(z) + rand(-2, 2), 1.5, z); m.rotation.z = rand(-0.25, 0.25);
      S.add(m); return m;
    });
    const nb = 260, bp = new Float32Array(nb * 3);
    for (let i = 0; i < nb; i++) { const z = rand(-26, 3); bp.set([pathX(z) + rand(-4, 4), rand(FLOOR, 5), z], i * 3); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xe8fbff, size: 0.04, transparent: true, opacity: 0.7, map: this.ctx.fx.tex, depthWrite: false }));
    S.add(this.bubbles);

    // ambient life
    this.schools = [
      fishSchool(S, new THREE.Vector3(-2.5, 1.6, -3), { n: 22, radius: 1.4, color: 0xffa31a }),
      fishSchool(S, new THREE.Vector3(3.2, 2.0, -10), { n: 26, radius: 1.8, color: 0x3ab0ff, stripe: 0xffe066, speed: -0.7 }),
      fishSchool(S, new THREE.Vector3(-2.5, 2.4, -17), { n: 22, radius: 1.6, color: 0xff6fa8 }),
      fishSchool(S, new THREE.Vector3(1.5, 2.8, -24), { n: 20, radius: 1.5, color: 0xffd23f, stripe: 0x3a3a3a, speed: -0.6 }),
    ];
    this.jellies = Array.from({ length: 9 }, (_, i) => {
      const j = makeJelly(pick([0xff9ad5, 0xb9a4ff, 0x8fe8ff]));
      const z = 1 - i * 3.1;
      j.position.set(pathX(z) + (i % 2 ? 1 : -1) * rand(1.4, 2.6), rand(1.6, 3.2), z);
      j.userData.ph = Math.random() * 6;
      S.add(j); return j;
    });

    // gauge + mesh bag ride along with the player
    this.gauge = this.ctx.ui.gauge({ width: 0.9, label: '🌊 바다 회복', color: '#3ab0ff' });
    this.gauge.position.set(0, 2.0, -1.9);
    this.bag = this.makeBag();
  }

  makeBag() {
    const g = new THREE.Group();
    const netTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = '#ffffff'; x.lineWidth = 6; for (let i = -128; i < 256; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t; })();
    const net = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), new THREE.MeshStandardMaterial({ color: 0x2fd18a, map: netTex, alphaMap: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff8a1f }));
    rim.position.y = 0.075;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.5 }));
    glow.position.y = 0.08;
    this.bagCount = textPanel({ width: 0.2, height: 0.07, text: '🗑️ 0', size: 80 });
    this.bagCount.position.y = 0.22;
    this.bagInside = new THREE.Group();
    g.add(net, rim, glow, this.bagCount, this.bagInside);
    g.position.set(-0.4, 0.9, -0.5);
    g.scale.setScalar(0.85);
    g.userData.glow = glow;
    return g;
  }

  // ---------------------------------------------------------------- animals & trash
  buildAnimals() {
    const S = this.sea;
    const st = (i, dx, dy, dz) => STATIONS[i].clone().add(new THREE.Vector3(dx, dy, dz));

    this.turtle = makeTurtle();
    this.turtle.position.copy(st(1, 0.1, 1.0, -1.25));
    this.turtle.rotation.y = -0.15;
    S.add(this.turtle);
    const plastic = seaTrash('bag');
    plastic.scale.setScalar(1.6);
    plastic.position.copy(st(1, 0.12, 1.05, -0.62));
    S.add(plastic);

    this.trapped = fishSchool(S, st(2, 0, 1.1, -1.3), { n: 14, radius: 0.28, color: 0xff7a3c, height: 0.12, speed: 0.4 });
    const netTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = '#d9e7c7'; x.lineWidth = 4; for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3); return t; })();
    const netGroup = new THREE.Group();
    const netMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc8d8b0, map: netTex, alphaMap: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    netMesh.position.z = -0.5;
    const float = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x552200, roughness: 0.3 }));
    netGroup.add(netMesh, float);
    netGroup.position.copy(st(2, 0, 1.1, -0.8));
    netGroup.userData.netMesh = netMesh;
    S.add(netGroup);

    this.seal = makeSeal();
    this.seal.position.copy(st(3, 0, 0.85, -1.3));
    S.add(this.seal);
    const ring = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, roughness: 0.2 }));
    torus.rotation.x = Math.PI / 2 - 0.4;
    ring.add(torus);
    ring.position.copy(this.seal.position).add(new THREE.Vector3(0, 0.2, 0.28));
    S.add(ring);

    this.rescues = [
      { station: 1, animal: this.turtle, obj: plastic, line: 'sea_turtle', saved: 'sea_saved_turtle', done: false },
      { station: 2, animal: null, school: this.trapped, obj: netGroup, line: 'sea_fish', saved: 'sea_saved_fish', done: false },
      { station: 3, animal: this.seal, obj: ring, line: 'sea_seal', saved: 'sea_saved_seal', done: false },
    ];
  }

  buildTrash() {
    const kinds = [() => seaTrash('slipper'), () => litterBottle(), () => seaTrash('foam'), () => litterCan(), () => seaTrash('line'), () => litterBag(), () => litterBottle(), () => seaTrash('slipper'), () => litterCan()];
    this.floaters = kinds.map((mk, i) => {
      const st = STATIONS[1 + Math.floor(i / 3)];
      const side = [-1, 1, -0.2][i % 3];
      const o = uniqueMaterials(mk());
      o.position.set(st.x + side * rand(0.55, 0.8), rand(1.0, 1.5), st.z + rand(-0.9, -0.3) + (i % 3 === 2 ? 1.6 : 0));
      o.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      this.sea.add(o);
      return o;
    });
  }

  // ---------------------------------------------------------------- run
  setClean(k) {
    const f = this.ctx.scene.fog;
    if (f) { f.color.setRGB(0.2 + 0.0 * k, 0.33 + 0.27 * k, 0.33 + 0.42 * k); f.density = 0.11 - 0.06 * k; this.ctx.scene.background.copy(f.color); }
    this.hemi.intensity = 1.0 + 0.6 * k;
  }

  async run() {
    const { ctx } = this;
    const { scene } = ctx;
    ctx.grab.world = this.root;
    ctx.grab.floorAt = () => -100;
    scene.background = this.hdr; scene.environment = this.hdr; scene.fog = null;
    scene.backgroundIntensity = 0.9; scene.environmentIntensity = 0.8;
    this.offs.push(ctx.onUpdate((dt, t) => this.tick(dt, t)));
    await ctx.fade(0, 0.8);

    // 1) beach: pick up the snorkel mask and put it on
    ctx.audio.say('sea_start', { priority: 2 });
    let worn = false;
    const maskItem = ctx.grab.add(this.mask, { radius: 0.14, physics: false });
    const head = new THREE.Vector3(), mp = new THREE.Vector3();
    maskItem.onHeld = () => {
      ctx.camera.getWorldPosition(head); this.mask.getWorldPosition(mp);
      if (mp.distanceTo(head) < 0.3 || (maskItem.heldBy?.isDesktop && ctx.time - maskItem.grabTime > 0.7)) worn = true;
    };
    maskItem.onRelease = () => { this.mask.position.set(0, 0.86, -0.6); this.mask.rotation.set(0, 0, 0); };
    await ctx.until(() => worn, 20);
    ctx.audio.sfx('whoosh');
    maskItem.heldBy?.pulse(0.8, 150);
    ctx.grab.remove(maskItem);
    await ctx.audio.say('sea_dive', { priority: 2 });
    await ctx.fade(1, 0.6);

    // 2) underwater
    this.beach.visible = false; this.sea.visible = true;
    scene.background = new THREE.Color(); scene.environment = this.hdr; scene.environmentIntensity = 0.5;
    scene.fog = new THREE.FogExp2(0x305050, 0.1);
    this.setClean(0);
    this.overlay = maskOverlay();
    ctx.camera.add(this.overlay);
    ctx.rig.add(this.bag);
    ctx.rig.add(this.gauge);
    this.healers.forEach((h) => h.heal(-3));
    this.total = 3 * 2 + this.floaters.length + 3;
    this.score = 0; this.bagged = 0;
    this.trashItems = this.floaters.map((o) => this.makeTrash(o));
    this.elapsed = 0; this.underwater = true;
    await ctx.fade(0, 0.8);
    ctx.audio.sfx('whoosh');

    for (let i = 0; i < this.rescues.length && this.elapsed < UNDERWATER_LIMIT; i++) {
      if (i === 0) { await ctx.audio.say('sea_swim', { priority: 2 }); }
      await this.swimTo(i + 1, i > 0);
      if (this.elapsed >= UNDERWATER_LIMIT) break;
      await this.rescue(this.rescues[i]);
      if (i === 0) ctx.audio.say('sea_bag');
    }
    const timeUp = this.elapsed >= UNDERWATER_LIMIT;
    if (timeUp) await ctx.audio.say('sea_timeup', { priority: 2 });
    // anything left is tidied up by the sea friends
    for (const r of this.rescues) if (!r.done) this.free(r, false);
    ctx.input.active.forEach((h) => h.held && ctx.grab.release(h));
    for (const it of [...ctx.grab.items]) if (it.trash) { this.toBag(it); await ctx.wait(0.12); }
    this.heal(40);
    await ctx.wait(1.0);

    // 3) back to a sparkling beach
    await ctx.fade(1, 0.7);
    this.underwater = false;
    this.overlay.removeFromParent(); this.bag.removeFromParent(); this.gauge.removeFromParent();
    ctx.rig.position.set(0, 0, 0);
    this.sea.visible = false; this.beach.visible = true;
    scene.fog = null; scene.background = this.hdr; scene.environment = this.hdr; scene.environmentIntensity = 1; scene.backgroundIntensity = 1;
    this.waterU.uClean.value = 1;
    this.beachLitter.forEach((o) => (o.visible = false));
    this.mask.visible = false; this.maskGlow.visible = false; this.stand.visible = false;
    // rescued friends come to say hi
    this.turtle.position.set(-1.0, 0.12, -2.2); this.turtle.rotation.y = 0.5; this.beach.add(this.turtle);
    this.seal.position.set(1.2, 0.35, -2.4); this.seal.rotation.set(0, -0.4, 0); this.beach.add(this.seal);
    this.friendsHappy = true;
    await ctx.fade(0, 0.8);
    ctx.audio.sfx('clear');
    for (let i = 0; i < 5; i++) setTimeout(() => ctx.fx.burst(new THREE.Vector3(rand(-1.5, 1.5), rand(1, 2), rand(-3, -1.5)), pick([0xff8ab0, 0x7fc8ff, 0xffe066]), { n: 30, speed: 1.6 }), i * 250);
    await ctx.audio.say('sea_clear', { priority: 2 });
    await collectOrb(ctx, this.root, 'sea', this.offs);
  }

  heal(r) { this.healers.forEach((h) => h.heal(r)); }

  progress(n) {
    this.score += n;
    const v = Math.min(1, this.score / this.total);
    this.gauge.set(v);
    const k0 = this._clean ?? 0, k1 = v;
    this._clean = k1;
    this.ctx.tween(1.0, (k) => this.setClean(k0 + (k1 - k0) * k));
  }

  async swimTo(i, needGesture) {
    const { ctx } = this;
    const target = STATIONS[i];
    if (needGesture) {
      ctx.audio.say('sea_swim');
      let stroke = 0;
      const desktop = !ctx.renderer.xr.isPresenting;
      await ctx.until(() => {
        const hs = ctx.input.active.filter((h) => !h.isDesktop);
        const fast = hs.some((h) => h.velocity.length() > 0.9);
        stroke = fast ? stroke + 1 : Math.max(0, stroke - 0.25);
        return stroke > 12;
      }, desktop ? 2.5 : 7);
    }
    const from = ctx.rig.position.clone();
    ctx.audio.sfx('whoosh');
    await ctx.tween(2.6, (k) => ctx.rig.position.lerpVectors(from, target, k));
    if (this.rescues[i - 1]) ctx.audio.say(this.rescues[i - 1].line, { priority: 2 });
  }

  rescue(r) {
    const { ctx } = this;
    return new Promise((resolve) => {
      const it = ctx.grab.add(r.obj, { radius: 0.16, physics: false, priority: 1 });
      it.trash = false;
      it.onGrab = () => {
        if (!r.done) this.free(r, true);
        it.trash = true;
        resolve();
      };
      it.onRelease = () => this.releaseTrash(it);
      r.item = it;
      // safety: don't let a stuck child block the show
      const limit = this.elapsed + 16;
      ctx.until(() => r.done || this.elapsed > limit || this.elapsed >= UNDERWATER_LIMIT).then(() => { if (!r.done) { this.free(r, true); it.trash = true; this.toBag(it); } resolve(); });
    });
  }

  free(r, celebrate) {
    const { ctx } = this;
    r.done = true;
    if (r.school) { r.school.speed = 1.4; r.freed = true; }
    if (r.obj.userData.netMesh) ctx.tween(0.4, (k) => r.obj.userData.netMesh.scale.setScalar(1 - k * 0.7));
    r.happy = 0;
    this.progress(2);
    this.heal(-STATIONS[r.station].z + 3.5);
    if (celebrate) {
      ctx.audio.sfx('good'); ctx.audio.sfx('sparkle');
      const p = (r.animal || r.obj).getWorldPosition(new THREE.Vector3());
      ctx.fx.burst(p, 0xff8ab0, { n: 40, speed: 1.4, size: 0.06 });
      ctx.audio.say(r.saved, { priority: 2 });
    }
  }

  makeTrash(o) {
    const it = this.ctx.grab.add(o, { radius: 0.14, physics: false });
    it.trash = true;
    it.home = o.position.clone();
    it.onRelease = () => this.releaseTrash(it);
    return it;
  }

  releaseTrash(it) {
    const { ctx } = this;
    if (!it.trash) return;
    const bp = this.bag.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
    const p = it.obj.getWorldPosition(new THREE.Vector3());
    let inBag = p.distanceTo(bp) < 0.42;
    const hand = ctx.input.desktop;
    if (!inBag && !ctx.renderer.xr.isPresenting) {
      // desktop: dropping where the cursor points at the bag counts
      const ray = new THREE.Ray(hand.rayOrigin, hand.rayDir);
      inBag = ray.distanceToPoint(bp) < 0.2;
    }
    if (inBag) this.toBag(it);
    else it.home = this.root.worldToLocal(p.clone());
  }

  toBag(it) {
    const { ctx } = this;
    if (it.bagged) return;
    it.bagged = true;
    it.enabled = false;
    ctx.grab.setHighlight(it, false);
    const from = it.obj.getWorldPosition(new THREE.Vector3());
    ctx.grab.items.delete(it);
    ctx.scene.attach(it.obj);
    const s0 = it.obj.scale.x;
    ctx.audio.sfx('chomp');
    ctx.tween(0.35, (k) => { const bp = this.bag.getWorldPosition(new THREE.Vector3()); it.obj.position.lerpVectors(from, bp, k); it.obj.scale.setScalar(s0 * (1 - 0.6 * k)); }).then(() => {
      this.bagInside.attach(it.obj);
      it.obj.position.set(rand(-0.06, 0.06), rand(-0.05, 0.03), rand(-0.06, 0.06));
      this.bagged++;
      this.bagCount.setText(`🗑️ ${this.bagged}`);
      ctx.fx.burst(this.bag.getWorldPosition(new THREE.Vector3()), 0x7cf3a0, { n: 16, speed: 0.8 });
      ctx.audio.sfx('good');
      this.progress(1);
    });
  }

  tick(dt, t) {
    this.uTime.value = t;
    if (this.underwater) this.elapsed += dt;
    // mask stand glow + gulls
    this.maskGlow.material.opacity = 0.35 + 0.3 * Math.sin(t * 5);
    for (const c of this.crabs) c.position.x = c.userData.x0 + Math.sin(t * 1.5 + c.userData.x0 * 3) * 0.25;
    for (const g of this.gulls) { const u = g.userData; u.a += dt * 0.35; g.position.set(Math.cos(u.a) * u.r, u.h, -6 + Math.sin(u.a) * u.r); g.rotation.y = -u.a; const f = Math.sin(t * 6 + u.a) * 0.5; u.L.rotation.z = f; u.R.rotation.z = -f; }
    if (!this.sea.visible && !this.friendsHappy) return;
    this.schools.forEach((s) => s.update(dt, t));
    this.trapped.update(dt, t);
    this.jellies.forEach((j) => j.userData.update(t, j.userData.ph));
    for (const r of this.rescues) {
      if (r.animal) r.animal.userData.update(t, r.done ? 1 : 0);
      if (r.done && r.animal && this.underwater) { r.happy = (r.happy || 0) + dt; r.animal.rotation.z = Math.sin(r.happy * 6) * 0.15 * Math.max(0, 1 - r.happy / 3); }
      if (r.school && r.freed) r.school.center.y += dt * 0.05;
    }
    if (this.friendsHappy) { this.turtle.position.y = 0.12 + Math.abs(Math.sin(t * 3)) * 0.08; this.seal.rotation.z = Math.sin(t * 4) * 0.12; }
    // floating trash bobs gently
    for (const it of this.trashItems || []) if (!it.heldBy && !it.bagged && it.home) { it.obj.position.y = it.home.y + Math.sin(t * 1.3 + it.home.x) * 0.04; it.obj.rotation.y += dt * 0.3; }
    for (const r of this.rescues) if (r.item && !r.item.heldBy && !r.item.bagged && r.done && r.item.home) r.item.obj.position.y = r.item.home.y + Math.sin(t * 1.3) * 0.04;
    // bubbles + light shafts
    const a = this.bubbles.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (0.3 + (i % 5) * 0.08); if (y > 5) y = FLOOR; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 2 + i) * 0.002); }
    a.needsUpdate = true;
    this.rays.forEach((r, i) => (r.material.opacity = 0.04 + 0.03 * Math.sin(t * 0.8 + i)));
    if (this.bag.userData.glow) this.bag.userData.glow.material.opacity = 0.3 + 0.25 * Math.sin(t * 4);
  }

  dispose() {
    this.offs.forEach((f) => f());
    this.overlay?.removeFromParent(); this.bag?.removeFromParent(); this.gauge?.removeFromParent();
    this.ctx.rig.position.set(0, 0, 0);
    this.ctx.grab.clear();
    const s = this.ctx.scene; s.fog = null; s.environment = null; s.background = null;
  }
}
