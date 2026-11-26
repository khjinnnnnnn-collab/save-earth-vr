import { createEngine } from './engine.js?v=032';
import { manager, loadHDR } from './assets.js';
import { createInput } from './input.js';
import { GrabSystem } from './grab.js';
import { createUI } from './ui.js?v=034';
import { FX } from './fx.js';
import { AudioSys } from './audio.js?v=034';
import { Ocean } from './stages/ocean.js?v=034';
import { loadArt } from './art/library.js?v=032';

const params = new URLSearchParams(location.search);
const engine = createEngine(document.body);
const ctx = { ...engine, params, state: { orbs: [] } };
Object.defineProperty(ctx, 'time', { get: () => engine.time }); // spread copied the getter's value
ctx.ui = createUI(ctx);
ctx.fx = new FX(ctx);
ctx.audio = new AudioSys(ctx);
ctx.input = createInput(ctx);
ctx.grab = new GrabSystem(ctx);
engine.onUpdate((dt) => { ctx.input.update(dt); ctx.grab.update(dt); ctx.fx.update(dt); });
window.__game = ctx; // for automated tests

const STAGES = { ocean: () => new Ocean(ctx) };
const ORDER = ['ocean'];

// ---------- loading screen ----------
const $ = (id) => document.getElementById(id);
manager.onProgress = (url, loaded, total) => {
  const p = Math.round((loaded / total) * 100);
  $('bar').style.width = p + '%';
  $('pct').textContent = `불러오는 중… ${p}%`;
};
const preload = Promise.all([loadHDR('kloofendal_48d_partly_cloudy_puresky'),loadArt()]).then(([,art])=>{
  const count=Object.keys(art.models).length;
  $('art-status').textContent='신규 3D 모델 '+count+'개 · 로딩 완료';
  window.__artStatus={version:'0.3.4',loaded:true,count};
  return true;
}).catch(e=>{
  const msg=e?.message||String(e);
  console.error('Art preload failed',e);
  window.__artStatus={version:'0.3.4',loaded:false,error:msg};
  $('art-status').textContent='신규 그래픽 로딩 실패: '+msg;
  $('art-status').style.color='#ffd092';
  $('loading').hidden=true;
  const retry=document.createElement('button');retry.textContent='새로고침하여 다시 시도';retry.onclick=()=>location.reload();$('loading').after(retry);
  return false;
});

let returningToStart = false;
function returnToStart() {
  if (returningToStart) return;
  returningToStart = true;
  // Reload to the original mode-selection screen, even after a developer autostart.
  const url = new URL(location.href);
  if (url.searchParams.has('autostart')) {
    url.searchParams.delete('autostart');
    location.replace(url.href);
  } else location.reload();
}

async function play() {
  const start = params.get('stage');
  const order = start && ORDER.includes(start) ? ORDER.slice(ORDER.indexOf(start)) : ORDER;
  ctx.state.orbs = [];
  let next = STAGES[order[0]]();
  let nextLoad = next.load();
  for (let i = 0; i < order.length; i++) {
    const stage = next;
    await nextLoad;
    if (i + 1 < order.length) { next = STAGES[order[i + 1]](); nextLoad = next.load(); }
    ctx.scene.add(stage.root);
    ctx.stage = stage;
    await stage.run();
    await ctx.fade(1, 0.7);
    ctx.audio.stop();
    stage.dispose();
    ctx.scene.remove(stage.root);
  }

  // The certificate has finished. Leave immersive VR before returning to the menu.
  // Never start another round until the next player explicitly chooses a mode.
  const session = engine.renderer.xr.getSession();
  if (session) {
    try { await session.end(); }
    catch (err) { console.warn('VR session end failed', err); }
  }
  returnToStart();
}

/** Full immersive VR. Must be called straight from a button press (the browser requires it). */
async function enterVR() {
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  await engine.renderer.xr.setSession(session);
  session.addEventListener('end', returnToStart, { once: true });
  $('btn-vr-float').hidden = true;
}

let playing = false;
async function begin(xr) {
  if (xr) {
    try { await enterVR(); } catch (err) {
      console.warn('VR start failed', err);
      $('vr-note').textContent = 'VR 모드를 열지 못했어요. 브라우저에서 "몰입형 VR" 권한을 허용한 뒤 다시 눌러 주세요.';
      return;
    }
  }
  ctx.audio.init();
  $('overlay').classList.add('hidden');
  if (!playing) { playing = true; play().catch(e=>{
    console.error('Game startup failed',e);
    $('overlay').classList.remove('hidden');
    $('art-status').textContent='게임 실행 오류: '+(e?.message||String(e));
    $('art-status').style.color='#ffd092';
    $('btn-desktop').disabled=true;$('btn-vr').disabled=true;
    const retry=document.createElement('button');retry.textContent='다시 시작';retry.onclick=()=>location.reload();$('buttons').after(retry);
  }); }
}

preload.then(async (ready) => {
  if (!ready) return;
  $('loading').hidden = true;
  $('buttons').hidden = false;
  const vrOk = navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false));
  if (!vrOk) { $('btn-vr').disabled = true; $('vr-note').textContent = 'VR 기기가 연결되지 않았어요. Meta Quest 브라우저에서 열면 VR로 시작할 수 있어요.'; }
  $('btn-vr').onclick = () => begin(true);
  $('btn-desktop').onclick = () => begin(false);
  // started on the flat screen inside a headset? one tap switches to full VR without restarting
  if (vrOk) {
    $('btn-desktop').onclick = () => { begin(false); $('btn-vr-float').hidden = false; };
    $('btn-vr-float').onclick = () => enterVR().catch((err) => console.warn('VR start failed', err));
  }
  if (params.has('autostart')) begin(false);
});
