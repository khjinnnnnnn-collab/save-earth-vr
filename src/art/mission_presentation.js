import * as THREE from 'three';
import { textPanel, FONT } from '../ui.js?v=034';

// Art-only feeding animation: attach a beak to the existing animated head,
// and keep the interactive plastic object independent of the animal's rig.
export function turtleFeedingPose(turtle,bag,sceneRoot) {
  const head=turtle.children[2], eyes=turtle.children.slice(3,5), smile=turtle.children[5];
  const baseEyes=eyes.map(o=>o.position.clone());
  const beak=new THREE.Group();beak.position.set(0,-.028,.103);head.add(beak);
  const skin=new THREE.MeshStandardMaterial({color:0x718c59,roughness:.68});
  const lowerSkin=new THREE.MeshStandardMaterial({color:0x9aab72,roughness:.69});
  const inside=new THREE.MeshStandardMaterial({color:0x374335,roughness:.9});
  function ellipsoid(rx,ry,rz,m){return new THREE.Mesh(new THREE.SphereGeometry(1,24,14).scale(rx,ry,rz),m);}
  const upper=ellipsoid(.062,.027,.058,skin);upper.position.set(0,.009,.036);beak.add(upper);
  const mouth=ellipsoid(.053,.015,.038,inside);mouth.position.set(0,-.022,.052);beak.add(mouth);
  const jaw=new THREE.Group();jaw.position.set(0,-.027,.006);beak.add(jaw);
  const lower=ellipsoid(.056,.020,.060,lowerSkin);lower.position.set(0,-.006,.044);jaw.add(lower);
  // Small nostrils give the snout an anatomical read without a human smile.
  for(const sign of [-1,1]){const nostril=ellipsoid(.005,.0035,.003,inside);nostril.position.set(sign*.023,.026,.078);beak.add(nostril);}
  smile.visible=false;
  const world=new THREE.Vector3(), q=new THREE.Quaternion(), delta=new THREE.Quaternion(), e=new THREE.Euler();
  return function update(t,feeding){
    const cycle=.5+.5*Math.sin(t*2.5);
    const open=feeding? .22+.78*Math.pow(cycle,2):.04;
    head.position.z=.46+(feeding?.047*cycle:.008*Math.sin(t*1.5));
    head.rotation.x=feeding?.055*Math.sin(t*2.5):0;
    for(let i=0;i<eyes.length;i++){eyes[i].position.copy(baseEyes[i]);eyes[i].position.z+=head.position.z-.46;}
    jaw.rotation.x=.58*open;
    mouth.scale.y=.65+1.6*open;
    if(!feeding)return;
    const item=bag.userData.item;
    if(item?.heldBy||item?.fly||item?.done)return;
    // The upper handle touches the opening; the wrinkled body hangs below and beside the snout.
    head.updateWorldMatrix(true,false);
    head.localToWorld(world.set(.105,-.238+.010*Math.sin(t*2.5),.195+.022*cycle));
    sceneRoot.worldToLocal(world);bag.position.copy(world);
    turtle.getWorldQuaternion(q);delta.setFromEuler(e.set(.12+.07*Math.sin(t*2.1),.10,-.21+.09*Math.sin(t*2.5)));bag.quaternion.copy(q).multiply(delta);
    bag.scale.set(1.02,1.02+.035*Math.sin(t*3.2),1.02);
  };
}
function rounded(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function text(g,t,x,y,size,color='#e9f9ff',weight=700,align='center'){g.font=weight+' '+size+'px '+FONT;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.fillText(t,x,y);}
function check(g,x,y,r){g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle='#166458';g.fill();g.strokeStyle='#85efce';g.lineWidth=3;g.stroke();g.beginPath();g.moveTo(x-r*.48,y);g.lineTo(x-r*.12,y+r*.34);g.lineTo(x+r*.48,y-r*.38);g.strokeStyle='#a9f9d9';g.lineWidth=5;g.lineCap='round';g.lineJoin='round';g.stroke();}
function icon(g,type,x,y,s){g.save();g.translate(x,y);g.scale(s,s);g.lineWidth=3;g.lineJoin='round';g.lineCap='round';g.strokeStyle='#b4f3f0';g.fillStyle='#b4f3f0';
 if(type==='bottle'){g.beginPath();g.moveTo(-7,-21);g.lineTo(7,-21);g.lineTo(7,-12);g.lineTo(14,-4);g.lineTo(14,20);g.quadraticCurveTo(14,23,10,23);g.lineTo(-10,23);g.quadraticCurveTo(-14,23,-14,20);g.lineTo(-14,-4);g.lineTo(-7,-12);g.closePath();g.stroke();g.fillRect(-8,-25,16,5);g.fillRect(-10,2,20,8);}
 if(type==='fish'){g.beginPath();g.ellipse(-4,0,19,12,0,0,Math.PI*2);g.moveTo(14,0);g.lineTo(29,-13);g.lineTo(29,13);g.closePath();g.fill();g.fillStyle='#165264';g.beginPath();g.arc(-13,-3,2.6,0,Math.PI*2);g.fill();}
 if(type==='ice'){g.beginPath();g.moveTo(-24,4);g.lineTo(-13,-14);g.lineTo(8,-19);g.lineTo(24,-1);g.lineTo(16,17);g.lineTo(-14,20);g.closePath();g.stroke();g.beginPath();g.moveTo(-24,4);g.lineTo(0,2);g.lineTo(8,-19);g.moveTo(0,2);g.lineTo(16,17);g.stroke();}
 g.restore();}
export function resultCertificate(results,score,total){
 const panel=textPanel({width:1.70,height:1.01,res:1536,bg:null});
 const completed=Math.min(total,score),percent=Math.round(100*completed/Math.max(1,total));
 panel.draw((g,w,h)=>{
   const sx=w/1536,sy=h/912;g.save();g.scale(sx,sy);
   const bg=g.createLinearGradient(0,0,1536,912);bg.addColorStop(0,'#102d4b');bg.addColorStop(.55,'#0b4658');bg.addColorStop(1,'#102c42');
   rounded(g,12,12,1512,888,52);g.fillStyle=bg;g.fill();g.strokeStyle='#dfbf72';g.lineWidth=5;g.stroke();
   rounded(g,30,30,1476,852,42);g.strokeStyle='rgba(137,222,221,.23)';g.lineWidth=2;g.stroke();
   g.save();rounded(g,32,32,1472,848,40);g.clip();for(let j=0;j<6;j++){g.beginPath();for(let x=-20;x<=1550;x+=20){const y=825+j*18+14*Math.sin(x/140+j*.6);if(x===-20)g.moveTo(x,y);else g.lineTo(x,y);}g.strokeStyle='rgba(98,217,214,.07)';g.lineWidth=3;g.stroke();}g.restore();
   // Gold medal emblem, drawn as vector art rather than relying on platform emoji.
   const cx=768,cy=104;g.fillStyle='#a87837';g.beginPath();g.moveTo(cx-38,cy+32);g.lineTo(cx-53,cy+89);g.lineTo(cx-17,cy+73);g.lineTo(cx,cy+96);g.lineTo(cx+19,cy+73);g.lineTo(cx+52,cy+89);g.lineTo(cx+38,cy+32);g.closePath();g.fill();
   const gold=g.createLinearGradient(cx-60,cy-60,cx+60,cy+65);gold.addColorStop(0,'#fff0b5');gold.addColorStop(.48,'#e8c16d');gold.addColorStop(1,'#ae7938');g.beginPath();g.arc(cx,cy,64,0,Math.PI*2);g.fillStyle=gold;g.fill();g.strokeStyle='#fff0c1';g.lineWidth=3;g.stroke();
   g.beginPath();g.arc(cx,cy,51,0,Math.PI*2);g.strokeStyle='#a77935';g.lineWidth=2;g.stroke();g.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?15:35;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;if(i===0)g.moveTo(x,y);else g.lineTo(x,y);}g.closePath();g.fillStyle='#754f29';g.fill();
   text(g,'SAVE EARTH VR  /  MISSION COMPLETE',768,225,23,'#b9e4e6',700);
   text(g,'바다 지킴이 임명장',768,281,70,'#fff1c8',800);
   text(g,'세 가지 환경 보호 미션을 모두 완료했어요!',768,343,36,'#e8fbff',600);
   rounded(g,90,386,1356,75,24);g.fillStyle='#123747';g.fill();rounded(g,105,401,1326*Math.max(.01,percent/100),45,18);g.fillStyle='#277f79';g.fill();
   text(g,'미션 진행률  '+percent+'%    ·    '+completed+' / '+total+'개 목표 완료',768,423,33,'#f1ffef',800);
   const cards=[['bottle','산호초 정화',results.trash+'개 수거','분리배출'],['fish','바다 친구 구조',results.rescue+'개 구조 미션','거북이 · 물고기 · 물범'],['ice','북극곰 구출',results.ice+'개 얼음 배치','가족 재회']];
   cards.forEach(([kind,title,value,detail],i)=>{const x=90+i*456;rounded(g,x,487,444,166,22);g.fillStyle='#123b50';g.fill();g.strokeStyle='#397486';g.lineWidth=2;g.stroke();icon(g,kind,x+44,528,.92);text(g,title,x+80,528,32,'#d4f8fa',700,'left');check(g,x+407,524,19);text(g,value,x+222,580,39,'#fff0bc',800);text(g,detail,x+222,624,26,'#acdce0',600);});
   text(g,'오늘부터 실천할 바다 지킴이의 약속',768,695,34,'#f6df9e',800);
   const rules=['일회용품 줄이기','올바르게 분리배출하기','전기를 아끼고 가까운 곳은 걷기'];
   rules.forEach((r,i)=>{const x=110+i*456;check(g,x+15,746,14);text(g,r,x+40,746,i===2?25:29,'#e7f8f6',600,'left');});
   g.beginPath();g.moveTo(110,786);g.lineTo(1426,786);g.strokeStyle='#568a90';g.lineWidth=1.5;g.stroke();
   text(g,'작은 실천이 바다와 지구의 내일을 지켜요.',768,830,31,'#b8e8dc',700);
   g.restore();
 });
 panel.material.depthTest=false;panel.renderOrder=85;return panel;
}
