<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAuth } from '@/composables/useAuth'
import CustomDropdown from '@/components/CustomDropdown.vue'

const { supabase } = useSupabase()
const { user } = useAuth()

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
const searchInput = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const currentStatusFilter = ref('all')
const currentTimezone = ref('America/Los_Angeles')
const chartRange = ref('7d')

// Pagination & Sorting
const currentPage = ref(1)
const currentSort = ref({ column: 'transaction_date', direction: 'desc' })

// Modal
const showModal = ref(false)
const selectedTransaction = ref(null)

// Computed
const stats = computed(() => {
  const txs = siteFilteredTransactions.value
  const completed = txs.filter(t => t.status === 'complete')
  const totalCaptured = completed.reduce((sum, t) => sum + parseFloat(t.cust_amount || 0), 0)

  return {
    totalCaptured,
    completed: completed.length,
    cancelled: txs.length - completed.length,
    avgAmount: completed.length ? totalCaptured / completed.length : 0,
    completionRate: txs.length ? ((completed.length / txs.length) * 100).toFixed(1) : 0,
    total: txs.length
  }
})

const todayInsights = computed(() => {
  const todayStr = formatDateStr(new Date())
  return transactionsByDate.value[todayStr] || { complete: 0, cancelled: 0, volume: 0 }
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
  searchInput.value || dateFrom.value || dateTo.value || currentStatusFilter.value !== 'all'
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
const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2
}).format(amount)

const formatCurrencyShort = (amount) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`
  return formatCurrency(amount)
}

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
    const dateStr = formatDateStr(convertToTimezone(t.transaction_date))
    if (dateStr < cutoffStr) continue
    result[dateStr] = result[dateStr] || { complete: 0, cancelled: 0, volume: 0 }
    if (t.status === 'complete') {
      result[dateStr].complete++
      result[dateStr].volume += parseFloat(t.cust_amount || 0)
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

    let query = supabase.from('cpt_data').select('*')
      .order('transaction_date', { ascending: false }).limit(5000)

    const siteIds = (activeSites || []).map(s => s.site_id)
    if (siteIds.length) query = query.in('site_id', siteIds)

    const { data, error } = await query
    if (error) throw error

    allTransactions.value = (data || []).map(t => ({
      ...t, status: t.trans_type === 'complete' ? 'complete' : 'incomplete'
    }))
    applyGlobalSiteFilter()
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
function applyGlobalSiteFilter() {
  siteFilteredTransactions.value = globalSiteFilter.value
    ? allTransactions.value.filter(t => t.site_name === globalSiteFilter.value)
    : [...allTransactions.value]
  buildTransactionsByDate()
  applyFilters()
  nextTick(initCharts)
}

function applyFilters() {
  const search = searchInput.value.toLowerCase()
  filteredTransactions.value = siteFilteredTransactions.value.filter(t => {
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
      to.setHours(23, 59, 59, 999)
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
        { label: 'Completed', data: [], backgroundColor: 'rgba(99, 102, 241, 0.85)', borderRadius: 4, borderSkipped: false, barPercentage: 0.7 },
        { label: 'Cancelled', data: [], backgroundColor: 'rgba(251, 191, 36, 0.5)', borderRadius: 4, borderSkipped: false, barPercentage: 0.7 }
      ], volumeData: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
            displayColors: true,
            boxPadding: 4,
            titleFont: { family: 'Inter, -apple-system, sans-serif', size: 13, weight: '600' },
            bodyFont: { family: 'Inter, -apple-system, sans-serif', size: 12 },
            callbacks: {
              afterBody: function(context) {
                const dataIndex = context[0].dataIndex
                const volume = this.chart.data.volumeData?.[dataIndex] || 0
                return '\nVolume: ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(volume)
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter, -apple-system, sans-serif', size: 11 } }, border: { display: false }},
          y: { stacked: true, grid: { color: 'rgba(255, 255, 255, 0.06)' }, ticks: { color: '#64748b', font: { family: 'Inter, -apple-system, sans-serif', size: 11 } }, border: { display: false }}
        }
      }
    })
    updateVolumeChart()
  }
}

function updateVolumeChart() {
  if (!volumeChart) return
  const days = chartRange.value === '7d' ? 7 : chartRange.value === '30d' ? 30 : 90
  const labels = [], completeData = [], cancelledData = [], volumeData = []

  for (let i = days - 1; i >= 0; i--) {
    // Create date by subtracting days from current time to maintain timezone consistency
    const d = new Date()
    d.setDate(d.getDate() - i)
    const str = formatDateStr(d)
    const data = transactionsByDate.value[str] || { complete: 0, cancelled: 0, volume: 0 }
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: currentTimezone.value }))
    completeData.push(data.complete)
    cancelledData.push(data.cancelled)
    volumeData.push(data.volume)
  }

  volumeChart.data.labels = labels
  volumeChart.data.datasets[0].data = completeData
  volumeChart.data.datasets[1].data = cancelledData
  volumeChart.data.volumeData = volumeData
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
    t[field] = newValue
    const idx = allTransactions.value.findIndex(x => x.cust_session === t.cust_session && x.transaction_date === t.transaction_date)
    if (idx !== -1) allTransactions.value[idx][field] = newValue
    applyGlobalSiteFilter()
  } catch (e) {
    console.error(`Error updating ${field}:`, e)
    alert(`Failed to update ${field}`)
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
function handleKeydown(e) {
  if (e.key === 'Escape') closeModal()
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

// Watchers
watch(searchInput, applyFilters)
watch([dateFrom, dateTo], applyFilters)
watch(globalSiteFilter, applyGlobalSiteFilter)

// Lifecycle
onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)
  await Promise.all([loadData(), loadSyncStatus()])
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  volumeChart?.destroy()
})
</script>

<template>
  <div class="cpt">
    <!-- Background -->
    <div class="cpt-bg">
      <div class="cpt-grid"></div>
      <div class="cpt-glow cpt-glow-1"></div>
      <div class="cpt-glow cpt-glow-2"></div>
    </div>

    <div class="cpt-main">
      <!-- Top Bar -->
      <header class="cpt-topbar">
        <div class="cpt-topbar-left">
          <div class="cpt-page-title">
            <span class="cpt-breadcrumb">Reports</span>
            <h1>Transactions</h1>
          </div>
          <div class="cpt-status-badges">
            <span class="cpt-live"><span class="cpt-live-dot"></span>Live</span>
            <span v-if="lastSyncTime" class="cpt-sync-badge">{{ getRelativeTime(lastSyncTime) }}</span>
          </div>
        </div>
        <div class="cpt-topbar-right">
          <CustomDropdown v-model="globalSiteFilter" :options="siteDropdownOptions" placeholder="All Sites" class="cpt-site-select" />
          <button class="cpt-icon-btn" @click="loadData(); loadSyncStatus()" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="cpt-export-btn" @click="exportData">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Export
          </button>
        </div>
      </header>

      <!-- Metrics Strip -->
      <section class="cpt-metrics">
        <div class="cpt-metric cpt-metric-hero">
          <div class="cpt-metric-content">
            <span class="cpt-metric-label">Total Revenue</span>
            <span class="cpt-metric-value">{{ formatCurrencyShort(stats.totalCaptured) }}</span>
            <div class="cpt-metric-trend" :class="volumeTrend.direction">
              <svg v-if="volumeTrend.direction === 'up'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l5-5 5 5M7 7l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <svg v-else-if="volumeTrend.direction === 'down'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7l5 5 5-5M7 17l5-5 5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>{{ volumeTrend.percent }}% vs yesterday</span>
            </div>
          </div>
          <svg class="cpt-metric-spark" viewBox="0 0 120 32" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#818cf8" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="#818cf8"/>
              </linearGradient>
            </defs>
            <path :d="generateTrendPath(trendData)" fill="none" stroke="url(#sparkGrad)" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>

        <div class="cpt-metric">
          <span class="cpt-metric-label">Today</span>
          <span class="cpt-metric-value">{{ formatCurrencyShort(todayInsights.volume) }}</span>
          <span class="cpt-metric-sub">{{ todayInsights.complete + todayInsights.cancelled }} transactions</span>
        </div>

        <div class="cpt-metric">
          <span class="cpt-metric-label">Completed Today</span>
          <span class="cpt-metric-value cpt-metric-success">{{ todayInsights.complete.toLocaleString() }}</span>
          <span class="cpt-metric-sub">{{ stats.completionRate }}% success rate</span>
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

      <!-- Main Content -->
      <div class="cpt-content">
        <!-- Chart Panel -->
        <section class="cpt-chart-panel">
          <div class="cpt-chart-header">
            <h2>Volume Trend</h2>
            <div class="cpt-chart-controls">
              <div class="cpt-chart-legend">
                <span class="cpt-legend-item"><span class="cpt-legend-dot completed"></span>Completed</span>
                <span class="cpt-legend-item"><span class="cpt-legend-dot cancelled"></span>Cancelled</span>
              </div>
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
          <!-- Search & Filters -->
          <div class="cpt-filters-bar">
            <div class="cpt-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input ref="searchInputRef" v-model="searchInput" type="text" placeholder="Search transactions...">
              <kbd>⌘K</kbd>
            </div>

            <div class="cpt-filter-group">
              <div class="cpt-status-filter">
                <button :class="{ active: currentStatusFilter === 'all' }" @click="currentStatusFilter = 'all'; applyFilters()">All</button>
                <button :class="{ active: currentStatusFilter === 'complete' }" @click="currentStatusFilter = 'complete'; applyFilters()">Completed</button>
                <button :class="{ active: currentStatusFilter === 'incomplete' }" @click="currentStatusFilter = 'incomplete'; applyFilters()">Cancelled</button>
                <button :class="{ active: currentStatusFilter === 'refund' }" @click="currentStatusFilter = 'refund'; applyFilters()">Refunds</button>
                <button :class="{ active: currentStatusFilter === 'chargeback' }" @click="currentStatusFilter = 'chargeback'; applyFilters()">Chargebacks</button>
              </div>

              <div class="cpt-date-filters">
                <input type="date" v-model="dateFrom" placeholder="From">
                <input type="date" v-model="dateTo" placeholder="To">
              </div>

              <CustomDropdown v-model="currentTimezone" :options="TIMEZONES" placeholder="Timezone" class="cpt-tz-select" @update:modelValue="changeTimezone" />

              <button v-if="hasActiveFilters" class="cpt-clear-btn" @click="clearAllFilters">Clear</button>
            </div>
          </div>

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
                    <span class="cpt-amount">{{ formatCurrency(parseFloat(t.cust_amount || 0)) }}</span>
                  </td>
                  <td>
                    <div class="cpt-cell-status">
                      <span class="cpt-status" :class="t.status">{{ t.status === 'complete' ? 'Completed' : 'Cancelled' }}</span>
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

    <!-- Transaction Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showModal && selectedTransaction" class="cpt-modal-overlay" @click.self="closeModal">
          <div class="cpt-modal">
            <button class="cpt-modal-close" @click="closeModal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
            </button>

            <!-- Hero Amount Section -->
            <div class="cpt-modal-hero" :class="selectedTransaction.status">
              <div class="cpt-modal-hero-bg"></div>
              <div class="cpt-modal-hero-content">
                <div class="cpt-modal-status" :class="selectedTransaction.status">
                  <span class="status-dot"></span>
                  {{ selectedTransaction.status === 'complete' ? 'Completed' : 'Cancelled' }}
                </div>
                <div class="cpt-modal-amount">
                  <span class="currency-symbol">$</span>
                  <span class="amount-value">{{ parseFloat(selectedTransaction.cust_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                  <span class="currency-code">{{ selectedTransaction.currency || 'CAD' }}</span>
                </div>
                <div class="cpt-modal-datetime">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  {{ formatDateInTimezone(selectedTransaction.transaction_date).date }} at {{ formatDateInTimezone(selectedTransaction.transaction_date).time }}
                </div>
              </div>
            </div>

            <!-- Modal Body -->
            <div class="cpt-modal-body">
              <!-- Customer Card -->
              <div class="cpt-modal-card">
                <div class="cpt-modal-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div class="cpt-modal-card-content">
                  <span class="cpt-modal-card-label">Customer</span>
                  <span class="cpt-modal-card-value">{{ selectedTransaction.cust_name || 'Unknown' }}</span>
                  <span class="cpt-modal-card-sub">{{ selectedTransaction.cust_email_ad || 'No email' }}</span>
                </div>
              </div>

              <!-- Site Card -->
              <div class="cpt-modal-card">
                <div class="cpt-modal-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <div class="cpt-modal-card-content">
                  <span class="cpt-modal-card-label">Site</span>
                  <span class="cpt-modal-card-value">{{ selectedTransaction.site_name || 'Unknown' }}</span>
                  <span class="cpt-modal-card-sub">{{ selectedTransaction.trans_type || 'Transaction' }}</span>
                </div>
              </div>

              <!-- IDs Section -->
              <div class="cpt-modal-ids">
                <div class="cpt-modal-id">
                  <span class="cpt-modal-id-label">Transaction ID</span>
                  <span class="cpt-modal-id-value">{{ selectedTransaction.cust_trans_id || '—' }}</span>
                </div>
                <div class="cpt-modal-id">
                  <span class="cpt-modal-id-label">Session ID</span>
                  <span class="cpt-modal-id-value small">{{ selectedTransaction.cust_session || '—' }}</span>
                </div>
              </div>

              <!-- Flags -->
              <div v-if="selectedTransaction.is_refund || selectedTransaction.is_chargeback" class="cpt-modal-flags">
                <div v-if="selectedTransaction.is_refund" class="cpt-modal-flag refund">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                  Refunded
                </div>
                <div v-if="selectedTransaction.is_chargeback" class="cpt-modal-flag chargeback">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  Chargeback
                </div>
              </div>

              <!-- Actions -->
              <div class="cpt-modal-actions">
                <button :class="{ active: selectedTransaction.is_refund }" @click="toggleFlag('is_refund', 'refund_date')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {{ selectedTransaction.is_refund ? 'Remove Refund' : 'Mark Refund' }}
                </button>
                <button :class="{ active: selectedTransaction.is_chargeback }" @click="toggleFlag('is_chargeback', 'chargeback_date')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  {{ selectedTransaction.is_chargeback ? 'Remove CB' : 'Mark Chargeback' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ========================================
   MODERN FINTECH THEME - CPT REPORTS
   ======================================== */

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

  --accent-primary: #818cf8;
  --accent-primary-dim: rgba(129, 140, 248, 0.15);
  --accent-success: #34d399;
  --accent-success-dim: rgba(52, 211, 153, 0.15);
  --accent-warning: #fbbf24;
  --accent-warning-dim: rgba(251, 191, 36, 0.15);
  --accent-danger: #f87171;
  --accent-danger-dim: rgba(248, 113, 113, 0.15);

  --font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  position: relative;
  min-height: 100vh;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* ========================================
   BACKGROUND
   ======================================== */
.cpt-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.cpt-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, black 70%, transparent 100%);
}

.cpt-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
}

.cpt-glow-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
  top: -200px;
  left: 20%;
}

.cpt-glow-2 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.1) 0%, transparent 70%);
  bottom: 10%;
  right: 10%;
}

/* ========================================
   MAIN LAYOUT
   ======================================== */
.cpt-main {
  position: relative;
  z-index: 1;
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px 32px;
}

/* ========================================
   TOP BAR
   ======================================== */
.cpt-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  margin-bottom: 24px;
}

.cpt-topbar-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.cpt-page-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cpt-breadcrumb {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cpt-topbar h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

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

.cpt-topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cpt-icon-btn {
  width: 40px;
  height: 40px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.cpt-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-emphasis);
  transform: translateY(-1px);
}

.cpt-icon-btn svg {
  width: 18px;
  height: 18px;
}

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
   METRICS STRIP
   ======================================== */
.cpt-metrics {
  display: grid;
  grid-template-columns: 2fr repeat(4, 1fr);
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);
  border-color: var(--border-default);
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
  letter-spacing: -0.02em;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.cpt-metric-hero .cpt-metric-value {
  font-size: 36px;
  background: linear-gradient(135deg, var(--accent-primary) 0%, #a78bfa 50%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.cpt-metric-success { color: var(--accent-success) !important; }
.cpt-metric-warning { color: var(--accent-warning) !important; }

.cpt-metric-sub {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.cpt-metric-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-top: 8px;
}

.cpt-metric-trend.up { color: var(--accent-success); }
.cpt-metric-trend.down { color: var(--accent-danger); }
.cpt-metric-trend.neutral { color: var(--text-tertiary); }

.cpt-metric-trend svg {
  width: 14px;
  height: 14px;
}

.cpt-metric-spark {
  width: 120px;
  height: 40px;
  flex-shrink: 0;
}

/* ========================================
   CONTENT LAYOUT
   ======================================== */
.cpt-content {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
}

/* ========================================
   CHART PANEL
   ======================================== */
.cpt-chart-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
}

.cpt-chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.cpt-chart-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.cpt-chart-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.cpt-chart-legend {
  display: flex;
  gap: 16px;
}

.cpt-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.cpt-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.cpt-legend-dot.completed { background: rgba(99, 102, 241, 0.85); }
.cpt-legend-dot.cancelled { background: rgba(251, 191, 36, 0.5); }

.cpt-range-tabs {
  display: flex;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 2px;
}

.cpt-range-tabs button {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-range-tabs button:hover {
  color: var(--text-secondary);
}

.cpt-range-tabs button.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.cpt-chart-container {
  height: 280px;
  background: transparent;
}

/* ========================================
   TRANSACTIONS PANEL
   ======================================== */
.cpt-transactions-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cpt-filters-bar {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  background: var(--bg-surface);
}

.cpt-search {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
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

.cpt-filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.cpt-status-filter {
  display: flex;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 2px;
}

.cpt-status-filter button {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-status-filter button:hover {
  color: var(--text-secondary);
}

.cpt-status-filter button.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.cpt-date-filters {
  display: flex;
  gap: 8px;
}

.cpt-date-filters input {
  padding: 8px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  transition: all 0.15s ease;
}

.cpt-date-filters input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.cpt-clear-btn {
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpt-clear-btn:hover {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
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
  font-family: var(--font-mono);
  font-weight: 600;
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
  border-radius: 100px;
  border: none;
}

.cpt-status.complete {
  background: var(--accent-success-dim);
  color: var(--accent-success);
}

.cpt-status.incomplete {
  background: var(--accent-warning-dim);
  color: var(--accent-warning);
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

.cpt-site-select :deep(.dropdown-toggle),
.cpt-tz-select :deep(.dropdown-toggle) {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 32px 8px 12px;
  font-size: 13px;
  transition: all 0.15s ease;
}

.cpt-site-select :deep(.dropdown-toggle:hover),
.cpt-tz-select :deep(.dropdown-toggle:hover) {
  border-color: var(--border-emphasis);
}

.cpt-site-select :deep(.dropdown-menu),
.cpt-tz-select :deep(.dropdown-menu) {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* ========================================
   MODAL
   ======================================== */
.cpt-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.cpt-modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 20px;
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  position: relative;
}

.cpt-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;
}

.cpt-modal-close:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: rotate(90deg);
}

.cpt-modal-close svg {
  width: 18px;
  height: 18px;
}

/* Hero Amount Section */
.cpt-modal-hero {
  position: relative;
  padding: 40px 24px 32px;
  text-align: center;
  overflow: hidden;
}

.cpt-modal-hero.complete {
  background: linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%);
}

.cpt-modal-hero.incomplete {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(248, 113, 113, 0.1) 100%);
}

.cpt-modal-hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 50%, rgba(168, 85, 247, 0.15) 0%, transparent 50%);
  pointer-events: none;
}

.cpt-modal-hero-content {
  position: relative;
  z-index: 1;
}

.cpt-modal-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: 100px;
  margin-bottom: 16px;
}

.cpt-modal-status .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

.cpt-modal-status.complete {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.cpt-modal-status.complete .status-dot {
  background: #34d399;
  box-shadow: 0 0 8px #34d399;
}

.cpt-modal-status.incomplete {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.cpt-modal-status.incomplete .status-dot {
  background: #fbbf24;
  box-shadow: 0 0 8px #fbbf24;
}

.cpt-modal-amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
  margin-bottom: 12px;
}

.cpt-modal-amount .currency-symbol {
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
  font-family: var(--font-mono);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}

.cpt-modal-amount .amount-value {
  font-size: 56px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #ffffff;
  font-family: var(--font-mono);
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.cpt-modal-amount .currency-code {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  margin-left: 6px;
  align-self: flex-end;
  margin-bottom: 10px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  background: rgba(0, 0, 0, 0.25);
  padding: 2px 8px;
  border-radius: 4px;
}

.cpt-modal-datetime {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.cpt-modal-datetime svg {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}

/* Modal Body */
.cpt-modal-body {
  padding: 20px;
  overflow-y: auto;
  max-height: calc(90vh - 220px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Info Cards */
.cpt-modal-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all 0.15s ease;
}

.cpt-modal-card:hover {
  border-color: var(--border-default);
  background: var(--bg-hover);
}

.cpt-modal-card-icon {
  width: 40px;
  height: 40px;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cpt-modal-card-icon svg {
  width: 20px;
  height: 20px;
  color: var(--accent-primary);
}

.cpt-modal-card-content {
  flex: 1;
  min-width: 0;
}

.cpt-modal-card-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 2px;
}

.cpt-modal-card-value {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cpt-modal-card-sub {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* IDs Section */
.cpt-modal-ids {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.cpt-modal-id {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cpt-modal-id-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
}

.cpt-modal-id-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 6px 10px;
  border-radius: 4px;
  word-break: break-all;
}

.cpt-modal-id-value.small {
  font-size: 10px;
}

/* Flags */
.cpt-modal-flags {
  display: flex;
  gap: 8px;
}

.cpt-modal-flag {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
}

.cpt-modal-flag svg {
  width: 16px;
  height: 16px;
}

.cpt-modal-flag.refund {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
  border: 1px solid rgba(129, 140, 248, 0.3);
}

.cpt-modal-flag.chargeback {
  background: var(--accent-danger-dim);
  color: var(--accent-danger);
  border: 1px solid rgba(248, 113, 113, 0.3);
}

/* Actions */
.cpt-modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.cpt-modal-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cpt-modal-actions button svg {
  width: 15px;
  height: 15px;
}

.cpt-modal-actions button:hover {
  background: var(--bg-hover);
  border-color: var(--border-emphasis);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.cpt-modal-actions button:first-child:hover,
.cpt-modal-actions button:first-child.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.cpt-modal-actions button:last-child:hover,
.cpt-modal-actions button:last-child.active {
  background: var(--accent-danger-dim);
  border-color: var(--accent-danger);
  color: var(--accent-danger);
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .cpt-modal,
.modal-leave-to .cpt-modal {
  transform: scale(0.95) translateY(10px);
}

/* ========================================
   RESPONSIVE
   ======================================== */
@media (max-width: 1200px) {
  .cpt-content {
    grid-template-columns: 1fr;
  }

  .cpt-chart-panel {
    order: 2;
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
    grid-template-columns: 1fr 1fr;
  }

  .cpt-metric-hero {
    grid-column: span 2;
  }

  .cpt-filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .cpt-search {
    max-width: none;
  }

  .cpt-filter-group {
    justify-content: flex-start;
  }
}

@media (max-width: 600px) {
  .cpt-metrics {
    grid-template-columns: 1fr;
  }

  .cpt-metric-hero {
    grid-column: span 1;
  }

  .cpt-metric-value {
    font-size: 24px;
  }

  .cpt-metric-hero .cpt-metric-value {
    font-size: 28px;
  }

  .cpt-date-filters {
    flex-direction: column;
    width: 100%;
  }

  .cpt-date-filters input {
    width: 100%;
  }

  .cpt-status-filter {
    width: 100%;
    flex-wrap: wrap;
  }

  .cpt-status-filter button {
    flex: 1;
    min-width: 0;
  }

  .cpt-pagination {
    flex-direction: column;
    gap: 12px;
  }

  .cpt-modal-actions {
    grid-template-columns: 1fr;
  }

  .cpt-modal-amount {
    font-size: 28px;
  }
}

/* ========================================
   LIGHT MODE
   ======================================== */
@media (prefers-color-scheme: light) {
  .cpt {
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

    --accent-primary-dim: rgba(99, 102, 241, 0.1);
    --accent-success-dim: rgba(34, 197, 94, 0.1);
    --accent-warning-dim: rgba(234, 179, 8, 0.1);
    --accent-danger-dim: rgba(239, 68, 68, 0.1);
  }

  .cpt-glow-1 {
    background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%);
  }

  .cpt-glow-2 {
    background: radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%);
  }

  .cpt-grid {
    background-image:
      linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px);
  }

  .cpt-modal-overlay {
    background: rgba(255, 255, 255, 0.8);
  }
}
</style>
