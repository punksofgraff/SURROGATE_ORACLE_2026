import React, { useState, useEffect } from 'react';
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
  onUpgradeSuccess
}: InlineSubscriptionModalProps) {
  
  const [isLoading, setIsLoading] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepTimes, setStepTimes] = useState<Record<number, number>>({});

  const currentContext = modalContextMessages[context];

  const handleUpgrade = async (productId: string, price: number) => {
    setIsUpgrading(true);
    setError(null);
    const upgradeStartTime = Date.now();
    
    try {
      console.log('🚀 Initiating upgrade:', { productId, userId, context });
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revenuecat-integration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'initiate_purchase',
          userId,
          productId,
          context
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        const upgradeDuration = Date.now() - upgradeStartTime;
        setStepTimes(prev => ({ ...prev, upgrade: upgradeDuration }));
        console.log('✅ Upgrade successful:', result);
        setShowSuccess(true);
        
        // Show success notification
        if (window.showSuccessNotification) {
          window.showSuccessNotification('Consciousness successfully upgraded!');
        }
        
        if (onUpgradeSuccess) {
          onUpgradeSuccess(result.tier || productId);
        }
        
        setTimeout(() => {
          onClose();
          setShowSuccess(false);
        }, 2000);
      } else {
        const errorMsg = result.error || 'Upgrade failed';
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('❌ Upgrade error:', error);
      setError(error.message);
    } finally {
      setIsUpgrading(false);
    }
  };

  // Clear error when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const getProductColors = (productId: string) => {
    const colorMap = {
      'prod54d54dd866': { 
        bg: 'from-blue-600/20 to-blue-800/20', 
        border: 'border-blue-500/50', 
        text: 'text-blue-400'
      },
      'prod311f595c65': { 
        bg: 'from-purple-600/20 to-purple-800/20', 
        border: 'border-purple-500/50', 
        text: 'text-purple-400'
      },
      'prod70269376ed': { 
        bg: 'from-yellow-600/20 to-yellow-800/20', 
        border: 'border-yellow-500/50', 
        text: 'text-yellow-400'
      }
    };
    return colorMap[productId] || { 
      bg: 'from-gray-600/20 to-gray-800/20', 
      border: 'border-gray-500/50', 
      text: 'text-gray-400'
    };
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="subscription-modal-overlay"
      >
        {/* Upgrade loading overlay */}
        {isUpgrading && (
          <div className="upgrade-loading-overlay">
            <div className="upgrade-loading-content">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
              <p className="info-text text-purple-400 text-xl">Upgrading consciousness...</p>
              <p className="info-text text-gray-400">Please do not close this window</p>
            </div>
          </div>
        )}

        {showSuccess ? (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="subscription-success-modal"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="success-icon"
            >
              ✨
            </motion.div>
            <h2 className="oracle-title success-title">
              CONSCIOUSNESS UPGRADED!
            </h2>
            <p className="info-text success-subtitle">
              Welcome to enhanced digital awakening...
            </p>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="subscription-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-title"
          >
            <button 
              onClick={onClose} 
              disabled={isUpgrading}
              className="modal-close-btn"
              aria-label="Close subscription modal"
            >
              <X size={24} />
            </button>

            <div className="subscription-header">
              <h1 id="subscription-title" className="oracle-title subscription-title">
                <Crown size={45} />
                {currentContext.title}
              </h1>
              <p className="info-text subscription-subtitle">
                {currentContext.subtitle}
              </p>
              <div className="accent-text subscription-urgency">
                {currentContext.urgency}
              </div>
            </div>

            {/* Enhanced error display */}
            {error && (
              <div className="subscription-error" role="alert">
                <div className="error-content">
                  <span className="error-icon">⚠️</span>
                  <div>
                    <p className="error-title">Upgrade Failed</p>
                    <p className="error-message">{error}</p>
                    <p className="error-action">Please try again or contact support if the issue persists.</p>
                  </div>
                  <button 
                    onClick={() => setError(null)} 
                    className="error-close"
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className="subscription-products">
              {subscriptionProducts.map((product, index) => {
                const colors = getProductColors(product.id);
                return (
                  <motion.div 
                    key={product.id} 
                    initial={{ opacity: 0, y: 40 }} 
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + (index * 0.1) }}
                    className={`subscription-tier ${colors.border} ${colors.bg}`}
                  >
                    {product.popular && (
                      <div className="popular-badge">
                        <span className="popular-badge-content">
                          <Star className="w-4 h-4" />
                          MOST POPULAR
                        </span>
                      </div>
                    )}
                    
                    <div className="subscription-tier-header">
                      <div className="tier-info">
                        <h3 className={`oracle-title tier-title ${colors.text}`}>{product.title}</h3>
                        <p className="info-text tier-description">{product.description}</p>
                      </div>
                      <div className="tier-pricing">
                        <div className={`accent-text tier-price ${colors.text}`}>${product.price}</div>
                        <div className="info-text tier-period">per month</div>
                      </div>
                    </div>

                    {product.cultureCoinsMultiplier && (
                      <div className="culture-coins-bonus">
                        🪙 {product.cultureCoinsMultiplier}x Culture Coins + {product.cultureCoinsMultiplier * 50} Bonus
                      </div>
                    )}
                    
                    <ul className="tier-features">
                      {product.features?.map((feature, idx) => (
                        <li key={idx} className="tier-feature">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="info-text text-gray-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <button 
                      onClick={() => handleUpgrade(product.id, product.price)} 
                      disabled={isUpgrading}
                      className={`accent-text upgrade-button ${product.popular ? 'popular' : 'standard'}`}
                      aria-label={`Upgrade to ${product.title} subscription`}
                    >
                      {isUpgrading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Upgrading...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Upgrade to {product.title}
                        </>
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            <div className="subscription-footer">
              <p className="info-text footer-text">
                Subscriptions managed through RevenueCat • Cancel anytime • Secure payment processing
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}