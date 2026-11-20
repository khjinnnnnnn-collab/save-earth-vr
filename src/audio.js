import { LINES } from './lines.js';

/** Synthesised sound effects + narration (pre-generated TTS mp3, falling back to the browser voice). */
export class AudioSys {
  constructor(ctx) { this.ctx = ctx; this.ac = null; this.manifest = {}; this.current = null; this.voice = null; }

  async init() {
    try { this.ac = this.ac || new AudioContext(); this.ac.resume(); } catch { /* no audio */ }
    try { this.manifest = await (await fetch('assets/voice/manifest.json', { cache: 'no-cache' })).json(); } catch { this.manifest = {}; }
    if ('speechSynthesis' in window) {
      const pick = () => { this.voice = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('ko')) || null; };
      pick(); speechSynthesis.onvoiceschanged = pick;
    }
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

  stop() {
    if (this.current?.audio) { this.current.audio.pause(); }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.current?.done?.();
    this.current = null;
    this.ctx.ui.subtitle('');
  }

  /** Speak a line. priority: a new line never interrupts a playing line with higher priority. */
  say(id, { priority = 1 } = {}) {
    const text = LINES[id] || id;
    if (this.current && this.current.priority > priority) return Promise.resolve(false);
    this.stop();
    return new Promise((resolve) => {
      const cur = { priority };
      let finished = false;
      cur.done = () => { if (finished) return; finished = true; if (this.current === cur) { this.current = null; this.ctx.ui.subtitle(''); } resolve(true); };
      this.current = cur;
      this.ctx.ui.subtitle(text);
      const fallbackMs = 1200 + text.length * 110;
      const guard = setTimeout(cur.done, fallbackMs + 4000);
      const end = () => { clearTimeout(guard); cur.done(); };
      if (this.manifest[id]) {
        const a = new Audio(`assets/voice/${this.manifest[id]}`);
        cur.audio = a;
        a.onended = end; a.onerror = () => setTimeout(end, fallbackMs);
        a.play().catch(() => setTimeout(end, fallbackMs));
      } else if ('speechSynthesis' in window && this.voice) {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = this.voice; u.lang = 'ko-KR'; u.rate = 1.05; u.pitch = 1.25;
        u.onend = end; u.onerror = end;
        speechSynthesis.speak(u);
      } else {
        setTimeout(end, fallbackMs);
      }
    });
  }
}
