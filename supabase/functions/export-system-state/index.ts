// Edge Function: export-system-state
// Returns complete system configuration and current state as JSON
// Use this to quickly export your Supabase setup to Claude Projects
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
    console.log('=== Exporting System State ===');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get URL parameters
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'json'; // json or markdown
    // Collect all system information
    const systemState = {
      export_timestamp: new Date().toISOString(),
      supabase_project: supabaseUrl,
      // Database counts
      data_counts: await getDataCounts(supabase),
      // Sync status
      sync_status: await getSyncStatus(supabase),
      // Payment accounts
      accounts: await getAccounts(supabase),
      // Table structure
      tables: await getTables(supabase),
      // Views
      views: await getViews(supabase),
      // RLS policies
      rls_policies: await getRLSPolicies(supabase),
      // Cron jobs
      cron_jobs: await getCronJobs(supabase),
      // Configured secrets (names only, not values!)
      configured_secrets: getConfiguredSecrets(),
      // System health
      health: await getSystemHealth(supabase)
    };
    // Format response
    if (format === 'markdown') {
      const markdown = generateMarkdown(systemState);
      return new Response(markdown, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/markdown',
          'Content-Disposition': 'attachment; filename="supabase-export.md"'
        }
      });
    } else {
      return new Response(JSON.stringify(systemState, null, 2), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="supabase-export.json"'
        }
      });
    }
  } catch (error) {
    console.error('Export error:', error);
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
 * Get data counts from all tables
 */ async function getDataCounts(supabase) {
  const counts = {};
  const tables = [
    'stripe_customers',
    'stripe_products',
    'stripe_prices',
    'stripe_subscriptions',
    'stripe_payment_intents',
    'stripe_charges',
    'stripe_invoices',
    'stripe_refunds',
    'stripe_disputes'
  ];
  for (const table of tables){
    // Get total count
    const { count: total } = await supabase.from(table).select('*', {
      count: 'exact',
      head: true
    });
    // Get count by provider
    const { data: byProvider } = await supabase.from(table).select('payment_provider, stripe_account_id').then((res)=>{
      const grouped = {};
      res.data?.forEach((row)=>{
        const key = `${row.payment_provider}_${row.stripe_account_id}`;
        grouped[key] = (grouped[key] || 0) + 1;
      });
      return {
        data: grouped
      };
    });
    counts[table] = {
      total,
      by_provider_and_account: byProvider || {}
    };
  }
  return counts;
}
/**
 * Get sync status
 */ async function getSyncStatus(supabase) {
  const { data, error } = await supabase.from('stripe_sync_status').select('*').order('last_sync_at', {
    ascending: false
  });
  if (error) {
    console.error('Error fetching sync status:', error);
    return [];
  }
  return data;
}
/**
 * Get payment accounts
 */ async function getAccounts(supabase) {
  const { data, error } = await supabase.from('payment_accounts').select('*').order('payment_provider', {
    ascending: true
  });
  if (error) {
    console.error('Error fetching accounts:', error);
    return [];
  }
  return data;
}
/**
 * Get table structures
 */ async function getTables(supabase) {
  const { data, error } = await supabase.rpc('get_table_structure', {});
  // If RPC doesn't exist, use direct query
  if (error) {
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name LIKE 'stripe_%' 
             OR table_name IN ('payment_accounts', 'user_stripe_accounts'))
      ORDER BY table_name, ordinal_position;
    `;
    const { data: rawData } = await supabase.rpc('exec_sql', {
      query
    });
    // Group by table
    const tables = {};
    rawData?.forEach((row)=>{
      if (!tables[row.table_name]) {
        tables[row.table_name] = {
          columns: []
        };
      }
      tables[row.table_name].columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      });
    });
    return tables;
  }
  return data;
}
/**
 * Get views
 */ async function getViews(supabase) {
  const views = [
    'all_customers',
    'all_charges',
    'revenue_by_provider',
    'stripe_customers_by_account',
    'stripe_revenue_by_account',
    'stripe_subscriptions_by_account'
  ];
  const viewInfo = {};
  for (const view of views){
    try {
      const { count } = await supabase.from(view).select('*', {
        count: 'exact',
        head: true
      });
      viewInfo[view] = {
        exists: true,
        record_count: count
      };
    } catch (error) {
      viewInfo[view] = {
        exists: false,
        error: error.message
      };
    }
  }
  return viewInfo;
}
/**
 * Get RLS policies
 */ async function getRLSPolicies(supabase) {
  // Note: This might fail if user doesn't have permissions
  // That's okay, we'll return empty array
  try {
    const { data } = await supabase.rpc('get_rls_policies', {});
    return data || [];
  } catch (error) {
    console.log('Could not fetch RLS policies (might need permissions)');
    return [];
  }
}
/**
 * Get cron jobs
 */ async function getCronJobs(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_cron_jobs', {});
    if (error) {
      // Try direct query
      const query = `
        SELECT 
          jobid,
          jobname,
          schedule,
          command,
          active,
          database
        FROM cron.job
        ORDER BY jobname;
      `;
      const { data: jobs } = await supabase.rpc('exec_sql', {
        query
      });
      return jobs || [];
    }
    return data || [];
  } catch (error) {
    console.log('Could not fetch cron jobs');
    return [];
  }
}
/**
 * Get configured secrets (names only!)
 */ function getConfiguredSecrets() {
  const secrets = {
    stripe_accounts: [],
    airwallex_accounts: [],
    supabase: []
  };
  // Check Stripe accounts
  for(let i = 1; i <= 10; i++){
    const key = Deno.env.get(`STRIPE_ACCOUNT_${i}_KEY`);
    const id = Deno.env.get(`STRIPE_ACCOUNT_${i}_ID`);
    const webhook = Deno.env.get(`STRIPE_WEBHOOK_${i}_SECRET`);
    if (key || id) {
      secrets.stripe_accounts.push({
        number: i,
        has_key: !!key,
        has_id: !!id,
        has_webhook: !!webhook,
        account_id: id || 'NOT_SET'
      });
    }
  }
  // Check legacy Stripe
  if (Deno.env.get('STRIPE_SECRET_KEY')) {
    secrets.stripe_accounts.push({
      number: 'legacy',
      has_key: true,
      has_id: false,
      has_webhook: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
      account_id: 'default'
    });
  }
  // Check Airwallex accounts
  for(let i = 1; i <= 10; i++){
    const key = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_KEY`);
    const secret = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_SECRET`);
    const id = Deno.env.get(`AIRWALLEX_ACCOUNT_${i}_ID`);
    if (key || secret || id) {
      secrets.airwallex_accounts.push({
        number: i,
        has_key: !!key,
        has_secret: !!secret,
        has_id: !!id,
        account_id: id || 'NOT_SET'
      });
    }
  }
  // Check legacy Airwallex
  if (Deno.env.get('AIRWALLEX_API_KEY')) {
    secrets.airwallex_accounts.push({
      number: 'legacy',
      has_key: true,
      has_secret: !!Deno.env.get('AIRWALLEX_API_SECRET'),
      has_id: false,
      account_id: 'default'
    });
  }
  // Supabase
  secrets.supabase = {
    has_url: !!Deno.env.get('SUPABASE_URL'),
    has_service_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  };
  return secrets;
}
/**
 * Get system health indicators
 */ async function getSystemHealth(supabase) {
  const health = {
    status: 'healthy',
    issues: [],
    warnings: []
  };
  // Check sync status
  const { data: syncData } = await supabase.from('stripe_sync_status').select('*').eq('status', 'failed');
  if (syncData && syncData.length > 0) {
    health.status = 'degraded';
    health.issues.push(`${syncData.length} sync job(s) in failed state`);
  }
  // Check for stale syncs (>48 hours)
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: staleData } = await supabase.from('stripe_sync_status').select('*').lt('last_sync_at', twoDaysAgo);
  if (staleData && staleData.length > 0) {
    health.warnings.push(`${staleData.length} sync job(s) haven't run in >48 hours`);
  }
  // Check for duplicate records (should be 0)
  const { data: duplicates } = await supabase.rpc('check_duplicates', {});
  if (duplicates && duplicates.length > 0) {
    health.status = 'error';
    health.issues.push('Duplicate records detected');
  }
  return health;
}
/**
 * Generate markdown format
 */ function generateMarkdown(state) {
  let md = `# Supabase System Export\n\n`;
  md += `**Exported:** ${state.export_timestamp}\n`;
  md += `**Project:** ${state.supabase_project}\n\n`;
  md += `## 📊 System Health\n\n`;
  md += `**Status:** ${state.health.status}\n\n`;
  if (state.health.issues.length > 0) {
    md += `**Issues:**\n`;
    state.health.issues.forEach((issue)=>md += `- ⚠️ ${issue}\n`);
    md += `\n`;
  }
  if (state.health.warnings.length > 0) {
    md += `**Warnings:**\n`;
    state.health.warnings.forEach((warning)=>md += `- ⚠️ ${warning}\n`);
    md += `\n`;
  }
  md += `## 💾 Data Counts\n\n`;
  Object.entries(state.data_counts).forEach(([table, counts])=>{
    md += `**${table}:** ${counts.total} records\n`;
  });
  md += `\n`;
  md += `## 🔄 Sync Status\n\n`;
  md += `| Object Type | Provider | Account | Status | Last Sync | Total |\n`;
  md += `|-------------|----------|---------|--------|-----------|-------|\n`;
  state.sync_status.forEach((sync)=>{
    md += `| ${sync.object_type} | ${sync.payment_provider} | ${sync.stripe_account_id} | ${sync.status} | ${sync.last_sync_at || 'Never'} | ${sync.total_synced || 0} |\n`;
  });
  md += `\n`;
  md += `## 🏦 Payment Accounts\n\n`;
  state.accounts.forEach((account)=>{
    md += `- **${account.payment_provider}** - ${account.account_id} (${account.environment})\n`;
  });
  md += `\n`;
  md += `## 🔑 Configured Secrets\n\n`;
  md += `**Stripe Accounts:** ${state.configured_secrets.stripe_accounts.length}\n`;
  state.configured_secrets.stripe_accounts.forEach((acc)=>{
    md += `- Account ${acc.number}: ${acc.account_id} (Key: ${acc.has_key ? '✓' : '✗'}, Webhook: ${acc.has_webhook ? '✓' : '✗'})\n`;
  });
  md += `\n**Airwallex Accounts:** ${state.configured_secrets.airwallex_accounts.length}\n`;
  state.configured_secrets.airwallex_accounts.forEach((acc)=>{
    md += `- Account ${acc.number}: ${acc.account_id} (Key: ${acc.has_key ? '✓' : '✗'}, Secret: ${acc.has_secret ? '✓' : '✗'})\n`;
  });
  md += `\n`;
  md += `## 📅 Cron Jobs\n\n`;
  if (state.cron_jobs.length > 0) {
    state.cron_jobs.forEach((job)=>{
      md += `- **${job.jobname}** - Schedule: \`${job.schedule}\` - Active: ${job.active ? '✓' : '✗'}\n`;
    });
  } else {
    md += `No cron jobs found (might need permissions)\n`;
  }
  md += `\n`;
  md += `## 👁️ Views\n\n`;
  Object.entries(state.views).forEach(([view, info])=>{
    if (info.exists) {
      md += `- **${view}** - ${info.record_count} records\n`;
    }
  });
  md += `\n`;
  md += `---\n\n`;
  md += `*Upload this file to your Claude Project for complete system context*\n`;
  return md;
}
