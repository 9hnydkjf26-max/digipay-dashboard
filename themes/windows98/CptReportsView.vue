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
        { label: 'Completed', data: [], backgroundColor: '#000080', borderRadius: 0, borderSkipped: false, barPercentage: 0.8 },
        { label: 'Cancelled', data: [], backgroundColor: '#808000', borderRadius: 0, borderSkipped: false, barPercentage: 0.8 }
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#ffffcc',
            titleColor: '#000000',
            bodyColor: '#000000',
            borderColor: '#000000',
            borderWidth: 1,
            padding: 6,
            cornerRadius: 0,
            displayColors: true,
            boxPadding: 2,
            titleFont: { family: '"MS Sans Serif", Tahoma, Arial', size: 11, weight: 'bold' },
            bodyFont: { family: '"MS Sans Serif", Tahoma, Arial', size: 11 }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: '#000000', font: { family: '"MS Sans Serif", Tahoma, Arial', size: 10 } }, border: { display: false }},
          y: { stacked: true, grid: { color: '#c0c0c0' }, ticks: { color: '#000000', font: { family: '"MS Sans Serif", Tahoma, Arial', size: 10 } }, border: { display: false }}
        }
      }
    })
    updateVolumeChart()
  }
}

function updateVolumeChart() {
  if (!volumeChart) return
  const days = chartRange.value === '7d' ? 7 : chartRange.value === '30d' ? 30 : 90
  const { year, month, day } = getTodayParts()
  const labels = [], completeData = [], cancelledData = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(year, month, day - i)
    const str = formatDateStr(d)
    const data = transactionsByDate.value[str] || { complete: 0, cancelled: 0 }
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    completeData.push(data.complete)
    cancelledData.push(data.cancelled)
  }

  volumeChart.data.labels = labels
  volumeChart.data.datasets[0].data = completeData
  volumeChart.data.datasets[1].data = cancelledData
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
          <div class="cpt-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 3v18h18" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7 14l4-4 4 4 5-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div>
            <h1>CPT Analytics</h1>
            <div class="cpt-topbar-meta">
              <span class="cpt-live"><span class="cpt-live-dot"></span>Live</span>
              <span v-if="lastSyncTime" class="cpt-sync-time">Updated {{ getRelativeTime(lastSyncTime) }}</span>
            </div>
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

            <!-- Modal Header -->
            <div class="cpt-modal-header">
              <div class="cpt-modal-status" :class="selectedTransaction.status">
                {{ selectedTransaction.status === 'complete' ? 'Completed' : 'Cancelled' }}
              </div>
              <div class="cpt-modal-amount-wrap">
                <span class="cpt-modal-amount">{{ formatCurrency(parseFloat(selectedTransaction.cust_amount || 0)) }}</span>
                <span class="cpt-modal-currency">{{ selectedTransaction.currency || 'CAD' }}</span>
              </div>
              <div class="cpt-modal-datetime">
                {{ formatDateInTimezone(selectedTransaction.transaction_date).date }} at {{ formatDateInTimezone(selectedTransaction.transaction_date).time }}
              </div>
            </div>

            <!-- Modal Body -->
            <div class="cpt-modal-body">
              <div class="cpt-modal-section">
                <h3>Customer</h3>
                <div class="cpt-modal-field">
                  <label>Name</label>
                  <span>{{ selectedTransaction.cust_name || '—' }}</span>
                </div>
                <div class="cpt-modal-field">
                  <label>Email</label>
                  <span>{{ selectedTransaction.cust_email_ad || '—' }}</span>
                </div>
              </div>

              <div class="cpt-modal-section">
                <h3>Transaction</h3>
                <div class="cpt-modal-field">
                  <label>Type</label>
                  <span>{{ selectedTransaction.trans_type || '—' }}</span>
                </div>
                <div class="cpt-modal-field">
                  <label>Site</label>
                  <span>{{ selectedTransaction.site_name || '—' }}</span>
                </div>
                <div class="cpt-modal-field full">
                  <label>Transaction ID</label>
                  <span class="mono">{{ selectedTransaction.cust_trans_id || '—' }}</span>
                </div>
                <div class="cpt-modal-field full">
                  <label>Session ID</label>
                  <span class="mono small">{{ selectedTransaction.cust_session || '—' }}</span>
                </div>
              </div>

              <div class="cpt-modal-section">
                <h3>Actions</h3>
                <div class="cpt-modal-actions">
                  <button :class="{ active: selectedTransaction.is_refund }" @click="toggleFlag('is_refund', 'refund_date')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ selectedTransaction.is_refund ? 'Marked as Refund' : 'Mark as Refund' }}
                  </button>
                  <button :class="{ active: selectedTransaction.is_chargeback }" @click="toggleFlag('is_chargeback', 'chargeback_date')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ selectedTransaction.is_chargeback ? 'Marked as Chargeback' : 'Mark as Chargeback' }}
                  </button>
                </div>
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
   WINDOWS 98 THEME - CPT REPORTS
   ======================================== */

/* Windows 98 Color Palette */
.cpt {
  --win98-bg: #008080;
  --win98-silver: #c0c0c0;
  --win98-white: #ffffff;
  --win98-black: #000000;
  --win98-dark-gray: #808080;
  --win98-navy: #000080;
  --win98-highlight: #1084d0;
  --win98-light: #dfdfdf;

  --accent-success: #008000;
  --accent-warning: #808000;
  --accent-danger: #800000;
  --accent-primary: #000080;
  --accent-success-dim: rgba(0, 128, 0, 0.2);
  --accent-warning-dim: rgba(128, 128, 0, 0.2);
  --accent-danger-dim: rgba(128, 0, 0, 0.2);
  --accent-primary-dim: rgba(0, 0, 128, 0.2);

  --font-mono: 'Fixedsys', 'Courier New', monospace;

  position: relative;
  min-height: 100vh;
  background: var(--win98-bg);
  color: var(--win98-black);
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
  font-size: 11px;
}

/* ========================================
   BACKGROUND - Windows 98 Teal Desktop
   ======================================== */
.cpt-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.cpt-grid,
.cpt-glow,
.cpt-glow-1,
.cpt-glow-2 {
  display: none;
}

/* ========================================
   MAIN LAYOUT - Window Frame
   ======================================== */
.cpt-main {
  position: relative;
  z-index: 1;
  max-width: 1400px;
  margin: 8px auto;
  padding: 0;
  background: var(--win98-silver);
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #dfdfdf,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #ffffff;
}

/* ========================================
   TOP BAR - Window Title Bar
   ======================================== */
.cpt-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 4px;
  background: linear-gradient(90deg, #000080 0%, #1084d0 100%);
  color: white;
  margin-bottom: 0;
}

.cpt-topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cpt-logo {
  width: 16px;
  height: 16px;
  background: none;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cpt-logo svg {
  width: 16px;
  height: 16px;
  color: white;
}

.cpt-topbar h1 {
  font-size: 12px;
  font-weight: bold;
  margin: 0;
  letter-spacing: 0;
  text-shadow: 1px 1px 0 #000080;
}

.cpt-topbar-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 0;
  margin-left: 16px;
}

.cpt-live {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: normal;
  color: #00ff00;
}

.cpt-live-dot {
  width: 8px;
  height: 8px;
  background: #00ff00;
  border-radius: 0;
  animation: blink98 1s step-end infinite;
}

@keyframes blink98 {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.cpt-sync-time {
  font-size: 11px;
  color: #c0c0c0;
}

.cpt-topbar-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Windows 98 Title Bar Buttons */
.cpt-icon-btn {
  width: 16px;
  height: 14px;
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
}

.cpt-icon-btn:hover {
  background: var(--win98-silver);
}

.cpt-icon-btn:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

.cpt-icon-btn svg {
  width: 10px;
  height: 10px;
}

.cpt-export-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  font-size: 11px;
  font-weight: normal;
  cursor: pointer;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
}

.cpt-export-btn:hover {
  background: #d4d4d4;
  transform: none;
}

.cpt-export-btn:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
  padding: 4px 11px 2px 13px;
}

.cpt-export-btn svg {
  width: 12px;
  height: 12px;
}

/* ========================================
   METRICS STRIP - Windows 98 Status Bars
   ======================================== */
.cpt-metrics {
  display: grid;
  grid-template-columns: 2fr repeat(4, 1fr);
  gap: 2px;
  padding: 8px;
  background: var(--win98-silver);
}

.cpt-metric {
  background: var(--win98-white);
  border: none;
  border-radius: 0;
  padding: 8px 12px;
  position: relative;
  overflow: hidden;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080;
}

.cpt-metric-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--win98-white);
  border-color: transparent;
}

.cpt-metric-label {
  display: block;
  font-size: 11px;
  font-weight: bold;
  color: var(--win98-black);
  text-transform: none;
  letter-spacing: 0;
  margin-bottom: 4px;
}

.cpt-metric-value {
  display: block;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 0;
  color: var(--win98-navy);
  font-family: var(--font-mono);
}

.cpt-metric-hero .cpt-metric-value {
  font-size: 20px;
  background: none;
  -webkit-background-clip: unset;
  -webkit-text-fill-color: var(--win98-navy);
}

.cpt-metric-success { color: #008000 !important; }
.cpt-metric-warning { color: #808000 !important; }

.cpt-metric-sub {
  display: block;
  font-size: 10px;
  color: var(--win98-dark-gray);
  margin-top: 2px;
}

.cpt-metric-trend {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: normal;
  margin-top: 4px;
}

.cpt-metric-trend.up { color: #008000; }
.cpt-metric-trend.down { color: #800000; }
.cpt-metric-trend.neutral { color: var(--win98-dark-gray); }

.cpt-metric-trend svg {
  width: 12px;
  height: 12px;
}

.cpt-metric-spark {
  width: 80px;
  height: 30px;
  flex-shrink: 0;
}

/* ========================================
   CONTENT LAYOUT
   ======================================== */
.cpt-content {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 2px;
  padding: 0 8px 8px 8px;
  background: var(--win98-silver);
}

/* ========================================
   CHART PANEL - Windows 98 Group Box
   ======================================== */
.cpt-chart-panel {
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  padding: 12px;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--win98-dark-gray);
}

.cpt-chart-header h2 {
  font-size: 11px;
  font-weight: bold;
  margin: 0;
}

.cpt-chart-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.cpt-chart-legend {
  display: flex;
  gap: 12px;
}

.cpt-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--win98-black);
}

.cpt-legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 0;
}

.cpt-legend-dot.completed { background: #000080; }
.cpt-legend-dot.cancelled { background: #808000; }

.cpt-range-tabs {
  display: flex;
  background: transparent;
  border-radius: 0;
  padding: 0;
  gap: 2px;
}

.cpt-range-tabs button {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: normal;
  color: var(--win98-black);
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  cursor: pointer;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
}

.cpt-range-tabs button:hover {
  color: var(--win98-black);
}

.cpt-range-tabs button:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

.cpt-range-tabs button.active {
  background: var(--win98-navy);
  color: white;
}

.cpt-chart-container {
  height: 240px;
  background: var(--win98-white);
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080;
  padding: 4px;
}

/* ========================================
   TRANSACTIONS PANEL - Windows 98 ListView
   ======================================== */
.cpt-transactions-panel {
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-filters-bar {
  padding: 8px;
  border-bottom: 1px solid var(--win98-dark-gray);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: var(--win98-silver);
}

.cpt-search {
  position: relative;
  flex: 1;
  min-width: 150px;
  max-width: 200px;
}

.cpt-search svg {
  display: none;
}

.cpt-search input {
  width: 100%;
  padding: 3px 6px;
  background: var(--win98-white);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  font-size: 11px;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-search input::placeholder {
  color: var(--win98-dark-gray);
}

.cpt-search input:focus {
  outline: none;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-search kbd {
  display: none;
}

.cpt-filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.cpt-status-filter {
  display: flex;
  background: transparent;
  border-radius: 0;
  padding: 0;
  gap: 2px;
}

.cpt-status-filter button {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: normal;
  color: var(--win98-black);
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  cursor: pointer;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
}

.cpt-status-filter button:hover {
  color: var(--win98-black);
}

.cpt-status-filter button:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

.cpt-status-filter button.active {
  background: var(--win98-navy);
  color: white;
}

.cpt-date-filters {
  display: flex;
  gap: 4px;
}

.cpt-date-filters input {
  padding: 2px 4px;
  background: var(--win98-white);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  font-size: 11px;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-date-filters input:focus {
  outline: none;
}

.cpt-clear-btn {
  padding: 3px 8px;
  background: var(--win98-silver);
  border: none;
  color: var(--win98-black);
  font-size: 11px;
  font-weight: normal;
  cursor: pointer;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
}

.cpt-clear-btn:hover {
  color: #800000;
}

.cpt-clear-btn:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

/* ========================================
   TABLE - Windows 98 ListView Style
   ======================================== */
.cpt-table-container {
  flex: 1;
  overflow: auto;
  background: var(--win98-white);
  margin: 0 8px 8px 8px;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
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
  padding: 4px 8px;
  text-align: left;
  font-size: 11px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
  color: var(--win98-black);
  background: var(--win98-silver);
  border-bottom: 1px solid var(--win98-dark-gray);
  border-right: 1px solid var(--win98-dark-gray);
  position: sticky;
  top: 0;
  z-index: 1;
  box-shadow:
    inset -1px -1px 0 #808080,
    inset 1px 1px 0 #ffffff;
}

.cpt-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.cpt-table th.sortable:hover {
  background: #d4d4d4;
}

.cpt-table th.sorted {
  color: var(--win98-navy);
}

.cpt-table th svg {
  width: 10px;
  height: 10px;
  margin-left: 2px;
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
  padding: 3px 8px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 11px;
  color: var(--win98-black);
}

.cpt-table tbody tr {
  cursor: pointer;
  transition: none;
}

.cpt-table tbody tr:hover {
  background: var(--win98-navy);
  color: white;
}

.cpt-table tbody tr:hover td {
  color: white;
}

.cpt-table tbody tr:hover .cpt-status,
.cpt-table tbody tr:hover .cpt-flag,
.cpt-table tbody tr:hover .cpt-site,
.cpt-table tbody tr:hover .cpt-cell-date .time,
.cpt-table tbody tr:hover .cpt-cell-customer .email {
  color: white;
}

.cpt-table tbody tr.flagged {
  background: #ffe0e0;
}

.cpt-table tbody tr.flagged:hover {
  background: var(--win98-navy);
}

.cpt-cell-date span {
  display: block;
}

.cpt-cell-date .time {
  font-size: 10px;
  color: var(--win98-dark-gray);
  margin-top: 1px;
}

.cpt-cell-customer .name {
  display: block;
  font-weight: normal;
}

.cpt-cell-customer .email {
  display: block;
  font-size: 10px;
  color: var(--win98-dark-gray);
  margin-top: 1px;
}

.cpt-amount {
  font-family: var(--font-mono);
  font-weight: bold;
  color: var(--win98-black);
}

.cpt-cell-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cpt-status {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: bold;
  border-radius: 0;
  border: 1px solid;
}

.cpt-status.complete {
  background: #c0ffc0;
  color: #006400;
  border-color: #006400;
}

.cpt-status.incomplete {
  background: #ffffc0;
  color: #808000;
  border-color: #808000;
}

.cpt-flag {
  padding: 1px 4px;
  font-size: 9px;
  font-weight: bold;
  text-transform: uppercase;
  border-radius: 0;
  border: 1px solid;
}

.cpt-flag.refund {
  background: #c0c0ff;
  color: #000080;
  border-color: #000080;
}

.cpt-flag.chargeback {
  background: #ffc0c0;
  color: #800000;
  border-color: #800000;
}

.cpt-site {
  font-size: 11px;
  color: var(--win98-dark-gray);
}

/* Loading & Empty */
.cpt-loading,
.cpt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--win98-black);
  background: var(--win98-white);
}

.cpt-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--win98-silver);
  border-top-color: var(--win98-navy);
  border-radius: 0;
  animation: spin98 0.5s steps(8) infinite;
  margin-bottom: 8px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes spin98 { to { transform: rotate(360deg); } }

.cpt-empty svg {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
  opacity: 0.5;
}

/* ========================================
   PAGINATION - Windows 98 Style
   ======================================== */
.cpt-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-top: 1px solid var(--win98-dark-gray);
  background: var(--win98-silver);
}

.cpt-pagination-info {
  font-size: 11px;
  color: var(--win98-black);
}

.cpt-pagination-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cpt-pagination-controls button {
  min-width: 24px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  font-size: 11px;
  font-weight: normal;
  cursor: pointer;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
}

.cpt-pagination-controls button:hover:not(:disabled) {
  background: #d4d4d4;
}

.cpt-pagination-controls button:active:not(:disabled) {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

.cpt-pagination-controls button.active {
  background: var(--win98-navy);
  color: white;
}

.cpt-pagination-controls button:disabled {
  color: var(--win98-dark-gray);
  cursor: not-allowed;
}

.cpt-pagination-controls button svg {
  width: 10px;
  height: 10px;
}

.cpt-pagination-controls .ellipsis {
  padding: 0 4px;
  color: var(--win98-black);
}

/* ========================================
   DROPDOWNS - Windows 98 ComboBox
   ======================================== */
.cpt-site-select,
.cpt-tz-select {
  --color-border: #808080;
  --color-white: #ffffff;
  --color-text: #000000;
  --color-text-tertiary: #808080;
  --color-primary: #000080;
  --color-card: #ffffff;
  --color-bg: #000080;
  --radius: 0;
  --shadow-md: 2px 2px 0 #000000;
}

.cpt-site-select { min-width: 120px; }
.cpt-tz-select { min-width: 100px; }

.cpt-site-select :deep(.dropdown-toggle),
.cpt-tz-select :deep(.dropdown-toggle) {
  background: var(--win98-white);
  border: none;
  border-radius: 0;
  padding: 2px 20px 2px 4px;
  font-size: 11px;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080,
    inset -2px -2px 0 #dfdfdf,
    inset 2px 2px 0 #404040;
}

.cpt-site-select :deep(.dropdown-toggle:hover),
.cpt-tz-select :deep(.dropdown-toggle:hover) {
  border-color: transparent;
}

.cpt-site-select :deep(.dropdown-menu),
.cpt-tz-select :deep(.dropdown-menu) {
  background: var(--win98-white);
  border: 1px solid var(--win98-black);
  border-radius: 0;
  box-shadow: 2px 2px 0 #000000;
}

/* ========================================
   MODAL - Windows 98 Dialog Box
   ======================================== */
.cpt-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.cpt-modal {
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #dfdfdf,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #ffffff,
    4px 4px 0 rgba(0, 0, 0, 0.3);
  position: relative;
}

.cpt-modal-close {
  position: absolute;
  top: 3px;
  right: 4px;
  width: 16px;
  height: 14px;
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
  z-index: 1;
}

.cpt-modal-close:hover {
  background: #d4d4d4;
}

.cpt-modal-close:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

.cpt-modal-close svg {
  width: 10px;
  height: 10px;
}

.cpt-modal-header {
  padding: 3px 4px;
  background: linear-gradient(90deg, #000080 0%, #1084d0 100%);
  text-align: left;
  border-bottom: none;
  color: white;
}

.cpt-modal-status {
  display: inline-flex;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
  border-radius: 0;
  margin-bottom: 8px;
  border: 1px solid;
}

.cpt-modal-status.complete {
  background: #c0ffc0;
  color: #006400;
  border-color: #006400;
}

.cpt-modal-status.incomplete {
  background: #ffffc0;
  color: #808000;
  border-color: #808000;
}

.cpt-modal-amount-wrap {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-bottom: 4px;
  padding: 12px;
  background: var(--win98-white);
  margin: 8px;
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080;
}

.cpt-modal-amount {
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 0;
  color: var(--win98-navy);
  font-family: var(--font-mono);
}

.cpt-modal-currency {
  font-size: 12px;
  font-weight: bold;
  color: var(--win98-dark-gray);
}

.cpt-modal-datetime {
  font-size: 11px;
  color: var(--win98-black);
  text-align: center;
  margin-top: 4px;
}

.cpt-modal-body {
  padding: 8px;
  overflow-y: auto;
  max-height: calc(90vh - 180px);
}

.cpt-modal-section {
  margin-bottom: 12px;
  padding: 8px;
  background: var(--win98-silver);
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080;
}

.cpt-modal-section:last-child {
  margin-bottom: 0;
}

.cpt-modal-section h3 {
  font-size: 11px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
  color: var(--win98-black);
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--win98-dark-gray);
}

.cpt-modal-field {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 3px 0;
}

.cpt-modal-field.full {
  flex-direction: column;
  gap: 2px;
}

.cpt-modal-field label {
  font-size: 11px;
  font-weight: bold;
  color: var(--win98-black);
}

.cpt-modal-field span {
  font-size: 11px;
  color: var(--win98-black);
  text-align: right;
}

.cpt-modal-field.full span {
  text-align: left;
  word-break: break-all;
}

.cpt-modal-field span.mono {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--win98-white);
  padding: 2px 4px;
  border-radius: 0;
  color: var(--win98-black);
  box-shadow:
    inset -1px -1px 0 #ffffff,
    inset 1px 1px 0 #808080;
}

.cpt-modal-field span.small {
  font-size: 10px;
}

.cpt-modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px;
}

.cpt-modal-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--win98-silver);
  border: none;
  border-radius: 0;
  color: var(--win98-black);
  font-size: 11px;
  font-weight: normal;
  cursor: pointer;
  box-shadow:
    inset -1px -1px 0 #0a0a0a,
    inset 1px 1px 0 #ffffff,
    inset -2px -2px 0 #808080,
    inset 2px 2px 0 #dfdfdf;
  transition: none;
  font-family: "MS Sans Serif", Tahoma, Arial, sans-serif;
}

.cpt-modal-actions button svg {
  width: 12px;
  height: 12px;
}

.cpt-modal-actions button:hover {
  background: #d4d4d4;
}

.cpt-modal-actions button:active {
  box-shadow:
    inset 1px 1px 0 #0a0a0a,
    inset -1px -1px 0 #ffffff,
    inset 2px 2px 0 #808080,
    inset -2px -2px 0 #dfdfdf;
}

.cpt-modal-actions button:first-child:hover,
.cpt-modal-actions button:first-child.active {
  background: #c0c0ff;
}

.cpt-modal-actions button:last-child:hover,
.cpt-modal-actions button:last-child.active {
  background: #ffc0c0;
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .cpt-modal,
.modal-leave-to .cpt-modal {
  transform: scale(0.98);
}

/* ========================================
   RESPONSIVE - Windows 98 doesn't really resize, but we'll adapt
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
    margin: 4px;
  }

  .cpt-topbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
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
  }

  .cpt-pagination {
    flex-direction: column;
    gap: 8px;
  }

  .cpt-modal-actions {
    grid-template-columns: 1fr;
  }
}

/* ========================================
   WINDOWS 98 DOESN'T HAVE DARK MODE!
   (keeping styles same for both modes)
   ======================================== */
@media (prefers-color-scheme: light) {
  /* Windows 98 looks the same in any mode */
}

@media (prefers-color-scheme: dark) {
  /* Windows 98 looks the same in any mode */
}
</style>
