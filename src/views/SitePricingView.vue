<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAuth } from '@/composables/useAuth'
import { useAlerts } from '@/composables/useAlerts'
import { useFormatting } from '@/composables/useFormatting'
import CustomDropdown from '@/components/CustomDropdown.vue'

const { supabase } = useSupabase()
const { user } = useAuth()
const { success: showSuccess, error: showError } = useAlerts()
const { formatCurrency } = useFormatting()

// State
const loading = ref(true)
const allPricing = ref([])
const allSites = ref([])
const currentTab = ref('all')
const searchQuery = ref('')

// Modal state
const showModal = ref(false)
const editingConfig = ref(null)
const saving = ref(false)

// Form state
const form = ref({
  site_id: '',
  site_name: '',
  percentage_fee: '',
  per_transaction_fee: '',
  refund_fee: '',
  chargeback_fee: '',
  settlement_fee: '',
  daily_limit: '',
  max_ticket_size: '',
  reserve_amount: '',
  gateway_status: 'active',
  notes: ''
})

// Stats
const stats = computed(() => {
  const total = allPricing.value.length
  const active = allPricing.value.filter(p => p.gateway_status === 'active' || !p.gateway_status).length
  const suspended = allPricing.value.filter(p => p.gateway_status === 'suspended').length
  const disabled = allPricing.value.filter(p => p.gateway_status === 'disabled').length
  const withLimits = allPricing.value.filter(p =>
    parseFloat(p.daily_limit) > 0 || parseFloat(p.max_ticket_size) > 0
  ).length
  return { total, active, suspended, disabled, withLimits }
})

// Filtered pricing based on tab and search
const filteredPricing = computed(() => {
  let result = allPricing.value

  // Tab filter
  switch (currentTab.value) {
    case 'limits':
      result = result.filter(p =>
        parseFloat(p.daily_limit) > 0 || parseFloat(p.max_ticket_size) > 0
      )
      break
    case 'suspended':
      result = result.filter(p =>
        p.gateway_status === 'suspended' || p.gateway_status === 'disabled'
      )
      break
  }

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(p =>
      p.site_name?.toLowerCase().includes(query) ||
      p.site_id?.toLowerCase().includes(query)
    )
  }

  return result
})

// Available sites for dropdown (sites that don't have pricing yet)
const availableSites = computed(() => {
  if (editingConfig.value) {
    // When editing, only show the current site
    return [{
      value: editingConfig.value.site_id,
      label: editingConfig.value.site_name || editingConfig.value.site_id
    }]
  }

  const existingIds = new Set(allPricing.value.map(p => p.site_id))
  return allSites.value
    .filter(s => !existingIds.has(s.site_id))
    .map(s => ({ value: s.site_id, label: s.site_name }))
})

// Load unique sites from cpt_data
async function loadSites() {
  try {
    const { data, error } = await supabase
      .from('cpt_data')
      .select('site_id, site_name')
      .not('site_name', 'is', null)

    if (error) throw error

    // Get unique sites
    const siteMap = new Map()
    ;(data || []).forEach(t => {
      if (t.site_name && !siteMap.has(t.site_name)) {
        siteMap.set(t.site_name, t.site_id)
      }
    })

    allSites.value = Array.from(siteMap.entries())
      .map(([name, id]) => ({ site_id: id, site_name: name }))
      .sort((a, b) => a.site_name.localeCompare(b.site_name))
  } catch (e) {
    console.error('Error loading sites:', e)
  }
}

// Load pricing configurations
async function loadPricing() {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('site_pricing')
      .select('*')
      .order('site_name', { ascending: true })

    if (error) throw error
    allPricing.value = data || []
  } catch (e) {
    console.error('Error loading pricing:', e)
    showError('Failed to load pricing configurations')
  } finally {
    loading.value = false
  }
}

// Open modal for adding new config
function openAddModal() {
  editingConfig.value = null
  form.value = {
    site_id: '',
    site_name: '',
    percentage_fee: '',
    per_transaction_fee: '',
    refund_fee: '',
    chargeback_fee: '',
    settlement_fee: '',
    daily_limit: '',
    max_ticket_size: '',
    reserve_amount: '',
    gateway_status: 'active',
    notes: ''
  }
  showModal.value = true
}

// Open modal for editing existing config
function openEditModal(config) {
  editingConfig.value = config
  form.value = {
    site_id: config.site_id,
    site_name: config.site_name,
    percentage_fee: config.percentage_fee || '',
    per_transaction_fee: config.per_transaction_fee || '',
    refund_fee: config.refund_fee || '',
    chargeback_fee: config.chargeback_fee || '',
    settlement_fee: config.settlement_fee || '',
    daily_limit: config.daily_limit || '',
    max_ticket_size: config.max_ticket_size || '',
    reserve_amount: config.reserve_amount || '',
    gateway_status: config.gateway_status || 'active',
    notes: config.notes || ''
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingConfig.value = null
}

// Handle site selection from dropdown
function handleSiteSelect(siteId) {
  form.value.site_id = siteId
  const site = allSites.value.find(s => s.site_id === siteId)
  form.value.site_name = site?.site_name || ''
}

// Save configuration
async function saveConfig() {
  if (!editingConfig.value && !form.value.site_id) {
    showError('Please select a site')
    return
  }

  saving.value = true
  try {
    const payload = {
      percentage_fee: parseFloat(form.value.percentage_fee) || 0,
      per_transaction_fee: parseFloat(form.value.per_transaction_fee) || 0,
      refund_fee: parseFloat(form.value.refund_fee) || 0,
      chargeback_fee: parseFloat(form.value.chargeback_fee) || 0,
      settlement_fee: parseFloat(form.value.settlement_fee) || 0,
      daily_limit: parseFloat(form.value.daily_limit) || 0,
      max_ticket_size: parseFloat(form.value.max_ticket_size) || 0,
      reserve_amount: parseFloat(form.value.reserve_amount) || 0,
      gateway_status: form.value.gateway_status,
      notes: form.value.notes?.trim() || null
    }

    if (editingConfig.value) {
      // Update existing
      payload.updated_by = user.value?.id
      const { error } = await supabase
        .from('site_pricing')
        .update(payload)
        .eq('id', editingConfig.value.id)

      if (error) throw error
      showSuccess('Configuration updated')
    } else {
      // Insert new
      payload.site_id = form.value.site_id
      payload.site_name = form.value.site_name
      payload.created_by = user.value?.id

      const { error } = await supabase
        .from('site_pricing')
        .insert(payload)

      if (error) throw error
      showSuccess('Configuration created')
    }

    closeModal()
    await loadPricing()
  } catch (e) {
    console.error('Error saving configuration:', e)
    showError('Failed to save configuration: ' + e.message)
  } finally {
    saving.value = false
  }
}

// Delete configuration
async function deleteConfig(config) {
  if (!confirm(`Delete pricing configuration for ${config.site_name}? This will also remove transaction limits.`)) {
    return
  }

  try {
    const { error } = await supabase
      .from('site_pricing')
      .delete()
      .eq('id', config.id)

    if (error) throw error
    showSuccess('Configuration deleted')
    await loadPricing()
  } catch (e) {
    console.error('Error deleting configuration:', e)
    showError('Failed to delete configuration')
  }
}

// Format fee display
function formatFee(config) {
  const pct = parseFloat(config.percentage_fee || 0).toFixed(2)
  const fixed = formatCurrency(config.per_transaction_fee || 0)
  return `${pct}% + ${fixed}`
}

// Get status class
function getStatusClass(status) {
  switch (status) {
    case 'active': return 'reports-status-complete'
    case 'suspended': return 'reports-status-pending'
    case 'disabled': return 'reports-status-cancelled'
    default: return 'reports-status-complete'
  }
}

// Format date for last updated column
function formatLastUpdated(config) {
  const dateStr = config.updated_at || config.created_at
  if (!dateStr) return { date: '—', relative: '' }

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Format the date
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })

  // Calculate relative time
  let relative = ''
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      relative = diffMins <= 1 ? 'just now' : `${diffMins}m ago`
    } else {
      relative = `${diffHours}h ago`
    }
  } else if (diffDays === 1) {
    relative = 'yesterday'
  } else if (diffDays < 7) {
    relative = `${diffDays}d ago`
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    relative = `${weeks}w ago`
  } else {
    const months = Math.floor(diffDays / 30)
    relative = months === 1 ? '1mo ago' : `${months}mo ago`
  }

  return { date: formatted, relative }
}

onMounted(async () => {
  await Promise.all([loadSites(), loadPricing()])
})
</script>

<template>
  <div class="reports-page pricing-page">
    <!-- Background Effects -->
    <div class="reports-bg">
      <div class="reports-grid"></div>
      <div class="reports-glow reports-glow-1"></div>
      <div class="reports-glow reports-glow-2"></div>
    </div>

    <!-- Main Content -->
    <div class="reports-main">
      <!-- Top Bar -->
      <div class="reports-topbar">
        <div class="reports-topbar-left">
          <div class="reports-page-title">
            <span class="reports-breadcrumb">Configuration</span>
            <h1>Site Pricing & Limits</h1>
          </div>
        </div>
        <div class="reports-topbar-right">
          <button class="reports-btn reports-btn-primary" @click="openAddModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Add Configuration
          </button>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="reports-stats-row">
        <div class="reports-stat-box">
          <div class="reports-stat-value">{{ stats.total }}</div>
          <div class="reports-stat-label">Total Sites</div>
        </div>
        <div class="reports-stat-box">
          <div class="reports-stat-value reports-stat-success">{{ stats.active }}</div>
          <div class="reports-stat-label">Active</div>
        </div>
        <div class="reports-stat-box">
          <div class="reports-stat-value reports-stat-warning">{{ stats.suspended }}</div>
          <div class="reports-stat-label">Suspended</div>
        </div>
        <div class="reports-stat-box">
          <div class="reports-stat-value">{{ stats.withLimits }}</div>
          <div class="reports-stat-label">With Limits</div>
        </div>
      </div>

      <!-- Tabs & Search -->
      <div class="pricing-controls">
        <div class="reports-tabs">
          <button
            class="reports-tab"
            :class="{ active: currentTab === 'all' }"
            @click="currentTab = 'all'"
          >
            All Sites
            <span class="reports-tab-badge">{{ allPricing.length }}</span>
          </button>
          <button
            class="reports-tab"
            :class="{ active: currentTab === 'limits' }"
            @click="currentTab = 'limits'"
          >
            With Limits
            <span class="reports-tab-badge">{{ stats.withLimits }}</span>
          </button>
          <button
            class="reports-tab"
            :class="{ active: currentTab === 'suspended' }"
            @click="currentTab = 'suspended'"
          >
            Suspended/Disabled
            <span class="reports-tab-badge" :class="{ warning: stats.suspended + stats.disabled > 0 }">
              {{ stats.suspended + stats.disabled }}
            </span>
          </button>
        </div>

        <div class="pricing-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            v-model="searchQuery"
            placeholder="Search sites..."
            class="reports-input"
          >
        </div>
      </div>

      <!-- Table Panel -->
      <div class="reports-panel">
        <div class="reports-panel-header">
          <div>
            <div class="reports-panel-title">Site Configurations</div>
            <div class="reports-panel-subtitle">Processing fees and transaction limits for WooCommerce gateways</div>
          </div>
        </div>

        <div class="reports-table-container">
          <!-- Loading -->
          <div v-if="loading" class="reports-loading">
            <div class="reports-spinner"></div>
            <div>Loading configurations...</div>
          </div>

          <!-- Empty State -->
          <div v-else-if="filteredPricing.length === 0" class="reports-empty">
            <div class="reports-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="reports-empty-title">
              {{ currentTab === 'all' ? 'No Sites Configured' : 'No Sites Match Filter' }}
            </div>
            <div class="reports-empty-text">
              {{ currentTab === 'all'
                ? 'Add configuration for your sites to set processing fees and transaction limits.'
                : 'Try selecting a different filter tab or adjusting your search.'
              }}
            </div>
            <div v-if="currentTab === 'all'" class="reports-empty-action">
              <button class="reports-btn reports-btn-primary" @click="openAddModal">
                Add Configuration
              </button>
            </div>
          </div>

          <!-- Data Table -->
          <table v-else class="reports-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Processing Fee</th>
                <th>Refund / CB Fee</th>
                <th>Daily Limit</th>
                <th>Max Order</th>
                <th>Status</th>
                <th>Limit Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="config in filteredPricing" :key="config.id" @click="openEditModal(config)">
                <td>
                  <div class="reports-cell-customer">
                    <span class="name">{{ config.site_name || config.site_id }}</span>
                    <span class="email">ID: {{ config.site_id }}</span>
                  </div>
                </td>
                <td>
                  <div class="fee-display">
                    <span class="fee-percent">{{ parseFloat(config.percentage_fee || 0).toFixed(2) }}%</span>
                    <span class="fee-fixed">+ {{ formatCurrency(config.per_transaction_fee || 0) }}</span>
                  </div>
                </td>
                <td>
                  <div class="fee-display">
                    <span class="fee-refund">{{ formatCurrency(config.refund_fee || 0) }}</span>
                    <span class="fee-separator">/</span>
                    <span class="fee-chargeback">{{ formatCurrency(config.chargeback_fee || 0) }}</span>
                  </div>
                </td>
                <td>
                  <span v-if="parseFloat(config.daily_limit) > 0" class="limit-badge">
                    {{ formatCurrency(config.daily_limit) }}
                  </span>
                  <span v-else class="no-limit">No limit</span>
                </td>
                <td>
                  <span v-if="parseFloat(config.max_ticket_size) > 0" class="limit-badge">
                    {{ formatCurrency(config.max_ticket_size) }}
                  </span>
                  <span v-else class="no-limit">No limit</span>
                </td>
                <td>
                  <span class="reports-status" :class="getStatusClass(config.gateway_status)">
                    {{ config.gateway_status || 'active' }}
                  </span>
                </td>
                <td>
                  <div v-if="parseFloat(config.daily_limit) > 0" class="reports-cell-date">
                    <span class="date">{{ formatLastUpdated(config).date }}</span>
                    <span class="time">{{ formatLastUpdated(config).relative }}</span>
                  </div>
                  <span v-else class="no-limit">—</span>
                </td>
                <td @click.stop>
                  <div class="action-buttons">
                    <button class="reports-btn reports-btn-secondary btn-sm" @click="openEditModal(config)">
                      Edit
                    </button>
                    <button class="reports-btn reports-btn-danger btn-sm" @click="deleteConfig(config)">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- API Info Banner -->
      <div class="reports-alert reports-alert-info pricing-banner">
        <svg class="reports-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="reports-alert-content">
          <div class="reports-alert-title">Plugin API Endpoint</div>
          <div class="reports-alert-text">
            Transaction limits are served via: <code class="api-code">https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/site-limits?site_id=YOUR_SITE_ID</code>
            <br>WordPress plugins automatically fetch and cache these limits every 5 minutes.
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showModal" class="pricing-modal-overlay" @click.self="closeModal">
          <div class="pricing-modal">
            <div class="pricing-modal-header">
              <h2 class="pricing-modal-title">
                {{ editingConfig ? 'Edit Site Configuration' : 'Add Site Configuration' }}
              </h2>
              <button class="pricing-modal-close" @click="closeModal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>

            <div class="pricing-modal-body">
              <!-- Site Selection -->
              <div class="form-group">
                <label class="form-label">Site</label>
                <CustomDropdown
                  v-if="!editingConfig"
                  :options="availableSites"
                  :model-value="form.site_id"
                  placeholder="Select a site..."
                  class="reports-dropdown"
                  @update:modelValue="handleSiteSelect"
                />
                <input
                  v-else
                  type="text"
                  :value="form.site_name"
                  disabled
                  class="form-input disabled"
                >
                <div class="form-hint">Select from sites in your transaction data</div>
              </div>

              <!-- Transaction Limits Section -->
              <div class="form-section">
                <div class="form-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Transaction Limits
                </div>
                <div class="form-section-hint">Controls synced to WooCommerce plugin via API</div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Daily Transaction Limit</label>
                  <div class="input-group">
                    <span class="input-prefix">$</span>
                    <input
                      type="number"
                      v-model="form.daily_limit"
                      placeholder="0"
                      min="0"
                      step="1"
                      class="form-input"
                    >
                  </div>
                  <div class="form-hint">Maximum daily volume. 0 = no limit</div>
                </div>

                <div class="form-group">
                  <label class="form-label">Max Order Size</label>
                  <div class="input-group">
                    <span class="input-prefix">$</span>
                    <input
                      type="number"
                      v-model="form.max_ticket_size"
                      placeholder="0"
                      min="0"
                      step="1"
                      class="form-input"
                    >
                  </div>
                  <div class="form-hint">Maximum single order. 0 = no limit</div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Reserve Amount</label>
                <div class="input-group">
                  <span class="input-prefix">$</span>
                  <input
                    type="number"
                    v-model="form.reserve_amount"
                    placeholder="0"
                    min="0"
                    step="1"
                    class="form-input"
                  >
                </div>
                <div class="form-hint">Amount held in reserve for this site. 0 = no reserve</div>
              </div>

              <div class="form-group">
                <label class="form-label">Gateway Status</label>
                <select v-model="form.gateway_status" class="form-input form-select">
                  <option value="active">Active — Gateway fully operational</option>
                  <option value="suspended">Suspended — Temporarily disabled</option>
                  <option value="disabled">Disabled — Gateway blocked</option>
                </select>
                <div class="form-hint">Suspended/Disabled will prevent all transactions</div>
              </div>

              <!-- Processing Fees Section -->
              <div class="form-section">
                <div class="form-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Processing Fees
                </div>
                <div class="form-section-hint">Used for settlement report calculations</div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Processing Fee (%)</label>
                  <div class="input-group">
                    <input
                      type="number"
                      v-model="form.percentage_fee"
                      placeholder="2.9"
                      min="0"
                      max="100"
                      step="0.001"
                      class="form-input"
                    >
                    <span class="input-suffix">%</span>
                  </div>
                  <div class="form-hint">Percentage of gross amount</div>
                </div>

                <div class="form-group">
                  <label class="form-label">Per Transaction Fee</label>
                  <div class="input-group">
                    <span class="input-prefix">$</span>
                    <input
                      type="number"
                      v-model="form.per_transaction_fee"
                      placeholder="0.30"
                      min="0"
                      step="0.01"
                      class="form-input"
                    >
                  </div>
                  <div class="form-hint">Fixed fee per transaction</div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Refund Fee</label>
                  <div class="input-group">
                    <span class="input-prefix">$</span>
                    <input
                      type="number"
                      v-model="form.refund_fee"
                      placeholder="15.00"
                      min="0"
                      step="0.01"
                      class="form-input"
                    >
                  </div>
                  <div class="form-hint">Fee charged per refund</div>
                </div>

                <div class="form-group">
                  <label class="form-label">Chargeback Fee</label>
                  <div class="input-group">
                    <span class="input-prefix">$</span>
                    <input
                      type="number"
                      v-model="form.chargeback_fee"
                      placeholder="25.00"
                      min="0"
                      step="0.01"
                      class="form-input"
                    >
                  </div>
                  <div class="form-hint">Fee charged per chargeback</div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Settlement Fee (%)</label>
                <div class="input-group">
                  <input
                    type="number"
                    v-model="form.settlement_fee"
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.001"
                    class="form-input"
                  >
                  <span class="input-suffix">%</span>
                </div>
                <div class="form-hint">Percentage of final payout (after all fees and reserves)</div>
              </div>

              <div class="form-group">
                <label class="form-label">Notes (optional)</label>
                <input
                  type="text"
                  v-model="form.notes"
                  placeholder="Any notes about this configuration..."
                  class="form-input"
                >
              </div>
            </div>

            <div class="pricing-modal-footer">
              <button class="reports-btn reports-btn-secondary" @click="closeModal">Cancel</button>
              <button
                class="reports-btn reports-btn-primary"
                :disabled="saving || (!editingConfig && !form.site_id)"
                @click="saveConfig"
              >
                <span v-if="saving" class="btn-spinner"></span>
                {{ saving ? 'Saving...' : 'Save Configuration' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<!-- Import shared reports styles -->
<style>
@import '@/assets/styles/reports-shared.css';
</style>

<style>
/* Lock body scroll when modal is open */
body:has(.pricing-modal-overlay) {
  overflow: hidden;
}

/* ==========================================
   MODAL STYLES (non-scoped for Teleport)
   ========================================== */

.pricing-modal-overlay {
  --bg-base: #f8fafc;
  --bg-elevated: #ffffff;
  --bg-surface: #f1f5f9;
  --bg-hover: #e2e8f0;
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.1);
  --border-emphasis: rgba(0, 0, 0, 0.15);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #64748b;
  --text-muted: #94a3b8;
  --accent-primary: #818cf8;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

@media (prefers-color-scheme: dark) {
  .pricing-modal-overlay {
    --bg-base: #0a0a0f;
    --bg-elevated: #12121a;
    --bg-surface: #1a1a24;
    --bg-hover: #22222e;
    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-default: rgba(255, 255, 255, 0.1);
    --border-emphasis: rgba(255, 255, 255, 0.15);
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-tertiary: #64748b;
    --text-muted: #475569;
    background: rgba(0, 0, 0, 0.6);
  }
}

.pricing-modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 580px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
}

.pricing-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.pricing-modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.pricing-modal-close {
  width: 32px;
  height: 32px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.pricing-modal-close:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.pricing-modal-body {
  padding: 24px;
  overflow-y: auto;
  max-height: 60vh;
  background: var(--bg-base);
}

.pricing-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

/* Form Styles */
.pricing-modal .form-group {
  margin-bottom: 20px;
}

.pricing-modal .form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.pricing-modal .form-input {
  width: 100%;
  padding: 12px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.pricing-modal .form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
}

.pricing-modal .form-input::placeholder {
  color: var(--text-muted);
}

.pricing-modal .form-input.disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-hover);
}

.pricing-modal .form-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  padding-right: 40px;
}

.pricing-modal .form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.pricing-modal .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.pricing-modal .input-group {
  display: flex;
  align-items: center;
}

.pricing-modal .input-prefix,
.pricing-modal .input-suffix {
  padding: 12px 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  font-size: 14px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

.pricing-modal .input-prefix {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  border-right: none;
}

.pricing-modal .input-suffix {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  border-left: none;
}

.pricing-modal .input-group .form-input {
  border-radius: 0;
}

.pricing-modal .input-group .form-input:only-child {
  border-radius: var(--radius-sm);
}

.pricing-modal .input-prefix + .form-input {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.pricing-modal .form-input:has(+ .input-suffix) {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.pricing-modal .form-section {
  margin: 24px 0 20px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.pricing-modal .form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.pricing-modal .form-section-title svg {
  color: var(--accent-primary);
}

.pricing-modal .form-section-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Button spinner */
.pricing-modal .btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal Transitions */
.modal-enter-active {
  transition: opacity 0.2s ease;
}

.modal-leave-active {
  transition: opacity 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .pricing-modal {
  animation: modalSlideIn 0.2s ease;
}

.modal-leave-active .pricing-modal {
  animation: modalSlideOut 0.15s ease;
}

@keyframes modalSlideIn {
  from {
    transform: scale(0.95) translateY(10px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

@keyframes modalSlideOut {
  from {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
  to {
    transform: scale(0.95) translateY(10px);
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .pricing-modal {
    max-height: 95vh;
  }
  .pricing-modal-body {
    max-height: 70vh;
  }
  .pricing-modal .form-row {
    grid-template-columns: 1fr;
  }
}
</style>

<style scoped>
/* ==========================================
   PRICING PAGE - Component-specific styles
   ========================================== */

/* API Banner */
.pricing-banner {
  margin-top: 24px;
}

.api-code {
  display: inline-block;
  background: var(--bg-surface);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  margin-top: 4px;
  word-break: break-all;
}

/* Controls Row */
.pricing-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.pricing-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
}

.pricing-search svg {
  color: var(--text-muted);
  flex-shrink: 0;
}

.pricing-search .reports-input {
  border: none;
  background: transparent;
  padding: 10px 0;
  min-width: 200px;
}

.pricing-search .reports-input:focus {
  outline: none;
  box-shadow: none;
}

/* Fee Display */
.fee-display {
  display: flex;
  align-items: center;
  gap: 4px;
}

.fee-percent {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.fee-fixed {
  font-size: 12px;
  color: var(--text-tertiary);
}

.fee-refund,
.fee-chargeback {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.fee-separator {
  color: var(--text-muted);
  margin: 0 2px;
}

/* Limit Badge */
.limit-badge {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 500;
}

.no-limit {
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

/* Table row cursor */
.reports-table tbody tr {
  cursor: pointer;
}

/* Responsive */
@media (max-width: 1024px) {
  .pricing-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .reports-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .pricing-search {
    width: 100%;
  }

  .pricing-search .reports-input {
    flex: 1;
  }
}

@media (max-width: 768px) {
  .reports-table {
    font-size: 12px;
  }

  .reports-table th,
  .reports-table td {
    padding: 10px 12px;
  }

  .fee-display {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .action-buttons {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
