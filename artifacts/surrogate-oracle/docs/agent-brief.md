# SURROGATE:ORACLE — Agent Brief
## Machine-readable constraints for IDE agents

---

### SCOPE
Files live under `artifacts/surrogate-oracle/src/` only.
Edge functions live under `supabase/functions/`.
Do not edit files outside these directories without explicit instruction.

---

### CSS RULE
ALL custom CSS lives in `src/components/SurrogateOracleImmersion.css`.
`index.css` is Tailwind boilerplate — do not add custom rules there.
Never add inline `style` props to replace CSS class rules.

---

### PHASES (exact spellings, no aliases)
```
'dormant' | 'terminal' | 'awakened' | 'oracle'
```
Scene transitions are one-way in forward direction. Exit via `exitOracleMode()` resets to `dormant`.

---

### REQUIRED REFS (must always exist in SurrogateOracleImmersion.tsx)
```typescript
const decartPendingHandoff = useRef(false);
const scenePhaseRef = useRef<'dormant' | 'terminal' | 'awakened' | 'oracle'>('dormant');
const isDecartActiveRef = useRef(false);
```
These are referenced in callbacks with `[] deps` — declaring them is non-negotiable.

---

### AUDIO CONTRACT

**Streaming (per-chunk, real-time):**
```typescript
pcmPlayerRef.current?.feed(pcmData: Int16Array); // PCMPlayer.ts — do not remove
```

**Batch (per-turn, off-main-thread):**
```typescript
// pcm-encoder.worker receives:
{ chunks: Int16Array[], sampleRate: number }
// pcm-encoder.worker emits:
{ audioUrl: string }  // blob: URL
// Parent receives via:
onOracleResponse(audioUrl: string);
```

**DO NOT** call `onOracleResponse(Int16Array)` per streaming chunk.
**DO NOT** remove `PCMPlayer.feed()` — it is the zero-latency real-time path.
**DO NOT** assemble WAV headers on the main thread — use the worker.

---

### WORKER IMPORT PATTERN (Vite)
```typescript
new Worker(
  new URL('../workers/pcm-encoder.worker.ts', import.meta.url),
  { type: 'module' }
)
```

---

### VISEME DETECTOR
- All state updates: direct DOM writes to `element.style` only
- No React state changes in the `onUpdate` callback hot path
- `connect()` is called once per audio element — do not reconnect (Web Audio graph is one-time)
- `fftSize`: 512 on mobile (`/Mobi|Android|iPhone/` UA), 1024 on desktop
- Adaptive frame rate: 8-frame rolling δt window; median > 25ms → halfFrameMode (30fps)

---

### GEMINI LIVE MODEL
```
models/gemini-2.5-flash-native-audio-latest
```
Audio-only modality. Text/thinking parts arrive as scratchpad (ORACLE_SCORE).
**DO NOT** add `responseModalities: ['TEXT']` — breaks the model.

---

### ORACLE_SCORE
Parsed from `[[ORACLE_SCORE: {...}]]` in Oracle text responses.
Stripped before display — never surfaced as numeric UI.
Used only to drive environmental feedback (alignment, portrait unlock, coin award).

---

### FORBIDDEN ACTIONS
```
✗ Add visible coin counters / numeric badges to main oracle flow
✗ Convert ghost text (DormantTransmissions) into modals or dialogs
✗ Hard-swap between oracle-avatar-static and oracle-avatar-img (always cross-dissolve)
✗ Set alley background opacity to 0 — Oracle lives in the alley
✗ Restore fixed SF1–SF5 ScrambleFragment positions — DormantTransmissions replaced them
✗ Call onOracleResponse with Int16Array per streaming chunk
✗ Remove PCMPlayer.feed() streaming path
✗ Move initializeOracle() / setShowConversation(true) from mount to later events
✗ Add responseModalities: ['TEXT'] to Gemini Live session config
✗ Increase bundle size by +300KB without explicit approval
```

---

### ALLOWED CHANGES (no approval needed)
```
✓ Adjust character-delay, hold, and beat-pause timing values
✓ Fine-tune opacity, blur, scale, filter values
✓ Enhance useAtmosphere canvas particle counts/speeds
✓ Optimize VisemeDetector band-energy thresholds
✓ Extend ORACLE_SCORE fields (server-side consequences only)
✓ Add CSS keyframes or transitions to SurrogateOracleImmersion.css
✓ Add dev-only window.__ hooks guarded by import.meta.env.DEV
```
