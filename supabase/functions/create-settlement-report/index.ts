// Supabase Edge Function: create-settlement-report
// ===========================================
// Creates a settlement report with authoritative fee calculations.
// All fee logic is computed server-side - frontend only submits transaction selections.
//
// Deploy: supabase functions deploy create-settlement-report
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/create-settlement-report

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

interface CreateReportRequest {
  site_name: string
  transaction_keys: TransactionKey[]
  notes?: string
  created_by?: string
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
    const body: CreateReportRequest = await req.json()
    const { site_name, transaction_keys, notes, created_by } = body

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

    // Fetch transactions
    const transactions: any[] = []
    let minDate: Date | null = null
    let maxDate: Date | null = null
    let siteId: string | null = null

    for (const key of transaction_keys) {
      const { data: tx } = await supabase
        .from('cpt_data')
        .select('*')
        .eq('cust_session', key.cust_session)
        .eq('transaction_date', key.transaction_date)
        .single()

      if (tx) {
        // Check if transaction is already settled
        if (tx.is_settled || tx.settlement_report_id) {
          return new Response(JSON.stringify({
            success: false,
            error: `Transaction ${tx.cust_session} is already included in a settlement report`
          }), {
            status: 400,
            headers: corsHeaders
          })
        }

        transactions.push(tx)

        // Track date range
        const txDate = new Date(tx.transaction_date)
        if (!minDate || txDate < minDate) minDate = txDate
        if (!maxDate || txDate > maxDate) maxDate = txDate

        // Get site_id from first transaction
        if (!siteId && tx.site_id) siteId = tx.site_id
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
    let gross = 0
    let refundsAmount = 0
    let chargebacksAmount = 0
    let successfulCount = 0
    let refundCount = 0
    let chargebackCount = 0

    for (const t of transactions) {
      const amount = parseFloat(t.cust_amount || 0)
      if (t.is_refund) {
        refundsAmount += amount
        refundCount++
      } else if (t.is_chargeback) {
        chargebacksAmount += amount
        chargebackCount++
      } else {
        gross += amount
        successfulCount++
      }
    }

    const net = gross // Net from current batch

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
      processingFeeCredit = adjustmentsTotal * (processingFeePercent / 100)

      // Total fees
      totalFees = processingFeeAmount + transactionFeesTotal + refundFeesTotal + chargebackFeesTotal - processingFeeCredit
    }

    const merchantPayout = netAfterAdjustments - totalFees

    // =============================================
    // CREATE REPORT
    // =============================================

    // Generate report number
    const reportNumber = `SR-${Date.now().toString(36).toUpperCase()}`

    // Create the settlement report
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
        merchant_payout: merchantPayout,
        period_start: minDate?.toISOString(),
        period_end: maxDate?.toISOString(),
        created_by: created_by || null,
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

    // Update cpt_data to link transactions to this report
    for (const t of transactions) {
      await supabase
        .from('cpt_data')
        .update({ settlement_report_id: report.id })
        .eq('cust_session', t.cust_session)
        .eq('transaction_date', t.transaction_date)
    }

    // Mark adjustments as applied
    if (adjustments.length > 0) {
      for (const adj of adjustments) {
        await supabase
          .from('settlement_adjustments')
          .update({
            status: 'applied',
            applied_to_settlement_id: report.id,
            applied_at: new Date().toISOString()
          })
          .eq('id', adj.id)
      }
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
        period_start: minDate?.toISOString(),
        period_end: maxDate?.toISOString()
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
        total_fees: totalFees
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
      headers: corsHeaders
    })
  }
})
