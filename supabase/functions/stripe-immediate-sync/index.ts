// Edge Function: stripe-immediate-sync (FIXED VERSION)
// Syncs all Stripe accounts WITHOUT delays - for manual testing
// Use stripe-scheduled-sync for automated cron jobs
//
// FIXES:
// - Now properly checks active_until field to prevent syncing expired accounts
// - Improved logging for debugging account discovery
//
// ACCOUNT DISCOVERY:
// Reads from `payment_accounts` table where payment_provider = 'stripe'
// Uses the `secret_key_name` field to look up the API key from environment
// Uses the `account_id` field from the database record
// Only syncs accounts that are:
//   1. is_active = true
//   2. active_until IS NULL (no expiration) OR active_until >= NOW (not expired)
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
    console.log('=== Starting Immediate Multi-Account Stripe Sync (NO DELAYS) ===');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Discover accounts from database (with active_until check)
    const accounts = await discoverStripeAccounts(supabase);
    console.log(`Discovered ${accounts.length} active Stripe account(s):`, accounts.map((a)=>a.id).join(', '));
    if (accounts.length === 0) {
      throw new Error('No active Stripe accounts configured. Add accounts via the Admin page.');
    }
    // Sync window: last 7 days
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const allResults = [];
    const overallStart = Date.now();
    // Sync each account immediately (no delays)
    for(let i = 0; i < accounts.length; i++){
      const account = accounts[i];
      console.log(`\n=== Syncing Account ${i + 1}/${accounts.length}: ${account.id} ===`);
      try {
        // Update last sync attempt
        await supabase.from('payment_accounts').update({
          updated_at: new Date().toISOString()
        }).eq('account_id', account.id);
        const stripe = new Stripe(account.apiKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });
        const startTime = Date.now();
        const results = await syncRecentData(stripe, supabase, account.id, sevenDaysAgo);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        allResults.push({
          account_id: account.id,
          account_name: account.name,
          success: true,
          results,
          sync_duration_seconds: duration
        });
        console.log(`✓ Account ${account.id} synced successfully in ${duration}s`);
      } catch (error) {
        console.error(`✗ Account ${account.id} failed:`, error);
        allResults.push({
          account_id: account.id,
          account_name: account.name,
          success: false,
          error: error.message
        });
      }
    }
    const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(2);
    return new Response(JSON.stringify({
      success: true,
      message: `Immediate sync completed for ${accounts.length} account(s) in ${totalDuration}s`,
      sync_window: {
        from: new Date(sevenDaysAgo * 1000).toISOString(),
        to: new Date().toISOString()
      },
      accounts: allResults,
      total_duration_seconds: totalDuration,
      note: 'No delays - immediate sync for all accounts'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error)
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
 * Discover Stripe accounts from the payment_accounts database table
 * 
 * FIXED: Now properly checks active_until field to prevent syncing expired accounts
 * 
 * This matches how admin.html adds accounts:
 * - account_id: stored in DB
 * - secret_key_name: name of the environment secret (e.g., "STRIPE_ACCOUNT_1_KEY")
 * - API key: looked up from environment using secret_key_name
 * - active_until: optional expiration date - accounts past this date won't sync
 */ async function discoverStripeAccounts(supabase) {
  const accounts = [];
  // Get current timestamp for active_until check
  const now = new Date().toISOString();
  // Query payment_accounts table for active Stripe accounts
  // Only include accounts that are:
  // 1. Active (is_active = true)
  // 2. Either have no expiration (active_until IS NULL) OR not expired yet (active_until >= now)
  const { data: dbAccounts, error } = await supabase.from('payment_accounts').select('account_id, account_name, secret_key_name, is_active, active_until').eq('payment_provider', 'stripe').eq('is_active', true).or(`active_until.is.null,active_until.gte.${now}`);
  if (error) {
    console.error('Error querying payment_accounts:', error);
    throw new Error(`Failed to query payment_accounts: ${error.message}`);
  }
  if (!dbAccounts || dbAccounts.length === 0) {
    console.log('No active Stripe accounts found in payment_accounts table');
    // Fallback: check for legacy STRIPE_SECRET_KEY
    const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (legacyKey) {
      console.log('Found legacy STRIPE_SECRET_KEY, using as fallback');
      accounts.push({
        apiKey: legacyKey,
        id: 'default',
        name: 'Default (Legacy)'
      });
    }
    return accounts;
  }
  console.log(`Found ${dbAccounts.length} active Stripe account(s) in database`);
  for (const dbAccount of dbAccounts){
    const { account_id, account_name, secret_key_name, active_until } = dbAccount;
    // Log expiration status for debugging
    if (active_until) {
      const expirationDate = new Date(active_until).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      console.log(`✓ Account ${account_id} is active (expires: ${expirationDate})`);
    } else {
      console.log(`✓ Account ${account_id} is active (no expiration)`);
    }
    if (!secret_key_name) {
      console.warn(`⚠ Account ${account_id} has no secret_key_name configured - skipping`);
      continue;
    }
    // Look up the API key from environment using the secret_key_name
    const apiKey = Deno.env.get(secret_key_name);
    if (!apiKey) {
      console.warn(`⚠ Secret ${secret_key_name} not found in environment for account ${account_id} - skipping`);
      continue;
    }
    console.log(`✓ Loaded API key for ${account_id} (${account_name}) from ${secret_key_name}`);
    accounts.push({
      apiKey: apiKey,
      id: account_id,
      name: account_name || account_id
    });
  }
  return accounts;
}
/**
 * Sync recent data (last 7 days) for a single account
 */ async function syncRecentData(stripe, supabase, accountId, sinceTimestamp) {
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
  // Helper to fetch recent updates with pagination
  async function fetchRecent(objectType, listFunction, params = {}) {
    try {
      console.log(`  Fetching ${objectType}...`);
      const allData = [];
      let hasMore = true;
      let startingAfter;
      while(hasMore){
        const response = await listFunction({
          limit: 100,
          created: {
            gte: sinceTimestamp
          },
          ...params,
          ...startingAfter ? {
            starting_after: startingAfter
          } : {}
        });
        allData.push(...response.data);
        hasMore = response.has_more;
        if (hasMore && response.data.length > 0) {
          startingAfter = response.data[response.data.length - 1].id;
        }
      }
      console.log(`  ✓ Fetched ${allData.length} ${objectType}`);
      return allData;
    } catch (error) {
      console.error(`  ✗ Failed to fetch ${objectType}:`, error.message);
      return [];
    }
  }
  // Sync Customers
  const customers = await fetchRecent('customers', stripe.customers.list.bind(stripe.customers));
  for (const customer of customers){
    await supabase.from('stripe_customers').upsert({
      id: customer.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
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
  // Sync Products
  const products = await fetchRecent('products', stripe.products.list.bind(stripe.products));
  for (const product of products){
    await supabase.from('stripe_products').upsert({
      id: product.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
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
  // Sync Prices
  const prices = await fetchRecent('prices', stripe.prices.list.bind(stripe.prices));
  for (const price of prices){
    await supabase.from('stripe_prices').upsert({
      id: price.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
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
  // Sync Subscriptions
  const subscriptions = await fetchRecent('subscriptions', stripe.subscriptions.list.bind(stripe.subscriptions), {
    status: 'all'
  });
  for (const subscription of subscriptions){
    await supabase.from('stripe_subscriptions').upsert({
      id: subscription.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
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
  // Sync Payment Intents
  const paymentIntents = await fetchRecent('payment_intents', stripe.paymentIntents.list.bind(stripe.paymentIntents));
  for (const pi of paymentIntents){
    await supabase.from('stripe_payment_intents').upsert({
      id: pi.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
      customer: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id,
      amount: pi.amount,
      amount_received: pi.amount_received,
      currency: pi.currency,
      status: pi.status,
      description: pi.description,
      receipt_email: pi.receipt_email,
      payment_method: typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id,
      payment_method_types: pi.payment_method_types,
      invoice: typeof pi.invoice === 'string' ? pi.invoice : pi.invoice?.id,
      metadata: pi.metadata,
      charges: pi.charges,
      created: pi.created,
      updated: Math.floor(Date.now() / 1000),
      synced_at: new Date().toISOString()
    });
    results.payment_intents++;
  }
  // Sync Charges
  const charges = await fetchRecent('charges', stripe.charges.list.bind(stripe.charges));
  for (const charge of charges){
    await supabase.from('stripe_charges').upsert({
      id: charge.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
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
  // Sync Invoices
  const invoices = await fetchRecent('invoices', stripe.invoices.list.bind(stripe.invoices));
  for (const invoice of invoices){
    await supabase.from('stripe_invoices').upsert({
      id: invoice.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
      customer: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
      subscription: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id,
      number: invoice.number,
      status: invoice.status,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      amount_remaining: invoice.amount_remaining,
      currency: invoice.currency,
      description: invoice.description,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      lines: invoice.lines,
      metadata: invoice.metadata,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      paid: invoice.paid,
      attempted: invoice.attempted,
      created: invoice.created,
      updated: Math.floor(Date.now() / 1000),
      synced_at: new Date().toISOString()
    });
    results.invoices++;
  }
  // Sync Refunds
  const refunds = await fetchRecent('refunds', stripe.refunds.list.bind(stripe.refunds));
  for (const refund of refunds){
    await supabase.from('stripe_refunds').upsert({
      id: refund.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
      charge: typeof refund.charge === 'string' ? refund.charge : refund.charge?.id,
      payment_intent: typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      receipt_number: refund.receipt_number,
      metadata: refund.metadata,
      created: refund.created,
      updated: Math.floor(Date.now() / 1000),
      synced_at: new Date().toISOString()
    });
    results.refunds++;
  }
  // Sync Disputes
  const disputes = await fetchRecent('disputes', stripe.disputes.list.bind(stripe.disputes));
  for (const dispute of disputes){
    await supabase.from('stripe_disputes').upsert({
      id: dispute.id,
      stripe_account_id: accountId,
      payment_provider: 'stripe',
      charge: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
      payment_intent: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id,
      amount: dispute.amount,
      currency: dispute.currency,
      status: dispute.status,
      reason: dispute.reason,
      evidence: dispute.evidence,
      evidence_details: dispute.evidence_details,
      metadata: dispute.metadata,
      is_charge_refundable: dispute.is_charge_refundable,
      created: dispute.created,
      updated: Math.floor(Date.now() / 1000),
      synced_at: new Date().toISOString()
    });
    results.disputes++;
  }
  return results;
}
