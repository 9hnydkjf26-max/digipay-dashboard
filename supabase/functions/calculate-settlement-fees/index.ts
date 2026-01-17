// Supabase Edge Function: calculate-settlement-fees
// ===========================================
// Calculates settlement fees for a given set of transactions and site.
// This is the authoritative source of truth for fee calculations.
//
// Deploy: supabase functions deploy calculate-settlement-fees
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/calculate-settlement-fees

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
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

  // Calculated fees
  processing_fee_amount: number
  transaction_fees_total: number
  refund_fees_total: number
  chargeback_fees_total: number
  processing_fee_credit: number
  total_fees: number

  // Final payout
  merchant_payout: number

  // Metadata
  pricing_configured: boolean
}

serve(async (req) => {
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

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch site pricing
    const { data: pricing, error: pricingError } = await supabase
      .from('site_pricing')
      .select('*')
      .eq('site_name', site_name)
      .single()

    const pricingConfigured = !pricingError && pricing !== null

    // Fetch transactions
    const transactions = []
    for (const key of transaction_keys) {
      const { data: tx } = await supabase
        .from('cpt_data')
        .select('*')
        .eq('cust_session', key.cust_session)
        .eq('transaction_date', key.transaction_date)
        .single()

      if (tx) {
        transactions.push(tx)
      }
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
    let gross = 0
    let refunds = 0
    let chargebacks = 0
    let successfulCount = 0
    let refundCount = 0
    let chargebackCount = 0

    for (const t of transactions) {
      const amount = parseFloat(t.cust_amount || 0)
      if (t.is_refund) {
        refunds += amount
        refundCount++
      } else if (t.is_chargeback) {
        chargebacks += amount
        chargebackCount++
      } else {
        gross += amount
        successfulCount++
      }
    }

    const net = gross // Net from current batch (refunds/chargebacks are separate line items)

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
      // Processing fee (percentage of gross)
      processingFeePercent = parseFloat(pricing.percentage_fee) || 0
      processingFeeAmount = gross * (processingFeePercent / 100)

      // Per-transaction fee (only on successful transactions)
      transactionFeePer = parseFloat(pricing.per_transaction_fee || 0)
      transactionFeesTotal = successfulCount * transactionFeePer

      // Refund fees (current batch refunds + adjustment refunds)
      refundFeePer = parseFloat(pricing.refund_fee || 0)
      refundFeesTotal = (refundCount + adjRefundCount) * refundFeePer

      // Chargeback fees (current batch chargebacks + adjustment chargebacks)
      chargebackFeePer = parseFloat(pricing.chargeback_fee || 0)
      chargebackFeesTotal = (chargebackCount + adjChargebackCount) * chargebackFeePer

      // Processing fee credit: ONLY for adjustments (refunds/chargebacks from previous settlements)
      // NOT for current batch refunds - those are net $0 with fees calculated on gross only
      // This credit returns the processing fee that was charged on the original transaction
      processingFeeCredit = adjustmentsTotal * (processingFeePercent / 100)

      // Total fees
      totalFees = processingFeeAmount + transactionFeesTotal + refundFeesTotal + chargebackFeesTotal - processingFeeCredit
    }

    const merchantPayout = netAfterAdjustments - totalFees

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

      // Calculated fees
      processing_fee_amount: processingFeeAmount,
      transaction_fees_total: transactionFeesTotal,
      refund_fees_total: refundFeesTotal,
      chargeback_fees_total: chargebackFeesTotal,
      processing_fee_credit: processingFeeCredit,
      total_fees: totalFees,

      // Final payout
      merchant_payout: merchantPayout,

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
      headers: corsHeaders
    })
  }
})
