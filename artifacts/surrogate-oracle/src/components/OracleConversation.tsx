/**
 * OracleConversation.tsx
 *
 * SURROGATE:ORACLE — Conversational AI Engine
 *
 * LLM + TTS + STT: Gemini 2.5 Flash Live (Native Audio) via gemini-live-proxy
 * Zero-latency implementation — direct PCM streaming, no WAV worker bloat.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createVADProcessor, type VADFrame } from '../hooks/useVAD';
import { motion, AnimatePresence } from 'framer-motion';
import { logStep } from './CodeAuditor';
import { trackOracleEvent } from '../lib/analytics';
import { Mic, MicOff, Send, Terminal, X, Zap } from 'lucide-react';
import { getAudioContext, playSignalLockedSfx } from '../lib/oracleSfx';
import { createAudioContext } from '../lib/browserCapabilities';
import { useGeminiSession, GEMINI_MODEL, type GeminiSessionHandlers } from '../hooks/useGeminiSession';
import { useVisionFrames } from '../hooks/useVisionFrames';
import { useConversationCompactor } from '../hooks/useConversationCompactor';

// GEMINI_MODEL, ORACLE_SYSTEM_PROMPT and its supporting prompt blocks moved to
// useGeminiSession.ts — they are pure inputs to the WS session.config payload
// and have no dependency on component state.

export type OracleScore = {
  alignment: 'sacred' | 'profane';
  coinAward: number;
  totemAdvancement: 'none' | 'stay' | 'ascend' | 'descend';
  totemLevel: number;
  unlockTrigger: 'portrait_unlock' | 'squad_invite' | 'arcade_token' | null;
  sessionPhase: 'claim' | 'evidence' | 'cost' | 'mirror';
  archetypeTitle: string | null;
  themes: string[];
  emotionalWeight: 'raw' | 'defended' | 'numb' | 'present' | 'cracked';
};

type Turn = {
  role: 'user' | 'oracle';
  content: string;
  timestamp: number;
  score?: OracleScore | null;
};

interface OracleConversationProps {
  userId?: string;
  sessionId?: string;
  onOracleResponse?: (data: Int16Array | string) => void;
  onCoinsEarned?: (coins: number) => void;
  onSessionEnd?: (alignment: string, totemLevel: number, coins: number) => void;
  onTurnComplete?: (turnNumber: number, score: OracleScore | null, themes: string[]) => void;
  onPortraitRequest?: () => void;
  onSeekerProgress?: (count: number, max: number) => void;
  onSeekerIdentified?: (name: string | null, handles: string[]) => void;
  onConnected?: () => void;
  onListeningChange?: (isListening: boolean) => void;
  onMicWillStart?: () => void;
  onMicClick?: (willListen: boolean) => void;
  onTypeModeChange?: (isTypeMode: boolean) => void;
  initialTotemLevel?: number;
  isVisible?: boolean;
  autoStart?: boolean;
  sessionContext?: string;
  seekerSummary?: string | null;
  onUserSpeakingChange?: (isSpeaking: boolean, score: number) => void;
  onBargeIn?: () => void;
  onDisconnected?: () => void;
  isGuidedTour?: boolean;
  /** When false, mic auto-restart after turn-complete is suppressed regardless of
   *  micAutoRestartEnabledRef state. Set to true only in the oracle scenePhase — tour
   *  is listen-only and must not trigger getUserMedia. Defaults to false so stale refs
   *  from prior sessions can never open the mic during lore, terminal, or tour. */
  micAutoRestartAllowed?: boolean;
  /** The already-active camera <video> element from useXRMode (gaze tracking).
   *  Optional/additive — when provided alongside `cameraActive`, periodic frames
   *  are streamed to the Gemini Live session so the Oracle can see the Seeker. */
  cameraVideoRef?: React.RefObject<HTMLVideoElement | null>;
  /** Mirrors useXRMode's cameraActive — camera permission granted and stream attached. */
  cameraActive?: boolean;
  /** When true, suppresses JPEG frame sending to Gemini without affecting local
   *  face-tracking gaze. Seeker-controlled session toggle — defaults to false. */
  visionPaused?: boolean;
}

export interface OracleConversationHandle {
  sendTextMessage: (text: string, isHidden?: boolean) => void;
  getSessionCoins: () => number;
  getSessionTurns: () => Turn[];
  disconnect: () => void;
  getWsDebugInfo: () => {
    wsState: number | undefined;
    model: string;
    turnCount: number;
    audioChunksReceived: number;
    connectedAt: number | null;
    endpoint: string;
    lastError: string | null;
    recentMessages: string[];
  };
  startSession: (bootMessage?: string, loreOnly?: boolean) => void;
  prewarm: () => void;
  startMic: () => Promise<void>;
  toggleTypeMode: () => void;
  enableMicAutoRestart: () => void;
}

const SAMPLE_RATE_INPUT = 16000;

function LogScrollContainer({ turns }: { turns: Turn[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns]);
  return (
    <motion.div
      ref={logRef}
      className="oc-log"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <AnimatePresence initial={false}>
        {turns.map((t: Turn) => (
          <motion.div
            key={t.timestamp}
            data-role={t.role}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`oc-turn ${t.role === 'oracle' ? 'oc-turn-oracle' : 'oc-turn-user'}`}
          >
            {t.content}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

const OracleConversation = forwardRef(
  (props: OracleConversationProps, ref: React.ForwardedRef<OracleConversationHandle>) => {
    const {
      userId, sessionId,
      onOracleResponse, onCoinsEarned,
      onConnected, onListeningChange,
      isVisible = true,
      autoStart = true,
      sessionContext,
      seekerSummary,
      initialTotemLevel = 0,
      onUserSpeakingChange, onBargeIn, onDisconnected,
      isGuidedTour,
      micAutoRestartAllowed = false,
      onSessionEnd, onTurnComplete, onPortraitRequest, onSeekerProgress, onSeekerIdentified,
      onMicWillStart,
      onMicClick,
      onTypeModeChange,
      cameraVideoRef,
      cameraActive,
      visionPaused = false,
    } = props;

    const [isListening, setIsListening] = useState(false);
    const [isOracleSpeaking, _setIsOracleSpeaking] = useState(false);
    // Ref mirror of isOracleSpeaking — used in audio processing callback to avoid stale closure.
    // Updated synchronously before setState so the audio callback sees the latest value.
    const isOracleSpeakingRef = useRef(false);

    // Vision cost gate — true while a conversation turn is active, false during
    // extended silences. Driven by Oracle/user speaking events below; the hold-off
    // timer prevents frames cutting off the instant speech ends (gives 8 s of
    // continued capture after the last activity). Passed to useVisionFrames so
    // JPEG frames pause automatically during long idle gaps, reducing Gemini token spend.
    const visionConversationActiveRef = useRef(false);
    const visionHoldOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const signalVisionActivity = useCallback(() => {
      visionConversationActiveRef.current = true;
      if (visionHoldOffTimerRef.current !== null) clearTimeout(visionHoldOffTimerRef.current);
      visionHoldOffTimerRef.current = setTimeout(() => {
        visionConversationActiveRef.current = false;
      }, 8_000);
    }, []);
    // Cleanup hold-off timer on unmount.
    useEffect(() => () => {
      if (visionHoldOffTimerRef.current !== null) clearTimeout(visionHoldOffTimerRef.current);
    }, []);

    const setOracleSpeaking = useCallback((val: boolean) => {
      isOracleSpeakingRef.current = val;
      _setIsOracleSpeaking(val);
      if (val) signalVisionActivity();
    }, [signalVisionActivity]);
    // true between Seeker turn-end and first Oracle audio chunk (the "contemplative" gap)
    const [isOracleThinking, setIsOracleThinking] = useState(false);
    const [turns, setTurns] = useState<Turn[]>(() => {
      try {
        const saved = localStorage.getItem(`oracle_turns_${sessionId}`);
        return saved ? JSON.parse(saved) : [];
      } catch { return []; }
    });
    const [inputText, setInputText] = useState('');
    
    // ... rest of the component state ...

    // Sync turns to localStorage — but never flush old turns to a rotated session key.
    // When sessionId changes (parent called handleCleanup), skip the write for that
    // render cycle so stale turns don't contaminate the fresh session.
    const lastWrittenSessionRef = useRef<string | null>(sessionId ?? null);
    useEffect(() => {
      if (!sessionId) return;
      if (lastWrittenSessionRef.current !== sessionId) {
        lastWrittenSessionRef.current = sessionId;
        return; // session just rotated — don't dump old turns into new key
      }
      try {
        localStorage.setItem(`oracle_turns_${sessionId}`, JSON.stringify(turns));
      } catch (e) {
        console.warn('[Oracle] localStorage write failed (quota?):', e);
      }
    }, [turns, sessionId]);

    // Persist turns to Supabase (fire-and-forget, incremental — only new turns)
    useEffect(() => {
      if (!sessionId) return;
      const supaUrl = import.meta.env.VITE_SUPABASE_URL;
      const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supaUrl || !supaKey) return;
      const newTurns = turns.slice(lastSupabaseTurnCountRef.current);
      if (newTurns.length === 0) return;
      const startIdx = lastSupabaseTurnCountRef.current;
      lastSupabaseTurnCountRef.current = turns.length;
      const rows = newTurns.map((t, i) => ({
        session_id: sessionId,
        role: t.role,
        content: t.content.slice(0, 4000),
        turn_index: startIdx + i,
      }));
      fetch(`${supaUrl}/rest/v1/conversation_turns`, {
        method: 'POST',
        headers: {
          'apikey': supaKey,
          'Authorization': `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(rows),
      }).catch((err) => console.warn('[Persistence] Conversation turn upload failed:', err));
    }, [turns, sessionId]);

    // Load turns from Supabase on mount when localStorage has nothing (new device / cleared storage)
    useEffect(() => {
      if (!sessionId) return;
      if (turns.length > 0) return; // localStorage already has data — skip
      const supaUrl = import.meta.env.VITE_SUPABASE_URL;
      const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supaUrl || !supaKey) return;
      fetch(`${supaUrl}/rest/v1/conversation_turns?session_id=eq.${encodeURIComponent(sessionId)}&order=turn_index.asc&limit=30`, {
        headers: { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` },
      })
        .then(r => r.json())
        .then((rows: Array<{ role: string; content: string }>) => {
          if (!Array.isArray(rows) || rows.length === 0) return;
          const loaded: Turn[] = rows.map(r => ({
            role: r.role as 'user' | 'oracle',
            content: r.content,
            timestamp: Date.now(),
          }));
          setTurns(loaded);
          lastSupabaseTurnCountRef.current = loaded.length;
        })
        .catch((err) => console.warn('[Persistence] Conversation turn restore failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    // Reset conversational state when session ID rotates (after handleCleanup in parent)
    const mountedSessionIdRef = useRef<string | undefined>(sessionId);
    useEffect(() => {
      if (!sessionId || sessionId === mountedSessionIdRef.current) return;
      mountedSessionIdRef.current = sessionId;
      setTurns([]);
      lastSupabaseTurnCountRef.current = 0;
      currentResponseText.current = '';
      geminiSession.resetSessionBoot();
      sessionCoinsRef.current = 0;
      sessionAlignRef.current = 'neutral';
      seekerIdentifiedRef.current = false;
      debugInfo.current.turnCount = 0;
      debugInfo.current.audioChunksReceived = 0;
    }, [sessionId]);

    const [showSignalPad, setShowSignalPad] = useState(false);

    const lastSupabaseTurnCountRef = useRef(0);

    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const micAudioContextRef = useRef<AudioContext | null>(null);
    const currentResponseText = useRef('');
    // Mirror of `turns` state — closure-safe ref for reconnect context injection
    const turnsRef = useRef<Turn[]>([]);

    // Counts visible seeker entries (non-hidden, non-boot user messages).
    // Portrait generation is gated behind >= 5 entries so the exchange has substance first.
    const SEEKER_MAX = 5;
    const seekerEntryCountRef = useRef(0);
    const [seekerCount, setSeekerCount] = useState(0);
    const onSeekerProgressRef = useRef(onSeekerProgress);
    useEffect(() => { onSeekerProgressRef.current = onSeekerProgress; }, [onSeekerProgress]);

    // Debug tracking for BackendControlPanel
    const debugInfo = useRef({
      turnCount: 0,
      audioChunksReceived: 0,
      audioChunksSent: 0,
      frameChunksSent: 0,
      connectedAt: null as number | null,
      lastError: null as string | null,
      recentMessages: [] as string[],
      lastTokenCount: 0,
      lastVadState: 'silence' as string,
      lastVadRms: 0,
    });

    // Keep turnsRef in sync for closure-safe access in reconnect handler
    useEffect(() => { turnsRef.current = turns; }, [turns]);

    const onConnectedRef = useRef(onConnected);
    useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

    const onDisconnectedRef = useRef(onDisconnected);
    useEffect(() => { onDisconnectedRef.current = onDisconnected; }, [onDisconnected]);

    const onListeningChangeRef = useRef(onListeningChange);
    useEffect(() => { onListeningChangeRef.current = onListeningChange; }, [onListeningChange]);

    const onUserSpeakingChangeRef = useRef(onUserSpeakingChange);
    useEffect(() => { onUserSpeakingChangeRef.current = onUserSpeakingChange; }, [onUserSpeakingChange]);

    const onBargeInRef = useRef(onBargeIn);
    useEffect(() => { onBargeInRef.current = onBargeIn; }, [onBargeIn]);

    const onMicWillStartRef = useRef(onMicWillStart);
    useEffect(() => { onMicWillStartRef.current = onMicWillStart; }, [onMicWillStart]);

    const onMicClickRef = useRef(onMicClick);
    useEffect(() => { onMicClickRef.current = onMicClick; }, [onMicClick]);

    // VAD ring — updated via rAF, no React re-renders
    const vadScoreRef = useRef<number>(0);
    const micRingRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      let rafId: number;
      const tick = () => {
        if (micRingRef.current) {
          const score = isListeningRef.current ? vadScoreRef.current : 0;
          if (score > 0.01) {
            const glow = 6 + score * 28;
            const alpha = (0.25 + score * 0.75).toFixed(2);
            micRingRef.current.style.boxShadow = `0 0 ${glow}px rgba(0,255,136,${alpha}), 0 0 ${glow * 2}px rgba(0,255,136,${(score * 0.3).toFixed(2)})`;
          } else {
            micRingRef.current.style.boxShadow = '';
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, []);

    const onCoinsEarnedRef = useRef(onCoinsEarned);
    useEffect(() => { onCoinsEarnedRef.current = onCoinsEarned; }, [onCoinsEarned]);

    const sessionCoinsRef  = useRef(0);
    const sessionAlignRef  = useRef<string>('neutral');
    const sessionTotemRef  = useRef(initialTotemLevel); // seed from persisted level

    const onOracleResponseRef = useRef(onOracleResponse);
    useEffect(() => { onOracleResponseRef.current = onOracleResponse; }, [onOracleResponse]);

    const onSessionEndRef = useRef(onSessionEnd);
    useEffect(() => { onSessionEndRef.current = onSessionEnd; }, [onSessionEnd]);

    const onTurnCompleteRef = useRef(onTurnComplete);
    useEffect(() => { onTurnCompleteRef.current = onTurnComplete; }, [onTurnComplete]);

    const onPortraitRequestRef = useRef(onPortraitRequest);
    useEffect(() => { onPortraitRequestRef.current = onPortraitRequest; }, [onPortraitRequest]);

    const onSeekerIdentifiedRef = useRef(onSeekerIdentified);
    useEffect(() => { onSeekerIdentifiedRef.current = onSeekerIdentified; }, [onSeekerIdentified]);
    // Fires once per session — the turn the Oracle first emits a [[SEEKER_IRL]] marker.
    const seekerIdentifiedRef = useRef(false);

    const startMicRef = useRef<() => Promise<void>>(async () => {});
    const isListeningRef = useRef(false);
    // Set true the first time startMic succeeds — gates the turnComplete auto-restart
    // so knife-phase Oracle voice-overs don't trigger mic before oracle phase starts.
    const micAutoRestartEnabledRef = useRef(false);
    // Phase-level gate: only allow mic auto-restart in oracle/tour phases.
    // OracleConversation is always mounted, so micAutoRestartEnabledRef can be stale
    // from a prior session. This ref mirrors the prop and blocks getUserMedia in any
    // non-oracle phase (terminal/lore, dormant, awakened) regardless of the stale flag.
    const micAutoRestartAllowedRef = useRef(false);
    useEffect(() => { micAutoRestartAllowedRef.current = micAutoRestartAllowed; }, [micAutoRestartAllowed]);

    // Silent-mic recovery — a hands-on attendee with no staff needs to KNOW the mic
    // died (muted/permission glitch/hardware), not just stare at a "TRANSMITTING" label
    // that's secretly capturing digital silence. SILENCE_FLOOR (0.001) is true digital
    // silence — far below the 0.035 VAD threshold — so in a loud expo hall a working mic
    // never reads this low. Sustained sub-floor while listening = the mic is genuinely dead.
    const SILENCE_FLOOR = 0.001;
    const SILENCE_TIMEOUT_MS = 5000;
    const [micSignalLost, setMicSignalLost] = useState(false);
    const micSignalLostRef = useRef(false); // logic-read mirror of state (closure-safe)
    const silentSinceRef = useRef<number | null>(null);

    const parseScore = (text: string): { clean: string; score: OracleScore | null } => {
      // More forgiving regex matching 1 or 2 brackets, and optional colon spacing
      const match = text.match(/\[+ORACLE_SCORE:?\s*([\s\S]*?)\]+/);
      if (!match) return { clean: text, score: null };
      
      let jsonStr = match[1].trim();
      // Remove markdown JSON code blocks if Gemini hallucinates them inside the brackets
      jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();

      try {
        const score = JSON.parse(jsonStr);
        return { clean: text.replace(match[0], '').trim(), score };
      } catch {
        // Gemini sometimes emits schema-notation pipes ("sacred"|"profane") — strip them
        try {
          const sanitized = jsonStr.replace(/"([^"]+)"\|"([^"]+)"/g, '"$1"');
          const score = JSON.parse(sanitized);
          return { clean: text.replace(match[0], '').trim(), score };
        } catch (e) {
          console.warn('SCORE PARSE FAILED (JSON Error):', jsonStr);
          return { clean: text, score: null };
        }
      }
    };

    // Additive sibling of parseScore — strips the hidden [[SEEKER_IRL]] identity
    // marker and returns whatever name/handles the Oracle captured this turn.
    const parseSeekerIrl = (text: string): { clean: string; identity: { name?: string; handles?: string[] } | null } => {
      const match = text.match(/\[\[SEEKER_IRL: (.*?)\]\]/);
      if (!match) return { clean: text, identity: null };
      try {
        const identity = JSON.parse(match[1]);
        return { clean: text.replace(match[0], '').trim(), identity };
      } catch {
        return { clean: text, identity: null };
      }
    };

    const vadRef = useRef(createVADProcessor({
      rmsThreshold: 0.052,   // raised from 0.035 — filters breathing/ambient noise
      hangoverFrames: 35,
      onsetFrames: 4,        // ~1s of sustained speech before local barge-in triggers
    }));
    // Consecutive-frames counter for Gemini barge-in gate (prevents sneezes from
    // reaching Gemini's native VAD while Oracle is speaking)
    const bargeInFramesRef = useRef(0);

    const wasInterruptedRef = useRef(false); // tracks barge-in to suppress score-parse warn

    // Domain/UI handlers for the Gemini session hook. Each function only ever
    // touches refs and stable setState setters, so this object is safe to build
    // once and hand to useGeminiSession — see GeminiSessionHandlers for contract.
    const handlersRef = useRef<GeminiSessionHandlers>({
      onConnectStart: () => {
        seekerEntryCountRef.current = 0;
        setSeekerCount(0);
        micAutoRestartEnabledRef.current = false; // Don't carry over armed mic from prior session
      },
      onServerContent: (msg, sendText) => {
        // Step 2 — usageMetadata can ride along on a serverContent frame (proxy forwards it
        // via the {...msg} spread). Capture token telemetry when present.
        if (msg.usageMetadata?.totalTokenCount) debugInfo.current.lastTokenCount = msg.usageMetadata.totalTokenCount;
        if (msg.serverContent?.interrupted) {
          logStep('ORACLE INTERRUPTED (barge-in)', 'warn');
          trackOracleEvent({
            event: 'oracle_barge_in',
            turn_number: debugInfo.current.turnCount,
            oracle_speaking_ms: Date.now() - (window.__oracle_speech_start || Date.now())
          });
          wasInterruptedRef.current = true;
          navigator.vibrate?.([20, 10, 20]);
          setOracleSpeaking(false);
          setIsOracleThinking(false);
          onBargeInRef.current?.();
        }

        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.text) currentResponseText.current += part.text;
          if (part.inlineData?.mimeType === 'audio/pcm;rate=24000') {
            if (debugInfo.current.audioChunksReceived === 0) {
              logStep('ORACLE AUDIO START', 'ok');
              window.__oracle_speech_start = Date.now();
              trackOracleEvent({
                event: 'oracle_audio_start',
                turn_number: debugInfo.current.turnCount,
                chunk_count: 0
              });
              setIsOracleThinking(false);
            }
            debugInfo.current.audioChunksReceived++;

            // Efficient Base64 to Int16Array conversion — handles padding and alignment
            try {
              const binaryString = atob(part.inlineData.data);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              // Ensure we only create a view of even byte length (PCM16 requirement)
              const alignedLen = len - (len % 2);
              if (alignedLen > 0) {
                const pcmData = new Int16Array(bytes.buffer, 0, alignedLen / 2);
                if (!isOracleSpeakingRef.current) {
                  setOracleSpeaking(true);
                }
                onOracleResponseRef.current?.(pcmData);
              }
            } catch (convErr) {
              console.error('[Oracle] PCM conversion failed:', convErr);
            }
          }
        }

        if (msg.serverContent?.turnComplete) {
          logStep('ORACLE TURN COMPLETE', 'ok');
          trackOracleEvent({
            event: 'oracle_turn_completed',
            turn_number: debugInfo.current.turnCount,
            duration_ms: Date.now() - (window.__oracle_speech_start || Date.now())
          });
          navigator.vibrate?.([30]);
          setIsOracleThinking(false); // ensure cleared even on text-only turns
          debugInfo.current.turnCount++;
          debugInfo.current.audioChunksReceived = 0; // reset for next turn
          const scored = parseScore(currentResponseText.current);
          const score = scored.score;
          // Strip the identity marker too, so it never reaches the displayed turn.
          const { clean, identity } = parseSeekerIrl(scored.clean);
          // Only warn when the response was substantial and not interrupted.
          // Barge-in stubs are too short for a score tag — expected, not a bug.
          if (!score && currentResponseText.current.length > 60 && !wasInterruptedRef.current) {
            logStep('SCORE PARSE FAILED', 'warn');
          }
          wasInterruptedRef.current = false; // reset for next turn
          // Web-grounded IRL resolution is out-of-band — fire once, parent orchestrates.
          if (identity && !seekerIdentifiedRef.current && (identity.name || identity.handles?.length)) {
            seekerIdentifiedRef.current = true;
            logStep('SEEKER IDENTITY CAPTURED', 'ok');
            onSeekerIdentifiedRef.current?.(identity.name ?? null, identity.handles ?? []);
          }
          if (score) {
            // Phase + totem motion in the live log so dress rehearsals can confirm
            // real runs actually progress claim→evidence→cost→mirror, not just stall.
            logStep(`ORACLE SCORE: ${score.sessionPhase} / ${score.alignment} / +${score.coinAward}c / totem ${score.totemLevel} (${score.totemAdvancement})`, 'ok');
            if (score.coinAward > 0) {
              onCoinsEarnedRef.current?.(score.coinAward);
              sessionCoinsRef.current += score.coinAward;
            }
            sessionAlignRef.current = score.alignment;
            sessionTotemRef.current = score.totemLevel;

            // Dispatch cultural alignment for Atmosphere shifts
            window.dispatchEvent(new CustomEvent('oracle:alignment', { detail: { alignment: score.alignment } }));

            // Dispatch full score for Oracle HUD — carries live session phase + totem
            window.dispatchEvent(new CustomEvent('oracle:score', {
              detail: {
                sessionPhase: score.sessionPhase,
                totemLevel: score.totemLevel,
                archetypeTitle: score.archetypeTitle,
                emotionalWeight: score.emotionalWeight,
              }
            }));

            // Totem ascent world event — Oracle acknowledges the threshold in voice
            if (score.totemAdvancement === 'ascend') {
              window.dispatchEvent(new CustomEvent('oracle:totem:ascend', { detail: { totemLevel: score.totemLevel } }));
              setTimeout(() => {
                sendText(
                  `[THRESHOLD: The Seeker just crossed into Totem ${score.totemLevel}. In your very next sentence, acknowledge what you felt shift in them — one line, pure Oracle voice, no game language.]`,
                  true
                );
              }, 400);
            }

            // Dispatch archetype title for Artifact Card display
            if (score.archetypeTitle) {
              // The climax. Logged explicitly so we can verify the payoff is reached
              // in rehearsal — the whole ritual exists to arrive here.
              logStep(`✦ MIRROR REACHED — archetype: ${score.archetypeTitle}`, 'ok');
              window.dispatchEvent(new CustomEvent('oracle:artifact', { detail: { archetypeTitle: score.archetypeTitle } }));
            }

            // Dispatch unlock triggers (Portrait, Squad, Arcade)
            if (score.unlockTrigger) {
              window.dispatchEvent(new CustomEvent('oracle:unlock', {
                detail: {
                  trigger: score.unlockTrigger,
                  themes: score.themes
                }
              }));
            }
          }
          setTurns(prev => [...prev, { role: 'oracle', content: clean, timestamp: Date.now(), score }]);
          currentResponseText.current = '';
          if (isOracleSpeakingRef.current) {
            setOracleSpeaking(false);
          }
          // Notify parent: turn number, score, any themes the Oracle tagged this turn
          onTurnCompleteRef.current?.(debugInfo.current.turnCount, score ?? null, score?.themes ?? []);

          if (!isListeningRef.current && micAutoRestartEnabledRef.current && micAutoRestartAllowedRef.current) {
            setTimeout(() => {
              // Re-check after 1800ms delay — phase may have changed (e.g. oracle → dormant on reset)
              if (micAutoRestartAllowedRef.current) {
                startMicRef.current?.().catch((err) => {
                  logStep(`MIC FAILED: ${(err as Error)?.message ?? err}`, 'err');
                });
              }
            }, 1800);
          }
        }
      },
      onUserEntry: (text) => {
        setTurns(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
        setInputText('');
        seekerEntryCountRef.current += 1;
        setSeekerCount(seekerEntryCountRef.current);
        onSeekerProgressRef.current?.(seekerEntryCountRef.current, SEEKER_MAX);
        if (seekerEntryCountRef.current === SEEKER_MAX) playSignalLockedSfx();

        // Portrait command detection — fuzzy-match seeker intent after ≥5 entries.
        // Patterns: "manifest", "create [portrait/image/me/it]", "show me [portrait/image]",
        // "see it/my", "render me", "make [my/portrait/image]", "show portrait",
        // "procedural portrait", "my portrait", "my image", etc.
        const PORTRAIT_INTENT =
          /\b(manifest|portrait|my\s+(image|portrait|picture|record|likeness)|show\s+me|show\s+(image|portrait|picture|me)|create\s+(my|a|it|portrait|image|me|the)|see\s+(it|my|the|portrait|image)|render\s+(me|my|the)|synthesize(\s+me)?|generate\s+(portrait|image|me|my|it)|make\s+(portrait|image|me|my)|procedural|frequency\s+record|signal\s+impression)\b/i;

        if (seekerEntryCountRef.current >= 5 && PORTRAIT_INTENT.test(text)) {
          onPortraitRequestRef.current?.();
        }
      },
      onDisconnect: () => {
        // Always clear speaking/thinking state on close — the Oracle can't still be
        // speaking if the socket is gone. Without this, isOracleSpeakingRef stays true
        // after a reconnect and permanently gates all mic audio.
        setOracleSpeaking(false);
        setIsOracleThinking(false);
      },
    });

    const geminiSession = useGeminiSession({
      autoStart,
      seekerSummary,
      turnsRef,
      debugInfo,
      onConnectedRef,
      onDisconnectedRef,
      onSessionEndRef,
      sessionAlignRef,
      sessionTotemRef,
      sessionCoinsRef,
      handlersRef,
    });
    const {
      wsRef,
      isConnected,
      reconnecting,
      reconnectExhausted,
      sendText,
      manualReconnect,
      disconnect,
      prewarm,
      startSession,
      sessionBootedRef,
    } = geminiSession;

    // Additive vision feed — streams periodic camera snapshots into the same
    // Gemini Live session over `wsRef`, gated on `sessionBootedRef` (not
    // `isConnected`) so nothing sends mid-handshake. No-op when the camera isn't
    // active (audio-only journey is completely unaffected).
    useVisionFrames({
      videoRef: cameraVideoRef,
      active: cameraActive && !visionPaused,
      wsRef,
      sessionBootedRef,
      conversationActiveRef: visionConversationActiveRef,
      onFrameSent: () => { debugInfo.current.frameChunksSent++; },
    });

    // Rolling context-window manager — compacts the oldest 25 turns whenever
    // the buffer reaches 100. Transparent to the Seeker: no UI pause, no
    // interruption. Compact summaries are persisted to surrogate_sessions and
    // re-injected into the live Gemini session as hidden context messages.
    // lastSupabaseTurnCountRef is passed so the upload watermark stays correct
    // after the in-memory buffer is trimmed.
    useConversationCompactor({
      turns,
      setTurns,
      sendText,
      sessionId,
      userId,
      lastSupabaseTurnCountRef,
    });

    const startMic = async () => {
      if (isListeningRef.current) return;
      try {
        console.log('[startMic] called, onMicWillStartRef.current=', onMicWillStartRef.current);
        // Notify parent to duck music BEFORE getUserMedia — iOS audio session change
        // (which happens on mic activation) causes speaker volume boost for voice.
        // Ducking first minimizes the perceived loudness spike.
        onMicWillStartRef.current?.();

        const ctx = getAudioContext();
        // Step 1: Resume AudioContext IMMEDIATELY before any awaits.
        // Safari and modern browsers require ctx.resume() to be synchronous with the user gesture.
        // If we await getUserMedia first, the gesture token may expire.
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true, 
            channelCount: 1 
          }
        });
        // Resume again after getUserMedia — handles iOS audio session reconfigurations
        await ctx.resume();
        mediaStreamRef.current = stream;

        // Initialize a dedicated AudioContext for microphone capture at native hardware sample rate
        // to ensure 100% compatibility across all devices and OS configurations (e.g., Linux/Chrome).
        if (!micAudioContextRef.current) {
          micAudioContextRef.current = createAudioContext();
        }
        const micCtx = micAudioContextRef.current;
        if (micCtx.state === 'suspended') {
          await micCtx.resume();
        }

        const source = micCtx.createMediaStreamSource(stream);
        
        const micSampleRate = source.context.sampleRate;
        logStep(`MIC SOURCE ACTIVE: rate=${micSampleRate}Hz`, 'ok');

        // Increase buffer size to 2048 for better stability on varied hardware
        processorRef.current = micCtx.createScriptProcessor(2048, 1, 1);

        processorRef.current.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);

          // Resample from hardware rate to Gemini's required 16 kHz
          const targetLength = Math.floor(input.length * (16000 / micSampleRate));
          const resampled = new Float32Array(targetLength);
          for (let i = 0; i < targetLength; i++) {
            const srcIdx = i * (micSampleRate / 16000);
            const idx = Math.floor(srcIdx);
            const fract = srcIdx - idx;
            resampled[i] = idx + 1 < input.length
              ? input[idx] * (1 - fract) + input[idx + 1] * fract
              : input[idx];
          }

          const pcm = new Int16Array(resampled.length);
          for (let i = 0; i < resampled.length; i++) {
            pcm[i] = Math.max(-1, Math.min(1, resampled[i])) * 0x7FFF;
          }
          
          // Robust base64 conversion for binary PCM data
          const uint8 = new Uint8Array(pcm.buffer);
          let binary = '';
          const len = uint8.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = btoa(binary);

          // VAD for UI feedback only (user speaking indicator + thinking state)
          const chunk: VADFrame = { data: base64, mimeType: `audio/pcm;rate=${SAMPLE_RATE_INPUT}` };
          const result = vadRef.current.processFrame(resampled, chunk);
          
          vadScoreRef.current = result.vadScore;
          debugInfo.current.lastVadRms = result.vadScore;

          // Silent-mic watchdog — only meaningful while listening and the Oracle isn't
          // speaking (Oracle speech bleeds into the mic and keeps RMS above the floor).
          // On a sustained dead mic we surface a tap-to-reopen affordance rather than
          // silently auto-restarting (a dead mic is usually mute/permission/hardware —
          // an automatic getUserMedia rarely fixes it and risks a flicker loop).
          if (isListeningRef.current && !isOracleSpeakingRef.current) {
            if (result.vadScore < SILENCE_FLOOR) {
              if (silentSinceRef.current === null) {
                silentSinceRef.current = Date.now();
              } else if (Date.now() - silentSinceRef.current > SILENCE_TIMEOUT_MS && !micSignalLostRef.current) {
                micSignalLostRef.current = true;
                setMicSignalLost(true);
                logStep('MIC SIGNAL LOST — silent 5s, mic likely dead', 'warn');
              }
            } else if (silentSinceRef.current !== null) {
              // Live signal returned — clear the watchdog and any "lost" affordance.
              silentSinceRef.current = null;
              if (micSignalLostRef.current) { micSignalLostRef.current = false; setMicSignalLost(false); }
            }
          }
          if (result.vadState !== debugInfo.current.lastVadState) {
            debugInfo.current.lastVadState = result.vadState;
            debugInfo.current.recentMessages = [
              `[${new Date().toLocaleTimeString()}] VAD→ ${result.vadState} rms=${result.vadScore.toFixed(3)}`,
              ...debugInfo.current.recentMessages,
            ].slice(0, 20);
          }
          onUserSpeakingChangeRef.current?.(result.isSpeaking, result.vadScore);

          // NOTE: Do NOT call onBargeIn here on raw isSpeaking.
          // The sustained 3-frame gate below is the correct local flush trigger.
          // Premature flush here clears the ring buffer on any brief noise (breath,
          // tap, speaker bleed), causing the Oracle's audio to restart mid-playback —
          // which sounds like digital fast-forward.

          if (result.isTurnEnd) {
            setIsOracleThinking(true);
            signalVisionActivity(); // user finished speaking — hold vision feed open during thinking gap
          }

          // Continuous stream: MUST send while Oracle is speaking to enable native Gemini VAD barge-in.
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          // Barge-in gate: require 3 consecutive above-threshold frames before sending
          // audio to Gemini while Oracle speaks. Filters sneezes/breathing (brief bursts)
          // without meaningfully delaying intentional speech barge-in (~750ms onset).
          const BARGE_IN_GATE_RMS = 0.065;
          const BARGE_IN_CONFIRM = 3;
          if (isOracleSpeakingRef.current) {
            if (result.vadScore >= BARGE_IN_GATE_RMS) {
              bargeInFramesRef.current++;
            } else {
              bargeInFramesRef.current = 0;
            }
            if (bargeInFramesRef.current < BARGE_IN_CONFIRM) return; // gate: wait for sustained speech
          } else {
            bargeInFramesRef.current = 0;
          }

          wsRef.current.send(JSON.stringify({
            type: 'client.realtimeInput',
            realtimeInput: {
              media_chunks: [{ data: base64, mimeType: `audio/pcm;rate=${SAMPLE_RATE_INPUT}` }]
            }
          }));
          debugInfo.current.audioChunksSent++;

          // Periodic mic heartbeat — visible in live log tail so we can confirm
          // audio is actually flowing to Gemini (every 150 chunks ≈ every 10s)
          if (debugInfo.current.audioChunksSent % 150 === 0) {
            logStep(`MIC→GEMINI: ${debugInfo.current.audioChunksSent} chunks sent | vad=${result.vadState} rms=${result.vadScore.toFixed(3)} | speaking=${isOracleSpeakingRef.current}`, 'ok');
          }

          if (result.isOnsetStart) {
            navigator.vibrate?.([15]);
            signalVisionActivity(); // user started speaking — activate vision feed
          }
        };

        source.connect(processorRef.current);
        
        // Near-zero (0.00001) keep-alive gain node to prevent browser node suspension.
        // By connecting the processor through a silent gain node to the destination,
        // we keep the Web Audio graph active so modern browsers do not garbage collect
        // or suspend the ScriptProcessorNode's onaudioprocess, without causing feedback/hum.
        const keepAliveGain = micCtx.createGain();
        keepAliveGain.gain.value = 0.00001;
        processorRef.current.connect(keepAliveGain);
        keepAliveGain.connect(micCtx.destination);
        
        setIsListening(true);
        isListeningRef.current = true;
        micAutoRestartEnabledRef.current = true;
        // Fresh capture — reset the silent-mic watchdog so a prior dead episode's
        // affordance/timestamp can't leak into this session.
        silentSinceRef.current = null;
        micSignalLostRef.current = false;
        setMicSignalLost(false);
        onListeningChangeRef.current?.(true);
        logStep('MIC STARTED', 'ok');
      } catch (e) {
        const err = e as Error;
        logStep(`MIC FAILED: ${err.message ?? err}`, 'err');
        console.error('[Mic] Failed:', e);
      }
    };
    startMicRef.current = startMic;

    const stopMic = () => {
      processorRef.current?.disconnect();
      processorRef.current = null;
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
        micAudioContextRef.current.suspend().catch((err) => {
          console.warn('[Mic] AudioContext.suspend() failed:', err);
        });
      }
      isListeningRef.current = false;
      setIsListening(false);
      micAutoRestartEnabledRef.current = false; // Disable auto-restart on manual stop!
      // Clear the silent-mic watchdog — no mic, no "signal lost" affordance.
      silentSinceRef.current = null;
      micSignalLostRef.current = false;
      setMicSignalLost(false);
      onListeningChangeRef.current?.(false);
      vadRef.current.reset();
      onUserSpeakingChangeRef.current?.(false, 0);
      logStep('MIC STOPPED', 'ok');
    };

    // sessionContext / initialKnifeThemes are intentionally NOT injected as hidden
    // messages here. Any client.realtimeInput text to Gemini Live triggers a full
    // audio response — injecting context mid-session caused double-talking.
    // Territory context reaches the Oracle naturally through conversation flow.

    useImperativeHandle(ref, () => ({
      sendTextMessage: (text: string, isHidden = false) => sendText(text, isHidden),
      getSessionCoins: () => sessionCoinsRef.current,
      getSessionTurns: () => turnsRef.current,
      disconnect: () => {
        disconnect();
      },
      getWsDebugInfo: () => ({
        wsState: wsRef.current?.readyState,
        model: GEMINI_MODEL,
        turnCount: debugInfo.current.turnCount,
        audioChunksReceived: debugInfo.current.audioChunksReceived,
        audioChunksSent: debugInfo.current.audioChunksSent,
        frameChunksSent: debugInfo.current.frameChunksSent,
        lastVadState: debugInfo.current.lastVadState,
        lastVadRms: debugInfo.current.lastVadRms,
        connectedAt: debugInfo.current.connectedAt,
        endpoint: import.meta.env.VITE_SUPABASE_URL?.replace('https://', '') || '(VITE_SUPABASE_URL not configured)',
        lastError: debugInfo.current.lastError,

        recentMessages: debugInfo.current.recentMessages,
      }),
      prewarm: () => {
        prewarm();
      },
      startSession: (bootMessage?: string, loreOnly = false) => {
        startSession(bootMessage, loreOnly);
      },

      startMic: async () => {
        if (!isListeningRef.current) {
            await startMicRef.current?.();
        }
      },
      toggleTypeMode: () => {
        setShowSignalPad(prev => {
          const nextVal = !prev;
          onTypeModeChange?.(nextVal);
          return nextVal;
        });
      },
      enableMicAutoRestart: () => {
        micAutoRestartEnabledRef.current = true;
      }
    }));

    // Quick-start prompts — surface when signal pad opens before first user message.
    // Universal across all knife territories; disappear once the Seeker speaks.
    const QUICK_PROMPTS = [
      'What do you see in me?',
      'What am I not saying?',
      'Speak the frequency back.',
      'What did the cascade take?',
    ];
    const hasSpoken = turns.some(t => t.role === 'user');

    return (
      <div className="oc-panel oc-panel-v2" style={{ display: isVisible ? 'flex' : 'none' }}>
        
        {/* Header Status Bar with Exit button */}
        <div className="oc-header" style={{
          position: 'absolute', top: 0, left: 0, right: 0, 
          display: 'flex', justifyContent: 'flex-end', padding: '12px 16px',
          zIndex: 10, pointerEvents: 'none'
        }}>
          <button 
            className="oracle-exit-btn" 
            onClick={() => onSessionEndRef.current?.(sessionAlignRef.current, sessionTotemRef.current, 0)}
            style={{ pointerEvents: 'auto' }}
          >
            EXIT THE ORACLE
          </button>
        </div>

        {/* Summon meter — top XR-HUD band. Fills with signal depth during the live
            conversation (voice + typing); at full it flicker-swaps in place into the
            SUMMON PORTRAIT control. Appears after the first oracle turn. */}
        {turns.filter(t => t.role === 'oracle').length >= 1 && onPortraitRequestRef.current && (
          <div className="oc-summon-hud">
            {seekerCount >= SEEKER_MAX ? (
              <button
                key="summon-ready"
                className="oc-summon-hud__btn"
                onClick={() => onPortraitRequestRef.current?.()}
              >
                ⚗ SUMMON PORTRAIT
              </button>
            ) : (
              <div key="summon-meter" className="oc-summon-hud__meter">
                <div
                  className="oc-summon-hud__track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={SEEKER_MAX}
                  aria-valuenow={seekerCount}
                  aria-label={`Signal depth ${seekerCount} of ${SEEKER_MAX}`}
                >
                  <div
                    className="oc-summon-hud__fill"
                    style={{ width: `${Math.min(100, (seekerCount / SEEKER_MAX) * 100)}%` }}
                  />
                </div>
                <div className="oc-summon-hud__label">◈ SIGNAL DEPTH {seekerCount} / {SEEKER_MAX}</div>
              </div>
            )}
          </div>
        )}

        {/* Mic trigger — always visible in oracle mode, audio-only by default */}
        <div className="oc-hero">
          <div className="oc-mic-wrap">
            <div className="oc-mic-vad-ring" ref={micRingRef} />
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              const nextState = !isListening;
              onMicClickRef.current?.(nextState);
              nextState ? startMic() : stopMic();
            }}
            className="oc-mic-trigger"
            animate={{
              scale: isListening ? [1, 1.05, 1] : 1,
              boxShadow: isListening
                ? '0 0 20px rgba(0, 255, 136, 0.6)'
                : '0 0 0px rgba(0, 255, 136, 0)',
            }}
            transition={isListening ? { repeat: Infinity, duration: 2 } : {}}
          >
            {isListening ? <Mic size={32} /> : <MicOff size={32} className="opacity-50" />}
            <div className="oc-mic-label">
              {isListening ? 'TRANSMITTING' : 'OPEN FREQUENCY'}
            </div>
          </motion.button>
          </div>


          {/* Contemplative filler — shown during the gap between Seeker turn-end and Oracle audio */}
          <AnimatePresence>
            {isOracleThinking && !isOracleSpeaking && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0.4, 1, 0.4], y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ opacity: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' }, y: { duration: 0.2 } }}
                className="oc-status-pill"
                style={{ color: 'rgba(0,255,136,0.6)', borderColor: 'rgba(0,255,136,0.2)' }}
              >
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
                  style={{ fontSize: '0.6rem', letterSpacing: '0.2em' }}
                >
                  ···
                </motion.span>
                <span>READING THE SIGNAL</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Silent-mic recovery — surfaces when the mic has gone dead while listening.
              Tap re-opens the capture (stop + start). The one affordance a solo,
              unstaffed attendee needs so a dead mic doesn't kill the whole session. */}
          <AnimatePresence>
            {micSignalLost && isListening && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="oc-status-pill"
                onClick={(e) => { e.stopPropagation(); stopMic(); startMic(); }}
                style={{
                  pointerEvents: 'auto', cursor: 'pointer',
                  color: '#b026ff', borderColor: 'rgba(176,38,255,0.5)',
                  boxShadow: '0 0 18px rgba(176,38,255,0.45)',
                }}
              >
                <MicOff size={12} />
                <span>SIGNAL LOST — TAP TO REOPEN MIC</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Connection health — automatic reconnect in progress, or exhausted with a
              manual retry. Without this an expo-Wi-Fi drop reads as the Oracle just
              going dead for a solo attendee. */}
          <AnimatePresence>
            {reconnecting && !reconnectExhausted && (
              <motion.div
                key="reconnecting"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0.5, 1, 0.5], y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ opacity: { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }, y: { duration: 0.2 } }}
                className="oc-status-pill"
                style={{ color: 'rgba(0,255,204,0.85)', borderColor: 'rgba(0,255,204,0.3)' }}
              >
                <span>RE-ESTABLISHING SIGNAL…</span>
              </motion.div>
            )}
            {reconnectExhausted && (
              <motion.button
                key="reconnect-lost"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="oc-status-pill"
                onClick={(e) => { e.stopPropagation(); manualReconnect(); }}
                style={{
                  pointerEvents: 'auto', cursor: 'pointer',
                  color: '#b026ff', borderColor: 'rgba(176,38,255,0.5)',
                  boxShadow: '0 0 18px rgba(176,38,255,0.45)',
                }}
              >
                <span>SIGNAL LOST — TAP TO RECONNECT</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Conversation log — full session history, auto-scrolls to newest turn */}
        <AnimatePresence>
          {showSignalPad && turns.length > 0 && (
            <LogScrollContainer turns={turns} />
          )}
        </AnimatePresence>

        {/* Deaf-accessible hint — persists above the terminal when Oracle is transmitting */}
        <AnimatePresence>
          {isOracleSpeaking && (
            <motion.div
              key="terminal-hint"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.25 }}
              className="oc-terminal-hint"
            >
              <Zap size={10} />
              <span>ORACLE TRANSMITTING · TYPE VIA TERMINAL ⌨</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Signal pad — opened via hamburger menu TYPE MODE button */}
        <div className={`oc-signal-pad ${showSignalPad ? 'oc-signal-pad--open' : ''}`}>

          <AnimatePresence>
            {showSignalPad && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="oc-signal-input-wrap"
              >
                {/* Quick-start prompts — disappear after first user message */}
                {!hasSpoken && (
                  <div className="oc-quick-prompts">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        className="oc-quick-prompt-btn"
                        onClick={() => { sendText(p); setShowSignalPad(false); onTypeModeChange?.(false); }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                {/* Guided Tour Helper — cycles through 3 in-world openers */}
                {isGuidedTour && (() => {
                  const TOUR_PROMPTS = [
                    'What did the Cascade take from you?',
                    'What do you see in the signal right now?',
                    'Generate my portrait.',
                  ];
                  const oracleTurns = turns.filter(t => t.role === 'oracle').length;
                  const prompt = TOUR_PROMPTS[oracleTurns % TOUR_PROMPTS.length];
                  return (
                    <div style={{ color: '#b026ff', fontSize: '0.7rem', marginBottom: '0.5rem', fontFamily: "'PhillySans', monospace", letterSpacing: '0.08em', opacity: 0.9 }}>
                      <span className="oracle-lore-prompt">›</span> <em style={{ color: '#cc88ff', fontStyle: 'normal' }}>{prompt}</em>
                    </div>
                  );
                })()}

                <div className="oc-input-row">
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && inputText.trim() && sendText(inputText)}
                    placeholder="TYPE SIGNAL..."
                    className="oc-input"
                  />
                  <button
                    onClick={() => inputText.trim() && sendText(inputText)}
                    className="oc-send-btn"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }
);

OracleConversation.displayName = 'OracleConversation';
export default OracleConversation;
