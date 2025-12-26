// Edge Function: refund-gateway
// Secure API gateway for refund operations
// Uses Supabase Auth - no service_role key exposed to client
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
    // Get authorization token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'No authorization header'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    // Extract the token
    const token = authHeader.replace('Bearer ', '');
    // Verify user is authenticated using service_role
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        details: authError?.message
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    // Check if user has refund_admin role in metadata
    const userRole = user.user_metadata?.role || user.app_metadata?.role;
    const allowedRoles = [
      'refund_admin',
      'admin',
      'support'
    ];
    if (!allowedRoles.includes(userRole)) {
      return new Response(JSON.stringify({
        error: 'Insufficient permissions'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    // User is authenticated and authorized
    // Now use service_role for actual operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'search';
    // Handle different actions
    switch(action){
      case 'search':
        return await handleSearch(req, supabaseAdmin, user);
      case 'refund':
        return await handleRefund(req, supabaseAdmin, user);
      case 'accounts':
        return await handleGetAccounts(supabaseAdmin, user);
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Gateway error:', error);
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
 */ async function handleSearch(req, supabase, user) {
  const { email, stripe_account_id } = await req.json();
  if (!email) {
    throw new Error('Email is required');
  }
  console.log(`User ${user.email} searching for charges: ${email}`);
  const emailLower = email.toLowerCase();
  // OPTIMIZATION: Do the email matching in SQL, not JavaScript
  // This is 100x faster for large datasets
  // First: Get charges that match on receipt_email or billing_details
  let directQuery = supabase.from('stripe_charges').select(`
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
    `).eq('paid', true);
  if (stripe_account_id) {
    directQuery = directQuery.eq('stripe_account_id', stripe_account_id);
  }
  // Use ilike for case-insensitive search on receipt_email
  directQuery = directQuery.ilike('receipt_email', emailLower);
  const { data: directMatches, error: directError } = await directQuery.limit(100);
  if (directError) throw directError;
  // Second: Get customer IDs that match the email
  const { data: matchingCustomers, error: customerError } = await supabase.from('stripe_customers').select('id, stripe_account_id, email').ilike('email', emailLower);
  if (customerError) throw customerError;
  // Third: Get charges for those customers
  let customerCharges = [];
  if (matchingCustomers && matchingCustomers.length > 0) {
    const customerIds = matchingCustomers.map((c)=>c.id);
    let customerQuery = supabase.from('stripe_charges').select(`
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
      `).eq('paid', true).in('customer', customerIds);
    if (stripe_account_id) {
      customerQuery = customerQuery.eq('stripe_account_id', stripe_account_id);
    }
    const { data, error } = await customerQuery.limit(100);
    if (!error && data) {
      customerCharges = data;
    }
  }
  // Combine and deduplicate results
  const chargeMap = new Map();
  // Add direct matches
  (directMatches || []).forEach((charge)=>{
    chargeMap.set(charge.id, {
      ...charge,
      match_source: 'receipt_email'
    });
  });
  // Add customer matches
  customerCharges.forEach((charge)=>{
    if (!chargeMap.has(charge.id)) {
      const customer = matchingCustomers.find((c)=>c.id === charge.customer);
      chargeMap.set(charge.id, {
        ...charge,
        match_source: 'customer',
        customer_email: customer?.email
      });
    }
  });
  // Check billing_details (has to be done in JS since it's JSON)
  const allCharges = Array.from(chargeMap.values());
  // Add any charges with matching billing_details email
  // This is fast because we only check charges we already fetched
  allCharges.forEach((charge)=>{
    let billingDetails = charge.billing_details;
    if (typeof billingDetails === 'string') {
      try {
        billingDetails = JSON.parse(billingDetails);
        if (billingDetails?.email?.toLowerCase() === emailLower) {
          charge.match_source = 'billing_details';
          charge.billing_email = billingDetails.email;
        }
      } catch (e) {
      // ignore
      }
    }
  });
  const matchingCharges = allCharges;
  // Calculate refundable amounts
  const enrichedCharges = matchingCharges.map((charge)=>{
    let billingDetails = charge.billing_details;
    if (typeof billingDetails === 'string') {
      try {
        billingDetails = JSON.parse(billingDetails);
      } catch (e) {
        billingDetails = null;
      }
    }
    // Both Stripe and Airwallex charges can now be refunded through this interface
    const canRefundViaInterface = charge.payment_provider === 'stripe' || charge.payment_provider === 'airwallex';
    return {
      ...charge,
      amount_dollars: charge.amount / 100,
      amount_refunded_dollars: charge.amount_refunded / 100,
      refundable_amount: (charge.amount - charge.amount_refunded) / 100,
      is_refundable: charge.amount > charge.amount_refunded && !charge.refunded && canRefundViaInterface,
      can_refund_via_interface: canRefundViaInterface,
      created_date: new Date(charge.created * 1000).toISOString(),
      match_source: charge.match_source || 'unknown',
      billing_name: billingDetails?.name || null,
      billing_email: billingDetails?.email || null
    };
  });
  // Log the search
  await logAction(supabase, user.id, 'search', {
    email,
    results: enrichedCharges.length
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
 */ async function handleRefund(req, supabase, user) {
  const { charge_id, stripe_account_id, amount, reason } = await req.json();
  if (!charge_id || !stripe_account_id) {
    throw new Error('charge_id and stripe_account_id are required');
  }
  console.log(`User ${user.email} processing refund for charge: ${charge_id}`);
  // Get the charge details
  const { data: charge, error: chargeError } = await supabase.from('stripe_charges').select('*').eq('id', charge_id).eq('stripe_account_id', stripe_account_id).single();
  if (chargeError || !charge) {
    throw new Error('Charge not found');
  }
  const refundableAmount = charge.amount - charge.amount_refunded;
  if (refundableAmount <= 0) {
    throw new Error('This charge has already been fully refunded');
  }
  let refundAmount;
  if (amount) {
    refundAmount = Math.round(amount * 100);
    if (refundAmount > refundableAmount) {
      throw new Error(`Refund amount exceeds refundable amount`);
    }
  } else {
    refundAmount = refundableAmount;
  }
  // Route to appropriate payment provider
  let refund;
  if (charge.payment_provider === 'airwallex') {
    refund = await processAirwallexRefund(charge, charge_id, stripe_account_id, refundAmount, reason, user);
  } else {
    // Default to Stripe
    refund = await processStripeRefund(charge, charge_id, stripe_account_id, refundAmount, reason, user);
  }
  // Update database
  await supabase.from('stripe_charges').update({
    amount_refunded: charge.amount_refunded + refundAmount,
    refunded: refund.status === 'succeeded' && charge.amount_refunded + refundAmount >= charge.amount,
    updated: Math.floor(Date.now() / 1000),
    synced_at: new Date().toISOString()
  }).eq('id', charge_id).eq('stripe_account_id', stripe_account_id);
  await supabase.from('stripe_refunds').upsert({
    id: refund.id,
    stripe_account_id,
    payment_provider: charge.payment_provider,
    charge: charge_id,
    payment_intent: charge.payment_intent,
    amount: refundAmount,
    currency: charge.currency,
    status: refund.status,
    reason: refund.reason,
    receipt_number: refund.receipt_number || null,
    metadata: refund.metadata || {},
    created: refund.created,
    updated: Math.floor(Date.now() / 1000),
    synced_at: new Date().toISOString()
  });
  // Log the refund action
  await logAction(supabase, user.id, 'refund', {
    charge_id,
    amount: refundAmount / 100,
    reason,
    refund_id: refund.id,
    payment_provider: charge.payment_provider
  });
  return new Response(JSON.stringify({
    success: true,
    refund: {
      id: refund.id,
      charge_id: charge_id,
      amount: refundAmount / 100,
      currency: charge.currency,
      status: refund.status,
      created: new Date(refund.created * 1000).toISOString(),
      refunded_by: user.email,
      payment_provider: charge.payment_provider
    },
    message: `Successfully refunded ${(refundAmount / 100).toFixed(2)} ${charge.currency.toUpperCase()}`
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    status: 200
  });
}
/**
 * Process Stripe refund
 */ async function processStripeRefund(charge, charge_id, stripe_account_id, refundAmount, reason, user) {
  const stripeKey = getStripeKeyForAccount(stripe_account_id);
  if (!stripeKey) {
    throw new Error(`No Stripe API key found for account: ${stripe_account_id}`);
  }
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient()
  });
  const refund = await stripe.refunds.create({
    charge: charge_id,
    amount: refundAmount,
    reason: reason || 'requested_by_customer',
    metadata: {
      refunded_by: user.email,
      refunded_at: new Date().toISOString()
    }
  });
  return {
    id: refund.id,
    status: refund.status,
    reason: refund.reason,
    receipt_number: refund.receipt_number,
    metadata: refund.metadata,
    created: refund.created
  };
}
/**
 * Process Airwallex refund
 */ async function processAirwallexRefund(charge, charge_id, stripe_account_id, refundAmount, reason, user) {
  // Get Airwallex credentials
  const { apiKey, apiSecret } = getAirwallexCredentialsForAccount(stripe_account_id);
  if (!apiKey || !apiSecret) {
    throw new Error(`No Airwallex credentials found for account: ${stripe_account_id}`);
  }
  // Get Airwallex access token
  const token = await getAirwallexToken(apiKey, apiSecret);
  // Map reason to Airwallex format
  const airwallexReason = mapReasonToAirwallex(reason);
  // Create refund via Airwallex API
  // The charge_id for Airwallex is actually the payment_intent_id
  const paymentIntentId = charge.payment_intent || charge_id.replace('ch_', '');
  // Generate unique request_id (idempotency key)
  const requestId = `refund_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const response = await fetch('https://api.airwallex.com/api/v1/pa/refunds/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payment_intent_id: paymentIntentId,
      amount: (refundAmount / 100).toFixed(2),
      reason: airwallexReason,
      request_id: requestId,
      metadata: {
        refunded_by: user.email,
        refunded_at: new Date().toISOString(),
        charge_id: charge_id
      }
    })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(()=>({}));
    console.error('Airwallex refund error:', errorData);
    throw new Error(`Airwallex refund failed: ${errorData.message || errorData.code || response.statusText}`);
  }
  const refundData = await response.json();
  return {
    id: refundData.id,
    status: refundData.status === 'RECEIVED' ? 'succeeded' : 'pending',
    reason: reason || 'requested_by_customer',
    receipt_number: null,
    metadata: refundData.metadata || {},
    created: Math.floor(new Date(refundData.created_at).getTime() / 1000)
  };
}
/**
 * Get available accounts
 */ async function handleGetAccounts(supabase, user) {
  const { data: accounts, error } = await supabase.from('payment_accounts').select('account_id, account_name, payment_provider').eq('is_active', true).order('payment_provider, account_name');
  if (error) throw error;
  await logAction(supabase, user.id, 'list_accounts', {
    count: accounts?.length || 0
  });
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
  if (accountId === 'default') {
    const legacyKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (legacyKey) return legacyKey;
  }
  for(let i = 1; i <= 100; i++){
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    if (id === accountId && key) {
      return key;
    }
  }
  return null;
}
/**
 * Get Airwallex credentials for account
 */ function getAirwallexCredentialsForAccount(accountId) {
  // Legacy single account
  const legacyKey = Deno.env.get('AIRWALLEX_API_KEY');
  const legacySecret = Deno.env.get('AIRWALLEX_API_SECRET');
  if (accountId === 'default' && legacyKey && legacySecret) {
    return {
      apiKey: legacyKey,
      apiSecret: legacySecret
    };
  }
  // Numbered accounts
  for(let i = 1; i <= 100; i++){
    const key = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_KEY`);
    const secret = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_SECRET`);
    const id = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_ID`);
    if (id === accountId && key && secret) {
      return {
        apiKey: key,
        apiSecret: secret
      };
    }
  }
  return {
    apiKey: null,
    apiSecret: null
  };
}
/**
 * Get Airwallex access token
 */ async function getAirwallexToken(apiKey, apiSecret) {
  const response = await fetch('https://api.airwallex.com/api/v1/authentication/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': apiKey,
      'x-api-key': apiSecret
    }
  });
  if (!response.ok) {
    throw new Error(`Airwallex authentication failed: ${response.statusText}`);
  }
  const data = await response.json();
  return data.token;
}
/**
 * Map refund reason to Airwallex format
 */ function mapReasonToAirwallex(reason) {
  const reasonMap = {
    'requested_by_customer': 'CUSTOMER_REQUEST',
    'duplicate': 'DUPLICATE',
    'fraudulent': 'FRAUD'
  };
  return reasonMap[reason] || 'CUSTOMER_REQUEST';
}
/**
 * Log user actions for audit trail
 */ async function logAction(supabase, userId, action, details) {
  try {
    await supabase.from('refund_audit_log').insert({
      user_id: userId,
      action,
      details,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  // Don't fail the request if logging fails
  }
}
