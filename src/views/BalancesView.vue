<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAlerts } from '@/composables/useAlerts'
import { useFormatting } from '@/composables/useFormatting'
import CustomDropdown from '@/components/CustomDropdown.vue'

const { supabase } = useSupabase()
const { error: showError } = useAlerts()
const { formatCurrency } = useFormatting()

// State
const loading = ref(false)
const loadingTransactions = ref(false)
const loadingAccounts = ref(true)
const selectedAccountId = ref('')
const accounts = ref([])
const balanceData = ref(null)
const transactions = ref([])
const hasMoreTransactions = ref(false)
const currentPage = ref(0)
const pageSize = 25

// Account dropdown options (grouped by provider)
const accountOptions = computed(() => {
  const airwallexAccounts = accounts.value.filter(a => a.payment_provider === 'airwallex')
  const stripeAccounts = accounts.value.filter(a => a.payment_provider === 'stripe')

  const options = [{ value: '', label: 'Select an account...' }]

  if (airwallexAccounts.length > 0) {
    options.push({ value: '', label: '── Airwallex ──', disabled: true })
    airwallexAccounts.forEach(acc => {
      options.push({
        value: acc.account_id,
        label: acc.account_name || acc.account_id
      })
    })
  }

  if (stripeAccounts.length > 0) {
    options.push({ value: '', label: '── Stripe ──', disabled: true })
    stripeAccounts.forEach(acc => {
      options.push({
        value: acc.account_id,
        label: acc.account_name || acc.account_id
      })
    })
  }

  return options
})

// Selected account info
const selectedAccount = computed(() => {
  if (!selectedAccountId.value) return null
  return accounts.value.find(a => a.account_id === selectedAccountId.value)
})

// Stats for the metrics strip
const stats = computed(() => {
  if (!balanceData.value) {
    return {
      available: '-',
      pending: '-',
      total: '-',
      txnCount: transactions.value.length
    }
  }

  const primaryCurrency = balanceData.value.primary_currency || 'CAD'
  const available = balanceData.value.available_balance || 0
  const pending = balanceData.value.pending_balance || 0
  const total = balanceData.value.total_balance || 0

  return {
    available: formatCurrency(available, primaryCurrency),
    pending: formatCurrency(pending, primaryCurrency),
    total: formatCurrency(total, primaryCurrency),
    txnCount: transactions.value.length
  }
})

// Non-zero currency balances
const currencyBalances = computed(() => {
  if (!balanceData.value?.balances_by_currency) return []
  return balanceData.value.balances_by_currency
    .filter(b => b.total > 0 || b.available > 0 || b.pending > 0)
    .sort((a, b) => b.total - a.total)
})

// Load all payment accounts (Airwallex + Stripe)
async function loadAccounts() {
  loadingAccounts.value = true
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('account_id, account_name, payment_provider, is_active')
      .in('payment_provider', ['airwallex', 'stripe'])
      .eq('is_active', true)
      .order('payment_provider')
      .order('account_name')

    if (error) throw error
    accounts.value = data || []
  } catch (err) {
    console.error('Error loading accounts:', err)
    showError('Failed to load accounts')
  } finally {
    loadingAccounts.value = false
  }
}

// Fetch balance for selected account
async function fetchBalance() {
  if (!selectedAccountId.value || !selectedAccount.value) {
    balanceData.value = null
    return
  }

  loading.value = true

  try {
    const provider = selectedAccount.value.payment_provider
    const functionName = provider === 'stripe' ? 'stripe-balance-checker' : 'airwallex-balance-checker'

    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { account_id: selectedAccountId.value }
    })

    if (error) throw error

    if (data?.balances?.length > 0) {
      balanceData.value = data.balances[0]
    } else if (data?.errors?.length > 0) {
      throw new Error(data.errors[0].error)
    }
  } catch (err) {
    console.error('Error fetching balance:', err)
    showError('Failed to fetch balance: ' + err.message)
  } finally {
    loading.value = false
  }
}

// Fetch transactions for selected account
async function fetchTransactions(page = 0, append = false) {
  if (!selectedAccountId.value || !selectedAccount.value) {
    transactions.value = []
    return
  }

  const provider = selectedAccount.value.payment_provider
  loadingTransactions.value = true

  try {
    if (provider === 'stripe') {
      // Fetch Stripe transactions
      const { data, error } = await supabase.functions.invoke('stripe-recent-transactions', {
        body: {
          account_id: selectedAccountId.value,
          limit: 10
        }
      })

      if (error) throw error

      if (data?.success) {
        transactions.value = data.transactions || []
        hasMoreTransactions.value = false
      } else if (data?.error) {
        throw new Error(data.error)
      }
    } else {
      // Fetch Airwallex transactions
      const { data, error } = await supabase.functions.invoke('airwallex-wallet-transactions', {
        body: {
          account_id: selectedAccountId.value,
          page_num: page,
          page_size: pageSize
        }
      })

      if (error) throw error

      if (data?.success) {
        if (append) {
          transactions.value = [...transactions.value, ...(data.transactions || [])]
        } else {
          transactions.value = data.transactions || []
        }
        hasMoreTransactions.value = data.has_more || false
        currentPage.value = page
      } else if (data?.error) {
        throw new Error(data.error)
      }
    }
  } catch (err) {
    console.error('Error fetching transactions:', err)
    showError('Failed to fetch transactions: ' + err.message)
  } finally {
    loadingTransactions.value = false
  }
}

// Load more transactions
async function loadMoreTransactions() {
  await fetchTransactions(currentPage.value + 1, true)
}

// Refresh all data
async function refreshData() {
  if (selectedAccountId.value) {
    balanceData.value = null
    transactions.value = []
    await Promise.all([
      fetchBalance(),
      fetchTransactions(0)
    ])
  }
}

// Format transaction date
function formatTxnDate(dateStr) {
  if (!dateStr) return { date: '-', time: '' }
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return { date: '-', time: '' }
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

// Get transaction date from various possible fields
function getTxnDate(txn) {
  return txn.created_at || txn.createdAt || txn.settledAt || txn.posted_at || null
}

// Get transaction type display
function getTransactionType(txn) {
  // For Stripe, use payment_method_type or status
  if (txn.payment_method_type) {
    const methodMap = {
      'card': 'Card Payment',
      'bank_transfer': 'Bank Transfer',
      'us_bank_account': 'Bank Account',
      'sepa_debit': 'SEPA Debit',
      'ideal': 'iDEAL',
      'sofort': 'Sofort'
    }
    return methodMap[txn.payment_method_type] || txn.payment_method_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const type = txn.transactionType || txn.transaction_type || txn.type || 'unknown'
  return type.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim().replace(/\b\w/g, l => l.toUpperCase())
}

// Get transaction type badge class
function getTypeClass(txn) {
  // Check for failed transactions first
  if (txn.failure_code || txn.status === 'failed' || txn.status === 'requires_payment_method') {
    return 'failed'
  }

  // For Stripe payment intents
  if (txn.payment_method_type) {
    if (txn.status === 'succeeded') return 'credit'
    if (txn.status === 'processing' || txn.status === 'requires_action') return 'pending'
    return 'default'
  }

  const type = (txn.transactionType || txn.transaction_type || txn.type || '').toLowerCase()
  if (type.includes('deposit') || type.includes('receive') || type.includes('payment') || type.includes('settlement')) return 'credit'
  if (type.includes('withdraw') || type.includes('payout') || type.includes('transfer')) return 'debit'
  if (type.includes('conversion') || type.includes('fx')) return 'conversion'
  if (type.includes('fee')) return 'fee'
  if (type.includes('refund')) return 'refund'
  return 'default'
}

// Get transaction status class
function getStatusClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'succeeded' || s === 'success') return 'complete'
  if (s === 'pending' || s === 'processing' || s === 'requires_confirmation' || s === 'requires_action') return 'pending'
  if (s === 'failed' || s === 'cancelled' || s === 'rejected' || s === 'requires_payment_method' || s === 'canceled') return 'failed'
  return 'default'
}

// Watch for account selection changes
watch(selectedAccountId, async (newVal) => {
  if (newVal) {
    balanceData.value = null
    transactions.value = []
    currentPage.value = 0
    await Promise.all([
      fetchBalance(),
      fetchTransactions(0)
    ])
  } else {
    balanceData.value = null
    transactions.value = []
  }
})

// Lifecycle
onMounted(() => {
  loadAccounts()
})
</script>

<template>
  <div class="reports-page balances">
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
            <h1>Balances</h1>
          </div>
        </div>
        <div class="reports-topbar-right">
          <button
            v-if="selectedAccountId"
            class="reports-btn reports-btn-secondary"
            @click="refreshData"
            :disabled="loading || loadingTransactions"
          >
            <svg v-if="!loading && !loadingTransactions" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span v-else class="btn-spinner"></span>
            {{ loading || loadingTransactions ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>
      </header>

      <!-- Metrics Strip -->
      <div class="reports-stats-row">
        <div class="reports-stat-box">
          <span class="reports-stat-value" :class="{ 'reports-stat-success': balanceData }">{{ stats.available }}</span>
          <span class="reports-stat-label">Available</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ stats.pending }}</span>
          <span class="reports-stat-label">Pending</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ stats.total }}</span>
          <span class="reports-stat-label">Total Balance</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ stats.txnCount }}</span>
          <span class="reports-stat-label">Transactions</span>
        </div>
      </div>

      <!-- Account Selector -->
      <div class="balances-filters">
        <div class="filter-group">
          <label class="filter-label">Airwallex Account</label>
          <CustomDropdown
            v-model="selectedAccountId"
            :options="accountOptions"
            :disabled="loadingAccounts"
            placeholder="Select an account..."
            class="balances-account-select"
          />
        </div>
        <span v-if="balanceData" class="provider-badge" :class="selectedAccount?.payment_provider">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ selectedAccount?.payment_provider === 'stripe' ? 'Stripe' : 'Airwallex' }}
        </span>
      </div>

      <!-- Content Grid - Always visible -->
      <div class="balances-content-grid">
        <!-- Balance Panel -->
        <div class="report-panel balance-panel">
          <div class="report-panel-header">
            <div>
              <div class="report-panel-title">Account Balance</div>
              <div class="report-panel-subtitle">
                <template v-if="balanceData">
                  {{ selectedAccount?.account_name }}
                </template>
                <template v-else-if="selectedAccountId">
                  Loading...
                </template>
                <template v-else>
                  No account selected
                </template>
              </div>
            </div>
          </div>

          <!-- No Account Selected -->
          <div v-if="!selectedAccountId" class="report-empty">
            <div class="report-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="report-empty-title">Select an Account</div>
            <div class="report-empty-text">Choose an account above</div>
          </div>

          <!-- Loading State -->
          <div v-else-if="loading" class="report-loading">
            <div class="report-spinner"></div>
          </div>

          <!-- Balance Display -->
          <div v-else-if="balanceData" class="balance-content">
            <!-- Primary Balance Hero -->
            <div class="balance-hero">
              <div class="balance-hero-label">{{ balanceData.primary_currency }} Balance</div>
              <div class="balance-hero-amount">{{ formatCurrency(balanceData.total_balance, balanceData.primary_currency) }}</div>
              <div class="balance-hero-breakdown">
                <span class="balance-available">
                  <span class="dot available"></span>
                  {{ formatCurrency(balanceData.available_balance, balanceData.primary_currency) }} available
                </span>
                <span class="balance-pending">
                  <span class="dot pending"></span>
                  {{ formatCurrency(balanceData.pending_balance, balanceData.primary_currency) }} pending
                </span>
              </div>
            </div>

            <!-- Currency Breakdown -->
            <div v-if="currencyBalances.length > 1" class="currency-list">
              <div v-for="bal in currencyBalances" :key="bal.currency" class="currency-item">
                <span class="currency-code">{{ bal.currency }}</span>
                <span class="currency-amount">{{ formatCurrency(bal.total, bal.currency) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Transactions Panel -->
        <div class="report-panel transactions-panel">
          <div class="report-panel-header">
            <div>
              <div class="report-panel-title">Recent Transactions</div>
              <div class="report-panel-subtitle">
                <template v-if="selectedAccountId">
                  {{ transactions.length }} transaction{{ transactions.length !== 1 ? 's' : '' }} loaded
                </template>
                <template v-else>
                  No account selected
                </template>
              </div>
            </div>
          </div>

          <!-- No Account Selected -->
          <div v-if="!selectedAccountId" class="report-empty">
            <div class="report-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="report-empty-title">No Transactions</div>
            <div class="report-empty-text">Select an account to view transactions</div>
          </div>

          <!-- Loading State -->
          <div v-else-if="loadingTransactions && transactions.length === 0" class="report-loading">
            <div class="report-spinner"></div>
            <div style="color: var(--text-tertiary);">Loading transactions...</div>
          </div>

          <!-- Empty State -->
          <div v-else-if="transactions.length === 0" class="report-empty">
            <div class="report-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="report-empty-title">
              {{ selectedAccount?.payment_provider === 'stripe' ? 'Balance Only' : 'No Transactions' }}
            </div>
            <div class="report-empty-text">
              {{ selectedAccount?.payment_provider === 'stripe'
                ? 'Transaction history is not available for Stripe accounts'
                : 'No recent wallet transactions found' }}
            </div>
          </div>

          <!-- Transactions Table -->
          <div v-else class="report-table-container">
            <table class="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th class="align-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="txn in transactions" :key="txn.id || txn.transaction_id">
                  <td>
                    <div class="cell-date">
                      <span class="date">{{ formatTxnDate(getTxnDate(txn)).date }}</span>
                      <span class="time">{{ formatTxnDate(getTxnDate(txn)).time }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="txn-type-badge" :class="getTypeClass(txn)">{{ getTransactionType(txn) }}</span>
                  </td>
                  <td>
                    <div class="txn-description">
                      <span class="txn-desc-text">{{ txn.description || txn.customer_email || txn.customer_name || txn.reason || '-' }}</span>
                      <span v-if="txn.sourceId || txn.source_id || txn.id" class="txn-ref">{{ txn.sourceId || txn.source_id || txn.id }}</span>
                      <span v-if="txn.failure_message" class="txn-failure">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        {{ txn.failure_message }}
                      </span>
                    </div>
                  </td>
                  <td class="align-right">
                    <span
                      class="report-amount"
                      :class="{
                        'positive': parseFloat(txn.amount) > 0 && !txn.failure_code,
                        'negative': parseFloat(txn.amount) < 0 || txn.failure_code
                      }"
                    >
                      {{ formatCurrency(Math.abs(parseFloat(txn.amount)), txn.currency) }}
                    </span>
                  </td>
                  <td>
                    <span class="report-status" :class="getStatusClass(txn.status)">
                      {{ txn.status || 'N/A' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Load More -->
            <div v-if="hasMoreTransactions" class="load-more-container">
              <button
                class="reports-btn reports-btn-secondary load-more-btn"
                @click="loadMoreTransactions"
                :disabled="loadingTransactions"
              >
                <span v-if="loadingTransactions" class="btn-spinner"></span>
                {{ loadingTransactions ? 'Loading...' : 'Load More Transactions' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import '@/assets/styles/reports-shared.css';

/* ==========================================
   BALANCES PAGE - Component-specific styles
   ========================================== */

/* Filters section */
.balances-filters {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 24px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.balances-account-select {
  min-width: 280px;
}

.provider-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--accent-primary-dim);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-primary);
  margin-bottom: 2px;
}

.provider-badge.stripe {
  background: rgba(99, 91, 255, 0.15);
  color: #635bff;
}

.provider-badge.airwallex {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-success);
}

/* Override max-width to use full browser width */
.balances .reports-main {
  max-width: none;
}

/* Content Grid - two column layout using full width */
.balances-content-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  align-items: start;
}

/* Panels */
.report-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.balance-panel {
  position: sticky;
  top: 24px;
}

.transactions-panel {
  min-height: 400px;
}

/* Balance Content */
.balance-content {
  padding: 20px;
}

/* Balance Hero */
.balance-hero {
  text-align: center;
  padding: 24px 20px;
  background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-elevated) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.balance-hero-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.balance-hero-amount {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.balance-hero-breakdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 13px;
}

.balance-available,
.balance-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.available {
  background: var(--accent-success);
}

.dot.pending {
  background: var(--accent-warning);
}

/* Currency List */
.currency-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.currency-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
}

.currency-code {
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 3px 8px;
  background: var(--bg-hover);
  border-radius: 4px;
}

.currency-amount {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary);
}

.report-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.report-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.report-panel-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* Loading & Empty states */
.report-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
}

.report-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-subtle);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.report-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
}

.report-empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  color: var(--text-muted);
}

.report-empty-icon svg {
  width: 100%;
  height: 100%;
}

.report-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.report-empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
  max-width: 300px;
  text-align: center;
}


/* Table */
.report-table-container {
  flex: 1;
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.report-table th {
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

.report-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
}

.report-table tbody tr {
  transition: background 0.15s ease;
}

.report-table tbody tr:hover {
  background: var(--bg-hover);
}

.align-right {
  text-align: right;
}

/* Cell styles */
.cell-date {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-date .date {
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
}

.cell-date .time {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* Type badges */
.txn-type-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.txn-type-badge.credit {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-success);
}

.txn-type-badge.debit {
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent-primary);
}

.txn-type-badge.conversion {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-warning);
}

.txn-type-badge.fee {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
}

.txn-type-badge.refund {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
}

.txn-type-badge.default {
  background: var(--bg-surface);
  color: var(--text-tertiary);
}

.txn-description {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 300px;
}

.txn-desc-text {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.txn-ref {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.txn-failure {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  color: var(--accent-danger);
  margin-top: 4px;
  line-height: 1.3;
}

.txn-failure svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.report-amount {
  font-family: var(--font-mono);
  font-weight: 600;
  white-space: nowrap;
}

.report-amount.positive {
  color: var(--accent-success);
}

.report-amount.negative {
  color: var(--accent-danger);
}

/* Status badges */
.report-status {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.report-status.complete {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-success);
}

.report-status.pending {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-warning);
}

.report-status.failed {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-danger);
}

.report-status.default {
  background: var(--bg-surface);
  color: var(--text-tertiary);
}

/* Load More */
.load-more-container {
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
  text-align: center;
}

.load-more-btn {
  width: 100%;
  justify-content: center;
}

/* Button styling */
.reports-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.reports-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reports-btn-secondary {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.reports-btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.reports-btn-primary {
  background: var(--accent-primary);
  color: white;
}

.reports-btn-primary:hover:not(:disabled) {
  background: #6366f1;
}

/* Responsive */
@media (max-width: 1100px) {
  .balances-content-grid {
    grid-template-columns: 1fr;
  }

  .balance-panel {
    position: static;
  }
}

@media (max-width: 768px) {
  .balances-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .balances-account-select {
    min-width: 100%;
  }

  .balance-hero-amount {
    font-size: 28px;
  }

  .report-table {
    font-size: 12px;
  }

  .report-table th,
  .report-table td {
    padding: 10px 12px;
  }
}
</style>
