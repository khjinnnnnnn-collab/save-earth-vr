import * as THREE from 'three';

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

export function createEngine(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // consistent filmic tonality across the art pack
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 400);
  camera.position.set(0, 1.35, 0.25);
  camera.rotation.order = 'YXZ';
  camera.rotation.x = -0.18;
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const updaters = new Set();
  const maxDt = +(new URLSearchParams(location.search).get('maxdt') || 0.05); // tests on slow software GL raise this
  const timer = new THREE.Timer();
  let elapsed = 0;
  renderer.setAnimationLoop((t) => {
    timer.update(t);
    const dt = Math.min(timer.getDelta(), maxDt);
    elapsed += dt;
    for (const f of [...updaters]) f(dt, elapsed);
    renderer.render(scene, camera);
  });
  const onUpdate = (f) => { updaters.add(f); return () => updaters.delete(f); };

  // Promise-based tween / wait running on the render loop (works inside XR).
  const tween = (dur, fn, easing = ease.inOut) => new Promise((res) => {
    let t = 0;
    const off = onUpdate((dt) => {
      t += dt;
      const k = Math.min(t / dur, 1);
      fn(easing(k), k);
      if (k >= 1) { off(); res(); }
    });
  });
  const wait = (s) => tween(s, () => {}, ease.linear);
  const until = (cond, timeout = Infinity) => new Promise((res) => {
    let t = 0;
    const off = onUpdate((dt) => { t += dt; if (cond() || t >= timeout) { off(); res(t < timeout); } });
  });

  // Full-view fade sphere attached to the head.
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false });
  const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), fadeMat);
  fadeMesh.renderOrder = 10000;
  camera.add(fadeMesh);
  const fade = (to, dur = 0.6) => { const from = fadeMat.opacity; return tween(dur, (k) => { fadeMat.opacity = from + (to - from) * k; fadeMesh.visible = fadeMat.opacity > 0.001; }); };

  return { renderer, scene, camera, rig, onUpdate, tween, wait, until, fade, get time() { return elapsed; } };
}
