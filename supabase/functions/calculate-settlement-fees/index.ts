// Supabase Edge Function: calculate-settlement-fees
// ===========================================
// Calculates settlement fees for a given set of transactions and site.
// This is the authoritative source of truth for fee calculations.
//
// Security: Requires valid JWT authentication
//
// Deploy: supabase functions deploy calculate-settlement-fees
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/calculate-settlement-fees

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

interface CalculationRequest {
  site_name: string
  transaction_keys: TransactionKey[]
  include_pending_adjustments?: boolean
}

interface FeeCalculation {
  // Transaction totals
  gross: number
  refunds: number
  chargebacks: number
  net: number

  // Adjustment totals
  adjustments_total: number
  adjustments_count: number
  net_after_adjustments: number

  // Transaction counts
  successful_count: number
  refund_count: number
  chargeback_count: number
  adjustment_refund_count: number
  adjustment_chargeback_count: number

  // Fee configuration
  processing_fee_percent: number
  transaction_fee_per: number
  refund_fee_per: number
  chargeback_fee_per: number
  settlement_fee_percent: number

  // Calculated fees
  processing_fee_amount: number
  transaction_fees_total: number
  refund_fees_total: number
  chargeback_fees_total: number
  processing_fee_credit: number
  total_fees: number
  settlement_fee_amount: number

  // Final payout
  merchant_payout: number

  // Reserve
  reserve_amount: number
  reserve_collected: number
  reserve_remaining: number
  reserve_deducted: number
  reserve_balance: number

  // Metadata
  pricing_configured: boolean
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

    // =============================================
    // PARSE REQUEST
    // =============================================
    const body: CalculationRequest = await req.json()
    const { site_name, transaction_keys, include_pending_adjustments = true } = body

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

    // Fetch site pricing
    const { data: pricing, error: pricingError } = await supabase
      .from('site_pricing')
      .select('*')
      .eq('site_name', site_name)
      .single()

    const pricingConfigured = !pricingError && pricing !== null

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
    const transactions = (allSiteTransactions || []).filter(tx =>
      selectedKeys.has(`${tx.cust_session}|||${tx.transaction_date}`)
    )

    if (transactions.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No valid transactions found'
      }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Fetch pending adjustments if requested
    let pendingAdjustments: any[] = []
    if (include_pending_adjustments) {
      const { data: adjustments } = await supabase
        .from('settlement_adjustments')
        .select('*')
        .eq('site_name', site_name)
        .eq('status', 'pending')

      pendingAdjustments = adjustments || []
    }

    // Calculate transaction totals
    // All transactions are included in gross, then refunds/chargebacks are deducted
    let gross = 0
    let refunds = 0
    let chargebacks = 0
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
        refunds += amount
        refundCount++
      } else if (t.is_chargeback) {
        chargebacks += amount
        chargebackCount++
      }
    }

    // Net = Gross minus refunds and chargebacks
    const net = gross - refunds - chargebacks

    // Calculate adjustment totals
    const adjustmentsTotal = pendingAdjustments.reduce(
      (sum, a) => sum + parseFloat(a.amount || 0),
      0
    )
    const adjustmentsCount = pendingAdjustments.length
    const adjRefundCount = pendingAdjustments.filter(a => a.reason === 'refund').length
    const adjChargebackCount = pendingAdjustments.filter(a => a.reason === 'chargeback').length

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

    if (pricingConfigured && pricing) {
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

    // Calculate reserve
    let reserveAmount = 0
    let reserveCollected = 0
    let reserveRemaining = 0
    let reserveDeducted = 0
    let reserveBalance = 0

    if (pricingConfigured && pricing) {
      reserveAmount = parseFloat(pricing.reserve_amount || 0)
      reserveCollected = parseFloat(pricing.reserve_collected || 0)
      reserveRemaining = Math.max(0, reserveAmount - reserveCollected)

      if (reserveRemaining > 0 && merchantPayout > 0) {
        // Deduct up to the remaining reserve needed (but not more than payout)
        reserveDeducted = Math.min(merchantPayout, reserveRemaining)
        merchantPayout = merchantPayout - reserveDeducted
      }

      // New reserve balance after this deduction
      reserveBalance = reserveCollected + reserveDeducted
    }

    // Calculate settlement fee (percentage of payout after all other fees and reserves)
    let settlementFeePercent = 0
    let settlementFeeAmount = 0

    if (pricingConfigured && pricing && merchantPayout > 0) {
      settlementFeePercent = parseFloat(pricing.settlement_fee || 0)
      if (settlementFeePercent > 0) {
        settlementFeeAmount = merchantPayout * (settlementFeePercent / 100)
        merchantPayout = merchantPayout - settlementFeeAmount
      }
    }

    const calculation: FeeCalculation = {
      // Transaction totals
      gross,
      refunds,
      chargebacks,
      net,

      // Adjustment totals
      adjustments_total: adjustmentsTotal,
      adjustments_count: adjustmentsCount,
      net_after_adjustments: netAfterAdjustments,

      // Transaction counts
      successful_count: successfulCount,
      refund_count: refundCount,
      chargeback_count: chargebackCount,
      adjustment_refund_count: adjRefundCount,
      adjustment_chargeback_count: adjChargebackCount,

      // Fee configuration
      processing_fee_percent: processingFeePercent,
      transaction_fee_per: transactionFeePer,
      refund_fee_per: refundFeePer,
      chargeback_fee_per: chargebackFeePer,
      settlement_fee_percent: settlementFeePercent,

      // Calculated fees
      processing_fee_amount: processingFeeAmount,
      transaction_fees_total: transactionFeesTotal,
      refund_fees_total: refundFeesTotal,
      chargeback_fees_total: chargebackFeesTotal,
      processing_fee_credit: processingFeeCredit,
      total_fees: totalFees,
      settlement_fee_amount: settlementFeeAmount,

      // Final payout
      merchant_payout: merchantPayout,

      // Reserve
      reserve_amount: reserveAmount,
      reserve_collected: reserveCollected,
      reserve_remaining: reserveRemaining,
      reserve_deducted: reserveDeducted,
      reserve_balance: reserveBalance,

      // Metadata
      pricing_configured: pricingConfigured
    }

    return new Response(JSON.stringify({
      success: true,
      calculation,
      transaction_count: transactions.length,
      site_name
    }), {
      status: 200,
      headers: corsHeaders
    })

  } catch (err) {
    console.error('Calculate settlement fees error:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Internal server error'
    }), {
      status: 500,
      headers: getCorsHeaders(req.headers.get('origin'))
    })
  }
})
