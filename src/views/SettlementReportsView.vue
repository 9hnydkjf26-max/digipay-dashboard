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
const statusFilter = ref('')
const settlements = ref([])
const activeTab = ref('overview')

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
  { value: 'settled', label: 'Settled' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' }
]

// Stats
const stats = computed(() => {
  const totalSettlements = settlements.value.length
  const settledAmount = settlements.value
    .filter(s => s.status === 'settled')
    .reduce((sum, s) => sum + (s.amount || 0), 0)
  const pendingAmount = settlements.value
    .filter(s => s.status === 'pending')
    .reduce((sum, s) => sum + (s.amount || 0), 0)
  const avgSettlement = totalSettlements > 0
    ? settledAmount / settlements.value.filter(s => s.status === 'settled').length
    : 0

  return [
    { label: 'Total Settlements', value: totalSettlements.toLocaleString() },
    { label: 'Settled Amount', value: formatCurrency(settledAmount) },
    { label: 'Pending Amount', value: formatCurrency(pendingAmount) },
    { label: 'Avg Settlement', value: formatCurrency(avgSettlement || 0) }
  ]
})

// Table columns
const columns = [
  { key: 'settlement_id', label: 'Settlement ID', sortable: true },
  { key: 'created_date', label: 'Date', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'currency', label: 'Currency', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'transaction_count', label: 'Transactions', sortable: true }
]

// Table data
const tableData = computed(() => {
  return settlements.value.map(s => ({
    settlement_id: s.id?.substring(0, 12) || 'N/A',
    created_date: formatDate(s.created_at),
    amount: formatCurrency(s.amount || 0),
    currency: s.currency || 'USD',
    status: s.status || 'Unknown',
    transaction_count: s.transaction_count || 0
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
    day: 'numeric'
  })
}

function getDateRange() {
  const now = new Date()
  if (dateRange.value === 'all') return null

  const days = parseInt(dateRange.value)
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return startDate.toISOString()
}

async function loadSettlements() {
  loading.value = true
  try {
    // Note: This assumes a settlements table exists
    // Adjust the table name and columns based on actual schema
    let query = supabase
      .from('settlement_reports')
      .select('*')
      .order('created_at', { ascending: false })

    const startDate = getDateRange()
    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (statusFilter.value) {
      query = query.eq('status', statusFilter.value)
    }

    const { data, error } = await query

    if (error) {
      // If table doesn't exist, use mock data or empty array
      console.warn('Settlement table may not exist:', error)
      settlements.value = []
      return
    }

    settlements.value = data || []
  } catch (err) {
    console.error('Error loading settlements:', err)
    settlements.value = []
  } finally {
    loading.value = false
  }
}

// Watch filters
watch([dateRange, statusFilter], () => {
  loadSettlements()
})

onMounted(() => {
  loadSettlements()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <h1 class="page-title">Settlement Reports</h1>
      <p class="page-subtitle">View and manage settlement data</p>

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
          :class="{ active: activeTab === 'details' }"
          @click="activeTab = 'details'"
        >
          Settlement Details
        </button>
      </div>

      <!-- Filters -->
      <div class="card">
        <div class="card-body">
          <div class="filters-grid">
            <div class="form-group">
              <label class="form-label">Date Range</label>
              <CustomDropdown v-model="dateRange" :options="dateOptions" />
            </div>

            <div class="form-group">
              <label class="form-label">Status</label>
              <CustomDropdown v-model="statusFilter" :options="statusOptions" />
            </div>
          </div>
        </div>
      </div>

      <!-- Overview Tab -->
      <div v-show="activeTab === 'overview'">
        <StatsGrid :stats="stats" :loading="loading" />

        <div class="card">
          <div class="card-body">
            <h3 class="card-title">Settlement Summary</h3>
            <p v-if="settlements.length === 0" class="text-muted">
              No settlements found for the selected period.
            </p>
            <p v-else class="text-muted">
              Showing {{ settlements.length }} settlements for the selected period.
            </p>
          </div>
        </div>
      </div>

      <!-- Details Tab -->
      <div v-show="activeTab === 'details'">
        <DataTable
          :columns="columns"
          :data="tableData"
          :loading="loading"
          empty-message="No settlements found"
        >
          <template #cell-status="{ value }">
            <span
              class="badge"
              :class="{
                'badge-success': value === 'settled',
                'badge-warning': value === 'pending',
                'badge-error': value === 'failed'
              }"
            >
              {{ value }}
            </span>
          </template>
        </DataTable>
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
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
