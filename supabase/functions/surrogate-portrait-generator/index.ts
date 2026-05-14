import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface PortraitRequest {
  sessionId: string;
  email?: string;
  themes: string[];
  style?: string;
  userPrompt?: string;
}

interface PortraitResponse {
  success: boolean;
  portraitUrl?: string;
  googleAiGenerated?: boolean;
  dalleGenerated?: boolean;
  dalleError?: string;
  googleAiError?: string;
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

    const { sessionId, email, themes, style = 'freakdali-graff-punks', userPrompt }: PortraitRequest = await req.json();

    if (!sessionId || !themes || themes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: sessionId, themes' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let portraitUrl: string;
    let googleAiGenerated = false;
    let dalleGenerated = false;
    let googleAiError = '';
    let dalleError = '';

    // AI PROVIDER FALLBACK SYSTEM
    // Try Google AI Gemini first (now primary for image generation)
    try {
      const googleAiApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
      
      if (!googleAiApiKey) {
        throw new Error('No Google AI API key configured');
      }
      
      const prompt = generateFreakDaliPrompt(themes, style, userPrompt);
      console.log('🔍 Google AI Gemini prompt:', prompt);

      const googleAiResponse = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-vision:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': googleAiApiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt,
            }],
          }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2048,
            topP: 0.95,
            topK: 64,
          },
        }),
      });

      if (!googleAiResponse.ok) {
        const errorText = await googleAiResponse.text();
        googleAiError = `Google AI API failed with status ${googleAiResponse.status}: ${errorText}`;
        throw new Error(googleAiError);
      }

      const googleAiResult = await googleAiResponse.json();
      
      // Extract image URL from response
      if (googleAiResult.candidates && googleAiResult.candidates[0]?.content?.parts) {
        const parts = googleAiResult.candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
            // Convert base64 to URL
            const base64Image = part.inlineData.data;
            portraitUrl = `data:${part.inlineData.mimeType};base64,${base64Image}`;
            googleAiGenerated = true;
            console.log('✅ Google AI Gemini image generated successfully');
            break;
          }
        }
      }
      
      if (!portraitUrl) {
        googleAiError = 'No image data in Google AI response';
        throw new Error(googleAiError);
      }
      
    } catch (googleError) {
      console.log('Google AI generation failed, trying DALL-E fallback:', googleError.message);
      
      // FALLBACK: Try DALL-E 3
      try {
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        
        if (!openaiApiKey) {
          throw new Error('No OpenAI API key configured');
        }
        
        const prompt = generateFreakDaliPrompt(themes, style, userPrompt);
        console.log('🎨 DALL-E fallback prompt:', prompt);

        const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
            style: 'vivid',
          }),
        });

        if (!dalleResponse.ok) {
          const errorText = await dalleResponse.text();
          dalleError = `DALL-E API failed with status ${dalleResponse.status}: ${errorText}`;
          throw new Error(dalleError);
        }

        const dalleResult = await dalleResponse.json();
        portraitUrl = dalleResult.data[0]?.url;
        
        if (!portraitUrl) {
          dalleError = 'No image URL in DALL-E response';
          throw new Error(dalleError);
        }

        dalleGenerated = true;
        console.log('✅ DALL-E portrait generated successfully as fallback');
        
      } catch (dalleErrorObj) {
        console.log('DALL-E fallback also failed, using static image fallback:', dalleErrorObj.message);
        dalleError = dalleErrorObj.message;
        
        // FINAL FALLBACK: Use static fallback image based on themes
        const freakDaliImageMap: Record<string, string> = {
          'mystical': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1024&h=1024&fit=crop',
          'cyberpunk': 'https://images.unsplash.com/photo-1608501821300-4f99e58bba77?w=1024&h=1024&fit=crop',
          'graffiti': 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1024&h=1024&fit=crop',
          'sneakar': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1024&h=1024&fit=crop',
          'culture-coin': 'https://images.unsplash.com/photo-1621932992265-e3df5ee52fb4?w=1024&h=1024&fit=crop',
          'hip-hop': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1024&h=1024&fit=crop',
          'digital': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1024&h=1024&fit=crop',
          'neon': 'https://images.unsplash.com/photo-1534330207526-8e81f10ec6fc?w=1024&h=1024&fit=crop',
        };

        const primaryTheme = themes[0] || 'mystical';
        portraitUrl = freakDaliImageMap[primaryTheme] || `https://picsum.photos/1024/1024?random=${Date.now()}`;
      }
    }

    // Store portrait in database with enhanced metadata
    const { error: dbError } = await supabase
      .from('surrogate_portraits')
      .insert({
        session_id: sessionId,
        email: email || null,
        conversation_themes: themes,
        dalle_prompt: userPrompt || generateFreakDaliPrompt(themes, style, userPrompt),
        image_url: portraitUrl,
        dalle_generated: dalleGenerated,
        google_ai_generated: googleAiGenerated,
        procedural_framework: {
          style: 'freakdali-graff-punks',
          sneakar_branded: true,
          culture_coin_elements: true,
          cyberpunk_aesthetic: true,
          themes: themes,
          generation_method: googleAiGenerated ? 'google-gemini' : (dalleGenerated ? 'dall-e-3' : 'themed-fallback'),
          timestamp: new Date().toISOString(),
        }
      });

    if (dbError) {
      console.error('Database error:', dbError);
    }

    const response: PortraitResponse = {
      success: googleAiGenerated || dalleGenerated,
      portraitUrl,
      googleAiGenerated,
      dalleGenerated,
      googleAiError: googleAiGenerated ? undefined : googleAiError,
      dalleError: dalleGenerated ? undefined : dalleError,
      error: googleAiGenerated || dalleGenerated ? undefined : 'Image generation failed',
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Portrait generation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        googleAiGenerated: false,
        dalleGenerated: false,
        googleAiError: error.message,
        dalleError: 'Fallback to DALL-E also failed',
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Enhanced prompt generator for Google AI and DALL-E
function generateFreakDaliPrompt(themes: string[], style: string, userPrompt?: string): string {
  let basePrompt = '';
  
  // Use user prompt if provided, otherwise generate prompt from themes
  if (userPrompt) {
    basePrompt = userPrompt;
  } else {
    const freakDaliThemeDescriptions: Record<string, string> = {
      mystical: "ethereal cyberpunk oracle energy with SNEAKAR branding",
      cyberpunk: "neon-lit digital rebellion with Culture Coin elements",
      graffiti: "street art spray paint aesthetics with golden accents",
      sneakar: "branded streetwear prophet with holographic elements",
      'culture-coin': "golden cryptocurrency aura with mystical power",
      'hip-hop': "urban oracle wisdom with geometric face patterns",
      digital: "pixelated reality consciousness with neon effects",
      consciousness: "expanded awareness with cyberpunk enhancement",
      creativity: "artistic inspiration flowing through digital realms",
      technology: "AI-enhanced street prophet with circuit patterns",
      wisdom: "ancient knowledge channeled through modern graffiti",
      future: "evolutionary transcendence in underground trainyard",
      transformation: "metamorphosis with SNEAKAR branded elements",
      connection: "interconnected networks of Culture Coin energy",
      punk: "rebellious aesthetic with holographic bomber jacket",
      neon: "glowing geometric patterns with alien abduction vibes"
    };

    const selectedDescriptions = themes
      .filter(theme => freakDaliThemeDescriptions[theme])
      .map(theme => freakDaliThemeDescriptions[theme])
      .join(', ');

    basePrompt = `FreakDali cyberpunk graffiti oracle portrait representing ${selectedDescriptions}`;
  }

  // FreakDali style modifiers
  const freakDaliStyleModifiers = {
    'freakdali-graff-punks': 'with cyberpunk graffiti aesthetic, SNEAKAR branded elements, Culture Coin golden accents, neon geometric face patterns, holographic effects',
    'mystical-digital': 'with ethereal lighting, SNEAKAR branding, Culture Coin aura, cosmic graffiti energy',
    'cyberpunk': 'in FreakDali cyberpunk style with SNEAKAR shoes, neon colors, Culture Coin elements, digital graffiti',
    'street-art': 'as underground graffiti masterpiece with SNEAKAR branding, Culture Coin spray paint, punk aesthetic',
  };

  const styleModifier = freakDaliStyleModifiers[style as keyof typeof freakDaliStyleModifiers] || freakDaliStyleModifiers['freakdali-graff-punks'];
  
  // Keep under 200 characters for optimal image generation
  const finalPrompt = `${basePrompt}, ${styleModifier}. High quality digital art, portrait orientation, masterpiece.`;
  
  // Truncate if too long
  return finalPrompt.length > 200 ? finalPrompt.substring(0, 197) + '...' : finalPrompt;
}