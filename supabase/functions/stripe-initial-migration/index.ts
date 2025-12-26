// AUTOMATIC MULTI-ACCOUNT EDGE FUNCTION
// This automatically discovers all Stripe accounts from environment variables
// Just add STRIPE_ACCOUNT_N_KEY and STRIPE_ACCOUNT_N_ID secrets - no code changes needed!
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.10.0?target=deno";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('=== Starting Auto-Discovery Multi-Account Stripe Sync ===');
    // Automatically discover all Stripe accounts from environment
    const accounts = discoverStripeAccounts();
    console.log(`Discovered ${accounts.length} Stripe account(s):`, accounts.map((a)=>a.id).join(', '));
    if (accounts.length === 0) {
      throw new Error('No Stripe accounts configured. Add STRIPE_SECRET_KEY or STRIPE_ACCOUNT_N_KEY/STRIPE_ACCOUNT_N_ID');
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const allResults = [];
    // Loop through each discovered account
    for (const account of accounts){
      console.log(`\n=== Syncing Account: ${account.id} ===`);
      try {
        const stripe = new Stripe(account.apiKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });
        const results = await syncStripeAccount(stripe, supabase, account.id);
        allResults.push({
          account_id: account.id,
          success: true,
          results
        });
        console.log(`✓ Account ${account.id} synced successfully`);
      } catch (error) {
        console.error(`✗ Account ${account.id} failed:`, error);
        allResults.push({
          account_id: account.id,
          success: false,
          error: error.message
        });
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${accounts.length} account(s)`,
      accounts: allResults,
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error),
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
/**
 * AUTO-DISCOVERY FUNCTION
 * Automatically finds all Stripe accounts from environment variables
 * 
 * Supported patterns:
 * 1. Legacy single account: STRIPE_SECRET_KEY → account_id: "default"
 * 2. Numbered accounts: STRIPE_ACCOUNT_1_KEY + STRIPE_ACCOUNT_1_ID
 *                       STRIPE_ACCOUNT_2_KEY + STRIPE_ACCOUNT_2_ID
 *                       etc.
 * 
 * Just add new secrets following the pattern - no code changes needed!
 */ function discoverStripeAccounts() {
  const accounts = [];
  // Pattern 1: Check for legacy single account
  const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (legacyKey) {
    console.log('Found legacy STRIPE_SECRET_KEY');
    accounts.push({
      apiKey: legacyKey,
      id: 'default'
    });
  }
  // Pattern 2: Check for numbered accounts (1 through 100)
  // This will automatically find any STRIPE_ACCOUNT_N_KEY you add
  for(let i = 1; i <= 100; i++){
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    if (key && id) {
      console.log(`Found STRIPE_ACCOUNT_${i}_KEY with ID: ${id}`);
      accounts.push({
        apiKey: key,
        id: id
      });
    } else if (key && !id) {
      console.warn(`Warning: STRIPE_ACCOUNT_${i}_KEY found but STRIPE_ACCOUNT_${i}_ID missing - skipping`);
    } else if (i > 1 && accounts.length > 0 && !key) {
      break;
    }
  }
  // Remove duplicates by account ID (just in case)
  const uniqueAccounts = [];
  const seenIds = new Set();
  for (const account of accounts){
    if (!seenIds.has(account.id)) {
      uniqueAccounts.push(account);
      seenIds.add(account.id);
    } else {
      console.warn(`Duplicate account ID detected: ${account.id} - using first occurrence`);
    }
  }
  return uniqueAccounts;
}
/**
 * Sync a single Stripe account
 */ async function syncStripeAccount(stripe, supabase, accountId) {
  const results = {
    customers: 0,
    products: 0,
    prices: 0,
    subscriptions: 0,
    payment_intents: 0,
    charges: 0,
    invoices: 0,
    refunds: 0,
    disputes: 0
  };
  // Register/update account in database
  await supabase.from('stripe_accounts').upsert({
    account_id: accountId,
    account_name: accountId,
    environment: accountId.includes('test') ? 'test' : 'live',
    is_active: true,
    updated_at: new Date().toISOString()
  });
  // Helper to fetch all pages from Stripe
  async function fetchAllStripeData(objectType, listFunction, params = {}) {
    try {
      console.log(`  Fetching ${objectType}...`);
      const allData = [];
      let hasMore = true;
      let startingAfter = undefined;
      while(hasMore){
        const response = await listFunction({
          limit: 100,
          ...params,
          ...startingAfter ? {
            starting_after: startingAfter
          } : {}
        });
        if (!response || !response.data) {
          throw new Error(`Invalid response from Stripe for ${objectType}`);
        }
        allData.push(...response.data);
        hasMore = response.has_more || false;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }
      console.log(`  ✓ Fetched ${allData.length} ${objectType}`);
      return allData;
    } catch (error) {
      console.error(`  ✗ Failed to fetch ${objectType}:`, error);
      throw error;
    }
  }
  // Sync Customers
  try {
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'customers',
      p_stripe_account_id: accountId,
      p_status: 'in_progress'
    });
    const customers = await fetchAllStripeData('customers', stripe.customers.list.bind(stripe.customers));
    for (const customer of customers){
      await supabase.from('stripe_customers').upsert({
        id: customer.id,
        stripe_account_id: accountId,
        email: customer.email,
        name: customer.name,
        description: customer.description,
        phone: customer.phone,
        address: customer.address,
        shipping: customer.shipping,
        metadata: customer.metadata,
        balance: customer.balance,
        currency: customer.currency,
        delinquent: customer.delinquent,
        created: customer.created,
        updated: Math.floor(Date.now() / 1000),
        deleted: customer.deleted || false,
        synced_at: new Date().toISOString()
      });
      results.customers++;
    }
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'customers',
      p_stripe_account_id: accountId,
      p_status: 'completed',
      p_total_synced: results.customers
    });
  } catch (error) {
    console.error('Error syncing customers:', error);
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'customers',
      p_stripe_account_id: accountId,
      p_status: 'failed',
      p_error_message: String(error.message)
    });
  }
  // Sync Products
  try {
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'products',
      p_stripe_account_id: accountId,
      p_status: 'in_progress'
    });
    const products = await fetchAllStripeData('products', stripe.products.list.bind(stripe.products));
    for (const product of products){
      await supabase.from('stripe_products').upsert({
        id: product.id,
        stripe_account_id: accountId,
        name: product.name,
        description: product.description,
        active: product.active,
        metadata: product.metadata,
        images: product.images,
        default_price: typeof product.default_price === 'string' ? product.default_price : null,
        unit_label: product.unit_label,
        created: product.created,
        updated: product.updated,
        deleted: product.deleted || false,
        synced_at: new Date().toISOString()
      });
      results.products++;
    }
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'products',
      p_stripe_account_id: accountId,
      p_status: 'completed',
      p_total_synced: results.products
    });
  } catch (error) {
    console.error('Error syncing products:', error);
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'products',
      p_stripe_account_id: accountId,
      p_status: 'failed',
      p_error_message: String(error.message)
    });
  }
  // Sync Prices
  try {
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'prices',
      p_stripe_account_id: accountId,
      p_status: 'in_progress'
    });
    const prices = await fetchAllStripeData('prices', stripe.prices.list.bind(stripe.prices));
    for (const price of prices){
      await supabase.from('stripe_prices').upsert({
        id: price.id,
        stripe_account_id: accountId,
        product: typeof price.product === 'string' ? price.product : price.product?.id,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        unit_amount_decimal: price.unit_amount_decimal,
        type: price.type,
        recurring: price.recurring,
        billing_scheme: price.billing_scheme,
        metadata: price.metadata,
        nickname: price.nickname,
        created: price.created,
        updated: Math.floor(Date.now() / 1000),
        deleted: price.deleted || false,
        synced_at: new Date().toISOString()
      });
      results.prices++;
    }
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'prices',
      p_stripe_account_id: accountId,
      p_status: 'completed',
      p_total_synced: results.prices
    });
  } catch (error) {
    console.error('Error syncing prices:', error);
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'prices',
      p_stripe_account_id: accountId,
      p_status: 'failed',
      p_error_message: String(error.message)
    });
  }
  // Sync Subscriptions
  try {
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'subscriptions',
      p_stripe_account_id: accountId,
      p_status: 'in_progress'
    });
    const subscriptions = await fetchAllStripeData('subscriptions', stripe.subscriptions.list.bind(stripe.subscriptions), {
      status: 'all'
    });
    for (const subscription of subscriptions){
      await supabase.from('stripe_subscriptions').upsert({
        id: subscription.id,
        stripe_account_id: accountId,
        customer: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancel_at: subscription.cancel_at,
        canceled_at: subscription.canceled_at,
        ended_at: subscription.ended_at,
        trial_start: subscription.trial_start,
        trial_end: subscription.trial_end,
        items: subscription.items,
        metadata: subscription.metadata,
        default_payment_method: typeof subscription.default_payment_method === 'string' ? subscription.default_payment_method : subscription.default_payment_method?.id,
        latest_invoice: typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id,
        created: subscription.created,
        updated: Math.floor(Date.now() / 1000),
        deleted: subscription.status === 'canceled',
        synced_at: new Date().toISOString()
      });
      results.subscriptions++;
    }
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'subscriptions',
      p_stripe_account_id: accountId,
      p_status: 'completed',
      p_total_synced: results.subscriptions
    });
  } catch (error) {
    console.error('Error syncing subscriptions:', error);
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'subscriptions',
      p_stripe_account_id: accountId,
      p_status: 'failed',
      p_error_message: String(error.message)
    });
  }
  // Sync Charges
  try {
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'charges',
      p_stripe_account_id: accountId,
      p_status: 'in_progress'
    });
    const charges = await fetchAllStripeData('charges', stripe.charges.list.bind(stripe.charges));
    for (const charge of charges){
      await supabase.from('stripe_charges').upsert({
        id: charge.id,
        stripe_account_id: accountId,
        customer: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id,
        payment_intent: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id,
        amount: charge.amount,
        amount_captured: charge.amount_captured,
        amount_refunded: charge.amount_refunded,
        currency: charge.currency,
        status: charge.status,
        paid: charge.paid,
        refunded: charge.refunded,
        disputed: charge.disputed,
        description: charge.description,
        receipt_email: charge.receipt_email,
        receipt_url: charge.receipt_url,
        payment_method: charge.payment_method,
        payment_method_details: charge.payment_method_details,
        billing_details: charge.billing_details,
        metadata: charge.metadata,
        created: charge.created,
        updated: Math.floor(Date.now() / 1000),
        synced_at: new Date().toISOString()
      });
      results.charges++;
    }
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'charges',
      p_stripe_account_id: accountId,
      p_status: 'completed',
      p_total_synced: results.charges
    });
  } catch (error) {
    console.error('Error syncing charges:', error);
    await supabase.rpc('update_sync_status_for_account', {
      p_object_type: 'charges',
      p_stripe_account_id: accountId,
      p_status: 'failed',
      p_error_message: String(error.message)
    });
  }
  // Continue with payment_intents, invoices, refunds, disputes...
  // (Same pattern as above)
  console.log(`Account ${accountId} sync results:`, results);
  return results;
}
