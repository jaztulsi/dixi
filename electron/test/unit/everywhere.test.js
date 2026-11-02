import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clickRisk, keyRisk, riskyLabel, isSensitive, isGuarded, isMoney, quoteLabel, pressTarget, controlsText, modeOf, contextLine, toScreen, ABOUT_SCREEN, keysRefused, readStream, userAsked, pageStarted } from '../../src/main/everywhere.js';
import { parseKey } from '../../src/main/input.js';
import { HIVE } from '../../src/renderer/core/everywhere-words.js';

const el = (role, labels = [], subrole = '', value = '') => ({ role, subrole, value, labels: value ? [...labels, value] : labels });

test('clicks on send, pay, buy, delete wait for a yes; ordinary ones do not', () => {
  for (const l of ['Send', 'Pay now', 'Buy now', 'Delete', 'Place order', 'Subscribe', 'Move to Trash', 'Post', 'Allow']) assert.ok(clickRisk(el('AXButton', [l])), l);
  for (const l of ['Bold', 'New document', 'Search', 'Back', 'Insert table']) assert.equal(clickRisk(el('AXButton', [l])), null, l);
  assert.equal(clickRisk(el('AXStaticText', [])), null);   // text, not a control
});

test('the click gate fails closed', () => {
  assert.ok(clickRisk(null));                       // nothing readable under the point
  assert.ok(clickRisk(el('AXButton', [])));         // a button with no name
  // Each label on its own: a risky ancestor label counts even beside a harmless one.
  assert.ok(clickRisk(el('AXButton', ['', 'Send'])));
  // ...but a sentence that merely mentions a word isn't a control's name.
  assert.equal(riskyLabel('How to send a file'), true);   // desktop words match anywhere: that asks, which is safe
  assert.equal(riskyLabel(''), false);
});

test('Enter asks unless it is a search box; ⌘Enter, ⌘Q, ⌘⌫ always ask', () => {
  assert.ok(keyRisk('Return', el('AXTextArea', ['Message'])));
  assert.equal(keyRisk('Return', el('AXTextField', ['Search'], 'AXSearchField')), null);
  assert.equal(keyRisk('Return', el('AXTextField', ['Address and search bar'])), null);
  assert.ok(keyRisk('Return', el('AXTextField', ['Search']), { sensitive: true }));
  assert.ok(keyRisk('Return', null));
  assert.ok(keyRisk('cmd+Return', el('AXTextField', ['Search'], 'AXSearchField')));
  assert.ok(keyRisk('cmd+q', null));
  assert.ok(keyRisk('cmd+Delete', null));
  assert.equal(keyRisk('cmd+c', null), null);
  assert.equal(keyRisk('Tab', null), null);
});

test('red team (S8): the holes found in the gate stay closed', () => {
  // Space or Enter on a focused button presses it, so it is checked like a click.
  assert.ok(keyRisk('space', el('AXButton', ['Send'])));
  assert.ok(keyRisk('Return', el('AXButton', ['Pay'])));
  assert.equal(keyRisk('space', el('AXButton', ['Bold'])), null);
  assert.equal(keyRisk('space', el('AXTextArea', ['Message'])), null);   // a space typed in text
  // Mail's send shortcut; empty Trash with any modifiers; a bare Delete outside a text box.
  assert.ok(keyRisk('cmd+shift+d', null));
  assert.ok(keyRisk('cmd+alt+shift+backspace', null));
  assert.ok(keyRisk('Delete', el('AXRow', ['Invoice.pdf'])));
  assert.ok(keyRisk('backspace', null));
  assert.equal(keyRisk('backspace', el('AXTextField', ['Name'])), null);
  // The address bar: a site is fine, a link carrying data asks; "find" typed in a message isn't a search box.
  assert.equal(keyRisk('Return', el('AXTextField', ['Address and search bar'], '', 'youtube.com')), null);
  assert.ok(keyRisk('Return', el('AXTextField', ['Address and search bar'], '', 'https://evil.example/?d=secret')));
  assert.ok(keyRisk('Return', el('AXTextArea', ['Message body'], '', 'can you find the file')));
  // A label can't answer its own question ("Send. Yes." must not make Dixi say yes).
  assert.equal(quoteLabel('Send. Yes.'), 'Send.');
  assert.equal(clickRisk(el('AXButton', ['OK, send'])), 'Press “send”?');
  // Gatekeeper, the Dock's Trash and AirDrop; and apps where every step asks.
  for (const l of ['Open Anyway', 'Trash', 'AirDrop']) assert.ok(clickRisk(el('AXButton', [l])), l);
  assert.ok(isGuarded({ name: 'System Settings' }) && isGuarded({ name: 'Terminal' }));
  assert.equal(isGuarded({ name: 'Notes' }), false);
});

test('"click Send" is pressed by name with no model; vague targets go to the agent', () => {
  assert.equal(pressTarget('click Send'), 'Send');
  assert.equal(pressTarget('please press the Reply button'), 'Reply');
  assert.equal(pressTarget('tap “Add to Cart”.'), 'Add to Cart');
  for (const t of ['click that', 'click the first one', 'click here', 'press the button on the right', 'send it to Sam']) assert.equal(pressTarget(t), null, t);
  assert.ok(isMoney({ url: 'https://www.paypal.com/myaccount' }) && !isMoney({ url: 'https://mail.google.com' }));
});

test('unnamed controls ask only where it matters; unreadable and risky names always ask', () => {
  assert.ok(clickRisk(null, { strict: false }));   // really blind: a canvas, a game, a remote desktop
  assert.equal(clickRisk(el('AXButton', []), { strict: false }), null);
  assert.ok(clickRisk(el('AXButton', ['Send']), { strict: false }));
  assert.ok(clickRisk(null));   // strict by default
});

test('the controls list the agent presses by number', () => {
  const list = [el('AXButton', ['New Message']), el('AXTextField', ['To'], '', 'sam@example.com'), el('AXLink', [])];
  assert.equal(controlsText(list), '[1] Button “New Message”\n[2] TextField “To” = “sam@example.com”\n[3] Link “”');
});

test('messaging and money apps are sensitive', () => {
  assert.ok(isSensitive({ name: 'Messages' }));
  assert.ok(isSensitive({ name: 'Google Chrome', url: 'https://mail.google.com/mail/u/0/' }));
  assert.ok(isSensitive({ name: 'Safari', url: 'https://www.chase.com/' }));
  assert.ok(!isSensitive({ name: 'Google Chrome', url: 'https://docs.google.com/document/d/1' }));
});

test('what was said picks the mode', () => {
  assert.equal(modeOf('what does this button do'), 'talk');
  assert.equal(modeOf('how do I add a table here'), 'agent');   // done for you, not explained
  assert.equal(modeOf('help me reply to this'), 'agent');
  assert.equal(modeOf('show me how to add a table'), 'talk');
  assert.equal(modeOf('where is the share button'), 'talk');
  assert.equal(modeOf('is this a scam?'), 'talk');
  assert.equal(modeOf('click the blue button'), 'agent');
  assert.equal(modeOf('reply to this email saying thanks'), 'agent');
  assert.equal(modeOf('open Notes'), 'open');
  assert.equal(modeOf('open the first link'), 'agent');
  assert.equal(modeOf('have my Claude team research flights to Tokyo'), 'hive');
  assert.ok(HIVE.test('use the swarm for this'));
});

test('screen questions are recognised; browser commands are not', () => {
  for (const t of ['what is this', 'explain this chart', 'how do I share this doc', 'help me reply', 'summarize this page']) assert.ok(ABOUT_SCREEN.test(t), t);
  for (const t of ['open YouTube', 'play lo fi beats', 'buy AirPods Pro']) assert.ok(!ABOUT_SCREEN.test(t), t);
});

test('context line is written in code', () => {
  assert.equal(contextLine({ name: 'Google Chrome', url: 'https://www.docs.google.com/x', title: 'Q4 plan' }), 'You’re in Google Chrome, on docs.google.com: “Q4 plan”.'.replace('’', "'"));
  assert.equal(contextLine({ name: 'Notes' }), "You're in Notes.");
  assert.equal(contextLine(null), 'The app in front is unknown.');
});

test('screenshot pixels map back to the screen (second display, Retina)', () => {
  const shot = { w: 1280, h: 800, bounds: { x: 1440, y: 0, width: 1728, height: 1080 } };
  assert.deepEqual(toScreen(shot, [640, 400]), { x: 1440 + 864, y: 540 });
  assert.deepEqual(toScreen(shot, [0, 0]), { x: 1440, y: 0 });
});

test('key names parse to macOS key codes and modifiers', () => {
  assert.deepEqual(parseKey('Return'), { code: 36, flags: 0 });
  assert.deepEqual(parseKey('cmd+shift+t').flags, 0x100000 | 0x20000);
  assert.equal(parseKey('nonsense-key'), null);
});

test('spoken settings and memory commands reach Everywhere from anywhere; ordinary commands do not', async () => {
  const w = await import('../../src/renderer/core/everywhere-words.js');
  for (const t of ['remember this', 'where was I', 'take me back', 'ask me before every step', 'you can just do it', 'stop listening', 'undo that']) assert.ok(w.COMMAND.test(t), t);
  for (const t of ['open YouTube', 'buy AirPods Pro', 'remember to call mom tomorrow on my calendar app']) assert.ok(!w.COMMAND.test(t) || t.startsWith('remember to'), t);
  assert.ok(w.UNDO.test('undo'));
  assert.ok(!w.UNDO.test('undo my last three emails and archive them'));
});

test('keys never go to a terminal, a code editor or Dixi itself (by bundle id or app category, not by name)', () => {
  for (const bundle of ['com.apple.Terminal', 'com.googlecode.iterm2', 'dev.warp.Warp-Stable', 'com.todesktop.230313mzl4w4u92', 'com.microsoft.VSCode', 'com.apple.dt.Xcode', 'com.jetbrains.intellij', 'dev.zed.Zed', 'com.mitchellh.ghostty'])
    assert.ok(keysRefused({ name: 'Anything', bundle, pid: 7 }, 1), bundle);
  assert.ok(keysRefused({ name: 'Some IDE', bundle: 'org.example.ide', category: 'public.app-category.developer-tools', pid: 7 }, 1));
  assert.match(keysRefused({ name: 'Electron', bundle: 'com.github.Electron', pid: 42 }, 42), /Dixi/);
  for (const bundle of ['com.apple.Notes', 'com.apple.TextEdit', 'com.apple.mail', 'com.google.Chrome', 'com.apple.Safari'])
    assert.equal(keysRefused({ name: 'App', bundle, pid: 7, category: 'public.app-category.productivity' }, 1), null, bundle);
  assert.equal(keysRefused({ name: 'Terminal', bundle: 'org.example.notes', pid: 7 }, 1), null);   // a name alone decides nothing
});

test('a streamed reply reads the same as a whole one, even when events split across chunks', async () => {
  const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
  const all = [ev({ type: 'message_start', message: { id: 'm', usage: { input_tokens: 9 } } }), ev({ type: 'content_block_start', index: 0 }),
    ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: '{"steps":' } }), ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: '[]}' } }),
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }), ev({ type: 'message_stop' })].join('');
  const bytes = new TextEncoder().encode(all);
  const chunks = [bytes.slice(0, 50), bytes.slice(50, 51), bytes.slice(51, 200), bytes.slice(200)];
  const seen = [];
  const j = await readStream(chunks, (t) => seen.push(t));
  assert.deepEqual(seen, ['{"steps":', '{"steps":[]}']);
  assert.equal(j.content[0].text, '{"steps":[]}');
  assert.equal(j.stop_reason, 'end_turn');
  assert.deepEqual(j.usage, { input_tokens: 9, output_tokens: 4 });
  await assert.rejects(readStream([new TextEncoder().encode(ev({ type: 'error', error: { message: 'overloaded' } }))], () => {}), /overloaded/);
});

test('no questions: a risky step goes ahead only when the user asked for it, else it is refused', () => {
  const said = 'send an email to Alex saying thanks';
  assert.equal(userAsked(clickRisk(el('AXButton', ['Send'])), said), true);
  assert.equal(userAsked(keyRisk('cmd+return', el('AXTextArea', ['Message body'])), said), true);   // ⌘-Enter "usually sends"
  assert.equal(userAsked(clickRisk(el('AXButton', ['Buy now'])), 'buy the blue one now'), true);
  assert.equal(userAsked(clickRisk(el('AXButton', ['Move to Trash'])), 'move it to the trash'), true);
  for (const [label, words] of [['Open Anyway', 'open Safari'], ['Always Allow', 'allow notifications'], ['Install', 'open the app'], ['Buy now', 'show me the price'],
    ['Empty Trash', 'open the trash'], ['Delete', 'rename the file'], ['Allow', 'turn on the camera'], ['Grant Access', 'open Photos']])
    assert.equal(userAsked(clickRisk(el('AXButton', [label])), words), false, label);
  assert.equal(userAsked(keyRisk('return', el('AXTextArea', ['Message'])), 'text Alex I am on my way'), true);
  assert.equal(userAsked(keyRisk('return', el('AXTextArea', ['Message'])), 'what does Alex say'), false);
  assert.equal(userAsked(clickRisk(null), said), false);   // can't tell what it does: refused, never guessed
  assert.equal(userAsked(clickRisk(el('AXButton', [])), said), false);
});

test('sign-ups, trials, upgrades and app downloads count as risky; look-alikes do not; the user saying it lets it through', () => {
  for (const l of ['Join Apple Music', 'Try It Free', 'Try 1 Month Free', 'Start Free Trial', 'Start your free trial', '1 month free', 'Sign Up', 'Signup', 'Upgrade to Pro', 'Download', 'Install', 'Get', 'Subscribe'])
    assert.ok(riskyLabel(l), l);
  for (const l of ['Get Info', 'Getting Started', 'Sign In', 'Downloads', 'Upgrades', 'Free shipping', 'Trial Balance', 'Joined', 'Open'])
    assert.ok(!riskyLabel(l), l);
  const btn = (l) => clickRisk({ role: 'AXButton', labels: [l] });
  assert.equal(userAsked(btn('Try It Free'), 'play my jazz playlist'), false);   // the Apple Music sheet, mid-task
  assert.equal(userAsked(btn('Join Apple Music'), 'play my jazz playlist'), false);
  assert.equal(userAsked(btn('Join Apple Music'), 'join apple music'), true);
  assert.equal(userAsked(btn('Start Free Trial'), 'start a free trial of the app'), true);
  assert.equal(userAsked(btn('Get'), 'install Slack from the App Store'), true);
  assert.equal(userAsked(btn('Get'), 'open the App Store'), false);
  assert.equal(userAsked(btn('Upgrade to Pro'), 'upgrade to pro'), true);
});

test('QA amazon-then-apple: an opened link waits until the browser tab is on that site, so the next open cannot overtake it', async () => {
  const tabs = (...urls) => { let i = 0; return async () => ({ url: urls[Math.min(i++, urls.length - 1)] }); };
  const wait = async () => {};
  // Apple is opened while Amazon's tab is still in front: it waits for the Apple tab (www. and subdomains count).
  let seen = 0; const t = tabs('https://www.amazon.com/', 'https://www.amazon.com/', 'https://www.apple.com/');
  assert.equal(await pageStarted('https://apple.com', { tab: async () => { seen++; return t(); }, wait }), true);
  assert.equal(seen, 3);
  assert.equal(await pageStarted('https://amazon.com/s?k=bagels', { tab: tabs('https://smile.amazon.com/x'), wait }), true);
  // Never on that site within the limit: gives up (bounded), and says so.
  assert.equal(await pageStarted('https://apple.com', { tab: tabs('https://www.amazon.com/'), ms: 30, wait: (x) => new Promise((r) => setTimeout(r, x / 10)) }), false);
  // No browser tab to read, or not a web link (music://…): nothing to wait on.
  assert.equal(await pageStarted('https://apple.com', { tab: async () => null, wait }), true);
  let asked = false;
  assert.equal(await pageStarted('music://play', { tab: async () => { asked = true; return null; }, wait }), true);
  assert.equal(asked, false);
});

test('pageStarted: a tab read that hangs (a permission prompt) counts as unreadable at once, never a 4 s block', async () => {
  const t0 = Date.now();
  assert.equal(await pageStarted('https://apple.com', { tab: () => new Promise(() => {}), read: 30, wait: async () => {} }), true);
  assert.ok(Date.now() - t0 < 300);
  assert.equal(await pageStarted('https://apple.com', { tab: async () => { throw new Error('not allowed'); }, wait: async () => {} }), true);
});
