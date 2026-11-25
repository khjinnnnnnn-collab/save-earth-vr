import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Reusable, smooth, low-cost meshes: one instanced draw per coral family.
const vec = (x,y,z) => new THREE.Vector3(x,y,z);
function combine(parts) { const gs=parts.map(g=>g.index ? g.toNonIndexed() : g); const m=mergeGeometries(gs); for(const g of new Set([...parts,...gs])) g.dispose(); return m; }
export function plateCoral() {
  const parts=[];
  for(let k=0;k<3;k++){
    const r=[.27,.38,.31][k], y=.12+k*.14;
    const pts=[[0,-.04],[.3*r,-.04],[.72*r,-.025],[r,.015],[r*.98,.045],[r*.74,.025],[r*.35,.005],[0,.005]].map(([x,y])=>new THREE.Vector2(x,y));
    const g=new THREE.LatheGeometry(pts,16); const p=g.attributes.position;
    for(let i=0;i<p.count;i++){ const x=p.getX(i),z=p.getZ(i), a=Math.atan2(z,x); const f=1+.09*Math.sin(a*5+k)+.04*Math.cos(a*9); p.setXYZ(i,x*f,p.getY(i)+.018*Math.sin(a*6)*Math.hypot(x,z)/r,z*f); }
    g.computeVertexNormals(); g.translate(Math.sin(k*2)*.065,y,Math.cos(k*2)*.065); parts.push(g);
  }
  parts.push(new THREE.CylinderGeometry(.055,.09,.33,10).translate(0,.16,0)); return combine(parts);
}
export function pearlCoral() {
  const parts=[]; for(let i=0;i<13;i++){const a=i*2.39996, r=.25*Math.sqrt(i/13), h=.1+.17*Math.sqrt(1-i/14); const s=.065+.025*Math.sin(i*4); parts.push(new THREE.SphereGeometry(s,7,5).scale(1,1.2,1).translate(Math.cos(a)*r,h,Math.sin(a)*r));} return combine(parts);
}
export function softBranch() {
  const parts=[];
  const grow=(base,dir,len,r,depth)=>{const end=base.clone().addScaledVector(dir,len); const g=new THREE.CapsuleGeometry(r,len,2,6); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(vec(0,1,0),dir)); g.translate(...base.clone().lerp(end,.5).toArray()); parts.push(g); if(depth) for(let i=0;i<2;i++){const a=depth*2+i*Math.PI+base.x*8;grow(end,dir.clone().add(vec(Math.cos(a)*.75,.25,Math.sin(a)*.75)).normalize(),len*.77,r*.66,depth-1);} }; grow(vec(0,0,0),vec(0,1,0),.19,.04,2); return combine(parts);
}
export function vaseCoral(){const parts=[]; for(let i=0;i<4;i++){const h=.26+.14*Math.sin(i*2+1), r=.075; const points=[[r*.55,0],[r*.72,h*.35],[r,h*.82],[r*1.14,h],[r*.8,h],[r*.6,h*.72],[r*.4,.035],[0,.035]].map(p=>new THREE.Vector2(...p)); const g=new THREE.LatheGeometry(points,12); g.rotateZ(.14*Math.sin(i*2)); g.translate(Math.cos(i*2.4)*.11,0,Math.sin(i*2.4)*.11);parts.push(g);}return combine(parts);}
