import * as THREE from 'three';
import { createOrb, ORB_COLORS } from '../earth.js';

/** Show the stage's life orb in front of the player; resolves once grabbed (or after a timeout). */
export async function collectOrb(ctx, root, kind, offs) {
  const orb = createOrb(kind, 0.08);
  const cam = new THREE.Vector3();
  ctx.camera.getWorldPosition(cam);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.getWorldQuaternion(new THREE.Quaternion()));
  fwd.y = 0; fwd.normalize();
  root.worldToLocal(orb.position.copy(cam).addScaledVector(fwd, 0.45).setY(Math.max(1.0, cam.y - 0.3)));
  root.add(orb);
  let got = false;
  const it = ctx.grab.add(orb, { radius: 0.15, physics: false });
  it.onGrab = () => (got = true);
  offs.push(ctx.onUpdate((dt, t) => { if (!it.heldBy) orb.position.y += Math.sin(t * 3) * 0.0015; orb.rotation.y += dt; }));
  ctx.audio.say('orb_grab', { priority: 2 });
  await ctx.until(() => got, 12);
  const p = orb.getWorldPosition(new THREE.Vector3());
  ctx.fx.burst(p, ORB_COLORS[kind], { n: 60, speed: 2 });
  ctx.audio.sfx('sparkle');
  ctx.state.orbs.push(kind);
  ctx.grab.remove(it);
  await ctx.wait(1.0);
}
