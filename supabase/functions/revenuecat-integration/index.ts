import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAllowedUser } from './authorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface RevenueCatRequest {
  action: 'get_subscription_status' | 'get_available_products' | 'initiate_purchase';
  userId: string;
  productId?: string;
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
    const { action, userId, productId }: RevenueCatRequest = await req.json();

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
      let walletAddress: string | null = null;
      if (ipAddress) {
        const { data: walletData } = await supabase
          .from('user_wallets')
          .select('wallet_address')
          .eq('ip_address', ipAddress)
          .single();
        walletAddress = walletData?.wallet_address ?? null;
      }
      
      if (!isAllowedUser(userId, ipAddress, walletAddress)) {
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

      case 'initiate_purchase': {
        // A client may request a purchase flow, but it must never be able to
        // write subscription state. RevenueCat's SDK/store and webhook own
        // that flow; the webhook is the only writer for this table.
        return new Response(
          JSON.stringify({
            success: true,
            purchaseInitiated: false,
            message: 'Complete the purchase through the RevenueCat client SDK. Entitlements are granted after provider verification.'
          }),
          {
            status: 202,
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