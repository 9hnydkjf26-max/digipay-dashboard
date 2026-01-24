// Supabase Edge Function: delete-settlement-report
// ===========================================
// Deletes a settlement report with proper cascading cleanup.
// Handles unsettling transactions, resetting adjustments, and audit logging.
//
// Security: Requires valid JWT authentication
//
// Deploy: supabase functions deploy delete-settlement-report
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/delete-settlement-report

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://fluidcast.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5180',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:5177',
  'http://127.0.0.1:5178',
  'http://127.0.0.1:5179',
  'http://127.0.0.1:5180'
]

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  }
}

interface DeleteReportRequest {
  report_id: string
  force?: boolean  // Skip confirmation prompts (client should have already confirmed)
}

interface DeleteResult {
  success: boolean
  report_number?: string
  transactions_unsettled: number
  adjustments_deleted: number
  adjustments_reset: number
  error?: string
  requires_confirmation?: boolean
  confirmation_message?: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    // =============================================
    // AUTHENTICATION: Verify JWT from Authorization header
    // =============================================
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing or invalid authorization header'
      }), {
        status: 401,
        headers: corsHeaders
      })
    }

    const jwt = authHeader.replace('Bearer ', '')

    // Create Supabase client with the user's JWT to verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Use anon key client to verify the JWT
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    })

    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid or expired authentication token'
      }), {
        status: 401,
        headers: corsHeaders
      })
    }

    // User is authenticated - use their ID for audit logging
    const userId = user.id

    // =============================================
    // PARSE REQUEST
    // =============================================
    const body: DeleteReportRequest = await req.json()
    const { report_id, force = false } = body

    if (!report_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'report_id is required'
      }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Create Supabase client with service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the report to verify it exists and get details for logging
    const { data: report, error: reportFetchError } = await supabase
      .from('settlement_reports')
      .select('id, report_number, site_name, net_amount, status, merchant_payout, reserve_deducted')
      .eq('id', report_id)
      .single()

    if (reportFetchError || !report) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Settlement report not found'
      }), {
        status: 404,
        headers: corsHeaders
      })
    }

    // Check for adjustments originating from this report
    const { data: originatingAdjustments, error: origAdjError } = await supabase
      .from('settlement_adjustments')
      .select('id, reason, original_cust_session, status, amount')
      .eq('original_settlement_report_id', report_id)

    if (origAdjError) {
      console.error('Error fetching originating adjustments:', origAdjError)
      throw new Error('Failed to check for related adjustments')
    }

    // If there are originating adjustments and force is not set, return confirmation request
    if (originatingAdjustments && originatingAdjustments.length > 0 && !force) {
      const appliedCount = originatingAdjustments.filter(a => a.status === 'applied').length
      const pendingCount = originatingAdjustments.filter(a => a.status === 'pending').length

      let message = `This report has ${originatingAdjustments.length} adjustment(s) referencing it.`
      if (appliedCount > 0) {
        message += ` ${appliedCount} have been applied to other reports.`
      }
      if (pendingCount > 0) {
        message += ` ${pendingCount} are pending.`
      }
      message += ' Deleting this report will also delete these adjustments.'

      return new Response(JSON.stringify({
        success: false,
        requires_confirmation: true,
        confirmation_message: message,
        adjustments_to_delete: originatingAdjustments.length
      }), {
        status: 200,
        headers: corsHeaders
      })
    }

    // =============================================
    // BEGIN DELETION PROCESS
    // =============================================

    let transactionsUnsettled = 0
    let adjustmentsDeleted = 0
    let adjustmentsReset = 0

    // Step 1: Delete adjustments that originated from this report
    if (originatingAdjustments && originatingAdjustments.length > 0) {
      const { error: adjDeleteError } = await supabase
        .from('settlement_adjustments')
        .delete()
        .eq('original_settlement_report_id', report_id)

      if (adjDeleteError) {
        console.error('Error deleting originating adjustments:', adjDeleteError)
        throw new Error('Failed to delete related adjustments')
      }
      adjustmentsDeleted = originatingAdjustments.length
    }

    // Step 2: Unsettle all transactions linked to this report
    const { data: linkedTransactions, error: txFetchError } = await supabase
      .from('cpt_data')
      .select('cust_session, transaction_date')
      .eq('settlement_report_id', report_id)

    if (txFetchError) {
      console.error('Error fetching linked transactions:', txFetchError)
      throw new Error('Failed to fetch linked transactions')
    }

    if (linkedTransactions && linkedTransactions.length > 0) {
      const { error: updateError } = await supabase
        .from('cpt_data')
        .update({ settlement_report_id: null, is_settled: false })
        .eq('settlement_report_id', report_id)

      if (updateError) {
        console.error('Error unsettling transactions:', updateError)
        throw new Error('Failed to unsettle transactions')
      }
      transactionsUnsettled = linkedTransactions.length
    }

    // Step 3: Reset any adjustments that were applied to this report back to pending
    const { data: appliedAdjustments } = await supabase
      .from('settlement_adjustments')
      .select('id')
      .eq('applied_to_settlement_id', report_id)

    if (appliedAdjustments && appliedAdjustments.length > 0) {
      const { error: adjResetError } = await supabase
        .from('settlement_adjustments')
        .update({
          status: 'pending',
          applied_to_settlement_id: null,
          applied_at: null
        })
        .eq('applied_to_settlement_id', report_id)

      if (adjResetError) {
        console.error('Error resetting adjustments:', adjResetError)
        // Non-fatal: log but continue
      } else {
        adjustmentsReset = appliedAdjustments.length
      }
    }

    // Step 4: Delete report items
    const { error: itemsError } = await supabase
      .from('settlement_report_items')
      .delete()
      .eq('settlement_report_id', report_id)

    if (itemsError) {
      console.error('Error deleting report items:', itemsError)
      throw new Error('Failed to delete report items')
    }

    // Step 5: Delete the report itself
    const { error: reportDeleteError } = await supabase
      .from('settlement_reports')
      .delete()
      .eq('id', report_id)

    if (reportDeleteError) {
      console.error('Error deleting report:', reportDeleteError)
      throw new Error(`Failed to delete report: ${reportDeleteError.message}`)
    }

    // Step 6: Rollback reserve_collected if this report had deducted reserve
    const reserveDeducted = parseFloat(report.reserve_deducted || 0)
    if (reserveDeducted > 0) {
      // Fetch current site_pricing
      const { data: pricing } = await supabase
        .from('site_pricing')
        .select('id, reserve_collected')
        .eq('site_name', report.site_name)
        .single()

      if (pricing) {
        const currentCollected = parseFloat(pricing.reserve_collected || 0)
        const newCollected = Math.max(0, currentCollected - reserveDeducted)

        await supabase
          .from('site_pricing')
          .update({ reserve_collected: newCollected })
          .eq('id', pricing.id)
      }
    }

    // Step 7: Log the activity with verified user ID
    await supabase.from('refund_audit_log').insert({
      user_id: userId,
      action: 'settlement_deleted',
      details: {
        report_id: report_id,
        report_number: report.report_number,
        site_name: report.site_name,
        net_amount: report.net_amount,
        merchant_payout: report.merchant_payout,
        transactions_unsettled: transactionsUnsettled,
        adjustments_deleted: adjustmentsDeleted,
        adjustments_reset: adjustmentsReset
      }
    })

    const result: DeleteResult = {
      success: true,
      report_number: report.report_number,
      transactions_unsettled: transactionsUnsettled,
      adjustments_deleted: adjustmentsDeleted,
      adjustments_reset: adjustmentsReset
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders
    })

  } catch (err) {
    console.error('Delete settlement report error:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Internal server error'
    }), {
      status: 500,
      headers: corsHeaders
    })
  }
})
