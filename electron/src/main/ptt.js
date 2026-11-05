// A1 push-to-talk, the main-process side: Esc is a global key only while a ⌥Space session is open, and is
// released on every way out (send, cancel, silence, the cap); and who probably holds a taken hotkey.

export function pttSession({ register, unregister, onEsc }) {
  let open = false;
  return {
    get open() { return open; },
    start() { if (!open) { open = true; register('Escape', onEsc); } },
    end() { if (open) { open = false; unregister('Escape'); } },
  };
}

// ⌥Space is a common launcher key. Read-only `ps -axco comm=` output shows which of these is running.
const LAUNCHERS = ['Raycast', 'Alfred', 'ChatGPT', 'Claude'];
export const hotkeyOwner = (ps) => LAUNCHERS.find((n) => String(ps).split('\n').some((l) => l.trim() === n)) ?? null;
