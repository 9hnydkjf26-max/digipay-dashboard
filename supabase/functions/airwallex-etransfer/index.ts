// Edge Function: airwallex-etransfer
// Clean version following Airwallex API documentation exactly
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
    const { account_id, recipient_email, amount, recipient_name, security_question, security_answer, message, currency = 'CAD', beneficiary_id, save_as_contact = false } = await req.json();
    // Validate required fields
    if (!account_id || !amount) {
      throw new Error('Missing required fields: account_id and amount');
    }
    // Either beneficiary_id OR recipient_email must be provided
    if (!beneficiary_id && !recipient_email) {
      throw new Error('Either beneficiary_id or recipient_email is required');
    }
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    // Security question/answer required if not using existing beneficiary
    if (!beneficiary_id && (!security_question || !security_answer)) {
      throw new Error('Security question and answer required for new recipients');
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
    const clientIdSecretName = account.secret_key_name;
    const apiKeySecretName = account.secret_key_name.replace('_KEY', '_SECRET');
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
    let beneficiaryIdToUse = beneficiary_id;
    let createdNewBeneficiary = false;
    let beneficiaryDetails = null;
    // If using an existing beneficiary, fetch its details first to understand its structure
    if (beneficiary_id) {
      console.log(`Fetching beneficiary details for: ${beneficiary_id}`);
      const beneficiaryResponse = await fetch(`https://api.airwallex.com/api/v1/beneficiaries/${beneficiary_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (beneficiaryResponse.ok) {
        beneficiaryDetails = await beneficiaryResponse.json();
        console.log('Beneficiary details:', JSON.stringify(beneficiaryDetails, null, 2));
      } else {
        const errorText = await beneficiaryResponse.text();
        console.warn(`Failed to fetch beneficiary details: ${errorText}`);
      }
    }
    // If save_as_contact is true and no beneficiary_id provided, create a new beneficiary
    if (save_as_contact && !beneficiary_id && recipient_email) {
      console.log(`Creating new beneficiary: ${recipient_email}`);
      const firstName = recipient_name ? recipient_name.split(' ')[0] : 'Recipient';
      const lastName = recipient_name ? recipient_name.split(' ').slice(1).join(' ') || 'User' : 'User';
      const createBeneficiaryPayload = {
        email: recipient_email,
        first_name: firstName,
        last_name: lastName,
        nickname: recipient_name || `${firstName} ${lastName}`,
        entity_type: 'PERSONAL',
        address: {
          country_code: 'CA'
        },
        payment_methods: [
          'INTERAC'
        ]
      };
      const createBeneficiaryResponse = await fetch('https://api.airwallex.com/api/v1/beneficiaries/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createBeneficiaryPayload)
      });
      if (createBeneficiaryResponse.ok) {
        const beneficiaryData = await createBeneficiaryResponse.json();
        beneficiaryIdToUse = beneficiaryData.id;
        createdNewBeneficiary = true;
        console.log(`Beneficiary created with ID: ${beneficiaryIdToUse}`);
      } else {
        const errorText = await createBeneficiaryResponse.text();
        console.warn(`Failed to create beneficiary: ${errorText}`);
      // Continue anyway - we'll use email directly in payout
      }
    }
    // Create transfer via Airwallex Transfers API
    const currencyUpper = currency.toUpperCase();
    console.log(`Creating transfer with currency: ${currencyUpper}, amount: ${amount}`);
    const amountFloat = parseFloat(amount);
    // Build transfer payload - clean version per Airwallex documentation
    const transferPayload = {
      request_id: `etransfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source_currency: currencyUpper,
      transfer_currency: currencyUpper,
      transfer_method: 'LOCAL',
      transfer_amount: String(amountFloat.toFixed(2)),
      reference: message || `e-Transfer from ${account.account_name || account_id}`,
      reason: 'payment'
    };
    // Use beneficiary_id if available, otherwise provide inline beneficiary
    if (beneficiaryIdToUse) {
      transferPayload.beneficiary_id = beneficiaryIdToUse;
      // Log beneficiary details for debugging
      if (beneficiaryDetails) {
        console.log('Using existing beneficiary:', beneficiaryIdToUse);
        console.log('Beneficiary payment_methods:', beneficiaryDetails.payment_methods);
        const beneficiary = beneficiaryDetails.beneficiary || {};
        const bankDetails = beneficiary.bank_details || {};
        console.log('Beneficiary email:', beneficiary.additional_info?.personal_email);
        console.log('Beneficiary bank_details:', JSON.stringify(bankDetails, null, 2));
      }
    } else {
      // For new recipient without saved beneficiary - provide inline beneficiary
      transferPayload.beneficiary = {
        email: recipient_email,
        first_name: recipient_name ? recipient_name.split(' ')[0] : 'Recipient',
        last_name: recipient_name ? recipient_name.split(' ').slice(1).join(' ') || 'User' : 'User',
        entity_type: 'PERSONAL',
        address: {
          country_code: 'CA'
        },
        bank_details: {
          local_clearing_system: 'INTERAC',
          account_routing_type1: 'email',
          account_routing_value1: recipient_email
        }
      };
    }
    console.log('Creating Airwallex transfer:', JSON.stringify(transferPayload, null, 2));
    console.log('Calling endpoint: https://api.airwallex.com/api/v1/transfers/create');
    // Call Airwallex Transfers API
    const transferResponse = await fetch('https://api.airwallex.com/api/v1/transfers/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transferPayload)
    });
    if (!transferResponse.ok) {
      const errorText = await transferResponse.text();
      console.error('Transfer API error:');
      console.error('  Status:', transferResponse.status);
      console.error('  Status Text:', transferResponse.statusText);
      console.error('  Response:', errorText);
      // Try to parse as JSON for better error message
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch  {
        errorDetails = errorText;
      }
      throw new Error(`Failed to create transfer (${transferResponse.status}): ${JSON.stringify(errorDetails)}`);
    }
    const transferData = await transferResponse.json();
    console.log('Transfer created:', JSON.stringify(transferData, null, 2));
    // Log the e-Transfer in audit log
    await supabaseClient.from('etransfer_audit_log').insert({
      account_id: account_id,
      recipient_email: recipient_email || 'via_beneficiary',
      amount: amount,
      currency: currency,
      payout_id: transferData.id,
      status: transferData.status || 'PENDING',
      created_by: user.id,
      details: {
        recipient_name,
        message,
        beneficiary_id: beneficiaryIdToUse,
        created_new_beneficiary: createdNewBeneficiary,
        transfer_data: transferData
      }
    });
    return new Response(JSON.stringify({
      success: true,
      transfer_id: transferData.id,
      status: transferData.status,
      beneficiary_id: beneficiaryIdToUse,
      created_new_beneficiary: createdNewBeneficiary,
      message: createdNewBeneficiary ? 'e-Transfer initiated and contact saved successfully' : 'e-Transfer initiated successfully'
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
