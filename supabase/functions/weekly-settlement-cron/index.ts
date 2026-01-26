// Supabase Edge Function: weekly-settlement-cron
// ================================================
// Runs every Monday at 6AM PST to create settlement reports for the previous week.
// Creates reports 1 week in arrears (for the Mon-Sun that ended yesterday).
//
// Trigger: Supabase cron job (pg_cron)
// Schedule: 0 14 * * 1 (6AM PST = 14:00 UTC)
//
// Deploy: supabase functions deploy weekly-settlement-cron
// URL: https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/weekly-settlement-cron

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sites to process
const SITES = [
  "MOHWK-STORE",
  "15302781 Canada Inc.",
  "AP Online Store Inc.",
  "Bravento"
]

// System user ID for created_by field
const SYSTEM_USER_ID = "61b88a2e-4354-4d2a-84e0-8fa8c940ecba"

interface Transaction {
  cust_session: string
  transaction_date: string
  cust_amount: number
  is_refund: boolean
  is_chargeback: boolean
  site_id: string
}

interface Pricing {
  id: string
  site_id: string
  site_name: string
  percentage_fee: number
  per_transaction_fee: number
  refund_fee: number
  chargeback_fee: number
  reserve_amount: number
  reserve_collected: number
}

interface FeeCalculation {
  gross: number
  refunds_amount: number
  chargebacks_amount: number
  net: number
  successful_count: number
  refund_count: number
  chargeback_count: number
  processing_fee_percent: number
  processing_fee_amount: number
  transaction_fee_per: number
  transaction_fees_total: number
  refund_fee_per: number
  refund_fees_total: number
  chargeback_fee_per: number
  chargeback_fees_total: number
  total_fees: number
  reserve_deducted: number
  reserve_balance: number
  merchant_payout: number
}

function getPreviousWeekRange(): { start: Date; end: Date } {
  // Get current date in PST
  const now = new Date()
  const pstOffset = -8 * 60 // PST is UTC-8
  const pstNow = new Date(now.getTime() + (pstOffset + now.getTimezoneOffset()) * 60000)

  const today = new Date(pstNow.getFullYear(), pstNow.getMonth(), pstNow.getDate())

  // Find the most recent Sunday (yesterday if today is Monday)
  const dayOfWeek = today.getDay()
  let daysSinceSunday = dayOfWeek
  if (daysSinceSunday === 0) daysSinceSunday = 7 // If today is Sunday, go back to last Sunday

  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - daysSinceSunday)

  const lastMonday = new Date(lastSunday)
  lastMonday.setDate(lastSunday.getDate() - 6)

  return { start: lastMonday, end: lastSunday }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function calculateFees(transactions: Transaction[], pricing: Pricing, reserveCollected: number): FeeCalculation {
  let gross = 0
  let refundsAmount = 0
  let chargebacksAmount = 0
  let successfulCount = 0
  let refundCount = 0
  let chargebackCount = 0

  for (const t of transactions) {
    const amount = parseFloat(String(t.cust_amount || 0))
    gross += amount
    successfulCount++

    if (t.is_refund) {
      refundsAmount += amount
      refundCount++
    } else if (t.is_chargeback) {
      chargebacksAmount += amount
      chargebackCount++
    }
  }

  const net = gross - refundsAmount - chargebacksAmount

  // Calculate fees
  const processingFeePercent = parseFloat(String(pricing.percentage_fee || 0))
  const processingFeeAmount = net * (processingFeePercent / 100)

  const transactionFeePer = parseFloat(String(pricing.per_transaction_fee || 0))
  const transactionFeesTotal = successfulCount * transactionFeePer

  const refundFeePer = parseFloat(String(pricing.refund_fee || 0))
  const refundFeesTotal = refundCount * refundFeePer

  const chargebackFeePer = parseFloat(String(pricing.chargeback_fee || 0))
  const chargebackFeesTotal = chargebackCount * chargebackFeePer

  const totalFees = processingFeeAmount + transactionFeesTotal + refundFeesTotal + chargebackFeesTotal
  let merchantPayout = net - totalFees

  // Calculate reserve deduction
  const reserveAmount = parseFloat(String(pricing.reserve_amount || 0))
  const reserveRemaining = Math.max(0, reserveAmount - reserveCollected)
  let reserveDeducted = 0

  if (reserveRemaining > 0 && merchantPayout > 0) {
    reserveDeducted = Math.min(merchantPayout, reserveRemaining)
    merchantPayout = merchantPayout - reserveDeducted
  }

  return {
    gross,
    refunds_amount: refundsAmount,
    chargebacks_amount: chargebacksAmount,
    net,
    successful_count: successfulCount,
    refund_count: refundCount,
    chargeback_count: chargebackCount,
    processing_fee_percent: processingFeePercent,
    processing_fee_amount: processingFeeAmount,
    transaction_fee_per: transactionFeePer,
    transaction_fees_total: transactionFeesTotal,
    refund_fee_per: refundFeePer,
    refund_fees_total: refundFeesTotal,
    chargeback_fee_per: chargebackFeePer,
    chargeback_fees_total: chargebackFeesTotal,
    total_fees: totalFees,
    reserve_deducted: reserveDeducted,
    reserve_balance: reserveCollected + reserveDeducted,
    merchant_payout: merchantPayout
  }
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check for authorization (cron jobs use service role key)
    const authHeader = req.headers.get('authorization')

    // Allow cron jobs (no auth) or service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the date range for the previous week
    const { start, end } = getPreviousWeekRange()
    const startStr = formatDate(start)
    const endStr = formatDate(end)

    console.log(`Processing week: ${startStr} to ${endStr}`)

    const results: Array<{
      site: string
      status: string
      report_number?: string
      transactions?: number
      merchant_payout?: number
      error?: string
    }> = []

    for (const siteName of SITES) {
      console.log(`Processing ${siteName}...`)

      // Fetch pricing
      const { data: pricingData } = await supabase
        .from('site_pricing')
        .select('*')
        .eq('site_name', siteName)
        .single()

      if (!pricingData) {
        results.push({ site: siteName, status: 'skipped', error: 'No pricing configured' })
        continue
      }

      const pricing = pricingData as Pricing

      // Fetch unsettled completed transactions for this week
      const { data: allTransactions } = await supabase
        .from('cpt_data')
        .select('cust_session, transaction_date, cust_amount, is_refund, is_chargeback, site_id')
        .eq('site_name', siteName)
        .eq('trans_type', 'complete')
        .is('settlement_report_id', null)
        .order('transaction_date', { ascending: true })

      // Filter by date range
      const startDt = new Date(`${startStr}T00:00:00Z`)
      const endDt = new Date(`${endStr}T23:59:59Z`)

      const transactions = (allTransactions || []).filter((t: any) => {
        const txDate = new Date(t.transaction_date)
        return txDate >= startDt && txDate <= endDt
      }) as Transaction[]

      if (transactions.length === 0) {
        results.push({ site: siteName, status: 'skipped', error: 'No transactions for this week' })
        continue
      }

      // Calculate fees
      const reserveCollected = parseFloat(String(pricing.reserve_collected || 0))
      const fees = calculateFees(transactions, pricing, reserveCollected)

      // Generate report number
      const reportNumber = `SR-${Date.now().toString(36).toUpperCase()}`

      // Get site_id from first transaction
      const siteId = transactions[0].site_id || pricing.site_id

      // Create the settlement report
      const { data: report, error: reportError } = await supabase
        .from('settlement_reports')
        .insert({
          report_number: reportNumber,
          site_id: siteId,
          site_name: siteName,
          status: 'pending',
          total_transactions: transactions.length,
          gross_amount: fees.gross,
          refunds_amount: fees.refunds_amount,
          chargebacks_amount: fees.chargebacks_amount,
          net_amount: fees.net,
          processing_fee_percent: fees.processing_fee_percent,
          processing_fee_amount: fees.processing_fee_amount,
          transaction_fee_per: fees.transaction_fee_per,
          transaction_fees_total: fees.transaction_fees_total,
          refund_fee_per: fees.refund_fee_per,
          refund_fees_total: fees.refund_fees_total,
          chargeback_fee_per: fees.chargeback_fee_per,
          chargeback_fees_total: fees.chargeback_fees_total,
          total_fees: fees.total_fees,
          reserve_deducted: fees.reserve_deducted,
          reserve_balance: fees.reserve_balance,
          merchant_payout: fees.merchant_payout,
          period_start: `${startStr}T00:00:00Z`,
          period_end: `${endStr}T23:59:59Z`,
          created_by: SYSTEM_USER_ID,
          notes: `Auto-generated weekly settlement for ${startStr} to ${endStr}`
        })
        .select()
        .single()

      if (reportError) {
        results.push({ site: siteName, status: 'error', error: reportError.message })
        continue
      }

      // Create report items
      const items = transactions.map(t => ({
        settlement_report_id: report.id,
        cust_session: t.cust_session,
        transaction_date: t.transaction_date,
        amount: parseFloat(String(t.cust_amount || 0)),
        currency: 'CAD',
        is_refund: t.is_refund || false,
        is_chargeback: t.is_chargeback || false
      }))

      await supabase.from('settlement_report_items').insert(items)

      // Update cpt_data to link transactions to the report
      for (const t of transactions) {
        await supabase
          .from('cpt_data')
          .update({ settlement_report_id: report.id })
          .eq('cust_session', t.cust_session)
          .eq('transaction_date', t.transaction_date)
      }

      // Update reserve_collected if reserve was deducted
      if (fees.reserve_deducted > 0) {
        await supabase
          .from('site_pricing')
          .update({ reserve_collected: fees.reserve_balance })
          .eq('id', pricing.id)
      }

      results.push({
        site: siteName,
        status: 'success',
        report_number: reportNumber,
        transactions: transactions.length,
        merchant_payout: fees.merchant_payout
      })

      console.log(`Created ${reportNumber} for ${siteName}`)
    }

    // Log the run
    await supabase.from('refund_audit_log').insert({
      user_id: SYSTEM_USER_ID,
      action: 'weekly_settlement_cron',
      details: {
        period_start: startStr,
        period_end: endStr,
        results
      }
    })

    return new Response(JSON.stringify({
      success: true,
      period: { start: startStr, end: endStr },
      results
    }), {
      status: 200,
      headers: corsHeaders
    })

  } catch (err) {
    console.error('Weekly settlement cron error:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Internal server error'
    }), {
      status: 500,
      headers: corsHeaders
    })
  }
})
