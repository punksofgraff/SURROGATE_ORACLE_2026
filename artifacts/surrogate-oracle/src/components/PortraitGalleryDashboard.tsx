import { useState, useEffect, useCallback } from 'react';
import { Download, Eye, Loader2, Trash2, Share, Sparkles, Calendar, Tag, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showSuccessNotification, showErrorNotification } from '../utils/notifications';

interface Portrait {
  id: string;
  image_url?: string;
  portrait_url?: string;
  conversation_themes: string[];
  created_at: string;
  email?: string;
  dalle_generated?: boolean;
  google_ai_generated?: boolean;
  user_id?: string;
  session_id?: string;
  generation_method?: string;
  style_prompt?: string;
}

interface PortraitGalleryProps {
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  maxPortraits?: number;
  isBackendCabinetTab?: boolean;
  onClose?: () => void;
}

export function PortraitGalleryDashboard({
  userId,
  userEmail,
  sessionId,
  maxPortraits = 20,
  isBackendCabinetTab = false,
  onClose,
}: PortraitGalleryProps) {
  const [portraits, setPortraits] = useState<Portrait[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPortrait, setSelectedPortrait] = useState<Portrait | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ total: 0, thisWeek: 0, aiGenerated: 0 });

  const handleImageError = (portraitId: string) => {
    setImageErrors((prev) => new Set(prev).add(portraitId));
  };

  const fetchPortraits = useCallback(async () => {
    setIsLoading(true);
    setImageErrors(new Set());
    try {
      let query = supabase
        .from('surrogate_portraits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(maxPortraits);

      if (userId) {
        query = query.eq('user_id', userId);
      } else if (userEmail) {
        query = query.eq('email', userEmail);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else {
        setPortraits([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;

      const normalized = (data || []).map((p: Portrait) => ({
        ...p,
        portrait_url: p.image_url || p.portrait_url,
        conversation_themes: p.conversation_themes || [],
      }));

      setPortraits(normalized);

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      setStats({
        total: normalized.length,
        thisWeek: normalized.filter((p) => new Date(p.created_at) > weekAgo).length,
        aiGenerated: normalized.filter((p) => p.dalle_generated || p.google_ai_generated).length,
      });
    } catch (error: unknown) {
      console.error('Portrait fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userEmail, maxPortraits]);

  useEffect(() => { fetchPortraits(); }, [fetchPortraits]);

  const downloadPortrait = async (p: Portrait) => {
    try {
      const url = p.image_url || p.portrait_url;
      if (!url) return;
      showSuccessNotification('Downloading portrait...');
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `oracle-portrait-${p.id}-${new Date(p.created_at).toISOString().split('T')[0]}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      showSuccessNotification('Portrait downloaded!');
    } catch { showErrorNotification('Download failed.'); }
  };

  const sharePortrait = async (p: Portrait) => {
    try {
      const url = p.image_url || p.portrait_url;
      if (!url) return;
      const shareData = {
        title: '🎨 SURROGATE Oracle Portrait',
        text: `Check out my digital consciousness portrait! #STAYSNEAKAR`,
        url,
      };
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        showSuccessNotification('Portrait shared!');
      } else {
        await navigator.clipboard.writeText(url);
        showSuccessNotification('URL copied to clipboard!');
      }
    } catch { showErrorNotification('Share failed.'); }
  };

  const deletePortrait = async (portrait: Portrait) => {
    if (!confirm('Delete this portrait permanently?')) return;
    try {
      const { error } = await supabase.from('surrogate_portraits').delete().eq('id', portrait.id);
      if (error) throw error;
      setPortraits((prev) => prev.filter((p) => p.id !== portrait.id));
      showSuccessNotification('Portrait deleted.');
    } catch { showErrorNotification('Delete failed.'); }
  };

  const containerStyle: React.CSSProperties = {
    padding: isBackendCabinetTab ? '16px' : '24px',
    fontFamily: "'PhillySans', 'Orbitron', monospace",
    color: '#fff',
  };

  if (isLoading) {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <Loader2 size={24} style={{ color: '#00ffff', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, position: 'relative' }}>
      {onClose && (
        <button
          onClick={onClose}
          className="portrait-gallery-close"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10,
          }}
        >
          <XCircle size={20} />
        </button>
      )}
      {!isBackendCabinetTab && (
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', letterSpacing: '0.2em', color: '#00ff88', marginBottom: '0.5rem' }}>
            PORTRAIT ARCHIVE
          </h2>
          <p style={{ fontSize: '0.7rem', color: '#00ccff', opacity: 0.8 }}>
            › RECOVERED NEURAL SYNTHESIS
          </p>
        </div>
      )}
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'TOTAL', value: stats.total, color: '#00ffff' },
          { label: 'THIS WEEK', value: stats.thisWeek, color: '#00ff62' },
          { label: 'AI GEN', value: stats.aiGenerated, color: '#a78bfa' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}22`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '0.55rem', color: '#555', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: '0.7rem', color: '#555' }}>PORTRAIT COLLECTION</div>
        <button onClick={fetchPortraits} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {portraits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#444' }}>
          <Sparkles size={32} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: '0.75rem' }}>No portraits yet</div>
          <div style={{ fontSize: '0.65rem', marginTop: 6, color: '#333' }}>
            Have a conversation with the Oracle to generate your first portrait
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {portraits.map((p) => {
              const imgUrl = p.image_url || p.portrait_url;
              const hasError = imageErrors.has(p.id);
              return (
                <div
                  key={p.id}
                  style={{
                    position: 'relative',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#0a0a14',
                    cursor: 'pointer',
                    aspectRatio: '1',
                  }}
                  onClick={() => { setSelectedPortrait(p); setIsViewerOpen(true); }}
                >
                  {imgUrl && !hasError ? (
                    <img
                      src={imgUrl}
                      alt="Oracle portrait"
                      onError={() => handleImageError(p.id)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: '2rem' }}>
                      {hasError ? <XCircle size={24} style={{ color: '#ff0050' }} /> : '🎨'}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(0,0,0,0.7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: 0, transition: 'opacity 0.2s ease',
                    }}
                    className="portrait-overlay"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadPortrait(p); }}
                      style={{ background: 'rgba(0,255,136,0.2)', border: '1px solid rgba(0,255,136,0.5)', borderRadius: 6, padding: 6, color: '#00ff88', cursor: 'pointer' }}
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); sharePortrait(p); }}
                      style={{ background: 'rgba(176,38,255,0.2)', border: '1px solid rgba(176,38,255,0.5)', borderRadius: 6, padding: 6, color: '#b026ff', cursor: 'pointer' }}
                      title="Share"
                    >
                      <Share size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePortrait(p); }}
                      style={{ background: 'rgba(176,38,255,0.2)', border: '1px solid rgba(176,38,255,0.5)', borderRadius: 6, padding: 6, color: '#cc00ff', cursor: 'pointer' }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* AI badge */}
                  {(p.dalle_generated || p.google_ai_generated) && (
                    <div style={{ position: 'absolute', top: 6, left: 6, background: 'linear-gradient(135deg, #170529, #b026ff)', borderRadius: 4, padding: '2px 6px', fontSize: '0.55rem', color: '#ffffff', fontWeight: 700 }}>
                      AI
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!userId && !userEmail && (
            <div style={{ 
              marginTop: 20, padding: 16, 
              background: 'linear-gradient(135deg, rgba(176,38,255,0.1), rgba(0,255,136,0.1))',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#fff', marginBottom: 10, letterSpacing: '0.05em' }}>
                ANONYMOUS SIGNAL DETECTED
              </div>
              <p style={{ fontSize: '0.65rem', color: '#ffffff99', marginBottom: 12, lineHeight: 1.5 }}>
                Your neural prints will be lost when the session ends. Sign up to persist your consciousness.
              </p>
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('oracle:auth:trigger'))}
                style={{
                  width: '100%', padding: '10px', background: '#b026ff', border: 'none',
                  borderRadius: 8, color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                  cursor: 'pointer', fontFamily: "'PhillySans', 'Orbitron', monospace"
                }}
              >
                SIGN UP TO PERSIST
              </button>
            </div>
          )}
        </>
      )}

      {/* Viewer Modal */}
      {isViewerOpen && selectedPortrait && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setIsViewerOpen(false)}
        >
          <div style={{ maxWidth: '80vw', maxHeight: '80vh', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsViewerOpen(false)}
              style={{ position: 'absolute', top: -36, right: 0, background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}
            >
              <XCircle size={24} />
            </button>
            <img
              src={selectedPortrait.image_url || selectedPortrait.portrait_url}
              alt="Oracle portrait"
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)' }}
            />
            <div style={{ padding: '12px', textAlign: 'center', fontFamily: "'PhillySans', 'Orbitron', monospace" }}>
              {selectedPortrait.conversation_themes?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  {selectedPortrait.conversation_themes.map((t) => (
                    <span key={t} style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, padding: '2px 8px', fontSize: '0.65rem', color: '#00ff88' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '0.65rem', color: '#ffffff', opacity: 0.6 }}>
                {new Date(selectedPortrait.created_at).toLocaleDateString()}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                <button onClick={() => downloadPortrait(selectedPortrait)} style={{ padding: '8px 16px', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', borderRadius: 8, color: '#00ff88', cursor: 'pointer', fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Download size={14} /> DOWNLOAD
                </button>
                <button onClick={() => sharePortrait(selectedPortrait)} style={{ padding: '8px 16px', background: 'rgba(176,38,255,0.15)', border: '1px solid rgba(176,38,255,0.4)', borderRadius: 8, color: '#b026ff', cursor: 'pointer', fontFamily: "'PhillySans', 'Orbitron', monospace", fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Share size={14} /> SHARE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Named export for use as BackendCabinetPortraitTab
export const BackendCabinetPortraitTab = PortraitGalleryDashboard;
