import * as THREE from 'three';

// Cute face drawn on a canvas, projected onto the front of the planet.
function faceTexture(mood) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const eye = (x, y) => {
    if (mood === 'happy') { g.lineWidth = 22; g.strokeStyle = '#1b1b1b'; g.beginPath(); g.arc(x, y + 14, 38, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); return; }
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, 46, 52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(x, y + 10, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 9, y + 1, 9, 0, Math.PI * 2); g.fill();
    if (mood === 'sick') { g.fillStyle = 'rgba(120,130,120,0.95)'; g.fillRect(x - 50, y - 56, 100, 46); }
  };
  eye(176, 220); eye(336, 220);
  if (mood === 'sick') {
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(130, 168); g.lineTo(210, 146); g.stroke();
    g.beginPath(); g.moveTo(382, 168); g.lineTo(302, 146); g.stroke();
    g.lineWidth = 16; g.beginPath();
    for (let i = 0; i <= 8; i++) { const x = 196 + i * 15; const y = 345 + (i % 2 ? -10 : 10); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = '#7fd3ff'; g.beginPath(); g.moveTo(420, 140); g.quadraticCurveTo(445, 190, 420, 200); g.quadraticCurveTo(395, 190, 420, 140); g.fill();
  } else {
    g.fillStyle = '#5a1a1a'; g.beginPath(); g.moveTo(186, 320); g.quadraticCurveTo(256, 420, 326, 320); g.closePath(); g.fill();
    g.fillStyle = '#ff7b8a'; g.beginPath(); g.ellipse(256, 372, 34, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,120,140,0.55)'; g.beginPath(); g.ellipse(120, 300, 40, 24, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(392, 300, 40, 24, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const vert = /* glsl */`
varying vec3 vPos; varying vec3 vNormalW; varying vec3 vViewDir;
void main(){
  vPos = position;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */`
uniform float uTime; uniform float uHealth; uniform float uRadius; uniform sampler2D uFace;
varying vec3 vPos; varying vec3 vNormalW; varying vec3 vViewDir;
vec3 hash3(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx)*2.0-1.0; }
float noise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); vec3 u=f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash3(i),f),dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z); }
float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
void main(){
  vec3 n = normalize(vPos);
  float a = uTime*0.08; mat2 r = mat2(cos(a),-sin(a),sin(a),cos(a));
  vec3 q = n; q.xz = r*q.xz;
  float h = fbm(q*2.2);
  float land = smoothstep(0.02,0.06,h);
  float polar = smoothstep(0.78,0.86,abs(n.y));
  vec3 ocean = mix(vec3(0.33,0.36,0.33), vec3(0.06,0.32,0.72), uHealth);
  vec3 grass = mix(vec3(0.42,0.36,0.24), vec3(0.22,0.62,0.25), uHealth);
  vec3 hill  = mix(vec3(0.35,0.3,0.22), vec3(0.45,0.5,0.25), uHealth);
  vec3 col = mix(ocean, mix(grass, hill, smoothstep(0.1,0.25,h)), land);
  col = mix(col, vec3(0.95), polar*mix(0.4,1.0,uHealth));
  vec3 cq = q; cq.xz = r*cq.xz;
  float cloud = smoothstep(0.05,0.35,fbm(cq*3.5+vec3(uTime*0.03)));
  col = mix(col, mix(vec3(0.42,0.4,0.36), vec3(1.0), uHealth), cloud*mix(0.85,0.55,uHealth));
  vec3 L = normalize(vec3(0.4,0.7,0.6));
  float diff = 0.45 + 0.65*max(dot(vNormalW,L),0.0);
  col *= diff;
  float rim = pow(1.0-max(dot(vNormalW,vViewDir),0.0), 2.5);
  col += rim * mix(vec3(0.5,0.45,0.35), vec3(0.35,0.65,1.0), uHealth) * 0.9;
  vec2 fuv = n.xy*0.62 + 0.5;
  if (n.z > 0.0) { vec4 f = texture2D(uFace, fuv); col = mix(col, f.rgb, f.a*smoothstep(0.05,0.35,n.z)); }
  gl_FragColor = vec4(col,1.0);
  #include <colorspace_fragment>
}`;

export function createEarth(radius = 0.6) {
  const faces = { sick: faceTexture('sick'), happy: faceTexture('happy') };
  const uniforms = { uTime: { value: 0 }, uHealth: { value: 0 }, uRadius: { value: radius }, uFace: { value: faces.sick } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  const group = new THREE.Group();
  group.add(mesh);
  // soft glow halo
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 48, 32), new THREE.MeshBasicMaterial({ color: 0x7fb8ff, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }));
  group.add(halo);
  group.userData = {
    uniforms, mesh, halo,
    setMood(m) { uniforms.uFace.value = faces[m]; },
    update(dt) { uniforms.uTime.value += dt; halo.material.color.setRGB(0.5 + 0.0 * uniforms.uHealth.value, 0.55 + 0.2 * uniforms.uHealth.value, 0.55 + 0.45 * uniforms.uHealth.value); halo.material.opacity = 0.06 + 0.1 * uniforms.uHealth.value; },
  };
  return group;
}

export function createStars(n = 1800, r = 90) {
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(r);
    p.set([v.x, v.y, v.z], i * 3);
    const k = 0.6 + Math.random() * 0.4; c.set([k, k, k + Math.random() * 0.2], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true, fog: false }));
}

export const ORB_COLORS = { land: 0x3ccf5a, sea: 0x3a9bff, sky: 0xf2f6ff };

export function createOrb(kind, r = 0.07) {
  const color = ORB_COLORS[kind];
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.2 }));
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, 32, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(core, shell);
  g.userData.kind = kind;
  return g;
}
