import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsafe, unsafeHosts, guardSession } from '../../src/main/safesite.js';
import { openTarget } from '../../src/main/mac.js';
import { runDesktop } from '../../src/main/desktop.js';

const BAD = [...unsafeHosts()][0];   // a real entry of data/unsafe.generated.txt

test('unsafe(): the generated malware/phishing list, IPs, look-alikes, hidden addresses and code links are refused', () => {
  assert.ok(unsafeHosts().size > 1000, 'the generated list is there');
  for (const url of [`https://${BAD}/`, `http://sub.${BAD}/x?y=1`, 'http://185.234.72.9/a.exe', 'http://3232235777/', 'http://[2001:db8::1]/',
    'https://xn--pple-43d.com/', 'https://paypa1.com/', 'https://paypal.com@evil.example/', 'javascript:alert(1)', 'data:text/html,<b>hi</b>']) {
    assert.ok(unsafe(url), url);
  }
  for (const url of ['https://www.nytimes.com/', 'https://docs.google.com/document/d/1', 'http://localhost:5173/', 'http://127.0.0.1:8080/x']) assert.equal(unsafe(url), null, url);
  assert.match(unsafe('music://music.apple.com/x'), /aren't opened/, 'app links only where the caller allows them');
  assert.equal(unsafe('music://music.apple.com/x', { appLinks: true }), null);
  for (const url of ['smb://evil.example/share', 'applescript://com.apple.scripteditor?action=new', 'file:///etc/passwd', 'file:///Users/me/Downloads/Zoom.pkg']) assert.ok(unsafe(url, { appLinks: true, home: '/Users/me' }), url);
  assert.equal(unsafe('file:///Users/me/Documents/a.pdf', { appLinks: true, home: '/Users/me' }), null);
});

test('unsafe() costs well under 1 ms a call', () => {
  const urls = [`https://${BAD}/`, 'https://www.nytimes.com/section/world', 'https://login.paypal.com/x', 'https://a.b.c.example.co.uk/'];
  unsafe(urls[0]);
  const t = performance.now();
  for (let i = 0; i < 4000; i++) unsafe(urls[i % 4]);
  const ms = (performance.now() - t) / 4000;
  assert.ok(ms < 1, `${ms.toFixed(4)} ms a call`);
});

test('every entry point refuses the bad host: mac.js open, desktop "go to", the tabs, downloads', async () => {
  const ran = [];
  const r = await openTarget({ url: `https://${BAD}/` }, { run: async (cmd, args) => { ran.push(cmd); return { stdout: 'com.google.Chrome\n' }; } });
  assert.deepEqual([r.ok, r.unsafe, ran], [false, true, []], 'nothing ran, not even the handler lookup');
  assert.match(r.error, /malware and phishing.*I didn't open it/);

  const calls = [];
  const said = await runDesktop({ verb: 'site', url: `https://${BAD}/` }, { exec: async (...a) => { calls.push(a); return ''; }, say() {} });
  assert.deepEqual(calls, []);
  assert.match(said.say, /malware and phishing/);

  let hook, onDownload; const stopped = [], trashed = [];
  const ses = { webRequest: { onBeforeRequest: (_f, fn) => { hook = fn; } }, on: (ev, fn) => { if (ev === 'will-download') onDownload = fn; } };
  guardSession(ses, { ads: new Set(['ads.example']), stopped: (s) => stopped.push(s), trash: async (p) => trashed.push(p), listZip: async () => ['Viewer.app/', 'Viewer.app/Contents/MacOS/viewer'] });
  const nav = (url, resourceType) => { let out; hook({ url, resourceType, webContentsId: 7 }, (o) => { out = o; }); return out.cancel; };
  assert.equal(nav(`https://${BAD}/login`, 'mainFrame'), true);
  assert.deepEqual([stopped[0].webContentsId, /malware/.test(stopped[0].why)], [7, true], 'the tab is told why');
  assert.equal(nav('https://paypal.com.secure-login.xyz/', 'subFrame'), true);
  assert.equal(nav('https://www.nytimes.com/', 'mainFrame'), false);
  assert.equal(nav('https://ads.example/pixel.gif', 'image'), true, 'ads still dropped');
  assert.equal(nav('https://ads.example/', 'mainFrame'), false, 'a page you asked for is not an ad');

  const dl = (url, name) => { let cancelled = false, done; onDownload({ preventDefault: () => { cancelled = true; } }, { getURL: () => url, getFilename: () => name, getSavePath: () => `/Users/me/Downloads/${name}`, once: (_e, fn) => { done = fn; } }); return { cancelled, done }; };
  assert.equal(dl('https://zoom.us/client/Zoom.pkg', 'Zoom.pkg').cancelled, true, 'installers never download');
  assert.equal(dl(`https://${BAD}/report.pdf`, 'report.pdf').cancelled, true, 'nothing downloads from a bad site');
  assert.equal(dl('blob:https://sheets.example/1', 'export.csv').cancelled, false);
  const zip = dl('https://files.example/photos.zip', 'photos.zip');
  assert.equal(zip.cancelled, false);
  await zip.done({}, 'completed');
  assert.deepEqual(trashed, ['/Users/me/Downloads/photos.zip'], 'a zip with an app inside goes to the Trash');
  assert.match(stopped.at(-1).why, /program or installer inside/);
});
