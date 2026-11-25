import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../toon.js';
import { blobGeometry } from '../props.js';
import { cartoonEye } from './sea_props.js?v=032';

// Stylised props for the ocean adventure: terraced reef islands, boat, whale, manta, dolphin, polar bears, icebergs.

const rand = (a, b) => a + Math.random() * (b - a);

function paint(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 0); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const clean = (g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };

/**
 * Terraced reef island: stacked irregular discs, sandy tops and blue cliff sides.
 * Returns { geo, tops: [{x,y,z,r}] } in local space (base at y=0).
 */
export function islandGeometry({ r = 2, h = 1.2, levels = 2, seed = Math.random() * 10, side = [0x5fb8ee, 0x2a5aa8], top = 0xffe3a0 } = {}) {
  const parts = [], tops = [];
  const sTop = new THREE.Color(side[0]), sBot = new THREE.Color(side[1]), tC = new THREE.Color(top), tC2 = new THREE.Color(top).offsetHSL(0.02, 0.05, -0.08);
  let y = 0, ox = 0, oz = 0, rr = r, hh = h;
  for (let L = 0; L < levels; L++) {
    const g = new THREE.CylinderGeometry(rr, rr * 1.12, hh, 18, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      const f = 1 + 0.13 * Math.sin(3 * a + seed + L) + 0.07 * Math.sin(7 * a + seed * 2) + 0.04 * Math.sin(11 * a + L * 3);
      const yy = p.getY(i);
      const wob = 1 + 0.05 * Math.sin(yy * 4 + a * 2 + seed);
      p.setX(i, x * f * wob); p.setZ(i, z * f * wob);
    }
    paint(g, (c, x, yy, z, ny) => {
      if (ny > 0.9) c.copy(tC).lerp(tC2, 0.5 + 0.5 * Math.sin(x * 3 + z * 2 + seed));
      else if (ny < -0.9) c.copy(sBot);
      else c.copy(sBot).lerp(sTop, THREE.MathUtils.clamp((yy + hh / 2) / hh, 0, 1) * 0.9 + 0.1);
    });
    g.translate(ox, y + hh / 2, oz);
    parts.push(clean(g));
    tops.push({ x: ox, y: y + hh, z: oz, r: rr * 0.85 });
    y += hh * 0.92;
    const a = seed * 3 + L * 2;
    ox += Math.cos(a) * rr * 0.25; oz += Math.sin(a) * rr * 0.25;
    rr *= rand(0.5, 0.68); hh *= rand(0.7, 1.0);
  }
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  return { geo, tops };
}

/** Sand texture with soft wavy ripples. */
export function rippleTexture(base = '#f6dca2', line = '#fff0c8') {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 5; g.lineCap = 'round';
  for (let y = 0; y < 256; y += 22) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 256 * Math.PI * 4 + y) * 6); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Little dive boat; the player stands on the deck at y=0. */
export function makeBoat() {
  const g = new THREE.Group();
  const outline = new THREE.Shape();
  outline.moveTo(-0.7, 1.1); outline.lineTo(0.7, 1.1); outline.lineTo(0.75, -0.5); outline.quadraticCurveTo(0.6, -1.3, 0, -1.75); outline.quadraticCurveTo(-0.6, -1.3, -0.75, -0.5); outline.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.55, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  hullGeo.rotateX(Math.PI / 2); // extrude goes down (−y)
  paint(hullGeo, (c, x, y) => c.set(y > -0.16 ? 0xffffff : y > -0.26 ? 0x2f8cff : 0xff5d5d));
  const hull = new THREE.Mesh(hullGeo, toon(0xffffff, { vertexColors: true }));
  hull.position.y = 0.02;
  const deckGeo = new THREE.ShapeGeometry(outline).rotateX(Math.PI / 2); // same orientation as the hull (bow at −z)
  deckGeo.scale(0.93, 1, 0.93);
  const cv=document.createElement('canvas');cv.width=cv.height=256;const dx=cv.getContext('2d');dx.fillStyle='#b88b58';dx.fillRect(0,0,256,256);for(let k=0;k<8;k++){dx.fillStyle=['#b18a5d','#c09a67','#ae8053','#c6a173'][k%4];dx.fillRect(k*32+1,0,30,256);dx.strokeStyle='rgba(89,54,28,.29)';dx.lineWidth=1;for(let j=0;j<5;j++){dx.beginPath();dx.moveTo(k*32+4+j*5,0);for(let y=0;y<=256;y+=12)dx.lineTo(k*32+4+j*5+Math.sin(y*.07+j)*1.6,y);dx.stroke();}}const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(.65,.48);const deck = new THREE.Mesh(deckGeo,new THREE.MeshStandardMaterial({map:tex,roughness:.85,side:THREE.DoubleSide}));
  deck.position.y = 0.03;
  // planks
  const lines = [];
  for (let x = -0.6; x <= 0.6; x += 0.15) lines.push(new THREE.Vector3(x, 0.035, 1.0), new THREE.Vector3(x, 0.035, -1.2 + Math.abs(x) * 0.6));
  const planks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0xa8743e }));
  // rail
  const railPts = outline.getPoints(24).map((p) => new THREE.Vector3(p.x * 0.97, 0.55, p.y * 0.97));
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, true), 60, 0.025, 6, true), toon(0xffffff));
  const posts = railPts.filter((_, i) => i % 3 === 0).map((p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 6), rail.material); m.position.set(p.x, 0.29, p.z); return m; });
  // cabin at the back with a flag + life ring
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.55), toon(0xffffff)); cabin.position.set(0, 0.45, 1.05);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.7), toon(0x2f8cff)); roof.position.set(0, 0.94, 1.05);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), toon(0x9fe8ff, { emissive: 0x2a6f8f })); win.position.set(0, 0.6, 0.77); win.rotation.y = Math.PI;
  const ringM = toon(0xff5d5d);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 20), ringM); ring.position.set(0.45, 0.55, 0.77);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2), toon(0xffffff)); mast.position.set(-0.4, 1.55, 1.05);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), toon(0xffd23f, { side: THREE.DoubleSide })); flag.position.set(-0.2, 2.0, 1.05);
  g.add(hull, deck, planks, rail, ...posts, cabin, roof, win, ring, mast, flag);
  g.userData.flag = flag;
  return g;
}

/** Stylised surface water (seen from above). */
export function surfaceWater(uTime, { shallow = 0x269aa2, deep = 0x164b80, size = 200 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime, uS: { value: new THREE.Color(shallow) }, uD: { value: new THREE.Color(deep) } },
    vertexShader: `uniform float uTime; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0);
        w.y += sin(w.x*0.6 + uTime*1.3)*0.05 + sin(w.z*0.8 + uTime*1.0)*0.05;
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uS; uniform vec3 uD; varying vec3 vW;
      void main(){
        vec2 p=vW.xz;float t=uTime;
        float a=sin(p.x*1.85+p.y*.74+t*1.1),b=sin(p.x*.73-p.y*2.3+t*.75),c=sin(p.x*4.2+p.y*3.1-t*1.5);
        vec3 n=normalize(vec3(-.10*a-.05*b-.025*c,1.0,-.06*a+.12*b-.032*c));
        vec3 v=normalize(cameraPosition-vW),sun=normalize(vec3(-.4,.85,.2));
        float fres=pow(1.-max(dot(n,v),0.),4.5),dist=smoothstep(1.,48.,length(p));
        vec3 col=mix(uS,uD,.2+.8*dist);col*=.88+.12*a+.07*b;
        col=mix(col,vec3(.37,.63,.75),fres*.61);
        float spec=pow(max(dot(reflect(-sun,n),v),0.),72.);float spark=pow(max(dot(reflect(-sun,n),v),0.),165.);
        col+=vec3(1.,.90,.71)*spec*.56+vec3(.86,.97,1.)*spark*.35;
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 100, 100).rotateX(-Math.PI / 2), m);
  return mesh;
}

/** Whale: smooth body (dark back, light striped belly), flukes, fins. update(t) swims it. */
export function makeWhale() {
  const g = new THREE.Group();
  const prof = [[0, -1.9], [0.25, -1.75], [0.55, -1.3], [0.75, -0.6], [0.8, 0.1], [0.68, 0.8], [0.45, 1.4], [0.22, 1.9], [0.12, 2.25], [0, 2.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 24).rotateX(Math.PI / 2); // along +z = head at -z
  body.scale(1, 0.85, 1);
  paint(body, (c, x, y) => { if (y < -0.18) { const stripe = Math.sin(x * 26) > 0.2 ? 0.93 : 1; c.setRGB(0.93 * stripe, 0.95 * stripe, 0.97 * stripe); } else c.setHex(0x3d6aa8); });
  const bm = new THREE.Mesh(body, toon(0xffffff, { vertexColors: true, rim: 0xbfefff, rimK: 0.6 }));
  const tail = new THREE.Group(); tail.position.z = 2.3;
  const fluke = new THREE.Shape(); fluke.moveTo(0, 0); fluke.quadraticCurveTo(0.6, 0.2, 1.1, 0.55); fluke.quadraticCurveTo(0.6, 0.6, 0, 0.3); fluke.quadraticCurveTo(-0.6, 0.6, -1.1, 0.55); fluke.quadraticCurveTo(-0.6, 0.2, 0, 0);
  const fl = new THREE.Mesh(new THREE.ExtrudeGeometry(fluke, { depth: 0.06, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.03, 0), toon(0x3d6aa8));
  tail.add(fl);
  const finGeo = new THREE.SphereGeometry(1, 12, 8).scale(0.7, 0.05, 0.25);
  const fins = [-1, 1].map((s) => { const f = new THREE.Mesh(finGeo, toon(0x3d6aa8)); f.position.set(s * 0.85, -0.3, -0.5); f.rotation.set(0, s * 0.5, s * -0.5); return f; });
  const eyes = [-1, 1].map((s) => { const e = cartoonEye(0.07); e.position.set(s * 0.6, 0.05, -1.25); e.rotation.y = s * 1.2; return e; });
  g.add(bm, tail, ...fins, ...eyes);
  g.userData.update = (t) => { tail.rotation.x = Math.sin(t * 1.4) * 0.35; fins.forEach((f, i) => (f.rotation.z = (i ? -0.5 : 0.5) + Math.sin(t * 1.4) * 0.15)); bm.rotation.x = Math.sin(t * 1.4 + 1) * 0.03; };
  return g;
}

/** Manta ray with flapping wings. */
export function makeManta() {
  const g = new THREE.Group();
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0.45); wingShape.quadraticCurveTo(0.6, 0.35, 1.2, -0.05); wingShape.quadraticCurveTo(0.6, -0.15, 0, -0.45); wingShape.lineTo(0, 0.45);
  const wg = new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2);
  const top = toon(0x2b3f7a, { side: THREE.DoubleSide, rim: 0x9fdcff, rimK: 0.5 });
  const wings = [1, -1].map((s) => { const piv = new THREE.Group(); const m = new THREE.Mesh(wg, top); m.scale.x = s; piv.add(m); return piv; });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10).scale(1, 0.35, 1.5), toon(0x2b3f7a));
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 10).scale(1, 0.3, 1.45), toon(0xf2f6ff)); belly.position.y = -0.03;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.025, 0.9, 5).rotateX(Math.PI / 2), top); tail.position.z = 0.8;
  const eyes = [-1, 1].map((s) => { const e = cartoonEye(0.04); e.position.set(s * 0.2, 0.06, -0.38); e.rotation.y = Math.PI - s * 0.4; return e; });
  g.add(...wings, body, belly, tail, ...eyes);
  g.userData.update = (t) => { const f = Math.sin(t * 2.2) * 0.45; wings[0].rotation.z = f; wings[1].rotation.z = -f; };
  return g;
}

/** Dolphin for the surface (jumps in arcs). */
export function makeDolphin() {
  const g = new THREE.Group();
  const prof = [[0, -0.75], [0.07, -0.65], [0.16, -0.4], [0.2, -0.05], [0.17, 0.3], [0.1, 0.6], [0.05, 0.8], [0, 0.85]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 16).rotateX(Math.PI / 2);
  paint(body, (c, x, y) => c.setHex(y < -0.05 ? 0xe8f2fa : 0x5b8fd0));
  g.add(new THREE.Mesh(body, toon(0xffffff, { vertexColors: true })));
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4).scale(0.3, 1, 1), toon(0x5b8fd0)); fin.position.set(0, 0.22, 0.05); fin.rotation.x = 0.4;
  const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.22, 0.02, 0.08), toon(0x5b8fd0)); tail.position.z = 0.85;
  const eyes = [-1, 1].map((s) => { const e = cartoonEye(0.025); e.position.set(s * 0.1, 0.03, -0.45); e.rotation.y = Math.PI - s; return e; });
  g.add(fin, tail, ...eyes);
  return g;
}

/** Round cartoon polar bear (white, black nose, little ears). scale 1 = cub ~0.45 m. */
export function makePolarBear(scale = 1) {
  const g = new THREE.Group();
  const fur = toon(0xf7f9fc, { rim: 0xcfeeff, rimK: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), fur); body.scale.set(1, 0.85, 1.35); body.position.y = 0.2;
  const head = new THREE.Group(); head.position.set(0, 0.36, -0.25);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), fur);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), fur); snout.scale.set(1, 0.8, 1.1); snout.position.set(0, -0.03, -0.11);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), toon(0x1c1c22)); nose.position.set(0, -0.01, -0.175);
  const ears = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), fur); e.position.set(s * 0.09, 0.1, 0.0); return e; });
  const eyes = [-1, 1].map((s) => { const e = cartoonEye(0.026); e.position.set(s * 0.05, 0.03, -0.11); e.rotation.y = Math.PI - s * 0.3; return e; }); // look forward (−z)
  head.add(skull, snout, nose, ...ears, ...eyes);
  const legs = [[-0.12, -0.17], [0.12, -0.17], [-0.12, 0.17], [0.12, 0.17]].map(([x, z]) => { const l = new THREE.Group();const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.052,.075,6,12),fur);limb.position.y=.095;const paw=new THREE.Mesh(new THREE.SphereGeometry(.059,16,12),fur);paw.scale.set(.95,.58,1.22);paw.position.set(0,.027,-.018);l.add(limb,paw);l.position.set(x,0,z);return l; });
  g.add(body, head, ...legs);
  g.scale.setScalar(scale);
  g.userData.head = head;
  return g;
}

/** Faceted iceberg (white top, mint sides). */
export function icebergGeometry(h = 3, r = 2) {
  const g = new THREE.CylinderGeometry(r * 0.55, r, h, 7, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * rand(0.8, 1.15)); p.setZ(i, p.getZ(i) * rand(0.8, 1.15)); if (y > h / 2 - 0.01) p.setY(i, y + rand(-0.3, 0.6)); }
  g.translate(0, h / 2, 0);
  const geo = clean(g);
  geo.computeVertexNormals();
  paint(geo, (c, x, y, z, ny) => c.setHex(ny > 0.5 ? 0xffffff : y > h * 0.6 ? 0xdff8ff : 0x9fe3f0));
  return geo;
}

/** Flat ice floe disc. */
export function floeGeometry(r = 1) {
  const g = new THREE.CylinderGeometry(r, r * 0.95, 0.22, 14, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const f = 1 + 0.08 * Math.sin(5 * a) + 0.05 * Math.sin(9 * a + 1); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  const geo = clean(g); geo.computeVertexNormals();
  paint(geo, (c, x, y, z, ny) => c.setHex(ny > 0.5 ? 0xffffff : 0x8fdcef));
  return geo;
}

export function iceChunk() {
  const geo = clean(new THREE.DodecahedronGeometry(0.16, 0)); geo.scale(1.3, 0.6, 1); geo.computeVertexNormals();
  paint(geo, (c, x, y, z, ny) => c.setHex(ny > 0.3 ? 0xffffff : 0xa8ecf8));
  return new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, flat: true, rim: 0xdff8ff, rimK: 0.7 }));
}

/** Clam with a pearl (decor). */
export function makeClam(color = 0xff8fc8) {
  const g = new THREE.Group();
  const m = toon(color);
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m); lower.scale.y = 0.5;
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); upper.scale.y = 0.5; upper.position.z = 0.14; upper.rotation.x = -0.7; upper.position.y = 0.02;
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), toon(0xffffff, { emissive: 0xaaaaff, emissiveIntensity: 0.4 })); pearl.position.y = 0.04;
  g.add(lower, upper, pearl);
  return g;
}

export { blobGeometry };

/** Light-weight branching coral (~300 triangles) for dense VR reefs. */
export function lowBranchCoral() {
  const parts = [];
  const grow = (base, dir, len, r, depth) => {
    const end = base.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(r * 0.7, r, len, 5, 1, true).translate(0, len / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    geo.translate(base.x, base.y, base.z);
    parts.push(geo);
    if (depth === 0) { parts.push(new THREE.IcosahedronGeometry(r * 1.1, 0).translate(end.x, end.y, end.z)); return; }
    const n = depth === 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d = dir.clone().add(new THREE.Vector3(rand(-0.8, 0.8), rand(0.2, 0.6), rand(-0.8, 0.8))).normalize();
      grow(end, d, len * 0.78, r * 0.75, depth - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.2, 0.045, 2);
  const g = mergeGeometries(parts.map(clean));
  g.computeVertexNormals();
  return g;
}

/** Light-weight tube sponge cluster. */
export function lowTubeSponge() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const h = rand(0.25, 0.5), x = rand(-0.1, 0.1), z = rand(-0.1, 0.1);
    parts.push(new THREE.CylinderGeometry(0.06, 0.05, h, 8, 1, true).translate(x, h / 2, z));
  }
  return mergeGeometries(parts.map(clean));
}
