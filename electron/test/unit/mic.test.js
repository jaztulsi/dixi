import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mic } from '../../src/renderer/ui/mic.js';

test('the mic device goes away mid-session (AirPods off): it reopens the default input instead of going deaf', async () => {
  const tracks = [];
  const g = globalThis, saved = ['navigator', 'AudioContext', 'AudioWorkletNode'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]);
  const track = () => { const t = new EventTarget(); t.stop = () => { t.stopped = true; }; tracks.push(t); return t; };
  Object.defineProperty(g, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { const t = track(); return { getTracks: () => [t], getAudioTracks: () => [t] }; } } } });
  g.AudioContext = class { constructor() { this.audioWorklet = { addModule: async () => {} }; } createMediaStreamSource() { return { connect() {} }; } close() { return Promise.resolve(); } };
  g.AudioWorkletNode = class { constructor() { this.port = {}; } };
  try {
    const mic = new Mic();
    await mic.start(() => {});
    tracks[0].dispatchEvent(new Event('ended'));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(tracks.length, 2, 'reopened');
    mic.stop();
    tracks[1].dispatchEvent(new Event('ended'));   // stopped by Dixi: stays closed
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(tracks.length, 2);
  } finally { for (const [k, d] of saved) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } }
});
