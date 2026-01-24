// Edge Function: daily-slack-report
// Generates daily CPT processing volume report and posts to Slack
// Runs at midnight via pg_cron
//
// Required Secret:
//   SLACK_WEBHOOK_URL - Your Slack incoming webhook URL
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function formatCurrency(amount) {
  return '$' + amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('=== Generating Daily Slack Report ===');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL secret not configured');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get list of active site_ids
    const { data: activeSites, error: sitesError } = await supabase.from('cpt_site_accounts').select('site_id').eq('is_active', true);
    if (sitesError) {
      throw new Error(`Failed to fetch active sites: ${sitesError.message}`);
    }
    const activeSiteIds = (activeSites || []).map((s)=>s.site_id);
    console.log(`Found ${activeSiteIds.length} active sites`);
    // If no active sites, send a simple message
    if (activeSiteIds.length === 0) {
      const slackResponse = await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: '*Daily CC Volume*\n\n_No active sites configured_'
        })
      });
      return new Response(JSON.stringify({
        success: true,
        message: 'No active sites'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    // Calculate yesterday's date range in PST
    // Note: CPT data is stored in PST but labeled as UTC, so we query using PST times directly
    const now = new Date();
    // Get current PST time (UTC-8)
    const pstOffset = 8 * 60 * 60 * 1000;
    const nowPST = new Date(now.getTime() - pstOffset);
    // Yesterday PST
    const yesterdayPST = new Date(nowPST);
    yesterdayPST.setDate(yesterdayPST.getDate() - 1);
    yesterdayPST.setHours(0, 0, 0, 0);
    const endOfYesterdayPST = new Date(yesterdayPST);
    endOfYesterdayPST.setHours(23, 59, 59, 999);
    // Format as ISO strings (these will be treated as PST since that's how CPT stores data)
    const startOfYesterday = yesterdayPST.toISOString();
    const endOfYesterdayStr = endOfYesterdayPST.toISOString();
    // Also calculate 7 days ago for refund lookback
    const sevenDaysAgoPST = new Date(yesterdayPST);
    sevenDaysAgoPST.setDate(sevenDaysAgoPST.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgoPST.toISOString();
    // Query yesterday's CPT transactions (only active sites, exclude test transactions)
    const { data: cptData, error: cptError } = await supabase.from('cpt_data').select('site_id, site_name, trans_type, cust_amount, cust_email_ad, cust_session').gte('transaction_date', startOfYesterday).lte('transaction_date', endOfYesterdayStr).in('site_id', activeSiteIds).neq('is_test', true);
    if (cptError) {
      throw new Error(`Failed to fetch CPT data: ${cptError.message}`);
    }
    // Query last 7 days for refunds (only active sites, exclude test transactions)
    const { data: refundData } = await supabase.from('cpt_data').select('site_id').gte('transaction_date', sevenDaysAgoStr).lte('transaction_date', endOfYesterdayStr).eq('trans_type', 'refund').in('site_id', activeSiteIds).neq('is_test', true);
    // Aggregate CPT data by site (only sites with data)
    const siteStatsMap = new Map();
    // Aggregate yesterday's transactions
    for (const tx of cptData || []){
      const key = tx.site_id || 'unknown';
      if (!siteStatsMap.has(key)) {
        siteStatsMap.set(key, {
          site_id: tx.site_id || 'unknown',
          site_name: tx.site_name || 'Unknown',
          complete_count: 0,
          complete_volume: 0,
          successful_customers: new Set(),
          failed_customers: new Set(),
          refund_count: 0,
          chargeback_count: 0
        });
      }
      const stats = siteStatsMap.get(key);
      const amount = Number(tx.cust_amount) || 0;
      const customerKey = tx.cust_email_ad || tx.cust_session || 'unknown';
      if (tx.trans_type === 'complete') {
        stats.complete_count++;
        stats.complete_volume += amount;
        stats.successful_customers.add(customerKey);
      } else if (tx.trans_type !== 'refund') {
        stats.failed_customers.add(customerKey);
      }
    }
    // Remove customers from failed set if they had a successful transaction
    for (const stats of siteStatsMap.values()){
      for (const customer of stats.successful_customers){
        stats.failed_customers.delete(customer);
      }
    }
    // Count refunds per site (last 7 days)
    for (const refund of refundData || []){
      const stats = siteStatsMap.get(refund.site_id);
      if (stats) {
        stats.refund_count++;
      }
    }
    // Sort sites alphabetically by name
    const siteStats = Array.from(siteStatsMap.values()).sort((a, b)=>a.site_name.localeCompare(b.site_name));
    // Format date (using PST date)
    const reportDate = yesterdayPST.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase();
    // Calculate totals
    const totalProcessed = siteStats.reduce((sum, s)=>sum + s.complete_volume, 0);
    const totalComplete = siteStats.reduce((sum, s)=>sum + s.complete_count, 0);
    const totalFailed = siteStats.reduce((sum, s)=>sum + s.failed_customers.size, 0);
    // Helper to pad strings for alignment
    const pad = (str, len, left = false)=>{
      if (str.length >= len) return str.substring(0, len);
      return left ? str.padStart(len) : str.padEnd(len);
    };
    // Format currency compact (no cents if whole dollar)
    const fmtAmt = (amt)=>{
      if (amt >= 1000) {
        return '$' + (amt / 1000).toFixed(1) + 'k';
      }
      return '$' + amt.toFixed(0);
    };
    // Build compact message for mobile
    let message = `*Daily CC Volume — ${reportDate}*\n\n`;
    if (siteStats.length === 0) {
      message += `_No transactions yesterday_\n`;
    } else {
      message += '```\n';
      message += pad('', 8) + pad('Amt', 7, true) + pad('✓', 4, true) + pad('✗', 4, true) + pad('%', 4, true) + '\n';
      for (const site of siteStats){
        const failedCount = site.failed_customers.size;
        const totalTxns = site.complete_count + failedCount;
        const failRate = totalTxns > 0 ? Math.round(failedCount / totalTxns * 100) : 0;
        const name = pad(site.site_name, 8);
        const amount = pad(fmtAmt(site.complete_volume), 7, true);
        const complete = pad(site.complete_count.toString(), 4, true);
        const failed = pad(failedCount.toString(), 4, true);
        const rate = pad(failRate.toString(), 4, true);
        message += `${name}${amount}${complete}${failed}${rate}\n`;
      }
      // Add total row
      message += `────────────────────────────\n`;
      const totalName = pad('TOTAL', 8);
      const totalAmt = pad(fmtAmt(totalProcessed), 7, true);
      const totalComp = pad(totalComplete.toString(), 4, true);
      const totalFail = pad(totalFailed.toString(), 4, true);
      message += `${totalName}${totalAmt}${totalComp}${totalFail}\n`;
      message += '```';
    }
    // Send to Slack
    const slackResponse = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: message
      })
    });
    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      throw new Error(`Slack API error: ${slackResponse.status} - ${errorText}`);
    }
    console.log('Report sent successfully');
    return new Response(JSON.stringify({
      success: true,
      report_date: reportDate,
      sites: siteStats.length,
      active_sites: activeSiteIds.length
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
      status: 500
    });
  }
});
