import { createEngine } from './engine.js';
import { manager, loadModel, loadHDR } from './assets.js';
import { createInput } from './input.js';
import { GrabSystem } from './grab.js';
import { createUI } from './ui.js';
import { FX } from './fx.js';
import { AudioSys } from './audio.js';
import { Intro, Placeholder } from './stages/space.js';
import { Land, LAND_MODELS } from './stages/land.js';
import { Ending } from './stages/ending.js';
import { Sea } from './stages/sea.js';

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

const STAGES = {
  intro: () => new Intro(ctx),
  land: () => new Land(ctx),
  sea: () => new Sea(ctx),
  sky: () => new Placeholder(ctx, 'sky'),
  ending: () => new Ending(ctx),
};
const ORDER = ['intro', 'land', 'sea', 'sky', 'ending'];

// ---------- loading screen ----------
const $ = (id) => document.getElementById(id);
manager.onProgress = (url, loaded, total) => {
  const p = Math.round((loaded / total) * 100);
  $('bar').style.width = p + '%';
  $('pct').textContent = `불러오는 중… ${p}%`;
};
const preload = Promise.all([loadHDR('kloofendal_48d_partly_cloudy_puresky'), ...LAND_MODELS.map(loadModel)]);

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

async function begin(xr) {
  await ctx.audio.init();
  if (xr) {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await engine.renderer.xr.setSession(session);
    session.addEventListener('end', () => location.reload());
  }
  $('overlay').classList.add('hidden');
  play();
}

preload.then(async () => {
  $('loading').hidden = true;
  $('buttons').hidden = false;
  const vrOk = navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false));
  if (!vrOk) { $('btn-vr').disabled = true; $('vr-note').textContent = 'VR 기기가 연결되지 않았어요. Meta Quest 브라우저에서 열면 VR로 시작할 수 있어요.'; }
  $('btn-vr').onclick = () => begin(true);
  $('btn-desktop').onclick = () => begin(false);
  if (params.has('autostart')) begin(false);
});
