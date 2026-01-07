// manage-secrets Edge Function
// Manages Supabase secrets (environment variables) for Edge Functions
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
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    // Create Supabase client with the user's token
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    // Check if user is admin
    const userRole = user.user_metadata?.role || user.app_metadata?.role;
    if (userRole !== 'admin') {
      throw new Error('Admin access required');
    }
    // Parse request body
    const { action, name, value, description } = await req.json();
    // Validate action
    const validActions = [
      'list',
      'set',
      'delete'
    ];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
    }
    // Validate secret name prefix - only allow STRIPE_ or AIRWALLEX_ secrets
    if (action !== 'list' && name) {
      const hasValidPrefix = name.startsWith('STRIPE_') || name.startsWith('AIRWALLEX_');
      if (!hasValidPrefix) {
        throw new Error('Secret name must start with STRIPE_ or AIRWALLEX_');
      }
    }
    // Get Supabase Management API credentials
    const supabaseProjectRef = Deno.env.get('PROJECT_REF');
    const supabaseAccessToken = Deno.env.get('MANAGEMENT_API_TOKEN');
    if (!supabaseProjectRef || !supabaseAccessToken) {
      throw new Error('Missing Management API credentials');
    }
    const managementApiUrl = `https://api.supabase.com/v1/projects/${supabaseProjectRef}/secrets`;
    let result;
    switch(action){
      case 'list':
        {
          // List all secrets
          const response = await fetch(managementApiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${supabaseAccessToken}`,
              'Content-Type': 'application/json'
            }
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to list secrets: ${errorText}`);
          }
          const secrets = await response.json();
          // Filter to only return STRIPE_ and AIRWALLEX_ prefixed secrets
          const filteredSecrets = secrets.filter((s)=>s.name.startsWith('STRIPE_') || s.name.startsWith('AIRWALLEX_'));
          // Return list of secret names (values are never returned for security)
          result = {
            success: true,
            secrets: filteredSecrets.map((s)=>({
                name: s.name,
                description: description || null
              }))
          };
          break;
        }
      case 'set':
        {
          // Validate inputs
          if (!name || !value) {
            throw new Error('Missing required fields: name and value');
          }
          // Validate secret name format
          // Allowed formats:
          // - STRIPE_ACCOUNT_N_KEY (API keys)
          // - STRIPE_ACCOUNT_N_SECRET (for future use)
          // - STRIPE_WEBHOOK_N_SECRET (webhook signing secrets)
          // - AIRWALLEX_ACCOUNT_N_KEY (client ID)
          // - AIRWALLEX_ACCOUNT_N_SECRET (API key)
          const validPatterns = [
            /^STRIPE_ACCOUNT_[0-9]+_KEY$/,
            /^STRIPE_ACCOUNT_[0-9]+_SECRET$/,
            /^STRIPE_WEBHOOK_[0-9]+_SECRET$/,
            /^AIRWALLEX_ACCOUNT_[0-9]+_KEY$/,
            /^AIRWALLEX_ACCOUNT_[0-9]+_SECRET$/
          ];
          const isValidName = validPatterns.some((pattern)=>pattern.test(name));
          if (!isValidName) {
            throw new Error('Secret name must follow format: PROCESSOR_ACCOUNT_N_KEY, PROCESSOR_ACCOUNT_N_SECRET, or STRIPE_WEBHOOK_N_SECRET');
          }
          // Set/update secret
          const response = await fetch(managementApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify([
              {
                name,
                value
              }
            ])
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to set secret: ${errorText}`);
          }
          // Log audit entry
          await supabaseClient.from('secret_audit_log').insert({
            secret_name: name,
            action: 'SET',
            details: description || `Secret ${name} created/updated`,
            created_by: user.id
          });
          result = {
            success: true,
            message: `Secret ${name} has been set`
          };
          break;
        }
      case 'delete':
        {
          // Validate inputs
          if (!name) {
            throw new Error('Missing required field: name');
          }
          // Delete secret - API expects array of names in body
          const response = await fetch(managementApiUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${supabaseAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify([
              name
            ])
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete secret: ${errorText}`);
          }
          // Log audit entry
          await supabaseClient.from('secret_audit_log').insert({
            secret_name: name,
            action: 'DELETE',
            details: `Secret ${name} deleted`,
            created_by: user.id
          });
          result = {
            success: true,
            message: `Secret ${name} has been deleted`
          };
          break;
        }
      default:
        throw new Error('Invalid action');
    }
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in manage-secrets function:', error);
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
