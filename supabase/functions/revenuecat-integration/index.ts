import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface RevenueCatRequest {
  action: 'get_subscription_status' | 'get_available_products' | 'update_subscription';
  userId: string;
  productId?: string;
  subscriptionData?: any;
}

interface RevenueCatResponse {
  success: boolean;
  subscriptionStatus?: any;
  availableProducts?: any[];
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

    const ipAddress = req.headers.get('cf-connecting-ip');
    const { action, userId, productId, subscriptionData }: RevenueCatRequest = await req.json();

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

    // Authorization: ensure caller owns the requested userId
    if (action !== 'get_available_products') {
      const allowedKeys = [ipAddress].filter(Boolean);
      if (ipAddress) {
        const { data: walletData } = await supabase
          .from('user_wallets')
          .select('wallet_address')
          .eq('ip_address', ipAddress)
          .single();
        if (walletData?.wallet_address) {
          allowedKeys.push(walletData.wallet_address);
        }
      }
      
      if (!allowedKeys.includes(userId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized to act on this user ID' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`📱 RevenueCat Integration: ${action} for user ${userId}`);

    switch (action) {
      case 'get_subscription_status': {
        console.log('📊 Fetching user subscription status from RevenueCat...');

        // Get the most recent active subscription for the user
        const { data: subscription, error: subError } = await supabase
          .from('revenuecat_subscriptions')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (subError && subError.code !== 'PGRST116') {
          console.error('❌ Failed to fetch subscription:', subError);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to fetch subscription: ${subError.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        let subscriptionStatus = {
          isActive: false,
          tier: 'free',
          productId: null,
          expirationDate: null,
          premiumAccess: false,
          store: null,
          price: null,
          currency: null
        };

        if (subscription) {
          // Map product IDs to tier names
          const tierMapping: Record<string, string> = {
            'seeker_monthly': 'seeker',
            'trans_humanist_monthly': 'trans_humanist', 
            'cultural_architect_monthly': 'cultural_architect'
          };

          subscriptionStatus = {
            isActive: true,
            tier: tierMapping[subscription.product_id] || 'free',
            productId: subscription.product_id,
            expirationDate: subscription.expiration_at,
            premiumAccess: subscription.premium_access || false,
            store: subscription.store,
            price: subscription.price,
            currency: subscription.currency
          };
        }

        console.log('✅ Subscription status retrieved:', subscriptionStatus);

        return new Response(
          JSON.stringify({ 
            success: true,
            subscriptionStatus
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'get_available_products': {
        console.log('📦 Fetching available subscription products...');

        // Return the standard SNEAKAR subscription tiers
        const availableProducts = [
          {
            id: 'seeker_monthly',
            title: 'SEEKER',
            description: 'Unlimited Oracle + 2x Coins',
            price: 2.99,
            currency: 'USD',
            period: 'monthly',
            features: [
              'Unlimited Oracle conversations',
              '2x Culture Coin multiplier',
              'Basic consciousness tracking',
              'Email support'
            ]
          },
          {
            id: 'trans_humanist_monthly',
            title: 'TRANS-HUMANIST',
            description: 'Premium AI + 3x Coins',
            price: 5.99,
            currency: 'USD',
            period: 'monthly',
            popular: true,
            features: [
              'Premium AI models access',
              '3x Culture Coin multiplier',
              'Advanced consciousness metrics',
              'Priority Oracle responses',
              'Exclusive FreakDali portraits'
            ]
          },
          {
            id: 'cultural_architect_monthly',
            title: 'CULTURAL ARCHITECT',
            description: 'Full evolution + 5x Coins',
            price: 9.99,
            currency: 'USD',
            period: 'monthly',
            features: [
              'All premium features',
              '5x Culture Coin multiplier',
              'Full consciousness evolution',
              'Custom portrait generation',
              'Direct oracle communication',
              'Early access to new features'
            ]
          }
        ];

        return new Response(
          JSON.stringify({ 
            success: true,
            availableProducts
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      case 'update_subscription': {
        if (!productId || !subscriptionData) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Product ID and subscription data are required' 
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log(`🔄 Updating subscription to: ${productId}`);

        // Insert or update RevenueCat subscription record
        const { error: upsertError } = await supabase
          .from('revenuecat_subscriptions')
          .upsert({
            user_id: userId,
            event_id: subscriptionData.eventId || crypto.randomUUID(),
            event_type: 'initial_purchase',
            product_id: productId,
            store: subscriptionData.store || 'app_store',
            environment: subscriptionData.environment || 'production',
            status: 'active',
            premium_access: true,
            purchased_at: new Date().toISOString(),
            expiration_at: subscriptionData.expirationAt,
            country_code: subscriptionData.countryCode || 'US',
            currency: subscriptionData.currency || 'USD',
            price: subscriptionData.price,
            subscriber_attributes: subscriptionData.attributes || {},
            updated_at: new Date().toISOString()
          });

        if (upsertError) {
          console.error('❌ Failed to update subscription:', upsertError);
          return new Response(
            JSON.stringify({ 
              success: false,
              error: `Failed to update subscription: ${upsertError.message}` 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Update user consciousness metrics with new tier
        const tierMapping: Record<string, string> = {
          'prod54d54dd866': 'seeker',
          'prod311f595c65': 'trans_humanist',
          'prod70269376ed': 'cultural_architect'
        };

        const newTier = tierMapping[productId] || 'free';

        const { error: metricsError } = await supabase
          .from('user_consciousness_metrics')
          .upsert({
            user_id: userId,
            subscription_tier: newTier,
            updated_at: new Date().toISOString()
          });

        if (metricsError) {
          console.warn('⚠️ Failed to update user metrics tier:', metricsError);
        }

        console.log('✅ Subscription updated successfully');

        return new Response(
          JSON.stringify({ 
            success: true,
            tier: newTier,
            productId: productId
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
    console.error('❌ RevenueCat Integration error:', error);
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