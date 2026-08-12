# Runic

An AI-native browser for iOS and macOS. Runic wraps a multi-tab WebKit browser around two agents: a voice agent that acts while you are still speaking, and a browser agent that clicks, types and navigates the web to complete tasks on its own.

Built with SwiftUI and targeting iOS 26 / macOS 26.

## Features

### Voice agent: faster than finishing your sentence

Streams microphone audio to Deepgram for live transcription and dispatches actions incrementally, before you stop talking:

1. Interim transcript: instant navigation to known sites via regex fast-path
2. Interim stable for 300ms: LLM evaluates whether the partial command is already actionable
3. Final transcript: LLM catches anything not yet dispatched

A rolling session context (last 20 actions) is hydrated into each LLM call, so follow-ups like "open the second one" resolve against what just happened.

### Browser agent: autonomous task completion

A tool-calling LLM loop that operates the browser like a user would. The page's interactive elements (buttons, links, inputs) are extracted from the DOM with bounding boxes and indexed, then the agent acts through a fixed tool set:

| Tool | What it does |
|------|--------------|
| `click` | Tap an indexed element |
| `type_text` | Fill an input, optionally press Enter |
| `scroll` | Scroll the page up or down |
| `navigate` / `go_back` | URL navigation |
| `new_tab` / `switch_tab` | Multi-tab control |
| `wait` | Pause for slow pages |
| `evaluate_js` | Run JavaScript directly |
| `fork_tasks` | Spawn parallel subtasks across tabs (e.g. compare prices on three sites at once) |

Built-in platform shortcuts route obvious tasks straight to YouTube, Amazon, Reddit, GitHub and others instead of detouring through Google. A site cache remembers which URLs satisfied past tasks. A live agent log shows every thought and action as it happens.

### On-device task classification

On iOS 26+ devices, Apple's FoundationModels framework classifies task complexity (simple, moderate or complex) on-device to route between fast paths and full agent runs, with no server round-trip. Older devices fall back to sub-millisecond heuristics.

### Full browser underneath

- Multi-tab browsing on `WKWebView` with a Safari user agent
- Start page, navigation bar and a unified bottom input bar for both typed and spoken commands
- Scroll-direction-aware chrome (UI collapses as you scroll)

### Accounts and subscriptions

- Backend auth (register / login) with token persistence
- StoreKit 2 monthly and yearly premium subscriptions with a transaction listener and restore support

## Architecture

```
RunicApp
└── ContentView
    ├── TabManager          WKWebView pool, DOM extraction, JS bridge
    ├── BrowserAgent        tool-calling agent loop (OpenAI-compatible API)
    │   ├── OpenAIService   chat completions and tool definitions
    │   ├── SiteCache       task-to-URL memory
    │   └── BackendService  auth, chat proxy, task history
    ├── VoiceAgent          Deepgram streaming and incremental dispatch
    │   └── SessionContext  rolling action history for LLM hydration
    ├── OnDeviceClassifier  FoundationModels complexity routing
    └── StoreManager        StoreKit 2 subscriptions
```

Everything is SwiftUI + `@Observable`, with `@MainActor` isolation where it touches WebKit.

## Getting started

### Requirements

- Xcode 26+
- iOS 26 / macOS 26 deployment target
- An OpenAI API key (or any OpenAI-compatible endpoint, the base URL is configurable)
- A Deepgram API key (for the voice agent)

### Setup

1. Clone the repo:
   ```sh
   git clone https://github.com/unixers/runic.git
   cd runic
   ```

2. Create your secrets file:
   ```sh
   cp Runic/Secrets.swift.example Runic/Secrets.swift
   ```
   Then fill in your keys:
   ```swift
   enum Secrets {
       static let openAIAPIKey  = "sk-..."
       static let deepgramAPIKey = "..."
   }
   ```
   `Secrets.swift` is gitignored. It never leaves your machine.

3. Open `Runic.xcodeproj` in Xcode and run.

### Usage

- Type a task in the bottom input bar ("find the cheapest flight from SFO to Tokyo in November") and watch the agent work in the live log.
- Hold to speak. Commands dispatch as you talk: "Open YouTube and search for..." starts navigating before you finish the sentence.
- Parallel tasks: ask for comparisons ("compare this laptop's price on Amazon and eBay") and the agent forks subtasks across tabs.

## Project layout

```
Runic/
├── RunicApp.swift            App entry point
├── ContentView.swift         Main browser UI
├── TabManager.swift          WKWebView, tab management, JS bridge
├── BrowserAgent.swift        Agent loop and action execution
├── VoiceAgent.swift          Deepgram streaming and incremental dispatch
├── OnDeviceClassifier.swift  FoundationModels task routing
├── OpenAIService.swift       LLM API client and tool schemas
├── BackendService.swift      Auth, chat proxy, tasks
├── SiteCacheImpl.swift       Task-to-URL memory
├── StoreManager.swift        StoreKit 2 subscriptions
├── Models.swift              Shared data models
└── *View.swift               SwiftUI components
```

## License

All rights reserved.
