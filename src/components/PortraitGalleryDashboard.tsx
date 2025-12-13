import React, { useState, useEffect, useCallback } from 'react';
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
  maxPortraits?: number;
  isBackendCabinetTab?: boolean;
}

export function PortraitGalleryDashboard({ 
  userId, 
  userEmail, 
  maxPortraits = 20,
  isBackendCabinetTab = false
}: PortraitGalleryProps) {
  const [portraits, setPortraits] = useState<Portrait[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPortrait, setSelectedPortrait] = useState<Portrait | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [filterBy, setFilterBy] = useState<'all' | 'recent' | 'ai' | 'themes'>('all');
  const [stats, setStats] = useState({ total: 0, thisWeek: 0, aiGenerated: 0 });

  // Handle image loading errors
  const handleImageError = (portraitId: string) => {
    setImageErrors(prev => new Set(prev).add(portraitId));
  };

  const fetchPortraits = useCallback(async () => {
    setIsLoading(true);
    setImageErrors(new Set()); // Reset image errors on refetch
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
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const normalized = data.map((p: any) => ({
        ...p,
        portrait_url: p.image_url || p.portrait_url,
        conversation_themes: p.conversation_themes || []
      }));

      setPortraits(normalized);
      
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      setStats({
        total: normalized.length,
        thisWeek: normalized.filter(p => new Date(p.created_at) > weekAgo).length,
        aiGenerated: normalized.filter(p => p.dalle_generated || p.google_ai_generated).length
      });
      
    } catch (error: any) {
      console.error('Portrait fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userEmail, maxPortraits]);

  useEffect(() => { 
    fetchPortraits(); 
  }, [fetchPortraits]);
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
      showSuccessNotification('Portrait downloaded successfully!');
    } catch (e: any) {
      console.error('Download failed:', e);
      showErrorNotification('Download failed. Please try again.');
    }
  };

  const sharePortrait = async (p: Portrait) => {
    try {
      const url = p.image_url || p.portrait_url;
      if (!url) return;

      const shareData = {
        title: '🎨 SURROGATE Oracle Portrait',
        text: `Check out my digital consciousness portrait! Generated with themes: ${p.conversation_themes.join(', ')} #STAYSNEAKAR`,
        url: url
      };

      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        showSuccessNotification('Portrait shared successfully!');
      } else {
        await navigator.clipboard.writeText(url);
        showSuccessNotification('Portrait URL copied to clipboard!');
      }
    } catch (e: any) {
      console.error('Share failed:', e);
      showErrorNotification('Share failed. Please try again.');
    }
  };

  const deletePortrait = async (id: string) => {
    if (!confirm('Delete this portrait? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('surrogate_portraits')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setPortraits(prev => prev.filter(p => p.id !== id));
      
      if (selectedPortrait?.id === id) {
        setIsViewerOpen(false);
        setSelectedPortrait(null);
      }
      showSuccessNotification('Portrait deleted successfully');
    } catch (e: any) {
      console.error('Delete failed:', e);
      showErrorNotification('Delete failed. Please try again.');
    }
  };

  const filteredPortraits = portraits.filter(p => {
    switch (filterBy) {
      case 'recent':
        return new Date(p.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      case 'ai':
        return p.dalle_generated || p.google_ai_generated;
      case 'themes':
        return p.conversation_themes && p.conversation_themes.length > 0;
      default:
        return true;
    }
  });
  return (
    <div className={`w-full h-full space-y-6 ${isBackendCabinetTab ? 'p-6' : 'panel'}`}>
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h2 className="oracle-title text-xl font-bold text-white">Procedural Portraits</h2>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <div className="info-text px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-full text-purple-300">
              {stats.total} Total
            </div>
            <div className="info-text px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full text-blue-300">
              {stats.thisWeek} This Week
            </div>
            <div className="info-text px-3 py-1 bg-green-600/20 border border-green-500/30 rounded-full text-green-300">
              {stats.aiGenerated} AI Generated
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={fetchPortraits}
            disabled={isLoading}
            className="btn p-2 bg-gray-600/20 border border-gray-500/30 rounded text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2">
        {[
          { key: 'all', label: 'All Portraits', icon: Eye, count: portraits.length },
          { key: 'recent', label: 'Recent', icon: Calendar, count: stats.thisWeek },
          { key: 'ai', label: 'AI Generated', icon: Sparkles, count: stats.aiGenerated },
          { key: 'themes', label: 'Themed', icon: Tag, count: portraits.filter(p => p.conversation_themes?.length > 0).length }
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setFilterBy(key as any)}
            className={`px-4 py-2 rounded-lg text-sm flex items-center space-x-2 transition-all ${
              filterBy === key 
                ? 'bg-purple-600/30 border border-purple-500/50 text-purple-300 shadow-lg' 
                : 'bg-gray-800/50 border border-gray-600/30 text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            <span className="text-xs opacity-75">({count})</span>
          </button>
        ))}
      </div>

      {/* Gallery Container */}
      <div className="min-h-[500px] bg-black/40 border border-purple-500/30 rounded-lg p-6">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
              <p className="accent-text text-purple-400 text-lg">Loading your portraits...</p>
              <p className="info-text text-gray-500 text-sm mt-2">Fetching from the digital consciousness realm</p>
            </div>
          </div>
        ) : filteredPortraits.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <Sparkles className="w-20 h-20 text-purple-400 opacity-50" />
              <div className="absolute inset-0 w-20 h-20 border-2 border-purple-500/30 rounded-full animate-pulse"></div>
            </div>
            <h3 className="oracle-title text-2xl font-bold text-white mb-4">Your Oracle Portraits Will Appear Here</h3>
            <p className="text-gray-400 mb-6 max-w-md leading-relaxed">
              {filterBy === 'all' 
                ? "Your procedural portraits from Oracle conversations will appear here. Each portrait captures the essence of your digital consciousness journey."
                : `No portraits found for "${filterBy}" filter. Try a different filter or complete more Oracle conversations.`
              }
            </p>
            <div className="accent-text text-sm text-purple-400/70 font-mono">
              // Awaiting your first Oracle experience...
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {filterBy === 'all' ? 'All Portraits' : `${filterBy.charAt(0).toUpperCase() + filterBy.slice(1)} Portraits`}
                <span className="text-gray-400 ml-2">({filteredPortraits.length})</span>
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
              {filteredPortraits.map((p) => (
                <div 
                  key={p.id} 
                  className="relative aspect-square bg-gray-900 rounded-xl overflow-hidden border-2 border-purple-500/20 hover:border-purple-400/60 transition-all duration-300 group cursor-pointer hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20"
                  onClick={() => { setSelectedPortrait(p); setIsViewerOpen(true); }}
                >
                  {!imageErrors.has(p.id) ? (
                    <img 
                      src={p.image_url || p.portrait_url} 
                      alt="Procedural Portrait" 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      loading="lazy"
                      onError={() => handleImageError(p.id)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                      <Sparkles className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                      <p className="info-text text-gray-500 text-sm text-center">Image unavailable</p>
                    </div>
                  )}
                  
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute top-3 right-3 flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); downloadPortrait(p); }} 
                        className="btn p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all hover:scale-110"
                        aria-label="Download portrait"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); sharePortrait(p); }} 
                        className="btn p-2 bg-blue-500/20 backdrop-blur-md rounded-full text-white hover:bg-blue-500/30 transition-all hover:scale-110"
                        aria-label="Share portrait"
                      >
                        <Share className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deletePortrait(p.id); }} 
                        className="close p-2 bg-red-500/20 backdrop-blur-md rounded-full text-white hover:bg-red-500/30 transition-all hover:scale-110"
                        aria-label="Delete portrait"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex flex-wrap gap-1 mb-2">
                        {p.conversation_themes?.slice(0, 2).map((theme, i) => (
                          <span 
                            key={i} 
                            className="px-2 py-1 text-xs bg-purple-500/40 backdrop-blur-sm rounded-full text-purple-200 border border-purple-400/30"
                          >
                            {theme}
                          </span>
                        ))}
                        {(p.dalle_generated || p.google_ai_generated) && (
                          <span className="px-2 py-1 text-xs bg-green-500/40 backdrop-blur-sm rounded-full text-green-200 border border-green-400/30 ml-auto">
                            AI
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-300">
                        {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Portrait Viewer Modal */}
      {isViewerOpen && selectedPortrait && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="relative max-w-4xl max-h-[90vh] bg-gray-900 rounded-2xl overflow-hidden border border-purple-500/30">
            <button 
              onClick={() => setIsViewerOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black/70 transition-all"
              aria-label="Close portrait viewer"
            >
              <XCircle className="w-5 h-5" />
            </button>
            
            <img 
              src={selectedPortrait.image_url || selectedPortrait.portrait_url} 
              alt="Procedural Portrait" 
              className="w-full h-auto max-h-[70vh] object-contain"
            />
            
            <div className="p-6 bg-gradient-to-t from-black/90 to-transparent">
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedPortrait.conversation_themes?.map((theme, i) => (
                  <span 
                    key={i} 
                    className="px-3 py-1 text-sm bg-purple-500/40 backdrop-blur-sm rounded-full text-purple-200 border border-purple-400/30"
                  >
                    {theme}
                  </span>
                ))}
              </div>
              
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>Created: {new Date(selectedPortrait.created_at).toLocaleDateString()}</span>
                <div className="flex gap-3">
                  <button 
                    onClick={() => downloadPortrait(selectedPortrait)}
                    className="btn flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-lg text-white hover:bg-white/20 transition-all"
                    aria-label="Download this portrait"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button 
                    onClick={() => sharePortrait(selectedPortrait)}
                    className="btn flex items-center gap-2 px-4 py-2 bg-blue-500/20 backdrop-blur-md rounded-lg text-white hover:bg-blue-500/30 transition-all"
                    aria-label="Share this portrait"
                  >
                    <Share className="w-4 h-4" />
                    Share
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Backend Cabinet Tab Component
export function BackendCabinetPortraitTab({ userId, userEmail }: { userId?: string; userEmail?: string }) {
  return (
    <div className="h-full bg-gray-900">
      <PortraitGalleryDashboard 
        userId={userId}
        userEmail={userEmail}
        maxPortraits={50}
        isBackendCabinetTab={true}
      />
    </div>
  );
}
