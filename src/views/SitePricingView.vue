<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import DataTable from '@/components/DataTable.vue'

const { supabase } = useSupabase()
const { error: showError } = useAlerts()

const loading = ref(false)
const sites = ref([])
const searchQuery = ref('')

// Table columns
const columns = [
  { key: 'site_name', label: 'Site', sortable: true },
  { key: 'monthly_limit', label: 'Monthly Limit', sortable: true },
  { key: 'processing_fee', label: 'Processing Fee', sortable: true },
  { key: 'setup_fee', label: 'Setup Fee', sortable: true },
  { key: 'status', label: 'Status', sortable: true }
]

// Filtered sites
const filteredSites = computed(() => {
  if (!searchQuery.value) return sites.value

  const query = searchQuery.value.toLowerCase()
  return sites.value.filter(s =>
    s.site_name?.toLowerCase().includes(query) ||
    s.site_id?.toLowerCase().includes(query)
  )
})

// Table data
const tableData = computed(() => {
  return filteredSites.value.map(s => ({
    site_id: s.site_id,
    site_name: s.site_name || s.site_id,
    monthly_limit: formatCurrency(s.monthly_limit || 0),
    processing_fee: s.processing_fee ? `${s.processing_fee}%` : '2.9%',
    setup_fee: formatCurrency(s.setup_fee || 0),
    status: s.is_active ? 'Active' : 'Inactive'
  }))
})

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(amount)
}

async function loadSites() {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('cpt_site_accounts')
      .select('*')
      .order('site_name')

    if (error) throw error
    sites.value = data || []
  } catch (err) {
    console.error('Error loading sites:', err)
    showError('Error loading pricing data')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSites()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <h1 class="page-title">Site Pricing</h1>
      <p class="page-subtitle">View pricing and limits for all sites</p>

      <!-- Search -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Search Sites</label>
            <input
              type="text"
              class="form-input"
              v-model="searchQuery"
              placeholder="Search by site name or ID..."
            >
          </div>
        </div>
      </div>

      <!-- Pricing Info -->
      <div class="pricing-info">
        <div class="pricing-card">
          <h3>Standard Processing</h3>
          <div class="pricing-value">2.9% + $0.30</div>
          <p class="pricing-description">Per successful transaction</p>
        </div>

        <div class="pricing-card">
          <h3>International Cards</h3>
          <div class="pricing-value">+1.5%</div>
          <p class="pricing-description">Additional fee for international cards</p>
        </div>

        <div class="pricing-card">
          <h3>Refund Fee</h3>
          <div class="pricing-value">$0.00</div>
          <p class="pricing-description">No fee for refunds</p>
        </div>

        <div class="pricing-card">
          <h3>Chargeback Fee</h3>
          <div class="pricing-value">$15.00</div>
          <p class="pricing-description">Per chargeback dispute</p>
        </div>
      </div>

      <!-- Sites Table -->
      <h2 class="section-title">Site Configurations</h2>
      <DataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        empty-message="No sites found"
      >
        <template #cell-status="{ value }">
          <span class="badge" :class="value === 'Active' ? 'badge-success' : 'badge-neutral'">
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

.mb-4 {
  margin-bottom: 16px;
}

.pricing-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.pricing-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 24px;
  text-align: center;
}

.pricing-card h3 {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.pricing-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
}

.pricing-description {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--color-text);
}

@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .pricing-info {
    grid-template-columns: repeat(2, 1fr);
  }

  .pricing-value {
    font-size: 24px;
  }
}
</style>
