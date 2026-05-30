# SURROGATE:ORACLE — Gemini Integration Reference

Canonical knowledge base for the Gemini integration. Update when anything structural changes.
Last updated: 2026-05-30. Decart Residue Removal + Brand Kit Overhaul complete.

---

## Current Status

| Service | Status | Notes |
|---------|--------|-------|
| **Gemini Live WebSocket** (`gemini-live-proxy`) | ✅ Live | Free-tier AI Studio key (`GEMINI_API_KEY`). Model: `gemini-2.5-flash-native-audio-latest` |
| **Gemini REST fallback** (`oracle-conversation`) | ✅ Live | Same `GOOGLE_AI_API_KEY`. Model: `gemini-2.5-flash`. Text-only on WS drop |
| **Portrait Gen (Gemini)** (`gemini-portrait-generator`) | ✅ Live | `gemini-2.5-flash` enriches theme → **Gemini 2.0 Flash (Imagination Engine)** |
| **DALL-E 3 portraits** | ❌ DEPRECATED | Removed in favor of Gemini-exclusive pipeline |
| **Decart WebRTC avatar** | ❌ DEPRECATED | Removed residue. Standardized on `OracleAvatar3D` (Three.js) |
| **Living Lip-Sync** | ✅ Live | `OracleAvatar3D` Three.js morph targets. 409 frames/s capture. Off-thread processing via `AudioWorklet`. |

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
oracle    ← OracleAvatar3D Three.js live, AudioWorklet active, mic starts after first turn
  ↓ EXIT button → exitOracleMode() → 2500ms ceremony → dormant
```

**Key invariants:**
- `startSession()` in `awakeFromTerminal()` is the PRIMARY path that sends `__ORACLE_BOOT__`.
- The oracle-phase `useEffect` calls `startSession()` again; `sessionBootedRef` makes it a no-op (logs `SESSION ALREADY ACTIVE`).
- **Return Journey:** Returning seekers (IP/Local Storage) can bypass lore via "RETURN TO ALLEY".
- **Neural Synthesis:** During portrait generation, the minted portrait materializes directly inside the screen, replacing the Oracle face.

---

## API Key Map

| Replit Secret | Supabase Secret | Works For |
|---|---|---|
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | ✅ Google AI Studio free-tier key. Used by all EFAs. |

---

## Model Anchors

| Model | Location | Current ID | Notes |
|-------|----------|------------|-------|
| Gemini Live (primary) | `OracleConversation.tsx` | `models/gemini-2.5-flash-native-audio-latest` | AUDIO-only modality. Voice: `Charon` |
| Gemini REST (fallback) | `oracle-conversation/index.ts` | `gemini-2.5-flash` | Text-only |
| Portrait Engine | `gemini-portrait-generator/index.ts` | `gemini-2.0-flash-preview-image-generation` | Image generation |

---

## Audio Pipeline (Enterprise Grade)

**Path:** Gemini WS → `PCMPlayer.feed()` → `OracleAudioProcessor` (AudioWorklet) → `MasterGain` → `Speakers`.

- **Off-Thread:** All PCM accumulation and FFT analysis happens in `oracle-audio.worklet.ts`.
- **Viseme Detection:** Real-time Preston Blair viseme detection performed on the audio thread.
- **Latency:** Zero intermediate file creation. Direct base64 → Int16 → Float32 streaming.

---

## Session Summary: 2026-05-30 Overhaul
- **Residue Removal:** Deleted all Decart, MediaPipe, and legacy `OracleFaceRenderer` source code/styles.
- **Visuals:** Implemented "Cheshire Cat" branding (linger into omit) and "Glitch-Phase" downward float Oracle entrance.
- **Brand Kit:** Applied `aAnotherTag` gradient headers and `PhillySans` subtext to all overlays.
- **Architecture:** Transitioned to Gemini-exclusive portrait pipeline; removed OpenAI/DALL-E 3.
- **Verification:** Empirically verified 60fps viseme sync via live-fire pressure tests (409 active frames captured).
