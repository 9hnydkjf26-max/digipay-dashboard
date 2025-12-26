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
    // Verify user authentication and admin role
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    const userRole = user.user_metadata?.role || user.app_metadata?.role;
    if (userRole !== 'admin') {
      throw new Error('Admin access required');
    }
    console.log(`Admin ${user.email} initiating Interac e-Transfer`);
    // Parse request body
    const { account_id, recipient_email, amount, recipient_name, security_question, security_answer, message, currency = 'CAD' } = await req.json();
    // Validate required fields
    if (!account_id || !recipient_email || !amount || !security_question || !security_answer) {
      throw new Error('Missing required fields');
    }
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    // Get account details from payment_accounts
    const { data: account, error: accountError } = await supabaseClient.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('account_id', account_id).eq('payment_provider', 'airwallex').eq('is_active', true).single();
    if (accountError || !account) {
      throw new Error(`Airwallex account ${account_id} not found`);
    }
    if (!account.secret_key_name) {
      throw new Error('Account has no API credentials configured');
    }
    // Construct secret names
    const clientIdSecretName = account.secret_key_name; // AIRWALLEX_ACCOUNT_N_KEY
    const apiKeySecretName = account.secret_key_name.replace('_KEY', '_SECRET'); // AIRWALLEX_ACCOUNT_N_SECRET
    const clientId = Deno.env.get(clientIdSecretName);
    const apiKey = Deno.env.get(apiKeySecretName);
    if (!clientId || !apiKey) {
      throw new Error('API credentials not found in secrets');
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
    // Create payout via Airwallex
    // Note: Airwallex uses their payout API for Interac e-Transfers
    const payoutPayload = {
      request_id: `etransfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source_currency: currency,
      source_amount: amount,
      beneficiary: {
        email: recipient_email,
        first_name: recipient_name ? recipient_name.split(' ')[0] : 'Recipient',
        last_name: recipient_name ? recipient_name.split(' ').slice(1).join(' ') || 'User' : 'User',
        entity_type: 'PERSONAL',
        address: {
          country_code: 'CA'
        }
      },
      payment_method: {
        type: 'INTERAC',
        interac: {
          security_question: security_question,
          security_answer: security_answer
        }
      },
      description: message || `e-Transfer from ${account.account_name || account_id}`
    };
    console.log('Creating Airwallex payout:', JSON.stringify(payoutPayload, null, 2));
    const payoutResponse = await fetch('https://api.airwallex.com/api/v1/payouts/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payoutPayload)
    });
    if (!payoutResponse.ok) {
      const errorText = await payoutResponse.text();
      console.error('Payout error response:', errorText);
      throw new Error(`Failed to create payout: ${errorText}`);
    }
    const payoutData = await payoutResponse.json();
    console.log('Payout created:', JSON.stringify(payoutData, null, 2));
    // Log the e-Transfer in audit log
    await supabaseClient.from('etransfer_audit_log').insert({
      account_id: account_id,
      recipient_email: recipient_email,
      amount: amount,
      currency: currency,
      payout_id: payoutData.id,
      status: payoutData.status || 'PENDING',
      created_by: user.id,
      details: {
        recipient_name,
        message,
        payout_data: payoutData
      }
    });
    return new Response(JSON.stringify({
      success: true,
      payout_id: payoutData.id,
      status: payoutData.status,
      message: 'e-Transfer initiated successfully'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('e-Transfer error:', error);
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
