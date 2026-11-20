import * as THREE from 'three';
import { buildSpace } from './space.js';
import { createOrb, ORB_COLORS } from '../earth.js';
import { textPanel } from '../ui.js';

export class Ending {
  constructor(ctx) { this.ctx = ctx; this.root = new THREE.Group(); }
  async load() { this.earth = buildSpace(this.ctx, this.root); }
  async run() {
    const { ctx, earth } = this;
    const grab = ctx.grab;
    grab.world = this.root;
    grab.floorAt = () => -10;
    ctx.scene.background = new THREE.Color(0x02030a);
    ctx.scene.environment = null; ctx.scene.fog = null;
    earth.position.set(0, 1.4, -1.5);
    const offs = [ctx.onUpdate((dt, t) => earth.userData.update(dt))];
    this.offs = offs;
    await ctx.fade(0, 0.8);

    const kinds = ctx.state.orbs.length ? [...new Set(ctx.state.orbs)] : ['land', 'sea', 'sky'];
    let inserted = 0;
    const earthPos = new THREE.Vector3();
    const insert = (item) => {
      if (item.done) return;
      item.done = true;
      item.enabled = false;
      grab.remove(item);
      this.root.add(item.obj);
      const from = item.obj.position.clone();
      earth.getWorldPosition(earthPos);
      ctx.audio.sfx('whoosh');
      ctx.tween(0.6, (k) => { item.obj.position.lerpVectors(from, earthPos, k); item.obj.scale.setScalar(1 - k * 0.8); }).then(() => {
        item.obj.removeFromParent();
        ctx.fx.burst(earthPos, ORB_COLORS[item.kind], { n: 40, speed: 1.2 });
        ctx.audio.sfx('sparkle');
        inserted++;
        earth.userData.uniforms.uHealth.value = Math.min(0.85, inserted / kinds.length * 0.6);
      });
    };
    const items = kinds.map((k, i) => {
      const orb = createOrb(k, 0.07);
      orb.position.set((i - (kinds.length - 1) / 2) * 0.3, 1.05, -0.55);
      this.root.add(orb);
      const it = grab.add(orb, { radius: 0.1, physics: false, kind: k });
      it.onStep = () => {};
      it.onHeld = () => { orb.getWorldPosition(earthPos); if (earthPos.distanceTo(earth.position) < 0.75) { ctx.grab.release(it.heldBy); insert(it); } };
      it.onRelease = () => insert(it); // released anywhere: fly into the Earth
      return it;
    });
    const bob = ctx.onUpdate((dt, t) => items.forEach((it, i) => { if (!it.heldBy && !it.done) it.obj.position.y = 1.05 + Math.sin(t * 2 + i) * 0.02; }));
    offs.push(bob);
    await ctx.audio.say('ending_1', { priority: 2 });
    await ctx.until(() => inserted >= kinds.length, 14);
    items.forEach((it, i) => setTimeout(() => insert(it), i * 300));
    await ctx.until(() => inserted >= kinds.length, 3);

    // Heal!
    ctx.audio.sfx('clear');
    earth.userData.setMood('happy');
    const u = earth.userData.uniforms.uHealth;
    const h0 = u.value;
    const pos = earth.position.clone();
    for (let i = 0; i < 6; i++) setTimeout(() => ctx.fx.burst(pos.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.6)), [0xffd54a, 0x7cff9a, 0x7fc8ff, 0xff8ab0][i % 4], { n: 50, speed: 2 }), i * 250);
    await ctx.tween(2.5, (k) => { u.value = h0 + (1 - h0) * k; earth.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.15); });
    await ctx.audio.say('ending_2', { priority: 2 });
    const cert = textPanel({ width: 1.3, height: 0.42, text: '🏅 지구 지킴이 인증 🏅\n땅 · 바다 · 하늘을 구해 줘서 고마워!', size: 64, bg: 'rgba(40,30,5,0.85)', border: 'rgba(255,215,90,0.9)' });
    cert.position.set(0, 2.12, -1.45);
    cert.lookAt(0, 1.4, 0);
    cert.scale.setScalar(0.001);
    this.root.add(cert);
    ctx.tween(0.6, (k) => cert.scale.setScalar(Math.max(0.001, k)));
    await ctx.audio.say('ending_3', { priority: 2 });
    await ctx.wait(4);
  }
  dispose() { this.offs?.forEach((f) => f()); this.ctx.grab.clear(); }
}
