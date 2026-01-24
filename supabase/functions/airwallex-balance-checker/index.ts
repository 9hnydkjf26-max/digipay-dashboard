// Airwallex Balance Checker Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Verify user authentication
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    console.log(`User ${user.email} checking Airwallex balances`);

    // Log outbound IP for debugging
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      console.log(`Outbound IP (seen by Airwallex): ${ipData.ip}`);
    } catch (e) {
      console.log('Could not fetch outbound IP');
    }
    // Parse request body
    const { account_id } = await req.json().catch(()=>({}));
    // Discover Airwallex accounts from payment_accounts table
    const airwallexAccounts = await discoverAirwallexAccounts(supabaseClient);
    if (airwallexAccounts.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        balances: [],
        message: 'No Airwallex accounts configured'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    // If specific account requested, filter to that account
    let accountsToCheck = airwallexAccounts;
    if (account_id) {
      accountsToCheck = airwallexAccounts.filter((acc)=>acc.id === account_id);
      if (accountsToCheck.length === 0) {
        throw new Error(`Airwallex account ${account_id} not found`);
      }
    }
    // Fetch balances for each account
    const balances = [];
    const errors = [];
    for (const account of accountsToCheck){
      try {
        console.log(`Fetching balance for Airwallex account: ${account.id}`);
        const balance = await getAirwallexBalance(account);
        balances.push(balance);
      } catch (error) {
        console.error(`Error fetching balance for ${account.id}:`, error);
        errors.push({
          account_id: account.id,
          error: error.message
        });
      }
    }
    return new Response(JSON.stringify({
      success: true,
      balances,
      errors: errors.length > 0 ? errors : undefined,
      total_accounts: accountsToCheck.length,
      successful: balances.length,
      failed: errors.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
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
 * Discover Airwallex accounts from payment_accounts table
 */ async function discoverAirwallexAccounts(supabaseClient) {
  const accounts = [];
  // Query payment_accounts table for Airwallex accounts
  const { data: paymentAccounts, error } = await supabaseClient.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('payment_provider', 'airwallex').eq('is_active', true);
  if (error) {
    console.error('Error fetching payment accounts:', error);
    return accounts;
  }
  if (!paymentAccounts || paymentAccounts.length === 0) {
    console.log('No Airwallex accounts found in payment_accounts table');
    return accounts;
  }
  // Process each account
  for (const account of paymentAccounts){
    if (!account.secret_key_name) {
      console.warn(`Account ${account.account_id} has no secret_key_name configured`);
      continue;
    }
    // Construct secret names
    // secret_key_name is stored as AIRWALLEX_ACCOUNT_N_KEY
    // We need both _KEY (Client ID) and _SECRET (API Key)
    const clientIdSecretName = account.secret_key_name; // e.g., AIRWALLEX_ACCOUNT_1_KEY
    const apiKeySecretName = account.secret_key_name.replace('_KEY', '_SECRET'); // e.g., AIRWALLEX_ACCOUNT_1_SECRET
    console.log(`Looking for secrets: ${clientIdSecretName} and ${apiKeySecretName}`);
    const clientId = Deno.env.get(clientIdSecretName);
    const apiKey = Deno.env.get(apiKeySecretName);
    if (!clientId) {
      console.warn(`Secret not found: ${clientIdSecretName}`);
      continue;
    }
    if (!apiKey) {
      console.warn(`Secret not found: ${apiKeySecretName}`);
      continue;
    }
    console.log(`✅ Found Airwallex account: ${account.account_name || account.account_id}`);
    accounts.push({
      apiKey: clientId,
      apiSecret: apiKey,
      id: account.account_id,
      name: account.account_name
    });
  }
  return accounts;
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
    const errorText = await response.text();
    throw new Error(`Airwallex authentication failed: ${response.statusText} - ${errorText}`);
  }
  const data = await response.json();
  return data.token;
}
/**
 * Get balance for a single Airwallex account
 */ async function getAirwallexBalance(account) {
  // Authenticate
  const token = await getAirwallexToken(account.apiKey, account.apiSecret);
  // Fetch balances from Airwallex API
  // Use /balances/current endpoint for account balances
  const response = await fetch('https://api.airwallex.com/api/v1/balances/current', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch balances: ${response.statusText} - ${errorText}`);
  }
  const data = await response.json();
  // Log the raw response to see the actual structure
  console.log('Airwallex balance response:', JSON.stringify(data, null, 2));
  // Airwallex returns an array of balances by currency directly
  // Not wrapped in an items property
  const balances = Array.isArray(data) ? data : data.items || [];
  console.log(`Found ${balances.length} currency balances`);
  // Calculate totals by currency
  const balancesByCurrency = balances.map((bal)=>({
      currency: bal.currency,
      available: parseFloat(bal.available_amount || '0'),
      pending: parseFloat(bal.pending_amount || '0'),
      total: parseFloat(bal.total_amount || '0')
    }));
  console.log('Parsed balances by currency:', JSON.stringify(balancesByCurrency.filter((b)=>b.total > 0), null, 2));
  // Find primary balance (CAD preferred, or first in list)
  const primaryBalance = balancesByCurrency.find((b)=>b.currency === 'CAD') || balancesByCurrency[0] || {
    currency: 'CAD',
    available: 0,
    pending: 0,
    total: 0
  };
  console.log('Primary balance selected:', JSON.stringify(primaryBalance, null, 2));
  return {
    account_id: account.id,
    account_name: account.name || account.id,
    payment_provider: 'airwallex',
    primary_currency: primaryBalance.currency,
    available_balance: primaryBalance.available,
    pending_balance: primaryBalance.pending,
    total_balance: primaryBalance.total,
    balances_by_currency: balancesByCurrency,
    retrieved_at: new Date().toISOString()
  };
}
