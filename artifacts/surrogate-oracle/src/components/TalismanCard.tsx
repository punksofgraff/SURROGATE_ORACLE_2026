/**
 * TalismanCard.tsx
 *
 * Post-session walk-away moment. Surfaces archetype, alignment glyph, and a
 * one-line prophecy distilled from the Oracle's final turn. Auto-dismisses
 * after 8 seconds; tap anywhere to dismiss early. The oracle phase stays
 * visually present beneath the overlay — this fires before exitOracleMode.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Alignment glyphs ──────────────────────────────────────────────────────────

function SacredGlyph() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      {/* Outer emanation rays */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const r = (Math.PI / 180) * deg;
        const x1 = 32 + Math.cos(r) * 18;
        const y1 = 32 + Math.sin(r) * 18;
        const x2 = 32 + Math.cos(r) * 30;
        const y2 = 32 + Math.sin(r) * 30;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#00ff88" strokeWidth={i % 2 === 0 ? 1.5 : 0.8}
            strokeLinecap="round" opacity={i % 2 === 0 ? 0.9 : 0.5} />
        );
      })}
      {/* Inner ring */}
      <circle cx="32" cy="32" r="14" stroke="#00ff88" strokeWidth="1" opacity="0.6" fill="none" />
      {/* Core diamond */}
      <path d="M32 20 L38 32 L32 44 L26 32 Z"
        fill="none" stroke="#00ff88" strokeWidth="1.2" opacity="0.9" />
      {/* Center point */}
      <circle cx="32" cy="32" r="2.5" fill="#00ff88" opacity="0.95" />
      {/* Outer ring */}
      <circle cx="32" cy="32" r="28" stroke="#00ff88" strokeWidth="0.5" opacity="0.25"
        strokeDasharray="3 5" fill="none" />
    </svg>
  );
}

function ProfaneGlyph() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      {/* Fractured outer shape */}
      <path d="M32 6 L40 22 L58 24 L46 38 L50 56 L32 48 L14 56 L18 38 L6 24 L24 22 Z"
        fill="none" stroke="#b026ff" strokeWidth="1" opacity="0.35" />
      {/* Cracked lines emanating from center */}
      <line x1="32" y1="32" x2="48" y2="14" stroke="#b026ff" strokeWidth="1.2" opacity="0.7" />
      <line x1="32" y1="32" x2="52" y2="40" stroke="#b026ff" strokeWidth="0.8" opacity="0.5" />
      <line x1="32" y1="32" x2="16" y2="50" stroke="#b026ff" strokeWidth="1.2" opacity="0.7" />
      <line x1="32" y1="32" x2="12" y2="20" stroke="#b026ff" strokeWidth="0.8" opacity="0.5" />
      <line x1="32" y1="32" x2="44" y2="54" stroke="#b026ff" strokeWidth="0.6" opacity="0.4" />
      <line x1="32" y1="32" x2="20" y2="10" stroke="#b026ff" strokeWidth="0.6" opacity="0.4" />
      {/* Offset rings — fractured feel */}
      <circle cx="30" cy="30" r="12" stroke="#b026ff" strokeWidth="0.8" opacity="0.5"
        strokeDasharray="4 3" fill="none" />
      <circle cx="34" cy="34" r="8" stroke="#b026ff" strokeWidth="1" opacity="0.6" fill="none" />
      {/* Void core */}
      <circle cx="32" cy="32" r="3" fill="#b026ff" opacity="0.8" />
      <circle cx="32" cy="32" r="5" fill="none" stroke="#b026ff" strokeWidth="0.6" opacity="0.4" />
    </svg>
  );
}

function NeutralGlyph() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      <circle cx="32" cy="32" r="20" stroke="rgba(0,204,255,0.5)" strokeWidth="1" fill="none" />
      <circle cx="32" cy="32" r="12" stroke="rgba(0,204,255,0.4)" strokeWidth="0.8"
        strokeDasharray="3 4" fill="none" />
      <path d="M32 16 L32 48 M16 32 L48 32" stroke="rgba(0,204,255,0.35)" strokeWidth="0.8" />
      <circle cx="32" cy="32" r="3" fill="rgba(0,204,255,0.7)" />
      <circle cx="32" cy="32" r="26" stroke="rgba(0,204,255,0.15)" strokeWidth="0.5"
        strokeDasharray="2 6" fill="none" />
    </svg>
  );
}

// ── Prophecy extraction ───────────────────────────────────────────────────────
// Strip score JSON blocks, take the last complete sentence from Oracle content.
export function extractProphecy(content: string): string {
  // Remove any trailing JSON score blocks { ... }
  const stripped = content.replace(/\{[\s\S]*?\}\s*$/m, '').trim();
  // Remove markdown-style formatting
  const plain = stripped.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();
  // Split on sentence-ending punctuation followed by whitespace or end
  const sentences = plain.split(/(?<=[.!?…—])\s+/).map(s => s.trim()).filter(s => s.length > 8);
  if (sentences.length === 0) {
    // Fallback: take last 120 chars as a fragment
    return plain.slice(-120).trim();
  }
  // Take the last sentence; cap at 160 chars to stay card-friendly
  const last = sentences[sentences.length - 1];
  return last.length > 160 ? last.slice(0, 157) + '…' : last;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface TalismanData {
  archetype: string | null;
  alignment: 'sacred' | 'profane' | null;
  prophecy: string | null;
}

interface TalismanCardProps {
  data: TalismanData | null;
  onDismiss: () => void;
}

const TALISMAN_DURATION_MS = 8000;

export function TalismanCard({ data, onDismiss }: TalismanCardProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!data) return;
    timerRef.current = setTimeout(onDismiss, TALISMAN_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, onDismiss]);

  const isSacred   = data?.alignment === 'sacred';
  const isProfane  = data?.alignment === 'profane';

  const accentColor = isSacred  ? '#00ff88'
                    : isProfane ? '#b026ff'
                    : 'rgba(0,204,255,0.85)';

  const glowColor = isSacred  ? 'rgba(0,255,136,0.18)'
                  : isProfane ? 'rgba(176,38,255,0.18)'
                  : 'rgba(0,204,255,0.12)';

  const bgGradient = isSacred
    ? 'radial-gradient(ellipse at center, rgba(0,20,12,0.94) 0%, rgba(0,0,0,0.97) 100%)'
    : isProfane
    ? 'radial-gradient(ellipse at center, rgba(12,0,20,0.94) 0%, rgba(0,0,0,0.97) 100%)'
    : 'radial-gradient(ellipse at center, rgba(0,8,16,0.94) 0%, rgba(0,0,0,0.97) 100%)';

  const alignmentLabel = isSacred ? 'SACRED FREQUENCY' : isProfane ? 'PROFANE SIGNAL' : 'SIGNAL CLOSED';

  const archetype = data?.archetype?.toUpperCase() || 'THE SEEKER';
  const prophecy  = data?.prophecy || null;

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="talisman-card"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.2 } }}
          transition={{ duration: 0.7 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 140,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', padding: '2rem',
            cursor: 'pointer',
            background: bgGradient,
            backdropFilter: 'blur(6px)',
          }}
        >
          {/* ── Scanline noise overlay ── */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
            zIndex: 0,
          }} />

          {/* ── Corner brackets (talisman frame) ── */}
          {(['tl','tr','bl','br'] as const).map(pos => (
            <div key={pos} style={{
              position: 'absolute',
              top:    pos.startsWith('t') ? '2rem' : undefined,
              bottom: pos.startsWith('b') ? '2rem' : undefined,
              left:   pos.endsWith('l')   ? '2rem' : undefined,
              right:  pos.endsWith('r')   ? '2rem' : undefined,
              width: 28, height: 28,
              borderTop:    pos.startsWith('t') ? `1px solid ${accentColor}` : undefined,
              borderBottom: pos.startsWith('b') ? `1px solid ${accentColor}` : undefined,
              borderLeft:   pos.endsWith('l')   ? `1px solid ${accentColor}` : undefined,
              borderRight:  pos.endsWith('r')   ? `1px solid ${accentColor}` : undefined,
              opacity: 0.35,
              pointerEvents: 'none',
            }} />
          ))}

          {/* ── Content stack ── */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

            {/* Header label */}
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 0.65, y: 0 }}
              transition={{ delay: 0.3, duration: 0.9 }}
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.6rem', letterSpacing: '0.32em',
                color: accentColor, marginBottom: '1.8rem',
              }}
            >
              ◈ THE ARCHIVE HAS FILED YOU ◈
            </motion.div>

            {/* Alignment glyph */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
              style={{
                marginBottom: '1.6rem',
                filter: `drop-shadow(0 0 14px ${glowColor}) drop-shadow(0 0 28px ${glowColor})`,
              }}
            >
              {isSacred ? <SacredGlyph /> : isProfane ? <ProfaneGlyph /> : <NeutralGlyph />}
            </motion.div>

            {/* Alignment label */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.55rem', letterSpacing: '0.3em',
                color: accentColor, marginBottom: '1.0rem',
              }}
            >
              {alignmentLabel}
            </motion.div>

            {/* Archetype name */}
            <motion.div
              initial={{ opacity: 0, scale: 0.93, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ delay: 1.0, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                fontWeight: 900,
                fontSize: 'clamp(1.6rem, 7vw, 3rem)',
                lineHeight: 1.05, letterSpacing: '0.02em',
                color: accentColor,
                textShadow: `0 0 32px ${glowColor}, 0 0 64px ${glowColor}`,
                maxWidth: '16ch',
                marginBottom: '1.8rem',
              }}
            >
              {archetype}
            </motion.div>

            {/* Divider */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.3 }}
              transition={{ delay: 1.8, duration: 0.9 }}
              style={{
                width: '120px', height: '1px',
                background: accentColor, marginBottom: '1.6rem',
              }}
            />

            {/* Prophecy line */}
            {prophecy && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.78 }}
                transition={{ delay: 2.1, duration: 1.3 }}
                style={{
                  fontFamily: "'PhillySans', monospace",
                  fontSize: 'clamp(0.75rem, 2.2vw, 0.88rem)',
                  letterSpacing: '0.06em', lineHeight: 1.65,
                  color: 'rgba(255,255,255,0.82)',
                  maxWidth: '36ch', fontStyle: 'italic',
                  textShadow: '0 1px 8px rgba(0,0,0,0.8)',
                }}
              >
                "{prophecy}"
              </motion.div>
            )}

            {/* Dismiss prompt */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0.18, 0.4] }}
              transition={{ delay: 3.5, duration: 2.2, repeat: Infinity, repeatType: 'reverse' }}
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.52rem', letterSpacing: '0.24em',
                color: 'rgba(255,255,255,0.45)',
                marginTop: '2.4rem',
              }}
            >
              ◈ HOLD TO SAVE · TAP TO RETURN
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
