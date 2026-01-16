<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import DataTable from '@/components/DataTable.vue'
import Modal from '@/components/Modal.vue'
import AlertMessage from '@/components/AlertMessage.vue'

const { supabase } = useSupabase()
const { success: showSuccess, error: showError } = useAlerts()

const loading = ref(false)
const searchQuery = ref('')
const refunds = ref([])
const accounts = ref([])
const showRefundModal = ref(false)
const refundLoading = ref(false)

// Refund form
const refundForm = ref({
  chargeId: '',
  amount: '',
  reason: 'requested_by_customer'
})

// Account mapping
const accountMap = computed(() => {
  const map = {}
  accounts.value.forEach(acc => {
    map[acc.account_id] = acc.account_name || acc.account_id
  })
  return map
})

const columns = [
  { key: 'refund_id', label: 'Refund ID', sortable: true },
  { key: 'charge_id', label: 'Charge ID', sortable: true },
  { key: 'account', label: 'Account', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'reason', label: 'Reason', sortable: true },
  { key: 'date', label: 'Date', sortable: true }
]

const filteredRefunds = computed(() => {
  if (!searchQuery.value) return refunds.value

  const query = searchQuery.value.toLowerCase()
  return refunds.value.filter(r =>
    r.refund_id?.toLowerCase().includes(query) ||
    r.charge_id?.toLowerCase().includes(query) ||
    r.account?.toLowerCase().includes(query)
  )
})

const tableData = computed(() => {
  return filteredRefunds.value.map(r => ({
    refund_id: r.stripe_refund_id?.substring(0, 15) || r.id?.substring(0, 15),
    charge_id: r.stripe_charge_id?.substring(0, 15) || 'N/A',
    account: accountMap.value[r.account_id] || r.account_id || 'Unknown',
    amount: formatCurrency((r.amount || 0) / 100),
    status: r.status || 'Unknown',
    reason: formatReason(r.reason),
    date: formatDate(r.created_at)
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

function formatReason(reason) {
  if (!reason) return 'N/A'
  return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

async function loadAccounts() {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('account_id, account_name, payment_provider')
      .eq('is_active', true)

    if (error) throw error
    accounts.value = data || []
  } catch (err) {
    console.error('Error loading accounts:', err)
  }
}

async function loadRefunds() {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('stripe_refunds')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error
    refunds.value = data || []
  } catch (err) {
    console.error('Error loading refunds:', err)
    showError('Error loading refunds. Please try again.')
  } finally {
    loading.value = false
  }
}

async function processRefund() {
  if (!refundForm.value.chargeId) {
    showError('Please enter a charge ID')
    return
  }

  refundLoading.value = true
  try {
    // Call Supabase edge function for refund processing
    const { data, error } = await supabase.functions.invoke('stripe-refund-lookup', {
      body: {
        charge_id: refundForm.value.chargeId,
        amount: refundForm.value.amount ? parseInt(refundForm.value.amount) * 100 : null,
        reason: refundForm.value.reason
      }
    })

    if (error) throw error

    showSuccess('Refund processed successfully')
    showRefundModal.value = false
    refundForm.value = { chargeId: '', amount: '', reason: 'requested_by_customer' }
    loadRefunds()
  } catch (err) {
    console.error('Error processing refund:', err)
    showError(err.message || 'Error processing refund')
  } finally {
    refundLoading.value = false
  }
}

onMounted(() => {
  loadAccounts()
  loadRefunds()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Refunds</h1>
          <p class="page-subtitle">View and process refunds</p>
        </div>
        <button class="btn btn-primary" @click="showRefundModal = true">
          Process Refund
        </button>
      </div>

      <!-- Search -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Search Refunds</label>
            <input
              type="text"
              class="form-input"
              v-model="searchQuery"
              placeholder="Search by refund ID, charge ID, or account..."
            >
          </div>
        </div>
      </div>

      <!-- Refunds Table -->
      <DataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        empty-message="No refunds found"
      >
        <template #cell-status="{ value }">
          <span
            class="badge"
            :class="{
              'badge-success': value === 'succeeded',
              'badge-warning': value === 'pending',
              'badge-error': value === 'failed'
            }"
          >
            {{ value }}
          </span>
        </template>
      </DataTable>

      <!-- Refund Modal -->
      <Modal v-model="showRefundModal" title="Process Refund">
        <form @submit.prevent="processRefund">
          <div class="form-group">
            <label class="form-label">Charge ID *</label>
            <input
              type="text"
              class="form-input"
              v-model="refundForm.chargeId"
              placeholder="ch_..."
              required
            >
          </div>

          <div class="form-group">
            <label class="form-label">Amount (optional)</label>
            <input
              type="number"
              class="form-input"
              v-model="refundForm.amount"
              placeholder="Leave blank for full refund"
              step="0.01"
            >
            <p class="form-hint">Leave blank for full refund</p>
          </div>

          <div class="form-group">
            <label class="form-label">Reason</label>
            <select class="form-select" v-model="refundForm.reason">
              <option value="requested_by_customer">Requested by Customer</option>
              <option value="duplicate">Duplicate</option>
              <option value="fraudulent">Fraudulent</option>
            </select>
          </div>
        </form>

        <template #footer>
          <button class="btn btn-secondary" @click="showRefundModal = false">Cancel</button>
          <button class="btn btn-primary" @click="processRefund" :disabled="refundLoading">
            <span v-if="refundLoading" class="loading-spinner"></span>
            {{ refundLoading ? 'Processing...' : 'Process Refund' }}
          </button>
        </template>
      </Modal>
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

.mb-4 {
  margin-bottom: 16px;
}

.form-select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-white);
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
