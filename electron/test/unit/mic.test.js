import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mic, pickInput } from '../../src/renderer/ui/mic.js';

test('the mic device goes away mid-session (AirPods off): it reopens the default input instead of going deaf', async () => {
  const tracks = [];
  const g = globalThis, saved = ['navigator', 'AudioContext', 'AudioWorkletNode'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]);
  const track = () => { const t = new EventTarget(); t.stop = () => { t.stopped = true; }; tracks.push(t); return t; };
  Object.defineProperty(g, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => { const t = track(); return { getTracks: () => [t], getAudioTracks: () => [t] }; } } } });
  g.AudioContext = class { constructor() { this.currentTime = 0; this.audioWorklet = { addModule: async () => {} }; } createMediaStreamSource() { return { connect() {}, disconnect() {} }; } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } };
  g.AudioWorkletNode = class { constructor() { this.port = { postMessage() {} }; } };
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

test('the input is the Mac default, unless that is virtual/aggregate/Bluetooth and a built-in mic exists', () => {
  const d = (deviceId, label) => ({ kind: 'audioinput', deviceId, label });
  const air = d('b1', 'MacBook Air Microphone (Built-in)');
  assert.equal(pickInput([d('default', 'Default - MacBook Air Microphone (Built-in)'), air]).deviceId, 'default');
  assert.deepEqual(pickInput([d('default', 'Default - BlackHole 2ch (Virtual)'), d('v', 'BlackHole 2ch (Virtual)'), air]), { deviceId: 'b1', label: air.label, skipped: 'Default - BlackHole 2ch (Virtual)' });
  assert.equal(pickInput([d('default', "Default - Jaz's AirPods Pro (Bluetooth)"), air]).deviceId, 'b1');
  assert.equal(pickInput([d('default', 'Default - Aggregate Device'), d('u', 'USB Mic')]).deviceId, 'default', 'no built-in: keep the default');
  assert.equal(pickInput([d('default', 'Default - Yeti Stereo Microphone'), air]).deviceId, 'default', 'a real USB mic the user chose stays');
});
