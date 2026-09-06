import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface StorageInitRequest {
  user_id?: string;
  session_id?: string;
  tier: string;
  storage_limit: number;
}

interface StorageInitResponse {
  success: boolean;
  message?: string;
  tier?: string;
  storage_limit?: number;
  user_id?: string;
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

    const { user_id, session_id, tier, storage_limit }: StorageInitRequest = await req.json();

    console.log('🔧 Storage initialization request:', { user_id, session_id, tier, storage_limit });

    // For anonymous users, use session_id as user identifier
    const effectiveUserId = user_id || session_id;

    if (!effectiveUserId || !tier) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: user_id/session_id, tier' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Tier storage limits
    const TIER_LIMITS = {
      free: 0,
      consciousness_seeker: 500 * 1024 * 1024, // 500MB
      trans_humanist: 5 * 1024 * 1024 * 1024, // 5GB
      cultural_architect: Number.MAX_SAFE_INTEGER // Unlimited
    };

    const actualStorageLimit = TIER_LIMITS[tier as keyof typeof TIER_LIMITS] || 0;

    // Check if user_storage record exists
    const { data: existingStorage, error: storageCheckError } = await supabase
      .from('user_storage')
      .select('*')
      .eq(user_id ? 'user_id' : 'session_id', effectiveUserId)
      .single();

    if (storageCheckError && storageCheckError.code !== 'PGRST116') {
      console.error('❌ Storage check error:', storageCheckError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Storage check failed: ${storageCheckError.message}` 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (existingStorage) {
      // Update existing storage
      const { error: updateError } = await supabase
        .from('user_storage')
        .update({
          tier,
          storage_limit: actualStorageLimit,
          session_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingStorage.id);

      if (updateError) {
        console.error('❌ Storage update error:', updateError);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Storage update failed: ${updateError.message}` 
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('✅ Storage updated successfully');
    } else {
      // Create new storage record
      const { error: insertError } = await supabase
        .from('user_storage')
        .insert({
          user_id: user_id || null,
          session_id,
          tier,
          storage_limit: actualStorageLimit,
          storage_used: 0,
          files_count: 0
        });

      if (insertError) {
        console.error('❌ Storage creation error:', insertError);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Storage creation failed: ${insertError.message}` 
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('✅ Storage created successfully');
    }

    // Initialize subscription record
    const { data: existingSubscription } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq(user_id ? 'user_id' : 'session_id', effectiveUserId)
      .single();

    if (!existingSubscription) {
      await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user_id || null,
          tier,
          is_active: tier !== 'free'
        });

      console.log('✅ Subscription record created');
    }

    // Initialize culture coins
    const { data: existingCoins } = await supabase
      .from('culture_coins')
      .select('*')
      .eq(user_id ? 'user_id' : 'session_id', effectiveUserId)
      .single();

    if (!existingCoins) {
      await supabase
        .from('culture_coins')
        .insert({
          user_id: user_id || null,
          balance: tier === 'free' ? 0 : 100, // Bonus coins for paid tiers
          total_earned: tier === 'free' ? 0 : 100
        });

      console.log('✅ Culture coins initialized');
    }

    // Initialize oracle session
    const { error: sessionError } = await supabase
      .from('oracle_sessions')
      .upsert({
        user_id: user_id || null,
        session_id,
        conversation_history: [],
        current_persona: 'oracle_default',
        active_personas: ['oracle_default'],
        conversation_depth: 0,
        turn_count: 0
      }, {
        onConflict: 'session_id'
      });

    if (sessionError) {
      console.error('❌ Session initialization error:', sessionError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Session initialization failed: ${sessionError.message}` 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Oracle session initialized');

    const response: StorageInitResponse = {
      success: true,
      message: 'User storage initialized successfully',
      tier,
      storage_limit: actualStorageLimit,
      user_id: effectiveUserId
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Storage initialization error:', error);
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