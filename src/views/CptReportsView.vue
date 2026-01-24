<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, watch, nextTick } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAuth } from '@/composables/useAuth'
import { useFormatting } from '@/composables/useFormatting'
import { useAlerts } from '@/composables/useAlerts'
import CustomDropdown from '@/components/CustomDropdown.vue'

const { supabase } = useSupabase()
const { user } = useAuth()
const { formatCurrency, formatCurrencyShort } = useFormatting()
const { info: showInfo } = useAlerts()

// Chart.js
let Chart = null
let volumeChart = null

// Constants
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Toronto', label: 'Toronto (ET)' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' }
]
const SOURCE_TIMEZONE = 'America/Los_Angeles'
const PAGE_SIZE = 25

// State
const loading = ref(true)
const allTransactions = ref([])
const siteFilteredTransactions = ref([])
const filteredTransactions = ref([])
const lastSyncTime = ref(null)
const transactionsByDate = ref({})
const searchInputRef = ref(null)

// Filters
const globalSiteFilter = ref('')
const currencyFilter = ref('')
const searchInput = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const currentStatusFilter = ref('all')
const currentTimezone = ref('America/Los_Angeles')
const chartRange = ref('30d')
const includeTests = ref(false)

// Pagination & Sorting
const currentPage = ref(1)
const currentSort = ref({ column: 'transaction_date', direction: 'desc' })

// Modal
const showModal = ref(false)
const selectedTransaction = ref(null)

// Filters popover
const showFiltersPopover = ref(false)
const filtersButtonRef = ref(null)

function toggleFiltersPopover() {
  showFiltersPopover.value = !showFiltersPopover.value
}

function closeFiltersPopover() {
  showFiltersPopover.value = false
}

// Count active filters for badge
const activeFilterCount = computed(() => {
  let count = 0
  if (currentStatusFilter.value !== 'all') count++
  if (dateFrom.value) count++
  if (dateTo.value) count++
  if (searchInput.value) count++
  if (includeTests.value) count++
  return count
})

// Computed
const stats = computed(() => {
  // Exclude test transactions from metrics
  const txs = siteFilteredTransactions.value.filter(t => !t.is_test)
  const completed = txs.filter(t => t.status === 'complete')

  // Group totals by currency
  const byCurrency = {}
  for (const t of completed) {
    const cur = t.currency || 'CAD'
    byCurrency[cur] = (byCurrency[cur] || 0) + parseFloat(t.cust_amount || 0)
  }
  const totalCaptured = Object.values(byCurrency).reduce((sum, v) => sum + v, 0)

  return {
    totalCaptured,
    totalCapturedByCurrency: byCurrency,
    completed: completed.length,
    cancelled: txs.length - completed.length,
    avgAmount: completed.length ? totalCaptured / completed.length : 0,
    completionRate: txs.length ? ((completed.length / txs.length) * 100).toFixed(1) : 0,
    total: txs.length
  }
})

const todayInsights = computed(() => {
  const todayStr = formatDateStr(new Date())
  return transactionsByDate.value[todayStr] || { complete: 0, cancelled: 0, volume: 0, volumeByCurrency: {} }
})

const todaySuccessRate = computed(() => {
  const today = todayInsights.value
  const total = today.complete + today.cancelled
  if (!total) return 0
  return ((today.complete / total) * 100).toFixed(1)
})

const yesterdayInsights = computed(() => {
  const { year, month, day } = getTodayParts()
  const yesterday = new Date(year, month, day - 1)
  const str = formatDateStr(yesterday)
  return transactionsByDate.value[str] || { complete: 0, cancelled: 0, volume: 0 }
})

const volumeTrend = computed(() => {
  const today = todayInsights.value.volume
  const yesterday = yesterdayInsights.value.volume
  if (!yesterday) return { direction: 'neutral', percent: 0 }
  const change = ((today - yesterday) / yesterday) * 100
  return {
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
    percent: Math.abs(change).toFixed(0)
  }
})

const siteDropdownOptions = computed(() => {
  const sites = [...new Set(allTransactions.value.map(t => t.site_name).filter(Boolean))].sort()
  return [
    { value: '', label: `All Sites (${sites.length})` },
    ...sites.map(s => ({ value: s, label: s }))
  ]
})

const currencyDropdownOptions = computed(() => {
  const currencies = [...new Set(allTransactions.value.map(t => t.currency).filter(Boolean))].sort()
  return [
    { value: '', label: 'All Currencies' },
    ...currencies.map(c => ({ value: c, label: c }))
  ]
})

const totalPages = computed(() => Math.ceil(filteredTransactions.value.length / PAGE_SIZE))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredTransactions.value.slice(start, start + PAGE_SIZE)
})

const paginationInfo = computed(() => {
  const total = filteredTransactions.value.length
  if (!total) return 'No transactions'
  const start = (currentPage.value - 1) * PAGE_SIZE + 1
  return `${start}–${Math.min(currentPage.value * PAGE_SIZE, total)} of ${total.toLocaleString()}`
})

const pageNumbers = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, 4, '...', total]
  if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
})

const hasActiveFilters = computed(() =>
  searchInput.value || dateFrom.value || dateTo.value || currentStatusFilter.value !== 'all' || includeTests.value
)

// Trend sparkline - last 14 days
const trendData = computed(() => {
  const { year, month, day } = getTodayParts()
  const data = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(year, month, day - i)
    const str = formatDateStr(d)
    const dayData = transactionsByDate.value[str] || { volume: 0 }
    data.push(dayData.volume)
  }
  return data
})

function generateTrendPath(data, width = 120, height = 32) {
  if (!data || data.length === 0 || data.every(v => v === 0)) return ''
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((val, i) => {
    const x = i * step
    const y = height - 4 - ((val - min) / range) * (height - 8)
    return `${x},${y}`
  })
  return `M ${points.join(' L ')}`
}

// Helpers
function convertToTimezone(dateStr) {
  const match = dateStr?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
  if (!match) return new Date(dateStr)
  const utcDate = new Date(match[1] + 'Z')
  const tzStr = utcDate.toLocaleString('en-US', { timeZone: SOURCE_TIMEZONE, hour12: false })
  const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC', hour12: false })
  const offsetMs = (new Date(utcStr) - new Date(tzStr))
  return new Date(utcDate.getTime() + offsetMs)
}

function formatDateInTimezone(dateStr) {
  const date = convertToTimezone(dateStr)
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: currentTimezone.value }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: currentTimezone.value })
  }
}

function formatDateStr(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: currentTimezone.value, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date)
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function getTodayParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: currentTimezone.value, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = type => parseInt(parts.find(p => p.type === type).value)
  return { year: get('year'), month: get('month') - 1, day: get('day') }
}

function buildTransactionsByDate() {
  const result = {}
  const { year, month, day } = getTodayParts()
  const cutoff = new Date(year, month, day - 90)
  const cutoffStr = formatDateStr(cutoff)

  for (const t of siteFilteredTransactions.value) {
    // Exclude test transactions from metrics
    if (t.is_test) continue
    const dateStr = formatDateStr(convertToTimezone(t.transaction_date))
    if (dateStr < cutoffStr) continue
    result[dateStr] = result[dateStr] || { complete: 0, cancelled: 0, volume: 0, volumeByCurrency: {} }
    if (t.status === 'complete') {
      result[dateStr].complete++
      result[dateStr].volume += parseFloat(t.cust_amount || 0)
      const cur = t.currency || 'CAD'
      result[dateStr].volumeByCurrency[cur] = (result[dateStr].volumeByCurrency[cur] || 0) + parseFloat(t.cust_amount || 0)
    } else {
      result[dateStr].cancelled++
    }
  }
  transactionsByDate.value = result
}

function getRelativeTime(date) {
  const now = new Date()
  const diff = now - date
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// Data Loading
async function loadData() {
  loading.value = true
  try {
    const { data: activeSites } = await supabase
      .from('cpt_site_accounts').select('site_id').eq('is_active', true)

    const siteIds = (activeSites || []).map(s => s.site_id)

    // Fetch all records using pagination (Supabase default limit is 1000)
    const PAGE_SIZE = 1000
    let allData = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      let query = supabase.from('cpt_data').select('*')
        .order('transaction_date', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (siteIds.length) query = query.in('site_id', siteIds)

      const { data, error } = await query
      if (error) throw error

      if (data && data.length > 0) {
        allData = allData.concat(data)
        offset += PAGE_SIZE
        hasMore = data.length === PAGE_SIZE
      } else {
        hasMore = false
      }
    }

    allTransactions.value = allData.map(t => ({
      ...t, status: t.trans_type === 'complete' ? 'complete' : 'incomplete'
    }))
    applyGlobalFilters()
  } catch (e) {
    console.error('Error loading data:', e)
  } finally {
    loading.value = false
  }
}

async function loadSyncStatus() {
  try {
    let { data } = await supabase.from('cpt_sync_log')
      .select('sync_completed_at, sync_started_at, status')
      .eq('status', 'success').order('sync_completed_at', { ascending: false }).limit(1)

    if (!data?.length) {
      const result = await supabase.from('cpt_sync_log')
        .select('sync_completed_at, sync_started_at').order('sync_started_at', { ascending: false }).limit(1)
      data = result.data
    }

    const syncTime = data?.[0]?.sync_completed_at || data?.[0]?.sync_started_at
    if (syncTime) lastSyncTime.value = new Date(syncTime)
  } catch (e) {
    console.error('Error loading sync status:', e)
  }
}

// Filtering
function applyGlobalFilters() {
  let filtered = [...allTransactions.value]
  if (globalSiteFilter.value) {
    filtered = filtered.filter(t => t.site_name === globalSiteFilter.value)
  }
  if (currencyFilter.value) {
    filtered = filtered.filter(t => t.currency === currencyFilter.value)
  }
  siteFilteredTransactions.value = filtered
  buildTransactionsByDate()
  applyFilters()
  nextTick(initCharts)
}

function applyFilters() {
  const search = searchInput.value.toLowerCase()
  filteredTransactions.value = siteFilteredTransactions.value.filter(t => {
    // Hide test transactions by default
    if (!includeTests.value && t.is_test) return false

    // Status filter
    if (currentStatusFilter.value === 'complete' && t.status !== 'complete') return false
    if (currentStatusFilter.value === 'incomplete' && t.status !== 'incomplete') return false
    if (currentStatusFilter.value === 'refund' && !t.is_refund) return false
    if (currentStatusFilter.value === 'chargeback' && !t.is_chargeback) return false

    if (search) {
      const fields = [t.cust_name, t.cust_email_ad, t.cust_trans_id, t.site_name].join(' ').toLowerCase()
      if (!fields.includes(search)) return false
    }
    if (dateFrom.value && new Date(t.transaction_date) < new Date(dateFrom.value)) return false
    if (dateTo.value) {
      const to = new Date(dateTo.value)
      to.setUTCHours(23, 59, 59, 999)
      if (new Date(t.transaction_date) > to) return false
    }
    return true
  })
  sortTransactions()
  currentPage.value = 1
}

function sortTransactions() {
  const { column, direction } = currentSort.value
  const dir = direction === 'asc' ? 1 : -1
  filteredTransactions.value.sort((a, b) => {
    let aVal = a[column], bVal = b[column]
    if (column === 'transaction_date') { aVal = new Date(aVal); bVal = new Date(bVal) }
    else if (column === 'cust_amount') { aVal = parseFloat(aVal || 0); bVal = parseFloat(bVal || 0) }
    else { aVal = (aVal || '').toString().toLowerCase(); bVal = (bVal || '').toString().toLowerCase() }
    return aVal < bVal ? -dir : aVal > bVal ? dir : 0
  })
}

function handleSort(column) {
  if (currentSort.value.column === column) {
    currentSort.value.direction = currentSort.value.direction === 'asc' ? 'desc' : 'asc'
  } else {
    currentSort.value = { column, direction: 'desc' }
  }
  sortTransactions()
}

function clearAllFilters() {
  searchInput.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  currentStatusFilter.value = 'all'
  includeTests.value = false
  applyFilters()
}

function changeTimezone(tz) {
  currentTimezone.value = tz
  buildTransactionsByDate()
  nextTick(initCharts)
}

// Charts
async function loadChartJs() {
  if (!Chart) {
    try {
      const m = await import('chart.js/auto')
      Chart = m.default || m.Chart
    } catch (e) { console.error('Failed to load Chart.js:', e) }
  }
}

async function initCharts() {
  await loadChartJs()
  if (!Chart) return

  const volumeCanvas = document.getElementById('volumeChart')
  if (volumeCanvas) {
    volumeChart?.destroy()
    const ctx = volumeCanvas.getContext('2d')

    volumeChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Volume', data: [], backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 6, borderSkipped: false, barPercentage: 0.6, categoryPercentage: 0.8 }
      ], transactionCounts: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 400,
          easing: 'easeOutQuart'
        },
        transitions: {
          active: { animation: { duration: 0 } }
        },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f1f5f9',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            boxPadding: 4,
            titleFont: { family: 'Inter, -apple-system, sans-serif', size: 13, weight: '600' },
            bodyFont: { family: 'Inter, -apple-system, sans-serif', size: 12 },
            callbacks: {
              label: function(context) {
                const value = context.raw || 0
                return 'Volume: ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
              },
              afterBody: function(context) {
                const dataIndex = context[0].dataIndex
                const counts = this.chart.data.transactionCounts?.[dataIndex] || { complete: 0, cancelled: 0 }
                return `\n${counts.complete} completed, ${counts.cancelled} cancelled`
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter, -apple-system, sans-serif', size: 11 } }, border: { display: false }},
          y: { grid: { color: 'rgba(255, 255, 255, 0.06)' }, ticks: { color: '#64748b', font: { family: 'Inter, -apple-system, sans-serif', size: 11 }, callback: function(value) { return '$' + (value >= 1000 ? (value/1000).toFixed(0) + 'k' : value) } }, border: { display: false }}
        }
      }
    })
    updateVolumeChart()
  }
}

function updateVolumeChart() {
  if (!volumeChart) return
  const days = chartRange.value === '7d' ? 7 : chartRange.value === '30d' ? 30 : 90
  const labels = [], volumeData = [], transactionCounts = []

  for (let i = days - 1; i >= 0; i--) {
    // Create date by subtracting days from current time to maintain timezone consistency
    const d = new Date()
    d.setDate(d.getDate() - i)
    const str = formatDateStr(d)
    const data = transactionsByDate.value[str] || { complete: 0, cancelled: 0, volume: 0 }
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: currentTimezone.value }))
    volumeData.push(data.volume)
    transactionCounts.push({ complete: data.complete, cancelled: data.cancelled })
  }

  volumeChart.data.labels = labels
  volumeChart.data.datasets[0].data = volumeData
  volumeChart.data.transactionCounts = transactionCounts
  volumeChart.update()
}

// Modal
function showDetail(t) { selectedTransaction.value = t; showModal.value = true }
function closeModal() { showModal.value = false; selectedTransaction.value = null }

async function toggleFlag(field, dateField) {
  const t = selectedTransaction.value
  if (!t) return
  const newValue = !t[field]
  try {
    const { error } = await supabase.from('cpt_data').update({
      [field]: newValue,
      [dateField]: newValue ? new Date().toISOString() : null,
      marked_by: newValue ? user.value?.id : null
    }).eq('cust_session', t.cust_session).eq('transaction_date', t.transaction_date)

    if (error) throw error

    // Handle settlement adjustments for transactions in paid reports
    if (t.settlement_report_id) {
      const reason = field === 'is_refund' ? 'refund' : 'chargeback'

      if (newValue) {
        // Marking as refund/chargeback - check if report is paid and create adjustment
        const { data: report } = await supabase
          .from('settlement_reports')
          .select('id, report_number, status, processing_fee_percent')
          .eq('id', t.settlement_report_id)
          .single()

        if (report && report.status === 'paid') {
          const amount = parseFloat(t.cust_amount || 0)
          const feePercent = parseFloat(report.processing_fee_percent || 0)
          const feeCredit = amount * (feePercent / 100)

          // Create adjustment record (will fail silently if duplicate due to unique constraint)
          const { error: adjError } = await supabase
            .from('settlement_adjustments')
            .insert({
              site_id: t.site_id,
              site_name: t.site_name,
              original_cust_session: t.cust_session,
              original_transaction_date: t.transaction_date,
              original_cust_name: t.cust_name,
              original_cust_email: t.cust_email_ad,
              original_trans_id: t.cust_trans_id,
              original_settlement_report_id: report.id,
              original_settlement_report_number: report.report_number,
              amount: amount,
              reason: reason,
              status: 'pending',
              original_processing_fee_percent: feePercent,
              processing_fee_credit: feeCredit,
              created_by: user.value?.id,
              notes: `Auto-created when transaction marked as ${reason}`
            })

          if (adjError && !adjError.message?.includes('unique')) {
            console.error('Error creating adjustment:', adjError)
          } else {
            // Show feedback toast to user
            showInfo(`Settlement adjustment created: -${formatCurrency(amount)} will be deducted from ${t.site_name}'s next settlement`)
          }
        }
      } else {
        // Unmarking - delete pending adjustment if it exists
        await supabase
          .from('settlement_adjustments')
          .delete()
          .eq('original_cust_session', t.cust_session)
          .eq('original_transaction_date', t.transaction_date)
          .eq('reason', reason)
          .eq('status', 'pending')
      }
    }

    t[field] = newValue
    const idx = allTransactions.value.findIndex(x => x.cust_session === t.cust_session && x.transaction_date === t.transaction_date)
    if (idx !== -1) allTransactions.value[idx][field] = newValue
    applyGlobalFilters()
  } catch (e) {
    console.error(`Error updating ${field}:`, e)
    alert(`Failed to update ${field}`)
  }
}

async function toggleTest() {
  const t = selectedTransaction.value
  if (!t) return
  const newValue = !t.is_test
  try {
    const { error } = await supabase.from('cpt_data').update({
      is_test: newValue,
      test_marked_at: newValue ? new Date().toISOString() : null,
      marked_by: newValue ? user.value?.id : null
    }).eq('cust_session', t.cust_session).eq('transaction_date', t.transaction_date)

    if (error) throw error

    t.is_test = newValue
    const idx = allTransactions.value.findIndex(x => x.cust_session === t.cust_session && x.transaction_date === t.transaction_date)
    if (idx !== -1) allTransactions.value[idx].is_test = newValue
    applyGlobalFilters()
  } catch (e) {
    console.error('Error updating is_test:', e)
    alert('Failed to update test status')
  }
}

function exportData() {
  const headers = ['Date', 'Customer Name', 'Email', 'Amount', 'Currency', 'Status', 'Site', 'Transaction ID']
  const rows = filteredTransactions.value.map(t => [
    new Date(t.transaction_date).toISOString(), t.cust_name || '', t.cust_email_ad || '',
    t.cust_amount || 0, t.currency || 'CAD', t.status, t.site_name || '', t.cust_trans_id || ''
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `cpt-transactions-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}

// Keyboard
async function handleKeydown(e) {
  if (e.key === 'Escape') closeModal()
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
  // "T" to toggle test when modal is open
  if ((e.key === 't' || e.key === 'T') && showModal.value && selectedTransaction.value) {
    e.preventDefault()
    await toggleTest()
    closeModal()
  }
}

// Watchers
watch(searchInput, applyFilters)
watch([dateFrom, dateTo], applyFilters)
watch([globalSiteFilter, currencyFilter], applyGlobalFilters)
watch(includeTests, applyFilters)

// Lifecycle
onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)
  await Promise.all([loadData(), loadSyncStatus()])
})

// Reload data when navigating back to this page (KeepAlive)
onActivated(async () => {
  // Silently refresh data in background without showing loading state
  await loadData()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  volumeChart?.destroy()
})
</script>

<template>
  <div class="reports-page cpt">
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
            <h1>Transactions</h1>
          </div>
          <div class="cpt-status-badges">
            <span class="cpt-live"><span class="cpt-live-dot"></span>Live</span>
            <span v-if="lastSyncTime" class="cpt-sync-badge">{{ getRelativeTime(lastSyncTime) }}</span>
          </div>
        </div>
        <div class="reports-topbar-right">
          <CustomDropdown v-model="globalSiteFilter" :options="siteDropdownOptions" placeholder="All Sites" class="cpt-site-select" />
          <CustomDropdown v-model="currencyFilter" :options="currencyDropdownOptions" placeholder="All Currencies" class="cpt-site-select" />
          <button class="reports-icon-btn" @click="loadData(); loadSyncStatus()" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="cpt-export-btn" @click="exportData">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Export
          </button>
        </div>
      </header>

      <!-- Metrics Strip -->
      <div class="reports-stats-row">
          <div class="reports-stat-box">
            <div v-if="currencyFilter || Object.keys(stats.totalCapturedByCurrency).length <= 1" class="reports-stat-value">
              {{ formatCurrencyShort(stats.totalCaptured) }}
            </div>
            <div v-else class="reports-stat-value reports-stat-stacked">
              <span v-for="(amount, cur) in stats.totalCapturedByCurrency" :key="cur">{{ formatCurrency(amount, cur) }}</span>
            </div>
            <span class="reports-stat-label">Total Revenue</span>
          </div>
          <div class="reports-stat-box">
            <div v-if="currencyFilter || Object.keys(todayInsights.volumeByCurrency).length <= 1" class="reports-stat-value">
              {{ formatCurrencyShort(todayInsights.volume) }}
            </div>
            <div v-else class="reports-stat-value reports-stat-stacked">
              <span v-for="(amount, cur) in todayInsights.volumeByCurrency" :key="cur">{{ formatCurrency(amount, cur) }}</span>
            </div>
            <span class="reports-stat-label">Today</span>
          </div>
          <div class="reports-stat-box">
            <span class="reports-stat-value reports-stat-success">{{ todayInsights.complete }}</span>
            <span class="reports-stat-label">Completed</span>
          </div>
          <div class="reports-stat-box">
            <span class="reports-stat-value reports-stat-danger">{{ todayInsights.cancelled }}</span>
            <span class="reports-stat-label">Cancelled</span>
          </div>
          <div class="reports-stat-box">
            <span class="reports-stat-value">{{ todaySuccessRate }}%</span>
            <span class="reports-stat-label">Success Rate</span>
          </div>
      </div>

      <!-- OLD: Single bar with dividers (uncomment to revert)
      <div class="cpt-stats-bar">
        <div class="cpt-stat cpt-stat-primary">
          <span class="cpt-stat-value">{{ formatCurrencyShort(stats.totalCaptured) }}</span>
          <span class="cpt-stat-label">Total Revenue</span>
        </div>
        <div class="cpt-stat-divider"></div>
        <div class="cpt-stat">
          <span class="cpt-stat-value">{{ formatCurrencyShort(todayInsights.volume) }}</span>
          <span class="cpt-stat-label">Today</span>
        </div>
        <div class="cpt-stat-divider"></div>
        <div class="cpt-stat">
          <span class="cpt-stat-value cpt-stat-success">{{ todayInsights.complete }}</span>
          <span class="cpt-stat-label">Completed</span>
        </div>
        <div class="cpt-stat-divider"></div>
        <div class="cpt-stat">
          <span class="cpt-stat-value cpt-stat-warning">{{ todayInsights.cancelled }}</span>
          <span class="cpt-stat-label">Cancelled</span>
        </div>
        <div class="cpt-stat-divider"></div>
        <div class="cpt-stat">
          <span class="cpt-stat-value">{{ todaySuccessRate }}%</span>
          <span class="cpt-stat-label">Success Rate</span>
        </div>
      </div>
      -->

      <!-- OLD: Card-based Metrics (uncomment to revert)
      <section class="cpt-metrics">
        <div class="cpt-metric cpt-metric-hero">
          <span class="cpt-metric-label">Total Revenue</span>
          <span class="cpt-metric-value">{{ formatCurrencyShort(stats.totalCaptured) }}</span>
          <span class="cpt-metric-sub">{{ stats.completed }} completed</span>
        </div>

        <div class="cpt-metric">
          <span class="cpt-metric-label">Today</span>
          <span class="cpt-metric-value">{{ formatCurrencyShort(todayInsights.volume) }}</span>
          <span class="cpt-metric-sub">{{ todayInsights.complete + todayInsights.cancelled }} transactions</span>
        </div>

        <div class="cpt-metric">
          <span class="cpt-metric-label">Completed Today</span>
          <span class="cpt-metric-value cpt-metric-success">{{ todayInsights.complete.toLocaleString() }}</span>
          <span class="cpt-metric-sub">{{ todaySuccessRate }}% success rate</span>
        </div>

        <div class="cpt-metric">
          <span class="cpt-metric-label">Cancelled Today</span>
          <span class="cpt-metric-value cpt-metric-warning">{{ todayInsights.cancelled.toLocaleString() }}</span>
          <span class="cpt-metric-sub">Incomplete transactions</span>
        </div>

        <div class="cpt-metric">
          <span class="cpt-metric-label">Avg Today</span>
          <span class="cpt-metric-value">{{ formatCurrencyShort(todayInsights.complete ? todayInsights.volume / todayInsights.complete : 0) }}</span>
          <span class="cpt-metric-sub">Per completed</span>
        </div>
      </section>
      -->

      <!-- Main Content -->
      <div class="cpt-content">
        <!-- Chart Panel -->
        <section class="cpt-chart-panel">
          <div class="cpt-chart-header">
            <div class="cpt-chart-legend">
              <span class="cpt-legend-item"><span class="cpt-legend-dot completed"></span>Completed</span>
              <span class="cpt-legend-item"><span class="cpt-legend-dot cancelled"></span>Cancelled</span>
            </div>
            <div class="cpt-chart-controls">
              <div class="cpt-range-tabs">
                <button :class="{ active: chartRange === '7d' }" @click="chartRange = '7d'; updateVolumeChart()">7D</button>
                <button :class="{ active: chartRange === '30d' }" @click="chartRange = '30d'; updateVolumeChart()">30D</button>
                <button :class="{ active: chartRange === '90d' }" @click="chartRange = '90d'; updateVolumeChart()">90D</button>
              </div>
            </div>
          </div>
          <div class="cpt-chart-container">
            <canvas id="volumeChart"></canvas>
          </div>
        </section>

        <!-- Transactions Panel -->
        <section class="cpt-transactions-panel">
          <!-- Search & Filters - Minimal Design -->
          <div class="cpt-filters-bar">
            <div class="cpt-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input ref="searchInputRef" v-model="searchInput" type="text" placeholder="Search transactions...">
              <kbd>⌘K</kbd>
            </div>

            <div class="cpt-filters-actions">
              <div class="cpt-filters-trigger-wrapper">
                <button ref="filtersButtonRef" class="cpt-filters-btn" :class="{ active: showFiltersPopover || activeFilterCount > 0 }" @click="toggleFiltersPopover">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h18M7 9h10M10 14h4M12 19h0" stroke-linecap="round"/></svg>
                  Filters
                  <span v-if="activeFilterCount > 0" class="cpt-filter-badge">{{ activeFilterCount }}</span>
                </button>

                <!-- Filters Popover -->
                <Transition name="popover">
                  <div v-if="showFiltersPopover" class="cpt-filters-popover" @click.stop>
                    <div class="cpt-popover-header">
                      <span>Filters</span>
                      <button class="cpt-popover-close" @click="closeFiltersPopover">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>

                    <div class="cpt-popover-section">
                      <label class="cpt-popover-label">Status</label>
                      <div class="cpt-popover-status">
                        <button :class="{ active: currentStatusFilter === 'all' }" @click="currentStatusFilter = 'all'; applyFilters()">All</button>
                        <button :class="{ active: currentStatusFilter === 'complete' }" @click="currentStatusFilter = 'complete'; applyFilters()">Completed</button>
                        <button :class="{ active: currentStatusFilter === 'incomplete' }" @click="currentStatusFilter = 'incomplete'; applyFilters()">Cancelled</button>
                        <button :class="{ active: currentStatusFilter === 'refund' }" @click="currentStatusFilter = 'refund'; applyFilters()">Refunds</button>
                        <button :class="{ active: currentStatusFilter === 'chargeback' }" @click="currentStatusFilter = 'chargeback'; applyFilters()">Chargebacks</button>
                      </div>
                    </div>

                    <div class="cpt-popover-section">
                      <label class="cpt-popover-checkbox">
                        <input type="checkbox" v-model="includeTests">
                        <span>Include test transactions</span>
                      </label>
                    </div>

                    <div class="cpt-popover-section">
                      <label class="cpt-popover-label">Date Range</label>
                      <div class="cpt-popover-dates">
                        <input type="date" v-model="dateFrom">
                        <span class="cpt-popover-date-sep">to</span>
                        <input type="date" v-model="dateTo">
                      </div>
                    </div>

                    <div class="cpt-popover-footer">
                      <button class="cpt-popover-clear" @click="clearAllFilters" :disabled="!hasActiveFilters">Clear All</button>
                      <button class="cpt-popover-apply" @click="closeFiltersPopover">Done</button>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Quick status pills (visible when filters applied) -->
              <div v-if="currentStatusFilter !== 'all'" class="cpt-active-filter">
                <span>{{ currentStatusFilter === 'complete' ? 'Completed' : currentStatusFilter === 'incomplete' ? 'Cancelled' : currentStatusFilter === 'refund' ? 'Refunds' : 'Chargebacks' }}</span>
                <button @click="currentStatusFilter = 'all'; applyFilters()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div v-if="dateFrom || dateTo" class="cpt-active-filter">
                <span>{{ dateFrom || '...' }} – {{ dateTo || '...' }}</span>
                <button @click="dateFrom = ''; dateTo = ''; applyFilters()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <CustomDropdown v-model="currentTimezone" :options="TIMEZONES" placeholder="Timezone" class="cpt-tz-select cpt-tz-right" @update:modelValue="changeTimezone" />
          </div>

          <!-- Click outside to close popover -->
          <div v-if="showFiltersPopover" class="cpt-popover-backdrop" @click="closeFiltersPopover"></div>

          <!-- Table -->
          <div class="cpt-table-container">
            <table class="cpt-table">
              <thead>
                <tr>
                  <th @click="handleSort('transaction_date')" class="sortable" :class="{ sorted: currentSort.column === 'transaction_date' }">
                    Date
                    <svg v-if="currentSort.column === 'transaction_date'" viewBox="0 0 24 24"><path :d="currentSort.direction === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'"/></svg>
                  </th>
                  <th @click="handleSort('cust_name')" class="sortable">Customer</th>
                  <th @click="handleSort('cust_amount')" class="sortable amount-col">Amount</th>
                  <th @click="handleSort('status')" class="sortable">Status</th>
                  <th @click="handleSort('site_name')" class="sortable">Site</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="5">
                    <div class="cpt-loading">
                      <div class="cpt-spinner"></div>
                      <span>Loading transactions...</span>
                    </div>
                  </td>
                </tr>
                <tr v-else-if="!paginatedData.length">
                  <td colspan="5">
                    <div class="cpt-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      <span>No transactions found</span>
                    </div>
                  </td>
                </tr>
                <tr v-else v-for="t in paginatedData" :key="t.cust_session + t.transaction_date" @click="showDetail(t)" :class="{ flagged: t.is_refund || t.is_chargeback }">
                  <td>
                    <div class="cpt-cell-date">
                      <span>{{ formatDateInTimezone(t.transaction_date).date }}</span>
                      <span class="time">{{ formatDateInTimezone(t.transaction_date).time }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="cpt-cell-customer">
                      <span class="name">{{ t.cust_name || '—' }}</span>
                      <span class="email">{{ t.cust_email_ad || '—' }}</span>
                    </div>
                  </td>
                  <td class="amount-col">
                    <span class="cpt-amount">{{ formatCurrency(parseFloat(t.cust_amount || 0), t.currency) }}</span>
                  </td>
                  <td>
                    <div class="cpt-cell-status">
                      <span class="cpt-status" :class="t.status">{{ t.status === 'complete' ? 'Completed' : 'Cancelled' }}</span>
                      <span v-if="t.is_test" class="cpt-flag test">Test</span>
                      <span v-if="t.is_refund" class="cpt-flag refund">Refund</span>
                      <span v-if="t.is_chargeback" class="cpt-flag chargeback">CB</span>
                    </div>
                  </td>
                  <td><span class="cpt-site">{{ t.site_name || '—' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="cpt-pagination">
            <span class="cpt-pagination-info">{{ paginationInfo }}</span>
            <div class="cpt-pagination-controls">
              <button :disabled="currentPage <= 1" @click="currentPage--">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
              </button>
              <template v-for="(p, i) in pageNumbers" :key="i">
                <span v-if="p === '...'" class="ellipsis">...</span>
                <button v-else :class="{ active: p === currentPage }" @click="currentPage = p">{{ p }}</button>
              </template>
              <button :disabled="currentPage >= totalPages" @click="currentPage++">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Transaction Slideout -->
    <Teleport to="body">
      <Transition name="slideout">
        <div v-if="showModal && selectedTransaction" class="cpt-slideout-overlay" @click.self="closeModal">
          <div class="cpt-slideout">
            <!-- Header -->
            <div class="cpt-slideout-header">
              <div class="cpt-slideout-header-left">
                <button class="cpt-slideout-back" @click="closeModal">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div>
                  <div class="cpt-slideout-title">Transaction Details</div>
                  <div class="cpt-slideout-subtitle">{{ selectedTransaction.site_name || 'Unknown Site' }}</div>
                </div>
              </div>
              <span class="cpt-slideout-status" :class="selectedTransaction.status">
                {{ selectedTransaction.status === 'complete' ? 'Completed' : 'Cancelled' }}
              </span>
            </div>

            <!-- Content -->
            <div class="cpt-slideout-content">
              <!-- Hero Amount Section -->
              <div class="cpt-slideout-hero" :class="selectedTransaction.status">
                <div class="cpt-slideout-hero-amount">{{ formatCurrency(parseFloat(selectedTransaction.cust_amount || 0), selectedTransaction.currency) }}</div>
                <div class="cpt-slideout-hero-meta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  {{ formatDateInTimezone(selectedTransaction.transaction_date).date }} at {{ formatDateInTimezone(selectedTransaction.transaction_date).time }}
                </div>
              </div>

              <!-- Flags Alert -->
              <div v-if="selectedTransaction.is_test || selectedTransaction.is_refund || selectedTransaction.is_chargeback" class="cpt-slideout-flags">
                <div v-if="selectedTransaction.is_test" class="cpt-slideout-flag test">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  Test Transaction
                </div>
                <div v-if="selectedTransaction.is_refund" class="cpt-slideout-flag refund">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                  Refunded
                </div>
                <div v-if="selectedTransaction.is_chargeback" class="cpt-slideout-flag chargeback">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  Chargeback
                </div>
              </div>

              <!-- Customer Section -->
              <div class="cpt-slideout-section">
                <div class="cpt-slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Customer
                </div>
                <div class="cpt-slideout-card">
                  <div class="cpt-slideout-card-row">
                    <span class="cpt-slideout-card-label">Name</span>
                    <span class="cpt-slideout-card-value">{{ selectedTransaction.cust_name || 'Unknown' }}</span>
                  </div>
                  <div class="cpt-slideout-card-row">
                    <span class="cpt-slideout-card-label">Email</span>
                    <span class="cpt-slideout-card-value">{{ selectedTransaction.cust_email_ad || 'No email' }}</span>
                  </div>
                </div>
              </div>

              <!-- Transaction IDs Section -->
              <div class="cpt-slideout-section">
                <div class="cpt-slideout-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  Identifiers
                </div>
                <div class="cpt-slideout-card">
                  <div class="cpt-slideout-card-row">
                    <span class="cpt-slideout-card-label">Transaction ID</span>
                    <span class="cpt-slideout-card-value mono">{{ selectedTransaction.cust_trans_id || '—' }}</span>
                  </div>
                  <div class="cpt-slideout-card-row">
                    <span class="cpt-slideout-card-label">Session ID</span>
                    <span class="cpt-slideout-card-value mono">{{ selectedTransaction.cust_session || '—' }}</span>
                  </div>
                  <div class="cpt-slideout-card-row">
                    <span class="cpt-slideout-card-label">Type</span>
                    <span class="cpt-slideout-card-value mono">{{ selectedTransaction.trans_type || 'Transaction' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Actions -->
            <div class="cpt-slideout-footer">
              <button class="cpt-slideout-btn secondary" @click="closeModal">
                Close
              </button>
              <button class="cpt-slideout-btn" :class="selectedTransaction.is_test ? 'active test' : 'outline'" @click="toggleTest">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ selectedTransaction.is_test ? 'Remove Test' : 'Mark Test' }}
              </button>
              <button v-if="selectedTransaction.status === 'complete'" class="cpt-slideout-btn" :class="selectedTransaction.is_refund ? 'active refund' : 'outline'" @click="toggleFlag('is_refund', 'refund_date')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ selectedTransaction.is_refund ? 'Remove Refund' : 'Mark Refund' }}
              </button>
              <button v-if="selectedTransaction.status === 'complete'" class="cpt-slideout-btn" :class="selectedTransaction.is_chargeback ? 'active chargeback' : 'outline'" @click="toggleFlag('is_chargeback', 'chargeback_date')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ selectedTransaction.is_chargeback ? 'Remove CB' : 'Mark CB' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Lock body scroll when slideout is open */
body:has(.cpt-slideout-overlay) {
  overflow: hidden;
}

/* ========================================
   SLIDEOUT PANEL (non-scoped for Teleport)
   ======================================== */

/* CSS Variables for slideout - light mode default */
.cpt-slideout-overlay {
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
  --accent-primary-dim: rgba(99, 102, 241, 0.1);
  --accent-success: #34d399;
  --accent-success-dim: rgba(34, 197, 94, 0.1);
  --accent-warning: #fbbf24;
  --accent-warning-dim: rgba(234, 179, 8, 0.1);
  --accent-danger: #f87171;
  --accent-danger-dim: rgba(239, 68, 68, 0.1);
  --font-display: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

/* Dark mode for slideout */
@media (prefers-color-scheme: dark) {
  .cpt-slideout-overlay {
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
    --accent-primary-dim: rgba(129, 140, 248, 0.15);
    --accent-success-dim: rgba(52, 211, 153, 0.15);
    --accent-warning-dim: rgba(251, 191, 36, 0.15);
    --accent-danger-dim: rgba(248, 113, 113, 0.15);
    background: rgba(0, 0, 0, 0.6);
  }
}

.cpt-slideout {
  position: relative;
  z-index: 1001;
  width: 100%;
  max-width: 500px;
  height: 100%;
  background: var(--bg-elevated);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.3);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.cpt-slideout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.cpt-slideout-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cpt-slideout-back {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: none;
  border-radius: 8px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.cpt-slideout-back:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.cpt-slideout-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.cpt-slideout-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.cpt-slideout-status {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 100px;
}

.cpt-slideout-status.complete {
  background: var(--accent-success-dim);
  color: var(--accent-success);
}

.cpt-slideout-status.incomplete {
  background: var(--accent-danger-dim);
  color: var(--accent-danger);
}

.cpt-slideout-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-base);
}

.cpt-slideout-hero {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-left: 4px solid var(--accent-success);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
}

.cpt-slideout-hero.incomplete {
  border-left-color: var(--accent-danger);
}

.cpt-slideout-hero-amount {
  font-size: 36px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.cpt-slideout-hero-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.cpt-slideout-hero-meta svg {
  color: var(--text-muted);
}

.cpt-slideout-flags {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.cpt-slideout-flag {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
}

.cpt-slideout-flag svg {
  width: 18px;
  height: 18px;
}

.cpt-slideout-flag.refund {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
  border: 1px solid rgba(129, 140, 248, 0.3);
}

.cpt-slideout-flag.chargeback {
  background: var(--accent-danger-dim);
  color: var(--accent-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.cpt-slideout-flag.test {
  background: var(--accent-warning-dim);
  color: var(--accent-warning);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.cpt-slideout-section {
  margin-bottom: 20px;
}

.cpt-slideout-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.cpt-slideout-section-title svg {
  color: var(--text-muted);
}

.cpt-slideout-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

.cpt-slideout-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.cpt-slideout-card-row:last-child {
  border-bottom: none;
}

.cpt-slideout-card-label {
  font-size: 13px;
  color: var(--text-tertiary);
}

.cpt-slideout-card-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: right;
  max-width: 60%;
  word-break: break-all;
}

.cpt-slideout-card-value.mono {
  font-family: var(--font-mono);
}

.cpt-slideout-card-value.small {
  font-size: 11px;
}

.cpt-slideout-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.cpt-slideout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.cpt-slideout-btn svg {
  flex-shrink: 0;
}

.cpt-slideout-btn.secondary {
  flex: 1;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.cpt-slideout-btn.secondary:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.cpt-slideout-btn.outline {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.cpt-slideout-btn.outline:hover {
  border-color: var(--border-default);
  color: var(--text-primary);
}

.cpt-slideout-btn.active.refund {
  flex: 1;
  background: var(--accent-primary-dim);
  border: 1px solid rgba(129, 140, 248, 0.4);
  color: var(--accent-primary);
}

.cpt-slideout-btn.active.chargeback {
  flex: 1;
  background: var(--accent-danger-dim);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--accent-danger);
}

.cpt-slideout-btn.active.test {
  flex: 1;
  background: var(--accent-warning-dim);
  border: 1px solid rgba(251, 191, 36, 0.4);
  color: var(--accent-warning);
}

/* Slideout Transition */
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

.slideout-enter-active .cpt-slideout {
  animation: cptPanelSlideIn 0.3s ease;
}

.slideout-leave-active .cpt-slideout {
  animation: cptPanelSlideOut 0.25s ease;
}

@keyframes cptPanelSlideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes cptPanelSlideOut {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}

/* Responsive slideout */
@media (max-width: 600px) {
  .cpt-slideout {
    max-width: 100%;
  }
  .cpt-slideout-hero-amount {
    font-size: 28px;
  }
  .cpt-slideout-footer {
    flex-wrap: wrap;
  }
  .cpt-slideout-btn {
    min-width: calc(50% - 6px);
  }
}
</style>

<!-- Import shared reports styles -->
<style>
@import '@/assets/styles/reports-shared.css';
</style>

<style scoped>
/* ========================================
   CPT REPORTS - Component-specific styles
   ======================================== */

/* Status badges (CPT-specific) */
.cpt-status-badges {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cpt-live {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-success);
  background: rgba(34, 197, 94, 0.1);
  padding: 4px 10px;
  border-radius: 20px;
}

.cpt-sync-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid var(--border-default);
}

.cpt-live-dot {
  width: 8px;
  height: 8px;
  background: var(--accent-success);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
  box-shadow: 0 0 8px var(--accent-success);
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

/* Export button (CPT-specific gradient) */
.cpt-export-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--accent-primary) 0%, #a78bfa 100%);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(129, 140, 248, 0.3);
}

.cpt-export-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(129, 140, 248, 0.4);
}

.cpt-export-btn svg {
  width: 16px;
  height: 16px;
}

/* ========================================
   OLD: Card-based Metrics (uncomment to revert)
   ========================================
.cpt-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.cpt-metric {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 20px;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
}

.cpt-metric:hover {
  border-color: var(--border-default);
  transform: translateY(-2px);
}

.cpt-metric-hero {
  border-left: 3px solid var(--accent-primary);
}

.cpt-metric-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.cpt-metric-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-feature-settings: "tnum" 1;
}

.cpt-metric-hero .cpt-metric-value {
  font-size: 36px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent-primary) 0%, #a78bfa 50%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cpt-metric-success { color: var(--accent-success) !important; }
.cpt-metric-warning { color: var(--accent-warning) !important; }

.cpt-metric-sub {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
*/

/* ========================================
   CONTENT LAYOUT
   ======================================== */
.cpt-content {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
}

/* ========================================
   CHART PANEL - Glassy
   ======================================== */
.cpt-chart-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-lg);
  padding: 20px;
  align-self: start;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.cpt-chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.cpt-chart-header h2 {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
  color: var(--text-secondary);
}

.cpt-chart-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cpt-chart-legend {
  display: flex;
  gap: 12px;
}

.cpt-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.cpt-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}

.cpt-legend-dot.completed {
  background: rgba(16, 185, 129, 1);
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}
.cpt-legend-dot.cancelled {
  background: transparent;
  border: 1.5px solid rgba(148, 163, 184, 0.6);
  box-shadow: none;
}

.cpt-range-tabs {
  display: flex;
  gap: 4px;
}

.cpt-range-tabs button {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cpt-range-tabs button:hover {
  color: var(--text-primary);
}

.cpt-range-tabs button.active {
  color: var(--accent-success);
  border-color: var(--accent-success);
  background: rgba(16, 185, 129, 0.1);
}

.cpt-chart-container {
  height: 260px;
  background: transparent;
}

/* ========================================
   TRANSACTIONS PANEL
   ======================================== */
.cpt-transactions-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.cpt-filters-bar {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  gap: 12px;
  align-items: center;
  background: var(--bg-surface);
  position: relative;
}

.cpt-search {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 400px;
}

.cpt-search svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.cpt-search input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.cpt-search input::placeholder {
  color: var(--text-tertiary);
}

.cpt-search input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

.cpt-search kbd {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  padding: 2px 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-tertiary);
}

/* Minimal Filters Design */
.cpt-filters-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cpt-filters-trigger-wrapper {
  position: relative;
}

.cpt-filters-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-filters-btn svg {
  width: 16px;
  height: 16px;
}

.cpt-filters-btn:hover {
  border-color: var(--border-emphasis);
  color: var(--text-primary);
}

.cpt-filters-btn.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.cpt-filter-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--accent-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
}

/* Filters Popover */
.cpt-filters-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 100;
  overflow: hidden;
}

.cpt-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.cpt-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.cpt-popover-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-popover-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.cpt-popover-close svg {
  width: 16px;
  height: 16px;
}

.cpt-popover-section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.cpt-popover-section:last-of-type {
  border-bottom: none;
}

.cpt-popover-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.cpt-popover-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.cpt-popover-checkbox span {
  user-select: none;
}

.cpt-popover-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.cpt-popover-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cpt-popover-status button {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-popover-status button:hover {
  border-color: var(--border-default);
  color: var(--text-primary);
}

.cpt-popover-status button.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.cpt-popover-dates {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cpt-popover-dates input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
}

.cpt-popover-dates input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.cpt-popover-date-sep {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.cpt-popover-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
}

.cpt-popover-clear {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-popover-clear:hover:not(:disabled) {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}

.cpt-popover-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cpt-popover-apply {
  flex: 1;
  padding: 10px 16px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-popover-apply:hover {
  background: #6366f1;
}

/* Active filter pills */
.cpt-active-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--accent-primary-dim);
  border: 1px solid rgba(129, 140, 248, 0.3);
  border-radius: 100px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-primary);
}

.cpt-active-filter button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--accent-primary);
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.cpt-active-filter button:hover {
  opacity: 1;
}

.cpt-active-filter button svg {
  width: 12px;
  height: 12px;
}

/* Popover transitions */
.popover-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popover-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ========================================
   TABLE
   ======================================== */
.cpt-table-container {
  flex: 1;
  overflow: auto;
}

.cpt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.cpt-table th:nth-child(1),
.cpt-table td:nth-child(1) { width: 15%; } /* Date */

.cpt-table th:nth-child(2),
.cpt-table td:nth-child(2) { width: 25%; } /* Customer */

.cpt-table th:nth-child(3),
.cpt-table td:nth-child(3) { width: 15%; } /* Amount */

.cpt-table th:nth-child(4),
.cpt-table td:nth-child(4) { width: 25%; } /* Status */

.cpt-table th:nth-child(5),
.cpt-table td:nth-child(5) { width: 20%; } /* Site */

.cpt-table th {
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
  z-index: 1;
}

.cpt-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

.cpt-table th.sortable:hover {
  color: var(--text-secondary);
}

.cpt-table th.sorted {
  color: var(--accent-primary);
}

.cpt-table th svg {
  width: 12px;
  height: 12px;
  margin-left: 4px;
  vertical-align: middle;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.cpt-table th.amount-col,
.cpt-table td.amount-col {
  text-align: right;
}

.cpt-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.cpt-table tbody tr {
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-table tbody tr:hover {
  background: var(--bg-hover);
}

.cpt-table tbody tr.flagged {
  background: var(--accent-danger-dim);
}

.cpt-table tbody tr.flagged:hover {
  background: rgba(248, 113, 113, 0.2);
}

.cpt-cell-date span {
  display: block;
}

.cpt-cell-date .time {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.cpt-cell-customer .name {
  display: block;
  font-weight: 500;
}

.cpt-cell-customer .email {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.cpt-amount {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-primary);
}

.cpt-cell-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cpt-status {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cpt-status.complete {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-success);
}

.cpt-status.incomplete {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
}

.cpt-flag {
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border-radius: 100px;
  border: none;
}

.cpt-flag.refund {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
}

.cpt-flag.chargeback {
  background: var(--accent-danger-dim);
  color: var(--accent-danger);
}

.cpt-flag.test {
  background: var(--accent-warning-dim);
  color: var(--accent-warning);
}

.cpt-site {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Loading & Empty */
.cpt-loading,
.cpt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
}

.cpt-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.cpt-empty svg {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.3;
}

/* ========================================
   PAGINATION
   ======================================== */
.cpt-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.cpt-pagination-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.cpt-pagination-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cpt-pagination-controls button {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-pagination-controls button:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-emphasis);
  color: var(--text-primary);
}

.cpt-pagination-controls button.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.cpt-pagination-controls button:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.cpt-pagination-controls button svg {
  width: 14px;
  height: 14px;
}

.cpt-pagination-controls .ellipsis {
  padding: 0 8px;
  color: var(--text-tertiary);
}

/* ========================================
   DROPDOWNS
   ======================================== */
.cpt-site-select,
.cpt-tz-select {
  --color-border: var(--border-default);
  --color-white: var(--bg-elevated);
  --color-text: var(--text-primary);
  --color-text-tertiary: var(--text-tertiary);
  --color-primary: var(--accent-primary);
  --color-card: var(--bg-elevated);
  --color-bg: var(--bg-surface);
  --radius: var(--radius-md);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.cpt-site-select { min-width: 160px; }
.cpt-tz-select { min-width: 140px; }

.cpt-site-select :deep(.dropdown-toggle) {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 32px 8px 12px;
  font-size: 13px;
  transition: all 0.15s ease;
}

.cpt-site-select :deep(.dropdown-toggle:hover) {
  border-color: var(--border-emphasis);
}

.cpt-tz-select :deep(.dropdown-toggle) {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 32px 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.cpt-tz-select :deep(.dropdown-toggle:hover) {
  border-color: var(--border-emphasis);
  color: var(--text-primary);
}

.cpt-tz-right {
  margin-left: auto;
}

.cpt-site-select :deep(.dropdown-menu),
.cpt-tz-select :deep(.dropdown-menu) {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* ========================================
   RESPONSIVE
   ======================================== */

/* Hide volume chart on smaller screens (MacBook Air, etc.) */
@media (max-width: 1400px) {
  .cpt-content {
    grid-template-columns: 1fr;
  }

  .cpt-chart-panel {
    display: none;
  }
}

@media (max-width: 1100px) {
  /* New stats bar responsive */
  .cpt-stats-bar {
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px;
  }

  .cpt-stat {
    flex: 1 1 calc(33% - 8px);
    min-width: 100px;
  }

  .cpt-stat-divider {
    display: none;
  }

  /* Old metrics (if reverting) */
  .cpt-metrics {
    grid-template-columns: repeat(3, 1fr);
  }

  .cpt-metric-hero .cpt-metric-value {
    font-size: 28px;
  }
}

@media (max-width: 900px) {
  .cpt-main {
    padding: 16px;
  }

  .cpt-topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .cpt-topbar-right {
    width: 100%;
    flex-wrap: wrap;
  }

  .cpt-metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  /* Minimal filters responsive */
  .cpt-filters-bar {
    flex-wrap: wrap;
  }

  .cpt-search {
    flex: 1 1 100%;
    max-width: none;
    order: 1;
  }

  .cpt-filters-actions {
    order: 2;
    width: 100%;
    justify-content: flex-start;
  }

  .cpt-filters-popover {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-height: 80vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    overflow-y: auto;
  }
}

@media (max-width: 600px) {
  /* New stats bar responsive */
  .cpt-stat {
    flex: 1 1 calc(50% - 6px);
  }

  .cpt-stat-value {
    font-size: 20px;
  }

  .cpt-stat-primary .cpt-stat-value {
    font-size: 22px;
  }

  .cpt-stat-label {
    font-size: 11px;
  }

  /* Old metrics (if reverting) */
  .cpt-metrics {
    grid-template-columns: 1fr 1fr;
  }

  .cpt-metric-value {
    font-size: 24px;
  }

  .cpt-metric-hero .cpt-metric-value {
    font-size: 24px;
  }

  .cpt-active-filter {
    font-size: 11px;
    padding: 5px 8px;
  }

  .cpt-pagination {
    flex-direction: column;
    gap: 12px;
  }
}

/* ========================================
   DARK MODE
   ======================================== */
@media (prefers-color-scheme: dark) {
  .cpt {
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

    --accent-primary-dim: rgba(129, 140, 248, 0.15);
    --accent-success-dim: rgba(52, 211, 153, 0.15);
    --accent-warning-dim: rgba(251, 191, 36, 0.15);
    --accent-danger-dim: rgba(248, 113, 113, 0.15);
  }

  .cpt-stats-bar,
  .cpt-chart-panel,
  .cpt-transactions-panel {
    background: rgba(18, 18, 26, 0.85);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .cpt-slideout-overlay {
    background: rgba(0, 0, 0, 0.6);
  }
}
</style>
