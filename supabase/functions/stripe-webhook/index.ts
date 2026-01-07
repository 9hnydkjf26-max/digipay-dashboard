// Edge Function: stripe-webhook (DIRECT ROUTING VERSION)
// Uses ?account_id= query parameter for O(1) account lookup
// 
// Webhook URL format in Stripe Dashboard:
// https://[project].supabase.co/functions/v1/stripe-webhook?account_id=acct_xxxxx
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.10.0?target=deno";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get account_id from query parameter
    const url = new URL(req.url);
    const accountId = url.searchParams.get('account_id');
    if (!accountId) {
      throw new Error('Missing account_id query parameter. URL should be: /stripe-webhook?account_id=acct_xxxxx');
    }
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      throw new Error('No Stripe signature provided');
    }
    const body = await req.text();
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Look up the specific account
    const { data: account, error: accountError } = await supabase.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('account_id', accountId).eq('payment_provider', 'stripe').eq('is_active', true).single();
    if (accountError || !account) {
      throw new Error(`Account not found or inactive: ${accountId}`);
    }
    if (!account.secret_key_name) {
      throw new Error(`Account ${accountId} has no secret_key_name configured`);
    }
    // Derive secret names from secret_key_name
    // STRIPE_ACCOUNT_N_KEY → STRIPE_WEBHOOK_N_SECRET
    const match = account.secret_key_name.match(/^STRIPE_ACCOUNT_(\d+)_KEY$/);
    if (!match) {
      throw new Error(`Invalid secret_key_name format: ${account.secret_key_name}`);
    }
    const accountNumber = match[1];
    const apiKeySecretName = account.secret_key_name;
    const webhookSecretName = `STRIPE_WEBHOOK_${accountNumber}_SECRET`;
    const apiKey = Deno.env.get(apiKeySecretName);
    const webhookSecret = Deno.env.get(webhookSecretName);
    if (!apiKey) {
      throw new Error(`API key secret not found: ${apiKeySecretName}`);
    }
    if (!webhookSecret) {
      throw new Error(`Webhook secret not found: ${webhookSecretName}`);
    }
    // Verify webhook signature
    const stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
    console.log(`✅ Webhook verified for ${accountId}:`, event.type, event.id);
    // Handle the event
    await handleStripeEvent(supabase, event, accountId);
    return new Response(JSON.stringify({
      received: true,
      event_type: event.type,
      event_id: event.id,
      account_id: accountId
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
/**
 * Handle Stripe webhook events
 */ async function handleStripeEvent(supabase, event, accountId) {
  switch(event.type){
    // Customer events
    case 'customer.created':
    case 'customer.updated':
      await handleCustomer(supabase, event.data.object, accountId);
      break;
    case 'customer.deleted':
      await handleCustomerDeleted(supabase, event.data.object, accountId);
      break;
    // Product events
    case 'product.created':
    case 'product.updated':
      await handleProduct(supabase, event.data.object, accountId);
      break;
    case 'product.deleted':
      await handleProductDeleted(supabase, event.data.object, accountId);
      break;
    // Price events
    case 'price.created':
    case 'price.updated':
      await handlePrice(supabase, event.data.object, accountId);
      break;
    case 'price.deleted':
      await handlePriceDeleted(supabase, event.data.object, accountId);
      break;
    // Subscription events
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscription(supabase, event.data.object, accountId);
      break;
    // Payment Intent events
    case 'payment_intent.created':
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
      await handlePaymentIntent(supabase, event.data.object, accountId);
      break;
    // Charge events
    case 'charge.succeeded':
    case 'charge.failed':
    case 'charge.refunded':
    case 'charge.updated':
      await handleCharge(supabase, event.data.object, accountId);
      break;
    // Invoice events
    case 'invoice.created':
    case 'invoice.updated':
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.finalized':
      await handleInvoice(supabase, event.data.object, accountId);
      break;
    // Refund events
    case 'refund.created':
    case 'refund.updated':
    case 'charge.refund.updated':
      await handleRefund(supabase, event.data.object, accountId);
      break;
    // Dispute events
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
      await handleDispute(supabase, event.data.object, accountId);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }
}
// Handler functions
async function handleCustomer(supabase, customer, accountId) {
  const { error } = await supabase.from('stripe_customers').upsert({
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
    deleted: false,
    synced_at: new Date().toISOString()
  });
  if (error) console.error('Error upserting customer:', error);
}
async function handleCustomerDeleted(supabase, customer, accountId) {
  const { error } = await supabase.from('stripe_customers').update({
    deleted: true,
    synced_at: new Date().toISOString()
  }).eq('id', customer.id).eq('stripe_account_id', accountId).eq('payment_provider', 'stripe');
  if (error) console.error('Error deleting customer:', error);
}
async function handleProduct(supabase, product, accountId) {
  const { error } = await supabase.from('stripe_products').upsert({
    id: product.id,
    stripe_account_id: accountId,
    payment_provider: 'stripe',
    name: product.name,
    description: product.description,
    active: product.active,
    metadata: product.metadata,
    images: product.images,
    default_price: product.default_price,
    unit_label: product.unit_label,
    created: product.created,
    updated: product.updated,
    deleted: false,
    synced_at: new Date().toISOString()
  });
  if (error) console.error('Error upserting product:', error);
}
async function handleProductDeleted(supabase, product, accountId) {
  const { error } = await supabase.from('stripe_products').update({
    deleted: true,
    synced_at: new Date().toISOString()
  }).eq('id', product.id).eq('stripe_account_id', accountId).eq('payment_provider', 'stripe');
  if (error) console.error('Error deleting product:', error);
}
async function handlePrice(supabase, price, accountId) {
  const { error } = await supabase.from('stripe_prices').upsert({
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
    deleted: false,
    synced_at: new Date().toISOString()
  });
  if (error) console.error('Error upserting price:', error);
}
async function handlePriceDeleted(supabase, price, accountId) {
  const { error } = await supabase.from('stripe_prices').update({
    deleted: true,
    synced_at: new Date().toISOString()
  }).eq('id', price.id).eq('stripe_account_id', accountId).eq('payment_provider', 'stripe');
  if (error) console.error('Error deleting price:', error);
}
async function handleSubscription(supabase, subscription, accountId) {
  const { error } = await supabase.from('stripe_subscriptions').upsert({
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
  if (error) console.error('Error upserting subscription:', error);
}
async function handlePaymentIntent(supabase, pi, accountId) {
  const { error } = await supabase.from('stripe_payment_intents').upsert({
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
  if (error) console.error('Error upserting payment intent:', error);
}
async function handleCharge(supabase, charge, accountId) {
  // Check if charge already exists under a different account (for migrated accounts)
  let resolvedAccountId = accountId;
  const { data: existingCharge } = await supabase.from('stripe_charges').select('stripe_account_id').eq('id', charge.id).single();
  if (existingCharge) {
    resolvedAccountId = existingCharge.stripe_account_id;
    if (resolvedAccountId !== accountId) {
      console.log(`Charge ${charge.id}: using existing account ${resolvedAccountId} instead of ${accountId}`);
    }
  }
  const { error } = await supabase.from('stripe_charges').upsert({
    id: charge.id,
    stripe_account_id: resolvedAccountId,
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
  if (error) console.error('Error upserting charge:', error);
}
async function handleInvoice(supabase, invoice, accountId) {
  const { error } = await supabase.from('stripe_invoices').upsert({
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
  if (error) console.error('Error upserting invoice:', error);
}
async function handleRefund(supabase, refund, accountId) {
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
  const paymentIntentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
  // Look up which account the charge belongs to (for migrated accounts)
  let resolvedAccountId = accountId;
  if (chargeId) {
    const { data: charge } = await supabase.from('stripe_charges').select('stripe_account_id').eq('id', chargeId).single();
    if (charge) {
      resolvedAccountId = charge.stripe_account_id;
      console.log(`Refund ${refund.id}: resolved account from charge ${chargeId} → ${resolvedAccountId}`);
    }
  }
  const { error } = await supabase.from('stripe_refunds').upsert({
    id: refund.id,
    stripe_account_id: resolvedAccountId,
    payment_provider: 'stripe',
    charge: chargeId,
    payment_intent: paymentIntentId,
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
  if (error) console.error('Error upserting refund:', error);
}
async function handleDispute(supabase, dispute, accountId) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
  // Look up which account the charge belongs to (for migrated accounts)
  let resolvedAccountId = accountId;
  if (chargeId) {
    const { data: charge } = await supabase.from('stripe_charges').select('stripe_account_id').eq('id', chargeId).single();
    if (charge) {
      resolvedAccountId = charge.stripe_account_id;
      console.log(`Dispute ${dispute.id}: resolved account from charge ${chargeId} → ${resolvedAccountId}`);
    }
  }
  const { error } = await supabase.from('stripe_disputes').upsert({
    id: dispute.id,
    stripe_account_id: resolvedAccountId,
    payment_provider: 'stripe',
    charge: chargeId,
    payment_intent: paymentIntentId,
    amount: dispute.amount,
    currency: dispute.currency,
    status: dispute.status,
    reason: dispute.reason,
    evidence: dispute.evidence,
    evidence_details: dispute.evidence_details,
    is_charge_refundable: dispute.is_charge_refundable,
    metadata: dispute.metadata,
    created: dispute.created,
    updated: Math.floor(Date.now() / 1000),
    synced_at: new Date().toISOString()
  });
  if (error) console.error('Error upserting dispute:', error);
}
