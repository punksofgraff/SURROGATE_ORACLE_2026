import { useState, useEffect, useCallback } from 'react';
import { Download, Loader2, Trash2, Share, Sparkles, RefreshCw, XCircle } from 'lucide-react';
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
  userId, userEmail, sessionId, maxPortraits = 20,
  isBackendCabinetTab = false, onClose,
}: PortraitGalleryProps) {
  const [portraits, setPortraits]           = useState<Portrait[]>([]);
  const [isLoading, setIsLoading]           = useState(true);
  const [selectedPortrait, setSelected]     = useState<Portrait | null>(null);
  const [isViewerOpen, setViewerOpen]       = useState(false);
  const [imageErrors, setImageErrors]       = useState<Set<string>>(new Set());
  const [stats, setStats]                   = useState({ total: 0, thisWeek: 0, aiGenerated: 0 });

  const handleImageError = (id: string) => setImageErrors((prev) => new Set(prev).add(id));

  const fetchPortraits = useCallback(async () => {
    setIsLoading(true);
    setImageErrors(new Set());
    try {
      let query = supabase
        .from('surrogate_portraits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(maxPortraits);

      if (userId)        query = query.eq('user_id', userId);
      else if (userEmail) query = query.eq('email', userEmail);
      else if (sessionId) query = query.eq('session_id', sessionId);
      else { setPortraits([]); setIsLoading(false); return; }

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
        total:        normalized.length,
        thisWeek:     normalized.filter((p) => new Date(p.created_at) > weekAgo).length,
        aiGenerated:  normalized.filter((p) => p.dalle_generated || p.google_ai_generated).length,
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
      const blob     = await response.blob();
      const dlUrl    = window.URL.createObjectURL(blob);
      const link     = document.createElement('a');
      link.href      = dlUrl;
      link.download  = `oracle-portrait-${p.id}-${new Date(p.created_at).toISOString().split('T')[0]}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(dlUrl);
      showSuccessNotification('Portrait downloaded!');
    } catch { showErrorNotification('Download failed.'); }
  };

  const sharePortrait = async (p: Portrait) => {
    try {
      const url = p.image_url || p.portrait_url;
      if (!url) return;
      const shareData = { title: 'SURROGATE Oracle Portrait', text: 'Check out my digital consciousness portrait! #STAYSNEAKAR', url };
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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Loader2 size={24} style={{ color: '#00ffcc', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'PhillySans', monospace", color: '#fff', position: 'relative' }}>
      {onClose && (
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}
        >
          <XCircle size={18} />
        </button>
      )}

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'TOTAL',     value: stats.total,        color: '#00ffcc' },
          { label: 'THIS WEEK', value: stats.thisWeek,     color: '#00ff88' },
          { label: 'AI GEN',    value: stats.aiGenerated,  color: '#b026ff' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(0,0,0,0.52)', borderBottom: `3px solid ${color}55`, borderRadius: '3px 12px 3px 12px', padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 'clamp(1.4rem, 5vw, 2.0rem)', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', marginTop: 4, textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.84rem', fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(0,255,136,0.45)', textTransform: 'uppercase' }}>PORTRAIT COLLECTION</span>
        <button
          onClick={fetchPortraits}
          style={{ background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '2px 8px 2px 8px', color: '#00ff88', cursor: 'pointer', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {portraits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '44px 20px' }}>
          <Sparkles size={36} style={{ marginBottom: 14, color: '#00ff8840' }} />
          <div style={{ fontFamily: "'aAnotherTag', sans-serif", fontSize: 'clamp(1.4rem, 5vw, 2.0rem)', color: '#00ff88', letterSpacing: '0.05em', marginBottom: 10 }}>NOT RENDERED YET</div>
          <div style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', lineHeight: 1.9, fontWeight: 600 }}>
            Come into the signal.<br />Let the archive see who you are.<br />Then we will compose you.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {portraits.map((p) => {
              const imgUrl  = p.image_url || p.portrait_url;
              const hasError = imageErrors.has(p.id);
              return (
                <div
                  key={p.id}
                  style={{ position: 'relative', borderRadius: '4px 14px 4px 14px', overflow: 'hidden', border: '1px solid rgba(0,255,136,0.15)', background: '#03050e', cursor: 'pointer', aspectRatio: '1' }}
                  onClick={() => { setSelected(p); setViewerOpen(true); }}
                >
                  {imgUrl && !hasError ? (
                    <img src={imgUrl} alt="Oracle portrait" onError={() => handleImageError(p.id)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333' }}>
                      {hasError ? <XCircle size={24} style={{ color: '#ff0050' }} /> : <Sparkles size={28} style={{ color: 'rgba(0,255,136,0.2)' }} />}
                    </div>
                  )}

                  {/* Action overlay */}
                  <div
                    className="portrait-overlay"
                    style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0, transition: 'opacity 0.2s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                    onTouchStart={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    onTouchEnd={(e) => { const el = e.currentTarget as HTMLElement; setTimeout(() => { el.style.opacity = '0'; }, 2200); }}
                  >
                    {[
                      { action: () => downloadPortrait(p), icon: <Download size={16} />, color: '#00ff88' },
                      { action: () => sharePortrait(p),    icon: <Share    size={16} />, color: '#00ffcc' },
                      { action: () => deletePortrait(p),   icon: <Trash2   size={16} />, color: '#b026ff' },
                    ].map(({ action, icon, color }, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); action(); }}
                        style={{ background: `${color}22`, border: `1px solid ${color}66`, borderRadius: '2px 8px 2px 8px', padding: 10, color, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>

                  {/* AI badge */}
                  {(p.dalle_generated || p.google_ai_generated) && (
                    <div style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(176,38,255,0.85)', borderRadius: '1px 6px 1px 6px', padding: '3px 8px', fontFamily: "'PhillySans', monospace", fontSize: '0.68rem', color: '#fff', fontWeight: 800, letterSpacing: '0.1em' }}>AI</div>
                  )}
                </div>
              );
            })}
          </div>

          {!userId && !userEmail && (
            <div style={{ marginTop: 18, padding: '20px', background: 'rgba(0,0,0,0.48)', border: '1px solid rgba(176,38,255,0.2)', borderLeft: '4px solid #b026ff', borderRadius: '3px 16px 3px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'aAnotherTag', sans-serif", fontSize: 'clamp(1.2rem, 4vw, 1.6rem)', color: '#b026ff', letterSpacing: '0.05em', marginBottom: 8 }}>ANONYMOUS SIGNAL</div>
              <p style={{ fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, fontWeight: 600, marginBottom: 14 }}>
                Your neural prints will be lost when the session ends. Sign up to persist your consciousness.
              </p>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('oracle:auth:trigger'))}
                style={{ width: '100%', padding: '14px', background: 'rgba(176,38,255,0.14)', border: '2px solid #b026ff', borderRadius: '2px 12px 2px 12px', color: '#b026ff', fontFamily: "'PhillySans', monospace", fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.12em', cursor: 'pointer' }}
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
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setViewerOpen(false)}
        >
          <div style={{ maxWidth: '82vw', maxHeight: '82vh', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewerOpen(false)}
              style={{ position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
            >
              <XCircle size={26} />
            </button>
            <img
              src={selectedPortrait.image_url || selectedPortrait.portrait_url}
              alt="Oracle portrait"
              style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: '4px 18px 4px 18px', border: '1px solid rgba(0,255,136,0.25)' }}
            />
            <div style={{ padding: '14px 4px', textAlign: 'center' }}>
              {selectedPortrait.conversation_themes?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  {selectedPortrait.conversation_themes.map((t) => (
                    <span key={t} style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.28)', borderRadius: '2px 8px 2px 8px', padding: '4px 12px', fontFamily: "'PhillySans', monospace", fontSize: '0.84rem', color: '#00ff88', fontWeight: 700, letterSpacing: '0.08em' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                {new Date(selectedPortrait.created_at).toLocaleDateString()}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={() => downloadPortrait(selectedPortrait)}
                  style={{ padding: '12px 20px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.35)', borderRadius: '2px 12px 2px 12px', color: '#00ff88', cursor: 'pointer', fontFamily: "'PhillySans', monospace", fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Download size={15} /> DOWNLOAD
                </button>
                <button
                  onClick={() => sharePortrait(selectedPortrait)}
                  style={{ padding: '12px 20px', background: 'rgba(176,38,255,0.1)', border: '1px solid rgba(176,38,255,0.35)', borderRadius: '2px 12px 2px 12px', color: '#b026ff', cursor: 'pointer', fontFamily: "'PhillySans', monospace", fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Share size={15} /> SHARE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const BackendCabinetPortraitTab = PortraitGalleryDashboard;
