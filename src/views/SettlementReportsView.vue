<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, watch, nextTick } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import { useFormatting } from '@/composables/useFormatting'
import { useDateFormatting } from '@/composables/useDateFormatting'
import CustomDropdown from '@/components/CustomDropdown.vue'
import ExcelJS from 'exceljs'

const { supabase } = useSupabase()
const { success: showSuccess, error: showError } = useAlerts()
const { formatCurrency } = useFormatting()
const { formatDate, getRelativeTime } = useDateFormatting()

// Database stores timestamps in Pacific Time without timezone info
const SOURCE_TIMEZONE = 'America/Los_Angeles'

// Convert database timestamp (stored in Pacific) to proper Date object
function convertToTimezone(dateStr) {
  const match = dateStr?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  if (!match) return new Date(dateStr)
  // Parse as UTC first, then adjust for the fact that it's actually Pacific
  const utcDate = new Date(match[1] + 'Z')
  const tzStr = utcDate.toLocaleString('en-US', { timeZone: SOURCE_TIMEZONE, hour12: false })
  const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC', hour12: false })
  const offsetMs = (new Date(utcStr) - new Date(tzStr))
  return new Date(utcDate.getTime() + offsetMs)
}

// Format transaction dates in Pacific Time (since that's what the source data is in)
function formatTransactionDate(dateStr) {
  const date = convertToTimezone(dateStr)
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: SOURCE_TIMEZONE }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SOURCE_TIMEZONE })
  }
}

// State
const loading = ref(true)
const activeTab = ref('create')
const allTransactions = ref([])
const filteredTransactions = ref([])
const selectedTransactions = ref(new Set())
const lastClickedIndex = ref(null)
const settlementReports = ref([])  // All settlement reports (status no longer matters)
const pendingAdjustments = ref([])
const allPendingAdjustments = ref([])  // Cross-site adjustments for management UI
const activityLog = ref([])  // Recent activity for audit trail

// Merchant payments tracking
const merchantPayments = ref([])  // Payments for current site
const allSiteBalances = ref([])   // Balance summary per site
const showPaymentModal = ref(false)
const paymentForm = ref({
  amount: '',
  payment_date: new Date().toISOString().split('T')[0],
  payment_method: 'wire',
  reference_number: '',
  notes: ''
})
const savingPayment = ref(false)

// Filters
const currentSite = ref('')
const dateRange = ref('all')
const customStartDate = ref('')
const customEndDate = ref('')

// Modals
const showCreateModal = ref(false)
const showViewModal = ref(false)
const viewingReport = ref(null)
const reportItems = ref([])
const reportAdjustments = ref([])
const loadingReportDetails = ref(false)
const reportNotes = ref('')
const creatingReport = ref(false)
const calculatedFees = ref(null)
const loadingFees = ref(false)

// Date range options
const dateRangeOptions = [
  { value: 'all', label: 'All Time' },
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' }
]

// Computed
const sites = computed(() => {
  // Combine sites from all sources: unsettled transactions, settlement reports, and adjustments
  const siteNames = [...new Set([
    ...allTransactions.value.map(t => t.site_name),
    ...settlementReports.value.map(r => r.site_name),
    ...allPendingAdjustments.value.map(a => a.site_name)
  ].filter(Boolean))].sort()
  return [
    { value: '', label: `All Sites (${siteNames.length})` },
    ...siteNames.map(s => ({ value: s, label: s }))
  ]
})

const stats = computed(() => {
  // Filter by current site if one is selected
  const siteReports = currentSite.value
    ? settlementReports.value.filter(r => r.site_name === currentSite.value)
    : settlementReports.value
  const sitePayments = currentSite.value
    ? merchantPayments.value.filter(p => p.site_name === currentSite.value)
    : merchantPayments.value

  const totalOwed = siteReports.reduce((sum, r) => sum + parseFloat(r.merchant_payout || 0), 0)
  const totalPaid = sitePayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
  const balance = totalOwed - totalPaid

  return {
    unsettled: filteredTransactions.value.length,
    totalReports: siteReports.length,
    totalOwed: balance  // Now shows balance (owed - paid)
  }
})

const selectedTotals = computed(() => {
  // All transactions are included in gross, then refunds/chargebacks are deducted
  let gross = 0, refunds = 0, chargebacks = 0
  selectedTransactions.value.forEach(key => {
    const t = findTransaction(key)
    if (t) {
      const amount = parseFloat(t.cust_amount || 0)
      // All transactions contribute to gross
      gross += amount
      // Track refunds and chargebacks for deduction
      if (t.is_refund) refunds += amount
      else if (t.is_chargeback) chargebacks += amount
    }
  })
  const adjTotal = pendingAdjustments.value.reduce((s, a) => s + parseFloat(a.amount || 0), 0)
  // Net = Gross minus refunds and chargebacks
  const net = gross - refunds - chargebacks
  return { gross, refunds, chargebacks, net, adjustments: adjTotal, netAfterAdj: net - adjTotal }
})

// Fetch fees from Edge Function (authoritative source)
async function fetchCalculatedFees() {
  if (!currentSite.value || selectedTransactions.value.size === 0) {
    calculatedFees.value = null
    return
  }

  loadingFees.value = true
  try {
    const transactionKeys = Array.from(selectedTransactions.value).map(key => {
      const [cust_session, transaction_date] = key.split('|||')
      return { cust_session, transaction_date }
    })

    const response = await supabase.functions.invoke('calculate-settlement-fees', {
      body: {
        site_name: currentSite.value,
        transaction_keys: transactionKeys,
        include_pending_adjustments: true
      }
    })

    if (response.error) {
      console.error('Fee calculation error:', response.error)
      calculatedFees.value = null
      return
    }

    const { calculation } = response.data
    if (calculation) {
      // Map Edge Function response to component format
      calculatedFees.value = {
        processingFeePercent: calculation.processing_fee_percent,
        processingFeeAmount: calculation.processing_fee_amount,
        transactionFeePer: calculation.transaction_fee_per,
        transactionFeesTotal: calculation.transaction_fees_total,
        transactionCount: calculation.successful_count,
        refundFeePer: calculation.refund_fee_per,
        refundFeesTotal: calculation.refund_fees_total,
        refundCount: calculation.refund_count + calculation.adjustment_refund_count,
        chargebackFeePer: calculation.chargeback_fee_per,
        chargebackFeesTotal: calculation.chargeback_fees_total,
        chargebackCount: calculation.chargeback_count + calculation.adjustment_chargeback_count,
        processingFeeCredit: calculation.processing_fee_credit,
        totalFees: calculation.total_fees,
        settlementFeePercent: calculation.settlement_fee_percent,
        settlementFeeAmount: calculation.settlement_fee_amount,
        merchantPayout: calculation.merchant_payout,
        reserveAmount: calculation.reserve_amount,
        reserveCollected: calculation.reserve_collected,
        reserveRemaining: calculation.reserve_remaining,
        reserveDeducted: calculation.reserve_deducted,
        reserveBalance: calculation.reserve_balance,
        pricingConfigured: calculation.pricing_configured
      }
    } else {
      calculatedFees.value = null
    }
  } catch (e) {
    console.error('Error fetching fees:', e)
    calculatedFees.value = null
  } finally {
    loadingFees.value = false
  }
}

// Site reports for the current site (for reference)
const siteReports = computed(() => {
  if (!currentSite.value) return []
  return settlementReports.value.filter(r => r.site_name === currentSite.value)
})

// Filtered settlement reports based on selected site (for reports list table)
// Sorted by period_end descending (most recent period first)
const filteredSettlementReports = computed(() => {
  const reports = currentSite.value
    ? settlementReports.value.filter(r => r.site_name === currentSite.value)
    : settlementReports.value
  return [...reports].sort((a, b) => {
    const dateA = new Date(a.period_end || 0)
    const dateB = new Date(b.period_end || 0)
    return dateB - dateA
  })
})

// Format period date range for display
// Parses date-only portion to avoid timezone shifting issues
function formatPeriodRange(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return '—'
  // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
  const startDateStr = periodStart.split('T')[0]
  const endDateStr = periodEnd.split('T')[0]
  // Parse as local date by appending noon time
  const start = new Date(startDateStr + 'T12:00:00')
  const end = new Date(endDateStr + 'T12:00:00')
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

// Filtered adjustments based on selected site
const filteredAdjustments = computed(() => {
  if (!currentSite.value) return allPendingAdjustments.value
  return allPendingAdjustments.value.filter(a => a.site_name === currentSite.value)
})

// Helpers
function findTransaction(key) {
  const [session, date] = key.split('|||')
  return allTransactions.value.find(t => t.cust_session === session && t.transaction_date === date)
}


// Data loading
async function loadTransactions() {
  try {
    const { data, error } = await supabase
      .from('cpt_data')
      .select('*')
      .eq('trans_type', 'complete')
      .order('transaction_date', { ascending: false })

    if (error) throw error

    // Filter out already settled transactions and test transactions
    allTransactions.value = (data || []).filter(t => !t.is_settled && !t.settlement_report_id && !t.is_test)
    applyFilters()
  } catch (e) {
    console.error('Error loading transactions:', e)
    showError('Failed to load transactions')
  }
}

async function loadReports() {
  try {
    const { data } = await supabase
      .from('settlement_reports')
      .select('*')
      .order('created_at', { ascending: false })

    settlementReports.value = data || []
  } catch (e) {
    console.error('Error loading reports:', e)
  }
}

async function loadAdjustments() {
  if (!currentSite.value) {
    pendingAdjustments.value = []
    return
  }

  try {
    const { data } = await supabase
      .from('settlement_adjustments')
      .select('*')
      .eq('site_name', currentSite.value)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    pendingAdjustments.value = data || []
  } catch (e) {
    console.error('Error loading adjustments:', e)
  }
}

// Load ALL pending adjustments across all sites (for management UI)
async function loadAllAdjustments() {
  try {
    const { data } = await supabase
      .from('settlement_adjustments')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    allPendingAdjustments.value = data || []
  } catch (e) {
    console.error('Error loading all adjustments:', e)
  }
}

// Activity/Audit logging
async function logActivity(action, details) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('refund_audit_log').insert({
      user_id: session?.user?.id,
      action: action,
      details: details
    })
  } catch (e) {
    console.error('Error logging activity:', e)
  }
}

async function loadActivityLog() {
  try {
    const { data } = await supabase
      .from('refund_audit_log')
      .select('*')
      .in('action', ['settlement_created', 'settlement_deleted', 'adjustment_created', 'adjustment_deleted', 'payment_recorded', 'payment_deleted'])
      .order('created_at', { ascending: false })
      .limit(50)

    activityLog.value = data || []
  } catch (e) {
    console.error('Error loading activity log:', e)
  }
}

// Merchant Payment Functions
async function loadMerchantPayments() {
  try {
    let query = supabase
      .from('merchant_payments')
      .select('*')
      .order('payment_date', { ascending: false })

    // Filter by site if one is selected
    if (currentSite.value) {
      query = query.eq('site_name', currentSite.value)
    }

    const { data } = await query
    merchantPayments.value = data || []
  } catch (e) {
    console.error('Error loading merchant payments:', e)
  }
}

// Calculate balance for a specific site
function calculateSiteBalance(siteName) {
  // Total Owed = SUM(merchant_payout) from all settlement_reports
  const siteSettlements = siteName
    ? settlementReports.value.filter(r => r.site_name === siteName)
    : settlementReports.value
  const totalOwed = siteSettlements.reduce((sum, r) => sum + parseFloat(r.merchant_payout || 0), 0)

  // Total Paid = SUM(amount) from merchant_payments
  const sitePayments = siteName
    ? merchantPayments.value.filter(p => p.site_name === siteName)
    : merchantPayments.value
  const totalPaid = sitePayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  return {
    totalOwed,
    totalPaid,
    balance: totalOwed - totalPaid
  }
}

// Calculate balance for current site (computed-like)
const currentSiteBalance = computed(() => {
  if (!currentSite.value) return { totalOwed: 0, totalPaid: 0, balance: 0 }
  return calculateSiteBalance(currentSite.value)
})

// Load all site balances for the Payments tab
async function loadAllSiteBalances() {
  try {
    // Get all payments grouped by site
    const { data: payments } = await supabase
      .from('merchant_payments')
      .select('site_name, amount')

    // Get all sites from settlement reports
    const siteNames = [...new Set(settlementReports.value.map(r => r.site_name).filter(Boolean))]

    // Calculate balances per site
    const balances = siteNames.map(siteName => {
      const siteSettlements = settlementReports.value.filter(r => r.site_name === siteName)
      const totalOwed = siteSettlements.reduce((sum, r) => sum + parseFloat(r.merchant_payout || 0), 0)
      const sitePayments = (payments || []).filter(p => p.site_name === siteName)
      const totalPaid = sitePayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

      return {
        site_name: siteName,
        totalOwed,
        totalPaid,
        balance: totalOwed - totalPaid
      }
    })

    // Sort by balance (highest first)
    allSiteBalances.value = balances.sort((a, b) => b.balance - a.balance)
  } catch (e) {
    console.error('Error loading site balances:', e)
  }
}

// Open payment modal with pre-filled amount
function openPaymentModal() {
  if (!currentSite.value) {
    showError('Please select a site first')
    return
  }

  const balance = currentSiteBalance.value.balance
  paymentForm.value = {
    amount: balance > 0 ? balance.toFixed(2) : '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'wire',
    reference_number: '',
    notes: ''
  }
  showPaymentModal.value = true
}

// Record a new payment
async function recordPayment() {
  if (savingPayment.value) return

  const amount = parseFloat(paymentForm.value.amount)
  if (!amount || amount <= 0) {
    showError('Please enter a valid amount')
    return
  }

  savingPayment.value = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      throw new Error('Not authenticated')
    }

    const { error } = await supabase
      .from('merchant_payments')
      .insert({
        site_name: currentSite.value,
        site_id: currentSite.value, // Using site_name as site_id for now
        amount: amount,
        payment_date: paymentForm.value.payment_date + 'T12:00:00.000Z',
        payment_method: paymentForm.value.payment_method,
        reference_number: paymentForm.value.reference_number || null,
        notes: paymentForm.value.notes || null,
        created_by: session.user.id
      })

    if (error) throw error

    // Log activity
    await logActivity('payment_recorded', {
      site_name: currentSite.value,
      amount: amount,
      payment_method: paymentForm.value.payment_method,
      reference_number: paymentForm.value.reference_number
    })

    showSuccess(`Payment of ${formatCurrency(amount)} recorded successfully`)
    showPaymentModal.value = false

    // Reload data
    await loadMerchantPayments()
    await loadAllSiteBalances()
    await loadActivityLog()
  } catch (e) {
    console.error('Error recording payment:', e)
    showError('Failed to record payment: ' + (e.message || e))
  } finally {
    savingPayment.value = false
  }
}

// Delete a payment
async function deletePayment(payment) {
  if (!confirm(`Delete payment of ${formatCurrency(payment.amount)} from ${formatDate(payment.payment_date)}?`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('merchant_payments')
      .delete()
      .eq('id', payment.id)

    if (error) throw error

    // Log activity
    await logActivity('payment_deleted', {
      site_name: payment.site_name,
      amount: payment.amount,
      payment_method: payment.payment_method,
      payment_date: payment.payment_date
    })

    showSuccess('Payment deleted')
    await loadMerchantPayments()
    await loadAllSiteBalances()
    await loadActivityLog()
  } catch (e) {
    console.error('Error deleting payment:', e)
    showError('Failed to delete payment')
  }
}

// Payment method options
const paymentMethodOptions = [
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'ach', label: 'ACH' },
  { value: 'check', label: 'Check' },
  { value: 'e-transfer', label: 'E-Transfer' },
  { value: 'other', label: 'Other' }
]

// Delete adjustment
async function deleteAdjustment(adjustment) {
  if (!confirm(`Delete this ${adjustment.reason} adjustment for ${formatCurrency(adjustment.amount)}?`)) return

  try {
    const { error } = await supabase
      .from('settlement_adjustments')
      .delete()
      .eq('id', adjustment.id)

    if (error) throw error

    await logActivity('adjustment_deleted', {
      adjustment_id: adjustment.id,
      reason: adjustment.reason,
      amount: adjustment.amount,
      site_name: adjustment.site_name,
      original_customer: adjustment.original_cust_name
    })

    showSuccess('Adjustment deleted')
    await loadAdjustments()
    await loadAllAdjustments()
  } catch (e) {
    console.error('Error deleting adjustment:', e)
    showError('Failed to delete adjustment')
  }
}

// Export settlement report as Excel with separate sheets
async function exportReportExcel(report, items) {
  // Fetch past settlement reports for this site (oldest first for running balance)
  const { data: pastReports } = await supabase
    .from('settlement_reports')
    .select('*')
    .eq('site_name', report.site_name)
    .order('created_at', { ascending: true })

  // Fetch payments for this site (oldest first for running balance)
  const { data: sitePayments } = await supabase
    .from('merchant_payments')
    .select('*')
    .eq('site_name', report.site_name)
    .order('payment_date', { ascending: true })

  // Create workbook
  const wb = new ExcelJS.Workbook()

  // Styling helpers
  const borderThin = { style: 'thin', color: { argb: 'FFB0B0B0' } }
  const borderMedium = { style: 'medium', color: { argb: 'FF404040' } }

  // ===== Sheet 1: Summary =====
  const wsSummary = wb.addWorksheet('Summary')
  wsSummary.columns = [
    { width: 22 },
    { width: 14 },
    { width: 12 }
  ]

  // Calculate total deductions
  const totalDeductions = parseFloat(report.adjustments_total || 0) +
    parseFloat(report.total_fees || 0) +
    parseFloat(report.reserve_deducted || 0) +
    parseFloat(report.settlement_fee_amount || 0)

  // Title
  const titleRow = wsSummary.addRow(['Settlement Report'])
  titleRow.getCell(1).font = { bold: true, size: 16 }
  wsSummary.addRow([])

  // Report info
  const infoRows = [
    ['Report #', report.report_number],
    ['Site', report.site_name],
    ['Period', `${report.period_start ? new Date(report.period_start).toLocaleDateString() : '—'} to ${report.period_end ? new Date(report.period_end).toLocaleDateString() : '—'}`],
    ['Created', new Date(report.created_at).toLocaleDateString()]
  ]
  infoRows.forEach(row => {
    const r = wsSummary.addRow(row)
    r.getCell(1).font = { bold: true }
  })

  wsSummary.addRow([])

  // Transactions section
  const txnHeader = wsSummary.addRow(['TRANSACTIONS', '', `${report.total_transactions} transactions`])
  txnHeader.getCell(1).font = { bold: true, size: 12 }
  txnHeader.getCell(1).border = { bottom: borderMedium }
  txnHeader.getCell(2).border = { bottom: borderMedium }
  txnHeader.getCell(3).border = { bottom: borderMedium }

  const txnRows = [
    ['Gross Sales', parseFloat(report.gross_amount || 0)],
    ['Refunds', -parseFloat(report.refunds_amount || 0)],
    ['Chargebacks', -parseFloat(report.chargebacks_amount || 0)]
  ]
  txnRows.forEach(row => {
    const r = wsSummary.addRow(row)
    r.getCell(2).numFmt = '#,##0.00'
  })

  const netRow = wsSummary.addRow(['Net Sales', parseFloat(report.net_amount || 0)])
  netRow.getCell(1).font = { bold: true }
  netRow.getCell(2).font = { bold: true }
  netRow.getCell(2).numFmt = '#,##0.00'
  netRow.getCell(1).border = { top: borderThin }
  netRow.getCell(2).border = { top: borderThin }

  wsSummary.addRow([])

  // Fees section
  const feesHeader = wsSummary.addRow(['FEES & DEDUCTIONS'])
  feesHeader.getCell(1).font = { bold: true, size: 12 }
  feesHeader.getCell(1).border = { bottom: borderMedium }
  feesHeader.getCell(2).border = { bottom: borderMedium }
  feesHeader.getCell(3).border = { bottom: borderMedium }

  const feeRows = [
    ['Adjustments', -parseFloat(report.adjustments_total || 0), report.adjustments_count ? `(${report.adjustments_count} applied)` : ''],
    ['Processing Fee', -parseFloat(report.processing_fee_amount || 0), report.processing_fee_percent ? `${report.processing_fee_percent}%` : ''],
    ['Transaction Fees', -parseFloat(report.transaction_fees_total || 0), ''],
    ['Refund Fees', -parseFloat(report.refund_fees_total || 0), ''],
    ['Chargeback Fees', -parseFloat(report.chargeback_fees_total || 0), ''],
    ['Fee Credit', parseFloat(report.processing_fee_credit || 0), ''],
    ['Reserve Withheld', -parseFloat(report.reserve_deducted || 0), ''],
    ['Settlement Fee', -parseFloat(report.settlement_fee_amount || 0), report.settlement_fee_percent ? `${report.settlement_fee_percent}%` : '']
  ]
  feeRows.forEach(row => {
    const r = wsSummary.addRow(row)
    r.getCell(2).numFmt = '#,##0.00'
  })

  const totalDeductRow = wsSummary.addRow(['Total Deductions', -totalDeductions])
  totalDeductRow.getCell(1).font = { bold: true }
  totalDeductRow.getCell(2).font = { bold: true }
  totalDeductRow.getCell(2).numFmt = '#,##0.00'
  totalDeductRow.getCell(1).border = { top: borderThin }
  totalDeductRow.getCell(2).border = { top: borderThin }

  wsSummary.addRow([])

  // Payout
  const payoutRow = wsSummary.addRow(['MERCHANT PAYOUT', parseFloat(report.merchant_payout || 0)])
  payoutRow.getCell(1).font = { bold: true, size: 12 }
  payoutRow.getCell(2).font = { bold: true, size: 12 }
  payoutRow.getCell(2).numFmt = '#,##0.00'
  payoutRow.getCell(1).border = { top: borderMedium, bottom: borderMedium }
  payoutRow.getCell(2).border = { top: borderMedium, bottom: borderMedium }

  wsSummary.addRow([])

  const reserveRow = wsSummary.addRow(['Reserve Balance', parseFloat(report.reserve_balance || 0)])
  reserveRow.getCell(1).font = { italic: true }
  reserveRow.getCell(2).numFmt = '#,##0.00'

  // ===== Sheet 2: Transactions =====
  const wsTxn = wb.addWorksheet('Transactions')
  wsTxn.columns = [
    { width: 25 },
    { width: 30 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 22 }
  ]

  const txnHeaderRow = wsTxn.addRow(['Customer', 'Email', 'Date', 'Amount', 'Type', 'Transaction ID'])
  txnHeaderRow.font = { bold: true }
  txnHeaderRow.eachCell(cell => {
    cell.border = { bottom: borderMedium }
  })

  items.forEach(item => {
    const r = wsTxn.addRow([
      item.cust_name || '',
      item.cust_email || '',
      new Date(item.transaction_date).toLocaleDateString(),
      parseFloat(item.amount || 0),
      item.is_refund ? 'Refund' : item.is_chargeback ? 'Chargeback' : 'Payment',
      item.cust_trans_id || ''
    ])
    r.getCell(4).numFmt = '#,##0.00'
  })

  // ===== Sheet 3: Account Ledger =====
  const wsLedger = wb.addWorksheet('Account Ledger')
  wsLedger.columns = [
    { width: 12 },  // Date
    { width: 12 },  // Type
    { width: 18 },  // Reference
    { width: 12 },  // Period Start
    { width: 12 },  // Period End
    { width: 14 },  // Gross
    { width: 12 },  // Fees
    { width: 12 },  // Refunds
    { width: 12 },  // Chargebacks
    { width: 12 },  // Reserve
    { width: 14 },  // Owed
    { width: 14 },  // Paid
    { width: 14 }   // Balance
  ]

  const ledgerHeaderRow = wsLedger.addRow(['Date', 'Type', 'Reference', 'Period Start', 'Period End', 'Gross', 'Fees', 'Refunds', 'Chargebacks', 'Reserve', 'Owed', 'Paid', 'Balance'])
  ledgerHeaderRow.font = { bold: true }
  ledgerHeaderRow.eachCell(cell => {
    cell.border = { bottom: borderMedium }
  })

  // Build ledger entries
  const ledgerEntries = []
  for (const r of (pastReports || [])) {
    // Parse period dates
    let periodStart = ''
    let periodEnd = ''
    let entryDate = new Date(r.created_at)
    if (r.period_start && r.period_end) {
      const startDateStr = r.period_start.split('T')[0]
      const endDateStr = r.period_end.split('T')[0]
      const startDate = new Date(startDateStr + 'T12:00:00')
      const endDate = new Date(endDateStr + 'T12:00:00')
      periodStart = startDate.toLocaleDateString()
      periodEnd = endDate.toLocaleDateString()
      entryDate = endDate  // Use period end as the date
    }
    ledgerEntries.push({
      date: entryDate,
      type: 'Settlement',
      reference: r.report_number,
      periodStart: periodStart,
      periodEnd: periodEnd,
      gross: parseFloat(r.gross_amount || 0),
      fees: parseFloat(r.total_fees || 0),
      refunds: parseFloat(r.refunds_amount || 0),
      chargebacks: parseFloat(r.chargebacks_amount || 0),
      reserve: parseFloat(r.reserve_deducted || 0),
      owed: parseFloat(r.merchant_payout || 0),
      paid: 0
    })
  }
  for (const p of (sitePayments || [])) {
    const methodLabel = { wire: 'Wire Transfer', ach: 'ACH', check: 'Check', 'e-transfer': 'E-Transfer', other: 'Other' }[p.payment_method] || p.payment_method
    ledgerEntries.push({
      date: new Date(p.payment_date),
      type: 'Payment',
      reference: p.reference_number || methodLabel,
      periodStart: '',
      periodEnd: '',
      gross: 0,
      fees: 0,
      refunds: 0,
      chargebacks: 0,
      reserve: 0,
      owed: 0,
      paid: parseFloat(p.amount || 0)
    })
  }
  ledgerEntries.sort((a, b) => a.date - b.date)

  let runningBalance = 0
  ledgerEntries.forEach(entry => {
    runningBalance += entry.owed - entry.paid
    const r = wsLedger.addRow([
      entry.date.toLocaleDateString(),
      entry.type,
      entry.reference,
      entry.periodStart,
      entry.periodEnd,
      entry.gross || null,
      entry.fees || null,
      entry.refunds || null,
      entry.chargebacks || null,
      entry.reserve || null,
      entry.owed || null,
      entry.paid || null,
      runningBalance
    ])
    r.getCell(6).numFmt = '#,##0.00'
    r.getCell(7).numFmt = '#,##0.00'
    r.getCell(8).numFmt = '#,##0.00'
    r.getCell(9).numFmt = '#,##0.00'
    r.getCell(10).numFmt = '#,##0.00'
    r.getCell(11).numFmt = '#,##0.00'
    r.getCell(12).numFmt = '#,##0.00'
    r.getCell(13).numFmt = '#,##0.00'
  })

  // Totals row
  wsLedger.addRow([])
  const totalGross = ledgerEntries.reduce((sum, e) => sum + e.gross, 0)
  const totalFees = ledgerEntries.reduce((sum, e) => sum + e.fees, 0)
  const totalRefunds = ledgerEntries.reduce((sum, e) => sum + e.refunds, 0)
  const totalChargebacks = ledgerEntries.reduce((sum, e) => sum + e.chargebacks, 0)
  const totalReserve = ledgerEntries.reduce((sum, e) => sum + e.reserve, 0)
  const totalOwedLedger = ledgerEntries.reduce((sum, e) => sum + e.owed, 0)
  const totalPaidLedger = ledgerEntries.reduce((sum, e) => sum + e.paid, 0)
  const totalsRow = wsLedger.addRow(['', '', 'TOTALS', '', '', totalGross, totalFees, totalRefunds, totalChargebacks, totalReserve, totalOwedLedger, totalPaidLedger, runningBalance])
  totalsRow.font = { bold: true }
  totalsRow.getCell(6).numFmt = '#,##0.00'
  totalsRow.getCell(7).numFmt = '#,##0.00'
  totalsRow.getCell(8).numFmt = '#,##0.00'
  totalsRow.getCell(9).numFmt = '#,##0.00'
  totalsRow.getCell(10).numFmt = '#,##0.00'
  totalsRow.getCell(11).numFmt = '#,##0.00'
  totalsRow.getCell(12).numFmt = '#,##0.00'
  totalsRow.getCell(13).numFmt = '#,##0.00'
  totalsRow.eachCell((cell, colNumber) => {
    if (colNumber >= 3) cell.border = { top: borderMedium }
  })

  // Download the file
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${report.report_number}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// HTML escape function to prevent XSS
function escapeHtml(text) {
  if (text == null) return ''
  const str = String(text)
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Export settlement report as printable HTML (opens in new window)
function exportReportPrint(report, items, adjustments) {
  const periodStart = report.period_start ? new Date(report.period_start).toLocaleDateString() : null
  const periodEnd = report.period_end ? new Date(report.period_end).toLocaleDateString() : null
  const createdDate = new Date(report.created_at).toLocaleDateString()
  const paidDate = report.paid_at ? new Date(report.paid_at).toLocaleDateString() : null

  // Escape user-controlled data to prevent XSS
  const safeReportNumber = escapeHtml(report.report_number)
  const safeSiteName = escapeHtml(report.site_name)
  const safeNotes = escapeHtml(report.notes)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Settlement Report ${safeReportNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #fff;
      color: #1a1a2e;
      line-height: 1.5;
      font-size: 14px;
    }
    .container { max-width: 600px; margin: 0 auto; padding: 48px 24px; }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
    }
    .report-id {
      font-size: 13px;
      font-weight: 500;
      color: #64748b;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-paid { background: #ecfdf5; color: #059669; }
    .badge-pending { background: #fffbeb; color: #d97706; }

    /* Hero */
    .hero {
      text-align: center;
      padding: 32px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    .hero-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748b;
      margin-bottom: 8px;
    }
    .hero-amount {
      font-size: 42px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: #0f172a;
      line-height: 1.1;
    }
    .hero-meta {
      margin-top: 12px;
      font-size: 14px;
      color: #64748b;
    }
    .hero-meta .divider {
      margin: 0 8px;
      opacity: 0.4;
    }

    /* Stats */
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat {
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    /* Section */
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 12px;
    }
    .section-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    /* Breakdown */
    .breakdown-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    .breakdown-row:last-child { border-bottom: none; }
    .breakdown-label { font-size: 14px; color: #475569; }
    .breakdown-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #1e293b;
    }
    .breakdown-row.muted .breakdown-label { color: #94a3b8; }
    .breakdown-row.muted .breakdown-value { color: #64748b; }
    .breakdown-row.total {
      background: #fff;
      border-top: 2px solid #e2e8f0;
    }
    .breakdown-row.total .breakdown-label { font-weight: 600; color: #0f172a; }
    .breakdown-row.total .breakdown-value { font-size: 16px; font-weight: 600; color: #0f172a; }

    /* Fees */
    .fee-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      font-size: 13px;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
    }
    .fee-row:last-of-type { border-bottom: none; }
    .fee-amount { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    .fee-row.credit .fee-amount { color: #059669; }
    .fee-total {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      font-weight: 600;
      color: #1e293b;
      background: #fff;
      border-top: 2px solid #e2e8f0;
    }

    /* Adjustments */
    .adj-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    .adj-row:last-child { border-bottom: none; }
    .adj-info { display: flex; align-items: center; gap: 10px; }
    .adj-badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .adj-badge.refund { background: #fef3c7; color: #b45309; }
    .adj-badge.chargeback { background: #fee2e2; color: #dc2626; }
    .adj-details { font-size: 13px; color: #475569; }
    .adj-from { font-size: 12px; color: #94a3b8; }
    .adj-amount { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 500; color: #64748b; }

    /* Table */
    table { width: 100%; border-collapse: collapse; }
    th {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: left;
      padding: 10px 16px;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
    }
    th:last-child { text-align: right; }
    td {
      padding: 10px 16px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13px;
      vertical-align: middle;
      background: #fff;
    }
    tr:last-child td { border-bottom: none; }
    .customer-name { font-weight: 500; color: #1e293b; }
    .customer-email { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .tx-amount {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      text-align: right;
      color: #1e293b;
    }
    .tx-amount.negative { color: #64748b; }
    .tx-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .tx-badge.payment { background: #ecfdf5; color: #059669; }
    .tx-badge.refund { background: #fffbeb; color: #d97706; }
    .tx-badge.chargeback { background: #fef2f2; color: #dc2626; }

    /* Notes */
    .notes-content {
      font-size: 14px;
      color: #475569;
      padding: 16px;
    }

    /* Footer */
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
    }

    @media print {
      .container { padding: 24px; }
      .section-card, .stat, .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <span class="report-id">${safeReportNumber} · ${safeSiteName}</span>
      <span class="badge badge-${escapeHtml(report.status)}">${escapeHtml(report.status)}</span>
    </div>

    <!-- Hero -->
    <div class="hero">
      <div class="hero-label">Merchant Payout</div>
      <div class="hero-amount">${formatCurrency(report.merchant_payout || report.net_amount)}</div>
      <div class="hero-meta">
        <span>${report.total_transactions || items.length} transactions</span>
        <span class="divider">·</span>
        <span>${safeSiteName}</span>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Period</div>
        <div class="stat-value">${periodStart || '—'}${periodEnd ? ' → ' + periodEnd : ''}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Created</div>
        <div class="stat-value">${createdDate}</div>
      </div>
      <div class="stat">
        <div class="stat-label">${paidDate ? 'Paid' : 'Status'}</div>
        <div class="stat-value">${paidDate || escapeHtml(report.status)}</div>
      </div>
    </div>

    <!-- Financial Breakdown -->
    <div class="section">
      <div class="section-title">Financial Breakdown</div>
      <div class="section-card">
        <div class="breakdown-row">
          <span class="breakdown-label">Gross Sales</span>
          <span class="breakdown-value">${formatCurrency(report.gross_amount)}</span>
        </div>
        ${report.refunds_amount > 0 ? `
        <div class="breakdown-row muted">
          <span class="breakdown-label">Refunds</span>
          <span class="breakdown-value">−${formatCurrency(report.refunds_amount)}</span>
        </div>` : ''}
        ${report.chargebacks_amount > 0 ? `
        <div class="breakdown-row muted">
          <span class="breakdown-label">Chargebacks</span>
          <span class="breakdown-value">−${formatCurrency(report.chargebacks_amount)}</span>
        </div>` : ''}
        ${report.adjustments_total > 0 ? `
        <div class="breakdown-row muted">
          <span class="breakdown-label">Adjustments (${report.adjustments_count || adjustments?.length || 0})</span>
          <span class="breakdown-value">−${formatCurrency(report.adjustments_total)}</span>
        </div>` : ''}
        ${report.total_fees > 0 ? `
        <div class="breakdown-row muted">
          <span class="breakdown-label">Processing Fees</span>
          <span class="breakdown-value">−${formatCurrency(report.total_fees)}</span>
        </div>` : ''}
        ${report.reserve_deducted > 0 ? `
        <div class="breakdown-row muted">
          <span class="breakdown-label">Reserve Held</span>
          <span class="breakdown-value" style="color: #d97706;">−${formatCurrency(report.reserve_deducted)}</span>
        </div>` : ''}
        <div class="breakdown-row total">
          <span class="breakdown-label">Merchant Payout</span>
          <span class="breakdown-value">${formatCurrency(report.merchant_payout || report.net_amount)}</span>
        </div>
        ${report.reserve_balance > 0 ? `
        <div class="breakdown-row" style="background: #fffbeb; border-top: 1px dashed #fbbf24;">
          <span class="breakdown-label" style="color: #d97706;">Reserve Balance</span>
          <span class="breakdown-value" style="color: #d97706;">${formatCurrency(report.reserve_balance)}</span>
        </div>` : ''}
      </div>
    </div>

    ${report.total_fees > 0 ? `
    <!-- Fee Details -->
    <div class="section">
      <div class="section-title">Processing Fees</div>
      <div class="section-card">
        ${report.processing_fee_amount > 0 ? `
        <div class="fee-row">
          <span>Processing Fee (${parseFloat(report.processing_fee_percent || 0).toFixed(2)}%)</span>
          <span class="fee-amount">−${formatCurrency(report.processing_fee_amount)}</span>
        </div>` : ''}
        ${report.transaction_fees_total > 0 ? `
        <div class="fee-row">
          <span>Transaction Fees (${formatCurrency(report.transaction_fee_per)} × ${report.total_transactions || items.filter(i => !i.is_refund && !i.is_chargeback).length})</span>
          <span class="fee-amount">−${formatCurrency(report.transaction_fees_total)}</span>
        </div>` : ''}
        ${report.refund_fees_total > 0 ? `
        <div class="fee-row">
          <span>Refund Fees</span>
          <span class="fee-amount">−${formatCurrency(report.refund_fees_total)}</span>
        </div>` : ''}
        ${report.chargeback_fees_total > 0 ? `
        <div class="fee-row">
          <span>Chargeback Fees</span>
          <span class="fee-amount">−${formatCurrency(report.chargeback_fees_total)}</span>
        </div>` : ''}
        ${report.processing_fee_credit > 0 ? `
        <div class="fee-row credit">
          <span>Processing Fee Credit</span>
          <span class="fee-amount">+${formatCurrency(report.processing_fee_credit)}</span>
        </div>` : ''}
        <div class="fee-total">
          <span>Total Fees</span>
          <span>−${formatCurrency(report.total_fees)}</span>
        </div>
      </div>
    </div>` : ''}

    ${adjustments && adjustments.length > 0 ? `
    <!-- Adjustments -->
    <div class="section">
      <div class="section-title">Post-Settlement Adjustments</div>
      <div class="section-card">
        ${adjustments.map(adj => `
        <div class="adj-row">
          <div class="adj-info">
            <span class="adj-badge ${escapeHtml(adj.reason)}">${escapeHtml(adj.reason)}</span>
            <div>
              <div class="adj-details">${escapeHtml(adj.original_cust_name) || 'Unknown'}</div>
              <div class="adj-from">from ${escapeHtml(adj.original_settlement_report_number) || '—'}</div>
            </div>
          </div>
          <span class="adj-amount">−${formatCurrency(adj.amount)}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    ${report.notes ? `
    <!-- Notes -->
    <div class="section">
      <div class="section-title">Notes</div>
      <div class="section-card">
        <div class="notes-content">${safeNotes}</div>
      </div>
    </div>` : ''}

    <!-- Transactions -->
    <div class="section">
      <div class="section-title">Transactions (${items.length})</div>
      <div class="section-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
            <tr>
              <td>${new Date(item.transaction_date).toLocaleDateString()}</td>
              <td>
                <div class="customer-name">${escapeHtml(item.cust_name) || '—'}</div>
                <div class="customer-email">${escapeHtml(item.cust_email) || ''}</div>
              </td>
              <td>
                <span class="tx-badge ${item.is_refund ? 'refund' : item.is_chargeback ? 'chargeback' : 'payment'}">
                  ${item.is_refund ? 'Refund' : item.is_chargeback ? 'Chargeback' : 'Payment'}
                </span>
              </td>
              <td class="tx-amount ${item.is_refund || item.is_chargeback ? 'negative' : ''}">${formatCurrency(item.amount, item.currency)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      Generated on ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank')
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 250)
}

function applyFilters() {
  let filtered = currentSite.value
    ? allTransactions.value.filter(t => t.site_name === currentSite.value)
    : [...allTransactions.value]

  // Date filter
  if (dateRange.value !== 'all') {
    const now = new Date()
    let startDate = null

    if (dateRange.value === 'custom' && customStartDate.value) {
      startDate = new Date(customStartDate.value)
    } else if (dateRange.value !== 'custom') {
      const days = parseInt(dateRange.value)
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    }

    if (startDate) {
      filtered = filtered.filter(t => new Date(t.transaction_date) >= startDate)
    }

    if (dateRange.value === 'custom' && customEndDate.value) {
      const endDate = new Date(customEndDate.value)
      endDate.setUTCHours(23, 59, 59, 999)
      filtered = filtered.filter(t => new Date(t.transaction_date) <= endDate)
    }
  }

  filteredTransactions.value = filtered
}

// Selection
function getTransactionKey(t) {
  return `${t.cust_session}|||${t.transaction_date}`
}

function handleRowClick(index, event) {
  const t = filteredTransactions.value[index]
  const key = getTransactionKey(t)

  if (event.shiftKey && lastClickedIndex.value !== null) {
    // Shift-click: select range
    const start = Math.min(lastClickedIndex.value, index)
    const end = Math.max(lastClickedIndex.value, index)

    for (let i = start; i <= end; i++) {
      const rangeKey = getTransactionKey(filteredTransactions.value[i])
      selectedTransactions.value.add(rangeKey)
    }
    selectedTransactions.value = new Set(selectedTransactions.value)
  } else {
    // Normal click: toggle single
    if (selectedTransactions.value.has(key)) {
      selectedTransactions.value.delete(key)
    } else {
      selectedTransactions.value.add(key)
    }
    selectedTransactions.value = new Set(selectedTransactions.value)
    lastClickedIndex.value = index
  }
}

function toggleTransaction(key, index) {
  if (selectedTransactions.value.has(key)) {
    selectedTransactions.value.delete(key)
  } else {
    selectedTransactions.value.add(key)
  }
  selectedTransactions.value = new Set(selectedTransactions.value)
  if (index !== undefined) {
    lastClickedIndex.value = index
  }
}

function selectAll() {
  filteredTransactions.value.forEach(t => {
    selectedTransactions.value.add(getTransactionKey(t))
  })
  selectedTransactions.value = new Set(selectedTransactions.value)
}

function deselectAll() {
  selectedTransactions.value = new Set()
  lastClickedIndex.value = null
}

function isSelected(t) {
  return selectedTransactions.value.has(getTransactionKey(t))
}

// Create Report
function openCreateModal() {
  if (selectedTransactions.value.size === 0) return
  reportNotes.value = ''
  showCreateModal.value = true
}

async function createReport() {
  if (creatingReport.value) return
  creatingReport.value = true

  try {
    // Build transaction keys from selection
    const transactionKeys = Array.from(selectedTransactions.value).map(key => {
      const [cust_session, transaction_date] = key.split('|||')
      return { cust_session, transaction_date }
    })

    if (transactionKeys.length === 0) {
      showError('No valid transactions selected')
      return
    }

    // Calculate period dates based on selected date range
    // Use noon UTC to avoid timezone shifting the date
    let periodStart = null
    let periodEnd = null

    if (dateRange.value === 'custom') {
      if (customStartDate.value) {
        periodStart = customStartDate.value + 'T12:00:00.000Z'
      }
      if (customEndDate.value) {
        periodEnd = customEndDate.value + 'T12:00:00.000Z'
      }
    } else if (dateRange.value !== 'all') {
      const days = parseInt(dateRange.value)
      const now = new Date()
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      periodStart = startDate.toISOString().split('T')[0] + 'T12:00:00.000Z'
      periodEnd = now.toISOString().split('T')[0] + 'T12:00:00.000Z'
    }

    // Call Edge Function to create report (user ID extracted from JWT server-side)
    const response = await supabase.functions.invoke('create-settlement-report', {
      body: {
        site_name: currentSite.value,
        transaction_keys: transactionKeys,
        notes: reportNotes.value || null,
        period_start: periodStart,
        period_end: periodEnd
      }
    })

    if (response.error) {
      throw new Error(response.error.message || 'Failed to create report')
    }

    if (!response.data?.success) {
      throw new Error(response.data?.error || 'Failed to create report')
    }

    const { report } = response.data
    showSuccess(`Settlement report ${report.report_number} created successfully`)

    // Log activity
    await logActivity('settlement_created', {
      report_id: report.id,
      report_number: report.report_number,
      site_name: currentSite.value,
      transaction_count: transactionKeys.length,
      net_amount: report.net_amount
    })

    // Close modal first
    showCreateModal.value = false

    // Clear selection immediately (before data reload)
    selectedTransactions.value = new Set()
    calculatedFees.value = null

    // Reload data while still on current tab - this updates the unsettled list
    await loadTransactions()
    await loadReports()
    await loadAdjustments()

    // Wait for DOM to settle after data reload
    await nextTick()

    // Now switch to pending tab after everything is loaded
    activeTab.value = 'pending'

  } catch (e) {
    console.error('Error creating report:', e)
    showError(`Failed to create settlement report: ${e.message || e}`)
  } finally {
    creatingReport.value = false
  }
}

// Report actions
async function deleteReport(reportId, forceDelete = false) {
  // Initial confirmation
  if (!forceDelete && !confirm('Are you sure you want to delete this report? Transactions will become available again.')) {
    return
  }

  try {
    // Call Edge Function to delete report (user ID extracted from JWT server-side)
    const response = await supabase.functions.invoke('delete-settlement-report', {
      body: {
        report_id: reportId,
        force: forceDelete
      }
    })

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete report')
    }

    const result = response.data

    // If server requires confirmation for adjustments, show dialog and retry with force
    if (result.requires_confirmation) {
      const confirmed = confirm(result.confirmation_message + '\n\nContinue?')
      if (confirmed) {
        return deleteReport(reportId, true)
      }
      return
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete report')
    }

    // Success - show message with details
    let successMessage = `Report ${result.report_number} deleted`
    if (result.transactions_unsettled > 0) {
      successMessage += ` (${result.transactions_unsettled} transactions unsettled)`
    }
    showSuccess(successMessage)

    // Reload all data
    await loadTransactions()
    await loadReports()
    await loadAdjustments()
    await loadAllAdjustments()
    await loadActivityLog()

  } catch (e) {
    console.error('Error deleting report:', e)
    showError(e.message || 'Failed to delete report')
  }
}

async function viewReport(report) {
  viewingReport.value = report
  reportItems.value = []
  reportAdjustments.value = []
  loadingReportDetails.value = true
  showViewModal.value = true

  try {
    // Fetch report items (transactions)
    const { data: items } = await supabase
      .from('settlement_report_items')
      .select('*')
      .eq('settlement_report_id', report.id)
      .order('transaction_date', { ascending: false })

    // Fetch customer info from cpt_data for items missing it
    const itemsWithCustomerInfo = items || []
    if (itemsWithCustomerInfo.length > 0) {
      const sessions = itemsWithCustomerInfo.map(i => i.cust_session).filter(Boolean)
      if (sessions.length > 0) {
        const { data: cptData } = await supabase
          .from('cpt_data')
          .select('cust_session, transaction_date, cust_name, cust_email_ad, cust_trans_id')
          .in('cust_session', sessions)

        // Create lookup map
        const cptMap = new Map()
        ;(cptData || []).forEach(c => {
          const key = `${c.cust_session}|||${c.transaction_date}`
          cptMap.set(key, c)
        })

        // Merge customer info into items
        itemsWithCustomerInfo.forEach(item => {
          const key = `${item.cust_session}|||${item.transaction_date}`
          const cpt = cptMap.get(key)
          if (cpt) {
            item.cust_name = item.cust_name || cpt.cust_name
            item.cust_email = item.cust_email || cpt.cust_email_ad
            item.cust_trans_id = item.cust_trans_id || cpt.cust_trans_id
          }
        })
      }
    }

    reportItems.value = itemsWithCustomerInfo

    // Fetch adjustments applied to this report
    const { data: adjustments } = await supabase
      .from('settlement_adjustments')
      .select('*')
      .eq('applied_to_settlement_id', report.id)
      .order('created_at', { ascending: false })

    reportAdjustments.value = adjustments || []
  } catch (e) {
    console.error('Error loading report details:', e)
  } finally {
    loadingReportDetails.value = false
  }
}

// Watchers
watch(currentSite, () => {
  selectedTransactions.value = new Set()
  calculatedFees.value = null
  applyFilters()
  loadAdjustments()
  loadMerchantPayments()
})

watch([dateRange, customStartDate, customEndDate], () => {
  applyFilters()
})

// Fetch fees when Create modal opens
watch(showCreateModal, (isOpen) => {
  if (isOpen && currentSite.value && selectedTransactions.value.size > 0) {
    fetchCalculatedFees()
  }
})

// Debounced fee recalculation when selection changes (only if modal is open)
let feeDebounceTimer = null
watch(selectedTransactions, () => {
  if (showCreateModal.value && currentSite.value) {
    clearTimeout(feeDebounceTimer)
    feeDebounceTimer = setTimeout(() => {
      fetchCalculatedFees()
    }, 300)
  }
}, { deep: true })

// Escape key to close modals
function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    if (showPaymentModal.value) {
      showPaymentModal.value = false
    } else if (showCreateModal.value) {
      showCreateModal.value = false
    } else if (showViewModal.value) {
      showViewModal.value = false
    }
  }
}

// Init
onMounted(async () => {
  loading.value = true
  await Promise.all([loadTransactions(), loadReports(), loadAllAdjustments(), loadActivityLog()])
  await loadAllSiteBalances()  // Load after reports are loaded
  loading.value = false

  document.addEventListener('keydown', handleEscapeKey)
})

// Reload data when navigating back to this page (KeepAlive)
onActivated(async () => {
  // Silently refresh data in background without showing loading state
  await Promise.all([loadTransactions(), loadReports(), loadAdjustments(), loadAllAdjustments(), loadActivityLog(), loadMerchantPayments()])
  await loadAllSiteBalances()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscapeKey)
})
</script>

<template>
  <div class="reports-page settlement">
    <!-- Background -->
    <div class="reports-bg">
      <div class="reports-grid"></div>
      <div class="reports-glow reports-glow-1"></div>
      <div class="reports-glow reports-glow-2"></div>
    </div>

    <div class="reports-main">
      <!-- Top Bar -->
      <header class="reports-topbar">
        <div class="reports-topbar-left">
          <div class="reports-page-title">
            <span class="reports-breadcrumb">Reports</span>
            <h1>Settlements</h1>
          </div>
        </div>
              </header>

      <!-- Metrics Strip -->
      <div class="reports-stats-row">
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ formatCurrency(stats.totalOwed) }}</span>
          <span class="reports-stat-label">Balance Owed</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ stats.unsettled }}</span>
          <span class="reports-stat-label">Unsettled Txns</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ stats.totalReports }}</span>
          <span class="reports-stat-label">Reports</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ allPendingAdjustments.length }}</span>
          <span class="reports-stat-label">Adjustments</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="settlement-filters">
        <CustomDropdown
          v-model="currentSite"
          :options="sites"
          placeholder="All Sites"
          class="settlement-site-select"
        />
        <CustomDropdown
          v-model="dateRange"
          :options="dateRangeOptions"
          placeholder="All Time"
          class="settlement-date-select"
        />
        <template v-if="dateRange === 'custom'">
          <input type="date" v-model="customStartDate" class="settlement-date-input" placeholder="Start Date" />
          <span class="date-separator">to</span>
          <input type="date" v-model="customEndDate" class="settlement-date-input" placeholder="End Date" />
        </template>

        <!-- Balance Display (when site selected) -->
        <div v-if="currentSite" class="site-balance-display">
          <div class="balance-info">
            <span class="balance-label">Balance Owed:</span>
            <span class="balance-amount" :class="{ 'has-balance': currentSiteBalance.balance > 0 }">
              {{ formatCurrency(currentSiteBalance.balance) }}
            </span>
          </div>
          <button v-if="currentSiteBalance.balance > 0" class="record-payment-btn" @click="openPaymentModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 6v12m6-6H6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Record Payment
          </button>
        </div>
      </div>

      <!-- Panels Container -->
      <div class="panels-container">
        <!-- Create Panel -->
        <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'create' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Unsettled Transactions</div>
            <div class="report-panel-subtitle">
              Select transactions to include in settlement report
              <span class="shift-hint">Hold <kbd>Shift</kbd> to select multiple</span>
            </div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Unsettled
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'reports' }" @click="activeTab = 'reports'">
              Reports
              <span class="report-tab-badge">{{ settlementReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'adjustments' }" @click="activeTab = 'adjustments'">
              Adjustments
              <span v-if="allPendingAdjustments.length > 0" class="report-tab-badge warning">{{ allPendingAdjustments.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'payments' }" @click="activeTab = 'payments'">
              Payments
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">
              Activity
            </button>
          </div>
        </div>

        <!-- Adjustments Warning -->
        <div v-if="pendingAdjustments.length > 0" class="report-alert info" style="margin: 16px 24px;">
          <svg class="report-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="report-alert-content">
            <div class="report-alert-title">{{ pendingAdjustments.length }} Pending Adjustment{{ pendingAdjustments.length > 1 ? 's' : '' }}</div>
            <div class="report-alert-text">
              Total: -{{ formatCurrency(pendingAdjustments.reduce((s, a) => s + parseFloat(a.amount || 0), 0)) }} will be applied to the next report.
            </div>
          </div>
        </div>

        <!-- Content states container - uses CSS Grid stacking to prevent layout shift -->
        <div class="content-states-container">
          <!-- Loading -->
          <div class="report-loading" :class="{ 'state-hidden': !loading }">
            <div class="report-spinner"></div>
            <div style="color: var(--text-tertiary);">Loading transactions...</div>
          </div>

          <!-- Empty State -->
          <div class="report-empty" :class="{ 'state-hidden': loading || filteredTransactions.length > 0 }">
            <div class="report-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="report-empty-title">All caught up!</div>
            <div class="report-empty-text">No unsettled transactions{{ currentSite ? ` for ${currentSite}` : '' }}</div>
          </div>

          <!-- Table -->
          <div class="report-table-wrapper" :class="{ 'state-hidden': loading || filteredTransactions.length === 0 }">
          <!-- Selection Summary Bar -->
          <div v-if="selectedTransactions.size > 0" class="table-selection-bar">
            <span class="selection-bar-count">{{ selectedTransactions.size }} selected</span>
            <span class="selection-bar-divider">·</span>
            <span class="selection-bar-amount">{{ formatCurrency(selectedTotals.netAfterAdj) }}</span>
            <button
              class="selection-bar-btn"
              @click="openCreateModal"
            >
              Create Report
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M5 12h14m-7-7l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <div class="report-table-container">
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 50px;">
                  <input type="checkbox" class="report-checkbox" @change="$event.target.checked ? selectAll() : deselectAll()" />
                </th>
                <th>Date</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Site</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(t, index) in filteredTransactions"
                :key="`${t.cust_session}|||${t.transaction_date}`"
                :class="{ selected: isSelected(t) }"
                @click="handleRowClick(index, $event)"
              >
                <td @click="handleRowClick(index, $event)">
                  <input
                    type="checkbox"
                    class="report-checkbox"
                    :checked="isSelected(t)"
                    @click.stop="handleRowClick(index, $event)"
                  />
                </td>
                <td>
                  <div class="cell-date">
                    <span class="date">{{ formatTransactionDate(t.transaction_date).date }}</span>
                    <span class="time">{{ formatTransactionDate(t.transaction_date).time }} PT</span>
                  </div>
                </td>
                <td>
                  <div class="cell-customer">
                    <span class="name">{{ t.cust_name || '—' }}</span>
                    <span class="email">{{ t.cust_email_ad || '—' }}</span>
                  </div>
                </td>
                <td>
                  <span class="report-amount" :class="{ negative: t.is_refund || t.is_chargeback }">
                    {{ formatCurrency(t.cust_amount, t.currency) }}
                  </span>
                </td>
                <td>
                  <span class="report-status" :class="t.is_refund ? 'refund' : t.is_chargeback ? 'chargeback' : 'complete'">
                    {{ t.is_refund ? 'Refund' : t.is_chargeback ? 'Chargeback' : 'Complete' }}
                  </span>
                </td>
                <td>
                  <span class="cell-site">{{ t.site_name || '—' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
          </div>
        </div><!-- End content-states-container -->
      </div>

      <!-- Reports Panel -->
      <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'reports' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Settlement Reports</div>
            <div class="report-panel-subtitle">All settlement reports</div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Unsettled
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'reports' }" @click="activeTab = 'reports'">
              Reports
              <span class="report-tab-badge">{{ settlementReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'adjustments' }" @click="activeTab = 'adjustments'">
              Adjustments
              <span v-if="allPendingAdjustments.length > 0" class="report-tab-badge warning">{{ allPendingAdjustments.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'payments' }" @click="activeTab = 'payments'">
              Payments
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">
              Activity
            </button>
          </div>
        </div>

        <div v-if="filteredSettlementReports.length === 0" class="report-empty">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">No settlement reports{{ currentSite ? ` for ${currentSite}` : '' }}</div>
          <div class="report-empty-text">{{ currentSite ? 'Select a different site or create a settlement report' : 'Create a settlement report to get started' }}</div>
        </div>

        <div v-else class="report-table-container">
          <table class="report-table reports-list-table">
            <thead>
              <tr>
                <th>Report #</th>
                <th>Period</th>
                <th v-if="!currentSite">Site</th>
                <th>Payout</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filteredSettlementReports" :key="r.id">
                <td><strong>{{ r.report_number }}</strong></td>
                <td>{{ formatPeriodRange(r.period_start, r.period_end) }}</td>
                <td v-if="!currentSite">{{ r.site_name }}</td>
                <td><span class="report-amount">{{ formatCurrency(r.merchant_payout) }}</span></td>
                <td>
                  <div style="display: flex; gap: 8px;">
                    <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px;" @click="viewReport(r)">View</button>
                    <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px; color: var(--accent-danger);" @click="deleteReport(r.id)">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Adjustments Panel -->
      <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'adjustments' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Pending Adjustments</div>
            <div class="report-panel-subtitle">Refunds and chargebacks from paid reports, awaiting settlement</div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Unsettled
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'reports' }" @click="activeTab = 'reports'">
              Reports
              <span class="report-tab-badge">{{ settlementReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'adjustments' }" @click="activeTab = 'adjustments'">
              Adjustments
              <span v-if="allPendingAdjustments.length > 0" class="report-tab-badge warning">{{ allPendingAdjustments.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'payments' }" @click="activeTab = 'payments'">
              Payments
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">
              Activity
            </button>
          </div>
        </div>

        <div v-if="filteredAdjustments.length === 0" class="report-empty">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">No pending adjustments{{ currentSite ? ` for ${currentSite}` : '' }}</div>
          <div class="report-empty-text">When transactions in paid reports are marked as refunded or chargebacked, adjustments will appear here</div>
        </div>

        <div v-else class="report-table-container">
          <table class="report-table reports-list-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Customer</th>
                <th>Original Report</th>
                <th v-if="!currentSite">Site</th>
                <th>Amount</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="adj in filteredAdjustments" :key="adj.id">
                <td>
                  <span class="report-status" :class="adj.reason">{{ adj.reason }}</span>
                </td>
                <td>
                  <div class="cell-customer">
                    <span class="name">{{ adj.original_cust_name || '—' }}</span>
                    <span class="email">{{ adj.original_cust_email || '—' }}</span>
                  </div>
                </td>
                <td><strong>{{ adj.original_settlement_report_number || '—' }}</strong></td>
                <td v-if="!currentSite">{{ adj.site_name }}</td>
                <td><span class="report-amount negative">-{{ formatCurrency(adj.amount) }}</span></td>
                <td>{{ getRelativeTime(adj.created_at) }}</td>
                <td>
                  <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px; color: var(--accent-danger);" @click="deleteAdjustment(adj)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Payments Panel -->
      <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'payments' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Payment Tracking</div>
            <div class="report-panel-subtitle">Record and track payments to merchants</div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Unsettled
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'reports' }" @click="activeTab = 'reports'">
              Reports
              <span class="report-tab-badge">{{ settlementReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'adjustments' }" @click="activeTab = 'adjustments'">
              Adjustments
              <span v-if="allPendingAdjustments.length > 0" class="report-tab-badge warning">{{ allPendingAdjustments.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'payments' }" @click="activeTab = 'payments'">
              Payments
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">
              Activity
            </button>
          </div>
        </div>


        <!-- Payment History -->
        <div v-if="merchantPayments.length > 0" class="payments-history-section">
          <div class="report-table-container">
            <table class="report-table payments-table">
              <thead>
                <tr>
                  <th v-if="!currentSite">Site</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Notes</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="payment in merchantPayments" :key="payment.id">
                  <td v-if="!currentSite">{{ payment.site_name }}</td>
                  <td>{{ formatDate(payment.payment_date) }}</td>
                  <td><span class="report-amount positive">{{ formatCurrency(payment.amount) }}</span></td>
                  <td>
                    <span class="payment-method-badge">
                      {{ paymentMethodOptions.find(o => o.value === payment.payment_method)?.label || payment.payment_method }}
                    </span>
                  </td>
                  <td>{{ payment.reference_number || '—' }}</td>
                  <td class="notes-cell">{{ payment.notes || '—' }}</td>
                  <td class="actions-col">
                    <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px; color: var(--accent-danger);" @click="deletePayment(payment)">Delete</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else-if="merchantPayments.length === 0" class="report-empty" style="margin: 24px;">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">No payments recorded{{ currentSite ? ` for ${currentSite}` : '' }}</div>
          <div class="report-empty-text">Record a payment to track your payment history</div>
        </div>
      </div>

      <!-- Activity Panel -->
      <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'activity' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Recent Activity</div>
            <div class="report-panel-subtitle">Settlement actions and audit trail</div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Unsettled
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'reports' }" @click="activeTab = 'reports'">
              Reports
              <span class="report-tab-badge">{{ settlementReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'adjustments' }" @click="activeTab = 'adjustments'">
              Adjustments
              <span v-if="allPendingAdjustments.length > 0" class="report-tab-badge warning">{{ allPendingAdjustments.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'payments' }" @click="activeTab = 'payments'">
              Payments
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">
              Activity
            </button>
          </div>
        </div>

        <div v-if="activityLog.length === 0" class="report-empty">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">No activity yet</div>
          <div class="report-empty-text">Settlement actions will be logged here</div>
        </div>

        <div v-else class="activity-log">
          <div v-for="log in activityLog" :key="log.id" class="activity-item">
            <div class="activity-icon" :class="log.action">
              <svg v-if="log.action === 'settlement_created'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else-if="log.action === 'settlement_deleted'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else-if="log.action === 'payment_recorded'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else-if="log.action === 'payment_deleted'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="activity-content">
              <div class="activity-text">
                <template v-if="log.action === 'settlement_created'">
                  Created settlement <strong>{{ log.details?.report_number }}</strong> for {{ log.details?.site_name }}
                </template>
                <template v-else-if="log.action === 'settlement_deleted'">
                  Deleted settlement <strong>{{ log.details?.report_number }}</strong>
                </template>
                <template v-else-if="log.action === 'adjustment_created'">
                  Created adjustment for {{ log.details?.reason }} ({{ formatCurrency(log.details?.amount || 0) }})
                </template>
                <template v-else-if="log.action === 'adjustment_deleted'">
                  Deleted {{ log.details?.reason }} adjustment ({{ formatCurrency(log.details?.amount || 0) }})
                </template>
                <template v-else-if="log.action === 'payment_recorded'">
                  Recorded payment of <strong>{{ formatCurrency(log.details?.amount || 0) }}</strong> for {{ log.details?.site_name }}
                </template>
                <template v-else-if="log.action === 'payment_deleted'">
                  Deleted payment of {{ formatCurrency(log.details?.amount || 0) }} for {{ log.details?.site_name }}
                </template>
                <template v-else>
                  {{ log.action }}
                </template>
              </div>
              <div class="activity-meta">{{ getRelativeTime(log.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>
      </div><!-- End panels-container -->
    </div>

    <!-- Create Report Slideout -->
    <Teleport to="body">
      <Transition name="slideout">
      <div v-if="showCreateModal" class="report-slideout-overlay" @click.self="showCreateModal = false">
          <div class="report-slideout">
            <!-- Header -->
            <div class="slideout-header">
              <div class="slideout-header-left">
                <button class="slideout-back" @click="showCreateModal = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div>
                  <div class="slideout-title">New Settlement</div>
                  <div class="slideout-subtitle">Review and create report</div>
                </div>
              </div>
              <span class="slideout-status pending">Draft</span>
            </div>

            <!-- Content -->
            <div class="slideout-content">
              <!-- Hero Payout Section -->
              <div class="slideout-hero">
                <div class="slideout-hero-label">Estimated Payout</div>
                <div class="slideout-hero-amount" :class="{ 'loading-text': loadingFees }">
                  <template v-if="loadingFees"><span class="inline-spinner"></span></template>
                  <template v-else>{{ formatCurrency(calculatedFees ? calculatedFees.merchantPayout : selectedTotals.netAfterAdj) }}</template>
                </div>
                <div class="slideout-hero-meta">
                  <span>{{ currentSite || 'Multiple Sites' }}</span>
                  <span class="slideout-hero-divider">•</span>
                  <span>{{ selectedTransactions.size }} transactions</span>
                </div>
              </div>

              <!-- Quick Stats -->
              <div class="slideout-stats">
                <div class="slideout-stat">
                  <div class="slideout-stat-label">Transactions</div>
                  <div class="slideout-stat-value">{{ selectedTransactions.size }}</div>
                </div>
                <div class="slideout-stat">
                  <div class="slideout-stat-label">Gross Amount</div>
                  <div class="slideout-stat-value">{{ formatCurrency(selectedTotals.gross) }}</div>
                </div>
                <div v-if="loadingFees || (calculatedFees && calculatedFees.totalFees > 0)" class="slideout-stat">
                  <div class="slideout-stat-label">Total Fees</div>
                  <div class="slideout-stat-value" :class="{ 'loading-text': loadingFees }">
                    <template v-if="loadingFees"><span class="inline-spinner small"></span></template>
                    <template v-else>{{ formatCurrency(calculatedFees.totalFees) }}</template>
                  </div>
                </div>
              </div>

              <!-- Financial Breakdown -->
              <div class="slideout-section">
                <div class="slideout-section-title">Financial Breakdown</div>

                <div class="slideout-breakdown">
                  <!-- Gross Sales (includes all transactions) -->
                  <div class="breakdown-row">
                    <span class="breakdown-label">Gross Sales</span>
                    <span class="breakdown-value">{{ formatCurrency(selectedTotals.gross) }}</span>
                  </div>

                  <!-- Refunds (deducted from gross) -->
                  <div v-if="selectedTotals.refunds > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Refunds</span>
                    <span class="breakdown-value">-{{ formatCurrency(selectedTotals.refunds) }}</span>
                  </div>

                  <!-- Chargebacks (deducted from gross) -->
                  <div v-if="selectedTotals.chargebacks > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Chargebacks</span>
                    <span class="breakdown-value">-{{ formatCurrency(selectedTotals.chargebacks) }}</span>
                  </div>

                  <!-- Adjustments -->
                  <div v-if="selectedTotals.adjustments > 0" class="breakdown-row">
                    <span class="breakdown-label">Adjustments ({{ pendingAdjustments.length }})</span>
                    <span class="breakdown-value">-{{ formatCurrency(selectedTotals.adjustments) }}</span>
                  </div>

                  <!-- Total Fees -->
                  <div v-if="loadingFees || (calculatedFees && calculatedFees.totalFees > 0)" class="breakdown-row">
                    <span class="breakdown-label">Processing Fees</span>
                    <span class="breakdown-value" :class="{ 'loading-text': loadingFees }">
                      <template v-if="loadingFees"><span class="inline-spinner small"></span></template>
                      <template v-else>-{{ formatCurrency(calculatedFees.totalFees) }}</template>
                    </span>
                  </div>

                  <!-- Reserve Held -->
                  <div v-if="!loadingFees && calculatedFees && calculatedFees.reserveDeducted > 0" class="breakdown-row reserve">
                    <span class="breakdown-label">Reserve Held</span>
                    <span class="breakdown-value">-{{ formatCurrency(calculatedFees.reserveDeducted) }}</span>
                  </div>

                  <!-- Settlement Fee -->
                  <div v-if="!loadingFees && calculatedFees && calculatedFees.settlementFeeAmount > 0" class="breakdown-row settlement">
                    <span class="breakdown-label">Settlement Fee ({{ calculatedFees.settlementFeePercent.toFixed(2) }}%)</span>
                    <span class="breakdown-value">-{{ formatCurrency(calculatedFees.settlementFeeAmount) }}</span>
                  </div>

                  <!-- Net Payout -->
                  <div class="breakdown-row total">
                    <span class="breakdown-label">Estimated Payout</span>
                    <span class="breakdown-value" :class="{ 'loading-text': loadingFees }">
                      <template v-if="loadingFees"><span class="inline-spinner small"></span></template>
                      <template v-else>{{ formatCurrency(calculatedFees ? calculatedFees.merchantPayout : selectedTotals.netAfterAdj) }}</template>
                    </span>
                  </div>

                  <!-- Reserve Balance -->
                  <div v-if="!loadingFees && calculatedFees && calculatedFees.reserveBalance > 0" class="breakdown-row reserve-balance">
                    <span class="breakdown-label">Reserve Balance</span>
                    <span class="breakdown-value reserve-value">{{ formatCurrency(calculatedFees.reserveBalance) }}</span>
                  </div>
                </div>
              </div>

              <!-- Fees Detail -->
              <div v-if="loadingFees" class="slideout-section">
                <div class="slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Processing Fees
                </div>
                <div class="slideout-fees loading-placeholder">
                  <div class="fee-loading"><span class="inline-spinner"></span></div>
                </div>
              </div>
              <div v-else-if="calculatedFees && calculatedFees.totalFees > 0" class="slideout-section">
                <div class="slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Processing Fees
                </div>
                <div class="slideout-fees">
                  <div v-if="calculatedFees.processingFeeAmount > 0" class="fee-item">
                    <span>Processing Fee ({{ calculatedFees.processingFeePercent.toFixed(2) }}%)</span>
                    <span class="fee-amount">-{{ formatCurrency(calculatedFees.processingFeeAmount) }}</span>
                  </div>
                  <div v-if="calculatedFees.transactionFeesTotal > 0" class="fee-item">
                    <span>Transaction Fees ({{ formatCurrency(calculatedFees.transactionFeePer) }} × {{ calculatedFees.transactionCount }})</span>
                    <span class="fee-amount">-{{ formatCurrency(calculatedFees.transactionFeesTotal) }}</span>
                  </div>
                  <div v-if="calculatedFees.refundFeesTotal > 0" class="fee-item">
                    <span>Refund Fees ({{ formatCurrency(calculatedFees.refundFeePer) }} × {{ calculatedFees.refundCount }})</span>
                    <span class="fee-amount">-{{ formatCurrency(calculatedFees.refundFeesTotal) }}</span>
                  </div>
                  <div v-if="calculatedFees.chargebackFeesTotal > 0" class="fee-item">
                    <span>Chargeback Fees ({{ formatCurrency(calculatedFees.chargebackFeePer) }} × {{ calculatedFees.chargebackCount }})</span>
                    <span class="fee-amount">-{{ formatCurrency(calculatedFees.chargebackFeesTotal) }}</span>
                  </div>
                  <div v-if="calculatedFees.processingFeeCredit > 0" class="fee-item credit">
                    <span>Processing Fee Credit <span class="fee-note">(refunds only)</span></span>
                    <span class="fee-amount positive">+{{ formatCurrency(calculatedFees.processingFeeCredit) }}</span>
                  </div>
                  <div class="fee-total">
                    <span>Net Fees</span>
                    <span>-{{ formatCurrency(calculatedFees.totalFees) }}</span>
                  </div>
                  <div v-if="calculatedFees.settlementFeeAmount > 0" class="fee-item settlement-fee">
                    <span>Settlement Fee ({{ calculatedFees.settlementFeePercent.toFixed(2) }}%) <span class="fee-note">(on final payout)</span></span>
                    <span class="fee-amount">-{{ formatCurrency(calculatedFees.settlementFeeAmount) }}</span>
                  </div>
                </div>
              </div>

              <!-- Adjustments Detail -->
              <div v-if="pendingAdjustments.length > 0" class="slideout-section">
                <div class="slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Pending Adjustments
                </div>
                <div class="slideout-adjustments">
                  <div v-for="adj in pendingAdjustments" :key="adj.id" class="adjustment-item">
                    <div class="adjustment-info">
                      <span class="adjustment-type" :class="adj.reason">{{ adj.reason }}</span>
                      <span class="adjustment-customer">{{ adj.original_cust_name || 'Unknown' }}</span>
                    </div>
                    <span class="adjustment-amount">-{{ formatCurrency(adj.amount) }}</span>
                  </div>
                  <div class="adjustment-total">
                    <span>Total Adjustments</span>
                    <span>-{{ formatCurrency(selectedTotals.adjustments) }}</span>
                  </div>
                </div>
              </div>

              <!-- Notes -->
              <div class="slideout-section">
                <div class="slideout-section-title">Notes (Optional)</div>
                <textarea
                  v-model="reportNotes"
                  class="slideout-textarea"
                  placeholder="Add notes about this settlement..."
                ></textarea>
              </div>

              <!-- Selected Transactions Preview -->
              <div class="slideout-section">
                <div class="slideout-section-title">Selected Transactions ({{ selectedTransactions.size }})</div>
                <div class="slideout-transactions">
                  <table class="slideout-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="key in Array.from(selectedTransactions).slice(0, 10)" :key="key">
                        <template v-if="findTransaction(key)">
                          <td>{{ formatDate(findTransaction(key).transaction_date) }}</td>
                          <td>
                            <div class="customer-cell">
                              <span class="customer-name">{{ findTransaction(key).cust_name || '—' }}</span>
                              <span class="customer-email">{{ findTransaction(key).cust_email_ad || '—' }}</span>
                            </div>
                          </td>
                          <td>
                            <span class="tx-amount" :class="{ negative: findTransaction(key).is_refund || findTransaction(key).is_chargeback }">
                              {{ formatCurrency(findTransaction(key).cust_amount, findTransaction(key).currency) }}
                            </span>
                          </td>
                          <td>
                            <span class="tx-type" :class="findTransaction(key).is_refund ? 'refund' : findTransaction(key).is_chargeback ? 'chargeback' : 'payment'">
                              {{ findTransaction(key).is_refund ? 'Refund' : findTransaction(key).is_chargeback ? 'Chargeback' : 'Payment' }}
                            </span>
                          </td>
                        </template>
                      </tr>
                      <tr v-if="selectedTransactions.size > 10">
                        <td colspan="4" class="no-items">
                          + {{ selectedTransactions.size - 10 }} more transactions
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Footer Actions -->
            <div class="slideout-footer">
              <button class="slideout-btn secondary" @click="showCreateModal = false">
                Cancel
              </button>
              <button class="slideout-btn primary" @click="createReport" :disabled="creatingReport">
                <svg v-if="!creatingReport" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ creatingReport ? 'Creating...' : 'Create Report' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Report Detail Slideout -->
    <Teleport to="body">
      <Transition name="slideout">
        <div v-if="showViewModal" class="report-slideout-overlay" @click.self="showViewModal = false">
          <div class="report-slideout">
            <!-- Header -->
            <div class="slideout-header">
              <div class="slideout-header-left">
                <button class="slideout-back" @click="showViewModal = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div>
                  <div class="slideout-title">{{ viewingReport?.report_number }}</div>
                  <div class="slideout-subtitle">Settlement Report</div>
                </div>
              </div>
            </div>

            <!-- Loading State -->
            <div v-if="loadingReportDetails" class="slideout-loading">
              <div class="slideout-spinner"></div>
              <span>Loading report details...</span>
            </div>

            <!-- Content -->
            <div v-else class="slideout-content">
              <!-- Hero Payout Section -->
              <div class="slideout-hero">
                <div class="slideout-hero-label">Merchant Payout</div>
                <div class="slideout-hero-amount">{{ formatCurrency(viewingReport?.merchant_payout || viewingReport?.net_amount) }}</div>
                <div class="slideout-hero-meta">
                  <span>{{ viewingReport?.site_name }}</span>
                  <span class="slideout-hero-divider">•</span>
                  <span>{{ viewingReport?.total_transactions || reportItems.length }} transactions</span>
                </div>
              </div>

              <!-- Quick Stats -->
              <div class="slideout-stats">
                <div class="slideout-stat">
                  <div class="slideout-stat-label">Period</div>
                  <div class="slideout-stat-value">
                    {{ viewingReport?.period_start ? formatDate(viewingReport.period_start) : '—' }}
                    <span v-if="viewingReport?.period_end"> → {{ formatDate(viewingReport.period_end) }}</span>
                  </div>
                </div>
                <div class="slideout-stat">
                  <div class="slideout-stat-label">Created</div>
                  <div class="slideout-stat-value">{{ formatDate(viewingReport?.created_at) }}</div>
                </div>
              </div>

              <!-- Financial Breakdown -->
              <div class="slideout-section">
                <div class="slideout-section-title">Financial Breakdown</div>

                <div class="slideout-breakdown">
                  <!-- Gross Sales (includes all transactions) -->
                  <div class="breakdown-row">
                    <span class="breakdown-label">Gross Sales</span>
                    <span class="breakdown-value positive">{{ formatCurrency(viewingReport?.gross_amount) }}</span>
                  </div>

                  <!-- Refunds (deducted from gross) -->
                  <div v-if="viewingReport?.refunds_amount > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Refunds</span>
                    <span class="breakdown-value">-{{ formatCurrency(viewingReport.refunds_amount) }}</span>
                  </div>

                  <!-- Chargebacks (deducted from gross) -->
                  <div v-if="viewingReport?.chargebacks_amount > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Chargebacks</span>
                    <span class="breakdown-value">-{{ formatCurrency(viewingReport.chargebacks_amount) }}</span>
                  </div>

                  <!-- Subtotal before adjustments -->
                  <div v-if="viewingReport?.adjustments_count > 0" class="breakdown-row subtotal">
                    <span class="breakdown-label">Subtotal</span>
                    <span class="breakdown-value">{{ formatCurrency(parseFloat(viewingReport?.net_amount || 0) + parseFloat(viewingReport?.adjustments_total || 0)) }}</span>
                  </div>

                  <!-- Adjustments -->
                  <div v-if="viewingReport?.adjustments_count > 0" class="breakdown-row negative">
                    <span class="breakdown-label">Adjustments ({{ viewingReport.adjustments_count }})</span>
                    <span class="breakdown-value">-{{ formatCurrency(viewingReport.adjustments_total) }}</span>
                  </div>

                  <!-- Total Fees -->
                  <div v-if="viewingReport?.total_fees > 0" class="breakdown-row negative">
                    <span class="breakdown-label">Processing Fees</span>
                    <span class="breakdown-value">-{{ formatCurrency(viewingReport.total_fees) }}</span>
                  </div>

                  <!-- Reserve Held -->
                  <div v-if="viewingReport?.reserve_deducted > 0" class="breakdown-row negative reserve">
                    <span class="breakdown-label">Reserve Held</span>
                    <span class="breakdown-value">-{{ formatCurrency(viewingReport.reserve_deducted) }}</span>
                  </div>

                  <!-- Settlement Fee -->
                  <div v-if="viewingReport?.settlement_fee_amount > 0" class="breakdown-row negative settlement">
                    <span class="breakdown-label">Settlement Fee ({{ (viewingReport.settlement_fee_percent || 0).toFixed(2) }}%)</span>
                    <span class="breakdown-value">-{{ formatCurrency(viewingReport.settlement_fee_amount) }}</span>
                  </div>

                  <!-- Net Payout -->
                  <div class="breakdown-row total">
                    <span class="breakdown-label">Merchant Payout</span>
                    <span class="breakdown-value">{{ formatCurrency(viewingReport?.merchant_payout || viewingReport?.net_amount) }}</span>
                  </div>

                  <!-- Reserve Balance -->
                  <div v-if="viewingReport?.reserve_balance > 0" class="breakdown-row reserve-balance">
                    <span class="breakdown-label">Reserve Balance</span>
                    <span class="breakdown-value reserve-value">{{ formatCurrency(viewingReport.reserve_balance) }}</span>
                  </div>
                </div>
              </div>

              <!-- Adjustments Detail -->
              <div v-if="reportAdjustments.length > 0" class="slideout-section">
                <div class="slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Post-Settlement Adjustments
                </div>
                <div class="slideout-adjustments">
                  <div v-for="adj in reportAdjustments" :key="adj.id" class="adjustment-item">
                    <div class="adjustment-info">
                      <span class="adjustment-type" :class="adj.reason">{{ adj.reason }}</span>
                      <span class="adjustment-customer">{{ adj.original_cust_name || 'Unknown' }}</span>
                      <span class="adjustment-from">from {{ adj.original_settlement_report_number }}</span>
                    </div>
                    <span class="adjustment-amount">-{{ formatCurrency(adj.amount) }}</span>
                  </div>
                  <div class="adjustment-total">
                    <span>Total Adjustments</span>
                    <span>-{{ formatCurrency(viewingReport?.adjustments_total) }}</span>
                  </div>
                </div>
              </div>

              <!-- Fees Detail -->
              <div v-if="viewingReport?.total_fees > 0" class="slideout-section">
                <div class="slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Processing Fees
                </div>
                <div class="slideout-fees">
                  <div v-if="viewingReport?.processing_fee_amount > 0" class="fee-item">
                    <span>Processing Fee ({{ parseFloat(viewingReport.processing_fee_percent || 0).toFixed(2) }}%)</span>
                    <span class="fee-amount">-{{ formatCurrency(viewingReport.processing_fee_amount) }}</span>
                  </div>
                  <div v-if="viewingReport?.transaction_fees_total > 0" class="fee-item">
                    <span>Transaction Fees ({{ formatCurrency(viewingReport.transaction_fee_per) }} each)</span>
                    <span class="fee-amount">-{{ formatCurrency(viewingReport.transaction_fees_total) }}</span>
                  </div>
                  <div v-if="viewingReport?.refund_fees_total > 0" class="fee-item">
                    <span>Refund Fees ({{ formatCurrency(viewingReport.refund_fee_per) }} each)</span>
                    <span class="fee-amount">-{{ formatCurrency(viewingReport.refund_fees_total) }}</span>
                  </div>
                  <div v-if="viewingReport?.chargeback_fees_total > 0" class="fee-item">
                    <span>Chargeback Fees ({{ formatCurrency(viewingReport.chargeback_fee_per) }} each)</span>
                    <span class="fee-amount">-{{ formatCurrency(viewingReport.chargeback_fees_total) }}</span>
                  </div>
                  <div v-if="viewingReport?.processing_fee_credit > 0" class="fee-item credit">
                    <span>Processing Fee Credit <span class="fee-note">(refunds only)</span></span>
                    <span class="fee-amount positive">+{{ formatCurrency(viewingReport.processing_fee_credit) }}</span>
                  </div>
                  <div class="fee-total">
                    <span>Net Fees</span>
                    <span>-{{ formatCurrency(viewingReport.total_fees) }}</span>
                  </div>
                </div>
              </div>

              <!-- Notes -->
              <div v-if="viewingReport?.notes" class="slideout-section">
                <div class="slideout-section-title">Notes</div>
                <div class="slideout-notes">{{ viewingReport.notes }}</div>
              </div>

              <!-- Transactions -->
              <div class="slideout-section">
                <div class="slideout-section-title">Transactions ({{ reportItems.length }})</div>
                <div class="slideout-transactions">
                  <table class="slideout-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in reportItems" :key="item.id">
                        <td>{{ formatDate(item.transaction_date) }}</td>
                        <td>
                          <div class="customer-cell">
                            <span class="customer-name">{{ item.cust_name || '—' }}</span>
                            <span class="customer-email">{{ item.cust_email || '—' }}</span>
                          </div>
                        </td>
                        <td>
                          <span class="tx-amount" :class="{ negative: item.is_refund || item.is_chargeback }">
                            {{ formatCurrency(item.amount, item.currency) }}
                          </span>
                        </td>
                        <td>
                          <span class="tx-type" :class="item.is_refund ? 'refund' : item.is_chargeback ? 'chargeback' : 'payment'">
                            {{ item.is_refund ? 'Refund' : item.is_chargeback ? 'Chargeback' : 'Payment' }}
                          </span>
                        </td>
                      </tr>
                      <tr v-if="reportItems.length === 0">
                        <td colspan="4" class="no-items">No transactions found</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Footer Actions -->
            <div class="slideout-footer">
              <div class="slideout-footer-left">
                <button class="slideout-btn secondary" @click="exportReportExcel(viewingReport, reportItems)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Excel
                </button>
                <button class="slideout-btn secondary" @click="exportReportPrint(viewingReport, reportItems, reportAdjustments)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Print
                </button>
              </div>
              <div class="slideout-footer-right">
                <button class="slideout-btn secondary" @click="showViewModal = false">
                  Close
                </button>
                <button class="slideout-btn secondary danger" @click="deleteReport(viewingReport?.id); showViewModal = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Delete
                </button>
                <button class="slideout-btn primary" @click="currentSite = viewingReport?.site_name; showViewModal = false; openPaymentModal()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 6v12m6-6H6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Payment Recording Modal -->
    <Teleport to="body">
      <Transition name="slideout">
        <div v-if="showPaymentModal" class="report-slideout-overlay" @click.self="showPaymentModal = false">
          <div class="report-slideout payment-slideout">
            <!-- Header -->
            <div class="slideout-header">
              <div class="slideout-header-left">
                <button class="slideout-back" @click="showPaymentModal = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div>
                  <div class="slideout-title">Record Payment</div>
                  <div class="slideout-subtitle">{{ currentSite }}</div>
                </div>
              </div>
            </div>

            <!-- Content -->
            <div class="slideout-content">
              <!-- Current Balance -->
              <div class="slideout-hero payment-hero">
                <div class="slideout-hero-label">Current Balance Owed</div>
                <div class="slideout-hero-amount">{{ formatCurrency(currentSiteBalance.balance) }}</div>
                <div class="slideout-hero-meta">
                  <span>Owed: {{ formatCurrency(currentSiteBalance.totalOwed) }}</span>
                  <span class="slideout-hero-divider">-</span>
                  <span>Paid: {{ formatCurrency(currentSiteBalance.totalPaid) }}</span>
                </div>
              </div>

              <!-- Payment Form -->
              <div class="slideout-section">
                <div class="slideout-section-title">Payment Details</div>

                <div class="payment-form">
                  <div class="form-group">
                    <label for="payment-amount">Amount</label>
                    <div class="amount-input-wrapper">
                      <span class="currency-symbol">$</span>
                      <input
                        id="payment-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        v-model="paymentForm.amount"
                        class="amount-input"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div class="form-group">
                    <label for="payment-date">Payment Date</label>
                    <input
                      id="payment-date"
                      type="date"
                      v-model="paymentForm.payment_date"
                      class="form-input"
                    />
                  </div>

                  <div class="form-group">
                    <label for="payment-method">Payment Method</label>
                    <select
                      id="payment-method"
                      v-model="paymentForm.payment_method"
                      class="form-input"
                    >
                      <option v-for="opt in paymentMethodOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label for="payment-reference">Reference Number (Optional)</label>
                    <input
                      id="payment-reference"
                      type="text"
                      v-model="paymentForm.reference_number"
                      class="form-input"
                      placeholder="Wire reference, check number, etc."
                    />
                  </div>

                  <div class="form-group">
                    <label for="payment-notes">Notes (Optional)</label>
                    <textarea
                      id="payment-notes"
                      v-model="paymentForm.notes"
                      class="form-input textarea"
                      placeholder="Add any notes about this payment..."
                      rows="3"
                    ></textarea>
                  </div>
                </div>
              </div>

              <!-- Payment Summary -->
              <div class="slideout-section">
                <div class="slideout-section-title">After This Payment</div>
                <div class="slideout-breakdown">
                  <div class="breakdown-row">
                    <span class="breakdown-label">Current Balance</span>
                    <span class="breakdown-value">{{ formatCurrency(currentSiteBalance.balance) }}</span>
                  </div>
                  <div class="breakdown-row muted">
                    <span class="breakdown-label">This Payment</span>
                    <span class="breakdown-value">-{{ formatCurrency(parseFloat(paymentForm.amount) || 0) }}</span>
                  </div>
                  <div class="breakdown-row total">
                    <span class="breakdown-label">New Balance</span>
                    <span class="breakdown-value" :class="{ 'positive': (currentSiteBalance.balance - (parseFloat(paymentForm.amount) || 0)) > 0 }">
                      {{ formatCurrency(currentSiteBalance.balance - (parseFloat(paymentForm.amount) || 0)) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Actions -->
            <div class="slideout-footer">
              <button class="slideout-btn secondary" @click="showPaymentModal = false">
                Cancel
              </button>
              <button class="slideout-btn primary" @click="recordPayment" :disabled="savingPayment || !paymentForm.amount || parseFloat(paymentForm.amount) <= 0">
                <svg v-if="!savingPayment" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ savingPayment ? 'Recording...' : 'Record Payment' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Lock body scroll when modal is open */
body:has(.report-slideout-overlay),
body:has(.report-modal-overlay.active) {
  overflow: hidden;
}

/* ==========================================
   NON-SCOPED STYLES FOR TELEPORTED MODALS
   These styles must be non-scoped because the modals
   are teleported to <body> and outside the component scope.
   ========================================== */

/* CSS Variables for modals/slideouts - light mode default */
.report-modal-overlay,
.report-slideout-overlay {
  --bg-base: #f8fafc;
  --bg-elevated: #ffffff;
  --bg-surface: #f1f5f9;
  --bg-hover: #e2e8f0;

  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.1);
  --border-emphasis: rgba(0, 0, 0, 0.15);

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #64748b;
  --text-muted: #94a3b8;

  --accent-primary: #818cf8;
  --accent-success: #22c55e;
  --accent-warning: #f59e0b;
  --accent-danger: #ef4444;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --font-display: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
}

/* Dark mode for modals/slideouts */
@media (prefers-color-scheme: dark) {
  .report-modal-overlay,
  .report-slideout-overlay {
    --bg-base: #0a0a0f;
    --bg-elevated: #12121a;
    --bg-surface: #1a1a24;
    --bg-hover: #22222e;

    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-default: rgba(255, 255, 255, 0.1);
    --border-emphasis: rgba(255, 255, 255, 0.15);

    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-tertiary: #64748b;
    --text-muted: #475569;
  }
}

/* Modal Overlay */
.report-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.report-modal-overlay.active {
  opacity: 1;
  visibility: visible;
}

.report-modal {
  background: var(--bg-base);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  transform: scale(0.95) translateY(10px);
  transition: transform 0.2s ease;
}

.report-modal-overlay.active .report-modal {
  transform: scale(1) translateY(0);
}

.report-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.report-modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.report-modal-close {
  width: 32px;
  height: 32px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.report-modal-close:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.report-modal-body {
  padding: 24px;
  overflow-y: auto;
  max-height: 60vh;
  background: var(--bg-base);
}

.report-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

/* Modal Summary (used in create report modal) */
.report-modal .modal-summary {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

.report-modal .summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.report-modal .summary-row:last-child {
  border-bottom: none;
}

.report-modal .summary-row span:first-child {
  color: var(--text-tertiary);
  font-size: 14px;
}

.report-modal .summary-row strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.report-modal .summary-row.warning strong {
  color: var(--text-secondary);
}

.report-modal .summary-row.total {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  border-bottom: none;
}

.report-modal .summary-row.total span:first-child {
  font-weight: 600;
  color: var(--text-primary);
}

.report-modal .summary-row .payout {
  font-size: 20px;
  color: var(--text-primary) !important;
}

.report-modal .form-group {
  margin-bottom: 16px;
}

.report-modal .form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.report-modal .form-group textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.report-modal .form-group textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.report-modal .report-btn-secondary {
  padding: 8px 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.report-modal .report-btn-secondary:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.report-modal .report-btn-primary {
  padding: 8px 14px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.report-modal .report-btn-primary:hover {
  background: #6366f1;
}

.report-modal .report-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==========================================
   REPORT DETAIL SLIDEOUT
   ========================================== */

.report-slideout-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.report-slideout {
  position: relative;
  z-index: 1001;
  width: 100%;
  max-width: 600px;
  height: 100%;
  background: var(--bg-elevated);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
  border-left: 1px solid var(--border-subtle);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Slideout Transitions - Overlay fades, panel slides */
.slideout-enter-active {
  transition: opacity 0.3s ease, backdrop-filter 0.3s ease;
}

.slideout-leave-active {
  transition: opacity 0.25s ease, backdrop-filter 0.25s ease;
}

.slideout-enter-from,
.slideout-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
}

.slideout-enter-active .report-slideout {
  animation: panelSlideIn 0.3s ease;
}

.slideout-leave-active .report-slideout {
  animation: panelSlideOut 0.25s ease;
}

@keyframes panelSlideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes panelSlideOut {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(100%);
  }
}

/* Header */
.slideout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.slideout-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slideout-back {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.slideout-back:hover {
  background: var(--border-default);
  border-color: var(--border-emphasis);
  color: var(--text-primary);
}

.slideout-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.slideout-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.slideout-status {
  display: inline-flex;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slideout-status.pending {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-warning);
}

.slideout-status.paid {
  background: rgba(129, 140, 248, 0.15);
  color: var(--accent-primary);
}

/* Loading State */
.slideout-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-tertiary);
}

.slideout-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: slideout-spin 0.8s linear infinite;
}

@keyframes slideout-spin {
  to { transform: rotate(360deg); }
}

.inline-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: slideout-spin 0.8s linear infinite;
  vertical-align: middle;
}

.inline-spinner.small {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

.report-slideout-overlay .fee-loading {
  display: flex;
  justify-content: center;
  padding: 16px;
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
  background: var(--bg-surface);
  border-radius: 6px;
  animation: slideout-pulse 1.5s ease-in-out infinite;
}

@keyframes slideout-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

/* Content */
.slideout-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-base);
}

/* Hero Section */
.slideout-hero {
  text-align: center;
  padding: 32px 24px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  margin-bottom: 24px;
}

.slideout-hero-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.slideout-hero-amount {
  font-size: 42px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.slideout-hero-meta {
  margin-top: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.slideout-hero-divider {
  margin: 0 8px;
  opacity: 0.5;
}

/* Quick Stats */
.slideout-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.slideout-stat {
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.slideout-stat-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.slideout-stat-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Sections */
.slideout-section {
  margin-bottom: 24px;
}

.slideout-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.slideout-section-title svg {
  opacity: 0.7;
}

/* Financial Breakdown */
.slideout-breakdown {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.breakdown-row:last-child {
  border-bottom: none;
}

.breakdown-row.muted {
  color: var(--text-muted);
}

.breakdown-row.subtotal {
  background: var(--bg-surface);
}

.breakdown-row.negative .breakdown-value {
  color: var(--text-secondary);
}

.breakdown-row.total {
  background: var(--bg-surface);
  border-top: 2px solid var(--border-default);
}

.breakdown-row.total .breakdown-label,
.breakdown-row.total .breakdown-value {
  font-weight: 600;
  color: var(--text-primary);
}

.breakdown-row.reserve .breakdown-value {
  color: var(--accent-warning);
}

.breakdown-row.settlement .breakdown-value {
  color: var(--accent-primary);
}

.breakdown-row.reserve-balance {
  background: rgba(245, 158, 11, 0.1);
  border-top: 1px dashed rgba(245, 158, 11, 0.4);
}

.breakdown-row.reserve-balance .breakdown-label {
  color: var(--accent-warning);
  font-weight: 500;
}

.reserve-value {
  color: var(--accent-warning) !important;
}

.breakdown-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.breakdown-value {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.breakdown-value.positive {
  color: var(--text-primary);
}

/* Adjustments Section */
.slideout-adjustments {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-md);
  padding: 16px;
}

.adjustment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.adjustment-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.adjustment-type {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
}

.adjustment-type.refund {
  background: rgba(129, 140, 248, 0.2);
  color: var(--accent-primary);
}

.adjustment-type.chargeback {
  background: rgba(245, 158, 11, 0.2);
  color: var(--accent-warning);
}

.adjustment-customer {
  color: var(--text-primary);
  font-weight: 500;
}

.adjustment-from {
  color: var(--text-tertiary);
}

.adjustment-amount {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}

.adjustment-total {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid rgba(245, 158, 11, 0.3);
  font-weight: 600;
  color: var(--text-primary);
}

/* Fees Section */
.slideout-fees {
  background: rgba(129, 140, 248, 0.1);
  border: 1px solid rgba(129, 140, 248, 0.3);
  border-radius: var(--radius-md);
  padding: 16px;
}

.fee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.fee-item.credit {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.fee-item.settlement-fee {
  background: rgba(129, 140, 248, 0.1);
  border: 1px solid rgba(129, 140, 248, 0.3);
  margin-top: 8px;
}

.fee-note {
  color: var(--text-tertiary);
  font-size: 12px;
}

.fee-amount {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}

.fee-amount.positive {
  color: var(--text-primary);
}

.fee-total {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid rgba(129, 140, 248, 0.3);
  font-weight: 600;
  color: var(--text-primary);
}

/* Notes */
.slideout-notes {
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.slideout-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
  color: var(--text-primary);
  resize: vertical;
  transition: border-color 0.15s ease;
}

.slideout-textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.slideout-textarea::placeholder {
  color: var(--text-muted);
}

/* Transactions Table */
.slideout-transactions {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  max-height: 350px;
  overflow-y: auto;
  background: var(--bg-elevated);
}

.slideout-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.slideout-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
}

.slideout-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.slideout-table tbody tr:hover {
  background: var(--bg-hover);
}

.slideout-table tbody tr:last-child td {
  border-bottom: none;
}

.customer-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.customer-name {
  font-weight: 500;
  color: var(--text-primary);
}

.customer-email {
  font-size: 12px;
  color: var(--text-tertiary);
}

.tx-amount {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-primary);
}

.tx-amount.negative {
  color: var(--text-tertiary);
}

.tx-type {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.tx-type.payment {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.tx-type.refund {
  background: rgba(129, 140, 248, 0.2);
  color: var(--accent-primary);
}

.tx-type.chargeback {
  background: rgba(245, 158, 11, 0.2);
  color: var(--accent-warning);
}

.no-items {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px 16px !important;
}

/* Footer */
.slideout-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.slideout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.slideout-btn:active {
  transform: scale(0.98);
}

.slideout-btn.primary {
  background: var(--accent-primary);
  color: white;
  flex: 1;
}

.slideout-btn.primary:hover {
  background: #6366f1;
}

.slideout-btn.secondary {
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.slideout-btn.secondary:hover {
  background: var(--border-default);
  border-color: var(--border-emphasis);
  color: var(--text-primary);
}

.slideout-btn.danger {
  color: var(--text-tertiary);
}

.slideout-btn.danger:hover {
  background: var(--bg-hover);
  color: var(--accent-danger);
}

/* Loading states */
.loading-text {
  opacity: 0.6;
  animation: slideout-pulse 1.5s ease-in-out infinite;
}

.loading-placeholder {
  min-height: 60px;
}

/* Responsive */
@media (max-width: 640px) {
  .report-slideout {
    max-width: 100%;
  }

  .slideout-hero-amount {
    font-size: 32px;
  }

  .slideout-stats {
    grid-template-columns: 1fr;
  }

  .slideout-footer {
    flex-wrap: wrap;
  }

  .slideout-btn {
    flex: 1;
    min-width: 120px;
  }
}
</style>

<!-- Import shared reports styles -->
<style>
@import '@/assets/styles/reports-shared.css';
</style>

<style scoped>
/* ==========================================
   SETTLEMENT PAGE - Component-specific styles
   ========================================== */

/* Dropdown sizing */
.settlement-site-select,
.settlement-date-select {
  min-width: 160px;
  height: 40px;
}

/* Tabs - Matching CPT status filters */
.report-tabs {
  display: flex;
  gap: 8px;
}

.report-tab {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-tab:hover {
  background: var(--bg-hover);
  border-color: var(--border-default);
}

.report-tab.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.report-tab-badge {
  padding: 2px 8px;
  background: rgba(255,255,255,0.15);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.report-tab.active .report-tab-badge {
  background: rgba(255,255,255,0.25);
}

/* Selection Summary in Tab Bar */
.selection-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 6px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.selection-summary-count {
  color: var(--text-secondary);
  font-weight: 500;
}

.selection-summary-divider {
  color: var(--text-muted);
}

.selection-summary-amount {
  color: var(--text-primary);
  font-weight: 600;
  font-family: var(--font-mono);
}

.selection-summary-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 6px 12px;
  background: var(--accent-success);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.selection-summary-btn:hover {
  background: #2eb87a;
}

.selection-summary-btn svg {
  flex-shrink: 0;
}

/* Table Selection Bar (above table header) */
.table-selection-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: var(--accent-primary-dim);
  border-bottom: 1px solid var(--accent-primary);
  margin: 0 -1px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.selection-bar-count {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.selection-bar-divider {
  color: var(--text-muted);
}

.selection-bar-amount {
  color: var(--accent-primary);
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.selection-bar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 8px 16px;
  background: var(--accent-success);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.selection-bar-btn:hover {
  background: #2eb87a;
  transform: translateY(-1px);
}

.selection-bar-btn svg {
  flex-shrink: 0;
}

/* When selection bar is present, adjust table container */
.table-selection-bar + .report-table-container {
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

/* Panel - Matching CPT transactions-panel */
.report-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Panels container for tab content - grid stacks all panels in same cell */
.panels-container {
  display: grid;
  grid-template-columns: 1fr;
  width: 100%;
  position: relative;
  /* Contain layout changes within this container */
  contain: layout style;
}

.panels-container > .report-panel {
  grid-row: 1;
  grid-column: 1;
  width: 100%;
  min-width: 0;
  /* Ensure panels take full width */
  box-sizing: border-box;
}

.report-panel.panel-hidden {
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
  /* Keep in layout flow but prevent interaction */
  z-index: 0;
}

/* Active panel gets higher z-index */
.report-panel:not(.panel-hidden) {
  z-index: 1;
}

.report-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.report-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.report-panel-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.report-panel-actions {
  display: flex;
  gap: 8px;
}

/* Buttons - Matching CPT */
.report-btn-secondary {
  padding: 8px 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.report-btn-secondary:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.report-btn-primary {
  padding: 8px 14px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.report-btn-primary:hover {
  background: #6366f1;
}

.report-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Table - Matching CPT exactly */
.report-table-container {
  flex: 1;
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

/* Column widths */
.report-table th:nth-child(1),
.report-table td:nth-child(1) { width: 50px; } /* Checkbox */

.report-table th:nth-child(2),
.report-table td:nth-child(2) { width: 18%; } /* Date */

.report-table th:nth-child(3),
.report-table td:nth-child(3) { width: 28%; } /* Customer */

.report-table th:nth-child(4),
.report-table td:nth-child(4) { width: 14%; text-align: right; } /* Amount */

.report-table th:nth-child(5),
.report-table td:nth-child(5) { width: 14%; } /* Status */

.report-table th:nth-child(6),
.report-table td:nth-child(6) { width: auto; } /* Trans ID - takes remaining */

/* Reports list table (pending/paid) - use fixed layout like transactions table */
.reports-list-table {
  table-layout: fixed;
}

.reports-list-table th:nth-child(1),
.reports-list-table td:nth-child(1) { width: 15%; } /* Report # */

.reports-list-table th:nth-child(2),
.reports-list-table td:nth-child(2) { width: 18%; } /* Site */

.reports-list-table th:nth-child(3),
.reports-list-table td:nth-child(3) { width: 12%; } /* Transactions */

.reports-list-table th:nth-child(4),
.reports-list-table td:nth-child(4) { width: 18%; } /* Amount */

.reports-list-table th:nth-child(5),
.reports-list-table td:nth-child(5) { width: 17%; } /* Created */

.reports-list-table th:nth-child(6),
.reports-list-table td:nth-child(6) { width: 20%; } /* Actions */

.report-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
}

.report-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.report-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.report-table tbody tr:hover {
  background: var(--bg-hover);
}

.report-table tbody tr.selected {
  background: rgba(129, 140, 248, 0.1);
}

.report-table tbody tr.selected:hover {
  background: rgba(129, 140, 248, 0.15);
}

/* Checkbox - Matching CPT */
.report-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

/* Status badges */
.report-status {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.report-status.complete {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-success);
}

.report-status.pending {
  background: rgba(129, 140, 248, 0.15);
  color: var(--accent-primary);
}

.report-status.paid {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-success);
}

.report-status.refund {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
}

.report-status.chargeback {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-warning);
}

/* Amount styling */
.report-amount {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.report-amount.negative {
  color: var(--accent-danger);
}

.report-amount.positive {
  color: var(--accent-success);
}

/* Alert boxes */
.report-alert {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  margin: 16px 20px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}

.report-alert.warning {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.2);
}

.report-alert.info {
  background: rgba(129, 140, 248, 0.1);
  border-color: rgba(129, 140, 248, 0.2);
}

.report-alert-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.report-alert.warning .report-alert-icon {
  color: var(--accent-warning);
}

.report-alert.info .report-alert-icon {
  color: var(--accent-primary);
}

.report-alert-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.report-alert-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* Content states container - CSS Grid stacking to prevent layout shift */
.content-states-container {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 200px;
}

.content-states-container > * {
  grid-row: 1;
  grid-column: 1;
}

.content-states-container > .state-hidden {
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
  z-index: 0;
}

.content-states-container > *:not(.state-hidden) {
  z-index: 1;
}

/* Loading & Empty states */
.report-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
  background: var(--bg-elevated);
}

.report-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-subtle);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.report-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  background: var(--bg-elevated);
}

.report-empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  color: var(--text-muted);
}

.report-empty-icon svg {
  width: 100%;
  height: 100%;
}

.report-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.report-empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
  max-width: 300px;
  text-align: center;
}

/* Activity Log */
.activity-log {
  padding: 16px 24px;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-default);
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--bg-hover);
}

.activity-icon svg {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

.activity-icon.settlement_created {
  background: rgba(59, 130, 246, 0.15);
}
.activity-icon.settlement_created svg {
  color: var(--accent-primary);
}


.activity-icon.settlement_deleted,
.activity-icon.adjustment_deleted {
  background: rgba(239, 68, 68, 0.15);
}
.activity-icon.settlement_deleted svg,
.activity-icon.adjustment_deleted svg {
  color: var(--accent-danger);
}

.activity-icon.adjustment_created {
  background: rgba(245, 158, 11, 0.15);
}
.activity-icon.adjustment_created svg {
  color: var(--accent-warning);
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.activity-text strong {
  font-weight: 600;
}

.activity-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* Tab badge warning variant */
.report-tab-badge.warning {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-warning);
}

/* Slideout footer layout */
.slideout-footer-left,
.slideout-footer-right {
  display: flex;
  gap: 8px;
}

.slideout-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Settlement Filters */
.settlement-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

/* Date inputs matching dropdown style */
.settlement-date-input {
  min-width: 140px;
  height: 40px;
  padding: 0 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.settlement-date-input:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.settlement-date-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.date-separator {
  color: var(--text-tertiary);
  font-size: 14px;
}

/* Shift-click hint */
.shift-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--border-default);
  color: var(--text-tertiary);
  font-size: 12px;
}

.shift-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

/* Table Cells */
.cell-date {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-date .date {
  color: var(--text-primary);
  font-weight: 500;
}

.cell-date .time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.cell-customer {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-customer .name {
  color: var(--text-primary);
  font-weight: 500;
}

.cell-customer .email {
  font-size: 12px;
  color: var(--text-tertiary);
}

.cell-id {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-tertiary);
}

.cell-site {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Responsive */
@media (max-width: 1200px) {
  .settlement-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .settlement-metric-hero {
    grid-column: span 2;
  }
}

@media (max-width: 768px) {
  .settlement-main {
    padding: 16px 20px;
  }
  .settlement-topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .settlement-topbar-right {
    width: 100%;
    flex-wrap: wrap;
  }
  .settlement-metrics {
    grid-template-columns: 1fr;
  }
  .settlement-metric-hero {
    grid-column: span 1;
  }
  .settlement-metric-value {
    font-size: 24px;
  }
  .settlement-metric-hero .settlement-metric-value {
    font-size: 30px;
  }
  .selection-summary {
    flex-wrap: wrap;
    gap: 8px;
  }
  .table-selection-bar {
    flex-wrap: wrap;
    padding: 10px 16px;
  }
  .selection-bar-btn {
    width: 100%;
    justify-content: center;
    margin-left: 0;
    margin-top: 8px;
  }
}

/* ==========================================
   PAYMENT TRACKING STYLES
   ========================================== */

/* Balance Display in Filters */
.site-balance-display {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
  padding-left: 16px;
  border-left: 1px solid var(--border-subtle);
}

.balance-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.balance-label {
  font-size: 13px;
  color: var(--text-tertiary);
}

.balance-amount {
  font-size: 16px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.balance-amount.has-balance {
  color: var(--accent-warning);
}

.record-payment-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.record-payment-btn:hover {
  background: #6366f1;
}

/* Payment History */
.payments-history-section {
  padding: 0;
}

/* Payments table column widths */
.payments-table {
  table-layout: auto;
  width: 100%;
}

.payments-table th,
.payments-table td {
  white-space: nowrap;
  padding-right: 24px;
}

.payments-table .notes-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.payments-table .actions-col {
  width: 80px;
  text-align: center;
  padding-right: 24px;
}

.section-header {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.payment-method-badge {
  display: inline-block;
  padding: 4px 8px;
  background: var(--bg-surface);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.notes-cell {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-tertiary);
}

.payments-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-tertiary);
}

/* Payment Modal */
.payment-slideout {
  max-width: 500px;
}

.payment-hero {
  background: linear-gradient(135deg, var(--bg-elevated), var(--bg-surface));
}

.payment-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.payment-form .form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.payment-form .form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.payment-form .form-input {
  padding: 12px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.payment-form .form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.payment-form .form-input.textarea {
  resize: vertical;
  min-height: 80px;
}

.amount-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-symbol {
  position: absolute;
  left: 14px;
  color: var(--text-tertiary);
  font-size: 16px;
  font-weight: 500;
}

.amount-input {
  width: 100%;
  padding: 12px 14px 12px 32px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  font-family: var(--font-mono);
  transition: border-color 0.15s ease;
}

.amount-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.amount-input[type=number] {
  -moz-appearance: textfield;
}

/* Activity Log Payment Icons */
.activity-icon.payment_recorded {
  background: rgba(34, 197, 94, 0.15);
}
.activity-icon.payment_recorded svg {
  color: var(--accent-success);
}

.activity-icon.payment_deleted {
  background: rgba(239, 68, 68, 0.15);
}
.activity-icon.payment_deleted svg {
  color: var(--accent-danger);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .settlement {
    --bg-base: #0a0a0f;
    --bg-elevated: #12121a;
    --bg-surface: #1a1a24;
    --bg-hover: #22222e;

    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-default: rgba(255, 255, 255, 0.1);
    --border-emphasis: rgba(255, 255, 255, 0.15);

    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-tertiary: #64748b;
    --text-muted: #475569;
  }
  .settlement-glow-1 {
    background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
  }
  .settlement-glow-2 {
    background: radial-gradient(circle, rgba(52, 211, 153, 0.1) 0%, transparent 70%);
  }
  .settlement-grid {
    background-image:
      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  }
}
</style>
