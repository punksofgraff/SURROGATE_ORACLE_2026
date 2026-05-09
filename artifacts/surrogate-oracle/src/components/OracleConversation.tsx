import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface SeekerProfile {
  id?: string;
  user_id?: string;
  session_id?: string;
  seeker_name?: string;
  conversation_history?: unknown[];
  identification_complete?: boolean;
  sacred_profane_score?: number;
  culture_coins_earned?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface OracleConversationHook {
  messages: Message[];
  isProcessing: boolean;
  isListening: boolean;
  error: string | null;
  seekerProfile: SeekerProfile | null;
  turnCount: number;
  sendMessage: (text: string) => Promise<string | null>;
  startListening: () => void;
  stopListening: () => void;
}

export function useOracleConversation(
  authenticatedUserId: string | null,
  currentSessionId: string
): OracleConversationHook {
  const isValidUUID = (uuid: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

  const validUserId =
    authenticatedUserId && isValidUUID(authenticatedUserId) ? authenticatedUserId : null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seekerProfile, setSeekerProfile] = useState<SeekerProfile | null>(null);
  const [turnCount, setTurnCount] = useState(0);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const sendMessage = useCallback(
    async (text: string): Promise<string | null> => {
      if (!text.trim() || isProcessing) return null;

      const userMessage: Message = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);
      setError(null);

      try {
        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Supabase not configured — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/oracle-conversation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            userInput: text,
            sessionId: currentSessionId,
            userId: validUserId,
            conversationHistory: messages,
          }),
        });

        if (!response.ok) {
          throw new Error(`Oracle error: HTTP ${response.status}`);
        }

        const result = await response.json();
        const oracleText = result.response || result.message || 'The Oracle is silent.';
        const audioUrl: string | null = result.audioUrl || null;

        const assistantMessage: Message = {
          role: 'assistant',
          content: oracleText,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setTurnCount((t) => t + 1);

        return audioUrl;
      } catch (err: unknown) {
        const msg = (err as Error).message || 'Oracle connection failed';
        setError(msg);
        console.error('Oracle conversation error:', err);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, messages, currentSessionId, validUserId, supabaseUrl, supabaseKey]
  );

  const startListening = useCallback(() => setIsListening(true), []);
  const stopListening = useCallback(() => setIsListening(false), []);

  return {
    messages,
    isProcessing,
    isListening,
    error,
    seekerProfile,
    turnCount,
    sendMessage,
    startListening,
    stopListening,
  };
}

// ── Conversation UI Component ────────────────────────────────────────────────

interface OracleConversationProps {
  userId: string | null;
  sessionId: string;
  onAudioReady?: (audioUrl: string) => void;
  isOracleReady?: boolean;
}

export function OracleConversation({
  userId,
  sessionId,
  onAudioReady,
  isOracleReady,
}: OracleConversationProps) {
  const { messages, isProcessing, error, sendMessage } = useOracleConversation(userId, sessionId);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    const audioUrl = await sendMessage(text);
    if (audioUrl && onAudioReady) onAudioReady(audioUrl);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: "'Orbitron', monospace",
    color: '#fff',
  };

  const messagesStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxHeight: '300px',
  };

  return (
    <div style={containerStyle}>
      <div style={messagesStyle}>
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#444',
              fontSize: '0.75rem',
              padding: '20px',
            }}
          >
            {isOracleReady ? 'Speak your truth to the Oracle...' : 'Awaiting Oracle connection...'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              background:
                msg.role === 'user'
                  ? 'rgba(0,255,255,0.1)'
                  : 'rgba(255,0,255,0.1)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(0,255,255,0.3)' : 'rgba(255,0,255,0.3)'}`,
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: '0.78rem',
              lineHeight: 1.5,
              color: msg.role === 'user' ? '#00ffff' : '#ff9fff',
            }}
          >
            {msg.content}
          </div>
        ))}
        {isProcessing && (
          <div
            style={{
              alignSelf: 'flex-start',
              color: '#ff00ff',
              fontSize: '0.75rem',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}
          >
            <span style={{ animation: 'pulse 1s infinite' }}>●</span>
            <span style={{ animation: 'pulse 1s infinite 0.2s' }}>●</span>
            <span style={{ animation: 'pulse 1s infinite 0.4s' }}>●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div
          style={{
            margin: '0 16px',
            padding: '8px 12px',
            background: 'rgba(255,0,80,0.1)',
            border: '1px solid #ff0050',
            borderRadius: 6,
            color: '#ff0050',
            fontSize: '0.7rem',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={isOracleReady ? 'Ask the Oracle...' : 'Waiting for Oracle...'}
          disabled={!isOracleReady || isProcessing}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(0,255,255,0.2)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#fff',
            fontFamily: "'Orbitron', monospace",
            fontSize: '0.78rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!isOracleReady || isProcessing || !inputText.trim()}
          style={{
            background:
              isOracleReady && !isProcessing
                ? 'linear-gradient(135deg, #00ffff, #ff00ff)'
                : 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            color: '#000',
            fontFamily: "'Orbitron', monospace",
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: isOracleReady && !isProcessing ? 'pointer' : 'not-allowed',
            letterSpacing: '0.05em',
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
