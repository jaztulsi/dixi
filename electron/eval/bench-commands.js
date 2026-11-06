// The bench's command set (npm run bench, eval/plan-ab.mjs): the recorded planner commands plus these.
// Mac-wide ⌥Space commands (user directive Nov 5): open app, switch window, type, volume, timer, find a file, read the screen, X and Y.
export const CODE_ONLY = ['open Notes', 'open Calendar', 'switch to Safari', 'type hello world', 'turn the volume down', 'mute',
  'set a timer for 5 minutes', 'find my resume', "what's on my screen", 'open Notes and start a new note'];
export const A3 = ['search lo-fi beats on Apple Music', 'buy a bagel from Safeway', "couldn't find that on this page"];
export const benchCommands = (fixtures) => [...new Set([...Object.keys(fixtures), ...CODE_ONLY, ...A3])];
