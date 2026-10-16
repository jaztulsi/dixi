// Inline SVGs standing in for the SF Symbols the Swift app uses (stroke icons, currentColor).
const svg = (body, { fill = false, vb = 24 } = {}) =>
  `<svg viewBox="0 0 ${vb} ${vb}" width="1em" height="1em" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const icons = {
  waveform: svg('<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 6v12M23 11v2"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  micFill: svg('<rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  micSlash: svg('<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 9.3V5a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.6 5.2M19 11a7 7 0 0 1-.6 2.8M12 18v4"/>'),
  arrowUp: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>', { fill: true }),
  chevronLeft: svg('<path d="M15 18l-6-6 6-6"/>'),
  chevronDown: svg('<path d="M6 9l6 6 6-6"/>'),
  ellipsis: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', { fill: true }),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', { fill: false }),
  quote: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>'),
  seal: svg('<path d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1 3 1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1L2.7 15.5l1-3-1-3 2.8-1.6.9-3.1 3.2.3Z" fill="currentColor"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke="#fff"/>'),
  warning: svg('<path d="M12 3l10 18H2Z"/><path d="M12 10v5M12 18h.01"/>'),
  turnRight: svg('<path d="M4 4v7a4 4 0 0 0 4 4h12M15 10l5 5-5 5"/>'),
  check: svg('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2.2"/>'),
  xmark: svg('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.2"/>'),
  play: svg('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M10 8l6 4-6 4Z" fill="#fff" stroke="none"/>'),
  brain: svg('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1ZM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>'),
  dot: svg('<circle cx="12" cy="12" r="5"/>', { fill: true }),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  safari: svg('<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3Z"/>'),
  chevronRight: svg('<path d="M9 18l6-6-6-6"/>'),
};
