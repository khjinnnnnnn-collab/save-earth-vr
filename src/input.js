import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const _q = new THREE.Quaternion();

export class Hand {
  constructor(id) {
    this.id = id;
    this.pressed = false; this.justPressed = false; this.justReleased = false;
    this.doubleClick = false; this.actionPressed=false; this.justAction=false; this._actionPrev=false;
    this.held = null;
    this.pos = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3(0, 0, -1);
    this.hist = [];
    this.connected = false;
    this.isDesktop = false;
    this.gamepad = null;
    this.anchor = null; // Object3D that held items attach to
  }
  pulse(intensity = 0.5, ms = 60) {
    const h = this.gamepad?.hapticActuators?.[0];
    if (h?.pulse) h.pulse(intensity, ms);
  }
}

export function createInput(ctx) {
  const { renderer, rig, scene, camera } = ctx;
  const factory = new XRControllerModelFactory();
  const xrHands = [];
  const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);

  for (let i = 0; i < 2; i++) {
    const ray = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    rig.add(ray, grip);
    grip.add(factory.createControllerModel(grip));
    const hand = new Hand(i);
    hand.anchor = grip;
    hand.rayObj = ray;
    const btn = { select: false, squeeze: false };
    hand._btn = btn;
    ray.addEventListener('connected', (e) => { hand.connected = true; hand.gamepad = e.data.gamepad; hand.handedness = e.data.handedness; });
    ray.addEventListener('disconnected', () => { hand.connected = false; btn.select = btn.squeeze = false; });
    ray.addEventListener('selectstart', () => (btn.select = true));
    ray.addEventListener('selectend', () => (btn.select = false));
    ray.addEventListener('squeezestart', () => (btn.squeeze = true));
    ray.addEventListener('squeezeend', () => (btn.squeeze = false));
    const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0x9ff7c4, transparent: true, opacity: 0.7 }));
    laser.scale.z = 3;
    laser.visible = false;
    ray.add(laser);
    hand.laser = laser;
    xrHands.push(hand);
  }

  // Desktop (mouse) hand — lets the game be tested / projected without a headset.
  const dh = new Hand(9);
  dh.isDesktop = true;
  dh.connected = true;
  dh.anchor = new THREE.Object3D();
  scene.add(dh.anchor);
  dh.holdDist = 0.7;
  const ndc = new THREE.Vector2();
  let mouseDown = false, dbl = false, dragLook = null;
  const el = renderer.domElement;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (dragLook) {
      camera.rotation.y -= (e.clientX - dragLook.x) * 0.004;
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - (e.clientY - dragLook.y) * 0.004, -1.2, 1.2);
      dragLook = { x: e.clientX, y: e.clientY };
    }
  });
  el.addEventListener('pointerdown', (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (e.button === 2) dragLook = { x: e.clientX, y: e.clientY }; else mouseDown = true;
  });
  window.addEventListener('pointerup', (e) => { if (e.button === 2) dragLook = null; else mouseDown = false; });
  el.addEventListener('dblclick', () => (dbl = true));
  const keys = new Set();
  window.addEventListener('keydown', (e) => { keys.add(e.key); if (e.key === ' ') { e.preventDefault(); if(!e.repeat) dbl = true; } });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  const raycaster = new THREE.Raycaster();

  // Programmatic control for automated tests: input.debug = { ndc:[x,y], down:bool }
  const api = {
    hands: xrHands, desktop: dh, debug: null,
    get active() { return renderer.xr.isPresenting ? xrHands.filter((h) => h.connected) : [dh]; },
    setLaser(on) { xrHands.forEach((h) => (h.laser.visible = on)); },
    update(dt) {
      if (!renderer.xr.isPresenting) {
        if (keys.has('ArrowLeft')) camera.rotation.y += dt * 1.5;
        if (keys.has('ArrowRight')) camera.rotation.y -= dt * 1.5;
        if (keys.has('ArrowUp')) camera.rotation.x = Math.min(1.2, camera.rotation.x + dt);
        if (keys.has('ArrowDown')) camera.rotation.x = Math.max(-1.2, camera.rotation.x - dt);
      }
      for (const h of api.active) {
        const prev = h.pressed;
        if (h.isDesktop) {
          if (api.debug) { ndc.set(api.debug.ndc[0], api.debug.ndc[1]); mouseDown = !!api.debug.down; if (api.debug.dbl) { dbl = true; api.debug.dbl = false; } }
          camera.updateMatrixWorld();
          raycaster.setFromCamera(ndc, camera);
          h.rayOrigin.copy(raycaster.ray.origin);
          h.rayDir.copy(raycaster.ray.direction);
          h.anchor.position.copy(h.rayOrigin).addScaledVector(h.rayDir, h.holdDist);
          camera.getWorldQuaternion(_q);
          h.anchor.quaternion.copy(_q);
          h.anchor.updateMatrixWorld();
          h.pressed = mouseDown;
          if (h.pressed && !prev) h.pressNdc = ndc.clone();
          if (h.pressNdc) h.dragDist = ndc.distanceTo(h.pressNdc);
          h.doubleClick = dbl; h.actionPressed=keys.has(' ')||!!api.debug?.action; dbl = false;
        } else {
          h.pressed = h._btn.select || h._btn.squeeze;
          h.doubleClick = false; h.actionPressed=h._btn.select;
          h.rayObj.getWorldPosition(h.rayOrigin);
          h.rayDir.set(0, 0, -1).applyQuaternion(h.rayObj.getWorldQuaternion(_q));
        }
        h.justAction=h.actionPressed&&!h._actionPrev; h._actionPrev=h.actionPressed;
        h.justPressed = h.pressed && !prev;
        h.justReleased = !h.pressed && prev;
        h.anchor.getWorldPosition(h.pos);
        h.hist.push({ p: h.pos.clone(), dt });
        if (h.hist.length > 6) h.hist.shift();
        if (h.hist.length > 1) {
          const T = h.hist.slice(1).reduce((s, e) => s + e.dt, 0);
          h.velocity.copy(h.hist[h.hist.length - 1].p).sub(h.hist[0].p).divideScalar(Math.max(T, 1e-3));
        }
      }
    },
  };
  return api;
}
