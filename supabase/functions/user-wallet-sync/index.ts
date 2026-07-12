import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

// user-wallet-sync — server-side proxy for user_wallets table access.
// All client reads/writes to user_wallets must go through this function so
// that RLS can be fully locked down on that table (service_role bypasses RLS).
//
// POST { action: 'get',    ip_address: string }
//   → { success: true, data: <row|null> }
//
// POST { action: 'upsert', ip_address: string, onboarding_status: string, wallet_address?: string }
//   → { success: true }
//
// The client already resolves the IP via ipify before calling here, so we
// accept it in the body rather than deriving from headers to avoid any
// discrepancy with the ipify value used for localStorage keys.

interface WalletSyncBody {
  action: 'get' | 'upsert';
  ip_address: string;
  onboarding_status?: string;
  wallet_address?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: WalletSyncBody = await req.json().catch(() => null);

    if (!body || !body.action || !body.ip_address) {
      return new Response(
        JSON.stringify({ success: false, error: 'action and ip_address are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, ip_address } = body;

    // ---- GET: look up a wallet row by ip_address ----
    if (action === 'get') {
      const { data, error } = await supabase
        .from('user_wallets')
        .select('ip_address, onboarding_status')
        .eq('ip_address', ip_address)
        .limit(1)
        .single();

      // PGRST116 = no rows found; treat as null (new visitor), not an error
      if (error && error.code !== 'PGRST116') {
        console.error('user-wallet-sync get failed:', error);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to read wallet: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: data ?? null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- UPSERT: create or update a wallet row ----
    if (action === 'upsert') {
      if (!body.onboarding_status) {
        return new Response(
          JSON.stringify({ success: false, error: 'onboarding_status is required for upsert' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const row: Record<string, unknown> = {
        ip_address,
        onboarding_status: body.onboarding_status,
        last_seen_at: new Date().toISOString(),
      };

      if (body.wallet_address !== undefined) {
        row.wallet_address = body.wallet_address;
      }

      const { error } = await supabase
        .from('user_wallets')
        .upsert(row, { onConflict: 'ip_address' });

      if (error) {
        console.error('user-wallet-sync upsert failed:', error);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to write wallet: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('user-wallet-sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Internal server error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
