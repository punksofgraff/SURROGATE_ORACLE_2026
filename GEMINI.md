# SURROGATE:ORACLE — Gemini Integration Reference

Canonical knowledge base for the Gemini integration. Update when anything structural changes.
Last updated: 2026-05-27. Pressure test: 86/86 passing.

---

## Current Status

| Service | Status | Notes |
|---------|--------|-------|
| **Gemini Live WebSocket** (`gemini-live-proxy`) | ✅ Live | Free-tier AI Studio key (`GEMINI_API_KEY`). Model: `gemini-2.5-flash-native-audio-latest` |
| **Gemini REST fallback** (`oracle-conversation`) | ✅ Live | Same `GOOGLE_AI_API_KEY`. Model: `gemini-2.5-flash`. Text-only on WS drop |
| **Portrait prompt enhance** (`gemini-portrait-generator`) | ✅ Live | `gemini-2.5-flash` enriches theme → DALL-E/Replicate prompt |
| **DALL-E 3 portraits** | ⚠️ Needs key | `OPENAI_API_KEY` not in Replit secrets — falls back to Replicate/Unsplash |
| **Decart WebRTC avatar** | ✅ Live | `DECART_API_KEY` in Replit + Supabase. ICE warms during lore (~18s). |
| **Freemium viseme lip-sync** | ✅ Live | `OracleFaceRenderer` pixel-warp canvas + `VisemeDetector` on shared AudioContext |

---

## The Seeker's Journey — Current Correct Flow

```
dormant
  ↓ user tap → enterTerminal()
terminal  ← Oracle is SILENT. Lore types in. Gemini WS pre-warming.
  ↓ lore done (or skipped) → awakeFromTerminal()
awakened  ← +300ms: startSession() → Oracle greets "Greetings... Seeker"
           ← +1200ms: sendTextMessage(territories, hidden) → Oracle announces knives
           ← knife cards visible
  ↓ knife selected → selectKnifeQuestion() → +1600ms: setScenePhase('oracle')
oracle    ← OracleFaceRenderer canvas live, VisemeDetector active, mic starts after first turn
  ↓ EXIT button → exitOracleMode() → 2500ms ceremony → dormant
```

**Key invariants:**
- `startSession()` in `awakeFromTerminal()` is the ONLY path that sends `__ORACLE_BOOT__`.
- The oracle-phase `useEffect` calls `startSession()` again; `sessionBootedRef` makes it a no-op (logs `SESSION ALREADY ACTIVE`).
- `autoStart=false` on `<OracleConversation>` — the component pre-connects but never greets autonomously.

---

## API Key Map

> ⚠️ Two Google keys exist in Replit. Only one works for Gemini.

| Replit Secret | Supabase Secret | Works For |
|---|---|---|
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | ✅ Google AI Studio free-tier key. Used by all three EFAs |
| `GOOGLE_AI_API_KEY` (Replit) | — | ❌ GCP service key. Does NOT work with `generativelanguage.googleapis.com` |

---

## Model Anchors

| Model | Location | Current ID | Notes |
|-------|----------|------------|-------|
| Gemini Live (primary) | `OracleConversation.tsx:24` | `models/gemini-2.5-flash-native-audio-latest` | AUDIO-only modality. Voice: `Charon` |
| Gemini REST (fallback) | `oracle-conversation/index.ts` | `gemini-2.5-flash` | Text-only |
| Portrait prompt enhance | `gemini-portrait-generator/index.ts` | `gemini-2.5-flash` | Text generation |

**`speakingRate` is NOT valid in Gemini Live WS `speechConfig`** — it belongs to the TTS REST API only. Speed is handled client-side via `PCMPlayer.playbackRate = ORACLE_PLAYBACK_RATE`.

---

## Gemini Live WebSocket — Protocol Detail

### Message Translation (gemini-live-proxy EFA)

```
Browser → Proxy (custom)           Proxy → Gemini (native BidiGenerateContent)
────────────────────────────        ─────────────────────────────────────────
{ type: "session.config", ... }  → { setup: { model, systemInstruction, ... } }
{ type: "client.realtimeInput" } → { realtimeInput: { mediaChunks: [...] } }

Gemini → Proxy (native)            Proxy → Browser (translated)
───────────────────────────         ────────────────────────────
{ serverContent: {...} }         → { type: "server.content", serverContent: {...} }
{ setupComplete }                   (swallowed — proxy sends its own session.created)
```

### ⚠️ Critical: Blob Frames

Gemini Live sends **ALL messages** as **binary WebSocket frames**, not text frames:

```typescript
// CORRECT — async handler, .text() on Blob before JSON.parse
gemini.onmessage = async (event: MessageEvent) => {
  const text = event.data instanceof Blob ? await event.data.text() : event.data;
  const msg = JSON.parse(text);
};
```

### Audio Input (Seeker mic → Gemini)

Input format: `audio/pcm;rate=16000` — raw Int16 PCM, mono, 16kHz.
Sent via `client.realtimeInput` with `mediaChunks: [{ data: base64, mimeType: 'audio/pcm;rate=16000' }]`.

**VAD gate is mandatory** — do NOT send all mic frames. Only send during `isSpeaking` (onset/speaking/trailing states). See CLAUDE.md §4 for the exact pattern. Sending without VAD gating will cause:
- Oracle responding to its own voice (echo)
- Premature turn endings from background noise
- Wasted Gemini compute on silence frames

### Audio Output (Gemini → Seeker)

Output format: `audio/pcm;rate=24000` — raw Int16 PCM, 24kHz.
Arrives in `serverContent.modelTurn.parts[].inlineData` when `mimeType === 'audio/pcm;rate=24000'`.

Decode path:
```typescript
const raw = atob(part.inlineData.data);
const pcmData = new Int16Array(raw.length / 2);
const view = new DataView(new Uint8Array([...raw].map(c => c.charCodeAt(0))).buffer);
for (let i = 0; i < pcmData.length; i++) pcmData[i] = view.getInt16(i * 2, true);
// → feed to PCMPlayer or pass to handleOracleResponse()
```

### Turn Lifecycle

```
session.created  → (autoStart=false) wait for startSession() call
startSession()   → sends { type: 'client.realtimeInput', realtimeInput: { text: 'Greetings... Seeker' } }
                   logStep: __ORACLE_BOOT__ path triggered
Gemini streams   → serverContent.modelTurn.parts (audio + text interleaved)
                   logStep: ORACLE AUDIO START (first chunk)
turnComplete     → logStep: ORACLE TURN COMPLETE
                   → score parsed from currentResponseText
                   → mic starts (1200ms delay post-turnComplete)
serverContent.interrupted → Oracle was interrupted by seeker (barge-in)
                   → logStep: ORACLE INTERRUPTED (barge-in) [warn]
                   → pcmPlayer.stop(), isProcessing=false immediately
```

---

## ORACLE_SCORE Annotation Protocol

Oracle responses carry a hidden annotation parsed and stripped client-side:

```
[[ORACLE_SCORE: {"alignment":"sacred","coinAward":10,"totemAdvancement":"ascend","totemLevel":2,"unlockTrigger":null,"sessionPhase":"claim","archetypeTitle":null}]]
```

- Parsed in `OracleConversation.tsx → parseScore()` → drives totem, coins, portrait unlock.
- Stripped from all user-visible display.
- If missing or malformed: logs `SCORE PARSE FAILED [warn]` — no error thrown.
- Score log format: `ORACLE SCORE: <sessionPhase> / <alignment> / +<coinAward>c`

Valid `sessionPhase` values: `claim`, `evidence`, `cost`, `mirror`
Valid `alignment` values: `sacred`, `profane` (neutral is handled by the absence of strong alignment)

---

## Step Logger — Gemini-Specific Steps

Steps that relate directly to the Gemini WS handshake, in chronological order:

```
GEMINI WS CONNECTING        pending  t=~0ms from component mount
GEMINI WS OPENED            ok       t=~300-600ms (network dependent)
GEMINI SESSION CREATED      ok       t=~400-800ms
__ORACLE_BOOT__ path triggered ok    t=~9s (after lore)
ORACLE AUDIO START          ok       t=first PCM chunk of first turn
ORACLE TURN COMPLETE        ok       t=after last chunk + turnComplete signal
ORACLE SCORE: ...           ok       t=same as TURN COMPLETE
MIC STARTED                 ok       t=TURN COMPLETE + 1200ms delay
ORACLE INTERRUPTED          warn     t=whenever seeker speaks over Oracle
GEMINI WS CLOSED (1000)     ok       t=on clean exit
GEMINI WS CLOSED (≠1000)    err      t=unexpected drop
GEMINI WS ERROR             err      t=ws.onerror
```

---

## Portrait Generation Pipeline

Triggered by `portrait_unlock` oracle:unlock event when totem threshold reached.
Themes accumulate per-conversation in `conversationThemesRef` (Set, seeded by knife selection).

```
gemini-portrait-generator EFA (cascade — first success wins):
  1. Gemini 2.5 Flash — enriches theme string → vivid 280-char DALL-E prompt
  2a. DALL-E 3         — if OPENAI_API_KEY present (currently missing)
  2b. Replicate flux-schnell — ✅ active key in Supabase
  2c. HuggingFace FLUX.1-schnell — if HUGGINGFACE_API_KEY set
  2d. Pollinations.ai — zero config, URL-based, no key needed
  3. Themed Unsplash fallback — always succeeds
```

---

## Supabase Project

- Ref: `velmmplevfrtrtrypoch`
- Dashboard: https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Key tables: `surrogate_sessions`, `surrogate_portraits`, `oracle_interactions`, `culture_crew`
- Secrets: `npx supabase secrets list --project-ref velmmplevfrtrtrypoch`

EFAs that must be deployed `--no-verify-jwt`:
```bash
npx supabase functions deploy gemini-live-proxy --no-verify-jwt
```
