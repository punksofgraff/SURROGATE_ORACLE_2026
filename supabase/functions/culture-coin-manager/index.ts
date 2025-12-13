import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface CultureCoinRequest {
  action: 'process_interaction' | 'get_user_metrics' | 'update_subscription' | 'get_leaderboard';
  userId: string;
  sessionId?: string;
  question?: string;
  response?: string;
  themes?: string[];
  subscriptionTier?: string;
  inputSource?: 'STT' | 'keyboard';
}

interface CultureCoinResponse {
  success: boolean;
  data?: any;
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

    const { action, userId, sessionId, question, response, themes, subscriptionTier, inputSource }: CultureCoinRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'User ID is required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🎯 Culture Coin Manager: ${action} for user ${userId}`);

    switch (action) {
      case 'process_interaction': {
        if (!sessionId || !question || !response) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Session ID, question, and response are required for interaction processing' 
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('🔮 Processing Oracle interaction...');
        console.log(`Question: ${question.substring(0, 100)}...`);
        console.log(`Response: ${response.substring(0, 100)}...`);
        
        // Check freemium limits before processing
        const { data: userMetrics } = await supabase
          .from('user_consciousness_metrics')
          .select('subscription_tier')
          .eq('user_id', userId)
          .single();
          
        if (userMetrics?.subscription_tier === 'free') {
          // Count interactions this month
          const currentMonth = new Date().getMonth();
          const currentYear = new Date().getFullYear();
          const monthStart = new Date(currentYear, currentMonth, 1);
          const nextMonth = new Date(currentYear, currentMonth + 1, 1);
          
          const { data: monthlyInteractions } = await supabase
            .from('oracle_interactions')
            .select('id')
            .eq('user_id', userId)
            .gte('created_at', monthStart.toISOString())
            .lt('created_at', nextMonth.toISOString());
            
          if (monthlyInteractions && monthlyInteractions.length >= 2) {
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'Monthly free limit exceeded. Upgrade to continue using Oracle experiences.',
                limitExceeded: true,
                monthlyLimit: 2,
                currentUsage: monthlyInteractions.length
              }),
              {
                status: 429, // Too Many Requests
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
        }

        // Call the stored procedure to process the interaction
        const { data: interactionResult, error: interactionError } = await supabase
          .rpc('process_oracle_interaction', {
            p_user_id: userId,
            p_session_id: sessionId,
            p_question: question,
            p_response: response,
            p_themes: themes || [],
            p_input_source: inputSource || 'keyboard'
          });

        if (interactionError) {
          console.error('❌ Oracle interaction processing failed:', interactionError);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to process interaction: ${interactionError.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('✅ Oracle interaction processed successfully:', interactionResult);

        return new Response(
          JSON.stringify({ 
            success: true,
            data: interactionResult,
            coinsEarned: interactionResult.coins_earned,
            classification: interactionResult.classification,
            levelUp: interactionResult.level_up,
            newLevel: interactionResult.new_level,
            consciousnessTitle: interactionResult.consciousness_title
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'get_user_metrics': {
        console.log('📊 Fetching user consciousness metrics...');

        // Get user metrics with ONLY the columns that exist in the database
        const { data: userMetrics, error: metricsError } = await supabase
          .from('user_consciousness_metrics')
          .select('id, user_id, current_level, total_culture_coins, total_sacred_questions, total_profane_questions, sacred_profane_ratio, subscription_tier, first_interaction_date, last_interaction_date, consciousness_evolution_score, authentic_connection_count, updated_at')
          .eq('user_id', userId)
          .single();

        if (metricsError && metricsError.code !== 'PGRST116') {
          console.error('❌ Failed to fetch user metrics:', metricsError);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to fetch user metrics: ${metricsError.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Create default metrics if user doesn't exist
        if (!userMetrics) {
          console.log('🆕 Creating new user metrics...');
          
          // Only insert columns that exist in the database
          const { data: newMetrics, error: createError } = await supabase
            .from('user_consciousness_metrics')
            .insert({
              user_id: userId,
              current_level: 1,
              total_culture_coins: 0,
              total_sacred_questions: 0,
              total_profane_questions: 0,
              sacred_profane_ratio: 0,
              subscription_tier: 'free',
              first_interaction_date: new Date().toISOString(),
              last_interaction_date: new Date().toISOString(),
              consciousness_evolution_score: 0,
              authentic_connection_count: 0
              // updated_at is handled automatically by the DEFAULT NOW()
            })
            .select()
            .single();

          if (createError) {
            // Handle duplicate key error (race condition)
            if (createError.code === '23505' && createError.message.includes('user_consciousness_metrics_user_id_key')) {
              console.log('🔄 User metrics already exist (race condition), fetching existing data...');
              
              // Another concurrent request created the user, fetch the existing data
              const { data: existingMetrics, error: fetchError } = await supabase
                .from('user_consciousness_metrics')
                .select('id, user_id, current_level, total_culture_coins, total_sacred_questions, total_profane_questions, sacred_profane_ratio, subscription_tier, first_interaction_date, last_interaction_date, consciousness_evolution_score, authentic_connection_count, updated_at')
                .eq('user_id', userId)
                .single();

              if (fetchError) {
                console.error('❌ Failed to fetch existing user metrics after race condition:', fetchError);
                return new Response(
                  JSON.stringify({ 
                    success: false,
                    error: `Failed to fetch existing user metrics: ${fetchError.message}` 
                  }),
                  {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  }
                );
              }

              // Use the existing metrics data
              const levelTitle = getLevelTitle(existingMetrics.current_level);
              const multiplier = getMultiplierForTier(existingMetrics.subscription_tier);
              const levelCap = getLevelCapForTier(existingMetrics.subscription_tier);
              const interactionsCount = (existingMetrics.total_sacred_questions || 0) + (existingMetrics.total_profane_questions || 0);

              return new Response(
                JSON.stringify({ 
                  success: true,
                  metrics: {
                    currentLevel: existingMetrics.current_level,
                    totalCultureCoins: existingMetrics.total_culture_coins,
                    availableCoins: existingMetrics.total_culture_coins,
                    consciousnessTitle: levelTitle,
                    subscriptionTier: existingMetrics.subscription_tier,
                    multiplier: multiplier,
                    levelCap: levelCap,
                    interactionsCount: interactionsCount,
                    sacredInteractions: existingMetrics.total_sacred_questions || 0,
                    profaneInteractions: existingMetrics.total_profane_questions || 0
                  }
                }),
                {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
              );
            } else {
              // Handle other creation errors
              console.error('❌ Failed to create user metrics:', createError);
              return new Response(
                JSON.stringify({ 
                  success: false,
                  error: `Failed to create user metrics: ${createError.message}` 
                }),
                {
                  status: 500,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
              );
            }
          }

          // Map database columns to the response format
          const levelTitle = getLevelTitle(1);
          const multiplier = getMultiplierForTier('free');
          const levelCap = getLevelCapForTier('free');
          
          return new Response(
            JSON.stringify({ 
              success: true,
              metrics: {
                currentLevel: 1,
                totalCultureCoins: 0,
                availableCoins: 0, // Using total_culture_coins for available coins
                consciousnessTitle: levelTitle,
                subscriptionTier: 'free',
                multiplier: multiplier,
                levelCap: levelCap,
                interactionsCount: 0,
                sacredInteractions: 0,
                profaneInteractions: 0,
                monthlyFreeInteractions: 0,
                monthlyFreeLimit: 2,
                nextResetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
              }
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('✅ User metrics retrieved successfully');
        
        // Map database columns to the response format
        const levelTitle = getLevelTitle(userMetrics.current_level);
        const multiplier = getMultiplierForTier(userMetrics.subscription_tier);
        const levelCap = getLevelCapForTier(userMetrics.subscription_tier);
        const interactionsCount = (userMetrics.total_sacred_questions || 0) + (userMetrics.total_profane_questions || 0);
        
        // Calculate monthly free interactions for freemium users
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthStart = new Date(currentYear, currentMonth, 1);
        const nextMonth = new Date(currentYear, currentMonth + 1, 1);
        
        let monthlyFreeInteractions = 0;
        let monthlyFreeLimit = 2;
        
        if (userMetrics.subscription_tier === 'free') {
          // Count interactions this month from oracle_interactions table
          const { data: monthlyInteractions, error: monthlyError } = await supabase
            .from('oracle_interactions')
            .select('id')
            .eq('user_id', userId)
            .gte('created_at', monthStart.toISOString())
            .lt('created_at', nextMonth.toISOString());

          if (!monthlyError && monthlyInteractions) {
            monthlyFreeInteractions = monthlyInteractions.length;
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            metrics: {
              currentLevel: userMetrics.current_level,
              totalCultureCoins: userMetrics.total_culture_coins,
              availableCoins: userMetrics.total_culture_coins, // Using total_culture_coins for available coins
              consciousnessTitle: levelTitle,
              subscriptionTier: userMetrics.subscription_tier,
              multiplier: multiplier,
              levelCap: levelCap,
              interactionsCount: interactionsCount,
              sacredInteractions: userMetrics.total_sacred_questions || 0,
              profaneInteractions: userMetrics.total_profane_questions || 0,
              monthlyFreeInteractions: monthlyFreeInteractions,
              monthlyFreeLimit: monthlyFreeLimit,
              nextResetDate: nextMonth.toISOString()
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'update_subscription': {
        if (!subscriptionTier) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Subscription tier is required' 
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log(`🔄 Updating subscription to: ${subscriptionTier}`);

        // Update user subscription using only existing columns
        const { error: updateError } = await supabase
          .from('user_consciousness_metrics')
          .update({
            subscription_tier: subscriptionTier,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('❌ Failed to update subscription:', updateError);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to update subscription: ${updateError.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('✅ Subscription updated successfully');
        
        const multiplier = getMultiplierForTier(subscriptionTier);
        const levelCap = getLevelCapForTier(subscriptionTier);

        return new Response(
          JSON.stringify({ 
            success: true,
            data: {
              tier: subscriptionTier,
              multiplier: multiplier,
              levelCap: levelCap
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'get_leaderboard': {
        console.log('🏆 Fetching consciousness leaderboard...');

        const { data: leaderboard, error: leaderboardError } = await supabase
          .from('user_consciousness_metrics')
          .select('user_id, current_level, total_culture_coins, subscription_tier')
          .order('current_level', { ascending: false })
          .order('total_culture_coins', { ascending: false })
          .limit(100);

        if (leaderboardError) {
          console.error('❌ Failed to fetch leaderboard:', leaderboardError);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to fetch leaderboard: ${leaderboardError.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('✅ Leaderboard retrieved successfully');

        return new Response(
          JSON.stringify({ 
            success: true,
            data: leaderboard
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Invalid action' 
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }

  } catch (error) {
    console.error('❌ Culture Coin Manager error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Internal server error: ${error.message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to get level title
function getLevelTitle(level: number): string {
  const levelTitles: Record<number, string> = {
    1: 'Seeker',
    2: 'Novice',
    3: 'Initiate',
    4: 'Explorer',
    5: 'Wayfinder',
    6: 'Connector',
    7: 'Networker',
    8: 'Builder',
    9: 'Creator',
    10: 'Visionary',
    11: 'Innovator',
    12: 'Amplifier',
    13: 'Architect',
    14: 'Catalyst',
    15: 'Transformer',
    16: 'Illuminator',
    17: 'Sage',
    18: 'Voyager',
    19: 'Oracle',
    20: 'Guardian',
    21: 'Luminary',
    22: 'Enlightener',
    23: 'Transcender',
    24: 'Ascendant',
    25: 'Source'
  };

  return levelTitles[level] || 'Unknown';
}

// Helper function to get multiplier for tier
function getMultiplierForTier(tier: string): number {
  switch (tier) {
    case 'seeker': return 2.0;
    case 'trans_humanist': return 3.0;
    case 'cultural_architect': return 5.0;
    default: return 1.0;
  }
}

// Helper function to get level cap for tier
function getLevelCapForTier(tier: string): number {
  switch (tier) {
    case 'seeker': return 15;
    case 'trans_humanist': return 20;
    case 'cultural_architect': return 25;
    default: return 5;
  }
}