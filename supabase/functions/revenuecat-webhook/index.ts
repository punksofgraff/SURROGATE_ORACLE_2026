import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Content-Type': 'application/json' };

const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);

const PRODUCT_TIERS: Record<string, string> = {
  seeker_monthly: 'seeker',
  trans_humanist_monthly: 'trans_humanist',
  cultural_architect_monthly: 'cultural_architect',
  'prod54d54dd866': 'seeker',
  'prod311f595c65': 'trans_humanist',
  'prod70269376ed': 'cultural_architect',
};

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  store?: string;
  environment?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  country_code?: string;
  currency?: string;
  price?: number;
  price_in_purchased_currency?: number;
  subscriber_attributes?: Record<string, unknown>;
};

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN');
  const actual = req.headers.get('authorization');
  return Boolean(expected && actual === `Bearer ${expected}`);
}

function dateFromMillis(value?: number | null): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    const payload = await req.json();
    const event: RevenueCatEvent = payload?.event ?? payload;
    const eventId = event.id;
    const userId = event.app_user_id;
    const productId = event.product_id;
    const eventType = event.type;

    if (!eventId || !userId || !eventType) {
      return json({ error: 'RevenueCat event is missing id, app_user_id, or type' }, 400);
    }

    // Product, status, expiration, and premium access are intentionally
    // calculated from the authenticated provider event, never request fields.
    const expirationAt = dateFromMillis(event.expiration_at_ms);
    const isActive = ACTIVE_EVENTS.has(eventType) &&
      (!expirationAt || new Date(expirationAt).getTime() > Date.now());
    const tier = isActive && productId ? (PRODUCT_TIERS[productId] ?? 'free') : 'free';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { error } = await supabase.from('revenuecat_subscriptions').upsert({
      user_id: userId,
      event_id: eventId,
      event_type: eventType,
      product_id: productId ?? null,
      store: event.store ?? null,
      environment: event.environment ?? null,
      status: isActive ? 'active' : 'inactive',
      premium_access: isActive && tier !== 'free',
      purchased_at: dateFromMillis(event.purchased_at_ms),
      expiration_at: expirationAt,
      country_code: event.country_code ?? null,
      currency: event.currency ?? null,
      price: event.price_in_purchased_currency ?? event.price ?? null,
      subscriber_attributes: event.subscriber_attributes ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id' });

    if (error) {
      console.error('Failed to persist RevenueCat event:', error);
      return json({ error: 'Failed to persist event' }, 500);
    }

    const { error: metricsError } = await supabase
      .from('user_consciousness_metrics')
      .upsert({ user_id: userId, subscription_tier: tier, updated_at: new Date().toISOString() });
    if (metricsError) console.warn('Failed to update metrics tier:', metricsError);

    return json({ received: true }, 200);
  } catch (error) {
    console.error('RevenueCat webhook error:', error);
    return json({ error: 'Invalid webhook payload' }, 400);
  }
});