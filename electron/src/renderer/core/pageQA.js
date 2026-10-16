// Answers questions about the page you're on ("who made this video, and how many subscribers?")
// from the page's own text. No navigation, no clicks: a playing video keeps playing. The model sees
// only that text, must quote it, and the quote is checked against the page (ported from PageQA.swift).

import { PAGE_QA_PROMPT } from './prompts.js';

/** innerText skips hidden elements (also keeps hidden prompt-injection text out). YouTube's channel,
 *  subscriber count, views and description all live in ytd-watch-metadata. */
export const PAGE_TEXT_JS = `(() => {
  const focus = document.querySelector('ytd-watch-metadata') || document.querySelector('#above-the-fold')
    || document.querySelector('article') || document.querySelector('main')
    || document.querySelector('[role=main]') || document.body;
  const meta = document.querySelector('meta[name="description"]')?.content || '';
  return ('TITLE: ' + document.title + '\\nDESCRIPTION: ' + meta + '\\n\\n' + (focus.innerText || ''))
    .replace(/\\n{3,}/g, '\\n\\n').slice(0, 7000);
})()`;

const normalized = (s) => s.toLowerCase().split(/\s+/).filter(Boolean).join(' ');

/** Grounding check in code, not trust: does the quote actually appear in the page text? */
export function quoteIsOnPage(quote, page) {
  return Boolean(quote?.trim()) && normalized(page).includes(normalized(quote));
}

export async function askPage(question, { tabs, llm, models }) {
  const source = await tabs.getTitle();
  const page = String(await tabs.executeJS(PAGE_TEXT_JS) ?? '');
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
