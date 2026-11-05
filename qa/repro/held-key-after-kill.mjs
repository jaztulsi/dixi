// Repro: input.js key() with holdSecs, F19 (keycode 80). Kill the osascript mid-hold like an app quit/crash would.
import { spawn, execFileSync } from 'node:child_process';
const state = () => execFileSync('osascript', ['-l', 'JavaScript', '-e', "ObjC.import('CoreGraphics'); $.CGEventSourceKeyState(0, 80)"]).toString().trim();
const body = `ObjC.import('CoreGraphics'); const A = {code:80,flags:0,repeat:1,hold:3}; for (let i = 0; i < A.repeat; i++) for (const down of [true, false]) { const e = $.CGEventCreateKeyboardEvent(null, A.code, down); $.CGEventPost(0, e); if (down && A.hold) delay(A.hold); }`;
console.log('before:', state());
const t0 = Date.now();
const p = spawn('osascript', ['-l', 'JavaScript', '-e', body]);
await new Promise((r) => setTimeout(r, 700));
console.log('during hold (0.7s):', state());
p.kill('SIGKILL');                     // what happens to the key if the script dies mid-hold
await new Promise((r) => setTimeout(r, 4000));
console.log('4s after the script was killed:', state());
// clean up: post the key-up ourselves
execFileSync('osascript', ['-l', 'JavaScript', '-e', "ObjC.import('CoreGraphics'); $.CGEventPost(0, $.CGEventCreateKeyboardEvent(null, 80, false)); 'released'"]);
console.log('after manual key-up:', state());
