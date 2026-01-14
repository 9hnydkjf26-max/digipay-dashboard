// Supabase Edge Function: site-limits
// ===========================================
// This endpoint returns transaction limits for a given site_id.
// The WordPress plugin fetches these limits and caches them for 5 minutes.
//
// Deploy: supabase functions deploy site-limits
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/site-limits
//
// Example call: GET /functions/v1/site-limits?site_id=5809
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, must-revalidate'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: corsHeaders
    });
  }
  try {
    // Get site_id from query string
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id')?.trim();
    if (!siteId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing site_id parameter'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    // Sanitize site_id (alphanumeric and underscores only)
    const sanitizedSiteId = siteId.replace(/[^a-zA-Z0-9_-]/g, '');
    // Create Supabase client with service role key for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Fetch site limits from site_pricing table
    const { data: site, error } = await supabase.from('site_pricing').select('site_id, site_name, daily_limit, max_ticket_size, gateway_status, updated_at').eq('site_id', sanitizedSiteId).single();
    if (error || !site) {
      // Site not found - return default (no limits)
      // This allows new sites to work before being configured
      return new Response(JSON.stringify({
        success: true,
        site_id: sanitizedSiteId,
        daily_limit: 0,
        max_ticket_size: 0,
        status: 'active',
        message: 'Site not configured - no limits applied'
      }), {
        status: 200,
        headers: corsHeaders
      });
    }
    // Check if site is suspended/disabled
    if (site.gateway_status !== 'active') {
      return new Response(JSON.stringify({
        success: true,
        site_id: site.site_id,
        site_name: site.site_name,
        daily_limit: 0.01,
        max_ticket_size: 0.01,
        status: site.gateway_status,
        message: `Site is ${site.gateway_status}`
      }), {
        status: 200,
        headers: corsHeaders
      });
    }
    // Return the limits for active site
    return new Response(JSON.stringify({
      success: true,
      site_id: site.site_id,
      site_name: site.site_name,
      daily_limit: parseFloat(site.daily_limit) || 0,
      max_ticket_size: parseFloat(site.max_ticket_size) || 0,
      status: site.gateway_status || 'active',
      updated_at: site.updated_at
    }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    console.error('Site limits API error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
