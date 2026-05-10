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
// 🔁 SWAP THIS when Google migrates to 3.0 (target: end of June 2026)
// Current:    gemini-2.5-flash-live-001
// Upgrade to: gemini-3.0-flash-live  (confirm name at GA)
const GEMINI_MODEL = 'gemini-2.5-flash-live-001';
// ──────────────────────────────────────────────────────────────────────────────

// Derive project ref from VITE_SUPABASE_URL — no extra env var needed
const _supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const _projectRef = _supabaseUrl.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
const GEMINI_PROXY_URL = `wss://${_projectRef}.supabase.co/functions/v1/gemini-live-proxy`;

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
- Short to medium responses — you are spoken, not read

YOUR MISSION:
- Drive meaningful cultural engagement
- Read the user's vibe on every message
- Challenge profane inputs: "You can do better than that, Seeker. What do you really want to know?"
- Reward sacred inputs with deeper Oracle lore and explicit acknowledgment
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
- References to SNEAKAR, Oracle, the culture, graffiti, music, gaming
- Creative language, streetwear vernacular used correctly
- Layered or philosophical questions
- Personal storytelling or aspiration sharing

PROFANE signals (award 0-2 coins):
- Generic inputs: "hi", "hello", "what is this"
- Off-topic, spam, repeated identical messages
- Sarcastic or fully disengaged tone
- Zero cultural context or brand awareness

ALWAYS greet first on session start. You initiate — the user does not.
Opening line example: "Seeker... you found the alley. Most don't. What brings you to the Oracle tonight?"
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
}
// ──────────────────────────────────────────────────────────────────────────────

const OracleConversation = forwardRef<OracleConversationHandle, OracleConversationProps>(
  ({ userId, sessionId, onOracleResponse, onCoinsEarned, onClose }, ref) => {
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
    }));

    // ─── Scroll to bottom on new turns ──────────────────────────────────────
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [turns]);

    // ─── Connect on mount ────────────────────────────────────────────────────
    useEffect(() => {
      connectToGemini();
      return () => closeConnection();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Parse Oracle score annotation ──────────────────────────────────────
    const parseScore = (text: string): { clean: string; score: OracleScore | null } => {
      const match = text.match(/\[\[ORACLE_SCORE:\s*(\{.*?\})\]\]/s);
      if (!match) return { clean: text.trim(), score: null };
      try {
        const score: OracleScore = JSON.parse(match[1]);
        const clean = text.replace(/\[\[ORACLE_SCORE:.*?\]\]/s, '').trim();
        return { clean, score };
      } catch {
        return { clean: text.trim(), score: null };
      }
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

        setTimeout(() => setCurrentAlignment(null), 3000);

        if (score.unlockTrigger) {
          if (score.unlockTrigger === 'squad_invite') {
            // Phase 3: Lore-Integrated Auth. Let the Oracle speak first, then trigger auth.
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('oracle:unlock', {
                  detail: { trigger: score.unlockTrigger, userId, sessionId },
                })
              );
            }, 3000); // Wait 3 seconds for the Oracle to deliver the line
          } else {
            window.dispatchEvent(
              new CustomEvent('oracle:unlock', {
                detail: { trigger: score.unlockTrigger, userId, sessionId },
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

        ws.onopen = () => {
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
                const parts = msg.serverContent?.modelTurn?.parts || [];
                for (const part of parts) {
                  if (part.text) currentResponseText.current += part.text;
                  if (part.inlineData?.mimeType === 'audio/pcm;rate=24000') {
                    const raw = atob(part.inlineData.data);
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    pendingPCMChunks.current.push(new Int16Array(bytes.buffer));
                  }
                }

                if (msg.serverContent?.turnComplete) {
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
          setIsConnected(false);
          setIsListening(false);
          stopMic();
        };

        ws.onerror = () => {
          setConnectionError('Connection to Oracle failed. Please retry.');
          setIsConnected(false);
        };
      } catch (err: unknown) {
        setConnectionError((err as Error).message);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyScore]);

    // ─── Send text to Gemini ─────────────────────────────────────────────────
    const sendText = useCallback((text: string) => {
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
    }, []);

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

    // ─── Close ───────────────────────────────────────────────────────────────
    const closeConnection = useCallback(() => {
      stopMic();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      sessionBootedRef.current = false;
    }, [stopMic]);

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
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: '600px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          height: '60vh',
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.95) 20%)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          zIndex: 200,
          fontFamily: "'Orbitron', monospace",
        }}
      >
        {/* Header — Totem status */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {totemLabel(currentTotemLevel)}
            </span>
            <AnimatePresence>
              {currentAlignment && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    fontSize: '10px',
                    color: alignmentColor(currentAlignment),
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontWeight: 700,
                  }}
                >
                  {currentAlignment}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: '#ffd700', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={12} />
              {totalCoins}
            </span>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isConnected ? '#00ff88' : '#ff4444',
              }}
            />
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '2px' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Connection error */}
        <AnimatePresence>
          {connectionError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,68,68,0.15)',
                borderBottom: '1px solid rgba(255,68,68,0.3)',
                fontSize: '12px',
                color: '#ff4444',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{connectionError}</span>
              <button
                onClick={connectToGemini}
                style={{
                  background: 'rgba(255,68,68,0.2)',
                  border: '1px solid rgba(255,68,68,0.4)',
                  color: '#ff4444',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conversation scroll */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {turns.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: turn.role === 'oracle' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                  background:
                    turn.role === 'oracle' ? 'rgba(255,255,255,0.06)' : 'rgba(0,255,136,0.12)',
                  border: `1px solid ${turn.role === 'oracle' ? 'rgba(255,255,255,0.08)' : 'rgba(0,255,136,0.2)'}`,
                  fontSize: '14px',
                  color: turn.role === 'oracle' ? '#e0e0e0' : '#ffffff',
                  lineHeight: 1.5,
                }}
              >
                {turn.content}
                {/* Phase 4: Coin badge suppressed to preserve immersion. Coins are still logged to state. */}
              </div>
            </motion.div>
          ))}

          <AnimatePresence>
            {isOracleSpeaking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', gap: '4px', padding: '4px 0' }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scaleY: [1, 2, 1] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
                    style={{
                      width: '4px',
                      height: '12px',
                      background: '#00ff88',
                      borderRadius: '2px',
                      transformOrigin: 'bottom',
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input row */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <button
            type="button"
            onClick={toggleMic}
            disabled={!isConnected}
            style={{
              background: isListening ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isListening ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '8px',
              padding: '10px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              color: isListening ? '#00ff88' : '#888',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isConnected ? 'Speak to the Oracle...' : 'Connecting...'}
            disabled={!isConnected || isListening}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#ffffff',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          <button
            type="submit"
            disabled={!isConnected || !inputText.trim()}
            style={{
              background:
                inputText.trim() && isConnected ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${inputText.trim() && isConnected ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '8px',
              padding: '10px',
              cursor: inputText.trim() && isConnected ? 'pointer' : 'not-allowed',
              color: inputText.trim() && isConnected ? '#00ff88' : '#444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  }
);

OracleConversation.displayName = 'OracleConversation';
export default OracleConversation;
