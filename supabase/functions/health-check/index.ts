/*
  # Health Check Edge Function

  1. Purpose
    - Provides a simple health check endpoint for testing Supabase Edge Functions connectivity
    - Returns basic system information and timestamp
    - Used by debugging components to verify Edge Functions are working

  2. Security
    - Public endpoint (no authentication required)
    - Returns only non-sensitive system information
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://thesurrogate.me",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Supabase Edge Functions",
      version: "1.0.0",
      environment: Deno.env.get("ENVIRONMENT") || "production",
      region: Deno.env.get("SB_REGION") || "us-east-1",
      uptime: performance.now(),
      apiKeys: {
        googleAI: !!(Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('VITE_GOOGLE_AI_API_KEY')),
        openAI: !!Deno.env.get('OPENAI_API_KEY'),
        elevenLabs: !!Deno.env.get('VITE_ELEVEN_LABS_API_KEY'),
        didAPI: !!Deno.env.get('DID_API_KEY'),
        claude: !!Deno.env.get('ANTHROPIC_API_KEY')
      }
    };

    return new Response(
      JSON.stringify(healthData),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Health check error:", error);
    
    return new Response(
      JSON.stringify({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});