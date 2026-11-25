import * as THREE from 'three';

// Cartoon look shared by the whole game: stepped (toon) lighting, a soft bright rim, optional moving caustics.

let grad = null;
/** 4-step light ramp: shadow, mid, lit, highlight. */
export function gradientMap() {
  if (grad) return grad;
  grad = new THREE.DataTexture(new Uint8Array([105, 165, 220, 255]), 4, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  return grad;
}

export const toonShared = { uTime: { value: 0 }, uCaustic: { value: 1 } };

/**
 * Toon material. rim = colour of the glowing edge, caustics = moving light pattern on upward faces.
 */
export function toon(color = 0xffffff, { vertexColors = false, rim = 0xbff8ff, rimK = 0.45, caustics = false, flat = false,  side = THREE.FrontSide, transparent = false, opacity = 1, emissive = 0x000000, emissiveIntensity = 1, map = null, alphaTest = 0, depthWrite = true } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), vertexColors, side, transparent, opacity, emissive, emissiveIntensity, map, alphaTest, depthWrite });
  void flat; // faceted look comes from non-indexed geometry
  const rimColor = new THREE.Color(rim);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = toonShared.uTime;
    sh.uniforms.uCaustic = toonShared.uCaustic;
    sh.uniforms.uRim = { value: rimColor };
    sh.uniforms.uRimK = { value: rimK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying float vUp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp4 = vec4(transformed, 1.0); vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4; wn = mat3(instanceMatrix) * wn;
        #endif
        vWPos = (modelMatrix * wp4).xyz; vUp = normalize(mat3(modelMatrix) * wn).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying float vUp; uniform float uTime; uniform float uCaustic; uniform vec3 uRim; uniform float uRimK;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uRim * fres * uRimK;
        ${caustics ? `
        vec2 cp = vWPos.xz * 1.1;
        float c1 = sin(cp.x * 2.0 + sin(cp.y * 1.7 + uTime * 1.3) * 1.5 + uTime);
        float c2 = sin(cp.y * 2.2 + sin(cp.x * 1.9 - uTime * 1.1) * 1.5 - uTime * 0.8);
        float cau = pow(max(0.0, 1.0 - abs(c1 * c2)), 6.0);
        totalEmissiveRadiance += vec3(0.55, 0.85, 0.9) * cau * 0.5 * uCaustic * smoothstep(0.3, 0.9, vUp);` : ''}`);
  };
  m.customProgramCacheKey = () => `toon${caustics ? 1 : 0}`;
  return m;
}

/** Swap every standard/basic-lit material in an object for a toon one (keeps colour, map, transparency). */
export function toonify(obj, opts = {}) {
  const cache = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => {
      if (!m || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) return m;
      if (cache.has(m)) return cache.get(m);
      const t = toon(m.color.getHex(), {
        vertexColors: m.vertexColors, map: m.map, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
        emissive: m.emissive ? m.emissive.getHex() : 0, emissiveIntensity: m.emissiveIntensity ?? 1, depthWrite: m.depthWrite, ...opts,
      });
      cache.set(m, t);
      return t;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return obj;
}

/** Big inside-out sphere with a vertical colour gradient (sky or underwater). */
export function gradientDome(r = 150) {
  const u = {
    uTop: { value: new THREE.Color(0x9ff0ff) }, uMid: { value: new THREE.Color(0x3fb6d8) }, uBot: { value: new THREE.Color(0x134f8f) },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(uMid, uTop, pow(h, 0.7)) : mix(uMid, uBot, pow(-h, 0.6));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), m);
  dome.renderOrder = -10;
  dome.userData.u = u;
  return dome;
}

/** Soft radial glow texture (for halos, sparkles). */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.3, 'rgba(255,236,140,0.6)'); grd.addColorStop(1, 'rgba(255,210,80,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
