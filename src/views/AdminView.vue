<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAuth } from '@/composables/useAuth'
import { useAlerts } from '@/composables/useAlerts'
import DataTable from '@/components/DataTable.vue'
import Modal from '@/components/Modal.vue'

const { supabase } = useSupabase()
const { isAdmin } = useAuth()
const { success: showSuccess, error: showError } = useAlerts()

const loading = ref(false)
const accounts = ref([])
const sites = ref([])
const activeTab = ref('accounts')

// Modal state
const showAccountModal = ref(false)
const showSiteModal = ref(false)
const accountForm = ref({
  account_id: '',
  account_name: '',
  payment_provider: 'stripe',
  is_active: true
})
const siteForm = ref({
  site_id: '',
  site_name: '',
  monthly_limit: 50000,
  is_active: true
})

// Account columns
const accountColumns = [
  { key: 'account_name', label: 'Account Name', sortable: true },
  { key: 'account_id', label: 'Account ID', sortable: true },
  { key: 'payment_provider', label: 'Provider', sortable: true },
  { key: 'is_active', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false }
]

// Site columns
const siteColumns = [
  { key: 'site_name', label: 'Site Name', sortable: true },
  { key: 'site_id', label: 'Site ID', sortable: true },
  { key: 'monthly_limit', label: 'Monthly Limit', sortable: true },
  { key: 'is_active', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false }
]

const accountTableData = computed(() => {
  return accounts.value.map(acc => ({
    ...acc,
    payment_provider: acc.payment_provider?.charAt(0).toUpperCase() + acc.payment_provider?.slice(1),
    is_active: acc.is_active ? 'Active' : 'Inactive'
  }))
})

const siteTableData = computed(() => {
  return sites.value.map(site => ({
    ...site,
    monthly_limit: formatCurrency(site.monthly_limit || 0),
    is_active: site.is_active ? 'Active' : 'Inactive'
  }))
})

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(amount)
}

async function loadAccounts() {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .order('account_name')

    if (error) throw error
    accounts.value = data || []
  } catch (err) {
    console.error('Error loading accounts:', err)
    showError('Error loading accounts')
  }
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
    showError('Error loading sites')
  }
}

async function saveAccount() {
  loading.value = true
  try {
    const { error } = await supabase
      .from('payment_accounts')
      .upsert(accountForm.value)

    if (error) throw error

    showSuccess('Account saved successfully')
    showAccountModal.value = false
    resetAccountForm()
    loadAccounts()
  } catch (err) {
    console.error('Error saving account:', err)
    showError('Error saving account')
  } finally {
    loading.value = false
  }
}

async function saveSite() {
  loading.value = true
  try {
    const { error } = await supabase
      .from('cpt_site_accounts')
      .upsert(siteForm.value)

    if (error) throw error

    showSuccess('Site saved successfully')
    showSiteModal.value = false
    resetSiteForm()
    loadSites()
  } catch (err) {
    console.error('Error saving site:', err)
    showError('Error saving site')
  } finally {
    loading.value = false
  }
}

function editAccount(account) {
  accountForm.value = { ...account }
  showAccountModal.value = true
}

function editSite(site) {
  siteForm.value = { ...site }
  showSiteModal.value = true
}

function resetAccountForm() {
  accountForm.value = {
    account_id: '',
    account_name: '',
    payment_provider: 'stripe',
    is_active: true
  }
}

function resetSiteForm() {
  siteForm.value = {
    site_id: '',
    site_name: '',
    monthly_limit: 50000,
    is_active: true
  }
}

onMounted(() => {
  loadAccounts()
  loadSites()
})
</script>

<template>
  <div class="main-content">
    <div class="container">
      <h1 class="page-title">Admin Settings</h1>
      <p class="page-subtitle">Manage payment accounts and site configurations</p>

      <div v-if="!isAdmin" class="alert alert-error">
        You do not have permission to access this page.
      </div>

      <template v-else>
        <!-- Tabs -->
        <div class="tabs">
          <button
            class="tab"
            :class="{ active: activeTab === 'accounts' }"
            @click="activeTab = 'accounts'"
          >
            Payment Accounts
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'sites' }"
            @click="activeTab = 'sites'"
          >
            Site Accounts
          </button>
        </div>

        <!-- Accounts Tab -->
        <div v-show="activeTab === 'accounts'">
          <div class="section-header">
            <h2 class="section-title">Payment Accounts</h2>
            <button class="btn btn-primary" @click="resetAccountForm(); showAccountModal = true">
              Add Account
            </button>
          </div>

          <DataTable
            :columns="accountColumns"
            :data="accountTableData"
            :loading="loading"
            empty-message="No accounts found"
          >
            <template #cell-is_active="{ value }">
              <span class="badge" :class="value === 'Active' ? 'badge-success' : 'badge-neutral'">
                {{ value }}
              </span>
            </template>
            <template #cell-actions="{ row }">
              <button class="btn btn-secondary btn-sm" @click="editAccount(row)">Edit</button>
            </template>
          </DataTable>
        </div>

        <!-- Sites Tab -->
        <div v-show="activeTab === 'sites'">
          <div class="section-header">
            <h2 class="section-title">Site Accounts</h2>
            <button class="btn btn-primary" @click="resetSiteForm(); showSiteModal = true">
              Add Site
            </button>
          </div>

          <DataTable
            :columns="siteColumns"
            :data="siteTableData"
            :loading="loading"
            empty-message="No sites found"
          >
            <template #cell-is_active="{ value }">
              <span class="badge" :class="value === 'Active' ? 'badge-success' : 'badge-neutral'">
                {{ value }}
              </span>
            </template>
            <template #cell-actions="{ row }">
              <button class="btn btn-secondary btn-sm" @click="editSite(row)">Edit</button>
            </template>
          </DataTable>
        </div>

        <!-- Account Modal -->
        <Modal v-model="showAccountModal" title="Payment Account">
          <form @submit.prevent="saveAccount">
            <div class="form-group">
              <label class="form-label">Account ID *</label>
              <input type="text" class="form-input" v-model="accountForm.account_id" required>
            </div>
            <div class="form-group">
              <label class="form-label">Account Name *</label>
              <input type="text" class="form-input" v-model="accountForm.account_name" required>
            </div>
            <div class="form-group">
              <label class="form-label">Payment Provider</label>
              <select class="form-select" v-model="accountForm.payment_provider">
                <option value="stripe">Stripe</option>
                <option value="airwallex">Airwallex</option>
              </select>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="accountForm.is_active">
                Active
              </label>
            </div>
          </form>
          <template #footer>
            <button class="btn btn-secondary" @click="showAccountModal = false">Cancel</button>
            <button class="btn btn-primary" @click="saveAccount" :disabled="loading">
              {{ loading ? 'Saving...' : 'Save Account' }}
            </button>
          </template>
        </Modal>

        <!-- Site Modal -->
        <Modal v-model="showSiteModal" title="Site Account">
          <form @submit.prevent="saveSite">
            <div class="form-group">
              <label class="form-label">Site ID *</label>
              <input type="text" class="form-input" v-model="siteForm.site_id" required>
            </div>
            <div class="form-group">
              <label class="form-label">Site Name *</label>
              <input type="text" class="form-input" v-model="siteForm.site_name" required>
            </div>
            <div class="form-group">
              <label class="form-label">Monthly Limit ($)</label>
              <input type="number" class="form-input" v-model="siteForm.monthly_limit" step="1000">
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="siteForm.is_active">
                Active
              </label>
            </div>
          </form>
          <template #footer>
            <button class="btn btn-secondary" @click="showSiteModal = false">Cancel</button>
            <button class="btn btn-primary" @click="saveSite" :disabled="loading">
              {{ loading ? 'Saving...' : 'Save Site' }}
            </button>
          </template>
        </Modal>
      </template>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
}

.form-select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  background: var(--color-white);
  color: var(--color-text);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
}

@media (max-width: 768px) {
  .container {
    padding: 20px 16px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
