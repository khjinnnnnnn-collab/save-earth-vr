import { LINES } from './lines.js';

/** Synthesised sound effects + on-screen narration (subtitles only, no voice). */
export class AudioSys {
  constructor(ctx) { this.ctx = ctx; this.ac = null; this.current = null; }

  async init() {
    try { this.ac = this.ac || new AudioContext(); this.ac.resume(); } catch { /* no audio */ }
  }

  tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, delay = 0 } = {}) {
    const ac = this.ac; if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
    const ac = this.ac; if (!ac) return;
    const t = ac.currentTime + delay;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 3, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  }

  sfx(name) {
    switch (name) {
      case 'pop': this.tone(520, 0.08, { slide: 500, vol: 0.12 }); break;
      case 'chomp': this.tone(180, 0.09, { type: 'square', vol: 0.12 }); this.tone(140, 0.12, { type: 'square', vol: 0.12, delay: 0.1 }); break;
      case 'good': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.07 })); break;
      case 'wrong': this.tone(330, 0.3, { slide: -170, vol: 0.18 }); break;
      case 'sparkle': for (let i = 0; i < 5; i++) this.tone(1400 + Math.random() * 1400, 0.12, { vol: 0.06, delay: i * 0.05 }); break;
      case 'whoosh': this.noise(0.35, { vol: 0.15, freq: 500 }); break;
      case 'squash': this.noise(0.18, { vol: 0.25, freq: 250 }); this.tone(120, 0.15, { type: 'square', vol: 0.1 }); break;
      case 'pour': this.noise(0.25, { vol: 0.05, freq: 2500 }); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.2, delay: i * 0.12 })); break;
      case 'cough': this.noise(0.15, { vol: 0.3, freq: 400 }); this.noise(0.15, { vol: 0.25, freq: 400, delay: 0.22 }); break;
      default: break;
    }
  }

  /** Clear everything (used between stages). */
  stop() {
    for (const e of this.queue || []) e.resolve(false);
    this.queue = [];
    const cur = this.current; this.current = null;
    cur?.finish?.(true);
    clearTimeout(this.subTimer);
    this.ctx.ui.subtitle('');
  }

  /** True while a line is playing or waiting. */
  get busy() { return !!this.current || (this.queue?.length ?? 0) > 0; }

  /** Resolves when every queued line has been spoken. */
  idle() { return this.ctx.until(() => !this.busy); }

  /**
   * Queue a line. Lines never cut each other off: each one is spoken (and subtitled) in turn.
   * hint: true marks a repeatable tip — only the newest waiting tip is kept, and stale tips are dropped.
   */
  say(id, { hint = false, tag = null, sub = true } = {}) {
    this.queue = this.queue || [];
    if (hint) {
      if (this.current?.id === id) return Promise.resolve(false);
      this.queue = this.queue.filter((e) => { if (e.hint) { e.resolve(false); return false; } return true; });
    } else if (this.queue.some((e) => e.id === id)) {
      return this.queue.find((e) => e.id === id).promise;
    }
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    this.queue.push({ id, hint, tag, sub, resolve, promise, t: performance.now() });
    this.pump();
    return promise;
  }

  /**
   * Drop every line tied to something that no longer matters (e.g. a piece of trash that was just sorted).
   * Waiting lines are removed; the line being spoken ends once it has been on screen for a moment.
   */
  drop(tag, id = null) {
    if (!tag || !this.queue) return;
    const hit = (e) => e.tag === tag && (!id || e.id === id);
    this.queue = this.queue.filter((e) => { if (hit(e)) { e.resolve(false); return false; } return true; });
    if (this.current && hit(this.current)) this.current.cut?.();
  }

  pump() {
    if (this.current || !this.queue.length) return;
    const e = this.queue.shift();
    if (e.hint && performance.now() - e.t > 6000) { e.resolve(false); this.pump(); return; }
    this.play(e);
  }

  play(e) {
    const text = LINES[e.id] || e.id;
    const cur = { id: e.id, tag: e.tag };
    this.current = cur;
    clearTimeout(this.subTimer);
    // sub: false — the text is already on screen (e.g. a quiz board), so no subtitle on top of it
    this.ctx.ui.subtitle(e.sub === false ? '' : text);
    const started = performance.now();
    // a subtitle stays on screen long enough to read
    const readMs = 1500 + text.length * 120;
    let done = false, settled = false, timer = null;
    const settle = (rest, aborted) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return; settled = true;
        if (this.current === cur) this.current = null;
        if (!aborted) this.subTimer = setTimeout(() => { if (!this.current) this.ctx.ui.subtitle(''); }, 700);
        e.resolve(!aborted);
        if (!aborted) setTimeout(() => this.pump(), 150);
      }, rest);
    };
    cur.finish = (aborted = false) => {
      if (done) return; done = true;
      clearTimeout(guard);
      settle(aborted ? 0 : Math.max(0, readMs - (performance.now() - started)), aborted);
    };
    // the thing this line was about is already done: wrap up quickly (but never flash a line away),
    cur.cut = () => {
      if (settled) return;
      if (!done) {
        done = true;
        clearTimeout(guard);
      }
      settle(Math.max(0, 1000 - (performance.now() - started)), false);
    };
    const guard = setTimeout(() => cur.finish(), readMs + 9000);
    cur.finish();
  }
}
