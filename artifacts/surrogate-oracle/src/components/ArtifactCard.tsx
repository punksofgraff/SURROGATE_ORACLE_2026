/**
 * ArtifactCard — The session receipt.
 *
 * Shown after the Mirror phase completes. Displays the generated portrait,
 * the Oracle-assigned archetype title, and CTAs to Share / Save / Run Again.
 *
 * Props:
 *   archetypeTitle  — e.g. "THE UNFINISHED KING"
 *   portraitUrl     — URL to the generated FreakDali portrait (or null while generating)
 *   totalCoins      — coins earned this session
 *   onRunAgain      — resets to dormant for another session
 *   onClose         — dismiss the card without resetting (goes to exit revelation)
 */
import { motion } from 'framer-motion';

interface ArtifactCardProps {
  archetypeTitle: string;
  portraitUrl: string | null;
  totalCoins: number;
  onRunAgain: () => void;
  onClose: () => void;
}

const ORACLE_PORTRAIT_PLACEHOLDER = 'https://i.postimg.cc/D20ctNV0/orackle-only-static.png';

export function ArtifactCard({ archetypeTitle, portraitUrl, totalCoins, onRunAgain, onClose }: ArtifactCardProps) {
  const imgSrc = portraitUrl || ORACLE_PORTRAIT_PLACEHOLDER;

  const handleShare = async () => {
    const shareText = `I consulted the SURROGATE:ORACLE in the alley.\n\nThe Oracle sees me as: ${archetypeTitle}\n\n#SNEAKAR #SurrogateOracle`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SURROGATE:ORACLE', text: shareText, url: window.location.href });
      } catch { /* user cancelled */ }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        // Brief toast — not worth importing a toast lib, inline styling
        const el = document.getElementById('artifact-share-toast');
        if (el) { el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 2200); }
      } catch { /* ignore */ }
    }
  };

  return (
    <motion.div
      className="oracle-artifact-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="oracle-artifact-card"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ delay: 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div className="oracle-artifact-header">
          <span className="oracle-artifact-eyebrow">◆ ORACLE RECORD</span>
          {totalCoins > 0 && (
            <span className="oracle-artifact-coins">+{totalCoins} ◆ CULTURE COINS</span>
          )}
        </div>

        {/* Portrait */}
        <div className="oracle-artifact-portrait-wrap">
          <img
            src={imgSrc}
            alt="Your Oracle portrait"
            className="oracle-artifact-portrait"
          />
          {/* Glow overlay */}
          <div className="oracle-artifact-portrait-glow" />
        </div>

        {/* Archetype title */}
        <div className="oracle-artifact-title">{archetypeTitle}</div>

        {/* CTA row */}
        <div className="oracle-artifact-ctas">
          <button
            className="oracle-artifact-btn oracle-artifact-btn--secondary"
            onClick={handleShare}
          >
            SHARE
          </button>
          <button
            className="oracle-artifact-btn oracle-artifact-btn--secondary"
            onClick={onClose}
          >
            SAVE RECORD
          </button>
          <button
            className="oracle-artifact-btn oracle-artifact-btn--primary"
            onClick={onRunAgain}
          >
            RUN ANOTHER SESSION
          </button>
        </div>

        {/* Clipboard fallback toast */}
        <div
          id="artifact-share-toast"
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,255,136,0.15)',
            border: '1px solid rgba(0,255,136,0.35)',
            color: '#00ff88',
            padding: '5px 14px',
            borderRadius: '4px',
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            opacity: 0,
            transition: 'opacity 0.3s',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          COPIED TO CLIPBOARD
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ArtifactCard;
