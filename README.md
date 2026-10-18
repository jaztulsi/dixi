# Dixi

A hands-free, voice-controlled browser. Say what you want, in your own words and in any order, and Dixi does it while you're still talking: "Dixi, open YouTube, search lofi beats, play the first video, turn it up."

## What's here

| Folder | What |
|---|---|
| [`electron/`](electron/) | The Dixi desktop app (macOS, Windows, Linux). Start here. |
| [`website/`](website/) | The marketing site (Next.js), live at https://dixiai.vercel.app |
| [`branding/`](branding/) | Icons and preview images |
| [`docs/`](docs/) | Planning notes |

## Run the app

```sh
cd electron
npm install
npm start
```

Keys go in `.env` at the repo root (copy `.env.example`): `GROQ_API_KEY` for the AI and `DEEPGRAM_API_KEY` for voice. Only the app's main process reads them; web pages never see them.

## How it stays fast

- **Speech:** Deepgram Flux streams your words about 4 times a second, and the last word lands about 0.2 s after you stop talking.
- **Acting mid-sentence:** each command runs as soon as it's finished being said ("…lofi beats, play the…" starts the search right away). Commands always run in the order you said them.
- **No AI when it isn't needed:** sites, searches, video controls, tabs, ordering and shopping phrasings are understood in code first. An on-device model catches other wordings, and it learns from every AI answer. The AI is the last resort, and it never asks you to confirm.

## Tests

```sh
cd electron
npm test                                   # unit tests
npm run test:e2e                           # the real app with live speech, AI and websites
npx playwright test test/e2e/cases.spec.js # 100 real tasks said the messy way (CASES=1-20 for a slice)
```
