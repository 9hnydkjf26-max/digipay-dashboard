// Supabase Edge Function: cpt-data-sync (Uses cpt_site_accounts)
// Location: supabase/functions/cpt-data-sync/index.ts
// Purpose: Hourly sync that creates site accounts in cpt_site_accounts table
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const GATEWAY_TRIGGER_URL = 'https://admin.securedigitalpayments.com/cron_transaction_to_external_path.php';
const GATEWAY_DATA_URL = 'https://admin.securedigitalpayments.com/xml/postdata.txt';
const WAIT_TIME_SECONDS = 30;
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  const startTime = Date.now();
  let syncLogId = null;
  try {
    console.log('=== CPT Data Sync Starting ===');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Create sync log
    const { data: syncLog, error: syncLogError } = await supabase.from('cpt_sync_log').insert({
      status: 'running',
      sync_started_at: new Date().toISOString()
    }).select().single();
    if (!syncLogError) {
      syncLogId = syncLog.id;
    }
    // Trigger gateway data preparation
    const triggerResponse = await fetch(GATEWAY_TRIGGER_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Supabase-CPT-Sync/3.0',
        'Cache-Control': 'no-cache'
      }
    });
    if (!triggerResponse.ok) {
      throw new Error(`Trigger failed: ${triggerResponse.status}`);
    }
    // Wait for data preparation
    await new Promise((resolve)=>setTimeout(resolve, WAIT_TIME_SECONDS * 1000));
    // Fetch prepared data
    const dataResponse = await fetch(GATEWAY_DATA_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Supabase-CPT-Sync/3.0',
        'Cache-Control': 'no-cache'
      }
    });
    if (!dataResponse.ok) {
      throw new Error(`Fetch failed: ${dataResponse.status}`);
    }
    const phpArrayText = await dataResponse.text();
    const transactions = parsePHPArray(phpArrayText);
    if (transactions.length === 0) {
      throw new Error('No transactions parsed');
    }
    const dates = transactions.map((t)=>new Date(t.date_time)).sort((a, b)=>a.getTime() - b.getTime());
    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    // Load site mapping and discover new sites
    const siteAccountMap = await loadSiteMapping(supabase);
    const newSitesCount = await discoverAndCreateSites(supabase, transactions, siteAccountMap);
    if (newSitesCount > 0) {
      Object.assign(siteAccountMap, await loadSiteMapping(supabase));
    }
    // Upsert transactions
    const metrics = await upsertTransactions(supabase, transactions);
    metrics.newSitesDiscovered = newSitesCount;
    // Update sync log
    const durationSeconds = (Date.now() - startTime) / 1000;
    if (syncLogId) {
      await updateSyncLog(supabase, syncLogId, {
        status: 'success',
        totalFetched: metrics.totalFetched,
        totalProcessed: metrics.totalProcessed,
        newRecords: metrics.newRecords,
        updatedRecords: metrics.updatedRecords,
        failedRecords: metrics.failedRecords,
        earliestTransaction: earliest.toISOString(),
        latestTransaction: latest.toISOString(),
        errors: metrics.errors.length > 0 ? metrics.errors : null,
        durationSeconds: durationSeconds
      });
    }
    console.log(`=== Sync Complete: ${metrics.newRecords} new, ${metrics.updatedRecords} existing (${durationSeconds.toFixed(1)}s) ===`);
    return new Response(JSON.stringify({
      success: true,
      metrics: {
        totalFetched: metrics.totalFetched,
        newRecords: metrics.newRecords,
        updatedRecords: metrics.updatedRecords,
        failedRecords: metrics.failedRecords,
        newSitesDiscovered: metrics.newSitesDiscovered,
        durationSeconds: durationSeconds
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Sync error:', error);
    if (syncLogId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await updateSyncLog(supabase, syncLogId, {
        status: 'failed',
        errorMessage: error.message || String(error),
        durationSeconds: (Date.now() - startTime) / 1000
      });
    }
    return new Response(JSON.stringify({
      success: false,
      error: error.message || String(error)
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
function parsePHPArray(phpArrayText) {
  const transactions = [];
  try {
    const transactionPattern = /\[\d+\] => Array\s*\(([\s\S]*?)\n\s*\)/g;
    const transactionMatches = phpArrayText.matchAll(transactionPattern);
    for (const match of transactionMatches){
      const block = match[1];
      const transaction = {};
      const fieldPattern = /\[(\w+)\] => ([^\n]+)/g;
      const fieldMatches = block.matchAll(fieldPattern);
      for (const fieldMatch of fieldMatches){
        transaction[fieldMatch[1]] = fieldMatch[2].trim();
      }
      if (transaction.cust_session && transaction.date_time) {
        transactions.push(transaction);
      }
    }
  } catch (error) {
    console.error('Parse error:', error);
  }
  return transactions;
}
async function loadSiteMapping(supabase) {
  const { data: sites, error } = await supabase.from('cpt_site_accounts').select('site_id, account_identifier');
  if (error) {
    console.error('Error loading site mapping:', error);
    return {};
  }
  const mapping = {};
  for (const site of sites || []){
    mapping[site.site_id] = site.account_identifier;
  }
  return mapping;
}
async function discoverAndCreateSites(supabase, transactions, existingMapping) {
  const sitesInData = new Map();
  for (const txn of transactions){
    if (txn.site_id && !existingMapping[txn.site_id]) {
      sitesInData.set(txn.site_id, {
        site_id: txn.site_id,
        site_name: txn.site_name || `Site ${txn.site_id}`,
        cp_name: txn.cp_name || 'Unknown'
      });
    }
  }
  if (sitesInData.size === 0) return 0;
  const newSites = Array.from(sitesInData.values()).map((site)=>({
      site_id: site.site_id,
      site_name: site.site_name,
      cp_name: site.cp_name,
      account_identifier: `cpt_site_${site.site_id}`,
      is_active: true
    }));
  const { error } = await supabase.from('cpt_site_accounts').upsert(newSites, {
    onConflict: 'site_id',
    ignoreDuplicates: false
  });
  if (error) {
    console.error('Error creating site accounts:', error);
    return 0;
  }
  console.log(`Created ${sitesInData.size} new site accounts`);
  return sitesInData.size;
}
async function upsertTransactions(supabase, transactions) {
  const metrics = {
    totalFetched: transactions.length,
    totalProcessed: 0,
    newRecords: 0,
    updatedRecords: 0,
    failedRecords: 0,
    newSitesDiscovered: 0,
    earliestTransaction: null,
    latestTransaction: null,
    errors: []
  };
  // Load all existing records in ONE query
  const { data: existingRecords } = await supabase.from('cpt_data').select('cust_session, transaction_date');
  // Create a Set for O(1) lookup
  const existingKeys = new Set((existingRecords || []).map((r)=>`${r.cust_session}|${r.transaction_date}`));
  // Prepare all records
  const recordsToUpsert = [];
  for(let i = 0; i < transactions.length; i++){
    const txn = transactions[i];
    try {
      const transactionDate = new Date(txn.date_time);
      const id = txn.cust_trans_id || `session_${txn.cust_session}`;
      const amount = parseFloat(txn.cust_amount.toString());
      const dateISO = transactionDate.toISOString();
      // Fast in-memory duplicate check
      const key = `${txn.cust_session}|${dateISO}`;
      const isExisting = existingKeys.has(key);
      const record = {
        id: id,
        transaction_date: dateISO,
        cust_session: txn.cust_session,
        cust_name: txn.cust_name || null,
        cust_email_ad: txn.cust_email_ad || null,
        cust_amount: amount,
        currency: (txn.currency || 'CAD').toUpperCase(),
        cust_trans_id: txn.cust_trans_id || null,
        cust_order_description: txn.cust_order_description || null,
        status: txn.status || null,
        trans_type: txn.trans_type,
        card_type: txn.card_type || null,
        site_id: txn.site_id || null,
        site_name: txn.site_name || null,
        cp_name: txn.cp_name || null,
        synced_at: new Date().toISOString()
      };
      recordsToUpsert.push(record);
      if (isExisting) {
        metrics.updatedRecords++;
      } else {
        metrics.newRecords++;
      }
    } catch (error) {
      metrics.failedRecords++;
      metrics.errors.push({
        session: txn.cust_session,
        date: txn.date_time,
        error: error.message || String(error)
      });
    }
  }
  // Batch upsert all records in one query
  const { error: upsertError } = await supabase.from('cpt_data').upsert(recordsToUpsert, {
    onConflict: 'cust_session,transaction_date',
    ignoreDuplicates: false
  });
  if (upsertError) {
    console.error('Batch upsert error:', upsertError);
    metrics.failedRecords = recordsToUpsert.length;
  } else {
    metrics.totalProcessed = recordsToUpsert.length;
  }
  return metrics;
}
async function updateSyncLog(supabase, syncLogId, updates) {
  const { error } = await supabase.from('cpt_sync_log').update({
    sync_completed_at: new Date().toISOString(),
    ...updates
  }).eq('id', syncLogId);
  if (error) {
    console.error('Failed to update sync log:', error);
  }
}
