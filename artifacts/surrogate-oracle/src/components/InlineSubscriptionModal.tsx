import { useState } from 'react';
import { X, Crown, Star, CheckCircle, Loader2, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { subscriptionProducts } from '../config/subscriptionProducts';
import { modalContextMessages } from '../config/modalContextMessages';

interface InlineSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentTier?: string;
  context?: 'portrait-trigger' | 'message-limit' | 'feature-tease' | 'engage-further';
  onUpgradeSuccess?: (tier: string) => void;
}

export function InlineSubscriptionModal({
  isOpen,
  onClose,
  userId,
  currentTier = 'free',
  context = 'engage-further',
  onUpgradeSuccess,
}: InlineSubscriptionModalProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = modalContextMessages[context];
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleUpgrade = async (productId: string) => {
    setIsUpgrading(true);
    setError(null);
    try {
      if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');

      const response = await fetch(`${supabaseUrl}/functions/v1/revenuecat-integration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({ action: 'initiate_purchase', userId, productId, context }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

       if (result.success && result.purchaseInitiated) {
         setShowSuccess(true);
         onUpgradeSuccess?.(productId);
         setTimeout(onClose, 2000);
       } else if (response.status === 202) {
         setError('Finish checkout in the RevenueCat app purchase flow. Premium access appears here after the verified store event arrives.');
      } else {
        throw new Error(result.error || 'Upgrade failed');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Upgrade failed. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)',
          }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            style={{
              background: 'rgba(0,5,20,0.96)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(176,38,255,0.35)',
              borderRadius: 16,
              padding: '32px',
              maxWidth: 520,
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 0 50px rgba(176,38,255,0.18), 0 0 120px rgba(0,255,136,0.06), inset 0 0 30px rgba(0,0,0,0.5)',
              fontFamily: "'PhillySans', 'Orbitron', monospace",
            }}
          >
            <button
              onClick={onClose}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            {showSuccess ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#00ff88' }}>
                <CheckCircle size={48} style={{ marginBottom: 16 }} />
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>UPGRADE SUCCESSFUL!</div>
                <div style={{ fontSize: '0.75rem', color: '#ffffff', opacity: 0.8, marginTop: 8 }}>Your consciousness has expanded.</div>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <Crown size={32} style={{ color: '#00ccff', marginBottom: 12 }} />
                  <h2 style={{
                    fontSize: '1.1rem',
                    fontFamily: "'aAnotherTag', 'Orbitron', monospace",
                    letterSpacing: '0.14em',
                    marginBottom: 6,
                    display: 'inline-block',
                    background: 'linear-gradient(135deg, #00ff88, #00ffcc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>{ctx?.title}</h2>
                  <p style={{ fontSize: '0.75rem', color: '#ffffff', opacity: 0.8, marginBottom: 8 }}>{ctx?.subtitle}</p>
                  <div style={{ fontSize: '0.7rem', color: '#00ccff', background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.3)', borderRadius: 20, padding: '4px 12px', display: 'inline-block' }}>
                    {ctx?.urgency}
                  </div>
                </div>

                {error && (
                  <div style={{ background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.4)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.75rem', color: '#cc88ff' }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {subscriptionProducts.map((product) => (
                    <div
                      key={product.id}
                      style={{
                        background: product.popular ? 'rgba(176,38,255,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${product.popular ? 'rgba(176,38,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 12,
                        padding: '16px 20px',
                        position: 'relative',
                      }}
                    >
                      {product.popular && (
                        <div style={{ position: 'absolute', top: -10, right: 16, background: 'linear-gradient(135deg, #170529, #b026ff)', borderRadius: 10, padding: '2px 10px', fontSize: '0.6rem', color: '#ffffff', letterSpacing: '0.1em' }}>
                          POPULAR
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', letterSpacing: '0.08em' }}>{product.title}</div>
                          <div style={{ fontSize: '0.7rem', color: '#ffffff', opacity: 0.8, marginTop: 2 }}>{product.description}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00ffcc' }}>${product.price}</div>
                          <div style={{ fontSize: '0.6rem', color: '#ffffff', opacity: 0.6 }}>/mo</div>
                        </div>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {product.features.map((f) => (
                          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: '#ffffff' }}>
                            <Zap size={10} style={{ color: '#00ff88', flexShrink: 0 }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => handleUpgrade(product.id)}
                        disabled={isUpgrading || currentTier === product.id}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: product.popular
                            ? 'linear-gradient(135deg, #170529, #b026ff)'
                            : currentTier === product.id
                              ? 'rgba(255,255,255,0.1)'
                              : 'rgba(0,255,136,0.1)',
                          border: currentTier === product.id ? 'none' : '1px solid rgba(0,255,136,0.3)',
                          borderRadius: 8,
                          color: currentTier === product.id ? 'rgba(255,255,255,0.5)' : '#ffffff',
                          fontFamily: "'PhillySans', 'Orbitron', monospace",
                          fontSize: '0.75rem',
                          letterSpacing: '0.05em',
                          cursor: isUpgrading || currentTier === product.id ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        {isUpgrading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                        {currentTier === product.id ? 'CURRENT PLAN' : `UPGRADE TO ${product.title}`}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
