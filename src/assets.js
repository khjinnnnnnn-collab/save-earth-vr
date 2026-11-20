import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const hdrLoader = new HDRLoader(manager);
const texLoader = new THREE.TextureLoader(manager);
const cache = new Map();

function memo(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// Glass/transmission is too costly on Quest: replace with cheap transparency.
function sanitize(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false; // scenery doesn't cast (Quest perf); interactive items opt in
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.65; m.depthWrite = false; }
      if (m.map) m.map.anisotropy = 4;
    }
  });
  return root;
}

export const loadModel = (id) => memo('m:' + id, async () => sanitize((await gltfLoader.loadAsync(`assets/models/${id}.glb`)).scene));

/** Clone a model (or one named node inside it), re-centred at origin with its base on y=0. */
export async function instance(id, nodeName = null, { center = true } = {}) {
  const scene = await loadModel(id);
  let src = scene;
  if (nodeName) {
    src = scene.getObjectByName(nodeName);
    if (!src) throw new Error(`node ${nodeName} not in ${id}`);
  }
  const obj = src.clone(true);
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  if (center) {
    const g = new THREE.Group();
    g.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -box.min.y, -c.z);
    g.name = nodeName || id;
    return g;
  }
  return obj;
}

export const loadHDR = (id) => memo('h:' + id, async () => {
  const t = await hdrLoader.loadAsync(`assets/hdri/${id}.hdr`);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
});

export function loadTexSet(id, repeat = 1) {
  return memo(`t:${id}:${repeat}`, () => {
    const mk = (f, srgb) => {
      const t = texLoader.load(`assets/tex/${id}/${f}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { diff: mk('diff', true), nor: mk('nor_gl', false), arm: mk('arm', false) };
  });
}

/** Deep-clone materials so an object can be highlighted/tinted independently. */
export function uniqueMaterials(root) {
  root.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  });
  return root;
}
