<script setup>
import { ref, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import StatsGrid from '@/components/StatsGrid.vue'

const { supabase } = useSupabase()
const { error: showError } = useAlerts()

const loading = ref(false)
const stripeBalances = ref([])
const airwallexBalances = ref([])

const stripeStats = ref([
  { label: 'Available Balance', value: '-' },
  { label: 'Pending Balance', value: '-' },
  { label: 'Total Balance', value: '-' }
])

const airwallexStats = ref([
  { label: 'Available Balance', value: '-' },
  { label: 'Pending Balance', value: '-' },
  { label: 'Total Balance', value: '-' }
])

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount / 100)
}

async function loadStripeBalances() {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-balance-check', {
      body: {}
    })

    if (error) throw error

    if (data?.balances) {
      stripeBalances.value = data.balances

      // Calculate totals
      let available = 0
      let pending = 0

      data.balances.forEach(bal => {
        if (bal.available) available += bal.available
        if (bal.pending) pending += bal.pending
      })

      stripeStats.value = [
        { label: 'Available Balance', value: formatCurrency(available) },
        { label: 'Pending Balance', value: formatCurrency(pending) },
        { label: 'Total Balance', value: formatCurrency(available + pending) }
      ]
    }
  } catch (err) {
    console.error('Error loading Stripe balances:', err)
  }
}

async function loadAirwallexBalances() {
  try {
    const { data, error } = await supabase.functions.invoke('airwallex-balance-checker', {
      body: {}
    })

    if (error) throw error

    if (data?.balances) {
      airwallexBalances.value = data.balances

      let available = 0
      let pending = 0

      data.balances.forEach(bal => {
        if (bal.available_amount) available += bal.available_amount * 100
        if (bal.pending_amount) pending += bal.pending_amount * 100
      })

      airwallexStats.value = [
        { label: 'Available Balance', value: formatCurrency(available) },
        { label: 'Pending Balance', value: formatCurrency(pending) },
        { label: 'Total Balance', value: formatCurrency(available + pending) }
      ]
    }
  } catch (err) {
    console.error('Error loading Airwallex balances:', err)
  }
}

async function refreshBalances() {
  loading.value = true
  try {
    await Promise.all([
      loadStripeBalances(),
      loadAirwallexBalances()
    ])
  } catch (err) {
    showError('Error refreshing balances')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshBalances()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Balances</h1>
          <p class="page-subtitle">Real-time balance information across payment providers</p>
        </div>
        <button class="btn btn-primary" @click="refreshBalances" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? 'Refreshing...' : 'Refresh Balances' }}
        </button>
      </div>

      <!-- Stripe Section -->
      <section class="balance-section">
        <h2 class="section-title">Stripe Balances</h2>
        <StatsGrid :stats="stripeStats" :columns="3" :loading="loading" />

        <div v-if="stripeBalances.length > 0" class="card">
          <div class="card-body">
            <h3 class="card-title">Balance by Account</h3>
            <div class="balance-list">
              <div v-for="balance in stripeBalances" :key="balance.account_id" class="balance-item">
                <div class="balance-account">{{ balance.account_name || balance.account_id }}</div>
                <div class="balance-amounts">
                  <span class="balance-available">{{ formatCurrency(balance.available || 0) }} available</span>
                  <span class="balance-pending">{{ formatCurrency(balance.pending || 0) }} pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Airwallex Section -->
      <section class="balance-section">
        <h2 class="section-title">Airwallex Balances</h2>
        <StatsGrid :stats="airwallexStats" :columns="3" :loading="loading" />

        <div v-if="airwallexBalances.length > 0" class="card">
          <div class="card-body">
            <h3 class="card-title">Balance by Currency</h3>
            <div class="balance-list">
              <div v-for="balance in airwallexBalances" :key="balance.currency" class="balance-item">
                <div class="balance-account">{{ balance.currency }}</div>
                <div class="balance-amounts">
                  <span class="balance-available">{{ formatCurrency((balance.available_amount || 0) * 100, balance.currency) }} available</span>
                  <span class="balance-pending">{{ formatCurrency((balance.pending_amount || 0) * 100, balance.currency) }} pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
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

.balance-section {
  margin-bottom: 40px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--color-text);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.balance-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.balance-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.balance-item:last-child {
  border-bottom: none;
}

.balance-account {
  font-weight: 500;
  color: var(--color-text);
}

.balance-amounts {
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.balance-available {
  color: var(--color-success);
}

.balance-pending {
  color: var(--color-text-tertiary);
}

@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .balance-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
