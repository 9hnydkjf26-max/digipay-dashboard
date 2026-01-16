<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import StatsGrid from '@/components/StatsGrid.vue'
import DataTable from '@/components/DataTable.vue'
import CustomDropdown from '@/components/CustomDropdown.vue'

const { supabase } = useSupabase()
const { error: showError } = useAlerts()

const loading = ref(false)
const dateRange = ref('30')
const siteFilter = ref('')
const statusFilter = ref('')
const transactions = ref([])
const sites = ref([])

// Date options
const dateOptions = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' }
]

// Status options
const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'pending', label: 'Pending' }
]

// Site options
const siteOptions = computed(() => {
  return [
    { value: '', label: 'All Sites' },
    ...sites.value.map(s => ({ value: s.site_id, label: s.site_name || s.site_id }))
  ]
})

// Stats
const stats = computed(() => {
  const total = transactions.value.length
  const approved = transactions.value.filter(t => t.status === 'approved').length
  const declined = transactions.value.filter(t => t.status === 'declined').length
  const volume = transactions.value
    .filter(t => t.status === 'approved')
    .reduce((sum, t) => sum + parseFloat(t.cust_amount || 0), 0)

  return [
    { label: 'Total Transactions', value: total.toLocaleString() },
    { label: 'Approved', value: approved.toLocaleString(), positive: true },
    { label: 'Declined', value: declined.toLocaleString(), positive: false },
    { label: 'Volume', value: formatCurrency(volume) }
  ]
})

// Table columns
const columns = [
  { key: 'transaction_date', label: 'Date', sortable: true },
  { key: 'site_name', label: 'Site', sortable: true },
  { key: 'cust_name', label: 'Customer', sortable: true },
  { key: 'cust_amount', label: 'Amount', sortable: true },
  { key: 'currency', label: 'Currency', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'trans_type', label: 'Type', sortable: true }
]

// Table data
const tableData = computed(() => {
  return transactions.value.map(t => ({
    id: t.id,
    transaction_date: formatDate(t.transaction_date),
    site_name: t.site_name || 'Unknown',
    cust_name: t.cust_name || 'N/A',
    cust_amount: formatCurrency(parseFloat(t.cust_amount || 0)),
    currency: t.currency || 'CAD',
    status: t.status || 'Unknown',
    trans_type: t.trans_type || 'N/A'
  }))
})

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
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getDateRange() {
  const now = new Date()
  if (dateRange.value === 'all') return null

  const days = parseInt(dateRange.value)
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return startDate.toISOString()
}

async function loadSites() {
  try {
    const { data, error } = await supabase
      .from('cpt_site_accounts')
      .select('site_id, site_name')
      .order('site_name')

    if (error) throw error
    sites.value = data || []
  } catch (err) {
    console.error('Error loading sites:', err)
  }
}

async function loadTransactions() {
  loading.value = true
  try {
    let query = supabase
      .from('cpt_data')
      .select('*')
      .order('transaction_date', { ascending: false })
      .limit(1000)

    const startDate = getDateRange()
    if (startDate) {
      query = query.gte('transaction_date', startDate)
    }

    if (siteFilter.value) {
      query = query.eq('site_id', siteFilter.value)
    }

    if (statusFilter.value) {
      query = query.eq('status', statusFilter.value)
    }

    const { data, error } = await query

    if (error) throw error
    transactions.value = data || []
  } catch (err) {
    console.error('Error loading transactions:', err)
    showError('Error loading CPT data')
  } finally {
    loading.value = false
  }
}

// Watch filters
watch([dateRange, siteFilter, statusFilter], () => {
  loadTransactions()
})

onMounted(() => {
  loadSites()
  loadTransactions()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <h1 class="page-title">CPT Reports</h1>
      <p class="page-subtitle">Payment processing transaction data</p>

      <!-- Filters -->
      <div class="card">
        <div class="card-body">
          <div class="filters-grid">
            <div class="form-group">
              <label class="form-label">Date Range</label>
              <CustomDropdown v-model="dateRange" :options="dateOptions" />
            </div>

            <div class="form-group">
              <label class="form-label">Site</label>
              <CustomDropdown v-model="siteFilter" :options="siteOptions" />
            </div>

            <div class="form-group">
              <label class="form-label">Status</label>
              <CustomDropdown v-model="statusFilter" :options="statusOptions" />
            </div>
          </div>
        </div>
      </div>

      <StatsGrid :stats="stats" :loading="loading" />

      <DataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        empty-message="No transactions found"
      >
        <template #cell-status="{ value }">
          <span
            class="badge"
            :class="{
              'badge-success': value === 'approved',
              'badge-error': value === 'declined',
              'badge-warning': value === 'pending'
            }"
          >
            {{ value }}
          </span>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 40px 24px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
