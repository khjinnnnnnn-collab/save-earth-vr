import { createEngine } from './engine.js';
import { manager, loadHDR } from './assets.js';
import { createInput } from './input.js';
import { GrabSystem } from './grab.js';
import { createUI } from './ui.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Ocean } from './stages/ocean.js';
import { loadArt } from './art/library.js';

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
const preload = Promise.all([loadHDR('kloofendal_48d_partly_cloudy_puresky'),loadArt().catch(e=>console.warn('Art preload failed, will retry on start',e))]);

async function play() {
  const start = params.get('stage');
  let order = start && ORDER.includes(start) ? ORDER.slice(ORDER.indexOf(start)) : ORDER;
  for (;;) {
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
    order = ORDER;
  }
}

/** Full immersive VR. Must be called straight from a button press (the browser requires it). */
async function enterVR() {
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  await engine.renderer.xr.setSession(session);
  session.addEventListener('end', () => location.reload());
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
  if (!playing) { playing = true; play(); }
}

preload.then(async () => {
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
