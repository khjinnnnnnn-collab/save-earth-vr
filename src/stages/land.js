import * as THREE from 'three';
import { loadHDR, loadTexSet, instance, loadModel } from '../assets.js';
import { BINS, SEQUENCE, makeItem, makeBin, crumpledLabel } from './land_items.js';
import { createOrb, ORB_COLORS } from '../earth.js';

const TIME_LIMIT = 70;
const TABLE = { x: 0, z: -0.55, y: 0.7, w: 0.95, d: 0.5 };
const SLOTS = [-0.3, 0, 0.3];
const BIN_R = 1.6;
const BIN_ANGLES = [-54, -27, 0, 27, 54];
const MAX_ON_TABLE = 3;
const rand = (a, b) => a + Math.random() * (b - a);

/** Instanced scatter of a model node (all its sub-meshes) — cheap foliage/flowers. */
async function scatter(id, nodeNames, placements, root) {
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
      const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
      meshes.push({ geo, mat: o.material, box });
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
          pos.set(p.x, -g.minY * sc, p.z);
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
    const [hdr] = await Promise.all([loadHDR('kloofendal_48d_partly_cloudy_puresky'), ...['island_tree_02', 'shrub_02', 'shrub_03', 'flower_gazania', 'celandine_01', 'dandelion_01', 'grass_medium_01', 'painted_wooden_bench', 'street_lamp_01', 'boulder_01', 'dead_tree_trunk', 'tree_stump_01', 'trashbag', 'can_rusted', 'plastic_bottle_gallon', 'multi_cleaner_bottle', 'russian_food_cans_01', 'wine_bottles_01', 'cardboard_box_01'].map(loadModel)]);
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
  gcol.rgb *= vec3(0.72, 0.95, 0.5);
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
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.75 });
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

    // Park scenery
    const place = async (id, node, x, z, ry = 0, s = 1) => { const o = await instance(id, node); o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); root.add(o); return o; };
    await Promise.all([
      place('island_tree_02', null, -9, -12, 0.3, 2.6), place('island_tree_02', null, 8, -13, 1.6, 2.9),
      place('island_tree_02', null, 14, -3, 2.3, 2.5), place('island_tree_02', null, -14, -2, 4.0, 2.7),
      place('island_tree_02', null, 2, -17, 5.1, 3.0),
      place('painted_wooden_bench', null, -3.4, -2.2, 1.1), place('street_lamp_01', null, 3.6, -3.4, -0.6),
      place('boulder_01', null, -6.5, -6.5, 0.5, 0.8), place('dead_tree_trunk', null, 3.2, -6.5, 0.4, 1.1), place('tree_stump_01', null, 4.8, 1.5, 0, 0.8),
    ]);
    const shrubs = ['shrub_02_a', 'shrub_02_b', 'shrub_02_c', 'shrub_02_d'];
    await Promise.all(Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 1.6 - Math.PI * 0.8 + rand(-0.1, 0.1), d = rand(5.5, 8);
      return place('shrub_02', shrubs[i % 4], Math.sin(a) * d, -Math.cos(a) * d, rand(0, 6), rand(0.8, 1.2));
    }));

    // Flowers & grass bloom as the clean radius grows
    const avoid = (x, z) => Math.hypot(x, z) < 2.2 && z < 0.6; // keep play area clear
    this.blooms = await Promise.all([
      scatter('grass_medium_01', ['grass_medium_01_tall_a_LOD0', 'grass_medium_01_tall_b_LOD0', 'grass_medium_01_tall_c_LOD0', 'grass_medium_01_small_a_LOD0'], ringPlacements(420, 1.0, 13, 1.6, 2.6, avoid), root),
      scatter('celandine_01', ['celandine_01_a_LOD0', 'celandine_01_b_LOD0', 'celandine_01_e_LOD0'], ringPlacements(170, 1.2, 12, 1.6, 2.6, avoid), root),
      scatter('dandelion_01', ['dandelion_01_c_LOD0', 'dandelion_01_d_LOD0', 'dandelion_01_e_LOD0'], ringPlacements(70, 1.5, 11, 1.4, 2.2, avoid), root),
      scatter('flower_gazania', ['flower_gazania_a_LOD0', 'flower_gazania_b_LOD0', 'flower_gazania_d_LOD0'], ringPlacements(50, 2.5, 14, 0.7, 1.1, avoid), root),
      scatter('shrub_03', ['shrub_03_a', 'shrub_03_b', 'shrub_03_c'], ringPlacements(30, 2.5, 12, 1.2, 1.8, avoid), root),
    ]);
    this.blooms.forEach((b) => b.update(0, true));

    // Litter scattered around the park (disappears as it recovers)
    const litterSrc = [['trashbag', null, 1], ['can_rusted', null, 1.2], ['plastic_bottle_gallon', null, 1], ['multi_cleaner_bottle', null, 1], ['russian_food_cans_01', 'russian_food_cans_01_can_cond', 2], ['wine_bottles_01', 'wine_bottles_01_bordeaux', 1], ['cardboard_box_01', null, 0.6]];
    this.litter = await Promise.all(ringPlacements(34, 2.6, 13, 1, 1, avoid).map(async (p, i) => {
      const [id, node, s] = litterSrc[i % litterSrc.length];
      const o = await instance(id, node);
      o.position.set(p.x, 0, p.z); o.rotation.set(rand(-0.3, 0.3), p.r, i % 3 === 0 ? Math.PI / 2 : 0); o.scale.setScalar(s);
      if (i % 3 === 0) o.position.y = 0.04 * s;
      o.userData.d = p.d; o.userData.s = s;
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
    scene.fog.color.setRGB(0.6 + 0.2 * k, 0.6 + 0.26 * k, 0.55 + 0.37 * k);
    scene.fog.density = 0.05 * (1 - k) + 0.006 * k;
  }

  setRadius(r) {
    this.uRadius.value = r;
    this.blooms.forEach((b) => b.update(r));
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

    this.offs.push(ctx.onUpdate((dt, t) => this.tick(dt, t)));
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
    item.onRelease = (hand, vel) => this.aimAssist(item, vel);
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
      const lspec = { key: 'label', cat: 'vinyl', state: {}, obj: crumpledLabel(tex) };
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

  aimAssist(item, vel) {
    const p = item.obj.position;
    const speed = Math.hypot(vel.x, vel.z);
    // Dropped right above a bin? let it fall in.
    if (speed < 0.8) return;
    const dir = new THREE.Vector2(vel.x, vel.z).normalize();
    let best = null, bestAng = THREE.MathUtils.degToRad(32);
    for (const b of this.bins) {
      const to = new THREE.Vector2(b.position.x - p.x, b.position.z - p.z);
      const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(dir), -1, 1));
      if (ang < bestAng) { bestAng = ang; best = b; }
    }
    if (!best) return;
    const target = new THREE.Vector3(best.position.x, best.userData.H + 0.05, best.position.z);
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    const T = THREE.MathUtils.clamp(d / 3.2, 0.35, 0.75);
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
      ctx.audio.say(hint);
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
    await ctx.audio.say('land_clear', { priority: 2 });
    await this.collectOrb('land');
  }

  async collectOrb(kind) {
    const { ctx } = this;
    const orb = createOrb(kind, 0.08);
    const cam = new THREE.Vector3();
    ctx.camera.getWorldPosition(cam);
    orb.position.set(cam.x * 0.5, Math.max(1.0, cam.y - 0.35), -0.35);
    this.root.add(orb);
    let got = false;
    const it = ctx.grab.add(orb, { radius: 0.15, physics: false });
    it.onGrab = () => (got = true);
    const bob = ctx.onUpdate((dt, t) => { if (!it.heldBy) orb.position.y += Math.sin(t * 3) * 0.0015; orb.rotation.y += dt; });
    this.offs.push(bob);
    ctx.audio.say('orb_grab', { priority: 2 });
    await ctx.until(() => got, 12);
    ctx.camera.getWorldPosition(cam);
    const p = orb.getWorldPosition(new THREE.Vector3());
    ctx.fx.burst(p, ORB_COLORS[kind], { n: 60, speed: 2 });
    ctx.audio.sfx('sparkle');
    ctx.state.orbs.push(kind);
    ctx.grab.remove(it);
    await ctx.wait(1.0);
  }

  dispose() {
    this.offs.forEach((f) => f());
    this.ctx.grab.clear();
    const s = this.ctx.scene;
    s.fog = null; s.environment = null; s.background = null;
  }
}
