// Dixi's own capabilities as registry tools (tools.js). Each wraps a module that already exists; the
// module still does the work. deps come from everywhere.js at call time: say, approve, key,
// screens, webAnswer, signal, index (index.js), ask (ask.js).
import { fileIntent, fileAction } from './files.js';
import { desktopIntent, runDesktop, exec as desktopExec } from './desktop.js';
import { quickIntent, quickAnswer } from './quick.js';
import { doctorIntent, diagnose } from './doctor.js';
import { tutorIntent } from './tutor.js';
import { answerFrom } from './index.js';

export const BUILTIN_TOOLS = [
  {
    name: 'find_files', priority: 50, source: 'builtin',
    description: 'Find, open, reveal, move or rename the user’s own files with Spotlight (no delete). Use for “find my tax PDF from March”, “open the newest download”.',
    // "open it" / "the second one" only means a file right after a list of files.
    match: (t, ctx = {}) => { const fi = fileIntent(t); return fi && (fi.verb === 'find' || fi.query || fi.kind || fi.src || Date.now() - (ctx.filesAt ?? 0) < 300000) ? fi : null; },
    input_schema: { type: 'object', additionalProperties: false, required: ['query'], properties: {
      query: { type: 'string', description: 'Words in the file name' },
      kind: { type: 'string', enum: ['pdf', 'image', 'spreadsheet', 'document', 'slides', 'video', 'audio', 'folder'] },
      when: { type: 'string', description: 'today, yesterday, this week, last week, this month, last year, or a month name' } } },
    run: async (a, d) => {
      const intent = a.verb ? a : { verb: 'find', query: a.query ?? '', kind: a.kind ?? null, when: a.when ?? null, index: 0, src: null };
      const r = await fileAction(intent, null, { approve: d.approve, say: d.say ?? (() => {}), undo: d.undo });
      return { title: r.title, text: r.text, data: r.results, filesFound: Boolean(r.results) };
    },
  },
  {
    name: 'mac_control', priority: 40, source: 'builtin',
    description: 'The Mac itself, with no AI: volume, music, open a website, window layout, timers and reminders, dark mode, lock, battery, screenshot, Wi-Fi, quit an app.',
    match: (t, ctx = {}) => (ctx.forced ? null : desktopIntent(t)),
    run: async (intent, d) => runDesktop(intent, { exec: desktopExec, say: d.say, approve: d.approve, key: d.key, screens: d.screens }),
  },
  {
    name: 'mac_checkup', priority: 39, source: 'builtin',
    description: 'Read-only health check: why the Mac is slow, storage, battery health, Wi-Fi trouble.',
    match: (t, ctx = {}) => (ctx.forced ? null : doctorIntent(t)),
    run: async (intent) => ({ ...(await diagnose(intent, {})), linger: 12000 }),
  },
  {
    name: 'quick_answer', priority: 10, source: 'builtin',
    description: 'Instant answers in code: the time anywhere, dates, days until, math, unit conversions, spelling; live questions (weather, news, scores) through web search.',
    match: (t) => (quickIntent(t) ? { question: t } : null),
    input_schema: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string' } } },
    run: async ({ question }, d) => (await quickAnswer(question, { webAnswer: d.webAnswer })) ?? { say: "I don't know that one.", title: 'Dixi', text: '' },
    timeoutMs: 20000,
    cacheMs: 120000,   // "what's the weather" twice in a row: one web lookup
  },
  {
    name: 'personal_memory', priority: 20, source: 'builtin',
    description: 'Answers questions about the user’s own files, notes, mail, past requests and conversations, from the local index, with sources. Says it doesn’t know when nothing there answers it.',
    // A question about your own things ("when is my dentist appointment", "what did Priya say about the demo").
    // Not about what's on screen ("this", "here"): that's the screen path. Where nothing in the index answers
    // it and you didn't name your files, it passes, and the next path tries.
    match: (t) => {
      const s = t.trim();
      const named = /\b(?:in|from|on|through) my (?:files?|notes?|e-?mails?|mail|inbox|documents?|docs|messages|downloads|desktop)\b/i.test(s);
      const own = /^(?:what|when|where|who|whom|which|how|did|do|does|is|was|were|have|has|had|can you find)\b/i.test(s) && /\b(?:my|mine|i|me)\b/i.test(s) && !/\b(?:this|that|these|those|here|screen|page|window|tab)\b/i.test(s);
      return named || own ? { question: s, named } : null;
    },
    input_schema: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string', description: 'The question, in the user’s words' } } },
    run: async ({ question, named = true }, d) => {
      const a = await answerFrom(d.index, question, { ask: d.ask });
      if (!a.known && !named) return { pass: true };
      return { say: a.say, title: a.known ? 'From your things' : 'Not found', text: a.say, sources: a.sources.map(({ n, title, uri, kind, text, confidence }) => ({ n, title, uri, kind, text: text.slice(0, 300), confidence })) };
    },
    timeoutMs: 15000,
  },
  {
    name: 'teach', priority: 60, source: 'builtin',
    description: 'A live lesson in any app: points at each step and waits for the user to do it.',
    match: (t) => { const goal = tutorIntent(t); return goal ? { goal } : null; },
    run: async ({ goal }, d) => d.teach(goal),   // everywhere.js owns the lesson (it needs the screen and the overlay)
    timeoutMs: 16 * 60000,
  },
];
