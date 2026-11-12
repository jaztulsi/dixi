// "Add this to my cart", "remove the milk", "open the second one", "make it two", "go to my cart", "go back"…
// said while your browser is in front: done in THAT browser (your sign-ins, your cart), by its page's own
// elements, through the same understanding (renderer/core/interpret.js: rules first, a fast model only for
// what they can't read) and the same tested executor (renderer/core/execute.js) as Dixi's own browser.
// The long tail goes to the page agent (renderer/core/agent.js): a numbered list of the page's elements to a
// fast model, one typed move at a time. No screenshots, no blind clicks, nothing paid unless a model is needed.
import { RealTabs, browserOf } from './realtabs.js';
import { Executor, BOT_PATH } from '../renderer/core/execute.js';
import { BrowserAgent } from '../renderer/core/agent.js';
import { interpret, fastPath, SHOPPING, normName } from '../renderer/core/interpret.js';
import { LLM } from '../renderer/core/llm.js';

// Words that are about the page in front, not the Mac: worth the browser's understanding when a browser is in front.
export const PAGEISH = /\b(this|that|these|those|it|here|there|page|tab|site|cart|bag|basket|checkout|check out|click|press|tap|select|choose|pick|scroll|back|forward|reload|refresh|result|results|link|button|first|second|third|fourth|fifth|last|next|previous|one|quantity|size|color|colour|search for|look for|find|sort|filter|sign in|log in|video|play|pause)\b/i;

/** Is this a command for the page in front? Rules say so outright (learned site names included: "go to target");
 *  otherwise page words or shopping words. */
export function forPage(text, names = null) {
  if (fastPath(text, names ? { names } : {})) return 'rule';
  if (SHOPPING.test(text) || PAGEISH.test(text)) return 'model';
  return null;
}

/**
 * makeBrowse({ bridge, keys, chat, tiers, resolve, registry, host, ask, confirm, log }) → { run, tabsFor }
 *   chat(req) → {status, json}: providers.chat for the models (only reached when rules can't do it)
 *   resolve(q) → the site resolver (main.js); registry: its learned names; host: preconnect/discoverSearch/openSearchTemplate
 *   ask(question, options) → your spoken answer or null; confirm(question) → bool
 */
export function makeBrowse({ bridge, keys = {}, chat, tiers = () => ({}), resolve, registry = null, host = null, ask = async () => null, confirm = async () => false, pointer = null, log = () => {} }) {
  const kits = new Map();   // one tabs/executor per browser app, kept warm
  const llm = new LLM((req) => chat(req), tiers());
  function kitFor(browser) {
    let k = kits.get(browser.app);
    if (k) return k;
    const tabs = new RealTabs({ bridge, browser, keys });
    const executor = new Executor({ tabs, llm, tiers: tiers(), resolve, registry, dixi: host, ask, confirm, trace: (kind, d) => log(`[browse] ${kind} ${JSON.stringify(d)}`) });
    executor.agent = new BrowserAgent({ tabs, llm, executor });
    k = { tabs, executor };
    kits.set(browser.app, k);
    return k;
  }
  const recent = [];
  /**
   * One spoken command for the browser in front. onStep({label, i, n}) as each step starts.
   * → { ok, message, none?, ask?, problem? } — none: not a browser command after all (the Mac router takes it).
   */
  async function run(text, front, { signal, onStep = () => {} } = {}) {
    const browser = browserOf(front);
    if (!browser) return { none: true };
    const { tabs, executor } = kitFor(browser);
    llm.tiers = tiers();
    executor.tiers = llm.tiers;
    await tabs.refresh();
    if (tabs.problem === 'js-off') return { ok: false, problem: 'js-off', message: jsOffHelp(browser) };
    if (tabs.problem === 'automation') return { ok: false, problem: 'automation', message: `Dixi needs permission to control ${browser.app}: System Settings → Privacy & Security → Automation → Dixi → ${browser.app}.` };
    // Sites you've been to by name ("go to target") open without a model.
    const parsed = await interpret(text, { url: tabs.getCurrentURL(), title: tabs.title, recent: recent.slice(-3), names: siteNames() }, { llm, tiers: llm.tiers, signal });
    const intent = parsed.intent;
    if (!intent?.steps?.length) return intent?.clarify ? { ok: false, ask: intent.clarify, message: intent.clarify } : { none: true };
    if (intent.steps.every((s) => s.act === 'none')) return { none: true };
    // A "prove you're human" page in front: nothing is pressed on it (Dixi never solves those checks).
    const leaving = intent.steps[0] && (intent.steps[0].act === 'open' || ((intent.steps[0].act === 'search' || intent.steps[0].act === 'order') && intent.steps[0].said));
    if (!leaving && await walled(tabs)) return { ok: false, wall: true, message: `${tabs.displayURL() || 'This site'} wants you to prove you're human first. Do the check on screen, then say it again.` };
    if (THIS.test(text)) await pointAt(tabs, intent.steps);
    let r = { ok: false, message: "I couldn't do that here" };
    const n = intent.steps.length;
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) return { ok: false, message: 'Stopped', stopped: true };
      const st = intent.steps[i];
      onStep({ label: labelOf(st, text), i, n });
      r = await executor.run(st, text, signal);
      if (tabs.problem === 'js-off') return { ok: false, problem: 'js-off', message: jsOffHelp(browser) };
      if (!r.ok) break;
    }
    recent.push(text);
    if (recent.length > 6) recent.shift();
    return { ok: Boolean(r.ok), message: r.message, answer: r.answer?.text, source: parsed.source, ms: parsed.ms };
  }
  async function walled(tabs) {
    let path = '';
    try { path = new URL(tabs.getCurrentURL()).pathname; } catch {}
    return BOT_PATH.test(path) || (await tabs.dx('botWall')) === true;
  }
  /** "add THIS to my cart" on a list of results, "remove THIS" in a cart: the one under your mouse pointer. */
  async function pointAt(tabs, steps) {
    const p = pointer?.();
    if (!p) return;
    const add = steps.find((st) => st.act === 'add_to_cart' && !st.n && !st.item);
    const rm = steps.find((st) => (st.act === 'remove' || st.act === 'quantity') && !st.item);
    if (!add && !rm) return;
    if (add) {   // only a real result (a search's results, or a product page link): never an ordinary page link
      const n = Number(await tabs.dx('resultAtScreen', p.x, p.y)) || 0;
      const list = n ? await tabs.dx('results') : null;
      const r = Array.isArray(list) ? list[n - 1] : null;
      if (r && (r.q || PRODUCTISH.test(r.href))) add.n = n;
    }
    if (rm) {
      const i = Number(await tabs.dx('lineAtScreen', p.x, p.y)) || 0;
      const lines = i ? await tabs.dx('cartLines') : null;
      const at = Array.isArray(lines) && lines.length > 1 ? lines[i - 1] : null;
      if (at) rm.item = (at.removeName.replace(/^(remove|delete)\s*/i, '').trim() || at.text).split(/\s+/).slice(0, 6).join(' ');
    }
  }
  const siteNames = () => new Set((registry?.entries ?? []).flatMap((e) => [e.name, e.said]).filter(Boolean).map((n) => normName(n)));
  return { run, kitFor, forPage: (text) => forPage(text, siteNames()) };
}

const PRODUCTISH = /\/(?:p|dp|ip|itm|item|items|product|products|prod|pd|gp\/product)\/|prod\.html|product[_-]details|[?&](?:sku|pid|idp_|productid)=/i;
const THIS = /\b(?:this|that|it|this one|that one|these)\b/i;
/** Page code: what's under the pointer (screen point → this window's page point), as {href, text} of its card or line. */
export const underPointer = ({ x, y }) => `(function(){var px=${Number(x)}-screenX-(outerWidth-innerWidth)/2,py=${Number(y)}-screenY-(outerHeight-innerHeight);`
  + `if(px<0||py<0||px>innerWidth||py>innerHeight)return null;`
  // Every layer under the pointer, top first; a fixed/sticky layer (cookie banner, sticky header, chat bubble) is looked through.
  + `var CARD='li,article,tr,[role=listitem],[class*=card],[class*=product],[class*=result],[class*=item],[class*=line],[data-sku],[data-asin]';`
  + `var fixed=function(e){for(var n=e,i=0;n&&n.nodeType===1&&i<12;n=n.parentElement,i++){var p=getComputedStyle(n).position;if(p==='fixed'||p==='sticky')return true}return false};`
  + `var els=document.elementsFromPoint(px,py);for(var i=0;i<els.length;i++){var el=els[i];if(fixed(el))continue;`
  // Only a link or a card/line the pointer is actually on: between products is no product (never a guess).
  + `var card=el.closest(CARD);var a=el.closest('a[href]')||(card&&card.querySelector('a[href]'));if(!a&&!card)return null;`
  + `return {href:a?a.href:'',text:String((card||a).innerText||'').replace(/\\s+/g,' ').trim().slice(0,200)}}return null})()`;

export const jsOffHelp = (b) => (b.kind === 'safari'
  ? 'Turn on Safari → Settings → Advanced → "Show features for web developers", then Develop → "Allow JavaScript from Apple Events", and say it again.'
  : `Turn on ${b.app} → View → Developer → "Allow JavaScript from Apple Events", and say it again.`);

const LABEL = { add_to_cart: 'Add to cart', remove: 'Remove from cart', cart: 'Open the cart', quantity: 'Quantity', checkout: 'Checkout', nth: 'Open the result', order: 'Find and add', find_item: 'Find', search: 'Search', open: 'Open', nav: 'Navigate', scroll: 'Scroll', click: 'Click', media: 'Media', ask_page: 'Read the page' };
function labelOf(st, said) {
  const what = st.item || st.query || st.said || st.value || '';
  return `${LABEL[st.act] ?? st.act}${what ? `: ${String(what).slice(0, 40)}` : ''}`.slice(0, 80) || said.slice(0, 80);
}
