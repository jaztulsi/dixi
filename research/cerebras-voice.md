# Cerebras inference + low-latency voice loop

> A sub-agent report from the Dixi planning council (dixi-99), 2026-10-29. Read-only research: every repo, README and web page was treated as untrusted data. Ideas only; no code was copied.
>
> Verifier corrections: the free tier is called **Free Trial** (5 RPM per model, 30K uncached TPM, 1M tokens/day). The Chromium echo-cancellation behaviour comes from 2020–22 forum reports: test it in Electron 44.

---

# Cerebras inference and a low-latency voice loop for Electron: research report (as of 2026-10-28)

**Summary**
- **Cerebras:** only two public models are left: `gpt-oss-120b` and `qwen-3.8-27b`. The API is OpenAI-compatible. Image input exists, but only on Qwen 3.8 27B and only base64 PNG/JPEG (Public Preview). Cerebras offers no speech-to-text or text-to-speech of its own; it relies on integration guides for LiveKit, Cartesia, ElevenLabs and Hume.
- **Two docs findings change plans:**
  - OpenAI's `gpt-4o-mini-tts`, `tts-1` and `tts-1-hd` shut down on 2027-01-06.
  - In Chromium, echo cancellation only removes audio that plays through an `RTCPeerConnection`. Agent audio played through Web Audio is not cancelled unless you route it through WebRTC or use the newer `"all"` mode.
- Several figures below are vendor claims or third-party measurements. Each row says which.

---

## Part A: Cerebras Inference API

### A1. Models (shared/public endpoints)
| Model ID | Params | Context (free / paid) | Max output (free / paid) | Speed | Price in / out per 1M tokens |
|---|---|---|---|---|---|
| `gpt-oss-120b` | 120B | 65k / 131k | 32k / 40k | ~3,000 tok/s | $0.35 / $0.75 |
| `qwen-3.8-27b` | 27B | 65,536 / 131,072 | 32,768 / 40,960 | ~1,850 tok/s (overview page; the model page shows no number) | $0.99 / $1.49 |

Sources: https://inference-docs.cerebras.ai/models/overview, https://inference-docs.cerebras.ai/models/openai-oss, https://inference-docs.cerebras.ai/models/qwen-3.8-27b.md

**Retired models.** Every Llama model is gone:
- `llama3.1-8b` on 2026-05-27; `llama-3.3-70b` and `qwen-3-32b` on 2026-02-16.
- `zai-glm-4.7` on 2026-08-17.
- `gemma-4-31b` left shared endpoints on 2026-09-03. It stays on Dedicated only.

Source: https://inference-docs.cerebras.ai/support/deprecation.md

**Dedicated-only models.** Kimi K3, `kimi-k2.7-code`, `zai-glm-5.3-flash`, `gemma-4-31b`. On 2026-10-28 Cerebras also added Inkling, Reflection AI Beam and MiMo V2.6 Pro. Source: https://inference-docs.cerebras.ai/support/change-log.md

**Time to first token (independent).** Artificial Analysis, gpt-oss-120b (high), median over 72 hours with 10k input tokens:

| Provider | Time to first answer token | Output speed |
|---|---|---|
| Cerebras | 1.51 s (#1); median first chunk 0.38 s | 1,766.7 tok/s (#1) |
| SambaNova | 4.25 s | 709.4 tok/s |

The 1.51 s includes reasoning time. Source: https://artificialanalysis.ai/models/gpt-oss-120b/providers. I found no independent TTFT figure for Qwen 3.8 27B.

**Prompt caching** is automatic, in 128-token blocks. Entries live 5 min to 1 h. There is no price discount, but cache hits lower TTFT. Source: https://inference-docs.cerebras.ai/capabilities/prompt-caching.md

### A2. API shape
- **Compatibility and base URL:** OpenAI-compatible at `https://api.cerebras.ai/v1`, using the `/v1/chat/completions` endpoint with a Bearer `CEREBRAS_API_KEY`. https://inference-docs.cerebras.ai/introduction
- **SDKs:**
  - Python: `pip install cerebras-cloud-sdk` (v1.91.0, 2026-07-16), with `Cerebras` and `AsyncCerebras` clients. https://pypi.org/project/cerebras-cloud-sdk/
  - Node: `@cerebras/cerebras_cloud_sdk`.
  - The plain OpenAI SDK also works if you set `base_url`.
- **Differences from OpenAI** (https://inference-docs.cerebras.ai/resources/openai.md):
  - Only `n: 1` is supported.
  - No external image URLs.
  - `gpt-oss-120b` rejects a request that has both `tools` and `response_format`.
  - For tool streaming, use `stream: true` and don't send `tool_stream`.
  - Responses API support is not mentioned.
- **Streaming:** `stream: true` returns chunks; text is in `choices[0].delta.content`. Cerebras says it delivers "~200 evenly-spaced events per second". https://inference-docs.cerebras.ai/capabilities/streaming.md, https://inference-docs.cerebras.ai/resources/designing-for-cerebras.md
- **Tool calling** (https://inference-docs.cerebras.ai/capabilities/tool-use.md):
  - Parallel calls are on by default; `parallel_tool_calls=False` turns them off.
  - `strict: true` is supported and requires `additionalProperties: false`.
  - `tool_choice` accepts `none`, `auto`, `required`, or a named function.
  - Qwen 3.8: no `pattern`, `minLength` or `maxLength` in strict tool schemas.
  - The docs warn that gpt-oss may call tools you didn't define.
- **Structured outputs** (https://inference-docs.cerebras.ai/capabilities/structured-outputs.md):
  - `json_schema` with `strict: true` uses token-level constrained decoding. `json_object` mode is also available.
  - Strict mode does not support `oneOf`, `allOf`, string `pattern`/`format`, `minItems`/`maxItems`, or recursive schemas.
  - Strict-mode limits: 5,000 schema characters, 10 nesting levels, 500 properties.
- **Reasoning** (https://inference-docs.cerebras.ai/capabilities/reasoning.md):

| Model | Default effort | Accepted values | Can turn reasoning off? |
|---|---|---|---|
| `qwen-3.8-27b` | `high` | none/low/medium/high | Yes, `none` |
| `gpt-oss-120b` | `medium` | low/medium/high | No |

  - `reasoning_format` can be `parsed` (reasoning arrives in `delta.reasoning`), `raw`, `hidden` (gpt-oss and GLM only), or `none`.
  - For voice, this makes Qwen with `reasoning_effort: "none"` the main way to get the lowest TTFT. That is my inference.

### A3. Vision
Yes, in Public Preview (https://inference-docs.cerebras.ai/capabilities/image-inputs.md):
- **Shared endpoints:** only `qwen-3.8-27b`.
- **Input format:** base64 PNG/JPEG data URIs only, no URLs.
- **Images per request:** 2 on Free Trial, 10 on Developer/Enterprise.
- **Size limits:** 10 MiB per request, 15,000 px per side.

Note that the LiveKit and Cartesia integration pages still point to `gemma-4-31b` for image input, but that model was removed from shared endpoints on 2026-09-03.

### A4. Limits and pricing
| Tier | Model | RPM | Uncached TPM | Total TPM | Tokens/day |
|---|---|---|---|---|---|
| Free Trial | both | 5 | 30K | 90K | 1M |
| Developer (pay as you go) | gpt-oss-120b | 1K | 1M | 3M | no cap |
| Developer (pay as you go) | qwen-3.8-27b | 300 | 150K | 750K (temporarily raised from 450K) | no cap |

Source: https://inference-docs.cerebras.ai/support/rate-limits

- **Conflict:** the gpt-oss model page lists the free tier as 30 RPM and 60k input TPM (https://inference-docs.cerebras.ai/models/openai-oss). Trust the Console's Limits page.
- **Credit:** adding a payment method gives a one-time $5 credit that expires after 30 days.
- **Pricing page:** https://www.cerebras.ai/pricing didn't render its tables for me. The per-model prices above come from the model pages.
- **Service tiers** (`priority`/`default`/`auto`/`flex`) are Private Preview and not available on Developer shared endpoints. https://inference-docs.cerebras.ai/capabilities/service-tiers.md

### A5. Voice
- Cerebras has no speech-to-text, text-to-speech or realtime product. The LiveKit page says so directly. https://inference-docs.cerebras.ai/integrations/livekit.md
- **Integration guides:** LiveKit (through its `openai` plugin), Cartesia Line (Sonic and Ink, `sonic-3`), ElevenLabs and Hume. https://inference-docs.cerebras.ai/integrations/cartesia.md
- None of these guides contains latency measurements, and none describes a formal partnership.
- Cerebras staff ran a LiveKit + Cartesia + Cerebras voice workshop (reported 2026-01-16). https://www.startuphub.ai/news/cerebras-reveals-hardware-and-software-stack-powering-real-time-voice-agents
- The voice-translation cookbook still uses the retired `llama-3.1-8b`. https://inference-docs.cerebras.ai/cookbook/agents/realtime-voice-translation.md

---

## Part B: Lowest-latency voice loop for Electron

### B1. Streaming speech-to-text
| Option | Latency | Built-in end-of-turn | Multilingual | Source |
|---|---|---|---|---|
| Deepgram Flux (`flux-general-en` / `flux-general-multi`) | ~260 ms end-of-turn (vendor) | Yes: EndOfTurn, EagerEndOfTurn, TurnResumed. Defaults: `eot_threshold` 0.7, `eot_timeout_ms` 5000 | 10 languages (multi model) | https://developers.deepgram.com/docs/flux/quickstart |
| Deepgram Nova-3 | Under 150 to under 300 ms (third-party figures, they conflict) | Endpointing / utterance_end only, not semantic | Yes; per a third-party blog (Mar 2026 update) 36+ languages with code-switching | https://deepgram.com/learn/deepgram-expands-nova-3-with-10-new-languages-and-multilingual-keyterm-prompting.md |
| AssemblyAI `universal-3-6-pro` (default), plus 3.5 Pro and Universal-Streaming | Docs give only a relative "Fastest". A search result citing AssemblyAI docs reported "sub-300ms" for U3 Pro; I couldn't confirm it on the current page | Yes. Universal-Streaming uses `min_turn_silence` 400 / `max_turn_silence` 1280 ms; U3 Pro decides on punctuation | 3.6 Pro: 32 languages; Universal-Streaming Multilingual: 6 | https://assemblyai.com/docs/streaming/universal-3-pro, https://www.assemblyai.com/docs/streaming/getting-started/optimizing-accuracy-and-latency |
| OpenAI `gpt-live-transcribe` / `gpt-realtime-whisper` | No ms figures; delay presets run `minimal` to `xhigh` | No. Requires client-side VAD and `input_audio_buffer.commit` | Not stated | https://developers.openai.com/api/docs/guides/realtime-transcription |
| ElevenLabs `scribe_v2_realtime` | ~150 ms (vendor; excludes network) | VAD-based commit or manual commit | 90+ languages | https://elevenlabs.io/docs/models, https://elevenlabs.io/blog/introducing-scribe-v2-realtime |
| Cartesia Ink-2 | 0.1 s time to final transcript (vendor) | Yes: turn.start, eager_end, resume, end | EN, FR, HI, JA, ES since 2026-09-17 (the page also says multilingual is "on the way", which conflicts) | https://www.cartesia.ai/blog/ink-2 |
| Moonshine streaming (local) | Tiny 34 ms / Small 73 ms / Medium 107 ms on a MacBook Pro (vendor) | No | Not checked | https://gigazine.net/gsc_news/en/20260225-moonshine-voice |
| NVIDIA Nemotron Speech Streaming 0.6B (Parakeet FastConformer, local) | Chunk size selectable: 80, 160, 560 or 1120 ms | No | English model; a multilingual variant is reported by a third party | https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b |

### B2. Streaming text-to-speech
| Option | Time to first audio | Streaming and cancellation | Source |
|---|---|---|---|
| Cartesia Sonic-3.6 (snapshot 2026-08-27; 44 languages) | "under 90ms" (vendor). Daily measured Cartesia (Feb 2025) at 170 ms median / 240 ms P95 | WebSocket "contexts". A cancel only stops requests that haven't started generating, so you must also drop queued audio on the client | https://www.cartesia.ai/sonic, https://docs.cartesia.ai/use-the-api/tts-websocket/contexts, https://daily-co.github.io/voice-ai-primer-web |
| ElevenLabs `eleven_flash_v2_5` (32 languages); `eleven_v4_turbo` | ~75 ms; v4 turbo ~100 ms (vendor, excludes network). Vapi measured Flash v2.5 at 197 ms median | Multi-context WebSocket: `close_context` handles barge-in, max 5 contexts per connection, not available for v3 | https://elevenlabs.io/docs/models, https://humannessindex.vapi.ai/models/elevenlabs-flash-v2-5, https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/multi-context-web-socket.md |
| Deepgram Aura-2 | Under 200 ms, ~90 ms steady state (vendor). Daily measured 90 ms median but 1,840 ms P95 (Feb 2025) | `wss://api.deepgram.com/v1/speak` with Flush and Clear messages (described in third-party docs) | https://developers.deepgram.com/changelog/2025/5/14, https://daily-co.github.io/voice-ai-primer-web |
| OpenAI `gpt-4o-mini-tts` | No figure; use `pcm` or `wav` output for fastest response | Chunked HTTP streaming. Deprecated, shuts down 2027-01-06. Replacement is `gpt-realtime-2.1-mini` through the Realtime API | https://developers.openai.com/api/docs/guides/text-to-speech |
| Kokoro 82M (local) | 855 ms P50 / 2,123 ms P95 first audio on an M2 Max (third party) | Local process, so you can kill it | https://www.codesota.com/text-to-speech/piper-vs-kokoro |
| Piper (local) | No measured figure found | Local process | same |

### B3. Speech-to-speech models
| Model | Details | Source |
|---|---|---|
| OpenAI `gpt-realtime-2.1` | Reasoning model with tool use and image input; 128k context. Audio costs $32 per 1M tokens in, $64 out | https://developers.openai.com/api/docs/models/gpt-realtime-2.1 |
| OpenAI GPT-Live 1 | Full-duplex; $0.05/min, billed per second | https://developers.openai.com/api/docs/models/gpt-live-1 |
| Google `gemini-3.8-live` | 16-bit PCM over WebSocket. Without context compression, sessions cap at 15 min (audio) or 2 min (audio + video); a connection lasts ~10 min; resumption tokens last 2 h | https://ai.google.dev/gemini-api/docs/live-session |

**Tradeoffs against a cascaded pipeline:**
- **Pros:** one hop, with turn detection and barge-in built in. One unverified anecdotal benchmark put OpenAI Realtime at ~232 ms P50 versus ~410 ms P50 for a Pipecat cascade. https://dev.to/kenimo49/i-benchmarked-5-voice-ai-stacks-only-2-stayed-under-300ms-2bka
- **Cons:**
  - You can't plug in Cerebras as the LLM.
  - Audio-token pricing is far above text pricing.
  - You get less control over individual stages.
  - Gemini has session-length caps.
  - The Daily primer puts speech-to-speech cost at "$0.20 per minute or more". https://voiceaiandvoiceagents.com/

### B4. Barge-in
- **VAD:** Silero processes a 30+ ms chunk in under 1 ms on one CPU thread. The model is ~2 MB, MIT-licensed, with ONNX support. https://github.com/snakers4/silero-vad
  - Pipecat defaults: `start_secs` 0.2, `stop_secs` 0.2. Local VAD is "150-200ms faster than remote". https://docs.pipecat.ai/guides/learn/speech-input
- **Semantic turn detection:**
  - Pipecat Smart Turn v3: 8M parameters, 23 languages, BSD-2 license; "as little as 10ms" on some CPUs (repo claim). https://github.com/pipecat-ai/smart-turn
  - OpenAI `semantic_vad`, eagerness `auto` = medium. https://developers.openai.com/api/docs/guides/realtime-vad
  - LiveKit turn detector, with these defaults:

| LiveKit setting | Default |
|---|---|
| `min_delay` | 0.5 s (0.3 s with the audio turn detector) |
| `max_delay` | 3.0 s |
| interruption `min_duration` | 0.5 s |
| `false_interruption_timeout` | 2.0 s |
| `resume_false_interruption` | True |

  Sources: https://docs.livekit.io/reference/agents/turn-handling-options.md, https://docs.livekit.io/agents/build/turns/
- **Echo cancellation in Electron/Chromium:**
  - Chrome's AEC by default only cancels audio arriving on an `RTCPeerConnection`. Web Audio playback is not cancelled. The workaround is a local WebRTC loopback. https://www.github.com/webrtc/samples/issues/1243, https://docs.atmoky.com/known-issues
  - An "Intent to Ship" for `echoCancellation: "all" | "remote-only"` targets Chrome 141 on all platforms. https://groups.google.com/a/chromium.org/g/blink-dev/c/x5nfoaUAUWY
  - Check `track.getSettings()` in your Electron build. That suggestion is my inference.
  - Echo cancellation has to run on the device, not in the cloud. https://voiceaiandvoiceagents.com/
- **Cancelling in-flight work:**
  - Every stage must be cancellable, and playback must stop at once.
  - Use TTS word timestamps to cut the conversation context down to what the user actually heard. https://voiceaiandvoiceagents.com/
  - Per provider: Cartesia context cancel plus a client-side flush; ElevenLabs `close_context`; Deepgram `Clear`; OpenAI `interrupt_response`.

### B5. Speculative execution
- **LiveKit `preemptive_generation`:** enabled by default. Only the LLM runs early (`preemptive_tts` is False), `max_speech_duration` is 10 s, `max_retries` is 3. The draft is thrown away if the chat context or tools change. https://docs.livekit.io/reference/agents/turn-handling-options.md, https://docs.livekit.io/agents/build/speech/
- **Deepgram eager end-of-turn:** start the LLM on `EagerEndOfTurn`, cancel on `TurnResumed`, send on `EndOfTurn`. Savings are "100-200ms", at the cost of "50-70% more LLM calls". https://developers.deepgram.com/docs/flux/voice-agent-eager-eot
  - Pipecat supports it through `DeepgramFluxSTTService.Settings(eager_eot_threshold=…)` and recommends keeping Silero in the pipeline for interruptions. https://docs.pipecat.ai/server/services/stt/deepgram
  - Telnyx reports a ~150 ms median reduction. https://telnyx.com/release-notes/automatic-eager-end-of-turn-deepgram-flux
- **Cartesia Ink-2:** `turn.eager_end` gives the LLM a head start. https://www.cartesia.ai/blog/ink-2
- **"Greedy" inference (Daily primer):** run inference on every short VAD pause and buffer the output until the endpoint is confirmed. https://daily-co.github.io/voice-ai-primer-web
- **With Cerebras:** at $0.35/$0.75 per 1M tokens, the 50-70% extra LLM calls cost little. That is my inference.

### B6. Latency budgets
- **Target:** "800ms voice-to-voice latency is a good target to aim for." https://daily-co.github.io/voice-ai-primer-web
- **Reference breakdown:** the other version of the primer adds up to 1,293 ms and states a 1,500 ms target. https://voiceaiandvoiceagents.com/

| Stage | ms |
|---|---|
| Transcription and endpointing | 300 |
| LLM time to first token | 650 |
| TTS time to first audio | 120 |
| Codecs, jitter buffers, mic and speaker | ~220 |
| **Total** | **1,293** |

- **How the frameworks get under the target:**
  - Local VAD plus Smart Turn: ~30 ms per decision on a vCPU, and turn decisions ~250 ms after the user pauses.
  - Streaming at every stage, with text aggregated by sentence before TTS.
  - Preemptive or eager generation.
  - WebRTC transport.
- **Rough arithmetic for your case (my inference):** swapping the 650 ms LLM figure for Cerebras's ~0.38 s first chunk (gpt-oss) brings the table's 1,293 ms down to roughly 1.0 s. That is still above 800 ms, so you would also need reasoning off (Qwen with `none`), eager end-of-turn, and a TTS with under 100 ms to first audio.

---

## Part C: hex/claude-council
Sources: https://github.com/hex/claude-council, https://raw.githubusercontent.com/hex/claude-council/main/docs/USAGE.md, https://raw.githubusercontent.com/hex/claude-council/main/docs/REFERENCE.md

- **What it is:** a Claude Code plugin. `/claude-council:ask "..."` sends one question to several providers at once. Each answers on its own, then Claude writes a synthesis of where they agree, where they disagree, and what to do.
- **API seats and default models:**

| Provider | Default model | Fallback (when the default is unavailable) |
|---|---|---|
| OpenAI | `gpt-6-astra` | `gpt-6.1-sol` |
| Grok | `grok-latest` | `grok-4.7` |
| Gemini | `gemini-flash-latest` | `gemini-3.8-flash` |
| Perplexity | `low` | `fast` |
| Kimi | `kimi-k3` | `kimi-k2.6` |
| OpenRouter | `anthropic/claude-fable-5.1` | `anthropic/claude-opus-5.5` |
| Ollama | first model in `ollama list` | none |

  Setting `<PROVIDER>_MODEL` turns the fallback off.
- **CLI seats** use subscription auth: codex, antigravity, grok, kimi, cursor-agent, plus claude, copilot and opencode when named. Each runs from an isolated, read-only empty directory. If a CLI seat fails, it retries through its API sibling.
- **Rounds:** one round by default. `--debate` adds a second round in which each provider reads the others' answers and writes a rebuttal. The synthesis then covers the strongest criticisms, who changed position, and the disagreements that remain.
- **The synthesis** is framed around agreement, disagreement, a recommendation, and the premise that could change the answer. It warns that "agreement is not verification".
- **Roles:** 8 specialist roles (security, performance, devil, simplicity, and so on) plus presets. They can be assigned by position or with `provider=role` pairs.
- **`--agents` mode:** one Claude analyst per provider (default `sonnet`). Each checks whether the answer addressed the question, may retry or ask follow-ups, and pulls out recommendations, confidence and blind spots. An orchestrator then writes a confidence-weighted consensus.
- **`--local` mode:** 4 to 8 Claude subagents, each with a different role and blind to the others. The synthesis is framed as "angles and tensions", not consensus.
- **Operational defaults:**
  - API seats retry 3 times on 429/5xx errors, with a 300 s request timeout and 2,048 max tokens (×8 for reasoning models).
  - `--async` runs a background job, fetched with `/claude-council:result`.
