// Remembered understandings: the same words on the same site again → no AI call. Only parses whose
// steps all succeeded are stored (voice.js), so a wrong understanding is never replayed.

export class ParseCache {
  /** `store` is localStorage-like (null in tests); persists across launches. */
  // v2: v1 could hold parses that sent "go back…" to a site called "back"; it's left unread.
  constructor(store = null, key = 'dixi.parseCache.v2', max = 300) {
    this.store = store; this.key = key; this.max = max;
    try { this.map = new Map(JSON.parse(store?.getItem(key) ?? '[]')); } catch { this.map = new Map(); }
  }
  get(k) { return this.map.get(k) ?? null; }
  set(k, intent) {
    this.map.delete(k);
    this.map.set(k, intent);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    try { this.store?.setItem(this.key, JSON.stringify([...this.map])); } catch {}
  }
  clear() { this.map.clear(); try { this.store?.removeItem(this.key); } catch {} }
}
