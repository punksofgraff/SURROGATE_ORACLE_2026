import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { defaultAudioTracks, AudioTrack } from '../config/audioTracks';

interface AudioPlayerProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentVolume?: number;
  oracleMode?: boolean;
  onVolumeChange?: (volume: number) => void;
  audioTracks?: AudioTrack[];
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  isPlaying, 
  onTogglePlay, 
  currentVolume = 0.5,
  oracleMode = false,
  onVolumeChange,
  audioTracks = defaultAudioTracks
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [failedTracks, setFailedTracks] = useState<Set<number>>(new Set());
  const [allTracksFailed, setAllTracksFailed] = useState<boolean>(false);
  const [showAutoplayBlockedMessage, setShowAutoplayBlockedMessage] = useState<boolean>(false);

  const [currentTrack, setCurrentTrack] = useState<number>(0);

  // Validate environment variables
  useEffect(() => {
    const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
    const missing = requiredEnvVars.filter(key => !import.meta.env[key]);
    
    if (missing.length > 0) {
      setEnvError(`Missing environment variables: ${missing.join(', ')}`);
      setIsReady(false);
    } else {
      setEnvError(null);
      setIsReady(true);
    }
  }, []);

  const handleVolumeChange = (newVolume: number) => {
    onVolumeChange?.(newVolume);
  };

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn('🔊 Audio autoplay blocked by browser:', error);
            // Auto-mute if autoplay fails and show message
            setIsMuted(true);
            setShowAutoplayBlockedMessage(true);
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      // Auto-reduce volume when Oracle is speaking
      const baseVolume = oracleMode ? currentVolume * 0.3 : currentVolume;
      const targetVolume = isMuted ? 0 : baseVolume;
      audioRef.current.volume = targetVolume;
      console.log(`🔊 Audio volume: ${targetVolume} (Oracle mode: ${oracleMode})`);
    }
  }, [currentVolume, isMuted, oracleMode]);

  useEffect(() => {
    // If all tracks have failed, don't try to load audio
    if (allTracksFailed) {
      console.log('🔇 All audio tracks failed - running in silent mode');
      return;
    }

    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const audio = new Audio(audioTracks[currentTrack].url);
    audio.loop = true;
    const baseVolume = oracleMode ? currentVolume * 0.3 : currentVolume;
    audio.volume = isMuted ? 0 : baseVolume;
    audio.crossOrigin = "anonymous";
    
    // Add error handling
    audio.onerror = (e) => {
      console.warn(`🔊 Audio track error: ${audioTracks[currentTrack].title}`, e);
      
      // Mark this track as failed
      setFailedTracks(prev => {
        const newFailedTracks = new Set(prev);
        newFailedTracks.add(currentTrack);
        
        // Check if all tracks have failed
        if (newFailedTracks.size >= audioTracks.length) {
          console.warn('🔇 All audio tracks failed - entering silent mode');
          setAllTracksFailed(true);
          return newFailedTracks;
        }
        
        // Find next working track
        let nextTrack = (currentTrack + 1) % audioTracks.length;
        while (newFailedTracks.has(nextTrack) && newFailedTracks.size < audioTracks.length) {
          nextTrack = (nextTrack + 1) % audioTracks.length;
        }
        
        // Only switch if we found a track that hasn't failed yet
        if (!newFailedTracks.has(nextTrack)) {
          console.log(`🔄 Switching to track ${nextTrack}: ${audioTracks[nextTrack].title}`);
          setCurrentTrack(nextTrack);
        }
        
        return newFailedTracks;
      });
    };
    
    // Add load event handling
    audio.oncanplaythrough = () => {
      console.log(`🔊 Audio track loaded: ${audioTracks[currentTrack].title}`);
    };
    
    // Add stalled event handling
    audio.onstalled = () => {
      console.warn(`🔊 Audio stalled: ${audioTracks[currentTrack].title}`);
    };
    
    audioRef.current = audio;

    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.load(); // Reset audio element
      }
      audioRef.current = null;
    };
  }, [currentTrack, currentVolume, isMuted, oracleMode, allTracksFailed]);

  const handleTrackEnd = () => {
    if (!allTracksFailed) {
      let nextTrack = (currentTrack + 1) % audioTracks.length;
      
      // Skip failed tracks
      while (failedTracks.has(nextTrack) && failedTracks.size < audioTracks.length) {
        nextTrack = (nextTrack + 1) % audioTracks.length;
      }
      
      setCurrentTrack(nextTrack);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    setShowAutoplayBlockedMessage(false); // Hide message when user manually unmutes
    if (audioRef.current) {
      const baseVolume = oracleMode ? currentVolume * 0.3 : currentVolume;
      audioRef.current.volume = !isMuted ? 0 : baseVolume;
    }
  };

  // Environment error state
  if (envError) {
    return (
      <div className="audio-player-error">
        <div className="error-content">
          <Volume2 className="w-5 h-5 text-red-400" />
          <span className="info-text text-red-400 text-sm">Audio Config Error</span>
        </div>
        <p className="info-text text-red-300 text-xs mt-1">{envError}</p>
      </div>
    );
  }

  // Loading state
  if (!isReady) {
    return (
      <div className="audio-player-loading">
        <Volume2 className="w-5 h-5 text-cyan-400 animate-pulse" />
        <span className="info-text text-cyan-400 text-sm">Initializing audio...</span>
      </div>
    );
  }

  return (
    <>
      {!allTracksFailed && (
        <audio ref={audioRef} src={audioTracks[currentTrack].url} onEnded={handleTrackEnd} loop />
      )}
      
      <div className="audio-controls-panel">
        {/* Autoplay blocked message */}
        {showAutoplayBlockedMessage && (
          <div className="autoplay-blocked-message">
            <span className="info-text text-yellow-400 text-sm">
              Autoplay blocked. Click play to enable sound.
            </span>
          </div>
        )}
        
        <button className="btn audio-control-btn" onClick={toggleMute} aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}>
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        
        <input
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={currentVolume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="volume-slider"
          aria-label="Audio volume control"
        />
        
        <div className="track-info info-text">
          {allTracksFailed ? 'Silent Mode' : audioTracks[currentTrack].title}
        </div>
      </div>
    </>
  );
};

export default AudioPlayer;
