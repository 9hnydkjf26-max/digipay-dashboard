// Edge Function: export-system-state (SAFE VERSION)
// Uses specific safe functions instead of dangerous exec_sql
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
    console.log('=== Exporting System State (Safe) ===');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'json';
    // Collect all system information
    const systemState = {
      export_timestamp: new Date().toISOString(),
      supabase_project: supabaseUrl,
      // Existing data
      data_counts: await getDataCounts(supabase),
      sync_status: await getSyncStatus(supabase),
      accounts: await getAccounts(supabase),
      views: await getViews(supabase),
      configured_secrets: getConfiguredSecrets(),
      health: await getSystemHealth(supabase),
      // NEW: Using safe functions
      tables: await getCompleteTableStructures(supabase),
      indexes: await getIndexes(supabase),
      constraints: await getConstraints(supabase),
      rls_policies: await getDetailedRLSPolicies(supabase),
      functions: await getFunctions(supabase),
      extensions: await getExtensions(supabase)
    };
    if (format === 'markdown') {
      const markdown = generateEnhancedMarkdown(systemState);
      return new Response(markdown, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/markdown',
          'Content-Disposition': 'attachment; filename="supabase-schema-complete.md"'
        }
      });
    } else {
      return new Response(JSON.stringify(systemState, null, 2), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="supabase-schema-complete.json"'
        }
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error),
      stack: error?.stack
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
 * Get complete table structures using SAFE function
 */ async function getCompleteTableStructures(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_table_structures');
    if (error) {
      console.error('Error fetching table structures:', error);
      return {};
    }
    return groupTableData(data || []);
  } catch (err) {
    console.error('Error fetching table structures:', err);
    return {};
  }
}
function groupTableData(rows) {
  const tables = {};
  rows.forEach((row)=>{
    if (!tables[row.table_name]) {
      tables[row.table_name] = {
        columns: [],
        comment: null
      };
    }
    tables[row.table_name].columns.push({
      name: row.column_name,
      position: row.ordinal_position,
      type: row.data_type,
      udt_name: row.udt_name,
      nullable: row.is_nullable === 'YES',
      default: row.column_default
    });
  });
  return tables;
}
/**
 * Get all indexes using SAFE function
 */ async function getIndexes(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_indexes');
    if (error) {
      console.error('Error fetching indexes:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error fetching indexes:', err);
    return [];
  }
}
/**
 * Get all constraints using SAFE function
 */ async function getConstraints(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_constraints');
    if (error) {
      console.error('Error fetching constraints:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error fetching constraints:', err);
    return [];
  }
}
/**
 * Get detailed RLS policies using SAFE function
 */ async function getDetailedRLSPolicies(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_rls_policies');
    if (error) {
      console.error('Error fetching RLS policies:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error fetching RLS policies:', err);
    return [];
  }
}
/**
 * Get all functions using SAFE function
 */ async function getFunctions(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_database_functions');
    if (error) {
      console.error('Error fetching functions:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error fetching functions:', err);
    return [];
  }
}
/**
 * Get installed extensions using SAFE function
 */ async function getExtensions(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_extensions');
    if (error) {
      console.error('Error fetching extensions:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error fetching extensions:', err);
    return [];
  }
}
/**
 * Generate enhanced markdown with complete schema
 */ function generateEnhancedMarkdown(state) {
  let md = `# Supabase Complete Schema Export\n\n`;
  md += `**Exported:** ${state.export_timestamp}\n`;
  md += `**Project:** ${state.supabase_project}\n\n`;
  md += `---\n\n`;
  // System Health
  md += `## 📊 System Health\n\n`;
  md += `**Status:** ${state.health.status}\n\n`;
  if (state.health.issues && state.health.issues.length > 0) {
    md += `**Issues:**\n`;
    state.health.issues.forEach((issue)=>md += `- ⚠️ ${issue}\n`);
    md += `\n`;
  }
  if (state.health.warnings && state.health.warnings.length > 0) {
    md += `**Warnings:**\n`;
    state.health.warnings.forEach((warning)=>md += `- ⚠️ ${warning}\n`);
    md += `\n`;
  }
  // Data Counts
  md += `## 💾 Data Counts\n\n`;
  if (state.data_counts && typeof state.data_counts === 'object') {
    Object.entries(state.data_counts).forEach(([table, counts])=>{
      md += `**${table}:** ${counts.total} records\n`;
    });
  } else {
    md += `No data count information available\n`;
  }
  md += `\n`;
  // Extensions
  md += `## 🔌 Installed Extensions\n\n`;
  if (Array.isArray(state.extensions) && state.extensions.length > 0) {
    state.extensions.forEach((ext)=>{
      md += `- **${ext.name}** (v${ext.version}) - schema: ${ext.schema}\n`;
    });
  } else {
    md += `No extension information available\n`;
  }
  md += `\n`;
  // TABLE STRUCTURES (DETAILED)
  md += `## 🗄️ Table Structures\n\n`;
  if (state.tables && typeof state.tables === 'object' && Object.keys(state.tables).length > 0) {
    Object.entries(state.tables).forEach(([tableName, tableInfo])=>{
      md += `### ${tableName}\n\n`;
      if (tableInfo.columns && tableInfo.columns.length > 0) {
        md += `| Column | Type | Nullable | Default |\n`;
        md += `|--------|------|----------|---------|\n`;
        tableInfo.columns.forEach((col)=>{
          const type = col.udt_name || col.type;
          const nullable = col.nullable ? 'YES' : 'NO';
          const defaultVal = col.default || '-';
          md += `| ${col.name} | ${type} | ${nullable} | ${defaultVal} |\n`;
        });
        md += `\n`;
      }
    });
  } else {
    md += `No table structure information available\n\n`;
  }
  // CONSTRAINTS
  md += `## 🔗 Constraints\n\n`;
  const constraintsByTable = {};
  if (Array.isArray(state.constraints) && state.constraints.length > 0) {
    state.constraints.forEach((c)=>{
      if (!constraintsByTable[c.table_name]) {
        constraintsByTable[c.table_name] = [];
      }
      constraintsByTable[c.table_name].push(c);
    });
  }
  Object.entries(constraintsByTable).forEach(([tableName, constraints])=>{
    md += `### ${tableName}\n\n`;
    constraints.forEach((c)=>{
      md += `- **${c.constraint_name}** (${c.constraint_type})\n`;
      if (c.column_name) md += `  - Column: ${c.column_name}\n`;
      if (c.foreign_table_name) {
        md += `  - References: ${c.foreign_table_name}(${c.foreign_column_name})\n`;
        if (c.update_rule) md += `  - On Update: ${c.update_rule}\n`;
        if (c.delete_rule) md += `  - On Delete: ${c.delete_rule}\n`;
      }
    });
    md += `\n`;
  });
  if (Object.keys(constraintsByTable).length === 0) {
    md += `No constraints found or insufficient permissions\n\n`;
  }
  // INDEXES
  md += `## 📇 Indexes\n\n`;
  const indexesByTable = {};
  if (Array.isArray(state.indexes) && state.indexes.length > 0) {
    state.indexes.forEach((idx)=>{
      if (!indexesByTable[idx.tablename]) {
        indexesByTable[idx.tablename] = [];
      }
      indexesByTable[idx.tablename].push(idx);
    });
  }
  Object.entries(indexesByTable).forEach(([tableName, indexes])=>{
    md += `### ${tableName}\n\n`;
    indexes.forEach((idx)=>{
      md += `- **${idx.indexname}**\n`;
      md += `  \`\`\`sql\n  ${idx.indexdef}\n  \`\`\`\n`;
    });
    md += `\n`;
  });
  if (Object.keys(indexesByTable).length === 0) {
    md += `No indexes found or insufficient permissions\n\n`;
  }
  // RLS POLICIES
  md += `## 🔒 Row Level Security Policies\n\n`;
  const policiesByTable = {};
  if (Array.isArray(state.rls_policies) && state.rls_policies.length > 0) {
    state.rls_policies.forEach((p)=>{
      if (!policiesByTable[p.tablename]) {
        policiesByTable[p.tablename] = [];
      }
      policiesByTable[p.tablename].push(p);
    });
  }
  Object.entries(policiesByTable).forEach(([tableName, policies])=>{
    md += `### ${tableName}\n\n`;
    policies.forEach((p)=>{
      md += `#### ${p.policyname}\n\n`;
      md += `- **Command:** ${p.cmd}\n`;
      if (p.roles && Array.isArray(p.roles)) {
        md += `- **Roles:** ${p.roles.join(', ')}\n`;
      }
      md += `- **Type:** ${p.permissive}\n`;
      if (p.qual) md += `- **USING:** \`${p.qual}\`\n`;
      if (p.with_check) md += `- **WITH CHECK:** \`${p.with_check}\`\n`;
      md += `\n`;
    });
  });
  if (Object.keys(policiesByTable).length === 0) {
    md += `No RLS policies found or insufficient permissions\n\n`;
  }
  // FUNCTIONS
  md += `## ⚙️ Functions\n\n`;
  if (Array.isArray(state.functions) && state.functions.length > 0) {
    state.functions.forEach((func)=>{
      md += `### ${func.name}\n\n`;
      md += `**Returns:** ${func.return_type}\n`;
      md += `**Language:** ${func.language}\n`;
      md += `**Arguments:** ${func.arguments || 'none'}\n\n`;
    });
  } else {
    md += `No functions found or insufficient permissions\n\n`;
  }
  // VIEWS
  md += `## 👁️ Views\n\n`;
  if (state.views && typeof state.views === 'object' && Object.keys(state.views).length > 0) {
    Object.entries(state.views).forEach(([view, info])=>{
      if (info.exists) {
        md += `- **${view}** - ${info.record_count} records\n`;
      }
    });
  } else {
    md += `No views information available\n`;
  }
  md += `\n`;
  // Payment Accounts
  md += `## 🏦 Payment Accounts\n\n`;
  if (Array.isArray(state.accounts) && state.accounts.length > 0) {
    state.accounts.forEach((account)=>{
      md += `- **${account.payment_provider}** - ${account.account_id} (${account.environment})`;
      if (account.secret_key_name) md += ` - Key: ${account.secret_key_name}`;
      if (account.warmup_start_date) md += ` - Warmup: ${account.warmup_start_date}`;
      md += `\n`;
    });
  } else {
    md += `No payment accounts found\n`;
  }
  md += `\n`;
  // Sync Status
  md += `## 🔄 Sync Status\n\n`;
  if (Array.isArray(state.sync_status) && state.sync_status.length > 0) {
    md += `| Object Type | Provider | Account | Status | Last Sync | Total |\n`;
    md += `|-------------|----------|---------|--------|-----------|-------|\n`;
    state.sync_status.forEach((sync)=>{
      md += `| ${sync.object_type} | ${sync.payment_provider} | ${sync.stripe_account_id} | ${sync.status} | ${sync.last_sync_at || 'Never'} | ${sync.total_synced || 0} |\n`;
    });
  } else {
    md += `No sync status information available\n`;
  }
  md += `\n`;
  md += `---\n\n`;
  md += `*Complete schema export for Claude Projects*\n`;
  return md;
}
// ============================================
// EXISTING HELPER FUNCTIONS (keep as-is)
// ============================================
async function getDataCounts(supabase) {
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
    const { count: total } = await supabase.from(table).select('*', {
      count: 'exact',
      head: true
    });
    counts[table] = {
      total,
      by_provider_and_account: {}
    };
  }
  return counts;
}
async function getSyncStatus(supabase) {
  const { data } = await supabase.from('stripe_sync_status').select('*').order('last_sync_at', {
    ascending: false
  });
  return data || [];
}
async function getAccounts(supabase) {
  const { data } = await supabase.from('payment_accounts').select('*').order('payment_provider', {
    ascending: true
  });
  return data || [];
}
async function getViews(supabase) {
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
function getConfiguredSecrets() {
  const secrets = {
    stripe_accounts: [],
    airwallex_accounts: [],
    supabase: {}
  };
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
  return secrets;
}
async function getSystemHealth(supabase) {
  const health = {
    status: 'healthy',
    issues: [],
    warnings: []
  };
  const { data: syncData } = await supabase.from('stripe_sync_status').select('*').eq('status', 'failed');
  if (syncData && syncData.length > 0) {
    health.status = 'degraded';
    health.issues.push(`${syncData.length} sync job(s) in failed state`);
  }
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: staleData } = await supabase.from('stripe_sync_status').select('*').lt('last_sync_at', twoDaysAgo);
  if (staleData && staleData.length > 0) {
    health.warnings.push(`${staleData.length} sync job(s) haven't run in >48 hours`);
  }
  return health;
}
