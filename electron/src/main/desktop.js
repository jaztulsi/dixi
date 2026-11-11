// Desktop verbs: the Mac obeys with no AI. "volume up", "pause the music", "go to youtube.com", "snap it
// left", "set a timer for 10 minutes", "dark mode", "lock the screen", "battery", "take a screenshot",
// "turn wifi off", "quit Safari", "search Google for…", "open my Downloads", "new folder on my desktop called…", and
// the front app's own keys ("close this tab", "go back", "scroll down", "copy that"). Words are matched by regex in code; every command is a fixed script or
// program. What you said never becomes script text: it goes in as an argument (argv) or as JSON. No shell.
// Never here, on purpose: empty trash, shut down, restart, deleting anything.
// Needs Automation permission for System Events (windows, dark mode) and for Music / Spotify (media).

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { unsafe } from './safesite.js';
import { spokenReminder, readBack, createArgs } from './calendar.js';
import { findControls, pressControl, openApp, frontApp, key, windowTexts } from './input.js';

/** The real exec: (cmd, args) → stdout. execFile, never a shell. The tests pass a fake. */
export const exec = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 8000 }, (err, out) => (err ? reject(err) : resolve(String(out).trim())));
});

// ---- what was said → which verb (pure) ----
const PRE = String.raw`(?:(?:hey |ok |okay )?dixi,? ?)?(?:please |can you |could you |will you )?`;
const POST = String.raw`(?:,? please)?[.!?]?`;
const WHAT = String.raw`what(?:['’]?s| is)`;
const SUBJ = String.raw`(?:it|this|that|the window|this window|window|the front window)`;
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60 };
const NUM = String.raw`(?:\d+(?:\.\d+)?|an?|half an?|${Object.keys(WORDS).join('|')})`;
const UNIT = String.raw`(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)`;
const DUR = String.raw`${NUM}[ -]?${UNIT}(?:(?: and)? ${NUM}[ -]?${UNIT})*`;
const APPNAME = String.raw`[a-z0-9][a-z0-9 .&+'’-]{0,38}?`;
// Names that look like files, not sites: "open notes.md" is not a website.
const NOT_TLD = /\.(md|js|ts|py|txt|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|zip|sh|app|exe|json|html?|css|csv|rtf|mov|mp[34]|dmg|pkg|log)$/i;
const MEDIA_NOUN = String.raw`(?:music|song|track|playback|spotify|apple music)`;

// Each site's own search page: "search X on Y" is one link, no model. The query is appended, URL-encoded.
const SEARCH = {
  google: 'www.google.com/search?q=', youtube: 'www.youtube.com/results?search_query=', amazon: 'www.amazon.com/s?k=', wikipedia: 'en.wikipedia.org/w/index.php?search=',
  maps: 'maps.apple.com/?q=', directions: 'maps.apple.com/?daddr=', googlemaps: 'www.google.com/maps/search/',
  spotify: 'open.spotify.com/search/', github: 'github.com/search?q=', reddit: 'www.reddit.com/search/?q=', gmail: 'mail.google.com/mail/u/0/#search/',
  safeway: 'www.safeway.com/shop/search-results.html?q=', walmart: 'www.walmart.com/search?q=', target: 'www.target.com/s?searchTerm=', ebay: 'www.ebay.com/sch/i.html?_nkw=',
  chatgpt: 'chatgpt.com/?q=', claude: 'claude.ai/new?q=', perplexity: 'www.perplexity.ai/search?q=', x: 'x.com/search?q=', linkedin: 'www.linkedin.com/search/results/all/?keywords=',
};
const SEARCH_NAME = { google: 'Google', youtube: 'YouTube', amazon: 'Amazon', wikipedia: 'Wikipedia', googlemaps: 'Google Maps', spotify: 'Spotify', github: 'GitHub', reddit: 'Reddit', gmail: 'Gmail',
  safeway: 'Safeway', walmart: 'Walmart', target: 'Target', ebay: 'eBay', chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', x: 'X', linkedin: 'LinkedIn' };
// How each is said (longest first, so "google maps" is never Google with "maps" left over).
const SAID = { 'google maps': 'googlemaps', 'apple maps': 'maps', 'you tube': 'youtube', 'git hub': 'github', 'chat gpt': 'chatgpt', twitter: 'x', 'e bay': 'ebay', 'linked in': 'linkedin', 'g mail': 'gmail', 'my email': 'gmail', 'my gmail': 'gmail', 'safe way': 'safeway' };
const STORES = ['amazon', 'safeway', 'walmart', 'target', 'ebay'];
const said = (keys) => [...keys, ...Object.keys(SAID).filter((k) => keys.includes(SAID[k]))].sort((a, b) => b.length - a.length).join('|');
const SITE_SAID = `${said(Object.keys(SEARCH).filter((k) => k !== 'directions' && k !== 'x'))}|twitter`;   // "x" alone is too short to trust; "twitter" is said
const STORE_SAID = said(STORES);
const siteKey = (w) => { const k = w.toLowerCase().replace(/\s+/g, ' '); return SAID[k] ?? k; };

// System Settings panes (macOS 13+) by their link id. An id macOS doesn't know still opens System Settings.
const PANES = {
  bluetooth: 'com.apple.BluetoothSettings', 'wi-fi': 'com.apple.wifi-settings-extension', wifi: 'com.apple.wifi-settings-extension',
  sound: 'com.apple.Sound-Settings.extension', display: 'com.apple.Displays-Settings.extension', displays: 'com.apple.Displays-Settings.extension',
  battery: 'com.apple.Battery-Settings.extension', network: 'com.apple.Network-Settings.extension', keyboard: 'com.apple.Keyboard-Settings.extension',
  trackpad: 'com.apple.Trackpad-Settings.extension', mouse: 'com.apple.Mouse-Settings.extension', notification: 'com.apple.Notifications-Settings.extension',
  notifications: 'com.apple.Notifications-Settings.extension', privacy: 'com.apple.settings.PrivacySecurity.extension', security: 'com.apple.settings.PrivacySecurity.extension',
  focus: 'com.apple.Focus-Settings.extension', wallpaper: 'com.apple.Wallpaper-Settings.extension', appearance: 'com.apple.Appearance-Settings.extension',
  general: 'com.apple.systempreferences.GeneralSettings', accessibility: 'com.apple.Accessibility-Settings.extension', printer: 'com.apple.Print-Scan-Settings.extension',
  printers: 'com.apple.Print-Scan-Settings.extension', users: 'com.apple.Users-Groups-Settings.extension', 'lock screen': 'com.apple.Lock-Screen-Settings.extension',
  'screen time': 'com.apple.Screen-Time-Settings.extension', 'software update': 'com.apple.Software-Update-Settings.extension', storage: 'com.apple.settings.Storage',
};

const rule = (verb, body, args = () => ({})) => ({ verb, re: new RegExp(`^${PRE}(?:${body})${POST}$`, 'i'), args });
const RULES = [
  rule('volume', String.raw`(?:set |turn |put )?(?:the )?(?:volume|sound)(?: level)?(?: to| at)? (\d{1,3})(?: ?%| percent)?`, (m) => ({ op: 'set', pct: Math.min(100, Number(m[1])) })),
  rule('volume', String.raw`(?:(?:turn|make|bring|put) )?(?:the )?(?:volume|sound)(?: level)? (?:up|down)|volume (?:up|down)|(?:make it |turn it )?(?:louder|quieter)`, (m) => ({ op: /\b(up|louder)\b/i.test(m[0]) ? 'up' : 'down' })),
  rule('volume', String.raw`(un)?mute(?: the)?(?: sound| volume| audio| mac| computer)?`, (m) => ({ op: m[1] ? 'unmute' : 'mute' })),
  rule('media', String.raw`play ?/ ?pause|play pause|toggle (?:the )?(?:music|playback)`, () => ({ op: 'playpause' })),
  rule('media', String.raw`(?:pause|stop)(?: the| my)? ${MEDIA_NOUN}`, (m) => ({ op: 'pause', app: mediaApp(m[0]) })),
  rule('media', String.raw`(?:play|resume|unpause|put on|start)(?: the| my| some)? ${MEDIA_NOUN}|play something`, (m) => ({ op: 'play', app: mediaApp(m[0]) })),
  rule('media', String.raw`play (?:the song |the track )?(.{2,80}?) (?:on|in|from|with|using) (?:apple music|the music app|itunes)`, (m) => ({ op: 'song', q: m[1], app: 'Music' })),
  rule('media', String.raw`(?:search(?: for)?|look up|find) (.{2,80}?) (?:on|in|with|using) (?:apple music|the music app|itunes)|search(?: for)? (.{2,80}?) in music|search (?:apple music|itunes|the music app) for (.{2,80})`, (m) => ({ op: 'search', q: (m[1] ?? m[2] ?? m[3]).trim(), app: 'Music' })),
  rule('media', String.raw`skip(?: the| this)? (?:song|track)|(?:play )?(?:the )?next (?:song|track)`, () => ({ op: 'next' })),
  rule('media', String.raw`(?:play )?(?:the )?(?:previous|last) (?:song|track)|go back (?:a|one) (?:song|track)`, () => ({ op: 'previous' })),
  rule('media', String.raw`${WHAT}(?: song| track)? (?:now )?playing(?: right now)?|what (?:song|track) is (?:this|playing)(?: right now)?|${WHAT} this (?:song|track)`, () => ({ op: 'now' })),
  rule('search', String.raw`(?:search|look up|look for|find)(?: for)? (.{1,80}?) (?:on|in|with|using) (?:the )?(${SITE_SAID})(?: website| app)?|(?:search|check) (?:the )?(${SITE_SAID}) for (.{1,80})|google (.{1,80})`, (m) => ({ site: siteKey(m[2] ?? m[3] ?? 'google'), q: (m[1] ?? m[4] ?? m[5]).trim() })),
  // "buy a bagel from Safeway": that store's own search for the thing. Nothing is bought: it's a search page.
  rule('search', String.raw`(?:buy|order|get|shop for|pick up)(?: me)? (?:an? |some |the )?(.{1,80}?) (?:from|on|at) (${STORE_SAID})`, (m) => ({ site: siteKey(m[2]), q: m[1].trim() })),
  rule('search', String.raw`(?:get |give me |show me )?directions to (.{1,80})|(?:show|find) (.{1,80}?) on (?:the )?maps?`, (m) => ({ site: m[1] ? 'directions' : 'maps', q: (m[1] ?? m[2]).trim() })),
  rule('folder', String.raw`open (?:up )?(?:my |the )?(downloads|documents|desktop|applications|pictures)(?: folder)?|open (?:up )?(?:my |the )?(music|movies|home) folder`, (m) => ({ dir: (m[1] ?? m[2]).toLowerCase() })),
  rule('mkdir', String.raw`(?:make|create|add|start)? ?(?:a )?new folder(?: (?:on|in) (?:my |the )?(desktop|documents|downloads))?(?: folder)? (?:called|named) ["“']?([^"”'/\\:]{1,60}?)["”']?(?: (?:on|in) (?:my |the )?(desktop|documents|downloads))?`, (m) => ({ dir: (m[1] ?? m[3] ?? 'desktop').toLowerCase(), name: m[2].trim() })),
  rule('site', String.raw`(?:go to|open|visit|browse to) (?:https?://)?((?:[a-z0-9-]+(?:\.| dot ))+[a-z]{2,})(/[\w\-./%?=&#~+]*)?`, (m) => siteArgs(m[1], m[2])),
  rule('window', String.raw`(?:(?:move|snap|put|send|tile) ${SUBJ} (?:to |on )?(?:the )?left(?: half| side)?|(?:snap|tile) left|left half)`, () => ({ op: 'left' })),
  rule('window', String.raw`(?:(?:move|snap|put|send|tile) ${SUBJ} (?:to |on )?(?:the )?right(?: half| side)?|(?:snap|tile) right|right half)`, () => ({ op: 'right' })),
  rule('window', String.raw`maximi[sz]e(?: ${SUBJ})?|(?:make|snap|put) ${SUBJ} (?:full ?screen|full|fill the screen|maximi[sz]ed)`, () => ({ op: 'full' })),
  rule('window', String.raw`(?:center|centre) (?:the |this |my )?(?:front )?window|(?:move|put) ${SUBJ} (?:to )?(?:the )?(?:center|centre|middle)`, () => ({ op: 'center' })),
  rule('window', String.raw`(?:move|send|put|throw) ${SUBJ} to (?:the )?(?:other|next|second) (?:screen|display|monitor)`, () => ({ op: 'other' })),
  rule('timer', String.raw`(?:set |start |create )?(?:a |an )?(?:timer|alarm) (?:for |of )?(${DUR})`, (m) => ({ ms: parseDuration(m[1]) })),
  rule('timer', String.raw`(?:set |start )(?:a |an )?(${DUR}) timer`, (m) => ({ ms: parseDuration(m[1]) })),
  rule('timer', String.raw`remind me in (${DUR}) to (.{1,100})`, (m) => ({ ms: parseDuration(m[1]), label: m[2].trim() })),
  rule('timer', String.raw`remind me to (.{1,100}?) in (${DUR})`, (m) => ({ ms: parseDuration(m[2]), label: m[1].trim() })),
  rule('remind', String.raw`remind me (.{3,160})`, (m) => ({ said: `remind me ${m[1]}` })),   // "… tomorrow at 9": Reminders (calendar.js)
  rule('timers', String.raw`what timers (?:do i have|are (?:running|set))|(?:list|show)(?: my)?(?: the)? timers|how (?:much time(?: is)?|long(?: is)?) left(?: on (?:the|my) timer)?|do i have any timers`),
  rule('cancel', String.raw`(?:cancel|stop|clear|delete|remove) (?:the |my |all |all my |every )?(?:timers?|reminders?)`, (m) => ({ all: /\b(all|every)\b|timers\b|reminders\b/i.test(m[0]) })),
  // "open the bluetooth settings", "show me wi-fi settings": that pane of System Settings, by its link. No model.
  rule('prefs', String.raw`(?:open|show(?: me)?|go to|take me to|bring up)(?: the| my)? (${Object.keys(PANES).join('|')})(?: settings| preferences| options)`, (m) => ({ pane: m[1].toLowerCase().replace(/\s+/g, ' ') })),
  rule('dark', String.raw`(?:toggle|flip|switch)(?: the)? (?:dark mode|appearance)`, () => ({ mode: 'toggle' })),
  rule('dark', String.raw`(?:(?:turn|switch|set) off|disable)(?: the)? dark mode|(?:turn|switch|set) (?:the )?dark mode off|(?:(?:turn on|switch to|go to|enable|use|set) )?(?:the )?light mode|dark mode off`, () => ({ mode: 'off' })),
  rule('dark', String.raw`(?:(?:turn on|switch to|go to|enable|use|set) )?(?:the )?dark mode(?: on)?|(?:turn|switch|set) (?:the )?dark mode on`, () => ({ mode: 'on' })),
  rule('lock', String.raw`lock (?:the |my )?(?:screen|mac|macbook|computer|laptop)`),
  rule('battery', String.raw`how much battery(?: do i have| is left| life)?(?: left)?|(?:${WHAT}|how(?:['’]?s| is)) (?:my |the )?battery(?: level| life| percentage)?(?: at| doing)?|(?:check |show |tell me )?(?:my |the )?battery(?: level| life| status| percentage)?|am i charging|is it charging`),
  rule('screenshot', String.raw`(?:take |grab |capture )(?:a |the |me a )?(?:screen ?shot|screen capture)(?: of (?:my|the) (?:screen|desktop))?|screen ?shot(?: (?:my|the) screen)?|capture (?:my |the )?screen`),
  rule('wifi', String.raw`(?:turn|switch|set) (?:on|off) (?:the |my )?wi[- ]?fi|(?:turn|switch|set) (?:the |my )?wi[- ]?fi (?:on|off)|(?:enable|disable) (?:the |my )?wi[- ]?fi|wi[- ]?fi (?:on|off)`, (m) => ({ on: /\b(on|enable)\b/i.test(m[0]) })),
  rule('newwin', String.raw`(?:open|make|create|start|get|give me|show) (?:a |another |one more )?new (${APPNAME}) window|(?:a |another )?new (${APPNAME}) window|(?:open|make|create) (?:a |another )?new window in (${APPNAME})`, (m) => ({ app: (m[1] ?? m[2] ?? m[3]).trim() })),
  // "start a new note", "open a new tab", "create a new document": the front app's own New key (⌘N, a tab ⌘T).
  rule('new', String.raw`(?:start|make|create|open|begin|get) (?:a |an |another )?new (?:blank |empty )?([a-z]+)`, (m) => ({ what: m[1].toLowerCase() })),
  rule('quit', String.raw`(?:force )?quit (?:the )?(${APPNAME})(?: app| application)?`, (m) => ({ app: m[1].trim() })),
];
// The front app's own key for a few everyday things. Kept out of DESKTOP (below): in the browser version these
// words are for its own page. ponytail: Mac default shortcuts; an app that remaps them gets the default.
const KEY_SAID = [
  ['cmd+w', 'close (?:this |the |that )?(?:tab|window|document)'],
  ['cmd+shift+t', 're-?open (?:the )?(?:last |closed |last closed )?tab'],
  ['cmd+t', '(?:a )?new tab'],
  ['ctrl+tab', '(?:go to |switch to )?(?:the )?next tab|switch tabs'],
  ['ctrl+shift+tab', '(?:go (?:back )?to |switch to )?(?:the )?(?:previous|last) tab'],
  ['cmd+[', 'go back(?: a page| one page| to the last page)?'],
  ['cmd+]', 'go forward(?: a page| one page)?'],
  ['cmd+r', '(?:reload|refresh)(?: (?:the|this) page| it| this)?'],
  ['pagedown', 'scroll (?:down|further)|page down'],
  ['pageup', 'scroll (?:up|back up)|page up'],
  ['cmd+up', '(?:scroll |go )?(?:back )?(?:up )?to the top(?: of (?:the|this) page)?'],
  ['cmd+down', '(?:scroll |go )?(?:down )?to the bottom(?: of (?:the|this) page)?'],
  ['cmd+=', 'zoom in|make (?:it|this|the text) bigger'],
  ['cmd+-', 'zoom out|make (?:it|this|the text) smaller'],
  ['cmd+0', 'reset (?:the )?zoom|actual size'],
  ['cmd+c', 'copy(?: (?:that|this|it|the selection))?'],
  ['cmd+x', 'cut (?:that|this|the selection)'],
  ['cmd+v', 'paste(?: (?:that|this|it))?(?: here)?'],
  ['cmd+a', 'select (?:all|everything)'],
  ['cmd+s', 'save(?: (?:the|this|my) (?:file|document|work|changes))?'],   // not "save this": that's REMEMBER (what's on screen)
  ['cmd+m', 'minimi[sz]e(?: (?:this|it|the window|this window))?'],
  ['cmd+h', 'hide (?:this|it|this app|the app|this window)'],
  ['ctrl+cmd+f', '(?:go |enter |exit |leave )?full ?screen(?: mode)?'],
];
const KEY_RULES = KEY_SAID.map(([combo, body]) => rule('keys', body, () => ({ combo })));
const FOLDER = { downloads: 'Downloads', documents: 'Documents', desktop: 'Desktop', applications: '/Applications', pictures: 'Pictures', music: 'Music', movies: 'Movies', home: '' };
const mediaApp = (s) => (/spotify/i.test(s) ? 'Spotify' : /apple music/i.test(s) ? 'Music' : undefined);
const NOT_APPS = /^(this|that|it|everything|all|dixi|app|the app|here)$/i;

/** One regex for every desktop line, for everywhere-words.js: these go to Everywhere. */
export const DESKTOP = new RegExp(RULES.map((r) => r.re.source).join('|'), 'i');

function siteArgs(host, path = '') {
  host = host.replace(/ dot /gi, '.').toLowerCase();
  return { host, path };
}
/** "10 minutes", "an hour and 30 minutes", "half an hour", "ninety seconds" → milliseconds (1 s to 24 h), or 0. */
export function parseDuration(s) {
  let ms = 0;
  for (const [, n, u] of String(s).toLowerCase().matchAll(new RegExp(`(${NUM})[ -]?(${UNIT})`, 'g'))) {
    const k = /^(half)/.test(n) ? 0.5 : /^an?$/.test(n) ? 1 : WORDS[n] ?? Number(n);
    ms += k * (u.startsWith('h') ? 3600000 : u.startsWith('m') ? 60000 : 1000);
  }
  return ms >= 1000 && ms <= 86400000 ? Math.round(ms) : 0;
}
/** "go to youtube.com" → { verb: 'site', url }; "snap it left" → { verb: 'window', op: 'left' }; or null. */
export function desktopIntent(text) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 200) return null;
  for (const { verb, re, args } of [...RULES, ...KEY_RULES]) {
    const m = t.match(re);
    if (!m) continue;
    const a = args(m);
    if (verb === 'site') {
      const url = validSite(a.host, a.path);
      return url ? { verb, url } : null;
    }
    if (verb === 'search') {   // a search is a link: the same checks as any site (DO.site)
      const [host, ...rest] = SEARCH[a.site].split('/');
      const url = validSite(host, `/${rest.join('/')}${encodeURIComponent(a.q)}`);
      return url ? { verb: 'site', url, say: a.site === 'directions' ? `Directions to ${a.q}.` : a.site === 'maps' ? `Showing ${a.q} on the map.` : `Searching ${SEARCH_NAME[a.site]} for ${a.q}.` } : null;
    }
    if (verb === 'mkdir' && (/^\.|\.\.|^\s*$/.test(a.name) || NOT_APPS.test(a.name))) return null;
    if (verb === 'timer' && !a.ms) return null;
    if (verb === 'remind' && !spokenReminder(a.said)) return null;   // no day or time said: the planner's
    if (verb === 'quit' && NOT_APPS.test(a.app)) return null;
    if (verb === 'new' && /^(?:folder|password|passcode|account|user|profile|card|line|paragraph|one)$/.test(a.what)) return null;   // not a New-key thing
    if (verb === 'newwin' && (NOT_APPS.test(a.app) || /^(?:private|incognito|guest|browser|web|tab)$/i.test(a.app))) return null;   // a kind of window, not an app
    return { verb, ...a };
  }
  return null;
}
// "ask Gemini what the capital of Australia is", "paste this into ChatGPT", "select everything and paste it into
// Gemini and ask it to summarize": that chat site in a new tab, your words (or what's selected) in its box, sent.
const CHATS = { gemini: ['Gemini', 'https://gemini.google.com/app'], chatgpt: ['ChatGPT', 'https://chatgpt.com/'], claude: ['Claude', 'https://claude.ai/new'], perplexity: ['Perplexity', 'https://www.perplexity.ai/'] };
const CHAT = '(?:google\\s+)?(gemini|chat\\s?g\\.?\\s?p\\.?\\s?t\\.?|claude|perplexity)';
const chat = (w) => CHATS[w.replace(/[\s.]/g, '')];
const POLITE = /^(?:(?:hey\s+)?dixi[,.]?\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?/i;
const ASK = new RegExp(`^(?:(?:open|go\\s+to)\\s+${CHAT}\\s*,?\\s+and\\s+ask(?:\\s+it)?|ask\\s+${CHAT})[,:]?\\s+(?:to\\s+)?(.+?)[.?!]*$`, 'i');
const PASTE = new RegExp(`^(select\\s+(?:all|everything)(?:\\s+and|,)?\\s+)?(?:copy\\s+(?:it|this|that|everything|all)(?:\\s+and|,)?\\s+)?(?:paste|put|send|drop)\\s+(?:in\\s+)?(it|this|that|them|everything|all of it|the selection|what(?:'s| is) selected|what i copied|the clipboard|my clipboard)?\\s*(?:into|in|to|on)\\s+${CHAT}(?:\\s*,?\\s+and\\s+(?:ask|tell)\\s+it\\s+(?:to\\s+)?(.+?))?[.?!]*$`, 'i');
/** → { site, url, question } (your words) or { site, url, from: 'all' | 'selection' | 'clipboard', ask? }, else null. */
export function chatIntent(text) {
  const t = String(text ?? '').trim().replace(POLITE, '');
  let m = t.match(ASK);
  if (m) { const [site, url] = chat((m[1] ?? m[2]).toLowerCase()); return { site, url, question: m[3].trim() }; }
  if (!(m = t.match(PASTE))) return null;
  const [site, url] = chat(m[3].toLowerCase());
  return { site, url, from: m[1] || /^(?:everything|all of it)$/i.test(m[2] ?? '') ? 'all' : /clipboard|copied/i.test(m[2] ?? '') ? 'clipboard' : 'selection', ...(m[4] && { ask: m[4].trim() }) };
}
/** "type hello world" → "hello world": the words to type, exactly as said (no AI). Null for what has to be written
 *  first ("type a reply to Sam", "type my address") or pointed at ("type it"), and for "type of …". */
export function typeIntent(text) {
  const m = String(text ?? '').trim().match(/^(?:please\s+)?type\s+(?:out\s+|in\s+)?["“']?(.+?)["”']?[.!]?$/i);
  return m && !/^(?:of|it|that|this|them|my|me|a|an|the|some|something|what|whatever)\b/i.test(m[1]) ? m[1] : null;
}
/** https:// plus a real-looking host, or null. Files ("notes.md") and bare words are not sites. */
export function validSite(host, p = '') {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host) || NOT_TLD.test(host)) return null;
  try { const u = new URL(`https://${host}${p}`); return u.protocol === 'https:' && u.hostname === host ? u.href : null; } catch { return null; }
}

// ---- the window layout: where the front window goes, for the screens you have (pure) ----
/** screens: [{ x, y, width, height }] (usable areas, top-left origin). win: { pos: [x, y], size: [w, h] }. */
export function layoutRect(op, screens, win) {
  const cx = win.pos[0] + win.size[0] / 2, cy = win.pos[1] + win.size[1] / 2;
  const here = Math.max(0, screens.findIndex((s) => cx >= s.x && cx < s.x + s.width && cy >= s.y && cy < s.y + s.height));
  if (op === 'other' && screens.length < 2) return null;
  const s = screens[op === 'other' ? (here + 1) % screens.length : here];
  const hw = Math.floor(s.width / 2);
  const w = Math.min(win.size[0], s.width), h = Math.min(win.size[1], s.height);
  const r = op === 'left' ? [s.x, s.y, hw, s.height]
    : op === 'right' ? [s.x + hw, s.y, s.width - hw, s.height]
    : op === 'full' ? [s.x, s.y, s.width, s.height]
    : [s.x + (s.width - w) / 2, s.y + (s.height - h) / 2, w, h];   // center, and the other screen: centred, same size
  return r.map(Math.round);
}
/** `pmset -g batt` → "84 percent, charging"; null on a Mac with no battery. */
export function parseBattery(out) {
  const m = String(out).match(/(\d{1,3})%;\s*([^;\n]+)/);
  if (!m) return null;
  const state = { charging: 'charging', discharging: 'on battery', charged: 'fully charged', 'finishing charge': 'almost full', 'not charging': 'plugged in, not charging' }[m[2].trim().toLowerCase()] ?? m[2].trim();
  return `${m[1]} percent, ${state}`;
}
const spoken = (ms) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = [[h, 'hour'], [m, 'minute'], [h || m ? 0 : r, 'second']].filter(([n]) => n).map(([n, u]) => `${n} ${u}${n > 1 ? 's' : ''}`);
  return p.join(' ') || 'under a minute';
};
const stamp = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`; };

// ---- doing it ----
// In memory only: gone when Dixi quits. ponytail: no persistence; a reminder you need across restarts belongs in Reminders.
const live = [];
let seq = 0;
const MEDIA_APPS = ['Spotify', 'Music'];   // ponytail: the first one running wins; "Spotify"/"Apple Music" in your words picks one
const MEDIA_CMD = { playpause: 'playpause', play: 'play', pause: 'pause', next: 'next track', previous: 'previous track' };
/** Opens `app` and waits for it to be in front (50 ms ticks, up to 2 s): its front info; 'none' when there's no
 *  such app; null when it never came. Keys go only to the app that was meant. */
export async function toFront(app, d = {}) {
  const { open = openApp, front = frontApp, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = d;
  if (!(await open(app))) return 'none';
  const same = (n) => n && n.toLowerCase().replace(/\.app$/, '') === app.toLowerCase();
  let f = await front();
  for (let t = 0; t < 40 && !same(f?.name); t++) { await wait(50); f = await front(); }
  return same(f?.name) ? f : null;
}
const out = (say, title = 'Dixi') => ({ say, title, text: say });

/** Run one intent from desktopIntent(). Returns { say, title, text }; never throws.
 *  deps: exec(cmd, args) → stdout, say(text) (for timers that fire later),
 *  now() → Date, setTimer(ms, fn) → cancel function, screens() → [{ x, y, width, height }], home. */
export async function runDesktop(intent, deps) {
  const d = { now: () => new Date(), setTimer: (ms, fn) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); }, home: homedir(), screens: () => [], live, ...deps };
  try {
    const fn = DO[intent?.verb];
    return fn ? await fn(intent, d) : out("I don't know that one.");
  } catch (err) {
    if (err?.refused) return { ...out(`I didn't press anything: ${err.message}.`, 'Dixi'), ok: false };
    if (/-1743|not authori[sz]ed|assistive/i.test(String(err?.message ?? err))) return out('Dixi needs permission to control that app. Allow it in System Settings, Privacy and Security, Automation, then ask again.', 'Permission needed');
    return out("That didn't work.", 'Dixi');
  }
}
const osa = (d, script, ...argv) => d.exec('osascript', ['-e', script, ...argv]);
const jxa = (d, body, args = {}) => d.exec('osascript', ['-l', 'JavaScript', '-e', `const A = ${JSON.stringify(args)}; ${body}`]);   // args as JSON, never as text
const running = (d, app) => osa(d, 'application "' + app + '" is running').then((r) => r === 'true', () => false);   // app is one of MEDIA_APPS: fixed words

// "play Here Comes the Sun on Apple Music": your library first; then, only with a subscription, the catalog:
// Apple's public search (no key) → open the song's music:// link → press Play by its name → check it plays.
// Never a guess and never YouTube: no subscription is said plainly. The song's name only travels as argv/URL.
const LIB_PLAY = `on run argv
  tell application "Music"
    set r to search library playlist 1 for (item 1 of argv) only songs
    if r is {} then return ""
    play item 1 of r
    return (name of item 1 of r) & " by " & (artist of item 1 of r)
  end tell
end run`;
// ponytail: the English menu item; a Mac in another language falls through to "it didn't start playing".
const NO_SUB = 'tell application "System Events" to tell process "Music" to return exists menu item "Join Apple Music…" of menu 1 of menu bar item "Account" of menu bar 1';
const NOW = 'tell application "Music" to if player state is playing then return (name of current track) & " by " & (artist of current track)';
// "play some music": what was playing carries on; with nothing to carry on, your whole library on shuffle.
const MUSIC_PLAY = `tell application "Music"
  if player state is not playing then
    try
      get name of current track
      play
    end try
  end if
  if player state is not playing then
    if (count of tracks of library playlist 1) is 0 then return "empty"
    set shuffle enabled to true
    play library playlist 1
  end if
  if player state is playing then return (name of current track) & " by " & (artist of current track)
  return "stopped"
end tell`;
async function playMusic(d) {
  const r = await osa(d, MUSIC_PLAY);
  if (r !== 'empty' && r !== 'stopped') return out(`Playing ${r}.`, 'Music');
  const noSub = (await osa(d, NO_SUB).catch(() => '')) === 'true';
  if (r === 'empty') return out(noSub ? "Your music library is empty, and Apple Music needs a subscription, so there's nothing to play." : 'Your music library is empty. Tell me a song to play from Apple Music.', 'Music');
  return out(noSub ? 'Music didn\'t start: these songs need an Apple Music subscription.' : "Music didn't start playing.", 'Music');
}
async function playSong(q, d) {
  const { fetch: get = fetch, find = findControls, press = pressControl, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = d;
  const mine = await osa(d, LIB_PLAY, q.replace(/ by /i, " ")).catch(() => '');
  if (mine) return out(`Playing ${mine}.`, 'Music');
  if ((await osa(d, NO_SUB).catch(() => '')) === 'true') return out('Apple Music needs a subscription to play this.', 'Music');
  const hit = (await get(`https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '1' })}`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch(() => null))?.results?.[0];
  let link; try { link = new URL(hit.trackViewUrl); } catch { return out(`I couldn't find ${q} on Apple Music.`, 'Music'); }
  if (link.hostname !== 'music.apple.com') return out(`I couldn't find ${q} on Apple Music.`, 'Music');
  await d.exec('open', [`music://${link.host}${link.pathname}${link.search}`]);
  let c = [];
  for (let t = 0; t < 8 && !c.length; t++) { await wait(500); c = await find('Play'); }   // the page loads in 1-3 s
  if (c.length && (await press(c[0].path, c[0].labels)) === 'ok')
    for (let t = 0; t < 6; t++) { await wait(400); const now = await osa(d, NOW).catch(() => ''); if (now) return out(`Playing ${now}.`, 'Music'); }
  return out(`I opened ${hit.trackName} in Music, but it didn't start playing. Press Play there.`, 'Music');
}

// Music's search page for the words (its link fills no field), then a check that results for them really show.
async function searchMusic(q, d) {
  const { texts = windowTexts, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = d;
  const region = (new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region ?? 'US').toLowerCase();
  await d.exec('open', [`music://music.apple.com/${region}/search?term=${encodeURIComponent(q)}`]);
  const flat = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');   // "Lo‑Fi", "LoFi" and "lo-fi" read the same
  const words = q.split(/\s+/).map(flat).filter(Boolean);
  for (let t = 0; t < 25; t++) {   // a cold Music opens and loads in 2-6 s
    const seen = flat((await texts('Music')).join(' '));
    if (words.every((w) => seen.includes(w))) return out(`Here are the Apple Music results for ${q}.`, 'Music');
    await wait(300);
  }
  return out(`I opened Music, but no results for ${q} showed up.`, 'Music');
}

const DO = {
  async volume(i, d) {
    if (i.op === 'mute' || i.op === 'unmute') {
      await osa(d, `set volume ${i.op === 'mute' ? 'with' : 'without'} output muted`);
      return out(i.op === 'mute' ? 'Muted.' : 'Unmuted.', 'Volume');
    }
    let n = i.pct;
    if (i.op !== 'set') {
      const cur = parseInt(await osa(d, 'output volume of (get volume settings)'), 10);
      n = (Number.isNaN(cur) ? 50 : cur) + (i.op === 'up' ? 10 : -10);
    }
    n = Math.max(0, Math.min(100, Math.round(n)));   // a clamped integer is the only thing in the script
    await osa(d, `set volume output volume ${n} without output muted`);
    return out(`Volume ${n} percent.`, 'Volume');
  },
  async media(i, d) {
    if (i.op === 'song') return playSong(i.q, d);
    if (i.op === 'search') return searchMusic(i.q, d);
    for (const app of i.app ? [i.app] : MEDIA_APPS) {
      if (!MEDIA_APPS.includes(app) || !(await running(d, app))) continue;
      if (app === 'Music' && i.op === 'play') return playMusic(d);
      if (i.op === 'now') {
        const r = await osa(d, `tell application "${app}" to (name of current track) & " by " & (artist of current track)`).catch(() => '');
        return out(r ? `Playing ${r}.` : 'Nothing is playing.', app);
      }
      await osa(d, `tell application "${app}" to ${MEDIA_CMD[i.op]}`);
      return out({ playpause: 'Done.', play: 'Playing.', pause: 'Paused.', next: 'Next song.', previous: 'Previous song.' }[i.op], app);
    }
    if (i.op === 'play' && i.app !== 'Spotify') return playMusic(d);   // "play some music" with nothing open: your library in Music
    return out(`${i.app ?? 'Music and Spotify'} ${i.app ? "isn't" : "aren't"} open. Open it first and I'll control it.`, 'Media');
  },
  async site(i, d) {
    const u = new URL(i.url);   // checked again: only https and a real host ever reach `open`
    const url = validSite(u.hostname, u.pathname + u.search + u.hash);
    if (!url) return out("That doesn't look like a website.");
    const why = unsafe(url);   // a caller reading out "chase-secure-login.com" is exactly this case
    if (why) return out(`${why} I didn't open it.`, 'Dixi Guardian');
    await d.exec('open', [url]);
    return out(i.say ?? `Opening ${u.hostname.replace(/^www\./, '')}.`, 'Opening');
  },
  async folder(i, d) {
    const dir = FOLDER[i.dir].startsWith('/') ? FOLDER[i.dir] : path.join(d.home, FOLDER[i.dir]);
    await d.exec('open', [dir]);
    return out(`Opening ${i.dir === 'home' ? 'your home folder' : FOLDER[i.dir].replace('/', '')}.`, 'Finder');
  },
  // ponytail: an empty folder, so "undo that" doesn't track it (⌘Z in Finder doesn't either); add it to undo.js if asked.
  async mkdir(i, d) {
    const dir = path.join(d.home, FOLDER[i.dir], i.name);
    if (path.dirname(dir) !== path.join(d.home, FOLDER[i.dir])) return out("That name can't be a folder.", 'New folder');
    if ((d.exists ?? fs.existsSync)(dir)) return out(`There's already a ${i.name} folder in ${FOLDER[i.dir]}.`, 'New folder');
    await d.exec('mkdir', [dir]);
    return out(`Made the ${i.name} folder in ${FOLDER[i.dir]}.`, 'New folder');
  },
  // "close this tab", "scroll down": the key, in the app in front (never a terminal or code editor: appKey checks). Silent.
  async keys(i, d) {
    await (d.appKey ?? d.key ?? key)(i.combo);
    const pretty = i.combo.replace(/cmd\+/g, '⌘').replace(/ctrl\+/g, '⌃').replace(/shift\+/g, '⇧').replace('pagedown', 'Page Down').replace('pageup', 'Page Up').replace(/tab$/, 'Tab').replace(/up$/, '↑').replace(/down$/, '↓').replace(/(^|[⌘⌃⇧])([a-z])$/, (_, m, k) => m + k.toUpperCase());
    return { say: '', title: 'Done', text: pretty, quiet: true };
  },
  // "remind me to call the dentist tomorrow at 9": straight into Reminders, said back with the full date, undo-able.
  // ponytail: careful mode doesn't read it back first here (the screen path does); "undo that" takes it off.
  async remind(i, d) {
    const now = d.now(), item = spokenReminder(i.said, now);
    if (!item) return out("I didn't catch when.", 'Reminders');
    const [cmd, ...args] = createArgs(item);
    const id = /^id:(.+)$/.exec(String(await d.exec(cmd, args)))?.[1];
    const say = readBack(item, { now }).replace(/\?$/, '.').replace(/^Remind you /, 'I’ll remind you ');
    return { ...out(say, 'Reminder'), undo: id ? { kind: 'reminder', id } : null };
  },
  async window(i, d) {
    const win = JSON.parse(await jxa(d, `const p = Application('System Events').applicationProcesses.whose({frontmost: true})[0]; const w = p.windows[0];
      JSON.stringify({ pos: w.position(), size: w.size() });`));
    const r = layoutRect(i.op, await d.screens(), win);
    if (!r) return out('You only have one screen.', 'Window');
    await jxa(d, `const p = Application('System Events').applicationProcesses.whose({frontmost: true})[0]; const w = p.windows[0];
      w.position = [A.r[0], A.r[1]]; w.size = [A.r[2], A.r[3]]; w.position = [A.r[0], A.r[1]];`, { r });
    return out({ left: 'Left half.', right: 'Right half.', full: 'Maximized.', center: 'Centered.', other: 'Moved to the other screen.' }[i.op], 'Window');
  },
  async timer(i, d) {
    const id = ++seq;
    const cancel = d.setTimer(i.ms, () => {
      d.live.splice(0, d.live.length, ...d.live.filter((t) => t.id !== id));
      d.say(i.label ? `Reminder: ${i.label}.` : 'Your timer is done.');
    });
    d.live.push({ id, at: Number(d.now()) + i.ms, label: i.label, cancel });
    return out(i.label ? `Okay, I'll remind you in ${spoken(i.ms)}.` : `Timer set for ${spoken(i.ms)}.`, 'Timer');
  },
  async timers(i, d) {
    if (!d.live.length) return out("You don't have any timers.", 'Timers');
    const items = d.live.map((t) => `${spoken(t.at - Number(d.now()))} left${t.label ? ` to ${t.label}` : ''}`);
    return out(`You have ${items.length} ${items.length > 1 ? 'timers' : 'timer'}: ${items.join(', and ')}.`, 'Timers');
  },
  async cancel(i, d) {
    if (!d.live.length) return out("You don't have any timers.", 'Timers');
    const gone = i.all ? d.live.splice(0) : d.live.splice(d.live.indexOf(d.live.reduce((a, b) => (b.at < a.at ? b : a))), 1);   // "the timer" = the soonest
    gone.forEach((t) => t.cancel?.());
    return out(gone.length > 1 ? `Cancelled ${gone.length} timers.` : 'Cancelled.', 'Timers');
  },
  async dark(i, d) {
    const r = await jxa(d, `const p = Application('System Events').appearancePreferences;
      p.darkMode = A.mode === 'toggle' ? !p.darkMode() : A.mode === 'on'; p.darkMode();`, { mode: i.mode });
    return out(r === 'true' ? 'Dark mode on.' : 'Dark mode off.', 'Appearance');
  },
  async lock(i, d) {
    // ⌃⌘Q really locks; pmset only turns the screen off (it locks only with "require password immediately").
    if (d.key) { await d.key('ctrl+cmd+q'); return out('Locking.', 'Lock'); }
    await d.exec('pmset', ['displaysleepnow']);
    return out('Screen off.', 'Lock');
  },
  async battery(i, d) {
    const b = parseBattery(await d.exec('pmset', ['-g', 'batt']));
    return out(b ? `${b}.` : 'This Mac has no battery.', 'Battery');
  },
  async screenshot(i, d) {
    await d.exec('screencapture', ['-x', path.join(d.home, 'Desktop', `Screenshot ${stamp(d.now())}.png`)]);
    return out('Saved a screenshot to your Desktop.', 'Screenshot');
  },
  async wifi(i, d) {
    const ports = await d.exec('networksetup', ['-listallhardwareports']).catch(() => '');
    const dev = ports.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\w+)/)?.[1] ?? 'en0';
    await d.exec('networksetup', ['-setairportpower', dev, i.on ? 'on' : 'off']);
    return out(i.on ? 'Wi-Fi on.' : 'Wi-Fi off.', 'Wi-Fi');
  },
  // "open a new Finder window": the app in front, then its own New Window key (⌘N). Never pressed into another app.
  async newwin(i, d) {
    const f = await toFront(i.app, d);
    if (f === 'none') return out(`There's no app called ${i.app} on this Mac.`, 'Window');
    if (!f) return out(`${i.app} didn't come to the front, so I didn't press anything.`, 'Window');
    await (d.appKey ?? d.key ?? key)('cmd+n');
    return out(`New ${f.name} window.`, 'Window');
  },
  // After "open Notes", i.app: Notes must be in front first, so ⌘N never lands in another app.
  async new(i, d) {
    if (i.app && !(await toFront(i.app, d))?.name) return { ...out(`${i.app} didn't come to the front, so I didn't press anything.`, 'New'), ok: false };
    await (d.appKey ?? d.key ?? key)(i.what === 'tab' ? 'cmd+t' : 'cmd+n');
    return out(`New ${i.what}.`, 'New');
  },
  async prefs(i, d) {
    const id = PANES[i.pane];
    if (!id) return out("I don't know that settings page.");
    await d.exec('open', [`x-apple.systempreferences:${id}`]);
    const name = i.pane.replace(/\b\w/g, (c) => c.toUpperCase());
    return { ...out(`${name} settings.`, 'System Settings'), quiet: true };
  },
  async quit(i, d) {
    const name = String(i.app ?? '');
    if (!/^[a-z0-9][a-z0-9 .&+'’-]{0,39}$/i.test(name)) return out("I couldn't tell which app to quit.", 'Quit');
    // Only an app that is running (telling a closed one to quit would open it first). The name is an argument, never script text.
    const on = await osa(d, 'on run argv\nreturn application (item 1 of argv) is running\nend run', name).catch(() => 'false');
    if (on !== 'true') return out(`${name} isn't open.`, 'Quit');
    await osa(d, 'on run argv\ntell application (item 1 of argv) to quit\nend run', name);
    return out(`Quit ${name}.`, 'Quit');
  },
};
