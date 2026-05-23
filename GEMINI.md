# SURROGATE:ORACLE — Gemini Integration Reference

Canonical knowledge base for the Gemini integration. Update when anything structural changes. Last updated May 2026.

---

## Current Status

| Service | Status | Notes |
|---|---|---|
| **Gemini Live WebSocket** (`gemini-live-proxy`) | ✅ Live | Free-tier AI Studio key (`GEMINI_API_KEY`). Model: `gemini-2.5-flash-native-audio-latest` |
| **Gemini REST fallback** (`oracle-conversation`) | ✅ Live | Same `GOOGLE_AI_API_KEY`. Model: `gemini-2.5-flash`. Text-only on WS drop |
| **Portrait prompt enhance** (`gemini-portrait-generator`) | ✅ Live | `gemini-2.5-flash` enriches theme → DALL-E/Replicate prompt |
| **DALL-E 3 portraits** | ⚠️ Needs key | `OPENAI_API_KEY` not in Replit secrets — portraits fall back to Replicate/Unsplash |
| **Decart WebRTC avatar** | ✅ Key present | `DECART_API_KEY` in Replit + Supabase |
| **Freemium viseme lip-sync** | ✅ Live | `VisemeDetector` on oracle face `<img>` via Web Audio API |

---

## API Key Map

> ⚠️ Two Google keys exist in Replit. Only one works for Gemini.

| Replit Secret | Supabase Secret | Works For |
|---|---|---|
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | ✅ Google AI Studio free-tier key. Used by `gemini-live-proxy`, `oracle-conversation`, `gemini-portrait-generator` |
| `GOOGLE_AI_API_KEY` | — | ❌ GCP service key. Does NOT work with `generativelanguage.googleapis.com` |

When rotating: always use `$GEMINI_API_KEY` (not `$GOOGLE_AI_API_KEY`):
```bash
npx supabase secrets set GOOGLE_AI_API_KEY="$GEMINI_API_KEY" --project-ref velmmplevfrtrtrypoch
```

---

## Model Anchors

| Model | Location | Current ID | Notes |
|---|---|---|---|
| Gemini Live (primary) | `OracleConversation.tsx:34` | `models/gemini-2.5-flash-native-audio-latest` | AUDIO-only modality |
| Gemini REST (fallback) | `oracle-conversation/index.ts` | `gemini-2.5-flash` | Text-only |
| Portrait prompt enhance | `gemini-portrait-generator/index.ts:83` | `gemini-2.5-flash` | Text generation |

### ⚠️ Model Constraints — READ BEFORE CHANGING

- `gemini-2.5-flash-native-audio-latest` is **AUDIO-only modality**. Do NOT add `responseModalities: ['TEXT']` — it breaks the model. Text/thinking parts still arrive automatically and carry `[[ORACLE_SCORE:…]]` annotations.
- `gemini-3.1-flash-live-preview` requires preview allowlist — returns **1011** on free-tier projects. Do not use until project is allowlisted.
- Old model IDs (`gemini-2.0-flash-live-001`, `gemini-2.5-flash-preview-native-audio-dialog`) return **1008 not found** on v1beta as of May 2026. Do not use.
- Google migrating all Live models to Gemini 3.0 GA by end of June 2026 — update `GEMINI_MODEL` when new ID is confirmed at https://ai.google.dev/gemini-api/docs/models

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

// WRONG — silently drops every message translation
gemini.onmessage = (event: MessageEvent) => {
  const msg = JSON.parse(event.data as string); // ❌ never revert to this
};
```

### ⚠️ Deploy Flag

`gemini-live-proxy` **must** be deployed with `--no-verify-jwt`:
```bash
npx supabase functions deploy gemini-live-proxy \
  --project-ref velmmplevfrtrtrypoch --use-api --no-verify-jwt
```
Browsers cannot set `Authorization` headers on WebSocket upgrades — JWT verification will reject every connection.

---

## Gemini REST Fallback — oracle-conversation EFA

Activates automatically when Gemini Live WebSocket drops or fails. Client shows `TEXT MODE` badge in conversation header.

- **Model:** `gemini-2.5-flash` (REST `generateContent`)
- **Same key:** `GOOGLE_AI_API_KEY` (i.e., `GEMINI_API_KEY` from Replit)
- **Full feature parity:** ORACLE_SCORE scoring, totem advancement, portrait triggers all work in text fallback
- **Claude retired:** `oracle-conversation` previously used `claude-sonnet-4-6`. Now uses Gemini REST. `ANTHROPIC_API_KEY` is in Supabase but not actively used.

---

## Portrait Generation Pipeline

Triggered by `portrait_unlock` event from `OracleConversation` when totem threshold hit. Themes accumulate per-conversation in `conversationThemesRef` (Set).

```
gemini-portrait-generator EFA (cascade — first success wins)
  1. Gemini 2.5 Flash — enriches theme string → vivid 280-char DALL-E prompt
  2a. DALL-E 3         — if OPENAI_API_KEY present. NO `style` param (400 error if included)
  2b. Replicate flux-schnell ✅ active key in Supabase
  2c. HuggingFace FLUX.1-schnell — if HUGGINGFACE_API_KEY set
  2d. Pollinations.ai — zero config, URL-based, no key needed
  2e. DeepAI          — if DEEPAI_API_KEY set
  3. Themed Unsplash fallback — always succeeds
```

---

## ORACLE_SCORE Annotation Protocol

Oracle responses carry a hidden annotation that the client parses and strips from UI:

```
[[ORACLE_SCORE: {"sacred":2,"profane":1,"totem":2,"portrait_unlock":false,"themes":["identity","debt"]}]]
```

- Appears in **text/thinking parts** of Gemini Live responses (even though modality is audio-only)
- Parsed in `OracleConversation.tsx` → drives totem advancement, coin minting, portrait unlock
- Stripped from all user-visible conversation display

---

## Supabase Edge Functions — Gemini-Related

| Function | Purpose | Auth Flag |
|---|---|---|
| `gemini-live-proxy` | WS proxy browser ↔ Gemini Live | `--no-verify-jwt` ← required |
| `oracle-conversation` | Gemini REST fallback (text-only) | default JWT |
| `gemini-portrait-generator` | Portrait pipeline (Gemini enhance + image gen) | default JWT |

Deploy all at once:
```bash
# gemini-live-proxy MUST have --no-verify-jwt
npx supabase functions deploy gemini-live-proxy \
  --project-ref velmmplevfrtrtrypoch --use-api --no-verify-jwt

npx supabase functions deploy \
  oracle-conversation gemini-portrait-generator \
  --project-ref velmmplevfrtrtrypoch --use-api
```

---

## Known Issues & Resolutions

### ✅ RESOLVED — Spending Cap (was blocking Gemini Live)
**Was:** `1011 — Your project has exceeded its monthly spending cap`
**Fix applied:** Switched from GCP service key (`GOOGLE_AI_API_KEY`) to free-tier AI Studio key (`GEMINI_API_KEY`). Free-tier key has no spending cap.

### ✅ RESOLVED — `1008 not found` on old model IDs
Old IDs (`gemini-2.0-flash-live-001`, `gemini-2.5-flash-preview-native-audio-dialog`) no longer exist on v1beta endpoint. Using `gemini-2.5-flash-native-audio-latest`.

### ⚠️ OPEN — DALL-E portraits
`OPENAI_API_KEY` not in Replit secrets. Portraits fall to Replicate/Unsplash.
Fix: Add `OPENAI_API_KEY` to Replit secrets → push to Supabase: `npx supabase secrets set OPENAI_API_KEY="$OPENAI_API_KEY" --project-ref velmmplevfrtrtrypoch`

---

## System Architecture Quick Ref

```
Browser
  OracleConversation.tsx
    │
    ├─ PRIMARY: Gemini Live WS
    │    └─ wss://velmmplevfrtrtrypoch.supabase.co/functions/v1/gemini-live-proxy
    │         └─ proxy translates ↔ Google generativelanguage.googleapis.com
    │              model: gemini-2.5-flash-native-audio-latest
    │              audio in: 16kHz PCM (from pcm-encoder.worker.ts)
    │              audio out: 24kHz PCM → decoded + played by OracleConversation
    │
    └─ FALLBACK: Gemini REST (on WS drop/error)
         └─ https://velmmplevfrtrtrypoch.supabase.co/functions/v1/oracle-conversation
              model: gemini-2.5-flash
              text-only — no audio, no VisemeDetector trigger
              client shows TEXT MODE badge

  gemini-portrait-generator EFA
    └─ triggered by portrait_unlock ORACLE_SCORE event
         └─ gemini-2.5-flash enriches theme → DALL-E 3 → Replicate → Unsplash
```

---

## Supabase Project

- Ref: `velmmplevfrtrtrypoch`
- Dashboard: https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Key tables: `surrogate_sessions`, `surrogate_portraits`, `oracle_interactions`, `culture_crew`
- Secrets list: `npx supabase secrets list --project-ref velmmplevfrtrtrypoch`
