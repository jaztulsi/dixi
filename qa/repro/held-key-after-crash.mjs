// Repro: input.js game-mode key pump (PUMP copied from src/main/input.js), its parent killed mid-hold.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
const src = fs.readFileSync('/Users/jaz/dixi/electron/src/main/input.js', 'utf8');
const PUMP = eval(src.match(/const PUMP = (`[\s\S]*?`);/)[1]);   // the exact helper script Dixi runs
const state = () => execFileSync('osascript', ['-l', 'JavaScript', '-e', "ObjC.import('CoreGraphics'); $.CGEventSourceKeyState(0, 80)"]).toString().trim();
if (process.argv[2] === 'child') {             // plays Dixi's main process: start the pump, hold F19, then get SIGKILLed
  const pump = spawn('osascript', ['-l', 'JavaScript', '-e', PUMP], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  pump.unref();
  pump.stdin.write('1 80 0\n');
  setInterval(() => {}, 1000);
} else {
  console.log('before:', state());
  const dixi = spawn(process.execPath, [process.argv[1], 'child'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('held via pump:', state());
  dixi.kill('SIGKILL');                         // Dixi crashes / is force-quit while the key is held
  await new Promise((r) => setTimeout(r, 3000));
  console.log('3s after Dixi died:', state());
  execFileSync('osascript', ['-l', 'JavaScript', '-e', "ObjC.import('CoreGraphics'); $.CGEventPost(0, $.CGEventCreateKeyboardEvent(null, 80, false)); 1"]);
  console.log('after manual key-up:', state());
}
