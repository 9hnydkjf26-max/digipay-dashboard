<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import StatsGrid from '@/components/StatsGrid.vue'
import CustomDropdown from '@/components/CustomDropdown.vue'
import DataTable from '@/components/DataTable.vue'

const { supabase } = useSupabase()
const { error: showError } = useAlerts()

// State
const loading = ref(false)
const activeTab = ref('overview')
const dateRange = ref('30')
const accountFilter = ref('')
const customStartDate = ref('')
const customEndDate = ref('')
const showCustomDatePicker = ref(false)

// Data
const accounts = ref([])
const charges = ref([])
const refunds = ref([])
const disputes = ref([])

// Account mapping
const accountMap = computed(() => {
  const map = {}
  accounts.value.forEach(acc => {
    map[acc.account_id] = acc.account_name || acc.account_id
  })
  return map
})

// Date range options
const dateOptions = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: '365', label: 'Last Year' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' }
]

// Account filter options
const accountOptions = computed(() => {
  return [
    { value: '', label: 'All Accounts' },
    ...accounts.value.map(acc => ({
      value: acc.account_id,
      label: `${acc.account_name || acc.account_id} [${acc.payment_provider === 'airwallex' ? 'Airwallex' : 'Stripe'}]`
    }))
  ]
})

// Overview stats
const overviewStats = computed(() => {
  const totalCharges = charges.value.length
  const successfulCharges = charges.value.filter(c => c.status === 'succeeded')
  const totalRevenue = successfulCharges.reduce((sum, c) => sum + (c.amount || 0), 0) / 100
  const totalRefunded = refunds.value.reduce((sum, r) => sum + (r.amount || 0), 0) / 100
  const refundRate = totalCharges > 0 ? ((refunds.value.length / totalCharges) * 100).toFixed(1) : 0

  return [
    { label: 'Total Charges', value: totalCharges.toLocaleString() },
    { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
    { label: 'Total Refunds', value: formatCurrency(totalRefunded) },
    { label: 'Refund Rate', value: `${refundRate}%` }
  ]
})

// Refund stats
const refundStats = computed(() => {
  const totalRefunds = refunds.value.length
  const refundAmount = refunds.value.reduce((sum, r) => sum + (r.amount || 0), 0) / 100
  const avgRefund = totalRefunds > 0 ? refundAmount / totalRefunds : 0

  return [
    { label: 'Refunds Issued', value: totalRefunds.toLocaleString() },
    { label: 'Refund Amount', value: formatCurrency(refundAmount) },
    { label: 'Avg Refund', value: formatCurrency(avgRefund) }
  ]
})

// Dispute stats
const disputeStats = computed(() => {
  const totalDisputes = disputes.value.length
  const disputeAmount = disputes.value.reduce((sum, d) => sum + (d.amount || 0), 0) / 100
  const totalVolume = charges.value.reduce((sum, c) => sum + (c.amount || 0), 0) / 100
  const disputeRate = totalVolume > 0 ? ((disputeAmount / totalVolume) * 100).toFixed(2) : 0

  return [
    { label: 'Total Disputes', value: totalDisputes.toLocaleString() },
    { label: 'Dispute Amount', value: formatCurrency(disputeAmount) },
    { label: 'Total Volume', value: formatCurrency(totalVolume) },
    { label: 'Dispute Rate', value: `${disputeRate}%` }
  ]
})

// Account breakdown table data
const accountBreakdown = computed(() => {
  const breakdown = {}

  charges.value.forEach(charge => {
    const accId = charge.account_id || 'unknown'
    if (!breakdown[accId]) {
      breakdown[accId] = {
        account: accountMap.value[accId] || accId,
        charges: 0,
        revenue: 0,
        refunds: 0
      }
    }
    breakdown[accId].charges++
    if (charge.status === 'succeeded') {
      breakdown[accId].revenue += (charge.amount || 0) / 100
    }
  })

  refunds.value.forEach(refund => {
    const accId = refund.account_id || 'unknown'
    if (breakdown[accId]) {
      breakdown[accId].refunds++
    }
  })

  return Object.values(breakdown).map(row => ({
    ...row,
    refundRate: row.charges > 0 ? `${((row.refunds / row.charges) * 100).toFixed(1)}%` : '0%',
    avgTransaction: row.charges > 0 ? formatCurrency(row.revenue / row.charges) : '$0.00',
    revenue: formatCurrency(row.revenue)
  }))
})

// Table columns
const accountColumns = [
  { key: 'account', label: 'Account', sortable: true },
  { key: 'charges', label: 'Charges', sortable: true },
  { key: 'revenue', label: 'Revenue', sortable: true },
  { key: 'refunds', label: 'Refunds', sortable: true },
  { key: 'refundRate', label: 'Refund Rate', sortable: true },
  { key: 'avgTransaction', label: 'Avg Transaction', sortable: true }
]

const refundColumns = [
  { key: 'id', label: 'Refund ID', sortable: true },
  { key: 'account', label: 'Account', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'reason', label: 'Reason', sortable: true },
  { key: 'date', label: 'Date', sortable: true }
]

const disputeColumns = [
  { key: 'id', label: 'Dispute ID', sortable: true },
  { key: 'account', label: 'Account', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'reason', label: 'Reason', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'date', label: 'Date', sortable: true }
]

// Formatted table data
const refundTableData = computed(() => {
  return refunds.value.map(r => ({
    id: r.stripe_refund_id?.substring(0, 12) || r.id?.substring(0, 12),
    account: accountMap.value[r.account_id] || r.account_id,
    amount: formatCurrency((r.amount || 0) / 100),
    reason: r.reason || 'N/A',
    date: formatDate(r.created_at)
  }))
})

const disputeTableData = computed(() => {
  return disputes.value.map(d => ({
    id: d.stripe_dispute_id?.substring(0, 12) || d.id?.substring(0, 12),
    account: accountMap.value[d.account_id] || d.account_id,
    amount: formatCurrency((d.amount || 0) / 100),
    reason: d.reason || 'N/A',
    status: d.status || 'Unknown',
    date: formatDate(d.created_at)
  }))
})

// Helper functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function getDateRange() {
  const now = new Date()
  let startDate = null

  if (dateRange.value === 'custom') {
    return {
      start: customStartDate.value,
      end: customEndDate.value
    }
  }

  if (dateRange.value !== 'all') {
    const days = parseInt(dateRange.value)
    startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  }

  return {
    start: startDate ? startDate.toISOString() : null,
    end: now.toISOString()
  }
}

// Data loading
async function loadAccounts() {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('account_id, account_name, payment_provider')
      .eq('is_active', true)
      .order('account_name')

    if (error) throw error
    accounts.value = data || []
  } catch (err) {
    console.error('Error loading accounts:', err)
  }
}

async function loadReports() {
  loading.value = true

  try {
    const { start, end } = getDateRange()

    // Load charges
    let chargesQuery = supabase
      .from('stripe_charges')
      .select('*')
      .order('created_at', { ascending: false })

    if (start) chargesQuery = chargesQuery.gte('created_at', start)
    if (end) chargesQuery = chargesQuery.lte('created_at', end)
    if (accountFilter.value) chargesQuery = chargesQuery.eq('account_id', accountFilter.value)

    const { data: chargesData, error: chargesError } = await chargesQuery
    if (chargesError) throw chargesError
    charges.value = chargesData || []

    // Load refunds
    let refundsQuery = supabase
      .from('stripe_refunds')
      .select('*')
      .order('created_at', { ascending: false })

    if (start) refundsQuery = refundsQuery.gte('created_at', start)
    if (end) refundsQuery = refundsQuery.lte('created_at', end)
    if (accountFilter.value) refundsQuery = refundsQuery.eq('account_id', accountFilter.value)

    const { data: refundsData, error: refundsError } = await refundsQuery
    if (refundsError) throw refundsError
    refunds.value = refundsData || []

    // Load disputes
    let disputesQuery = supabase
      .from('stripe_disputes')
      .select('*')
      .order('created_at', { ascending: false })

    if (start) disputesQuery = disputesQuery.gte('created_at', start)
    if (end) disputesQuery = disputesQuery.lte('created_at', end)
    if (accountFilter.value) disputesQuery = disputesQuery.eq('account_id', accountFilter.value)

    const { data: disputesData, error: disputesError } = await disputesQuery
    if (disputesError) throw disputesError
    disputes.value = disputesData || []

  } catch (err) {
    console.error('Error loading reports:', err)
    showError('Error loading reports. Please try again.')
  } finally {
    loading.value = false
  }
}

function onDateRangeChange(value) {
  dateRange.value = value
  showCustomDatePicker.value = value === 'custom'
  if (value !== 'custom') {
    loadReports()
  }
}

function applyCustomDate() {
  showCustomDatePicker.value = false
  loadReports()
}

function cancelCustomDate() {
  showCustomDatePicker.value = false
  dateRange.value = '30'
}

// Initialize dates
onMounted(() => {
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  customStartDate.value = thirtyDaysAgo
  customEndDate.value = today

  loadAccounts()
  loadReports()
})

watch(accountFilter, () => {
  loadReports()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <h1 class="page-title">Reports</h1>
      <p class="page-subtitle">Transaction analytics and insights</p>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'overview' }"
          @click="activeTab = 'overview'"
        >
          Overview
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'by-account' }"
          @click="activeTab = 'by-account'"
        >
          By Account
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'refunds' }"
          @click="activeTab = 'refunds'"
        >
          Refunds
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'disputes' }"
          @click="activeTab = 'disputes'"
        >
          Disputes
        </button>
      </div>

      <!-- Filters -->
      <div class="card">
        <div class="card-body">
          <div class="filters-grid">
            <div class="form-group">
              <label class="form-label">Date Range</label>
              <CustomDropdown
                :model-value="dateRange"
                :options="dateOptions"
                @update:model-value="onDateRangeChange"
              />

              <!-- Custom date picker -->
              <div v-if="showCustomDatePicker" class="custom-date-picker">
                <div class="date-inputs">
                  <div class="form-group">
                    <label class="form-label">Start Date</label>
                    <input type="date" class="form-input" v-model="customStartDate">
                  </div>
                  <div class="form-group">
                    <label class="form-label">End Date</label>
                    <input type="date" class="form-input" v-model="customEndDate">
                  </div>
                </div>
                <div class="date-actions">
                  <button class="btn btn-secondary btn-sm" @click="cancelCustomDate">Cancel</button>
                  <button class="btn btn-primary btn-sm" @click="applyCustomDate">Apply</button>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Account</label>
              <CustomDropdown
                v-model="accountFilter"
                :options="accountOptions"
              />
            </div>
          </div>

          <button class="btn btn-primary mt-4" @click="loadReports" :disabled="loading">
            <span v-if="loading" class="loading-spinner"></span>
            {{ loading ? 'Loading...' : 'Generate Report' }}
          </button>
        </div>
      </div>

      <!-- Overview Tab -->
      <div v-show="activeTab === 'overview'">
        <StatsGrid :stats="overviewStats" :loading="loading" />

        <div class="card">
          <div class="card-body">
            <h3 class="card-title">Transaction Summary</h3>
            <p class="text-muted mt-2">
              Showing {{ charges.length.toLocaleString() }} charges,
              {{ refunds.length.toLocaleString() }} refunds, and
              {{ disputes.length.toLocaleString() }} disputes for the selected period.
            </p>
          </div>
        </div>
      </div>

      <!-- By Account Tab -->
      <div v-show="activeTab === 'by-account'">
        <DataTable
          :columns="accountColumns"
          :data="accountBreakdown"
          :loading="loading"
          empty-message="No account data available"
        />
      </div>

      <!-- Refunds Tab -->
      <div v-show="activeTab === 'refunds'">
        <StatsGrid :stats="refundStats" :columns="3" :loading="loading" />

        <DataTable
          :columns="refundColumns"
          :data="refundTableData"
          :loading="loading"
          empty-message="No refunds found"
        />
      </div>

      <!-- Disputes Tab -->
      <div v-show="activeTab === 'disputes'">
        <StatsGrid :stats="disputeStats" :loading="loading" />

        <DataTable
          :columns="disputeColumns"
          :data="disputeTableData"
          :loading="loading"
          empty-message="No disputes found"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.custom-date-picker {
  margin-top: 12px;
  padding: 16px;
  background: var(--color-bg);
  border-radius: var(--radius);
}

.date-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.date-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.mt-4 {
  margin-top: 16px;
}

@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .filters-grid {
    grid-template-columns: 1fr;
  }

  .date-inputs {
    grid-template-columns: 1fr;
  }
}
</style>
