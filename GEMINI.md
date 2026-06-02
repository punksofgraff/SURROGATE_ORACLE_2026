# SURROGATE:ORACLE — Gemini Integration Reference

Canonical knowledge base for the Gemini integration. Update when anything structural changes.
Last updated: 2026-06-02. Ingestion Fixes + Diegetic Backend complete.

---

## Current Status

| Service | Status | Notes |
|---------|--------|-------|
| **Gemini Live WebSocket** (`gemini-live-proxy`) | ✅ Live | Free-tier AI Studio key (`GEMINI_API_KEY`). Model: `gemini-2.5-flash-native-audio-latest` |
| **Gemini REST fallback** (`oracle-conversation`) | ✅ Live | Same `GOOGLE_AI_API_KEY`. Model: `gemini-2.5-flash`. Text-only on WS drop |
| **Portrait Gen (Gemini)** (`gemini-portrait-generator`) | ✅ Live | `gemini-2.5-flash` enriches theme → **Gemini 2.0 Flash (Imagination Engine)** |
| **DALL-E 3 portraits** | ❌ DEPRECATED | Removed in favor of Gemini-exclusive pipeline |
| **Decart WebRTC avatar** | ❌ DEPRECATED | Removed. Standardized on `OracleAvatar3D` (Three.js) |
| **OVR Lip Sync** | ✅ Live | `OracleAvatar3D` Three.js morph targets. GLB confirmed: 15 OVR visemes + eyeBlink morphs. |

---

## The Seeker's Journey — Current Correct Flow

```
dormant
  ↓ user tap → enterTerminal()
terminal  ← Oracle is SILENT. Lore types in. Gemini WS pre-warming.
  ↓ lore done (or skipped) → awakeFromTerminal()
awakened  ← +300ms: startSession() → Oracle greets "Greetings... Seeker"
           ← +1200ms: sendTextMessage(territories, hidden) → Oracle announces knives
           ← knife cards visible (horizontal scroll, 5 territories)
  ↓ knife selected → selectKnifeQuestion() → +1600ms: setScenePhase('oracle')
oracle    ← OracleAvatar3D Three.js live, AudioWorklet active, mic starts after first turn
  ↓ EXIT button → exitOracleMode() → 2500ms ceremony → dormant
```

**Key invariants:**
- `startSession()` in `awakeFromTerminal()` is the PRIMARY path that sends `__ORACLE_BOOT__`.
- `sessionBootedRef` guards double-boot — second call logs `SESSION ALREADY ACTIVE`.
- **Return Journey:** Returning seekers (IP/Local Storage) bypass lore via "RETURN TO ALLEY".
- **Neural Synthesis:** Portrait materializes inside the cabinet screen, replacing the Oracle face.
- **Reconnect (fixed 2026-05-31):** `isSessionReconnectRef` ensures `session.created` correctly identifies reconnects. Previously `reconnectAttemptsRef` was reset by `ws.onopen` before `session.created` fired, causing re-greeting on reconnect.

---

## API Key Map

| Replit Secret | Supabase Secret | Works For |
|---|---|---|
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | ✅ Google AI Studio free-tier key. Used by all EFAs. |

---

## Model Anchors

| Model | Location | Current ID | Notes |
|-------|----------|------------|-------|
| Gemini Live (primary) | `OracleConversation.tsx` | `models/gemini-2.5-flash-native-audio-latest` | AUDIO-only modality. Voice: `Sadaltager` |
| Gemini REST (fallback) | `oracle-conversation/index.ts` | `gemini-2.5-flash` | Text-only |
| Portrait Engine | `gemini-portrait-generator/index.ts` | `gemini-2.0-flash-preview-image-generation` | Image generation |

---

## Proxy: `gemini-live-proxy` — Session Config Sent on Connect

```json
{
  "type": "session.config",
  "model": "models/gemini-2.5-flash-native-audio-latest",
  "systemInstruction": { "parts": [{ "text": "<ORACLE_SYSTEM_PROMPT>" }] },
  "tools": [],
  "toolConfig": { "functionCallingConfig": { "mode": "NONE" } },
  "sessionResumption": { "handle": "<handle_or_empty_object>" },
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": { "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "Sadaltager" } } }
  }
}
```

**Proxy-side additions (not from client):**
- `contextWindowCompression: { slidingWindow: {} }` — prevents hard context-limit drops
- `toolConfig` forwarded as-is — definitively suppresses built-in Gemini tools (grounding, code execution)
- `sessionResumption` forwarded — enables native context restoration on reconnect

**Tool-use safety (fixed 2026-05-31):**
- `tools: []` alone does NOT suppress built-in Gemini tools
- `toolConfig: { functionCallingConfig: { mode: 'NONE' } }` is the canonical suppressor
- Proxy still intercepts any `toolCall` messages and rejects them as a second layer of defense

---

## Audio Pipeline (Enterprise Grade)

**Path:** Gemini WS → `PCMPlayer.feed()` → `DynamicsCompressor` → `OracleAudioProcessor` (AudioWorklet) → `AnalyserNode` → `PannerNode` (HRTF spatial) → `MasterGain(1.0)` → `Speakers`.

- **Off-Thread:** All PCM accumulation and FFT analysis in `oracle-audio.worklet.ts`.
- **Viseme Detection:** Real-time Preston Blair → OVR viseme mapping on the audio thread.
- **Normalization:** `DynamicsCompressor` (threshold=-22dBFS, ratio=10, attack=3ms, release=200ms) inserted before Analyser. Normalizes Gemini PCM amplitude regardless of TTS output level.
- **Amplitude scaling (worklet):** `rms * 10.0`, `SILENCE_THRESH = 0.010`. Catches soft TTS output.
- **Ingestion Robustness (fixed 2026-06-02):**
  - `ScriptProcessorNode` buffer increased to **2048 samples** for hardware stability.
  - `autoGainControl: true` enabled in mic constraints.
  - **Keep-alive gain:** `0.00001` node added to prevent browser suspension of mic processing.
  - **Loop-based base64:** Hardened binary conversion to avoid stack limits.
- **Oracle presence:** `masterGain` starts at 1.0 (start audible).
- **Spatial audio:** `PannerNode` (HRTF, rolloffFactor=0.6) positioned at (0, 0.3, -0.8) — Oracle voice comes from slightly above and in front. `updateHeadOrientation()` follows parallax.

**Radio / Music Ducking:**
- Separate path: `MediaElementSource` → `GainNode` → `Speakers`.
- `SESSION_AMBIENT = 0.008` — locks after Oracle first speaks. Never creeps back between turns.
- Oracle speaking: `0.001` (80ms linear cut). Rise back: 1500ms exponential (imperceptible).
- No `.muted` toggling — GainNode handles all silence to avoid click artifacts.

---

## OVR Lip Sync (confirmed against `hero3.glb`)

**Morph targets in GLB:**
`viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_ih`, `viseme_oh`, `viseme_ou`, `eyeBlinkLeft`, `eyeBlinkRight`

**Bones in GLB:**
`Head`, `Neck`, `Spine`, `Spine1`, `Spine2`, `LeftShoulder`, `RightShoulder`, `LeftArm`, `LeftForeArm`, `RightArm`, `RightForeArm`, `LeftEye`, `RightEye`, `EyeLeft`, `EyeRight`

**Worklet → OVR mapping:** Preston Blair (A-H, X) → OVR via `ORACLE_TO_OVR` table. Co-articulation: `openness→viseme_aa`, `rounded→viseme_oh/ou`, `spread→viseme_E/ih/SS`. Closedness driver: `viseme_PP` fires when `openness < 0.55` regardless of primary viseme.

---

## Session Summary: 2026-06-02

- **Vocal Ingestion Fix:** Hardened the PCM ingestion path. Fixed "silent mic" bugs via buffer expansion (2048), AGC, and keep-alive gain nodes.
- **Backend Refactor (Diegetic):** "Enculturate Crate" overhaul. Tabs replaced with **MHz Frequency Tuner**. UI cards refactored into **Signal Fragments**.
- **Live Metrics:** Real-time **Oscilloscope** added to CORE_DIAG tab for vocal signal verification.
- **Model Sync:** Verified and synchronized to `gemini-2.5-flash-native-audio-latest`.
- **Restore Point:** Git tag `restore-point-ingestion-fixed` created post-ingestion fix.

## Session Summary: 2026-05-31

- **Reconnect fix:** `isSessionReconnectRef` — Oracle no longer re-greets on WS drop/reconnect.
- **Tool suppression:** `toolConfig.functionCallingConfig.mode=NONE` added. Proxy forwards it.
- **Audio normalization:** DynamicsCompressor in PCM chain. masterGain 1.0→1.8.
- **Radio session lock:** `SESSION_AMBIENT=0.008` post-first-speech, 1500ms imperceptible rise.
- **Avatar:** Confirmed GLB morph/bone map. Head drift scaled 8× (was invisible). Shoulder/Spine2 wired. Lip closedness driver prevents jaw-only animation. Blink improved.
- **Brand audit:** All `#00ffff`/`#ff00ff` instances purged. "SURROGATE:ORACLE" canonical. Decart fully removed from copy.

## Session Summary: 2026-05-30
- **Residue Removal:** Deleted all Decart, MediaPipe, and legacy `OracleFaceRenderer` source code/styles.
- **Visuals:** "Cheshire Cat" branding (linger into omit) and "Glitch-Phase" downward float Oracle entrance.
- **Brand Kit:** `aAnotherTag` gradient headers and `PhillySans` subtext to all overlays.
- **Architecture:** Gemini-exclusive portrait pipeline; removed OpenAI/DALL-E 3.
