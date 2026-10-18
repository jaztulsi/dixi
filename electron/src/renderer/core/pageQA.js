// Answers spoken questions. About the page you're on ("how many subscribers?"): from the page's own
// text, quoted, and the quote is checked against the page. Anything else ("features of the iPhone 18
// Pro?"): from the model's general knowledge, labelled so. No navigation, no clicks.

import { PAGE_QA_PROMPT } from './prompts.js';

/** innerText skips hidden elements (also keeps hidden prompt-injection text out). The main content
 *  region first (any site: <main>, role=main, <article>), else the whole body. */
export const PAGE_TEXT_JS = `(() => {
  const focus = document.querySelector('main') || document.querySelector('[role=main]')
    || document.querySelector('article') || document.body;
  const meta = document.querySelector('meta[name="description"]')?.content || '';
  return ('TITLE: ' + document.title + '\\nDESCRIPTION: ' + meta + '\\n\\n' + (focus.innerText || '')).replace(/\\n{3,}/g, '\\n\\n').slice(0, 300000);
})()`;

const STOP = new Set(['what', 'does', 'this', 'that', 'page', 'say', 'about', 'the', 'a', 'an', 'is', 'are', 'how', 'who', 'many', 'much', 'of', 'in', 'on', 'for', 'to', 'it', 'its', 'do', 'tell', 'me', 'and', 'or', 'was', 'were', 'which', 'when', 'where', 'why', 'there', 'they', 'have', 'has']);
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
/** The start of the page plus the paragraphs that mention the question's words, within ~7k chars. */
export function relevantText(page, question, budget = 7000) {
  if (page.length <= budget) return page;
  const want = new Set(words(question).map((w) => w.replace(/s$/, '')));
  const paras = page.split(/\n+/).map((t, i) => ({ t, i }));
  const head = page.slice(0, 1500);
  const scored = paras.map((p) => ({ ...p, s: words(p.t).filter((w) => want.has(w.replace(/s$/, ''))).length })).filter((p) => p.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  // A price, rating or count question names none of the page's words ("how much do these cost" vs
  // "$249.00"): the page's own headings and the lines carrying those figures go in first.
  const figures = /\b(how much|cost|price|pay|expensive|cheap|total|rating|rated|stars?|reviews?|how many)\b/i.test(question)
    ? paras.filter((p) => /[$€£¥]\s?\d|\d\s?(out of 5|stars?)|\b(total|subtotal|rating|reviews?)\b/i.test(p.t) && p.t.length < 300).slice(0, 40) : [];
  let out = head;
  for (const p of figures) { if (out.length + p.t.length > budget * 0.6) break; if (!out.includes(p.t)) out += `\n${p.t}`; }
  for (const p of scored) {
    if (out.length + p.t.length > budget) continue;
    out += `\n…\n${p.t}`;
  }
  return out;
}

const normalized = (s) => s.toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/** Grounding check in code, not trust: does the quote actually appear in the page text? */
export function quoteIsOnPage(quote, page) {
  return Boolean(quote?.trim()) && normalized(page).includes(normalized(quote));
}

export async function askPage(question, { tabs, llm, models, webAnswer = globalThis.window?.dixi?.webAnswer }) {
  const source = await tabs.getTitle();
  const onPage = /^https?:/.test(tabs.getCurrentURL());
  const full = onPage ? String(await tabs.executeJS(PAGE_TEXT_JS) ?? '') : '';
  const page = full.startsWith('JS error') ? '' : relevantText(full, question);
  // The page when it has the answer (freshest: this product, this video); else general knowledge.
  const user = page.length > 40 ? `Question: ${question}\n<page url="${tabs.getCurrentURL()}">\n${page}\n</page>` : `Question: ${question}\n(no page text)`;
  const raw = await llm.json(PAGE_QA_PROMPT.replace('{today}', new Date().toDateString()), user, models, 500, { hedgeMs: 1500 });
  let reply;
  try { reply = JSON.parse(raw); } catch { reply = null; }
  const verified = reply?.found === true && quoteIsOnPage(reply.quote, page);
  if (verified) return { text: reply.answer, quote: reply.quote.trim(), source, grounded: true };
  // Something recent the page doesn't cover: the model's memory is out of date, so search the web.
  if (TIMELY.test(question) && webAnswer) {
    const web = await webAnswer(question).catch(() => null);
    if (web) return { text: web, quote: null, source, grounded: false, web: true };
  }
  if (!reply?.answer) return { text: 'The AI service is busy (rate limit). Ask me again in a few seconds.', quote: null, source, grounded: false, failed: true };
  return { text: reply.answer, quote: null, source, grounded: false, general: true };
}
const TIMELY = /\b(latest|newest|new|recent|recently|current|currently|today|tonight|tomorrow|yesterday|this (week|month|year)|right now|now|upcoming|release[sd]?|launch(ed)?|announce[sd]?|price|prices|cost|score|news|weather|open now|hours|20\d\d)\b/i;
