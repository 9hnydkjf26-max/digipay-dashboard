// Edge Function: airwallex-wallet-transactions
// Matches airwallex-beneficiaries pattern exactly
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Transaction types to exclude (card payments)
const EXCLUDED_TYPES = [
  'payment_acceptance',
  'payment_capture',
  'payment_refund',
  'payment_chargeback',
  'payment_fee',
  'payment_attempt',
  'authorization'
];
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Get Supabase client - EXACT SAME as airwallex-beneficiaries
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Verify user authentication - EXACT SAME as airwallex-beneficiaries
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    console.log(`User ${user.email} requesting wallet transactions`);
    // Parse request body
    const { account_id, page_num = 0, page_size = 100 } = await req.json();
    if (!account_id) {
      throw new Error('account_id is required');
    }
    // Get account from database
    const { data: account, error: accountError } = await supabaseClient.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('account_id', account_id).eq('payment_provider', 'airwallex').eq('is_active', true).single();
    if (accountError || !account) {
      throw new Error(`Airwallex account ${account_id} not found`);
    }
    if (!account.secret_key_name) {
      throw new Error('Account has no API credentials configured');
    }
    const clientIdSecretName = account.secret_key_name;
    const apiKeySecretName = account.secret_key_name.replace('_KEY', '_SECRET');
    const clientId = Deno.env.get(clientIdSecretName);
    const apiKey = Deno.env.get(apiKeySecretName);
    if (!clientId || !apiKey) {
      throw new Error('API credentials not found');
    }
    // Authenticate with Airwallex
    const authResponse = await fetch('https://api.airwallex.com/api/v1/authentication/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey
      }
    });
    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Airwallex authentication failed: ${errorText}`);
    }
    const authData = await authResponse.json();
    const token = authData.token;
    // Fetch more transactions to account for filtering
    const response = await fetch(`https://api.airwallex.com/api/v1/financial_transactions?page_num=${page_num}&page_size=${page_size}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch transactions: ${errorText}`);
    }
    const data = await response.json();
    // Log first transaction to see structure
    if (data.items && data.items.length > 0) {
      console.log('Sample transaction structure:', JSON.stringify(data.items[0], null, 2));
      console.log('Transaction keys:', Object.keys(data.items[0]));
    }
    // Filter out card payment transactions and zero amounts
    const walletTransactions = (data.items || []).filter((tx)=>{
      const txType = (tx.transaction_type || tx.type || '').toLowerCase();
      const amount = parseFloat(tx.amount) || 0;
      // Exclude card payment types
      if (EXCLUDED_TYPES.some((excluded)=>txType.includes(excluded))) {
        return false;
      }
      // Exclude zero amount transactions
      if (amount === 0) {
        return false;
      }
      return true;
    });
    console.log(`Found ${data.items?.length || 0} total, ${walletTransactions.length} wallet transactions after filtering`);
    return new Response(JSON.stringify({
      success: true,
      transactions: walletTransactions,
      has_more: data.has_more || false,
      page_num: page_num,
      page_size: page_size
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
