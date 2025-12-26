// Edge Function: stripe-refund-lookup
// Search for charges by email and process refunds
// Supports multiple Stripe accounts
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'search';
    // Handle different actions
    switch(action){
      case 'search':
        return await handleSearch(req, supabase);
      case 'refund':
        return await handleRefund(req, supabase);
      case 'accounts':
        return await handleGetAccounts(supabase);
      default:
        throw new Error('Invalid action. Use: search, refund, or accounts');
    }
  } catch (error) {
    console.error('Error:', error);
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
 * Search for charges by email
 */ async function handleSearch(req, supabase) {
  const { email, stripe_account_id } = await req.json();
  if (!email) {
    throw new Error('Email is required');
  }
  console.log(`Searching for charges with email: ${email}`);
  // Build query
  let query = supabase.from('stripe_charges').select(`
      id,
      stripe_account_id,
      payment_provider,
      customer,
      amount,
      amount_refunded,
      currency,
      status,
      paid,
      refunded,
      description,
      receipt_email,
      billing_details,
      created,
      metadata
    `).eq('payment_provider', 'stripe').eq('paid', true).order('created', {
    ascending: false
  });
  // Filter by account if specified
  if (stripe_account_id) {
    query = query.eq('stripe_account_id', stripe_account_id);
  }
  const { data: charges, error } = await query;
  if (error) throw error;
  // Filter by email (check receipt_email, billing_details.email, and customer email)
  const matchingCharges = [];
  for (const charge of charges || []){
    let matched = false;
    let matchSource = '';
    // Parse billing_details if it's a string
    let billingDetails = charge.billing_details;
    if (typeof billingDetails === 'string') {
      try {
        billingDetails = JSON.parse(billingDetails);
      } catch (e) {
        billingDetails = null;
      }
    }
    // Check receipt_email
    if (charge.receipt_email?.toLowerCase() === email.toLowerCase()) {
      matched = true;
      matchSource = 'receipt_email';
    }
    // Check billing_details.email (if exists)
    if (!matched && billingDetails?.email?.toLowerCase() === email.toLowerCase()) {
      matched = true;
      matchSource = 'billing_details';
    }
    // Check customer email from customers table
    if (!matched && charge.customer) {
      const { data: customer } = await supabase.from('stripe_customers').select('email').eq('id', charge.customer).eq('stripe_account_id', charge.stripe_account_id).eq('payment_provider', 'stripe').single();
      if (customer?.email?.toLowerCase() === email.toLowerCase()) {
        matched = true;
        matchSource = 'customer';
        charge.customer_email = customer.email;
      }
    }
    // Add to results if matched
    if (matched) {
      matchingCharges.push({
        ...charge,
        match_source: matchSource,
        billing_email: billingDetails?.email
      });
    }
  }
  // Calculate refundable amount for each charge
  const enrichedCharges = matchingCharges.map((charge)=>{
    // Parse billing_details if needed
    let billingDetails = charge.billing_details;
    if (typeof billingDetails === 'string') {
      try {
        billingDetails = JSON.parse(billingDetails);
      } catch (e) {
        billingDetails = null;
      }
    }
    return {
      ...charge,
      amount_dollars: charge.amount / 100,
      amount_refunded_dollars: charge.amount_refunded / 100,
      refundable_amount: (charge.amount - charge.amount_refunded) / 100,
      is_refundable: charge.amount > charge.amount_refunded && !charge.refunded,
      created_date: new Date(charge.created * 1000).toISOString(),
      match_source: charge.match_source || 'unknown',
      billing_name: billingDetails?.name || null,
      billing_email: billingDetails?.email || null
    };
  });
  return new Response(JSON.stringify({
    success: true,
    email,
    found: enrichedCharges.length,
    charges: enrichedCharges
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
}
/**
 * Process a refund
 */ async function handleRefund(req, supabase) {
  const { charge_id, stripe_account_id, amount, reason } = await req.json();
  if (!charge_id) {
    throw new Error('charge_id is required');
  }
  if (!stripe_account_id) {
    throw new Error('stripe_account_id is required');
  }
  console.log(`Processing refund for charge: ${charge_id}`);
  // Get the charge details
  const { data: charge, error: chargeError } = await supabase.from('stripe_charges').select('*').eq('id', charge_id).eq('stripe_account_id', stripe_account_id).eq('payment_provider', 'stripe').single();
  if (chargeError || !charge) {
    throw new Error('Charge not found');
  }
  // Validate refund
  const refundableAmount = charge.amount - charge.amount_refunded;
  if (refundableAmount <= 0) {
    throw new Error('This charge has already been fully refunded');
  }
  // Get Stripe API key for this account
  const stripeKey = getStripeKeyForAccount(stripe_account_id);
  if (!stripeKey) {
    throw new Error(`No Stripe API key found for account: ${stripe_account_id}`);
  }
  // Initialize Stripe
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient()
  });
  // Calculate refund amount (in cents)
  let refundAmount;
  if (amount) {
    // Partial refund
    refundAmount = Math.round(amount * 100);
    if (refundAmount > refundableAmount) {
      throw new Error(`Refund amount ($${amount}) exceeds refundable amount ($${refundableAmount / 100})`);
    }
  } else {
    // Full refund
    refundAmount = refundableAmount;
  }
  // Create refund in Stripe
  const refund = await stripe.refunds.create({
    charge: charge_id,
    amount: refundAmount,
    reason: reason || 'requested_by_customer'
  });
  console.log('Refund created:', refund.id);
  // Update database
  await supabase.from('stripe_charges').update({
    amount_refunded: charge.amount_refunded + refundAmount,
    refunded: refund.status === 'succeeded' && charge.amount_refunded + refundAmount >= charge.amount,
    updated: Math.floor(Date.now() / 1000),
    synced_at: new Date().toISOString()
  }).eq('id', charge_id).eq('stripe_account_id', stripe_account_id).eq('payment_provider', 'stripe');
  // Insert refund record
  await supabase.from('stripe_refunds').upsert({
    id: refund.id,
    stripe_account_id,
    payment_provider: 'stripe',
    charge: charge_id,
    payment_intent: charge.payment_intent,
    amount: refundAmount,
    currency: charge.currency,
    status: refund.status,
    reason: refund.reason,
    receipt_number: refund.receipt_number,
    metadata: refund.metadata,
    created: refund.created,
    updated: Math.floor(Date.now() / 1000),
    synced_at: new Date().toISOString()
  });
  return new Response(JSON.stringify({
    success: true,
    refund: {
      id: refund.id,
      charge_id: charge_id,
      amount: refundAmount / 100,
      currency: charge.currency,
      status: refund.status,
      created: new Date(refund.created * 1000).toISOString()
    },
    message: `Successfully refunded $${refundAmount / 100} ${charge.currency.toUpperCase()}`
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
}
/**
 * Get list of available Stripe accounts
 */ async function handleGetAccounts(supabase) {
  const { data: accounts, error } = await supabase.from('payment_accounts').select('account_id, account_name, payment_provider').eq('payment_provider', 'stripe').eq('is_active', true);
  if (error) throw error;
  return new Response(JSON.stringify({
    success: true,
    accounts: accounts || []
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
}
/**
 * Get Stripe API key for account
 */ function getStripeKeyForAccount(accountId) {
  // Check legacy
  if (accountId === 'default') {
    const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (legacyKey) return legacyKey;
  }
  // Check numbered accounts (1-100)
  for(let i = 1; i <= 100; i++){
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    if (id === accountId && key) {
      return key;
    }
  }
  return null;
}
