// Edge Function: airwallex-beneficiaries
// Matches airwallex-balance-checker pattern exactly
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
    // Get Supabase client - EXACT SAME as airwallex-balance-checker
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Verify user authentication - EXACT SAME as airwallex-balance-checker
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    console.log(`User ${user.email} requesting beneficiaries`);
    // Parse request body
    const { action, account_id } = await req.json();
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
    if (action === 'list') {
      // Fetch beneficiaries
      const response = await fetch('https://api.airwallex.com/api/v1/beneficiaries?page_num=0&page_size=100', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch beneficiaries: ${errorText}`);
      }
      const data = await response.json();
      const beneficiaries = data.items || [];
      // Log first beneficiary structure
      if (beneficiaries.length > 0) {
        console.log('First beneficiary:', JSON.stringify(beneficiaries[0], null, 2));
      }
      // Return complete beneficiary objects
      return new Response(JSON.stringify({
        success: true,
        beneficiaries: beneficiaries
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    throw new Error('Invalid action');
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
