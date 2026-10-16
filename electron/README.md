# Dixi for desktop (Electron)

Dixi on macOS, Windows and Linux: always-on voice with the "Dixi" wake word,
actions while you're still talking, instant site actions (play the Nth video, skip ad, add to cart),
grounded answers about the current page, and a tool-calling browser agent.

## Run

```sh
cd electron
npm install
npm start
```

Keys come from `.env` at the repo root: `GROQ_API_KEY`, `DEEPGRAM_API_KEY`,
optional `AGENT_MODEL` / `VOICE_MODEL`. They are read only by the main process; the window never sees them.

## Test

```sh
npm test          # 34 unit tests: parsing, site actions, model fallback, agent loop, voice flows
npm run test:e2e  # 7 end-to-end tests against the real app, live Groq + Deepgram, real websites
```

The voice end-to-end test plays `test/e2e/fixtures/voice-youtube-lofi.wav` as the microphone
(`DIXI_FAKE_AUDIO`), so the whole mic → Deepgram → wake word → navigate + search path runs for real.

## Layout

| Path | What |
|---|---|
| `src/main/` | Window, `dixi://` links, mic permission, Groq + Deepgram calls (keys live here) |
| `src/preload/preload.cjs` | The only bridge to the UI; no keys cross it |
| `src/renderer/core/` | Agents and logic, UI-free and unit-tested: `voice.js`, `agent.js`, `llm.js`, `siteActions.js`, `pageQA.js`, `text.js`, prompts generated from the Swift source |
| `src/renderer/ui/` | Tabs (`<webview>`), mic (AudioWorklet → 16 kHz PCM), speaker (speech synthesis), icons |
| `src/renderer/app.js`, `index.html`, `styles.css` | The UI, matching the SwiftUI screens |
