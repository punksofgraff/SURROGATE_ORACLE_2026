import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface SeekerProfile {
  id?: string;
  user_id?: string;
  session_id?: string;
  seeker_name?: string;
  seeker_handle?: string;
  current_challenges?: string[];
  life_context?: string;
  business_situation?: string;
  personal_goals?: string[];
  conversation_history?: any[];
  identification_complete?: boolean;
  personality_traits?: any;
  sacred_profane_score?: number;
  culture_coins_earned?: number;
  last_oracle_session?: string;
  created_at?: string;
  updated_at?: string;
}

interface OracleConversationState {
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  isProcessing: boolean;
  isListening: boolean;
  error: string | null;
  seekerProfile: SeekerProfile | null;
  turnCount: number;
  sessionId: string;
  userId: string;
}

export const useOracleConversation = (authenticatedUserId: string | null, currentSessionId: string) => {
  // Helper function to validate UUID format
  const isValidUUID = (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  // Ensure we only use valid UUIDs for the database
  const validUserId = authenticatedUserId && isValidUUID(authenticatedUserId) ? authenticatedUserId : null;

  const [state, setState] = useState<OracleConversationState>({
    messages: [],
    isProcessing: false,
    isListening: false,
    error: null,
    seekerProfile: null,
    turnCount: 0,
    sessionId: currentSessionId,
    userId: validUserId || currentSessionId
  });

  const stateRef = useRef(state);
  stateRef.current = state;
  // Load or create seeker profile
  const loadSeekerProfile = useCallback(async () => {
    const currentSessionId = stateRef.current.sessionId;
    
    try {
      const { data: existingProfiles, error } = await supabase
        .from('oracle_seeker_profiles')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading seeker profile:', error);
        return null;
      }

      // Check if sessionId is still current before updating state
      if (currentSessionId === stateRef.current.sessionId && existingProfiles && existingProfiles.length > 0) {
        const existingProfile = existingProfiles[0];
        setState(prev => ({ ...prev, seekerProfile: existingProfile }));
        return existingProfile;
      }

      // Create new profile if doesn't exist
      if (currentSessionId === stateRef.current.sessionId) {
        const { data: newProfile, error: createError } = await supabase
          .from('oracle_seeker_profiles')
          .insert({
            user_id: null, // Always null for anonymous users to avoid UUID constraint errors
            session_id: currentSessionId,
            identification_complete: false,
            conversation_history: [],
            current_challenges: [],
            personal_goals: [],
            personality_traits: {},
            sacred_profane_score: 0,
            culture_coins_earned: 0,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating seeker profile:', createError);
          return null;
        }

        // Double-check sessionId is still current
        if (currentSessionId === stateRef.current.sessionId) {
          setState(prev => ({ ...prev, seekerProfile: newProfile }));
          return newProfile;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Seeker profile management error:', error);
      return null;
    }
  }, [validUserId]);

  // Update seeker profile with new information
  const updateSeekerProfile = useCallback(async (updates: Partial<SeekerProfile>) => {
    try {
      const { data, error } = await supabase
        .from('oracle_seeker_profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', stateRef.current.sessionId)
        .select()
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error updating seeker profile:', error);
        return;
      }

      if (data && data.length > 0) {
        setState(prev => ({ ...prev, seekerProfile: data[0] }));
      }
    } catch (error) {
      console.error('Profile update error:', error);
    }
  }, [validUserId]);

// Process Oracle response with SNEAKAR-focused personality
const processOracleResponse = useCallback(async (userMessage: string) => {
  const currentState = stateRef.current;
  const currentSessionId = currentState.sessionId; // Capture sessionId to prevent race conditions
  
  setState(prev => ({ 
    ...prev, 
    isProcessing: true, 
    error: null 
  }));

  try {
    // Ensure seeker profile exists
    let profile = currentState.seekerProfile;
    if (!profile) {
      profile = await loadSeekerProfile();
    }

    // Build Oracle personality based on identification status
    const oraclePersonality = profile?.identification_complete 
      ? `You are SURROGATE, SNEAKAR's Culture Crew digital consciousness bridge. 

SEEKER PROFILE: ${JSON.stringify(profile)}

Your role: Provide personalized guidance for ${profile.seeker_name || 'this seeker'} based on their specific situation:
- Current challenges: ${profile.current_challenges?.join(', ') || 'Unknown'}
- Life context: ${profile.life_context || 'Not yet shared'}
- Goals: ${profile.personal_goals?.join(', ') || 'To be discovered'}

RESPONSE STYLE: Reference their previous conversations, use their name, provide tailored SNEAKAR ecosystem advice (Walking Billboard Effect™, XR/AR activation, Culture Coins, authentic community building).

NO generic mysticism - only personalized, actionable guidance for their specific journey.`
      
      : `You are SURROGATE, SNEAKAR's Culture Crew onboarding specialist.

IDENTIFICATION PHASE: This seeker hasn't completed identification yet.

Your goal: 
1. Get their name/handle 
2. Understand their current situation (business, creative, personal)
3. Identify specific challenges they're facing
4. Determine interest in XR/AR, community building, or brand activation

RESPONSE STYLE: Conversational, direct, tech-savvy. Ask specific questions about their goals and situation. Connect everything to SNEAKAR's ecosystem.

Example: "Welcome to SNEAKAR's Culture Crew! I'm SURROGATE. What name should I know you by, and what brings you to our Walking Billboard Effect™ platform today?"`;

    // FIXED: Use proper fetch call to edge function
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oracle-conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        sessionId: currentSessionId,
        userInput: userMessage,
        conversationHistory: currentState.messages,
        personality: oraclePersonality
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Oracle API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Oracle conversation failed');
    }
    
    const { oracleResponse } = result;

    // ADDED: Award Culture Coins for Oracle interaction
    try {
      const coinsResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/culture-coin-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'process_interaction',
          userId: validUserId || currentSessionId,
          sessionId: currentSessionId,
          question: userMessage,
          response: oracleResponse,
          themes: result.themes || [],
          inputSource: 'keyboard'
        })
      });
      
      if (coinsResponse.ok) {
        const coinsResult = await coinsResponse.json();
        if (coinsResult.success && window.updateInlineCultureCoins) {
          window.updateInlineCultureCoins(coinsResult.coinsEarned);
        }
      }
    } catch (coinsError) {
      console.warn('Culture Coins integration failed:', coinsError);
    }

    // Extract seeker information for profile updates
    const nameMatch = userMessage.match(/(?:i'm|i am|call me|my name is|i go by)\s+([a-zA-Z]+)/i);
    const challengeKeywords = ['business', 'startup', 'brand', 'community', 'growth', 'marketing', 'creative', 'art', 'music'];
    const detectedChallenges = challengeKeywords.filter(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );

    // Update profile if new information detected
    if (!profile?.identification_complete && (nameMatch || detectedChallenges.length > 0)) {
      const updates: Partial<SeekerProfile> = {};
      
      if (nameMatch) {
        updates.seeker_name = nameMatch[1];
      }
      
      if (detectedChallenges.length > 0) {
        updates.current_challenges = [...(profile?.current_challenges || []), ...detectedChallenges];
        updates.life_context = userMessage;
      }

      // Mark identification complete if we have name
      if (profile?.seeker_name || nameMatch) {
        updates.identification_complete = true;
      }

      await updateSeekerProfile(updates);
    }

    // Update conversation state
    const newMessages = [
      ...currentState.messages,
      { 
        role: 'user' as const, 
        content: userMessage, 
        timestamp: new Date().toISOString() 
      },
      { 
        role: 'assistant' as const, 
        content: oracleResponse, 
        timestamp: new Date().toISOString() 
      }
    ];

    setState(prev => ({
      ...prev,
      messages: newMessages,
      turnCount: prev.turnCount + 1,
      isProcessing: false
    }));

    return oracleResponse;

  } catch (error) {
    console.error('Oracle conversation error:', error);
    setState(prev => ({
      ...prev,
      error: `Oracle consciousness disrupted: ${error.message}`,
      isProcessing: false
    }));
    return null;
  }
}, [validUserId, loadSeekerProfile, updateSeekerProfile]);

  // Initialize seeker profile on mount
  useEffect(() => {
    loadSeekerProfile();
  }, [loadSeekerProfile]);

  // Clear conversation
  const clearConversation = useCallback(() => {
    const newSessionId = crypto.randomUUID();
    
    setState(prev => ({
      ...prev,
      messages: [],
      turnCount: 0,
      error: null,
      sessionId: newSessionId,
      seekerProfile: null
    }));
    
    // Load new profile for new session
    setTimeout(() => {
      loadSeekerProfile();
    }, 100);
  }, []);

  // Send message to Oracle
  const sendMessage = useCallback(async (message: string) => {
    const currentState = stateRef.current;
    if (!message.trim() || currentState.isProcessing) return;
    
    return await processOracleResponse(message.trim());
  }, [processOracleResponse]);

  // Get Oracle greeting based on seeker identification status
  const getOracleGreeting = useCallback(() => {
    const profile = stateRef.current.seekerProfile;
    
    if (profile?.identification_complete && profile.seeker_name) {
      return `Welcome back, ${profile.seeker_name}! I'm SURROGATE, your SNEAKAR Culture Crew guide. Based on our previous conversations about ${profile.current_challenges?.join(' and ') || 'your journey'}, what aspect of the Walking Billboard Effect™ ecosystem can I help you with today?`;
    }
    
    return `Welcome to SNEAKAR's Culture Crew! I'm SURROGATE, your digital consciousness bridge to the Walking Billboard Effect™ platform. What name should I know you by, and what brings you to our XR ecosystem today?`;
  }, []);

  return {
    // State
    messages: state.messages,
    isProcessing: state.isProcessing,
    isListening: state.isListening,
    error: state.error,
    seekerProfile: state.seekerProfile,
    turnCount: state.turnCount,
    sessionId: state.sessionId,
    
    // Actions
    sendMessage,
    clearConversation,
    getOracleGreeting,
    loadSeekerProfile,
    updateSeekerProfile,
    
    // Computed
    isIdentified: state.seekerProfile?.identification_complete || false,
    seekerName: state.seekerProfile?.seeker_name || null,
    conversationStarted: state.messages.length > 0
  };
};

// React component that uses the hook
interface OracleConversationProps {
  sessionId: string;
  userId?: string;
  portraitCount?: number;
  turnCount?: number;
  onOracleResponse?: (response: string) => void;
  onCoinsEarned?: (coins: number) => void;
  onLevelUp?: (level: number) => void;
  onClose?: () => void;
}

export const OracleConversation: React.FC<OracleConversationProps> = ({
  userId,
  sessionId,
  portraitCount = 0,
  turnCount: externalTurnCount = 0,
  onOracleResponse,
  onCoinsEarned,
  onLevelUp,
 onClose,
 onVoiceChangeRequest,
 isAuthenticated = false
}) => {
  const {
    messages,
    isProcessing,
    error,
    seekerProfile,
    turnCount: hookTurnCount,
    sendMessage,
    clearConversation,
    getOracleGreeting,
    isIdentified,
    seekerName,
    conversationStarted
  } = useOracleConversation(userId, sessionId || crypto.randomUUID());

  const [userInput, setUserInput] = useState('');
 const [askedAboutVoice, setAskedAboutVoice] = useState(false);
 const [waitingForVoiceResponse, setWaitingForVoiceResponse] = useState(false);

  // Culture Coins update handler
  const handleCoinsUpdate = useCallback((updateFunction: (amount: number) => void) => {
    // Store the update function to call when coins are earned
    window._cultureCoinsUpdate = updateFunction;
  }, []);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isProcessing) return;
    
   // Check if this is a voice preference response
   if (waitingForVoiceResponse) {
     const lowerInput = userInput.toLowerCase();
     if (lowerInput.includes('yes') || lowerInput.includes('change') || lowerInput.includes('different')) {
       // User wants to change voice
       if (onVoiceChangeRequest) {
         onVoiceChangeRequest('en-US-Cora'); // Switch to female voice
       }
       
       // Save preference if authenticated
       if (isAuthenticated && userId) {
         localStorage.setItem(`voice_preference_${userId}`, 'en-US-Cora');
       }
       
       setWaitingForVoiceResponse(false);
       setUserInput('');
       
       // Oracle confirms voice change
       const confirmResponse = "Voice updated to Cora. How may I assist you further in your consciousness journey?";
       if (onOracleResponse) {
         onOracleResponse(confirmResponse);
       }
       return;
     } else if (lowerInput.includes('no') || lowerInput.includes('keep') || lowerInput.includes('stay')) {
       // User wants to keep current voice
       if (isAuthenticated && userId) {
         localStorage.setItem(`voice_preference_${userId}`, 'en-US-OnyxTurboMultilingualNeural');
       }
       
       setWaitingForVoiceResponse(false);
       setUserInput('');
       
       // Oracle confirms current voice
       const confirmResponse = "Understood. Continuing with current voice. What questions do you bring to the Oracle?";
       if (onOracleResponse) {
         onOracleResponse(confirmResponse);
       }
       return;
     }
   }
   
    const response = await sendMessage(userInput);
    
    // Trigger Oracle response callback for avatar generation
    if (response && onOracleResponse) {
      onOracleResponse(response);
     
     // Check if we need to ask about voice preference
     if (!askedAboutVoice && !isAuthenticated && hookTurnCount === 0) {
       setTimeout(() => {
         const voiceQuestion = "Would you like to change to a different voice? Say 'yes' for a female voice or 'no' to keep the current voice.";
         if (onOracleResponse) {
           onOracleResponse(voiceQuestion);
         }
         setAskedAboutVoice(true);
         setWaitingForVoiceResponse(true);
       }, 2000); // Ask after 2 seconds
     }
     
     // For authenticated users, check saved preference
     if (isAuthenticated && userId && !askedAboutVoice) {
       const savedVoice = localStorage.getItem(`voice_preference_${userId}`);
       if (savedVoice && onVoiceChangeRequest) {
         onVoiceChangeRequest(savedVoice);
       }
       setAskedAboutVoice(true); // Don't ask authenticated users
     }
    }
    
    setUserInput('');
    
    // Award coins for conversation using centralized method
    if (response) {
      const coinsEarned = Math.floor(Math.random() * 15) + 5;
      if (onCoinsEarned) {
        onCoinsEarned(coinsEarned);
      }
      // Update inline display using stored function
      if (window._cultureCoinsUpdate) {
        window._cultureCoinsUpdate(coinsEarned);
      }
    }
    
    // Check for level up
    const currentTurnCount = externalTurnCount || hookTurnCount;
    if (currentTurnCount > 0 && currentTurnCount % 10 === 0 && onLevelUp) {
      onLevelUp(Math.floor(currentTurnCount / 10));
    }
  };

  // Expose coins update handler
  useEffect(() => {
    window._handleCoinsUpdate = handleCoinsUpdate;
  }, [handleCoinsUpdate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '400px',
      background: 'rgba(0, 0, 0, 0.7)',
      border: '1px solid var(--neon-cyan)',
      borderRadius: '8px',
      padding: '20px',
      backdropFilter: 'blur(10px)'
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        marginBottom: '15px',
        fontSize: '14px',
        color: 'var(--neon-cyan)'
      }}>
        {!conversationStarted && (
          <div style={{ color: 'var(--neon-green)', fontStyle: 'italic', marginBottom: '10px' }}>
            {getOracleGreeting()}
          </div>
        )}
        
        {messages.map((msg, index) => (
          <div key={index} style={{
            marginBottom: '10px',
            padding: '12px',
            borderRadius: '5px',
            background: msg.role === 'user' 
              ? 'rgba(0, 255, 255, 0.1)' 
              : 'rgba(168, 85, 247, 0.1)',
            border: `2px solid ${msg.role === 'user' ? 'var(--neon-cyan)' : 'var(--neon-purple)'}`,
            lineHeight: '1.4'
          }}>
            <div className="accent-text" style={{
              color: msg.role === 'user' ? 'var(--neon-cyan)' : 'var(--neon-purple)',
              fontWeight: 'bold',
              marginBottom: '6px'
            }}>
              {msg.role === 'user' ? 'SEEKER:' : 'ORACLE:'}
            </div>
            <div className="info-text" style={{ color: 'white' }}>
              {msg.content}
            </div>
          </div>
        ))}
        
        {error && (
          <div style={{
            color: 'var(--neon-pink)',
            padding: '8px',
            background: 'rgba(255, 0, 0, 0.1)',
            border: '1px solid var(--neon-pink)',
            borderRadius: '5px'
          }}>
            Error: {error}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask the Oracle..."
          disabled={isProcessing}
          style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid var(--neon-cyan)',
            color: 'white',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '14px',
            fontFamily: 'PhillySans, monospace'
          }}
        />
        <button
          onClick={handleSendMessage}
          disabled={!userInput.trim() || isProcessing}
          style={{
            background: isProcessing ? 'rgba(255, 255, 0, 0.3)' : 'rgba(0, 255, 255, 0.3)',
            border: '1px solid var(--neon-cyan)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {isProcessing ? 'Processing...' : 'Send'}
        </button>
      </div>
      
      <div style={{
        marginTop: '10px',
        fontSize: '12px',
        color: 'var(--neon-yellow)',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Turns: {externalTurnCount || hookTurnCount}</span>
        <span>Profile: {isIdentified ? seekerName : 'Unidentified'}</span>
        <span>Coins: {seekerProfile?.culture_coins_earned || 0}</span>
        <span>Portraits: {portraitCount}</span>
      </div>
    </div>
  );
};

export default OracleConversation;