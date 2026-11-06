// Which spoken requests go to Dixi Everywhere (the whole Mac) instead of Dixi's own browser.
// Shared by the voice loop (here, in the renderer) and main/everywhere.js.

import { splitClauses } from './interpret.js';

// ---- a command's parts, in the order said (main/plan.js plans them; here it decides where they go) ----
// Strong breaks always split; "and" or a comma splits only before a verb (so "salt and pepper" stays whole).
const STRONG = /\s*(?:;|[,.!?]?\s+(?:and then|and after that|after that|afterwards|then)\s+|[.!?]\s+then\s+)\s*/i;
const MORE_VERBS = '(?:rename|move|text|message|send|email|mail|call|create|write|save|copy|delete|quit|lock|empty|remind|schedule|reply|share|print|translate|summari[sz]e|draft)';
const MORE = new RegExp(`\\s*(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?=${MORE_VERBS}\\b)`, 'i');
const tidy = (s) => s.trim().replace(/^(?:and|then|also|please)\s+/i, '').replace(/^[,.;!?\s]+|[,.;!?\s]+$/g, '');

/** "Open Music, search lo-fi and play it; then text Mom I'll be late" → ["Open Music", "search lo-fi", "play it", "text Mom I'll be late"] */
export function split(text) {
  return String(text ?? '').split(STRONG).flatMap((part) => splitClauses(part)).flatMap((c) => c.split(MORE)).map(tidy).filter((c) => c.length > 1);
}

/** "couldn't find that on this page", "you didn't find it", "it's not on this page": what Dixi was doing missed,
 *  so it stops and says so (code only, no model). Not "I couldn't find…" (that asks for help) or a follow-on ask. */
export const MISSED = /^(?:(?:no|nope|hmm|well|oh|ugh),?\s+)?(?:(?:you|it|dixi)\s+)?(?:(?:could(?:n['’]?t| not)|did(?:n['’]?t| not))\s+find\s+(?:it|that|this|them|anything)|(?:it|that)(?:['’]s| is)\s+not\s+(?:on|in)\s+(?:this|the)\s+(?:page|screen|site))(?:\s+(?:on|in)\s+(?:this|the|that)\s+(?:page|screen|site|window|app))?[.!]*$/i;
/** Needs the picture of the screen: not for the planner. */
export const HERE = /\b(?:this|these|here|screen)\b/i;

/** Hard, many-part jobs for your own Claude Code agents. */
export const HIVE = /\b(swarm|(my|your|the) (claude )?team|hand (it|this|that) (off )?to claude|claude code|send (it|this) to claude)\b/i;
/** "Dixi, …" said while another app is in front goes to Everywhere when it's about the screen. */
export const ABOUT_SCREEN = /\b(this|that|here|screen|window|app|explain|how (do|can|to|would)|what('?s| is| does)|where('?s| is| do)|help( me)?|read (this|it|me)|reply|respond|draft|write|type|click|press|fill|summari[sz]e|next( step)?|walk me|show me how|teach|in (chrome|safari|docs|slack|mail|gmail|word|excel|notes|finder|messages|settings|the browser)|my (email|inbox|calendar|desktop|files|downloads)|system|computer|mac|wi-?fi|bluetooth|swarm|team)\b/i;

// Spoken settings and memory, handled by Everywhere from anywhere (even with Dixi's window in front).
export const REMEMBER = /^(?:please\s+)?(?:remember|save|keep|note|hold on to|grab)\s+(?:this|that|it|these|what'?s (?:here|on (?:the |my )?screen))\b/i;
export const RECALL = /^(?:where was i|what was i (?:doing|working on)|what did i (?:ask you to )?(?:remember|save)|what do you remember)\b/i;
export const BACK = /^(?:take me back|go back to (?:it|that|where i was)|open (?:it|that) again)\b/i;
export const CAREFUL_ON = /^(?:(?:please\s+)?(?:ask|check with) me (?:before|first)(?: (?:every|each|any)thing| (?:every|each) (?:step|click|time))?|be careful)\b/i;
export const CAREFUL_OFF = /^(?:you can just do it|(?:you )?don'?t (?:need to )?ask (?:me )?(?:every|each|for everything)|only ask (?:me )?(?:for|about|before) (?:the )?(?:important|big|risky))/i;
export const MIC_OFF = /^(?:stop listening|go to sleep|turn off (?:the |your )?(?:mic|microphone)|mute yourself)\b/i;
export const UNDO = /^(?:undo(?: (?:that|it|this|the last (?:thing|step)))?|that wasn'?t (?:right|what i (?:meant|wanted))|take that back)[.!]?$/i;
// Memory with receipts (main/memory.js) and the typed profile.
/** "remember that I wear size 10", "remember my daughter is Priya". Only about you ("I…", "my…"), so the
 *  screen's "remember this/that" still goes to REMEMBER. Check this one first: REMEMBER matches it too. */
export const FACT = /^(?:please\s+)?(?:remember|don'?t forget)(?:\s+that)?\s+(?:i|my)\b/i;
/** "what do you remember about me" (RECALL matches it too: check this first). "…about my health" reads those. */
export const ABOUT_ME = /^what (?:do|did) you (?:remember|know) about (me|my health)\b/i;
/** "forget that" (the fact you just told me), "forget everything about CVS", "forget everything". Not
 *  "forget it", which means never mind. */
export const FORGET = /^(?:please\s+)?forget\s+(?:that|(?:everything|anything|all)\s+(?:about|on)\s+(.+?)|(everything|all of it))\s*[.!]?$/i;
export const OPEN_PROFILE = /^(?:please\s+)?(?:open|show|edit|change|update)\s+my\s+(?:profile|details|address|personal (?:info|information|details))\b/i;
// The daily brief (main/brief.js): "what's my day", "what's next", "what's on tomorrow".
const TAIL = String.raw`(?:[\s,]+(?:dixi|please))*[\s?.!]*$`;
export const BRIEF = new RegExp(String.raw`^(?:(?:hey|ok(?:ay)?|so)[\s,]+)?(?:good morning|brief me|(?:give me |read me )?(?:my|the|a) (?:daily |morning )?(?:brief(?:ing)?|rundown)|what(?:['’]?s| is) (?:my day(?: look(?:ing)? like)?|on (?:for )?today|on my (?:calendar|schedule|agenda)(?: (?:for )?today)?|(?:the )?plan (?:for )?today)|what (?:do i have|have i got)(?: on)? today|how does my day look)${TAIL}`, 'i');
export const NEXT = new RegExp(String.raw`^(?:what(?:['’]?s| is) (?:next|my next (?:meeting|event|thing|appointment)|coming up)(?: (?:on my calendar|today))?|what do i have next|when(?:['’]?s| is) my next (?:meeting|event|appointment))${TAIL}`, 'i');
export const TOMORROW = new RegExp(String.raw`^(?:what(?:['’]?s| is) (?:on )?(?:my (?:calendar|schedule|agenda) )?(?:for )?tomorrow|what (?:do i have|have i got)(?: on)? tomorrow)${TAIL}`, 'i');
// Skills (main/skills.js): do it once, then "save that as a skill"; replayed with no AI.
export const SKILL_SAVE = /^(?:please\s+)?(?:save|keep|remember) (?:that|this|it) as (?:a |my )?(?:skill|playbook|routine)(?:,?\s+(?:called|named)\s+(.+?))?[.!]?$/i;
export const SKILL_RUN = /^(?:please\s+)?(?:run|do|play|start) (?:my|the) (.+?) (?:skill|playbook)[.!]?$/i;
export const SKILL_LIST = /^(?:(?:what|which) (?:skills|playbooks) (?:do i have|have i (?:got|saved)|do you know)|(?:list|show me|tell me) my (?:skills|playbooks))\b/i;
export const SKILL_DELETE = /^(?:please\s+)?(?:delete|remove|forget) (?:the |my )?(.+?) (?:skill|playbook)[.!]?$/i;
/** "show me my morning mail skill": its steps pointed at and said, and you do the clicking. */
export const SKILL_SHOW = /^(?:please\s+)?(?:show me|walk me through|teach me)(?: how to do)? (?:my |the )?(.+?) (?:skill|playbook)[.!?]?$/i;
// "Tell me when the download finishes" (main/watch.js): Dixi looks every few seconds until it happens.
export const WATCH = /^(?:(?:tell|let|notify|alert|ping) me|let me know)\s+(?:when|once|as soon as|after)\b|^watch (?:for|until)\b|^(?:stop|cancel) watching\b|^(?:are you|what are you|what are we) watching\b/i;
/** Your own files (main/files.js has the final say). Narrow on purpose: "open …" and "find …" also mean a page. */
export const FILE_ASK = /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:(?:find|search for|look for|locate|pull up|get me|open|show me)\s+(?:me\s+)?(?:my|the (?:newest|latest|last))\b.*\b(?:files?|folders?|documents?|docs?|pdfs?|downloads?|screenshots?|photos?|pictures?|spreadsheets?|presentations?|slides|videos?|recordings?)\b|what (?:files? )?did i (?:download|save)\b|(?:show|reveal) (?:it|that|the \w+(?: one)?) in finder\b)/i;
/** Mac-wide verbs, heard while another app is in front (app.js). main/desktop.js has the exact rules, so
 *  loose is fine here: a line it doesn't know goes to the screen assistant, which is right for that app. */
export const DESKTOP_WORDS = /^(?:please |can you |could you )?(?:(?:turn|set|make|put|bring) (?:the )?(?:volume|sound)|volume|louder|quieter|(?:un)?mute|play|pause|resume|skip|next (?:song|track)|previous|go to|visit|browse to|open \S+(?:\.| dot )\S+|move|snap|tile|cent(?:er|re)|maximi[sz]e|set a|start a|timer|alarm|remind me (?:in|to)|what timers|cancel|dark mode|light mode|turn (?:on|off)|switch|toggle|lock|battery|how much battery|am i charging|take a screen|screenshot|wi-?fi|quit|force quit|why is my|is my (?:internet|wi-?fi|battery)|what(?:'s| is) (?:using|my mac)|how much (?:space|storage|memory)|am i running out|when did i last)\b/i;
/** "What did you do today?", "did you send anything?" (main/activity.js): Dixi's own log, no AI. */
export const ACTIVITY = /\b(?:what|which)\s+(?:did|have|had)\s+(?:you|dixi)\s+(?:do|done|click(?:ed)?|press(?:ed)?|type[d]?|open(?:ed)?|touch(?:ed)?|change[d]?|get)\b|\bwhat\s+(?:were|have)\s+you\s+(?:been\s+)?doing\b|\bdid\s+(?:you|dixi)\s+(?:send|pay|buy|purchase|order|delete|click|type|do|press|open)\b|\bwhat\s+happened\s+while\s+i\s+was\s+(?:away|gone|out)\b|\b(?:clear|delete|erase|wipe)\s+(?:my|the|your)\s+(?:activity|activity\s+log)\b|\b(?:show|read)\s+(?:me\s+)?(?:my|the|your)\s+activity\b/i;
/** "Add this to my calendar", "remind me about this tomorrow at 9" (main/calendar.js): read back, then a yes. Check before REMEMBER. */
export const CAL_ADD = /^(?:please\s+)?(?:(?:add|put|save|stick|pop)\s+(?:this|that|it|these)\s+(?:(?:event|appointment|meeting|date)\s+)?(?:to|on|in|into)\s+(?:my\s+|the\s+)?(?:calendar|reminders?)|save\s+(?:this|that)\s+(?:appointment|event|meeting|date)|remind me (?:about|of) (?:this|that)|(?:make|create|set)\s+(?:me\s+)?(?:a\s+)?reminder\s+(?:for|of|about)\s+(?:this|that))\b/i;
export const COMMAND = new RegExp([CAL_ADD, ACTIVITY, WATCH, FILE_ASK, SKILL_SAVE, SKILL_RUN, SKILL_LIST, SKILL_DELETE, SKILL_SHOW, FACT, ABOUT_ME, FORGET, OPEN_PROFILE, BRIEF, NEXT, TOMORROW, REMEMBER, RECALL, BACK, CAREFUL_ON, CAREFUL_OFF, MIC_OFF, UNDO].map((r) => `(?:${r.source})`).join('|'), 'i');
