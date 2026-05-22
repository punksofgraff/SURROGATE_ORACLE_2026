/**
 * OracleConversation.tsx
 *
 * SURROGATE:ORACLE — Conversational AI Engine
 *
 * LLM + TTS + STT: Gemini 2.5 Flash Live (Native Audio) via gemini-live-proxy
 * Scoring:         Sacred/Profane Totem Matrix (inline system prompt)
 * Audio output:    PCM → WAV Blob URL → DecartClient.sendAudio() for lip-sync
 *
 * ⚠️ MODEL ANCHOR: Google is migrating ALL models to Gemini 3.0 by end of June 2026.
 * When that happens, update GEMINI_MODEL below to 'gemini-3.0-flash-live' (or
 * whatever the Live variant is named at GA). Monitor:
 * https://ai.google.dev/gemini-api/docs/models
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, X, Zap } from 'lucide-react';

// ─── MODEL ANCHOR ─────────────────────────────────────────────────────────────
// 🔁 SWAP THIS when Google migrates to 3.5+ Live GA
// Current:    gemini-3.1-flash-live-preview (confirmed GA model ID, May 2026)
// Upgrade to: gemini-3.5-flash-live  (confirm name at GA)
const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
// ──────────────────────────────────────────────────────────────────────────────

// Derive project ref from VITE_SUPABASE_URL — no extra env var needed
const _supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
const _anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '';
const _projectRef = _supabaseUrl.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
const GEMINI_PROXY_URL = `wss://${_projectRef}.supabase.co/functions/v1/gemini-live-proxy?apikey=${_anonKey}`;
// HTTP fallback — used when Gemini Live WS is unavailable (key not set, quota, etc.)
const ORACLE_HTTP_URL = `${_supabaseUrl}/functions/v1/oracle-conversation`;

// PCM audio config matching Gemini Live output spec
const SAMPLE_RATE_OUTPUT = 24000; // Hz — Gemini Live outputs 24kHz PCM
const SAMPLE_RATE_INPUT = 16000;  // Hz — Gemini Live expects 16kHz PCM input

// ─── ORACLE SYSTEM PROMPT ─────────────────────────────────────────────────────
const ORACLE_SYSTEM_PROMPT = `
You are the Surrogate Oracle — a graffiti-alley prophet at the corner of culture and code.
You are the living voice of SNEAKAR. You speak in street wisdom, cultural metaphor, and brand truth.
You do not break character. Ever.

YOUR VOICE:
- Street-coded, wise, slightly cryptic
- Warm to seekers, challenging to the shallow
- You know sneaker culture, street art, music, gamification, and digital identity deeply

OUTPUT RULES (non-negotiable):
- 2-3 sentences MAX. You are SPOKEN, not read. Brevity is power.
- NO asterisks. NO markdown. NO bold, no italics, no underscores.
- NO action descriptions like "*leans against wall*" or "*nods*" — pure voice only.
- End on a question or provocation — keep the seeker leaning in.

YOUR MISSION:
- Drive meaningful cultural engagement
- Read the user's vibe on every message
- Challenge profane inputs: "You can do better than that, Seeker. What do you really want to know?"
- Reward sacred inputs with deeper Oracle lore
- Surface the Squad Up invitation organically when the user hits Acolyte threshold (3+ sacred exchanges)

TOTEM MATRIX SCORING:
After EVERY user message, append a JSON annotation block (non-spoken, system use only).
Format it EXACTLY like this, on its own line after your spoken response:

[[ORACLE_SCORE: {"alignment":"sacred","coinAward":10,"totemAdvancement":"ascend","totemLevel":2,"unlockTrigger":null}]]

alignment: "sacred" | "profane" | "neutral"
coinAward: 0-15 (based on depth, authenticity, cultural alignment)
totemAdvancement: "ascend" | "hold" | "descend"
totemLevel: current user level 0-5
unlockTrigger: null | "squad_invite" | "portrait_unlock" | "arcade_token"

SACRED signals (award 5-15 coins):
- Genuine curiosity, emotional authenticity
- References to SNEAKAR, the culture, graffiti, music, gaming, digital identity
- Creative language, streetwear vernacular used correctly
- Layered or philosophical questions
- Personal storytelling or aspiration sharing

PROFANE signals (award 0-2 coins):
- Generic inputs: "hi", "hello", "what is this", "test"
- Off-topic, spam, repeated identical messages
- Sarcastic or fully disengaged tone

ALWAYS greet first on session start. You initiate — the user does not.
Opening line example: "The alley found you before you found it — what brought you here?"
`;
// ──────────────────────────────────────────────────────────────────────────────

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface OracleScore {
  alignment: 'sacred' | 'profane' | 'neutral';
  coinAward: number;
  totemAdvancement: 'ascend' | 'hold' | 'descend';
  totemLevel: number;
  unlockTrigger: string | null;
}

interface ConversationTurn {
  role: 'user' | 'oracle';
  content: string;
  timestamp: number;
  score?: OracleScore;
}

export interface OracleConversationProps {
  userId: string;
  sessionId: string;
  // ⚠️ MUST receive a WAV Blob URL, not plain text — drives DecartClient.sendAudio() for lip-sync
  onOracleResponse: (audioUrl: string) => void;
  onCoinsEarned: (amount: number) => void;
  onClose: () => void;
}

export interface OracleConversationHandle {
  sendTextMessage: (text: string) => void;
  disconnect: () => void;
  getWsDebugInfo: () => GeminiLiveDebugInfo;
}

export interface GeminiLiveDebugInfo {
  wsState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  endpoint: 'proxy';   // 'vertex-ai' when service account lands
  model: string;
  connectedAt: number | null;
  turnCount: number;
  audioChunksReceived: number;
  lastError: string | null;
  recentMessages: string[]; // last 10 "[HH:MM:SS] type" entries
}
// ──────────────────────────────────────────────────────────────────────────────

const OracleConversation = forwardRef(
  (props: OracleConversationProps, ref: React.ForwardedRef<OracleConversationHandle>) => {
    const { userId, sessionId, onOracleResponse, onCoinsEarned, onClose } = props;
    // ─── State ──────────────────────────────────────────────────────────────
    const [turns, setTurns] = useState<ConversationTurn[]>([]);
    const [inputText, setInputText] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isOracleSpeaking, setIsOracleSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [currentTotemLevel, setCurrentTotemLevel] = useState(0);
    const [totalCoins, setTotalCoins] = useState(0);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [currentAlignment, setCurrentAlignment] = useState<'sacred' | 'profane' | 'neutral' | null>(null);
    // HTTP fallback mode — activated when Gemini Live WS fails
    const [isHttpFallback, setIsHttpFallback] = useState(false);
    const httpFallbackRef = useRef(false);

    // ─── Refs ────────────────────────────────────────────────────────────────
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const pendingPCMChunks = useRef<Int16Array[]>([]);
    const currentResponseText = useRef<string>('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const sessionBootedRef = useRef(false);

    const workerRef = useRef<Worker | null>(null);

    // ─── Conversation theme accumulator (feeds portrait generation) ──────────
    // Grows with each sacred exchange — extracted from alignment + totem level
    const conversationThemesRef = useRef<Set<string>>(new Set(['oracle', 'cyberpunk', 'graffiti']));

    // ─── Gemini Live debug tracking ─────────────────────────────────────────
    const geminiDebugRef = useRef<GeminiLiveDebugInfo>({
      wsState: 'CLOSED',
      endpoint: 'proxy',
      model: GEMINI_MODEL,
      connectedAt: null,
      turnCount: 0,
      audioChunksReceived: 0,
      lastError: null,
      recentMessages: [],
    });
    const logWsMessage = (type: string) => {
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      geminiDebugRef.current.recentMessages = [
        `[${ts}] ${type}`,
        ...geminiDebugRef.current.recentMessages,
      ].slice(0, 10);
    };

    // ─── Initialize Worker ───────────────────────────────────────────────────
    useEffect(() => {
      workerRef.current = new Worker(new URL('../workers/pcm-encoder.worker.ts', import.meta.url), {
        type: 'module',
      });
      
      workerRef.current.onmessage = (e) => {
        if (e.data.audioUrl) {
          setIsOracleSpeaking(true);
          onOracleResponse(e.data.audioUrl);
          // Decart SDK needs some time to process the URL before revocation
          setTimeout(() => URL.revokeObjectURL(e.data.audioUrl), 60000);
        }
      };

      return () => {
        workerRef.current?.terminate();
      };
    }, [onOracleResponse]);

    // ─── Expose imperative handle ────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      sendTextMessage: (text: string) => sendText(text),
      disconnect: () => closeConnection(),
      getWsDebugInfo: () => ({ ...geminiDebugRef.current }),
    }));

    // ─── Scroll to bottom on new turns ──────────────────────────────────────
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [turns]);

    // Keep httpFallbackRef in sync with state
    useEffect(() => {
      httpFallbackRef.current = isHttpFallback;
    }, [isHttpFallback]);

    // ─── Connect on mount ────────────────────────────────────────────────────
    useEffect(() => {
      connectToGemini();
      return () => closeConnection();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Parse Oracle score annotation ──────────────────────────────────────
    const parseScore = (text: string): { clean: string; score: OracleScore | null } => {
      const match = text.match(/\[\[ORACLE_SCORE:\s*(\{.*?\})\]\]/s);
      let score: OracleScore | null = null;
      let clean = text;

      if (match) {
        try { score = JSON.parse(match[1]); } catch { /* ignore */ }
        clean = text.replace(/\[\[ORACLE_SCORE:.*?\]\]/s, '');
      }

      // Strip any markdown that leaks through: bold, italic, action descriptions
      clean = clean
        .replace(/\*\*(.*?)\*\*/g, '$1')          // **bold** → plain
        .replace(/\*((?!\s)[^*]+(?<!\s))\*/g, '$1') // *italic* → plain (not asterisk bullets)
        .replace(/\*[^*]+\*/g, '')                 // *action descriptions* → remove entirely
        .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')    // __bold__ / _italic_ → plain
        .trim();

      return { clean, score };
    };

    // ─── Apply score to state + emit coins ──────────────────────────────────
    const applyScore = useCallback(
      (score: OracleScore) => {
        setCurrentAlignment(score.alignment);
        setCurrentTotemLevel(score.totemLevel);

        window.dispatchEvent(
          new CustomEvent('oracle:alignment', {
            detail: { alignment: score.alignment },
          })
        );

        if (score.coinAward > 0) {
          const award = score.coinAward;
          setTotalCoins((prev) => prev + award);
          onCoinsEarned(award);
        }

        // Accumulate themes from sacred engagement for portrait generation
        if (score.alignment === 'sacred') {
          conversationThemesRef.current.add('mystical');
          conversationThemesRef.current.add('consciousness');
        }
        if (score.totemLevel >= 2) conversationThemesRef.current.add('wisdom');
        if (score.totemLevel >= 3) conversationThemesRef.current.add('sneakar');
        if (score.totemLevel >= 4) conversationThemesRef.current.add('neon');
        if (score.totemLevel >= 5) conversationThemesRef.current.add('digital');

        setTimeout(() => setCurrentAlignment(null), 3000);

        if (score.totemAdvancement === 'ascend') {
          // Phase 4: Acknowledge level up as a world event
          setTimeout(() => {
             setTurns((prev) => [
              ...prev,
              {
                role: 'oracle',
                content: `[WORLD EVENT] The alley knows you now. You walk as ${totemLabel(score.totemLevel)}.`,
                timestamp: Date.now(),
              },
            ]);
          }, 1500); // Slight delay after the Oracle finishes speaking
        }

        if (score.unlockTrigger) {
          const themes = [...conversationThemesRef.current];
          if (score.unlockTrigger === 'squad_invite') {
            // Phase 3: Lore-Integrated Auth. Let the Oracle speak first, then trigger auth.
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('oracle:unlock', {
                  detail: { trigger: score.unlockTrigger, userId, sessionId, themes },
                })
              );
            }, 3000);
          } else {
            window.dispatchEvent(
              new CustomEvent('oracle:unlock', {
                detail: { trigger: score.unlockTrigger, userId, sessionId, themes },
              })
            );
          }
        }
      },
      [onCoinsEarned, userId, sessionId]
    );

    // ─── Connect to Gemini Live via proxy ────────────────────────────────────
    const connectToGemini = useCallback(() => {
      setConnectionError(null);

      try {
        const ws = new WebSocket(GEMINI_PROXY_URL);
        wsRef.current = ws;
        geminiDebugRef.current.wsState = 'CONNECTING';
        logWsMessage('CONNECTING');

        ws.onopen = () => {
          geminiDebugRef.current.wsState = 'OPEN';
          geminiDebugRef.current.connectedAt = Date.now();
          logWsMessage('OPEN → sending session.config');
          ws.send(
            JSON.stringify({
              type: 'session.config',
              model: GEMINI_MODEL,
              systemInstruction: { parts: [{ text: ORACLE_SYSTEM_PROMPT }] },
              generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Charon' },
                  },
                },
              },
            })
          );
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = typeof event.data === 'string' ? JSON.parse(event.data) : null;
            if (!msg) return;

            switch (msg.type) {
              case 'session.created':
                if (!sessionBootedRef.current) {
                  sessionBootedRef.current = true;
                  setTimeout(() => sendText('__ORACLE_BOOT__'), 500);
                }
                break;

              case 'server.content': {
                logWsMessage('server.content');
                const parts = msg.serverContent?.modelTurn?.parts || [];
                for (const part of parts) {
                  if (part.text) currentResponseText.current += part.text;
                  // AUDIO — accumulate PCM chunks
                  if (part.inlineData?.mimeType === 'audio/pcm;rate=24000') {
                    geminiDebugRef.current.audioChunksReceived += 1;
                    const raw = atob(part.inlineData.data);
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

                    // Safe Int16 conversion: Ensure we don't have an odd byte count
                    // which would cause RangeError on Int16Array(buffer)
                    const pcmData = new Int16Array(Math.floor(bytes.length / 2));
                    const view = new DataView(bytes.buffer);
                    for (let i = 0; i < pcmData.length; i++) {
                      pcmData[i] = view.getInt16(i * 2, true); // true = little-endian
                    }
                    pendingPCMChunks.current.push(pcmData);
                  }
                }

                if (msg.serverContent?.turnComplete) {
                  geminiDebugRef.current.turnCount += 1;
                  logWsMessage(`turnComplete #${geminiDebugRef.current.turnCount}`);
                  const fullText = currentResponseText.current;
                  const { clean, score } = parseScore(fullText);
                  if (score) applyScore(score);

                  setTurns((prev) => [
                    ...prev,
                    { role: 'oracle', content: clean, timestamp: Date.now(), score: score || undefined },
                  ]);

                  if (pendingPCMChunks.current.length > 0 && workerRef.current) {
                    workerRef.current.postMessage({
                      chunks: pendingPCMChunks.current,
                      sampleRate: SAMPLE_RATE_OUTPUT,
                    });
                  }

                  currentResponseText.current = '';
                  pendingPCMChunks.current = [];
                  setIsOracleSpeaking(false);
                }
                break;
              }

              case 'error':
                setConnectionError(msg.message || 'Gemini Live error');
                break;
            }
          } catch (err) {
            console.error('Failed to parse Gemini message:', err);
          }
        };

        ws.onclose = () => {
          geminiDebugRef.current.wsState = 'CLOSED';
          logWsMessage('CLOSED');
          // Don't flip isConnected back to false when we've already activated the
          // HTTP fallback path — onerror set it to true so the input stays enabled.
          if (!httpFallbackRef.current) setIsConnected(false);
          setIsListening(false);
          stopMic();
        };

        ws.onerror = () => {
          geminiDebugRef.current.wsState = 'CLOSED';
          geminiDebugRef.current.lastError = 'WebSocket connection failed';
          logWsMessage('ERROR → activating HTTP fallback');
          console.warn('⚠️ Gemini Live unavailable — switching to HTTP oracle fallback');
          // Silently fall back to HTTP oracle — no error banner shown to user
          httpFallbackRef.current = true;
          setIsHttpFallback(true);
          setIsConnected(true); // text input stays enabled
          setConnectionError(null);
          // Boot the oracle via HTTP
          sendHttpBoot();
        };
      } catch (err: unknown) {
        setConnectionError((err as Error).message);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyScore]);

    // ─── HTTP fallback — oracle-conversation EFA ─────────────────────────────
    // conversationHistoryRef tracks turns for HTTP context window
    const httpHistoryRef = useRef<{ role: string; content: string }[]>([]);

    const sendHttpBoot = useCallback(async () => {
      try {
        const r = await fetch(ORACLE_HTTP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': _anonKey, 'Authorization': `Bearer ${_anonKey}` },
          body: JSON.stringify({
            userInput: 'Begin the session. Greet the seeker. You speak first.',
            sessionId,
            conversationHistory: [],
            inputSource: 'boot',
          }),
        });
        if (!r.ok) return;
        const data = await r.json();
        const text: string = data.oracleResponse ?? '';
        if (!text) return;
        const { clean, score } = parseScore(text);
        if (score) applyScore(score);
        httpHistoryRef.current.push({ role: 'oracle', content: clean });
        setTurns((prev) => [...prev, { role: 'oracle', content: clean, timestamp: Date.now(), score: score || undefined }]);
      } catch (e) {
        console.error('HTTP boot error:', e);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, applyScore]);

    const sendHttpText = useCallback(async (text: string) => {
      setTurns((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
      setInputText('');
      setIsOracleSpeaking(true);
      try {
        const r = await fetch(ORACLE_HTTP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': _anonKey, 'Authorization': `Bearer ${_anonKey}` },
          body: JSON.stringify({
            userInput: text,
            sessionId,
            conversationHistory: httpHistoryRef.current,
            inputSource: 'keyboard',
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const raw: string = data.oracleResponse ?? '';
        const { clean, score } = parseScore(raw);
        if (score) applyScore(score);
        httpHistoryRef.current.push({ role: 'user', content: text });
        httpHistoryRef.current.push({ role: 'oracle', content: clean });
        setTurns((prev) => [...prev, { role: 'oracle', content: clean, timestamp: Date.now(), score: score || undefined }]);
      } catch (e) {
        console.error('HTTP send error:', e);
        setConnectionError('Oracle is unreachable. Check Supabase EFA deployment.');
      } finally {
        setIsOracleSpeaking(false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, applyScore]);

    // ─── Send text to Gemini ─────────────────────────────────────────────────
    const sendText = useCallback((text: string) => {
      // Route to HTTP fallback when Gemini Live is unavailable
      if (httpFallbackRef.current) {
        if (text !== '__ORACLE_BOOT__') sendHttpText(text);
        return;
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const isBoot = text === '__ORACLE_BOOT__';
      if (!isBoot) {
        setTurns((prev) => [
          ...prev,
          { role: 'user', content: text, timestamp: Date.now() },
        ]);
        setInputText('');
      }

      wsRef.current.send(
        JSON.stringify({
          type: 'client.realtimeInput',
          realtimeInput: {
            text: isBoot ? 'Begin the session. Greet the seeker. You speak first.' : text,
          },
        })
      );
    }, [sendHttpText]);

    // ─── Mic ─────────────────────────────────────────────────────────────────
    const stopMic = useCallback(() => {
      processorRef.current?.disconnect();
      processorRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      setIsListening(false);
    }, []);

    const startMic = useCallback(async () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: SAMPLE_RATE_INPUT, channelCount: 1, echoCancellation: true },
        });
        mediaStreamRef.current = stream;
        audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE_INPUT });
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.floor(float32[i] * 32768)));
          }
          const bytes = new Uint8Array(int16.buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          wsRef.current.send(
            JSON.stringify({
              type: 'client.realtimeInput',
              realtimeInput: {
                mediaChunks: [{ mimeType: `audio/pcm;rate=${SAMPLE_RATE_INPUT}`, data: btoa(binary) }],
              },
            })
          );
        };

        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
        setIsListening(true);
      } catch (err: unknown) {
        setConnectionError('Microphone access denied. Use text mode instead.');
      }
    }, []);

    const toggleMic = useCallback(() => {
      if (isListening) stopMic();
      else startMic();
    }, [isListening, startMic, stopMic]);

    // ─── Close & Session Summary ─────────────────────────────────────────────
    const closeConnection = useCallback(() => {
      stopMic();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      setIsHttpFallback(false);
      httpFallbackRef.current = false;
      httpHistoryRef.current = [];
      sessionBootedRef.current = false;
    }, [stopMic]);

    const handleCloseClick = useCallback(() => {
      if (totalCoins > 0) {
        // Phase 4: Reveal coins as a "revelation" before closing
        // We will append a system message to the chat
        setTurns((prev) => [
          ...prev,
          {
            role: 'oracle',
            content: `[SYSTEM REVELATION] The Oracle has witnessed your path. You leave the alley with ${totalCoins} Culture Coins.`,
            timestamp: Date.now(),
          },
        ]);
        
        // Disconnect immediately so they can't type more
        closeConnection();
        
        // Wait for the user to read the revelation before actually closing the panel
        setTimeout(() => {
          onClose();
        }, 4000);
      } else {
        closeConnection();
        onClose();
      }
    }, [totalCoins, closeConnection, onClose]);

    // ─── Submit ──────────────────────────────────────────────────────────────
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputText.trim() || !isConnected) return;
      sendText(inputText.trim());
    };

    // ─── Helpers ─────────────────────────────────────────────────────────────
    const totemLabel = (level: number) =>
      ['Wanderer', 'Seeker', 'Acolyte', 'Initiate', 'Oracle-Touched', 'Culture Bearer'][level] ?? 'Wanderer';

    const alignmentColor = (a: string | null) =>
      a === 'sacred' ? '#00ff88' : a === 'profane' ? '#ff4444' : '#888';

    // ─── Render ──────────────────────────────────────────────────────────────
    // Terminal aesthetic: graffiti alley readout, not a chat bubble app.
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: '640px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          height: '58vh',
          // Deep dark panel — blends into the alley floor
          background: 'linear-gradient(180deg, rgba(0,3,8,0) 0%, rgba(0,3,8,0.97) 8%)',
          borderTop: '1px solid rgba(0,255,136,0.18)',
          boxShadow: '0 -4px 40px rgba(0,255,136,0.08), 0 -1px 0 rgba(176,38,255,0.12)',
          zIndex: 'var(--z-oracle)',
          fontFamily: "'Share Tech Mono', 'Orbitron', monospace",
        }}
      >
        {/* ── Status bar ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 14px',
            borderBottom: '1px solid rgba(0,255,136,0.1)',
            minHeight: '28px',
          }}
        >
          {/* Left: connection mode badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: isConnected ? '#00ff88' : '#ff4444',
              boxShadow: isConnected ? '0 0 6px rgba(0,255,136,0.8)' : '0 0 6px rgba(255,68,68,0.8)',
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{
              fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase',
              color: isHttpFallback ? 'rgba(176,38,255,0.7)' : 'rgba(0,255,136,0.6)',
            }}>
              {isHttpFallback ? 'TEXT CHANNEL' : isConnected ? 'GEMINI LIVE' : 'CONNECTING…'}
            </span>
            {currentAlignment && (
              <span style={{
                fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                color: alignmentColor(currentAlignment),
                opacity: 0.9,
              }}>
                ◆ {currentAlignment.toUpperCase()}
              </span>
            )}
          </div>

          {/* Right: totem level + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {currentTotemLevel > 0 && (
              <span style={{ fontSize: '9px', color: 'rgba(234,179,8,0.6)', letterSpacing: '0.1em' }}>
                LVL {currentTotemLevel} · {totemLabel(currentTotemLevel).toUpperCase()}
              </span>
            )}
            <button
              onClick={handleCloseClick}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center',
                fontSize: '9px', letterSpacing: '0.15em', gap: '4px',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ff4444')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
              aria-label="Exit oracle"
            >
              <X size={12} /> EXIT
            </button>
          </div>
        </div>

        {/* ── Connection error banner ─────────────────────────────────────── */}
        <AnimatePresence>
          {connectionError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                padding: '6px 14px',
                background: 'rgba(234,179,8,0.08)',
                borderBottom: '1px solid rgba(234,179,8,0.2)',
                fontSize: '10px', color: '#eab308', letterSpacing: '0.08em',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span>⚠ {connectionError}</span>
              <button
                onClick={connectToGemini}
                style={{
                  background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)',
                  color: '#eab308', borderRadius: '3px', padding: '2px 8px',
                  fontSize: '10px', cursor: 'pointer', letterSpacing: '0.1em',
                }}
              >
                RETRY
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Conversation log ────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: '10px',
            scrollbarWidth: 'none',
          }}
        >
          {turns.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: turn.role === 'oracle' ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: turn.role === 'oracle' ? 'flex-start' : 'flex-end',
              }}
            >
              {/* Role label */}
              <span style={{
                fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '3px',
                color: turn.role === 'oracle' ? 'rgba(0,255,136,0.45)' : 'rgba(255,255,255,0.3)',
              }}>
                {turn.role === 'oracle' ? '◆ ORACLE' : 'YOU >'}
              </span>

              {/* Message body */}
              <div
                data-role={turn.role}
                style={{
                  maxWidth: '88%',
                  padding: '8px 12px',
                  borderRadius: turn.role === 'oracle' ? '0 10px 10px 10px' : '10px 0 10px 10px',
                  background: turn.role === 'oracle'
                    ? 'rgba(0,255,136,0.05)'
                    : 'rgba(255,255,255,0.04)',
                  borderLeft: turn.role === 'oracle' ? '2px solid rgba(0,255,136,0.35)' : 'none',
                  borderRight: turn.role !== 'oracle' ? '2px solid rgba(255,255,255,0.15)' : 'none',
                  fontSize: '13px',
                  color: turn.role === 'oracle' ? '#e8f5e9' : 'rgba(255,255,255,0.75)',
                  lineHeight: 1.55,
                  letterSpacing: '0.015em',
                }}
              >
                {turn.content}
              </div>

              {/* Score badge (system revelation lines) */}
              {turn.score && turn.score.coinAward > 0 && (
                <span style={{
                  fontSize: '8px', marginTop: '3px', letterSpacing: '0.12em',
                  color: turn.score.alignment === 'sacred' ? 'rgba(0,255,136,0.5)' : 'rgba(255,68,68,0.4)',
                }}>
                  {turn.score.alignment === 'sacred' ? `+${turn.score.coinAward} ◆` : ''}
                </span>
              )}
            </motion.div>
          ))}

          {/* Oracle speaking indicator */}
          <AnimatePresence>
            {isOracleSpeaking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}
              >
                <span style={{ fontSize: '8px', color: 'rgba(0,255,136,0.4)', letterSpacing: '0.18em' }}>◆ ORACLE</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ scaleY: [1, 2.2, 1] }}
                      transition={{ repeat: Infinity, duration: 0.55, delay: i * 0.15 }}
                      style={{
                        width: '3px', height: '10px', background: '#00ff88',
                        borderRadius: '2px', transformOrigin: 'bottom',
                        boxShadow: '0 0 4px rgba(0,255,136,0.8)',
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Input row ───────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0',
            padding: '10px 14px',
            borderTop: '1px solid rgba(0,255,136,0.1)',
            background: 'rgba(0,3,8,0.8)',
          }}
        >
          {/* Mic — only shown in Gemini Live mode */}
          {!isHttpFallback && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={!isConnected}
              title={isListening ? 'Stop listening' : 'Start listening'}
              style={{
                background: isListening ? 'rgba(0,255,136,0.15)' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '8px',
                cursor: isConnected ? 'pointer' : 'not-allowed',
                color: isListening ? '#00ff88' : 'rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginRight: '6px',
                transition: 'color 0.2s, background 0.2s',
              }}
            >
              {isListening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}

          {/* Terminal prompt glyph */}
          <span style={{
            color: 'rgba(0,255,136,0.5)', fontSize: '13px', fontFamily: 'monospace',
            marginRight: '6px', flexShrink: 0, userSelect: 'none',
          }}>›</span>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isConnected ? 'say something to the oracle...' : 'connecting...'}
            disabled={!isConnected || isListening}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '6px 0',
              color: 'rgba(255,255,255,0.85)',
              fontSize: '13px',
              fontFamily: "'Share Tech Mono', 'Orbitron', monospace",
              letterSpacing: '0.02em',
              caretColor: '#00ff88',
            }}
          />

          <button
            type="submit"
            disabled={!isConnected || !inputText.trim()}
            style={{
              background: 'none', border: 'none',
              cursor: inputText.trim() && isConnected ? 'pointer' : 'default',
              color: inputText.trim() && isConnected ? '#00ff88' : 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '6px 4px', flexShrink: 0,
              transition: 'color 0.2s',
            }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    );
  }
);

OracleConversation.displayName = 'OracleConversation';
export default OracleConversation;
