// Edge Function: airwallex-sync
// Syncs Airwallex data into the same tables as Stripe
// Auto-discovers accounts using AIRWALLEX_ACCOUNT_N_KEY pattern
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
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
    console.log('=== Starting Airwallex Sync ===');
    // Auto-discover Airwallex accounts
    const accounts = discoverAirwallexAccounts();
    console.log(`Discovered ${accounts.length} Airwallex account(s):`, accounts.map((a)=>a.id).join(', '));
    if (accounts.length === 0) {
      throw new Error('No Airwallex accounts configured');
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const allResults = [];
    // Sync each Airwallex account
    for (const account of accounts){
      console.log(`\n=== Syncing Airwallex Account: ${account.id} ===`);
      try {
        const results = await syncAirwallexAccount(supabase, account);
        allResults.push({
          account_id: account.id,
          payment_provider: 'airwallex',
          success: true,
          results
        });
        console.log(`✓ Airwallex account ${account.id} synced successfully`);
      } catch (error) {
        console.error(`✗ Airwallex account ${account.id} failed:`, error);
        allResults.push({
          account_id: account.id,
          payment_provider: 'airwallex',
          success: false,
          error: error.message
        });
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${accounts.length} Airwallex account(s)`,
      accounts: allResults
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Airwallex sync error:', error);
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
 * Auto-discover Airwallex accounts from environment
 * Pattern: AIRWALLEX_ACCOUNT_N_KEY + AIRWALLEX_ACCOUNT_N_ID + AIRWALLEX_ACCOUNT_N_SECRET
 */ function discoverAirwallexAccounts() {
  const accounts = [];
  // Legacy single account
  const legacyKey = Deno.env.get('AIRWALLEX_API_KEY');
  const legacySecret = Deno.env.get('AIRWALLEX_API_SECRET');
  if (legacyKey && legacySecret) {
    console.log('Found legacy AIRWALLEX_API_KEY');
    accounts.push({
      apiKey: legacyKey,
      apiSecret: legacySecret,
      id: 'default'
    });
  }
  // Numbered accounts (1-100)
  for(let i = 1; i <= 100; i++){
    const key = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_KEY`);
    const secret = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_SECRET`);
    const id = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_ID`);
    if (key && secret && id) {
      console.log(`Found AIRWALLEX_ACCOUNT_${i}_KEY with ID: ${id}`);
      accounts.push({
        apiKey: key,
        apiSecret: secret,
        id: id
      });
    } else if (i > 1 && accounts.length > 0 && !key) {
      break;
    }
  }
  return accounts;
}
/**
 * Sync a single Airwallex account
 */ async function syncAirwallexAccount(supabase, account) {
  const results = {
    customers: 0,
    charges: 0,
    refunds: 0,
    payment_intents: 0
  };
  // Register account in database
  await supabase.from('payment_accounts').upsert({
    account_id: account.id,
    account_name: account.id,
    payment_provider: 'airwallex',
    environment: account.id.includes('test') ? 'test' : 'live',
    is_active: true,
    updated_at: new Date().toISOString()
  });
  // Get Airwallex access token
  const accessToken = await getAirwallexToken(account.apiKey, account.apiSecret);
  // Sync Customers (Airwallex calls them "customers" too)
  console.log('  Syncing customers...');
  await supabase.rpc('update_sync_status_for_account', {
    p_object_type: 'customers',
    p_stripe_account_id: account.id,
    p_payment_provider: 'airwallex',
    p_status: 'in_progress'
  });
  const customers = await fetchAirwallexCustomers(accessToken);
  for (const customer of customers){
    await supabase.from('stripe_customers').upsert({
      id: customer.id,
      stripe_account_id: account.id,
      payment_provider: 'airwallex',
      email: customer.email,
      name: customer.first_name && customer.last_name ? `${customer.first_name} ${customer.last_name}` : customer.first_name || customer.last_name,
      description: customer.merchant_customer_id,
      phone: customer.phone_number,
      address: customer.billing_address,
      shipping: customer.shipping_address,
      metadata: customer.metadata || {},
      balance: 0,
      currency: null,
      delinquent: false,
      created: new Date(customer.created_at).getTime() / 1000,
      updated: Math.floor(Date.now() / 1000),
      deleted: false,
      synced_at: new Date().toISOString()
    });
    results.customers++;
  }
  await supabase.rpc('update_sync_status_for_account', {
    p_object_type: 'customers',
    p_stripe_account_id: account.id,
    p_payment_provider: 'airwallex',
    p_status: 'completed',
    p_total_synced: results.customers
  });
  // Sync Payment Intents
  console.log('  Syncing payment intents...');
  await supabase.rpc('update_sync_status_for_account', {
    p_object_type: 'payment_intents',
    p_stripe_account_id: account.id,
    p_payment_provider: 'airwallex',
    p_status: 'in_progress'
  });
  const paymentIntents = await fetchAirwallexPaymentIntents(accessToken);
  for (const pi of paymentIntents){
    await supabase.from('stripe_payment_intents').upsert({
      id: pi.id,
      stripe_account_id: account.id,
      payment_provider: 'airwallex',
      customer: pi.customer_id,
      amount: Math.round(parseFloat(pi.amount) * 100),
      amount_received: pi.status === 'SUCCEEDED' ? Math.round(parseFloat(pi.amount) * 100) : 0,
      currency: pi.currency,
      status: mapAirwallexStatus(pi.status),
      description: pi.merchant_order_id,
      receipt_email: pi.customer?.email,
      payment_method: pi.payment_method_type,
      payment_method_types: [
        pi.payment_method_type
      ],
      invoice: null,
      metadata: pi.metadata || {},
      charges: {},
      created: new Date(pi.created_at).getTime() / 1000,
      updated: new Date(pi.updated_at).getTime() / 1000,
      synced_at: new Date().toISOString()
    });
    results.payment_intents++;
    // Also create charge record for succeeded payments
    if (pi.status === 'SUCCEEDED') {
      await supabase.from('stripe_charges').upsert({
        id: `ch_${pi.id}`,
        stripe_account_id: account.id,
        payment_provider: 'airwallex',
        customer: pi.customer_id,
        payment_intent: pi.id,
        amount: Math.round(parseFloat(pi.amount) * 100),
        amount_captured: Math.round(parseFloat(pi.captured_amount || pi.amount) * 100),
        amount_refunded: Math.round(parseFloat(pi.refunded_amount || 0) * 100),
        currency: pi.currency,
        status: 'succeeded',
        paid: true,
        refunded: parseFloat(pi.refunded_amount || 0) > 0,
        disputed: false,
        description: pi.merchant_order_id,
        receipt_email: pi.customer?.email,
        receipt_url: null,
        payment_method: pi.payment_method_id,
        payment_method_details: {},
        billing_details: {},
        metadata: pi.metadata || {},
        created: new Date(pi.created_at).getTime() / 1000,
        updated: new Date(pi.updated_at).getTime() / 1000,
        synced_at: new Date().toISOString()
      });
      results.charges++;
    }
  }
  await supabase.rpc('update_sync_status_for_account', {
    p_object_type: 'payment_intents',
    p_stripe_account_id: account.id,
    p_payment_provider: 'airwallex',
    p_status: 'completed',
    p_total_synced: results.payment_intents
  });
  // Sync Refunds
  console.log('  Syncing refunds...');
  await supabase.rpc('update_sync_status_for_account', {
    p_object_type: 'refunds',
    p_stripe_account_id: account.id,
    p_payment_provider: 'airwallex',
    p_status: 'in_progress'
  });
  const refunds = await fetchAirwallexRefunds(accessToken);
  for (const refund of refunds){
    await supabase.from('stripe_refunds').upsert({
      id: refund.id,
      stripe_account_id: account.id,
      payment_provider: 'airwallex',
      charge: `ch_${refund.payment_intent_id}`,
      payment_intent: refund.payment_intent_id,
      amount: Math.round(parseFloat(refund.amount) * 100),
      currency: refund.currency,
      status: refund.status === 'RECEIVED' ? 'succeeded' : 'pending',
      reason: refund.reason,
      receipt_number: null,
      metadata: refund.metadata || {},
      created: new Date(refund.created_at).getTime() / 1000,
      updated: new Date(refund.updated_at).getTime() / 1000,
      synced_at: new Date().toISOString()
    });
    results.refunds++;
  }
  await supabase.rpc('update_sync_status_for_account', {
    p_object_type: 'refunds',
    p_stripe_account_id: account.id,
    p_payment_provider: 'airwallex',
    p_status: 'completed',
    p_total_synced: results.refunds
  });
  return results;
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
 * Fetch Airwallex customers
 */ async function fetchAirwallexCustomers(token) {
  const customers = [];
  let page = 0;
  const pageSize = 100;
  while(true){
    const response = await fetch(`https://api.airwallex.com/api/v1/pa/customers?page_num=${page}&page_size=${pageSize}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('Failed to fetch customers:', response.statusText);
      break;
    }
    const data = await response.json();
    if (!data.items || data.items.length === 0) break;
    customers.push(...data.items);
    if (!data.has_more) break;
    page++;
  }
  return customers;
}
/**
 * Fetch Airwallex payment intents
 */ async function fetchAirwallexPaymentIntents(token) {
  const intents = [];
  let page = 0;
  const pageSize = 100;
  while(true){
    const response = await fetch(`https://api.airwallex.com/api/v1/pa/payment_intents?page_num=${page}&page_size=${pageSize}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('Failed to fetch payment intents:', response.statusText);
      break;
    }
    const data = await response.json();
    if (!data.items || data.items.length === 0) break;
    intents.push(...data.items);
    if (!data.has_more) break;
    page++;
  }
  return intents;
}
/**
 * Fetch Airwallex refunds
 */ async function fetchAirwallexRefunds(token) {
  const refunds = [];
  let page = 0;
  const pageSize = 100;
  while(true){
    const response = await fetch(`https://api.airwallex.com/api/v1/pa/refunds?page_num=${page}&page_size=${pageSize}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('Failed to fetch refunds:', response.statusText);
      break;
    }
    const data = await response.json();
    if (!data.items || data.items.length === 0) break;
    refunds.push(...data.items);
    if (!data.has_more) break;
    page++;
  }
  return refunds;
}
/**
 * Map Airwallex status to Stripe-compatible status
 */ function mapAirwallexStatus(airwallexStatus) {
  const statusMap = {
    'REQUIRES_PAYMENT_METHOD': 'requires_payment_method',
    'REQUIRES_CUSTOMER_ACTION': 'requires_action',
    'REQUIRES_CAPTURE': 'requires_capture',
    'SUCCEEDED': 'succeeded',
    'CANCELLED': 'canceled'
  };
  return statusMap[airwallexStatus] || airwallexStatus.toLowerCase();
}
