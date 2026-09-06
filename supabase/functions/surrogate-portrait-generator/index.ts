/**
 * surrogate-portrait-generator — Supabase Edge Function
 *
 * Legacy alias: delegates 100% to gemini-portrait-generator.
 * Keep this function deployed so any old calls still work.
 *
 * Pipeline (handled in gemini-portrait-generator):
 *   1. Gemini 2.5 Flash  → enriches the theme prompt
 *   2. DALL-E 3          → generates the image
 *   3. Themed static URL → fallback
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://thesurrogate.me',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse body once and forward to gemini-portrait-generator
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Call gemini-portrait-generator via internal Supabase functions invoke
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase.functions.invoke('gemini-portrait-generator', {
    body: body as Record<string, unknown>,
  });

  if (error) {
    console.error('[surrogate-portrait-generator] delegate error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
