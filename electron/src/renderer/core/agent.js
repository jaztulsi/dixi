// The browser agent (ported from BrowserAgent.swift): a tool-calling loop over the live page's
// indexed interactive elements. UI-free; talks to tabs/llm through injected objects.

import { agentSystemPrompt, subAgentSystemPrompt } from './prompts.js';
import { SUB_AGENT_TOOLS } from './llm.js';

const MAX_SHOWN = 50;

/** Page snapshot is the biggest part of every request, so cap count and label length. */
export function compactElementList(elements) {
  const shown = elements.slice(0, MAX_SHOWN).map((e) => `[${e.index}] <${e.tag}> '${label(e).slice(0, 50)}'`);
  const more = elements.length > MAX_SHOWN ? `\n(${elements.length - MAX_SHOWN} more below; scroll to see them)` : '';
  return shown.join('\n') + more;
}

export function label(e) {
  const raw = e.text || e.placeholder || e.id || e.href || '';
  return raw ? raw.slice(0, 60) : '(no label)';
}

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return url; } };
const parse = (json) => { try { return JSON.parse(json); } catch { return null; } };

export function friendlyAction(name, args, elements) {
  switch (name) {
    case 'click': return elements[args?.elementIndex] ? `Clicking "${label(elements[args.elementIndex]).slice(0, 40)}"` : 'Clicking element...';
    case 'type_text': return args ? `Typing "${String(args.text).slice(0, 30)}"${args.pressEnter ? ' + Enter' : ''}` : 'Typing text...';
    case 'scroll': return `Scrolling ${args?.direction ?? ''}...`;
    case 'navigate': return `Going to ${hostOf(args?.url ?? '').slice(0, 40)}`;
    case 'wait': return 'Waiting for page...';
    case 'new_tab': return `Opening ${hostOf(args?.url ?? '').slice(0, 40)} in new tab`;
    case 'switch_tab': return 'Switching tab...';
    case 'go_back': return 'Going back...';
    case 'evaluate_js': return 'Reading page data...';
    case 'fork_tasks': return `Forking ${args?.tasks?.length ?? ''} parallel tasks...`;
    case 'done': return 'Done';
    default: return name;
  }
}

export class BrowserAgent {
  constructor({ tabs, llm, siteCache = null, onChange = () => {} }) {
    this.tabs = tabs;
    this.llm = llm;
    this.siteCache = siteCache;
    this.onChange = onChange;
    this.maxSteps = 15;
    this.isRunning = false;
    this.currentStep = 0;
    this.statusLine = '';
    this.finalResult = null;
    this.log = [];
    this.recentActions = [];
    this.queueTail = Promise.resolve();
    llm.onRateLimit = (s) => { this.setStatus(`Groq rate limit, waiting ${s}s...`); this.addLog('info', `Groq free-tier rate limit hit, waiting ${s}s`); };
  }

  setStatus(s) { this.statusLine = s; this.onChange(); }
  addLog(kind, message) { this.log.push({ kind, message, time: new Date() }); this.onChange(); }

  /** Runs tasks one after another in the order they were spoken (start() alone drops a busy task). */
  enqueue(task, maxSteps) {
    this.queueTail = this.queueTail.then(() => this.start(task, maxSteps));
    return this.queueTail;
  }

  stop() {
    this.isRunning = false;
    this.setStatus('');
    this.addLog('info', 'Agent stopped by user');
  }

  async start(task, maxSteps = 15) {
    if (this.isRunning) return;
    this.maxSteps = maxSteps;
    if (!this.tabs.activeTab) this.tabs.createTab('about:blank');
    this.isRunning = true;
    this.currentStep = 0;
    this.finalResult = null;
    this.log = [];
    this.recentActions = [];
    this.setStatus(`Starting: ${task}`);
    this.addLog('info', `Starting task: ${task}`);

    const here = this.tabs.getCurrentURL();
    if (here === 'about:blank' || !here) {
      const cached = this.siteCache?.directURL(task);
      if (cached) { this.addLog('action', `Cache → ${hostOf(cached)}`); await this.tabs.navigate(cached); }
    }
    this.siteCache?.recordVisit(task, this.tabs.getCurrentURL());

    try { await this.loop(task); } finally {
      this.isRunning = false;
      this.setStatus('');
    }
  }

  get isStuck() {
    if (this.recentActions.length < 3) return false;
    return this.recentActions.slice(-3).every((a) => a === 'scroll' || a.includes('no element found') || a.includes('Error'));
  }

  async pageContent(includeScreenshot, tabId) {
    const elements = await this.tabs.extractElements(tabId);
    const url = this.tabs.getCurrentURL(tabId);
    const title = await this.tabs.getTitle(tabId);
    const list = compactElementList(elements);
    const lines = [`Current URL: ${url}`, `Page title: ${title}`];
    if (tabId == null) lines.push(`Open tabs: ${this.tabs.tabList()}`);
    const text = `${lines.join('\n')}\n\nInteractive elements:\n${list || '(none found)'}`;
    if (tabId != null) return { content: text, elements };
    const content = [{ type: 'text', text }];
    if (includeScreenshot) {
      const jpeg = await this.tabs.screenshot();
      if (jpeg) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg}`, detail: 'low' } });
    }
    return { content, elements };
  }

  async loop(task) {
    const messages = [{ role: 'system', content: agentSystemPrompt(task, this.maxSteps) }];
    // No-progress guards: same move on the same page 3 times, or 2 API failures in a row, ends it.
    let lastMove = '', sameMove = 0, apiFailures = 0, done = false;

    while (this.currentStep < this.maxSteps && !done && this.isRunning) {
      this.currentStep++;
      this.addLog('info', `Step ${this.currentStep}`);
      const needsScreenshot = this.isStuck;
      if (needsScreenshot) this.addLog('info', 'Agent appears stuck — attaching screenshot');
      const { content, elements } = await this.pageContent(needsScreenshot);
      messages.push({ role: 'user', content });
      this.setStatus('Analyzing page...');
      this.addLog('thinking', 'Thinking...');

      let msg;
      try {
        msg = await this.llm.chat(messages);
        apiFailures = 0;
      } catch (err) {
        this.addLog('error', err.message);
        if (++apiFailures >= 2) { this.setStatus('Stopped: AI unavailable right now'); break; }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      messages.push({ role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
      if (!msg.tool_calls?.length) { if (msg.content) this.addLog('thinking', `Model says: ${msg.content.slice(0, 200)}`); continue; }

      for (const call of msg.tool_calls) {
        const name = call.function.name, argsJSON = call.function.arguments, args = parse(argsJSON);
        this.setStatus(friendlyAction(name, args, elements));
        this.addLog('action', this.statusLine);

        if (name === 'done') {
          this.finalResult = args?.result ?? 'Done';
          this.addLog('success', 'Task complete!');
          this.addLog('info', this.finalResult);
          done = true;
          break;
        }
        const move = `${name}|${argsJSON}|${this.tabs.getCurrentURL()}`;
        sameMove = move === lastMove ? sameMove + 1 : 1;
        lastMove = move;
        if (sameMove >= 3) {
          this.finalResult = "I couldn't get that to work: the same action wasn't changing anything.";
          this.addLog('error', 'Stopping: same action 3 times with no effect');
          done = true;
          break;
        }
        const result = await this.execute(name, args, elements);
        this.addLog('success', result.slice(0, 100));
        this.recentActions.push(result.includes('no element found') || result.includes('Error') ? result : name);
        if (this.recentActions.length > 5) this.recentActions.shift();
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    if (this.currentStep >= this.maxSteps && !done) this.addLog('error', `Reached maximum steps (${this.maxSteps}). Stopping.`);
  }

  async execute(name, args, elements, tabId) {
    if (!args && name !== 'go_back') return `Error: invalid ${name} args`;
    const el = elements[args?.elementIndex];
    switch (name) {
      case 'click':
        if (!el) return `Error: element index ${args.elementIndex} out of range`;
        await this.tabs.click(el, tabId);
        return `Clicked element [${args.elementIndex}] <${el.tag}> '${el.text.slice(0, 40)}'`;
      case 'type_text':
        if (!el) return `Error: element index ${args.elementIndex} out of range`;
        await this.tabs.type(el, args.text, args.pressEnter, tabId);
        return `Typed '${args.text}' into [${args.elementIndex}]${args.pressEnter ? ' and pressed Enter' : ''}`;
      case 'scroll':
        await this.tabs.scroll(args.direction, args.amount, tabId);
        return `Scrolled ${args.direction} by ${Math.round(args.amount)}px`;
      case 'navigate':
        await this.tabs.navigate(args.url, tabId);
        return `Navigated to ${args.url}`;
      case 'wait':
        await this.tabs.waitUntilLoaded(Math.min(args.seconds, 3), tabId);
        return `Waited for page (up to ${Math.min(args.seconds, 3)}s)`;
      case 'new_tab':
        this.tabs.createTab(args.url);
        await this.tabs.waitUntilLoaded();
        return `Opened new tab: ${args.url}`;
      case 'switch_tab':
        return this.tabs.switchToTab(args.tabIndex) ? `Switched to tab ${args.tabIndex}: ${this.tabs.getCurrentURL()}` : `Error: tab index ${args.tabIndex} out of range`;
      case 'go_back':
        await this.tabs.goBack(tabId);
        return 'Navigated back';
      case 'evaluate_js':
        return `JS result:\n${String(await this.tabs.executeJS(args.code, tabId)).slice(0, 2000)}`;
      case 'fork_tasks':
        return this.forkTasks(args.tasks ?? []);
      default:
        return `Unknown action: ${name}`;
    }
  }

  async forkTasks(tasks) {
    if (!tasks.length || tasks.length > 5) return 'Error: provide 1-5 tasks';
    this.addLog('info', `Forking ${tasks.length} sub-agents...`);
    this.setStatus(`Running ${tasks.length} parallel tasks...`);
    const subs = tasks.map((t) => ({ task: t.task, tabId: this.tabs.createBackgroundTab(t.url) }));
    const results = await Promise.all(subs.map((s) => this.runSubAgent(s.task, s.tabId)));
    subs.forEach((s) => this.tabs.closeTab(s.tabId));
    this.addLog('success', `All ${tasks.length} sub-agents completed`);
    return results.map((r, i) => `Sub-task ${i + 1} (${tasks[i].task}):\n${r}`).join('\n\n');
  }

  async runSubAgent(task, tabId) {
    await this.tabs.waitUntilLoaded(10, tabId);
    const messages = [{ role: 'system', content: subAgentSystemPrompt(task) }];
    for (let step = 0; step < 10; step++) {
      const { content, elements } = await this.pageContent(false, tabId);
      messages.push({ role: 'user', content });
      let msg;
      try { msg = await this.llm.chat(messages, SUB_AGENT_TOOLS); } catch (err) { return `Error: ${err.message}`; }
      messages.push({ role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
      for (const call of msg.tool_calls ?? []) {
        const args = parse(call.function.arguments);
        if (call.function.name === 'done') return args?.result ?? 'Done';
        const result = await this.execute(call.function.name, args, elements, tabId);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    return '(sub-agent reached step limit without completing)';
  }
}
