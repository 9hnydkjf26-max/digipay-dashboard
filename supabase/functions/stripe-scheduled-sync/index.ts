// Edge Function: stripe-scheduled-sync (STAGGERED VERSION)
// Automatically syncs all discovered Stripe accounts with random delays between them
// Waits 0-10 minutes between each account to avoid rate limits
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
    console.log('=== Starting Staggered Multi-Account Stripe Sync ===');
    // Auto-discover all Stripe accounts
    const accounts = discoverStripeAccounts();
    console.log(`Discovered ${accounts.length} Stripe account(s):`, accounts.map((a)=>a.id).join(', '));
    if (accounts.length === 0) {
      throw new Error('No Stripe accounts configured');
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Sync window: last 7 days
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const allResults = [];
    // Sync each account with staggered delays
    for(let i = 0; i < accounts.length; i++){
      const account = accounts[i];
      console.log(`\n=== Syncing Account ${i + 1}/${accounts.length}: ${account.id} ===`);
      try {
        // Register account in payment_accounts table if not exists
        await supabase.from('payment_accounts').upsert({
          account_id: account.id,
          account_name: account.id,
          payment_provider: 'stripe',
          environment: account.id.includes('test') || account.apiKey.includes('_test_') ? 'test' : 'live',
          is_active: true,
          updated_at: new Date().toISOString()
        });
        const stripe = new Stripe(account.apiKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });
        const startTime = Date.now();
        const results = await syncRecentData(stripe, supabase, account.id, sevenDaysAgo);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        allResults.push({
          account_id: account.id,
          success: true,
          results,
          sync_duration_seconds: duration
        });
        console.log(`✓ Account ${account.id} synced successfully in ${duration}s`);
        // Stagger: Wait random time before next account (except after last account)
        if (i < accounts.length - 1) {
          const delayMinutes = getRandomDelay(0, 10);
          const delayMs = delayMinutes * 60 * 1000;
          console.log(`⏳ Waiting ${delayMinutes.toFixed(2)} minutes before next account...`);
          await sleep(delayMs);
        }
      } catch (error) {
        console.error(`✗ Account ${account.id} failed:`, error);
        allResults.push({
          account_id: account.id,
          success: false,
          error: error.message
        });
        // Still wait before next account even if this one failed
        if (i < accounts.length - 1) {
          const delayMinutes = getRandomDelay(0, 10);
          const delayMs = delayMinutes * 60 * 1000;
          console.log(`⏳ Waiting ${delayMinutes.toFixed(2)} minutes before next account (despite error)...`);
          await sleep(delayMs);
        }
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: `Staggered sync completed for ${accounts.length} account(s)`,
      sync_window: {
        from: new Date(sevenDaysAgo * 1000).toISOString(),
        to: new Date().toISOString()
      },
      accounts: allResults,
      note: 'Syncs were staggered with 0-10 minute delays between accounts'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Scheduled sync error:', error);
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
 * Get random delay between min and max minutes
 */ function getRandomDelay(minMinutes, maxMinutes) {
  return minMinutes + Math.random() * (maxMinutes - minMinutes);
}
/**
 * Sleep for specified milliseconds
 */ function sleep(ms) {
  return new Promise((resolve)=>setTimeout(resolve, ms));
}
/**
 * Auto-discover Stripe accounts
 */ function discoverStripeAccounts() {
  const accounts = [];
  // Legacy single account
  const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (legacyKey) {
    console.log('Found legacy STRIPE_SECRET_KEY');
    accounts.push({
      apiKey: legacyKey,
      id: 'default'
    });
  }
  // Numbered accounts (1-100)
  for(let i = 1; i <= 100; i++){
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    if (key && id) {
      console.log(`Found STRIPE_ACCOUNT_${i}_KEY with ID: ${id}`);
      accounts.push({
        apiKey: key,
        id: id
      });
    } else if (i > 1 && accounts.length > 0 && !key) {
      break; // Stop at first gap
    }
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
  // Helper to fetch recent updates
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
      console.error(`  ✗ Failed to fetch ${objectType}:`, error);
      return [];
    }
  }
  // Sync Customers
  const customers = await fetchRecent('customers', stripe.customers.list.bind(stripe.customers));
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
  // Sync Products
  const products = await fetchRecent('products', stripe.products.list.bind(stripe.products));
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
  // Sync Prices
  const prices = await fetchRecent('prices', stripe.prices.list.bind(stripe.prices));
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
  // Sync Subscriptions
  const subscriptions = await fetchRecent('subscriptions', stripe.subscriptions.list.bind(stripe.subscriptions), {
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
  // Sync Payment Intents
  const paymentIntents = await fetchRecent('payment_intents', stripe.paymentIntents.list.bind(stripe.paymentIntents));
  for (const pi of paymentIntents){
    await supabase.from('stripe_payment_intents').upsert({
      id: pi.id,
      stripe_account_id: accountId,
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
