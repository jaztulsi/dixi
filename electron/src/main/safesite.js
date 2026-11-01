// Is a link safe to open? The one check every path that opens or loads a site goes through: mac.js openTarget,
// desktop.js site, the tabs' navigations and downloads, fetchPage/loadPage and open-external in main.js, plan.js.
// unsafe(url) → a reason in plain words, or null. The host list is generated from public malware and phishing
// feeds (npm run refresh-unsafe), never hand-written; Guardian's look-alike and scam checks run on top.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContext } from './guardian.js';

const LIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/unsafe.generated.txt');
let hosts = null;
/** The generated hosts, read once. No list (not generated yet) leaves the rules below. */
export function unsafeHosts() {
  if (!hosts) { try { hosts = new Set(fs.readFileSync(LIST, 'utf8').split('\n').filter((s) => s && !s.startsWith('#'))); } catch { hosts = new Set(); } }
  return hosts;
}

// Opening one of these runs code or installs something.
export const RUNS = /\.(app|pkg|mpkg|dmg|iso|command|tool|sh|terminal|workflow|action|scpt|scptd|applescript|jar|prefpane|mobileconfig|webloc|inetloc|fileloc|url|shortcut|osax|kext|plugin|bundle|exe|msi)$/i;
// Links that run code, or reach a server for files or a login, whichever app claims them.
const NEVER = /^(?:javascript|data|vbscript|blob|applescript|smb|afp|nfs|cifs|ftp|ssh|telnet|vnc)$/i;
const LOOPBACK = /^(?:localhost|127(?:\.\d+){3}|\[::1\])$/;
const IP = /^\d+(?:\.\d+){3}$|^\[/;   // the URL parser has already turned 3232235777 or 0xc0.0xa8.1.1 into dotted form

/** Why this link must not be opened, or null. appLinks: app links (music:, file: in home…) may pass; the caller
 *  then still needs an installed app that owns the scheme (mac.js asks macOS). Otherwise only http(s). */
export function unsafe(url, { appLinks = false, home = os.homedir() } = {}) {
  let u;
  try { u = new URL(String(url)); } catch { return "That isn't a link."; }
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    if (!appLinks || NEVER.test(scheme)) return `${scheme}: links aren't opened.`;
    if (scheme !== 'file') return null;
    const p = decodeURIComponent(u.pathname);
    if (!p.startsWith(home + '/')) return 'Only files in your home folder can be opened by link.';
    return RUNS.test(p.replace(/\/+$/, '')) ? "That file is a program or installer, and Dixi doesn't open those." : null;
  }
  if (u.username || u.password) return 'That link hides its real address.';   // https://paypal.com@evil.example
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (LOOPBACK.test(host)) return null;   // this Mac itself (the eval fixtures)
  if (IP.test(host)) return 'That link is a bare IP address, not a named site.';
  const list = unsafeHosts(), parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (list.has(parts.slice(i).join('.'))) return 'That site is on a public list of malware and phishing sites.';
  return checkContext({ url: u.href })[0]?.say ?? null;   // look-alikes, look-alike letters, remote-access tools
}

const zipNames = (file) => new Promise((resolve, reject) => execFile('zipinfo', ['-1', file], { maxBuffer: 8 << 20 }, (err, out) => (err ? reject(err) : resolve(String(out).split('\n')))));

/** The tabs' session. One webRequest listener (Electron keeps one per session): unsafe pages and frames are
 *  stopped, ad hosts dropped. Downloads of programs and installers, or from unsafe sites, are cancelled; a zip
 *  with one inside goes to the Trash once it lands. stopped({ url, why, name?, webContentsId? }) tells the user. */
export function guardSession(ses, { ads = new Set(), stopped = () => {}, trash, listZip = zipNames } = {}) {
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
    const why = d.resourceType === 'mainFrame' || d.resourceType === 'subFrame' ? unsafe(d.url) : null;
    if (why) { cb({ cancel: true }); if (d.resourceType === 'mainFrame') stopped({ url: d.url, why, webContentsId: d.webContentsId }); return; }
    let h = '';
    if (ads.size && d.resourceType !== 'mainFrame') try { h = new URL(d.url).hostname; } catch {}
    const parts = h.split('.');
    cb({ cancel: Boolean(h) && parts.some((_, i) => ads.has(parts.slice(i).join('.'))) });
  });
  ses.on('will-download', (e, item) => {
    const url = item.getURL(), name = item.getFilename();
    const why = (/^https?:/i.test(url) && unsafe(url)) || (RUNS.test(name) ? `“${name}” is a program or installer.` : null);
    if (why) { e.preventDefault(); stopped({ url, name, why }); return; }
    // ponytail: zips only; a .tar.gz or .7z with an app inside still lands (Gatekeeper still checks it on open).
    if (/\.zip$/i.test(name)) item.once('done', async (_e, state) => {
      if (state !== 'completed') return;
      const names = await listZip(item.getSavePath()).catch(() => []);
      if (!names.some((n) => n.split('/').some((s) => RUNS.test(s)))) return;
      await trash?.(item.getSavePath()).catch(() => {});
      stopped({ url, name, why: `“${name}” has a program or installer inside, so it went to the Trash.` });
    });
  });
}
