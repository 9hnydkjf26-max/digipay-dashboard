import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    // Parse request body
    const body = await req.json();
    const { action, account_id, ...paymentLinkData } = body;
    // Handle different actions
    if (action === 'list_accounts') {
      // Get all Airwallex accounts the user has access to
      const { data: accounts, error: accountsError } = await supabaseClient.from('payment_accounts').select('account_id, account_name, environment').eq('payment_provider', 'airwallex').eq('is_active', true);
      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }
      return new Response(JSON.stringify({
        success: true,
        accounts
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    if (action === 'create') {
      // Validate required fields for creating payment link
      if (!account_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Account ID is required'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
      if (!paymentLinkData.title) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Title is required'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
      // Get account credentials
      const { data: account, error: accountError } = await supabaseClient.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('account_id', account_id).eq('payment_provider', 'airwallex').eq('is_active', true).single();
      if (accountError || !account) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Account not found or access denied'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 404
        });
      }
      // Get Airwallex credentials from secrets
      const clientIdSecretName = account.secret_key_name;
      const apiKeySecretName = account.secret_key_name.replace('_KEY', '_SECRET');
      const clientId = Deno.env.get(clientIdSecretName);
      const apiKey = Deno.env.get(apiKeySecretName);
      if (!clientId || !apiKey) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Airwallex credentials not configured for this account'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 500
        });
      }
      // Get Airwallex access token
      const accessToken = await getAirwallexToken(clientId, apiKey);
      // Build payment link request
      const paymentLinkRequest = buildPaymentLinkRequest(paymentLinkData);
      // Create payment link
      const paymentLink = await createAirwallexPaymentLink(accessToken, paymentLinkRequest);
      // Log the creation for audit
      await supabaseClient.from('secret_audit_log').insert({
        user_id: user.id,
        user_email: user.email,
        action: 'create_payment_link',
        secret_name: account.account_name || account_id,
        new_value: `Payment link created: ${paymentLink.id}`
      });
      return new Response(JSON.stringify({
        success: true,
        payment_link: {
          id: paymentLink.id,
          url: paymentLink.url,
          title: paymentLink.title,
          amount: paymentLink.amount,
          currency: paymentLink.currency,
          status: paymentLink.status,
          reusable: paymentLink.reusable,
          created_at: paymentLink.created_at
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    if (action === 'list_links') {
      // Get account credentials
      const { data: account, error: accountError } = await supabaseClient.from('payment_accounts').select('account_id, account_name, secret_key_name').eq('account_id', account_id).eq('payment_provider', 'airwallex').eq('is_active', true).single();
      if (accountError || !account) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Account not found'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 404
        });
      }
      const clientId = Deno.env.get(account.secret_key_name);
      const apiKey = Deno.env.get(account.secret_key_name.replace('_KEY', '_SECRET'));
      if (!clientId || !apiKey) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Credentials not configured'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 500
        });
      }
      const accessToken = await getAirwallexToken(clientId, apiKey);
      const links = await listAirwallexPaymentLinks(accessToken);
      return new Response(JSON.stringify({
        success: true,
        payment_links: links
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action. Use: list_accounts, create, or list_links'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
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
      status: 500
    });
  }
});
/**
 * Get Airwallex access token
 */ async function getAirwallexToken(clientId, apiKey) {
  const response = await fetch('https://api.airwallex.com/api/v1/authentication/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': clientId,
      'x-api-key': apiKey
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airwallex authentication failed: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  return data.token;
}
/**
 * Build payment link request body
 */ function buildPaymentLinkRequest(data) {
  const request = {
    title: data.title,
    reusable: data.reusable ?? false
  };
  // Fixed amount payment link
  if (data.amount && data.currency) {
    request.amount = parseFloat(data.amount);
    request.currency = data.currency.toUpperCase();
  } else if (data.supported_currencies) {
    request.supported_currencies = data.supported_currencies;
    request.default_currency = data.default_currency || data.supported_currencies[0];
  } else if (!data.amount) {
    request.supported_currencies = [
      'CAD',
      'USD'
    ];
    request.default_currency = 'CAD';
  }
  // Optional fields
  if (data.description) {
    request.description = data.description;
  }
  if (data.expires_at) {
    request.expires_at = data.expires_at;
  }
  if (data.customer_id) {
    request.customer_id = data.customer_id;
  }
  if (data.reference) {
    request.reference = data.reference;
  }
  // Collect additional shopper info
  if (data.collect_phone || data.collect_shipping || data.collect_message || data.collect_reference) {
    request.collectable_shopper_info = {};
    if (data.collect_phone) request.collectable_shopper_info.phone_number = true;
    if (data.collect_shipping) request.collectable_shopper_info.shipping_address = true;
    if (data.collect_message) request.collectable_shopper_info.message = true;
    if (data.collect_reference) request.collectable_shopper_info.reference = true;
  }
  // Metadata
  if (data.metadata) {
    request.metadata = data.metadata;
  }
  return request;
}
/**
 * Create Airwallex payment link
 */ async function createAirwallexPaymentLink(accessToken, request) {
  const response = await fetch('https://api.airwallex.com/api/v1/pa/payment_links/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const errorData = await response.json().catch(()=>({}));
    throw new Error(errorData.message || errorData.error || `Failed to create payment link: ${response.status}`);
  }
  return await response.json();
}
/**
 * List Airwallex payment links
 */ async function listAirwallexPaymentLinks(accessToken) {
  const links = [];
  let page = 0;
  const pageSize = 50;
  while(true){
    const response = await fetch(`https://api.airwallex.com/api/v1/pa/payment_links?page_num=${page}&page_size=${pageSize}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('Failed to fetch payment links:', response.statusText);
      break;
    }
    const data = await response.json();
    if (!data.items || data.items.length === 0) break;
    links.push(...data.items);
    if (!data.has_more) break;
    page++;
  }
  return links;
}
