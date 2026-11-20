// Generates narration mp3s with Google Cloud Text-to-Speech.
// The API key is injected by the environment's network proxy (header X-Goog-Api-Key) — never stored in the repo.
// usage: node tools/gen_tts.mjs [voiceName]
import { writeFileSync, mkdirSync } from 'node:fs';
import { LINES } from '../src/lines.js';

const voice = process.argv[2] || 'ko-KR-Neural2-A';
const out = new URL('../assets/voice/', import.meta.url);
mkdirSync(out, { recursive: true });
const manifest = {};
for (const [id, text] of Object.entries(LINES)) {
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_TTS_KEY || 'injected-by-proxy' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ko-KR', name: voice },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 2.0 },
    }),
  });
  if (!res.ok) { console.error(id, res.status, await res.text()); process.exit(1); }
  const { audioContent } = await res.json();
  writeFileSync(new URL(`${id}.mp3`, out), Buffer.from(audioContent, 'base64'));
  manifest[id] = `${id}.mp3`;
  console.log('ok', id);
}
writeFileSync(new URL('manifest.json', out), JSON.stringify(manifest, null, 2));
