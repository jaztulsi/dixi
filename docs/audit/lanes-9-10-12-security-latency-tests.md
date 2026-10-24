# Audit: lanes 9, 10 and 12 (Electron/security, latency, tests and observability)

This is a read-only audit of tag `dixi-baseline-2026-10-16`. `npm test` reported: 42 tests, 42 passed, 0 failed.

On `<webview>` in Electron 44.7.2, `getURL`, `getTitle`, `isLoading`, `canGoBack` and the zoom getters and setters are synchronous IPC calls (`invokeSync`). `executeJavaScript` is async and makes two hops. `<webview>` has no isolated-world variant of it. The guest's `webContents.executeJavaScriptInIsolatedWorld`, called from the main process, does.

## Electron and security

- **E1 (High, effort S): page content can steer privileged tools.**
  - The agent prompt includes the raw page title and element labels, with no marking that they are untrusted (`agent.js:104-111`, `prompts.js:12-26`).
  - The `evaluate_js` tool runs arbitrary JavaScript in the logged-in partition (`llm.js:29`, `agent.js:210-211`).
  - `navigate`, `new_tab` and `fork_tasks` URLs are unchecked, and `normalizeURL` accepts any `scheme://`, `file://` included (`tabs.js:77`).
- **E2 (High, effort S): the URL poll in `go()` never ends.** `while (sameDoc(getCurrentURL()) !== want) await sleep(50)` has no deadline (`voice.js:539-544`). Redirected, superseded or tab-switched navigations poll sync IPC every 50 ms forever. Speculative search creates one of these per word.
- **E3 (High, effort S): a hung or crashed tab blocks everything.**
  - `executeJS` has no timeout (`tabs.js:170-179`).
  - There are no `render-process-gone`, `unresponsive`, `did-fail-load` or `unhandledRejection` handlers.
  - All work runs through one serial queue, so a page `alert()`, a crashed tab or a missing dom-ready stalls every later command.
- **E4 (Medium, effort S): no navigation or popup guards.** There are no `will-navigate`, `setWindowOpenHandler`, `will-attach-webview` or `web-contents-created` handlers. With `allowpopups` on, popup windows are not tracked as tabs.
- **E5 (Medium, effort S): IPC handlers don't check the sender** (`main.js:122-147`).
  - `tab:screenshot` will capture any webContents id it is given.
  - `groq:chat` forwards any request body up to 1.5 MB.
- **E6 (Medium, effort M): page scripts run in the page's own world.** The page can read or spoof `window.__dixi_elements` and `__dixi_mo_changed`, override `Element.prototype.click`, and detect the automation (`tabs.js:22,58-63`).
- **E7 (Medium, effort S): hidden tabs run at full speed.** Background throttling is disabled app-wide (`main.js:18-20`), so a YouTube tab keeps playing after "new tab".
- **E8 (Medium, effort M): no packaging config.** There is no Info.plist, no mic usage string or audio-input entitlement, and no `CFBundleURLTypes` for `dixi://`.
- **E9 (Low, effort S): the legacy data migration is slow and doubles disk use.** It copies the whole folder synchronously before the app is ready.
- **E10 (Low, effort S): minor issues.**
  - The `media` permission is granted to any `file://` page, camera included.
  - The SiteCache has no size cap.
  - A deep link can be lost while the window is still loading.

## Latency

- **L1 (High, effort S): load and settle waits often use the full 10 s.**
  - `waitUntilSettled` needs two quiet readings 150 ms apart, which busy pages never give.
  - `isLoading` counts subframes.
  - `domReady` resolves only once per tab.
  - Fixed sleeps of 100 and 300 ms.
- **L2 (High, effort M): calls are serial with no streaming.** One intent call, then a wait for load, then an agent step (about 1.85k tokens in), then the action, then another wait, then often another step just to say "done".
- **L3 (Medium, effort S): the free tier runs out fast.**
  - An agent step is about 1.85k tokens: about 373 for the system prompt, 727 for the tools and 747 for the page snapshot.
  - At 8k tokens a minute, that's about 4 agent steps a minute.
  - `fork_tasks` can fan out to up to 50 requests.
- **L4 (Medium, effort S): page questions use gpt-oss-120b first, without streaming.** Speech only starts after the full JSON arrives.
- **L5 (Medium, effort S): site actions wait 3-10 s, then give up with a vague message** ("Couldn't find that on this page"), with no handoff.
- **L6 (Medium, effort S): synchronous IPC in hot loops.** The URL is polled every 50 ms, loading state every 150 ms, and each render makes about 4 sync calls, about 4 times a second, on the same thread that relays mic audio.
- **L7 (Low, effort S): cold connections and no prompt caching.** The task text sits at the top of the agent prompt, so the cacheable prefix changes on every call, and the tool schemas are resent every step.
- **L8 (Low, effort S): "stop" can't cancel calls already in flight.** No abort signal reaches the API calls, which only time out after 120 s. Rate-limit sleeps can reach 2×30 s, and sub-agents ignore stop.

**Static latency model of the baseline:**

| Path | Overhead after end of speech |
|---|---|
| Open a known site | About 0, because it acts on interim results before the user finishes. Unknown sites wait 0.5 s, then go to an unchecked guessed URL. |
| Search a known site | About 0.4 s (speculative). A site with no search URL template takes 2.5-5 s plus two page loads (agent). |
| Open a site and play the first video | 12-25 page-script calls and about 20 sync IPC calls a second. The queue stays blocked for up to 10 s. |
| Order at a restaurant | 6-20 s when it works, 28 s or more when it fails. |
| Question about the page | 1.5-4.5 s to the first spoken word. |

## Tests and observability

- **T1 (High):** the end-to-end tests run only against live sites and APIs, with no fixtures, so they are flaky (bot walls, a checkpoint page, a crash at case 25).
- **T2 (High):** tests assert on the app's own claims. `done(/cart/i)` matches the app's plan label, and `answer(/./)` passes on any text.
- **T3 (High):** tests encode sites and phrases, in `tasks.test.js`, `siteActions.test.js`, `text.test.js`, `agents.test.js` and `cases.js`.
- **T4 (Medium):** the unit voice tests drive Deepgram v1 `Results`, not Flux `TurnInfo`.
- **T5 (Medium):** there are no tests for `main.js`, `deepgram.js`, `tabs.js`, the mic or the speaker, and no latency or security tests.
- **T6 (High):** there is no tracing: no transcripts, parsed intents, model latency or tokens, DOM size or stage timings.

## Suspects checked and ruled out

- **Audio IPC payload:** 32 KB/s, which is negligible.
- **The Groq IPC hop:** about 1 ms. Its real cost is that requests can't be aborted.
- **Full-DOM dumps:** extraction is viewport-only, capped at 50 elements.
- **MutationObserver CPU:** low.
- **Main-window isolation:** contextIsolation, sandbox and nodeIntegration are all correct.
- **Keys:** they never reach the renderer.
- **CSP:** present.
- **Deep links:** they only prefill the input box.
- **Memory caps:** the logs, history and caches are bounded.
