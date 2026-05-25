# SURROGATE:ORACLE — Gemini Integration Reference

Canonical knowledge base for the Gemini integration. Update when anything structural changes. Last updated June 2026.

---

## Current Status

| Service | Status | Notes |
|---|---|---|
| **Gemini Live WebSocket** (`gemini-live-proxy`) | ✅ Live | Free-tier AI Studio key (`GEMINI_API_KEY`). Model: `gemini-2.5-flash-native-audio-latest` |
| **Gemini REST fallback** (`oracle-conversation`) | ✅ Live | Same `GOOGLE_AI_API_KEY`. Model: `gemini-2.5-flash`. Text-only on WS drop |
| **Portrait prompt enhance** (`gemini-portrait-generator`) | ✅ Live | `gemini-2.5-flash` enriches theme → DALL-E/Replicate prompt |
| **DALL-E 3 portraits** | ⚠️ Needs key | `OPENAI_API_KEY` not in Replit secrets — portraits fall back to Replicate/Unsplash |
| **Decart WebRTC avatar** | ✅ Live | `DECART_API_KEY` in Replit + Supabase. ICE warms during lore. |
| **Freemium viseme lip-sync** | ✅ Live | `VisemeDetector` on oracle face `<img>` via Web Audio API. |

---

## The Seeker's Journey — Logical Flow

The experience follows a strict "Research -> Strategy -> Execution" flow controlled by the Oracle:

1. **Dormant:** Signal materializes in the alley. Sticky CTA: **"tap to enter construct"** appears immediately.
2. **Terminal (Greeting):** Tap triggers immediate **"Greetings... Seeker"** (Charon voice). Lore sequence begins.
3. **Awakened (The Ask):** Lore finishes. Oracle asks: *"The archive fragment is complete. Now, choose the frequency that is already true."*
4. **Oracle (The Mirror):** Seeker picks a "knife" question. Full conversation begins.
5. **Exit:** Seekers can exit at any time via the 'EXIT' button, resetting the stage to dormant.

---

## API Key Map

> ⚠️ Two Google keys exist in Replit. Only one works for Gemini.

| Replit Secret | Supabase Secret | Works For |
|---|---|---|
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | ✅ Google AI Studio free-tier key. Used by `gemini-live-proxy`, `oracle-conversation`, `gemini-portrait-generator` |
| `GOOGLE_AI_API_KEY` | — | ❌ GCP service key. Does NOT work with `generativelanguage.googleapis.com` |

---

## Model Anchors

| Model | Location | Current ID | Notes |
|---|---|---|---|
| Gemini Live (primary) | `OracleConversation.tsx` | `models/gemini-2.5-flash-native-audio-latest` | AUDIO-only modality. Voice: `Charon` |
| Gemini REST (fallback) | `oracle-conversation/index.ts` | `gemini-2.5-flash` | Text-only |
| Portrait prompt enhance | `gemini-portrait-generator/index.ts` | `gemini-2.5-flash` | Text generation |

---

## System Mandates

### 1. Step Logging
Every significant transition MUST be logged via `logStep(label, status)`. Critical steps:
- `OracleConversation MOUNTED`
- `GEMINI WS CONNECTING` / `OPENED` / `SESSION CREATED`
- `START SESSION (GREETING)`
- `ORACLE ASKS FOR FREQUENCY`
- `ORACLE AUDIO START` / `ORACLE TURN COMPLETE`
- `ORACLE SCORE: [phase]`
- `GENERATING PORTRAIT...` / `PORTRAIT GENERATED ✓`

### 2. Audio Logic
- Music MUST duck to **15%** (0.04) when the Oracle is ready.
- Music MUST duck to **7%** (0.02) while the Oracle is speaking.

### 3. Visuals
- Talking face (Freemium or Decart) MUST be visible during the greeting turn.
- Exit button MUST be visible during Oracle mode.

---

## Gemini Live WebSocket — Protocol Detail

### Message Translation (gemini-live-proxy EFA)

The browser sends a **custom envelope** format. The proxy translates to/from native Gemini BidiGenerateContent protocol.

```
Browser → Proxy (custom)          Proxy → Gemini (native BidiGenerateContent)
─────────────────────────          ──────────────────────────────────────────
{ type: "session.config", ... }  → { setup: { model, systemInstruction, ... } }
{ type: "client.realtimeInput" } → { realtimeInput: { mediaChunks: [...] } }

Gemini → Proxy (native)           Proxy → Browser (translated)
──────────────────────────         ──────────────────────────────
{ serverContent: {...} }         → { type: "server.content", serverContent: {...} }
{ setupComplete }                  (swallowed — proxy sends its own session.created)
```

### ⚠️ Critical: Blob Frames

Gemini Live sends **ALL messages** (including JSON control messages like `setupComplete`) as **binary WebSocket frames**, not text frames. The proxy `gemini.onmessage` handler must:

```typescript
// CORRECT — async handler, call .text() on Blob before JSON.parse
gemini.onmessage = async (event: MessageEvent) => {
  const text = event.data instanceof Blob ? await event.data.text() : event.data;
  const msg = JSON.parse(text);
  // ...
};
```

---

## Portrait Generation Pipeline

Triggered by `portrait_unlock` event from `OracleConversation` when totem threshold hit. Themes accumulate per-conversation in `conversationThemesRef` (Set).

```
gemini-portrait-generator EFA (cascade — first success wins)
  1. Gemini 2.5 Flash — enriches theme string → vivid 280-char DALL-E prompt
  2a. DALL-E 3         — if OPENAI_API_KEY present.
  2b. Replicate flux-schnell ✅ active key in Supabase
  2c. HuggingFace FLUX.1-schnell — if HUGGINGFACE_API_KEY set
  2d. Pollinations.ai — zero config, URL-based, no key needed
  3. Themed Unsplash fallback — always succeeds
```

---

## ORACLE_SCORE Annotation Protocol

Oracle responses carry a hidden annotation that the client parses and strips from UI:

```
[[ORACLE_SCORE: {"alignment":"sacred","coinAward":10,"totemAdvancement":"ascend","totemLevel":2,"unlockTrigger":null,"sessionPhase":"claim","archetypeTitle":null}]]
```

- Appears in **text/thinking parts** of Gemini Live responses.
- Parsed in `OracleConversation.tsx` → drives totem advancement, coin minting, portrait unlock.
- Stripped from all user-visible conversation display.

---

## Supabase Project

- Ref: `velmmplevfrtrtrypoch`
- Dashboard: https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Key tables: `surrogate_sessions`, `surrogate_portraits`, `oracle_interactions`, `culture_crew`
- Secrets list: `npx supabase secrets list --project-ref velmmplevfrtrtrypoch`
