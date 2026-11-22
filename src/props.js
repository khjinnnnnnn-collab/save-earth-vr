import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadTexSet } from './assets.js';

// Stylised-but-textured scenery, built procedurally and instanced so the map can be dense on Quest.

const rand = (a, b) => a + Math.random() * (b - a);

function noise3(x, y, z) { return Math.sin(x * 3.1 + y * 1.7) * 0.5 + Math.sin(y * 2.3 + z * 3.7) * 0.3 + Math.sin(z * 2.9 + x * 2.1) * 0.2; }

/** Lumpy leaf blob with a bottom-dark/top-light vertex gradient. */
export function blobGeometry(detail = 3, lump = 0.18, seed = Math.random() * 10) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g); // shared vertices -> smooth shading
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const uv = new Float32Array(p.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + noise3(v.x * 2 + seed, v.y * 2, v.z * 2 + seed) * lump;
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
    const sh = THREE.MathUtils.clamp(0.55 + v.y * 0.4, 0.35, 1.05);
    col.set([sh, sh, sh], i * 3);
    uv.set([Math.atan2(v.z, v.x) * 0.9, v.y * 1.4], i * 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function withColor(g, c = 1) {
  g = g.index ? g : g;
  const n = g.attributes.position.count;
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(c), 3));
  return g;
}

export function materials() {
  const leaf = loadTexSet('leafy_grass', 1);
  const bark = loadTexSet('bark_brown_02', 1);
  const wood = loadTexSet('brown_planks_04', 1);
  return {
    leaf: new THREE.MeshStandardMaterial({ map: leaf.diff, normalMap: leaf.nor, color: 0xb6f07a, vertexColors: true, roughness: 0.9 }),
    pine: new THREE.MeshStandardMaterial({ map: leaf.diff, normalMap: leaf.nor, color: 0x6fb86a, vertexColors: true, roughness: 0.9 }),
    bark: new THREE.MeshStandardMaterial({ map: bark.diff, normalMap: bark.nor, vertexColors: true, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.diff, normalMap: wood.nor, color: 0xc89a6a, roughness: 0.8 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x24433a, roughness: 0.4, metalness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 0.2 }),
    soil: new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }),
  };
}

/** One tree = trunk geo + foliage geo (merged blobs/cones). */
export function treeGeometries(kind) {
  if (kind === 'pine') {
    const trunk = withColor(new THREE.CylinderGeometry(0.1, 0.16, 1.2, 7).translate(0, 0.6, 0), 0.8);
    const cones = [];
    for (let i = 0; i < 4; i++) {
      const r = 1.25 - i * 0.26, h = 1.5 - i * 0.12;
      const c = new THREE.ConeGeometry(r, h, 10, 2).translate(0, 1.0 + i * 0.85 + h / 2, 0);
      const p = c.attributes.position, col = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) { const y = p.getY(k); const sh = 0.55 + 0.45 * ((y - 1.0) / 4.2); col.set([sh, sh, sh], k * 3); p.setX(k, p.getX(k) * (1 + Math.sin(k * 7.3) * 0.08)); p.setZ(k, p.getZ(k) * (1 + Math.cos(k * 5.1) * 0.08)); }
      c.setAttribute('color', new THREE.BufferAttribute(col, 3));
      c.deleteAttribute('uv'); c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2).map((_, j) => (j % 2 ? p.getY(j >> 1) : Math.atan2(p.getZ(j >> 1), p.getX(j >> 1))) * 0.8), 2));
      cones.push(c);
    }
    return { trunk, foliage: mergeGeometries(cones) };
  }
  // round broadleaf tree
  const trunk = withColor(new THREE.CylinderGeometry(0.11, 0.2, 1.9, 8).translate(0, 0.95, 0), 0.85);
  const blobs = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const s = rand(0.65, 0.95);
    const b = blobGeometry(2, 0.16).scale(s, s * 0.85, s).translate(Math.cos(a) * 0.6, 2.1 + rand(-0.15, 0.35), Math.sin(a) * 0.6);
    blobs.push(b);
  }
  blobs.push(blobGeometry(2, 0.16).scale(0.95, 0.85, 0.95).translate(0, 2.75, 0));
  return { trunk, foliage: mergeGeometries(blobs) };
}

/**
 * Instanced set of multi-part props. placements: {x,y?,z,ry,s,d?}. tint(i, k) recolours polluted→healthy.
 */
export function instanced(parts, placements, root, { shadow = false, sick: sickColor = null } = {}) {
  const ims = parts.map(({ geo, mat, tintable }) => {
    const im = new THREE.InstancedMesh(geo, mat, placements.length);
    im.castShadow = shadow; im.receiveShadow = true;
    im.userData.tintable = tintable;
    root.add(im);
    return im;
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  placements.forEach((p, i) => {
    e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    q.setFromEuler(e);
    if (typeof p.s === 'number') s.setScalar(p.s); else s.set(...p.s);
    m.compose(new THREE.Vector3(p.x, p.y || 0, p.z), q, s);
    ims.forEach((im) => im.setMatrixAt(i, m));
  });
  const sick = new THREE.Color(sickColor ?? new THREE.Color(0.62, 0.52, 0.36)), healthy = new THREE.Color(1, 1, 1), c = new THREE.Color(), tgt = new THREE.Color();
  const api = {
    ims,
    /** recolour by clean radius (instances inside the radius turn healthy) */
    heal(radius) {
      for (const im of ims) {
        if (!im.userData.tintable) continue;
        placements.forEach((p, i) => {
          const k = THREE.MathUtils.clamp((radius - (p.d ?? Math.hypot(p.x, p.z))) / 2, 0, 1);
          c.copy(sick).lerp(p.c !== undefined ? tgt.set(p.c) : healthy, k);
          im.setColorAt(i, c);
        });
        im.instanceColor.needsUpdate = true;
      }
    },
  };
  ims.forEach((im) => { if (im.userData.tintable) im.setColorAt(0, sick); });
  api.heal(0);
  return api;
}

/** Bunting flags strung between posts. */
export function bunting(points, root, { sag = 0.35, perSpan = 9 } = {}) {
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.09, 0, 0), new THREE.Vector3(0.09, 0, 0), new THREE.Vector3(0, -0.22, 0)]);
  tri.computeVertexNormals();
  const colors = [0xff5a5a, 0xffd23f, 0x3ecf8e, 0x4aa8ff, 0xff8fd1, 0xffffff];
  const total = (points.length) * perSpan;
  const im = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), total);
  const rope = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  let n = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    for (let k = 0; k <= 16; k++) { const t = k / 16; rope.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0))); }
    for (let k = 0; k < perSpan; k++) {
      const t = (k + 0.5) / perSpan;
      const pos = new THREE.Vector3().lerpVectors(a, b, t); pos.y -= Math.sin(t * Math.PI) * sag;
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m.compose(pos, q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(n, m); im.setColorAt(n, new THREE.Color(colors[n % colors.length])); n++;
    }
  }
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rope.flatMap((p, i) => (i % 17 === 16 ? [] : [p, rope[i + 1]]))), new THREE.LineBasicMaterial({ color: 0x4a3a2a }));
  root.add(im, line);
  return im;
}

/** Little butterflies that appear when the park is clean. */
export function butterflies(root, n = 14) {
  const wing = new THREE.PlaneGeometry(0.07, 0.06).translate(0.035, 0, 0);
  const cols = [0xffe14d, 0xff9ad5, 0x8fd3ff, 0xffffff, 0xffa14d];
  const list = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide });
    const g = new THREE.Group();
    const L = new THREE.Mesh(wing, mat), R = new THREE.Mesh(wing, mat);
    R.scale.x = -1;
    g.add(L, R);
    g.userData = { L, R, a: Math.random() * 6, r: rand(1.8, 5), h: rand(0.5, 2), sp: rand(0.2, 0.45) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6 };
    g.visible = false;
    root.add(g);
    list.push(g);
  }
  return {
    show() { list.forEach((b) => (b.visible = true)); },
    update(dt, t) {
      for (const b of list) {
        if (!b.visible) continue;
        const u = b.userData;
        u.a += u.sp * dt;
        b.position.set(Math.sin(u.a) * u.r, u.h + Math.sin(t * 1.3 + u.ph) * 0.25, -Math.cos(u.a) * u.r);
        b.rotation.y = -u.a + (u.sp > 0 ? 0 : Math.PI);
        const f = Math.sin(t * 18 + u.ph) * 1.1;
        u.L.rotation.y = f; u.R.rotation.y = -f;
      }
    },
  };
}
