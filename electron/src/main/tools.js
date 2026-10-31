// The tool registry: every capability is a tool you add here, not an `if` in run(). A tool can be found
// two ways: by what was said (match: fast, in code, no AI) and by the agent model (input_schema: it can call
// the tool itself). Calls go through one place, so every tool gets the same two things: a time limit, and a
// log line with how long it took. Tools act directly (no ask-first step); a tool that changes files records
// what it did in undo.js so it can be reversed.
//
// A tool: {
//   name: 'find_files'                       lower_snake, unique
//   description: 'Find files by …'           for the model and the "what can you do" list
//   match?(text, ctx) → args | null          what was said → arguments; sync, no AI
//   input_schema?: { type: 'object', … }     the agent may call it (JSON Schema)
//   run(args, deps) → { say, title, text, data }
//   priority?: number                         higher is matched first (default 0)
//   timeoutMs?: number                        default 60 s
//   cacheMs?: number                          the same args again within this long → the last answer, no work
//   source?: 'builtin' | 'mcp:<server>'
// }

const NAME = /^[a-z][a-z0-9_]{1,63}$/;

export function createRegistry({ log = () => {}, now = () => performance.now() } = {}) {
  const tools = new Map();
  const cache = new Map();   // ponytail: unbounded until a tool with many distinct args sets cacheMs; then an LRU
  let order = [];
  const sort = () => { order = [...tools.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)); };
  const reg = {
    add(tool) {
      if (!NAME.test(tool?.name ?? '')) throw new Error(`tool name "${tool?.name}" must be lower_snake_case`);
      if (typeof tool.run !== 'function') throw new Error(`tool ${tool.name} has no run()`);
      if (!tool.match && !tool.input_schema) throw new Error(`tool ${tool.name} can't be reached: give it match() or input_schema`);
      if (tools.has(tool.name)) throw new Error(`tool ${tool.name} is already registered`);
      tools.set(tool.name, { description: '', source: 'builtin', ...tool });
      sort();
      return reg;
    },
    remove(name) { const had = tools.delete(name); sort(); return had; },
    get: (name) => tools.get(name) ?? null,
    list: () => order.map(({ name, description, source }) => ({ name, description, source })),
    /** What was said → { tool, args } for the first tool that takes it, or null (the agent decides). */
    route(text, ctx = {}) {
      for (const tool of order) {
        let args = null;
        try { args = tool.match?.(String(text ?? ''), ctx) ?? null; } catch { args = null; }   // one broken matcher never blocks the rest
        if (args) return { tool, args };
      }
      return null;
    },
    /** Runs one tool with a time limit. Never throws. */
    async call(name, args = {}, deps = {}) {
      const tool = tools.get(name);
      if (!tool) return { ok: false, error: `There's no tool called ${name}.`, say: "I can't do that yet." };
      const t0 = now();
      const key = tool.cacheMs ? `${name}\n${JSON.stringify(args)}` : null;
      const hit = key && cache.get(key);
      if (hit && t0 - hit.at < tool.cacheMs) { log({ tool: name, ok: true, cached: true, ms: 0 }); return { ok: true, ...hit.r }; }
      try {
        if (deps.signal?.aborted) return { ok: false, stopped: true, say: '' };
        const r = await within(tool.run(args, deps), tool.timeoutMs ?? 60000, deps.signal);
        log({ tool: name, ok: true, ms: Math.round(now() - t0) });
        if (key) cache.set(key, { at: t0, r });
        return { ok: true, ...r };
      } catch (err) {
        const stopped = deps.signal?.aborted;
        log({ tool: name, ok: false, ms: Math.round(now() - t0), error: String(err?.message ?? err).slice(0, 200) });
        return { ok: false, stopped, error: String(err?.message ?? err).slice(0, 200), say: stopped ? '' : `${tool.failSay ?? "That didn't work"}: ${plainError(err)}` };
      }
    },
    /** The tools the agent model may call itself, as Claude tool definitions. */
    claudeTools: (keep = () => true) => order.filter((t) => t.input_schema && keep(t)).map((t) => ({ name: t.name, description: t.description.slice(0, 1000), input_schema: t.input_schema })),
  };
  return reg;
}

const within = (p, ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('it took too long')), ms);
  const stop = () => { clearTimeout(timer); reject(new Error('stopped')); };
  signal?.addEventListener('abort', stop, { once: true });
  Promise.resolve(p).then((v) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve(v); },
    (e) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(e); });
});
/** An error, in words for a person (no stack traces, no codes). */
export function plainError(err) {
  const m = String(err?.message ?? err ?? '');
  if (/ENOENT/.test(m)) return "that file or app isn't there";
  if (/EACCES|EPERM|not authori[sz]ed|-1743/i.test(m)) return "Dixi doesn't have permission. Check System Settings, Privacy and Security";
  if (/ETIMEDOUT|took too long|timeout/i.test(m)) return 'it took too long';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(m)) return "I couldn't reach the internet";
  return m.replace(/\s+/g, ' ').slice(0, 120) || 'something went wrong';
}
