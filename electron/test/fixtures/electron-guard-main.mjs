// Electron main process for no-network.test.js: is NODE_OPTIONS=--import=test/no-network.js live in Electron's
// main, the way the bench's browser half launches the app? Probe an unroutable TEST-NET host first (RFC 5737:
// nothing ever answers), and dial the real ElevenLabs STT/TTS with a dummy key only once the guard is proven.
import net from 'node:net';
import { app } from 'electron';
import { ElevenLabsBridge } from '../../src/main/stt.js';
import { ENDPOINTS } from '../../src/main/providers.js';

app.dock?.hide();
app.whenReady().then(async () => {
  const probe = await new Promise((r) => {
    const s = net.connect(9, '192.0.2.1').once('error', (e) => r(e.message)).once('connect', () => r('connected'));
    setTimeout(() => { s.destroy(); r('no guard (timed out)'); }, 2000);
  });
  const out = { probe };
  if (/no network in unit tests/.test(probe)) {
    out.stt = await new ElevenLabsBridge('bench-dummy-key', () => {}).open();
    out.tts = await fetch(`${ENDPOINTS.elevenlabs.url}/v1/text-to-speech/x`, { method: 'POST', headers: { 'xi-api-key': 'bench-dummy-key' } })
      .then((r) => `HTTP ${r.status}`, (e) => `${e.cause?.code} ${e.cause?.message}`);
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
  app.exit(0);
});
