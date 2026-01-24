<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { useAuth } from '@/composables/useAuth'
import { useFormatting } from '@/composables/useFormatting'
import { useAlerts } from '@/composables/useAlerts'

const { supabase } = useSupabase()
const { user } = useAuth()
const { formatCurrency } = useFormatting()
const { error: showError, success: showSuccess } = useAlerts()

const SUPABASE_URL = 'https://hzdybwclwqkcobpwxzoo.supabase.co'

// State
const loading = ref(true)
const loadingSite = ref(false)
const sites = ref([])
const currentSite = ref('')
const currentSiteData = ref(null)
const healthData = ref(null)
const apiResponse = ref(null)
const refreshingApi = ref(false)

// Filters
const sortBy = ref('name') // 'name', 'active', 'inactive'
const searchQuery = ref('')

// Inline editing
const editingField = ref(null) // 'dailyLimit' or 'maxOrder'
const editValue = ref('')
const saving = ref(false)

// Computed
const filteredSites = computed(() => {
  let result = [...sites.value]

  // Filter by search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(s =>
      (s.site_name || '').toLowerCase().includes(query) ||
      (s.site_id || '').toLowerCase().includes(query)
    )
  }

  // Sort
  if (sortBy.value === 'active') {
    result = result.filter(s => s.is_active !== false)
  } else if (sortBy.value === 'inactive') {
    result = result.filter(s => s.is_active === false)
  }

  return result.sort((a, b) => (a.site_name || '').localeCompare(b.site_name || ''))
})

const stats = computed(() => {
  const total = sites.value.length
  const active = sites.value.filter(s => s.is_active !== false).length
  const inactive = sites.value.filter(s => s.is_active === false).length
  return { total, active, inactive }
})

// Track sites with health issues
const healthDataMap = ref(new Map())
const sitesWithIssues = computed(() => {
  let count = 0
  healthDataMap.value.forEach((health) => {
    if (health?.diagnostic_issues?.length > 0 ||
        health?.has_ssl === false ||
        health?.has_curl === false ||
        health?.can_reach_api === false) {
      count++
    }
  })
  return count
})

const pricing = computed(() => currentSiteData.value?.pricing || null)

const gatewayStatus = computed(() => {
  if (pricing.value?.gateway_status) return pricing.value.gateway_status
  if (apiResponse.value?.status) return apiResponse.value.status
  return 'active'
})

const dailyLimit = computed(() => {
  if (apiResponse.value?.success) return apiResponse.value.daily_limit
  return pricing.value?.daily_limit || 0
})

const maxTicket = computed(() => {
  if (apiResponse.value?.success) return apiResponse.value.max_ticket_size
  return pricing.value?.max_ticket_size || 0
})

const diagnosticIssues = computed(() => {
  let issues = healthData.value?.diagnostic_issues || []
  if (typeof issues === 'string') {
    try { issues = JSON.parse(issues) } catch (e) { issues = [] }
  }
  return issues
})

// Helpers
function timeAgo(dateStr) {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function formatDate(dateStr) {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}

function getIssueInfo(issueCode) {
  const issues = {
    'NO_SSL': { icon: '🔓', label: 'No HTTPS/SSL' },
    'NO_CURL': { icon: '⚙️', label: 'cURL Missing' },
    'FIREWALL': { icon: '🛡️', label: 'Firewall Blocking' },
    'NO_OPENSSL': { icon: '🔐', label: 'OpenSSL Missing' },
    'POSTBACK_FAIL': { icon: '📬', label: 'Postbacks Failing' },
    'API_TIMEOUT': { icon: '⏱️', label: 'API Timeout' },
    'API_ERROR': { icon: '❌', label: 'API Error' }
  }
  return issues[issueCode] || { icon: '⚠️', label: issueCode }
}

function getPostbackSuccessRate() {
  const success = healthData.value?.postback_success_count || 0
  const errors = healthData.value?.postback_error_count || 0
  const total = success + errors
  if (total === 0) return null
  return Math.round((success / total) * 100)
}

// Load sites
async function loadSites() {
  loading.value = true
  try {
    const { data: siteAccounts, error: accountsError } = await supabase
      .from('cpt_site_accounts')
      .select('site_id, site_name, cp_name, is_active')
      .order('site_name', { ascending: true })

    if (accountsError) console.error('Error loading site accounts:', accountsError)

    const { data: sitePricing, error: pricingError } = await supabase
      .from('site_pricing')
      .select('*')

    if (pricingError) console.error('Error loading site pricing:', pricingError)

    const sitesMap = new Map()

    if (siteAccounts) {
      siteAccounts.forEach(site => {
        sitesMap.set(site.site_id, {
          site_id: site.site_id,
          site_name: site.site_name || site.site_id,
          cp_name: site.cp_name,
          is_active: site.is_active,
          pricing: null
        })
      })
    }

    if (sitePricing) {
      sitePricing.forEach(p => {
        if (sitesMap.has(p.site_id)) {
          sitesMap.get(p.site_id).pricing = p
        } else {
          sitesMap.set(p.site_id, {
            site_id: p.site_id,
            site_name: p.site_name || p.site_id,
            cp_name: null,
            is_active: true,
            pricing: p
          })
        }
      })
    }

    sites.value = Array.from(sitesMap.values()).sort((a, b) =>
      (a.site_name || '').localeCompare(b.site_name || '')
    )

    // Load all health data for issue counting
    const { data: allHealth, error: healthError } = await supabase
      .from('plugin_site_health')
      .select('site_id, diagnostic_issues, has_ssl, has_curl, can_reach_api')

    if (!healthError && allHealth) {
      const newMap = new Map()
      allHealth.forEach(h => newMap.set(h.site_id, h))
      healthDataMap.value = newMap
    }
  } catch (e) {
    console.error('Error loading sites:', e)
    showError('Failed to load sites')
  } finally {
    loading.value = false
  }
}

// Select site
function selectSite(siteId) {
  currentSite.value = siteId
  loadSiteData(siteId)
}

// Load site data
async function loadSiteData(siteId) {
  if (!siteId) {
    currentSiteData.value = null
    healthData.value = null
    apiResponse.value = null
    return
  }

  loadingSite.value = true

  try {
    const site = sites.value.find(s => s.site_id === siteId)
    currentSiteData.value = site

    const { data: health, error: healthError } = await supabase
      .from('plugin_site_health')
      .select('*')
      .eq('site_id', siteId)
      .single()

    if (healthError && healthError.code !== 'PGRST116') {
      console.error('Error loading health data:', healthError)
    }

    healthData.value = health
    apiResponse.value = await fetchSiteLimits(siteId)

  } catch (e) {
    console.error('Error loading site data:', e)
    showError('Failed to load site data')
  } finally {
    loadingSite.value = false
  }
}

async function fetchSiteLimits(siteId) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/plugin-site-limits?site_id=${encodeURIComponent(siteId)}`)
    return await response.json()
  } catch (e) {
    console.error('API fetch error:', e)
    return { success: false, error: e.message }
  }
}

async function refreshApiResponse() {
  if (!currentSite.value || refreshingApi.value) return
  refreshingApi.value = true
  try {
    apiResponse.value = await fetchSiteLimits(currentSite.value)
  } finally {
    refreshingApi.value = false
  }
}

// Inline editing functions
function startEdit(field) {
  editingField.value = field
  if (field === 'dailyLimit') {
    editValue.value = parseFloat(dailyLimit.value) || ''
  } else if (field === 'maxOrder') {
    editValue.value = parseFloat(maxTicket.value) || ''
  }
  // Focus input after DOM update
  setTimeout(() => {
    const input = document.querySelector('.plugin-edit-input')
    if (input) input.focus()
  }, 10)
}

function cancelEdit() {
  editingField.value = null
  editValue.value = ''
}

async function saveEdit() {
  if (!currentSite.value || saving.value) return

  saving.value = true
  try {
    const field = editingField.value
    const value = parseFloat(editValue.value) || 0

    const updateData = {}
    if (field === 'dailyLimit') {
      updateData.daily_limit = value
    } else if (field === 'maxOrder') {
      updateData.max_ticket_size = value
    }

    const { error } = await supabase
      .from('site_pricing')
      .update(updateData)
      .eq('site_id', currentSite.value)

    if (error) {
      console.error('Error saving:', error)
      showError('Failed to save changes')
    } else {
      showSuccess('Saved successfully')
      // Update local data
      if (currentSiteData.value?.pricing) {
        if (field === 'dailyLimit') {
          currentSiteData.value.pricing.daily_limit = value
        } else if (field === 'maxOrder') {
          currentSiteData.value.pricing.max_ticket_size = value
        }
      }
      // Refresh API response
      apiResponse.value = await fetchSiteLimits(currentSite.value)
    }
  } catch (e) {
    console.error('Save error:', e)
    showError('Failed to save changes')
  } finally {
    saving.value = false
    editingField.value = null
    editValue.value = ''
  }
}

function handleEditKeydown(e) {
  if (e.key === 'Enter') {
    saveEdit()
  } else if (e.key === 'Escape') {
    cancelEdit()
  }
}

onMounted(async () => {
  await loadSites()
})
</script>

<template>
  <div class="reports-page plugin-admin">
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
            <span class="reports-breadcrumb">Admin</span>
            <h1>Plugin Admin</h1>
          </div>
        </div>
      </header>

      <!-- Metrics Row -->
      <div class="reports-stats-row">
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ stats.total }}</span>
          <span class="reports-stat-label">Total Sites</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value reports-stat-success">{{ stats.active }}</span>
          <span class="reports-stat-label">Active</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value" :class="{ 'reports-stat-warning': stats.inactive > 0 }">{{ stats.inactive }}</span>
          <span class="reports-stat-label">Inactive</span>
        </div>
        <div class="reports-stat-box">
          <span class="reports-stat-value">{{ sitesWithIssues }}</span>
          <span class="reports-stat-label">With Issues</span>
        </div>
      </div>

      <!-- Split Panel Layout -->
      <div class="plugin-layout">
        <!-- Left Panel: Site List -->
        <div class="plugin-sidebar">
          <!-- Search & Filter -->
          <div class="plugin-sidebar-header">
            <div class="plugin-search">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                v-model="searchQuery"
                placeholder="Search sites..."
              />
            </div>
            <div class="plugin-filter-tabs">
              <button
                :class="{ active: sortBy === 'name' }"
                @click="sortBy = 'name'"
              >
                All ({{ stats.total }})
              </button>
              <button
                :class="{ active: sortBy === 'active' }"
                @click="sortBy = 'active'"
              >
                Active ({{ stats.active }})
              </button>
              <button
                :class="{ active: sortBy === 'inactive' }"
                @click="sortBy = 'inactive'"
              >
                Inactive ({{ stats.inactive }})
              </button>
            </div>
          </div>

          <!-- Site List -->
          <div class="plugin-site-list">
            <div v-if="loading" class="plugin-list-loading">
              <div class="plugin-spinner"></div>
            </div>
            <div v-else-if="filteredSites.length === 0" class="plugin-list-empty">
              No sites found
            </div>
            <div
              v-else
              v-for="site in filteredSites"
              :key="site.site_id"
              class="plugin-site-item"
              :class="{ active: currentSite === site.site_id, inactive: site.is_active === false }"
              @click="selectSite(site.site_id)"
            >
              <div class="plugin-site-item-main">
                <span class="plugin-site-item-name">{{ site.site_name }}</span>
                <span class="plugin-site-item-status" :class="site.is_active !== false ? 'active' : 'inactive'"></span>
              </div>
              <span class="plugin-site-item-id">{{ site.site_id }}</span>
            </div>
          </div>
        </div>

        <!-- Right Panel: Details -->
        <div class="plugin-detail">
          <!-- Empty State -->
          <div v-if="!currentSite" class="plugin-detail-empty">
            <div class="plugin-empty-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div class="plugin-empty-title">Select a Site</div>
            <div class="plugin-empty-text">Choose a site from the list to view its plugin configuration</div>
          </div>

          <!-- Loading State -->
          <div v-else-if="loadingSite" class="plugin-detail-loading">
            <div class="plugin-spinner"></div>
            <span>Loading site data...</span>
          </div>

          <!-- Site Details -->
          <div v-else class="plugin-detail-content">
            <!-- Site Header -->
            <div class="plugin-detail-header">
              <div class="plugin-detail-title">
                <h2>{{ healthData?.site_name || currentSiteData?.site_name || 'Unknown Site' }}</h2>
                <span class="plugin-detail-id">{{ currentSiteData?.site_id }}</span>
              </div>
              <span class="plugin-status-badge" :class="gatewayStatus">
                <span class="plugin-status-dot"></span>
                {{ gatewayStatus.charAt(0).toUpperCase() + gatewayStatus.slice(1) }}
              </span>
            </div>

            <div v-if="healthData?.site_url" class="plugin-detail-url">
              <a :href="healthData.site_url" target="_blank">{{ healthData.site_url }}</a>
            </div>

            <!-- Health Report Section -->
            <section class="plugin-section" v-if="healthData">
              <div class="plugin-section-header">
                <div class="plugin-section-title">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Health Report
                </div>
                <div class="plugin-section-meta">{{ timeAgo(healthData.updated_at) }}</div>
              </div>

              <!-- Diagnostic Issues -->
              <div v-if="diagnosticIssues.length > 0" class="plugin-alert plugin-alert-danger">
                <div class="plugin-alert-badges">
                  <span v-for="issue in diagnosticIssues" :key="issue" class="plugin-issue-badge">
                    {{ getIssueInfo(issue).icon }} {{ getIssueInfo(issue).label }}
                  </span>
                </div>
              </div>

              <!-- Diagnostics Grid -->
              <div class="plugin-grid">
                <div class="plugin-card" :class="{ success: healthData.has_ssl === true, danger: healthData.has_ssl === false }">
                  <div class="plugin-card-label">SSL</div>
                  <div class="plugin-card-value">{{ healthData.has_ssl === true ? '✓' : healthData.has_ssl === false ? '✗' : '?' }}</div>
                </div>
                <div class="plugin-card" :class="{ success: healthData.has_curl === true, danger: healthData.has_curl === false }">
                  <div class="plugin-card-label">cURL</div>
                  <div class="plugin-card-value">{{ healthData.has_curl === true ? '✓' : healthData.has_curl === false ? '✗' : '?' }}</div>
                </div>
                <div class="plugin-card" :class="{ success: healthData.can_reach_api === true && !healthData.firewall_issue, danger: healthData.firewall_issue || healthData.can_reach_api === false }">
                  <div class="plugin-card-label">Connectivity</div>
                  <div class="plugin-card-value">{{ healthData.can_reach_api === true && !healthData.firewall_issue ? '✓' : healthData.firewall_issue || healthData.can_reach_api === false ? '✗' : '?' }}</div>
                </div>
                <div class="plugin-card" :class="{ success: healthData.api_status === 'ok', danger: healthData.api_status === 'error' }">
                  <div class="plugin-card-label">API</div>
                  <div class="plugin-card-value">{{ healthData.api_status === 'ok' ? '✓' : healthData.api_status === 'error' ? '✗' : '?' }}</div>
                </div>
              </div>

              <!-- Postback Stats -->
              <div class="plugin-stats-row">
                <div class="plugin-stat">
                  <span class="plugin-stat-value">{{ healthData.postback_success_count || 0 }}</span>
                  <span class="plugin-stat-label">Postbacks OK</span>
                </div>
                <div class="plugin-stat">
                  <span class="plugin-stat-value danger">{{ healthData.postback_error_count || 0 }}</span>
                  <span class="plugin-stat-label">Failed</span>
                </div>
                <div class="plugin-stat">
                  <span class="plugin-stat-value">{{ getPostbackSuccessRate() !== null ? getPostbackSuccessRate() + '%' : '—' }}</span>
                  <span class="plugin-stat-label">Success Rate</span>
                </div>
              </div>

              <!-- Environment Info -->
              <div class="plugin-env-grid">
                <div class="plugin-env-item">
                  <span class="plugin-env-label">Plugin</span>
                  <span class="plugin-env-value">{{ healthData.plugin_version || '?' }}</span>
                </div>
                <div class="plugin-env-item">
                  <span class="plugin-env-label">WordPress</span>
                  <span class="plugin-env-value">{{ healthData.wordpress_version || '?' }}</span>
                </div>
                <div class="plugin-env-item">
                  <span class="plugin-env-label">WooCommerce</span>
                  <span class="plugin-env-value">{{ healthData.woocommerce_version || '?' }}</span>
                </div>
                <div class="plugin-env-item">
                  <span class="plugin-env-label">PHP</span>
                  <span class="plugin-env-value">{{ healthData.php_version || '?' }}</span>
                </div>
              </div>
            </section>

            <!-- No Health Data -->
            <div v-else class="plugin-alert plugin-alert-warning">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <div>
                <div class="plugin-alert-title">No Health Report</div>
                <div class="plugin-alert-text">This site hasn't sent a health report yet.</div>
              </div>
            </div>

            <!-- Gateway Configuration -->
            <section class="plugin-section">
              <div class="plugin-section-header">
                <div class="plugin-section-title">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  Gateway Config
                </div>
              </div>

              <div class="plugin-config-grid">
                <div class="plugin-config-item plugin-config-editable" @click="editingField !== 'dailyLimit' && startEdit('dailyLimit')">
                  <span class="plugin-config-label">Daily Limit</span>
                  <template v-if="editingField === 'dailyLimit'">
                    <input
                      type="number"
                      class="plugin-edit-input"
                      v-model="editValue"
                      @keydown="handleEditKeydown"
                      @blur="saveEdit"
                      placeholder="0 for unlimited"
                    />
                  </template>
                  <template v-else>
                    <span class="plugin-config-value">
                      {{ parseFloat(dailyLimit) > 0 ? formatCurrency(dailyLimit) : 'Unlimited' }}
                      <svg class="plugin-edit-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                      </svg>
                    </span>
                  </template>
                </div>
                <div class="plugin-config-item plugin-config-editable" @click="editingField !== 'maxOrder' && startEdit('maxOrder')">
                  <span class="plugin-config-label">Max Order</span>
                  <template v-if="editingField === 'maxOrder'">
                    <input
                      type="number"
                      class="plugin-edit-input"
                      v-model="editValue"
                      @keydown="handleEditKeydown"
                      @blur="saveEdit"
                      placeholder="0 for unlimited"
                    />
                  </template>
                  <template v-else>
                    <span class="plugin-config-value">
                      {{ parseFloat(maxTicket) > 0 ? formatCurrency(maxTicket) : 'Unlimited' }}
                      <svg class="plugin-edit-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                      </svg>
                    </span>
                  </template>
                </div>
              </div>
            </section>

            <!-- Processing Fees -->
            <section v-if="pricing" class="plugin-section">
              <div class="plugin-section-header">
                <div class="plugin-section-title">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Fees
                </div>
              </div>

              <div class="plugin-config-grid">
                <div class="plugin-config-item">
                  <span class="plugin-config-label">Processing</span>
                  <span class="plugin-config-value">{{ parseFloat(pricing.percentage_fee || 0).toFixed(2) }}%</span>
                </div>
                <div class="plugin-config-item">
                  <span class="plugin-config-label">Per Txn</span>
                  <span class="plugin-config-value">{{ formatCurrency(pricing.per_transaction_fee || 0) }}</span>
                </div>
                <div class="plugin-config-item">
                  <span class="plugin-config-label">Refund</span>
                  <span class="plugin-config-value">{{ formatCurrency(pricing.refund_fee || 0) }}</span>
                </div>
                <div class="plugin-config-item">
                  <span class="plugin-config-label">Chargeback</span>
                  <span class="plugin-config-value">{{ formatCurrency(pricing.chargeback_fee || 0) }}</span>
                </div>
              </div>
            </section>

            <!-- API Response -->
            <section class="plugin-section">
              <div class="plugin-section-header">
                <div class="plugin-section-title">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                  </svg>
                  API Response
                </div>
                <button class="plugin-refresh-btn" @click="refreshApiResponse" :disabled="refreshingApi">
                  <svg :class="{ spinning: refreshingApi }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </button>
              </div>

              <div class="plugin-code-block">
                <pre>{{ JSON.stringify(apiResponse, null, 2) }}</pre>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@import '@/assets/styles/reports-shared.css';
</style>

<style scoped>
/* Split Panel Layout */
.plugin-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  min-height: calc(100vh - 180px);
}

/* Sidebar */
.plugin-sidebar {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.plugin-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.plugin-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
}

.plugin-search svg {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.plugin-search input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.plugin-search input::placeholder {
  color: var(--text-tertiary);
}

.plugin-filter-tabs {
  display: flex;
  gap: 4px;
}

.plugin-filter-tabs button {
  flex: 1;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.plugin-filter-tabs button:hover {
  background: var(--bg-hover);
}

.plugin-filter-tabs button.active {
  background: var(--accent-primary-dim);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* Site List */
.plugin-site-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.plugin-list-loading,
.plugin-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-tertiary);
  font-size: 14px;
}

.plugin-site-item {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 4px;
}

.plugin-site-item:hover {
  background: var(--bg-hover);
}

.plugin-site-item.active {
  background: var(--accent-primary-dim);
}

.plugin-site-item.inactive {
  opacity: 0.6;
}

.plugin-site-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plugin-site-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-site-item-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.plugin-site-item-status.active {
  background: var(--accent-success);
}

.plugin-site-item-status.inactive {
  background: var(--text-tertiary);
}

.plugin-site-item-id {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  margin-top: 4px;
  display: block;
}

/* Detail Panel */
.plugin-detail {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.plugin-detail-empty,
.plugin-detail-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
  color: var(--text-secondary);
  gap: 12px;
}

.plugin-empty-icon {
  width: 64px;
  height: 64px;
  background: var(--bg-surface);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.plugin-empty-icon svg {
  width: 32px !important;
  height: 32px !important;
  color: var(--text-tertiary);
}

.plugin-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.plugin-empty-text {
  font-size: 14px;
  color: var(--text-tertiary);
}

.plugin-detail-content {
  height: 100%;
  overflow-y: auto;
}

/* Detail Header */
.plugin-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
  color: white;
}

.plugin-detail-title h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.plugin-detail-id {
  font-size: 12px;
  font-family: var(--font-mono);
  opacity: 0.8;
  margin-top: 4px;
  display: block;
}

.plugin-detail-url {
  padding: 12px 24px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.plugin-detail-url a {
  font-size: 13px;
  color: var(--accent-primary);
  text-decoration: none;
}

.plugin-detail-url a:hover {
  text-decoration: underline;
}

/* Status Badge */
.plugin-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.plugin-status-badge.active {
  background: var(--accent-success-dim);
  color: var(--accent-success);
}

.plugin-status-badge.suspended {
  background: var(--accent-danger-dim);
  color: var(--accent-danger);
}

.plugin-status-badge.disabled {
  background: var(--accent-warning-dim);
  color: var(--accent-warning);
}

.plugin-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

/* Section */
.plugin-section {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.plugin-section:last-child {
  border-bottom: none;
}

.plugin-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.plugin-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.plugin-section-title svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--accent-primary);
}

/* Ensure all SVGs have explicit sizing */
.plugin-admin svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.plugin-section-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Compact Grid */
.plugin-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.plugin-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: center;
}

.plugin-card.success {
  border-color: var(--accent-success);
  background: var(--accent-success-dim);
}

.plugin-card.danger {
  border-color: var(--accent-danger);
  background: var(--accent-danger-dim);
}

.plugin-card-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.plugin-card-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.plugin-card.success .plugin-card-value { color: var(--accent-success); }
.plugin-card.danger .plugin-card-value { color: var(--accent-danger); }

/* Stats Row */
.plugin-stats-row {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.plugin-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.plugin-stat-value.danger {
  color: var(--accent-danger);
}

.plugin-stat-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* Environment Grid */
.plugin-env-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.plugin-env-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
}

.plugin-env-label {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.plugin-env-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

/* Config Grid */
.plugin-config-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.plugin-config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}

.plugin-config-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.plugin-config-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Editable config items */
.plugin-config-editable {
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.plugin-config-editable:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.plugin-config-editable:hover .plugin-edit-icon {
  opacity: 1;
}

.plugin-edit-icon {
  width: 14px !important;
  height: 14px !important;
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.plugin-edit-input {
  width: 120px;
  padding: 6px 10px;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: var(--bg-elevated);
  border: 2px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  outline: none;
}

.plugin-edit-input:focus {
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

/* Alert */
.plugin-alert {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  align-items: center;
}

.plugin-alert > svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.plugin-alert-danger {
  background: var(--accent-danger-dim);
  border: 1px solid var(--accent-danger);
}

.plugin-alert-warning {
  background: var(--accent-warning-dim);
  border: 1px solid var(--accent-warning);
}

.plugin-alert-warning > svg {
  width: 20px !important;
  height: 20px !important;
  color: var(--accent-warning);
}

.plugin-alert-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-issue-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.2);
  border-radius: 100px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-danger);
}

.plugin-alert-title {
  font-weight: 600;
  color: var(--accent-warning);
  margin-bottom: 2px;
}

.plugin-alert-text {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Refresh Button */
.plugin-refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.plugin-refresh-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.plugin-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plugin-refresh-btn svg {
  width: 16px !important;
  height: 16px !important;
}

.plugin-refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

/* Code Block */
.plugin-code-block {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.plugin-code-block pre {
  margin: 0;
  padding: 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
}

/* Spinner */
.plugin-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 900px) {
  .plugin-layout {
    grid-template-columns: 1fr;
  }

  .plugin-sidebar {
    max-height: 300px;
  }

  .plugin-grid,
  .plugin-env-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
