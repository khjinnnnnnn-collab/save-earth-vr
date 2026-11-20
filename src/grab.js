import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP_Q = new THREE.Quaternion();
const GRAVITY = 9.8;

/**
 * Grab / throw / simple physics for interactive items.
 * Item options: radius, priority, canGrab(hand), onGrab(hand), onRelease(hand, vel),
 * onSecondHand(hand), onHeld(dt), onStep(dt), physics(bool), bottom(number), upright(bool)
 */
export class GrabSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = new Set();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4;
    this.hover = new Map(); // hand -> item
    this.floorAt = () => 0;
    this.world = ctx.scene;
  }

  add(obj, opts = {}) {
    const item = {
      obj, radius: 0.12, priority: 0, physics: true, upright: true, enabled: true,
      vel: new THREE.Vector3(), resting: false, heldBy: null, fly: null, ...opts,
    };
    if (item.bottom === undefined) {
      const box = new THREE.Box3().setFromObject(obj);
      item.bottom = obj.position.y - box.min.y;
    }
    obj.userData.item = item;
    item.highlightMats = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.emissive) item.highlightMats.push({ m, base: m.emissive.clone(), bi: m.emissiveIntensity });
      }
    });
    this.items.add(item);
    return item;
  }

  remove(item) {
    if (item.heldBy) { item.heldBy.held = null; item.heldBy = null; }
    this.setHighlight(item, false);
    this.items.delete(item);
    item.obj.removeFromParent();
  }

  clear() { for (const it of [...this.items]) this.remove(it); }

  setHighlight(item, on) {
    if (item._hl === on) return;
    item._hl = on;
    for (const h of item.highlightMats) {
      if (on) { h.m.emissive.setRGB(0.25, 0.45, 0.3); h.m.emissiveIntensity = 1; } else { h.m.emissive.copy(h.base); h.m.emissiveIntensity = h.bi; }
    }
  }

  pick(hand) {
    let best = null, bestScore = Infinity;
    if (!hand.isDesktop) {
      for (const it of this.items) {
        if (!it.enabled || it.heldBy || it.fly || (it.canGrab && !it.canGrab(hand))) continue;
        it.obj.getWorldPosition(_v);
        const d = _v.distanceTo(hand.pos) - it.radius - it.priority * 0.05;
        if (d < 0.08 && d < bestScore) { best = it; bestScore = d; }
      }
      if (best) return { item: best, viaRay: false };
    }
    this.raycaster.set(hand.rayOrigin, hand.rayDir);
    const allowed = new Set([...this.items].filter((it) => it.enabled && !it.heldBy && !it.fly && (!it.canGrab || it.canGrab(hand))));
    const hits = this.raycaster.intersectObjects([...allowed].map((it) => it.obj), true);
    for (const h of hits) {
      let o = h.object;
      while (o && !(o.userData.item && allowed.has(o.userData.item))) o = o.parent;
      if (o) return { item: o.userData.item, viaRay: true };
    }
    return null;
  }

  grab(hand, item, viaRay) {
    item.heldBy = hand;
    item.grabTime = this.ctx.time;
    hand.held = item;
    item.resting = false;
    item.vel.set(0, 0, 0);
    this.setHighlight(item, false);
    if (hand.isDesktop) {
      item.obj.getWorldPosition(_v);
      hand.holdDist = THREE.MathUtils.clamp(_v.distanceTo(hand.rayOrigin), 0.45, 0.9);
      hand.anchor.position.copy(hand.rayOrigin).addScaledVector(hand.rayDir, hand.holdDist);
      hand.anchor.updateMatrixWorld();
      item.fly = { hand, t: 0, from: _v.clone(), dur: 0.12 };
    } else if (viaRay) {
      item.obj.getWorldPosition(_v);
      item.fly = { hand, t: 0, from: _v.clone(), dur: 0.25 };
    } else {
      hand.anchor.attach(item.obj);
    }
    hand.pulse(0.4, 40);
    this.ctx.audio?.sfx('pop');
    item.onGrab?.(hand);
  }

  release(hand) {
    const item = hand.held;
    hand.held = null;
    if (!item) return;
    item.heldBy = null;
    item.fly = null;
    this.world.attach(item.obj);
    if (hand.isDesktop) item.vel.copy(hand.rayDir).multiplyScalar(4.2).add(_w.set(0, 1.4, 0));
    else item.vel.copy(hand.velocity).multiplyScalar(1.3);
    item.resting = false;
    item.onRelease?.(hand, item.vel, this.ctx.time - (item.grabTime ?? 0));
  }

  /** Item held by some other hand, close enough to be "two-handed" by this hand. */
  heldNear(hand) {
    for (const h of this.ctx.input.active) {
      if (h === hand || !h.held) continue;
      h.held.obj.getWorldPosition(_v);
      if (_v.distanceTo(hand.pos) < 0.3) return h.held;
    }
    return null;
  }

  step(it, h) {
    if (!it.resting) {
      it.vel.y -= GRAVITY * h;
      it.obj.position.addScaledVector(it.vel, h);
      if (it.vel.lengthSq() > 1) it.obj.rotation.x += h * 4; // tumble in flight
      const p = it.obj.position;
      const floor = this.floorAt(p.x, p.z, it);
      if (p.y - it.bottom < floor) {
        p.y = floor + it.bottom;
        if (it.vel.y < -(1.2 + GRAVITY * h)) { it.vel.y *= -0.25; it.vel.x *= 0.5; it.vel.z *= 0.5; }
        else { it.vel.set(0, 0, 0); it.resting = true; it.restTime = 0; }
      }
    } else {
      it.restTime += h;
      if (it.upright) {
        UP_Q.setFromEuler(new THREE.Euler(0, it.obj.rotation.y, 0));
        it.obj.quaternion.slerp(UP_Q, Math.min(1, h * 8));
      }
      const p = it.obj.position;
      const floor = this.floorAt(p.x, p.z, it);
      if (p.y - it.bottom > floor + 0.01) it.resting = false; // support removed
    }
  }

  update(dt) {
    const hands = this.ctx.input.active;
    for (const hand of hands) {
      let target = null;
      if (!hand.held) {
        target = this.pick(hand);
        const prev = this.hover.get(hand);
        if (prev && prev !== target?.item) this.setHighlight(prev, false);
        if (target) this.setHighlight(target.item, true);
        this.hover.set(hand, target?.item || null);
      }
      if (hand.justPressed && !hand.held) {
        const other = this.heldNear(hand);
        if (other?.onSecondHand) other.onSecondHand(hand);
        else if (target) this.grab(hand, target.item, target.viaRay);
      }
      if (hand.doubleClick) {
        const it = hand.held || target?.item;
        it?.onSecondHand?.(hand);
      }
      if (hand.justReleased && hand.held) this.release(hand);
    }
    for (const it of [...this.items]) {
      if (it.fly) {
        const f = it.fly;
        f.t += dt / f.dur;
        f.hand.anchor.getWorldPosition(_w);
        if (f.t >= 1) { it.fly = null; f.hand.anchor.attach(it.obj); it.obj.position.set(0, 0, 0); }
        else { _v.copy(f.from).lerp(_w, f.t * f.t); this.world.worldToLocal(_v); it.obj.position.copy(_v); }
        continue;
      }
      if (it.heldBy) { it.onHeld?.(dt); continue; }
      if (!it.physics || !it.enabled) continue;
      const steps = Math.max(1, Math.ceil(dt / 0.014));
      const h = dt / steps;
      for (let k = 0; k < steps && it.physics && it.enabled; k++) {
        this.step(it, h);
        it.onStep?.(h);
      }
    }
  }
}
