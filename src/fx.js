import * as THREE from 'three';

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class FX {
  constructor(ctx) { this.ctx = ctx; this.list = []; this.tex = starTexture(); }
  burst(pos, color = 0xffffff, { n = 24, speed = 1.6, size = 0.05, life = 0.9, gravity = 2, up = 0.6, parent = null } = {}) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5 + up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      vel.push(v);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size, map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    (parent || this.ctx.scene).add(pts);
    this.list.push({ pts, vel, t: 0, life, gravity });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      const a = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        b.vel[j].y -= b.gravity * dt;
        a.array[j * 3] += b.vel[j].x * dt; a.array[j * 3 + 1] += b.vel[j].y * dt; a.array[j * 3 + 2] += b.vel[j].z * dt;
      }
      a.needsUpdate = true;
      b.pts.material.opacity = 1 - b.t / b.life;
      if (b.t >= b.life) { b.pts.removeFromParent(); b.pts.geometry.dispose(); b.pts.material.dispose(); this.list.splice(i, 1); }
    }
  }
}
