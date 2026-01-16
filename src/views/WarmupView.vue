<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import StatsGrid from '@/components/StatsGrid.vue'
import DataTable from '@/components/DataTable.vue'

const { supabase } = useSupabase()
const { error: showError } = useAlerts()

const loading = ref(false)
const sites = ref([])
const warmupData = ref([])

const stats = computed(() => {
  const totalSites = sites.value.length
  const activeSites = sites.value.filter(s => s.is_active).length
  const totalVolume = warmupData.value.reduce((sum, w) => sum + (w.total_volume || 0), 0)
  const avgCompletion = warmupData.value.length > 0
    ? (warmupData.value.reduce((sum, w) => sum + (w.completion_pct || 0), 0) / warmupData.value.length).toFixed(0)
    : 0

  return [
    { label: 'Total Sites', value: totalSites.toString() },
    { label: 'Active Sites', value: activeSites.toString() },
    { label: 'Total Volume', value: formatCurrency(totalVolume) },
    { label: 'Avg Completion', value: `${avgCompletion}%` }
  ]
})

const columns = [
  { key: 'site_name', label: 'Site', sortable: true },
  { key: 'monthly_limit', label: 'Monthly Limit', sortable: true },
  { key: 'current_volume', label: 'Current Volume', sortable: true },
  { key: 'completion', label: 'Completion', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'last_transaction', label: 'Last Transaction', sortable: true }
]

const tableData = computed(() => {
  return warmupData.value.map(w => ({
    site_name: w.site_name || 'Unknown',
    monthly_limit: formatCurrency(w.monthly_limit || 0),
    current_volume: formatCurrency(w.current_volume || 0),
    completion: `${w.completion_pct || 0}%`,
    completion_raw: w.completion_pct || 0,
    status: w.status || 'Active',
    last_transaction: formatDate(w.last_transaction_date)
  }))
})

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

function formatDate(dateStr) {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function loadSites() {
  try {
    const { data, error } = await supabase
      .from('cpt_site_accounts')
      .select('*')
      .order('site_name')

    if (error) throw error
    sites.value = data || []
  } catch (err) {
    console.error('Error loading sites:', err)
  }
}

async function loadWarmupData() {
  loading.value = true
  try {
    // Get current month's data
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data: transactions, error } = await supabase
      .from('cpt_data')
      .select('site_id, site_name, cust_amount, transaction_date')
      .gte('transaction_date', startOfMonth.toISOString())
      .eq('status', 'approved')

    if (error) throw error

    // Aggregate by site
    const siteVolumes = {}
    const siteLastTx = {}

    transactions?.forEach(tx => {
      const siteId = tx.site_id || 'unknown'
      if (!siteVolumes[siteId]) {
        siteVolumes[siteId] = {
          site_id: siteId,
          site_name: tx.site_name || siteId,
          total_volume: 0,
          tx_count: 0
        }
      }
      siteVolumes[siteId].total_volume += parseFloat(tx.cust_amount || 0)
      siteVolumes[siteId].tx_count++

      const txDate = new Date(tx.transaction_date)
      if (!siteLastTx[siteId] || txDate > siteLastTx[siteId]) {
        siteLastTx[siteId] = txDate
      }
    })

    // Combine with site limits
    warmupData.value = sites.value.map(site => {
      const volume = siteVolumes[site.site_id] || { total_volume: 0, tx_count: 0 }
      const limit = site.monthly_limit || 50000
      const completion = limit > 0 ? Math.min((volume.total_volume / limit) * 100, 100) : 0

      return {
        site_id: site.site_id,
        site_name: site.site_name || site.site_id,
        monthly_limit: limit,
        current_volume: volume.total_volume,
        completion_pct: Math.round(completion),
        status: completion >= 100 ? 'Limit Reached' : site.is_active ? 'Active' : 'Inactive',
        last_transaction_date: siteLastTx[site.site_id],
        total_volume: volume.total_volume
      }
    })

  } catch (err) {
    console.error('Error loading warmup data:', err)
    showError('Error loading warmup data')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadSites()
  await loadWarmupData()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Warm Up</h1>
          <p class="page-subtitle">Merchant compliance and transaction limit tracking</p>
        </div>
        <button class="btn btn-primary" @click="loadWarmupData" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? 'Refreshing...' : 'Refresh Data' }}
        </button>
      </div>

      <StatsGrid :stats="stats" :loading="loading" />

      <DataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        empty-message="No warmup data available"
      >
        <template #cell-completion="{ row }">
          <div class="progress-cell">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${row.completion_raw}%` }"
                :class="{
                  'progress-success': row.completion_raw >= 100,
                  'progress-warning': row.completion_raw >= 75 && row.completion_raw < 100,
                  'progress-info': row.completion_raw < 75
                }"
              ></div>
            </div>
            <span class="progress-text">{{ row.completion }}</span>
          </div>
        </template>

        <template #cell-status="{ value }">
          <span
            class="badge"
            :class="{
              'badge-success': value === 'Active',
              'badge-warning': value === 'Limit Reached',
              'badge-neutral': value === 'Inactive'
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
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--color-bg);
  border-radius: 4px;
  overflow: hidden;
  min-width: 80px;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-success {
  background: var(--color-success);
}

.progress-warning {
  background: var(--color-warning);
}

.progress-info {
  background: var(--color-primary);
}

.progress-text {
  font-size: 13px;
  font-weight: 500;
  min-width: 40px;
}

@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .page-header {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
