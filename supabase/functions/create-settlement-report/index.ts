// Supabase Edge Function: create-settlement-report
// ===========================================
// Creates a settlement report with authoritative fee calculations.
// All fee logic is computed server-side - frontend only submits transaction selections.
//
// Security: Requires valid JWT authentication
//
// Deploy: supabase functions deploy create-settlement-report
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/create-settlement-report

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

interface TransactionKey {
  cust_session: string
  transaction_date: string
}

interface CreateReportRequest {
  site_name: string
  transaction_keys: TransactionKey[]
  notes?: string
  period_start?: string
  period_end?: string
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

    // Create Supabase clients
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

    // User is authenticated - use their ID for created_by
    const userId = user.id

    // =============================================
    // PARSE REQUEST
    // =============================================
    const body: CreateReportRequest = await req.json()
    const { site_name, transaction_keys, notes, period_start: requestedPeriodStart, period_end: requestedPeriodEnd } = body

    if (!site_name) {
      return new Response(JSON.stringify({
        success: false,
        error: 'site_name is required'
      }), {
        status: 400,
        headers: corsHeaders
      })
    }

    if (!transaction_keys || !Array.isArray(transaction_keys) || transaction_keys.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'transaction_keys array is required and must not be empty'
      }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Create Supabase client with service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check for existing pending report for this site
    const { data: existingPending } = await supabase
      .from('settlement_reports')
      .select('id, report_number')
      .eq('site_name', site_name)
      .eq('status', 'pending')
      .single()

    if (existingPending) {
      return new Response(JSON.stringify({
        success: false,
        error: `A pending report already exists for this site: ${existingPending.report_number}. Please resolve it first.`
      }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Fetch site pricing
    const { data: pricing } = await supabase
      .from('site_pricing')
      .select('*')
      .eq('site_name', site_name)
      .single()

    // Build a Set of selected keys for O(1) lookup
    const selectedKeys = new Set(
      transaction_keys.map(k => `${k.cust_session}|||${k.transaction_date}`)
    )

    // Fetch all unsettled transactions for site in ONE query (batch optimization)
    const { data: allSiteTransactions } = await supabase
      .from('cpt_data')
      .select('*')
      .eq('site_name', site_name)
      .is('settlement_report_id', null)

    // Filter to selected transactions in memory
    const filteredTransactions = (allSiteTransactions || []).filter(tx =>
      selectedKeys.has(`${tx.cust_session}|||${tx.transaction_date}`)
    )

    // Check if any requested transactions are already settled (not in unsettled results)
    // This happens when a transaction was requested but not found in unsettled list
    if (filteredTransactions.length < transaction_keys.length) {
      // Find which keys are missing by checking against filtered results
      const foundKeys = new Set(
        filteredTransactions.map(tx => `${tx.cust_session}|||${tx.transaction_date}`)
      )
      const missingKey = transaction_keys.find(k =>
        !foundKeys.has(`${k.cust_session}|||${k.transaction_date}`)
      )
      if (missingKey) {
        return new Response(JSON.stringify({
          success: false,
          error: `Transaction ${missingKey.cust_session} is already included in a settlement report or does not exist`
        }), {
          status: 400,
          headers: corsHeaders
        })
      }
    }

    const transactions: any[] = filteredTransactions
    let minDate: Date | null = null
    let maxDate: Date | null = null
    let siteId: string | null = null

    // Track date range and site_id from transactions
    for (const tx of transactions) {
      const txDate = new Date(tx.transaction_date)
      if (!minDate || txDate < minDate) minDate = txDate
      if (!maxDate || txDate > maxDate) maxDate = txDate
      if (!siteId && tx.site_id) siteId = tx.site_id
    }

    if (transactions.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No valid transactions found'
      }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Fetch pending adjustments
    const { data: pendingAdjustments } = await supabase
      .from('settlement_adjustments')
      .select('*')
      .eq('site_name', site_name)
      .eq('status', 'pending')

    const adjustments = pendingAdjustments || []

    // =============================================
    // AUTHORITATIVE FEE CALCULATION LOGIC
    // =============================================

    // Calculate transaction totals
    // All transactions are included in gross, then refunds/chargebacks are deducted
    let gross = 0
    let refundsAmount = 0
    let chargebacksAmount = 0
    let successfulCount = 0
    let refundCount = 0
    let chargebackCount = 0

    for (const t of transactions) {
      const amount = parseFloat(t.cust_amount || 0)
      // All transactions contribute to gross (successful sales)
      gross += amount
      successfulCount++

      // Track refunds and chargebacks for deduction
      if (t.is_refund) {
        refundsAmount += amount
        refundCount++
      } else if (t.is_chargeback) {
        chargebacksAmount += amount
        chargebackCount++
      }
    }

    // Net = Gross minus refunds and chargebacks
    const net = gross - refundsAmount - chargebacksAmount

    // Calculate adjustment totals
    const adjustmentsTotal = adjustments.reduce(
      (sum: number, a: any) => sum + parseFloat(a.amount || 0),
      0
    )
    const adjustmentsCount = adjustments.length
    const adjRefundCount = adjustments.filter((a: any) => a.reason === 'refund').length
    const adjChargebackCount = adjustments.filter((a: any) => a.reason === 'chargeback').length

    const netAfterAdjustments = net - adjustmentsTotal

    // Calculate fees based on pricing configuration
    let processingFeePercent = 0
    let processingFeeAmount = 0
    let transactionFeePer = 0
    let transactionFeesTotal = 0
    let refundFeePer = 0
    let refundFeesTotal = 0
    let chargebackFeePer = 0
    let chargebackFeesTotal = 0
    let processingFeeCredit = 0
    let totalFees = 0

    if (pricing) {
      // Processing fee (percentage of net - after refunds/chargebacks)
      // This ensures merchants aren't charged processing fees on money that was refunded
      processingFeePercent = parseFloat(pricing.percentage_fee) || 0
      processingFeeAmount = net * (processingFeePercent / 100)

      // Per-transaction fee (on all transactions since they were all processed)
      transactionFeePer = parseFloat(pricing.per_transaction_fee || 0)
      transactionFeesTotal = successfulCount * transactionFeePer

      // Refund fees (current batch refunds + adjustment refunds)
      refundFeePer = parseFloat(pricing.refund_fee || 0)
      refundFeesTotal = (refundCount + adjRefundCount) * refundFeePer

      // Chargeback fees (current batch chargebacks + adjustment chargebacks)
      chargebackFeePer = parseFloat(pricing.chargeback_fee || 0)
      chargebackFeesTotal = (chargebackCount + adjChargebackCount) * chargebackFeePer

      // Processing fee credit: for adjustments (refunds/chargebacks from previous settlements)
      // This credits back the processing fee that was charged on the original settlement
      processingFeeCredit = adjustmentsTotal * (processingFeePercent / 100)

      // Total fees
      totalFees = processingFeeAmount + transactionFeesTotal + refundFeesTotal + chargebackFeesTotal - processingFeeCredit
    }

    let merchantPayout = netAfterAdjustments - totalFees

    // =============================================
    // RESERVE CALCULATION
    // =============================================
    let reserveDeducted = 0
    let reserveBalance = 0

    if (pricing) {
      const reserveAmount = parseFloat(pricing.reserve_amount || 0)
      const reserveCollected = parseFloat(pricing.reserve_collected || 0)
      const reserveRemaining = Math.max(0, reserveAmount - reserveCollected)

      if (reserveRemaining > 0 && merchantPayout > 0) {
        // Deduct up to the remaining reserve needed (but not more than payout)
        reserveDeducted = Math.min(merchantPayout, reserveRemaining)
        merchantPayout = merchantPayout - reserveDeducted
      }

      // New reserve balance after this deduction
      reserveBalance = reserveCollected + reserveDeducted
    }

    // =============================================
    // SETTLEMENT FEE CALCULATION
    // =============================================
    let settlementFeePercent = 0
    let settlementFeeAmount = 0

    if (pricing && merchantPayout > 0) {
      settlementFeePercent = parseFloat(pricing.settlement_fee || 0)
      if (settlementFeePercent > 0) {
        settlementFeeAmount = merchantPayout * (settlementFeePercent / 100)
        merchantPayout = merchantPayout - settlementFeeAmount
      }
    }

    // =============================================
    // CREATE REPORT
    // =============================================

    // Generate report number
    const reportNumber = `SR-${Date.now().toString(36).toUpperCase()}`

    // Create the settlement report with verified user ID
    const { data: report, error: reportError } = await supabase
      .from('settlement_reports')
      .insert({
        report_number: reportNumber,
        site_id: siteId,
        site_name: site_name,
        status: 'pending',
        total_transactions: transactions.length,
        gross_amount: gross,
        refunds_amount: refundsAmount,
        chargebacks_amount: chargebacksAmount,
        net_amount: netAfterAdjustments,
        adjustments_total: adjustmentsTotal,
        adjustments_count: adjustmentsCount,
        processing_fee_percent: processingFeePercent,
        processing_fee_amount: processingFeeAmount,
        transaction_fee_per: transactionFeePer,
        transaction_fees_total: transactionFeesTotal,
        refund_fee_per: refundFeePer,
        refund_fees_total: refundFeesTotal,
        chargeback_fee_per: chargebackFeePer,
        chargeback_fees_total: chargebackFeesTotal,
        processing_fee_credit: processingFeeCredit,
        total_fees: totalFees,
        settlement_fee_percent: settlementFeePercent,
        settlement_fee_amount: settlementFeeAmount,
        merchant_payout: merchantPayout,
        reserve_deducted: reserveDeducted,
        reserve_balance: reserveBalance,
        period_start: requestedPeriodStart || minDate?.toISOString(),
        period_end: requestedPeriodEnd || maxDate?.toISOString(),
        created_by: userId,
        notes: notes || null
      })
      .select()
      .single()

    if (reportError) {
      console.error('Report creation error:', reportError)
      throw new Error(`Failed to create report: ${reportError.message}`)
    }

    // Create report items
    const items = transactions.map((t: any) => ({
      settlement_report_id: report.id,
      cust_session: t.cust_session,
      transaction_date: t.transaction_date,
      cust_name: t.cust_name,
      cust_email: t.cust_email_ad,
      amount: parseFloat(t.cust_amount || 0),
      currency: t.currency || 'CAD',
      status: t.status,
      trans_type: t.trans_type,
      cust_trans_id: t.cust_trans_id,
      is_refund: t.is_refund || false,
      is_chargeback: t.is_chargeback || false
    }))

    const { error: itemsError } = await supabase
      .from('settlement_report_items')
      .insert(items)

    if (itemsError) {
      console.error('Items creation error:', itemsError)
      // Rollback: delete the report
      await supabase.from('settlement_reports').delete().eq('id', report.id)
      throw new Error(`Failed to create report items: ${itemsError.message}`)
    }

    // Update cpt_data to link transactions to this report (batch update in parallel)
    const updatePromises = transactions.map(t =>
      supabase
        .from('cpt_data')
        .update({ settlement_report_id: report.id })
        .eq('cust_session', t.cust_session)
        .eq('transaction_date', t.transaction_date)
    )
    await Promise.all(updatePromises)

    // Mark adjustments as applied (single batch query)
    if (adjustments.length > 0) {
      const adjustmentIds = adjustments.map((adj: any) => adj.id)
      await supabase
        .from('settlement_adjustments')
        .update({
          status: 'applied',
          applied_to_settlement_id: report.id,
          applied_at: new Date().toISOString()
        })
        .in('id', adjustmentIds)
    }

    // Update reserve_collected in site_pricing if reserve was deducted
    if (reserveDeducted > 0 && pricing) {
      await supabase
        .from('site_pricing')
        .update({ reserve_collected: reserveBalance })
        .eq('id', pricing.id)
    }

    return new Response(JSON.stringify({
      success: true,
      report: {
        id: report.id,
        report_number: reportNumber,
        site_name: site_name,
        total_transactions: transactions.length,
        gross_amount: gross,
        net_amount: netAfterAdjustments,
        total_fees: totalFees,
        merchant_payout: merchantPayout,
        period_start: requestedPeriodStart || minDate?.toISOString(),
        period_end: requestedPeriodEnd || maxDate?.toISOString()
      },
      fees: {
        processing_fee_percent: processingFeePercent,
        processing_fee_amount: processingFeeAmount,
        transaction_fee_per: transactionFeePer,
        transaction_fees_total: transactionFeesTotal,
        refund_fee_per: refundFeePer,
        refund_fees_total: refundFeesTotal,
        chargeback_fee_per: chargebackFeePer,
        chargeback_fees_total: chargebackFeesTotal,
        processing_fee_credit: processingFeeCredit,
        total_fees: totalFees,
        settlement_fee_percent: settlementFeePercent,
        settlement_fee_amount: settlementFeeAmount
      },
      reserve: {
        reserve_deducted: reserveDeducted,
        reserve_balance: reserveBalance
      },
      adjustments_applied: adjustmentsCount
    }), {
      status: 200,
      headers: corsHeaders
    })

  } catch (err) {
    console.error('Create settlement report error:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Internal server error'
    }), {
      status: 500,
      headers: getCorsHeaders(req.headers.get('origin'))
    })
  }
})
