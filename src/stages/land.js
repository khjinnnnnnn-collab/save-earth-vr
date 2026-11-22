import * as THREE from 'three';
import { loadHDR, loadTexSet, instance, loadModel } from '../assets.js';
import { BINS, SEQUENCE, makeItem, makeBin, crumpledLabel, litterCan, litterBottle, litterBag, litterPaper } from './land_items.js';
import { materials, blobGeometry, treeGeometries, instanced, bunting, butterflies } from '../props.js';
import { collectOrb } from './common.js';

export const LAND_MODELS = ['flower_gazania', 'celandine_01', 'dandelion_01', 'grass_medium_01', 'painted_wooden_bench', 'trashbag', 'plastic_bottle_gallon', 'multi_cleaner_bottle', 'russian_food_cans_01', 'wine_bottles_01', 'cardboard_box_01'];
const TIME_LIMIT = 70;
const TABLE = { x: 0, z: -0.55, y: 0.7, w: 0.95, d: 0.5 };
const SLOTS = [-0.3, 0, 0.3];
const BIN_R = 2.15;
const BIN_ANGLES = [-54, -27, 0, 27, 54];
const MAX_ON_TABLE = 3;
const rand = (a, b) => a + Math.random() * (b - a);

/** gltfpack stores quantized (int16) attributes; expand to float before baking transforms into them. */
function dequantize(geo) {
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent ? a.getComponent(i, k) : a.array[i * a.itemSize + k];
    geo.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  return geo;
}

/** Instanced scatter of a model node (all its sub-meshes) — cheap foliage/flowers. */
async function scatter(id, nodeNames, placements, root, fixFoliage = false) {
  const scene = await loadModel(id);
  const groups = [];
  for (const name of nodeNames) {
    const node = scene.getObjectByName(name);
    if (!node) continue;
    node.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const meshes = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const geo = dequantize(o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
      // fake leaf translucency so backlit foliage doesn't go black
      const mat = o.material.clone();
      mat.side = THREE.DoubleSide; mat.roughness = 1;
      if (mat.map) { mat.emissive = new THREE.Color(0.55, 0.62, 0.45); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.55; }
      if (fixFoliage) { mat.normalMap = null; mat.color = new THREE.Color(1.1, 1.2, 0.95); }
      meshes.push({ geo, mat, box });
    });
    groups.push(meshes);
  }
  if (!groups.length) { console.warn('scatter: no nodes found in', id); return { update() {} }; }
  const perGroup = groups.map(() => []);
  placements.forEach((p, i) => perGroup[i % groups.length].push(p));
  perGroup.forEach((l) => l.sort((a, b) => a.d - b.d));
  const out = [];
  groups.forEach((meshes, gi) => {
    const list = perGroup[gi];
    if (!list.length) return;
    const minY = Math.min(...meshes.map((m) => m.box.min.y));
    const ims = meshes.map(({ geo, mat }) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.receiveShadow = true;
      im.frustumCulled = false;
      root.add(im);
      return im;
    });
    out.push({ ims, list, minY });
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  const api = {
    /** grow instances whose distance is within radius */
    update(radius, force = false) {
      for (const g of out) {
        let dirty = force;
        g.list.forEach((p, i) => {
          const k = THREE.MathUtils.clamp((radius - p.d) / 1.2, 0, 1);
          if (!force && Math.abs(k - (p.k ?? -1)) < 0.01) return;
          p.k = k; dirty = true;
          const sc = p.s * (k < 1 ? k * (1 + Math.sin(k * Math.PI) * 0.25) : 1);
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.r);
          s.setScalar(Math.max(sc, 1e-4));
          pos.set(p.x, (p.y || 0) - g.minY * sc, p.z);
          m.compose(pos, q, s);
          g.ims.forEach((im) => im.setMatrixAt(i, m));
        });
        const visible = g.list.filter((p) => p.k > 0).length;
        if (dirty) g.ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; im.count = visible; });
      }
    },
  };
  return api;
}

function ringPlacements(n, rMin, rMax, sMin, sMax, avoid) {
  const out = [];
  while (out.length < n) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(rand(rMin * rMin, rMax * rMax));
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (avoid && avoid(x, z)) continue;
    out.push({ x, z, d, r: Math.random() * Math.PI * 2, s: rand(sMin, sMax) });
  }
  return out;
}

export class Land {
  constructor(ctx) { this.ctx = ctx; this.root = new THREE.Group(); this.offs = []; }

  async load() {
    const { root } = this;
    const [hdr] = await Promise.all([loadHDR('kloofendal_48d_partly_cloudy_puresky'), ...LAND_MODELS.map(loadModel)]);
    this.hdr = hdr;

    // Lights
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.0);
    sun.position.set(4, 8, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    sun.shadow.bias = -0.0005;
    root.add(sun, sun.target);
    this.sun = sun;

    // Ground: healthy grass spreads over polluted mud as the park recovers.
    const grass = loadTexSet('leafy_grass', 26), mud = loadTexSet('brown_mud_leaves_01', 26);
    this.uRadius = { value: 0.0 };
    const gmat = new THREE.MeshStandardMaterial({ map: grass.diff, normalMap: grass.nor, roughness: 0.95 });
    gmat.onBeforeCompile = (sh) => {
      sh.uniforms.uRadius = this.uRadius;
      sh.uniforms.uMud = { value: mud.diff };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uRadius; uniform sampler2D uMud;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`)
        .replace('#include <map_fragment>', `
  vec4 gcol = texture2D(map, vMapUv);
  float glum = dot(gcol.rgb, vec3(0.3, 0.59, 0.11));
  gcol.rgb = mix(gcol.rgb, vec3(0.26, 0.52, 0.12) * glum * 2.1, 0.85);
  vec4 mcol = texture2D(uMud, vMapUv * 0.8);
  mcol.rgb *= vec3(0.62, 0.6, 0.55);
  float dd = length(vWPos.xz) + (vn(vWPos.xz * 0.7) - 0.5) * 2.2;
  float kk = smoothstep(uRadius, uRadius - 1.4, dd);
  diffuseColor *= mix(mcol, gcol, kk);`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2), gmat);
    ground.receiveShadow = true;
    root.add(ground);

    // Smog dome (fades away when the park is clean)
    this.smog = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: 0x8d8a7c, transparent: true, opacity: 0.62, side: THREE.BackSide, depthWrite: false, fog: false }));
    root.add(this.smog);

    // Bins in an arc
    this.bins = BINS.map((def, i) => {
      const b = makeBin(def);
      const a = THREE.MathUtils.degToRad(BIN_ANGLES[i]);
      b.position.set(Math.sin(a) * BIN_R, 0, -Math.cos(a) * BIN_R);
      b.lookAt(0, 0, 0);
      root.add(b);
      return b;
    });

    // Sorting table
    const woodTex = loadTexSet('brown_planks_04', 1);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex.diff, normalMap: woodTex.nor, color: 0xd8b48a, roughness: 0.75 });
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.04, TABLE.d), wood);
    top.position.y = TABLE.y - 0.02;
    table.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE.y - 0.04, 0.05), wood);
      leg.position.set(sx * (TABLE.w / 2 - 0.05), (TABLE.y - 0.04) / 2, sz * (TABLE.d / 2 - 0.05));
      table.add(leg);
    }
    table.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    table.position.set(TABLE.x, 0, TABLE.z);
    root.add(table);

    // ---------- Park plaza: dense, framed "game map" layout ----------
    const M = materials();
    this.mats = M;
    const polar = (deg, r) => { const a = THREE.MathUtils.degToRad(deg); return { x: Math.sin(a) * r, z: -Math.cos(a) * r }; };
    const ring = (n, r0, r1, skip = null) => Array.from({ length: n }, (_, i) => {
      const deg = (i / n) * 360 + rand(-4, 4), r = rand(r0, r1);
      const p = polar(deg, r);
      return skip && skip(deg) ? null : { ...p, d: r, deg };
    }).filter(Boolean);

    // paved plaza
    const brick = loadTexSet('brick_pavement_02', 5);
    this.plazaMat = new THREE.MeshStandardMaterial({ map: brick.diff, normalMap: brick.nor, color: 0x8a8070, roughness: 0.85 });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.45, 64).rotateX(-Math.PI / 2), this.plazaMat);
    plaza.position.y = 0.004; plaza.receiveShadow = true;
    const curb = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.05, 6, 96).rotateX(Math.PI / 2), M.paint);
    curb.position.y = 0.02;
    root.add(plaza, curb);

    // picket fence with an opening behind the player
    const GAP = 22; // degrees each side of 180
    const pickets = [];
    for (let deg = -180 + GAP; deg <= 180 - GAP; deg += 2.4) { const p = polar(deg, 3.6); pickets.push({ ...p, ry: -THREE.MathUtils.degToRad(deg), s: 1 }); }
    const picketGeo = new THREE.BoxGeometry(0.07, 0.62, 0.025).translate(0, 0.31, 0);
    instanced([{ geo: picketGeo, mat: M.paint }], pickets, root);
    const arc = THREE.MathUtils.degToRad(360 - GAP * 2);
    for (const h of [0.2, 0.48]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.018, 4, 120, arc), M.paint);
      rail.rotation.set(Math.PI / 2, 0, Math.PI / 2 + THREE.MathUtils.degToRad(GAP));
      rail.position.y = h;
      root.add(rail);
    }

    // lamp posts + festive bunting between them
    const lampDegs = [-150, -105, -60, -20, 20, 60, 105, 150];
    const lamps = lampDegs.map((d) => ({ ...polar(d, 3.6), s: 1 }));
    instanced([
      { geo: new THREE.CylinderGeometry(0.04, 0.06, 2.6, 8).translate(0, 1.3, 0), mat: M.metal },
      { geo: new THREE.CylinderGeometry(0.13, 0.09, 0.28, 6).translate(0, 2.72, 0), mat: M.metal },
      { geo: new THREE.SphereGeometry(0.1, 12, 8).translate(0, 2.7, 0), mat: M.glow },
    ], lamps, root);
    bunting(lamps.map((l) => new THREE.Vector3(l.x, 2.55, l.z)).slice(0, 8), root, { sag: 0.3, perSpan: 8 });

    // raised flower planters behind the bins and around the plaza
    const planterDegs = [-40, 0, 40, -88, 88];
    this.planters = planterDegs.map((d) => ({ ...polar(d, d === 0 || Math.abs(d) === 40 ? 3.0 : 2.95), ry: -THREE.MathUtils.degToRad(d), s: 1 }));
    instanced([
      { geo: new THREE.BoxGeometry(1.1, 0.34, 0.42).translate(0, 0.17, 0), mat: M.wood },
      { geo: new THREE.BoxGeometry(1.0, 0.02, 0.34).translate(0, 0.33, 0), mat: M.soil },
    ], this.planters, root);

    // benches
    await Promise.all([-125, 125].map(async (d) => { const o = await instance('painted_wooden_bench'); const p = polar(d, 3.05); o.position.set(p.x, 0, p.z); o.lookAt(0, 0, 0); root.add(o); }));

    // hedge ring just outside the fence
    const hedge = ring(110, 4.0, 4.35, (deg) => Math.abs(Math.abs(deg) - 180) < GAP - 4).map((p) => ({ ...p, s: [rand(0.45, 0.65), rand(0.4, 0.6), rand(0.45, 0.65)], ry: rand(0, 6), y: 0.25 }));
    this.healables = [instanced([{ geo: blobGeometry(2, 0.2), mat: M.leaf, tintable: true }], hedge, root)];

    // broadleaf trees, then a wall of pines, then hills closing the horizon
    const roundGeo = [treeGeometries('round'), treeGeometries('round'), treeGeometries('round')];
    const trees = ring(24, 6.2, 9.5).map((p) => ({ ...p, ry: rand(0, 6), s: rand(1.0, 1.45) }));
    roundGeo.forEach((g, i) => {
      const pl = trees.filter((_, k) => k % 3 === i);
      this.healables.push(instanced([{ geo: g.trunk, mat: M.bark }, { geo: g.foliage, mat: M.leaf, tintable: true }], pl, root));
    });
    const pineGeo = treeGeometries('pine');
    const pines = [...ring(34, 9.5, 13), ...ring(40, 13, 19)].map((p) => ({ ...p, ry: rand(0, 6), s: rand(1.1, 1.9) }));
    this.healables.push(instanced([{ geo: pineGeo.trunk, mat: M.bark }, { geo: pineGeo.foliage, mat: M.pine, tintable: true }], pines, root));
    const hills = ring(14, 26, 30).map((p) => ({ ...p, s: [rand(7, 11), rand(3, 6), rand(5, 8)], ry: rand(0, 6), y: -1 }));
    this.healables.push(instanced([{ geo: blobGeometry(2, 0.12), mat: M.pine, tintable: true }], hills, root));
    this.healables.forEach((h) => h.heal(0));

    // flowers & grass bloom as the clean radius grows (planters, then the lawn)
    const avoid = (x, z) => Math.hypot(x, z) < 3.7; // lawn starts outside the fence
    const planterSpots = (n) => Array.from({ length: n }, (_, i) => {
      const pl = this.planters[i % this.planters.length];
      const lx = rand(-0.45, 0.45), lz = rand(-0.14, 0.14);
      const c = Math.cos(pl.ry), sn = Math.sin(pl.ry);
      const x = pl.x + lx * c + lz * sn, z = pl.z - lx * sn + lz * c;
      return { x, z, y: 0.33, d: Math.hypot(x, z) - 1.5, r: rand(0, 6), s: rand(0.9, 1.3) };
    });
    this.blooms = await Promise.all([
      scatter('grass_medium_01', ['grass_medium_01_tall_a_LOD0', 'grass_medium_01_tall_b_LOD0', 'grass_medium_01_tall_c_LOD0', 'grass_medium_01_small_a_LOD0'], ringPlacements(520, 3.7, 12, 1.8, 3.0, avoid), root, true),
      scatter('celandine_01', ['celandine_01_a_LOD0', 'celandine_01_b_LOD0', 'celandine_01_e_LOD0'], [...planterSpots(42), ...ringPlacements(150, 3.7, 10, 1.8, 2.8, avoid)], root),
      scatter('flower_gazania', ['flower_gazania_a_LOD0', 'flower_gazania_b_LOD0', 'flower_gazania_d_LOD0'], [...planterSpots(21).map((p) => ({ ...p, s: 0.45 })), ...ringPlacements(40, 4.5, 11, 0.7, 1.1, avoid)], root),
      scatter('dandelion_01', ['dandelion_01_c_LOD0', 'dandelion_01_d_LOD0', 'dandelion_01_e_LOD0'], ringPlacements(70, 3.7, 10, 1.6, 2.4, avoid), root, true),
    ]);
    this.blooms.forEach((b) => b.update(0, true));
    this.butterflies = butterflies(root);

    // litter everywhere (disappears in rings as the park recovers)
    const inPlay = (x, z) => (Math.abs(x) < 0.7 && z > -1.0 && z < 0.4) || this.bins.some((b) => Math.hypot(b.position.x - x, b.position.z - z) < 0.45);
    const litterMakers = [() => instance('trashbag'), () => litterCan(), () => litterBottle(), () => litterBag(), () => litterPaper(), () => litterCan()];
    const spots = [...ringPlacements(26, 1.9, 3.3, 1, 1, inPlay), ...ringPlacements(40, 3.8, 9, 1, 1)];
    this.litter = await Promise.all(spots.map(async (p, i) => {
      const o = await litterMakers[i % litterMakers.length]();
      const lying = i % 6 !== 0;
      o.position.set(p.x, lying ? 0.035 : 0, p.z);
      o.rotation.set(lying ? Math.PI / 2 : 0, p.r, 0);
      if (i % 6 === 0) o.scale.setScalar(rand(0.8, 1.1));
      o.userData.d = p.d;
      root.add(o);
      return o;
    }));

    // Pre-build the trash items
    this.specs = SEQUENCE.map((s) => ({ ...s }));
    await Promise.all(this.specs.map(async (s) => { s.obj = await makeItem(s); }));
  }

  setEnvironment(k) {
    const { scene } = this.ctx;
    scene.backgroundIntensity = 0.5 + 0.55 * k;
    scene.environmentIntensity = 0.55 + 0.5 * k;
    this.sun.intensity = 1.0 + 1.3 * k;
    this.smog.material.opacity = 0.62 * (1 - k);
    this.smog.visible = k < 0.999;
    this.plazaMat.color.setRGB(0.54 + 0.46 * k, 0.5 + 0.5 * k, 0.44 + 0.56 * k);
    this.mats.glow.emissiveIntensity = 0.2 + 1.3 * k;
    scene.fog.color.setRGB(0.6 + 0.2 * k, 0.6 + 0.26 * k, 0.55 + 0.37 * k);
    scene.fog.density = 0.05 * (1 - k) + 0.006 * k;
  }

  setRadius(r) {
    this.uRadius.value = r;
    this.blooms.forEach((b) => b.update(r));
    this.healables.forEach((h) => h.heal(r));
    for (const o of this.litter) {
      if (o.userData.gone || r < o.userData.d) continue;
      o.userData.gone = true;
      const s0 = o.scale.x;
      this.ctx.tween(0.35, (k) => o.scale.setScalar(Math.max(1e-3, s0 * (1 - k)))).then(() => (o.visible = false));
    }
  }

  floorAt(x, z) {
    if (Math.abs(x - TABLE.x) < TABLE.w / 2 && Math.abs(z - TABLE.z) < TABLE.d / 2) return TABLE.y;
    return 0;
  }

  async run() {
    const { ctx } = this;
    const { scene, grab, audio } = ctx;
    scene.background = this.hdr;
    scene.environment = this.hdr;
    scene.backgroundBlurriness = 0;
    scene.fog = new THREE.FogExp2(0x999990, 0.05);
    grab.world = this.root;
    grab.floorAt = (x, z) => this.floorAt(x, z);
    this.setEnvironment(0);
    this.setRadius(0.5);

    this.total = SEQUENCE.length + 1; // +1 for the peeled label
    this.sorted = 0;
    this.queue = [...this.specs];
    this.live = new Set();
    this.said = new Set();
    this.lastProgress = 0;
    this.finished = false;
    this.elapsed = 0;

    this.gauge = ctx.ui.gauge({ width: 0.9, label: '🌱 공원 회복' });
    this.gauge.position.set(0, 2.05, -2.1);
    this.gauge.lookAt(0, 1.4, 0);
    this.root.add(this.gauge);

    this.offs.push(ctx.onUpdate((dt, t) => { this.tick(dt, t); this.butterflies.update(dt, t); }));
    await ctx.fade(0, 0.8);
    await audio.say('land_start', { priority: 2 });
    this.started = true;
    this.spawnNext();
    await ctx.until(() => this.finished || this.elapsed > TIME_LIMIT);
    await this.complete(!this.finished);
  }

  tick(dt, t) {
    // bins: bounce animation + hint glow
    for (const b of this.bins) {
      const u = b.userData;
      if (u.anim) { u.anim.t += dt; const k = u.anim.t / 0.5; if (k >= 1) { u.anim = null; b.scale.set(1, 1, 1); b.rotation.z = 0; u.setFace('normal'); } else if (u.anim.kind === 'chomp') { const s = Math.sin(k * Math.PI * 2) * 0.12 * (1 - k); b.scale.set(1 - s, 1 + s, 1 - s); } else { b.rotation.z = Math.sin(k * Math.PI * 6) * 0.08 * (1 - k); } }
      u.glow.material.opacity = u.hint ? 0.5 + 0.4 * Math.sin(t * 8) : Math.max(0, u.glow.material.opacity - dt * 2);
    }
    if (!this.started || this.finishing) return;
    this.elapsed += dt;
    // idle hint: light up the right bin
    if (this.elapsed - this.lastProgress > 9) {
      const it = [...this.live].find((i) => i.heldBy) || [...this.live][0];
      const spec = it?.spec;
      for (const b of this.bins) b.userData.hint = spec && !spec.blocked() && b.userData.def.cat === spec.cat;
    } else this.bins.forEach((b) => (b.userData.hint = false));
  }

  freeSlot() {
    const used = [...this.live].filter((i) => !i.heldBy).map((i) => i.slot);
    return SLOTS.findIndex((_, i) => !used.includes(i));
  }

  spawnNext() {
    while (!this.finishing && [...this.live].filter((i) => !i.heldBy).length < MAX_ON_TABLE && this.queue.length) {
      const slot = this.freeSlot();
      if (slot < 0) return;
      this.spawn(this.queue.shift(), slot);
    }
  }

  spawn(spec, slot, objOverride = null) {
    const { ctx } = this;
    const obj = objOverride || spec.obj;
    obj.position.set(SLOTS[slot], TABLE.y + 0.45, TABLE.z);
    obj.rotation.set(0, rand(-0.5, 0.5), 0);
    this.root.add(obj);
    spec.state = spec.state || {};
    spec.blocked = () => (spec.need === 'empty' && !spec.state.emptied) || (spec.need === 'flat' && !spec.state.flat) || (spec.need === 'peel' && !spec.state.peeled);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const item = ctx.grab.add(obj, { radius: 0.12, spec, slot });
    // name of the thing in hand (no category — kids decide the bin themselves)
    item.label = () => {
      const st = spec.state || {};
      if (spec.key === 'juice') return st.emptied ? '🧃 빈 주스 페트병' : '🧃 주스 페트병 (음료가 남았어요)';
      if (spec.key === 'pet') return st.peeled ? '💧 라벨 뗀 페트병' : '💧 생수 페트병 (라벨 붙음)';
      if (spec.key === 'box') return st.flat ? '📦 납작하게 접은 상자' : '📦 택배 상자';
      return spec.name;
    };
    item.bottom = 0;
    this.live.add(item);
    ctx.fx.burst(obj.position, 0xffffff, { n: 14, speed: 0.8, size: 0.03 });
    ctx.audio.sfx('sparkle');

    item.onGrab = () => {
      this.lastProgress = Math.max(this.lastProgress, this.elapsed - 4);
      const hint = { juice: 'land_full', pet: 'land_label', box: 'land_box', gold: 'land_gold' }[spec.key];
      if (hint && !this.said.has(hint) && (spec.key === 'gold' || spec.blocked())) { this.said.add(hint); ctx.audio.say(hint); }
      setTimeout(() => this.spawnNext(), 400);
    };
    item.onRelease = (hand, vel, heldFor) => this.onThrow(item, hand, vel, heldFor);
    item.onStep = () => this.checkBins(item);

    if (spec.need === 'empty') this.setupPour(item);
    if (spec.need === 'flat') item.onSecondHand = () => this.flatten(item);
    if (spec.need === 'peel') this.setupLabel(item);
    return item;
  }

  setupPour(item) {
    const { ctx } = this;
    const spec = item.spec;
    const lq = item.obj.userData.liquid;
    const up = new THREE.Vector3(), wp = new THREE.Vector3();
    let level = 1, drip = 0;
    const pour = (dt) => {
      if (spec.state.emptied || !lq) return;
      up.set(0, 1, 0).applyQuaternion(item.obj.getWorldQuaternion(new THREE.Quaternion()));
      if (up.y < -0.15) {
        level = Math.max(0, level - dt * 0.75);
        lq.scale.y = Math.max(0.001, level);
        drip += dt;
        if (drip > 0.08) { drip = 0; item.obj.localToWorld(wp.set(0, 0.29, 0)); ctx.fx.burst(wp, 0xffa63a, { n: 4, speed: 0.3, size: 0.03, gravity: 6, up: -1, life: 0.6 }); ctx.audio.sfx('pour'); }
        if (level <= 0) { spec.state.emptied = true; lq.visible = false; item.obj.getWorldPosition(wp); ctx.fx.burst(wp, 0x9ff7c4, { n: 24 }); ctx.audio.sfx('good'); ctx.audio.say('land_emptied'); this.lastProgress = this.elapsed; }
      }
    };
    item.onHeld = pour;
    // desktop / no-tilt fallback: double-click empties
    item.onSecondHand = (hand) => { if (hand.isDesktop && !spec.state.emptied) { item.obj.rotation.x = Math.PI; level = 0.02; pour(0.1); item.obj.rotation.x = 0; } };
  }

  flatten(item) {
    const spec = item.spec;
    if (spec.state.flat) return;
    spec.state.flat = true;
    const inner = item.obj.children[0];
    const s0 = inner.scale.clone();
    this.ctx.audio.sfx('squash');
    item.heldBy?.pulse(0.8, 120);
    this.ctx.tween(0.3, (k) => inner.scale.set(s0.x * (1 + 0.25 * k), s0.y * (1 - 0.85 * k), s0.z * (1 + 0.1 * k)));
    const wp = item.obj.getWorldPosition(new THREE.Vector3());
    this.ctx.fx.burst(wp, 0xd9b38c, { n: 18, speed: 1 });
    this.ctx.audio.say('land_box_done');
    this.lastProgress = this.elapsed;
  }

  setupLabel(item) {
    const { ctx } = this;
    const spec = item.spec;
    const bottle = item.obj;
    const label = bottle.userData.label;
    const tex = bottle.userData.labelTex;
    const peel = () => {
      if (spec.state.peeled) return;
      spec.state.peeled = true;
      label.visible = false;
      const wp = label.getWorldPosition(new THREE.Vector3());
      ctx.audio.sfx('squash');
      ctx.fx.burst(wp, 0x5ab8ff, { n: 16, speed: 0.8 });
      // the label becomes its own piece of (vinyl) trash
      const lspec = { key: 'label', name: '🏷️ 페트병 라벨', cat: 'vinyl', state: {}, obj: crumpledLabel(tex) };
      const slot = this.freeSlot();
      const li = this.spawn(lspec, slot >= 0 ? slot : item.slot);
      li.obj.position.copy(wp); li.obj.position.y += 0.05;
      ctx.audio.say('land_label_done');
      this.lastProgress = this.elapsed;
    };
    item.onSecondHand = peel;
    // grabbing the label itself with the other hand also peels it
    const labelGrab = ctx.grab.add(label, { radius: 0.06, priority: 2, physics: false, canGrab: (hand) => !spec.state.peeled && (item.heldBy && item.heldBy !== hand) });
    labelGrab.onGrab = (hand) => { ctx.grab.release(hand); ctx.grab.items.delete(labelGrab); peel(); };
    labelGrab.onRelease = () => {};
    item.labelGrab = labelGrab;
  }

  /**
   * Only a real throw goes anywhere: a tap/click (no swing) just puts the item back on the table.
   * Aim assist nudges a throw toward the bin the player aimed at — it never picks the correct bin for them.
   */
  onThrow(item, hand, vel, heldFor) {
    const isThrow = hand.isDesktop ? hand.dragDist > 0.12 && heldFor > 0.2 : heldFor > 0.15 && Math.hypot(vel.x, vel.z) > 1.0;
    if (!isThrow) {
      const p = item.obj.position;
      if (this.floorAt(p.x, p.z) < TABLE.y - 0.01 || hand.isDesktop) {
        // not above the table: gently put it back in its slot
        vel.set(0, 0, 0);
        const slot = this.freeSlot();
        item.slot = slot >= 0 ? slot : item.slot;
        p.set(SLOTS[item.slot], TABLE.y + 0.15, TABLE.z);
      }
      return;
    }
    this.aimAssist(item, vel);
  }

  aimAssist(item, vel) {
    const p = item.obj.position;
    const speed = Math.hypot(vel.x, vel.z);
    // Dropped right above a bin? let it fall in.
    if (speed < 0.8) return;
    const dir = new THREE.Vector2(vel.x, vel.z).normalize();
    let best = null, bestAng = THREE.MathUtils.degToRad(20);
    for (const b of this.bins) {
      const to = new THREE.Vector2(b.position.x - p.x, b.position.z - p.z);
      const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(dir), -1, 1));
      if (ang < bestAng) { bestAng = ang; best = b; }
    }
    if (!best) return;
    const target = new THREE.Vector3(best.position.x, best.userData.H + 0.05, best.position.z);
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    const T = THREE.MathUtils.clamp(d / 3.4, 0.4, 0.85);
    vel.set((target.x - p.x) / T, (target.y - p.y) / T + 0.5 * 9.8 * T, (target.z - p.z) / T);
    item.targetBin = best;
  }

  checkBins(item) {
    if (item.captured) return;
    const p = item.obj.position;
    for (const b of this.bins) {
      const u = b.userData;
      const dx = p.x - b.position.x, dz = p.z - b.position.z;
      const dh = Math.hypot(dx, dz);
      if (dh < u.RT - 0.02 && p.y < u.H + 0.05 && p.y > u.H - 0.5 && item.vel.y <= 0) { this.enterBin(item, b); return; }
      // bounce off the bin wall
      if (dh < u.RT + 0.05 && p.y < u.H - 0.02 && p.y > 0.02) { const k = (u.RT + 0.05) / Math.max(dh, 1e-3); p.x = b.position.x + dx * k; p.z = b.position.z + dz * k; item.vel.x *= -0.3; item.vel.z *= -0.3; }
    }
    // fell on the grass: pop back to the table
    if (item.resting && p.y < 0.3 && item.restTime > 1.6) this.returnToTable(item);
  }

  returnToTable(item) {
    const { ctx } = this;
    ctx.fx.burst(item.obj.position, 0xffffff, { n: 12, speed: 0.6, size: 0.03 });
    const slot = this.freeSlot();
    item.slot = slot >= 0 ? slot : item.slot;
    item.obj.position.set(SLOTS[item.slot], TABLE.y + 0.4, TABLE.z);
    item.resting = false;
    item.vel.set(0, 0, 0);
  }

  enterBin(item, bin) {
    const { ctx } = this;
    const spec = item.spec;
    const u = bin.userData;
    const correct = spec.cat === u.def.cat && !spec.blocked();
    if (!correct) {
      // spit it back to the table
      u.anim = { kind: 'shake', t: 0 }; u.setFace('wrong');
      ctx.audio.sfx('wrong');
      const hint = spec.blocked() ? ({ empty: 'land_full', flat: 'land_box', peel: 'land_label' }[spec.need]) : `land_hint_${spec.cat}`;
      ctx.audio.say(hint, { hint: true });
      const slot = this.freeSlot();
      item.slot = slot >= 0 ? slot : item.slot;
      const target = new THREE.Vector3(SLOTS[item.slot], TABLE.y + 0.1, TABLE.z);
      const p = item.obj.position;
      p.y = u.H + 0.1;
      const T = 0.7;
      item.vel.set((target.x - p.x) / T, (target.y - p.y) / T + 0.5 * 9.8 * T, (target.z - p.z) / T);
      return;
    }
    this.accept(item, bin);
  }

  accept(item, bin) {
    const { ctx } = this;
    const u = bin.userData;
    item.captured = true;
    item.enabled = false;
    item.physics = false;
    this.live.delete(item);
    if (item.labelGrab) ctx.grab.items.delete(item.labelGrab);
    const from = item.obj.position.clone();
    const to = new THREE.Vector3(bin.position.x, u.H * 0.4, bin.position.z);
    const s0 = item.obj.scale.x;
    ctx.tween(0.25, (k) => { item.obj.position.lerpVectors(from, to, k); item.obj.scale.setScalar(Math.max(1e-3, s0 * (1 - k * 0.9))); }).then(() => ctx.grab.remove(item));
    u.anim = { kind: 'chomp', t: 0 }; u.setFace('happy');
    ctx.audio.sfx('chomp');
    setTimeout(() => ctx.audio.sfx('good'), 120);
    ctx.fx.burst(new THREE.Vector3(bin.position.x, u.H + 0.1, bin.position.z), new THREE.Color(u.def.color).getHex(), { n: item.spec.gold ? 60 : 26, speed: item.spec.gold ? 2.4 : 1.5 });
    if (item.spec.gold) ctx.fx.burst(new THREE.Vector3(bin.position.x, u.H + 0.2, bin.position.z), 0xffe066, { n: 50, speed: 2 });
    this.sorted += item.spec.gold ? 1 : 1;
    this.lastProgress = this.elapsed;
    this.progress(this.sorted / this.total);
    setTimeout(() => this.spawnNext(), 300);
    if (this.sorted >= this.total) this.finished = true;
  }

  progress(v) {
    v = Math.min(1, v);
    const { ctx } = this;
    const r0 = this.uRadius.value, r1 = 0.5 + v * 26;
    const e0 = this._env ?? 0, e1 = v * 0.85;
    this._env = e1;
    this.gauge.set(v);
    ctx.tween(1.2, (k) => { this.setRadius(r0 + (r1 - r0) * k); this.setEnvironment(e0 + (e1 - e0) * k); });
  }

  async complete(timeUp) {
    const { ctx } = this;
    this.finishing = true;
    this.bins.forEach((b) => (b.userData.hint = false));
    ctx.input.active.forEach((h) => h.held && ctx.grab.release(h));
    if (timeUp) {
      await ctx.audio.say('land_timeup', { priority: 2 });
      // remaining trash flies into the right bins
      const rest = [...this.live];
      for (const it of rest) {
        const bin = this.bins.find((b) => b.userData.def.cat === it.spec.cat);
        this.accept(it, bin);
        await ctx.wait(0.18);
      }
    }
    this.gauge.set(1);
    ctx.audio.sfx('clear');
    const r0 = this.uRadius.value, e0 = this._env ?? 0;
    await ctx.tween(2.2, (k) => { this.setRadius(r0 + (40 - r0) * k); this.setEnvironment(e0 + (1 - e0) * k); });
    ctx.scene.fog.density = 0.004;
    this.butterflies.show();
    await ctx.audio.say('land_clear', { priority: 2 });
    await this.collectOrb('land');
  }

  collectOrb(kind) { return collectOrb(this.ctx, this.root, kind, this.offs); }

  dispose() {
    this.offs.forEach((f) => f());
    this.ctx.grab.clear();
    const s = this.ctx.scene;
    s.fog = null; s.environment = null; s.background = null;
  }
}
