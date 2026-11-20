import * as THREE from 'three';
import { createEarth, createStars, createOrb } from '../earth.js';
import { textPanel } from '../ui.js';

/** Shared space backdrop for intro and ending. */
export function buildSpace(ctx, root) {
  root.add(createStars());
  const neb = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0a1030, side: THREE.BackSide, fog: false }));
  root.add(neb);
  root.add(new THREE.AmbientLight(0xffffff, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 3, 2); root.add(sun);
  const earth = createEarth(0.55);
  earth.position.set(0, 1.45, -2.0);
  root.add(earth);
  return earth;
}

export class Intro {
  constructor(ctx) { this.ctx = ctx; this.root = new THREE.Group(); }
  async load() {
    this.earth = buildSpace(this.ctx, this.root);
    const kinds = [['land', '땅'], ['sea', '바다'], ['sky', '하늘']];
    this.slots = kinds.map(([k, label], i) => {
      const g = new THREE.Group();
      const orb = createOrb(k, 0.06);
      orb.children[0].material.emissiveIntensity = 0.15;
      orb.children[0].material.color.multiplyScalar(0.35);
      const t = textPanel({ width: 0.3, height: 0.1, text: label, size: 70, bg: null, border: null });
      t.position.y = -0.13;
      g.add(orb, t);
      g.position.set((i - 1) * 0.45, 0.65, -1.6);
      g.scale.setScalar(0.001);
      this.root.add(g);
      return g;
    });
  }
  async run() {
    const { ctx, earth } = this;
    ctx.scene.background = new THREE.Color(0x02030a);
    ctx.scene.environment = null;
    ctx.scene.fog = null;
    const off = ctx.onUpdate((dt, t) => { earth.userData.update(dt); earth.position.y = 1.45 + Math.sin(t * 1.2) * 0.03; });
    this.offs = [off];
    await ctx.fade(0, 1.0);
    const cough = async () => { ctx.audio.sfx('cough'); await ctx.tween(0.5, (k) => earth.scale.setScalar(1 + Math.sin(k * Math.PI * 4) * 0.04)); };
    await cough();
    await ctx.audio.say('intro_1', { priority: 2 });
    cough();
    const showSlots = this.slots.map((s, i) => ctx.wait(i * 0.25).then(() => ctx.tween(0.5, (k) => s.scale.setScalar(Math.max(0.001, k)), (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2))));
    await Promise.all([ctx.audio.say('intro_2', { priority: 2 }), ...showSlots]);
    await ctx.wait(0.5);
  }
  dispose() { this.offs?.forEach((f) => f()); }
}

/** Temporary stand-in for stages that are not built yet: grants the orb so the flow can be tested end-to-end. */
export class Placeholder {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.root = new THREE.Group(); }
  async load() {
    buildSpace(this.ctx, this.root).visible = false;
    const label = this.kind === 'sea' ? '🌊 바다 스테이지 (제작 중)' : '☁️ 하늘 스테이지 (제작 중)';
    this.panel = textPanel({ width: 1.4, height: 0.3, text: label, size: 80 });
    this.panel.position.set(0, 1.5, -2);
    this.root.add(this.panel);
  }
  async run() {
    const { ctx } = this;
    ctx.scene.background = new THREE.Color(this.kind === 'sea' ? 0x0b3b66 : 0x6aa7d8);
    await ctx.fade(0, 0.6);
    const orb = createOrb(this.kind);
    orb.position.set(0, 1.2, -1.2);
    this.root.add(orb);
    await ctx.audio.say(this.kind === 'sea' ? 'wip_sea' : 'wip_sky', { priority: 2 });
    ctx.audio.sfx('sparkle');
    ctx.state.orbs.push(this.kind);
    await ctx.wait(0.5);
  }
  dispose() {}
}
