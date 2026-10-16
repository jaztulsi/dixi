// Task → URL memory (ported from SiteCacheImpl.swift): "search amazon for keyboards" remembers
// amazon.com, so similar tasks can start there. `storage` is localStorage in the app, a Map in tests.

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'have', 'has', 'had', 'not',
  'but', 'can', 'will', 'just', 'about', 'into', 'some', 'them', 'then', 'than', 'find', 'search', 'look', 'show',
  'get', 'give', 'tell', 'please', 'want', 'need', 'would', 'could', 'should',
  // Generic UI words: "the search box on this page" once sent a YouTube search to Wikipedia.
  'page', 'box', 'bar', 'input', 'field', 'button', 'result', 'results', 'click', 'into', 'any', 'stop', 'use',
  'site', 'website', 'open', 'show', 'link', 'one', 'first', 'second', 'top', 'user', 'said']);
const KEY = 'runic.siteCache.urlHistory';
const MAX_PER_KEYWORD = 5;

export const keywords = (task) => task.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

export class SiteCache {
  constructor(storage) {
    this.storage = storage;
    try { this.history = JSON.parse(storage.getItem(KEY) ?? '{}'); } catch { this.history = {}; }
  }

  directURL(task) {
    for (const k of keywords(task)) if (this.history[k]?.[0]) return this.history[k][0];
    return null;
  }

  recordVisit(task, url) {
    if (!url || url === 'about:blank') return;
    for (const k of keywords(task)) {
      this.history[k] = [url, ...(this.history[k] ?? []).filter((u) => u !== url)].slice(0, MAX_PER_KEYWORD);
    }
    try { this.storage.setItem(KEY, JSON.stringify(this.history)); } catch {}
  }
}
