import * as THREE from 'three';

export const FONT = '"Noto Sans KR","Noto Sans CJK KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      line = '';
      for (const ch of word) {
        if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
      }
    }
    out.push(line);
  }
  return out;
}

/** World-space text panel rendered from a canvas. */
export function textPanel({ width = 1, height = 0.25, res = 1024, text = '', size = 64, bg = 'rgba(8,32,22,0.82)', color = '#ffffff', border = 'rgba(160,255,200,0.5)', weight = 700 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = res; canvas.height = Math.round(res * height / width);
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = 50;
  mesh.setText = (t, o = {}) => {
    const s = o.size || size;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) { g.fillStyle = bg; roundRect(g, 4, 4, canvas.width - 8, canvas.height - 8, Math.min(48, canvas.height / 3)); g.fill(); if (border) { g.lineWidth = 5; g.strokeStyle = border; g.stroke(); } }
    g.font = `${weight} ${s}px ${FONT}`;
    g.fillStyle = o.color || color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = wrap(g, t, canvas.width - 80);
    const lh = s * 1.3;
    lines.forEach((l, i) => g.fillText(l, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * lh));
    tex.needsUpdate = true;
  };
  mesh.draw = (fn) => { g.clearRect(0, 0, canvas.width, canvas.height); fn(g, canvas.width, canvas.height); tex.needsUpdate = true; };
  mesh.setText(text);
  return mesh;
}

/** Subtitle line pinned to the bottom of the view + progress gauge helpers. */
export function createUI(ctx) {
  const sub = textPanel({ width: 0.9, height: 0.16, size: 52, bg: 'rgba(0,0,0,0.6)', border: null });
  sub.position.set(0, -0.3, -1.0);
  sub.material.depthTest = false;
  sub.renderOrder = 9000;
  sub.visible = false;
  ctx.camera.add(sub);
  return {
    subtitle(text) { if (!text) { sub.visible = false; return; } sub.setText(text); sub.visible = true; },
    gauge({ width = 0.9, label = '', color = '#3ccf7a' } = {}) {
      const p = textPanel({ width, height: width * 0.22, bg: null });
      p.set = (v, l = label) => p.draw((g, w, h) => {
        g.fillStyle = 'rgba(8,32,22,0.8)'; roundRect(g, 4, 4, w - 8, h - 8, 40); g.fill();
        g.font = `800 ${h * 0.3}px ${FONT}`; g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(l, 40, h * 0.3);
        g.textAlign = 'right'; g.fillText(`${Math.round(v * 100)}%`, w - 40, h * 0.3);
        g.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(g, 40, h * 0.56, w - 80, h * 0.24, h * 0.12); g.fill();
        g.fillStyle = color; roundRect(g, 40, h * 0.56, Math.max(h * 0.24, (w - 80) * v), h * 0.24, h * 0.12); g.fill();
      });
      p.set(0);
      return p;
    },
  };
}
