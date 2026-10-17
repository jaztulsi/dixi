// Answers questions about the page you're on ("who made this video, and how many subscribers?")
// from the page's own text. No navigation, no clicks: a playing video keeps playing. The model sees
// only that text, must quote it, and the quote is checked against the page (ported from PageQA.swift).

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
  let out = head;
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

export async function askPage(question, { tabs, llm, models }) {
  const source = await tabs.getTitle();
  const full = String(await tabs.executeJS(PAGE_TEXT_JS) ?? '');
  const page = relevantText(full, question);
  if (page.startsWith('JS error') || page.length <= 40) {
    return { text: "I can't read this page's text, so I can't answer that.", quote: null, source, grounded: false };
  }
  const user = `Question: ${question}\n<page url="${tabs.getCurrentURL()}">\n${page}\n</page>`;
  const raw = await llm.json(PAGE_QA_PROMPT, user, models, 700);
  let reply;
  try { reply = JSON.parse(raw); } catch { reply = null; }
  if (!reply?.answer) return { text: "I couldn't get an answer right now. Try again in a moment.", quote: null, source, grounded: false };

  const verified = reply.found === true && quoteIsOnPage(reply.quote, page);
  if (reply.found && !verified) {
    return { text: `${reply.answer} (I couldn't verify that on the page.)`, quote: null, source, grounded: false };
  }
  return { text: reply.answer, quote: verified ? reply.quote.trim() : null, source, grounded: verified };
}
