// Edge Function: stripe-balance-checker
// Fetches current balance from Stripe accounts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client
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

    console.log(`User ${user.email} checking Stripe balances`);

    // Parse request body
    const { account_id } = await req.json().catch(() => ({}));

    // Get Stripe accounts from payment_accounts table
    let query = supabaseClient
      .from('payment_accounts')
      .select('account_id, account_name, secret_key_name')
      .eq('payment_provider', 'stripe')
      .eq('is_active', true);

    if (account_id) {
      query = query.eq('account_id', account_id);
    }

    const { data: accounts, error: accountsError } = await query;

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        balances: [],
        message: account_id ? `Stripe account ${account_id} not found` : 'No Stripe accounts configured'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Fetch balances for each account
    const balances = [];
    const errors = [];

    for (const account of accounts) {
      try {
        console.log(`Fetching balance for Stripe account: ${account.account_id}`);

        // Get the API key for this account
        const stripeKey = getStripeKeyForAccount(account.account_id, account.secret_key_name);

        if (!stripeKey) {
          throw new Error('No API key found for this account');
        }

        // Initialize Stripe
        const stripe = new Stripe(stripeKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });

        // Fetch balance
        const balance = await stripe.balance.retrieve();

        // Process available balances
        const availableByCurrency: Record<string, any> = {};
        for (const bal of balance.available || []) {
          availableByCurrency[bal.currency.toUpperCase()] = {
            amount: bal.amount / 100,
            source_types: bal.source_types
          };
        }

        // Process pending balances
        const pendingByCurrency: Record<string, any> = {};
        for (const bal of balance.pending || []) {
          pendingByCurrency[bal.currency.toUpperCase()] = {
            amount: bal.amount / 100,
            source_types: bal.source_types
          };
        }

        // Build currency breakdown
        const currencies = new Set([
          ...Object.keys(availableByCurrency),
          ...Object.keys(pendingByCurrency)
        ]);

        const balancesByCurrency = Array.from(currencies).map(currency => ({
          currency,
          available: availableByCurrency[currency]?.amount || 0,
          pending: pendingByCurrency[currency]?.amount || 0,
          total: (availableByCurrency[currency]?.amount || 0) + (pendingByCurrency[currency]?.amount || 0)
        }));

        // Find primary balance (USD preferred, then CAD, then first)
        const primaryBalance = balancesByCurrency.find(b => b.currency === 'USD')
          || balancesByCurrency.find(b => b.currency === 'CAD')
          || balancesByCurrency[0]
          || { currency: 'USD', available: 0, pending: 0, total: 0 };

        balances.push({
          account_id: account.account_id,
          account_name: account.account_name || account.account_id,
          payment_provider: 'stripe',
          primary_currency: primaryBalance.currency,
          available_balance: primaryBalance.available,
          pending_balance: primaryBalance.pending,
          total_balance: primaryBalance.total,
          balances_by_currency: balancesByCurrency,
          retrieved_at: new Date().toISOString()
        });

      } catch (error) {
        console.error(`Error fetching balance for ${account.account_id}:`, error);
        errors.push({
          account_id: account.account_id,
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      balances,
      errors: errors.length > 0 ? errors : undefined,
      total_accounts: accounts.length,
      successful: balances.length,
      failed: errors.length
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

/**
 * Get Stripe API key for account
 */
function getStripeKeyForAccount(accountId: string, secretKeyName?: string): string | null {
  // If secret_key_name is provided, use it directly
  if (secretKeyName) {
    const key = Deno.env.get(secretKeyName);
    if (key) return key;
  }

  // Check legacy
  if (accountId === 'default') {
    const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (legacyKey) return legacyKey;
  }

  // Check numbered accounts (1-20)
  for (let i = 1; i <= 20; i++) {
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    if (id === accountId && key) {
      return key;
    }
  }

  return null;
}
