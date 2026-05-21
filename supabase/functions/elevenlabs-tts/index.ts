import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-requested-with',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'false'
};

interface TTSRequest {
  text: string;
  voice_id: string;
  sessionId: string;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

Deno.serve(async (req: Request) => {
  console.log(`🌐 ElevenLabs TTS request: ${req.method} ${req.url}`);
  
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      console.log('✅ Handling CORS preflight request');
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== 'POST') {
      console.log(`❌ Method not allowed: ${req.method}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
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

    const { 
      text, 
      voice_id, 
      sessionId, 
      model_id = 'eleven_multilingual_v2',
      voice_settings = {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    }: TTSRequest = await req.json();

    if (!text || !voice_id) {
      console.log('❌ Missing required parameters');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required parameters: text and voice_id' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🎤 Generating TTS for session ${sessionId}`);
    console.log(`🎵 Voice ID: ${voice_id}`);
    console.log(`📝 Text length: ${text.length} characters`);

    // Read from secret: npx supabase secrets set ELEVENLABS_API_KEY=sk_...
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

    if (!elevenLabsApiKey) {
      console.error('❌ ELEVENLABS_API_KEY secret not set');
      return new Response(
        JSON.stringify({ success: false, error: 'ELEVENLABS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔑 ElevenLabs key found (length: ${elevenLabsApiKey.length})`);

    try {
      // ElevenLabs TTS API call
      console.log(`🚀 Making ElevenLabs API request to voice: ${voice_id}`);
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text,
          model_id: model_id,
          voice_settings: voice_settings,
        }),
      });

      console.log(`📡 ElevenLabs TTS response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ElevenLabs TTS failed:', response.status, errorText);
        
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.detail || errorJson.message || errorText;
        } catch {
          // Keep original error text if not JSON
        }
        throw new Error(`ElevenLabs TTS failed: ${response.status} - ${errorDetails}`);
      }

      const audioBuffer = await response.arrayBuffer();
      console.log(`🎵 Audio generated, size: ${audioBuffer.byteLength} bytes`);

      if (audioBuffer.byteLength === 0) {
        throw new Error('ElevenLabs returned empty audio');
      }

      // Convert to base64 for data URL
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

      console.log(`✅ TTS generated successfully, base64 length: ${base64Audio.length}`);

      // Store in database
      try {
        const { error: dbError } = await supabase
          .from('surrogate_sessions')
          .upsert({
            session_id: sessionId,
            conversation_data: {
              tts_audio_url: audioUrl,
              tts_voice_id: voice_id,
              tts_text: text,
              tts_generated_at: new Date().toISOString(),
              tts_provider: 'elevenlabs'
            }
          });

        if (dbError) {
          console.error('❌ Database storage failed:', dbError);
        } else {
          console.log('✅ TTS session stored in database');
        }
      } catch (dbError) {
        console.warn('⚠️ Database storage failed:', dbError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          audioUrl: audioUrl,
          voiceId: voice_id,
          textLength: text.length
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );

    } catch (ttsError) {
      console.error('❌ TTS generation failed:', ttsError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `TTS generation failed: ${ttsError.message}` 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('❌ ElevenLabs TTS function error:', error);
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