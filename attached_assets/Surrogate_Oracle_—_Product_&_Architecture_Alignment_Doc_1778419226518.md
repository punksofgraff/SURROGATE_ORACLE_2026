# Surrogate Oracle — Product & Architecture Alignment Doc

## What Surrogate Oracle Is

Surrogate Oracle (branded **SURROGATE:ORACLE** / **SNEAKAR AI Immersion**) is a cyberpunk-themed, immersive conversational AI avatar experience built as a front-end-forward React/TypeScript single-page app. The experience is designed as a gamified, culture-driven interactive installation — initially targeted at sneaker/streetwear brand activations under the SNEAKAR brand umbrella.

The core loop is:
1. User taps a static Oracle avatar image in a graffiti-alley scene.
2. The Oracle "wakes up" — connecting to a live lip-sync avatar stream.
3. The user has a voice or text conversation with the Oracle AI.
4. The Oracle speaks back with a lip-synced animated avatar face.
5. Users earn **Culture Coins** (a gamified rewards currency) for participating.

***

## What It Is Supposed to Do

### User-Facing Experience

- **Immersive entry**: Full-screen cyberpunk environment with graffiti alley background, animated SURROGATE:ORACLE branding, and a central Oracle portrait that serves as the tap-to-start CTA.
- **Live avatar conversation**: Once connected, the Oracle avatar animates with real-time lip sync while speaking AI-generated responses.
- **Voice + text modes**: Users can speak to the Oracle or type; the Oracle responds in kind.
- **Culture Coins (LEARN2EARN)**: Users earn coins for engagement. Coins are tracked in Supabase and displayed inline when authenticated.
- **GraffPunks Radio**: Background ambient audio streamed from RadioJar, toggled via an in-scene UI button.
- **Enculturate Crate**: A branded UI element that opens the Backend Control Panel (LEARN2EARN hub), which includes Coins, Squad, Portraits, and Debug tabs.
- **Google Sign-In overlay**: Authentication is optional but required to persist coin balances and squad features.

***

## Component Architecture

### Core Components

| Component | File | Role |
|---|---|---|
| `SurrogateOracleImmersion` | `SurrogateOracleImmersion.tsx` | Root orchestrator — manages all state, lifecycle, and layout |
| `DecartClient` | `DecartClient.tsx` | Avatar streaming client — WebSocket connection to Decart LipSync Live API |
| `OracleConversation` | `OracleConversation.tsx` | Manages the AI conversation loop; calls back with ElevenLabs audio URL for lip-sync |
| `BackendControlPanel` | `BackendControlPanel.tsx` | LEARN2EARN hub — Coins, Squad, Portraits, Debug tabs |
| `GoogleSignInOverlay` | `GoogleSignInOverlay.tsx` | Auth gate for Culture Coin-gated features |
| `GraffPunksRadio` | `GraffPunksRadio.tsx` | Ambient radio toggle UI |
| `EnculturateCrate` | `EnculturateCrate.tsx` | Branded crate icon that opens the backend panel |
| `CultureCoinInlineDisplay` | `CultureCoinInlineDisplay.tsx` | Coin balance badge shown when authenticated |
| `ConnectingAnimation` | `ConnectingAnimation.tsx` | Progress animation shown during Oracle stream initialization |

***

## Avatar Streaming: Decart LipSync Live

After pivoting away from D-ID WebRTC, the avatar is now driven by **Decart LipSync Live** via a WebSocket API.

### How It Works

1. `SurrogateOracleImmersion` calls `decartClientRef.current.initializeStream(ORACLE_IMAGE_URL, avatarCanvasRef.current)`.
2. `DecartClient` draws the static Oracle image onto a `anvas>` element as the base frame.
3. A WebSocket connects to `wss://api.decart.ai/v1/models/lipsync-live/stream?api_key=VITE_DECART_API_KEY`.
4. When the Oracle speaks, `OracleConversation` generates TTS audio (ElevenLabs), returns an audio URL to `handleOracleResponse`.
5. `handleOracleResponse` calls `decartClientRef.current.sendAudio(audioUrl)`, which sends the MP3 as base64 over the WebSocket.
6. Decart returns `video_frame` messages with `frame_base64` JPEG data.
7. Each frame is drawn onto `avatarCanvasRef` — the canvas paints the lip-synced Oracle face in real time.
8. `status` messages (`processing_started` / `processing_finished`) drive `isProcessing` state (e.g. audio ducking on GraffPunks Radio).

### Oracle Avatar Image

The base face used for lip-sync is the static Oracle portrait:
```
https://i.postimg.cc/26pvW2SN/orackle-only-static.png
```
This is defined as `ORACLE_IMAGE_URL` in `SurrogateOracleImmersion.tsx` and passed directly into `DecartClient.initializeStream()`.

### Imperative Handle API (DecartClientHandle)

`DecartClient` is a `forwardRef` component that exposes methods via `useImperativeHandle`:

```ts
interface DecartClientHandle {
  initializeStream(staticImageUrl: string, canvas: HTMLCanvasElement): Promise<{ success: boolean; error?: string }>;
  sendAudio(audioUrl: string): Promise<{ success: boolean; error?: string }>;
  closeStream(): Promise<void>;
  isStreamActive(): boolean;
  setCallbacks(callbacks: ClientCallbacks): void;
}
```

The parent (`SurrogateOracleImmersion`) holds a `useRef<DecartClientHandle | null>` and calls these methods imperatively — no class instantiation, no `new` keyword.

***

## Backend Architecture

### Supabase (Primary Backend)

| Resource | Purpose |
|---|---|
| **Supabase Auth** | Google Sign-In via OAuth overlay |
| **Postgres (NeonDB)** | `surrogate_sessions` table stores conversation state, stream metadata |
| **Edge Functions** | Proxy layer for third-party APIs |

### Environment Variables

| Variable | Location | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Client `.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client `.env` | Supabase public anon key |
| `VITE_DECART_API_KEY` | Client `.env` | Decart LipSync Live API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets | Supabase admin access (server-side only) |
| `DID_API_KEY` | ~~Edge Function secrets~~ | **Deprecated** — removed after D-ID pivot |
| `VITE_DID_AGENT_ID` | ~~Client `.env`~~ | **Deprecated** — removed after D-ID pivot |

### Active Edge Functions

| Function Name | Status | Purpose |
|---|---|---|
| `d-id-api-handler` | **Deprecated / Disabled** | Was the D-ID WebRTC proxy — no longer needed |

> No active Supabase Edge Functions are required for the Decart flow. The WebSocket connects directly from the browser client using the `VITE_DECART_API_KEY`.

***

## Data / State Flow

```
User taps Oracle image
        ↓
SurrogateOracleImmersion.initializeOracle()
        ↓
DecartClient.setCallbacks({ onConnected, onStreamReady, onTalkStarted, onTalkEnded, onDisconnected, onError })
        ↓
DecartClient.initializeStream(ORACLE_IMAGE_URL, avatarCanvasRef)
        → Draws static image to canvas
        → Opens WebSocket to Decart
        → onConnected() → oracleState.isConnected = true
        → onStreamReady() → oracleState.isReady = true → isOracleMode = true
        ↓
[OracleConversation renders in Oracle Mode Overlay]
        ↓
User speaks / types
        ↓
OracleConversation → AI response generated → ElevenLabs TTS → audioUrl
        ↓
SurrogateOracleImmersion.handleOracleResponse(audioUrl)
        ↓
DecartClient.sendAudio(audioUrl)
        → Fetch audio → convert to base64 → send via WebSocket
        → onTalkStarted() → isProcessing = true (radio volume ducks)
        → Decart returns video_frame messages → canvas painted frame-by-frame
        → onTalkEnded() → isProcessing = false
        ↓
User exits → exitOracleMode() → DecartClient.closeStream() → WebSocket closed
```

***

## Frontend Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite (port 5173 or 5174) |
| Animation | Framer Motion |
| Icons | Lucide React |
| Styling | CSS Modules (`SurrogateOracleImmersion.css`) |
| Canvas rendering | Native `HTMLCanvasElement` / `CanvasRenderingContext2D` |
| WebSocket | Native browser WebSocket API |
| Auth | Google OAuth via Supabase (`localStorage` dev session fallback) |
| Database | Supabase / NeonDB Postgres |
| Dev Environment | Replit WebContainer (`.webcontainer-api.io`) |

***

## Known Constraints & Callouts

- **OracleConversation must return an audio URL**, not plain text, into `onOracleResponse`. The Decart `sendAudio` method expects an ElevenLabs (or other TTS) audio file URL — not a text string. This is the most critical integration contract between `OracleConversation` and `SurrogateOracleImmersion`.
- **Canvas vs. video**: The D-ID integration used `<video>` elements. The Decart integration uses a `anvas>` element (`avatarCanvasRef`) rendered inside the oracle image container. The `<img>` static portrait fades out when Oracle mode is active and the canvas fades in.
- **WebContainer file persistence**: The Replit WebContainer environment resets in-browser file edits on full page refresh. Always commit / export updated files to the backing repo before refreshing the IDE tab.
- **No active Edge Function needed**: Unlike D-ID which required a Supabase proxy (`d-id-api-handler`), Decart's WebSocket connects directly from the browser. The only server-side Supabase work is session/coin persistence.
- **Dev auth fallback**: When no Supabase auth session exists, the app checks `localStorage` for a `dev_user_session` JSON object as a dev-mode bypass.