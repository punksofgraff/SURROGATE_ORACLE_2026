import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey'
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
  googleAiError?: string;
  dalleError?: string;
  error?: string;
  costSavings?: string;
  apiUsed?: string;
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
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: sessionId, themes' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🎨 Portrait generation request: ${themes.join(', ')}`);

    let portraitUrl: string;
    let googleAiGenerated = false;
    let dalleGenerated = false;
    let googleAiError = '';
    let dalleError = '';

    // PRIMARY: Try Google AI Gemini (Cost-effective primary option)
    try {
      // Check for Google AI API key in multiple environment variable formats
      const googleAiApiKey = Deno.env.get('GOOGLE_AI_API_KEY') || 
                            Deno.env.get('VITE_GOOGLE_AI_API_KEY') ||
                            Deno.env.get('GOOGLE_GEMINI_API_KEY');
      
      if (!googleAiApiKey) {
        throw new Error('No Google AI API key found in environment variables');
      }

      console.log('🔑 Google AI API key found, length:', googleAiApiKey.length);
      
      const prompt = generateFreakDaliPrompt(themes, style, userPrompt);
      console.log('🎯 Gemini prompt:', prompt.substring(0, 100) + '...');

      // Use Gemini Pro Vision for image generation
      const googleAiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${googleAiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a detailed text description for an AI image generator: ${prompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 1024,
            topP: 0.95,
            topK: 64
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      });

      console.log('📡 Google AI response status:', googleAiResponse.status);

      if (!googleAiResponse.ok) {
        const errorText = await googleAiResponse.text();
        googleAiError = `Google AI API failed with status ${googleAiResponse.status}: ${errorText}`;
        console.error('❌ Google AI error:', googleAiError);
        throw new Error(googleAiError);
      }

      const googleAiResult = await googleAiResponse.json();
      
      if (googleAiResult.candidates && googleAiResult.candidates.length > 0) {
        const enhancedPrompt = googleAiResult.candidates[0].content.parts[0].text;
        console.log('✅ Google AI enhanced prompt:', enhancedPrompt.substring(0, 100) + '...');
        
        // Now try DALL-E with the enhanced prompt
        try {
          const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
          
          if (!openaiApiKey) {
            throw new Error('No OpenAI API key configured for DALL-E generation');
          }

          const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'dall-e-3',
              prompt: enhancedPrompt,
              n: 1,
              size: '1024x1024',
              quality: 'hd',
              style: 'vivid',
            }),
          });

          if (!dalleResponse.ok) {
            const errorText = await dalleResponse.text();
            throw new Error(`DALL-E API failed: ${dalleResponse.status} - ${errorText}`);
          }

          const dalleResult = await dalleResponse.json();
          portraitUrl = dalleResult.data[0]?.url;
          
          if (!portraitUrl) {
            throw new Error('No image URL in DALL-E response');
          }

          dalleGenerated = true;
          googleAiGenerated = true; // Google AI enhanced the prompt
          console.log('✅ Google AI + DALL-E portrait generated successfully');
          
        } catch (dalleError) {
          console.error('❌ DALL-E generation failed after Google AI enhancement:', dalleError);
          throw dalleError;
        }
      } else {
        googleAiError = 'No candidates in Google AI response';
        throw new Error(googleAiError);
      }

    } catch (googleError) {
      console.log('❌ Google AI failed, trying DALL-E directly:', googleError.message);
      
      // FALLBACK: Try DALL-E 3 directly
      try {
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        
        if (!openaiApiKey) {
          throw new Error('No OpenAI API key configured');
        }
        
        const prompt = generateFreakDaliPrompt(themes, style, userPrompt);
        console.log('🎨 DALL-E direct prompt:', prompt);

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
        console.log('✅ DALL-E portrait generated successfully as direct fallback');
        
      } catch (dalleErrorObj) {
        console.log('❌ DALL-E direct fallback also failed, using static fallback:', dalleErrorObj.message);
        dalleError = dalleErrorObj.message;
        
        // FINAL FALLBACK: Use themed static images
        const freakDaliImageMap: Record<string, string> = {
          'mystical': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024&h=1024&fit=crop',
          'cyberpunk': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1024&h=1024&fit=crop',
          'graffiti': 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1024&h=1024&fit=crop',
          'sneakar': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1024&h=1024&fit=crop',
          'culture-coin': 'https://images.unsplash.com/photo-1621932992265-e3df5ee52fb4?w=1024&h=1024&fit=crop',
          'hip-hop': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1024&h=1024&fit=crop',
          'digital': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1024&h=1024&fit=crop',
          'neon': 'https://images.unsplash.com/photo-1534330207526-8e81f10ec6fc?w=1024&h=1024&fit=crop',
          'consciousness': 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1024&h=1024&fit=crop',
          'oracle': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024&h=1024&fit=crop'
        };

        const primaryTheme = themes[0] || 'mystical';
        portraitUrl = freakDaliImageMap[primaryTheme] || `https://picsum.photos/1024/1024?random=${Date.now()}`;
        
        console.log('✅ Using themed static fallback for:', primaryTheme);
      }
    }

    // Store portrait in database with complete metadata
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
          generation_method: googleAiGenerated && dalleGenerated ? 'google-ai-enhanced-dalle' : 
                            dalleGenerated ? 'dall-e-3' : 'themed-fallback',
          timestamp: new Date().toISOString(),
          cost_savings: googleAiGenerated ? 'Google AI prompt enhancement used' : 'DALL-E direct',
          api_endpoint: googleAiGenerated && dalleGenerated ? 'gemini-pro + dall-e-3' : 
                       dalleGenerated ? 'dall-e-3' : 'static-fallback'
        }
      });

    if (dbError) {
      console.error('❌ Database storage error:', dbError);
    } else {
      console.log('✅ Portrait stored successfully with metadata');
    }

    const response: PortraitResponse = {
      success: googleAiGenerated || dalleGenerated || !!portraitUrl,
      portraitUrl,
      googleAiGenerated,
      dalleGenerated,
      googleAiError: googleAiGenerated ? undefined : googleAiError,
      dalleError: dalleGenerated ? undefined : dalleError,
      error: (googleAiGenerated || dalleGenerated || portraitUrl) ? undefined : 'All generation methods failed',
      costSavings: googleAiGenerated ? 'Google AI prompt enhancement + DALL-E generation' : 'DALL-E direct generation',
      apiUsed: googleAiGenerated && dalleGenerated ? 'Google AI + DALL-E 3' : 
               dalleGenerated ? 'DALL-E 3' : 'Static fallback'
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Portrait generation error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        googleAiGenerated: false,
        dalleGenerated: false,
        googleAiError: error.message,
        dalleError: 'Fallback to DALL-E also failed',
        error: 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Enhanced prompt generator optimized for Google AI + DALL-E workflow
function generateFreakDaliPrompt(themes: string[], style: string, userPrompt?: string): string {
  let basePrompt = '';
  
  // Use user prompt if provided, otherwise generate from themes
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
      neon: "glowing geometric patterns with alien abduction vibes",
      oracle: "mystical digital consciousness with prophetic vision"
    };

    const selectedDescriptions = themes
      .filter(theme => freakDaliThemeDescriptions[theme])
      .map(theme => freakDaliThemeDescriptions[theme])
      .join(', ');

    basePrompt = `FreakDali cyberpunk graffiti portrait featuring ${selectedDescriptions}`;
  }

  // FreakDali style modifiers optimized for AI generation
  const freakDaliStyleModifiers: Record<string, string> = {
    'freakdali-graff-punks': 'with cyberpunk graffiti aesthetic, SNEAKAR branded elements, Culture Coin golden accents, neon geometric face patterns, holographic effects',
    'mystical-digital': 'with ethereal lighting, SNEAKAR branding, Culture Coin aura, cosmic graffiti energy',
    'cyberpunk': 'in FreakDali cyberpunk style with SNEAKAR shoes, neon colors, Culture Coin elements, digital graffiti',
    'street-art': 'as underground graffiti masterpiece with SNEAKAR branding, Culture Coin spray paint, punk aesthetic'
  };

  const styleModifier = freakDaliStyleModifiers[style] || freakDaliStyleModifiers['freakdali-graff-punks'];
  
  // Optimized prompt structure for AI generation
  const finalPrompt = `${basePrompt}, ${styleModifier}. High quality digital art, portrait orientation, vivid colors, detailed rendering, professional artwork, masterpiece quality.`;
  
  return finalPrompt;
}