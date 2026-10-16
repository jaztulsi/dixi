# Runic

An AI-native browser for iOS and macOS. Runic wraps a multi-tab WebKit browser around two agents: a voice agent that acts while you are still speaking, and a browser agent that clicks, types and navigates the web to complete tasks on its own.

Built with SwiftUI. Deployment target: iOS 26.2 / macOS 26.2.

## Features

### Voice agent: faster than finishing your sentence

Hands-free: Runic starts listening when it opens and never needs a button. Start a command with **"Runic"** ("Runic, open YouTube and search for lofi beats"); for 8 seconds after it acts, follow-ups like "click the second one" work without it. Everything else (TV, conversation) is ignored without an AI call. The wake word can be turned off in Settings. Audio streams to Deepgram (`nova-2`) for live transcription, and actions dispatch before you stop talking:

1. Interim transcript: instant navigation to known sites via a regex fast path, no LLM call
2. Interim text unchanged for 300 ms: an LLM on Groq (`openai/gpt-oss-20b`) decides whether the partial command is already actionable
3. Final transcript: the LLM catches anything not yet dispatched

Only parts you have already moved past ("open amazon **and** ...") run early; the last part waits until you finish speaking, so "add a bean burrito" is not cut into "bean" and "burrito". After each command the mic stays open for the next one, and it reconnects on its own if the connection drops. A rolling session context (last 20 actions) is fed into each LLM call, so follow-ups like "open the second one" resolve against what just happened.

### Browser agent: autonomous task completion

A tool-calling LLM loop (up to 15 steps per task) that operates the browser like a user would. Interactive elements (buttons, links, inputs) are extracted from the DOM with bounding boxes and indexed, and the agent acts through a fixed tool set:

| Tool | What it does |
|------|--------------|
| `click` | Tap an indexed element |
| `type_text` | Fill an input, optionally press Enter |
| `scroll` | Scroll the page up or down |
| `navigate` / `go_back` | URL navigation |
| `new_tab` / `switch_tab` | Multi-tab control |
| `wait` | Pause for slow pages |
| `evaluate_js` | Run JavaScript directly |
| `fork_tasks` | Spawn parallel subtasks, each in its own tab (e.g. compare prices on three sites at once) |
| `done` | Finish and report a summary |

Forked sub-agents get a reduced tool set (no `fork_tasks`, `new_tab` or `switch_tab`) to prevent recursion and tab conflicts. When the agent looks stuck, a screenshot of the page is attached to the next turn.

Built-in platform shortcuts send obvious tasks straight to search pages on YouTube, Amazon, Reddit, GitHub, Wikipedia and others instead of detouring through Google. A site cache remembers which URLs satisfied past tasks and jumps there directly on similar ones. A live agent log shows every thought and action as it happens.

### Models and the free Groq tier

- **Your own key:** with a Groq API key in `.env`, the agent calls Groq's OpenAI-compatible `/chat/completions` directly. The browser agent uses `qwen/qwen3.8-27b` (the Groq model that supports both tool calls and images) and the voice agent uses `openai/gpt-oss-20b`. Override either with `AGENT_MODEL` / `VOICE_MODEL` in `.env`.
- The free tier allows about 8k tokens per minute per model. Each agent step is ~2.7k tokens (trimmed history, capped page snapshot, terse tools). When a model is rate-limited Runic switches to another Groq model with budget left instead of waiting.
- Typed or spoken "go to amazon" opens the site instantly with no AI call.

### Full browser underneath

- Multi-tab browsing on `WKWebView` with a Safari user agent
- Start page, navigation bar and a unified bottom input bar for typed commands
- Swipe the input bar left or right to switch tabs

## Architecture

```
RunicApp
└── ContentView
    ├── TabManager          WKWebView pool, DOM extraction, screenshots, JS bridge
    ├── BrowserAgent        tool-calling agent loop on Groq, FIFO queue for spoken commands
    │   ├── LLMService      Groq chat completions and tool definitions
    │   └── SiteCache       task-to-URL memory
    └── VoiceAgent          always-on Deepgram streaming and incremental dispatch
        └── SessionContext  rolling action history for LLM hydration
```

Everything is SwiftUI + `@Observable`, with `@MainActor` isolation where it touches WebKit.

## Getting started

### Requirements

- Xcode 26.2+
- A Groq API key (free tier available at https://console.groq.com/keys)
- A Deepgram API key (for the voice agent)

### Setup

1. Clone the repo:
   ```sh
   git clone https://github.com/unixers/runic.git
   cd runic
   ```

2. Create a `.env` file in the repo root (next to this README):
   ```sh
   cp .env.example .env
   ```
   Then paste your keys after the `=` signs:
   ```
   GROQ_API_KEY=gsk_...
   DEEPGRAM_API_KEY=...
   ```
   `.env` is gitignored, so your keys stay out of version control. A build step copies it into the app, where `Secrets.swift` reads it. Rebuild after changing keys. Note that the keys ship inside the app bundle.

3. Open `Runic.xcodeproj` in Xcode and run.

Everything is free: there are no accounts, subscriptions or servers besides Groq and Deepgram.

### Usage

- Type a task in the bottom input bar ("find the cheapest flight from SFO to Tokyo in November") and tap the status line to watch the agent work in the live log.
- Just talk, starting with "Runic"; the mic is on from launch (the mic button pauses it). A live caption shows what Runic hears and what it is doing. Commands dispatch as you talk: "Open YouTube and search for..." starts navigating before you finish the sentence.
- Parallel tasks: ask for comparisons ("compare this laptop's price on Amazon and eBay") and the agent can fork subtasks across tabs.

## Project layout

| Folder | What's in it |
|--------|--------------|
| `.env` | Your API keys (create from `.env.example`) |
| `Runic/App/` | App entry point, main browser screen, shared models |
| `Runic/Agents/` | Browser agent, voice agent, task classifier (not wired in yet) |
| `Runic/Browser/` | WebKit tabs, JS bridge, site cache |
| `Runic/Services/` | Groq client, secrets loader |
| `Runic/Views/` | SwiftUI screens and components |
| `Runic/Resources/` | Assets, app icon, entitlements |
| `branding/` | App Store preview images (not shipped in the app) |

## Known limitations

- No automated tests yet.
- `OnDeviceClassifier` is not called anywhere, and it classifies with keyword heuristics. It does not use FoundationModels yet.
- The Xcode project is tied to the original developer's signing team. To build for your own Mac or iPhone, pick your team under Signing & Capabilities.

## License

All rights reserved.
