// Edge Function: stripe-recent-transactions
// Fetches recent transactions from Stripe including failed ones with failure reasons
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // Verify user authentication
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`User ${user.email} fetching Stripe transactions`);

    // Parse request body
    const { account_id, limit = 10 } = await req.json().catch(() => ({}));

    if (!account_id) {
      throw new Error('account_id is required');
    }

    // Get the account from database
    const { data: account, error: accountError } = await supabaseClient
      .from('payment_accounts')
      .select('account_id, account_name, secret_key_name')
      .eq('account_id', account_id)
      .eq('payment_provider', 'stripe')
      .eq('is_active', true)
      .single();

    if (accountError || !account) {
      throw new Error(`Stripe account ${account_id} not found`);
    }

    // Get the API key
    const stripeKey = getStripeKeyForAccount(account_id, account.secret_key_name);
    if (!stripeKey) {
      throw new Error('No API key found for this account');
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    // Fetch recent payment intents (includes all statuses)
    const paymentIntents = await stripe.paymentIntents.list({
      limit: limit,
      expand: ['data.latest_charge']
    });

    // Process transactions
    const transactions = paymentIntents.data.map(pi => {
      const charge = pi.latest_charge as Stripe.Charge | null;

      // Determine failure reason
      let failureCode = null;
      let failureMessage = null;

      if (pi.last_payment_error) {
        failureCode = pi.last_payment_error.code;
        failureMessage = pi.last_payment_error.message;
      } else if (charge?.failure_code) {
        failureCode = charge.failure_code;
        failureMessage = charge.failure_message;
      }

      // Get status display
      let status = pi.status;
      if (status === 'requires_payment_method' && pi.last_payment_error) {
        status = 'failed';
      }

      return {
        id: pi.id,
        amount: pi.amount / 100,
        currency: pi.currency.toUpperCase(),
        status: status,
        description: pi.description || charge?.description || null,
        customer_email: charge?.billing_details?.email || charge?.receipt_email || null,
        customer_name: charge?.billing_details?.name || null,
        payment_method_type: pi.payment_method_types?.[0] || null,
        failure_code: failureCode,
        failure_message: failureMessage,
        created_at: new Date(pi.created * 1000).toISOString(),
        metadata: pi.metadata
      };
    });

    return new Response(JSON.stringify({
      success: true,
      transactions,
      account_id,
      account_name: account.account_name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});

function getStripeKeyForAccount(accountId: string, secretKeyName?: string): string | null {
  if (secretKeyName) {
    const key = Deno.env.get(secretKeyName);
    if (key) return key;
  }

  if (accountId === 'default') {
    const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (legacyKey) return legacyKey;
  }

  for (let i = 1; i <= 20; i++) {
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    if (id === accountId && key) {
      return key;
    }
  }

  return null;
}
