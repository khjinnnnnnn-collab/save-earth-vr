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
  const tip=textPanel({width:.77,height:.19,res:1024,size:45,bg:'rgba(8,43,63,.88)',border:'rgba(119,231,237,.85)'});
  tip.position.set(0,.36,-1.22);tip.material.depthTest=false;tip.renderOrder=9001;tip.visible=false;ctx.camera.add(tip);
  const lesson=textPanel({width:1.04,height:.36,res:1536,size:64,bg:null});lesson.position.set(0,.03,-1.42);lesson.material.depthTest=false;lesson.renderOrder=9002;lesson.visible=false;ctx.camera.add(lesson);
  let until=0,current=null,wasXR=false;
  const drawTip=()=>{wasXR=ctx.renderer.xr.isPresenting;tip.setText('조작 안내 · '+current[0]+'\n'+current[wasXR?1:2]);};
  ctx.onUpdate(()=>{if(tip.visible&&ctx.time>=until)tip.visible=false;if(tip.visible&&wasXR!==ctx.renderer.xr.isPresenting)drawTip();});
  return {
    hint(title,vr,pc,seconds=7){current=[title,vr,pc];until=ctx.time+seconds;drawTip();tip.visible=document.getElementById('tips-enabled')?.checked!==false;},
    hideHint(){tip.visible=false;},
    showLesson(title,body,page,total){tip.visible=false;sub.visible=false;lesson.visible=true;lesson.draw((g,w,h)=>{
      const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,'rgba(9,43,59,.98)');bg.addColorStop(1,'rgba(15,77,85,.97)');
      roundRect(g,7,7,w-14,h-14,42);g.fillStyle=bg;g.fill();g.strokeStyle='#9de5db';g.lineWidth=5;g.stroke();
      g.textAlign='left';g.textBaseline='middle';g.fillStyle='#a4ece0';g.font='700 47px '+FONT;g.fillText(title,64,70);
      g.textAlign='right';g.fillStyle='#f6d58c';g.font='700 43px '+FONT;g.fillText(page+' / '+total,w-64,70);
      g.strokeStyle='rgba(164,236,224,.35)';g.lineWidth=2;g.beginPath();g.moveTo(64,116);g.lineTo(w-64,116);g.stroke();
      g.textAlign='center';g.font='700 65px '+FONT;g.fillStyle='#f3fcff';const lines=wrap(g,body,w-140);const lh=88;lines.forEach((l,i)=>g.fillText(l,w/2,h*.54+(i-(lines.length-1)/2)*lh));
      for(let i=0;i<total;i++){g.beginPath();g.arc(w/2+(i-(total-1)/2)*44,h-44,10,0,Math.PI*2);g.fillStyle=i+1===page?'#f4d38c':'#51838c';g.fill();}
    });},
    hideLesson(){lesson.visible=false;},
    setSubtitlePlacement(where='bottom'){sub.position.y=where==='top'?.14:-.30;},
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
