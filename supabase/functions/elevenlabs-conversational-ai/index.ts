import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://thesurrogate.me',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface ConversationRequest {
  action: 'create_conversation' | 'send_message' | 'get_conversation_id';
  sessionId: string;
  userId?: string;
  message?: string;
  voiceId?: string;
  agentId?: string;
}

interface ConversationResponse {
  success: boolean;
  conversationId?: string;
  websocketUrl?: string;
  agentResponse?: string;
  audioUrl?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, sessionId, userId, message, voiceId = 'pkVKlZzgF2P5dTEGkrVh', agentId }: ConversationRequest = await req.json();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Session ID is required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Read from secret: npx supabase secrets set ELEVENLABS_API_KEY=sk_...
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

    if (!elevenLabsApiKey) {
      console.error('❌ ELEVENLABS_API_KEY secret not set');
      return new Response(
        JSON.stringify({ success: false, error: 'ELEVENLABS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎵 ElevenLabs Conversational AI: ${action} for session ${sessionId}`);

    switch (action) {
      case 'create_conversation': {
        console.log('🚀 Creating ElevenLabs Conversational AI session...');

        try {
          // ✅ FIX 404/405: Try multiple endpoint formats
          console.log('🔍 Agent ID being used:', agentId);
          console.log('🔍 API Key length:', elevenLabsApiKey ? elevenLabsApiKey.length : 'MISSING');
          
          // Try the correct conversational AI endpoint format
          const conversationUrl = `https://api.elevenlabs.io/v1/convai/conversations`;
          console.log('📡 Calling ElevenLabs API:', conversationUrl);

          const conversationResponse = await fetch(conversationUrl, {
            method: 'POST',
            headers: {
              'xi-api-key': elevenLabsApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'SurrogateOracle/1.0'
            },
            body: JSON.stringify({
              agent_id: agentId,
              require_auth: false
            }),
          });

          console.log('📡 ElevenLabs response status:', conversationResponse.status);
          console.log('📡 ElevenLabs response headers:', Object.fromEntries(conversationResponse.headers.entries()));

          if (!conversationResponse.ok) {
            const errorText = await conversationResponse.text();
            console.error('❌ ElevenLabs conversation creation failed:', conversationResponse.status, errorText);
            
            // If 404/405, try alternative endpoints or list agents
            if (conversationResponse.status === 404 || conversationResponse.status === 405) {
              console.log('🔍 Agent not found, checking available agents...');
              
              try {
                const agentsResponse = await fetch('https://api.elevenlabs.io/v1/convai/agents', {
                  method: 'GET',
                  headers: {
                    'xi-api-key': elevenLabsApiKey,
                    'Accept': 'application/json'
                  }
                });
                
                if (agentsResponse.ok) {
                  const agentsData = await agentsResponse.json();
                  console.log('📋 Available agents:', agentsData);
                  
                  // ✅ AUTOMATIC FALLBACK TO TTS MODE
                  console.log('🔄 Agent not found, falling back to TTS mode automatically...');
                  
                  // Store TTS fallback mode in database
                  const { error: dbError } = await supabase
                    .from('surrogate_sessions')
                    .upsert({
                      session_id: sessionId,
                      conversation_data: {
                        mode: 'tts_fallback',
                        elevenlabs_voice_id: voiceId,
                        fallback_reason: `Agent ${agentId} not found - using TTS fallback`,
                        available_agents: agentsData.agents || agentsData,
                        created_at: new Date().toISOString()
                      }
                    });

                  return new Response(JSON.stringify({
                    success: true,
                    mode: 'tts_fallback',
                    voiceId: voiceId,
                    message: `Agent ${agentId} not found - using TTS fallback mode`,
                    availableAgents: agentsData.agents || agentsData
                  }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                  });
                }
              } catch (listError) {
                console.error('❌ Failed to list agents:', listError);
              }
            }
            
            throw new Error(`Conversation creation failed: ${conversationResponse.status} - ${errorText}`);
          }

          const conversationData = await conversationResponse.json();
          console.log('✅ ElevenLabs conversation created:', conversationData);

          // Store conversation info in database
          const { error: dbError } = await supabase
            .from('surrogate_sessions')
           .upsert({
              session_id: sessionId,
              conversation_data: {
                elevenlabs_conversation_id: conversationData.conversation_id,
                elevenlabs_agent_id: agentId,
                elevenlabs_voice_id: voiceId,
                websocket_url: conversationData.websocket_url,
                conversation_type: 'elevenlabs_conversational_ai',
                created_at: new Date().toISOString()
              }
           }, {
             onConflict: 'session_id'
           });

          if (dbError) {
            console.error('❌ Database error storing conversation:', dbError);
          } else {
            console.log('✅ ElevenLabs conversation stored successfully:', {
              sessionId,
              conversationId: conversationData.conversation_id
            });
          }

          return new Response(
            JSON.stringify({
              success: true,
              conversationId: conversationData.conversation_id,
              websocketUrl: conversationData.websocket_url,
              agentId: agentId,
              voiceId: voiceId
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );

        } catch (error: any) {
          console.error('❌ ElevenLabs conversation creation error:', error);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to create conversation: ${error.message}`,
              debug: {
                agentId: agentId,
                endpoint: `https://api.elevenlabs.io/v1/convai/agents/${agentId}/conversation`,
                suggestion: 'Check if agent exists in your ElevenLabs dashboard'
              }
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      }

      case 'send_message': {
        if (!message) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Message is required' 
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('💬 Sending message to ElevenLabs conversation...');

        try {
          // Get conversation ID from database
          console.log(`🔍 Looking up conversation for session: ${sessionId}`);
          const { data: sessionData, error: getError } = await supabase
            .from('surrogate_sessions')
            .select('conversation_data')
            .eq('session_id', sessionId)
            .single();

          console.log('🔍 Session data retrieved:', { 
            hasData: !!sessionData, 
            error: getError?.message,
            conversationDataKeys: sessionData?.conversation_data ? Object.keys(sessionData.conversation_data) : []
          });

          if (getError || !sessionData) {
            console.error('❌ Session lookup failed:', getError);
            throw new Error('Session not found or no conversation ID');
          }

          const conversationId = sessionData.conversation_data?.elevenlabs_conversation_id;
          console.log('🔍 Extracted conversation ID:', conversationId);
          console.log('🔍 Full conversation_data structure:', JSON.stringify(sessionData.conversation_data, null, 2));
         
          if (!conversationId) {
            console.error('❌ No conversation ID in session data:', sessionData.conversation_data);
            throw new Error('No ElevenLabs conversation ID found');
          }

          // Send message to ElevenLabs conversation
          const messageResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
            method: 'POST',
            headers: {
              'xi-api-key': elevenLabsApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: message
            }),
          });

          if (!messageResponse.ok) {
            const errorText = await messageResponse.text();
            throw new Error(`Message send failed: ${messageResponse.status} - ${errorText}`);
          }

          const messageResult = await messageResponse.json();
          console.log('✅ Message sent to ElevenLabs conversation');

          return new Response(
            JSON.stringify({
              success: true,
              agentResponse: messageResult.agent_response || message,
              audioUrl: messageResult.audio_url
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );

        } catch (error: any) {
          console.error('❌ ElevenLabs message send error:', error);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to send message: ${error.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      }

      case 'send_tts_message': {
        if (!message) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Message is required for TTS fallback' 
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('🎤 TTS Fallback: Processing message with Claude + ElevenLabs TTS...');

        try {
          // 1. Get Oracle response from Claude
          const claudeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/oracle-conversation`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
            },
            body: JSON.stringify({
              sessionId: sessionId,
              userInput: message,
              conversationHistory: [],
              requestType: 'tts-fallback'
            })
          });

          if (!claudeResponse.ok) {
            throw new Error(`Claude API failed: ${claudeResponse.status}`);
          }

          const claudeData = await claudeResponse.json();
          const oracleResponse = claudeData.oracleResponse; // matches oracle-conversation response shape

          // 2. Convert Oracle response to speech using ElevenLabs TTS
          const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
              'xi-api-key': elevenLabsApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: oracleResponse,
              model_id: 'eleven_turbo_v2_5', // low-latency, current model
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5
              }
            }),
          });

          if (!ttsResponse.ok) {
            throw new Error(`TTS failed: ${ttsResponse.status}`);
          }

          const audioBuffer = await ttsResponse.arrayBuffer();
          const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

          return new Response(
            JSON.stringify({
              success: true,
              agentResponse: oracleResponse,
              audioBase64: audioBase64,
              mode: 'tts_fallback'
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );

        } catch (error: any) {
          console.error('❌ TTS Fallback error:', error);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `TTS fallback failed: ${error.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      }

      default: {
        console.log('🔄 SURGICAL SWITCH: Using hybrid STT+TTS to preserve Oracle consciousness...');
        
        // Store hybrid mode session instead of creating ElevenLabs conversation
        const { error: dbError } = await supabase
          .from('surrogate_sessions')
          .upsert({
            session_id: sessionId,
            conversation_data: {
              mode: 'hybrid_stt_tts',
              elevenlabs_voice_id: voiceId || 'pkVKlZzgF2P5dTEGkrVh',
              created_at: new Date().toISOString(),
              switch_reason: 'Preserving Oracle brain consciousness with hybrid mode'
            }
          });

        if (dbError) {
          console.error('❌ Database error storing hybrid session:', dbError);
        }

        console.log('✅ Hybrid STT+TTS mode initialized - Oracle brain preserved');

        return new Response(JSON.stringify({
          success: true,
          mode: 'hybrid_stt_tts',
          conversationId: `hybrid-${sessionId}`,
          websocketUrl: null, // No websocket needed for hybrid
          voiceId: voiceId,
          message: 'Using hybrid STT+TTS to preserve Oracle consciousness'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (error) {
    console.error('❌ ElevenLabs Conversational AI error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Internal server error: ${error.message}` 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});