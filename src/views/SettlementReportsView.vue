<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import CustomDropdown from '@/components/CustomDropdown.vue'

const { supabase } = useSupabase()
const { success: showSuccess, error: showError } = useAlerts()

// State
const loading = ref(true)
const activeTab = ref('create')
const allTransactions = ref([])
const filteredTransactions = ref([])
const selectedTransactions = ref(new Set())
const lastClickedIndex = ref(null)
const pendingReports = ref([])
const paidReports = ref([])
const pendingAdjustments = ref([])

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
  const siteNames = [...new Set(allTransactions.value.map(t => t.site_name).filter(Boolean))].sort()
  return [
    { value: '', label: `All Sites (${siteNames.length})` },
    ...siteNames.map(s => ({ value: s, label: s }))
  ]
})

const stats = computed(() => {
  const pending = pendingReports.value.reduce((sum, r) => sum + parseFloat(r.net_amount || 0), 0)
  const paid = paidReports.value.reduce((sum, r) => sum + parseFloat(r.net_amount || 0), 0)
  return {
    unsettled: filteredTransactions.value.length,
    pendingReports: pendingReports.value.length,
    pendingAmount: pending,
    paidReports: paidReports.value.length,
    paidAmount: paid
  }
})

const selectedTotals = computed(() => {
  let gross = 0, refunds = 0, chargebacks = 0
  selectedTransactions.value.forEach(key => {
    const t = findTransaction(key)
    if (t) {
      const amount = parseFloat(t.cust_amount || 0)
      if (t.is_refund) refunds += amount
      else if (t.is_chargeback) chargebacks += amount
      else gross += amount
    }
  })
  const adjTotal = pendingAdjustments.value.reduce((s, a) => s + parseFloat(a.amount || 0), 0)
  return { gross, refunds, chargebacks, net: gross, adjustments: adjTotal, netAfterAdj: gross - adjTotal }
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
        merchantPayout: calculation.merchant_payout,
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

const hasPendingReportForSite = computed(() => {
  if (!currentSite.value) return null
  return pendingReports.value.find(r => r.site_name === currentSite.value)
})

// Helpers
function findTransaction(key) {
  const [session, date] = key.split('|||')
  return allTransactions.value.find(t => t.cust_session === session && t.transaction_date === date)
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'CAD' }).format(amount || 0)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateStr) {
  if (!dateStr) return { date: '—', time: '' }
  const d = new Date(dateStr)
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

function getRelativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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

    // Filter out already settled transactions
    allTransactions.value = (data || []).filter(t => !t.is_settled && !t.settlement_report_id)
    applyFilters()
  } catch (e) {
    console.error('Error loading transactions:', e)
    showError('Failed to load transactions')
  }
}

async function loadReports() {
  try {
    const { data: pending } = await supabase
      .from('settlement_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    const { data: paid } = await supabase
      .from('settlement_reports')
      .select('*')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })

    pendingReports.value = pending || []
    paidReports.value = paid || []
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
      endDate.setHours(23, 59, 59, 999)
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
  selectedTransactions.value.clear()
  selectedTransactions.value = new Set()
  lastClickedIndex.value = null
}

function isSelected(t) {
  return selectedTransactions.value.has(getTransactionKey(t))
}

// Create Report
function openCreateModal() {
  if (selectedTransactions.value.size === 0) return
  if (hasPendingReportForSite.value) {
    showError('Please resolve the pending report for this site first')
    return
  }
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

    // Get current user ID
    const { data: { session } } = await supabase.auth.getSession()
    const currentUserId = session?.user?.id || null

    // Call Edge Function to create report (server-side fee calculation)
    const response = await supabase.functions.invoke('create-settlement-report', {
      body: {
        site_name: currentSite.value,
        transaction_keys: transactionKeys,
        notes: reportNotes.value || null,
        created_by: currentUserId
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

    // Close modal and clear selection
    showCreateModal.value = false
    selectedTransactions.value.clear()
    selectedTransactions.value = new Set()
    calculatedFees.value = null
    activeTab.value = 'pending'

    // Reload data
    await loadTransactions()
    await loadReports()
    await loadAdjustments()

  } catch (e) {
    console.error('Error creating report:', e)
    showError(`Failed to create settlement report: ${e.message || e}`)
  } finally {
    creatingReport.value = false
  }
}

// Report actions
async function markAsPaid(reportId) {
  try {
    await supabase
      .from('settlement_reports')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', reportId)

    showSuccess('Report marked as paid')
    await loadReports()
  } catch (e) {
    showError('Failed to update report')
  }
}

async function deleteReport(reportId) {
  if (!confirm('Are you sure you want to delete this report? Transactions will become available again.')) return

  try {
    // Unsettle all transactions linked to this report
    const { error: updateError } = await supabase
      .from('cpt_data')
      .update({ settlement_report_id: null, is_settled: false })
      .eq('settlement_report_id', reportId)

    if (updateError) {
      console.error('Error unsettling transactions:', updateError)
    }

    // Reset any adjustments that were applied to this report back to pending
    await supabase
      .from('settlement_adjustments')
      .update({ status: 'pending', applied_to_settlement_id: null, applied_at: null })
      .eq('applied_to_settlement_id', reportId)

    // Delete the report items first (foreign key constraint)
    await supabase
      .from('settlement_report_items')
      .delete()
      .eq('settlement_report_id', reportId)

    // Delete the report
    await supabase
      .from('settlement_reports')
      .delete()
      .eq('id', reportId)

    showSuccess('Report deleted')
    await loadTransactions()
    await loadReports()
    await loadAdjustments()
  } catch (e) {
    console.error('Error deleting report:', e)
    showError('Failed to delete report')
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

    reportItems.value = items || []

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
  selectedTransactions.value.clear()
  selectedTransactions.value = new Set()
  calculatedFees.value = null
  applyFilters()
  loadAdjustments()
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
    if (showCreateModal.value) {
      showCreateModal.value = false
    } else if (showViewModal.value) {
      showViewModal.value = false
    }
  }
}

// Init
onMounted(async () => {
  loading.value = true
  await Promise.all([loadTransactions(), loadReports()])
  loading.value = false

  document.addEventListener('keydown', handleEscapeKey)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscapeKey)
})
</script>

<template>
  <div class="settlement">
    <!-- Background -->
    <div class="settlement-bg">
      <div class="settlement-grid"></div>
      <div class="settlement-glow settlement-glow-1"></div>
      <div class="settlement-glow settlement-glow-2"></div>
    </div>

    <div class="settlement-main">
      <!-- Top Bar -->
      <header class="settlement-topbar">
        <div class="settlement-topbar-left">
          <div class="settlement-page-title">
            <span class="settlement-breadcrumb">Reports</span>
            <h1>Settlements</h1>
          </div>
        </div>
        <div class="settlement-topbar-right">
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
          <button class="settlement-icon-btn" @click="loadTransactions(); loadReports()" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Custom Date Range -->
      <div v-if="dateRange === 'custom'" class="custom-date-range">
        <div class="date-field">
          <label>Start Date</label>
          <input type="date" v-model="customStartDate" />
        </div>
        <div class="date-field">
          <label>End Date</label>
          <input type="date" v-model="customEndDate" />
        </div>
      </div>

      <!-- Metrics Strip (matching CPT Reports style) -->
      <section class="settlement-metrics">
        <div class="settlement-metric settlement-metric-hero">
          <span class="settlement-metric-label">Total Settled</span>
          <span class="settlement-metric-value">{{ formatCurrency(stats.paidAmount) }}</span>
          <span class="settlement-metric-sub">{{ stats.paidReports }} reports paid</span>
        </div>

        <div class="settlement-metric">
          <span class="settlement-metric-label">Unsettled</span>
          <span class="settlement-metric-value">{{ stats.unsettled }}</span>
          <span class="settlement-metric-sub">transactions</span>
        </div>

        <div class="settlement-metric">
          <span class="settlement-metric-label">Pending</span>
          <span class="settlement-metric-value settlement-metric-warning">{{ stats.pendingReports }}</span>
          <span class="settlement-metric-sub">{{ formatCurrency(stats.pendingAmount) }}</span>
        </div>

        <div class="settlement-metric">
          <span class="settlement-metric-label">Paid</span>
          <span class="settlement-metric-value settlement-metric-success">{{ stats.paidReports }}</span>
          <span class="settlement-metric-sub">reports completed</span>
        </div>
      </section>

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
            <button class="report-tab" :class="{ active: activeTab === 'pending' }" @click="activeTab = 'pending'">
              Pending
              <span class="report-tab-badge">{{ pendingReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'paid' }" @click="activeTab = 'paid'">
              Paid
              <span class="report-tab-badge">{{ paidReports.length }}</span>
            </button>
            <div v-if="selectedTransactions.size > 0" class="selection-summary">
              <span class="selection-summary-count">{{ selectedTransactions.size }} selected</span>
              <span class="selection-summary-divider">·</span>
              <span class="selection-summary-amount">{{ formatCurrency(selectedTotals.netAfterAdj) }}</span>
              <button
                v-if="!hasPendingReportForSite"
                class="selection-summary-btn"
                @click="openCreateModal"
              >
                Create
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M5 12h14m-7-7l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Pending Report Warning -->
        <div v-if="hasPendingReportForSite" class="report-alert warning" style="margin: 16px 24px;">
          <svg class="report-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="report-alert-content">
            <div class="report-alert-title">Pending Report Exists</div>
            <div class="report-alert-text">
              <strong>{{ hasPendingReportForSite.report_number }}</strong> ({{ formatCurrency(hasPendingReportForSite.net_amount) }}) is pending.
              Mark it as paid or delete it before creating a new report.
            </div>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
              <button class="report-btn-secondary" @click="viewReport(hasPendingReportForSite)" style="padding: 6px 12px; font-size: 13px;">View</button>
              <button class="report-btn-primary" @click="markAsPaid(hasPendingReportForSite.id)" style="padding: 6px 12px; font-size: 13px;">Mark Paid</button>
            </div>
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

        <!-- Loading -->
        <div v-if="loading" class="report-loading">
          <div class="report-spinner"></div>
          <div style="color: var(--text-tertiary);">Loading transactions...</div>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredTransactions.length === 0" class="report-empty">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">All caught up!</div>
          <div class="report-empty-text">No unsettled transactions{{ currentSite ? ` for ${currentSite}` : '' }}</div>
        </div>

        <!-- Table -->
        <template v-if="!loading && filteredTransactions.length > 0">
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
                    <span class="date">{{ formatDateTime(t.transaction_date).date }}</span>
                    <span class="time">{{ formatDateTime(t.transaction_date).time }}</span>
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
                    {{ formatCurrency(t.cust_amount) }}
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
        </template>
      </div>

      <!-- Pending Panel -->
      <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'pending' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Pending Reports</div>
            <div class="report-panel-subtitle">Reports awaiting payment</div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Create Report
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'pending' }" @click="activeTab = 'pending'">
              Pending
              <span class="report-tab-badge">{{ pendingReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'paid' }" @click="activeTab = 'paid'">
              Paid
              <span class="report-tab-badge">{{ paidReports.length }}</span>
            </button>
          </div>
        </div>

        <div v-if="pendingReports.length === 0" class="report-empty">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">No pending reports</div>
          <div class="report-empty-text">Create a settlement report to get started</div>
        </div>

        <div v-else class="report-table-container">
          <table class="report-table reports-list-table">
            <thead>
              <tr>
                <th>Report #</th>
                <th>Site</th>
                <th>Transactions</th>
                <th>Payout</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pendingReports" :key="r.id">
                <td><strong>{{ r.report_number }}</strong></td>
                <td>{{ r.site_name }}</td>
                <td>{{ r.transaction_count }}</td>
                <td><span class="report-amount">{{ formatCurrency(r.net_amount) }}</span></td>
                <td>{{ formatDate(r.created_at) }}</td>
                <td>
                  <div style="display: flex; gap: 8px;">
                    <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px;" @click="viewReport(r)">View</button>
                    <button class="report-btn-primary" style="padding: 6px 12px; font-size: 12px;" @click="markAsPaid(r.id)">Mark Paid</button>
                    <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px; color: var(--accent-danger);" @click="deleteReport(r.id)">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Paid Panel -->
      <div class="report-panel" :class="{ 'panel-hidden': activeTab !== 'paid' }">
        <div class="report-panel-header">
          <div>
            <div class="report-panel-title">Paid Reports</div>
            <div class="report-panel-subtitle">Completed settlements</div>
          </div>
          <div class="report-tabs">
            <button class="report-tab" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
              Create Report
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'pending' }" @click="activeTab = 'pending'">
              Pending
              <span class="report-tab-badge">{{ pendingReports.length }}</span>
            </button>
            <button class="report-tab" :class="{ active: activeTab === 'paid' }" @click="activeTab = 'paid'">
              Paid
              <span class="report-tab-badge">{{ paidReports.length }}</span>
            </button>
          </div>
        </div>

        <div v-if="paidReports.length === 0" class="report-empty">
          <div class="report-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="report-empty-title">No paid reports yet</div>
          <div class="report-empty-text">Paid settlements will appear here</div>
        </div>

        <div v-else class="report-table-container">
          <table class="report-table reports-list-table">
            <thead>
              <tr>
                <th>Report #</th>
                <th>Site</th>
                <th>Transactions</th>
                <th>Payout</th>
                <th>Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in paidReports" :key="r.id">
                <td><strong>{{ r.report_number }}</strong></td>
                <td>{{ r.site_name }}</td>
                <td>{{ r.transaction_count }}</td>
                <td><span class="report-amount positive">{{ formatCurrency(r.net_amount) }}</span></td>
                <td>{{ formatDate(r.paid_at) }}</td>
                <td>
                  <button class="report-btn-secondary" style="padding: 6px 12px; font-size: 12px;" @click="viewReport(r)">View</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div><!-- End panels-container -->
    </div>

    <!-- Create Report Slideout -->
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
                  <!-- Gross Sales -->
                  <div class="breakdown-row">
                    <span class="breakdown-label">Successful Sales</span>
                    <span class="breakdown-value">{{ formatCurrency(selectedTotals.gross) }}</span>
                  </div>

                  <!-- Refunds -->
                  <div v-if="selectedTotals.refunds > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Refunds (net $0)</span>
                    <span class="breakdown-value">{{ formatCurrency(selectedTotals.refunds) }}</span>
                  </div>

                  <!-- Chargebacks -->
                  <div v-if="selectedTotals.chargebacks > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Chargebacks (net $0)</span>
                    <span class="breakdown-value">{{ formatCurrency(selectedTotals.chargebacks) }}</span>
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

                  <!-- Net Payout -->
                  <div class="breakdown-row total">
                    <span class="breakdown-label">Estimated Payout</span>
                    <span class="breakdown-value" :class="{ 'loading-text': loadingFees }">
                      <template v-if="loadingFees"><span class="inline-spinner small"></span></template>
                      <template v-else>{{ formatCurrency(calculatedFees ? calculatedFees.merchantPayout : selectedTotals.netAfterAdj) }}</template>
                    </span>
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
                              {{ formatCurrency(findTransaction(key).cust_amount) }}
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
              <span class="slideout-status" :class="viewingReport?.status">
                {{ viewingReport?.status }}
              </span>
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
                <div v-if="viewingReport?.paid_at" class="slideout-stat">
                  <div class="slideout-stat-label">Paid</div>
                  <div class="slideout-stat-value">{{ formatDate(viewingReport.paid_at) }}</div>
                </div>
              </div>

              <!-- Financial Breakdown -->
              <div class="slideout-section">
                <div class="slideout-section-title">Financial Breakdown</div>

                <div class="slideout-breakdown">
                  <!-- Gross Sales -->
                  <div class="breakdown-row">
                    <span class="breakdown-label">Successful Sales</span>
                    <span class="breakdown-value positive">{{ formatCurrency(viewingReport?.gross_amount) }}</span>
                  </div>

                  <!-- Refunds -->
                  <div v-if="viewingReport?.refunds_amount > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Refunds (net $0)</span>
                    <span class="breakdown-value">{{ formatCurrency(viewingReport.refunds_amount) }}</span>
                  </div>

                  <!-- Chargebacks -->
                  <div v-if="viewingReport?.chargebacks_amount > 0" class="breakdown-row muted">
                    <span class="breakdown-label">Chargebacks (net $0)</span>
                    <span class="breakdown-value">{{ formatCurrency(viewingReport.chargebacks_amount) }}</span>
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

                  <!-- Net Payout -->
                  <div class="breakdown-row total">
                    <span class="breakdown-label">Merchant Payout</span>
                    <span class="breakdown-value">{{ formatCurrency(viewingReport?.merchant_payout || viewingReport?.net_amount) }}</span>
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
                            {{ formatCurrency(item.amount) }}
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
              <button class="slideout-btn secondary" @click="showViewModal = false">
                Close
              </button>
              <button class="slideout-btn secondary danger" @click="deleteReport(viewingReport?.id); showViewModal = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Delete
              </button>
              <button v-if="viewingReport?.status === 'pending'" class="slideout-btn primary" @click="markAsPaid(viewingReport?.id); showViewModal = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ==========================================
   SETTLEMENT PAGE - Matching CPT Reports Style
   ========================================== */

/* CSS Variables - Matching CPT */
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

  --accent-primary: #818cf8;
  --accent-success: #22c55e;
  --accent-warning: #f59e0b;
  --accent-danger: #ef4444;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;

  position: relative;
  min-height: 100vh;
  background: #0a0a0f;
  background: var(--bg-base);
  color: #f1f5f9;
  color: var(--text-primary);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  /* Prevent layout shift from scrollbar */
  overflow-y: scroll;
}

/* Background - Matching CPT */
.settlement-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.settlement-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, black 70%, transparent 100%);
}

.settlement-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
}

.settlement-glow-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
  top: -200px;
  left: 20%;
}

.settlement-glow-2 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.1) 0%, transparent 70%);
  bottom: 10%;
  right: 10%;
}

/* Main Container */
.settlement-main {
  position: relative;
  z-index: 1;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px 32px;
  /* Prevent layout shift */
  contain: layout style;
}

/* Top Bar - Matching CPT */
.settlement-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  margin-bottom: 24px;
  min-height: 72px;
}

.settlement-topbar-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.settlement-page-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settlement-breadcrumb {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settlement-topbar h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.settlement-topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settlement-site-select,
.settlement-date-select {
  min-width: 160px;
  height: 40px;
}

.settlement-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.settlement-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: rgba(255,255,255,0.12);
}

.settlement-icon-btn svg {
  width: 18px;
  height: 18px;
}

/* Metrics Strip - Matching CPT exactly */
.settlement-metrics {
  display: grid;
  grid-template-columns: 2fr repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  min-height: 110px;
}

.settlement-metric {
  background: var(--bg-elevated, #12121a);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  border-radius: var(--radius-lg, 14px);
  padding: 20px;
  position: relative;
  overflow: hidden;
  min-height: 100px;
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.settlement-metric:hover {
  border-color: var(--border-default);
  transform: translateY(-2px);
}

.settlement-metric-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);
  border-color: var(--border-default);
}

.settlement-metric-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.settlement-metric-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.settlement-metric-hero .settlement-metric-value {
  font-size: 36px;
  background: linear-gradient(135deg, var(--accent-primary) 0%, #a78bfa 50%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.settlement-metric-success { color: var(--accent-success) !important; -webkit-text-fill-color: var(--accent-success) !important; }
.settlement-metric-warning { color: var(--accent-warning) !important; -webkit-text-fill-color: var(--accent-warning) !important; }

.settlement-metric-sub {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
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
}

.panels-container > .report-panel {
  grid-row: 1;
  grid-column: 1;
  width: 100%;
  min-width: 0;
}

.report-panel.panel-hidden {
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
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
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.report-btn-secondary:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.report-btn-primary {
  padding: 8px 14px;
  background: #6366f1;
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.report-btn-primary:hover {
  background: #4f46e5;
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
.report-table td:nth-child(4) { width: 14%; } /* Amount */

.report-table th:nth-child(5),
.report-table td:nth-child(5) { width: 14%; } /* Status */

.report-table th:nth-child(6),
.report-table td:nth-child(6) { width: auto; } /* Trans ID - takes remaining */

/* Reports list table (pending/paid) - different columns */
.reports-list-table {
  table-layout: auto;
}

.reports-list-table th,
.reports-list-table td {
  width: auto;
}

.reports-list-table th:nth-child(1),
.reports-list-table td:nth-child(1) { width: auto; min-width: 140px; } /* Report # */

.reports-list-table th:nth-child(6),
.reports-list-table td:nth-child(6) { width: 200px; } /* Actions */

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
  font-family: var(--font-mono);
  font-weight: 600;
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

/* Loading & Empty states */
.report-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
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
}

/* Custom Date Range */
.custom-date-range {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  max-width: 400px;
}

.date-field {
  flex: 1;
}

.date-field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.date-field input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
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
    font-size: 28px;
  }
  .selection-summary {
    flex-wrap: wrap;
    gap: 8px;
  }
}

/* Light mode */
@media (prefers-color-scheme: light) {
  .settlement {
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
  }
  .settlement-glow-1 {
    background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%);
  }
  .settlement-glow-2 {
    background: radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%);
  }
  .settlement-grid {
    background-image:
      linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
  }
}

/* Modal Summary */
.modal-summary {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-row span:first-child {
  color: #64748b;
  font-size: 14px;
}

.summary-row strong {
  color: #1e293b;
  font-family: var(--font-mono);
}

.summary-row.warning strong {
  color: #475569;
}

.summary-row.total {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
  border-bottom: none;
}

.summary-row.total span:first-child {
  font-weight: 600;
  color: #1e293b;
}

.summary-row .payout {
  font-size: 20px;
  color: #1e293b !important;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  margin-bottom: 8px;
}

.form-group textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-sm);
  color: #1e293b;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.form-group textarea:focus {
  outline: none;
  border-color: #6366f1;
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
}

.report-modal-overlay.active {
  opacity: 1;
  visibility: visible;
}

.report-modal {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
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
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}

.report-modal-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.report-modal-close {
  width: 32px;
  height: 32px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-sm);
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.report-modal-close:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.report-modal-body {
  padding: 24px;
  overflow-y: auto;
  max-height: 60vh;
  background: #f8fafc;
}

.report-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
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
}

.report-slideout {
  position: relative;
  z-index: 1001;
  width: 100%;
  max-width: 600px;
  height: 100%;
  background: #f8fafc;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.3);
  border-left: 1px solid #e2e8f0;
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
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
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
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-sm);
  color: #475569;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.slideout-back:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #1e293b;
}

.slideout-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  font-family: var(--font-mono);
}

.slideout-subtitle {
  font-size: 13px;
  color: #64748b;
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
  background: #fef3c7;
  color: #92400e;
}

.slideout-status.paid {
  background: #e0e7ff;
  color: #4f46e5;
}

/* Loading State */
.slideout-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #64748b;
}

.slideout-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.inline-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}

.inline-spinner.small {
  width: 14px;
  height: 14px;
  border-width: 2px;
}

.fee-loading {
  display: flex;
  justify-content: center;
  padding: 16px;
}

/* Content */
.slideout-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #f8fafc;
}

/* Hero Section */
.slideout-hero {
  text-align: center;
  padding: 32px 24px;
  background: linear-gradient(135deg, #f1f5f9 0%, #ffffff 100%);
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-lg);
  margin-bottom: 24px;
}

.slideout-hero-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  margin-bottom: 8px;
}

.slideout-hero-amount {
  font-size: 42px;
  font-weight: 700;
  color: #1e293b;
  font-family: var(--font-mono);
  line-height: 1.1;
}

.slideout-hero-meta {
  margin-top: 12px;
  font-size: 14px;
  color: #475569;
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
}

.slideout-stat-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 4px;
}

.slideout-stat-value {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
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
  color: #475569;
  margin-bottom: 12px;
}

.slideout-section-title svg {
  opacity: 0.7;
}

/* Financial Breakdown */
.slideout-breakdown {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.breakdown-row:last-child {
  border-bottom: none;
}

.breakdown-row.muted {
  color: #94a3b8;
}

.breakdown-row.subtotal {
  background: #f1f5f9;
}

.breakdown-row.negative .breakdown-value {
  color: #475569;
}

.breakdown-row.total {
  background: #f1f5f9;
  border-top: 2px solid #cbd5e1;
}

.breakdown-row.total .breakdown-label,
.breakdown-row.total .breakdown-value {
  font-weight: 600;
  color: #1e293b;
}

.breakdown-label {
  font-size: 14px;
  color: #334155;
}

.breakdown-value {
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: #1e293b;
}

.breakdown-value.positive {
  color: #1e293b;
}

/* Adjustments Section */
.slideout-adjustments {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: var(--radius-md);
  padding: 16px;
}

.adjustment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #ffffff;
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
  background: #e0e7ff;
  color: #4f46e5;
}

.adjustment-type.chargeback {
  background: #fef3c7;
  color: #92400e;
}

.adjustment-customer {
  color: #1e293b;
  font-weight: 500;
}

.adjustment-from {
  color: #64748b;
}

.adjustment-amount {
  font-family: var(--font-mono);
  font-weight: 600;
  color: #1e293b;
}

.adjustment-total {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid #fcd34d;
  font-weight: 600;
  color: #1e293b;
}

/* Fees Section */
.slideout-fees {
  background: #eef2ff;
  border: 1px solid #a5b4fc;
  border-radius: var(--radius-md);
  padding: 16px;
}

.fee-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #ffffff;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  font-size: 13px;
  color: #334155;
}

.fee-item.credit {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.fee-note {
  color: #64748b;
  font-size: 12px;
}

.fee-amount {
  font-family: var(--font-mono);
  font-weight: 600;
  color: #1e293b;
}

.fee-amount.positive {
  color: #1e293b;
}

.fee-total {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid #a5b4fc;
  font-weight: 600;
  color: #1e293b;
}

/* Notes */
.slideout-notes {
  padding: 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  font-size: 14px;
  color: #334155;
  line-height: 1.5;
}

.slideout-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
  color: #1e293b;
  resize: vertical;
  transition: border-color 0.15s ease;
}

.slideout-textarea:focus {
  outline: none;
  border-color: #6366f1;
}

.slideout-textarea::placeholder {
  color: #94a3b8;
}

/* Transactions Table */
.slideout-transactions {
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  overflow: hidden;
  max-height: 350px;
  overflow-y: auto;
  background: #ffffff;
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
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
}

.slideout-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}

.slideout-table tbody tr:hover {
  background: #f8fafc;
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
  color: #1e293b;
}

.customer-email {
  font-size: 12px;
  color: #64748b;
}

.tx-amount {
  font-family: var(--font-mono);
  font-weight: 500;
  color: #1e293b;
}

.tx-amount.negative {
  color: #64748b;
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
  background: #f1f5f9;
  color: #475569;
}

.tx-type.refund {
  background: #e0e7ff;
  color: #4f46e5;
}

.tx-type.chargeback {
  background: #fef3c7;
  color: #92400e;
}

.no-items {
  text-align: center;
  color: #64748b;
  padding: 32px 16px !important;
}

/* Footer */
.slideout-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
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
  background: #6366f1;
  color: white;
  flex: 1;
}

.slideout-btn.primary:hover {
  background: #4f46e5;
}

.slideout-btn.secondary {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.slideout-btn.secondary:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
}

.slideout-btn.danger {
  color: #64748b;
}

.slideout-btn.danger:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

/* Loading states */
.loading-text {
  opacity: 0.6;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

.fee-loading {
  color: #64748b;
  font-size: 13px;
  text-align: center;
  padding: 12px;
  background: #f8fafc;
  border-radius: 6px;
  animation: pulse 1.5s ease-in-out infinite;
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
